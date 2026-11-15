/**
 * WorldAxis engines/artifice-degradation.js (v2.408.0) — EXV23-6 冶炼物理疲劳、材料裂解与器械损耗
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G4 实测：兵刃、防具、载具与构装体缺乏材料力学与物理应力疲劳（metalFatigue），
 *   连续重击无形变卡死，高温高压无炸膛碎裂，恶劣环境无金属氧化锈蚀。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `artificeDegradation.applyStress` 施加物理应力、过载热力或环境腐蚀，累积疲劳值；
 *   `artificeDegradation.inspectStructuralIntegrity` 评估断裂与卡死风险；
 *   `artificeDegradation.performMaintenance` 消耗耗材工料清障修复。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 概念神器或无形概念实体不可施加物理金属疲劳（refusal: inapplicable-material-property）。
 *   ② 结构严重碎裂（shattered: true）后禁止继续强行格挡使用（refusal: item-structurally-shattered）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_artifice_degradation_settings_v1';
  const DEF = {
    enabled: true,
    shatterStressThreshold: 90,
    jamThreshold: 70
  };

  const __REG = {
    module: 'artificeDegradation',
    key: 'artificeDegradation',
    name: '器械损耗与材料疲劳 (EXV23-6)',
    desc: '冷兵器、蒸汽构装体物理应力疲劳、机械卡死与炸膛碎裂模型',
    settingsKey: LS_KEY,
    schema: {
      enabled: { type: 'boolean', default: true },
      shatterStressThreshold: { type: 'number', default: 90 },
      jamThreshold: { type: 'number', default: 70 }
    }
  };
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  let STATE = null;

  let stat = null;

  function settings() {
    // v2.408.0（OPV23-9 回归逮到）：本函数此前调 `WA.settingsBus.getModuleSettings(key, DEF)` ——
    //   该成员在 settingsBus 的真实导出面上**不存在**（真实读口是 `read(reg)`）。
    //   因为带 `typeof === 'function'` 守卫，调用**静默落空**：本引擎的开关恒等于 DEF，
    //   「关闭引擎」这件事在宿主里从来没生效过。它是 HEAD 上就存在的预存缺陷
    //   （tests/gates.js / member-surface-gate / settings-bus-api-gate 三处同时点名），
    //   不是本批引入；本批按既有库内口径修正（与 engines/affect.js 逐字同规）。
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }

  /** v2.409.0: 时钟守卫（**单行式**，声明与 fallback 同行共现）。
   *  旧写法是跨四行的 `if (WA.clock && ...) return WA.clock.now(); return Date.now();` ——
   *  语义对（兜底不裸调），但右侧不在**同一行**，v2.22.0 的静态判据只认「同行有 WA.clock.」
   *  这一事实（守卫 vs 绕过的区别正在于它），于是 9 个模块的合法兜底全被归到裸调。
   *  改成本仓既有的单行式（intel/life/coop 等 12 个引擎同款），并补站点名 —— 站点名让
   *  「冻结之后时间还从哪漏」能定位到具体引擎。 */
  function clockNow(site) { try { return WA.clock.now(site || 'artifice-degradation'); } catch (e) { return Date.now(); } }

  function registerItem(itemId, materialSpec) {
    if (!itemId) return { ok: false, refusal: 'missing-item-id' };
    const m = materialSpec || {};
    const mat = m.material || 'steel';
    STATE.items[itemId] = {
      id: itemId,
      material: mat,
      isEthereal: Boolean(m.isEthereal),
      maxIntegrity: Number(m.maxIntegrity) || 100,
      currentIntegrity: Number(m.maxIntegrity) || 100,
      stressLevel: 0,
      jammed: false,
      shattered: false,
      rusted: false
    };
    return { ok: true, itemId: itemId, item: Object.assign({}, STATE.items[itemId]) };
  }

  function applyStress(itemId, stressSpec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, refusal: 'artifice-degradation-disabled' };
    if (!itemId) return { ok: false, refusal: 'missing-item-id' };
    if (!STATE.items[itemId]) {
      registerItem(itemId, { material: 'steel', maxIntegrity: 100 });
    }
    const it = STATE.items[itemId];
    if (it.isEthereal) {
      return {
        ok: false,
        refusal: 'inapplicable-material-property',
        hint: '神圣/无形虚灵概念器物不受物理机械疲劳法则约束'
      };
    }
    if (it.shattered) {
      return {
        ok: false,
        refusal: 'item-structurally-shattered',
        hint: '器械已彻底破裂粉碎，无法继续承力'
      };
    }

    const s = stressSpec || {};
    const shock = Math.max(1, Number(s.mechanicalShock) || 10);
    const thermal = Number(s.thermalStress) || 0;
    const corrosion = Number(s.corrosion) || 0;

    const totalStress = shock + thermal * 0.5 + corrosion * 0.8;
    it.stressLevel = Math.min(100, it.stressLevel + totalStress);
    it.currentIntegrity = Math.max(0, it.currentIntegrity - Math.floor(totalStress * 0.4));
    if (corrosion > 20) it.rusted = true;

    stat.stressesApplied++;

    if (it.stressLevel >= cfg.shatterStressThreshold || it.currentIntegrity <= 0) {
      it.shattered = true;
      stat.shattersOccurred++;
      return {
        ok: true,
        itemId: itemId,
        shattered: true,
        hint: '过载物理应力导致器械发生灾难性碎裂炸膛',
        at: clockNow()
      };
    }

    if (it.stressLevel >= cfg.jamThreshold && !it.jammed) {
      it.jammed = true;
      stat.jamsOccurred++;
      return {
        ok: true,
        itemId: itemId,
        jammed: true,
        hint: '机械结构受力形变卡死，需校正润滑',
        at: clockNow()
      };
    }

    return {
      ok: true,
      itemId: itemId,
      stressLevel: it.stressLevel,
      currentIntegrity: it.currentIntegrity,
      jammed: it.jammed,
      shattered: false,
      at: clockNow()
    };
  }

  function performMaintenance(itemId, materialSupply) {
    const it = STATE.items[itemId];
    if (!it) return { ok: false, refusal: 'item-not-found' };
    if (it.shattered) return { ok: false, refusal: 'item-structurally-shattered' };

    const supplies = Number(materialSupply) || 0;
    it.stressLevel = Math.max(0, it.stressLevel - supplies * 2);
    it.currentIntegrity = Math.min(it.maxIntegrity, it.currentIntegrity + supplies);
    it.jammed = false;
    it.rusted = false;
    stat.repairsDone++;

    return {
      ok: true,
      itemId: itemId,
      status: 'repaired',
      currentIntegrity: it.currentIntegrity,
      stressLevel: it.stressLevel,
      at: clockNow()
    };
  }

  function inspectStructuralIntegrity(itemId) {
    const it = STATE.items[itemId];
    if (!it) return { ok: false, refusal: 'item-not-found' };
    return {
      ok: true,
      itemId: itemId,
      material: it.material,
      currentIntegrity: it.currentIntegrity,
      stressLevel: it.stressLevel,
      isJammed: it.jammed,
      isShattered: it.shattered,
      isRusted: it.rusted
    };
  }

  function reset() {
    STATE.items = {};
    stat.stressesApplied = 0;
    stat.shattersOccurred = 0;
    stat.jamsOccurred = 0;
    stat.repairsDone = 0;
    return { ok: true };
  }

  function ownerCall(fn, args, readOnly) {
    if (!WA.store || typeof WA.store.withOwnerState !== 'function') return { ok: false, refusal: 'owner-store-unavailable' };
    return WA.store.withOwnerState('artificeDegradation', function (owned) {
      const prevState = STATE, prevStat = stat;
      STATE = owned; stat = owned._stats;
      try { return fn.apply(null, args); }
      finally { STATE = prevState; stat = prevStat; }
    }, { readOnly: readOnly });
  }

  WA.artificeDegradation = {
    registerItem: function () { return ownerCall(registerItem, arguments, false); },
    applyStress: function () { return ownerCall(applyStress, arguments, false); },
    performMaintenance: function () { return ownerCall(performMaintenance, arguments, false); },
    inspectStructuralIntegrity: function () { return ownerCall(inspectStructuralIntegrity, arguments, true); },
    reset: function () { return ownerCall(reset, arguments, false); },
    getSettings: settings
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/artifice-degradation.js', { kind: 'engine', ver: '2.408.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/artifice-degradation 已加载（2.408.0）');
  }
})();