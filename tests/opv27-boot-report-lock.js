/**
 * WorldAxis tests/opv27-boot-report-lock.js (v2.523.0)
 * OPV27-1（启动噪音收口）+ OPV27-2（逐台装载耗时面）专锁
 *
 * ── 本锁钉的是什么 ────────────────────────────────────────────────────
 *   ① 182 行「已加载」自述行必须被收口 → 但**只许收这一种形态**：
 *      任何一条普通日志被吞掉，这个降噪就是拿「看不见故障」换来的，必须当场红。
 *   ② 收口掉的**不许丢账**：rel / 自述版本 / 实测耗时都要留在逐台明细里。
 *   ③ `console.log` 必须被还原成**同一个函数引用**（不是功能相同的副本），
 *      否则「我没改坏别人的东西」就只是嘴上说。
 *   ④ 装载面读数（p50 / p95 / TOP 慢 / 一行汇报）要能从 `WA.boot` 与
 *      `perf-baseline.boot()` 两端取到，且无装载时**如实报无**（不编数）。
 *
 * ── 两条真源码负控制（拆掉实现 ⇒ 判据必须现形）───────────────────────
 *   负控制 A：把自述行正则放宽成 `/^\[WorldAxis\]/` ⇒ 普通告警行被当成自述行吞掉；
 *   负控制 B：删掉 `close()` 里的还原赋值 ⇒ console.log 不再是原函数引用。
 *   两条都先验证「干净源码下判据为真」，再验证「拆掉后判据为假」。
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const sync = require('./ui-gate-sync.js');

let passed = 0;
function ok(cond, label) { assert.ok(cond, label); passed += 1; console.log('  \u2713 ' + label); }
function eq(actual, want, label) {
  assert.strictEqual(actual, want, label + '（实 ' + actual + ' / 期 ' + want + '）');
  passed += 1; console.log('  \u2713 ' + label);
}
function rd(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
// 把「从 anchor 起、到该语句分号为止」的整条语句替换为 `;`（跨行语句也不会留孤续行）。
function dropStmt(src, anchor) {
  const i = src.indexOf(anchor);
  if (i < 0) return src;
  let j = i;
  while (j < src.length && src[j] !== ';') j += 1;
  return src.slice(0, i) + ';' + src.slice(j + 1);
}

const __savedLog = console.log;
const BOOT_REL = 'core/boot-report.js';

const { WA } = sync.fresh({});
const br = WA.bootReport;

// ── 0. 现场证据：R1 的前提仍然成立（182 台引擎各打一行自述行）──────────
console.log('\n【OPV27-1】自述行收口');
{
  const dir = path.join(__dirname, '..', 'engines');
  const n = fs.readdirSync(dir).filter(f => f.endsWith('.js'))
    .filter(f => rd('engines/' + f).indexOf('已加载') >= 0).length;
  ok(n >= 180, 'R1 现场前提：engines/ 里带「已加载」自述行的引擎 ' + n + ' 台（≥180）');
  ok(!!br, 'core/boot-report.js 已真装载（WA.bootReport 存在）');
  eq(Object.keys(br).length, 5, '导出面 5 项（与 EXPORT_COUNT 自检一致：只留真被读的口）');
  eq(br.ver, '2.523.0', '模块版本 2.523.0');
}

// ── 1. 只截获自述行；其余原样放行 ──────────────────────────────────────
{
  const sink = [];
  console.log = function () { sink.push(Array.prototype.join.call(arguments, ' ')); };
  const h = br.open({ ver: '2.523.0' });
  console.log('[WorldAxis] engines/pawn-redemption 已加载（2.523.0）');
  console.log('[WorldAxis] engines/night-watch 已加载（2.523.0）');
  console.log('[WorldAxis] 这是一条必须放行的普通行');
  console.log('不带前缀的普通行也必须放行');
  console.log('[WorldAxis] 装载失败 1 个：engines/x.js');
  const closed = br.close();
  console.log = __savedLog;

  eq(closed.quietLines, 2, '截获 2 条自述行');
  eq(closed.selfLines.length, 2, '逐台明细 2 条（收口 ≠ 丢账）');
  eq(closed.selfLines[0].self, 'engines/pawn-redemption', '明细记下 rel');
  eq(closed.selfLines[0].ver, '2.523.0', '明细记下引擎自述版本');
  eq(sink.length, 3, '其余 3 条日志原样到达控制台');
  ok(sink.indexOf('[WorldAxis] 这是一条必须放行的普通行') >= 0, '普通 [WorldAxis] 行未被吞');
  ok(sink.some(s => s.indexOf('装载失败') >= 0), '失败告警未被吞（故障必须可见）');
  ok(br.stat().restores >= 1, 'close() 计数里记到了一次还原');
}

// ── 2. 还原必须是同一个函数引用 ────────────────────────────────────────
{
  const before = console.log;
  br.open({});
  ok(console.log !== before, '开窗期间 console.log 确实被代理');
  br.close();
  ok(console.log === before, 'close() 还原成**同一个函数引用**（不是功能相同的副本）');

  const h1 = br.open({});
  const h2 = br.open({});
  ok(h1 === h2, '重复 open 幂等：返回同一句柄（不叠两层代理）');
  br.close();
  eq(br.close().reason, 'not-open', '未开窗时 close() 如实报 not-open');
}

// ── 3. summarize：分位 / TOP 慢 / 一行汇报 ─────────────────────────────
console.log('\n【OPV27-2】装载面读数');
{
  const rows = [
    { rel: 'core/clock.js', ms: 4, ok: true },
    { rel: 'engines/a.js', ms: 30, ok: true },
    { rel: 'engines/b.js', ms: 2, ok: true },
    { rel: 'engines/c.js', ms: 0, ok: false }
  ];
  const rep = br.summarize(rows, { ver: '2.523.0', quietLines: 2, elapsedMs: 40, total: 4,
    verMap: { 'engines/a.js': '2.523.0' } });
  eq(rep.total, 4, 'total 取自 meta');
  eq(rep.ok, 3, '成功 3 台');
  eq(rep.failed.length, 1, '失败 1 台');
  eq(rep.failed[0], 'engines/c.js', '失败点名到 rel');
  eq(rep.engines, 3, 'engines/ 前缀计数 3 台');
  eq(rep.p50, 4, 'p50 = 4ms');
  eq(rep.p95, 30, 'p95 = 30ms');
  eq(rep.max, 30, 'max = 30ms');
  eq(rep.quietLines, 2, 'quietLines 透传');
  eq(rep.rows()[1].ver, '2.523.0', 'verMap 回填到逐台明细');
  eq(rep.slow(1)[0].rel, 'engines/a.js', 'slow(1) 取最慢那台');
  const txt = rep.report();
  ok(txt.indexOf('已装载 3/4') === 0, '汇报以「已装载 3/4」起头（实 ' + txt.slice(0, 24) + '…）');
  ok(txt.indexOf('（引擎 3）') > 0, '汇报含引擎台数');
  ok(txt.indexOf('慢 TOP3') > 0, '汇报含慢 TOP3');

  const empty = br.summarize([], { total: 0 });
  eq(empty.report().indexOf('慢 TOP3'), -1, '空装载不编造 TOP3');
  eq(empty.p50, 0, '空装载 p50 为 0（不编数）');
}

// ── 4. 两端取数：WA.boot 与 perf-baseline.boot() ───────────────────────
{
  const pb = WA.perfBaseline;
  ok(typeof pb.boot === 'function', 'perf-baseline 暴露 boot 面');
  const none = pb.boot();
  eq(none.ok, false, '无装载读数时如实报 ok:false');
  eq(none.reason, 'no-boot', '原因为 no-boot（不是编一个 0ms 顶上）');
  ok(none.note.indexOf('正确结果') > 0, '空读数的 note 说清「空是正确结果」');

  const had = WA.boot;
  WA.boot = { ver: '2.523.0', total: 3, ok: 3, engines: 2, elapsedMs: 12, p50: 2, p95: 9, max: 9,
    quietLines: 7, failed: [], rows: function () { return [{ rel: 'engines/a.js', ms: 9, ok: true }]; },
    slow: function (n) { return [{ rel: 'engines/a.js', ms: 9, ok: true }].slice(0, n || 10); },
    report: function () { return '已装载 3/3（引擎 2）·失败 0 · 12ms'; } };
  const got = pb.boot();
  eq(got.ok, true, '有装载读数时 ok:true');
  eq(got.rows.length, 1, 'rows 从 WA.boot 转发（不重测）');
  eq(got.top.length, 1, 'top 从 WA.boot 转发');
  eq(got.quietLines, 7, 'quietLines 转发');
  ok(got.report.indexOf('已装载 3/3') === 0, '汇报文本转发');
  if (had === undefined) delete WA.boot; else WA.boot = had;
  eq(pb.boot().ok, false, '恢复后重新如实报无');
}

// ── 5. 接线面：装载序 / init 三处调用（源码级，不靠注释自证）───────────
{
  const idx = rd('index.js');
  const order = idx.slice(idx.indexOf('const LOAD_ORDER = ['), idx.indexOf('];', idx.indexOf('const LOAD_ORDER = [')));
  const rels = order.match(/'[^']+\.js'/g).map(s => s.replace(/'/g, ''));
  eq(rels[0], 'core/clock.js', 'LOAD_ORDER[0] 仍是 core/clock.js');
  eq(rels[rels.indexOf('core/store.js') + 1], 'core/boot-report.js', 'core/boot-report.js 紧跟 core/store.js（registerModule 调用期读 store，提前装会构成供者后装）');
  ok(idx.indexOf('WA.bootReport.open(') > 0, 'init 在装载循环里开窗');
  ok(idx.indexOf('__bootCap.close()') > 0, 'init 在 finally 里关窗');
  ok(idx.indexOf('WA.bootReport.summarize(') > 0, 'init 用同一个合成器出读数');
  ok(idx.indexOf("console.log('[WorldAxis] ' + WA.boot.report())") > 0, '汇报只打一条（复用 report()，不另写一份文案）');
  ok(idx.indexOf('console.error') > 0 && idx.indexOf('装载失败') > 0, '失败仍走 error 级、逐条点名');

  const runSrc = rd('tests/run.js');
  const load = runSrc.slice(runSrc.indexOf('const LOAD = ['), runSrc.indexOf('];', runSrc.indexOf('const LOAD = [')));
  const loadRels = load.match(/'[^']+\.js'/g).map(s => s.replace(/'/g, ''));
  eq(loadRels[0], 'core/clock.js', '测试装载序 LOAD[0] 与产品同序');
  eq(loadRels[loadRels.indexOf('core/store.js') + 1], 'core/boot-report.js', '测试装载序紧跟 store，与产品同序');
}

// ── 6. 负控制 A：放宽正则 ⇒ 普通告警被吞 ──────────────────────────────
console.log('\n【负控制】真源码破坏两向自证');
{
  const src = rd(BOOT_REL);
  const clean = sync.fresh({});
  eq(clean.WA.bootReport.close().reason, 'not-open', '干净源码：未开窗时 close 如实报 not-open');

  // 干净源码下的正样本：普通 [WorldAxis] 行必须放行
  function probe(WAx) {
    const sink = [];
    const keep = console.log;
    console.log = function () { sink.push(Array.prototype.join.call(arguments, ' ')); };
    const h = WAx.bootReport.open({});
    console.log('[WorldAxis] 装载失败 1 个：engines/x.js');
    const c = h.close();
    console.log = keep;
    return { quiet: c.quietLines, sink: sink };
  }
  const good = probe(clean.WA);
  eq(good.quiet, 0, '干净源码：普通 [WorldAxis] 行不计入 quietLines');
  eq(good.sink.length, 1, '干净源码：该行真的到达控制台');

  const LOOSE = 'var SELF_RE = /^\\[WorldAxis\\]/;';
  const brokenSrc = src.replace(/var SELF_RE = \/\^\\\[WorldAxis\\\][^\n]*\n/, LOOSE + '\n');
  ok(brokenSrc !== src, '负控制 A 的锚点真命中（自述行正则被替换）');
  const broken = sync.fresh({ srcOverride: { [BOOT_REL]: brokenSrc } });
  const bad = probe(broken.WA);
  eq(bad.quiet, 1, '拆掉「只匹配自述行」⇒ 普通告警被当成自述行吞掉');
  eq(bad.sink.length, 0, '拆掉后该行到不了控制台（故障被静音）');
  console.log = __savedLog;
}

// ── 7. 负控制 B：删掉还原赋值 ⇒ console.log 不再是原引用 ─────────────
{
  const src = rd(BOOT_REL);
  const brokenSrc = dropStmt(src, 'h.consoleObj.log = h.orig;');
  ok(brokenSrc !== src, '负控制 B 的锚点真命中（还原赋值被替换为 ;）');
  const broken = sync.fresh({ srcOverride: { [BOOT_REL]: brokenSrc } });
  const keep = console.log;
  const hb = broken.WA.bootReport.open({});
  hb.close();
  ok(console.log !== keep, '拆掉还原 ⇒ 关闭后 console.log 仍是代理（不是原引用）');
  console.log = keep;   // 收尾：把宿主控制台装回去（本文件自己不许留污染）
  ok(console.log === keep, '收尾：宿主 console.log 已人工复原');
}

console.log('\n=== OPV27-1/2 专锁全绿：' + passed + ' 项断言 ===');
