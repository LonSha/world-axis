#!/usr/bin/env node
// WorldAxis tests/o8-consumer-gate-v2187.js — 导出消费者类型门禁（O8，v2.187.0）
//
// ── 它守的是什么 ───────────────────────────────────────────────────────
//   计划 O8 原文：「为每个导出登记**消费者类型**（面板控件 / 注入源 / 诊断节 / 其他引擎 /
//   仅程序化接口 / 无），从『被调用次数』进入『有无真实玩家可见路径』。无消费者者二选一：
//   接上消费者，或**显式标注**『仅程序化接口』并写出理由。**『无消费者且未标注』的数量归零**。」
//   边界：「不为了消读数而删除可用接口；**标注是登记不是豁免**；不把
//   `checkpoints` 这类『能力齐全但没入口』直接判死 —— 它正是 E3 的现成基础。」
//
//   本门禁把「归零」与「登记不是豁免」各钉成**可机械判定**的判据：
//     A. **单一真源**：消费者类型只由 `tools/consumer-types.js` 现算，本文件不重写判据；
//        且它**不另写遍历器与引用正则**（文件面走 `product-files`／引用面走 `inventory` 的
//        `REF_RE` + `codeFace`／自用数走 `dead-export-gate` 的口径）。
//        为什么这条必须单列：**判据两处各写一遍必然漂移**，而漂移的表现就是
//        「门禁说归零、现场还有一堆」——本仓已在 `select()` 与 `buildOutcome()` 上各栽过一次。
//     B. **归零**：现场 `unregistered.length === 0`（无消费者且未登记的导出数归零）。
//     C. **登记不是豁免**：每条登记必须 ① 真的没有消费者（有则 `stale-entry`）；
//        ② 写出理由（空则 `reason-absent`）；③ 类别在**有限词表**里；④ 类别与**现场复算形态**
//        一致（`shapeOf` 现算，形态变了而登记没改即 `shape-stale`）；
//        ⑤ 类别为「设置口」者，该模块**必须真的向 `settingsBus` 注册过**（否则是「根本没接线」，
//        与「注册了没人读」处置不同，不许合成一档）。
//     D. **反空转**：归零不得靠「扫描面塌成空集」达成 —— 导出成员数、可裁档位数、
//        多档非空、扫描文件数四条下限同时成立，否则本门禁在空集上恒真。
//
// ── 负控制（N 系列，全部在**内存副本模块**上做真破坏 + 两向自证）──────────
//   N1 摘掉 `panel` 的文件映射 ⇒ `panel` 档必须塌（引用面真的在按文件分档）；
//   N2 把 `own` 正则改回「排除 `.` 前缀」⇒ 该成员的 own 必须变（口径真在读现场）；
//   N3 摘掉 `settings-registry-only` 的形态判据 ⇒ 登记必须报 `shape-stale`（形态真在复算）；
//   N4 往注册表里塞一条**有消费者**的登记 ⇒ 必须报 `stale-entry`（过期登记必须现形）；
//   N5 把 `__settingsRegs` 读空 ⇒ 该档必须报 `registry-absent`（存在性核对真的在跑）。
//   五条都**不写死模拟常量**：破坏打在真源码的内存副本上，判据在副本上重跑；
//   破坏副本必须**真被加载**（写到 `tools/_neg_*.js`，与真源同目录 ⇒ ROOT 一致），
//   并在原版上跑**同款判据**证明它在原版下为真（两向自证）。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tests/o8-consumer-gate-v2187.js             # 全量
//   node tests/o8-consumer-gate-v2187.js --methods=A,B
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL_P = path.join(ROOT, 'tools', 'consumer-types.js');
const LEDGER_P = path.join(ROOT, 'tests', 'consumer-ledger.json');
const RUN_P = path.join(ROOT, 'tests', 'run.js');

let pass = 0, fail = 0;
const failures = [];
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; failures.push(name); console.log('  \u2717 ' + name + (extra ? ' — ' + extra : '')); }
}

