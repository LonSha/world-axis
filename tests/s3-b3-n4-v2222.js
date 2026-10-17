#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b3-n4-v2222.js (v2.222.0) — N4 调查证据工作台专锁（五段齐备）
//
// 【拓展原文逐条对照】（engines/evidence-board.js 头注释与边界七条）
//   缺口：本仓早有四块**互相接得上、却谁也不回答同一个问题**的面 ——
//     · `probe` 答「这个案子里支持几条反驳几条」；
//     · `investigation` 答「这条线索查没查、采到几条」；
//     · `rumor` 答「这条链传到第几层、有没有被改写」；
//     · `intel` / `noesis` 答「这个人有没有资格知道」。
//   现场缺的那一问：**「这张案子现在有哪些边（支持 / 反证 / 来源链 / 证人 / 还能做的调查动作），
//   哪几条是独立的、哪几条只是同一条消息又转了一次手，撤回某条来源之后哪些结论受影响」**。
//   没有这一面，每个消费方（面板 / 模型 / 专锁）都得自己把四块拼一遍 —— 拼出来的判据必然慢慢漂开。
//
// 【本模块只做五件事，一次判定都不复制、一个字节都不落盘】
//   ① board(caseId, opts)        证据图：五类边逐条现取；支持/反驳条数**只问 probe.tally**；
//   ② assertClaim(caseId, claim) 原样转发 probe.addEvidence（等级逐字取自 probe.LEVELS）；
//   ③ retract(caseId, opts)      按 kind 转发 rumor.refute / intel.correct / probe.wrong，
//                                随后**现取重算**答「撤了这一条，哪些结论受影响」（affected/drift/viewChanged）；
//   ④ gather(caseId, opts)       原样转发 investigation.investigate；
//   ⑤ playerView(caseId, opts)   玩家图谱：只出此人获知的面，无资格者 truth 恒 null、withheld 只报条数。
//   七条否定式边界：不另存第二份真相（零 store.transact / 零 draft）· 不新增拒收码语义（编排层失败
//   另开 fault 命名空间）· 重复转述不作独立证据（同 factKey 多条链只算一条独立）· 不做参数校验 ·
//   玩家图谱不含未获知事实 · 预览 stamp 是进程态交互物（调用方回带，本模块只比对不存储）·
//   全关即零存在（五口一律拒 board-off，无 buildBlock）。
//
// 【本锁五段】A 静态契约与面板真消费方 / B 五口行为 / C 透传与三面 / D 零写入不变式与分栏计数 /
//   N 真源码破坏 + 两向自证（H5 锚点纯度 + H6 两向）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/evidence-board.js';
const PANEL_REL = 'ui/panel.js';
const RUN_REL = 'tests/run.js';
const IDX_REL = 'index.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 剥掉注释（判据纯度：不得被沿革注释冒充成现场）。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/** 取出 `WA.evidenceBoard = { … }` 的对象字面量体。 */
function exportBody(src) {
  const at = src.indexOf('WA.evidenceBoard = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  return '';
}
function env0(ov) { return sync.fresh(ov ? { srcOverride: ov } : {}).WA; }
/** 种一个最小可判世界：一个案子（两假说）+ 一条支持 + 一条反驳 + 一条线索（带证人）+ 一条转述链。 */
function seed(WA, cfg) {
  WA.evidenceBoard.setSettings(Object.assign({ enabled: true, maxEdges: 40, maxCases: 6 }, cfg || {}));
  ['probe', 'rumor', 'investigation', 'intel', 'noesis'].forEach(function (m) { WA[m].setSettings({ enabled: true }); });
  WA.store.transact(function (d) {
    d.worldFacts = [{ key: '账本去向', value: '甲', at: 1 }];
    d.rumor = { chains: [] };
    d.investigation = { clues: [], evidence: [] };
    d.probe = { cases: [] };
    // `people` 必须显式清空：intel 的行住在 `people['p_甲'].knowledge`，
    // 不显式落一份就会跨 fresh 泄漏（本锁探针期实测踩过）。
    d.people = {};
    d.intel = { entries: [] };
    d.noesis = { known: {} };
  }, 'n4:seed');
  return WA;
}
const FA = { h0: '账本去向', h1: '账本去向' };
function mk(ov, cfg) {
  const WA = seed(env0(ov), cfg);
  const op = WA.probe.open('谁偷了账本', [{ id: 'h0', text: '甲' }, { id: 'h1', text: '乙' }]);
  const cid = op.id;
  const EB = WA.evidenceBoard;
  EB.assertClaim(cid, '甲夜里进过库房', { level: 'witness', dir: 'support', about: 'h0', by: '丙' });
  EB.assertClaim(cid, '有人看见乙', { level: 'rumor', dir: 'refute', about: 'h1', by: '丁' });
  const reg = WA.investigation.register({ title: '库房脚印', subject: '账本去向', witness: '更夫', location: '库房', cost: 1, costType: 'time' });
  WA.rumor.startChain('账本去向', '初见');
  return { WA: WA, EB: EB, cid: cid, clueId: reg.id };
}
function snap(WA) { return JSON.stringify(WA.store.get()); }
// ═══════════════════════ A 段：静态契约与真消费方 ═══════════════════════
function runA(a) {
  const S = rd(REL);
  const code = stripComments(S);
  const body = exportBody(S);
  a(body.length > 0, 'n4/A1: 能从真源码取出 WA.evidenceBoard 的对象字面量体');
  ['board', 'assertClaim', 'retract', 'gather', 'playerView', 'diagnose', 'stat'].forEach(function (m) {
    a(body.indexOf(m + ':') > 0, 'n4/A2: 导出面含 ' + m);
  });
  // 五类边词表与 fault 命名空间（逐字）
  a(/const EDGE_TYPES = \['support', 'refute', 'chain', 'witness', 'action'\];/.test(S),
    'n4/A3: 五类边词表逐字在位');
  a(/const FAULTS = \['board-off', 'bad-case', 'module-missing', 'bad-target'\];/.test(S),
    'n4/A4: fault 命名空间只装编排层自身能产生的失败（4 码）');
  a(/const DEF = \{ enabled: false, maxEdges: 40, maxCases: 6 \};/.test(S),
    'n4/A5: 设置默认值逐字在位（默认关）');
  a(/bounds: \{ maxEdges: \[4, 96\], maxCases: \[1, 16\] \}/.test(S),
    'n4/A6: 区间声明逐字在位（上界有界）');
  // 逐口接真源（一次判定都不复制）
  a(code.indexOf('probe.tally(') >= 0, 'n4/A7: 支持/反驳条数只问 probe.tally（不重数）');
  a(code.indexOf('probe.addEvidence(') >= 0 && cnt(code, 'const LEVELS') === 0,
    'n4/A8: 记主张原样转发 probe.addEvidence（且**不自带等级表副本**）');
  a(code.indexOf('investigation.investigate(') >= 0, 'n4/A9: 调查动作原样转发 investigation.investigate');
  a(code.indexOf('rumor.refute(') >= 0 && code.indexOf('intel.correct(') >= 0 && code.indexOf('probe.wrong(') >= 0,
    'n4/A10: 撤回按 kind 转发三个来源写口（refute / correct / wrong）');
  a(code.indexOf('intel.project(') >= 0, 'n4/A11: 玩家图谱真值取 intel.project 读数');
  a(code.indexOf('noesis.knows(') >= 0, 'n4/A12: 玩家图谱知情取 noesis.knows 三态');
  a(code.indexOf('rumor.visibleTo(') >= 0, 'n4/A13: 玩家图谱 heard 取 rumor.visibleTo（只收公开层）');
  // 零写入面（不另存第二份真相）
  a(cnt(code, 'WA.store.transact') === 0,
    'n4/A14: 全文零 store.transact（不另存第二份卷宗/图谱；实 ' + cnt(code, 'WA.store.transact') + '）');
  a(code.indexOf('draft') < 0, 'n4/A15: 全文零 draft 赋值');
  // 预览作废只有一份判据（stampFrom）
  a(/function stampFrom\(/.test(S), 'n4/A16: stampFrom 在位（预览作废只有一份判据）');
  // 面板真消费方（无消费方不挂导出）
  const pan = rd(PANEL_REL);
  ['board', 'playerView', 'assertClaim', 'retract', 'gather'].forEach(function (m) {
    a(pan.indexOf('WA.evidenceBoard.' + m + '(') >= 0, 'n4/A17: 面板真调 WA.evidenceBoard.' + m + '()');
  });
  ['wa-evb-enabled', 'wa-evb-case', 'wa-evb-person', 'wa-evb-facts', 'wa-evb-board', 'wa-evb-view',
    'wa-evb-dia', 'wa-evb-claim', 'wa-evb-level', 'wa-evb-dir', 'wa-evb-assert', 'wa-evb-kind',
    'wa-evb-target', 'wa-evb-from', 'wa-evb-to', 'wa-evb-retract', 'wa-evb-clue', 'wa-evb-by',
    'wa-evb-receipt', 'wa-evb-gather', 'wa-evb-out'].forEach(function (id) {
      a(pan.indexOf(id) >= 0, 'n4/A18: 面板控件 ' + id + ' 在位');
    });
  // 守卫表登记（渲染 + 绑定 + 守卫三件齐）
  const diag = rd('engines/tool-diag.js');
  a(diag.indexOf("'wa-evb-board'") >= 0, 'n4/A19: 守卫表登记新控件');
  a(diag.indexOf("'engines/evidence-board.js': 'evidenceBoard'") >= 0,
    'n4/A20: 模块登记表登记（LOAD 进了不等于登记了）');
  // 版本面：模块自报 ver = 本模块**最后一次交付**的版本（不固定跟随 index）。
  //   沿革：本锁交付于 N4（2.222.0）；模块 registerModule 用 `ver: VERSION`（常量引用而非字面量），
  //   故判据钉模块源码里的 `const VERSION`，与 e8/n5/n3 同款（index 升版不应拖动未变模块）。
  const mv = (rd(IDX_REL).match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  a(/const VERSION = '2\.222\.0'/.test(S), 'n4/A21: 模块自报 ver === 本模块交付版本 2.222.0');
  a(mv === JSON.parse(rd('manifest.json')).version, 'n4/A21b: 入口与清单同源同值（实 ' + mv + '）');
  a(rd(RUN_REL).indexOf('|evidenceBoard:') >= 0, 'n4/A22: FROZEN2800 的出口面契约含 evidenceBoard 段');
  a(rd(IDX_REL).indexOf("'engines/evidence-board.js'") >= 0, 'n4/A23: index.js LOAD_ORDER 含本模块');
  a(rd(RUN_REL).indexOf("'engines/evidence-board.js'") >= 0, 'n4/A24: tests/run.js 装载表含本模块（专锁按它装载）');
  // 设置键名（走 settingsBus 单一真源，不是世界事实）
  a(/const LS_KEY = 'worldaxis_evidence_board_settings_v1';/.test(S),
    'n4/A25: 设置键名逐字在位（同一格偏好键，按本仓先例走 settingsBus）');
}
// ═══════════════════════ B 段：五口行为 ═══════════════════════
function runB(a) {
  const S = mk();
  const b = S.EB.board(S.cid, { facts: FA });
  a(b.ok === true && b.edgeCount === 7 && b.truncated === false,
    'n4/B1: 基线证据图 7 条边（实 ' + j([b.ok, b.edgeCount, b.truncated]) + '）');
  a(b.byType.support === 1 && b.byType.refute === 1 && b.byType.chain === 2
    && b.byType.witness === 1 && b.byType.action === 2,
    'n4/B2: 五类边各就各位（实 ' + j(b.byType) + '）');
  // 同一 factKey 上两条链只算**一条**独立证据（其余如实标 relayed 并给出它转的是谁的）
  a(b.independent === 6 && b.relayed === 1,
    'n4/B3: 重复转述不作独立证据（ind 6 / rel 1；实 ' + j([b.independent, b.relayed]) + '）');
  const dup = b.edges.filter(function (r) { return r.relayed === true; })[0];
  a(dup && dup.type === 'chain' && dup.relays === 'chain:' + dup.chainId && dup.why.length > 0,
    'n4/B4: 转述行如实给出它转的是谁（实 ' + j(dup && [dup.chainId, dup.relays]) + '）');
  // stamp 含**每条边的可观测读数**（不只是类型与来源位）：链带层/完整位/跳数，证人带 who，动作带线索态
  a(b.stamp.indexOf('v2|') === 0 && b.stamp.indexOf(':fact/i/0') >= 0
    && b.stamp.indexOf('@更夫') >= 0 && b.stamp.indexOf('@discoverable') >= 0,
    'n4/B5: stamp 含各边读数（链 fact/i/0、证人 @更夫、动作 @discoverable；实 ' + b.stamp + '）');
  // 链边**方向一律空**（替世界声明方向就是替世界下结论）；链单列 chains，不算支持也不算反证
  const chs = b.edges.filter(function (r) { return r.type === 'chain'; });
  a(chs.length === 2 && chs.every(function (r) { return r.dir === ''; }),
    'n4/B6: 链边方向一律空（不替世界声明方向）');
  const r0 = b.ranks.filter(function (x) { return x.hypothesis === 'h0'; })[0];
  const r1 = b.ranks.filter(function (x) { return x.hypothesis === 'h1'; })[0];
  a(r0.chains === 1 && r1.chains === 0,
    'n4/B7: 独立链只计到它声明的那个假说上（h0 1 / h1 0；实 ' + j([r0.chains, r1.chains]) + '）');
  // 支持/反驳条数取自 probe（不重算）：不经本模块直接给 probe 加一条，读数必须跟着动
  const W6 = mk();
  const b60 = W6.EB.board(W6.cid, { facts: FA });
  W6.WA.probe.addEvidence(W6.cid, '丁也看见甲', { level: 'witness', dir: 'support', about: 'h0', by: '丁' });
  const b61 = W6.EB.board(W6.cid, { facts: FA });
  const s0 = b60.ranks.filter(function (x) { return x.hypothesis === 'h0'; })[0];
  const s1 = b61.ranks.filter(function (x) { return x.hypothesis === 'h0'; })[0];
  a(s1.support === s0.support + 1,
    'n4/B8: 支持条数跟随来源（probe 直加一条 ⇒ h0 support +1；实 ' + j([s0.support, s1.support]) + '）');
  // facts 不给 ⇒ 只出支持/反驳两类，并如实标 factsGiven:false（不猜）
  //   注：本仓的 fresh() 复用同一个 vm 上下文（`global`），故 WA 是**同一个对象**、
  //   世界在新 env 里被重建 —— 每一组断言必须用它**自己刚建的那个 env**，
  //   不能拿早先的 env 回来再问（它的案子早被后来的 seed 清掉了）。
  const Sb = mk();
  const b0 = Sb.EB.board(Sb.cid);
  a(b0.factsGiven === false && b0.edgeCount === 2 && b0.byType.chain === 0 && b0.byType.witness === 0
    && b0.byType.action === 0,
    'n4/B9: 不给 facts 则不出链/证人/动作三类边，并如实标 factsGiven:false（实 ' + j([b0.factsGiven, b0.edgeCount]) + '）');
  a(b0.ranks.length === 2 && b0.ranks.every(function (x) { return x.chains === 0; }),
    'n4/B9b: facts 缺省时链栏一律 0（不猜事实锚点）');
  // bad-case
  a(Sb.EB.board('查无此案').fault === 'bad-case', 'n4/B10: 案号查无此案 ⇒ bad-case');
  // 截断如实报：maxEdges 4 ⇒ 只出 4 条且 truncated:true（不静默超额）
  const W7 = mk(null, { maxEdges: 4 });
  const bt = W7.EB.board(W7.cid, { facts: FA });
  a(bt.edgeCount === 4 && bt.truncated === true,
    'n4/B11: 超上限如实截断（4 条 + truncated:true；实 ' + j([bt.edgeCount, bt.truncated]) + '）');
  // 全关 ⇒ 五口一律 board-off（全关即零存在）
  const W8 = mk(null, { enabled: false });
  a(W8.EB.board(W8.cid, { facts: FA }).fault === 'board-off', 'n4/B12: 全关 ⇒ board 拒 board-off');
  a(W8.EB.playerView(W8.cid, { person: '甲' }).fault === 'board-off', 'n4/B13: 全关 ⇒ playerView 拒 board-off');
  a(W8.EB.assertClaim(W8.cid, 'x', {}).fault === 'board-off', 'n4/B14: 全关 ⇒ assertClaim 拒 board-off');
  a(W8.EB.retract(W8.cid, { kind: 'probe', who: '甲' }).fault === 'board-off', 'n4/B15: 全关 ⇒ retract 拒 board-off');
  a(W8.EB.gather(W8.cid, { clueId: 'a', by: 'b' }).fault === 'board-off', 'n4/B16: 全关 ⇒ gather 拒 board-off');
  // 玩家图谱：无资格者**连「猜没猜对」都不泄露**
  const Sp = mk();
  const pv = Sp.EB.playerView(Sp.cid, { person: '乙', facts: { h0: '账本去向' } });
  a(pv.ok === true && pv.rowCount === 1 && pv.known === 0 && pv.withheld === 0,
    'n4/B17: 无资格者 known 0 / withheld 0（实 ' + j([pv.rowCount, pv.known, pv.withheld]) + '）');
  const pr = pv.rows[0];
  a(pr.factKey === '账本去向' && pr.entitled === false && pr.truth === null && pr.mayAssert === false,
    'n4/B18: 无资格者 entitled:false + truth 恒 null + mayAssert:false（实 ' + j(pr) + '）');
  // 有资格者：真值现身（走 intel.project 读数）
  const W9 = mk();
  W9.WA.intel.addIntel('甲', { about: '账本去向', claim: '甲', level: 'record', source: '官' });
  const pv2 = W9.EB.playerView(W9.cid, { person: '甲', facts: { h0: '账本去向' } });
  const pr2 = pv2.rows[0];
  a(pr2.entitled === true && pr2.truth === '甲' && pv2.known === 1 && pr2.mayAssert === true,
    'n4/B19: 有资格者真值现身（走 intel.project；实 ' + j([pr2.truth, pv2.known]) + '）');
  // 缺 person ⇒ 拒（这一格是本模块自己的调用契约）
  a(W9.EB.playerView(W9.cid, { facts: FA }).fault === 'bad-target', 'n4/B20: 缺 person ⇒ bad-target');
  // gather 透传 + 去重
  const Sg = mk();
  const g = Sg.EB.gather(Sg.cid, { clueId: Sg.clueId, by: '更夫', receiptId: 'rc1' });
  a(g.ok === true && typeof g.evidenceId === 'string',
    'n4/B21: 调查动作真落账（回执带 evidenceId；实 ' + j(Object.keys(g)) + '）');
  const g2 = Sg.EB.gather(Sg.cid, { clueId: Sg.clueId, by: '更夫', receiptId: 'rc1' });
  a(g2.ok === false && g2.reason === 'duplicate-receipt',
    'n4/B22: 同一 receiptId 去重（来源拒收原样透传；实 ' + j(g2.reason) + '）');
  // 缺 clueId / by ⇒ 本模块自己拒（不做参数校验指**不替来源校验**，自己的调用契约仍要守）
  a(Sg.EB.gather(Sg.cid, { by: '甲' }).fault === 'bad-target', 'n4/B23: gather 缺 clueId ⇒ bad-target');
}
// ═══════════════════════ C 段：透传与三面 ═══════════════════════
function runC(a) {
  // assertClaim：来源回执**原样**交回（本模块不改写它的 reason、不补自己的码）
  const S = mk();
  const acc = S.EB.assertClaim(S.cid, '丙看见甲翻箱子', { level: 'witness', dir: 'support', about: 'h0', by: '丙' });
  a(acc.ok === true && acc.id !== undefined, 'n4/C1: 记主张成功回执来自 probe.addEvidence（实 ' + j(Object.keys(acc)) + '）');
  const rejLevel = S.EB.assertClaim(S.cid, 'x', { dir: 'support', about: 'h0', by: '丙' });
  a(rejLevel.ok === false && (rejLevel.fault === undefined) && typeof rejLevel.reason === 'string',
    'n4/C2: 来源拒收**不占 fault 命名空间**（无 fault 字段，reason 来自来源；实 ' + j(rejLevel).slice(0, 120) + '）');
  // retract 三面语义：三件不同的事，混成一句话就是谎报
  const W1 = mk();
  const b1 = W1.EB.board(W1.cid, { facts: FA });
  const rRumor = W1.EB.retract(W1.cid, { kind: 'rumor', chainId: 'rm_账本去向', from: '更夫', to: '丙', stamp: b1.stamp, facts: FA });
  a(rRumor.ok === true && rRumor.via === 'rumor.refute' && rRumor.retract.ok === true,
    'n4/C3: rumor 撤回走 rumor.refute（实 ' + j([rRumor.via, rRumor.retract && rRumor.retract.ok]) + '）');
  a(rRumor.drift === true && rRumor.edgeFrom === rRumor.edgeTo,
    'n4/C4: 辟谣一跳**不改边数**但改读数（drift:true 且 edgeFrom===edgeTo；实 ' + j([rRumor.drift, rRumor.edgeFrom, rRumor.edgeTo]) + '）');
  a(rRumor.stale === true && rRumor.was === b1.stamp && rRumor.stamp !== b1.stamp,
    'n4/C5: 回带旧 stamp ⇒ stale:true（世界动了，旧预览作废）');
  a(typeof rRumor.semantics === 'string' && rRumor.semantics.indexOf('链不被删除') >= 0,
    'n4/C6: semantics 如实说明「链不被删除」（实 ' + rRumor.semantics + '）');
  const W2 = mk();
  const b2 = W2.EB.board(W2.cid, { facts: FA });
  const rProbe = W2.EB.retract(W2.cid, { kind: 'probe', who: '甲', why: '误指', stamp: b2.stamp, facts: FA });
  a(rProbe.via === 'probe.wrong' && rProbe.statusFrom === 'open' && rProbe.statusTo === 'closed'
    && rProbe.verdictFrom === '' && rProbe.verdictTo === 'clear' && rProbe.headChanged === true,
    'n4/C7: probe 撤回是误指留痕并结案（status/verdict 变、headChanged:true；实 '
    + j([rProbe.statusFrom, rProbe.statusTo, rProbe.verdictTo]) + '）');
  a(rProbe.drift === false && rProbe.edgeFrom === rProbe.edgeTo,
    'n4/C8: 误指**不改举证行**（图谱指纹不动：drift:false；实 ' + j([rProbe.drift, rProbe.edgeTo]) + '）');
  const W3 = mk();
  const rIntel = W3.EB.retract(W3.cid, { kind: 'intel', person2: '乙', about: '账本去向', claim: '甲', right: '丙', source: '官', facts: FA });
  a(rIntel.via === 'intel.correct' && rIntel.retract.ok === false && rIntel.retract.reason === 'nothing-to-correct',
    'n4/C9: intel 撤回只对**已收到该说法者**生效（未收到 ⇒ nothing-to-correct；实 ' + j(rIntel.retract) + '）');
  a(rIntel.stale === false && rIntel.drift === false && rIntel.note.indexOf('没影响到这里') >= 0,
    'n4/C10: 未影响到这里就如实报（stale:false + 明说「不假装有变化」）');
  // viewChanged：无 person ⇒ null（不猜）
  const W4 = mk();
  const rNoPerson = W4.EB.retract(W4.cid, { kind: 'probe', who: '甲', why: 'x' });
  a(rNoPerson.viewChanged === null, 'n4/C11: 没给 person ⇒ viewChanged:null（不猜）');
  // affected：逐假说的支持/反驳差（取自 probe）
  const W5 = mk();
  const b5 = W5.EB.board(W5.cid, { facts: FA });
  a(Array.isArray(b5.ranks) && b5.ranks.length === 2
    && typeof b5.ranks[0].support === 'number' && typeof b5.ranks[0].refute === 'number',
    'n4/C12: ranks 逐假说给出支持/反驳（取自 probe.tally）');
  // bad-target 三种：kind 不认识 / rumor 缺 chainId / intel 缺参数
  const Sm = mk();
  a(Sm.EB.retract(Sm.cid, { kind: 'zzz' }).fault === 'bad-target', 'n4/C13: kind 不认识 ⇒ bad-target');
  const kk = Sm.EB.retract(Sm.cid, { kind: 'zzz' });
  a(kk.known && kk.known.length === 3 && kk.known.indexOf('rumor') >= 0,
    'n4/C14: bad-target 带可选 kind 表（不静默）');
  a(Sm.EB.retract(Sm.cid, { kind: 'rumor' }).fault === 'bad-target', 'n4/C15: rumor 缺 chainId ⇒ bad-target');
  const noArgs = Sm.EB.retract(Sm.cid, { kind: 'intel' });
  a(noArgs.fault === 'bad-target' && noArgs.need && noArgs.need.length === 3,
    'n4/C16: intel 缺三参 ⇒ bad-target 且列明缺哪些（实 ' + j(noArgs.need) + '）');
  // 编排层失败码 vs 来源拒收码**分列**：来源的 reason 不进本命名空间
  const FAULTSET = ['board-off', 'bad-case', 'module-missing', 'bad-target'];
  const srcRej = Sm.EB.assertClaim(Sm.cid, 'x', { dir: 'support', about: 'h0', by: '丙' });
  const srcRej2 = Sm.EB.gather(Sm.cid, { clueId: 'zzz', by: '甲', receiptId: 'rc7' });
  a(srcRej.ok === false && FAULTSET.indexOf(srcRej.reason) < 0
    && srcRej2.ok === false && FAULTSET.indexOf(srcRej2.reason) < 0,
    'n4/C17: 来源拒收码一律不落进 fault 命名空间（两套码分列；实 '
    + j([srcRej.reason, srcRej2.reason]) + '）');
  // 来源抛错时本模块**仍然自己**给出 fault 之前的分支：来源缺席 ⇒ module-missing
  const Wm = mk();
  const keepProbe = Wm.WA.probe;
  Wm.WA.probe = undefined;
  a(Wm.EB.assertClaim(Wm.cid, 'x', { level: 'witness', dir: 'support', about: 'h0', by: '丙' }).fault === 'module-missing',
    'n4/C18: 来源缺席 ⇒ module-missing（本模块不改写来源的 reason，但自己的失败另开码）');
  Wm.WA.probe = keepProbe;
}
// ═══════════════════════ D 段：零写入不变式与分栏计数 ═══════════════════════
function runD(a) {
  const S = mk();
  // ① 四只读口零写入：board / playerView / retract（撤回目标不存在 ⇒ 来源拒、世界不动）/ gather（同上）
  const before = snap(S.WA);
  S.EB.board(S.cid, { facts: FA });
  S.EB.playerView(S.cid, { person: '甲', facts: FA });
  S.EB.retract(S.cid, { kind: 'rumor', chainId: 'chain-x', from: 'a', to: 'b', facts: FA });
  S.EB.gather(S.cid, { clueId: 'zzz', by: 'a', receiptId: 'r9' });
  a(snap(S.WA) === before, 'n4/D1: board / playerView / 未命中撤回 / 未命中调查 四路零写入（逐字节同）');
  // ② 设置只经 settingsBus 单一真源
  a(S.WA.store.get()['worldaxis_evidence_board_settings_v1'] === undefined,
    'n4/D2: 设置**不落 store**（走 settingsBus 键）');
  // ③ 越界夹回
  S.EB.setSettings({ maxEdges: 999 });
  a(S.EB.getSettings().maxEdges === 96, 'n4/D3: maxEdges 越界夹回 96');
  S.EB.setSettings({ maxCases: 0 });
  a(S.EB.getSettings().maxCases === 1, 'n4/D4: maxCases 下界夹回 1');
  S.EB.setSettings({ maxEdges: 40, maxCases: 6 });
  // ④ 预览是进程态交互物：存档里没有 stamp 键
  const b = S.EB.board(S.cid, { facts: FA });
  a(typeof b.stamp === 'string' && snap(S.WA).indexOf('stamp') < 0,
    'n4/D5: 图谱 stamp 只在返回体、**不落盘**（进程态交互物）');
  // ⑤ 分栏计数：「共有几条边」与「其中几条只是转述」分列（合成一栏就答不出「几条是独立的」）
  const st = S.EB.stat();
  a(typeof st.edges === 'number' && typeof st.independent === 'number' && typeof st.relayed === 'number'
    && st.edges >= st.independent + st.relayed,
    'n4/D6: edges / independent / relayed 各自成栏（实 ' + j([st.edges, st.independent, st.relayed]) + '）');
  a(typeof st.boards === 'number' && typeof st.asserted === 'number' && typeof st.retracts === 'number'
    && typeof st.gathers === 'number' && typeof st.affected === 'number',
    'n4/D7: 五口各自成栏（boards / asserted / retracts / gathers / affected）');
  // ⑥ rows 只在 playerView 处计数（编排层自己偷看不能算成用户在读）
  const W9 = mk();
  const rows0 = W9.EB.stat().rows;
  W9.EB.retract(W9.cid, { kind: 'probe', who: '甲', why: 'x', person: '甲', facts: FA });
  a(W9.EB.stat().rows === rows0, 'n4/D8: retract 的内部快照**不计数**（stat.rows 不变）');
  W9.EB.playerView(W9.cid, { person: '甲', facts: { h0: '账本去向' } });
  a(W9.EB.stat().rows === rows0 + 1, 'n4/D8b: playerView 才计数（+1）');
  // ⑦ 无 buildBlock（全关即零存在：不产注入块）
  a(typeof S.EB.buildBlock === 'undefined', 'n4/D9: 本模块**没有** buildBlock（全关即零存在）');
  // ⑧ diagnose 自证面
  const d = S.EB.diagnose();
  a(d.ok === true && d.required.length === 3 && d.missing.length === 0
    && d.required.indexOf('probe') >= 0 && d.required.indexOf('investigation') >= 0 && d.required.indexOf('intel') >= 0,
    'n4/D10: diagnose 列明必需三模块且全在位（实 ' + j(d.required) + '）');
  a(d.edgeTypes.declared.length === 5 && d.faultCodes.length === 4,
    'n4/D11: diagnose 自证五类边 + 四码（实 ' + j([d.edgeTypes.declared, d.faultCodes]) + '）');
  // 来源尺子不自带副本：等级表逐字取自 probe
  a(d.levelsFrom === 'probe.LEVELS', 'n4/D12: 等级表来源自证 levelsFrom === probe.LEVELS（不自带副本）');
  a(d.ver === '2.222.0', 'n4/D13: diagnose 自报 ver === 本模块交付版本（实 ' + d.ver + '）');
  // ⑨ 导出面**没有**落地口（边界靠「那个口不存在」实现）
  a(typeof S.EB.save === 'undefined' && typeof S.EB.commit === 'undefined'
    && typeof S.EB.persist === 'undefined' && typeof S.EB.buildBlock === 'undefined',
    'n4/D14: 导出面无 save / commit / persist（不另存第二份真相）');
}
// ═══════════════════════ N 段：真源码破坏 + 两向自证 ═══════════════════════
/** 负控制锚点表（H5：本表内每处锚点字面量只声明一次；判据层不引用这些串）。 */
const ANCHOR = {
  dupGate: "        const dup = !!seenFact[fk] || i > 0;",
  stampRead: "        ? (r.layer + '/' + (r.intact ? 'i' : 't') + '/' + r.hops)",
  entitled: "      const entitled = !!(proj && proj.ok === true && proj.entitled === true);",
  capGate: "    const rows = all.slice(0, Math.max(1, Math.floor(num(cfg.maxEdges) || DEF.maxEdges)));"
};
function broke(key) {
  const s = rd(REL);
  const an = ANCHOR[key];
  const n = cnt(s, an);
  if (n !== 1) throw new Error('破坏锚点【' + key + '】命中 ' + n + ' 次（期望恰好 1）—— 锚点必须是一处唯一的真源码文本');
  let out = null;
  if (key === 'dupGate') out = s.replace(an, '        const dup = false;');
  if (key === 'stampRead') out = s.replace(an, "        ? ''");
  if (key === 'entitled') out = s.replace(an, '      const entitled = true;');
  if (key === 'capGate') out = s.replace(an, '    const rows = all.slice(0);');
  if (out === null || out === s) throw new Error('破坏【' + key + '】没有改变源码文本');
  return out;
}
function runN(a) {
  const SRC = rd(REL);
  // ① 重复转述不作独立证据这条判据被拆 ⇒ 同一条消息被算成两条独立证据
  {
    const src = broke('dupGate');
    a(src !== SRC, 'n4/N1: [破坏1] 去重判据被改成恒假（源码文本变了）');
    const S = mk({ [REL]: src });
    const b = S.EB.board(S.cid, { facts: FA });
    a(!(b.independent === 6 && b.relayed === 1),
      'n4/N1b: [破坏1] 副本上独立/转述分栏失守（实 ' + j([b.independent, b.relayed]) + '）—— 原版那条判据真在起作用');
  }
  // ② stamp 里的可观测读数被抹 ⇒ 「来源变了」成了一条只在边数增减时才亮的灯
  {
    const src = broke('stampRead');
    a(src !== SRC, 'n4/N2: [破坏2] stamp 读数段被清空（源码文本变了）');
    const S = mk({ [REL]: src });
    const b = S.EB.board(S.cid, { facts: FA });
    const r = S.EB.retract(S.cid, { kind: 'rumor', chainId: 'rm_账本去向', from: '更夫', to: '丙', stamp: b.stamp, facts: FA });
    a(!(r.drift === true), 'n4/N2b: [破坏2] 副本上辟谣一跳不再被判为读数变化（drift 实 ' + j(r.drift) + '）—— 原版能判出来');
  }
  // ③ 资格校验被拆 ⇒ 无资格者的真值漏出玩家图谱
  {
    const src = broke('entitled');
    a(src !== SRC, 'n4/N3: [破坏3] 资格校验被改成恒真（源码文本变了）');
    const S = mk({ [REL]: src });
    const pv = S.EB.playerView(S.cid, { person: '乙', facts: { h0: '账本去向' } });
    a(!(pv.rows[0].entitled === false), 'n4/N3b: [破坏3] 副本上无资格者被标成有资格（实 '
      + j(pv.rows[0].entitled) + '）—— 原版能拦住');
  }
  // ④ 条数上限判据被拆 ⇒ 超上限不截断、也不如实报 truncated（不静默超额这条失守）
  {
    const src = broke('capGate');
    a(src !== SRC, 'n4/N4: [破坏4] 条数上限判据被拆（源码文本变了）');
    const S = mk({ [REL]: src }, { maxEdges: 4 });
    const b = S.EB.board(S.cid, { facts: FA });
    a(!(b.edgeCount === 4 && b.truncated === true),
      'n4/N4b: [破坏4] 副本上超上限不再截断（实 ' + j([b.edgeCount, b.truncated]) + '）—— 原版能拦住');
  }
  // 纯度：原版上同款判据必须真（H6 第二向）
  const W0 = mk();
  const b0 = W0.EB.board(W0.cid, { facts: FA });
  a(b0.independent === 6 && b0.relayed === 1, 'n4/Nb1: （纯度）原版上去重判据真在起作用');
  const W1 = mk();
  const b1 = W1.EB.board(W1.cid, { facts: FA });
  const r1 = W1.EB.retract(W1.cid, { kind: 'rumor', chainId: 'rm_账本去向', from: '更夫', to: '丙', stamp: b1.stamp, facts: FA });
  a(r1.drift === true, 'n4/Nb2: （纯度）原版上辟谣一跳 ⇒ drift:true');
  const W2 = mk();
  a(W2.EB.playerView(W2.cid, { person: '乙', facts: { h0: '账本去向' } }).rows[0].entitled === false,
    'n4/Nb3: （纯度）原版上无资格者 entitled:false');
  const W3 = mk(null, { maxEdges: 4 });
  const b3 = W3.EB.board(W3.cid, { facts: FA });
  a(b3.edgeCount === 4 && b3.truncated === true, 'n4/Nb4: （纯度）原版上超上限 ⇒ 截断且如实报');
  a(SRC.length > 20000, 'n4/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
  a(cnt(rd(REL), ANCHOR.dupGate) === 1 && cnt(rd(REL), ANCHOR.stampRead) === 1
    && cnt(rd(REL), ANCHOR.entitled) === 1 && cnt(rd(REL), ANCHOR.capGate) === 1,
    'n4/Nd: 负控制全程未改真源码（四处锚点在收尾复核时仍各在原位恰 1 次）');
}
function mkA(report) { return function (ok, name) { report.total++; if (ok) report.pass++; else { report.fail++; console.log('FAIL ' + name); } }; }
function main() {
  const report = { total: 0, pass: 0, fail: 0 };
  const a = mkA(report);
  runA(a); runB(a); runC(a); runD(a); runN(a);
  console.log('N4 s3-b3-n4-v2222 ' + report.pass + ' / 失败 ' + report.fail);
  process.exit(report.fail ? 1 : 0);
}
main();
