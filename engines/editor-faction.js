/**
 * WorldAxis engines/editor-faction.js (v0.9.0) — 势力编辑器（结构化 CRUD）
 * 缝合来源：DlSNlGHT World —— world-engine-ui.js 势力面板（renderFactionList/renderFactionEditor）
 *
 * 与 backstage 推演的关系：
 *  - backstage.applyFactions 负责「AI 推演 → 入账」（按 name 匹配更新，禁止空字段覆写）
 *  - 本编辑器负责「人手动结构化增删改复制」，走同一数据形状，互不破坏
 *
 * 数据形状（state.evolution.factions[]）：
 *   { id, name, scope, status, relation, currentGoal, core_person, powerPillars[≤3] }
 * 枚举受 World 引擎约束（不可自造新枚举值，避免推演侧无法识别）：
 *   status  : 鼎盛|稳固|倾轧|困顿|衰落|瓦解
 *   relation: 血盟|盟友|友好|中立|冷淡|敌对|世仇
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const STATUSES = ['鼎盛', '稳固', '倾轧', '困顿', '衰落', '瓦解'];
  const RELATIONS = ['血盟', '盟友', '友好', '中立', '冷淡', '敌对', '世仇'];
  const MAX_FACTIONS = 16;          // 面板容量（World ui 上限 15，留 1 位手动余量）
  const MAX_PILLARS = 3;
  const PILLAR_MAXLEN = 4;
  const GOAL_MAXLEN = 50;

  // 声誉影响权重（World ui 同源）：关系值 × 运势系数，总封顶 ±35
  const REL_WEIGHT = { 血盟: 3, 盟友: 2.5, 友好: 2, 中立: 0, 冷淡: -1, 敌对: -2.5, 世仇: -3.5 };
  const STATUS_COEF = { 鼎盛: 1.4, 稳固: 1.2, 倾轧: 0.8, 困顿: 0.6, 衰落: 0.4, 瓦解: 0.2 };
  const REPUTATION_CAP = 35;

  let editingId = null;              // 当前处于编辑态的势力 id（UI 用，不落盘）

  function clean(v) { return String(v == null ? '' : v).trim(); }
  function uid() { return 'fa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function list(state) { return (state || WA.store.get()).evolution?.factions || []; }

  /** 五要件准入校验：World 规则「势力五要件」——名称/范围/关系/目标/支柱至少一 */
  function validate(input) {
    const missing = [];
    const f = {
      name: clean(input.name).slice(0, 20),
      scope: clean(input.scope).slice(0, 20),
      status: STATUSES.includes(input.status) ? input.status : '稳固',
      relation: RELATIONS.includes(input.relation) ? input.relation : '中立',
      currentGoal: clean(input.currentGoal).slice(0, GOAL_MAXLEN),
      core_person: clean(input.core_person).slice(0, 20),
      powerPillars: (Array.isArray(input.powerPillars) ? input.powerPillars : [])
        .map(p => clean(p).slice(0, PILLAR_MAXLEN)).filter(Boolean).slice(0, MAX_PILLARS)
    };
    if (!f.name) missing.push('name');
    if (!f.scope) missing.push('scope');
    if (!f.currentGoal) missing.push('currentGoal');
    if (!f.powerPillars.length) missing.push('powerPillars');
    if (!f.core_person) missing.push('core_person');
    return { ok: missing.length === 0, missing, normalized: f };
  }

  function findIndex(state, key) {
    const arr = list(state);
    if (typeof key === 'number') return key >= 0 && key < arr.length ? key : -1;
    return arr.findIndex(f => f.id === key || f.name === key);
  }

  /** 新增：重名拒绝（World 推演按 name 匹配，重名会导致归并串味） */
  function add(state, input) {
    const v = validate(input || {});
    if (!v.ok) return { ok: false, reason: '缺少要件: ' + v.missing.join(',') };
    const arr = list(state);
    if (arr.some(f => clean(f.name) === v.normalized.name)) return { ok: false, reason: '同名势力已存在（推演按名归并）' };
    if (arr.length >= MAX_FACTIONS) return { ok: false, reason: `势力上限${MAX_FACTIONS}，请先清理` };
    const faction = Object.assign({ id: uid() }, v.normalized);
    if (!state.evolution) state.evolution = {};
    if (!Array.isArray(state.evolution.factions)) state.evolution.factions = [];
    state.evolution.factions.push(faction);
    return { ok: true, faction };
  }

  /** 更新：patch 中未出现的字段保持原值（防手动编辑抹掉推演侧写入） */
  function update(state, key, patch) {
    const idx = findIndex(state, key);
    if (idx === -1) return { ok: false, reason: '势力不存在' };
    const arr = list(state);
    const cur = arr[idx];
    const merged = {
      name: patch.name !== undefined ? clean(patch.name).slice(0, 20) : cur.name,
      scope: patch.scope !== undefined ? clean(patch.scope).slice(0, 20) : cur.scope,
      status: STATUSES.includes(patch.status) ? patch.status : cur.status,
      relation: RELATIONS.includes(patch.relation) ? patch.relation : cur.relation,
      currentGoal: patch.currentGoal !== undefined ? clean(patch.currentGoal).slice(0, GOAL_MAXLEN) : cur.currentGoal,
      core_person: patch.core_person !== undefined ? clean(patch.core_person).slice(0, 20) : cur.core_person,
      powerPillars: patch.powerPillars !== undefined
        ? (Array.isArray(patch.powerPillars) ? patch.powerPillars : [])
            .map(p => clean(p).slice(0, PILLAR_MAXLEN)).filter(Boolean).slice(0, MAX_PILLARS)
        : cur.powerPillars
    };
    if (!merged.name) return { ok: false, reason: '势力名不可为空' };
    arr[idx] = Object.assign({}, cur, merged);
    return { ok: true, faction: arr[idx] };
  }

  function remove(state, key) {
    const idx = findIndex(state, key);
    if (idx === -1) return { ok: false, reason: '势力不存在' };
    const arr = list(state);
    const [gone] = arr.splice(idx, 1);
    return { ok: true, removed: gone };
  }

  /** 复制：id 换新、名加「·副本」，避免同名触发推演归并 */
  function copy(state, key) {
    const idx = findIndex(state, key);
    if (idx === -1) return { ok: false, reason: '势力不存在' };
    const arr = list(state);
    if (arr.length >= MAX_FACTIONS) return { ok: false, reason: `势力上限${MAX_FACTIONS}` };
    const cloned = Object.assign({}, arr[idx], { id: uid(), name: clean(arr[idx].name) + '·副本' });
    arr.splice(idx + 1, 0, cloned);
    return { ok: true, faction: cloned };
  }

  /** 关系调整：相对位移（推演侧发生外交转折时可由 UI 或事件链调用） */
  function shiftRelation(state, key, steps) {
    const idx = findIndex(state, key);
    if (idx === -1) return { ok: false, reason: '势力不存在' };
    const arr = list(state);
    const cur = RELATIONS.indexOf(arr[idx].relation);
    const next = Math.max(0, Math.min(RELATIONS.length - 1, (cur === -1 ? 3 : cur) + Number(steps || 0)));
    arr[idx].relation = RELATIONS[next];
    return { ok: true, relation: arr[idx].relation };
  }

  /** 声誉总压：关系值×运势系数求和，封顶 ±35（与 World 面板口径一致） */
  function reputationPressure(state) {
    let total = 0;
    for (const f of list(state)) {
      const rel = REL_WEIGHT[f.relation] ?? 0;
      const st = STATUS_COEF[f.status] ?? 0.4;
      total += rel * st;
    }
    const clamped = Math.max(-REPUTATION_CAP, Math.min(REPUTATION_CAP, total));
    return { raw: +total.toFixed(2), pressure: +clamped.toFixed(2), cap: REPUTATION_CAP };
  }

  WA.editorFaction = {
    STATUSES, RELATIONS, MAX_FACTIONS, MAX_PILLARS, PILLAR_MAXLEN, REL_WEIGHT, STATUS_COEF,
    list, validate, add, update, remove, copy, shiftRelation, reputationPressure,
    findIndex,
    getEditingId: () => editingId,
    setEditingId: (id) => { editingId = id; },
    buildBlock(state) {
      const arr = list(state);
      if (!arr.length) return '';
      return '【势力名录】\n' + arr.map(f =>
        `- ${f.name}（${f.status}/${f.relation}${f.scope ? '·' + f.scope : ''}）目标：${f.currentGoal || '未定'}；核心：${f.core_person || '未明'}；支柱：${(f.powerPillars || []).join('、') || '无'}`
      ).join('\n');
    }
  };
  if (WA.log) WA.log('info', '势力编辑器已加载');
})();