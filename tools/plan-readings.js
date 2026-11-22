#!/usr/bin/env node
// WorldAxis tools/plan-readings.js (v2.524.0) — OPV29-18 台账与现场一致
//
// ── 它治什么（缺口，开工前先看现场）──────────────────────────────
//   `plans/V29_MASTER_PLAN.md` 每组开头都有一行「**组读数**」，那些数字是**手填的快照**。
//   快照会过期，而过期没人知道 —— 本仓已有先例：`06dda7e` 那批修的正是「账本读数漂移」，
//   当时是**跑到全量尾部才现形**的。本工具把这行读数接到现场命令上：数字不等于现场即点名。
//   实测（本工具第一次跑就抓到的真过期，全部来自现场命令而非记忆）：
//     `tests/*.js` 575 → **591** · `engines/*.js` 484 → **504** · 装载期边 424 → **426**
//     内联码 1903 → **1905** · 见证 957 → **916** · action-desk 270K → **277K** …
//
// ── 口径（为什么是「绑定命令」而不是「读一份账」）────────────────
//   若把读数抄进另一份 JSON 再比对，那就只是把一份手填换成两份手填，多一道漂移来源。
//   这里每条读数都绑定一条**现场计算方法**（数文件 / 读生成物头部 / stat 大小），
//   报告里把命令一并打出来，任何人在任何机器上都能复算到同一个数。
//
// ── 三档，缺一档就是假绿 ────────────────────────────────
//   checked  有 recipe 的硬数字，必须与现场**精确相等**（不等即 stale，退出 1）
//   unclaimed 行内有数字但**没有 recipe 也没有登记为不可复算** ⇒ 退出 1。
//             这条防的是「新加了一个读数，但没人给它接命令」——那种数字最危险，
//             因为它看上去被检过了。
//   manual   明确不可机械复算的读数（如「≈29 分钟」「85M」），**必须登记 + 写 why**。
//             白名单里登记了却没在计划表出现 ⇒ stale-manual（退出 1）：
//             否则白名单会长成一堆永远匹配不上的借口。
//
// ── 拓展线的 6 行组读数为什么整体算 manual ────────────────────
//   那 6 行（`抢话|打断` 19 文件、`finale|谢幕` 0 命中 之类）是**探索性勘察结论**，
//   口径（在哪个面里 grep、算不算注释与测试）当年没有定死。给它们编一个 recipe
//   会造出「看起来被检过、其实检的是我自己挑的面」的假绿。所以整行登记为 manual
//   并把行数报出来 —— 不静默，也不假装算过。
//
// ── 用法 ────────────────────────────────────────────
//   node tools/plan-readings.js            # 人读报告；有任何 stale/unclaimed ⇒ 退出 1
//   node tools/plan-readings.js --json     # 机读
//   node tools/plan-readings.js --root=<dir>  # 换仓库根（自证用）
//
// ── 纪律 ────────────────────────────────────────────
//   · 只读：不写计划表、不改任何文件（要改计划表是人的事，本工具只负责让过期被看见）。
//   · 零依赖：只用 node 内置。
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const PLAN_REL = 'plans/V29_MASTER_PLAN.md';
const LINE_TAG = '> **组读数**';
const SECTION_OPV = '## 二、优化线';

// ── 现场计算方法（每条都可复算）──────────────────────────
function countJs(dir) {
  return fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).length;
}
function readLoadEdges(root) {
  const p = path.join(root, 'tests', 'module-registry-ledger.json');
  if (!fs.existsSync(p)) return { ok: false, why: 'ledger-missing' };
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const v = j && j.totals && j.totals.loadEdges;
  if (typeof v !== 'number') return { ok: false, why: 'loadEdges-not-number' };
  return { ok: true, value: v };
}
function readCodes(root) {
  const p = path.join(root, 'docs', 'ERROR_CODES.md');
  if (!fs.existsSync(p)) return { ok: false, why: 'codes-doc-missing' };
  const head = fs.readFileSync(p, 'utf8').split('\n').slice(0, 20).join('\n');
  const m = /共\s*\*\*(\d+)\*\*\s*个内联拒收码：见证\s*(\d+)\s*\/\s*死表\s*(\d+)\s*\/\s*基线\s*(\d+)/.exec(head);
  if (!m) return { ok: false, why: 'codes-header-unparsable' };
  return { ok: true, values: { inline: Number(m[1]), witness: Number(m[2]), dead: Number(m[3]), baseline: Number(m[4]) } };
}
function sizeK(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) return { ok: false, why: 'file-missing:' + rel };
  return { ok: true, value: Math.round(fs.statSync(p).size / 1024) };
}

