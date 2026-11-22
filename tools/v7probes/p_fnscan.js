'use strict';
// 探针：运行期函数源码扫描（Function.toString）能覆盖多少写口调用？
//   目的：产品（浏览器扩展）里没有 fs，仓外探针那种「读文件」的扫描不可能跑。
//   但 WA 树上每个模块的导出函数都能 toString —— 那是运行期真源。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = g.WorldAxis;
try { WA.store.init(); } catch (e) {}

// ── 运行期函数源码扫描 ────────────────────────────────────────────────
const RE = /WA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
const byNs = {};
let fnCount = 0, srcChars = 0, nativeSkipped = 0;
let depth = 0;

function scanFn(nsOwner, fnName, fn) {
  let s;
  try { s = Function.prototype.toString.call(fn); } catch (e) { return; }
  if (!s || s.indexOf('[native code]') >= 0) { nativeSkipped++; return; }
  fnCount++; srcChars += s.length;
  let mm;
  RE.lastIndex = 0;
  while ((mm = RE.exec(s)) !== null) {
    const ns = mm[1], mem = mm[2];
    if (ns === nsOwner) continue;   // 自己调自己不算外部驱动者
    const b = byNs[ns] || (byNs[ns] = { members: {}, fromNs: {} });
    b.members[mem] = (b.members[mem] || 0) + 1;
    b.fromNs[nsOwner] = (b.fromNs[nsOwner] || 0) + 1;
  }
}

Object.keys(WA).forEach(function (ns) {
  if (ns === 'modules') return;
  const mod = WA[ns];
  if (!mod || typeof mod !== 'object') return;
  Object.keys(mod).forEach(function (k) {
    let v;
    try { v = mod[k]; } catch (e) { return; }
    if (typeof v !== 'function') return;
    scanFn(ns, k, v);
  });
});

console.log('=== 运行期函数扫描覆盖度 ===');
console.log('扫到的函数数 = ' + fnCount + ' · 源码字符数 = ' + srcChars + ' · native 跳过 = ' + nativeSkipped);
console.log('被调用到的命名空间 = ' + Object.keys(byNs).length);

// 写口判定（与 driver-ledger 同口径的简化版）
const W = function (k) {
  return /^(set(?!tings)|add|schedule|start|cancel|depart|arrive|propose|declare|seal|settle|resolve|claim|advance|grant|create|record|feed|inject|register|bind|fulfill|relay|sign|confirm|postpone|complete|transition|drop|expand|converge|stall|abandon|refute|conceal|investigate|mutate|propagate|compete|mark|sink|knot|lock|unlock|anchor|gain|use|define|escalate|deescalate|report|pardon|train|bond|note|plan|peek|seed|stageAdd|stageResolve|spend|advanceRound|submit|rule|enforce|apply|voiceCheck|socialHint|noteAdd|posterior|utilityOf|ackSent|inQuiet|assign|promote|penalize|transfer|retire|modulate|accredit|deepen|brighten|revise|accept|reject|undo|clear|lay|delist|buy|pack|away|back|adopt|post|vacate|succession|breach|approve|charter|confront|decide|wrong|tally|host|join|auth|resync|leave|identify|knows|perceive|gateScene|leakScan|duty|fidelity|boundary|release|hostname|fingerprint|exportLegends|importLegends|dispatch|reroute|present|review|enact|disburse|handover|rent|repair|inspect|extractFromTrace|checkEvidence|publish|trackSafehouseExposure|sweep|collect|step|close|rechoose|chain|signal|locate|outline|position|gap|alignView|deviation|deviationTrend)$/.test(k);
};
const NOT_WRITE = { setSettings: 1, settings: 1, buildBlock: 1, stat: 1, statView: 1 };

const engines = Object.keys(WA).filter(function (k) {
  const v = WA[k];
  return v && typeof v === 'object' && typeof v.buildBlock === 'function';
});
console.log('\n带 buildBlock 的引擎 = ' + engines.length);

