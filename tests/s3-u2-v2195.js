// WorldAxis tests/s3-u2-v2195.js — U2 批次②（freight + commission）统一原子提交链专锁
//
// 命题（每条都答得出「哪里不对、期待什么」）：
//   A. commission 的**付费通路**（本批治的真病，探针实测非推断）：
//      A1 有报酬的委托可建立 —— 此前 `canAfford(principal, reward)` 是**参数错位**
//         （把 name 当 kind、把数当 name）⇒ 恒 false ⇒ reward>0 的委托永建不出来
//      A2 有报酬但缺「资源项」⇒ missing-fields（如实拒收，不再静默塌成 no-budget）
//      A3 settle 成功：跨模块转账**真发生**（付方减少、受托方增加）+ 合约记 settled
//      A4 settle 的转账失败 ⇒ **整链中止**：钱没出去、合约状态一格不动、归因 transfer-failed
//         （此前 `org.transfer` 只给 4 个实参 ⇒ 恒 bad-resource，却被读成 `ok !== false`
//          ⇒ 转账从未发生、合约照样记 settled、回执照样报 paid:true）
//      A5 旧委托（无资源项）有报酬 ⇒ missing-fields（不假装付了）
//      A6 cancel 成功：托管退回（托管方 → 委托方）
//      A7 cancel 的退款失败 ⇒ 整链中止（合约不记 cancelled）
//   B. 在途不谎报（本项要治的真病，本批覆盖 freight 四口 + commission 四口）：
//      B1/B2 链上 commission.create / advance ⇒ chain:true / persisted:false
//      B3 链上 freight.dispatch ⇒ chain:true / persisted:false / projected:true
//      B4 链外 freight.dispatch ⇒ 形状逐字未变（对照面）
//      B5 链上 freight.dispatch 被撤回 ⇒ ok:false（不许说「已发运」）
//   C. 硬边界如实登记：
//      C1 链内后一步的**预检读的是已提交状态** ⇒ 看不到本链刚写进 draft 的实体
//      C2 诚实错误码在册（新码走可执行见证，不是一句 aborted）
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const BASE = path.join(__dirname, '..');
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const li = runSrc.indexOf('const LOAD = ['); const lj = runSrc.indexOf('];', li);
const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', li), lj + 1) + ')');
const ctx = vm.createContext(global);
for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });

const results = [];
function a(cond, label) { results.push({ ok: !!cond, label: label }); }
function rc(r) { return (r && r.result && typeof r.result === 'object') ? r.result : r; }
const WA = global.WorldAxis, S = WA.store;
function fac(name) { const f = (((S.get().evolution || {}).factions) || []).filter(function (x) { return x && x.name === name; })[0]; return f ? (f.resources || {}) : {}; }
function per(n) { const q = (S.get().people || {})['p_' + n]; return q ? (q.resources || {}) : {}; }
function ctr(id) { const r = ((S.get().commission || {}).contracts || []).filter(function (x) { return x && x.id === id; })[0]; return r || null; }

const FA = '商行', PA = '工匠', ESC = '掮客';
S.transact(function (d) {
  d.evolution = Object.assign({}, d.evolution, { round: 0, factions: [{ id: 'fa_u2b', name: FA, power: 40, status: '稳固', relation: '中立' }] });
  d.people = Object.assign({}, d.people, {
    ['p_' + PA]: { name: PA, resources: {} },
    ['p_' + ESC]: { name: ESC, resources: {} }
  });
}, 'u2b:bones');
rc(WA.org.setSettings({ enabled: true }));
rc(WA.commission.setSettings({ enabled: true }));
rc(WA.freight.setSettings({ enabled: true }));
WA.org.grant('faction', FA, '金', 200);
WA.org.grant('person', ESC, '金', 200);
a(fac(FA)['金'] === 200 && per(ESC)['金'] === 200, 'A0 备料：商行 200 金 / 掮客 200 金');

// ── A1：有报酬的委托可建立（此前恒 no-budget）──
const cA1 = rc(WA.commission.create({ title: 'A1', principal: FA, principalKind: 'faction', agent: PA, agentKind: 'person',
  reward: 100, item: '金', stages: [{ label: 'S1', reward: 100 }] }));
