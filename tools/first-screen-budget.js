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

/** 冷开读数：打开面板那一瞬 DOM 里到底建了多少控件（只建可见页 ⇒ 这个数应远小于全量之和）。 */
function coldBoot() {
  let gate = null;
  try { gate = require(path.join(BASE, 'tests', 'ui-gate-sync.js')); } catch (e) { return { ok: false, why: 'no-gate', controls: null, bytes: null }; }
  let env = null;
  try { env = gate.fresh(); } catch (e) { return { ok: false, why: 'boot-threw:' + (e && e.message), controls: null, bytes: null }; }
  if (!env || !env.dom) return { ok: false, why: 'no-dom', controls: null, bytes: null };
  const dom = env.dom;
  const h = String((dom.body && dom.body.innerHTML) || '');
  const n = (h.match(/<(button|input|select|textarea)\b/g) || []).length;
  return { ok: true, why: null, controls: n, bytes: h.length };
}

/**
 * 裁定（C 面）。首屏只渲染可见页这件事，此前只有一句口号，现在有机械判据：
 *   C1 冷开控件 ≥1（切页无白屏的反面：冷开就不能是空白）
 *   C2 冷开控件 ≤ 预算（默认 1600）
 *   C3 冷开控件 ≤ 静态总数 × 0.5 —— 这一条专抓「打开就全建」：全量预建时冷开≈总数，必红
 *   C4 量到首屏时：冷开 ≤ 首屏控件 × 1.5（首屏之外不许顺手把别的页也建出来）
 *   C5 量到逐页时：每页字节 >0（无白屏）且量到页数 ≥30（不许「量了 2 页就说全绿」）
 *   C6 没量就不许报首屏数：attributable 必须为 false（静态面冒充首屏是这里最常见的读错）
 */
function judge(o) {
  const x = o || {};
  const problems = [];
  const cold = x.cold || null;
  const m = x.measured || null;
  const budget = Number(x.budget) || 1600;
  const total = Number(x.controlsTotal) || 0;
  const first = x.firstScreenControls;
  if (!cold || !cold.ok) problems.push('冷开读数拿不到：' + ((cold && cold.why) || 'missing'));
  else {
    if (cold.controls < 1) problems.push('C1 冷开控件 0（打开面板就是空白，切页必白屏）');
    if (cold.controls > budget) problems.push('C2 冷开控件 ' + cold.controls + ' > 预算 ' + budget);
    if (total > 0 && cold.controls > total * 0.5) {
      problems.push('C3 冷开控件 ' + cold.controls + ' > 静态总数 ' + total + ' 的一半（像「打开就全建」）');
    }
  }
  if (m && m.ok) {
    if (cold && cold.ok && first != null && cold.controls > first * 1.5) {
      problems.push('C4 冷开 ' + cold.controls + ' > 首屏 ' + first + ' × 1.5（首屏之外也建了）');
    }
    const blank = m.pages.filter(function (p) { return !(p.bytes > 0); });
    if (blank.length) problems.push('C5 有页渲染 0 字节（白屏）：' + blank.map(function (p) { return p.page; }).join(','));
    if (m.pages.length < 30) problems.push('C5 只量到 ' + m.pages.length + ' 页（<30），不足以说「切页无白屏」');
  } else if (x.expectMeasured) {
    problems.push('C6 要求逐页实测但没量到（--measure）');
  }
  return { problems: problems, ok: problems.length === 0 };
}

/** 预算裁定：首屏=第一页（未给 measure 时不得装出“首屏读数”）。 */
function check(opts) {
  const o = opts || {};
  const root = o.root || BASE;
  const p = o.pages || pages(root);
  const pp = o.playerPages || playerPages(root);
  const c = o.controls || controls(root);
  const m = o.measured || null;
  const cold = o.cold || null;
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
    coldControls: (cold && cold.ok) ? cold.controls : null,
    coldBytes: (cold && cold.ok) ? cold.bytes : null,
    verdict: judge({ cold: cold, measured: m, budget: budget, controlsTotal: c.total, firstScreenControls: firstScreenControls, expectMeasured: !!o.expectMeasured }),
    // 静态面只能给总数；把总数当首屏数是最常见的读错，故这里显式标出。
    note: (m && m.ok) ? null : '未逐页量（--measure）：静态面给不出“首屏多少控件”'
  };
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.indexOf('--json') >= 0;
  const doMeasure = argv.indexOf('--measure') >= 0;
  const doCheck = argv.indexOf('--check') >= 0;
  const m = doMeasure ? measure() : null;
  const cold = (doCheck || argv.indexOf('--cold') >= 0) ? coldBoot() : null;
  const r = check({ measured: m, cold: cold, expectMeasured: !!m });
  if (asJson) { console.log(JSON.stringify({ check: r, measured: m }, null, 2)); process.exitCode = (doCheck && !r.verdict.ok) ? 1 : 0; return; }
  console.log('■ 页：' + r.pages + '（玩家页 ' + r.playerPages + '，首屏候选 ' + r.firstScreen + '）');
  console.log('■ 控件：静态 ' + r.controlsTotal + ' 处 / ' + r.controlsDistinct + ' 个 id');
  if (m && m.ok) {
    console.log('■ 逐页实测（' + m.pages.length + ' 页，合计 ' + m.totalControls + ' 控件）：');
    m.pages.slice(0, 6).forEach(function (x) { console.log('  ' + x.page + ' · ' + x.controls + ' 控件 / ' + x.bytes + 'B'); });
    console.log('■ 首屏（' + r.firstScreen + '）：' + r.firstScreenControls + ' 控件 / 预算 ' + r.budget + (r.over ? '  ⚠ 超' : '  ✓ 未超'));
  } else {
    console.log('■ 逐页实测：未做 —— ' + r.note);
  }
  if (cold) {
    console.log('■ 冷开（打开面板那一瞬）：' + (cold.ok ? cold.controls + ' 控件 / ' + cold.bytes + 'B' : '拿不到（' + cold.why + '）')
      + '｜静态总数 ' + r.controlsTotal + ' 处 ⇒ 冷开占 ' + (r.controlsTotal ? Math.round(cold.controls / r.controlsTotal * 100) : '?') + '%');
  }
  if (doCheck) {
    if (r.verdict.ok) {
      console.log('■ 结论：PASS（冷开 ' + r.coldControls + ' 控件 ≤ 预算 ' + r.budget
        + ' 且 ≤ 静态总数一半' + (m && m.ok ? '；' + m.pages.length + ' 页逐页量到、无白屏' : '；未 --measure：C4/C5 未判') + '）');
      return;
    }
    r.verdict.problems.forEach(function (p) { console.error('✗ ' + p); });
    console.log('■ 结论：FAIL（' + r.verdict.problems.length + ' 项）');
    process.exitCode = 1;
  }
}
module.exports = { pages: pages, playerPages: playerPages, controls: controls, measure: measure, coldBoot: coldBoot, judge: judge, check: check };
if (require.main === module) main();
