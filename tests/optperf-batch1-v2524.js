#!/usr/bin/env node
// WorldAxis tests/optperf-batch1-v2524.js -- V29 优化线 Z1（OPV29-01～06）专锁
//
// 治的病
//   回归只有一条路径、只用一个核；改一个文件不知道该跑什么；隔离器整树照抄；
//   首帧装载多少条边没人数过；首屏多少控件没人量过；八道门禁各花多久没一处记。
//
// 本锁钉住六段（每段都带负控制）：
//   A 分片并行：分片**不重不漏**；有逐节耗时就给墙钟估计；没读数就**不编**；汇总任何一片非零即非零。
//   B 增量选面：文档改动给零；改了可执行面没人提 ⇒ 点名；驼峰化反查不能漏。
//   C 瘦身：候选才排；被测试提到的**拒排**；产品面**拒排**；目标到不了就如实说。
//   D 装载边：条数数得清；非路径字面量不得混进来；惰性候选必须带 caveat。
//   E 首屏：静态面不许冒充首屏读数；给了逐页读数才判预算；声明页≠渲染页两个都在场。
//   F 门禁时长：未知门禁名拒收；负耗时拒收；读数可复算；超预算点名。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
function eq(a, b, name) { return ok(a === b, name, { got: a, want: b }); }

const ROOT = path.join(__dirname, '..');
const shard = require('../tools/shard-runner.js');
const impact = require('../tools/impact-select.js');
const slim = require('../tools/mirror-slim.js');
const loadb = require('../tools/load-budget.js');
const fsb = require('../tools/first-screen-budget.js');
const gt = require('../tools/gate-timing.js');

// ── A：OPV29-01 分片并行回归 ──
const table = [
  { name: 's1', selfContained: true }, { name: 's2', selfContained: true },
  { name: 's3', selfContained: true }, { name: 's4', selfContained: true },
  { name: 's5', selfContained: true }, { name: 's6', selfContained: true },
  { name: 's7', selfContained: true }, { name: 's8', selfContained: true },
  { name: 'shared-a', selfContained: false }, { name: 'shared-b', selfContained: false }
];
const tmap = {};
for (let i = 1; i <= 8; i += 1) tmap['s' + i] = 1000;
const p4 = shard.plan({ table: table, workers: 4, timing: tmap });
eq(p4.coverage.missing.length, 0, 'A1 分片不重不漏（无漏装）', p4.coverage);
eq(p4.coverage.duplicate.length, 0, 'A1b 分片不重不漏（无重复）', p4.coverage);
eq(p4.coverage.covered, 8, 'A2 可独跑 8 节全进分片');
eq(p4.coverage.nonSelectable, 2, 'A3 共享上下文 2 节**不进**分片（如实计数）');
eq(p4.proves, 'selectable-subset', 'A4 永不宣称整仓全绿');
ok(p4.estWallMs * 2 <= p4.serialMs, 'A5 有逐节耗时时：估计墙钟降到串行的一半以下（计划指标）', { serial: p4.serialMs, wall: p4.estWallMs });
eq(p4.estSource, 'measured', 'A6 估计来源标得清');
const pNo = shard.plan({ table: table, workers: 4, timing: {} });
eq(pNo.estWallMs, null, 'A7 没有逐节耗时 ⇒ 不给墙钟估计（不编数字）');
eq(pNo.estSource, 'count', 'A7b 而是标 count');
const a1 = shard.aggregate([{ id: 1, code: 0 }, { id: 2, code: 0 }], p4);
eq(a1.verdict, 'incomplete', 'A8 有分片缺席 ⇒ incomplete（不是 passed）');
const rowsOk = p4.shards.map(function (s) { return { id: s.id, code: 0 }; });
eq(shard.aggregate(rowsOk, p4).verdict, 'passed', 'A9 全片 0 ⇒ passed');
const rowsRed = rowsOk.map(function (r, i) { return i === 0 ? { id: r.id, code: 1 } : r; });
eq(shard.aggregate(rowsRed, p4).verdict, 'failed', 'A10 **任一片非零即整体非零**（负控制）');
const rowsRef = rowsOk.map(function (r, i) { return i === 1 ? { id: r.id, code: 3 } : r; });
eq(shard.aggregate(rowsRef, p4).verdict, 'refused', 'A11 分片拒收 ⇒ refused');
const badPlan = shard.plan({ table: [{ name: 'only', selfContained: true }], workers: 4, timing: { only: 10 } });
badPlan.usable = false;
eq(shard.aggregate([{ id: 1, code: 0 }], badPlan).verdict, 'bad-plan', 'A12 计划本身就错 ⇒ bad-plan，不当跑完');
const t1 = shard.timings('  片 1 · 3 节\n  ⏱ 12.34s  ← engines/x\n  ⏱ 0.50s  ← y  ⚠ 超 60s');
eq(t1['engines/x'], 12340, 'A13 耗时行解析成毫秒', t1);
eq(t1.y, 500, 'A14 带 ⚠ 的行只认节名，附注不混进名字', t1);
eq(t1['超 60s'], undefined, 'A14b 附注不得单独变成一个节名', Object.keys(t1));
const live = shard.sectionTable();
ok(live.length > 100, 'A15 现场节表拿得到', live.length);
ok(shard.selectableOf(live).length > 0, 'A16 现场有可独跑节');