// ── recipe 表：anchor 是计划表里的原样片段（含反引号），不是我自己起的名字 ──
function buildRecipes(root) {
  const list = [
    { id: 'Z1.tests', anchor: '`tests/*.js`', unit: '', cmd: '数 tests/*.js 文件个数',
      run: function () { return { ok: true, value: countJs(path.join(root, 'tests')) }; } },
    { id: 'Z1.engines', anchor: '`engines/*.js`', unit: '', cmd: '数 engines/*.js 文件个数',
      run: function () { return { ok: true, value: countJs(path.join(root, 'engines')) }; } },
    { id: 'Z1.loadEdges', anchor: '装载期边', unit: '', cmd: '读 tests/module-registry-ledger.json 的 totals.loadEdges',
      run: function () { return readLoadEdges(root); } },
    { id: 'Z3.inline', anchor: '内联码', unit: '', cmd: '读 docs/ERROR_CODES.md 头部「共 N 个内联拒收码」',
      run: function () { const c = readCodes(root); return c.ok ? { ok: true, value: c.values.inline } : c; } },
    { id: 'Z3.witness', anchor: '见证', unit: '', cmd: '读 docs/ERROR_CODES.md 头部「见证 N」',
      run: function () { const c = readCodes(root); return c.ok ? { ok: true, value: c.values.witness } : c; } },
    { id: 'Z3.dead', anchor: '死表', unit: '', cmd: '读 docs/ERROR_CODES.md 头部「死表 N」',
      run: function () { const c = readCodes(root); return c.ok ? { ok: true, value: c.values.dead } : c; } },
    { id: 'Z3.baseline', anchor: '基线', unit: '', cmd: '读 docs/ERROR_CODES.md 头部「基线 N」',
      run: function () { const c = readCodes(root); return c.ok ? { ok: true, value: c.values.baseline } : c; } }
  ];
  // Z2 的八个文件大小：anchor 用计划表里写的文件名原文
  // 名字（计划表里写的）与仓库路径分开 —— 曾把 world.js 拼成 engines/world.js.js
  const files = [
    { name: 'tool-diag', rel: 'engines/tool-diag.js' },
    { name: 'action-desk', rel: 'engines/action-desk.js' },
    { name: 'reject-recovery', rel: 'engines/reject-recovery.js' },
    { name: 'inject-budget', rel: 'engines/inject-budget.js' },
    { name: 'backstage', rel: 'engines/backstage.js' },
    { name: 'world-lab', rel: 'engines/world-lab.js' },
    { name: 'world.js', rel: 'engines/world.js' },
    { name: 'rule-pack', rel: 'engines/rule-pack.js' }
  ];
  files.forEach(function (f) {
    list.push({
      id: 'Z2.' + f.name,
      anchor: '`' + f.name + '`',
      unit: 'K',
      cmd: 'stat ' + f.rel + ' 的字节数 / 1024 取整',
      run: function () { return sizeK(root, f.rel); }
    });
  });
  return list;
}

// ── 明确不可机械复算的读数（必须写 why；不出现即 stale-manual）──────
const MANUAL_READINGS = [
  { text: '**≈29 分钟**', why: '需真跑一趟全量；分钟数随机器与并发负载变，仓里没有可复算的源' },
  { text: '**85M**', why: '隔离器整仓复制是运行时产物（/tmp/worldaxis-regression-*），仓里不存在' }
];

// 数字片段：**575** / **606K** / **≈29 分钟**
const NUM_RE = /\*\*(≈?\s*\d+(?:\.\d+)?)\s*(K|M|分钟)?\s*\*\*/g;

