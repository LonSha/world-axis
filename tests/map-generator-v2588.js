#!/usr/bin/env node
// WorldAxis tests/map-generator-v2588.js — MAP-4/5 底图生成器与地图页专锁（v2.588.0 / R264）
//
// 锁的是**「底图从素材里长出来」这件事**，不是某张具体的图。九组：
//
//   A 接线：两个新文件、页表三处（PAGES / PAGE_CAT / RENDERERS）、bindBody 的绑定 —— 缺一处就是
//     「有引擎、有渲染、没有入口」的老形态。
//   B 抽名：边界扫描真的能切干净（「有一条青石巷」不许抽出「一条青石巷」）—— 正反两向。
//   C 计划：plan 是纯函数（跑完文档逐字不动），且 ops 数与 counts 对得上。
//   D 确定性：同一份素材两次生成 ⇒ 指纹逐字相同（布局不许用 Math.random）。
//   E 预演：dryRun 不碰文档，且它算出的 ops 数 == 真生成落地数（同一份 plan）。
//   F 素材不足：空素材报 no-source、无地名报 no-place-names，且**文档不被清空**。
//   G 落地纪律：生成后 check() 零冲突、version 增量 == 落地数、revert 之后计数归零。
//   H 渲染缝合：传 doc ⇒ 五层节点在位；不传 ⇒ 一个底图节点都没有（加能力不改老输出）。
//   I 设置与页面：设置键幂等登记、bounds 覆盖画布；页面 render 出五个按钮、bind 无根如实拒。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

