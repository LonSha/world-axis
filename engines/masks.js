/**
 * WorldAxis engines/masks.js (v2.66.0)
 * 假面：对外口径与露馅动作同时在场且不一致，假面才算成立。
 *
 * 缝合来源：4.4「情绪通道」的硬关闭思路 + 《日月西》「人物立体」律
 * （人物可以对外演一个自己不是的人，但演出来的每一条都要有露馅的证据链）。
 *
 * 边界（全是否定式）：
 *   1 总开关默认开启。关闭时 read() 返回 reason:'disabled'，不猜假面。
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
  const DEF = { enabled: true, maxRows: 10 };
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
  // v2.581.0：注入名额统一形态（「同形态尾部截断」簇二，与 v2.580.0 的三引擎同一口径）。
  //   旧法 `X.slice(-maxRows)` 三病俱在：取**登记尾部**（≈登记顺序，不是新旧）、
  //   `maxRows` 坏值时 `slice(NaN)`=`slice(0)` **整环全念**（与上限正好相反）、念了几条一个字不说。
  const ROWS_QUOTA_MAX = 20;
  function quotaOf(cfg, key, max, fallback) {
    const n = Math.floor(Number(cfg && cfg[key]));
    if (!isFinite(n) || n < 1) return Math.min(max, fallback);
    return Math.min(max, Math.max(1, n));
  }
  /** 取哪几条：按时间（updatedAt，缺则 at）新→旧，同刻按 who/key/id 兜底 —— 可复算。 */
  function pickRows(list, quota, atOf, idOf) {
    const arr = (Array.isArray(list) ? list : []).filter(function (x) { return !!x; }).slice();
    arr.sort(function (a, b) {
      const at = Number(atOf(a)) || 0, bt = Number(atOf(b)) || 0;
      if (at !== bt) return bt - at;
      const ai = String(idOf(a) || ''), bi = String(idOf(b) || '');
      return ai < bi ? -1 : (ai > bi ? 1 : 0);
    });
    return { candidates: arr.length, picked: arr.slice(0, quota),
      hidden: Math.max(0, arr.length - quota), mode: arr.length > quota ? 'newest-first' : 'all-fit' };
  }
  /** 名额取用（名额只截断、不参与筛选；坏配置回落 DEF，绝不放大成「全念」）。 */
  function pickQuota(arr, cfg) {
    const q = quotaOf(cfg, 'maxRows', ROWS_QUOTA_MAX, DEF.maxRows);
    const sel = pickRows(arr, q, function (x) { return x && (x.updatedAt || x.at); },
      function (x) { return x && (x.who || x.key || x.id || x.name || ''); });
    stat.block = { candidates: sel.candidates, picked: sel.picked.length, quota: q,
      hidden: sel.hidden, mode: sel.candidates ? sel.mode : 'empty' };
    return sel.picked;
  }
  // block 用**取值器**持有：stat() 里那些 `Object.assign({}, stat)` 会当场取到一份深拷，
  //   调用方改一次读数就改掉引擎读数的老坑（v2.576 org / v2.579 world-bridge）在这里一次性堵掉。
  let __block = null;
  Object.defineProperty(stat, 'block', {
    enumerable: true, configurable: true,
    get: function () { return __block ? JSON.parse(JSON.stringify(__block)) : null; },
    set: function (v) { __block = v || null; }
  });
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
    const list = pickQuota(rows(), cfg);
    if (!list.length) { stat.block = { candidates: 0, picked: 0, quota: quotaOf(cfg, 'maxRows', ROWS_QUOTA_MAX, DEF.maxRows), hidden: 0, mode: 'empty' }; return ''; }
    const lines = list.map(function (r) { return r.person + '：口径「' + r.face + '」≠ 露馅「' + r.tell + '」'; });
    return '[假面]\n' + lines.join('\n') + '\n口径是演给人看的，露馅是藏不住的；二者同时在场且不一致，假面才成立。\n';
  }
  // v2.581.0 块尾名额自证：不动原正文拼接，只在末尾追加一行清单计数（名额够就说「全部列出」）。
  buildBlock = (function (inner) {
    return function () {
      const out = inner();
      const b = stat.block;
      if (!out || !b) return out;
      const NL = String.fromCharCode(10);
      return out + NL + '（本面名额：面具 ' + b.picked + '/' + b.candidates
        + (b.hidden > 0 ? ' 条，按时间新→旧取；另有 ' + b.hidden + ' 条未列出，仍在账上，不是没有'
          : ' 条，全部列出') + '）';
    };
  })(buildBlock);

  WA.masks = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    setMask: setMask, dropMask: dropMask, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();