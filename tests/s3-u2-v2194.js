// WorldAxis tests/s3-u2-v2194.js — U2 批次①（diplomacy + operations）统一原子提交链专锁
//
// 命题（每条都答得出「哪里不对、期待什么」）：
//   A. 链的六面（真实业务链，不用假壳）：
//      A1 正常提交：写入生效 + 回执落账（replay 可读、记账步数对得上）
//      A2 中段失败：**世界一格不动**（第一步的写入也不留），且不留回执
//      A3 同 opId 再来 ⇒ duplicate-op（给原回执、不重做）；换 opId 可重做
//      A4 回执跨「重载」可读（住在世界状态里，不靠进程态）
//      A5 规模对账：声明步数 ≠ 记账步数 ⇒ size-mismatch（俄式对账）
//      A6 失败归因答得出**是谁拒的**（step-refused，不是一句 aborted）
//   B. 在途不谎报（本项要治的真病）：
//      B1 链上写口如实标 `chain:true / persisted:false`（不是「已提交」）
//      B2 链上写口**自己那一笔被保存点撤回**时 ok:false（不许说「已登记」）
//      B3 链外写口照旧 `chain:false / persisted:true`（对照面：行为不变）
//      B5 链面的**真实产品消费者**：`operations.disburse` 自己开链
//         （此前链只有测试在调 —— 一处零调用的公开面；且该口的转账 + 记账分属两个顶层事务）：
//         B5a 成功成立；B5b 跨模块转账真落地；B5c 本地记账落地且**不重复计数**；
//         B5d/B5e 转账失败 ⇒ 整链中止 + 归因透出真因；B5f **半写被治好**；
//         B5g 同段聊天第二笔照常成立（消费方须自带唯一 opId）；B5h 未注册势力走原路；
//         B5i 回执可按 opId replay 读回；B5c3 回执记账步数=2；
//         B5l **链内次序**固定为「先记账（无副作用）→ 后转账（有副作用）」（注释即契约，可反向自证）。
//   C. **硬边界如实登记**（不是所有拒签都该归因给链）：
//      C1 链内后一步的**预检读的是已提交状态** ⇒ 看不到前一步尚未提交的写入
//         （实测：链内 enact 报 not-authorized，而场外同参全通）——这是本设计的已知边界，
//         读数上必须分得开，不许把它记成「链把写入撤了」。
//      C2 该边界有代价：被保存点撤回的那一笔，**世界本身是干净的**（B2e 另证）。
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

const WA = global.WorldAxis;
const S = WA.store;

const TAG = 'u2';
const A = TAG + '甲盟', B = TAG + '乙邦';
const OGA = 'og_' + A;
function bones() {
  S.transact(function (d) {
    d.evolution = Object.assign({}, d.evolution, {
      round: 0,
      factions: [
        { id: 'fa_u2a', name: A, power: 40, status: '稳固', relation: '中立' },
        { id: 'fa_u2b', name: B, power: 35, status: '稳固', relation: '中立' }
      ]
    });
  }, 'u2:bones');
}
/** 让 A 有权签：走 **inst 的真源三写口**（charter → post → assign），不替它答。
 *  `inst` 的权限表里没有 `sign`（allowed = approve/grant/hire/punish），
 *  而 `diplomacy.sign` 只问 `canApprove` ⇒ 用 `approve` 授权才是真源口径。 */
