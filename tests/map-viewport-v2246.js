#!/usr/bin/env node
// WorldAxis tests/map-viewport-v2246.js (v2.246.0) — MAP-2：SVG 画布平滑飞行漫游、动态避让与同地聚类专锁
//
// ── 核心验证面 ────────────────────────────────────────────────
//   A 面：静态契约与接口导出（computeFlyInterpolation / clusterCharacters / declutterLabels / renderSvgScene / diagnose）
//   B 面：同地点多角色就近聚类与徽章聚合（阈值判定、质心计算、展开与 +N 折叠）
//   C 面：动态地标标签避让算法（宏观低倍自动避让次要标签，微观高倍完整展示）
//   D 面：三次方平滑飞行视口插值（起始到目标点关键帧平滑过渡，zoom/坐标自适应）
//   E 面：SVG 渲染管线纯函数装配（背景网格、地标图钉、角色聚类徽章及水印）
//   N 面：负控制破坏自证（非法坐标过滤、单角色不触发多余折叠、关闭配置时无侵入）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');

function runAll(a) {
  const env = sync.fresh();
  const WA = env.WA;

  a(!!WA.mapViewport, 'map-viewport/A1: 引擎 WA.mapViewport 成功装载');
  a(typeof WA.mapViewport.computeFlyInterpolation === 'function', 'map-viewport/A2: 导出 computeFlyInterpolation 方法');
  a(typeof WA.mapViewport.clusterCharacters === 'function', 'map-viewport/A3: 导出 clusterCharacters 方法');
  a(typeof WA.mapViewport.declutterLabels === 'function', 'map-viewport/A4: 导出 declutterLabels 方法');
  a(typeof WA.mapViewport.renderSvgScene === 'function', 'map-viewport/A5: 导出 renderSvgScene 方法');
  a(typeof WA.mapViewport.diagnose === 'function', 'map-viewport/A6: 导出 diagnose 方法');

  // ── B 面：同地点角色聚类与徽章聚合（General_Map 精华） ──
  const testChars = [
    { who: '陆捕头', x: 100, y: 100, rawPlace: '济世堂' },
    { who: '李掌柜', x: 104, y: 102, rawPlace: '济世堂后院' },
    { who: '小二', x: 106, y: 101, rawPlace: '济世堂茶摊' },
    { who: '路人甲', x: 102, y: 103, rawPlace: '济世堂门前' },
    { who: '远方侠客', x: 500, y: 500, rawPlace: '西市客栈' }
  ];

  const clusters = WA.mapViewport.clusterCharacters(testChars, 15, 3);
  a(clusters.length === 2, 'map-viewport/B1: 成功将 5 名角色聚类为 2 个簇（紧密 4 人 + 远方 1 人）');
  
  const mainCl = clusters.find(c => c.total === 4);
  a(!!mainCl, 'map-viewport/B2: 找到 4 人聚集的核心聚类簇');
  a(mainCl.displayMembers.length === 3, 'map-viewport/B3: 核心簇按上限展开前 3 名角色');
  a(mainCl.extraCount === 1, 'map-viewport/B4: 核心簇正确计算多出 1 人折叠（+1）');
  a(mainCl.hasOverflow === true, 'map-viewport/B5: 核心簇标记 hasOverflow: true');

  // ── C 面：地标与标签动态避让（declutterLabels） ──
  const densePlaces = [
    { name: '新宿站', kind: 'landmark', x: 100, y: 100 },
    { name: '新宿站前小摊', kind: 'poi', x: 105, y: 102 },
    { name: '新宿站东口公厕', kind: 'poi', x: 108, y: 101 },
    { name: '涩谷十字路口', kind: 'landmark', x: 400, y: 400 }
  ];

  // 宏观视角（低倍缩放 0.8x）：密集小设施标签被避让隐藏，核心地标保留
  const macroLabels = WA.mapViewport.declutterLabels(densePlaces, 0.8, 12);
  const macroShown = macroLabels.filter(p => p.showLabel);
  a(macroShown.length < densePlaces.length, 'map-viewport/C1: 低倍宏观缩放下成功避让重叠标签，隐藏次要设施');
  a(macroLabels.find(p => p.name === '新宿站').showLabel === true, 'map-viewport/C2: 核心地标新宿站标签被高优先级保留');

  // 微观视角（高倍缩放 2.5x）：所有设施标签完整展示
  const microLabels = WA.mapViewport.declutterLabels(densePlaces, 2.5, 12);
  const microShown = microLabels.filter(p => p.showLabel);
  a(microShown.length === densePlaces.length, 'map-viewport/C3: 高倍微观缩放下所有细节设施标签全部展开');

  // ── D 面：三次方缓动平滑飞行插值（computeFlyInterpolation） ──
  const fromV = { x: 0, y: 0, width: 800, height: 600, zoom: 1.0 };
  const targetV = { x: 200, y: 300, zoom: 2.0 };
  
  const frame0 = WA.mapViewport.computeFlyInterpolation(fromV, targetV, 0.0);
  a(frame0.x === 0 && frame0.y === 0 && frame0.zoom === 1.0, 'map-viewport/D1: 飞行插值起始帧 0% 状态完全吻合');
  
  const frame50 = WA.mapViewport.computeFlyInterpolation(fromV, targetV, 0.5);
  // easeOutCubic(0.5) = 1 - 0.125 = 0.875
  a(frame50.x === 175 && frame50.y === 262.5, 'map-viewport/D2: 飞行插值中间帧符合三次方减速缓动（先快后慢）');
  
  const frame100 = WA.mapViewport.computeFlyInterpolation(fromV, targetV, 1.0);
  a(frame100.x === 200 && frame100.y === 300 && frame100.zoom === 2.0, 'map-viewport/D3: 飞行插值终止帧 100% 精确停靠目标');

  // ── E 面：SVG 场景纯函数装配 ──
  const svg = WA.mapViewport.renderSvgScene({
    width: 800,
    height: 600,
    places: microLabels,
    clusters: clusters
  });
  a(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'map-viewport/E1: 成功生成合规包裹的 SVG 节点代码');
  a(svg.includes('wa-map-grid'), 'map-viewport/E2: SVG 场景包含背景空间网格定义');
  a(svg.includes('wa-map-cluster'), 'map-viewport/E3: SVG 场景正确渲染角色聚类徽章节点');
  a(svg.includes('+1'), 'map-viewport/E4: SVG 场景正确输出 +1 折叠气泡');

  // ── F 面：自检与诊断 ──
  const diag = WA.mapViewport.diagnose();
  a(diag.ok && diag.version === '2.246.0', 'map-viewport/F1: 诊断接口正常自检通过');
}

