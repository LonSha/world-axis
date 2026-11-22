/**
 * WorldAxis tests/engines-ns-gate.js (v2.381.0)
 *
 * 「WA.engines.<name> 探测恒假」门禁。
 *
 * 由来（真实缺陷）：v2.380.0 时 `metabolism-clock.js` 只注册 `WA.metabolismClock`（单层），
 *   而 cascade-bus / environmental-hazard / spatial-conflict 共 10 处用
 *   `WA.engines.metabolismClock && typeof ....accumulateFatigue === 'function'` 去探它在不在。
 *   `WA.engines` 下没有这个键 ⇒ 判定恒为 false ⇒
 *     · 昼夜节律疲劳累积、
 *     · 危害暴露额外疲劳、
 *     · 搏斗胜负双方的体力消耗
 *   三条联动**从未执行**。危害在于它完全静默：语法合法（node --check 全过）、
 *   既有门禁全绿、单测测不到（测试里自己塞了桩就测得过）。
 *
 * 判据：真源是「按 LOAD_ORDER 真的把 440 个文件装载起来」后的
 *   `Object.keys(WA.engines)`。凡代码里出现 `WA.engines.<name>` 的**读引用**
 *   （排除 `WA.engines.<name> = ...` 这种写注册），而 name 不在该 keys 里，
 *   并且也没有 `WA.<name>` 兜底 —— 一律判红。
 *
 *   `WA.<name>` 兜底：若 `WA.<name>` 存在，说明是「注册层级用错」，
 *   提示改路径或补双层注册；若连 `WA.<name>` 都没有，那是纯悬空引用，更严重。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function bootHost() {
  const noop = function () { };
  const _d = {};
  const el = () => ({
    style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
    appendChild: (x) => x, removeChild: noop, setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], insertAdjacentHTML: noop, focus: noop, blur: noop, click: noop,
    innerHTML: '', textContent: '', children: [], parentNode: null, remove: noop, dataset: {},
  });
  global.window = global;
  global.localStorage = {
    getItem: (k) => (k in _d ? _d[k] : null),
    setItem: (k, v) => { _d[k] = String(v); },
    removeItem: (k) => { delete _d[k]; },
    clear: () => { },
    key: () => null,
    length: 0,
  };
  global.document = {
    readyState: 'complete', documentElement: el(), body: el(), head: el(),
    createElement: el, createTextNode: (t) => ({ textContent: t }),
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
    hidden: false, visibilityState: 'visible',
  };
  try {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'gate', language: 'zh-CN' }, configurable: true, writable: true,
    });
  } catch (e) { }
  global.location = { href: 'http://localhost/', hostname: 'localhost' };
  global.performance = { now: () => Date.now() };
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.cancelAnimationFrame = noop;
  global.MutationObserver = function () { return { observe: noop, disconnect: noop, takeRecords: () => [] }; };
  global.WorldAxis = {};
  const WA = global.WorldAxis;
  WA.log = noop;
  return WA;
}

/**
 * 从 index.js 解析 LOAD_ORDER（保序），并真的逐文件装载。
 * 用 vm.runInThisContext 而非 require：这些文件是宿主脚本，不是 CommonJS 模块。
 */
