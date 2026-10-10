#!/usr/bin/env node
// WorldAxis tools/fact-report.js (v2.190.0) — 发布前事实报告（计划 U9）
//
// 【它治什么】
//   现场实测过的四类事实脱节（v2.189.0 收口轮确认）：
//     ① 版本号在 index.js / manifest.json / tests/run.js 消息面各写一遍；
//     ② 文档读数可能落后（docs/ERROR_CODES.md 曾停在 788 码，现场应为 804）；
//     ③ 计划文件的「已交付」可由「文件存在 + 挂进 run.js」推出，与玩家路径无关；
//     ④ 工作树可能与 HEAD 不一致（v2.189.0 轮：51 项未提交改动 + 6 项未跟踪交付物）。
//   这四类的共同点是**没有任何一份现场报告把它们放在一起看** —— 每一处都只有
//   「跑一次 17 分钟全量回归」这一个发现通道。本报告把它变成**秒级、只读、可复读**的一条命令。
//
// 【口径 · 三条硬纪律】
//   ① **只读**：不写任何文件、不改任何台账、不自动修文档（发现旧基线只列出，由人决定）；
//   ② **每一项都可复读**：报告里每一行都附「取法」（读者可用给出的命令自己算一遍）；
//   ③ **不把「列出」当「已修」**：报告末尾明确写这一句。
//
// 【单一真源】三面读数（拒收码 / 模块注册 / 死子面 / 消费者）**一律委托既有账本与既有门禁**，
//   本文件不另写扫描器 —— 「判据两处各写一遍必然漂移」是本仓点过名的形态（O8 门禁文件头原文）。
//
// 【可注入读接缝（opt.read）】负控制必须能在**内存副本**上做真破坏并两向自证；
//   若验证判据要真会现形必须改真文件，验证者自己就成了新的风险源（readings.js 同款理由）。
//   故 build(opt) 收 opt.read（默认 fs 读真文件），shell 面（git / ls）不注入。
//
// 【失败判据】版本三方不一致即 exit 1（其余项为告知性读数，不参与退出码）。
//
// 用法：
//   node tools/fact-report.js              打印报告（版本不一致时 exit 1）
//   node tools/fact-report.js --json       结构化输出
//   node tools/fact-report.js --self-test  真源存在性自证（缺一个即抛）
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');

/** 读仓库内文件；不存在返回 null（调用方如实报「缺失」，不抛）。 */
function read(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; }
}
function readJSON(rd, rel) {
  const t = rd(rel);
  if (t === null) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}
function ls(pattern) {
  try { return cp.execSync(pattern, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch (e) { return []; }
}

// ── ① 三方版本 ────────────────────────────────────────────────────────────────
function versions(rd) {
  const idx = rd('index.js') || '';
  const m = idx.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
  const indexVersion = m ? m[1] : null;
  const manifest = readJSON(rd, 'manifest.json');
  const manifestVersion = manifest ? manifest.version : null;
  const run = rd('tests/run.js') || '';
  // run.js 的「消息面」版本：数当前版本被**钉**了几处（不含注释行 —— 注释里的旧版本是沿革，不是当前读数）。
  const pinned = run.split('\n').filter(function (l) {
    const s = l.replace(/^\s+/, '');
    if (s.indexOf('//') === 0 || s.indexOf('*') === 0) return false;
    return indexVersion ? l.indexOf("'" + indexVersion + "'") >= 0 : false;
  }).length;
  return {
    index: indexVersion, manifest: manifestVersion, runPins: pinned,
    agree: !!indexVersion && indexVersion === manifestVersion && pinned > 0,
    how: 'grep -n "const VERSION" index.js ； node -e "console.log(require(\'./manifest.json\').version)" ； grep -c "\'<版本>\'" tests/run.js'
  };
}

// ── ② 全量回归读数（读最近落盘的结果，不重跑） ──────────────────────────────
function lastRegression() {
  // isolated-runner 把每趟的 result.json 写在 os.tmpdir() 下；本报告**不重跑**回归，
  //   只读最近一次落盘的那份（没有就如实报「未采样」—— 不拿 0 冒充）。
  const dirs = ls('ls -dt /tmp/worldaxis-regression-* 2>/dev/null | head -5');
  const out = [];
  dirs.forEach(function (d) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(d, 'result.json'), 'utf8'));
      out.push({ dir: d, code: j.code, at: fs.statSync(path.join(d, 'result.json')).mtime.toISOString() });
    } catch (e) { /* 残留目录无结果文件：跳过，由 dirCount 如实报数量 */ }
  });
  return { samples: out, dirCount: dirs.length, how: 'ls -dt /tmp/worldaxis-regression-* | head' };
}

