#!/usr/bin/env node
// WorldAxis tests/floor-batch2-v2524.js -- V29 批二（EXV29-07～12）专锁
//
// 治的病
//   一屋子三个人，谁先开口、谁被打断、谁只听见半句、谁一直没被点到——现场**一处都没算**。
//   `冷场` 更是零命中：每一轮都硬凑一句，世界没有"安静"这个状态。
//
// 本锁钉住六件事（每段都带负控制）：
//   T 发言秩序：同一批入参排两次**逐字相同**；每人带理由；连着抢先必被降位。
//   U 抢话代价：不打断三笔账全 0；打断三次有据可查；`forgive` 只减半不清零。
//   V 听者分层：同一句三人三版；`voice-only` 拿不到原句任何片段（泄漏必红）。
//   W 耳语圈外：圈外人一个字都拿不到，只听见"他们在说话"。
//   X 冷场合法：连 3 轮仍 ok:true、`produced` 恒 0、`shouldForce` 恒 false。
//   Y 被忽略优先：最久没被点到的人先上；从没被点到的人最优先。
'use strict';
const fresh = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
function eq(a, b, name) { return ok(a === b, name, { got: a, want: b }); }

const WA = fresh();
const FO = WA.floorOrder, IC = WA.interruptCost, OS = WA.overhearSplit, QR = WA.quietRound;
const WB = WA.whisperBackchannel, SP = WA.spotlight;

// ── T：EXV29-07 发言秩序 ──
ok(!!FO && typeof FO.rank === 'function', 'T0 floorOrder 已装');
eq(FO.rank({ people: [] }).empty, true, 'T1 空名单 ⇒ empty:true（不编人）');
const tIn = { people: [
  { who: '甲', status: 0, closeness: 0, urgency: 0 },
  { who: '乙', status: 3, closeness: 1, urgency: 1 },
  { who: '丙', status: 1, closeness: 2, urgency: 0 }
] };
const t1 = FO.rank(tIn);
const t2 = FO.rank(tIn);
eq(t1.first, '乙', 'T2 地位+急迫最高者先说', t1.first);
eq(JSON.stringify(t1.order), JSON.stringify(t2.order), 'T3 **两次排序逐字相同**（不掷骰，负控制）');
ok(t1.order.every(function (r) { return typeof r.why === 'string' && r.why.length > 0; }), 'T4 每人都有理由（空串必红）', t1.order);
eq(t1.order.length, 3, 'T5 三人都在序里');
const tDup = FO.rank({ people: [{ who: '甲' }, { who: '甲' }] });
eq(tDup.deduped, 1, 'T6 重名合并并如实报数', tDup.deduped);
FO.note({ who: '乙' });
const t3 = FO.rank(tIn);
eq(t3.demoted, '乙', 'T7 上一轮已是他先说 ⇒ 这次降一位（不许连着抢）', t3.demoted);
ok(/上一轮/.test((t3.order.filter(function (r) { return r.who === '乙'; })[0] || {}).why || ''), 'T7b 降位理由写进 why');
eq(FO.note({}).reason, 'missing-fields', 'T8 note 缺 who ⇒ missing-fields');
eq(FO.CAP, 24, 'T9 上界 24（与 __BOUNDED_CAPS 对齐）');

// ── U：EXV29-08 抢话代价 ──
ok(!!IC && typeof IC.cut === 'function', 'U0 interruptCost 已装');
const u0 = IC.state({ who: '丁' });
eq(u0.resent + u0.drift + u0.authority + u0.cuts, 0, 'U1 **不打断三笔账全 0**（负控制）');
eq(IC.cut({ by: '甲', to: '甲' }).reason, 'bad-target', 'U2 抢自己 ⇒ bad-target');
const u1 = IC.cut({ by: '甲', to: '乙', weight: 2 });
eq(u1.resent, 2, 'U3 记恨 = 权重', u1.resent);
ok(typeof u1.because === 'string' && u1.because.length > 0, 'U4 代价可归因（because 非空）', u1.because);
IC.cut({ by: '甲', to: '乙', weight: 2 });
const u3 = IC.cut({ by: '甲', to: '乙', weight: 2, statusGap: 2 });
eq(u3.cuts, 3, 'U5 第三次仍记得住', u3.cuts);
ok(u3.authority <= -3, 'U6 抢高位者伤权威更重', u3.authority);
ok(/三次以上/.test(u3.note || ''), 'U7 三次之后明说"记着这笔"', u3.note);
ok(IC.buildBlock().length > 0, 'U7c 梁子够深时注入面会说话（三条以上 + 记恨够）', IC.buildBlock());
const uf = IC.forgive({ by: '甲', to: '乙' });
ok(uf.after.resent < uf.before.resent, 'U8 forgive 真的减了', { before: uf.before.resent, after: uf.after.resent });
ok(uf.after.resent > 0, 'U9 **只减一半、不清零**（旧账冲不干净）', uf.after.resent);
eq(IC.forgive({ by: '无', to: '此人' }).reason, 'not-happened', 'U10 没有这笔账 ⇒ not-happened');
ok(IC.buildBlock() === '', 'U11 forgive 冲淡后不再上注入面（读数跟着账走）', IC.buildBlock());
eq(IC.CAP, 24, 'U12 上界 24（与 __BOUNDED_CAPS 对齐）');

