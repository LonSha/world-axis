#!/usr/bin/env node
'use strict';
// WorldAxis tools/impact.js (v2.524.0) — OPV29-02 增量回归（改了什么 ⇒ 只跑哪些锁）
//
// ── 病 ────────────────────────────────────────────────────────────
// 全量回归实测 ≈29 分钟（240 节、1000+ 锁）。于是每次改一行都要么等半小时，要么
// 「先记下来待会儿看」——然后忘了。红变成一条没人复现的记录，这正是回归最贵的部分：
// 不是时间，是**因为太贵所以没人真跑**。
//
// ── 口径（两向都要治）─────────────────────────────────────────────
// 只跑相关的锁 ⇒ 快，但**漏**了相关的锁就变成假绿（比慢可怕得多）。
// 所以本工具的方向永远是「宁可多跑」：
//   · 直接引用：某锁的源码里出现该文件的相对路径 / 文件名 / 词干 ⇒ 算相关。
//   · 词干口径故意放宽（≥8 字符才用），宁可多带几把锁，不许少带。
//   · **反查不到就退回全量**（`fullRequired`）：不认识的改动 = 不知道影响面，
//     「不知道」必须走全量，绝不输出一个空的「0 相关」。
//   · 文档/计划类改动，若没有任何锁提到它 ⇒ 相关测试 0 个（这是**结论**，不是没查到）。
//
// ── 用法 ──────────────────────────────────────────────────────────
//   node tools/impact.js                       # 工作区 + 与 origin/master 的差异
//   node tools/impact.js --base=95264cf        # 指定基线（默认 merge-base origin/master）
//   node tools/impact.js --files=engines/x.js,docs/a.md
//   node tools/impact.js --check               # 自检（索引与现场一致）
//   node tools/impact.js --json
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const SCAN_DIRS = ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui', 'tools', 'docs', 'plans', 'tests'];
const REL_RE = /(?:engines|core|ui|render|actors|direction|compat|tools|docs|plans|tests)\/[A-Za-z0-9_\-./]+?\.(?:js|json|md)/g;

function walk(dir, out) {
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  names.forEach(function (e) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else if (e.isFile()) out.push(path.relative(ROOT, abs).replace(/\\/g, '/'));
  });
  return out;
}
function allFiles() {
  const out = [];
  SCAN_DIRS.forEach(function (d) { const p = path.join(ROOT, d); if (fs.existsSync(p)) walk(p, out); });
  return out.sort();
}
function testFiles() {
  let names = [];
  try { names = fs.readdirSync(TESTS); } catch (e) { return []; }
  return names.filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return 'tests/' + f; }).sort();
}
/**
 * 一把锁「提到」了哪些文件。三档口径，全部可复算：
 *   ① 相对路径（含 ../ 前缀）② 带扩展名的文件名 ③ 词干（≥8 字符，宁可放宽）
 *   ⚠ 判定用 **token 集**而不是逐名 `text.indexOf`：后者是 1000 锁 × 1000 名字 = 1e6 次
 *     子串搜索，实测跑到分钟级。token 化一次（按非 [A-Za-z0-9_.-] 切），三档都用集合查，
 *     语义等价（这些都是「独立词」形态）。
 */
