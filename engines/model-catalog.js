/**
 * WorldAxis engines/model-catalog.js (v2.517.0) — OPV26-5 模型清单拉取与在册核对
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   `core/api-router.js:392` 的 `fetchModels(channel)` 打的是 `GET /models`，
 *   能把服务端**真实提供的模型清单**拉回来 —— 但实测：
 *     · `grep -rn 'fetchModels' core/ engines/ ui/` ⇒ 只有定义处；
 *     · `tests/dead-export-ledger.json` 与 `tests/consumer-ledger.json`
 *       双双把它登记为「无消费者」。
 *   后果：UI 的模型字段一直是 `<input placeholder="模型名">` **手打**
 *   （实测 ui/panel.js:2828）。手打的两个必然坏处：
 *   ① 拼错一个字符 → 每次调用都 404/400，报错信息还只说「模型不存在」；
 *   ② 服务端下架/改名某模型 → 配置里躺着一个已经不被提供的名字，
 *      而界面上看不出来（连「这个模型还卖不卖」都要去外部控制台查）。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `ingest({channel, models})` 把清单**纯函数式**收进目录（可测、不碰网络）→
 *   `refresh({channel})` 才是网络壳：调 `apiRouter.fetchModels` 再走 ingest →
 *   `check({channel, model})` 答「这个名字在不在册」→
 *   `audit()` 拿 modelPin 的钉版逐条核对（**跨引擎真消费**：钉了一个服务端
 *   已经不下发的模型，是配置错误，不是漂移）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 网络只在 `refresh` 里发生；`ingest` 是纯收账，测试与离线路径都走它。
 *   ② 清单**不落持久盘**：它是易变的服务端事实（缓存窗口 cacheTtlMs 内复用，
 *      过期即视为未知），把易变事实写进存档等于把过期当真相。
 *   ③ 拉取失败如实报 `fetch-failed`，不返回空清单冒充「服务端没有任何模型」。
 *   ④ 拒收码只用 disabled / missing-channel / missing-model / no-cache / fetch-failed。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_model_catalog_settings_v1';
  const DEF = { enabled: true, cacheTtlMs: 300000, maxModels: 500 };
  const __REG = { key: LS_KEY, def: DEF, module: 'modelCatalog',
    bounds: { cacheTtlMs: [10000, 86400000], maxModels: [20, 5000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { ingests: 0, refreshes: 0, fetchFails: 0, checks: 0, misses: 0, refused: 0, lastReason: '' };
  const CACHE = {};   // channel -> {models:[], at}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function cacheValid(rec, cfg) { return !!(rec && Array.isArray(rec.models) && (wallNow() - rec.at) <= cfg.cacheTtlMs); }
  /** 纯收账：把一份清单记进目录（不碰网络，测试与 refresh 共用）。 */
  function ingest(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel';
      return { ok: false, reason: 'missing-channel', hint: 'missing-channel：这份清单是哪个渠道的？' }; }
    const raw = Array.isArray(s.models) ? s.models : [];
    const seen = {};
    const models = [];
    raw.forEach(function (m) {
      const name = str(typeof m === 'string' ? m : (m && (m.id || m.name)));
      if (!name || seen[name]) return;   // 去重：服务端偶有重复下发，重复即噪声
      seen[name] = 1;
      models.push(name);
    });
    const capped = models.slice(0, cfg.maxModels);
    CACHE[channel] = { models: capped, at: num(s.at) || wallNow(), total: models.length };
    stat.ingests++;
    return { ok: true, channel: channel, models: capped.length, total: models.length,
      truncated: models.length > capped.length,
      hint: models.length > capped.length ? ('清单超上限：只留前 ' + capped.length + ' 个（maxModels）') : '' };
  }
  /** 网络壳：调 apiRouter.fetchModels 再走 ingest。 */
  async function refresh(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel) || 'default';
    if (!WA.apiRouter || typeof WA.apiRouter.fetchModels !== 'function') {
      stat.fetchFails++; stat.lastReason = 'fetch-failed';
      return { ok: false, reason: 'fetch-failed', hint: 'fetch-failed：apiRouter.fetchModels 不在（装载顺序或宿主缺 fetch）' };
    }
    try {
      const models = await WA.apiRouter.fetchModels(channel);
      stat.refreshes++;
      const r = ingest({ channel: channel, models: models });
      return Object.assign({}, r, { refreshed: true });
    } catch (e) {
      stat.fetchFails++; stat.lastReason = 'fetch-failed';
      //  如实报失败：返回空清单会让上层以为「服务端一个模型都没有」——那是假事实
      const prev = CACHE[channel];
      return { ok: false, reason: 'fetch-failed', channel: channel,
        message: String((e && e.message) || e).slice(0, 200),
        stale: cacheValid(prev, cfg) ? prev.models.slice() : null,
        hint: 'fetch-failed：拉取失败（网络/鉴权/端点），旧清单仅在缓存窗口内仍可用，不拿空清单冒充事实' };
    }
  }
  /** 在册核对：这个名字服务端还提供吗。清单不在（没拉过或已过期）⇒ no-cache，不猜。 */
  function check(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel) || 'default';
    const model = str(s.model);
    if (!model) { stat.refused++; stat.lastReason = 'missing-model'; return { ok: false, reason: 'missing-model' }; }
    const rec = CACHE[channel];
    stat.checks++;
    if (!cacheValid(rec, cfg)) {
      stat.refused++; stat.lastReason = 'no-cache';
      return { ok: false, reason: 'no-cache', channel: channel, model: model,
        hint: 'no-cache：还没拉过清单（或已过期）—— 先 refresh，再判在册' };
    }
    const listed = rec.models.indexOf(model) >= 0;
    if (!listed) stat.misses++;
    return { ok: true, channel: channel, model: model, listed: listed, offered: rec.models.slice(),
      hint: listed ? '' : ('不在册：服务端当前提供的清单里没有[' + model + '] —— 手打的模型名可能拼错或已被下架') };
  }
  /** 钉版对账：钉版模型是否仍在册（跨引擎读 modelPin）。 */
  function audit() {
    const cfg = settings();
    const rows = [];
    const MP = WA.modelPin;
    const pins = (MP && typeof MP.pins === 'function') ? (MP.pins().rows || []) : [];
    pins.forEach(function (p) {
      const channel = str(p && p.channel);
      const model = str(p && p.model);
      const rec = CACHE[channel];
      if (!cacheValid(rec, cfg)) {
        rows.push({ channel: channel, model: model, verdict: 'no-cache' });
        return;
      }
      const listed = rec.models.indexOf(model) >= 0;
      rows.push({ channel: channel, model: model, verdict: listed ? 'in-catalog' : 'not-offered' });
    });
    const bad = rows.filter(function (r) { return r.verdict === 'not-offered'; });
    return { ok: true, pinned: rows.length, clean: bad.length === 0, rows: rows, orphans: bad,
      hint: bad.length ? '钉版模型不在服务端清单里：配置错误（不是漂移），改钉版或改用仍在册的模型'
        : (rows.length ? '钉版模型全部在册' : '还没有任何钉版（或清单未拉取）') };
  }
  function list(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel) || 'default';
    const rec = CACHE[channel];
    if (!cacheValid(rec, cfg)) return { ok: false, reason: 'no-cache', channel: channel,
      hint: 'no-cache：没有可用的清单缓存' };
    return { ok: true, channel: channel, at: rec.at, models: rec.models.slice(), total: rec.total };
  }
  function statView() { return Object.assign({ cachedChannels: Object.keys(CACHE).length }, stat); }
  function reset() {
    Object.keys(CACHE).forEach(function (k) { delete CACHE[k]; });
    stat.ingests = 0; stat.refreshes = 0; stat.fetchFails = 0; stat.checks = 0;
    stat.misses = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.modelCatalog = {
    ingest: ingest, refresh: refresh, check: check, audit: audit, list: list,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/model-catalog.js', { kind: 'engine', ver: '2.517.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/model-catalog 已加载（2.517.0）');
})();