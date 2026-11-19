#!/usr/bin/env node
'use strict';
// WorldAxis tools/release-manifest.js (v2.524.0) — OPV29-27 版本面跟位 + OPV29-35 发布清单化
//
// ── 两个病，一个落点 ────────────────────────────────────────────────
// 27（版本面跟位）：升版时「一处改、全仓跟」只靠人守。现场有 164 个文件提到 2.524.0，
//   但其中绝大多数是**历史注释**（"v2.524.0 跟位：…"），把它们一起改就是篡改历史。
//   所以先回答一个更基本的问题：**哪些位置是"版本声明"，哪些只是"历史上提到过"**。
//   本工具把前者固定成一张**有名字的清单**（VERSION_SURFACE），逐条给出「怎么读」；
//   清单外的一律不算版本面 —— 宁可少认，不许把注释也算进来（那会逼人改注释）。
// 35（发布清单化）：一次发版要同时对齐 版本 / BUILD_ID / 账本 / 文档 / 清单，
//   缺一项就发出去，用户看到的是「装上了但版本号对不上」。本工具一屏核完并给
//   缺项点名；`--check` 退出码非 0 即「不许发」。
//
// ── 一条纪律（本仓踩过）─────────────────────────────────────────────
// **读不到 ≠ 通过**。任一载体文件缺失 / 解析失败，记 `unreadable` 并整项红，
//   不许当作「这一面没问题」。与 plan-readings 的 non-numeric 同源。
//
// ── 用法 ────────────────────────────────────────────────────────────
//   node tools/release-manifest.js            # 人读的一屏清单
//   node tools/release-manifest.js --check    # 机器判：全等且齐全 ⇒ rc 0，否则 rc 1
//   node tools/release-manifest.js --json     # 结构化（测试消费）

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 版本面：**唯一真源 + 必须跟位的副本**。每条写明「怎么读」，谁都能复算。
// kind: 'source' = 改版的发起处（改了它才算升版）；'mirror' = 必须跟它一致。
const VERSION_SURFACE = [
  { id: 'index.js:VERSION', file: 'index.js', kind: 'source', how: /const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/ },
  { id: 'manifest.json:version', file: 'manifest.json', kind: 'mirror', how: /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/ },
  { id: 'plans/V29_LEDGER.json:version', file: 'plans/V29_LEDGER.json', kind: 'mirror', how: /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/ },
  { id: 'docs/ERROR_CODES.md:版本行', file: 'docs/ERROR_CODES.md', kind: 'mirror', how: /台账 version：`([0-9]+\.[0-9]+\.[0-9]+)`/ },
  { id: 'tests/module-registry-ledger.json', file: 'tests/module-registry-ledger.json', kind: 'mirror', how: /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/ },
  { id: 'tests/consumer-ledger.json', file: 'tests/consumer-ledger.json', kind: 'mirror', how: /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/ },
  { id: 'tests/evidence-ledger.json', file: 'tests/evidence-ledger.json', kind: 'mirror', how: /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/ },
  { id: 'tests/dead-export-ledger.json', file: 'tests/dead-export-ledger.json', kind: 'mirror', how: /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/ },
  { id: 'tests/ns-consumer-ledger.json', file: 'tests/ns-consumer-ledger.json', kind: 'mirror', how: /"version"\s*:\s*"([0-9]+\.[0-9]+\.[0-9]+)"/ }
];

// BUILD_ID：回退源。纪律见 index.js:1588 —— 升版时与 VERSION **同批**推进。
const BUILD_ID_RE = /const BUILD_ID = '([0-9a-f]{40})'/;

// 发布清单的其余必检项（不是版本号，但发版缺了同样出事）
const RELEASE_ITEMS = [
  { id: 'manifest.js 指向 index.js', file: 'manifest.json', how: /"js"\s*:\s*"index\.js"/, why: '宿主靠它装载，指错就是装不上' },
  { id: 'manifest.loading_order 在', file: 'manifest.json', how: /"loading_order"\s*:\s*\d+/, why: '装载顺序缺失会与其他扩展抢面' },
  { id: 'manifest.minimum_client_version 在', file: 'manifest.json', how: /"minimum_client_version"\s*:\s*"[0-9.]+"/, why: '老客户端装上新版会静默失败' },
  { id: 'plans/V29_LEDGER.md 在', file: 'plans/V29_LEDGER.md', how: /V29/, why: '台账是人读的那一份，缺了等于只有机器账' }
];

function readFileSafe(root, rel) {
  const p = path.join(root, rel);
  try {
    return { ok: true, text: fs.readFileSync(p, 'utf8') };
  } catch (e) {
    return { ok: false, why: 'unreadable: ' + (e && e.code ? e.code : 'ERR') };
  }
}

