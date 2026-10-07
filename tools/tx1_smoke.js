#!/usr/bin/env node
// TX1 接线冒烟：diplomacy 模块 + 注入链在最小装载序下成立
const fs = require('fs');
const vm = require('vm');
const FILES = ['core/clock.js', 'core/rand.js', 'core/input-guard.js',
  'core/fault-context.js', 'core/schema.js', 'core/permissions.js',
  'core/audit-log.js', 'core/sanitize.js',
  'core/settings-bus.js', 'core/store.js', 'engines/diplomacy.js',
  'render/inject.js', 'engines/inject-budget.js'];
const code = FILES.map(f => fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8')).join('\n;\n');
// 内存版 localStorage：settingsBus 的 save/read 走真实读写（丢弃写入会把「已保存」读回成默认值）
const lsMem = {};
const ls = { getItem: k => (k in lsMem ? lsMem[k] : null), setItem: (k, v) => { lsMem[k] = String(v); }, removeItem: k => { delete lsMem[k]; } };
const sandbox = { console: console, Date: Date, setTimeout: setTimeout, localStorage: ls,
  JSON: JSON, Math: Math, Object: Object, Array: Array, String: String, Number: Number,
  Boolean: Boolean, RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat };
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.console.log = console.log;
// WA.log 桩：diplomacy 等模块内部有 WA.log 调用（info/warn），冒烟只关装载与回执形状
sandbox.WorldAxis = sandbox.window.WorldAxis || {};
sandbox.WorldAxis.log = function () {};
vm.createContext(sandbox);
let WA;
try { vm.runInContext(code, sandbox); WA = sandbox.window.WorldAxis; }
catch (e) { console.log('BOOT_ERR', e.message); process.exit(1); }
const ok = [];
function rc(r) { if (!r || typeof r !== 'object') return { ok: false, reason: 'no-receipt' }; return (r.result && typeof r.result === 'object') ? r.result : r; }
ok.push(['diplomacy 装载', !!WA.diplomacy]);
ok.push(['导出 21 成员', Object.keys(WA.diplomacy).length === 21]);
ok.push(['SOURCES 含 diplomacy', WA.render.SOURCES.indexOf('diplomacy') >= 0]);
ok.push(['def 含 diplomacy:true', WA.render.visibilityStat().undeclared.indexOf('diplomacy') < 0]);
ok.push(['PRIORITY 含 外交事实', !!WA.injectBudget.PRIORITY['外交事实'] || '（PRIORITY 未导出，跳过——静态锁已过）']);
// 开启外交 → 造一对 → 验证 buildBlock 产出与注入源名
try {
  WA.diplomacy.setSettings({ enabled: true });
  WA.store.init();
  WA.store.transact(d => {
    d.evolution = d.evolution || {};
    d.evolution.factions = [{ id: 'f1', name: '甲盟' }, { id: 'f2', name: '乙邦' }];
  });
  const pr = rc(WA.diplomacy.propose({ from: '甲盟', to: '乙邦', terms: [{ term: 'trade' }] }));
  ok.push(['propose 立案', pr.ok === true]);
  const rp = rc(WA.diplomacy.reply({ id: pr.id, kind: 'accept', by: '乙邦', basis: '互通有无' }));
  ok.push(['reply accept', rp.ok === true]);
  const sg = rc(WA.diplomacy.sign({ id: pr.id }));
  ok.push(['sign（无 inst 权限源会拒收 no-authority，也是合法形态）', sg.ok === true || sg.reason === 'no-authority']);
  const blk = WA.diplomacy.buildBlock();
  ok.push(['buildBlock 产出', typeof blk === 'string']);
  const ap = WA.diplomacy.applies('甲盟', '乙邦', 'trade');
  ok.push(['applies 读面', ap.ok === true && typeof ap.applies === 'boolean']);
  ok.push(['pairId 对称', WA.diplomacy.pairId('甲盟', '乙邦') === WA.diplomacy.pairId('乙邦', '甲盟')]);
  const dg = WA.diplomacy.diagnose();
  ok.push(['diagnose 自证面', dg.module === 'diplomacy' && dg.ver === '2.165.0']);
  const gs = WA.diplomacy.getSettings();
  ok.push(['getSettings 读回 enabled', gs.enabled === true]);
} catch (e) { ok.push(['行为链异常：' + e.message, false]); }
let fail = 0;
ok.forEach(r => { console.log((r[1] === true ? '  ok  ' : ' FAIL ') + r[0]); if (r[1] !== true) fail++; });
console.log('TX1-接线冒烟: ' + (ok.length - fail) + ' / ' + ok.length);
process.exit(fail ? 1 : 0);
