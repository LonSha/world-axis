#!/usr/bin/env node
'use strict';
/**
 * EXV7-3 专锁：情报网的 owner、边界、期限与消费链。
 * 负控制必须是真源码破坏后的副本装载，且原版同款判据先绿、破坏版再红。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const INTEL_REL = 'engines/intel.js';
const NOESIS_REL = 'engines/noesis.js';
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const RUN_SRC = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const INTEL_SRC = fs.readFileSync(path.join(BASE, INTEL_REL), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG_REL), 'utf8');
const A_EXPORT = 'network: network, networkStat: networkStat,';
const A_HORIZON = "remainingRounds: exp === null ? null : Math.max(0, Math.floor(exp - nowRound))";
const A_BOUNDARY_BLOCK = `      boundary = WA.noesis && typeof WA.noesis.leakScan === 'function'
        ? WA.noesis.leakScan(opts.claims)
        : { ok: false, reason: 'noesis-missing', leaks: [], count: 0, scanned: opts.claims.length };`;
let pass = 0, fail = 0;
function assert(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }
function eq(a, b, msg) { assert(a === b, msg + '（实 ' + JSON.stringify(a) + ' / 期望 ' + JSON.stringify(b) + '）'); }
function cnt(s, x) { return String(s).split(x).length - 1; }
function must1(s, x, tag) { const n = cnt(s, x); if (n !== 1) throw new Error(tag + ' 锚点命中 ' + n + ' 次，要求恰 1 次'); }
function loadList() {
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  if (!m) throw new Error('LOAD 缺席');
  return vm.runInNewContext('[' + m[1] + ']');
}
function loadAll(override) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try { global.localStorage.clear(); } catch (e) {}
  const ctx = vm.createContext(global);
  for (const rel of loadList()) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = override && override[rel] !== undefined ? override[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}
function seed(WA) {
  WA.store.transact(function (d) {
    d.evolution = Object.assign({}, d.evolution || {}, { round: 7 });
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', knowledge: { intel: [] }, updatedAt: 1 },
      'p_乙': { id: 'p_乙', name: '乙', knowledge: { intel: [] }, updatedAt: 1 }
    };
    d.intelQueue = [];
  }, 'lock:exv73:seed');
  WA.intel.setSettings({ enabled: true });
  WA.noesis.setSettings({ enabled: true });
}
function runAll(a) {
  const WA = loadAll();
  // 结构与真实消费面的锁。
  a(!!WA.intel && typeof WA.intel.network === 'function' && typeof WA.intel.networkStat === 'function', 'A1: network/networkStat 在导出面');
  a(PANEL_SRC.indexOf('wa-intel-network-block') >= 0 && PANEL_SRC.indexOf("on('#wa-intel-network'") >= 0, 'A2: 概览块与人物页按钮在真实 panel');
  a(DIAG_SRC.indexOf('networkStat') >= 0 && DIAG_SRC.indexOf('network:') >= 0, 'A3: 诊断节消费 networkStat');
  seed(WA);
  const r = WA.intel.addIntel('甲', { claim: '北门封锁', source: '巡夜人', level: 'witness', ttlRounds: 4 });
  a(r.ok === true, 'B1: 即时情报走既有 addIntel 真写口');
  let n = WA.intel.network();
  a(n.ok === true && n.boundary === null, 'B2: 默认只读聚合，未给 claims 不调用 noesis');
  const held = n.rows.filter(x => x.person === '甲' && x.state === 'held')[0];
  a(!!held && held.source === '巡夜人' && held.confidence === 75, 'B3: 来源/等级置信度逐字来自 intel 行');
  a(!!held && held.remainingRounds === 4 && held.expiresAtRound === 11, 'B4: 明确 TTL 显示还能撑 4 轮');
  a(!!held && held.horizon === 'expiring', 'B5: horizon 只由明确 expiresAtRound 得出');
  WA.store.transact(function (d) {
    d.evolution.round = 9;
    d.intelQueue = [{ id: 'q1', person: '乙', claim: '南桥有消息', source: '信使', level: 'report', confidence: 55, due: 9999999999999, at: 9999999999999, atRound: 7, ttlRounds: 10, expiresAtRound: 17 }];
  }, 'lock:exv73:queue');
  n = WA.intel.network();
  const transit = n.rows.filter(x => x.state === 'in-transit')[0];
  a(n.inTransit === 1 && !!transit, 'B6: intelQueue 在途行进入信息流');
  a(!!transit && transit.remainingRounds === 8 && transit.person === '乙', 'B7: 在途行按当前轮次计算剩余轮数');
  a(n.people === 1 && n.held === 1, 'B8: 在途不冒充人物已持有');
  WA.store.transact(function (d) {
    d.people['p_乙'].knowledge.intel = [];
    for (let i = 0; i < 55; i++) d.people['p_乙'].knowledge.intel.push({ id: 'h' + i, claim: 'c' + i, source: 's' + i, level: 'rumor', confidence: 25, at: i });
  }, 'lock:exv73:cap');
  n = WA.intel.network();
  a(n.rows.length === 48 && n.truncated === true, 'B9: 信息流容量 48 且如实报告截断');
  const noTtl = n.rows.filter(x => x.person === '乙' && x.id === 'h54')[0];
  a(noTtl && noTtl.remainingRounds === null && noTtl.horizon === 'unbounded', 'B10: 未设期限不猜寿命，返回 null/未设期限语义');
  let calls = 0;
  const oldLeak = WA.noesis.leakScan;
  WA.noesis.leakScan = function (claims) { calls++; return oldLeak.call(WA.noesis, claims); };
  const b = WA.intel.network({ claims: [{ person: '甲', factId: '未登记秘密', uttered: true }] }).boundary;
  WA.noesis.leakScan = oldLeak;
  a(calls === 1 && b && typeof b.count === 'number', 'B11: claims 只转交既有 noesis.leakScan');
  WA.intel.setSettings({ enabled: false });
  const off = WA.intel.network();
  a(off.ok === false && off.reason === 'disabled', 'C1: 关闭态不输出网络');
  a(typeof WA.intel.networkStat().currentRound === 'number', 'C2: networkStat 为纯读轮次/容量诊断');
}
function runNegative(a) {
  must1(INTEL_SRC, A_EXPORT, 'N0 export');
  must1(INTEL_SRC, A_HORIZON, 'N0 horizon');
  must1(INTEL_SRC, A_BOUNDARY_BLOCK, 'N0 boundary');
  const brokenExport = INTEL_SRC.replace(A_EXPORT, 'network: network,');
  const wa1 = loadAll({ [INTEL_REL]: brokenExport });
  a(typeof wa1.intel.networkStat !== 'function', 'N1: 真源码破坏导出后 networkStat 缺席，判据现形');
  const brokenHorizon = INTEL_SRC.replace(A_HORIZON, 'remainingRounds: null');
  const wa2 = loadAll({ [INTEL_REL]: brokenHorizon });
  seed(wa2);
  wa2.intel.addIntel('甲', { claim: '期限情报', source: '记录', level: 'record', ttlRounds: 3 });
  const h = wa2.intel.network().rows[0];
  a(h && h.remainingRounds === null, 'N2: 真源码破坏剩余轮次判据后，明确 TTL 不再伪装成可见读数');
  const brokenBoundary = INTEL_SRC.replace(A_BOUNDARY_BLOCK, "      boundary = null; // negative control: noesis handoff removed");
  const wa3 = loadAll({ [INTEL_REL]: brokenBoundary });
  seed(wa3);
  let calls = 0;
  const old = wa3.noesis.leakScan;
  wa3.noesis.leakScan = function () { calls++; return old.apply(wa3.noesis, arguments); };
  wa3.intel.network({ claims: [{ person: '甲', factId: 'x', uttered: true }] });
  a(calls === 0, 'N3: 真源码破坏 noesis 转交后调用计数为 0，判据现形');
  a(INTEL_SRC === fs.readFileSync(path.join(BASE, INTEL_REL), 'utf8'), 'N4: 负控制只改内存副本，真源码逐字未变');
}
module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runNegative: require('./lock-assert.js').restoring(runNegative) };
if (require.main === module) {
  const a = function (ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } };
  try { require('./mock.js'); runAll(a); runNegative(a); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('EXV7-3 INTEL NETWORK LOCK: ' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
}
