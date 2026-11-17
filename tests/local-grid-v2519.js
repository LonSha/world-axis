'use strict';
// v2.519.0 localGrid：分形局部网格 / 区域平面求解器回归
// 机制来源：tavern-map-extension v0.7.3 的 assignLayout 求解链
const h = require('./v8-harness.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  <' + extra + '>' : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'want ' + b + ' got ' + a); }

console.log('\n[localGrid v2.519.0]');

// ── 1 默认关闭（与 atlas / region 同款）
(function () {
  const W = h.load();
  eq('default disabled', W.localGrid.settings().enabled, false);
  eq('disabled rejects', W.localGrid.registerVenue({ name: 'X' }).reason, 'disabled');
  eq('version', W.localGrid.version, '2.521.0');
})();

// ── 2 三层归属校验
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  eq('missingvenue', LG.registerSpot({ zone: 'z', name: 'n' }).reason, 'missing-venue');
  eq('missingzone', LG.registerSpot({ venue: 'v', name: 'n' }).reason, 'missing-zone');
  eq('unknown-venue', LG.registerSpot({ venue: 'nogood', zone: 'z', name: 'n' }).reason, 'unknown-venue');
  LG.registerVenue({ name: 'V1', region: 'R' });
  eq('unknown-zone', LG.registerSpot({ venue: 'V1', zone: 'nz', name: 'n' }).reason, 'unknown-zone');
  LG.registerZone({ venue: 'V1', zone: 'Z1' });
  eq('missing-name', LG.registerSpot({ venue: 'V1', zone: 'Z1' }).reason, 'missing-name');
  ok('spot accepted', LG.registerSpot({ venue: 'V1', zone: 'Z1', name: 'n' }).ok);
})();

// ── 3 坐标留空不臆造 + 显式坐标生效
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  const r1 = LG.registerSpot({ venue: 'V', zone: 'Z', name: 'blank' });
  eq('blank not positioned', r1.positioned, false);
  const r2 = LG.registerSpot({ venue: 'V', zone: 'Z', name: 'explicit', x: 2, y: 3 });
  eq('explicit positioned', r2.positioned, true);
  const plan = LG.getZone('V', 'Z', { fresh: true });
  eq('explicit x kept', plan.cells['explicit'].x, 2);
  eq('explicit y kept', plan.cells['explicit'].y, 3);
  ok('blank still placed', !!plan.cells['blank']);
})();

// ── 4 同区域撞点由 nearestFree 消解（不叠格，如实计数）
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  const r = LG.registerSpot({ venue: 'V', zone: 'Z', name: 'a', x: 1, y: 1 });
  eq('first at 1,1 no collision', r.collision, undefined);
  const r2 = LG.registerSpot({ venue: 'V', zone: 'Z', name: 'b', x: 1, y: 1 });
  eq('second reports collision', r2.collision, true);
  ok('holder named', (r2.holders || []).indexOf('a') >= 0);
  const plan = LG.getZone('V', 'Z', { fresh: true });
  const used = {};
  let dup = 0;
  Object.keys(plan.cells).forEach(function (k) {
    const p = plan.cells[k], key = p.x + ',' + p.y;
    if (used[key]) dup++; else used[key] = 1;
  });
  eq('no overlapping cells', dup, 0);
})();

// ── 5 BFS 方位推导（双向登记，从任一端都能推导对端）
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'hub', x: 0, y: 0 });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'east1', adj: [{ name: 'hub', dir: 'west' }] });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'south1', adj: [{ name: 'hub', dir: 'north' }] });
  const plan = LG.getZone('V', 'Z', { fresh: true });
  eq('east1 x', plan.cells['east1'].x, 1);
  eq('east1 y', plan.cells['east1'].y, 0);
  eq('south1 x', plan.cells['south1'].x, 0);
  eq('south1 y', plan.cells['south1'].y, 1);
  eq('streamed 0', plan.streamed, 0);
})();

// ── 6 跨域绝不给距离
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'VA', region: 'RA' });
  LG.registerVenue({ name: 'VB', region: 'RB' });
  LG.registerZone({ venue: 'VA', zone: 'Z1' });
  LG.registerZone({ venue: 'VA', zone: 'Z2' });
  LG.registerZone({ venue: 'VB', zone: 'Z1' });
  LG.registerSpot({ venue: 'VA', zone: 'Z1', name: 'p', x: 0, y: 0 });
  LG.registerSpot({ venue: 'VA', zone: 'Z2', name: 'q', x: 0, y: 0 });
  LG.registerSpot({ venue: 'VB', zone: 'Z1', name: 'r', x: 0, y: 0 });
  const same = LG.relate({ venue: 'VA', zone: 'Z1', name: 'p' }, { venue: 'VA', zone: 'Z1', name: 'p' });
  eq('same spot', same.same, true);
  const cz = LG.relate({ venue: 'VA', zone: 'Z1', name: 'p' }, { venue: 'VA', zone: 'Z2', name: 'q' });
  eq('cross-zone refused', cz.reason, 'cross-zone');
  eq('cross-zone no distance', cz.distance, null);
  const cv = LG.relate({ venue: 'VA', zone: 'Z1', name: 'p' }, { venue: 'VB', zone: 'Z1', name: 'r' });
  eq('cross-venue refused', cv.reason, 'cross-venue');
  eq('cross-venue no distance', cv.distance, null);
})();

