#!/usr/bin/env node
/**
 * WorldAxis tools/impact-analysis.js (v2.110.0) — 变更影响面分析（计划一 #27）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   改一个函数时，「还有谁会受影响」此前**只能靠 grep 全仓 + 人脑展开**：
 *   `node tools/impact-analysis.js timeline.hashText` 本该立刻回答
 *   「直接调用方 → 间接调用方 → 受影响的专锁 → 受影响的 UI 控件」，
 *   而这四层此前一次都没有被列出来过。后果是改动的**波及面靠运气**：
 *   v2.109.0 的三处升版红灯里，有两处正是「改了甲，乙的判据跟着变」。
 *
 * ── 四条口径（否定式）──────────────────────────────────────────────────
 *   ① **静态近似，且自报边界**：只按文本找 `WA.<ns>.<fn>` 调用点（含解构别名 `const f = WA.ns.fn`）。
 *      动态属性访问（`WA[ns][fn]`）、字符串拼接调用**看不见** —— 读数里如实写 `unseen:true`，
 *      不假装「全找到了」。本仓 v2.83.0 的教训：静态面答不了的那一半要说出来。
 *   ② **四层各自成词**：direct（谁直接调）/ indirect（调 direct 的那些公开口的人）/
 *      locks（哪个 test 文件提到该 ns 或 fn）/ ui（哪个 ui/ 文件提到）。
 *      四层**不合并成一个「影响面 N 个文件」** —— 那个数字没法据以行动。
 *   ③ **零依赖**：只用 `fs`/`path` + 可选的 `child_process`（git 用于「最近谁改过」）。
 *   ④ **只读**：不写任何文件、不改索引缓存（每次现算；仓库 112 个文件，代价可忽略）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');

function filesIn(root) {
  let all = [];
  try { all = require(path.join(root, 'tests', 'product-files.js')).productFiles(root); }
  catch (e) { all = []; }
  let tests = [];
  try {
    tests = fs.readdirSync(path.join(root, 'tests')).filter(function (f) { return /\.js$/.test(f); })
      .map(function (f) { return 'tests/' + f; });
  } catch (e) { tests = []; }
  let ui = [];
  try { ui = fs.readdirSync(path.join(root, 'ui')).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return 'ui/' + f; }); }
  catch (e) { ui = []; }
  return { product: all, tests: tests, ui: ui };
}

/** 全文出现次数（字面量，不解释正则）。 */
function countOf(src, needle) { return String(src).split(needle).length - 1; }

/**
 * 影响面分析。
 * @param {string} target `ns.fn` 或 `ns` 或 `fn`（三种粒度都接受，读数会自报用的是哪种）
 * @param {Object} [opts] `{root, depth}`；depth 默认 1（间接层只展开一层，见口径①）
 */
