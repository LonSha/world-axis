#!/usr/bin/env node
// TX2 接线冒烟：agency 模块 + 注入链在最小装载序下成立
const fs = require('fs');
const vm = require('vm');
const FILES = ['core/clock.js', 'core/rand.js', 'core/input-guard.js',
  'core/fault-context.js', 'core/schema.js', 'core/permissions.js',
  'core/audit-log.js', 'core/sanitize.js',
  'core/settings-bus.js', 'core/store.js',
  'engines/life.js', 'engines/plan.js', 'engines/act.js',
  'engines/agency.js',
  'render/inject.js', 'engines/inject-budget.js'];
const code = FILES.map(f => fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8')).join('\n;\n');
const lsMem = {};
const ls = { getItem: k => (k in lsMem ? lsMem[k] : null), setItem: (k, v) => { lsMem[k] = String(v); }, removeItem: k => { delete lsMem[k]; } };
const sandbox = { console: console, Date: Date, setTimeout: setTimeout, localStorage: ls,
  JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number,
  Boolean: Boolean, RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat };
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.WorldAxis = sandbox.window.WorldAxis || {};
sandbox.WorldAxis.log = function () {};
vm.createContext(sandbox);
let WA;
try { vm.runInContext(code, sandbox); WA = sandbox.window.WorldAxis; }
catch (e) { console.log('BOOT_ERR', e.message); process.exit(1); }
const ok = [];
function rc(r) { if (!r || typeof r !== 'object') return { ok: false, reason: 'no-receipt' }; return (r.result && typeof r.result === 'object') ? r.result : r; }
ok.push(['agency 装载', !!WA.agency]);
ok.push(['导出 7 成员', Object.keys(WA.agency).length === 7]);
ok.push(['SOURCES 含 agency', (WA.render && WA.render.SOURCES) ? WA.render.SOURCES.indexOf('agency') >= 0 : '（render 未导出，跳过）']);
ok.push(['PRIORITY 含 行动调度', (WA.injectBudget && WA.injectBudget.PRIORITY) ? !!WA.injectBudget.PRIORITY['行动调度'] || '（PRIORITY 未导出，跳过——静态锁已过）' : '（injectBudget 未导出，跳过）']);
// 开启行动闭环 → 造目标 → 验证 schedule 返回 need-steps（不编步骤）
try {
  WA.agency.setSettings({ enabled: true });
  if (WA.store && WA.store.init) WA.store.init();
  if (WA.life && WA.life.addGoal) {
    WA.life.addGoal('冒烟员', { id: 'g1', text: '造桥', status: 'active' });
  }
  const r = rc(WA.agency.schedule('冒烟员', Date.now()));
  ok.push(['无计划 → need-steps', !r.ok && (r.reason === 'need-steps' || r.reason === 'no-plan')]);
  const d = WA.agency.diagnose();
  ok.push(['diagnose closedLoop', typeof d.closedLoop === 'boolean']);
  ok.push(['__agencyWarn 未触发', !WA.__agencyWarn]);
} catch (e) { ok.push(['造局验证', false, e.message]); }
let pass = 0, fail = 0;
ok.forEach(function (t) {
  if (t[1] === true) pass++;
  else { fail++; console.log('  ✗ ' + t[0] + (t[2] ? '：' + t[2] : '')); }
});
console.log('TX2_SMOKE: pass ' + pass + ' / fail ' + fail);
process.exit(fail ? 1 : 0);