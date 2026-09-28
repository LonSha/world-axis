#!/usr/bin/env node
/**
 * WorldAxis tools/gen-error-codes.js (v2.114.0) — 拒收码手册生成与双向校验（计划二 #64）
 *
 * ── 它治什么 ────────────────────────────────────────────────
 *   全仓 399 个内联拒收码，唯一的分类载体是三份**给门禁读的**表（见证表 / 死表 / 基线台账），
 *   没有一份**给人读的**清单：新人搜一个码（如 bad-layer-or-key）只能 grep 出定义点，
 *   读不到「它什么时候出现、为什么出现」。
 *
 * ── 三条口径（否定式）────────────────────────────────────────
 *   ① **不新增数据源**：生成源与 `reject-code-gate` 同源（scan + 见证表 + 死表 + 基线）。
 *      另起一份码表就是双真源，改了甲忘乙的那天，手册会开始说谎。
 *   ② **只报不改码**：本工具不写产品源码、不改三份表，只写 `docs/ERROR_CODES.md`。
 *   ③ **--check 是双向的**：文档少一个码 = 红灯；文档多一个码（源码里已消失）= 红灯。
 *      「台账不得比现实胖」这条纪律（v2.97.0）同样适用于文档。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

const DOC_REL = 'docs/ERROR_CODES.md';

/** 汇总三源 + 扫描面 ⇒ 每个码的 {code, tier, where, desc} */
/**
 * 见证描述只存在于「真跑一遍」的返回值里（runWitness 内部的 expect 图），故本工具按
 * 门禁 CLI 同一路径装一遍产品面并跑见证。装不起来时不伪造描述（空字符串），
 * 且在函数头注明——「没读到描述」与「该码没有描述」不得同形。
 */
function loadWitness() {
  try {
    require('../tests/mock.js');
    const vm = require('vm');
    const ctx = vm.createContext(global);
    const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
    const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
    mm[1].match(/'([^']+)'/g).forEach(function (x) {
      const rel = x.slice(1, -1);
      vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
    });
    const witness = require('../tests/reject-v2780.js');
    const w = witness.runWitness(global.WorldAxis);
    return { ok: true, expect: w.expect || {}, missing: w.missing || [], note: '' };
  } catch (e) {
    return { ok: false, expect: {}, missing: [], note: String((e && e.message) || e).slice(0, 120) };
  }
}

