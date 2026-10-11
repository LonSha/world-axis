// WorldAxis tests/s3-u4-v2197.js — U2 批次④（aftermath + story-choice）统一原子提交链专锁
//
// 命题（每条都答得出「哪里不对、期待什么」）：
//   A. aftermath（地点后果）—— 三条真病，全部**探针实测**（`/tmp/probe_u4a.js`，不是阅读推断）：
//      A1 链内读面看不见本链新实体：`find` / `findByEvent` 取的是**已提交快照**（`store.get()`），
//         而 `register` 写在外层 draft 上 ⇒ 链内 `view` 恒 `not-found`。
//         〖实测〗链内 register 后立刻 view ⇒ `{ok:false, reason:'not-found'}`。
//      A2 同一链内重复 `eventId` **去重失效**：判据读同一份过期快照 ⇒ 两条同类效果都落世界
//         （`total: 2`），而「同一事件效果只生效一次」是本模块的边界 4。
//      A3 链上写入**不报在途**：回执只有 `ok:true`，看不出「这一笔还没提交」——
//         与 U2 批次①–③（diplomacy / operations / freight / commission / agency / investigation）
//         口径不同；调用方事务里同样的漏标。
//   B. story-choice（故事分支）—— 两条真病：
//      B1 链内 `review` 找不到本链刚登记的选择点（读口恒 not-found）。
//      B2 链级半写：`present` 的树记账（`branchTree.fork`）与点落库、`confirm` 的兑现与回写
//         分属独立事务 ⇒ 「点存在、树上无节点」这类互斥事实可被留下。
//   C. 硬边界与如实登记（口径不许比事实更乐观）：
//      C1 调用方自己的事务里 ⇒ 如实标 `nested:true / persisted:false`（无 chain / projected）。
//      C2 「修好即通路」—— 本批治的真半写（探针实测）：`repair` 报 `{status:'repaired'}` 而
//         `region` 的 `lane.blocked` 仍为 true ⇒ 同一笔内收尾，回执带 `laneCleared`，
//         统计面 `bridgeMiss` 恒 0。
//         〖说明〗本批一度照抄批次③加过 `WA.__aftermathWarn` / `WA.__storyChoiceWarn` 自证位
//         （写口找不到行时点亮），但专锁首跑即实测**点亮条件不可达**（读口 `find` 与写口
//         `rowForWrite` 同层同源：find 通过 ⇒ rowForWrite 必通过）⇒ 按本仓「不留看起来会被
//         用的出口」口径**已删除**那两个槽与其点亮分支，本段改为验真实可达的桥接收尾。
//      C3 诊断面如实自报链能力（`checks.chain`）与版本。
//      C4 导出面逐字未变（本批零新增导出）。
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
const J = function (x) { try { return JSON.stringify(x); } catch (e) { return String(x); } };
const ST = global.SillyTavern;
let __seq = 0;
/**
 * 开一个**干净场景**（与 U2 批次③同口径：`store` 按聊天隔离存档
 * `worldaxis_state_<chatId>`，而 mock 的 chatId 恒为 `test_chat_001` ⇒
 * 直接 `sync.fresh()` 连开几个场景其实共用一份累积世界）。
 */
function fresh() {
  __seq++;
  const cid = 'u4_lock_' + __seq;
  ST.getContext().chatId = cid;
  const WA = vm.runInContext('window.WorldAxis', ctx);
  try { WA.mainWin.localStorage.removeItem('worldaxis_state_' + cid); } catch (e) {}
  for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
  const W = global.WorldAxis;
  try { W.store.init(); } catch (e) {}
  try { W.__chatId = cid; } catch (e) {}
  return W;
}
function state(WA) { return WA.store.get() || {}; }
function effectsOf(WA) { return ((state(WA).aftermath || {}).effects) || []; }
function pointsOf(WA) { return ((state(WA).storyChoice || {}).points) || []; }
function laneOf(WA, name) { return (WA.region.places() || []).filter(function (p) { return p.name === name; })[0] || null; }
function bootPlace(WA, name) {
  rc(WA.region.setSettings({ enabled: true }));
  return rc(WA.region.register(name, { distanceDays: 3, lane: 'road' }));
}

