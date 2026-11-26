#!/usr/bin/env node
// WorldAxis tests/opv29-z1-05-v2529.js — V29 优化线 Z1（OPV29-05）专锁
//
// 治的病
//   计划原文：「34 页 / 1596 控件：首屏只渲染可见页」，验收「首屏可交互时间下降；切页无白屏」。
//   此前只有一个静态数（静态控件总数），**没有任何读数回答「打开面板那一瞬建了多少」**，
//   于是「只渲染可见页」永远只能是一句口号 —— 谁也不知道它现在是真做到还是被悄悄改坏了。
//
// 本锁钉住 tools/first-screen-budget.js 的冷开读数与 C 面裁定：
//   A 现场：50 页 / 1826 静态控件 / 冷开 44 控件 4231B（占静态 2%）/ 未 --measure 时 attributable=false。
//   B 负控制：judge() 纯裁定器喂假数字，八种糊弄逐个真红。
//   C 真跑：CLI --check rc=0；--json 里 attributable 必须是 false（静态面不许冒充首屏）。
//   D 真量：--measure 逐页量一次，页数/控件/首屏读数必须与现场一致。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  console.log('  ✗ ' + line); return false;
}
const FB = require('../tools/first-screen-budget.js');

// ── A. 现场 ───────────────────────────────────────────────
const cold = FB.coldBoot();
const stat = FB.check({ cold: cold });
a(stat.pages === 50, 'A1 页 50（实测 ' + stat.pages + '）', stat.pages);
a(stat.playerPages === 6, 'A2 玩家页 6（实测 ' + stat.playerPages + '）', stat.playerPages);
a(stat.controlsTotal === 1826, 'A3 静态控件 1826 处（v2.588.0 跟位：1809 → 1826 = 地图页 wa-map-* 控件 + 面板降级行）', stat.controlsTotal);
a(cold.ok === true && cold.controls === 44 && cold.bytes === 4231,
  'A4 冷开读数：' + cold.controls + ' 控件 / ' + cold.bytes + 'B（打开面板那一瞬）', cold);
a(stat.coldControls < stat.controlsTotal * 0.1,
  'A5 冷开只占静态总数 ' + Math.round(stat.coldControls / stat.controlsTotal * 100) + '%（不是「打开就全建」）');
a(stat.attributable === false && stat.note !== null,
  'A6 未 --measure 时 attributable=false 且带 note（静态面不许冒充首屏读数）', stat.note);
a(stat.verdict.ok === true, 'A7 现场裁定一致（冷开 42 ≤ 预算 1600 且 ≤ 静态半数）', stat.verdict.problems);

// ── B. 负控制（judge 纯裁定器喂假数字）──────────────────────
const st47 = { page: 'overview', bytes: 25195, controls: 46 };
const okMeasured = { ok: true, pages: new Array(34).fill(st47), totalControls: 1682 };
const J = FB.judge;

const b1 = J({ cold: { ok: true, controls: 0 }, controlsTotal: 1794 });
a(b1.ok === false && b1.problems.some(function (p) { return /C1/.test(p); }),
  'B1 冷开 0 控件（打开就空白）⇒ 红', b1.problems);

const b2 = J({ cold: { ok: true, controls: 2000 }, controlsTotal: 1794 });
a(b2.ok === false && b2.problems.some(function (p) { return /C2/.test(p); }),
  'B2 冷开 2000 > 预算 1600 ⇒ 红', b2.problems);

const b3 = J({ cold: { ok: true, controls: 1000 }, controlsTotal: 1794 });
a(b3.ok === false && b3.problems.some(function (p) { return /C3/.test(p); }),
  'B3 冷开 1000 > 静态半数 897（像「打开就全建」）⇒ 红', b3.problems);

const b4 = J({ cold: { ok: true, controls: 100 }, controlsTotal: 1794, measured: okMeasured, firstScreenControls: 46 });
a(b4.ok === false && b4.problems.some(function (p) { return /C4/.test(p); }),
  'B4 冷开 100 > 首屏 46×1.5=69（首屏之外也建了）⇒ 红', b4.problems);

