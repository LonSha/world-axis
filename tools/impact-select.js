#!/usr/bin/env node
/**
 * WorldAxis tools/impact-select.js (v2.524.0) — OPV29-02 增量回归选面
 *
 * ── 它治什么（本版现场）───────────────────────────────
 *   `tools/smart-runner.js` 的 L2 已经是「改动面 → 自包含节」，但它回答的是**节**，
 *   不回答「改了哪个文件、该看哪几个锁」。结果：改一个拼写就想去跑 L3；
 *   或者反过来，改坏了 `engines/foo.js` 却没一个锁被点到（J 面那种静默）。
 *   本工具只做一件小事：**从 git 改动面反查测试文件**，并把反查不出的一律点名。
 *
 * ── 三条口径（否定式）──────────────────────────────────
 *   ① **只反查，不代跑**。输出一张表（改了什么 → 哪些测试提到它），
 *      跑不跑、跑多少由人/上层调度决定。本工具不启动任何进程、不写任何文件。
 *   ② **反查不出就是反查不出**：`uncovered` 里的每一个都是「改了可执行面、却没有任何测试
 *      在文本上提到它」。此时退出码 3 —— 任何绿灯在这都属于假绿（假绿会被读成「已验证」）。
 *   ③ **文档改动必须给出零**：只改 `docs/` / `plans/` / `*.md` 时，`related` 必须是空数组、
 *      退出码 0。计划里的判据是「只改文档 → 0 相关测试」，这是个**否定判据**，
 *      比「能找出几个」更重要（它防的是「谁都得跑全量」这种不成文的习惯）。
 *
 * ── 边界（如实登记）────────────────────────────────────────
 *   · 文本反查不是数据流分析：测试用运行时拼出的模块名、只在注释里提到的文件名，
 *     都会被当成命中；反之通过 `require(itemOf(...))` 间接读的不会被当成命中。
 *     故 `related` 是**下界估计**，`uncovered` 是**上界估计**——两者都不当结论用。
 *   · 不读 git 历史，只看当前工作区的变动面（含未跟踪文件）。
 *
 * ── 用法 ──────────────────────────────────────────────
 *   node tools/impact-select.js               # 用 git 现场改动面
 *   node tools/impact-select.js engines/foo.js tests/x.js   # 指定改动面（管道/脚本用）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');

/** 改动面：git 现场（含未跟踪）。取不到 git 时如实报 `no-git`，不当作「没改动」。 */
function changedFiles(root) {
  const r = cp.spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: root || BASE, encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, why: 'no-git', files: [] };
  const out = [];
  String(r.stdout || '').split('\n').forEach(function (l) {
    if (!l.trim()) return;
    // porcelain v1：XY<空格>路径（重命名形态 `R  old -> new` 取新路径）
    const rel = l.slice(3).trim().replace(/^.* -> /, '');
    if (rel) out.push(rel);
  });
  return { ok: true, why: null, files: out.sort() };
}

