#!/usr/bin/env node
'use strict';
/** EXV7-3 验收探针：情报网真实消费链。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..', '..');
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
if (!m) throw new Error('tests/run.js LOAD 缺席');
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(global);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = global.WorldAxis;
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) { pass++; console.log('  ok ' + msg); } else { fail++; console.log('  XX ' + msg); } }
function j(x) { try { return JSON.stringify(x); } catch (e) { return String(x); } }
if (WA.store && WA.store.init) WA.store.init();
const init = WA.store.get();
WA.store.transact(function (d) {
  d.evolution = Object.assign({}, d.evolution || {}, { round: 7 });
  d.people = {
    'p_甲': { id: 'p_甲', name: '甲', knowledge: { intel: [] }, updatedAt: 1 },
    'p_乙': { id: 'p_乙', name: '乙', knowledge: { intel: [] }, updatedAt: 1 }
  };
  d.intelQueue = [];
}, 'probe:exv73:seed');
WA.intel.setSettings({ enabled: true });
WA.noesis.setSettings({ enabled: true });
const add = WA.intel.addIntel('甲', { claim: '北门今晚封锁', source: '巡夜人', level: 'witness', ttlRounds: 4 });
a(add.ok === true, '即时情报走 addIntel 真写口（' + j(add) + '）');
let net = WA.intel.network();
a(net.ok === true, 'network 默认开启并返回 ok');
a(net.boundary === null, '未提供 claims 时不调用/不伪造 boundary');
a(net.rows.some(x => x.person === '甲' && x.state === 'held' && x.source === '巡夜人'), '人物持有行带人名与来源');
const held = net.rows.filter(x => x.person === '甲' && x.state === 'held')[0];
a(held && held.confidence === 75 && held.level === 'witness', '等级与置信度来自既有 intel 行（75）');
a(held && held.atRound === 7 && held.ttlRounds === 4 && held.expiresAtRound === 11 && held.remainingRounds === 4, '明确 TTL 展示 at/expires/剩余 4 轮');
WA.store.transact(function (d) { d.evolution.round = 9; d.intelQueue = [{ id: 'q1', person: '乙', claim: '南桥有消息', source: '信使', level: 'report', confidence: 55, due: 9999999999999, at: 9999999999999, atRound: 7, ttlRounds: 10, expiresAtRound: 17 }]; }, 'probe:exv73:queue');
net = WA.intel.network();
a(net.inTransit === 1 && net.rows.some(x => x.state === 'in-transit' && x.person === '乙'), '在途队列进入信息流且不冒充已持有');
const inTransit = net.rows.filter(x => x.state === 'in-transit')[0];
a(inTransit.remainingRounds === 8 && inTransit.source === '信使', '在途行保留来源并按当前轮次算剩余 8 轮');
a(net.people === 1 && net.held === 1, '人物数与已持有数分别统计，不把在途算持有');
WA.store.transact(function (d) {
  d.people['p_乙'].knowledge.intel = [];
  for (let i = 0; i < 55; i++) d.people['p_乙'].knowledge.intel.push({ id: 'h' + i, claim: 'c' + i, source: 's' + i, level: 'rumor', confidence: 25, at: i });
}, 'probe:exv73:cap');
net = WA.intel.network();
a(net.rows.length === 48 && net.truncated === true && net.cap === 48, '信息流有 48 条硬上限并如实报告 truncated');
let calls = 0;
const originalLeak = WA.noesis.leakScan;
WA.noesis.leakScan = function (claims) { calls++; return originalLeak.call(WA.noesis, claims); };
const boundary = WA.intel.network({ claims: [{ person: '甲', factId: '未登记秘密', uttered: true }] }).boundary;
a(calls === 1, '提供 claims 时确实转交既有 noesis.leakScan');
a(boundary && typeof boundary.count === 'number', 'boundary 保留 noesis.leakScan 的真实返回面');
WA.noesis.leakScan = originalLeak;
WA.intel.setSettings({ enabled: false });
const off = WA.intel.network();
a(off.ok === false && off.reason === 'disabled', '关闭态不输出情报网');
const diag = WA.toolDiag && WA.toolDiag.collect ? WA.toolDiag.collect() : null;
a(!!(diag && diag.intel && diag.intel.network && typeof diag.intel.network.held === 'number'), '诊断节消费 networkStat 并返回网络读数');
const panelSrc = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
a(panelSrc.indexOf('wa-intel-network-block') >= 0 && panelSrc.indexOf("on('#wa-intel-network'") >= 0, '概览块与人物页按钮均在真实 panel 消费面');
console.log('========== EXV7-3 探针汇总：' + pass + ' passed, ' + fail + ' failed ==========');
if (fail) process.exit(1);
