#!/usr/bin/env node
'use strict';
/**
 * tools/v7probes/p_closeout_2275.js — 纪律 12 的「合规收口」一键执行器。
 *
 * 为什么需要它：纪律 12 说「18 项交付前不跑 tests/run.js，只跑专锁 + 三道版本门禁
 * + 本体面门禁」。但「只跑哪几条」如果散落在人的记忆里，下一次收口照样会有人
 * 图省事直接 `node tests/run.js`。
 *
 * 【计数口径别混】纪律 12 的「18 项」指 **V7 计划的十八项任务**（OPV7-1～9 + EXV7-1～9），
 *   而本文件的「N 条」指 **收口要跑的命令条目数**。两者不是同一个数：条目会随每版
 *   新增验收探针而增长（v2.281.0 已从 18 条长到 19 条），任务那 18 项只有全部交付后才变。
 *   所以脚本头尾看到「19 条」与「18 项」并列不是笔误，也不是漏改。
 *
 * 本脚本把那套顺序固化成一条命令，并**自己拒绝越界**：
 *   它不接受 `tests/run.js` 作为目标；谁把它加进来，脚本会先红。
 *
 * 每条另有两个方向的守卫（缺一个就会漏）：
 *   · `exit code` —— 抓「跑炸了」；
 *   · `expect`    —— 抓「一条断言都没跑却 exit 0」（零断言静默通过），
 *                    声明了 expect 的条目必须命中文本才算 PASS。
 *
 * 用法：node tools/v7probes/p_closeout_2275.js
 *      node tools/v7probes/p_closeout_2275.js --list   # 只打印清单
 */
