#!/usr/bin/env node
/**
 * v2.409.0 专锁：跨参照物缝合批（elapsed-evidence / source-reconcile / plan-roster / run-observer）
 *
 *  真数据驱动：`ui-gate-sync.fresh({})` 造真 WA 环境，逐引擎断言行为，不用桩。
 *  四把锁各自对上一个真实参照物，且**每把都钉住一条上游易写错的否定分支**：
 *    ① elapsed-evidence ← npc-life `parseElapsedEvidence`：四层拒绝 + 双重校验
 *    ② source-reconcile ← npc-life `reconcile`/`undoTurns`：appended 不失效 / 撤后缀 / 去重
 *    ③ plan-roster      ← npc-life `memberProblem`/`neutralAction`：闭包完整 / 白名单封闭
 *    ④ run-observer     ← st-4a-guard `STREAM_POLICY`：心跳归观测者 / 双口径空闲 / 预算收缩
 *
 *  ⚠ 本锁只读源码做**接线判据**（T5），不做行为模拟：接线断了的后果是「引擎存在但没人调」，
 *    而行为判据拿不到这类故障（引擎自己单测全绿，产品里零消费）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  require(path.join(BASE, 'engines/elapsed-evidence.js'));
  require(path.join(BASE, 'engines/source-reconcile.js'));
  require(path.join(BASE, 'engines/plan-roster.js'));
  const obsMod = require(path.join(BASE, 'tools/run-observer.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const src = function (f) { return fs.readFileSync(path.join(BASE, f), 'utf8'); };

  // ══ ① elapsed-evidence ══════════════════════════════════════════
  const EE = WA.elapsedEvidence;
  a(!!EE && typeof EE.parse === 'function', 'EE-1 elapsedEvidence 已挂到 WA');
  a(typeof EE.parse === 'function' && typeof EE.verify === 'function' && typeof EE.autoMinutes === 'function',
    'EE-2 parse/verify/autoMinutes 三件齐全');

  // 正向：无争议的时长
  a(EE.parse('三个小时后他回来了').ok === true && EE.parse('三个小时后他回来了').minutes === 180, 'EE-3 三小时 = 180 分钟');
  a(EE.parse('我等了半小时').ok === true && EE.parse('我等了半小时').minutes === 30, 'EE-4 半小时 = 30 分钟');
  a(EE.parse('两天过去').ok === true && EE.parse('两天过去').minutes === 2880, 'EE-5 两天 = 2880 分钟');
  a(EE.parse('十五分钟后').ok === true && EE.parse('十五分钟后').minutes === 15, 'EE-6 中文数字十五 = 15（用「后」不用「以后」：后者属未来层，本就该拒）');

  // 四层拒绝：各自独立，不能塌成同一个 reason
  const rQuote = EE.parse('他说「等五分钟」');
  a(rQuote.ok === false && rQuote.reason === 'quoted', 'EE-7 引号内时长 ⇒ quoted');
  const rHyp = EE.parse('如果你明天来');
  a(rHyp.ok === false && rHyp.reason === 'hypothetical', 'EE-8 假设语气 ⇒ hypothetical');
  const rNeed = EE.parse('这趟需要三个小时');
  a(rNeed.ok === false && rNeed.reason === 'need-cost', 'EE-9 需求/成本 ⇒ need-cost');
  const rPast = EE.parse('三天前就说过');
  a(rPast.ok === false && rPast.reason === 'past-or-negated', 'EE-10 溯往 ⇒ past-or-negated');

  // 明确零：先于否定层
  const rZero = EE.parse('没有时间变化');
  a(rZero.ok === true && rZero.minutes === 0 && rZero.reason === 'explicit-zero', 'EE-11 明确零先于否定层');

  // 复合时长不折算
  const rSeq = EE.parse('三天又五小时');
  a(rSeq.ok === false && (rSeq.reason === 'multiple-durations' || rSeq.reason === 'ambiguous-sequence'),
    'EE-12 复合时长不折算（拒）');

  // 残留单位不截断
  const rResid = EE.parse('三个小时，另外五天的路程');
  a(rResid.ok === false, 'EE-13 残留单位必须拒（不截成 180）');

  // 上界
  a(EE.parse('三十天').ok === false && EE.parse('三十天').reason === 'out-of-range', 'EE-14 超 10080 分钟 ⇒ out-of-range');
  a(EE.MINUTES_CAP === 10080, 'EE-15 上界 10080');

  // 双重校验：这是本引擎相对正则的全部增量
  const srcText = '他坐下来。三个小时后，雨停了。';
  const vOk = EE.verify(srcText, '三个小时', 180);
  a(vOk.ok === true && vOk.expected === 180 && vOk.actual === 180, 'EE-16 模型 180 ⇔ 原文三小时 ⇒ 通过');
  const vBad = EE.verify(srcText, '三个小时', 200);
  a(vBad.ok === false && /^mismatch/.test(vBad.reason), 'EE-17 模型 200 ⇔ 原文三小时 ⇒ mismatch');
  const vNoEv = EE.verify(srcText, '五个小时', 300);
  a(vNoEv.ok === false && vNoEv.reason.indexOf('evidence') >= 0, 'EE-18 证据不在原文 ⇒ evidence-*');
  const vHypClause = EE.verify('如果他三小时后来。', '三小时', 180);
  a(vHypClause.ok === false && vHypClause.reason.indexOf('clause-hypothetical') >= 0,
    'EE-19 证据在假设分句里 ⇒ clause-hypothetical（不是 accepted）');

  // autoMinutes 三重门槛
  a(EE.autoMinutes({ timeConfidence: 0.5, timeEvidence: '三个小时', deltaMinutes: 180 }, srcText).reason === 'low-confidence',
    'EE-20 置信度不足 ⇒ low-confidence');
  a(EE.autoMinutes({ timeConfidence: 0.95, timeEvidence: '三个小时', deltaMinutes: 180 }, srcText).ok === true,
    'EE-21 三重达标 ⇒ 准入');
  a(EE.autoMinutes({ timeConfidence: 0.95, timeEvidence: '三个小时', deltaMinutes: 60 }, srcText).ok === false,
    'EE-22 置信度高但分钟数不符 ⇒ 仍拒');

  // 统计与开关
  EE.resetStats();
  EE.parseTracked('三个小时后'); EE.parseTracked('大约三天');
  a(EE.stats().accepted === 1 && EE.stats().refused === 1, 'EE-23 追踪计数 accepted/refused 分离');
  a(EE.settings().enabled === true, 'EE-24 默认开（v2.412.0 全开策略跟位）');
  a(src('engines/elapsed-evidence.js').indexOf('transact') < 0, 'EE-25 零 store 写（无 transact）');

  // ══ ② source-reconcile ══════════════════════════════════════════
  const SR = WA.sourceReconcile;
  a(!!SR && typeof SR.reconcile === 'function', 'SR-1 sourceReconcile 已挂到 WA');
  SR.saveSettings({ enabled: true });

  const baseSources = [{ key: 'm1', hash: 'a' }, { key: 'm2', hash: 'b' }, { key: 'm3', hash: 'c' }];
  a(SR.firstDrift(baseSources, baseSources.map(function (x) { return Object.assign({}, x); })) === null,
    'SR-2 完全一致 ⇒ 无漂移');

  // **核心否定判据**：appended 不失效（新消息不会让旧结论变错）
  const app = SR.firstDrift(baseSources, baseSources.concat([{ key: 'm4', hash: 'd' }]));
  a(app && app.kind === 'appended' && app.blocking === false, 'SR-3 appended ⇒ 不 blocking（关键否定分支）');

  const edited = SR.firstDrift(baseSources, [{ key: 'm1', hash: 'a' }, { key: 'm2', hash: 'X' }, { key: 'm3', hash: 'c' }]);
  a(edited && edited.kind === 'edited' && edited.blocking === true && edited.index === 1, 'SR-4 edited ⇒ blocking 且定位到位');
  const deleted = SR.firstDrift(baseSources, [{ key: 'm1', hash: 'a' }]);
  a(deleted && deleted.kind === 'deleted' && deleted.index === 1, 'SR-5 deleted ⇒ 定位到截断位');
  const switched = SR.firstDrift(baseSources, [{ key: 'm9', hash: 'a' }, { key: 'm2', hash: 'b' }, { key: 'm3', hash: 'c' }]);
  a(switched && switched.kind === 'switched' && switched.index === 0, 'SR-6 switched ⇒ 定位到第 0 位');

  // 前置快照撤销：撤首再到尾
  const tl = {
    revision: 7, turnIndex: 3, clockMinutes: 120,
    turns: [
      { id: 't0', title: '第一回合', sourceKeys: ['0'], sourceIndex: 0, before: { revision: 5, turnIndex: 0, clockMinutes: 0, turns: [] } },
      { id: 't1', title: '第二回合', sourceKeys: ['1'], sourceIndex: 1, before: { revision: 6, turnIndex: 1, clockMinutes: 60 } },
      { id: 't2', title: '第三回合', sourceKeys: ['2'], sourceIndex: 2, before: { revision: 7, turnIndex: 2, clockMinutes: 120 } },
    ],
  };
  const u1 = SR.undoFrom(tl, 1);
  a(u1.ok === true && u1.timeline.turns.length === 1 && u1.revoked.length === 2, 'SR-7 从第 1 回合撤 ⇒ 剩 1 个、撤 2 个');
  a(u1.revoked[0].id === 't1' && u1.revoked[1].id === 't2', 'SR-8 被撤记录按正序回带');
  a(u1.timeline.clockMinutes === 60, 'SR-9 时钟随 before 一并回退（时间属状态）');
  a(u1.timeline.revision === 8, 'SR-10 撤销使 revision 前进（不是回退）');
  a(SR.undoFrom(tl, 3).reason === 'nothing-to-undo', 'SR-11 撤末尾 ⇒ nothing-to-undo');
  a(SR.undoFrom(tl, 9).reason.indexOf('bad-index') === 0, 'SR-12 越界下标 ⇒ bad-index');

  // 缺 before 快照必须拒，不得凭猜回退
  const noBefore = { turns: [{ id: 'x', sourceKeys: ['0'] }] };
  a(SR.undoFrom(noBefore, 0).reason.indexOf('missing-before') === 0, 'SR-13 缺 before ⇒ 拒（不猜）');

  // reconcile 全链
  const tl2 = JSON.parse(JSON.stringify(tl));
  tl2.baselineSources = baseSources;
  const rc = SR.reconcile(tl2, [{ key: 'm1', hash: 'a' }, { key: 'm2', hash: 'X' }, { key: 'm3', hash: 'c' }]);
  a(rc.ok === true && rc.from === 1 && rc.revoked.length === 2, 'SR-14 reconcile 定位 from=1 并撤后缀');
  a(/已被编辑/.test(rc.timeline.pausedReason), 'SR-15 pausedReason 明示「已被编辑」');
  a(Array.isArray(rc.timeline.invalidReconciliations) && rc.timeline.invalidReconciliations.length === 1,
    'SR-16 invalidReconciliations 记下漂移');
  // 去重：同一漂移再来一次不重复撤
  const rc2 = SR.reconcile(rc.timeline, [{ key: 'm1', hash: 'a' }, { key: 'm2', hash: 'X' }, { key: 'm3', hash: 'c' }]);
  a(rc2.repeated === true && rc2.revoked.length === 0, 'SR-17 同漂移重复对账 ⇒ repeated 且不再撤');
  // appended-only 不对账
  const rc3 = SR.reconcile(tl2, baseSources.concat([{ key: 'm4', hash: 'd' }]));
  a(rc3.reason === 'appended-only' && rc3.revoked.length === 0, 'SR-18 仅追加 ⇒ appended-only，不动');
  // 关闭时一律不动
  SR.saveSettings({ enabled: false });
  a(SR.reconcile(tl2, [{ key: 'm1', hash: 'ZZZ' }]).skipped === true, 'SR-19 关闭时 skipped');
  SR.saveSettings({ enabled: true });

  // 复合票据：逐项比对，任一项变即丢
  const ticket = SR.capture({ identity: 'chat-A', chat: 1, world: 'w1', stateRevision: 5, revision: 7, signature: 'sig', sources: baseSources });
  a(SR.current(ticket, { identity: 'chat-A', chat: 1, world: 'w1', stateRevision: 5, revision: 7, signature: 'sig', sources: baseSources }).ok === true,
    'SR-20 票面全同 ⇒ ok');
  const changed = SR.current(ticket, { identity: 'chat-B', chat: 1, world: 'w1', stateRevision: 5, revision: 7, signature: 'sig', sources: baseSources });
  a(changed.ok === false && changed.changed.indexOf('identity') >= 0, 'SR-21 identity 变 ⇒ 丢');
  const shrunk = SR.current(ticket, { identity: 'chat-A', chat: 1, world: 'w1', stateRevision: 5, revision: 7, signature: 'sig', sources: [{ key: 'm1', hash: 'a' }] });
  a(shrunk.ok === false && shrunk.changed.indexOf('sources-shrunk') >= 0, 'SR-22 来源变短 ⇒ sources-shrunk');
  a(/旧结果已丢弃/.test(SR.discardReason(changed)) && /聊天身份/.test(SR.discardReason(changed)),
    'SR-23 丢弃理由可读且点名到字段');
  a(SR.current(null, {}).changed.indexOf('no-ticket') >= 0, 'SR-24 无票据 ⇒ no-ticket');
  a(src('engines/source-reconcile.js').indexOf('localStorage.setItem') < 0, 'SR-25 零落盘');

  // ══ ③ plan-roster ══════════════════════════════════════════════
  const PR = WA.planRoster;
  a(!!PR && typeof PR.admit === 'function', 'PR-1 planRoster 已挂到 WA');
  PR.saveSettings({ enabled: true });
  a(PR.NEUTRAL_ACTIONS.length === 27 && PR.NEUTRAL_ACTIONS.indexOf('观望') >= 0 && PR.NEUTRAL_ACTIONS.indexOf('修炼') >= 0,
    'PR-2 封闭动作白名单 27 项且含观望/修炼（与上游同表）');
  a(PR.isNeutral('喝茶') === true && PR.isNeutral('登基称帝') === false, 'PR-3 白名单内外判别');

  const catalog = {
    npcs: [
      { id: 'n1', name: '张三', tracked: true, confirmed: true },
      { id: 'n2', name: '李四', tracked: true, confirmed: true },
      { id: 'n3', name: '王五', tracked: true, confirmed: false },
      { id: 'n4', name: '赵六', tracked: false, confirmed: true, archived: false },
    ],
    locations: [{ id: 'L1', name: '家', confirmed: true }, { id: 'L2', name: '市集', confirmed: true }],
    routes: [{ fromId: 'L1', toId: 'L2', confirmed: true, durationMinutes: 45 }],
  };
  const states = { n1: { scene: 'present', locationId: 'L1' }, n2: { scene: 'away', locationId: 'L2' } };
  const ctx = { catalog: catalog, states: states, playerLocationId: 'L1', playerPresent: true };

  const okPlan = { npcIds: ['n1'], activity: '喝茶', major: false };
  a(PR.admit(okPlan, ctx).ok === true, 'PR-4 合格计划 ⇒ 准入');
  a(PR.admit({ npcIds: ['n1'], activity: '宣布登基' }, ctx).problems.some(function (p) { return p.code === 'non-neutral-action'; }),
    'PR-5 白名单外动作 ⇒ non-neutral-action');
  a(PR.admit({ npcIds: ['n1'] }, ctx).problems.some(function (p) { return p.code === 'no-activity'; }),
    'PR-6 未声明活动 ⇒ no-activity（缺声明≠无动作）');

  // 闭包完整性：未确认/未跟踪成员各自点名
  const bad1 = PR.admit({ npcIds: ['n1', 'n3'], activity: '喝茶' }, ctx);
  a(bad1.problems.some(function (p) { return p.code === 'member-unconfirmed' && /n3/.test(p.detail); }),
    'PR-7 未确认成员 ⇒ member-unconfirmed 且点 id');
  const bad2 = PR.admit({ npcIds: ['n1', 'n4'], activity: '喝茶' }, ctx);
  a(bad2.problems.some(function (p) { return p.code === 'member-untracked'; }), 'PR-8 未跟踪成员 ⇒ member-untracked');
  const bad3 = PR.admit({ npcIds: ['n1', 'nX'], activity: '喝茶' }, ctx);
  a(bad3.problems.some(function (p) { return p.code === 'member-not-found'; }), 'PR-9 目录外成员 ⇒ member-not-found');

  // 同行闭包：party 未确认 / 未含发起者
  a(PR.memberProblem({ npcId: 'n1', party: { confirmed: false, members: [{ id: 'n1' }, { id: 'n2' }] } }, ctx)
    .some(function (p) { return p.code === 'party-unconfirmed'; }), 'PR-10 party.confirmed:false ⇒ party-unconfirmed');
  a(PR.memberProblem({ npcId: 'n1', party: { members: [{ id: 'n2' }] } }, ctx)
    .some(function (p) { return p.code === 'party-missing-leader'; }), 'PR-11 party 缺发起者 ⇒ party-missing-leader');
  a(PR.memberProblem({ npcIds: ['n1', 'n2'] }, ctx).length === 0, 'PR-12 无 party 声明 ⇒ 不因此拒');

  // 在途 / 锁定不可动
  const ctxTransit = { catalog: catalog, states: { n1: { scene: 'away', status: 'in_transit' } }, playerPresent: false };
  a(PR.memberProblem({ npcIds: ['n1'] }, ctxTransit).some(function (p) { return p.code === 'member-in-transit'; }),
    'PR-13 在途角色 ⇒ member-in-transit');
  const ctxLocked = { catalog: catalog, states: { n1: { locked: true } }, playerPresent: false };
  a(PR.memberProblem({ npcIds: ['n1'] }, ctxLocked).some(function (p) { return p.code === 'member-locked'; }),
    'PR-14 锁定角色 ⇒ member-locked');

  // 在场者只能小活动
  a(PR.admit({ npcIds: ['n1'], activity: '喝茶', major: true }, ctx).problems.some(function (p) { return p.code === 'present-major-activity'; }),
    'PR-15 在场+major:true ⇒ present-major-activity');

  // travel 必须有已确认路线 + 正整数时长
  const travelOk = { npcIds: ['n2'], activity: '散步', steps: [{ kind: 'travel', fromId: 'L1', toId: 'L2' }] };
  a(PR.admit(travelOk, { catalog: catalog, states: {}, playerPresent: false }).ok === true, 'PR-16 有已确认路线 ⇒ travel 准入');
  const travelBad = { npcIds: ['n2'], activity: '散步', steps: [{ kind: 'travel', fromId: 'L2', toId: 'L1' }] };
  a(PR.admit(travelBad, { catalog: catalog, states: {}, playerPresent: false }).problems.some(function (p) { return p.code === 'missing-route'; }),
    'PR-17 反向无路线 ⇒ missing-route（不补全）');
  const catalogBadDur = JSON.parse(JSON.stringify(catalog));
  catalogBadDur.routes[0].durationMinutes = 0;
  a(PR.admit(travelOk, { catalog: catalogBadDur, states: {}, playerPresent: false }).problems.some(function (p) { return p.code === 'bad-route-duration'; }),
    'PR-18 路线时长为 0 ⇒ bad-route-duration');

  // 角色游标轮转
  const cands = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }];
  const p0 = PR.pick(cands, 0);
  a(p0.ok === true && p0.batch.length === 1 && p0.batch[0].id === 'n1' && p0.nextCursor === 1, 'PR-19 游标 0 ⇒ 只给 n1，next=1');
  const p2 = PR.pick(cands, 2);
  a(p2.batch[0].id === 'n3' && p2.nextCursor === 0, 'PR-20 游标 2 ⇒ n3 并回绕到 0');
  const partyHead = [{ id: 'n1', party: { confirmed: true, members: [{ id: 'n1' }, { id: 'n2' }] } }, { id: 'n2' }, { id: 'n3' }];
  const pp = PR.pick(partyHead, 0);
  a(pp.batch.length === 2 && pp.nextCursor === 2, 'PR-21 完整同行闭包整批给（不拆开）');
  const partyUnconf = [{ id: 'n1', party: { confirmed: false, members: [{ id: 'n1' }, { id: 'n2' }] } }, { id: 'n2' }];
  a(PR.pick(partyUnconf, 0).batch.length === 1, 'PR-22 party 未确认 ⇒ 只给本人');

  // 知情交集
  const ev1 = { npcIds: ['n1'], locationId: 'L1' };
  a(PR.knownBy(ev1, { playerLocationId: 'L1', states: { n1: { scene: 'present' } } }).indexOf('player') >= 0,
    'PR-23 玩家同地点+有成员在场 ⇒ 玩家知情');
  a(PR.knownBy(ev1, { playerLocationId: 'L2', states: { n1: { scene: 'present' } } }).indexOf('player') < 0,
    'PR-24 玩家不同地点 ⇒ 不加 player（没写到的知情≠已知）');
  a(PR.knownBy(ev1, { playerLocationId: 'L1', states: { n1: { scene: 'away' } } }).indexOf('player') < 0,
    'PR-25 同地点但无成员在场 ⇒ 不加 player');

  // 完成事件模板固定，不交给模型
  a(PR.completionEvent({ npcIds: ['n1'], nameOf: { n1: '张三' }, destinationName: '市集' }) === '张三抵达市集',
    'PR-26 completionEvent 抵达模板');
  a(PR.completionEvent({ npcIds: ['n1'], nameOf: { n1: '张三' }, summary: '买菜' }) === '张三完成了事先计划的买菜',
    'PR-27 completionEvent 完成模板');
  a(src('engines/plan-roster.js').indexOf('transact') < 0, 'PR-28 零 store 写');

  // ══ ④ run-observer ═════════════════════════════════════════════
  a(!!obsMod && typeof obsMod.createObserver === 'function' && typeof obsMod.attach === 'function',
    'OB-1 run-observer 导出 createObserver/attach');
  a(obsMod.DEFAULTS.heartbeatIntervalMs === 15000 && obsMod.DEFAULTS.idleWarningMs === 90000,
    'OB-2 STREAM_POLICY 同值：心跳 15s / 空闲告警 90s');
  a(obsMod.DEFAULTS.hardBytes === 8 * 1024 * 1024, 'OB-3 硬上限 8MB');

  let t = 0;
  const clock = function () { return t; };
  const o = obsMod.createObserver({ now: clock, idleWarningMs: 90000, stallMs: 240000 });
  a(o.feedLine('...') === false && o.feedLine('') === false && o.feedLine('10.5s') === false,
    'OB-4 噪声行（进度点/空行/纯计时）不算内容');
  a(o.feedLine('■ v2.409.0 专锁') === true, 'OB-5 节标题算内容');
  a(o.snapshot().lastSection === 'v2.409.0 专锁', 'OB-6 末节名可提取');

  // 双口径：有字节无内容 ⇒ slow（不是 stalled）
  t += 95000;
  o.feedLine('...');
  const sSlow = o.snapshot();
  a(sSlow.idleMs === 0 && sSlow.idleContentMs >= 90000 && sSlow.state === 'slow',
    'OB-7 有字节无内容 ⇒ slow 且 idleMs 归零（双口径分离）');
  // 无字节 ⇒ stalled
  t += 250000;
  a(o.snapshot().state === 'stalled', 'OB-8 无字节超 stall ⇒ stalled');

  // 心跳归观测者，不污染被测行数
  const before = o.snapshot();
  const hb = o.heartbeat();
  const after = o.snapshot();
  a(after.heartbeats === before.heartbeats + 1 && after.lines === before.lines,
    'OB-9 心跳是观测者的证据，不计入被测行数');
  a(/wa-observer local-wait/.test(hb), 'OB-10 心跳行自述来源（不与上游混淆）');

  // 预算收缩
  t = 0;
  const o2 = obsMod.createObserver({ now: clock, budgetMs: 240000, sectionsPerTrip: 10 });
  t = 180000;
  a(o2.suggestSections(30000).suggestedSections === 2, 'OB-11 剩余 60s ÷ 单节 30s ⇒ 2 节（固定 10 节会超）');
  t = 250000;
  a(o2.suggestSections(30000).suggestedSections === 0, 'OB-12 预算用尽 ⇒ 0 节');
  a(o2.suggestSections(0).suggestedSections === 10, 'OB-13 无均耗时 ⇒ 沿用固定值');

  // oversize 优先级最高
  const o3 = obsMod.createObserver({ now: clock, hardBytes: 4 });
  o3.feedChunk('超出四个字节');
  a(o3.snapshot().state === 'oversize', 'OB-14 超硬上限 ⇒ oversize（优先级高于 stalled）');

  // flush 收口：末行无换行也要进统计
  const o4 = obsMod.createObserver({ now: clock });
  o4.feedChunk('■ 无换行末节');
  a(o4.snapshot().sectionsSeen === 0, 'OB-15 未 flush 前末行不入统计');
  o4.flush();
  a(o4.snapshot().sectionsSeen === 1 && o4.snapshot().lastSection === '无换行末节',
    'OB-16 flush 后末行入统计（SIGKILL 前半个节名不丢）');

  // 观察者不杀进程：源码里不得出现 kill
  a(src('tools/run-observer.js').indexOf('child.kill') < 0 && src('tools/run-observer.js').indexOf('.kill(') < 0,
    'OB-17 观察者只报态，不杀进程');

  // ══ ⑤ 接线判据（防「引擎存在但没人调」）══════════════════════════
  const idx = src('index.js');
  ['elapsed-evidence.js', 'source-reconcile.js', 'plan-roster.js'].forEach(function (f, i) {
    a(idx.indexOf("'engines/" + f + "'") >= 0, 'T5-' + (i + 1) + ' index.js 加载序列含 ' + f);
  });
  const td = src('engines/tool-diag.js');
  ['elapsedEvidence', 'sourceReconcile', 'planRoster'].forEach(function (ns, i) {
    a(td.indexOf("'" + ns + "'") >= 0, 'T5-' + (i + 4) + ' tool-diag 守卫登记 ' + ns);
  });
  a(src('index.js').indexOf("const VERSION = '2.517.0'") >= 0, 'T5-7 版本面已升 2.517.0');
  a(JSON.parse(src('manifest.json')).version === '2.517.0', 'T5-8 manifest 同源 2.517.0');

  // O6 门禁 N5 负控制：本批**不得**改 prune-sections.js / run.js 的裁剪相关段
  a(src('tools/prune-sections.js').indexOf('labelUnits') < 0,
    'T5-9 prune-sections.js 未引入 label 单元包裹（N5 负控制，本轮已回滚）');
  a(src('tests/isolated-runner.js').indexOf('run-observer') < 0,
    'T5-10 isolated-runner.js 未硬接观测器（观测器在调度器侧接线，N5 逐字未变）');

  return { pass, fail, fails };
}
if (require.main === module) {
  const r = runAll();
  console.log('CROSS-REF-STITCH-V2409: pass ' + r.pass + ' / fail ' + r.fail);
  if (r.fail) { r.fails.forEach(function (f) { console.log('  X ' + f); }); process.exit(1); }
}
module.exports = { runAll: runAll };