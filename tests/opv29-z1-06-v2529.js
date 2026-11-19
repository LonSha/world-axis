'use strict';
// WorldAxis tests/opv29-z1-06-v2529.js — OPV29-06 门禁时长看板
//
// ── 病 ────────────────────────────────────────────────────────────
// 八道契约门禁各跑各的、各打印各的，**没有任何一处记它们各花多久**。
// 于是「哪道门在拖时间」只能靠整趟回归的 `⏱` 行去猜；而 OPV29-07～12 要拆段，
// 拆之前最需要的恰恰是这条读数 —— 不知道慢在哪里就动手，必然拆错地方。
//
// ── 本版现场读数（2026-11-19 真跑，全记在 tests/gate-timing.json）─────
//   export-contract       823ms   inventory            1912ms
//   test-surface-gate    2976ms   reject-code-gate     7481ms
//   module-registry-gate  636ms   module-cycle-gate    1302ms
//   dead-export-gate     4409ms   readings-v2106     85975ms（慢门禁）
//   七道快门禁合计 19.5s；**readings-v2106 一道 86.0s，是其余七道之和的 4.4 倍**。
//   这就是本项要暴露的事实：整趟贵在「一道慢门」，不在「七道快门的数量」。
//
// ── 本锁守什么 ────────────────────────────────────────────────────
// A 真实读数：账本里每道都有读数、字段完整、合计可独立重算、最慢那道可点名。
// B 可复算：同一份原始输出 + 同一正则 ⇒ 同一组读数；**无匹配必须是 no-reading**，
//   不许返回空数组冒充「读到了 0」；换掉原文里的数字，读数必须跟着变（证明在真解析）。
// C 点名与拒收（负控制，全在合成账本上做，不碰真账本）：
//   空账本时必须**全列未量**、超预算必须点名、等于预算不算超、未知门禁/负耗时/非数一律拒收、
//   每道最多 48 条先进先出、表外条目单列。
// D 单一真源：清单来自 `gen-gates-doc.GATES`（不另写一份）；预算按 slow 口径分档；rel 都真实存在。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 只看「有没有跑过」——不看读数是否可复算（写死一份 JSON 也能"有读数"）。
// ② 未量写成「很快」——没有读数就是没有读数，必须点名。
// ③ 负控制只删账本文件看红 ——那是缩面，不是破坏判据。
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const GT = require(path.join(ROOT, 'tools/gate-timing.js'));
const GD = require(path.join(ROOT, 'tools/gen-gates-doc.js'));
let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
function fresh() { return { ver: 1, gates: {} }; }

// ── A 真实读数 ───────────────────────────────────────────────────
function runA() {
  const cat = GT.catalog();
  a(cat.length > 0 && cat.length === GD.GATES.length, 'A1 清单单一真源：catalog 数量 === gen-gates-doc.GATES（' + cat.length + '/' + GD.GATES.length + '）');
  a(fs.existsSync(GT.ledgerPath(ROOT)), 'A2 账本文件已生成（tests/gate-timing.json）', GT.ledgerPath(ROOT));
  const led = GT.load(ROOT);
  const rep = GT.report(led, {});
  a(rep.unmeasured.length === 0, 'A3 每道门禁都有读数（未量：' + (rep.unmeasured.join(',') || '无') + '）');
  a(rep.gates.length === cat.length && rep.gates.every(function (g) { return g.measured && g.samples >= 1; }),
    'A4 看板逐道 measured 且 samples ≥1（' + rep.gates.filter(function (g) { return g.measured; }).length + '/' + rep.gates.length + '）');
  const badField = rep.gates.filter(function (g) {
    const e = (led.gates[g.name] || []).slice(-1)[0] || {};
    return !(Number.isInteger(e.ms) && e.ms >= 0) || !(e.rc === null || typeof e.rc === 'number') || !(e.at && !isNaN(Date.parse(e.at)));
  }).map(function (g) { return g.name; });
  a(badField.length === 0, 'A5 每条读数字段完整（ms 非负整数 / rc 数或 null / at 可解析；坏：' + (badField.join(',') || '无') + '）');
  // 合计下界独立重算：逐道取账本**最后一条**的 ms 相加，与 report 的 lastSumMs 比
  const sum = cat.reduce(function (acc, g) {
    const l = led.gates[g.name] || [];
    return acc + (l.length ? l[l.length - 1].ms : 0);
  }, 0);
  a(sum === rep.lastSumMs, 'A6 合计下界可独立重算（逐道末条相加 ' + sum + ' === report ' + rep.lastSumMs + '）');
  // 最慢那道可点名：现场是 readings-v2106（慢门禁），且它单独贵过其余七道之和
  const ranked = rep.gates.slice().sort(function (x, y) { return y.lastMs - x.lastMs; });
  const top = ranked[0], rest = ranked.slice(1).reduce(function (x, g) { return x + g.lastMs; }, 0);
  a(top && top.name === 'readings-v2106' && top.lastMs > rest,
    'A7 超时门禁可点名（最慢 ' + (top && top.name) + ' ' + (top && top.lastMs) + 'ms > 其余七道之和 ' + rest + 'ms）');
}

