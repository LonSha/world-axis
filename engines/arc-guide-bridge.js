/**
 * WorldAxis engines/arc-guide-bridge.js (v2.591.0) — 引导弧的落地面（R266 / NAR-1）
 *
 * ── 它治什么（现场读数，不是阅读推断）────────────────────────────────
 *   `engines/arc-guide.js`（v2.532.0）把「多拍长线引导」的窗口算法写得很干净：
 *   `plan(arcs, {floor})` 只收 `floor - depth < at <= floor` 的拍、不猜在场、
 *   出窗的可复算。**但它的每一个入口都要调方把 `arcs` 传进去** ——
 *   而全仓没有任何一处保存「弧长什么样」：`grep WA.arcGuide` 在产品面零命中，
 *   它在零读 ns 名单里挂着的就是这个形状「纯函数库 + 无配置来源」。
 *   后果：多拍长线引导在本仓**从来没有真的发生过** —— 不是没实现，是没入口。
 *
 *   本面只补两个缺口，不重写窗口：
 *     ① **弧从哪来**：存在 store 里（有界：`maxArcs` × `maxBeats`），由调用方一次写清；
 *     ② **楼层从哪来**：现场读宿主聊天（`chat.length - 1`，与 `engines/floor-settle.js`
 *        的 `floorNow()` 同口径），读不到才退到手动 `advance()` 记的值，
 *        两者都没有 ⇒ `why='no-floor'` + 空块（**绝不默认第 0 层**）。
 *
 * ── 七条纪律（写死在 tests/arc-guide-bridge-v2591.js 里）────────────────
 *   1 总开关**默认关**（`__REG.def.enabled = false`）：这是个新注入源，关掉时
 *     `buildBlock()` 返回空串，注入正文逐字与旧版相同 —— 这是它能现在上线的唯一理由
 *     （与 v2.588.0 外貌词库同一条；区别是这里连「候选词」都不给）。
 *   2 **不猜楼层**：缺楼层就回空块 + `why` 点名（`no-floor`），不拿 0 冒充。
 *     猜出来的在场比缺席更坏 —— 它会悄悄决定叙事节奏。
 *   3 **窗口不重写**：窗口/排序/关键词一律委托 `WA.arcGuide`（纯函数真源）。
 *     本文件里 0 处 `depth` 比较运算、0 处拍排序 —— 抄一遍就是第二份真源，
 *     而两份窗口算法一旦漂移，同一层会看到两种「该注入哪几拍」。
 *   4 **坏弧只进 rejected**，好弧照收：一条弧写坏了不该让全部弧废掉（与 ctx-boundary 同款）。
 *   5 **只写自己的桶**（`draft.arcGuideBridge`），不碰任何其它存档键；
 *     `plan`/`advance` 是仅有的两个写口，其余全是纯读。
 *   6 **正文不入料**：`buildBlock()` 只输出**窗口内**拍的 `text`；出窗的拍、
 *     未到的拍、以及拍之外的一切（弧名除外）都不进正文 —— 提前漏一拍就是剧透。
 *   7 **空块不自夸**：没弧 / 没楼层 / 全出窗时 `text` 为空串且 `why` 点名，
 *     不输出一句「（本弧无内容）」去占 token。
 */
