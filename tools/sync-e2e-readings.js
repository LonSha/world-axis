#!/usr/bin/env node
'use strict';
/**
 * WorldAxis tools/sync-e2e-readings.js — O16 端到端读数回填（v2.131.0）
 *
 * 【它治的病】R115 / R116 两轮迭代各暴露一次「人工漏改常量」：
 *   · R115 漏改 `tests/run.js:19441` 的 `deadNs.length === 18`（从全量回归尾部捞出来的）；
 *   · R116 漏改四处：`run.js:15047` 冻结面条目数停在 757 的中态、
 *     `run.js:18998` 与 `settle-v2830.js:309/321` 的端到端读数停在旧版现场。
 *   根因是同一个：**这些数字不在 readings.js 的读数族表里**（形态各异：有的在
 *   `assert(a === N)` 里、有的在 `indexOf('… N')` 的字符串里、有的是三元比较），
 *   于是 `tools/sync-hardcoded.js` 管不到它们，只能靠人记得同步——而人总会漏。
 *
 * 【本办法】
 *   把这类「端到端读数」也登记成**具名站点**，真源一律取**门禁产物（账本）**——
 *   账本是门禁当场写盘的现场读数，是权威；本工具**不重跑**门禁（避免副作用与耗时）。
 *
 *   站点形态三档（逐条显式登记，不做宽泛匹配——宽泛匹配会误伤沿革叙述里的旧数字）：
 *     A `led.totals.<字段> === N` / `led.<字段> === N`     （registry 账本读数）
 *     B `allEnt<四位>.length === N`                        （冻结面条目数 = dead + uiDead）
 *     C `indexOf('装载期边 N')`                            （子进程 stdout 里的读数串）
 *     D `dist<四位>['<归因>'] === N`（三条一组）            （归因分布）
 *
 * 【纪律（与 sync-hardcoded.js 同规格）】
 *   · 本文件不做判断：真值来自账本，比对是「站点值 ≠ 账本值」这一条；
 *   · 命中 0 站点 ⇒ 拒绝改写（no-site，不猜、不新建）；
 *   · 同族多值 ⇒ 拒绝改写（multi-value，先让人看清哪处是错的）；
 *   · 已是真值 ⇒ 不动（already）；
 *   · 全量替换用带 g 的正则；
 *   · `--verify` 只核不写（供门禁用：失配即非零退出并报出位置）。
 *
 * 用法：
 *   node tools/sync-e2e-readings.js             # dry-run，显 diff
 *   node tools/sync-e2e-readings.js --write     # 真写盘（带 .bak 备份 + 写后复核）
 *   node tools/sync-e2e-readings.js --verify    # 只核，失配非零退出（门禁用）
 *   node tools/sync-e2e-readings.js --json      # 机器可读
 *
 * 【门禁面】v2.131.0（O16 收口）：`verifySync()` 供 `tests/run.js` 直接核（不 spawn 子进程），
 *   返回 `{ok, checked, mismatch[]}`；门禁只据此设红灯，写盘仍只在 CLI 的 `--write` 下发生。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const WRITE = argv.indexOf('--write') >= 0;
const VERIFY = argv.indexOf('--verify') >= 0;
const JSON_OUT = argv.indexOf('--json') >= 0;

// ── 真源：两本门禁账本（产物，非重算）──────────────────────────
const REG_LEDGER = path.join(ROOT, 'tests/module-registry-ledger.json');
const DEAD_LEDGER = path.join(ROOT, 'tests/dead-export-ledger.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/** 现场真值（全部取自账本；账本缺失时如实报缺，不猜）。 */
function liveReadings() {
  const reg = readJson(REG_LEDGER);
  const dead = readJson(DEAD_LEDGER);
  const out = { missing: [] };
  if (!reg) { out.missing.push('module-registry-ledger.json'); }
  else {
    out.loadEdges = (reg.totals && reg.totals.loadEdges);
    out.callRefs = (reg.totals && reg.totals.callRefs);
    out.hardEdges = (reg.totals && reg.totals.hardEdges);
    out.nsCount = reg.nsCount;
    out.loadedCount = reg.loadedCount;
  }
  if (!dead) { out.missing.push('dead-export-ledger.json'); }
  else {
    // 冻结面条目数 = dead + uiDead 两个面的条目之和（run.js 的 allEnt<四位> 同口径）。
    const dn = Object.keys(dead.dead || {}).length;
    const un = Object.keys(dead.uiDead || {}).length;
    out.ledgerEntries = dn + un;
    out.deadOnly = dn;
    out.uiDeadOnly = un;
    // 归因分布：uiDead 4 项全为 test-only（账本里逐项带 reason，直接数，不假设）。
    const dist = { 'test-only': 0, 'self-only': 0, 'unwired': 0 };
    ['dead', 'uiDead'].forEach(function (k) {
      Object.keys(dead[k] || {}).forEach(function (kk) {
        const r = dead[k][kk].reason;
        if (dist[r] !== undefined) dist[r] += 1;
      });
    });
    out.dist = dist;
  }
  return out;
}