function collect() {
  const gate = require('../tests/reject-code-gate.js');
  const witness = require('../tests/reject-v2780.js');
  const ledger = require('../tests/reject-code-ledger.json');
  const sc = gate.scan();
  const live = loadWitness();
  const watched = live.expect;
  const dead = witness.DEAD || {};
  const base = {};
  (ledger.base || []).forEach(function (c) { base[c] = true; });

  const codes = Object.keys(sc.hits).sort();
  const rows = codes.map(function (c) {
    let tier = 'base', desc = '';
    if (watched[c]) { tier = 'witnessed'; desc = watched[c]; }
    else if (dead[c]) { tier = 'dead'; desc = (dead[c].why || '').replace(/\s+/g, ' '); }
    else if (base[c]) { tier = 'base'; desc = '存量未分类（v2.97.0 基线）；接上见证或列入死表即回收到前两档'; }
    else { tier = 'unclassified'; desc = '未分类 —— 门禁红灯'; }
    return { code: c, tier: tier, where: sc.hits[c].map(function (h) { return h.file; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', '), desc: desc };
  });
  const byTier = { witnessed: 0, dead: 0, base: 0, unclassified: 0 };
  rows.forEach(function (r) { byTier[r.tier]++; });
  return { rows: rows, byTier: byTier, total: rows.length, version: ledger.version || '?', witnessLive: live };
}

function esc(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

function build() {
  const d = collect();
  const L = [];
  L.push('# WorldAxis 拒收码手册（自动生成：`node tools/gen-error-codes.js`）');
  L.push('');
  L.push('> 台账 version：`' + d.version + '`。**不要手改本文件** —— 生成源是 `reject-v2780.js`（见证/死表）、');
  L.push('> `reject-code-ledger.json`（基线）与产品源码扫描面，手改的内容下一次生成即被覆盖。');
  L.push('');
  L.push('共 **' + d.total + '** 个内联拒收码：见证 ' + d.byTier.witnessed + ' / 死表 ' + d.byTier.dead
    + ' / 基线 ' + d.byTier.base + (d.byTier.unclassified ? ' / **未分类 ' + d.byTier.unclassified + '**' : ''));
  if (d.witnessLive && !d.witnessLive.ok) { L.push(''); L.push('> ⚠ 见证描述本次未读到（产品面装不起来：' + esc(d.witnessLive.note) + '）——下表见证档的说明列为空是「没读到」，不是「不存在」。'); }
  L.push('');
  L.push('三档的含义：**见证**=用产品真 API 把它跑出来过（行为改动会让见证失败，红灯）；');
  L.push('**死表**=已证结构不可达，且钉住「为何不可达」的锚点（锚点消失即红灯）；');
  L.push('**基线**=存量未分类（新增未分类码即红灯）。');
  L.push('');
  const sec = function (title, tier) {
    const rows = d.rows.filter(function (r) { return r.tier === tier; });
    L.push('## ' + title + '（' + rows.length + '）');
    L.push('');
    if (!rows.length) { L.push('（无）'); L.push(''); return; }
    L.push('| 码 | 出现之处 | 说明 |');
    L.push('| --- | --- | --- |');
    rows.forEach(function (r) { L.push('| `' + esc(r.code) + '` | ' + esc(r.where) + ' | ' + esc(r.desc) + ' |'); });
    L.push('');
  };
  sec('见证（可执行）', 'witnessed');
  sec('死表（已证不可达）', 'dead');
  sec('基线（存量未分类）', 'base');
  if (d.byTier.unclassified) sec('未分类（门禁红灯）', 'unclassified');
  return L.join('\n') + '\n';
}

/** 双向校验：文档缺失码 / 文档多余码 / 未分类码 */
function check(opts) {
  const o = opts || {};
  const d = collect();
  const abs = path.join(BASE, DOC_REL);
  let text = null;
  if (typeof o.docText === 'string') text = o.docText;
  else try { text = fs.readFileSync(abs, 'utf8'); } catch (e) { text = null; }
  const inDoc = {};
  if (text) {
    const re = /^\| `([^`]+)` \|/gm;
    let m;
    while ((m = re.exec(text)) !== null) inDoc[m[1]] = true;
  }
  const missing = text === null ? [] : d.rows.filter(function (r) { return !inDoc[r.code]; }).map(function (r) { return r.code; });
  const extra = text ? Object.keys(inDoc).filter(function (c) { return !d.rows.some(function (r) { return r.code === c; }); }) : [];
  return {
    ok: !!text && !missing.length && !extra.length && !d.byTier.unclassified,
    docExists: !!text, total: d.total, byTier: d.byTier,
    missing: missing, extra: extra, docRel: DOC_REL
  };
}

module.exports = { collect: collect, build: build, check: check, DOC_REL: DOC_REL };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--check') >= 0) {
    const r = check();
    console.log('■ 拒收码手册双向校验');
    console.log('  文档 ' + r.docRel + '：' + (r.docExists ? '在场' : '缺失'));
    console.log('  源码内联码 ' + r.total + ' 个（见证 ' + r.byTier.witnessed + ' / 死表 ' + r.byTier.dead + ' / 基线 ' + r.byTier.base + '）');
    if (r.missing.length) console.log('  ✗ 文档缺码（手册落后于源码）: ' + r.missing.slice(0, 12).join(', ') + (r.missing.length > 12 ? ' …（共 ' + r.missing.length + '）' : ''));
    if (r.extra.length) console.log('  ✗ 文档多余码（源码里已消失，手册不得比现实胖）: ' + r.extra.slice(0, 12).join(', '));
    if (r.byTier.unclassified) console.log('  ✗ 未分类码 ' + r.byTier.unclassified + ' 个（见 reject-code-gate）');
    if (r.ok) console.log('  ✓ 文档与三源一致，无缺无余');
    process.exit(r.ok ? 0 : 1);
  }
  const out = path.join(BASE, DOC_REL);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, build());
  const r = check();
  console.log('已生成 ' + DOC_REL + '：' + r.total + ' 码（见证 ' + r.byTier.witnessed + ' / 死表 ' + r.byTier.dead + ' / 基线 ' + r.byTier.base + '）');
  process.exit(r.ok ? 0 : 1);
}