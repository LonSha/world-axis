#!/usr/bin/env node
// WorldAxis tests/tpl-comment-gate.js — 「页面上不许出现源码注释」门禁（v2.539.3）
//
// 病（现场实测到的真缺陷）：事件页的世界时间轴那一块，四行 `// v2.535.0 …` 注释被写在了
//   **模板字符串内部** —— 于是它们不是注释，是文字，直接渲染在事件页顶部。
//   玩家看到的是一段中文运维说明，而代码里看是「有注释、很规范」。
// 为什么模板里的注释这么容易漏：`${(function () { … })()}` 里的 `//` 是真注释，
//   而同一段缩进下的模板文本里的 `//` 是正文 —— 两者**长得一模一样**，肉眼分不出。
// 判据：真渲染六页（与 ui-gate 同一台 mini-DOM），输出里不许出现 `// v2.` 或 `/*`。
//   为什么不用静态扫描：静态扫描分不清 `${}` 内外的 `//`（本仓试过，147 处全是误报）。
'use strict';
process.chdir(require('path').join(__dirname, '..'));
const g = require('./ui-gate-sync.js');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const PAGES = ['overview', 'world', 'people', 'events', 'connect', 'settings'];
const DIRTY = [/\/\/\s*v\d+\.\d+/, /\/\*\s*v\d+\.\d+/];

function renderAll() {
  const env = g.fresh();
  const WA = env.WA;
  const out = {};
  PAGES.forEach(function (p) {
    let html = '';
    try { WA.ui.goPage(p); } catch (e) { html = ''; }
    try { html = (env.dom && env.dom.body) ? env.dom.body.innerHTML : ''; } catch (e2) { html = ''; }
    out[p] = html;
  });
  return out;
}

console.log('\n■ A 面：六页真渲染，输出里不许出现源码注释');
const all = renderAll();
PAGES.forEach(function (p) {
  const html = all[p] || '';
  const hit = DIRTY.filter(function (re) { return re.test(html); });
  a(html.length > 0 && hit.length === 0, p + ' 页零裸露注释（渲染长度 ' + html.length + '）', hit.map(String));
});
a(PAGES.every(function (p) { return (all[p] || '').length > 500; }),
  'A7 六页都真的渲染出了内容（不是空串冒充通过）',
  PAGES.map(function (p) { return p + ':' + ((all[p] || '').length); }));

console.log('\n■ B 面：负控制（判据不许恒真）');
const fake = (all.events || '') + '\n      // v2.999.9：这是一行本该不可见的注释';
a(DIRTY.some(function (re) { return re.test(fake); }),
  'B1 负控制：往渲染结果里塞一行注释 ⇒ 判据必须变红');
const fakeCss = (all.world || '') + '\n      /* v2.999.9 */';
a(DIRTY.some(function (re) { return re.test(fakeCss); }),
  'B2 负控制：块注释同样被抓（不只认 //）');

console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exitCode = fail ? 1 : 0;