/**
 * WorldAxis tests/member-surface-gate.js (v2.381.0)
 *
 * 全仓「调用了不存在的成员」门禁。
 *
 * 和前两道门禁（settings-bus-api-gate / engines-ns-gate）的分工：
 *   - settings-bus-api-gate：只管 settingsBus 这一个面，且只扫「调用」形态
 *   - engines-ns-gate     ：只管命名空间层（engines 下的键是否存在），不到成员级
 *   - 本门禁              ：成员级、全命名空间、全仓 —— 这是覆盖面最大的一道
 *
 * 真源获取方式：**按 index.js 的 LOAD_ORDER 顺序真装载全部模块**，再取 Object.keys。
 *   这一点是本仓库审计反复踩坑的教训：v1 只跑 index.js 得到 21 命名空间/0 引擎，
 *   v2 补齐 DOM 桩仍只得到 bootstrap 面。必须自己保序装载，覆盖面才够。
 *
 * 判定口径：
 *   1. 词法剥离（注释 / 字符串 / 模板串），消除假阳性
 *   2. 只认 WA.<ns>.<member> 全限定形态（不认裸标识符、不认局部变量）
 *   3. 区分产品侧（engines/ ui/ core/）与测试/工具侧（tests/ tools/）
 *      —— 测试侧违规是「测试桩与产品面不一致」的自查信号，默认只告警；
 *         产品侧违规是真实缺陷，直接判红。
 *
 * 用法：
 *   node tests/member-surface-gate.js            # 门禁模式（产品侧有违规即 exit 1）
 *   node tests/member-surface-gate.js --strict    # 测试侧违规也判红
 *   node tests/member-surface-gate.js --json      # 机器可读输出
 *   node tests/member-surface-gate.js --list      # 列出全部越界项与落点
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ARGV = process.argv.slice(2);
const JSON_OUT = ARGV.indexOf('--json') !== -1;
const LIST = ARGV.indexOf('--list') !== -1;
const STRICT = ARGV.indexOf('--strict') !== -1;

// 宿主注入的代理型命名空间：它们不是本仓库模块，成员由 SillyTavern 运行时提供，
// 静态面必然对不上，且这些名字在本仓库里都是「探测 + 回退」写法。
const HOST_PROXY = new Set(['mainWin', 'SillyTavern', 'TavernHelper', 'mainDoc', 'window', 'parent', 'top', 'opener']);

function bootHost() {
  const noop = function () { };
  const el = () => ({
    style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    appendChild: (x) => x, removeChild: noop, setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], insertAdjacentHTML: noop, focus: noop, blur: noop, click: noop,
    innerHTML: '', textContent: '', children: [], parentNode: null, remove: noop,
    dataset: {}, firstChild: null
  });
  const _d = {};
  global.window = global;
  global.localStorage = {
    getItem: (k) => (k in _d ? _d[k] : null),
    setItem: (k, v) => { _d[k] = String(v); },
    removeItem: (k) => { delete _d[k]; },
    clear: () => { Object.keys(_d).forEach((k) => delete _d[k]); },
    key: (i) => Object.keys(_d)[i] || null,
    get length() { return Object.keys(_d).length; }
  };
  global.document = {
    readyState: 'complete', documentElement: el(), body: el(), head: el(),
    createElement: el, createTextNode: (t) => ({ textContent: t }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop, hidden: false, visibilityState: 'visible'
  };
  try {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'node-gate', language: 'zh-CN', platform: 'linux' },
      configurable: true, writable: true
    });
  } catch (e) { }
  global.location = { href: 'http://localhost/', hostname: 'localhost' };
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.cancelAnimationFrame = noop;
  global.MutationObserver = function () { return { observe: noop, disconnect: noop, takeRecords: () => [] }; };
  global.ResizeObserver = function () { return { observe: noop, disconnect: noop }; };
  global.IntersectionObserver = function () { return { observe: noop, disconnect: noop }; };
  global.WorldAxis = {};
  global.WorldAxis.log = noop;
  return global.WorldAxis;
}

/** 从 index.js 源码解析 LOAD_ORDER（括号配平 + 注释/字符串感知，保持顺序）。 */
function parseLoadOrder(root) {
  const src = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const start = src.indexOf('LOAD_ORDER = [');
  if (start < 0) return [];
  const open = src.indexOf('[', start);
  let depth = 0, i = open, end = -1, st = null, inLine = false, inBlk = false;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlk) { if (c === '*' && n === '/') { inBlk = false; i++; } continue; }
    if (st) { if (c === '\\') { i++; continue; } if (c === st) st = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlk = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { st = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);
  const out = []; const re = /['"]([^'"]+\.js)['"]/g; let m;
  while ((m = re.exec(body)) !== null) out.push(m[1]);
  return out;
}

