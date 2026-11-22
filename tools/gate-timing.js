#!/usr/bin/env node
/**
 * WorldAxis tools/gate-timing.js (v2.524.0) — OPV29-06 门禁时长看板
 *
 * ── 它治什么（本版现场）─────────────────────────────
 *   八道契约门禁各有自己的输出，**没有任何一处记录它们各花多久**。
 *   于是「哪道门禁在拖时间」只能靠整趟回归的 `⏱` 行去猜；
 *   而在动手拆段（OPV29-07～12）之前，最需要的恰恰是这条读数 ——
 *   不知道慢在哪里就拆，必然拆错地方。
 *
 * ── 三条口径 ─────────────────────────────────────────────
 *   ① **清单不另写**：门禁列表与「从哪个正则抠读数」全部来自 `tools/gen-gates-doc.js` 的 `GATES`。
 *      同一件事两处判据必然漂移（本仓 v2.187.0 已吃过一次）。
 *   ② **读数存在账本里、可复算**：每道记 `{name, ms, rc, at, readings}`，每道最多 48 条（先进先出）。
 *      同一份原始输出用同一正则能��算出读数 —— 这就是「可复算」：不是「我看过」，是「再算一遍一样」。
 *   ③ **没读数就点名**：`unmeasured` 列的是「账本里一条也没有」的门禁，
 *      `overBudget` 列的是「最近一次超了预算」的门禁。两者都不允许被当成「没问题」。
 *
 * ── 边界 ────────────────────────────────────────────────
 *   · `ms` 是**本次实测**，不是基准；慢机/冷缓存会系统性偏大，故只比预算与趋势，不比绝对值。
 *   · 预算默认：快门禁 12000ms（对齐 `gen-gates-doc` 的 MAX_MS 口径）、慢门禁 120000ms。
 *   · 本工具不自动跑门禁：不带 `--run` 时只读账本。`--run` 是显式动作（会真起子进程、会写账本）。
 *
 * ── 用法 ────────────────────────────────────────────────
 *   node tools/gate-timing.js                 # 看板（读账本，不跑）
 *   node tools/gate-timing.js --run [--gate=module-cycle-gate]   # 真跑并记账
 *   node tools/gate-timing.js --json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const CAP_PER_GATE = 48;
const BUDGET_FAST = 12000, BUDGET_SLOW = 120000;

function catalog() {
  return require('./gen-gates-doc.js').GATES.map(function (g) {
    return { name: g.name, rel: g.rel, slow: !!g.slow, budgetMs: g.slow ? BUDGET_SLOW : BUDGET_FAST };
  });
}

function ledgerPath(root) { return path.join(root || BASE, 'tests', 'gate-timing.json'); }
function load(root) {
  try {
    const o = JSON.parse(fs.readFileSync(ledgerPath(root), 'utf8'));
    return o && typeof o === 'object' && o.gates ? o : { ver: 1, gates: {} };
  } catch (e) { return { ver: 1, gates: {} }; }
}
function save(root, l) { fs.writeFileSync(ledgerPath(root), JSON.stringify(l, null, 2)); }

/** 记账：未知门禁名拒收（不许拿任意名字往账本里塞数）；负耗时/非数拒收。 */
function recordRow(ledger, row, opts) {
  const l = ledger || { ver: 1, gates: {} };
  const known = (opts && opts.known) || catalog().map(function (g) { return g.name; });
  const name = String((row && row.name) || '');
  if (known.indexOf(name) < 0) return { ok: false, why: 'unknown-kind' };
  const ms = Number(row && row.ms);
  if (!Number.isFinite(ms) || ms < 0) return { ok: false, why: 'no-reading' };
  const ent = { ms: Math.round(ms), rc: Number.isFinite(Number(row.rc)) ? Number(row.rc) : null,
    at: row.at || new Date().toISOString(), readings: row.readings || null };
  const list = l.gates[name] || [];
  list.push(ent);
  while (list.length > CAP_PER_GATE) list.shift();
  l.gates[name] = list;
  return { ok: true, entry: ent };
}

