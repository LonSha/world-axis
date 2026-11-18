#!/usr/bin/env node
// WorldAxis tests/finale-batch3-v2524.js -- V29 批三（EXV29-13～18）专锁
//
// 治的病
//   故事**不会结束**：`finale|谢幕|剧终` 零命中、`卷末|arcSettle` 零命中——
//   主线早该收了，世界还在长；主要人物离场靠的是"从名单里删掉"；重开一局要么全搬要么全不带。
//
// 本锁钉住五段（每段都带负控制）：
//   A 终局条件：三量都清才 ready；不 ready 不给假信号；完结后限产闸 count 得起。
//   B 卷末结算：每条追得到 owner；封卷只读；没开的卷不许补。
//   C 未收的线：`fate` 不许留白；已交代不许改口；`settle` 点名。
//   D 退场仪典：无见证不算；不许自己作证；**模块里没有删除函数**；重复登记不许改口。
//   E 前世：不继承零残留；**串档必红**（换聊天/换 token 都拒收）；不许手写继承项。
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
const FN = WA.finale, AS = WA.arcSettle, LE = WA.looseEnds, ER = WA.exitRite, PL = WA.pastLife;

// ── A：EXV29-13 终局条件 / EXV29-17 完结后定格 ──
ok(!!FN && typeof FN.check === 'function', 'A0 finale 已装');
const a0 = FN.state();
eq(a0.judged, false, 'A1 没判过不冒充"可以收了"（负控制）');
const a1 = FN.check({ mainlineOpen: 2, debtsOpen: 1, peopleLeft: 3 });
eq(a1.ready, false, 'A2 主线还有 2 条 ⇒ 不给假信号');
ok(a1.because.length === 3, 'A2b 三条都写进 because', a1.because);
ok(/主线还开着/.test(a1.line), 'A3 不 ready 的句子说得出差什么', a1.line);
eq(a1.force, false, 'A4 force 恒 false（只报不逼）');
const a2 = FN.check({ mainlineOpen: 0, debtsOpen: 0, peopleLeft: 1 });
eq(a2.ready, true, 'A5 主线落尽 + 账清 + 只剩一人 ⇒ ready');
ok(/可以收了/.test(a2.line), 'A6 ready 时给出"该收了"', a2.line);
eq(FN.state().judged, true, 'A7 判过之后 state 如实说判过');
eq(FN.rateGate({ afterFinale: false, newFacts: 9 }).exceed, false, 'A8 没完结时限产闸不生效（负控制）');
eq(FN.rateGate({ afterFinale: true, newFacts: 2 }).exceed, true, 'A9 完结后一轮添 2 条 ⇒ 超限');
eq(FN.rateGate({ afterFinale: true, newFacts: 1 }).exceed, false, 'A10 完结后一轮 1 条在限内');
ok(FN.buildBlock().indexOf('【该收了】') === 0, 'A11 注入面只在这一句上说', FN.buildBlock());
eq(FN.HIST_CAP, 8, 'A12 历史上界 8（与 __BOUNDED_CAPS 对齐）');

// ── B：EXV29-14 卷末结算 ──
ok(!!AS && typeof AS.open === 'function', 'B0 arcSettle 已装');
eq(AS.add({ arc: '盐引案', kind: 'happened', what: '账房翻了', owner: '沈账房' }).reason, 'unknown-kind', 'B1 没开的卷不许补（负控制）');
const b0 = AS.open({ arc: '盐引案' });
eq(b0.ok, true, 'B2 开卷成功');
eq(AS.add({ arc: '盐引案', kind: 'happened' }).reason, 'missing-fields', 'B3 没内容 ⇒ missing-fields');
eq(AS.add({ arc: '盐引案', kind: 'happened', what: '账房翻了' }).reason, 'missing-fields', 'B4 **owner 必填**：谁变了都不知道就不进结算');
const b1 = AS.add({ arc: '盐引案', kind: 'happened', what: '账房翻了', owner: '沈账房' });
eq(b1.ok, true, 'B5 带 owner 才进结算');
eq(b1.owner, '沈账房', 'B5b 每条追得到 owner', b1.owner);
eq(AS.add({ arc: '盐引案', kind: 'nonsense', what: 'x', owner: 'y' }).reason, 'unknown-kind', 'B6 三栏之外 ⇒ unknown-kind');
AS.add({ arc: '盐引案', kind: 'changed', what: '沈账房少了半只耳', owner: '沈账房' });
const b2 = AS.close({ arc: '盐引案' });
eq(b2.sealed, true, 'B7 封卷');
eq(AS.add({ arc: '盐引案', kind: 'left', what: '一张欠条', owner: '沈账房' }).reason, 'already-closed', 'B8 **封卷只读**：不许再补（负控制）');
const b3 = AS.read({ arc: '盐引案' });
ok(b3.count >= 2, 'B9 封卷后读得到，不是清空', b3.count);
eq(AS.read({ arc: '没这卷' }).reason, 'unknown-kind', 'B10 没这卷 ⇒ unknown-kind');
eq(AS.buildBlock(), '', 'B11 结算由玩家主动要，不占注入面');
eq(AS.ARC_CAP, 8, 'B12 卷数上界 8（与 __BOUNDED_CAPS 对齐）');

