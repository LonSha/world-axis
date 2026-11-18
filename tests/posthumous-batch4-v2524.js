#!/usr/bin/env node
// WorldAxis tests/posthumous-batch4-v2524.js -- V29 批四（EXV29-19～24）专锁
//
// 治的病
//   `posthumous|身后名|名誉` **0 命中**：人一死，债、遗物、名声、他脑子里那条信息，
//   现场一样都没有归宿——`credit-ledger` 只认活人。`epistemic-view` 也没处理"持有人死亡"。
//
// 本锁钉住六段（每段都带负控制）：
//   F 债不随人死：转给继承人后能追；没继承人 ⇒ **账仍在**（无从追索，不是消失）。
//   G 身后名：无来源不算；死人不能自辩；两个时点两种评价各有来源，差数说得清。
//   H 遗物与遗嘱：遗物有主；违背遗嘱点得出是哪一条、后果只算一次。
//   I 翻案要付证据：证据不够拒收；时间没到拒收；翻过不许翻第二次。
//   J 信息随人死而断：他那一份**真被删掉**；别处还有人知道就不算丢。
//   K 悼念与遗忘：没人记得不算纪念；最后一个记得的人死了，就没人再提。
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
const CL = WA.creditLedger, PH = WA.posthumous, RA = WA.reputationAfter, EPI = WA.epistemicView;

// ── F：EXV29-19 债不随人死 ──
ok(!!PH && typeof PH.oblige === 'function', 'F0 posthumous 已装');
ok(!!CL && typeof CL.transfer === 'function', 'F0b creditLedger.transfer 已装（复用既有模块）');
const f0 = CL.open({ borrower: '张三', lender: '李四', principal: 100, key: 'f-debt-1' });
eq(f0.ok, true, 'F1 立一张据（既有模块自己的口）', f0.reason);
const f1 = PH.oblige({ deceased: '张三' });
eq(f1.reason, 'missing-fields', 'F2 没有继承人 ⇒ 拒收但不抹账');
eq(f1.count, 1, 'F2b **债仍在**：无从追索要报得出还有几笔', f1.count);
eq(CL.unclaimable('张三').count, 1, 'F2c 无人可追时账还挂在他名下');
const f2 = PH.oblige({ deceased: '张三', heir: '王五' });
eq(f2.ok, true, 'F3 有继承人就转得过去');
eq(f2.count, 1, 'F3b 转的是 1 笔', f2.count);
eq(CL.unclaimable('张三').count, 0, 'F4 转籍之后死人名下没有未清的账');
const f3 = PH.oblige({ deceased: '张三', heir: '王五' });
eq(f3.reason, 'not-happened', 'F5 再转一次 ⇒ not-happened（不替死人编债）');
eq(PH.oblige({ deceased: '没这个人', heir: '王五' }).reason, 'not-happened', 'F6 从未借过钱的人 ⇒ not-happened');

// ── G：EXV29-20 身后名 ──
ok(!!RA && typeof RA.note === 'function', 'G0 reputationAfter 已装');
eq(RA.note({ subject: '沈账房', by: '甲', label: '是个老实人' }).reason, 'missing-fields', 'G1 无来源 ⇒ missing-fields（不替活人编依据）');
eq(RA.note({ subject: '沈账房', by: '沈账房', label: '我清白', source: 'hearsay' }).reason, 'bad-scope', 'G2 **死人不能给自己写名声**（负控制）');
const g1 = RA.note({ subject: '沈账房', by: '甲', label: '是个老实人', source: 'witnessed', weight: 2, at: 100 });
eq(g1.ok, true, 'G3 当时有人说他老实');
const g2 = RA.note({ subject: '沈账房', by: '乙', label: '账上有鬼', source: 'document', weight: 3, at: 300 });
eq(g2.ok, true, 'G4 后来有人翻他的账');
const g3 = RA.note({ subject: '沈账房', by: '乙', label: '账上有鬼', source: 'document', weight: 9, at: 300 });
eq(g3.revised, true, 'G5 同一人再说一遍 ⇒ 一人一票（改口而不是加票）', g3.revised);
eq(g3.weight, 3, 'G5b 权重越界被夹回并如实报', g3.weight);
eq(g3.clamped, true, 'G5c clamped 如实说');
RA.markDead({ subject: '沈账房', at: 200 });
eq(RA.markDead({ subject: '沈账房', at: 250 }).reason, 'already-handled', 'G6 死期不许改口（负控制）');
const g4 = RA.view({ subject: '沈账房' });
eq(g4.then.count, 1, 'G7 当时只有一个人说过', g4.then.count);
eq(g4.now.count, 1, 'G8 后来有一个人改口', g4.now.count);
ok(g4.swing !== 0, 'G9 两个时点评分不同（身后名真被改写）', g4.swing);
ok(g4.then.rows[0].sourceCN.length > 0 && g4.now.rows[0].sourceCN.length > 0, 'G10 每一句都带来源');
ok(RA.buildBlock().indexOf('【身后名】') === 0, 'G11 注入面说得清是"后来改的口"', RA.buildBlock());
eq(RA.view({}).reason, 'missing-fields', 'G12 不指名就问 ⇒ missing-fields');