a(cA1 && cA1.ok === true, 'A1 **有报酬的委托可建立**（此前 canAfford 参数错位 ⇒ 恒 no-budget：' + JSON.stringify(cA1 && cA1.reason) + '）');
a(cA1 && cA1.persisted === true && cA1.chain === false, 'A1b 链外顶层照旧「已提交」（形状不变）');

// ── A2：有报酬但缺资源项 ⇒ missing-fields ──
const cA2 = rc(WA.commission.create({ title: 'A2', principal: FA, principalKind: 'faction', agent: PA, reward: 100,
  stages: [{ label: 'S1' }] }));
a(cA2 && cA2.ok === false && cA2.reason === 'missing-fields' && cA2.field === 'item',
  'A2 有报酬但缺资源项 ⇒ missing-fields（不再静默塌成 no-budget —— 那会让人以为是钱不够）');

// ── A3：settle 成功，转账真发生 ──
rc(WA.commission.advance(cA1.id, 'rcpt_u2b_1'));
const sA3 = rc(WA.commission.settle(cA1.id));
a(sA3 && sA3.ok === true && sA3.paid === true, 'A3 settle 成立');
a(fac(FA)['金'] === 100 && per(PA)['金'] === 100,
  'A3b **跨模块转账真发生**（商行 200→100、工匠 0→100 —— 此前 4 实参调用恒 bad-resource，钱从未动过）');
a((ctr(cA1.id) || {}).status === 'settled', 'A3c 合约记 settled（世界真被写）');
a(sA3 && sA3.atomic === true && sA3.chain === false && sA3.persisted === true,
  'A3d 链外顶层 ⇒ 本口开链、整链一次提交（atomic:true）');
a((WA.commit.replay(sA3.opId).receipt || {}).steps === 2, 'A3e 回执记账步数=2（记账 + 转账各一步）');

// ── A4：转账失败 ⇒ 整链中止、合约不动、归因透出 ──
const cA4 = rc(WA.commission.create({ title: 'A4', principal: FA, principalKind: 'faction', agent: '查无此人', agentKind: 'person',
  reward: 60, item: '金', stages: [{ label: 'S1', reward: 60 }] }));
rc(WA.commission.advance(cA4.id, 'rcpt_u2b_4'));
const bA4 = { f: JSON.stringify(fac(FA)), c: JSON.stringify((ctr(cA4.id) || {}).status) };
const sA4 = rc(WA.commission.settle(cA4.id));
const aA4 = { f: JSON.stringify(fac(FA)), c: JSON.stringify((ctr(cA4.id) || {}).status) };
a(sA4 && sA4.ok === false, 'A4 转账失败 ⇒ 结算不成立（ok:false）');
a(sA4 && sA4.reason === 'transfer-failed',
  'A4b 归因是**真因** transfer-failed（链对象上的归因随回包透出）');
a(bA4.f === aA4.f && bA4.c === aA4.c,
  'A4c **半写被治好**：钱没出去、合约也没被记 settled（此前会记 settled 且报 paid:true）');

// ── A5：旧委托（无资源项）有报酬 ⇒ missing-fields ──
const cA5 = rc(WA.commission.create({ title: 'A5', principal: FA, principalKind: 'faction', agent: PA, reward: 40, item: '金',
  stages: [{ label: 'S1', reward: 40 }] }));
rc(WA.commission.advance(cA5.id, 'rcpt_u2b_5'));
S.transact(function (d) {
  const t = d.commission.contracts.filter(function (x) { return x.id === cA5.id; })[0];
  delete t.item;                          // 模拟旧数据：本模块此前根本不记资源项
}, 'u2b:strip-item');
const sA5 = rc(WA.commission.settle(cA5.id));
a(sA5 && sA5.ok === false && sA5.reason === 'missing-fields',
  'A5 旧委托（无资源项）有报酬 ⇒ missing-fields（**不假装付了** —— 付不出去就该说付不出去）');

// ── A6/A7：cancel 的托管退回 ──
const cA6 = rc(WA.commission.create({ title: 'A6', principal: FA, principalKind: 'faction', agent: PA, reward: 80, item: '金',
  prepaid: 80, escrow: ESC, escrowKind: 'person', stages: [{ label: 'S1', reward: 80 }] }));
