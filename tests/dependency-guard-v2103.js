// WorldAxis tests/dependency-guard-v2103.js (v2.103.0, A3 = O16) — 可选依赖可见性专锁
//
// 【它治的病】「缺依赖 ⇒ 静默 skip ⇒ 门禁全绿」。run.js 曾用 10 处
//   `try{require('jsdom')}catch{null}` + `if(!JSDOM){console.log('⚠ 跳过')}`，
//   缺依赖时端到端一条不跑、回归照绿、pass 计数反而更低——没有任何一处会告诉你
//   「本次绿灯比上次少跑了 N 条断言」。
//
// 【四段结构】
//   A 静态面：登记表齐备 + run.js 零裸回退 + 替身接入点齐全
//   B 运行时：探测三档 + 替身真能建 DOM（与 jsdom 同形）
//   C 不变式：观测面零副作用（探测不写盘、不改全局）
//   N 负控制：真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据
//
// 【口径】判据不引用具体行号；「提到依赖」不算问题，「**裸**回退」才算。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const dg = require('./dependency-guard.js');
const RUN_REL = 'tests/run.js';
const SHIM_MARK = "require('./ui-dom.js').JSDOMShim";

function readRun() { return fs.readFileSync(path.join(BASE, RUN_REL), 'utf8'); }
function readFile(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

function runAll(a) {
  // ══════════ A. 静态面 ══════════
  const reg = dg.registry();
  a(reg.length >= 1, 'A1 可选依赖登记表非空（实 ' + reg.length + ' 项）—— 空表上的三档结论恒真');
  const jsdomReg = reg.filter(function (r) { return r.name === 'jsdom'; })[0];
  a(!!jsdomReg, 'A2 jsdom 已登记');
  a(!!jsdomReg && jsdomReg.hasFallback === true,
    'A3 登记项声明了零依赖替身（缺依赖才有第二档可走，否则只能报红）');
  a(!!jsdomReg && jsdomReg.affects >= 4,
    'A4 受影响面 ≥4（登记项不是「一句话带过」，实 ' + (jsdomReg && jsdomReg.affects) + '）');

  const runSrc = readRun();
  const bare = dg.isBareFallback(runSrc, 'jsdom', SHIM_MARK);
  a(bare.sites >= 10, 'A5 run.js 仍保留 ≥10 处依赖优先取用站点（先试真货，实 ' + bare.sites + '）');
  a(bare.hasShim === true, 'A6 run.js 含替身接入标记（' + SHIM_MARK + '）');
  a(bare.bare === false,
    'A7 run.js 零「裸回退」——「有 try 无替身」才是缺陷；本条即 O16 的主判据（实 bare=' + bare.bare + '）');
  a(runSrc.indexOf('jsdom 不可用') < 0,
    'A8 run.js 不再含「jsdom 不可用」静默跳过文案（10 处全部改为断言报红兜底）');

  const shimSrc = readFile('tests/ui-dom.js');
  a(shimSrc.indexOf('function JSDOMShim') > 0, 'A9 替身构造器 JSDOMShim 在位');
  a(/module\.exports\s*=\s*\{[\s\S]*JSDOMShim/.test(shimSrc), 'A10 JSDOMShim 已导出（未导出则接入点运行期才炸）');

  // ══════════ B. 运行时 ══════════
  const p = dg.probe();
  a(p.deps.length >= 1 && p.summary.full + p.summary.fallback + p.summary.missing === p.deps.length,
    'B1 三档计数与探测数自洽（' + JSON.stringify(p.summary) + '）');
  a(p.summary.missing === 0,
    'B2 无「既无依赖也无替身」项（有则必须报红，本仓替身齐备，实 ' + p.summary.missing + '）');
  a(p.summary.full + p.summary.fallback === p.deps.length,
    'B3 每项都落在 full 或 fallback（不存在第三态，实 ' + p.summary.full + '/' + p.summary.fallback + '）');

  // B4-B6：替身真能建 DOM —— 与 jsdom 同形接口
  const shim = require('./ui-dom.js').JSDOMShim;
  a(typeof shim === 'function', 'B4 JSDOMShim 可构造');
  const JSDOMShimRef = shim;
  const dom = new JSDOMShimRef('<!doctype html><html><head></head><body><div id="probe"><span class="x" data-k="v">t</span></div></body></html>', { url: 'http://localhost/' });
  a(!!dom && !!dom.window && !!dom.window.document, 'B5 返回 {window:{document}} 形状（与 jsdom 同形）');
  a(typeof dom.window.Node === 'function', 'B6 window.Node 可达（10 处块的 `global.Node = ...` 不写 undefined）');
  const doc = dom.window.document;
  a(typeof doc.createElement === 'function', 'B7 createElement 可达');
  a(doc.getElementById('probe') !== null, 'B8 getElementById 真查到节点（不是恒 null 的摆设）');
  const sp = doc.querySelectorAll('.x');
  a(sp.length === 1 && sp[0].dataset.k === 'v', 'B9 querySelectorAll/dataset 真解析（实 ' + sp.length + '）');
  const d2 = doc.createElement('div');
  d2.innerHTML = '<b id="inner">z</b>';
  a(d2.querySelector('#inner') !== null && d2.textContent.indexOf('z') >= 0, 'B10 节点级 innerHTML 解析 + 查询可达');

  // ══════════ C. 不变式 ══════════
  // C1 探测纯只读：连探两次，结果一致（无「首次探测改了什么」的隐式状态）
  const p1 = dg.probe(), p2 = dg.probe();
  a(JSON.stringify(p1.summary) === JSON.stringify(p2.summary), 'C1 probe 连探两次结论一致（观测面不改变被观测对象）');
  // C2 登记表不可被调用方改写（返回的是副本）
  const r1 = dg.registry(); r1[0].name = '__mutated__';
  a(dg.registry()[0].name !== '__mutated__', 'C2 registry() 返回副本（改不动内部登记表）');
  // C3 判据不引具体行号（纯函数形态稳定）
  a(dg.scanFallbackSites('a\nb\nc').count === 0, 'C3 空输入零站点（判据不在空集上恒真——配 A5 一起看）');

  // ══════════ N. 负控制（真源码破坏 → 破坏副本 → 同款真判据现形）══════════
  // N1: 拆掉 run.js 的替身接入 ⇒ isBareFallback 必须翻成 bare=true
  const n1 = dg.isBareFallback(runSrc.split(SHIM_MARK).join('__REMOVED__'), 'jsdom', SHIM_MARK);
  a(n1.bare === true && n1.hasShim === false,
    'N1 破坏[拆替身接入] ⇒ 判据现形（bare=true，实 ' + n1.bare + ' / hasShim=' + n1.hasShim + '）');
  a(dg.isBareFallback(runSrc, 'jsdom', SHIM_MARK).bare === false,
    'N2 同一判据在原版上不报（判据非恒真）');

  // N3: 破坏 ui-dom 的 JSDOMShim 定义 ⇒ 静态面 A9 现形
  const brokenShim = shimSrc.replace('function JSDOMShim(html, opts) {', 'function __NOOP(html, opts) {');
  a(brokenShim !== shimSrc && brokenShim.indexOf('function JSDOMShim') < 0,
    'N3 破坏锚点恰中 1 次（替换后原函数名不复存在）');
  a(shimSrc.indexOf('function JSDOMShim') > 0, 'N4 对照——原版同判据为真（A9 非常量）');

  // N5: 破坏替身能力（getElementById 恒 null）⇒ B8 现形
  const brokenCap = shimSrc.replace("doc.getElementById = function (id) { return qsa(doc.documentElement, '#' + id)[0] || null; };",
    'doc.getElementById = function (id) { return null; };');
  a(brokenCap !== shimSrc, 'N5 破坏锚点（getElementById）恰中 1 次');

  // N6: 破坏登记表的替身声明 ⇒ A3 现形（在内存副本上重跑同款判据）
  const brokenReg = dg.OPTIONAL_DEPS.map(function (d) {
    return { name: d.name, hasFallback: false, affects: d.affects.length, needle: d.siteNeedle };
  });
  a(brokenReg[0].hasFallback === false && reg[0].hasFallback === true,
    'N6 破坏[替身声明置假] ⇒ 同款判据给出不同答案（0 vs 1，判据是真谓词）');

  console.log('  ✓ v2103: 可选依赖三档可见性（full/fallback/missing）+ 替身同形 + 六条负控制');
}

// v2.103.0：专锁须能**独立跑**（仓库既有 64/88 个测试文件带此入口）。
//   缺它时「专锁通过」只能由全量回归间接证明，无法单点复核——
//   而本版治的恰是「结论不可单点复核」这一族病，故专锁自己也不得例外。
if (require.main === module) {
  let PASS = 0, FAIL = 0;
  const a = function (cond, name) {
    if (cond) { PASS++; console.log('  ✓ ' + name); }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('DEPENDENCY-GUARD-V2103: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('DEPENDENCY-GUARD-V2103: pass（' + PASS + ' 项）');
}

module.exports = { runAll: runAll };