// ══ A 段：aftermath 三条真病 ══
const WA1 = fresh();
a(rc(WA1.aftermath.getSettings()).enabled === false, 'A0a aftermath 默认关（边界 1 逐字未变）');
rc(WA1.aftermath.setSettings({ enabled: true }));
a(rc(WA1.aftermath.getSettings()).enabled === true, 'A0b 备料：本场景已开启');
const P1 = bootPlace(WA1, '断桥镇');
a(P1 && P1.ok === true, 'A0c 备料：region 地点已登记（' + J(P1 && P1.name) + '）');

// A1：链内读面看得见本链新实体
let a1reg = null, a1view = null, a1dupe = null;
const chA1 = WA1.commit.chain({
  opId: 'u4-a1', site: 'u4:a1',
  fn: function (c, draft) {
    a1reg = rc(WA1.aftermath.register({ placeId: '断桥镇', eventId: 'ev_1', effectType: 'road-damage', duration: 10, repairTime: 2 }));
    WA1.commit.step(null, { site: 'aftermath:register' });
    a1view = rc(WA1.aftermath.view(a1reg && a1reg.id));
    WA1.commit.step(null, { site: 'aftermath:view' });
    // A2：同一链内重复 eventId ⇒ 必须被去重拒收
    a1dupe = rc(WA1.aftermath.register({ placeId: '断桥镇', eventId: 'ev_1', effectType: 'road-damage' }));
    WA1.commit.step(null, { site: 'aftermath:register2' });
    return { steps: 3 };
  }
});
a(chA1.ok === true, 'A1a 链上 register + view + 重复登记 业务上成立（链结果 ' + J(chA1.reason) + '）');
a(a1reg && a1reg.chain === true && a1reg.persisted === false && a1reg.projected === true,
  'A1b **链上写入如实标未提交**（chain:true / persisted:false / projected:true；实得 ' + J(a1reg) + '）');
a(a1view && a1view.ok === true && a1view.id === (a1reg && a1reg.id),
  'A1c **链内后一步看得见本链新实体**（此前读的是已提交快照 ⇒ 恒 not-found；实得 ' + J(a1view && a1view.reason) + '）');
a(a1view && a1view.status === 'active' && a1view.repairTime === 2,
  'A1d 读到的是本链那一份的真实字段（status=' + (a1view && a1view.status) + ' / repairTime=' + (a1view && a1view.repairTime) + '）');
a(a1dupe && a1dupe.ok === false && a1dupe.reason === 'duplicate-event',
  'A2 **同一链内重复 eventId 被去重拒收**（此前判据读过期快照 ⇒ 两条同类效果都落世界；实得 ' + J(a1dupe) + '）');
a(effectsOf(WA1).length === 1,
  'A2b 链提交后世界只有 **1** 条效果（此前实测 2 条 —— 「同一事件效果只生效一次」被破坏；实得 ' + effectsOf(WA1).length + '）');

// A3：链外顶层形状逐字未变
const WA1b = fresh();
rc(WA1b.aftermath.setSettings({ enabled: true }));
bootPlace(WA1b, '断桥镇');
const top1 = rc(WA1b.aftermath.register({ placeId: '断桥镇', eventId: 'ev_top', effectType: 'road-damage' }));
a(top1 && top1.ok === true && top1.chain === false && top1.persisted === true && top1.projected === undefined,
  'A3 链外顶层**照旧**（chain:false / persisted:true / 无 projected；实得 ' + J(top1) + '）');
const topView = rc(WA1b.aftermath.view(top1.id));
a(topView && topView.ok === true, 'A3b 顶层 view 读已提交面照旧');
const topDup = rc(WA1b.aftermath.register({ placeId: '断桥镇', eventId: 'ev_top' }));
a(topDup && topDup.ok === false && topDup.reason === 'duplicate-event',
  'A3c 顶层重复 eventId 仍然拒收（本批没把顶层判据改坏）');

