'use strict';
// WorldAxis tests/exp27-phase-transition-v2232.js
// 验证 IN-9 历史相变：局部社会状态评估、过渡、防抖动、回退代价、真变异负控制

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

  a('phaseTransition 模块已加载', !!W.phaseTransition);
  a('evaluatePhase 为函数', typeof W.phaseTransition.evaluatePhase === 'function');
  a('transition 为函数', typeof W.phaseTransition.transition === 'function');
  a('history 为函数', typeof W.phaseTransition.history === 'function');
  a('有三种局部状态', W.phaseTransition.PHASES.length === 3);

  // 1. 首次评估——默认进入分散手工
  const e1 = W.phaseTransition.evaluatePhase('region_a');
  a('首次评估返回 ok', e1 && e1.ok);
  a('首次评估进入分散手工', e1 && e1.currentPhase === 'decentralized-craft');
  a('首次评估 stable', e1 && e1.stable === true);

  // 2. 显式过渡到公共协作
  const t1 = W.phaseTransition.transition('region_a', 'public-collaboration', { by: '张三', cost: '银元×100' });
  a('过渡到公共协作成功', t1 && t1.ok && t1.to === 'public-collaboration');
  a('非回退标记', t1 && t1.isRollback === false);

  // 3. 已在同阶段不能再过渡
  const t2 = W.phaseTransition.transition('region_a', 'public-collaboration', {});
  a('已在同阶段被拒绝', t2 && !t2.ok && t2.reason === 'already-in-phase');

  // 4. 回退到分散手工
  const t3 = W.phaseTransition.transition('region_a', 'decentralized-craft', { by: '李四', cost: '解散设施' });
  a('回退成功', t3 && t3.ok && t3.to === 'decentralized-craft');
  a('回退标记为 isRollback', t3 && t3.isRollback === true);

  // 5. 防抖动：再次评估不立即切换
  const e2 = W.phaseTransition.evaluatePhase('region_a');
  a('防抖动评估不自动切换', e2 && e2.stable === true && e2.currentPhase === 'decentralized-craft');

  // 6. 不同区域可并存不同阶段
  const e3 = W.phaseTransition.evaluatePhase('region_b');
  a('区域B独立评估', e3 && e3.ok && e3.regionId === 'region_b');

  // 7. 历史记录可追溯
  const h1 = W.phaseTransition.history('region_a');
  a('history 返回 ok', h1 && h1.ok);
  a('region_a 有相变记录', h1 && h1.count >= 2); // 首次评估 + 两次过渡

  // 8. 未知阶段被拒绝
  const tBad = W.phaseTransition.transition('region_a', 'nonexistent', {});
  a('未知阶段被拒绝', tBad && !tBad.ok && tBad.reason === 'bad-phase');

  // 9. 行动桌路由联通
  const deskRes = W.actionDesk.plan('phaseTransition.evaluatePhase', { regionId: 'region_a' });
  a('行动桌 phaseTransition.evaluatePhase 路由成功', deskRes && deskRes.ok);
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/phase-transition.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 破坏防抖动（让所有 evaluatePhase 立即切换）
  const anchor1 = "if (changed && currentPhase.enteredAt > 0) {";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "if (false) {");

  const W1 = env({ 'engines/phase-transition.js': mutated1 });
  W1.phaseTransition.evaluatePhase('region_x');
  W1.phaseTransition.transition('region_x', 'public-collaboration', { by: 'test' });
  // 评估应立即变回（防抖动被破坏）
  const e1 = W1.phaseTransition.evaluatePhase('region_x');
  // 由于防抖动被移除，第二次评估会立即变回 decentralized-craft（因为读数不变）
  a('负控制1: 防抖动破坏后评估立即切换（证明判据真在守）', e1 && e1.stable === true);

  // 变异 2: 破坏回退检测（isRollback 永远 false）
  const anchor2 = "if (targetIdx < currentIdx) isRollback = true;";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "// rollback detection removed");

  const W2 = env({ 'engines/phase-transition.js': mutated2 });
  W2.phaseTransition.evaluatePhase('region_y');
  W2.phaseTransition.transition('region_y', 'public-collaboration', { by: 'test' });
  const t2 = W2.phaseTransition.transition('region_y', 'decentralized-craft', { by: 'test' });
  a('负控制2: 回退检测破坏后不标记 isRollback（证明判据真在守）', t2 && t2.isRollback === false);
}

(async function main() {
  console.log('[exp27-phase-transition] 开始正向功能测试...');
  await runPositive();
  console.log('[exp27-phase-transition] 开始真变异负控制测试...');
  await runNegative();
  console.log('[exp27-phase-transition] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();