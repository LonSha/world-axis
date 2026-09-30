#!/usr/bin/env node
// WorldAxis tests/x1-chain-v2127.js —— v2.127.0（拓展计划 X1）：长期意图链
//
// 【它治的病】
//   `life.goals` 的 `next` 是一个**字符串格子**：`life.tick` 走到 `advance` 时把它写死成
//   「推进中」。真正的步骤住在 `plan.steps` 里，于是「这一步之后干什么 / 缺什么前置 /
//   卡在哪」三问里前两问只有 plan 答得出、第三问只有 life 那句字符串在猜 —— 两侧从未摆在一起。
//   R105 ① 的现场原话正是这个：**「长期意图」退化成一句注释**。
//
// 【本版落点】
//   · `plan.chain(person)` 只读读数：把「人物当前计划」与「它挂靠的目标」对成一条可判定的链。
//   · `plan.chainBlock()`  推演侧块：消费者是 `engines/backstage.js` 的 `buildPrompt` user 段。
//     v2.126.0 时该文件对 `plan` **零引用**（实测 grep −c 'plan' = 0）—— 推演引擎拿不到链状态，
//     就会替人物另编一条合理后续（那正是那条病的形状）。
//   · 面板 `#wa-plan-view` 与 `engines/tool-diag.js` 的 secChrono 分别是链读数与编年史读数的读者。
//
// 【两处「答不出」的修正（本版实测挖出来的，不是计划里写的）】
//   ① **running 步曾经不算当前**：第 0 步已 `advance`（running）而后续步都在等它时，
//      `chain.step` 答 `null` —— 而那一刻他明明在做第 0 步。凡「这一步走没走成」的问句
//      都会读到一个空步骤。现改为 `cur || running || stuck`。
//   ② **「缺前置」曾经是取不到值的分支**：原先只对 `at` 自己的 `afterSeq` 判，
//      而 `at` 的三种形态（current / running / blocked）都经过 `advance` 的前置准入 ⇒
//      它们的前置**必然已完成**。现改为对最早的**待办步**判它在等谁（who + 什么状态）。
//
// 【判据结构（与 delete-gate-v2124 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（真读者）· N1–N4 真源码破坏 ⇒ 破坏副本上重跑同款判据
//   N5 纯度：全部负控制跑完后四个真文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PLAN = 'engines/plan.js', BACK = 'engines/backstage.js', PANEL = 'ui/panel.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
// ── 真源码破坏锚点（各须恰中 1 次）───────────────────────────────────
const ANCHORS = {
  at: { rel: PLAN, txt: "const at = cur || running || stuck || null;" },
  todo: { rel: PLAN, txt: "const todo = row.steps.filter(function (s) { return s && s.status === 'pending'; })[0] || null;" },
  goal: { rel: PLAN, txt: "if (!goal) return { ok: false, reason: 'unknown-goal', id: row.id, goalId: clean(row.goalId, 60) };" },
  need: { rel: PLAN, txt: "if (at.need) blockedBy.push({ kind: 'need', detail: at.need.resource + '×' + at.need.amount });" },
  drift: { rel: PLAN, txt: "drift: !!(goalNext && stepText && goalNext !== stepText)," },
  blockState: { rel: PLAN, txt: "return b.kind === 'need' ? '缺 ' + b.detail : '前置第 ' + b.seq + ' 步（' + b.status + '）未完成';" },
  // 消费方锚点：backstage 的挂载点（v2.126.0 时本文件对 plan 零引用）
  backMount: { rel: BACK, txt: "(WA.plan && WA.plan.chainBlock ? WA.plan.chainBlock() : '')," },
  panelRead: { rel: PANEL, txt: "const c = WA.plan.chain(planWho());" }
};
// ── 夹具：甲（active 目标 g1）/ 乙（无目标）；三步**声明式链**（第 2 步挂前置、第 3 步挂第 2 步）──
//   为什么三步之间**都要显式声明前置**：本版修的第一处缺陷（running 步算不算当前）
//   只在「后面的待办步确实在等它」时才现形 —— 若后续步没声明前置，`currentStep` 会把
//   它当成当前步，那个洞就照不出来（判据的前提必须与它要证的事同宽）。
const S3 = [
  { kind: 'work', text: '第一步' },
  { kind: 'work', text: '第二步', after: '0', need: { resource: '银元', amount: 3 } },
  { kind: 'move', text: '第三步', after: '1', fallback: '改走陆路' }
];
const TAG = '__x1_2127_';
function reset(WA) {
  WA.plan.setSettings({ enabled: false, maxSteps: 4, maxPlans: 12, maxTries: 3 });
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 3 }, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '攒钱去乙地', status: 'active', next: '推进中' }], commitments: [], schedule: [] } },
      'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1,
        life: { goals: [], commitments: [], schedule: [] } }
    };
    d.plan = { plans: [] };
  }, TAG + 'reset');
  WA.plan.setSettings({ enabled: true, maxSteps: 4, maxPlans: 12, maxTries: 3 });
  return WA;
}
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2127/x1: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const p = src(PLAN);
  a(p.indexOf('function chain(personName) {') > 0 && p.indexOf('function chainBlock() {') > 0,
    'v2127/x1: [A] 两块都在位（chain 给读数、chainBlock 给推演段）');
  a(p.indexOf('chain: chain, chainBlock: chainBlock,') > 0,
    'v2127/x1: [A] 两块都在导出面上（不在导出面 = 没有承诺）');
  // 只读边界：chain 体内不得出现任何写路径
  const body = p.slice(p.indexOf('function chain(personName) {'), p.indexOf('function chainBlock() {'));
  ['transact', 'clockNow(', 'draft.', 'saveSettings'].forEach(function (bad) {
    a(body.indexOf(bad) < 0, 'v2127/x1: [A] chain 是**只读**的（体内零 `' + bad + '`）');
  });
  a(body.indexOf('WA.evict') < 0 && body.indexOf('transact(') < 0,
    'v2127/x1: [A] chain 不改容量、不写存档（推进只走 advance / settle / rechoose）');
  // 四条否定式边界以注释形态留证（判据读的是**代码面**，注释只作旁证，不入判据）
  const head = p.slice(p.indexOf('X1（v2.127.0）长期意图链'), p.indexOf('function chain(personName) {'));
  ['不建链', '不改状态', '不自动规划', '漂移只报不修'].forEach(function (k) {
    a(head.indexOf(k) > 0, 'v2127/x1: [A] 边界留证 `' + k + '` 在函数头注释里');
  });
  a(p.indexOf('registerModule(\'engines/plan.js\'') > 0,
    'v2127/x1: [A] 模块自注册仍在（本版只加口，不动装载面）');
}
// ── B 面：运行时（原版成绿）──────────────────────────────────────────
function runB(a) {
  const WA = reset(fresh());
  a(WA.plan.expand('甲', 'g1', S3).ok === true, 'v2127/x1: [B] 前置：三步计划展开成功');
  // B1 起点：第 0 步 pending，rest 列出已声明的后续两步
  const c0 = WA.plan.chain('甲');
  a(c0.ok === true && c0.step && c0.step.seq === 0 && c0.step.status === 'pending'
    && c0.total === 3 && c0.done === 0 && c0.rest.length === 2,
    'v2127/x1: [B1] 起点读数：第 0/3 步、后续 2 步（实 ' + JSON.stringify(c0.step) + ' / rest ' + c0.rest.length + '）');
  a(c0.blockedBy.length === 0, 'v2127/x1: [B1] 起点无受阻');
  // B2 **本版修的真缺陷①**：第 0 步开工（running）后 step 必须仍答得出，且是那一步
  WA.plan.advance('甲');
  const c1 = WA.plan.chain('甲');
  a(c1.step !== null && c1.step.seq === 0 && c1.step.text === '第一步',
    'v2127/x1: [B2] 第 0 步 running 时**仍答得出当前步**（修前此处为 null —— 那一刻他明明在做第 0 步；实 '
      + JSON.stringify(c1.step) + '）');
  WA.plan.settle('甲', 'done');
  // B3 第 1 步带资源需求 ⇒ blockedBy 的 need 面
  const c2 = WA.plan.chain('甲');
  a(c2.step && c2.step.seq === 1 && c2.done === 1
    && c2.blockedBy.length === 1 && c2.blockedBy[0].kind === 'need' && c2.blockedBy[0].detail === '银元×3',
    'v2127/x1: [B3] 当前步的资源需求如实报（实 ' + JSON.stringify(c2.blockedBy) + '）');
  // B4 **本版修的真缺陷②**：前置面 —— 第 1 步 running 时，第 2 步在等它，必须报出来
  WA.plan.advance('甲');
  const c3 = WA.plan.chain('甲');
  const aft = c3.blockedBy.filter(function (b) { return b.kind === 'after'; })[0];
  a(!!aft && aft.seq === 1 && aft.status === 'running' && aft.waitingOn === 'running' && aft.forSeq === 2,
    'v2127/x1: [B4] 待办步在等谁被答出来（修前这一段**永远取不到值** —— `at` 自己的前置必然已完成；实 '
      + JSON.stringify(c3.blockedBy) + '）');
  // B5 第二步受阻 ⇒ 前置面报 blocked（与 running 可分辨：两种态通向不同处置）
  WA.plan.settle('甲', 'blocked', { reason: '路断' });
  const c4 = WA.plan.chain('甲');
  const aft2 = c4.blockedBy.filter(function (b) { return b.kind === 'after'; })[0];
  a(c4.status === 'blocked' && aft2 && aft2.waitingOn === 'blocked'
    && c4.note.indexOf('受阻不等于放弃') >= 0,
    'v2127/x1: [B5] 受阻时链读数仍说得清「在等哪一步、那一步什么状态」，且与放弃区分（实 '
      + JSON.stringify(aft2) + '）');
  a(c4.step && c4.step.status === 'blocked', 'v2127/x1: [B5] 受阻步本身就是当前步（step 不落空）');
  // B6 rest 不会与 head 重复（同一个步骤既报「卡在它前面」又报「之后还有它」= 一步读成两步）
  a(c4.rest.length === 1 && c4.rest[0].seq === 2,
    'v2127/x1: [B6] rest 只列当前步**之后**的（实 ' + JSON.stringify(c4.rest) + '）');
  // B7 漂移只报不修：goal.next 与当前步不同指即 drift:true，且不改存档
  const snap = JSON.stringify(WA.store.get().people);
  a(c4.drift === true && c4.goalNext === '推进中',
    'v2127/x1: [B7] `next`（tick 写死的字符串）与当前步不同指 ⇒ 如实报 drift（实 '
      + c4.drift + ' / next=' + c4.goalNext + '）');
  a(JSON.stringify(WA.store.get().people) === snap,
    'v2127/x1: [B7] 读链**一个字节都不写存档**（漂移只报不修）');
  // B8 不建链：无计划 / 目标被删 ⇒ 如实拒，不造空链
  const cN = WA.plan.chain('乙');
  a(cN.ok === false && cN.reason === 'no-plan',
    'v2127/x1: [B8] 没有计划的人报 no-plan，不造一条空链（实 ' + cN.reason + '）');
  WA.store.transact(function (d) { d.people['p_甲'].life.goals = []; }, TAG + 'goal-gone');
  const cG = WA.plan.chain('甲');
  a(cG.ok === false && cG.reason === 'unknown-goal' && cG.goalId === 'g1',
    'v2127/x1: [B8] 计划挂着的目标被人删掉 ⇒ unknown-goal（不顺手造一个人他没有的目标；实 '
      + JSON.stringify(cG) + '）');
  // B9 chainBlock：关闭时零 token；开启时出链状态 + 约束句
  const WA2 = reset(fresh());
  WA2.plan.expand('甲', 'g1', S3);
  WA2.plan.advance('甲'); WA2.plan.settle('甲', 'done');   // 第 0 步做完
  WA2.plan.advance('甲'); WA2.plan.settle('甲', 'blocked', { reason: '路断' });   // 第 1 步受阻
  const blk = WA2.plan.chainBlock();
  a(typeof blk === 'string' && blk.indexOf('【人物意图链】') === 0 && blk.indexOf('攒钱去乙地') > 0
    && blk.indexOf('第 1/3 步') > 0 && blk.indexOf('缺 银元×3') > 0
    && blk.indexOf('前置第 1 步（blocked）未完成') > 0 && blk.indexOf('之后还有 1 步') > 0,
    'v2127/x1: [B9] 推演块带出「第几步 / 缺什么 / 在哪一步受阻 / 之后还有几步」（实 '
      + JSON.stringify(blk.slice(0, 160)) + '）');
  a(blk.indexOf('不要替人物另编一条后续') > 0,
    'v2127/x1: [B9] 块尾带约束句（不给约束等于把链摊开让模型自由续写）');
  a(blk.indexOf('不要替人物另编一条后续') === blk.lastIndexOf('不要替人物另编一条后续'),
    'v2127/x1: [B9] 约束句只出现一次（重复渲染会把一句约束读成两句）');
  WA2.plan.setSettings({ enabled: false });
  a(WA2.plan.chainBlock() === '',
    'v2127/x1: [B9] 总开关关闭 ⇒ 空串（零 token —— 与既有各 buildBlock 同纪律）');
  a(WA2.plan.chain('甲').reason === undefined || WA2.plan.chain('甲').ok === true,
    'v2127/x1: [B9] 关掉注入面**不影响**读数面（chain 不是开关的从属物）');
}
// ── C 面：真消费方 ──────────────────────────────────────────────────
function runC(a) {
  const b = src(BACK);
  a(hits(b, 'WA.plan.chainBlock()') === 1,
    'v2127/x1: [C] backstage 恰有 1 个挂载点（v2.126.0 时该文件对 plan 零引用）');
  const WA = reset(fresh());
  WA.plan.expand('甲', 'g1', S3);
  const msgs = WA.backstage.buildPrompt({ idx: 1, text: 'x' }, '');
  const userSeg = ((msgs || [])[1] || {}).content || '';
  a(userSeg.indexOf('【人物意图链】') > 0 && userSeg.indexOf('攒钱去乙地') > 0,
    'v2127/x1: [C] 意图链**真的**进了推演提示词的 user 段（不是只在源码里挂着）');
  a(userSeg.indexOf('【世界快照】') >= 0 && userSeg.indexOf('【近期正文') > userSeg.indexOf('【人物意图链】'),
    'v2127/x1: [C] 挂载点插在既有段之间（快照在前、正文在后 —— 不是把既有段挤掉；实 snapshot='
      + userSeg.indexOf('【世界快照】') + ' / chain=' + userSeg.indexOf('【人物意图链】')
      + ' / recent=' + userSeg.indexOf('【近期正文') + '）');
  // 关闭时提示词里不得出现该块（否则「关掉它」是假的）
  const WA2 = reset(fresh());
  WA2.plan.expand('甲', 'g1', S3);
  WA2.plan.setSettings({ enabled: false });
  const msgs2 = WA2.backstage.buildPrompt({ idx: 1, text: 'x' }, '');
  a((((msgs2 || [])[1] || {}).content || '').indexOf('【人物意图链】') < 0,
    'v2127/x1: [C] 关掉总开关后提示词里该块消失（开关真作用于这条链）');
  // 面板读者
  const pn = src(PANEL);
  a(hits(pn, 'WA.plan.chain(') === 1 && pn.indexOf('意图链：') > 0,
    'v2127/x1: [C] 面板「查看」真读链读数，且读不出来时如实报原因（不拿 view 冒充链）');
  a(hits(pn, 'wa-plan-view') >= 1,
    'v2127/x1: [C] 读点仍在既有控件里（零新增控件 ⇒ 不触碰 UI 绑定门禁）');
}
// ── N 面：真源码破坏 ⇒ 破坏副本上重跑同款判据 ────────────────────────
function runNegative(a) {
  const P0 = src(PLAN), B0 = src(BACK), N0 = src(PANEL);
  // 同款判据（正例与负控制共用同一份实现 —— 两侧不同源就会「写进去的对不上复算的」）
  const probeRunningStep = function (WA) {
    reset(WA); WA.plan.expand('甲', 'g1', S3); WA.plan.advance('甲');
    const c = WA.plan.chain('甲');
    return c.step ? c.step.seq : null;
  };
  const probeAfterFace = function (WA) {
    reset(WA); WA.plan.expand('甲', 'g1', S3);
    WA.plan.advance('甲'); WA.plan.settle('甲', 'done'); WA.plan.advance('甲');
    const c = WA.plan.chain('甲');
    return c.blockedBy.filter(function (x) { return x.kind === 'after'; }).length;
  };
  const probeUnknownGoal = function (WA) {
    reset(WA); WA.plan.expand('甲', 'g1', S3);
    WA.store.transact(function (d) { d.people['p_甲'].life.goals = []; }, TAG + 'neg');
    // 探针必须自带 catch：破坏后的分支可能直接抛（准入被架空 ⇒ `goal` 为 null ⇒ 读 `goal.next` 抛）。
    //   不包的话，这一抛会逃逸出负控制段、让**后面所有断言静默漏跑**（假通过/假失败都由此而来）。
    try { return WA.plan.chain('甲').reason || 'ok'; } catch (e) { return 'threw:' + (e && e.message); }
  };
  const probeDrift = function (WA) {
    reset(WA); WA.plan.expand('甲', 'g1', S3);
    WA.plan.advance('甲'); WA.plan.settle('甲', 'blocked', { reason: '路断' });
    return WA.plan.chain('甲').drift;
  };
  // N1 **修缺陷①**的反证：把 running 从 `at` 里摘掉 ⇒ 判据须现形
  const n1 = breakOnce(P0, ANCHORS.at.txt, 'const at = cur || stuck || null;', 'N1');
  a(probeRunningStep(fresh(over(PLAN, n1))) === null,
    'v2127/x1: [N1] 摘掉 running 后第 0 步开工那一刻答不出当前步（B2 不是恒真）');
  // N2 **修缺陷②**的反证：前置面退回「判 at 自己的前置」⇒ 判据须现形
  const n2 = breakOnce(P0, ANCHORS.todo.txt, 'const todo = null;', 'N2');
  a(probeAfterFace(fresh(over(PLAN, n2))) === 0,
    'v2127/x1: [N2] 前置面退回旧形态后「待办步在等谁」答不出（B4 不是恒真）');
  // N3 目标准入形同虚设 ⇒ 被删的目标也能成链（`goal` 被架空后 `goal` 为 null，
  //   链体在 `goal.next` 上抛错 —— 那就是「准入没了，链读不出来但也不拒」，与 B8 现形同义）
  const n3 = breakOnce(P0, ANCHORS.goal.txt, 'if (false) return { ok: false, reason: \'unknown-goal\', id: row.id, goalId: clean(row.goalId, 60) };', 'N3');
  a(probeUnknownGoal(fresh(over(PLAN, n3))) !== 'unknown-goal',
    'v2127/x1: [N3] 目标准入拆掉后不再如实拒收（B8 不是恒真）');
  // N4 推演块不报前置状态 ⇒ 两块分工塌掉
  const probeBlockText2 = function (WA) {
    reset(WA); WA.plan.expand('甲', 'g1', S3);
    WA.plan.advance('甲'); WA.plan.settle('甲', 'done');
    WA.plan.advance('甲'); WA.plan.settle('甲', 'blocked', { reason: '路断' });
    return WA.plan.chainBlock();
  };
  const n4 = breakOnce(P0, ANCHORS.blockState.txt, 'return b.kind === \'need\' ? \'缺 \' + b.detail : \'前置第 \' + b.seq + \' 步未完成\';', 'N4');
  a(probeBlockText2(fresh(over(PLAN, n4))).indexOf('（blocked）') < 0,
    'v2127/x1: [N4] 前置状态退化后推演块说不清那一步什么状态（B9 不是恒真）');
  // N5 漂移退回恒 false ⇒ 判据现形
  const n5 = breakOnce(P0, ANCHORS.drift.txt, 'drift: false,', 'N5');
  a(probeDrift(fresh(over(PLAN, n5))) === false,
    'v2127/x1: [N5] 漂移退回恒 false（B7 不是恒真）');
  // N5b 资源缺额不报 ⇒ 链读数里「缺什么」消失
  const n5b = breakOnce(P0, ANCHORS.need.txt, 'if (false) blockedBy.push({ kind: \'need\', detail: at.need.resource + \'×\' + at.need.amount });', 'N5b');
  const W5b = reset(fresh(over(PLAN, n5b)));
  W5b.plan.expand('甲', 'g1', S3); W5b.plan.advance('甲'); W5b.plan.settle('甲', 'done');
  a(W5b.plan.chain('甲').blockedBy.filter(function (x) { return x.kind === 'need'; }).length === 0,
    'v2127/x1: [N5b] 缺额面拆掉后「缺什么」读不到（B3 不是恒真）');
  // N6 摘掉 backstage 挂载 ⇒ 消费方判据现形
  const n6 = breakOnce(B0, ANCHORS.backMount.txt, '', 'N6');
  const W6 = fresh(over(BACK, n6));
  reset(W6); W6.plan.expand('甲', 'g1', S3);
  a((((W6.backstage.buildPrompt({ idx: 1, text: 'x' }, '') || [])[1] || {}).content || '').indexOf('【人物意图链】') < 0,
    'v2127/x1: [N6] 摘掉挂载后提示词里该块消失（C 面判据不是恒真）');
  // N7 摘掉面板读点 ⇒ 面板判据现形（用源码面判，避免面板未装载时的假绿）
  const n7 = breakOnce(N0, ANCHORS.panelRead.txt, 'const c = { ok: false, reason: \'neg\' };', 'N7');
  a(hits(n7, 'WA.plan.chain(planWho())') === 0,
    'v2127/x1: [N7] 摘掉面板读点后该读数为零（C 面判据不是恒真）');
  // N8 纯度：全部负控制跑完后三个真文件逐字未变
  a(src(PLAN) === P0 && src(BACK) === B0 && src(PANEL) === N0,
    'v2127/x1: [N8]（纯度）全部负控制跑完后三个真文件逐字未变');
  a(probeRunningStep(reset(fresh())) === 0 && probeAfterFace(reset(fresh())) === 1,
    'v2127/x1: [N8]（纯度）原版上同款判据为真 —— 两向自证成立');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: PLAN
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X1-CHAIN-V2127: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X1-CHAIN-V2127: pass（' + pass + ' 项）');
}
