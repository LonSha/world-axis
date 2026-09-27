#!/usr/bin/env node
'use strict';
/**
 * tools/bump_v2107.js — v2.106.1 → v2.107.0 同批升版。
 *
 * 本版 = 计划一 #17（拒收码分类完备性审计）+ #20（模块循环依赖静态检测）合版，
 * 纯 tests 侧，产品面零扩张（出口面契约应逐字未变）。
 *
 * 三条守卫（与 bump_v2106_1.js 同规格）：
 *   ① 锚点唯一性：每个锚点在目标文件里必须恰好命中期望次数；
 *   ② 幂等保护：已处于 2.107.0 ⇒ ABORT 而不是静默重写；
 *   ③ 剩余字样计数：升完全仓残留逐文件报出，由人核对是否皆为历史叙述。
 *
 * run.js 的特殊：本版新增了 rcc / mcg 两行 require 与两个 section（+102 行），
 *   故 8 处引号锚点的**行号已位移**，实现必须按「含引号锚点的行」现场定位，
 *   不许写死行号（那是 v2.106.0 A10 的教训：写死读数的第二副本）。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OLD = '2.106.1';
const NEW = '2.107.0';
const DRY = process.argv.indexOf('--dry') >= 0;

let fails = 0;
function ok(c, m) { if (c) console.log('  OK ' + m); else { fails++; console.log('  FAIL ' + m); } }
function readText(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function writeText(rel, t) { if (!DRY) fs.writeFileSync(path.join(ROOT, rel), t, 'utf8'); }

const SINGLE = [
  { rel: 'index.js', from: "const VERSION = '" + OLD + "'", to: "const VERSION = '" + NEW + "'", n: 1 },
  { rel: 'manifest.json', from: '"version": "' + OLD + '"', to: '"version": "' + NEW + '"', n: 1 },
  { rel: 'tests/reject-code-ledger.json', from: '"version": "' + OLD + '"', to: '"version": "' + NEW + '"', n: 1 },
  { rel: 'tests/module-registry-ledger.json', from: '"version": "' + OLD + '"', to: '"version": "' + NEW + '"', n: 1 },
  { rel: 'tests/dead-export-ledger.json', from: '"version": "' + OLD + '"', to: '"version": "' + NEW + '"', n: 1 },
  { rel: 'tests/reject-lock-v2780.js', from: "led.version === '" + OLD + "'", to: "led.version === '" + NEW + "'", n: 1 }
];

const RUN_REL = 'tests/run.js';
const qOld = "'" + OLD + "'";

console.log('== ① 幂等保护 ==');
let already = 0;
SINGLE.forEach(function (s) { if (readText(s.rel).indexOf(s.to) >= 0) already++; });
if (already) { console.log('  ABORT：已有 ' + already + ' 个目标文件处于 ' + NEW + ' —— 不重复升版'); process.exit(1); }
console.log('  已确认全仓未处于 ' + NEW + (DRY ? '（DRY 模式：只核对不写盘）' : ''));

console.log('== ② 单点锚点 ==');
SINGLE.forEach(function (s) {
  const t = readText(s.rel);
  const n = t.split(s.from).length - 1;
  ok(n === s.n, s.rel + ' 锚点命中 ' + n + '/' + s.n);
  if (n === s.n) writeText(s.rel, t.split(s.from).join(s.to));
});

console.log('== ③ run.js 期望锚点（按含引号行现场定位）==');
(function bumpRun() {
  const NL = String.fromCharCode(10);
  const L = readText(RUN_REL).split(NL);
  const hits = [];
  L.forEach(function (l, i) { if (l.indexOf(qOld) >= 0) hits.push(i); });
  ok(hits.length === 8, 'run.js 含引号期望锚点的行数 = 8（实 ' + hits.length + '）');
  if (hits.length !== 8) return;
  let n = 0;
  hits.forEach(function (i) { n += (L[i].split(OLD).length - 1); L[i] = L[i].split(OLD).join(NEW); });
  console.log('  run.js 锚点行内共 ' + n + ' 处（引号 8 + 消息副本 ' + (n - 8) + '）');
  const rest = L.filter(function (l) { return l.indexOf(OLD) >= 0; });
  console.log('  run.js 历史叙述字样保留 ' + rest.length + ' 行（逐行核对见下）');
  rest.forEach(function (l) { console.log('      · ' + l.trim().slice(0, 120)); });
  writeText(RUN_REL, L.join(NL));
})();

console.log('== ④ 台账 _note 版本词（module-registry-ledger 无 _note，不参与）==');
(function bumpNote(rel, oldWord, newWord) {
  const t = readText(rel);
  const n = t.split(oldWord).length - 1;
  ok(n === 1, rel + ' 自称版本词恰 1 处（实 ' + n + '）');
  if (n === 1) writeText(rel, t.split(oldWord).join(newWord));
})('tests/dead-export-ledger.json', '（v' + OLD + '）', '（v' + NEW + '）');

console.log('== ⑤ 拒收码台账按沿革段追加（转义 \\n 形态）==');
(function appendNote(rel, VER) {
  const t = readText(rel);
  const NL = String.fromCharCode(10);
  if (t.indexOf('v' + VER) >= 0) { console.log('  SKIP：' + rel + ' 已含 ' + VER + ' 沿革段'); return; }
  const esc = String.fromCharCode(92) + 'n';
  const marker = esc + 'v' + OLD + '：';
  const n = t.split(marker).length - 1;
  console.log('  ' + rel + ' 上一沿革段标记出现 ' + n + ' 次（用于定位追加点）');
})('tests/reject-code-ledger.json', NEW);

console.log('== ⑥ 剩余字样计数（人工核对是否皆为历史叙述）==');
function walk(dir, needle, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === '.git' || e.name === 'node_modules') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p, needle, out);
    if (!/\.(js|json|md)$/.test(e.name)) return;
    const t = fs.readFileSync(p, 'utf8');
    const n = t.split(needle).length - 1;
    if (n) out.push(path.relative(ROOT, p) + ' x' + n);
  });
  return out;
}
console.log('  ' + OLD + ' 残留：' + (walk(ROOT, OLD, []).join(' | ') || '（无）'));
console.log('  ' + NEW + ' 落点：' + (walk(ROOT, NEW, []).join(' | ') || '（无）'));

console.log('BUMP ' + (fails === 0 ? 'OK' : 'FAIL') + ' —— ' + OLD + ' -> ' + NEW + (DRY ? '（DRY）' : ''));
if (fails) process.exit(1);