#!/usr/bin/env node
// WorldAxis tests/exp36-playable-blueprint-tune-v2233.js
// OPV4-9 专锁：玩法蓝图的安全调参、差异预览与续局
// 验证：
//   1. 差异预览（previewDiff）：对比已安装定义与调参/待升级蓝图的增删改差异；
//   2. 安全调参（tuneConfig）：在受约束数值与白名单内调参，留痕审计，不破坏进行中进度；
//   3. 版本迁移（migrateBlueprint）：旧格式迁移，可选引擎不可用时提供解释性降级，未知格式 fail-closed 拒收；
//   4. 显式重置初始条件（resetInitialConditions）：仅重置资源，不静默删除人物经历与世界事件历史；
//   5. 状态隔离不变式：只读接口纯读零写入；
//   6. 真源码负控制（negative control）：单行锚点变异在破坏环境下判据必败。

'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const BLUEPRINT_PATH = path.join(BASE, 'engines/playable-blueprint.js');

// 破坏锚点（真源码单行变异，恰好 1 次命中）
const ANCHOR_TUNE = 'inst.tuningHistory.push(tuningRecord);';

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
  const bpSrc = fs.readFileSync(BLUEPRINT_PATH, 'utf8');
  a(bpSrc.indexOf('previewDiff:') > 0, 'OPV4-9/A1: playableBlueprint 包含 previewDiff');
  a(bpSrc.indexOf('tuneConfig:') > 0, 'OPV4-9/A2: playableBlueprint 包含 tuneConfig');
  a(bpSrc.indexOf('migrateBlueprint:') > 0, 'OPV4-9/A3: playableBlueprint 包含 migrateBlueprint');
  a(bpSrc.indexOf('resetInitialConditions:') > 0, 'OPV4-9/A4: playableBlueprint 包含 resetInitialConditions');

  // 初始化世界状态与行动桌
  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });

  // ── 2. 安装初始蓝图与差异预览（previewDiff） ──
  // 安装前预览：纯新增预览
  const diffBefore = WA.actionDesk.plan('playableBlueprint.previewDiff', {
    sampleId: 'town-workshop'
  });
  a(diffBefore.ok === true, 'OPV4-9/B1: 安装前 previewDiff 成功');
  a(diffBefore.currentlyInstalled === false, 'OPV4-9/B2: 安装前状态识别正确');
  a(diffBefore.diffCount > 0, 'OPV4-9/B3: 预览包含新增项');

  // 显式安装城镇工坊蓝图
  const installRes = WA.actionDesk.plan('playableBlueprint.installSample', {
    sampleId: 'town-workshop',
    force: true
  });
  a(installRes.ok === true, 'OPV4-9/B4: 蓝图安装成功');

  // 安装后带参数覆盖的差异预览
  const diffAfter = WA.actionDesk.plan('playableBlueprint.previewDiff', {
    sampleId: 'town-workshop',
    overrides: {
      'family-ops': { budgetCycle: 14 }
    }
  });
  a(diffAfter.ok === true, 'OPV4-9/B5: 安装后 previewDiff 成功');
  a(diffAfter.currentlyInstalled === true, 'OPV4-9/B6: 安装后正确识别已有安装');
  const familyDiff = diffAfter.diffs.find(d => d.key === 'family-ops');
  a(familyDiff && familyDiff.type === 'modified', 'OPV4-9/B7: 正确识别出 family-ops 改动差异');

  // ── 3. 安全调参（tuneConfig）与进度保留 ──
  // 注入一些进行中的人物进度与经历
  WA.store.transact(function (draft) {
    draft.people = draft.people || {};
    draft.people.p_apprentice = {
      id: 'p_apprentice',
      name: '青年学徒',
      level: 3,
      experience: 450,
      notes: '已掌握初级锻造技巧'
    };
    draft.world = draft.world || {};
    draft.world.events = [
      { id: 'ev_1', text: '完成了第一柄铁锤的锻造', day: 2 }
    ];
    return true;
  });

  // 执行安全调参：调整 budgetCycle（受约束在 1~30 之间）与 training.method
  const tuneRes = WA.actionDesk.plan('playableBlueprint.tuneConfig', {
    sampleId: 'town-workshop',
    params: {
      'family-ops': { budgetCycle: 14 },
      training: { method: 'advanced-apprenticeship' }
    }
  });
  a(tuneRes.ok === true, 'OPV4-9/C1: tuneConfig 调参成功');
  a(tuneRes.tuned.playDefs['family-ops'].budgetCycle === 14, 'OPV4-9/C2: family-ops.budgetCycle 成功更新为 14');
  a(tuneRes.tuned.playDefs.training.method === 'advanced-apprenticeship', 'OPV4-9/C3: training.method 成功安全更新');
  a(Array.isArray(tuneRes.tuned.tuningHistory) && tuneRes.tuned.tuningHistory.length === 1, 'OPV4-9/C4: 调参历史成功留痕');

  // 超出约束数值测试：输入 999 应当被约束上限钳制在 30
  const clampRes = WA.actionDesk.plan('playableBlueprint.tuneConfig', {
    sampleId: 'town-workshop',
    params: {
      'family-ops': { budgetCycle: 999 }
    }
  });
  a(clampRes.ok === true && clampRes.tuned.playDefs['family-ops'].budgetCycle === 30, 'OPV4-9/C5: 超限参数被安全钳制在合法上限 30');

  // 核查运行中人物经历未被冲掉
  const stNow = WA.store.get();
  a(stNow.people.p_apprentice && stNow.people.p_apprentice.experience === 450, 'OPV4-9/C6: 调参不覆盖人物进行中进度与经历');

  // 未安装蓝图调参应当防御性拦截
  const uninstalledTune = WA.actionDesk.plan('playableBlueprint.tuneConfig', {
    sampleId: 'sci-fi-station',
    params: { research: { enabled: false } }
  });
  a(uninstalledTune.ok === false && uninstalledTune.reason === 'blueprint-not-installed', 'OPV4-9/C7: 未安装蓝图调参被拒绝');

  // ── 4. 版本迁移与可选引擎降级（migrateBlueprint） ──
  // 模拟旧版本数据结构
  const oldV1Data = {
    sampleId: 'town-workshop',
    theme: 'town-workshop',
    playDefs: {
      training: { method: 'basic' }
    }
  };
  const migRes = WA.actionDesk.plan('playableBlueprint.migrate', {
    blueprintData: oldV1Data
  });
  a(migRes.ok === true, 'OPV4-9/D1: 旧版蓝图数据迁移成功');
  a(migRes.migrated.version === 2, 'OPV4-9/D2: 格式版本提升至 2');

  // 未知非法格式 fail-closed 拒收
  const badFormat = { foo: 'bar' };
  const badMigRes = WA.actionDesk.plan('playableBlueprint.migrate', {
    blueprintData: badFormat
  });
  a(badMigRes.ok === false && badMigRes.reason === 'unsupported-format-rejected', 'OPV4-9/D3: 未知格式明确拒收，防数据污染');

  // ── 5. 重置初始条件并保留进度（resetInitialConditions） ──
  // 消耗一部分金币和木料
  WA.store.transact(function (draft) {
    draft.economy.money.funds = 5;
    draft.economy.stock.wood = 1;
    return true;
  });
  a(WA.store.get().economy.money.funds === 5, '（前置）金币已消耗至 5');

  // 显式重置初始条件
  const resetRes = WA.actionDesk.plan('playableBlueprint.resetInitialConditions', {
    sampleId: 'town-workshop',
    reason: '赛季重新开始挑战'
  });
  a(resetRes.ok === true, 'OPV4-9/E1: resetInitialConditions 成功');
  a(resetRes.summary.fundsReset === true, 'OPV4-9/E2: 物资配额显式重置');
  const stReset = WA.store.get();
  a(stReset.economy.money.funds === 50, 'OPV4-9/E3: 初始金币正确重置回初始值 50');
  a(stReset.economy.stock.wood === 10, 'OPV4-9/E4: 初始木料正确重置回初始值 10');
  // 核心：人物经历与事件历史严格保留，绝不静默删除
  a(stReset.people.p_apprentice.experience === 450, 'OPV4-9/E5: 显式重置下学徒经历完整保留');
  a(stReset.world.events.length === 1 && stReset.world.events[0].id === 'ev_1', 'OPV4-9/E6: 显式重置下历史世界事件不丢失');
  a(Array.isArray(stReset.blueprint.resetHistory) && stReset.blueprint.resetHistory.length === 1, 'OPV4-9/E7: 显式重置操作全程审计留痕');

  // ── 6. 纯读只读接口零写入验证 ──
  const snap1 = JSON.stringify(WA.store.get());
  for (let i = 0; i < 10; i++) {
    WA.actionDesk.plan('playableBlueprint.previewDiff', { sampleId: 'town-workshop' });
    WA.actionDesk.plan('playableBlueprint.listSamples', {});
    WA.actionDesk.plan('playableBlueprint.checkDependencies', { sampleId: 'town-workshop' });
  }
  const snap2 = JSON.stringify(WA.store.get());
  a(snap1 === snap2, 'OPV4-9/Z1: 只读接口重复调用 10 次全局 store 逐字节零写入');

  // ── 7. 真源码单行变异负控制（negative control） ──
  a(bpSrc.indexOf(ANCHOR_TUNE) > 0, '（负控制探针）单行锚点存在且唯一');
  a(bpSrc.indexOf(ANCHOR_TUNE) === bpSrc.lastIndexOf(ANCHOR_TUNE), '（负控制探针）单行锚点恰中 1 次');

  // 生成破坏版源码：抹除调参留痕 push
  const mutatedSrc = bpSrc.replace(ANCHOR_TUNE, '// [MUTATED] tuning history skipped');
  const sandbox = { window: {}, module: { exports: {} }, exports: {}, console: console, Date: Date, Math: Math, JSON: JSON, Array: Array, Object: Object, String: String, Number: Number, RegExp: RegExp, Set: Set, Map: Map, setTimeout: setTimeout, clearTimeout: clearTimeout };
  sandbox.window = sandbox;
  const WAMock = {};
  sandbox.window.WorldAxis = WAMock;
  vm.runInNewContext(mutatedSrc, sandbox);

  // 在破坏版环境中执行调参验证，断言其调参留痕判断必败
  const negBlueprint = sandbox.window.WorldAxis.playableBlueprint;
  const storeData = {
    blueprint: {
      installed: {
        'town-workshop': {
          playDefs: { training: { method: 'old' } },
          tuningHistory: []
        }
      }
    }
  };
  const negStore = {
    get: function () { return storeData; },
    transact: function (fn) { fn(storeData); }
  };
  sandbox.window.WorldAxis.store = negStore;

  const negTune = negBlueprint.tuneConfig('town-workshop', {
    training: { method: 'mutated-method' }
  });
  // 正常版中 tuningHistory 长度应为 1，破坏版中未 push 故为 0
  const negConditionPassed = (negTune.ok === true && negTune.tuned.tuningHistory.length === 1);
  a(!negConditionPassed, 'OPV4-9/N1: 真源码变异负控制生效（破坏版中 tuningHistory 未增加，判据必败）');

  console.log('exp36-playable-blueprint-tune-v2233: ' + tested + ' 项断言全部通过（含真源码负控制）');
}

runSuite();