#!/usr/bin/env node
/**
 * WorldAxis tools/mock-boundary.js (v2.529.0) — OPV29-22 替身与真源边界
 *
 * ── 它治什么（本版现场）──────────────────────────────────
 *   计划原文：「测试替身不得替代被测源码；篡改真源码必须红」。此前仓里没有任何机器判据：
 *   `require.cache` 既能用来**清缓存重读真源**（好），也能用来**塞一个假模块顶替真源**（坏），
 *   而两种写法在 grep 里长得几乎一样。
 *
 * ── 三种形态（本工具只认这三种，别的不猜）──────────────────────
 *   P 清缓存  `delete require.cache[...]`  ⇒ **安全**：它让下一次 require 重新读真源。
 *   I 注入    `require.cache[...] = <非空>` ⇒ **危险**：被 require 到的是替身，不是真源。
 *   N 产品源注入：注入点的目标解析到 engines/ core/ ui/ render/ index.js ⇒ **红**（替身顶替真源）。
 *
 * ── 判据（M 面）────────────────────────────────────────
 *   M1 注入点必须逐文件登记在 tests/mock-boundary-ledger.json（含 sites 数量与 why）。
 *   M2 产品源注入 = 0（任何一条都红，没有白名单——真要替身就得改测法）。
 *   M3 登记失实即红：登记了但现场没有该文件/该文件注入数为 0；或现场比登记多。
 *   M4 工具能力自证：沙箱里造「真源 + 清缓存后读真源的锁」，把真源改坏 ⇒ 该锁必须红
 *      （证明"清缓存"这条路读的是真源，不是缓存里的旧脸）。
 *   M5 清缓存站点 ≥1 且逐文件可见（现场的测试确实在读真源；这不是「反正没人清缓存」的虚空通过）。
 *
 * ── 判形态只看代码（v2.529.0 修订，有真因）──────────────────
 *   第一版直接对整行做正则，结果把**本门禁自己专锁里的夹具模板字符串**
 *   （`"require.cache[pabs] = inflight;"`，写进临时沙箱用的那段文本）
 *   算成了「产品源被替身顶替」⇒ 自指红。现在先 codeOnly() 把字符串字面量与行注释
 *   抹成空格再判形态；取注入目标仍用原行（路径本来就写在字符串里）。
 *   代价：字符串里的真代码看不见——但字符串里的代码本来就不执行。
 *
 * ── 边界（如实登记）──────────────────────────────────
 *   · 逐行正则，不做数据流分析：把 `require.cache` 藏进变量再操作、或 `Module._load` 覆写，
 *     本工具看不见（仓里现在 0 处 Module._load，故暂不扩面）。
 *   · M4 是**工具能力**自证，不是对全仓做变异测试：它证明「这条判据能抓住顶替」，
 *     不证明「全仓每个断言都读真源」——后者要靠 OPV29-12 的判据指纹比对配合。
 *
 * ── 用法 ───────────────────────────────────────────
 *   node tools/mock-boundary.js           # 打印三类站点
 *   node tools/mock-boundary.js --check   # 判据模式：违反即 rc=1
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const LEDGER_REL = 'tests/mock-boundary-ledger.json';
const PRODUCT_RE = /(^|\/)(engines|core|ui|render)\/|(^|\/)index\.js$/;

/**
 * 只留代码：把字符串字面量与行注释替换成空格（保留原长度与位置）。
 * 为什么要这一步：`"require.cache[x] = fake;"` 写在一个字符串里（夹具模板、文档示例、
 * 本门禁自己的专锁）**不是**注入，可正则只看字符会把它算成注入。上一版本就把
 * tests/opv29-z4-22-v2529.js 自己的夹具模板算成了「产品源被替身顶替」的自指红。
 * 代价（如实登记）：字符串里的真代码看不见——但真代码在字符串里本来就不执行。
 */
function codeOnly(line) {
  let out = '';
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (q) {
      if (ch === '\\') { out += '  '; i++; continue; }
      if (ch === q) { q = null; }
      out += ' ';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; out += ' '; continue; }
    if (ch === '/' && line.charAt(i + 1) === '/') { break; }
    out += ch;
  }
  return out;
}

