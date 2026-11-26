#!/usr/bin/env node
// WorldAxis tests/map-editor-v2587.js — MAP-3 地图编辑模型专锁（v2.587.0 / R263）
//
// 锁的是**编辑这件事**，不是那张江城市图。八组：
//
//   A 导入：吃编辑器原格式（terrains/main_regions/sub_regions/points_of_interest/roads 平铺）；
//     结构性错误整次拒收且文档逐字不变；信封 round-trip 指纹不变。
//   D 冲突检查：**纯函数**（跑完文档不动）；真数据上确实红 3 处（不是橡皮章）；
//     加一处违规 ⇒ 红 +1，undo ⇒ 回原数（两向）。
//   E 读面：at（点查询）/ locate（名字→坐标）/ span（跨水与途经区）；米必须显式定标，未定标报 null。
//   F 渲染缝合：不传 doc ⇒ 输出里**一个底图节点都没有**（默认关）；传了 ⇒ 五层都在；
//     加层不吞旧面（图钉与聚类仍在）；名字里的尖括号/引号必须转义。
//   B 编辑操作：每一笔都要有读数（顶点数、面积、moved/of），且几何恒等（旋转不改面积、×2 ⇒ ×4）。
//   C 纪律：拒收零污染（version 与 exportJSON 逐字不变）、undo 逐字回到编辑前、id 单调不复用。
//   G 落位缝合：底图在 ⇒ geo-tracker 缺坐标能补上；显式给的坐标不被覆盖；底图没有 ⇒ 照旧 0。
//   H 分层：底图是 data-only 示例资产（不是引擎里的第二份真源），导入时矛盾**报出来**不静默。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MAP_REL = 'data/jianghai-map.json';

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA && !!WA.mapEditor, 'A0: WA.mapEditor 在位（本锁必须跑在真产品上）');
  const ME = WA.mapEditor;

  // ── A 导入 ───────────────────────────────────────────────────
  const mapPath = path.join(ROOT, MAP_REL);
  a(fs.existsSync(mapPath), 'H1: 示例底图 ' + MAP_REL + ' 在位（data-only 资产，不是引擎常量）');
  const raw = fs.readFileSync(mapPath, 'utf8');
  const imp = ME.importJSON(raw);
  a(imp.ok === true, 'A1: 编辑器导出的原格式能直接导入（source=' + imp.source + '）');
  a(imp.source === 'editor', 'A1b: 认出来源是编辑器格式（不是本引擎信封）');
  const C = imp.counts || {};
  a(C.terrains === 3 && C.regions === 5, 'A2: 地形 3 / 主区 5（实 ' + C.terrains + '/' + C.regions + '）');
  a(C.subs === 231, 'A2b: 街区 231（实 ' + C.subs + '）');
  a(C.pois === 309, 'A2c: POI 309（实 ' + C.pois + '）');
  a(C.roads === 67, 'A2d: 道路 67（实 ' + C.roads + '）');
  a(C.vertices === 1641, 'A3: 几何顶点 1641（含道路折线；实 ' + C.vertices + '）');
  const fp0 = ME.fingerprint();
  a(fp0 === 'd027c26c',
    'A4: 文档指纹 = d027c26c（**数据换了必须显式改这一行** —— 指纹是底图的身份，实 ' + fp0 + '）');

  const beforeBad = ME.exportJSON();
  const schema2 = ME.importJSON({ format: 'worldaxis-map', schema: 2, width: 10, height: 10 });
  a(schema2.ok === false && schema2.reason === 'schema-too-new',
    'A5: 更高 schema 一律不接（实 ' + schema2.reason + '）');
  a(ME.exportJSON() === beforeBad, 'A5b: 拒收后文档逐字不变（失败不污染）');
  const badSize = ME.importJSON({ width: 0, height: 10 });
  a(badSize.ok === false && badSize.reason === 'bad-size', 'A6: 尺寸不合法拒收（实 ' + badSize.reason + '）');
  const badEnt = ME.importJSON({ width: 100, height: 100, roads: [{ name: 'x', points: [[0, 0]] }] });
  a(badEnt.ok === false && badEnt.reason === 'import-rejected-entities',
    'A7: 有实体坏掉 ⇒ 整次拒收（不许「坏的丢掉、好的收下」，实 ' + badEnt.reason + '）');
  a(ME.exportJSON() === beforeBad, 'A7b: 同上，文档逐字不变');

  const env = ME.exportJSON();
  const back = ME.importJSON(env);
  a(back.ok === true && back.fingerprint === fp0, 'A8: 信封 round-trip 指纹不变（导出→导入→同一个底图）');

  // ── D 冲突检查（纯函数 + 能红 + 两向）────────────────────────
  const cb = ME.exportJSON();
  const chk = ME.check();
  a(chk.ok === false && chk.count === 3, 'D1: 示例底图上有 3 处真冲突（不是橡皮章；实 ' + chk.count + '）');
  const bk = chk.byKind || {};
  a(bk['poly-self-intersect'] === 1, 'D2a: 澜江多边形自交（实 ' + (bk['poly-self-intersect'] || 0) + '）');
  a(bk['dup-name'] === 1, 'D2b: POI 重名 1 处（实 ' + (bk['dup-name'] || 0) + '）');
  a(bk['region-overlap'] === 1, 'D2c: 两个主区真重叠（贴边不算；实 ' + (bk['region-overlap'] || 0) + '）');
  a(ME.exportJSON() === cb, 'D3: check() 是纯函数 —— 跑完文档逐字不变');

  const wp = ME.apply({ op: 'addPoi', name: '__落水点', x: 60, y: 60 });
  a(wp.ok === true, 'D4a: 放过一个界外 POI（' + wp.id + '）');
  const chk2 = ME.check();
  // 界外点一次会踩两条：不在陆域 + 不在任何主区。**照实报两条**，不合并成一句「非法」。
  a(chk2.count === 5 && chk2.byKind['poi-on-water'] === 1 && chk2.byKind['poi-outside-region'] === 1,
    'D4b: 检查立刻红 +2（落水 1 + 越区 1；实 ' + chk2.count + '）');
  ME.undo();
  a(ME.check().count === 3, 'D4c: undo 之后回到 3 —— 两向才叫自证');

  const wp2 = ME.apply({ op: 'addPoi', name: '__越区点', x: 3000, y: 4000 });
  a(wp2.ok === true, 'D5a: 放过一个区内 POI（' + wp2.id + '）');
  const moved = ME.apply({ op: 'move', id: wp2.id, dx: 0, dy: 3000 });
  a(moved.ok === true && ME.check().count > 3,
    'D5b: 把它挪到底图外 ⇒ 立刻多报（实 ' + ME.check().count + ' 处）');
  ME.undo();
  ME.undo();
  a(ME.check().count === 3, 'D5c: 两次 undo 后仍回 3（编辑链可回退到底图原状）');

  // ── E 读面 ──────────────────────────────────────────────────
  const p1 = ME.at(3000, 4000);
  a(p1.ok === true && p1.inLand === true && p1.terrain.name === '江海市',
    'E1a: at(3000,4000) 命中陆域（实 ' + (p1.terrain && p1.terrain.name) + '）');
  a(!!p1.region && p1.region.name === '江湾区', 'E1b: 落在江湾区（实 ' + (p1.region && p1.region.name) + '）');
  a(!!p1.poi && p1.poi.dist < 80, 'E1c: 报出最近的 POI 与距离（' + (p1.poi && p1.poi.name) + ' / ' + (p1.poi && p1.poi.dist) + '）');
  a(!!p1.road && typeof p1.road.curbDist === 'number' && p1.road.curbDist <= p1.road.centerDist,
    'E1d: 报出最近道路与**路缘距**（curb ≤ center；实 ' + (p1.road && p1.road.curbDist) + ' ≤ ' + (p1.road && p1.road.centerDist) + '）');
  const p2 = ME.at(100, 100);
  a(p2.ok === true && p2.inLand === false && p2.terrain === null, 'E2: 界外点 inLand=false 且不瞎报地形');

  const lo = ME.locate('西城国际机场');
  a(lo.ok === true && lo.layer === 'subs' && typeof lo.x === 'number',
    'E3: locate 名字→坐标（' + lo.layer + ' / ' + Math.round(lo.x) + ',' + Math.round(lo.y) + '）');
  a(ME.locate('__这个名字不在图上__').ok === false, 'E4: 查不到就 not-found（不猜一个坐标出来）');

  const sp = ME.span('西城国际机场', '盐港集装箱码头');
  a(sp.ok === true && sp.units > 6000, 'E5a: span 报直线世界单位（实 ' + sp.units + '）');
  a(sp.needsCalibration === true && sp.meters === null, 'E5b: **未定标则米报 null**（不补 0，同 region.js 基准点口径）');
  a(sp.regions.length === 3, 'E5c: 途经 3 个主区（实 ' + sp.regions.join('/') + '）');
  const wasU = ME.getSettings().unitMeter;
  ME.setSettings({ unitMeter: 6.2 });
  const normU = ME.getSettings().unitMeter;
  a(normU === 6,
    'E6a: settingsBus 归一化把小数抹平（6.2 → ' + normU + '）—— **定标只能按整数米**，这是现场实测的已知口径');
  const sp2 = ME.span('西城国际机场', '盐港集装箱码头');
  a(sp2.meters !== null && Math.abs(sp2.meters - sp.units * 6) <= 6,
    'E6b: 定标 6 米/单位 ⇒ 米 = 单位×6（实 ' + sp2.meters + ' vs ' + Math.round(sp.units * 6) + '）');
  ME.setSettings({ unitMeter: wasU });
  a(ME.span('西城国际机场', '盐港集装箱码头').meters === null, 'E6c: 还原后米又回到 null（不是「量了一次就记住」）');
  const mpu = ME.metersPerUnit(60000);
  a(mpu.ok === true && mpu.unitMeter > 6.2 && mpu.unitMeter < 6.3,
    'E7: 定标反算：城宽 60km ⇒ 每单位 ≈ ' + mpu.unitMeter + ' 米（不写盘、不改设置）');

  // ── F 渲染缝合（默认关 / 传了就有 / 不吞旧面 / 转义）──────────
  const MV = WA.mapViewport;
  a(!!MV && typeof MV.renderSvgScene === 'function', 'F0: WA.mapViewport 在位');
  const plain = MV.renderSvgScene({ width: 800, height: 600, places: [{ name: '甲', x: 10, y: 20, kind: 'poi' }] });
  const cnt = function (s, re) { return (s.match(re) || []).length; };
  a(cnt(plain, /class="wa-map-(terrain|region|sub|road|poi)"/g) === 0,
    'F1: 不传 doc ⇒ 底图节点 0 个（默认关，既有输出面不变）');
  a(cnt(plain, /class="wa-map-pin"/g) === 1, 'F1b: 不传 doc 时图钉照旧画（旧面没被吞）');

  const withDoc = MV.renderSvgScene({ width: 800, height: 600, places: [{ name: '甲', x: 10, y: 20, kind: 'poi' }], doc: ME.doc() });
  const nowC = ME.counts();
  a(cnt(withDoc, /class="wa-map-terrain"/g) === nowC.terrains, 'F2a: 地形多边形数与文档一致（' + nowC.terrains + '）');
  a(cnt(withDoc, /class="wa-map-region"/g) === nowC.regions, 'F2b: 主区多边形数与文档一致（' + nowC.regions + '）');
  a(cnt(withDoc, /class="wa-map-sub"/g) === nowC.subs, 'F2c: 街区多边形数与文档一致（' + nowC.subs + '）');
  a(cnt(withDoc, /class="wa-map-road"/g) === nowC.roads, 'F2d: 道路折线与文档一致（' + nowC.roads + '）—— 头注释承诺过、实现此前 0 处');
  a(cnt(withDoc, /class="wa-map-poi"/g) === nowC.pois, 'F2e: POI 点数与文档一致（' + nowC.pois + '）');
  a(withDoc.indexOf('<svg') === 0 && withDoc.lastIndexOf('</svg>') === withDoc.length - 6,
    'F2f: 加层之后仍是合规的单个 svg 节点');
  a(cnt(withDoc, /class="wa-map-pin"/g) === 1, 'F3: 有底图时旧图钉仍在（加层不吞旧面）');

  const evil = ME.apply({ op: 'addPoi', name: '<b>"x"</b>', x: 3000, y: 4000 });
  a(evil.ok === true, 'F4a: 放一个名字带尖括号与引号的 POI');
  const withEvil = MV.renderSvgScene({ width: 800, height: 600, places: [], doc: ME.doc() });
  a(withEvil.indexOf('&lt;b&gt;') >= 0 && withEvil.indexOf('<b>') < 0,
    'F4b: 名字里的尖括号被转义（不许把数据当标记写进 SVG）');
  // 引号的期望值用码点拼：写死实体字面量会被文件层还原成原字符（本仓库现场踩过一次）。
  const Q = String.fromCharCode(38) + 'quot;';
  a(withEvil.indexOf(Q + 'x' + Q) >= 0, 'F4c: 引号也被转义（否则属性会被提前闭合）');
  ME.undo();

  // ── B 编辑操作（每笔都有读数）────────────────────────────────
  const r1 = ME.apply({ op: 'addRect', layer: 'subs', name: '__方块', type: 'block', x: 1000, y: 1000, w: 100, h: 50 });
  a(r1.ok === true && r1.vertices === 4 && r1.area === 5000,
    'B1: 拖框画街区 ⇒ 4 顶点 / 面积 5000（实 ' + r1.vertices + '/' + r1.area + '）');
  const r2 = ME.apply({ op: 'addPoly', layer: 'subs', name: '__三角', points: [[0, 0], [10, 0]] });
  a(r2.ok === false && r2.reason === 'need-3-points', 'B2: 两点画不出面（实 ' + r2.reason + '）');
  const r3 = ME.apply({ op: 'addRoad', name: '__路', points: [[2000, 2000], [2100, 2100]], width: 12, class: 'arterial' });
  a(r3.ok === true && r3.width === 12, 'B3a: 连点画道路（' + r3.id + '）');
  const r4 = ME.apply({ op: 'addRoad', name: '__坏路', points: [[0, 0]], width: 8 });
  a(r4.ok === false && r4.reason === 'need-2-points', 'B3b: 单点画不出路（实 ' + r4.reason + '）');
  const r5 = ME.apply({ op: 'addRoad', name: '__坏级', points: [[0, 0], [1, 1]], class: 'runway' });
  a(r5.ok === false && r5.reason === 'bad-class', 'B3c: 未知道路等级拒收（实 ' + r5.reason + '）');
  const r6 = ME.apply({ op: 'addPoi', name: '', x: 1, y: 2 });
  a(r6.ok === false && r6.reason === 'missing-name', 'B4: POI 缺名拒收（实 ' + r6.reason + '）');

  const r7 = ME.apply({ op: 'move', id: r1.id, dx: 30, dy: -20 });
  const e1 = ME.doc().layers.subs.filter(function (x) { return x.id === r1.id; })[0];
  a(r7.ok === true && e1.points[0][0] === 1030 && e1.points[0][1] === 980,
    'B5: 拖动本体整块平移（首顶点 1030,980）');
  const r8 = ME.apply({ op: 'setVertex', id: r1.id, index: 0, pt: [1000, 960] });
  a(r8.ok === true && ME.doc().layers.subs.filter(function (x) { return x.id === r1.id; })[0].points[0][0] === 1000,
    'B6a: 拖白点改形状（第 0 点已改）');
  a(ME.apply({ op: 'setVertex', id: r1.id, index: 9, pt: [0, 0] }).reason === 'bad-index', 'B6b: 越界下标拒收');
  const r9 = ME.apply({ op: 'insertVertex', id: r1.id, index: 1, pt: [1030, 1000] });
  a(r9.ok === true && r9.vertices === 5, 'B7a: 插一个顶点 ⇒ 5 个（实 ' + r9.vertices + '）');
  const r10 = ME.apply({ op: 'deleteVertex', id: r1.id, index: 1 });
  a(r10.ok === true && r10.vertices === 4, 'B7b: 删掉刚插的点 ⇒ 回 4 个（实 ' + r10.vertices + '）');

  const areaOf = function (pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; s += pts[i][0] * q[1] - q[0] * pts[i][1]; }
    return Math.abs(s) / 2;
  };
  const get = function (id) { return ME.doc().layers.subs.filter(function (x) { return x.id === id; })[0]; };
  const A0 = areaOf(get(r1.id).points);
  ME.apply({ op: 'rotate', id: r1.id, deg: 37 });
  const A1 = areaOf(get(r1.id).points);
  a(Math.abs(A1 - A0) < A0 * 0.01, 'B8: 旋转不改面积（' + Math.round(A0) + ' → ' + Math.round(A1) + '）');
  ME.apply({ op: 'scale', id: r1.id, factor: 2 });
  const A2 = areaOf(get(r1.id).points);
  a(Math.abs(A2 - A0 * 4) < A0 * 0.05, 'B9: ×2 缩放 ⇒ 面积 ×4（' + Math.round(A2) + ' ≈ ' + Math.round(A0 * 4) + '）');

  // 贴合道路：吸的是**路缘**（不是中心线）；贴塌必须拒
  const road1 = ME.doc().layers.roads.filter(function (r) { return r.name === '西城二街'; })[0];
  const pa = road1.points[1], pb = road1.points[2];
  const half = road1.width / 2;
  const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy);
  const nx = -dy / L, ny = dx / L;
  const off = function (p, d) { return [p[0] + nx * d, p[1] + ny * d]; };
  const curb = ME.apply({
    op: 'addPoly', layer: 'subs', name: '__临街', points: [off(pa, half + 1), off(pb, half + 1), off(pb, half + 31), off(pa, half + 31)]
  });
  a(curb.ok === true, 'B10a: 在路缘旁放一个临街地块');
  const snap = ME.apply({ op: 'snapToRoad', id: curb.id, maxDist: 6 });
  a(snap.ok === true && snap.moved === 2 && snap.of === 4,
    'B10b: 贴合只吸 6 单位内那 2 个顶点（实 ' + snap.moved + '/' + snap.of + '）');
  const A3 = areaOf(get(curb.id).points);
  a(A3 > areaOf([off(pa, half + 1), off(pb, half + 1), off(pb, half + 31), off(pa, half + 31)]) * 0.9,
    'B10c: 贴合前后面积基本不变（对齐路缘 = 平移，不是重画）');
  const big = ME.apply({ op: 'addRect', layer: 'subs', name: '__大块', type: 'block', x: 2983, y: 3765, w: 120, h: 90 });
  const snapBad = ME.apply({ op: 'snapToRoad', id: big.id, maxDist: 400 });
  a(snapBad.ok === false && snapBad.reason === 'degenerate',
    'B10d: 大块硬贴会把面贴塌 ⇒ 整笔拒收（实 ' + snapBad.reason + '）—— 不许「贴合」把地块弄丢');
  a(ME.check().count >= 3, 'B11: 加了一堆测试地块后检查仍跑得动（实 ' + ME.check().count + ' 处）');

  // ── C 纪律：零污染 / 撤销可核 / id 单调 ──────────────────────
  const snapBefore = ME.exportJSON();
  const verBefore = ME.doc().version;
  const bad = ME.apply({ op: '不存在的操作' });
  a(bad.ok === false && bad.reason === 'unknown-op', 'C1a: 未知操作拒收（实 ' + bad.reason + '）');
  a(ME.exportJSON() === snapBefore && ME.doc().version === verBefore,
    'C1b: 拒收后 exportJSON 逐字不变、version 不动（失败不污染）');
  const bad2 = ME.apply({ op: 'addRect', layer: 'subs', name: '__x', x: 0, y: 0, w: -5, h: 5 });
  a(bad2.ok === false && bad2.reason === 'bad-size', 'C2a: 负宽度拒收（实 ' + bad2.reason + '）');
  a(ME.exportJSON() === snapBefore, 'C2b: 同上，逐字不变');

  const r11 = ME.apply({ op: 'addPoi', name: '__撤销探针', x: 3000, y: 4000 });
  a(r11.ok === true, 'C3a: 做一笔可撤销的编辑');
  const afterEdit = ME.exportJSON();
  a(afterEdit !== snapBefore, 'C3b: 编辑之后确实变了（否则下面的「回到原状」没有意义）');
  ME.undo();
  a(ME.exportJSON() === snapBefore, 'C3c: undo 之后与编辑前**逐字相等** —— 不是「看起来回去了」');
  ME.redo();
  a(ME.exportJSON() === afterEdit, 'C4: redo 之后与编辑后逐字相等');
  ME.undo();

  const r12 = ME.apply({ op: 'addPoi', name: '__id探针', x: 1, y: 1 });
  const r13 = ME.apply({ op: 'addPoi', name: '__id探针2', x: 2, y: 2 });
  a(r12.id !== r13.id && r12.id !== r1.id && r13.id !== r1.id,
    'C5a: id 不重复（' + r12.id + ' / ' + r13.id + '）');
  ME.apply({ op: 'remove', id: r13.id });
  const r14 = ME.apply({ op: 'addPoi', name: '__id探针3', x: 3, y: 3 });
  a(r14.id !== r13.id, 'C5b: 删掉的 id 不被回收（' + r13.id + ' → 新 ' + r14.id + '）');
  const umax = ME.getSettings().maxUndo;
  ME.setSettings({ maxUndo: 0 });
  const r15 = ME.apply({ op: 'addPoi', name: '__环0', x: 5, y: 5 });
  a(r15.ok === true, 'C6a: maxUndo=0 仍允许编辑（上限管的是历史，不是编辑权）');
  a(ME.undo().reason === 'undo-empty', 'C6b: maxUndo=0 ⇒ 撤销环保持空（有界，不吃内存）');
  ME.setSettings({ maxUndo: umax });
  ME.apply({ op: 'addPoi', name: '__环回', x: 6, y: 6 });
  a(ME.undo().ok === true, 'C6c: 还原 maxUndo 后又可撤销');

  // ── G 落位缝合（geo-tracker 缺坐标时向底图要）────────────────
  const GT = WA.geoTracker;
  const ST = WA.store;
  a(!!GT && typeof GT.registerPlace === 'function', 'G0: WA.geoTracker 在位');
  a(!!ST && typeof ST.get === 'function' && typeof ST.transact === 'function', 'G0b: WA.store 在位');
  // 独立跑本锁时 store 可能还没 init（全量里 run.js 早 init 过，这里是一次幂等的兜底）。
  try { if (ST && typeof ST.init === 'function') ST.init(); } catch (e) { /* 起不来就让下面的判据自己报 */ }
  // 名字必须**图上真有**（G1 测的是「能补上坐标」；「查不到」是 G3 的判据）。
  const NM = '岩湖水库';
  const NM2 = '__map_editor_geo_probe2';
  const NM3 = '__map_editor_geo_probe_missing';
  try {
    const src = ME.locate(NM);
    GT.registerPlace({ name: NM, kind: 'poi' });
    const pn = function () { const s = ST.get() || {}; return (s.geoTracker && s.geoTracker.places) || {}; };
    const got = pn()[NM] || null;
    a(!!got && got.x === src.x && got.y === src.y,
      'G1: 底图在 + 不给坐标 ⇒ 落位自动取到底图坐标（' + (got && Math.round(got.x)) + ',' + (got && Math.round(got.y)) + '）');
    GT.registerPlace({ name: NM2, x: 12, y: 30, kind: 'poi' });
    const got2 = pn()[NM2] || null;
    a(!!got2 && got2.x === 12 && got2.y === 30, 'G2: 显式给的坐标不被底图覆盖（12,30）');
    GT.registerPlace({ name: NM3, kind: 'poi' });
    const got3 = pn()[NM3] || null;
    a(!!got3 && got3.x === 0 && got3.y === 0, 'G3: 图上查不到的名字 ⇒ 照旧 0（旧行为逐字不变）');
  } finally {
    try {
      ST.transact('tests/map-editor-v2587.cleanup', function (draft) {
        if (draft.geoTracker && draft.geoTracker.places) {
          delete draft.geoTracker.places[NM];
          delete draft.geoTracker.places[NM2];
          delete draft.geoTracker.places[NM3];
        }
      });
    } catch (e) { /* 清理失败不许掩盖真判据 */ }
  }

  // ── H 分层：矛盾要报，不能静默 ───────────────────────────────
  const re = ME.importJSON(raw);
  a(re.ok === true && re.violations === 3,
    'H2: 示例底图自带 3 处矛盾 —— 导入时**报出来**（advisories）而不是静默收下（实 ' + re.violations + '）');
  a(Array.isArray(re.advisories) && re.advisories.length === 3,
    'H2b: advisories 逐类给出（' + (re.advisories || []).map(function (x) { return x.kind + '×' + x.count; }).join(' / ') + '）');
  a(ME.fingerprint() === fp0, 'H3: 重新导入后指纹回到 d027c26c（底图没被编辑污染）');
  return { imported: imp.counts, violations: 3 };
}

module.exports = { runAll: runAll };