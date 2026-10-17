/**
 * WorldAxis engines/evidence-board.js (v2.222.0) — 调查证据工作台（拓展 N4）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   本仓早就有了四块**互相接得上、却谁也不回答同一个问题**的面：
 *     · `probe` 有卷宗：问题 + 多假说 + 支持/反驳**各自留行**（不取平均），
 *       但它答的是「这个案子里支持几条反驳几条」；
 *     · `investigation` 有线索与证据回执（`register` / `investigate` / `checkEvidence`），
 *       但它答的是「这条线索查没查、采到几条」；
 *     · `rumor` 有转述链与逐跳经手（`startChain` / `relay` / `investigate`），
 *       但它答的是「这条链传到第几层、有没有被改写」；
 *     · `intel` / `noesis` 有真相、资格、知情边界与在岗，但它们答的是
 *       「这个人**有没有资格**知道」。
 *   现场缺的那一问是：**「这张案子现在有哪些边（支持 / 反证 / 来源链 / 证人 / 还能做的调查动作），
 *   哪几条是独立的、哪几条只是同一条消息又转了一次手，撤回某条来源之后哪些结论受影响」**。
 *   没有这一面，每个消费方（面板 / 模型 / 专锁）都得自己把四块拼一遍 —— 而拼出来的判据
 *   必然慢慢漂开（本仓反复治过的那一类：两处各算一遍，迟早答出两个答案）。
 *
 * ── 本模块只做五件事，**一次判定都不复制、一个字节都不落盘** ──────────
 *   ① `board(caseId, opts)`    —— **证据图**：以卷宗（`probe` 的案子）为根，把五类边
 *      逐条**现取**：支持 / 反证（来自案件自己的举证行）、来源链（来自 `rumor` 的链，
 *      **只认调用方显式给的 `facts` 映射**，不猜）、证人（来自 `investigation` 的线索证人位）、
 *      调查动作（来自仍未解决的线索）。每一行都带 `independent` / `relayed` 与 `origin`；
 *      `stamp` 是可复算指纹（调用方回带，本模块只比对不存储）。
 *   ② `assertClaim(caseId, claim, opts)` —— **记一条主张**：原样转发 `probe.addEvidence`。
 *      来源等级逐字取自 `probe.LEVELS`（**不自带副本** —— 两套尺子必然分叉），
 *      本模块不开事务、不碰 draft、不自己记行。
 *   ③ `retract(caseId, opts)`  —— **撤回一条来源**：按 `kind` 原样转发来源模块**自己的撤回口**
 *      （`rumor.refute` / `intel.correct` / `probe.wrong`），随后**现取重算**图谱，
 *      回答那个只有这张面答得出的问题：**「撤了这一条，哪些结论受影响」**（`affected`）。
 *      比对基准是调用方回带的 `stamp`（与 `board` 同源；存一份就等于造了第二份状态容器）。
 *   ④ `gather(caseId, opts)`   —— **调查动作**：原样转发 `investigation.investigate`
 *      （线索 + 经手人 + `receiptId` 去重），把来源的回执原样交回。
 *   ⑤ `playerView(caseId, opts)` —— **玩家图谱**：只出此人获知的面（未获知的事实不进图谱）。
 *
 * ── 与既有模块的分工（一句话：本模块只加边，不加真相）──
 *   · `probe`        —— 卷宗真源：问题 / 假说 / 举证 / 定案。本模块**调** `probe.tally`，
 *                       不自己数支持条数（数两遍迟早数出两个数）。
 *   · `investigation`—— 线索真源：本模块只读它的线索表与悬而未决清单，写一律走它的口。
 *   · `rumor`        —— 转述链真源：本模块只读链与逐跳，撤回走 `refute`。
 *   · `intel`        —— 真相与资格真源：玩家图谱的 `truth` 直接取 `intel.project` 的读数。
 *   · `noesis`       —— 知情边界真源：玩家图谱的 `knows` 取 `noesis.knows` 的读数。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **不另存第二份真相**：全文零 `WA.store.transact`、零 draft 赋值。图谱每次现取，
 *     故「撤回来源更新受影响结论」是**结构性质**而不是一次同步动作 —— 没有副本可过期。
 *   2 **不新增拒收码语义**：编排层自身的失败另开 `fault` 命名空间（见 `FAULTS`）；
 *     凡是来源模块已有的拒收码（`unknown-case` / `missing-claim` / …）**原样透传**，
 *     本模块不改写、不包装（保住它自己的 `reason` 与参数）。
 *   3 **重复转述不作独立证据**：同一 `factKey` 上多条链只算**一条**独立证据，
 *     其余如实标 `relayed:true`（并给出它转的是谁的）——**减去**它们不等于把它们删掉。
 *   4 **不做参数校验**：缺案名 / 缺主张 / 缺链名一律由**来源口自己**拒收。
 *     本模块再判一遍就是两个真源，且现场无法归因「这到底是编排层拦的还是引擎拦的」。
 *   5 **玩家图谱不含未获知事实**：`playerView` 只出 `intel.project` 给的读数 ——
 *     无资格者 `truth:null`、`withheld` 只报条数；`rumor` 面只收公开层（转述与流言不过玩家面）。
 *   6 **预览是进程态交互物**：`stamp` 由**调用方回带**，本模块只比对不存储。
 *   7 **全关即零存在**：五个口一律拒 `board-off`，不改任何上游行为、不产注入块（本模块**没有** `buildBlock`）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.222.0';
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  // ── 设置（同一格偏好键；不是世界事实，按本仓先例走 settingsBus）──
  const LS_KEY = 'worldaxis_evidence_board_settings_v1';
  const DEF = { enabled: false, maxEdges: 40, maxCases: 6 };
  const __REG = { key: LS_KEY, def: DEF, module: 'evidenceBoard',
    bounds: { maxEdges: [4, 96], maxCases: [1, 16] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // ── 编排层失败码（**fault 命名空间**，与来源的 reason 命名空间分列）──
  //   只装**编排层自身**能产生的失败，且每一个码都要有恢复动作：
  //   `board-off` 去开开关 / `bad-case` 去给对案 id / `module-missing` 去开或装对应引擎 /
  //   `bad-target` 去把撤回目标补全。
  //   来源模块自己的拒收（案号查无此案 / 主张缺字段 / 链名不存在 / 链上拒收）**不是编排层失败**，
  //   它们是**来源给的答案**，原样透传、不占本命名空间。
  const FAULTS = ['board-off', 'bad-case', 'module-missing', 'bad-target'];
  // 图边词表单一真源：面板、专锁与本模块共用它（自造边名 = 自造判定面）。
  const EDGE_TYPES = ['support', 'refute', 'chain', 'witness', 'action'];
  const stat = { boards: 0, asserted: 0, retracts: 0, gathers: 0, rejects: 0, faults: {},
    blocked: 0, lastReason: '',
    // 「这张图上共有几条边」与「其中几条只是转述」分列 —— 合成一栏就再也答不出
    // 「证据到底有几条是独立的」。
    edges: 0, independent: 0, relayed: 0, affected: 0, rows: 0 };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.blocked++; stat.lastReason = code; }
  function fail(code, extra) { noteFault(code); return Object.assign({ ok: false, fault: code }, extra || {}); }
  // ── 既有读表（**唯一真源**：本模块不落第二份卷宗/线索/链）──
  function state() { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; }
  /** 卷宗**只读**：本模块不落自己的案子容器（案子由 `probe` 立案）。 */
  function caseOf(caseId) {
    const pr = state().probe;
    const rows = (pr && Array.isArray(pr.cases)) ? pr.cases : [];
    const k = clean(caseId, 60);
    if (!k) return null;
    return rows.filter(function (r) { return r && clean(r.id, 60) === k; })[0] || null;
  }
  /** 支持 / 反驳条数**只问 probe**（数两遍迟早数出两个数）。 */
  function tallyOf(caseId, hid) {
    if (WA.probe && typeof WA.probe.tally === 'function') {
      try { return WA.probe.tally(caseId, hid); } catch (e) { return null; }
    }
    return null;
  }
  /** 线索表**只读**（写一律走 investigation 自己的口）。 */
  function cluesOf() {
    const inv = state().investigation;
    return (inv && Array.isArray(inv.clues)) ? inv.clues : [];
  }
  /** 转述链**只读**（撤回走 rumor.refute）。 */
  function chainsOf() {
    const r = state().rumor;
    return (r && Array.isArray(r.chains)) ? r.chains : [];
  }
  /** 某 `factKey` 上的来源链（逐条，含层与经手跳数）。 */
  function chainsOn(fk) {
    const out = [];
    chainsOf().forEach(function (c) {
      if (!c) return;
      if (clean(c.factKey, 80) !== fk) return;
      const hops = Array.isArray(c.hops) ? c.hops : [];
      out.push({ id: clean(c.id, 60), layer: clean(c.layer, 20), intact: !!c.intact,
        hopCount: hops.length, factValue: c.factValue, blocked: (c.suppressed || []).length });
    });
    return out;
  }
  /**
   * ── 证据图：五类边逐条现取 ─────────────────────────────────
   *   `opts.facts` 是 `{ 假说id: factKey }` 的**显式**映射 —— 不给就不出链 / 证人 / 动作三类边，
   *   并如实标 `factsGiven:false`。不猜：从假说文本里反查事实锚点，等于让「我觉得该查这个」当锚点
   *   （与 `probe.view` 的 `opts.fact`、`investigation.register` 的 subject 同一口径）。
   */
  function edgesOf(c, opts) {
    const o = opts || {};
    const facts = (o.facts && typeof o.facts === 'object') ? o.facts : {};
    const rows = [];
    const seenWitness = {};
    // 同一**事实**只出**一条**独立链边 —— 去重按 factKey（不是按 (假说, 链)）：
    //   同一条消息被搬去支持两个假说，那两个假说拿到的仍是**同一条证据**，
    //   分开算就等于把一次转述拆成两条独立证据（本仓点名过的「堆数量冒充证据」）。
    const seenFact = {};
    const evs = Array.isArray(c.evidence) ? c.evidence : [];
    evs.forEach(function (e) {
      if (!e) return;
      const dir = (clean(e.dir, 20) === 'refute') ? 'refute' : 'support';
      rows.push({ type: dir, dir: dir, hypothesis: clean(e.hypothesis, 40),
        claim: clean(e.claim, 80), level: clean(e.level, 20), who: clean(e.by, 40),
        origin: 'case:' + clean(c.id, 60) + ':ev:' + clean(e.id, 60),
        independent: true, relayed: false, relays: '', why: '' });
    });
    Object.keys(facts).forEach(function (hid) {
      const fk = clean(facts[hid], 80);
      if (!fk) return;
      // ── 来源链边：同一 factKey 至多一条独立（其余是同一条消息的转述版本）──
      //   **方向一律空**：链自己说的是「这件事传到哪儿了、值还是不是原来那个」，
      //   它没有说「所以我支持哪个假说」—— 替它声明方向就是替世界下结论（本仓的「不猜」）。
      //   要按链断案，那是 `probe.resolve` 的活（它按来源等级判，不是按谁在场判）。
      const on = chainsOn(fk);
      on.forEach(function (ch, i) {
        const dup = !!seenFact[fk] || i > 0;
        if (!seenFact[fk]) seenFact[fk] = ch.id;
        rows.push({ type: 'chain', dir: '', hypothesis: clean(hid, 40),
          claim: String(ch.factValue == null ? fk : ch.factValue), level: 'rumor',
          who: '', factKey: fk, chainId: ch.id, layer: ch.layer, intact: ch.intact, hops: ch.hopCount,
          origin: 'chain:' + ch.id,
          independent: !dup, relayed: dup,
          relays: dup ? ('chain:' + seenFact[fk]) : '',
          why: dup ? '同一事实已有独立链（重复转述不作独立证据）' : '' });
      });
      // ── 证人边 / 调查动作边：只认线索表里 subject 对得上的那些 ──
      cluesOf().forEach(function (cl) {
        if (!cl || clean(cl.subject, 80) !== fk) return;
        const wkey = fk + '@' + clean(cl.witness, 60);
        if (clean(cl.witness, 60) && !seenWitness[wkey]) {
          seenWitness[wkey] = true;
          rows.push({ type: 'witness', dir: 'support', hypothesis: clean(hid, 40),
            claim: clean(cl.witness, 60), level: 'witness', who: clean(cl.witness, 60),
            factKey: fk, clueId: clean(cl.id, 60),
            origin: 'clue:' + clean(cl.id, 60) + ':witness',
            independent: true, relayed: false, relays: '', why: '' });
        }
        if (clean(cl.status, 20) !== 'resolved') {
          rows.push({ type: 'action', dir: '', hypothesis: clean(hid, 40),
            claim: clean(cl.title, 80), level: '', who: '', factKey: fk, clueId: clean(cl.id, 60),
            cost: num(Number(cl.cost)) || 0, costType: clean(cl.costType, 30),
            location: clean(cl.location, 60), clueStatus: clean(cl.status, 20),
            origin: 'clue:' + clean(cl.id, 60) + ':act',
            independent: true, relayed: false, relays: '', why: '' });
        }
      });
    });
    return rows;
  }
  /**
   * 可复算指纹。**含每条边的可观测读数**（不只是类型与来源位）：
   *   为什么必须含读数：只有「有几条边」不够 —— `rumor` 的辟谣一跳**不会改变边的条数**，
   *   它改变的是这条链的**层与完整位**（`fact` → `witness`/`hearsay`，`intact` 翻假）。
   *   少了这一段，「来源变了」就成了一条只在边数增减时才亮的灯。
   */
  function stampFrom(rows) {
    if (!Array.isArray(rows)) return 'bad-shape';
    return ['v2'].concat(rows.map(function (r) {
      const read = r.type === 'chain'
        ? (r.layer + '/' + (r.intact ? 'i' : 't') + '/' + r.hops)
        : (r.type === 'action' ? ('@' + r.clueStatus) : (r.type === 'witness' ? ('@' + r.who) : ''));
      return r.type + ':' + (r.origin || '') + ':' + (r.independent ? '1' : '0') + (read ? (':' + read) : '');
    })).join('|');
  }
  /**
   * 逐假说的读数。**来源条数取自 probe**（不重算），本模块只加两栏：
   *   `independent*`（有独立来源的条数）与 `relayed*`（其中只是转述的）。
   *   链边**不算支持也不算反证**（它没声明方向）：单列 `chains`，让读者自己看。
   */
  function ranksOf(c, rows) {
    const hyps = Array.isArray(c.hypotheses) ? c.hypotheses : [];
    return hyps.map(function (h) {
      const hid = clean(h && h.id, 40);
      const t = tallyOf(c.id, hid) || { support: 0, refute: 0, refuters: [] };
      const mine = rows.filter(function (r) {
        return clean(r.hypothesis, 40) === hid && r.independent === true;
      });
      const supInd = mine.filter(function (r) { return r.type === 'support'; }).length;
      const refInd = mine.filter(function (r) { return r.type === 'refute'; }).length;
      const chInd = mine.filter(function (r) { return r.type === 'chain'; }).length;
      return { hypothesis: hid, text: clean(h && h.text, 60),
        support: t.support, refute: t.refute,
        independentSupport: supInd, independentRefute: refInd, chains: chInd,
        relayedSupport: Math.max(0, t.support - supInd),
        net: t.support - t.refute, independentNet: supInd - refInd };
    });
  }
  /** ① 证据图（只读）。 */
  function board(caseId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('board-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const c = caseOf(caseId);
    if (!c) return fail('bad-case', { caseId: clean(caseId, 60) });
    const all = edgesOf(c, o);
    const rows = all.slice(0, Math.max(1, Math.floor(num(cfg.maxEdges) || DEF.maxEdges)));
    const byType = EDGE_TYPES.reduce(function (a, k) {
      a[k] = rows.filter(function (r) { return r.type === k; }).length; return a; }, {});
    const ind = rows.filter(function (r) { return r.independent === true; }).length;
    const rel = rows.filter(function (r) { return r.relayed === true; }).length;
    stat.boards++; stat.edges += rows.length; stat.independent += ind; stat.relayed += rel;
    stat.lastReason = rel ? 'board-relayed' : 'board-ok';
    return {
      ok: true, fault: null,
      caseId: clean(c.id, 60), question: clean(c.question, 80),
      status: clean(c.status, 20), verdict: clean(c.verdict, 20),
      factsGiven: !!(o.facts && Object.keys(o.facts).length),
      edges: rows, edgeCount: rows.length, truncated: all.length > rows.length,
      byType: byType,
      independent: ind, relayed: rel,
      ranks: ranksOf(c, rows),
      stamp: stampFrom(rows),
      basisNote: '支持/反驳条数取自 WA.probe.tally（不重算）；来源链 / 证人 / 动作逐条现取'
        + ' —— 本模块不落盘，故撤回来源后台账自动跟上，没有副本可过期'
    };
  }
  /** ② 记一条主张：原样转发 `probe.addEvidence`。来源等级**逐字取自 probe.LEVELS**。 */
  function assertClaim(caseId, claim, opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('board-off');
    if (!WA.probe || typeof WA.probe.addEvidence !== 'function') return fail('module-missing', { module: 'probe', need: ['addEvidence'] });
    const o = (opts && typeof opts === 'object') ? opts : {};
    let r = null;
    try { r = WA.probe.addEvidence(caseId, claim, o); } catch (e) { r = { ok: false, reason: 'probe-threw' }; }
    if (r && r.ok === true) { stat.asserted++; stat.lastReason = 'asserted'; }
    else { stat.rejects++; stat.lastReason = 'assert-rejected'; }
    // 来源回执**原样**交回（本模块不改写它的 reason、不补自己的码）。
    return r || { ok: false, reason: 'probe-threw' };
  }
  /**
   * ③ 撤回一条来源：按 `kind` 转发来源模块**自己的撤回口**，随后**现取重算**图谱，
   *    答那个只有这张面答得出的问题：**「撤了这一条，哪些结论受影响」**。
   *
   * ── 为什么要如实标 `via` / `semantics`（而不是笼统叫「撤回」）──────────
   *   三个来源模块各自的「撤回」在世界上是**三件不同的事**，混成一句话就是谎报：
   *     · `rumor` → 走 `rumor.refute`：这是**公开否认**，它在链上记**一跳**（层只许向下、
   *       值不许改）。它**不会删掉那条链**，「传到最后还是不是原来那条」照旧答得出 ——
   *       变的只是这条边的**层与完整位**；
   *     · `intel` → 走 `intel.correct`：只对**已经收到过这条说法的人**生效（没听过就拒
   *       `nothing-to-correct`），它把旧说法标 `retracted` 并补一条更正行；
   *     · `probe` → 走 `probe.wrong`：这是**误指留痕**，它把卷宗结掉（`status:'closed'`
   *       / `verdict:'clear'`）并留一行 `wrongs`。它**不改举证行**。
   *   所以「哪些结论受影响」也必须分三面各报：`affected`（逐假说的支持/反驳条数，取自
   *   `probe`）、`drift`（图谱指纹是否变）、`viewChanged`（玩家视角读数是否变）。
   *   三面各自的差都**现取现比**，没有副本可过期。
   */
  function retract(caseId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('board-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const c0 = caseOf(caseId);
    if (!c0) return fail('bad-case', { caseId: clean(caseId, 60) });
    const kind = clean(o.kind, 20);
    if (['rumor', 'intel', 'probe'].indexOf(kind) < 0) return fail('bad-target', { kind: kind, known: ['rumor', 'intel', 'probe'] });
    const was = clean(o.stamp, 800);
    // `stale` 的**同面前提**必须写清楚：它与 `stamp` 由同一对参数（`facts` / `person`）算出。
    //   换成另一组 `facts` 去比对上一次的指纹，比出来的是「两次问的不是同一张图」——
    //   那**不是**「世界变了」。故此处只做同面比对，跨面一律不答 `stale`（答了就是谎报）。
    const person = clean(o.person, 60);
    /** 一张「此刻的读数」快照：逐假说计数 + 图谱指纹 + 头部态 + 玩家行。**只读**。 */
    const snapOf = function (cc) {
      const rows = edgesOf(cc, o);
      const tal = (Array.isArray(cc.hypotheses) ? cc.hypotheses : []).map(function (h) {
        const hid = clean(h && h.id, 40); const t = tallyOf(cc.id, hid) || { support: 0, refute: 0 };
        return { hypothesis: hid, support: t.support, refute: t.refute };
      });
      let view = null;
      if (person) {
        // 走**同一个**读数核心（不计数）：两处各算一遍迟早答出两个答案。
        const vr = viewRows(cc, person, o.facts);
        view = vr.rows.map(function (r) {
          return r.factKey + '|' + String(r.known) + '|' + String(r.truth) + '|' + r.withheld + '|' + (r.mayAssert ? '1' : '0');
        }).join(' ');
      }
      return { rows: rows, stamp: stampFrom(rows), status: clean(cc.status, 20), verdict: clean(cc.verdict, 20),
        tally: tal, view: view, count: rows.length };
    };
    const before = snapOf(c0);
    let rec = null, via = '';
    if (kind === 'rumor') {
      if (!WA.rumor || typeof WA.rumor.refute !== 'function') return fail('module-missing', { module: 'rumor', need: ['refute'] });
      const cid = clean(o.chainId, 80);
      if (!cid) return fail('bad-target', { kind: kind, need: ['chainId'] });
      via = 'rumor.refute';
      // `rumor.refute` 落到 `doHop`：它要的是**这一跳**的 `from`/`to`（谁对谁公开否认），
      //   不是「把哪条链删掉」（链不删）。缺 `from` 由来源自己拒 `missing-fields`，
      //   本模块不去替它补一个「大概是谁」（那等于替世界编一个经手人）。
      try { rec = WA.rumor.refute(cid, { from: clean(o.from, 60), to: clean(o.to, 60), why: clean(o.why, 80) }); }
      catch (e) { rec = { ok: false, reason: 'rumor-threw' }; }
    }
    if (kind === 'intel') {
      if (!WA.intel || typeof WA.intel.correct !== 'function') return fail('module-missing', { module: 'intel', need: ['correct'] });
      const who = clean(o.person2, 60) || person;
      if (!who || !clean(o.about, 80) || !clean(o.claim, 100)) return fail('bad-target', { kind: kind, need: ['person2', 'about', 'claim'] });
      via = 'intel.correct';
      try { rec = WA.intel.correct(who, { about: clean(o.about, 80), claim: clean(o.claim, 100),
        right: clean(o.right, 100), source: clean(o.source, 60) }); }
      catch (e) { rec = { ok: false, reason: 'intel-threw' }; }
    }
    if (kind === 'probe') {
      if (!WA.probe || typeof WA.probe.wrong !== 'function') return fail('module-missing', { module: 'probe', need: ['wrong'] });
      const who = clean(o.who, 60);
      if (!who) return fail('bad-target', { kind: kind, need: ['who'] });
      via = 'probe.wrong';
      try { rec = WA.probe.wrong(caseId, who, { why: clean(o.why, 80), by: clean(o.by, 60), about: clean(o.about, 40) }); }
      catch (e) { rec = { ok: false, reason: 'probe-threw' }; }
    }
    // 现取重算：来源写完之后**重新读一遍**，三面之差都是这里比出来的。
    const c2 = caseOf(caseId) || c0;
    const after = snapOf(c2);
    const affected = before.tally.filter(function (b) {
      const a = after.tally.filter(function (x) { return x.hypothesis === b.hypothesis; })[0];
      return a && (a.support !== b.support || a.refute !== b.refute);
    }).map(function (b) {
      const a = after.tally.filter(function (x) { return x.hypothesis === b.hypothesis; })[0];
      return { hypothesis: b.hypothesis, supportFrom: b.support, supportTo: a.support,
        refuteFrom: b.refute, refuteTo: a.refute };
    });
    const headChanged = (before.status !== after.status) || (before.verdict !== after.verdict);
    const drift = before.stamp !== after.stamp;
    const viewChanged = person ? (before.view !== after.view) : null;
    stat.retracts++;
    if (rec && rec.ok === true) { stat.affected += affected.length; stat.lastReason = 'retracted'; }
    else { stat.rejects++; stat.lastReason = 'retract-rejected'; }
    return { ok: true, fault: null, caseId: clean(c2.id, 60), kind: kind, via: via,
      semantics: kind === 'rumor' ? '公开否认记一跳（层只许向下、值不许改）；链不被删除'
        : (kind === 'intel' ? '只对已收到该说法者生效：旧说法标 retracted 并补一条更正行'
          : '误指留痕并结案（status/verdict 变），举证行不动'),
      retract: rec || { ok: false, reason: 'no-receipt' },
      stamp: after.stamp, was: was || null, stale: !!was && was !== after.stamp,
      drift: drift, headChanged: headChanged,
      statusFrom: before.status, statusTo: after.status,
      verdictFrom: before.verdict, verdictTo: after.verdict,
      affected: affected, affectedCount: affected.length,
      viewChanged: viewChanged,
      edgeFrom: before.count, edgeTo: after.count,
      note: (affected.length || drift || headChanged || viewChanged === true)
        ? '来源已撤回，读数已变（现取重算，不是另存一份后同步）'
        : '来源已撤回，但此刻这张图的三面读数都没变 —— 如实报「没影响到这里」，不假装有变化' };
  }
  /**
   * ④ 调查动作：原样转发 `investigation.investigate`（线索 + 经手人 + receiptId 去重）。
   *    参数**一律不做校验**：缺线索名 / 缺人 / 缺 receiptId 由来源自己的口拒收。
   */
  function gather(caseId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('board-off');
    if (!WA.investigation || typeof WA.investigation.investigate !== 'function') {
      return fail('module-missing', { module: 'investigation', need: ['investigate'] });
    }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const clueId = clean(o.clueId, 60), by = clean(o.by, 60);
    if (!clueId || !by) return fail('bad-target', { need: ['clueId', 'by'] });
    let r = null;
    try {
      r = WA.investigation.investigate(clueId, by, { receiptId: clean(o.receiptId, 60),
        content: clean(o.content, 200) });
    } catch (e) { r = { ok: false, reason: 'investigation-threw' }; }
    if (r && r.ok === true) { stat.gathers++; stat.lastReason = 'gathered'; }
    else { stat.rejects++; stat.lastReason = 'gather-rejected'; }
    return r || { ok: false, reason: 'investigation-threw' };
  }
  /**
   * ⑤ 玩家图谱：**不含未获知事实**（边界 5）。
   *   `truth` 直接取 `intel.project` 的读数：无资格者恒 `null`，`withheld` 只报条数；
   *   `heard` 只收 `rumor.visibleTo` 的**公开层**（转述与流言不过玩家面）；
   *   `knows` 取 `noesis.knows` 的三态（`true` / `false` / `null`=问不出来）。
   */
  function playerView(caseId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('board-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const c = caseOf(caseId);
    if (!c) return fail('bad-case', { caseId: clean(caseId, 60) });
    const who = clean(o.person, 60);
    if (!who) return fail('bad-target', { need: ['person'] });
    const r = viewRows(c, who, o.facts);
    // 计数只在这一处发生：内部快照（`retract` 的现取重算）走 `viewRows`，**不计入本进程读数** ——
    //   否则一次撤回会把「玩家看了几行」凭空加上两倍（编排层自己偷看不能算成用户在读）。
    stat.rows += r.rows.length;
    return Object.assign({ ok: true, fault: null, caseId: clean(c.id, 60), person: who,
      rowCount: r.rows.length, known: r.known, withheld: r.withheld,
      note: '玩家图谱只出此人获知的事实：无资格者真值恒 null、条数不报内容；rumor 面只收公开层' }, r);
  }
  /**
   * 玩家图谱的**读数核心**（不计数、不改 stat）。`retract` 的现取重算与 `playerView` 共用它，
   *   使「玩家看到什么」只有一份判据 —— 两处各算一遍，迟早答出两个答案。
   */
  function viewRows(c, who, factsIn) {
    const facts = (factsIn && typeof factsIn === 'object') ? factsIn : {};
    const rows = Object.keys(facts).map(function (hid) {
      const fk = clean(facts[hid], 80);
      if (!fk) return null;
      let proj = null;
      if (WA.intel && typeof WA.intel.project === 'function') {
        try { proj = WA.intel.project(fk, who); } catch (e) { proj = { ok: false, reason: 'intel-threw' }; }
      }
      let kn = null;
      if (WA.noesis && typeof WA.noesis.knows === 'function') {
        try { kn = WA.noesis.knows(who, fk); } catch (e) { kn = { ok: false, reason: 'noesis-threw' }; }
      }
      let heard = [];
      if (WA.rumor && typeof WA.rumor.visibleTo === 'function') {
        try {
          const v = WA.rumor.visibleTo(who);
          heard = ((v && v.rows) || []).filter(function (x) { return x && clean(x.factKey, 80) === fk; });
        } catch (e) { heard = []; }
      }
      const entitled = !!(proj && proj.ok === true && proj.entitled === true);
      return { hypothesis: clean(hid, 40), factKey: fk,
        known: kn && kn.ok === true ? (kn.known === null ? null : kn.known === true) : null,
        knowsWhy: (kn && kn.reason) || '',
        entitled: entitled,
        // 未获知事实**不出现在图谱里**：无资格 ⇒ truth 恒 null（连「猜没猜对」都不泄露）。
        truth: entitled ? (proj.truth == null ? null : proj.truth) : null,
        withheld: proj && typeof proj.withheld === 'number' ? proj.withheld : 0,
        heard: heard.map(function (x) { return { chainId: clean(x.id, 60), layer: clean(x.layer, 20), value: x.value }; }),
        mayAssert: !!(proj && proj.mayAssert === true) };
    }).filter(function (x) { return !!x; });
    const known = rows.filter(function (x) { return x.known === true; }).length;
    return { rows: rows, known: known,
      withheld: rows.reduce(function (a, x) { return a + (x.withheld || 0); }, 0) };
  }
  function diagnose() {
    const checks = {
      settingsBus: !!WA.settingsBus,
      probe: !!(WA.probe && typeof WA.probe.addEvidence === 'function' && typeof WA.probe.tally === 'function'),
      investigation: !!(WA.investigation && typeof WA.investigation.investigate === 'function'),
      rumor: !!(WA.rumor && typeof WA.rumor.refute === 'function'),
      intel: !!(WA.intel && typeof WA.intel.project === 'function'),
      noesis: !!(WA.noesis && typeof WA.noesis.knows === 'function')
    };
    const required = ['probe', 'investigation', 'intel'];
    const missing = required.filter(function (k) { return !checks[k]; });
    return { ok: missing.length === 0, module: 'evidenceBoard', ver: VERSION, cfg: settings(), checks: checks,
      required: required.slice(), missing: missing,
      edgeTypes: { declared: EDGE_TYPES.slice() },
      faultCodes: FAULTS.slice(),
      // 来源尺子**不自带副本**：等级表逐字取自 probe（同一把尺子）。
      levelsFrom: (WA.probe && WA.probe.LEVELS) ? 'probe.LEVELS' : '' };
  }
  WA.evidenceBoard = {
    EDGE_TYPES: EDGE_TYPES.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    board: board,
    assertClaim: assertClaim,
    retract: retract,
    gather: gather,
    playerView: playerView,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/evidence-board.js', { kind: 'engine', ver: VERSION });
})();
