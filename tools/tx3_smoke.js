'use strict';
// TX3 冒烟脚本：最小装载序下验证 freight 模块 + 守恒运输链成立
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('../tests/ui-gate-sync.js');

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('SMOKE FAIL: ' + name); } }

var WA = sync.fresh({}).WA;

// 1. freight loaded
ok('freight loaded', typeof WA.freight === 'object');

// 2. 10 exports
var ex = Object.keys(WA.freight);
ok('exports 10', ex.length === 10);

// 3. SOURCES has freight
var inj = fs.readFileSync('render/inject.js', 'utf8');
ok('SOURCES has freight', inj.indexOf("'freight'") >= 0);

// 4. PRIORITY has 货运在途
var bud = fs.readFileSync('engines/inject-budget.js', 'utf8');
ok('PRIORITY has 货运在途', bud.indexOf("'货运在途'") >= 0);

// 5. disabled by default
ok('default off', WA.freight.getSettings().enabled === false);

// 6. Enable and test dispatch守恒
WA.freight.setSettings({ enabled: true });
WA.store.transact(function(d) {
  d.economy = { goods: [], orders: [], routes: [] };
  d.economy.routes.push({ id: 'r1', lane: 'road', from: 'A', to: 'B', cost: 5, status: 'open', reason: '', at: 1000, updatedAt: 1000 });
  d.economy.goods.push({ place: 'A', resource: 'iron', base: 10, stock: 50, price: 10, demand: 0, consumed: 0, tickedAt: '', at: 1000, updatedAt: 1000 });
}, 'smoke:setup');

var dp = WA.freight.dispatch('r1', 'A', 'iron', 20, { transitDays: 2, base: 10 });
ok('dispatch ok', dp && dp.ok === true);
ok('source deducted 50->30', WA.store.get().economy.goods[0].stock === 30);

var ar = WA.freight.arrive(dp.id, { force: true });
ok('arrive ok', ar && ar.ok === true);
var destG = WA.store.get().economy.goods.filter(function(g) { return g.place === 'B'; })[0];
ok('dest stock 20', destG && destG.stock === 20);

// 7. diagnose closedLoop
var dg = WA.freight.diagnose();
ok('diagnose closedLoop', dg && typeof dg.closedLoop === 'boolean');

// 8. __freightWarn not triggered
ok('no __freightWarn', typeof WA.__freightWarn === 'undefined');

console.log('\nTX3 SMOKE: ' + pass + ' / ' + fail);
if (fail > 0) process.exit(1);