#!/usr/bin/env node
// WorldAxis tests/opv29-z1-10-v2529.js — V29 优化线 Z1（OPV29-10）专锁
//
// 治的病
//   计划原文：「`inject-budget` 拆段：科目表与算法分离」，验收「预算读数不变」。
//   拆之前：1425 行的引擎里混着 573 行**纯声明**（源优先级 / 成本分档 / 科目归类）与一千多行算法，
//   改一条 rank 要在算法里翻，想知道「哪些源算世界骨架」也没有独立真源。
//
// 本锁钉住「表已分离、导出面没变、次序硬约束还在、缺表不许静默退化」：
//   A 现场：表文件载荷（163 源 / 163 行）· 引擎零表字面量 · 导出面 23 键逐字不变 · 两份装载表同序。
//   B 负控制：真起子进程——只装引擎必抛 · 空表必抛 · 先表后引擎必成 · 次序判据喂假表必红。
//   C 真跑：CLI 两条（成 / 败）各取真实 rc。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  console.log('  ✗ ' + line); return false;
}
const ENG = path.join(ROOT, 'engines', 'inject-budget.js');
const TAB = path.join(ROOT, 'engines', 'inject-budget-tables.js');
const TABREL = "'engines/inject-budget-tables.js'";
const ENGREL = "'engines/inject-budget.js'";

/** 两份装载表的次序判据（纯函数，便于喂假表做负控制）。 */
function orderOk(idxSrc, runSrc) {
  const i1 = idxSrc.indexOf(TABREL), i2 = idxSrc.indexOf(ENGREL);
  const r1 = runSrc.indexOf(TABREL), r2 = runSrc.indexOf(ENGREL);
  return i1 > 0 && i2 > i1 && r1 > 0 && r2 > r1;
}

// ── A. 现场 ───────────────────────────────────────────────
const gate = require('../tests/ui-gate-sync.js');
const WA = gate.fresh().WA;
const IB = WA.injectBudget, TB = WA.injectBudgetTables;

a(!!TB && Object.keys(TB).sort().join(',') === 'ACCOUNTS_ROWS,COST_BANDS,PRIORITY',
  'A1 表文件载荷三件齐（' + (TB ? Object.keys(TB).length : 0) + ' 块）', TB && Object.keys(TB));
// v2.542.8 跟位：163 -> 164。v2.542.2（L1）把「本幕（场景意图）」作为第 164 个源
//   加进 PRIORITY 与 ACCOUNTS_ROWS（块名/显示名/科目键三处同一个字符串），本锁钉的计数
//   没跟位；全量回归此前每次都死在这一段之前，所以红了足足 20 多个版本没人看见。
//   判据形态（键数 == 科目行数，且等于现场真值）未动。
a(Object.keys(IB.PRIORITY).length === 165 && TB.ACCOUNTS_ROWS.length === 165,
  'A2 165 个源（v2.569.0 跟位：164 → 165 = v2.567.0 mixedIndex「常驻索引」同批进 PRIORITY 与 ACCOUNTS_ROWS）：PRIORITY ' + Object.keys(IB.PRIORITY).length + ' 键 / 科目行 ' + TB.ACCOUNTS_ROWS.length + ' 行');
const KEYS = ['AUTO_MAX', 'AUTO_MIN', 'AUTO_RATIO', 'DEFAULT_BUDGET', 'FOLD_FLOOR_TOKENS', 'MIN_KEEP_TOKENS',
  'PRIORITY', 'apply', 'autoBudget', 'budgetView', 'costOf', 'costView', 'explain', 'foldable',
  'incrementalCost', 'plan', 'rankOf', 'resolveBudget', 'resolveContextSize', 'summaryText',
  'tokensOf', 'trim', 'volumeView'];
const liveKeys = Object.keys(IB).sort();
a(liveKeys.join(',') === KEYS.join(','), 'A3 导出面 23 键逐字不变（拆段前 = 拆段后）', liveKeys.length);
const engSrc = fs.readFileSync(ENG, 'utf8');
a(engSrc.indexOf("'近端事件': { rank: 1") < 0 && engSrc.indexOf("['在用机制', '叙事推进', '推进']") < 0,
  'A4 引擎里已无表字面量（源优先级行 / 科目行都搬走了）');
