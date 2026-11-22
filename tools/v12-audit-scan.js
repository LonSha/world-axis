#!/usr/bin/env node
'use strict';
// V12 逐文件取证：对 engines/actors/core/render/ui 顶层 JS 逐个采集
// 命名空间、导出、store 写读字段、跨文件消费者、工作流挂载、默认开关、测试引用。
// 只读，不加载模块，不执行产品代码。
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const DIRS = ['engines', 'actors', 'core', 'render', 'ui'];
const files = [];
DIRS.forEach(d => { const p = path.join(ROOT, d); if (!fs.existsSync(p)) return;
  fs.readdirSync(p).filter(f => f.endsWith('.js')).sort().forEach(f => files.push(d + '/' + f)); });
function strip(s) { // 去注释与字符串，避免把注释里的名字当成调用
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""');
}
const src = {}, code = {};
files.forEach(f => { src[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); code[f] = strip(src[f]); });
const testDir = path.join(ROOT, 'tests');
const tests = fs.existsSync(testDir) ? fs.readdirSync(testDir).filter(f => f.endsWith('.js')).map(f => ({ f, s: fs.readFileSync(path.join(testDir, f), 'utf8') })) : [];
const uniq = a => Array.from(new Set(a));
const rows = files.map(f => {
  const s = src[f], c = code[f];
  const ns = uniq([...c.matchAll(/\bWA\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => m[1]))
    .filter(n => !/^__/.test(n));
  const exportBlock = [];
  ns.forEach(n => { const m = c.match(new RegExp('WA\\.' + n + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\s*\\};'));
    if (m) exportBlock.push(...[...m[1].matchAll(/([A-Za-z_$][\w$]*)\s*[:,(]/g)].map(x => x[1])); });
  const writes = uniq([...c.matchAll(/\b(?:draft|d|st|s)\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\.push\(|\.splice\(|\[)/g)].map(m => m[1]));
  const transact = (c.match(/\.transact\(|transact\(/g) || []).length;
  const llm = /apiRouter\.call|generateRaw|generateQuiet|\.call\(\s*\{[^}]*prompt/.test(c);
  const wf = [...s.matchAll(/chain:\s*['"](before|after)['"]/g)].map(m => m[1]);
  const enabled = (s.match(/enabled:\s*(true|false)/) || [])[1] || '-';
  const settings = /settingsBus|LS_KEY/.test(c) || /LS_KEY/.test(s);
  const head = (s.match(/\/\*\*?([\s\S]*?)\*\//) || ['', ''])[1].split('\n').map(x => x.replace(/^\s*\*\s?/, '').trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 120);
  return { f, lines: s.split('\n').length, ns, api: uniq(exportBlock).slice(0, 40), writes, transact, llm, wf, enabled, settings, head };
});
// 消费者：其他文件里出现 WA.<ns>. 或 WA.<ns>( 的位置
rows.forEach(r => {
  const cons = new Set(), ui = new Set();
  r.ns.forEach(n => { const re = new RegExp('\\bWA\\.' + n.replace(/\$/g, '\\$') + '\\s*(?:\\.|\\(|&&)');
    files.forEach(g => { if (g !== r.f && re.test(code[g])) { cons.add(g); if (g.startsWith('ui/') || g.startsWith('render/')) ui.add(g); } }); });
  r.consumers = Array.from(cons); r.uiConsumers = Array.from(ui);
  const base = path.basename(r.f);
  r.tests = tests.filter(t => t.s.includes(base) || r.ns.some(n => t.s.includes('WA.' + n + '.') || t.s.includes('.' + n + '.'))).map(t => t.f);
});
// 证据分类（规则，不是判断）
rows.forEach(r => {
  const nonUi = r.consumers.filter(g => !g.startsWith('ui/') && !g.startsWith('render/'));
  let cls;
  if (!r.ns.length) cls = r.f.startsWith('ui/') || r.f.startsWith('render/') ? 'surface' : 'no-namespace';
  else if (r.transact === 0 && !r.writes.length) cls = 'read-only';
  else if (!r.consumers.length) cls = 'island';
  else if (!nonUi.length) cls = 'ui-only';
  else cls = 'wired';
  r.cls = cls;
});
const out = process.argv[2] || '/tmp/v12-audit.json';
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
const tally = {}; rows.forEach(r => tally[r.cls] = (tally[r.cls] || 0) + 1);
console.log('files', rows.length, JSON.stringify(tally), '-> ' + out);
