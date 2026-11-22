'use strict';
// WorldAxis tests/exp25-environmental-capacity-v2232.js
// 验证 IN-7 有承载力的环境：存量、取用压力、再生、应变分级、真变异负控制

const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  return W;
}

let pass = 0, fail = 0;
function a(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error('FAIL: ' + desc); }
}

async function runPositive() {
  const W = env();

  a('envCapacity 模块已加载', !!W.envCapacity);
  a('declareResource 为函数', typeof W.envCapacity.declareResource === 'function');
  a('withdraw 为函数', typeof W.envCapacity.withdraw === 'function');
  a('regenerate 为函数', typeof W.envCapacity.regenerate === 'function');

  // 1. 声明资源
  const r1 = W.envCapacity.declareResource({
    resourceId: 'water_east', resourceType: 'water', regionId: 'east_region',
    stock: 100, maxStock: 100, regenRate: 5, recoveryDelay: 2
  });
  a('资源声明成功', r1 && r1.ok);
  a('资源初始应变 healthy', r1.resource.strain === 'healthy');

  // 拒绝未知类型
  const rBad = W.envCapacity.declareResource({
    resourceId: 'bad', resourceType: 'magic', regionId: 'x', stock: 10
  });
  a('未知资源类型被拒绝', rBad && !rBad.ok && rBad.reason === 'bad-resource-type');

  // 2. 取用
  const w1 = W.envCapacity.withdraw('water_east', 30);
  a('取用30成功', w1 && w1.ok && w1.served === 30);
  a('取用后存量为70', w1.stock === 70);
  a('取用后仍 healthy（>60%）', w1.strain === 'healthy');

  const w2 = W.envCapacity.withdraw('water_east', 30);
  a('取用30成功（累计40）', w2 && w2.ok && w2.stock === 40);
  a('取用后 strained（40%）', w2.strain === 'strained');

  const w3 = W.envCapacity.withdraw('water_east', 50);
  a('超存量取用报 shortfall', w3 && w3.ok && w3.shortfall > 0);
  a('取用后 critical（存量0）', w3.strain === 'critical');

  // 3. 再生（不凭空恢复）
  const g1 = W.envCapacity.regenerate('water_east');
  a('再生成功', g1 && g1.ok);
  a('再生恢复5（regenRate=5）', g1.recovered === 5);

  // 再生率0
  W.envCapacity.declareResource({
    resourceId: 'forest_north', resourceType: 'forest', regionId: 'north_region',
    stock: 10, maxStock: 100, regenRate: 0
  });
  const g2 = W.envCapacity.regenerate('forest_north');
  a('再生率0时不恢复', g2 && g2.ok && g2.recovered === 0);

  // 4. 区域状态
  const st = W.envCapacity.regionStatus('east_region');
  a('regionStatus 返回 ok', st && st.ok);
  a('区域有1个资源', st.count === 1);

  // 5. 行动桌路由联通
  const deskRes = W.actionDesk.plan('envCapacity.regionStatus', { regionId: 'east_region' });
  a('行动桌 envCapacity.regionStatus 路由成功', deskRes && deskRes.ok);

  // 6. 一次再生不全部恢复（非凭空）
  const before = W.envCapacity.regionStatus('east_region').resources[0].stock;
  W.envCapacity.regenerate('water_east');
  W.envCapacity.regenerate('water_east');
  const after = W.envCapacity.regionStatus('east_region').resources[0].stock;
  a('两次再生仅恢复10（5×2），不凭空恢复', after === before + 10);
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/environmental-capacity.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 破坏 strain 计算（永远 healthy）
  const anchor1 = "var ratio = entry.stock / entry.maxStock;";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "var ratio = 1;");

  const W1 = env({ 'engines/environmental-capacity.js': mutated1 });
  W1.envCapacity.declareResource({
    resourceId: 'w1', resourceType: 'water', regionId: 'r1',
    stock: 10, maxStock: 100, regenRate: 0
  });
  W1.envCapacity.withdraw('w1', 9);
  const st1 = W1.envCapacity.regionStatus('r1');
  a('负控制1: strain 破坏后即使存量大降也报 healthy（证明判据真在守）', st1.resources[0] && st1.resources[0].strain === 'healthy');

  // 变异 2: 破坏 shortfall（actual = amt 永远）
  const anchor2 = "var actual = Math.min(amt, res.stock);";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "var actual = amt;");

  const W2 = env({ 'engines/environmental-capacity.js': mutated2 });
  W2.envCapacity.declareResource({
    resourceId: 'w2', resourceType: 'water', regionId: 'r2',
    stock: 5, maxStock: 100, regenRate: 0
  });
  const w2 = W2.envCapacity.withdraw('w2', 100);
  a('负控制2: shortfall 破坏后取用不报缺口（证明判据真在守）', w2 && w2.shortfall === 0);
}


async function runAll() { await runPositive(); }
module.exports = { runAll, runNegative };

(async function main() {
  console.log('[exp25-environmental-capacity] 开始正向功能测试...');
  await runPositive();
  console.log('[exp25-environmental-capacity] 开始真变异负控制测试...');
  await runNegative();
  console.log('[exp25-environmental-capacity] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();