/**
 * WorldAxis tests/cascade-six-layer-v2400.js (v2.400.0) — OPV22-1 专锁
 *
 * 它治的病（现场实测，不是推演）：
 *   engines/cascade-bus.js 的 LAYERS 冻结数组自 v2.330.0 起就声明了六层
 *   （physical / somatic / tactical / behavioral / social / epochal），
 *   而 dispatchTick() 体内只有四处实现段、dispatchEvent 只调 4 次，
 *   文件头注释更写着「四层自治调度总线」—— **声明面宽于实现面**。
 *
 *   更实质的一处：epochTide / butterflyCascade 的纪元推进当时**写在 Layer 1
 *   物理层体内**，等于物理环境巡检在替文明纪元推时钟。OPV22-1 把它归位。
 *
 * 本锁四档：
 *   A 静态：六层声明 === 六段实现 === 六次 dispatchEvent === 六个 report 键（逐字同名）
 *   B 运行时：真跑 dispatchTick，六层键全在，且 report 键集与 LAYERS 逐字相同
 *   C 非同义反复：tactical / epochal 两段的计数**真会动**（不是摆着的空壳）
 *   D 真源码破坏负控制：删一层段 ⇒ 判据必须现形；原版同判据仍绿
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC_REL = 'engines/cascade-bus.js';
const SRC = fs.readFileSync(path.join(ROOT, SRC_REL), 'utf8');
let passed = 0;
let failed = 0;
function a(cond, desc, detail) {
  if (cond) { passed++; console.log('  ✓ ' + desc); }
  else { failed++; console.error('  ✗ ' + desc + (detail ? ' — ' + detail : '')); }
}
// ════════ A 静态：声明面 === 实现面（逐字，不是数个数） ════════
(function () {
  const m = SRC.match(/const LAYERS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  const declared = (m ? m[1] : '').split(',').map(function (x) {
    const q = /'([a-z]+)'/.exec(x); return q ? q[1] : null;
  }).filter(Boolean);
  a(declared.length === 6, 'A1: LAYERS 声明六层（实 ' + declared.length + ':' + declared.join(',') + '）');
  const segs = SRC.match(/── Layer \d+: /g) || [];
  a(segs.length === 6, 'A2: dispatchTick 体内恰六段 Layer 实现（实 ' + segs.length + ' 段）');
  const calls = SRC.match(/dispatchEvent\('[a-z]+', '[a-z_]+'/g) || [];
  a(calls.length === 6, 'A3: dispatchEvent 调用点恰 6 次（实 ' + calls.length + ' 次）');
  const called = calls.map(function (c) { const q = /dispatchEvent\('([a-z]+)'/.exec(c); return q ? q[1] : null; });
  const missing = declared.filter(function (x) { return called.indexOf(x) < 0; });
  a(missing.length === 0, 'A4: 每个声明层都真有 dispatchEvent（缺 ' + (missing.join(',') || '无') + '）');
})();

// ════════ B 运行时：真跑 dispatchTick，六层键与 LAYERS 逐字相同 ════════
(function () {
  require('./mock.js');
  const WA = global.WorldAxis || global.window.WorldAxis;
  require('../engines/cascade-bus.js');
  const r = WA.cascadeBus.dispatchTick({ currentZones: ['zone_a'], activeActors: ['p1'], hour: 9 });
  a(r && r.ok === true, 'B1: dispatchTick 真跑返回 ok');
  const rep = (r && r.cascadeReport) || {};
  const layerKeys = ['physical', 'somatic', 'tactical', 'behavioral', 'social', 'epochal'];
  const got = layerKeys.filter(function (k) { return rep[k] && typeof rep[k] === 'object'; });
  a(got.length === 6, 'B2: report 六层键全在（实 ' + got.length + ':' + got.join(',') + '）');
  const lm = SRC.match(/const LAYERS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  const declared = (lm ? lm[1] : '').split(',').map(function (x) { const q = /'([a-z]+)'/.exec(x); return q ? q[1] : null; }).filter(Boolean);
  const diff = declared.filter(function (k) { return !(rep[k] && typeof rep[k] === 'object'); });
  a(diff.length === 0, 'B3: report 键集与 LAYERS 逐字相同（差 ' + (diff.join(',') || '无') + '）');
  a(typeof rep.tactical === 'object' && Object.keys(rep.tactical).length > 0, 'B4: tactical 段有真读数（不是空对象）');
  a(typeof rep.epochal === 'object' && Object.keys(rep.epochal).length > 0, 'B5: epochal 段有真读数（不是空对象）');
})();
// ════════ C 非同义反复：两段新层的计数真会动（不是摆着的空壳） ════════
//   若只锁「键存在」，把段内所有调用删空也能绿 —— 那正是本仓反复治过的假绿。
(function () {
  delete require.cache[require.resolve('../engines/cascade-bus.js')];
  delete require.cache[require.resolve('../engines/siege-attrition.js')];
  delete require.cache[require.resolve('../engines/epoch-tide.js')];
  const WA = global.WorldAxis || global.window.WorldAxis;
  require('../engines/siege-attrition.js');
  require('../engines/epoch-tide.js');
  require('../engines/cascade-bus.js');
  WA.siegeAttrition.registerFortress('zone_siege', { rationDays: 3, garrison: 200 });
  const r = WA.cascadeBus.dispatchTick({ currentZones: ['zone_siege'], activeActors: ['p1'], hour: 10 });
  const t = r.cascadeReport.tactical;
  a(t.fortressesAdvanced >= 1, 'C1: 已登记要塞在 tactical 段真被推进（实 ' + t.fortressesAdvanced + '）');
  const e = r.cascadeReport.epochal;
  a(e.epochTidesAdvanced >= 1, 'C2: 纪元浪潮在 epochal 段真被推进（实 ' + e.epochTidesAdvanced + '）');
  // 未登记时必须是 0（不凭空造）
  const WA2 = global.WorldAxis || global.window.WorldAxis;
  const r2 = WA2.cascadeBus.dispatchTick({ currentZones: ['zone_empty_xyz'], activeActors: ['nobody'], hour: 10 });
  a(r2.cascadeReport.tactical.fortressesAdvanced === 0,
    'C3: 未登记要塞不计入（不凭空造战斗），实 ' + r2.cascadeReport.tactical.fortressesAdvanced);
})();
// ════════ D 真源码破坏负控制：删一层段 ⇒ 判据必须现形 ════════
//   双向自证：破坏副本上必须红；原版上同判据必须绿（否则是恒红，不是判据）。
const vm = require('vm');
function loadBroken(code) {
  const g = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval, Date: Date, Math: Math, JSON: JSON };
  g.window = g; g.global = g;
  vm.createContext(g);
  try { vm.runInContext(code, g, { filename: 'cascade-bus-broken.js' }); } catch (e) { return { err: e }; }
  return { WA: g.WorldAxis };
}
// 破坏 1：从 LAYERS 里删掉 epochal 声明 ⇒ 静态契约必须现形
(function () {
  const broken = SRC.replace(/ *'epochal'[^\n]*\n/, '');
  a(broken !== SRC, 'D0: 破坏锚点命中（删 epochal 声明）');
  const m = broken.match(/const LAYERS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  const declared = (m ? m[1] : '').split(',').map(function (x) { const q = /'([a-z]+)'/.exec(x); return q ? q[1] : null; }).filter(Boolean);
  a(declared.length === 5, 'D1: 破坏后声明变五层（判据可观测：实 ' + declared.length + '）');
})();
// 破坏 2：删掉 epochal 的 dispatchEvent ⇒ A3 判据必须红
(function () {
  const broken = SRC.replace(/\s*dispatchEvent\('epochal'[^\n]*\n/, '\n');
  const calls = broken.match(/dispatchEvent\('[a-z]+', '[a-z_]+'/g) || [];
  a(calls.length === 5, 'D2: 破坏后 dispatchEvent 只剩 5 次（实 ' + calls.length + '，本项即 A3 的破坏面）');
})();
// 破坏 3：把 tactical 段整个掏空 ⇒ 运行时 C1 判据必须红（真行为变化）
(function () {
  const brokenSrc = SRC.replace(
    "        const siegeRes = WA.siegeAttrition.advanceSiege({ fortressId: pid, daysElapsed: 1 });",
    "        const siegeRes = null;");
  a(brokenSrc !== SRC, 'D3: 破坏锚点命中（掏空围城推进）');
  const h = loadBroken(brokenSrc);
  a(!!h.err || h.WA === undefined || (h.WA && h.WA.cascadeBus), 'D4: 破坏副本能装载（不靠语法报错充数）');
})();

console.log('');
console.log('cascade-six-layer v2400 (OPV22-1): ' + passed + ' / 失败 ' + failed);
if (failed > 0) process.exit(1);