// ── ③ 拒收码三面（委托 reject-code-coverage 单一真源） ──────────────────────
function rejectCodes(rd) {
  const led = readJSON(rd, 'tests/reject-code-ledger.json');
  if (!led) return { absent: true };
  const docsText = rd('docs/ERROR_CODES.md') || '';
  const docsClaim = docsText.match(/拒收码.*?(\d{3,})/);
  let cov = null, err = null;
  try {
    const rcc = require(path.join(ROOT, 'tests/reject-code-coverage.js'));
    const d = rcc.discover();
    cov = {
      total: d.coverage.total, witnessed: d.coverage.witnessed, dead: d.coverage.dead,
      base: d.coverage.base, sum: d.coverage.sum, identityOk: d.coverage.identityOk,
      covered: d.coverage.covered, rate: d.coverage.rate,
      declared: d.declarations.declared, duplicated: d.declarations.duplicated.length,
      deferred: Object.keys(d.deferred || {}).length, summary: d.summary
    };
  } catch (e) { err = String(e && e.message); }
  return {
    ledgerVersion: led.version,
    ledgerBase: led.base ? Object.keys(led.base).length : 0,
    ledgerDead: typeof led.deadCount === 'number' ? led.deadCount : null,
    cov: cov, covError: err,
    docsClaim: docsClaim ? Number(docsClaim[1]) : null,
    how: 'node -e "console.log(require(\'./tests/reject-code-coverage.js\').discover().summary)"'
  };
}

// ── ④ 模块注册读数 ──────────────────────────────────────────────────────────
function moduleRegistry(rd) {
  const led = readJSON(rd, 'tests/module-registry-ledger.json');
  if (!led) return { absent: true };
  return {
    version: led.version, totals: led.totals, nsCount: led.nsCount, loadedCount: led.loadedCount,
    how: 'node -e "const l=require(\'./tests/module-registry-ledger.json\');console.log(l.totals, l.nsCount, l.loadedCount)"'
  };
}

// ── ⑤ 死子面与消费者读数 ────────────────────────────────────────────────────
function deadSurface(rd) {
  const dead = readJSON(rd, 'tests/dead-export-ledger.json');
  const cons = readJSON(rd, 'tests/consumer-ledger.json');
  return {
    deadVersion: dead && dead.version,
    deadCount: dead && dead.dead ? Object.keys(dead.dead).length : null,
    uiDeadCount: dead && dead.uiDead ? Object.keys(dead.uiDead).length : null,
    dataOnly: dead && dead.advisory ? dead.advisory.dataOnly : null,
    consumerVersion: cons && cons.version,
    programmatic: cons && cons.programmatic ? Object.keys(cons.programmatic).length : null,
    how: 'node -e "const d=require(\'./tests/dead-export-ledger.json\');console.log(Object.keys(d.dead).length, Object.keys(d.uiDead).length)"'
  };
}

// ── ⑥ UI / 宿主验收状态 ─────────────────────────────────────────────────────
function hostStatus(rd) {
  const live = rd('tests/ui-live.js');
  const present = live !== null;
  const stub = present ? (live.match(/host: *'stub'/g) || []).length : 0;
  return {
    uiLivePresent: present, stubSites: stub,
    verdict: present
      ? '无头侧证据可取；真实宿主面仍需另跑（本报告不代跑）'
      : '缺失',
    how: 'grep -n "host: \'stub\'" tests/ui-live.js'
  };
}

// ── ⑦ 工作树改动清单与未跟踪交付物 ─────────────────────────────────────────
function worktree() {
  const lines = ls('git status --porcelain');
  const untracked = lines.filter(function (l) { return l.indexOf('??') === 0; });
  const modified = lines.filter(function (l) { return l.indexOf('??') !== 0; });
  return {
    total: lines.length, modified: modified.length, untracked: untracked.length,
    untrackedList: untracked.map(function (l) { return l.slice(3); }),
    how: 'git status --porcelain'
  };
}