const blankMeasured = { ok: true, pages: [{ page: 'x', bytes: 0, controls: 0 }].concat(new Array(33).fill(st47)), totalControls: 1682 };
const b5 = J({ cold: { ok: true, controls: 42 }, controlsTotal: 1794, measured: blankMeasured, firstScreenControls: 46 });
a(b5.ok === false && b5.problems.some(function (p) { return /白屏/.test(p); }),
  'B5 某页渲染 0 字节（白屏）⇒ 红', b5.problems);

const fewMeasured = { ok: true, pages: new Array(5).fill(st47), totalControls: 230 };
const b6 = J({ cold: { ok: true, controls: 42 }, controlsTotal: 1794, measured: fewMeasured, firstScreenControls: 46 });
a(b6.ok === false && b6.problems.some(function (p) { return /只量到/.test(p); }),
  'B6 只量到 5 页（<30）⇒ 红（不许「量了 5 页就说切页无白屏」）', b6.problems);

const b7 = J({ cold: { ok: false, why: 'no-gate' }, controlsTotal: 1794 });
a(b7.ok === false && b7.problems.some(function (p) { return /拿不到/.test(p); }),
  'B7 冷开读数拿不到 ⇒ 红（不许静默跳过）', b7.problems);

const b8 = J({ cold: { ok: true, controls: 42 }, controlsTotal: 1794, expectMeasured: true });
a(b8.ok === false && b8.problems.some(function (p) { return /C6/.test(p); }),
  'B8 要求逐页实测却没量到 ⇒ 红（C6）', b8.problems);

// ── C. 真跑 CLI ───────────────────────────────────────────
const cLive = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'first-screen-budget.js'), '--check'],
  { cwd: ROOT, encoding: 'utf8' });
a(cLive.status === 0, 'C1 现场 CLI --check ⇒ rc=0（实 ' + cLive.status + '）', cLive.status);
const cJson = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools', 'first-screen-budget.js'), '--json'],
  { cwd: ROOT, encoding: 'utf8' });
let jr = null;
try { jr = JSON.parse(String(cJson.stdout || '').split('■')[0].trim()); } catch (e) { jr = null; }
const jObj = (function () {
  const s = String(cJson.stdout || '');
  const i = s.indexOf('{');
  if (i < 0) return null;
  try { return JSON.parse(s.slice(i)); } catch (e) { return null; }
})();
a(jObj && jObj.check && jObj.check.attributable === false && jObj.check.note,
  'C2 --json 里 attributable=false（无 --measure 时不许报首屏数）', jObj && jObj.check && jObj.check.attributable);

// ── D. 真量一次（逐页）──────────────────────────────────────
const meas = FB.measure();
// v2.588.0（R264 / MAP-5）跟位：34 → 35（新增「地图」页）。
a(meas.ok === true && meas.pages.length === 35,
  'D1 逐页真量：' + meas.pages.length + ' 页量到（现场 35）', meas.pages.length);
// v2.588.0 跟位：1694 → 1704（地图页 10 个控件：生成/体检/预演/校验/清空/导出 6 个按钮
  //   + 画布宽/高 2 个输入 + 应用按钮 + 导出文本框）。**控件总数涨是被新增入口撑起来的，不是页变胖。**
  a(meas.totalControls === 1705, 'D2 逐页合计 1705 控件（实测 ' + meas.totalControls + '；v2.588.0 跟位：1694 → 1705 = 地图页 10 个 + 外貌词库开关 1 个）', meas.totalControls);
const rowOv = (meas.pages || []).filter(function (x) { return x.page === 'overview'; })[0];
a(rowOv && rowOv.controls === 46 && rowOv.bytes === 25230,   // v2.569.0 跟位：25206 → 25230B（overview 首屏多了那一个复选框及其标签）
  'D3 首屏 overview 实测 ' + (rowOv && rowOv.controls) + ' 控件 / ' + (rowOv && rowOv.bytes) + 'B', rowOv);
const full = FB.check({ cold: cold, measured: meas, expectMeasured: true });
a(full.verdict.ok === true,
  'D4 冷开 + 逐页合判一致（' + meas.pages.length + ' 页无白屏、冷开 ' + full.coldControls + ' ≤ 首屏 46×1.5）', full.verdict.problems);

// ── 汇总 ────────────────────────────────────────────────
if (fail) {
  console.log('OPV29-Z1-05-V2529: FAIL ' + fail + '/' + (pass + fail));
  process.exitCode = 1;
} else {
  console.log('OPV29-Z1-05-V2529: pass (' + pass + ')');
}