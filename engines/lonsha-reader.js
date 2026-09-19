/**
 * WorldAxis engines/lonsha-reader.js (v2.18.0) — 记忆桥消费面（只读）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   这套三插件体系里有**两个同规格的只读世界桥**，本扩展与另两个插件都挂在同一张网里：
 *     · window.worldaxis_bridge_v1      —— 本扩展的世界状态快照（v2.16.0 建立：世界钟/暗流/权威事实/舆情）
 *     · window.lonsha_memory_bridge_v1  —— LonSha 记忆插件的剧情记忆/召回账本快照（v3.88 建立、v3.174 扩容）
 *   v2.16.0 把本扩展的出口做出来了（外部能读到这个世界），但**另一条边仍然是断的**：
 *   全库 grep `lonsha_memory_bridge_v1` —— 命中全在**注释、文档与面板提示文本**里，
 *   产品代码**零消费**。于是「同一场剧情里，另一个插件记的那本账」在本扩展侧**完全不可观测**。
 *
 * 【两个「现在」的真实差异（不是 bug，是结构）】
 *   本扩展的世界钟（`store.clock`：label 自由标签如「第12日·黄昏」+ 可选 iso + dayIndex）
 *   是**推演结果**——决策时间，进存档、参与判定（v2.15.0 时间源治理：决策走 clockNow）。
 *   而 LonSha 的 `GameClock.date` 由**正文**校准（v3.72 时间标签协议 / v3.94 注释回读 /
 *   v3.130 标签闭环）。两者各走各的，谁也发现不了谁不一致。本模块让这件事变得可见。
 *
 * 【本模块的职责】把「读 LonSha 记忆桥」收敛为单一真源，并**只**做三件事：
 *   ① 只读：只调 bridge.snapshot() / bridge.refresh()（上游文档明文的外部读取面）与桥的
 *      状态字段（sourceState / lastError），绝不写桥、绝不改对方的账本；
 *   ② 不抛：桥未装 / 未启用 / 引擎未就位 / 取快照抛错 / 快照畸形 / 宿主 getter 抛异常，
 *      一律降级为 {ok:false, reason}，绝不把异常抛给调用方；
 *   ③ 不猜：不可用**如实**报出来（reason 可归因），不静默编造一本账顶替。
 *
 * 【为什么降级必须带 reason（而不是直接返回 null）】
 *   本项目反复治理的缺陷形态就是「静默降级」：拿不到数据与「对方没有账」同形，调用方只能
 *   一律当「没数据」处理。而 LonSha v3.174 刚把**桥的来源可见性**做成显式状态机
 *   （`sourceState` 五态：idle / ready / engine-absent / engine-empty / thrown，且 `lastError`
 *   不吞）——**那个状态机就是为本扩展这种消费者准备的**。本模块把它映射成外部 reason，
 *   于是「对方还没就绪，稍后再读」与「对方坏了，该报出来」不再同形。
 *
 * 【与上游的规格对齐（本模块判据的全部依据，逐条对上游源码核过）】
 *   · 桥挂载名 `window.lonsha_memory_bridge_v1`（index.js:13073），桥内自述
 *     `bridge: 'lonsha_memory_bridge_v1'` / `version: 1`（index.js:13074-13075）；
 *   · 外部读取面：`refresh()`（重建并返回快照；未就位/空/抛错都返回 null 并写 sourceState
 *     与 lastError）与 `snapshot`（最近一次成功的快照，未 refresh 时为 null）；
 *   · `sourceState` 五态 + `lastError` 是**读者可归因**的唯一出口（v3.174 契约）；
 *   · 快照结构（v3.174 起）：
 *       { version, bridge, pluginVersion, floor, exportedAt, protagonist, lifeDetails,
 *         characters, moneyLedger, outline, worldProg, clock, recallAudit,
 *         meta: { fieldTypes, selfBytes, strictJsonOk, contract } }
 *     其中 `meta.fieldTypes[f] = {present, kind}`：**present=false 表示源字段缺失**、
 *     **kind='null' 表示源字段显式就是 null**——「没有这项」与「有这项、值是空」从此可分辨。
 *     本模块的读数必须尊重这两态，不得把它们压成一态。
 *   · `clock` 字段是 LonSha 的 GameClock 投影（含 date / label / precision / turn / 世界钟对账读数）。
 *
 * 【本模块**不做**什么（边界）】
 *   不做「用对方的钟覆盖本扩展的世界钟」。本扩展的世界钟是**推演结果**，进存档、参与判定；
 *   LonSha 侧同样是「正文为最高事实源」（它的 v3.175 世界钟读者面也明确只对账、不覆盖）。
 *   双方都只交付**读数与对账**——不一致要可见、要能归因，但**谁拍板由用户决定**。
 *   本扩展在这套体系里的角色是**推演世界的那一个**，不是替对方记账的那一个。
 * ======================================================== */
