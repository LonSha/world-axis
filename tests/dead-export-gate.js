#!/usr/bin/env node
// WorldAxis tests/dead-export-gate.js — 死子面冻结账本门禁（v2.27.0）
//
// 缺口（它治什么）：
//   出口面契约（tests/export-contract.js 生成冻结串 + tests/run.js 的 FROZEN2800 断言）钉住的是
//   **整个 interface 面**：命名空间 × 成员的集合有没有被增删。它不区分「这个成员有没有消费方」，
//   于是**新增一个产品代码永不引用的导出，只要把冻结串一并回填，契约照样通过**。
//   也就是说死导出（dead）这一子面长期无账本、无门禁——v2.11.0 曾把 70 项真死导出分级
//   （internal-helper / unwired）并接通其中一部分能力，但之后任何一轮新增死导出都不会有任何提示：
//   它是一条**静默增长**的面。
//
// 本门禁的三条纪律：
//   ① 口径单源：直接 require('./inventory.js') 的 collect()，不另写一份「表面求差」实现。
//      判据的输入面与结论面必须是同一件事，否则会出现「门禁绿、清册红」这种互相矛盾的结论。
//   ② 冻结而非放行：账本 tests/dead-export-ledger.json 逐条登记当前死导出及归因；
//      新增死导出 = 红灯（要么显式 --update 登记，要么给导出接上消费方、要么删掉它）。
//   ③ 归因由测量判定、不留占位：不写 TODO——
//        test-only：产品零引用但 tests/run.js 有引用 ⇒ 产能保留在测试里；
//        self-only：定义文件内部自用、外部零引用 ⇒ 过度导出；
//        unwired  ：产品与测试都零引用 ⇒ 能力已实现、消费端未接线。
//
// 复用的判据与清册完全一致（见 tests/inventory.js）：
//   「死」= 函数成员在产品代码（不含 tests/、tools/）内零引用；dataOnly 是常量/数据成员，
//   常被测试与诊断间接消费，单列备查、不进冻结面。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const LEDGER_PATH = path.join(__dirname, 'dead-export-ledger.json');
const inventory = require('./inventory.js');

// 被冻结的两个死面：模块接口面的函数成员 + UI 层函数成员（无头环境不装载，但成员名是静态可判的）
const FROZEN_KINDS = ['dead', 'uiDead'];
// 只记录计数、不拦截的面（常量/数据成员零引用）
const ADVISORY_KINDS = ['dataOnly'];
const REASON_CODES = ['test-only', 'self-only', 'unwired'];

function keyOf(rec) { return rec.ns + '.' + rec.mem; }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 命名空间 → 定义文件（用于判断「是否只在定义文件内部自用」）
function nsToFile() {
  const out = {};
  const inv = inventory.MODULE_EXPORTS;
  Object.keys(inv).forEach(function (f) { out[inv[f]] = f; });
  return out;
}

// 定义文件内部是否自用该成员：声明 1 处 + 使用 ≥1 处（才算是「过度导出」）
function selfUsed(fileMap, ns, mem) {
  const rel = fileMap[ns];
  if (!rel) return false;
  let src;
  try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { return false; }
  const re = new RegExp('(?<![\\w$])' + escapeRe(mem) + '(?![\\w$])', 'g');
  let n = 0, m;
  while ((m = re.exec(src))) { n++; if (n >= 2) return true; }
  return false;
}

function classify(fileMap, rec) {
  if (rec.inTests) return 'test-only';
  if (selfUsed(fileMap, rec.ns, rec.mem)) return 'self-only';
  return 'unwired';
}

function detailOf(code, fileMap, rec) {
  if (code === 'test-only') return '仅测试引用（tests/run.js），产品代码零引用';
  if (code === 'self-only') return (fileMap[rec.ns] || '定义文件') + ' 内部自用、外部零引用（过度导出）';
  return '产品与测试均零引用（能力未接线）';
}

function byKey(a, b) { return keyOf(a) < keyOf(b) ? -1 : 1; }

// 依据一次 collect() 结果生成账本（逐条 reason + detail）
function build(result, version) {
  const fileMap = nsToFile();
  const out = {
    _note: 'WorldAxis 死子面冻结账本（v2.27.0）。dead / uiDead 两面由 tests/dead-export-gate.js 冻结：'
         + '出现新条目即红灯（须显式 --update 登记，或给导出接上消费方、或删除它）。'
         + 'advisory 面只记计数、不拦截。判据口径与 tests/inventory.js 同源。',
    version: version,
    dead: {},
    uiDead: {}
  };
  FROZEN_KINDS.forEach(function (kind) {
    result[kind].slice().sort(byKey).forEach(function (rec) {
      const code = classify(fileMap, rec);
      out[kind][keyOf(rec)] = { reason: code, detail: detailOf(code, fileMap, rec) };
    });
  });
  out.advisory = {};
  ADVISORY_KINDS.forEach(function (kind) { out.advisory[kind] = result[kind].length; });
  return out;
}

// 保留账本中已有条目的归因（人工/代理修正过的理由不被自动分类覆盖），只补新增、去掉消失
function refresh(result, ledger, version) {
  const next = build(result, version);
  if (ledger) {
    FROZEN_KINDS.forEach(function (kind) {
      const old = ledger[kind] || {};
      Object.keys(next[kind]).forEach(function (k) {
        if (old[k] && old[k].reason && REASON_CODES.indexOf(old[k].reason) >= 0) next[kind][k] = old[k];
      });
    });
  }
  return next;
}

