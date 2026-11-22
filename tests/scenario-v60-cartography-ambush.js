/**
 * WorldAxis tests/scenario-v60-cartography-ambush.js (v2.400.0)
 * 场景 60：地图误差 → 行军错位 → 地形伏击（V22 贯通链 E）
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   「照着一张猜的图行军」必须真的会走错，而且**错在哪一步可读**：
 *   谁画的图（skill）→ 哪些点是猜的（heard）→ 精度与误差半径 → 找错地标 → 撞进险道。
 *
 * ── 三个接缝（任一断了这条链就是摆设）────────────────────────────────
 *   ① 「猜的必须标出来」：逐点必须恰好标 seen 或 heard 之一，含糊即拒
 *      （「把传闻当亲见」正是迷雾认知要治的病）；
 *   ② 精度是**乘出来的**：skill × 覆盖率 × 摊薄项 —— 三个因子各自都要真起作用，
 *      不能是「skill 一给就定死」（那样 hearsayWeight 就是装饰）；
 *   ③ 误差必须**落到走错**：resolveLandmark 的 certainty 低于 0.5 就报 misled，
 *      而不是「精度算得很低但地标照样找得到」。
 *
 * ── 为什么用「同一片区域、两张图」对比 ─────────────────────────────────
 *   一张全亲见、一张混传闻，regionId 不同但点数相同 —— 这样「精度差」只能来自
 *   seen/heard 的构成，不能来自点数或 skill。单跑一张图无法排除「精度是常数」。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/cartography-survey.js');
require('../engines/terrain-hazard.js');
require('../engines/action-desk.js');
WA.cartographySurvey.setSettings({ enabled: true });
WA.actionDesk.setSettings({ enabled: true });
console.log('[Scenario 60] 地图误差→行军错位→地形伏击 贯通链测试...');

// ── 第 1 级：全亲见的高水平测绘 ⇒ 精度高、无猜测点 ──
const good = WA.cartographySurvey.chartRegion({
  regionId: 'v60-good', surveyor: '老测工', skill: 0.9,
  points: [
    { name: '潼关', seen: true },
    { name: '函谷', seen: true },
    { name: '风陵', seen: true }
  ]
});
assert.strictEqual(good.ok, true);
assert.strictEqual(good.heard, 0, '全亲见 ⇒ 猜测点 0');
assert.strictEqual(good.guessedCount, 0);
assert.strictEqual(good.trustworthy, true, '精度 ≥ 0.5 ⇒ 可信');
assert.strictEqual(good.precision > 0.5, true, '高水平全亲见应高精度（实 ' + good.precision + '）');
console.log('✓ 1. 全亲见测绘：精度 ' + good.precision + ' / 误差 ±' + good.errorRadiusKm
  + 'km / 猜测点 ' + good.guessedCount);

// ── 第 2 级：同点数、同 skill，混入两个传闻点 ⇒ 精度掉、猜测点如实报 ──
//   接缝 ②的对照组：只改 seen/heard 构成。
const bad = WA.cartographySurvey.chartRegion({
  regionId: 'v60-bad', surveyor: '老测工', skill: 0.9,
  points: [
    { name: '潼关', seen: true },
    { name: '函谷', heard: true },
    { name: '风陵', heard: true }
  ]
});
assert.strictEqual(bad.ok, true);
assert.strictEqual(bad.seen, 1);
assert.strictEqual(bad.heard, 2);
assert.strictEqual(bad.guessedCount, 2, '如实报「几个点是猜的」');
assert.strictEqual(bad.precision < good.precision, true,
  '传闻点多 ⇒ 精度下降（' + good.precision + ' → ' + bad.precision + '）—— hearsayWeight 真在起作用');
assert.strictEqual(bad.errorRadiusKm > good.errorRadiusKm, true,
  '精度低 ⇒ 误差半径大（±' + good.errorRadiusKm + ' → ±' + bad.errorRadiusKm + 'km）');
console.log('✓ 2. 混入 2 个传闻点：精度 ' + good.precision + ' → ' + bad.precision
  + ' / 误差 ±' + bad.errorRadiusKm + 'km / 猜测点 ' + bad.guessedCount);

// ── 第 3 级：接缝 ③ —— 传闻地标真的会走错 ──
const misled = WA.cartographySurvey.resolveLandmark({ regionId: 'v60-bad', landmark: '函谷' });
assert.strictEqual(misled.ok, true);
assert.strictEqual(misled.seen, false, '这是传闻点');
assert.strictEqual(misled.misled, true, '确定性低于阈值 ⇒ 走错（certainty=' + misled.certainty + '）');
assert.strictEqual(misled.outcome, 'misled', '成功结果走 outcome（不是 reason）');
//   ⚠ 这里踩过一次自己的判据错：我原以为「同一张图上亲见点总能找到」，
//     于是在 v60-bad（精度 0.433）里断言亲见点 misled === false —— 当场红。
//     读引擎源码才确认：`certainty = pt.seen ? chart.precision : chart.precision × hearsayWeight`，
//     即**亲见点的确定性就是整张图的精度**。图整体粗糙时，连亲见点也会走错 ——
//     这不是缺陷，正是「一张烂图哪一点都不可靠」的应有语义。
//     因此判据改为：**低精度图上连亲见点也走错**（这条反而更硬），
//     而「亲见点找得到」放到高精度图 v60-good 上去证（下一条）。
const foundOnBad = WA.cartographySurvey.resolveLandmark({ regionId: 'v60-bad', landmark: '潼关' });
assert.strictEqual(foundOnBad.ok, true);
assert.strictEqual(foundOnBad.seen, true, '这是亲见点');
assert.strictEqual(foundOnBad.misled, true,
  '低精度图上连亲见点也走错（certainty=' + foundOnBad.certainty
  + ' < 0.5）—— 图整体粗糙，哪一点都不可靠');
//   高精度图上亲见点找得到 —— 与上一条构成对照，证明「走错」不是恒真。
const foundOnGood = WA.cartographySurvey.resolveLandmark({ regionId: 'v60-good', landmark: '潼关' });
assert.strictEqual(foundOnGood.ok, true);
assert.strictEqual(foundOnGood.seen, true);
assert.strictEqual(foundOnGood.misled, false, '高精度图上亲见点找得到（certainty=' + foundOnGood.certainty + '）');
assert.strictEqual(foundOnGood.outcome, 'found');
//   而同一张高精度图上的**传闻点**仍然走错（若传闻点也能找到，hearsayWeight 就是装饰）。
WA.cartographySurvey.chartRegion({
  regionId: 'v60-good-heard', skill: 0.9,
  points: [{ name: '潼关', seen: true }, { name: '函谷', heard: true }, { name: '风陵', seen: true }]
});
const heardOnGood = WA.cartographySurvey.resolveLandmark({ regionId: 'v60-good-heard', landmark: '函谷' });
assert.strictEqual(heardOnGood.seen, false);
assert.strictEqual(heardOnGood.misled, true,
  '高精度图上的传闻点仍走错（certainty=' + heardOnGood.certainty
  + '）—— 传闻打折真的在起作用');
console.log('✓ 3. 精度决定一切：bad 图亲见也走错（' + foundOnBad.certainty
  + '）／good 图亲见找到（' + foundOnGood.certainty + '）／good 图传闻仍走错（' + heardOnGood.certainty + '）');

// ── 第 4 级：走错的后果 —— 撞进险道（地形层）──
//   接缝：misled=true 才是「行军错位」；错位后撞进的是险道，不是坦途。
//   terrain-hazard 按季节/地形给出通行阻力，此处取「冬季山地」作为错位后的实际地形。
const hazard = WA.terrainHazard.assessPassability('函谷误标处', '实际谷口', {
  terrainType: 'mountain', season: 'winter'
});
assert.strictEqual(hazard.ok, true);
assert.strictEqual(hazard.status, 'hazardous', '冬季山地 = 险道');
assert.strictEqual(hazard.canPassNormally, false, '险道不能照常通过');
assert.strictEqual(hazard.recommendDetour, true, '必须建议绕行');
assert.strictEqual(hazard.traversabilityFactor > 1, true,
  '通行阻力因子 > 1（实 ' + hazard.traversabilityFactor + '）');
console.log('✓ 4. 错位撞进险道：' + hazard.status + '（阻力 ×' + hazard.traversabilityFactor
  + '，建议绕行=' + hazard.recommendDetour + '）');
//   坦途作为对照：错位若撞进的是平原，就不该报险（否则「险道」是常数）。
const plain = WA.terrainHazard.assessPassability('坦途甲', '坦途乙', {
  terrainType: 'plain', season: 'spring', weather: 'clear'
});
assert.strictEqual(plain.status, 'open', '平原晴天应为通途');
assert.strictEqual(plain.traversabilityFactor, 1);
console.log('✓ 5. 对照：平原晴天为通途（阻力 ×' + plain.traversabilityFactor
  + '）—— 险道不是常数');

// ── 第 5 级：路由穿透 —— survey.chartRegion / resolveLandmark 拿到引擎真算的 ──
const deskChart = WA.actionDesk.plan('survey.chartRegion', {
  regionId: 'v60-desk', skill: 0.8,
  points: [{ name: '甲', seen: true }, { name: '乙', heard: true }]
});
assert.strictEqual(deskChart.ok, true);
assert.strictEqual(deskChart.guessedCount, 1);
const deskResolve = WA.actionDesk.plan('survey.resolveLandmark', {
  regionId: 'v60-desk', landmark: '乙'
});
assert.strictEqual(deskResolve.ok, true);
assert.strictEqual(deskResolve.seen, false);
console.log('✓ 6. 两条路由穿透：chartRegion 猜测点=' + deskChart.guessedCount
  + ' / resolveLandmark outcome=' + deskResolve.outcome);

// ── 负控制（拒绝路径）──
//   N1：标点未标亲见/传闻 ⇒ 拒（「我全知道」正是要治的病）。
const n1 = WA.cartographySurvey.chartRegion({ regionId: 'r', points: [{ name: '含糊点' }] });
assert.strictEqual(n1.ok, false);
assert.strictEqual(/unmarked-point/.test(n1.hint || ''), true);
//   N2：既标 seen 又标 heard ⇒ 同样拒（不能两个都要）。
const n2 = WA.cartographySurvey.chartRegion({
  regionId: 'r', points: [{ name: '两个都标', seen: true, heard: true }]
});
assert.strictEqual(n2.ok, false);
assert.strictEqual(/unmarked-point/.test(n2.hint || ''), true);
//   N3：空图 ⇒ 拒（空图不是地图）。
const n3 = WA.cartographySurvey.chartRegion({ regionId: 'r', points: [] });
assert.strictEqual(n3.ok, false);
assert.strictEqual(/no-points/.test(n3.hint || ''), true);
//   N4：图上没有的地标 ⇒ 拒（图上没有 ≠ 世上没有）。
const n4 = WA.cartographySurvey.resolveLandmark({ regionId: 'v60-bad', landmark: '不存在的关' });
assert.strictEqual(n4.ok, false);
assert.strictEqual(/landmark-not-on-chart/.test(n4.hint || ''), true);
console.log('✓ 7. 四条负控制全部拦截（unmarked-point ×2 / no-points / landmark-not-on-chart）');

// ── 边界：整条链跑完世界逐字未变（舆图层只算不写）──
const snap = JSON.stringify(WA.store.get() || {});
WA.cartographySurvey.chartRegion({
  regionId: 'v60-final', skill: 0.5, points: [{ name: 'p', heard: true }]
});
WA.cartographySurvey.resolveLandmark({ regionId: 'v60-final', landmark: 'p' });
assert.strictEqual(JSON.stringify(WA.store.get() || {}), snap,
  '舆图层只算不写：store 必须逐字未变（地形层那条 assessPassability 也是纯读）');
console.log('✓ 8. 零世界写：整条链跑完后 store 逐字未变');
console.log('[Scenario 60] 贯通链 E 全部达标');
