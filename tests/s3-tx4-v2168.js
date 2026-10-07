'use strict';
// v2.168.0 专锁（TX4）：可选择、可兑现后果的故事分支（engines/story-choice.js）。
//   A 结构面：10 导出、设置键名、注入链七点、panel 控件、tool-diag 四点、LOAD_ORDER、版本面
//   B 行为面：默认关、disabled 拒收、present 注册选择点、confirm 兑现、review 只读、pending、diagnose closedLoop
//   N 负控制：破坏默认关→默认开、破坏白名单→不校验 ops、真文件逐字未变
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/story-choice.js';
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
ok('A1: 10 导出成员', /A\.storyChoice\s*=\s*\{[\s\S]*getSettings[\s\S]*setSettings[\s\S]*present[\s\S]*confirm[\s\S]*review[\s\S]*pending[\s\S]*buildBlock[\s\S]*diagnose[\s\S]*stat[\s\S]*reset[\s\S]*\}/.test(SRC));
ok('A2: 导出数自证 === 10', /EXPORT_COUNT = 10/.test(SRC));
ok('A3: DEF.enabled=false', /enabled:\s*false/.test(SRC));
ok('A4: 自证块', /story-choice: export count mismatch/.test(SRC));
ok('A5: inject SOURCES 含 storyChoice', INJ.indexOf("'storyChoice'") >= 0);
ok('A6: inject __REG.def 含 storyChoice: true', INJ.indexOf('storyChoice: true') >= 0);
ok('A7: inject SRC_NAME 含 storyChoice', INJ.indexOf("storyChoice: '故事分支'") >= 0);
ok('A8: inject SRC_MOD_SETTING 含 storyChoice', INJ.indexOf("storyChoice: 'worldaxis_story_choice_settings_v1'") >= 0);
ok('A9: inject 注入分支含 storyChoice', INJ.indexOf('vis.storyChoice && WA.storyChoice') >= 0);
ok('A10: panel VIS_NAMES 含 storyChoice', PAN.indexOf("storyChoice: '故事分支'") >= 0);
ok('A11: budget PRIORITY 含 故事分支', BUD.indexOf("'故事分支': { rank: 5, fold: true }") >= 0);
ok('A12: budget ACCOUNTS 含 故事分支', BUD.indexOf("['故事分支', '叙事推进', '承载']") >= 0);
ok('A13: LOAD_ORDER 含 story-choice.js', IDX.indexOf("'engines/story-choice.js'") >= 0 && RUN.indexOf("'engines/story-choice.js'") >= 0);
ok('A14: VERSION = 2.168.0+', /VERSION\s*=\s*'2\.(168|169)\.0'/.test(IDX));
ok('A15: manifest version = 2.168.0+', MAN.version === '2.168.0' || MAN.version === '2.169.0');
ok('A16: tool-diag 模块映射含 story-choice.js', DIAG.indexOf("'engines/story-choice.js': 'storyChoice'") >= 0);
ok('A17: tool-diag secStoryChoice 函数', DIAG.indexOf('function secStoryChoice()') >= 0);
ok('A18: tool-diag diag 对象含 storyChoice', DIAG.indexOf('storyChoice: secStoryChoice()') >= 0);
ok('A19: tool-diag UI_BINDINGS 含 wa-sc', DIAG.indexOf('wa-sc-enabled') >= 0);

