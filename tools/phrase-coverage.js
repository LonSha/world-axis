#!/usr/bin/env node
'use strict';
// WorldAxis tools/phrase-coverage.js (v2.524.0) — OPV29-13 码话术覆盖率
//
// ── 病 ────────────────────────────────────────────────────────────
// `engines/reject-phrase.js` 已有话术面（CLUSTERS + phraseOf），但**覆盖率没人量化**：
//   计划表上写的是「已有话术面但覆盖率未量化」。没有读数就没法回答两个具体问题：
//     · 现在有多少**在用**的拒收码，玩家看到的是英文码而不是一句话？
//     · 新加一个码时，谁提醒我它没有话术？
//   没有读数的直接后果是：这些话术面会慢慢腐烂，而没有任何判据看得见它腐烂。
//
// ── 口径（三档，缺一假绿）────────────────────────────────────────
// 在用码 = 产品扫描面（1905）− 死表（52）= 1853 = 见证（916）+ 基线（937）。
//   这两条路等价（`docs/ERROR_CODES.md` 头部就是按这个划分印的），取「扫描 − 死表」：
//   见证表只能**真跑一遍**才拿得到（实测 65s），而死表在 `tests/reject-v2780.js`
//   里是静态常量（`require` 即得，实测 1.3s）。同一条事实用便宜的算法算。
//   **死表不算**：死码已经不可达，给它写话术是给死路修路灯（OPV29-14 会逐条定性）。
//   · covered   命中某个簇 ⇒ 有玩家话
//   · uncovered 没命中 ⇒ 玩家会看到裸码（必须点名，不许只报百分比）
//   · unreadable 读不到码表 / 读不到引擎 ⇒ **不算通过**（与 plan-readings 的
//     non-numeric 同源：不知道 ≠ 没问题）
//
// ── 用法 ────────────────────────────────────────────────────────────
//   node tools/phrase-coverage.js            # 人读
//   node tools/phrase-coverage.js --check    # 覆盖率达标 ⇒ rc 0，否则 1
//   node tools/phrase-coverage.js --json     # 结构化
//   node tools/phrase-coverage.js --ledger   # 把读数写进 tests/phrase-coverage-ledger.json

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const LEDGER = path.join(ROOT, 'tests/phrase-coverage-ledger.json');

// 达标线：覆盖率不许低于当前现场（只许升不许降）。
//   首次实测（2026-11-19，v2.524.0）：837 / 1853 = 45.2% ⇒ 冻结在 45.2。
//   这里必须先量再填。上一版我先填了 63.0 再去量，结果量出 0%（解析面错），
//   于是「覆盖率 0%」和「达标线 63%」同时出现在一份读数里 —— 两个数字没有一个
//   来自现场。这一版的两个数都是从命令输出里抄下来的。
const BASELINE_PERCENT = 45.2;