const cp = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// ── 收口清单（与台账「纪律 12 · 合规收口顺序」逐条对应）────────────────
const STEPS = [
  { phase: '① 本版专锁', cmd: ['node', 'tests/v7-driver-ledger-2275.js'], budget: '~2 min' },
  { phase: '② 版本门禁 · 版本跟随面', cmd: ['node', 'tests/version-surface-gate-v2185.js'], budget: '~10 s' },
  { phase: '② 版本门禁 · 死导出冻结', cmd: ['node', 'tests/dead-export-gate.js'], budget: '~20 s' },
  { phase: '② 版本门禁 · 测试面', cmd: ['node', 'tests/test-surface-gate.js'], budget: '~15 s' },
  { phase: '③ 本体面 · 模块注册账本', cmd: ['node', 'tests/module-registry-gate.js'], budget: '~10 s' },
  { phase: '③ 本体面 · 模块依赖静态图', cmd: ['node', 'tests/module-cycle-gate-v2107.js'], budget: '~15 s' },
  { phase: '③ 本体面 · 硬读数族', cmd: ['node', 'tools/sync-hardcoded.js'], budget: '~12 s' },
  { phase: '③ 本体面 · 拒收码见证锁', cmd: ['node', 'tests/reject-lock-v2780.js'], budget: '~20 s' },
  { phase: '③ 本体面 · 散装读数', cmd: ['node', 'tests/u3-loose-readings-v2191.js'], budget: '~40 s' },
  { phase: '③ 本体面 · 事实报告', cmd: ['node', 'tests/u9-fact-report-v2190.js'], budget: '~30 s' },
  { phase: '③ 本体面 · 结算读数', cmd: ['node', 'tests/settle-v2830.js'], budget: '~30 s' },
  { phase: '③ 本体面 · 计划状态块', cmd: ['node', 'tests/o7-plan-tree-gate-v2187.js'], budget: '~20 s' },
  // ── v2.276.0（V7 OPV7-7）交付期新增：空产出归因的两条验收探针 ──────────────
  //   探针自己 exit(1) 表示失败；此处再加一道 `expect` 文本判据，
  //   防「一条断言都没跑」的静默通过（本仓反复付过价的那类假绿）。
  { phase: '③ 本体面 · 空产出归因（引擎面）', cmd: ['node', 'tools/v7probes/p_yield_attrib_final.js'],
    budget: '~25 s', expect: /0 failed/ },
  { phase: '③ 本体面 · 空产出归因（诊断面）', cmd: ['node', 'tools/v7probes/p_yield_diag.js'],
    budget: '~25 s', expect: /0 failed/ },
  // ── v2.277.0（V7 OPV7-1）交付期新增：推演结果分发器的验收探针 ────────────────
  //   覆盖四段：A 关着时逐字无变化（含「引擎全开但分发器关着 ⇒ 一条未写」的更强制对照）、
  //   B 开着时四个面从空变有、C 不编事实（正文必须是契约原文，id 必须是派生标识符）、
  //   D 拒收如实记账。另含三处**真源码破坏**的负控制（改源码→重装→跑同款判据→复原），
  //   所以它必须留在收口清单里：判据「该变能变」这件事本身是要被守的更保。
  { phase: '③ 本体面 · 推演分发验收（OPV7-1）', cmd: ['node', 'tools/v7probes/p_intake_dispatch.js'],
    budget: '~20 s', expect: /0 failed/ },
  // ── v2.278.0（V7 OPV7-2）交付期新增：第四道门槛的验收探针 ────────────────────
  //   覆盖五段：A 只接一处不造第二套、B 判不了要大声说判不了（含「ok 不因它变假」这条反向契约）、
  //   C 能判时开着的 L3 ⇒ dormant / 关着的 ⇒ pass、D 名单截断不许冒充结论、E 缺件 ≠ 判不了；
  //   另含三处真源码破坏负控制。它与专锁 v7-drive-gate-2278.js 并行存在，不是重复：
  //   探针验「本次对不对」（可单跑、带上下文打印），锁验「以后会不会退回去」（挂进 run.js）。
  { phase: '③ 本体面 · 驱动门槛验收（OPV7-2）', cmd: ['node', 'tools/v7probes/p_drive_gate.js'],
    budget: '~15 s', expect: /0 failed/ },
  // ── v2.279.0（V7 OPV7-3）交付期新增：产出面判据的验收探针 ────────────────────
  //   A 结构（一处接点 / 一条读数口 / 缓存两键）· B 判据（有产出 pass / 全空 blocked）·
  //   C 趋势（首轮不判 / flat / shrinking ⇒ degraded）· D 缓存（同轮命中 / 开关变即重测 /
  //   观测不污染被观测者）· E 出口 + G 三处真源码破坏。
  { phase: '③ 本体面 · 产出面验收（OPV7-3）', cmd: ['node', 'tools/v7probes/p_yield_face.js'],
    budget: '~20 s', expect: /0 failed/ },
  // ── v2.280.0（V7 OPV7-4）交付期新增：写口契约自描述的验收探针 ─────────────────
  //   A 结构（真源是函数体 / 不手抄表 / 零写 / 消费方接线）· B 真值（三个真实写口的 hint 逐字）·
  //   C 不冒充（读不到 ⇒ null + why，不给空数组）· D 归属（不错配 / 不继承 / 不认注释）·
  //   E explain 三支 · F 只读 · G 三处真源码破坏。
  { phase: '③ 本体面 · 写口契约验收（OPV7-4）', cmd: ['node', 'tools/v7probes/p_write_contract.js'],
    budget: '~25 s', expect: /0 failed/ },
  // ── v2.281.0（V7 OPV7-6）交付期新增：开局即喂的验收探针 ───────────────────────
  //   A 结构（装载同序 / 导出面六口 / 零 store 直写 / 四个真写口各恰一次 / 不造第二真源 /
  //   诊断节 + 面板 + 守卫表三件齐做）· B 真值（**先 noSeed 装世界、再播种**：
  //   「有演员没剧本」才是这条要治的病，拿空世界当基线会把人算成播种造的）·
  //   C 幂等（含 bonds 出厂 enabled:false 这一态单列，本版实测踩到的真缺陷就在这）·
  //   D 不编事实 · E 势力真源 · N 三处真源码破坏 + 判据纯度 + 工具两向自证。
  //   它与专锁 v7-playable-seed-2281.js 并行存在：探针验「这次对不对」，锁验「以后会不会退回去」。
  { phase: '③ 本体面 · 开局即喂验收（OPV7-6）', cmd: ['node', 'tools/v7probes/p_playable_seed.js'],
    budget: '~25 s', expect: /0 failed/ }
];

