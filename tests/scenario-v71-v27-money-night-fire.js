/**
 * WorldAxis tests/scenario-v69-v27-money-night-fire.js (v2.523.0)
 * 场景 71 专锁：V27「钱、货、夜、火」九引擎贯通终验
 *
 * ── 本锁钉的是什么 ────────────────────────────────────────────────────
 *   九台新引擎不是「能 require 就算接上」：每一台必须真走通一条合法因果，
 *   并且**每条硬门禁都必须被真源码破坏打过**（拆掉门禁 ⇒ 非法动作当场放行），
 *   否则「拒收」可能只是根本没走到那一行。
 *
 * ── 为什么全部用真装载面 ──────────────────────────────────────────────
 *   `tests/ui-gate-sync.js` 的 fresh() 按 tests/run.js 的 LOAD 真装载全仓引擎，
 *   WA.pawnRedemption / WA.saltFranchise / … 全是现场真命名空间；本锁不 require
 *   单文件、不自建 WA.xxx。
 *
 * ── 场景归属 ──────────────────────────────────────────────────────────
 *   71-1 盐引（EXV27-3）· 71-2 牙行（EXV27-4）· 71-3 成色（EXV27-2）
 *   71-4 当票（EXV27-1）· 71-5 更夫（EXV27-5）· 71-6 火政（EXV27-6）
 *   71-7 灯会（EXV27-7）· 71-8 保甲（EXV27-8）· 71-9 占卜（EXV27-9）
 *   71-10 九台一条链（钱货夜火）· 71-11 三条真源码负控制
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const sync = require('./ui-gate-sync.js');
const { WA } = sync.fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
let passed = 0;
function ok(cond, label) { assert.ok(cond, label); passed += 1; console.log('  \u2713 ' + label); }
function eq(actual, want, label) { assert.strictEqual(actual, want, label + '（实 ' + actual + '）'); passed += 1; console.log('  \u2713 ' + label); }
function rdSrc(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
// 把「从 anchor 开始、到该语句分号为止」的整条语句替换为 `;`。
//   —— 门禁语句常写成跨行（条件一行、hint 字符串续一行），只删首行会把续行留成孤立
//   语句而变成语法错误（那样负控制证明的是「装载失败」而不是「门禁被拆」）。
function dropLine(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return src;
  let j = i;
  while (j < src.length && src[j] !== ';') j += 1;
  return src.slice(0, i) + ';' + src.slice(j + 1);
}

// ── 71-1 盐引专卖与私盐查缉 ────────────────────────────────────────────
const F = WA.saltFranchise;
ok(typeof F === 'object' && typeof F.grant === 'function', '69-1a 盐引命名空间真装载');
eq(F.grant({ merchant: '张盐商', district: '淮北', quota: 100 }).ok, true, '69-1b 引额登记');
eq(F.drawSalt({ merchant: '张盐商', district: '淮北', amount: 60 }).left, 40, '69-1c 支盐后余额');
eq(F.drawSalt({ merchant: '张盐商', district: '淮北', amount: 50 }).reason, 'over-quota', '69-1d 越额即私盐，当场拒');
eq(F.seize({ merchant: '张盐商', amount: 10 }).reason, 'missing-witness', '69-1e 无见证不查获');
eq(F.seize({ merchant: '张盐商', district: '淮北', amount: 50, witness: '更夫赵六' }).ok, true, '69-1f 有见证才没入');
eq(F.drawSalt({ merchant: '无名', district: '淮北', amount: 1 }).reason, 'unknown-charter', '69-1g 无引而支不是生意');

// ── 71-2 牙行居间与抽佣 ────────────────────────────────────────────────
const B = WA.brokerHouse;
eq(B.match({ broker: '王牙人', district: '南市', buyer: 'a', seller: 'b', goods: '布', price: 10 }).reason,
  'unknown-broker', '69-2a 没挂号的牙人不能保成交');
eq(B.enlist({ broker: '王牙人', district: '南市' }).ok, true, '69-2b 牙人挂号');
const deal = B.match({ broker: '王牙人', district: '南市', buyer: '李', seller: '赵', goods: '盐', price: 100 });
eq(deal.ok, true, '69-2c 撮合成交');
eq(B.commission(deal.id, { ratePct: 20 }).reason, 'rate-too-high', '69-2d 抽佣超上限当场拒');
const fee = B.commission(deal.id, { ratePct: 3 });
eq(fee.fee, 3, '69-2e 三分佣');
eq(fee.toSeller, 97, '69-2f 卖方到手');
eq(B.defame({ broker: '王牙人', kind: 'fly-over' }).reason, 'missing-witness', '69-2g 失信须有告发人');

// ── 71-3 银钱成色与火耗 ────────────────────────────────────────────────
const S = WA.silverAssay;
eq(S.assay({ amount: 30, purityPct: 80 }).fineSilver, 24, '69-3a 八色三十两 = 纯银二十四两');
eq(S.addMeltLoss({ amount: 100, fromPurityPct: 80, toPurityPct: 100 }).meltLoss, 1.6, '69-3b 倾煎火耗按成色差真扣');
eq(S.shortString({ stringLength: 1000, shortBy: 30 }).actual, 970, '69-3c 短陌到手');
eq(S.shortString({ stringLength: 100, shortBy: 100 }).reason, 'bad-short', '69-3d 短成空手不是短陌');

// ── 71-4 当票质押与赎当 ────────────────────────────────────────────────
const P = WA.pawnRedemption;
const t1 = P.pledge({ pawner: '王五', item: '玉镯', appraisal: 40, principal: 30, monthlyRatePct: 3, termMonths: 3 });
eq(t1.ok, true, '69-4a 押物开票');
eq(P.pledge({ pawner: 'a', item: 'b', appraisal: 5, principal: 3, termMonths: 2 }).reason, 'missing-rate',
  '69-4b 月息不许本模块猜');
eq(P.redeem(t1.id, { months: 2, paid: 30 }).reason, 'insufficient-payment', '69-4c 本息不清不还物');
eq(P.redeem(t1.id, { months: 2, paid: 31.8 }).ok, true, '69-4d 本息结清即赎');
const t2 = P.pledge({ pawner: '李四', item: '皮袄', appraisal: 20, principal: 10, monthlyRatePct: 5, termMonths: 2 });
eq(P.forfeit(t2.id, { months: 2, buyer: '布商', salePrice: 30 }).reason, 'not-due', '69-4e 未到期不许绝当');
const ff = P.forfeit(t2.id, { months: 5, buyer: '布商', salePrice: 30 });
eq(ff.surplus, 17.5, '69-4f 绝当售价超本息，余款必须报出（不许吞）');

// ── 71-5 更夫巡夜与夜禁 ────────────────────────────────────────────────
const N = WA.nightWatch;
eq(N.report({ watchman: '赵六', kind: 'fire', place: '盐仓' }).reason, 'not-on-duty', '69-5a 不在班不能算「更夫看见」');
eq(N.beat({ watchman: '赵六', watch: 3, night: '八月初三' }).ok, true, '69-5b 打三更');
eq(N.beat({ watchman: '赵六', watch: 3, night: '八月初三' }).reason, 'duplicate-beat', '69-5c 同一更不许重复打');
eq(N.beat({ watchman: '钱七', watch: 9 }).reason, 'bad-watch', '69-5d 更次越界拒收');
eq(N.violate({ who: '孙八', kind: 'no-lantern' }).reason, 'missing-witness', '69-5e 无拿人者不立夜禁');
eq(N.report({ watchman: '赵六', kind: 'fire', place: '盐仓' }).ok, true, '69-5f 在班后报事成立');

// ── 71-6 火政与走水 ────────────────────────────────────────────────────
const W2 = WA.fireWatch;
const fire = W2.ignite({ place: '盐仓', material: 'oil', wind: 'gale' });
eq(fire.area, 15, '69-6a 油料遇大风：初始火场 15');
eq(W2.ignite({ place: 'x', material: 'jade' }).reason, 'unknown-material', '69-6b 材质不明不许起火');
eq(W2.fight({ id: fire.id }).reason, 'not-mustered', '69-6c 没调人不许报扑救');
W2.muster({ id: fire.id, men: 2, buckets: 1, distance: 0 });
const f1 = W2.fight({ id: fire.id });
eq(f1.status, 'spreading', '69-6d 人手不抵火场 ⇒ 延烧');
eq(f1.area, 22.5, '69-6e 延烧后火场');
W2.muster({ id: fire.id, men: 10, buckets: 3, distance: 0 });
eq(W2.fight({ id: fire.id }).status, 'extinguished', '69-6f 调足人才灭得了');
eq(W2.loss({ id: fire.id, amount: 40, what: '存盐', unit: '引' }).ok, true, '69-6g 损失落账');

// ── 71-7 灯会庙市与纸扎 ────────────────────────────────────────────────
const V = WA.festivalFair;
const stall = V.openStall({ owner: '扎纸张', goods: '纸灯', fair: 'lantern', lanterns: 9 });
eq(stall.fireRisk, 'high', '69-7a 九盏灯堆一处 = 高火险档');
const stall2 = V.openStall({ owner: '糖人李', goods: '糖人', fair: 'lantern', lanterns: 1 });
eq(stall2.fireRisk, 'low', '69-7b 一盏灯是低火险');
eq(V.crowd({ fair: 'lantern', people: 400 }).perStall, 200, '69-7c 客流按摊均分');
eq(V.closeStall({ id: stall2.id, sold: 0 }).hint.indexOf('no-sale') === 0, true, '69-7d 分来人却零成交要报出来');
eq(V.openStall({ owner: 'x', goods: 'y', fair: 'market' }).reason, 'unknown-fair', '69-7e 会别不明拒收');

// ── 71-8 保甲乡约与义仓 ────────────────────────────────────────────────
const D = WA.wardCompact;
eq(D.enroll({ ward: '东三甲', head: '甲长周', households: 11 }).reason, 'too-many-households', '69-8a 一甲不许超十户');
eq(D.enroll({ ward: '东三甲', head: '甲长周', households: 10 }).ok, true, '69-8b 编甲');
const ac = D.accuse({ ward: '东三甲', accuser: '甲长周', accused: '吴九', what: '夜聚喧闹' });
eq(ac.liability, 1, '69-8c 同甲出事甲长记连坐');
eq(D.mediate({ ward: '东三甲', a: '吴九', b: '郑十', matter: '占道', award: 'penalty' }).reason,
  'out-of-scope', '69-8d 乡约不许判刑');
eq(D.mediate({ ward: '东三甲', a: '吴九', b: '郑十', matter: '占道', award: 'apology' }).ok, true, '69-8e 赔礼了结');
eq(D.openGranary({ stock: 5, amount: 10, reason: '盐仓火灾' }).reason, 'insufficient-stock', '69-8f 仓不足放不出');
eq(D.openGranary({ stock: 40, amount: 30, reason: '盐仓火灾' }).ok, true, '69-8g 开仓放赈');

// ── 71-9 巫觋占卜与拆字 ────────────────────────────────────────────────
const G = WA.divinationCraft;
const c1 = G.cast({ diviner: '瞎半仙', kind: 'bu', question: '盐价何时落' });
ok(c1.ok === true && c1.hexagram >= 1 && c1.hexagram <= 64, '69-9a 起卦落在 1～64');
eq(G.cast({ diviner: '瞎半仙', kind: 'monk', question: 'x' }).reason, 'unknown-kind', '69-9b 术业不明拒收');
eq(G.confirm({ id: c1.id }).reason, 'missing-verdict', '69-9c 应验与否必须给确定答案');
eq(G.confirm({ id: c1.id, fulfilled: false }).ok, true, '69-9d 未验也留痕');
eq(G.confirm({ id: c1.id, fulfilled: true }).reason, 'already-confirmed', '69-9e 事后不许改口');
eq(G.spread({ id: c1.id, distortion: '半仙说盐价必涨', by: '茶馆' }).ok, true, '69-9f 哄传留痕');

// ── 71-10 九台一条链：钱货夜火 ─────────────────────────────────────────
const chain = (function () {
  const f = WA.saltFranchise, b = WA.brokerHouse, s = WA.silverAssay, p = WA.pawnRedemption;
  f.reset(); b.reset(); s.reset(); p.reset();
  WA.fireWatch.reset(); WA.festivalFair.reset(); WA.wardCompact.reset(); WA.divinationCraft.reset();
  f.grant({ merchant: '盐商赵', district: '淮北', quota: 50 });
  f.drawSalt({ merchant: '盐商赵', district: '淮北', amount: 50 });
  b.enlist({ broker: '王牙人', district: '淮北' });
  const d = b.match({ broker: '王牙人', district: '淮北', buyer: '盐商赵', seller: '船家', goods: '盐', price: 200 });
  b.commission(d.id, { ratePct: 3 });
  s.assay({ amount: 200, purityPct: 80 });
  s.addMeltLoss({ amount: 200, fromPurityPct: 80, toPurityPct: 100 });
  const t = p.pledge({ pawner: '盐商赵', item: '盐引', appraisal: 200, principal: 150, monthlyRatePct: 4, termMonths: 4 });
  WA.nightWatch.reset();
  WA.nightWatch.beat({ watchman: '赵六', watch: 3, night: '八月' });
  WA.nightWatch.report({ watchman: '赵六', kind: 'suspicious', place: '盐仓' });
  const fir = WA.fireWatch.ignite({ place: '盐仓', material: 'thatch', wind: 'breeze' });
  WA.festivalFair.openStall({ owner: '扎纸张', goods: '纸灯', fair: 'lantern', lanterns: 9 });
  WA.wardCompact.enroll({ ward: '东三甲', head: '甲长周', households: 10 });
  WA.wardCompact.accuse({ ward: '东三甲', accuser: '甲长周', accused: '吴九', what: '纵火' });
  WA.wardCompact.openGranary({ stock: 50, amount: 20, reason: '走水' });
  const cast = WA.divinationCraft.cast({ diviner: '瞎半仙', kind: 'wu', question: '火起于何人' });
  WA.divinationCraft.spread({ id: cast.id, distortion: '火起于贪', by: '街口' });
  return { ticket: t.id, fire: fir.id,
    fees: b.stat().feeTotal, melt: s.stat().meltLossTotal,
    joined: WA.wardCompact.stat().accusations, vows: WA.divinationCraft.stat().spreads };
})();
ok(chain.ticket === 'pt1' && chain.fire === 'fw1', '69-10a 链上票号与火号各自独立计数');
eq(chain.fees, 6, '69-10b 牙佣 3% of 200 = 6');
eq(chain.melt, 3.2, '69-10c 倾煎火耗 200×0.8×2% = 3.2');
eq(chain.joined, 1, '69-10d 连坐一笔');
eq(chain.vows, 1, '69-10e 哄传一笔');

// ── 71-11 三条真源码负控制（拆掉门禁 ⇒ 非法动作当场放行）──────────────
//  ① 当票：未到期不许绝当
function tryForfeitEarly(w) {
  w.pawnRedemption.reset();
  const t = w.pawnRedemption.pledge({ pawner: 'a', item: 'b', appraisal: 10, principal: 5, monthlyRatePct: 1, termMonths: 3 });
  return w.pawnRedemption.forfeit(t.id, { months: 2, buyer: 'c', salePrice: 9 });
}
eq(tryForfeitEarly(WA).ok, false, '负控制①正样本：期限未满时绝当真被拒');
const pawnSrc = rdSrc('engines/pawn-redemption.js');
const brokenPawn = dropLine(pawnSrc, 'if (months <= rec.termMonths) return refuse');
assert.notStrictEqual(brokenPawn, pawnSrc, '负控制①命中真实门禁行（不是空转）');
const wPawn = sync.fresh({ srcOverride: { 'engines/pawn-redemption.js': brokenPawn } }).WA;
ok(tryForfeitEarly(wPawn).ok === true, '负控制①：拆掉期限门禁后「没过期也能绝当」当场放行');

//  ② 盐引：无见证不查获
function trySeizeNoWitness(w) {
  w.saltFranchise.reset();
  return w.saltFranchise.seize({ merchant: '某人', amount: 5 });
}
eq(trySeizeNoWitness(WA).ok, false, '负控制②正样本：无见证查缉真被拒');
const saltSrc = rdSrc('engines/salt-franchise.js');
const brokenSalt = dropLine(saltSrc, 'if (!witness) return refuse');
assert.notStrictEqual(brokenSalt, saltSrc, '负控制②命中真实门禁行');
const wSalt = sync.fresh({ srcOverride: { 'engines/salt-franchise.js': brokenSalt } }).WA;
ok(trySeizeNoWitness(wSalt).ok === true, '负控制②：拆掉见证门禁后「凭空没入」当场放行');

//  ③ 占卜：应验不许改口
function tryRecast(w) {
  w.divinationCraft.reset();
  const c = w.divinationCraft.cast({ diviner: 'x', kind: 'wu', question: 'y' });
  w.divinationCraft.confirm({ id: c.id, fulfilled: true });
  return w.divinationCraft.confirm({ id: c.id, fulfilled: false });
}
eq(tryRecast(WA).ok, false, '负控制③正样本：二次改口真被拒');
const divSrc = rdSrc('engines/divination-craft.js');
const brokenDiv = dropLine(divSrc, 'if (rec.confirm) return refuse');
assert.notStrictEqual(brokenDiv, divSrc, '负控制③命中真实门禁行');
const wDiv = sync.fresh({ srcOverride: { 'engines/divination-craft.js': brokenDiv } }).WA;
ok(tryRecast(wDiv).ok === true, '负控制③：拆掉改口门禁后「算错就改口」当场放行');

sync.fresh();
console.log('  · 三条负控制均以真源码破坏驱动，干净现场正样本同步核对');
console.log('=== 场景 71 贯通专锁全绿：' + passed + ' 项断言 ===');
process.exit(0);