const escBefore = per(ESC)['金'] || 0;
const cA6r = rc(WA.commission.cancel(cA6.id, '路线中断'));
a(cA6r && cA6r.ok === true && cA6r.refund === 80, 'A6 cancel 成立且退 80');
a((per(ESC)['金'] || 0) === escBefore - 80,
  'A6b **托管真被退回**（掮客 ' + escBefore + '→' + (per(ESC)['金'] || 0) + '；此前退款调用是 4 实参 + 异常被静默吞掉）');
a((ctr(cA6.id) || {}).status === 'cancelled', 'A6c 合约记 cancelled');
a(cA6r && cA6r.atomic === true && cA6r.chain === false && cA6r.persisted === true,
  'A6d 链外顶层 ⇒ 本口开链、整链一次提交（atomic:true —— 退款与记账同生共死）');
a((WA.commit.replay(cA6r.opId).receipt || {}).steps === 2, 'A6e 回执记账步数=2（记账 + 退款各一步）');

const cA7 = rc(WA.commission.create({ title: 'A7', principal: FA, principalKind: 'faction', agent: PA, reward: 30, item: '金',
  prepaid: 30, escrow: '查无此户', escrowKind: 'faction', stages: [{ label: 'S1', reward: 30 }] }));
const cA7r = rc(WA.commission.cancel(cA7.id, '出不来'));
a(cA7r && cA7r.ok === false && cA7r.reason === 'refund-failed',
  'A7 退款失败 ⇒ 取消不成立且归因 refund-failed（实得 ' + JSON.stringify(cA7r && cA7r.reason) + '）');
a((ctr(cA7.id) || {}).status === 'active', 'A7b 合约状态一格不动（没退成就不许记 cancelled）');

// ── B1/B2：链上 commission 写口如实标未提交 ──
let b1 = null;
const rB1 = WA.commit.chain({
  opId: 'u2b-b1', site: 'u2b:b1',
  fn: function (c, draft) {
    b1 = rc(WA.commission.create({ title: 'B1', principal: FA, principalKind: 'faction', agent: PA,
      stages: [{ label: 'S1', reward: 0 }] }));
    if (!b1 || b1.ok !== true) return false;
    WA.commit.step(null, { site: 'commission:create' });
    return true;
  }
});
a(rB1.ok === true, 'B1a 链上 create 业务上成立');
a(b1 && b1.chain === true && b1.persisted === false && b1.projected === true,
  'B1b **链上回执如实标 chain:true / persisted:false / projected:true**');
a(((S.get().commission || {}).contracts || []).some(function (x) { return x.title === 'B1'; }),
  'B1c 链提交后该合约真在世界里');

//   把 A5 那条合约**重置回可推进状态**（它已被推进到 completed；A5 只取读数不改变事实）
S.transact(function (d) {
  const t = d.commission.contracts.filter(function (x) { return x.id === cA5.id; })[0];
  if (t) { t.status = 'active'; t.currentStage = 0; t.stages[0].status = 'active'; t.stages[0].receiptId = ''; }
}, 'u2b:reset-a5');
let b2 = null;
const rB2 = WA.commit.chain({
  opId: 'u2b-b2', site: 'u2b:b2',
  fn: function (c, draft) {
    b2 = rc(WA.commission.advance(cA5.id, 'rcpt_u2b_chain'));
    if (!b2 || b2.ok !== true) return false;
    WA.commit.step(null, { site: 'commission:advance' });
    return true;
  }
});
a(rB2.ok === true && b2 && b2.chain === true && b2.persisted === false,
  'B2 链上 advance 同样如实标 chain:true / persisted:false（实得 ' + JSON.stringify(b2) + '）');

// ── B3/B4：freight 在途标注 ──
//   造一个源库存与一条开放路线
S.transact(function (d) {
  const ec = (d.economy = d.economy || { goods: [], orders: [], routes: [] });
  if (!Array.isArray(ec.goods)) ec.goods = [];
  if (!Array.isArray(ec.routes)) ec.routes = [];
  ec.goods.push({ place: '甲地', resource: '盐', base: 10, stock: 50, price: 10, demand: 0, consumed: 0, tickedAt: '', at: 0, updatedAt: 0 });
  ec.routes.push({ id: 'rt_u2b', from: '甲地', to: '乙地', lane: '官道', cost: 5, status: 'open', reason: '' });
}, 'u2b:eco');
const dsp = function () { return rc(WA.freight.dispatch('rt_u2b', '甲地', '盐', 10, { transitDays: 2, base: 10 })); };
const out3 = dsp();
a(out3 && out3.ok === true && out3.chain === undefined && out3.persisted === undefined,
  'B4 链外 freight.dispatch 形状**逐字未变**（无 chain / 无 persisted —— 对照面）');
