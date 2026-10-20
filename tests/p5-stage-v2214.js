// WorldAxis tests/p5-stage-v2214.js — Q5 专锁：视角**先过滤、后渲染**（staged 出口）
// 治的病（Q5 原文）：此前渲染链「先写 DOM、再摘除」——全知内容真实进入过 DOM 才被
//   applyView 摘掉；检索 / 图谱动态出口则完全没有过滤。本锁验证 v2.214.0 的 stageOut：
//   HTML 先在脱离文档的 stage 容器解析 → applyView 过滤 → 真节点才迁移进目标 DOM。
// 【正向】
//   P1 全知视角 overview 页 omni 节点保留（staged 不丢内容）
//   P2 玩家视角最终 DOM 零 omni（qsa 真树判据，不受序列化缓存影响）
//   P3 玩家视角 body 实时序列化不含 omni 标记（ui-dom getter 补丁的消费方）
//   P4 spy：玩家视角切页时 appendChild 进 body 的节点子树零 omni（先过滤后渲染的直接证据）
//   P5 fail-tight：玩家视角 + applyView 抛错 → 纯文本警示 + 零控件（未过滤内容不进 DOM）
//   P6 全知视角 + applyView 抛错 → 内容照常进 DOM（全知无收紧语义）
//   P7 检索 / 图谱动态出口玩家视角有输出且零 omni（同一 staged 闸）
//   P8 结构锚点：renderBody / hsOut / wgOut 各走 stageOut 恰一次；stage 过滤恰一次
// 【负控】N0 锚点各恰中一次；N1 破坏 stagegate → 玩家视角泄漏现形；N2 破坏 failtight →
//   异常放行现形；N2c 原版同判据全绿（两向自证，防恒绿）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const { fresh } = require('./ui-gate-sync.js');
// v2.230.0 收口（本轮修红）：**取证不得改变被取证对象**。
//   本锁为跑 P2/P5/P7 会把观测视角开成 enabled 并切到 player（head() 的 setView），
//   此前跑完**不还原** —— 落盘设置停在 {enabled:true, view:'player'}。
//   后果不是「这一节脏了」，而是**下游所有节**：ui/panel.js 的 renderTools() 整页包在
//   <div data-omniscient> 里，stageOut 在进 DOM 前调 applyView(stage) ⇒ 玩家视角下
//   整个工具页被摘成空壳（实测 27 字符 / 0 控件 / 0 折叠钮）。于是 v2330 的四组标题、
//   v2340 的采样预览、q8 的 C3/C4/C5/C5b/D1 全部连锁变红，而它们与本锁毫无关系。
//   ——「同一把锁独立跑绿、全量跑红」正是这个形态。
//   同批纪律先例：tests/p3-x1-v2149.js 的 probeViews() 末尾显式 setView('omniscient')，
//   并在各探针里成对还原；本锁此前缺的正是这一步。
function keepView() {
  try {
    const pv = global.WorldAxis && global.WorldAxis.perspective;
    if (pv && typeof pv.getSettings === 'function') return JSON.parse(JSON.stringify(pv.getSettings()));
  } catch (e) {}
  return null;
}
function restoreView(snap) {
  try {
    const pv = global.WorldAxis && global.WorldAxis.perspective;
    if (pv && typeof pv.setSettings === 'function' && snap) pv.setSettings(snap);
  } catch (e) {}
}

// ── 破坏锚点：只在真源码里各出现一次 ──
const BROKEN = [
  { key: 'stagegate',
    from: '        WA.perspective.applyView(stage);    // 玩家视角：摘除发生在进 DOM 之前\n',
    to:   '        if (false) WA.perspective.applyView(stage);    // 玩家视角：摘除发生在进 DOM 之前\n' },
  { key: 'failtight',
    from: '    if (fault && view !== \'omniscient\') {\n',
    to:   '    if (false) {\n' }
];

