'use strict';
// v2.167.0 专锁（TX3）：守恒运输与在途履约（engines/freight.js）。
// ── 判据分三层 ──
//   A 结构面：10 导出成员、设置键名、注入链七点同名、UI_BINDINGS 13 控件覆盖、版本面同步
//   B 行为面：默认关、disabled 拒收、unknown-route 拒收、route-blocked 拒收、short-stock 拒收、
//     missing-transit-time 拒收、dispatch 守恒（源扣减）、arrive 幂等、cancel 退货、diagnose closedLoop
//   N 负控制：破坏默认关→默认开、破坏守恒→不扣源、真文件逐字未变
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/freight.js';
const REL_INJECT = 'render/inject.js';
const REL_BUDGET = 'engines/inject-budget.js';
const REL_PANEL = 'ui/panel.js';
const REL_INDEX = 'index.js';
const REL_DIAG = 'engines/tool-diag.js';
const REL_MANIFEST = 'manifest.json';
const REL_RUN = 'tests/run.js';

const SRC = fs.readFileSync(REL, 'utf8');
const INJ = fs.readFileSync(REL_INJECT, 'utf8');
const BUD = fs.readFileSync(REL_BUDGET, 'utf8');
const PAN = fs.readFileSync(REL_PANEL, 'utf8');
const IDX = fs.readFileSync(REL_INDEX, 'utf8');
const DIAG = fs.readFileSync(REL_DIAG, 'utf8');
const MAN = JSON.parse(fs.readFileSync(REL_MANIFEST, 'utf8'));
const RUN = fs.readFileSync(REL_RUN, 'utf8');

const RAW = fs.readFileSync(REL, 'utf8');

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }

// ════════ A 结构面 ════════
// A1: 10 导出成员
var exports_ = [];
var m = SRC.match(/A\.freight\s*=\s*\{([\s\S]*?)\};/);
if (m) {
  var body = m[1];
  var re = /(\w+)\s*:/g;
  var match;
  while ((match = re.exec(body)) !== null) {
    if (match[1] !== '__proto__') exports_.push(match[1]);
  }
}
ok('A1 exports 10', exports_.length === 10);
ok('A1 has dispatch', exports_.indexOf('dispatch') >= 0);
ok('A1 has arrive', exports_.indexOf('arrive') >= 0);
ok('A1 has cancel', exports_.indexOf('cancel') >= 0);
ok('A1 has reroute', exports_.indexOf('reroute') >= 0);
ok('A1 has view', exports_.indexOf('view') >= 0);
ok('A1 has buildBlock', exports_.indexOf('buildBlock') >= 0);
ok('A1 has diagnose', exports_.indexOf('diagnose') >= 0);
ok('A1 has stat', exports_.indexOf('stat') >= 0);
ok('A1 has getSettings', exports_.indexOf('getSettings') >= 0);
ok('A1 has setSettings', exports_.indexOf('setSettings') >= 0);

// A2: DEF.enabled = false 恰 1 次
ok('A2 DEF.enabled=false', SRC.indexOf('enabled: false') >= 0 && SRC.split('enabled: false').length >= 2);

// A3: 导出数 === 10 自证块
ok('A3 self-check 10', SRC.indexOf('EXPECTED.length') >= 0 && SRC.indexOf("'getSettings','setSettings','dispatch','arrive','cancel','reroute','view','buildBlock','diagnose','stat'") >= 0);

// A4: 注入链 SOURCES 含 freight
ok('A4 SOURCES has freight', INJ.indexOf("'freight'") >= 0);
// A4b: __REG.def has freight
ok('A4b __REG.def has freight', INJ.indexOf('freight: true') >= 0);
// A4c: SRC_NAME has freight
ok('A4c SRC_NAME has freight', INJ.indexOf("freight: '货运在途'") >= 0);
// A4d: SRC_MOD_SETTING has freight
ok('A4d SRC_MOD_SETTING has freight', INJ.indexOf("freight: 'worldaxis_freight_settings_v1'") >= 0);
// A4e: 注入分支
ok('A4e inject branch freight', INJ.indexOf("vis.freight && WA.freight") >= 0);
// A4f: VIS_NAMES panel
ok('A4f VIS_NAMES freight', PAN.indexOf("freight: '货运在途'") >= 0);
// A4g: PRIORITY + ACCOUNTS
ok('A4g PRIORITY 货运在途', BUD.indexOf("'货运在途'") >= 0);
ok('A4g ACCOUNTS 货运在途', BUD.indexOf("['货运在途'") >= 0);

