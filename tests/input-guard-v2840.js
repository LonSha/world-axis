#!/usr/bin/env node
// WorldAxis tests/input-guard-v2840.js — 统一输入边界专锁（v2.84.0 A2 第一批）
//
// 治的病（两族都是 v2.79.0 已实证的，本版才真正动手）：
//   ① **静默升格**：约 28 个引擎各写一份 `clean(v, max) = String(v == null ? '' : v).replace(...)`，
//      于是 NaN → 'NaN'、对象 → '[object Object]'。实测 `survival.set('甲', NaN)` 建出全 null
//      读数并报 ok；`temporalLock.lock(NaN)` 上锁成功且 label='NaN'；`threads.open(NaN)`
//      立出一桩名叫「NaN」的悬案。一次「参数传错」被记成「世界里真发生了这件事」。
//   ② **敌意toString抛出**：同段兜底对带敌意 toString 的对象直接抛，而调用它的多是
//      巡检路径（sweep/体积审计/孤儿盘点）——一个抛打断整轮巡检，于是
//      「巡检没查出问题」与「巡检没跑完」在读数上不可分。
//
// 本锁四个方向都要证：
//   A 结构：边界模块在 LOAD 里、在现场、导出面齐；**8 个迁移站点**的入口行不再自备兜底（锚点各恰 1 次）。
//   B 现场：整张坏输入矩阵过边界后零外抛、零升格；好输入照常通过（判据不是恒拒）。
//   C 实质：真源码破坏（把 rawText 退回 String(v)、把某站点退回 clean()）⇒ 行为判据必须现形。
//   D 非空转：矩阵非空、且「拒绝」真发生过；原始 clean() 的同款输入确实会升格（对照）。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');

// 坏输入矩阵：与 v2.79.0 同源（本锁自己再列一份，避免「借来的矩阵被改而本锁不知」）
const BAD = [
  ['undefined', undefined], ['null', null], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
  ['-0', -0], ['empty', ''], ['spaces', '   '], ['zero', 0], ['negOne', -1], ['big', 1e308],
  ['obj', {}], ['arr', []], ['fn', function () {}], ['t', true], ['f', false], ['hugeStr', 'x'.repeat(5000)],
  ['evilObj', { toString: function () { throw new Error('boom'); } }],
  ['proto', Object.create(null)], ['badDate', new Date(NaN)]
];

// 迁移站点登记：入口行（破坏锚点）必须已切到 WA.inputGuard.*
const MIGRATED = [
  { name: 'hazard.bump', rel: 'engines/hazard.js', anchor: "  function bump(key) {\n    // v2.84.0：走统一输入边界（NaN/对象不再被升格成 'NaN'/'[object Object]'）\n    const k = WA.inputGuard.text(key, 60);\n" },
  { name: 'hazard.drop', rel: 'engines/hazard.js', anchor: "  function drop(key) {\n    const k = WA.inputGuard.text(key, 60);\n" },
  { name: 'karma.record', rel: 'engines/karma.js', anchor: "    const w = WA.inputGuard.text(who, 40);\n    // 枚举归一走边界层" },
  { name: 'karma.drop', rel: 'engines/karma.js', anchor: "  function drop(who) {\n    const w = WA.inputGuard.text(who, 40);\n" },
  { name: 'ladder.drop', rel: 'engines/ladder.js', anchor: "    const w = WA.inputGuard.text(who, 40), k = WA.inputGuard.text(kind, 24);\n" },
  { name: 'enigma.mark', rel: 'engines/enigma.js', anchor: "    const key = WA.inputGuard.text(secret, 60), who = WA.inputGuard.text(knower, 40);\n" },
  { name: 'enigma.drop', rel: 'engines/enigma.js', anchor: "  function drop(secret) {\n    const key = WA.inputGuard.text(secret, 60);\n" },
  { name: 'tolerance.drop', rel: 'engines/tolerance.js', anchor: "  function drop(key) {\n    const k = WA.inputGuard.text(key, 48);\n" },
  { name: 'marginal.drop', rel: 'engines/marginal.js', anchor: "  function drop(who) {\n    const w = WA.inputGuard.text(who, 40);\n" },
  { name: 'parallelEvents.add', rel: 'engines/parallel-events.js', anchor: "    const t = WA.inputGuard.text(title, 40), loc = WA.inputGuard.text(location, 40);\n" },
  { name: 'parallelEvents.cast', rel: 'engines/parallel-events.js', anchor: "    const cast = WA.inputGuard.list(persons, MAX_PERSONS + 1, 24);\n" },
  { name: 'fondness.apply', rel: 'engines/fondness.js', anchor: "    const who = WA.inputGuard.text(person, 40);\n" }
];

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts || {}).WA; }
function isolated(fn) {
  const LS = global.localStorage;
  const snap = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) snap.push([k, LS.getItem(k)]); }
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally {
    if (WA0 && origLog) WA0.log = origLog;
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !snap.some(function (x) { return x[0] === k; })) drop.push(k); }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    snap.forEach(function (x) { try { LS.setItem(x[0], x[1]); } catch (e) {} });
  }
}