(function () {
  'use strict';

  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.591.0';
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_arc_guide_bridge_v1';
  const DEF = { enabled: false, maxArcs: 8, maxBeats: 32, depth: 3, maxChars: 900 };
  const __REG = { key: LS_KEY, def: DEF, module: 'arcGuideBridge',
    bounds: { maxArcs: [1, 32], maxBeats: [1, 64], depth: [1, 20], maxChars: [120, 4000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') return { ok: false, reason: 'settings-bus-absent' };
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { plans: 0, advances: 0, blocks: 0, injected: 0, blocked: 0, faults: {}, lastReason: '' };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  // 换行符用 fromCharCode 取：本文件里的多行拼接不写字面转义，任何编辑器/格式化工具
  //   都不会把它误断成真换行（本仓历史上真被这件事咬过两次）。
  const NL = String.fromCharCode(10);
  function finite(v) { return typeof v === 'number' && isFinite(v); }

  // ── 楼层：与 floor-settle 同口径。读不到就是 null，不默认 0。 ──
  function floorNow() {
    try {
      const st = WA.mainWin && WA.mainWin.SillyTavern;
      const ctx = (st && typeof st.getContext === 'function') ? st.getContext() : null;
      const chat = ctx && ctx.chat;
      if (!chat || !chat.length) return null;
      return chat.length - 1;
    } catch (e) { return null; }
  }

  // ── store 桶（只碰自己的键）──
  function bucket(draft) {
    if (!draft.arcGuideBridge || typeof draft.arcGuideBridge !== 'object' || Array.isArray(draft.arcGuideBridge)) {
      draft.arcGuideBridge = { arcs: [], floor: null, at: 0 };
    }
    const b = draft.arcGuideBridge;
    if (!Array.isArray(b.arcs)) b.arcs = [];
    if (!finite(b.floor)) b.floor = null;
    return b;
  }
  function state() {
    const s = (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {};
    const b = (s.arcGuideBridge && typeof s.arcGuideBridge === 'object') ? s.arcGuideBridge : null;
    return { arcs: (b && Array.isArray(b.arcs)) ? b.arcs : [], floor: (b && finite(b.floor)) ? b.floor : null };
  }
  /** 楼层优先级：现场聊天 > 手动 advance 记的值 > null（不猜）。 */
  function currentFloor() {
    const live = floorNow();
    if (finite(live)) return { floor: live, source: 'chat' };
    const s = state();
    if (finite(s.floor)) return { floor: s.floor, source: 'manual' };
    return { floor: null, source: 'none' };
  }

  /** 登记弧（全量替换）。窗口与拍排序全部委托 arcGuide。 */
  function plan(arcs) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const G = WA.arcGuide;
    if (!G || typeof G.parseArcs !== 'function') { noteFault('module-missing'); return { ok: false, reason: 'module-missing' }; }
    if (!Array.isArray(arcs)) { noteFault('not-array'); return { ok: false, reason: 'not-array' }; }
    // 上限：先截批次再交给 arcGuide（它的 MAX_ARCS 是 32，我们这里更小 —— 但它仍是硬上限的最终裁定人）。
    const batch = arcs.slice(0, Math.max(1, cfg.maxArcs));
    const cut = arcs.length > batch.length ? (arcs.length - batch.length) : 0;
    const parsed = G.parseArcs(batch);
    let kept = 0, beats = 0;
    const rows = [];
    parsed.arcs.forEach(function (A) {
      const bs = A.beats.slice(0, Math.max(1, cfg.maxBeats));
      rows.push({ id: A.id, depth: A.depth, beats: bs });
      kept++; beats += bs.length;
    });
    let out = null;
    const r = (WA.store && typeof WA.store.transact === 'function') ? WA.store.transact(function (d) {
      const b = bucket(d);
      // 落盘只存弧定义本身：拍里的 text 是数据，`at`/`key` 是算法输入；不存任何派生读数。
      b.arcs = rows.map(function (A) { return { id: A.id, depth: A.depth, beats: A.beats.map(function (x) { return { no: x.no, key: x.key, at: x.at, text: x.text }; }) }; });
      b.at = clockNow('arcGuideBridge');
      out = { ok: true, kept: kept, beats: beats, rejected: parsed.rejected.slice(), cut: cut };
      return true;
    }, 'arcGuideBridge:plan') : null;
    if (!out || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.plans++; stat.lastReason = 'planned';
    return out;
  }

  /** 手动推进楼层（无头/测试/面板用）。**单调不减**：回退会让已放行的拍重新变缺席。 */
  function advance(to) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const cur = state().floor;
    const t = finite(to) ? Math.floor(to) : (finite(cur) ? cur + 1 : 0);
    if (finite(cur) && t < cur) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', detail: '楼层单调不减' }; }
    let out = null;
    const r = (WA.store && typeof WA.store.transact === 'function') ? WA.store.transact(function (d) {
      const b = bucket(d);
      b.floor = finite(cur) ? Math.max(cur, t) : t;
      out = { ok: true, floor: b.floor };
      return true;
    }, 'arcGuideBridge:advance') : null;
    if (!out || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.advances++; stat.lastReason = 'advanced';
    return out;
  }

  /** 读数面：窗口逐弧展开（全部由 arcGuide.plan 算，本面只搬运）。 */
  function view(opts) {
    const cfg = settings();
    const G = WA.arcGuide;
    const o = (opts && typeof opts === 'object') ? opts : {};
    const cf = currentFloor();
    const s = state();
    const base = { ok: true, version: VERSION, enabled: !!cfg.enabled, depth: cfg.depth,
      floor: cf.floor, floorSource: cf.source, arcs: s.arcs.length,
      beats: 0, injectCount: 0, expiredCount: 0, rejected: [], rows: [], why: null };
    if (!G || typeof G.plan !== 'function') { base.ok = false; base.why = 'module-missing'; return base; }
    if (!s.arcs.length) { base.why = 'no-arc'; return base; }
    // depth：以每弧自己的 depth 为准（arc-guide 的口径），cfg.depth 只是**新弧的默认值**，
    //   已登记的弧不会被全局 depth 改写 —— 否则改一次设置就重写了历史弧的节奏。
    const p = G.plan(s.arcs, { floor: cf.floor });
    base.rejected = (p.rejected || []).slice();
    base.injectCount = p.injectCount;
    base.rows = (p.rows || []).map(function (r2) {
      base.expiredCount += r2.expired;
      return { id: r2.id, depth: r2.depth, active: r2.active, inject: r2.inject.slice(),
        expired: r2.expired, upcoming: r2.upcoming, why: r2.why };
    });
    base.beats = s.arcs.reduce(function (n, A) { return n + ((A && Array.isArray(A.beats)) ? A.beats.length : 0); }, 0);
    if (!finite(cf.floor)) base.why = 'no-floor';
    else if (!base.injectCount) base.why = 'all-out-of-window';
    return base;
  }

  /**
   * 注入块：只输出**窗口内**且**有正文**的拍。
   * 空串的四种原因都写进 `why`：`disabled` / `no-arc` / `no-floor` / `all-out-of-window`。
   */
  function buildBlock(opts) {
    const cfg = settings();
    const block = { ok: true, text: '', why: null, floor: null, inject: [], expired: 0, dropped: 0 };
    if (!cfg.enabled) { block.why = 'disabled'; return block; }
    const v = view(opts);
    stat.blocks++;
    if (!v.ok) { block.ok = false; block.why = v.why; return block; }
    block.floor = v.floor;
    if (!v.arcs || !v.injectCount) { block.why = v.why; return block; }
    const s = state();
    const byId = {};
    s.arcs.forEach(function (A) { if (A && A.id) byId[A.id] = A; });
    const lines = [];
    let chars = 0;
    v.rows.forEach(function (r) {
      const A = byId[r.id];
      if (!A) return;
      r.inject.forEach(function (no) {
        const beat = (A.beats || []).filter(function (b) { return b && b.no === no; })[0];
        const txt = beat && typeof beat.text === 'string' ? beat.text.trim() : '';
        if (!txt) { block.dropped++; return; }
        const line = '· ' + A.id + ' 第' + no + '拍：' + txt;
        if (chars + line.length > cfg.maxChars) { block.dropped++; return; }
        chars += line.length + 1;
        lines.push(line);
        block.inject.push({ arc: A.id, no: no });
      });
      block.expired += r.expired;
    });
    if (!lines.length) { block.why = 'no-text-in-window'; return block; }
    block.text = '[引导弧]（第 ' + v.floor + ' 层窗口内该在场的拍：只演这些，后面的不要提前演）'
      + NL + lines.join(NL);
    stat.injected++;
    stat.lastReason = 'injected';
    return block;
  }

  /** 关键词登记表（给世界书扫描面）：全部委托 arcGuide.keysOf。 */
  function keys() {
    const G = WA.arcGuide;
    if (!G || typeof G.keysOf !== 'function') return { ok: false, reason: 'module-missing', rows: [], keys: [] };
    const s = state();
    const k = G.keysOf(s.arcs);
    return { ok: true, rows: (k.rows || []).slice(), keys: (k.keys || []).slice(), rejected: (k.rejected || []).slice() };
  }

  function diagnose() {
    const v = view({});
    const k = keys();
    const cfg = settings();
    return {
      ok: true, version: VERSION, enabled: !!cfg.enabled,
      floor: v.floor, floorSource: v.floorSource, why: v.why,
      arcs: v.arcs, beats: v.beats, injectCount: v.injectCount, expiredCount: v.expiredCount,
      keys: k.keys.length, rejected: (v.rejected || []).length + ((k.rejected || []).length),
      rows: v.rows.map(function (r) { return { id: r.id, active: r.active, inject: r.inject.length, expired: r.expired, upcoming: r.upcoming, why: r.why || null }; }),
      stat: { plans: stat.plans, advances: stat.advances, blocks: stat.blocks, injected: stat.injected, blocked: stat.blocked, lastReason: stat.lastReason, faults: Object.keys(stat.faults).length },
      note: '窗口与关键词全部委托 WA.arcGuide（纯函数真源）；本面只回答「弧存在哪、楼层从哪来」。'
        + '开默认关时 buildBlock 返回空串（注入正文逐字与旧版相同）。'
    };
  }

  function summaryText(v) {
    const r = v || view({});
    if (!r.ok) return '引导弧：读不出来（' + r.why + '）—— 不拿空账冒充';
    if (!r.enabled) return '引导弧：总开关关着（buildBlock 返回空串，注入正文与旧版逐字相同）';
    if (!r.arcs) return '引导弧：已登记 0 弧（plan() 写入后才有窗口可算）';
    if (!finite(r.floor)) return '引导弧：' + r.arcs + ' 弧 / ' + r.beats + ' 拍，但**楼层读不到**（不动推测：chat 读不到且未手动 advance）';
    return '引导弧：' + r.arcs + ' 弧 / ' + r.beats + ' 拍，第 ' + r.floor + ' 层（' + r.floorSource + '）'
      + '窗口内 ' + r.injectCount + ' 拍、出窗 ' + r.expiredCount + ' 拍';
  }

  function __reset() {
    stat.plans = 0; stat.advances = 0; stat.blocks = 0; stat.injected = 0; stat.blocked = 0;
    stat.faults = {}; stat.lastReason = '';
  }

  WA.arcGuideBridge = {
    VERSION: VERSION,
    plan: plan, advance: advance, currentFloor: currentFloor,
    view: view, buildBlock: buildBlock, keys: keys,
    diagnose: diagnose, summaryText: summaryText,
    getSettings: settings, setSettings: saveSettings,
    stat: function () {
      return { plans: stat.plans, advances: stat.advances, blocks: stat.blocks, injected: stat.injected,
        blocked: stat.blocked, lastReason: stat.lastReason, faults: Object.assign({}, stat.faults) };
    },
    __reset: __reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/arc-guide-bridge.js', { kind: 'engine', ver: VERSION });
  }
})();