// 工作流链
const chainNs = {};
if (WA.workflow && typeof WA.workflow.list === 'function') {
  WA.workflow.list().forEach(function (n) {
    if (!n || !n.id) return;
    if (n.chain !== 'before' && n.chain !== 'after') return;
    const ns = String(n.id).split('.')[0];
    chainNs[ns] = (chainNs[ns] || 0) + 1;
  });
}
// 路由表
const routeNs = {};
const R = WA.actionDesk && WA.actionDesk.ROUTES;
if (R) {
  (Array.isArray(R) ? R : Object.keys(R)).forEach(function (k) {
    routeNs[String(k).split('.')[0]] = (routeNs[String(k).split('.')[0]] || 0) + 1;
  });
}

const rows = [];
engines.forEach(function (ns) {
  const call = byNs[ns] || { members: {} };
  const writers = Object.keys(call.members).filter(function (k) { return !NOT_WRITE[k] && W(k); });
  rows.push({ ns: ns, writers: writers, chain: !!chainNs[ns], route: !!routeNs[ns] });
});

const L1 = rows.filter(function (r) { return r.chain; });
const L2 = rows.filter(function (r) { return !r.chain && r.writers.length; });
const L2r = rows.filter(function (r) { return !r.chain && !r.writers.length && r.route; });
const L3 = rows.filter(function (r) { return !r.chain && !r.writers.length && !r.route; });

console.log('\n=== 运行期分层（函数源码口径）===');
console.log('L1 链上 = ' + L1.length + ' -> ' + L1.map(function (r) { return r.ns; }).join(' '));
console.log('L2 函数里有写口调用 = ' + L2.length + ' -> ' + L2.map(function (r) { return r.ns; }).join(' '));
console.log('L2r 仅路由表可达 = ' + L2r.length + ' -> ' + L2r.map(function (r) { return r.ns; }).join(' '));
console.log('L3 三者皆无 = ' + L3.length);

// 与仓外源码扫描的对照：读文件口径
const PROD_DIRS = ['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat', 'design'];
const files = [];
(function walk(rel) {
  const abs = path.join(BASE, rel);
  let st; try { st = fs.statSync(abs); } catch (e) { return; }
  if (st.isFile()) { if (/\.js$/.test(rel)) files.push(rel); return; }
  fs.readdirSync(abs).forEach(function (n) { walk(rel + '/' + n); });
})('');
PROD_DIRS.forEach(function (d) { walk(d); });
walk('index.js');
const fileNs = {};
files.forEach(function (rel) {
  let src = ''; try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { return; }
  const kb = rel.replace(/^.*\//, '').replace(/\.js$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  let mm; RE.lastIndex = 0;
  while ((mm = RE.exec(src)) !== null) {
    const ns = mm[1], mem = mm[2];
    const self = 'engines/' + kb + '.js';
    if (rel === self) continue;
    const b = fileNs[ns] || (fileNs[ns] = { members: {} });
    b.members[mem] = (b.members[mem] || 0) + 1;
  }
});
const fileWriters = {};
Object.keys(fileNs).forEach(function (ns) {
  fileWriters[ns] = Object.keys(fileNs[ns].members).filter(function (k) { return !NOT_WRITE[k] && W(k); });
});
const fL2 = engines.filter(function (e) { return !chainNs[e] && fileWriters[e] && fileWriters[e].length; });
const fL3 = engines.filter(function (e) { return !chainNs[e] && (!fileWriters[e] || !fileWriters[e].length); });
console.log('\n=== 仓外文件口径（对照）===');
console.log('扫描文件 = ' + files.length + ' · L2 有写口 = ' + fL2.length + ' · L3 无写口 = ' + fL3.length);

console.log('\n=== 函数口径漏掉、文件口径有的引擎（说明函数扫描是下界）===');
const miss = fL2.filter(function (e) { return L3.some(function (r) { return r.ns === e; }); });
console.log(miss.length + ' 个 -> ' + miss.join(' '));