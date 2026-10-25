#!/usr/bin/env node
// WorldAxis tests/exp37-material-lifecycle-recycle-v2233.js
// EXV4-1 专锁：材料生命周期与废弃物回流
// 验证：
//   1. 静态契约导出检查：envCapacity.declareRecyclableMaterial/generateScrap/recycleScrap/materialLifecycle 为合法函数；
//   2. 材料规格声明与默认加载：支持自定义与开箱即用的可回收材料（产出率、处置工位、折损）；
//   3. 废料产生与积压状态：生产/维修产生副产物，积压超限触发 normal -> congested -> choked 状态迁移动态；
//   4. 严格物质守恒回收：produced = floor(scrap * yieldRate), loss = scrap - produced，杜绝凭空生成，库存回流联动；
//   5. 状态隔离与只读纯净：只读查询 materialLifecycle 10 次连续调用 store 逐字节零写入；
//   6. 真源码负控制（negative control）：靶向单行变异破坏回收物质守恒算式，在破坏环境下判据必败。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const ENV_CAPACITY_PATH = path.join(BASE, 'engines/environmental-capacity.js');

// 破坏锚点（真源码单行变异，恰好 1 次命中）：
// 将回收产出率破坏为 0，使回收无法产生有效物资
const ANCHOR_RECYCLE = 'var produced = Math.floor(amt * mat.yieldRate);';

function runSuite() {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });
  let tested = 0;

  function t(desc, cond) {
    assert(cond, desc);
    tested++;
  }

  // 1. 静态契约导出检查
  t('WA.envCapacity 导出存在', !!WA.envCapacity);
  t('declareRecyclableMaterial 为函数', typeof WA.envCapacity.declareRecyclableMaterial === 'function');
  t('generateScrap 为函数', typeof WA.envCapacity.generateScrap === 'function');
  t('recycleScrap 为函数', typeof WA.envCapacity.recycleScrap === 'function');
  t('materialLifecycle 为函数', typeof WA.envCapacity.materialLifecycle === 'function');

  // 2. 材料规格声明
  const declRes = WA.envCapacity.declareRecyclableMaterial('glass', {
    name: '琉璃碎料',
    yieldRate: 0.80,
    unitCost: 4,
    laborRequired: 2,
    facilityType: 'kiln'
  });
  t('声明自定义回收材料成功', declRes && declRes.ok && declRes.material.yieldRate === 0.80);
  t('材料规格工位记录正确', declRes.material.facilityType === 'kiln');

  // 3. 产生废料副产物与积压等级
  const gen1 = WA.envCapacity.generateScrap('metal', 15, 'blacksmith_craft', 'site_alpha');
  t('金属废料生成15单位成功', gen1 && gen1.ok && gen1.currentScrap === 15);
  t('15单位属于正常积压', gen1.backlogLevel === 'normal' && !gen1.congested);

  const gen2 = WA.envCapacity.generateScrap('metal', 10, 'repair_weapon', 'site_alpha');
  t('追加生成10单位，累计25单位', gen2 && gen2.ok && gen2.currentScrap === 25);
  t('25单位积压触发拥堵congested', gen2.backlogLevel === 'congested' && gen2.congested);

  const gen3 = WA.envCapacity.generateScrap('metal', 30, 'machinery_breakdown', 'site_alpha');
  t('追加生成30单位，累计55单位', gen3 && gen3.ok && gen3.currentScrap === 55);
  t('超50单位触发严重堵塞choked', gen3.backlogLevel === 'choked');

  // 4. 回收投入、物质守恒与回流库存
  // 55单位金属废料，尝试回收 20 单位（yieldRate 0.75）
  // 预期产出: Math.floor(20 * 0.75) = 15，损耗: 20 - 15 = 5，剩余废料: 35
  const rec1 = WA.envCapacity.recycleScrap('metal', 20, 'artisan_zhang', 'forge_workshop', {
    locationId: 'site_alpha',
    returnToStock: false
  });
  t('回收操作执行成功', rec1 && rec1.ok);
  t('严密守恒产出为15', rec1.producedAmount === 15);
  t('折损量为5', rec1.lossAmount === 5);
  t('物质守恒输入=产出+损耗', rec1.scrapConsumed === (rec1.producedAmount + rec1.lossAmount));
  t('剩余积压降为35', rec1.remainingScrap === 35);
  t('35单位降级回congested', rec1.backlogLevel === 'congested');

  // 超额回收被拒
  const recBad = WA.envCapacity.recycleScrap('metal', 999, 'artisan_zhang', 'forge_workshop', {
    locationId: 'site_alpha'
  });
  t('废料不足时回收被拒', recBad && !recBad.ok && recBad.reason === 'insufficient-scrap');

  // 5. ActionDesk 路由联动测试
  const deskGen = WA.actionDesk.plan('envCapacity.generateScrap', {
    materialId: 'timber',
    amount: 12,
    source: 'carpenter_cutting',
    locationId: 'lumber_yard'
  });
  t('ActionDesk 调度 generateScrap 成功', deskGen && deskGen.ok && deskGen.currentScrap === 12);

  const deskRec = WA.actionDesk.plan('envCapacity.recycleScrap', {
    materialId: 'timber',
    amount: 10,
    worker: 'woodworker_li',
    facilityId: 'sawmill',
    locationId: 'lumber_yard'
  });
  // timber 默认 yieldRate 0.60，10 * 0.6 = 6 产出，4 损耗，余 2
  t('ActionDesk 调度 recycleScrap 成功', deskRec && deskRec.ok && deskRec.producedAmount === 6);
  t('木材碎料剩余2单位', deskRec.remainingScrap === 2);

  // 6. 全生命周期查询与纯读零写入状态隔离
  const overview = WA.envCapacity.materialLifecycle('metal', 'site_alpha');
  t('生命周期查询概况成功', overview && overview.ok && overview.totalCurrentScrap === 35);
  t('效能比对包含原生与回收率', overview.efficiencyComparison && overview.efficiencyComparison.recycledEfficiency === 0.75);

  const snapBefore = JSON.stringify(WA.store.get());
  for (let i = 0; i < 10; i++) {
    WA.envCapacity.materialLifecycle('metal', 'site_alpha');
    WA.actionDesk.plan('envCapacity.materialLifecycle', { materialId: 'metal', locationId: 'site_alpha' });
  }
  const snapAfter = JSON.stringify(WA.store.get());
  t('只读接口 10 次调用 store 零写入状态隔离', snapBefore === snapAfter);

  return { ok: true, tested: tested };
}