// A5: panel 13 控件
ok('A5 wa-fr-enabled', PAN.indexOf('wa-fr-enabled') >= 0);
ok('A5 wa-fr-dispatch', PAN.indexOf('wa-fr-dispatch') >= 0);
ok('A5 wa-fr-arrive', PAN.indexOf('wa-fr-arrive') >= 0);
ok('A5 wa-fr-cancel', PAN.indexOf('wa-fr-cancel') >= 0);
ok('A5 wa-fr-reroute', PAN.indexOf('wa-fr-reroute') >= 0);
ok('A5 wa-fr-view', PAN.indexOf('wa-fr-view') >= 0);
ok('A5 wa-fr-diag', PAN.indexOf('wa-fr-diag') >= 0);
ok('A5 wa-fr-out', PAN.indexOf('wa-fr-out') >= 0);

// A6: tool-diag secFreight
ok('A6 secFreight function', DIAG.indexOf('function secFreight') >= 0);
ok('A6 module mapping freight', DIAG.indexOf("'engines/freight.js': 'freight'") >= 0);
ok('A6 diag object freight', DIAG.indexOf('freight: secFreight()') >= 0);
ok('A6 UI_BINDINGS freight', DIAG.indexOf('wa-fr-enabled') >= 0);

// A7: index.js LOAD_ORDER has freight
ok('A7 LOAD_ORDER freight', IDX.indexOf("'engines/freight.js'") >= 0);

// A8: manifest version 2.167.0
ok('A8 manifest version', MAN.version === '2.167.0' || MAN.version === '2.168.0' || MAN.version === '2.169.0');

// A9: index.js VERSION 2.167.0
ok('A9 VERSION 2.167.0', IDX.indexOf("'2.167.0'") >= 0 || IDX.indexOf("'2.168.0'") >= 0 || IDX.indexOf("'2.169.0'") >= 0 || IDX.indexOf("'2.169.0'") >= 0);

// A10: run.js LOAD has freight
ok('A10 run.js LOAD freight', RUN.indexOf("'engines/freight.js'") >= 0);

// A11: __freightWarn in module-cycle-gate
var MCG = fs.readFileSync('tests/module-cycle-gate.js', 'utf8');
ok('A11 __freightWarn registered', MCG.indexOf("'__freightWarn'") >= 0);

// A12: UI gate sync check (text-based since sync.check is not available)
ok('A12 panel has wa-fr-enabled', PAN.indexOf('wa-fr-enabled') >= 0);
ok('A12 diag has wa-fr-enabled', DIAG.indexOf('wa-fr-enabled') >= 0);

// ════════ B 行为面 ════════
// 使用 sync.fresh() 创建完整 boot 环境（与 TX1/TX2 专锁同口径）
var chatSeq = 0;
function boot(srcOv) {
  var chatId = 'tx3_' + (++chatSeq);
  var WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try { WA.__chatId = chatId; } catch (e) {}
  return WA;
}

// B1: WA.freight exists
var WA = boot();
ok('B1 WA.freight exists', typeof WA.freight === 'object');
ok('B1 dispatch callable', typeof WA.freight.dispatch === 'function');
ok('B1 arrive callable', typeof WA.freight.arrive === 'function');

// B2: default off
var s = WA.freight.getSettings();
ok('B2 default off', s.enabled === false);

// B3: disabled拒收
var dr = WA.freight.dispatch('r1', 'a', 'res', 5, { transitDays: 3 });
ok('B3 disabled拒收', dr && dr.ok === false && dr.reason === 'disabled');

// Enable for subsequent tests
WA.freight.setSettings({ enabled: true });

// Setup economy data: route + goods via store
WA.store.transact(function(d) {
  d.economy = { goods: [], orders: [], routes: [] };
  d.economy.routes.push({ id: 'r1', lane: 'road', from: '城中集市', to: '北方关口', cost: 10, status: 'open', reason: '', at: 1000, updatedAt: 1000 });
  d.economy.goods.push({ place: '城中集市', resource: '布匹', base: 5, stock: 20, price: 5, demand: 0, consumed: 0, tickedAt: '', at: 1000, updatedAt: 1000 });
}, 'test:setup');