// ── 旧兜底对照：证明「升格」这件事真实存在（否则新判据可能是空转）──
function legacyClean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }

/** 症状：整张矩阵过边界后有没有「外抛」或「升格」 */
function probeMatrix(WA) {
  const Ig = WA.inputGuard;
  const threw = [], upgraded = [];
  BAD.forEach(function (b) {
    let out = null;
    try {
      out = { text: Ig.text(b[1], 60), num: Ig.num(b[1], NaN), check: Ig.check(b[1]).reason };
    } catch (e) { threw.push(b[0] + ':' + e.message); return; }
    if (!out.text) return;                                  // 空串是正确的兜底结果
    if (/^NaN$|^Infinity$|^-Infinity$|^\[object |^null$|^undefined$/.test(out.text)) upgraded.push(b[0] + '→' + out.text);
  });
  return { threw: threw, upgraded: upgraded };
}
/** 反例对照：同一张矩阵过**旧兜底**时，至少有一例被升格（证明升格不是想象出来的） */
function probeLegacy() {
  const up = [];
  BAD.forEach(function (b) {
    let s;
    try { s = legacyClean(b[1], 60); } catch (e) { up.push(b[0] + ':threw'); return; }
    if (s && /^NaN$|^Infinity$|^\[object |^null$|^true$|^false$|^0$|^-1$/.test(s)) up.push(b[0] + '→' + s);
  });
  return up;
}
/** 好输入必须照常通过（判据不是恒拒） */
function probeHappy(WA) {
  const Ig = WA.inputGuard;
  const internal = WA.__inputGuardInternal || {};
  return {
    text: Ig.text('  阿明  ', 40) === '阿明',
    num: Ig.num('42', 0) === 42,
    count: Ig.count(7.9) === 7 && Ig.count(-3) === 0,
    oneOf: Ig.oneOf('MERIT', ['merit', 'debt'], '') === 'merit',
    isId: internal.isId ? (internal.isId('p_甲') === true && internal.isId('a\u0000b') === false) : false,
    list: Ig.list(['甲', ' 乙 ', '甲', ''], 4, 24).join(',') === '甲,乙',
    check: Ig.check('ok').ok === true
  };
}

function surface() {
  const r = { anchors: [] };
  MIGRATED.forEach(function (g) {
    const src = fs.readFileSync(path.join(BASE, g.rel), 'utf8');
    r.anchors.push({ name: g.name, rel: g.rel, hits: src.split(g.anchor).length - 1 });
  });
  return r;
}

// ── A 结构 / B 现场 ──
function runAll(a) {
  const runSrc = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
  a(runSrc.indexOf("'core/input-guard.js'") > 0, 'v2840/ig: [A] 边界模块在 LOAD 里（真装载，不是只声明）');
  const surf = surface();
  const miss = surf.anchors.filter(function (x) { return x.hits < 1; });
  a(miss.length === 0, 'v2840/ig: [A] ' + MIGRATED.length + ' 处迁移锚点全部在场（缺 ' + JSON.stringify(miss) + '）');
  const dup = surf.anchors.filter(function (x) { return x.hits !== 1; });
  a(dup.length === 0, 'v2840/ig: [A] 每处锚点在真源码里恰 1 次（破坏不打偏；异常 ' + JSON.stringify(dup) + '）');
  a(BAD.length >= 20, 'v2840/ig: [A] 坏输入矩阵达标（' + BAD.length + ' 项）');

  const WA = fresh();
  a(WA.inputGuard && typeof WA.inputGuard.text === 'function' && typeof WA.inputGuard.check === 'function',
    'v2840/ig: [A] 边界导出面在场（text/check 等）');
  const m = isolated(function () { return probeMatrix(WA); });
  a(m.threw.length === 0,
    'v2840/ig: [B] 整张矩阵零外抛（实 ' + JSON.stringify(m.threw) + '）—— 抛会打断整轮巡检');
  a(m.upgraded.length === 0,
    'v2840/ig: [B] 零静默升格（实 ' + JSON.stringify(m.upgraded) + '）—— NaN/对象不得变成世界事实');
  const hp = probeHappy(WA);
  const bad = Object.keys(hp).filter(function (k) { return !hp[k]; });
  a(bad.length === 0, 'v2840/ig: [B] 好输入全部照常通过（判据不是恒拒；失败项 ' + JSON.stringify(bad) + '）');
  const lg = probeLegacy();
  a(lg.length >= 3,
    'v2840/ig: [B] 对照：同一张矩阵过旧兜底确实会升格 ' + lg.length + ' 例（如 ' + JSON.stringify(lg.slice(0, 4)) + '）——升格是实测现象');
}

// ── C 实质 / D 非空转 ──
function runNegative(a) {
  const files0 = fs.readdirSync(path.join(BASE, 'tests')).sort().join(',');
  const hashes0 = {};
  const touched = {};
  MIGRATED.forEach(function (g) { touched[g.rel] = true; });
  touched['core/input-guard.js'] = true;
  Object.keys(touched).forEach(function (rel) {
    hashes0[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, rel))).digest('hex').slice(0, 16);
  });

  // C1 真源码破坏①：把边界内核退回 String(v) —— 升格与抛出必须同时回来
  const igSrc = fs.readFileSync(path.join(BASE, 'core/input-guard.js'), 'utf8');
  const igBroken = igSrc.split("    const s = rawText(v);\n").join("    const s = String(v == null ? '' : v);\n");
  a(igBroken !== igSrc, 'v2840/ig: [C1] 边界内核破坏副本与原不同（锚点真命中）');
  const WAb = isolated(function () { return fresh({ srcOverride: { 'core/input-guard.js': igBroken } }); });
  const mb = isolated(function () { return probeMatrix(WAb); });
  a(mb.upgraded.length > 0 || mb.threw.length > 0,
    'v2840/ig: [C1] 退回 String(v) ⇒ 升格/外抛重新出现（升格 ' + mb.upgraded.length + ' / 抛 ' + mb.threw.length + '）');

  // C2 真源码破坏②：任选一处迁移站点退回自备 clean() —— 该站点的锚点必须失守
  const site = MIGRATED[0];
  const siteSrc = fs.readFileSync(path.join(BASE, site.rel), 'utf8');
  const siteBroken = siteSrc.split(site.anchor).join(site.anchor.replace('WA.inputGuard.text(key, 60)', 'clean(key, 60)'));
  a(siteBroken !== siteSrc, 'v2840/ig: [C1] 站点破坏副本与原不同（' + site.name + '）');
  const hitsBroken = siteBroken.split(site.anchor).length - 1;
  a(hitsBroken === 0, 'v2840/ig: [C1] 该站点退回自备兜底后，迁移锚点不再命中（实 ' + hitsBroken + '）——结构判据能抓回退');

  // C3 判据纯度：原版上零问题
  const okM = isolated(function () { return probeMatrix(fresh()); });
  a(okM.threw.length === 0 && okM.upgraded.length === 0,
    'v2840/ig: [C3] 原版上零问题（判据纯度，不是恒假也不是恒真）');

  // D 非空转：拒绝真发生过（坏输入被边界拒掉的比例）；且锚点判据读的是真源码
  const rejected = BAD.map(function (b) {
    try { return !fresh().inputGuard.check(b[1]).ok; } catch (e) { return true; }
  }).filter(Boolean).length;
  // 注意：0/-0/true/false 一类是**合法**输入（会通过 check），故这里只要求「绝大多数坏输入被拒」
  a(rejected >= BAD.length - 8,
    'v2840/ig: [D1] 坏输入确实被逐个拒收（实 ' + rejected + '/' + BAD.length + '）——判据不是「没调到」');
  a(surface().anchors.every(function (x) { return x.hits === 1; }),
    'v2840/ig: [D1] 结构判据读的是真源码内容（锚点恰 1 次，不是常量）');

  // E 无副作用
  a(fs.readdirSync(path.join(BASE, 'tests')).sort().join(',') === files0,
    'v2840/ig: [E] 测试目录未被污染（无临时/备份文件）');
  Object.keys(touched).forEach(function (rel) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, rel))).digest('hex').slice(0, 16);
    a(h === hashes0[rel], 'v2840/ig: [E] ' + rel + ' 未被改写（破坏只发生在内存副本上）');
  });
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.locks.indexOf('tests/input-guard-v2840.js') >= 0, 'v2840/ig: [E] 本锁真在可达面里（不是孤儿）');
  a(surf.orphans.indexOf('tests/input-guard-v2840.js') < 0, 'v2840/ig: [E] 本锁不在孤儿名单里');
  a(surf.globalResidue === 0, 'v2840/ig: [E] 宿主全局面零残骸（实 ' + surf.globalResidue + '）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  BAD: BAD, MIGRATED: MIGRATED, probeMatrix: probeMatrix, probeLegacy: probeLegacy, surface: surface
};

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('INPUT-GUARD-V2840: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('INPUT-GUARD-V2840: pass (' + pass + ')');
}