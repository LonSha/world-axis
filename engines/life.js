/**
 * WorldAxis engines/life.js (v2.52.0)
 * 人物生活：持续目标、关系承诺、基础日程、条件式行动。
 *
 * 设计边界：
 *   1 总开关默认关闭。关闭时不结算、不注入，也不凭空补写人物履历。
 *   2 状态挂在 people.<id>.life，绑定稳定人物 id，不使用姓名槽或模块内存。
 *   3 只推进已有依据：人物已有目标、承诺、日程，或调用方显式传入事实。
 *   4 条件不足时选择等待，不把每轮都必须行动伪装成自主性。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_life_settings_v1';
  const DEF = { enabled: false, maxPeople: 4, maxItems: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'life', bounds: { maxPeople: [1, 8], maxItems: [1, 4] } };
  const COMMITMENTS = ['promise', 'debt', 'secret', 'cooperation', 'boundary'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { ticks: 0, changed: 0, blocked: 0, lastAt: 0, lastReason: '' };

  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 80); }
  function personId(name) { const n = clean(name, 60); return n ? 'p_' + n : ''; }
  function ensureLife(person) {
    if (!person.life || typeof person.life !== 'object' || Array.isArray(person.life)) person.life = { goals: [], commitments: [], schedule: [], lastDecision: null };
    ['goals', 'commitments', 'schedule'].forEach(function (k) { if (!Array.isArray(person.life[k])) person.life[k] = []; });
    return person.life;
  }
  function relationTo(person, target) {
    const rels = person && person.profile && Array.isArray(person.profile.relations) ? person.profile.relations : [];
    return rels.filter(function (r) { return r && clean(r.target, 60) === clean(target, 60); }).pop() || null;
  }
  function decide(goal, person, facts) {
    const f = facts || {};
    const rel = relationTo(person, f.with || '');
    const trust = rel && isFinite(Number(rel.trust)) ? Number(rel.trust) : null;
    const vigilance = rel && isFinite(Number(rel.vigilance)) ? Number(rel.vigilance) : null;
    if (f.crisis) return { action: 'pause', reason: 'crisis' };
    if (f.need && !f.resource) return { action: 'seek', reason: 'resource-missing' };
    if (vigilance !== null && vigilance >= 70) return { action: 'hide', reason: 'high-vigilance' };
    if (trust !== null && trust >= 55 && f.with) return { action: 'ask', reason: 'trusted-person' };
    if (!goal.prerequisite || f.ready === true) return { action: 'advance', reason: 'ready' };
    return { action: 'wait', reason: 'prerequisite-open' };
  }
  function commitmentAction(item, facts) {
    if (facts && Array.isArray(facts.fulfilledIds) && facts.fulfilledIds.indexOf(item.id) >= 0) return 'keep';
    if (item.kind === 'boundary') return 'hide';
    return item.due && facts && facts.now && facts.now > item.due ? 'pause' : 'keep';
  }
  function person(draft, name) {
    const id = personId(name);
    return draft.people[id] || (draft.people[id] = { id: id, name: clean(name, 60), knowledge: {} });
  }

  function addGoal(name, goal) {
    if (!personId(name)) return { ok: false, reason: 'missing-person' };
    const text = clean(goal && goal.text, 80);
    if (!text) return { ok: false, reason: 'missing-text' };
    let out = null;
    WA.store.transact(function (draft) {
      const p = person(draft, name), life = ensureLife(p);
      const row = { id: 'goal_' + clockNow('life') + '_' + life.goals.length, text: text, motive: clean(goal.motive, 40), prerequisite: clean(goal.prerequisite, 60), next: clean(goal.next, 60), obstacle: clean(goal.obstacle, 60), status: 'active', at: clockNow('life') };
      life.goals = life.goals.concat([row]).slice(-8); p.updatedAt = row.at; out = { ok: true, id: row.id };
    }, 'life:add-goal');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function addCommitment(name, item) {
    const target = clean(item && item.target, 60), text = clean(item && item.text, 80);
    if (!personId(name) || !target || !text) return { ok: false, reason: 'missing-fields' };
    if (COMMITMENTS.indexOf(item.kind) < 0) return { ok: false, reason: 'bad-kind' };
    let out = null;
    WA.store.transact(function (draft) {
      const p = person(draft, name), life = ensureLife(p);
      const row = { id: 'cmt_' + clockNow('life') + '_' + life.commitments.length, kind: item.kind, target: target, text: text, due: isFinite(Number(item.due)) ? Number(item.due) : 0, status: 'active', at: clockNow('life') };
      // v2.61.0: 与 addGoal 同规格——本文件写了 updatedAt 的只有 addGoal，本条漏掉，
      //   于是同一个人「有承诺」反而比「有目标」更早被淘汰（同一文件内自相矛盾）。
      life.commitments = life.commitments.concat([row]).slice(-12); p.updatedAt = row.at; out = { ok: true, id: row.id };
    }, 'life:add-commitment');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function addSchedule(name, item) {
    const activity = clean(item && item.activity, 40), start = Number(item && item.start), end = Number(item && item.end);
    if (!personId(name) || !activity) return { ok: false, reason: 'missing-fields' };
    if (!isFinite(start) || !isFinite(end) || end <= start) return { ok: false, reason: 'bad-time' };
    let out = null;
    WA.store.transact(function (draft) {
      const p = person(draft, name), life = ensureLife(p);
      if (life.schedule.some(function (x) { return x.status === 'active' && start < x.end && end > x.start; })) { out = { ok: false, reason: 'time-conflict' }; return; }
      const row = { id: 'sch_' + clockNow('life') + '_' + life.schedule.length, activity: activity, location: clean(item.location, 40), start: start, end: end, status: 'active' };
      // v2.61.0: 同 addCommitment——日程是「人物在做什么」，且日程自带 start/end（未来时刻），
      //   恰是**最该留在场上**的那类人物；缺 updatedAt 会让它最先被挤出。
      life.schedule = life.schedule.concat([row]).slice(-12); p.updatedAt = clockNow('life'); out = { ok: true, id: row.id };
    }, 'life:add-schedule');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function tick(facts) {
    const cfg = settings(); stat.lastAt = clockNow('life');
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }
    const f = facts || {}; let changed = 0;
    WA.store.transact(function (draft) {
      Object.keys(draft.people || {}).slice(0, cfg.maxPeople).forEach(function (id) {
        const p = draft.people[id]; if (!p || !p.life) return;
        const life = ensureLife(p);
        const active = life.schedule.filter(function (x) { return x.status === 'active' && f.now >= x.start && f.now < x.end; })[0];
        const goal = life.goals.filter(function (x) { return x.status === 'active'; })[0];
        const commitment = life.commitments.filter(function (x) { return x.status === 'active'; })[0];
        const fulfilled = commitment && Array.isArray(f.fulfilledIds) && f.fulfilledIds.indexOf(commitment.id) >= 0;
        const supplied = f.decision && f.decision.action ? f.decision : null;
        let decision = fulfilled ? { action: 'keep', reason: 'commitment-fulfilled' } : (supplied ? supplied : (goal ? decide(goal, p, f) : (commitment ? { action: commitmentAction(commitment, f), reason: 'commitment' } : (active ? { action: 'keep', reason: 'schedule' } : null))));
        if (!decision) return;
        if (fulfilled) commitment.status = 'kept';
        life.lastDecision = { action: decision.action, reason: decision.reason, goal: goal ? goal.id : '', at: f.now || stat.lastAt };
        if (decision.action === 'advance' && goal && !goal.next) goal.next = '推进中';
        // v2.61.0: tick 改写了当前意图（观测面 `observe.slice` 的输入），却不算「人物被更新」——
        //   于是本轮真正在行动的人物，在淘汰排序上仍是「最旧」。
        p.intent = decision.action === 'wait' ? '等待条件' : decision.reason; p.updatedAt = f.now || stat.lastAt; changed++;
      });
    }, 'life:tick');
    stat.ticks++; stat.changed += changed; if (!changed) stat.blocked++; stat.lastReason = changed ? 'updated' : 'nothing-to-do';
    return { ok: true, changed: changed, reason: stat.lastReason };
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    Object.values((WA.store.get() || {}).people || {}).filter(function (p) { return p && p.life; }).slice(0, cfg.maxPeople).forEach(function (p) {
      const goals = (p.life.goals || []).filter(function (x) { return x.status === 'active'; }).slice(0, cfg.maxItems);
      const cs = (p.life.commitments || []).filter(function (x) { return x.status === 'active'; }).slice(0, cfg.maxItems);
      if (!goals.length && !cs.length && !p.life.lastDecision) return;
      lines.push(p.name + '：' + goals.map(function (x) { return '目标「' + x.text + '」'; }).concat(cs.map(function (x) { return x.kind + '「' + x.text + '」'; })).join('；') + (p.life.lastDecision ? '；当前选择=' + p.life.lastDecision.action : ''));
    });
    return lines.length ? '[人物生活]\n' + lines.join('\n') + '\n只把这些当作人物的既有动机与安排；条件不足时人物可以等待，不得据此编造新的履历。' : '';
  }

  WA.life = {
    ACTIONS: ['wait', 'advance', 'ask', 'hide', 'seek', 'pause', 'keep'], COMMITMENTS: COMMITMENTS,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addGoal: addGoal, addCommitment: addCommitment, addSchedule: addSchedule, tick: tick, decide: decide, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
})();
