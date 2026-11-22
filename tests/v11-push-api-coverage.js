#!/usr/bin/env node
// push-api 归属完整性锁（V11 EXV11-7 的正确口径）。
//
// 【本文件治一次误判】
//   前一轮把「运行时扫到 81 个推进类 API，登记表只有 21 条」当成 60 条未裁决缺口，
//   并把它印成面板红字。现场复算后这是**错的**：登记表的口径是「真零调用」，
//   有产品调用点的 API 本来就不该登记。60 条的真实归属是：
//     · l3Registry 已负责        5 条（L3 引擎由另一张表管，谁负责必须唯一）
//     · roundDrivers baseline    7 条（基线七台早就在轮次里跑）
//     · 有产品调用点            48 条（不是死面，不该进本表）
//     · 真零调用且未裁决         0 条
//   所以 EXV11-7 的「表与源码双向一致」在本版是成立的，缺口是我自己造出来的。
//
// 【判据】
//   C1 登记项全部在运行时存在（无幽灵条目）。
//   C2 真零调用且未裁决恰为 0 条；未登记项 == l3 ∪ baseline ∪ 有调用点。
//   C3 归口唯一：未登记项不得同时被 l3 与 baseline 认领。
//   C4 已裁决项不得有产品调用点（登记了却又被调用 = 裁决过期）。
//   C5 stat.total 与 ENTRIES 同源。
// 负面：N1 抹掉一条裁决 ⇒ 它落回「真零调用未裁决」⇒ C2 判红条件成立。
//       N2 给已裁决项补调用点 ⇒ C4 看见「裁决过期」（判据非恒真）。
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PRE = /^(tick|advance|sweep|due|settle|step|idle|drive|flush|reap|expire|pulse|turn|cycle|roll|rotate|refresh|progress|run)$/i;
const PROD_SKIP = ['tests/', 'tools/'];
function productSources() {
  const pf = require('./product-files.js');
  const out = {};
  pf.productFiles(BASE).forEach(function (f) {
    if (PROD_SKIP.some(function (p) { return f.indexOf(p) === 0; })) return;
    try { out[f] = fs.readFileSync(path.join(BASE, f), 'utf8'); } catch (e) {}
  });
  return out;
}
/**
 * 去掉注释与字符串字面量再找调用点。
 *   为什么必须去：实测两条「裁决过期」全是假阳性 ——
 *     · ui/panel.js 的 HTML 提示文字 `WorldAxis.clock.advance()`（给玩家看的说明）；
 *     · engines/bridge.js 的 `clockNow('bridge.refresh')`（时钟站点标签，不是调用）。
 *   把说明文字读成调用点，会让「裁决过期」这条判据天天误报，最后被当成噪音关掉。
 *   本函数**不是** JS 词法器，只处理本仓实际出现的三形态：行注释、块注释、单双引号/模板串。
 */
