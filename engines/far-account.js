/**
 * WorldAxis engines/far-account.js (v2.524.0) — EXV28-26/27
 *   异地账：你在这边，那边也在走 · 换地方能对上 · 没路的信息不直达
 *
 * ── 它治的病（现场读数）────────────────────────────────────────────────
 *   `grep -n 'region.tickOffline' engines/*.js` 的唯一调用方是**离线边**：
 *   玩家在线期间，异地是**静止的**。于是「世界别处也在动」这句话只在关掉游戏时成立，
 *   开着的时候恰恰不动 —— 而玩家最常看见的正是「开着」的那几个小时。
 *   第二个洞更隐蔽：跨地点写事实**没有路径概念**，谁想知道什么都能直达，
 *   于是「远方的消息要慢慢传」这件事无法被违反，也就无法被感知。
 *
 * ── 三条硬纪律 ───────────────────────────────────────────────────────
 *   ① 只写账，不写正文：`tick()` 记的是「那边这一轮发生了什么」，进不进正文由注入层决定。
 *   ② 换地方能对上：`read()` 报出的轮数与条目**只来自这笔账**，不拿世界总轮次冒充。
 *   ③ 没有路径就不直达：`reach()` 只认已记的路（`world.roads` / 地点邻接），
 *      查不到就 `no-path` 并指出缺的是哪一段 —— 不替玩家补一条「反正能问到」。
 *
 * ── 落点（复用既有容器）──────────────────────────────────────────────
 *   `region.events`（骨架里已有，`{places:[],events:[]}`）：每条 `kind:'tick'`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_far_account_settings_v1';
  const DEF = { enabled: true, maxEvents: 40, maxRoundsPerTick: 30 };
  const __REG = { key: LS_KEY, def: DEF, module: 'farAccount',
    bounds: { maxEvents: [8, 120], maxRoundsPerTick: [1, 60] } };
  const stat = { ticks: 0, reached: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('farAccount'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function region() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const r = d.region && typeof d.region === 'object' ? d.region : {};
    return { events: Array.isArray(r.events) ? r.events : [], places: Array.isArray(r.places) ? r.places : [],
      roads: (d.world && Array.isArray(d.world.roads)) ? d.world.roads : [] };
  }

  /** 那边走来若干轮（只记账；不推进正文、不改人数） */
  function tick(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const place = clean(s.place, 40);
    const what = clean(s.what || s.event, 110);
    const rounds = Number.isFinite(s.rounds) ? Math.max(1, Math.min(cfg.maxRoundsPerTick, Number(s.rounds))) : 1;
    if (!place) { stat.refused++; stat.lastReason = 'missing-place'; return { ok: false, reason: 'missing-place' }; }
    if (!what) { stat.refused++; stat.lastReason = 'missing-what'; return { ok: false, reason: 'missing-what' }; }
    const known = region().places.filter(function (p) { return p && (p.name === place || p.id === place); })[0];
    if (!known && s.force !== true) {
      stat.refused++; stat.lastReason = 'place-missing';
      return { ok: false, reason: 'place-missing', place: place, note: '这个世界里没有这个地点；要记野地请显式 force' };
    }
    const row = { id: 'fa_' + round() + '_' + (stat.ticks + 1), kind: 'tick', place: place,
      what: what, rounds: rounds, round: round(), at: now() };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.region = d.region && typeof d.region === 'object' ? d.region : { places: [], events: [] };
          d.region.events = Array.isArray(d.region.events) ? d.region.events : [];
          d.region.events.push(row);
          if (d.region.events.length > settings().maxEvents) d.region.events.shift();
          return true;
        }, 'farAccount:tick');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.ticks++;
    return { ok: true, reason: wrote ? 'ticked' : 'ticked-no-store', id: row.id, place: place, rounds: rounds };
  }

  /** 换到那个地方：这里走过的轮数与最近几件事（只从这笔账来） */
  function read(spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, known: false, reason: 'disabled', items: [] };
    const s = spec && typeof spec === 'object' ? spec : {};
    const place = clean(s.place, 40);
    if (!place) return { ok: false, reason: 'missing-place' };
    const rows = region().events.filter(function (x) { return x && x.kind === 'tick' && x.place === place; });
    if (!rows.length) return { ok: true, known: false, reason: 'no-account', place: place };
    const rounds = rows.reduce(function (n, x) { return n + (Number(x.rounds) || 0); }, 0);
    return { ok: true, known: true, place: place, rounds: rounds, events: rows.length,
      items: rows.slice(-4).map(function (x) { return '第 ' + x.round + ' 轮：' + clean(x.what, 60); }) };
  }

  /** 信息路径：这条消息能不能直达（有路才直达，没路就得绕/就得等） */
  function reach(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const from = clean(s.from, 40);
    const to = clean(s.to, 40);
    if (!from) return { ok: false, reason: 'missing-place' };
    if (!to) return { ok: false, reason: 'missing-target' };
    if (from === to) { stat.reached++; return { ok: true, direct: true, hops: 0, reason: 'same-place' }; }
    const r = region();
    const norm = function (x) { return x ? clean(x, 40) : ''; };
    const edge = function (a, b) {
      return r.roads.some(function (e) {
        if (!e) return false;
        const p = norm(e.from || e.a || e.src), q = norm(e.to || e.b || e.dst);
        return (p === a && q === b) || (p === b && q === a);
      });
    };
    if (edge(from, to)) { stat.reached++; return { ok: true, direct: true, hops: 1, reason: 'road' }; }
    // 两跳：找一条中转（只认已记的路，不猜）
    const mids = [];
    r.places.forEach(function (p) {
      const id = norm(p && (p.id || p.name));
      if (!id || id === from || id === to) return;
      if (edge(from, id) && edge(id, to)) mids.push(id);
    });
    if (mids.length) { stat.reached++; return { ok: true, direct: false, hops: 2, via: mids.slice(0, 3), reason: 'two-hops' }; }
    stat.refused++; stat.lastReason = 'no-path';
    return { ok: false, reason: 'no-path', from: from, to: to,
      note: '这两地之间没记过路：消息只能靠人带，或者先修一条' };
  }

  /** 你不在的期间，那边发生了什么（注入块） */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const rows = region().events.filter(function (x) { return x && x.kind === 'tick'; });
    if (!rows.length) return '';
    const byPlace = {};
    rows.forEach(function (x) { (byPlace[x.place] = byPlace[x.place] || []).push(x); });
    const lines = [];
    Object.keys(byPlace).forEach(function (k) {
      if (lines.length >= 3) return;
      const list = byPlace[k];
      const last = list[list.length - 1];
      lines.push('- ' + clean(k, 20) + '（已走 ' + list.reduce(function (n, x) { return n + (Number(x.rounds) || 0); }, 0)
        + ' 轮）：' + clean(last.what, 50));
    });
    return lines.length ? '[别处也在走]\n' + lines.join('\n') : '';
  }
  function view() {
    const rows = region().events.filter(function (x) { return x && x.kind === 'tick'; });
    const places = Object.keys(rows.reduce(function (m, x) { m[x.place] = 1; return m; }, {}));
    return { enabled: settings().enabled, events: rows.length, places: places, stat: stat, block: buildBlock() };
  }

  WA.farAccount = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    tick: tick, read: read, reach: reach, view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/far-account.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/far-account 已加载（' + VERSION + '）');
})();