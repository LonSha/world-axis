#!/usr/bin/env node
// WorldAxis tools/gen-gates-doc.js - docs/gates.md 读数表现场生成（计划 OPV22-8, v2.400.0）
//
// ── 它治的病（本仓反复治过的第二真源病）────────────────────────────────
//   docs/gates.md 的「现在读什么」一列写着「现场实测值，随版本更新」，
//   但表头停在 v2.134.0，而现场已到 v2.380.0+。实测偏差：
//     · dead-export-gate：文档写 dead 751，现场 1437（差 686）
//     · inventory：文档写产品文件 162，现场 426（差 264）
//     · test-surface-gate：文档写测试面 154，现场 534
//   它不是「有点旧」，它是**一份看起来权威的第二真源**。
//   本仓此前治过同型病不止一次（ERROR_CODES 已改成 gen-error-codes.js 生成）。
//
// ── 口径：现场跑，不抄常量 ────────────────────────────────────────────
//   · 每个门禁**真跑一次**（子进程），从真实输出里抽读数，不 readFileSync 常量表；
//   · 门禁红的时候如实写「红」并带上退出码 —— 不因为它红就跳过不记；
//   · --check：把生成结果与 docs/gates.md 现有内容比对，不一致 exit 1（供门禁调用）；
//   · --write：回填 docs/gates.md（只替换读数表那一段，其余正文逐字不动）。
//
//   为什么不做「整篇生成」：gates.md 的正文里有大量口径说明与踩坑记录，
//   那是人手写的判据解释，不是读数。只把**会过期的那一段**变成生成物。
//
// ── 用法 ────────────────────────────────────────────────────────────
//   node tools/gen-gates-doc.js           # 只打印现场读数表
//   node tools/gen-gates-doc.js --write   # 回填 docs/gates.md
//   node tools/gen-gates-doc.js --check   # 与现有文档比对，不一致 exit 1

'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs/gates.md');
const BEGIN = '<!-- GATES-READINGS:BEGIN (由 tools/gen-gates-doc.js 生成，勿手改) -->';
const END = '<!-- GATES-READINGS:END -->';

/** 要现场跑的门禁清单：rel + 从输出里抠读数的正则。 */
const GATES = [
  { rel: 'tests/export-contract.js', name: 'export-contract', re: /ns=\s*(\d+)\s*members=\s*(\d+)\s*chars=\s*(\d+)/ },
  { rel: 'tests/inventory.js', name: 'inventory', re: /产品文件\s*(\d+)/ },
  { rel: 'tests/test-surface-gate.js', name: 'test-surface-gate', re: /测试文件面\s*(\d+)\s*·\s*锁\s*(\d+)\s*·\s*可达\s*(\d+)/ },
  { rel: 'tests/reject-code-gate.js', name: 'reject-code-gate', re: /产品文件\s*(\d+)\s*个，内联拒收码\s*(\d+)\s*个/ },
  { rel: 'tests/module-registry-gate.js', name: 'module-registry-gate', re: /文件\s*(\d+)[^0-9]*命名空间\s*(\d+)/ },
  { rel: 'tests/module-cycle-gate.js', name: 'module-cycle-gate', re: /静态图：文件\s*(\d+)[^\n]*?边\s*(\d+)/ },
  { rel: 'tests/dead-export-gate.js', name: 'dead-export-gate', re: /dead\s*(\d+)\s*·\s*uiDead\s*(\d+)/ },
  // 八道之后的第九道：七族硬读数自洽。实测耗时 117s —— 故**不进快档**（MAX_MS 12000），
  //   只在本生成器里真跑一次抽读数。GATES_ALLOW_SLOW=0 可跳过它（只打印时用）。
  { rel: 'tests/readings-v2106.js', name: 'readings-v2106', slow: true,
    re: /现场 refs\s*(\d+)\s*\/\s*命名空间\s*(\d+)\s*\/\s*成员\s*(\d+)/ },
];