const toolSrc = fs.readFileSync(TOOL_P, 'utf8');
const CT = require(TOOL_P);
const res = CT.classify();

// ── A. 单一真源 ───────────────────────────────────────────────────────
function runA() {
  console.log('\nA. 单一真源（消费者类型只有一份判据）');
  a(typeof CT.classify === 'function' && typeof CT.shapeOf === 'function'
    && typeof CT.registryProblems === 'function', 'A1 consumer-types 导出 classify / shapeOf / registryProblems');
  a(Array.isArray(CT.TYPES) && CT.TYPES.length >= 6 && Array.isArray(CT.SHAPES) && CT.SHAPES.length >= 4,
    'A2 档位词表与形态词表都是有限集合（' + CT.TYPES.length + ' 档 / ' + CT.SHAPES.length + ' 形态）');
  // 本文件不重写判据：只消费工具的现算结果，不在这里另立一份档位表。
  //   【锚点必须拆开拼接】初版这里直接搜 `TYPES.forEach` 与 `res.unregistered.length` ——
  //   而那两个字符串**就写在判据自己这一行里**，于是反面判据恒假、正面判据恒真：
  //   **判据被自己的源码满足**（本仓检查表的第 ③ 条假绿形态，与「破坏把判据自己删了」同族）。
  //   拆开拼接之后，源码里不再出现完整字面量，命中即意味着**真有**那个定义/调用。
  const self = fs.readFileSync(__filename, 'utf8');
  const MARK_CALL = 'CT.c' + 'lassify()';
  const MARK_TABLE = 'const TY' + 'PES =';
  const MARK_UNREG = 'res.unregi' + 'stered';
  a(self.indexOf(MARK_CALL) >= 0 && self.indexOf(MARK_TABLE) < 0 && self.indexOf(MARK_UNREG) >= 0,
    'A3 本门禁只消费 consumer-types 的现算结果（不在这里另立档位表；锚点已拆开以防自我指涉）',
    'call=' + (self.indexOf(MARK_CALL) >= 0) + ' ownTable=' + (self.indexOf(MARK_TABLE) >= 0)
    + ' unreg=' + (self.indexOf(MARK_UNREG) >= 0));
  // 工具不另写遍历器 / 引用正则（委托三处真源）
  a(toolSrc.indexOf("require(path.join(ROOT, 'tests', 'inventory.js'))") >= 0
    && toolSrc.indexOf('inv.PRODUCT_FILES') >= 0 && toolSrc.indexOf('inv.REF_RE') >= 0
    && toolSrc.indexOf('inv.codeFace') >= 0,
    'A4 文件面与引用面**委托** inventory（不另写遍历器与引用正则）');
  a(toolSrc.indexOf("require(path.join(ROOT, 'tests', 'dead-export-gate.js'))") >= 0
    && toolSrc.indexOf('DE.testRefCount') >= 0 && toolSrc.indexOf('DE.walkPass') >= 0,
    'A5 测试侧与自用数**委托** dead-export-gate（同一份实现，不写第二套口径）');
  // 与门禁的 own 口径**跨实现对账**（同一批成员，两边现算必须相等）
  const DE = require(path.join(ROOT, 'tests', 'dead-export-gate.js'));
  const inv = require(path.join(ROOT, 'tests', 'inventory.js'));
  const fileOfNs = {};
  Object.keys(inv.MODULE_EXPORTS).forEach(function (f) { fileOfNs[inv.MODULE_EXPORTS[f]] = f; });
  let diff = 0, checked = 0;
  DE.walkPass(function () {
    res.entries.slice(0, 40).forEach(function (e) {
      const rel = fileOfNs[e.ns];
      if (!rel) return;
      checked += 1;
      if (CT.ownOf(rel, e.mem) !== DE.ownRefCount({ ns: e.ns, mem: e.mem })) diff += 1;
    });
  });
  a(checked >= 30 && diff === 0, 'A6 own 口径跨实现一致（抽 ' + checked + ' 条，差异 ' + diff + '）',
    'checked=' + checked + ' diff=' + diff);
}

