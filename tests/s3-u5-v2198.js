// WorldAxis tests/s3-u5-v2198.js — U2 批次⑤（world-blueprint + world-seed）统一原子提交链专锁
//
// 命题（每条都答得出「哪里不对、期待什么」）：
//   A. core/commit.js —— 跨层副作用面（本批**新增**的一等面，与 defer 分两栏）：
//      A1 链内 effect() 当场执行并逐条回带（ok / kind / reason）—— 这是「世界装成的前提」，
//         不是「提交后可补做的通知」（后者才是 defer）。
//      A2 显式返回 false ⇒ 如实记 effect-refused（不抛也算失败，与 mutator 同一拒签口径）。
//      A3 抛错 ⇒ 回带**真因**（异常消息），不吞成一句「失败了」。
//      A4 传入非函数 ⇒ bad-effect，且**不进** effects 记账（没执行的副作用不算一笔）。
//      A5 单链副作用上限（常量 8）⇒ 第 9 个起 chain-effects-full。这是**链面**的容量闸，
//         与 aftermath 的世界面 effects-full 分列：两个执行点各自有名字（重名会让见证集与
//         死表集相交，两条硬判据当场报 -1）。
//      A6 链外调 effect() ⇒ bad-chain（链面自己认错，不假装登记成功）。
//      A7 链中止 ⇒ 已做而未提交的副作用进 pending()（**不自动重放**：机制开关按浏览器全局存，
//         自动重做等于把一个聊天的配置写到所有聊天上 —— 比漏做更糟），条目带 kind/site/opId/reason。
//      A8 链内 active() 报 effects / effectMiss（诊断面与面板据此判「这一笔装得成不成」）；
//         链外 active() 恒 null。
//      A9 产品消费方在场：toolDiag.collect().commit.effects 读得到 pending 计数（防死导出 ——
//         只导出不消费等于没交付）。
//   B. world-blueprint（世界蓝图）—— 五条真病，全部**探针实测**（不是阅读推断）：
//      B1 链内 get() 看不见本链刚存的蓝图（读口走 store.get() 已提交快照；实测恒
//         unknown-blueprint）—— 链内写后读不可见。
//      B2 同一链内重复 bpSig **去重失效**：链上两次同签名 save 都报 ok:true ⇒ 提交后同一份
//         蓝图存两份，而顶层同样输入是被 duplicate-blueprint 拒的（边界：同结构不合并）。
//      B3 链上写入**不报在途**：回执只有 ok:true，看不出「这一笔还没提交」。
//      B4 **跨层半写 C1**（实测）：链里 importBlueprint 之后整链中止 ⇒ 世界上人/地/势力全 0、
//         installed 为 null（与链的原子性一致），而蓝图 mech 那一段的 setSettings
//         **已经写进 settingsBus**。同一刻「这个世界没装成」与「这个世界机制已经改了」同时成立。
//      B5 **谎报 C2**（实测）：setSettings 抛错被旧口径 catch(err){} 吞掉 ⇒ 世界照装、
//         回执 {ok:true}，而机制一行没生效、faults 还是 {}。现在三栏如实登记
//         （applied / refused / failed），且在本模块自己的故障台账里留名。
//   C. world-seed（世界种子）—— 三条真病（与蓝图同型的链面三病）：
//      C1 链内 get() 看不见本链新种子（恒 unknown-seed）；
//      C2 同一链内重复 sig 去重失效（顶层同样输入是被 duplicate-seed 拒的）；
//      C3 链上写入不报在途。
//      C6 本批**不动** initConfirm：初始化是「开新局」顶层操作（写的是整局骨架，不属于任何
//         跨模块业务链）—— 断言是按**行为**验的，不是按注释验的。
//   D. 硬边界与如实登记（口径不许比事实更乐观）：
//      D1 链外顶层写口形状**逐字未变**（chain:false / persisted:true，与 U2 各批同形）。
//      D2 调用方自己的事务里 ⇒ 如实标 nested:true / persisted:false / chain:false。
//      D3 链提交后世界真有那一行（不是「报了 ok 就算」）。
//      D4 链中止 ⇒ 库不留痕（本模块写进 draft 的那一笔与链共生死）。
//   N. 真源码破坏负控制（**在内存副本上**跑，零文件改写；两向自证）：
//      N0 前置：破坏锚点在各文件里**恰中 1 次**、破坏真的改动了字符串、真源文件逐字未变。
//      N1 打破 world-blueprint 的链草稿读口（chainDraft 恒空）⇒ 原版上为真的
//         「链内写后读看得见」（B1）与「同一链内重复 bpSig 被拒」（B2）**当场翻假**，
//         且同一份蓝图真存了两份（缺陷复现）。
//      N2 打破 world-seed 的同款读口 ⇒ C1 / C2 翻假。
//      N3 打破 commit.effect 的失败累计 ⇒ 原版上为真的 effectMiss=2（A4b）翻成 0。
//      为什么必须有 N：只有正向读数的锁，在「修复被谁回退了」时输出长得一样（都是 ok）——
//      破坏版上同款判据必须翻假，才证明那些 ok 不是在空转。
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
 * 开一个**干净场景**（与 U2 各批同口径：store 按聊天隔离存档
 * worldaxis_state_<chatId>，而 mock 的 chatId 恒为 test_chat_001 ⇒ 直接 sync.fresh()
 * 连开几个场景其实共用一份累积世界；且本锁要验 pending() 这类**进程态**读数，
 * 每个场景必须真的是新闭包）。
 */