function parsePlan(root) {
  const p = path.join(root, PLAN_REL);
  if (!fs.existsSync(p)) return { ok: false, why: 'plan-missing', lines: [] };
  const src = fs.readFileSync(p, 'utf8').split('\n');
  const opvStart = src.findIndex(function (l) { return l.indexOf(SECTION_OPV) === 0; });
  const rows = [];
  src.forEach(function (l, i) {
    if (l.indexOf(LINE_TAG) !== 0) return;
    rows.push({ lineNo: i + 1, text: l, zone: (opvStart >= 0 && i > opvStart) ? 'optimization' : 'expansion' });
  });
  return { ok: true, why: '', rows: rows };
}

function numberAfter(text, anchor) {
  const i = text.indexOf(anchor);
  if (i < 0) return null;
  const rest = text.slice(i + anchor.length).replace(/^\s+/, '');
  const mm = /^\*\*\s*(≈?\s*\d+(?:\.\d+)?)\s*(K|M|分钟)?\s*\*\*/.exec(rest);
  if (!mm) return { raw: null };
  return { raw: mm[0], value: Number(mm[1].replace(/[^\d.]/g, '')), unit: mm[2] || '' };
}

function audit(root) {
  const r = root || BASE;
  const plan = parsePlan(r);
  if (!plan.ok) return { ok: false, why: plan.why, checked: [], stale: [], unclaimed: [], unreadable: [], manualLines: 0, manualUsed: [] };
  const recipes = buildRecipes(r);
  const checked = [], stale = [], unclaimed = [], unreadable = [];
  const consumed = {};      // 被认领的数字片段文本（按行号）
  const recipeHits = {};    // 每个 recipe 真匹配到几次（0 次 = 读数被删/被改名）
  const manualUsed = [];
  let manualLines = 0;

  plan.rows.forEach(function (row) {
    if (row.zone === 'expansion') { manualLines += 1; return; }   // 整行登记为 manual（见文件头说明）
    consumed[row.lineNo] = [];
    recipes.forEach(function (rec) {
      if (row.text.indexOf(rec.anchor) < 0) return;
      const got = numberAfter(row.text, rec.anchor);
      if (!got) return;                       // anchor 在这一行的别处出现（不紧跟数字）
      // 同一 anchor 会以别的语境出现在别组（如 Z5 行的 tool-diag 是「接线四件套」而非读数）
      // ⇒ 后面不是数字就跳过；「读数被删」由下面的 recipeHits 兜底
      if (got.raw === null) return;
      consumed[row.lineNo].push(got.raw.replace(/\s/g, ''));
      recipeHits[rec.id] = (recipeHits[rec.id] || 0) + 1;
      if (got.unit !== rec.unit) {
        unreadable.push({ id: rec.id, line: row.lineNo, why: 'unit-mismatch：写的单位是 ' + (got.unit || '(无)') + '，recipe 要求 ' + (rec.unit || '(无)') });
        return;
      }
      const live = rec.run();
      if (!live.ok) { unreadable.push({ id: rec.id, line: row.lineNo, why: live.why }); return; }
      const unitSuffix = rec.unit === 'K' ? 'K' : '';
      checked.push({ id: rec.id, line: row.lineNo, written: got.value, live: live.value, cmd: rec.cmd });
      if (got.value !== live.value) {
        stale.push({ id: rec.id, line: row.lineNo, written: got.value + unitSuffix, live: live.value + unitSuffix, cmd: rec.cmd });
      }
    });
    // 行内每个含数字的粗体片段：必须被 recipe 认领，或登记为 manual
    let m;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(row.text))) {
      const frag = m[0].replace(/\s/g, '');
      if (consumed[row.lineNo].indexOf(frag) >= 0) continue;
      let isManual = false;
      MANUAL_READINGS.forEach(function (mr) {
        if (mr.text.replace(/\s/g, '') === frag) { isManual = true; if (manualUsed.indexOf(mr.text) < 0) manualUsed.push(mr.text); }
      });
      if (!isManual) unclaimed.push({ line: row.lineNo, frag: m[0], why: '行内有数字但既无 recipe 也未登记为不可复算' });
    }
  });

  // 每个 recipe 至少匹配到一次：否则「把数字删掉」会让那一条从 checked 里安静消失
  const unmatched = Object.keys(recipeHits).length === 0 ? [] : buildRecipes(r).filter(function (rec) {
    return !recipeHits[rec.id];
  }).map(function (rec) {
    return { id: rec.id, line: 0, why: 'recipe 在计划表里一次也没匹配到（读数被删或被改名？不许静默少检一条）' };
  });
  unmatched.forEach(function (u) { unreadable.push(u); });

  // 白名单里登记了却没出现 ⇒ 白名单在说谎（会长成永远匹配不上的借口）
  const staleManual = MANUAL_READINGS.filter(function (mr) { return manualUsed.indexOf(mr.text) < 0; })
    .map(function (mr) { return { text: mr.text, why: '登记为不可复算，但计划表里已找不到这个读数' }; });

  const ok = stale.length === 0 && unclaimed.length === 0 && unreadable.length === 0 && staleManual.length === 0;
  return { ok: ok, why: '', checked: checked, stale: stale, unclaimed: unclaimed,
    unreadable: unreadable, staleManual: staleManual, manualLines: manualLines,
    manualUsed: manualUsed, planRows: plan.rows.length };
}

