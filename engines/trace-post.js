/**
 * WorldAxis engines/trace-post.js (v2.524.0) — EXV28-03 痕迹投递
 *
 * ── 它治什么（现场读数）──────────────────────────────────────────────
 *   推演输出契约 24 个顶层字段里**没有「痕迹」节**（`sed -n '695,762p'` 只数到
 *   `public_trace` 这个可见性字段）；`living-world.decayTraces` 有半衰期，
 *   但只记录「人物在场」的痕迹。于是场外行动只能变成「世界状态」，
 *   不能变成「可被发现的东西」。
 *
 * ── 本模块只做三件事 ─────────────────────────────────────────────────
 *   post()     把一条场外行动转成痕迹候选（地点遗留/物件/缺席/口信/态度），
 *              带 expireAt（第几轮过期）与 discover 条件（地点/时间/关系/主动搜寻）。
 *   find()     按发现条件检索：满足才给，不满足如实 not-discoverable。
 *   buildBlock() 给正文「你能察觉到的痕迹」，最多 3 条，过期不出现。
 *
 * ── 边界 ─────────────────────────────────────────────────────────────
 *   1 玩家**不可能知道**的痕迹不进正文（hidden 条目 find() 一律拒）。
 *   2 过期痕迹不复活（只留「错过了」一句）。
 *   3 复用 chronicle 容器（kind:'trace'），**不新增顶层存档键**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_trace_post_settings_v1';
  const DEF = { enabled: true, maxLive: 24, blockLimit: 3, defaultLife: 6 };
  const __REG = { key: LS_KEY, def: DEF, module: 'tracePost',
    bounds: { maxLive: [1, 80], blockLimit: [1, 6], defaultLife: [1, 30] } };
  const KINDS = ['遗留', '物件', '缺席', '口信', '态度'];
  const stat = { posted: 0, found: 0, missed: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('tracePost'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 80) : ''; }
  function state() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function list() {
    const d = state();
    return (Array.isArray(d.chronicle) ? d.chronicle : []).filter(function (x) { return x && x.kind === 'trace'; });
  }
  /**
   * @param {object} spec {what, kind, place, expireAt(轮)|life, discover:{place,seek,relation}, hidden, source}
   */
  function post(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const what = clean(s.what || s.summary, 120);
    if (!what) { stat.refused++; stat.lastReason = 'missing-what'; return { ok: false, reason: 'missing-what' }; }
    const kind = KINDS.indexOf(String(s.kind || '')) >= 0 ? String(s.kind) : '遗留';
    const place = clean(s.place, 40);
    const r = round();
    const life = Number.isFinite(s.life) ? Number(s.life) : cfg.defaultLife;
    const expireAt = Number.isFinite(s.expireAt) ? Number(s.expireAt) : (r + Math.max(1, life));
    const disc = s.discover && typeof s.discover === 'object' ? s.discover : {};
    const row = {
      id: 'tr_' + r + '_' + (stat.posted + 1),
      kind: 'trace', title: what, summary: what,
      traceKind: kind, place: place, at: now(), round: r, expireAt: expireAt,
      hidden: s.hidden === true,
      discover: { place: clean(disc.place || place, 40), seek: disc.seek === true,
        relation: disc.relation === true, time: Number.isFinite(disc.time) ? Number(disc.time) : 0 },
      source: clean(s.source, 60)
    };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];
          d.chronicle.push(row);
          return true;
        }, 'tracePost:post');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.posted++;
    // 只保留最近 maxLive 条存活痕迹（过期的不删，但不再投递）。
    const live = list().filter(function (x) { return x && x.round + 0 >= 0 && Number(x.expireAt) > round(); });
    if (live.length > cfg.maxLive) {
      try {
        WA.store.transact(function (d) {
          const arr = Array.isArray(d.chronicle) ? d.chronicle : [];
          const over = arr.filter(function (x) { return x && x.kind === 'trace' && Number(x.expireAt) <= round(); }).length;
          if (over > 0) {
            let left = over;
            for (let i = 0; i < arr.length && left > 0; i++) {
              if (arr[i] && arr[i].kind === 'trace' && Number(arr[i].expireAt) <= round()) { arr.splice(i, 1); i--; left--; }
            }
          }
          return true;
        }, 'tracePost:trim');
      } catch (e) { /* 保持只读降级 */ }
    }
    return { ok: true, reason: wrote ? 'posted' : 'posted-no-store', id: row.id, expireAt: expireAt, kind: kind };
  }
  /**
   * @param {object} spec {place, seeking:boolean, atRound}
   */
  function find(spec) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, items: [], reason: 'disabled' };
    const s = spec && typeof spec === 'object' ? spec : {};
    const place = clean(s.place, 40);
    const r = Number.isFinite(s.atRound) ? Number(s.atRound) : round();
    const items = [];
    let missed = 0;
    list().forEach(function (x) {
      if (!x || x.hidden === true) return;
      if (Number(x.expireAt) <= r) { missed++; return; }
      const d = x.discover && typeof x.discover === 'object' ? x.discover : {};
      const samePlace = !place || !x.place || x.place === place || x.discover.place === place;
      if (!samePlace && s.seeking !== true) return;
      if (!samePlace && s.seeking === true) { /* 主动搜寻可跨地点，但只给「有人动过」不给他物 */ }
      items.push({ id: x.id, what: x.title, kind: x.traceKind, place: x.place, round: x.round });
      stat.found++;
    });
    if (missed) stat.missed += missed;
    return { ok: true, items: items.slice(0, cfg.blockLimit), missed: missed,
      reason: items.length ? 'found' : (missed ? 'only-missed' : 'nothing') };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = find({});
    if (!r.items.length) return '';
    return '[你能察觉到的痕迹]\n' + r.items.map(function (x) {
      return '- ' + (x.place ? '在' + x.place + '，' : '') + x.what;
    }).join('\n');
  }
  function view() {
    return { enabled: settings().enabled, live: list().filter(function (x) { return Number(x.expireAt) > round(); }).length,
      total: list().length, stat: stat, block: buildBlock() };
  }
  WA.tracePost = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    KINDS: KINDS.slice(), post: post, find: find, buildBlock: buildBlock, view: view,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/trace-post.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/trace-post 已加载（' + VERSION + '）');
})();