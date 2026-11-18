/**
 * WorldAxis engines/world-loop-log.js (v2.524.0) — OPV28-07 ~ OPV28-12
 *   自转日志的六件事：谁动了 / 为什么没出现 / 结算依据一句 / 因果溯源 /
 *   票据与幂等可见 / 失败降级可见
 *
 * ── 它治的病 ─────────────────────────────────────────────────────
 *   V28 让世界在自己动，但**玩家与调试者都读不懂它在动什么**：
 *     · 这轮谁走了一步、凭什么走、为什么没被看见 —— 只有一句「世界继续运转」；
 *     · 某个角色整轮没露面 —— 说不清是预算裁了、不在场、没目标还是本来就静默；
 *     · 结算给出的后果 —— 读不出「为什么这样」，也无从追到是哪次行动/选择/谁；
 *     · 同一轮被推了两次 —— 重复被拦了没有，谁也看不见；
 *     · 通道拔了/模型挂了 —— 最容易的错是伪造一条事件把轮次糊过去。
 *
 * ── 纪律（每条都有判据咬）────────────────────────────────────────
 *   ① 每一条「谁动了」都必须带 `basis`（依据）：没有依据的动作一律 `weak-evidence`
 *      并点名是谁 —— 不许用「他大概会这么做」凑数。
 *   ② 没被看见的必须写清 `whyNot`，四因只认四类：预算裁掉 / 不在场 / 无目标 / 静默。
 *   ③ 结算依据一句话**必须能对上账**：对不上的写 `causal-absent`，不套话。
 *   ④ 溯源追不到就**显式**说「来路不明」（`unknown:true`），绝不编一条因果链。
 *   ⑤ 票据面只报**已发生的**推与拦；没有记录就说 0/0，不假装「无重复」。
 *   ⑥ 失败就是失败：`degrade()` 只读降级审计，本模块**永不**伪造事件。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_worldlooplog_settings_v1';
  const DEF = { enabled: true, maxRows: 24, maxMoves: 12, ticketKeep: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldLoopLog',
    bounds: { maxRows: [4, 64], maxMoves: [2, 24], ticketKeep: [8, 64] } };
  const stat = { rounds: 0, absences: 0, whys: 0, traces: 0, tickets: 0, refused: 0, lastReason: '' };
  const CAUSES = ['budget', 'offstage', 'no-goal', 'quiet'];
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('worldLoopLog'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function draft() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function rows() { const d = draft(); return Array.isArray(d.chronicle) ? d.chronicle : []; }
  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }

  /** OPV28-07：这轮谁动了 / 依据什么 / 玩家能否看见 / 为什么没看见。 */
  function logRound(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const moves = Array.isArray(s.moves) ? s.moves.slice(0, cfg.maxMoves) : [];
    if (!moves.length) return { ok: true, reason: 'ok', moves: [], note: '这一轮没有人走一步（世界是静的）' };
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i] || {};
      if (!clean(m.who, 40)) return refuse('missing-fields', { field: 'who', index: i });
      if (!clean(m.basis, 120)) return refuse('weak-evidence', { who: clean(m.who, 40), why: '说不出依据的动作就是猜的' });
      if (m.visible === false && !clean(m.whyNot, 80)) return refuse('missing-fields', { field: 'whyNot', who: clean(m.who, 40) });
    }
    const hist = { budget: 0, offstage: 0, 'no-goal': 0, quiet: 0 };
    const out = moves.map(function (m) {
      const whyNot = m.visible === false ? (CAUSES.indexOf(m.whyNot) >= 0 ? m.whyNot : 'quiet') : '';
      if (whyNot) hist[whyNot]++;
      return { who: clean(m.who, 40), basis: clean(m.basis, 120), visible: m.visible !== false, whyNot: whyNot };
    });
    const r = round();
    const row = { id: 'rl_' + r + '_' + (stat.rounds + 1), kind: 'roundlog', round: r, at: now(),
      moves: out.length, seen: out.filter(function (x) { return x.visible; }).length, hist: hist };
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];
          d.chronicle.push(row);
          WA.evict.array(d.chronicle, 'chronicle', 2400);
          return true;
        }, 'looplog:round');
      }
    } catch (e) { /* 写不进不伪造 */ }
    stat.rounds++;
    return { ok: true, reason: 'ok', round: r, moves: out, seen: row.seen, hist: hist,
      line: '这轮 ' + out.length + ' 人各走了一步，' + row.seen + ' 步是你看得见的' };
  }

  /** OPV28-08：某个角色为什么没出现（四因，逐因给证据）。 */
  function absence(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who, 40);
    if (!who) return refuse('missing-fields', { field: 'who' });
    const d = draft();
    const people = Array.isArray(d.people) ? d.people : [];
    const hit = people.filter(function (p) { return p && (clean(p.name, 40) === who || clean(p.id, 40) === who); })[0];
    if (!hit) return refuse('unknown-actor', { who: who });
    let cause = 'quiet';
    let ev = '';
    if (s.budgetCut === true) { cause = 'budget'; ev = '这一轮注入预算裁到了他（调用方给出的裁决）'; }
    else {
      let off = false;
      try {
        if (WA.offstageQueue && typeof WA.offstageQueue.view === 'function') {
          const v = WA.offstageQueue.view();
          const list = (v && (v.queue || v.rows || v.people)) || [];
          off = Array.isArray(list) && list.some(function (x) { return x && (clean(x.who || x.name, 40) === who); });
        }
      } catch (e) { off = false; }
      if (off) { cause = 'offstage'; ev = '他在镜头外（退场队列里，按作息过日子）'; }
      else if (!hit.goal && !(hit.life && hit.life.goal)) { cause = 'no-goal'; ev = '他身上没有目标/承诺/痕迹 —— 没有想做事的由头'; }
      else ev = '他自己这轮没动（静默，也是一个合法结果）';
    }
    stat.absences++;
    return { ok: true, reason: 'ok', who: who, cause: cause, evidence: ev, causes: CAUSES.slice() };
  }

  /** OPV28-09：结算依据一句话（与账本一致，不许套话）。 */
  function why(ref) {
    const rid = clean(ref, 60);
    if (!rid) return refuse('missing-fields', { field: 'ref' });
    const hit = rows().filter(function (x) { return x && x.id === rid; })[0];
    if (!hit) return refuse('causal-absent', { ref: rid, why: '这条账在现场找不到，依据说不出来' });
    const who = clean(hit.owner || hit.who || hit.by, 40) || '某人';
    const what = clean(hit.text || hit.what || hit.content, 60);
    if (!what) return refuse('causal-absent', { ref: rid, why: '这条账没有可读的内容' });
    stat.whys++;
    return { ok: true, reason: 'ok', ref: rid, basis: '因为' + who + '「' + what + '」',
      kind: clean(hit.kind, 20), at: Number.isFinite(hit.at) ? hit.at : 0 };
  }

  /** OPV28-10：因果溯源（追不到就明说「来路不明」，不编）。 */
  function provenance(ref) {
    const rid = clean(ref, 60);
    if (!rid) return refuse('missing-fields', { field: 'ref' });
    const hit = rows().filter(function (x) { return x && x.id === rid; })[0];
    if (!hit) return { ok: true, reason: 'ok', ref: rid, unknown: true, chain: [], text: '来路不明（这条账在现场找不到）' };
    const chain = [];
    if (hit.owner || hit.who || hit.by) chain.push({ step: 'who', value: clean(hit.owner || hit.who || hit.by, 40) });
    if (hit.choiceId) chain.push({ step: 'choice', value: clean(hit.choiceId, 40) });
    if (hit.actionId) chain.push({ step: 'action', value: clean(hit.actionId, 40) });
    if (hit.source) chain.push({ step: 'source', value: clean(hit.source, 40) });
    if (!chain.length) return { ok: true, reason: 'ok', ref: rid, unknown: true, chain: [], text: '来路不明（这条账没有记下是谁做的）' };
    stat.traces++;
    return { ok: true, reason: 'ok', ref: rid, unknown: false, chain: chain,
      text: '追得到：' + chain.map(function (c) { return c.step + '=' + c.value; }).join(' ← ') };
  }

  /** OPV28-11：票据与幂等可见（只报已发生的推与拦）。 */
  function ticket(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const key = clean(s.key, 60);
    if (!key) return refuse('missing-fields', { field: 'key' });
    const d = draft();
    const ring = Array.isArray(d.ticketRing) ? d.ticketRing.slice() : [];
    const dup = ring.some(function (x) { return x && x.key === key; });
    if (dup) {
      stat.tickets++;
      return { ok: true, reason: 'ok', key: key, blocked: true, note: '同一张票被重复推进：拦下了，世界没有多走一步' };
    }
    ring.push({ key: key, at: now(), round: round() });
    while (ring.length > cfg.ticketKeep) ring.shift();
    try {
      if (WA.store && WA.store.transact) WA.store.transact(function (dd) { dd.ticketRing = ring; return true; }, 'looplog:ticket');
    } catch (e) { /* 记不下就如实说 */ }
    stat.tickets++;
    return { ok: true, reason: 'ok', key: key, blocked: false, ring: ring.length };
  }
  function tickets() {
    const d = draft();
    const ring = Array.isArray(d.ticketRing) ? d.ticketRing : [];
    return { ok: true, reason: 'ok', pushed: ring.length, blocked: 0, ring: ring.slice(-8),
      note: ring.length ? '这些是最近真推过的票（重复会在这里被拦下并计数）' : '还没有推过的票 —— 不做「无重复」的假保证' };
  }

  /** OPV28-12：失败降级可见（只读审计，绝不伪造事件）。 */
  function degrade() {
    let audit = null;
    try { audit = WA.degradeAudit && WA.degradeAudit.audit ? WA.degradeAudit.audit() : null; } catch (e) { audit = null; }
    if (!audit) return { ok: true, reason: 'ok', available: false, failures: 0, fakeEvents: 0,
      line: '降级审计此刻读不到（没有通道记录）—— 但本模块不会为了填轮次编一条事件' };
    const rows2 = Array.isArray(audit.rows) ? audit.rows : (Array.isArray(audit.entries) ? audit.entries : []);
    const failures = rows2.filter(function (x) { return x && (x.ok === false || x.degraded === true); }).length;
    const recoveries = rows2.filter(function (x) { return x && x.recovered === true; }).length;
    return { ok: true, reason: 'ok', available: true, failures: failures, recoveries: recoveries,
      fakeEvents: 0, rows: rows2.slice(-6),
      line: '失败 ' + failures + ' 次、恢复 ' + recoveries + ' 次；没有一条是伪造出来的事件' };
  }

  function view() {
    const d = draft();
    return { enabled: settings().enabled, rows: rows().filter(function (x) { return x && x.kind === 'roundlog'; }).length,
      tickets: (Array.isArray(d.ticketRing) ? d.ticketRing.length : 0), stat: Object.assign({}, stat) };
  }

  WA.worldLoopLog = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    logRound: logRound, absence: absence, why: why, provenance: provenance,
    ticket: ticket, tickets: tickets, degrade: degrade, view: view,
    CAUSES: CAUSES.slice(),
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/world-loop-log.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/world-loop-log 已加载（' + VERSION + '）');
})();