// A4：调用方事务里 ⇒ 如实标 nested
const WA1c = fresh();
rc(WA1c.aftermath.setSettings({ enabled: true }));
bootPlace(WA1c, '断桥镇');
let nestReg = null, nestRep = null;
const nBase = rc(WA1c.aftermath.register({ placeId: '断桥镇', eventId: 'ev_n0', effectType: 'road-damage', repairTime: 5 }));
WA1c.store.transact(function () {
  nestReg = rc(WA1c.aftermath.register({ placeId: '断桥镇', eventId: 'ev_n1', effectType: 'trade-stop' }));
  nestRep = rc(WA1c.aftermath.repair(nBase.id, { progress: 1 }));
}, 'u4:nested');
a(nestReg && nestReg.ok === true && nestReg.nested === true && nestReg.persisted === false && nestReg.chain === false,
  'A4 **调用方自己的事务里 ⇒ 如实标**（nested:true / persisted:false / chain:false；'
  + '此前这一面漏标 —— 链面看不见它，而 store 的嵌套回执明明答得出 deferred:true；实得 ' + J(nestReg) + '）');
a(nestRep && nestRep.ok === true && nestRep.nested === true && nestRep.persisted === false,
  'A4b repair 同样如实标（实得 ' + J(nestRep) + '）');
a(nestRep && nestRep.projected === undefined, 'A4c 嵌套面**不谎称**是本模块的链（无 projected）');
const nestRow = effectsOf(WA1c).filter(function (x) { return x.id === (nBase && nBase.id); })[0] || {};
a(nestRow.repairProgress === 1, 'A4d **那一层的写入随调用方提交**（外层提交后 progress=1；实得 ' + nestRow.repairProgress + '）');

// A5：链上写口在草稿里找不到目标 ⇒ 如实失败 + 点亮自证位
const WA1d = fresh();
rc(WA1d.aftermath.setSettings({ enabled: true }));
bootPlace(WA1d, '断桥镇');
let bW = null;
const chA5 = WA1d.commit.chain({
  opId: 'u4-a5', site: 'u4:a5',
  fn: function (c, draft) {
    WA1d.commit.step(null, { site: 'u4:a5:step1' });
    (draft.aftermath = {}).effects = [];      // 把效果桶整个抹掉 ⇒ 目标行找不到
    bW = rc(WA1d.aftermath.cancel('查无此效果', '测试'));
    if (bW && bW.ok === false) return false;
    return true;
  }
});
a(!!bW && bW.ok === false, 'A5 链上写口在草稿里找不到目标 ⇒ 如实失败（不许说「已取消」）');
a(bW && bW.reason === 'not-found', 'A5b 拒收码是 `not-found`（实得 ' + J(bW && bW.reason) + '）');
a(chA5.ok === false, 'A5c 链因此中止（reason=' + chA5.reason + '）');

// ══ B 段：story-choice ══
const WA2 = fresh();
['storyChoice', 'branchTree', 'rehearsal', 'commit'].forEach(function (m) {
  if (WA2[m] && WA2[m].setSettings) rc(WA2[m].setSettings({ enabled: true }));
});
const pr2 = rc(WA2.storyChoice.present({ round: 1, prompt: '要不要过桥？', options: [{ label: '过桥' }, { label: '绕路' }] }));
a(pr2 && pr2.ok === true && !!pr2.id, 'B0a 备料：全局选择点已登记');
a(pr2 && pr2.chain === false && pr2.persisted === true,
  'B0b 链外顶层**照旧**（chain:false / persisted:true；实得 ' + J(pr2) + '）');
a((rc(WA2.branchTree.tree()).nodes || []).length === 1, 'B0c 备料：树上 1 个节点（与点落库同生）');