// ── H：EXV29-21 遗物与遗嘱 ──
eq(PH.bequeath({ deceased: '沈账房', item: '账本' }).reason, 'missing-fields', 'H1 没收件人 ⇒ missing-fields（遗物不算给）');
const h1 = PH.bequeath({ deceased: '沈账房', item: '账本', to: '徒弟' });
eq(h1.ok, true, 'H2 遗物有主');
eq(h1.to, '徒弟', 'H2b 归属可查', h1.to);
eq(PH.bequeath({ deceased: '沈账房', item: '账本', to: '旁人' }).reason, 'already-handled', 'H3 同一件不许分两次（负控制）');
eq(PH.violate({ deceased: '沈账房', item: '账本', by: '旁人' }).reason, 'not-happened', 'H4 没立遗嘱 ⇒ 谈不上违背');
const h2 = PH.will({ deceased: '沈账房', wishes: [{ item: '账本', to: '徒弟' }, { item: '怀表' }] });
eq(h2.ok, true, 'H5 遗嘱立下');
eq(h2.skipped.length, 1, 'H5b 写不全的那条没进（不许糊过去）', h2.skipped);
eq(PH.violate({ deceased: '沈账房', item: '怀表', by: '旁人' }).reason, 'not-happened', 'H6 遗嘱里没这一条 ⇒ 不算违背');
const h3 = PH.violate({ deceased: '沈账房', item: '账本', by: '旁人' });
eq(h3.ok, true, 'H7 违背遗嘱登记在案');
eq(h3.intendedTo, '徒弟', 'H7b 说得出本该给谁', h3.intendedTo);
eq(PH.violate({ deceased: '沈账房', item: '账本', by: '旁人' }).reason, 'already-handled', 'H8 后果只算一次（负控制）');
eq(PH.breachView({ deceased: '沈账房' }).rows.length, 1, 'H9 谁欠死者一个交代，查得到');

// ── I：EXV29-22 翻案要付证据 ──
eq(PH.overturn({ subject: '沈账房', evidence: ['一封信'] }).reason, 'below-threshold', 'I1 **一句话翻不了案**（负控制）');
eq(PH.overturn({ subject: '沈账房', evidence: ['一封信', '一份口供'], at: 100, earliestAt: 500 }).reason, 'not-happened', 'I2 时间没到 ⇒ 拒收（翻案要等）');
const i1 = PH.overturn({ subject: '沈账房', evidence: ['一封信', '一份口供'], at: 600, earliestAt: 500, by: '知县' });
eq(i1.ok, true, 'I3 证据够 + 时间到 ⇒ 翻得成');
ok(/名声/.test(i1.repNote || ''), 'I3b 翻成之后名声跟着动', i1.repNote);
eq(PH.overturn({ subject: '沈账房', evidence: ['x', 'y'], at: 700 }).reason, 'already-handled', 'I4 翻过不许翻第二次（负控制）');

// ── J：EXV29-23 信息随人死而断 ──
ok(!!EPI && typeof EPI.loseOnDeath === 'function', 'J0 epistemicView.loseOnDeath 已装（复用既有模块）');
EPI.registerBelief('甲', 't-salt', { summary: '盐引的账在东墙', source: 'witnessed', certainty: 'certain' });
EPI.registerBelief('乙', 't-salt', { summary: '听说盐引有账', source: 'hearsay' });
const j1 = EPI.loseOnDeath({ who: '甲', topicId: 't-salt' });
eq(j1.ok, true, 'J1 甲的那一份被删');
eq(j1.lost, false, 'J2 别处还有人知道 ⇒ **不算丢**（负控制）', j1.stillKnownElsewhere);
const j2 = EPI.loseOnDeath({ who: '乙', topicId: 't-salt' });
eq(j2.lost, true, 'J3 最后一个知道的死了 ⇒ 这条永久丢失', j2);
eq(EPI.loseOnDeath({ who: '甲', topicId: 't-salt' }).reason, 'not-happened', 'J4 再问一次 ⇒ not-happened（问不出来了）');
eq(EPI.loseOnDeath({ who: '丙', topicId: 't-salt' }).reason, 'not-happened', 'J5 他本来就不掌握 ⇒ not-happened（不替死者编记忆）');
const jw = EPI.buildView('甲', 't-salt');
ok(!jw || jw.ok !== true || !jw.belief, 'J6 死后的视图里没有他那一份', jw);

// ── K：EXV29-24 悼念与遗忘 ──
eq(PH.remember({ who: '沈账房', keepers: [] }).reason, 'missing-fields', 'K1 没人记得 ⇒ 不算纪念（负控制）');
eq(PH.remember({ who: '沈账房', keepers: ['沈账房'] }).reason, 'missing-fields', 'K1b 自己记自己也不算');
const k1 = PH.remember({ who: '沈账房', keepers: ['甲', '乙'], at: 100 });
eq(k1.ok, true, 'K2 有人记得');
const k2 = PH.keeperDied({ keeper: '甲' });
eq(k2.forgotten.length, 0, 'K3 还有一个人记得 ⇒ 没被遗忘', k2.forgotten);
const k3 = PH.keeperDied({ keeper: '乙' });
eq(k3.forgotten.length, 1, 'K4 最后一个记得的人也死了 ⇒ **被遗忘**（可发生的事件）', k3.forgotten);
const k4 = PH.remembrance();
eq(k4.forgotten, 1, 'K5 读得到"没人再提"的名单', k4.forgotten);
eq(k4.remembered, 0, 'K5b 还被人念着的就没了');
ok(PH.buildBlock().indexOf('【身后】') === 0, 'K6 注入面报身后事', PH.buildBlock());
eq(PH.MIN_EVIDENCE, 2, 'K7 翻案门槛 2 条（判据可读）');

if (fail) {
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  fails.slice(0, 25).forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('PASS ' + pass + '/' + pass + ' (posthumous-batch4-v2524)');