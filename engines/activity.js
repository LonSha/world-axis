/**
 * WorldAxis engines/activity.js (v2.231.0) — EXP-7：可参与的公共活动
 *
 * ── 它治什么（缺口，开工前逐条复核现场）──────────────────────────
 *   计划原文：「**活动筹备、报名/邀请、名额、资源需求、开场、分阶段参与与结果**。
 *   参赛 / 主持 / 观众三种权限分列；天气 / 缺员 / 场地冲突可延期、变更、取消。」
 *   验收原文：「一次有报名条件的比赛从报名到分轮结果，**缺席者不能获奖**；
 *   **雨天延期能同步日程与参与者安排**；**结算一次奖品和关系变化**。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/agenda.js` 是**只读聚合器**：它把 longline / commission / diplomacy /
 *       freight / aftermath 五源的「接下来有什么事」汇成一张表，行形状是
 *       `{ at, kind, source, label, subject, ref, status, canAct, unknown }` ——
 *       它**答不出**「这件事谁报了名、名额还剩几个、开过场没有、分几轮、谁缺席、
 *       奖发了没有」。它读的是**别的模块的排期**，自己**不排期**。
 *     · `engines/contest.js` 答「两个人在一个场景里逐阶段逐轮谁占优、花了多少代价」
 *       —— 那是**对抗的过程**，不是**活动的组织**：没有报名、没有名额、没有观众、
 *       没有奖品发放，也没有「谁缺席」。计划原文明确：contest **只是比赛阶段的一种
 *       结算器**，**不作为所有活动的硬依赖**。
 *     · `engines/liaison.js` 答「谁跟谁接上了头」——那是**关系入口**，不是**活动**。
 *     · `engines/ruling.js` 答「这桩指控立了案没有、谁判的、罚了没有」——那是**裁断**；
 *       活动不是案子（没有被告、没有举证责任、没有管辖）。
 *   四者合起来仍缺的那一格：**「办了一场活动」不是「有一个日程条目」**。
 *   本模块补的就是这一层。
 *
 * ── 机制（六句话）──────────────────────────────────────────────────
 *   ① **活动跨轮**（`store.activity.activities`）：`plan()` 筹备，带标题、地点、
 *      剧情日、名额、计划轮数、资源需求；活动**不是一条日程**，它有状态机。
 *   ② **程序六段**（封闭集 `STATUS`）：`planned`（已筹备）→ `open`（已开放报名）→
 *      `running`（已开场，分轮进行）→ `settled`（已结算）；旁支 `postponed`
 *      （已延期，记 `resumeStatus`）/ `cancelled`（已取消）。顺序不对 ⇒ `bad-phase`。
 *   ③ **三种权限分列**（封闭集 `ROLES`）：`contestant`（参赛）/ `host`（主持）/
 *      `audience`（观众）。报名时定角色，非法角色 ⇒ `bad-role`；
 *      **没有主持不许开场** ⇒ `no-host`。
 *   ④ **缺席者不能获奖**：`settle()` 的获奖名单 = **最后一轮在场**的参赛者；
 *      报过名但最后一轮缺席的人**被排除**，且被排除的人**逐个如实列在回执里**
 *      （`excluded`）—— 不是静默少发一份奖。
 *   ⑤ **雨天延期同步日程与参与者安排**：`postpone()` 读 `weather.weatherOf(place)`；
 *      延期改的是**活动行自己的剧情日**（`day`），而**报名行一行不动** ——
 *      日程（agenda 源）与参与安排（signups）因此自动同步，不需要谁去「重排名单」。
 *   ⑥ **结算一次奖品和关系变化**：`settle()` **先判后扣**（付款方不够 ⇒
 *      `short-prize`，一分不动），发奖走既有资源账（币名读 `economy.money()`，
 *      **不另立币种**）；关系变化写 `people[].profile.relations` 的**量值行**
 *      （可逆的量值），**不写**经历面。奖品来源**逐人**定（`prize.perWinner` 可覆盖
 *      `prize.from`）—— 来源就是获奖者本人时记 `selfAward`（**净流动 0**，
 *      不两头动账：先按总额扣他、再入他一份 = 净扣，那不是发奖）。
 *
 * ── 十六条否定式边界（每条都有判据咬）────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`。
 *   ② **不自动开场**：没有主持（host）就没有主持人 ⇒ `no-host`。
 *   ③ **不建第二份名册**：报名者必须是世界里的人物（`unknown-party`）。
 *   ④ **不超名额**：`quota > 0` 时参赛者满员 ⇒ `quota-full`（主持/观众不计名额）。
 *   ⑤ **不重复报名**：同一人对同一活动只能有一个角色（`already-signed`）。
 *   ⑥ **不跳段**：`planned → open → running → settled` 逐段推进（`bad-phase`）。
 *   ⑦ **收口后不可再动**：`settled` / `cancelled` 之后再报名、再开场、再结算 ⇒
 *      `activity-closed`（终态是终态）。
 *   ⑧ **轮次必须递增**：`round()` 只接受 `n = 已完成轮数 + 1`（`bad-phase`）——
 *      判据是**轮次序数**，不是墙钟毫秒（同一毫秒内两轮不可分，比时间必然不稳）。
 *   ⑨ **不许替未报名者出场**：轮次在场名单里的人必须**已报名为参赛者**（`no-signup`）。
 *   ⑩ **不许凭空发奖**：奖品必须来自**已有资源账**（`short-prize` 先判后扣）。
 *   ⑪ **不静默造钱**：发奖只做「举办方扣 → 获奖者入」，回执带 `moved` 如实报总额。
 *   ⑫ **延期不改名单**：`postpone()` 只改活动行的 `day` 与延期计数，
 *      **报名行一行不动**（回执带 `syncedSignups`，如实报「参与安排未受影响」）。
 *   ⑬ **取消不是结算**：`cancel()` 不发奖、不动关系，只置终态（回执带 `refunded: false`）。
 *   ⑭ **延期要有新日子**：`postpone()` 的 `day` 必须严格晚于当前剧情日（`bad-day`）——
 *      不许「延期到同一天」冒充改期。
 *   ⑮ **注入双闸**：无观察者 ⇒ 空串；未参与任何活动 ⇒ 空串（绝不产出全知版名单）。
 *   ⑯ **不两头动账**：奖品来源**逐人**定；来源就是获奖者本人 ⇒ 记 `selfAward`，
 *      净流动 0（既不先按总额扣他、也不给他入一份 —— 那不是发奖，是扣钱）。
 *      同一付款方被多人分摊时，**先汇总需求再判**（先判后扣是全局的，
 *      不是「每人各自判」—— 否则前一人扣完，后一人才发现不够）。
 *
 * ── 与邻近模块的分工（不是同一件事，故不合并）──────────────────
 *   · `agenda`   —— 「接下来有什么事」（**只读聚合**）；本模块**排期**，它读本模块。
 *   · `contest`  —— 「这一场谁占优」（**对抗结算器**）；本模块**可调它**结算比赛阶段，
 *                   **不依赖**它（庆典 / 集市 / 演出不需要对抗）。
 *   · `liaison`  —— 「谁跟谁接上了头」（**关系入口**）；本模块记的是**活动**。
 *   · `ruling`   —— 「这桩指控怎么判」（**裁断**）；活动不是案子。
 *   · `bonds`    —— 「六型关系的唯一写口」；本模块的关系变化默认写**量值行**，
 *                   只有在调用方显式给出合法六型时才**转交** bonds（不自己写六型）。
 *   · `weather`  —— 「这个地方今天什么天」（**天气真源**）；本模块只**读**它判延期。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_activity_settings_v1';
  const DEF = { enabled: false, maxActivities: 24, maxSignups: 96, maxRounds: 12,
    maxResults: 96, maxAwards: 48, treasury: '', viewer: '' };
  const __REG = { key: LS_KEY, def: DEF, module: 'activity',
    bounds: { maxActivities: [2, 96], maxSignups: [4, 480], maxRounds: [1, 40],
      maxResults: [4, 480], maxAwards: [1, 120] } };
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

  // ── 活动状态（封闭集：自造一个 ⇒ 拒收）──
  const STATUS = ['planned', 'open', 'running', 'settled', 'postponed', 'cancelled'];
  // 推进序（`bad-phase` 的判据；postponed / cancelled 是旁支，不在此表）
  const RANK = { planned: 0, open: 1, running: 2, settled: 3 };
  // ── 三种权限（封闭集：参赛 / 主持 / 观众）──
  const ROLES = ['contestant', 'host', 'audience'];
  // 延期判据的坏天气（读 weather 的六值，取其中两种）
  const BAD_WEATHER = ['rain', 'storm'];

  const stat = { planned: 0, opened: 0, signed: 0, started: 0, rounded: 0, settled: 0,
    postponed: 0, resumed: 0, cancelled: 0, withdrawn: 0, awarded: 0, selfAward: 0, moved: 0,
    excluded: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const p = (root || state()).activity;
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
  }
  function activitiesOf(root) { const b = bagOf(root); return (b && Array.isArray(b.activities)) ? b.activities : []; }
  function signupsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.signups)) ? b.signups : []; }
  function resultsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.results)) ? b.results : []; }
  function awardsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.awards)) ? b.awards : []; }
  function ensure(draft) {
    if (!draft.activity || typeof draft.activity !== 'object' || Array.isArray(draft.activity)) {
      draft.activity = { activities: [], signups: [], results: [], awards: [] };
    }
    const b = draft.activity;
    if (!Array.isArray(b.activities)) b.activities = [];
    if (!Array.isArray(b.signups)) b.signups = [];
    if (!Array.isArray(b.results)) b.results = [];
    if (!Array.isArray(b.awards)) b.awards = [];
    return b;
  }
  function key(v) { return clean(v, 60); }
  function findIn(arr, id) {
    const k = key(id);
    if (!k) return null;
    for (let i = 0; i < arr.length; i++) { if (arr[i] && key(arr[i].id) === k) return arr[i]; }
    return null;
  }
  function activityOf(id, root) { return findIn(activitiesOf(root), id); }
  function signupsFor(id, root) {
    const k = key(id);
    return signupsOf(root).filter(function (s) { return s && key(s.activity) === k; });
  }
  function roundsFor(id, root) {
    const k = key(id);
    return resultsOf(root).filter(function (r) { return r && key(r.activity) === k; })
      .sort(function (a, b) { return (num(a.n) || 0) - (num(b.n) || 0); });
  }
  function awardsFor(id, root) {
    const k = key(id);
    return awardsOf(root).filter(function (a) { return a && key(a.activity) === k; });
  }
  // ── 人物名册：本模块**不建第二份**，只读 world 侧已有的人 ──
  function people(root) {
    const st = (root || state());
    return (st.people && typeof st.people === 'object' && !Array.isArray(st.people)) ? st.people : {};
  }
  function personOf(who, root) {
    const k = key(who);
    if (!k) return null;
    const p = people(root);
    if (p['p_' + k]) return p['p_' + k];
    const keys = Object.keys(p);
    for (let i = 0; i < keys.length; i++) {
      const rec = p[keys[i]];
      if (rec && clean(rec.name, 60) === k) return rec;
    }
    return null;
  }
  function personExists(who, root) { return !!personOf(who, root); }
  /** 钱包：`people[].resources[货币]`。**只在事务内**调用（会物化 resources）。 */
  function purseOf(who, root) {
    const rec = personOf(who, root);
    if (!rec) return null;
    if (!rec.resources || typeof rec.resources !== 'object' || Array.isArray(rec.resources)) rec.resources = {};
    return rec.resources;
  }
  function moneyName() {
    try { if (WA.economy && typeof WA.economy.money === 'function') return WA.economy.money() || '银元'; } catch (e) { /* 如实回落 */ }
    return '银元';
  }
  /**
   * 天气读数：读 weather 真源，**读不到就如实说读不到**（不拿「晴天」冒充）。
   *   ⚠ `weatherOf` 返回的是**回执对象** `{ ok, place, kind, factor }`，**不是**字符串 ——
   *     初稿按字符串取（`clean(w)`），拿到的是空串再回落 `'clear'`，于是**雨天判据恒假**：
   *     「雨天延期」这条验收原文会静默变成「任何天气都能延期且回执说天晴」。实测修正。
   *   未登记该地 / 地名缺失 ⇒ weather 侧回 `ok:false` + `reason`，本模块照抄成「读不到」。
   */
  function weatherAt(place) {
    try {
      if (WA.weather && typeof WA.weather.weatherOf === 'function') {
        const w = WA.weather.weatherOf(clean(place, 40));
        if (w && w.ok === false) {
          return { known: false, weather: '', err: clean(w.reason, 40) || 'weather 未登记该地' };
        }
        const kind = (w && typeof w === 'object') ? clean(w.kind, 20) : clean(w, 20);
        if (!kind) return { known: false, weather: '', err: 'weather 未给出 kind' };
        return { known: true, weather: kind };
      }
    } catch (e) { return { known: false, weather: '', err: String((e && e.message) || e).slice(0, 80) }; }
    return { known: false, weather: '', err: 'weather 缺席' };
  }
  function storyDay() {
    try {
      if (WA.playtime && typeof WA.playtime.story === 'function') {
        const s = WA.playtime.story();
        if (s && typeof s === 'object' && typeof s.dayIndex === 'number') return { ok: true, day: s.dayIndex };
      }
    } catch (e) { /* 回落：剧情钟读不到 ⇒ 未知 */ }
    return { ok: false, day: null };
  }

  // ── ① 筹备 ────────────────────────────────────────────────────────
  /**
   * 筹备一场活动（状态 `planned`）。
   *   `quota = 0` 表示**不限名额**；`rounds` 是**计划**轮数（开场时固定）。
   *   资源需求（`needs`）是自由文本清单 —— 不同题材自己写，本模块不设封闭集。
   */
  function plan(input) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = (input && typeof input === 'object') ? input : {};
    const title = clean(o.title, 60);
    const place = clean(o.place, 40);
    if (!title || !place) return refuse('missing-fields', { need: ['title', 'place'] });
    const id = key(o.id) || ('act-' + String(activitiesOf().length + 1));
    const rounds = Math.max(1, Math.min(cfg.maxRounds, Math.floor(num(o.rounds) || 3)));
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      if (bag.activities.length >= cfg.maxActivities) { out = refuse('activities-full', { cap: cfg.maxActivities }); return false; }
      if (findIn(bag.activities, id)) { out = refuse('already-exists', { activity: id }); return false; }
      const sd = storyDay();
      const day = num(o.day);
      const host = clean(o.host, 60);
      if (host && !personExists(host, draft)) { out = refuse('unknown-party', { who: host }); return false; }
      const row = {
        id: id, title: title, place: place, kind: clean(o.kind, 30) || 'gathering',
        day: (day !== null && day > 0) ? day : null, rounds: rounds,
        quota: Math.max(0, Math.floor(num(o.quota) || 0)),
        roles: (Array.isArray(o.roles) ? o.roles : ROLES.slice()).map(function (r) { return clean(r, 20); }).filter(Boolean),
        needs: (Array.isArray(o.needs) ? o.needs : (o.needs ? [o.needs] : []))
          .map(function (n) { return clean(n, 60); }).filter(Boolean),
        host: host, status: 'planned', resumeStatus: '',
        postponeCount: 0, lastPostpone: '', createdAt: clockNow('activity'),
        dayUnknown: (day === null || !(day > 0)), storyDay: sd.ok ? sd.day : null
      };
      bag.activities.push(row);
      // v2.231.7（回归收口 · EXP-4 补账）：站点 'activity.activities' 此前零调用
      //   （G18「无声明悬空站点」红灯）。`activities-full` 是准入闸，本行是挤出：
      //   已结算/已取消的活动行是复盘证据（不在结算时删），只能环形退场。
      if (WA.evict) WA.evict.array(bag.activities, 'activity.activities', cfg.maxActivities);
      stat.planned++;
      out = { ok: true, activity: Object.assign({}, row), dayUnknown: row.dayUnknown };
      return true;
    }, 'activity:plan');
    return out || refuse('store-unavailable');
  }

  /** 已筹备 ⇒ 开放报名（`planned → open`）。 */
  function open(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      if (RANK[a.status] !== RANK.planned) { out = refuse('bad-phase', { need: 'planned', got: a.status, activity: a.id }); return false; }
      a.status = 'open';
      a.openedAt = clockNow('activity');
      stat.opened++;
      out = { ok: true, activity: Object.assign({}, a), quota: a.quota, roles: (a.roles || []).slice() };
      return true;
    }, 'activity:open');
    return out || refuse('store-unavailable');
  }

  // ── ② 报名 / 邀请（名额 + 角色）──────────────────────────────────
  /**
   * 报名（三种权限分列）。同一人**只能有一个角色**（`already-signed`）。
   *   名额只对 `contestant` 生效（主持/观众不计名额）。
   */
  function signup(id, who, role, note) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const person = clean(who, 60);
    const r = clean(role, 20) || 'contestant';
    if (!person) return refuse('missing-fields', { need: ['who'] });
    if (ROLES.indexOf(r) < 0) return refuse('bad-role', { role: r, allowed: ROLES.slice() });
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      if (a.status !== 'open') { out = refuse('bad-phase', { need: 'open', got: a.status, activity: a.id }); return false; }
      if (!personExists(person, draft)) { out = refuse('unknown-party', { who: person }); return false; }
      const allowed = (Array.isArray(a.roles) && a.roles.length) ? a.roles : ROLES;
      if (allowed.indexOf(r) < 0) { out = refuse('bad-role', { role: r, allowed: allowed.slice(), activity: a.id }); return false; }
      const rows = bag.signups.filter(function (s) { return s && key(s.activity) === key(a.id); });
      const dup = rows.filter(function (s) { return key(s.who) === person; })[0];
      if (dup) { out = refuse('already-signed', { who: person, role: dup.role, activity: a.id }); return false; }
      if (bag.signups.length >= cfg.maxSignups) { out = refuse('signups-full', { cap: cfg.maxSignups }); return false; }
      const contenders = rows.filter(function (s) { return key(s.role) === 'contestant'; }).length;
      if (r === 'contestant' && a.quota > 0 && contenders >= a.quota) {
        out = refuse('quota-full', { activity: a.id, quota: a.quota, contenders: contenders });
        return false;
      }
      const row = { id: 'sg-' + String(bag.signups.length + 1), activity: a.id, who: person,
        role: r, note: clean(note, 60), at: clockNow('activity'), present: null };
      bag.signups.push(row);
      // v2.231.7（回归收口 · EXP-4 补账）：站点 'activity.signups' 此前零调用。
      //   报名行不随活动结算删（B7d：日程与参与安排须保持有效），只能环形挤出。
      if (WA.evict) WA.evict.array(bag.signups, 'activity.signups', cfg.maxSignups);
      stat.signed++;
      out = { ok: true, signup: Object.assign({}, row), contenders: contenders + (r === 'contestant' ? 1 : 0),
        quota: a.quota, left: a.quota > 0 ? Math.max(0, a.quota - (contenders + (r === 'contestant' ? 1 : 0))) : -1 };
      return true;
    }, 'activity:signup');
    return out || refuse('store-unavailable');
  }

  /** 退赛 / 变更（只在 `open` 期；开场后名单冻结）。 */
  function withdraw(id, who) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const person = clean(who, 60);
    if (!person) return refuse('missing-fields', { need: ['who'] });
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      if (a.status !== 'open') { out = refuse('bad-phase', { need: 'open', got: a.status, activity: a.id }); return false; }
      const idx = bag.signups.findIndex(function (s) { return s && key(s.activity) === key(a.id) && key(s.who) === person; });
      if (idx < 0) { out = refuse('no-signup', { who: person, activity: a.id }); return false; }
      const row = bag.signups.splice(idx, 1)[0];
      stat.withdrawn++;
      out = { ok: true, withdrawn: Object.assign({}, row), activity: a.id };
      return true;
    }, 'activity:withdraw');
    return out || refuse('store-unavailable');
  }

  // ── ③ 开场（缺员/无主持不许开场）────────────────────────────────
  /**
   * 开场：`open → running`。**必须有主持**（`no-host`），**必须有参赛者**（`no-signup`）。
   *   开场时把计划轮数固定进活动行，之后 `round()` 按它判上限。
   */
  function start(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      if (RANK[a.status] !== RANK.open) { out = refuse('bad-phase', { need: 'open', got: a.status, activity: a.id }); return false; }
      const rows = bag.signups.filter(function (s) { return s && key(s.activity) === key(a.id); });
      const hosts = rows.filter(function (s) { return key(s.role) === 'host'; });
      const contenders = rows.filter(function (s) { return key(s.role) === 'contestant'; });
      // 活动行自带的 host 字段也算主持人（筹备时指定），但**必须有落名的角色行**才算
      if (!hosts.length) { out = refuse('no-host', { activity: a.id, hint: '没有主持人不许开场' }); return false; }
      if (!contenders.length) { out = refuse('no-signup', { activity: a.id, hint: '没有参赛者' }); return false; }
      a.status = 'running';
      a.startedAt = clockNow('activity');
      // 拆掉上面的主持闸也不该炸成 store-unavailable：`hosts[0]` 对 undefined 取属性会抛，
      // transact 把异常折成「store-unavailable」= 把**具名拒收**折成**崩溃**（拒收码就丢了）。
      a.host = hosts.length ? key(hosts[0].who) : '';
      stat.started++;
      out = { ok: true, activity: Object.assign({}, a), rounds: a.rounds,
        contestants: contenders.map(function (s) { return s.who; }),
        hosts: hosts.map(function (s) { return s.who; }),
        audience: rows.filter(function (s) { return key(s.role) === 'audience'; }).map(function (s) { return s.who; }) };
      return true;
    }, 'activity:start');
    return out || refuse('store-unavailable');
  }

  // ── ④ 分轮结果（缺席者在这里被记下来）──────────────────────────
  /**
   * 落一轮结果。`n` 必须等于**已完成轮数 + 1**（判据是序数，不是时间）。
   *   `present` 里的人必须**已报名为参赛者**（`no-signup`）；
   *   缺席者 = 参赛者 − present，**逐个记进结果行**（结算时据此排除）。
   */
  function round(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = (opts && typeof opts === 'object') ? opts : {};
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      if (a.status !== 'running') { out = refuse('bad-phase', { need: 'running', got: a.status, activity: a.id }); return false; }
      const done = bag.results.filter(function (r) { return r && key(r.activity) === key(a.id); });
      const n = Math.floor(num(o.n) || 0);
      if (!(n > 0) || n !== done.length + 1) {
        out = refuse('bad-phase', { need: done.length + 1, got: num(o.n), activity: a.id,
          hint: '轮次必须递增（序数判据，不比墙钟时间）' });
        return false;
      }
      if (done.length + 1 > a.rounds) { out = refuse('bad-phase', { need: '轮次已满', got: n, planned: a.rounds, activity: a.id }); return false; }
      if (bag.results.length >= cfg.maxResults) { out = refuse('results-full', { cap: cfg.maxResults }); return false; }
      const rows = bag.signups.filter(function (s) { return s && key(s.activity) === key(a.id) && key(s.role) === 'contestant'; });
      const roster = rows.map(function (s) { return key(s.who); });
      const present = (Array.isArray(o.present) ? o.present : []).map(function (x) { return key(x); }).filter(Boolean);
      const outsider = present.filter(function (w) { return roster.indexOf(w) < 0; });
      if (outsider.length) { out = refuse('no-signup', { who: outsider, activity: a.id, hint: '未报名为参赛者不能出场' }); return false; }
      const absent = roster.filter(function (w) { return present.indexOf(w) < 0; });
      const row = { id: 'rd-' + String(bag.results.length + 1), activity: a.id, n: n,
        present: present.slice(), absent: absent.slice(),
        note: clean(o.note, 60), at: clockNow('activity') };
      bag.results.push(row);
      // v2.231.7（回归收口 · EXP-4 补账）：站点 'activity.results' 此前零调用。
      //   逐轮结果是在场与缺席的唯一留痕，只环形挤出、不原地删。
      if (WA.evict) WA.evict.array(bag.results, 'activity.results', cfg.maxResults);
      // 报名行的在场标记按**最新一轮**刷新（结算只认最后一轮）
      rows.forEach(function (s) { s.present = present.indexOf(key(s.who)) >= 0; s.lastRound = n; });
      stat.rounded++;
      out = { ok: true, round: Object.assign({}, row), remaining: Math.max(0, a.rounds - n),
        roster: roster.slice(), absent: absent.slice(), isFinal: n >= a.rounds };
      return true;
    }, 'activity:round');
    return out || refuse('store-unavailable');
  }

  // ── ⑤ 结算（奖品 + 关系变化；缺席者不能获奖）────────────────────
  /**
   * 结算一次：发奖 + 记关系变化。
   *   · 获奖名单 = **最后一轮在场**的参赛者；最后一轮缺席者**逐个列进 `excluded`**；
   *   · 奖品 **先判后扣**（不够 ⇒ `short-prize`，一分不动），只走既有资源账；
   *   · 关系变化写 `people[].profile.relations` 的**量值行**（可逆），
   *     显式给出合法六型时才转交 `bonds.setBond`。
   */
  function settle(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = (opts && typeof opts === 'object') ? opts : {};
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      if (a.status !== 'running') { out = refuse('bad-phase', { need: 'running', got: a.status, activity: a.id }); return false; }
      const rounds = bag.results.filter(function (r) { return r && key(r.activity) === key(a.id); })
        .sort(function (x, y) { return (num(x.n) || 0) - (num(y.n) || 0); });
      if (!rounds.length) { out = refuse('bad-phase', { need: '至少一轮结果', got: 0, activity: a.id }); return false; }
      const rows = bag.signups.filter(function (s) { return s && key(s.activity) === key(a.id); });
      const contenders = rows.filter(function (s) { return key(s.role) === 'contestant'; });
      const last = rounds[rounds.length - 1];
      const present = (Array.isArray(last.present) ? last.present : []).map(function (x) { return key(x); });
      const winners = contenders.map(function (s) { return key(s.who); }).filter(function (w) { return present.indexOf(w) >= 0; });
      const excluded = contenders.map(function (s) { return key(s.who); }).filter(function (w) { return present.indexOf(w) < 0; });
      if (!winners.length) { out = refuse('no-signup', { activity: a.id, hint: '最后一轮无人到场，无人可获奖', excluded: excluded }); return false; }
      if (bag.awards.length + winners.length > cfg.maxAwards) {
        out = refuse('awards-full', { cap: cfg.maxAwards, need: winners.length, have: bag.awards.length });
        return false;
      }
      // ── 奖品：**逐人**定来源，先判后扣 ──
      //   ⚠ 初稿把来源定成**一个**（`prize.from || host || treasury`），然后「来源扣总额 →
      //     每个获奖者入自己那份」。当获奖者**就是**来源本人时（主持兼参赛，常见），
      //     这个人被**两头动账**：先扣 N×amount，再入 amount ⇒ 实测余额从 100 变 93。
      //     那不是「发奖」，那是**扣钱**。故改为逐人定来源：
      //       · 来源就是获奖者自己 ⇒ 记 `selfAward`（自掏腰包给自己发奖 = 净流动 0，如实记账）；
      //       · 同一付款方多人分摊 ⇒ 先**汇总需求**再一次性判够不够（先判后扣是全局的，
      //         不是「每人各自判」——否则前一个人扣完，后一个人才发现不够）。
      const prize = (o.prize && typeof o.prize === 'object') ? o.prize : {};
      const amount = Math.max(0, num(prize.amount) || 0);
      const material = clean(prize.material, 30) || moneyName();
      const fallbackFrom = clean(prize.from, 60) || clean(a.host, 60) || clean(cfg.treasury, 60);
      const perWinner = (prize.perWinner && typeof prize.perWinner === 'object' && !Array.isArray(prize.perWinner)) ? prize.perWinner : {};
      const plan = [];
      const demand = {};
      winners.forEach(function (w) {
        const src = clean(perWinner[w], 60) || fallbackFrom;
        if (!src) { plan.push({ who: w, from: '', amount: amount, self: false, missing: true }); return; }
        if (src === w) { plan.push({ who: w, from: w, amount: amount, self: true, missing: false }); return; }
        plan.push({ who: w, from: src, amount: amount, self: false, missing: false });
        demand[src] = Math.round(((demand[src] || 0) + amount) * 100) / 100;
      });
      const noSource = plan.filter(function (x) { return x.missing; });
      if (noSource.length) {
        out = refuse('short-prize', { who: noSource.map(function (x) { return x.who; }),
          need: amount, have: 0, why: 'no-source',
          hint: '给不出奖品来源（未给 prize.from、活动也没有主持、settings.treasury 为空）' });
        return false;
      }
      const payers = Object.keys(demand);
      // 先判：**所有**付款方都得够（一处不够 ⇒ 整体不动，不出现「扣了一半又失败」）
      for (let i = 0; i < payers.length; i++) {
        const k = payers[i];
        const src = purseOf(k, draft);
        const have = src ? +((src[material] || 0)).toFixed(2) : 0;
        if (!src || have < demand[k]) {
          out = refuse('short-prize', { from: k, material: material, need: demand[k], have: have });
          return false;
        }
      }
      // 后扣 / 后入
      let moved = 0;
      let selfAwarded = 0;
      payers.forEach(function (k) {
        const src = purseOf(k, draft);
        src[material] = Math.round(((+((src[material] || 0)).toFixed(2)) - demand[k]) * 100) / 100;
      });
      plan.forEach(function (x) {
        if (x.self) { selfAwarded++; return; }   // 净流动 0：不两头动账
        const p = purseOf(x.who, draft);
        if (!p) return;
        p[material] = Math.round(((+(p[material] || 0)) + x.amount) * 100) / 100;
        moved = Math.round((moved + x.amount) * 100) / 100;
      });
      const total = Math.round(amount * winners.length * 100) / 100;
      // ── 关系变化：量值行（可逆），不是经历面；对象按**逐人**来源定 ──
      const delta = (o.delta && typeof o.delta === 'object') ? o.delta : { intimacy: 1, trust: 1 };
      const rel = [];
      winners.forEach(function (w) {
        const x = plan.filter(function (y) { return y.who === w; })[0] || {};
        const target = x.self ? '' : (x.from || '');
        const row = bumpRelation(draft, w, target, delta);
        if (row) rel.push({ who: w, target: target, intimacy: row.intimacy, trust: row.trust, hostility: row.hostility });
      });
      // ── 显式给出合法六型时才转交 bonds（不自己写六型）──
      //   自奖（来源=获奖者自己）不产生关系对象 ⇒ 不转交。
      let bond = null;
      const types = (Array.isArray(o.bondTypes) ? o.bondTypes : []).map(function (t) { return clean(t, 12); }).filter(Boolean);
      const bondWho = plan.filter(function (x) { return !x.self && x.from; })[0] || null;
      if (types.length && bondWho && WA.bonds && typeof WA.bonds.setBond === 'function') {
        // ⚠ **不自己包一层 catch**：初稿写 `catch (e) { bond = {reason:'bonds-threw'} }`，
        //   那会造出一个**新的静默码**（拒收码门禁当场判「未分类」），而且把一个
        //   **具名拒收**（bonds 自己回的 `missing-fields` / `same-person` / `bad-type`）
        //   折成「它抛了」—— 归因反而变粗。bonds 的拒收原因**照抄带出去**，
        //   它是六型关系的唯一写口，本模块只转交、不改写它的判据。
        bond = WA.bonds.setBond(bondWho.who, bondWho.from, types);
      }
      winners.forEach(function (w) {
        const x = plan.filter(function (y) { return y.who === w; })[0] || {};
        bag.awards.push({ id: 'aw-' + String(bag.awards.length + 1), activity: a.id, who: w,
          material: material, amount: amount, from: x.self ? w : (x.from || ''),
          selfAward: !!x.self, at: clockNow('activity') });
      });
      // v2.231.7（回归收口 · EXP-4 补账）：站点 'activity.awards' 此前零调用。
      //   放在 winners.forEach 之后而非循环体内：一次结算整批发奖，
      //   逐条挤出会把同一批的发放行切散（挤出是「环形退最旧」，不是「按批裁」）。
      if (WA.evict) WA.evict.array(bag.awards, 'activity.awards', cfg.maxAwards);
      a.status = 'settled';
      a.settledAt = clockNow('activity');
      stat.settled++; stat.awarded += winners.length; stat.moved = Math.round((stat.moved + moved) * 100) / 100;
      stat.selfAward += selfAwarded;
      stat.excluded += excluded.length;
      out = { ok: true, activity: Object.assign({}, a), winners: winners.slice(), excluded: excluded.slice(),
        rounds: rounds.length,
        prize: { material: material, amount: amount, from: fallbackFrom, total: total,
          perWinner: plan.map(function (x) { return { who: x.who, from: x.self ? x.who : x.from, selfAward: !!x.self }; }) },
        moved: moved, selfAwarded: selfAwarded, relations: rel, bond: bond,
        note: '缺席者不获奖（' + (excluded.length ? ('已排除：' + excluded.join('、')) : '无缺席') + '）'
          + '；奖品走既有资源账，币名 ' + material + '（实际流动 ' + moved
          + (selfAwarded ? '；' + selfAwarded + ' 人自奖，净流动 0' : '') + '）' };
      return true;
    }, 'activity:settle');
    return out || refuse('store-unavailable');
  }
  /** 关系量值行 upsert（同 target 累加，不重复建行）。 */
  function bumpRelation(root, who, target, delta) {
    const rec = personOf(who, root);
    if (!rec) return null;
    if (!rec.profile || typeof rec.profile !== 'object' || Array.isArray(rec.profile)) rec.profile = {};
    if (!Array.isArray(rec.profile.relations)) rec.profile.relations = [];
    const list = rec.profile.relations;
    const t = clean(target, 60);
    let row = null;
    for (let i = 0; i < list.length; i++) { if (list[i] && clean(list[i].target, 60) === t) { row = list[i]; break; } }
    if (!row) {
      row = { target: t, intimacy: 0, trust: 0, hostility: 0, vigilance: 0, attachment: 0,
        boundary_status: '', at: clockNow('activity') };
      list.push(row);
    }
    ['intimacy', 'trust', 'hostility', 'vigilance', 'attachment'].forEach(function (f) {
      const d = num(delta[f]);
      if (d === null) return;
      row[f] = Math.round(((num(row[f]) || 0) + d) * 100) / 100;
    });
    row.at = clockNow('activity');
    return row;
  }

  // ── ⑥ 延期 / 恢复 / 取消 ────────────────────────────────────────
  /**
   * 延期：**只改活动行自己的剧情日**（`day`），**报名行一行不动** ——
   *   日程（agenda 源）与参与安排（signups）因此自动同步。
   *   天气判据读 `weather.weatherOf(place)`；读不到就如实说读不到（不拿晴天冒充）。
   */
  function postpone(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = (opts && typeof opts === 'object') ? opts : {};
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      if (a.status === 'postponed') { out = refuse('bad-phase', { need: '非延期态', got: a.status, activity: a.id }); return false; }
      const sd = storyDay();
      const cur = num(a.day);
      const next = num(o.day);
      if (next === null || !(next > 0)) { out = refuse('bad-day', { got: o.day, activity: a.id, hint: '延期的日子必须是正数剧情日' }); return false; }
      if (cur !== null && !(next > cur)) { out = refuse('bad-day', { got: next, cur: cur, activity: a.id, hint: '延期必须改到更晚的日子' }); return false; }
      const w = weatherAt(a.place);
      const bad = w.known && BAD_WEATHER.indexOf(w.weather) >= 0;
      // 雨天是**充分**理由（可延期）；非雨天也不禁止（缺员/场地冲突同样可延期），
      //   但回执必须如实报**是不是**天气造成的 —— 不许把「缺员」写成「下雨」。
      const rows = bag.signups.filter(function (s) { return s && key(s.activity) === key(a.id); });
      a.resumeStatus = a.status;
      a.status = 'postponed';
      a.day = next;
      a.postponeCount = (num(a.postponeCount) || 0) + 1;
      a.lastPostpone = clean(o.reason, 60) || (bad ? 'weather:' + w.weather : 'unspecified');
      stat.postponed++;
      out = { ok: true, activity: Object.assign({}, a), from: cur, to: next,
        weather: w.known ? w.weather : 'unknown', weatherKnown: w.known, weatherErr: w.err || '',
        weatherCaused: bad, reason: a.lastPostpone,
        syncedSignups: rows.length, signupsUntouched: true, storyDay: sd.ok ? sd.day : null,
        note: '改期只动活动行的剧情日；报名行一行未动（' + rows.length + ' 条参与安排保持有效）'
          + (w.known ? '' : '；⚠ 天气读不到（' + (w.err || 'weather 缺席') + '），本次延期**不是**天气判据') };
      return true;
    }, 'activity:postpone');
    return out || refuse('store-unavailable');
  }

  /** 恢复：`postponed → resumeStatus`（回到延期前的阶段，不跳段）。 */
  function resume(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status !== 'postponed') { out = refuse('bad-phase', { need: 'postponed', got: a.status, activity: a.id }); return false; }
      const back = clean(a.resumeStatus, 20);
      if (!(back in RANK)) { out = refuse('bad-phase', { need: 'resumeStatus 合法', got: a.resumeStatus, activity: a.id }); return false; }
      a.status = back;
      a.resumeStatus = '';
      stat.resumed++;
      out = { ok: true, activity: Object.assign({}, a), status: back };
      return true;
    }, 'activity:resume');
    return out || refuse('store-unavailable');
  }

  /** 取消：置终态。**不发奖、不动关系、不退款**（取消不是结算）。 */
  function cancel(id, reason) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const a = findIn(bag.activities, id);
      if (!a) { out = refuse('no-such-activity', { activity: key(id) }); return false; }
      if (a.status === 'settled' || a.status === 'cancelled') { out = refuse('activity-closed', { activity: a.id, status: a.status }); return false; }
      a.status = 'cancelled';
      a.cancelReason = clean(reason, 60);
      a.cancelledAt = clockNow('activity');
      stat.cancelled++;
      out = { ok: true, activity: Object.assign({}, a), reason: a.cancelReason,
        awarded: 0, refunded: false, relations: 0,
        note: '取消不发奖、不动关系（取消不是结算）' };
      return true;
    }, 'activity:cancel');
    return out || refuse('store-unavailable');
  }

  // ── 读面 ────────────────────────────────────────────────────────
  function activityOfRead(id) {
    const a = activityOf(id);
    return a ? Object.assign({}, a) : null;
  }
  function signupsRead(id) {
    return signupsFor(id).map(function (s) {
      return { who: s.who, role: s.role, note: s.note, at: s.at, present: s.present, lastRound: num(s.lastRound) };
    });
  }
  function roundsRead(id) {
    return roundsFor(id).map(function (r) {
      return { n: num(r.n), present: (r.present || []).slice(), absent: (r.absent || []).slice(), note: r.note, at: r.at };
    });
  }
  function awardsRead(id) {
    return awardsFor(id).map(function (a) {
      return { who: a.who, material: a.material, amount: num(a.amount), from: a.from, at: a.at };
    });
  }
  function list(opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', rows: [] };
    const o = (opts && typeof opts === 'object') ? opts : {};
    const wantStatus = clean(o.status, 20);
    const rows = activitiesOf().filter(function (a) { return a && (!wantStatus || clean(a.status, 20) === wantStatus); })
      .map(function (a) {
        const rows2 = signupsFor(a.id);
        return { id: a.id, title: a.title, place: a.place, kind: a.kind, day: num(a.day),
          dayUnknown: !!a.dayUnknown, status: a.status, resumeStatus: a.resumeStatus || '',
          quota: num(a.quota) || 0, rounds: num(a.rounds) || 0,
          contenders: rows2.filter(function (s) { return key(s.role) === 'contestant'; }).length,
          hosts: rows2.filter(function (s) { return key(s.role) === 'host'; }).length,
          audience: rows2.filter(function (s) { return key(s.role) === 'audience'; }).length,
          roundsDone: roundsFor(a.id).length, awards: awardsFor(a.id).length,
          postponeCount: num(a.postponeCount) || 0 };
      });
    return { ok: true, rows: rows, count: rows.length,
      note: '未知剧情日保持未知（不用「现在」冒充）；名额 0 表示不限' };
  }
  function view(id) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const a = activityOf(id);
    if (!a) return { ok: false, reason: 'no-such-activity', activity: key(id) };
    return { ok: true, activity: Object.assign({}, a), signups: signupsRead(a.id),
      rounds: roundsRead(a.id), awards: awardsRead(a.id), money: moneyName() };
  }

  /**
   * 注入块：**两道闸**（无观察者 ⇒ 空串；没参与任何活动 ⇒ 空串）。
   *   只列观察者自己是参与者的活动（参赛 / 主持 / 观众）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const viewer = clean(cfg.viewer, 60);
    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版活动名单）
    const mine = activitiesOf().filter(function (a) {
      if (!a) return false;
      return signupsFor(a.id).some(function (s) { return s && key(s.who) === viewer; });
    });
    if (!mine.length) return '';   // 没参与任何活动 ⇒ 仍是零 token（纵深防御）
    const lines = mine.map(function (a) {
      const rows = signupsFor(a.id);
      const me = rows.filter(function (s) { return key(s.who) === viewer; })[0] || {};
      const done = roundsFor(a.id).length;
      const contenders = rows.filter(function (s) { return key(s.role) === 'contestant'; }).length;
      return '· ' + a.id + '：' + a.title + '（' + a.place + '）'
        + '｜' + a.status + (a.status === 'postponed' ? '→' + (a.resumeStatus || '?') : '')
        + '｜剧情日 ' + (num(a.day) === null ? '未定' : String(a.day))
        + '｜我 ' + (me.role || '?')
        + '｜轮次 ' + done + '/' + (num(a.rounds) || 0)
        + '｜参赛 ' + contenders + (a.quota > 0 ? '/' + a.quota : '');
    });
    return '[活动]\n' + lines.join('\n')
      + '\n报名有条件的活动按名额收人，满员不再收；缺席者不获奖；已结算的活动不再改名单；'
      + '延期只改日子，已确认的参与安排继续有效。\n';
  }
  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }
  function resetStat() {
    stat.planned = 0; stat.opened = 0; stat.signed = 0; stat.started = 0; stat.rounded = 0;
    stat.settled = 0; stat.postponed = 0; stat.resumed = 0; stat.cancelled = 0; stat.withdrawn = 0;
    stat.awarded = 0; stat.selfAward = 0; stat.moved = 0; stat.excluded = 0; stat.blocked = 0; stat.lastReason = '';
    stat.faults = {};
    return { ok: true };
  }
  function reload() { return { ok: true, rows: activitiesOf().length }; }
  function reset() {
    let out = null;
    WA.store.transact(function (draft) {
      draft.activity = { activities: [], signups: [], results: [], awards: [] };
      out = { ok: true };
      return true;
    }, 'activity:reset');
    resetStat();
    return out || refuse('store-unavailable');
  }

  WA.activity = {
    STATUS: STATUS.slice(), ROLES: ROLES.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    plan: plan, open: open, signup: signup, withdraw: withdraw, start: start,
    round: round, settle: settle, postpone: postpone, resume: resume, cancel: cancel,
    activityOf: activityOfRead, signups: signupsRead, rounds: roundsRead, awards: awardsRead,
    list: list, view: view, buildBlock: buildBlock,
    stat: statView, resetStat: resetStat, reset: reset, reload: reload
  };
  var EXPORT_COUNT = 25;
  var _exported = Object.keys(WA.activity).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('activity: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/activity.js', { kind: 'engine', ver: '2.231.0' });
})();