#!/usr/bin/env node
// WorldAxis tests/refine-bridge-v2592.js — 档案精编落地面专锁（v2.592.0 / RFA-1）
//
// 锁的是「档案能省几条」这件事可被回答，不是「多一个按钮」。五组：
//
//   A 静态契约：新文件在位、导出齐全、**零写口**（不建事务 / 不落盘）、**零 settings**（不造第二份开关）、
//      **真委托 refine**（不重写三个变换）、两处装载表同批且排在 refine 之后、两处页面接线。
//   B 现场读数：三源都在、总数与逐源求和一致、超长条数独立复算一致、可省条数不会超过原数。
//   C 判读语义（桩）：重复项真去重、**键不参与去重**（只收正文）、空源不冒充「干净」、
//      refine 缺失 / 总开关关着各报自己的原因。
//   D 零写纪律：运行期 store.setItem 被调 0 次、扫描前后档案条数不变、stat 不触发新扫描。
//   E 页面纪律：段落标题写明「只预览，不删一条」；四种状态（未装 / 不可用 / 报错 / 正常）分得开；
//      **不进注入面**（0 处 buildBlock / 0 处 render/inject 命中）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/** 桩：把 store.get 换成一份固定状态，并数 setItem 被调几次；跑完逐字还原。 */
function withState(WA, st, fn) {
  const S = WA.store;
  const oGet = S.get, oSet = S.setItem;
  let writes = 0;
  try {
    S.get = function () { return st; };
    S.setItem = function () { writes++; return { ok: true, backend: 'stub' }; };
    const out = fn() || {};
    out.__writes = writes;
    return out;
  } finally {
    S.get = oGet; S.setItem = oSet;
  }
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位（本锁必须跑在真产品上）');
  const B = WA.refineBridge;
  a(!!B, 'A0b: WA.refineBridge 在位');
  if (!B) return { total: 0 };

  const engRel = 'engines/refine-bridge.js';
  const engSrc = fs.readFileSync(path.join(ROOT, engRel), 'utf8');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(ROOT, 'ui/panel.js'), 'utf8');
  const injSrc = fs.readFileSync(path.join(ROOT, 'render/inject.js'), 'utf8');
  const cnt = function (s, n) { return String(s).split(n).length - 1; };
  // 计数只算**代码面**：头注里列了那四个写口的名字（「本文件 0 处 transact( …」），
  //   把注释也算进去就会把「零写口」这条自证变成「不许写说明」—— 那不是判据要问的事。
  const codeOf = function (src) {
    return src.split(String.fromCharCode(10)).filter(function (l) {
      const t = l.trim();
      return !(t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0);
    }).join(String.fromCharCode(10));
  };
  const engCode = codeOf(engSrc);

  // ── A 静态契约 ──────────────────────────────────
  a(B.VERSION === '2.592.0', 'A1: 引擎版本 2.592.0（实 ' + B.VERSION + '）');
  var exp = ['VERSION', 'SOURCE_IDS', 'scan', 'view', 'summaryText', 'diagnose', 'stat', '__reset'];
  a(exp.every(function (k) { return B[k] !== undefined; }) && Object.keys(B).length === exp.length,
    'A2: 导出恰好八个（实 ' + Object.keys(B).join(',') + '）');
  a(B.SOURCE_IDS.join(',') === 'worldFacts,memoryFacts,chronicle',
    'A3: 三源顺序固定（实 ' + B.SOURCE_IDS.join(',') + '）');
  const WRITES = ['transact(', 'store.patch(', 'setItem(', 'localStorage.', 'saveOrThrow('];
  WRITES.forEach(function (w, i) {
    a(cnt(engCode, w) === 0, 'A4' + 'abcd'[i] + ': 引擎里 0 处 `' + w + '`（零写口，实 ' + cnt(engCode, w) + '）');
  });
  a(cnt(engSrc, '__settingsRegs') === 0 && cnt(engSrc, 'settingsBus') === 0,
    'A5: 零 settings —— 不造第二份开关（阈值读 refine 自己的）');
  a(cnt(engSrc, 'R.merge(') >= 1 && cnt(engSrc, 'R.condense(') >= 1 && cnt(engSrc, 'WA.refine') >= 1,
    'A6: 真委托 refine.merge / refine.condense（不重写算法）');
  a(cnt(engSrc, 'normOne') === 0 && cnt(engSrc, 'replace(/[\u0000') === 0,
    'A7: 引擎里 0 处正则清洗实现（normalize 的细节不在本文件拄一份）');
  a(cnt(engSrc, 'buildBlock') === 0 && cnt(injSrc, 'refineBridge') === 0,
    'A8: 不产注入块、注入面 0 处命中（它管的是档案读数，不是本轮该让模型看到什么）');
  a(cnt(idxSrc, "'engines/refine-bridge.js'") === 1 && cnt(runSrc, "'engines/refine-bridge.js'") === 1,
    'A9: 两处装载表各登一条（index.js + tests/run.js）');
  a(idxSrc.indexOf("'engines/refine-bridge.js'") > idxSrc.indexOf("'engines/refine.js'"),
    'A9b: index.js 里排在 refine.js **之后**（供者先装）');
  a(toolsSrc.indexOf("'refine'") >= 0 && toolsSrc.indexOf('wa-rfa-scan') >= 0 && toolsSrc.indexOf('wa-rfa-out') >= 0,
    'A10: 工具页三件（段 id / 按钮 / 输出区）齐');
  a(panelSrc.indexOf("on('#wa-rfa-scan'") >= 0, 'A11: bind 分支在位');

  // ── B 现场读数 ──────────────────────────────────
  B.__reset();
  const r = B.scan();
  a(!!r && r.ok === true, 'B1: 扫描成功（实 ' + (r && (r.ok || r.reason)) + '）');
  a(!!r && r.sources.length === 3, 'B1b: 三源都出现在读数里（实 ' + (r && r.sources.length) + '）—— 某源抛错不许静默消失');
  const sumOf = function (k) { return r.sources.reduce(function (n, s) { return n + (s[k] || 0); }, 0); };
  a(r.totals.raw === sumOf('raw') && r.totals.kept === sumOf('kept') && r.totals.dropped === sumOf('dropped')
    && r.totals.long === sumOf('long'),
    'B2: 总数 = 逐源求和（raw ' + r.totals.raw + ' / kept ' + r.totals.kept
    + ' / dropped ' + r.totals.dropped + ' / long ' + r.totals.long + '）');
  a(r.sources.every(function (s) { return s.kept + s.dropped <= s.raw; }),
    'B2b: 每源 kept + dropped ≤ raw（可省不能比原数还多）');
  // 独立复算：引擎自己报的「超长几条」要能用 refine.merge 当场算回来
  {
    const s = WA.store.get() || {};
    const texts = (Array.isArray(s.worldFacts) ? s.worldFacts : [])
      .map(function (x) { return x && typeof x.value === 'string' ? x.value : ''; })
      .filter(function (v) { return v; });
    const m = WA.refine.merge(texts);
    const cap = r.maxLen;
    const long = m.rows.filter(function (t) { return t.length > cap; }).length;
    const src = r.sources.filter(function (x) { return x.id === 'worldFacts'; })[0];
    a(!!src && src.long === long, 'B3: 超长条数与现场复算一致（引擎 '
      + (src && src.long) + ' / 复算 ' + long + '，上限 ' + cap + '）');
    a(!!src && src.raw === texts.length, 'B3b: 原条数与现场数一致（'
      + (src && src.raw) + ' / ' + texts.length + '）');
  }
  a(B.view().why === (r.totals.raw > 0 ? 'ok' : 'no-archive'),
    'B4: view.why 随现场变（实 ' + B.view().why + '，raw ' + r.totals.raw + '）');
  a(typeof B.summaryText() === 'string' && B.summaryText().indexOf('档案精编') === 0,
    'B4b: summaryText 以「档案精编」开头（面板读的就是这一句）');

  // ── C 判读语义（桩）────────────────────────────
  {
    const st = { worldFacts: [{ key: 'a', value: '同一条设定' }, { key: 'a', value: '同一条设定' }], memory: { facts: [] }, chronicle: [] };
    const out = withState(WA, st, function () { return { s: B.scan() }; });
    const w = out.s.sources.filter(function (x) { return x.id === 'worldFacts'; })[0];
    a(!!w && w.raw === 2 && w.kept === 1 && w.dropped === 1,
      'C1: 两条完全相同的事实真去重（raw 2 → kept ' + (w && w.kept) + '）');
  }
  {
    // 口径 2 的核心：键不参与去重。两条 key 完全相同但正文不同 ⇒ dropped 必须为 0
    //   （把键拿去去重的实现在这里会立刻变红）。
    const st = { worldFacts: [{ key: 'same', value: '甲的设定' }, { key: 'same', value: '乙的设定' }], memory: { facts: [] }, chronicle: [] };
    const out = withState(WA, st, function () { return { s: B.scan() }; });
    const w = out.s.sources.filter(function (x) { return x.id === 'worldFacts'; })[0];
    a(!!w && w.raw === 2 && w.kept === 2 && w.dropped === 0,
      'C2: 键相同但正文不同不得被并（dropped ' + (w && w.dropped) + '）—— 只收正文不收键');
  }
  {
    const st = { worldFacts: [], memory: { facts: [] }, chronicle: [] };
    const out = withState(WA, st, function () { return { v: B.view(), t: B.summaryText() }; });
    a(out.v.why === 'no-archive', 'C3: 三源全空时 why=no-archive（实 ' + out.v.why + '）');
    a(out.t.indexOf('均为空') >= 0 && out.t.indexOf('不是「已经很干净」') >= 0,
      'C3b: 一行读数写「均为空」并逐字否认「已经很干净」（空 ≠ 干净；实 ' + out.t);
  }
  {
    // 缺补：chronicle 用 summary 不用 value —— 拿错字段会让这个源永远为空而看不出来。
    const st = { worldFacts: [], memory: { facts: [] }, chronicle: [{ id: 'c1', summary: '一件事', title: '不当正文用' }] };
    const out = withState(WA, st, function () { return { s: B.scan() }; });
    const c = out.s.sources.filter(function (x) { return x.id === 'chronicle'; })[0];
    a(!!c && c.raw === 1, 'C3c: 纪事源收 summary（实 ' + (c && c.raw) + '）');
  }
  {
    // refine 缺失 ⇒ module-missing（不拿 0 条冒充「已干净」）
    const o = WA.refine;
    try {
      WA.refine = undefined;
      const r2 = B.scan();
      a(r2.ok === false && r2.reason === 'module-missing', 'C4: refine 缺失时报 module-missing（实 ' + r2.reason + '）');
      a(B.summaryText() === '', 'C4b: 不可编时 summaryText 返回空串（不拿一句假读数填上）');
    } finally { WA.refine = o; }
  }
  {
    // 总开关关着 ⇒ `disabled`（与「已经很干净」必须分得开；用本仓既有码，不编新码）
    const o = WA.refine;
    try {
      WA.refine = { getSettings: function () { return { enabled: false, maxLen: 120 }; },
        merge: o.merge, condense: o.condense };
      const r3 = B.scan();
      a(r3.ok === false && r3.reason === 'disabled', 'C5: 总开关关着报既有码 disabled（实 ' + r3.reason + '）');
      const d = B.diagnose();
      a(d.indexOf('总开关关着') >= 0, 'C5b: 诊断面直接写出原因而不是空表');
    } finally { WA.refine = o; }
  }
  {
    const st = { worldFacts: [null, { key: 'k' }, { key: 'k2', value: '' }, { key: 'k3', value: '真的正文' }],
      memory: { facts: [] }, chronicle: [] };
    const out = withState(WA, st, function () { return { s: B.scan() }; });
    const w = out.s.sources.filter(function (x) { return x.id === 'worldFacts'; })[0];
    a(!!w && w.raw === 1 && w.skipped >= 3, 'C6: 非字符串 / 空串逐项跳过并计数（raw ' + (w && w.raw)
      + ' / skipped ' + (w && w.skipped) + '）—— 不整批拒');
  }

  // ── D 零写纪律 ──────────────────────────────────
  {
    const st = { worldFacts: [{ key: 'a', value: 'x' }, { key: 'a', value: 'x' }], memory: { facts: [] }, chronicle: [] };
    let before = null, after = null;
    const out = withState(WA, st, function () {
      before = JSON.stringify(st.worldFacts);
      B.scan(); B.view(); B.diagnose();
      after = JSON.stringify(st.worldFacts);
      return {};
    });
    a(before === after, 'D1: 扫描 / 读数 / 诊断三路走完，档案原文逐字未变');
    a(out.__writes === 0, 'D2: 整路归零写：store.setItem 被调 ' + out.__writes + ' 次（要求 0）');
  }
  {
    B.__reset();
    a(B.stat().scans === 0 && B.stat().last === null,
      'D3: __reset 后 scans=0 且 last=null（「没扫过」与「扫出 0 条」是两件事）');
    B.scan(); B.scan();
    a(B.stat().scans === 2, 'D3b: stat 不触发新扫描（两次 scan ⇒ scans=2，实 ' + B.stat().scans + '）');
    a(B.stat().last && typeof B.stat().last.raw === 'number', 'D3c: stat.last 是上一次扫描的摘要（不是另算一套）');
  }

  // ── E 页面纪律 ──────────────────────────────────
  a(toolsSrc.indexOf('只预览，不删一条') >= 0, 'E1: 段落标题写明「只预览，不删一条」');
  a(toolsSrc.indexOf('未装载') >= 0 && toolsSrc.indexOf('读数不可用') >= 0
    && toolsSrc.indexOf('读数抛错') >= 0,
    'E2: 四种状态（未装 / 不可用 / 抛错 / 正常）在读数行里分得开');
  a(panelSrc.indexOf('本面不做') >= 0, 'E3: bind 分支里写明「本面不做落盘」');
  a(cnt(toolsSrc, 'wa-rfa-scan') === 1, 'E4: 按钮 id 全页只出现一次（实 ' + cnt(toolsSrc, 'wa-rfa-scan') + '）');
  a(cnt(injSrc, 'refineBridge') === 0 && cnt(injSrc, 'refine-bridge') === 0,
    'E5: 注入面零命中（不占 token：它是读数面，不是每轮必须注入的世界状态）');

  const fin = B.scan();
  return { raw: fin.totals.raw, kept: fin.totals.kept, dropped: fin.totals.dropped, long: fin.totals.long };
}

module.exports = { runAll: runAll };