// ── C：EXV29-15 未收的线 ──
ok(!!LE && typeof LE.add === 'function', 'C0 looseEnds 已装');
eq(LE.add({ id: 'x1', what: '那张欠条' }).ok, true, 'C1 记一条线');
eq(LE.add({ id: 'x2', what: '欠条', state: 'whatever' }).reason, 'unknown-kind', 'C2 六态之外 ⇒ unknown-kind（不另造状态）');
eq(LE.close({ id: 'x1' }).reason, 'missing-fields', 'C3 **fate 不许留白**（负控制）');
eq(LE.close({ id: 'x1', fate: '   ' }).reason, 'missing-fields', 'C3b 全空白也算留白');
eq(LE.close({ id: '没这线', fate: '后来没了' }).reason, 'not-happened', 'C4 不编线：没登记过的 id ⇒ not-happened');
const c1 = LE.close({ id: 'x1', fate: '后来烧了' });
eq(c1.state, 'settled', 'C5 交代后状态落 settled');
ok(/后来烧了/.test(c1.line), 'C6 一句话交代（不复活整条线）', c1.line);
eq(LE.close({ id: 'x1', fate: '其实没烧' }).reason, 'already-handled', 'C7 **已交代不许改口**（负控制）');
const c2 = LE.settle();
eq(c2.open, 0, 'C8 每条线都有交代了');
eq(LE.add({ id: 'x3', what: '那个只露过一面的人' }).ok, true, 'C9 再加一条');
const c3 = LE.settle();
eq(c3.open, 1, 'C10 settle 点名未收的线', c3.open);
ok(c3.rows[0].stateCN.length > 0, 'C11 状态有中文明读', c3.rows[0]);
ok(LE.buildBlock().indexOf('【未收的线】') === 0, 'C12 注入面点到具体是哪条', LE.buildBlock());
eq(LE.CAP, 32, 'C13 上界 32（与 __BOUNDED_CAPS 对齐）');

// ── D：EXV29-16 退场仪典 ──
ok(!!ER && typeof ER.add === 'function', 'D0 exitRite 已装');
eq(typeof ER.remove, 'undefined', 'D1 **模块里没有删除函数**（不许静默删除，负控制）');
eq(ER.add({ id: '沈账房', role: '账房', cause: 'death', where: '后院' }).ok, false, 'D2 缺见证 ⇒ 拒收');
eq(ER.add({ id: '沈账房', role: '账房', cause: 'death', where: '后院' }).reason, 'missing-fields', 'D2b 无见证 ⇒ missing-fields');
eq(ER.add({ id: '沈账房', role: '账房', cause: 'death', where: '后院', witnesses: [] }).reason, 'missing-fields', 'D3 空见证数组也算无见证');
eq(ER.add({ id: '沈账房', role: '账房', cause: 'death', where: '后院', witnesses: ['沈账房'] }).reason, 'bad-scope', 'D4 **不许自己给自己作证**（负控制）');
eq(ER.add({ id: '沈账房', role: '账房', cause: '失踪', where: '后院', witnesses: ['甲'] }).reason, 'unknown-kind', 'D5 四档之外的理由 ⇒ unknown-kind');
eq(ER.add({ id: '沈账房', role: '账房', cause: 'death' }).reason, 'missing-fields', 'D6 没地点 ⇒ 不算场面');
const d1 = ER.add({ id: '沈账房', role: '账房', cause: 'death', where: '后院柴房', witnesses: ['甲', '乙'], last: '账本在东墙第三块砖后' });
eq(d1.ok, true, 'D7 四样齐 ⇒ 登记成功');
ok(/在场/.test(d1.scene) && /东墙/.test(d1.scene), 'D8 场面可读（地点 + 见证 + 最后一句话）', d1.scene);
eq(ER.add({ id: '沈账房', role: '账房', cause: 'departure', where: '城门', witnesses: ['甲'] }).reason, 'already-handled', 'D9 重复登记不许改口（负控制）');
const d2 = ER.gone('沈账房');
eq(d2.ok, true, 'D10 退场可查');
eq(d2.where, '后院柴房', 'D10b 查得到场面地点', d2.where);
eq(ER.gone('没这人').reason, 'not-happened', 'D11 没登记过 ⇒ not-happened');
const d3 = ER.list();
ok(d3.count >= 1, 'D12 名册里还在（不是从名单消失）', d3.count);
ok(ER.buildBlock().indexOf('【已退场】') === 0, 'D13 注入面说"已经离场，别再当在场者写"', ER.buildBlock());
eq(ER.CAP, 24, 'D14 上界 24（与 __BOUNDED_CAPS 对齐）');