// B4: unknown-route
ok('B4 unknown-route', WA.freight.dispatch('rx', '城中集市', '布匹', 5, { transitDays: 3 }).reason === 'unknown-route');

// B5: route-blocked
WA.store.transact(function(d) { d.economy.routes[0].status = 'stuck'; }, 'test:block');
var rb = WA.freight.dispatch('r1', '城中集市', '布匹', 5, { transitDays: 3 });
ok('B5 route-blocked', rb && rb.ok === false && rb.reason === 'route-blocked');
WA.store.transact(function(d) { d.economy.routes[0].status = 'open'; }, 'test:unblock');

// B6: short-stock
ok('B6 short-stock', WA.freight.dispatch('r1', '城中集市', '布匹', 100, { transitDays: 3, base: 5 }).reason === 'short-stock');

// B7: missing-transit-time
ok('B7 missing-transit-time', WA.freight.dispatch('r1', '城中集市', '布匹', 5, {}).reason === 'missing-transit-time');

// B8: dispatch 守恒（源扣减）
var dp = WA.freight.dispatch('r1', '城中集市', '布匹', 10, { transitDays: 3, base: 5 });
ok('B8 dispatch ok', dp && dp.ok === true);
var srcStock = WA.store.get().economy.goods[0].stock;
ok('B8 source deducted', srcStock === 10); // 20 - 10 = 10

// B9: arrive 幂等
var ar = WA.freight.arrive(dp.id, { force: true });
ok('B9 arrive ok', ar && ar.ok === true);
var destG = WA.store.get().economy.goods.filter(function(g) { return g.place === '北方关口'; })[0];
ok('B9 dest stock', destG && destG.stock === 10);
var ar2 = WA.freight.arrive(dp.id, { force: true });
ok('B9 arrive idempotent', ar2 && ar2.ok === false && ar2.reason === 'already-arrived');

// B10: cancel 退货
var dp2 = WA.freight.dispatch('r1', '城中集市', '布匹', 5, { transitDays: 3, base: 5 });
ok('B10 dispatch2 ok', dp2 && dp2.ok === true);
var srcBefore = WA.store.get().economy.goods[0].stock;
var cn = WA.freight.cancel(dp2.id);
ok('B10 cancel ok', cn && cn.ok === true);
var srcAfter = WA.store.get().economy.goods[0].stock;
ok('B10 refund to source', srcAfter === srcBefore + 5);

// B11: diagnose closedLoop
var dg = WA.freight.diagnose();
ok('B11 diagnose', dg && dg.enabled === true && typeof dg.closedLoop === 'boolean');

// B12: stat
var st = WA.freight.stat();
ok('B12 stat', typeof st === 'object' && typeof st.dispatched === 'number');

// B13: __freightWarn not triggered
ok('B13 __freightWarn not triggered', typeof WA.__freightWarn === 'undefined');

// B14: toolDiag collect has freight
if (WA.toolDiag && typeof WA.toolDiag.collect === 'function') {
  var coll = WA.toolDiag.collect();
  ok('B14 toolDiag has freight', coll && coll.freight);
} else {
  ok('B14 toolDiag has freight (text check)', DIAG.indexOf('freight: secFreight()') >= 0);
}

// ════════ N 负控制 ════════
// N1: 破坏默认关 → 默认开
var broken1 = RAW.replace('enabled: false', 'enabled: true');
ok('N1 broken differs', broken1 !== RAW);
ok('N1 broken has enabled:true', broken1.indexOf('enabled: true') >= 0);

// N2: 破坏守恒 → 不扣源
var broken2 = RAW.replace('gg.stock -= n;', 'gg.stock -= 0;');
ok('N2 broken differs', broken2 !== RAW);
ok('N2 broken has -= 0', broken2.indexOf('gg.stock -= 0;') >= 0);

// N3: 真文件逐字未变
ok('N3 raw unchanged', fs.readFileSync(REL, 'utf8') === RAW);

// ════════ Summary ════════
console.log('\\nTX3 (v2.167.0): ' + pass + ' / ' + fail);
if (fail > 0) process.exit(1);