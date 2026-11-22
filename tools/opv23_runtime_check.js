// tools/opv23_runtime_check.js — OPV23 三段拆分运行时验证
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'tests', 'mock.js'));
const gate = require(path.join(__dirname, '..', 'tests', 'ui-gate-sync.js'));
const env = gate.fresh();
const WA = env.WA;

console.log('装载 OK');
console.log('panelOverviewBlocks:', !!WA.panelOverviewBlocks);
console.log('panelOverviewMain:', !!WA.panelOverviewMain);
console.log('panelToolsPage:', !!WA.panelToolsPage);
console.log('uiDashboards:', !!WA.uiDashboards);
console.log('WA.ui.renderV17DramaPsycheBoard:', typeof WA.ui.renderV17DramaPsycheBoard);
console.log('WA.ui.renderV20HolomapDashboard:', typeof WA.ui.renderV20HolomapDashboard);
console.log('WA.ui.renderV21CivEcoHub:', typeof WA.ui.renderV21CivEcoHub);
console.log('WA.ui.renderV19ImmersionFold:', typeof WA.ui.renderV19ImmersionFold);

// 四个大盘 headless 调用
const b1 = WA.ui.renderV17DramaPsycheBoard(null);
console.log('V17 headless:', JSON.stringify(b1).slice(0, 90));
const b2 = WA.ui.renderV20HolomapDashboard(null);
console.log('V20 headless:', JSON.stringify(b2).slice(0, 90));
const b3 = WA.ui.renderV21CivEcoHub(null);
console.log('V21 headless:', JSON.stringify(b3).slice(0, 90));
const b4 = WA.ui.renderV19ImmersionFold(null);
console.log('V19 headless:', JSON.stringify(b4).slice(0, 90));

// bind 链验证
console.log('omBind 测试：');
const r = 'skip';

const pages = WA.ui.pages();
console.log('pages:', pages.length);

// 真实渲染：切到 overview + tools
if (true) { // 用 nav 口切页（真实渲染路径）
  WA.panelNav.go('overview');
  const panelEl = env.dom.getElementById('wa-panel');
  const body = panelEl ? panelEl.querySelector('#wa-body') : null;
  console.log('overview body 长度:', body && body.innerHTML ? body.innerHTML.length : '(无 body)');
  WA.panelNav.go('tools');
  const body2 = panelEl ? panelEl.querySelector('#wa-body') : null;
  console.log('tools body 长度:', body2 && body2.innerHTML ? body2.innerHTML.length : '(无 body)');
  // 缺席降级检查：正常装载时不应出现降级行
  const ovHtml = body2 ? body2.innerHTML : '';
  // 回 overview 检查内容
  WA.panelNav.go('overview');
  const ovHtml2 = panelEl.querySelector('#wa-body') ? panelEl.querySelector('#wa-body').innerHTML : '';
  console.log('overview 渲染含降级行?', ovHtml2.indexOf('wa-overview-absent') >= 0 ? '是（坏）' : '否（好）');
  console.log('overview 渲染含全知块?', ovHtml2.indexOf('data-omniscient') >= 0 ? '是（好）' : '否（坏）');
  console.log('overview 渲染含 stat 行?', ovHtml2.indexOf('wa-cap-line') >= 0 ? '是（好）' : '否（看引擎）');
}
console.log('DONE');