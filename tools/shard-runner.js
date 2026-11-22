#!/usr/bin/env node
/**
 * WorldAxis tools/shard-runner.js (v2.524.0) — OPV29-01 分片并行回归
 *
 * ── 它治什么（本版现场）───────────────────────────────────────────────
 *   回归只有一条路径：`tests/run.js` 在隔离树里从第 1 节串到第 442 节，整趟以十分钟计。
 *   机器有 4 个核，却只有 1 个核在干活 —— 这不是「慢一点」，是**把墙钟当成不可压缩的成本**：
 *   想验证一条改动也得等整趟。
 *
 * ── 口径（否定式，先说不做什么）──────────────────────────────────────
 *   ① **只并行「可独跑」的节**。真源是 `tools/test-layers.js` 的 `selfContained` —— 那张表
 *      已经回答过「这一节能不能单独跑」，本工具**不另写一份判据**（同一件事两处判据
 *      必然漂移，v2.187.0 已吃过这个亏）。声明为共享上下文的节**不装进任何分片**，
 *      而是列进 `coverage.nonSelectable` 并让整趟结论带 `proves:'selectable-subset'`。
 *      于是本工具**永不**输出「整仓全绿」这种话 —— 它证明的是选中的那个子集。
 *   ② **装箱不是承诺**。分片耗时取决于每节的真实耗时：有读数（回归日志里的
 *      `⏱ 12.34s  ← 节名` 行，正是 `tests/run.js` `section()` 打印的形态）就按毫秒做 LPT
 *      贪心；没有读数就按节数装，并如实标 `estSource:'count'`。
 *   ③ **并行不是免费**。每个分片都要让 `tools/isolated-run.js` 独立复制一棵候选树
 *      （复制成本见 OPV29-03），故分片数不是越多越好：`workers` 上限是 CPU 数，
 *      下限是 1（= 串行，此时本工具等价于 `--only-v-section` 全选，没有收益也没有风险）。
 *   ④ **汇总是判据，不是求和**：任一分片非零就整体非零；任一分片缺席、节被漏装、
 *      分片之间重叠，都算**配置错**（`bad-plan`），绝不当「跑完了」。
 *
 * ── 用法 ────────────────────────────────────────────────────────────
 *   node tools/shard-runner.js --dry --workers=4 [--timing=<回归日志>]   # 只出计划与估计
 *   node tools/shard-runner.js --run --workers=4                        # 真跑（起 N 个隔离器）
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');

/** 逐节耗时读数。形态与 `tests/run.js` 的 `section()` 打印逐字对齐（两空格 + ⏱ + 秒 + 两空格 + ←）。 */
function timings(text) {
  const out = {};
  String(text == null ? '' : text).split('\n').forEach(function (l) {
    const m = /^ {2}⏱ ([\d.]+)s {2}← (.+?)( {2}⚠.*)?$/.exec(l);
    if (!m) return;
    const ms = Math.round(Number(m[1]) * 1000);
    if (Number.isFinite(ms) && ms >= 0) out[m[2].trim()] = ms;
  });
  return out;
}
function readTiming(p) {
  try { return timings(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

/** 现场节表：真源是 test-layers 的 analyze()（与 `--only-v-section` 用的是同一张表）。 */
function sectionTable() {
  const m = require('./test-layers.js').analyze();
  return (m.sections || []).map(function (s) {
    return { name: String(s.name), selfContained: !!s.selfContained, shared: (s.shared || []).slice() };
  });
}
function selectableOf(table) {
  return table.filter(function (s) { return s.selfContained; }).map(function (s) { return s.name; });
}

/**
 * LPT 贪心装箱：耗时降序逐节放进当前最轻的分片。
 *   · 有读数 → 装毫秒；没读数 → 装节数（此时 `estSource:'count'`，`estWallMs` 为 null，不编耗时）。
 *   · 空分片不保留：`workers` 大于节数时如实减到节数。
 */
function pack(names, workers, tmap) {
  const w = Math.max(1, Math.min(Number(workers) || 1, names.length || 1));
  const ms = {};
  let measured = 0;
  names.forEach(function (n) {
    if (tmap && Number.isFinite(tmap[n])) { ms[n] = tmap[n]; measured += 1; }
  });
  const full = measured === names.length && names.length > 0;
  const cost = function (n) { return full ? ms[n] : 1; };
  const order = names.slice().sort(function (a, b) { return (cost(b) - cost(a)) || (a < b ? -1 : a > b ? 1 : 0); });
  const shards = [];
  for (let i = 0; i < w; i += 1) shards.push({ id: i + 1, sections: [], load: 0 });
  order.forEach(function (n) {
    let pick = shards[0];
    for (let i = 1; i < shards.length; i += 1) if (shards[i].load < pick.load) pick = shards[i];
    pick.sections.push(n); pick.load += cost(n);
  });
  return {
    shards: shards.filter(function (s) { return s.sections.length; }).map(function (s) {
      s.sections.sort();
      return { id: s.id, sections: s.sections, count: s.sections.length };
    }),
    estSource: full ? 'measured' : 'count'
  };
}

/** 计划：分片 + 覆盖 + 估计。**不启动任何进程**。 */
function plan(opts) {
  const o = opts || {};
  const table = o.table || sectionTable();
  const sel = o.names || selectableOf(table);
  const tmap = o.timing || {};
  const packed = pack(sel, o.workers, tmap);
  const covered = [];
  packed.shards.forEach(function (s) { covered.push.apply(covered, s.sections); });
  const want = sel.slice().sort();
  const got = covered.slice().sort();
  const dups = got.filter(function (n, i) { return i && n === got[i - 1]; });
  const missing = want.filter(function (n) { return got.indexOf(n) < 0; });
  const measured = packed.estSource === 'measured';
  let serialMs = null, estWallMs = null;
  if (measured) {
    serialMs = sel.reduce(function (a, n) { return a + (Number.isFinite(tmap[n]) ? tmap[n] : 0); }, 0);
    const loads = packed.shards.map(function (s) {
      return s.sections.reduce(function (a, n) { return a + (Number.isFinite(tmap[n]) ? tmap[n] : 0); }, 0);
    });
    estWallMs = loads.length ? Math.max.apply(null, loads) : 0;
  }
  return {
    workers: packed.shards.length,
    workersAsked: Number(o.workers) || 1,
    estSource: packed.estSource,
    serialMs: serialMs, estWallMs: estWallMs,
    speedup: (serialMs && estWallMs) ? Number((serialMs / estWallMs).toFixed(2)) : null,
    shards: packed.shards,
    coverage: {
      selectable: sel.length,
      covered: got.length,
      missing: missing, duplicate: dups,
      nonSelectable: table.filter(function (s) { return !s.selfContained; }).length
    },
    proves: 'selectable-subset',
    // 说清楚它**不**证明什么：共享上下文的节没进分片，整仓全绿仍由串行全量负责。
    notProven: ['共享上下文的节（coverage.nonSelectable 条）未被本趟覆盖', '分片并行不改变任何一节的判据，只改变它们的墙钟'],
    usable: !missing.length && !dups.length && got.length === want.length
  };
}

/** 汇总：判据式，不是求和式。 */
function aggregate(rows, p) {
  const rs = rows || [];
  const bad = rs.filter(function (r) { return r.code !== 0; });
  const refused = rs.filter(function (r) { return r.code === 3; });
  const missingShard = p && p.shards ? p.shards.filter(function (s) {
    return !rs.some(function (r) { return r.id === s.id; });
  }) : [];
  const verdict = (p && p.usable === false) ? 'bad-plan'
    : (missingShard.length || rs.length === 0) ? 'incomplete'
      : refused.length ? 'refused'
        : bad.length ? 'failed' : 'passed';
  return {
    verdict: verdict,
    shards: rs.length, expected: p && p.shards ? p.shards.length : null,
    reds: bad.map(function (r) { return { id: r.id, code: r.code, why: r.why || null }; }),
    missingShard: missingShard.map(function (s) { return s.id; }),
    proves: 'selectable-subset'
  };
}

/** 真跑：每个分片一个隔离器（一条 `--only-v-section` 一条节，可重复）。 */
function execute(p) {
  if (!p.usable) return { rows: [], refused: 'bad-plan' };
  const rows = [];
  p.shards.forEach(function (s) {
    const args = [path.join(BASE, 'tools/isolated-run.js')];
    s.sections.forEach(function (n) { args.push('--only-v-section', n); });
    const r = cp.spawnSync(process.execPath, args, { cwd: BASE, stdio: ['ignore', 'inherit', 'inherit'] });
    rows.push({ id: s.id, code: r.status == null ? 1 : r.status, signal: r.signal || null, why: r.status == null ? 'no-exit-code' : null });
  });
  return { rows: rows };
}

function main() {
  const argv = process.argv.slice(2);
  let workers = Math.max(1, Math.min(4, os.cpus().length || 1));
  let timing = null, run = false, asJson = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].indexOf('--workers=') === 0) workers = Number(argv[i].slice(10)) || workers;
    else if (argv[i].indexOf('--timing=') === 0) timing = argv[i].slice(9);
    else if (argv[i] === '--run') run = true;
    else if (argv[i] === '--dry') run = false;
    else if (argv[i] === '--json') asJson = true;
    else { console.error('未知参数：' + argv[i]); return 3; }
  }
  const p = plan({ workers: workers, timing: timing ? readTiming(timing) : {} });
  if (!p.usable) { console.error('bad-plan：' + JSON.stringify(p.coverage)); return 3; }
  if (!asJson) {
    console.log('■ 分片计划：' + p.workers + ' 片 / ' + p.coverage.covered + ' 节（可独跑 ' + p.coverage.selectable
      + '，共享上下文 ' + p.coverage.nonSelectable + ' 不进分片）');
    p.shards.forEach(function (s) { console.log('  片 ' + s.id + ' · ' + s.count + ' 节'); });
    if (p.estWallMs) console.log('■ 估计：串行 ' + (p.serialMs / 1000).toFixed(1) + 's → 分片 ' + (p.estWallMs / 1000).toFixed(1) + 's（x' + p.speedup + '，来源 measured）');
    else console.log('■ 估计：estSource=count —— 没有逐节耗时读数，故不给墙钟估计（不编数字）');
  }
  if (!run) { if (asJson) console.log(JSON.stringify(p, null, 2)); return 0; }
  const out = execute(p);
  if (out.refused) { console.error('拒收：' + out.refused); return 3; }
  const a = aggregate(out.rows, p);
  console.log('■ 汇总：' + a.verdict + '（' + a.shards + '/' + a.expected + ' 片）');
  if (a.reds.length) console.log('■ 红星：' + JSON.stringify(a.reds));
  if (asJson) console.log(JSON.stringify(a, null, 2));
  return a.verdict === 'passed' ? 0 : 3;
}

module.exports = {
  timings: timings, readTiming: readTiming, sectionTable: sectionTable, selectableOf: selectableOf,
  pack: pack, plan: plan, aggregate: aggregate, execute: execute
};
if (require.main === module) process.exitCode = main();
