'use strict';
// 探针：L2p 的 42 个里，有多少是「面板真有控件」，多少只是被通用读数口扫到？
//   假设：面板对每个引擎都会调 getSettings()/stat()（统一展示），
//         那么任何引擎都会进 L2p —— L2p 就成了虚高栏，判据失效。
//   判据：看面板调用它的成员里，有没有「本引擎特有」的名字（不是通用口径词）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

require(path.join(BASE, 'tests/mock.js'));
const g = global;
const LOAD = vm.runInNewContext('[' + (read('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

// 装完整预取（含 ui/）
const PROD = [];
for (const d of ['ui', 'engines', 'core', 'render', 'actors', 'direction', 'compat', 'design']) {
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) PROD.push(rel);
    }
  })(d);
}
PROD.push('index.js');
const pf = new Map();
WA.baseUrl = '';
for (const rel of PROD) { const t = read(rel); if (t && t.length >= 16) pf.set(rel, t); }
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();

const v = WA.driverLedger.view();
// 通用口径词：任何模块都有的「展示/设置」成员，不构成该引擎被玩家驱动
const GENERIC = { getSettings: 1, setSettings: 1, stat: 1, statView: 1, DEF: 1, view: 1,
  summaryText: 1, build: 1, why: 1, invalidate: 1, get: 1, set: 1, reset: 1, list: 1, info: 1 };

console.log('=== L2p 42 个：区分「真有专属控件」与「只被通用读口扫到」===');
const real = [], genericOnly = [];
for (const ns of v.layerNames.L2p) {
  const w = WA.driverLedger.why(ns);
  const own = w.panelMembers.filter(function (m) { return !GENERIC[m]; });
  if (own.length) real.push({ ns: ns, own: own });
  else genericOnly.push({ ns: ns, generic: w.panelMembers });
}
console.log('\n【真有专属控件】' + real.length + ' 个');
real.forEach(function (r) { console.log('  ' + r.ns + ' -> ' + r.own.slice(0, 6).join('、')); });
console.log('\n【只有通用口径词】' + genericOnly.length + ' 个');
genericOnly.forEach(function (r) { console.log('  ' + r.ns + ' -> ' + r.generic.join('、')); });

// ── 面板里到底有没有「遍历所有引擎」的通用代码 ──────────────────────────
console.log('\n=== ui/ 里的遍历式调用（Object.keys(WA) / for...in）===');
const uiFiles = PROD.filter(function (r) { return r.indexOf('ui/') === 0; });
for (const rel of uiFiles) {
  const src = read(rel);
  const hits = [];
  if (/Object\.keys\(\s*WA\s*\)/.test(src)) hits.push('Object.keys(WA)');
  if (/for\s*\([^)]*in\s+WA\s*\)/.test(src)) hits.push('for..in WA');
  if (/Object\.entries\(\s*WA\s*\)/.test(src)) hits.push('Object.entries(WA)');
  if (hits.length) console.log('  ' + rel + ' -> ' + hits.join(' + '));
}

// ── 抽查：面板源码里到底怎么调这几个引擎的 ──────────────────────────────
console.log('\n=== 抽查 3 个「只有通用口径词」的引擎，看面板原文 ===');
genericOnly.slice(0, 3).forEach(function (r) {
  console.log('\n-- ' + r.ns + ' 在 ui/ 中的出现处 --');
  for (const rel of uiFiles) {
    const src = read(rel);
    const re = new RegExp('WA\\.' + r.ns + '\\.[A-Za-z_$][\\w$]*\\s*\\(', 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length;
      const ctxs = src.slice(Math.max(0, m.index - 90), m.index + 60).replace(/\n+/g, ' ⏎ ');
      console.log('  ' + rel + ':' + line + '  ' + m[0] + '   …' + ctxs + '…');
    }
  }
});