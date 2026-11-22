#!/usr/bin/env node
// WorldAxis tests/opv30-r4-arc-guide-v2532.js — 引导弧：多拍引导的注入窗口与关键词登记
//
// 这件引擎的病根是「长线引导没有拍这个概念」：该退场的拍一直注入（引导变成永久提示，
// 由它决定节奏），该在场的拍没人注入（关键词没登记 ⇒ 世界书扫描踩不到）。
// 最容易的假绿是「按拍号比大小猜在场」：样本能过，代价是把还没开始的第一拍当成正在演
// —— 猜出来的在场比缺席更坏，它会悄悄改写叙事节奏。
// 所以本锁钉的是否定面：缺楼层不猜、没有起始楼层不猜、在首拍之前不猜、
// 出窗的拍绝不注入、关键词不重复登记、纯函数不改入参。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
function mkSandbox() {
  const win = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  const sb = {
    window: win, console: win.console,
    JSON: JSON, Math: Math, Object: Object, Array: Array, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite
  };
  win.WorldAxis = { registerModule: function (n, m) { (win.__regs = win.__regs || []).push({ rel: n, meta: m }); } };
  sb.WA = win.WorldAxis;
  return sb;
}
function loadFile(rel, srcOverride) {
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  try {
    vm.runInContext(srcOverride === undefined ? RD(rel) : srcOverride, ctx, { filename: rel });
  } catch (e) { return { wa: sb.WA, threw: String(e && e.message) }; }
  return { wa: sb.WA, regs: sb.window.__regs || [], threw: null };
}
function negCtl(rel, from, to, fn) {
  const src = RD(rel);
  if (src.indexOf(from) < 0) { a(false, '负控制锚点存在：' + from.slice(0, 40)); return; }
  fn(loadFile(rel, src.split(from).join(to)), rel);
}
const ENG = 'engines/arc-guide.js';
const m0 = loadFile(ENG);
const AG = m0.wa.arcGuide;
const THREE = [{ id: '主线', depth: 3, beats: [
  { no: 1, key: '旧信' }, { no: 2, key: '钥匙' }, { no: 3, key: '密室' }
].map(function (b, i) { return { no: b.no, key: b.key, at: [10, 12, 20][i] }; }) }];

console.log('\n── 装载与解析（坏形态不猜） ──');
{
  a(!!AG, 'A1 模块已挂载 WA.arcGuide');
  a(m0.regs.length === 1 && m0.regs[0].rel === ENG, 'A2 只注册一次且名对', m0.regs);
  a(m0.threw === null, 'A3 装载不抛', m0.threw);
  const b1 = AG.parseBeat({ no: 1, key: 'k' }, 0);
  a(b1.beat && b1.beat.no === 1 && b1.beat.at === null && b1.beat.text === '',
    'A4 缺 at 记为 null（不拿 0 顶替，也不拿「第一层」顶替）', b1.beat);
  a(AG.parseBeat({ no: 0, key: 'k' }, 0).fault.code === 'bad-no', 'A5 拍号 0 ⇒ bad-no');
  a(AG.parseBeat({ no: 1.5, key: 'k' }, 0).fault.code === 'bad-no', 'A6 非整数拍号 ⇒ bad-no');
  a(AG.parseBeat({ no: 1, key: '   ' }, 0).fault.code === 'bad-key', 'A7 空关键词 ⇒ bad-key');
  a(AG.parseBeat({ no: 1, key: new Array(60).join('x') }, 0).fault.code === 'bad-key', 'A8 超长关键词 ⇒ bad-key');
  a(AG.parseBeat({ no: 1, key: 'k', at: 'x' }, 0).fault.code === 'bad-at', 'A9 at 不是数 ⇒ bad-at');
  a(AG.parseBeat({ no: 1, key: 'k', at: -1 }, 0).fault.code === 'bad-at', 'A10 负楼层 ⇒ bad-at');
  a(AG.parseBeat('nope', 0).fault.code === 'bad-beat' && AG.parseBeat(null, 0).fault.code === 'bad-beat',
    'A11 非对象一拍 ⇒ bad-beat');
  const A1 = AG.parseArc({ id: 'x', beats: [{ no: 1, key: 'k' }] });
  a(A1 && A1.depth === 3, 'A12 没给 depth 用默认 3（读数里看得见，不是隐藏常量）', A1);
  a(AG.parseArc({ id: '', beats: [{ no: 1, key: 'k' }] }) === null, 'A13 空 id ⇒ null');
  a(AG.parseArc({ id: 'x', beats: [] }) === null, 'A14 没有拍 ⇒ null（空弧不装作「还没开始」）');
  a(AG.parseArc({ id: 'x', beats: [{ no: 1, key: 'a' }, { no: 1, key: 'b' }] }) === null,
    'A15 拍号重复 ⇒ 整弧 null（不合并、不覆盖）');
  a(AG.parseArc({ id: 'x', beats: [{ no: 1, key: 'a' }, { no: 2, key: '' }] }) === null,
    'A16 坏一拍 ⇒ 整弧拒（不做部分接收）');
  a(AG.parseArc({ id: 'x', depth: 0, beats: [{ no: 1, key: 'a' }] }) === null, 'A17 depth 0 ⇒ null');
  a(AG.parseArc({ id: 'x', depth: 21, beats: [{ no: 1, key: 'a' }] }) === null, 'A18 depth 超上限 ⇒ null');
  const sorted = AG.parseArc({ id: 'x', beats: [{ no: 3, key: 'c' }, { no: 1, key: 'a' }, { no: 2, key: 'b' }] });
  a(sorted.beats.map(function (b) { return b.no; }).join(',') === '1,2,3', 'A19 拍按拍号稳定排序（与入参顺序无关）');
}

