'use strict';
// V7 立项探针：把 L1/L2/L3 三层分级展开成明细矩阵
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
if (!m) { console.log('NO LOAD LIST'); process.exit(1); }
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(g);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = g.WorldAxis;
if (!WA) { console.log('NO WorldAxis'); process.exit(1); }
const NOISE = new Set(['reset','resetStat','mark','set','add','open','push','tick','consume','flush','apply','clear','init','load','save','dump','show','get','view','stat','list','buildBlock','build','render','update']);
const deskSrc = fs.readFileSync(path.join(BASE, 'engines/action-desk.js'), 'utf8');
const deskNorm = new Set();
for (const mm of deskSrc.matchAll(/\bowner\s*:\s*['"]([A-Za-z_$][\w$]*)['"]/g)) deskNorm.add(mm[1]);
for (const mm of deskSrc.matchAll(/\bns\s*:\s*['"]([A-Za-z_$][\w$]*)['"]/g)) deskNorm.add(mm[1]);
for (const mm of deskSrc.matchAll(/\bWA\.([A-Za-z_$][\w$]*)\s*\./g)) deskNorm.add(mm[1]);
const L1 = new Set(['pmem','summarizer','kaleidoscope','livingWorld','hazard','act','region','farfield','elsewhere','vitals','coordinate']);
const L2 = new Set(['activity','research','family','causal','weather','rumor','affect','retrieval','freight','investigation','operations']);
const WRE = /^(set|add|create|advance|settle|resolve|claim|schedule|start|cancel|depart|arrive|propose|declare|seal|transition|fulfill|relay|sign|confirm|postpone|complete|record|inject|feed|teach|assign|grant|spend|earn|bind|unbind|attach|detach|enqueue|emit|publish|notify|register|enroll|lodge|file|vote|elect)/;
const rows = [];
for (const ns of Object.keys(WA)) {
  const mod = WA[ns];
  if (!mod || typeof mod !== 'object') continue;
  if (typeof mod.buildBlock !== 'function') continue;
  const writers = [];
  for (const k of Object.keys(mod)) {
    if (typeof mod[k] !== 'function') continue;
    if (NOISE.has(k)) continue;
    if (WRE.test(k)) writers.push(k);
  }
  let blen = 0;
  try {
    const b = mod.buildBlock();
    const s = typeof b === 'string' ? b : (b && typeof b === 'object' ? JSON.stringify(b) : String(b == null ? '' : b));
    blen = s.length;
  } catch (e) { blen = -1; }
  let layer = 'L3';
  if (L1.has(ns)) layer = 'L1';
  else if (deskNorm.has(ns) || L2.has(ns)) layer = 'L2';
  rows.push({ ns: ns, layer: layer, writers: writers, blen: blen, desk: deskNorm.has(ns) ? 1 : 0 });
}
const cnt = { L1: 0, L2: 0, L3: 0 };
for (const r of rows) cnt[r.layer] = cnt[r.layer] + 1;
console.log('=== 带 buildBlock 引擎总数 = ' + rows.length + ' ===');
console.log('L1 = ' + cnt.L1 + ' / L2 = ' + cnt.L2 + ' / L3 = ' + cnt.L3);
const l3 = rows.filter(function (r) { return r.layer === 'L3'; });
const withW = l3.filter(function (r) { return r.writers.length > 0; }).sort(function (a, b) { return b.writers.length - a.writers.length; });
const noW = l3.filter(function (r) { return r.writers.length === 0; }).sort(function (a, b) { return b.blen - a.blen; });
console.log('\n--- L3 有业务写口 : ' + withW.length + ' ---');
for (const r of withW) console.log(' ' + r.ns + ' | w=' + r.writers.length + ' [' + r.writers.slice(0, 6).join(',') + '] | blen=' + r.blen + ' | desk=' + r.desk);
console.log('\n--- L3 零业务写口 : ' + noW.length + ' ---');
for (const r of noW) console.log(' ' + r.ns + ' | blen=' + r.blen + ' | desk=' + r.desk);
let tw = 0;
for (const r of rows) tw = tw + r.writers.length;
console.log('\n=== 写口合计 = ' + tw + ' | L1+L2 = ' + rows.filter(function (r) { return r.layer !== 'L3'; }).reduce(function (a, r) { return a + r.writers.length; }, 0) + ' | L3 = ' + withW.reduce(function (a, r) { return a + r.writers.length; }, 0) + ' ===');