// 7. 真源码单行负控制
function runNegative() {
  const code = fs.readFileSync(ENV_CAPACITY_PATH, 'utf8');
  assert(code.indexOf(ANCHOR_RECYCLE) >= 0, '锚点必须在 environmental-capacity.js 中存在');
  assert(code.indexOf(ANCHOR_RECYCLE) === code.lastIndexOf(ANCHOR_RECYCLE), '锚点必须唯一');

  // 破坏：将产出强制改为 0，直接打破回收物质守恒与有效产出
  const brokenCode = code.replace(
    ANCHOR_RECYCLE,
    'var produced = 0; /* MUTATION BROKEN */'
  );

  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({
    srcOverride: {
      'engines/environmental-capacity.js': brokenCode
    }
  });
  const WA = env.WA;

  WA.envCapacity.generateScrap('metal', 20, 'test', 'neg_site');
  const res = WA.envCapacity.recycleScrap('metal', 20, 'worker_neg', 'shop', { locationId: 'neg_site' });

  // 在破坏状态下，本应产出 15 的地方变成了 0，断言必须捕捉到此失败
  if (res && res.producedAmount === 15) {
    throw new Error('负控制失败：破坏版代码未被判定捕获！');
  }
}

if (require.main === module) {
  const res = runSuite();
  runNegative();
  console.log('exp37-material-lifecycle-recycle-v2233: ' + res.tested + ' 项断言全部通过（含真源码负控制）');
}

// ── v2.233.0 收口：对齐 tests/run.js 的 runLock 调用约定 ──────────────────
//   病灶：runLock 是 `require(spec)[method](assert)`，method 默认 'runAll'。
//     本文件主体用的是 runSuite()（内有本地 t(desc,cond)→assert，失败即 throw），
//     于是「装进来」与「跑起来」之间缺了一层。缺这层时红灯长成
//     「没有导出 runAll」——看起来像锁坏了，而不像「断言根本没跑」，
//     这正是本仓点名的「绿是运气」：单独 `node tests/exp37-material-lifecycle-recycle-v2233.js` 绿，
//     全量路径却在 require 处红，两个读数谁也证不了谁。
//   修法：补 runAll(assert)，把真相（throw）原样上抛给 runLock ——
//     它已按「锁自己抛的 → 记一条红并继续跑」处理，不会打断后续节。
function runAll(a) {
  var assertFn = (typeof a === 'function') ? a : require('assert');
  runSuite();
  assertFn(true, 'exp37-material-lifecycle-recycle-v2233.js: 主体断言全部通过');
  runNegative();
  assertFn(true, 'exp37-material-lifecycle-recycle-v2233.js: 单行真源码负控制如期报警');
  return true;
}
module.exports = {
  runAll: runAll,
  runSuite: runSuite,
  runNegative: runNegative,
};