console.log('\n── 注入窗口：出窗即退场，绝不猜在场 ──');
{
  const p1 = AG.plan(THREE, { floor: 12 });
  a(p1.rows[0].inject.join(',') === '1,2' && p1.floor === 12, 'B1 窗口内两拍都注入（10、12 都在 floor-3 之后）', p1.rows[0]);
  a(p1.rows[0].active === 2 && p1.rows[0].upcoming === 3, 'B2 active=最近起始的一拍，upcoming=下一拍', p1.rows[0]);
  const p2 = AG.plan(THREE, { floor: 15 });
  a(p2.rows[0].inject.length === 0 && p2.rows[0].expired === 2,
    'B3 floor15：lo=12，起始层 12 的拍**已出窗**（12 不 > 12），2 拍记 expired', p2.rows[0]);
  const p3 = AG.plan(THREE, { floor: 9 });
  a(p3.rows[0].why === 'before-first-beat' && p3.rows[0].active === null && p3.rows[0].inject.length === 0,
    'B4 首拍之前 ⇒ why 点名 + 零注入（不把第一拍当正在演）', p3.rows[0]);
  const p4 = AG.plan(THREE, { floor: 20 });
  a(p4.rows[0].inject.join(',') === '3' && p4.rows[0].expired === 2 && p4.rows[0].upcoming === null,
    'B5 floor20：只有第三拍在窗，前两拍计 expired', p4.rows[0]);
  const p5 = AG.plan(THREE, {});
  a(p5.floor === null && p5.rows[0].why === 'no-floor' && p5.rows[0].inject.length === 0,
    'B6 缺楼层 ⇒ no-floor + 零注入（缺证据不判在场）', p5.rows[0]);
  const p6 = AG.plan(THREE, { floor: 'x' });
  a(p6.rows[0].why === 'no-floor', 'B7 楼层不是数 ⇒ 同 no-floor（NaN 不往下走）', p6.rows[0].why);
  const noAt = [{ id: '哑', beats: [{ no: 1, key: 'k' }, { no: 2, key: 'j' }] }];
  a(AG.plan(noAt, { floor: 5 }).rows[0].why === 'no-beat-at', 'B8 一拍都没有起始层 ⇒ no-beat-at');
  const thin = [{ id: '薄', depth: 1, beats: [{ no: 1, key: 'a', at: 10 }, { no: 2, key: 'b', at: 12 }] }];
  const p7 = AG.plan(thin, { floor: 12 });
  a(p7.rows[0].inject.join(',') === '2' && p7.rows[0].expired === 1, 'B9 depth=1：只收紧邻那一层，前一拍出窗', p7.rows[0]);
  a(AG.plan(THREE, { floor: 12 }).injectCount === 2, 'B10 injectCount 是逐拍计数之和', AG.plan(THREE, { floor: 12 }).injectCount);
  const mixed = AG.plan([THREE[0], { id: '坏', beats: [] }], { floor: 12 });
  a(mixed.rows.length === 1 && mixed.rejected.length === 1, 'B11 坏弧只进 rejected，好弧照常出单', mixed.rejected);
  const two = AG.plan([THREE[0], { id: '副线', depth: 5, beats: [{ no: 1, key: 'z', at: 9 }] }], { floor: 12 });
  a(two.rows.length === 2 && two.rows[1].inject.join(',') === '1',
    'B12 两弧各自按自己的 depth 算窗（互不借用）', two.rows[1]);
  const p8 = AG.plan(THREE, { floor: 10 });
  a(p8.rows[0].inject.join(',') === '1' && p8.rows[0].upcoming === 2, 'B13 首拍刚起始那一层：只注入第一拍', p8.rows[0]);
}