const tabSrc = fs.readFileSync(TAB, 'utf8');
// 表文件只许有那一个 IIFE 外壳；不许出现**具名函数定义**或算法标识（costOf / plan(）。
const namedFns = (tabSrc.match(/function\s+[A-Za-z_$]/g) || []).length;
a(namedFns === 0 && !/costOf/.test(tabSrc) && !/\bplan\s*\(/.test(tabSrc)
  && (tabSrc.match(/\(function\s*\(\)/g) || []).length === 1,
  'A5 表文件零算法（具名函数 0 个 / 只有 1 个 IIFE 外壳 / 无 costOf、plan）', namedFns);
const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const runSrc = fs.readFileSync(path.join(ROOT, 'tests', 'run.js'), 'utf8');
a(orderOk(idxSrc, runSrc), 'A6 两份装载表同序：tables 在 inject-budget 之前（index.js + run.js）');
const pl = IB.plan([{ id: 1, source: '世界状态', rank: 2, tokens: 10, content: 'x' },
  { id: 2, source: '记忆', rank: 4, tokens: 10, content: 'y' }], { budget: 2400 });
a(pl.kept.length === 2 && (pl.dropped || []).length === 0 && (pl.folded || []).length === 0
  && IB.costOf(20).band === 'long' && IB.costOf(-1).band === 'short'
  && (IB.costView().unclassified || []).length === 0,
  'A7 预算读数不变：kept 2 / dropped 0 / folded 0 · costOf(20)=long · 未归类 0');

// ── B. 负控制（真起子进程）────────────────────────────────
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ib-lock-'));
function shim(name, body) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  return p;
}
const onlyEng = shim('only-eng.js', 'global.WorldAxis = {};\nrequire(' + JSON.stringify(ENG) + ');\n');
const emptyTab = shim('empty-tab.js',
  'global.WorldAxis = { injectBudgetTables: { PRIORITY: {}, COST_BANDS: [], ACCOUNTS_ROWS: [] } };\nrequire('
  + JSON.stringify(ENG) + ');\n');
const okBoth = shim('ok-both.js', 'global.WorldAxis = {};\nrequire(' + JSON.stringify(TAB) + ');\nrequire('
  + JSON.stringify(ENG) + ');\nconsole.log("OK " + Object.keys(global.WorldAxis.injectBudget).length);\n');

const r1 = cp.spawnSync(process.execPath, [onlyEng], { encoding: 'utf8' });
a(r1.status !== 0 && /科目表未装载/.test(String(r1.stderr || '')),
  'B1 只装引擎不装表 ⇒ 当场抛错（rc=' + r1.status + '，不静默退化成空表）');
const r2 = cp.spawnSync(process.execPath, [emptyTab], { encoding: 'utf8' });
a(r2.status !== 0 && /科目表未装载或为空/.test(String(r2.stderr || '')),
  'B2 表被换成空表 ⇒ 同样抛错（rc=' + r2.status + '，空表也算缺表）');
const r3 = cp.spawnSync(process.execPath, [okBoth], { encoding: 'utf8' });
a(r3.status === 0 && /^OK 23/m.test(String(r3.stdout || '')),
  'B3 先表后引擎 ⇒ 装成且导出面 23 键（' + String(r3.stdout || '').trim() + '）');
const fakeNoTab = idxSrc.replace(TABREL + ',\n', '').replace(TABREL + ', ', '');
a(orderOk(fakeNoTab, runSrc) === false, 'B4 次序判据：index.js 少了 tables 条目 ⇒ 红（不是恒真）');
const fakeSwapped = idxSrc.split(TABREL).join('@@T@@')
  .split(ENGREL).join(TABREL).split('@@T@@').join(ENGREL);
a(orderOk(fakeSwapped, runSrc) === false, 'B5 次序判据：两份表位置互换 ⇒ 红');

// ── C. 真跑 CLI ───────────────────────────────────────────
const cOk = cp.spawnSync(process.execPath, [okBoth], { encoding: 'utf8' });
a(cOk.status === 0, 'C1 真跑（表 + 引擎）⇒ rc=0（实 ' + cOk.status + '）', cOk.status);
const cBad = cp.spawnSync(process.execPath, [onlyEng], { encoding: 'utf8' });
a(cBad.status !== 0, 'C2 真跑（只有引擎）⇒ rc≠0（实 ' + cBad.status + '）', cBad.status);

// ── 汇总 ────────────────────────────────────────────────
try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
if (fail) {
  console.log('OPV29-Z1-10-V2529: FAIL ' + fail + '/' + (pass + fail));
  process.exitCode = 1;
} else {
  console.log('OPV29-Z1-10-V2529: pass (' + pass + ')');
}