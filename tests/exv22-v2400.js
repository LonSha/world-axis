'use strict';
/**
 * tests/exv22-v2400.js — EXV22-1～9 专锁（v2.400.0 · V22 第 4 批 + 第 5 批 EXV22-9）。
 *
 * ── 它治什么（缺口，先说现场）────────────────────────────────────────────
 *   第 4 批新增八个引擎（天文 / 驿传 / 徭役 / 丧葬 / 服饰 / 婚约 / 舆图 / 方言），
 *   加第 5 批的 EXV22-9「八项同屏」消费点。这一类改动的**典型假绿有四种**，全都不在
 *   「文件存在 + node --check 过」的读数里：
 *     ① 文件写出了、装载时抛错（IIFE 里一个 ReferenceError 就整段不执行）；
 *     ② 装载了、默认关闭时**不返回 disabled**（于是「出厂即关」这条约定被静默破坏）；
 *     ③ 默认关闭时返回 disabled，但**打开后算不出东西**（ok:true + 空读数 —— 最像样的一种）；
 *     ④ 打开了、算对了，但**顺手写了世界**（「只算不写」是本批八项的共同纪律）。
 *   还有第五种，只在 EXV22-9 上出现：
 *     ⑤ 消费点写了、渲染出来了，但它**顺手调用了有副作用的入口**（observeSky / levySeason
 *        之类）—— 概览页一打开就把世界推进一格，这是最坏的一种：它不会红，只会让
 *        存档在「看一眼」之后变得不一样。
 *
 * ── 本锁钉住六组 ────────────────────────────────────────────────────────
 *   A 装载面：八个文件在 LOAD 里、按声明的次序、装载后八个 ns 全在位、各注册一条设置面、
 *     各 registerModule 一次、版本串一致。
 *   B 默认关闭：17 个有副作用的入口**一律** `ok:false + reason:'disabled'`，且**世界逐字未变**。
 *   C 打开后真机制：八项各给「真读数」判据（不是 ok:true 就算过），且同输入可复算。
 *   D 拒收口径：八个引擎**只用 `disabled` 一个共享拒收码**，其余非法输入走 `ok:false + hint`
 *     —— 这条是本批的**决策**，不是巧合：新造 40 条码面要三面齐走，成本远超收益。
 *   E 零世界写：全部机制跑完后 store 逐字未变（「只算不写」）。
 *   F EXV22-9 消费点：v22OmensBlock 在概览页真渲染、只读零动作、缺席即缺席。
 *
 * ── N 负控制（每条都打在**真源码**上，try/finally + sha256 双兜）──────────
 *   N1 把某个引擎的 `enabled: false` 默认值改成 true ⇒ B 组必须现形（默认关闭被破坏）。
 *   N2 把某个引擎的 `if (!cfg.enabled)` 守卫删掉 ⇒ B 组必须现形（关闭时居然算得动）。
 *   N3 把 EXV22-9 的只读纪律破坏（在 v22OmensBlock 里加一行 `WA.levyCorvee.levySeason({})`）
 *      ⇒ F 组的「只读零动作」正则判据必须现形。
 *   N4 把 v22OmensBlock 的渲染调用从 panel.js 摘掉 ⇒ F 组的「真消费点」判据必须现形。
 *   四条都走真文件，且 finally 无条件还原 + 核对 sha256（还原失败即本锁自身失败）。
 *
 * ── 为什么不把「读面」判据写在这里 ──────────────────────────────────────
 *   「八个 ns 有没有真消费点」是 tests/module-cycle-gate.js 的读数面（读面 453 → 461、
 *   零读 ns 43 → 35）。本锁只断言「消费点存在且只读」，不复算读面 —— 复算就等于把
 *   同一件事在两处各实现一遍，而两处口径必然会漂（本仓治过多次）。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');

const BLOCKS_REL = 'ui/pages/overview-blocks.js';
const PANEL_REL = 'ui/panel.js';
const INDEX_REL = 'index.js';

/** 八个引擎：rel / ns / 有副作用的入口（默认关闭时全部必须 disabled） */
const ENGINES = [
  { rel: 'engines/celestial-omens.js', ns: 'celestialOmens', key: 'worldaxis_celestial_omens_settings_v1',
    entries: ['observeSky', 'settle'] },
  { rel: 'engines/postal-relay.js', ns: 'postalRelay', key: 'worldaxis_postal_relay_settings_v1',
    entries: ['buildRoute', 'dispatchByRelay'] },
  { rel: 'engines/levy-corvee.js', ns: 'levyCorvee', key: 'worldaxis_levy_corvee_settings_v1',
    entries: ['levySeason'] },
  { rel: 'engines/mortuary-rites.js', ns: 'mortuaryRites', key: 'worldaxis_mortuary_rites_settings_v1',
    entries: ['holdFuneral', 'checkProhibition'] },
  { rel: 'engines/sartorial-regalia.js', ns: 'sartorialRegalia', key: 'worldaxis_sartorial_regalia_settings_v1',
    entries: ['attireAs', 'identifyAtGate'] },
  { rel: 'engines/betrothal-alliance.js', ns: 'betrothalAlliance', key: 'worldaxis_betrothal_alliance_settings_v1',
    entries: ['proposeMatch', 'settle', 'breach'] },
  { rel: 'engines/cartography-survey.js', ns: 'cartographySurvey', key: 'worldaxis_cartography_survey_settings_v1',
    entries: ['chartRegion', 'resolveLandmark'] },
  { rel: 'engines/lingua-broker.js', ns: 'linguaBroker', key: 'worldaxis_lingua_broker_settings_v1',
    entries: ['converse'] }
];

const NS_ALL = ENGINES.map(function (e) { return e.ns; });
/** 有副作用入口总数（B 组逐条断言，17 条） */
const ENTRY_TOTAL = ENGINES.reduce(function (a, e) { return a + e.entries.length; }, 0);

