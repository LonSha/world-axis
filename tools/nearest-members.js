/**
 * 测试/工具侧 31 种越界成员的真实面查找 (v2.381.0)
 * 输出每种「越界成员」在其命名空间里最接近的真实成员名。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');

const cases = [
  'affect.set', 'bonds.set', 'rumor.start', 'weather.set', 'store.set',
  'uiSettings.lanes', 'commission.propose', 'foreshadow.add', 'longline.addPromise',
  'plan.expandGoal', 'workflow.chains', 'org.RESOURCES', 'driverLedger.build',
  'driverLedger.invalidate', 'atlas.resetStat', 'events.plan', 'injectBudget.priorityOf',
  'injectInspector.faceAudit', 'life.fairness', 'life.turn', 'render.SRC_NAME',
  'render.costStat', 'render.engineCall', 'render.engineCost', 'render.noteCost',
  'supplyChain.buildBlock', 'toolDiag.diagnostics', 'toolSnapshot.subsetJSON',
  'store.dump', 'apiRouter._c', 'capabilityTier.setSettings'
];

const noop = function () { };
const el = () => ({
  style: {}, classList: { add: noop, remove: noop, contains: () => false, toggle: noop },
  appendChild: (x) => x, removeChild: noop, setAttribute: noop, getAttribute: () => null,
  addEventListener: noop, removeEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], insertAdjacentHTML: noop, focus: noop, blur: noop, click: noop,
  innerHTML: '', textContent: '', children: [], parentNode: null, remove: noop, dataset: {}, firstChild: null
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
  Object.defineProperty(global, 'navigator', { value: { userAgent: 'n', language: 'zh-CN' }, configurable: true, writable: true });
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

function parseLoadOrder() {
  const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const start = src.indexOf('LOAD_ORDER = [');
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

for (const rel of parseLoadOrder()) {
  try { vm.runInThisContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), { filename: rel }); } catch (e) { }
}

const WA = global.WorldAxis;

// 编辑距离（Levenshtein），用来找最接近的真名
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(new Array(n).fill(0)));
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

console.log('越界成员'.padEnd(30) + ' | 命名空间是否存在 | 最接近的真名');
console.log('-'.repeat(100));
for (const c of cases) {
  const [ns, mem] = c.split('.');
  const obj = WA[ns];
  if (!obj || typeof obj !== 'object') {
    console.log(c.padEnd(30) + ' | 否（整个命名空间都没有） | -');
    continue;
  }
  const keys = Object.keys(obj);
  const scored = keys
    .map((k) => ({ k, d: lev(String(mem).toLowerCase(), k.toLowerCase()) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3);
  console.log(c.padEnd(30) + ' | 是 | ' + scored.map((s) => s.k + '(' + s.d + ')').join('  '));
}