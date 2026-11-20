#!/usr/bin/env node
// WorldAxis tests/opv29-z1-09-v2529.js — V29 优化线 Z1（OPV29-09）专锁
//
// 治的病
//   计划原文：「`reject-recovery` 拆段：账本与判定分离」，验收「差额口径不变（1903/957/52）」。
//   拆之前：1388 行的引擎里 1162 行（84%）是**冻结表**（规则表 / 例外表 / 三面快照 /
//   判不出面的人工判定），真正的判定逻辑只有 200 出头；而「快照与现场逐条一致」这件
//   核对事由 tools/reject-recovery.js 复算 —— 它要读的正是那几张表，却混在算法里。
//
// 本锁钉住「表已分离、判定没变、次序硬约束还在、缺表不许静默退化」：
//   A 现场：引擎 ≤300 行 · 表 1204 行零算法 · 七块载荷逐项不变 · 导出面 14 键逐字不变 ·
//           引擎零表字面量 · 两份装载表同序 · 工具复算仍逐条一致。
//   B 负控制：真起子进程——只装引擎必抛 · 空表必抛 · 先表后引擎必成 · 次序判据喂假表必红。
//   C 真跑：CLI 两条（成 / 缺表败）各取真实 rc。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  console.log('  ✗ ' + line); return false;
}
const ENG = path.join(ROOT, 'engines', 'reject-recovery.js');
const TAB = path.join(ROOT, 'engines', 'reject-recovery-tables.js');
const TABREL = "'engines/reject-recovery-tables.js'";
const ENGREL = "'engines/reject-recovery.js'";
/** 两份装载表的次序判据（纯函数，便于喂假表做负控制）。 */
function orderOk(idxSrc, runSrc) {
  const i1 = idxSrc.indexOf(TABREL), i2 = idxSrc.indexOf(ENGREL);
  const r1 = runSrc.indexOf(TABREL), r2 = runSrc.indexOf(ENGREL);
  return i1 > 0 && i2 > i1 && r1 > 0 && r2 > r1;
}
/** 在 vm 里按给定顺序装载（用真源码或破坏副本），返回 WA。 */
function loadWith(parts, label) {
  const ctx = { console: { log: function () {}, warn: function () {}, error: function () {} }, window: {} };
  ctx.window.WorldAxis = {
    log: function () {},
    registerModule: function () {}
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  parts.forEach(function (p) {
    const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
    vm.runInContext(src, ctx, { filename: label + ':' + p });
  });
  return ctx.window.WorldAxis;
}
function throwsWith(parts, re) {
  try {
    loadWith(parts, 'neg');
    return { threw: false, msg: '' };
  } catch (e) {
    return { threw: true, msg: String(e && e.message || e), hit: re.test(String(e && e.message || e)) };
  }
}

// ── A. 现场 ───────────────────────────────────────────
const engSrc = fs.readFileSync(ENG, 'utf8');
const tabSrc = fs.readFileSync(TAB, 'utf8');
const engLines = engSrc.split('\n').length - 1;
const tabLines = tabSrc.split('\n').length - 1;
a(engLines <= 300, 'A1 引擎已瘦身到 300 行以内（实 ' + engLines + ' 行；拆段前 1388 行）', engLines);
a(tabLines >= 1000, 'A2 表文件承载原表体量（实 ' + tabLines + ' 行，下限 1000）', tabLines);
// 表文件必须**零算法**：具名函数 0 个、只有一个 IIFE 外壳
const namedFns = (tabSrc.match(/function\s+[A-Za-z_$]/g) || []).length;
const iifes = (tabSrc.match(/\(function\s*\(\)/g) || []).length;
a(namedFns === 0 && iifes === 1,
  'A3 表文件零算法（具名函数 ' + namedFns + ' 个 / IIFE 外壳 ' + iifes + ' 个）');
/** 剥掉注释（保留字符串字面量）：表文件里带着大量历史注释，注释里提到
 *  `explain()` / `ruleKind()` 是**说明**，不是算法 —— 不剥就会假红。 */
function stripNotes(s) {
  let out = '';
  let i = 0;
  let q = null;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
      if (c === q) q = null;
      out += c; i += 1; continue;
    }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; i += 1; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i += 1; continue; }
    if (c === '/' && s[i + 1] === '*') {
      const e = s.indexOf('*/', i + 2);
      i = e < 0 ? s.length : e + 2;
      continue;
    }
    out += c; i += 1;
  }
  return out;
}
const tabCode = stripNotes(tabSrc);
a(!/explain\s*\(|ruleKind\s*\(|diagnose\s*\(|frozenFace\s*\(|function counts/.test(tabCode),
  'A4 表文件（剥注释后）不含判定函数标识（explain / ruleKind / diagnose / frozenFace / counts）');

// 七块载荷逐项不变（拆段只搬家，一条不增不删）
const WA = loadWith(['engines/reject-recovery-tables.js', 'engines/reject-recovery.js'], 'live');
const R = WA.rejectRecovery;
a(!!WA.rejectRecoveryTables && Object.keys(WA.rejectRecoveryTables).length === 7,
  'A5 表文件载荷七件齐（实 ' + (WA.rejectRecoveryTables ? Object.keys(WA.rejectRecoveryTables).length : 0) + ' 块）',
  WA.rejectRecoveryTables && Object.keys(WA.rejectRecoveryTables));
a(R.REJECT_FACE.length === 1687 && R.SUCCESS_FACE.length === 139 && R.NEUTRAL_FACE.length === 89,
  'A6 三面快照条目数与拆段前逐项相等（拒收 ' + R.REJECT_FACE.length
  + ' / 成功 ' + R.SUCCESS_FACE.length + ' / 判不出 ' + R.NEUTRAL_FACE.length + '）');
a(R.RULES.length === 5 && Object.keys(R.OVERRIDES).length === 136
  && Object.keys(R.NEUTRAL_REVIEW).length === 89 && Object.keys(R.ARTIFACTS).length === 1,
  'A7 规则表 / 例外表 / 判不出面登记 / 词法碎片条目不变（'
  + R.RULES.length + ' / ' + Object.keys(R.OVERRIDES).length + ' / '
  + Object.keys(R.NEUTRAL_REVIEW).length + ' / ' + Object.keys(R.ARTIFACTS).length + '）');

// 导出面 14 键逐字不变
const KEYS = ['ARTIFACTS', 'KINDS', 'KIND_ACTION', 'NEUTRAL_FACE', 'NEUTRAL_REVIEW', 'OVERRIDES',
  'REJECT_FACE', 'RULES', 'SUCCESS_FACE', 'counts', 'diagnose', 'explain', 'ruleKind', 'stat'];
const liveKeys = Object.keys(R).sort();
a(liveKeys.join(',') === KEYS.join(','),
  'A8 导出面 14 键逐字不变（拆段前 = 拆段后）', liveKeys.length);

// 引擎里已无表字面量（七块头 + 一条快照内容）
const blockHeads = ['const RULES = [', 'const OVERRIDES = {', 'const ARTIFACTS = {',
  'const NEUTRAL_REVIEW = {', 'const REJECT_FACE = [', 'const SUCCESS_FACE = [',
  'const NEUTRAL_FACE = ['];
const leftInEng = blockHeads.filter(function (h) { return engSrc.indexOf(h) >= 0; });
a(leftInEng.length === 0 && !/'hard-cut', 'conflict'/.test(engSrc),
  'A9 引擎里已无表字面量（七块头 0 处 / 快照行 0 处）', leftInEng);
a(/__TB\s*=\s*WA\.rejectRecoveryTables/.test(engSrc)
  && /reject-recovery: 冻结表未装载或为空/.test(engSrc),
  'A10 引擎求值期先取表，缺表 / 空表当场抛错（不是降级）');

// 两份装载表同序：tables 在 engine 之前
const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const runSrc = fs.readFileSync(path.join(ROOT, 'tests', 'run.js'), 'utf8');
a(orderOk(idxSrc, runSrc), 'A11 两份装载表同序：tables 在 reject-recovery 之前（index.js + run.js）');
// 负控制素材：把 index.js 里两份表的位置真互换（先占位再交换，避免二次替换抵销）
const SWAP = '\u0000TAB_PLACEHOLDER\u0000';
const swappedIdx = idxSrc.split(TABREL).join(SWAP).split(ENGREL).join(TABREL).split(SWAP).join(ENGREL);
a(swappedIdx !== idxSrc && orderOk(idxSrc, runSrc) && !orderOk(swappedIdx, runSrc),
  'A12 次序判据两向自证：原序判真、把两份表位置互换后判假');

// 工具复算仍逐条一致（差额口径不变：快照 = 现场）
const tool = require('../tools/reject-recovery.js');
const aud = tool.audit();
a(aud && aud.ok && (aud.problems || []).length === 0,
  'A13 工具复算 problems 0（承诺与现场逐条一致 · 差额 0）',
  aud && (aud.problems || []).length);

// ── B. 负控制（真起装载，不靠改字符串）───────────────
const r1 = throwsWith(['engines/reject-recovery.js'], /冻结表未装载或为空/);
a(r1.threw && r1.hit, 'B1 只装引擎（不装表）⇒ 抛「冻结表未装载」（没有静默降级）', r1.msg);

const tmpEmpty = path.join(os.tmpdir(), 'wa09-empty-tables.js');
fs.writeFileSync(tmpEmpty,
  '(function () {\n  const WA = window.WorldAxis = window.WorldAxis || {};\n'
  + '  WA.rejectRecoveryTables = { RULES: [], OVERRIDES: {}, ARTIFACTS: {}, NEUTRAL_REVIEW: {},\n'
  + '    REJECT_FACE: [], SUCCESS_FACE: [], NEUTRAL_FACE: [] };\n})();\n');
let b2;
try {
  const ctx = { console: { log: function () {}, warn: function () {}, error: function () {} }, window: {} };
  ctx.window.WorldAxis = { log: function () {}, registerModule: function () {} };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(tmpEmpty, 'utf8'), ctx, { filename: 'empty-tables' });
  let msg = '';
  try { vm.runInContext(fs.readFileSync(ENG, 'utf8'), ctx, { filename: 'eng' }); } catch (e) { msg = String(e.message); }
  b2 = { threw: !!msg, msg: msg };
} finally { try { fs.unlinkSync(tmpEmpty); } catch (e) { void e; } }
a(b2.threw && /冻结表未装载或为空/.test(b2.msg), 'B2 空表（七块都是空）⇒ 同样抛错', b2.msg);

const wOk = loadWith(['engines/reject-recovery-tables.js', 'engines/reject-recovery.js'], 'ok');
a(!!wOk.rejectRecovery && wOk.rejectRecovery.explain('zzz-not-a-code').kind === null,
  'B3 先表后引擎 ⇒ 装载成功且表外码仍 kind:null（绝不兜底）');

a(!orderOk(swappedIdx, runSrc),
  'B4 次序判据两向自证：把两份表位置互换 ⇒ orderOk 判假（同一份互换素材，与 A12 同源）');

// ── C. 真跑 CLI（各取真实 rc）─────────────────────────
let c1rc = 0, c1out = '';
try {
  c1out = cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'reject-recovery.js')],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600000 });
} catch (e) { c1rc = e.status === undefined ? 1 : e.status; c1out = String(e.stdout || '') + String(e.stderr || ''); }
a(c1rc === 0 && /承诺与现场逐条一致/.test(c1out),
  'C1 真跑复算工具 ⇒ rc=0 且「承诺与现场逐条一致」（实 rc=' + c1rc + '）');

