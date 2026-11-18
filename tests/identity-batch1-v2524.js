#!/usr/bin/env node
// WorldAxis tests/identity-batch1-v2524.js -- V29 批一（EXV29-02～06）专锁
//
// 治的病
//   同一个人跑到第三百楼会"漂"：称呼乱换、岁数不动、习惯变标签、踩忌讳没后果、
//   而且**没人能说清漂在哪一楼**。这五项各自把一处散落的判据收成可核的读数。
//
// 本锁钉住五件事（每段都带负控制）：
//   N 称呼随亲疏：越级必有纠正句；叫得正好时注入面必须**零 token**。
//   O 年龄体貌：不过年不涨（364 天差 0）；一次跨十年也只升一档（clamped）。
//   P 习惯认人：频率 0 必不出现；零次看过必认不出（chance=0）。
//   Q 忌讳失礼：踩了 `ok:true` 但必有后果与归因；没这条忌讳时**什么都不发生**。
//   R 漂移一屏：漂移项必须带得出"依据哪一楼"；没漂就明说没漂。
'use strict';
const path = require('path');
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
const AF = WA.addressForm, AG = WA.aging, HT = WA.habitTell, ET = WA.etiquette, IL = WA.identityLedger;

// ── N：EXV29-02 称呼随亲疏 ──
ok(!!AF && typeof AF.check === 'function', 'N0 addressForm 已装');
eq(AF.check({ from: '小李', to: '张爷', form: '老张' }).reason, 'not-happened', 'N1 没登记不猜（not-happened）');
eq(AF.check({ from: '小李' }).reason, 'missing-fields', 'N2 缺字段（missing-fields）');
const nSet = AF.set({ from: '小李', to: '张爷', form: '张爷', tier: 'stranger', formTier: 'stranger' });
eq(nSet.ok, true, 'N3 登记成功');
eq(nSet.changed, true, 'N3b 首次登记算一次变更');
eq(AF.check({ from: '小李', to: '张爷', form: '张爷' }).judge, 'fit', 'N4 档次相符 ⇒ fit');
const nOver = AF.check({ from: '小李', to: '张爷', form: '老张', formTier: 'close' });
eq(nOver.judge, 'over-familiar', 'N5 越级 ⇒ over-familiar');
ok(typeof nOver.correct === 'string' && nOver.correct.length > 0, 'N5b 越级必带纠正句（不许空串）', nOver.correct);
ok(/别这么叫/.test(nOver.correct || ''), 'N5c 纠正句是"对方当场纠正"那句', nOver.correct);
ok(typeof nOver.sinceAt === 'number', 'N5d 纠正能追到"哪一次变的"（sinceAt）', nOver.sinceAt);
const nSince = nOver.sinceAt;
const nSame = AF.set({ from: '小李', to: '张爷', form: '张爷', tier: 'stranger', formTier: 'stranger' });
eq(nSame.changed, false, 'N6 同档刷新 ⇒ changed:false（幂等）');
eq(nSame.sinceAt, nSince, 'N6b 同档刷新不动 sinceAt');
const nTier = AF.setTier({ from: '小李', to: '张爷', tier: 'close' });
eq(nTier.ok, true, 'N7 关系升档成功');
ok(nTier.sinceAt >= nSince, 'N7b 升档后 sinceAt 前进', { before: nSince, after: nTier.sinceAt });
eq(AF.check({ from: '小李', to: '张爷', form: '老张', formTier: 'close' }).judge, 'fit', 'N8 升到 close 后同一称呼变 fit（这正是"随亲疏"）');
eq(AF.set({ from: '小李', to: '张爷', form: 'x', tier: 'nonsense' }).reason, 'bad-tier', 'N9 非法档位 ⇒ bad-tier');
eq(AF.read({ from: '小李', to: '张爷' }).form, '张爷', 'N10 read 回当前称呼');
ok(AF.report().total >= 1, 'N11 report 能列出关系', AF.report().total);
eq(AF.buildBlock(), '', 'N12 没有越级时注入面零 token（负控制）');
eq(AF.CAP, 64, 'N13 上界 64（与 __BOUNDED_CAPS 对齐）');

// ── O：EXV29-03 年龄与体貌推进 ──
ok(!!AG && typeof AG.advance === 'function', 'O0 aging 已装');
eq(AG.register({ age: 30 }).reason, 'missing-fields', 'O1 缺 who ⇒ missing-fields');
eq(AG.register({ who: '老王', age: 999 }).reason, 'bad-target', 'O2 年龄越界 ⇒ bad-target');
const oReg = AG.register({ who: '老王', age: 30 });
eq(oReg.ok, true, 'O3 登记年龄基线');
eq(oReg.tier, 'young', 'O3b 30 岁是 young');
AG.advance(364);
eq(AG.read({ who: '老王' }).age, 30, 'O4 **不过年不涨**：364 天后还是 30 岁（负控制）');
AG.advance(1);
eq(AG.read({ who: '老王' }).age, 31, 'O5 满 365 天涨一岁');
eq(AG.read({ who: '老王' }).tier, 'young', 'O5b 31 岁仍是 young');
AG.register({ who: '老李', age: 30 });
const oJump = AG.advance(365 * 40);   // 一次跨四十年
const oRow = (oJump.rows || []).filter(function (r) { return r.who === '老李'; })[0] || {};
eq(oRow.years, 40, 'O6 一次跨四十年：年龄涨 40', oRow.years);
eq(oRow.clamped, true, 'O7 体貌档**只升一跳**（clamped:true）', oRow);
eq(oRow.tierAfter, 'prime', 'O7b 从 young 只升到 prime（不许一步到 venerable）', oRow);
ok(['prime', 'seasoned', 'elder', 'venerable'].indexOf(oRow.tierAfter) >= 0, 'O7c 档位在合法集内');
eq(AG.advance(-1).reason, 'bad-target', 'O8 负天数 ⇒ bad-target');
eq(AG.read({ who: '查无此人' }).reason, 'not-happened', 'O9 没登记不猜（not-happened）');
eq(AG.tierOf(30), 'young', 'O10 阈值 30 ⇒ young');
eq(AG.tierOf(35), 'prime', 'O10b 阈值 35 ⇒ prime');
eq(AG.tierOf(80), 'venerable', 'O10c 阈值 80 ⇒ venerable');
ok(AG.due().rows.length >= 1, 'O11 due 能列出快过生日的人');
eq(AG.CAP, 48, 'O12 上界 48（与 __BOUNDED_CAPS 对齐）');

// ── P：EXV29-04 习惯动作可认人 ──
ok(!!HT && typeof HT.shouldShow === 'function', 'P0 habitTell 已装');
eq(HT.register({ who: '阿七', tell: '摸耳垂', rates: { calm: 0.1, tense: 0.7 } }).reason, 'missing-fields', 'P1 三情绪缺一 ⇒ missing-fields');
eq(HT.register({ who: '阿七', tell: '摸耳垂', rates: { calm: 3, tense: 0.7, angry: 0.8 } }).reason, 'bad-target', 'P2 频率越界 ⇒ bad-target');
const pReg = HT.register({ who: '阿七', tell: '摸耳垂', rates: { calm: 0.1, tense: 0.7, angry: 0.8 } });
eq(pReg.ok, true, 'P3 登记三情绪频率');
HT.register({ who: '木头', tell: '抠桌角', rates: { calm: 0, tense: 0, angry: 0 } });
eq(HT.shouldShow({ who: '木头', mood: 'tense' }).shown, false, 'P4 频率 0 ⇒ **必然不出现**（负控制）');
HT.register({ who: '铁定', tell: '咳嗽', rates: { calm: 1, tense: 1, angry: 1 } });
eq(HT.shouldShow({ who: '铁定', mood: 'angry' }).shown, true, 'P5 频率 1 ⇒ 必然出现');
eq(HT.shouldShow({ who: '查无此人' }).reason, 'not-happened', 'P6 没登记不猜（not-happened）');
eq(HT.shouldShow({ who: '阿七', mood: 'ecstatic' }).reason, 'unknown-kind', 'P7 没这个情绪 ⇒ unknown-kind（复用拒收面既有码）');
const pZero = HT.identify({ who: '阿七', mood: 'tense', sightings: 0 });
eq(pZero.chance, 0, 'P8 零次看过 ⇒ chance 0（不许凭空认出）');
eq(pZero.recognize, false, 'P8b 零次看过 ⇒ recognize:false');
const pMany = HT.identify({ who: '阿七', mood: 'tense', sightings: 10 });
ok(pMany.chance > 0.9, 'P9 看十次 ⇒ 认出概率高（>0.9）', pMany.chance);
eq(HT.identify({ who: '阿七', sightings: -3 }).reason, 'bad-target', 'P10 负次数 ⇒ bad-target');
ok(HT.report().total >= 3, 'P11 report 能列出小动作', HT.report().total);
eq(HT.CAP, 48, 'P12 上界 48（与 __BOUNDED_CAPS 对齐）');