// ── B 可复算 ─────────────────────────────────────────────────────
function runB() {
  const g = GD.GATES.filter(function (x) { return x.name === 'inventory'; })[0];
  const r1 = GT.recompute('inventory', '■ 产品文件 562 个（冻结面）');
  a(r1.ok && r1.readings && r1.readings[0] === 562, 'B1 同正则+同原文 ⇒ 读数 562', JSON.stringify(r1.readings));
  const r2 = GT.recompute('inventory', '■ 产品文件 563 个（冻结面）');
  a(r2.ok && r2.readings && r2.readings[0] === 563 && r2.readings[0] !== r1.readings[0],
    'B2 换掉原文里的数字，读数跟着变（证明在真解析，不是返回常量）', JSON.stringify(r2.readings));
  const r3 = GT.recompute('test-surface-gate', '测试文件面 604 · 锁 544 · 可达 602');
  a(r3.ok && JSON.stringify(r3.readings) === '[604,544,602]', 'B3 多组捕获按序返回', JSON.stringify(r3.readings));
  const r4 = GT.recompute('inventory', '完全没有读数的一行');
  a(r4.ok === false && r4.why === 'no-reading' && r4.readings === null,
    'B4 无匹配 ⇒ no-reading 且 readings=null（不许拿空数组冒充「0」）', JSON.stringify(r4));
  const r5 = GT.recompute('no-such-gate-zz', '产品文件 1 个');
  a(r5.ok === false && r5.why === 'unknown-kind', 'B5 未知名 ⇒ unknown-kind', JSON.stringify(r5));
  a(!!g && g.re instanceof RegExp, 'B6 正则来自清单（同一份 re，不另写一份解析）');
}

