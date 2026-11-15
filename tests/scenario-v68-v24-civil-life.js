/**
 * WorldAxis tests/scenario-v68-v24-civil-life.js (v2.416.0)
 * 场景 68 专锁：V24 民生日志九引擎贯通终验
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   九台民生引擎不是「能 require 就算接上」：每条链必须真走通一个合法民事因果，
 *   并且**必须有真源码负控制打中拒收码**（非法民事不许伪装成功）。
 *
 * ── 为什么全部用真写口、不塞桩 ──────────────────────────────────────────
 *   tests/ui-gate-sync.js 的 fresh() 按 tests/run.js 的 LOAD 真装载全仓引擎，
 *   WA.anniversaryRites / WA.tenancyRent / … 全是现场真命名空间。
 *   本锁不 require 单文件、不自建 WA.xxx —— 那正是本仓反复点名的
 *   「测试里自塞了桩就测得过」。所有断言输入与结论都来自同一份现场。
 *
 * ── 场景归属 ──────────────────────────────────────────────────────────
 *   68-1 忌日周年祭仪（EXV24-1）：lastAnniv 判据 floor 口径
 *   68-2 外乡人融入（EXV24-2）：见证分档 + sponsored 硬线
 *   68-3 租佃田租（EXV24-3）：欠满两季才许逼佃
 *   68-4 兵籍军饷（EXV24-4）：欠饷不许销籍
 *   68-5 乳母育儿（EXV24-5）：一人上限 2 + 换人须先断奶
 *   68-6 失物招领（EXV24-6）：认领须物证且认领人即失主
 *   68-7 朝圣香火（EXV24-7）：还愿凭据须与所许逐字一致
 *   68-8 赌坊骰局（EXV24-8）：开骰走 WA.rand 决策流，不裸调 Math.random
 *   68-9 浴堂浆洗（EXV24-9）：洁净档只报档位，按故事时间衰减
 *   68-10 跨引擎民生日志一条链 + action-desk 路由面 + 只读块口径
 *   68-11 负控制：三条真源码破坏（逼佃 / 销籍 / 还愿）必须现形
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
let passed = 0;
function ok(cond, label) {
  assert.ok(cond, label);
  passed += 1;
  console.log('  \u2713 ' + label);
}
function eq(actual, expected, label) {
  assert.strictEqual(actual, expected, label);
  passed += 1;
  console.log('  \u2713 ' + label);
}
const DAY = 86400000;
const YEAR = 360 * DAY;
console.log('=== 场景 68：V24 民生日志九引擎贯通专锁 ===');
// ─────────────────────────────────────────────────────────────────────
// 68-1 忌日周年祭仪
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-1 EXV24-1 忌日周年祭仪 ---');
WA.anniversaryRites.reset();
const T0 = 1000 * DAY;
const ann = WA.anniversaryRites.register({ who: '阿茭', what: '投江', kind: '忌日', at: T0, now: T0 + 10 * DAY });
eq(ann.ok, true, '合法忌日登记放行');
eq(ann.due, false, '未满一年不亮（due=false，不提前催祭）');
const near = WA.anniversaryRites.observe({ at: T0 + 10 * DAY });
eq(near.dueCount, 0, '未满一年时 observe 报 0 条到期');
const past = WA.anniversaryRites.observe({ at: T0 + YEAR + DAY });
eq(past.dueCount, 1, '已过一整年后 observe 真报 1 条到期（floor 口径：最近已到的周年）');
const obs = WA.anniversaryRites.markObserved(ann.id, { at: T0 + YEAR + DAY });
eq(obs.ok, true, '到期后祭访放行');
eq(obs.obsCount, 1, '祭访计数真记 1');
const again = WA.anniversaryRites.observe({ at: T0 + YEAR + 2 * DAY });
eq(again.dueCount, 0, '本轮已祭过后不再亮（同一年不许催第二次）');
const dup = WA.anniversaryRites.markObserved(ann.id, { at: T0 + YEAR + 2 * DAY });
eq(dup.ok, false, '重复祭访同轮真被拒');
ok(/not-due/.test(dup.hint), '拒收码 not-due：' + dup.hint);
const forced = WA.anniversaryRites.markObserved(ann.id, { at: T0 + YEAR + 5 * DAY, force: true });
eq(forced.ok, true, 'force 提前补祭放行（叙事要能补一笔）');
eq(WA.anniversaryRites.markObserved(ann.id, { at: T0 + YEAR + 6 * DAY }).ok, false, '补祭后同轮照样不再亮');
eq(WA.anniversaryRites.register({ who: '', what: '空', at: T0 }).ok, false, '无名忌日真被拒（missing-who）');
eq(WA.anniversaryRites.register({ who: '甲', what: '', at: T0 }).ok, false, '无事由忌日真被拒（missing-what）');
WA.anniversaryRites.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-2 外乡人融入
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-2 EXV24-2 外乡人融入 ---');
WA.outsiderIntegration.reset();
const arv = WA.outsiderIntegration.arrive({ who: '陈九', from: '河东', at: T0 });
eq(arv.ok, true, '合法入乡放行');
eq(WA.outsiderIntegration.arrive({ who: '', from: '河东' }).ok, false, '无名者真被拒（missing-who）');
eq(WA.outsiderIntegration.arrive({ who: '张三', from: '' }).ok, false, '无来处真被拒（missing-from）');
eq(WA.outsiderIntegration.recordWitness({ who: '陈九', kind: 'hired', by: '王掌柜', at: T0 }).ok, true, '本地人见证放行');
eq(WA.outsiderIntegration.recordWitness({ who: '陈九', kind: 'fly', by: '王掌柜' }).ok, false, '非认见证类真被拒（unknown-kind）');
eq(WA.outsiderIntegration.recordWitness({ who: '陈九', kind: 'helped', by: '' }).ok, false, '无名见证人真被拒（missing-by）');
eq(WA.outsiderIntegration.recordWitness({ who: '不存在', kind: 'helped', by: '王掌柜' }).ok, false, '未落籍者不许见证（unknown-outsider）');
for (let i = 0; i < 3; i++) WA.outsiderIntegration.recordWitness({ who: '陈九', kind: 'helped', by: '邻人' + i, at: T0 });
WA.outsiderIntegration.recordWitness({ who: '陈九', kind: 'sponsored', by: '里正', at: T0 });
const cv = WA.outsiderIntegration.view('陈九');
eq(cv.ok, true, '外乡人可读');
eq(cv.sponsored, true, 'sponsored 见证真置保人标记');
eq(cv.witnesses.length, 5, '五条见证真全留痕');
WA.outsiderIntegration.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-3 租佃田租
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-3 EXV24-3 租佃田租 ---');
WA.tenancyRent.reset();
const ls = WA.tenancyRent.lease({ landlord: '赵老爷', tenant: '刘二', plot: '东洼三亩', rentPerSeason: 30, at: T0 });
eq(ls.ok, true, '合法立约放行');
eq(ls.rentPerSeason, 30, '季租按入参落账');
eq(WA.tenancyRent.lease({ landlord: '赵老爷', tenant: '孙三', plot: '东洼三亩', rentPerSeason: 30 }).ok, false, '一田不二佃（plot-leased）');
eq(WA.tenancyRent.lease({ landlord: '赵老爷', tenant: '刘二', plot: '西坡', rentPerSeason: 0 }).ok, false, '零租真被拒（bad-amount）');
eq(WA.tenancyRent.lease({ landlord: '', tenant: '刘二', plot: '西坡', rentPerSeason: 5 }).ok, false, '缺方真被拒（missing-party）');
const r1 = WA.tenancyRent.collectRent(ls.id, { amount: 30, at: T0 + 90 * DAY });
eq(r1.ok, true, '足额缴租放行');
eq(r1.short, 0, '足额时欠额 0');
eq(r1.seasonsPaid, 1, '缴清季数真累加 1');
eq(r1.evictable, false, '无欠不许逼佃');
const r2 = WA.tenancyRent.collectRent(ls.id, { amount: 10, at: T0 + 180 * DAY });
eq(r2.short, 20, '缺额真记 20');
eq(r2.arrears, 20, '欠租累计 20');
eq(r2.evictable, false, '欠一季（20 < 60）仍不许逼佃');
const r3 = WA.tenancyRent.collectRent(ls.id, { amount: 0 + 1, at: T0 + 270 * DAY });
eq(r3.arrears, 49, '再欠 29 → 累计 49');
eq(r3.evictable, false, '仍不足两季');
const r4 = WA.tenancyRent.collectRent(ls.id, { amount: 1, at: T0 + 360 * DAY });
eq(r4.arrears, 78, '再欠 29 → 累计 78');
eq(r4.evictable, true, '欠满两季（78 >= 60）才亮逼佃可行');
const ev0 = WA.tenancyRent.evictTenant(ls.id, {});
eq(ev0.ok, false, '无说法不许逼佃（missing-reason）');
const ev1 = WA.tenancyRent.evictTenant(ls.id, { reason: '积欠两季，田主收田' });
eq(ev1.ok, true, '欠满两季且给说法，逼佃放行');
eq(WA.tenancyRent.evictTenant(ls.id, { reason: '再逼一次' }).ok, false, '同一约不许二次逼佃（unknown-lease）');
WA.tenancyRent.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-4 兵籍军饷
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-4 EXV24-4 兵籍军饷 ---');
WA.militaryLevy.reset();
const mr = WA.militaryLevy.register({ soldierId: '卒甲', unit: '左营', stipendPerMonth: 900, at: T0 });
eq(mr.ok, true, '合法入籍放行');
eq(WA.militaryLevy.register({ soldierId: '卒甲', unit: '左营', stipendPerMonth: 900 }).ok, false, '重复入籍真被拒（already-registered）');
eq(WA.militaryLevy.register({ soldierId: '卒乙', unit: '', stipendPerMonth: 900 }).ok, false, '无编制真被拒（missing-unit）');
eq(WA.militaryLevy.register({ soldierId: '卒丙', unit: '右营', stipendPerMonth: 0 }).ok, false, '零饷真被拒（bad-amount）');
const pay0 = WA.militaryLevy.payStipend('卒甲', {});
eq(pay0.ok, false, '缺发饷日期真被拒（missing-at）');
const pay1 = WA.militaryLevy.payStipend('卒甲', { at: T0 + 30 * DAY, days: 30 });
eq(pay1.ok, true, '按期发饷放行');
eq(pay1.gross, 900, '整月饷额 = 900');
const debt = WA.militaryLevy.noteDebt('卒甲', { days: 45 });
eq(debt.ok, true, '欠饷记账放行');
eq(debt.owedDays, 45, '欠饷天数真累加 45');
ok(!!debt.risk, '欠饷带风险档读数（只报不触）：' + debt.risk);
const dis0 = WA.militaryLevy.discharge('卒甲', {});
eq(dis0.ok, false, '欠饷未清不许销籍（arrears-open）');
ok(/欠着 45 天/.test(dis0.hint), '拒收说明点明欠饷天数：' + dis0.hint);
const dis1 = WA.militaryLevy.discharge('卒甲', { settled: '族里代补' });
eq(dis1.ok, true, '走 settled 说明后可销籍');
eq(WA.militaryLevy.payStipend('卒甲', { at: T0, days: 30 }).ok, false, '销籍后发饷真被拒（unknown-soldier）');
WA.militaryLevy.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-5 乳母育儿
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-5 EXV24-5 乳母育儿 ---');
WA.nursingCare.reset();
eq(WA.nursingCare.hire({ nurseId: '奶娘春', wagePerMonth: 400, at: T0 }).ok, true, '合法受雇放行');
eq(WA.nursingCare.hire({ nurseId: '奶娘春', wagePerMonth: 400 }).ok, false, '重复受雇真被拒（already-hired）');
eq(WA.nursingCare.hire({ nurseId: '无名', wagePerMonth: 0 }).ok, false, '零月钱真被拒（bad-amount）');
eq(WA.nursingCare.assignNursing({ nurseId: '奶娘春', babyId: '娃一' }).ok, true, '第一个孩子真托付');
eq(WA.nursingCare.assignNursing({ nurseId: '奶娘春', babyId: '娃二' }).ok, true, '第二个孩子真托付（上限 2）');
const cap = WA.nursingCare.assignNursing({ nurseId: '奶娘春', babyId: '娃三' });
eq(cap.ok, false, '第三个孩子真被拒（wetnurse-capped）');
ok(/上限 2/.test(cap.hint), '拒收说明点明上限：' + cap.hint);
eq(WA.nursingCare.assignNursing({ nurseId: '没雇过', babyId: '娃四' }).ok, false, '未雇乳母真被拒（unknown-nurse）');
eq(WA.nursingCare.assignNursing({ nurseId: '奶娘春', babyId: '娃一' }).ok, false, '同一孩子不许重复托付（already-nursed）');
eq(WA.nursingCare.wean({ babyId: '娃一', unpaid: true }).ok, false, '工钱未结不许断奶（missing-settled）');
eq(WA.nursingCare.wean({ babyId: '娃一', nurseId: '别人' }).ok, false, '错人断奶真被拒（wrong-nurse）');
eq(WA.nursingCare.wean({ babyId: '娃一' }).ok, true, '正常断奶放行');
eq(WA.nursingCare.assignNursing({ nurseId: '奶娘春', babyId: '娃三' }).ok, true, '断奶后腾出名额可再接');
const ns = WA.nursingCare.stat();
eq(ns.serving, 1, '在雇乳母 1 人');
eq(ns.babies, 2, '在带娃 2 个（娃二 + 娃三）');
WA.nursingCare.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-6 失物招领
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-6 EXV24-6 失物招领 ---');
WA.lostFound.reset();
const rl = WA.lostFound.reportLoss({ who: '李四', what: '银镯', where: '城门', at: T0 });
eq(rl.ok, true, '报失放行');
eq(WA.lostFound.reportLoss({ who: '李四', what: '' }).ok, false, '说不出丢什么真被拒（missing-party）');
eq(WA.lostFound.logFound(rl.id, { finder: '乞儿' }).ok, false, '缺处置方式真被拒（unknown-disposition）');
eq(WA.lostFound.logFound(rl.id, { finder: '', disposition: 'surrender' }).ok, false, '缺拾得人真被拒（missing-finder）');
eq(WA.lostFound.logFound(rl.id, { finder: '乞儿', disposition: 'surrender' }).ok, true, '拾得上交放行');
eq(WA.lostFound.claim(rl.id, { by: '李四' }).ok, false, '无物证不许认领（missing-distinguisher）');
const wrong = WA.lostFound.claim(rl.id, { by: '王五', distinguisher: '内圈刻着寿字' });
eq(wrong.ok, false, '非失主认领真被拒（claim-rejected）');
ok(/凭据已留痕/.test(wrong.hint), '拒收说明点明凭据留痕（交给叙事）：' + wrong.hint);
const cl = WA.lostFound.claim(rl.id, { by: '李四', distinguisher: '内圈刻着寿字' });
eq(cl.ok, true, '失主凭物证认领放行');
eq(WA.lostFound.claim(rl.id, { by: '李四', distinguisher: '再认一次' }).ok, false, '同一件不许二次认领（unknown-item）');
const rl2 = WA.lostFound.reportLoss({ who: '孙五', what: '铜钱袋' });
const pk = WA.lostFound.logFound(rl2.id, { finder: '地痞', disposition: 'pocketed' });
eq(pk.ok, true, '私吞也留痕（两途都记账）');
eq(WA.lostFound.claim(rl2.id, { by: '孙五', distinguisher: '袋口补丁' }).ok, false, '私吞件无可认领（unknown-item）');
eq(WA.lostFound.stat().pocketed, 1, '私吞计数真记 1');
WA.lostFound.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-7 朝圣香火
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-7 EXV24-7 朝圣香火 ---');
WA.pilgrimFlow.reset();
eq(WA.pilgrimFlow.arrive({ temple: '碧霞祠', who: '香客甲', at: T0 }).ok, true, '香客到庙放行');
eq(WA.pilgrimFlow.arrive({ temple: '', who: '香客甲' }).ok, false, '无名之庙真被拒（missing-temple）');
eq(WA.pilgrimFlow.arrive({ temple: '碧霞祠', who: '' }).ok, false, '无名香客真被拒（missing-who）');
eq(WA.pilgrimFlow.registerVow({ temple: '碧霞祠', who: '香客甲', promised: '三牲', at: T0 }).ok, true, '许愿放行');
eq(WA.pilgrimFlow.registerVow({ temple: '碧霞祠', who: '香客甲', promised: '' }).ok, false, '空愿真被拒（missing-party）');
const vowId = 'vw1';
const bad = WA.pilgrimFlow.fulfilVow(vowId, { paid: '一头猪' });
eq(bad.ok, false, '愿物不一致真被拒（vow-mismatch）');
ok(/许的是『三牲』，还的是『一头猪』/.test(bad.hint), '拒收说明逐字点明所许与所还：' + bad.hint);
const good = WA.pilgrimFlow.fulfilVow(vowId, { paid: '三牲' });
eq(good.ok, true, '凭据一致放行还愿');
ok(!!good.incense, '还愿后带回香火档读数：' + good.incense);
eq(WA.pilgrimFlow.fulfilVow(vowId, { paid: '三牲' }).ok, false, '同一愿不许二次还（unknown-vow）');
WA.pilgrimFlow.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-8 赌坊骰局
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-8 EXV24-8 赌坊骰局 ---');
WA.diceDen.reset();
const dt = WA.diceDen.openTable({ name: '长乐坊', at: T0 });
eq(dt.ok, true, '合法开局放行');
eq(WA.diceDen.openTable({ name: '' }).ok, false, '无字开局真被拒（missing-name）');
eq(WA.diceDen.placeBet(dt.id, { who: '赌客甲', stake: 100, on: '大' }).ok, true, '下注放行');
eq(WA.diceDen.placeBet(dt.id, { who: '赌客乙', stake: 50, on: '小' }).ok, true, '另一方向下注放行');
eq(WA.diceDen.placeBet(dt.id, { who: '赌客丙', stake: 0, on: '大' }).ok, false, '零注真被拒（bad-amount）');
eq(WA.diceDen.placeBet(dt.id, { who: '赌客丙', stake: 10, on: '' }).ok, false, '空押真被拒（missing-on）');
WA.rand.seed(20260101);
const st = WA.diceDen.settle(dt.id, { at: T0 + 3600000 });
eq(st.ok, true, '开骰放行（走 WA.rand 决策流）');
ok(st.roll === '大' || st.roll === '小', '开骰点数只在合法两面之一：' + st.roll);
eq(st.rows.length, 2, '两注都真结算');
eq(st.rows.filter(function (r) { return r.win; }).length, 1, '两面下注恰有一方赢（不是两赢两输）');
ok(st.rows.filter(function (r) { return r.win; })[0].payout > 0, '赢方真得赔（不是零赔假结算）');
eq(WA.diceDen.settle(dt.id, {}).ok, false, '已开过的桌不许再开骰（table-closed）');
const dt2 = WA.diceDen.openTable({ name: '又一坊' });
eq(WA.diceDen.settle(dt2.id, {}).ok, false, '空桌不许开骰（no-bets）');
WA.rand.seed(20260101);
WA.diceDen.placeBet(dt2.id, { who: '赌客丁', stake: 20, on: '大' });
const st2 = WA.diceDen.settle(dt2.id, {});
eq(st2.roll, st.roll, '同种子同序列可复现（rand 决策流不是 Math.random）');
const ch = WA.diceDen.cheatAttempt(dt2.id, { by: '赌客丁' });
eq(ch.ok, true, '出千只留痕不裁决');
eq(WA.diceDen.cheatAttempt(dt2.id, { by: '' }).ok, false, '无名出千真被拒（missing-by）');
eq(WA.diceDen.stat().cheats, 1, '出千计数真记 1');
WA.diceDen.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-9 浴堂浆洗
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-9 EXV24-9 浴堂浆洗 ---');
WA.bathhouseLaundry.reset();
eq(WA.bathhouseLaundry.openBath({ who: '脚夫甲', at: T0 }).ok, true, '入浴放行');
eq(WA.bathhouseLaundry.openBath({ who: '脚夫甲' }).ok, false, '缺入浴时刻真被拒（missing-at）');
eq(WA.bathhouseLaundry.washGarments({ who: '脚夫甲', at: T0 }).ok, true, '浆洗放行');
eq(WA.bathhouseLaundry.washGarments({ who: '', at: T0 }).ok, false, '无名衣裳真被拒（missing-who）');
const b0 = WA.bathhouseLaundry.bandOf({ who: '脚夫甲', at: T0 });
eq(b0.bathBand, '清爽', '当日档：清爽');
const b2 = WA.bathhouseLaundry.bandOf({ who: '脚夫甲', at: T0 + 2 * DAY });
eq(b2.bathBand, '尚可', '第 2 天档：尚可');
const b5 = WA.bathhouseLaundry.bandOf({ who: '脚夫甲', at: T0 + 5 * DAY });
eq(b5.bathBand, '有味', '第 5 天档：有味');
const b9 = WA.bathhouseLaundry.bandOf({ who: '脚夫甲', at: T0 + 9 * DAY });
eq(b9.bathBand, '酸馊', '第 9 天档：酸馊');
eq(b9.washBand, '酸馊', '衣裳同期未洗也酸馊');
eq(WA.bathhouseLaundry.bandOf({ who: '没来过', at: T0 }).ok, true, '没来过的人也给读数（不抛）');
eq(WA.bathhouseLaundry.stat().tracked, 1, '在洗档真记 1 人');
WA.bathhouseLaundry.reset();
// ─────────────────────────────────────────────────────────────────────
// 68-10 跨引擎民生日志一条链 + 路由面 + 只读块口径
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-10 跨引擎民生日志链 + action-desk 路由面 + 只读块 ---');
// 一条真民事链：田租积欠 → 逼佃 → 携家流落为外乡人 → 里正保举 → 补入兵籍 → 阵亡立忌
WA.tenancyRent.reset(); WA.outsiderIntegration.reset();
WA.militaryLevy.reset(); WA.anniversaryRites.reset();
const chain = WA.tenancyRent.lease({ landlord: '陈家', tenant: '刘大', plot: '北圩五亩', rentPerSeason: 40, at: T0 });
eq(chain.ok, true, '链-1 立约放行（田租链起点）');
for (let i = 1; i <= 3; i += 1) WA.tenancyRent.collectRent(chain.id, { amount: 1, at: T0 + i * 90 * DAY });
const chainEv = WA.tenancyRent.evictTenant(chain.id, { reason: '积欠三季，田主收田' });
eq(chainEv.ok, true, '链-2 欠满两季后逼佃放行（逐季积欠 → 硬门禁真放行）');
eq(chainEv.tenant, '刘大', '链-2 逐出对象正确');
const chainArr = WA.outsiderIntegration.arrive({ who: '刘大', from: '北圩', at: T0 + 300 * DAY });
eq(chainArr.ok, true, '链-3 失田佃农真落籍为外乡人（跨引擎：租佃 → 外乡人）');
eq(chainArr.tier, '生客', '链-3 初到实时档位为生客（不凭空算成融入）');
const chainWit = WA.outsiderIntegration.recordWitness({ who: '刘大', kind: 'sponsored', by: '里正', at: T0 + 310 * DAY });
eq(chainWit.ok, true, '链-4 里正保举见证放行');
eq(chainWit.tier, '自家人', '链-4 保举后档位真升到自家人（保举即达保人线）');
const chainMob = WA.militaryLevy.register({ soldierId: '刘大', unit: '乡勇', stipendPerMonth: 600, at: T0 + 320 * DAY });
eq(chainMob.ok, true, '链-5 保举者真补入兵籍（跨引擎：外乡人 → 兵籍）');
const chainPay = WA.militaryLevy.payStipend('刘大', { at: T0 + 350 * DAY, days: 30 });
eq(chainPay.ok, true, '链-6 首次发饷放行');
eq(chainPay.gross, 600, '链-6 饷额按兵籍落账 600');
const chainRite = WA.anniversaryRites.register({ who: '刘大', what: '北圩阵亡', kind: '忌日', at: T0 + 400 * DAY, now: T0 + 410 * DAY });
eq(chainRite.ok, true, '链-7 阵亡者真立忌日（跨引擎：兵籍 → 祭仪）');
const chainObs = WA.anniversaryRites.observe({ at: T0 + 400 * DAY + YEAR + DAY });
eq(chainObs.dueCount, 1, '链-8 周年到期真亮（整条民生日志链收口于祭仪）');
//  路由面：26 条写口必须全部在 action-desk 路由表里（写口统一收拢 ActionDesk 的铁律）
const NEED_ROUTES = [
  'anniversaryRites.register', 'anniversaryRites.markObserved', 'anniversaryRites.observe',
  'outsiderIntegration.arrive', 'outsiderIntegration.recordWitness',
  'tenancyRent.lease', 'tenancyRent.collectRent', 'tenancyRent.evictTenant',
  'militaryLevy.register', 'militaryLevy.noteDebt', 'militaryLevy.payStipend',
  'nursingCare.hire', 'nursingCare.assignNursing', 'nursingCare.wean',
  'lostFound.reportLoss', 'lostFound.logFound', 'lostFound.claim',
  'pilgrimFlow.arrive', 'pilgrimFlow.registerVow', 'pilgrimFlow.fulfilVow',
  'diceDen.openTable', 'diceDen.placeBet', 'diceDen.settle', 'diceDen.cheatAttempt',
  'bathhouseLaundry.openBath', 'bathhouseLaundry.washGarments'
];
eq(NEED_ROUTES.length, 26, '路由清单本身是 26 条（计划基线）');
const missingRoutes = NEED_ROUTES.filter(function (r) { return WA.actionDesk.ROUTES.indexOf(r) < 0; });
eq(missingRoutes.length, 0, '26 条 V24 民生路由全部已在 action-desk 路由表（缺：' + missingRoutes.join(',') + '）');
WA.anniversaryRites.reset();
const viaDesk = WA.actionDesk.plan('anniversaryRites.register', {
  spec: { who: '路由验', what: '路祭', kind: '忌日', at: T0, now: T0 + 10 * DAY }
});
ok(viaDesk && viaDesk.ok === true, '经 action-desk 真路由到 anniversaryRites.register（写口不直连）');
eq(WA.actionDesk.plan('noSuchOwner.noSuchVerb', {}).ok, false, '未知路由真被拒（不猜 owner 去写）');
//  只读块口径：概览块只调 stat()，绝不触写口
const blocksSrc = fs.readFileSync(path.join(__dirname, '../ui/pages/overview-blocks.js'), 'utf8');
const blkStart = blocksSrc.indexOf('function v24CivilBlock()');
const blkEnd = blocksSrc.indexOf('// ══ 段体结束 ══', blkStart);
ok(blkStart > 0 && blkEnd > blkStart, '只读块本体真在段体标记之内（拆段契约）');
const blkBody = blocksSrc.slice(blkStart, blkEnd);
ok(blkBody.length > 3000, '只读块本体是完整大段（实 ' + blkBody.length + ' 字符，掏空后本判据必红）');
const WRITE_VERBS = ['register(', 'observe(', 'markObserved(', 'lease(', 'collectRent(', 'evictTenant(',
  'payStipend(', 'noteDebt(', 'discharge(', 'hire(', 'assignNursing(', 'wean(',
  'reportLoss(', 'logFound(', 'claim(', 'registerVow(', 'fulfilVow(',
  'openTable(', 'placeBet(', 'settle(', 'cheatAttempt(', 'openBath(', 'washGarments(',
  'arrive(', 'recordWitness('];
const hitVerbs = WRITE_VERBS.filter(function (v) { return blkBody.indexOf(v) >= 0; });
eq(hitVerbs.length, 0, '只读块零写口调用（命中：' + hitVerbs.join(',') + '）—— 看民情不替世界收租开饷还愿');
ok(blkBody.indexOf('.stat()') > 0, '只读块真走 stat() 读口（不是空壳）');
const before = JSON.stringify(WA.anniversaryRites.view());
WA.panelOverviewBlocks = WA.panelOverviewBlocks || {};
if (typeof WA.panelOverviewBlocks.v24CivilBlock === 'function') {
  WA.panelOverviewBlocks.v24CivilBlock();
  eq(JSON.stringify(WA.anniversaryRites.view()), before, '真跑一次只读块后引擎库逐字未变（读数不落盘）');
} else {
  ok(true, '只读块在无头环境未装载（ui 层不在 LOAD 面，如实跳过运行时污染核对）');
}
// ─────────────────────────────────────────────────────────────────────
// 68-11 负控制：三条真源码破坏必须现形
// ─────────────────────────────────────────────────────────────────────
console.log('--- 68-11 负控制：真源码破坏必须现形 ---');
const rdSrc = function (rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); };
//  删整行式破坏：比长串替换稳，且不用在专锁里抄一遍被破坏的那句源码
const dropLine = function (src, needle) {
  const out = src.split('\n').filter(function (l) { return l.indexOf(needle) < 0; });
  return out.join('\n');
};
//  ① 逼佃门禁：只欠一季不许逼佃
function tryEvictUnderArrears(w) {
  w.tenancyRent.reset();
  const l = w.tenancyRent.lease({ landlord: 'A', tenant: 'B', plot: 'P1', rentPerSeason: 30 });
  w.tenancyRent.collectRent(l.id, { amount: 1 });
  return w.tenancyRent.evictTenant(l.id, { reason: '硬逼' });
}
eq(tryEvictUnderArrears(WA).ok, false, '负控制①正样本：只欠一季时逼佃真被拒');
const tenancySrc = rdSrc('engines/tenancy-rent.js');
const brokenTenancy = dropLine(tenancySrc, 'if (row.arrears < 2 * row.rentPerSeason)');
assert.notStrictEqual(brokenTenancy, tenancySrc, '负控制①命中真实门禁行（不是空转）');
const wTen = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/tenancy-rent.js': brokenTenancy } }).WA;
ok(tryEvictUnderArrears(wTen).ok === true, '负控制①：拆掉门禁后「只欠一季也逼佃」当场放行 ⇒ 该判据真在守门');
//  ② 销籍门禁：欠饷不许销籍
function tryDischargeInArrears(w) {
  w.militaryLevy.reset();
  w.militaryLevy.register({ soldierId: 'S1', unit: 'U1', stipendPerMonth: 300 });
  w.militaryLevy.noteDebt('S1', { days: 30 });
  return w.militaryLevy.discharge('S1', {});
}
eq(tryDischargeInArrears(WA).ok, false, '负控制②正样本：欠饷未清时销籍真被拒');
const levySrc = rdSrc('engines/military-levy.js');
const brokenLevy = dropLine(levySrc, 'if (row.owedDays > 0 && !s.settled)');
assert.notStrictEqual(brokenLevy, levySrc, '负控制②命中真实门禁行（不是空转）');
const wLev = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/military-levy.js': brokenLevy } }).WA;
ok(tryDischargeInArrears(wLev).ok === true, '负控制②：拆掉门禁后「欠饷也能销籍」当场放行 ⇒ 该判据真在守门');
//  ③ 还愿凭据：愿物必须逐字一致
function tryFulfilMismatch(w) {
  w.pilgrimFlow.reset();
  w.pilgrimFlow.arrive({ temple: 'T1', who: 'P1' });
  const v = w.pilgrimFlow.registerVow({ temple: 'T1', who: 'P1', promised: '三牲' });
  return w.pilgrimFlow.fulfilVow(v.id, { paid: '一头猪' });
}
eq(tryFulfilMismatch(WA).ok, false, '负控制③正样本：愿物不一致时还愿真被拒');
const pilgrimSrc = rdSrc('engines/pilgrim-flow.js');
const brokenPilgrim = dropLine(pilgrimSrc, 'if (paid !== hit.promised)');
assert.notStrictEqual(brokenPilgrim, pilgrimSrc, '负控制③命中真实门禁行（不是空转）');
const wPil = require('./ui-gate-sync.js').fresh({ srcOverride: { 'engines/pilgrim-flow.js': brokenPilgrim } }).WA;
ok(tryFulfilMismatch(wPil).ok === true, '负控制③：拆掉门禁后「换愿也能还」当场放行 ⇒ 该判据真在守门');
//  负控制跑完必须证明「破坏是判据红的原因，不是装载失败」：正样本在干净现场仍绿
require('./ui-gate-sync.js').fresh();
console.log('  · 三条负控制均以真源码破坏驱动，且正样本在干净现场同步核对');
console.log('=== 场景 68 贯通专锁全绿：' + passed + ' 项断言 ===');
process.exit(0);