function head(env) {
  const dom = env.dom;
  const panel = dom.getElementById('wa-panel');
  const bodyOf = function () { return panel.querySelector('.wa-body'); };
  const tabOf = function (p) { return panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0]; };
  const sel = panel.querySelector('#wa-view-sel');
  const setView = function (v) {
    // Q5 探针前置：视角锁默认 enabled:false（不落盘不生效）。既有 p3 锁靠落盘往返继承；
    //   本锁每次 fresh 后显式开 enabled，否则玩家视角无摘除语义、P2/P5/P7 判据会假红。
    try { if (env.WA.perspective && typeof env.WA.perspective.setSettings === 'function') env.WA.perspective.setSettings({ enabled: true }); } catch (e) {}
    sel.value = v; if (typeof sel.onchange === 'function') sel.onchange({ target: sel });
    // 玩家档重绘后 body 里的全知节点是「时序上已死、结构上仍在」的旧节点（mini-DOM 无文档级
    //   querySelectorAll 广播，applyView(mainDoc) 兜底摘不到 stage 已挂出的残留）——负控判据
    //   必须以**切页后的新渲染**为泄漏面，而不是初次 setView 的重绘。
    if (v === 'player') tabOf('overview').click();
  };
  const omniIn = function (root) { return root.querySelectorAll('[data-omniscient]').length; };
  return { panel: panel, bodyOf: bodyOf, tabOf: tabOf, sel: sel, setView: setView, omniIn: omniIn, WA: env.WA };
}

function probeStage(env) {
  const h = head(env);
  // P1 全知视角：omni 保留
  h.setView('omniscient');
  h.tabOf('overview').click();
  const omniKept = h.omniIn(h.bodyOf());
  // P2/P3 玩家视角：零 omni + 序列化无标记
  h.setView('player');
  const omniGone = h.omniIn(h.bodyOf());
  const serNoMarker = h.bodyOf().innerHTML.indexOf('data-omniscient') < 0;
  // P4 spy：append 进 body 的节点子树零 omni（先过滤后渲染的直接证据）
  let leaked = 0, appends = 0;
  const body = h.bodyOf();
  const origAppend = body.appendChild;
  body.appendChild = function (c) {
    appends++;
    try { if (c && c.nodeType === 1 && c.querySelectorAll && c.querySelectorAll('[data-omniscient]').length) leaked++; } catch (e) {}
    return origAppend.call(body, c);
  };
  h.tabOf('world').click();
  // P5 fail-tight：玩家 + applyView 抛错 → 纯警示 + 零控件
  const origApply = h.WA.perspective.applyView;
  h.WA.perspective.applyView = function () { throw new Error('q5-probe-boom'); };
  h.tabOf('overview').click();
  const ftWarn = h.bodyOf().textContent.indexOf('观测视角过滤失败') >= 0;
  const ftCtrls = h.bodyOf().querySelectorAll('button,input,select,textarea').length;
  // P6 全知 + 异常 → 照常放行（setView 走真模块口，renderBody 里 applyView 是抛错版）
  h.setView('omniscient');
  const omniLooseCtrls = h.bodyOf().querySelectorAll('button,input,select,textarea').length;
  h.WA.perspective.applyView = origApply;
  // P7 动态出口：检索诊断 / 图谱建图（玩家视角）
  h.setView('player');
  h.tabOf('find').click();
  const diagBtn = h.panel.querySelector('#wa-hs-diag');
  let hsRan = false;
  if (diagBtn && typeof diagBtn.onclick === 'function') { diagBtn.click(); hsRan = true; }
  const hsEl = h.panel.querySelector('#wa-hs-out');
  const hsFilled = hsRan && !!hsEl && hsEl.textContent.trim().length > 0;
  const hsNoOmni = hsEl ? h.omniIn(hsEl) === 0 : false;
  h.tabOf('graph').click();
  const wgBtn = h.panel.querySelector('#wa-wg-build');
  let wgRan = false;
  if (wgBtn && typeof wgBtn.onclick === 'function') { wgBtn.click(); wgRan = true; }
  const wgEl = h.panel.querySelector('#wa-wg-out');
  const wgFilled = wgRan && !!wgEl && wgEl.textContent.trim().length > 0;
  const wgNoOmni = wgEl ? h.omniIn(wgEl) === 0 : false;
  return { omniKept: omniKept, omniGone: omniGone, serNoMarker: serNoMarker, leaked: leaked, appends: appends,
    ftWarn: ftWarn, ftCtrls: ftCtrls, omniLooseCtrls: omniLooseCtrls,
    hsFilled: hsFilled, hsNoOmni: hsNoOmni, wgFilled: wgFilled, wgNoOmni: wgNoOmni };
}