// ── B. 归零 ───────────────────────────────────────────────────────────
function runB() {
  console.log('\nB. 「无消费者且未登记」归零');
  a(res.unregistered.length === 0, 'B1 未登记的无消费者导出数 = 0（实 ' + res.unregistered.length + '）',
    res.unregistered.slice(0, 6).map(function (e) { return e.key; }).join(', '));
  a(res.summary.none === 0, 'B2 none 档为 0（实 ' + res.summary.none + '）');
  a(res.registrySize >= 100, 'B3 登记表非空（' + res.registrySize + ' 条）—— 空表上「无 stale」是恒真的');
}

// ── C. 登记不是豁免 ───────────────────────────────────────────────────
function runC() {
  console.log('\nC. 登记不是豁免（双面核对 + 形态复算）');
  const probs = CT.registryProblems(res);
  a(probs.length === 0, 'C1 注册表双面核对通过（无 stale / 无缺理由 / 无形过期）',
    probs.slice(0, 4).map(function (x) { return x.kind + ':' + x.key; }).join(' | '));
  // 登记项都是 { shape, why } 对象（不留「裸字符串」的活口）
  const reg = CT.loadRegistry().programmatic || {};
  const badShape = Object.keys(reg).filter(function (k) { return !reg[k] || typeof reg[k] !== 'object'; });
  a(badShape.length === 0, 'C2 每条登记都是 { shape, why } 对象（裸字符串 ' + badShape.length + ' 条）');
  const emptyWhy = Object.keys(reg).filter(function (k) { return !String((reg[k] || {}).why || '').trim(); });
  a(emptyWhy.length === 0, 'C3 每条登记都写了理由（空理由 ' + emptyWhy.length + ' 条）');
  // 形态复算：登记的 shape 必须与现场现算一致（逐条）
  let stale = 0;
  res.entries.forEach(function (e) {
    const v = reg[e.key];
    if (!v) return;
    if (CT.shapeOf(e) !== v.shape) stale += 1;
  });
  a(stale === 0, 'C4 登记的形态与现场复算逐条一致（失配 ' + stale + ' 条）');
  // 「设置口」那一档的存在性核对真的在跑（不是缺数据就放行）
  const live = res.registryLiveness || {};
  const keyCount = Object.keys(live).length;
  a(keyCount >= 100, 'C5 registryLiveness 现场复算 ≥100 个命名空间（实 ' + keyCount + '）—— 缺数据不得当成通过');
  const settingsKeys = Object.keys(reg).filter(function (k) { return reg[k].shape === 'settings-registry-only'; });
  const deadNs = settingsKeys.filter(function (k) {
    const ns = k.split('.')[0];
    return live[ns] === false;
  });
  a(settingsKeys.length > 0 && deadNs.length === 0,
    'C6 「设置口」登记（' + settingsKeys.length + ' 条）对应的模块**都真的注册过设置键**（未注册 ' + deadNs.length + ' 条）',
    deadNs.slice(0, 4).join(', '));
  // 登记是**逐条**的：不许拿一条通配糊过去
  a(Object.keys(reg).every(function (k) { return /^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(k); }),
    'C7 登记键全部是具体成员（无通配 / 无命名空间级豁免）');
}

// ── D. 反空转 ─────────────────────────────────────────────────────────
function runD() {
  console.log('\nD. 反空转（归零不得靠扫描面塌掉达成）');
  a(res.total >= 2000, 'D1 导出成员面 ≥2000（实 ' + res.total + '）');
  const nonEmpty = CT.TYPES.filter(function (t) { return t !== 'none' && res.summary[t] > 0; });
  a(nonEmpty.length >= 5, 'D2 至少 5 个档位非空（实 ' + nonEmpty.length + '：' + nonEmpty.join('/') + '）');
  a(res.summary.panel > 100, 'D3 玩家可见档（panel）>100（实 ' + res.summary.panel + '）');
  a(res.summary.internal > 100, 'D4 过度导出档（internal）>100（实 ' + res.summary.internal + '）');
  const files = Object.keys(res.entryFiles || {}).length;
  a(files >= 150, 'D5 扫描文件面 ≥150（实 ' + files + '）');
  a(res.summary.programmatic === res.registrySize,
    'D6 programmatic 档数 === 登记数（' + res.summary.programmatic + ' / ' + res.registrySize + '）');
}