/** 词法剥离：注释与字符串替换成空白（保留换行，行号不变）。 */
function strip(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  let st = null, esc = false;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (st) {
      if (esc) { esc = false; i++; continue; }
      if (c === '\\') { esc = true; i++; continue; }
      if (c === st) st = null;
      out.push(c === '\n' ? '\n' : ' '); i++; continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out.push(' '); i++; } continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out.push(src[i] === '\n' ? '\n' : ' '); i++; }
      out.push('  '); i += 2; continue;
    }
    if (c === '"' || c === "'" || c === '`') { st = c; out.push(' '); i++; continue; }
    out.push(c); i++;
  }
  return out.join('');
}

function collect(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = path.join(dir, name);
    let st;
    try { st = fs.statSync(p); } catch (e) { continue; }
    if (st.isDirectory()) collect(p, acc);
    else if (name.slice(-3) === '.js') acc.push(p);
  }
  return acc;
}

function audit() {
  const WA = bootHost();
  const ORDER = parseLoadOrder(ROOT);
  const loaded = [], failed = [];
  for (const rel of ORDER) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { failed.push({ rel, err: 'FILE_MISSING' }); continue; }
    try { vm.runInThisContext(fs.readFileSync(abs, 'utf8'), { filename: rel }); loaded.push(rel); }
    catch (e) { failed.push({ rel, err: String(e.message).slice(0, 120) }); }
  }

  // 导出树真源
  const tree = {};
  for (const k of Object.keys(WA)) {
    const v = WA[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) tree[k] = new Set(Object.keys(v));
    else if (typeof v === 'function') tree[k] = 'function';
    else tree[k] = 'primitive';
  }
  const engineTree = {};
  if (WA.engines && typeof WA.engines === 'object') {
    for (const en of Object.keys(WA.engines)) {
      const v = WA.engines[en];
      if (v && typeof v === 'object') engineTree[en] = new Set(Object.keys(v));
    }
  }

  const files = collect(ROOT, []);
  const bad = {};
  let refCount = 0;
  // 已知边界：只判定「真实命名空间下的成员」。
  //   对本仓库不存在的命名空间（多为宿主注入的探测目标，如 WA.someHostApi.xxx）
  //   无法区分「宿主真会注入」与「纯拼错」，故不纳入判定，只统计个数如实报告。
  const unknownNs = new Set();

  for (const f of files) {
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    if (raw.indexOf('WA.') < 0) continue;
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    const lines = strip(raw).split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const ln = lines[idx];
      if (ln.indexOf('WA') < 0) continue;
      let re = /WA\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)/g;
      let m;
      while ((m = re.exec(ln)) !== null) {
        const ns = m[1], mem = m[2];
        if (HOST_PROXY.has(ns)) continue;
        if (!(tree[ns] instanceof Set)) { unknownNs.add(ns); continue; }
        refCount++;
        if (!tree[ns].has(mem)) {
          const key = ns + '.' + mem;
          (bad[key] = bad[key] || []).push({ file: rel, line: idx + 1 });
        }
      }
      re = /WA\s*\.\s*engines\s*\.\s*([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)/g;
      while ((m = re.exec(ln)) !== null) {
        const en = m[1], mem = m[2];
        if (!engineTree[en]) continue;
        refCount++;
        if (!engineTree[en].has(mem)) {
          const key = 'engines.' + en + '.' + mem;
          (bad[key] = bad[key] || []).push({ file: rel, line: idx + 1 });
        }
      }
    }
  }

  const isProd = (f) => /^(engines|ui|core)\//.test(f);
  const entries = Object.keys(bad).sort().map((key) => {
    const sites = bad[key];
    const prodSites = sites.filter((s) => isProd(s.file));
    return { key, total: sites.length, sites, prodSites, isProd: prodSites.length > 0 };
  });

  return {
    orderCount: ORDER.length,
    loaded: loaded.length,
    failed,
    namespaces: Object.keys(WA).length,
    objectNamespaces: Object.keys(tree).filter((k) => tree[k] instanceof Set).length,
    engines: Object.keys(engineTree).length,
    refCount,
    files: files.length,
    unknownNamespaces: Array.from(unknownNs).sort(),
    entries,
    prodEntries: entries.filter((e) => e.isProd),
    testEntries: entries.filter((e) => !e.isProd)
  };
}

const r = audit();

