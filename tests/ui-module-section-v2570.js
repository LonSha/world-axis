#!/usr/bin/env node
// WorldAxis tests/ui-module-section-v2570.js —— 模块分区分组锁（v2.57.0）
//
// 【缺陷】v2.53.0 把「因果与情报」的控件追加进人物页时，**漏写了它自己的分区标题**
//   （`<div class="wa-sec">因果与情报</div>`），于是 9 个 `wa-intel-*` 控件全部落在
//   前一个 `资源与组织` 分区里：
//     · 用户在面板上看到的是「资源与组织」标题下同时挂着一套来源/情报输入框与一套
//       入库/转移输入框，两套 placeholder（「持有者/资源/数量」对「已有前因/结果/知情人物」）
//       混在一起，只能靠猜哪一排属于哪个功能；
//     · 同期已有 `wa-org-*` 11 个控件，两组同区共存 ⇒ 视觉上像同一个模块的两个面板。
//   本仓反复出现同型病（v2.42.0 的页面写死 12、v2.43.0 的文件面四处副本）：**结构声明的
//   增长与产物的增长不同步**。此锁把「每个模块的分区标题必须真的写出来」变成可执行判据。
//
// 【判据】（在**真机渲染产物**上判——装载 ui/panel.js、点 tab、读 body.innerHTML）
//   A  每个 `<模块>-enabled` 总开关，其所在分区标题必须包含该模块名。
//      模块名 = 开关标签去掉前缀「启用」与尾部噪音词（ENABLED_LABEL_NOISE，如「提醒」）。
//      —— 这条把「漏写标题导致控件并进别人分区」当场打红。
//   B  两个不同模块的开关**不得共用同一个分区标题**（同区共存 = 分组失效）。
//   C  覆盖度前提：至少渲染出 ≥3 个模块开关（否则判据在空集合上恒真，是假绿）。
//
// 【为什么不用「一分区族」全局不变量】实测全 UI：设置页 / 工具页 / 注入页 / 导演页
//   存在**合法**的多族共存分区（如「扩展自检」下 14 族），若按「一分区只能一族」判，
//   会产出 7 处纯噪音违规，判据立刻失去意义。故本锁只对**模块总开关**这一层设分组要求：
//   总开关是「模块身份」的唯一标记，且实测全 UI 仅 4 个，是天然干净的锚面。
//
// 【两向自证】负控制以**真源码破坏**（删掉刚补上的分区标题）→ 在破坏副本上重跑**同款**
//   判据，要求 A/B 现形；破坏锚点须恰中 1 次，否则抛（锚点不存在/不唯一即为红灯）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';

// 开关标签里的噪音词：它们属于「开关」的措辞，不属于「模块名」。新增时须在此登记，
//   否则 A 判据会把它当成模块名的一部分而与分区标题对不上（实测：长线伏笔提醒）。
const ENABLED_LABEL_NOISE = ['提醒', '开关'];

const SEC_RE = /<div\s+class\s*=\s*"wa-sec"[^>]*>([^<]*)<\/div>/g;
const EN_RE = /<label[^>]*>\s*<input[^>]*id\s*=\s*"(wa-[a-z0-9\-]*-enabled)"[^>]*>([^<]*)</g;

function sectionsOf(html) {
  const out = [];
  let m;
  SEC_RE.lastIndex = 0;
  while ((m = SEC_RE.exec(html))) out.push({ title: m[1].trim(), at: m.index });
  return out;
}
function ownerOf(sections, at) {
  let o = '';
  sections.forEach(function (s) { if (s.at < at) o = s.title; });
  return o;
}
/** 剥掉标签噪音词，得到模块名 */
function moduleKeyword(label) {
  // 必须先 trim：渲染产物里 label 文本带着换行与缩进（`\n        启用…`），
  //   不 trim 则 `^启用` 永不匹配——本判据首版即踩此坑（kw 停留在「启用长线伏笔」）。
  let k = String(label).trim().replace(/^启用/, '').trim();
  ENABLED_LABEL_NOISE.forEach(function (n) { if (k.length > n.length && k.slice(-n.length) === n) k = k.slice(0, -n.length); });
  return k;
}