/** 分类：只为「文档改动是不是零」这一条判据服务，不参与其它判断。 */
function classify(rel) {
  const r = String(rel || '').replace(/\\/g, '/');
  if (r === 'index.js') return 'entry';
  if (/\.md$/i.test(r) || /^docs\//.test(r) || /^plans\//.test(r)) return 'doc';
  if (/^tests\//.test(r)) return 'test';
  if (/^engines\//.test(r)) return 'engine';
  if (/^core\//.test(r)) return 'core';
  if (/^ui\//.test(r)) return 'ui';
  if (/^render\//.test(r)) return 'render';
  if (/^tools\//.test(r)) return 'tool';
  if (/^actors\/|^direction\//.test(r)) return 'engine';
  return 'other';
}
const PURE_DOC = { doc: 1 };

/** 测试语料：只看 tests/*.js（专锁是「提到」的唯一合理宿主；tools/ 里的脚本不是判据）。 */
function corpus(root) {
  const out = [];
  let names = [];
  try { names = fs.readdirSync(path.join(root, 'tests')); } catch (e) { return out; }
  names.forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    try { out.push({ rel: 'tests/' + f, text: fs.readFileSync(path.join(root, 'tests', f), 'utf8') }); }
    catch (e) { /* 读不到就不参与反查：不编命中 */ }
  });
  return out;
}

/** 一个改动文件在语料里的「提及式样」：相对路径 / 文件名 / 下划线-驼峰化的命名空间。 */
function needles(rel) {
  const r = String(rel).replace(/\\/g, '/');
  const base = r.split('/').pop();
  const stem = base.replace(/\.js$/i, '');
  const camel = stem.replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
  const out = [r, base, stem];
  if (camel && camel !== stem) out.push(camel);
  return out.filter(Boolean);
}

/** 反查：返回命中的测试文件（按提及式样去重）。 */
function consumersOf(rel, texts) {
  const ns = needles(rel);
  const hit = [];
  (texts || []).forEach(function (t) {
    for (let i = 0; i < ns.length; i += 1) {
      if (t.text.indexOf(ns[i]) >= 0) { hit.push(t.rel); return; }
    }
  });
  return hit;
}

/** 主选面：改动面 → 行表 + 汇总 + 结论。**纯函数**（除读语料）。 */
function select(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const texts = o.texts || corpus(root);
  const files = (o.changed || []).slice();
  const rows = files.map(function (rel) {
    const kind = classify(rel);
    const tests = kind === 'test' ? [rel] : (PURE_DOC[kind] ? [] : consumersOf(rel, texts));
    return { file: rel, kind: kind, tests: tests, mapped: tests.length > 0 };
  });
  const related = [];
  rows.forEach(function (r) { r.tests.forEach(function (t) { if (related.indexOf(t) < 0) related.push(t); }); });
  related.sort();
  const exec = rows.filter(function (r) { return r.kind !== 'doc' && r.kind !== 'other'; });
  const uncovered = rows.filter(function (r) {
    return r.kind !== 'doc' && r.kind !== 'test' && r.kind !== 'other' && !r.mapped;
  }).map(function (r) { return r.file; });
  const docOnly = rows.length > 0 && rows.every(function (r) { return r.kind === 'doc'; });
  const verdict = !rows.length ? 'no-change'
    : docOnly ? 'doc-only'
      : uncovered.length ? 'uncovered-change'
        : 'covered';
  return {
    verdict: verdict,
    changed: rows.length,
    exec: exec.length,
    related: related,
    uncovered: uncovered.sort(),
    rows: rows,
    // 下界/上界两句话必须同时在场：只说 related 会把「没提到」误读成「不影响」。
    bounds: { related: 'lower-bound', uncovered: 'upper-bound' },
    proves: docOnly ? 'nothing-needs-running' : 'affected-tests-enumerated'
  };
}

function main() {
  const args = process.argv.slice(2);
  let changed = null, asJson = false;
  args.forEach(function (a) {
    if (a === '--json') asJson = true;
    else if (a.indexOf('--') !== 0) { changed = changed || []; changed.push(a); }
    else { console.error('未知参数：' + a); process.exitCode = 3; }
  });
  if (process.exitCode === 3) return;
  if (!changed) {
    const c = changedFiles(BASE);
    if (!c.ok) { console.error('拒收：取不到 git 改动面（' + c.why + '）'); process.exitCode = 3; return; }
    changed = c.files;
  }
  const r = select({ root: BASE, changed: changed });
  if (asJson) console.log(JSON.stringify(r, null, 2));
  else {
    console.log('■ 改动 ' + r.changed + ' 项（可执行面 ' + r.exec + '）→ ' + r.verdict);
    r.rows.forEach(function (row) {
      console.log('  ' + (row.mapped || row.kind === 'doc' ? '·' : '!') + ' ' + row.file + ' [' + row.kind + ']'
        + (row.tests.length ? ' → ' + row.tests.length + ' 个测试' : (row.kind === 'doc' ? ' → 文档，零跑' : ' → 无人提及')));
    });
    if (r.uncovered.length) console.log('■ 无人提及（不是「不影响」，是「没证据」）：' + JSON.stringify(r.uncovered));
  }
  process.exitCode = r.verdict === 'uncovered-change' ? 3 : 0;
}

module.exports = {
  changedFiles: changedFiles, classify: classify, needles: needles, consumersOf: consumersOf, select: select
};
if (require.main === module) main();
