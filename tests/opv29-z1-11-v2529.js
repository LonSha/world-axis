#!/usr/bin/env node
// WorldAxis tests/opv29-z1-11-v2529.js — V29 优化线 Z1（OPV29-11）专锁
//
// 治的病
//   计划原文：「`backstage` / `world-lab` / `world.js` 拆段：三件按职责切」，验收
//   「拆段后 `A_MOUNT` 等跟位判据不红」。三件都一千二百行以上、其中一大截是**契约文本与
//   封闭词表**（七步判断协议、可见性语义、结构规则、注入规则；场所/事件/用途/通道/封锁等级；
//   三条路径封闭集、沙盒轮数常量、适配器种子表）——改一个词要在一千多行里翻。
//
// 本锁钉住「表已分离、导出面没变、次序硬约束还在、缺表不许静默退化」：
//   A 现场：三引擎瘦身 + 三表零算法 + 三表载荷键数 + 引擎里已无那些常量 + 双登记同序 + 导出面不变。
//   B 负控制：真起隔离装载——只装引擎必抛 · 空表必抛 · 先表后引擎必成 · 次序判据喂假表必红。
//   C 真跑：三件装载后的可用面（backstage.getSettings / worldLab.catalog / world.transit）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++; const line = name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra));
  console.log('  ✗ ' + line); return false;
}
const TRIPLE = [
  { eng: 'engines/backstage.js', tab: 'engines/backstage-protocols.js', engMax: 1150,
    tabLines: 167, tabKeys: 8, ns: 'backstageProtocols', varName: 'backstageProtocols' },
  { eng: 'engines/world-lab.js', tab: 'engines/world-lab-tables.js', engMax: 1290,
    tabLines: 66, tabKeys: 15, ns: 'worldLabTables', varName: 'worldLabTables' },
  { eng: 'engines/world.js', tab: 'engines/world-tables.js', engMax: 1340,
    tabLines: 61, tabKeys: 10, ns: 'worldTables', varName: 'worldTables' }
];
const RD = function (rel) {
  return fs.readFileSync(path.isAbsolute(rel) ? rel : path.join(ROOT, rel), 'utf8'); };
const lines = function (rel) { return RD(rel).split('\n').length - 1; };