function probeN1(env) { // stagegate 破坏的现形面：玩家视角 omni 是否泄漏
  const h = head(env);
  h.setView('player');
  return { omniGone: h.omniIn(h.bodyOf()) };
}
function probeN2(env) { // failtight 破坏的现形面：玩家 + 异常是否放行
  const h = head(env);
  h.setView('player');
  const origApply = h.WA.perspective.applyView;
  h.WA.perspective.applyView = function () { throw new Error('q5-probe-boom'); };
  h.tabOf('overview').click();
  const r = { ftWarn: h.bodyOf().textContent.indexOf('观测视角过滤失败') >= 0,
    ftCtrls: h.bodyOf().querySelectorAll('button,input,select,textarea').length };
  h.WA.perspective.applyView = origApply;
  return r;
}

function judge(a) {
  const r = probeStage(fresh({}));
  a(r.omniKept >= 1, 'v2214 P1 全知视角 staged 渲染保留 omni 节点（实 ' + r.omniKept + '）');
  a(r.omniGone === 0, 'v2214 P2 玩家视角最终 DOM 零 omni（实 ' + r.omniGone + '）');
  a(r.serNoMarker === true, 'v2214 P3 玩家视角实时序列化不含 omni 标记');
  a(r.appends > 0 && r.leaked === 0, 'v2214 P4 appendChild 迁移零 omni 泄漏（append ' + r.appends + ' / 泄漏 ' + r.leaked + '）——先过滤后渲染的直接证据');
  a(r.ftWarn === true && r.ftCtrls === 0, 'v2214 P5 fail-tight：玩家+过滤异常 → 纯警示零控件（实 ' + r.ftCtrls + '）');
  a(r.omniLooseCtrls > 0, 'v2214 P6 全知+过滤异常 → 内容照常进 DOM（实 ' + r.omniLooseCtrls + ' 控件）');
  a(r.hsFilled === true && r.hsNoOmni === true, 'v2214 P7a 检索动态出口玩家视角有输出零 omni');
  a(r.wgFilled === true && r.wgNoOmni === true, 'v2214 P7b 图谱动态出口玩家视角有输出零 omni');
  // P8 结构锚点（源码面）
  const src = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  a((src.split('stageOut(body, RENDERERS[currentPage]())').length - 1) === 1,
    'v2214 P8a renderBody 走 stageOut 恰一次');
  a((src.split('WA.perspective.applyView(stage)').length - 1) === 1,
    'v2214 P8b stage 容器过滤恰一次');
  a((src.split("$('#wa-hs-out'); if (o) stageOut(o, html)").length - 1) === 1,
    'v2214 P8c hsOut 走 stageOut 恰一次');
  a((src.split("$('#wa-wg-out'); if (o) stageOut(o, html)").length - 1) === 1,
    'v2214 P8d wgOut 走 stageOut 恰一次');
}

function runNegative(a) {
  const __keepNeg = keepView();
  try { return negativeBody(a); } finally { restoreView(__keepNeg); }
}
function negativeBody(a) {
  const src = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  const byKey = {};
  BROKEN.forEach(function (b) {
    const n = src.split(b.from).length - 1;
    a(n === 1, 'v2214 N0 锚点 ' + b.key + ' 恰中一次（实 ' + n + '）');
    byKey[b.key] = { 'ui/panel.js': src.split(b.from).join(b.to) };
  });
  const r1 = probeN1(fresh({ srcOverride: byKey.stagegate }));
  a(r1.omniGone > 0, 'v2214 N1 破坏 stagegate → 玩家视角 omni 泄漏现形（实 ' + r1.omniGone + '）');
  const r2 = probeN2(fresh({ srcOverride: byKey.failtight }));
  a(r2.ftWarn === false || r2.ftCtrls > 0, 'v2214 N2 破坏 failtight → 异常放行现形（警示 ' + r2.ftWarn + ' / 控件 ' + r2.ftCtrls + '）');
  const rc = probeN2(fresh({}));
  a(rc.ftWarn === true && rc.ftCtrls === 0, 'v2214 N2c 原版 fail-tight 判据全绿（两向自证）');
}

function runAll(a) {
  const __keep = keepView();
  try { judge(a); } finally { restoreView(__keep); }
}
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('P5-STAGE-V2214: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('P5-STAGE-V2214: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative };
