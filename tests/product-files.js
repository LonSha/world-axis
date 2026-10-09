// WorldAxis tests/product-files.js (v2.43.0) — 文件面单一真源
//
// 为什么要有它：
//   v2.40.0 治的是「门禁断言写死页面数 12」，v2.41.0 治「生成器硬编码 /tmp」，
//   v2.42.0 治「两道 ui 门禁各自持一份硬编码三文件清单」。三次是**同一家族**：
//   把一个会长的集合写成常量（或在多处各写一遍），于是集合长大了、口径漂移了，
//   门禁却不知道。v2.42.0 修完当场复查又抓到**同家族的两只漏网**：
//     · tests/run.js 的守卫表控件 id 采集面 `uiFilesH` —— 仍硬编码三文件；
//     · tests/inventory.js 的 UI 装载面 `UI_LOAD` —— 仍硬编码三文件。
//   实测坐实（副本注入 ui/zb_extra.js，含 id="wa-zb-untracked"）：硬编码采集面恒 198，
//   动态面 199 —— 该控件**永不被守卫门禁看见**，而门禁全绿。
//   同时「什么算产品文件面」这件事在四处各写了一遍遍历器（inventory / field-liveness-gate /
//   export-contract / run.js 内联），口径已经出现分歧（见下 SKIP_DIRS 注释）。
//
// 做法：把「文件面」的定义收敛到**这一个文件**，其余各处一律委托。
//   · 判据（门禁）读的是这里导出的**函数**，不是副本常量 ——
//     新增 ui/*.js 或新增产品模块时，所有消费方同时跟随，不可能只跟一处。
//   · 零依赖：只用 Node 内置 fs / path（与仓库其余门禁一致，见 README 的零依赖约定）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// 产品文件面的排除口径（v2.22.0 起确立，本版统一到此处）：
//   · `tests/` —— 测试基建不属产品模块面；
//   · `tools/`  —— 零依赖诊断脚本（scan_drift 等），不导出命名空间、不参与出口面契约。
//   export-contract 此前只排 tests/（含 tools/），实测 tools/scan_drift.js 对 `WA.` 零引用，
//   故统一为同一口径后出口面契约逐字不变（v2.43.0 回归段钉住这一点）。
const SKIP_DIRS = ['tests', 'tools'];

/** 产品文件面：仓库内全部 .js，按 posix 相对路径升序。可注入 root 以便对副本做负向自证。 */
function productFiles(root) {
  root = root || BASE;
  const out = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === '.git' || e.name === 'node_modules') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (e.name.endsWith('.js') && SKIP_DIRS.indexOf(path.relative(root, dir)) < 0) out.push(path.relative(root, p));
    });
  })(root);
  return out.sort();
}

/** 单目录内的 .js 发现器（非递归），返回 `prefix/name.js` 形态、升序。 */
function discoverFiles(dir, prefix) {
  return fs.readdirSync(dir)
    .filter(function (n) { return /\.js$/.test(n); })
    .sort()
    .map(function (n) { return (prefix ? prefix + '/' : '') + n; });
}

/**
 * UI 文件面：`ui/` 下全部 .js。
 * v2.42.0 起由 ui-gate-sync 导出为 discoverUIFiles(dir)；本版把实现收进这里，
 * ui-gate-sync 改为**转出**（re-export）同一个函数 —— 导出面不变、实现只剩一份。
 * dir 可注入，便于门禁在临时目录上做行为级负向自证（证明它真读文件系统而非常量）。
 */
function discoverUIFiles(dir) {
  return discoverFiles(dir || path.join(BASE, 'ui'), 'ui');
}

/** 便捷形态：直接给仓库根，返回 ui/ 下的 .js 清单。 */
function uiFiles(root) {
  return discoverFiles(path.join(root || BASE, 'ui'), 'ui');
}

/**
 * 仓库内全部 .js（仅排 .git / node_modules）——**含 tests/ 与 tools/**。
 * 与 productFiles 的区别：productFiles 是「产品模块面」（模块清单/出口面/骨架归属用），
 * 而本函数是「整个代码面」，供**成类静态锁**使用——缺陷可能落在任一目录，
 * 只扫产品面会放走 tests/ 里的回退写法（v2.43.0 的两处漏网恰都在 tests/）。
 */
function repoFiles(root) {
  root = root || BASE;
  const out = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === '.git' || e.name === 'node_modules') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      if (e.name.endsWith('.js')) out.push(path.relative(root, p));
    });
  })(root);
  return out.sort();
}

/**
 * 测试面：`tests/` 下全部 .js（**含 run.js 本身**），按 posix 相对路径升序。
 *
 * v2.73.0 —— 为什么要有它：
 *   「测试引用面」此前在两处各写了一遍，且都只读 `tests/run.js` **一个文件的文本**：
 *     · tests/inventory.js 的 testRefSet（只跑 run.js 的 codeFace）；
 *     · tests/dead-export-gate.js 的 testRefCount（只读 run.js 的缓存快照）。
 *   而 run.js 是**聚合器**：它用 `require('./settle-v2650.js').runAll(assert)` 把
 *   8 个 settle-* 专锁与若干专项套件拉进同一个进程执行。于是那些文件里的真引用
 *   （`WA.karma.setSettings(...)` 之类）**对测试面完全不可见** ——
 *   实测 122 项被冻结账本误标为 unwired/self-only（「产品与测试均零引用」），
 *   而它们其实每轮回归都在被调用。归因失真与 v2.29.0 治的「一行注释掏空死子面」同族：
 *   **判据的输入面比事实窄**，结论就会稳定地错。
 *   收敛到本文件后，「什么算测试面」只有一处定义，消费方一律委托。
 */
function testFiles(root) {
  return discoverFiles(path.join(root || BASE, 'tests'), 'tests');
}
module.exports = {
  BASE: BASE,
  SKIP_DIRS: SKIP_DIRS,
  productFiles: productFiles,
  repoFiles: repoFiles,
  discoverFiles: discoverFiles,
  discoverUIFiles: discoverUIFiles,
  uiFiles: uiFiles,
  testFiles: testFiles
};