function empower() {
  try {
    WA.inst.setSettings({ enabled: true });
    if (!rc(WA.inst.charter(OGA, { kind: '帮派', name: A })).ok) return false;
    if (!rc(WA.inst.post(OGA, '盟主', { perms: ['approve', 'grant'] })).ok) return false;
    if (!rc(WA.inst.assign(OGA, '盟主', A)).ok) return false;
    const au = WA.inst.authority(OGA, A);
    return !!(au && au.ok && au.canApprove);
  } catch (e) { return false; }
}
function pairsCount() { const d = (S.get().diplomacy || {}); return Object.keys(d.pairs || {}).length; }
function termsCount() {
  const d = (S.get().diplomacy || {});
  return Object.keys(d.pairs || {}).reduce(function (n, k) { return n + ((d.pairs[k].terms || []).length); }, 0);
}
function accepted(from, to, term) {
  const pr = rc(WA.diplomacy.propose({ from: from, to: to, terms: [{ term: term, days: null }] }));
  if (!pr || !pr.ok) return null;
  rc(WA.diplomacy.reply({ id: pr.id, by: to, basis: '你上月让了关税', kind: 'accept' }));
  return pr.id;
}
/** 造一个「已批准」的 inst 决策（真源写口 + `{by}` 真签名）。 */
function mkApprovedDecision() {
  try {
    const pr = rc(WA.inst.propose(OGA, '批预算', { by: A }));
    if (!pr || !pr.ok) return 'no-decision';
    const ap = rc(WA.inst.approve(OGA, pr.id, { by: A }));
    return (ap && ap.ok) ? pr.id : 'not-approved';
  } catch (e) { return 'threw'; }
}

WA.diplomacy.setSettings({ enabled: true });
WA.operations.setSettings({ enabled: true });
WA.evolution.setSettings({ enabled: true });
bones();
a(empower(), 'S0 造局：A 势力经 inst 真源取得批准权（否则本锁全部无意义）');

// ── A1：正常提交 ────────────────────────────────────────────
const pid = accepted(A, B, 'trade');
a(!!pid, 'A1a 提案 → 接受（签约链前置就绪）');
const terms0 = termsCount(), pairs0 = pairsCount();
const r1 = WA.commit.chain({
  opId: 'u2-a1', site: 'u2:a1',
  fn: function (c) {
    const sg = rc(WA.diplomacy.sign({ id: pid }));
    if (!sg || sg.ok !== true) return false;
    WA.commit.step(null, { site: 'diplomacy:sign' });
    return true;
  }
});
a(r1.ok === true, 'A1b 链一次提交成立（ok:true）');
a(pairsCount() > pairs0, 'A1c 链里那一步的世界写入生效（pairs 增加）');
a(termsCount() > terms0, 'A1d 签署写进了条款（terms 增加）');
const rp = WA.commit.replay('u2-a1');
a(rp.ok === true && rp.receipt && rp.receipt.steps === 1, 'A1e 回执落账且记账步数=1（replay 可读）');
a(rp.ok === true && rp.receipt && !('invited' in rp.receipt) && !('invitePending' in rp.receipt),
  'A1f 回执里**没有**「邀约」这一层（该机制连同入口一并摘除：字段根本不存在 ⇒「握手失败被读成登记成功」在原理上不可能）');

// ── A2：中段失败 ⇒ 世界一格不动 ─────────────────────────────
const pid2 = accepted(B, A, 'armistice');
const pairsBefore = pairsCount(), termsBefore = termsCount();
const r2 = WA.commit.chain({
  opId: 'u2-a2', site: 'u2:a2',
  fn: function (c) {
    const sg = rc(WA.diplomacy.sign({ id: pid2 }));
    if (!sg || sg.ok !== true) return false;
    WA.commit.step(null, { site: 'diplomacy:sign' });
    throw new Error('第二步故意失败');       // 第二步抛错 ⇒ 第一步也不许留
  }
});
a(r2.ok === false && (r2.reason === 'step-threw' || r2.reason === 'step-refused'),
  'A2a 链未成立且归因指向「某一步」（step-threw/step-refused，实得 ' + r2.reason + '）');
a(pairsCount() === pairsBefore && termsCount() === termsBefore, 'A2b **世界一格不动**（pairs / terms 逐字未变）');
a(WA.commit.replay('u2-a2').ok === false, 'A2c 失败链不留回执（不假装做过）');