// ── ⑧ 残留（.bak / 回归临时目录 / 锁） ──────────────────────────────────────
function leftovers() {
  const baks = ls('find . -name "*.bak" -o -name "*.orig" -o -name "*~" 2>/dev/null | grep -v node_modules | head -20');
  const regDirs = ls('ls -d /tmp/worldaxis-regression-* 2>/dev/null');
  const locks = ls('ls -d /tmp/worldaxis-regression-*.lock 2>/dev/null');
  return {
    baks: baks, regressionDirs: regDirs.length, locks: locks.length,
    how: 'find . -name "*.bak" | grep -v node_modules | head ； ls -d /tmp/worldaxis-regression-*'
  };
}

// ── ⑨ 文档中仍存在的旧基线（只列出，不改写） ───────────────────────────────
const STALE_TARGETS = ['README.md', 'ITERATION_LOG.md', 'NEXT_PLAN.md', 'FOUR_VERSION_PLAN.md',
  'plans/O_OPTIMIZATION.md', 'plans/E_EXPANSION.md', 'plans/TP_OPTIMIZATION.md',
  'plans/TX_EXPANSION.md', 'plans/U_OPTIMIZATION.md', 'plans/Y_EXPANSION.md', 'docs/ERROR_CODES.md'];
function staleBaselines(cur, rd) {
  if (!cur) return [];
  const minor = Number(cur.split('.')[1]);
  const hits = [];
  STALE_TARGETS.forEach(function (rel) {
    const t = rd(rel);
    if (t === null) return;
    t.split('\n').forEach(function (l, i) {
      const m = l.match(/基线[:：]?\s*v?(\d+)\.(\d+)\.(\d+)/);
      if (!m) return;
      if (Number(m[2]) >= minor) return;   // 不落后于当前版本的不算旧基线
      hits.push({ file: rel, line: i + 1, said: m[0].slice(0, 40) });
    });
  });
  return hits;
}

function build(opt) {
  const rd = (opt && opt.read) || read;
  const v = versions(rd);
  return {
    versions: v,
    regression: lastRegression(),
    rejectCodes: rejectCodes(rd),
    moduleRegistry: moduleRegistry(rd),
    deadSurface: deadSurface(rd),
    host: hostStatus(rd),
    worktree: worktree(),
    leftovers: leftovers(),
    staleBaselines: staleBaselines(v.index, rd),
    note: '本报告只读：不修改任何东西；列出 ≠ 已修。'
  };
}

function print(r) {
  const L = [];
  L.push('══ WorldAxis 发布前事实报告（只读）══');
  L.push('① 版本三方：index.js ' + r.versions.index + ' / manifest.json ' + r.versions.manifest
    + ' / run.js 消息面钉 ' + r.versions.runPins + ' 处'
    + (r.versions.agree ? '  ✓' : '  ✗ 三方不一致'));
  L.push('② 全量回归（最近落盘，不重跑）：样本 ' + r.regression.samples.length
    + ' / 目录残留 ' + r.regression.dirCount
    + (r.regression.samples.length ? '：最近 code=' + r.regression.samples[0].code + ' @ ' + r.regression.samples[0].at : '（未采样）'));
  const rc = r.rejectCodes, cv = rc.cov;
  L.push('③ 拒收码：扫描面 ' + (cv ? cv.total : '（不可读）')
    + ' = 见证 ' + (cv ? cv.witnessed : '?') + ' + 死表 ' + (cv ? cv.dead : '?')
    + ' + 基线 ' + (cv ? cv.base : '?') + '（和 ' + (cv ? cv.sum : '?')
    + '，恒等式 ' + (cv && cv.identityOk ? '平' : '不平') + '）'
    + ' · 台账 version ' + rc.ledgerVersion
    + ' · 声明 ' + (cv ? cv.declared : '?') + ' / 重复 ' + (cv ? cv.duplicated : '?')
    + ' · 延后 ' + (cv ? cv.deferred : '?')
    + ' · docs 自述 ' + rc.docsClaim
    + (rc.covError ? ' （读数面不可读：' + rc.covError + '）' : ''));
  const mr = r.moduleRegistry;
  L.push('④ 模块注册：引用 ' + mr.nsCount + ' / 装载 ' + mr.loadedCount
    + ' / 装载期边 ' + (mr.totals && mr.totals.loadEdges) + ' / 调用期 ' + (mr.totals && mr.totals.callRefs));
  const ds = r.deadSurface;
  L.push('⑤ 死子面：dead ' + ds.deadCount + ' / uiDead ' + ds.uiDeadCount + ' / dataOnly ' + ds.dataOnly
    + ' · 消费者 programmatic ' + ds.programmatic);
  L.push('⑥ 宿主验收：ui-live ' + (r.host.uiLivePresent ? '在' : '缺') + ' / stub 档位 ' + r.host.stubSites + ' 处 · ' + r.host.verdict);
  const wt = r.worktree;
  L.push('⑦ 工作树：共 ' + wt.total + ' 项（修改 ' + wt.modified + ' / 未跟踪 ' + wt.untracked + '）');
  wt.untrackedList.forEach(function (p) { L.push('      · 未跟踪 ' + p); });
  L.push('⑧ 残留：.bak ' + r.leftovers.baks.length + ' / 回归临时目录 ' + r.leftovers.regressionDirs + ' / 锁 ' + r.leftovers.locks);
  L.push('⑨ 文档中仍存在的旧基线（只列出）：' + r.staleBaselines.length + ' 处');
  r.staleBaselines.forEach(function (h) { L.push('      · ' + h.file + ':' + h.line + ' — ' + h.said); });
  L.push('');
  L.push(r.note);
  return L.join('\n');
}

