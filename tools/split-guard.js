#!/usr/bin/env node
/**
 * WorldAxis tools/split-guard.js (v2.529.0) — OPV29-12 拆段假绿防线
 *
 * ── 它治什么（本版现场）──────────────────────────────────
 *   OPV29-07～11 都是「把一个大文件按职责拆成几段」。拆段的危险不在拆坏语法
 *   （`node --check` 当场就红），而在**判据面悄悄变小**：
 *   某个 `assert` 随着被搬走的代码一起搬丢了，文件照样能 require、锁照样绿 ——
 *   绿的理由从「判过了」变成「没判」。这类假绿没有任何现场信号。
 *
 *   本工具只做一件事：**拆段前后各跑一次同一判据集，比对判据指纹**。
 *     少一条 ⇒ 红（这就是拆段假绿）。
 *     多一条 ⇒ 只可见（新增判据是好事，但必须被人看见，不能静默）。
 *
 * ── 判据指纹是什么 ────────────────────────────────────────
 *   每条判据的身份 = `(通过/失败) + 消息文本`。拆段不该改判据文本；
 *   若文本被改，本工具会把它同时报成「少一条 + 多一条」 —— 那是改名，不是静默通过。
 *
 * ── 三条否定式口径（防假绿）────────────────────────────────
 *   ① **零判据不许当基线**：采集时任一文件 rows=0 ⇒ 拒收、rc=3、不写基线文件。
 *      否则基线与现场都是空的，比对恒真（这正是「空集上全等于」）。
 *   ② **文件面必须一致**：比对时基线里的文件今天没跑到 ⇒ 红（不是跳过）。
 *   ③ **子进程采集**：锁会污染宿主 global（装载 UI/写 storage 夹具），
 *      在同一进程里连跑「前/后」两次，第二次读到的已不是同一个世界。
 *      故每把锁都在 `tools/lock-child.js` 子进程里跑，与锁级并行同一套入口。
 *
 * ── 用法 ───────────────────────────────────────────────
 *   node tools/split-guard.js --capture tests/split-base.json settle-v2820.js causal-view-v2870.js
 *   node tools/split-guard.js --compare tests/split-base.json
 *   node tools/split-guard.js --compare tests/split-base.json settle-v2820.js   # 也可显式给面
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const TESTS = path.join(ROOT, 'tests');
const SL = require(path.join(__dirname, 'shard-locks.js'));

function normFile(f) {
  return String(f || '').trim().replace(/^\.\//, '').replace(/^tests\//, '');
}

/** 在子进程里跑一把锁，取判据行（与锁级并行同一个入口、同一个解析器）。 */
function collectOne(file) {
  const rel = normFile(file);
  const abs = path.join(TESTS, rel);
  if (!rel || !fs.existsSync(abs)) {
    return { file: rel, kind: 'no-file', rows: [], reported: 0, ms: 0 };
  }
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'lock-child.js'), './' + rel], {
    cwd: ROOT, encoding: 'utf8', timeout: 900000
  });
  const out = String((r.stdout || '') + (r.stderr || ''));
  const p = SL.parseChild(out, r.status);
  return {
    file: rel, kind: p.kind, reported: p.reported,
    rows: (p.rows || []).map(function (x) { return { ok: !!x.ok, msg: String(x.msg || '') }; }),
    ms: Date.now() - t0
  };
}

/** 采集一批锁。空转（零判据/装载失败/缺文件）逐条点名。 */
function capture(files) {
  const res = { tool: 'split-guard', schema: 1, at: new Date().toISOString(), locks: {}, empty: [] };
  (files || []).map(normFile).filter(Boolean).forEach(function (rel) {
    const c = collectOne(rel);
    res.locks[rel] = { kind: c.kind, reported: c.reported, ms: c.ms, rows: c.rows };
    if (!c.rows.length) res.empty.push(rel + '（' + c.kind + '）');
  });
  return res;
}

/** 判据指纹：`P|msg` / `F|msg`，文件内排序后存数组。 */
function fingerprint(cap) {
  const out = {};
  Object.keys((cap && cap.locks) || {}).forEach(function (rel) {
    out[rel] = (((cap.locks[rel] || {}).rows) || []).map(function (x) {
      return (x.ok ? 'P|' : 'F|') + x.msg;
    }).sort();
  });
  return out;
}

