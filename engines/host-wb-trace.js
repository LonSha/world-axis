/**
 * WorldAxis engines/host-wb-trace.js (v2.50.0) — 宿主世界书激活账（纯只读）
 *
 * 缝合来源：Luker（SillyTavern fork）的 World Info Activation Trace —— 记录每个条目
 *   「哪个关键词触发 / 在哪层楼命中 / 扫描深度多少 / 以何种方式激活 / 最终注入到 prompt 的哪一段」。
 *
 * 本仓为什么需要它（v2.49.0 之后的下一层）：
 *   v2.49.0 修的是**我们自己内部**的重复注入（同一来源既走独立槽位又并进主块）。
 *   而宿主自己那一次世界书扫描——我们完全不观测：
 *     · 全库零订阅 WORLD_INFO_ACTIVATED（实测 grep eventSource.on 只有 5 处，无此事件）；
 *     · engines/worldbook.js 与 engines/entry-router.js 读的是**条目定义**（覆写表、候选集），
 *       不是「宿主这一轮实际注入了哪几条」。
 *   于是「本条常驻条目到底激活了没有、被谁触发的」在我们这里**一个字都答不出**。
 *   用户改不动条目时，能拿到的只有「感觉没生效」。
 *
 * 三条铁律（照仓库既定纪律）：
 *   ① 纯只读：不写 store、不改宿主条目、不调 setExtensionPrompt；
 *   ② 三态如实：'unsupported'（宿主无此事件）≠ 'awaiting'（已订阅、尚未派发）≠ 'ok'（有数据）。
 *      绝不把「宿主没给这个事件」伪装成「本轮没有条目激活」——前者是环境，后者是事实。
 *   ③ 不猜：事件载荷形状未知时不解析，标记 'shape-unknown' 并保留原始键名清单供诊断，
 *      而不是猜一个字段名把 undefined 当结果交出去。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const MAX_NAMES = 120;      // 单次快照最多登记的条目名（防载荷异常时无界增长）
  const MAX_ROUNDS = 8;       // 跨轮环形（只存统计与条目名，不存正文）
  let __hostTexts = [];       // 本轮宿主条目正文（仅用于同文比对，不落 store）

  // 宿主用 `{systemPrompt}` / `{}` 这类哨兵名标记「系统条目」，它们不参与常规扫描/输出。
  // 本仓照抄该口径并**显式报出**排除了多少条——排除而不报，等于把「有条目没出现」的锅推给上游。
  const SYS_MARK = /^\s*\{\s*(systemPrompt)?\s*\}\s*$/i;

  const clean = function (v) { return WA.inputGuard.text(v, 80); };
  function safe(fn, fb) { try { const v = fn(); if (v !== undefined) return v; } catch (e) {} return fb === undefined ? null : fb; }

  // ── 状态 ──────────────────────────────────────────────
  // 'unsupported' 宿主无该事件 | 'awaiting' 已订阅未派发 | 'ok' 有数据 | 'shape-unknown' 载荷不认识
  let __state = 'awaiting';
  let __shapeUnknownKeys = null;
  let __last = null;                  // {at, count, names:[], hash, sysExcluded}
  const __rounds = [];                // 跨轮环形（测量时间，不进存档）
  let __subscribed = false;
  let __subscribeAttempts = 0;
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  function hashText(t) {
    if (WA.timeline && WA.timeline.hashText) return WA.timeline.hashText(t);
    // 兜底：**不同口径**的单哈希（8 位），仅用于同进程内比较；timeline 的 hashText 是
    // 16 位双哈希。两者长度不同即可区分来源——绝不声称「同口径」（否则跨源比对会静默错配）。
    const s = String(t == null ? '' : t);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function fnv(t) { return hashText(t); }

  // ── 载荷归一（对形状不猜）──────────────────────────────
  /**
   * 把宿主事件载荷归一为 { names:[], contents:[] }。
   * 认得的形状（逐条实测过的三种）：
   *   a) Array<{name/comment/key, content}>         —— 直接是条目数组
   *   b) Array<string>                              —— 条目名数组
   *   c) { entries:[...] } / { activated:[...] } / { worldInfo:[...] } / { items:[...] }
   * 认不得 ⇒ 返回 null，调用方标记 'shape-unknown' 并留键名清单（不猜）。
   */
  function normalizePayload(pl) {
    if (pl == null) return { names: [], contents: [] };
    if (Array.isArray(pl)) return fromList(pl);
    if (typeof pl === 'object') {
      const keys = ['entries', 'activated', 'worldInfo', 'world_info', 'wiEntries', 'items'];
      for (let i = 0; i < keys.length; i++) {
        if (Array.isArray(pl[keys[i]])) return fromList(pl[keys[i]]);
      }
      // 对象形：{ 条目名: content } 也见过
      const own = Object.keys(pl);
      if (own.length && own.every(function (k) { return typeof pl[k] === 'string'; })) {
        return { names: own.slice(0, MAX_NAMES), contents: own.map(function (k) { return String(pl[k] || ''); }) };
      }
      return null;   // 形状不认识——不猜
    }
    return null;
  }
  function fromList(list) {
    const names = [], contents = [];
    for (let i = 0; i < list.length && names.length < MAX_NAMES; i++) {
      const it = list[i];
      if (it == null) continue;
      if (typeof it === 'string') { names.push(clean(it)); contents.push(''); continue; }
      if (typeof it === 'object') {
        const nm = clean(it.name || it.comment || it.key || it.uid);
        const ct = typeof it.content === 'string' ? it.content : (typeof it.mes === 'string' ? it.mes : '');
        names.push(nm || '(未命名条目)');
        contents.push(ct);
        continue;
      }
      names.push(clean(it)); contents.push('');
    }
    return { names: names, contents: contents };
  }

  function isSystemEntry(name) { return SYS_MARK.test(clean(name)); }

  // ── 落账（事件回调）──────────────────────────────────
  function capture(payload) {
    const norm = normalizePayload(payload);
    // 正文缓存是 crossCheck 的**唯一**文本来源：两条入口（onActivated / 面板与回归直接 capture）
    // 都必须填它，否则「同文比对」会在 capture 路径上静默退化成「不可比」（假阴性）。
    __hostTexts = norm ? (norm.contents || []).slice() : [];
    if (!norm) {
      __state = 'shape-unknown';
      __shapeUnknownKeys = (payload && typeof payload === 'object' && !Array.isArray(payload))
        ? Object.keys(payload).slice(0, 12) : ['(non-object)'];
      pushRound({ at: clockWall(), count: 0, names: [], hash: '', sysExcluded: 0, shapeUnknown: true });
      if (WA.log) WA.log('warn', '宿主世界书激活事件载荷形状未知（不猜字段名，键：' + __shapeUnknownKeys.join('、') + '）');
      return null;
    }
    let sysExcluded = 0;
    const names = [], contents = [];
    for (let i = 0; i < norm.names.length; i++) {
      if (isSystemEntry(norm.names[i])) { sysExcluded++; continue; }
      names.push(norm.names[i]);
      contents.push(norm.contents[i] || '');
    }
    __state = 'ok';
    __shapeUnknownKeys = null;
    const joined = contents.join('\n');
    const rec = {
      at: clockWall(), count: names.length, names: names.slice(),
      hash: joined ? fnv(joined) : '',
      sysExcluded: sysExcluded
    };
    __last = rec;
    pushRound(rec);
    if (WA.log) WA.log('info', '宿主世界书激活 ' + names.length + ' 条' + (sysExcluded ? '（另有 ' + sysExcluded + ' 条系统条目按宿主口径排除）' : ''));
    return { count: rec.count, names: rec.names.slice(), sysExcluded: rec.sysExcluded };
  }

  function pushRound(rec) {
    try {
      __rounds.push(rec);
      while (__rounds.length > MAX_ROUNDS) __rounds.shift();
    } catch (e) { /* 留痕失败不影响生成链 */ }
  }

  // ── 与我们的注入对账（被 render/inject.js 真消费）──────
  /**
   * 交叉核对：本轮宿主激活的条目里，有没有与**我们注入的**内容同源/同文。
   *   · same-text：正文逐字相同（一份内容进了 prompt 两次）
   *   · same-name：我方来源名与宿主条目名相同（大概率同源，正文不可比时也报）
   * 宿主载荷不带正文时，如实计入 uncomparable，不伪装成「已比对无重复」。
   *
   * @param {Array} injected 本轮注入项 [{source, content}]
   */
  function crossCheck(injected) {
    const items = Array.isArray(injected) ? injected : [];
    const out = { available: false, state: __state, checked: 0, uncomparable: 0, overlaps: [], note: '' };
    if (__state !== 'ok' || !__last) {
      out.note = __state === 'unsupported'
        ? '宿主未提供世界书激活事件（本次不比对——不是「没有重复」，是「无从得知」）'
        : (__state === 'shape-unknown'
          ? '宿主世界书激活事件的载荷形状未知（已留键名清单，未做比对）'
          : '已订阅宿主世界书激活事件，但本轮尚未派发（尚未比对）');
      return out;
    }
    const hostNames = __last.names || [];
    if (!hostNames.length || !items.length) { out.available = true; out.note = '双方其一为空，无需比对'; return out; }
    const hostTexts = __hostTexts || [];
    // 「不可比」的判据是「宿主**一条正文都没给**」，不是「这一条没配上」。
    //   首版逐项判断 hostTexts 为空即 uncomparable++，于是「给了正文、只是没匹配上」
    //   也被计成不可比——那是**误报**（我们确实比过了，结论是「无重叠」）。
    const anyHostText = hostTexts.some(function (h) { return !!String(h || ''); });
    const overlaps = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const src = clean(it.source) || '(未命名来源)';
      const body = String(it.content || '');
      if (!body) continue;
      if (!anyHostText) { out.uncomparable++; continue; }   // 宿主整批都没给正文 ⇒ 无可比对象
      out.checked++;
      for (let j = 0; j < hostTexts.length; j++) {
        const hb = String(hostTexts[j] || '');
        if (!hb) continue;
        if (hb === body) { overlaps.push({ source: src, host: hostNames[j] || '(未命名条目)', kind: 'same-text' }); break; }
      }
    }
    // 同名（我方 source 名 == 宿主条目名）：即便正文不可比，同名也值得报——大概率同源
    for (let i = 0; i < items.length; i++) {
      const src = clean((items[i] || {}).source);
      if (!src) continue;
      const k = hostNames.indexOf(src);
      if (k >= 0 && !overlaps.some(function (o) { return o.source === src && o.kind === 'same-text'; })) {
        overlaps.push({ source: src, host: src, kind: 'same-name' });
      }
    }
    out.available = true;
    out.overlaps = overlaps.slice(0, 8);
    out.note = out.uncomparable
      ? '宿主载荷未携带正文，' + out.uncomparable + ' 项只能按条目名比对（已在结果中如实计数）'
      : '';
    return out;
  }

  // ── 订阅回报（由 core/interceptor.js 调用；本引擎不自己挂宿主）──
  /**
   * @param {'subscribed'|'unsupported'} how
   */
  function markSubscribed(how) {
    __subscribeAttempts++;
    // v2.50.0 修：`unsupported` 是**本次挂接尝试的环境事实**，不是一次性会话结论。
    //   首版写作 `else if (!__subscribed)`，于是「曾经订阅成功过一次」会永久豁免后续的
    //   unsupported 回报——宿主在后续安装里不再给 WORLD_INFO_ACTIVATED 时，本面会停留在
    //   'awaiting'，面板/诊断显示「已订阅，本轮尚未派发」，把**能力缺失伪装成还没轮到**。
    //   环境事实必须每次覆盖；反向（unsupported → subscribed）仍允许恢复（宿主升级场景）。
    if (how === 'subscribed') { __subscribed = true; if (__state === 'unsupported') __state = 'awaiting'; }
    else { __subscribed = false; __state = 'unsupported'; }
    return __state;
  }
  /** 事件回调入口（拦截器把载荷原样交来）——归一与正文缓存都在 capture 内完成，单一入口 */
  function onActivated(payload) {
    return capture(payload);
  }

  const stat = function () {
    return {
      state: __state,
      subscribed: __subscribed,
      attempts: __subscribeAttempts,
      shapeUnknownKeys: __shapeUnknownKeys ? __shapeUnknownKeys.slice() : null,
      lastCount: __last ? __last.count : null,
      lastNames: __last ? __last.names.slice() : [],
      lastAt: __last ? __last.at : 0,
      sysExcluded: __last ? __last.sysExcluded : null,
      rounds: __rounds.length,
      history: __rounds.map(function (r) { return { at: r.at, count: r.count, hash: r.hash, sysExcluded: r.sysExcluded, shapeUnknown: !!r.shapeUnknown }; })
    };
  };
  /** 三态读文案（消费端不得自造语义） */
  function stateText() {
    if (__state === 'unsupported') return '宿主未提供世界书激活事件（此面不可观测：不是「没有激活」，是「无从得知」）';
    if (__state === 'shape-unknown') return '事件已派发但载荷形状未知（不猜字段名；已留键名清单）';
    if (__state === 'ok') return '宿主世界书激活面正常（上次 ' + (__last ? __last.count : 0) + ' 条）';
    return '已订阅世界书激活事件，本轮尚未派发';
  }
  /** 清空（切聊天/诊断复位用）
   *  **刻意不动 `unsupported`**：那是**会话级的宿主能力结论**（宿主没有这个事件），
   *  不是观测数据。首版 reset 把它降级回 'awaiting'，于是「清一次窗口」就把
   *  「宿主根本不给这个事件」这条结论抹掉了，面板与诊断会重新显示「尚未派发」——
   *  把环境差异伪装成「还没轮到」。观测数据（窗口/正文缓存/上轮）才该清。 */
  function reset() {
    __last = null; __rounds.length = 0; __hostTexts = [];
    if (__state === 'ok' || __state === 'shape-unknown') __state = 'awaiting';
    return true;
  }

  WA.hostWbTrace = {
    MAX_NAMES, MAX_ROUNDS, SYS_MARK,
    markSubscribed, onActivated, capture, crossCheck,
    stat, stateText, reset,
    normalizePayload, isSystemEntry,      // 供回归直接核对归一与系统条目口径
    fingerprint: fnv, safe
  };
  if (WA.log) WA.log('info', '宿主世界书激活账已加载（只读）');
})();