let b3 = null;
const rB3 = WA.commit.chain({
  opId: 'u2b-b3', site: 'u2b:b3',
  fn: function (c, draft) {
    b3 = rc(WA.freight.dispatch('rt_u2b', '甲地', '盐', 10, { transitDays: 2, base: 10 }));
    if (!b3 || b3.ok !== true) return false;
    WA.commit.step(null, { site: 'freight:dispatch' });
    return true;
  }
});
a(rB3.ok === true, 'B3a 链上 dispatch 业务上成立');
a(b3 && b3.chain === true && b3.persisted === false && b3.projected === true,
  'B3 链上 freight.dispatch 如实标 chain:true / persisted:false / projected:true（实得 ' + JSON.stringify(b3) + '）');

// ── B5：链上写口被撤回 ⇒ ok:false ──
//   造法：链里先把 economy 清空（目标从**这一层草稿**里消失）⇒ dispatch 真源分支命中
let b5 = null;
const rB5 = WA.commit.chain({
  opId: 'u2b-b5', site: 'u2b:b5',
  fn: function (c, draft) {
    c.steps.push({ site: 'u2b:b5:step1', at: 0 });
    (draft.economy = draft.economy || {}).goods = [];   // 源库存在这一层草稿里消失
    b5 = rc(WA.freight.dispatch('rt_u2b', '甲地', '盐', 5, { transitDays: 1, base: 10 }));
    if (b5 && b5.ok === false) return false;
    return true;
  }
});
a(!!b5 && b5.ok === false, 'B5a **链上写口在草稿里找不到源库存 ⇒ 如实失败**（不许说「已发运」）');
a(rB5.ok === false, 'B5b 链因此中止（实得 reason=' + rB5.reason + '）');

// ── B6/B7/B8：freight 另外三口（arrive / cancel / reroute）同样如实标在途 ──
//   为什么必须逐口测：反向自证 R22 暴露的假绿 —— B3 只钉了 dispatch 一口，
//   另三口漏标时回执照样说「已成」，而没有一行读数变红（自证当场抓到，遂补）。
const mkShip = function (qty) { return rc(WA.freight.dispatch('rt_u2b', '甲地', '盐', qty, { transitDays: 2, base: 10 })); };
const s6 = mkShip(2), s7 = mkShip(3), s8 = mkShip(4);
a(!!(s6.ok && s7.ok && s8.ok), 'B6a 备料：链外发运三笔（各自已提交）');
let b6 = null, b7 = null, b8 = null;
const rB6 = WA.commit.chain({
  opId: 'u2b-b6', site: 'u2b:b6',
  fn: function (c, draft) {
    b6 = rc(WA.freight.arrive(s6.id, { force: true }));
    if (!b6 || b6.ok !== true) return false;
    WA.commit.step(null, { site: 'freight:arrive' });
    return true;
  }
});
a(rB6.ok === true && b6 && b6.chain === true && b6.persisted === false && b6.projected === true,
  'B6 链上 arrive 如实标 chain:true / persisted:false / projected:true（实得 ' + JSON.stringify(b6) + '）');
const rB7 = WA.commit.chain({
  opId: 'u2b-b7', site: 'u2b:b7',
  fn: function (c, draft) {
    b7 = rc(WA.freight.cancel(s7.id));
    if (!b7 || b7.ok !== true) return false;
    WA.commit.step(null, { site: 'freight:cancel' });
    return true;
  }
});
a(rB7.ok === true && b7 && b7.chain === true && b7.persisted === false && b7.projected === true,
  'B7 链上 cancel 如实标 chain:true / persisted:false / projected:true（实得 ' + JSON.stringify(b7) + '）');
