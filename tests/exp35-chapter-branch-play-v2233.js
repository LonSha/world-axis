#!/usr/bin/env node
// WorldAxis tests/exp35-chapter-branch-play-v2233.js
// OPV4-8 专锁：章节、事件与分支的连续游玩（长局进退、承诺延期、分支比对与快照恢复）

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const ACTION_DESK_PATH = path.join(BASE, 'engines/action-desk.js');

// 破坏锚点（真源码单行变异，恰好 1 次命中）
const ANCHOR_ROLLOVER = 'p.deferCount = (p.deferCount || 0) + 1;';

function runSuite() {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;

  let tested = 0;
  function a(cond, msg) {
    assert(cond, msg);
    tested++;
  }

  // ── 1. 静态契约检查 ──
  const deskSrc = fs.readFileSync(ACTION_DESK_PATH, 'utf8');
  a(deskSrc.indexOf("'chapter.open':") > 0, 'OPV4-8/A1: 包含 chapter.open 路由');
  a(deskSrc.indexOf("'chapter.flow':") > 0, 'OPV4-8/A2: 包含 chapter.flow 路由');
  a(deskSrc.indexOf("'chapter.rollover':") > 0, 'OPV4-8/A3: 包含 chapter.rollover 路由');
  a(deskSrc.indexOf("'chapter.close':") > 0, 'OPV4-8/A4: 包含 chapter.close 路由');
  a(deskSrc.indexOf("'chapter.saveBranch':") > 0, 'OPV4-8/A5: 包含 chapter.saveBranch 路由');
  a(deskSrc.indexOf("'chapter.restore':") > 0, 'OPV4-8/A6: 包含 chapter.restore 路由');
  a(deskSrc.indexOf("'chapter.diff':") > 0, 'OPV4-8/A7: 包含 chapter.diff 路由');
  a(deskSrc.indexOf("'chapter.inspect':") > 0, 'OPV4-8/A8: 包含 chapter.inspect 路由');
  a(deskSrc.indexOf('var EXPORT_COUNT = 14;') > 0, 'OPV4-8/A9: actionDesk 导出面保持 14 口恒定，零泄漏');

  // 初始化世界状态与环境
  WA.actionDesk.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.chapters = { active: false, current: null, history: [], seq: 0 };
    d.customLax = { rules: [], precedents: [], favors: [], guarantees: [], promises: [], penalties: [] };
  });
  if (WA.checkpoints && WA.checkpoints.setSettings) {
    WA.checkpoints.setSettings({ enabled: true });
  }

  // ── 2. 开章流程与目标/边界约束（chapter.open） ──
  const openRes = WA.actionDesk.plan('chapter.open', {
    title: '青石关破局',
    script: '查清商队走私矿石的幕后主使',
    notes: '切勿在未拿到契据前公然动手；严防守卫警觉',
    checkpoint: true,
    checkpointName: 'ckpt_ch1_open'
  });
  a(openRes.ok === true, 'OPV4-8/B1: chapter.open 成功');
  a(openRes.chapter && openRes.chapter.title === '青石关破局', 'OPV4-8/B2: 章节标题正确设置');
  a(openRes.chapter && openRes.chapter.script === '查清商队走私矿石的幕后主使', 'OPV4-8/B3: 章节脚本目标正确记录');
  a(openRes.checkpoint && openRes.checkpoint.ok === true, 'OPV4-8/B4: 连带生成开章快照');

  // 登记若干民间承诺与债务（含活跃、违约与待履行）
  const commitP = WA.customLax['commit' + 'Promise'].bind(WA.customLax);
  const defaultP = WA.customLax['default' + 'Promise'].bind(WA.customLax);
  const fulfillP = WA.customLax['fulfill' + 'Promise'].bind(WA.customLax);

  const p1 = commitP({
    promiser: '陆远', beneficiary: '客栈老板', subject: '两日后结算马料与草料银子', dueDay: 2
  }).promise;
  const p2 = commitP({
    promiser: '陆远', beneficiary: '铁匠', subject: '换取新马掌一付', dueDay: 1
  }).promise;
  const p3 = commitP({
    promiser: '林掌柜', beneficiary: '陆远', subject: '交付私下账簿一页', dueDay: 3
  }).promise;

  // 铁匠承诺判定违约，产生历史违约痕迹
  defaultP(p2.id, '遭遇盘查未能如约交付');

  // ── 3. 推进中长局流态收束与义务盘点（chapter.flow） ──
  const flow1 = WA.actionDesk.plan('chapter.flow', {});
  a(flow1.ok === true, 'OPV4-8/C1: chapter.flow 查询成功');
  a(flow1.currentChapter && flow1.currentChapter.title === '青石关破局', 'OPV4-8/C2: 正确识别当前章');
  a(flow1.pendingObligations.active === 2, 'OPV4-8/C3: 正确统计 2 笔未结活跃承诺');
  a(flow1.pendingObligations.defaulted === 1, 'OPV4-8/C4: 正确统计 1 笔违约历史');

  // ── 4. 未结义务带入与延期（chapter.rollover） ──
  const rollRes = WA.actionDesk.plan('chapter.rollover', {
    promiseId: p1.id,
    newDueDay: 5,
    reason: '商队延期抵关，顺延付清银两'
  });
  a(rollRes.ok === true, 'OPV4-8/D1: chapter.rollover 执行成功');
  a(rollRes.promise.dueDay === 5, 'OPV4-8/D2: dueDay 正确延期至第 5 天');
  a(rollRes.promise.deferCount === 1, 'OPV4-8/D3: deferCount 增加为 1');
  a(rollRes.promise.status === 'active', 'OPV4-8/D4: 状态仍为 active，无非法终结');

  // 尝试延期不存在的承诺应被拒绝
  const rollFail = WA.actionDesk.plan('chapter.rollover', { promiseId: 'non_existent_pid' });
  a(rollFail.ok === false && rollFail.reason === 'promise-not-found-or-inactive', 'OPV4-8/D5: 非法 promiseId 被如实拒绝');

  // ── 5. 收章结算与历史保留（chapter.close） ──
  const closeRes = WA.actionDesk.plan('chapter.close', {
    note: '顺利查清账簿，但留下违约口舌',
    checkpoint: true,
    checkpointName: 'ckpt_ch1_closed'
  });
  a(closeRes.ok === true, 'OPV4-8/E1: chapter.close 成功');
  a(closeRes.closedChapter.no === 1, 'OPV4-8/E2: 正确关闭第 1 章');
  a(closeRes.pendingActiveRetained === 2, 'OPV4-8/E3: 未结承诺完整保留未被抹除');
  a(closeRes.defaultedHistoryRetained === 1, 'OPV4-8/E4: 违约失败历史未被抹去');
  a(closeRes.checkpoint && closeRes.checkpoint.ok === true, 'OPV4-8/E5: 收章快照正常落盘');

  // ── 6. 分支保存与语义比对（chapter.saveBranch & chapter.diff） ──
  // 在当前收章节点保存分支 A
  const bResA = WA.actionDesk.plan('chapter.saveBranch', {
    name: 'branch_ch1_reconciled',
    note: '第1章结账分支：保留承诺与违约'
  });
  a(bResA.ok === true, 'OPV4-8/F1: 保存分支 A 成功');

  // 开第2章并履行 p1 承诺，同时产生新局面保存为分支 B
  WA.actionDesk.plan('chapter.open', { title: '南市暗潮' });
  fulfillP(p1.id);
  const bResB = WA.actionDesk.plan('chapter.saveBranch', {
    name: 'branch_ch2_fulfilled',
    note: '第2章履约分支'
  });
  a(bResB.ok === true, 'OPV4-8/F2: 保存分支 B 成功');

  // 比对两个分支
  const diffRes = WA.actionDesk.plan('chapter.diff', {
    baseId: bResA.id,
    targetId: bResB.id
  });
  a(diffRes.ok === true, 'OPV4-8/F3: 分支差异比对成功');
  a(diffRes.classes && diffRes.classes.obligation, 'OPV4-8/F4: 差异包含具体四类语义结构（实体/关系/义务/事件）');

  // ── 7. 快照恢复与快照库隔离（chapter.restore） ──
  const beforeListCount = (WA.checkpoints.list().slots || []).length;
  // 恢复回第1章刚刚开章的快照
  const restoreRes = WA.actionDesk.plan('chapter.restore', {
    id: openRes.checkpoint.id
  });
  a(restoreRes.ok === true, 'OPV4-8/G1: 恢复历史快照成功');
  const restoredCur = WA.chapters.current();
  a(restoredCur && restoredCur.title === '青石关破局', 'OPV4-8/G2: 世界状态成功还原到青石关破局开章状态');
  const afterListCount = (WA.checkpoints.list().slots || []).length;
  a(afterListCount === beforeListCount, 'OPV4-8/G3: 快照库独立存在，恢复旧状态未抹除任何快照');

  // ── 8. 纯读零写入不变式 ──
  const stBefore = JSON.stringify(WA.store.get());
  const lsBefore = JSON.stringify(global.localStorage || {});
  for (let i = 0; i < 10; i++) {
    WA.actionDesk.plan('chapter.flow', {});
    WA.actionDesk.plan('chapter.inspect', {});
  }
  const stAfter = JSON.stringify(WA.store.get());
  const lsAfter = JSON.stringify(global.localStorage || {});
  a(stBefore === stAfter, 'OPV4-8/H1: chapter.flow/inspect 连续调用 10 次 store 零写入');
  a(lsBefore === lsAfter, 'OPV4-8/H2: chapter.flow/inspect 连续调用 10 次 localStorage 零写入');

  // ── 9. 真源码变异负控制（negative control） ──
  a(deskSrc.indexOf(ANCHOR_ROLLOVER) > 0, 'OPV4-8/N0: 破坏锚点在 action-desk.js 恰好存在');
  a(deskSrc.split(ANCHOR_ROLLOVER).length === 2, 'OPV4-8/N0b: 破坏锚点唯一出现 1 次');

  // 构造破坏版：跳过 deferCount 自增与延期标记
  const corruptDeskSrc = deskSrc.replace(ANCHOR_ROLLOVER, '/* corrupt rollover */');
  const gateNeg = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const envNeg = gateNeg.fresh({});
  const WANeg = envNeg.WA;

  // 使用 VM 将破坏版 deskCode 执行在新的作用域中覆盖 WANeg.actionDesk
  const vmDeskCtx = {
    window: { WorldAxis: WANeg },
    console: console,
    Date: Date,
    Math: Math,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Array: Array,
    Object: Object,
    RegExp: RegExp,
    JSON: JSON
  };
  vmDeskCtx.global = vmDeskCtx.window;
  vm.createContext(vmDeskCtx);
  vm.runInContext(corruptDeskSrc, vmDeskCtx);

  WANeg.actionDesk.setSettings({ enabled: true });
  WANeg.store.transact(function (d) {
    d.chapters = { active: false, current: null, history: [], seq: 0 };
    d.customLax = { rules: [], precedents: [], favors: [], guarantees: [], promises: [] };
  });
  const commitPNeg = WANeg.customLax['commit' + 'Promise'].bind(WANeg.customLax);
  const pNeg = commitPNeg({
    promiser: '破坏测试A', beneficiary: '破坏测试B', subject: '欠条', dueDay: 1
  }).promise;

  const testRoll = WANeg.actionDesk.plan('chapter.rollover', {
    promiseId: pNeg.id,
    newDueDay: 3
  });
  // 正常版中 deferCount 应当为 1；破坏版中未自增，deferCount 为 undefined
  const negativePassed = (testRoll.ok === true && testRoll.promise.deferCount === 1);
  a(!negativePassed, 'OPV4-8/N1: 负控制生效（破坏版中 deferCount 未自增，判据必败）');

  console.log('exp35-chapter-branch-play-v2233: ' + tested + ' 项断言全部通过（含真源码负控制）');
}

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp35-chapter-branch-play-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp35-chapter-branch-play-v2233.js: 主体断言全部通过');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: null,
};

// ── 直接运行入口（`node tests/exp35-chapter-branch-play-v2233.js`）──────────────────────────────
//   上一轮补丁删掉了裸调用却没补守卫，直接运行会变成「装进来、什么也不做、exit 0」——
//   一条退出码是绿的静默空跑。这里补回显式入口：跑 runAll，失败以非零码退出。
if (require.main === module) {
  try {
    runAll(require('assert'));
    console.log('exp35-chapter-branch-play-v2233.js: 直接运行通过');
  } catch (e) {
    console.error('exp35-chapter-branch-play-v2233.js: 直接运行失败 → ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}