// ── A. 现场 ───────────────────────────────────────────
TRIPLE.forEach(function (t, i) {
  const n = i + 1;
  a(lines(t.eng) <= t.engMax, 'A' + n + 'a ' + t.eng + ' 已瘦身（实 ' + lines(t.eng)
    + ' 行 ≤ ' + t.engMax + '）', lines(t.eng));
  a(lines(t.tab) === t.tabLines, 'A' + n + 'b ' + t.tab + ' 体量（实 ' + lines(t.tab)
    + ' 行 = ' + t.tabLines + '）', lines(t.tab));
  const tabSrc = RD(t.tab);
  const namedFns = (tabSrc.match(/function\s+[A-Za-z_$]/g) || []).length;
  const iifes = (tabSrc.match(/\(function\s*\(\)/g) || []).length;
  a(namedFns === 0 && iifes === 1,
    'A' + n + 'c ' + t.tab + ' 零算法（具名函数 ' + namedFns + ' 个 / IIFE ' + iifes + ' 个）');
  a(new RegExp('=\\s*WA\\.' + t.varName + '\\s*;').test(RD(t.eng))
    && /必须先于/.test(RD(t.eng)),
    'A' + n + 'd ' + t.eng + ' 求值期先取表（守卫 + 「必须先于」提示都在场）');
});

// 三表载荷键数（逐字点名，防「搬过去时漏一块」）
a(Object.keys(RD(TRIPLE[0].tab).match(/REASONING_PROTOCOL|VISIBILITY_SEMANTICS|STRUCTURAL_RULES|INJECTION_RULES|SIM_MODES|TIME_POLICIES|PULSE_LEVELS|__REG_B/g) || []).length >= 8,
  'A4 协议表八件齐（七份协议文本 + 设置登记表）');
['ARMS', 'ARM_CN', 'HOLD_STEP', 'MAX_ROUNDS', 'DEF_SIM_ROUNDS', 'SIM_ROUND_MS', 'MAX_AHEAD',
  'BEAT_FACES', 'BEAT_SANDBOX_MEMBERS', 'ADAPTERS', 'DEF', 'LS_KEY', '__REG', 'FORMAT', 'MOD_TAG'
].forEach(function (k) {
  if (!new RegExp('\\b' + k + ': ' + k + '\\b').test(RD(TRIPLE[1].tab))) {
    a(false, 'A5 world-lab 表里缺键 ' + k);
  }
});
a(true, 'A5 world-lab 表十五件齐（三条路径 / 轮数常量 / 拍面 / 适配器 / 登记表）');
['PLACE_KINDS', 'EVENT_KINDS', 'USE_KINDS', 'CHANNELS', 'BLOCK_SOURCES', 'ROAD_CHANNELS',
  'BLOCK_LEVEL', '__REG', 'DEF', 'LS_KEY'
].forEach(function (k) {
  if (!new RegExp('\\b' + k + ': ' + k + '\\b').test(RD(TRIPLE[2].tab))) {
    a(false, 'A6 world 表里缺键 ' + k);
  }
});
a(true, 'A6 world 表十件齐（七张封闭词表 + 登记表 + 默认值 + 键名）');

// 引擎里已无那些常量定义（七处协议 / 词表 / 常量必须一字不在）
const GONE = {
  'engines/backstage.js': ['const REASONING_PROTOCOL = `', 'const PULSE_LEVELS = {', 'const __REG_B = {'],
  'engines/world-lab.js': ['const ARMS = [', 'const ADAPTERS = [', 'const MAX_ROUNDS = 12;'],
  'engines/world.js': ['const PLACE_KINDS = [', 'const CHANNELS = [', 'const BLOCK_LEVEL = {']
};
Object.keys(GONE).forEach(function (rel) {
  const src = RD(rel);
  const left = GONE[rel].filter(function (s) { return src.indexOf(s) >= 0; });
  a(left.length === 0, 'A7 ' + rel + ' 里已无搬走的常量定义（残留 ' + left.length + ' 处）', left);
});

// 双登记同序：三对（index.js + run.js），表都在引擎之前
const IDX = RD('index.js'), RUN = RD('tests/run.js');
function orderOk(idx, run, tabRel, engRel) {
  const t1 = "'" + tabRel + "'", e1 = "'" + engRel + "'";
  const i1 = idx.indexOf(t1), i2 = idx.indexOf(e1);
  const r1 = run.indexOf(t1), r2 = run.indexOf(e1);
  return i1 > 0 && i2 > i1 && r1 > 0 && r2 > r1;
}
TRIPLE.forEach(function (t, i) {
  a(orderOk(IDX, RUN, t.tab, t.eng),
    'A8' + String.fromCharCode(97 + i) + ' 两份装载表同序：' + t.tab + ' 在 ' + t.eng + ' 之前');
});
const SWAP = '\u0000TAB_PH\u0000';
const swapped = IDX.split("'" + TRIPLE[0].tab + "'").join(SWAP)
  .split("'" + TRIPLE[0].eng + "'").join("'" + TRIPLE[0].tab + "'")
  .split(SWAP).join("'" + TRIPLE[0].eng + "'");
a(!orderOk(swapped, RUN, TRIPLE[0].tab, TRIPLE[0].eng),
  'A9 次序判据两向自证：把 backstage 两文件位置互换 ⇒ 判假');

// 导出面不变（三件逐字点名）
const EXP = {
  'engines/backstage.js': ['getSettings', 'setSettings', 'budgetHeadroom', 'buildPrompt', 'applyResult'],
  'engines/world-lab.js': ['getSettings', 'catalog', 'run', 'simulate', 'adopt', 'diff', 'arms'],
  'engines/world.js': ['transit', 'CHANNELS', 'stat', 'addPlace', 'advance']
};
Object.keys(EXP).forEach(function (rel) {
  const src = RD(rel);
  const miss = EXP[rel].filter(function (k) { return src.indexOf(k + ':') < 0 && src.indexOf(k + '(') < 0; });
  a(miss.length === 0, 'A10 ' + rel + ' 导出面成员在位（缺 ' + miss.length + ' 个）', miss);
});

// ── B. 负控制（真起隔离装载）─────────────────────────
function load(parts) {
  const ctx = { console: { log: function () {}, warn: function () {}, error: function () {} }, window: {} };
  // backstage 的装载端会调 WA.workflow.register（工作流节点注册）—— 这是宿主面，不是被测对象，
  // 用最小桩即可；被测的是「表在不在、引擎能不能起来」。
  ctx.window.WorldAxis = { log: function () {}, registerModule: function () {},
    workflow: { register: function () {} } };
  ctx.global = ctx;
  vm.createContext(ctx);
  parts.forEach(function (p) {
    vm.runInContext(RD(p), ctx, { filename: p });
  });
  return ctx.window.WorldAxis;
}
function throwsWith(parts, re) {
  try { load(parts); return { threw: false, msg: '' }; }
  catch (e) { const m = String(e && e.message || e); return { threw: true, msg: m, hit: re.test(m) }; }
}
const r1 = throwsWith(['engines/backstage.js'], /协议表未装载/);
a(r1.threw && r1.hit, 'B1 只装 backstage（不装协议表）⇒ 抛「协议表未装载」', r1.msg);
const r2 = throwsWith(['engines/world-lab.js'], /词表未装载/);
a(r2.threw && r2.hit, 'B2 只装 world-lab（不装词表）⇒ 抛「词表未装载」', r2.msg);
const r3 = throwsWith(['engines/world.js'], /词表未装载/);
a(r3.threw && r3.hit, 'B3 只装 world（不装词表）⇒ 抛「词表未装载」', r3.msg);

// B4：空表（八件都空）⇒ 同样抛
{
  const tmp = '/tmp/wa11-empty.js';   // 本环境的 os.tmpdir() 是相对路径，固定 /tmp
  fs.writeFileSync(tmp, '(function () {\n  const WA = window.WorldAxis = window.WorldAxis || {};\n'
    + '  WA.backstageProtocols = { REASONING_PROTOCOL: \'\', VISIBILITY_SEMANTICS: \'\', STRUCTURAL_RULES: \'\',\n'
    + '    INJECTION_RULES: \'\', SIM_MODES: {}, TIME_POLICIES: {}, PULSE_LEVELS: {}, __REG_B: null };\n})();\n');
  let msg = '';
  try { load([tmp, 'engines/backstage.js']); } catch (e) { msg = String(e.message); }
  try { fs.unlinkSync(tmp); } catch (e) { void e; }
  a(/协议表未装载/.test(msg), 'B4 空表（__REG_B 为 null）⇒ 同样抛错', msg);
}

// B5：先表后引擎 ⇒ 三件都装得上，且读口可用
{
  const WA = load(['engines/backstage-protocols.js', 'engines/backstage.js',
    'engines/world-lab-tables.js', 'engines/world-lab.js',
    'engines/world-tables.js', 'engines/world.js']);
  a(!!WA.backstage && !!WA.worldLab && !!WA.world,
    'B5 先表后引擎（三对）⇒ 三个引擎都装载成功');
  a(WA.backstageProtocols && WA.worldLabTables && WA.worldTables,
    'B5b 三个表命名空间都在场');
}

// ── C. 真跑（用真宿主装载路径）────────────────────────
const gate = require('../tests/ui-gate-sync.js');
const WA2 = gate.fresh().WA;
a(typeof WA2.backstage.getSettings === 'function'
  && typeof WA2.backstage.getSettings().simulationMode === 'string',
  'C1 backstage.getSettings() 回真值（协议表 + 登记表都到位）');
a(typeof WA2.worldLab.catalog === 'function' && WA2.worldLab.catalog().arms.length === 3,
  'C2 worldLab.catalog().arms 三条（ARMS 从表里来）');
a(Array.isArray(WA2.world.CHANNELS) && WA2.world.CHANNELS.length === 3,
  'C3 world.CHANNELS 三层（词表从表里来，导出面未变）');
a(Object.keys(WA2.backstage).length === 22 && Object.keys(WA2.worldLab).length === 20,
  'C4 导出面键数不变（backstage ' + Object.keys(WA2.backstage).length
  + ' / worldLab ' + Object.keys(WA2.worldLab).length + '）');
a(WA2.world.CHANNELS.join(',') === 'person,goods,message'
  && WA2.worldTables.ROAD_CHANNELS.join(',') === 'person,goods,message,road',
  'C5 「道路本身」只在 ROAD_CHANNELS（不含在人/货/消息三层里 —— 与拆段前一致）');

console.log('OPV29-Z1-11-V2529: ' + (fail === 0 ? 'pass (' + pass + ')' : 'FAIL ' + fail + '/' + (pass + fail)));
process.exit(fail === 0 ? 0 : 1);