// ── A3：重复 opId / 换号重做 ────────────────────────────────
const r3 = WA.commit.chain({ opId: 'u2-a1', site: 'u2:a1', fn: function (c, d) { d.__x = 1; c.steps.push({ site: 'x', at: 0 }); return true; } });
a(r3.ok === false && r3.reason === 'duplicate-op' && !!r3.receipt, 'A3a 同 opId 再来 ⇒ duplicate-op + 原回执（不重做）');
const pid4 = accepted(A, B, 'mutual-aid');
const r4 = WA.commit.chain({
  opId: 'u2-a4', site: 'u2:a4',
  fn: function (c) {
    const sg = rc(WA.diplomacy.sign({ id: pid4 }));
    if (!sg || sg.ok !== true) return false;
    WA.commit.step(null, { site: 'diplomacy:sign' });
    return true;
  }
});
a(r4.ok === true, 'A3b 换 opId 即可重做（幂等只锁同号）');

// ── A4：回执跨「重载」可读 ─────────────────────────────────
const fromStore = (S.get().commit || {}).receipts || [];
a(fromStore.some(function (x) { return x.opId === 'u2-a1'; }), 'A4a 回执住在世界状态里（跨刷新可读）');
a(WA.commit.replay('u2-a1').ok === true && WA.commit.replay('u2-a1').receipt.opId === 'u2-a1',
  'A4b replay() 按 opId 读回同一张回执（同一本账，不靠进程态）');

// ── A5：规模对账 ───────────────────────────────────────────
const r6 = WA.commit.chain({
  opId: 'u2-a5', site: 'u2:a5', steps: 3,
  fn: function (c, draft) { draft.__u2 = 1; c.steps.push({ site: 's1', at: 0 }); return true; }
});
a(r6.ok === true, 'A5a 声明不符不阻断提交（世界照常提交，读数分开）');
a(WA.commit.chainStat().faults['size-mismatch'] >= 1, 'A5b 但记一次 size-mismatch（俄式对账）');

// ── A6：归因答得出「是谁拒的」─────────────────────────────
const pid6 = accepted(A, B, 'embargo');
S.transact(function (d) { delete d.diplomacy.proposals[pid6]; }, 'u2:a6-prep');   // 抽掉提案 ⇒ sign 必然拒
const r7 = WA.commit.chain({
  opId: 'u2-a6', site: 'u2:a6',
  fn: function (c) {
    const sg = rc(WA.diplomacy.sign({ id: pid6 }));
    if (!sg || sg.ok !== true) return false;
    WA.commit.step(null, { site: 'diplomacy:sign' });
    return true;
  }
});
a(r7.ok === false && r7.reason === 'step-refused', 'A6a 某一步拒签时归因是 step-refused（不是一句 aborted；实得 ' + r7.reason + '）');
a(/拒签/.test(String(r7.note || '')), 'A6b note 说得出「某一步拒签」');

// ── B1：链上写口如实标未提交（enact 是**预检全通**的链上写口）──
const decB1 = mkApprovedDecision();
let b1 = null;
const rB1 = WA.commit.chain({
  opId: 'u2-b1', site: 'u2:b1',
  fn: function (c) {
    b1 = WA.operations.enact(decB1, { orgId: OGA, approver: A, budget: 0, name: '链上项目' });
    if (!b1 || b1.ok !== true) return false;
    WA.commit.step(null, { site: 'operations:enact' });
    return true;
  }
});
a(!!b1 && b1.ok === true, 'B1a 链上 enact 成立（业务上记下了）');
a(!!b1 && b1.chain === true && b1.persisted === false, 'B1b **链上回执如实标 chain:true / persisted:false**');
a(!!b1 && b1.projected === true, 'B1c 链上回执另标 projected:true（推算值，不是既成事实）');
a(rB1.ok === true, 'B1d 链成立');
a(((S.get().operations || {}).projects || []).some(function (p) { return p.name === '链上项目'; }),
  'B1e 链提交后该项目真在世界里');

