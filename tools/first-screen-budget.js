#!/usr/bin/env node
/**
 * WorldAxis tools/first-screen-budget.js (v2.524.0) — OPV29-05 首屏预算
 *
 * ── 它治什么（本版现场）────────────────────────────────
 *   面板有几十页、上千个控件，但**只有一页是首屏**。而“首屏要渲染多少”此前没有任何读数：
 *   既没人说得清页数，也没人说得清“打开面板那一瞬”到底建了多少东西。
 *   没有读数，“只渲染可见页”就只能是一句口号。
 *
 * ── 两种读数，分得很清 ──────────────────────────────────
 *   ① **静态**（默认、零风险）：页 id 列表与全部控件 id 计数。真源是 `ui/panel.js` 的
 *      `PAGES` / `PLAYER_PAGES` 字面量（与面板实际渲染的是同一份，不另写一份表）。
 *   ② **运行期**（`--measure`）：借 `tests/ui-gate-sync.js` 的迷你 DOM 逐页点一次，
 *      量出“每页多少控件”。只有它能回答“首屏 vs 其它页”的分布；静态面回答不了，
 *      故静态读数一律标 `attributable:false`，不许被读成“首屏就这么多”。
 *
 * ── 边界 ──────────────────────────────────────────────
 *   · 本工具**不改**渲染路径。首屏只渲染可见页是产品改动，必须由全套回归背书；
 *     本工具先把读数与预算钉下来，使那一步改动有前后可比。
 *   · `PAGES` 解析靠字面量形态（`{ id: 'x'`）。形态变了就如实报 `unparsed`，
 *     不猜、不给半个名单。
 *
 * ── 用法 ───────────────────────────────────────────────
 *   node tools/first-screen-budget.js             # 静态读数
 *   node tools/first-screen-budget.js --measure    # 逐页真量（慢，起迷你 DOM）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

function panelText(root) { return fs.readFileSync(path.join(root || BASE, 'ui', 'panel.js'), 'utf8'); }

/** 页 id：`PAGES` 字面量里每个 `{ id: 'x'` 或 `{ id: "x"`。 */
function pages(root) {
  const src = panelText(root);
  const start = src.indexOf('const PAGES = [');
  if (start < 0) return { ok: false, why: 'unparsed', ids: [] };
  const end = src.indexOf('\n  ];', start);
  if (end < 0) return { ok: false, why: 'unparsed', ids: [] };
  const body = src.slice(start, end);
  const ids = [];
  const re = /\{[^{}]*?id:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(body))) ids.push(m[1]);
  return { ok: ids.length > 0, why: ids.length ? null : 'unparsed', ids: ids };
}

/** 玩家页（首屏候选集合）：`PLAYER_PAGES` 数组字面量。 */
function playerPages(root) {
  const src = panelText(root);
  const m = /const PLAYER_PAGES = \[([^\]]*)\]/.exec(src);
  if (!m) return { ok: false, why: 'unparsed', ids: [] };
  const ids = [];
  const re = /'([^']+)'/g;
  let x;
  while ((x = re.exec(m[1]))) ids.push(x[1]);
  return { ok: ids.length > 0, why: ids.length ? null : 'unparsed', ids: ids };
}

/** 静态控件计数：ui/ 下所有 `id="x"` 的出现次数与去重数。 */
function controls(root) {
  const dirs = [path.join(root || BASE, 'ui'), path.join(root || BASE, 'ui', 'pages')];
  let total = 0;
  const seen = Object.create(null);
  dirs.forEach(function (d) {
    let names = [];
    try { names = fs.readdirSync(d); } catch (e) { return; }
    names.filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
      let t = '';
      try { t = fs.readFileSync(path.join(d, f), 'utf8'); } catch (e) { return; }
      const re = /\sid="([A-Za-z0-9_-]+)"/g;
      let m;
      while ((m = re.exec(t))) { total += 1; seen[m[1]] = (seen[m[1]] || 0) + 1; }
    });
  });
  return { total: total, distinct: Object.keys(seen).length };
}

