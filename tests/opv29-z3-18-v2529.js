'use strict';
// WorldAxis tests/opv29-z3-18-v2529.js — OPV29-18「台账与现场一致」专锁
//
// ── 本锁要证的 ─────────────────────────────────────────────────────
//   `plans/V29_MASTER_PLAN.md` 里 12 行「**组读数**」的手填数字，从此**每条可复算读数都
//   绑定了一条现场命令**；数字不等于现场即点名（退出 1）。
//   本工具第一次跑就抓到 10 条真过期（不是构造的）：
//     tests/*.js 575→591 · engines/*.js 484→504 · 装载期边 424→426 · 内联码 1903→1905
//     见证 957→916（两处）· action-desk 270K→277K · reject-recovery 138K→139K
//     inject-budget 96K→98K · rule-pack 81K→80K
//   改回现场值后 16 条全等 —— 也就是说：**这张表此前的数字没有一条被机器看过**。
//
// ── 分段 ───────────────────────────────────────────────────────
//   A 真仓面：16 条可复算全等 · 零 stale/unclaimed/unreadable · 6 行拓展线读数明确记为 manual
//   B 负控制（合成计划表 + 合成仓，逐种坏法单独打中）：过期必红 / 相等必绿 / 无人认领 /
//     单位不符 / **数字被删不许静默少检** / 白名单腐烂 / 读不到不当相等 / 计划表缺失
//   C 不越界与真源：audit 不写盘；改生成物数字读数跟着变（证明读的是现场不是快照）
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PR = require(path.join(ROOT, 'tools', 'plan-readings.js'));
const crypto = require('crypto');
const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// ── 合成仓：只为负控制存在（不读真仓、不写真仓）──
//   opts.readings 决定优化线那一行的内容；opts.codes 决定生成物头部的数字。
function synth(opts) {
  const o = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-pr-'));
  fs.mkdirSync(path.join(dir, 'plans'));
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.mkdirSync(path.join(dir, 'engines'));
  fs.mkdirSync(path.join(dir, 'tests'));
  for (let i = 0; i < (o.testsCount === undefined ? 3 : o.testsCount); i++) {
    fs.writeFileSync(path.join(dir, 'tests', 't' + i + '.js'), '// t\n');
  }
  const files = ['tool-diag', 'action-desk', 'reject-recovery', 'inject-budget',
    'backstage', 'world-lab', 'world', 'rule-pack'];
  files.forEach(function (f, i) {
    // 每个文件造 1024*(600+i) 字节 ⇒ 现场读数 600K / 601K / …
    fs.writeFileSync(path.join(dir, 'engines', f + '.js'), Buffer.alloc(1024 * (600 + i), 32));
  });
  fs.writeFileSync(path.join(dir, 'tests', 'module-registry-ledger.json'),
    JSON.stringify({ totals: o.totals === undefined ? { loadEdges: 426 } : o.totals }));
  const codes = o.codes || { inline: 1905, witness: 916, dead: 52, baseline: 937 };
  // 计划表里写什么（默认与生成物一致）；分开给才能造出「现场变了而计划表没跟上」
  const planCodes = o.planCodes || codes;
  fs.writeFileSync(path.join(dir, 'docs', 'ERROR_CODES.md'),
    '# 手册\n共 **' + codes.inline + '** 个内联拒收码：见证 ' + codes.witness +
    ' / 死表 ' + codes.dead + ' / 基线 ' + codes.baseline + '\n');
  const sizeLine = o.sizeLine || '`tool-diag` **600K** / `action-desk` **601K** / `reject-recovery` **602K** / '
    + '`inject-budget` **603K** / `backstage` **604K** / `world-lab` **605K** / `world.js` **606K** / '
    + '`rule-pack` **607K**';
  const readings = (o.readings === undefined)
    ? '> **组读数**：`tests/*.js` **' + (o.testsCount === undefined ? 3 : o.testsCount) +
      '** 个；`engines/*.js` **8**；全量回归实测 **≈29 分钟**（隔离器整仓复制 **85M**）；装载期边 **426**。'
    : o.readings;
  const plan = [
    '## 一、拓展线 36 项',
    '',
    '### Z1 合成组',
    '> **组读数**：`抢话|打断` 19 文件、**0** 命中；这是探索性勘察结论。',
    '',
    '## 二、优化线 36 项（OPV29-01～36·六组）',
    '### Z1 合成组',
    readings,
    '### Z2 合成组',
    '> **组读数**（`ls -S engines/*.js` 实测）：' + sizeLine,
    '### Z3 合成组',
    '> **组读数**：内联码 **' + planCodes.inline + '** / 见证 **' + planCodes.witness +
      '** / 死表 **' + planCodes.dead + '** / 基线 **' + planCodes.baseline + '**；其余说明文字。',
    '### Z4 合成组',
    '> **组读数**：见证 **' + planCodes.witness + '** 条；两处真空转靠人工发现。',
    '### Z5 合成组',
    '> **组读数**：接线四件套（`index.js` / `tests/run.js` / `tool-diag` / `action-desk`）；三处登记。',
    '### Z6 合成组',
    '> **组读数**：`controllability.rollback` 已落；本次 `.git` 损坏靠远端重建。',
    ''
  ].join('\n');
  if (o.noPlan !== true) fs.writeFileSync(path.join(dir, 'plans', 'V29_MASTER_PLAN.md'), plan, 'utf8');
  return dir;
}