/** 在「已启动」的真 UI 环境上逐页采集模块开关 → 分区归属 */
function collectToggles(env) {
  const WA = env.WA, dom = env.dom;
  const panel = dom.getElementById('wa-panel');
  const pages = (WA.ui && typeof WA.ui.pages === 'function') ? WA.ui.pages() : [];
  const rows = [];
  pages.forEach(function (page) {
    const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
    if (!tab) return;
    tab.click();
    const body = panel.querySelector('.wa-body');
    const html = String((body && body.innerHTML) || '');
    const secs = sectionsOf(html);
    EN_RE.lastIndex = 0;
    let m;
    while ((m = EN_RE.exec(html))) {
      rows.push({ page: page, id: m[1], label: m[2].trim(), kw: moduleKeyword(m[2]), section: ownerOf(secs, m.index) });
    }
  });
  return rows;
}

/** A 面：分区标题必须含模块名 */
function checkTitle(rows) {
  return rows.filter(function (r) { return !r.kw || r.section.indexOf(r.kw) < 0; })
    .map(function (r) { return r.id + '（标题应含「' + r.kw + '」，实为「' + r.section + '」）'; });
}
/** B 面：两模块不得共用同一分区标题 */
function checkShared(rows) {
  const bySec = {};
  rows.forEach(function (r) { (bySec[r.section] = bySec[r.section] || []).push(r); });
  const bad = [];
  Object.keys(bySec).forEach(function (sec) {
    const kws = [];
    bySec[sec].forEach(function (r) { if (kws.indexOf(r.kw) < 0) kws.push(r.kw); });
    if (kws.length > 1) bad.push('「' + sec + '」下有 ' + kws.join(' + '));
  });
  return bad;
}

/** 判据总入口：对给定 UI 环境运行全部分组面 */
function judge(env) {
  const rows = collectToggles(env);
  return { rows: rows, titleViolations: checkTitle(rows), sharedViolations: checkShared(rows) };
}

function readPanel() { return fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8'); }

// 负控制锚点：v2.57.0 补上的分区标题。它在真源码里必须恰中 1 次。
const ANCHOR = '<div class="wa-sec">因果与情报</div>';

function runAll(a) {
  const gate = require('./ui-gate-sync.js');
  const env = gate.fresh();
  const j = judge(env);
  a(j.rows.length >= 3, 'v2570: [C] 渲染出 ' + j.rows.length + ' 个模块总开关（≥3：判据不在空集合上恒真）');
  a(j.titleViolations.length === 0, 'v2570: [A] 每个模块总开关都处于含其模块名的分区下（违规: ' + (j.titleViolations.join('；') || '无') + '）');
  a(j.sharedViolations.length === 0, 'v2570: [B] 无两模块共用同一分区标题（违规: ' + (j.sharedViolations.join('；') || '无') + '）');
  // A 的负向自证前提：模块名剥噪音词确实生效（否则「长线伏笔提醒」会假报违规）
  const ll = j.rows.filter(function (r) { return r.id.indexOf('longline') >= 0 || r.kw === '长线伏笔'; })[0];
  a(!ll || ll.kw === '长线伏笔', 'v2570: [A] 开关标签噪音词已剥离（实 kw=' + (ll ? ll.kw : '(无该开关)') + '）');
}

function runNegative(a) {
  const gate = require('./ui-gate-sync.js');
  const src = readPanel();
  const n = src.split(ANCHOR).length - 1;
  a(n === 1, 'v2570: [N1] 负控制锚点在真源码中恰中 1 次（实 ' + n + ' 次）');
  const broken = src.replace(ANCHOR, '');
  a(broken !== src, 'v2570: [N2] 破坏确实发生（删掉该分区标题）');
  const envB = gate.fresh({ srcOverride: { 'ui/panel.js': broken } });
  const jb = judge(envB);
  a(jb.titleViolations.length > 0, 'v2570: [N3] 破坏后 [A] 现形（违规: ' + (jb.titleViolations.join('；') || '无') + '）');
  a(jb.sharedViolations.length > 0, 'v2570: [N4] 破坏后 [B] 现形（同区共存: ' + (jb.sharedViolations.join('；') || '无') + '）');
  const envOk = gate.fresh();
  const jg = judge(envOk);
  a(jg.titleViolations.length === 0 && jg.sharedViolations.length === 0, 'v2570: [N5] 原版上同款判据仍成立（双向自证：不是把判据写死）');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name, extra) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  runAll(a);
  runNegative(a);
  if (fail) { console.log('UI-MODULE-SECTION-V2570: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('UI-MODULE-SECTION-V2570: pass（' + pass + ' 项）');
}

module.exports = { judge: judge, runAll: runAll, runNegative: runNegative, collectToggles: collectToggles, moduleKeyword: moduleKeyword, ANCHOR: ANCHOR, ENABLED_LABEL_NOISE: ENABLED_LABEL_NOISE };