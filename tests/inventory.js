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
//   · 引用面取**静态正则**（v2.29.0 起只在**真代码面**上跑：注释与字符串文本里的
//     `WA.ns.mem` 不算引用——否则「加一行注释」即可把死子面静默改小，见 codeFace 注释）；
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

// ── 3. 引用面：静态扫描产品代码（v2.28.0 提到模块顶层，供门禁复用同一份扫描面与正则）──
// v2.43.0：产品文件面的**定义**上收至 tests/product-files.js（单一真源）。
//   此前「什么算产品文件面」在四处各写了一遍遍历器（本文件 / field-liveness-gate /
//   export-contract / run.js 内联），口径已经开始漂移：export-contract 只排 tests/、
//   本文件排 tests/+tools/。统一到一处后，差集的来源只可能是真实的文件增删，
//   不可能再是「两个遍历器的排除名单不一致」。PRODUCT_FILES 的对外语义与取值逐项不变。
const { productFiles } = require('./product-files.js');
const PROD = productFiles();
// 引用面正则：`WA.x.y` 与可选链 `WA.x?.y` 都算真引用；私有成员（`_` 前缀）与
// 非接口命名空间（宿主级导出、数组下标）在下面两道 guard 里挡掉。
const REF_RE = /WA\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g;

// v2.29.0 — 真代码面提取器（codeFace）。
// 为什么需要它：引用面的**输入**必须是「真会被执行的代码」，不能是「文件里出现过的字符」。
//   · 注释里写 `WA.bridge.snapshot` 只是文档债，不是消费方；
//   · 字符串字面量里的 `WA.ns.mem`（诊断提示文本、模板 HTML、规则说明）同理。
//   旧口径只按「行首是不是 // * /*」判注释，于是三处漏判：
//     ① 行尾注释（`wa.x.y(); // WA.a.b 已接通`）——行首不是注释标记，整行计入引用；
//     ② 字符串字面量——写成文本的成员名被当成调用；
//     ③ 模板字符串里**嵌在 ${} 中的真代码**——这才是真引用，但朴素剥离会把它一起剥掉。
//   实测：在任一产品文件末尾加一行 `// 外部可调 WA.bridge.snapshot` ⇒ 冻结面 208→207，
//   门禁照样输出 ✓（「已登记的死导出消失 1 项」只提示、不红灯），跑一次 --update 就把
//   该条目从账本删除——**死子面被一行注释永久掏空**，比 v2.27.0 治的「新增无人提示」更隐蔽。
// 做法：单遍状态机（长度与行号守恒，原位空格替换，行号仍可与原文对照）。
//   状态：code / line / block / sq / dq / tpl；
//   · 模板字符串的**文本**不是代码，但 `${ ... }` 内的表达式**是代码**（用 brace 计数配对）；
//   · 单双引号串遇换行即终止（JS 语义：未闭合的单双引号是语法错误）；
//   · `/` 是正则字面量还是除法：看前一个非空白代码字符（`( , = : [ ! & | ? { } ; + - * % < > ~ ^` 之后为正则）。
//   保真性靠「长度守恒 + 行数守恒」自检（tests/run.js 的 v2.29.0 块钉住）。
function codeFace(src) {
  let out = '';
  const n = src.length;
  const stack = [{ kind: 'code', brace: -1 }];   // brace>=0 表示这一层由 ${ 进入
  const CONT = '(),=:[!&|?{};+-*%<>~^/\n \t';
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    const st = stack[stack.length - 1];
    if (st.kind === 'code') {
      if (c === '/' && d === '/') { stack.push({ kind: 'line', brace: st.brace }); out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { stack.push({ kind: 'block', brace: st.brace }); out += '  '; i += 2; continue; }
      if (c === '/') {
        let j = out.length - 1;
        while (j >= 0 && (out[j] === ' ' || out[j] === '\t' || out[j] === '\n')) j -= 1;
        const prev = j >= 0 ? out[j] : '';
        if (prev === '' || CONT.indexOf(prev) >= 0) {
          let k = i + 1, inClass = false, ok = false;
          while (k < n) {
            const e = src[k];
            if (e === '\\') { k += 2; continue; }
            if (e === '[') inClass = true;
            else if (e === ']') inClass = false;
            else if (e === '/' && !inClass) { ok = true; break; }
            else if (e === '\n') break;
            k += 1;
          }
          if (ok) { while (i <= k) { out += (src[i] === '\n' ? '\n' : ' '); i += 1; } continue; }
        }
        out += c; i += 1; continue;
      }
      if (c === "'") { stack.push({ kind: 'sq', brace: -1 }); out += ' '; i += 1; continue; }
      if (c === '"') { stack.push({ kind: 'dq', brace: -1 }); out += ' '; i += 1; continue; }
      if (c === '`') { stack.push({ kind: 'tpl', brace: -1 }); out += ' '; i += 1; continue; }
      if (c === '{' && st.brace >= 0) { st.brace += 1; out += c; i += 1; continue; }
      if (c === '}' && st.brace >= 0) {
        if (st.brace === 0) { stack.pop(); out += ' '; i += 1; continue; }   // 插值结束，回模板
        st.brace -= 1; out += c; i += 1; continue;
      }
      out += c; i += 1; continue;
    }
    if (st.kind === 'line') { if (c === '\n') { stack.pop(); out += '\n'; } else out += ' '; i += 1; continue; }
    if (st.kind === 'block') {
      if (c === '*' && d === '/') { stack.pop(); out += '  '; i += 2; }
      else { out += (c === '\n' ? '\n' : ' '); i += 1; }
      continue;
    }
    if (st.kind === 'tpl') {
      if (c === '\\') { out += '  '; i += 2; continue; }
      if (c === '`') { stack.pop(); out += ' '; i += 1; continue; }
      if (c === '$' && d === '{') { stack.push({ kind: 'code', brace: 0 }); out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    const q = st.kind === 'sq' ? "'" : '"';
    if (c === '\\') { out += '  '; i += 2; continue; }
    if (c === q) { stack.pop(); out += ' '; i += 1; continue; }
    if (c === '\n') { stack.pop(); out += '\n'; i += 1; continue; }
    out += ' '; i += 1; continue;
  }
  return out;
}

// ── 4. 装载（与 tests/run.js 同一上下文语义）──
// v2.27.0: 抽成 collect() 后可被门禁（tests/dead-export-gate.js）复用同一份口径，
//   不再有第二份「表面求差」实现 —— 单源是判据诚实的前提。
function collect() {
// v2.27.0: 「已装载」判据不能用 `!!global.WorldAxis` —— tests/mock.js 会预置**宿主级空壳**
//   （version / log / eventLog / on / emit …），于是该表达式恒真，CLI 首跑即误判「已装载」，
//   整体跳过装载 ⇒ 定义面塌成命名空间 0 项、全部引用反被判为悬空（实测 1209 悬空）。
//   判据改为「装载清单里的模块命名空间是否已有实例」：mock 的宿主壳里不含任何一个。
//   用 some() 而非 every()：宁可认为「已装载」（复用现有实例，不重复求值引擎），
//   也不要在 run.js 进程内因个别模块缺登记而重复装载（会重复订阅总线、污染计量）。
const ALREADY = LOAD.some(function (rel) {
  const ns = MODULE_EXPORTS[rel];
  return !!(ns && global.WorldAxis && global.WorldAxis[ns]);
});
const ctx = vm.createContext(global);
if (!ALREADY) {
for (const rel of LOAD) {
  vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
}
}  // end if (!ALREADY)：已装载时复用现有 global.WorldAxis，跳过重复求值
// v2.8.0 / v2.27.0: UI 层**幂等确保**装载。tests/run.js 的 LOAD 刻意不含 ui/*（无头环境不需要真实 DOM），
//   但 mock 提供的 document 足以让三个 UI 模块走完顶层求值——装载成功即「UI 导出面可验证」，
//   于是「ui.mount / uiSettings.render 查不到」这类**假悬空**不再需要人工判断。
//   装载失败（真缺 DOM 能力）时该模块缺席，其引用退回 uiPhantom 单列。
//   v2.27.0 修正：此前 UI 装载写在 `if (!ALREADY)` 内，于是**复用路径**（门禁在 tests/run.js
//   进程内调用 collect()，此时 UI 层尚未装载）会得到另一幅面：命名空间 61 / uiPhantom 14 / uiDead 0，
//   与 CLI 的 64 / 0 / 4 不一致。定义面随**调用时机**漂移 = 判据不确定，门禁与账本都不可能与它对齐。
//   现改为无条件按需装载（只补缺席的，已装载的不重复求值）：两条路径结果逐项一致。
const UI_LOAD = require('./product-files.js').uiFiles(BASE);
for (const rel of UI_LOAD) {
  const ns = MODULE_EXPORTS[rel];
  if (ns && WA_peek(ns)) continue;   // 已在册：复用，不重复求值
  try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); }
  catch (e) { /* 环境不足以装载 UI：不视作缺陷，后续单列 */ }
}
const WA = global.WorldAxis;
function WA_peek(ns) { return !!(global.WorldAxis && global.WorldAxis[ns]); }

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

// ── 5. 引用面：静态扫描产品代码（面与正则见 §3 模块顶层，此处只消费）──
// v2.29.0: 逐文件先过 codeFace() 剥出**真代码面**，再跑 REF_RE。注释与字符串文本里的
//   `WA.ns.mem` 不再计入引用面——「提及」不等于「引用」。
const refs = [];              // { ns, mem, file, line }
for (const rel of PROD) {
  const src = codeFace(fs.readFileSync(path.join(BASE, rel), 'utf8'));
  const lines = src.split('\n');
  lines.forEach(function (line, idx) {
    REF_RE.lastIndex = 0;
    let m;
    while ((m = REF_RE.exec(line))) {
      const ns = m[1], mem = m[2];
      if (!MODULE_NS.has(ns)) continue;                        // 只审模块接口面
      if (mem.charAt(0) === '_') continue;                     // 私有成员不属承诺面
      refs.push({ ns: ns, mem: mem, file: rel, line: idx + 1 });
    }
  });
}
// 测试侧引用（只统计，不参与死导出判定）
const testSrc = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
const testRefSet = new Set();
(function () {
  let m; REF_RE.lastIndex = 0;
  const testCode = codeFace(testSrc);              // v2.29.0：测试侧同样只认真代码
  while ((m = REF_RE.exec(testCode))) testRefSet.add(m[1] + '.' + m[2]);
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
return result;
}

if (require.main === module) {
  const result = collect();
  const phantom = result.phantom, uiPhantom = result.uiPhantom;
  const dead = result.dead, dataOnly = result.dataOnly;
  const undeclared = result.files.undeclared, declaredMissing = result.files.declaredMissing;
  if (AS_JSON) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('■ 出口面清册（WorldAxis）');
    console.log('  产品文件 ' + result.files.product + ' · 声明表登记 ' + result.files.declared + ' · 命名空间 ' + result.namespaces + ' · 成员 ' + result.members);
    console.log('  静态引用 ' + result.refs + ' 处');
    console.log('');
    console.log('■ 悬空引用（模块接口面上引用了不存在的东西）: ' + phantom.length);
    const pGroup = Object.create(null);
    phantom.forEach(function (p) { const k = p.ns + '.' + p.mem + ' [' + p.reason + ']'; (pGroup[k] = pGroup[k] || []).push(p); });
    Object.keys(pGroup).sort().forEach(function (k) {
      const sites = pGroup[k];
      console.log('  ✗ ' + k + ' ×' + sites.length + '  ' + sites[0].file + ':' + sites[0].line);
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
      dead.slice().sort(function (a, b) { return (a.ns + a.mem) < (b.ns + b.mem) ? -1 : 1; }).forEach(function (d) {
        console.log('  · ' + d.ns + '.' + d.mem + (d.inTests ? '  ← 仅测试引用' : ''));
      });
      console.log('');
      console.log('■ 常量/数据成员产品零引用（备查，非死导出）: ' + dataOnly.length);
      dataOnly.slice().sort(function (a, b) { return (a.ns + a.mem) < (b.ns + b.mem) ? -1 : 1; }).forEach(function (d) {
        console.log('  · ' + d.ns + '.' + d.mem + (d.inTests ? '  ← 仅测试引用' : ''));
      });
    }
  }
  // v2.27.0: 用 exitCode 而非 process.exit()。实测在**输出很大且 stdout 是管道**时（破坏态下 --json 有
  //   137,750 字符），process.exit() 会截断尚未刷出的 stdout —— JSON 断在半个对象上，管道消费者拿到
  //   「exit 1 + 无法解析的垃圾」，既丢结论又误导（本仓裁决：探测器坏了比缺陷更危险）。
  //   exitCode 只设码不强制退出，Node 在 stdout 排空后以该码结束，语义完全一致。
  process.exitCode = result.phantom.length ? 1 : 0;
}
// v2.28.0：向外导出 PRODUCT_FILES（产品文件扫描面）与 REF_RE（引用面正则），
//   供 tests/dead-export-gate.js 复算「归因证据」时使用。证据的扫描面与正则必须与清册**同源**——
//   若门禁自己再 walk 一遍目录、或另写一条引用正则，就会出现「证据说 refs>0、判据说该成员是死导出」
//   这种自相矛盾（判据的输入面与结论面必须是同一件事）。
module.exports = { collect: collect, MODULE_EXPORTS: MODULE_EXPORTS, PRODUCT_FILES: PROD, REF_RE: REF_RE, codeFace: codeFace };