// C2：沙箱里只有引擎（无表）真跑 ⇒ 必须非 0（证明 B1 的抛错在 CLI 路径上也成立）
const sb = fs.mkdtempSync(path.join(os.tmpdir(), 'wa09-'));
let c2rc = 0;
try {
  fs.mkdirSync(path.join(sb, 'engines'));
  fs.copyFileSync(ENG, path.join(sb, 'engines', 'reject-recovery.js'));
  fs.writeFileSync(path.join(sb, 'run.js'),
    "'use strict';\nconst vm = require('vm');\nconst fs = require('fs');\n"
    + 'const ctx = { console: { log: function () {}, warn: function () {}, error: function () {} }, window: {} };\n'
    + 'ctx.window.WorldAxis = { log: function () {}, registerModule: function () {} };\n'
    + 'ctx.global = ctx;\nvm.createContext(ctx);\n'
    + "vm.runInContext(fs.readFileSync('engines/reject-recovery.js', 'utf8'), ctx, { filename: 'eng' });\n"
    + "console.log('装上了（不该走到这里）');\n");
  cp.execFileSync(process.execPath, [path.join(sb, 'run.js')],
    { cwd: sb, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
} catch (e) { c2rc = e.status === undefined ? 1 : e.status; }
finally { try { fs.rmSync(sb, { recursive: true, force: true }); } catch (e) { void e; } }
a(c2rc !== 0, 'C2 沙箱里只有引擎真跑 ⇒ rc≠0（实 ' + c2rc + '）—— 缺表在 CLI 路径上也拦得住');

console.log('OPV29-Z1-09-V2529: ' + (fail === 0 ? 'pass (' + pass + ')' : 'FAIL ' + fail + '/' + (pass + fail)));
process.exit(fail === 0 ? 0 : 1);