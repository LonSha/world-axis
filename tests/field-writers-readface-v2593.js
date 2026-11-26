#!/usr/bin/env node
// WorldAxis tests/field-writers-readface-v2593.js — 写权表的读面专锁（v2.593.0 / R268 FWR-1）
//
// 锁的是「同一字段谁写、谁覆盖谁」这件事终于在界面上可读，不是「多一段 HTML」。四组：
//
//   A 静态契约：工具页真读 `WA.fieldWriters.view()`（不自己另算一份）、决不不可读两条分支都写明、该段 0 处写口。
//   B 现场语义：四数与逐字段求和一致、冲突数与 conflicts() 同源、**未登记的真冲突 = 0**、
//      责任方必在该字段写者名单里、mode 在封闭三值里。
//   C 渲染：真渲染一次工具页，读数行与逐字段行真出现（并不降级成空）。
//   D 反空转：模块缺失 / 读数抛错 各自报自己的原因，不拿空表冒充；还原后读数又回来（两向自证）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/** 真渲染一次工具页：bind 的两个工具与 ui/panel.js:3288 同形（esc 原样返回 / foldSec 展开）。 */
function render(WA) {
  WA.panelToolsPage.bind({
    esc: function (s) { return String(s == null ? '' : s); },
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const FW = WA.fieldWriters;
  a(!!FW, 'A0b: WA.fieldWriters 在位');
  if (!FW) return { fields: 0 };

  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const i = toolsSrc.indexOf("'writers'");
  a(i >= 0, 'A1: 工具页有 writers 段');
  const seg = i >= 0 ? toolsSrc.slice(i, i + 2400) : '';
  a(seg.indexOf('WA.fieldWriters') >= 0 && seg.indexOf('fw.view()') >= 0,
    'A2: 读数真委托 WA.fieldWriters.view()（面板不另算一份写权表）');
  a(seg.indexOf('本面只读') >= 0, 'A3: 段内写明「本面只读」');
  a(seg.indexOf('transact(') < 0 && seg.indexOf('setItem(') < 0 && seg.indexOf('store.patch(') < 0,
    'A4: 该段 0 处写口（看写权不等于改写权）');
  a(seg.indexOf('未装载') >= 0 && seg.indexOf('读数抛错') >= 0,
    'A5: 两条不可读分支（未装载 / 抛错）各自写明原因');

  // ── B 现场语义 ──────────────────────────────
  const v = FW.view();
  const st = v.stat;
  a(Array.isArray(v.fields) && v.fields.length === st.fields,
    'B1: view().fields 长度 = stat.fields（' + v.fields.length + ' / ' + st.fields + '）');
  const sumW = v.fields.reduce(function (n, f) { return n + f.writers.length; }, 0);
  a(sumW === st.writers, 'B2: st.writers = 逐字段写者数之和（' + sumW + ' / ' + st.writers + '）');
  const cs = FW.conflicts();
  a(cs.filter(function (c) { return c.conflicts; }).length === st.conflicted,
    'B3: 冲突数与 conflicts() 同源（' + st.conflicted + '）');
  a(FW.undeclaredConflicts().length === st.undeclared, 'B3b: 未登记冲突数同源（' + st.undeclared + '）');
  a(st.undeclared === 0,
    'B4: **未登记的真冲突 = 0**（实 ' + st.undeclared + '）—— 真冲突要么治好、要么登记在案');
  a(cs.every(function (c) { return !c.conflicts || c.declared; }),
    'B4b: 每个真冲突字段都已登记待治理（没有默默存在的）');
  const M = ['append', 'merge', 'overwrite'];
  a(v.fields.every(function (f) { return f.writers.every(function (w) { return M.indexOf(w.mode) >= 0; }); }),
    'B5: 每个写者的 mode 都在封闭三值里（append / merge / overwrite）');
  a(v.fields.every(function (f) { return f.writers.some(function (w) { return w.file === f.owner; }); }),
    'B6: 每个字段的责任方都在该字段写者名单里（责任方不是旁观者）');
  a(v.fields.every(function (f) {
    const w = FW.writersOf(f.field);
    const local = f.writers.map(function (x) { return x.file; }).sort();
    return w.join(',') === local.join(',');
  }), 'B7: writersOf() 与 view() 逐字段写者集完全相等（两个出口同一份真源）');
  a(v.fields.every(function (f) { return !!FW.entryOf(f.field); }), 'B8: entryOf() 对每个字段都能命中');
  a(FW.entryOf('__no_such_field__') === null, 'B8b: entryOf() 对不存在的字段返 null（不猜）');

  // ── C 渲染 ──────────────────────────────────
  const html = render(WA);
  a(html.indexOf('字段写权与覆盖冲突') >= 0, 'C1: 段落真渲染出来了');
  a(html.indexOf('共 ' + st.fields + ' 个字段 / ' + st.writers + ' 个写者') >= 0,
    'C2: 读数行是现场数（' + st.fields + ' / ' + st.writers + '），不是写死字');
  a(html.indexOf('真冲突 ' + st.conflicted + '（已登记 ' + st.declared + ' · 未登记 ' + st.undeclared + '）') >= 0,
    'C3: 三个冲突数都在页面上（不只报真冲突、不隐藏未登记）');
  const multi = v.fields.filter(function (f) { return f.overwriters.length >= 2; });
  a(multi.length > 0 && multi.every(function (f) { return html.indexOf('⚠ ' + f.overwriters.length + ' 个覆盖型') >= 0; }),
    'C4: 每个多个覆盖型字段都加了 ⚠ 标记（' + multi.length + ' 个）');
  a(html.indexOf('已登记待治理') >= 0, 'C5: 「已登记待治理」在页面上可见');
  a(html.indexOf('本面只读') >= 0, 'C6: 页面自己写明读不等于改');

  // ── D 反空转 ───────────────────────────────
  {
    const o = WA.fieldWriters;
    try {
      WA.fieldWriters = undefined;
      const h = render(WA);
      a(h.indexOf('字段写权表未装载') >= 0 && h.indexOf('共 ' + st.fields + ' 个字段') < 0,
        'D1: 模块缺失时页面报「未装载」，不拿空表冒充');
    } finally { WA.fieldWriters = o; }
    try {
      WA.fieldWriters = { view: function () { throw new Error('boom'); } };
      const h2 = render(WA);
      a(h2.indexOf('读数抛错') >= 0, 'D2: 读数抛错时页面报原因，不静默当成空');
    } finally { WA.fieldWriters = o; }
    const h3 = render(WA);
    a(h3.indexOf('共 ' + st.fields + ' 个字段') >= 0,
      'D3: 还原后读数又回来（前两条不是恒假——两向自证）');
  }

  return { fields: st.fields, writers: st.writers, conflicted: st.conflicted, undeclared: st.undeclared };
}

module.exports = { runAll: runAll };