function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return null;
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

// 判定：added（新增死导出）与 staleReason（账本归因坏了）是红灯；gone（登记的死导出消失）只提示
function judge(result, ledger) {
  const fileMap = nsToFile();
  const out = { added: [], gone: [], staleReason: [], advisory: {}, ok: true };
  if (!ledger || typeof ledger !== 'object') {
    out.added.push({ kind: 'ledger', key: '（账本缺失）', reason: 'unwired', detail: 'tests/dead-export-ledger.json 不存在或不可解析' });
    out.ok = false;
    return out;
  }
  FROZEN_KINDS.forEach(function (kind) {
    const now = {};
    (result[kind] || []).forEach(function (rec) {
      now[keyOf(rec)] = { reason: classify(fileMap, rec), detail: detailOf(classify(fileMap, rec), fileMap, rec) };
    });
    const frozen = ledger[kind] || {};
    Object.keys(now).forEach(function (k) {
      if (!frozen[k]) out.added.push({ kind: kind, key: k, reason: now[k].reason, detail: now[k].detail });
    });
    Object.keys(frozen).forEach(function (k) {
      const item = frozen[k] || {};
      if (!now[k]) { out.gone.push({ kind: kind, key: k, reason: item.reason }); return; }
      if (REASON_CODES.indexOf(item.reason) < 0) out.staleReason.push({ kind: kind, key: k, reason: String(item.reason) });
    });
  });
  ADVISORY_KINDS.forEach(function (kind) {
    const was = (ledger.advisory || {})[kind];
    const nowN = (result[kind] || []).length;
    out.advisory[kind] = { was: was, now: nowN, delta: (typeof was === 'number') ? nowN - was : null };
  });
  out.ok = out.added.length === 0 && out.staleReason.length === 0;
  return out;
}

function versionOf() {
  const idx = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  return (idx.match(/const VERSION = '([\d.]+)'/) || [])[1] || '0.0.0';
}

function report(result, verdict) {
  console.log('');
  console.log('■ 死子面冻结门禁（dead / uiDead）');
  console.log('  冻结面规模 dead ' + result.dead.length + ' · uiDead ' + result.uiDead.length
    + ' · 归因分布 test-only ' + result.dead.filter(function (d) { return d.inTests; }).length
    + ' / 其余 ' + result.dead.filter(function (d) { return !d.inTests; }).length);
  if (verdict.added.length) {
    console.log('  ✗ 新增死导出 ' + verdict.added.length + ' 项（未登记 = 产品代码零引用，是静默增长的面）:');
    verdict.added.forEach(function (a) { console.log('    + ' + a.key + '  [' + a.reason + '] ' + a.detail); });
  }
  if (verdict.staleReason.length) {
    console.log('  ✗ 账本归因不可读 ' + verdict.staleReason.length + ' 项（reason 不在词表内）:');
    verdict.staleReason.forEach(function (s) { console.log('    ? ' + s.key + '  reason=' + s.reason); });
  }
  if (verdict.gone.length) {
    console.log('  ⚠ 已登记的死导出消失 ' + verdict.gone.length + ' 项（接通或删除后请跑 --update 收敛账本）:');
    verdict.gone.forEach(function (g) { console.log('    - ' + g.key + '  [' + g.reason + ']'); });
  }
  Object.keys(verdict.advisory).forEach(function (k) {
    const a = verdict.advisory[k];
    console.log('  ⓘ ' + k + '（备查，不拦截）: ' + a.was + ' → ' + a.now + (a.delta ? '（Δ' + a.delta + '）' : ''));
  });
  if (!verdict.added.length && !verdict.staleReason.length) console.log('  ✓ 死子面无新增、归因可读');
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.indexOf('--json') >= 0;
  const doUpdate = argv.indexOf('--update') >= 0;
  const result = inventory.collect();
  if (doUpdate) {
    const before = loadLedger();
    const next = refresh(result, before, versionOf());
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(next, null, 2) + '\n');
    const bd = before ? Object.keys(before.dead || {}).length : 0;
    const bu = before ? Object.keys(before.uiDead || {}).length : 0;
    console.log('[dead-export-gate] 账本已写入 ' + LEDGER_PATH);
    console.log('  dead ' + bd + ' → ' + Object.keys(next.dead).length + ' · uiDead ' + bu + ' → ' + Object.keys(next.uiDead).length);
    // 同 inventory.js：用 exitCode 而非 process.exit()，避免大输出经管道时被截断
    process.exitCode = 0;
    return;
  }
  const verdict = judge(result, loadLedger());
  if (asJson) console.log(JSON.stringify(verdict, null, 2)); else report(result, verdict);
  // 同 inventory.js：--json 的结论体可能很大，process.exit() 会截断管道写入
  process.exitCode = verdict.ok ? 0 : 1;
}

if (require.main === module) main();
module.exports = { LEDGER_PATH: LEDGER_PATH, FROZEN_KINDS: FROZEN_KINDS, ADVISORY_KINDS: ADVISORY_KINDS,
  REASON_CODES: REASON_CODES, loadLedger: loadLedger, build: build, refresh: refresh, judge: judge,
  classify: classify, detailOf: detailOf, selfUsed: selfUsed, nsToFile: nsToFile, keyOf: keyOf, report: report };