// ── 7 同域方位文本
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'a', x: 0, y: 0 });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'b', x: 2, y: 0 });
  const r = LG.relate({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'V', zone: 'Z', name: 'b' });
  eq('steps', r.steps, 2);
  eq('dir', r.dir, 'east');
  ok('text mentions 东', r.text.indexOf('东') >= 0, r.text);
})();

// ── 8 单向通道保留（消防门/单行楼梯是真实结构）
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'a', x: 0, y: 0 });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'b', x: 1, y: 0 });
  const r = LG.link('a', 'b', { bidirectional: false, dir: 'east', kind: 'fire-door' });
  eq('only one edge added', r.added, 1);
  eq('fwd exists', LG.linked('a', 'b').fwd, true);
  eq('back absent', LG.linked('a', 'b').back, false);
  eq('state oneway', LG.linked('a', 'b').state, 'oneway');
  eq('reverse view', LG.linked('b', 'a').state, 'reverse');
})();

// ── 9 双向边默认补反向
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  const r = LG.link('a', 'b', { dir: 'east' });
  eq('two edges', r.added, 2);
  eq('both state', LG.linked('a', 'b').state, 'both');
})();

// ── 10 buildBlock 只喂同域，不喂跨域
(function () {
  const W = h.load(), LG = W.localGrid;
  eq('block empty when disabled', LG.buildBlock({ venue: 'V', zone: 'Z' }), '');
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'me', x: 0, y: 0 });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'near', x: 1, y: 0 });
  const b = LG.buildBlock({ venue: 'V', zone: 'Z', spot: 'me' });
  ok('block names venue', b.indexOf('V') >= 0, b);
  ok('block names near', b.indexOf('near') >= 0, b);
  ok('block has no meter', b.indexOf('米') < 0, b);
})();

// ── 11 容量有界
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true, maxVenues: 8 });
  for (let i = 0; i < 8; i++) LG.registerVenue({ name: 'V' + i });
  eq('cap hit', LG.registerVenue({ name: 'V9' }).reason, 'venues-full');
})();

// ── 12 自检
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 's', x: 0, y: 0 });
  const sc = LG.selfCheck();
  eq('selfCheck ok', sc.ok, true);
  eq('selfCheck spots', sc.spots, 1);
  eq('selfCheck issues', sc.issues.length, 0);
})();

