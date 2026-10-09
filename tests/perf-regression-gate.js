// WorldAxis tests/perf-regression-gate.js (v2.109.0) — 跨版本性能回归门禁（计划一 #12）
//
// ── 病灶 ────────────────────────────────────────────────────────────────
//   `engines/perf-trace.js` 自 v2.102.0 起能答「这一轮慢在谁身上」，v2.109.0 起能把它
//   导出成快照（`snapshot()`）。但**没有一道门禁读快照** ——
//   「这个版本比上个版本慢了 40%」在任何时刻都只能靠人肉回忆，而性能劣化**从不报错**：
//   它只是让用户觉得「这扩展有点卡」，然后在某一天被卸载。零告警的劣化才是真劣化。
//
// ── 本门禁的四条口径（全是否定式）──────────────────────────────────────
//   ① **墙钟跨机不可比 ⇒ 默认不判墙钟**。实测：同一次全量回归在不同机器上差 3 倍以上。
//      拿绝对毫秒当阈值 = 「换台机器就假红」，而假红的门禁最后一定会被绕过。
//      故默认只判**结构面**（层 / 面 / 缓存上限 —— 确定量，跨机可比）；
//      墙钟判定须调用方**显式声明同机**（`--same-host` 或 `{sameHost:true}`）。
//   ② **无上版可比不许静默 pass**。首版没有基线是合法的，但「没有基线」与
//      「比过了，没问题」必须是两个不同的状态（`first-baseline` / `compared`），
//      不许都渲染成绿。这是本仓反复治的「结论不实」。
//   ③ **样本不足不判**（继承 v2.109.0 #8 的 `insufficient` 口径）：窗口里没几个样本时
//      P95 是噪声，此时报「稳定」等于说谎。如实报 `insufficient`。
//   ④ **门禁自己必须真跑一次现场采集**：读磁盘上的旧快照与内存里那个空窗口比，
//      比出来的永远是 0 —— 那不是「没劣化」，那是**没有读数**。
//
// ── 判据的取样单位（本文件最容易错的一处）──────────────────────────────
//   比的是**同一层**的 P95（层是 perf-trace 的最小封闭单位，`LAYERS` 四元组）。
//   不是「总耗时」（四层相加会掩盖层间此消彼长），也不是「逐面」——
//   面级读数只在 `snapshot().layers[L].faces` 里作**明细**保留，不进判定。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
/** 基线快照目录（仓库内；跨机器/跨会话持久）。 */
const DIR = path.join(BASE, 'tests', 'perf-baseline');
/** 回归阈值：P95 超过上一版 20% 即判劣化（计划原文口径）。 */
const REGRESS_FACTOR = 1.2;
/** 样本下限：窗口样本少于此数不判（继承 perf-trace 的 `insufficient` 口径）。 */
const MIN_SAMPLES = 8;
/** 可判定的两种终态（见口径②）。 */
const STATES = ['compared', 'first-baseline'];

/* ── 版本号工具（不许新造第二套排序：整段按数值比较）────────────────── */
function versionOf(file) {
  const m = String(file).match(/perf-snapshot-([0-9]+(?:\.[0-9]+)*)\.json$/);
  return m ? m[1] : '';
}
function cmpVer(a, b) {
  const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] || 0, y = B[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}
/** 快照清单（按版本升序；读不到目录即空清单，不抛）。 */
function list() {
  try {
    return fs.readdirSync(DIR).filter(function (f) { return !!versionOf(f); })
      .map(function (f) { return { file: f, ver: versionOf(f), path: path.join(DIR, f) }; })
      .sort(function (a, b) { return cmpVer(a.ver, b.ver); });
  } catch (e) { return []; }
}
function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}
/** 上一版基线：排除当前版本后取版本号最大的那一份（无则 null）。 */
function latestBaseline(excludeVer) {
  const all = list().filter(function (x) { return !excludeVer || x.ver !== excludeVer; });
  if (!all.length) return null;
  const x = all[all.length - 1];
  const obj = readJSON(x.path);
  return obj ? { ver: x.ver, file: x.file, snap: obj } : null;
}
/**
 * git 兜底：工作区目录被清空（或首版）时，从提交历史里捞上版快照。
 *   `git log --all` 取的是**全历史**（含已删除文件），故即使快照被删也读得到。
 *   读取失败一律返回 null（不抛）——「读不到」与「没有」在调用方由 `source` 字段区分。
 */