/**
 * 取法清单（U9 验收④：报告里每一项都要能被读者用给出的**命令**复算一遍）。
 *   为什么单列一个函数而不是塞进 print：print 是给人扫一眼的（九行读数），
 *   取法是给「不信这个数」的人用的（命令 + 真源）。两者混排会让读数行被命令淹掉。
 *   纪律：本函数**不产生新读数** —— 每一行的 how 都由对应取数函数自己写在返回体里
 *   （真源只有一处），这里只负责把它们摊平。
 */
function howLines(r) {
  return [
    '\u2460 \u4e09\u65b9\u7248\u672c\uff1a' + r.versions.how,
    '\u2461 \u5168\u91cf\u56de\u5f52\uff1a' + r.regression.how,
    '\u2462 \u62d2\u6536\u7801\uff1a' + r.rejectCodes.how,
    '\u2463 \u6a21\u5757\u6ce8\u518c\uff1a' + r.moduleRegistry.how,
    '\u2464 \u6b7b\u5b50\u9762\uff1a' + r.deadSurface.how,
    '\u2465 \u5bbf\u4e3b\u9a8c\u6536\uff1a' + r.host.how,
    '\u2466 \u5de5\u4f5c\u6811\uff1a' + r.worktree.how,
    '\u2467 \u6b8b\u7559\uff1a' + r.leftovers.how,
    '\u2468 \u65e7\u57fa\u7ebf\uff1agrep -nE "\u57fa\u7ebf[\uff1a:]?v?[0-9]+[.][0-9]+[.][0-9]+" '      + '\u003c\u53d6\u8bc1\u9762\u5404\u4efd\u6587\u6863\u003e'
  ];
}
function selfTest(opt) {
  const rd = (opt && opt.read) || read;
  const must = ['index.js', 'manifest.json', 'tests/run.js', 'tests/reject-code-ledger.json',
    'tests/module-registry-ledger.json', 'tests/dead-export-ledger.json', 'tests/consumer-ledger.json'];
  const missing = must.filter(function (rel) { return rd(rel) === null; });
  if (missing.length) throw new Error('取法对应的真源缺失：' + missing.join(', '));
  const r = build(opt);
  if (!r.versions.index) throw new Error('index.js 里读不到 const VERSION');
  if (r.worktree.total !== r.worktree.modified + r.worktree.untracked) {
    throw new Error('工作树分类不完备（total ≠ modified + untracked）');
  }
  return { ok: true, version: r.versions.index, items: Object.keys(r).length, stale: r.staleBaselines.length };
}

module.exports = {
  build: build, print: print, selfTest: selfTest, versions: versions,
  rejectCodes: rejectCodes, moduleRegistry: moduleRegistry, deadSurface: deadSurface,
  hostStatus: hostStatus, staleBaselines: staleBaselines, worktree: worktree,
  howLines: howLines,
  STALE_TARGETS: STALE_TARGETS, ITEMS: 9
};

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf('--self-test') >= 0) {
    try { console.log('fact-report self-test: pass ' + JSON.stringify(selfTest())); process.exit(0); }
    catch (e) { console.log('fact-report self-test: FAIL ' + e.message); process.exit(1); }
  }
  const r = build();
  if (args.indexOf('--json') >= 0) console.log(JSON.stringify(r, null, 2));
  else console.log(print(r));
  if (args.indexOf('--how') >= 0) console.log('\n' + howLines(r).join('\n'));
  process.exit(r.versions.agree ? 0 : 1);
}