// ── E：EXV29-18 前世 ──
ok(!!PL && typeof PL.offer === 'function', 'E0 pastLife 已装');
const e0 = PL.offer();
eq(e0.reason, 'not-happened', 'E1 没有上一局归档 ⇒ not-happened（不编前世）', e0.reason);
const e1 = PL.decline();
eq(e1.ok, true, 'E2 不继承也能明确表态');
eq(PL.residue().count, 0, 'E3 **不继承零残留**（负控制）');
// 造一份上一局归档（只替 view，不替引擎逻辑）
const origView = WA.playerArchive.view;
WA.playerArchive.view = function () {
  return { works: [{ round: 120, data: { continuation: { people: [{ name: '阿苍' }, { name: '沈账房' }], currents: [{ title: '盐引案' }] } } }] };
};
const e2 = PL.offer();
eq(e2.ok, true, 'E4 有上一局归档 ⇒ 给出可继承项');
ok(e2.items.length >= 2, 'E4b 继承项可列出', e2.items.length);
eq(e2.chatId, String(WA.store.chatId()), 'E5 名单带 chatId 戳');
eq(PL.choose(['p0'], 'wrong#token').reason, 'chat-changed', 'E6 **换 token 必红**（负控制）');
eq(PL.choose(['zzz'], e2.token).reason, 'unknown-kind', 'E7 不许手写继承项（负控制）');
eq(PL.choose(['p0', 'p1', 't0', 'p0'], e2.token).reason, 'bad-scope', 'E8 最多带 3 样');
const e3 = PL.choose(['p0'], e2.token);
eq(e3.ok, true, 'E9 选一样带过来');
eq(e3.from.label, '上一局', 'E10 继承项盖着"上一局"的戳');
eq(e3.inherited[0].from.chatId, String(WA.store.chatId()), 'E10b 每条都记着从哪儿来');
eq(PL.residue().count, 1, 'E11 落地即残留 1 条');
ok(PL.buildBlock().indexOf('【前世】') === 0, 'E12 注入面以【前世】开头');
ok(/不是这一世发生过的事/.test(PL.buildBlock()), 'E12b 明写"不是这一世发生的事"（防串档）', PL.buildBlock());
// 串档：换聊天后再 choose
const origChat = WA.store.chatId;
WA.store.chatId = function () { return 'another_chat'; };
eq(PL.choose(['p0'], e2.token).reason, 'chat-changed', 'E13 **换聊天必红**（串档负控制）');
WA.store.chatId = origChat;
PL.decline();
eq(PL.residue().count, 0, 'E14 decline 之后零残留（键被删掉）');
eq(PL.buildBlock(), '', 'E15 零残留时注入面一个字都不说');
WA.playerArchive.view = origView;
eq(PL.CAP, 3, 'E16 继承项上界 3（与 __BOUNDED_CAPS 对齐）');

if (fail) {
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  fails.slice(0, 20).forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('PASS ' + pass + '/' + pass + ' (finale-batch3-v2524)');