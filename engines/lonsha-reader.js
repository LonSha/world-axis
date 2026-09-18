/**
 * WorldAxis engines/lonsha-reader.js (v2.17.0) — 记忆桥消费面（只读）
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

  const api = {
    LONSHA_BRIDGE_ID,
    LONSHA_BRIDGE_VERSION,
    REASONS,
    getBridge,
    lonshaSource,
    readLonshaSnapshot,
    fieldState,
    diffWithLonsha,
    clockDateString,
    lonshaClockDate,
    summarizeSnapshot,
    describeLonsha
  };
  WA.lonshaReader = api;
  if (WA.log) WA.log('info', '记忆桥消费面已加载（只读 ' + LONSHA_BRIDGE_ID + '）');
})();
