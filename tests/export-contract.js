// WorldAxis tests/export-contract.js — 出口面契约生成器（只读审计基建）
//
// 用途：重新生成 tests/run.js 里 v2.8.0 块1 的冻结串（依赖面变动后需要显式更新）。
//   输出写入**仓库内** tests/export_contract.txt（v2.41.0 从 /tmp 迁入：共享临时目录
//   多副本并行会互相覆盖），并打印 ns / 成员数 / 字符数供核对。产物已在 .gitignore 忽略。
//   为什么需要显式更新：门禁是**双向**的——接口面任何增删都必须有人确认过，
//   否则「成员被悄悄改名/删掉、调用方静默降级」这类事会重新变成不可见的。
//   口径必须与测试块逐字一致（含排除名单：仅 UI 层三个模块依赖宿主 DOM）。

// 生成紧凑的「出口面契约」字符串：ns:m1 m2 m3|ns:m4 ...
// v2.41.0：BASE / mock / 产物路径此前**硬编码 `/tmp/wa_git`** —— 换目录或换机器跑
//   会直接 throw（可移植性缺陷）；且原产物路径 `/tmp/export_contract.txt` 是共享临时
//   目录，多副本并行时互相覆盖。现全部从 `__dirname` 推导（与其余门禁一致），
//   产物落在仓库内、被测的唯一真源就是**运行中的仓库本身**。
const fs = require('fs'), path = require('path'), vm = require('vm');
const BASE = path.join(__dirname, '..');
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const li = runSrc.indexOf('const LOAD = ['); const lj = runSrc.indexOf('];', li);
const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', li), lj + 1) + ')');
const ctx = vm.createContext(global);
for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
// 刻意**不**装载 UI 层：口径必须与 tests/run.js 的测试块一致（无头环境不装载 UI），
// 否则冻结串里会多出 ui/uiSettings/assistant 的成员，而测试块那里根本没有这些导出。
const diagSrc = fs.readFileSync(BASE + '/engines/tool-diag.js', 'utf8');
const mi = diagSrc.indexOf('const MODULE_EXPORTS = {');
const mj = diagSrc.indexOf('\n  };', mi);
const MODULE_EXPORTS = vm.runInNewContext('(' + diagSrc.slice(diagSrc.indexOf('{', mi), mj + 4) + ')');
const OWNER = {}; Object.keys(MODULE_EXPORTS).forEach(function (f) { OWNER[MODULE_EXPORTS[f]] = f; });
const OPTIONAL = ['ui', 'uiSettings', 'assistant'];   // 仅 UI 层依赖宿主；compat 无头可装载
const WA = global.WorldAxis;

function files() {
  const out = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === '.git' || e.name === 'node_modules') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (e.name.endsWith('.js') && dir !== path.join(BASE, 'tests')) out.push(path.relative(BASE, p));
    });
  })(BASE);
  return out.sort();
}
const RE = /WA\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g;
const map = {};
files().forEach(function (rel) {
  fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n').forEach(function (line) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    RE.lastIndex = 0; let m;
    while ((m = RE.exec(line))) {
      const ns = m[1], mem = m[2];
      if (!OWNER[ns] || mem.charAt(0) === '_' || OWNER[ns] === rel) continue;
      if (OPTIONAL.indexOf(ns) >= 0 && !WA[ns]) continue;      // UI 层未装载：按可选处理
      (map[ns] = map[ns] || new Set()).add(mem);
    }
  });
});
const parts = Object.keys(map).sort().map(function (ns) {
  return ns + ':' + Array.from(map[ns]).sort().join(' ');
});
const contract = parts.join('|');
const OUT = path.join(BASE, 'tests', 'export_contract.txt');
fs.writeFileSync(OUT, contract, 'utf8');
const names = Object.keys(map).reduce(function (a, ns) { return a + map[ns].size; }, 0);
console.log('ns=', Object.keys(map).length, 'members=', names, 'chars=', contract.length);
console.log('写入:', path.relative(process.cwd(), OUT) || OUT);
console.log('---');
console.log(contract);