const TEXT = [
  '江城东区有一条青石巷，巷口是望江楼。',
  '过运河往南是南市坊，南市坊里有文昌阁和关帝庙。',
  '从江城东区沿长宁大道往西，能到西码头；西码头旁边是临江仓。'
];
const TEXTS = TEXT.map(function (t, i) { return { origin: 't' + i, text: t }; });
function has(list, name) {
  for (let i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
  return null;
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA && !!WA.mapGenerator, 'A0: WA.mapGenerator 在位（本锁必须跑在真产品上）');
  const ME = WA.mapEditor, MG = WA.mapGenerator;
  a(!!ME, 'A0b: WA.mapEditor 在位（生成器是它的调用方，不是替代品）');

  // ── A 接线 ───────────────────────────────────────────────────
  const panelSrc = fs.readFileSync(path.join(ROOT, 'ui/panel.js'), 'utf8');
  a(/const PAGE_CAT = \{[\s\S]*?\bmap: 'world'/.test(panelSrc), "A1: PAGE_CAT 登记 map: 'world'（页/分类双表闭合）");
  a(panelSrc.indexOf("{ id: 'map', icon:") >= 0, 'A2: PAGES 有地图页项（页 id 纯小写）');
  a(panelSrc.indexOf('map: renderMapDesk,') >= 0, 'A3: RENDERERS 成对挂载 renderMapDesk');
  a(panelSrc.indexOf("WA.panelMapPage && typeof WA.panelMapPage.bind === 'function'") >= 0,
    'A4: bindBody 真的去绑地图页的按钮（页模块只出 HTML，行为归面板）');
  a(fs.existsSync(path.join(ROOT, 'engines/map-generator.js')), 'A5: engines/map-generator.js 在位');
  a(fs.existsSync(path.join(ROOT, 'ui/pages/map-page.js')), 'A6: ui/pages/map-page.js 在位');

  // ── B 抽名（正反两向）────────────────────────────────────────
  const hv = MG.harvest(TEXTS);
  const names = hv.places.map(function (p) { return p.name; });
  a(!!has(hv.places, '青石巷'), 'B1: 抽出「青石巷」（实 ' + names.join('/') + '）');
  a(!!has(hv.places, '望江楼'), 'B1b: 抽出「望江楼」');
  a(!!has(hv.places, '南市坊'), 'B1c: 抽出「南市坊」');
  a(!!has(hv.places, '长宁大道'), 'B1d: 抽出「长宁大道」');
  a(!!has(hv.places, '西码头'), 'B1e: 抽出「西码头」');
  a(!!has(hv.places, '运河'), 'B2: 抽出「运河」（地形层）');
  a(!has(hv.places, '一条青石巷'), 'B3: 负控 —— 不许抽出「一条青石巷」（量词未被切掉就是边界扫描失效）');
  a(!has(hv.places, '口是望江楼'), 'B3b: 负控 —— 不许抽出「口是望江楼」');
  const kw = has(hv.places, '青石巷');
  a(kw && kw.kind === 'sub', 'B4: 「青石巷」落到街区层（实 ' + (kw && kw.kind) + '）');
  const lz = has(hv.places, '望江楼');
  a(lz && lz.kind === 'poi', 'B4b: 「望江楼」落到点层（实 ' + (lz && lz.kind) + '）');
  const dy = has(hv.places, '长宁大道');
  a(dy && dy.kind === 'road' && dy.type === 'arterial', 'B4c: 「长宁大道」是干道（实 ' + (dy && dy.type) + '）');
  a(hv.scanned === TEXT.join('').length, 'B5: 扫描字符数 = 素材长度（实 ' + hv.scanned + '）');
  a(hv.edges.length > 0, 'B6: 共现边非空（布局靠它把点挂到近的区，实 ' + hv.edges.length + ' 条）');

  // ── C 计划是纯函数 ───────────────────────────────────────────
  ME.newDoc(800, 600);
  const beforePlanJson = ME.exportJSON();
  const pl = MG.plan(hv, { width: 800, height: 600 });
  a(pl.ok === true, 'C1: plan 成功（ops ' + (pl.ops || []).length + '）');
  a(ME.exportJSON() === beforePlanJson, 'C2: plan 跑完文档逐字不变（它是纯函数，不是一次编辑）');
  const sum = pl.counts.terrains + pl.counts.regions + pl.counts.subs + pl.counts.roads + pl.counts.pois;
  a(pl.ops.length === sum, 'C3: ops 数 = 各层数量之和（' + pl.ops.length + ' / ' + sum + '）');
  a(pl.ops.every(function (o) { return ['addPoly', 'addRect', 'addRoad', 'addPoi'].indexOf(o.op) >= 0; }),
    'C4: 只产出编辑器认的四种 op（不发明新操作）');

  // ── D 确定性 ─────────────────────────────────────────────────
  const g1 = MG.generate({ texts: TEXT, mode: 'fresh', width: 1200, height: 900 });
  a(g1.ok === true && g1.appliedCount > 0, 'D1: 生成落地（' + g1.appliedCount + ' 条）');
  const g2 = MG.generate({ texts: TEXT, mode: 'fresh', width: 1200, height: 900 });
  a(g1.fingerprint === g2.fingerprint, 'D2: 同一份素材两次生成指纹逐字相同（' + g1.fingerprint + ' / ' + g2.fingerprint + '）');
  a(g1.rejectedCount === 0, 'D3: 零拒收（生成的几何必须都是编辑器认的，实 ' + g1.rejectedCount + '）');

  // ── E 预演不碰文档 ───────────────────────────────────────────
  const beforeDry = ME.exportJSON();
  const dry = MG.generate({ texts: TEXT, dryRun: true, width: 1200, height: 900 });
  a(dry.ok === true && dry.dryRun === true, 'E1: 预演成功');
  a(ME.exportJSON() === beforeDry, 'E2: 预演之后文档逐字不变（只读操作不是破坏性操作）');
  a(dry.ops.length === g1.appliedCount, 'E3: 预演 ops 数 = 真生成落地数（' + dry.ops.length + ' / ' + g1.appliedCount + '）');

  // ── F 素材不足要如实报，且不许清空别人的文档 ────────────────
  const keep = ME.exportJSON();
  const noSrc = MG.generate({ texts: [] });
  a(noSrc.ok === false && noSrc.reason === 'no-source', 'F1: 空素材 ⇒ no-source（实 ' + noSrc.reason + '）');
  const noName = MG.generate({ texts: ['这里面没有地名，只有天气和心情。'] });
  a(noName.ok === false && noName.reason === 'no-place-names',
    'F2: 抽不出地名 ⇒ no-place-names（实 ' + noName.reason + '）');
  a(!!noName.hint, 'F2b: 失败必须带「怎么补素材」的下一步（' + String(noName.hint).slice(0, 24) + '…）');
  a(ME.exportJSON() === keep, 'F3: 两次失败之后文档逐字不变（失败不污染）');

  // ── G 落地纪律 ───────────────────────────────────────────────
  const g3 = MG.generate({ texts: TEXT, mode: 'fresh', width: 1200, height: 900 });
  const verAfter = ME.doc().version;
  a(verAfter === g3.appliedCount + 1, 'G1: version 增量 = 落地数（' + (verAfter - 1) + ' / ' + g3.appliedCount + '）');
  const chk = ME.check();
  a(chk.ok === true, 'G2: 校验能跑');
  a((chk.violations || []).length === 0, 'G3: 生成出来的图零冲突（实 ' + (chk.violations || []).length + ' 处）');
  const rv = WA.mapGenerator.revert(g3);
  a(rv.ok === true && rv.removed === g3.appliedCount, 'G4: revert 逆序删回（' + rv.removed + ' / ' + g3.appliedCount + '）');
  const C0 = ME.counts();
  a(C0.terrains + C0.regions + C0.subs + C0.pois + C0.roads === 0, 'G5: revert 之后计数归零（整批可撤）');

  // ── H 渲染缝合 ───────────────────────────────────────────────
  const g4 = MG.generate({ texts: TEXT, mode: 'fresh', width: 1200, height: 900 });
  const doc = ME.doc();
  const svgYes = WA.mapViewport.renderSvgScene({ width: doc.width, height: doc.height, viewBox: '0 0 ' + doc.width + ' ' + doc.height, doc: doc });
  a(svgYes.indexOf('wa-map-region') >= 0, 'H1: 传 doc ⇒ 区层节点在位');
  a(svgYes.indexOf('wa-map-poi') >= 0, 'H1b: 传 doc ⇒ 点层节点在位');
  a(svgYes.indexOf('data-name="青石巷"') >= 0, 'H2: 名字进了 data-name（页面点选可直接用属性做事件委托）');
  const svgNo = WA.mapViewport.renderSvgScene({ width: 400, height: 300 });
  a(svgNo.indexOf('wa-map-region') < 0 && svgNo.indexOf('wa-map-terrain') < 0,
    'H3: 不传 doc ⇒ 一个底图节点都没有（加能力不改老输出）');
  a(g4.appliedCount === g3.appliedCount, 'H4: 同一份素材重生成几何条数不变（' + g4.appliedCount + '）');

  // ── I 设置与页面 ─────────────────────────────────────────────
  const regs = (WA.__settingsRegs || []).filter(function (r) { return r && r.key === 'worldaxis_map_generator_settings_v1'; });
  a(regs.length === 1, 'I1: 生成器设置键只登记一次（幂等，实 ' + regs.length + '）');
  a(!!regs[0] && !!regs[0].bounds && Array.isArray(regs[0].bounds.width) && Array.isArray(regs[0].bounds.height),
    'I1b: bounds 覆盖画布两轴（否则设置面只能瞎写）');

  // 页面体：在隔离沙箱里真求值（不污染产品全局，也不需要真 DOM）
  const box = { console: console, Date: Date, Math: Math, JSON: JSON, Number: Number, String: String, Array: Array, Object: Object, isFinite: isFinite };
  box.window = box;
  box.WorldAxis = { mapEditor: ME, mapGenerator: MG, mapViewport: WA.mapViewport, worldbook: WA.worldbook };
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'ui/pages/map-page.js'), 'utf8'), box, { filename: 'ui/pages/map-page.js' });
  verifyPage(box.WorldAxis, a);
  return { places: names.length, applied: g1.appliedCount, fingerprint: g1.fingerprint };
}
function verifyPage(WA, a) {
  const page = WA.panelMapPage;
  a(!!page && typeof page.render === 'function' && typeof page.bind === 'function', 'I2: 页面模块暴露 render + bind');
  const html = page.render();
  ['wa-map-gen', 'wa-map-scan', 'wa-map-plan', 'wa-map-check', 'wa-map-clear', 'wa-map-set', 'wa-map-export'].forEach(function (id, i) {
    a(html.indexOf('id="' + id + '"') >= 0, 'I3.' + (i + 1) + ': 渲染出 ' + id + ' 按钮');
  });
  a(html.indexOf('wa-map-canvas') >= 0, 'I4: 有画布容器');
  a(html.indexOf('世界书缓存') >= 0, 'I5: 页面报素材读数（世界书缓存条数），不是「看起来有图就行」');
  const b = page.bind(null);
  a(b.ok === false && b.reason === 'no-root', 'I6: bind 在没有根节点时如实拒绝（不许静默假装绑好）');
  const snap = WA.panelMapPage.snapshot();
  a(snap.hasEditor === true && snap.hasGenerator === true, 'I7: snapshot 报出两个依赖都在位');
}

module.exports = { runAll: runAll };