function loadAll() {
  const WA = bootHost();
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const start = src.indexOf('LOAD_ORDER = [');
  if (start < 0) throw new Error('index.js 里找不到 LOAD_ORDER');
  const open = src.indexOf('[', start);
  let depth = 0, end = -1, st = null, inLine = false, inBlk = false;
  for (let i = open; i < src.length; i++) {
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
  const order = [];
  const re = /['"]([^'"]+\.js)['"]/g;
  let m;
  while ((m = re.exec(body)) !== null) order.push(m[1]);

  let ok = 0;
  const failed = [];
  order.forEach((rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { failed.push({ rel, why: 'FILE_MISSING' }); return; }
    try {
      vm.runInThisContext(fs.readFileSync(abs, 'utf8'), { filename: rel });
      ok++;
    } catch (e) {
      failed.push({ rel, why: String(e.message).slice(0, 100) });
    }
  });
  return { WA, order, ok, failed };
}

function walk(dir, acc) {
  fs.readdirSync(dir).forEach((n) => {
    if (n === 'node_modules' || n === '.git') return;
    const p = path.join(dir, n);
    let st; try { st = fs.statSync(p); } catch (e) { return; }
    if (st.isDirectory()) walk(p, acc);
    else if (n.slice(-3) === '.js') acc.push(p);
  });
  return acc;
}

/**
 * v2.381.0：**补上词法剥离**。
 *   本门禁最初逐行正则扫源码，没有剥离注释与字符串。v2.381.0 收尾时它自己先撞上了：
 *   `tests/gates.js` 的**注释**里写了一句「WA.engines.* 命名空间层」，
 *   被当成了真实读引用，而 `*` 恰好被正则当通配读到 `engines.` 后无标识符 —— 更糟的是，
 *   若注释里出现 `WA.engines.someEngine.foo` 这种形态，就会凭空多出一条「探测恒假」的红。
 *   一个门禁把注释当代码 ⇒ 它报的红既可能漏（真引用被注释掉的判断干扰不了）也可能假，
 *   两种都不可信。这里与 member-surface-gate.js 用同一份剥离逻辑（保持两门禁同口径）：
 *   注释（// 与 /* *​/）与字符串/模板串一律替换为空格，**保留换行** ⇒ 行号仍与源文件对齐，
 *   报点位置不变。
 */
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

function audit() {
  const { WA, order, ok, failed } = loadAll();
  const ENGINE_NS = new Set(Object.keys(WA.engines || {}));
  const TOP_NS = new Set(Object.keys(WA));
  const enginesCount = ENGINE_NS.size;

  const files = walk(ROOT, []);
  const hits = {};

  files.forEach((f) => {
    let s;
    try { s = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    if (s.indexOf('WA.engines.') < 0) return;
    const rel = path.relative(ROOT, f);
    // v2.381.0：扫的是剥离后的形态（注释/字符串已置空），行号仍与源文件一致。
    strip(s).split('\n').forEach((ln, i) => {
      const re = /WA\.engines\.([A-Za-z0-9_$]+)/g;
      let m;
      while ((m = re.exec(ln)) !== null) {
        const name = m[1];
        // 排除「写注册」：WA.engines.x = ...
        const after = ln.slice(m.index + m[0].length);
        if (/^\s*=(?!=)/.test(after)) continue;
        (hits[name] = hits[name] || []).push({ file: rel, line: i + 1 });
      }
    });
  });

  const broken = [];
  Object.keys(hits).sort().forEach((name) => {
    if (ENGINE_NS.has(name)) return;
    broken.push({ name, onWA: TOP_NS.has(name), sites: hits[name] });
  });

  return { order, ok, failed, enginesCount, surfaceTop: TOP_NS.size, broken };
}

function main() {
  const argv = process.argv.slice(2);
  let r;
  try { r = audit(); } catch (e) {
    console.log('[engines-ns-gate] ERROR: ' + e.message);
    process.exit(1);
  }

  if (argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify({
      ok: r.broken.length === 0,
      loadOrder: r.order.length, loaded: r.ok, loadFailed: r.failed.length,
      enginesNamespaceCount: r.enginesCount,
      broken: r.broken,
    }, null, 2));
    process.exit(r.broken.length === 0 ? 0 : 1);
    return;
  }

  console.log('═══ engines-ns-gate ═══');
  console.log('LOAD_ORDER ' + r.order.length + ' 条，装载成功 ' + r.ok
    + '，失败 ' + r.failed.length + '；WA.engines 命名空间 ' + r.enginesCount
    + ' 个；WA 顶层 ' + r.surfaceTop + ' 个');
  if (r.failed.length) {
    r.failed.slice(0, 8).forEach((f) => console.log('  ! ' + f.rel + '  ' + f.why));
  }

  if (!r.broken.length) {
    console.log('✓ 所有 WA.engines.<name> 探测都指向真实存在的命名空间');
    return;
  }

  console.log('✗ 探测恒假的引用（' + r.broken.length + ' 种）：');
  r.broken.forEach((b) => {
    const alt = b.onWA
      ? '注册层级用错：该模块只在 WA.' + b.name + '（单层）⇒ 改路径或补双层注册'
      : '纯悬空引用：WA.' + b.name + ' 与 WA.engines.' + b.name + ' 都不存在';
    console.log('  · WA.engines.' + b.name + '  x' + b.sites.length + '  [' + alt + ']');
    b.sites.slice(0, 6).forEach((s) => console.log('      ' + s.file + ':' + s.line));
    if (b.sites.length > 6) console.log('      ... 另 ' + (b.sites.length - 6) + ' 处');
  });
  process.exit(1);
}

if (require.main === module) main();

module.exports = { audit, loadAll };