function scan(root) {
  const base = root || ROOT;
  const dir = path.join(base, 'tests');
  const rep = { tool: 'mock-boundary', schema: 1, purge: 0, inject: [], productInject: [], perFile: {} };
  let names = [];
  try { names = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort(); } catch (e) { return rep; }
  names.forEach(function (f) {
    const rel = 'tests/' + f;
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    txt.split('\n').forEach(function (line, i) {
      const code = codeOnly(line);            // 判形态只看代码；取 target 仍用原行（路径在字符串里）
      if (!/require\.cache\s*\[/.test(code)) return;
      if (/delete\s+require\.cache\s*\[/.test(code)) { rep.purge += 1; return; }
      if (!/require\.cache\s*\[[^\]]+\]\s*=[^=]/.test(code)) return;
      const rec = { at: rel + ':' + (i + 1), line: line.trim().slice(0, 140) };
      rep.inject.push(rec);
      rep.perFile[rel] = (rep.perFile[rel] || 0) + 1;
      // 目标是否产品源：同一行里出现的 ../engines/… 、 engines/… 等字面量
      const m = /['"]([^'"]*?(?:engines|core|ui|render)[^'"]*\.js)['"]/.exec(line);
      const target = m ? m[1] : null;
      if (target && PRODUCT_RE.test(target)) rep.productInject.push({ at: rec.at, target: target });
    });
  });
  return rep;
}

function check(root) {
  const base = root || ROOT;
  const rep = scan(base);
  const problems = [];
  let led = null;
  try { led = JSON.parse(fs.readFileSync(path.join(base, LEDGER_REL), 'utf8')); } catch (e) { led = null; }
  if (!led || !Array.isArray(led.entries)) problems.push('台账读不出或没有 entries：' + LEDGER_REL);
  else {
    const reg = {};
    led.entries.forEach(function (e) { reg[e.file] = e; });
    Object.keys(rep.perFile).forEach(function (f) {
      const e = reg[f];
      if (!e) { problems.push('未登记的替身注入：' + f + '（' + rep.perFile[f] + ' 处）'); return; }
      if (!e.why || String(e.why).length < 20) problems.push('登记缺 why（≥20 字）：' + f);
      if (Number(e.sites) !== rep.perFile[f]) {
        problems.push('登记失实：' + f + ' 登记 ' + e.sites + ' 处 / 现场 ' + rep.perFile[f] + ' 处');
      }
    });
    led.entries.forEach(function (e) {
      if (!rep.perFile[e.file]) problems.push('登记了但现场没有注入（影子条目）：' + e.file);
    });
  }
  if (rep.productInject.length) {
    rep.productInject.forEach(function (x) { problems.push('产品源被替身顶替：' + x.at + ' → ' + x.target); });
  }
  if (rep.purge < 1) problems.push('全场没有一处清缓存重读真源（测试可能在读缓存旧脸）');
  return { scan: rep, problems: problems, ok: problems.length === 0 };
}

/** M4：沙箱自证——真源被改坏后，清缓存重读真源的锁必须红。 */
function provePurgeReadsTruth() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-sbx-'));
  const w = function (rel, text) { fs.writeFileSync(path.join(dir, rel), text); };
  // 真源：导出 true；锁：清缓存后 require 真源并断言 true。跑锁的脚本返回码即结论。
  w('truth.js', 'module.exports = { value: true };\n');
  w('lock.js', [
    "'use strict';",
    "const path = require('path');",
    "const T = path.join(__dirname, 'truth.js');",
    "delete require.cache[require.resolve(T)];",
    "const m = require(T);",
    "if (m.value !== true) { console.log('FAIL 1/1'); process.exit(1); }",
    "console.log('pass (1)');"
  ].join('\n') + '\n');
  const run = function () {
    const r = cp.spawnSync(process.execPath, [path.join(dir, 'lock.js')], { cwd: dir, encoding: 'utf8' });
    return r.status;
  };
  const before = run();
  w('truth.js', 'module.exports = { value: false };\n');   // 真破坏
  const after = run();
  fs.rmSync(dir, { recursive: true, force: true });
  return { before: before, after: after, ok: before === 0 && after === 1 };
}

function main() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--root');
  const rootArg = idx >= 0 ? argv[idx + 1] : '';
  const base = rootArg ? path.resolve(rootArg) : ROOT;
  if (rootArg && !fs.existsSync(base)) {
    console.error('✗ --root 指向的目录不存在：' + base);
    process.exitCode = 2;
    return;
  }
  if (argv.indexOf('--prove') >= 0) {
    const p = provePurgeReadsTruth();
    console.log('■ M4 沙箱自证：真源完好 ⇒ rc=' + p.before + '；真源被改坏 ⇒ rc=' + p.after
      + ' ⇒ ' + (p.ok ? '清缓存这条路读的确实是真源' : 'FAIL（改坏了还不红 ⇒ 它在读缓存旧脸）'));
    process.exitCode = p.ok ? 0 : 1;
    return;
  }
  const r = check(base);
  console.log('■ 受检根：' + base);
  console.log('■ 清缓存站点（P，安全）：' + r.scan.purge + ' 处');
  console.log('■ 替身注入站点（I，须登记）：' + r.scan.inject.length + ' 处'
    + (r.scan.inject.length ? ' ⇒ ' + r.scan.inject.map(function (x) { return x.at; }).join(' , ') : ''));
  console.log('■ 产品源被顶替（N，零容忍）：' + r.scan.productInject.length + ' 处');
  if (argv.indexOf('--check') >= 0) {
    if (r.ok) { console.log('■ 结论：PASS（注入全在册且非产品源；清缓存重读真源 ' + r.scan.purge + ' 处）'); return; }
    r.problems.forEach(function (p) { console.error('✗ ' + p); });
    console.log('■ 结论：FAIL（' + r.problems.length + ' 项）');
    process.exitCode = 1;
    return;
  }
  console.log('■ 结论：' + (r.ok ? '边界成立' : '有 ' + r.problems.length + ' 项违反（--check 会红）'));
}

module.exports = { scan: scan, check: check, provePurgeReadsTruth: provePurgeReadsTruth, PRODUCT_RE: PRODUCT_RE };
if (require.main === module) main();