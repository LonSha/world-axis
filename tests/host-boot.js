// tests/host-boot.js — 纯引擎直跑测试的宿主引导（v2.380.0）
//
// 治的病（历史欠账消红实测，5 个文件）：
//   本仓有一批测试是**直接 require 引擎**、不经 ui-gate-sync/mock 的老形态
//   （tests/test-advanced-maps.js、tests/test-inventory-metabolism.js、
//    tests/scenario-v17/v19/v22-*.js）。它们独立跑会炸两类错：
//     · `ReferenceError: window is not defined`
//       —— 引擎头部是 `const WA = window.WorldAxis = window.WorldAxis || {};`，
//          直接 require 时没有宿主壳，产品代码本身没错，错的是「测试没搭台」。
//     · `TypeError: Cannot read properties of undefined (reading 'next')`
//       —— 引擎读 `WA.rand.next(...)`，而 core/rand.js 没被装载过（这些测试不装 LOAD）。
//
// 口径（**不复制产品逻辑、不造假桩**）：
//   ① 宿主壳交给 tests/mock.js（全仓唯一真源，与 ui-gate-sync 同一份）；
//   ② 随机源交给**真产品模块** core/rand.js（不是 mock 一个 next()），
//      这样「测试跑到的随机源」与「产品跑到的随机源」是同一个实现，覆盖率不虚化；
//   ③ 本模块只做这两个必需的装配动作，装配完就把 WA 交回去 —— 不做任何断言，
//      断言留在各自的测试文件里（判据与台子分家）。
'use strict';

/**
 * 引导宿主与随机源。幂等：重复调用不会重复装载（require 缓存 + 已装标记）。
 * @returns {object} 全局 WA（global.WorldAxis）
 */
function boot() {
  require('./mock.js');                       // localStorage / SillyTavern / WA.log 等宿主桩
  const WA = global.WorldAxis;
  // core/rand.js 的形态是 IIFE 自注册（`WA.rand = ...`），require 即装载。
  //   只在缺席时装 —— 若宿主已经装过（ui-gate-sync 路径），不覆盖它的实例
  //   （覆盖会把上一个用例已经推进的种子序列清零，变成「靠顺序活着」的另一种形态）。
  if (!WA.rand) require('../core/rand.js');
  return WA;
}

module.exports = { boot: boot };