/** 比对：基线 vs 今天。缺一条即红；多一条只可见；文件面缺失也是红。 */
function compare(base, now) {
  const a = fingerprint(base), b = fingerprint(now);
  const missing = [], added = [], gone = [], fresh = [];
  Object.keys(a).forEach(function (rel) {
    if (!b[rel]) { gone.push(rel); return; }
    const want = a[rel].slice(), got = b[rel].slice();
    const pool = {};
    got.forEach(function (k) { pool[k] = (pool[k] || 0) + 1; });
    want.forEach(function (k) {
      if (pool[k] > 0) pool[k] -= 1;
      else missing.push({ file: rel, sid: k });
    });
    const back = {};
    a[rel].forEach(function (k) { back[k] = (back[k] || 0) + 1; });
    got.forEach(function (k) {
      if (back[k] > 0) back[k] -= 1;
      else added.push({ file: rel, sid: k });
    });
  });
  Object.keys(b).forEach(function (rel) { if (!a[rel]) fresh.push(rel); });
  const baseCount = Object.keys(a).reduce(function (n, k) { return n + a[k].length; }, 0);
  const nowCount = Object.keys(b).reduce(function (n, k) { return n + b[k].length; }, 0);
  return {
    missing: missing, added: added, goneFiles: gone, newFiles: fresh,
    baseCount: baseCount, nowCount: nowCount,
    ok: missing.length === 0 && gone.length === 0
  };
}

function main() {
  const argv = process.argv.slice(2);
  const iCap = argv.indexOf('--capture');
  const iCmp = argv.indexOf('--compare');
  if (iCap < 0 && iCmp < 0) {
    console.error('用法: node tools/split-guard.js --capture <out.json> <锁文件…> | --compare <基线.json> [锁文件…]');
    process.exitCode = 3; return;
  }
  if (iCap >= 0) {
    const outFile = argv[iCap + 1];
    const files = argv.slice(iCap + 2);
    if (!outFile || !files.length) { console.error('--capture 需要 <out.json> 与至少一把锁'); process.exitCode = 3; return; }
    const cap = capture(files);
    const total = Object.keys(cap.locks).reduce(function (n, k) { return n + cap.locks[k].rows.length; }, 0);
    console.log('■ 采集：' + Object.keys(cap.locks).length + ' 把 / 判据 ' + total + ' 条');
    if (cap.empty.length) {
      console.error('✗ 拒收：以下文件零判据/装载失败 —— 空基线会让比对恒真');
      cap.empty.forEach(function (x) { console.error('   · ' + x); });
      process.exitCode = 3; return;
    }
    fs.writeFileSync(outFile, JSON.stringify(cap, null, 2) + '\n');
    console.log('■ 基线已写：' + outFile);
    return;
  }
  const baseFile = argv[iCmp + 1];
  if (!baseFile) { console.error('--compare 需要 <基线.json>'); process.exitCode = 3; return; }
  let base;
  try { base = JSON.parse(fs.readFileSync(baseFile, 'utf8')); } catch (e) {
    console.error('✗ 基线读不出：' + e.message); process.exitCode = 3; return;
  }
  const explicit = argv.slice(iCmp + 2);
  const files = explicit.length ? explicit : Object.keys(base.locks || {});
  if (!files.length) { console.error('✗ 基线里没有锁面，无法比对'); process.exitCode = 3; return; }
  const now = capture(files);
  const r = compare(base, now);
  console.log('■ 比对：基线 ' + r.baseCount + ' 条 → 现在 ' + r.nowCount + ' 条');
  if (r.goneFiles.length) {
    console.error('✗ 文件面缺失（基线里有、今天没跑到）：');
    r.goneFiles.forEach(function (f) { console.error('   · ' + f); });
  }
  if (r.missing.length) {
    console.error('✗ 少判据 ' + r.missing.length + ' 条（拆段假绿）：');
    r.missing.slice(0, 20).forEach(function (m) { console.error('   · ' + m.file + ' ⟵ ' + m.sid); });
  }
  if (r.added.length) {
    console.log('ℹ 新增判据 ' + r.added.length + ' 条（可见，不算红）：');
    r.added.slice(0, 10).forEach(function (m) { console.log('   + ' + m.file + ' → ' + m.sid); });
  }
  if (r.newFiles.length) console.log('ℹ 新增文件面 ' + r.newFiles.join(', '));
  console.log(r.ok ? '■ 结论：PASS（判据面未缩小）' : '■ 结论：FAIL（判据面缩小 —— 拆段把判据搬丢了）');
  process.exitCode = r.ok ? 0 : 1;
}

module.exports = {
  normFile: normFile, collectOne: collectOne, capture: capture,
  fingerprint: fingerprint, compare: compare
};
if (require.main === module) main();