const rB8 = WA.commit.chain({
  opId: 'u2b-b8', site: 'u2b:b8',
  fn: function (c, draft) {
    b8 = rc(WA.freight.reroute(s8.id, 'rt_u2b', { transitDays: 1 }));
    if (!b8 || b8.ok !== true) return false;
    WA.commit.step(null, { site: 'freight:reroute' });
    return true;
  }
});
a(rB8.ok === true && b8 && b8.chain === true && b8.persisted === false && b8.projected === true,
  'B8 链上 reroute 如实标 chain:true / persisted:false / projected:true（实得 ' + JSON.stringify(b8) + '）');

// ── C1：链内后一步的预检读的是已提交状态（硬边界如实登记）──
let c1 = null, madeC1 = null;
const rC1 = WA.commit.chain({
  opId: 'u2b-c1', site: 'u2b:c1',
  fn: function (c, draft) {
    madeC1 = rc(WA.commission.create({ title: 'C1', principal: FA, principalKind: 'faction', agent: PA,
      stages: [{ label: 'S1', reward: 0 }] }));
    if (!madeC1 || madeC1.ok !== true) return false;
    WA.commit.step(null, { site: 'commission:create' });
    try { c1 = rc(WA.commission.settle(madeC1.id)); }   // 同链里立刻结算：它的预检读**已提交状态**
    catch (e) { c1 = { ok: false, reason: 'threw:' + (e && e.message) }; }
    return false;                                 // 探针：只看读数，不要它提交
  }
});
a(rC1.ok === false && rC1.reason === 'step-refused', 'C1a 探针链按预期被主动中止（只为拿读数）');
a(c1 && c1.ok === false && c1.reason === 'not-found',
  'C1b **链内后一步看不到前一步未提交的实体** ⇒ 归因 not-found（实得 ' + JSON.stringify(c1) + '；链内 create 实得 ' + JSON.stringify(madeC1) + '）——本设计的硬边界，如实登记（读的是已提交状态，链内新实体尚未提交）');

// ── C3：次序锚点（先记账 → 后转账：链里**有副作用的那一笔**永远在后）──
//   为什么用源码锚点而不是行为：走查发现两笔次序颠倒时，A 段全部读数仍绿（记账在草稿里，
//   整链中止会把草稿整体丢弃，世界一格不动 —— 读数看不见）。次序本身是可断言的事实，故钉住它。
const srcCm = fs.readFileSync(path.join(BASE, 'engines/commission.js'), 'utf8');
function orderIn(src, first, second) {
  const i = src.indexOf(first), j = src.indexOf(second);
  return i >= 0 && j >= 0 && i < j;
}
a(orderIn(srcCm, 'markSettledOnDraft(draft, rec.id)', 'WA.org.transfer(_pk, rec.principal'),
  'C3a settle 次序：先记账（无副作用）→ 后转账（有副作用）—— 转账失败时世界还没被动过');
a(orderIn(srcCm, 'markCancelledOnDraft(draft, rec.id, rsn)', 'WA.org.transfer(_rk, rec.escrow'),
  'C3b cancel 次序同上');

// ── C2：诚实错误码在册 ──
const cs2 = WA.commit.chainStat();
a((cs2.faultCodes || []).indexOf('step-refused') >= 0, 'C2a fault 码表在册（step-refused 单独成一码）');
a(WA.commit.chainSelfCheck().ok === true, 'C2b 链面自证全真');

let bad = 0;
results.forEach(function (r) { if (!r.ok) bad++; console.log((r.ok ? '  ok  ' : '  FAIL') + ' — ' + r.label); });
console.log('s3-u2-v2195: ' + (results.length - bad) + '/' + results.length + ' 通过');
module.exports = {
  results: results, failed: bad, total: results.length,
  // v2.194.0（U2 批次④ 补登）：**真挂载**（逐条转发注入的断言）。
  //   此前是 `runAll: function () { return { failed: bad, total: results.length }; }` ——
  //   不接参数、不转发，只回一个计数对象（调用方也不读）⇒ 锁红了全量回归照样绿。
  //   run.js 的 `runLock(spec, method)` 注入的是聚合器自己的 assert（v2.75.0 起），
  //   锁体必须把判据交回去；同族四把（v2194/v2195/v2196/v2197）一并按此形态修正。
  runAll: function (a) {
    results.forEach(function (r) { a(r.ok, r.label); });
    return { failed: bad, total: results.length };
  }
};
if (require.main === module) process.exitCode = bad ? 1 : 0;