'use strict';
(function () {
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  /** 桥的全局挂载名（与上游逐字一致，改一处即两端同时失联） */
  const LONSHA_BRIDGE_ID = 'lonsha_memory_bridge_v1';
  /** 本消费者所认的**上游快照契约版本**（v3.174 起快照带 `version`；升版即形状可能变） */
  const LONSHA_BRIDGE_VERSION = 1;
  /** 来源态枚举（把上游 sourceState 映射成外部可归因的 reason） */
  const REASONS = ['not-mounted', 'disabled', 'refused', 'no-snapshot', 'engine-absent',
    'engine-empty', 'thrown', 'contract-mismatch', 'ok'];

  /* ============================================================
   * [v2.18.0] 反向消费面扩到**九本账**
   *
   * 【修前实测缺口】
   *   v2.17.0（本模块首次落地）把这条边接通了——但只读了 LonSha 快照里的 `clock` **一个字段**。
   *   而对方快照外供的是**八个顶层账本**（protagonist / lifeDetails / characters /
   *   moneyLedger / outline / worldProg / clock / recallAudit），v3.176.0 起又多一本
   *   `worldLedgerRead`（**对方读本扩展所得的对读读数**）。于是「通路通了，但只通了一根线」
   *   这个缺陷形态在**反向边**上重演了一次，与 lonsha v3.176 修掉的是同一型。
   *
   * 【更关键的：v3.176 之后这条边变成了一个环】
   *   lonsha v3.176 新增 `worldLedgerRead`，其中含 `visibilityGap`——**对方读本扩展的 filter
   *   所得**。本扩展若把它当成「对方的世界」读进来，就会拿**自己的投影**冒充外部事实：
   *   一处单侧计算、两处消费，而两边永远一致（因为同源）。故本模块必须能**认出**它并标
   *   `kind='echo'`，让「对方的世界」与「对方眼里的我」在读数上**不同形**。
   *
   * 【本模块新增的四类读数（全部只读、不抛、不猜）】
   *   ① ledgerSection   —— 八本账 + 对读读数，逐本**在场三态**（复用 fieldState，尊重 fieldTypes）
   *   ② ledgerSummary   —— 八本账的**形状画像**（各本多大 / 有哪些键），不搬运内容；
   *                        并按「对方这一版**是否外供**」而非「值是不是空」统计，故未外供≠空。
   *   ③ ledgerBridges   —— 三处**对读面**：对读读数是否为环（kind='echo'）、对方记的暗流/事实/
   *                        人物 vs 本扩展 store 的 `echoes`/`worldFacts`/`people` 差集（两侧都只报差集，
   *                        不合并、不覆盖），且**对方缺面时如实标 absent 视作「不可比」，不得当成空集**
   *                        （否则会报出一个假的「我这边多出来的」）。
   *   ④ echoNotice      —— 一句话点出环的存在（供诊断/面板念出）。
   * ============================================================ */
  /** 对方快照里**本模块认得**的账本名（顺序即展示顺序；`clock` 由既有对账面负责，不重复报） */
  const LEDGER_SECTIONS = ['protagonist', 'lifeDetails', 'characters', 'moneyLedger',
    'outline', 'worldProg', 'clock', 'recallAudit', 'worldLedgerRead'];
  /**
   * 上游 v3.176.0 的 `worldLedgerRead` **实际外供的键集**（逐条对 lonsha `index.js`
   * 里 `GameClock.readWorldLedger` 的三处构造点核过：正常构造、reader 缺席、抛错兜底，
   * 三处键集一致）。
   *
   * 【为什么把上游键集钉成常量】
   *   本模块的三处对读面**必须从这个键集里取数**。若取了上游并不存在的键
   *   （例如直觉上很顺的 `currents` / `facts` / `people` 三支**数组**——
   *   上游**并没有**外供它们，只外供了 `counts` 与 `peopleDiff` / `factsDiff` 的对读结论），
   *   真实联调时三处对读面会**静默地全部退化成 `absent`**；而只要测试夹具恰好手工带上了
   *   那三支数组，门禁就照样**全绿**。这正是本项目最忌的「测试绿而生产不工作」。
   *   故本常量既供取数校验，也供诊断面自证「我读的键上游真的有」。
   */
  const ECHO_KEYS = ['ok', 'reason', 'describe', 'shape', 'gap', 'opinion', 'counts',
    'peopleDiff', 'factsDiff', 'at'];
  /**
   * 三处**对读面**：对方的对读读数里本模块认得的三支。
   *
   * 【为什么是透传而不是自算差集】
   *   这三支的**一侧本来就是本扩展自己的账本**（作为对方读到的快照）。本侧若再拿自己的
   *   `store` 去和它做一次差集，等于**拿自己的投影跟自己对账**——那正是本版要治的自指。
   *   正当的做法是：**透传对方已经算好的对读结论**，只加归因（kind='echo'）、口径对齐与有界。
   *     · `gap`       —— 对方读本扩展暗流时因可见性过滤而**没拿到**的那批（我方外供缺口）
   *     · `factsDiff` —— 对方已算好的权威事实差集（world=本扩展快照、local=对方的账）
   *     · `peopleDiff`—— 对方已算好的人物差集（同口径）
   */
  const BRIDGE_PAIRS = [
    { id: 'currents', sub: 'gap', from: 'gap' },
    { id: 'facts', sub: 'factsDiff', from: 'diff' },
    { id: 'people', sub: 'peopleDiff', from: 'diff' }
  ];
  /** 三处对读面在本扩展侧的对应账本（供 `myTotal` 与「本侧到底有没有这本账」） */
  const MINE_SECTION = { currents: 'currents', facts: 'worldFacts', people: 'people' };
  /** 对读面语义：由 lonsha v3.176 的 worldLedgerRead 提供，其内容**源自在下的投影** */
  const ECHO_SECTION = 'worldLedgerRead';
  /** 安全取数组（非数组即空） */
  function arr(v) { return Array.isArray(v) ? v : []; }
  /** 安全取对象（非对象即 null——数组不算对象） */
  function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; }
  /** 安全取数（非有限数即 0） */
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  /** 安全取串（null/undefined 即空串，不落成 "null" 这种字面量） */
  function txt(v) { return (v === undefined || v === null) ? '' : String(v); }

  /** 读取用的 window（显式注入，便于无头测试；运行时不传即取全局） */
  function resolveWin(win) {
    if (win) return win;
    try { return G; } catch (e) { return null; }
  }
  /** 安全取桥对象（不存在即 null，绝不因宿主怪异的 getter 抛出去） */
  function getBridge(id, win) {
    try {
      const w = resolveWin(win);
      const b = w && w[id];
      return (b && typeof b === 'object') ? b : null;
    } catch (e) { return null; }
  }
  /**
   * 桥的**来源归因**读数（只读，不拉快照）。
   * @returns {{mounted:boolean, sourceState:string|null, lastError:string|null, hasSnapshot:boolean, reason:string}}
   *   mounted      —— 桥对象在不在全局上（不在 ⇒ 对方插件未安装/未加载）
   *   sourceState  —— 对方桥自述的来源态（v3.174 契约；旧版没有该字段时为 null）
   *   lastError    —— 对方桥最后一次抛错的原因（不吞）
   *   reason       —— 本模块归因（not-mounted / engine-absent / engine-empty / thrown /
   *                   no-snapshot / disabled / refused / ready）
   */
  function lonshaSource(id, win) {
    // 整函数兜底：本函数对调用方的契约是「只读探针，永不抛」。
    try { return lonshaSourceInner(id, win); }
    catch (e) { return { mounted: false, sourceState: null, lastError: null, hasSnapshot: false, reason: 'probe-threw' }; }
  }
  function lonshaSourceInner(id, win) {
    const b = getBridge(id, win);
    if (!b) {
      return { mounted: false, sourceState: null, lastError: null, hasSnapshot: false, reason: 'not-mounted' };
    }
    let sourceState = null, lastError = null, hasSnapshot = false;
    try { sourceState = (typeof b.sourceState === 'string') ? b.sourceState : null; } catch (e2) { sourceState = null; }
    try { lastError = b.lastError ? String(b.lastError) : null; } catch (e2) { lastError = null; }
    try { hasSnapshot = !!(b.snapshot && typeof b.snapshot === 'object'); } catch (e2) { hasSnapshot = false; }
    let reason;
    if (sourceState === 'thrown') reason = 'thrown';
    else if (sourceState === 'engine-absent') reason = 'engine-absent';
    else if (sourceState === 'engine-empty') reason = 'engine-empty';
    else if (hasSnapshot) reason = 'ready';
    else if (sourceState === 'ready') reason = 'no-snapshot';
    else reason = 'no-snapshot';    // idle / 未知来源态 / 旧版无该字段：都还没有可读的快照
    return { mounted: true, sourceState, lastError, hasSnapshot, reason };
  }
  /**
   * 取 LonSha 记忆桥的快照（只读；深拷贝由对方保证）。
   * @param {{reason?:string, win?:object, refresh?:boolean}} opts
   * @returns {{ok:boolean, reason:string, source:object|null, snapshot:object|null}}
   *   永不抛；拿不到快照时 ok=false 且 reason ∈
   *   { not-mounted, engine-absent, engine-empty, thrown, no-snapshot, contract-mismatch, pull-failed }
   */
  function readLonshaSnapshot(opts) {
    opts = opts || {};
    try {
      const win = opts.win;
      const src = lonshaSource(LONSHA_BRIDGE_ID, win);
      if (!src.mounted) return { ok: false, reason: 'not-mounted', source: src, snapshot: null };
      if (src.reason === 'thrown') return { ok: false, reason: 'thrown', source: src, snapshot: null };
      const b = getBridge(LONSHA_BRIDGE_ID, win);
      let snap = null;
      // 优先用桥已持有的快照（非侵入）；显式 refresh 时才请对方重建。
      //   注：`refresh()` 不是写侧入口——上游文档把 refresh/snapshot 都列为**外部读取面**，
      //   真正的写侧动作是引擎自己的 buildBridgeSnapshot 与 opLog 记账，本模块一个都不碰。
      try {
        const owned = (typeof b.snapshot === 'object' && b.snapshot) ? b.snapshot : null;
        if (owned) {
          snap = owned;
        } else if (opts.refresh !== false && typeof b.refresh === 'function') {
          snap = b.refresh();
        }
      } catch (e2) { snap = null; }
      if (!snap || typeof snap !== 'object') {
        return { ok: false, reason: src.reason === 'ready' ? 'pull-failed' : src.reason, source: src, snapshot: null };
      }
      // 契约版本：只拦**显式**不匹配（缺失视为旧版，放行）。
      try {
        if (snap.version !== undefined && snap.version !== null && Number(snap.version) !== LONSHA_BRIDGE_VERSION) {
          return { ok: false, reason: 'contract-mismatch', source: src, snapshot: null };
        }
      } catch (e2) { /* 怪异 getter：不因校验本身把读取搞崩，按放行处理 */ }
      return { ok: true, reason: 'ok', source: src, snapshot: snap };
    } catch (e) {
      return { ok: false, reason: 'thrown', source: null, snapshot: null };
    }
  }
  /**
   * 快照字段的**在场三态**读数（尊重上游 v3.174 的 meta.fieldTypes）。
   * @returns {{present:boolean, kind:string}} kind ∈ {'value','null','absent'}
   *   为什么必须三态：`characters: null` 与快照里压根没有 `characters` 是两件事
   *   ——「对方的世界里没有人物」与「对方这版没外供人物」处置相反（前者照常推演，后者降级）。
   */
  function fieldState(snapshot, field) {
    try {
      const meta = snapshot && snapshot.meta;
      const ft = meta && meta.fieldTypes;
      const rec = ft && ft[field];
      if (rec && typeof rec === 'object') {
        if (rec.present === false) return { present: false, kind: 'absent' };
        return { present: true, kind: (rec.kind === 'null') ? 'null' : 'value' };
      }
      // 旧版/无自述：退化为「自己看字段在不在」，但**如实标注这是退化读数**
      const has = snapshot && Object.prototype.hasOwnProperty.call(snapshot, field);
      if (!has) return { present: false, kind: 'absent' };
      return { present: true, kind: (snapshot[field] === null) ? 'null' : 'value' };
    } catch (e) { return { present: false, kind: 'absent' }; }
  }
  /**
   * 对账：本扩展的世界钟 vs LonSha 记的时钟。
   * 两者的形态本就不同（本扩展是自由标签「第N日·黄昏」+ 可选 iso；对方是日期串），
   * 故只做**可比条件下的**对账，不可比就如实说不可比。
   * @param {object} snapshot LonSha 快照
   * @returns {{comparable:boolean, verdict:string, days:number|null, worldDate:string, lonshaDate:string,
   *            worldEpochDay:number|null, lonshaEpochDay:number|null}}
   *   verdict ∈ { same, world-ahead, world-behind, lonsha-empty, world-uncomparable, unparsable }
   *   · world-ahead   —— 本扩展的世界钟在前（对方记的那本账落后）
   *   · world-behind  —— 本扩展的世界钟在后
   *   · lonsha-empty  —— **对方还没记时间**（与「记了一个我解析不了的日期」分开——
   *                      前者等它，后者是两套历法，处置相反）
   *   · world-uncomparable —— **本扩展这一侧没有公历钟**（label 是自由标签「第12日·黄昏」，
   *                      没有 iso）。这是本扩展的常态，不是故障：世界钟是推演标签，
   *                      从不承诺公历。此态与 unparsable（两侧都该有却读不出）分开——
   *                      前者是「本就不该比」，后者是「本该能比却坏了」。
   *   · unparsable    —— 两侧都有值，但至少一侧的日期串读不出
   */
  function diffWithLonsha(snapshot) {
    try { return diffWithLonshaInner(snapshot); }
    catch (e) { return { comparable: false, verdict: 'unparsable', days: null, worldDate: '', lonshaDate: '', worldEpochDay: null, lonshaEpochDay: null }; }
  }
  function diffWithLonshaInner(snapshot) {
    const worldDate = clockDateString();
    const lonshaDate = lonshaClockDate(snapshot);
    const parse = (s) => {
      const m = /^(\d{1,4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/.exec(String(s || '').trim());
      if (!m) return null;
      const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
      if (!(y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
      return Date.UTC(y, mo - 1, d) / 86400000;
    };
    const base = { worldDate, lonshaDate, worldEpochDay: null, lonshaEpochDay: null };
    const raw = String(lonshaDate || '').trim();
    // 先判「对方有没有记」：空 ⇒ lonsha-empty（缺席不是历法，也不是解析失败）。
    if (!raw) return Object.assign(base, { comparable: false, verdict: 'lonsha-empty', days: null });
    // 再判「我这一侧有没有公历钟」：本扩展的 label 是自由标签（「第12日·黄昏」），
    //   没有 iso 是**常态**而非坏掉——此时压根不该与公历硬比（否则会报出一个假的「不一致」）。
    if (!String(worldDate || '').trim()) {
      return Object.assign(base, { comparable: false, verdict: 'world-uncomparable', days: null });
    }
    const a = parse(worldDate), b = parse(raw);
    if (a === null || b === null) {
      return Object.assign(base, { comparable: false, verdict: 'unparsable', days: null });
    }
    const days = b - a;   // 正 = 对方记的日期在后（本扩展走在前 → world-ahead）
    let verdict = 'same';
    if (days > 0) verdict = 'world-ahead';
    else if (days < 0) verdict = 'world-behind';
    return { comparable: true, verdict, days, worldDate, lonshaDate, worldEpochDay: a, lonshaEpochDay: b };
  }
  /** 本扩展世界钟的**公历形态**日期串（无 iso 即空串——自由标签不与公历硬比） */
  function clockDateString() {
    try {
      const st = (WA.store && WA.store.get) ? WA.store.get() : null;
      const c = (st && st.clock) || null;
      if (!c) return '';
      const iso = String(c.iso || '').trim();
      if (iso) return iso;
      return '';   // label 是自由标签（「第12日·黄昏」），不是公历日期，不参与硬比
    } catch (e) { return ''; }
  }
  /** 对方快照里记的日期（GameClock.date，形如 '2026-09-13' / '2026年09月13日' / 古历串） */
  function lonshaClockDate(snapshot) {
    try {
      const c = snapshot && snapshot.clock;
      if (!c || typeof c !== 'object') return '';
      return String(c.date || '').trim();
    } catch (e) { return ''; }
  }
  /**
   * 快照**形状**摘要（不搬运内容，只报「有什么、多大、能不能序列化」）。
   * 本项目一贯的「读者侧可归因」口径：宿主拿到一份快照，至少要能判它是不是完整的。
   */
  function summarizeSnapshot(snapshot) {
    try {
      const meta = (snapshot && snapshot.meta) || {};
      const ft = meta.fieldTypes || {};
      const fields = ['protagonist', 'lifeDetails', 'characters', 'moneyLedger', 'outline',
        'worldProg', 'clock', 'recallAudit'];
      const present = [], absent = [], nullish = [];
      for (const f of fields) {
        const s = fieldState(snapshot, f);
        if (!s.present) absent.push(f);
        else if (s.kind === 'null') nullish.push(f);
        else present.push(f);
      }
      return {
        contract: String(meta.contract || ''),
        selfBytes: Number(meta.selfBytes) || 0,
        strictJsonOk: meta.strictJsonOk !== false,
        floor: Number(snapshot && snapshot.floor) || 0,
        pluginVersion: String((snapshot && snapshot.pluginVersion) || ''),
        hasFieldTypes: !!(ft && typeof ft === 'object' && Object.keys(ft).length),
        present, absent, nullish
      };
    } catch (e) {
      return { contract: '', selfBytes: 0, strictJsonOk: false, floor: 0, pluginVersion: '', hasFieldTypes: false, present: [], absent: [], nullish: [] };
    }
  }
  /** 一句话归因（供面板/诊断念出；纯读） */
  function describeLonsha(read) {
    try { return describeLonshaInner(read); } catch (e) { return '未知'; }
  }
  function describeLonshaInner(read) {
    if (!read) return '未读';
    if (read.ok) return '就绪（floor=' + (Number(read.snapshot && read.snapshot.floor) || 0) + '）';
    const M = {
      'not-mounted': 'LonSha 记忆插件未安装',
      'engine-absent': 'LonSha 插件在，但记忆引擎未就位',
      'engine-empty': 'LonSha 内存引擎在位但明确返回空',
      'thrown': 'LonSha 桥取快照抛错',
      'no-snapshot': '桥在但尚未产出过快照',
      'contract-mismatch': 'LonSha 快照契约版本与本消费者不一致',
      'pull-failed': '拉取失败'
    };
    return M[read.reason] || String(read.reason || '未知');
  }

  /**
   * [v2.18.0] 逐本账的**在场三态**读数（八本账 + 对读读数）。
   * 复用 fieldState —— 尊重对方 `meta.fieldTypes`：**未外供 ≠ 空**。
   * 每本另标 size（键数/条数，供形状画像用；不搬运内容）。
   * @returns {Array<{field:string, present:boolean, kind:string, size:number, isEcho:boolean}>}
   */
  function ledgerSection(snapshot) {
    try { return ledgerSectionInner(snapshot); }
    catch (e) { return LEDGER_SECTIONS.map(function (f) { return { field: f, present: false, kind: 'absent', size: 0, isEcho: f === ECHO_SECTION }; }); }
  }
  function ledgerSectionInner(snapshot) {
    const out = [];
    for (const f of LEDGER_SECTIONS) {
      const st = fieldState(snapshot, f);
      let size = 0;
      if (st.present && st.kind !== 'null') {
        const v = snapshot && snapshot[f];
        if (Array.isArray(v)) size = v.length;
        else if (v && typeof v === 'object') size = Object.keys(v).length;
        else if (typeof v === 'string') size = v.length;
      }
      out.push({ field: f, present: st.present, kind: st.kind, size: size, isEcho: f === ECHO_SECTION });
    }
    return out;
  }
  /**
   * [v2.18.0] 八本账的形状画像（不搬运内容）。
   *
   * 关键口径：`absentFromContract` 只统计**对方这一版压根没外供**的账本（present=false）。
   * 若把「显式为空」（kind='null'）也算进去，就会把「对方明确说没有」与「对方没这个字段」
   * 压成同一句「缺 N 本账」——两者处置相反（前者照常推演，后者降级）。
   * @returns {{entries:Array, total:number, sections:{value:number, nullish:number, absent:number},
   *            absentList:string[], echoPresent:boolean, echoExported:boolean}}
   *   echoPresent —— 对方的对读读数在场（说明对方**已经在读**本扩展了）
   */
  function ledgerSummary(snapshot) {
    try { return ledgerSummaryInner(snapshot); }
    catch (e) { return { entries: [], total: 0, sections: { value: 0, nullish: 0, absent: 0 }, absentList: [], echoPresent: false, echoExported: false }; }
  }
  function ledgerSummaryInner(snapshot) {
    const entries = ledgerSection(snapshot).map(function (s) {
      const v = (s.present && s.kind !== 'null') ? (snapshot && snapshot[s.field]) : null;
      const keys = (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).slice(0, 12) : [];
      return { field: s.field, present: s.present, kind: s.kind, size: s.size, keys: keys, isEcho: s.isEcho };
    });
    const sections = { value: 0, nullish: 0, absent: 0 };
    const absentList = [];
    for (const e of entries) {
      if (!e.present) { sections.absent++; absentList.push(e.field); }
      else if (e.kind === 'null') sections.nullish++;
      else sections.value++;
    }
    const echo = entries.filter(function (e) { return e.isEcho; })[0] || null;
    return {
      entries: entries, total: entries.length, sections: sections, absentList: absentList,
      echoPresent: !!(echo && echo.present),
      echoExported: !!(echo && echo.present && echo.kind !== 'null')
    };
  }
  /** 取本扩展 store 侧的对应账本（纯读；取不到即 []，调用方据 available 判「不可比」） */
  function myLedgerList(section) {
    try {
      const st = (WA.store && WA.store.get) ? WA.store.get() : null;
      if (!st) return [];
      const v = st[section];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') return Object.keys(v);
      return [];
    } catch (e) { return []; }
  }
  /** 从任意条目里取出「名字」（字符串直接用；对象取 id/name/key/title/field） */
  function nameOf(x) {
    if (typeof x === 'string') return x.trim();
    if (x && typeof x === 'object') return String(x.id || x.name || x.key || x.title || x.field || '').trim();
    return '';
  }
  /**
   * 从对方的对读读数里取一支。
   *
   * 纪律：必须 `hasOwnProperty` 才算「对方外供了这一支」——「键在」与「值为 null」不得同形
   * （前者是「对方给了、内容是空」，后者是「对方这版压根没这一支」）。
   * 上游 v3.176.0 的三处构造点（正常 / reader 缺席 / 抛错兜底）**键集一致**，
   * 故「没这一支」只可能来自**比 v3.176.0 更旧的上游**，那时本侧应降级而不是报空。
   */
  function echoPick(led, sub) {
    try {
      if (!led || typeof led !== 'object') return { available: false, hasValue: false, value: null };
      if (!Object.prototype.hasOwnProperty.call(led, sub)) return { available: false, hasValue: false, value: null };
      const v = led[sub];
      return { available: true, hasValue: (v !== null && v !== undefined), value: v };
    } catch (e) { return { available: false, hasValue: false, value: null }; }
  }
  /**
   * 上游键集**自证**：对方外供的对读读数里，哪些键是本模块认得的、哪些不认识。
   * 用途：诊断面念出「我读的键上游真的有」（`unknown` 非空即说明上游加了新键而本侧还没读，
   * 或本侧读了一个上游没有的键——后者正是「测试绿而生产不工作」的形态）。
   */
  function echoShape(snapshot) {
    try {
      const led = obj(snapshot && snapshot[ECHO_SECTION]);
      if (!led) return { present: false, keys: [], known: [], unknown: [], missing: [], readKeys: ECHO_KEYS.slice() };
      const keys = Object.keys(led);
      return {
        present: true, keys: keys, readKeys: ECHO_KEYS.slice(),
        known: keys.filter(function (k) { return ECHO_KEYS.indexOf(k) >= 0; }),
        // 上游有、本侧不认 —— 上游加了新面而本侧还没读（不是缺陷，但要可见）。
        unknown: keys.filter(function (k) { return ECHO_KEYS.indexOf(k) < 0; }),
        // 本侧认、上游没有 —— **这才是真缺陷**：本侧读了一个上游并不外供的键，
        //   于是那处读数在真实联调里恒为 absent，而手工夹具却能把它喂绿。
        missing: ECHO_KEYS.filter(function (k) { return keys.indexOf(k) < 0; })
      };
    } catch (e) { return { present: false, keys: [], known: [], unknown: [], missing: [], readKeys: ECHO_KEYS.slice() }; }
  }
  /**
   * 把对方已算好的一支**对读结论**归一成本侧统一形状（透传 + 有界，不自算差集）。
   *
   * 关键口径：`*Total` **优先取对方自述**——那是未切片的口径。若上游没给总数，只能退化为
   * 「我看到的条数」，此时必须标 `totalFromPeer=false`：否则一份被上游截断过的明细会被
   * 本侧当成「总共就这么多」念出去（总数失真比明细膨胀更难发现）。
   */
  function absorbDiff(one, limit) {
    const o = obj(one) || {};
    const lim = num(limit) || 12;
    const worldOnly = arr(o.worldOnly).map(nameOf).filter(Boolean);
    const localOnly = arr(o.localOnly).map(nameOf).filter(Boolean);
    const hasTotal = (o.worldOnlyTotal !== undefined) || (o.localOnlyTotal !== undefined);
    // ★ 上游 `diffPeople` 与 `diffFacts` 对「两侧都有」用的是**两个不同的键名**：
    //   diffFacts 给 `shared`，diffPeople 给 `matched`（逐条对 world-ledger-reader.js 核过）。
    //   只认 `shared` 会让人物支的「两侧都记」**恒为 0**——看着像「两边完全对不上」，
    //   而实际只是键名没认全。故两个键都认，且**显式判 hasOwnProperty**
    //   （用 `||` 会把「上游给的就是 0」与「上游压根没给」压成同一态）。
    let sharedN = 0;
    if (Object.prototype.hasOwnProperty.call(o, 'shared')) sharedN = num(o.shared);
    else if (Object.prototype.hasOwnProperty.call(o, 'matched')) sharedN = num(o.matched);
    return {
      shared: sharedN,
      worldOnly: worldOnly.slice(0, lim),
      worldOnlyTotal: hasTotal ? num(o.worldOnlyTotal) : worldOnly.length,
      localOnly: localOnly.slice(0, lim),
      localOnlyTotal: hasTotal ? num(o.localOnlyTotal) : localOnly.length,
      totalFromPeer: hasTotal,
      // 位置冲突是「对不上」最具体的形态，单独透出（`one-sided` 是「一边没记」，不是冲突）。
      mismatched: num(o.mismatchedTotal) || arr(o.mismatched).length,
      conflicts: (arr(o.conflicts).length ? arr(o.conflicts).length : arr(o.mismatched).filter(function (m) { return obj(m) && m.kind === 'conflict'; }).length)
    };
  }
  /**
   * 取「缺口」这一支（`gap`）。
   *
   * 语义反转要看清：缺口里的 `notMarked[]` 是**对方读本扩展时没拿到的**那批暗流，
   * 也就是「本侧有、对方的账上没有」——故它落在 `worldOnly` 这一侧（是**我方**的条数，
   * 不是对方的）。`shared` 取 `exported`（真正递出去的那批）。
   * 而 `verdict` 必须是四态之一：`full` / `complete` / `gapped` / `no-filter`——
   * 其中 **`no-filter`（缺口不可知）与 `complete`（明确无缺口）绝不同形**，本侧照原样透传不合并。
   */
  function absorbGap(gap, limit) {
    const g = obj(gap) || {};
    const lim = num(limit) || 12;
    const missing = arr(g.notMarked).map(nameOf).filter(Boolean);
    const verdict = txt(g.verdict);
    return {
      shared: num(g.exported),
      worldOnly: missing.slice(0, lim),
      worldOnlyTotal: num(g.notMarkedCount) || missing.length,
      localOnly: [], localOnlyTotal: 0,
      totalFromPeer: (g.notMarkedCount !== undefined),
      mismatched: 0, conflicts: 0,
      // 缺口四态与缺口率一并带上——否则「有多少东西没给我」仍然只是个数字。
      verdict: verdict, gapRatio: num(g.gapRatio), hiddenTotal: num(g.hiddenTotal),
      truncated: g.truncated === true
    };
  }
  /**
   * [v2.18.0] 三处**对读面**：透传对方已算好的对读结论 + 环归因 + 口径对齐。
   *
   * @returns {{items:Array, echoKind:string, echoShape:object, echoOk:boolean, echoReason:string,
   *            echoNotice:string}}
   *   items[i] = { id:'currents'|'facts'|'people', sub:string, kind:'echo'|'absent',
   *                theirsAvailable:boolean, theirsHasValue:boolean, mineAvailable:boolean,
   *                comparable:boolean, shared:number, worldOnly:string[], worldOnlyTotal:number,
   *                localOnly:string[], localOnlyTotal:number, totalFromPeer:boolean,
   *                mismatched:number, conflicts:number, verdict:string, gapRatio:number,
   *                hiddenTotal:number, truncated:boolean }
   *
   * 纪律（四条，全部是被踩过才写的）：
   *   ① **环必须被认出来**：那三支**源自在下的投影**，故 kind 一律 'echo'——
   *      「对方的世界」与「对方眼里的我」不得同形（同形即自我指涉）。
   *      也正因为它是环，本侧**只透传、不自算差集**：拿自己的 store 去和「自己外供的快照」
   *      做差集，等于拿投影跟自己对账，差集恒为 0 却看着像「两边一致」。
   *   ② **对方缺面 ≠ 空集**：不可用时 comparable=false、两侧差集一律 0，
   *      否则会报出一个假的「我这边多出来 N 项」——那是**我自己没外供**，不是对方少记。
   *   ③ **有界**：明细各 12 条 + 保留总数（读数会进诊断/面板，不能随剧情无界膨胀）；
   *      且总数**优先取对方自述**（未切片口径），退化时标 `totalFromPeer=false`。
   *   ④ **取数键必须是上游真有的**：见 `ECHO_KEYS`——读了不存在的键，
   *      真实联调下恒为 absent，而手工夹具却能把它喂绿（测试绿而生产不工作）。
   */
  function ledgerBridges(snapshot) {
    try { return ledgerBridgesInner(snapshot); }
    catch (e) { return { items: [], echoKind: 'absent', echoNotice: '对读面读取失败' }; }
  }
  function ledgerBridgesInner(snapshot) {
    const led = obj(snapshot && snapshot[ECHO_SECTION]);
    const items = [];
    let anyEcho = false;
    for (const pair of BRIDGE_PAIRS) {
      const pick = echoPick(led, pair.sub);
      const mineArr = myLedgerList(MINE_SECTION[pair.id]);
      const mineAvailable = mineArr.length > 0;
      if (pick.available) anyEcho = true;
      // `available` 与 `hasValue` 分开：前者「上游这版有没有这一支」，后者「这一支里面有没有东西」。
      //   两者压成一态，就会把「上游没给」念成「上游给了个空的」。
      const usable = pick.available && pick.hasValue;
      const ab = !usable
        ? { shared: 0, worldOnly: [], worldOnlyTotal: 0, localOnly: [], localOnlyTotal: 0,
            totalFromPeer: false, mismatched: 0, conflicts: 0 }
        : (pair.from === 'gap' ? absorbGap(pick.value, 12) : absorbDiff(pick.value, 12));
      items.push({
        id: pair.id, kind: pick.available ? 'echo' : 'absent',
        theirsAvailable: pick.available, theirsHasValue: pick.hasValue, mineAvailable: mineAvailable,
        // 「可比」= 上游真外供了这一支 + 这一支里有内容 + 本侧也有这本账。
        //   缺任一侧都只是**不可比**，不是「差集很大」。
        comparable: usable && mineAvailable,
        shared: ab.shared,
        worldOnly: ab.worldOnly, worldOnlyTotal: ab.worldOnlyTotal,
        localOnly: ab.localOnly, localOnlyTotal: ab.localOnlyTotal,
        totalFromPeer: ab.totalFromPeer,
        mismatched: ab.mismatched, conflicts: ab.conflicts,
        // 缺口支独有：缺口四态与缺口率。「不可知」与「没有缺口」必须靠 verdict 分开。
        verdict: ab.verdict || '', gapRatio: num(ab.gapRatio), hiddenTotal: num(ab.hiddenTotal),
        truncated: ab.truncated === true,
        sub: pair.sub
      });
    }
    // 三处一律不可用 ⇒ echoKind='absent'（上游没在读本扩展 / 上游版本早于 v3.176.0）。
    return {
      items: items,
      echoKind: anyEcho ? 'echo' : 'absent',
      echoShape: echoShape(snapshot),
      // 上游这一版**读本扩展**读得成不成：`ok` 是上游自述，`reason` 是它的归因
      //   （如 `reader-unavailable` / `thrown`）。三处对读面全 absent 时，
      //   光看 absent 分不清「上游没读我」与「上游读了但读不成」——这两件事处置相反。
      echoOk: !!(led && led.ok === true),
      echoReason: txt(led && led.reason),
      echoNotice: anyEcho
        ? '对读读数（' + ECHO_SECTION + '）是对方**读本扩展**所得——本模块标 kind=echo：'
          + '它反映的是「对方眼里的我」，不是「对方的世界」，不得当外部事实引用'
        : '对方未外供对读读数（' + ECHO_SECTION + '）——无环，但也说明对方还没在读本扩展'
    };
  }
  /** [v2.18.0] 一句话点出环（供诊断/面板念出；纯读） */
  function echoNotice(snapshot) {
    try { return ledgerBridges(snapshot).echoNotice; }
    catch (e) { return '对读面读取失败'; }
  }

  const api = {
    LONSHA_BRIDGE_ID,
    LONSHA_BRIDGE_VERSION,
    REASONS,
    LEDGER_SECTIONS,
    BRIDGE_PAIRS,
    MINE_SECTION,
    ECHO_KEYS,
    ECHO_SECTION,
    getBridge,
    lonshaSource,
    readLonshaSnapshot,
    fieldState,
    ledgerSection,
    ledgerSummary,
    ledgerBridges,
    echoShape,
    echoNotice,
    diffWithLonsha,
    clockDateString,
    lonshaClockDate,
    summarizeSnapshot,
    describeLonsha
  };
  WA.lonshaReader = api;
  if (WA.log) WA.log('info', '记忆桥消费面已加载（只读 ' + LONSHA_BRIDGE_ID + '）');
})();