function gitBaseline(excludeVer, rev) {
  try {
    const rel = 'tests/perf-baseline';
    const log = cp.execSync('git log --all --format=%H -- ' + rel, { cwd: BASE, encoding: 'utf8', timeout: 8000 }).trim();
    if (!log) return null;
    const revs = log.split('\n').slice(0, 20);
    for (const r of revs) {
      let files = '';
      try { files = cp.execSync('git ls-tree -r --name-only ' + r + ' -- ' + rel, { cwd: BASE, encoding: 'utf8', timeout: 8000 }).trim(); } catch (e) { continue; }
      const cand = files.split('\n').map(function (f) { return f.trim(); })
        .filter(function (f) { return !!versionOf(path.basename(f)); })
        .filter(function (f) { return !excludeVer || versionOf(path.basename(f)) !== excludeVer; })
        .sort(function (a, b) { return cmpVer(versionOf(path.basename(a)), versionOf(path.basename(b))); });
      if (!cand.length) continue;
      const pick = cand[cand.length - 1];
      try {
        const txt = cp.execSync('git show ' + r + ':' + pick, { cwd: BASE, encoding: 'utf8', timeout: 8000, maxBuffer: 1 << 22 });
        const obj = JSON.parse(txt);
        return { ver: versionOf(path.basename(pick)), file: pick, rev: r, snap: obj, source: 'git' };
      } catch (e) { continue; }
    }
  } catch (e) { /* git 不可用 ⇒ 无兜底 */ }
  return null;
}

/* ── 核心判据 ─────────────────────────────────────────────────────────── */
/**
 * 逐层比对现场快照与基线快照。
 *   `opts.sameHost` 为真才判墙钟（口径①）；否则墙钟一栏如实标 `not-comparable`。
 *   `opts.now` 是现场快照（缺省时调用方自己采；本函数**不采**——采集是调用方的事，
 *   判据只做判据，这样它才能被负控制用合成输入驱动）。
 * 返回 `{ ok, state, problems, rows, struct, walls }`：`ok===true` 只表示**没有问题**，
 *   `state` 才说明它到底判了什么（口径②）。
 */
function coherence(now, base, opts) {
  const o = opts || {};
  const problems = [], rows = [];
  if (!now || typeof now !== 'object') return { ok: false, state: 'no-current', problems: ['no-current-snapshot'], rows: [], struct: [], walls: 'n/a' };
  if (!base || !base.snap) return { ok: true, state: 'first-baseline', problems: [], rows: [], struct: [], walls: 'n/a', note: '无上一版基线可较（首版）；本版快照已生成', baseVer: '' };
  const b = base.snap;
  if (b.v !== 1 || now.v !== 1) problems.push('snapshot-version-mismatch');
  const layersOf = function (s) { return Object.keys((s && s.layers) || {}); };
  const keys = layersOf(now);
  // 结构面（跨机可比，恒判）
  const struct = [];
  layersOf(b).forEach(function (L) { if (keys.indexOf(L) < 0) { struct.push('layer-removed:' + L); problems.push('layer-removed:' + L); } });
  keys.forEach(function (L) { if (layersOf(b).indexOf(L) < 0) struct.push('layer-added:' + L); });
  if (b.cacheCap !== now.cacheCap) { struct.push('cacheCap:' + b.cacheCap + '->' + now.cacheCap); problems.push('cacheCap-changed'); }
  if ((b.faces || []).length !== (now.faces || []).length) { struct.push('faces:' + (b.faces || []).length + '->' + (now.faces || []).length); problems.push('faces-changed'); }
  if ((b.classes || []).length !== (now.classes || []).length) { struct.push('classes:' + (b.classes || []).length + '->' + (now.classes || []).length); }
  // 墙钟面（仅同机）
  let walls = 'not-comparable';
  if (o.sameHost) {
    walls = 'judged';
    keys.forEach(function (L) {
      const t = (b.layers || {})[L], n = now.layers[L];
      if (!t || !n) { rows.push({ layer: L, verdict: 'missing' }); return; }
      const tw = (typeof t.window === 'number' ? t.window : 0), nw = (typeof n.window === 'number' ? n.window : 0);
      // 口径③：任一侧样本不足 ⇒ 不判，如实标 insufficient（不许渲染成 stable）
      if (tw < MIN_SAMPLES || nw < MIN_SAMPLES) { rows.push({ layer: L, verdict: 'insufficient', thenWindow: tw, nowWindow: nw, need: MIN_SAMPLES }); return; }
      const tp = t.p95 || 0, np = n.p95 || 0;
      const ratio = tp > 0 ? Math.round((np / tp) * 1000) / 1000 : 0;
      const regressed = tp > 0 && ratio >= REGRESS_FACTOR;
      rows.push({ layer: L, verdict: regressed ? 'regressed' : (ratio && ratio <= 1 / REGRESS_FACTOR ? 'improved' : 'ok'),
        thenP95: tp, nowP95: np, ratio: ratio, thenWindow: tw, nowWindow: nw });
      if (regressed) problems.push('regressed:' + L + ':' + ratio + 'x');
    });
  } else {
    keys.forEach(function (L) {
      const t = (b.layers || {})[L], n = now.layers[L];
      rows.push({ layer: L, verdict: 'not-comparable', thenP95: (t ? t.p95 : null), nowP95: (n ? n.p95 : null) });
    });
  }
  return { ok: problems.length === 0, state: 'compared', problems: problems, rows: rows, struct: struct,
    walls: walls, baseVer: base.ver, baseSource: base.source || 'worktree',
    sameHost: !!o.sameHost, regressFactor: REGRESS_FACTOR, minSamples: MIN_SAMPLES,
    note: o.sameHost ? '同机比对（含墙钟判定）' : '跨机比对：墙钟不可比，只判结构面（--same-host 才判墙钟）' };
}

