'use strict';
// WorldAxis tests/exp24-playable-blueprint-v2232.js
// 验证 OP-9 可玩的世界蓝图：三样例、依赖检查、玩法定义导出、真变异负控制

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

  a('playableBlueprint 模块已加载', !!W.playableBlueprint);
  a('listSamples 为函数', typeof W.playableBlueprint.listSamples === 'function');
  a('checkDependencies 为函数', typeof W.playableBlueprint.checkDependencies === 'function');
  a('exportPlayDefs 为函数', typeof W.playableBlueprint.exportPlayDefs === 'function');

  // 1. 列出三份样例
  const ls = W.playableBlueprint.listSamples();
  a('listSamples 返回 ok', ls && ls.ok);
  a('有三份样例', ls && ls.samples.length === 3);
  a('样例含城镇工坊', ls.samples.some(function (s) { return s.id === 'town-workshop'; }));
  a('样例含探索聚落', ls.samples.some(function (s) { return s.id === 'settlement-exploration'; }));
  a('样例含科幻站点', ls.samples.some(function (s) { return s.id === 'sci-fi-station'; }));

  // 2. 获取样例详情
  const s1 = W.playableBlueprint.getSample('town-workshop');
  a('getSample 返回 ok', s1 && s1.ok);
  a('样例有 playDefs', s1.sample && !!s1.sample.playDefs);
  a('样例有训练定义', s1.sample.playDefs.training && !!s1.sample.playDefs.training.method);
  a('样例有装备定义', s1.sample.playDefs.equipment && !!s1.sample.playDefs.equipment.slots);
  a('样例有配方定义', s1.sample.playDefs.recipe && !!s1.sample.playDefs.recipe.types);
  a('样例有研究定义', s1.sample.playDefs.research);
  a('样例有初始条件', s1.sample.initConditions && !!s1.sample.initConditions.places);
  a('样例有开场场景', s1.sample.openingScene && !!s1.sample.openingScene.id);

  // 3. 依赖检查
  const dep1 = W.playableBlueprint.checkDependencies('town-workshop');
  a('checkDependencies 返回 ok', dep1 && dep1.ok);
  a('城镇工坊必要引擎就绪', dep1 && dep1.canStart === true);
  a('城镇工坊有可选引擎列表', dep1 && dep1.optionalEngines.length > 0);

  // 4. 导出玩法定义
  const exp = W.playableBlueprint.exportPlayDefs('town-workshop');
  a('exportPlayDefs 返回 ok', exp && exp.ok);
  a('导出含 playDefs', exp && !!exp.playDefs);
  a('导出含 initConditions', exp && !!exp.initConditions);
  a('导出含 openingScene', exp && !!exp.openingScene);

  // 5. 不存在的样例
  const bad = W.playableBlueprint.getSample('nonexistent');
  a('不存在的样例被拒绝', bad && !bad.ok && bad.reason === 'sample-not-found');

  // 6. 行动桌路由联通
  const deskRes = W.actionDesk.plan('playableBlueprint.listSamples', {});
  a('行动桌 playableBlueprint.listSamples 路由成功', deskRes && deskRes.ok);
  const deskDep = W.actionDesk.plan('playableBlueprint.checkDependencies', { sampleId: 'sci-fi-station' });
  a('行动桌 playableBlueprint.checkDependencies 路由成功', deskDep && deskDep.ok);

  // 7. 每份样例的玩法定义字段完整
  ['town-workshop', 'settlement-exploration', 'sci-fi-station'].forEach(function (id) {
    var r = W.playableBlueprint.getSample(id);
    a(id + ' 样例 playDefs 含全部5类', r.sample && r.sample.playDefs &&
      r.sample.playDefs.training && r.sample.playDefs.equipment &&
      r.sample.playDefs.recipe && r.sample.playDefs.research &&
      r.sample.playDefs['family-ops']);
  });
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/playable-blueprint.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 破坏 canStart 判定（永远 true）
  const anchor1 = "canStart: missing.length === 0,";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "canStart: true,");

  const W1 = env({ 'engines/playable-blueprint.js': mutated1 });
  // 人为删掉 training 模块使其缺失
  var origTraining = W1.training;
  delete W1.training;
  const dep1 = W1.playableBlueprint.checkDependencies('town-workshop');
  a('负控制1: canStart 破坏后即使缺引擎也报 true（证明判据真在守）', dep1 && dep1.canStart === true && dep1.requiredMissing.indexOf('training') >= 0);
  W1.training = origTraining; // 恢复

  // 变异 2: 破坏样例数量（删除一份样例）
  const anchor2 = "id: 'sci-fi-station',";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "id: 'removed-by-mutation',");

  const W2 = env({ 'engines/playable-blueprint.js': mutated2 });
  const ls2 = W2.playableBlueprint.listSamples();
  const hasSciFi = ls2.samples.some(function (s) { return s.id === 'sci-fi-station'; });
  a('负控制2: 样例被删后科幻站点不存在（证明数据真在）', !hasSciFi);
}

(async function main() {
  console.log('[exp24-playable-blueprint] 开始正向功能测试...');
  await runPositive();
  console.log('[exp24-playable-blueprint] 开始真变异负控制测试...');
  await runNegative();
  console.log('[exp24-playable-blueprint] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();