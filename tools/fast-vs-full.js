#!/usr/bin/env node
'use strict';
// WorldAxis tools/fast-vs-full.js (v2.524.0) — OPV29-24 快档与全量同源
//
// ── 病 ────────────────────────────────────────────────────────────
// 快档（`tools/smoke.js` 的 SMOKE_SET）存在的意义是「改一行先跑一遍」。但它如果
//   和全量**不同源**，就会出两种事故：
//   ① 快档漏掉某个已挂载专锁 ⇒ 那道锁的红只在 29 分钟的全量里出现，
//      于是「快档绿」变成一句**没覆盖到它**的假安心（快档绿而全量红）。
//   ② 快档自己新写一张表（与 run.js 的挂载面各写一遍）⇒ 两张表必然分叉。
//
// ── 落点（只报告，不假装全跑）──────────────────────────────────
// 本工具做三件事，全部**可复算**：
//   · coverage：把 tests/ 下已挂进 run.js 的专锁列出，标出哪些**不在**快档集里
//     （快档集按成员数与点名给出；漏项不是错误，但必须**看得见**）
//   · same-source：`tools/hooks.js` 的 FAST_GATES 与 smoke 的 SMOKE_SET 必须
//     是同一份成员集合（两张表各写一遍就是分叉源）
//   · orphan：快档集里点名的文件必须存在且能跑（文件不在 ⇒ 快档静默少跑一道）
//
// 纪律：**不猜**。`SMOKE_SET` / `FAST_GATES` 都从源码里解析（不是手抄一份），
//   解析失败的记 `unparsed` 并单独可见 —— 不许当作「零漏项」。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 注意：root 必须**逐层传下来**。初版这里直接用模块级 ROOT，导致 audit(otherRoot)
//   仍读真仓库 —— 探针形同虚设（本批 D8/D9 两条判据当场抓出）。
//   与 OPV29-21 治的病同型：参数没被用上 = 空转，而且看起来一切正常。
function read(root, rel) {
  try { return { ok: true, text: fs.readFileSync(path.join(root, rel), 'utf8') }; }
  catch (e) { return { ok: false, why: 'unreadable: ' + (e && e.code ? e.code : 'ERR') }; }
}

// 从 `const NAME = [ ... ];` 里抽成员（数组字面量，跨行）。**两种真实形态都认**：
//   rel: 'tests/x.js'                  （smoke.js 的 SMOKE_SET）
//   cmd: 'node tests/x.js'             （hooks.js 的 FAST_GATES）
// 初版只认 rel ⇒ FAST_GATES 解析成 0 项。若不是「分叉」那条判据拦住，0 vs 14 会被
//   当成「不一致」报红（红对了但理由错），更糟的是 0 vs 0 会被当成「一致」。
//   所以这里必须认全，且解析不到就返回 null（由调用方记 unparsed）。
function membersOf(text, name) {
  const i = text.indexOf('const ' + name + ' = [');
  if (i < 0) return null;
  const j = text.indexOf('\n];', i);
  if (j < 0) return null;
  const body = text.slice(i, j);
  const out = [];
  // ① rel: 'xxx'
  let re = /rel:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  // ② cmd: 'node xxx'
  re = /cmd:\s*'[^']*?node\s+([^'\s]+)'/g;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  // 去重（同一项若同时有两种写法，只算一项）
  const seen = {};
  return out.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; });
}

// run.js 里被 runScript 真执行的脚本（即「全量面」里真正跑到的那些）
function mountedInRun(root, rel) {
  const r = read(root, rel);
  if (!r.ok) return null;
  const out = [];
  const re = /await\s+runScript\('\.\/([^']+)'\)/g;
  let m;
  while ((m = re.exec(r.text)) !== null) out.push(m[1]);
  return out;
}