// ── V：EXV29-09 听者分层 ──
ok(!!OS && typeof OS.split === 'function', 'V0 overhearSplit 已装');
const LINE = '今夜子时，从西角门把货搬走，不要点灯。';
const v = OS.split({ line: LINE, dialect: '南边', listeners: [
  { who: '近的', distance: 0, noise: 0, dialect: '南边' },
  { who: '中间', distance: 3, noise: 0.2, dialect: '南边' },
  { who: '远的', distance: 10, noise: 0.8, dialect: '北边' }
] });
eq(v.rows[0].fidelity, 'full', 'V1 近处同口音 ⇒ 整句', v.rows[0]);
ok(['partial', 'voice-only'].indexOf(v.rows[1].fidelity) >= 0, 'V2 中距 ⇒ 听不全', v.rows[1]);
eq(v.rows[2].fidelity, 'voice-only', 'V3 远处 ⇒ 只听见在说话', v.rows[2]);
ok(v.rows[2].got.indexOf(LINE) < 0 && v.rows[2].got.indexOf('西角门') < 0, 'V4 **圈外/远处拿不到原句片段**（泄漏必红）', v.rows[2].got);
ok(v.distinct >= 2, 'V5 同一句给出多种听觉版本', v.distinct);
ok(v.rows.every(function (r) { return r.why && r.why.length; }), 'V6 每档都有理由');
eq(OS.split({ line: LINE, listeners: [] }).empty, true, 'V7 没听者 ⇒ empty:true');
eq(OS.split({ line: '' }).reason, 'missing-fields', 'V8 缺 line ⇒ missing-fields');

// ── W：EXV29-10 耳语圈外 ──
ok(!!WB && typeof WB.perimeter === 'function', 'W0 whisperBackchannel.perimeter 已装');
eq(WB.perimeter({ room: ['甲'] }).reason, 'not-happened', 'W1 没有耳语账 ⇒ not-happened');
WA.store.transact(function (d) {
  d.people = d.people || {};
  d.people['发话人'] = d.people['发话人'] || {};
  d.people['发话人'].whisperChannels = [{ id: 'whp_test_1', senderId: '发话人', recipientId: '听者',
    content: '货在三号仓', isIntercepted: false, interceptedBy: null,
    audienceScope: ['发话人', '听者'], at: 1 }];
  return true;
}, 'test:whisper-seed');
const w = WB.perimeter({ whisperId: 'whp_test_1', senderId: '发话人', room: ['发话人', '听者', '第三人'] });
eq(w.ok, true, 'W2 圈外视图可算');
const wThird = w.rows.filter(function (r) { return r.who === '第三人'; })[0];
eq(wThird.inside, false, 'W3 第三人不在听者范围');
ok(String(wThird.got).indexOf('货在三号仓') < 0, 'W4 **第三人拿不到耳语内容**（负控制：泄漏即红）', wThird.got);
ok(/在低声说话/.test(String(wThird.got)), 'W5 第三人只知道"他们在说话"', wThird.got);
eq(w.leak, 0, 'W6 泄漏计数为 0');
eq(WB.perimeter({ room: [] }).reason, 'missing-fields', 'W7 缺 room ⇒ missing-fields');

// ── X：EXV29-11 冷场是合法结果 ──
ok(!!QR && typeof QR.judge === 'function', 'X0 quietRound 已装');
eq(QR.judge({ who: '甲', willing: true, goal: '讨个说法' }).quiet, false, 'X1 有人说且有话可谈 ⇒ 不冷场（负控制）');
const x1 = QR.judge({ who: '甲', willing: false, goal: '' });
eq(x1.quiet, true, 'X2 没人接话 ⇒ quiet:true');
eq(x1.silentReason, 'no-goal', 'X3 原因给的是 no-goal', x1.silentReason);
eq(x1.produced, 0, 'X4 **冷场不进产出**（produced 0）');
const x2 = QR.judge({ who: '乙', willing: false, goal: '' });
const x3 = QR.judge({ who: '丙', willing: false, goal: '' });
eq(x3.ok, true, 'X5 连续 3 轮冷场**仍然 ok:true**（负控制：判成报错即红）');
ok(x3.streak >= 3, 'X6 连续冷场轮数可读', x3.streak);
eq(QR.shouldForce(), false, 'X7 永不强制打破冷场');
eq(QR.judge({ who: '甲', willing: true }).reason, 'missing-fields', 'X8 愿意说却没说 goal ⇒ missing-fields');
ok(QR.buildBlock().indexOf('【安静】') === 0, 'X9 连续冷场时注入面说一句人话', QR.buildBlock());
eq(QR.HIST_CAP, 12, 'X10 上界 12（与 __BOUNDED_CAPS 对齐）');

// ── Y：EXV29-12 被忽略的人优先 ──
ok(!!SP && typeof SP.fairness === 'function', 'Y0 spotlight.fairness 已装');
const y = SP.fairness([{ who: '甲', lastRound: 9 }, { who: '乙', lastRound: 8 }, { who: '丙', lastRound: 3 }], 10);
eq(y.due, '丙', 'Y1 最久没被点到的先上', y.due);
ok(/第|轮/.test(y.why) || /一次都没/.test(y.why), 'Y2 理由可读', y.why);
const y2 = SP.fairness([{ who: '新人' }, { who: '老人', lastRound: 9 }], 10);
eq(y2.due, '新人', 'Y3 一次都没被点到的人最优先', y2.due);
eq(SP.fairness([]).reason, 'missing-fields', 'Y4 空名单 ⇒ missing-fields');
ok(SP.fairness([{ who: '甲', lastRound: 0 }, { who: '乙', lastRound: 0 }], 5).starved >= 1, 'Y5 饿着的（>=3 轮）可数');

console.log('floor-batch2-v2524: pass ' + pass + ' / fail ' + fail);
if (fail) { console.log(fails.join('\n')); process.exit(1); }