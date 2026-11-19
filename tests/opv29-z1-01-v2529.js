'use strict';
// WorldAxis tests/opv29-z1-01-v2529.js — OPV29-01 锁级分片并行（v2.82.0 单节 792s → 264s）
//
// ── 为什么先做「锁级分片」而不是「按节分片」（现场量出来的）─────────────
// 按 `tools/test-layers.js` 的可独跑归属表算 Amdahl：整趟 1780.7s 里可并行面只有
// 17 节 / 73.9s / **4.1%** ⇒ N=4 片理想加速 **1.03×**，验收要的「≥50%」碰不到。
// 真正的时间在共享上下文节里，其中 `v2.82.0 checkpoints …` 单节 **792.2s = 44.5%**。
// 它内部是 38 把锁**顺序**挂载 —— 锁级并行才是那条有收益的路。
//
// ── 本版现场读数 ──────────────────────────────────────────────────
//   38 把锁：36 把可独立（真判据）、2 把必须留串行：
//     · tests/b6-b7-v2870.js ⇒ FAIL 1/38（`[B7-F] 清空题材连自己开的机制一并收回（实收回 0 个）`）
//     · tests/state-repair-v2108.js ⇒ 崩（`… reading 'store'` @:89，全局 store 由共享宿主给）
//   8 路并行墙钟 **263.6s**（三次 244 / 244 / 263.6）对 792.2s ⇒ 省 **66.7%**。
//   判据三口径：回灌行 2714 + 串行 37 = 2751；与共享世界 2843 差 92（节内内联 assert 未搬走）。
//
// ── 三条不许的假绿（本项全部踩过）─────────────────────────────────
//   ① `node tests/x.js` 返回 0 **不等于判了**：38 把里 11 把没有 `require.main` 块，
//      独立跑会装载引擎、零判据、rc=0。故一律经 `tools/lock-child.js`，拿不到
//      `pass (N)` / `FAIL a/b` 就报 `no-criteria`（红）。
//   ② 回灌**少于** assert 计数 ⇒ 真丢判据（红）；回灌**多于** ⇒ 本仓有 10 把锁
//      自己 console.log('✓') 一遍再经 assert 一遍（双重打印），**不是**丢判据，但要可见。
//      首版把两边写成 `!==` ⇒ 假红 10 条（FAIL 10/2724），已改。
//   ③ 账本必须与该节在 run.js 里的**实际挂载清单**一致，否则「并行方案」与「真跑的节」漂移。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SL = require(path.join(ROOT, 'tools/shard-locks.js'));
let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
const root = ROOT;

