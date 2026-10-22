#!/usr/bin/env node
// WorldAxis tests/exp5-contest-v2231.js (v2.231.0) -- EXP-5 专锁：可选规则的对抗场景
//
// 【它治什么（缺口，开工前逐条复核现场）】
//   计划原文：「有目标、参与者、资源、阶段和退出条件的对抗：潜入、追逐、辩论、
//   竞技或战斗。支持**对抗检定、部分成功、代价成功、撤退**；确定结果后由模型叙述
//   表现，而非用正文反向决定所有数值。」
//   验收原文：「追逐中选择抄近路，**付出体力换距离优势**；**部分成功保留代价**；
//   **撤退结束场景并落实位置/资源**；**重新打开面板不重掷已确定的结果**。」
//
//   现场事实（不是静态推测）：
//     · `engines/fate.js` 的 `roll` / `check` / `resolveDC` 答的是**一次**掷骰与一次 DC 对比
//       （`{roll, dc, pass, margin, crit, fumble}`）——答不出「这场追逐跑到第三段、
//       谁领先、还剩多少体力」；
//     · `engines/difficulty.js` 给的是**行动成本与跨度**（resistance/stance/pace/cost/flow）,
//       是「做这件事要花多少」，不是「这件事现在走到哪一步」；
//     · `engines/power-anchor.js` 记**战力区间**（0..5 档），是「这个人大概多强」，
//       不是「这一回合谁占了上风」；
//     · `engines/story-choice.js` 兑现的是**选项与 ops**，结果只有「兑现 / 未兑现」两态
//       ——答不出「部分成功」这种**中间结果**。
//   四者合起来仍缺的那一格：**一次判定 ≠ 一场对抗**。本模块补的就是这一层。
//
// 【本锁咬住的十条否定式边界】
//   · **不建第二套骰子**：掷骰与 DC 解析走 fate（B2/N1）；
//   · **不建第二份名册**：参与方必须已在册（`unknown-side`，B4/N2）；
//   · **不替世界定位置**：全文不写 `world.*`（B9/N9 的正控制里 `world` 一字未改）；
//   · **三档不合并**：success / partial / fail 分列（B3/N3）；
//   · **部分成功保留代价**：partial 行带 `costPending`，代价由 `spend()` 落账（B5/B5b，验收原文）；
//   · **代价不退**：撤退 / 收口都不退还已付资源（B7/B8c/N5，验收原文）；
//   · **不凭空判赢**：零判定就收口 ⇒ `no-verdict`（B8b/N6）；
//   · **撤退结束场景并落实位置/资源**：场景转 withdrawn，回执带已付代价与已走轮数（B7，验收原文）；
//   · **重掷不重放**：同 `(阶段, 轮, 一方)` 已判 ⇒ `stage-resolved`；同 opId 同样拒收（B6/N4/N4b，验收原文）；
//   · **收口后不再收指令**：`scene-closed` 与 `no-such-scene` 分列（C3/N7）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp5-contest-v2231.js';
const CT = 'engines/contest.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 三档分档口（唯一的判档处）：success / partial / fail 不许合并
  band: { rel: CT, txt: "    if (m >= PARTIAL_BAND) return 'success';\n    if (m >= 0) return 'partial';" },
  // ② 部分成功必须带代价标记（没记代价就是白拿）
  partialFlag: { rel: CT, txt: "costPending: outcome === 'partial', at: now };" },
  // ③ 重掷闸（位置判据）：这一格已经判过了
  reRollGate: { rel: CT, txt: "    const dup = rollAt(sc.id, stageName, round, who);\n    if (dup) {" },
  // ④ 代价先判后扣（不够就一克都不动）
  costGate: { rel: CT, txt: "      if (haveOf(pur, material) < amount) {\n        out = { ok: false, reason: 'short-cost', side: who, material: material," },
  // ⑤ 参与方必须已在册（不建第二份名册）
  sideGate: { rel: CT, txt: "      if (!personExists(who)) return refuse('unknown-side', { who: who });" },
  // ⑥ 不凭空判赢：零判定不收口
  noVerdictGate: { rel: CT, txt: "    if (!mine.length) {\n      return refuse('no-verdict', { scene: sc.id," },
  // ⑦ 撤退结束场景（转 withdrawn，不留在 open）
  withdrawClose: { rel: CT, txt: "      row.status = 'withdrawn';\n      row.outcome = 'withdrawn';" },
  // ⑧ 场景收口闸（纵深两层：外层前置闸 + 事务内闸，这里取事务内那一层）
  // ⑨ 收口闸（**外层**：函数体入口。内层在 transact 里，见 closedGateIn）
  closedGate: { rel: CT, txt: "    if (!sc) return refuse('no-such-scene', { id: clean(id, 60) });\n    if (OPEN_SCENE.indexOf(clean(sc.status, 12)) < 0) return refuse('scene-closed', { id: sc.id, status: sc.status });\n    const name = clean(s.name, 40);" },
  // ⑨b 收口闸（**内层**：transact 内的 row 层，与阶段满闸同处）
  closedGateIn: { rel: CT, txt: "      if (OPEN_SCENE.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }\n      if (row.stages.length >= cfg.maxStages) {" },
  // ⑨ 注入第一道闸：无观察者 ⇒ 零 token
  viewerGate: { rel: CT, txt: "    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版战报）" },
  // ⑩ 注入第二道闸：没参与任何一场 ⇒ 仍是零 token（纵深防御）
  memberGate: { rel: CT, txt: "    if (!all.length) return '';   // 没参与任何一场 ⇒ 仍是零 token" }
};
const EXPORTS = ['KINDS', 'STATUSES', 'OUTCOMES', 'PARTIAL_BAND', 'getSettings', 'setSettings',
  'open', 'stageAdd', 'stageResolve', 'spend', 'advanceRound', 'withdraw', 'close',
  'sceneOf', 'stageOf', 'rolls', 'advantageOf', 'outcomeOf', 'list', 'reload', 'view',
  'buildBlock', 'stat', 'resetStat', 'reset'];

