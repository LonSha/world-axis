/**
 * WorldAxis engines/history-provenance.js (v2.417.0) — OPV25-6 历史读数的来源身份
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   `timeline.js`（v2.65.0）已经在做**记忆时间链**：来源身份 / 哈希校验 / 引用审计。
 *   但它管的是**入账那一刻**的溯源 —— 一条事实从哪来、有没有被改。
 *   本模块管的是**读出来的那一刻**：这一次读到的内容，**是第几层楼的、哪一次提交的、
 *   哈希对不对、是原样还是从快照补的**。这两件事不是一回事：
 *   前者问「这条数据可不可信」，后者问「我手上这版是哪一版」。
 *   实测 `grep -rn 'provenance\|读数来源\|historySourceId' engines/` —— 430 引擎 0 命中
 *   （`timeline.js` 里的「来源身份」讲的是入账来源，不是读出身份）。
 *
 *   后果具体：同一段正文，读一次是原稿、读一次是快照补的、再读一次是玩家改过的 ——
 *   **三次读数看起来一模一样**，没法回答「我刚才引用的那句话，到底出自哪一版」。
 *   于是「谁改的、改了几次、引用的是改前还是改后」这类争辩永远无法用数据结案。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `stamp({layer, commit, hash, source})` 为一次读出**签发身份**
 *   （楼层 + 提交 + 内容哈希 + 来源途径 original/snapshot/patched）→
 *   `verify({stamp, hash})` 答「这版还是不是那一版」——哈希不符即 `drifted`，
 *   且**明确区分 `patched`（本来就说好是改过的）与 `drifted`（没打招呼就变了）**。
 *   `audit()` 给一份可复核的读数台账。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不读内容、不存内容：只记身份与哈希，内容由调用方保管。
 *   ② 哈希算法固定（fnv1a，32 位十六进制），与 `store.fnv1a` 同族口径，避免两套算法打架。
 *   ③ `patched` 必须由调用方显式声明；没声明就变了 = `drifted`，不许事后追认。
 *   ④ 拒收码只用 disabled / missing-* / unknown-stamp。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_history_provenance_settings_v1';
  const DEF = { enabled: true, maxStamps: 256 };
  const __REG = { key: LS_KEY, def: DEF, module: 'historyProv', bounds: { maxStamps: [16, 1024] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const SOURCES = ['original', 'snapshot', 'patched', 'imported'];
  const stat = { stamped: 0, verified: 0, drifted: 0, patched: 0, refused: 0, lastReason: '' };
  const STAMPS = []; // {id, layer, commit, hash, source, at, verifyCount}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  /** fnv1a 32 位：与 store.fnv1a 同族口径，避免两套算法打架。 */
  function fnv1a(s) {
    const t = String(s == null ? '' : s);
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function stamp(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const layer = num(s.layer);
    if (layer === null) { stat.refused++; stat.lastReason = 'missing-layer';
      return { ok: false, hint: 'missing-layer：这次读到的是第几层？没有楼层就没有出处' }; }
    const rawHash = str(s.hash);
    const hash = rawHash || (s.text != null ? fnv1a(s.text) : '');
    if (!hash) { stat.refused++; stat.lastReason = 'missing-hash';
      return { ok: false, hint: 'missing-hash：给 hash，或者给 text 让本模块算一个' }; }
    const commit = str(s.commit) || 'n/a';
    const source = SOURCES.indexOf(str(s.source)) >= 0 ? str(s.source) : 'original';
    const at = num(s.at) || clockNow('historyProv') || 0;
    const rec = { id: 'hp' + (++stat.stamped) + '-L' + layer, layer: layer, commit: commit,
      hash: hash, source: source, at: at, verifyCount: 0 };
    STAMPS.push(rec);
    while (STAMPS.length > cfg.maxStamps) STAMPS.shift();
    if (source === 'patched') stat.patched++;
    return { ok: true, id: rec.id, layer: layer, commit: commit, hash: hash, source: source };
  }
  /** 校验：这版还是不是那一版。patched 与 drifted 必须分开。 */
  function verify(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = str(s.id);
    const rec = STAMPS.find(function (r) { return r.id === id; });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-stamp'; return { ok: false, hint: 'unknown-stamp：没有这个读数身份' }; }
    const nowHash = str(s.hash) || (s.text != null ? fnv1a(s.text) : '');
    if (!nowHash) { stat.refused++; stat.lastReason = 'missing-hash';
      return { ok: false, hint: 'missing-hash：给现在的 hash 或 text' }; }
    rec.verifyCount++; stat.verified++;
    if (nowHash === rec.hash) {
      return { ok: true, id: rec.id, same: true, hash: nowHash, source: rec.source,
        hint: rec.source === 'patched' ? '一致：而且要记得这版本来就是改过的' : '一致：还是签发出的那一版' };
    }
    if (rec.source === 'patched') {
      stat.patched++;
      return { ok: true, id: rec.id, same: false, declared: true, hash: nowHash, prevHash: rec.hash,
        verdict: 'patched',
        hint: 'patched：这版本来就说好是改过的，不算异常（但引用时要说明引的是改后版）' };
    }
    stat.drifted++;
    return { ok: true, id: rec.id, same: false, declared: false, hash: nowHash, prevHash: rec.hash,
      verdict: 'drifted',
      hint: 'drifted：没打招呼就变了 —— 不许事后追认为「本来就是改过的」' };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const layer = num(s.layer);
    const rows = STAMPS.filter(function (r) { return layer === null || r.layer === layer; })
      .map(function (r) { return { id: r.id, layer: r.layer, commit: r.commit, hash: r.hash,
        source: r.source, at: r.at, verifyCount: r.verifyCount }; });
    return { ok: true, count: rows.length, rows: rows };
  }
  /** 可复核台账：每条读数带出处与验证次数。 */
  function audit() {
    const byLayer = {};
    const bySource = {};
    STAMPS.forEach(function (r) {
      byLayer[String(r.layer)] = (byLayer[String(r.layer)] || 0) + 1;
      bySource[r.source] = (bySource[r.source] || 0) + 1;
    });
    return { ok: true, total: STAMPS.length, byLayer: byLayer, bySource: bySource,
      unverified: STAMPS.filter(function (r) { return r.verifyCount === 0; }).length,
      hint: STAMPS.length ? '' : '还没有任何读数身份：出处这件事现在无从考' };
  }
  function statView() { return Object.assign({ stamps: STAMPS.length }, stat); }
  function reset() {
    STAMPS.length = 0;
    stat.stamped = 0; stat.verified = 0; stat.drifted = 0; stat.patched = 0;
    stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.historyProv = {
    stamp: stamp, verify: verify, view: view, audit: audit, fnv1a: fnv1a,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings,
    SOURCES: SOURCES.slice()
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/history-provenance.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/history-provenance 已加载（2.417.0）');
})();