function stripLiterals(s) {
  let out = '';
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '/') { while (i < n && s[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue; }
        if (s[i] === q) { i++; break; }
        i++;
      }
      out += '""'; continue;
    }
    out += c; i++;
  }
  return out;
}
function scanRuntime(WA) {
  const found = [];
  Object.keys(WA).forEach(function (ns) {
    const o = WA[ns];
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(function (m) { if (PRE.test(m) && typeof o[m] === 'function') found.push(ns + '.' + m); });
  });
  return found;
}
function callSites(apis, srcs) {
  const out = {};
  // 每份源码仅做一次词法剥除；API 数量不应放大整库扫描成本。
  const stripped = {};
  Object.keys(srcs).forEach(function (f) { stripped[f] = stripLiterals(srcs[f]); });
  apis.forEach(function (api) {
    const p = api.split('.');
    const re = new RegExp('WA\\.' + p[0] + '\\.' + p[1] + '\\s*\\(|\\b' + p[0] + '\\.' + p[1] + '\\s*\\(');
    out[api] = Object.keys(srcs).filter(function (f) { return re.test(stripped[f]); });
  });
  return out;
}
function analyze(WA, srcs) {
  const R = WA.pushApiRegistry;
  const reg = R.ENTRIES.map(function (e) { return e.api; });
  const found = scanRuntime(WA);
  const l3 = WA.l3Registry ? WA.l3Registry.ENTRIES.map(function (e) { return e.engine; }) : [];
  const base = WA.roundDrivers.DRIVERS.filter(function (d) { return d.from === 'baseline'; })
    .map(function (d) { return d.engine; });
  const unreg = found.filter(function (k) { return reg.indexOf(k) < 0; });
  const siteOf = callSites(unreg.concat(reg), srcs);
  const byL3 = unreg.filter(function (k) { return l3.indexOf(k.split('.')[0]) >= 0; });
  const byBase = unreg.filter(function (k) { return base.indexOf(k.split('.')[0]) >= 0; });
  const both = unreg.filter(function (k) {
    return l3.indexOf(k.split('.')[0]) >= 0 && base.indexOf(k.split('.')[0]) >= 0;
  });
  const zeroCallUnreg = unreg.filter(function (k) {
    return siteOf[k].length === 0 && byL3.indexOf(k) < 0 && byBase.indexOf(k) < 0;
  });
  const staleReg = reg.filter(function (k) { return siteOf[k].length > 0; });
  const ghost = reg.filter(function (k) { return found.indexOf(k) < 0; });
  return { found: found, reg: reg, unreg: unreg, zeroCallUnreg: zeroCallUnreg,
    byL3: byL3, byBase: byBase, both: both, staleReg: staleReg, ghost: ghost };
}
function runAll(a) {
  const WA = gate.fresh().WA;
  const srcs = productSources();
  const r = analyze(WA, srcs);
  a(r.ghost.length === 0, 'coverage C1: 登记项全部在运行时存在（幽灵 ' + r.ghost.length + ' 条）');
  a(r.zeroCallUnreg.length === 0,
    'coverage C2: 真零调用且未裁决恰 0 条（实 ' + r.zeroCallUnreg.length + '）'
    + '｜未登记 ' + r.unreg.length + ' = l3 ' + r.byL3.length + ' + 基线 ' + r.byBase.length
    + ' + 有调用点 ' + (r.unreg.length - r.byL3.length - r.byBase.length));
  a(r.both.length === 0, 'coverage C3: 归口唯一（l3 与基线同时认领 ' + r.both.length + ' 条）');
  a(r.staleReg.length === 0,
    'coverage C4: 已裁决项无产品调用点（裁决过期 ' + r.staleReg.length + ' 条：' + r.staleReg.slice(0, 5).join(',') + '）');
  a(r.reg.length === WA.pushApiRegistry.stat().total, 'coverage C5: stat.total 与 ENTRIES 同源（' + r.reg.length + '）');
}
function runNegative(a) {
  const WA = gate.fresh().WA;
  const srcs = productSources();
  const drop = WA.pushApiRegistry.ENTRIES[0].api;
  const saved = WA.pushApiRegistry.ENTRIES.slice();
  WA.pushApiRegistry.ENTRIES.length = 0;
  saved.filter(function (e) { return e.api !== drop; })
    .forEach(function (e) { WA.pushApiRegistry.ENTRIES.push(e); });
  const r1 = analyze(WA, srcs);
  a(r1.zeroCallUnreg.indexOf(drop) >= 0,
    'coverage N1: 摘掉裁决（' + drop + '）⇒ 它落回真零调用未裁决，C2 判红条件成立');
  WA.pushApiRegistry.ENTRIES.length = 0;
  saved.forEach(function (e) { WA.pushApiRegistry.ENTRIES.push(e); });
  const target = saved[0].api.split('.');
  const fake = {};
  Object.keys(srcs).forEach(function (f) { fake[f] = srcs[f]; });
  fake['__fake_probe.js'] = 'WA.' + target[0] + '.' + target[1] + '();';
  const r2 = analyze(WA, fake);
  a(r2.staleReg.indexOf(saved[0].api) >= 0, 'coverage N2: 补调用点 ⇒ C4 看见「裁决过期」（判据非恒真）');
  // N3 字面量剥离两向自证：只出现在字符串/注释里的同名文本不得被读成调用点
  const fake2 = { '__probe_str.js': 'var s = "WA.' + target[0] + '.' + target[1] + '()"; // WA.' + target[0] + '.' + target[1] + '()' };
  const r3 = analyze(WA, fake2);
  a(r3.staleReg.indexOf(saved[0].api) < 0, 'coverage N3: 字符串/注释里的同名文本不算调用点（不误报）');
}
module.exports = { runAll, runNegative, analyze: analyze, productSources: productSources };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
  runAll(a); runNegative(a);
  console.log('v11-push-api-coverage: ' + pass + ' pass / ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}