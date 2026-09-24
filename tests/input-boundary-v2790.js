#!/usr/bin/env node
// WorldAxis tests/input-boundary-v2790.js — 非法输入矩阵锁（v2.79.0 第十三面续）
//
// 治的病（实测驱动，不是「想当然该防」）
//   用 29 个公共入口 × 23 种坏输入（undefined/null/NaN/±Infinity/-0/空串/纯空白/
//   0/-1/1e308/2^53/对象/数组/函数/布尔/5KB 串/带敌意 toString 的对象/无原型对象/
//   非法日期）实测，得到两族**已实证**的缺陷：
//
//   A 未受控抛出。store.classifyKey 19/23 抛（`key.match is not a function`）、
//     store.read 19/23 抛（`path.split`）、registry.getProfile 对对象名抛 ToPrimitive。
//     危害不是「报错」：这些接口的调用方大多是扫描 localStorage 的**巡检路径**
//     （sweep 垃圾回收、体积审计、孤儿盘点）。一个抛会打断**整轮巡检**，于是
//     「巡检没查出问题」与「巡检没跑完」在读数上完全不可分 —— 这是比单点报错更糟的失真。
//
//   B 字符串化兜底把非法值**静默升格**。`String(v == null ? '' : v)` 对 NaN 产出 'NaN'、
//     对对象产出 '[object Object]'，长度还不设限。实测：
//       survival.set('甲', NaN)  → 建出一条全 null 的读数记录并报 ok
//       temporalLock.lock(NaN)   → 上锁成功、label='NaN'
//       threads.open(NaN)        → 立出一桩问题叫「NaN」的悬案
//     一次「参数传错」被记成了「世界里真发生了这件事」。
//
// 本锁两个方向都证明：
//   A 结构：待锁入口清单在场、矩阵规模达标。
//   B 现场：已修入口对坏输入零受控外抛出；静默升格面（ok=true）清零；好输入仍照常成功。
//   C 实质：真源码破坏（摘掉守卫）⇒ 行为判据必须现形（重新抛出 / 重新静默升格）。
//   D 非空转：矩阵非空、且「拒绝」这件事真发生过（否则判据可能只是没调到位）。
//   E 无副作用 + **诚实登记**：已知未覆盖面（其余引擎的 clean 兜底同型不设防）列入
//     KNOWN_OPEN，本锁不声称全修 —— 报「已全修」比漏修更坏。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const crypto = require('crypto');

// ── 矩阵 ──
const BAD = [
  ['undefined', undefined], ['null', null], ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
  ['-0', -0], ['empty', ''], ['spaces', '   '], ['zero', 0], ['negOne', -1], ['big', 1e308],
  ['unsafeInt', Number.MAX_SAFE_INTEGER + 1], ['obj', {}], ['arr', []], ['fn', function () {}],
  ['t', true], ['f', false], ['hugeStr', 'x'.repeat(5000)],
  ['evilObj', { toString() { throw new Error('boom'); } }],
  ['proto', Object.create(null)], ['badDate', new Date(NaN)]
];

