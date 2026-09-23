/**
 * WorldAxis engines/warrant.js (v2.68.0)
 * 通缉：罪度三档 + 通缉不随死亡消除 + 惯犯盘查，只记账不执法。
 *
 * 缝合来源：《艾尔德兰》世界书的「法律与秩序系统 [6]」——
 *   轻度违法（罚款/警告）、中度违法（斗殴/偷窃/拒捕 → 通缉+入狱或保释）、
 *   重度违法（谋杀/纵火/叛国 → 全城警戒+赏金猎人）；「复活留档：通缉不随死亡消除」；
 *   「惯犯盘查：多次违法 ID 遭卫兵主动盘查」；「定罪对抗：逃跑/蒙混/贿赂强制对抗检定，
 *   重罪通常不可贿赂」。能落成引擎判据的是罪的**分档**、**留档**与**惯犯升级**三层；
 *   执法过程与对抗检定的骰面是叙事决定，本模块不替写。
 *
 * 与 enemies.js 的分工：enemies 记「私仇」（血仇/恩怨的黑盒资产），本模块记
 * 「公罪」（城邦对人的通缉），两本账不串：仇可私了，罪走公堂。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 report() 返回 reason:'disabled'，不记账。
 *   2 罪度三档白名单：minor/moderate/major，表外拒收（bad-level）。
 *   3 三要素：人、罪名、地点缺一拒收（missing-fields）——「有人在某地犯了某罪」
 *     没说全就是没发生。
 *   4 通缉不随死亡消除（record survives death）：没有「死亡清账」的入口；撤销必须
 *     显式（pardon），静默过期在本模块不存在。
 *   5 惯犯：同一人 record 数达到阈值（≥3）后 status 自动升为 hunted（盘查升级），
 *     升级是**记账事实**不是惩罚演出。
 *   6 重罪不可贿赂：major 的 pardon 需要显式 giveReason 说明，缺说明拒收（major-gate）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_warrant_settings_v1';
  const DEF = { enabled: false, maxRows: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'warrant', bounds: { maxRows: [4, 32] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const LEVELS = ['minor', 'moderate', 'major'];
  const LEVEL_LABELS = { minor: '轻度', moderate: '中度', major: '重度' };
  const HUNTED_AT = 3;
  const stat = { reports: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().warrant; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  // 「在案」= 未被赦免。active 与 hunted 都还在案上，只有 pardoned 才出账；
  // 否则升级成 hunted 的那一桩会把自己从计数里摘掉（hunted 永远读成 false，
  // 而且赦免时找不到 active 的桩，报 missing）。
  function recordsOf(who) { return rows().filter(function (r) { return r && r.who === who && r.status !== 'pardoned'; }); }
  // 事务内计数：draft 尚未提交，recordsOf() 走 store.get() 只能读到旧快照，
  // 会让"第 N 桩当场升级"永远差一桩。凡是写入路径都必须用 draft 内的行来数。
  function recordsOfDraft(draft, who) {
    const m = draft.warrant;
    const rs = (m && Array.isArray(m.rows)) ? m.rows : [];
    return rs.filter(function (r) { return r && r.who === who && r.status !== 'pardoned'; });
  }
  /**
   * 记一桩罪。who 是犯人，level ∈ LEVELS，charge 是罪名，place 是案发地。
   */
  function report(who, level, charge, place) {
    const w = clean(who, 40), ch = clean(charge, 60), pl = clean(place, 40);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      if (!w || !ch || !pl) { out = { ok: false, reason: 'missing-fields' }; return; }
      if (LEVELS.indexOf(level) < 0) { out = { ok: false, reason: 'bad-level', got: level }; return; }
      draft.warrant = draft.warrant && typeof draft.warrant === 'object' && !Array.isArray(draft.warrant) ? draft.warrant : { rows: [] };
      draft.warrant.rows = Array.isArray(draft.warrant.rows) ? draft.warrant.rows : [];
      const row = { who: w, level: level, charge: ch, place: pl, status: 'active', at: clockNow('warrant') };
      draft.warrant.rows.push(row);
      // 惯犯升级：活跃在案数达到阈值 → 本桩直接标 hunted（升级是记账事实）
      if (recordsOfDraft(draft, w).length >= HUNTED_AT) row.status = 'hunted';
      if (WA.evict) WA.evict.array(draft.warrant.rows, 'warrant.rows');
      out = { ok: true, who: w, level: level, status: row.status, onRecord: recordsOfDraft(draft, w).length };
    }, 'warrant:report');
    if (out && out.ok) { stat.reports++; stat.lastReason = 'reported'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读某人通缉面（给注入与推演方的只读视图）。 */
  function read(who) {
    if (!settings().enabled) return { ok: true, who: who, records: [], reason: 'disabled' };
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const rec = recordsOf(w);
    if (!rec.length) return { ok: true, who: w, records: [], hunted: false, reason: 'clean' };
    return { ok: true, who: w, records: rec.map(function (r) { return { level: r.level, levelLabel: LEVEL_LABELS[r.level], charge: r.charge, place: r.place, status: r.status }; }), hunted: rec.length >= HUNTED_AT, reason: 'applied' };
  }
  /** 显式赦免（对一桩在案的罪）。重罪须给说明；未在案如实报 missing。 */
  function pardon(who, level, giveReason) {
    const w = clean(who, 40), why = clean(giveReason, 80);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      if (!w) { out = { ok: false, reason: 'missing-fields' }; return; }
      if (LEVELS.indexOf(level) < 0) { out = { ok: false, reason: 'bad-level', got: level }; return; }
      if (level === 'major' && !why) { out = { ok: false, reason: 'major-gate' }; return; }
      draft.warrant = draft.warrant && typeof draft.warrant === 'object' && !Array.isArray(draft.warrant) ? draft.warrant : { rows: [] };
      draft.warrant.rows = Array.isArray(draft.warrant.rows) ? draft.warrant.rows : [];
      const hit = draft.warrant.rows.filter(function (r) { return r && r.who === w && r.level === level && r.status !== 'pardoned'; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', who: w }; return; }
      hit.status = 'pardoned'; hit.pardonReason = why || ''; hit.pardonedAt = clockNow('warrant');
      if (WA.evict) WA.evict.array(draft.warrant.rows, 'warrant.rows');
      out = { ok: true, who: w, level: level };
    }, 'warrant:pardon');
    if (out && out.ok) stat.lastReason = 'pardoned'; else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const act = rows().filter(function (r) { return r && (r.status === 'active' || r.status === 'hunted'); });
    if (!act.length) return '';
    const lines = act.map(function (r) {
      return '· ' + r.who + '：' + (LEVEL_LABELS[r.level] || r.level) + '——' + r.charge + '（' + r.place + '）' + (r.status === 'hunted' ? '【惯犯：卫兵主动盘查】' : '');
    });
    return '[通缉]\n' + lines.join('\n') + '\n通缉不随死亡消除：复活留档、换城不清；重罪通常不可贿赂，脱逃须过对抗检定（执法过程由叙事结算，本表只记账）。\n';
  }
  WA.warrant = {
    LEVELS: LEVELS, LEVEL_LABELS: LEVEL_LABELS, HUNTED_AT: HUNTED_AT,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    report: report, pardon: pardon, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();