// B1：链内 present + review 看得见本链新实体
let b1pr = null, b1rv = null;
const chB1 = WA2.commit.chain({
  opId: 'u4-b1', site: 'u4:b1',
  fn: function (c, draft) {
    b1pr = rc(WA2.storyChoice.present({ round: 2, prompt: '链内分叉？', options: [{ label: 'A' }, { label: 'B' }] }));
    WA2.commit.step(null, { site: 'storyChoice:present' });
    b1rv = rc(WA2.storyChoice.review(b1pr && b1pr.id));
    WA2.commit.step(null, { site: 'storyChoice:review' });
    return { steps: 2 };
  }
});
a(chB1.ok === true, 'B1a 链上 present + review 业务上成立（链结果 ' + J(chB1.reason) + '）');
a(b1pr && b1pr.chain === true && b1pr.persisted === false && b1pr.projected === true,
  'B1 **链上写入如实标未提交**（chain:true / persisted:false / projected:true；实得 ' + J(b1pr) + '）');
a(b1rv && b1rv.ok === true && b1rv.id === (b1pr && b1pr.id),
  'B1b **链内 review 看得见本链新实体**（此前读已提交快照 ⇒ 恒 not-found；实得 ' + J(b1rv && b1rv.reason) + '）');
a(b1rv && b1rv.prompt === '链内分叉？', 'B1c 读到的是本链那一份的真实字段（prompt=' + (b1rv && b1rv.prompt) + '）');

// B2：链级半写 —— 链中止后树与点都不留痕
const WA2b = fresh();
['storyChoice', 'branchTree', 'rehearsal', 'commit'].forEach(function (m) {
  if (WA2b[m] && WA2b[m].setSettings) rc(WA2b[m].setSettings({ enabled: true }));
});
const nodesBefore = (rc(WA2b.branchTree.tree()).nodes || []).length;
let b2pr = null;
const chB2 = WA2b.commit.chain({
  opId: 'u4-b2', site: 'u4:b2',
  fn: function (c, draft) {
    b2pr = rc(WA2b.storyChoice.present({ round: 9, prompt: '会被撤回的分叉？', options: [{ label: 'X' }, { label: 'Y' }] }));
    WA2b.commit.step(null, { site: 'storyChoice:present' });
    return false;   // 主动中止 ⇒ 本模块写进 draft 的那一笔随链一起丢
  }
});
const nodesAfter = (rc(WA2b.branchTree.tree()).nodes || []).length;
a(chB2.ok === false, 'B2 链被主动中止（reason=' + chB2.reason + '）');
a(pointsOf(WA2b).length === 0, 'B2b **链中止 ⇒ 点未落世界**（本模块写进 draft 的那一笔随链一起丢；实得 ' + pointsOf(WA2b).length + '）');
a(nodesAfter === nodesBefore,
  'B2c **链中止 ⇒ 树上也不留痕**（树记账与点落库在本链上同生共死；此前分属独立事务 —— 实得 ' + nodesBefore + ' → ' + nodesAfter + '）');

// B3：confirm 的三笔同链（链内 ⇒ 落在同一层草稿）
const WA2c = fresh();
['storyChoice', 'branchTree', 'rehearsal', 'commit'].forEach(function (m) {
  if (WA2c[m] && WA2c[m].setSettings) rc(WA2c[m].setSettings({ enabled: true }));
});
const pr3 = rc(WA2c.storyChoice.present({ round: 3, prompt: '开门吗？', options: [{ label: '开' }, { label: '不开' }] }));
let cf3 = null;
const chB3 = WA2c.commit.chain({
  opId: 'u4-b3', site: 'u4:b3',
  fn: function (c, draft) {
    cf3 = rc(WA2c.storyChoice.confirm(pr3.id, '开'));
    WA2c.commit.step(null, { site: 'storyChoice:confirm' });
    return { steps: 1 };
  }
});
a(chB3.ok === true, 'B3 链上 confirm 业务上成立');
a(cf3 && cf3.ok === true && cf3.chosen === true && cf3.chain === true && cf3.persisted === false && cf3.projected === true,
  'B3b confirm 在链上如实标未提交（实得 ' + J(cf3) + '）');