// 取版本面读数。**读不到 / 匹配不到都记 null 并说明**，绝不返回空串冒充通过。
function readSurface(root, entry) {
  const r = readFileSafe(root, entry.file);
  if (!r.ok) return { id: entry.id, file: entry.file, kind: entry.kind, version: null, unreadable: true, why: r.why };
  const m = r.text.match(entry.how);
  if (!m) return { id: entry.id, file: entry.file, kind: entry.kind, version: null, unreadable: true, why: 'pattern-miss' };
  return { id: entry.id, file: entry.file, kind: entry.kind, version: m[1] };
}

function readBuildId(root) {
  const r = readFileSafe(root, 'index.js');
  if (!r.ok) return { ok: false, why: r.why, value: null };
  const m = r.text.match(BUILD_ID_RE);
  if (!m) return { ok: false, why: 'pattern-miss', value: null };
  return { ok: true, value: m[1] };
}

function audit(root) {
  const base = root || ROOT;
  const surface = VERSION_SURFACE.map(function (e) { return readSurface(base, e); });

  const unreadable = surface.filter(function (x) { return x.unreadable; });
  const versions = {};
  surface.forEach(function (x) {
    if (x.version) versions[x.version] = (versions[x.version] || 0) + 1;
  });
  const distinct = Object.keys(versions);

  // 「唯一版本」这件事有两种错：① 有载体读不到；② 读到了但不全等。
  // 两种都不许当成「一致」—— 前者是「不知道」，后者是「已知不一致」。
  const source = surface.filter(function (x) { return x.kind === 'source'; });
  const canonical = source.length && source[0].version ? source[0].version : null;

  const drift = surface.filter(function (x) { return x.version && canonical && x.version !== canonical; });

  const build = readBuildId(base);

  const release = RELEASE_ITEMS.map(function (it) {
    const r = readFileSafe(base, it.file);
    if (!r.ok) return { id: it.id, file: it.file, ok: false, why: r.why };
    const pass = it.how.test(r.text);
    return { id: it.id, file: it.file, ok: pass, why: pass ? '' : 'pattern-miss（' + it.why + '）' };
  });

  const missingRelease = release.filter(function (x) { return !x.ok; });

  const ok =
    surface.length > 0 &&
    unreadable.length === 0 &&
    drift.length === 0 &&
    canonical !== null &&
    // 注意：这里不再判 distinct.length === 1 —— 它已被「unreadable=0 +
    //   canonical 非空 + drift=0」蕴含，属冗余。冗余判据的害处很具体：
    //   负控制会互相兜住（破坏 drift 那条，distinct 这条照样把它救回来），
    //   于是「跟位」这一面看起来有测试、实际测不到。distinct 保留为报告字段。
    build.ok &&
    missingRelease.length === 0;

  return {
    ok: ok,
    canonical: canonical,
    surface: surface,
    unreadable: unreadable,
    drift: drift,
    versions: versions,
    distinct: distinct,
    buildId: build,
    release: release,
    missingRelease: missingRelease
  };
}

function render(res) {
  const L = [];
  L.push('WorldAxis 发布清单（OPV29-27 版本面 / OPV29-35 清单化）');
  L.push('  唯一版本：' + (res.canonical || '（读不到！）') +
         ' · 载体 ' + res.surface.length + ' 项 · 不同值 ' + res.distinct.length + ' 种');
  L.push('  版本面：');
  res.surface.forEach(function (x) {
    const v = x.version || ('✗ ' + (x.why || 'null'));
    L.push('    ' + (x.version && x.version === res.canonical ? '✓' : '✗') +
           ' ' + x.id + ' = ' + v + (x.kind === 'source' ? '（真源）' : ''));
  });
  L.push('  回退源 BUILD_ID：' + (res.buildId.ok ? res.buildId.value : '✗ ' + res.buildId.why));
  L.push('  发布必检 ' + res.release.length + ' 项：');
  res.release.forEach(function (x) {
    L.push('    ' + (x.ok ? '✓' : '✗') + ' ' + x.id + (x.ok ? '' : ' :: ' + x.why));
  });
  if (res.unreadable.length) L.push('  ✗ 读不到 ' + res.unreadable.length + ' 项：' + res.unreadable.map(function (x) { return x.id; }).join(', '));
  if (res.drift.length) L.push('  ✗ 跟位不一致 ' + res.drift.length + ' 项：' + res.drift.map(function (x) { return x.id + '=' + x.version; }).join(', '));
  L.push(res.ok ? '  ⇒ 可以发（一屏核完）' : '  ⇒ 不许发（上面每一条 ✗ 都要处置）');
  return L.join('\n');
}

if (require.main === module) {
  const res = audit(process.argv[3] || ROOT);
  const args = process.argv.slice(2);
  if (args.indexOf('--json') >= 0) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(render(res));
  }
  if (args.indexOf('--check') >= 0) process.exit(res.ok ? 0 : 1);
}

module.exports = { audit: audit, render: render, VERSION_SURFACE: VERSION_SURFACE, RELEASE_ITEMS: RELEASE_ITEMS, readFileSafe: readFileSafe };
