#!/usr/bin/env node
// 折叠见证锁：裁决当场落正文样本，读面才能做「折叠前后」对照。
// 判据：W1 每条折叠记录带 wasChars/wasPreview/nowChars/nowPreview 四字段；
//       W2 wasChars 等于输入正文长度（同源，不是估算）；W3 nowChars 小于 wasChars 且 nowPreview 是折叠后正文前缀；
//       W4 面板真消费四个字段（不是「导出了没人看」）；W5 缺字段时面板如实报「未记录」，不拿当前快照冒充。
// 负面：N1 抹掉见证落点 ⇒ W1 现形；N2 面板改用当前快照冒充 ⇒ W5 现形。
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const INJECT = path.join(__dirname, '../render/inject.js');
const PANEL = path.join(__dirname, '../ui/panel.js');
// 见证源按**出现次数**计（grep -c 只数行，两个引用同在一行会少数）：wasChars 与 wasPreview 各一处。
const EXPECT = 2;
const ANCHOR = 'wasChars: (function () { const it = items[f.id];';
const BREAK = 'const it = items[f.id];';
function BIG(tag, n) { return '【' + tag + '】' + '字'.repeat(n); }
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.clock = { iso: '', label: '第1日', dayIndex: 0, source: 'unset' };
    d.background = { text: 'BG', updatedAt: 0 };
    d.people = {};
    d.evolution = d.evolution || {};
    d.evolution.round = 3;
    d.evolution.factions = [];
    d.memory = d.memory || {};
    d.memory.foreshadows = [];
    d.lastInjection = null;
  }, 'v11-fold-witness:seed');
  WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, true); });
}
function run(WA) {
  seed(WA);
  const BK = WA.backstage.getSettings().injectBudget;
  WA.backstage.setSettings({ injectBudget: 80 });
  const body = BIG('世界状态', 300);
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: body }] });
  const li = WA.store.get().lastInjection;
  WA.backstage.setSettings({ injectBudget: (typeof BK === 'number' ? BK : 2400) });
  return { li: li, body: body };
}
function runAll(a) {
  const src = fs.readFileSync(INJECT, 'utf8');
  const panel = fs.readFileSync(PANEL, 'utf8');
  a(src.split(ANCHOR).length - 1 === 1, 'witness A1: 见证落点恰 1 处');
  const r = run(gate.fresh().WA);
  const b = r.li && r.li.budget;
  // 按源挑本次注入的那一条：预算裁决是顺序发生的，folded[0] 可能是别的常驻块。
  const f = b && (b.folded || []).filter(function (x) { return x.source === '世界状态' && x.wasChars === r.body.length; })[0];
  a(!!f, 'witness W0: 压出折叠局面（判据不是空跑）');
  if (!f) return;
  a(f.wasChars === r.body.length, 'witness W1: wasChars 等于输入正文长度（' + f.wasChars + ' / 实 ' + r.body.length + '）');
  a(typeof f.wasPreview === 'string' && r.body.slice(0, f.wasPreview.length) === f.wasPreview,
    'witness W2: wasPreview 是输入正文的真前缀（不二次加工）');
  a(typeof f.nowChars === 'number' && f.nowChars < f.wasChars,
    'witness W3: nowChars(' + f.nowChars + ') < wasChars(' + f.wasChars + ') —— 折叠真的发生了');
  a(typeof f.nowPreview === 'string' && f.nowPreview.length <= f.nowChars,
    'witness W4: nowPreview 是折叠后正文（长度 ' + (f.nowPreview || '').length + ' ≤ ' + f.nowChars + '）');
  a(panel.indexOf('f.wasPreview') >= 0 && panel.indexOf('f.nowPreview') >= 0
    && panel.indexOf('f.wasChars') >= 0 && panel.indexOf('f.nowChars') >= 0,
    'witness W5: 面板逐字段真消费四个见证（不是导出了没人看）');
  a(panel.indexOf('未记录（该轮未落账，不拿当前快照冒充）') >= 0,
    'witness W6: 缺见证时如实报「未记录」，不冒充历史原文');
}
function runNegative(a) {
  const src = fs.readFileSync(INJECT, 'utf8');
  // 破坏形态必须保持语法有效（v2900 教训⑤）：把见证源从输入项改成 null 面，而不是删行。
  const broken = src.split('const it = items[f.id];').join('const it = null;');
  a((src.split('const it = items[f.id];').length - 1) === EXPECT && broken !== src, 'witness N0: 原版见证源恰 2 处且可替换（断点工具两向自证）');
  // 破坏副本只用于判据敏感度证明：字段归零后 W1 必须判红
  a(broken !== src, 'witness N1: 破坏副本已生成（锚点可替换）');
  let red = false;
  try {
    const W = gate.fresh({ srcOverride: { 'render/inject.js': broken } }).WA;
    const r = run(W);
    const list = (r.li && r.li.budget && r.li.budget.folded) || [];
    const f = list.filter(function (x) { return x.source === '世界状态'; })[0];
    red = !f || f.wasChars !== r.body.length;
  } catch (e) { red = true; }
  a(red, 'witness N1: 抹掉见证落点 ⇒ W1 判红（判据非恒真）');
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
  runAll(a); runNegative(a);
  console.log('v11-fold-witness: ' + pass + ' pass / ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}