// ── Q：EXV29-05 忌讳与失礼 ──
ok(!!ET && typeof ET.breach === 'function', 'Q0 etiquette 已装');
const qHit = ET.breach({ who: '船工', act: '把鱼翻过来', scope: '乡野' });
eq(qHit.ok, true, 'Q1 踩了忌讳仍然 ok:true（事情照样发生了，不是报错）');
eq(qHit.hit, true, 'Q1b hit:true');
eq(qHit.severity, 'break', 'Q1c 翻鱼是 break（当场翻脸）');
ok(typeof qHit.line === 'string' && qHit.line.length > 0, 'Q1d 后果必有当场的样子（line 非空）', qHit.line);
eq(qHit.taboo, '把鱼翻过来', 'Q1e 后果可归因到哪一条忌讳');
eq(qHit.knewIt, false, 'Q1f 踩之前他不知道');
const qMiss = ET.breach({ who: '船工', act: '大声说话', scope: '乡野' });
eq(qMiss.ok, true, 'Q2 没这条忌讳也 ok:true');
eq(qMiss.hit, false, 'Q2b 没踩到 ⇒ hit:false（什么都不发生，负控制）');
eq(ET.breach({ who: 'x', act: 'y', scope: '月球' }).reason, 'bad-scope', 'Q3 没这个场合 ⇒ bad-scope');
eq(ET.learn({ who: '船工', act: '把鱼翻过来', scope: '乡野' }).ok, true, 'Q4 不知者可以从别人的反应里学到');
eq(ET.breach({ who: '船工', act: '把鱼翻过来', scope: '乡野' }).knewIt, true, 'Q4b 学到之后 knewIt:true（后果强度不变，只改"知不知道"）');
eq(ET.register({ scope: '江湖', act: '替人递刀', severity: 'changed', why: '递刀要递柄' }).ok, true, 'Q5 可加自定义忌讳');
eq(ET.breach({ who: '镖师', act: '替人递刀', scope: '江湖' }).hit, true, 'Q5b 自定义忌讳能命中');
eq(ET.register({ scope: '江湖', act: 'x', severity: 'nuke' }).reason, 'bad-tier', 'Q6 非法后果档 ⇒ bad-tier');
eq(ET.breach({ who: 'x', act: '' }).reason, 'missing-fields', 'Q7 缺 act ⇒ missing-fields');
ok(ET.recent().rows.length <= 6, 'Q8 recent 单屏最多 6 条', ET.recent().rows.length);
ok(ET.recent().total <= ET.HIT_CAP, 'Q8b 踩忌讳台账有界（<=16）', ET.recent().total);
eq(ET.table('军中').scopes.length, 1, 'Q9 table 可按场合收窄');
eq(ET.table('月球').reason, 'bad-scope', 'Q9b 非法场合 ⇒ bad-scope');

// ── R：EXV29-06 漂移报告一屏 ──
ok(!!IL && typeof IL.brief === 'function', 'R0 identityLedger.brief 已装');
const rEmpty = IL.brief();
eq(rEmpty.empty, true, 'R1 还没有基线时 empty:true');
ok(/还没有任何基线/.test(rEmpty.line || ''), 'R1b 明说"还没有基线"（不拿空表冒充"没漂"）', rEmpty.line);
IL.snapshot({ id: '漂子', address: '张爷', accent: '北边口音', habit: '摸耳垂', taboo: '翻鱼', ref: '#1' });
const rClean = IL.audit({ id: '漂子', address: '张爷', accent: '北边口音', habit: '摸耳垂', taboo: '翻鱼', ref: '#2' });
eq(rClean.drift.length, 0, 'R2 四元组全对 ⇒ 没漂');
eq(IL.brief().drifted, 0, 'R2b brief 说没漂');
ok(/没漂/.test(IL.brief().line || ''), 'R2c 明说"没漂"', IL.brief().line);
const rDrift = IL.audit({ id: '漂子', address: '老张', accent: '北边口音', habit: '摸耳垂', taboo: '翻鱼', ref: '#312' });
eq(rDrift.drift.length, 1, 'R3 只报了真变的那一项（称呼）', rDrift.drift);
eq(rDrift.drift[0].field, 'address', 'R3b 漂的是 address');
eq(rDrift.ref, '#312', 'R3c 回执带"依据哪一楼"');
const rRep = IL.report();
eq(rRep.driftTotal, 1, 'R4 report 平铺出 1 条漂移', rRep.driftTotal);
eq(rRep.driftRows[0].ref, '#312', 'R4b 每条漂移可点回原文楼（ref）', rRep.driftRows[0]);
const rBrief = IL.brief();
ok(/→/.test(rBrief.line || ''), 'R5 brief 一屏写清"从什么变成什么"', rBrief.line);
ok(/#312/.test(rBrief.line || ''), 'R5b brief 里带得出依据的楼', rBrief.line);
IL.snapshot({ id: '漂子', address: '老张', accent: '北边口音', habit: '摸耳垂', taboo: '翻鱼', ref: '#400' });
eq(IL.report().driftTotal, 0, 'R6 换了基线 ⇒ 旧的漂移留痕清掉（两代不混成一屏）');
eq(IL.view().cap, 48, 'R7 上界 48（与 __BOUNDED_CAPS 对齐）');

// ── S：有界登记（新增五键必须都进 __BOUNDED_CAPS，否则本段必红）──
const caps = (function () {
  try {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'core', 'store.js'), 'utf8');
    const keys = ['addressForms', 'aging', 'habitTells', 'etiquette', 'etiquetteHits'];
    return keys.filter(function (k) { return src.indexOf(k + ': { cap:') >= 0; });
  } catch (e) { return []; }
})();
eq(caps.length, 5, 'S1 五个新存档键都登记了上界（缺一个即红）', caps);

console.log('identity-batch1-v2524: pass ' + pass + ' / fail ' + fail);
if (fail) { console.log(fails.join('\n')); process.exit(1); }