if (JSON_OUT) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.prodEntries.length ? 1 : 0);
}

console.log('\u2550\u2550\u2550 \u5168\u4ed3\u6210\u5458\u9762\u95e8\u7981 (v2.381.0) \u2550\u2550\u2550');
console.log('LOAD_ORDER ' + r.orderCount + ' \u6761 \u00b7 \u88c5\u8f7d ' + r.loaded + ' \u00b7 \u5931\u8d25 ' + r.failed.length
  + ' \u00b7 \u547d\u540d\u7a7a\u95f4 ' + r.namespaces + ' (\u5bf9\u8c61\u578b ' + r.objectNamespaces + ')'
  + ' \u00b7 \u5f15\u64ce ' + r.engines);
console.log('\u626b\u63cf ' + r.files + ' \u4e2a\u6587\u4ef6 \u00b7 \u6838\u5bf9 ' + r.refCount + ' \u5904 WA.<ns>.<member> \u5f15\u7528');
if (r.unknownNamespaces.length) {
  console.log('\u5df2\u77e5\u8fb9\u754c\uff1a' + r.unknownNamespaces.length + ' \u4e2a\u547d\u540d\u7a7a\u95f4\u672c\u4ed3\u5e93\u672a\u88c5\u8f7d'
    + '\uff08\u591a\u4e3a\u5bbf\u4e3b\u6ce8\u5165\u63a2\u6d4b\u76ee\u6807\uff09\uff0c\u4e0d\u53c2\u4e0e\u5224\u5b9a\uff1a'
    + r.unknownNamespaces.slice(0, 12).join(', ') + (r.unknownNamespaces.length > 12 ? ' \u2026' : ''));
}
if (r.failed.length) {
  r.failed.slice(0, 10).forEach((f) => console.log('  ! \u88c5\u8f7d\u5931\u8d25 ' + f.rel + ' :: ' + f.err));
  if (r.failed.length > 10) console.log('  ... \u53e6 ' + (r.failed.length - 10) + ' \u4e2a');
}
console.log('');

if (LIST || r.prodEntries.length || r.testEntries.length) {
  if (r.prodEntries.length) {
    console.log('\u2717 \u4ea7\u54c1\u4fa7\u8d8a\u754c (' + r.prodEntries.length + ' \u79cd / '
      + r.prodEntries.reduce((a, e) => a + e.total, 0) + ' \u5904) \u2014\u2014 \u771f\u5b9e\u7f3a\u9677');
    for (const e of r.prodEntries) {
      console.log('    WA.' + e.key + '  (' + e.total + ' \u5904)');
      e.sites.forEach((s) => console.log('        ' + s.file + ':' + s.line));
    }
    console.log('');
  }
  if (r.testEntries.length) {
    const tag = STRICT ? '\u2717' : '\u26a0';
    console.log(tag + ' \u6d4b\u8bd5/\u5de5\u5177\u4fa7\u8d8a\u754c (' + r.testEntries.length + ' \u79cd / '
      + r.testEntries.reduce((a, e) => a + e.total, 0) + ' \u5904)  \u2014\u2014 \u6d4b\u8bd5\u6869\u4e0e\u4ea7\u54c1\u9762\u4e0d\u4e00\u81f4'
      + (STRICT ? '' : '\uff08\u975e\u963b\u65ad\u6a21\u5f0f\uff1b--strict \u53ef\u5224\u7ea2\uff09'));
    for (const e of r.testEntries) {
      console.log('    WA.' + e.key + '  (' + e.total + ' \u5904)');
      if (LIST) e.sites.forEach((s) => console.log('        ' + s.file + ':' + s.line));
    }
    console.log('');
  }
}

const red = r.prodEntries.length > 0 || (STRICT && r.testEntries.length > 0);
if (red) {
  console.log('\u2717 \u95e8\u7981\u5931\u8d25\uff1a\u4ea7\u54c1\u4ee3\u7801\u5f15\u7528\u4e86\u4e0d\u5b58\u5728\u7684\u6210\u5458 \u2014\u2014 \u8fd9\u4e9b\u8c03\u7528\u4f1a\u9759\u9ed8\u5931\u6548\u6216\u76f4\u63a5\u629b TypeError\u3002');
  process.exit(1);
}
console.log('\u2713 \u95e8\u7981\u901a\u8fc7\uff1a\u4ea7\u54c1\u4ee3\u7801\u5bf9\u6210\u5458\u9762\u7684\u5f15\u7528\u5168\u90e8\u547d\u4e2d\u3002');
process.exit(0);

module.exports = { audit };