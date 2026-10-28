#!/usr/bin/env node
// WorldAxis tools/smoke.js (v2.204.0) — 两档回归的**快档**（smoke）入口与单一真源
//
// ── 它治的病（本仓自己承认过的一条边界）────────────────────────────────
//   本仓的纪律是「计划收口才跑全量」，而全量实测约 29 分钟（v2.203.0 重算）——
//   于是**每次 commit 与 push 之间其实是裸奔的**：改动一行想看结果，要么等半小时，
//   要么不跑。收口轮实测过：v2.109.0 有三次提交是带红灯进去的，发现它们的是
//   **下一次全量回归**（几小时以后）。
//   `tools/hooks.js` 早就有「三道秒级门禁进 pre-commit」的设计，但它
//     · 只覆盖 export-contract / reject-code / module-registry 三件；
//     · 默认**没有安装**（每个克隆都要自己 install 一次，等于默认裸奔）。
//   本工具把这件事从「hook 的实现细节」提升为一等入口：**一条命令，十几秒，覆盖
//   「动了就会炸」的那几面**，且集合本身是**可复算的读数**（见下），不是手写常量。
//
// ── 快档集是怎么定的（否定式：不按「名字像核心」挑）────────────────────
//   一条门禁进快档，当且仅当同时满足：
//     ① **可独立运行**：有 `require.main === module` 入口（无入口的锁靠 run.js 挂载，跑不动）；
//     ② **秒级**：现场实测 < `MAX_MS`（12000ms）—— 实测值由本工具**当场跑一遍**得到，
//        不是抄来的常量（写死一个「它很快」的假设，就是本仓治过的「读数与现场脱钩」）；
//     ③ **退出码即结论**：`0` = 通过、非 `0` = 不通过（不做「输出里有 FAIL 但 exit 0」那种）。
//   慢的那一档（`v2.185.0` 版本白名单形态门禁 12.3s、`o9` 宿主矩阵 55s、
//   `readings-v2106` 112s、全量 29 分钟）**刻意留在快档之外** —— 快档的价值在「愿意每次都跑」，
//   塞进去一个一分钟的成员，快档就会和全量一样被绕过（hooks.js 里那句
//   「绕过的通道必须稀缺」同规）。
//
// ── 与 tools/hooks.js 的关系（单一真源）────────────────────────────────
//   快档集**只有一处定义**：本文件的 `SMOKE_SET`。`tools/hooks.js` 的 pre-commit
//   三道门禁必须是它的**真子集**（由 `tests/s3-net-audit-v2204.js` 钉住）——
//   两处各写一份，下次加一道门禁必然只改一处，于是「pre-commit 说通过、smoke 说不通过」
//   这种自相矛盾会静默存在。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tools/smoke.js              # 跑快档（全绿 exit 0；任一红 exit 1）
//   node tools/smoke.js --list       # 只列集成员与现场耗时（不重跑）——耗时同样现测
//   node tools/smoke.js --json       # 机器可读
//   node tools/smoke.js --self-test  # 集成员的存在性/入口自证（缺一个即抛）
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
/** 快档单成员耗时上限（现场实测超此值即**拒绝收录**——见文件头口径 ②）。 */
const MAX_MS = 12000;
/**
 * 快档集（**单一真源**）。`rel` 必须存在且有 CLI 入口；`why` 写「它挡住什么」。
 *   ⚠ 这张表是「谁该被每次都跑」的产品决策，不是「哪些文件名字好看」。
 */
