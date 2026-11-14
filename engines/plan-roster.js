/**
 * WorldAxis engines/plan-roster.js (v2.409.0) — 计划**准入**三件套：同行闭包 / 角色游标 / 封闭动作
 *
 *  缝合来源：npc-life 3.0.0-beta.4 的 `timeline.js`（`memberProblem` / `validatePlan` /
 *  `neutralAction` / `completionEvent` 的 `knownBy`）与 `world-service.js`
 *  （`planningContext` 的 `planningCursor`：每轮只选一个独立角色或一个**完整同行闭包**）。
 *
 *  ── 治什么（三个各自独立的漏）────────────────────────────────────
 *   ① **拆散出门**：模型写「张三带着李家三口出发」，却只推进了张三一人；或让队伍里的
 *      某人在半路「后台移动」到别处。→ 同行闭包完整性判据。
 *   ② **点名偏食**：规划器每轮只看最近被提到的那两三个人，其余角色长期不推进，
 *      世界越跑越薄。→ 角色游标轮转（`planningCursor`）。
 *   ③ **发明新事实**：模型把「主角上午在茶馆对弈」这种任意动作写成既定事实。
 *      → 封闭动作白名单（`neutralAction`）：不在白名单的动作一律按「需要显式事件」拒。
 *
 *  ── 六条判据（逐条对齐上游，不自行加严）──────────────────────────
 *   ① 成员闭包：`party.confirmed !== false` 且成员集合**必须全覆盖**（不能带一半走）。
 *      成员必须 `tracked && confirmed && !archived && !ignored`。
 *   ② 地点必须 `confirmed`；`in_transit` / `arrival_ready` 的成员**不可再动**
 *      （正在路上的人不能被重新指派目的地，否则两段行程同时成立）。
 *   ③ 锁定不可动：`locked` 或 `activityLock.active` 的角色不进任何新计划。
 *   ④ 在场者活动必须 `major:false`：本人在玩家面前时，只能发生「小活动」，
 *      不许借计划推进改写他正在做的事。
 *   ⑤ travel 必须有**已确认路线**且 `durationMinutes` 是正安全整数；
 *      没有路线就不是「走一段路」，而是瞬移。
 *   ⑥ 知情交集：事件投影给玩家，只在「玩家地点 === 事件地点 且 有成员在场」时成立。
 *      `UNMENTIONED ≠ ABSENT` 的另一面：**没写到的角色不等于不在，但没写到的知情不等于已知**。
 *
 *  ── 动作白名单为什么是封闭的 ────────────────────────────────────
 *   上游用一条封闭正则，本模块同规：白名单外的动作不是「不允许发生」，而是
 *   **不允许由计划引擎单方面认定为已发生**。要发生，得走显式事件通道（那里有独立证据判据）。
 *   这条边界是「模型不能写任意新事实」的唯一实现方式 —— 开放词表做不到。
 *
 *  ── 与邻座分工 ────────────────────────────────────────────────
 *   - `engines/plan.js` 管**计划本体**（steps / cursor / remainingMinutes 扣减）；
 *     本模块只管**准入**：能不能立这个计划、谁有权被选中、这个动作算不算小活动。
 *   - `engines/stage-presence.js` 管在场判定；本模块消费其结论，不重算在场。
 *   - `engines/travel-desk.js` 管路线与行程；本模块只校验「引用到的路线是否已确认」。
 *   - `engines/epistemic-view.js` 管认知视图；本模块的 `knownBy` 只做**交集取值**，
 *     不改写任何既有信念层字段。
 *
 *  ── 七条否定式边界 ────────────────────────────────────────────
 *   ① 总开关默认关闭；关闭时 admit / pick 一律返回 `{ ok:false, skipped:true }`。
 *   ② 零 store 写、零落盘、零模型调用、零网络。
 *   ③ **不推进计划、不扣时间**：admit 只判准入，返回 problems 列表，不改任何对象。
 *   ④ 不发明路线、不补全成员：缺数据一律拒（`missing-route` / `member-not-found`），不猜。
 *   ⑤ 白名单**不因题材放宽**：任何题材都同一张表（题材规则一律不搬，本仓纪律）。
 *   ⑥ 拒时逐条给 `code` + `detail`：只回一个 false 与「压下项必须可见」冲突。
 *   ⑦ 游标是**建议**不是命令：`pick` 返回下一批候选，调用方可以不采纳。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_plan_roster_settings_v1';
  const DEF = { enabled: false, closureCap: 6, sharedEventCap: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'planRoster',
    bounds: { closureCap: [1, 24], sharedEventCap: [0, 48] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /**
   * 封闭动作白名单。**与上游逐字同表**（等待|休息|睡觉|阅读|工作|学习|练习|训练|冥想|散步|吃饭|
   * 喝茶|做饭|打扫|写作|值守|巡逻|钓鱼|采集|种植|购物|交谈|聊天|修炼|研究|观望|休整）。
   *   为什么保持封闭：开放词表会让「他忽然宣布登基」也通过 —— 那正是本判据要拦的形态。
   */
  const NEUTRAL_ACTIONS = ['等待', '休息', '睡觉', '阅读', '工作', '学习', '练习', '训练', '冥想', '散步',
    '吃饭', '喝茶', '做饭', '打扫', '写作', '值守', '巡逻', '钓鱼', '采集', '种植', '购物', '交谈',
    '聊天', '修炼', '研究', '观望', '休整'];

  /** 每个许可动作可被当作「小活动」的语义范围（做一点、做一会儿），不含起止与结果。 */
  const ACTION_HINTS = {
    '等待': ['等一会儿', '等着', '等候'], '休息': ['歇一会儿', '靠一会儿'], '睡觉': ['打盹', '小睡'],
    '阅读': ['翻书', '看几页'], '工作': ['手头活', '忙一阵'], '学习': ['温习', '翻笔记'],
    '练习': ['比划', '练两手'], '训练': ['练一阵'], '冥想': ['静坐', '调息'], '散步': ['走走', '溜达'],
  };

  const ACTIVE_STATES = ['in_transit', 'arrival_ready'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  /** 找 NPC 记录。`catalog` 可以是数组或 `{npcs:[]}`。 */
  function findNpc(catalog, id) {
    const list = Array.isArray(catalog) ? catalog : (catalog && Array.isArray(catalog.npcs) ? catalog.npcs : []);
    for (const npc of list) if (npc && npc.id === id) return npc;
    return null;
  }
  function findLocation(catalog, id) {
    const list = Array.isArray(catalog) ? catalog : (catalog && Array.isArray(catalog.locations) ? catalog.locations : []);
    for (const loc of list) if (loc && loc.id === id) return loc;
    return null;
  }
  function findRoute(catalog, fromId, toId) {
    const list = catalog && Array.isArray(catalog.routes) ? catalog.routes : [];
    for (const r of list) {
      if (!r) continue;
      if (r.fromId === fromId && r.toId === toId) return r;
    }
    return null;
  }

  /**
   * 同行闭包完整性。返回 `problems`（空数组 = 通过）。
   *   `party` 形态：`{confirmed:false}` 或缺省；给了就必须是**完整成员集**。
   */
  function memberProblem(plan, ctx) {
    const p = plan || {};
    const c = ctx || {};
    const problems = [];
    const push = function (code, detail) { problems.push({ code: code, detail: detail }); };
    const party = p.party;
    const leader = p.npcId != null ? String(p.npcId) : (Array.isArray(p.npcIds) && p.npcIds.length ? String(p.npcIds[0]) : '');
    const ids = [];
    if (leader) ids.push(leader);
    if (Array.isArray(p.npcIds)) for (const id of p.npcIds) { const s = String(id); if (ids.indexOf(s) < 0) ids.push(s); }
    if (party && Array.isArray(party.members)) {
      if (party.confirmed === false) push('party-unconfirmed', '同行闭包未确认');
      for (const m of party.members) {
        const s = String(m == null ? '' : (m.id != null ? m.id : m));
        if (s && ids.indexOf(s) < 0) ids.push(s);
      }
      // 完整覆盖：party 声明的每个成员都必须在 ids 里（上面已并集），反向检查 leader 必须在 party 里。
      if (leader && party.members.map(function (m) { return String(m && m.id != null ? m.id : m); }).indexOf(leader) < 0) {
        push('party-missing-leader', 'party 成员集未包含发起者 ' + leader);
      }
    }
    const cap = settings().closureCap;
    if (ids.length > cap) push('closure-too-large', '同行闭包 ' + ids.length + ' 人 > 上限 ' + cap);
    for (const id of ids) {
      const npc = findNpc(c.catalog, id);
      if (!npc) { push('member-not-found', '角色 ' + id + ' 不在目录里'); continue; }
      if (npc.archived) push('member-archived', '角色 ' + id + ' 已归档');
      if (npc.ignored) push('member-ignored', '角色 ' + id + ' 已忽略');
      if (npc.confirmed !== true) push('member-unconfirmed', '角色 ' + id + ' 未确认');
      if (npc.tracked !== true) push('member-untracked', '角色 ' + id + ' 未纳入跟踪');
      const st = (c.states && c.states[id]) || {};
      if (st.locked) push('member-locked', '角色 ' + id + ' 已锁定');
      if (st.activityLock && st.activityLock.active) push('member-activity-locked', '角色 ' + id + ' 活动已锁定');
      if (ACTIVE_STATES.indexOf(String(st.status || '')) >= 0) push('member-in-transit', '角色 ' + id + ' 正在 ' + st.status);
      if (st.locationId && st.locationId !== 'unknown' && !findLocation(c.catalog, st.locationId)) {
        push('member-location-unconfirmed', '角色 ' + id + ' 的地点 ' + st.locationId + ' 未确认');
      }
    }
    return problems;
  }

  /**
   * 计划准入。`ctx = { catalog, states, playerLocationId, playerPresent:bool }`。
   *   返回 `{ ok, problems, action, isNeutral, note }`；**不修改任何入参**。
   */
  function admit(plan, ctx) {
    const st = settings();
    const out = { ok: false, skipped: false, problems: [], action: '', isNeutral: false, note: '' };
    if (!st.enabled) { out.skipped = true; out.note = 'disabled'; return out; }
    const p = plan || {};
    const c = ctx || {};
    const problems = memberProblem(p, c);

    // 动作封闭性：计划声明的活动必须落在白名单内。缺声明 ⇒ 不是「没动作」，是「没交代」。
    const action = String(p.activity != null ? p.activity : (Array.isArray(p.steps) && p.steps[0] ? p.steps[0].activity : '') || '');
    out.action = action;
    if (!action) problems.push({ code: 'no-activity', detail: '计划未声明活动（缺声明不等于无动作）' });
    else {
      const hit = NEUTRAL_ACTIONS.filter(function (w) { return action.indexOf(w) >= 0; })[0];
      out.isNeutral = !!hit;
      if (!hit) problems.push({ code: 'non-neutral-action', detail: '「' + action.slice(0, 40) + '」不在封闭动作白名单内；需走显式事件通道' });
    }

    // 在场者只能做小活动（major:true ⇒ 越权改写眼前正在发生的事）。
    if (c.playerPresent) {
      const members = Array.isArray(p.npcIds) ? p.npcIds : (p.npcId != null ? [p.npcId] : []);
      for (const id of members) {
        const s = (c.states && c.states[String(id)]) || {};
        if (s.scene === 'present' && p.major === true) {
          problems.push({ code: 'present-major-activity', detail: '在场角色 ' + id + ' 的计划标记为重大活动（在场只允许 major:false）' });
        }
      }
    }

    // travel：必须有已确认路线，时长是正安全整数。
    const steps = Array.isArray(p.steps) ? p.steps : [];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] || {};
      if (String(step.kind || step.type || '') !== 'travel') continue;
      const route = findRoute(c.catalog, step.fromId, step.toId);
      if (!route) problems.push({ code: 'missing-route', detail: '第 ' + (i + 1) + ' 步缺已确认路线 ' + step.fromId + '→' + step.toId });
      else {
        if (route.confirmed !== true) problems.push({ code: 'route-unconfirmed', detail: '第 ' + (i + 1) + ' 步路线未确认' });
        if (!Number.isSafeInteger(route.durationMinutes) || route.durationMinutes <= 0) {
          problems.push({ code: 'bad-route-duration', detail: '第 ' + (i + 1) + ' 步路线时长必须是正整数分钟（实 ' + route.durationMinutes + '）' });
        }
      }
      const dest = findLocation(c.catalog, step.toId);
      if (!dest) problems.push({ code: 'missing-destination', detail: '第 ' + (i + 1) + ' 步目的地 ' + step.toId + ' 不存在' });
      else if (dest.confirmed !== true) problems.push({ code: 'destination-unconfirmed', detail: '第 ' + (i + 1) + ' 步目的地未确认' });
    }

    out.problems = problems;
    out.ok = problems.length === 0;
    out.note = out.ok ? 'admitted' : problems.length + ' 条准入问题';
    return out;
  }

  /**
   * 角色游标轮转：每轮给**一个独立角色**或**一个完整同行闭包**。
   *   `candidates` 必须已经是「有资格被规划」的集合（本模块不再过滤一遍，
   *   避免与 admit 的判据出现两份口径）。
   */
  function pick(candidates, cursor) {
    const st = settings();
    const list = (Array.isArray(candidates) ? candidates : []).filter(function (n) { return n && n.id != null; });
    const out = { ok: false, skipped: false, batch: [], nextCursor: 0, reason: '' };
    if (!st.enabled) { out.skipped = true; out.reason = 'disabled'; return out; }
    if (!list.length) { out.reason = 'no-candidates'; return out; }
    const base = Number.isSafeInteger(Number(cursor)) ? ((Number(cursor) % list.length) + list.length) % list.length : 0;
    const head = list[base];
    // 完整同行闭包优先：head 若带 party 且确认，则整队一起进入本批（不拆开）。
    const party = head.party;
    const batch = [head];
    if (party && party.confirmed !== false && Array.isArray(party.members)) {
      for (const m of party.members) {
        const id = String(m && m.id != null ? m.id : m);
        const hit = list.filter(function (n) { return String(n.id) === id; })[0];
        if (hit && batch.indexOf(hit) < 0) batch.push(hit);
      }
    }
    out.batch = batch.slice(0, st.closureCap);
    out.nextCursor = (base + out.batch.length) % list.length;
    out.ok = out.batch.length > 0;
    out.reason = out.ok ? 'picked' : 'empty';
    return out;
  }

  /**
   * 事件知情交集：`knownBy` 只在「玩家地点 === 事件地点 且 有成员在场」时加 `'player'`。
   *   与 `UNMENTIONED ≠ ABSENT` 对称的另一条：**没写到的知情 ≠ 已知**。
   */
  function knownBy(event, ctx) {
    const e = event || {};
    const c = ctx || {};
    const out = Array.isArray(e.knownBy) ? e.knownBy.slice() : [];
    const has = function (v) { return out.indexOf(v) >= 0; };
    const add = function (v) { if (!has(v)) out.push(v); };
    if (Array.isArray(e.npcIds)) for (const id of e.npcIds) add(String(id));
    if (c.playerLocationId && e.locationId && String(c.playerLocationId) === String(e.locationId)) {
      const present = Array.isArray(e.npcIds) ? e.npcIds.some(function (id) {
        const s = (c.states && c.states[String(id)]) || {};
        return s.scene === 'present';
      }) : false;
      if (present) add('player');
    }
    return out;
  }

  /** 小活动判定：是否是白名单动作，且可以被当作「做一点、做一会儿」。 */
  function isNeutral(action) {
    const text = String(action == null ? '' : action);
    if (!text) return false;
    return NEUTRAL_ACTIONS.some(function (w) { return text.indexOf(w) >= 0; });
  }

  /** 完成事件的固定模板（不交给模型自由发挥）：抵达 / 完成事先计划的 X。 */
  function completionEvent(plan) {
    const p = plan || {};
    const names = (Array.isArray(p.npcIds) ? p.npcIds : (p.npcId != null ? [p.npcId] : []))
      .map(function (id) { return String((p.nameOf && p.nameOf[id]) || id); }).join('、');
    const dest = p.destinationName || p.toName || '';
    const summary = p.summary || p.activity || '';
    if (dest) return names + '抵达' + dest;
    if (summary) return names + '完成了事先计划的' + summary;
    return names + '完成了事先计划的安排';
  }

  const stat = { admits: 0, rejected: 0, picks: 0, knownBys: 0, lastReason: '' };

  WA.planRoster = {
    version: '2.409.0',
    NEUTRAL_ACTIONS: NEUTRAL_ACTIONS,
    ACTION_HINTS: ACTION_HINTS,
    ACTIVE_STATES: ACTIVE_STATES,
    settings: settings, saveSettings: saveSettings,
    findNpc: findNpc, findLocation: findLocation, findRoute: findRoute,
    memberProblem: memberProblem,
    admit: function (plan, ctx) {
      stat.admits++;
      const r = admit(plan, ctx);
      if (!r.ok && !r.skipped) { stat.rejected++; stat.lastReason = r.problems.map(function (p) { return p.code; }).join('+'); }
      return r;
    },
    pick: function (candidates, cursor) { stat.picks++; return pick(candidates, cursor); },
    knownBy: function (event, ctx) { stat.knownBys++; return knownBy(event, ctx); },
    isNeutral: isNeutral,
    completionEvent: completionEvent,
    stats: function () { return Object.assign({}, stat); },
    resetStats: function () { for (const k of Object.keys(stat)) stat[k] = (typeof stat[k] === 'number') ? 0 : ''; },
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/plan-roster.js', { kind: 'engine', ver: '2.409.0' });
  if (WA.log) WA.log('info', 'planRoster 已加载（2.409.0）');
})();