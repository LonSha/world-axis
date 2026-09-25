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
  const stat = { ticks: 0, changed: 0, blocked: 0, lastAt: 0, lastReason: '',
    // v2.85.0 B1：两个「本可以推演却没推演」的原因必须分开计数——
    //   名额不足（skipped）与协作未被回应（unreciprocated）是两件事：
    //   前者是资源约束，后者是**依据不足**。合成一个数就再也答不出该加名额还是该等对方。
    skipped: 0, unreciprocated: 0 };

  function clean(v, max) { return WA.inputGuard.text(v, max || 80); }
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
  /**
   * v2.85.0 B1：协作必须**对称持有**。
   *   kind='cooperation' 的承诺只有在对方也持有一行指向此人的同事项合作时才成立。
   *   单方面宣布的合作不是合作——否则「我说了我们要一起做」就等价于「我们一起做」。
   *   注意：本函数**只读**，不修改任何一方（拒收/降级不得顺手删掉事实）。
   */
  function reciprocated(draft, person, cmt) {
    const other = (draft.people || {})[personId(cmt.target)];
    const lf = other && other.life;
    if (!lf || !Array.isArray(lf.commitments)) return false;
    const me = clean(person.name, 60) || String(person.id || '').replace(/^p_/, '');
    return lf.commitments.some(function (x) {
      return x && x.status === 'active' && x.kind === 'cooperation'
        && clean(x.target, 60) === me && clean(x.text, 80) === clean(cmt.text, 80);
    });
  }
  function commitmentAction(item, facts) {
    if (facts && Array.isArray(facts.fulfilledIds) && facts.fulfilledIds.indexOf(item.id) >= 0) return 'keep';
    if (item.kind === 'boundary') return 'hide';
    return item.due && facts && facts.now && facts.now > item.due ? 'pause' : 'keep';
  }
  /**
   * v2.86.0 A3（事实唯一写者）：本函数**不再自己造人**，改为委托 registry.ensurePerson。
   *
   * 修前 `draft.people[id] || (draft.people[id] = {...})` 是一个「方便」的取值器，
   *   顺手把自己变成了创建者：写一条目标/承诺/日程就凭空多出一个人（占 cap 48 名额、
   *   把真在场上的人物挤出去），且条目上没有留下任何痕迹。
   *
   * 现口径：创建统一走 registry（唯一写者 + createdVia 标签）。
   *   合成宿主桩里没有 registry，此时保留**等价兜底**并打 `life:fallback` ——
   *   于是「产品运行时到底走没走唯一写者」可以由专锁断言，而不是靠读代码相信。
   */
  function person(draft, name) {
    const id = personId(name);
    if (!id) return null;
    const reg = WA.registry;
    if (reg && typeof reg.ensurePerson === 'function') {
      const r = reg.ensurePerson(draft, id, clean(name, 60), 'life');
      return r && r.row ? r.row : null;
    }
    return draft.people[id] || (draft.people[id] = { id: id, name: clean(name, 60), knowledge: {}, createdVia: 'life:fallback', createdAt: clockNow('life') });
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
      if (life.schedule.some(function (x) { return x.status === 'active' && start < x.end && end > x.start; })) { out = { ok: false, reason: 'time-conflict' }; return false; }
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
    const f = facts || {}; let changed = 0, skipped = 0, unrecip = 0;
    WA.store.transact(function (draft) {
      // v2.85.0 B1：名单不再按插入序截断。旧口径 `Object.keys(...).slice(0, maxPeople)`
      //   让「谁被推演」取决于谁先进场——有依据的人插在第 5 位之后就永远轮不到。
      //   现口径：**有依据者优先**（依据条数多者先，同依据按下标稳定），无依据者不占名额。
      const basisOf = function (id) {
        const p0 = draft.people[id], lf = p0 && p0.life;
        if (!lf || typeof lf !== 'object') return 0;
        let n = 0;
        if (Array.isArray(lf.goals) && lf.goals.some(function (x) { return x && x.status === 'active'; })) n++;
        if (Array.isArray(lf.commitments) && lf.commitments.some(function (x) { return x && x.status === 'active'; })) n++;
        if (Array.isArray(lf.schedule) && lf.schedule.some(function (x) { return x && x.status === 'active'; })) n++;
        return n;
      };
      const ranked = Object.keys(draft.people || {}).map(function (id, i) {
        return { id: id, n: basisOf(id), i: i };
      }).filter(function (r) { return r.n > 0; })
        .sort(function (a, b) { return (b.n - a.n) || (a.i - b.i); });
      // 名额不足时**必须留痕**：静默少推演一个人，与「他本来没事可做」在读数上长得一样。
      skipped = Math.max(0, ranked.length - cfg.maxPeople);
      ranked.slice(0, cfg.maxPeople).forEach(function (row) {
        const id = row.id;
        const p = draft.people[id]; if (!p || !p.life) return;
        const life = ensureLife(p);
        const active = life.schedule.filter(function (x) { return x.status === 'active' && f.now >= x.start && f.now < x.end; })[0];
        const goal = life.goals.filter(function (x) { return x.status === 'active'; })[0];
        const commitment = life.commitments.filter(function (x) { return x.status === 'active'; })[0];
        const fulfilled = commitment && Array.isArray(f.fulfilledIds) && f.fulfilledIds.indexOf(commitment.id) >= 0;
        const supplied = f.decision && f.decision.action ? f.decision : null;
        // v2.85.0 B1：单向协作**不得**被当作可依承诺。
        //   位置刻意放在「有目标的人走目标路径」之后：协作被回应与否，不该拦下一个本来
        //   就有自己目标的人；它只影响「除了这条协作之外别无依据」的那种人。
        const lone = !!(commitment && commitment.kind === 'cooperation' && !reciprocated(draft, p, commitment));
        if (lone) unrecip++;
        let decision = fulfilled ? { action: 'keep', reason: 'commitment-fulfilled' }
          : (supplied ? supplied
            : (goal ? decide(goal, p, f)
              : (lone ? { action: 'wait', reason: 'unreciprocated' }
                : (commitment ? { action: commitmentAction(commitment, f), reason: 'commitment' }
                  : (active ? { action: 'keep', reason: 'schedule' } : null)))));
        if (!decision) return;
        if (fulfilled) commitment.status = 'kept';
        life.lastDecision = { action: decision.action, reason: decision.reason, goal: goal ? goal.id : '', at: f.now || stat.lastAt };
        if (decision.action === 'advance' && goal && !goal.next) goal.next = '推进中';
        // v2.61.0: tick 改写了当前意图（观测面 `observe.slice` 的输入），却不算「人物被更新」——
        //   于是本轮真正在行动的人物，在淘汰排序上仍是「最旧」。
        p.intent = decision.action === 'wait' ? '等待条件' : decision.reason; p.updatedAt = f.now || stat.lastAt; changed++;
      });
    }, 'life:tick');
    stat.ticks++; stat.changed += changed; if (!changed) stat.blocked++;
    stat.skipped += skipped; stat.unreciprocated += unrecip;
    stat.lastReason = changed ? 'updated' : 'nothing-to-do';
    // skipped 与 unreciprocated 进返回值：调用方要能当场看见「没被推演」的原因，
    //   而不是只能事后从 stat 里猜。
    return { ok: true, changed: changed, reason: stat.lastReason, skipped: skipped, unreciprocated: unrecip };
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