// ── B：OPV29-02 增量选面 ──
const texts = [{ rel: 'tests/foo-lock.js', text: 'const F = WA.fooBar; // engines/foo-bar.js' }];
eq(impact.select({ changed: ['docs/x.md', 'plans/y.md'], texts: texts }).verdict, 'doc-only', 'B1 只改文档 ⇒ doc-only');
eq(impact.select({ changed: ['docs/x.md'], texts: texts }).related.length, 0, 'B1b 只改文档 ⇒ 0 相关测试（否定判据）');
const b2 = impact.select({ changed: ['engines/foo-bar.js'], texts: texts });
eq(b2.verdict, 'covered', 'B2 有测试提到 ⇒ covered');
ok(b2.related.indexOf('tests/foo-lock.js') >= 0, 'B2b 反查命中那个锁', b2.related);
eq(impact.classify('engines/foo-bar.js'), 'engine', 'B3 分类 engine');
eq(impact.classify('docs/a.md'), 'doc', 'B3b 分类 doc');
const b4 = impact.select({ changed: ['engines/nobody.js'], texts: texts });
eq(b4.verdict, 'uncovered-change', 'B4 **改了可执行面却无人提及 ⇒ 点名**（负控制）');
ok(b4.uncovered.indexOf('engines/nobody.js') >= 0, 'B4b uncovered 里点了名');
eq(b4.related.length, 0, 'B4c 不编假命中');
eq(impact.select({ changed: [], texts: texts }).verdict, 'no-change', 'B5 没改动 ⇒ no-change');
ok(impact.needles('engines/foo-bar.js').indexOf('fooBar') >= 0, 'B6 连字符名驼峰化后才能反查到', impact.needles('engines/foo-bar.js'));
ok(impact.consumersOf('engines/foo-bar.js', texts).length === 1, 'B6b 驼峰型命中计一次');
const bc = impact.changedFiles(ROOT);
ok(bc.ok, 'B7 现场改动面取得到');
const b8 = impact.select({ root: ROOT, changed: bc.files });
ok(['covered', 'uncovered-change', 'doc-only', 'no-change'].indexOf(b8.verdict) >= 0, 'B8 现场结论在四态内', b8.verdict);
eq(typeof b8.bounds.related, 'string', 'B9 下界/上界口径随读数一起给');

