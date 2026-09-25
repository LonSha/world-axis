/**
 * WorldAxis engines/editor-events.js (v0.9.0) — 事件链编辑器（结构化 CRUD）
 * 缝合来源：DlSNlGHT World —— world-engine-ui.js 事件面板（renderEventEditor 阶段/类型/等级）
 *
 * 数据形状（state.evolution.events[]）：
 *   { id, type:'conflict'|'progress', name, level:1-4, stage, stageRound:1-9, desc, stall? }
 *
 * 硬约束（与 World 引擎铁律一致，编辑器不得绕过）：
 *  - type 一旦确定禁改（conflict/progress 的阶段序列完全不同，改类型等于摧毁事件史）
 *  - 阶段只能按序列前后移动（可手动回退，但不可跨到非法阶段）
 *  - 事件名改名不换链（按 id 定位），与 backstage 推演的「改名不换链」对齐
 *  - 等级只能 1-4
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const TYPE_STAGES = {
    conflict: ['萌芽', '发酵', '逼近', '已爆发', '已消散'],
    progress: ['筹备', '执行', '关键', '已完成', '已失败']
  };
  const TERMINAL = { conflict: '已消散', progress: '已完成' };
  const POSITIVE_TERMINAL = ['已爆发', '已完成'];
  const MAX_EVENTS = 16;
  const MAX_LEVEL = 4;
  const MAX_STAGE_ROUND = 9;
  const DESC_MAXLEN = 50;
  let editingId = null;

  function clean(v) { return WA.inputGuard.text(v, 80); }
  function uid() { return WA.rand.id('ev_', 4, 'id'); }
  // v2.78.0: 读面（无 state）返回**浅拷贝**——修前返回的就是 store 里那个数组，
  //   调用方 `list().push(x)` 等于绕过 add 的全部校验（上限/查重/字段）直接入账。
  //   写面（带 state，即 transact 的 draft）必须拿原数组，否则 splice/赋值落不到 draft 上。
  // v2.79.0（读面元素级活引用修复）: v2.78.0 的浅拷贝只防住「改数组结构」，
  //   **元素对象仍是 store 里那一个** —— 实测 `list()[0] === store.evolution.events[0]` 为真，
  //   于是 `list()[0].name = 'x'` 直接改写持久态，绕过 update 的全部校验
  //   （type 禁改 / 阶段合法性 / 等级 1-4 / 名字非空 / stageRound 边界）。
  //   读面改为**逐元素浅拷贝**（外层与顶层字段都不共享），写面仍是原数组。
  //   为什么不再深一层：数据形状是「扁平记录 + 少量字符串数组/对象」，
  //   元素级拷贝已切断「改返回值即改持久态」这条通路；再往下拷会让读面成本随嵌套膨胀。
  function list(state) {
    const m = (state || WA.store.get()).evolution;
    const arr = (m && m.events) || [];
    return state ? arr : arr.map(function (e) {
      if (!e || typeof e !== 'object') return e;
      const c = {};
      Object.keys(e).forEach(function (k) { c[k] = e[k]; });
      return c;
    });
  }
  function stagesOf(type) { return TYPE_STAGES[type] || TYPE_STAGES.conflict; }

  function findIndex(state, key) {
    const arr = list(state);
    if (typeof key === 'number') return key >= 0 && key < arr.length ? key : -1;
    return arr.findIndex(e => WA.store.sameId(e.id, key) || e.name === key); // v2.30.0 P1-1 收口
  }

  /** 新增：类型必填且必须合法；名称去重（推演侧按名归并，重名会串链） */
  function add(state, input) {
    const type = input.type === 'progress' ? 'progress' : (input.type === 'conflict' ? 'conflict' : null);
    if (!type) return { ok: false, reason: '类型必须是 conflict 或 progress' };
    const name = clean(input.name).slice(0, 30);
    if (!name) return { ok: false, reason: '事件名不可为空' };
    const arr = list(state);
    if (arr.some(e => clean(e.name) === name)) return { ok: false, reason: '同名事件已存在（推演按名归并）' };
    if (arr.length >= MAX_EVENTS) return { ok: false, reason: `事件上限${MAX_EVENTS}` };
    const stages = stagesOf(type);
    const stage = stages.includes(input.stage) ? input.stage : stages[0];
    const event = {
      id: uid(), type, name,
      level: Math.max(1, Math.min(MAX_LEVEL, Number(input.level) || 1)),
      stage, stageRound: Math.max(1, Math.min(MAX_STAGE_ROUND, Number(input.stageRound) || 1)),
      desc: clean(input.desc).slice(0, DESC_MAXLEN)
    };
    if (!state.evolution) state.evolution = {};
    if (!Array.isArray(state.evolution.events)) state.evolution.events = [];
    state.evolution.events.push(event);
    return { ok: true, event };
  }

  /** 更新：type 拒绝变更（改类型会摧毁阶段史），阶段必须在当前类型的合法序列内 */
  function update(state, key, patch) {
    const idx = findIndex(state, key);
    if (idx === -1) return { ok: false, reason: '事件不存在' };
    const arr = list(state);
    const cur = arr[idx];
    const warnings = [];
    if (patch.type !== undefined && patch.type !== cur.type) {
      warnings.push('type禁改（推演侧铁律）');
    }
    const type = cur.type;
    const stages = stagesOf(type);
    let stage = cur.stage;
    if (patch.stage !== undefined) {
      if (stages.includes(patch.stage)) stage = patch.stage;
      else warnings.push(`非法阶段 ${patch.stage}（${type} 合法序列：${stages.join('/')}）`);
    }
    const merged = {
      name: patch.name !== undefined ? clean(patch.name).slice(0, 30) : cur.name,
      level: patch.level !== undefined ? Math.max(1, Math.min(MAX_LEVEL, Number(patch.level) || cur.level)) : cur.level,
      stage,
      stageRound: patch.stageRound !== undefined ? Math.max(1, Math.min(MAX_STAGE_ROUND, Number(patch.stageRound) || 1)) : cur.stageRound,
      desc: patch.desc !== undefined ? clean(patch.desc).slice(0, DESC_MAXLEN) : cur.desc
    };
    if (!merged.name) return { ok: false, reason: '事件名不可为空' };
    // 阶段变化时重置阶段轮（保持 World 推演语义：跨阶段重新计数）
    if (patch.stage !== undefined && stage !== cur.stage && patch.stageRound === undefined) merged.stageRound = 1;
    arr[idx] = Object.assign({}, cur, merged);
    if (stage !== cur.stage) {
      const si = stages.indexOf(stage);
      if (POSITIVE_TERMINAL.includes(stage)) arr[idx]._terminalSince = (WA.store.get().evolution || {}).round || 0;
      else delete arr[idx]._terminalSince;
      if (si >= 0 && si < stages.length - 1) delete arr[idx].stall;
    }
    return { ok: true, event: arr[idx], warnings: warnings.length ? warnings : undefined };
  }

  function remove(state, key) {
    const idx = findIndex(state, key);
    if (idx === -1) return { ok: false, reason: '事件不存在' };
    const arr = list(state);
    const [gone] = arr.splice(idx, 1);
    return { ok: true, removed: gone };
  }

  /** 阶段推移：+1 / -1（不越界，type 无法改变） */
  function shiftStage(state, key, steps) {
    const idx = findIndex(state, key);
    if (idx === -1) return { ok: false, reason: '事件不存在' };
    const arr = list(state);
    const cur = arr[idx];
    const stages = stagesOf(cur.type);
    const si = Math.max(0, stages.indexOf(cur.stage));
    const next = Math.max(0, Math.min(stages.length - 1, si + Number(steps || 0)));
    if (next === si) return { ok: false, reason: '已在序列端点' };
    arr[idx].stage = stages[next];
    arr[idx].stageRound = 1;
    if (POSITIVE_TERMINAL.includes(stages[next])) arr[idx]._terminalSince = (WA.store.get().evolution || {}).round || 0;
    else delete arr[idx]._terminalSince;
    return { ok: true, stage: arr[idx].stage };
  }

  /** 已终结（阶段落在终局且不可再推进） */
  function isTerminal(event) {
    const stages = stagesOf(event.type);
    return stages.indexOf(event.stage) >= stages.length - 1;
  }

  /** 事件面板统计（供一致性检查/概览使用） */
  function stats(state) {
    const arr = list(state);
    const byStage = {}, byType = { conflict: 0, progress: 0 };
    let active = 0, terminal = 0;
    for (const e of arr) {
      byStage[e.stage] = (byStage[e.stage] || 0) + 1;
      if (byType[e.type] !== undefined) byType[e.type]++;
      if (isTerminal(e)) terminal++; else active++;
    }
    return { total: arr.length, active, terminal, byStage, byType };
  }

  WA.editorEvents = {
    TYPE_STAGES, TERMINAL, POSITIVE_TERMINAL, MAX_EVENTS, MAX_LEVEL, MAX_STAGE_ROUND, DESC_MAXLEN,
    list, stagesOf, findIndex, add, update, remove, shiftStage, isTerminal, stats,
    getEditingId: () => editingId,
    setEditingId: (id) => { editingId = id; },
    buildBlock(state) {
      const arr = list(state).filter(e => !isTerminal(e));
      if (!arr.length) return '';
      return '【活跃事件链】\n' + arr.map(e =>
        `- ${e.name}（${e.type === 'progress' ? '推进型' : '冲突型'} Lv.${e.level}）：${e.stage} ${e.stageRound}/9${e.desc ? ' — ' + e.desc : ''}`
      ).join('\n');
    }
  };
  if (WA.log) WA.log('info', '事件编辑器已加载');
})();