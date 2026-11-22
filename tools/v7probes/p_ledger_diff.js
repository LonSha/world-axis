'use strict';
// 对照探针：引擎口径 vs 立项探针口径，逐条对账 23 个差异引擎。
//   目的不是「哪个数字好看」，而是查清「到底哪一处判定把读口当成了写口」。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);

function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }
function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const PROD = [];
for (const d of ['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat', 'design']) walk(d, PROD);
PROD.push('index.js');

require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = read('tests/run.js');
const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + mm[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;
// 注：driverLedger 的扫描缓存自带签名（命名空间数/预取条数/装载条数），
//   扫描面一变下次 view() 自己重扫 —— 不需要（也已不再提供）invalidate()。
try { WA.store.init(); } catch (e) {}

// ── 用引擎自己的口径建账（模拟 prefetch 完整面）──
const base = 'http://tauri.localhost/wa';
WA.baseUrl = base;
const pf = new Map();
PROD.forEach(function (rel) {
  const s = read(rel);
  if (s) pf.set(base + '/' + rel, s);
});
WA.__prefetch = pf;
WA.__loadOrder = PROD.slice();
const v = WA.driverLedger.view();
console.log('引擎口径: ' + JSON.stringify(v.counts));

// ── 立项探针口径（复制 p_four_layer 的判定）──
const callMap = {}; const panelCalls = {};
for (const f of PROD) {
  const src = read(f);
  if (!src) continue;
  const re = /WA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const ns = m[1], method = m[2];
    const isPanel = f.indexOf('ui/') === 0;
    if (!callMap[ns]) callMap[ns] = new Set();
    callMap[ns].add(method);
    if (isPanel) { if (!panelCalls[ns]) panelCalls[ns] = new Set(); panelCalls[ns].add(method); }
  }
}
function selfFileOf(ns) { return ['engines/' + ns.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() + '.js']; }
const L1 = new Set(['pmem', 'summarizer', 'kaleidoscope', 'livingWorld', 'hazard', 'act', 'region', 'farfield', 'elsewhere', 'vitals', 'coordinate']);
const READS = new Set(['buildBlock', 'stat', 'getSettings', 'view', 'read', 'list', 'explain', 'diagnose', 'due', 'active', 'where', 'stateView', 'readEx', 'preview', 'truthOf', 'rowsOf', 'feel', 'knownCause', 'visibleTo', 'LABEL', 'LADDER', 'TRACES', 'KINDS', 'TYPES', 'LEVELS', 'CONFIDENCE', 'print']);

const oldRows = [];
for (const ns of Object.keys(WA)) {
  const mod = WA[ns];
  if (!mod || typeof mod !== 'object') continue;
  if (typeof mod.buildBlock !== 'function') continue;
  const self = new Set(selfFileOf(ns));
  const prod = new Set();
  for (const f of PROD) {
    if (self.has(f)) continue;
    const src = read(f);
    if (!src) continue;
    const re = new RegExp('WA\\.' + ns.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
    let x; while ((x = re.exec(src)) !== null) prod.add(x[1]);
  }
  const panel = panelCalls[ns] ? new Set([...panelCalls[ns]].filter(function (k) { return !self.has('ui/panel.js'); })) : new Set();
  const writers = [];
  for (const k of Object.keys(mod)) {
    if (typeof mod[k] !== 'function') continue;
    if (READS.has(k)) continue;
    if (/^(get|set|reset|mark|add|open|push|tick|consume|flush|apply|build|render|update|init|load|save|dump|show|is|has|can|should|need|to|from|of)/.test(k) && !/^(set(?!tings)|add(?!.*Stat)|schedule|start|cancel|depart|arrive|propose|declare|seal|settle|resolve|claim|advance|grant|create|record|feed|inject|register|bind|fulfill|relay|sign|confirm|postpone|complete|transition|drop|expand|converge|stall|abandon|refute|conceal|investigate|mutate|propagate|compete)/.test(k)) continue;
    writers.push(k);
  }
  const used = writers.filter(function (k) { return prod.has(k) || panel.has(k); });
  let layer;
  if (L1.has(ns)) layer = 'L1';
  else if (panel.size > 0 && used.length > 0) layer = 'L2p';
  else if (prod.size > 0 && used.length > 0) layer = 'L2';
  else layer = 'L3';
  oldRows.push({ ns: ns, layer: layer, used: used, prod: [...prod] });
}
const oc = {};
oldRows.forEach(function (r) { oc[r.layer] = (oc[r.layer] || 0) + 1; });
console.log('立项口径: ' + JSON.stringify(oc));

// ── 逐条对账 ────────────────────────────────────────────────────────────
const newLayer = {};
v.layerNames.L1.forEach(function (n) { newLayer[n] = 'L1'; });
v.layerNames.L2p.forEach(function (n) { newLayer[n] = 'L2p'; });
v.layerNames.L2.forEach(function (n) { newLayer[n] = 'L2'; });
v.orphans.forEach(function (n) { newLayer[n] = 'L3'; });

const diff = [];
oldRows.forEach(function (r) {
  const nl = newLayer[r.ns];
  if (nl && nl !== r.layer) diff.push({ ns: r.ns, old: r.layer, nw: nl, used: r.used, prod: r.prod.slice(0, 10) });
});
console.log('\n=== 口径差异 ' + diff.length + ' 条 ===');
diff.forEach(function (d) {
  console.log(' ' + d.ns + ': 立项=' + d.old + ' 引擎=' + d.nw
    + ' | 立项认作写口的 ' + JSON.stringify(d.used.slice(0, 8))
    + ' | 产品侧调用 ' + JSON.stringify(d.prod.slice(0, 8)));
});