// ── C：OPV29-03 隔离器瘦身 ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-slim-'));
function w(rel, text) {
  const p = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
w('tests/product-files.js', 'exports.productFiles = function () { return ["engines/keep.js"]; };');
w('tests/a-lock.js', 'const x = 1;');
w('engines/keep.js', '// engine');
w('plans/evidence/run.log', 'x'.repeat(2000));
w('plans/evidence/noted.log', 'y'.repeat(1000));
w('docs/guide.md', 'doc');
w('tests/b-lock.js', 'const f = "noted.log";');
const prof = slim.profile({ root: tmp });
const exRels = prof.exclude.map(function (e) { return e.rel; });
ok(exRels.indexOf('plans/evidence/run.log') >= 0, 'C1 没人提到的历史日志可排', exRels);
ok(exRels.indexOf('plans/evidence/noted.log') < 0, 'C2 **被测试提到的拒排**（负控制）', exRels);
ok(prof.skipped.some(function (s) { return s.rel === 'plans/evidence/noted.log' && /referenced/.test(s.why); }), 'C2b 拒排理由带证据', prof.skipped);
ok(exRels.indexOf('engines/keep.js') < 0, 'C3 产品面一个字节都不排');
eq(exRels.indexOf('docs/guide.md'), -1, 'C4 文档不是候选（doc-gate 要读）');
ok(prof.saved > 0 && prof.sizeAfter < prof.sizeBefore, 'C5 省下的字节数得出来', { before: prof.sizeBefore, after: prof.sizeAfter });
ok(prof.savedPct > 0, 'C5b 百分比得出来', prof.savedPct);
eq(prof.targetBytes, 20 * 1024 * 1024, 'C6 目标值钉在 20M');
eq(prof.targetReached, prof.sizeAfter <= prof.targetBytes, 'C6a 达成与否按本次实测算（小树能达成也算对）');
const liveP = slim.profile({ root: ROOT });
eq(liveP.targetReached, false, 'C6b **现场到不了就如实说**（不凑目标去排 tests/）');
ok(!!liveP.whyNotTarget, 'C6c 并给原因', liveP.whyNotTarget);
eq(typeof slim.exclusionSet(tmp).has, 'function', 'C7 隔离器取用的集合拿得到');
const runnerSrc = fs.readFileSync(path.join(ROOT, 'tests', 'isolated-runner.js'), 'utf8');
ok(runnerSrc.indexOf('mirror-slim') >= 0, 'C8 隔离器**真的**接线了（不是只写了个工具）');
ok(/WA_SLIM/.test(runnerSrc), 'C9 有显式关闭开关（可复现旧现场）');
fs.rmSync(tmp, { recursive: true, force: true });

// ── D：OPV29-04 装载边预算 ──
const de = loadb.edges({ root: ROOT });
ok(de.ok, 'D1 装载边读得出来');
ok(de.total > 400, 'D2 现场边数在手', de.total);
eq(de.unique <= de.total, true, 'D3 去重数不超过总数');
ok(de.byDir.engines > 0, 'D3b 按目录分布有 engines', de.byDir);
eq(de.missing.length, 0, 'D4 **非路径字面量不得混进来**（盘上无缺项）', de.missing);
ok(loadb.loadOrder("const LOAD_ORDER = ['a.js', 'needs-real-device'];\n];").length === 1, 'D4b 只收 .js 项');
const dupE = loadb.edges({ list: ['x.js', 'x.js', 'y.js'] });
eq(dupE.duplicates.length, 1, 'D5 重复项点得出名', dupE.duplicates);
eq(loadb.edges({ list: ['engines/__nope__.js'] }).missing.length, 1, 'D6 缺项点得出名');
const dc = loadb.deferCandidates({ root: ROOT });
ok(dc.ok, 'D7 惰性候选算得出');
eq(dc.evidence, 'static-refs', 'D8 证据类型标得清');
ok(/≠ 零运行期依赖/.test(dc.caveat), 'D9 **候选不是批准**（caveat 必须随行）', dc.caveat);
const dc2 = loadb.check({ edges: { ok: true, total: 600, duplicates: [], missing: [] }, budget: 520 });
eq(dc2.over, true, 'D10 超预算点名（负控制）');
eq(dc2.headroom, -80, 'D10b 差额算得出');
const dc3 = loadb.check({ edges: de });
eq(typeof dc3.over, 'boolean', 'D11 现场预算判得出来', dc3.reading);

// ── E：OPV29-05 首屏预算 ──
const ep = fsb.pages(ROOT);
ok(ep.ok && ep.ids.length > 10, 'E1 页 id 解析得到', ep.ids.length);
eq(ep.ids[0], 'overview', 'E2 首屏是 overview');
const epp = fsb.playerPages(ROOT);
ok(epp.ok && epp.ids.length >= 5, 'E3 玩家页解析得到', epp.ids.length);
const ec = fsb.controls(ROOT);
ok(ec.total > 500 && ec.distinct > 100, 'E4 控件静态计数得出来', ec);
const e0 = fsb.check({ pages: ep, playerPages: epp, controls: ec, measured: null });
eq(e0.attributable, false, 'E5 **静态面不得冒充首屏读数**（负控制）');
eq(e0.firstScreenControls, null, 'E5b 未量就不给首屏数');
ok(!!e0.note, 'E5c 并说清为什么没有');
const fake = { ok: true, pages: [{ page: 'overview', bytes: 100, controls: 46 }, { page: 'people', bytes: 200, controls: 567 }], totalControls: 613 };
const e1 = fsb.check({ pages: ep, playerPages: epp, controls: ec, measured: fake, budget: 40 });
eq(e1.firstScreenControls, 46, 'E6 逐页读数按页归到首屏');
eq(e1.over, true, 'E6b 超预算点名（负控制）');
eq(e1.renderedPages, 2, 'E7 渲染页数与声明页数两个都在场');
ok(e1.pages > e1.renderedPages, 'E7b 声明 49 / 渲染 2 不混成一个数', { declared: e1.pages, rendered: e1.renderedPages });

// ── F：OPV29-06 门禁时长看板 ──
const cat = gt.catalog();
ok(cat.length >= 8, 'F1 门禁清单来自 gen-gates-doc 的单一真源', cat.length);
ok(cat.every(function (g) { return g.rel && g.budgetMs > 0; }), 'F2 每道带 rel 与预算');
let led = { ver: 1, gates: {} };
eq(gt.recordRow(led, { name: 'no-such-gate', ms: 1 }).why, 'unknown-kind', 'F3 未知门禁名拒收（负控制）');
eq(gt.recordRow(led, { name: cat[0].name, ms: -5 }).why, 'no-reading', 'F4 负耗时拒收（负控制）');
eq(gt.recordRow(led, { name: cat[0].name, ms: NaN }).why, 'no-reading', 'F4b 非数拒收');
ok(gt.recordRow(led, { name: cat[0].name, ms: 99999, rc: 0 }).ok, 'F5 正常读数记进去');
const rep = gt.report(led, {});
ok(rep.overBudget.indexOf(cat[0].name) >= 0, 'F6 **超预算点名**', rep.overBudget);
eq(rep.gates[0].samples, 1, 'F7 样本数');
eq(rep.unmeasured.length, cat.length - 1, 'F8 没读数的门禁全被点名', rep.unmeasured.length);
for (let i = 0; i < 60; i += 1) gt.recordRow(led, { name: cat[1].name, ms: 10 });
ok(gt.report(led, {}).gates[1].samples === 48, 'F9 每道封顶 48 条（先进先出）', gt.report(led, {}).gates[1].samples);
const rc = gt.recompute('export-contract', 'ns= 12 members= 34 chars= 56');
eq(rc.ok, true, 'F10 读数可复算');
eq(rc.readings.length, 3, 'F10b 复算出三个读数', rc.readings);
eq(gt.recompute('export-contract', '没这行').why, 'no-reading', 'F11 抠不出就读不出（不编）');
eq(gt.recompute('nope', 'x').why, 'unknown-kind', 'F11b 未知门禁名拒收');
const live2 = gt.report(gt.load(ROOT), {});
eq(live2.gates.length, cat.length, 'F12 现场账本读得出（哪怕全是未量）');
ok(live2.sumsNote.indexOf('下界') >= 0, 'F13 合计只当下界（口径随读数）');

if (fail) {
  console.log('FAIL ' + fail + ' / ' + (pass + fail));
  fails.slice(0, 25).forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('PASS ' + pass + '/' + pass + ' (optperf-batch1-v2524)');
