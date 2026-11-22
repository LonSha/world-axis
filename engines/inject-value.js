/**
 * WorldAxis engines/inject-value.js (v2.150.0) — 注入价值量化（RP4）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `inject-budget` 答「预算花给了谁、谁被折叠」；`perf-ledger` 答「这些源花了多久」；
 *   `inject-inspector` 答「到底进没进 prompt」。三本账都答得挺好，却没有一本答
 *   **「注进去的东西值不值」**。后果很具体：一个源可以连续二十轮都在注入、都占着预算，
 *   而生成正文里一次都没提过它——没有任何读数能让用户看见这件事，
 *   于是「该关谁、该给谁降档」永远只能靠手感。
 *
 *   本模块补这一层：给每个注入源算**引用率**（它注进去的片段在正文里出现了多少）
 *   与**采纳率**（它的条目行被正文真正吸收了多少），并对「连续 N 轮零引用」的源
 *   打 `value.zero-ref`（建议降档或关闭）。**只读评估，不动注入**。
 *
 * ── 三条口径（本模块最容易做错的地方）────────────────────────────
 *   ① **引用率 ≠ 采纳率**，绝不合成一个「价值分」。
 *      引用率是**片段级**的（「这条源里有没有哪句话被正文提到」），宽松；
 *      采纳率是**条目行级**的（这条状态行是否被正文真的吸收），严格。
 *      两者的差正是「注进去了但只被念了个名词」与「注进去且真用上了」——
 *      合成一个数就把这条差抹掉，而用户要的恰好是这条差：该降档的是前者。
 *   ② **跨源通用片段不算数**。同一个片段若在本轮多个源里都出现（df ≥ 2），它命中
 *      只说明「中文常用语在中文里也会出现」，不说明任何关于这个源的事。
 *      故本模块给出 `refDistinct`（排除通用片段）并**以它作榜单排序**。
 *      在册源数 ≤ 1 时不判通用（只有一个源时「通用」不可判定，不是「没有通用」）。
 *   ③ **算不出来 ≠ 算出来是 0**。没结算的轮次（重掷 / 文本过短 / 全是通用片段 /
 *      轮次不符）一律记进 `skipReasons` 且**不进分母**——把它们当 0 会把「没量到」
 *      写成「没用上」，那正是本模块要防的那件事（与 perf-ledger 的 no-reading 同规）。
 *
 * ── 边界（不做的事）──────────────────────────────────────────
 *   1. **不做语义匹配**：只做字面出现判定（片段 / 条目行）。语义级「同义复述」不可判定，
 *      假装能算等于把不可靠的推断伪装成读数。
 *   2. **不评判生成质量**：本模块只看「注入面 ↔ 正文」的结构关系，不看正文好坏。
 *   3. **不写世界状态**：全文件零 store.transact。读数只在本进程内存里。
 *   4. **观测不污染被观测者**：自身耗时经 WA.perfLedger.ingest 入**性能台账**，
 *      不进本模块自己的账——否则「评估器越慢、价值读数越差」会互相污染。
 *   5. **有界**：轮次环 CAP_ROUNDS / 源数 CAP_SOURCES / 文本 MAX_TEXT，全部有上界。
 *   6. **只认落地项**：评估的是**真进了 prompt 的那批条目**（预算折叠 / 丢弃的不算）。
 *      被折叠的源「零引用」不成立——它压根没进去；那是 inject-budget 的账，不是这里的。
 */