/** 现场快照（口径④）：真跑一次采集，让窗口里**真有样本**。 */
function capture(WA, opts) {
  const o = opts || {};
  const PT = (WA && WA.perfTrace) || (global.WorldAxis && global.WorldAxis.perfTrace);
  if (!PT) return { ok: false, reason: 'perf-trace-absent', snap: null };
  try {
    if (o.warm !== false) { if (typeof PT.bench === 'function') PT.bench('short'); if (typeof PT.partial === 'function') PT.partial(); }
    const snap = PT.snapshot('perf-regression-gate');
    return { ok: !!snap, snap: snap };
  } catch (e) { return { ok: false, reason: 'capture-threw:' + String((e && e.message) || e), snap: null }; }
}

/** 门禁读数（供 run.js 打印与专锁断言；这里的 `WA` 由调用方给，缺省取全局）。 */
function discover(opts) {
  const o = opts || {};
  const WA = o.WA || global.WorldAxis;
  const cur = (WA && WA.VERSION) || '';
  const cap = capture(WA, o);
  let base = latestBaseline(cur);
  if (!base) base = gitBaseline(cur, o.rev);
  const v = (cap.snap && cap.snap.layers) ? coherence(cap.snap, base, { sameHost: !!o.sameHost }) : { ok: false, state: 'no-current', problems: ['capture-failed'], rows: [], struct: [], walls: 'n/a' };
  return { version: cur, files: list(), baseline: base ? { ver: base.ver, file: base.file, source: base.source || 'worktree' } : null,
    captured: !!cap.snap, captureReason: cap.reason || '', verdict: v, snap: cap.snap,
    sameHost: !!o.sameHost, states: STATES.slice(), ok: v.ok && STATES.indexOf(v.state) >= 0 };
}
/** 一次性接线文本（run.js 打印用；不落盘、不判据）。 */
function summary(d) {
  const v = d.verdict || {};
  return '性能回归：本版 ' + (d.version || '?') + ' / 基线 ' + (d.baseline ? d.baseline.ver + '（' + d.baseline.source + '）' : '无（首版）')
    + ' · 状态 ' + (v.state || '?') + ' · 结构差 ' + ((v.struct || []).length)
    + ' · 墙钟 ' + (v.walls || 'n/a') + (v.problems && v.problems.length ? ' · 问题：' + v.problems.join(',') : '');
}
/** 生成并落盘本版快照（`node tests/perf-regression-gate.js --write`）。 */
function writeSnapshot(label, WA) {
  const cap = capture(WA || global.WorldAxis, {});
  if (!cap.snap) return { ok: false, reason: cap.reason };
  try { fs.mkdirSync(DIR, { recursive: true }); } catch (e) { /* 已存在 */ }
  const file = path.join(DIR, 'perf-snapshot-' + (cap.snap.version || 'unknown') + '.json');
  fs.writeFileSync(file, JSON.stringify(cap.snap, null, 2) + '\n', 'utf8');
  return { ok: true, file: file, bytes: fs.statSync(file).size };
}

module.exports = {
  DIR: DIR, REGRESS_FACTOR: REGRESS_FACTOR, MIN_SAMPLES: MIN_SAMPLES, STATES: STATES,
  versionOf: versionOf, cmpVer: cmpVer, list: list, readJSON: readJSON,
  latestBaseline: latestBaseline, gitBaseline: gitBaseline,
  coherence: coherence, capture: capture, discover: discover, summary: summary, writeSnapshot: writeSnapshot
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  require('./mock.js');
  const LOAD = (function () {
    const src = fs.readFileSync(path.join(BASE, 'tests', 'run.js'), 'utf8');
    const li = src.indexOf('const LOAD = ['), lj = src.indexOf('];', li);
    return require('vm').runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
  })();
  const vm = require('vm');
  const ctx = vm.createContext(global);
  LOAD.forEach(function (rel) { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); });
  if (argv.indexOf('--write') >= 0) {
    const r = writeSnapshot('manual');
    console.log(r.ok ? ('快照已写入 ' + r.file + '（' + r.bytes + ' 字节）') : ('写入失败：' + r.reason));
    process.exit(r.ok ? 0 : 1);
  }
  const d = discover({ sameHost: argv.indexOf('--same-host') >= 0 });
  console.log(summary(d));
  console.log(JSON.stringify({ baseline: d.baseline, verdict: d.verdict }, null, 2));
  process.exit(d.ok ? 0 : 1);
}
