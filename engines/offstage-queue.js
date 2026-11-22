/**
 * WorldAxis engines/offstage-queue.js (v2.524.0) — EXV28-01/03/04/05/06 退场生活
 *
 * ── 它治什么（现场读数）──────────────────────────────────────────────
 *   backstage 的推演快照只取 8 个人（`npcBudget: 8` / `sorted.slice(0, budget||8)`），
 *   排序键是 `updatedAt`（最近更新优先）——久未被提及的人永远排在第 9 名之后，
 *   于是**永不被推演 ⇒ 永不更新 ⇒ 永远排在后面**（自锁）。
 *   结果：「他不在你眼前时也在生活」这句自述，在当前实现里没有通路。
 *
 * ── 本模块只做五件事 ─────────────────────────────────────────────────
 *   pick()     轮转选人：按**最久未被推进**（lastStepAt）取 K 人，不看 updatedAt。
 *   step()     写一步回执：actor.offstage = {lastStepAt, action, verdict, evidence}。
 *   routine()  作息落点：读 actor.schedule（owner 是 living-world 的作息网格），
 *              答「此刻他在哪、在做什么、能否被撞见」；没有作息就如实 unknown。
 *   pressure() 生计压力：钱/粮/伤/债 → 「他今天必须做什么」；不掷骰。
 *   absence()  缺席后果：他不在 ⇒ 谁吃了亏（只读投影，不改世界）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────────────
 *   1 不替场景内人物做决定（exclude 名单进入即跳过，并记 excluded）。
 *   2 不排「没有任何目标/承诺/冲突」的人（拒绝全随机生活流）。
 *   3 每轮上限 K 人（默认 3），成本闸与失败降级共用同一个口。
 *   4 不新增顶层存档键：只写 actors[id].offstage（actor 对象已有容量边界）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_offstage_queue_settings_v1';
  const DEF = { enabled: true, maxPerRound: 3, idleRounds: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'offstageQueue',
    bounds: { maxPerRound: [1, 8], idleRounds: [1, 20] } };
  const stat = { picks: 0, steps: 0, refused: 0, lastReason: '' };
  function now() { try { return WA.clock.now('offstageQueue'); } catch (e) { return Date.now(); } }
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function state() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 80) : ''; }
  function actorList() {
    const d = state();
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    return Object.keys(m).map(function (k) { return m[k]; }).filter(function (a) { return a && (a.id || a.name); });
  }
  function hasMotive(a) {
    if (!a) return false;
    if (a.goal && (a.goal.next || a.goal.text)) return true;
    if (a.intent) return true;
    if (Array.isArray(a.promises) && a.promises.length) return true;
    if (a.lastDecision) return true;
    if (a.offstage && a.offstage.next) return true;
    return false;
  }
  function idOf(a) { return String((a && (a.id || a.name)) || ''); }
  /**
   * 轮转选人。
   * @param {object} opts { exclude:[id或名], limit:number, scenePlace:string }
   * @returns {ok, picks:[{id,name,place,intent,lastStepAt,idle}], excluded}
   */
  function pick(opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts && typeof opts === 'object' ? opts : {};
    const ex = {};
    (Array.isArray(o.exclude) ? o.exclude : []).forEach(function (x) { ex[String(x)] = true; });
    const r = round();
    const cand = [];
    let excluded = 0;
    actorList().forEach(function (a) {
      const id = idOf(a);
      if (!id) return;
      if (ex[id] || ex[a.name]) { excluded++; return; }
      if (a.dead === true || a.alive === false) return;
      if (!hasMotive(a)) return;
      const off = a.offstage && typeof a.offstage === 'object' ? a.offstage : {};
      const last = Number.isFinite(off.lastStepAt) ? Number(off.lastStepAt) : 0;
      const idle = Math.max(0, r - last);
      if (idle < cfg.idleRounds) return;
      cand.push({ id: id, name: clean(a.name || id, 40), place: clean(a.location, 40),
        intent: clean(off.next || (a.goal && (a.goal.next || a.goal.text)) || a.intent, 70),
        lastStepAt: last, idle: idle });
    });
    cand.sort(function (x, y) { return (x.lastStepAt - y.lastStepAt) || (y.idle - x.idle); });
    const picks = cand.slice(0, Math.max(1, Number(o.limit) || cfg.maxPerRound));
    stat.picks++;
    return { ok: true, round: r, picks: picks, excluded: excluded, candidates: cand.length };
  }
  /**
   * 写一步回执（由推演结算或场外推进调用）。
   * @param {object} spec {id|name, action, verdict, evidence, witness, next}
   */
  function step(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.name || '').trim();
    const action = clean(s.action, 90);
    if (!id) { stat.refused++; stat.lastReason = 'missing-id'; return { ok: false, reason: 'missing-id' }; }
    if (!action) { stat.refused++; stat.lastReason = 'missing-action'; return { ok: false, reason: 'missing-action' }; }
    const VERDICTS = ['进行中', '已完成', '失败', '中断', '未定'];
    let verdict = String(s.verdict || '未定');
    if (VERDICTS.indexOf(verdict) < 0) verdict = '未定';
    // 无证据的「已完成」一律判未定（不许模型顺手宣布成功）。
    const evidence = clean(s.evidence, 90);
    if (verdict === '已完成' && !evidence) verdict = '未定';
    const at = Number.isFinite(s.at) ? Number(s.at) : now();
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.actors = d.actors || {};
          const key = d.actors[id] ? id : (function () {
            const ks = Object.keys(d.actors);
            for (let i = 0; i < ks.length; i++) {
              const a = d.actors[ks[i]];
              if (a && a.name === id) return ks[i];
            }
            return id;
          })();
          const a = d.actors[key] = d.actors[key] || { id: key, conditions: [] };
          a.offstage = a.offstage && typeof a.offstage === 'object' ? a.offstage : {};
          a.offstage.lastStepAt = round();
          a.offstage.action = action;
          a.offstage.verdict = verdict;
          a.offstage.evidence = evidence;
          a.offstage.witness = clean(s.witness, 40) || '无人看见';
          a.offstage.next = clean(s.next, 70);
          a.offstage.at = at;
          a.offstage.steps = Array.isArray(a.offstage.steps) ? a.offstage.steps : [];
          a.offstage.steps.push({ action: action, verdict: verdict, evidence: evidence, at: at, round: round() });
          if (a.offstage.steps.length > 12) a.offstage.steps.shift();
          return true;
        }, 'offstageQueue:step');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.steps++;
    return { ok: true, reason: wrote ? 'stepped' : 'stepped-no-store', id: id, verdict: verdict, evidence: evidence };
  }
  /** 作息落点（owner 是 living-world；没有就如实 unknown）。 */
  function routine(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.name || '').trim();
    if (!id) return { ok: false, reason: 'missing-id' };
    const a = actorList().filter(function (x) { return idOf(x) === id || x.name === id; })[0];
    if (!a) return { ok: false, reason: 'actor-missing' };
    const sch = a.schedule && typeof a.schedule === 'object' ? a.schedule : null;
    if (!sch) return { ok: true, known: false, place: clean(a.location, 40), doing: 'unknown', reason: 'no-schedule' };
    const slot = String(s.slot || '').trim() || String(sch.slot || '');
    const row = slot && sch[slot] ? sch[slot] : null;
    if (!row) return { ok: true, known: false, place: clean(a.location, 40), doing: 'unknown', reason: 'slot-unknown' };
    return { ok: true, known: true, place: clean(row.place || a.location, 40),
      doing: clean(row.doing || row.action, 60), canBeMet: row.public !== false };
  }
  /** 生计压力：从钱/粮/伤/债推「今天必须做什么」，不掷骰。 */
  function pressure(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.name || '').trim();
    const a = actorList().filter(function (x) { return idOf(x) === id || x.name === id; })[0];
    if (!a) return { ok: false, reason: 'actor-missing' };
    const bag = a.belongings && typeof a.belongings === 'object' ? a.belongings : {};
    const money = Number(bag.money || bag.coin || 0);
    const food = Number(bag.food || bag.ration || 0);
    const hurt = Number(a.body && a.body.injury ? a.body.injury : (a.injury || 0));
    const debt = Array.isArray(a.debts) ? a.debts.length : 0;
    const needs = [];
    if (food <= 0) needs.push('找吃的');
    if (money <= 0) needs.push('找钱');
    if (hurt >= 60) needs.push('治伤');
    if (debt > 0) needs.push('还债');
    return { ok: true, id: id, needs: needs, urgent: needs.length > 0,
      reason: needs.length ? 'pressure' : 'stable' };
  }
  /** 缺席后果（只读投影）：他不在，谁吃了亏。 */
  function absence(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.name || '').trim();
    const a = actorList().filter(function (x) { return idOf(x) === id || x.name === id; })[0];
    if (!a) return { ok: false, reason: 'actor-missing' };
    const off = a.offstage && typeof a.offstage === 'object' ? a.offstage : {};
    const idle = Math.max(0, round() - (Number.isFinite(off.lastStepAt) ? off.lastStepAt : 0));
    const role = clean(a.occupation || a.role, 30);
    return { ok: true, id: id, idleRounds: idle, role: role,
      whoPays: idle >= 3 && role ? ('因为他不在，' + role + '那一摊没人接') : '',
      reason: idle >= 3 ? 'absent-cost' : 'not-yet' };
  }
  /** 久别再遇：他变了什么（复用 living-world 的发酵史，没有就如实 only-known）。 */
  function reunion(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.name || '').trim();
    const a = actorList().filter(function (x) { return idOf(x) === id || x.name === id; })[0];
    if (!a) return { ok: false, reason: 'actor-missing' };
    const off = a.offstage && typeof a.offstage === 'object' ? a.offstage : {};
    const steps = Array.isArray(off.steps) ? off.steps : [];
    const changed = steps.slice(-3).map(function (x) { return clean(x.action, 60); }).filter(Boolean);
    return { ok: true, id: id, changed: changed,
      known: changed.length > 0, reason: changed.length ? 'changed' : 'no-record' };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxPerRound: cfg.maxPerRound, idleRounds: cfg.idleRounds,
      round: round(), picks: pick({ limit: cfg.maxPerRound }).picks || [], stat: stat };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = pick({ limit: cfg.maxPerRound });
    if (!r.ok || !r.picks.length) return '';
    const lines = r.picks.map(function (p) {
      return '- ' + p.name + (p.place ? '（' + p.place + '）' : '') + '：' + (p.intent || '该走一步了')
        + '｜已 ' + p.idle + ' 轮未推进';
    });
    return '[退场人物·该他走一步]\n' + lines.join('\n');
  }
  WA.offstageQueue = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    pick: pick, step: step, routine: routine, pressure: pressure, absence: absence, reunion: reunion,
    view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/offstage-queue.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/offstage-queue 已加载（' + VERSION + '）');
})();