// ── C 点名与拒收（合成账本，负控制）─────────────────────────────
function runC() {
  const cat = GT.catalog();
  const empty = GT.report(fresh(), {});
  a(empty.unmeasured.length === cat.length && empty.unmeasured.length === 8,
    'C1 空账本 ⇒ 全列未量（未量不是「没问题」；实 ' + empty.unmeasured.length + '）');

  // 超预算必须点名（slow 门禁预算大，故挑一道快门禁注入）
  const fast = cat.filter(function (g) { return !g.slow; })[0];
  const over = fresh();
  over.gates[fast.name] = [{ ms: fast.budgetMs + 1, rc: 0, at: new Date().toISOString(), readings: null }];
  const repOver = GT.report(over, {});
  a(repOver.overBudget.indexOf(fast.name) >= 0, 'C2 超预算 ⇒ 点名该道（' + fast.name + ' ' + (fast.budgetMs + 1) + 'ms）', JSON.stringify(repOver.overBudget));

  // 等于预算不算超（边界）
  const at = fresh();
  at.gates[fast.name] = [{ ms: fast.budgetMs, rc: 0, at: new Date().toISOString(), readings: null }];
  a(GT.report(at, {}).overBudget.indexOf(fast.name) < 0, 'C3 等于预算不算超（边界 ms === budgetMs）');

  // 表外条目单列，且不污染 gates 计数
  const stray = fresh();
  stray.gates[fast.name] = [{ ms: 1, rc: 0, at: new Date().toISOString(), readings: null }];
  stray.gates['made-up-gate-zz'] = [{ ms: 1, rc: 0, at: new Date().toISOString(), readings: null }];
  const repStray = GT.report(stray, {});
  a(repStray.unknown.indexOf('made-up-gate-zz') >= 0 && repStray.gates.length === cat.length,
    'C4 表外条目单列 unknown（不冒充门禁；gates 仍 ' + repStray.gates.length + '）', JSON.stringify(repStray.unknown));

  // 拒收三类非法记账
  const l = fresh();
  a(GT.recordRow(l, { name: 'not-a-gate-zz', ms: 1 }).why === 'unknown-kind', 'C5 未知门禁名拒收（unknown-kind）');
  a(GT.recordRow(l, { name: fast.name, ms: -1 }).why === 'no-reading', 'C6 负耗时拒收（no-reading）');
  a(GT.recordRow(l, { name: fast.name, ms: 'abc' }).why === 'no-reading', 'C7 非数拒收（no-reading）');
  a(Object.keys(l.gates).length === 0, 'C8 三次拒收后账本一字未写（不是「记了再校验」）', JSON.stringify(Object.keys(l.gates)));

  // 每道最多 48 条，先进先出；丢的必须是最老那条
  const cap = fresh();
  for (let i = 0; i < 49; i++) GT.recordRow(cap, { name: fast.name, ms: i, rc: 0 }, { known: [fast.name] });
  const list = cap.gates[fast.name];
  a(list.length === 48 && list[0].ms === 1 && list[47].ms === 48,
    'C9 每道最多 48 条先进先出（len ' + list.length + ' · 首 ' + list[0].ms + ' · 末 ' + list[47].ms + '）');
}

// ── D 单一真源与预算口径 ─────────────────────────────────────────
function runD() {
  const cat = GT.catalog();
  const missing = cat.filter(function (g) { return !fs.existsSync(path.join(ROOT, g.rel)); }).map(function (g) { return g.rel; });
  a(missing.length === 0 && cat.length === 8, 'D1 八道门禁的 rel 都真实存在（缺：' + (missing.join(',') || '无') + '）');
  const badBudget = cat.filter(function (g) { return g.budgetMs !== (g.slow ? 120000 : 12000); }).map(function (g) { return g.name; });
  a(badBudget.length === 0, 'D2 预算按 slow 口径分档（慢 120000 / 快 12000；坏：' + (badBudget.join(',') || '无') + '）');
  a(GT.load(ROOT).ver === 1, 'D3 账本 ver === 1（结构可演进，但当前只认 1）');
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/gate-timing.js'), '--run', '--gate=no-such-gate-zz'],
    { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  a(r.status === 3 && /unknown-kind/.test((r.stderr || '') + (r.stdout || '')),
    'D4 --run 未知门禁 ⇒ rc=3 且报 unknown-kind（真起子进程）', 'rc=' + r.status);
  const run = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  a(run.indexOf("opv29-z1-06-v2529") >= 0, 'D5 本锁已挂进 tests/run.js（否则它自己不会被跑）');
}

runA();
runB();
runC();
runD();
console.log('\nOPV29-Z1-06-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) {
  fails.forEach(function (f) { console.log(' · ' + f); });
  process.exitCode = 1;
}