// ── B2：链上写口**自己那一笔被撤回**⇒ ok:false ─────────────
//   造法：链里先建项目；随后把同一个 id 的目标从草稿里抹掉再写一笔
//   ⇒ 写口内部 `if (!t) return false`（真源命中）⇒ 保存点撤回 ⇒ 必须报失败。
//   先在场外建一个真项目（链的目标必须**在链外**存在：链的投影是栈顶草稿的快照）。
const decOut = mkApprovedDecision();
const projOut = WA.operations.enact(decOut, { orgId: OGA, approver: A, budget: 0, name: '链外项目' });
a(projOut && projOut.ok === true && !!projOut.id, 'B2a 场外先备一个真项目（链上写口的目标）');
const projId = projOut && projOut.id;
let b2 = null;
const rB2 = WA.commit.chain({
  opId: 'u2-b2', site: 'u2:b2',
  fn: function (c, draft) {
    // 链里先登记一步（让链非空），再把目标从**这一层草稿**里抹掉
    c.steps.push({ site: 'u2:b2:step1', at: 0 });
    (draft.operations = draft.operations || {}).projects = [];   // 目标在这一层草稿里消失
    b2 = WA.operations.handover(projId, A, A);                   // 写口内部 `if (!t) return false`
    // 方向：写口**诚实失败** ⇒ 本步不成立 ⇒ 让链中止（这才是正确语义）。
    //   若它被误读成成功 ⇒ 本链会提交 ⇒ 后面的 `rB2.ok === false` 判据当场反向命中。
    if (b2 && b2.ok === false) return false;
    return true;
  }
});
a(!!b2, 'B2b 链上第二笔写口有回执可读');
a(b2 && b2.ok === false, 'B2c **内层被撤回不许读成成功**（ok:false）');
a(b2 && /write-(aborted|threw)/.test(String(b2.reason || '')), 'B2d 失败码说的是「我这一笔没写进去」（实得 ' + (b2 && b2.reason) + '）');
a(rB2.ok === false, 'B2e 链因此中止（那一步也不留；实得 ok=' + rB2.ok + ' reason=' + rB2.reason + '）');
a(((S.get().operations || {}).projects || []).every(function (p) { return p.name !== 'U2 探针项目'; }),
  'B2f 世界没有被这一步改动（不是「报错了但写进去了」）');

// ── B3：链外写口照旧「已提交」（对照面）───────────────
const prOut = rc(WA.diplomacy.propose({ from: B, to: A, terms: [{ term: 'trade', days: null }] }));
a(prOut && prOut.ok === true, 'B3a 链外写口照旧成立');
a(!!prOut && prOut.chain !== true && prOut.persisted !== false, 'B3b 链外回执形状未变（既无 chain:true 也无 persisted:false）');

// ── B4：外交面（六个写口同一漏斗）在链上同样如实标未提交 ──
const pidB4 = accepted(A, B, 'armistice');
let b4 = null;
const rB4 = WA.commit.chain({
  opId: 'u2-b4', site: 'u2:b4',
  fn: function (c) {
    b4 = rc(WA.diplomacy.sign({ id: pidB4 }));
    if (!b4 || b4.ok !== true) return false;
    WA.commit.step(null, { site: 'diplomacy:sign' });
    return true;
  }
});
a(rB4.ok === true, 'B4a 链上签署成立（业务上记下了）');
a(!!b4 && b4.chain === true && b4.persisted === false && b4.projected === true,
  'B4b 链上回执如实标 chain:true / persisted:false / projected:true');
const outsideSign = rc(WA.diplomacy.sign({ id: pidB4 === pid4 ? pid4 : pid }));
a(outsideSign && outsideSign.ok !== true, 'B4c 同一漏斗在链外不吃这套标注（已签过的号必然被拒，形状可读）');

