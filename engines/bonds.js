/**
 * WorldAxis engines/bonds.js (v2.66.0)
 * 关系六型：替身 / 寄生拯救 / 主权让渡 / 利益同盟 / 平行共存 / 对手共生。
 *
 * 缝合来源：4.4「RelationshipAnchor」。预设里那是一段给模型的人设锚；
 * 本模块只取它的结算含义：一段关系可以被**归类**成哪几型，且归类必须显式登记，
 * 不能靠模型现场即兴。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 read() 返回 reason:'disabled'，不猜关系型。
 *   2 六型之外不收。类型表外的任何值整次拒收（bad-type），不「宽容降级」。
 *   3 两人必须不同。自己对自己的关系型是空话（same-person），拒收。
 *   4 与 enemies 的血仇/恩怨**正交**：本表不读写 evolution.enemies，
 *     两账并行、互不覆盖——血仇是事件账（做过什么），六型是结构账（是什么关系）。
 *   5 不产出情绪词，也不产出行为指令；buildBlock 只陈述结构。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_bonds_settings_v1';
  const DEF = { enabled: false, maxRows: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'bonds', bounds: { maxRows: [4, 24] } };
  const TYPES = ['替身', '寄生拯救', '主权让渡', '利益同盟', '平行共存', '对手共生'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { sets: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const b = state().bonds; return (b && Array.isArray(b.rows)) ? b.rows : []; }
  /** 配对键：两人按字典序固定，A×B 与 B×A 是同一行（更新而非重复登记）。 */
  function pairKey(a, b) { return [a, b].sort().join('×'); }
  /**
   * 登记一段关系的六型（可多选，至少一型）。
   * 非法类型整次拒收，不改已有行。
   */
  function setBond(a, b, types) {
    const x = clean(a, 40), y = clean(b, 40);
    if (!x || !y) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (x === y) { noteFault('same-person'); return { ok: false, reason: 'same-person', person: x }; }
    const list = (Array.isArray(types) ? types : []).map(function (t) { return clean(t, 12); }).filter(Boolean);
    if (!list.length) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const bad = list.filter(function (t) { return TYPES.indexOf(t) < 0; });
    if (bad.length) { noteFault('bad-type'); return { ok: false, reason: 'bad-type', types: bad }; }
    const uniq = []; const seen = {};
    list.forEach(function (t) { if (!seen[t]) { seen[t] = 1; uniq.push(t); } });
    const key = pairKey(x, y);
    let out = null;
    WA.store.transact(function (draft) {
      draft.bonds = draft.bonds && typeof draft.bonds === 'object' && !Array.isArray(draft.bonds) ? draft.bonds : { rows: [] };
      draft.bonds.rows = Array.isArray(draft.bonds.rows) ? draft.bonds.rows : [];
      const hit = draft.bonds.rows.filter(function (r) { return r && r.key === key; })[0];
      const at = clockNow('bonds');
      if (hit) { hit.types = uniq; hit.at = at; out = { ok: true, pair: key, types: uniq, existed: true }; return; }
      draft.bonds.rows.push({ key: key, a: key.split('×')[0], b: key.split('×')[1], types: uniq, at: at });
      if (WA.evict) WA.evict.array(draft.bonds.rows, 'bonds.rows');
      out = { ok: true, pair: key, types: uniq, existed: false };
    }, 'bonds:set');
    if (out && out.ok) { stat.sets++; stat.lastReason = out.existed ? 'updated' : 'set'; } else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读一段关系已登记的型。关闭/未登记都如实报，不猜。 */
  function read(a, b) {
    const x = clean(a, 40), y = clean(b, 40);
    if (!x || !y) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, pair: pairKey(x, y), types: [], reason: 'disabled' };
    const key = pairKey(x, y);
    const hit = rows().filter(function (r) { return r && r.key === key; })[0];
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', pair: key }; }
    return { ok: true, pair: key, types: hit.types.slice(), reason: 'applied' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) { return r.key + '：' + r.types.join('、'); });
    return '[关系六型]\n' + lines.join('\n') + '\n六型是关系结构，与恩怨血仇分账并行；血仇记「做过什么」，这里记「是什么关系」，两账互不覆盖。\n';
  }
  WA.bonds = {
    TYPES: TYPES.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    setBond: setBond, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