function rd(rel) {
  // v2.401.0(OPV23):挂载行随 renderOverview 段体搬进 ui/pages/overview-main.js;
  //   panel.js 走重组面(锚点语义不变,OPV22-4 同款迁移)。
  if (rel === 'ui/panel.js') return require('./panel-source.js').panelSource();
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function sha(rel) { return crypto.createHash('sha256').update(rd(rel)).digest('hex'); }
/**
 * 剥掉注释与**字符串内容**，只留真代码面。
 *
 * 为什么要剥字符串（本轮真踩到）：段文件的 HTML 提示文本里写着
 *   `'开闸：<code>WorldAxis.bridge.setSettings({ enabled: true })</code>…'`
 * 那是**给用户看的说明**，不是调用。若不剥字符串，F2b「段文件不调 setSettings」
 * 会对着一句说明文字报红 —— 而假红与假绿同罪（本仓裁决：判据测的不是它声称的
 * 东西时，红灯同样不可信）。
 * 做法：注释整体丢弃；字符串/模板串的**内容**替换成空格（引号本身保留，位置守恒）。
 */
function codeOnly(src) {
  let out = '';
  let i = 0, n = src.length, st = 'code';
  const sp = function (s) { return s.replace(/[^\n]/g, ' '); };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (st === 'code') {
      if (c === '/' && d === '/') { st = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { st = 'block'; i += 2; continue; }
      if (c === "'") { st = 'sq'; out += c; i++; continue; }
      if (c === '"') { st = 'dq'; out += c; i++; continue; }
      if (c === '`') { st = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (st === 'line') { if (c === '\n') { st = 'code'; out += c; } i++; continue; }
    if (st === 'block') { if (c === '*' && d === '/') { st = 'code'; i += 2; continue; } i++; continue; }
    if (st === 'sq') {
      if (c === '\\') { out += sp(c + (d || '')); i += 2; continue; }
      if (c === "'") { st = 'code'; out += c; i++; continue; }
      out += sp(c); i++; continue;
    }
    if (st === 'dq') {
      if (c === '\\') { out += sp(c + (d || '')); i += 2; continue; }
      if (c === '"') { st = 'code'; out += c; i++; continue; }
      out += sp(c); i++; continue;
    }
    if (st === 'tpl') {
      if (c === '\\') { out += sp(c + (d || '')); i += 2; continue; }
      if (c === '`') { st = 'code'; out += c; i++; continue; }
      out += sp(c); i++; continue;
    }
  }
  return out;
}
function stripComments(src) {
  // 只用于「源码面正则」判据（避免说明注释满足判据）。与 tests/inventory.js 的 codeFace
  // 不是同一实现：这里只需要「去注释」，不需要模板串内的表达式保留，故保持最小实现。
  let out = '';
  let i = 0, n = src.length, st = 'code';
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (st === 'code') {
      if (c === '/' && d === '/') { st = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { st = 'block'; i += 2; continue; }
      if (c === "'") { st = 'sq'; out += c; i++; continue; }
      if (c === '"') { st = 'dq'; out += c; i++; continue; }
      if (c === '`') { st = 'tpl'; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (st === 'line') { if (c === '\n') { st = 'code'; out += c; } i++; continue; }
    if (st === 'block') { if (c === '*' && d === '/') { st = 'code'; i += 2; continue; } i++; continue; }
    if (st === 'sq') { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === "'") st = 'code'; out += c; i++; continue; }
    if (st === 'dq') { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === '"') st = 'code'; out += c; i++; continue; }
    if (st === 'tpl') { if (c === '\\') { out += c + (d || ''); i += 2; continue; } if (c === '`') st = 'code'; out += c; i++; continue; }
  }
  return out;
}

/**
 * 最小真实宿主 —— 与产品同形（settingsBus.read/write/normalize + store.transact + rand + clock
 * + registerModule）。为什么不 require tests/mock.js：本锁要的是**八个引擎的装载期行为**，
 * 而不是整个 ui 层的装载；用一个显式的小宿主，「哪些能力被提供」这件事就在本文件里可读。
 *
 * ⚠ 踩过的坑（写在注释里，因为它和引擎缺陷长得一模一样）：
 *   `WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG])` 是**整体重新赋值**，
 *   引擎拿到的是新数组。若在装载前持一个 `const regs = WA.__settingsRegs` 的引用，
 *   那个引用永远指向最初那个空数组 —— 「实 0」不是引擎没注册，是读错了地方。
 *   故下面一律用 regCount() **现读**。
 */
function makeHost() {
  const storeData = { world: { places: [], people: {}, chronicle: [] } };
  const busMap = {};
  const WA = {
    __settingsRegs: [],
    settingsBus: {
      read: function (reg) { return busMap[reg.key] || null; },
      //   ⚠ 宿主只能提供产品**真有**的写口（v2.400.0 修）。
      //   实务现场：本行初版写的是 `write: function (reg, v) { busMap[reg.key] = v; ... }`，
      //   而产品 `core/settings-bus.js` 的导出面**根本没有 write**（真写口叫 save / saveOrThrow）。
      //   于是八个引擎里写的 `WA.settingsBus.write(...)` 在真产品上恒抛 TypeError，
      //   而本宿主把它接住了 —— B4/B5 于是在**假写面**上绿了五轮。
      //   这是本仓反复点名的那条：「测试里自塞了桩就测得过」。
      //   现在只提供真写口，且语义与真源一致（写不进去就抛，不返回 false 了事）；
      //    B4b 另有一条判据钉「宿主键集 ⊆ 产品导出面」，防同型再犯。
      saveOrThrow: function (reg, v) { busMap[reg.key] = v; return true; },
      normalize: function (reg, raw) {
        const out = {};
        const d = reg.def || {};
        Object.keys(d).forEach(function (k) {
          const v = raw ? raw[k] : undefined;
          out[k] = (v === undefined || v === null) ? d[k] : v;
        });
        return out;
      }
    },
    store: { transact: function (fn) { return fn(storeData); } },
    rand: { next: function () { return 0.5; } },
    clock: { now: function () { return 1700000000000; } },
    registerModule: function (rel, meta) {
      (WA.__mods = WA.__mods || []).push({ rel: rel, meta: meta });
      return true;
    }
  };
  const sandbox = { window: { WorldAxis: WA }, console: { log: function () {} } };
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);
  return {
    WA: WA,
    ctx: ctx,
    busMap: busMap,
    storeData: storeData,
    regCount: function () { return (WA.__settingsRegs || []).length; },
    snapshot: function () { return JSON.stringify(storeData); },
    load: function (rel) {
      vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
    }
  };
}

module.exports = { runAll: runAll };

// ══════════════════════════════════════════════════════════════════════════
// A 装载面
// ══════════════════════════════════════════════════════════════════════════
function runA(T, S) {
  S('A 装载面：八个引擎在装载清单里、装载后八个 ns 全在位');
  // ── A1 装载清单 ──
  //   为什么从 index.js 取而不从 tests/run.js 取：八个引擎是**产品装载**（index.js 的
  //   LOAD_ORDER 是「必须先有谁」的唯一真源），而 tests/run.js 的 LOAD 是**无头测试面**
  //   （刻意不含 ui/*）。判据该问的是「产品会不会装载它」，故读 index.js。
  const idx = stripComments(rd(INDEX_REL));
  const missing = ENGINES.filter(function (e) { return idx.indexOf("'" + e.rel + "'") < 0; });
  T(missing.length === 0, 'A1a 八个引擎都登记在 index.js 的装载清单里（缺 ' + missing.length
    + '：' + missing.map(function (e) { return e.rel; }).join(',') + '）');
  //   顺序：八条必须**全部**排在 `ui/panel.js` 之前。
  //   为什么这条要单独判：EXV22-9 的消费点在 ui/pages/overview-blocks.js，而它在
  //   ui/panel.js **之后**装载。若八个引擎排在 panel.js 之后，则概览页首次渲染时
  //   八个 ns 还不在场 —— 面板会显示「未装载」，而重开一次就好了。这种「刷新一下
  //   就正常」的缺陷在判据里最容易蒙混过去，故按次序判死。
  const panelAt = idx.indexOf("'ui/panel.js'");
  T(panelAt > 0, 'A1b index.js 里能找到 ui/panel.js 装载点（否则次序判据无从谈起）');
  const after = ENGINES.filter(function (e) {
    const at = idx.indexOf("'" + e.rel + "'");
    return at > 0 && at > panelAt;
  });
  T(after.length === 0, 'A1c 八个引擎都排在 ui/panel.js 之前（排在后面的 ' + after.length
    + ' 个：' + after.map(function (e) { return e.rel; }).join(',') + '）—— 否则首屏会显示「未装载」');
  //   八条之间的相对次序：本批声明「八项之间互不依赖，排列只要在 panel.js 之前」，
  //   故这里只判「彼此不重复登记」，不判相对次序（判了就是给未来加无意义的约束）。
  const dup = ENGINES.filter(function (e) { return idx.split("'" + e.rel + "'").length - 1 !== 1; });
  T(dup.length === 0, 'A1d 八条各登记恰 1 次（不重复 ' + dup.length + '）');

  // ── A2 装载后八个 ns 全在位 ──
  const h = makeHost();
  const loadErr = [];
  ENGINES.forEach(function (e) {
    try { h.load(e.rel); } catch (err) { loadErr.push(e.rel + '：' + (err && err.message)); }
  });
  T(loadErr.length === 0, 'A2a 八个引擎全部装载成功、零抛错（抛错 ' + loadErr.length + '）'
    + (loadErr.length ? ' — ' + loadErr.join(' / ') : ''));
  const noNs = NS_ALL.filter(function (ns) { return !h.WA[ns] || typeof h.WA[ns] !== 'object'; });
  T(noNs.length === 0, 'A2b 装载后八个 ns 全在位（缺 ' + noNs.length + '：' + noNs.join(',') + '）');
  //   导出面：每个 ns 必须有 view / setSettings / getSettings / reset 四个基础口。
  //   为什么这四条是硬判据：EXV22-9 的消费点只调 view()；面板/设置页只调
  //   setSettings/getSettings；reset 是测试隔离的前提。缺任一条都会让某一处静默失效。
  const BASE_API = ['view', 'setSettings', 'getSettings', 'reset'];
  const apiMiss = [];
  ENGINES.forEach(function (e) {
    BASE_API.forEach(function (k) {
      if (typeof (h.WA[e.ns] || {})[k] !== 'function') apiMiss.push(e.ns + '.' + k);
    });
  });
  T(apiMiss.length === 0, 'A2c 每个 ns 都有 view/setSettings/getSettings/reset 四口（缺 '
    + apiMiss.length + '：' + apiMiss.slice(0, 6).join(',') + '）');
  //   有副作用入口：ENGINES 表里声明的每一条必须真是函数。
  const entryMiss = [];
  ENGINES.forEach(function (e) {
    e.entries.forEach(function (k) {
      if (typeof (h.WA[e.ns] || {})[k] !== 'function') entryMiss.push(e.ns + '.' + k);
    });
  });
  T(entryMiss.length === 0, 'A2d 15 个有副作用入口全部是函数（缺 ' + entryMiss.length + '：'
    + entryMiss.join(',') + '）');
  //   入口总数：15 是实测（2+2+1+2+2+3+2+1）。
  //   ⚠ 初版这里写的是 17（凭印象把某两个引擎的入口数记多了）。这不是「基线对齐」，
  //     是我自己数错了 —— 判据当场红并报「实 15」，正是它该有的行为。改成 15 并保留
  //     这条说明：下次有人加一个入口，这条会红，提醒他把 B 组的覆盖面同步扩上。
  T(ENTRY_TOTAL === 15, 'A2e 入口总数口径 = 15（实 ' + ENTRY_TOTAL + '；这条钉住 B 组的覆盖面不被悄悄缩小）');

  // ── A3 设置面与模块登记 ──
  T(h.regCount() === 8, 'A3a 八个引擎各注册一条设置面（实 ' + h.regCount() + '）');
  const mods = h.WA.__mods || [];
  T(mods.length === 8, 'A3b 八个引擎各 registerModule 一次（实 ' + mods.length + '）');
  const wrongKind = mods.filter(function (m) { return !m.meta || m.meta.kind !== 'engine'; });
  T(wrongKind.length === 0, 'A3c 八条登记的 kind 都是 engine（错 ' + wrongKind.length + '）');
  const wrongVer = mods.filter(function (m) { return !m.meta || m.meta.ver !== '2.400.0'; });
  T(wrongVer.length === 0, 'A3d 八条登记的 ver 都是 2.400.0（错 ' + wrongVer.length + '）');
  //   设置键名：ENGINES 表里的 key 必须与源码里的 LS_KEY 逐字一致。
  //   为什么判这条：键名是**存档兼容面**。写错一个字符 ⇒ 旧存档里的开关读不出来，
  //   表现是「用户明明开过，升级后又变回关闭」—— 这种缺陷没有红灯，只有用户抱怨。
  const keyWrong = ENGINES.filter(function (e) {
    const src = rd(e.rel);
    return src.indexOf("'" + e.key + "'") < 0;
  });
  T(keyWrong.length === 0, 'A3e 八个设置键名与源码逐字一致（错 ' + keyWrong.length + '：'
    + keyWrong.map(function (e) { return e.ns; }).join(',') + '）');
  //   默认关闭：八个 DEF 里 enabled 必须都是 false（B 组测行为，这里测声明）。
  const notDefaultOff = ENGINES.filter(function (e) {
    const src = rd(e.rel);
    return !/const DEF = \{[\s\S]{0,200}?enabled:\s*false/.test(src);
  });
  T(notDefaultOff.length === 0, 'A3f 八个 DEF 声明里 enabled 默认都是 false（违 '
    + notDefaultOff.length + '：' + notDefaultOff.map(function (e) { return e.ns; }).join(',') + '）');
  //   零 store 写：源码面不得出现 `store.transact` / `.world =` / `draft` 赋值。
  //   ⚠ 这条是**静态**判据，E 组是**运行时**判据 —— 两条都要有：
  //     静态逮「写了但当前测试路径没走到」，运行时逮「静态看不出的间接写」。
  const storeWrite = [];
  ENGINES.forEach(function (e) {
    const code = stripComments(rd(e.rel));
    if (/store\s*\.\s*transact/.test(code)) storeWrite.push(e.ns + ':transact');
    if (/\.\s*world\s*\.\s*\w+\s*=/.test(code)) storeWrite.push(e.ns + ':world-write');
  });
  T(storeWrite.length === 0, 'A3g 八个引擎源码面零 store 写（命中 ' + storeWrite.length + '：'
    + storeWrite.join(',') + '）—— 只算不写是本批共同纪律');
}

// ══════════════════════════════════════════════════════════════════════════
// B 默认关闭：17 个入口一律 disabled，且世界逐字未变
// ══════════════════════════════════════════════════════════════════════════
function runB(T, S) {
  S('B 默认关闭：17 个有副作用入口一律 disabled，且零世界写');
  const h = makeHost();
  ENGINES.forEach(function (e) { h.load(e.rel); });
  const before = h.snapshot();
  const notDisabled = [];
  ENGINES.forEach(function (e) {
    e.entries.forEach(function (k) {
      let r;
      try { r = h.WA[e.ns][k]({}); } catch (err) { r = { __threw: err && err.message }; }
      if (!r || r.ok !== false || r.reason !== 'disabled') {
        notDisabled.push(e.ns + '.' + k + ' → ' + JSON.stringify(r));
      }
    });
  });
  T(notDisabled.length === 0, 'B1 关闭时 17 个入口全部 ok:false + reason:disabled（违 '
    + notDisabled.length + '）' + (notDisabled.length ? ' — ' + notDisabled.slice(0, 4).join(' / ') : ''));
  T(h.snapshot() === before, 'B2 关闭时零世界写（store 逐字未变）');
  //   关闭时**不掷骰子**：同输入两次结果逐字相同（若关闭路径里还有随机，说明它先掷后判）。
  const twice = [];
  ENGINES.forEach(function (e) {
    e.entries.forEach(function (k) {
      const a = JSON.stringify(h.WA[e.ns][k]({}));
      const b = JSON.stringify(h.WA[e.ns][k]({}));
      if (a !== b) twice.push(e.ns + '.' + k);
    });
  });
  T(twice.length === 0, 'B3 关闭时两次调用结果逐字相同（不稳定 ' + twice.length + '：' + twice.join(',') + '）'
    + ' —— 关闭路径里不该有随机');
  //   关闭时 setSettings 仍可写（否则用户没法打开它 —— 这是「出厂即关」能成立的前提）。
  const h2 = makeHost();
  ENGINES.forEach(function (e) { h2.load(e.rel); });
  const cantOpen = ENGINES.filter(function (e) {
    const r = h2.WA[e.ns].setSettings({ enabled: true });
    return !(r && r.ok === true);
  });
  T(cantOpen.length === 0, 'B4 关闭状态下 setSettings({enabled:true}) 能成功（失败 '
    + cantOpen.length + '：' + cantOpen.map(function (e) { return e.ns; }).join(',') + '）'
    + ' —— 否则用户无法打开，出厂即关就变成永久关闭');
  const stillOff = ENGINES.filter(function (e) { return h2.WA[e.ns].getSettings().enabled !== true; });
  T(stillOff.length === 0, 'B5 打开后 getSettings().enabled 真为 true（未生效 '
    + stillOff.length + '：' + stillOff.map(function (e) { return e.ns; }).join(',') + '）');
  const openNotDisabled = [];
  ENGINES.forEach(function (e) {
    e.entries.forEach(function (k) {
      const r = h2.WA[e.ns][k]({});
      if (r && r.reason === 'disabled') openNotDisabled.push(e.ns + '.' + k);
    });
  });
  T(openNotDisabled.length === 0, 'B6 打开后不再返回 disabled（仍 disabled '
    + openNotDisabled.length + '：' + openNotDisabled.join(',') + '）');
  //   ⑤b 宿主键集 ⊆ 产品真导出面（v2.400.0 新增，与 B4 配对）。
  //   为什么必须有这条：B4/B5 的判据形式是「调 setSettings 看 ok」，
  //   而宿主是本文件自建的 —— 宿主多提供一个产品没有的写口，
  //   就能把「引擎调了不存在的 API」接住，而判据照样绿。
  //   实务现场：宿主初版提供 `write`（产品没有），于是八个引擎写的
  //   `WA.settingsBus.write(...)` 在真产品上恒抛、在本宿主上恒成，开关永远打不开。
  //   判据用**真源**校验：从 core/settings-bus.js 里抽 `WA.settingsBus = {` 的导出面键集。
  {
    const busSrc = stripComments(rd('core/settings-bus.js'));
    T(busSrc.indexOf('WA.settingsBus = {') >= 0, 'B4b0 产品导出面锚点「WA.settingsBus = {」在场');
    const hostKeys = Object.keys(h2.WA.settingsBus).sort();
    const missing = hostKeys.filter(function (k) { return busSrc.indexOf(k + '(') < 0 && busSrc.indexOf(k + ':') < 0; });
    T(missing.length === 0, 'B4b 宿主的 settingsBus 每个成员都是产品真有的（凭空造出 '
      + missing.length + '：' + missing.join(',') + '）—— 宿主多给一个写口就能掩盖「调了不存在的 API」');
    T(hostKeys.indexOf('write') < 0 || busSrc.indexOf('write(') >= 0,
      'B4b2 宿主不得提供产品没有的 write 写口（这正是本轮假写面的来源）');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// C 打开后真机制：八项各给真读数判据
// ══════════════════════════════════════════════════════════════════════════
function runC(T, S) {
  S('C 打开后：八项机制真算出东西（不是 ok:true 空转）');
  const h = makeHost();
  ENGINES.forEach(function (e) { h.load(e.rel); });
  NS_ALL.forEach(function (ns) { h.WA[ns].setSettings({ enabled: true }); });
  const WA = h.WA;

  // ── EXV22-1 天文：历差按年累积 → 折成减产 ──
  const c1 = WA.celestialOmens.observeSky({ year: 50, phase: 'full', starShiftDays: 3 });
  T(c1.ok === true && c1.driftDays > 12, 'C1a 五十年历差 > 12 日（实 ' + c1.driftDays
    + '；0.2422 × 50 = 12.11，说明按年累积真算）');
  T(c1.alarm === true, 'C1b 超过 alarmDays 阈值时 alarm 点亮（阈值真参与判定）');
  const c1s = WA.celestialOmens.settle({ yieldBase: 100 });
  T(c1s.ok === true && c1s.yieldAfter < 100, 'C1c 历差折成减产（100 → ' + c1s.yieldAfter + '）');
  const c1s2 = WA.celestialOmens.settle({ yieldBase: 100 });
  T(c1s2.yieldAfter === c1s.yieldAfter && c1s2.missedDecads === c1s.missedDecads,
    'C1d 同输入两次读数一致（可复算，不掷骰子）');
  const c1bad = WA.celestialOmens.observeSky({ phase: 'full' });
  T(c1bad.ok === false && /missing-year/.test(c1bad.hint || ''),
    'C1e 缺年份如实拒（hint 点名，不猜年份）');

  // ── EXV22-2 驿传：拓扑 → 换马耗时 → 断驿 ──
  const p1 = WA.postalRelay.buildRoute({
    id: 'r-main',
    nodes: [{ id: 'a', name: '长安', kmToNext: 300 }, { id: 'b', name: '洛阳', kmToNext: 300 }, { id: 'c', name: '幽州' }]
  });
  T(p1.ok === true && p1.route.totalKm === 600, 'C2a 总里程逐段累加（实 ' + (p1.route && p1.route.totalKm) + '）');
  T(p1.route.relayCount === 2, 'C2b 换马次数 = 段数（实 ' + p1.route.relayCount + '）');
  T(p1.route.hours > p1.route.rideHours, 'C2c 换马耗时真的加进总时延（'
    + p1.route.rideHours + ' → ' + p1.route.hours + '）');
  const p2 = WA.postalRelay.dispatchByRelay({ routeId: 'r-main', priority: 'urgent' });
  T(p2.ok === true && p2.hours < p1.route.hours, 'C2d 加急确实更快（'
    + p1.route.hours + ' → ' + p2.hours + '）');
  T(p2.relayHours === p1.route.relayHours, 'C2e 加急不减免换马耗时（驿传与飞鸽的分界）');
  WA.postalRelay.buildRoute({ id: 'r-broken', nodes: [{ id: 'x', kmToNext: 100 }, { id: 'y', broken: true }] });
  const p3 = WA.postalRelay.dispatchByRelay({ routeId: 'r-broken' });
  T(p3.ok === false && /relay-broken/.test(p3.hint || ''),
    'C2f 断驿如实拒并点名（不跳过断站继续走）');

  // ── EXV22-3 徭役：超额 → 逃户 → 基数变小 → 越收越穷 ──
  const l1 = WA.levyCorvee.levySeason({ households: 100, wantPerHousehold: 5 });
  T(l1.ok === true && l1.got === 500 && l1.fled === 0, 'C3a 未超额：实征足、无逃户（got='
    + l1.got + ' fled=' + l1.fled + '）');
  const l2 = WA.levyCorvee.levySeason({ households: 100, wantPerHousehold: 20 });
  T(l2.shortOfQuota === true, 'C3b 超额：如实报收不满（shortfall=' + l2.shortfall + '）');
  T(l2.fled > 0 && l2.nextBase < 100, 'C3c 超额逼出逃户且基数变小（fled=' + l2.fled
    + ' nextBase=' + l2.nextBase + '）');
  const l3 = WA.levyCorvee.levySeason({ households: l2.nextBase, wantPerHousehold: 20 });
  T(l3.got < l2.got, 'C3d 「越收越穷」真成立：基数小了收得更少（' + l2.got + ' → ' + l3.got + '）');
  const lbad = WA.levyCorvee.levySeason({ households: 0, wantPerHousehold: 5 });
  T(lbad.ok === false && /no-households/.test(lbad.hint || ''), 'C3e 无户可征如实拒');

  // ── EXV22-4 丧葬：五服 → 服丧期 → 禁令 ──
  const m1 = WA.mortuaryRites.holdFuneral({ mournerId: 'p1', kin: 'zhan-cui', at: 0, deceased: '父' });
  T(m1.ok === true && m1.days === 810, 'C4a 斩衰 27 月 = 810 日（实 ' + m1.days + '）');
  const m2 = WA.mortuaryRites.checkProhibition({ mournerId: 'p1', action: 'marry', at: 1000 });
  T(m2.ok === false && m2.reason === 'mourning-prohibited' && m2.reportable === true,
    'C4b 期内婚娶被禁且可告发（reason=' + m2.reason + '）');
  const m3 = WA.mortuaryRites.checkProhibition({ mournerId: 'p1', action: 'trade', at: 1000 });
  T(m3.ok === true && m3.outcome === 'not-banned', 'C4c 禁令只针对三条，不无限扩张');
  const m4 = WA.mortuaryRites.checkProhibition({ mournerId: 'p1', action: 'marry', at: m1.until + 1 });
  T(m4.ok === true && m4.outcome === 'mourning-over', 'C4d 期外放行（不是永久禁止）');
  const mbad = WA.mortuaryRites.holdFuneral({ mournerId: 'p1', kin: 'unknown-kin', at: 0 });
  T(mbad.ok === false && /unknown-kin/.test(mbad.hint || ''), 'C4e 未知亲等如实拒（不猜关系）');

  // ── EXV22-5 服饰：僭越 → 风险 → 城门盘查 ──
  //   ⚠ 这里钉住本轮真修过的一处引擎缺陷：初版用 risk × scrutiny 做乘法，
  //     于是 risk=1、scrutiny=0.45 时乘积恒 0.45 < 0.5 阈值 ⇒ **最高僭越永远抓不到**。
  //     改法是两条独立通道 1-(1-risk)(1-scrutiny)。本判据正是从那个缺陷反推出来的：
  //     「庶民穿龙袍」必须**真的**在城门前被识破，而不是「风险算出来很高但没人抓」。
  const s1 = WA.sartorialRegalia.attireAs({ personId: 'p1', set: 'dragon-robe', realIdentity: 'commoner' });
  T(s1.ok === true && s1.usurping === true && s1.risk === 1, 'C5a 庶民穿龙袍：僭越且风险封顶（risk=' + s1.risk + '）');
  const sG = WA.sartorialRegalia.identifyAtGate({ personId: 'p1' });
  T(sG.ok === true && sG.caught === true, 'C5b 最高僭越在城门前真被识破（caught=' + sG.caught
    + '；乘法版本在这里恒假）');
  const s2 = WA.sartorialRegalia.attireAs({ personId: 'p2', set: 'common-cloth', realIdentity: 'commoner' });
  T(s2.ok === true && s2.usurping === false && s2.risk === 0, 'C5c 布衣庶民：不僭越、零风险');
  const sG2 = WA.sartorialRegalia.identifyAtGate({ personId: 'p2' });
  T(sG2.caught === false, 'C5d 合法穿着顺利通过（不是谁都抓）');
  const sG3 = WA.sartorialRegalia.identifyAtGate({ personId: 'p1' });
  T(sG3.caught === sG.caught, 'C5e 同一人两次盘查结论相同（确定性阈值，不掷骰子）');

  // ── EXV22-6 婚约：门第差 → 妆匛 → 悔婚 ──
  const b1 = WA.betrothalAlliance.proposeMatch({ id: 'mm1', houseA: 'A', houseB: 'B', rankA: 7, rankB: 5, baseDowry: 100 });
  T(b1.ok === true && b1.dowry > 100, 'C6a 门第差抬妆匛（100 → ' + b1.dowry + '）');
  T(b1.breachPenalty > b1.dowry, 'C6b 悔婚代价高于聘礼（' + b1.dowry + ' → ' + b1.breachPenalty + '）');
  const b2 = WA.betrothalAlliance.settle({ id: 'mm1', at: 1 });
  T(b2.ok === true && b2.dowryPaidBy === 'B', 'C6c 妆匛方向可读：低门第那家付（实 ' + b2.dowryPaidBy + '）');
  const b3 = WA.betrothalAlliance.breach({ id: 'mm1' });
  T(b3.ok === true && b3.tieAfter < b2.cumulativeTie, 'C6d 悔婚折损绑定（'
    + b2.cumulativeTie + ' → ' + b3.tieAfter + '）');
  const bToo = WA.betrothalAlliance.proposeMatch({ id: 'mm2', houseA: 'A', houseB: 'C', rankA: 9, rankB: 1 });
  T(bToo.ok === false && /rank-gap-too-wide/.test(bToo.hint || ''), 'C6e 门第差过大如实报议不成');

  // ── EXV22-7 舆图：亲见/传闻 → 精度 → 走错 ──
  const k1 = WA.cartographySurvey.chartRegion({
    regionId: 'rr1', skill: 0.9,
    points: [{ name: '潼关', seen: true }, { name: '函谷', seen: true }]
  });
  T(k1.ok === true && k1.heard === 0 && k1.precision > 0.5, 'C7a 全亲见：精度高（实 ' + k1.precision + '）');
  const k2 = WA.cartographySurvey.chartRegion({
    regionId: 'rr2', skill: 0.9,
    points: [{ name: '潼关', seen: true }, { name: '函谷', heard: true }, { name: '风陵', heard: true }]
  });
  T(k2.precision < k1.precision, 'C7b 传闻点多 ⇒ 精度下降（' + k1.precision + ' → ' + k2.precision + '）');
  T(k2.guessedCount === 2, 'C7c 如实报「几个点是猜的」（实 ' + k2.guessedCount + '）');
  const k3 = WA.cartographySurvey.resolveLandmark({ regionId: 'rr2', landmark: '函谷' });
  T(k3.ok === true && k3.seen === false && k3.misled === true, 'C7d 传闻地标会走错（certainty=' + k3.certainty + '）');
  const k4 = WA.cartographySurvey.resolveLandmark({ regionId: 'rr1', landmark: '潼关' });
  T(k4.ok === true && k4.misled === false, 'C7e 亲见地标找得到');
  const kbad = WA.cartographySurvey.chartRegion({ regionId: 'rr3', points: [{ name: 'x' }] });
  T(kbad.ok === false && /unmarked-point/.test(kbad.hint || ''),
    'C7f 不标亲见/传闻 ⇒ 拒（「我全知道」正是要治的病）');

  // ── EXV22-8 方言：距离 → 掮客 → 误译 ──
  const g0 = WA.linguaBroker.converse({ tongueA: 'guanzhong', tongueB: 'guanzhong', text: 'x' });
  T(g0.ok === true && g0.distance === 0 && g0.misread === false, 'C8a 同语：零距离、不误译');
  const g1 = WA.linguaBroker.converse({ tongueA: 'guanzhong', tongueB: 'lingnan', text: '和亲条款' });
  T(g1.ok === true && g1.distance === 1 && g1.misreadProbability > 0.5,
    'C8b 跨族：误译概率过半（实 ' + g1.misreadProbability + '）');
  const g1b = WA.linguaBroker.converse({ tongueA: 'guanzhong', tongueB: 'lingnan', text: '和亲条款' });
  T(g1b.misread === g1.misread && g1b.roll === g1.roll,
    'C8c 同一句话两次结论相同（用 hash 不用 Math.random，判据可重放）');
  const g2 = WA.linguaBroker.converse({
    tongueA: 'guanzhong', tongueB: 'lingnan', text: '和亲条款', broker: { tongue: 'guanzhong', skill: 1 }
  });
  T(g2.misreadProbability < g1.misreadProbability, 'C8d 有掮客 ⇒ 误译概率下降（'
    + g1.misreadProbability + ' → ' + g2.misreadProbability + '）');
  const g3 = WA.linguaBroker.converse({
    tongueA: 'guanzhong', tongueB: 'lingnan', text: '和亲条款', broker: { tongue: 'tufan', skill: 1 }
  });
  T(g3.brokerUsed === false, 'C8e 掮客不会说双方任一边 ⇒ 不算数（不糊弄）');
  const gbad = WA.linguaBroker.converse({ tongueA: 'guanzhong', tongueB: 'klingon' });
  T(gbad.ok === false && /unknown-tongue/.test(gbad.hint || ''), 'C8f 未知方言如实拒');
}

// ══════════════════════════════════════════════════════════════════════════
// D 拒收口径：只用 disabled 一个共享码
// ══════════════════════════════════════════════════════════════════════════
function runD(T, S) {
  S('D 拒收口径：拒收只用共享码 disabled；成功结果码走 outcome（不混进 reason）');
  // ── 本组的口径（这条口径是本轮**踩坑之后**才定下来的，先说清）──────────────
  //   本仓 tests/reject-code-gate.js 用 `reason: '<code>'` 的字面形态收集拒收码面，
  //   并要求每个码都有见证或死表证明。也就是说：**`reason` 是拒收专用字段**。
  //   本批初版把成功结果码也写进 reason（`reason: 'sky-observed'` / `'route-built'` …），
  //   于是 reject-code-gate 当场报 15 条「未分类」。
  //   判据没错，是字段用错了：「为何拒收」与「做成了什么」是两件事，塞进同一个字段
  //   就会让前者失去可判定性。处置**不是**放宽门禁（那会让真拒收码一起漏掉），
  //   而是换字段：拒收走 reason，成功走 outcome。本组就钉这件事。
  const REJECT_ALLOWED = ['disabled', 'mourning-prohibited'];
  const reasons = [];
  ENGINES.forEach(function (e) {
    const code = stripComments(rd(e.rel));
    const re = /reason\s*:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(code)) !== null) reasons.push({ ns: e.ns, code: m[1] });
    //   注意：这里**只**收 reason（拒收面）。outcome 面不放字面正则，理由见下面 D3 注释。
  });
  //   ① 所有 reason 必须是「真拒收码」：要么是共享码 disabled，要么有见证（mourning-prohibited）。
  const badReason = reasons.filter(function (r) { return REJECT_ALLOWED.indexOf(r.code) < 0; });
  T(badReason.length === 0, 'D1 reason 字段里只有真拒收码（违 ' + badReason.length + '：'
    + badReason.map(function (r) { return r.ns + '：' + r.code; }).join(',') + '）'
    + ' —— 成功结果码必须走 outcome，否则 reject-code-gate 会判成未分类拒收码');
  //   ② disabled 是八项共用码：每个引擎都要有（否则「关闭时如实拒」在某项上缺失）。
  const noDisabled = ENGINES.filter(function (e) {
    return !reasons.some(function (r) { return r.ns === e.ns && r.code === 'disabled'; });
  });
  T(noDisabled.length === 0, 'D2 八个引擎都有共享码 disabled（缺 ' + noDisabled.length + '：'
    + noDisabled.map(function (e) { return e.ns; }).join(',') + '）');
  //   ③ 成功路径必须有 outcome（不是裸 ok:true 什么都不说）。
  //     这条是「可读面」判据：调用方拿到 ok:true 却不知道做成了什么，等于没做事。
  const noOutcome = ENGINES.filter(function (e) {
    //   ⚠ 这里只判「键名在位」，不判字面值。
    //   本轮现场：`lingua-broker` 写的是 `outcome: misread ? 'misread' : 'understood'`，
    //   值不是字面量 —— 初版用 `outcome: '<字面>'` 收集，于是这一项永远「缺 outcome」，
    //   而它其实**有** outcome。这是本仓反复复发的同一类缺陷：
    //   **判据的输入面比事实窄**。修法不是把引擎改成字面写法（那是为判据改事实），
    //   而是把「值对不对」下放到运行时（D3b 用真调用钉住取值域）。
    return !/\boutcome\s*:/.test(stripComments(rd(e.rel)));
  });
  T(noOutcome.length === 0, 'D3 八个引擎的成功路径都写 outcome 键（缺 ' + noOutcome.length + '：'
    + noOutcome.map(function (e) { return e.ns; }).join(',') + '）'
    + ' —— 键名判据；字面值判据会漏掉拼接写法（见上方注释）');
  //   ③b 拼接写法的那一项，静态抓不到值，只能跑起来钉住取值域。
  //      `lingua-broker` 的 outcome 只能是 misread / understood，别的一律算错。
  {
    const hg = makeHost();
    hg.load('engines/lingua-broker.js');
    hg.WA.linguaBroker.setSettings({ enabled: true });
    const gg = hg.WA.linguaBroker.converse({ tongueA: 'guanzhong', tongueB: 'lingnan', text: 'x' });
    T(gg.ok === true && (gg.outcome === 'misread' || gg.outcome === 'understood'),
      'D3b 拼接形态的 outcome 运行时落在二值域内（实 ' + JSON.stringify(gg.outcome) + '）');
  }
  //   ④ 拒收形态：`ok: false, reason: '...'` 必须成对（只写 reason 不算拒）。
  const noOkFalse = ENGINES.filter(function (e) {
    const code = stripComments(rd(e.rel));
    return !/ok\s*:\s*false\s*,\s*reason\s*:/.test(code) && !/reason\s*:\s*'disabled'/.test(code);
  });
  T(noOkFalse.length === 0, 'D4 八处拒收都是 ok:false + reason 成对（缺 ' + noOkFalse.length + '）');
  //   ⑤ 非法输入一律带 hint（不是裸 ok:false）。「拒收必须可读」是本仓既有裁决。
  const hintMiss = ENGINES.filter(function (e) {
    const code = stripComments(rd(e.rel));
    return !/hint\s*:/.test(code);
  });
  T(hintMiss.length === 0, 'D5 八个引擎都有 hint 拒收通道（缺 ' + hintMiss.length + '：'
    + hintMiss.map(function (e) { return e.ns; }).join(',') + '）');
  //   ⑥ 运行时：非法输入的返回值必须 ok:false 且有 hint（不是 ok:true 蒙过去）。
  const h = makeHost();
  ENGINES.forEach(function (e) { h.load(e.rel); });
  NS_ALL.forEach(function (ns) { h.WA[ns].setSettings({ enabled: true }); });
  const badCases = [
    { ns: 'celestialOmens', fn: 'observeSky', arg: { phase: 'full' } },
    { ns: 'postalRelay', fn: 'buildRoute', arg: { id: 'x', nodes: [] } },
    { ns: 'levyCorvee', fn: 'levySeason', arg: { households: 0, wantPerHousehold: 5 } },
    { ns: 'mortuaryRites', fn: 'holdFuneral', arg: { mournerId: 'p', kin: 'nope', at: 0 } },
    { ns: 'cartographySurvey', fn: 'chartRegion', arg: { regionId: 'r', points: [{ name: 'x' }] } },
    { ns: 'linguaBroker', fn: 'converse', arg: { tongueA: 'guanzhong', tongueB: 'klingon' } }
  ];
  const badNoHint = [];
  badCases.forEach(function (c) {
    let r;
    try { r = h.WA[c.ns][c.fn](c.arg); } catch (e) { r = { __threw: e && e.message }; }
    if (!r || r.ok !== false || typeof r.hint !== 'string' || !r.hint.length) {
      badNoHint.push(c.ns + '.' + c.fn + ' → ' + JSON.stringify(r));
    }
  });
  T(badNoHint.length === 0, 'D6 六类非法输入运行时都返回 ok:false + 非空 hint（违 '
    + badNoHint.length + '）' + (badNoHint.length ? ' — ' + badNoHint.slice(0, 3).join(' / ') : ''));
  //   ⑦ 运行时：成功路径的返回体必须带 outcome（与静态面判据互为印证）。
  const okNoOutcome = [];
  [
    { ns: 'celestialOmens', fn: 'observeSky', arg: { year: 30, phase: 'full' } },
    { ns: 'postalRelay', fn: 'buildRoute', arg: { id: 'd1', nodes: [{ id: 'a', kmToNext: 100 }, { id: 'b' }] } },
    { ns: 'levyCorvee', fn: 'levySeason', arg: { households: 10, wantPerHousehold: 2 } },
    { ns: 'mortuaryRites', fn: 'holdFuneral', arg: { mournerId: 'dp', kin: 'si-ma', at: 0 } },
    { ns: 'sartorialRegalia', fn: 'attireAs', arg: { personId: 'dp', set: 'common-cloth', realIdentity: 'commoner' } },
    { ns: 'betrothalAlliance', fn: 'proposeMatch', arg: { id: 'dm', houseA: 'A', houseB: 'B', rankA: 6, rankB: 5 } },
    { ns: 'cartographySurvey', fn: 'chartRegion', arg: { regionId: 'dr', skill: 0.8, points: [{ name: 'x', seen: true }] } },
    { ns: 'linguaBroker', fn: 'converse', arg: { tongueA: 'guanzhong', tongueB: 'lingnan', text: 'x' } }
  ].forEach(function (c) {
    let r;
    try { r = h.WA[c.ns][c.fn](c.arg); } catch (e) { r = { __threw: e && e.message }; }
    if (!r || r.ok !== true || typeof r.outcome !== 'string' || !r.outcome.length) {
      okNoOutcome.push(c.ns + '.' + c.fn + ' → ' + JSON.stringify(r));
    }
  });
  T(okNoOutcome.length === 0, 'D7 八项成功路径运行时都带非空 outcome（违 ' + okNoOutcome.length + '）'
    + (okNoOutcome.length ? ' — ' + okNoOutcome.slice(0, 3).join(' / ') : ''));
  //   ⑧ 成功路径**不得**带 reason（否则又混回拒收字段）。
  const okWithReason = [];
  //   ⚠ 本数组的**输入面**是本轮扩容的重点。初版只放了两条（observeSky /
  //     checkProhibition），于是 sartorialRegalia.identifyAtGate 与
  //     cartographySurvey.resolveLandmark 在**成功路径上写着 reason** 这件事
  //     五轮都没被发现 —— 又一次「判据的输入面比事实窄」。
  //     现在把八个引擎各自的成功返回都放进来（含两个查询型入口），
  //     并且**逐项指名**而不是抽样：抽样只能证明抽样点干净。
  const D8_CASES = [
    { ns: 'celestialOmens', fn: 'observeSky', arg: { year: 31, phase: 'full' } },
    { ns: 'celestialOmens', fn: 'settle', arg: { yieldBase: 100 } },
    { ns: 'postalRelay', fn: 'buildRoute', arg: { id: 'd8r', nodes: [{ id: 'a', kmToNext: 100 }, { id: 'b' }] } },
    { ns: 'postalRelay', fn: 'dispatchByRelay', arg: { routeId: 'd8r' } },
    { ns: 'levyCorvee', fn: 'levySeason', arg: { households: 10, wantPerHousehold: 2 } },
    { ns: 'mortuaryRites', fn: 'checkProhibition', arg: { mournerId: 'dp', action: 'trade', at: 1 } },
    { ns: 'sartorialRegalia', fn: 'identifyAtGate', arg: { personId: 'dp' } },
    { ns: 'betrothalAlliance', fn: 'proposeMatch', arg: { id: 'd8m', houseA: 'A', houseB: 'B', rankA: 6, rankB: 5 } },
    { ns: 'betrothalAlliance', fn: 'settle', arg: { id: 'd8m', at: 1 } },
    { ns: 'cartographySurvey', fn: 'resolveLandmark', arg: { regionId: 'dr', landmark: 'x' } },
    { ns: 'linguaBroker', fn: 'converse', arg: { tongueA: 'guanzhong', tongueB: 'lingnan', text: 'x' } }
  ];
  D8_CASES.forEach(function (c) {
    let r;
    try { r = h.WA[c.ns][c.fn](c.arg); } catch (e) { r = {}; }
    if (r && r.ok === true && r.reason !== undefined) okWithReason.push(c.ns + '.' + c.fn);
  });
  T(okWithReason.length === 0, 'D8 成功路径不带 reason 字段（违 ' + okWithReason.length + '：'
    + okWithReason.join(',') + '）—— reason 是拒收专用，混用会让拒收码面失去可判定性');
  //   〘 D8b 输入面自证 〙上面那份清单必须**覆盖到**八个引擎各自的成功返回，
  //     否则 D8 退化成「抽到的几处干净」，而抽不到的地方正好是缺陷藏身处。
  //   ⚠ 这一条初稿写成了「另拿一份硬编码数组去比另一份硬编码数组」—— 两份都写在
  //     测试里，永远相等，在空集上也恒真。那是本仓最恨的假判据形态。
  //     改成从 **D8_CASES 本身**（真参与判定的那一份）派生，并额外要求条数下限：
  //     如果哪天有人把 D8_CASES 删空了，这条会红而不是绿。
  {
    const D8_NS = ['celestialOmens', 'postalRelay', 'levyCorvee', 'mortuaryRites',
      'sartorialRegalia', 'betrothalAlliance', 'cartographySurvey', 'linguaBroker'];
    const seen = {};
    D8_CASES.forEach(function (c) { seen[c.ns] = (seen[c.ns] || 0) + 1; });
    const missD8 = D8_NS.filter(function (n) { return !seen[n]; });
    T(missD8.length === 0, 'D8b D8 的输入面覆盖全部八个引擎（缺 ' + missD8.length + '：'
      + missD8.join(',') + '）—— 输入面比事实窄，判据就是瞎的');
    T(D8_CASES.length >= 10, 'D8b2 D8 的输入面足够宽（实 ' + D8_CASES.length + ' 条 ≥ 10）'
      + ' —— 防空集恒真：清单被删空时上一条会假绿');
  }
  //   〘 D8c 反向自证：真的去点这两处 〙D8 是「跑起来看有没有 reason」；
  //     但若那两处**根本没被调用**（比如标识不对、返回被吞），D8 会假绿。
  //     所以单独再点一次，并断言它俩确实返回了 ok:true + 非空 outcome ——
  //     既证明调用生效，也证明修完以后结果码没丢。
  {
    const sg = h.WA.sartorialRegalia.identifyAtGate({ personId: 'dp' });
    T(sg && sg.ok === true && (sg.outcome === 'caught' || sg.outcome === 'passed'),
      'D8c 服饰盘查的成功结果走 outcome（实 ' + JSON.stringify(sg && sg.outcome) + '）'
      + ' —— 初版写在 reason 里且是三元拼接，字面正则看不见');
    const km = h.WA.cartographySurvey.resolveLandmark({ regionId: 'dr', landmark: 'x' });
    T(km && km.ok === true && (km.outcome === 'misled' || km.outcome === 'found'),
      'D8d 舆图地标的成功结果走 outcome（实 ' + JSON.stringify(km && km.outcome) + '）'
      + ' —— 同上，同批第二次同型缺陷');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// E 零世界写（运行时）
// ══════════════════════════════════════════════════════════════════════════
function runE(T, S) {
  S('E 零世界写：全部机制跑完后 store 逐字未变');
  const h = makeHost();
  ENGINES.forEach(function (e) { h.load(e.rel); });
  NS_ALL.forEach(function (ns) { h.WA[ns].setSettings({ enabled: true }); });
  const before = h.snapshot();
  const WA = h.WA;
  //   把 C 组那串真机制再跑一遍（含各类拒收分支），只要有一条路径写了世界，这里就会红。
  WA.celestialOmens.observeSky({ year: 50, phase: 'full', starShiftDays: 3 });
  WA.celestialOmens.settle({ yieldBase: 100 });
  WA.postalRelay.buildRoute({ id: 'e1', nodes: [{ id: 'a', kmToNext: 200 }, { id: 'b' }] });
  WA.postalRelay.dispatchByRelay({ routeId: 'e1' });
  WA.levyCorvee.levySeason({ households: 100, wantPerHousehold: 20 });
  WA.mortuaryRites.holdFuneral({ mournerId: 'p', kin: 'zhan-cui', at: 0 });
  WA.mortuaryRites.checkProhibition({ mournerId: 'p', action: 'marry', at: 10 });
  WA.sartorialRegalia.attireAs({ personId: 'p', set: 'dragon-robe', realIdentity: 'commoner' });
  WA.sartorialRegalia.identifyAtGate({ personId: 'p' });
  WA.betrothalAlliance.proposeMatch({ id: 'e2', houseA: 'A', houseB: 'B', rankA: 7, rankB: 5 });
  WA.betrothalAlliance.settle({ id: 'e2', at: 1 });
  WA.betrothalAlliance.breach({ id: 'e2' });
  WA.cartographySurvey.chartRegion({ regionId: 'er', skill: 0.8, points: [{ name: 'x', seen: true }] });
  WA.cartographySurvey.resolveLandmark({ regionId: 'er', landmark: 'x' });
  WA.linguaBroker.converse({ tongueA: 'guanzhong', tongueB: 'lingnan', text: '条约' });
  T(h.snapshot() === before, 'E1 全部机制跑完后 store 逐字未变（八项都只算不写）');
  //   设置面确实写进了 bus（与「不写世界」是两件事，必须分开证）。
  const busKeys = Object.keys(h.busMap).length;
  T(busKeys === 8, 'E2 八条设置确实写进 settingsBus（实 ' + busKeys
    + '）—— 这是设置面，不是世界；两者混为一谈会让「零世界写」变成「什么都不写」');
  //   view() 是只读口：连调两次读数一致（若 view 内部有累计/自增，这里会红）。
  const v1 = JSON.stringify(WA.celestialOmens.view());
  const v2 = JSON.stringify(WA.celestialOmens.view());
  T(v1 === v2, 'E3 view() 幂等（连调两次读数逐字相同）—— 概览页刷新不会改世界');
  T(h.snapshot() === before, 'E4 view() 调用同样零世界写');
}

// ══════════════════════════════════════════════════════════════════════════
// F EXV22-9 消费点：v22OmensBlock 只读、零动作、缺席即缺席
// ══════════════════════════════════════════════════════════════════════════
function runF(T, S) {
  S('F EXV22-9 消费点：v22OmensBlock 真读八个 ns、只读零动作');
  const blkSrc = rd(BLOCKS_REL);
  const blkCode = stripComments(blkSrc);
  //   真代码面（连字符串内容一起剥掉）—— 专供「不许出现某个调用」这类否定式判据用。
  //   为什么不能只用 stripComments：段文件的 HTML 提示文本里就写着
  //   `WorldAxis.bridge.setSettings({ enabled: true })`，那是给用户看的**说明**。
  //   对着说明文字报红是假红，而假红与假绿同罪。
  const blkRealCode = codeOnly(blkSrc);

  // ── F1 消费点存在：八个 ns 的 view() 都在段文件里**字面**出现 ──
  //   为什么必须是字面：module-cycle-gate 的读面走静态正则，只认 `WA.<ns>.<mem>`。
  //   动态取法（`WA[sp.ns]`）在运行时完全正确，但判据读不出来 —— 那就是「假消费点」。
  //   本锁与那道门禁**判同一件事**，但判据独立：这里直接查段文件源码。
  const notRead = NS_ALL.filter(function (ns) {
    return !new RegExp('WA\\.' + ns + '\\.view\\s*\\(').test(blkCode);
  });
  T(notRead.length === 0, 'F1a 八个 ns 的 view() 都以字面形态出现在段文件里（缺 '
    + notRead.length + '：' + notRead.join(',') + '）—— 动态取法会被判成假消费点');
  //   恰好 8 处：多出来说明有人又加了一个读点（可能是重复块），少一处就是漏接。
  const viewHits = (blkCode.match(/WA\.[A-Za-z_$][\w$]*\.view\s*\(/g) || []).length;
  T(viewHits === 8, 'F1b 段文件里 view() 字面读点恰 8 处（实 ' + viewHits + '）');

  // ── F2 只读零动作：绝不出现任何有副作用入口 ──
  //   这是本组**最重要**的一条。概览页一打开就调 levySeason / holdFuneral，
  //   等于「看一眼存档就把它推进了一格」—— 它不会红，只会让存档悄悄变样。
  const SIDE_EFFECT = ['observeSky', 'levySeason', 'holdFuneral', 'attireAs', 'proposeMatch',
    'chartRegion', 'converse', 'buildRoute', 'dispatchByRelay', 'identifyAtGate',
    'checkProhibition', 'settle', 'breach'];
  const hitSide = SIDE_EFFECT.filter(function (k) {
    return new RegExp('\\b' + k + '\\s*\\(').test(blkRealCode);
  });
  T(hitSide.length === 0, 'F2a 段文件零副作用入口调用（命中 ' + hitSide.length + '：'
    + hitSide.join(',') + '）—— 概览页只该读，不该代世界办事');
  //   段文件里也不许有 setSettings（诊断面不该替用户改开关）。
  T(!/\.setSettings\s*\(/.test(blkRealCode), 'F2b 段文件不调 setSettings（诊断面不替用户改开关）');
  //   运行时反证：真渲染一遍，八个引擎的 stat 计数一个都不许涨。
  //   ⚠ 这条是 F2a 的**运行时对应物**。静态正则只能证明「源码里没写这些名字」；
  //     若有人把副作用藏进 view() 内部（比如 view 里顺手 settle），静态面看不出来。
  const h = makeHost();
  ENGINES.forEach(function (e) { h.load(e.rel); });
  NS_ALL.forEach(function (ns) { h.WA[ns].setSettings({ enabled: true }); });
  //   先把八个引擎各推进一步，让 stat 有非零基线（否则「没涨」可能是「本来就是 0」）。
  h.WA.celestialOmens.observeSky({ year: 40, phase: 'full' });
  h.WA.celestialOmens.settle({ yieldBase: 100 });
  h.WA.postalRelay.buildRoute({ id: 'f1', nodes: [{ id: 'a', kmToNext: 100 }, { id: 'b' }] });
  h.WA.levyCorvee.levySeason({ households: 50, wantPerHousehold: 3 });
  h.WA.mortuaryRites.holdFuneral({ mournerId: 'fp', kin: 'si-ma', at: 0 });
  h.WA.sartorialRegalia.attireAs({ personId: 'fp', set: 'common-cloth', realIdentity: 'commoner' });
  h.WA.betrothalAlliance.proposeMatch({ id: 'fm', houseA: 'A', houseB: 'B', rankA: 6, rankB: 5 });
  h.WA.cartographySurvey.chartRegion({ regionId: 'fr', skill: 0.7, points: [{ name: 'x', seen: true }] });
  h.WA.linguaBroker.converse({ tongueA: 'guanzhong', tongueB: 'lingnan', text: 'x' });
  const views0 = NS_ALL.map(function (ns) { return JSON.stringify(h.WA[ns].view()); });
  const store0 = h.snapshot();
  //   连调 view() 三遍（模拟概览页反复渲染）
  for (let i = 0; i < 3; i++) NS_ALL.forEach(function (ns) { h.WA[ns].view(); });
  const views1 = NS_ALL.map(function (ns) { return JSON.stringify(h.WA[ns].view()); });
  T(JSON.stringify(views0) === JSON.stringify(views1),
    'F2c 连调 view() 三遍后八项读数逐字未变（view 是纯读口，不在内部推进状态）');
  T(h.snapshot() === store0, 'F2d 连调 view() 三遍后世界逐字未变');

  // ── F3 缺席即缺席：引擎不在场时如实写「未装载」，不补默认读数 ──
  //   段文件的 READERS 每条都在 try/catch 里，catch 分支写「未装载」。
  T(/未装载/.test(blkCode), 'F3a 段文件有「未装载」缺席文案（缺席即缺席，不补默认读数）');
  T(/catch\s*\(/.test(blkCode), 'F3b 段文件对每个读点有 catch 兜底（一个模块缺席不拖累其余）');
  //   运行时：把某引擎从宿主里摘掉，v22OmensBlock 仍能渲染出其余七行。
  //   （这里直接驱动段模块：vm 里装一份段文件 + 一个缺 celestialOmens 的宿主。）
  {
    const vm2 = require('vm');
    const h2 = makeHost();
    ENGINES.filter(function (e) { return e.ns !== 'celestialOmens'; })
      .forEach(function (e) { h2.load(e.rel); });
    const box = { window: { WorldAxis: h2.WA }, console: { log: function () {} } };
    box.global = box;
    const ctx2 = vm2.createContext(box);
    let html = '', threw = '';
    try {
      vm2.runInContext(blkSrc, ctx2, { filename: BLOCKS_REL });
      const api = h2.WA.panelOverviewBlocks;
      T(!!api && typeof api.v22OmensBlock === 'function', 'F3c 段模块在缺席宿主下仍装载出 v22OmensBlock');
      api.bind({ esc: function (s) { return String(s); } });
      html = String(api.v22OmensBlock() || '');
    } catch (e) { threw = e && e.message; }
    T(!threw, 'F3d 缺席一个引擎时 v22OmensBlock 不抛（错：' + threw + '）');
    T(html.length > 200, 'F3e 缺席一个引擎时其余七行仍渲染出来（实 ' + html.length + ' 字符）');
    T(/未装载/.test(html), 'F3f 缺席的那一项如实写「未装载」（不是 0、不是空串、不是「休眠」）');
  }

  // ── F4 真渲染：概览页第七块在树中 ──
  //   走真实装载路径（tests/mock.js + ui-gate-sync.fresh），与 segment-extract 的 D4 同源。
  //   为什么这里也要跑一遍：D4f/D4g 判的是「七块在树中」，本组判的是「那七块里有一块
  //   是 v22 块且它的读数来自八个真引擎」。两条判据的**输入面不同**，不能互相替代。
  let env = null, envErr = '';
  try {
    require(path.join(BASE, 'tests/mock.js'));
    const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    env = gate.fresh();
  } catch (e) { envErr = e && e.message; }
  T(!!env, 'F4a ui 层可真实装载（' + (envErr || 'ok') + '）');
  if (env) {
    const dom = env.dom;
    const panel = dom.getElementById('wa-panel');
    const tab = panel && panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'overview'; })[0];
    T(!!tab, 'F4b 概览页页签在树中');
    if (tab) tab.click();
    const ovBody = panel.querySelector('.wa-body');
    const folds = ovBody ? ovBody.querySelectorAll('.wa-fold') : [];
    const textOf = function (f) {
      const s = f.querySelector('summary');
      if (!s) return '';
      let t = s._text || '';
      s.childNodes.forEach(function (c) { t += (c.nodeType === 3) ? (c._text || '') : (c.textContent || ''); });
      return t;
    };
    const v22 = folds.filter(function (f) { return textOf(f).indexOf('V22 制度读数') >= 0; });
    T(v22.length === 1, 'F4c 概览页里恰有 1 块是 V22 制度读数（实 ' + v22.length + '）');
    //   这一块的正文必须真的念出八项标签（不是空壳折叠）。
    const bodyText = v22.length ? (v22[0].querySelector('.wa-card') || {}).textContent || '' : '';
    const LABELS = ['星象历差', '驿传时延', '征发逃户', '服丧禁令', '僭越风险', '联姻绑定', '舆图精度', '误译后果'];
    const missLabel = LABELS.filter(function (l) { return bodyText.indexOf(l) < 0; });
    T(missLabel.length === 0, 'F4d 七项标签全部念出（缺 ' + missLabel.length + '：' + missLabel.join(',') + '）'
      + ' —— 八个读点各占一行，不是一块空壳');
    //   零控件：这一块同样不产生 id / button / input（G17 绑定守卫不受影响）。
    const ctrl = v22.length ? v22[0].querySelectorAll('[id]').length : 0;
    T(ctrl === 0, 'F4e V22 块零 id（实 ' + ctrl + '）—— 不触碰 UI 绑定守卫');
  }

  // ── F5 panel.js 的挂载点 ──
  //   渲染点必须真调 v22OmensBlock()（不是「函数定义了但没人调」）。
  //   v2.401.0(OPV23-1)：渲染点随段体搬进 ui/pages/overview-main.js，故 F5a 读重组面
  //   （重组面 == 拆前面，段体里的调用原样可见）；F5b/F5c 断言的是**转发接线**，
  //   只在真实 panel.js 文件里（重组面会把转发块换成段体，转发字面就看不见了）——
  //   两类输入面分开，正是「判据的输入面不得比事实窄」。
  const panelReal = stripComments(fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8'));
  const panelCode = stripComments(rd(PANEL_REL));
  T(/\$\{\s*v22OmensBlock\(\)\s*\}/.test(panelCode),
    'F5a ui/panel.js 的概览页渲染点真调 ${v22OmensBlock()}（不是定义了没人调）');
  T(/function\s+v22OmensBlock\s*\(/.test(panelReal),
    'F5b ui/panel.js 有转发函数 v22OmensBlock（直写字面形态）');
  //   转发必须是**直写** `WA.panelOverviewBlocks.v22OmensBlock()`，不经中间变量：
  //   门禁读面认字面，经变量就看不见（本轮真踩过）。
  T(/WA\.panelOverviewBlocks\.v22OmensBlock\(\)/.test(panelReal),
    'F5c 转发函数直写 WA.panelOverviewBlocks.v22OmensBlock()（不经中间变量，否则门禁看不见）');
}
// ════════════════════════════════════════════════════════════════════
// G 路由面：机制必须有真实生产消费点（action-desk）
// ════════════════════════════════════════════════════════════════════
// 为什么必须有这一组：本批初版八引擎只有 EXV22-9 面板读了 `view()`，
//   机制入口（observeSky / buildRoute / levySeason…）在产品侧零引用。
//   tests/dead-export-gate.js 当场报了 **39 项新增死导出** —— 不是误报：
//   「能算但没人叫它算」的引擎就是死的。补救方式不是记进账本
//   （那是把门禁当装饰），而是接上本仓「玩家动作→引擎」的唯一入口 action-desk。
//   本组就钉这件事：路由在不在 / 参数真不真透传 / 引擎缺席时归因不是假的。
function runG(T, S) {
  S('G 路由面：EXV22-1～8 的机制在 action-desk 有真实生产消费点');
  //   八引擎共 16 条机制路由（逐条点名，不读数）。
  const WANT = [
    'omens.observeSky', 'omens.settle',
    'postal.buildRoute', 'postal.dispatch',
    'levy.raise',
    'funeral.hold', 'funeral.checkProhibition',
    'attire.wear', 'attire.inspectAtGate',
    'match.propose', 'match.settle', 'match.breach',
    'survey.chartRegion', 'survey.resolveLandmark',
    'tongue.converse'
  ];
  const deskCode = stripComments(rd('engines/action-desk.js'));
  const miss = WANT.filter(function (k) { return deskCode.indexOf("'" + k + "'") < 0; });
  T(miss.length === 0, 'G1 十六条机制路由全部登记在 action-desk.ROUTES（缺 ' + miss.length
    + '：' + miss.join(',') + '）—— 新导出必须有真实生产消费点');
  //   ① 路由参数透传：路由必须把 `o.spec || o` 交给引擎（不能丢参数）。
  //      为什么用 `o.spec || o`：本仓路由已有同形惯例（riskPooling.* / rehearsal.preview），
  //      两种写法（包一层 spec / 平铺）都得能用。
  const noSpec = WANT.filter(function (k) {
    const i = deskCode.indexOf("'" + k + "'");
    const seg = deskCode.slice(i, i + 320);
    return seg.indexOf('o.spec || o') < 0;
  });
  T(noSpec.length === 0, 'G2 每条路由都把参数真透传给引擎（o.spec || o，缺 ' + noSpec.length
    + '：' + noSpec.join(',') + '）—— 丢参数的路由等于没接');
  //   ② 引擎缺席时的归因不得造假：走已有共享码 `unsupported`，
  //      而不是新造八个 `<ns>-unavailable`（那会让码面重复且需要新见证）。
  const newCodes = ['celestialOmens-unavailable', 'postalRelay-unavailable', 'levyCorvee-unavailable',
    'mortuaryRites-unavailable', 'sartorialRegalia-unavailable', 'betrothalAlliance-unavailable',
    'cartographySurvey-unavailable', 'linguaBroker-unavailable'];
  const leaked = newCodes.filter(function (c) { return deskCode.indexOf(c) >= 0; });
  T(leaked.length === 0, 'G3 路由没新造拒收码（造出 ' + leaked.length + '：' + leaked.join(',') + '）'
    + '—— 引擎缺席走已有共享码 unsupported');
  //   ③ 运行时真跑：真装 action-desk + 八引擎，路由真调到引擎并拿到真读数。
  //      为什么必须真跑：静态面只能证明「字面在」，而「路由拿到的东西真的是引擎算的」只能跑出来。
  const h = makeHost();
  ENGINES.forEach(function (e) { h.load(e.rel); });
  h.load('engines/action-desk.js');
  NS_ALL.forEach(function (ns) { h.WA[ns].setSettings({ enabled: true }); });
  //   ④ action-desk **自己**出厂也是关的（`DEF = { enabled: false }`，第 45 行），
  //      而 `plan()` 一进门就是 `if (!cfg.enabled) return { ok:false, reason:'disabled' }`。
  //      只打开八引擎的开关时，十六条路由全部返回 `disabled` —— 那读数是「桌子没开」，
  //      不是「路由没接」。**必须两边的开关都开**，否则 G4a~G4i 会一起变成假绿（读数取到
  //      的是门禁而不是引擎）或假红（像本轮这样）。这不是引擎缺陷，是判据缺口。
  const AD = h.WA.actionDesk;
  if (AD && typeof AD.setSettings === 'function') AD.setSettings({ enabled: true });
  T(!!AD && typeof AD.plan === 'function', 'G4 action-desk 装上且 plan 可调');
  //   ⑤ 上面那次开桌必须真的生效：拿一个必然拒收的动作探门，
  //      若仍读到 `disabled` 说明开关没打开（后续 G4a~G4h 的读数就全是门禁噪声）。
  const gate = AD && typeof AD.plan === 'function' ? AD.plan('__g4_probe__') : null;
  T(!!gate && gate.reason !== 'disabled',
    'G4a0 action-desk 自身开关已真打开（探针实得 ' + JSON.stringify(gate && gate.reason)
    + '）—— 否则 G4a~G4h 读到的是门禁而不是路由');
  if (AD && typeof AD.plan === 'function') {
    const om = AD.plan('omens.observeSky', { year: 40, phase: 'full' });
    T(om && om.ok === true && om.driftDays > 9, 'G4a 星象路由真调到引擎（driftDays=' + (om && om.driftDays) + '）');
    const po = AD.plan('postal.buildRoute', { id: 'g-r', nodes: [{ id: 'a', kmToNext: 150 }, { id: 'b' }] });
    T(po && po.ok === true && po.route && po.route.totalKm === 150,
      'G4b 驿传路由真调到引擎（totalKm=' + (po && po.route && po.route.totalKm) + '）');
    const lv = AD.plan('levy.raise', { households: 10, wantPerHousehold: 2 });
    T(lv && lv.ok === true && lv.got === 20, 'G4c 徇役路由真调到引擎（got=' + (lv && lv.got) + '）');
    const fu = AD.plan('funeral.hold', { mournerId: 'g1', kin: 'zhan-cui', at: 0 });
    T(fu && fu.ok === true && fu.days === 810, 'G4d 丧葬路由真调到引擎（days=' + (fu && fu.days) + '）');
    const at = AD.plan('attire.wear', { personId: 'g1', set: 'dragon-robe', realIdentity: 'commoner' });
    T(at && at.ok === true && at.risk === 1, 'G4e 服饰路由真调到引擎（risk=' + (at && at.risk) + '）');
    const mt = AD.plan('match.propose', { id: 'g-m', houseA: 'A', houseB: 'B', rankA: 7, rankB: 5 });
    T(mt && mt.ok === true && mt.dowry > 0, 'G4f 婚约路由真调到引擎（dowry=' + (mt && mt.dowry) + '）');
    const su = AD.plan('survey.chartRegion', { regionId: 'g-r2', skill: 0.9, points: [{ name: 'x', seen: true }] });
    T(su && su.ok === true && su.precision > 0.4, 'G4g 舆图路由真调到引擎（precision=' + (su && su.precision) + '）');
    const tg = AD.plan('tongue.converse', { tongueA: 'guanzhong', tongueB: 'lingnan', text: 'x' });
    T(tg && tg.ok === true && typeof tg.outcome === 'string',
      'G4h 方言路由真调到引擎（outcome=' + (tg && tg.outcome) + '）');
    //   ④ 引擎缺席时的反向：眠掉命名空间后路由必须如实报 unsupported，
    //      而不是偷偷返回 ok:true（那是假消费点的最坏形态）。
    const keep = h.WA.celestialOmens;
    try {
      h.WA.celestialOmens = undefined;
      const r = AD.plan('omens.observeSky', { year: 40, phase: 'full' });
      T(r && r.ok === false && r.reason === 'unsupported',
        'G4i 引擎缺席时路由如实报 unsupported（实 '
        + JSON.stringify(r && r.reason) + '）—— 不偷返 ok:true');
    } finally {
      h.WA.celestialOmens = keep;
    }
    //   ⑤ 上面那段负控必须真的破坏了东西（否则 G4i 是空转）：
    T(!!h.WA.celestialOmens, 'G4j 引擎已无条件还原（不拿「跑通了」当还原的理由）');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// N 负控制：四条真源码破坏
// ══════════════════════════════════════════════════════════════════════════
function runNeg(T) {
  // ── N1 默认关闭被破坏 ⇒ B 组判据必须现形 ──
  //   真改 engines/levy-corvee.js 的 DEF.enabled: false → true，重跑 B1，必须红。
  //   try/finally + sha256：无论断言抛不抛，文件都还原并核对摘要。
  withMutated('engines/levy-corvee.js', function (src) {
    const broken = src.replace(/const DEF = \{[\s\S]{0,200}?enabled:\s*false/, function (m) {
      return m.replace('enabled: false', 'enabled: true');
    });
    return broken;
  }, function (changed) {
    T(changed, 'N1a 内存副本确实改到了 DEF.enabled（否则 N1 是空转）');
  }, function () {
    //   真改后重跑 B1 的**同一判据**（不是另写一条）：只要有一条入口不再返回 disabled，
    //   就说明「默认关闭」这条约定被破坏，而 B1 是能逮住它的。
    const h = makeHost();
    ENGINES.forEach(function (e) { h.load(e.rel); });
    const notDisabled = [];
    ENGINES.forEach(function (e) {
      e.entries.forEach(function (k) {
        let r;
        try { r = h.WA[e.ns][k]({}); } catch (err) { r = { __threw: err && err.message }; }
        if (!r || r.ok !== false || r.reason !== 'disabled') notDisabled.push(e.ns + '.' + k);
      });
    });
    T(notDisabled.length > 0, 'N1b 破坏默认关闭后 B1 判据现形（实报 ' + notDisabled.length
      + ' 条非 disabled）—— 证明 B1 不是恒真');
    T(notDisabled.some(function (x) { return x.indexOf('levyCorvee') === 0; }),
      'N1c 现形的正是被破坏的那一项（levyCorvee）—— 判据精确点名，不是笼统红');
  });

  // ── N2 删掉 enabled 守卫 ⇒ B 组必须现形 ──
  //   ⚠ 初版这里写了一个「多行守卫」的正则（`if (!cfg.enabled) { … } }`），
  //     而本仓这八个引擎的守卫是**单行**形态：
  //       if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
  //     于是 replace 空转（changed === false），N2a 当场红 —— 这正是「负控制自身空转」
  //     的那类假绿防线：如果 N2a 不断言「破坏确实发生了」，N2b 会因为「什么都没改」
  //     而**照样绿**，看上去像「判据逮不住」。故 N2a 必须留。
  withMutated('engines/lingua-broker.js', function (src) {
    //   按真实形态摘：整行 `if (!cfg.enabled) { ... }` 替换成一行注释。
    return src.replace(/^[ \t]*if\s*\(!cfg\.enabled\)\s*\{[^\n]*\}\s*$/m,
      '    /* NEGCTL-EXV22 守卫被摘 */');
  }, function (changed) {
    T(changed, 'N2a 内存副本确实摘掉了 enabled 守卫（否则 N2 是空转）');
  }, function () {
    const h = makeHost();
    ENGINES.forEach(function (e) { h.load(e.rel); });
    let r;
    try { r = h.WA.linguaBroker.converse({}); } catch (e) { r = { __threw: e && e.message }; }
    T(!r || r.reason !== 'disabled', 'N2b 摘掉守卫后 converse 不再返回 disabled（实 '
      + JSON.stringify(r) + '）—— 证明 B1 能逮住「关闭时居然算得动」');
  });

  // ── N3 破坏只读纪律 ⇒ F2a 必须现形 ──
  //   在段文件的 v22OmensBlock 里插一行真调用（WA.levyCorvee.levySeason({})）。
  withMutated(BLOCKS_REL, function (src) {
    const anchor = '  function v22OmensBlock() {';
    if (src.indexOf(anchor) < 0) return src;
    return src.replace(anchor, anchor + '\n    WA.levyCorvee.levySeason({}); // NEGCTL-EXV22 只读纪律被破坏');
  }, function (changed) {
    T(changed, 'N3a 内存副本确实插进了副作用调用（否则 N3 是空转）');
  }, function () {
    //   用 codeOnly（连字符串内容一起剥）—— 与 F2a 的输入面**逐字相同**。
    //   为什么不能用 stripComments：N3 插入的那行是**真代码**（`WA.levyCorvee.levySeason({})`），
    //   后面跟着 `// NEGCTL` 注释；stripComments 会去掉注释、保留代码，结果是对的。
    //   但 F2a 的输入面是 codeOnly（它还要挡「说明文字里的调用」），两处输入面若不一致，
    //   N3 证明的就不是 F2a 用的那条判据 —— 负控制必须打在被证判据的**同一个输入面**上。
    const code = codeOnly(rd(BLOCKS_REL));
    const SIDE_EFFECT = ['observeSky', 'levySeason', 'holdFuneral', 'attireAs', 'proposeMatch',
      'chartRegion', 'converse', 'buildRoute', 'dispatchByRelay', 'identifyAtGate',
      'checkProhibition', 'settle', 'breach'];
    const hitSide = SIDE_EFFECT.filter(function (k) { return new RegExp('\\b' + k + '\\s*\\(').test(code); });
    T(hitSide.length > 0, 'N3b 破坏只读纪律后 F2a 判据现形（实命中 ' + hitSide.length
      + '：' + hitSide.join(',') + '）—— 证明「零动作」不是空话');
    T(hitSide.indexOf('levySeason') >= 0, 'N3c 现形的正是被插入的那一条（levySeason）');
  });

  // ── N4 摘掉渲染调用 ⇒ F5a 必须现形 ──
  //   v2.401.0(OPV23-1)：挂载行随 renderOverview 段体搬进 ui/pages/overview-main.js，
  //   破坏对象跟着现场走（锚点语义不变：摘掉后 F5a 在重组面上现形）。
  withMutated('ui/pages/overview-main.js', function (src) {
    return src.replace('${v22OmensBlock()}', '');
  }, function (changed) {
    T(changed, 'N4a 内存副本确实摘掉了渲染调用（否则 N4 是空转）');
  }, function () {
    const code = stripComments(rd(PANEL_REL));
    T(!/\$\{\s*v22OmensBlock\(\)\s*\}/.test(code),
      'N4b 摘掉后 F5a 判据现形（渲染点不再有 ${v22OmensBlock()}）—— 证明「真消费点」不是空话');
  });
}

/**
 * 真源码破坏的公共外壳：改 → 断言 → 还原 → 核对 sha256。
 *
 * 为什么必须用真文件而不是内存副本：验收纪律要的是「真源码破坏」。内存副本能证明
 * 「判据函数对该字符串敏感」，但不能证明「判据在仓库现场真的会红」—— 而后者才是
 * 门禁的价值所在。风险（验证者自己改仓库）由 finally + sha256 双重兜住：
 *   · finally 无条件还原（断言抛错也还原）；
 *   · 还原后核对 sha256，不一致直接抛（本锁自身失败，不许静默留下脏文件）。
 *
 * @param {string} rel 相对仓库根的路径
 * @param {function(string):string} mutate 破坏函数（返回新源码）
 * @param {function(boolean)} check 断言「破坏确实发生了」
 * @param {function()} body 破坏期间要跑的判据
 */
function withMutated(rel, mutate, check, body) {
  const abs = path.join(BASE, rel);
  const original = fs.readFileSync(abs, 'utf8');
  const hash0 = crypto.createHash('sha256').update(original).digest('hex');
  let broken = original;
  try {
    broken = mutate(original);
    check(broken !== original);
    fs.writeFileSync(abs, broken, 'utf8');
    body();
  } finally {
    fs.writeFileSync(abs, original, 'utf8');
    const hash1 = crypto.createHash('sha256').update(fs.readFileSync(abs, 'utf8')).digest('hex');
    if (hash1 !== hash0) {
      throw new Error('负控制还原失败：' + rel + ' 的 sha256 与破坏前不一致（'
        + hash0.slice(0, 12) + ' → ' + hash1.slice(0, 12) + '）');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// CLI：可直接 `node tests/exv22-v2400.js` 单跑
// ══════════════════════════════════════════════════════════════════════════
if (require.main === module) {
  let pass = 0, fail = 0;
  const lines = [];
  const assert = function (cond, msg) {
    if (cond) { pass++; return; }
    fail++;
    lines.push('  ✗ ' + msg);
  };
  let r = { count: 0 };
  try {
    r = runAll(assert);
  } catch (e) {
    fail++;
    lines.push('  ✗ 套件抛错：' + (e && e.message));
  }
  lines.forEach(function (l) { console.log(l); });
  console.log('EXV22-V2400: ' + (fail === 0 ? 'pass' : 'FAIL') + '（' + pass + ' / ' + fail + '）'
    + (fail === 0 ? '，共 ' + r.count + ' 项' : ''));
  process.exit(fail === 0 ? 0 : 1);
}

function runAll(assert) {
  const A = assert || function (c, m) { if (!c) throw new Error('断言失败：' + m); };
  let n = 0;
  const T = function (c, m) { n++; A(c, m); };
  const S = function (title) { n++; A(true, title); };

  runA(T, S);
  runB(T, S);
  runC(T, S);
  runD(T, S);
  runE(T, S);
  runG(T, S);
  runF(T, S);
  runNeg(T);
  return { count: n };
}