// ── 越界自证：清单里绝不许出现全量回归入口 ─────────────────────────────
const FORBIDDEN = /(^|[\s/])tests\/run\.js(\s|$)/;
const violations = STEPS.filter(function (s) { return FORBIDDEN.test(s.cmd.join(' ')); });
if (violations.length) {
  console.log('FAIL: 收口清单里出现了 tests/run.js —— 违反纪律 12');
  violations.forEach(function (v) { console.log('  · ' + v.phase + ' :: ' + v.cmd.join(' ')); });
  process.exit(2);
}

const ARGV = process.argv.slice(2);
if (ARGV.indexOf('--list') >= 0) {
  STEPS.forEach(function (s, i) {
    console.log((i + 1) + '. [' + s.phase + '] ' + s.cmd.join(' ') + '  (' + s.budget + ')'
      + (s.expect ? '  + expect ' + String(s.expect) : ''));
  });
  console.log('\n合计 ' + STEPS.length + ' 条 · 预算量级 3～5 分钟（对比全量回归 27～38 分钟）');
  process.exit(0);
}

const rows = [];
let failed = 0;
const t0 = Date.now();

STEPS.forEach(function (s, i) {
  const label = (i + 1) + '/' + STEPS.length + ' ' + s.phase;
  process.stdout.write('▶ ' + label + ' ... ');
  const t = Date.now();
  let out = '';
  let code = 0;
  try {
    out = cp.execSync(s.cmd.join(' '), {
      cwd: ROOT, encoding: 'utf8', timeout: 900000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e) {
    code = (e && typeof e.status === 'number') ? e.status : 1;
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '');
  }
  // expect 文本判据：声明了就要求命中 —— 「没跑断言」不得当成通过。
  //   与 exit code 是**两个方向**的守卫：exit 抓「跑炸了」，expect 抓「什么都没跑」。
  if (code === 0 && s.expect && !s.expect.test(out)) {
    code = 3;
    out += '\n[closeout] expect 未命中：' + String(s.expect) + '（疑似零断言静默通过）';
  }
  const secs = ((Date.now() - t) / 1000).toFixed(1);
  const body = out.split('\n').filter(function (l) {
    return l.indexOf('[WorldAxis]') !== 0 && l.trim();
  });
  const tail = body.length ? body[body.length - 1].slice(0, 150) : '(no output)';
  rows.push({ label: label, code: code, secs: secs, tail: tail });
  console.log((code === 0 ? 'PASS' : 'FAIL') + ' (' + secs + 's) :: ' + tail);
  if (code !== 0) failed++;
});

const total = ((Date.now() - t0) / 1000).toFixed(1);
console.log('');
console.log('════ 收口汇总（纪律 12 合规路径）════');
console.log('  条目 ' + STEPS.length + ' · 通过 ' + (STEPS.length - failed) + ' · 失败 ' + failed
  + ' · 总耗时 ' + total + 's');
console.log('  注：本路径**未**执行 tests/run.js（纪律 12：V7 十八项任务交付前禁止；'
    + '本文件是收口条目清单，条目数随版本增长，与「18 项」不是同一计数）');
if (failed) {
  console.log('');
  console.log('失败明细：');
  rows.filter(function (r) { return r.code !== 0; }).forEach(function (r) {
    console.log('  ✗ ' + r.label + ' (' + r.secs + 's) :: ' + r.tail);
  });
}
process.exit(failed ? 1 : 0);