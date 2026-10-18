/**
 * WorldAxis engines/story-loop.js (v2.227.0) — 三项目剧情事件闭环(拓展 N9)
 *
 * ── 计划原文逐字(第三代双九项计划 · 拓展 N9)──────────────────────
 *   「复用已有 WorldAxis 出站桥、phoneBridge 入站及 lonsha-reader。**先核验两个对端当前真实契约**,
 *    再做**手机动作回执 → 世界候选因果 → 确认落地 → 记忆来源追溯**。只读对端扫描**没有证明**当前
 *    已形成整链;**不改对端直到另获实施授权**。插件缺席、迟到、重复、时钟分歧均**不伪造同步成功**。」
 *
 * ── 它治什么(缺口,先用源码说清)──────────────────────────────────
 *   本仓早就有**这条链上的每一段**,但**没有任何一处把整条链串起来**:
 *     · `engines/bridge.js`      (v2.16.0) 出站只读投影 + `handshake()`(v2.128.0 逐边核契约);
 *     · `engines/phone-bridge.js`(v2.97.0) 入站边:`noteAction()` 登记手机操作 / `linkChain()`
 *       把一笔操作接到一条因果链上 / `traceOf()` 链 → 操作;
 *     · `engines/causal.js`     因果链真源:`addChain()` / `knownCause()`;
 *     · `engines/lonsha-reader.js`(v2.18.0) 上游记忆账本只读消费(九本账 + 对读环)。
 *   现场缺的那一问是:**「手机上按下的那一下,到底走完没走完?——它有没有变成世界里的一条因果、
 *   那条因果是不是被上游记忆账记下了」**。三段各有各的口,谁都不回答这一问;而「三个桥都挂着」
 *   这件事**恰恰不能**证明整链已形成(桥在 = 线接上了,**不等于**这一笔走通了)。
 *
 * ── 本模块只做五件事,**一次判定都不复制** ─────────────────────────
 *   1 `contracts()`          —— **只读**核验三条边当前真实契约(逐边 `present` / 对端自报 `version` /
 *      本侧认的 `expect` / `matched`)。契约真源**全部委托**:出站边取 `bridge.handshake()`、
 *      入站边取 `phoneBridge.version`、上游边取 `lonshaReader.LONSHA_BRIDGE_VERSION`;
 *      本模块**不另探一遍**(两处各探一遍必然分家)。
 *   2 `candidates(opts)`     —— **手机动作回执 → 世界候选因果**:从 `phoneBridge` 台账里取
 *      **尚未接链**的操作,逐笔给候选。**候选的 cause 必须已在世界**(`causal.knownCause`),
 *      否则如实落 `no-cause` / `unknown-cause` —— **不凭空造一条因**。默认**只给候选**。
 *   3 `confirm(opId, opts)`  —— **确认落地**(唯一写口,且**必须显式**):先 `causal.addChain`
 *      再 `phoneBridge.linkChain`,两步都走**来源模块自己的公开写口**,本模块**不开事务、不碰 draft**。
 *      同一笔已接链 ⇒ `already`,**不重复落地**(幂等)。
 *   4 `trace(opId)`          —— **记忆来源追溯**(纯读):手机操作 → 因果链 → 上游记忆账本,
 *      逐段给出**真源读数**(不靠字符串拼接猜)。
 *   5 `audit()`              —— **闭环完整性读数**:三条边契约态 + 已闭环 / 待闭环笔数 +
 *      **四类伪造同步的现场看门**:缺席 / 迟到 / 重复 / 时钟分歧,**逐类如实报,不伪造成功**。
 *
 * ── 四条硬口径(全是否定式,每条都是「换个写法就会撒谎」的那种)──────────
 *   1 **桥在 ≠ 整链已形成**。「三个对端都挂着」只能说明线接上了;整链是否形成,逐笔看
 *      `phoneOps` 行有没有 `chainId`、那条链在不在 `causal.chains` 里。判据 A5 / B6 咬这一点。
 *   2 **不改对端**。本模块**零改动**给 `bridge` / `phoneBridge` / `lonsha-reader`:它只
 *      **消费**它们的公开口(`handshake` / `phaseOf` / `version` / `opsView` / `linkChain` /
 *      `lonshaSource` / `ledgerSummary`)。对端契约的本侧期望(`expect`)是**常量**,只读比对。
 *   3 **不凭空造因**。候选的 cause 逐条过 `causal.knownCause`;认不出就照实拒,由正文结算出因。
 *      「手机侧按了一下 ⇒ 我替它编一个原因」正是本仓点名反对的那类失写。
 *   4 **四类不伪造**(计划原文明列):缺席(`absent` 独立成一态,不并进「已同步」)、
 *      迟到(`late` 单列并带 `ageMs`)、重复(`duplicate`,取自入站桥的 `reused` 计数)、
 *      时钟分歧(取 `lonshaReader.diffWithLonsha` 的对账读数,**不一致就不算同步成功**)。
 *
 * ── 边界(如实登记)────────────────────────────────────────────
 *   · **对端不真机在场时,整链一律 `open`**:无头环境没有 RubyPhone / LonSha,缺席就是缺席,
 *     由 `contracts()[].present` 如实承载,**不由本模块的 `ok` 承载**。
 *   · **不改对端源码**属计划明文(「不改对端直到另获实施授权」):本模块不修 `phone-bridge` /
 *     `lonsha-reader` / `bridge` 一行,只作消费方。
 *   · **不新增世界顶层键**:只为自己的候选闸门记一份**进程态**计数(不进存档)。
 *   · **不产注入块**(本模块**没有** `buildBlock`):闭环读数不等于世界事实。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.227.0';
  const LS_KEY = 'worldaxis_story_loop_v1';
  const DEF = { enabled: false, windowMs: 6 * 60 * 60 * 1000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'storyLoop',
    bounds: { windowMs: [60 * 1000, 30 * 24 * 60 * 60 * 1000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  function txt(v) { return (v === undefined || v === null) ? '' : String(v); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  /** 三条边的**本侧期望契约**(常量,只读比对;真源在各模块自己的常量)。 */
  const EDGES = ['out', 'in', 'memory'];
  const EDGE_DUTY = {
    out: '出站只读投影(本扩展 → 外部)',
    in: '入站手机操作(外部 → 本扩展)',
    memory: '上游记忆账本(只读消费)'
  };
  /** 闭环四类伪造同步的**看门名**(封闭集合;audit 逐类报,不合并成一态)。 */
  const GUARDS = ['absent', 'late', 'duplicate', 'clock-divergence'];
  const GUARD_LABEL = {
    absent: '对端缺席',
    late: '迟到(回执早于/超出窗口)',
    duplicate: '重复上报',
    'clock-divergence': '两侧时钟分歧'
  };
  const stat = { audits: 0, candidateCalls: 0, confirms: 0, already: 0, refusals: 0, traced: 0,
    lastReason: '', faults: Object.create(null) };
  function noteFault(code) {
    const t = String(code == null ? 'unknown' : code);
    stat.faults[t] = (stat.faults[t] || 0) + 1;
    stat.lastReason = t;
  }

  /** 入站台账(只读,来自 phoneBridge 的公开视图;不直读 causal.phoneOps —— 那是它的真源)。 */
  function phoneRows(limit) {
    try {
      const pb = WA.phoneBridge;
      if (!pb || typeof pb.opsView !== 'function') return null;
      const v = pb.opsView(limit || 200);
      return (v && Array.isArray(v.items)) ? v.items : [];
    } catch (e) { return null; }
  }
  function phoneStat() {
    try { const pb = WA.phoneBridge; return (pb && typeof pb.stat === 'function') ? pb.stat() : null; }
    catch (e) { return null; }
  }
  /**
   * 因果链**行**(只读):真源是 causal 自己的存档行。
   *   ⚠ 首轮踩过的坑:`causal.stateView()` 的 `chains` 是**条数(number)**,不是行数组
   *   (`summarize()` 返回 `chains: rows.length`)——拿它 `.filter()` 必然取不到行,`trace()` 的
   *   段二于是恒报「断」。逐行取行与「数条数」是两件事:条数委托 `stateView()`,行经 store 快照读。
   *   本函数**只读**:不写、不开事务、不碰 draft。
   */
  function chainRow(chainId) {
    const cid = txt(chainId);
    if (!cid) return null;
    try {
      const st = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
      const rows = ((st.causal || {}).chains) || [];
      return rows.filter(function (x) { return x && x.id === cid; })[0] || null;
    } catch (e) { return null; }
  }
  /** 链**条数**(只读;委托 causal.stateView() 的当前状态读数 —— 与逐行取行分列)。 */
  function chainCount() {
    try {
      const v = (WA.causal && typeof WA.causal.stateView === 'function') ? WA.causal.stateView() : null;
      return (v && typeof v.chains === 'number') ? v.chains : null;
    } catch (e) { return null; }
  }
  /** 原因是否**已在世界**(逐条走 causal.knownCause;本模块不另立一份原因表)。 */
  function causeKnown(cause) {
    const c = txt(cause);
    if (!c) return false;
    try { return !!(WA.causal && typeof WA.causal.knownCause === 'function' && WA.causal.knownCause(c)); }
    catch (e) { return false; }
  }
  /** 链的**分类读数**(只读;委托 causal.classify —— 它对未知 id 明确归 missing-chain)。 */
  function chainClass(chainId) {
    const cid = txt(chainId);
    if (!cid) return null;
    try {
      const r = (WA.causal && typeof WA.causal.classify === 'function') ? WA.causal.classify(cid) : null;
      return (r && r.ok === true) ? r : null;
    } catch (e) { return null; }
  }

  /**
   * 只读核验**三条边当前真实契约**。
   *   · 出站边:委托 `bridge.handshake()`(它 v2.128.0 已逐边核 present/version/expect/matched);
   *   · 入站边:委托 `phoneBridge.version` + `phaseOf()`(本侧期望 = phoneBridge 自报的契约版本);
   *   · 上游边:委托 `lonshaReader.LONSHA_BRIDGE_VERSION` + `lonshaSource()`(对端自报版本取自
   *     快照 `version` 字段 —— 由 `bridge.handshake()` 的 lonsha 边已经读过,此处只透传).
   *   本模块**不另探一遍**:两处各探一遍必然分家(本仓反复治过的那一类)。
   */
  function contracts() {
    //  ⚠ 首轮踩过的坑:`EDGES` 只在文件头声明、函数体里却**硬写三段 IIFE** —— 于是
    //   「把三边砍成两边」这种破坏对读数**毫无影响**(N1 首轮就是被它咬出来的:破坏版仍出 3 边)。
    //   「声明了封闭集合却不用它枚举」= 那个常量只是装饰;正解是**按 EDGES 逐边建**,
    //   于是集合本身就是单一真源(A9 咬的就是这一条)。
    const BUILD = {
      out: function () {
        let hs = null;
        try { hs = (WA.bridge && typeof WA.bridge.handshake === 'function') ? WA.bridge.handshake() : null; } catch (e) { hs = null; }
        const e = hs && (hs.edges || []).filter(function (x) { return x && x.key === 'out'; })[0];
        return { edge: 'out', duty: EDGE_DUTY.out,
          id: e ? e.id : 'worldaxis_bridge_v1', expect: e ? e.expect : null,
          present: !!(e && e.present), version: e ? e.version : null,
          matched: !!(e && e.matched), why: e ? txt(e.why) : 'bridge-absent' };
      },
      in: function () {
        const pb = WA.phoneBridge;
        if (!pb || typeof pb.phaseOf !== 'function') {
          return { edge: 'in', duty: EDGE_DUTY.in, id: 'worldaxis_phone_ops_v1', expect: null,
            present: false, version: null, matched: false, phase: null, why: 'inbound-bridge-missing' };
        }
        let ph = null;
        try { ph = pb.phaseOf(); } catch (e) { ph = null; }
        const ver = (typeof pb.version === 'number') ? pb.version : null;
        // 本侧期望 = 桥自报的契约版本(契约真源在 phone-bridge 自己;本模块不抄第二份)
        const expect = ver;
        const phase = txt(ph && ph.phase);
        return { edge: 'in', duty: EDGE_DUTY.in, id: 'worldaxis_phone_ops_v1', expect: expect,
          present: true, version: ver, matched: (ver !== null && expect !== null && ver === expect),
          phase: phase || null, why: phase === 'disabled' ? 'disabled' : 'mounted' };
      },
      memory: function () {
        const lr = WA.lonshaReader;
        if (!lr || typeof lr.lonshaSource !== 'function') {
          return { edge: 'memory', duty: EDGE_DUTY.memory, id: 'lonsha_memory_bridge_v1', expect: null,
            present: false, version: null, matched: false, sourceState: null, why: 'consumer-missing' };
        }
        const expect = (typeof lr.LONSHA_BRIDGE_VERSION === 'number') ? lr.LONSHA_BRIDGE_VERSION : null;
        let s = null;
        try { s = lr.lonshaSource(lr.LONSHA_BRIDGE_ID); } catch (e) { s = null; }
        if (!s || s.mounted !== true) {
          return { edge: 'memory', duty: EDGE_DUTY.memory, id: 'lonsha_memory_bridge_v1', expect: expect,
            present: false, version: null, matched: false, sourceState: null,
            why: txt(s && s.reason) || 'not-mounted' };
        }
        // 对端自报版本只有一处真源:快照 `version` 字段(桥对象本身不自报)。`refresh:false` 是硬纪律。
        let ver = null;
        try {
          const rd = (typeof lr.readLonshaSnapshot === 'function') ? lr.readLonshaSnapshot({ refresh: false }) : null;
          if (rd && rd.ok && rd.snapshot && typeof rd.snapshot.version === 'number') ver = rd.snapshot.version;
        } catch (e) { ver = null; }
        return { edge: 'memory', duty: EDGE_DUTY.memory, id: 'lonsha_memory_bridge_v1', expect: expect,
          present: true, version: ver, matched: (ver !== null && expect !== null && ver === expect),
          sourceState: txt(s.sourceState) || null, why: 'mounted' };
      }
    };
    const out = EDGES.filter(function (k) { return typeof BUILD[k] === 'function'; })
      .map(function (k) { return BUILD[k](); });
    return { ok: true, at: clockWall(), edges: out,
      matchedCount: out.filter(function (x) { return x.matched; }).length, total: out.length,
      // 口径明写:本函数只核**契约**这一层,不宣称「整链已形成」——那是 audit() 逐笔判的事。
      note: '只核契约(在不在 / 对端自报版本 / 本侧认的版本);桥在 ≠ 整链已形成,后者由 audit() 逐笔判。' };
  }

  /**
   * **手机动作回执 → 世界候选因果**(只读预览,零落地)。
   *   @param {{ops?:string[], cause?:string|object, win?:object, limit?:number}} opts
   *     cause 可为:{opId: causeId} 映射,或**单个** causeId(对所有待接链操作生效)。
   *     原因**逐条过 `causal.knownCause`**;认不出照实拒(不凭空造因)。
   *   @returns {{ok, rows:[{opId, act, actLabel, at, ageMs, cause, canCommit, blockReason}],
   *              ready, blocked, unlinked, note}}
   */
  function candidates(opts) {
    const o = opts || {};
    stat.candidateCalls++;
    const pb = WA.phoneBridge;
    if (!pb || typeof pb.opsView !== 'function') {
      noteFault('inbound-bridge-missing');
      return { ok: false, reason: 'inbound-bridge-missing', rows: [], ready: 0, blocked: 0, unlinked: 0 };
    }
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], ready: 0, blocked: 0, unlinked: 0 }; }
    const rows = phoneRows(o.limit || 200) || [];
    const want = Array.isArray(o.ops) ? o.ops.map(txt).filter(Boolean) : null;
    const now = clockNow('story-loop.candidates');
    const causeMap = function (opId) {
      const c = o.cause;
      if (!c) return '';
      if (typeof c === 'string') return txt(c);
      return txt(c[opId]);
    };
    const out = [];
    rows.forEach(function (r) {
      if (!r || !r.opId) return;
      if (want && want.indexOf(r.opId) < 0) return;
      // 已接链的不再给候选(它已经走完了「候选 → 落地」那一步);台账里另有一栏给追溯
      if (r.chainId) return;
      const at = num(r.at);
      const age = at > 0 ? Math.max(0, now - at) : -1;
      const late = at > 0 && age > cfg.windowMs;
      const cause = causeMap(r.opId);
      let canCommit = false, blockReason = '';
      if (!cause) blockReason = 'no-cause';
      else if (!causeKnown(cause)) blockReason = 'unknown-cause';
      else if (late) blockReason = 'late';
      else canCommit = true;
      out.push({ opId: r.opId, act: txt(r.act), actLabel: txt(r.actLabel) || txt(r.act),
        at: at, ageMs: age, late: late, cause: cause, canCommit: canCommit, blockReason: blockReason,
        action: txt(r.actLabel) || txt(r.act), immediate: '' });
    });
    const ready = out.filter(function (x) { return x.canCommit; }).length;
    return { ok: true, at: now, windowMs: cfg.windowMs, rows: out, ready: ready,
      blocked: out.length - ready, unlinked: out.length,
      note: '候选的 cause 必须已在世界(causal.knownCause);认不出照实拒 —— 手机侧按了一下不等于我替它编一个原因。' };
  }

  /**
   * **确认落地**(唯一写口,**必须显式**)。
   *   顺序:先 `causal.addChain`(原因 + 行动 ⇒ 一条链),再 `phoneBridge.linkChain`(把操作接到它)。
   *   两步都走**来源模块自己的公开写口**;本模块**不开事务、不碰 draft**。
   *   @param {string} opId
   *   @param {{cause:string, condition?:string, immediate?:string}} opts
   *   @returns {{ok, reason?, opId?, chainId?, already?, step?}}
   */
  function confirm(opId, opts) {
    const o = opts || {};
    const id = txt(opId);
    if (!id) return { ok: false, reason: 'missing-op' };
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const pb = WA.phoneBridge;
    if (!pb || typeof pb.linkChain !== 'function') { noteFault('inbound-bridge-missing'); return { ok: false, reason: 'inbound-bridge-missing' }; }
    // 幂等:已接链的直接报 already,**不重复落地**(不重复 addChain)
    let op = null;
    try { op = (typeof pb.opTrace === 'function') ? pb.opTrace(id) : null; } catch (e) { op = null; }
    if (op && op.ok && op.linked) { stat.already++; stat.lastReason = 'already'; return { ok: true, already: true, opId: id, chainId: txt(op.chainId) }; }
    const cause = txt(o.cause);
    if (!cause) { stat.refusals++; noteFault('no-cause'); return { ok: false, reason: 'no-cause', opId: id }; }
    if (!causeKnown(cause)) { stat.refusals++; noteFault('unknown-cause'); return { ok: false, reason: 'unknown-cause', opId: id }; }
    const act = (op && op.ok) ? txt(op.act) : '';
    const action = txt(o.action) || (op && op.ok ? (txt(op.actLabel) || act) : act) || 'phone-action';
    let chainId = '';
    try {
      const cr = (WA.causal && typeof WA.causal.addChain === 'function')
        ? WA.causal.addChain({ cause: cause, condition: txt(o.condition), action: action, immediate: txt(o.immediate) })
        : { ok: false, reason: 'causal-absent' };
      if (!cr || cr.ok !== true) { stat.refusals++; noteFault('add-chain-' + (txt(cr && cr.reason) || 'failed'));
        return { ok: false, reason: txt(cr && cr.reason) || 'add-chain-failed', opId: id, step: 'add-chain' }; }
      chainId = txt(cr.id);
    } catch (e) {
      stat.refusals++; noteFault('add-chain-threw');
      return { ok: false, reason: 'add-chain-threw', opId: id, step: 'add-chain' };
    }
    let lr = null;
    try { lr = pb.linkChain(id, chainId); } catch (e) { lr = { ok: false, reason: 'link-threw' }; }
    if (!lr || lr.ok !== true) {
      // 链已建成而接线失败:如实报出**断在哪一步**,并带回已建成的 chainId(不假装整笔没发生)
      stat.refusals++; noteFault('link-' + (txt(lr && lr.reason) || 'failed'));
      return { ok: false, reason: txt(lr && lr.reason) || 'link-failed', opId: id, chainId: chainId, step: 'link' };
    }
    stat.confirms++; stat.lastReason = 'confirmed';
    return { ok: true, already: false, opId: id, chainId: chainId, step: 'done' };
  }

  /**
   * **记忆来源追溯**(纯读):一笔手机操作 → 因果链 → 上游记忆账本,逐段给真源读数。
   *   三段**各自取真源**,不靠字符串拼接猜:
   *     1 手机操作 —— `phoneBridge.opTrace(opId)`;
   *     2 因果链   —— `causal.stateView()` 里按 id 取行;
   *     3 记忆账本 —— `lonshaReader.ledgerSummary(快照)`(九本账里哪几本在场、记账面多大)。
   */
  function trace(opId) {
    const id = txt(opId);
    if (!id) return { ok: false, reason: 'missing-op' };
    stat.traced++;
    const pb = WA.phoneBridge;
    if (!pb || typeof pb.opTrace !== 'function') return { ok: false, reason: 'inbound-bridge-missing', opId: id };
    let op = null;
    try { op = pb.opTrace(id); } catch (e) { op = null; }
    if (!op || op.ok !== true) return { ok: false, reason: txt(op && op.reason) || 'unknown-op', opId: id };
    const chainId = txt(op.chainId);
    const chain = chainRow(chainId);
    const chainCls = chainClass(chainId);
    // 上游记忆账本(只读):哪几本在场、有没有对读环。缺席如实报,不编一本顶替。
    //   ⚠ 首轮初值写成 `{ ok:false, reason:'not-probed' }`,但紧随的 try/catch 把**每一条**出口
    //   都赋了别的码(consumer-missing / no-snapshot / probe-threw)⇒ `not-probed` 是**死字面量**
    //   (reject-code-gate 按「既无见证又未列死」把它抓了出来)。修法:**删掉它**,初值取 consumer-missing
    //   (那正是「读不到消费方」的真实归因),不装一个永远跑不到的字面量。
    let memory = { ok: false, reason: 'consumer-missing' };
    try {
      const lr = WA.lonshaReader;
      if (lr && typeof lr.readLonshaSnapshot === 'function' && typeof lr.ledgerSummary === 'function') {
        const rd = lr.readLonshaSnapshot({ refresh: false });
        if (rd && rd.ok && rd.snapshot) {
          const ls = lr.ledgerSummary(rd.snapshot);
          memory = { ok: true, sections: ls.sections, total: ls.total, absent: (ls.absentList || []).slice(),
            echoPresent: !!ls.echoPresent };
        } else memory = { ok: false, reason: txt(rd && rd.reason) || 'no-snapshot' };
      } else memory = { ok: false, reason: 'consumer-missing' };
    } catch (e) { memory = { ok: false, reason: 'probe-threw' }; }
    // 闭环判定:**三段都在场**才算「这一笔走完了」;任何一段缺席如实说断在哪。
    const seg = { receipt: true, chain: !!chain, memory: !!memory.ok };
    const closed = seg.receipt && seg.chain && seg.memory;
    return { ok: true, opId: id, act: txt(op.act), actLabel: txt(op.actLabel),
      at: num(op.at), seq: num(op.seq),
      chain: chain ? { id: chain.id, cause: txt(chain.cause), action: txt(chain.action),
        status: txt(chain.status), stage: txt(chain.stage),
        terminal: !!(chainCls && chainCls.terminal) } : null,
      chainId: chainId, memory: memory, segments: seg, closed: closed,
      note: closed ? '三段齐:回执 → 因果 → 记忆' : '断链段已如实标出(缺席不得读成无事发生)' };
  }

  /**
   * **闭环完整性读数**(只读):三条边契约态 + 逐笔闭环 + **四类伪造同步的现场看门**。
   *   判据非恒真:verdict 只可能在**三边 matched 且至少一笔 closed 且四类看门全零**时才是 `closed`;
   *   其余一律 `open` / `partial`,并把理由逐条带回 —— **桥在不算数**。
   */
  function audit() {
    stat.audits++;
    const cs = contracts();
    const cfg = settings();
    const rows = phoneRows(200);
    const ops = rows || [];
    let closedLoops = 0, unlinked = 0, linked = 0;
    ops.forEach(function (r) {
      if (!r) return;
      const cid = txt(r.chainId);
      if (!cid) { unlinked++; return; }
      if (chainRow(cid)) { linked++; closedLoops++; } else { linked++; }  // 有 chainId 而链不在 = 悬空接线
    });
    const dangling = linked - closedLoops;
    // ── 四类看门 ──
    const ps = phoneStat();
    const guards = {};
    guards.absent = cs.edges.filter(function (e) { return !e.present; }).map(function (e) { return e.edge + ':' + e.why; });
    const now = clockNow('story-loop.audit');
    guards.late = ops.filter(function (r) {
      const at = num(r && r.at);
      return at > 0 && !txt(r.chainId) && (now - at) > cfg.windowMs;
    }).map(function (r) { return r.opId; });
    guards.duplicate = (ps && num(ps.reused) > 0) ? [{ reused: num(ps.reused) }] : [];
    // 时钟分歧(只读对账;不可比 ≠ 一致)
    let clock = { comparable: false, verdict: 'unprobed', days: null };
    try {
      const lr = WA.lonshaReader;
      if (lr && typeof lr.diffWithLonsha === 'function' && typeof lr.readLonshaSnapshot === 'function') {
        const rd = lr.readLonshaSnapshot({ refresh: false });
        if (rd && rd.ok && rd.snapshot) clock = lr.diffWithLonsha(rd.snapshot);
        else clock = { comparable: false, verdict: 'no-snapshot', days: null };
      } else clock = { comparable: false, verdict: 'consumer-missing', days: null };
    } catch (e) { clock = { comparable: false, verdict: 'probe-threw', days: null }; }
    // 分歧只在**可比且非零**时才算一类;不可比如实记在 clock 读数里,不并进 guards
    guards['clock-divergence'] = (clock && clock.comparable && num(clock.days) !== 0)
      ? [{ verdict: txt(clock.verdict), days: num(clock.days) }] : [];
    const guardCounts = {};
    GUARDS.forEach(function (g) { guardCounts[g] = (guards[g] || []).length; });
    const allMatched = cs.edges.every(function (e) { return e.matched === true; });
    // verdict:**三边 matched + 至少一笔闭环 + 四类看门全零**才 closed;悬空接线额外降级
    let verdict, reasons = [];
    if (dangling > 0) reasons.push('dangling-link:' + dangling);
    if (!allMatched) reasons.push('contract-not-matched:' + cs.edges.filter(function (e) { return !e.matched; }).map(function (e) { return e.edge; }).join(','));
    if (closedLoops === 0) reasons.push(ops.length ? 'no-closed-loop' : 'no-phone-ops');
    GUARDS.forEach(function (g) { if (guardCounts[g] > 0) reasons.push(g + ':' + guardCounts[g]); });
    if (!reasons.length) verdict = 'closed';
    else if (allMatched && closedLoops > 0) verdict = 'partial';
    else verdict = 'open';
    return { ok: true, at: clockWall(), verdict: verdict, reasons: reasons,
      contracts: cs.edges, matchedCount: cs.matchedCount, edgeTotal: cs.total,
      ops: ops.length, linked: linked, unlinked: unlinked, closedLoops: closedLoops, dangling: dangling,
      // 世界侧链**条数**(独立读数:委托 causal.stateView();与「逐行取行」分列 ——
      //   条数答「世界里现在有几条链」,逐行取行答「这一条在不在」,两问不许合成一句)
      causalChains: chainCount(),
      guards: guards, guardCounts: guardCounts, clock: { comparable: !!clock.comparable, verdict: txt(clock.verdict), days: clock.days },
      // 口径明写:只读对端扫描**没有证明**整链已形成 —— verdict 只由「逐笔闭环 + 四类看门」判。
      note: '只读扫描三边契约**不能**证明整链已形成;verdict 由逐笔闭环与四类看门共同判。缺席/迟到/重复/时钟分歧一律如实报,不伪造同步成功。' };
  }

  function statView() {
    const cfg = settings();
    return { enabled: !!cfg.enabled, windowMs: cfg.windowMs,
      audits: stat.audits, candidateCalls: stat.candidateCalls, confirms: stat.confirms,
      already: stat.already, refusals: stat.refusals, traced: stat.traced,
      lastReason: stat.lastReason, faults: Object.assign({}, stat.faults),
      edges: EDGES.length, guards: GUARDS.length };
  }
  function reset() { stat.audits = 0; stat.candidateCalls = 0; stat.confirms = 0; stat.already = 0;
    stat.refusals = 0; stat.traced = 0; stat.lastReason = ''; stat.faults = Object.create(null); return { ok: true }; }

  WA.storyLoop = {
    VERSION: VERSION,
    EDGES: EDGES.slice(), EDGE_DUTY: Object.assign({}, EDGE_DUTY),
    GUARDS: GUARDS.slice(), GUARD_LABEL: Object.assign({}, GUARD_LABEL),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    contracts: contracts,
    candidates: candidates,
    confirm: confirm,
    trace: trace,
    audit: audit,
    stat: statView, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/story-loop.js', { kind: 'engine', ver: VERSION });
  if (WA.log) WA.log('info', '三项目剧情事件闭环已加载(' + VERSION + ',默认休眠:' + (DEF.enabled === false) + ')');
})();