// ══════════ A. 真仓面 ══════════
function runA() {
  console.log('\nA. 真仓面（只读；这里的数字必须来自现场命令）');
  const res = PR.audit(ROOT);
  a(res.why !== 'plan-missing', 'A1 计划表在位（缺失时不许当绿）', res.why);
  a(res.ok === true, 'A2 门禁通过（16 条可复算读数与现场全等）',
    'stale=' + (res.stale || []).length + ' unclaimed=' + (res.unclaimed || []).length);
  a((res.checked || []).length === 16, 'A3 可复算读数 16 条（Z1 三 + Z2 八 + Z3 四 + Z4 一）',
    String((res.checked || []).length));
  a((res.stale || []).length === 0, 'A4 零过期（回填后全部相等）');
  a((res.unclaimed || []).length === 0, 'A5 零无人认领（每个数字都有主人）');
  a((res.unreadable || []).length === 0, 'A6 零读不到（读不到不许当相等）', JSON.stringify(res.unreadable));
  a((res.staleManual || []).length === 0, 'A7 白名单零腐烂（登记的两条都在计划表里出现）');
  a(res.manualLines === 6, 'A8 拓展线 6 行组读数明确记为不可机械复算（不静默、不假装算过）',
    String(res.manualLines));
  a(res.manualUsed.length === 2, 'A9 白名单恰 2 条（≈29 分钟 / 85M）', String(res.manualUsed.length));
  a(res.planRows === 12, 'A10 计划表组读数行 12 条（6 拓展 + 6 优化，一条不漏）', String(res.planRows));
  const noCmd = (res.checked || []).filter(function (c) { return !c.cmd; });
  a(noCmd.length === 0, 'A11 每条可复算读数都带复算命令（报告里能照抄重跑）');
  a(PR.readCodes(ROOT).ok === true, 'A12 拒收码生成物可解析（解析不了就不许当相等）');
}

// ══════════ B. 负控制 ══════════
function runB() {
  console.log('\nB. 负控制（合成计划表 + 合成仓，逐种坏法单独打中）');
  // B1 相等 ⇒ 绿（先证基线能绿，否则后面的红没意义）
  const good = synth({});
  const r1 = PR.audit(good);
  a(r1.ok === true, 'B1 合成仓读数与现场全等 ⇒ 绿（基线非恒红）',
    JSON.stringify((r1.stale || []).map(function (s) { return s.id; })));
  // B2 过期 ⇒ 红，且点名到项
  // 现场见证 916，而计划表还写着 999 ⇒ 真过期
  const bad = synth({ planCodes: { inline: 1905, witness: 999, dead: 52, baseline: 937 } });
  const r2 = PR.audit(bad);
  a(r2.ok === false && r2.stale.length >= 1, 'B2 生成物数字变了 ⇒ stale 红');
  a(r2.stale.some(function (s) { return s.id === 'Z3.witness'; }),
    'B2b 红到具体的项（Z3.witness），不是一句「有读数不对」',
    JSON.stringify(r2.stale.map(function (s) { return s.id; })));
  // B3 行内有数字但无 recipe 也未登记 ⇒ unclaimed
  const unc = synth({ readings: '> **组读数**：`tests/*.js` **3** 个；凭空多一个 **42** 的读数；装载期边 **426**。' });
  const r3 = PR.audit(unc);
  a(r3.unclaimed.length === 1 && r3.unclaimed[0].frag.indexOf('42') >= 0,
    'B3 凭空多一个数字 ⇒ unclaimed（新加的读数没人给它接命令）',
    JSON.stringify(r3.unclaimed));
  // B4 单位不符 ⇒ unreadable（不许把 K 当个）
  const unit = synth({ sizeLine: '`tool-diag` **600M** / `action-desk` **601K** / `reject-recovery` **602K** / '
    + '`inject-budget` **603K** / `backstage` **604K** / `world-lab` **605K** / `world.js` **606K** / `rule-pack` **607K**' });
  const r4 = PR.audit(unit);
  a(r4.unreadable.some(function (u) { return u.why.indexOf('unit-mismatch') >= 0; }),
    'B4 单位写成 M（recipe 要求 K）⇒ unit-mismatch（不静默当相等）',
    JSON.stringify(r4.unreadable.map(function (u) { return u.why; })));
  // B5 **数字被删 ⇒ 不许静默少检一条**（本工具初版的盲点）
  const del = synth({ sizeLine: '`tool-diag` 现在是最大的那个 / `action-desk` **601K** / `reject-recovery` **602K** / '
    + '`inject-budget` **603K** / `backstage` **604K** / `world-lab` **605K** / `world.js` **606K** / `rule-pack` **607K**' });
  const r5 = PR.audit(del);
  a(r5.ok === false && r5.unreadable.some(function (u) { return u.id === 'Z2.tool-diag'; }),
    'B5 把 tool-diag 的读数删成一句话 ⇒ 该 recipe 变 unmatched 而红（不是安静地少检一条）',
    JSON.stringify(r5.unreadable.map(function (u) { return u.id + ':' + u.why.slice(0, 20); })));
  // B6 白名单腐烂 ⇒ stale-manual
  const noManual = synth({ readings: '> **组读数**：`tests/*.js` **3** 个；装载期边 **426**。' });
  const r6 = PR.audit(noManual);
  a(r6.staleManual.length === 2, 'B6 计划表里删掉「≈29 分钟 / 85M」⇒ 白名单两条都报腐烂（借口不许长存）',
    String(r6.staleManual.length));
  // B7 拓展线整行算 manual，不混进 checked
  a(r1.manualLines === 1 && r1.manualUsed.length === 2,
    'B7 拓展线的组读数行计入 manual 而不进 checked（不把勘察结论冒充硬读数）',
    r1.manualLines + '/' + r1.manualUsed.length);
  // B8 生成物缺失 ⇒ 读不到，不当 0 也不当相等
  const noCodes = synth({});
  fs.rmSync(path.join(noCodes, 'docs', 'ERROR_CODES.md'));
  const r8 = PR.audit(noCodes);
  a(r8.unreadable.some(function (u) { return u.why === 'codes-doc-missing'; }) && r8.ok === false,
    'B8 生成物缺失 ⇒ codes-doc-missing 红（不是 0，也不是相等）',
    JSON.stringify(r8.unreadable.map(function (u) { return u.why; })));
  // B9 账本字段缺失 ⇒ loadEdges-not-number
  const noEdge = synth({ totals: { hardEdges: 0 } });
  const r9 = PR.audit(noEdge);
  a(r9.unreadable.some(function (u) { return u.why === 'loadEdges-not-number'; }),
    'B9 账本里没有 loadEdges ⇒ loadEdges-not-number（缺失 ≠ 0）',
    JSON.stringify(r9.unreadable.map(function (u) { return u.why; })));
  // B10 计划表缺失 ⇒ 门禁不绿
  const noPlan = synth({ noPlan: true });
  const r10 = PR.audit(noPlan);
  a(r10.ok === false && r10.why === 'plan-missing', 'B10 计划表缺失 ⇒ plan-missing 且 ok:false', r10.why);
  [good, bad, unc, unit, del, noManual, noCodes, noEdge, noPlan].forEach(function (d) {
    fs.rmSync(d, { recursive: true, force: true });
  });
}