/** 真跑一个门禁，返回 {name, rc, ms, readings, raw}。不抛。 */
function runGate(g) {
  const t0 = Date.now();
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, g.rel)], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  const ms = Date.now() - t0;
  const raw = ((r.stdout || '') + (r.stderr || ''));
  const m = g.re ? g.re.exec(raw) : null;
  const readings = m ? m.slice(1).map(function (x) { return Number(x); }) : null;
  return { name: g.name, rel: g.rel, rc: r.status === null ? -1 : r.status, ms: ms, readings: readings, raw: raw };
}

/** 渲染读数表（Markdown）。 */
function render(rows, version) {
  const out = [];
  out.push(BEGIN);
  out.push('> 本表由 `node tools/gen-gates-doc.js --write` **现场跑门禁回填**，不是手写。');
  out.push('> 回填时点版本：' + version + ' · 生成器版本：2.400.0');
  out.push('> 口径：门禁红的时候如实写红与退出码，不跳过、不美化。');
  out.push('');
  out.push('| 门禁 | 退出码 | 耗时 | 现场读数 |');
  out.push('|---|---|---|---|')
  rows.forEach(function (r) {
    const rdr = r.readings ? ('`' + r.readings.join(' / ') + '`') : '（读不出——正则与现场不符，需修生成器）';
    out.push('| `node ' + r.rel + '` | ' + (r.rc === 0 ? '0 ✓' : r.rc + ' ✗') + ' | ' + r.ms + 'ms | ' + rdr + ' |');
  });
  out.push(END);
  return out.join(String.fromCharCode(10));
}

/** 从文档里取出已有的生成块（不存在返回 null）。 */
function readBlock() {
  const src = fs.readFileSync(DOC, 'utf8');
  const i = src.indexOf(BEGIN);
  const j = src.indexOf(END);
  if (i < 0 || j < 0 || j < i) return null;
  return src.slice(i, j + END.length);
}

/**
 * 把某几道门禁的整行剔掉（用于快比对）。
 *
 * 为何要这么做：readings-v2106 单次耗时 117s（实测），它永远不可能进 --check。
 * 而且它的读数（refs / 命名空间 / 成员）每次改产品面都会变 —— 拿它参与快环
 * check，会把这道门禁变成「永远红」，于是人就会去忽略它，判据就死了。
 * 故：快 check 只比**快门禁**那几行；慢门禁那一行保持上次 --write 的原样
 * （不参与比对）。要把它也重算，跑 --write（它会真跑慢门禁）。
 */
function stripRowsOf(text, rels) {
  if (!rels || !rels.length) return text;
  const NL = String.fromCharCode(10);
  return text.split(NL).filter(function (l) {
    for (let k = 0; k < rels.length; k++) {
      if (l.indexOf('node ' + rels[k]) >= 0) return false;
    }
    return true;
  }).join(NL);
}

/**
 * 比对前把**耗时列**抹成固定占位。
 *
 * 为什么必须抹：耗时是墙钟读数（同一道门禁这次 1225ms、下次 1229ms），
 * 它是**测量噪声**，不是判据。若把它纳入比对，`--check` 会每次都红，
 * 于是人就会去把这道门禁从 CI 里摘掉 —— 判据死于噪声，而不是死于缺陷。
 * 要盯性能，那是 perf-regression-gate 的活，不是本生成器的活。
 */
function blankMs(text) {
  return text.replace(/\| \d+ms \|/g, '| <ms> |');
}