// ── 入口登记：本版已加守卫的站点。copyAnchor 是破坏锚点（摘掉守卫 ≈ 退回原样）──
//   只登记**已核实签名**的入口，避免把「探针传错参数位置」误报成缺陷。
const GUARDED = [
  { name: 'store.classifyKey', rel: 'core/store.js',
    call: function (WA, v) { return WA.store.classifyKey(v); },
    anchor: "    if (typeof key !== 'string' || !key) return { family: 'invalid', chat: null };\n" },
  { name: 'store.read', rel: 'core/store.js',
    call: function (WA, v) { return WA.store.read(v, 'FB'); },
    anchor: "      if (typeof path !== 'string' || !path) return fallback;\n" },
  { name: 'registry.getProfile', rel: 'actors/registry.js',
    call: function (WA, v) { return WA.registry.getProfile(v); },
    anchor: "      if (typeof name !== 'string' || !name.trim()) {\n        return { fields: { name: '' }, personality: [], worldview: [], family: [], relationships: [], memory: [], relations: [], persona: null };\n      }",
    // 该守卫自带 return 语句，不能整行删（删了会留下悬空 return → 语法错），
    //   故破坏方式是把条件改成恒假 —— 行为等价于「守卫不在」。
    weaken: function (src) { return src.replace("if (typeof name !== 'string' || !name.trim()) {", 'if (false) {'); } },
  { name: 'gauge.create', rel: 'engines/gauge.js',
    call: function (WA, v) { return WA.gauge.create(v); },
    anchor: "    if (typeof key !== 'string' || !key.trim()) return { ok: false, reason: 'missing-fields' };" },
  { name: 'survival.set', rel: 'engines/survival.js',
    call: function (WA, v) { return WA.survival.set(v); },
    anchor: "    if (typeof who !== 'string' || !who.trim()) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }" },
  { name: 'temporalLock.lock', rel: 'engines/temporal-lock.js',
    call: function (WA, v) { return WA.temporalLock.lock(v); },
    anchor: "    if (typeof label !== 'string') { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }" },
  { name: 'threads.open', rel: 'engines/threads.js',
    call: function (WA, v) { return WA.threads.open(v); },
    anchor: "    if (item == null || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'missing-question' };" },
  { name: 'rivalry.declare', rel: 'engines/rivalry.js',
    call: function (WA, v) { return WA.rivalry.declare(v, 'B', 'T', 50); },
    // 锚点必须含**完整守卫**（含第一行）——只含续行会把 `if (` 留下 → 悬空 if → 语法错。
    //   与 retire 的守卫逐字相同，故靠紧随其后的那一行区分两处。
    //   breakInto 只摘掉守卫本身、保留后续代码——整段删会连带删掉变量定义，
    //   于是异常在事务里被吞掉、返回值变 null，判据反而以为「破坏没生效」。
    anchor: "    if (typeof charA !== 'string' || typeof charB !== 'string' || typeof target !== 'string'\n        || !charA.trim() || !charB.trim() || !target.trim()) return { ok: false, reason: 'missing-fields' };\n    if (charA === charB || charA === target || charB === target) return { ok: false, reason: 'invalid-actors' };",
    breakInto: "    if (charA === charB || charA === target || charB === target) return { ok: false, reason: 'invalid-actors' };" },
  { name: 'rivalry.retire', rel: 'engines/rivalry.js',
    call: function (WA, v) { return WA.rivalry.retire(v, 'B', 'T'); },
    anchor: "    if (typeof charA !== 'string' || typeof charB !== 'string' || typeof target !== 'string'\n        || !charA.trim() || !charB.trim() || !target.trim()) return { ok: false, reason: 'missing-fields' };\n    const key = makeKey(charA, charB, target);",
    breakInto: "    const key = makeKey(charA, charB, target);" },
  { name: 'quota.add', rel: 'engines/quota.js',
    call: function (WA, v) { return WA.quota.add(v, 'x'); },
    anchor: "    if (typeof pool !== 'string' || typeof text !== 'string') { noteFault('bad-pool'); return { ok: false, reason: 'bad-pool', got: pool }; }" }
];

// ── 静默升格面：这些入口在坏输入下**不许**报 ok:true（报 true = 世界被一条坏参数改了）──
// 实测到的三例（本轮探针之前读到 ok=true）：NaN 被 String() 升格成 'NaN' 落进了世界。
//   注意：hugeStr（5000 字串）**不算**升格——它合法、只是长，各引擎有各自的剪裁上限，
//   被接受是设计而不是缺陷（把它算进来会让判据恒假，反而失去意义）。
const NO_SILENT_ACCEPT = { 'threads.open': 'NaN', 'survival.set': 'NaN', 'temporalLock.lock': 'NaN' };

// ── 诚实登记：同型未覆盖面（不声称已修）──
const KNOWN_OPEN = {
  why: '其余引擎的 clean() 兜底同型不设防：String(x) 会为带敌意 toString 的对象抛出、为 NaN 产出假串。',
  scope: 'A2 统一数据边界层（计划已列），不在 v2.79.0 点修范围',
  observed: ['hazard.bump', 'karma.record', 'ladder.drop', 'enigma.mark',
             'tolerance.drop', 'marginal.drop', 'parallelEvents.add', 'fondness.apply']
};

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts || {}).WA; }

function isolated(fn) {
  const LS = global.localStorage;
  const snap = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) { snap.push([k, LS.getItem(k)]); } }
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) { WA0.log = function () {}; }
  try { return fn(); }
  finally {
    if (WA0 && origLog) { WA0.log = origLog; }
    const drop = [];
    for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !snap.some(function (x) { return x[0] === k; })) { drop.push(k); } }
    drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
    snap.forEach(function (x) { try { LS.setItem(x[0], x[1]); } catch (e) {} });
  }
}