// ── A 账本与读数 ─────────────────────────────────────────────────
function runA() {
  const led = SL.loadLedger(root);
  a(!!led && led.ver === 1, 'A1 账本存在且 ver === 1', led ? 'ver=' + led.ver : 'missing');
  const g = led && led.groups && Object.keys(led.groups)[0];
  const it = g ? led.groups[g] : null;
  a(!!it, 'A2 账本有一组（' + (g || '无') + '）');
  if (!it) return;
  a(it.sharedMs === 792224, 'A3 共享世界该节耗时 = 792.2s（现场 ⏱ 读数）', String(it.sharedMs));
  const saved = (it.sharedMs - it.parallelMs) / it.sharedMs;
  a(it.parallelMs > 0 && saved >= 0.5,
    'A4 并行实测省时 ≥50%（' + (saved * 100).toFixed(1) + '%，' + it.sharedMs + 'ms → ' + it.parallelMs + 'ms）');
  a(it.parallel.length + it.serial.length === 38, 'A5 账本覆盖 38 把锁（并行 ' + it.parallel.length + ' + 串行 ' + it.serial.length + '）');
  const files = it.parallel.map(function (x) { return x.file; }).concat(it.serial.map(function (x) { return x.file; }));
  a(new Set(files).size === files.length, 'A6 并行/串行互斥（无一把同时在两边）', String(files.length));
  const zero = it.parallel.filter(function (x) { return !(x.criteria > 0); }).map(function (x) { return x.file; });
  a(zero.length === 0, 'A7 并行段每把都有判据（空转锁不许进并行段；零判据：' + (zero.join(',') || '无') + '）');
  const whyBad = it.serial.filter(function (x) { return !/FAIL|崩|额外方法|前置/.test(String(x.why)); }).map(function (x) { return x.file; });
  a(it.serial.length === 4 && whyBad.length === 0,
    'A8 串行段每把都带现场证据（' + it.serial.length + ' 把 · 无凭据：' + (whyBad.join(',') || '无') + '）');
  a(it.parallelCriteria === 2019 && it.parallelPrintedRows === 2661 && it.serialCriteria === 91,
    'A9 三口径读数入账（assert ' + it.parallelCriteria + ' / 行 ' + it.parallelPrintedRows + ' / 串行 ' + it.serialCriteria + '）');
  a(it.sharedCriteria - (it.parallelPrintedRows + it.serialCriteria) === it.inSectionInlineCriteria,
    'A10 差额可解释：' + it.sharedCriteria + ' − (' + it.parallelPrintedRows + ' + ' + it.serialCriteria + ') = '
      + it.inSectionInlineCriteria + ' 条节内内联判据（未搬走）');
  // 账本 vs run.js 实际挂载面（防「方案与真跑的节」漂移）：两种形态都要认 ——
  //   并行段：`const __V82_PARALLEL = [ './x.js', … ]` 里的字面量；
  //   串行段：`runLock('./x.js', …)` / `require('./x.js').m(…)` 的调用。
  const src = fs.readFileSync(path.join(root, 'tests/run.js'), 'utf8');
  const lines = src.split('\n');
  const begin = lines.findIndex(function (l) { return l.indexOf("section('v2.82.0 checkpoints") >= 0; });
  let end = lines.length;
  for (let i = begin + 1; i < lines.length; i++) { if (/^\s*section\('/.test(lines[i])) { end = i; break; } }
  const span = begin < 0 ? '' : lines.slice(begin, end).join('\n');
  const arrStart = span.indexOf('const __V82_PARALLEL = [');
  const arrEnd = arrStart < 0 ? -1 : span.indexOf('];', arrStart);
  const arrText = arrStart >= 0 && arrEnd > arrStart ? span.slice(arrStart, arrEnd) : '';
  const inArray = new Set();
  const reArr = /'\.\/([A-Za-z0-9._-]+\.js)'/g;
  let m;
  while ((m = reArr.exec(arrText)) !== null) inArray.add(m[1]);
  const inCalls = new Set();
  const re = /runLock\('\.\/([A-Za-z0-9._-]+\.js)'|require\('\.\/([A-Za-z0-9._-]+\.js)'\)\./g;
  while ((m = re.exec(span)) !== null) inCalls.add(m[1] || m[2]);
  const missingP = it.parallel.map(function (x) { return x.file; }).filter(function (f) { return !inArray.has(f); });
  const extraP = Array.from(inArray).filter(function (f) { return it.parallel.every(function (x) { return x.file !== f; }); });
  const missingS = it.serial.map(function (x) { return x.file; }).filter(function (f) { return !inCalls.has(f); });
  const extraS = Array.from(inCalls).filter(function (f) { return it.serial.every(function (x) { return x.file !== f; }); });
  a(begin >= 0 && inArray.size > 0 && missingP.length === 0 && extraP.length === 0,
    'A11 并行段：run.js 的 __V82_PARALLEL 与账本 parallel 严格一致（漏 ' + missingP.length + ' / 多 ' + extraP.length + '）',
    'run.js 数组里 ' + inArray.size + ' 把');
  a(missingS.length === 0 && extraS.length === 0,
    'A12 串行段：run.js 的 runLock/require 调用与账本 serial 严格一致（漏 ' + missingS.length + ' / 多 ' + extraS.length + '）',
    '调用面 ' + Array.from(inCalls).join(','));
  // A14（v2.529.0 事故固化）：串行理由必须带**实测数字证据**，不许只写“依赖顺序”。
  //   来源：切换那轮把 render-pre-v2108 挪进并行段，当场出现两条红 —— 它自己的 aWire 锚点
  //   （要求 run.js 里恰 1 次真挂载行）变 0，下游 v2870 的 [B7-F] 实收回 0 个（应 1）。
  //   两条都是“宿主内前置被搬到子进程”的后果；仅在 why 里写“顺序依赖”防不住下次重犯。
  const whyNum = it.serial.filter(function (x) {
    const w = String(x.why || '');
    return !(/\d/.test(w) && /实|实测|rc=|条|FAIL|行/.test(w));
  }).map(function (x) { return x.file; });
  a(whyNum.length === 0,
    'A14 串行段每把的 why 都带现场读数（无数字证据：' + (whyNum.join(',') || '无') + '）');
  a(/rc=0\s*≠\s*判了|rc=0 不等于判了/.test(String(led.note || '')),
    'A13 账本 note 写明「rc=0 不等于判了」这条教训');
}

// ── B 回灌解析（纯函数，不给假绿开口子）──────────────────────────
function runB() {
  const p1 = SL.parseChild('  ✓ a\n  ✓ b\n  ✓ c\n  ✗ d\nLOCK-CHILD ./x.js: pass (4)', 0);
  a(p1.rows.length === 4 && p1.reported === 4 && p1.kind === 'ok' && p1.rows[3].ok === false,
    'B1 逐条解析：3✓1✗ + pass(4) ⇒ rows 4 / reported 4', JSON.stringify([p1.rows.length, p1.reported]));
  const p2 = SL.parseChild('  ✓ a\n  ✗ b — why\nLOCK-CHILD ./x.js: FAIL 1/2', 1);
  a(p2.failReported === 1 && p2.reported === 2 && p2.rows.length === 2,
    'B2 FAIL a/b ⇒ failReported/reported 都取到', JSON.stringify([p2.failReported, p2.reported]));
  a(SL.parseChild('LOCK-CHILD ./x.js: no-criteria（入口是空转的，不算通过）', 3).kind === 'no-criteria',
    'B3 零判据 ⇒ no-criteria（空转不算通过）');
  a(SL.parseChild('LOCK-CHILD crashed: TypeError: x', 2).kind === 'crashed', 'B4 崩溃 ⇒ crashed（与判据红分开）');
  a(SL.parseChild('随便一行输出', 2).kind === 'crashed', 'B5 即使没有 crashed 字样，rc=2 也判 crashed（靠 rc 兜底）');
  a(SL.parseChild('随便一行输出', 3).kind === 'no-criteria', 'B6 rc=3 也判 no-criteria（靠 rc 兜底）');
  a(SL.parseChild('  ✓ a\nLOCK-CHILD ./x.js: pass (2)', 0).reported === 2, 'B7 自报数与行数不等时两者都保留（交给回灌判方向）');
}

// ── C 真跑两把（证明「顺序依赖」与「真判据」都是现场事实）─────────
function runC() {
  const led = SL.loadLedger(root);
  const it = led.groups[Object.keys(led.groups)[0]];
  // C1：b6-b7 独立跑必须真红（顺序依赖是真的）
  const b6 = SL.runOne('b6-b7-v2870.js', { timeoutMs: 300000 });
  a(b6.rc === 1 && b6.failReported >= 1 && b6.kind === 'ok',
    'C1 串行锁 b6-b7 独立跑真红（rc=' + b6.rc + ' · 红 ' + b6.failReported + '/' + b6.reported + '）');
  // C2：state-repair 独立跑必须崩（不是「碰巧没判」）
  const sr = SL.runOne('state-repair-v2108.js', { timeoutMs: 300000 });
  a(sr.rc === 2 && sr.kind === 'crashed', 'C2 串行锁 state-repair 独立跑真崩（rc=' + sr.rc + ' · ' + sr.kind + '）');
  // C3：并行段里挑一把便宜的，必须是真判据
  const cheap = it.parallel.filter(function (x) { return x.criteria > 0 && /canon-deviation/.test(x.file); })[0]
    || it.parallel.filter(function (x) { return x.criteria > 0; })[0];
  const one = SL.runOne(cheap.file, { timeoutMs: 600000 });
  a(one.kind === 'ok' && one.reported > 0 && one.rows.length > 0,
    'C3 并行段抽一把真跑有判据（' + cheap.file + ' · ' + one.reported + ' 条 · rows ' + one.rows.length + '）');
}

// ── D 防复发（静态钉住三条教训与两处装配）────────────────────────
function runD() {
  const toolSrc = fs.readFileSync(path.join(root, 'tools/shard-locks.js'), 'utf8');
  const childSrc = fs.readFileSync(path.join(root, 'tools/lock-child.js'), 'utf8');
  a(toolSrc.indexOf('lock-child.js') >= 0, 'D1 并行器只经 lock-child 起子进程（不许绕回 node tests/x.js）');
  a(toolSrc.indexOf('rows.length < p.reported') >= 0, 'D2 丢判据方向：回灌 < 自报 ⇒ 红（rows.length < reported）');
  a(toolSrc.indexOf('rows.length > p.reported') >= 0 && toolSrc.indexOf('rows.length !== p.reported') < 0,
    'D3 双重打印方向：只可见不判红，且不许回退成 `!==`（首版假红 10 条的形态）');
  a(/no-criteria/.test(childSrc) && /crashed/.test(childSrc) && /missing-method/.test(childSrc),
    'D4 子进程入口把三类病分开报（no-criteria / crashed / missing-method）');
  const r = cp.spawnSync(process.execPath, [path.join(root, 'tools/shard-locks.js'), '--check'],
    { cwd: root, encoding: 'utf8', timeout: 300000 });
  a(r.status === 0 && /账本与现场一致/.test((r.stdout || '') + (r.stderr || '')),
    'D5 --check 通过（账本里的锁都真实存在）', 'rc=' + r.status);
}

runA();
runB();
runC();
runD();
console.log('\nOPV29-Z1-01-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) {
  fails.forEach(function (f) { console.log(' · ' + f); });
  process.exitCode = 1;
}