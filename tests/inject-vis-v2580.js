#!/usr/bin/env node
// WorldAxis tests/inject-vis-v2580.js —— 注入可见性「无死开关」行为锁（v2.58.0）
//
// 【它治的病】本仓的「开关点了零效果」已出现过三次，每次都只修了**症状所在的那个源**：
//   · v2.38.0：`echoes` 在 SOURCES 与面板里都有，但 `buildWorldSnapshot` 从无对应分支
//     ⇒ 开关开/关产物**逐字节相同**；
//   · v2.38.0 同版：账本/世界推演此前**不在 SOURCES 内** ⇒ 关掉所有源仍注入；
//   · v2.56.0：`life/intel/org/longline` 四条注入分支**只判模块在不在、不读开关**，
//     且**根本没登记进 SOURCES** ⇒ 面板上连开关都没有。
//   三次都是「逐例治」——没有一条判据回答**成类问题**：SOURCES 里的每一项，开关动一下
//   产物是否真的跟着动？本锁把它变成对**全部源逐个**可执行的判据。
//
// 【判据】
//   A  面板复选框集合 == SOURCES（源表新增而面板不渲染 ⇒ 用户点不到这个开关）。
//   B  真实点击该复选框 → getVisibility() 跟随（UI 绑定真接通，不是只画了个框）。
//   C  对 SOURCES **每一项**：开关关 → 产物中不含该源的产出；开 → 含。
//      产物面按源的种类取：快照类（clock/pulse/background/people/currents/echoes）读
//      `buildWorldSnapshot()`；独立注入项读 `applyInjections` 落进宿主的扩展提示词。
//      消费的方法名由**探测**得出（模块现有哪个取数口），不写死清单——
//      写死清单就是「新增源时锁不知道」，与本锁要治的病同型。
//   D  覆盖度前提：至少判到 15 个源（SOURCES 全量），否则判据在子集上恒真。
//
// 【判据纯度与两向自证】
//   · 用**哨兵文本**（<<SENT-xxx>>）替代模块真实产出，使「产物含不含」与业务语义无关——
//     判的是**注入链的开关**，不是某个模块的文案。
//   · 负控制以「真源码破坏 → 装上破坏副本 → 重跑**同款**判据」自证：
//     把 `vis.life && WA.life` 还原成 `WA.life`（即 v2.56.0 之前的真实缺陷形态），
//     要求 C 面在 life 上报红；原版上同款判据仍为绿。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// 快照类源：它们的产物在 <world_axis_state> 里，由 buildWorldSnapshot 组装
const SNAPSHOT_SOURCES = {
  clock: 'TOKCLOCK', pulse: 'TOKPULSE', background: 'TOKBG',
  people: 'TOKPEOPLE', currents: 'TOKCURRENT', echoes: 'TOKECHO'
};
// 独立注入项里方法名不是 buildBlock 的源（其余一律探测 buildBlock）
const ITEM_METHOD = { memory: 'buildMemoryBlock', opinion: 'buildOpinionBlock', ledger: 'buildLedgerText' };

function seedStore(WA) {
  WA.store.transact(function (d) {
    d.clock = d.clock || {}; d.clock.label = 'TOKCLOCK 第1日';
    d.worldPulse = { pressure: 2, trend: 'rising', note: 'TOKPULSE' };
    d.background = d.background || {}; d.background.text = 'TOKBG 世界背景';
    d.people = d.people || {};
    d.people.p_tok = { name: 'TOKPEOPLE', location: 'TOKPEOPLE城', action: 'TOKPEOPLE行' };
    d.currents = [{ id: 'c_tok', title: 'TOKCURRENT', visibility: 'open' }];
    d.echoes = [{ id: 'e_tok', refCurrent: 'TOKCURRENT', result: 'TOKECHO', exposure: 'obvious', at: 1 }];
  });
}

/** 该源在注入链上的取数口（探测得出，不写死清单） */
function methodOf(WA, k) {
  if (ITEM_METHOD[k]) return { mod: WA[k], method: ITEM_METHOD[k] };
  if (WA[k] && typeof WA[k].buildBlock === 'function') return { mod: WA[k], method: 'buildBlock' };
  return null;
}

