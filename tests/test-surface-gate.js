#!/usr/bin/env node
// WorldAxis tests/test-surface-gate.js — 测试文件面可达性门禁（v2.75.0）
//
// 治的病：tests/ 下的 .js 有一类**从不执行**的成员 —— 既不被 run.js require、
//   也不被 run.js spawn、也不被内联。它们仍然被 product-files.testFiles() 收进
//   「测试引用面」，而 v2.73.0 起账本的归因证据正是踩在这个面上算出来的。
//   于是归因依据里混进了从不运行的文件 ——「归因建立在不执行的文件上」。
//   （与 v2.73.0 治的「输入面窄于事实」同族，方向相反：那一版面太窄，这一版面里含不执行的成员。）
//
// 三条判据：
//   A 可达性：每个测试文件的分类 ∈ {aggregator, lock, spawned, inline, orphan}；
//     orphan 必须登记在 EXEMPT 里（带理由），未登记的 orphan 即红灯。
//   B 豁免不得腐烂：EXEMPT 项必须真在 orphans 里（豁免生效）或被判为 spawned/inline（真有执行入口）；
//     被判为 lock 说明它已被 require —— 豁免与说明该删，红灯。
//   C 反空转下限：文件面 ≥30、锁 ≥20、可达 ≥30、直接 spawn 行 ≥6 —— 零告警在空集上恒真。
//   D 宿主不变量：能**到达**的锁不得给宿主全局留下残骸（`global.window` / `global.document`
//     不能被整体替换后不还原）。挂载会让「裸脚本时期无害的全局替换」第一次变成活的 ——
//     而它炸的是别的锁；哪一个先炸取决于 run.js 里的**顺序**，靠顺序活着的东西必须判据化。
//     判据在子进程里跑（污染是进程级的，必须隔离；且能拿到两个方向：污点被逮住 + 干净时零告警）。
//
// 判据的两条纪律（本仓在 v2.74.0 踩过同族坑，故写进自证）：
//   ① 引用面必须在**去注释但保留字符串**的面上取：`require('./x.js')` 的路径是字符串字面量，
//      用 inventory.codeFace（把字符串抹成空白）扫会得到零引用（见 runNegative 的 N4）。
//   ② 「提及不是引用」：注释里出现 tests/x.js 不构成边；只有 require('./x.js') 才是（见 N2）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const { testFiles } = require('./product-files.js');

const RUN_REL = 'tests/run.js';
// 豁免表：确实没有自己的执行入口、但已确认可从其他入口覆盖的测试文件。
//   当前为空 —— 两个不可达者各自的入口都是自解释的（export-contract 由 run.js spawn、
//   ui-gate 的案例已被内联），判据能自己认出来，不需要人工白名单。
const EXEMPT = [];