/** 夹具：两个人（各 3 点 stamina）+ 空的对抗面（自己 seed、自己收）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { stamina: 3 }, updatedAt: 1 };
    d.people['p_乙'] = { id: 'p_乙', name: '乙', resources: { stamina: 3 }, updatedAt: 1 };
    d.contest = { scenes: [], rolls: [] };
    return true;
  }, 'exp5:seed');
}
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.contest.setSettings({ enabled: true, maxScenes: 24, maxStages: 12, maxRounds: 20, maxRolls: 240, viewer: '' });
  return env;
}
/** 开一场两人的对抗（默认追逐）。 */
function openScene(W, opts) {
  const o = opts || {};
  return W.contest.open({ kind: o.kind || 'chase', title: o.title || '抄近路',
    sides: o.sides || ['甲', '乙'], rounds: o.rounds === undefined ? 3 : o.rounds });
}
// 三档的**确定性**骰式（不靠概率撞档，判据必须每次都咬得住）：
//   SURE '1d4+5' + dc 0 ⇒ margin ∈ [6,9] ⊂ [5,∞) ⇒ 必为 success
//   EDGE '1d4'   + dc 0 ⇒ margin ∈ [1,4] ⊂ [0,5) ⇒ 必为 partial
//   dc 999              ⇒ margin ≤ −979         ⇒ 必为 fail
const SURE = '1d4+5';
const EDGE = '1d4';
/** 声明一个阶段（默认 dc 0；expr 缺省 1d20）。 */
function withStage(W, id, name, dc, expr) {
  return W.contest.stageAdd(id, { name: name || '起手', expr: expr || '1d20', dc: dc === undefined ? 0 : dc });
}
/** 造一个「确定是某档」的判定（expr 传入即覆盖阶段上的骰式）。 */
function resolveSure(W, id, stage, side, dc, round, expr) {
  const spec = { stage: stage, side: side, dc: dc, round: round };
  if (expr) spec.expr = expr;
  return W.contest.stageResolve(id, spec);
}

