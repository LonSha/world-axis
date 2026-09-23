/**
 * WorldAxis engines/enigma.js (v2.71.0)
 * 信息暗礁：秘密的知情名单与越界核验。
 *
 * 缝合来源：MoM 蛾摩拉「enigma：以上帝视角识别并记录区分角色之间的『信息差』，
 * 记录秘密。规则：继承历史内容，只记录已发生或者设定内的内容」；十四行诗
 * 「涉及信息差时，先划定在场人物各自不该知道什么」；Phantasm「伏笔管理」中的
 * 信息差纪律。
 *
 * 预设里那是给模型的思考指令；能落成引擎判据的是**边界必须显式登记**：
 * 「谁知道这个秘密」是事实，不靠模型即兴；「谁不该知道」逐场核验（outsiders）。
 *
 * 与 intel.js 的分工：intel 记「某人持有的情报（带来源与置信度）」——正向认知账；
 * 本模块记「秘密的知情名单」——边界账。与 shadow.js 的分工：shadow 记「两人共同
 * 隐瞒的经历」（承诺/背弃向）；本模块不记经历、不产出情绪词，只记知情边界。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时写路径返回 reason:'disabled'，不记账。
 *   2 秘密名与知情者名缺一整次拒收（missing-fields）。
 *   3 同一 (秘密, 知情者) 重复登记拒收（exists）——重复标记会让边界表虚胖。
 *   4 单个秘密的知情名单有上限（maxKnowers），超限拒收（knowers-full），
 *     不静默丢弃最早的知情者（「他不知道了」是叙事决定，不是容量决定）。
 *   5 核验（outsiders）只对**已登记**的秘密作答；未登记报 missing，不猜。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_enigma_settings_v1';
  const DEF = { enabled: false, maxRows: 24, maxKnowers: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'enigma', bounds: { maxRows: [4, 64], maxKnowers: [1, 16] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { marks: 0, unmarks: 0, drops: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().enigma; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function knowersOf(row) { return (row && Array.isArray(row.knowers)) ? row.knowers : []; }
  /** 登记：who 知道 secret（幂等登记 → 重复报 exists）。 */
  function mark(secret, knower) {
    const key = clean(secret, 60), who = clean(knower, 40);
    if (!key || !who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.enigma = draft.enigma && typeof draft.enigma === 'object' && !Array.isArray(draft.enigma) ? draft.enigma : { rows: [] };
      draft.enigma.rows = Array.isArray(draft.enigma.rows) ? draft.enigma.rows : [];
      let row = draft.enigma.rows.filter(function (r) { return r && r.key === key; })[0];
      if (!row) {
        if (draft.enigma.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', key: key }; return; }
        row = { key: key, knowers: [], at: clockNow('enigma') };
        draft.enigma.rows.push(row);
      }
      const list = knowersOf(row);
      if (list.filter(function (k) { return k && k.who === who; })[0]) { out = { ok: false, reason: 'exists', key: key, who: who }; return; }
      if (list.length >= settings().maxKnowers) { out = { ok: false, reason: 'knowers-full', key: key, who: who, cap: settings().maxKnowers }; return; }
      list.push({ who: who, at: clockNow('enigma') });
      row.knowers = list;
      if (WA.evict) WA.evict.array(draft.enigma.rows, 'enigma.rows');
      out = { ok: true, key: key, who: who, count: list.length };
    }, 'enigma:mark');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.marks++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'marked'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 注销：who 从 secret 的知情名单移除（不知情也是叙事决定，须显式）。 */
  function unmark(secret, knower) {
    const key = clean(secret, 60), who = clean(knower, 40);
    if (!key || !who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.enigma = draft.enigma && typeof draft.enigma === 'object' && !Array.isArray(draft.enigma) ? draft.enigma : { rows: [] };
      draft.enigma.rows = Array.isArray(draft.enigma.rows) ? draft.enigma.rows : [];
      const row = draft.enigma.rows.filter(function (r) { return r && r.key === key; })[0];
      if (!row) { out = { ok: false, reason: 'missing', key: key }; return; }
      const list = knowersOf(row);
      const idx = list.map(function (k) { return k && k.who; }).indexOf(who);
      if (idx < 0) { out = { ok: false, reason: 'missing', key: key, who: who }; return; }
      list.splice(idx, 1);
      row.knowers = list;
      out = { ok: true, key: key, who: who, count: list.length };
    }, 'enigma:unmark');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.unmarks++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'unmarked'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 注销整个秘密（秘密不再保密，或叙事上已公开）。 */
  function drop(secret) {
    const key = clean(secret, 60);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.enigma = draft.enigma && typeof draft.enigma === 'object' && !Array.isArray(draft.enigma) ? draft.enigma : { rows: [] };
      draft.enigma.rows = Array.isArray(draft.enigma.rows) ? draft.enigma.rows : [];
      const idx = draft.enigma.rows.map(function (r) { return r && r.key; }).indexOf(key);
      if (idx < 0) { out = { ok: false, reason: 'missing', key: key }; return; }
      draft.enigma.rows.splice(idx, 1);
      out = { ok: true, key: key };
    }, 'enigma:drop');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.drops++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'dropped'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读：某秘密的知情名单。未登记报 missing，不猜。 */
  function read(secret) {
    const key = clean(secret, 60);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = rows().filter(function (r) { return r && r.key === key; })[0];
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', key: key }; }
    return { ok: true, key: key, knowers: knowersOf(row).map(function (k) { return k.who; }), count: knowersOf(row).length };
  }
  /** 核验：给秘密与在场名单，算「谁不该知道」（未列名者不得表现出知情）。 */
  function outsiders(secret, present) {
    const key = clean(secret, 60);
    if (!key) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!Array.isArray(present) || !present.length) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = rows().filter(function (r) { return r && r.key === key; })[0];
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', key: key }; }
    const known = {};
    knowersOf(row).forEach(function (k) { known[k.who] = 1; });
    const out = [], blind = [];
    present.forEach(function (p) {
      const who = clean(p, 40);
      if (!who) return;
      if (known[who]) out.push(who); else blind.push(who);
    });
    return { ok: true, key: key, shouldKnow: out, shouldNotKnow: blind };
  }
  /** 注入块：保密矩阵 + 边界铁律。总开关关闭或无登记时返回空串（零 token）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      const ks = knowersOf(r).map(function (k) { return k.who; });
      return '· 「' + r.key + '」知情者：' + (ks.length ? ks.join('、') : '（无——秘密仅在旁白层存在）');
    });
    return '[信息暗礁]\n' + lines.join('\n') + '\n边界铁律：未列名者不得表现出知情；知情者不得在未列名者面前直述该秘密（暗示与误会须由叙述视点自己承担）。\n';
  }
  WA.enigma = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    mark: mark, unmark: unmark, drop: drop, read: read, outsiders: outsiders, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();