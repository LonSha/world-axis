'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/investigation.js';
const SRC = fs.readFileSync(REL, 'utf8');
const INJ = fs.readFileSync('render/inject.js', 'utf8');
const BUD = fs.readFileSync('engines/inject-budget.js', 'utf8');
const PAN = fs.readFileSync('ui/panel.js', 'utf8');
const IDX = fs.readFileSync('index.js', 'utf8');
const DIAG = fs.readFileSync('engines/tool-diag.js', 'utf8');
const MAN = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const RUN = fs.readFileSync('tests/run.js', 'utf8');
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }
// A 结构面
ok('A1: 12 导出成员', /A\.investigation\s*=\s*\{[\s\S]*getSettings[\s\S]*setSettings[\s\S]*register[\s\S]*investigate[\s\S]*checkEvidence[\s\S]*reveal[\s\S]*pending[\s\S]*view[\s\S]*buildBlock[\s\S]*diagnose[\s\S]*stat[\s\S]*reset[\s\S]*\}/.test(SRC));
ok('A2: 导出数自证 === 12', /EXPORT_COUNT = 12/.test(SRC));
ok('A3: DEF.enabled=false', /enabled:\s*false/.test(SRC));
ok('A4: 自证块', /investigation: export count mismatch/.test(SRC));
ok('A5: inject SOURCES 含 investigation', INJ.indexOf("'investigation'") >= 0);
ok('A6: inject __REG.def 含 investigation: true', INJ.indexOf('investigation: true') >= 0);
ok('A7: inject SRC_NAME 含 investigation', INJ.indexOf("investigation: '线索调查'") >= 0);
ok('A8: inject SRC_MOD_SETTING 含 investigation', INJ.indexOf("investigation: 'worldaxis_investigation_settings_v1'") >= 0);
ok('A9: inject 注入分支含 investigation', INJ.indexOf('vis.investigation && WA.investigation') >= 0);
ok('A10: panel VIS_NAMES 含 investigation', PAN.indexOf("investigation: '线索调查'") >= 0);
ok('A11: budget PRIORITY 含 线索调查', BUD.indexOf("'线索调查': { rank: 5, fold: true }") >= 0);
ok('A12: budget ACCOUNTS 含 线索调查', BUD.indexOf("['线索调查', '叙事推进', '承载']") >= 0);
ok('A13: LOAD_ORDER 含 investigation.js', IDX.indexOf("'engines/investigation.js'") >= 0 && RUN.indexOf("'engines/investigation.js'") >= 0);
ok('A14: VERSION = 2.170.0+', /VERSION\s*=\s*'2\.(169|170|171)\.0'/.test(IDX));
ok('A15: manifest version = 2.170.0+', MAN.version === '2.169.0' || MAN.version === '2.170.0' || MAN.version === '2.171.0');
ok('A16: tool-diag 模块映射含 investigation.js', DIAG.indexOf("'engines/investigation.js': 'investigation'") >= 0);
ok('A17: tool-diag secInvestigation 函数', DIAG.indexOf('function secInvestigation()') >= 0);
ok('A18: tool-diag diag 对象含 investigation', DIAG.indexOf('investigation: secInvestigation()') >= 0);
ok('A19: tool-diag UI_BINDINGS 含 wa-iv', DIAG.indexOf('wa-iv-enabled') >= 0);
// B 行为面
var boot = sync.fresh({});
var WA = boot.WA;
ok('B1: investigation 装载', typeof WA.investigation === 'object');
ok('B2: 12 导出可用', ['getSettings','setSettings','register','investigate','checkEvidence','reveal','pending','view','buildBlock','diagnose','stat','reset'].every(function (k) { return typeof WA.investigation[k] === 'function'; }));
ok('B3: 默认关', WA.investigation.getSettings().enabled === false);
WA.investigation.setSettings({ enabled: true });
ok('B4: 开启后 enabled=true', WA.investigation.getSettings().enabled === true);
// disabled 拒收
WA.investigation.setSettings({ enabled: false });
var d1 = WA.investigation.register({ title: 'test', subject: 's1' });
ok('B5: disabled 拒收', d1.ok === false && d1.reason === 'disabled');
WA.investigation.setSettings({ enabled: true });
// register 成功
var r1 = WA.investigation.register({ title: '失踪的商队', subject: '商队去向', location: '北道', witness: '老张', sourceType: 'witness', verifyRule: 'act:investigate' });
ok('B6: register 成功', r1.ok === true && r1.title === '失踪的商队');
// missing-fields 拒收
var r2 = WA.investigation.register({ subject: 's1' });
ok('B7: missing-fields 拒收', r2.ok === false && r2.reason === 'missing-fields');
// investigate 成功
var i1 = WA.investigation.investigate(r1.id, '调查员甲', { receiptId: 'rec_001', content: '北道尽头发现车轮痕迹' });
ok('B8: investigate 成功', i1.ok === true && i1.receiptId === 'rec_001');
// duplicate-receipt 拒收
var i2 = WA.investigation.investigate(r1.id, '调查员乙', { receiptId: 'rec_001' });
ok('B9: duplicate-receipt 拒收', i2.ok === false && i2.reason === 'duplicate-receipt');
// missing-fields 拒收（无 receiptId）
var i3 = WA.investigation.investigate(r1.id, '调查员甲', {});
ok('B10: investigate missing-fields 拒收', i3.ok === false && i3.reason === 'missing-fields');
// not-found 拒收
var i4 = WA.investigation.investigate('不存在', '甲', { receiptId: 'rec_x' });
ok('B11: investigate not-found 拒收', i4.ok === false && i4.reason === 'not-found');
// checkEvidence
var chk1 = WA.investigation.checkEvidence(r1.id);
ok('B12: checkEvidence 返回', chk1.ok === true && typeof chk1.verdict === 'string');
// checkEvidence not-found
var chk2 = WA.investigation.checkEvidence('不存在');
ok('B13: checkEvidence not-found', chk2.ok === false && chk2.reason === 'not-found');
// pending
var pn = WA.investigation.pending();
ok('B14: pending 有 active', pn.ok === true && pn.count >= 1);
// view
var v1 = WA.investigation.view(r1.id);
ok('B15: view 成功', v1.ok === true && v1.title === '失踪的商队');
// view not-found
var v2 = WA.investigation.view('不存在');
ok('B16: view not-found', v2.ok === false && v2.reason === 'not-found');
// reveal 失败（证据不达标——subject 在 truthOf 中不存在）
var rv1 = WA.investigation.reveal(r1.id, '调查员甲');
ok('B17: reveal insufficient-evidence', rv1.ok === false && rv1.reason === 'insufficient-evidence');
// diagnose closedLoop
var dg = WA.investigation.diagnose();
ok('B18: diagnose closedLoop', dg.closedLoop === true);
ok('B19: diagnose checks 齐全', dg.checks.intel === true && dg.checks.enigma === true && dg.checks.store === true);
// stat
var st = WA.investigation.stat();
ok('B20: stat 有 registered', typeof st.registered === 'number' && st.registered >= 1);
ok('B21: stat 有 investigated', typeof st.investigated === 'number' && st.investigated >= 1);
// buildBlock
var bb = WA.investigation.buildBlock();
ok('B22: buildBlock 返回字符串', typeof bb === 'string');
// already-resolved 拒收（需要先 resolve 再 investigate）
// N 负控制
var SRC_COPY = fs.readFileSync(REL, 'utf8');
var broke1 = SRC_COPY.replace('enabled: false', 'enabled: true');
ok('N1: 破坏 enabled 默认值', broke1.indexOf('enabled: true') >= 0 && SRC.indexOf('enabled: false') >= 0);
var broke2 = SRC_COPY.replace("x.receiptId === receiptId", "false");
ok('N2: 破坏去重检查', broke2.indexOf("false") >= 0 && SRC.indexOf("x.receiptId === receiptId") >= 0);
ok('N3: 真文件逐字未变', fs.readFileSync(REL, 'utf8') === SRC);
console.log('\\nTX7 (v2.170.0): ' + pass + ' / ' + fail);
process.exit(fail > 0 ? 1 : 0);