async function runAll(a, ov) {
  ov = ov || {};
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, CT)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/contest.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('index.js', ov).indexOf("'engines/contest.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/contest.js': 'contest'") > 0, 'A3: tool-diag 声明表已登记');
  a(rd('engines/tool-diag.js', ov).indexOf('contest: secContest()') > 0
    && rd('engines/tool-diag.js', ov).indexOf('function secContest()') > 0,
    'A3b: 诊断面单列一节（与 fate 分列：那一节答「这一掷是多少」，本节答「这场对抗走到哪一步」）');
  (function () {
    a(rd('core/store.js', ov).indexOf('contest: { scenes: [], rolls: [] }') > 0,
      'A4: 骨架已物化（登记不等于物化）');
    a(rd('core/evict.js', ov).indexOf("'contest.scenes'") > 0
      && rd('core/evict.js', ov).indexOf("'contest.rolls'") > 0,
      'A4b: 挤出站点已登记（scenes / rolls 两处）');
  })();
  (function () {
    const I = rd('render/inject.js', ov);
    a(I.indexOf("'contest'") > 0 && I.indexOf('contest: true') > 0,
      'A5: 注入源已进 SOURCES 与默认可见表（只加源表不加分支 = 声明了没人消费）');
    a(I.indexOf('WA.contest.buildBlock()') > 0,
      'A5b: 注入分支真消费 buildBlock（只加分支不加源表 = 开关点了零效果）');
    a(I.indexOf("contest: 'worldaxis_contest_settings_v1'") > 0,
      'A5c: 模块开关表已登记（不登记 ⇒ moduleEnabled 返回 null，勾了总开关却说「模块没加载」）');
    a(rd('ui/panel.js', ov).indexOf("contest: '对抗场景'") > 0,
      'A5d: 面板显示名已登记（否则用户在开关面板上看到英文键名）');
  })();
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A6: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A7: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  (function () {
    const e0 = envWith(ov);
    const miss = EXPORTS.filter(function (k) { return e0.WA.contest[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 开关
  (function () {
    const W = envWith(ov).WA;
    W.contest.setSettings({ enabled: false });
    a(W.contest.open({ kind: 'chase', sides: ['甲', '乙'] }).reason === 'disabled',
      'B1: 关着时开场拒收 disabled（显式启用）');
    a(W.contest.stageResolve('ct_x', { stage: 's', side: '甲' }).reason === 'disabled',
      'B1b: 关着时判定拒收 disabled');
    a(W.contest.buildBlock() === '', 'B1c: 关着时不产注入块');
    W.contest.setSettings({ enabled: true });
  })();
  // B2 不建第二套骰子：走 fate.check，且 fate 缺席时如实报 dice-missing
  (function () {
    const W = envWith(ov).WA;
    a(typeof W.fate.check === 'function', 'B2: 前置对照 —— fate.check 在场（本模块复用它）');
    const s = openScene(W);
    a(s.ok === true, 'B2b: 场景开出来了（前置）');
    withStage(W, s.id, '起手', 0);
    const r = resolveSure(W, s.id, '起手', '甲', 0);
    a(r.ok === true && typeof r.roll === 'number' && typeof r.dc === 'number',
      'B2c: 判定回执带 fate 给的 roll / dc（不是本模块自己造的数列，实 roll=' + (r && r.roll) + ' dc=' + (r && r.dc) + '）');
    a(r.expr === '1d20', 'B2d: 骰式由 fate 解析并回显（实 ' + (r && r.expr) + '）');
  })();
  // B3 三档结果：success / partial / fail 分列（不合并）
  (function () {
    const W = envWith(ov).WA;
    a(W.contest.OUTCOMES.join(',') === 'success,partial,fail',
      'B3: 三档是封闭集（实 ' + W.contest.OUTCOMES.join(',') + '）—— 「部分成功」既不是成功也不是失败');
    const s = openScene(W);
    withStage(W, s.id, '起手', 0, SURE);
    const pass = resolveSure(W, s.id, '起手', '甲', 0, 1, SURE);
    a(pass.ok === true && pass.outcome === 'success' && pass.margin >= W.contest.PARTIAL_BAND,
      'B3b: margin ≥ 带宽 ⇒ success（实 ' + (pass && pass.outcome) + ' margin=' + (pass && pass.margin) + '）');
    withStage(W, s.id, '擦边', 0, EDGE);
    const edge = resolveSure(W, s.id, '擦边', '甲', 0, 1, EDGE);
    a(edge.ok === true && edge.outcome === 'partial'
      && edge.margin >= 0 && edge.margin < W.contest.PARTIAL_BAND,
      'B3d: 0 ≤ margin < 带宽 ⇒ partial（实 ' + (edge && edge.outcome) + ' margin=' + (edge && edge.margin) + '）'
        + ' —— 中间那一档真的存在，不是把两档换个说法');
    withStage(W, s.id, '硬关', 999);
    const fail = resolveSure(W, s.id, '硬关', '甲', 999);
    a(fail.ok === true && fail.outcome === 'fail' && fail.margin < 0,
      'B3c: dc 999 ⇒ margin < 0 ⇒ fail（实 ' + (fail && fail.outcome) + '）');
  })();
  // B4 参与方必须已在册（不建第二份名册）
  (function () {
    const W = envWith(ov).WA;
    a(openScene(W, { sides: ['甲', '查无此人'] }).reason === 'unknown-side',
      'B4: 参与方不在名册 ⇒ unknown-side（不建第二份名册）');
    a(openScene(W, { sides: ['甲'] }).reason === 'no-participants',
      'B4b: 只有一方 ⇒ no-participants（对抗的定义就是有对手）');
    a(openScene(W, { sides: ['甲', '乙'], rounds: 0 }).reason === 'bad-rounds',
      'B4c: 轮数非法 ⇒ bad-rounds');
  })();
  // B5 部分成功保留代价（验收原文）
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    withStage(W, s.id, '抄近路', 0, SURE);
    const r = resolveSure(W, s.id, '抄近路', '甲', 0, 1, SURE);
    a(r.ok === true && r.outcome === 'success',
      'B5: 前置 —— 一次干净成功（实 ' + (r && r.outcome) + '）');
    // 部分成功：margin 落在 [0, PARTIAL_BAND) —— 用 EDGE 骰式确定性构造，不靠概率撞档
    const W2 = envWith(ov).WA;
    const s2 = openScene(W2);
    withStage(W2, s2.id, '擦边', 0, EDGE);
    const rr = W2.contest.stageResolve(s2.id, { stage: '擦边', side: '甲', dc: 0, round: 1 });
    a(rr.ok === true && rr.outcome === 'partial',
      'B5b: 判定落在中间那一档（实 ' + (rr && rr.outcome) + ' margin=' + (rr && rr.margin) + '）');
    const band = W2.contest.PARTIAL_BAND;
    a(typeof band === 'number' && band > 0,
      'B5c: 部分成功带宽是常量（实 ' + band + '）—— margin ∈ [0,' + band + ') ⇒ partial');
    const row = W2.contest.rolls(s2.id)[0];
    a(row && row.costPending === (row.outcome === 'partial'),
      'B5d: 台账行带 costPending 标记，且只在 partial 时为真（实 ' + (row && row.outcome) + '/' + (row && row.costPending) + '）');
  })();
  // B6 重掷不重放（验收原文：重新打开面板不重掷已确定的结果）
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    const first = W.contest.stageResolve(s.id, { stage: '起手', side: '甲', dc: 0, round: 1, opId: 'op_b6' });
    a(first.ok === true && first.opId === undefined, 'B6: 第一次判定成功（带 opId 落账）');
    const again = resolveSure(W, s.id, '起手', '甲', 0, 1);
    a(again.reason === 'stage-resolved',
      'B6b: 同一格再判一次 ⇒ stage-resolved（实 ' + again.reason + '）—— 重新打开面板不重掷');
    a(again.roll === first.roll,
      'B6c: 拒收回执里带出**原来那一掷**（实 ' + again.roll + ' vs ' + first.roll + '）—— 不是重掷后换个说法');
    const rows = W.contest.rolls(s.id);
    a(rows.length === 1, 'B6d: 台账里仍然只有一行（零变化，实 ' + rows.length + ' 行）');
    // opId 判据：换一个格子但同一个 opId 同样拒收
    const op = W.contest.stageResolve(s.id, { stage: '起手', side: '乙', dc: 0, round: 1, opId: 'op_b6' });
    a(op.reason === 'stage-resolved',
      'B6e: 换一方但同一个 opId ⇒ 同样 stage-resolved（实 ' + (op && op.reason) + '，与 events/act 同口径）');
  })();
  // B7 撤退结束场景并落实位置/资源（验收原文）
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    resolveSure(W, s.id, '起手', '甲', 0, 1);
    const paid = W.contest.spend(s.id, { side: '甲', material: 'stamina', amount: 2, gain: 1 });
    a(paid.ok === true && (W.store.get().people['p_甲'].resources || {}).stamina === 1,
      'B7: 抄近路先付体力（3 → ' + (W.store.get().people['p_甲'].resources || {}).stamina + '，实回执 advantage=' + (paid && paid.advantage) + '）');
    const w = W.contest.withdraw(s.id, { side: '甲', why: '不追了' });
    a(w.ok === true && w.status === 'withdrawn' && w.outcome === 'withdrawn',
      'B7b: 撤退把场景收成 withdrawn（实 ' + (w && w.status) + '）');
    a(w.cost && w.cost['甲'] && w.cost['甲'].stamina === 2,
      'B7c: 回执带出已付代价（实 ' + JSON.stringify(w.cost) + '）—— 撤退结束场景并落实资源');
    a((W.store.get().people['p_甲'].resources || {}).stamina === 1,
      'B7d: **已付代价不退**（仍 1，实 ' + (W.store.get().people['p_甲'].resources || {}).stamina + '）');
    a(w.round === 1, 'B7e: 已走的轮数照实保留（实 round=' + w.round + '）');
    a(W.contest.outcomeOf(s.id).open === false, 'B7f: 收口之后 outcomeOf 报 open=false');
  })();
  // B8 收口：按 advantage 定胜负；不凭空判赢
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0, SURE);
    const zero = W.contest.close(s.id);
    a(zero.reason === 'no-verdict',
      'B8: 零判定就收口 ⇒ no-verdict（不编结果，实 ' + (zero && zero.reason) + '）');
    resolveSure(W, s.id, '起手', '甲', 0, 1, SURE);
    withStage(W, s.id, '硬关', 999);
    resolveSure(W, s.id, '硬关', '乙', 999, 1);
    const c = W.contest.close(s.id);
    a(c.ok === true && c.status === 'resolved',
      'B8b: 有判定之后才收得掉（实 ' + (c && c.status) + '）');
    a(c.winner === '甲',
      'B8c: 胜负由 advantage 定（甲成功 +1 / 乙失败 −1 ⇒ 甲，实 ' + (c && c.winner) + '）');
    a(c.cost !== undefined && c.resolved === 2,
      'B8d: 收口回执带代价账与判定条数（实 resolved=' + (c && c.resolved) + '）');
  })();
  // B9 不替世界定位置：跑完一场，world 一字未改
  (function () {
    const W = envWith(ov).WA;
    const before = JSON.stringify(W.store.get().world || {});
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    resolveSure(W, s.id, '起手', '甲', 0, 1);
    W.contest.spend(s.id, { side: '甲', material: 'stamina', amount: 1, gain: 2 });
    W.contest.withdraw(s.id, { side: '甲' });
    a(JSON.stringify(W.store.get().world || {}) === before,
      'B9: 跑完一场对抗，world **一字未改**（位置改动走 world.depart，本模块不瞬移）');
  })();
  // B10 注入：两道闸 + 只列参与者
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    resolveSure(W, s.id, '起手', '甲', 0, 1);
    W.contest.setSettings({ viewer: '' });
    a(W.contest.buildBlock() === '', 'B10: 没设观察者 ⇒ 注入块为空串（宁可零 token，也不产全知版战报）');
    W.contest.setSettings({ viewer: '丙' });
    a(W.contest.buildBlock() === '',
      'B10b: 观察者没参与任何一场 ⇒ 仍是空串（不靠「别人在打」把块撑起来）');
    W.contest.setSettings({ viewer: '甲' });
    const blk = W.contest.buildBlock();
    a(blk.indexOf('[对抗场景]') >= 0, 'B10c: 参与者有场景 ⇒ 产出注入块');
    a(blk.indexOf('不得重掷') >= 0,
      'B10d: 块里点名「已判定的结果不得重掷」（验收原文：重新打开面板不重掷）');
    a(blk.indexOf('不退还已付代价') >= 0,
      'B10e: 块里点名「撤退或收口都不退还已付代价」（验收原文）');
    a(blk.indexOf('world.depart') >= 0,
      'B10f: 块里点名位置由世界侧落实（不瞬移）');
    W.contest.setSettings({ viewer: '乙' });
    const blk2 = W.contest.buildBlock();
    a(blk2.indexOf('甲') < 0 || blk2.indexOf('你的优势') >= 0,
      'B10g: 换观察者后块是按他本人重算的（不把甲的读数端给乙）');
  })();

  /* ============ C 契约与边界 ============ */
  // C1 代价先判后扣 + 资源真扣
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    const before = (W.store.get().people['p_甲'].resources || {}).stamina;
    const bad = W.contest.spend(s.id, { side: '甲', material: 'stamina', amount: 99, gain: 1 });
    a(bad.reason === 'short-cost', 'C1: 手里不够 ⇒ short-cost（实 ' + bad.reason + '）');
    a((W.store.get().people['p_甲'].resources || {}).stamina === before,
      'C1b: **先判后扣** —— 一格都没动（实 ' + before + ' → ' + (W.store.get().people['p_甲'].resources || {}).stamina + '）');
    const ok = W.contest.spend(s.id, { side: '甲', material: 'stamina', amount: 2, gain: 1 });
    a(ok.ok === true && (W.store.get().people['p_甲'].resources || {}).stamina === 1,
      'C1c: 够的时候才真扣（3 → ' + (W.store.get().people['p_甲'].resources || {}).stamina + '）');
  })();
  // C2 轮次：推进与上限
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W, { rounds: 2 });
    const adv1 = W.contest.advanceRound(s.id);
    a(adv1.ok === true && adv1.round === 1, 'C2: 推进一轮（实 ' + (adv1 && adv1.round) + '）');
    W.contest.advanceRound(s.id);
    const over = W.contest.advanceRound(s.id);
    a(over.ok === true && over.changed === false,
      'C2b: 到轮数上限 ⇒ changed=false（不静默绕回第 1 轮，实 ' + (over && over.changed) + '）');
    const s2 = openScene(W, { rounds: 1 });
    withStage(W, s2.id, '起手', 0);
    const over2 = W.contest.stageResolve(s2.id, { stage: '起手', side: '甲', round: 5 });
    a(over2.reason === 'bad-rounds',
      'C2c: 判定轮数超过上限 ⇒ bad-rounds（实 ' + (over2 && over2.reason) + '）');
  })();
  // C3 收口后不再收指令（与「没这场」分列）
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    W.contest.withdraw(s.id, { side: '甲' });
    const closedAdd = W.contest.stageAdd(s.id, { name: '收尾' });
    a(closedAdd.reason === 'scene-closed',
      'C3: 对已收口的场下指令 ⇒ scene-closed（实 ' + (closedAdd && closedAdd.reason) + '）');
    const ghostAdd = W.contest.stageAdd('ct_查无此场', { name: 'x' });
    a(ghostAdd.reason === 'no-such-scene',
      'C3b: 对不存在的场下指令 ⇒ no-such-scene（实 ' + (ghostAdd && ghostAdd.reason) + '，两件事分得开）');
    a(W.contest.spend(s.id, { side: '甲', amount: 1 }).reason === 'scene-closed',
      'C3c: 对已收口的场付代价 ⇒ scene-closed');
  })();
  // C4 容量闸：不静默挤掉旧行
  (function () {
    const W = envWith(ov).WA;
    const keep = W.contest.getSettings().maxScenes;
    W.contest.setSettings({ maxScenes: 2 });
    openScene(W, { title: 'A' });
    openScene(W, { title: 'B' });
    const r = openScene(W, { title: 'C' });
    a(r.reason === 'scenes-full', 'C4: 场景行到上限 ⇒ scenes-full（实 ' + r.reason + '）');
    a((W.store.get().contest.scenes || []).length === 2, 'C4b: 旧的两行一行没少（不静默挤掉）');
    W.contest.setSettings({ maxScenes: keep });
  })();
  // C5 封闭集 + 缺参数 + 阶段先声明后判定
  (function () {
    const W = envWith(ov).WA;
    a(W.contest.STATUSES.join(',') === 'open,resolved,withdrawn',
      'C5: 场景状态是封闭集（实 ' + W.contest.STATUSES.join(',') + '）');
    a(W.contest.stageAdd('', { name: 'x' }).reason === 'no-such-scene', 'C5b: 空 id ⇒ no-such-scene');
    const s = openScene(W);
    a(W.contest.stageAdd(s.id, { name: '' }).reason === 'missing-fields', 'C5c: 阶段缺名 ⇒ missing-fields');
    a(W.contest.stageResolve(s.id, { stage: '没声明过', side: '甲' }).reason === 'no-such-stage',
      'C5d: 阶段没声明过 ⇒ no-such-stage（先声明后判定）');
    withStage(W, s.id, '起手', 0);
    a(W.contest.stageResolve(s.id, { stage: '起手', side: '丙' }).reason === 'unknown-side',
      'C5e: 判定方不在参与方里 ⇒ unknown-side');
    a(W.contest.spend(s.id, { side: '甲', amount: 0 }).reason === 'missing-fields',
      'C5f: 代价数量非法 ⇒ missing-fields');
  })();
  // C6 存档是唯一真源：reload 从存档重建
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    resolveSure(W, s.id, '起手', '甲', 0, 1);
    const r = W.contest.reload();
    a(r.ok === true && r.scenes === 1 && r.rolls === 1,
      'C6: reload 从存档重建（实 scenes=' + r.scenes + ' rolls=' + r.rolls + '）—— 切聊天必须重建');
    a(W.contest.sceneOf(s.id).ok === true, 'C6b: 重建后按 id 仍查得到这一场');
  })();

  await runNegative(a, ov);
}

