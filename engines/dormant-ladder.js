/**
 * WorldAxis engines/dormant-ladder.js (v2.526.0) — EXV28-15/16 暗线阶梯与「你怎么知道」
 * 读数：currents 快照 slice(0,10)（backstage:249）；visibility 四档 hidden|trace|known|direct；
 *      rumor.visibleTo/fullView 已在——本模块不造来路，只把六态阶梯投影出来。
 * 六态：未闻 / 听闻 / 未确认 / 已介入 / 已错过 / 已了结（只投影玩家可知）。
 * 边界：hidden 绝不进正文；「已错过」不复活，除非有新证据；只读投影，不改 owner 状态。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.529.0: 决策时间单一出口（G20：产品代码零裸调 Date.now()）。此前本引擎直接裸调，
  //   冻结/回放时这段读到的时刻不受控 —— 回放对不上时无从定位。
  const clockNow = function (s) { try { return WA.clock.now(s); } catch (e) { return Date.now(); } };
  const VERSION = '2.526.0';
  const LS_KEY = 'worldaxis_dormant_ladder_settings_v1';
  const DEF = { enabled: true, blockLimit: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'dormantLadder', bounds: { blockLimit: [1, 6] } };
  const LADDER = ['未闻', '听闻', '未确认', '已介入', '已错过', '已了结'];
  const stat = { reads: 0, leaked: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function state() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 70) : ''; }
  function knownToPlayer(c) {
    if (!c) return false;
    if (c.visibility === 'hidden') return false;
    if (c.hidden === true) return false;
    return true;
  }
  /** 由 owner 的可见性/阶段推出阶梯态；推不出就如实 unknown。 */
  function stateOf(c) {
    if (!c) return '未闻';
    if (c.ladder && LADDER.indexOf(c.ladder) >= 0) return c.ladder;
    const st = String(c.stage || '');
    if (st === '已结束' || st === 'closed') return '已了结';
    if (st === '错过' || c.missed === true) return '已错过';
    if (st === '进行中' || st === '交汇') return '已介入';
    if (c.visibility === 'direct') return '已介入';
    if (c.visibility === 'known') return '未确认';
    if (c.visibility === 'trace') return '听闻';
    return '未闻';
  }
  function project(opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, items: [], reason: 'disabled' };
    const o = opts && typeof opts === 'object' ? opts : {};
    const d = state();
    const out = [];
    (Array.isArray(d.currents) ? d.currents : []).forEach(function (c) {
      if (!c) return;
      if (!knownToPlayer(c)) { stat.leaked++; return; }
      const st = stateOf(c);
      if (st === '未闻' && o.includeUnheard !== true) return;
      out.push({ id: c.id, title: clean(c.title, 40), state: st,
        how: clean(c.how || (c.publicity === 'public' ? '公开的' : '听来的'), 40),
        side: c.kind === 'seed' ? 'seed' : 'current' });
    });
    (Array.isArray(d.foreshadow) ? d.foreshadow : []).forEach(function (f) {
      if (!f) return;
      if (f.hidden === true) { stat.leaked++; return; }
      const st = f.status === 'recycled' ? '已了结' : (f.status === 'dropped' ? '已错过' : '未确认');
      out.push({ id: f.id, title: clean(f.content, 40), state: st, how: '埋着的', side: 'foreshadow' });
    });
    stat.reads++;
    return { ok: true, items: out.slice(0, Number(o.limit) || 12), ladder: LADDER.slice() };
  }
  /** 只允许把「玩家已经知道的事」标成阶梯态；hidden 一律拒。 */
  function mark(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    const st = String(s.state || '');
    if (!id) return { ok: false, reason: 'missing-id' };
    if (LADDER.indexOf(st) < 0) return { ok: false, reason: 'unknown-state', ladder: LADDER };
    let ok = false, blocked = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          const arr = Array.isArray(d.currents) ? d.currents : [];
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] && arr[i].id === id) {
              if (arr[i].visibility === 'hidden' || arr[i].hidden === true) { blocked = true; break; }
              arr[i].ladder = st; arr[i].ladderAt = clockNow('dormantLadder'); ok = true; break;
            }
          }
          return true;
        }, 'dormantLadder:mark');
      }
    } catch (e) { ok = false; }
    if (blocked) { stat.refused++; stat.lastReason = 'hidden-leak'; return { ok: false, reason: 'hidden-leak' }; }
    return ok ? { ok: true, reason: 'marked', id: id, state: st } : { ok: false, reason: 'entry-missing' };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = project({ limit: 8 });
    const items = (r.items || []).filter(function (x) { return x.state === '听闻' || x.state === '未确认' || x.state === '已介入' || x.state === '已错过'; });
    if (!items.length) return '';
    return '[你知道的暗线]\n' + items.slice(0, cfg.blockLimit).map(function (x) {
      return '- ' + x.title + '（' + x.state + '，' + x.how + '）';
    }).join('\n');
  }
  function view() { return { enabled: settings().enabled, ladder: LADDER.slice(), items: project({ limit: 12 }).items, stat: stat }; }
  WA.dormantLadder = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    LADDER: LADDER.slice(), stateOf: stateOf, project: project, mark: mark, buildBlock: buildBlock, view: view,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/dormant-ladder.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/dormant-ladder 已加载（' + VERSION + '）');
})();