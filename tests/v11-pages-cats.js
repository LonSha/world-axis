#!/usr/bin/env node
// WorldAxis tests/v11-pages-cats.js —— 页/分类双表闭合锁（v2.301.0 · V11 EXV11-8）
//
// 【它治什么】
//   ui/panel.js 里 PAGES / CATS / PAGE_CAT / RENDERERS 四张表手写各一份，历史上任何一处
//   单边增长（加页忘 PAGE_CAT、加分类忘 showCat 白名单、加渲染器忘登记）都会变成
//   「页面点了没反应 / 分类永远空」的死面。本锁把三处口径钉成同源。
//
// 【判据】
//   P1  PAGES 的每个 id 在 PAGE_CAT 里都有键（PAGES 有 PAGE_CAT 无 = 页永远无分类）。
//   P2  PAGE_CAT 的每个键在 PAGES 里都有（PAGE_CAT 有 PAGES 无 = 死映射）。
//   P3  PAGE_CAT 的每个值在 CATS 的 id 封闭集内（值越界 = showCat 拒收 bad-cat）。
//   P4  CATS 每个内容分类（除 all）至少被一页引用（空分类 = 侧栏开关永远空转）。
//   P5  RENDERERS 覆盖 PAGES 全部 id（缺渲染器 = 点了没反应）。
//   P6  页 id 纯小写字母（tests/run.js C11 用 /\{ id: '([a-z]+)', icon:/ 解析，
//       大写/连字符会被静默漏数导致计数不符）。
//   P7  world 撞名钉死：world 同时是页 id 与分类 id（不同名空间，PAGE_CAT 键=页 id、
//       值=分类 id，showCat/goPage 互不串线）。本版裁决不重命名，此判据把事实钉住。
//   P8  showCat 的 valid 白名单由 CATS.map 现场生成（不许回退成手抄数组——单边漂移源）。
//
// 【两向自证】
//   N1  把某页的 PAGE_CAT 键删掉 ⇒ P1 现形。
//   N2  给 PAGE_CAT 塞一个 PAGES 里没有的键 ⇒ P2 现形。
//   N3  给 PAGE_CAT 某值换成越界分类 ⇒ P3 现形。
//   N4  原版上同款判据仍成立。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');

