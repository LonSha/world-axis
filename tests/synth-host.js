// WorldAxis tests/synth-host.js (v2.84.0) — 专锁「合成宿主桩」的单一入口
//
// 缺口（它治什么）：
//   若干专锁（intel-v2530 / life-v2520 / longline-v2550 / org-v2540）不装载真产品面，
//   而是**手写一个 WA 宿主桩**把被测引擎单独夹起来跑。这类桩的优点是隔离干净，
//   代价是它与被夹引擎的依赖面之间**没有任何门禁**：引擎新依赖一个核心模块时，
//   桩里没有它 ⇒ 该引擎在被夹环境里从出生起就是残的。
//
//   实测（v2.84.0，test-surface-gate 的宿主残骸探针）：A2 把 39 个引擎的统一兜底
//   委托到 core/input-guard.js 之后，上述 4 个专锁**全部**报
//   `THREW Cannot read properties of undefined (reading 'text')` ——
//   不是产品坏了，而是桩缺 inputGuard。这类漂移此前**完全静默**：
//   残骸探针只把「要求被抛出」记为脏，而脏只在门禁里算一条计数，没人会去看是哪一个模块。
//
// 本文件做两件事（都不改变被夹引擎的行为）：
//   ① `hostStub()`：把 core/input-guard.js 的**真实现**装进宿主桩。
//      刻意不复制实现——复制就又多了一份会漂移的副本，而漂移正是本文件要治的病。
//      做法与 tests/ui-gate-sync.js 的 loadOrder() 同源：读真源码，在桩的上下文中求值。
//   ② `seal(stub)`：把桩冻结成「只读」。桩缺依赖时，引擎会得到 undefined 并在调用处
//      立刻抛出（可定位到行），而不是**悄悄**把 undefined 写进世界状态。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');

/** 需要装进桩的核心模块 → 它注册的命名空间（与 engines/tool-diag.js 的 MODULE_EXPORTS 同口径） */
const CORE_MODULES = [
  { rel: 'core/clock.js', ns: 'clock', why: '时间源（各引擎 clockNow 兜底）' },
  { rel: 'core/rand.js', ns: 'rand', why: '随机源' },
  { rel: 'core/input-guard.js', ns: 'inputGuard', why: '统一输入边界（39 个引擎的 clean 都委托到它）' }
];

/**
 * 在给定 WA 桩上补齐核心模块。已存在同名命名空间时不覆盖（尊重调用方自己的夹具，
 *   例如 intel-v2530 提供的 clock/settingsBus 是**刻意**的最小版）。
 */
function hostStub(WA) {
  const wa = WA || {};
  const added = [];
  CORE_MODULES.forEach(function (m) {
    if (wa[m.ns]) return;                       // 调用方已自备 ⇒ 不覆盖
    const src = fs.readFileSync(path.join(BASE, m.rel), 'utf8');
    const win = { WorldAxis: wa };
    // 与真装载同一份源码、同一个入口（window.WorldAxis），只换宿主。
    vm.runInNewContext(src, { window: win, Date: Date, Number: Number, String: String,
      Array: Array, Object: Object, Math: Math, isFinite: isFinite, JSON: JSON,
      Error: Error, RegExp: RegExp, parseInt: parseInt, parseFloat: parseFloat },
      { filename: m.rel });
    added.push(m.ns + '(' + m.rel + ')');
  });
  return { wa: wa, added: added };
}

/** 桩缺依赖时必须**响亮**：把桩封成只读，任何写都在严格模式下抛。 */
function seal(stub) {
  return Object.freeze(stub);
}

/**
 * 本仓的两条装载铁律（与 tests/export-contract.js 同源，**不得**靠调用方记得）：
 *   ① 核心原语先于一切（clock / rand / input-guard 是「谁都能调、谁都不该自带一份」的底层）；
 *   ② 引擎清单从 tests/run.js 的 LOAD 与 index.js 的装载序列**读出来**，不在测试里抄第二份。
 */
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const _li = runSrc.indexOf('const LOAD = [');
const _lj = runSrc.indexOf('];', _li);
if (_li < 0 || _lj < _li) throw new Error('synth-host: 无法从 tests/run.js 读出 LOAD 装载序（清单口径变了？）');
const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', _li), _lj + 1) + ')');
/** 核心原语（三条，与 CORE_MODULES 同口径）：任何副本上下文都必须先装载它们 */
const CORE_LOAD = LOAD.filter(function (r) { return /^core\/(clock|rand|input-guard)\.js$/.test(r); });
/** 其余引擎（保持 LOAD 里的既有次序） */
const ENGINE_LOAD = LOAD.filter(function (r) { return !/^core\//.test(r); });
/**
 * v2.84.0：负控制 / 破坏副本的宿主上下文（**裸上下文**的替代品）。
 *
 * 缺口（它治什么）：
 *   负控制的纪律是「把破坏写在真源码上、在真宿主里重跑同款真判据」（H6）。
 *   但真宿主意味着被测文件会像在真装载序列里那样**调用它依赖的核心模块**——
 *   A2 之后，39 个引擎的 clean() 都改成了 `WA.inputGuard.text(v, max)`。
 *   而 v2.84.0 之前，v2.50.0 的 G 组三处负控制是这样装配宿主的：
 *       `const G = {}; G.window = G; G.global = G; G.console = console;`
 *   —— 仅此而已。于是破坏还没被验证，副本自己先抛：
 *       `Cannot read properties of undefined (reading 'text')`
 *   实测 r11：崩在 G1（host-wb-trace 的 capture 路径），且**不在** assert 里——
 *   整个回归以 runner-failed 收场，中途「49 项通过」的读数反而掩盖了它。
 *
 * 本函数把「裸上下文」换成与真装载同序的最小宿主：核心原语真实现（读真源码，不复制），
 * 外加按需装载的对等引擎。判据仍打在**真源码**上，唯一的变化是宿主不再缺件。
 *
 * @param {object} [opts] { engines: string[] } engines 传 true 表示按 LOAD 次序装全部引擎
 * @returns {object} vm 上下文（内含 window / global / WorldAxis / console）
 */
function negativeContext(opts) {
  const o = opts || {};
  const G = {};
  G.window = G; G.global = G; G.console = console;
  const c = vm.createContext(G);
  // ① 核心原语：读真源码（**不复制实现** —— 复制就又多一份会漂移的副本，正是本文件要治的病）
  CORE_LOAD.forEach(function (rel) {
    vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), c, { filename: rel });
  });
  // ② 可选：把 LOAD 里的引擎按装载序装进同一上下文。
  //    用途是「原版 ⇄ 破坏版」的**对等比对**：两边宿主面逐字相同，差异只剩那一处破坏。
  const list = (o.engines === true) ? ENGINE_LOAD : (o.engines || []);
  list.forEach(function (rel) {
    vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), c, { filename: rel });
  });
  return c;
}

module.exports = { hostStub: hostStub, seal: seal, CORE_MODULES: CORE_MODULES,
  negativeContext: negativeContext, LOAD: LOAD, CORE_LOAD: CORE_LOAD, ENGINE_LOAD: ENGINE_LOAD };