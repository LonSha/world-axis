/**
 * WorldAxis engines/gauge.js (v2.229.0)
 * 阻尼量规：0..100 推进度 × 单步阻尼限幅 × 四大里程碑事件。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_gauge_settings_v1';
  const DEF = { enabled: false, maxRows: 16, maxStep: 35 };
  const __REG = { key: LS_KEY, def: DEF, module: 'gauge', bounds: { maxRows: [4, 32], maxStep: [5, 100] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const MILESTONES = [25, 50, 75, 100];
  const DEFAULT_MAX_STEP = 35;

  /**
   * v2.229.0（拓展 N11）：**判定档位占比制**（缝合来源：choice v1.9.0）。
   *
   * ── 它治什么（缺口原句）────────────────────────────────────────
   *   本模块只有**固定断点**（MILESTONES = 25/50/75/100 的绝对值）：进度 30% 就是 30%，
   *   与「这一轮的目标是攒够 40 还是攒够 4000」无关。于是同一个 30 在两种目标下被读成
   *   同一档，而现场要的是「**已达成占需要的几成**」这一比值（20/40/60/80 四断）。
   *
   * ── 口径 ───────────────────────────────────────────────────────
   *   · BAND_BREAKS = [20, 40, 60, 80]（**占比**，不是绝对值）⇒ 五档 0..4（4 = ≥80%）；
   *   · 断点**含等号**（恰 20% 落第 1 档）——与 step() 里 MILESTONES 的
   *     `hit.val < ms && nextVal >= ms` 同口径：两处断点的开闭不许各写一套。
   *
   * ── 三条否定式边界 ─────────────────────────────────────────────
   *   ① need 非正数 / 非有限 ⇒ bad-need，**不猜分母**（拿 0 当分母会恒得 Infinity 档）；
   *   ② diff 非有限 ⇒ bad-diff（负值合法：欠账也是读数，如实落第 0 档）；
   *   ③ 零写侧：不建量表、不改 val、不写 store —— 它是**读数**不是推进。
   */
  const BAND_BREAKS = [20, 40, 60, 80];
  function bandOf(diff, need) {
    const d = Number(diff), n = Number(need);
    if (!isFinite(d)) return { ok: false, reason: 'bad-diff', got: diff };
    if (!isFinite(n) || n <= 0) return { ok: false, reason: 'bad-need', got: need };
    const ratio = d / n, pct = ratio * 100;
    let band = 0;
    for (let i = 0; i < BAND_BREAKS.length; i++) { if (pct >= BAND_BREAKS[i]) band = i + 1; }
    return { ok: true, diff: d, need: n, ratio: Math.round(ratio * 1000) / 1000,
      percent: Math.round(pct * 10) / 10, band: band, bands: BAND_BREAKS.length + 1,
      breaks: BAND_BREAKS.slice(), met: ratio >= 1 };
  }

  function rows() {
    const s = (WA.store && WA.store.get()) || {};
    return (s.gauge && s.gauge.rows) || [];
  }

  function create(key, opts) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    // v2.79.0（第十三面续 · 输入边界）：纯空白键不是键。此前 `!key` 对 '   ' 为假 →
    //   建出一张**无名量表**（面板上是一行空标题，且此后无法按名找到它去删除）。
    if (typeof key !== 'string' || !key.trim()) return { ok: false, reason: 'missing-fields' };
    const o = opts || {};
    const initVal = (typeof o.initial === 'number' && isFinite(o.initial)) ? Math.max(0, Math.min(100, o.initial)) : 0;
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.gauge) draft.gauge = { rows: [] };
      const list = draft.gauge.rows || [];
      const existing = list.filter(function (r) { return r && r.key === key; })[0];
      if (existing && !o.force) {
        out = { ok: false, reason: 'exists', key: key };
        return false;
      }
      const record = {
        key: key,
        val: initVal,
        desc: o.desc || key,
        history: [{ at: clockNow('gauge'), from: 0, to: initVal, ev: 'init' }]
      };
      if (existing) Object.assign(existing, record);
      else list.push(record);
      if (WA.evict) WA.evict.array(list, 'gauge.rows');
      out = { ok: true, key: key, val: initVal };
    }, 'gauge.create');
    return out;
  }

  function step(key, delta, event) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    if (!key) return { ok: false, reason: 'missing-fields' };
    if (typeof delta !== 'number') return { ok: false, reason: 'missing-fields' };
    // v2.78.0: NaN / ±Infinity 也属于「不是合法步长」——与 missing-fields 分开，两个根因在诊断面可分。
    //   修前：typeof NaN === 'number' 恒真 ⇒ 缺 delta 与 NaN 合并，且 NaN 直接落盘（history.to=NaN），
    //   buildBlock 把它当百分数注进 prompt（实测 `· g（g）: NaN%`）——注入面与 JSON 面互相矛盾。
    if (!isFinite(delta)) return { ok: false, reason: 'bad-delta', got: delta };
    const lim = (settings().maxStep > 0) ? settings().maxStep : DEFAULT_MAX_STEP;
    if (Math.abs(delta) > lim) return { ok: false, reason: 'step-too-large', delta: delta, limit: lim };

    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.gauge) draft.gauge = { rows: [] };
      const list = draft.gauge.rows || [];
      const hit = list.filter(function (r) { return r && r.key === key; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', key: key }; return false; }
      if (hit.val >= 100 && delta > 0) { out = { ok: false, reason: 'top', key: key, val: hit.val }; return false; }

      const nextVal = Math.max(0, Math.min(100, hit.val + delta));
      let crossedMilestone = null;
      for (let i = 0; i < MILESTONES.length; i++) {
        const ms = MILESTONES[i];
        if (hit.val < ms && nextVal >= ms) {
          crossedMilestone = ms;
          break;
        }
      }

      if (crossedMilestone !== null && (!event || typeof event !== 'string')) {
        out = { ok: false, reason: 'missing-event', key: key, milestone: crossedMilestone };
        return false;
      }

      const prev = hit.val;
      hit.val = nextVal;
      if (!Array.isArray(hit.history)) hit.history = [];
      hit.history.push({ at: clockNow('gauge'), from: prev, to: nextVal, ev: event || 'step' });
      if (WA.evict) WA.evict.array(hit.history, 'gauge.history');
      out = { ok: true, key: key, from: prev, to: nextVal, crossed: crossedMilestone };
    }, 'gauge.step');
    return out;
  }

  function read(key) {
    if (!key) return { ok: false, reason: 'missing-fields' };
    const hit = rows().filter(function (r) { return r && r.key === key; })[0];
    if (!hit) return { ok: false, reason: 'missing', key: key };
    return { ok: true, key: hit.key, val: hit.val, desc: hit.desc, historyCount: (hit.history || []).length };
  }

  function buildBlock() {
    if (!settings().enabled) return '';
    const list = rows().filter(function (r) { return r && r.key; });
    if (!list.length) return '';
    const lines = ['[阻尼量规] 进度与高潮发展阻尼器：'];
    list.forEach(function (r) {
      lines.push('· ' + r.key + '（' + r.desc + '）: ' + r.val + '% [阻尼限制: 单步<=' + (settings().maxStep || DEFAULT_MAX_STEP) + '%]');
    });
    return lines.join('\n');
  }

  WA.gauge = {
    MILESTONES: MILESTONES,
    // v2.229.0（拓展 N11）：占比断点与档位读数（与 MILESTONES 同规：常量面随函数一起出）。
    BAND_BREAKS: BAND_BREAKS.slice(),

    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    create: create,
    step: step,
    read: read,
    buildBlock: buildBlock,
    // v2.229.0（拓展 N11）：占比档位读数。真消费方：ui/panel.js 量规段与 tool-diag 诊断节。
    bandOf: bandOf
  };
})();
