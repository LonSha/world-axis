// WorldAxis tests/tools-v2114.js (v2.114.0) — 拒收码手册生成器专锁（计划二 #64）
//
// ── 为什么它没有并进 tools-v2110.js 的 FACES ─────────────────────────────
//   tools-v2110.js 的宿主约定建立在一条**当时为真**的事实上：「七件工具全部零相对依赖
//   （顶层只 require node 内置模块）⇒ 破坏副本可以直接落进临时目录再 require」。
//   本版新增的 tools/gen-error-codes.js 打破了这个前提，而且是**故意**打破的：
//   它的生成源就是 tests/ 侧的三源（拒收码门禁扫描面 / 见证表 / 基线台账）——
//   手册另起一份码表才是这一面最大的病（双真源：改了甲忘乙的那天，手册开始说谎）。
//   于是它的破坏副本必须落进一个**镜像根**（顶层条目整体软链真仓库 + tools/ 用副本覆盖），
//   否则 `require('../tests/…')` 解析不到，破坏会以「副本装载失败」的形态被读成「破坏生效」。
//
// ── 宿主纪律：本锁不在主进程装载产品面 ───────────────────────────────────
//   gen-error-codes 的 loadWitness() 会把 119 个模块装到 global 上（与 run.js 的 WA 同一处），
//   在主进程里跑它等于当场重置被测面；故所有会装载产品面的调用一律走**子进程**
//   （污染是进程级的，隔离才是可控的）。
//
// 四段（与 tools-v2110 同形）：
//   A 导出面 + 依赖面（顶层零相对依赖 / 函数内相对依赖恰为三源白名单）
//   B 行为（注入面四向真跑：real / empty / drop / add）
//   C 不变式（--check 是只读面 / 手册骨架 / 临时面在仓库外）
//   N 真源码破坏（摘 missing 计算 / 摘 extra 计算 ⇒ 双向性必须现形）
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wa2114-codes-'));
const TOOL_REL = 'tools/gen-error-codes.js';
const DOC_REL = 'docs/ERROR_CODES.md';
const FACES = ['collect', 'build', 'check', 'DOC_REL'];
// 相对依赖白名单：本工具的全部**函数内**相对 require（生成源三源 + 宿主 mock）。
//   新增一项就必须改这里 —— 这正是「生成源不许暗中长成第二份码表」的静态面。
const REL_DEPS = ['mock.js', 'reject-code-gate.js', 'reject-v2780.js', 'reject-code-ledger.json'];

function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hit(src, anchor) { return src.split(anchor).length - 1; }

/**
 * 镜像根：顶层条目整体软链真仓库（tools/ 与 .git 除外），tools/ 里放破坏副本。
 *  这样副本里的 BASE = path.join(__dirname, '..') 仍指向一个**与真仓库同形**的根：
 *  相对 require（../tests/*）与产品面装载（MIRROR/core/…，软链读真文件）都能真跑到。
 */
function mirrorRoot(tag, toolText) {
  const root = path.join(TMP, 'mirror-' + tag);
  fs.mkdirSync(root, { recursive: true });
  fs.readdirSync(BASE).forEach(function (name) {
    if (name === 'tools' || name === '.git') return;
    fs.symlinkSync(path.join(BASE, name), path.join(root, name));
  });
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'gen-error-codes.js'), toolText);
  return root;
}

// ── 注入夹具：在子进程里用真文档 + 注入文本调 check()，只回读数 ─────────────
const INJECT = path.join(TMP, 'inject-check.js');
function writeInject() {
  fs.writeFileSync(INJECT, [
    "'use strict';",
    "const fs = require('fs');",
    "const g = require(process.argv[2]);",
    "const mode = process.argv[3];",
    "const real = fs.readFileSync(process.argv[4], 'utf8');",
    "let text = real;",
    "if (mode === 'empty') text = '';",
    "else if (mode === 'drop') text = real.split('\\n').filter(function (l) { return l.indexOf('`adopt-throw`') < 0; }).join('\\n');",
    "else if (mode === 'add') text = real.replace('\\n## ', '\\n| `zzz-not-a-code` | 注入 | 注入 |\\n\\n## ');",
    "const r = g.check({ docText: text });",
    "console.log(JSON.stringify({ ok: r.ok, total: r.total, byTier: r.byTier,",
    "  missing: r.missing.slice(0, 3), missingN: r.missing.length,",
    "  extra: r.extra.slice(0, 3), extraN: r.extra.length }));"
  ].join('\n'));
}