/** 运行期逐页量：借 ui-gate-sync 的迷你 DOM。拿不到就如实报失败理由（不编分布）。 */
function measure() {
  const gate = require(path.join(BASE, 'tests', 'ui-gate-sync.js'));
  const env = gate.fresh();
  if (!env || !env.WA) return { ok: false, why: 'no-env', pages: [] };
  const countFn = function (html) {
    const re = /<(button|input|select|textarea)\b/g;
    let n = 0;
    while (re.exec(html)) n += 1;
    return n;
  };
  const r = gate.checkPages(env, countFn);
  const rows = (r.details || []).map(function (d) {
    const m = /^([^:]+):(\d+)B\/(\d+)控件$/.exec(String(d));
    return m ? { page: m[1], bytes: Number(m[2]), controls: Number(m[3]) } : { page: String(d), bytes: null, controls: null };
  });
  const total = rows.reduce(function (a, x) { return a + (x.controls || 0); }, 0);
  return { ok: rows.length > 0, why: rows.length ? null : 'no-details', pages: rows, totalControls: total, failures: r.failures || [] };
}

/** 预算裁定：首屏=第一页（未给 measure 时不得装出“首屏读数”）。 */
function check(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const p = o.pages || pages(root);
  const pp = o.playerPages || playerPages(root);
  const c = o.controls || controls(root);
  const m = o.measured || null;
  const budget = Number(o.budget) || 1600;
  const firstScreen = (pp.ok && pp.ids.length) ? pp.ids[0] : (p.ok ? p.ids[0] : null);
  let firstScreenControls = null, over = false;
  if (m && m.ok) {
    const row = m.pages.filter(function (x) { return x.page === firstScreen; })[0];
    firstScreenControls = row ? row.controls : null;
    over = firstScreenControls != null && firstScreenControls > budget;
  }
  return {
    known: p.ok,
    pages: p.ids.length,
    playerPages: pp.ids.length,
    firstScreen: firstScreen,
    controlsTotal: c.total,
    controlsDistinct: c.distinct,
    firstScreenControls: firstScreenControls,
    // 声明页数 ≠ 逐页真量到的页数：有的页在当前模式下不亮（PLAYER_PAGES 过滤）。
    //   两个数都在场，读的人不必猜「34 是哪个 34」。
    renderedPages: (m && m.ok) ? m.pages.length : null,
    measuredControls: (m && m.ok) ? m.totalControls : null,
    attributable: !!(m && m.ok),
    budget: budget,
    over: over,
    // 静态面只能给总数；把总数当首屏数是最常见的读错，故这里显式标出。
    note: (m && m.ok) ? null : '未逐页量（--measure）：静态面给不出“首屏多少控件”'
  };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.indexOf('--json') >= 0;
  const doMeasure = argv.indexOf('--measure') >= 0;
  const m = doMeasure ? measure() : null;
  const r = check({ measured: m });
  if (asJson) { console.log(JSON.stringify({ check: r, measured: m }, null, 2)); return; }
  console.log('■ 页：' + r.pages + '（玩家页 ' + r.playerPages + '，首屏候选 ' + r.firstScreen + '）');
  console.log('■ 控件：静态 ' + r.controlsTotal + ' 处 / ' + r.controlsDistinct + ' 个 id');
  if (m && m.ok) {
    console.log('■ 逐页实测（' + m.pages.length + ' 页，合计 ' + m.totalControls + ' 控件）：');
    m.pages.slice(0, 6).forEach(function (x) { console.log('  ' + x.page + ' · ' + x.controls + ' 控件 / ' + x.bytes + 'B'); });
    console.log('■ 首屏（' + r.firstScreen + '）：' + r.firstScreenControls + ' 控件 / 预算 ' + r.budget + (r.over ? '  ⚠ 超' : '  ✓ 未超'));
  } else {
    console.log('■ 逐页实测：未做 —— ' + r.note);
  }
}

module.exports = { pages: pages, playerPages: playerPages, controls: controls, measure: measure, check: check };
if (require.main === module) main();