function tokensOf(text) {
  const s = new Set();
  String(text).split(/[^A-Za-z0-9_.-]+/).forEach(function (w) { if (w) s.add(w); });
  return s;
}
function refsOf(rel, tokens, known) {
  const hits = {};
  Object.keys(known.__byBase).forEach(function (base) {
    if (!tokens.has(base)) return;
    known.__byBase[base].forEach(function (r) { hits[r] = 1; });
  });
  Object.keys(known.__byStem).forEach(function (stem) {
    if (!tokens.has(stem)) return;
    known.__byStem[stem].forEach(function (r) { hits[r] = 1; });
  });
  return Object.keys(hits);
}
function index() {
  const known = Object.create(null);
  const byBase = Object.create(null);
  const byStem = Object.create(null);
  const files = allFiles();
  files.forEach(function (r) {
    known[r] = 1;
    const base = r.split('/').pop();
    (byBase[base] = byBase[base] || []).push(r);
    const stem = base.replace(/\.[^.]+$/, '');
    if (stem.length >= 8) (byStem[stem] = byStem[stem] || []).push(r);
  });
  known.__byBase = byBase;
  known.__byStem = byStem;
  const tests = testFiles();
  const map = Object.create(null); // 文件 rel -> 引用它的锁
  const self = Object.create(null);
  tests.forEach(function (t) {
    self[t] = 1;
    let text = '';
    try { text = fs.readFileSync(path.join(ROOT, t), 'utf8'); } catch (e) { return; }
    refsOf(t, tokensOf(text), known).forEach(function (r) {
      if (r === t) return;
      (map[r] = map[r] || []).push(t);
    });
  });
  Object.keys(map).forEach(function (k) { map[k] = Array.from(new Set(map[k])).sort(); });
  return { files: files, tests: tests, map: map, known: known, self: self };
}

function git(args) {
  const r = cp.spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
  return { ok: r.status === 0, out: String(r.stdout || '').trim(), err: String(r.stderr || '').trim() };
}
function changedFiles(opts) {
  const o = opts || {};
  if (o.files && o.files.length) return { ok: true, files: o.files, src: 'args' };
  let base = o.base;
  if (!base) {
    const mb = git(['merge-base', 'origin/master', 'HEAD']);
    base = mb.ok && mb.out ? mb.out : 'HEAD';
  }
  const tracked = git(['diff', '--name-only', base + '...HEAD']);
  const dirty = git(['status', '--porcelain']);
  const un = git(['ls-files', '--others', '--exclude-standard']);
  const files = new Set();
  if (tracked.ok) tracked.out.split('\n').filter(Boolean).forEach(function (f) { files.add(f); });
  if (dirty.ok) dirty.out.split('\n').filter(Boolean).forEach(function (l) { files.add(l.slice(3).trim()); });
  if (un.ok) un.out.split('\n').filter(Boolean).forEach(function (f) { files.add(f); });
  return { ok: true, files: Array.from(files).sort(), src: 'git:' + base };
}

/** 核心：改动 → 受影响的锁。unknown 一律 fullRequired。 */
function impact(opts) {
  const o = opts || {};
  // idx 可注入：一把锁里要算多次影响面时，索引没必要重建（建一次 ≈1.7s）。
  const idx = o.idx || index();
  const ch = changedFiles(o);
  const rows = [];
  const affected = new Set();
  let fullRequired = false;
  ch.files.forEach(function (rel) {
    const base = rel.split('/').pop();
    const stem = base.replace(/\.[^.]+$/, '');
    let why = null, tests = [];
    if (idx.self[rel]) { why = 'is-test'; tests = [rel]; }
    else {
      // 候选并集：直接引用 + 同名文件 + 同词干文件。（**必须排除自己**：
      //   第一版没排除，导致 `__byBase[自己的文件名]` 恒存在，任何无人引用的文档都被
      //   抢先判成 `same-name`，「无人引用」这个结论永远显示不出来 —— A8 当场抓到。）
      const cand = new Set();
      (idx.map[rel] || []).forEach(function (t) { cand.add(t); });
      const addBy = function (list) {
        (list || []).forEach(function (r) {
          if (r === rel) return;
          (idx.map[r] || []).forEach(function (t) { cand.add(t); });
        });
      };
      addBy(idx.known.__byBase[base]);
      if (stem.length >= 8) addBy(idx.known.__byStem[stem]);
      tests = Array.from(cand).sort();
      if (idx.map[rel]) why = 'direct';
      else if (tests.length) why = 'same-name';
    }
    if (!why) {
      if (idx.known[rel]) {
        // 文件在场，但没有任何锁提到它 → 文档/计划可以下「0 相关」的结论；
        //   其余（新的引擎、新的核心文件）是**不知道影响面**，一律退回全量。
        why = /^(docs|plans)\//.test(rel) ? 'doc-unreferenced' : 'no-reference';
        if (why === 'no-reference') fullRequired = true;
      } else {
        why = 'unresolved';       // 路径根本不存在（删了 / 打错）⇒ 同样退全量
        fullRequired = true;
      }
    }
    tests.forEach(function (t) { affected.add(t); });
    rows.push({ rel: rel, why: why, tests: tests });
  });
  return {
    ok: true,
    source: ch.src,
    changed: ch.files.length,
    rows: rows,
    affected: Array.from(affected).sort(),
    fullRequired: fullRequired,
    index: { files: idx.files.length, tests: idx.tests.length, mapped: Object.keys(idx.map).length }
  };
}

