/**
 * WorldAxis engines/fondness.js (v2.67.0)
 * 好感审计：步进白名单 + 好感不降准则 + 上限 + 区间语义。
 *
 * 缝合来源：《❖ 好感度模块 [1093]》情感材质审计协议——原文的欧式笔记风格是渲染面
 * （留在预设层），能落成引擎判据的是四条数值纪律：
 *   步进白名单 [0.1, 0.3, 0.5, 0.8]（Rule 4：单次步进限制在 [+0.1,+0.3,+0.5,+0.8]）；
 *   好感不降准则（Rule 8：激烈冲突走信任度对冲，不扣好感）；
 *   上限 100（Rule 6）；五段区间语义（Rule 9）。
 *
 * 与 bonds.js / shadow.js 的分工：bonds 记关系**结构**（六型），shadow 记关系**经历**
 * （承诺履行/背弃），本模块记关系的**温度读数**——三者正交。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 apply() 返回 reason:'disabled'，不结算。
 *   2 负步进整次拒收（non-positive-delta）：好感不降准则不是「扣得少」，是**没有负入口**。
 *     冲突走 trust 对冲（delta 为负时报错并提示改走 trust 字段）。
 *   3 不在白名单的步进拒收（off-step）：+0.2、+0.4、+0.6 都不合法，白名单就是白名单。
 *   4 超上限拒收（over-cap）：总值 100 封顶，超出不截断到 100，整次拒收。
 *   5 trust 只收 0..100 整数，越界拒收（bad-trust）。
 *   6 未登记行首次 apply 自动建行（起始 0 起算），但 trust 必须显式给（不猜默契）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_fondness_settings_v1';
  const DEF = { enabled: false, maxRows: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'fondness', bounds: { maxRows: [2, 32] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const STEPS = [0.1, 0.3, 0.5, 0.8];
  const CAP = 100;
  const BANDS = [
    { lo: 0, hi: 20, name: '无感' }, { lo: 20, hi: 40, name: '防御' },
    { lo: 40, hi: 60, name: '中性' }, { lo: 60, hi: 80, name: '亲近' },
    { lo: 80, hi: 100, name: '绑定' }
  ];
  const stat = { applies: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().fondness; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function bandOf(v) { return BANDS.filter(function (b) { return v >= b.lo && v < b.hi; })[0] || BANDS[4]; }
  /**
   * 结算一次好感步进。opts: { delta, trust, note }
   * delta 必须在步进白名单内且为正；trust 可选（显式给才更新，0..100 整数）。
   */
  function apply(person, opts) {
    const who = clean(person, 40);
    const p = opts || {};
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const delta = p.delta;
    if (typeof delta !== 'number' || !isFinite(delta)) { noteFault('bad-delta'); return { ok: false, reason: 'bad-delta' }; }
    if (delta <= 0) {
      noteFault('non-positive-delta');
      return { ok: false, reason: 'non-positive-delta', hint: '好感不降：冲突走 trust 对冲' };
    }
    if (STEPS.indexOf(delta) < 0) { noteFault('off-step'); return { ok: false, reason: 'off-step', allowed: STEPS.slice() }; }
    const trust = p.trust;
    if (trust != null && (typeof trust !== 'number' || !isFinite(trust) || trust < 0 || trust > 100 || (trust | 0) !== trust)) {
      noteFault('bad-trust'); return { ok: false, reason: 'bad-trust' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      draft.fondness = draft.fondness && typeof draft.fondness === 'object' && !Array.isArray(draft.fondness) ? draft.fondness : { rows: [] };
      draft.fondness.rows = Array.isArray(draft.fondness.rows) ? draft.fondness.rows : [];
      let hit = draft.fondness.rows.filter(function (r) { return r && r.person === who; })[0];
      if (!hit) { hit = { person: who, value: 0, trust: null, note: '', at: 0 }; draft.fondness.rows.push(hit); }
      const next = +(hit.value + delta).toFixed(1);
      if (next > CAP) { out = { ok: false, reason: 'over-cap', value: hit.value }; return; }
      hit.value = next;
      if (trust != null) hit.trust = trust;
      if (p.note) hit.note = clean(p.note, 80);
      hit.at = clockNow('fondness');
      if (WA.evict) WA.evict.array(draft.fondness.rows, 'fondness.rows');
      out = { ok: true, person: who, value: hit.value, trust: hit.trust, band: bandOf(hit.value).name };
    }, 'fondness:apply');
    if (out && out.ok) { stat.applies++; stat.lastReason = 'applied'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读一个人当前读数与区间名。未登记如实报 missing。 */
  function read(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, person: who, value: 0, band: '', reason: 'disabled' };
    const hit = rows().filter(function (r) { return r && r.person === who; })[0];
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', person: who }; }
    return { ok: true, person: who, value: hit.value, trust: hit.trust, band: bandOf(hit.value).name, note: hit.note || '' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      return r.person + '：好感 ' + r.value + '/100（' + bandOf(r.value).name + '）｜信任 ' + (r.trust == null ? '未登记' : r.trust) + (r.note ? '｜' + r.note : '');
    });
    return '[好感审计]\n' + lines.join('\n') + '\n好感不降：冲突走信任对冲，不扣好感；步进只认 ' + STEPS.map(function (s) { return '+' + s; }).join('/') + '。\n';
  }
  WA.fondness = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    apply: apply, read: read, buildBlock: buildBlock, STEPS: STEPS.slice(), BANDS: BANDS.map(function (b) { return Object.assign({}, b); }),
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();