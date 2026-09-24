'use strict';
/**
 * tests/module-registry-gate.js — v2.83.0（第三十七面 B4）：模块契约实测门禁
 *
 * 为什么需要它（本版存在的理由，来自两次失败的扫描与一次成功的实测）：
 *   B4 要的是「模块能力注册表 + 依赖检查」，而「依赖」在静态代码面上是测不准的：
 *     · 扫描器 v1（朴素 DFS 判环）——按路径展开，指数爆炸（超时 180s）。
 *     · 扫描器 v2（括号配平猜「函数体掩码」）——本仓库文件一律
 *         (function () { ... })()
 *       形态，装载期语句天然落在 IIFE 函数体内，掩码必然把「装载期读」判成
 *       「调用期读」，口径整个反了（实测输出 装载期 558 / 调用期 0，而真相是
 *       装载期 23 / 调用期引用 44）。
 *     · 结论：静态面能回答的只有「提到了谁」（refs），回答不了「装载顺序上必须先有谁」。
 *
 *   本门禁改用**运行期实测**：真装载（vm.runInContext 逐文件）、Proxy 拦 WA 命名空间
 *   访问、调用栈定案归属（栈里第一个「位置在 WA 文件内且无函数名」的帧 = 装载期顶层语句，
 *   `at engines/backstage.js:864:6` 这种顶层表达式语句同样带行号，故不能只看行号）。
 *
 * 可证伪性（判据必须能失败，否则「0 条」不构成证据）：
 *   EDGE_DROP=<rel> 把某个提供方整文件从装载序列摘掉重跑：
 *     · 消费方仍读完            ⇒ 该依赖被容忍缺席（optional）
 *     · 消费方抛错（真的炸）    ⇒ 该依赖是硬依赖（required）
 *   实测锚点：摘掉 core/store.js / core/clock.js（全仓 refs 最高的两个 ns）后
 *   **零个消费方装载失败**；摘掉 core/workflow.js 则 18 个消费方当场抛
 *   `Cannot read properties of undefined (reading 'register')`。
 *   ⇒ 「引用最多」不等于「必须先装载」。这正是 B4 要把边界显式化的原因。
 *
 * 用法：
 *   node tests/module-registry-gate.js              核对现场 vs 账本（默认）
 *   node tests/module-registry-gate.js --update     重写账本
 *   node tests/module-registry-gate.js --json       输出实测 JSON（供其它门禁消费）
 *   EDGE_DROP=core/workflow.js node tests/module-registry-gate.js --probe
 *                                                   摘掉某文件重跑，列出失败的消费方
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const LEDGER_PATH = path.join(__dirname, 'module-registry-ledger.json');
const ARGS = process.argv.slice(2);
const MODE_UPDATE = ARGS.indexOf('--update') >= 0;
const MODE_JSON = ARGS.indexOf('--json') >= 0;
const MODE_PROBE = ARGS.indexOf('--probe') >= 0;
const DROP = process.env.EDGE_DROP || null;

const manifest = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
const VERSION = manifest.version;

if (!MODE_PROBE) process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));

// ── 装载清单：真源 = index.js 的 LOAD_ORDER（不是 run.js 的副本）──
const idxSrc = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
const mOrd = idxSrc.match(/const LOAD_ORDER = \[([\s\S]*?)\n  \];/);
if (!mOrd) { console.error('module-registry-gate: index.js 里找不到 LOAD_ORDER'); process.exit(2); }
const LOAD_ORDER = (mOrd[1].match(/'([^']+\.js)'/g) || []).map(function (s) { return s.slice(1, -1); });
const LOAD = LOAD_ORDER.filter(function (r) { return r.indexOf('ui/') !== 0; });
const nsFiles = new Set(LOAD_ORDER);
const orderOf = {};
LOAD_ORDER.forEach(function (r, i) { orderOf[r] = i; });

// index.js / mock.js 提供的引导项——不属于任何模块文件，读它们不构成模块依赖
const BOOTSTRAP = new Set(['VERSION', 'version', 'mainWin', 'mainDoc',
  'log', 'flushLog', 'loadEventLog', 'clearEventLog']);

// ── 运行期探针：Proxy 拦 WA 访问 + 调用栈定案归属 ──
const reads = {};    // rel -> { top:Set, call:Set, undefTop:Set }
const writes = {};   // rel -> Set
let current = null;

const realWA = global.WorldAxis;
global.WorldAxis = new Proxy(realWA, {
  get: function (o, k, recv) {
    const v = Reflect.get(o, k, recv);
    if (typeof k !== 'string' || k.indexOf('__') === 0) return v;
    const own = reads[current] || (reads[current] = { top: new Set(), call: new Set(), undefTop: new Set() });
    let st;
    try { st = new Error().stack; } catch (e) { return v; }
    // 归属判据（见文件头）：栈里第一个「位于 WA 命名空间文件内」的帧
    //   · 该帧 = 正在装载的文件 且 无函数名 ⇒ 顶层语句 ⇒ 装载期
    //   · 否则（属别的模块文件，或带函数名）⇒ 函数体内部 ⇒ 调用期
    const lines = st.split('\n').slice(2);
    let isTop = false;
    for (let i = 0; i < lines.length; i++) {
      const mm = lines[i].trim().match(/^at\s+(?:(.*?)\s+\()?(.*?):(\d+):(\d+)\)?$/);
      if (!mm) continue;
      const fnName = mm[1] || '';
      let f = mm[2];
      if (f.indexOf('node:') === 0) continue;
      if (f.indexOf(BASE + '/') === 0) f = f.slice(BASE.length + 1);
      if (f.indexOf('./') === 0) f = f.slice(2);
      if (!nsFiles.has(f)) continue;
      isTop = (f === current) && (fnName === '');
      break;
    }
    if (isTop) { own.top.add(k); if (v === undefined) own.undefTop.add(k); }
    else own.call.add(k);
    return v;
  },
  set: function (o, k, v) {
    if (typeof k === 'string' && current) (writes[current] || (writes[current] = new Set())).add(k);
    return Reflect.set(o, k, v);
  }
});

// ── 真装载（与 tests/run.js 同机制：vm + 逐文件 runInContext）──
const ctx = vm.createContext(global);
const loadErrors = {};
const skipped = [];
for (const rel of LOAD) {
  if (DROP && rel === DROP) { skipped.push(rel); continue; }
  current = rel;
  try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); }
  catch (e) { loadErrors[rel] = String((e && e.message) || e).slice(0, 160); }
}
current = null;

// ── 提供方（写侧实测）与命名空间归属 ──
const provided = {}, nsOwner = {};
Object.keys(writes).forEach(function (rel) {
  const own = Array.from(writes[rel]).filter(function (k) { return k.indexOf('__') !== 0; }).sort();
  provided[rel] = own;
  own.forEach(function (ns) { (nsOwner[ns] = nsOwner[ns] || []).push(rel); });
});

// ── 设置键归属（B4 的 stateKeys 字段）：真源 = settings-bus 登记表（各模块自持）──
const rawRegs = Array.isArray(realWA.__settingsRegs) ? realWA.__settingsRegs : [];
const settingsKeys = {};
rawRegs.forEach(function (r) {
  if (!r || !r.key) return;
  const ns = r.module || null;
  const owners = ns ? (nsOwner[ns] || []) : [];
  const file = owners.length === 1 ? owners[0] : null;
  if (!file) return;   // 归不到文件（或重名）→ 不入单模块，显式留在 unmapped
  (settingsKeys[file] = settingsKeys[file] || []).push(r.key);
});
const unmappedSettings = rawRegs.filter(function (r) {
  return r && r.key && (!r.module || (nsOwner[r.module] || []).length !== 1);
}).map(function (r) { return { key: r.key, module: r.module || null }; });

// ── 逐文件契约 ──
const modules = {};
let loadEdges = 0, hardEdges = 0, callRefs = 0, ghostRefs = 0;
LOAD.forEach(function (rel) {
  const r = reads[rel] || { top: new Set(), call: new Set(), undefTop: new Set() };
  const own = provided[rel] || [];
  const requires = [], ghostTop = [];
  Array.from(r.top).sort().forEach(function (ns) {
    if (own.indexOf(ns) >= 0 || BOOTSTRAP.has(ns)) return;
    if (nsOwner[ns]) {
      requires.push(ns);
      loadEdges++;
      if (r.undefTop.has(ns)) hardEdges++;
    } else { ghostTop.push(ns); ghostRefs++; }
  });
  const callReads = Array.from(r.call).filter(function (ns) {
    return own.indexOf(ns) < 0 && !BOOTSTRAP.has(ns) && nsOwner[ns];
  }).sort();
  callRefs += callReads.length;
  const ghostCall = Array.from(r.call).filter(function (ns) {
    return own.indexOf(ns) < 0 && !BOOTSTRAP.has(ns) && !nsOwner[ns];
  }).sort();
  modules[rel] = {
    ns: own,
    requires: requires,                     // 装载期顶层读（真「必须先装载」）
    requiresFiles: requires.map(function (ns) { return nsOwner[ns][0]; }).sort(),
    providerOrderOk: requires.every(function (ns) { return orderOf[nsOwner[ns][0]] < orderOf[rel]; }),
    callRefs: callReads,                    // 调用期引用（不构成装载顺序约束）
    ghostRefs: Array.from(new Set(ghostTop.concat(ghostCall))).sort(),
    stateKeys: (settingsKeys[rel] || []).sort()
  };
});

// 反向面：谁被引用（装载期 + 调用期），用于识别「孤岛」
const consumers = {};
Object.keys(modules).forEach(function (rel) {
  modules[rel].requires.concat(modules[rel].callRefs).forEach(function (ns) {
    (consumers[ns] = consumers[ns] || {})[rel] = true;
  });
});
Object.keys(modules).forEach(function (rel) {
  modules[rel].consumedBy = Array.from(new Set(Object.keys(consumers).filter(function (ns) {
    return modules[rel].ns.indexOf(ns) >= 0;
  }).reduce(function (acc, ns) { return acc.concat(Object.keys(consumers[ns])); }, [])))
    .filter(function (x) { return x !== rel; }).sort();
});

const report = {
  version: VERSION,
  loadOrderCount: LOAD_ORDER.length,
  loadedCount: LOAD.length,
  uiCount: LOAD_ORDER.length - LOAD.length,
  nsCount: Object.keys(nsOwner).length,
  totals: { loadEdges: loadEdges, hardEdges: hardEdges, callRefs: callRefs, ghostRefs: ghostRefs },
  loadErrors: loadErrors,
  skipped: skipped,
  unmappedSettings: unmappedSettings,
  modules: modules
};

// ── 被 require 时**不得**执行核对模式（否则任何人 require 本文件都会被 process.exit(1) 打死）──
//   这是本文件被 settle-v2830.js 引入时实测踩到的：所谓「可复用门禁」如果不能被 require，
//   它就只是一段 CLI 脚本；而「同一份判据既给 CLI 又给测试」正是它值得被单独写成文件的原因。
if (require.main !== module) {
  // 被 require ⇒ 只导出量测面，绝不跑 CLI 分支（否则 require 方会被 process.exit 打死）。
  //   注意：不能在此 `return`（Node CJS 的模块顶层不允许 return）——
  //   故下面各 CLI 分支一律先判 `require.main === module`。
  module.exports = {
    measure: function () { return report; },
    ledgerPath: LEDGER_PATH,
    readLedger: function () {
      try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch (e) { return null; }
    }
  };
} else {

if (MODE_PROBE) {
  console.log('EDGE_DROP =', DROP || '(未设置)');
  console.log('装载失败 =', Object.keys(loadErrors).length, '/ 跳过 =', skipped.length);
  Object.keys(loadErrors).sort().forEach(function (r) { console.log('  FAIL ' + r + '  ::  ' + loadErrors[r]); });
  process.exit(0);
}

if (MODE_JSON) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }

if (MODE_UPDATE) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(report, null, 1) + '\n');
  console.log('module-registry-gate: 账本已写入（version=' + VERSION
    + ', 文件 ' + LOAD.length + ', 命名空间 ' + report.nsCount
    + ', 装载期边 ' + loadEdges + ', 硬边 ' + hardEdges + ', 调用期引用 ' + callRefs + '）');
  process.exit(0);
}

// ── 核对模式 ──
if (!fs.existsSync(LEDGER_PATH)) { console.error('module-registry-gate: 缺账本（先跑 --update）'); process.exit(2); }
const led = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
const bad = [];
function cmp(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    bad.push(name + ' :: 现场 ' + JSON.stringify(actual) + ' ≠ 账本 ' + JSON.stringify(expected));
  }
}

cmp('version', report.version, led.version);
cmp('loadedCount', report.loadedCount, led.loadedCount);
cmp('nsCount', report.nsCount, led.nsCount);
cmp('totals', report.totals, led.totals);
cmp('loadErrors', Object.keys(report.loadErrors).sort(), Object.keys(led.loadErrors).sort());

const rels = Array.from(new Set(Object.keys(report.modules).concat(Object.keys(led.modules)))).sort();
rels.forEach(function (rel) {
  const a = report.modules[rel], e = led.modules[rel];
  if (!a) { bad.push(rel + ' :: 账本登记过、现场已无'); return; }
  if (!e) { bad.push(rel + ' :: 现场新增、账本未登记'); return; }
  cmp(rel + '.ns', a.ns, e.ns);
  cmp(rel + '.requires', a.requires, e.requires);
  cmp(rel + '.callRefs', a.callRefs, e.callRefs);
  cmp(rel + '.stateKeys', a.stateKeys, e.stateKeys);
});

// 结构性判据（不只冻结读数，还要判「这条依赖站得住吗」）
const structural = [];
Object.keys(report.modules).forEach(function (rel) {
  const m = report.modules[rel];
  if (!m.providerOrderOk) {
    structural.push({ code: 'order-violation', rel: rel, detail: 'requires 的提供方排在本模块之后（装载期必炸）' });
  }
  m.ghostRefs.forEach(function (ns) {
    structural.push({ code: 'ghost-ns', rel: rel, ns: ns, detail: '引用了没有任何模块提供的命名空间' });
  });
  if (m.requires.length && !m.ns.length) {
    structural.push({ code: 'consumer-only', rel: rel, detail: '只消费不提供（无导出面）' });
  }
});

if (!bad.length) {
  console.log('module-registry-gate: pass —— 文件 ' + report.loadedCount + ' / 命名空间 ' + report.nsCount
    + ' / 装载期边 ' + report.totals.loadEdges + ' / 硬边 ' + report.totals.hardEdges
    + ' / 调用期引用 ' + report.totals.callRefs + ' / 结构问题 ' + structural.length);
  if (structural.length) structural.slice(0, 20).forEach(function (s) {
    console.log('  · ' + s.code + '  ' + s.rel + (s.ns ? '  (' + s.ns + ')' : '') + '  ' + s.detail);
  });
  process.exit(0);
}
console.log('module-registry-gate: FAIL (' + bad.length + ')');
bad.slice(0, 40).forEach(function (x) { console.log('  ✗ ' + x); });
process.exit(1);
}