function audit(root) {
  const base = root || ROOT;
  const smoke = read(base, 'tools/smoke.js');
  const hooks = read(base, 'tools/hooks.js');
  const runjs = read(base, 'tests/run.js');

  const unparsed = [];
  let smokeSet = null;
  let fastGates = null;
  let mounted = null;

  if (!smoke.ok) unparsed.push({ what: 'tools/smoke.js', why: smoke.why });
  else {
    smokeSet = membersOf(smoke.text, 'SMOKE_SET');
    if (smokeSet === null) unparsed.push({ what: 'SMOKE_SET', why: 'pattern-miss' });
  }

  if (!hooks.ok) unparsed.push({ what: 'tools/hooks.js', why: hooks.why });
  else {
    fastGates = membersOf(hooks.text, 'FAST_GATES');
    if (fastGates === null) unparsed.push({ what: 'FAST_GATES', why: 'pattern-miss' });
  }

  if (!runjs.ok) unparsed.push({ what: 'tests/run.js', why: runjs.why });
  else {
    mounted = mountedInRun(base, 'tests/run.js');
    if (mounted === null) unparsed.push({ what: 'run.js 挂载面', why: 'unreadable' });
  }

  // 快档集里点名但文件不在 ⇒ 快档会静默少跑一道
  const missingFiles = [];
  if (smokeSet) {
    smokeSet.forEach(function (rel) {
      if (!fs.existsSync(path.join(base, rel))) missingFiles.push(rel);
    });
  }

  // 同源比对：**FAST_GATES ⊆ SMOKE_SET**（单向包含），不是相等。
  //   依据写在 tools/smoke.js 的 hookSubset 注释里：快档集**故意**大于 pre-commit
  //   三道（它还含 tools/net-audit.js 与另外七道）。判 == 会把既有正确设计判成
  //   「分叉」—— 那是「判据比事实严」的假红，比漏判更糟（人会开始无视告警）。
  //   按 basename 比对：hooks 的 cmd 是 `node tests/x.js`，smoke 的 rel 是 `tools/x.js`
  //   或 `tests/x.js`，两者路径前缀不同、判的是「是不是同一道门禁」。
  let diff = null;
  if (smokeSet && fastGates) {
    const baseOf = function (x) { return path.basename(x); };
    const a = smokeSet.map(baseOf);
    const b = fastGates.map(baseOf);
    // 只在 hooks 侧出现 = 两张表分家（pre-commit 跑了快档集没跑的门禁）
    const onlyHook = b.filter(function (x) { return a.indexOf(x) < 0; });
    // 只在 smoke 侧出现 = 设计允许（快档集故意更大），如实报出但不判红
    const onlySmoke = a.filter(function (x) { return b.indexOf(x) < 0; });
    diff = {
      onlySmoke: onlySmoke,
      onlyHook: onlyHook,
      same: onlyHook.length === 0,
      relation: 'FAST_GATES ⊆ SMOKE_SET'
    };
  }

  // 覆盖：已挂载的测试脚本里，哪些没进快档（只点名，不当错误）
  let uncovered = null;
  if (mounted && smokeSet) {
    const fast = {};
    smokeSet.forEach(function (rel) { fast[path.basename(rel)] = true; });
    uncovered = mounted.filter(function (f) { return !fast[f]; });
  }

  const ok =
    unparsed.length === 0 &&
    missingFiles.length === 0 &&
    (diff === null ? false : diff.same) &&
    smokeSet !== null && smokeSet.length > 0;

  return {
    ok: ok,
    smokeSet: smokeSet,
    fastGates: fastGates,
    mountedCount: mounted ? mounted.length : null,
    uncovered: uncovered,
    missingFiles: missingFiles,
    diff: diff,
    unparsed: unparsed
  };
}

function render(res) {
  const L = [];
  L.push('WorldAxis 快档 × 全量 同源检查（OPV29-24）');
  L.push('  快档集 SMOKE_SET：' + (res.smokeSet ? res.smokeSet.length + ' 项' : '读不到'));
  L.push('  hooks FAST_GATES：' + (res.fastGates ? res.fastGates.length + ' 项' : '读不到'));
  L.push('  全量挂载面：' + (res.mountedCount === null ? '读不到' : res.mountedCount + ' 个 runScript 调用'));
  if (res.diff) {
    L.push('  同源：' + (res.diff.same
      ? '✓ FAST_GATES ⊆ SMOKE_SET（' + res.diff.relation + '；快档集多出 ' + res.diff.onlySmoke.length + ' 道是设计允许的）'
      : '✗ pre-commit 跑了快档集没有的门禁：' + res.diff.onlyHook.join(',') + '（两张表分家了）'));
  }
  if (res.uncovered) {
    L.push('  快档未覆盖的已挂载面：（逐项列出，不是错误但必须看得见）共 ' + res.uncovered.length + ' 项');
    res.uncovered.slice(0, 12).forEach(function (f) { L.push('    · ' + f); });
    if (res.uncovered.length > 12) L.push('    … 其余 ' + (res.uncovered.length - 12) + ' 项');
  }
  if (res.missingFiles.length) {
    L.push('  ✗ 快档点名的文件不存在：' + res.missingFiles.join(', '));
  }
  if (res.unparsed.length) {
    L.push('  ✗ 解析不到（不许当作零漏项）：' +
      res.unparsed.map(function (x) { return x.what + ':' + x.why; }).join(', '));
  }
  L.push(res.ok ? '  ⇒ 快档与全量同源' : '  ⇒ 不许信（上面每一条 ✗ 都要处置）');
  return L.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const res = audit(args[1] && args[0] !== '--check' && args[0] !== '--json' ? args[0] : null);
  if (args.indexOf('--json') >= 0) console.log(JSON.stringify(res, null, 2));
  else console.log(render(res));
  if (args.indexOf('--check') >= 0) process.exit(res.ok ? 0 : 1);
}

module.exports = { audit: audit, render: render, membersOf: membersOf, mountedInRun: mountedInRun };