a(cf3 && cf3.applied === false && cf3.receipt === '',
  'B3c 三段可分离口径未变（无 ops ⇒ applied=false / receipt=\"\"；实得 applied=' + (cf3 && cf3.applied) + '）');
const rowC = pointsOf(WA2c).filter(function (x) { return x.id === pr3.id; })[0] || {};
a(rowC.choice === '开', 'B3d 链提交后选择已落世界（choice=' + rowC.choice + '）');

// B4：链外顶层 confirm 照旧
const WA2d = fresh();
['storyChoice', 'branchTree', 'rehearsal', 'commit'].forEach(function (m) {
  if (WA2d[m] && WA2d[m].setSettings) rc(WA2d[m].setSettings({ enabled: true }));
});
const pr4 = rc(WA2d.storyChoice.present({ round: 4, prompt: '顶层确认？', options: [{ label: '是' }, { label: '否' }] }));
const cf4 = rc(WA2d.storyChoice.confirm(pr4.id, '是'));
a(cf4 && cf4.ok === true && cf4.chain === false && cf4.persisted === true && cf4.projected === undefined,
  'B4 链外顶层 confirm 照旧（chain:false / persisted:true / 无 projected；实得 ' + J(cf4) + '）');
const cf4b = rc(WA2d.storyChoice.confirm(pr4.id, '否'));
a(cf4b && cf4b.ok === false && cf4b.reason === 'already-confirmed',
  'B4b already-confirmed 拒收口径未变');

// ══ C 段：硬边界与如实登记 ══
// C1：调用方事务里 ⇒ 如实标 nested（story-choice 面）
const WA3 = fresh();
['storyChoice', 'branchTree', 'rehearsal', 'commit'].forEach(function (m) {
  if (WA3[m] && WA3[m].setSettings) rc(WA3[m].setSettings({ enabled: true }));
});
let nPr = null, nCf = null;
const pr5 = rc(WA3.storyChoice.present({ round: 5, prompt: '嵌套基准？', options: [{ label: 'P' }, { label: 'Q' }] }));
WA3.store.transact(function () {
  nPr = rc(WA3.storyChoice.present({ round: 6, prompt: '嵌套分叉？', options: [{ label: 'M' }, { label: 'N' }] }));
  nCf = rc(WA3.storyChoice.confirm(pr5.id, 'P'));
}, 'u4:nested-sc');
a(nPr && nPr.ok === true && nPr.nested === true && nPr.persisted === false && nPr.chain === false,
  'C1 **调用方自己的事务里 ⇒ 如实标**（story-choice 面；nested:true / persisted:false / chain:false；实得 ' + J(nPr) + '）');
a(nPr && nPr.projected === undefined, 'C1b 嵌套面不谎称是本模块的链（无 projected）');
a(nCf && nCf.ok === true && nCf.nested === true && nCf.persisted === false,
  'C1c confirm 嵌套面同样如实标（实得 ' + J(nCf) + '）');
const rowN = pointsOf(WA3).filter(function (x) { return x.id === pr5.id; })[0] || {};
a(rowN.choice === 'P', 'C1d **那一层的写入随调用方提交**（choice=' + rowN.choice + '）');