function snapshotText(WA) { try { return String(WA.render.buildWorldSnapshot() || ''); } catch (e) { return '<<ERROR:' + e.message + '>>'; } }
function injectText(WA) {
  try {
    global.__lastExtensionPrompt = null;
    WA.render.applyInjections({ injections: [] });
    return String((global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '');
  } catch (e) { return '<<ERROR:' + e.message + '>>'; }
}

/** 对全部源跑「开关真生效」判据；返回逐源结果 */
function probeAll(WA) {
  const sources = (WA.render.SOURCES || []).slice();
  seedStore(WA);
  const out = [];
  sources.forEach(function (k, idx) {
    const tag = '<<SENT-' + k + '>>';
    if (SNAPSHOT_SOURCES[k]) {
      const tok = SNAPSHOT_SOURCES[k];
      if (k === 'clock') { WA.store.transact(function (d) { d.clock.label = tok; }); }
      if (k === 'pulse') { WA.store.transact(function (d) { d.worldPulse.note = tok; }); }
      if (k === 'background') { WA.store.transact(function (d) { d.background.text = tok; }); }
      if (k === 'people') { WA.store.transact(function (d) { d.people.p_tok.name = tok; d.people.p_tok.location = tok + '城'; d.people.p_tok.action = tok + '行'; }); }
      if (k === 'currents') { WA.store.transact(function (d) { d.currents = [{ id: 'c_tok', title: tok, visibility: 'open' }]; }); }
      if (k === 'echoes') { WA.store.transact(function (d) { d.echoes = [{ id: 'e_tok', refCurrent: 'x', result: tok, exposure: 'obvious', at: 1 }]; }); }
      WA.render.setVisibility(k, true); const on = snapshotText(WA);
      WA.render.setVisibility(k, false); const off = snapshotText(WA);
      out.push({ source: k, kind: 'snapshot', tok: tok, on: on.indexOf(tok) >= 0, off: off.indexOf(tok) >= 0 });
      return;
    }
    const m = methodOf(WA, k);
    if (!m) { out.push({ source: k, kind: 'no-producer', skipped: true }); return; }
    const keep = m.mod[m.method];
    m.mod[m.method] = function () { return tag; };
    try {
      WA.render.setVisibility(k, true); const on = injectText(WA);
      WA.render.setVisibility(k, false); const off = injectText(WA);
      out.push({ source: k, kind: 'item', tok: tag, on: on.indexOf(tag) >= 0, off: off.indexOf(tag) >= 0 });
    } finally { m.mod[m.method] = keep; }
  });
  return out;
}

/** A 面：面板复选框集合 == SOURCES */
function panelCheckboxSet() {
  const gate = require('./ui-gate-sync.js');
  const env = gate.fresh();
  const WA = env.WA, dom = env.dom;
  const panel = dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'director'; })[0];
  if (!tab) throw new Error('判据失效：找不到 director 页签（可见性复选框所在页）');
  tab.click();
  const boxes = panel.querySelectorAll('[data-vis]');
  return { WA: WA, boxes: boxes, ids: boxes.map(function (b) { return b.dataset.vis; }) };
}

function runAll(a) {
  const gate = require('./ui-gate-sync.js');
  const p = panelCheckboxSet();
  const sources = (p.WA.render.SOURCES || []).slice();
  // A 面
  const missing = sources.filter(function (k) { return p.ids.indexOf(k) < 0; });
  const extra = p.ids.filter(function (k) { return sources.indexOf(k) < 0; });
  a(p.ids.length > 0 && missing.length === 0, 'v2580: [A] 面板为 SOURCES 每项渲染了复选框（缺: ' + (missing.join(',') || '无') + '）');
  a(extra.length === 0, 'v2580: [A] 面板无多余复选框（多: ' + (extra.join(',') || '无') + '）');
  // B 面：真实点击 → 落盘
  const box = p.boxes.filter(function (b) { return b.dataset.vis === 'life'; })[0] || p.boxes[0];
  if (box) {
    const before = p.WA.render.getVisibility()[box.dataset.vis];
    box.checked = !before;
    if (typeof box.onchange === 'function') box.onchange({ target: box });
    const after = p.WA.render.getVisibility()[box.dataset.vis];
    a(after === !before, 'v2580: [B] 面板复选框点击真落盘（' + box.dataset.vis + ' ' + before + '→' + after + '）');
  } else { a(false, 'v2580: [B] 面板无任何可见性复选框（无法验证点击落盘）'); }
  // C 面：逐源开关真生效
  const env2 = gate.fresh();
  const rows = probeAll(env2.WA);
  const judged = rows.filter(function (r) { return !r.skipped; });
  a(judged.length >= 15, 'v2580: [D] 判到 ' + judged.length + ' 个源（≥15：SOURCES 全量，判据不在子集上恒真）');
  const notOn = judged.filter(function (r) { return !r.on; });
  const stillOff = judged.filter(function (r) { return r.off; });
  a(notOn.length === 0, 'v2580: [C] 开关开时每个源的产出都真的进了产物（缺: ' + (notOn.map(function (r) { return r.source; }).join(',') || '无') + '）');
  a(stillOff.length === 0, 'v2580: [C] 开关关时每个源的产出都真的消失（残留: ' + (stillOff.map(function (r) { return r.source; }).join(',') || '无') + '）');
  if (rows.some(function (r) { return r.skipped; })) {
    console.log('  ⓘ v2580: 无取数口而跳过的源：' + rows.filter(function (r) { return r.skipped; }).map(function (r) { return r.source; }).join(','));
  }
}

/** 负控制：真源码破坏 → 破坏副本上重跑同款 C 面判据 */
function runNegative(a) {
  const gate = require('./ui-gate-sync.js');
  const src = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
  const ANCHOR = 'vis.life && WA.life';
  const n = src.split(ANCHOR).length - 1;
  a(n === 1, 'v2580: [N1] 负控制锚点在真源码中恰中 1 次（实 ' + n + ' 次）');
  const broken = src.replace(ANCHOR, 'WA.life');
  a(broken !== src, 'v2580: [N2] 破坏确实发生（源守卫退回「只判模块在不在」）');
  const envB = gate.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken } });
  const rowsB = probeAll(envB.WA);
  const lifeB = rowsB.filter(function (r) { return r.source === 'life'; })[0];
  a(lifeB && lifeB.off === true, 'v2580: [N3] 破坏后 C 面现形（life 开关关了、产出仍在）');
  const envOk = gate.fresh();
  const rowsOk = probeAll(envOk.WA);
  const lifeOk = rowsOk.filter(function (r) { return r.source === 'life'; })[0];
  a(lifeOk && lifeOk.off === false && lifeOk.on === true, 'v2580: [N4] 原版上同款判据仍成立（双向自证：不是把判据写死）');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name, extra) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  runAll(a);
  runNegative(a);
  if (fail) { console.log('INJECT-VIS-V2580: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('INJECT-VIS-V2580: pass（' + pass + ' 项）');
}

module.exports = { runAll: runAll, runNegative: runNegative, probeAll: probeAll, methodOf: methodOf, SNAPSHOT_SOURCES: SNAPSHOT_SOURCES, ITEM_METHOD: ITEM_METHOD };