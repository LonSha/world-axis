// WorldAxis tests/inventory.js — 出口面清册（只读审计基建）
//
// 为什么需要它：
//   tool-diag 的 MODULE_EXPORTS 只回答「每个文件应当导出哪个命名空间，且该命名空间是否存在」，
//   即**命名空间级**完整性——它是自检报告里的「模块装载完整性」一节。
//   但它无法回答更深一层的三个问题：
//     ① `WA.store.read` 这样的**成员级**引用，是否真的存在？（不存在 = 运行到那行才炸）
//     ② 某个成员导出后，产品代码里还有没有任何一处引用？（零引用 = 死导出，与死键同型）
//     ③ 磁盘上有没有 .js 文件根本没被 MODULE_EXPORTS 登记？（未登记模块 = 自检看不见的黑盒）
//   本工具用「运行时真实导出面」× 「静态引用面」交叉求差，把这三类一次打出来。
//
// 口径说明（避免假阳性）：
//   · 定义面取**运行时对象**（vm 装载后 Object.keys），不解析源码对象字面量——不会因换行/注释误判；
//   · 引用面取**静态正则**（含注释：注释里写错的名字同样是文档债，一并列出但单独标记）；
//   · 「零引用」只在**产品代码**内判定；测试引用单独统计（仅测试调用 ≠ 产品调用，但也不等于死）。

'use strict';
require('./mock.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');

const ARGV = process.argv.slice(2);
const AS_JSON = ARGV.indexOf('--json') >= 0;
const SHOW_DEAD = ARGV.indexOf('--dead') >= 0;

// ── 1. 装载顺序：从 tests/run.js 里取那段已被验证过的 LOAD 常量（不复制，避免两处漂移）──
const runSrc = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
const li = runSrc.indexOf('const LOAD = [');
const lj = runSrc.indexOf('];', li);
if (li < 0 || lj < 0) { console.error('无法从 tests/run.js 提取 LOAD 清单'); process.exit(2); }
const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', li), lj + 1) + ')');

// ── 2. 声明表：MODULE_EXPORTS（文件 ↔ 命名空间）从 tool-diag 源码取字面量 ──
const diagSrc = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
const mi = diagSrc.indexOf('const MODULE_EXPORTS = {');
const mj = diagSrc.indexOf('\n  };', mi);
if (mi < 0 || mj < 0) { console.error('无法从 tool-diag.js 提取 MODULE_EXPORTS'); process.exit(2); }
const MODULE_EXPORTS = vm.runInNewContext('(' + diagSrc.slice(diagSrc.indexOf('{', mi), mj + 4) + ')');
const oi = diagSrc.indexOf('const OPTIONAL_EXPORTS = [');
const oj = diagSrc.indexOf('];', oi);
const OPTIONAL_EXPORTS = vm.runInNewContext('(' + diagSrc.slice(diagSrc.indexOf('[', oi), oj + 1) + ')');

// ── 3. 装载（与 tests/run.js 同一上下文语义）──
const ctx = vm.createContext(global);
for (const rel of LOAD) {
  vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
}
// v2.8.0: UI 层同样尝试装载。tests/run.js 的 LOAD 刻意不含 ui/*（无头环境不需要真实 DOM），
//   但 mock 提供的 document 足以让三个 UI 模块走完顶层求值——装载成功即「UI 导出面可验证」，
//   于是「ui.mount / uiSettings.render 查不到」这类**假悬空**不再需要人工判断。
//   装载失败（真缺 DOM 能力）时 UI_LOADED 为空，这些引用退回 uiPhantom 单列。
const UI_LOAD = ['ui/panel.js', 'ui/settings.js', 'ui/assistant.js'];
const UI_LOADED = [];
for (const rel of UI_LOAD) {
  try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); UI_LOADED.push(rel); }
  catch (e) { /* 环境不足以装载 UI：不视作缺陷，后续单列 */ }
}
const WA = global.WorldAxis;

