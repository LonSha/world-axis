#!/usr/bin/env node
'use strict';
/**
 * tests/org-block-quota-v2576.js
 * 「组织面四处静默截断」自证与读数专锁（v2.576.0）
 *
 * 治的缺口：engines/org.js 的 buildBlock()。旧写法一次砍四刀，刀刀不出声：
 *   ① 每个势力的资源键  Object.keys(stockOf(f)).slice(0, cfg.maxItems)
 *   ② 人物面          Object.values(state().people).slice(0, cfg.maxItems)  ← 全库人物只念 3 个
 *   ③ 项目行 projLines.length >= 4 / 欠账行 >= 5（在 forEach 里 return，无声）
 *   ④ 整块            lines.slice(0, cfg.maxItems + 2)  ← 最后一行之后全消失
 *   于是「三行」到底是全部还是抽样，读的人无从判断。
 *
 * 探针实测（/tmp/probe576.js + /tmp/probe576c.js，改造前 → 改造后）：
 *   · s1 六势力五键 ⇒ 旧版无任何自证、stat().block = null；
 *        新版块尾「（本面名额：资源键 18/30、人物 3/8、行 5/9；未列者仍在组织账上，不是没有）」
 *   · s3 旧版 stat().block = null → 五栗 {candidates:9,picked:5,quota:3,hidden:21,ranked-first} + faces
 *   · p1/p2 六个项目、七条欠账 ⇒ 旧版只念 4 条/5 条且一句不说；新版念同样多，但自证「项目 4/6、欠账 5/7」
 *   · s5 maxItems='x' ⇒ 旧版 slice(0,NaN+2) 使整块塌成一行，新版回落默认
 *   · s6 空表 ⇒ 旧版 '' 且 block=null；新版 '' 且 mode='empty'（两态可分辨）
 *
 * 本批五件事：
 *   ① 名额提成 quotaOf(cfg)（防 NaN/0；上限 RES_KEY_MAX=12 与设置面 bound 同源）；
 *   ② 选取函数显式可复算：keysOf（键字典序）、peopleOf（持有种数降序 → 名字字典序）；
 *   ③ 项目/欠账改为「先攒全集再截断」，共同项目 4 行 / 欠账 5 行限额具名；
 *   ④ 块尾自证「（本面名额：…；未列者仍在组织账上，不是没有）」；
 *   ⑤ stat().block 五栗 + stat 里声明 block:null + stat() 对 block 深拷（原先是浅拷）。
 *
 * 判据结构：A 静态 / B 行为 / C 读数 / N 五条负控。
 * 单独跑：node tests/org-block-quota-v2576.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const BASE = path.join(__dirname, '..');
const REL = 'engines/org.js';
let pass = 0, fail = 0;
const fails = [];
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; fails.push(name + ' :: ' + e.message); console.log('  ✗ ' + name + ' :: ' + e.message); }
}
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function stripComment(line) {
  const t = line.trim();
  if (t.indexOf('/*') === 0 || t.indexOf('*') === 0) return '';
  const i = line.indexOf('//');
  return i < 0 ? line : line.slice(0, i);
}
function codeOnly(text) { return text.split('\n').map(stripComment).join('\n'); }
const SRC = rd(REL);
const CODE = codeOnly(SRC);
const NOW = 1700000000000;

function load(code, st, over) {
  let cfg = Object.assign({ enabled: true, maxItems: 3 }, over || {});
  const WA = {
    clock: { now: function () { return NOW; }, wallNow: function () { return NOW; } },
    settingsBus: {
      read: function () { return cfg; },
      normalize: function (r, v) { return v; },
      saveOrThrow: function (r, v) { cfg = v; return { ok: true }; }
    },
    store: { get: function () { return st; }, transact: function (fn) { fn(st); return { ok: true }; },
      chatId: function () { return 'c1'; } }
  };
  // v2.84.0：桩由 tests/synth-host.js 统一补齐核心模块（与 tests/org-v2540.js 同口径）
  require('./synth-host.js').hostStub(WA);
  const win = { WorldAxis: WA };
  vm.runInNewContext(code, { window: win, Date: Date, Number: Number, String: String,
    Array: Array, Object: Object, JSON: JSON, Math: Math, isFinite: isFinite }, { filename: 'engines/org.js' });
  return WA;
}
// 大夹具：六势力 × 五键（插入序刻意打乱）+ 六项目 + 七条欠账 + 八人（持有种数各不相同）
function big() {
  const KEYORD = ['c', 'e', 'a', 'd', 'b'];
  const factions = [];
  for (let i = 0; i < 6; i++) {
    const rs = {};
    KEYORD.forEach(function (k) { rs[k + i] = i + 1; });
    factions.push({
      id: 'f' + i, name: 'f' + i, resources: rs,
      projects: [{ what: 'proj' + i, status: 'ongoing', at: NOW, needs: [{ item: '粮', n: i + 1 }] }],
      roster: (function () { const r = {}; r['员' + i] = { name: '员' + i, owed: i + 1, owedItem: '粮' }; return r; })()
    });
  }
  const people = {};
  for (let i = 0; i < 8; i++) {
    const rs = {};
    for (let j = 0; j <= (7 - i); j++) rs['k' + i + '_' + j] = 1; // p0 持 8 种 … p7 持 1 种
    people['pid' + i] = { id: 'pid' + i, name: 'p' + i, resources: rs };
  }
  people['pid0'].debts = [{ to: '甲', item: '银', amount: 3, why: '赊账' }];
  return { evolution: { factions: factions }, people: people };
}
// 小夹具：一切都在名额内（用来证明「没截断就不许喊」）
function small() {
  const factions = [];
  for (let i = 0; i < 2; i++) {
    const rs = {}; rs['a' + i] = 1; rs['b' + i] = 2;
    factions.push({
      id: 'g' + i, name: 'g' + i, resources: rs,
      projects: [{ what: 'p' + i, status: 'ongoing', at: NOW, needs: [{ item: '粮', n: 1 }] }],
      roster: (function () { const r = {}; r['员' + i] = { name: '员' + i, owed: 1, owedItem: '粮' }; return r; })()
    });
  }
  return { evolution: { factions: factions }, people: { one: { id: 'one', name: '孤', resources: { k: 1 } } } };
}
// 中夹具：只看项目/欠账两面（1 势力 2 键，6 项目，7 条欠账），行数远小于整块上限
function mid() {
  const projects = [];
  for (let i = 0; i < 6; i++) projects.push({ what: 'proj' + i, status: 'ongoing', at: NOW, needs: [{ item: '粮', n: i + 1 }] });
  const roster = { '员x': { name: '员x', owed: 2, owedItem: '粮' } };
  const people = {};
  for (let i = 0; i < 6; i++) people['d' + i] = { id: 'd' + i, name: 'd' + i, resources: {},
    debts: [{ to: '债主' + i, item: '银', amount: i + 1, why: '赊账' }] };
  return { evolution: { factions: [{ id: 'w', name: 'w', resources: { a: 1, b: 2 }, projects: projects, roster: roster }] },
    people: people };
}
function blockOf(code, st, over) { return String(load(code, st, over).org.buildBlock() || ''); }
function linesOf(b) { return b.split('\n').filter(function (l) { return l; }); }
function bodyOf(b) { return linesOf(b).filter(function (l) { return l !== '[资源与组织]' && l.indexOf('资源不足时') !== 0; }); }
function sampleOf(b) { return linesOf(b).filter(function (l) { return l.indexOf('（本面名额：') === 0; })[0] || ''; }
function rowOf(b, name) { return linesOf(b).filter(function (l) { return l.indexOf(name + '：') === 0; })[0] || ''; }
function statOf(code, st, over) {
  const A = load(code, st, over);
  A.org.buildBlock();
  return A.org.stat().block;
}

console.log('A 静态');
ok('A1 名额具名 quotaOf，buildBlock 走它', function () {
  assert(CODE.indexOf('function quotaOf(cfg)') > 0, 'quotaOf 不在');
  assert(CODE.indexOf('const quota = quotaOf(cfg);') > 0, 'buildBlock 没走 quotaOf');
  assert(CODE.indexOf('return Math.min(RES_KEY_MAX, Math.max(1, n));') > 0, 'quotaOf 没夹上限');
});
ok('A2 三处限额具名 + 两个选取函数在位', function () {
  ['const RES_KEY_MAX = 12;', 'const PROJ_LINES = 4;', 'const DEBT_LINES = 5;'].forEach(function (s) {
    assert(CODE.indexOf(s) > 0, '缺 ' + s);
  });
  assert(CODE.indexOf('function keysOf(row, cap)') > 0, 'keysOf 不在');
  assert(CODE.indexOf('function peopleOf(list, cap)') > 0, 'peopleOf 不在');
});
ok('A3 块尾自证句在位', function () {
  assert(CODE.indexOf("'（本面名额：' + sampleRow.join('、')") > 0, '自证行不在');
  assert(CODE.indexOf("'；未列者仍在组织账上，不是没有）'") > 0, '自证尾句不在');
});
ok('A4 stat 声明 block:null，且 stat() 对 block 深拷', function () {
  assert(CODE.indexOf('block: null };') > 0, 'stat 没声明 block');
  assert(CODE.indexOf('out.block = stat.block ? JSON.parse(JSON.stringify(stat.block)) : null;') > 0,
    'stat() 没深拷 block');
});
ok('A5 旧四刀写法已消失', function () {
  assert(CODE.indexOf('Object.keys(stockOf(f)).slice(0, cfg.maxItems)') < 0, '第一刀还在');
  assert(CODE.indexOf('Object.values(state().people || {}).slice(0, cfg.maxItems)') < 0, '第二刀还在');
  assert(CODE.indexOf('projLines.length >= 4') < 0, '项目循环里截断还在');
  assert(CODE.indexOf('debtLines.length >= 5') < 0, '欠账循环里截断还在');
  assert(CODE.indexOf('lines.slice(0, cfg.maxItems + 2)') < 0, '第四刀还在');
});
ok('A6 文档边界第 4 条在位', function () {
  assert(/注入面名额只截断不参与筛选/.test(SRC), '边界 4 正文不在');
  assert(/每一处截断都要自证/.test(SRC), '边界 4 的自证条款不在');
});
console.log('B 行为');
ok('B1 势力行每行念 quota 个键，且按键字典序（不是插入序）', function () {
  const r = rowOf(blockOf(CODE, big()), 'f0');
  // 行格式是「键+值」（a01 = 键 a0 值 1），所以只留字母前缀即可判序
  const keys = r.replace('f0：', '').split('、').map(function (x) { return x.charAt(0); });
  assert(keys.length === 3, '应念 3 个键（实 ' + keys.length + '）');
  assert(keys.join(',') === 'a,b,c', '键序不对（实 ' + keys.join(',') + '）——插入序是 c,e,a,d,b');
});
ok('B2 六势力五键 ⇒ 自证「势力资源键 18/30」，人物键单独记账「9/21」', function () {
  const s = sampleOf(blockOf(CODE, big()));
  assert(s.indexOf('势力资源键 18/30') >= 0, '势力面自证不对：' + s);
  assert(s.indexOf('人物资源键 9/21') >= 0, '人物面把「念的 3 人共 21 键、念了 9 键」混进势力面会读成全库：' + s);
});
ok('B3 人物按持有种数降序（账最厚的先念），默认配额下自证「人物 3/8」', function () {
  // 名额够时看序：8 人持 8/7/6/5/4/3/2/1 种
  const L = bodyOf(blockOf(CODE, big(), { maxItems: 12 }));
  const people = L.map(function (l) { return /^(p\d)：/.exec(l); }).filter(Boolean).map(function (m) { return m[1]; });
  assert(people.length === 8, '应念 8 人（实 ' + people.length + '）');
  assert(people.join(',') === 'p0,p1,p2,p3,p4,p5,p6,p7', '顺序不对（实 ' + people.join(',') + '）');
  // 默认配额 3：人物行会被整块行名额挤出，但 faces 必须仍然记着这一面
  assert(sampleOf(blockOf(CODE, big())).indexOf('人物 3/8') >= 0, '人物面自证不在');
});
ok('B4 六个项目 ⇒ 念 4 条 + 自证「项目 4/6」', function () {
  const b = blockOf(CODE, mid(), { maxItems: 12 });
  const pj = linesOf(b).filter(function (l) { return l.indexOf('共同项目：') === 0; })[0] || '';
  const n = (pj.match(/「proj\d」/g) || []).length;
  assert(n === 4, '应念 4 条项目（实 ' + n + '）');
  assert(sampleOf(b).indexOf('项目 4/6') >= 0, '项目自证不对：' + sampleOf(b));
});
ok('B5 七条欠账 ⇒ 念 5 条 + 自证「欠账 5/7」', function () {
  const b = blockOf(CODE, mid(), { maxItems: 12 });
  const dt = linesOf(b).filter(function (l) { return l.indexOf('欠账：') === 0; })[0] || '';
  const n = dt.split('；').length;
  assert(n === 5, '应念 5 条欠账（实 ' + n + '）');
  assert(sampleOf(b).indexOf('欠账 5/7') >= 0, '欠账自证不对：' + sampleOf(b));
});
ok('B6 全在名额内 ⇒ 无自证行（没截断就不许喊）', function () {
  const b = blockOf(CODE, small(), { maxItems: 12 });
  assert(b.length > 0, '块不该是空');
  assert(sampleOf(b) === '', '不该有自证行：' + sampleOf(b));
});
ok('B7 maxItems 被写成字符串 ⇒ 每行回落 3 个键（整块不许塌）', function () {
  const b = blockOf(CODE, big(), { maxItems: 'x' });
  const keys = rowOf(b, 'f0').replace('f0：', '').split('、').length;
  assert(keys === 3, '应回落每行 3 键（实 ' + keys + '）');
  assert(linesOf(b).length > 3, '整块不许塌成一行（实 ' + linesOf(b).length + ' 行）');
  assert(sampleOf(b).length > 0, '回落时也该自证');
});
ok('B8 数据倒序 ⇒ 每行键序与名额自证不变（可复算）', function () {
  const a = blockOf(CODE, big(), { maxItems: 12 });
  const st = big();
  st.evolution.factions.reverse();
  const c = blockOf(CODE, st, { maxItems: 12 });
  assert(rowOf(a, 'f0') === rowOf(c, 'f0'), '倒序后 f0 行变了：' + rowOf(c, 'f0'));
  assert(sampleOf(a) === sampleOf(c), '倒序后自证变了');
});
console.log('C 读数');
ok('C1 五栗正确（big + 默认 3）', function () {
  const b = statOf(CODE, big());
  assert(b && b.quota === 3, 'quota 应 3：' + JSON.stringify(b));
  assert(b.mode === 'ranked-first', 'mode 应 ranked-first（实 ' + b.mode + '）');
  assert(b.candidates === 12, 'candidates 应 12（实 ' + b.candidates + '）');
  assert(b.picked === 5, 'picked 应 5（实 ' + b.picked + '）');
  assert(b.hidden > 0, 'hidden 应 > 0');
});
ok('C2 名额够 ⇒ mode=all-fit', function () {
  const b = statOf(CODE, small(), { maxItems: 12 });
  assert(b.mode === 'all-fit', 'mode 应 all-fit（实 ' + b.mode + '）');
});
ok('C3 没构建过 vs 构建过但空表可分辨', function () {
  const A = load(CODE, { evolution: { factions: [] }, people: {} });
  assert(A.org.stat().block === null, '没构建过应是 null');
  assert(A.org.buildBlock() === '', '空表块应是空串');
  assert(A.org.stat().block.mode === 'empty', '空表 mode 应 empty');
});
ok('C4 block 是深拷贝（改内层打不到引擎读数）', function () {
  const A = load(CODE, big());
  A.org.buildBlock();
  const b1 = A.org.stat().block;
  b1.picked = 999;
  if (b1.faces && b1.faces['资源键']) b1.faces['资源键'].picked = 999;
  const b2 = A.org.stat().block;
  assert(b2.picked === 5, 'picked 被外部改了');
  assert(!b2.faces['资源键'] || b2.faces['资源键'].picked !== 999, 'faces 内层被外部改了');
});
ok('C5 整块行名额压掉的部分计入 hidden', function () {
  const b = statOf(CODE, big());
  assert(b.hidden >= b.candidates - b.picked, 'hidden ' + b.hidden + ' 小于行差 ' + (b.candidates - b.picked));
});
console.log('N 负控（真源码破坏 ⇒ 同款判据必须红）');
function problems(code) {
  const bad = [];
  const b = blockOf(code, big());
  const r0 = rowOf(b, 'f0').replace('f0：', '').split('、').map(function (x) { return x.charAt(0); });
  if (r0.join(',') !== 'a,b,c') bad.push('B1');
  if (sampleOf(b).indexOf('势力资源键 18/30') < 0) bad.push('B2');
  const bm = blockOf(code, mid(), { maxItems: 12 });
  if (sampleOf(bm).indexOf('项目 4/6') < 0) bad.push('B4');
  if (sampleOf(bm).indexOf('欠账 5/7') < 0) bad.push('B5');
  const nan = rowOf(blockOf(code, big(), { maxItems: 'x' }), 'f0').replace('f0：', '').split('、').length;
  if (nan !== 3) bad.push('B7');
  const st = statOf(code, big());
  if (!st || st.mode !== 'ranked-first') bad.push('C1');
  return bad;
}
ok('N0 真源码零问题（负控前提）', function () {
  const bad = problems(CODE);
  assert(bad.length === 0, '真源码被判有问题：' + bad.join(','));
});
ok('N1 删掉自证行 => B2 + B4 + B5 红', function () {
  const broken = CODE.replace("if (sampleRow.length) kept.push('（本面名额：' + sampleRow.join('、') + '；未列者仍在组织账上，不是没有）');", '');
  assert(broken !== CODE, '破坏未命中');
  const bad = problems(broken);
  assert(bad.indexOf('B2') >= 0 && bad.indexOf('B4') >= 0 && bad.indexOf('B5') >= 0, '没红（实 ' + bad.join(',') + '）');
});
ok('N2 keysOf 去掉字典序 => B1 红', function () {
  const broken = CODE.replace("const all = Object.keys(stockOf(row) || {}).sort();", "const all = Object.keys(stockOf(row) || {});");
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B1') >= 0, 'B1 没红');
});
ok('N3 去掉名额守卫 => B7 红', function () {
  const broken = CODE.replace('if (!isFinite(n) || n < 1) return DEF.maxItems;', '');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B7') >= 0, 'B7 没红');
});
ok('N4 项目改回不截断（slice 换全集）=> B4 红', function () {
  const broken = CODE.replace('projAll.slice(0, PROJ_LINES)', 'projAll.slice(0, projAll.length)');
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B4') >= 0, 'B4 没红');
});
ok('N5 去掉「先攒再截断」的欠账截断 => B5 红', function () {
  const broken = CODE.replace("debtLines.push.apply(debtLines, debtAll.slice(0, DEBT_LINES));",
    "debtLines.push.apply(debtLines, debtAll);");
  assert(broken !== CODE, '破坏未命中');
  assert(problems(broken).indexOf('B5') >= 0, 'B5 没红');
});
console.log('');
if (fail) {
  console.log('ORG-BLOCK-QUOTA-V2576: FAIL ' + fail + ' / ' + (pass + fail));
  fails.forEach(function (f) { console.log('  - ' + f); });
  process.exit(1);
}
console.log('ORG-BLOCK-QUOTA-V2576: pass（' + pass + ' 项）');