console.log('\n── 关键词登记：去重、保序、给世界书扫描面 ──');
{
  const K1 = AG.keysOf(THREE);
  a(K1.keys.join(',') === '旧信,钥匙,密室', 'C1 关键词按「弧顺序 + 拍号」保序', K1.keys);
  const dup = [{ id: 'a', beats: [{ no: 1, key: '钥匙', at: 1 }] }, { id: 'b', beats: [{ no: 1, key: '钥匙', at: 5 }, { no: 2, key: '别处', at: 6 }] }];
  const K2 = AG.keysOf(dup);
  a(K2.keys.length === 2 && K2.rows[0].arc === 'a',
    'C2 同一关键词只登记一次，出处取首个（世界书扫描表不重复）', K2.rows);
  a(K2.rows.filter(function (r) { return r.key === '别处'; }).length === 1, 'C3 不同关键词各自一行');
  const K3 = AG.keysOf([{ id: 'a', beats: [{ no: 1, key: 'k' }] }, { id: 'b', beats: [] }]);
  a(K3.keys.join(',') === 'k' && K3.rejected.length === 1, 'C4 坏弧不贡献关键词（但进 rejected）');
  a(AG.keysOf([]).keys.length === 0 && AG.keysOf(null).keys.length === 0, 'C5 空输入回空表，不抛');
  a(AG.keysOf(THREE).rows[0].no === 1 && AG.keysOf(THREE).rows[0].arc === '主线', 'C6 每行带出处（弧 + 拍号）');
}

console.log('\n── 读数与纯函数 ──');
{
  const s = AG.stat(THREE);
  a(s.arcs === 1 && s.beats === 3 && s.keys === 3 && s.rejected === 0, 'D1 stat 三数齐报', s);
  const before = JSON.stringify(THREE);
  AG.plan(THREE, { floor: 12 }); AG.keysOf(THREE); AG.stat(THREE);
  a(JSON.stringify(THREE) === before, 'D2 三个函数都不改入参（拍被重新排序也只是副本）');
  const r1 = JSON.stringify(AG.plan(THREE, { floor: 12 }));
  const r2 = JSON.stringify(AG.plan(THREE, { floor: 12 }));
  a(r1 === r2, 'D3 同输入同输出（可复算）');
  a(JSON.stringify(AG.keysOf(THREE)) === JSON.stringify(AG.keysOf(THREE)), 'D4 登记表可复算（顺序不漂）');
  const src = RD(ENG);
  a(src.indexOf('WA.store') < 0 && src.indexOf('localStorage') < 0, 'D5 源码零 store / 零本地存储（纯函数不是口头承诺）');
  a(src.split('registerModule').length - 1 === 2, 'D6 尾调 registerModule 恰一处');
  a(AG.DEFAULTS.depth === 3 && AG.MAX_DEPTH === 20, 'D7 默认与上限作为只读读数导出');
}

console.log('\n── 负控制：拆掉判据，上面必须现形 ──');
negCtl(ENG, "      if (!hasFloor) { row.why = 'no-floor'; rows.push(row); return; }", "      if (false) { row.why = ''; rows.push(row); return; }", function (mm) {
  const r = mm.wa.arcGuide.plan(THREE, {});
  a(r.rows[0].why !== 'no-floor', 'E1 负控制：不拦缺楼层时 why 空（B6 不是空断言）', r.rows[0].why);
});
negCtl(ENG, '        if (b.at <= floorRaw && b.at > lo) row.inject.push(b.no);', '        if (b.at <= floorRaw) row.inject.push(b.no);', function (mm) {
  const r = mm.wa.arcGuide.plan(THREE, { floor: 15 });
  a(r.rows[0].inject.length === 2, 'E2 负控制：去掉下界后过期拍也会注入（B3 不是空断言）', r.rows[0].inject);
});
negCtl(ENG, '        if (seen[b.key]) return;', '        if (false) return;', function (mm) {
  const dup = [{ id: 'a', beats: [{ no: 1, key: '钥匙', at: 1 }] }, { id: 'b', beats: [{ no: 1, key: '钥匙', at: 5 }] }];
  const r = mm.wa.arcGuide.keysOf(dup);
  a(r.keys.length === 2, 'E3 负控制：不去重时同名词登记两遍（C2 不是空断言）', r.keys);
});
negCtl(ENG, "      if (row.active === null) row.why = 'before-first-beat';", "      if (false) row.why = 'before-first-beat';", function (mm) {
  const r = mm.wa.arcGuide.plan(THREE, { floor: 9 });
  a(r.rows[0].why === '', 'E4 负控制：不标 before-first-beat 时读数沉默（B4 不是空断言）', r.rows[0].why);
});
console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);