function check() {
  const idx = index();
  const probs = [];
  if (!idx.tests.length) probs.push('no-tests-indexed');
  // 索引里的每个「被引用文件」都必须真实存在（否则索引是旧世界的）
  Object.keys(idx.map).forEach(function (rel) {
    if (!idx.known[rel]) probs.push('dangling-ref:' + rel);
  });
  // 每把锁都必须能被「改它自己」命中（自指档）
  idx.tests.forEach(function (t) { if (!idx.self[t]) probs.push('test-not-self:' + t); });
  // 反向：至少有一把锁引用了 engines/ 与 core/（否则索引口径塌了）
  const hasEng = Object.keys(idx.map).some(function (k) { return /^engines\//.test(k); });
  const hasCore = Object.keys(idx.map).some(function (k) { return /^core\//.test(k); });
  if (!hasEng) probs.push('no-engine-referenced');
  if (!hasCore) probs.push('no-core-referenced');
  return { ok: probs.length === 0, probs: probs, index: { files: idx.files.length, tests: idx.tests.length, mapped: Object.keys(idx.map).length } };
}

function render(res) {
  const L = [];
  L.push('WorldAxis 增量回归影响面（OPV29-02）');
  L.push('  索引：' + res.index.files + ' 个文件 · ' + res.index.tests + ' 把锁 · ' + res.index.mapped + ' 个文件有反向引用');
  L.push('  改动来源：' + res.source + ' · ' + res.changed + ' 个文件');
  res.rows.slice(0, 20).forEach(function (r) {
    L.push('  · ' + r.rel + '  [' + r.why + '] ⇒ ' + (r.tests.length ? r.tests.length + ' 把锁' : '0 把'));
  });
  if (res.rows.length > 20) L.push('  … 其余 ' + (res.rows.length - 20) + ' 个');
  L.push('  ⇒ 需跑 ' + res.affected.length + ' 把锁' + (res.fullRequired ? ' · **有未知改动 ⇒ 必须退回全量**' : ''));
  if (res.affected.length && res.affected.length <= 40) res.affected.forEach(function (t) { L.push('    - ' + t); });
  return L.join('\n');
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = function (k) { const a = argv.filter(function (x) { return x.indexOf('--' + k + '=') === 0; })[0]; return a ? a.slice(k.length + 3) : null; };
  if (argv.indexOf('--check') >= 0) {
    const c = check();
    if (argv.indexOf('--json') >= 0) console.log(JSON.stringify(c, null, 2));
    else console.log(c.ok ? '✓ impact --check: pass（索引 ' + c.index.files + ' 文件 / ' + c.index.tests + ' 锁 / ' + c.index.mapped + ' 有反向引用）'
      : '✗ impact --check: FAIL ' + c.probs.length + ' 条\n  · ' + c.probs.slice(0, 10).join('\n  · '));
    process.exit(c.ok ? 0 : 1);
  }
  const f = get('files');
  const res = impact({ base: get('base'), files: f ? f.split(',') : null });
  if (argv.indexOf('--json') >= 0) console.log(JSON.stringify(res, null, 2));
  else console.log(render(res));
}
module.exports = { index: index, impact: impact, check: check, changedFiles: changedFiles };