/**
 * 场景装载器的**源码副本**开关（N 段负控制用）。
 *   为什么不另开一份 fresh 实现：两份装载器必然漂移（本仓「同一事实两处口径」老病）——
 *   这里只让**装载源**可覆盖，其余（换 chatId、清键、store.init、__chatId）逐字同源。
 */
let __OV = null;
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function countOcc(src2, sub) { return src2.split(sub).length - 1; }
function freshWith(ov) {
  __OV = ov || null;
  const W = fresh();
  __OV = null;
  return W;
}
function fresh() {
  __seq++;
  const cid = 'u5_lock_' + __seq;
  ST.getContext().chatId = cid;
  const WA = vm.runInContext('window.WorldAxis', ctx);
  try { WA.mainWin.localStorage.removeItem('worldaxis_state_' + cid); } catch (e) {}
  for (const rel of LOAD) vm.runInContext((__OV && __OV[rel] !== undefined) ? __OV[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
  const W = global.WorldAxis;
  try { W.store.init(); } catch (e) {}
  try { W.__chatId = cid; } catch (e) {}
  return W;
}
function state(WA) { return WA.store.get() || {}; }
function bpLib(WA) { return ((state(WA).blueprint || {}).library) || []; }
function seedLib(WA) { return ((state(WA).worldSeed || {}).library) || []; }
/** 写一小笔世界（链要「有世界写入」才算链）。 */
function touch(draft) { draft.commit = draft.commit || {}; draft.commit.__u5 = 1; }
/** 造一个非空结构局面（人物 + 势力 + 地点 + 道路），供 exportBlueprint 取料。 */
function bones(WA, tag) {
  WA.store.transact(function (d) {
    d.blueprint = { library: [], seq: 0, installed: null };
    d.people = {};
    d.world = Object.assign({}, d.world, { places: [], roads: [] });
    d.evolution = Object.assign({}, d.evolution, { factions: [], round: 0 });
    d.chronicle = []; d.currents = []; d.echoes = []; d.worldFacts = [];
    d.meta = Object.assign({}, d.meta, { initFrom: null });
    if (d.economy) d.economy.goods = [];
  }, 'u5:reset');
  WA.store.transact(function (d) {
    WA.registry.ensurePerson(d, 'np_' + tag + 'a', tag + '张三', 'u5');
    WA.registry.ensurePerson(d, 'np_' + tag + 'b', tag + '李四', 'u5');
  }, 'u5:people');
  WA.world.addPlace({ name: tag + '甲城', kind: 'home' });
  WA.world.addPlace({ name: tag + '乙城', kind: 'market' });
  WA.world.addRoad(tag + '甲城', tag + '乙城', 30);
  WA.store.transact(function (d) {
    d.evolution = Object.assign({}, d.evolution, { factions: [{ id: 'fa_' + tag, name: tag + '甲势力', power: 40 }] });
  }, 'u5:fa');
}
function seedBones(WA, tag) {
  WA.store.transact(function (d) {
    d.worldSeed = { library: [], seq: 0 };
    d.evolution = Object.assign({}, d.evolution, { factions: [{ id: 'f1', name: tag + '甲势力', power: 30 }] });
    d.people = { p1: { id: 'p1', name: tag + '甲人', profile: { relations: [{ target: 'p2', intimacy: 80 }] } } };
    d.world = Object.assign({}, d.world, { places: [{ id: 'pl1', name: tag + '甲城' }], roads: [] });
    d.background = Object.assign({}, d.background, { text: tag + '乱世之初。' });
  }, 'u5:seed-bones');
}

// ══ A 段：commit 的跨层副作用面 ══
const C0 = fresh();
a(typeof C0.commit.effect === 'function' && typeof C0.commit.pending === 'function',
  'A0 备料：跨层副作用面在场（effect / pending 两个新读口）');
const CA = fresh();
let a1 = null, a2 = null, a3 = null, a4 = null, a1Active = null;
const chA = CA.commit.chain({
  opId: 'u5-a1', site: 'u5:a1',
  fn: function (c, draft) {
    touch(draft);
    CA.commit.step(null, { site: 'u5:a1:s1' });
    a1 = CA.commit.effect(null, 'mech:aa', function () { return true; });
    a1Active = CA.commit.active();
    a2 = CA.commit.effect(null, 'mech:bb', function () { return false; });
    a3 = CA.commit.effect(null, 'mech:cc', function () { throw new Error('boom-cc'); });
    a4 = CA.commit.effect(null, 'mech:dd', 'not-a-function');
    return true;
  }
});
a(chA.ok === true, 'A1a 链上登记 4 个副作用业务上成立（链结果 ' + J(chA.reason) + '）');
a(a1 && a1.ok === true && a1.kind === 'mech:aa' && a1.reason === undefined,
  'A1 **成功的副作用如实回带**（ok:true / kind 原样带出 / 无 reason；实得 ' + J(a1) + '）');
a(chA.effects.length === 3 && chA.effects[0].kind === 'mech:aa' && chA.effects[0].ok === true,
  'A1b 链回执逐条回带 effects（3 条 —— 没执行的那一个不记账；实得 ' + J(chA.effects.map(function (x) { return x.kind; })) + '）');
a(a2 && a2.ok === false && a2.reason === 'effect-refused',
  'A2 **显式返回 false 如实记 effect-refused**（不抛也算失败，与 mutator 同一拒签口径；实得 ' + J(a2) + '）');
a(a3 && a3.ok === false && a3.reason === 'boom-cc',
  'A3 **抛错回带真因**（异常消息原样带出，不吞成一句「失败了」；实得 ' + J(a3) + '）');
a(a4 && a4.ok === false && a4.reason === 'bad-effect',
  'A4 **非函数 ⇒ bad-effect**（实得 ' + J(a4) + '）');
a(chA.effectMiss === 2, 'A4b 失败累计 effectMiss=2（拒签 + 抛错各一次；实得 ' + chA.effectMiss + '）');
a(chA.ok === true && chA.effectMiss === 2,
  'A4c **链 ok:true 与 effectMiss>0 是两个事实**（世界写成了，但写成的世界里有前提没做到 ——'
  + '这一组读数在旧口径下共用一张表，故调用方只看 ok 会漏掉它）');
a(a1Active && a1Active.effects === 1 && a1Active.effectMiss === 0,
  'A8 **链内 active() 报副作用读数**（effects / effectMiss；实得 ' + J(a1Active) + '）');
a(CA.commit.active() === null, 'A8b 链外 active() 恒 null（链是进程态编排，链外看不见）');
a(chA.effects.length === 3 && chA.effects[1].reason === 'effect-refused',
  'A4d 拒签那一条**留在记账里**（失败也是一笔，不许静默丢弃；实得 ' + J(chA.effects[1]) + '）');
const CAf = CA.commit.chainStat().faults;
a(CAf['bad-effect'] === 1, 'A4e `bad-effect` 进链故障台账（实得 ' + CAf['bad-effect'] + '）');

// A5：容量闸（常量 8）
const CB = fresh();
const opened = [];
const chB = CB.commit.chain({
  opId: 'u5-a5', site: 'u5:a5',
  fn: function (c, draft) {
    touch(draft);
    CB.commit.step(null, { site: 'u5:a5:s1' });
    for (let i = 0; i < 10; i++) opened.push(CB.commit.effect(null, 'k' + i, function () { return true; }));
    return true;
  }
});
a(chB.ok === true && chB.effects.length === 8,
  'A5 **单链副作用上限（常量 8）**：超出的不记账（实得 ' + chB.effects.length + ' 条）');
a(opened.slice(0, 8).every(function (x) { return x.ok === true; })
  && opened.slice(8).every(function (x) { return x.ok === false && x.reason === 'chain-effects-full' && x.cap === 8; }),
  'A5b 第 9 / 第 10 个如实拒收 chain-effects-full 且交出 cap（实得 ' + J(opened.slice(8)) + '）');
a(CB.commit.chainStat().faults['chain-effects-full'] === 2,
  'A5c **链面容量闸与 aftermath 的世界面 effects-full 分列**（重名会让见证集与死表集相交 ⇒ 恒等式差 -1；'
  + '实得 chain-effects-full=' + CB.commit.chainStat().faults['chain-effects-full'] + '）');
const cSrc = fs.readFileSync(path.join(BASE, 'core/commit.js'), 'utf8');
a(cSrc.indexOf("'chain-effects-full'") >= 0 && cSrc.indexOf('LIMITS_EFFECT = { LIST: 8 }') >= 0,
  'A5d 链面容量闸在源码里是**常量**（LIMITS_EFFECT.LIST=8，不是可配项 —— 读数与执行同源）');

// A6：链外调 effect ⇒ bad-chain
const CC = fresh();
const cOut = CC.commit.effect(null, 'mech:x', function () { return true; });
a(cOut && cOut.ok === false && cOut.reason === 'bad-chain',
  'A6 **链外调 effect ⇒ bad-chain**（链面自己认错，不假装登记成功；实得 ' + J(cOut) + '）');
a(CC.commit.chainStat().faults['bad-chain'] === 1, 'A6b bad-chain 进链故障台账');

// A7：链中止 ⇒ pending 列出「已做未提交」（不自动重放）
const CD = fresh();
let dEffect = null;
const chD = CD.commit.chain({
  opId: 'u5-a7', site: 'u5:a7',
  fn: function (c, draft) {
    touch(draft);
    CD.commit.step(null, { site: 'u5:a7:s1' });
    dEffect = CD.commit.effect(null, 'mech:pend', function () { return true; });
    return false;
  }
});
a(chD.ok === false && chD.reason === 'step-refused',
  'A7 链被主动中止（reason=' + chD.reason + '）');
a(chD.effects.length === 1 && chD.effects[0].ok === true,
  'A7b 中止的回执仍如实回带「做过的副作用」（' + J(chD.effects) + '）');
const pend = rc(CD.commit.pending());
const rows = pend.items.filter(function (x) { return x.kind === 'mech:pend'; });
a(rows.length === 1 && rows[0].site === 'u5:a7' && rows[0].opId === 'u5-a7' && rows[0].reason === 'aborted',
  'A7c **已做未提交的副作用进待办**（kind / site / opId / reason 四格齐全；实得 ' + J(rows[0]) + '）');
a(pend.count === pend.items.length && pend.cap > 0,
  'A7d 待办读面自带 count / cap（有界台账，不谎称无上限；实得 ' + J({ count: pend.count, cap: pend.cap }) + '）');
const word = ((state(CD).commit || {}).__u5);
a(word === undefined, 'A7e 世界一格未动（中止的链连自己 draft 里那笔世界写也没留下）');

// A9：产品消费方（防死导出）
let diag = null;
try { diag = CD.toolDiag.collect(); } catch (e) { diag = null; }
const dgEff = diag && diag.commit && diag.commit.effects;
a(!!dgEff && dgEff.pending >= 1 && Array.isArray(dgEff.items) && dgEff.items.length >= 1,
  'A9 **诊断面读得到待办副作用**（toolDiag.collect().commit.effects；实得 ' + J(dgEff) + '）');
a(!!dgEff && typeof dgEff.cap === 'number', 'A9b 诊断面连 cap 一并带出（读者不必去猜上限在哪）');

// ══ B 段：world-blueprint ══
const BP0 = fresh();
BP0.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
bones(BP0, 'u5bp');
const exB = rc(BP0.worldBlueprint.exportBlueprint());
const exM = rc(BP0.worldBlueprint.exportBlueprint({ keep: 'mech' }));
a(exB.ok === true && exB.counts.people === 2 && exB.counts.places === 2,
  'B0 备料：蓝图导出成功（' + J(exB.counts) + '）');
a(exM.ok === true && Object.keys(exM.blueprint.mech).length >= 1,
  'B0b 备料：mech 档蓝图带机制段（' + J(Object.keys(exM.blueprint.mech)) + '）');

// B1 / B2 / B3：链内写后读 + 去重 + 三态
const BP1 = fresh();
BP1.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
let bSave = null, bGet = null, bDup = null;
const chBP1 = BP1.commit.chain({
  opId: 'u5-b1', site: 'u5:b1',
  fn: function (c, draft) {
    bSave = rc(BP1.worldBlueprint.save('链上蓝图', 'other', { blueprint: exB.blueprint }));
    BP1.commit.step(null, { site: 'worldBlueprint:save' });
    bGet = rc(BP1.worldBlueprint.get(bSave && bSave.id));
    BP1.commit.step(null, { site: 'worldBlueprint:get' });
    bDup = rc(BP1.worldBlueprint.save('链上蓝图二号', 'other', { blueprint: exB.blueprint }));
    BP1.commit.step(null, { site: 'worldBlueprint:save2' });
    return true;
  }
});
a(chBP1.ok === true, 'B1a 链上 save + get + 重复 save 业务上成立（链结果 ' + J(chBP1.reason) + '）');
a(bGet && bGet.ok === true && bGet.row && bGet.row.id === bSave.id,
  'B1 **链内写后读看得见**（此前读 store.get() 已提交快照 ⇒ 恒 unknown-blueprint；实得 ' + J(bGet && bGet.reason) + '）');
a(bGet && bGet.row && bGet.row.bp && bGet.row.bp.bpSig === exB.bpSig,
  'B1b 读到的是本链那一份的真实字段（bpSig 对得上）');
a(bSave && bSave.chain === true && bSave.persisted === false && bSave.projected === true,
  'B3 **链上写入如实标未提交**（chain:true / persisted:false / projected:true；实得 ' + J(bSave) + '）');
a(bDup && bDup.ok === false && bDup.reason === 'duplicate-blueprint' && bDup.existing === bSave.id,
  'B2 **同一链内重复 bpSig 被去重拒收**（此前判据读过期快照 ⇒ 两次都 ok:true、同一份存两份；'
  + '实得 ' + J(bDup) + '）');
a(bpLib(BP1).length === 1, 'B2b 链提交后库里只有 **1** 张（实得 ' + bpLib(BP1).length + '）');

// BP4：链中止 ⇒ 库不留痕
const BP2 = fresh();
BP2.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
let bSave2 = null;
const chBP2 = BP2.commit.chain({
  opId: 'u5-b4', site: 'u5:b4',
  fn: function (c, draft) {
    bSave2 = rc(BP2.worldBlueprint.save('会被撤回的蓝图', 'other', { blueprint: exB.blueprint }));
    BP2.commit.step(null, { site: 'worldBlueprint:save' });
    return false;
  }
});
a(chBP2.ok === false, 'B4a 链被主动中止（reason=' + chBP2.reason + '）');
a(bSave2 && bSave2.ok === true && bSave2.chain === true,
  'B4b 中止前那一刻，写口报的是 ok:true / chain:true（与最终结果**不是**一回事 —— 这正是要报在途的理由）');
a(bpLib(BP2).length === 0,
  'B4 **链中止 ⇒ 库不留痕**（本模块写进 draft 的那一笔与链共生死；此前分属独立事务 ⇒ 「链撤了、库还留着」；'
  + '实得 ' + bpLib(BP2).length + '）');

// BP5：跨层半写（C1）
const BP3 = fresh();
BP3.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
const pv3 = rc(BP3.worldBlueprint.previewImport(exM.blueprint));
a(pv3.ok === true && BP3.worldBlueprint.targetEmpty().empty === true, 'B5a 备料：空新局上预览成功');
let bImp = null;
const chBP3 = BP3.commit.chain({
  opId: 'u5-b5', site: 'u5:b5',
  fn: function (c, draft) {
    bImp = rc(BP3.worldBlueprint.importBlueprint());
    BP3.commit.step(null, { site: 'worldBlueprint:import' });
    return false;
  }
});
const sBP3 = state(BP3);
a(chBP3.ok === false, 'B5b 链被主动中止（reason=' + chBP3.reason + '）');
a(Object.keys(sBP3.people || {}).length === 0 && ((sBP3.world || {}).places || []).length === 0
  && ((sBP3.evolution || {}).factions || []).length === 0 && !(sBP3.blueprint || {}).installed,
  'B5c **世界一格未动**（人 / 地 / 势力全 0、installed 为 null —— 与链的原子性一致；实得 '
  + J({ people: Object.keys(sBP3.people || {}).length, places: ((sBP3.world || {}).places || []).length,
    factions: ((sBP3.evolution || {}).factions || []).length, installed: (sBP3.blueprint || {}).installed }) + '）');
a(chBP3.effects.length >= 1 && chBP3.effects.every(function (x) { return x.ok === true; }),
  'B5d **但机制那一笔真的做过了**（跨层副作用不落 draft，随不了链的原子性；实得 '
  + J(chBP3.effects.map(function (x) { return x.kind; })) + '）');
const pend3 = rc(BP3.commit.pending());
const mechPend = pend3.items.filter(function (x) { return String(x.kind).indexOf('mech:') === 0; });
a(mechPend.length === chBP3.effects.length && mechPend.every(function (x) { return x.reason === 'aborted'; }),
  'B5 **跨层半写两个事实都答得出来**：「这个世界没装成」与「这个世界的机制已经改了」'
  + '（待办里 ' + mechPend.length + ' 条 mech:*，理由 aborted；实得 ' + J(mechPend.map(function (x) { return x.kind; })) + '）');
a(bImp && bImp.ok === true && bImp.installed && bImp.installed.people === 2,
  'B5e 被调方当时**报的是成功**（这正是旧口径的盲区：世界装成与否要看链，不看这一句 ok；实得 '
  + J({ ok: bImp && bImp.ok, people: bImp && bImp.installed && bImp.installed.people }) + '）');

// BP6：谎报（C2）—— mech setSettings 抛错
const BP4 = fresh();
BP4.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
const bpThrow = JSON.parse(JSON.stringify(exM.blueprint));
bpThrow.mech = { economy: { enabled: true }, notAnEngineAtAll: { enabled: true } };
const realEco = BP4.economy && BP4.economy.setSettings;
if (BP4.economy) BP4.economy.setSettings = function () { throw new Error('boom-mech'); };
const pv4 = rc(BP4.worldBlueprint.previewImport(bpThrow));
const imp4 = rc(BP4.worldBlueprint.importBlueprint());
if (BP4.economy && realEco) BP4.economy.setSettings = realEco;
a(pv4.ok === true, 'B6a 备料：预览成功');
a(imp4 && imp4.mech && imp4.mech.failed.length === 1 && imp4.mech.failed[0].engine === 'economy'
  && imp4.mech.failed[0].reason === 'boom-mech',
  'B6 **机制写失败如实登记**（此前 catch(err){} 吞掉 ⇒ 回执照样 ok:true、机制一行没生效、faults 还是 {}；'
  + '实得 ' + J(imp4 && imp4.mech) + '）');
a(imp4 && imp4.mech && imp4.mech.refused.indexOf('notAnEngineAtAll') >= 0,
  'B6b **refused 与 failed 分栏**（「本侧没这个引擎」不是失败 —— 假装成功同样不许；实得 '
  + J(imp4 && imp4.mech && imp4.mech.refused) + '）');
a(imp4 && imp4.ok === true,
  'B6c 世界照装（机制失败不改装世界的成败判定）—— 但**回执里分得开**，这正是本批要治的那条谎报');
const stBP4 = rc(BP4.worldBlueprint.stat());
a(stBP4.faults['mech:economy'] === 1, 'B6d 失败进**本模块自己的**故障台账（mech:economy；实得 ' + J(stBP4.faults) + '）');
a(stBP4.lastMech && stBP4.lastMech.failed.length === 1 && stBP4.lastMech.applied.length === 0,
  'B6e stat().lastMech 如实回带上一笔（applied/failed 分栏；实得 ' + J(stBP4.lastMech) + '）');

// BP7：链外顶层形状照旧
const BP5 = fresh();
BP5.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
const topB = rc(BP5.worldBlueprint.save('顶层蓝图', 'other', { blueprint: exB.blueprint }));
a(topB && topB.ok === true && topB.chain === false && topB.persisted === true && topB.projected === undefined,
  'D1 world-blueprint 链外顶层**照旧**（chain:false / persisted:true / 无 projected；实得 ' + J(topB) + '）');
a(bpLib(BP5).length === 1, 'D3 链外顶层写**真落地**（实得 ' + bpLib(BP5).length + '）');

// ══ C 段：world-seed ══
const SD0 = fresh();
SD0.worldSeed.setSettings({ enabled: true, libCap: 12 });
seedBones(SD0, 'u5sd');
const exS = rc(SD0.worldSeed.extract());
const sSig = exS.sig;
a(exS.ok === true && !!sSig, 'C0 备料：种子提取成功（sig=' + sSig + '）');

const SD1 = fresh();
SD1.worldSeed.setSettings({ enabled: true, libCap: 12 });
let sSave = null, sGet = null, sDup = null;
const chSD1 = SD1.commit.chain({
  opId: 'u5-c1', site: 'u5:c1',
  fn: function (c, draft) {
    sSave = rc(SD1.worldSeed.save('链上种子', 'other', { seed: exS.seed }));
    SD1.commit.step(null, { site: 'worldSeed:save' });
    sGet = rc(SD1.worldSeed.get(sSave && sSave.id));
    SD1.commit.step(null, { site: 'worldSeed:get' });
    sDup = rc(SD1.worldSeed.save('链上种子二号', 'other', { seed: exS.seed }));
    SD1.commit.step(null, { site: 'worldSeed:save2' });
    return true;
  }
});
a(chSD1.ok === true, 'C1a 链上 save + get + 重复 save 业务上成立（链结果 ' + J(chSD1.reason) + '）');
a(sGet && sGet.ok === true && sGet.row && sGet.row.id === sSave.id,
  'C1 **链内写后读看得见**（此前读已提交快照 ⇒ 恒 unknown-seed；实得 ' + J(sGet && sGet.reason) + '）');
a(sGet && sGet.row && sGet.row.seed && sGet.row.seed.sig === sSig,
  'C1b 读到的是本链那一份的真实字段（sig 对得上）');
a(sSave && sSave.chain === true && sSave.persisted === false && sSave.projected === true,
  'C3 **链上写入如实标未提交**（chain:true / persisted:false / projected:true；实得 ' + J(sSave) + '）');
a(sDup && sDup.ok === false && sDup.reason === 'duplicate-seed' && sDup.existing === sSave.id,
  'C2 **同一链内重复 sig 被去重拒收**（实得 ' + J(sDup) + '）');
a(seedLib(SD1).length === 1, 'C2b 链提交后库里只有 **1** 条（实得 ' + seedLib(SD1).length + '）');
const SD2 = fresh();
SD2.worldSeed.setSettings({ enabled: true, libCap: 12 });
const chSD2 = SD2.commit.chain({
  opId: 'u5-c4', site: 'u5:c4',
  fn: function (c, draft) {
    rc(SD2.worldSeed.save('会被撤回的种子', 'other', { seed: exS.seed }));
    SD2.commit.step(null, { site: 'worldSeed:save' });
    return false;
  }
});
a(chSD2.ok === false && seedLib(SD2).length === 0,
  'D4 **链中止 ⇒ 种子库不留痕**（reason=' + chSD2.reason + '；实得 ' + seedLib(SD2).length + '）');
const SD3 = fresh();
SD3.worldSeed.setSettings({ enabled: true, libCap: 12 });
const topS = rc(SD3.worldSeed.save('顶层种子', 'other', { seed: exS.seed }));
a(topS && topS.ok === true && topS.chain === false && topS.persisted === true && topS.projected === undefined,
  'D1 world-seed 链外顶层**照旧**（chain:false / persisted:true / 无 projected；实得 ' + J(topS) + '）');
a(seedLib(SD3).length === 1, 'D3b 链外顶层写真落地（实得 ' + seedLib(SD3).length + '）');

// C6：initConfirm **不动**（按行为验）
const SD4 = fresh();
SD4.worldSeed.setSettings({ enabled: true, libCap: 12 });
seedBones(SD4, 'u5init');
const exI = rc(SD4.worldSeed.extract());
rc(SD4.worldSeed.save('开局种子', 'other', { seed: exI.seed }));
const prev = rc(SD4.worldSeed.initPreview('ws-from-lib', { variance: 'normal' }));
const prev2 = rc(SD4.worldSeed.initPreview(exI.seed, { variance: 'normal' }));
let ic = null;
const chIC = SD4.commit.chain({
  opId: 'u5-c6', site: 'u5:c6',
  fn: function (c, draft) {
    ic = rc(SD4.worldSeed.initConfirm());
    SD4.commit.step(null, { site: 'worldSeed:initConfirm' });
    return true;
  }
});
a(chIC.ok === true, 'C6a initConfirm 在链上仍可被调（本批不动它）');
a(ic && ic.confirmed !== true && ic.chain === undefined,
  'C6 **initConfirm 的链上行为不在本批改造面**（不谎称有 chain 三态；实得 ' + J({ ok: ic && ic.ok, reason: ic && ic.reason, chain: ic && ic.chain }) + '）');
a(!!prev.plan === !!prev2.plan, 'C6b 预览面照旧（两种入参都能给出计划或如实拒收）');

// D2：调用方自己的事务里 ⇒ 如实标 nested
const NR = fresh();
NR.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
NR.worldSeed.setSettings({ enabled: true, libCap: 12 });
let nB = null, nS = null;
NR.store.transact(function () {
  nB = rc(NR.worldBlueprint.save('嵌套蓝图', 'other', { blueprint: exB.blueprint }));
  nS = rc(NR.worldSeed.save('嵌套种子', 'other', { seed: exS.seed }));
}, 'u5:nested');
a(nB && nB.ok === true && nB.nested === true && nB.persisted === false && nB.chain === false,
  'D2 **调用方自己的事务里 ⇒ 如实标**（world-blueprint 面；nested:true / persisted:false / chain:false；'
  + '此前这一面漏标 —— 链面看不见它，而 store 的嵌套回执明明答得出 deferred:true；实得 ' + J(nB) + '）');
a(nB && nB.projected === undefined, 'D2b 嵌套面**不谎称**是本模块的链（无 projected）');
a(nS && nS.ok === true && nS.nested === true && nS.persisted === false && nS.chain === false,
  'D2c world-seed 的嵌套面同样如实标（实得 ' + J(nS) + '）');
a(bpLib(NR).length === 1 && seedLib(NR).length === 1,
  'D2d **那一层的写入随调用方提交**（外层提交后两库各 1 条；实得 ' + bpLib(NR).length + '/' + seedLib(NR).length + '）');

// D5：导出面与版本（本批**新增两个导出**：commit 的 effect / pending）
const kc = Object.keys(C0.commit);
a(kc.length === 17 && kc.indexOf('effect') >= 0 && kc.indexOf('pending') >= 0,
  'D5a commit 导出面 17 项且含 effect / pending（实得 ' + kc.length + '：' + J(kc) + '）');
const kb = Object.keys(C0.worldBlueprint);
a(kb.length === 15, 'D5b world-blueprint 导出面仍 15 项（本批零新增导出；实得 ' + kb.length + '）');
const ks = Object.keys(C0.worldSeed);
a(ks.length === 16, 'D5c world-seed 导出面仍 16 项（本批零新增导出；实得 ' + ks.length + '）');
const modV = function (rel) { return (C0.modules[rel] || {}).ver; };
a(modV('core/commit.js') === '2.195.0' && modV('engines/world-blueprint.js') === '2.195.0'
  && modV('engines/world-seed.js') === '2.195.0',
  'D5d 三个改过的模块 registerModule 版本随本批交付版本（实得 ' + J([modV('core/commit.js'),
    modV('engines/world-blueprint.js'), modV('engines/world-seed.js')]) + '）');
a(modV('engines/reject-recovery.js') === '2.209.0',
  'D5e reject-recovery 版本面（本版 v2.209.0：补 ui 层 15 条进三张冻结快照 —— '
  + '面板导航 11 条 + 助手面既有 4 条，快照 740 → 754 / 成功面 34 → 35，'
  + '并给 rec-ambiguous / channel-unconfigured 补上恢复档；比较值取 registerModule 现场声明）');
const cf = C0.commit.chainStat().faultCodes;
a(cf.indexOf('bad-effect') >= 0 && cf.indexOf('chain-effects-full') >= 0,
  'D5f fault 码表新增两条（bad-effect / chain-effects-full；实得 ' + J(cf) + '）');
a(C0.commit.chainSelfCheck().ok === true && Array.isArray(C0.commit.chainSelfCheck().faults),
  'D5g 链面自证仍全真（本批新增容量的同时没把自证改坏）');

// ══ N 段：真源码破坏负控制（内存副本，零文件改写；两向自证）══
//   自证「上面的 ok 不是空转」：把修复点打破，同款判据必须翻假。
//   纪律：破坏锚点**只在本段声明一次**；行为判据（N1/N2/N3）只读布尔结果，不引用锚点串。
const N_BP = 'engines/world-blueprint.js';
const N_SD = 'engines/world-seed.js';
const N_CM = 'core/commit.js';
const srcBp = read(N_BP), srcSd = read(N_SD), srcCm = read(N_CM);
// 锚点一：两模块的链草稿读口首行（同形，各恰中 1 次）
const A_DRAFT = "    var inf = (WA.commit && typeof WA.commit.inflight === 'function') ? WA.commit.inflight() : null;";
// 锚点二：effect 失败时的同步累计
const A_MISS = 'if (!rec.ok) c.effectMiss = (c.effectMiss || 0) + 1;';
a(countOcc(srcBp, A_DRAFT) === 1 && countOcc(srcSd, A_DRAFT) === 1,
  'N0a 链草稿读口锚点在两模块里各恰中 1 次（实 ' + countOcc(srcBp, A_DRAFT) + '/' + countOcc(srcSd, A_DRAFT) + '）');
a(countOcc(srcCm, A_MISS) === 1, 'N0b effectMiss 锚点恰中 1 次（实 ' + countOcc(srcCm, A_MISS) + '）');
const brkBp = srcBp.replace(A_DRAFT, '    var inf = null;');
const brkSd = srcSd.replace(A_DRAFT, '    var inf = null;');
const brkCm = srcCm.replace(A_MISS, 'void 0;');
a(brkBp !== srcBp && brkSd !== srcSd && brkCm !== srcCm,
  'N0c 三处破坏都真的改动了源码字符串（不是空替换 —— 空替换会让负控制变成「原版上再断言一次」的假绿）');

// N1：打破 world-blueprint 读口（读面退回已提交快照 = 修复前形态）
const WN1 = freshWith({ [N_BP]: brkBp });
WN1.worldBlueprint.setSettings({ enabled: true, libCap: 8 });
let n1Save = null, n1Get = null, n1Dup = null;
const n1ch = WN1.commit.chain({
  opId: 'u5-n1', site: 'u5:n1',
  fn: function (c, draft) {
    touch(draft);
    WN1.commit.step(null, { site: 'u5:n1:s1' });
    n1Save = rc(WN1.worldBlueprint.save('破坏版蓝图', 'other', { blueprint: exB.blueprint }));
    WN1.commit.step(null, { site: 'bp:save' });
    n1Get = rc(WN1.worldBlueprint.get(n1Save && n1Save.id));
    WN1.commit.step(null, { site: 'bp:get' });
    n1Dup = rc(WN1.worldBlueprint.save('破坏版蓝图二号', 'other', { blueprint: exB.blueprint }));
    WN1.commit.step(null, { site: 'bp:save2' });
    return true;
  }
});
a(n1ch.ok === true, 'N1a 破坏版上链本身照常提交（缺陷只在读面/去重面 —— 否则测的就不是这一处）');
a(n1Get && n1Get.ok === false && n1Get.reason === 'unknown-blueprint',
  'N1 破坏版上「链内写后读看得见」**翻假**（实得 ' + J(n1Get && n1Get.reason)
  + '）—— 真源码上同款判据为真（B1）');
a(n1Dup && n1Dup.ok === true,
  'N1b 破坏版上「同一链内重复 bpSig 被拒」**翻假**（实得 ok=' + (n1Dup && n1Dup.ok)
  + '）—— 真源码上同款判据为真（B2）');
a(bpLib(WN1).length === 2,
  'N1c **缺陷复现**：同一份蓝图真被存了两份（实得 ' + bpLib(WN1).length + ' 张）—— '
  + 'B2b 判的「库里只有 1 张」正是这一条的对立面');

// N2：打破 world-seed 读口
const WN2 = freshWith({ [N_SD]: brkSd });
WN2.worldSeed.setSettings({ enabled: true, libCap: 12 });
let n2Save = null, n2Get = null, n2Dup = null;
const n2ch = WN2.commit.chain({
  opId: 'u5-n2', site: 'u5:n2',
  fn: function (c, draft) {
    touch(draft);
    WN2.commit.step(null, { site: 'u5:n2:s1' });
    n2Save = rc(WN2.worldSeed.save('破坏版种子', 'other', { seed: exS.seed }));
    WN2.commit.step(null, { site: 'seed:save' });
    n2Get = rc(WN2.worldSeed.get(n2Save && n2Save.id));
    WN2.commit.step(null, { site: 'seed:get' });
    n2Dup = rc(WN2.worldSeed.save('破坏版种子二号', 'other', { seed: exS.seed }));
    WN2.commit.step(null, { site: 'seed:save2' });
    return true;
  }
});
a(n2ch.ok === true, 'N2a 破坏版上链本身照常提交');
a(n2Get && n2Get.ok === false && n2Get.reason === 'unknown-seed',
  'N2 破坏版上「链内写后读看得见」**翻假**（实得 ' + J(n2Get && n2Get.reason)
  + '）—— 真源码上同款判据为真（C1）');
a(n2Dup && n2Dup.ok === true && seedLib(WN2).length === 2,
  'N2b 破坏版上重复 sig 被静默收下、同一结构存两份（实得 ok=' + (n2Dup && n2Dup.ok)
  + ' / ' + seedLib(WN2).length + ' 条）—— 真源码上 C2 为真');

// N3：打破 effect 的失败累计
const WN3 = freshWith({ [N_CM]: brkCm });
let n3MissInChain = null;
const n3ch = WN3.commit.chain({
  opId: 'u5-n3', site: 'u5:n3',
  fn: function (c, draft) {
    touch(draft);
    WN3.commit.step(null, { site: 'u5:n3:s1' });
    WN3.commit.effect(null, 'mech:x', function () { return false; });
    WN3.commit.effect(null, 'mech:y', function () { throw new Error('boom-n3'); });
    const act3 = WN3.commit.active();
    n3MissInChain = act3 ? act3.effectMiss : null;
    return true;
  }
});
a(n3ch.ok === true && n3ch.effects && n3ch.effects.length === 2,
  'N3a 破坏版上副作用仍被逐条记账（实得 ' + (n3ch.effects && n3ch.effects.length) + ' 条）');
a(n3ch.effectMiss === 0 && n3MissInChain === 0,
  'N3 破坏版上「失败累计 effectMiss」**翻假**（回执 ' + n3ch.effectMiss + ' / 链内 ' + n3MissInChain
  + '）—— 真源码上同款判据为真（A4b：2）');

// N4：破坏只在内存副本上，真源逐字未变
a(read(N_BP) === srcBp && read(N_SD) === srcSd && read(N_CM) === srcCm,
  'N4 真源文件逐字未变（破坏只在内存副本上 —— 负控制不许改写仓库）');

let bad = 0;
results.forEach(function (r) { if (!r.ok) bad++; console.log((r.ok ? '  ok  ' : '  FAIL') + ' — ' + r.label); });
console.log('s3-u5-v2198: ' + (results.length - bad) + '/' + results.length + ' 通过');
module.exports = {
  results: results, failed: bad, total: results.length,
  // v2.195.0（U2 批次⑤）：**真挂载**（逐条转发注入的断言）。
  //   run.js 的 runLock(spec, method) 做的是 require(spec)[m](assert)（注入聚合器自己的 assert，
  //   v2.75.0 起统一形态）；锁体若不接参数、不转发，只回一个计数对象 ⇒ 锁红了全量回归照样绿
  //   （形式挂载 = 假绿，比孤儿更隐蔽 —— 孤儿至少会被 tests/orphan-lock-v2750.js 的 [B] 点名）。
  //   同族五把（u2-v2194 / u2-v2195 / u3-v2196 / u4-v2197 / 本把）一律逐条转发。
  runAll: function (a) {
    results.forEach(function (r) { a(r.ok, r.label); });
    return { failed: bad, total: results.length };
  }
};
if (require.main === module) process.exitCode = bad ? 1 : 0;
