/**
 * WorldAxis core/evict.js (v2.13.0) — 挤出侧完整性（七面治理的最后一面）
 *
 * 为什么需要它：
 *   本仓库已把写侧（v2.6.0/v2.7.0）、删侧（v2.9.0）、读侧（v2.10.0）、活性面（v2.11.0）
 *   逐一收口，UI 渲染路径也已被真实执行覆盖（v2.12.0）。但**挤出侧一行治理都没有**：
 *   全库 30+ 处持久容器截断（slice(-N) / splice(0, len-N) / length = CAP）全是
 *   **静默的破坏性丢弃**——元素被丢掉之后再也拿不回来，而用户与诊断都看不到任何痕迹。
 *
 *   这里的现场比写入/删除更隐蔽：
 *     · 写失败 → 数据没变（用户能看出「没保存」）；
 *     · 删失败 → 数据还在（复核即可发现）；
 *     · **挤出成功 → 数据真的没了，而且这正是代码的本意**。
 *     于是「长局跑了 200 轮之后 NPC 只剩 48 个」「伏笔被终态条目挤掉」这类现象
 *     在面板、诊断包、健康分上完全没有出口，只能靠用户凭记忆发现少了谁。
 *
 * 三条口径（本模块存在的全部意义）：
 *   ① **挤出 ≠ 取样**。「对持久容器的破坏性截断」是挤出（须记账）；
 *      「对只读输入/输出的展示切分」（chat.slice(-3)、面板 slice(-10) 渲染）
 *      是取样（不改变任何持久状态，**不得**计进挤出——否则计数虚高，
 *      与 v2.6.0 修掉的「writes 计尝试而非成功」、v2.9.0 修掉的
 *      「removeAbsent 计成 removes」完全同型）。分类只能由站点显式声明，不能猜。
 *   ② **cap 与站点同源**。SITES 表是本模块唯一真源：站点只报自己的名字，
 *      cap 由本表给出（可为函数，读运行时单源如 MAX_EVENTS / MAX_WINDS）。
 *      此前 __BOUNDED_CAPS[k].site 是一段**自由文本**（'backstage.js slice(-200)'），
 *      代码改了 cap 没人知道，登记表还会继续自称权威。改为可执行表之后，
 *      「声明」与「执行」之间的漂移第一次可以被机器判定（见门禁 G18）。
 *   ③ **未知站点是缺陷，不是后备**。站点名未登记 ⇒ unknown-site 失败并归因，
 *      **不做任何截断**（宁可超限也不要静默丢弃一个没人声明过的容器）。
 *      「先丢掉再说」是本仓库最贵的一类默认值。
 *
 * 记账层次（与写侧 writes/writeFailed/writeFailedBy、删侧 removes/removeAbsent 对偶）：
 *   · evicts / evicted   —— 真正发生挤出的次数与被丢元素总数；
 *   · evictNoops         —— 未超限的调用次数（幂等无操作，**不是**挤出成功）；
 *   · evictFailed        —— 参数非法 / 站点未登记（实现缺陷，须改代码而非清存储）；
 *   · bySite             —— 逐站点 evicts / dropped / lastAt（「谁在丢东西」）；
 *   · lastDropped        —— **丢了什么**（最近 12 条元素摘要）。
 *     只记「丢了几条」等于什么都没说：用户想知道的是「丢的是不是张三」。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // ── 站点登记表：cap 的单一真源 ───────────────────────────────
  // 每项：{ path: 状态路径（与 store.__BOUNDED_CAPS 同键）, cap: 数字或函数,
  //         kind: 'array'（默认）| 'object', why: 该容器为何必须有界 }
  // 站点名格式 模块.容器，与代码里的调用点字面量一一对应（门禁 G18 校验双向）。
  const SITES = {
    // ── 结算尾部容量控制（backstage 结算段）──
    'backstage.echoes':      { path: 'echoes',      cap: 40,  why: '暗流回声环形（正文触面）' },
    'backstage.chronicle':   { path: 'chronicle',   cap: 200, why: '世界编年史环形' },
    'backstage.worldFacts':  { path: 'worldFacts',  cap: 100, why: '世界事实版本环形' },
    'backstage.currents':    { path: 'currents',    cap: 40,  why: '暗流本体环形（终态回收后仍有硬上限）' },
    'people':                { path: 'people', cap: 48, kind: 'object', why: '人物容器（对象型，按 updatedAt 最旧优先挤出）' },
    // ── 演化容器（容器为中心：同一容器只有一个站点，backstage 兜底与 evolution 入账共用）──
    'evolution.events':      { path: 'evolution.events',     cap: function () { return (WA.editorEvents && WA.editorEvents.MAX_EVENTS) || 16; }, why: '事件链容器（同编辑器容量）' },
    'evolution.factions':    { path: 'evolution.factions',   cap: function () { return (WA.editorFaction && WA.editorFaction.MAX_FACTIONS) || 16; }, why: '势力容器（同编辑器容量）' },
    'evolution.winds':       { path: 'evolution.winds',      cap: function () { return (WA.evolution && WA.evolution.MAX_WINDS) || 12; }, why: '风声环形（衰减引擎为常态收敛，此处兜底）' },
    'evolution.worldTrends': { path: 'evolution.worldTrends', cap: 12, why: '天下大势（终态回收后兜底）' },
    'evolution.trends':      { path: 'evolution.trends',     cap: 20, why: '影响链环形' },
    'evolution.enemies':     { path: 'evolution.enemies',    cap: 44, why: '仇敌本体（活跃 24 + 终结 20 双口径）' },
    'evolution.entityMemory':{ path: 'evolution.entityMemory.*', cap: 30, why: '四类实体库各自上限' },
    'evolution.entityEvents':{ path: 'evolution.entityMemory.*.events', cap: 8, why: '实体事件环' },
    'evolution.blackboxActions': { path: 'evolution.blackbox.secretActions', cap: 15, why: '黑盒秘密行动环形' },
    'evolution.blackboxAssets':  { path: 'evolution.blackbox.secretAssets',  cap: 15, why: '黑盒秘密资产环形' },
    'evolution.ledger':      { path: 'evolution.ledger',     cap: 20, why: '重大事件账本轮数环形' },
    // ── memory 分层记忆 ──
    'memory.l0':          { path: 'memory.l0',          cap: 20,  why: '单轮摘要环形' },
    'memory.l1':          { path: 'memory.l1',          cap: 30,  why: '阶段回顾环形' },
    'memory.l2':          { path: 'memory.l2',          cap: 40,  why: '章节回顾环形' },
    'memory.l3':          { path: 'memory.l3',          cap: 60,  why: '长线沉淀环形' },
    'memory.facts':       { path: 'memory.facts',       cap: 100, why: '事实版本环形' },
    'memory.foreshadows': { path: 'memory.foreshadows', cap: 30,  why: '伏笔生命周期（终态回收后兜底）' },
    'memory.pmem':        { path: 'memory.pmem',        cap: 60,  why: '人物主观记忆总量' },
// ── 舆情 / 章节 / 突发事件 ──
    'opinion.canon':      { path: 'opinion.canon',  cap: 20, why: '正史舆情环形' },
    'opinion.forum':      { path: 'opinion.forum',  cap: 20, why: '论坛舆情环形' },
    'chapters.history':   { path: 'chapters.history', cap: 20, why: '章节史环形' },
    'directEvents':       { path: 'directEvents', cap: 4, why: '突发事件（活跃全留 + 终态保留最近 3）' },
    // 对象型：每人认知边界（键 = 「谁知道什么」），按 at 最旧优先挤出
    'people.knowledge':   { path: 'people.*.knowledge', cap: 30, kind: 'object', why: '人物认知边界（每键一桩知情）' },
    // ── v2.13.0 补漏（本轮广谱侦察发现的真缺陷）──
    // 纪要/总述环形：此前整个容器**根本没在 store 容量登记表上**，
    //   sizeAudit 把它俩报成 unbounded（全库唯一两条），而代码其实一直在 slice(-N) 静默裁剪。
    //   于是「被误判为无界」与「裁剪无人知晓」两个缺陷同时存在——补登 + 接台账一并修。
    'memory.smallSummary':{ path: 'memory.smallSummaries', cap: 24, why: '阶段纪要环形（summarizer CAP_SMALL）' },
    'memory.bigSummary':  { path: 'memory.bigSummaries',   cap: 8,  why: '大总述环形（summarizer CAP_BIG）' },
    // 对象型：每人的档案节（键 = 节名 personality/worldview/family/memory/relationships）。
    //   注意：节值本身是**数组**（{text,at} / {target,...}），上限逐节不同，且只有写入方
    //   （actors/registry.js）在运行时才知道（它从 store 容量登记表逐节取）。
    //   因此本项 cap 为 'per-call'：调用方必须显式传入该节上限，传漏即 bad-cap 归因——
    //   「随手给个默认值」正是本仓库发生过的漂移（registry 曾写死常量，被 sizeAudit 判 drifted）。
    'people.profile':     { path: 'people.*.profile.*', cap: 'per-call', kind: 'array', why: '人物档案各节（上限取自 store 登记表，写入时传入）' }
  };

  // ── 非挤出站点（显式声明，防「假阴性」与「计数虚高」两头都错）──────────
  // 下列位置有 slice/替换式赋值，但语义**不是**环形挤出：
  //   · evolution.economy.signals / opinion.sandbox —— 「用最新读数整体替换」，
  //     旧值本来就是过时信息，不构成容量治理；把它们计进挤出会让 evicts 虚高。
  // 本表存在的意义：让「为什么不给它记账」是**声明过的决定**，而不是漏掉。
  const NON_EVICT = {
    'evolution.economy.signals': '替换式覆盖（取最新读数整体重写，非环形累积）',
    'opinion.sandbox': '替换式覆盖（沙盒碎片每次重生成，NON-CANON 不累积）',
    'evolution.entityMemory.README': '同上：实体库替换由 evolution.entityMemory 站点计量，此处不重复计'
  };

  // ── 记账 ──────────────────────────────────────────────────
  const stats = {
    evicts: 0,          // 真正发生挤出的次数（超限且已丢弃）
    evicted: 0,         // 被挤出的元素总数
    evictNoops: 0,      // 未超限的调用次数——幂等无操作，不是「挤出成功」
    evictFailed: 0,     // 参数非法 / 站点未登记（实现缺陷）
    failedBy: {},       // 失败来源分桶：not-array / bad-cap / unknown-site / not-object
    lastEvict: null,    // { site, cap, before, after, dropped, at }
    bySite: {},         // site -> { evicts, dropped, lastAt, lastDropped }
    lastDropped: [],    // 最近被挤出的元素摘要（最多 12 条）——「丢的是什么」
    lastFail: null      // { site, reason, at }
  };

  function now() { try { return Date.now(); } catch (e) { return 0; } }

  /** 元素摘要：优先取语义名，让「丢的是谁」可读（只记数量等于什么都没记） */
  function summarize(x) {
    if (x === null || x === undefined) return 'null';
    const t = typeof x;
    if (t === 'string') return '\u300c' + x.slice(0, 24) + '\u300d';
    if (t === 'number' || t === 'boolean') return String(x);
    if (t !== 'object') return t;
    // v2.13.0: 名称键优先级——先「人/事的名字」，再退回结构信息
    const NAME_KEYS = ['name', 'title', 'topic', 'key', 'label', 'text', 'content', 'id'];
    for (let i = 0; i < NAME_KEYS.length; i++) {
      const v = x[NAME_KEYS[i]];
      if (v !== undefined && v !== null && v !== '') return String(v).slice(0, 24);
    }
    if (Array.isArray(x)) return '[' + x.length + '\u9879]';
    return '{' + Object.keys(x).length + '\u952e}';
  }

  function noteFail(site, reason) {
    stats.evictFailed++;
    stats.failedBy[reason] = (stats.failedBy[reason] || 0) + 1;
    stats.lastFail = { site: site, reason: reason, at: now() };
    try { WA.log('error', '挤出失败：站点 ' + site + ' 原因 ' + reason + '（未做任何截断）'); } catch (e) {}
  }

  function capOf(site) {
    const s = SITES[site];
    if (!s) return null;
    const c = typeof s.cap === 'function' ? s.cap() : s.cap;
    return c;
  }

  // ── 单一实现：数组挤出 ─────────────────────────────────────
  /**
   * 对持久数组做破坏性截断（保留尾部 cap 个）。
   * 站点名必须在 SITES 中登记——未登记则**不做任何截断**并归因。
   * @returns { ok, dropped, before, after, reason? }
   */
  function array(arr, site, limit) {
    if (!Array.isArray(arr)) { noteFail(site, 'not-array'); return { ok: false, reason: 'not-array', dropped: 0, before: 0, after: 0 }; }
    const decl = SITES[site];
    let cap;
    if (!decl) { noteFail(site, 'unknown-site'); return { ok: false, reason: 'unknown-site', dropped: 0, before: arr.length, after: arr.length }; }
    if (decl.cap === 'per-call') {
      // per-call 站点：上限逐次不同（如人物档案各节 15/10/10/25/15），必须由调用方给出。
      // 传漏即 bad-cap 归因——「悄悄回落到一个默认值」正是登记表与执行漂移的起点。
      if (typeof limit !== 'number' || !isFinite(limit) || limit < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0, before: arr.length, after: arr.length }; }
      cap = limit;
    } else cap = capOf(site);
    if (typeof cap !== 'number' || !isFinite(cap) || cap < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0, before: arr.length, after: arr.length }; }
    const before = arr.length;
    if (before <= cap) { stats.evictNoops++; return { ok: true, dropped: 0, before: before, after: before }; }
    const dropped = before - cap;
    // 先摘摘要再切——切完就拿不到了
    const tail = arr.slice(0, dropped);
    arr.splice(0, dropped);
    record(site, cap, before, arr.length, dropped, tail.map(summarize));
    return { ok: true, dropped: dropped, before: before, after: arr.length };
  }

  /**
   * 对持久对象做键挤出（调用方给出候选顺序，本函数负责删除与记账）。
   * @param obj 目标对象
   * @param site 站点名
   * @param orderedKeys 已按「应被挤出优先级」排好序的键（**前** excess 个会被删）
   */
  function object(obj, site, orderedKeys) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { noteFail(site, 'not-object'); return { ok: false, reason: 'not-object', dropped: 0, before: 0, after: 0 }; }
    const cap = capOf(site);
    if (cap === null) { noteFail(site, 'unknown-site'); return { ok: false, reason: 'unknown-site', dropped: 0, before: Object.keys(obj).length, after: Object.keys(obj).length }; }
    if (typeof cap !== 'number' || !isFinite(cap) || cap < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0, before: Object.keys(obj).length, after: Object.keys(obj).length }; }
    const before = Object.keys(obj).length;
    if (before <= cap) { stats.evictNoops++; return { ok: true, dropped: 0, before: before, after: before }; }
    const keys = Array.isArray(orderedKeys) ? orderedKeys.slice() : Object.keys(obj);
    const excess = before - cap;
    const dropped = keys.slice(0, excess);
    const tail = dropped.map(function (k) { return summarize(obj[k]) + '\u2039' + k + '\u203a'; });
    dropped.forEach(function (k) { try { delete obj[k]; } catch (e) {} });
    record(site, cap, before, Object.keys(obj).length, dropped.length, tail);
    return { ok: true, dropped: dropped.length, before: before, after: Object.keys(obj).length, droppedKeys: dropped };
  }

  /**
   * 记账专用入口：站点自己做「按业务规则筛选」的挤出（不是纯尾部截断，
   * 如「按 createdRound 最旧优先挤出活跃仇敌」「排除终局事件后重建数组」）。
   * 本函数**不动数据**，只把「丢了什么」如实记账——
   * 让这类站点的丢弃也可见，而不是因为它们不是 slice(-N) 就永远不可观测。
   * @param site 站点名（须登记）
   * @param droppedItems 已被站点丢弃的元素数组
   * @returns { ok, dropped, reason? }
   */
   function note(site, droppedItems, limit) {
     const decl = SITES[site];
     if (!decl) { noteFail(site, 'unknown-site'); return { ok: false, reason: 'unknown-site', dropped: 0 }; }
     let cap;
     if (decl.cap === 'per-call') {
       // per-call 站点（上限逐次不同，如人物档案各节）：调用方必须显式给出本次上限。
       // 不给就归因——默许一个「随手挑的上限」正是本仓库最贵的一类默认值。
       if (typeof limit !== 'number' || !isFinite(limit) || limit < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0 }; }
       cap = limit;
     } else {
       cap = capOf(site);
     }
     const items = Array.isArray(droppedItems) ? droppedItems : [];
     if (!items.length) { stats.evictNoops++; return { ok: true, dropped: 0 }; }
     record(site, cap, null, null, items.length, items.map(summarize));
     return { ok: true, dropped: items.length };
   }

  function record(site, cap, before, after, dropped, tail) {
    const at = now();
    stats.evicts++;
    stats.evicted += dropped;
    stats.lastEvict = { site: site, cap: cap, before: before, after: after, dropped: dropped, at: at };
    const b = stats.bySite[site] = stats.bySite[site] || { evicts: 0, dropped: 0, lastAt: 0, lastDropped: 0 };
    b.evicts++; b.dropped += dropped; b.lastAt = at; b.lastDropped = dropped;
    (tail || []).forEach(function (s) { stats.lastDropped.push({ site: site, what: s, at: at }); });
    if (stats.lastDropped.length > 12) stats.lastDropped.splice(0, stats.lastDropped.length - 12);
    try { WA.log('info', '挤出: ' + site + ' ' + before + '\u2192' + after + '（丢弃 ' + dropped + '）：' + (tail || []).slice(0, 3).join('、')); } catch (e) {}
  }

  // ── 只读视图（供诊断 / 面板 / 健康分消费）──────────────────
  function evictStat() {
    const byS = {};
    Object.keys(stats.bySite).forEach(function (k) {
      const b = stats.bySite[k];
      byS[k] = { evicts: b.evicts, dropped: b.dropped, lastAt: b.lastAt, lastDropped: b.lastDropped };
    });
    return {
      evicts: stats.evicts,
      evicted: stats.evicted,
      evictNoops: stats.evictNoops,
      evictFailed: stats.evictFailed,
      failedBy: Object.assign({}, stats.failedBy),
      lastEvict: stats.lastEvict ? Object.assign({}, stats.lastEvict) : null,
      lastFail: stats.lastFail ? Object.assign({}, stats.lastFail) : null,
      bySite: byS,
      lastDropped: stats.lastDropped.map(function (x) { return Object.assign({}, x); }),
      sites: Object.keys(SITES).length,
      nonEvict: Object.assign({}, NON_EVICT)
    };
  }
  function resetEvictStat() {
    stats.evicts = 0; stats.evicted = 0; stats.evictNoops = 0; stats.evictFailed = 0;
    stats.failedBy = {}; stats.lastEvict = null; stats.lastFail = null;
    stats.bySite = {}; stats.lastDropped = [];
  }
  /** 站点声明表只读副本（门禁与诊断反查「cap 的单一真源」用） */
  function siteDecls() {
    const out = {};
    Object.keys(SITES).forEach(function (k) {
      const s = SITES[k];
      out[k] = { path: s.path, cap: capOf(k), kind: s.kind || 'array' };
    });
    return out;
  }

  WA.evict = {
    array: array,
    object: object,
    note: note,
    evictStat: evictStat,
    resetEvictStat: resetEvictStat,
    siteDecls: siteDecls,
    nonEvictDecls: function () { return Object.assign({}, NON_EVICT); },
    summarize: summarize
  };
})();