// ── 4. 定义面：运行时真实导出 ──
// 只把 MODULE_EXPORTS 声明的命名空间当作「模块接口面」。
// 其余顶层键（VERSION / log / eventLog / modules / mainWin …）是**宿主级**导出，
// 它们的成员不是模块 API——混进来只会制造噪声（如 eventLog 的数组下标）。
const MODULE_NS = new Set(Object.keys(MODULE_EXPORTS).map(function (f) { return MODULE_EXPORTS[f]; }));
// 只有 UI 层三个模块依赖宿主 DOM；compat 无头可装载，属真契约面（不适配套用裸 OPTIONAL_EXPORTS）。
const UI_OPTIONAL = ['ui', 'uiSettings', 'assistant'].filter(function (k) { return MODULE_NS.has(k); });
const surface = Object.create(null);      // ns -> { api:Set, data:Set }，函数=api / 其余=data
const nsList = [];
function addNs(ns) {
  if (surface[ns]) return;
  const v = WA[ns];
  if (v === null || typeof v !== 'object') return;   // 函数型/标量型导出不是命名空间
  const api = new Set(), data = new Set();
  Object.keys(v).forEach(function (k) {
    // 下划线前缀 = 内部槽位/私有实现（`_runInference`、`__stat`）——按惯例不是对外承诺
    if (k.charAt(0) === '_') return;
    if (typeof v[k] === 'function') api.add(k); else data.add(k);
  });
  surface[ns] = { api: api, data: data };
  nsList.push(ns);
}
Object.keys(WA).forEach(function (ns) {
  if (ns.indexOf('__') === 0) return;                 // 内部槽位（__settingsRegs / __loadOrder …）
  if (!MODULE_NS.has(ns)) return;                     // 宿主级导出不进接口面
  addNs(ns);
});
function hasMember(ns, mem) {
  const s = surface[ns];
  return !!(s && (s.api.has(mem) || s.data.has(mem)));
}

// ── 5. 引用面：静态扫描产品代码 ──
function productFiles() {
  const out = [];
  // v2.22.0: `tools/` 是零依赖诊断脚本（scan_drift 等），不导出命名空间、不属产品模块面；
  //   与 tests/ 同例排除，否则每个诊断脚本都会以「未登记模块」形式挂在清册上（假阳性）。
  const SKIP_DIRS = ['tests', 'tools'];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === '.git' || e.name === 'node_modules') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (e.name.endsWith('.js') && SKIP_DIRS.indexOf(path.relative(BASE, dir)) < 0) out.push(path.relative(BASE, p));
    });
  })(BASE);
  return out.sort();
}
const PROD = productFiles();
// 引用面正则：`WA.x.y` 与可选链 `WA.x?.y` 都算真引用；私有成员（`_` 前缀）与
// 非接口命名空间（宿主级导出、数组下标）在下面两道 guard 里挡掉。
const REF_RE = /WA\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g;
const refs = [];              // { ns, mem, file, line, inComment }
for (const rel of PROD) {
  const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
  const lines = src.split('\n');
  lines.forEach(function (line, idx) {
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(line))) {
      const ns = m[1], mem = m[2];
      if (!MODULE_NS.has(ns)) continue;                        // 只审模块接口面
      if (mem.charAt(0) === '_') continue;                     // 私有成员不属承诺面
      const inComment = /^\s*(\/\/|\*|\/\*)/.test(line);
      refs.push({ ns: ns, mem: mem, file: rel, line: idx + 1, inComment: inComment });
    }
  });
}
// 测试侧引用（只统计，不参与死导出判定）
const testSrc = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
const testRefSet = new Set();
(function () {
  let m; REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(testSrc))) testRefSet.add(m[1] + '.' + m[2]);
})();

// ── 6. 求差 ──
const phantom = [];    // 模块接口面上引用了但运行时不存在 → 真悬空，潜在 TypeError
const uiPhantom = [];  // UI 层（无头环境不装载）——单列，需在浏览器环境复核
const dead = [];       // 函数成员定义后产品代码零引用 → 死导出（与死键同型）
const dataOnly = [];   // 非函数成员产品零引用 → 备查（不同于死导出：常量常被测试/诊断读）
const uiDead = [];     // UI 层函数成员零引用
const seen = Object.create(null);
refs.forEach(function (r) {
  const key = r.ns + '.' + r.mem;
  seen[key] = true;
  if (!hasMember(r.ns, r.mem)) {
    // UI 层在无头环境不装载，其成员在任何环境都可能查不到——单列，不混进真悬空
    const bucket = UI_OPTIONAL.indexOf(r.ns) >= 0 ? uiPhantom : phantom;
    bucket.push(Object.assign({ reason: '成员不存在' }, r));
  }
});
nsList.forEach(function (ns) {
  const isUi = UI_OPTIONAL.indexOf(ns) >= 0;
  ['api', 'data'].forEach(function (kind) {
    surface[ns][kind].forEach(function (mem) {
      const key = ns + '.' + mem;
      if (seen[key]) return;
      // 数据常量（枚举/上限值）常被测试与诊断间接消费，不当「死」处理——单列备查
      const rec = { ns: ns, mem: mem, kind: kind, inTests: testRefSet.has(key) };
      if (isUi) uiDead.push(rec); else if (kind === 'api') dead.push(rec); else dataOnly.push(rec);
    });
  });
});