/* ============ N 真源码破坏 + 两向自证 ============ */
async function runNegative(a, ov) {
  ov = ov || {};
  function broken(key, repl) {
    const o = {};
    o[ANCHOR[key].rel] = rd(ANCHOR[key].rel, ov).replace(ANCHOR[key].txt, repl);
    return o;
  }
  // N1 三档合并：把 partial 并进 success ⇒ 中间结果消失
  (function () {
    const o = broken('band', "    if (m >= 0) return 'success';");
    let hit = false;
    try {
      const W = envWith(o).WA;
      const s = openScene(W);
      withStage(W, s.id, '擦边', 0, EDGE);
      // EDGE ⇒ margin ∈ [1,4] ⊂ [0, PARTIAL_BAND)：原版必为 partial，合并后必成 success
      const r = W.contest.stageResolve(s.id, { stage: '擦边', side: '甲', dc: 0, round: 1 });
      hit = r.ok === true && r.outcome === 'success' && r.margin < W.contest.PARTIAL_BAND;
    } catch (e) { hit = true; }
    a(hit, 'N1: 把 partial 并进 success ⇒ 低 margin 的成功被写成干净成功（B3 的三档分列确实是判据，不是恒真）');
  })();
  // N2 部分成功不带代价标记 ⇒ 代价被吞
  (function () {
    const o = broken('partialFlag', "costPending: false, at: now };");
    const W = envWith(o).WA;
    const s = openScene(W);
    withStage(W, s.id, '擦边', 0, EDGE);
    const r = W.contest.stageResolve(s.id, { stage: '擦边', side: '甲', dc: 0, round: 1 });
    const row = W.contest.rolls(s.id)[0];
    a(r.ok === true && r.outcome === 'partial' && row.costPending === false,
      'N2: 拆掉 costPending 标记 ⇒ 部分成功的行不再要求落实代价（B5d 的判据非恒真，实 outcome=' + r.outcome + ' costPending=' + row.costPending + '）');
  })();
  // N3 重掷闸：拆掉 ⇒ 同一格能第二次掷出来
  (function () {
    const o = broken('reRollGate', "    const dup = null;\n    if (dup) {");
    const W = envWith(o).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    const r1 = resolveSure(W, s.id, '起手', '甲', 0, 1);
    const r2 = resolveSure(W, s.id, '起手', '甲', 0, 1);
    a(r1.ok === true && r2.ok === true,
      'N3: 拆掉重掷闸 ⇒ 同一格能第二次判出来（B6b 的 stage-resolved 确实是判据）');
    a(W.contest.rolls(s.id).length === 2,
      'N3b: 台账里真的多了一行（实 ' + W.contest.rolls(s.id).length + ' 行）—— 重掷不重放被打破');
  })();
  // N4 代价闸：拆掉 ⇒ 不够也能扣（甚至扣成负数）
  (function () {
    const o = broken('costGate', "      if (false) {\n        out = { ok: false, reason: 'short-cost', side: who, material: material,");
    const W = envWith(o).WA;
    const s = openScene(W);
    const r = W.contest.spend(s.id, { side: '甲', material: 'stamina', amount: 99, gain: 1 });
    a(r.ok === true && r.reason !== 'short-cost',
      'N4: 拆掉代价闸 ⇒ 手里只有 3 也照收 99 的单（实 ok=' + (r && r.ok) + ' reason=' + (r && r.reason)
        + '，钱袋仍是 ' + (W.store.get().people['p_甲'].resources || {}).stamina
        + '）—— C1 的 short-cost 确实是判据');
  })();
  // N5 名册闸：拆掉 ⇒ 凭空多出一个参与方
  (function () {
    const o = broken('sideGate', "      if (false) return refuse('unknown-side', { who: who });");
    const W = envWith(o).WA;
    const r = W.contest.open({ kind: 'chase', sides: ['甲', '查无此人'], rounds: 1 });
    a(r.ok === true, 'N5: 拆掉名册闸 ⇒ 不在册的人也能进场（B4 的 unknown-side 确实是判据）');
  })();
  // N6 零判定收口闸：拆掉 ⇒ 凭空判赢
  (function () {
    const o = broken('noVerdictGate', "    if (false) {\n      return refuse('no-verdict', { scene: sc.id,");
    const W = envWith(o).WA;
    const s = openScene(W);
    const c = W.contest.close(s.id);
    a(c.ok === true && c.resolved === 0,
      'N6: 拆掉零判定闸 ⇒ 一场没判过也收得掉（实 ok=' + (c && c.ok) + ' resolved=' + (c && c.resolved)
        + ' winner=' + (c && c.winner) + '）—— B8 的 no-verdict 确实是判据');
  })();
  // N7 收口闸：拆掉 ⇒ 已收口的场还能再收一次
  (function () {
    const o = {};
    o[CT] = rd(CT, ov)
      .replace(ANCHOR.closedGate.txt, "    const name = clean(s.name, 40);")
      .replace(ANCHOR.closedGateIn.txt, "      if (false) { out = { ok: false, reason: 'scene-closed', id: row.id, status: row.status }; return false; }\n      if (row.stages.length >= cfg.maxStages) {");
    const W = envWith(o).WA;
    const s = openScene(W);
    W.contest.withdraw(s.id, { side: '甲' });
    const r = W.contest.stageAdd(s.id, { name: '收尾' });
    a(r.ok === true, 'N7: 拆掉收口闸 ⇒ 已撤退的场还能再加阶段（C3 的 scene-closed 确实是判据）');
  })();
  // N8 观察者闸 + 成员闸：两道一起拆 ⇒ 无观察者也产全知版战报
  (function () {
    const o = {};
    o[CT] = rd(CT, ov)
      .replace(ANCHOR.viewerGate.txt, '    // viewer gate removed')
      .replace(ANCHOR.memberGate.txt, '    // member gate removed');
    const W = envWith(o).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    resolveSure(W, s.id, '起手', '甲', 0, 1);
    W.contest.setSettings({ viewer: '' });
    a(W.contest.buildBlock() !== '',
      'N8: 两道闸一起拆 ⇒ 无观察者也产出注入块（B10 的「空串」确实是判据；单拆一层拆不掉 = 纵深防御）');
  })();
  // N8b 成员闸单独：拆掉 ⇒ 没参与的人也能看到别人的场
  (function () {
    const o = broken('memberGate', '    // member gate removed');
    const W = envWith(o).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0);
    resolveSure(W, s.id, '起手', '甲', 0, 1);
    W.contest.setSettings({ viewer: '丙' });
    a(W.contest.buildBlock() !== '',
      'N8b: 只拆成员闸 ⇒ 没参与的人也能拿到别人的对抗读数（B10b 的判据非恒真）');
  })();
  // N9 正控制：原版上同款判据必须真
  (function () {
    const W = envWith(ov).WA;
    const s = openScene(W);
    withStage(W, s.id, '起手', 0, SURE);
    const r1 = resolveSure(W, s.id, '起手', '甲', 0, 1, SURE);
    const r2 = resolveSure(W, s.id, '起手', '甲', 0, 1, SURE);
    a(r1.ok === true && r2.reason === 'stage-resolved'
      && W.contest.rolls(s.id).length === 1 && W.contest.buildBlock() === '',
      'N9: 正控制 —— 原版上「不重掷 + 无观察者零注入」同时为真');
    const c9 = W.contest.close(s.id);
    a(c9.ok === true && c9.resolved === 1 && c9.winner === '甲',
      'N9b: 正控制 —— 收口按**判定条数**走（实 resolved=' + (c9 && c9.resolved)
        + ' winner=' + (c9 && c9.winner) + '，不编结果）');
    const s9 = openScene(W);
    const z9 = W.contest.close(s9.id);
    a(z9.reason === 'no-verdict',
      'N9c: 正控制 —— 零判定的场在原版上收不掉（实 ' + (z9 && z9.reason) + '）');
  })();
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };

/* ============ 单独运行 ============ */
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    console.log('\nEXP5-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}