'use strict';
/**
 * tests/alias-face-v2542.js — 引用面「别名」专锁。
 *
 * 病：静态引用面只认 `WA.ns.mem` 两级前缀。产品代码里 `const nl = WA.narrativeLens;`
 *   再 `nl.diagnose()` 这种写法会被算成「零引用」——实测 106 处 / 59 个导出因此假死，
 *   包括 ui/panel.js **真在调**的 narrativeLens.diagnose / stat。
 *   危害不是少算一个数字，而是把人引向「再补一条路由」：同一个能力接两遍，真缺口没人看。
 *
 * 本锁只钉三件事：
 *   ① 正控：别名真被解析（整值绑定 `= WA.ns` / `= window.WorldAxis.ns`）。
 *   ② 负控：四条不该解析的形态一条都不许解析 —— 被重新赋值、只取到子属性、`WA` 自己、
 *      与 ns 同名的局部变量。负控在此特别重要：别名证据比两级前缀弱，解析错了它不是少算，
 *      而是把别的 ns 的成员记到别人头上（真悬空会被假阳性淹没）。
 *   ③ 接线自证：inventory 的产品面循环真的调用了这两个函数，且只用来「清除假死」——
 *      命中成员不在该 ns 接口面上时跳过（只减假死、不造悬空）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const REL = 'tests/inventory.js';
const src = fs.readFileSync(path.join(BASE, REL), 'utf8');

let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }

// ── 0. 从真源码切出两个函数来跑（不在本文件重写一份口径）──
const i0 = src.indexOf('const ALIAS_DECL_RE =');
const i1 = src.indexOf('function aliasMap');
const i2 = src.indexOf('function aliasRe');
const i3 = src.indexOf('\n}\n', i2);
a(i0 > 0 && i1 > i0 && i2 > i1 && i3 > i2, '0 能从 inventory.js 切出别名面三个定义');
const slice = src.slice(i0, i3 + 2);
const box = {};
vm.runInNewContext(slice + '\nthis.aliasMap = aliasMap; this.aliasRe = aliasRe;', box);
const aliasMap = box.aliasMap, aliasRe = box.aliasRe;
a(typeof aliasMap === 'function' && typeof aliasRe === 'function', '0b 切片执行后拿到两个函数');

// ── 1. 正控：整值绑定真被解析 ──
const m1 = aliasMap('const nl = WA.narrativeLens;\nnl.diagnose();');
a(m1.nl === 'narrativeLens', '1 `const nl = WA.narrativeLens` 解析为 nl→narrativeLens（实 ' + JSON.stringify(m1) + '）');
const r1 = aliasRe(m1);
r1.lastIndex = 0;
const h1 = r1.exec('const x = nl.diagnose();');
a(!!h1 && h1[1] === 'nl' && h1[2] === 'diagnose', '1b `nl.diagnose()` 命中 (nl, diagnose)');
const m2 = aliasMap('const L = window.WorldAxis.narrativeLens;\n');
a(m2.L === 'narrativeLens', '1c `= window.WorldAxis.ns` 也算整值绑定');
a((function () {
  const r = aliasRe(m1); const s = 'nl?.stat(); nl.reset();'; let n = 0, x; r.lastIndex = 0;
  while ((x = r.exec(s))) n++;
  return n === 2;
})(), '1d 同一行多处别名调用都计入（含可选链）');

// ── 2. 负控 1：被重新赋值过的别名不解析 ──
const m3 = aliasMap('const s = WA.store; s = other; s.get();');
a(!m3.s, '2 被重新赋值过 ⇒ 不解析（否则会把 other.get 记成 store.get）');

// ── 3. 负控 2：只取到子属性不算整值绑定 ──
const m4 = aliasMap('const d = WA.store.get();');
a(!m4.d, '3 `= WA.store.get()` 不是整值绑定 ⇒ 不解析');

// ── 4. 负控 3：WA 自己不是别名 ──
const m5 = aliasMap('const WA = window.WorldAxis || {};');
a(!m5.WA, '4 `const WA = window.WorldAxis` 不当作别名');

// ── 5. 负控 4：与 ns 同名的局部变量跳过（同义，没必要再算一遍）──
const m6 = aliasMap('const motif = WA.motif;');
a(!m6.motif, '5 `const motif = WA.motif` 跳过（同名不产生额外引用面）');

// ── 6. 接线自证：产品面循环真的调用，且只减假死不造悬空 ──
a(src.indexOf('const are = aliasRe(amap);') > 0, '6 产品面循环调用了 aliasRe（不是只有函数没人用）');
a(src.indexOf('if (!hasMember(ans, amem)) continue;') > 0,
  '6b 命中成员不在该 ns 接口面上时跳过（只减假死、不造悬空）');
a(src.indexOf('refs.push({ ns: ans, mem: amem, file: rel, line: idx + 1 });') > 0,
  '6c 解析出的引用真的进了 refs 面（不是解析完就扔）');

// ── 7. 现场：这批假死已经不在账本里 ──
//   注：清掉的是「在本文件只被赋值一次」的稳定别名（106 处里的一部分）。
//   像 engines/tool-diag.js 的 `var sc = WA.storyChoice`（同文件里 sc 被赋值 6 次）**不清**——
//   那不是稳定别名，把它算成引用会把别处的成员记到 storyChoice 头上。少清几条是对的。
const led = JSON.parse(fs.readFileSync(path.join(BASE, 'tests/dead-export-ledger.json'), 'utf8'));
['narrativeLens.diagnose', 'narrativeLens.stat', 'activity.stat', 'contest.view']
  .forEach(function (k) { a(!led.dead[k], '7 账本里已无假死条目：' + k); });
a(!!led.dead['storyChoice.diagnose'], '7b 复用型短名（sc 被赋值 6 次）仍留在死面——不是漏清，是不该清');

console.log('ALIAS-FACE-V2542: ' + (fail ? 'FAIL' : 'pass') + '（' + pass + ' 项）');
if (fail) process.exit(1);
