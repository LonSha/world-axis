'use strict';
// WorldAxis tests/exp22-scene-narrative-v2232.js
// 验证 OP-8 场景与历史按因果讲清楚：场景聚合、已结束事项、因果追溯、场外感知、真变异负控制

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

  a('sceneNarrative 模块已加载', !!W.sceneNarrative);
  a('currentScene 为函数', typeof W.sceneNarrative.currentScene === 'function');
  a('resolvedSummary 为函数', typeof W.sceneNarrative.resolvedSummary === 'function');
  a('traceFrom 为函数', typeof W.sceneNarrative.traceFrom === 'function');
  a('perceivedHorizon 为函数', typeof W.sceneNarrative.perceivedHorizon === 'function');

  // 1. 当前场景聚合
  const sc = W.sceneNarrative.currentScene();
  a('currentScene 返回 ok', sc && sc.ok);
  a('场景有 storyLabel 或为空（不崩溃）', sc && typeof sc.storyLabel === 'string');
  a('场景有 present（数组）', sc && Array.isArray(sc.present));
  a('场景有 pendingChanges（数组）', sc && Array.isArray(sc.pendingChanges));
  a('场景有 availableActions（数组）', sc && Array.isArray(sc.availableActions));

  // 2. 种入因果链与已结束事项
  W.store.transact(function (d) {
    d.causal = d.causal || { chains: [] };
    d.causal.chains = d.causal.chains || [];
    d.causal.chains.push({
      id: 'chain_bridge_repair',
      title: '桥梁维修',
      status: 'settled',
      action: '组织工匠修复东桥',
      cost: '银元×20 工日×3',
      affected: ['张三', '李四'],
      immediate: '东桥恢复通行，工期三天',
      at: 100,
      settledAt: 103
    });
    d.causal.chains.push({
      id: 'chain_road_block',
      title: '道路阻断',
      status: 'pending',
      action: '尚未派人查看',
      at: 110
    });
    d.chronicle = d.chronicle || [];
    d.chronicle.push({
      id: 'chr_research_done',
      kind: 'resolved',
      title: '研究完成',
      summary: '完成纺织工艺研究',
      cost: '银元×50',
      refs: ['张三'],
      note: '新配方已解锁',
      at: 105,
      visibility: 'visible'
    });
    return true;
  }, 'test:seed');

  // 3. 已结束事项摘要
  const rs = W.sceneNarrative.resolvedSummary();
  a('resolvedSummary 返回 ok', rs && rs.ok);
  a('已结束事项有至少2条', rs && rs.rows.length >= 2);
  const bridge = rs.rows.filter(function (r) { return r.ref === 'cau:chain_bridge_repair'; })[0];
  a('桥梁维修事项有做了什么', bridge && bridge.whatWasDone.indexOf('工匠') >= 0);
  a('桥梁维修事项有付了什么', bridge && bridge.whatWasPaid.indexOf('银元') >= 0);
  a('桥梁维修事项有影响谁', bridge && bridge.affectedWhom.indexOf('张三') >= 0);
  a('桥梁维修事项有留下什么', bridge && bridge.whatRemained.indexOf('通行') >= 0);

  // 4. 因果追溯
  const tr = W.sceneNarrative.traceFrom('chain_bridge_repair');
  a('traceFrom 返回 ok', tr && tr.ok);
  a('追溯到至少1条因果链', tr && tr.count >= 1);
  a('追溯结果有 settled 标注', tr.traces[0] && tr.traces[0].settled === true);

  // 5. 场外感知
  const ph = W.sceneNarrative.perceivedHorizon('张三');
  a('perceivedHorizon 返回 ok', ph && ph.ok);
  a('场外感知有 horizonEvents（数组）', ph && Array.isArray(ph.horizonEvents));

  // 6. 行动桌路由联通
  const deskRes = W.actionDesk.plan('sceneNarrative.currentScene', {});
  a('行动桌 sceneNarrative.currentScene 路由成功', deskRes && deskRes.ok);
  const deskTr = W.actionDesk.plan('sceneNarrative.traceFrom', { seed: 'chain_bridge_repair' });
  a('行动桌 sceneNarrative.traceFrom 路由成功', deskTr && deskTr.ok && deskTr.count >= 1);

  // 7. hidden 条目不进视图
  W.store.transact(function (d) {
    d.chronicle.push({
      id: 'chr_secret',
      kind: 'resolved',
      title: '秘密会议',
      summary: '不应出现',
      at: 108,
      visibility: 'hidden'
    });
    return true;
  }, 'test:hidden');
  const rs2 = W.sceneNarrative.resolvedSummary();
  const hasSecret = rs2.rows.some(function (r) { return r.title === '秘密会议'; });
  a('hidden 条目不进已结束事项视图', !hasSecret);
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/scene-narrative.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 破坏 hidden 过滤
  const anchor1 = "if (clean(c.visibility, 20) === 'hidden') return;";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "// hidden filter removed");

  const W1 = env({ 'engines/scene-narrative.js': mutated1 });
  // 种入 hidden 条目
  W1.store.transact(function (d) {
    d.chronicle = [{ id: 'chr_secret', kind: 'resolved', title: '秘密会议', summary: '不应出现', at: 108, visibility: 'hidden' }];
    return true;
  }, 'test:neg1');
  const rs1 = W1.sceneNarrative.resolvedSummary();
  const hasSecret1 = rs1.rows.some(function (r) { return r.title === '秘密会议'; });
  a('负控制1: hidden 过滤破坏后秘密条目泄漏（证明判据真在守）', hasSecret1);

  // 变异 2: 破坏 settled 过滤，让所有 chain 都进 resolvedSummary
  const anchor2 = "if (st === 'settled' || st === 'terminal' || st === 'resolved' || st === 'closed') {";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "if (true) {");

  const W2 = env({ 'engines/scene-narrative.js': mutated2 });
  W2.store.transact(function (d) {
    d.causal = { chains: [{ id: 'ch_pending', title: '未决', status: 'pending', at: 1 }] };
    return true;
  }, 'test:neg2');
  const rs2 = W2.sceneNarrative.resolvedSummary();
  const hasPending = rs2.rows.some(function (r) { return r.title === '未决'; });
  a('负控制2: settled 过滤破坏后 pending 也进已结束（证明判据真在守）', hasPending);
}

(async function main() {
  console.log('[exp22-scene-narrative] 开始正向功能测试...');
  await runPositive();
  console.log('[exp22-scene-narrative] 开始真变异负控制测试...');
  await runNegative();
  console.log('[exp22-scene-narrative] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();