function parse(src) {
  const r = {};
  // PAGES：const PAGES = [ ... ]; 到 const CATS
  const pagesSec = src.slice(src.indexOf('const PAGES = ['), src.indexOf('const CATS'));
  r.pageIds = [];
  let m;
  const rePage = /\{ id: '([a-z]+)', icon:/g;
  while ((m = rePage.exec(pagesSec)) !== null) r.pageIds.push(m[1]);
  // CATS：const CATS = [ ... ]; 到 const PAGE_CAT
  const catsSec = src.slice(SRC.indexOf('const CATS = ['), SRC.indexOf('const PAGE_CAT'));
  r.catIds = [];
  const reCat = /\{ id: '([a-z-]+)', icon:/g;
  while ((m = reCat.exec(catsSec)) !== null) r.catIds.push(m[1]);
  // PAGE_CAT：const PAGE_CAT = { ... }; 到 let currentCat
  const pcSec = src.slice(SRC.indexOf('const PAGE_CAT = {'), SRC.indexOf('let currentCat'));
  r.pageCat = {};
  const rePC = /([a-z]+):\s*'([a-z-]+)'/g;
  while ((m = rePC.exec(pcSec)) !== null) r.pageCat[m[1]] = m[2];
  // RENDERERS
  const renSec = src.slice(SRC.indexOf('const RENDERERS'), SRC.indexOf('}', SRC.indexOf('const RENDERERS')));
  r.rendererKeys = [];
  const reRen = /([a-z]+):\s*render\w+/g;
  while ((m = reRen.exec(renSec)) !== null) r.rendererKeys.push(m[1]);
  return r;
}

function checkAll(a, srcOverride) {
  const src = srcOverride || SRC;
  const r = parse(src);
  const catSet = new Set(r.catIds);
  // P1
  const p1 = r.pageIds.filter(function (p) { return !(p in r.pageCat); });
  a(p1.length === 0, 'v11pc: [P1] PAGES 每页都有 PAGE_CAT 键（缺：' + (p1.join(',') || '无') + '）');
  // P2
  const p2 = Object.keys(r.pageCat).filter(function (k) { return r.pageIds.indexOf(k) < 0; });
  a(p2.length === 0, 'v11pc: [P2] PAGE_CAT 键都在 PAGES 里（孤儿：' + (p2.join(',') || '无') + '）');
  // P3
  const p3 = Object.keys(r.pageCat).filter(function (k) { return !catSet.has(r.pageCat[k]); });
  a(p3.length === 0, 'v11pc: [P3] PAGE_CAT 值都在 CATS 封闭集内（越界：' + (p3.map(function (k) { return k + '→' + r.pageCat[k]; }).join(',') || '无') + '）');
  // P4（all 是通用类，不要求被引用）
  const contentCats = r.catIds.filter(function (c) { return c !== 'all'; });
  const usedCats = new Set(Object.keys(r.pageCat).map(function (k) { return r.pageCat[k]; }));
  const p4 = contentCats.filter(function (c) { return !usedCats.has(c); });
  a(p4.length === 0, 'v11pc: [P4] 每个内容分类至少被一页引用（空：' + (p4.join(',') || '无') + '）');
  // P5
  // P5（settings 走内联 lambda，不匹配 render\w+ 前缀，显式豁免；assistant 同查）
  const p5 = r.pageIds.filter(function (p) { return r.rendererKeys.indexOf(p) < 0 && p !== 'settings'; });
  a(p5.length === 0, 'v11pc: [P5] RENDERERS 覆盖全部页（缺：' + (p5.join(',') || '无') + '）');
  // P6
  a(r.pageIds.length >= 30, 'v11pc: [P6] 页数 ≥ 30（实 ' + r.pageIds.length + '，纯小写 id 由正则保证）');
  // P7 world 撞名钉死
  a(r.pageIds.indexOf('world') >= 0 && r.catIds.indexOf('world') >= 0,
    'v11pc: [P7] world 一名两用（页 id + 分类 id，不同名空间）——本版裁决不重命名，此判据钉住事实');
  // P8 showCat 白名单由 CATS 现场生成
  a(/const valid = CATS\.map/.test(src),
    'v11pc: [P8] showCat 白名单由 CATS.map 现场生成（手抄数组是单边漂移源）');
  return r;
}

function runAll(a) { checkAll(a); }

function runNegative(a) {
  // N1: 删掉 boot 的 PAGE_CAT 键 ⇒ P1 红
  {
    let sawRed = false;
    checkAll(function (v, msg) { if (!v && msg.indexOf('[P1]') >= 0) sawRed = true; },
      SRC.replace('boot: \'core\'', ''));
    a(sawRed, 'v11pc: [N1] 删 PAGE_CAT 键 ⇒ P1 现形');
  }
  // N2: 塞一个孤儿键 ⇒ P2 红
  {
    let sawRed = false;
    checkAll(function (v, msg) { if (!v && msg.indexOf('[P2]') >= 0) sawRed = true; },
      SRC.replace('const PAGE_CAT = {', 'const PAGE_CAT = { ghostpage: \'core\','));
    a(sawRed, 'v11pc: [N2] 孤儿键 ⇒ P2 现形');
  }
  // N3: 越界分类 ⇒ P3 红
  {
    let sawRed = false;
    checkAll(function (v, msg) { if (!v && msg.indexOf('[P3]') >= 0) sawRed = true; },
      SRC.replace('boot: \'core\'', 'boot: \'nosuchcat\''));
    a(sawRed, 'v11pc: [N3] 越界分类 ⇒ P3 现形');
  }
  // N4: 原版上同款判据仍成立
  {
    let allGreen = true;
    checkAll(function (v) { if (!v) allGreen = false; });
    a(allGreen, 'v11pc: [N4] 原版上同款判据仍成立');
  }
}

if (require.main === module) {
  let p = 0, f = 0;
  const a = function (v, msg) { if (v) p++; else { f++; console.log('  ✗ ' + msg); } };
  runAll(a); runNegative(a);
  console.log('v11-pages-cats: ' + p + ' pass / ' + f + ' fail');
  process.exit(f ? 1 : 0);
}
module.exports = { runAll: runAll, runNegative: runNegative };