function readJson(root, rel) {
  try { return { ok: true, value: JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')) }; }
  catch (e) { return { ok: false, why: 'unreadable: ' + (e && e.code ? e.code : 'parse') }; }
}

// 在 vm 里只装 reject-phrase 需要的三件（clock / settingsBus / registerModule）
//   读不到引擎时**返回 null**，不抛 —— 抛出会把「读不到」和「覆盖率不达标」混成
//   同一个非零退出码，而这两件事的处理方式完全不同（前者要先修面，后者要补话术）。
function loadPhrase(root) {
  const WA = { __settingsRegs: [] };
  WA.clock = { now: function () { return 0; } };
  WA.settingsBus = {
    read: function () { return {}; },
    normalize: function (reg, v) { return v; },
    save: function () { return true; }
  };
  const ctx = vm.createContext({
    window: { WorldAxis: WA },
    console: { log: function () {} },
    Date: Date, JSON: JSON, Object: Object, Number: Number,
    String: String, Array: Array, Math: Math, RegExp: RegExp
  });
  let src;
  try { src = fs.readFileSync(path.join(root, 'engines/reject-phrase.js'), 'utf8'); }
  catch (e) { return null; }
  try { vm.runInContext(src, ctx, { filename: 'reject-phrase.js' }); }
  catch (e) { return null; }
  return ctx.window.WorldAxis.rejectPhrase || null;
}

// 取「在用码」：产品扫描面 − 死表。
//   旧版这里读 `Object.keys(ledger.base)` —— 但 base 是**字符串数组**，
//   Object.keys 拿到的是 "0","1","2"… 下标，于是每个码都被判成「未覆盖」，
//   覆盖率恒为 0%。这与 OPV29-24 只认 `rel:` 形态是同一种病：**解析面比事实窄**。
//   现在两边的真源都是可执行的东西（扫描器 + 静态死表），不靠猜字段形状。
//
// 三处交叉核对（任一处对不上就返回 ok:false，不返回一个「差不多」的覆盖率）：
//   · 死表条数 ≡ ledger.deadCount
//   · ledger.base 的每个码都必须还在扫描面里（否则台账 stale，覆盖率是算给旧世界的）
//   · 扫描面非空
function liveCodes(root) {
  const led = readJson(root, 'tests/reject-code-ledger.json');
  if (!led.ok) return { ok: false, why: led.why };
  let gate, wit;
  try { gate = require(path.join(root, 'tests/reject-code-gate.js')); }
  catch (e) { return { ok: false, why: 'gate-unreadable: ' + ((e && e.code) || 'load') }; }
  try { wit = require(path.join(root, 'tests/reject-v2780.js')); }
  catch (e) { return { ok: false, why: 'witness-unreadable: ' + ((e && e.code) || 'load') }; }
  let scanned;
  try { scanned = Object.keys((gate.scan() || {}).hits || {}).sort(); }
  catch (e) { return { ok: false, why: 'scan-failed: ' + ((e && e.message) || 'throw').slice(0, 60) }; }
  if (!scanned.length) return { ok: false, why: 'scan-empty' };
  const dead = (wit && wit.DEAD) || {};
  const deadKeys = Object.keys(dead);
  const live = scanned.filter(function (c) { return !dead[c]; });
  if (!live.length) return { ok: false, why: 'no-live-codes' };
  const bad = [];
  if (led.value.deadCount !== deadKeys.length) {
    bad.push('deadCount ledger=' + led.value.deadCount + ' vs DEAD=' + deadKeys.length);
  }
  const baseArr = Array.isArray(led.value.base) ? led.value.base : [];
  if (!baseArr.length) bad.push('base-not-array');
  const stale = baseArr.filter(function (c) { return scanned.indexOf(c) < 0; });
  if (stale.length) bad.push('base-stale=' + stale.length + '(' + stale.slice(0, 3).join('|') + ')');
  return {
    ok: true, live: live, scanned: scanned.length,
    dead: deadKeys.length, base: baseArr.length,
    crossBad: bad
  };
}

function audit(root) {
  const base = root || ROOT;
  const phrase = loadPhrase(base);
  if (!phrase) return { ok: false, why: 'engine-unreadable' };

  const live = liveCodes(base);
  if (!live.ok) return { ok: false, why: live.why, phrase: true };
  const cov = phrase.coverage(live.live, { maxMissing: 60 });

  // 交叉核对：ERROR_CODES.md 头部的三档计数（生成物）必须与两边口径对得上。
  //   README 那行是「见证 N / 死表 M / 基线 K」，只用来核对 N 与 K 的量级，
  //   不做逐码比对（那是 reject-code-gate 的活儿）。
  let docText = null;
  try { docText = fs.readFileSync(path.join(base, 'docs/ERROR_CODES.md'), 'utf8'); } catch (e) { docText = null; }
  let docCounts = null;
  if (docText) {
    const m = docText.match(/见证\s*(\d+)\s*\/\s*死表\s*(\d+)\s*\/\s*基线\s*(\d+)/);
    if (m) docCounts = { witnessed: Number(m[1]), dead: Number(m[2]), base: Number(m[3]) };
  }

  // 硬判据（缺一假绿）：
  //   · 台账与扫描面互相承认（liveCodes 的 crossBad 为空）
  //   · 文档头部三档计数与现场一致（第二份真源；失配说明改了码表没重生成）
  //   · 有码可算（total > 0）
  //   · 覆盖率不低于冻结基线
  //   上一版这里还挂着一条 `cov.uncovered >= 0` —— 那是恒真式（除以 0 之外恒成立），
  //   等于没有判据。删掉，换成会真红的 doc-drift。
  const bad = live.crossBad.slice();
  if (docCounts) {
    if (docCounts.dead !== live.dead) {
      bad.push('doc-dead ' + docCounts.dead + ' vs DEAD ' + live.dead);
    }
    if (docCounts.witnessed + docCounts.base !== live.live.length) {
      bad.push('doc-live ' + (docCounts.witnessed + docCounts.base) + ' vs live ' + live.live.length);
    }
  } else {
    bad.push('doc-counts-unreadable');
  }
  const ok = bad.length === 0 && cov.total > 0 && cov.percent >= BASELINE_PERCENT;
  return {
    ok: ok,
    total: cov.total,
    covered: cov.covered,
    uncovered: cov.uncovered,
    percent: cov.percent,
    byCluster: cov.byCluster,
    missing: cov.missing,
    missingTotal: cov.missingTotal,
    baselinePercent: BASELINE_PERCENT,
    docCounts: docCounts,
    scanned: live.scanned,
    dead: live.dead,
    base: live.base,
    crossBad: bad,
    clusters: phrase.clusters().length
  };
}

function render(res) {
  const L = [];
  L.push('WorldAxis 拒收码话术覆盖率（OPV29-13）');
  if (!res.ok && res.why) { L.push('  ✗ 读不到：' + res.why + '（不知道 ≠ 没问题）'); return L.join('\n'); }
  L.push('  在用码 ' + res.total + ' 个 = 扫描面 ' + res.scanned + ' − 死表 ' + res.dead +
         '（基线表 ' + res.base + ' 条；死表不算 —— 给死路修路灯没有意义）');
  L.push('  有玩家话 ' + res.covered + ' · 裸码 ' + res.uncovered + ' · 覆盖率 **' + res.percent + '%**（达标线 ' + res.baselinePercent + '%）');
  L.push('  话术簇 ' + res.clusters + ' 个');
  if (res.docCounts) {
    L.push('  交叉核对（docs/ERROR_CODES.md 头部）：见证 ' + res.docCounts.witnessed +
           ' / 死表 ' + res.docCounts.dead + ' / 基线 ' + res.docCounts.base);
  }
  if (res.crossBad && res.crossBad.length) {
    L.push('  交叉核对失配 ' + res.crossBad.length + ' 处（读数算给的是旧世界，不算通过）：');
    res.crossBad.forEach(function (x) { L.push('    · ' + x); });
  }
  if (res.missingTotal) {
    L.push('  裸码点名（前 ' + res.missing.length + ' / 共 ' + res.missingTotal + '）：');
    res.missing.forEach(function (c) { L.push('    · ' + c); });
  }
  if (res.ok) L.push('  ⇒ 覆盖率达标');
  else if (res.crossBad && res.crossBad.length) L.push('  ⇒ 不通过：交叉核对失配（覆盖率这个数字不算数）');
  else L.push('  ⇒ 未达标（低于 ' + res.baselinePercent + '%）');
  return L.join('\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const res = audit();
  if (args.indexOf('--json') >= 0) console.log(JSON.stringify(res, null, 2));
  else console.log(render(res));

  if (args.indexOf('--ledger') >= 0 && res.ok !== undefined) {
    const out = {
      _note: '拒收码话术覆盖率读数（由 tools/phrase-coverage.js 生成，勿手改）。' +
             '口径：在用码 = 见证 + 基线；死表不算（不可达的码给它写话术是给死路修路灯）。',
      version: (function () {
        try { return (fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1]; }
        catch (e) { return null; }
      })(),
      baselinePercent: res.baselinePercent,
      total: res.total,
      covered: res.covered,
      uncovered: res.uncovered,
      percent: res.percent,
      byCluster: res.byCluster,
      missingTotal: res.missingTotal,
      generatedBy: 'tools/phrase-coverage.js --ledger'
    };
    fs.writeFileSync(LEDGER, JSON.stringify(out, null, 2) + '\n');
    console.log('  已写入 ' + path.relative(ROOT, LEDGER));
  }

  if (args.indexOf('--check') >= 0) process.exit(res.ok ? 0 : 1);
}

module.exports = { audit: audit, render: render, loadPhrase: loadPhrase, liveCodes: liveCodes, BASELINE_PERCENT: BASELINE_PERCENT };