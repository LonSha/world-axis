/**
 * WorldAxis engines/model-pin.js (v2.517.0) — OPV26-3 模型钉版与降智守卫
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   modelReceipt 只**如实记账**（漂移记为 drift:true 就完了）。但「这一笔该用
 *   A 模型，回执却是 B」这件事需要一个**声明的期望值**才有判据面——
 *   没有钉版，漂移只是一条记录，不是一次违约。
 *   实测：全仓 grep 'pinnedModel|modelPin|expectModel' = 0 命中。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `pin({channel, model})` 声明「这个渠道**必须**由哪个模型服务」→
 *   `check({channel, respModel})` 单笔比对 → `audit()` 拿 modelReceipt 的
 *   最近回执逐渠道对账（**跨引擎真消费**：本模块读 WA.modelReceipt，不自己记账）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **未钉版的渠道不判**：没声明期望就不存在违约（不制造假红）。
 *   ② 回执 model 缺席（兼容端不回）⇒ 判 `comparable:false`，不算匹配也不算违约
 *      —— 拿不到凭据就只能承认拿不到。
 *   ③ 只读不写业务状态：本模块不调模型、不改渠道配置（改配置仍是 apiRouter.setChannel）。
 *   ④ 拒收码只用 disabled / missing-channel / missing-model / model-drift。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_model_pin_settings_v1';
  const DEF = { enabled: true, pins: [] };   // pins: [{channel, model, at}]
  const __REG = { key: LS_KEY, def: DEF, module: 'modelPin', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { pins: 0, unpins: 0, checks: 0, matches: 0, drifts: 0, incomparable: 0, refused: 0, lastReason: '' };
  let MIRROR = null;   // 无 settingsBus 时的内存回退（与 shadow 同档）
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function pinList() {
    if (MIRROR) return MIRROR.slice();
    const cfg = settings();
    return Array.isArray(cfg.pins) ? cfg.pins.slice() : [];
  }
  function writePins(list) {
    if (!WA.settingsBus) { MIRROR = list.slice(); return { ok: true }; }
    return saveSettings({ pins: list });
  }
  function pinnedOf(channel) {
    const list = pinList();
    for (let i = 0; i < list.length; i++) if (str(list[i] && list[i].channel) === channel) return list[i];
    return null;
  }
  /** 钉版：声明某渠道的期望模型（upsert，同渠道只留一条）。 */
  function pin(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel);
    const model = str(s.model);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel';
      return { ok: false, reason: 'missing-channel', hint: 'missing-channel：给哪个渠道钉版？' }; }
    if (!model) { stat.refused++; stat.lastReason = 'missing-model';
      return { ok: false, reason: 'missing-model', hint: 'missing-model：钉哪个模型？没模型名的钉版等于没钉' }; }
    const list = pinList().filter(function (p) { return str(p && p.channel) !== channel; });
    list.push({ channel: channel, model: model, at: num(s.at) || wallNow() });
    const w = writePins(list);
    stat.pins++;
    return { ok: true, channel: channel, model: model, pins: list.length,
      hint: w && w.ok === false ? 'settingsBus 写入回执非 ok（钉版可能未落盘）' : '' };
  }
  /** 撤钉：把某渠道的期望撤掉（此后该渠道不判漂移）。 */
  function unpin(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel'; return { ok: false, reason: 'missing-channel' }; }
    const before = pinList();
    const list = before.filter(function (p) { return str(p && p.channel) !== channel; });
    if (list.length === before.length) { stat.refused++; stat.lastReason = 'not-pinned';
      return { ok: false, reason: 'not-pinned', hint: 'not-pinned：这个渠道本来就没钉版' }; }
    writePins(list);
    stat.unpins++;
    return { ok: true, channel: channel, pins: list.length };
  }
  /** 单笔比对：回执模型 vs 钉版模型。 */
  function check(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel'; return { ok: false, reason: 'missing-channel' }; }
    const p = pinnedOf(channel);
    if (!p) return { ok: true, pinned: false, comparable: false, hint: '未钉版：没有声明期望值，不存在违约' };
    const respModel = str(s.respModel);
    stat.checks++;
    if (!respModel) { stat.incomparable++;
      return { ok: true, pinned: true, comparable: false, expect: str(p.model),
        hint: '回执没有 model 字段：拿不到凭据，既不算匹配也不算违约' }; }
    const match = str(p.model) === respModel;
    if (match) { stat.matches++; return { ok: true, pinned: true, comparable: true, match: true, expect: str(p.model), got: respModel }; }
    stat.drifts++;
    return { ok: false, reason: 'model-drift', pinned: true, comparable: true, match: false,
      expect: str(p.model), got: respModel, channel: channel,
      hint: 'model-drift：钉版[' + str(p.model) + '] 但回执说 [' + respModel + '] —— 这一笔被换了模型服务' };
  }
  /** 全渠道对账：拿 modelReceipt 的最近回执逐条比对（跨引擎真消费）。 */
  function audit() {
    const list = pinList();
    const rows = [];
    const MR = WA.modelReceipt;
    list.forEach(function (p) {
      const channel = str(p && p.channel);
      let last = null;
      if (MR && typeof MR.list === 'function') {
        const r = MR.list({ channel: channel, limit: 1 });
        last = (r && r.ok && r.rows && r.rows[0]) ? r.rows[0] : null;
      }
      const c = check({ channel: channel, respModel: last ? last.respModel : '' });
      rows.push({ channel: channel, expect: str(p.model),
        got: last ? (last.respModel || null) : null,
        receipts: MR && typeof MR.list === 'function' ? (MR.list({ channel: channel, limit: 1 }).total || 0) : 0,
        verdict: !last ? 'no-receipt' : (c.ok ? (c.comparable ? 'match' : 'incomparable') : 'drift') });
    });
    const bad = rows.filter(function (r) { return r.verdict === 'drift'; });
    return { ok: true, pinned: rows.length, clean: bad.length === 0, rows: rows, drifters: bad,
      hint: bad.length ? '存在违约渠道：钉版模型与真回执不一致' : (rows.length ? '钉版渠道全部对得上（或回执缺席已如实标注）' : '还没有任何钉版') };
  }
  function statView() { return Object.assign({ pinned: pinList().length }, stat); }
  function reset() {
    stat.pins = 0; stat.unpins = 0; stat.checks = 0; stat.matches = 0;
    stat.drifts = 0; stat.incomparable = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.modelPin = {
    pin: pin, unpin: unpin, check: check, audit: audit,
    pins: function () { return { ok: true, count: pinList().length, rows: pinList() }; },
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/model-pin.js', { kind: 'engine', ver: '2.517.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/model-pin 已加载（2.517.0）');
})();