const CACHE = {};
function inject(toolAbs, mode) {
  const key = toolAbs + '|' + mode;
  if (CACHE[key]) return CACHE[key];
  const r = cp.spawnSync(process.execPath,
    [INJECT, toolAbs, mode, path.join(BASE, DOC_REL)],
    { cwd: BASE, encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL' });
  let out;
  if (r.error || r.status !== 0) {
    out = { ok: false, total: -1, byTier: {}, missing: [], missingN: -1, extra: [], extraN: -1,
      raw: String(r.stderr || r.error || '').slice(0, 240), status: r.status };
  } else {
    try { out = JSON.parse(String(r.stdout).trim().split('\n').pop()); }
    catch (e) { out = { ok: false, total: -1, byTier: {}, missing: [], missingN: -1, extra: [], extraN: -1,
      raw: String(r.stdout).slice(0, 240) }; }
  }
  CACHE[key] = out;
  return out;
}

// ── A 段：导出面 + 依赖面 ────────────────────────────────────────────────
function runA(a) {
  const src = srcOf(TOOL_REL);
  a(src.length > 1000, 'tools2114/A: gen-error-codes.js 存在且非空（' + src.length + ' 字符）');
  // 取最后一个 module.exports 块（与 tools-v2110 A 段同一纪律：生成器里可能有模板文本）
  const all = [];
  const rex = /module\.exports\s*=\s*\{([\s\S]*?)\};/g;
  let mm;
  while ((mm = rex.exec(src)) !== null) all.push({ text: mm[1], at: mm.index });
  const keys = (all.length ? all[all.length - 1] : { text: '' }).text;
  a(!!keys, 'tools2114/A: 有 module.exports 对象（真导出块）');
  FACES.forEach(function (k) {
    a(new RegExp('(^|[\\s,{])' + k + '\\s*:').test(keys), 'tools2114/A: 导出 ' + k);
  });
  a(src.indexOf('require.main === module') > 0, 'tools2114/A: 有 CLI 入口守卫（可被 require 而不跑 CLI）');
  // 顶层依赖：只准 node 内置（与 tools-v2110 同一条硬约束）
  const BUILTIN = ['fs', 'path', 'os', 'vm', 'child_process', 'crypto', 'util'];
  const tops = (src.match(/^const\s+\w+\s*=\s*require\('([^']+)'\);/gm) || [])
    .map(function (s) { return (s.match(/require\('([^']+)'\)/) || [])[1]; });
  const bad = tops.filter(function (n) { return BUILTIN.indexOf(n) < 0; });
  a(bad.length === 0, 'tools2114/A: 顶层依赖全是 node 内置（实 ' + JSON.stringify(bad) + '）');
  // 函数内相对依赖：恰为三源白名单（成类静态锁）
  const rels = (src.match(/require\('\.\.\/tests\/[\w.-]+'\)/g) || [])
    .map(function (s) { return s.replace("require('../tests/", '').replace("')", ''); })
    .filter(function (v, i, arr) { return arr.indexOf(v) === i; });
  a(JSON.stringify(rels.slice().sort()) === JSON.stringify(REL_DEPS.slice().sort()),
    'tools2114/A: 函数内相对依赖恰为三源白名单（实 ' + JSON.stringify(rels) + '）—— 生成源与门禁同源，不许另起第二份码表');
  a(src.indexOf("DOC_REL = 'docs/ERROR_CODES.md'") > 0,
    'tools2114/A: 产物路径是单一常量（CLI 与 check 共用，不出现第二处字面量）');
}

// ── B 段：注入面四向真跑 ────────────────────────────────────────────────
function runB(a) {
  writeInject();
  const tool = path.join(BASE, TOOL_REL);
  const real = inject(tool, 'real');
  a(real.ok === true && real.total > 300,
    'tools2114/B: 真文档下 check({docText:真文档}) ⇒ ok（total ' + real.total + '）');
  // 反空转下限：空集上的「双向零差」恒真
  a(real.byTier && real.byTier.witnessed > 100 && real.byTier.base > 100 && real.byTier.dead >= 3,
    'tools2114/B: 三档都非空（见证 ' + (real.byTier || {}).witnessed + ' / 死表 ' + (real.byTier || {}).dead
    + ' / 基线 ' + (real.byTier || {}).base + '）');
  const empty = inject(tool, 'empty');
  a(empty.ok === false && empty.missingN === empty.total && empty.missingN > 300,
    'tools2114/B: 空文档 ⇒ 每个码都报缺（missing ' + empty.missingN + ' / total ' + empty.total + '）');
  const drop = inject(tool, 'drop');
  a(drop.ok === false && drop.missingN === 1 && drop.missing[0] === 'adopt-throw',
    'tools2114/B: 删掉一行 ⇒ 只报那一个码（实 ' + JSON.stringify(drop.missing) + '）—— 逐码核，不是「有没有表」');
  const add = inject(tool, 'add');
  a(add.ok === false && add.extraN === 1 && add.extra[0] === 'zzz-not-a-code',
    'tools2114/B: 多一行 ⇒ 只报那个多余码（实 ' + JSON.stringify(add.extra) + '）—— 文档不得比现实胖');
}

// ── C 段：不变式 ────────────────────────────────────────────────────────
function runC(a) {
  // C1. --check 是只读面：跑完产品源码 + 三源 + 文档逐字节不变
  const watch = [TOOL_REL, DOC_REL, 'tests/reject-v2780.js', 'tests/reject-code-ledger.json',
    'tests/reject-code-gate.js', 'core/plugin.js', 'core/sandbox.js'];
  const before = watch.map(function (r) { return fs.readFileSync(path.join(BASE, r)); });
  const r = cp.spawnSync(process.execPath, [path.join(BASE, TOOL_REL), '--check'],
    { cwd: BASE, encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL' });
  const after = watch.map(function (r2) { return fs.readFileSync(path.join(BASE, r2)); });
  a(r.status === 0, 'tools2114/C: CLI --check 退出码 0（实 ' + r.status + '）'
    + ' · ' + String(r.stdout || '').trim().split('\n').pop());
  a(before.every(function (b, i) { return b.equals(after[i]); }),
    'tools2114/C: --check 逐字节不改动任何文件（' + watch.length + ' 个被观察文件）—— 它只报不改');

  // C2. 手册是**给人读**的：有可检索骨架 + 首注声明生成源（防人手改后被静默覆盖）
  const doc = fs.readFileSync(path.join(BASE, DOC_REL), 'utf8');
  a(doc.indexOf('# WorldAxis 拒收码手册') === 0
    && doc.indexOf('## 见证（可执行）') > 0 && doc.indexOf('## 死表（已证不可达）') > 0
    && doc.indexOf('## 基线（存量未分类）') > 0,
    'tools2114/C: 手册有可检索骨架（标题 + 三节）—— 不然它只是一堆码');
  a(doc.indexOf('不要手改本文件') > 0, 'tools2114/C: 首注声明生成源（人手改会在下次生成被覆盖）');
  a(doc.split('\n').length > 300, 'tools2114/C: 手册非空壳（' + doc.split('\n').length + ' 行）');

  // C3. 临时面在仓库之外（与 tools-v2110 C7 同纪律）
  a(path.relative(BASE, TMP).indexOf('..') === 0, 'tools2114/C: 临时工作目录在仓库之外（' + TMP + '）');
}

// ── N 段：真源码破坏（双向性各破一条）──────────────────────────────────
function runNegative(a) {
  writeInject();
  const src = srcOf(TOOL_REL);
  const tool = path.join(BASE, TOOL_REL);
  const M_MISS = "const missing = text === null ? [] : d.rows.filter(function (r) { return !inDoc[r.code]; }).map(function (r) { return r.code; });";
  const M_EXTRA = "const extra = text ? Object.keys(inDoc).filter(function (c) { return !d.rows.some(function (r) { return r.code === c; }); }) : [];";

  // N1. 摘掉 missing 计算 ⇒ 「文档落后于源码」不再现形
  const n1 = hit(src, M_MISS);
  a(n1 === 1, 'tools2114/N1: 破坏锚点（missing 计算）在真源码中恰 1 处（实 ' + n1 + '）');
  if (n1 === 1) {
    const b = src.split(M_MISS).join('const missing = [];');
    a(b !== src, 'tools2114/N1: 破坏真的改动了源码文本');
    const root = mirrorRoot('n1', b);
    const r0 = inject(tool, 'drop');
    const r1 = inject(path.join(root, 'tools', 'gen-error-codes.js'), 'drop');
    // 副本到场自证：它真的跑起来了（装载产品面 + 读源码面），而不是「装载失败被当成破坏生效」
    a(r1.total > 300 && r1.byTier.witnessed > 100,
      'tools2114/N1: 破坏副本仍在镜像根上跑完（total ' + r1.total + ' / 见证 ' + (r1.byTier || {}).witnessed + '）'
      + ' —— 否则「少报」与「没跑」不可分');
    a(r0.missingN === 1 && r1.missingN === 0,
      'tools2114/N1: 删一行：原版报 1 个缺码 / 破坏副本报 ' + r1.missingN + ' 个 —— 双向性之一现形');
  }

  // N2. 摘掉 extra 计算 ⇒ 「文档比现实胖」不再现形
  const n2 = hit(src, M_EXTRA);
  a(n2 === 1, 'tools2114/N2: 破坏锚点（extra 计算）在真源码中恰 1 处（实 ' + n2 + '）');
  if (n2 === 1) {
    const b = src.split(M_EXTRA).join('const extra = [];');
    a(b !== src, 'tools2114/N2: 破坏真的改动了源码文本');
    const root = mirrorRoot('n2', b);
    const r0 = inject(tool, 'add');
    const r1 = inject(path.join(root, 'tools', 'gen-error-codes.js'), 'add');
    a(r1.total > 300, 'tools2114/N2: 破坏副本仍在镜像根上跑完（total ' + r1.total + '）');
    a(r0.extraN === 1 && r1.extraN === 0,
      'tools2114/N2: 多一行：原版报 1 个多余码 / 破坏副本报 ' + r1.extraN + ' 个 —— 双向性之二现形');
  }

  // N3. 纯度：原版上 B 段同款判据必须为真（否则上面两条「现形」说明不了任何事）
  const real = inject(tool, 'real');
  a(real.ok === true && real.extraN === 0 && real.missingN === 0,
    'tools2114/N3: （纯度）原版上真文档双向零差（missing ' + real.missingN + ' / extra ' + real.extraN + '）');
  const empty = inject(tool, 'empty');
  a(empty.missingN === empty.total && empty.total > 300,
    'tools2114/N3: （纯度）原版上空文档 ⇒ 缺码数 = 总码数（' + empty.missingN + '）');

  // N4. 反空转：破坏面必须是真有内容的源文件（空文件上的「零现形」恒真）
  a(src.length > 3000, 'tools2114/N4: 破坏面非空（' + src.length + ' 字符）');
  const docLen = fs.readFileSync(path.join(BASE, DOC_REL), 'utf8').length;
  a(docLen > 10000, 'tools2114/N4: 被判的产物非空壳（' + docLen + ' 字节）—— 空文档上的双向零差也恒真');
}

module.exports = { FACES: FACES, REL_DEPS: REL_DEPS, TMP: TMP, srcOf: srcOf, hit: hit,
  mirrorRoot: mirrorRoot, inject: inject, runA: runA, runB: runB, runC: runC, runNegative: runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runNegative(a);
  console.log('tools-v2114 ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
}