(function () {
  'use strict';
  // 别名形态用本仓规范式（module-cycle-gate 只认这一种形态）。
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_inject_value_v1';
  const DEF = {
    enabled: true,          // 纯只读评估：默认关会让读数永远是空的（与 sediment 的默认关不同）
    zeroRefRounds: 3,       // 连续 N 轮零引用 ⇒ value.zero-ref
    maxKeys: 12             // 每源最多留多少片段参与判定（成本上界）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'injectValue',
    bounds: { zeroRefRounds: [1, 20], maxKeys: [4, 48] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  /**
   * v2.150.0：设置**写口**，与 settings() 成对。
   *   为什么必须有它：面板「注入」页的三枚控件（总开关 / 零引用阈值 / 片段上限）要落盘；
   *   只给读口等于三个**点了没有任何反应**的控件（先例：v2.149.0 的 sediment.setSettings ——
   *   面板引用此口而导出面缺席，于是恒走 module-missing 分支：静默、不报错、像没实现）。
   */
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // ── 容量（进程态内存容器：不落盘、不进存档，故不登记 store 骨架键）──────────────
  const CAP_ROUNDS = 24;       // 轮次环：能回看多少轮，决定「连续 N 轮零引用」的可判长度
  const CAP_SOURCES = 64;      // 单轮在册源数上限
  const MAX_TEXT = 20000;      // 单次结算的正文上限（超出即截断并如实计数）
  const MIN_TEXT = 8;          // 短于此长度的正文不算读数（说不出任何事）
  const FRAG_MIN = 2, FRAG_MAX = 12;
  const FRAG_WINDOW = 8, FRAG_STRIDE = 4;   // 长句切片窗口/步长（确定性）

  const _stat = { observes: 0, settles: 0, judged: 0, truncated: 0, textTruncated: 0,
    selfMs: 0, perfIngest: 0, lastReason: '', skipReasons: {} };

  function noteSkip(code) {
    _stat.skipReasons[code] = (_stat.skipReasons[code] || 0) + 1;
    _stat.lastReason = code;
  }
  function wallNow() { try { return WA.clock ? WA.clock.wallNow() : Date.now(); } catch (e) { return Date.now(); } }
  function lastInjection() {
    try { const d = (WA.store && WA.store.get) ? WA.store.get() : null; return (d && d.lastInjection) || null; }
    catch (e) { return null; }
  }
  /** 当前轮次真源 = store.lastInjection.round（与 render/inject.js 的 roundNow 同源，不另立计数）。 */
  function currentRound() {
    const li = lastInjection();
    return (li && typeof li.round === 'number' && isFinite(li.round)) ? li.round : 0;
  }

  // ── 三个纯函数（确定性、单一实现）──────────────────────────────
  //   片段切分：按标点/空白切段，只留长度 2..12 的顿。长句（无标点的长串）切窗。
  //   为什么不用分词：分词器是外部依赖 + 词典版本不确定性；而本模块只答「字面出现过」，
  //   片段粒度足够，且完全可复现（同一个块永远切出同一批片段）。
  const SPLIT_RE = /[\s,.;:!?\u3001\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\u2026\u2014\-\u2013()\uFF08\uFF09\[\]\u3010\u3011"'\u201C\u201D\u2018\u2019\u300C\u300D\u300E\u300F*#|\/\\~`]+/;
  // 停用表：中文里高频到不携带任何源信息的词。判「是否提到」时它们会产生大量假命中。
  //   注意：这里**只列真正无意义的**（的/了/是/在/和…），不列实义词——实义词受不列入，
  //   因为「他没提到实义词」恰恰就是要观测的东西。
  const STOP = { '\u7684': 1, '\u4e86': 1, '\u662f': 1, '\u5728': 1, '\u548c': 1, '\u4e0e': 1, '\u5c31': 1, '\u90fd': 1, '\u4e5f': 1, '\u4f1a': 1,
    '\u4e0d': 1, '\u6709': 1, '\u8fd9': 1, '\u90a3': 1, '\u4e2a': 1, '\u4ec0': 1, '\u4e48': 1, '\u8fd8': 1, '\u800c': 1, '\u4e4b': 1,
    '\u4e0e\u5176': 1, '\u4e00\u4e2a': 1, '\u4e00\u79cd': 1, '\u4e00\u76f4': 1, '\u53ef\u4ee5': 1, '\u4f46\u662f': 1, '\u5982\u679c': 1, '\u56e0\u4e3a': 1, '\u6240\u4ee5': 1,
    '\u540c\u65f6': 1, '\u7136\u540e': 1, '\u73b0\u5728': 1, '\u4ee5\u540e': 1, '\u5df2\u7ecf': 1, '\u4ecd\u7136': 1, '\u53ea\u662f': 1, '\u4f3c\u4e4e': 1, '\u4f3c\u4e4e\u662f': 1,
    '\u4ed6\u4eec': 1, '\u6211\u4eec': 1, '\u4f60\u4eec': 1, '\u81ea\u5df1': 1, '\u5bf9\u4e8e': 1, '\u5173\u4e8e': 1, '\u4f46\u662f\u8fd9': 1, '\u4ee5\u53ca': 1 };

  function windowize(run, out) {
    if (run.length <= FRAG_MAX) { if (run.length >= FRAG_MIN) out.push(run); return; }
    for (let i = 0; i + FRAG_MAX <= run.length; i += FRAG_STRIDE) out.push(run.slice(i, i + FRAG_MAX));
    // 尾巴也留（否则「句尾那个专名词」永远进不了判定面）
    const tail = run.slice(run.length - FRAG_MAX);
    if (out[out.length - 1] !== tail) out.push(tail);
  }

  /** 把一个块切成确定性片段表：去停用词、去重、长片段在前（特异性优先），受 maxKeys 封顶。 */
  function fragmentsOf(text, maxKeys) {
    const src = String(text == null ? '' : text);
    const out = [];
    src.split(SPLIT_RE).forEach(function (seg) {
      const s = seg.replace(/\s+/g, '');
      if (!s) return;
      // 标签 / 格式行不进片段面（它们是格式，不是内容：`[世态]`、`<b>`）
      if (/^[<>\[\]{}#*|]/.test(s)) return;
      if (STOP[s]) return;
      if (s.length >= FRAG_MIN && s.length <= FRAG_MAX) { out.push(s); return; }
      windowize(s, out);
    });
    const seen = {}, uniq = [];
    out.forEach(function (f) { if (!seen[f]) { seen[f] = 1; uniq.push(f); } });
    uniq.sort(function (a, b) { return (b.length - a.length) || (a < b ? -1 : a > b ? 1 : 0); });
    const cap = (typeof maxKeys === 'number' && maxKeys > 0) ? maxKeys : DEF.maxKeys;
    return uniq.slice(0, cap);
  }

  /** 英文 / 数字 token 补充面：专名与编号在中文块里常以 ASCII 出现（与片段面互补）。 */
  function tokensOf(text, maxKeys) {
    const src = String(text == null ? '' : text);
    const m = src.match(/[A-Za-z][A-Za-z0-9_]{2,}/g) || [];
    const seen = {}, uniq = [];
    m.forEach(function (t) { const k = t.toLowerCase(); if (!seen[k]) { seen[k] = 1; uniq.push(k); } });
    const cap = (typeof maxKeys === 'number' && maxKeys > 0) ? maxKeys : DEF.maxKeys;
    return uniq.slice(0, cap);
  }

  /**
   * 条目行抽取（采纳率的判定单位）。
   *   只认「像一条状态」的行：跳过 `- `/`\u00b7 ` 引导符与标签行（`<`/`[`/`{` 开头），
   *   其余压平空白后入表。行序保持原序（同一条结果可复现）。
   *   为什么必须与片段面分开：片段面是所有字，行面是「能被单独吸收的一笔状态」——
   *   两者合成一个就再也答不出「念了个词」与「真用上了」的差（本模块的口径 ?）。
   */
  function entriesOf(text, capLines) {
    const src = String(text == null ? '' : text);
    const out = [];
    src.split(/\r?\n/).forEach(function (ln) {
      let s = ln.replace(/^[\s\-\u00b7\u2022]+/, '').replace(/\s+/g, ' ').trim();
      if (!s) return;
      if (/^[<\[\{]/.test(s)) return;               // 标签行 / 结构行：不是可吸收的一笔状态
      if (out.length >= (capLines || 64)) return;
      out.push(s);
    });
    return out;
  }

  // ── 现场容器（两处，均为进程态）──────────────────────────────
  //   `_pending`：最近一次观察（还没结算的那一轮注入）；`_rounds`：已结算轮次环。
  //   两个都是内存态：**不落盘**（读数跨会话没有意义 —— 预算与正文都不是同一批了），
  //   故不登记 store 骨架键、不进 __BOUNDED_CAPS（无存档键可登），上界由本文件的 cap 承担。
  let _pending = null;
  const _rounds = [];

  function cfgOn() { return settings().enabled !== false; }

  /** 自身耗时入性能台账（不进本模块的账）：观测不污染被观测者。 */
  function markSelf(ms, n) {
    const v = (typeof ms === 'number' && isFinite(ms) && ms >= 0) ? ms : 0;
    _stat.selfMs += v;
    try {
      if (WA.perfLedger && typeof WA.perfLedger.ingest === 'function') {
        _stat.perfIngest++;
        WA.perfLedger.ingest({ '\u6ce8\u5165\u4ef7\u503c\u8bc4\u4f30': { ms: v, n: (n || 1) } });
      }
    } catch (e) { /* 入账失败不影响评估本身 */ }
  }

  /**
   * 观察口：登记这一轮真落地了哪些源与什么内容。
   *   唯一生产方 = `render/inject.js` 的注入链末尾（就在 lastInjection 写入之后）。
   *   口径三条：
   *     ① 只收**真落地项**（预算折叠 / 丢弃的不收）——被折叠的源「零引用」不成立；
   *     ② 同源多项合并（一个源可能落多个块）；
   *     ③ 同一轮重复观察（再生/重步）**后者覆盖前者**（后者才是决定本次正文的那份）。
   * @param {{round?:number, items:Array<{source:string,content:string}>}} rec
   */
  function observe(rec) {
    if (!cfgOn()) { noteSkip('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!rec || typeof rec !== 'object' || !Array.isArray(rec.items)) {
      noteSkip('type'); return { ok: false, reason: 'type', field: 'items', got: typeof (rec && rec.items) };
    }
    const t0 = wallNow();
    const cfg = settings();
    const round = (typeof rec.round === 'number' && isFinite(rec.round)) ? rec.round : currentRound();
    const bySource = {};
    let overCap = 0;
    rec.items.forEach(function (it) {
      const name = it && it.source ? String(it.source) : '';
      if (!name) return;
      let slot = bySource[name];
      if (!slot) {
        if (Object.keys(bySource).length >= CAP_SOURCES) { overCap++; return; }
        slot = bySource[name] = { frags: [], toks: [], entries: [] };
      }
      const content = (it && it.content) || '';
      slot.frags = slot.frags.concat(fragmentsOf(content, cfg.maxKeys));
      slot.toks = slot.toks.concat(tokensOf(content, cfg.maxKeys));
      slot.entries = slot.entries.concat(entriesOf(content, 64));
    });
    // 源内去重（同步多块时同一片段会重复出现，重复计数会人为抬高引用率）
    Object.keys(bySource).forEach(function (k) {
      const s = bySource[k];
      s.frags = s.frags.filter(function (v, i, a) { return a.indexOf(v) === i; });
      s.toks = s.toks.filter(function (v, i, a) { return a.indexOf(v) === i; });
    });
    if (overCap) noteSkip('source-cap');
    _stat.observes++;
    if (_pending && _pending.round === round) _stat.reObserved = (_stat.reObserved || 0) + 1;
    _pending = { round: round, at: wallNow(), sources: bySource, sourceCount: Object.keys(bySource).length };
    markSelf(wallNow() - t0, 1);
    return { ok: true, round: round, sources: _pending.sourceCount };
  }

  /** 跨源通用片段（df ≥ 2）：命中了也说明不了任何关于这个源的事。 */
  function commonFragments(sources, sourceCount) {
    const df = {};
    Object.keys(sources).forEach(function (name) {
      sources[name].frags.forEach(function (f) { df[f] = (df[f] || 0) + 1; });
    });
    const common = {};
    // 在册源数 ≤ 1 时不判通用：只有一个源时「跨源通用」根本不可判定，
    //   把它当成「没有通用片段」会静默抬高独有引用率（不可判定 ≠ 判定为无）。
    if (sourceCount > 1) Object.keys(df).forEach(function (f) { if (df[f] >= 2) common[f] = 1; });
    return common;
  }

  /**
   * 判定一个源在正文里的价值三级读数（纯函数，不写任何状态）。
   *   ref         片段级引用数（含跨源通用片段）
   *   refDistinct 片段级引用数（**排除**跨源通用片段）——榜单排序跟它走
   *   adopt       条目行级采纳数（严格面：这一笔状态是否被正文真的吸收）
   */
  function judgeSource(slot, common, text, lower) {
    let ref = 0, refDistinct = 0, hits = 0;
    slot.frags.forEach(function (f) {
      if (text.indexOf(f) < 0) return;
      hits++;
      ref++;
      if (common[f]) return;
      refDistinct++;
    });
    slot.toks.forEach(function (t) {
      if (lower.indexOf(t) < 0) return;
      hits++;
      ref++;                     // token 面同样计入 ref（它也是「被提到」）
      refDistinct++;             // 但**不计入 common**：英文专名天然特异，跨源同形不影响
    });
    let adopt = 0;
    slot.entries.forEach(function (e) { if (text.indexOf(e) >= 0) adopt++; });
    const cf = Object.keys(common).length;
    return { ref: ref, refDistinct: refDistinct, adopt: adopt, hits: hits,
      covered: slot.frags.length + slot.toks.length, entries: slot.entries.length,
      commonFrags: cf, refRate: rate(ref, slot.frags.length + slot.toks.length),
      refRateDistinct: rate(refDistinct, slot.frags.length + slot.toks.length),
      adoptRate: rate(adopt, slot.entries.length) };
  }
  function rate(n, d) { return d > 0 ? Math.round((n / d) * 1000) / 10 : null; }

  /**
   * 结算口：判定上一轮注入在本楼层正文里的价值。
   *   唯一生产方 = `core/interceptor.js` 的 after 钩子（**在 after 链推进世界之前** ——
   *   推进之后当前轮次已经走到下一轮，拿它比对会把每轮都报成「轮次不符」）。
   *   轮次不符一律拒答（`stale-round`），不拿别的轮的正文凑数。
   */
  function settle(text) {
    if (!cfgOn()) { noteSkip('disabled'); return { ok: false, reason: 'disabled' }; }
    if (typeof text !== 'string') { noteSkip('type'); return { ok: false, reason: 'type', field: 'text', got: typeof text }; }
    const t0 = wallNow();
    if (!_pending) { noteSkip('no-reading'); markSelf(wallNow() - t0, 1); return { ok: false, reason: 'no-reading' }; }
    const cur = currentRound();
    if (cur && _pending.round !== cur) {
      noteSkip('stale-round');
      markSelf(wallNow() - t0, 1);
      return { ok: false, reason: 'stale-round', observed: _pending.round, current: cur };
    }
    const pending = _pending;
    _pending = null;
    if (pending.sourceCount === 0) { noteSkip('empty-observation'); markSelf(wallNow() - t0, 1); return { ok: false, reason: 'empty-observation' }; }
    let body = text;
    if (body.length > MAX_TEXT) { body = body.slice(0, MAX_TEXT); _stat.textTruncated++; }
    if (body.length < MIN_TEXT) { noteSkip('text-too-short'); markSelf(wallNow() - t0, 1); return { ok: false, reason: 'text-too-short', len: body.length }; }
    const lower = body.toLowerCase();
    const common = commonFragments(pending.sources, pending.sourceCount);
    const rows = {};
    let zeroStreak = 0;
    Object.keys(pending.sources).forEach(function (name) {
      const j = judgeSource(pending.sources[name], common, body, lower);
      rows[name] = j;
      if (j.refRateDistinct === null || j.refRateDistinct === 0) zeroStreak++;
    });
    const rec = { round: pending.round, at: pending.at, judgedAt: wallNow(),
      len: body.length, sources: rows, sourceCount: pending.sourceCount,
      commonFrags: Object.keys(common).length };
    _rounds.push(rec);
    while (_rounds.length > CAP_ROUNDS) { _rounds.shift(); _stat.dropped = (_stat.dropped || 0) + 1; }
    _stat.settles++;
    _stat.judged++;
    _stat.lastReason = zeroStreak ? 'judged-with-zero' : 'judged';
    markSelf(wallNow() - t0, 1);
    return { ok: true, round: rec.round, sources: rec.sourceCount, zeroRef: zeroStreak, len: rec.len };
  }

  /**
   * 榜单出口（唯一产品读侧）——「该降谁的档」的那张表。
   *   排序口径：`refDistinct` 均值**升序**（最没用的在前）。为什么不是降序：
   *   这张表是给「处置」用的，不是给「表彰」用的 —— 值得看的是底部那几个。
   *   零读数源（一次都没被判定过）排在判定过的之后并单独标记：
   *   「没量到」不能长得像「量出来很差」（本模块口径 ③）。
   */
  function report(opt) {
    const cfg = settings();
    const topN = (opt && typeof opt.topN === 'number' && opt.topN > 0) ? Math.floor(opt.topN) : 12;
    const agg = {};
    const order = [];
    _rounds.forEach(function (r) {
      Object.keys(r.sources).forEach(function (name) {
        let a = agg[name];
        if (!a) { a = agg[name] = { source: name, rounds: 0, refs: 0, dists: 0, adopts: 0,
          zeroStreak: 0, lastRound: null, judged: 0, flagged: false }; order.push(name); }
        const j = r.sources[name];
        a.rounds++;
        a.refs += j.ref;
        a.dists += j.refDistinct;
        a.adopts += j.adopt;
        a.judged++;
        a.lastRound = r.round;
        // 零引用连击只认「最近连续」：一旦出现一次非零引用就归零。
        //   （累计零引用数回答不了「最近怎么样」，处置要的是后者）
        a.zeroStreak = (j.refDistinct === 0) ? a.zeroStreak + 1 : 0;
      });
    });
    const rows = order.map(function (name) {
      const a = agg[name];
      const n = a.rounds || 1;
      const flagged = a.zeroStreak >= cfg.zeroRefRounds;
      return { source: a.source, rounds: a.rounds, lastRound: a.lastRound,
        refAvg: Math.round((a.refs / n) * 100) / 100,
        refDistinctAvg: Math.round((a.dists / n) * 100) / 100,
        adoptAvg: Math.round((a.adopts / n) * 100) / 100,
        zeroStreak: a.zeroStreak, flagged: flagged,
        // 冗余检出码：只在「连续 N 轮零引用」时给出（本模块对外的唯一处置建议）
        code: flagged ? 'value.zero-ref' : null };
    });
    // 稳序：先按 distinct 均值升序，零连击降序；无判定的（rounds 0 不会出现，已在上游跳过）排在后面
    rows.sort(function (a, b) {
      if (a.refDistinctAvg !== b.refDistinctAvg) return a.refDistinctAvg - b.refDistinctAvg;
      if (a.zeroStreak !== b.zeroStreak) return b.zeroStreak - a.zeroStreak;
      return (a.source < b.source ? -1 : a.source > b.source ? 1 : 0);
    });
    const flagged = rows.filter(function (x) { return x.flagged; });
    return { ok: true, rounds: _rounds.length, cap: CAP_ROUNDS,
      sources: rows.length, zeroRefRounds: cfg.zeroRefRounds,
      flagged: flagged.map(function (x) { return x.source; }),
      rows: rows.slice(0, topN),
      note: rows.length ? null : '\u8fd8\u6ca1\u6709\u5df2\u7ed3\u7b97\u7684\u8f6e\u6b21\uff08\u8bfb\u6570\u7a7a\u4e0d\u7b49\u4e8e\u201c\u90fd\u6ca1\u7528\u4e0a\u201d\uff09' };
  }

  function statOf() {
    const cfg = settings();
    return {
      enabled: cfg.enabled !== false, zeroRefRounds: cfg.zeroRefRounds, maxKeys: cfg.maxKeys,
      observes: _stat.observes, settles: _stat.settles, judged: _stat.judged, reObserved: _stat.reObserved || 0,
      rounds: _rounds.length, pending: !!_pending,
      sources: _rounds.length ? Object.keys(_rounds[_rounds.length - 1].sources).length : 0,
      selfMs: Math.round(_stat.selfMs * 1000) / 1000, perfIngest: _stat.perfIngest,
      textTruncated: _stat.textTruncated, dropped: _stat.dropped || 0,
      lastReason: _stat.lastReason || '', skipReasons: Object.assign({}, _stat.skipReasons),
      caps: { rounds: CAP_ROUNDS, sources: CAP_SOURCES, text: MAX_TEXT }
    };
  }

  WA.injectValue = {
    observe: observe,
    settle: settle,
    report: report,
    stat: statOf,
    getSettings: settings,
    setSettings: saveSettings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/inject-value.js', { kind: 'engine', ver: '2.150.0' });
})();