// ── 站点表：逐条显式登记（形态 + 目标文件 + 真值取法）─────────
//   `targets` 是「哪些文件里可能有该站点」；命中 0 站点不算错（该文件没写这处读数）。
const SITES = [
  {
    id: 'loadEdges', desc: '装载期边',
    files: ['tests/run.js', 'tests/settle-v2830.js'],
    // 形态 A：`led.totals.loadEdges === N`（settle）/ `a.edgesLoad === N`（run 内联）
    //   本族只登记**账本读数**那一档（`led.totals.loadEdges`），run.js 的 `a.edgesLoad`
    //   是运行时 audit() 的真值、不属「硬编码回填面」（它本就是动态的）。
    re: /(led\.totals\.loadEdges\s*===\s*)(\d+)/g,
    live: function (L) { return L.loadEdges; }
  },
  {
    id: 'callRefs', desc: '调用期引用',
    files: ['tests/run.js', 'tests/settle-v2830.js'],
    re: /(led\.totals\.callRefs\s*===\s*)(\d+)/g,
    live: function (L) { return L.callRefs; }
  },
  {
    id: 'nsCount', desc: '账本命名空间数',
    files: ['tests/settle-v2830.js'],
    re: /(led\.nsCount\s*===\s*)(\d+)/g,
    live: function (L) { return L.nsCount; }
  },
  {
    id: 'loadedCount', desc: '账本装载文件数',
    files: ['tests/settle-v2830.js'],
    re: /(led\.loadedCount\s*===\s*)(\d+)/g,
    live: function (L) { return L.loadedCount; }
  },
  {
    id: 'ledgerEntries', desc: '冻结面条目数',
    files: ['tests/run.js'],
    // 形态 B：`allEnt<四位>.length === N`
    re: /(allEnt\d{4}\.length\s*===\s*)(\d+)/g,
    live: function (L) { return L.ledgerEntries; }
  },
  {
    id: 'stdoutLoadEdges', desc: '子进程 stdout 里的「装载期边 N」',
    files: ['tests/run.js'],
    // 形态 C：`indexOf('装载期边 N')`（字符串里带读数）
    re: /(装载期边\s+)(\d+)(?=[^0-9]*['"])/g,
    live: function (L) { return L.loadEdges; }
  },
  {
    id: 'dist', desc: '归因分布（三条一组）',
    files: ['tests/run.js'],
    // 形态 D：`dist<四位>['<归因>'] === N`
    re: /(dist\d{4}\['(test-only|self-only|unwired)'\]\s*===\s*)(\d+)/g,
    live: function (L) { return L.dist; },
    isGroup: true
  }
];

/** 扫描一个文件里的一个站点，返回全部命中（带行号）。 */
function scanSite(src, site) {
  const lines = src.split('\n');
  const out = [];
  const re = new RegExp(site.re.source, site.re.flags);
  let m;
  while ((m = re.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    out.push({
      line: line,
      // 形态 D 的组键在 group 2、值在 group 3；其余为前缀 + 值
      key: m[2] && /[a-z-]/.test(m[2]) ? m[2] : null,
      value: Number(site.isGroup ? m[3] : m[2]),
      context: (lines[line - 1] || '').trim().slice(0, 90)
    });
  }
  return out;
}

/** 逐站点逐文件核，产出计划。 */
function buildPlan() {
  const L = liveReadings();
  const plan = [];
  const missing = [];
  let siteHits = 0;          // v2.131.0（O16 收口）：**真核过的站点数** —— 供门禁证明判据没在空转
  SITES.forEach(function (site) {
    site.files.forEach(function (rel) {
      const p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) return;
      const src = fs.readFileSync(p, 'utf8');
      const hits = scanSite(src, site);
      if (hits.length === 0) return;
      siteHits += hits.length;
      const want = site.isGroup ? null : site.live(L);
      if (site.isGroup) {
        // 组站点：每个归因键各自比对
        const byKey = {};
        hits.forEach(function (h) {
          (byKey[h.key] = byKey[h.key] || []).push(h);
        });
        Object.keys(byKey).forEach(function (k) {
          const v = byKey[k][0].value;
          const vals = Array.from(new Set(byKey[k].map(function (h) { return h.value; })));
          const target = L.dist ? L.dist[k] : null;
          if (target === null || target === undefined) { missing.push(site.id + '/' + k); return; }
          if (vals.length > 1) { plan.push({ id: site.id, rel: rel, key: k, kind: 'multi-value', values: vals }); return; }
          if (v === target) return;
          plan.push({
            id: site.id, desc: site.desc, rel: rel, key: k, kind: 'stale',
            from: v, to: target,
            // v2.131.0（O16 收口）：**组站点的命中也要带 value**。
            //   初版只带了 line/context，于是门禁侧的 `now` 印成 `undefined`
            //   （破坏自证时才现形：`现 undefined / 账本 351`）。
            sites: byKey[k].map(function (h) { return { line: h.line, value: h.value, context: h.context }; })
          });
        });
        return;
      }
      if (want === null || want === undefined) { missing.push(site.id); return; }
      const vals = Array.from(new Set(hits.map(function (h) { return h.value; })));
      if (vals.length > 1) {
        plan.push({ id: site.id, desc: site.desc, rel: rel, kind: 'multi-value', values: vals,
          sites: hits.map(function (h) { return { line: h.line, value: h.value }; }) });
        return;
      }
      if (vals[0] === want) return;
      plan.push({
        id: site.id, desc: site.desc, rel: rel, kind: 'stale',
        from: vals[0], to: want,
        sites: hits.map(function (h) { return { line: h.line, context: h.context }; })
      });
    });
  });
  return { live: L, plan: plan, missing: missing, siteHits: siteHits };
}

/** 执行回填（按文件聚合，逐站点全量替换）。 */
function applyPlan(plan) {
  const byFile = {};
  plan.forEach(function (p) {
    if (p.kind !== 'stale') return;
    (byFile[p.rel] = byFile[p.rel] || []).push(p);
  });
  const report = [];
  Object.keys(byFile).forEach(function (rel) {
    const p = path.join(ROOT, rel);
    const orig = fs.readFileSync(p, 'utf8');
    let next = orig;
    byFile[rel].forEach(function (item) {
      const site = SITES.filter(function (s) { return s.id === item.id; })[0];
      if (!site) return;
      let changed = 0;
      const re = new RegExp(site.re.source, site.re.flags);
      next = next.replace(re, function (match, prefix, g2, g3) {
        if (site.isGroup) {
          // 只改「这个归因键」的那一条
          if (g2 !== item.key) return match;
          changed++;
          return prefix + item.to;
        }
        changed++;
        return prefix + item.to;
      });
      report.push({ rel: rel, id: item.id, key: item.key || null, from: item.from, to: item.to, changed: changed });
    });
    if (next !== orig) {
      fs.writeFileSync(p + '.bak', orig, 'utf8');
      fs.writeFileSync(p, next, 'utf8');
    }
  });
  return report;
}

/**
 * 站点覆盖自证（H6 工具两向自证的第一向）：每个登记站点**必须真扫到**至少一处。
 * 为什么必要：`hits.length === 0` 时 buildPlan 直接 return（不算 stale），于是
 * **正则写错**与**读数正确**在输出上完全一样（都是「✓ 全部同源」）——那是一个永远绿的工具。
 * 本函数把「没扫到」变成显式失败。
 */
function coverageReport() {
  const rows = [];
  SITES.forEach(function (site) {
    site.files.forEach(function (rel) {
      const p = path.join(ROOT, rel);
      if (!fs.existsSync(p)) return;
      const hits = scanSite(fs.readFileSync(p, 'utf8'), site);
      rows.push({ id: site.id, rel: rel, hits: hits.length, lines: hits.map(function (h) { return h.line; }) });
    });
  });
  return rows;
}

const SELF_TEST = argv.indexOf('--self-test') >= 0;
/** 站点表里「必须真扫到」的站点（有站点表却不命中 = 正则坏了）。 */
const REQUIRED = ['loadEdges', 'callRefs', 'nsCount', 'loadedCount', 'ledgerEntries', 'stdoutLoadEdges', 'dist'];

/** 自我测试（H6 第二向）：把某站点的真值**改掉一个数**，证明 buildPlan 真能报出 stale。 */
function selfTest() {
  const rows = coverageReport();
  const problems = [];
  // ① 覆盖自证：每个必需站点至少在某个文件里命中 ≥1
  REQUIRED.forEach(function (id) {
    const hit = rows.filter(function (r) { return r.id === id; }).reduce(function (a, r) { return a + r.hits; }, 0);
    if (hit === 0) problems.push('站点 ' + id + ' 一处都没扫到（正则坏了或读数被删）');
  });
  // ② 破坏可观测：在内存副本上把「装载期边」站点改成假值，必须被报成 stale
  const probeRel = 'tests/settle-v2830.js';
  const src = fs.readFileSync(path.join(ROOT, probeRel), 'utf8');
  const broken = src.replace(/led\.totals\.loadEdges\s*===\s*\d+/, 'led.totals.loadEdges === 999');
  if (broken === src) {
    problems.push('破坏未能改动 ' + probeRel + '（锚点没打中，负控制无意义）');
  } else {
    const hits = scanSite(broken, SITES.filter(function (s) { return s.id === 'loadEdges'; })[0]);
    const want = liveReadings().loadEdges;
    const caught = hits.some(function (h) { return h.value !== want; });
    if (!caught) problems.push('破坏版未被判出 stale（判据不敏感）');
  }
  return { rows: rows, problems: problems };
}

function main() {
  if (SELF_TEST) {
    const st = selfTest();
    console.log('=== sync-e2e-readings 自我测试 ===\n');
    console.log('站点覆盖：');
    st.rows.forEach(function (r) {
      console.log('  ' + (r.hits > 0 ? '✓' : '·') + ' ' + r.id + ' @ ' + r.rel + ' : ' + r.hits + ' 处'
        + (r.lines.length ? '（L' + r.lines.join(',') + '）' : ''));
    });
    if (st.problems.length) {
      console.log('\n✗ 自证失败：');
      st.problems.forEach(function (p) { console.log('  · ' + p); });
      process.exit(1);
    }
    console.log('\n✓ 自证通过（覆盖全命中 + 破坏可观测）');
    process.exit(0);
  }
  const r = buildPlan();
  if (JSON_OUT) { console.log(JSON.stringify({ live: r.live, plan: r.plan, missing: r.missing }, null, 2)); return; }
  console.log('端到端读数回填（真源 = 门禁账本）');
  const L = r.live;
  console.log('  现场：装载期边 ' + L.loadEdges + ' / 调用期引用 ' + L.callRefs
    + ' / 硬边 ' + L.hardEdges + ' / 命名空间 ' + L.nsCount + ' / 装载文件 ' + L.loadedCount
    + ' / 冻结面条目 ' + L.ledgerEntries + '（dead ' + L.deadOnly + ' + uiDead ' + L.uiDeadOnly + '）');
  if (L.dist) console.log('  归因：test-only ' + L.dist['test-only'] + ' / self-only ' + L.dist['self-only'] + ' / unwired ' + L.dist['unwired']);
  if (r.missing.length) console.log('  账本缺读数：' + Array.from(new Set(r.missing)).join(', '));

  const stale = r.plan.filter(function (p) { return p.kind === 'stale'; });
  const multi = r.plan.filter(function (p) { return p.kind === 'multi-value'; });

  if (multi.length) {
    console.log('\n✗ 同族多值（拒绝回填，先看清哪一处是错的）：');
    multi.forEach(function (p) {
      console.log('  · ' + p.rel + ' :: ' + p.id + (p.key ? '[' + p.key + ']' : '') + ' 有 ' + p.values.length + ' 个值：' + p.values.join(' / '));
      (p.sites || []).forEach(function (s) { console.log('      L' + s.line + ' = ' + s.value); });
    });
  }

  if (stale.length === 0 && multi.length === 0) {
    console.log('\n✓ 全部端到端读数与账本现场同源');
    process.exit(0);
  }

  if (stale.length) {
    console.log('\n待回填 ' + stale.length + ' 项：');
    stale.forEach(function (p) {
      console.log('  · ' + p.rel + ' :: ' + (p.desc || p.id) + (p.key ? '[' + p.key + ']' : '') + ' : ' + p.from + ' → ' + p.to);
      (p.sites || []).slice(0, 3).forEach(function (s) { console.log('      L' + s.line + ': ' + s.context); });
    });
  }

  if (VERIFY) {
    console.log('\nVERIFY 失败：' + (stale.length + multi.length) + ' 项读数与账本不同源');
    process.exit(1);
  }
  if (!WRITE) {
    console.log('\n（dry-run：未写盘。加 --write 真写）');
    process.exit(0);
  }
  if (multi.length) { console.log('\nREJECTED：存在同族多值，不写盘'); process.exit(1); }

  const report = applyPlan(stale);
  console.log('\n已回填 ' + report.length + ' 项：');
  report.forEach(function (x) { console.log('  ✓ ' + x.rel + ' :: ' + x.id + (x.key ? '[' + x.key + ']' : '') + ' (' + x.from + ' → ' + x.to + '，' + x.changed + ' 处)'); });
  // 写后复核：重新跑一遍计划，必须为空
  const after = buildPlan();
  const left = after.plan.filter(function (p) { return p.kind === 'stale'; });
  if (left.length) {
    console.log('\nROLLBACK 写后复核失败（仍剩 ' + left.length + ' 项），已恢复备份');
    report.forEach(function (x) {
      const p = path.join(ROOT, x.rel);
      if (fs.existsSync(p + '.bak')) { fs.writeFileSync(p, fs.readFileSync(p + '.bak', 'utf8')); }
    });
    process.exit(1);
  }
  console.log('\n写后复核通过 ✓（.bak 备份保留）');
}

if (require.main === module) {
  try { main(); } catch (e) { console.error('错误:', e.message); console.error(e.stack); process.exit(1); }
}
/**
 * v2.131.0（O16 收口）：**门禁可调用的核验面**（`--verify` 的同规格内存版）。
 *   为什么需要它而不是让门禁 shell 出去跑 `--verify`：回归进程里已经握着现场，
 *   再 spawn 一个 node 子进程只是多一层「子进程退出码 ≠ 判据」的转译（本仓点过这个坑）。
 *   返回 `{ ok, checked, mismatch: [{file,line,now,want}] }`，**不写盘、不退出**，
 *   由调用方（门禁）决定红灯。
 */
function verifySync() {
  const r = buildPlan();
  const mism = [];
  (r.plan || []).forEach(function (p) {
    if (p.kind === 'stale') {
      (p.sites || []).forEach(function (s) {
        mism.push({ file: p.rel, line: s.line, now: s.value, want: p.to });
      });
    } else if (p.kind === 'multi-value') {
      mism.push({ file: p.rel, line: (p.sites && p.sites[0] && p.sites[0].line) || 0,
        now: '(' + p.values.join('/') + ')', want: p.to });
    }
  });
  const sites = ((r.plan || []).length ? (r.plan[0].sites || []).length : 0);
  return { ok: mism.length === 0, checked: r.siteHits || 0,
    mismatch: mism, live: r.live, missing: r.missing || [], siteHits: sites };
}
module.exports = { SITES: SITES, liveReadings: liveReadings, buildPlan: buildPlan, scanSite: scanSite, verifySync: verifySync };