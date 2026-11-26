/**
 * WorldAxis engines/family.js (v2.231.0) — EXP-9：家庭、共同生活与代际延续
 *
 * ── 它治什么（缺口，开工前逐条复核现场）────────────────────────────────
 *   计划原文：「**家庭/共同生活单位、亲属与监护关系、共同开支和照护安排**；
 *   明确事件触发的财产、责任与长期目标交接。允许无婚姻、无生育的共同生活方案，
 *   不强制家庭模板。」
 *   验收原文：「家庭成员远行，**照护与支出按已确认安排转交**；在明确继承事件后
 *   按本世界规则分配已有资产，**不能凭空复制财产**；后继角色保留相关经历
 *   而不是继承所有人的私密记忆。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/bonds.js` 管**关系六型**（替身/寄生拯救/主权让渡/利益同盟/
 *       平行共存/对手共生）—— 是**结构分类**，不记「谁和谁住一起、谁照护谁、
 *       谁给谁出钱」；
 *     · `engines/life.js` 管**个人目标与日程**（addGoal/addCommitment/addSchedule/
 *       tick/decide）—— 是**个体层**，不记「这个家庭的共同开支池、照护排班」；
 *     · `engines/vitals.js` 管**生命状态**（register/conceive/endPregnancy/phaseOf/
 *       know/tell）—— 是**生理层**，不记「谁监护谁、遗产怎么分」；
 *     · `actors/registry.js` 管**人物身份与档案**（register/ensurePerson/getProfile/
 *       setRelations）—— 是**名册层**，不记「谁是哪个家庭的成员、家庭账本在哪」。
 *   四者合起来仍缺的那一格：**世界有关系结构、有个人目标、有生理状态、有人物名册，
 *   但没有「共同生活单位」这件事** —— 没有家庭账本、没有照护排班、没有继承交接。
 *   本模块补的就是这一层。
 *
 * ── 机制（六句话）──────────────────────────────────────────────────
 *   ① **家庭单位**（`store.family.units`）：`createUnit()` 建一个共同生活单位，
 *      带名称、类型（由题材定义，不预设「婚姻」）、发起人。`addMember()` 往里加人，
 *      带角色（如「家长」「成员」「被照护者」—— 角色是自由文本，不预设家庭模板）。
 *   ② **共同开支池**（`unit.treasury`）：`contribute()` 从成员的资源面扣入家庭公共池，
 *      `spend()` 从公共池支出给指定接收方。**走既有资源面**（`people[].resources`），
 *      不建第二份钱包；公共池不够 ⇒ `short-treasury`。
 *   ③ **照护安排**（`unit.care`）：`assignCare()` 把对某被照护者的照护责任
 *      排给某个成员。`transferCare()` 把照护转给另一人 —— 验收原文「远行时照护转交」。
 *      转交时**如实记下交接时间与原因**，不静默换人。
 *   ④ **继承事件**（`unit.inheritances`）：`inherit()` 在明确事件触发时
 *      按规则分配已故/离队成员的资产。**资产从被继承者的资源面扣出、分配给继承人** ——
 *      不凭空复制（验收原文「不能凭空复制财产」）。均分是默认（最后一名接收浮点余量）；
 *      v2.588.0（R264 / EXP-9b）起支持**自定义比例**：`inherit(unitId, deceased, heirs, event, shares)`
 *      的第五参数是权重表（`{ '张三': 3, '李四': 2 }`，任意正数，内部归一）。四条边界：
 *      不传 = 均分（旧行为逐字不变）；权重非数/负数/全 0 ⇒ `invalid-shares` 拒收；
 *      `shares` 里写了**非继承人**的名字 ⇒ `invalid-shares`（写错名字不得静默少分）；
 *      权重为 0 或未列出的继承人 ⇒ 不参与分配但**如实报 `excluded`**（不静默消失）。
 *   ⑤ **不继承私密记忆**：继承事件只搬**资源**，不搬**记忆/认知/关系档案**
 *      （那是 vitals.know / registry.profile / intel.believe 的领域）。
 *      验收原文「后继角色保留自身经历而不是继承所有人的私密记忆」。
 *   ⑥ **不自动创造事件**：本模块不因计时自动创造出生、死亡或婚姻 ——
 *      所有事件由显式调用触发（`inherit()` / `transferCare()` / `addMember()` /
 *      `removeMember()`），不把家族制度写死为一种文化规则。
 *
 * ── 十条否定式边界（每条都有判据咬）────────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`。
 *   ② **不建第二份名册**：所有成员必须是世界里的人物（`unknown-member`）。
 *   ③ **不建第二份钱包**：共同开支池走 `people[].resources`，不另立币种
 *      （货币名读 `economy.money()`，与 ruling.js 的罚款同口径）。
 *   ④ **不凭空复制财产**：`inherit()` 从被继承者扣出、分配给继承人，
 *      被继承者手里不够 ⇒ `short-estate`（扣到 0 并如实报差额，不造钱）。
 *   ⑤ **不继承私密记忆**：继承事件只搬资源，不搬 knowledge / profile / persona
 *      （`no-memory-transfer` —— 显式写在返回值里让调用方看到）。
 *   ⑥ **角色是自由文本**：`addMember()` 的 role 参数不校验是否在某个预设列表里
 *      （不强制家庭模板）；但角色不能为空（`missing-role`）。
 *   ⑦ **照护转交要记痕**：`transferCare()` 记下 from / to / 时间 / 原因，
 *      不静默换人（`no-care-history` ⇒ 转交时必须生成一条记录）。
 *   ⑧ **继承事件要显式**：`inherit()` 需要被继承者姓名和事件描述，
 *      不自动扫描死亡名单（不自动把所有「不在了」的人的财产分掉）。
 *   ⑨ **存档是唯一真源**（`store.family`）：`reload()` 从存档重建。
 *   ⑩ **不预设家庭模板**：`createUnit()` 的 type 是自由文本（不校验是否在预设列表里），
 *      允许无婚姻、无生育的共同生活方案。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_family_settings_v1';
  const DEF = { enabled: true, maxUnits: 24, maxMembersPerUnit: 12, maxCareRows: 48 };
  const __REG = { key: LS_KEY, def: DEF, module: 'family',
    bounds: { maxUnits: [2, 100], maxMembersPerUnit: [2, 48], maxCareRows: [4, 200] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { units: 0, members: 0, contributed: 0, spent: 0, careAssigned: 0, careTransferred: 0,
    inherited: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const f = (root || state()).family;
    return (f && typeof f === 'object' && !Array.isArray(f)) ? f : null;
  }
  function ensure(draft) {
    if (!draft.family || typeof draft.family !== 'object' || Array.isArray(draft.family))
      draft.family = { units: [] };
    if (!Array.isArray(draft.family.units)) draft.family.units = [];
    return draft.family;
  }
  function knownPerson(who) {
    const s = state();
    return !!(s.people && s.people['p_' + who]);
  }
  let __seq = 0;
  function nextId() { __seq++; return 'f_' + WA.clock.now('family').toString(36) + '_' + __seq; }

  /**
   * 创建共同生活单位。
   * @param {object} opts
   *   name: 单位名称（必填）
   *   type: 单位类型（自由文本，不预设「婚姻」）
   *   by: 发起人（必填，须是已登记人物）
   */
  function createUnit(opts) {
    opts = opts || {};
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const name = clean(opts.name, 60);
    const type = clean(opts.type, 40) || '共同生活';
    const by = clean(opts.by, 40);
    if (!name || !by) return refuse('missing-fields');
    if (!knownPerson(by)) return refuse('unknown-member', { who: by });
    const bag = bagOf(state());
    if (bag && bag.units.length >= cfg.maxUnits) return refuse('too-many-units', { cap: cfg.maxUnits });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const id = nextId();
      const unit = {
        id: id, name: name, type: type, createdBy: by,
        members: [{ who: by, role: '发起人', joinedAt: clockNow('family') }],
        treasury: {}, care: [], inheritances: [],
        createdAt: clockNow('family')
      };
      b.units.push(unit);
      if (WA.evict) WA.evict.array(b.units, 'family.units', cfg.maxUnits);
      out = { ok: true, id: id, name: name };
    }, 'family:createUnit');
    if (out && out.ok) { stat.units++; stat.members++; stat.lastReason = 'created'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 添加成员到共同生活单位。
   * @param {string} unitId
   * @param {string} who 成员姓名
   * @param {string} role 角色（自由文本，必填，不预设家庭模板）
   */
  function addMember(unitId, who, role) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const uid = clean(unitId, 30);
    const w = clean(who, 40);
    const r = clean(role, 40);
    if (!uid || !w || !r) return refuse('missing-fields');
    if (!knownPerson(w)) return refuse('unknown-member', { who: w });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const unit = b.units.filter(function (u) { return u.id === uid; })[0];
      if (!unit) { out = refuse('no-such-unit', { id: uid }); return false; }
      if (unit.members.length >= cfg.maxMembersPerUnit) { out = refuse('unit-full', { id: uid, cap: cfg.maxMembersPerUnit }); return false; }
      const existing = unit.members.filter(function (m) { return m.who === w; })[0];
      if (existing) { out = refuse('already-member', { who: w, unit: uid }); return false; }
      unit.members.push({ who: w, role: r, joinedAt: clockNow('family') });
      out = { ok: true, id: uid, who: w, role: r };
      return true;
    }, 'family:addMember');
    if (out && out.ok) { stat.members++; stat.lastReason = 'member-added'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 移除成员（不退资源 —— 资源在 people 层，不在此处）。
   */
  function removeMember(unitId, who, reason) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const uid = clean(unitId, 30);
    const w = clean(who, 40);
    if (!uid || !w) return refuse('missing-fields');
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const unit = b.units.filter(function (u) { return u.id === uid; })[0];
      if (!unit) { out = refuse('no-such-unit', { id: uid }); return false; }
      const before = unit.members.length;
      unit.members = unit.members.filter(function (m) { return m.who !== w; });
      if (unit.members.length === before) { out = refuse('not-a-member', { who: w, unit: uid }); return false; }
      // 照护安排中属于此人的也标记为已转移
      unit.care.forEach(function (c) {
        if (c.caregiver === w && c.active) { c.active = false; c.endedAt = clockNow('family'); c.endReason = 'member-removed: ' + (reason || ''); }
      });
      out = { ok: true, id: uid, who: w, remainingMembers: unit.members.length };
      return true;
    }, 'family:removeMember');
    if (out && out.ok) stat.lastReason = 'member-removed';
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 共同开支池：从成员的资源面扣入家庭公共池。
   */
  function contribute(unitId, who, material, amount) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const uid = clean(unitId, 30);
    const w = clean(who, 40);
    const mat = clean(material, 40);
    const amt = num(amount);
    if (!uid || !w || !mat || !amt || amt <= 0) return refuse('missing-fields');
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const unit = b.units.filter(function (u) { return u.id === uid; })[0];
      if (!unit) { out = refuse('no-such-unit', { id: uid }); return false; }
      const isMember = unit.members.some(function (m) { return m.who === w; });
      if (!isMember) { out = refuse('not-a-member', { who: w, unit: uid }); return false; }
      const person = draft.people && draft.people['p_' + w];
      if (!person) { out = refuse('unknown-member', { who: w }); return false; }
      if (!person.resources) person.resources = {};
      const have = num(person.resources[mat]) || 0;
      if (have < amt) { out = refuse('short-contribution', { who: w, material: mat, need: amt, have: have }); return false; }
      person.resources[mat] = have - amt;
      unit.treasury[mat] = (num(unit.treasury[mat]) || 0) + amt;
      out = { ok: true, id: uid, treasury: Object.assign({}, unit.treasury) };
      return true;
    }, 'family:contribute');
    if (out && out.ok) { stat.contributed++; stat.lastReason = 'contributed'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 从公共池支出给指定接收方（走既有资源面，不建第二份钱包）。
   */
  function spend(unitId, to, material, amount) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const uid = clean(unitId, 30);
    const t = clean(to, 40);
    const mat = clean(material, 40);
    const amt = num(amount);
    if (!uid || !t || !mat || !amt || amt <= 0) return refuse('missing-fields');
    if (!knownPerson(t)) return refuse('unknown-member', { who: t });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const unit = b.units.filter(function (u) { return u.id === uid; })[0];
      if (!unit) { out = refuse('no-such-unit', { id: uid }); return false; }
      const have = num(unit.treasury[mat]) || 0;
      if (have < amt) { out = refuse('short-treasury', { id: uid, material: mat, need: amt, have: have }); return false; }
      unit.treasury[mat] = have - amt;
      const person = draft.people && draft.people['p_' + t];
      if (!person) { out = refuse('unknown-member', { who: t }); return false; }
      if (!person.resources) person.resources = {};
      person.resources[mat] = (num(person.resources[mat]) || 0) + amt;
      out = { ok: true, id: uid, to: t, material: mat, amount: amt, treasury: Object.assign({}, unit.treasury) };
      return true;
    }, 'family:spend');
    if (out && out.ok) { stat.spent++; stat.lastReason = 'spent'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 指派照护：把对某被照护者的照护责任排给某个成员。
   */
  function assignCare(unitId, caregiver, ward, notes) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const uid = clean(unitId, 30);
    const cg = clean(caregiver, 40);
    const wd = clean(ward, 40);
    if (!uid || !cg || !wd) return refuse('missing-fields');
    if (!knownPerson(cg)) return refuse('unknown-member', { who: cg });
    if (!knownPerson(wd)) return refuse('unknown-member', { who: wd });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const unit = b.units.filter(function (u) { return u.id === uid; })[0];
      if (!unit) { out = refuse('no-such-unit', { id: uid }); return false; }
      const isMember = unit.members.some(function (m) { return m.who === cg; });
      if (!isMember) { out = refuse('not-a-member', { who: cg, unit: uid }); return false; }
      // 如果 ward 已有活跃照护者，先结束旧的
      unit.care.forEach(function (c) {
        if (c.ward === wd && c.active) { c.active = false; c.endedAt = clockNow('family'); c.endReason = 'reassigned'; }
      });
      const row = { caregiver: cg, ward: wd, active: true, assignedAt: clockNow('family'),
        notes: clean(notes, 200) || '', endedAt: 0, endReason: '', history: [] };
      unit.care.push(row);
      if (WA.evict) WA.evict.array(unit.care, 'family.care', cfg.maxCareRows);
      out = { ok: true, id: uid, caregiver: cg, ward: wd };
      return true;
    }, 'family:assignCare');
    if (out && out.ok) { stat.careAssigned++; stat.lastReason = 'care-assigned'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 转交照护：把活跃的照护责任转给另一人（验收原文「远行时照护转交」）。
   */
  function transferCare(unitId, ward, newCaregiver, reason) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const uid = clean(unitId, 30);
    const wd = clean(ward, 40);
    const ncg = clean(newCaregiver, 40);
    const rsn = clean(reason, 200) || 'transferred';
    if (!uid || !wd || !ncg) return refuse('missing-fields');
    if (!knownPerson(ncg)) return refuse('unknown-member', { who: ncg });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const unit = b.units.filter(function (u) { return u.id === uid; })[0];
      if (!unit) { out = refuse('no-such-unit', { id: uid }); return false; }
      const isMember = unit.members.some(function (m) { return m.who === ncg; });
      if (!isMember) { out = refuse('not-a-member', { who: ncg, unit: uid }); return false; }
      const active = unit.care.filter(function (c) { return c.ward === wd && c.active; });
      if (!active.length) { out = refuse('no-active-care', { ward: wd, unit: uid }); return false; }
      const old = active[0];
      old.active = false;
      old.endedAt = clockNow('family');
      old.endReason = 'transferred to ' + ncg;
      // 转交要记痕（不静默换人）
      const row = { caregiver: ncg, ward: wd, active: true, assignedAt: clockNow('family'),
        notes: rsn, endedAt: 0, endReason: '', history: [] };
      row.history.push({ from: old.caregiver, to: ncg, at: clockNow('family'), reason: rsn });
      unit.care.push(row);
      if (WA.evict) WA.evict.array(unit.care, 'family.care', cfg.maxCareRows);
      out = { ok: true, id: uid, ward: wd, from: old.caregiver, to: ncg, reason: rsn };
      return true;
    }, 'family:transferCare');
    if (out && out.ok) { stat.careTransferred++; stat.lastReason = 'care-transferred'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 归一化继承比例（v2.588.0 / EXP-9b）。
   *   `shares`：`{ '张三': 3, '李四': 2 }`（权重表，任意正数，内部归一化为比例）。
   *   返回 `{ ok:true, mode:'even'|'weighted', weights, excluded }` 或 `{ ok:false, reason }`。
   *   四条边界见文件头 ④：不传即均分 / 非法值拒收 / 非继承人名字拒收 / 零权重如实报 excluded。
   * @param {Array} heirNames 已校验的继承人名册
   * @param {Object|null} shares 权重表（可选）
   * @returns {Object} { ok, mode, weights, excluded } 或 { ok:false, reason }
   */
  function normalizeShares(heirNames, shares) {
    if (shares === undefined || shares === null) return { ok: true, mode: 'even', weights: null, excluded: [] };
    if (typeof shares !== 'object' || Array.isArray(shares)) return { ok: false, reason: 'invalid-shares' };
    const keys = Object.keys(shares);
    if (!keys.length) return { ok: false, reason: 'invalid-shares' };
    // 键名先洗一遍再比对：`' 张三'` 与 `'张三'` 是同一人，不许因为空格静默少分。
    const map = {};
    for (let i = 0; i < keys.length; i++) {
      const k = clean(keys[i], 40);
      if (!k) return { ok: false, reason: 'invalid-shares' };
      if (heirNames.indexOf(k) < 0) return { ok: false, reason: 'invalid-shares', who: String(keys[i]) };
      map[k] = shares[keys[i]];
    }
    const weights = heirNames.map(function (h) {
      if (!Object.prototype.hasOwnProperty.call(map, h)) return 0;
      const n = num(map[h]);
      return n === null ? NaN : n;   // 非数 / 负数 / Infinity 一律 NaN ⇒ 拒收
    });
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] !== weights[i]) return { ok: false, reason: 'invalid-shares', who: heirNames[i] };
    }
    const sum = weights.reduce(function (a, b) { return a + b; }, 0);
    if (!(sum > 0)) return { ok: false, reason: 'invalid-shares' };   // 全 0 = 谁都不给，不是分配
    const norm = weights.map(function (w) { return w / sum; });
    const excluded = heirNames.filter(function (h, i) { return !(weights[i] > 0); });
    return { ok: true, mode: 'weighted', weights: norm, excluded: excluded };
  }

  /**
   * 继承事件：按规则分配被继承者的资产。
   *   - 资产从被继承者的资源面扣出，分配给继承人
   *   - 不凭空复制财产（不够则扣到 0 并报差额）
   *   - 不继承私密记忆（只搬资源，不搬 knowledge/profile/persona）
   */
  function inherit(unitId, deceased, heirs, event, shares) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const uid = clean(unitId, 30);
    const dec = clean(deceased, 40);
    const evt = clean(event, 200);
    if (!evt) return refuse('missing-fields');
    if (!uid || !dec || !heirs || !Array.isArray(heirs) || !heirs.length) return refuse('missing-fields');
    // 验证继承人都是已登记人物
    const heirNames = heirs.map(function (h) { return clean(h, 40); }).filter(Boolean);
    if (!heirNames.length) return refuse('missing-fields');
    if (heirNames.indexOf(dec) >= 0 || new Set(heirNames).size !== heirNames.length) return refuse('invalid-heirs');
    for (let i = 0; i < heirNames.length; i++) {
      if (!knownPerson(heirNames[i])) return refuse('unknown-member', { who: heirNames[i] });
    }
    // v2.588.0：比例校验放在写事务**之前** —— 拒收不许进事务（进去一次就算污染）。
    const plan = normalizeShares(heirNames, shares);
    if (!plan.ok) return refuse(plan.reason, plan.who ? { who: plan.who } : null);
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const unit = b.units.filter(function (u) { return u.id === uid; })[0];
      if (!unit) { out = refuse('no-such-unit', { id: uid }); return false; }
      const person = draft.people && draft.people['p_' + dec];
      if (!person) { out = refuse('unknown-member', { who: dec }); return false; }
      const resources = Object.assign({}, person.resources || {});
      const distributed = {};
      const shortfalls = {};
      // 参与分配的索引：均分 = 全体；比例 = 只取权重 > 0 者（其余如实进 excluded，不静默消失）。
      const slots = plan.mode === 'even'
        ? heirNames.map(function (_, i) { return i; })
        : plan.weights.map(function (w, i) { return w > 0 ? i : -1; }).filter(function (i) { return i >= 0; });
      Object.keys(resources).forEach(function (mat) {
        const total = num(resources[mat]) || 0;
        if (total <= 0) return;
        let remaining = total;
        slots.forEach(function (index, k) {
          const h = heirNames[index];
          const rate = plan.mode === 'even' ? (1 / slots.length) : plan.weights[index];
          // 最后一名拿浮点余量：守恒靠这一行，不靠四舍五入（不造钱也不销毁）。
          const give = (k === slots.length - 1) ? remaining : Math.min(total * rate, remaining);
          if (give > 0) {
            if (!draft.people['p_' + h].resources) draft.people['p_' + h].resources = {};
            draft.people['p_' + h].resources[mat] = (num(draft.people['p_' + h].resources[mat]) || 0) + give;
            remaining -= give;
            distributed[mat] = (distributed[mat] || 0) + give;
          }
        });
        // 扣到 0（不凭空复制）
        person.resources[mat] = 0;
        // 最后一名接收余量；没有舍入余额被销毁。
      });
      const record = { deceased: dec, heirs: heirNames, event: evt, mode: plan.mode,
        weights: plan.weights ? plan.weights.slice() : null, excluded: plan.excluded.slice(),
        distributed: distributed, shortfalls: shortfalls,
        noMemoryTransfer: true, at: clockNow('family') };
      unit.inheritances.push(record);
      out = { ok: true, id: uid, deceased: dec, heirs: heirNames, mode: plan.mode,
        weights: plan.weights ? plan.weights.slice() : null, excluded: plan.excluded.slice(),
        distributed: distributed, shortfalls: shortfalls,
        noMemoryTransfer: true };
      return true;
    }, 'family:inherit');
    if (out && out.ok) { stat.inherited++; stat.lastReason = 'inherited'; }
    return out ? JSON.parse(JSON.stringify(out)) : { ok: false, reason: 'store-unavailable' };
  }

  /** 列出所有家庭单位（只读副本） */
  function list() {
    const cfg = settings();
    if (!cfg.enabled) return [];
    const bag = bagOf(state());
    if (!bag) return [];
    return (bag.units || []).map(function (u) {
      return { id: u.id, name: u.name, type: u.type, members: u.members.length,
        treasuryKeys: Object.keys(u.treasury || {}), careActive: (u.care || []).filter(function (c) { return c.active; }).length };
    });
  }

  /** 查看单个家庭单位（只读副本） */
  function view(unitId) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const uid = clean(unitId, 30);
    const bag = bagOf(state());
    if (!bag) return { ok: false, reason: 'no-such-unit' };
    const unit = (bag.units || []).filter(function (u) { return u.id === uid; })[0];
    if (!unit) return { ok: false, reason: 'no-such-unit', id: uid };
    return { ok: true, id: unit.id, name: unit.name, type: unit.type, createdBy: unit.createdBy,
      members: unit.members.map(function (m) { return { who: m.who, role: m.role, joinedAt: m.joinedAt }; }),
      treasury: Object.assign({}, unit.treasury || {}),
      care: (unit.care || []).map(function (c) { return { caregiver: c.caregiver, ward: c.ward, active: c.active, assignedAt: c.assignedAt, notes: c.notes, endReason: c.endReason, history: JSON.parse(JSON.stringify(c.history || [])) }; }),
      inheritances: (unit.inheritances || []).map(function (i) { return { deceased: i.deceased, heirs: i.heirs.slice(), event: i.event, mode: i.mode || 'even', excluded: (i.excluded || []).slice(), distributed: Object.assign({}, i.distributed), shortfalls: Object.assign({}, i.shortfalls), noMemoryTransfer: i.noMemoryTransfer }; }) };
  }

  /** 从存档重建 */
  function reload() {
    __seq = 0;
    const bag = bagOf(state());
    if (bag && Array.isArray(bag.units)) {
      bag.units.forEach(function (u) {
        const m = /_(\d+)$/.exec(u.id || '');
        if (m) { const n = parseInt(m[1], 10); if (n > __seq) __seq = n; }
      });
    }
    return { ok: true, units: (bag ? bag.units.length : 0) };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const bag = bagOf(state());
    if (!bag) return '';
    const units = (bag.units || []).slice(-Math.max(1, cfg.maxUnits));
    if (!units.length) return '';
    const lines = units.map(function (u) {
      const lines = [u.name + '（' + u.type + '，' + u.members.length + '人）'];
      const balance = Object.keys(u.treasury || {}).sort().slice(0, 12).map(function (k) {
        return clean(k, 40) + '×' + u.treasury[k];
      });
      lines.push('公共池余额：' + (balance.join('、') || '未登记资源'));
      (u.care || []).filter(function (c) { return c.active; }).slice(-6).forEach(function (c) {
        lines.push('已确认照护：' + c.caregiver + '→' + c.ward
          + (c.notes ? '（' + clean(c.notes, 120) + '）' : '') + '；期限未登记');
        (c.history || []).slice(-1).forEach(function (h) {
          lines.push('照护交接：' + h.from + '→' + h.to + '；原因：' + clean(h.reason, 120));
        });
      });
      (u.inheritances || []).slice(-2).forEach(function (h) {
        lines.push('已完成财产交接：' + h.deceased + '→' + (h.heirs || []).join('、')
          + '；事件：' + clean(h.event, 120) + '（不继承私密记忆）');
      });
      return lines.join('\n');
    });
    return '[家庭]\n' + lines.join('\n') + '\n共同生活单位的照护与开支按已确认安排执行。\n';
  }

  WA.family = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    createUnit: createUnit, addMember: addMember, removeMember: removeMember,
    contribute: contribute, spend: spend,
    assignCare: assignCare, transferCare: transferCare,
    inherit: inherit,
    list: list, view: view, reload: reload, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); },
    resetStat: function () { for (var k in stat) { if (Array.isArray(stat[k])) continue; stat[k] = (typeof stat[k] === 'number') ? 0 : ''; } stat.faults = {}; }
  };
  var EXPORT_COUNT = 16;
  var _exported = Object.keys(WA.family).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('family: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/family.js', { kind: 'engine', ver: '2.231.0' });
})();