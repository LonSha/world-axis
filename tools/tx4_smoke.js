'use strict';
var path = require('path');
var BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
var sync = require('../tests/ui-gate-sync.js');
var boot = sync.fresh({});
var WA = boot.WA;
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }

ok('storyChoice 装载', typeof WA.storyChoice === 'object');
ok('10 导出', ['getSettings','setSettings','present','confirm','review','pending','buildBlock','diagnose','stat','reset'].every(function(k) { return typeof WA.storyChoice[k] === 'function'; }));
ok('SOURCES 含 storyChoice', require('fs').readFileSync('render/inject.js','utf8').indexOf("'storyChoice'") >= 0);
ok('PRIORITY 含 故事分支', require('fs').readFileSync('engines/inject-budget.js','utf8').indexOf('故事分支') >= 0);
ok('默认关', WA.storyChoice.getSettings().enabled === false);
WA.storyChoice.setSettings({ enabled: true });
var p1 = WA.storyChoice.present({ round: 1, prompt: '选择A还是B', options: [{ label: 'A', costs: '10' }, { label: 'B', costs: '20' }] });
ok('present 成功', p1.ok === true && p1.options.length === 2);
var c1 = WA.storyChoice.confirm(p1.id, 'A');
ok('confirm chosen=true', c1.chosen === true);
ok('confirm applied=false（无 ops）', c1.applied === false);
ok('already-confirmed 拒收', WA.storyChoice.confirm(p1.id, 'B').reason === 'already-confirmed');
ok('review 只读', WA.storyChoice.review(p1.id).ok === true);
ok('pending 有 0 个', WA.storyChoice.pending().count === 0);
ok('diagnose closedLoop', WA.storyChoice.diagnose().closedLoop === true);
ok('stat 有 presented', WA.storyChoice.stat().presented >= 1);

console.log('TX4 smoke: ' + pass + '/' + (pass+fail));
process.exit(fail > 0 ? 1 : 0);
