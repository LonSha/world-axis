/**
 * WorldAxis engines/masks.js (v2.66.0)
 * 假面：对外口径与露馅动作同时在场且不一致，假面才算成立。
 *
 * 缝合来源：4.4「情绪通道」的硬关闭思路 + 《日月西》「人物立体」律
 * （人物可以对外演一个自己不是的人，但演出来的每一条都要有露馅的证据链）。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 read() 返回 reason:'disabled'，不猜假面。
 *   2 口径与露馅必须**同时在场**。缺任一边整次拒收（missing-fields），不留半张假面。
 *   3 二者必须**不一致**。一致就不是假面（identical），拒收——「他嘴上不在乎，
 *     行为也不在乎」是性格，不是伪装。
 *   4 假面不是谎账：露馅动作照常进正文触面，本表只记结构，不替事件账背书。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_masks_settings_v1';
  const DEF = { enabled: false, maxRows: 10 };
  const __REG = { key: LS_KEY, def: DEF, module: 'masks', bounds: { maxRows: [2, 20] } };
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
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().masks; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  /**
   * 登记一张假面。口径与露馅缺一或相同都整次拒收，不改已有行。
   */
  function setMask(person, mask) {
    const who = clean(person, 40);
    const p = mask || {};
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const face = clean(p.face, 60), tell = clean(p.tell, 60);
    if (!face || !tell) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (face === tell) { noteFault('identical'); return { ok: false, reason: 'identical', person: who }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.masks = draft.masks && typeof draft.masks === 'object' && !Array.isArray(draft.masks) ? draft.masks : { rows: [] };
      draft.masks.rows = Array.isArray(draft.masks.rows) ? draft.masks.rows : [];
      const hit = draft.masks.rows.filter(function (r) { return r && r.person === who; })[0];
      const at = clockNow('masks');
      if (hit) { hit.face = face; hit.tell = tell; hit.at = at; out = { ok: true, person: who, existed: true }; return; }
      draft.masks.rows.push({ person: who, face: face, tell: tell, at: at });
      if (WA.evict) WA.evict.array(draft.masks.rows, 'masks.rows');
      out = { ok: true, person: who, existed: false };
    }, 'masks:set');
    if (out && out.ok) { stat.sets++; stat.lastReason = out.existed ? 'updated' : 'set'; } else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 撤一张假面：假面被揭穿后必须显式撤销，不留静默生效的旧口径。 */
  function dropMask(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.masks || !Array.isArray(draft.masks.rows)) return;
      const before = draft.masks.rows.length;
      draft.masks.rows = draft.masks.rows.filter(function (r) { return r && r.person !== who; });
      if (draft.masks.rows.length === before) { out = { ok: false, reason: 'missing', person: who }; return false; }
      out = { ok: true, person: who };
    }, 'masks:drop');
    if (out && out.ok) { stat.sets++; stat.lastReason = 'dropped'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读一张假面。关闭/未登记都如实报。 */
  function read(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, person: who, face: '', tell: '', reason: 'disabled' };
    const hit = rows().filter(function (r) { return r && r.person === who; })[0];
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', person: who }; }
    return { ok: true, person: who, face: hit.face, tell: hit.tell, reason: 'applied' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) { return r.person + '：口径「' + r.face + '」≠ 露馅「' + r.tell + '」'; });
    return '[假面]\n' + lines.join('\n') + '\n口径是演给人看的，露馅是藏不住的；二者同时在场且不一致，假面才成立。\n';
  }
  WA.masks = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    setMask: setMask, dropMask: dropMask, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();