/** 看板：每道一行（最近/最大/均值/返回码/是否超预算），外加三类点名（未量/超预算/表外）。 */
function report(ledger, opts) {
  const o = opts || {};
  const cat = o.catalog || catalog();
  const l = ledger || { ver: 1, gates: {} };
  const gates = cat.map(function (g) {
    const list = (l.gates[g.name] || []);
    const last = list.length ? list[list.length - 1] : null;
    const max = list.reduce(function (a, x) { return Math.max(a, x.ms); }, 0);
    const avg = list.length ? Math.round(list.reduce(function (a, x) { return a + x.ms; }, 0) / list.length) : null;
    return {
      name: g.name, slow: g.slow, budgetMs: g.budgetMs, samples: list.length,
      lastMs: last ? last.ms : null, maxMs: list.length ? max : null, avgMs: avg,
      rc: last ? last.rc : null, at: last ? last.at : null,
      overBudget: last ? last.ms > g.budgetMs : false,
      measured: !!list.length
    };
  });
  const known = cat.map(function (g) { return g.name; });
  return {
    gates: gates,
    unmeasured: gates.filter(function (g) { return !g.measured; }).map(function (g) { return g.name; }),
    overBudget: gates.filter(function (g) { return g.overBudget; }).map(function (g) { return g.name; }),
    unknown: Object.keys(l.gates || {}).filter(function (n) { return known.indexOf(n) < 0; }),
    // 同一轮「最近一次」的合计只能当**下界**：各道是串行跑的，但账本不记轮次。
    lastSumMs: gates.reduce(function (a, g) { return a + (g.lastMs || 0); }, 0),
    sumsNote: '按各道最近一次相加 = 下界（不同轮混加，不含解释器启动与调度开销）'
  };
}

/** 读数可复算：同一份原始输出 + 同一正则 ⇒ 同一组读数。 */
function recompute(name, raw, opts) {
  const cat = (opts && opts.catalog) || catalog();
  const g = require('./gen-gates-doc.js').GATES.filter(function (x) { return x.name === name; })[0];
  if (!g) return { ok: false, why: 'unknown-kind', readings: null };
  const m = g.re ? g.re.exec(String(raw || '')) : null;
  return { ok: !!m, why: m ? null : 'no-reading', readings: m ? m.slice(1).map(Number) : null };
}

/** 真跑一道（或全部）：起子进程取 rc/ms，顺带按正则抽读数。 */
function run(opts) {
  const o = opts || {};
  const cat = catalog();
  const pick = o.gate ? cat.filter(function (g) { return g.name === o.gate; }) : cat.filter(function (g) { return !g.slow || o.includeSlow; });
  if (!pick.length) return { ok: false, why: 'unknown-kind', rows: [] };
  const rows = [];
  pick.forEach(function (g) {
    const t0 = Date.now();
    const r = cp.spawnSync(process.execPath, [path.join(BASE, g.rel)], { cwd: BASE, encoding: 'utf8', timeout: 300000 });
    const ms = Date.now() - t0;
    const raw = (r.stdout || '') + (r.stderr || '');
    const re = recompute(g.name, raw);
    rows.push({ name: g.name, ms: ms, rc: r.status === null ? -1 : r.status, readings: re.readings });
  });
  return { ok: true, rows: rows };
}

function main() {
  const argv = process.argv.slice(2);
  let mode = 'report', gate = null, asJson = false, includeSlow = false;
  argv.forEach(function (a) {
    if (a === '--run') mode = 'run';
    else if (a === '--json') asJson = true;
    else if (a === '--include-slow') includeSlow = true;
    else if (a.indexOf('--gate=') === 0) gate = a.slice(7);
    else { console.error('未知参数：' + a); process.exitCode = 3; }
  });
  if (process.exitCode === 3) return;
  if (mode === 'run') {
    const r = run({ gate: gate, includeSlow: includeSlow });
    if (!r.ok) { console.error('拒收：' + r.why); process.exitCode = 3; return; }
    const l = load(BASE);
    r.rows.forEach(function (row) {
      const w = recordRow(l, row, {});
      if (!w.ok) { console.error('拒收记账：' + row.name + ' ' + w.why); process.exitCode = 3; return; }
      console.log('· ' + row.name + ' ' + row.ms + 'ms rc=' + row.rc + (row.readings ? ' 读数=' + JSON.stringify(row.readings) : ''));
    });
    if (process.exitCode === 3) return;
    save(BASE, l);
  }
  const rep = report(load(BASE), {});
  if (asJson) { console.log(JSON.stringify(rep, null, 2)); return; }
  console.log('■ 门禁时长（账本：tests/gate-timing.json）');
  rep.gates.forEach(function (g) {
    console.log('  ' + (g.measured ? (g.overBudget ? '⚠' : '·') : '?') + ' ' + g.name.padEnd(22)
      + (g.measured ? (g.lastMs + 'ms / 预算 ' + g.budgetMs + 'ms（样本 ' + g.samples + '，最大 ' + g.maxMs + '）') : '未量'));
  });
  if (rep.unmeasured.length) console.log('■ 未量（不是「很快」，是「没读数」）：' + rep.unmeasured.join(', '));
  if (rep.overBudget.length) console.log('■ 超预算：' + rep.overBudget.join(', '));
  if (rep.unknown.length) console.log('■ 表外条目（门禁清单里没有）：' + rep.unknown.join(', '));
  console.log('■ 最近一次合计（下界）：' + (rep.lastSumMs / 1000).toFixed(1) + 's');
}

module.exports = {
  catalog: catalog, ledgerPath: ledgerPath, load: load, save: save,
  recordRow: recordRow, report: report, recompute: recompute, run: run
};
if (require.main === module) main();
