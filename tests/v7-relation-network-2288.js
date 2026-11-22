#!/usr/bin/env node
'use strict';
/** EXV7-4 专锁：六型结构、温度/历史分层、关闭/空态/容量、产品与诊断消费。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const BONDS_REL = 'engines/bonds.js';
const RT_REL = 'engines/relation-temp.js';
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const RUN_REL = 'tests/run.js';
const BONDS_SRC = fs.readFileSync(path.join(BASE, BONDS_REL), 'utf8');
const RT_SRC = fs.readFileSync(path.join(BASE, RT_REL), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG_REL), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN_REL), 'utf8');
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }
function must1(s, x, tag) { const n = s.split(x).length - 1; if (n !== 1) throw new Error(tag + ' anchor count ' + n); }
function load(override) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try { global.localStorage.clear(); } catch (e) {}
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  const list = vm.runInNewContext('[' + m[1] + ']');
  const ctx = vm.createContext(global);
  for (const rel of list) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    try { vm.runInContext(override && override[rel] !== undefined ? override[rel] : fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  WA.store.init();
  return WA;
}
function seed(WA) {
  WA.store.transact(function (d) {
    d.player = { name: '玩家' };
    d.evolution = Object.assign({}, d.evolution || {}, { round: 5 });
    delete d.bonds; delete d.fondness;
  }, 'lock:exv74:seed');
  WA.bonds.setSettings({ enabled: true, maxRows: 4 });
  WA.fondness.setSettings({ enabled: true });
  WA.relationTemp.setSettings({ enabled: true, maxPeople: 4, showTypes: true, showReason: true });
}
function runAll(assertFn) {
  const WA = load();
  const a2 = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  must1(BONDS_SRC, 'network: network,', 'A0 bonds export');
  must1(RT_SRC, 'network: network,', 'A0 relation export');
  a2(WA.bonds && typeof WA.bonds.network === 'function', 'A1 bonds owner network');
  a2(WA.relationTemp && typeof WA.relationTemp.network === 'function', 'A2 relation-temp enrichment');
  a2(PANEL_SRC.indexOf('wa-bond-network-block') >= 0 && PANEL_SRC.indexOf('不替代关系图谱') >= 0, 'A3 people page real consumer and semantic boundary');
  a2(DIAG_SRC.indexOf('networkStat') >= 0 && DIAG_SRC.indexOf('enriched:') >= 0, 'A4 diagnostic consumes network stats');
  seed(WA);
  let empty = WA.relationTemp.network();
  a2(empty.ok === true && empty.quiet === true && empty.reason === 'no-records', 'B1 enabled empty state');
  const before = JSON.stringify(WA.store.get());
  WA.bonds.setBond('玩家', '沈砚', ['利益同盟', '对手共生']);
  WA.bonds.setBond('甲', '乙', ['替身']);
  WA.fondness.apply('沈砚', { delta: 0.5, trust: 60, reason: '雨夜并肩断后' });
  const n = WA.relationTemp.network();
  a2(n.ok === true && n.rows.length === 2, 'B2 two registered rows visible');
  const playerRow = n.rows.filter(x => x.a === '玩家' || x.b === '玩家')[0];
  const npcRow = n.rows.filter(x => x.a === '甲' || x.b === '甲')[0];
  a2(playerRow.types.indexOf('利益同盟') >= 0 && playerRow.types.indexOf('对手共生') >= 0, 'B3 exact registered six-type values');
  a2(playerRow.temperature && playerRow.temperature.value === 0.5 && playerRow.temperature.dir === 'warmer', 'B4 fondness temperature and direction');
  a2(playerRow.recent.hasRecord === true && playerRow.recent.reason === '雨夜并肩断后', 'B5 recent reason from real history');
  a2(npcRow.temperature === null && npcRow.recent.hasRecord === false, 'B6 NPC-NPC pair does not borrow temperature');
  a2(npcRow.recent.reason.indexOf('不能归属于') >= 0, 'B7 no fabricated NPC-NPC evidence');
  const capped = WA.relationTemp.network({ maxRows: 1 });
  a2(capped.rows.length === 1 && capped.truncated === true && capped.dropped === 1, 'B8 bounded and explicit truncation');
  const snap = JSON.stringify(WA.store.get()); WA.relationTemp.network(); WA.bonds.network();
  a2(snap === JSON.stringify(WA.store.get()), 'C1 all network reads are zero-write');
  WA.bonds.setSettings({ enabled: false });
  const off = WA.relationTemp.network();
  a2(off.ok === false && off.reason === 'bonds-disabled', 'C2 bonds disabled differs from empty');
  const badBonds = BONDS_SRC.replace('network: network,', '/* network export removed */');
  const wa2 = load({ [BONDS_REL]: badBonds });
  wa2.bonds.setSettings({ enabled: true });
  const missing = wa2.relationTemp.network();
  a2(missing.ok === false && missing.reason === 'module-missing', 'N1 true-source export break is visible');
  a2(BONDS_SRC === fs.readFileSync(path.join(BASE, BONDS_REL), 'utf8'), 'N2 negative control does not mutate source');
  return true;
}
function runNegative(assertFn) {
  const a2 = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  must1(BONDS_SRC, 'network: network,', 'N0 bonds export');
  must1(RT_SRC, 'network: network,', 'N0 relation export');
  const badEnrich = RT_SRC.replace('network: network,', '/* network export removed */');
  const wa = load({ [RT_REL]: badEnrich });
  seed(wa);
  wa.bonds.setBond('玩家', '沈砚', ['利益同盟']);
  a2(typeof wa.relationTemp.network !== 'function', 'N3 true relation-temp export break is visible');
}
module.exports = { runAll: runAll, runNegative: runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('EXV7-4 RELATION NETWORK LOCK: ' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
}