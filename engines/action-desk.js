/**
 * WorldAxis engines/action-desk.js (v2.231.0) — OP-1 场景行动桌
 *
 * ── 它治什么（现场读数）────────────────────────────────────────────
 *   本仓已有大量可做之事，但**玩家要先知道引擎名才安排得动**：
 *     · 研究要 `research.open → supply → advance`（`supply` 的料从
 *       `people[p_*].resources` 扣，`advance` 每阶段按总量摊扣、末阶段结清）；
 *     · 共同生活要 `family.createUnit → addMember → assignCare/transferCare`；
 *     · 生产要 `production.open → staff → resupply → advance`；
 *     · 训练/装备要 `training.can` / `gear.canUse` 先问过才知道行不行。
 *   这些写口都在，**但没有一处把「此刻这个人、在这个地点，能做什么」摆出来**：
 *   面板只有 training/gear 的零散操作，research/family 在 `ui/panel.js` 里
 *   经定向检索**没有任何对应玩家链**（计划 OP-1 原文：玩家不应该先知道引擎名
 *   才能安排一次研究或家庭支出）。于是「机制都在，玩不到」。
 *
 * ── 本模块落点（只读聚合 + 路由执行，不新增第二套状态）──────────────
 *   · board({person, place})  —— 纯读。按当前人物/地点聚合各 owner 的现状，
 *     逐条给 `ready`（可执行）/ `prepare`（需准备，附所缺）/ `blocked`（不可执行，
 *     附原因）。**一行都不写**（与 agenda 同口径：只读聚合不新增第二套状态）。
 *   · plan(actionId, opts)   —— 写口，但**只是路由**：按 actionId 前缀把调用
 *     转给既有 owner 的写口（research.supply / family.assignCare / …）。
 *     本模块**自己不写任何世界键**，事务与幂等一律由被调用的 owner 负责。
 *   · sources()              —— 各源的在场性与条目数；缺席如实报，不静默丢。
 *   · diagnose() / stat()
 *
 * ── 边界（全是否定式，逐条来自计划 OP-1 原文）──────────────────────
 *   1 默认关（enabled:false）。
 *   2 board() **只读**：不改任何来源模块状态、不改存档、不写 stat 之外的持久态。
 *   3 **不建万能写状态解释器**：plan() 只认下列具名 actionId，未知前缀一律拒收
 *     `unknown-action`（宁可拒收也不猜一个 owner 去写）。
 *   4 未知人物/未登记地点保持未知 —— 不凭空建人（与 act.add 否定式 ② 同规）。
 *   5 关闭某 owner（如 research.enabled=false）时，该组**不出现残影**：
 *     整组标 `off`（面板据此不渲染操作），但**不阻断**其它组。
 *   6 玩家操作与 NPC 自主提案权限分开：本模块只服务玩家显式调用，
 *     不接 agency/monologue 的自主链（那是 NPC 侧，见 OP-7）。
 *   7 不重复 owner 的判据：每条的 ready/prepare/blocked **由 owner 自己的读口
 *     决定**（research.view 算缺料、production.open 算资质），本模块只做归拢与展示。
 *   8 不新增守卫/审计面：本模块是玩家机制，不是治理设施。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_action_desk_settings_v1';
  const DEF = { enabled: false, maxRows: 32, maxPerGroup: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'actionDesk',
    bounds: { maxRows: [4, 96], maxPerGroup: [1, 24] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 三档状态。**闭合集合**：面板与测试都按它判档，不接受自由文本。 */
  const STATES = ['ready', 'prepare', 'blocked'];
  /** 行动组（= owner 家族）。顺序即面板渲染顺序。 */
  const KINDS = ['research', 'family', 'production', 'training', 'gear', 'travel'];
  /** 具名行动 id 前缀 → 目标 owner 写口。未知前缀一律拒收（边界 3）。 */
  const ROUTES = {
    'research.supply': function (o) { return WA.research.supply(o.projectId, o.who, o.material, o.amount); },
    'research.advance': function (o) { return WA.research.advance(o.projectId, { evidence: o.evidence }); },
    'research.disseminate': function (o) { return WA.research.disseminate(o.projectId, o.scope, o.to); },
    'research.abandon': function (o) { return WA.research.abandon(o.projectId); },
    'family.contribute': function (o) { return WA.family.contribute(o.unitId, o.who, o.material, o.amount); },
    'family.spend': function (o) { return WA.family.spend(o.unitId, o.to, o.material, o.amount); },
    'family.assignCare': function (o) { return WA.family.assignCare(o.unitId, o.who, o.ward, o.notes); },
    'family.transferCare': function (o) { return WA.family.transferCare(o.unitId, o.ward, o.who, o.reason); },
    'family.inherit': function (o) { return WA.family.inherit(o.unitId, o.deceased, o.heirs, o.event); },
    'production.open': function (o) { return WA.production.open({ recipe: o.recipe, by: o.who, qty: o.qty, days: o.days, facility: o.facility, place: o.place }, { label: o.label }); },
    'production.staff': function (o) { return WA.production.staff(o.orderId, o.who, { shift: o.shift }); },
    'production.advance': function (o) { return WA.production.advance(o.orderId, { days: o.days }); },
    'training.practice': function (o) { return WA.training.practice(o.who, o.ability, { mode: o.mode }); },
    'gear.use': function (o) { return WA.gear.use(o.itemId, { by: o.who, note: o.note }); },
    'method.execute': function (o) { return WA.actionMethods.execute(o.taskId, o.who, o.methodId, o); },
    'schedule.claim': function (o) { return WA.laborSchedule.claim(o); },
    'schedule.transfer': function (o) { return WA.laborSchedule.transfer(o.bookingId, o.to); },
    'motive.arbitrate': function (o) { return WA.motiveArbitration.decide(o.person, o.candidates, o.facts); },
    'pathEcho.realize': function (o) { return WA.pathEcho.realizeOutcome(o.personId, o.decisionId, o.actualOutcome, o.knownFacts); },
    'lineage.teach': function (o) { return WA.techLineage.teach(o.traditionId, o.master, o.apprentice); },
    'lineage.confirmVariant': function (o) { return WA.techLineage.confirmVariant(o.traditionId, o.variantId, o.envContext); },
    'familyOps.gap': function (o) { return WA.familyOps.handleGap(o.unitId, o.gapType, o.solution, o); },
    'familyOps.inherit': function (o) { return WA.familyOps.inheritRatio(o.unitId, o.deceased, o.shares, o); },
    'travel.move': function (o) { return WA.act.add(o.who, { kind: 'move', goalId: o.goalId, from: o.from, to: o.to, place: o.place, text: o.text }); }
  };

  const stat = { boards: 0, planned: 0, refused: 0, lastReason: '', faults: {}, byKind: {} };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.refused++; stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function knownPerson(who) { const s = state(); return !!(s.people && s.people['p_' + who]); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }

  /** 逐源采集的在场性（缺席如实报，不静默当空）。 */
  const SOURCE_NS = { research: 'research', family: 'family', production: 'production', training: 'training', gear: 'gear' };
  function srcOk(kind) {
    const ns = SOURCE_NS[kind];
    return !!(ns && WA[ns] && typeof WA[ns] === 'object');
  }
  /**
   * 采集器统一返回：{ kind, on, rows:[...], note }
   *   on=false ⇒ 该 owner 未启用/未装载；面板据此**不渲染该组的操作**（边界 5）。
   *   任何采集器抛错都只影响自己这一组 —— 不折成空表（折叠之后「读不出来」
   *   与「真没事」逐字同形，玩家会照着空表做决定；与 agenda v2.205.0 同规）。
   */
  function collect(kind, fn) {
    const out = { kind: kind, on: false, rows: [], note: '' };
    if (!srcOk(kind)) { out.note = 'module-missing'; return out; }
    try {
      const cfg = (WA[SOURCE_NS[kind]] && typeof WA[SOURCE_NS[kind]].getSettings === 'function') ? WA[SOURCE_NS[kind]].getSettings() : null;
      out.on = !!(cfg && cfg.enabled);
      if (!out.on) { out.note = 'owner-disabled'; return out; }
      fn(out);
    } catch (e) { out.note = 'read-failed'; out.rows = []; }
    return out;
  }
  function row(kind, id, label, state2, why, extra) {
    return Object.assign({ kind: kind, id: id, label: label, state: state2,
      why: clean(why, 120), owner: kind }, extra || {});
  }

  // ── 研究：立项中的项目 → 供料 / 推进（缺什么列什么，不改一行）────────
  function fromResearch(cfg, who) {
    const list = (typeof WA.research.list === 'function') ? (WA.research.list() || []) : [];
    const rows = [];
    list.slice(0, cfg.maxPerGroup).forEach(function (p) {
      if (!p || !p.id) return;
      if (['confirmed', 'failed', 'abandoned'].indexOf(p.status) >= 0) {
        rows.push(row('research', 'research.view:' + p.id, '成果「' + clean(p.result, 20) + '」已' + p.status,
          'blocked', '项目已终结', { projectId: p.id, status: p.status, next: '如需继续，另立新项目' }));
        return;
      }
      const v = (typeof WA.research.view === 'function') ? WA.research.view(p.id) : null;
      if (!v || !v.ok) {
        rows.push(row('research', 'research.view:' + p.id, '项目 ' + p.id, 'blocked', '读不到项目详情', { projectId: p.id }));
        return;
      }
      // 缺料判据**由 owner 的数据算**：materials 总量按阶段摊，末阶段结清（与 advance 同口径）。
      const phase = num(v.phase) || 0, phases = Math.max(1, num(v.phases) || 1);
      const short = [];
      Object.keys(v.materials || {}).forEach(function (k) {
        const total = num(v.materials[k]) || 0;
        const spent = num((v.consumed || {})[k]) || 0;
        const target = (phase + 1 >= phases) ? total : total * (phase + 1) / phases;
        const per = Math.max(0, target - spent);
        const have = num((v.reserve || {})[k]) || 0;
        if (have < per) short.push({ material: k, need: per, have: have });
      });
      if (short.length) {
        const s0 = short[0];
        rows.push(row('research', 'research.supply:' + p.id, '为「' + clean(v.result, 20) + '」供料',
          'prepare', '缺 ' + s0.material + '：需 ' + s0.need + '，池中 ' + s0.have,
          { projectId: p.id, need: short, next: '从' + (who || v.by) + '的资源面供料' }));
      } else {
        rows.push(row('research', 'research.advance:' + p.id, '推进「' + clean(v.result, 20) + '」第 ' + (phase + 1) + '/' + phases + ' 阶段',
          'ready', v.prerequisites && v.prerequisites.length ? ('需确认前置：' + v.prerequisites.join('、')) : '料已备齐',
          { projectId: p.id, prerequisites: (v.prerequisites || []).slice(), evidence: (v.evidence || []).slice(), next: '确认后推进' }));
      }
    });
    return rows;
  }

  // ── 共同生活：单位 → 出资 / 照护交接（活跃照护行就是可转交对象）──────
  function fromFamily(cfg, who) {
    const list = (typeof WA.family.list === 'function') ? (WA.family.list() || []) : [];
    const rows = [];
    list.slice(0, cfg.maxPerGroup).forEach(function (u) {
      if (!u || !u.id) return;
      const v = (typeof WA.family.view === 'function') ? WA.family.view(u.id) : null;
      if (!v || !v.ok) { rows.push(row('family', 'family.view:' + u.id, u.name || u.id, 'blocked', '读不到单位详情', { unitId: u.id })); return; }
      const mine = (v.members || []).filter(function (m) { return m.who === who; })[0];
      const activeCare = (v.care || []).filter(function (c) { return c.active; });
      if (activeCare.length) {
        activeCare.slice(0, 2).forEach(function (c) {
          const canTake = (c.caregiver === who) && !mine ? false : true;
          rows.push(row('family', 'family.transferCare:' + u.id + ':' + c.ward,
            '转交「' + c.ward + '」的照护（现由 ' + c.caregiver + ' 负责）',
            canTake ? 'ready' : 'blocked',
            canTake ? '本人可接手' : '本人不是该单位成员',
            { unitId: u.id, ward: c.ward, caregiver: c.caregiver, next: '转交后负责人改变' }));
        });
      }
      rows.push(row('family', 'family.contribute:' + u.id, '为「' + clean(v.name, 20) + '」出资',
        'ready', '共同池现有 ' + Object.keys(v.treasury || {}).length + ' 类物资',
        { unitId: u.id, treasury: Object.assign({}, v.treasury), next: '从本人资源面转进共同池' }));
    });
    return rows;
  }

  // ── 生产：工单 → 排班 / 推进（资质与缺料由 owner 判）────────────────
  function fromProduction(cfg, who) {
    const list = (typeof WA.production.list === 'function') ? (WA.production.list() || []) : [];
    const rows = [];
    list.slice(0, cfg.maxPerGroup).forEach(function (j) {
      if (!j || !j.id) return;
      if (j.status === 'paused') {
        rows.push(row('production', 'production.advance:' + j.id, '继续工单 ' + clean(j.recipe, 20) + '（已暂停）',
          'ready', '暂停中，可续作', { orderId: j.id, next: '按工期续推' }));
      } else if (j.status === 'running') {
        const needMore = (num(j.done) || 0) < (num(j.days) || 0);
        rows.push(row('production', 'production.advance:' + j.id, '推进 ' + clean(j.recipe, 20) + '（' + (num(j.done) || 0) + '/' + (num(j.days) || 1) + ' 天）',
          needMore ? 'ready' : 'blocked', needMore ? '可按工期推进' : '工期已满，待交付',
          { orderId: j.id, next: needMore ? '推进一步' : '交付' }));
      } else {
        rows.push(row('production', 'production.view:' + j.id, '工单 ' + clean(j.recipe, 20) + ' 已' + j.status,
          'blocked', '非在产状态', { orderId: j.id, status: j.status }));
      }
    });
    return rows;
  }

  // ── 能力：能做什么（training.can 是 owner 的读口）──────────────────
  function fromTraining(cfg, who) {
    const rows = [];
    if (typeof WA.training.abilitiesView !== 'function') return rows;
    const av = WA.training.abilitiesView() || [];
    av.slice(0, cfg.maxPerGroup).forEach(function (a) {
      if (!a || !a.name) return;
      const can = (typeof WA.training.can === 'function') ? WA.training.can(who, a.name, {}) : null;
      rows.push(row('training', 'training.practice:' + a.name,
        '练习「' + clean(a.name, 20) + '」',
        (can && can.ok) ? 'ready' : 'prepare',
        (can && can.ok) ? '已具备条件' : ('尚不具备：' + String((can && can.reason) || 'unknown')),
        { ability: a.name, next: can && can.ok ? '累积进度' : '先补前置' }));
    });
    return rows;
  }

  // ── 物件：手上有什么能用（gear.canUse 是 owner 的读口）─────────────
  function fromGear(cfg, who) {
    const rows = [];
    const list = (typeof WA.gear.list === 'function') ? (WA.gear.list(who, {}) || []) : [];
    list.slice(0, cfg.maxPerGroup).forEach(function (it) {
      if (!it || !it.id) return;
      const can = (typeof WA.gear.canUse === 'function') ? WA.gear.canUse(it.id, who) : null;
      rows.push(row('gear', 'gear.use:' + it.id,
        '使用「' + clean(it.name || it.label || it.id, 20) + '」',
        (can && can.ok) ? 'ready' : 'blocked',
        (can && can.ok) ? '本人持有可用' : ('不可用：' + String((can && can.reason) || 'unknown')),
        { itemId: it.id, next: can && can.ok ? '消耗一次使用' : '先取得或修理' }));
    });
    return rows;
  }

  /**
   * 行动桌（**纯读**）。按当前人物/地点把各 owner 的现状摆成三档。
   * @param {object} opts {person, place}
   */
  function board(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(o.person, 40);
    if (!who) return { ok: false, reason: 'missing-person' };
    if (!knownPerson(who)) { noteFault('unknown-person'); return { ok: false, reason: 'unknown-person', who: who }; }
    const place = clean(o.place, 40);
    const groups = [];
    let all = [];
    [['research', fromResearch], ['family', fromFamily], ['production', fromProduction],
     ['training', fromTraining], ['gear', fromGear]].forEach(function (pair) {
      const g = collect(pair[0], function (out) { out.rows = pair[1](cfg, who); });
      groups.push({ kind: g.kind, on: g.on, note: g.note, rows: g.rows.slice(0, cfg.maxPerGroup) });
      all = all.concat(g.rows);
    });
    const ready = all.filter(function (r) { return r.state === 'ready'; }).length;
    const prepare = all.filter(function (r) { return r.state === 'prepare'; }).length;
    const blocked = all.filter(function (r) { return r.state === 'blocked'; }).length;
    stat.boards++;
    stat.lastReason = 'board';
    return { ok: true, person: who, place: place, at: clockNow('actionDesk'),
      groups: groups, rows: all.slice(0, cfg.maxRows),
      counts: { ready: ready, prepare: prepare, blocked: blocked, total: all.length } };
  }

  /** 各源在场性（面板据此报缺席，不把「读不到」当「没事」）。 */
  function sources() {
    return KINDS.map(function (k) {
      if (k === 'travel') return { kind: k, ok: !!(WA.act && WA.world), note: (WA.act && WA.world) ? '' : 'module-missing' };
      const ns = SOURCE_NS[k];
      const m = WA[ns];
      let on = false, note = 'module-missing';
      if (m) { note = ''; try { const c = (typeof m.getSettings === 'function') ? m.getSettings() : null; on = !!(c && c.enabled); if (!on) note = 'owner-disabled'; } catch (e) { note = 'read-failed'; } }
      return { kind: k, ok: !!m, on: on, note: note };
    });
  }

  /**
   * 执行一次行动桌动作。**只是路由**：按 actionId 前缀转给既有 owner 写口。
   *   `actionId` 的形态是 `owner.verb:payload`（payload 按路由各自解释）。
   *   未知前缀 ⇒ `unknown-action`（边界 3：不猜一个 owner 去写）。
   */
  function plan(actionId, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const raw = String(actionId == null ? '' : actionId);
    const idx = raw.indexOf(':');
    const head = idx >= 0 ? raw.slice(0, idx) : raw;
    const key = clean(head, 40);
    const fn = ROUTES[key];
    if (!fn) { noteFault('unknown-action'); return { ok: false, reason: 'unknown-action', action: key, known: Object.keys(ROUTES) }; }
    const o = Object.assign({}, opts || {});
    // payload 里带的那一段（`research.supply:r_xxx`）优先于 opts 里的同项。
    if (idx >= 0) {
      const payload = raw.slice(idx + 1);
      if (key.indexOf('research.') === 0) o.projectId = o.projectId || payload;
      else if (key.indexOf('family.') === 0 && key.indexOf('family.transferCare') === 0) { /* unitId:ward 两段 */ }
      else if (key.indexOf('family.') === 0) o.unitId = o.unitId || payload;
      else if (key.indexOf('production.') === 0) o.orderId = o.orderId || payload;
      else if (key === 'training.practice') o.ability = o.ability || payload;
      else if (key === 'gear.use') o.itemId = o.itemId || payload;
    }
    // 研究的供料/推进需要一个「谁」：默认取项目负责人，不凭空造人。
    if (key.indexOf('research.') === 0 && !o.who && o.projectId && typeof WA.research.view === 'function') {
      const v = WA.research.view(o.projectId);
      if (v && v.ok) o.who = v.by;
    }
    let out = null;
    try { out = fn(o); } catch (e) { noteFault('route-threw'); return { ok: false, reason: 'route-threw', action: key }; }
    if (out && out.ok) { stat.planned++; stat.byKind[key] = (stat.byKind[key] || 0) + 1; stat.lastReason = key; }
    else { stat.refused++; if (out && out.reason) stat.faults[out.reason] = (stat.faults[out.reason] || 0) + 1; }
    return out || { ok: false, reason: 'owner-unavailable', action: key };
  }

  function diagnose() {
    return { ok: true, enabled: settings().enabled, sources: sources(), routes: Object.keys(ROUTES),
      stat: Object.assign({}, stat, { faults: Object.assign({}, stat.faults), byKind: Object.assign({}, stat.byKind) }) };
  }

  WA.actionDesk = {
    STATES: STATES.slice(), KINDS: KINDS.slice(), ROUTES: Object.keys(ROUTES).slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    board: board,
    plan: plan,
    sources: sources,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults), byKind: Object.assign({}, stat.byKind) }); }
  };
  var EXPORT_COUNT = 10;
  var _exported = Object.keys(WA.actionDesk).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('actionDesk: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/action-desk.js', { kind: 'engine', ver: '2.231.0' });
})();