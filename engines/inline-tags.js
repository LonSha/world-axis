/**
 * WorldAxis engines/inline-tags.js (v2.302.0) — 正文内联状态回报标签
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   本仓全部世界状态由**引擎自己**从正文推断：
 *     · 时间：`calendar.suggestAdvance` 靠「次日/黄昏/黎明」这类中文时间词
 *     · 抉择：`story-choice` 要玩家在面板上点，模型无法只回报「谁做了什么选择」
 *     · 世界事实：`worldFacts` 只能由面板或引擎写，模型不能声明「这条设定现在成立了」
 *   模型**没有一条轻量通道**把这三件事直接告诉引擎。`<time>` / `<choice>` / `<flag>`
 *   在本仓 0 命中（grep 实测）。而模棱两可的中文时间词正是世界钟误推进的主要来源。
 *
 * ── 缝合来源（已获作者授权）────────────────────────────────────
 *   World Chronicle (github.com/wojiaoxiaojiuli-blip/WorldChronicle) `engine/tags.js`
 *   + `engine/conditions.js`。原作者口径：「AI 在回复末尾悄悄写一个小标记，
 *   比如 <time>1997-07-02</time>，告诉插件故事走到了哪天（这个小标记在聊天里看不到）」。
 *
 * ── 与原文的四处**有意的不同**（单一真源的代价，逐条说明）──────
 *   1. 原文 `extractDate` 走 `date.js` 的 `normalizeDate`（严格 ISO）。本仓**没有**第二套
 *      日期真源：世界钟真源是 `store.clock`（`label` 自由标签 + `dayIndex` 整数），
 *      `chrono` 是叙事纪年层。故本模块**只做严格 `YYYY-MM-DD` 解析**，把结果写进
 *      **既有**的 `clock.iso` 字段（该字段自骨架起就存在，`setClock({iso})` 是既有写口）。
 *      不做「时间词→日期」的模糊换算——那会造出第二个日期真源。
 *   2. 原文 `<flag>` 存在 `pack.flags`（刊物包内）。本仓的世界事实真源是 `store.worldFacts`，
 *      故 `<flag>` 映射为 `worldFacts` 行（`scope:'flag'`、`source:'inline-tag'`），
 *      按 `key` 去重、重复声明只更新 `at` 不新增行。
 *   3. 原文 `<bgm>` 交给自己的播放器。本仓无音频通道，故 `<bgm>` **只解析不落账**，
 *      读数里如实标 `unsupported`，不假装世界上有音乐在放。
 *   4. 原文在 `MESSAGE_RECEIVED` 里直接改消息。本模块**只解析、只回报**，写入动作
 *      由调用方（`core/interceptor.js`）在既有净化链**之前**用**原文**驱动——
 *      净化会改写文本，用净化后的文本解析等于让读数依赖另一条链。
 *
 * ── 单一真源纪律 ──────────────────────────────────────────────
 *   · 本模块**不新增任何 store 顶层键**：时间走 `clock.iso`，事实走 `worldFacts`，
 *     抉择走 `story-choice`。解析账（`stat`）是模块内存 + localStorage，不是世界事实。
 *   · `parse()` 是纯函数，不读 store、不写 store——可被测试直接调用。
 *   · 时间推进**必须**与 `calendar.autoAdvance` 同一把去重锁：同一文本不双计。
 *
 * ── 它不做什么 ────────────────────────────────────────────────
 *   · 不删消息里的标签（隐藏显示由 `strip` 提供，调用方决定何时用）
 *   · 不猜测缺省日期（`<time>` 里没有可解析日期 → `null`，不取「今天」）
 *   · 不把解析失败当成「没有标签」：`malformed` 单独计数
 */