function reportLines(res) {
  const L = [];
  if (res.why === 'plan-missing') { L.push('✗ 计划表缺失：' + PLAN_REL); return L; }
  L.push('可复算读数 ' + res.checked.length + ' 条（逐条比对现场）· 不可复算 ' +
    res.manualLines + ' 行 + ' + res.manualUsed.length + ' 条白名单 · 计划表组读数行 ' + res.planRows);
  res.checked.forEach(function (c) {
    const eq = c.written === c.live ? '=' : '≠';
    L.push('  ' + (c.written === c.live ? '·' : '!') + ' ' + c.id + '：计划 ' + c.written + ' ' + eq + ' 现场 ' + c.live + '（' + c.cmd + '）');
  });
  res.stale.forEach(function (s) {
    L.push('  ✗ [stale] ' + s.id + '（第 ' + s.line + ' 行）：计划写 ' + s.written + '，现场 ' + s.live + ' —— 复算：' + s.cmd);
  });
  res.unclaimed.forEach(function (u) {
    L.push('  ✗ [unclaimed] 第 ' + u.line + ' 行的 ' + u.frag + '：' + u.why);
  });
  res.unreadable.forEach(function (u) {
    L.push('  ✗ [unreadable] ' + u.id + '（第 ' + u.line + ' 行）：' + u.why + '（读不到不当成相等）');
  });
  res.staleManual.forEach(function (s) {
    L.push('  ✗ [stale-manual] ' + s.text + '：' + s.why);
  });
  return L;
}

function main() {
  const argv = process.argv.slice(2);
  let root = BASE;
  argv.forEach(function (a) { if (a.indexOf('--root=') === 0) root = path.resolve(a.slice(7)); });
  const res = audit(root);
  if (argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify(res, null, 2));
    return res.ok ? 0 : 1;
  }
  reportLines(res).forEach(function (l) { console.log(l); });
  if (res.ok) {
    console.log('✓ plan-readings: pass（' + res.checked.length + ' 条可复算读数与现场全等）');
    return 0;
  }
  const n = (res.stale || []).length + (res.unclaimed || []).length +
    (res.unreadable || []).length + (res.staleManual || []).length;
  console.log('✗ plan-readings: FAIL ' + n + ' 条（过期 ' + (res.stale || []).length +
    ' / 无人认领 ' + (res.unclaimed || []).length + ' / 读不到 ' + (res.unreadable || []).length +
    ' / 白名单腐烂 ' + (res.staleManual || []).length + '）');
  console.log('  处置：把计划表里的数字改成现场值（并保留复算命令），不要删掉这行读数');
  return 1;
}

if (require.main === module) process.exit(main());
module.exports = { audit: audit, parsePlan: parsePlan, reportLines: reportLines,
  countJs: countJs, readCodes: readCodes, readLoadEdges: readLoadEdges,
  NUM_RE: NUM_RE, MANUAL_READINGS: MANUAL_READINGS };