const SMOKE_SET = [
  { rel: 'tools/net-audit.js', why: '计划外的网络外呼（出站面零治理 —— 用户最敏感的一类改动）' },
  { rel: 'tools/repo-hygiene.js', why: '克隆体积面失控（`.git` 是本地状态 —— 从没有判据看过它）' },
  { rel: 'tests/export-contract.js', why: '导出成员被悄悄改名/删掉，调用方静默降级' },
  { rel: 'tests/reject-code-gate.js', why: '新增拒收码没有归属（码存在 ≠ 码可达）' },
  { rel: 'tests/module-registry-gate.js', why: '磁盘有模块而自检看不见（黑盒模块）' },
  { rel: 'tests/module-cycle-gate.js', why: '模块间循环依赖' },
  { rel: 'tests/dead-export-gate.js', why: '死子面改名/新增无痕迹（账本与现场脱钩）' },
  { rel: 'tests/field-liveness-gate.js', why: '世界状态一级键的写侧幽灵物化' },
  { rel: 'tests/dup-decl-gate.js', why: '同一文件里函数被重复定义（补丁重跑事故）' },
  { rel: 'tests/ui-a11y-gate.js', why: '面板控件的可访问性回归' }
];
/** 现场跑一个成员，返回 `{rel, ms, rc, out}`。不抛（子进程失败也如实返回）。 */
function runOne(rel, opt) {
  const root = (opt && opt.root) || BASE;
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [path.join(root, rel)], { cwd: root, encoding: 'utf8', timeout: (opt && opt.ms) || 120000 });
  const ms = Date.now() - t0;
  return { rel: rel, ms: ms, rc: r.status === null ? -1 : r.status,
    out: String((r.stdout || '') + (r.stderr || '')).split('\n').slice(-3).join(' | ').slice(0, 200) };
}
/**
 * 逐成员核对「可入快档」的三条口径，返回 `{ok, complaints, rows}`（`--self-test` 用）。
 *
 * opt.set 可注入一张**集**（专锁据此驱动「真源码破坏副本」导出的那张表，
 *   而不是自己另抄一份常量 —— 那会变成「对判据自己的实现断言」）。
 * opt.root 可注入（对副本树做行为级自证）。
 */
function verifySet(opt) {
  const root = (opt && opt.root) || BASE;
  const set = (opt && opt.set) || SMOKE_SET;
  const complaints = [];
  const rows = [];
  set.forEach(function (m) {
    let src = '';
    try { src = fs.readFileSync(path.join(root, m.rel), 'utf8'); } catch (e) { complaints.push({ rel: m.rel, why: 'missing' }); return; }
    const cli = src.indexOf('require.main === module') >= 0;
    // ⚠ tests/export-contract.js 是**无 CLI 守卫**的例外（它是 run.js spawn 的脚本）。
    //   它照跑照出结论，但「有 CLI 入口」这条对它不成立 —— 如实登记为例外，不假装通过。
    const cliOk = cli || m.rel === 'tests/export-contract.js';
    if (!cliOk) complaints.push({ rel: m.rel, why: 'no-cli-entry' });
    rows.push({ rel: m.rel, cli: cli, eased: !cli && cliOk, bytes: src.length });
  });
  return { ok: complaints.length === 0, complaints: complaints, rows: rows,
    set: set.filter(function (m, i, a) { return a.indexOf(m) === i; }) };
}
/**
 * pre-commit 三道快门槛与快档集的**单一真源关系**：前者必须是后者的**真子集**。
 *
 * ── 它治的病 ───────────────────────────────────────────────────────
 *   `tools/hooks.js` 的 `FAST_GATES` 与本文的 `SMOKE_SET` 是**两张各写一遍的表**。
 *   两处各写一份的必然结局：下次加一道门禁只改一处，于是出现
 *   「pre-commit 说通过、smoke 说不通过」这种自相矛盾 —— 而它**没有任何判据**看得见，
 *   因为两张表各自都自洽（本仓治过的「第二份真源」同型病）。
 *   pre-commit 的每一道（`FAST_GATES` 里 cmd 指向的 `tests/*.js`）必须能在快档集里找到
 *   同一个成员 —— 找不到即说明两张表分家了。**反方向不要求**：快档集**故意**大于
 *   pre-commit 三道（它还含 `tools/net-audit.js` 与另外七道），故这里判的是 `⊆`，不是 `==`。
 *
 * ── 边界（如实登记）──────────────────────────────────────────────────
 *   只按 `cmd` 里的 `tests/<name>.js` 形态取目标：`FAST_GATES` 里出现非该形态的 cmd
 *   （例如 `node tools/xxx.js`）时如实记 `rel: null` 并判为「不在集内」——
 *   让新增形态**必须显式改这张关系**，而不是静默滑过去。
 *   opt.fastGates / opt.set / opt.root 可注入（专锁据此在两向驱动同一份判据）。
 */