function runNegative(a) {
  const env = sync.fresh();
  const WA = env.WA;

  // 破坏测试 1：缺失或非法坐标的角色绝不进入聚类，直接安全过滤
  const dirtyChars = [
    { who: '幽灵甲', x: null, y: null },
    { who: '幽灵乙', x: undefined, y: NaN },
    { who: '真人', x: 50, y: 50 }
  ];
  const cl = WA.mapViewport.clusterCharacters(dirtyChars, 20, 3);
  a(cl.length === 1 && cl[0].total === 1 && cl[0].displayMembers[0].who === '真人', 'map-viewport/N1: 严格过滤非法/空坐标角色，不产生崩溃或脏簇');

  // 破坏测试 2：单一角色聚集时不触发额外 +0 折叠
  const singleChar = [{ who: '孤勇者', x: 10, y: 10 }];
  const singleCl = WA.mapViewport.clusterCharacters(singleChar, 20, 3);
  a(singleCl[0].extraCount === 0 && singleCl[0].hasOverflow === false, 'map-viewport/N2: 单角色簇 extraCount 严格为 0，不制造多余折叠');
}

module.exports = { runAll, runNegative };

if (require.main === module) {
  let passed = 0, failed = 0;
  function assert(cond, msg) {
    if (cond) { passed++; console.log('  ✓ ' + msg); }
    else { failed++; console.error('  ✗ ' + msg); }
  }
  console.log('--- runAll ---');
  runAll(assert);
  console.log('--- runNegative ---');
  runNegative(assert);
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}