'use strict';
// V7 立项探针（判据修正）：四层可达性分级
// L1 = before/after 链自动驱动
// L2 = action-desk 路由（玩家显式调用）
// L2b = ui/panel.js 面板手动入口（玩家可点）
// L3 = 真悬空（产品侧零调用）
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);

function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

// 产品侧全部源码（排除 tests/ tools/）
function walk(dir, out) {
  const full = path.join(BASE, dir);
  let ents = [];
  try { ents = fs.readdirSync(full, { withFileTypes: true }); } catch (e) { return out; }
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

// 收集产品侧所有 WA.<ns>.<method> 调用（排除调用点所在文件 == 该 ns 自身引擎文件）
const callMap = {};   // ns -> Set(method)
const panelCalls = {}; // ns -> Set(method) 仅 ui/
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

// 自带文件：每个引擎自己的文件名 -> 命名空间推断（用于排除自调用）
function selfFileOf(ns) {
  const cands = [];
  const kebab = ns.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  cands.push('engines/' + kebab + '.js');
  return cands;
}

// L1 链驱动
const L1 = new Set(['pmem','summarizer','kaleidoscope','livingWorld','hazard','act','region','farfield','elsewhere','vitals','coordinate']);

// 载入引擎拿到 buildBlock 面
require(path.join(BASE, 'tests/mock.js'));
const vm = require('vm');
const g = global;
const runSrc = read('tests/run.js');
const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + mm[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) { try { vm.runInContext(read(rel), ctx, { filename: rel }); } catch (e) {} }
const WA = g.WorldAxis;

const rows = [];
for (const ns of Object.keys(WA)) {
  const mod = WA[ns];
  if (!mod || typeof mod !== 'object') continue;
  if (typeof mod.buildBlock !== 'function') continue;
  const self = new Set(selfFileOf(ns));
  // 产品侧对该 ns 的调用成员（排除其自身引擎文件）
  const prod = new Set();
  for (const f of PROD) {
    if (self.has(f)) continue;
    const src = read(f);
    if (!src) continue;
    const re = new RegExp('WA\\.' + ns.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
    let x;
    while ((x = re.exec(src)) !== null) prod.add(x[1]);
  }
  const panel = panelCalls[ns] ? new Set([...panelCalls[ns]].filter(function (k) { return !self.has('ui/panel.js'); })) : new Set();
  // 业务写口（非读口）
  const READS = new Set(['buildBlock','stat','getSettings','view','read','list','explain','diagnose','due','active','where','stateView','readEx','preview','truthOf','rowsOf','feel','knownCause','visibleTo','LABEL','LADDER','TRACES','KINDS','TYPES','LEVELS','CONFIDENCE','print']);
  const writers = [];
  for (const k of Object.keys(mod)) {
    if (typeof mod[k] !== 'function') continue;
    if (READS.has(k)) continue;
    if (/^(get|set|reset|mark|add|open|push|tick|consume|flush|apply|build|render|update|init|load|save|dump|show|is|has|can|should|need|to|from|of)/.test(k) && !/^(set(?!tings)|add(?!.*Stat)|schedule|start|cancel|depart|arrive|propose|declare|seal|settle|resolve|claim|advance|grant|create|record|feed|inject|register|bind|fulfill|relay|sign|confirm|postpone|complete|transition|drop|expand|converge|stall|abandon|refute|conceal|investigate|mutate|propagate|compete)/.test(k)) continue;
    writers.push(k);
  }
  const usedWriters = writers.filter(function (k) { return prod.has(k) || panel.has(k); });
  let layer;
  if (L1.has(ns)) layer = 'L1';
  else if (panel.size > 0 && usedWriters.length > 0) layer = 'L2p';
  else if (prod.size > 0 && usedWriters.length > 0) layer = 'L2';
  else layer = 'L3';
  rows.push({ ns: ns, layer: layer, writers: writers, used: usedWriters, prodN: prod.size, panelN: panel.size, prod: [...prod].slice(0, 8) });
}

const cnt = {};
for (const r of rows) cnt[r.layer] = (cnt[r.layer] || 0) + 1;
console.log('=== 带 buildBlock 引擎 ' + rows.length + ' ===');
console.log('层别计数: ' + JSON.stringify(cnt));

const l3 = rows.filter(function (r) { return r.layer === 'L3'; });
console.log('\n=== L3 真悬空（产品侧零写口调用）: ' + l3.length + ' ===');
for (const r of l3.sort(function (a, b) { return b.writers.length - a.writers.length; })) {
  console.log(' ' + r.ns + ' | w=' + r.writers.length + ' [' + r.writers.slice(0, 5).join(',') + '] | prod调用=' + r.prodN + ' [' + r.prod.join(',') + '] | panel=' + r.panelN);
}

const l2p = rows.filter(function (r) { return r.layer === 'L2p'; });
console.log('\n=== L2p 面板可手动: ' + l2p.length + ' ===');
for (const r of l2p) console.log(' ' + r.ns + ' | 已用写口 [' + r.used.join(',') + '] | 未用 [' + r.writers.filter(function(k){return r.used.indexOf(k)<0;}).slice(0,6).join(',') + ']');

const l2 = rows.filter(function (r) { return r.layer === 'L2'; });
console.log('\n=== L2 仅代码路由可达（无面板）: ' + l2.length + ' ===');
for (const r of l2) console.log(' ' + r.ns + ' | 已用 [' + r.used.join(',') + ']');