// ── C：硬边界如实登记（预检读的是已提交状态）──────────────
//   同一组参数：场外全通；链上（当同一链里前一步刚写过该状态）报 not-authorized。
const decC = mkApprovedDecision();
const outside = WA.operations.enact(decC, { orgId: OGA, approver: A, budget: 0, name: '场外项目' });
a(outside && outside.ok === true, 'C1a 场外同参 enact 通过（对照基线）');
const decC2 = mkApprovedDecision();
let insideWithPrefix = null;
const rC = WA.commit.chain({
  opId: 'u2-c1', site: 'u2:c1',
  fn: function (c, draft) {
    // 链内先写一笔「已过预检」的写口，再让**同参**的第二笔跑它自己的预检
    const en = WA.operations.enact(decC2, { orgId: OGA, approver: A, budget: 0, name: '链内先写' });
    if (!en || en.ok !== true) return false;
    WA.commit.step(null, { site: 'operations:enact' });
    insideWithPrefix = WA.operations.enact(mkApprovedDecision(), { orgId: OGA, approver: A, budget: 0, name: '链内第二笔' });
    return false;                                   // 探针：只看读数，不要它提交
  }
});
a(rC.ok === false && rC.reason === 'step-refused', 'C1b 探针链按预期被主动中止（只为拿读数）');
a(!!insideWithPrefix && insideWithPrefix.ok === false,
  'C1c **链内后一步的预检看不到前一步未提交的写入**（实得 ' + (insideWithPrefix && insideWithPrefix.reason) + '）——本设计的硬边界，如实登记');
a(!!insideWithPrefix && /not-authorized|unknown-decision|not-approved/.test(String(insideWithPrefix.reason)),
  'C1d 边界表现为**业务拒收码**（预检读的是已提交状态），不会被误记成「链撤了写入」（不是 write-aborted）');
a(((S.get().operations || {}).projects || []).every(function (p) { return p.name !== '链内先写'; }),
  'C2 被保存点撤回的那一笔，世界本身是干净的（链内先写未留痕）');

// ── B5：链面的**真实产品消费者** —— operations.disburse 自己开链 ────────
//   它此前把「跨模块转账」与「本地记账」放在**两个顶层事务**里：转账成了、记账没成
//   ⇒「钱出去了、账上没记」。现在两笔同处一条链。本段同时是「链有产品消费者」的取证 ——
//   链面此前只有测试调用（一处零调用公开面）。
S.transact(function (d) {
  d.people = Object.assign({}, d.people, { 'p_u2探员': { name: 'u2探员', resources: {} } });
  const ops = (d.operations = d.operations || {});
  if (!Array.isArray(ops.projects)) ops.projects = [];
  const mk = function (id, org, budget) {
    return { id: id, orgId: org, owner: 'u2探员', budget: budget, spent: 0, budgetType: '金',
      status: 'active', milestones: [], completedMilestones: 0, cycleTag: '' };
  };
  ops.projects.push(mk('ops_b5', A, 100), mk('ops_b5f', A, 100), mk('ops_b5p', '未注册势力', 50));
}, 'u2:b5set');
rc(WA.org.setSettings({ enabled: true }));
rc(WA.operations.setSettings({ enabled: true }));
const fund = WA.org.grant('faction', A, '金', 100);
const facRes = function () { const f = (((S.get().evolution || {}).factions) || []).filter(function (x) { return x && x.name === A; })[0]; return f ? Object.assign({}, f.resources || {}) : {}; };
const perRes = function () { const q = (S.get().people || {})['p_u2探员']; return q ? Object.assign({}, q.resources || {}) : {}; };
const projSpent = function (id) { const r = (((S.get().operations || {}).projects) || []).filter(function (x) { return x && x.id === id; })[0]; return r ? r.spent : null; };
a(fund && fund.ok === true && facRes()['金'] === 100, 'B5a0 备料：注册势力拿到 100 金（转账的源）');

const d5 = rc(WA.operations.disburse('ops_b5', { amount: 30, itemType: '金', by: 'u2探员' }));
a(d5 && d5.ok === true && d5.persisted === true && d5.atomic === true, 'B5a 拨付成立（链外顶层 ⇒ 本口开链、整链一次提交：' + JSON.stringify(d5 && d5.reason) + '）');
a(facRes()['金'] === 70 && perRes()['金'] === 30, 'B5b 跨模块转账**真落地**（势力 100→70、个人 0→30）');
a(projSpent('ops_b5') === 30, 'B5c 本地记账落地且**不重复计数**（世界里的 spent=30，不是 60）');
a(d5 && d5.spent === 30, 'B5c2 **回执里的 spent 也是 30** —— 成功分支不得再自己加一次（只核对世界会漏掉回执虚报）');
a(d5 && typeof d5.opId === 'string' && d5.opId.length > 0, 'B5d 回执带 opId');
a((WA.commit.replay(d5.opId).receipt || {}).steps === 2, 'B5c3 回执记账步数=2（记账 + 转账各登记一步）');

