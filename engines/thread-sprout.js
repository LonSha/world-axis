/**
 * WorldAxis engines/thread-sprout.js (v2.524.0) — EXV28-13/14/17/18 支线萌芽与收线
 *
 * ── 它治什么（现场读数）──────────────────────────────────────────────
 *   `threads` / `foreshadow` 都是**显式登记制**（plant / germinate / harvest 由上层触发）；
 *   `foreshadow-germination` 按「超过破土时限」强制破土（闹钟式）。
 *   线因此像后台任务表，不像人拉出来的。
 *
 * ── 本模块只做五件事 ─────────────────────────────────────────────────
 *   sprout()  从「人物目标 / 未兑现承诺 / 痕迹 / 玩家选择」长出一条**候选**线
 *             （钩子 + 代价 + 不接的后果）；来源必须指得出，否则拒收。
 *   hook()    玩家介入一次 → 升级为正式线（stage 进行中）。
 *   drop()    不接 → 降级为「背景噪点」（有痕无戏，不删干净）。
 *   collide() 两条线撞车 → 产出交集条目（必须双方来源）。
 *   close()   收线：必须付代价 + 留余波（不是打勾）。
 *
 * ── 边界 ─────────────────────────────────────────────────────────────
 *   1 不生成随机任务列表：source.type/ref 缺一即拒。
 *   2 候选上限 2 条（每来源一条，防堆积）。
 *   3 复用 currents 容器（kind:'seed'），不新增顶层键。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_thread_sprout_settings_v1';
  const DEF = { enabled: true, maxCandidates: 2, dropAfter: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'threadSprout',
    bounds: { maxCandidates: [1, 6], dropAfter: [2, 40] } };
  const SOURCES = ['goal', 'promise', 'trace', 'choice'];
  const stat = { sprouted: 0, hooked: 0, dropped: 0, closed: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('threadSprout'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function currents() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return Array.isArray(d.currents) ? d.currents : [];
  }
  function seeds() { return currents().filter(function (c) { return c && c.kind === 'seed'; }); }
  function sprout(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const src = s.source && typeof s.source === 'object' ? s.source : {};
    const type = String(src.type || '');
    const ref = clean(src.ref, 80);
    if (SOURCES.indexOf(type) < 0) { stat.refused++; stat.lastReason = 'missing-source'; return { ok: false, reason: 'missing-source', allowed: SOURCES }; }
    if (!ref) { stat.refused++; stat.lastReason = 'missing-source-ref'; return { ok: false, reason: 'missing-source-ref' }; }
    const title = clean(s.title || s.hook, 60);
    const hook = clean(s.hook, 110);
    if (!title || !hook) { stat.refused++; stat.lastReason = 'missing-hook'; return { ok: false, reason: 'missing-hook' }; }
        const live = seeds().filter(function (c) { return c.stage === '候选'; });
    if (live.length >= cfg.maxCandidates) { stat.refused++; stat.lastReason = 'too-many-candidates'; return { ok: false, reason: 'too-many-candidates', live: live.length }; }
    if (live.some(function (c) { return c.sourceType === type && c.sourceRef === ref; })) {
      stat.refused++; stat.lastReason = 'duplicate-source';
      return { ok: false, reason: 'duplicate-source' };
    }
    const row = { id: 'sd_' + round() + '_' + (stat.sprouted + 1), kind: 'seed',
      title: title, summary: hook, hook: hook, stage: '候选',
      visibility: 'trace', publicity: 'private',
      sourceType: type, sourceRef: ref,
      cost: clean(s.cost, 90), ifIgnored: clean(s.ifIgnored, 90),
      at: now(), round: round(), born: round() };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) { d.currents = Array.isArray(d.currents) ? d.currents : []; d.currents.push(row); return true; }, 'threadSprout:sprout');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.sprouted++;
    return { ok: true, reason: wrote ? 'sprouted' : 'sprouted-no-store', id: row.id, source: type };
  }
  function setStage(id, stage) {
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const arr = Array.isArray(d.currents) ? d.currents : [];
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id === id) { arr[i].stage = stage; arr[i].at = now(); ok = true; break; }
          }
          return true;
        }, 'threadSprout:' + stage);
      }
    } catch (e) { /* 降级 */ }
    return ok;
  }
  function hook(spec) {
    const id = String((spec && (spec.id || spec.threadId)) || '').trim();
    if (!id) return { ok: false, reason: 'missing-id' };
    const t = seeds().filter(function (c) { return c.id === id; })[0];
    if (!t) return { ok: false, reason: 'seed-missing' };
    if (t.stage === '进行中') return { ok: true, reason: 'already-live' };
    if (!setStage(id, '进行中')) return { ok: false, reason: 'write-failed' };
    stat.hooked++;
    return { ok: true, reason: 'hooked', id: id };
  }
  function drop(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    if (!id) return { ok: false, reason: 'missing-id' };
    const t = seeds().filter(function (c) { return c.id === id; })[0];
    if (!t) return { ok: false, reason: 'seed-missing' };
    // 只允许「不接 N 轮」之后降级：给一条能查的痕迹，不删干净。
    const age = round() - (Number.isFinite(t.born) ? t.born : 0);
    if (age < cfg.dropAfter && s.force !== true) return { ok: false, reason: 'too-early', age: age, need: cfg.dropAfter };
    if (!setStage(id, '噪点')) return { ok: false, reason: 'write-failed' };
    let mark = false;
    try {
      if (WA.tracePost && typeof WA.tracePost.post === 'function') {
        const r = WA.tracePost.post({ what: '你当时没去：' + clean(t.title, 50), kind: '缺席', life: 10, source: 'threadSprout' });
        mark = !!(r && r.ok);
      }
    } catch (e) { mark = false; }
    stat.dropped++;
    return { ok: true, reason: 'dropped', id: id, trace: mark };
  }
  function collide(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const a = String(s.a || '').trim();
    const b = String(s.b || '').trim();
    if (!a || !b || a === b) return { ok: false, reason: 'need-two-ids' };
    const arr = seeds();
    const ta = arr.filter(function (c) { return c.id === a; })[0];
    const tb = arr.filter(function (c) { return c.id === b; })[0];
    if (!ta || !tb) return { ok: false, reason: 'seed-missing' };
    const row = { id: 'cx_' + round() + '_' + (stat.sprouted + 1), kind: 'seed', stage: '交汇',
      title: clean(ta.title, 30) + ' × ' + clean(tb.title, 30),
      summary: '两条线在同一处撞上：' + clean(ta.title, 30) + ' / ' + clean(tb.title, 30),
      visibility: 'trace', publicity: 'private',
      sourceType: 'collision', sourceRef: a + '+' + b, at: now(), round: round(),
      sides: [a, b] };
    let ok = false;
    try {
      if (WA.store && WA.store.transact) { WA.store.transact(function (d) { d.currents = Array.isArray(d.currents) ? d.currents : []; d.currents.push(row); return true; }, 'threadSprout:collide'); ok = true; }
    } catch (e) { ok = false; }
    return ok ? { ok: true, reason: 'collided', id: row.id } : { ok: false, reason: 'write-failed' };
  }
  function close(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    const cost = clean(s.cost, 90);
    const aftermath = clean(s.aftermath, 90);
    if (!id) return { ok: false, reason: 'missing-id' };
    if (!cost) return { ok: false, reason: 'missing-cost' };
    if (!aftermath) return { ok: false, reason: 'missing-aftermath' };
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const arr = Array.isArray(d.currents) ? d.currents : [];
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id === id) { arr[i].stage = '已结束'; arr[i].closedAt = now(); arr[i].closeCost = cost; arr[i].aftermath = aftermath; ok = true; break; }
          }
          return true;
        }, 'threadSprout:close');
      }
    } catch (e) { ok = false; }
    if (!ok) return { ok: false, reason: 'seed-missing' };
    stat.closed++;
    return { ok: true, reason: 'closed', id: id, aftermath: aftermath };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, candidates: seeds().filter(function (c) { return c.stage === '候选'; }),
      live: seeds().filter(function (c) { return c.stage === '进行中'; }),
      noise: seeds().filter(function (c) { return c.stage === '噪点'; }), stat: stat };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const live = seeds().filter(function (c) { return c.stage === '候选' || c.stage === '进行中'; });
    if (!live.length) return '';
    return '[长出来的线]\n' + live.slice(0, 3).map(function (c) {
      return '- ' + c.title + '：' + c.hook + (c.stage === '候选' ? '（还没上钩）' : '');
    }).join('\n');
  }
  WA.threadSprout = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    SOURCES: SOURCES.slice(), sprout: sprout, hook: hook, drop: drop, collide: collide, close: close,
    view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/thread-sprout.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/thread-sprout 已加载（' + VERSION + '）');
})();