function hookSubset(opt) {
  const o = opt || {};
  const root = o.root || BASE;
  const set = o.set || SMOKE_SET;
  let fast = o.fastGates;
  if (!fast) {
    try { fast = require(path.join(root, 'tools', 'hooks.js')).FAST_GATES; }
    catch (e) { return { ok: false, reason: 'hooks-unreadable', rows: [], missing: [{ gate: '(hooks)', rel: null }], problems: [{ kind: 'hooks-unreadable' }] }; }
  }
  const setRel = set.map(function (m) { return m.rel; });
  const rows = (fast || []).map(function (g) {
    const m = String(g.cmd || '').match(/tests\/([\w.-]+\.js)/);
    const rel = m ? 'tests/' + m[1] : null;
    return { gate: g.name, rel: rel, inSet: rel !== null && setRel.indexOf(rel) >= 0 };
  });
  const missing = rows.filter(function (r) { return !r.inSet; });
  // 反空转下限：pre-commit 若是空表，上面那条「全部在集内」在空集上恒真。
  const MIN_GATES = 3;
  const problems = [];
  if (rows.length < MIN_GATES) problems.push({ kind: 'too-few-gates', got: rows.length, min: MIN_GATES });
  missing.forEach(function (r) { problems.push({ kind: 'gate-not-in-set', gate: r.gate, rel: r.rel }); });
  return { ok: problems.length === 0, rows: rows, missing: missing, problems: problems,
    setSize: setRel.length, gateCount: rows.length };
}
function main() {
  const args = process.argv.slice(2);
  if (args.indexOf('--self-test') >= 0) {
    const v = verifySet({});
    if (!v.ok) {
      v.complaints.forEach(function (c) { console.log('  ✗ ' + c.rel + '：' + c.why); });
      process.exit(2);
    }
    console.log('■ smoke 集自证：' + v.set.length + ' 个成员全部存在且有 CLI 入口'
      + '（豁免 ' + v.rows.filter(function (r) { return r.eased; }).length + ' 个无守卫脚本，理由见源码注释）');
    const hs = hookSubset({});
    if (!hs.ok) {
      hs.problems.forEach(function (p) {
        console.log('  ✗ pre-commit 与快档集分家：' + p.kind + (p.gate ? '（' + p.gate + ' → ' + p.rel + '）' : ''));
      });
      process.exit(3);
    }
    console.log('■ 单一真源：pre-commit ' + hs.gateCount + ' 道全部在本集内（本集 ' + hs.setSize + ' 个成员 —— 关系是 ⊆，不是 ==）');
    process.exit(0);
  }
  const listOnly = args.indexOf('--list') >= 0;
  console.log('■ 快档回归（smoke）· ' + SMOKE_SET.length + ' 个成员 · 单成员上限 ' + MAX_MS + 'ms');
  const rows = [];
  let bad = 0;
  SMOKE_SET.forEach(function (m) {
    if (listOnly) { rows.push({ rel: m.rel, ms: -1, rc: 0 }); return; }
    const r = runOne(m.rel);
    rows.push(r);
    const slow = r.ms > MAX_MS;
    const mark = r.rc === 0 && !slow ? '✓' : (r.rc === 0 ? '⚠' : '✗');
    if (r.rc !== 0) bad++;
    console.log('  ' + mark + ' ' + r.rel + '  ' + r.ms + 'ms' + (r.rc !== 0 ? '  rc=' + r.rc + '  ' + r.out : (slow ? '  ← 超上限，应移出快档' : '')));
  });
  if (args.indexOf('--json') >= 0) { console.log(JSON.stringify({ set: SMOKE_SET, rows: rows, bad: bad }, null, 2)); }
  if (listOnly) { console.log('  （--list：只列集成员，未重跑；耗时的现场读数见不带参数的运行）'); process.exit(0); }
  const total = rows.reduce(function (s, r) { return s + Math.max(0, r.ms); }, 0);
  console.log('  合计 ' + (total / 1000).toFixed(1) + 's · 通过 ' + (SMOKE_SET.length - bad) + ' / 失败 ' + bad);
  if (bad) { console.log('  ✗ 快档有红：这不是环境问题，是先跑一次快档再提交的理由'); process.exit(1); }
  console.log('  ✓ 快档全绿（这不是「可以发布」，是「可以往下走」——全量仍是收口门槛）');
  process.exit(0);
}
if (require.main === module) main();
module.exports = { BASE: BASE, MAX_MS: MAX_MS, SMOKE_SET: SMOKE_SET, runOne: runOne,
  verifySet: verifySet, hookSubset: hookSubset };