function enable(WA) {
  ['gauge', 'rivalry', 'quota', 'hazard', 'karma', 'ladder', 'enigma', 'tolerance', 'marginal',
   'org', 'threads', 'spotlight', 'survival', 'temporalLock', 'parallelEvents', 'parallelWorld',
   'parallelEvents', 'fondness'].forEach(function (k) {
    try { if (WA[k] && WA[k].setSettings) WA[k].setSettings({ enabled: true }); } catch (e) {}
  });
}

/** 对一个入口跑整张坏输入矩阵，返回 { threw: [...], silentOk: [...] }。 */
function matrix(WA) {
  const out = {};
  GUARDED.forEach(function (g) {
    out[g.name] = { threw: [], silentOk: [] };
  });
  GUARDED.forEach(function (g) {
    BAD.forEach(function (b) {
      const W = WA;
      let r = null;
      try { r = g.call(W, b[1]); }
      catch (e) { out[g.name].threw.push(b[0] + ' :: ' + (e && e.message)); return; }
      if (r && r.ok === true && NO_SILENT_ACCEPT[g.name] === b[0]) {
        out[g.name].silentOk.push(b[0]);
      }
    });
  });
  return out;
}

/** 好输入回归：守卫不能把正常调用一起挡掉（判据不是「恒拒」）。 */
function happyPath(WA) {
  enable(WA);
  const r = {};
  r.gaugeCreate = WA.gauge.create('甲表').ok === true;
  r.declareOk = WA.rivalry.declare('阿甲', '阿乙', '焦点壹', 40).ok === true;
  r.retireDel = WA.rivalry.retire('阿甲', '阿乙', '焦点壹').ok === true;
  r.threadsOpen = WA.threads.open({ question: '他为什么在码头等了一夜？' }).ok === true;
  r.survivalSet = WA.survival.set('阿甲', { satiety: 60, stamina: 70 }).ok === true;
  r.temporalLock = WA.temporalLock.lock('对峙第三分钟').ok === true;
  r.classify = (WA.store.classifyKey('worldaxis_state_c1') || {}).family === 'state';
  r.storeRead = WA.store.read('meta.stateRev', 'FB') !== 'FB';
  r.getProfile = !!(WA.registry.getProfile('阿甲') || {}).fields;
  return r;
}

function surface() {
  const r = { anchors: [] };
  GUARDED.forEach(function (g) {
    const src = fs.readFileSync(path.join(BASE, g.rel), 'utf8');
    r.anchors.push({ name: g.name, rel: g.rel, hits: src.split(g.anchor).length - 1 });
  });
  return r;
}

// ── A 结构 / B 现场 ──
function runAll(a) {
  const surf = surface();
  const miss = surf.anchors.filter(function (x) { return x.hits < 1; });
  a(miss.length === 0, 'v2790: [A] 10 处守卫锚点全部在场（缺 ' + JSON.stringify(miss) + '）');
  const dup = surf.anchors.filter(function (x) { return x.hits !== 1; });
  a(dup.length === 0, 'v2790: [A] 每处守卫锚点在真源码里恰 1 次（破坏不打偏；异常 ' + JSON.stringify(dup) + '）');
  a(BAD.length >= 20 && GUARDED.length >= 10, 'v2790: [A] 矩阵规模达标（坏输入 ' + BAD.length + ' × 入口 ' + GUARDED.length + '）');

  const m = isolated(function () { const WA = fresh(); enable(WA); return matrix(WA); });
  const threw = [];
  Object.keys(m).forEach(function (k) { if (m[k].threw.length) { threw.push(k + ':' + m[k].threw.length); } });
  a(threw.length === 0,
    'v2790: [B] 已修入口对整张坏输入矩阵零受控外抛出（实 ' + JSON.stringify(threw) + '）—— 抛会打断整轮巡检');
  const silent = [];
  Object.keys(m).forEach(function (k) { if (m[k].silentOk.length) { silent.push(k + ':' + JSON.stringify(m[k].silentOk)); } });
  a(silent.length === 0,
    'v2790: [B] 不存在「坏输入被静默升格为 ok」的入口（实 ' + JSON.stringify(silent) + '）');

  const hp = isolated(function () { return happyPath(fresh()); });
  const bad = Object.keys(hp).filter(function (k) { return !hp[k]; });
  a(bad.length === 0, 'v2790: [B] 好输入全部照常成功（守卫不是恒拒；失败项 ' + JSON.stringify(bad) + '）');
}

