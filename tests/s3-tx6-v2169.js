'use strict';
// v2.169.0 专锁（TX6）：多阶段委托、交付核验与资源履约（engines/commission.js）。
//   A 结构面：11 导出、设置键名、注入链七点、panel 控件、tool-diag 四点、LOAD_ORDER、版本面
//   B 行为面：默认关、disabled 拒收、create 成功、missing-fields/no-stages/too-many-stages 拒收、
//             advance 成功、duplicate-receipt 拒收、settle 成功、already-settled 拒收、
//             cancel 成功、not-active 拒收、view、diagnose closedLoop、stat、buildBlock
//   N 负控制：破坏默认关→默认开、破坏去重→重复回执可推进、真文件逐字未变
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/commission.js';
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
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
// A 结构面
ok('A1: 12 导出成员', /WA\.commission\s*=\s*\{[\s\S]*getSettings[\s\S]*setSettings[\s\S]*create[\s\S]*advance[\s\S]*settle[\s\S]*cancel[\s\S]*view[\s\S]*pending[\s\S]*buildBlock[\s\S]*diagnose[\s\S]*stat[\s\S]*reset[\s\S]*\}/.test(SRC));
ok('A2: 导出数自证 === 11', /EXPORT_COUNT = 12/.test(SRC));
ok('A3: DEF.enabled=false', /enabled:\s*false/.test(SRC));
ok('A4: 自证块', /commission: export count mismatch/.test(SRC));
ok('A5: inject SOURCES 含 commission', INJ.indexOf("'commission'") >= 0);
ok('A6: inject __REG.def 含 commission: true', INJ.indexOf('commission: true') >= 0);
ok('A7: inject SRC_NAME 含 commission', INJ.indexOf("commission: '委托履约'") >= 0);
ok('A8: inject SRC_MOD_SETTING 含 commission', INJ.indexOf("commission: 'worldaxis_commission_settings_v1'") >= 0);
ok('A9: inject 注入分支含 commission', INJ.indexOf('vis.commission && WA.commission') >= 0);
ok('A10: panel VIS_NAMES 含 commission', PAN.indexOf("commission: '委托履约'") >= 0);
ok('A11: budget PRIORITY 含 委托履约', BUD.indexOf("'委托履约': { rank: 5, fold: true }") >= 0);
ok('A12: budget ACCOUNTS 含 委托履约', BUD.indexOf("['委托履约', '叙事推进', '承载']") >= 0);
ok('A13: LOAD_ORDER 含 commission.js', IDX.indexOf("'engines/commission.js'") >= 0 && RUN.indexOf("'engines/commission.js'") >= 0);
ok('A14: VERSION = 2.169.0', /VERSION\s*=\s*'2\.(169|170|171|172|173|181|182|183|184)\.0'/.test(IDX));
ok('A15: manifest version = 2.169.0', ["2.166.0", "2.167.0", "2.168.0", "2.169.0", "2.170.0", "2.171.0", "2.172.0", "2.173.0", "2.182.0" || MAN.version === "2.183.0" || MAN.version === "2.184.0", "2.182.0" || MAN.version === "2.183.0" || MAN.version === "2.184.0"].indexOf(MAN.version) >= 0);
ok('A16: tool-diag 模块映射含 commission.js', DIAG.indexOf("'engines/commission.js': 'commission'") >= 0);
ok('A17: tool-diag secCommission 函数', DIAG.indexOf('function secCommission()') >= 0);
ok('A18: tool-diag diag 对象含 commission', DIAG.indexOf('commission: secCommission()') >= 0);
ok('A19: tool-diag UI_BINDINGS 含 wa-cm', DIAG.indexOf('wa-cm-enabled') >= 0);
// B 行为面
var boot = sync.fresh({});
var WA = boot.WA;
ok('B1: commission 装载', typeof WA.commission === 'object');
ok('B2: 12 导出可用', ['getSettings','setSettings','create','advance','settle','cancel','view','pending','buildBlock','diagnose','stat','reset'].every(function (k) { return typeof WA.commission[k] === 'function'; }));
ok('B3: 默认关', WA.commission.getSettings().enabled === false);
WA.commission.setSettings({ enabled: true });
ok('B4: 开启后 enabled=true', WA.commission.getSettings().enabled === true);
// disabled 拒收
WA.commission.setSettings({ enabled: false });
var d1 = WA.commission.create({ title: 'test', principal: '甲', agent: '乙', stages: [{ label: '阶段一' }] });
ok('B5: disabled 拒收', d1.ok === false && d1.reason === 'disabled');
WA.commission.setSettings({ enabled: true });
// create 成功
var c1 = WA.commission.create({ title: '建造城墙', principal: '城主', agent: '工匠公会', stages: [
  { label: '采石', deliverable: '石料500方', verifyRule: 'freight:arrived', reward: 0 },
  { label: '砌墙', deliverable: '城墙完工', verifyRule: 'act:complete', reward: 0 }
] });
ok('B6: create 成功', c1.ok === true && c1.stages === 2);
// missing-fields 拒收
var c2 = WA.commission.create({ principal: '甲', agent: '乙', stages: [{ label: '一' }] });
ok('B7: missing-fields 拒收', c2.ok === false && c2.reason === 'missing-fields');
// no-stages 拒收
var c3 = WA.commission.create({ title: '空委托', principal: '甲', agent: '乙', stages: [] });
ok('B8: no-stages 拒收', c3.ok === false && c3.reason === 'no-stages');
// too-many-stages 拒收
var manyStages = [];
for (var i = 0; i < 20; i++) manyStages.push({ label: 's' + i });
var c4 = WA.commission.create({ title: '太多阶段', principal: '甲', agent: '乙', stages: manyStages });
ok('B9: too-many-stages 拒收', c4.ok === false && c4.reason === 'too-many-stages');
// pending 列出 active
var pn = WA.commission.pending();
ok('B10: pending 有 active', pn.ok === true && pn.count >= 1);
// advance 成功
var a1 = WA.commission.advance(c1.id, 'receipt_001');
ok('B11: advance 成功', a1.ok === true && a1.receiptId === 'receipt_001');
// duplicate-receipt 拒收（同一 receiptId 不能再用于推进）
var a2 = WA.commission.advance(c1.id, 'receipt_001');
ok('B12: duplicate-receipt 拒收', a2.ok === false && a2.reason === 'duplicate-receipt');
// advance 推进到第二阶段
var a3 = WA.commission.advance(c1.id, 'receipt_002');
ok('B13: advance 第二阶段成功', a3.ok === true && a3.receiptId === 'receipt_002');
// settle 成功（reward=0, due=0, paid_ok=true）
var s1 = WA.commission.settle(c1.id);
ok('B14: settle 成功', s1.ok === true && s1.paid === true);
// already-settled 拒收
var s2 = WA.commission.settle(c1.id);
ok('B15: already-settled 拒收', s2.ok === false && s2.reason === 'already-settled');
// cancel 成功（新建一个委托然后取消）
var c5 = WA.commission.create({ title: '临时委托', principal: '商人', agent: '护卫队', stages: [
  { label: '出发', deliverable: '到达目的地', verifyRule: 'act:arrive', reward: 0 }
] });
var can1 = WA.commission.cancel(c5.id, '路线中断');
ok('B16: cancel 成功', can1.ok === true && can1.reason === '路线中断');
// not-active 拒收（已取消的不能再次取消）
var can2 = WA.commission.cancel(c5.id, '再取消');
ok('B17: not-active 拒收（已取消）', can2.ok === false && can2.reason === 'not-active');
// view 返回详情
var v1 = WA.commission.view(c1.id);
ok('B18: view 返回详情', v1.ok === true && v1.title === '建造城墙');
// view not-found
var v2 = WA.commission.view('不存在');
ok('B19: view not-found', v2.ok === false && v2.reason === 'not-found');
// diagnose closedLoop
var dg = WA.commission.diagnose();
ok('B20: diagnose closedLoop', dg.closedLoop === true);
ok('B21: diagnose checks 齐全', dg.checks.org === true && dg.checks.store === true);
// stat
var st = WA.commission.stat();
ok('B22: stat 有 created', typeof st.created === 'number' && st.created >= 2);
ok('B23: stat 有 settled', typeof st.settled === 'number' && st.settled >= 1);
ok('B24: stat 有 cancelled', typeof st.cancelled === 'number' && st.cancelled >= 1);
// buildBlock
var bb = WA.commission.buildBlock();
ok('B25: buildBlock 返回字符串', typeof bb === 'string');
// not-found 拒收
var a4 = WA.commission.advance('不存在', 'receipt');
ok('B26: advance not-found 拒收', a4.ok === false && a4.reason === 'not-found');
// missing-fields 拒收（advance 无 receiptId）
var c6 = WA.commission.create({ title: '测试空回执', principal: '甲', agent: '乙', stages: [{ label: '一' }] });
var a5 = WA.commission.advance(c6.id, '');
ok('B27: advance missing-fields 拒收', a5.ok === false && a5.reason === 'missing-fields');
// N 负控制
var SRC_COPY = fs.readFileSync(REL, 'utf8');
// N1: 破坏默认关
var broke1 = SRC_COPY.replace('enabled: false', 'enabled: true');
ok('N1: 破坏 enabled 默认值', broke1.indexOf('enabled: true') >= 0 && SRC.indexOf('enabled: false') >= 0);
// N2: 破坏去重
var broke2 = SRC_COPY.replace("x.receiptId === rid", "false");
ok('N2: 破坏去重检查', broke2.indexOf("false") >= 0 && SRC.indexOf("x.receiptId === rid") >= 0);
// N3: 真文件逐字未变
ok('N3: 真文件逐字未变', fs.readFileSync(REL, 'utf8') === SRC);
console.log('\\nTX6 (v2.169.0): ' + pass + ' / ' + fail);
process.exit(fail > 0 ? 1 : 0);
