/**
 * WorldAxis engines/festival-fair.js (v2.523.0) — EXV27-7 灯会庙市与纸扎
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「灯会 / 庙会 / 纸扎」在 `engines/` **0 命中**。节令有日历、香火有 pilgrim-flow、
 *   祭仪有 anniversary-rites，但**灯棚与庙市**这一层没有：谁摆的摊、几盏灯、
 *   客流多少、灯棚起火的风险有多大、纸扎祭品卖不卖得掉 —— 一处都没有。
 *
 * ── 机制 ── `openStall` 开铺（摊主 / 货 / 灯数 / 会别）→ `crowd` 客流（会别 + 人数
 *   → 每摊分到多少人）→ `closeStall` 收摊结账（并如实报灯棚火险档）。
 *
 * ── 边界 ── ① 不碰 store。② **不掷骰**：客流与人头都是调用方给的真数；
 *   火险只按灯数分档报出，**不代替 fire-watch 判「会不会烧」**（那要有人声明起火）。
 *   ③ 纸扎只做祭品销路，不做丧仪（丧仪在 mortuary-rites）。④ 拒收码只用 `disabled`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_festival_fair_settings_v1';
  const DEF = { enabled: true, maxRows: 32, highRiskLanterns: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'festivalFair', bounds: { maxRows: [8, 96], highRiskLanterns: [2, 40] } };
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
  const stat = { stalls: 0, fairs: 0, crowdTotal: 0, closed: 0, sold: 0, refused: 0, evicted: 0, lastReason: '' };
  const STALLS = [];
  const FAIR = { lantern: 0, temple: 0 };
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function riskOf(lanterns) {
    const cfg = settings();
    if (lanterns >= cfg.highRiskLanterns) return 'high';
    if (lanterns >= 3) return 'moderate';
    return 'low';
  }
  function openStall(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const owner = str(s.owner), goods = str(s.goods), fair = str(s.fair);
    const lanterns = s.lanterns == null ? 0 : num(s.lanterns);
    if (!owner || !goods) return refuse('missing-party', 'missing-party：谁摆的摊、卖的什么？');
    if (['lantern', 'temple'].indexOf(fair) < 0) return refuse('unknown-fair',
      'unknown-fair：灯会(lantern) 还是 庙会(temple)？会别决定客流');
    if (!(lanterns >= 0)) return refuse('bad-lanterns', 'bad-lanterns：几盏灯（不挂灯就给 0）');
    if (STALLS.length >= cfg.maxRows) { STALLS.shift(); stat.evicted++; }
    const id = 'ff' + (++stat.stalls);
    STALLS.push({ id: id, owner: owner, goods: goods, fair: fair, lanterns: lanterns,
      fireRisk: riskOf(lanterns), traffic: 0, sold: null, status: 'open', at: s.at || null });
    return { ok: true, id: id, fireRisk: riskOf(lanterns),
      hint: riskOf(lanterns) === 'high' ? 'high-fire-risk：' + lanterns + ' 盏灯堆在一处 —— 灯棚是这一带最容易走水的地方' : null };
  }
  function crowd(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const fair = str(s.fair), people = num(s.people);
    if (['lantern', 'temple'].indexOf(fair) < 0) return refuse('unknown-fair', 'unknown-fair：灯会(lantern) 还是 庙会(temple)？');
    if (!(people >= 0)) return refuse('missing-people', 'missing-people：来了多少人？');
    const open = STALLS.filter(function (r) { return r.fair === fair && r.status === 'open'; });
    FAIR[fair] = people;
    stat.fairs++;
    stat.crowdTotal += people;
    const per = open.length ? Math.floor(people / open.length) : 0;
    for (let i = 0; i < open.length; i++) open[i].traffic = per;
    return { ok: true, fair: fair, people: people, stalls: open.length, perStall: per,
      hint: open.length === 0 ? 'no-stall：这会还没人摆摊，客流白来了' : null };
  }
  function closeStall(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = STALLS.find(function (r) { return r.id === str(s.id) && r.status === 'open'; });
    if (!rec) return refuse('unknown-stall', 'unknown-stall：没有这个在摆的摊（或已收摊）');
    const sold = num(s.sold);
    if (!(sold >= 0)) return refuse('missing-sold', 'missing-sold：卖出多少？收摊要落数');
    rec.sold = sold; rec.status = 'closed';
    stat.closed++; stat.sold += sold;
    return { ok: true, id: rec.id, sold: sold, lane: rec.traffic,
      hint: rec.traffic > 0 && sold === 0 ? 'no-sale：分了 ' + rec.traffic + ' 人过来却一件没卖 —— 这货不对路' : null };
  }
  function view() {
    return { ok: true, stalls: STALLS.length, open: STALLS.filter(function (r) { return r.status === 'open'; }).length,
      rows: JSON.parse(JSON.stringify(STALLS)), fair: Object.assign({}, FAIR) };
  }
  function statView() { return Object.assign({}, stat); }
  function reset() {
    STALLS.length = 0; FAIR.lantern = 0; FAIR.temple = 0;
    stat.stalls = 0; stat.fairs = 0; stat.crowdTotal = 0; stat.closed = 0; stat.sold = 0;
    stat.refused = 0; stat.evicted = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.festivalFair = {
    openStall: openStall, crowd: crowd, closeStall: closeStall,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/festival-fair.js', { kind: 'engine', ver: '2.523.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/festival-fair 已加载（2.523.0）');
})();