// ── 13 只读平面取数 peekVenue（面板平面图的唯一数据面：不求解、不写 store）
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  eq('peek missing venue', LG.peekVenue('').reason, 'missing-venue');
  eq('peek unknown venue', LG.peekVenue('nope').reason, 'unknown-venue');
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'a', x: 0, y: 0 });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'b', adj: ['a'] });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'c' });
  const solvedBefore = JSON.stringify(LG._root().solved || {});
  const solvedCountBefore = LG.stats().solved || 0;
  const p1 = LG.peekVenue('V');
  eq('peek ok', p1.ok, true);
  eq('peek zone count', p1.zones.length, 1);
  eq('peek source raw', p1.zones[0].source, 'raw');
  eq('peek placed raw (only explicit)', p1.zones[0].placed, 1);
  eq('peek total', p1.zones[0].total, 3);
  eq('peek edges empty when raw', p1.zones[0].edges.length, 0);
  eq('peek cell src raw', p1.zones[0].cells.a.src, 'raw');
  eq('peek zero-write (solved cache untouched)', JSON.stringify(LG._root().solved || {}), solvedBefore);
  eq('peek zero-solve (stat.solved untouched)', LG.stats().solved || 0, solvedCountBefore);
  LG.getZone('V', 'Z');
  const p2 = LG.peekVenue('V');
  eq('peek source solved', p2.zones[0].source, 'solved');
  eq('peek placed solved', p2.zones[0].placed, 3);
  ok('peek edges when solved', p2.zones[0].edges.length >= 1, 'edges=' + p2.zones[0].edges.length);
  eq('peek cell src solved', p2.zones[0].cells.a.src, 'solved');
  eq('peek region', p2.region, 'R');
})();
// ── 14 只读方位 relatePeek（面板/提示词的邻居查询：绝不求解、绝不写）
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: 'V', region: 'R' });
  LG.registerZone({ venue: 'V', zone: 'Z' });
  LG.registerZone({ venue: 'V', zone: 'Z2' });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'a', x: 0, y: 0 });
  LG.registerSpot({ venue: 'V', zone: 'Z', name: 'b', x: 3, y: 0 });
  LG.registerSpot({ venue: 'V', zone: 'Z2', name: 'c', x: 0, y: 0 });
  const r0 = LG.relatePeek({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'V', zone: 'Z', name: 'b' });
  eq('relatePeek unsolved rejects', r0.reason, 'zone-unsolved');
  eq('relatePeek did not solve', JSON.stringify(LG._root().solved || {}), '{}');
  LG.getZone('V', 'Z');
  const r1 = LG.relatePeek({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'V', zone: 'Z', name: 'b' });
  eq('relatePeek ok', r1.ok, true);
  eq('relatePeek steps', r1.steps, 3);
  eq('relatePeek dir', r1.dir, 'east');
  ok('relatePeek text has 格', r1.text.indexOf('格') >= 0, r1.text);
  ok('relatePeek text no 米', r1.text.indexOf('米') < 0, r1.text);
  eq('relatePeek same', LG.relatePeek({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'V', zone: 'Z', name: 'a' }).same, true);
  eq('relatePeek cross-zone', LG.relatePeek({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'V', zone: 'Z2', name: 'c' }).reason, 'cross-zone');
  eq('relatePeek cross-venue', LG.relatePeek({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'X', zone: 'Z', name: 'c' }).reason, 'cross-venue');
  eq('relatePeek cross-venue distance null', LG.relatePeek({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'X', zone: 'Z', name: 'c' }).distance, null);
  const r2 = LG.relate({ venue: 'V', zone: 'Z', name: 'a' }, { venue: 'V', zone: 'Z', name: 'b' });
  eq('relate agrees dir (single judge)', r2.dir, r1.dir);
  eq('relate agrees steps (single judge)', r2.steps, r1.steps);
})();
// ── 15 预热 preheat（把面板的虚线格变实线：显式、有上限、单一写路径）
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  eq('preheat off by default', LG.settings().preheatMax, 0);
  eq('preheat off = budget-0', LG.preheat().skipped, 'budget-0');
  LG.registerVenue({ name: 'V1' });
  LG.registerZone({ venue: 'V1', zone: 'Z1' });
  LG.registerZone({ venue: 'V1', zone: 'Z2' });
  LG.registerVenue({ name: 'V2' });
  LG.registerZone({ venue: 'V2', zone: 'Z1' });
  LG.registerSpot({ venue: 'V1', zone: 'Z1', name: 'a', x: 0, y: 0 });
  LG.registerSpot({ venue: 'V1', zone: 'Z1', name: 'b', adj: ['a'] });
  LG.registerSpot({ venue: 'V1', zone: 'Z2', name: 'c', x: 1, y: 1 });
  LG.registerSpot({ venue: 'V2', zone: 'Z1', name: 'd', x: 0, y: 0 });
  const r1 = LG.preheat(2);
  eq('preheat warmed = budget', r1.warmed, 2);
  eq('两个平面进了缓存', Object.keys(LG._root().solved || {}).length, 2);
  const r2 = LG.preheat(2);
  eq('已有缓存不重算', r2.warmed, 0);
  eq('跳过的都是已缓存', r2.skippedCached, 2);
  const r3 = LG.preheat(999);
  eq('上限钳到 64 后仍只捞剩下的', r3.warmed, 1);
  eq('全部三个平面就位', Object.keys(LG._root().solved || {}).length, 3);
  eq('预算 0 不动作', LG.preheat(0).warmed, 0);
  LG.saveSettings({ enabled: false });
  eq('关闭时拒绝', LG.preheat(3).reason, 'disabled');
})();
// ── 相邻声明记账：读数必须和图上画的边一致 ──
//   素材导入只填「相邻地点」字段、从不调 link()，若只报 links 就会「图上有边、读数 0」。
(function () {
  const W = h.load(), LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  const base = LG.stats().adjDeclared || 0;
  LG.registerVenue({ name: 'V3', region: 'R' });
  LG.registerZone({ venue: 'V3', zone: 'Z1' });
  LG.registerSpot({ venue: 'V3', zone: 'Z1', name: 'p1', x: 0, y: 0, adj: ['p2', 'p3'] });
  LG.registerSpot({ venue: 'V3', zone: 'Z1', name: 'p2', x: 1, y: 0 });
  eq('adj 声明进统计', (LG.stats().adjDeclared || 0) - base, 2);
  LG.registerSpot({ venue: 'V3', zone: 'Z1', name: 'p1', x: 0, y: 0, adj: ['p2', 'p3'] });
  eq('同一 spot 重登记不重复累加', (LG.stats().adjDeclared || 0) - base, 2);
  LG.registerSpot({ venue: 'V3', zone: 'Z1', name: 'p1', x: 0, y: 0, adj: ['p2'] });
  eq('改小后按增量退账', (LG.stats().adjDeclared || 0) - base, 1);
  ok('显式 link 与 adj 声明分列两个字段', typeof LG.stats().links === 'number');
})();
console.log('\n[localGrid] pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;
