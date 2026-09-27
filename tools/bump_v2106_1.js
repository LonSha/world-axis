#!/usr/bin/env node
'use strict';
/**
 * tools/bump_v2106_1.js — v2.106.0 → v2.106.1 同批升版（补作版）。
 *
 * 为什么需要一条补作版：v2.106.0 交付时**如实留账**了一条未覆盖项 ——
 *   #4 原文点名的 `tools/sync-hardcoded.js` 薄壳 CLI 未落盘。本次补上，并在端到端验证里
 *   撞出三个真缺陷（同批改消息副本 / 原始字段名 / 历史叙述隔离）。
 *
 * 三条守卫（与 bump_v2106.js 同规格）：
 *   ① 锚点唯一性：每个锚点在目标文件里必须恰好命中期望次数；
 *   ② 幂等保护：已经处于 2.106.1 ⇒ ABORT 而不是静默重写；
 *   ③ 剩余字样计数：升完把全仓残留报出来，由人核对是否都是历史叙述。
 *
 * run.js 的特幸：版本字样共 17 处 = 8 处引号**期望锚点** + 9 处裸串；
 *   其中 6 处裸串是锚点行内的**消息文本**（#6 要求同批改，否则 message-mismatch 报红），
 *   3 处是历史叙述注释（32 / 19001 / 19006）——**必须保留**。
 *   故实现为：只对「含引号锚点」的 8 行做**行内全部**替换，实测应命中 14 处。
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OLD = '2.106.0';
const NEW = '2.106.1';
const DRY = process.argv.indexOf('--dry') >= 0;

let fails = 0;
function ok(c, m) { if (c) console.log('  OK ' + m); else { fails++; console.log('  FAIL ' + m); } }
function readText(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function writeText(rel, t) { if (!DRY) fs.writeFileSync(path.join(ROOT, rel), t, 'utf8'); }

const SINGLE = [
  { rel: 'index.js', from: "const VERSION = '" + OLD + "';", to: "const VERSION = '" + NEW + "'", n: 1 },
  { rel: 'manifest.json', from: '\"version\": \"' + OLD + '\"', to: '\"version\": \"' + NEW + '\"', n: 1 },
  { rel: 'tests/reject-code-ledger.json', from: '\"version\": \"' + OLD + '\"', to: '\"version\": \"' + NEW + '\"', n: 1 },
  { rel: 'tests/module-registry-ledger.json', from: '\"version\": \"' + OLD + '\"', to: '\"version\": \"' + NEW + '\"', n: 1 },
  { rel: 'tests/dead-export-ledger.json', from: '\"version\": \"' + OLD + '\"', to: '\"version\": \"' + NEW + '\"', n: 1 },
  { rel: 'tests/reject-lock-v2780.js', from: "led.version === '" + OLD + "'", to: "led.version === '" + NEW + "'", n: 1 }
];

const RUN_REL = 'tests/run.js';
const qOld = "'" + OLD + "'";
function bumpRun() {
  const L = readText(RUN_REL).split(String.fromCharCode(10));
  const hits = [];
  L.forEach(function (l, i) { if (l.indexOf(qOld) >= 0) hits.push(i); });
  ok(hits.length === 8, 'run.js 含引号期望锚点的行数 = 8（实 ' + hits.length + '）');
  if (hits.length !== 8) return;
  let n = 0;
  hits.forEach(function (i) { n += (L[i].split(OLD).length - 1); L[i] = L[i].split(OLD).join(NEW); });
  ok(n === 14, 'run.js 锚点行内共 14 处（引号 8 + 消息 6，实 ' + n + '）');
  const rest = L.filter(function (l) { return l.indexOf(OLD) >= 0; });
  ok(rest.length === 3, 'run.js 历史叙述字样保留 3 行（实 ' + rest.length + '）');
  writeText(RUN_REL, L.join(String.fromCharCode(10)));
}

function bumpNote(rel, oldWord, newWord) {
  const t = readText(rel);
  const n = t.split(oldWord).length - 1;
  ok(n === 1, rel + ' 自称版本词恰 1 处（实 ' + n + '）');
  if (n !== 1) return;
  writeText(rel, t.split(oldWord).join(newWord));
}

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

console.log('== ③ run.js 期望锚点（8 行 / 14 处）==');
bumpRun();

console.log('== ④ 台账 _note 版本词 ==');
bumpNote('tests/dead-export-ledger.json', '（v' + OLD + '）', '（v' + NEW + '）');

console.log('== ⑤ 剩余字样计数（人工核对是否皆为历史叙述）==');
function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === '.git' || e.name === 'node_modules') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p, out);
    if (!/\.(js|json|md)$/.test(e.name)) return;
    const t = fs.readFileSync(p, 'utf8');
    const n = t.split(OLD).length - 1;
    if (n) out.push(path.relative(ROOT, p) + ' \u00d7' + n);
  });
  return out;
}
function walkNew(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === '.git' || e.name === 'node_modules') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walkNew(p, out);
    if (!/\.(js|json|md)$/.test(e.name)) return;
    const t = fs.readFileSync(p, 'utf8');
    const n = t.split(NEW).length - 1;
    if (n) out.push(path.relative(ROOT, p) + ' \u00d7' + n);
  });
  return out;
}
console.log('  ' + OLD + ' 残留：' + (walk(ROOT, []).join(' | ') || '（无）'));
console.log('  ' + NEW + ' 落点：' + (walkNew(ROOT, []).join(' | ') || '（无）'));

console.log('BUMP ' + (fails === 0 ? 'OK' : 'FAIL') + ' —— ' + OLD + ' -> ' + NEW + (DRY ? '（DRY）' : ''));
if (fails) process.exit(1);