// ── C 实质 / D 非空转 / E 无副作用 + 诚实登记 ──
function runNegative(a) {
  const files0 = fs.readdirSync(path.join(BASE, 'tests')).sort().join(',');
  const hashes0 = {};
  GUARDED.forEach(function (g) {
    hashes0[g.rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, g.rel))).digest('hex').slice(0, 16);
  });

  // C1 真源码破坏：摘掉守卫 ⇒ 该入口必须重新出问题（抛出或静默升格）
  GUARDED.forEach(function (g) {
    const src = fs.readFileSync(path.join(BASE, g.rel), 'utf8');
    // 破坏方式：有 weaken 的自定义（守卫自带 return，整行删会留悬空 return → 语法错），
    //   其余为「摘掉整行守卫」。锚点必须恰 1 次，打偏即判据失真。
    // 破坏方式三选一：自定义 weaken（守卫自带 return，删不得）＞ 只摘守卫行的 breakInto
    //   （保留后续代码，防连带删掉变量定义让异常在事务里被吞）＞ 整行删。
    const broken = g.weaken ? g.weaken(src) : (g.breakInto ? src.split(g.anchor).join(g.breakInto) : src.split(g.anchor).join(''));
    a(broken !== src, 'v2790: [C1] ' + g.name + ' 的破坏副本与原不同（锚点真命中）');
    const WA2 = isolated(function () {
      const ov = {}; ov[g.rel] = broken;
      return fresh({ srcOverride: ov });
    });
    const m2 = isolated(function () { enable(WA2); return matrix(WA2)[g.name]; });
    const regressed = m2.threw.length > 0 || m2.silentOk.length > 0;
    a(regressed, 'v2790: [C1] 摘掉 ' + g.name + ' 的守卫 ⇒ 坏输入重新出事（实 ' + JSON.stringify(m2) + '）');
  });

  // C2 判据纯度：原版上同款行为判据必须为「零问题」
  const okM = isolated(function () { const WA = fresh(); enable(WA); return matrix(WA); });
  a(Object.keys(okM).every(function (k) { return okM[k].threw.length === 0 && okM[k].silentOk.length === 0; }),
    'v2790: [C2] 原版上零问题（判据纯度，不是恒假也不是恒真）');

  // D 非空转：判据真读到了输入；且「拒绝」这件事真的发生过
  const rejected = isolated(function () {
    const WA = fresh(); enable(WA);
    return BAD.map(function (b) {
      try { const r = WA.threads.open(b[1]); return !(r && r.ok === true); } catch (e) { return true; }
    }).filter(Boolean).length;
  });
  a(rejected >= BAD.length - 1,
    'v2790: [D1] 坏输入确实被逐个拒绝（实 ' + rejected + '/' + BAD.length + '）—— 判据不是「没调到」');
  a(surface().anchors.every(function (x) { return x.hits === 1; }),
    'v2790: [D1] 结构判据读的是真源码内容（锚点恰 1 次，不是常量）');

  // E0 诚实登记：未覆盖面必须在场且非空（防「声称全修」）
  a(KNOWN_OPEN.observed.length >= 5 && KNOWN_OPEN.why.length > 20,
    'v2790: [E0] 未覆盖面如实登记（' + KNOWN_OPEN.observed.length + ' 个入口，指向 ' + KNOWN_OPEN.scope + '）—— 不掩盖');

  // E 无副作用
  a(fs.readdirSync(path.join(BASE, 'tests')).sort().join(',') === files0,
    'v2790: [E] 测试目录未被污染（无临时/备份文件）');
  GUARDED.forEach(function (g) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, g.rel))).digest('hex').slice(0, 16);
    a(h === hashes0[g.rel], 'v2790: [E] ' + g.rel + ' 未被改写（破坏只发生在内存副本上）');
  });
  const surf = require('./test-surface-gate.js').scan({});
  a(surf.locks.indexOf('tests/input-boundary-v2790.js') >= 0, 'v2790: [E] 本锁真在可达面里（不是孤儿）');
  a(surf.orphans.indexOf('tests/input-boundary-v2790.js') < 0, 'v2790: [E] 本锁不在孤儿名单里');
  a(surf.globalResidue === 0, 'v2790: [E] 宿主全局面零残骸（实 ' + surf.globalResidue + '）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  BAD: BAD, GUARDED: GUARDED, KNOWN_OPEN: KNOWN_OPEN,
  matrix: matrix, happyPath: happyPath, surface: surface
};

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); require('./ui-gate-sync.js').fresh({}); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('INPUT-BOUNDARY-V2790: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('INPUT-BOUNDARY-V2790: pass (' + pass + ')');
}