// ── N. 负控制 ─────────────────────────────────────────────────────────
function runN() {
  console.log('\nN. 负控制（内存副本模块上的真破坏 + 两向自证）');
  // 破坏副本写到**同目录**（ROOT 由 __dirname 推出，换目录会让它扫到别的仓库）
  const tmpOf = function (n) { return path.join(ROOT, 'tools', '_neg_o8_' + n + '_' + process.pid + '.js'); };
  const withCopy = function (n, patched, fn) {
    const p = tmpOf(n);
    fs.writeFileSync(p, patched);
    try { fn(p); } finally { try { fs.unlinkSync(p); } catch (e) { /* 已删 */ } }
  };
  const orig = CT.loadRegistry();

  // N1：摘掉 panel 的文件映射 ⇒ panel 档必须塌
  const noPanel = toolSrc.replace(
    "const ENTRY_FILES = { 'ui/panel.js': 'panel', 'render/inject.js': 'inject', 'engines/tool-diag.js': 'diag' };",
    "const ENTRY_FILES = { 'render/inject.js': 'inject', 'engines/tool-diag.js': 'diag' };");
  a(noPanel !== toolSrc, 'N1 破坏「panel 文件映射」⇒ 破坏可观测（文本变了）');
  withCopy('n1', noPanel, function (p) {
    const M = require(p);
    const r = M.classify();
    a(r.summary.panel === 0, 'N1b 破坏副本上 panel 档塌成 0（实 ' + r.summary.panel + '）—— 引用面真在按文件分档');
  });
  a(res.summary.panel > 0, 'N1c 原版上同款判据为真（panel 档 = ' + res.summary.panel + '，两向自证成立）');

  // N2：把 own 的**代码面**清空 ⇒ own 必须从真值塌成 0
  //   【锚点为什么换到这里】初版我照「记忆里的正则」写锚点（转义与源码不一致），
  //   替换落到了错位置、把两段文本拼成一句语法崩的代码（实测 `Unexpected token '?'`）。
  //   教训：**锚点必须先从源码里查证真实文本**，不能凭记忆转义 —— 与「破坏可观测」同规。
  //   这一行的锚点不含任何反斜杠，无歧义，且语义上同样可观测。
  const ownOld = toolSrc.replace(
    "function ownOf(rel, mem, opt) {\n  const code = codeFaceOf(rel, opt);",
    "function ownOf(rel, mem, opt) {\n  const code = '';   // 破坏：代码面被清空");
  a(ownOld !== toolSrc, 'N2 破坏「own 读取的代码面」⇒ 破坏可观测（文本变了）');
  withCopy('n2', ownOld, function (p) {
    const M = require(p);
    const mine = M.ownOf('ui/panel.js', 'open');
    const good = CT.ownOf('ui/panel.js', 'open');
    a(mine === 0 && good > 0, 'N2b 破坏副本上 own 塌成 0（' + good + ' → ' + mine + '）—— 口径真在读现场');
  });
  a(CT.ownOf('ui/panel.js', 'open') > 0, 'N2c 原版 own 为正（' + CT.ownOf('ui/panel.js', 'open') + '）');

  // N3：摘掉 settings-registry-only 的形态判据 ⇒ 登记必须报 shape-stale
  const noShape = toolSrc.replace(
    "  if (entry.mem === 'getSettings' || entry.mem === 'setSettings') return 'settings-registry-only';",
    "  /* 破坏：设置口形态判据被摘掉 */");
  a(noShape !== toolSrc, 'N3 破坏「设置口形态判据」⇒ 破坏可观测（文本变了）');
  withCopy('n3', noShape, function (p) {
    const M = require(p);
    const r = M.classify();
    const probs = M.registryProblems(r);
    const stale = probs.filter(function (x) { return x.kind === 'shape-stale'; });
    a(stale.length > 0, 'N3b 破坏副本上报出 shape-stale（实 ' + stale.length + ' 条）—— 形态真在复算');
  });
  a(CT.registryProblems(res).filter(function (x) { return x.kind === 'shape-stale'; }).length === 0,
    'N3c 原版上无 shape-stale（两向自证成立）');

  // N4：往注册表里塞一条**有消费者**的登记 ⇒ 必须报 stale-entry
  const withBad = JSON.parse(JSON.stringify(orig));
  withBad.programmatic['checkpoints.save'] = { shape: 'query-api', why: '人为植入的过期登记' };
  // 破坏用表写 **/tmp**（不写仓库目录：本仓有一批按目录遍历的判据，往里扔文件会静默改它们的输入面）
  const NEG_LEDGER = path.join(require('os').tmpdir(), 'wa-o8-neg-ledger-' + process.pid + '.json');
  fs.writeFileSync(NEG_LEDGER, JSON.stringify(withBad, null, 2));
  withCopy('n4', toolSrc.replace(
    "const LEDGER_P = path.join(ROOT, 'tests', 'consumer-ledger.json');",
    "const LEDGER_P = require('path').join(require('os').tmpdir(), 'wa-o8-neg-ledger-' + process.pid + '.json');"), function (p) {
    const M = require(p);
    const r = M.classify();
    const probs = M.registryProblems(r);
    const stale = probs.filter(function (x) { return x.kind === 'stale-entry'; });
    a(stale.length === 1 && stale[0].key === 'checkpoints.save',
      'N4b 破坏副本上报出 stale-entry（' + stale.length + ' 条）—— 过期登记必须现形',
      stale.map(function (x) { return x.key; }).join(','));
  });
  try { fs.unlinkSync(NEG_LEDGER); } catch (e) { /* 已删 */ }
  a(CT.registryProblems(res).filter(function (x) { return x.kind === 'stale-entry'; }).length === 0,
    'N4c 原版上无 stale-entry（两向自证成立）');

  // N5：把 __settingsRegs 读空 ⇒ 该档必须报 registry-absent
  const noLive = toolSrc.replace(
    "    const regs = Array.isArray(WA.__settingsRegs) ? WA.__settingsRegs : [];",
    "    const regs = [];   // 破坏：注册表读空");
  a(noLive !== toolSrc, 'N5 破坏「设置注册读口」⇒ 破坏可观测（文本变了）');
  withCopy('n5', noLive, function (p) {
    const M = require(p);
    const r = M.classify();
    const probs = M.registryProblems(r);
    const absent = probs.filter(function (x) { return x.kind === 'registry-absent'; });
    a(absent.length > 0, 'N5b 破坏副本上报出 registry-absent（实 ' + absent.length + ' 条）—— 存在性核对真的在跑');
  });
  a(CT.registryProblems(res).filter(function (x) { return x.kind === 'registry-absent'; }).length === 0,
    'N5c 原版上无 registry-absent（两向自证成立）');

  // N6：全程未改真源码 / 未留副本
  a(fs.readFileSync(TOOL_P, 'utf8') === toolSrc
    && JSON.stringify(CT.loadRegistry()) === JSON.stringify(orig),
    'N6 负控制全程未改真源码与真登记表（tool + ledger 逐字未变）');
  const leftovers = fs.readdirSync(path.join(ROOT, 'tools')).filter(function (n) {
    return n.indexOf('_neg_o8_') === 0;
  });
  a(leftovers.length === 0, 'N7 破坏副本已全部清理（残留 ' + leftovers.length + ' 个）');
}

const ARGV = process.argv.slice(2);
const only = (ARGV.filter(function (x) { return x.indexOf('--methods=') === 0; })[0] || '').slice(10)
  .split(',').filter(Boolean);
function want(k) { return !only.length || only.indexOf(k) >= 0; }

if (want('A')) runA();
if (want('B')) runB();
if (want('C')) runC();
if (want('D')) runD();
if (want('N')) runN();

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
if (failures.length) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
process.exit(0);