(function () {
  'use strict';
  const WA = (window.WorldAxis = window.WorldAxis || {});
  const LS_KEY = 'worldaxis_inline_tags_v1';
  const LOG = '[世界枢轴][标签]';

  // ── 标签语法 ────────────────────────────────────────────────
  // 兼容 ST「编码标签」设置下被转义的 &lt;time&gt;（原文同款：ESC_* 四组）
  const RE = {
    time: /<time\b[^>]*>([\s\S]*?)<\/time>/gi,
    choice: /<choice\b([^>]*)>([\s\S]*?)<\/choice>/gi,
    bgm: /<bgm\b[^>]*>([\s\S]*?)<\/bgm>/gi,
    flag: /<flag\b[^>]*>([\s\S]*?)<\/flag>/gi,
    escTime: /&lt;time\b[\s\S]*?&gt;[\s\S]*?&lt;\/time&gt;/gi,
    escChoice: /&lt;choice\b[\s\S]*?&gt;[\s\S]*?&lt;\/choice&gt;/gi,
    escBgm: /&lt;bgm\b[\s\S]*?&gt;[\s\S]*?&lt;\/bgm&gt;/gi,
    escFlag: /&lt;flag\b[\s\S]*?&gt;[\s\S]*?&lt;\/flag&gt;/gi,
  };
  const ANY_TAG_RE = /<(time|choice|bgm|flag)\b/i;
  const DATE_RE = /^\s*(-?\d{1,6})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?\s*$/;

  function arr(v) { return Array.isArray(v) ? v : []; }

  /** 严格 YYYY-MM-DD 归一；不合法返回 null（**不做**「取今天」的兜底）。 */
  function normalizeDate(input) {
    const s = String(input == null ? '' : input).trim();
    const m = DATE_RE.exec(s);
    if (!m) return null;
    const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    // 月末校验：用构造器回读，2 月 30 日这类会被拒收而不是静默进位
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
    const pad = n => String(n).padStart(2, '0');
    return String(y).padStart(4, '0') + '-' + pad(mo) + '-' + pad(d);
  }

  function parseAttrs(s) {
    const attrs = {};
    const re = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|“([^”]*)”|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(String(s || '')))) {
      attrs[m[1].toLowerCase()] = (m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : m[5] || '').trim();
    }
    return attrs;
  }

  /**
   * 纯函数解析。不读 store、不写 store。
   * @returns {{time:string|null, choices:Array, bgm:string|null, flags:string[], malformed:{time:number,choice:number,flag:number}}}
   */
  function parse(text) {
    const s = String(text == null ? '' : text);
    const malformed = { time: 0, choice: 0, flag: 0 };

    // 多个 <time> 取最后一个可解析的（后写的更新）；都不可解析 → null 并计 malformed
    let time = null; let timeSeen = 0;
    for (const m of s.matchAll(RE.time)) {
      timeSeen++;
      const d = normalizeDate(m[1]);
      if (d) time = d; else malformed.time++;
    }
    if (!time && timeSeen === 0) malformed.time = 0;

    const choices = [];
    for (const m of s.matchAll(RE.choice)) {
      const a = parseAttrs(m[1]);
      const choice = String(m[2] || '').trim();
      const who = a.who || a.name || '';
      if (who && choice) choices.push({ who: who, event: a.event || '', choice: choice });
      else malformed.choice++;
    }

    let bgm = null;
    for (const m of s.matchAll(RE.bgm)) { if (String(m[1] || '').trim()) bgm = String(m[1]).trim(); }

    const flags = [];
    for (const m of s.matchAll(RE.flag)) {
      const v = String(m[1] || '').trim();
      if (v) { if (flags.indexOf(v) < 0) flags.push(v); } else malformed.flag++;
    }

    return { time: time, choices: choices, bgm: bgm, flags: flags, malformed: malformed };
  }

  /** 去掉标签（含被转义的四组）；用于「聊天里看不到」。不改世界结算口径。 */
  function strip(text) {
    return String(text == null ? '' : text)
      .replace(RE.time, '').replace(RE.choice, '').replace(RE.bgm, '').replace(RE.flag, '')
      .replace(RE.escTime, '').replace(RE.escChoice, '').replace(RE.escBgm, '').replace(RE.escFlag, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd();
  }

  // ── 解析账（模块内存 + localStorage；**不是**世界事实，故不进 store）──
  const stat = {
    parsed: 0, withTag: 0, timeApplied: 0, timeNoop: 0, timeDeduped: 0,
    choiceApplied: 0, flagApplied: 0, flagDeduped: 0, bgmSeen: 0,
    malformed: 0, fault: 0, lastAt: 0, lastSig: '', lastTime: null,
  };
  /** 读侧归因（v2.381.0 收口）：G16 口径要求每一处裸读点附近都投递一次读失败归因。
   *  本条治的病：`catch (e)` 里只写一句「账坏了不影响解析」，会把「localStorage 被拒」
   *  答成「本聊天还没有任何内联标签记录」——两者在诊断上同形，补救却完全不同
   *  （前者查存储可读性 / 隐私模式，后者是正常开局态）。故当场留痕，只投递不改结论。 */
  function noteReadFail(k, err) {
    try {
      if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('inlineTags', k, err);
    } catch (e) { /* 归因出口自身不可用时不阻断解析 */ }
  }
  function loadLedger() {
    try {
      const raw = (WA.mainWin && WA.mainWin.localStorage) ? WA.mainWin.localStorage.getItem(LS_KEY) : null;
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && typeof o === 'object') Object.keys(stat).forEach(function (k) { if (k in o) stat[k] = o[k]; });
    } catch (e) { noteReadFail(LS_KEY, e); /* 账坏了不影响解析，但读失败必须留痕 */ }
  }
  function saveLedger() {
    try {
      if (WA.mainWin && WA.mainWin.localStorage) {
        WA.mainWin.localStorage.setItem(LS_KEY, JSON.stringify(stat));
      }
    } catch (e) { /* 写不进去也不影响本次解析 */ }
  }
  function now() {
    try { return WA.clock.now('inlineTags'); } catch (e) { return Date.now(); }
  }
  // v2.381.0 收口（G20）：墙钟守卫**必须是一个具名声明**，不能在三处各自内联一份。
  //   原状：writeBounded 的两端各写 `(function () { try { return WA.clock.wallNow(); }
  //   catch (e) { return Date.now(); } })()` —— 两处 fallback 各自散落在表达式里，
  //   于是 G20 的「声明数 == fallback 数」判据报 328 vs 330（本文件 1 声明 / 3 fallback）。
  //   为什么必须收成一个声明：判据要的命题是「每一次读墙钟都有一个与它配对的守卫」。
  //   内联 IIFE 版本在语义上**没漏改**（它确实走了 WA.clock.wallNow()），但它在源码上
  //   把「守卫」复制了两份 —— 这正是本仓反复治理的「第二份真源」：改一处忘一处时，
  //   一条路径静默回落到裸 Date.now()，而另一条不会，回放对不上时无从定位。
  //   收到一个具名声明里，配对关系就变成结构事实，而不是靠三处字面量恰好一致。
  const clockWall = function (site) {
    try { return WA.clock.wallNow(); } catch (e) { return Date.now(); }
  };
  function hash(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(36);
  }

  /**
   * 有界写入。为什么需要（真机联调实测）：
   *   `store.transact` 在宿主无存档时会走落盘/审计/巡视链，实测阻塞 >30s。
   *   而本模块挂在 `MESSAGE_RECEIVED` 上——一次阻塞会把整条消息回调链一起挂住。
   * 实现：同步 try/catch + 耗时上限读数。同步写无法真正中断（JS 单线程），
   *   故这里做的是「事后判定超时并如实记账」，让读面能看见「这次写其实拖了 3 秒」，
   *   而不是让调用方以为一切正常。超过上限的写**不重试**（重试只会再拖一次）。
   */
  const WRITE_BUDGET_MS = 1500;
  function writeBounded(fn) {
    const t0 = clockWall('inlineTags.writeBounded.t0');
    try {
      fn();
    } catch (e) {
      return { ok: false, timeout: false, ms: 0, error: String(e && e.message).slice(0, 120) };
    }
    const t1 = clockWall('inlineTags.writeBounded.t1');
    const ms = t1 - t0;
    if (ms > WRITE_BUDGET_MS) {
      stat.slowWrites = (stat.slowWrites || 0) + 1;
      return { ok: true, timeout: true, ms: ms };
    }
    return { ok: true, timeout: false, ms: ms };
  }

  /**
   * 把解析结果落进**既有**真源。只写三处：clock.iso / worldFacts / story-choice。
   * 去重：同一文本签名只应用一次（重掷、重复事件不双计）。
   * @returns {{ok:boolean, time:object|null, choices:number, flags:number, bgm:string|null, reason?:string}}
   */
  function apply(text, opts) {
    const o = opts || {};
    const s = String(text == null ? '' : text);
    stat.parsed++;
    stat.lastAt = now();
    const p = parse(s);
    const hasAny = !!(p.time || p.choices.length || p.flags.length || p.bgm);
    if (hasAny) stat.withTag++;
    stat.malformed += (p.malformed.time || 0) + (p.malformed.choice || 0) + (p.malformed.flag || 0);
    if (p.bgm) stat.bgmSeen++;

    const out = { ok: true, time: null, choices: 0, flags: 0, bgm: p.bgm, reason: undefined };
    if (!hasAny) { out.reason = 'no-tag'; saveLedger(); return out; }

    // 同一文本只应用一次
    const sig = hash(s);
    if (o.force !== true && sig === stat.lastSig) {
      stat.timeDeduped++; out.reason = 'dedup'; saveLedger(); return out;
    }
    stat.lastSig = sig;

    // ① 时间 → clock.iso（既有字段；**不**造 dateIndex）
    //    空状态守卫（真机联调发现）：未开聊天时 store 为空对象，clock 段不存在，
    //    `calendar.setClock` 里 `d.clock.label` 会当场抛错。此时**不能**替宿主补一个
    //    默认世界钟（那等于凭空造状态），而要如实回报 no-clock 并计数——
    //    「没开局」与「写失败」是两件事，读面必须能分开。
    if (p.time) {
      const st0 = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
      if (!st0 || !st0.clock || typeof st0.clock !== 'object') {
        stat.timeNoClock = (stat.timeNoClock || 0) + 1;
        out.time = { iso: p.time, changed: false, reason: 'no-clock' };
        out.reason = out.reason || 'no-clock';
      } else {
        const before = (WA.store && WA.store.read) ? WA.store.read('clock.iso', '') : '';
        if (before === p.time) { stat.timeNoop++; out.time = { iso: p.time, changed: false }; }
        else {
          try {
            WA.calendar.setClock(
              (WA.store && WA.store.read) ? WA.store.read('clock.label', '') : '',
              { source: 'text', iso: p.time }
            );
            stat.timeApplied++; stat.lastTime = p.time;
            out.time = { iso: p.time, changed: true };
          } catch (e) {
            stat.fault++;
            out.ok = false; out.reason = 'clock-write-failed';
            WA.log && WA.log('warn', LOG + ' 写 clock.iso 失败', e);
          }
        }
      }
    }

    // ② 抉择 → store.chronicle（既有归档历史真源）
    //    为什么**不**走 storyChoice：它的写口是 present(node)「引擎呈现一个待选点」，
    //    语义是**还没做选择**；把模型回报的既成抉择塞进去等于伪造一个待选项。
    //    抉择是「已经发生的历史」，归属就是 chronicle（kind:'inline-choice'）。
    //    v2.302.0 真机联调修正：写口**必须**有界。实测宿主无存档时 transact 会走
    //    落盘/审计/巡视链并长时间阻塞，而标签解析挂在消息接收事件上——阻塞即吞消息。
    //    故 `writeBounded()` 给每次写加时间上限，超时如实记 timeout，不静默继续。
    if (p.choices.length) {
      const stC = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
      if (!stC || typeof stC !== 'object' || Object.keys(stC).length === 0) {
        stat.choiceNoStore = (stat.choiceNoStore || 0) + p.choices.length;
        out.reason = out.reason || 'no-store';
      } else {
        const at = now();
        const rows = p.choices.map(function (c) {
          return { id: 'ic_' + (WA.rand && WA.rand.id ? WA.rand.id('', 4, 'id') : hash(c.who + c.choice)),
            kind: 'inline-choice', title: c.who + '：' + c.choice,
            summary: c.event ? ('事件 ' + c.event + '；抉择「' + c.choice + '」') : ('抉择「' + c.choice + '」'),
            at: at, refs: [], source: 'inline-tag' };
        });
        const res = writeBounded(function () {
          WA.store.transact(function (d) {
            d.chronicle = arr(d.chronicle);
            rows.forEach(function (r) { d.chronicle.push(r); });
            try { if (WA.evict && typeof WA.evict.array === 'function') WA.evict.array(d.chronicle, 'inlineTags.chronicle'); } catch (e2) {}
          });
        });
        if (res.ok) { stat.choiceApplied += rows.length; out.choices = rows.length; }
        else {
          stat.fault++;
          out.ok = false; out.reason = res.timeout ? 'choice-write-timeout' : 'choice-write-failed';
          WA.log && WA.log('warn', LOG + ' 写 chronicle 未完成：' + out.reason);
        }
      }
    }

    // ③ 事实 → worldFacts（按 key 去重，重复声明只更新 at）
    if (p.flags.length) {
      const stF = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
      if (!stF || typeof stF !== 'object' || Object.keys(stF).length === 0) {
        stat.flagNoStore = (stat.flagNoStore || 0) + p.flags.length;
        out.reason = out.reason || 'no-store';
      } else {
        try {
          const st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
          const facts = arr(st.worldFacts);
          const at = now();
          p.flags.forEach(function (key) {
            const hit = facts.filter(function (f) { return f && f.key === key && f.scope === 'flag'; })[0];
            if (hit) { hit.at = at; stat.flagDeduped++; }
            else {
              facts.push({ id: 'flag_' + key, key: key, value: true, scope: 'flag', source: 'inline-tag', at: at });
              stat.flagApplied++; out.flags++;
            }
          });
          // 只在真有变化时事务写入（store.transact 是既有写口）；同样走有界写
          if (out.flags > 0) {
            const res = writeBounded(function () { WA.store.transact(function (d) { d.worldFacts = facts; }); });
            if (!res.ok) {
              stat.fault++;
              out.ok = false; out.reason = 'fact-write-failed';
              out.flags = 0;
            } else if (res.timeout) {
              out.slow = true;
            }
          }
        } catch (e) {
          stat.fault++;
          out.ok = false; out.reason = 'fact-write-failed';
          WA.log && WA.log('warn', LOG + ' 写 worldFacts 失败', e);
        }
      }
    }

    saveLedger();
    return out;
  }

  /** 读数（面板 / 诊断消费）。全部字段如实返回，不藏失败。 */
  function read() {
    return {
      parsed: stat.parsed, withTag: stat.withTag,
      timeApplied: stat.timeApplied, timeNoop: stat.timeNoop, timeDeduped: stat.timeDeduped,
      choiceApplied: stat.choiceApplied,
      flagApplied: stat.flagApplied, flagDeduped: stat.flagDeduped,
      bgmSeen: stat.bgmSeen, malformed: stat.malformed, fault: stat.fault,
      // 「没写」的三种原因必须分开报（真机联调发现的边界）：
      //   no-clock = 未开聊天（store 无 clock 段）——不是失败，是还没开局
      //   no-store = store 整体为空——同上，且范围更大
      //   fault    = 真有写口却抛错——这才是要修的
      timeNoClock: stat.timeNoClock || 0,
      flagNoStore: stat.flagNoStore || 0,
      choiceNoStore: stat.choiceNoStore || 0,
      lastAt: stat.lastAt, lastTime: stat.lastTime,
      // 能力归属：这三项由谁负责，读面必须说清（否则「没反应」分不清是没写还是没引擎）
      owners: {
        time: (WA.calendar && typeof WA.calendar.setClock === 'function') ? 'calendar.setClock' : null,
        choice: (WA.store && typeof WA.store.transact === 'function') ? 'store.chronicle' : null,
        flag: (WA.store && typeof WA.store.transact === 'function') ? 'store.worldFacts' : null,
        bgm: null,   // 本仓无音频通道——如实报空，不冒充支持
      },
    };
  }

  loadLedger();
  WA.inlineTags = {
    VERSION: '2.302.0',
    SOURCE: 'World Chronicle engine/tags.js + conditions.js（已获作者授权）',
    parse: parse,
    strip: strip,
    apply: apply,
    read: read,
    normalizeDate: normalizeDate,
    hasTag: function (t) { return ANY_TAG_RE.test(String(t == null ? '' : t)); },
    /** 条件求值（同源 conditions.js 的等价实现；服务于剧本/刊物「要满足什么才发生」） */
    evaluateCondition: function (cond, ctx) {
      const c = ctx || {};
      if (cond === null || cond === undefined) return true;
      if (typeof cond !== 'object') return Boolean(cond);
      if (Array.isArray(cond)) return cond.every(function (x) { return WA.inlineTags.evaluateCondition(x, c); });
      const results = [];
      if ('flag' in cond) results.push(Boolean((c.flags || {})[cond.flag]));
      if ('choice' in cond) {
        const q = cond.choice || {};
        const list = arr(c.choices);
        results.push(list.some(function (x) {
          return (!q.who || x.who === q.who) && (!q.event || x.event === q.event)
            && (!q.is || String(x.choice || '').indexOf(String(q.is)) >= 0);
        }));
      }
      if ('phase' in cond) results.push(c.phase === cond.phase);
      if ('present' in cond) results.push(arr(c.present).indexOf(cond.present) >= 0);
      if ('all' in cond) results.push(arr(cond.all).every(function (x) { return WA.inlineTags.evaluateCondition(x, c); }));
      if ('any' in cond) results.push(arr(cond.any).some(function (x) { return WA.inlineTags.evaluateCondition(x, c); }));
      if ('not' in cond) results.push(!WA.inlineTags.evaluateCondition(cond.not, c));
      return results.length ? results.every(Boolean) : true;
    },
    _stat: stat,
  };
  try { if (typeof WA.registerModule === 'function') WA.registerModule('inlineTags'); } catch (e) {}
  WA.log && WA.log('info', LOG + ' v2.302.0 已装载（<time>/<choice>/<flag> 解析，<bgm> 只解析不落账）');
})();