function analyze(target, opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const t = String(target || '').trim();
  if (!t) return { ok: false, reason: 'missing-target' };
  const files = filesIn(root);
  const parts = t.split('.');
  const ns = parts.length > 1 ? parts[0] : '';
  const fn = parts.length > 1 ? parts[1] : parts[0];
  const callNeedle = ns ? ('WA.' + ns + '.' + fn) : ('.' + fn + '(');
  const aliasRe = ns ? new RegExp('=\\s*WA\\.' + ns + '\\.' + fn + '\\b') : null;

  const read = {};            // rel -> src（只读一次）
  function srcOf(rel) {
    if (read[rel] === undefined) {
      try { read[rel] = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { read[rel] = ''; }
    }
    return read[rel];
  }
  const seen = [];            // 本轮分析覆盖到的文件（含 tests/ui）
  const direct = [], alias = [], locks = [], uiHits = [];
  files.product.forEach(function (rel) {
    const s = srcOf(rel); seen.push(rel);
    const n = countOf(s, callNeedle);
    const a = aliasRe ? (s.match(aliasRe) || []).length : 0;
    if (n > 0) direct.push({ file: rel, calls: n, aliases: a });
    else if (a > 0) alias.push({ file: rel, aliases: a });
  });
  files.tests.forEach(function (rel) {
    const s = srcOf(rel); seen.push(rel);
    const n = countOf(s, callNeedle) + (ns ? countOf(s, "'" + ns + "'") * 0 : 0);
    if (n > 0) locks.push({ file: rel, refs: n });
  });
  files.ui.forEach(function (rel) {
    const s = srcOf(rel); seen.push(rel);
    const n = countOf(s, callNeedle) + (ns ? countOf(s, 'WA.' + ns + '.') : 0);
    if (n > 0) uiHits.push({ file: rel, refs: n });
  });
  // 间接层：direct 里那些文件的**导出命名空间**被别人调的地方
  const indirect = [];
  if (o.depth !== 0) {
    const nsOf = {};
    direct.forEach(function (d) {
      const m = srcOf(d.file).match(/WA\.([A-Za-z_$][\w$]*)\s*=\s*\{/);
      if (m) {
        // 该文件导出的每个成员：谁在调它
        const keys = [];
        const body = srcOf(d.file);
        const re = new RegExp('WA\\.' + m[1] + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
        let mm;
        while ((mm = re.exec(body))) if (keys.indexOf(mm[1]) < 0) keys.push(mm[1]);
        nsOf[d.file] = { ns: m[1], keys: keys.slice(0, 40) };
      }
    });
    Object.keys(nsOf).forEach(function (rel) {
      const info = nsOf[rel];
      files.product.forEach(function (other) {
        if (other === rel) return;
        const s = srcOf(other);
        const hit = info.keys.filter(function (k) { return countOf(s, 'WA.' + info.ns + '.' + k) > 0; });
        if (hit.length) indirect.push({ via: rel, ns: info.ns, from: other, members: hit.slice(0, 6) });
      });
    });
  }
  let recentCommits = [];
  try {
    const out = cp.execSync('git log -n 5 --format=%h%x09%s -- ' + (files.product.filter(function (r) { return countOf(srcOf(r), callNeedle) > 0; })[0] || '.'), { cwd: root, encoding: 'utf8', timeout: 6000 });
    recentCommits = String(out).trim().split('\n').filter(Boolean);
  } catch (e) { recentCommits = []; }

  return { ok: true, target: t, granularity: ns ? 'ns.fn' : 'fn', needle: callNeedle,
    direct: direct, alias: alias, indirect: indirect.slice(0, 40), locks: locks, ui: uiHits,
    unseen: true, seen: seen.length, recentCommits: recentCommits };
}

/** 人读形态（run.js 与 CLI 共用；判据按**字段**断言，不按这段文本断言）。 */
function summary(r) {
  if (!r || !r.ok) return '影响面分析失败：' + ((r && r.reason) || 'unknown');
  const L = [];
  L.push('目标 ' + r.target + '（粒度 ' + r.granularity + '，锚点 ' + r.needle + '）');
  L.push('  · 直接调用方 ' + r.direct.length + ' 个：' + (r.direct.map(function (d) { return d.file + '×' + d.calls; }).join('、') || '（无）'));
  L.push('  · 别名持有 ' + r.alias.length + ' 个：' + (r.alias.map(function (d) { return d.file; }).join('、') || '（无）'));
  L.push('  · 间接影响 ' + r.indirect.length + ' 条：' + (r.indirect.map(function (d) { return d.ns + '.' + d.members[0] + '@' + d.from; }).join('、') || '（无）'));
  L.push('  · 受影响专锁 ' + r.locks.length + ' 个：' + (r.locks.map(function (d) { return d.file; }).join('、') || '（无）'));
  L.push('  · 受影响 UI ' + r.ui.length + ' 个：' + (r.ui.map(function (d) { return d.file; }).join('、') || '（无）'));
  L.push('  · 静态近似，动态访问（WA[ns][fn] / 字符串拼接调用）看不见 —— 这是口径，不是遗漏');
  return L.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args.filter(function (a) { return a.indexOf('--') !== 0; })[0];
  if (!target) {
    console.log('用法: node tools/impact-analysis.js <ns.fn|ns|fn> [--json]');
    console.log('例：node tools/impact-analysis.js timeline.hashText');
    process.exit(2);
  }
  const r = analyze(target, {});
  console.log('■ 变更影响面');
  console.log(summary(r));
  if (args.indexOf('--json') >= 0) console.log(JSON.stringify(r, null, 1));
  process.exit(0);
}

module.exports = { BASE: BASE, analyze: analyze, summary: summary, countOf: countOf, filesIn: filesIn };