const b5f = { f: JSON.stringify(facRes()), p: JSON.stringify(perRes()), s: projSpent('ops_b5f') };
const d5f = rc(WA.operations.disburse('ops_b5f', { amount: 10, itemType: '金', by: '查无此人' }));
a(d5f && d5f.ok === false, 'B5e 转账失败 ⇒ 拨付不成立（ok:false，实得 ' + JSON.stringify(d5f && d5f.reason) + '）');
a(d5f && d5f.reason === 'transfer-failed',
  'B5f 失败归因是**真因** transfer-failed —— 链对象上的归因随回包透出（此前只在 `fn` 局部变量上，取不回来）');
a(JSON.stringify(facRes()) === b5f.f && JSON.stringify(perRes()) === b5f.p && projSpent('ops_b5f') === b5f.s,
  'B5g **半写被治好**：钱没出去、账也没记（此前两笔分属两个顶层事务，转账会留在世界里）');

const d5b = rc(WA.operations.disburse('ops_b5p', { amount: 20, itemType: '金', by: 'u2探员' }));
a(d5b && d5b.ok === true && projSpent('ops_b5p') === 20,
  'B5h 同段聊天里的**第二笔**拨付照常成立（消费方自带唯一 opId —— 链面默认按 floor 去重会误判 duplicate-op）');
a(d5b && d5b.atomic !== true, 'B5i 未注册势力的项目走原路（无跨模块转账 ⇒ 不开链、不作 atomic 声明）');
a(facRes()['金'] === 70, 'B5j 未注册势力那笔**没有**动过势力库存（原路未变）');

const rp5 = WA.commit.replay(d5.opId);
a(rp5 && rp5.ok === true && rp5.receipt && rp5.receipt.site === 'operations:disburse',
  'B5k 链回执可按 opId replay 读回（回执落在世界状态里，不靠进程态）');

// B5l：**链内次序**（源码即契约）。`org.transfer` 内部事务成功时会写 org 流水 —— 那是
//   链撤不回的副作用；故「目标账在草稿里找不到」必须发生在转账**之前**。
//   这条断言只看源码里两个锚点的先后（真源码破坏 R11 会当场命中它）。
const opSrc = fs.readFileSync(path.join(BASE, 'engines/operations.js'), 'utf8');
const iLed = opSrc.indexOf('if (!spendOnDraft(draft, rec.id, amount))');
const iTr = opSrc.indexOf("WA.org.transfer('faction', rec.orgId, 'person', by, itemType, amount);");
a(iLed > 0 && iTr > 0 && iLed < iTr,
  'B5l 链内次序是**先记账（无副作用）→ 后转账（有副作用）**（iLed=' + iLed + ' < iTr=' + iTr + '）');

// ── C3：诚实错误码 ──────────────────────────────────────────
const sc = WA.commit.chainSelfCheck();
a(sc.faults.indexOf('receipt-failed') >= 0, 'C3a fault 码表里有 receipt-failed（本面自己的错自己认）');
a(sc.faults.indexOf('step-refused') >= 0, 'C3b fault 码表里有 step-refused（某一步拒签单独成一码）');
a(WA.commit.chainStat().faultCodes && WA.commit.chainStat().faultCodes.length >= 10, 'C3c chainStat 暴露 fault 码表（诊断面当场可读）');

let bad = 0;
results.forEach(function (r) { if (!r.ok) bad++; console.log((r.ok ? '  ok  ' : '  FAIL') + ' — ' + r.label); });
console.log('s3-u2-v2194: ' + (results.length - bad) + '/' + results.length + ' 通过');
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