// C2：**修复闭环的收尾**（本批治的真半写，探针实测）——
//   此前 `repair` 报 `{status:'repaired'}` 而 `region` 的 `lane.blocked` **仍为 true**：
//   「效果已修好」与「这条路仍然不通」两个互斥事实同时挂在世界上。
const WA4 = fresh();
rc(WA4.aftermath.setSettings({ enabled: true }));
bootPlace(WA4, '断桥镇');
const fx = rc(WA4.aftermath.register({ placeId: '断桥镇', eventId: 'ev_fix', effectType: 'road-damage', duration: 100, repairTime: 2 }));
rc(WA4.region.markLane('断桥镇', true));
a(laneOf(WA4, '断桥镇').blocked === true, 'C2a 备料：渠道已受阻（lane.blocked=true）');
const fxRep = rc(WA4.aftermath.repair(fx.id, { progress: 2 }));
a(fxRep && fxRep.ok === true && fxRep.repaired === true, 'C2b repair 报已修好');
a(fxRep && fxRep.laneCleared === true, 'C2c **回执如实报「渠道已解除」**（laneCleared:true；实得 ' + J(fxRep && fxRep.laneCleared) + '）');
a(laneOf(WA4, '断桥镇').blocked === false,
  'C2 **修好即通路（同一层、同一笔）**：世界不再同时挂「已修好」与「路不通」两个互斥事实'
  + '（此前实测 lane.blocked 恒为 true；实得 ' + laneOf(WA4, '断桥镇').blocked + '）');
a(rc(WA4.aftermath.stat()).bridgeMiss === 0,
  'C2d 统计面 `bridgeMiss` 恒为 0（修好而未解除受阻的次数；实得 ' + rc(WA4.aftermath.stat()).bridgeMiss + '）');

// C3：诊断面自报链能力 + 版本
const dgA = rc(WA4.aftermath.diagnose());
const dgS = rc(WA3.storyChoice.diagnose());
a(dgA && dgA.version === '2.194.0', 'C3a aftermath diagnose 版本随模块升版（实得 ' + (dgA && dgA.version) + '）');
a(dgA && dgA.checks && dgA.checks.chain === true,
  'C3b **如实登记**：`chain` 出现在 aftermath 的 checks 里（本口接入统一提交链与否是能力自报，'
  + '与 closedLoop 分开报）');
a(dgA && dgA.closedLoop === true, 'C3c closedLoop 口径未变（观测/修复闭环齐）');
a(dgS && dgS.version === '2.194.0', 'C3d story-choice diagnose 版本随模块升版（实得 ' + (dgS && dgS.version) + '）');
a(dgS && dgS.checks && dgS.checks.chain === true, 'C3e story-choice checks.chain 自报在场');
a(dgS && dgS.checks.branchTree === true && dgS.checks.rehearsal === true && dgS.checks.commit === true,
  'C3f story-choice 原有三面自报未变');

// C4：导出面逐字未变（本批零新增导出）
a(Object.keys(WA4.aftermath).length === 13, 'C4a aftermath 导出面仍 13 项（实得 ' + Object.keys(WA4.aftermath).length + '）');
a(Object.keys(WA3.storyChoice).length === 10, 'C4b story-choice 导出面仍 10 项（实得 ' + Object.keys(WA3.storyChoice).length + '）');

let bad = 0;
results.forEach(function (r) { if (!r.ok) bad++; console.log((r.ok ? '  ok  ' : '  FAIL') + ' — ' + r.label); });
console.log('s3-u4-v2197: ' + (results.length - bad) + '/' + results.length + ' 通过');
module.exports = {
  results: results, failed: bad, total: results.length,
  // v2.194.0（U2 批次④ 补登）：**真挂载**。
  //   此前这里写的是 `runAll: function () { return { failed: bad, total: results.length }; }` ——
  //   run.js 的 `runLock` 注入的是**聚合器自己的 assert**，而那个 runAll 一个参数都不接、
  //   一条断言都不转发，只回一个计数对象（调用方也不读它）。后果是：锁挂上去了、跑起来了，
  //   但**锁红了全量回归照样绿** —— 形式挂载 = 假绿，比孤儿更隐蔽（孤儿至少会被
  //   `tests/orphan-lock-v2750.js` 的 [B] 点名）。
  //   现在逐条转发（标签与锁内自跑逐字同源，不另写一份判据），失败当场进聚合器的 failures。
  runAll: function (a) {
    results.forEach(function (r) { a(r.ok, r.label); });
    return { failed: bad, total: results.length };
  }
};
if (require.main === module) process.exitCode = bad ? 1 : 0;