/** 把生成块插/替换进 docs/gates.md（正文其余部分逐字不动）。 */
function applyToDoc(block) {
  const src = fs.readFileSync(DOC, 'utf8');
  const i = src.indexOf(BEGIN);
  const j = src.indexOf(END);
  if (i < 0 || j < 0) return { ok: false, reason: 'markers-missing' };
  const next = src.slice(0, i) + block + src.slice(j + END.length);
  return { ok: true, changed: next !== src, next: next };
}
function currentVersion() {
  const s = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const m = /VERSION\s*=\s*'([\d.]+)'/.exec(s);
  return m ? m[1] : 'unknown';
}
function build(opt) {
  const allowSlow = !(opt && opt.allowSlow === false);
  const rows = GATES.filter(function (g) { return allowSlow || !g.slow; }).map(runGate);
  const skipped = GATES.filter(function (g) { return !allowSlow && g.slow; }).map(function (g) { return g.rel; });
  return { block: render(rows, currentVersion()), rows: rows, skipped: skipped };
}
function main() {
  const argv = process.argv.slice(2);
  // --check 是进门禁的那一档，必须快：它**强制**跳过慢门禁（不看环境变量），
  //   否则有人忘了设 GATES_ALLOW_SLOW=0 就会跑 2 分钟以上。--write 才真跑慢门禁。
  const isCheck = argv.indexOf('--check') >= 0;
  const allowSlow = !isCheck && process.env.GATES_ALLOW_SLOW !== '0';
  const built = build({ allowSlow: allowSlow });
  const block = built.block;
  if (argv.indexOf('--write') >= 0) {
    const r = applyToDoc(block);
    if (!r.ok) { console.log('✗ ' + r.reason); process.exit(1); }
    // 铁律：这一次回填就不许把「读不出」写进文档（那等于把第二真源换成一张空表）。
    const unread = built.rows.filter(function (x) { return !x.readings; });
    if (unread.length) {
      console.log('✗ 有 ' + unread.length + ' 道门禁读不出，拒绝回填：' + unread.map(function (x) { return x.rel; }).join(', '));
      return 1;
    }
    if (r.changed) fs.writeFileSync(DOC, r.next, 'utf8');
    console.log('■ docs/gates.md 读数表已回填' + (r.changed ? '' : '（无变化）'));
    console.log(built.rows.length + ' 道门禁已现场跑过' + (built.skipped.length ? '（跳过慢门禁：' + built.skipped.join(', ') + '）' : ''));
    return 0;
  }
  if (argv.indexOf('--check') >= 0) {
    // 快 check：只比**快门禁**那几行，实测 <25s，可以进门禁。
    // 慢门禁（readings-v2106，117s）不参与比对，那一行保持上次 --write 的原样。
    const oldBlock = readBlock();
    if (oldBlock === null) { console.log('✗ markers-missing（文档缺少生成标记）'); return 1; }
    const unread = built.rows.filter(function (x) { return !x.readings; });
    if (unread.length) { console.log('✗ 有 ' + unread.length + ' 道快门禁读不出：' + unread.map(function (x) { return x.rel; }).join(', ')); return 1; }
    const slowRels = built.skipped.slice();
    const a = blankMs(stripRowsOf(oldBlock, slowRels));
    const b = blankMs(stripRowsOf(block, slowRels));
    if (a !== b) {
      const NL = String.fromCharCode(10);
      const la = a.split(NL);
      const lb = b.split(NL);
      const diff = [];
      for (let i = 0; i < Math.max(la.length, lb.length); i++) {
        if (la[i] !== lb[i]) diff.push('  · 文档：' + (la[i] === undefined ? '(无)' : la[i]) + NL + '    现场：' + (lb[i] === undefined ? '(无)' : lb[i]));
      }
      console.log('✗ docs/gates.md 读数表已过期（跑 --write 回填），差异 ' + diff.length + ' 行：');
      diff.slice(0, 6).forEach(function (x) { console.log(x); });
      return 1;
    }
    console.log('✓ docs/gates.md 读数表与现场一致（快门禁 ' + built.rows.length + ' 道；慢门禁不参与：' + (slowRels.length ? slowRels.join(', ') : '无') + '）');
    return 0;
  }
  console.log(block);
  return 0;
}
if (require.main === module) process.exit(main());
module.exports = { build: build, runGate: runGate, render: render, GATES: GATES, BEGIN: BEGIN, END: END };