// ══════════ C. 不越界与真源 ══════════
function runC() {
  console.log('\nC. 不越界与真源');
  const planFile = path.join(ROOT, 'plans', 'V29_MASTER_PLAN.md');
  const before = sha(planFile);
  const beforeMtime = fs.statSync(planFile).mtimeMs;
  PR.audit(ROOT);
  a(sha(planFile) === before && fs.statSync(planFile).mtimeMs === beforeMtime,
    'C1 audit 是纯只读（计划表逐字节 + mtime 都不变）');
  // C2 读的是现场：改生成物数字，读数必须跟着变（证明不读快照）
  const d = synth({});
  const r1 = PR.audit(d);
  a(r1.checked.some(function (c) { return c.live === 916; }), 'C2 合成仓见证现场值 916 被读到（不是抄来的数）');
  fs.writeFileSync(path.join(d, 'docs', 'ERROR_CODES.md'),
    '# 手册\n共 **7** 个内联拒收码：见证 5 / 死表 1 / 基线 1\n');
  const r2 = PR.audit(d);
  a(r2.checked.some(function (c) { return c.id === 'Z3.witness' && c.live === 5; }),
    'C3 改生成物后现场读数跟着变（读的是真源，不是快照）',
    JSON.stringify(r2.checked.filter(function (c) { return c.id === 'Z3.witness'; }).map(function (c) { return c.live; })));
  // C4 文件大小按字节/1024 四舍五入（口径写清，免得两边各算各的）
  fs.writeFileSync(path.join(d, 'engines', 'tool-diag.js'), Buffer.alloc(1024 * 600 + 900, 32));
  const r3 = PR.audit(d);
  a(r3.checked.some(function (c) { return c.id === 'Z2.tool-diag' && c.live === 601; }),
    'C4 600K+900B ⇒ 601K（字节/1024 四舍五入，口径一致才可比）',
    JSON.stringify(r3.checked.filter(function (c) { return c.id === 'Z2.tool-diag'; }).map(function (c) { return c.live; })));
  fs.rmSync(d, { recursive: true, force: true });
}

function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A); runC(A);
}
module.exports = { runAll: runAll };
if (require.main === module) {
  runA(); runB(); runC();
  console.log('\nOPV29-Z3-18-V2529: '
    + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
  failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
  process.exitCode = failures.length ? 1 : 0;
}