/**
 * WorldAxis engines/advance-idempotence.js (v2.417.0) — OPV25-1 剧情推进幂等闸
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓的幂等面**都是局部的**，而推进动作是**整轮的**：
 *     · `core/commit.js` 有 `opKey(opt)`，治的是「跨引擎链的这一笔做过没有」——
 *       它管的是**结算**，不是「这一轮到底要不要再推一次」；
 *     · `rule-pack.js`（v2.264.0）有幂等闸，治的是「重复切同一个档位」。
 *   两者之间空着一层：**同一个楼层被重放、或者玩家换了一次滑动（swipe），
 *   整个推进链会再跑一轮** —— 世界时间再走一次、事件再触发一次、账再记一次。
 *   实测 `grep -rn 'advanceOnce\|idempotentGate\|推进幂等' engines/` —— 430 引擎 0 命中。
 *
 *   这是本仓最贵的一类病：它不报错、不留痕，只是让世界**悄悄多走了一遍**。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `begin({layer, swipe, sig})` 建一个推进回合的键（楼层 + 滑动 + 结算签名），
 *   同一键**第二次就直接答 duplicated:true，不放行**；`claim` 是「我要开始推了」的
 *   唯一入口（内部调 begin，命中重复即拒）。`commit` / `abort` 关账。
 *   键里带 swipe —— **换滑动是新回合，同滑动重放才是重复**，这两件事必须分开。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store、不推进任何东西：它只回答「这一笔该不该再走一遍」。
 *   ② 键的构成必须由调用方给全（layer/swipe/sig）；缺 layer 直接拒收，不猜楼层。
 *   ③ 回合数有界（默认 128），挤出最早**已关账**的回合；在途回合不挤。
 *   ④ 拒收码只用 disabled / missing-layer / duplicated / unknown-round。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_advance_idem_settings_v1';
  const DEF = { enabled: true, maxRounds: 128 };
  const __REG = { key: LS_KEY, def: DEF, module: 'advanceIdem', bounds: { maxRounds: [16, 512] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { begins: 0, dups: 0, commits: 0, aborts: 0, refused: 0, lastReason: '' };
  const ROUNDS = []; // {key, layer, swipe, sig, state, at, closedAt, replays}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function keyOf(layer, swipe, sig) { return 'L' + layer + '|S' + swipe + '|' + str(sig); }
  function trimCap(cap) {
    while (ROUNDS.length > cap) {
      const idx = ROUNDS.findIndex(function (r) { return r.state !== 'inflight'; });
      if (idx < 0) break;
      ROUNDS.splice(idx, 1);
    }
  }
  /** 建回合。同一键第二次即 duplicated，不放行。 */
  function begin(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const layer = num(s.layer);
    if (layer === null) { stat.refused++; stat.lastReason = 'missing-layer';
      return { ok: false, hint: 'missing-layer：推进发生在第几楼？没有楼层就无法判定重放' }; }
    const swipe = num(s.swipe); const sw = swipe === null ? 0 : swipe;
    const sig = str(s.sig) || '';
    const key = keyOf(layer, sw, sig);
    const hit = ROUNDS.find(function (r) { return r.key === key; });
    if (hit) {
      hit.replays = (hit.replays || 0) + 1;
      stat.dups++;
      return { ok: false, reason: 'duplicated', duplicated: true, key: key,
        state: hit.state, at: hit.at, replays: hit.replays,
        hint: 'duplicated：这一回合已经走过（同楼层同滑动同签名），不再放行——换滑动才是新回合' };
    }
    const now = num(s.at) || clockNow('advanceIdem') || 0;
    const rec = { key: key, layer: layer, swipe: sw, sig: sig, state: 'inflight',
      at: now, closedAt: null, replays: 0 };
    ROUNDS.push(rec);
    trimCap(cfg.maxRounds);
    stat.begins++;
    return { ok: true, key: key, state: 'inflight', at: now };
  }
  /** 唯一放行口：等价于 begin，但语义上声明「我要开始推了」。 */
  function claim(spec) {
    const r = begin(spec);
    if (!r.ok && r.reason === 'duplicated') {
      return { ok: false, reason: 'duplicated', duplicated: true, key: r.key, replays: r.replays, hint: r.hint };
    }
    if (!r.ok) return r;
    return { ok: true, granted: true, key: r.key, at: r.at };
  }
  function closeRound(key, state, at) {
    const rec = ROUNDS.find(function (r) { return r.key === key; });
    if (!rec) return null;
    rec.state = state; rec.closedAt = at;
    return rec;
  }
  function commit(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const key = str(s.key);
    const rec = ROUNDS.find(function (r) { return r.key === key; });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-round'; return { ok: false, hint: 'unknown-round：没有这个推进回合' }; }
    const at = num(s.at) || clockNow('advanceIdem') || 0;
    closeRound(key, 'committed', at);
    stat.commits++;
    return { ok: true, key: key, state: 'committed', closedAt: at };
  }
  function abort(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const key = str(s.key);
    const rec = ROUNDS.find(function (r) { return r.key === key; });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-round'; return { ok: false, hint: 'unknown-round：没有这个推进回合' }; }
    const at = num(s.at) || clockNow('advanceIdem') || 0;
    closeRound(key, 'aborted', at);
    stat.aborts++;
    return { ok: true, key: key, state: 'aborted', closedAt: at, reason: str(s.reason) || 'aborted' };
  }
  /** 只读：这一笔做过没有（不建回合）。 */
  function probe(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const layer = num(s.layer);
    if (layer === null) return { ok: false, hint: 'missing-layer：给楼层' };
    const swipe = num(s.swipe); const sw = swipe === null ? 0 : swipe;
    const key = keyOf(layer, sw, str(s.sig));
    const hit = ROUNDS.find(function (r) { return r.key === key; });
    if (!hit) return { ok: true, known: false, key: key, hint: '这一回合没走过：可以放行' };
    return { ok: true, known: true, key: key, state: hit.state, at: hit.at, replays: hit.replays };
  }
  function view() {
    return { ok: true, count: ROUNDS.length, rounds: ROUNDS.map(function (r) {
      return { key: r.key, layer: r.layer, swipe: r.swipe, state: r.state, at: r.at, replays: r.replays };
    }) };
  }
  function statView() {
    return Object.assign({ rounds: ROUNDS.length,
      inflight: ROUNDS.filter(function (r) { return r.state === 'inflight'; }).length }, stat);
  }
  function reset() {
    ROUNDS.length = 0;
    stat.begins = 0; stat.dups = 0; stat.commits = 0; stat.aborts = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.advanceIdem = {
    begin: begin, claim: claim, commit: commit, abort: abort, probe: probe,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/advance-idempotence.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/advance-idempotence 已加载（2.417.0）');
})();