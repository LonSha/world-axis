// WorldAxis tests/s3-u3-v2196.js — U2 批次③（agency + investigation）统一原子提交链专锁
//
// 命题（每条都答得出「哪里不对、期待什么」）：
//   A. agency（行动反馈闭环）—— 本批治的三条真病，全部**探针实测**（不是阅读推断）：
//      A1 `schedule` 读不到当前步：`plan.current` 的扁平回执只带 `seq`，而本模块读 `planRow.step`
//         ⇒ `step` 恒 undefined ⇒ 恒 `no-step`。「行动反馈闭环」这台机器 100% 空转，
//         且没有任何一行读数报错（这正是本仓点名的「功能级失效」）。
//      A2 `processReceipts` 找不到行动行：`act` 的结算回执把行动 id 写在 **`id`** 上，
//         本模块读 `r.actId`（那个字段从来不存在）⇒ 恒 `no-act-row`。
//      A3 回执**永不消化**：`pending` 的唯一去重判据 `!r._agencyProcessed` 是**只读**字段，
//         全库没有任何地方写它 ⇒ 同一条回执每轮都被当成新的再消化一次（标记恒 null）。
//      A4 消化与结算**不同生共死**：两笔分属独立事务，结算成了而消化标记没写上 ⇒ 重复消化。
//   B. investigation（线索调查）—— reveal 的**三写半写**（探针实测）：
//      `enigma.mark`（知情名单）+ `intel.addIntel`（认知行）+ 本模块「线索记 revealed」是三笔顶层事务。
//      B1 让第三笔失败 ⇒ enigma 已写进世界、线索仍 investigating，回执却照样 `ok:true`。
//      B2 现在：三笔同链一次提交，链撤不回的那两笔**排在后面**（先落地自己的写、后跨模块写）。
//      B3 链上写入必须如实标未提交（`chain:true / persisted:false / projected:true`）。
//      B4 链内后一步看不到本链新实体 —— 这条硬边界在本批被**治好了一半**：
//         本模块自己的查找口改为「在链里就查链的那一份 draft」（此前恒 `not-found`）。
//   C. 硬边界与如实登记（口径不许比事实更乐观）：
//      C1 **调用方自己的事务里**调本模块写口 ⇒ 如实标 `nested:true / persisted:false`。
//         链面看不见这一面（`commit.active()` 只在链自己的 fn 里非空），判据取自
//         `store.transact` 的嵌套回执 `deferred:true`。
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
 * 开一个**干净场景**。
 *   为什么不是直接 `sync.fresh()`：`store` 按聊天隔离存档（`worldaxis_state_<chatId>`），
 *   而 mock 的 chatId 恒为 `test_chat_001` ⇒ 同一个进程里连开几个「场景」，它们其实
 *   共用同一份累积世界（探针实测：上一场景的写入出现在下一场景的 `store.get()` 里，
 *   前一段的线索把后一段的 `checkEvidence`/`reveal` 全带偏）。
 *   故本锁**按场景换 chatId + 清本场景的键**，让每个场景真的是新世界。
 */
