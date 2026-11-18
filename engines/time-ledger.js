/**
 * WorldAxis engines/time-ledger.js (v2.528.0) — EXV28-25/27/28/29/30 三种时间的账
 * 读数：storyclock.discipline()（v2.129）已有但对账弱；offline-tick 批量追平；
 *      memory-age（v2.410）只管记忆条目，世界事实没有时效。
 * 机制：三栏对读（世界钟/正文/真实）+ 离线跳跃说明 + 节令 + 期限压迫 + 旧闻过期。
 * 边界：偏差只报不改正文；不阻止离线推进，只要求「跨了多久」说得清。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.528.0';
  const LS_KEY = 'worldaxis_time_ledger_settings_v1';
  const DEF = { enabled: true, devWarnRounds: 3, staleRounds: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'timeLedger',
    bounds: { devWarnRounds: [1, 20], staleRounds: [3, 60] } };
  const stat = { reads: 0, jumps: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 60) : ''; }
  function safe(fn, dflt) { try { const v = fn(); return v === undefined || v === null ? dflt : v; } catch (e) { return dflt; } }
  /** v2.529.0 世界钟标签的唯一真源：calendar.setClock 写的就是 store.clock.label（本引擎不自留副本）。 */
  function clockLabel() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return d && d.clock && typeof d.clock.label === 'string' ? d.clock.label : '';
  }
  /** 三栏：世界钟 / 正文时间 / 真实活动。 */
  function read() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled', rows: [] };
    const world = safe(function () { return WA.clock && WA.clock.now ? String(WA.clock.now('timeLedger')) : ''; }, '');
    const worldLabel = safe(clockLabel, '');
    const story = safe(function () { return WA.storyclock && WA.storyclock.discipline ? String(WA.storyclock.discipline()) : ''; }, '');
    const real = safe(function () { return WA.playtime && WA.playtime.lastActive ? Number(WA.playtime.lastActive()) : 0; }, 0);
    stat.reads++;
    return { ok: true, rows: [
      { name: '世界钟', value: worldLabel || world || 'unknown' },
      { name: '正文时间', value: story || 'unknown' },
      { name: '真实活动', value: real ? new Date(real).toISOString() : 'unknown' }
    ], round: round() };
  }
  /** 离线跳跃说明：跨了多久、发生几件事、你错过了什么。 */
  function jump(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const rounds = Number.isFinite(s.rounds) ? Math.max(0, Number(s.rounds)) : 0;
    const events = Number.isFinite(s.events) ? Math.max(0, Number(s.events)) : 0;
    const missed = Array.isArray(s.missed) ? s.missed.map(function (x) { return clean(x, 50); }).filter(Boolean) : [];
    if (!rounds) { stat.refused++; stat.lastReason = 'missing-rounds'; return { ok: false, reason: 'missing-rounds' }; }
    stat.jumps++;
    return { ok: true, reason: 'jump-noted', rounds: rounds, events: events,
      text: '你离开了约 ' + rounds + ' 轮，这期间世界走了 ' + events + ' 件事'
        + (missed.length ? '；错过了：' + missed.slice(0, 3).join('、') : '') };
  }
  /** 节令：世界钟标签是唯一真源（calendar.setClock 写的 store.clock.label 就含「第N日·时段」）。 */
  function season() {
    const label = safe(clockLabel, '');
    // v2.529.0: 此处曾读 `chrono.phase()`——chrono 没有 phase（它的 layer() 是变更层，不是时段）。
    //   时段本来就在 label 的「·」后缀里，另造一个 phase 只会多出第二份口径，故不造。
    if (!label) return { ok: true, known: false, reason: 'no-calendar' };
    return { ok: true, known: true, label: label };
  }
  /** 期限压迫：agenda.upcoming 里最近的一条。 */
  function deadline() {
    const rows = safe(function () { return WA.agenda && WA.agenda.upcoming ? WA.agenda.upcoming({ limit: 6 }) : null; }, null);
    const list = rows && Array.isArray(rows.items) ? rows.items : (Array.isArray(rows) ? rows : []);
    const near = list.filter(function (x) { return x && Number.isFinite(x.inRounds) && x.inRounds <= 2; });
    return { ok: true, near: near, all: list.length,
      reason: near.length ? 'pressure' : (list.length ? 'later' : 'nothing') };
  }
  /** 旧闻过期：worldFacts 里超过阈值的条目不再进正文。 */
  function stale(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const limit = Number.isFinite(s.staleRounds) ? Number(s.staleRounds) : cfg.staleRounds;
    const r = round();
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const facts = Array.isArray(d.worldFacts) ? d.worldFacts : [];
    const old = facts.filter(function (f) { return f && Number.isFinite(f.round) && (r - f.round) > limit; });
    return { ok: true, staleCount: old.length, total: facts.length, limit: limit,
      items: old.slice(-3).map(function (f) { return clean(f.key, 30) + '：' + clean(f.value, 40); }) };
  }
  function deviation(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    // v2.529.0: 此处曾读 `storyclock.roundOf()` —— 该成员不存在（storyclock 只给「第N日·时段」
    //   这种绝对坐标，readLatest/parseStamp，**不给轮次映射**），于是本函数永远走「判不了」分支。
    //   轮与日单位不同，不臆造换算：改由调用方显式传 spec.storyRound，没传就如实说判不了。
    const storyRound = Number.isFinite(s.storyRound) ? Number(s.storyRound) : NaN;
    const r = round();
    if (!Number.isFinite(storyRound)) return { ok: true, known: false, reason: 'no-story-round' };
    const dev = Math.abs(r - storyRound);
    return { ok: true, known: true, deviation: dev, warn: dev > cfg.devWarnRounds,
      reason: dev > cfg.devWarnRounds ? 'drift' : 'in-sync' };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const dv = deviation();
    const dl = deadline();
    const lines = [];
    if (dv.ok && dv.known && dv.warn) lines.push('- 正文时间与世界钟差了 ' + dv.deviation + ' 轮（别把日子写飞）');
    (dl.near || []).slice(0, 2).forEach(function (x) {
      lines.push('- 快到期限：' + clean(x.title || x.name, 40) + '（还 ' + x.inRounds + ' 轮）');
    });
    return lines.length ? '[时间与期限]\n' + lines.join('\n') : '';
  }
  WA.timeLedger = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    read: read, jump: jump, season: season, deadline: deadline, stale: stale, deviation: deviation,
    buildBlock: buildBlock, stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/time-ledger.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/time-ledger 已加载（' + VERSION + '）');
})();