/**
 * WorldAxis engines/lost-and-found.js (v2.416.0) — EXV24-6 失物招领
 *
 * ── 物品丢了会怎样？此前全仓 0 命中。物品可由 gear/personal-inventory 声明存在，
 *   但丢了之后：有人捡到上交、有人私吞、失主认领要说出物证 —— 这一层没有。
 *
 * ── 机制 ── `reportLoss` 报失 → `logFound` 拾获（上交/私吞两途，私吞入账但留痕）
 *   → `claim` 认领（须说出物证，说不出不还）。
 *
 * ── 边界 ── ① 不碰 store。② 认领凭据是硬门禁：物证（distinguisher）为空一律拒收
 *   `missing-distinguisher` —— 说不出物证的不还，交给叙事去演冒领冲突。③ 条数有界。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_lost_found_settings_v1';
  const DEF = { enabled: true, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'lostFound', bounds: { maxRows: [8, 96] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { reported: 0, found: 0, claimed: 0, pocketed: 0, refused: 0, lastReason: '' };
  const ITEMS = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function reportLoss(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), what = str(s.what), where = str(s.where);
    if (!who || !what) { stat.refused++; stat.lastReason = 'missing-party'; return { ok: false, hint: 'missing-party：谁丢了什么，两样说清' }; }
    if (ITEMS.length >= cfg.maxRows) ITEMS.shift();
    const id = 'lf' + (++stat.reported);
    ITEMS.push({ id: id, who: who, what: what, where: where, lostAt: s.at || null, status: 'lost',
      finder: null, disposition: null, claimants: [] });
    return { ok: true, id: id };
  }
  function logFound(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = ITEMS.find(function (r) { return r.id === str(id) && r.status === 'lost'; });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-item'; return { ok: false, hint: 'unknown-item：没有这条在途失物' }; }
    const finder = str(s.finder), disposition = str(s.disposition);
    if (!finder) { stat.refused++; stat.lastReason = 'missing-finder'; return { ok: false, hint: 'missing-finder：谁捡到的？' }; }
    if (['surrender', 'pocketed'].indexOf(disposition) < 0) { stat.refused++; stat.lastReason = 'unknown-disposition'; return { ok: false, hint: 'unknown-disposition：上交(surrender)还是私吞(pocketed)？两途都要留痕' }; }
    rec.finder = finder; rec.disposition = disposition; rec.status = 'found';
    if (disposition === 'pocketed') { stat.pocketed++; rec.status = 'closed-pocketed'; }
    else stat.found++;
    return { ok: true, id: rec.id, status: rec.status, toClaim: rec.status === 'found' };
  }
  function claim(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = ITEMS.find(function (r) { return r.id === str(id) && r.status === 'found'; });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-item'; return { ok: false, hint: 'unknown-item：没有可认领的失物（或已被认领/私吞）' }; }
    const by = str(s.by), proof = str(s.distinguisher);
    if (!by) { stat.refused++; stat.lastReason = 'missing-by'; return { ok: false, hint: 'missing-by：谁在认领？' }; }
    if (!proof) { stat.refused++; stat.lastReason = 'missing-distinguisher'; return { ok: false, hint: 'missing-distinguisher：说出物证才还 —— 东西上有什么只有失主知道的特征？' }; }
    rec.claimants.push({ by: by, proof: proof, at: s.at || null, ok: rec.who === by });
    if (rec.who !== by) return { ok: false, reason: 'claim-rejected', hint: 'claim-rejected：登记的失主是 ' + rec.who + '，' + by + ' 说不通（凭据已留痕，交给叙事）' };
    rec.status = 'claimed';
    stat.claimed++;
    return { ok: true, id: rec.id, by: by };
  }
  function view(id) {
    if (id) { const rec = ITEMS.find(function (r) { return r.id === str(id); }); return rec ? { ok: true, row: JSON.parse(JSON.stringify(rec)) } : { ok: false, hint: 'unknown-item' }; }
    return { ok: true, count: ITEMS.length, rows: JSON.parse(JSON.stringify(ITEMS)) };
  }
  function statView() { return Object.assign({ open: ITEMS.filter(function (r) { return r.status === 'lost' || r.status === 'found'; }).length, pocketed: stat.pocketed }, stat); }
  function reset() { ITEMS.length = 0; stat.reported = 0; stat.found = 0; stat.claimed = 0; stat.pocketed = 0; stat.refused = 0; stat.lastReason = ''; return { ok: true }; }
  WA.lostFound = {
    reportLoss: reportLoss, logFound: logFound, claim: claim, view: view, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/lost-and-found.js', { kind: 'engine', ver: '2.416.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/lost-and-found 已加载（2.416.0）');
})();