function fresh() {
  __seq++;
  const cid = 'u3_lock_' + __seq;
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
function planRow(WA) { return ((state(WA).plan || {}).plans || [])[0] || null; }
function resRows(WA) { return ((state(WA).acts || {}).res) || []; }

/** 备料：把一个「目标 + 计划 + 已完成行动回执」的世界摆好。 */
function scene(WA) {
  ['act', 'plan', 'life', 'agency'].forEach(function (m) { if (WA[m] && WA[m].setSettings) rc(WA[m].setSettings({ enabled: true })); });
  const g = rc(WA.life.addGoal('匠人', { text: '造桥', status: 'active' }));
  const gid = (g && (g.id || g.goalId)) || '';
  const ex = rc(WA.plan.expand('匠人', gid, [{ text: '备料', kind: 'work' }, { text: '架梁', kind: 'work' }]));
  return { gid: gid, planId: ex && ex.id };
}
/** 造一笔「已结算」的行动回执（不经 agency，直调 act）。 */
function receipt(WA, gid, kind) {
  const ad = rc(WA.act.add('匠人', { kind: kind || 'work', goalId: gid, duration: 1000 }));
  if (!ad || ad.ok !== true) return { ok: false, why: 'add' };
  const am = rc(WA.act.admit(ad.id, 0, {}));
  if (!am || am.ok !== true) return { ok: false, why: 'admit' };
  const av = rc(WA.act.advance(100000));
  return { ok: true, actId: ad.id, advance: av };
}
function clueOf(WA) { return ((state(WA).investigation || {}).clues || [])[0] || {}; }
function rowsOf(WA) { return ((state(WA).enigma || {}).rows) || []; }

// ── A 段：agency 三条真病 ──
const WA1 = fresh();
const S1 = scene(WA1);
a(!!S1.planId, 'A0 备料：目标 + 计划（两步）已建（planId=' + S1.planId + '）');

// A1：schedule 能真的建出行动（此前恒 no-step）
const sc1 = rc(WA1.agency.schedule('匠人', Date.now()));
a(sc1 && sc1.ok === true && !!sc1.actId,
  'A1 **schedule 真能建出行动**（此前读 `planRow.step` 恒 undefined ⇒ 恒 no-step：' + J(sc1 && sc1.reason) + '）');
a(sc1 && sc1.admitted === true && sc1.stepSeq === 0, 'A1b 行动被准入、认的是第 0 步');
a(!WA1.__agencyStepShapeWarn, 'A1c 形状自证位未被点亮（读口认的是现行形状：plan.view 的逐步状态）');

// A2：processReceipts 找得到行动行（此前恒 no-act-row）
const WA2 = fresh();
const S2 = scene(WA2);
const R2 = receipt(WA2, S2.gid);
a(R2.ok === true && R2.advance && R2.advance.ok === true, 'A2a 备料：直调 act 造一笔已结算回执');
a(resRows(WA2).length === 1 && resRows(WA2)[0].id === R2.actId,
  'A2b 回执里行动 id 写在 **`id`** 上（`act.receipt()` 的形状：' + J(Object.keys(resRows(WA2)[0] || {})) + '）');
const pr1 = rc(WA2.agency.processReceipts(200000));
a(pr1 && pr1.processed === 1,
  'A2 **processReceipts 真消化了回执**（此前读 `r.actId` 恒 undefined ⇒ 恒 no-act-row；实得 ' + J(pr1) + '）');
a(planRow(WA2) && planRow(WA2).steps[0].status !== 'pending',
  'A2c 计划第 0 步真被结算（实得 ' + J(planRow(WA2) && planRow(WA2).steps.map(function (s) { return s.status; })) + '）');

// A3：消化标记真被写上（此前恒 null）
a(resRows(WA2)[0] && resRows(WA2)[0]._agencyProcessed === true,
  'A3 **消化标记真被写上**（`_agencyProcessed:true`；此前全库没有任何地方写它 ⇒ 恒 null，同一条回执每轮重复消化）');

// A4：同一回执不再重复消化
const pr2 = rc(WA2.agency.processReceipts(300000));
const pr3 = rc(WA2.agency.processReceipts(400000));
a(pr2 && pr2.processed === 0 && pr2.deferred.length === 0 && pr3 && pr3.deferred.length === 0,
  'A4 **同一回执不再重复消化**（第 2/3 次：processed=0 且 deferred 空；实得 ' + J(pr2.deferred) + ' / ' + J(pr3.deferred) + '）');

// A5：消化与结算**同生共死**（链级马甲：让 plan.settle 失败 ⇒ 消化标记也不许落）
const WA3 = fresh();
const S3 = scene(WA3);
const R3 = receipt(WA3, S3.gid);
const realSettle = WA3.plan.settle;
WA3.plan.settle = function () { return { ok: false, reason: 'simulated-settle-fail' }; };
const prFail = rc(WA3.agency.processReceipts(200000));
WA3.plan.settle = realSettle;
a(prFail && prFail.processed === 0 && prFail.deferred.length === 1,
  'A5a 结算失败 ⇒ 该回执进 deferred（不假装消化了）');
a(resRows(WA3)[0] && resRows(WA3)[0]._agencyProcessed !== true,
  'A5 **半写被治好**：结算失败时消化标记**也没落**（此前两笔独立事务 ⇒ 「标记写了、步没结算」或反之；两者同生共死）');
a(planRow(WA3) && planRow(WA3).steps[0].status === 'pending',
  'A5b 计划步一格未动（整链中止，世界没被改）');

// A6：链外顶层形状不变（对照面）
a(sc1 && sc1.chain === undefined && sc1.persisted === undefined,
  'A6 链外顶层 `schedule` 形状**逐字未变**（无 chain / 无 persisted —— 既有消费者按原样读）');

// ── B 段：investigation 的三写半写 ──
const SUBJ = '桥墩质量';
function clueScene() {
  const W = fresh();
  ['investigation', 'enigma', 'intel'].forEach(function (m) { if (W[m] && W[m].setSettings) rc(W[m].setSettings({ enabled: true })); });
  rc(W.enigma.setSettings({ enabled: true, maxRows: 40 }));
  W.store.transact(function (d) { d.worldFacts = [{ key: SUBJ, value: '合格', at: 1 }]; }, 'u3:truth');
  const reg = rc(W.investigation.register({ title: '桥墩', subject: SUBJ, sourceType: 'witness' }));
  return { WA: W, reg: reg };
}
const CS4 = clueScene();
const WA4 = CS4.WA, reg4 = CS4.reg;
a(reg4 && reg4.ok === true, 'B0 备料：线索已登记');
a(reg4 && reg4.chain === undefined && reg4.persisted === undefined,
  'B0b 链外顶层 `register` 形状逐字未变（对照面）');
rc(WA4.investigation.investigate(reg4.id, '甲', { receiptId: 'R1', content: '合格' }));
const chk4 = rc(WA4.investigation.checkEvidence(reg4.id));
a(chk4 && chk4.verdict === 'verified', 'B0c 证据达标（verdict=verified）');

// B1：reveal 半写复现的**反例面** —— 让 enigma 收不下（rows-full）⇒ 整链中止 ⇒ 线索不许被 resolved
WA4.store.transact(function (d) {
  d.enigma = { rows: [{ key: '占位1', knowers: [], at: 0 }, { key: '占位2', knowers: [], at: 0 },
    { key: '占位3', knowers: [], at: 0 }, { key: '占位4', knowers: [], at: 0 }] };
}, 'u3:fill-enigma');
rc(WA4.enigma.setSettings({ maxRows: 4 }));     // 收窄到下限，上面那 4 行正好把容量占满
const rvFail = rc(WA4.investigation.reveal(reg4.id, '乙'));
const clue4 = clueOf(WA4);
a(rvFail && rvFail.ok === false,
  'B1 **知情扩展失败 ⇒ 揭示不成立**（此前第三笔失败也照样 ok:true；实得 ' + J(rvFail) + '）');
a(clue4.status === 'investigating' && (clue4.revealedTo || []).length === 0,
  'B1b **半写被治好**：线索状态一格未动（status=' + clue4.status + ' / revealedTo=' + J(clue4.revealedTo) + '）'
  + ' —— 次序纪律的硬证据：先落地自己的写、后跨模块写，「自己的写」随整链一起回滚');
a(rowsOf(WA4).length === 4,
  'B1c enigma 也没有留下半截行（整链中止，两份写入同归零）');

// B2：reveal 成功路径
const CS5 = clueScene();
const WA5 = CS5.WA, reg5 = CS5.reg;
rc(WA5.investigation.investigate(reg5.id, '甲', { receiptId: 'R9', content: '合格' }));
const rv5 = rc(WA5.investigation.reveal(reg5.id, '丙'));
a(rv5 && rv5.ok === true && rv5.atomic === true && rv5.chain === false && rv5.persisted === true,
  'B2 reveal 成功：链外顶层 ⇒ 本口开链、整链一次提交（atomic:true / chain:false —— 本笔不是链内在途写入；实得 ' + J(rv5) + '）');
a(rv5 && (rv5.steps || 0) >= 2 && !!rv5.opId, 'B2b 回执带链的记账（steps=' + (rv5 && rv5.steps) + '）');
a(rv5 && rv5.verdict === 'verified', 'B2c reveal 回执带达标结论');
const clue5 = clueOf(WA5);
a(clue5.status === 'resolved' && (clue5.revealedTo || []).indexOf('丙') >= 0, 'B2d 线索真被记成 resolved');

// B3：already-revealed 的二次调用给出凭据（此前只有一句 reason）
const rv5b = rc(WA5.investigation.reveal(reg5.id, '丙'));
a(rv5b && rv5b.ok === false && rv5b.reason === 'already-revealed'
  && rv5b.verdict === 'verified' && rv5b.resolvedAt > 0,
  'B3 **二次调用答得出凭据**（verdict + resolvedAt；此前只说「揭示过了」等于没说；实得 ' + J(rv5b) + '）');

// B4：duplicate-receipt 给出可寻址的已落地证据 id
const dupR = rc(WA5.investigation.investigate(reg5.id, '丁', { receiptId: 'R9', content: '合格' }));
a(dupR && dupR.ok === false && (dupR.reason === 'duplicate-receipt' || dupR.reason === 'already-resolved')
  && (dupR.reason !== 'duplicate-receipt' || (!!dupR.evidenceId && !!dupR.clueId)),
  'B4 **重复回执指得出已落地那一条**（evidenceId=' + (dupR && dupR.evidenceId) + '；此前调用方手里那个 id 根本不存在）');

// B5：链上写入如实标未提交，且链内后一步能看见本链新实体（本批治好的那一半）
let bReg = null, bInv = null;
const WA5c = fresh();
['investigation', 'enigma', 'intel'].forEach(function (m) { if (WA5c[m] && WA5c[m].setSettings) rc(WA5c[m].setSettings({ enabled: true })); });
WA5c.store.transact(function (d) { d.worldFacts = [{ key: SUBJ, value: '合格', at: 1 }]; }, 'u3:truth5c');
const chB5 = WA5c.commit.chain({
  opId: 'u3-b5', site: 'u3:b5',
  fn: function (c, draft) {
    bReg = rc(WA5c.investigation.register({ title: '链上线索', subject: SUBJ, sourceType: 'witness' }));
    if (!bReg || bReg.ok !== true) return false;
    bInv = rc(WA5c.investigation.investigate(bReg.id, '甲', { receiptId: 'CHAIN-R', content: '合格' }));
    if (!bInv || bInv.ok !== true) return false;
    WA5c.commit.step(null, { site: 'investigation:register' });
    WA5c.commit.step(null, { site: 'investigation:investigate' });
    return true;
  }
});
a(chB5.ok === true, 'B5a 链上 register + investigate 业务上成立（此前链内后一步恒 not-found —— 看不到本链写进 draft 的实体）');
a(bReg && bReg.chain === true && bReg.persisted === false && bReg.projected === true,
  'B5 **链上写入如实标未提交**（chain:true / persisted:false / projected:true；实得 ' + J(bReg) + '）');
a(bInv && bInv.chain === true && bInv.persisted === false && bInv.projected === true,
  'B5b investigate 同样如实标（实得 ' + J(bInv) + '）');

// B5c：锚点面 —— 链外（顶层）同样的两步组合仍然成立（本批没把顶层路径改坏）
const WA5d = fresh();
['investigation', 'enigma', 'intel'].forEach(function (m) { if (WA5d[m] && WA5d[m].setSettings) rc(WA5d[m].setSettings({ enabled: true })); });
WA5d.store.transact(function (d) { d.worldFacts = [{ key: SUBJ, value: '合格', at: 1 }]; }, 'u3:truth5d');
const regT = rc(WA5d.investigation.register({ title: '顶层线索', subject: SUBJ, sourceType: 'witness' }));
const invT = rc(WA5d.investigation.investigate(regT.id, '甲', { receiptId: 'TOP-R', content: '合格' }));
a(invT && invT.ok === true && invT.chain === undefined,
  'B5c 链外顶层 register+investigate 照旧（形状逐字未变；实得 ' + J(invT) + '）');

// B6：链上写入被保存点撤回 ⇒ 不许读成成功
const WA6 = fresh();
['investigation'].forEach(function (m) { if (WA6[m] && WA6[m].setSettings) rc(WA6[m].setSettings({ enabled: true })); });
let bW = null;
const chB6 = WA6.commit.chain({
  opId: 'u3-b6', site: 'u3:b6',
  fn: function (c, draft) {
    c.steps.push({ site: 'u3:b6:step1', at: 0 });
    // 把线索桶整个抹掉 ⇒ 本模块的写入落在保存点上被撤回
    (draft.investigation = {}).clues = [];
    bW = rc(WA6.investigation.investigate('查无此线索', '甲', { receiptId: 'X', content: '' }));
    if (bW && bW.ok === false) return false;
    return true;
  }
});
a(!!bW && bW.ok === false, 'B6 链上写口在草稿里找不到目标 ⇒ 如实失败（不许说「已采集」）');
a(chB6.ok === false, 'B6b 链因此中止（real reason=' + chB6.reason + '）');

// ── C 段：硬边界与如实登记 ──
// C1：**调用方自己的事务里** ⇒ 如实标 nested:true / persisted:false
const WA7 = fresh();
['investigation', 'enigma', 'intel'].forEach(function (m) { if (WA7[m] && WA7[m].setSettings) rc(WA7[m].setSettings({ enabled: true })); });
WA7.store.transact(function (d) { d.worldFacts = [{ key: SUBJ, value: '合格', at: 1 }]; }, 'u3:truth3');
let innerReg = null, innerInv = null, innerRv = null;
// 先**链外**把一条线索做到达标（提交）—— 好让嵌套面验的是「如实标注」，
//   而不是撞上「调用方那层 draft 拿不到」这条硬边界（见 C1c）。
const regC = rc(WA7.investigation.register({ title: '嵌套基准线索', subject: SUBJ, sourceType: 'witness' }));
rc(WA7.investigation.investigate(regC.id, '甲', { receiptId: 'PRE', content: '合格' }));
WA7.store.transact(function () {
  innerReg = rc(WA7.investigation.register({ title: '嵌套线索', subject: SUBJ, sourceType: 'witness' }));
  innerRv = rc(WA7.investigation.reveal(regC.id, '乙'));            // 对**已提交且达标**的线索
  innerInv = rc(WA7.investigation.investigate(innerReg && innerReg.id, '甲', { receiptId: 'NR', content: '合格' }));
}, 'u3:nested');
a(innerReg && innerReg.ok === true && innerReg.nested === true && innerReg.persisted === false && innerReg.chain === false,
  'C1 **调用方自己的事务里 ⇒ 如实标**（nested:true / persisted:false / chain:false；'
  + '此前这一面漏标：链面看不见它，而 store 的嵌套回执明明答得出 deferred:true；实得 ' + J(innerReg) + '）');
a(innerRv && innerRv.ok === true && innerRv.nested === true && innerRv.persisted === false && innerRv.chain === false,
  'C1b **硬边界如实登记**：`reveal` 嵌在调用方事务里 ⇒ 链级原子性**明确不承诺**（它开的链拿不到最外层），'
  + '但写在那**同一层**上、随调用方提交，故按嵌套分支的同一口径答 ok:true / nested:true / persisted:false；'
  + '两种真况（已成/被保存点撤回）**分开报**，不许混成一句「世界一格不动」。实得 ' + J(innerRv));
const clueC = ((state(WA7).investigation || {}).clues || []).filter(function (x) { return x.id === regC.id; })[0] || {};
a(clueC.status === 'resolved' && (clueC.revealedTo || []).indexOf('乙') >= 0,
  'C1c **那一层的写入随调用方提交**（不是「谎报成功」）：外层事务提交后基准线索确已 resolved'
  + '（status=' + clueC.status + ' / revealedTo=' + J(clueC.revealedTo) + '）');
a(innerReg && innerReg.chain !== true && innerReg.projected === undefined,
  'C1d 嵌套面**不谎称**是本模块的链（chain 不为 true、无 projected —— 那是「在链上」才有的两个字段）');

// C2：诊断面与错误码在册
const dg7 = rc(WA7.investigation.diagnose());
a(dg7 && dg7.version === '2.194.0', 'C2a diagnose 版本随模块升版（实得 ' + (dg7 && dg7.version) + '）');
a(dg7 && dg7.checks && dg7.checks.noesis === true,
  'C2b **如实登记**：`noesis` 出现在 declare 面（checks）里 —— 该引擎自报「知情边界」为闭环一环；'
  + '是否真有消费由 noesis 侧的证据决定，这里只登记它的自报');
const agSt = rc(WA1.agency.stat());
a(agSt && typeof agSt.scheduled === 'number', 'C2c agency 统计面可读（scheduled=' + (agSt && agSt.scheduled) + '）');

let bad = 0;
results.forEach(function (r) { if (!r.ok) bad++; console.log((r.ok ? '  ok  ' : '  FAIL') + ' — ' + r.label); });
console.log('s3-u3-v2196: ' + (results.length - bad) + '/' + results.length + ' 通过');
module.exports = {
  results: results, failed: bad, total: results.length,
  // v2.194.0（U2 批次④ 补登）：真挂载（逐条转发注入的断言）。
  //   此前为 `runAll: function () { return { failed: bad, total: results.length }; }` ——
  //   不接参数、不转发，只回计数 ⇒ 挂上去也是假绿（锁红而回归绿）。同族的
  //   `s3-u2-v2194` / `s3-u2-v2195` / `s3-u3-v2196` 一并按此形态修正。
  runAll: function (a) {
    results.forEach(function (r) { a(r.ok, r.label); });
    return { failed: bad, total: results.length };
  }
};
if (require.main === module) process.exitCode = bad ? 1 : 0;