const MIN_FILES = 30;
const MIN_LOCKS = 20;
const MIN_REACH = 30;
const MIN_SPAWN_LINES = 6;
const GLOBAL_PROBE = [
  { g: 'global.window', mark: 'WorldAxis (mock 建立的宿主全局)' },
  { g: 'global.document', mark: 'mock DOM' }
];
const INLINE_MARK = /内联|inline|embeds/i;
const SPAWN_CALL = /\b(spawnSync|spawn|execSync|exec)\s*\(/;
const RE_REQUIRE = /require\s*\(\s*'(\.\/[\w.-]+\.js)'/g;
const RE_TEST_PATH = /tests\/([\w.-]+\.js)/g;

/** 去注释、**保留字符串原文**的最小剥离器（与 inventory.codeFace 同一状态机思路，但不抹字符串）。 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const CONT = '(),=:[!&|?{};+-*%<>~^/\n \t';
  let st = 'code';
  const prevCh = function () {
    for (let j = out.length - 1; j >= 0; j -= 1) {
      const c = out[j];
      if (c !== ' ' && c !== '\t' && c !== '\n') return c;
    }
    return '';
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (st === 'code') {
      if (c === '/' && d === '/') { st = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { st = 'block'; out += '  '; i += 2; continue; }
      if (c === '/') {
        const p = prevCh();
        if (p === '' || CONT.indexOf(p) >= 0) {
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
          if (ok) { while (i <= k) { out += src[i]; i += 1; } continue; }
        }
        out += c; i += 1; continue;
      }
      if (c === "'") { st = 'sq'; out += c; i += 1; continue; }
      if (c === '"') { st = 'dq'; out += c; i += 1; continue; }
      if (c === '`') { st = 'tpl'; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (st === 'line') {
      if (c === '\n') { st = 'code'; out += c; } else out += (c === '\t' ? '\t' : ' ');
      i += 1; continue;
    }
    if (st === 'block') {
      if (c === '*' && d === '/') { st = 'code'; out += '  '; i += 2; continue; }
      out += (c === '\n' ? '\n' : ' '); i += 1; continue;
    }
    if (c === '\\') { out += c + (src[i + 1] === undefined ? '' : src[i + 1]); i += 2; continue; }
    if ((st === 'sq' && c === "'") || (st === 'dq' && c === '"')) { st = 'code'; out += c; i += 1; continue; }
    if ((st === 'sq' || st === 'dq') && c === '\n') { st = 'code'; out += c; i += 1; continue; }
    if (st === 'tpl' && c === '`') { st = 'code'; out += c; i += 1; continue; }
    out += c; i += 1; continue;
  }
  return out;
}

/** 从一段源码文本里取出直接 require 的兄弟测试文件（必须在去注释面上取）。 */
function refsOf(src) {
  const text = stripComments(src);
  const out = [];
  RE_REQUIRE.lastIndex = 0;
  let m;
  while ((m = RE_REQUIRE.exec(text))) out.push('tests/' + m[1].replace(/^\.\//, ''));
  return out;
}

/** 从 run.js 文本里取「执行入口」：直接 require 边、spawn 行、内联标记行。 */
function entriesOf(src, files) {
  const direct = refsOf(src).filter(function (r) { return files.indexOf(r) >= 0; });
  const spawned = [];
  const inline = [];
  let spawnLines = 0;
  const lines = src.split('\n');
  lines.forEach(function (l, i) {
    if (SPAWN_CALL.test(l)) spawnLines += 1;
    const isComment = l.trim().indexOf('//') === 0;
    RE_TEST_PATH.lastIndex = 0;
    let m;
    while ((m = RE_TEST_PATH.exec(l))) {
      const rel = 'tests/' + m[1];
      if (files.indexOf(rel) < 0) continue;
      if (direct.indexOf(rel) >= 0) continue;
      if (SPAWN_CALL.test(l)) { if (spawned.indexOf(rel) < 0) spawned.push(rel); continue; }
      if (isComment && INLINE_MARK.test(l)) { if (inline.indexOf(rel) < 0) inline.push(rel); continue; }
    }
  });
  return { direct: direct, spawned: spawned, inline: inline, spawnLines: spawnLines };
}

/** 可达性：从 run.js 出发的 require 图 BFS + 执行入口（spawn / 内联）作为并列根。 */
function buildReach(vfs) {
  const files = Object.keys(vfs).sort();
  const text = function (rel) { return vfs[rel]; };
  const graph = {};
  files.forEach(function (rel) {
    graph[rel] = refsOf(text(rel)).filter(function (r) { return files.indexOf(r) >= 0; });
  });
  const hasRun = files.indexOf(RUN_REL) >= 0;
  const ent = hasRun ? entriesOf(text(RUN_REL), files) : { direct: [], spawned: [], inline: [], spawnLines: 0 };
  const roots = (hasRun ? [RUN_REL] : []).concat(ent.spawned, ent.inline);
  const reached = {};
  const queue = roots.slice();
  roots.forEach(function (r) { reached[r] = true; });
  while (queue.length) {
    const cur = queue.shift();
    (graph[cur] || []).forEach(function (dep) {
      if (!reached[dep]) { reached[dep] = true; queue.push(dep); }
    });
  }
  const orphan = files.filter(function (rel) { return rel !== RUN_REL && !reached[rel]; });
  const locks = files.filter(function (rel) {
    return rel !== RUN_REL && reached[rel] && ent.spawned.indexOf(rel) < 0 && ent.inline.indexOf(rel) < 0;
  });
  return {
    files: files,
    reach: files.filter(function (rel) { return !!reached[rel]; }),
    locks: locks,
    spawned: ent.spawned,
    inline: ent.inline,
    orphans: orphan,
    spawnLines: ent.spawnLines,
    aggregator: hasRun ? RUN_REL : ''
  };
}

/** 扫描：vfs 省略时扫真仓库（现场面）；给出时用虚拟面（负控制：真源码副本 + 定点破坏）。 */
/**
 * 宿主全局还原探针：按 run.js 的执行方式一个个跑锁，看哪个不还原宿主全局。
 * 在子进程里跑（污染是进程级的，必须隔离；子进程也可单跑，不靠聚合器）。
 */
function globalResidueProbe(files) {
  const list = (files || ['intel-v2530.js', 'life-v2520.js', 'longline-v2550.js', 'org-v2540.js']);
  const grader = [
    "require('./mock.js');",
    "const PROBES = " + JSON.stringify(GLOBAL_PROBE.map(function (p) { return p.g; })) + ";",
    "const read = function (g) { return (0, eval)(g); };",
    "const snap = function () { const o = {}; PROBES.forEach(function (g) { o[g] = read(g); }); return o; };",
    "const before = snap();",
    "const dirty = [];",
    "const list = " + JSON.stringify(list) + ";",
    "list.forEach(function (f) {",
    "  const marks = snap();",
    "  try { require('./' + f).runAll(function () {}); } catch (e) { dirty.push(f + ' THREW ' + e.message); return; }",
    "  PROBES.forEach(function (g) {",
    "    const now = read(g), was = before[g];",
    "    if (now !== was) dirty.push(f + ' 整换 ' + g);",
    "    else if (now && typeof now === 'object') {",
    "      const lost = Object.keys(marks[g] || {}).filter(function (k) { return !(k in now); });",
    "      if (lost.length) dirty.push(f + ' 抹键 ' + g + ':' + lost.slice(0, 5).join(',') + '+' + lost.length);",
    "    }",
    "  });",
    "});",
    "process.stdout.write(JSON.stringify(dirty));"
  ].join('\n');
  const file = path.join(BASE, 'tests', '__tmp_global_probe.js');
  fs.writeFileSync(file, grader);
  try {
    const r = require('child_process').spawnSync(process.execPath, [file], { cwd: BASE, encoding: 'utf8' });
    if (r.status !== 0) return { ok: false, dirty: [], why: 'probe 退出 ' + r.status + ' :: ' + String(r.stderr || '').slice(0, 200) };
    const out = JSON.parse(String(r.stdout || '[]'));
    return { ok: true, dirty: out, why: '' };
  } catch (e) {
    return { ok: false, dirty: [], why: 'probe 异常 ' + e.message };
  } finally {
    try { fs.unlinkSync(file); } catch (e) {}
  }
}

function scan(opts) {
  opts = opts || {};
  let vfs = opts.vfs || null;
  if (!vfs) {
    vfs = {};
    testFiles(BASE).forEach(function (rel) { vfs[rel] = fs.readFileSync(path.join(BASE, rel), 'utf8'); });
  }
  const base = buildReach(vfs);
  const exempt = opts.exempt || EXEMPT.map(function (e) { return e.rel; });
  const problems = [];
  base.orphans.forEach(function (rel) {
    if (exempt.indexOf(rel) < 0) problems.push({ kind: 'unregistered-orphan', msg: '测试文件从不执行且未登记豁免：' + rel });
  });
  exempt.forEach(function (rel) {
    if (base.files.indexOf(rel) < 0) { problems.push({ kind: 'stale-exempt', msg: '豁免项不在测试文件面（幽灵豁免）：' + rel }); return; }
    if (base.locks.indexOf(rel) >= 0) { problems.push({ kind: 'stale-exempt', msg: '豁免项已被 require 进图（豁免该删）：' + rel }); return; }
    if (base.spawned.indexOf(rel) >= 0) { problems.push({ kind: 'redundant-exempt', msg: '豁免项已有 spawn 入口（豁免冗余该删）：' + rel }); return; }
    if (base.inline.indexOf(rel) >= 0) { problems.push({ kind: 'redundant-exempt', msg: '豁免项已有内联入口（豁免冗余该删）：' + rel }); return; }
    if (base.orphans.indexOf(rel) < 0) { problems.push({ kind: 'stale-exempt', msg: '豁免项分类不可判定：' + rel }); }
  });
  if (base.aggregator === '') problems.push({ kind: 'surface-empty', msg: '文件面里没有 ' + RUN_REL + '（聚合器缺失）' });
  if (base.files.length < MIN_FILES) problems.push({ kind: 'vacuous', msg: '测试文件面 ' + base.files.length + ' < 下限 ' + MIN_FILES });
  if (base.locks.length < MIN_LOCKS) problems.push({ kind: 'vacuous', msg: '锁 ' + base.locks.length + ' < 下限 ' + MIN_LOCKS });
  if (base.reach.length < MIN_REACH) problems.push({ kind: 'vacuous', msg: '可达 ' + base.reach.length + ' < 下限 ' + MIN_REACH });
  if (base.spawnLines < MIN_SPAWN_LINES) problems.push({ kind: 'vacuous', msg: '直接 spawn 行 ' + base.spawnLines + ' < 下限 ' + MIN_SPAWN_LINES });
  const residue = opts.vfs ? { ok: true, dirty: [], why: '' } : globalResidueProbe();
  if (!residue.ok) problems.push({ kind: 'probe-broken', msg: '宿主全局探针跑不起来：' + residue.why });
  residue.dirty.forEach(function (d) { problems.push({ kind: 'global-residue', msg: '锁在宿主全局上留残骸：' + d }); });
  return {
    files: base.files.length,
    aggregator: base.aggregator,
    reach: base.reach,
    locks: base.locks,
    spawned: base.spawned,
    inline: base.inline,
    orphans: base.orphans,
    spawnLines: base.spawnLines,
    globalResidue: residue.ok ? residue.dirty.length : -1,
    exempt: exempt.slice(),
    problems: problems
  };
}

function judge(report) { return report.problems; }

function summary(report) {
  return '测试文件面 ' + report.files + ' · 锁 ' + report.locks.length + ' · 可达 ' + report.reach.length
    + ' · spawn ' + report.spawned.length + ' · 内联 ' + report.inline.length
    + ' · 孤儿 ' + report.orphans.length + ' · spawn 行 ' + report.spawnLines;
    + ' · 宿主残骸 ' + report.globalResidue;
}

function main() {
  const report = scan({});
  const bad = judge(report);
  console.log('■ 测试文件面可达性（WorldAxis ' + require('./product-files.js').BASE + '）');
  console.log('  ' + summary(report));
  console.log('  孤儿：' + (report.orphans.length ? report.orphans.join('、') : '（无）'));
  console.log('  豁免：' + (report.exempt.length ? report.exempt.join('、') : '（无）'));
  console.log('');
  if (bad.length) {
    bad.forEach(function (p) { console.log('  ✗ [' + p.kind + '] ' + p.msg); });
    console.log('\n不可达面存在未登记成员：' + bad.length + ' 项');
    process.exitCode = 1;
    return;
  }
  console.log('全部通过 ✓（每个测试文件都有可判定的执行入口）');
}

module.exports = {
  EXEMPT: EXEMPT,
  MIN_FILES: MIN_FILES,
  MIN_LOCKS: MIN_LOCKS,
  MIN_REACH: MIN_REACH,
  MIN_SPAWN_LINES: MIN_SPAWN_LINES,
  stripComments: stripComments,
  refsOf: refsOf,
  entriesOf: entriesOf,
  buildReach: buildReach,
  scan: scan,
  globalResidueProbe: globalResidueProbe,
  GLOBAL_PROBE: GLOBAL_PROBE,
  judge: judge,
  summary: summary
};

if (require.main === module) main();