// 产品文件 vs 声明表
const undeclared = PROD.filter(function (f) { return !MODULE_EXPORTS[f] && f !== 'index.js'; });
const declaredMissing = Object.keys(MODULE_EXPORTS).filter(function (f) { return !fs.existsSync(path.join(BASE, f)); });
const nsMismatch = Object.keys(MODULE_EXPORTS).filter(function (f) {
  return WA[MODULE_EXPORTS[f]] && WA[MODULE_EXPORTS[f]] !== undefined ? false : !OPTIONAL_EXPORTS.includes(MODULE_EXPORTS[f]);
});

const result = {
  files: { product: PROD.length, declared: Object.keys(MODULE_EXPORTS).length, undeclared: undeclared, declaredMissing: declaredMissing },
  namespaces: nsList.length,
  members: nsList.reduce(function (a, ns) { return a + surface[ns].api.size + surface[ns].data.size; }, 0),
  membersApi: nsList.reduce(function (a, ns) { return a + surface[ns].api.size; }, 0),
  membersData: nsList.reduce(function (a, ns) { return a + surface[ns].data.size; }, 0),
  refs: refs.length,
  refNs: Array.from(new Set(refs.map(function (r) { return r.ns; }))).sort(),
  phantom: phantom,
  uiPhantom: uiPhantom,
  dead: dead,
  deadInTestsOnly: dead.filter(function (d) { return d.inTests; }).length,
  dataOnly: dataOnly,
  uiDead: uiDead
};

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('■ 出口面清册（WorldAxis）');
  console.log('  产品文件 ' + result.files.product + ' · 声明表登记 ' + result.files.declared + ' · 命名空间 ' + nsList.length + ' · 成员 ' + result.members);
  console.log('  静态引用 ' + refs.length + ' 处');
  console.log('');
  console.log('■ 悬空引用（模块接口面上引用了不存在的东西）: ' + phantom.length);
  const pGroup = Object.create(null);
  phantom.forEach(function (p) { const k = p.ns + '.' + p.mem + ' [' + p.reason + ']'; (pGroup[k] = pGroup[k] || []).push(p); });
  Object.keys(pGroup).sort().forEach(function (k) {
    const sites = pGroup[k];
    console.log('  ✗ ' + k + ' ×' + sites.length + '  ' + sites[0].file + ':' + sites[0].line + (sites[0].inComment ? '（在注释中）' : ''));
  });
  if (!phantom.length) console.log('  （无）');
  console.log('');
  console.log('■ UI 层悬空（无头环境不装载，需浏览器复核）: ' + uiPhantom.length);
  uiPhantom.forEach(function (p) { console.log('  ~ ' + p.ns + '.' + p.mem + '  ' + p.file + ':' + p.line); });
  if (!uiPhantom.length) console.log('  （无）');
  console.log('');
  console.log('■ 未登记模块（磁盘有、MODULE_EXPORTS 无）: ' + undeclared.length);
  undeclared.forEach(function (f) { console.log('  ! ' + f); });
  if (!undeclared.length) console.log('  （无）');
  console.log('■ 登记表悬空（声明了、磁盘无）: ' + declaredMissing.length);
  declaredMissing.forEach(function (f) { console.log('  ! ' + f); });
  if (!declaredMissing.length) console.log('  （无）');
  if (SHOW_DEAD) {
    console.log('');
    console.log('■ 死导出（产品零引用）: ' + dead.length + '（其中仅测试引用 ' + result.deadInTestsOnly + '）');
    dead.sort(function (a, b) { return (a.ns + a.mem) < (b.ns + b.mem) ? -1 : 1; }).forEach(function (d) {
      console.log('  · ' + d.ns + '.' + d.mem + (d.inTests ? '  ← 仅测试引用' : ''));
    });
    console.log('');
    console.log('■ 常量/数据成员产品零引用（备查，非死导出）: ' + dataOnly.length);
    dataOnly.sort(function (a, b) { return (a.ns + a.mem) < (b.ns + b.mem) ? -1 : 1; }).forEach(function (d) {
      console.log('  · ' + d.ns + '.' + d.mem + (d.inTests ? '  ← 仅测试引用' : ''));
    });
  }
}
process.exit(phantom.length ? 1 : 0);