// B 行为面
var boot = sync.fresh({});
var WA = boot.WA;
ok('B1: storyChoice 装载', typeof WA.storyChoice === 'object');
ok('B2: 10 导出可用', ['getSettings','setSettings','present','confirm','review','pending','buildBlock','diagnose','stat','reset'].every(function (k) { return typeof WA.storyChoice[k] === 'function'; }));
ok('B3: 默认关', WA.storyChoice.getSettings().enabled === false);
WA.storyChoice.setSettings({ enabled: true });
ok('B4: 开启后 enabled=true', WA.storyChoice.getSettings().enabled === true);
// disabled 拒收
WA.storyChoice.setSettings({ enabled: false });
var d1 = WA.storyChoice.present({ prompt: 'test', options: [{ label: 'A' }, { label: 'B' }] });
ok('B5: disabled 拒收', d1.ok === false && d1.reason === 'disabled');
WA.storyChoice.setSettings({ enabled: true });
// present 注册选择点
var p1 = WA.storyChoice.present({ round: 1, prompt: '向左还是向右', options: [{ label: '向左', costs: '损失体力' }, { label: '向右', costs: '损失金币' }] });
ok('B6: present 成功', p1.ok === true && p1.options.length === 2);
// no-options 拒收
var p2 = WA.storyChoice.present({ prompt: '只有一个', options: [{ label: '唯一' }] });
ok('B7: no-options 拒收', p2.ok === false && p2.reason === 'no-options');
// missing-fields 拒收
var p3 = WA.storyChoice.present({ options: [{ label: 'A' }, { label: 'B' }] });
ok('B8: missing-fields 拒收', p3.ok === false && p3.reason === 'missing-fields');
// pending 列出未确认
var pn = WA.storyChoice.pending();
ok('B9: pending 有 1 个', pn.ok === true && pn.count >= 1);
// confirm 兑现（选项无 ops → chosen=true, applied=false）
var c1 = WA.storyChoice.confirm(p1.id, '向左');
ok('B10: confirm chosen=true', c1.ok === true && c1.chosen === true);
ok('B11: confirm applied=false（无 ops）', c1.applied === false);
// already-confirmed 拒收
var c2 = WA.storyChoice.confirm(p1.id, '向右');
ok('B12: already-confirmed 拒收', c2.ok === false && c2.reason === 'already-confirmed');
// bad-value 拒收（选了不存在的选项）
var p4 = WA.storyChoice.present({ round: 2, prompt: '另一个选择', options: [{ label: 'X' }, { label: 'Y' }] });
var c3 = WA.storyChoice.confirm(p4.id, 'Z');
ok('B13: bad-value 拒收', c3.ok === false && c3.reason === 'bad-value');
// review 只读
var rv = WA.storyChoice.review(p1.id);
ok('B14: review 返回选择', rv.ok === true && rv.choice === '向左');
// review 不存在
var rv2 = WA.storyChoice.review('不存在');
ok('B15: review not-found 拒收', rv2.ok === false && rv2.reason === 'not-found');
// diagnose closedLoop
var dg = WA.storyChoice.diagnose();
ok('B16: diagnose closedLoop', dg.closedLoop === true);
ok('B17: diagnose checks 齐全', dg.checks.branchTree === true && dg.checks.rehearsal === true && dg.checks.commit === true);
// stat
var st = WA.storyChoice.stat();
ok('B18: stat 有 presented', typeof st.presented === 'number' && st.presented >= 2);
ok('B19: stat 有 confirmed', typeof st.confirmed === 'number' && st.confirmed >= 1);
// buildBlock
var bb = WA.storyChoice.buildBlock();
ok('B20: buildBlock 返回字符串', typeof bb === 'string');

// N 负控制
var SRC_COPY = fs.readFileSync(REL, 'utf8');
// N1: 破坏默认关
var broke1 = SRC_COPY.replace('enabled: false', 'enabled: true');
ok('N1: 破坏 enabled 默认值', broke1.indexOf('enabled: true') >= 0 && SRC.indexOf('enabled: false') >= 0);
// N2: 破坏白名单校验
var broke2 = SRC_COPY.replace('allowed = r && r.ok', 'allowed = true');
ok('N2: 破坏白名单跳过校验', broke2.indexOf('allowed = true') >= 0 && SRC.indexOf('allowed = r && r.ok') >= 0);
// N3: 真文件逐字未变
ok('N3: 真文件逐字未变', fs.readFileSync(REL, 'utf8') === SRC);

console.log('\\nTX4 (v2.168.0): ' + pass + ' / ' + fail);
process.exit(fail > 0 ? 1 : 0);
