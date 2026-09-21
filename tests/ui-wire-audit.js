// WorldAxis tests/ui-wire-audit.js — UI 接线面门禁（零依赖，静态）
//
// 为什么要单独一条：tests/ui-gate.js 已用 mini-DOM 真实渲染+点击，但它的检测方向是
//   「渲染面 → 查询/点击面」（渲染出的控件能否被操作）。本门禁是反方向——「引用面 → 渲染面」：
//   JS 里每个 `$('#id')` / `on('#id')` / `setOut('#id')` 引用的 DOM id，模板是否真的渲染了它。
//   抓的是 ui-gate 抓不到的一类失效：handler 绑到一个从不渲染的 id——因 on()/setOut()
//   都有 if(el) 判空守卫，绑定静默空转、不抛错，用户视角「点了没反应」，而真实点击门禁
//   （元素不存在）根本点不到。
//
// 判据口径（已对真实 ui/*.js 校准，零假阳）：
//   · 引用面：`'#xxx'` 字符串字面量，排除 hex 颜色（#fff/#2196f3 等，非 id）。
//   · 渲染面：把 id 当非 `#` 纯字符串字面量（覆盖 ta('id',…) 等渲染 helper）
//     或 `id="xxx"` 模板/动态拼接（覆盖任何渲染方式，不依赖 wa- 前缀）。
//   · 注释行（// * /*）不计入，防注释里的示例 `$('#x')` 假阳。
//
// 用法：node tests/ui-wire-audit.js  （独立门禁；亦被 tests/run.js 段调用）
'use strict';
const path = require('path');
const fs = require('fs');
const BASE = path.resolve(__dirname, '..');
const HEX = /^[0-9a-fA-F]{3,8}$/;

function auditWire(src) {
  const L = src.split('\n');
  const isComment = function (ln) {
    const t = ln.replace(/^\s+/, '');
    return t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0;
  };
  const referenced = {}, rendered = {};
  L.forEach(function (ln, i) {
    if (isComment(ln)) return;
    let m;
    const reRef = /['"]#([\w-]+)['"]/g;
    while ((m = reRef.exec(ln))) {
      if (HEX.test(m[1])) continue;
      (referenced[m[1]] = referenced[m[1]] || []).push(i + 1);
    }
    const reLit = /(?<!#)['"]([\w-]+)['"]/g;
    while ((m = reLit.exec(ln))) { (rendered[m[1]] = rendered[m[1]] || []).push(i + 1); }
    const reId = /id\s*=\s*['"]([\w-]+)['"]/g;
    while ((m = reId.exec(ln))) { (rendered[m[1]] = rendered[m[1]] || []).push(i + 1); }
  });
  const refKeys = Object.keys(referenced), renKeys = Object.keys(rendered);
  const renSet = {}, refSet = {};
  renKeys.forEach(function (k) { renSet[k] = 1; });
  refKeys.forEach(function (k) { refSet[k] = 1; });
  const ghosts = refKeys.filter(function (k) { return !renSet[k]; }).sort();
  const pure = renKeys.filter(function (k) { return !refSet[k]; }).sort();
  return { referenced: referenced, rendered: rendered, ghosts: ghosts, pure: pure };
}

function uiFiles() {
  const out = [];
  ['ui/panel.js', 'ui/settings.js', 'ui/assistant.js'].forEach(function (rel) {
    const fp = path.join(BASE, rel);
    if (fs.existsSync(fp)) out.push({ rel: rel, src: fs.readFileSync(fp, 'utf8') });
  });
  return out;
}

async function main() {
  const pass = [], fail = [];
  function assert(cond, name, extra) {
    if (cond) { pass.push(name); console.log('  \u2713 ' + name); }
    else { fail.push(name); console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  }

  console.log('\n\u25a0 UI 接线面门禁（引用面 → 渲染面）');
  const files = uiFiles();
  assert(files.length === 3, '三个 ui 文件全部在场（实 ' + files.length + '）');
  files.forEach(function (f) {
    const r = auditWire(f.src);
    const gdesc = r.ghosts.map(function (g) { return g + '@L' + (r.referenced[g] || []).join(','); }).join('、');
    assert(r.ghosts.length === 0, f.rel + ' 零幽灵引用（引用 ' + Object.keys(r.referenced).length +
      ' / 渲染提及 ' + Object.keys(r.rendered).length + '）', gdesc);
  });

  console.log('\n\u25a0 负向自证（判据须真能红，非恒绿）');
  // 负向 A：含幽灵引用 —— 引用 #wa-zombie-btn 但从不渲染，必须报出；wa-real-btn 已渲染不误报
  const badSrc = [
    "on('#wa-zombie-btn', () => { doThing(); });",
    'const tpl = id="wa-real-btn";',
    "on('#wa-real-btn', () => { doThing(); });"
  ].join('\n');
  const rA = auditWire(badSrc);
  assert(rA.ghosts.indexOf('wa-zombie-btn') >= 0, '（负向）幽灵引用 wa-zombie-btn 被抓到（实 ' + rA.ghosts.join('、') + '）');
  assert(rA.ghosts.indexOf('wa-real-btn') < 0, '（负向对照）已渲染的 wa-real-btn 不误报');
  // 负向 B：hex 颜色不得当成 id 引用
  const colorSrc = [
    "const c1 = '#fff'; const c2 = '#2196f3'; const c3 = '#123';",
    "const style = 'color:#ff5722;background:#0a0b0c'"
  ].join('\n');
  const rB = auditWire(colorSrc);
  assert(rB.ghosts.length === 0, '（负向）hex 颜色全部被排除、零幽灵（实 ' + rB.ghosts.length + '）');
  // 负向 C：注释里的示例引用不得计入
  const cmtSrc = [
    "//   `$('#wa-fake')` 每次调用都重新查询（注释示例，非真实引用）",
    "const x = 1;"
  ].join('\n');
  const rC = auditWire(cmtSrc);
  assert(rC.ghosts.length === 0, '（负向）注释里的示例引用不计入（实 ' + rC.ghosts.length + '）');

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('UI 接线面门禁：通过 ' + pass.length + ' / 失败 ' + fail.length);
  if (fail.length) { console.log('失败项: ' + fail.join(' | ')); process.exit(1); }
  console.log('全部通过 \u2713（引用面与渲染面一致，无幽灵绑定）');
  process.exit(0);
}
// 导出供 tests/run.js 复用同一判据（不复制、不漂移）
module.exports = { auditWire: auditWire, uiFiles: uiFiles };
if (require.main === module) {
  main().catch(function (e) { console.error('ui-wire-audit 运行器异常:', e); process.exit(2); });
}
