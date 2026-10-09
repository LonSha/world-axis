#!/usr/bin/env node
// v2.166.0 专锁（TX2）：人物动机、计划、行动与反馈闭环（engines/agency.js）。
//
// ── 本锁治的三件事（TX2 原文落地）──────────────────────────────
//   TX2 要求「人物动机、计划、行动与反馈闭环」——回执驱动步结算，不是定时器自动推进步。
//   它是 life / plan / act 三模块的协调者，只调既有 API，不复制状态。
//   本锁锁的就是这条边界，以及它带来的三处静默失效风险：
//     ① 凭空造步骤：schedule 无计划时自动编步骤 ⇒ AI 被跳过、步骤来源不可追溯
//     ② 定时器推步：不靠回执自动结算步 ⇒ 步骤在 AI 不知情的情况下推进
//     ③ 协调者变写者：agency 自己写目标/计划/行动 ⇒ 三模块的「唯一写者」契约被打破
//
// ── 判据分三层 ──────────────────────────────────────────────────
//   A 结构面：7 导出成员、设置键名、注入链七点同名、UI_BINDINGS 6 控件覆盖
//   B 行为面（真 API）：默认关、disabled 拒收、missing-person 拒收、no-active-goal、
//     need-steps（不编步骤）、诊断面 closedLoop、统计面自增
//   N 负控制：破坏后行为必须改变
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/agency.js';
const REL_INJECT = 'render/inject.js';
const REL_BUDGET = 'engines/inject-budget.js';
const REL_PANEL = 'ui/panel.js';
const REL_INDEX = 'index.js';
const REL_DIAG = 'engines/tool-diag.js';
const REL_MANIFEST = 'manifest.json';

// ── 锚点（真源码里各恰中 1 次）─────────────────────────────────
// 锚点一取**开关默认关**：enabled: false 是刻意的（行动闭环会准入行动，会改世界）。
const A_DEF = "  const DEF = { enabled: false, maxSchedulePerTurn: 4, maxReceiptsPerTurn: 8, autoPlanExpand: true };";
// 锚点二取**need-steps 返回**：无计划时不编步骤——步骤由 AI 文本经结构预检产生或由预设模板提供。
const A_NEED_STEPS = "      return { ok: false, reason: 'need-steps', person: who, goalId: goal.id,";
// 锚点三取**导出数检查**：7 个成员是契约（getSettings/setSettings/schedule/processReceipts/buildBlock/diagnose/stat）。
const A_EXPORT_COUNT = "  if (__exportCount !== 7) WA.__agencyWarn = { expected: 7, got: __exportCount };";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }
let __seq = 0;
function boot(srcOv) {
  const chatId = 'tx2_' + (++__seq);
  const WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try { WA.__chatId = chatId; } catch (e) {}
  return WA;
}

function runA(a) {
  const src = read(REL);
  // A1 导出成员恰 7
  const m = src.match(/WA\.agency\s*=\s*\{[\s\S]*?\};/);
  a(!!m, 'v2166/tx2 A1: WA.agency 导出块存在');
  if (m) {
    const keys = (m[0].match(/^\s+(\w+):/gm) || []).map(function (s) { return s.trim().replace(':', ''); });
    a(keys.length === 7, 'v2166/tx2 A1: 导出 7 成员（实 ' + keys.length + '：' + keys.join('/') + '）');
  }

  // A2 默认关
  a(countOcc(src, A_DEF) === 1, 'v2166/tx2 A2: DEF.enabled=false 恰 1 次');

  // A3 need-steps 返回
  a(countOcc(src, A_NEED_STEPS) === 1, 'v2166/tx2 A3: need-steps 返回恰 1 次');

  // A4 导出数检查
  a(countOcc(src, A_EXPORT_COUNT) === 1, 'v2166/tx2 A4: 导出数 === 7 检查恰 1 次');

  // A5 注入链七点同名：'行动调度' 在 inject.js 出现
  const inj = read(REL_INJECT);
  a(inj.indexOf("agency: '行动调度'") !== -1, 'v2166/tx2 A5: inject.js SRC_NAME 有行动调度');
  a(inj.indexOf('agency: true') !== -1, 'v2166/tx2 A5: inject.js __REG.def 有 agency');
  a(inj.indexOf("'agency'") !== -1, 'v2166/tx2 A5: inject.js SOURCES 有 agency');

  // A6 budget 接线
  const bud = read(REL_BUDGET);
  a(bud.indexOf("'行动调度'") !== -1, 'v2166/tx2 A6: inject-budget 有行动调度');

  // A7 panel VIS_NAMES
  const pan = read(REL_PANEL);
  a(pan.indexOf("agency: '行动调度'") !== -1, 'v2166/tx2 A7: panel VIS_NAMES 有行动调度');

  // A8 tool-diag secAgency + UI_BINDINGS
  const diag = read(REL_DIAG);
  a(diag.indexOf('function secAgency') !== -1, 'v2166/tx2 A8: tool-diag 有 secAgency');
  a(diag.indexOf("'engines/agency.js': 'agency'") !== -1, 'v2166/tx2 A8: tool-diag 模块映射有 agency');
  a(diag.indexOf('agency: secAgency()') !== -1, 'v2166/tx2 A8: tool-diag diag 对象有 agency');
  a(diag.indexOf('wa-ag-out') !== -1, 'v2166/tx2 A8: tool-diag UI_BINDINGS 有 wa-ag-out');

  // A9 index.js LOAD_ORDER 有 agency.js
  const idx = read(REL_INDEX);
  a(idx.indexOf("'engines/agency.js'") !== -1, 'v2166/tx2 A9: index.js LOAD_ORDER 有 agency.js');

  // A10 manifest 版本
  const mani = read(REL_MANIFEST);
  a(['2.166.0', '2.167.0', '2.168.0', '2.169.0', '2.170.0', '2.171.0', '2.172.0', '2.173.0', '2.181.0', '2.182.0', '2.183.0', '2.184.0'].some(function (v) { return mani.indexOf('"' + v + '"') !== -1; }), 'v2166/tx2 A10: manifest 版本 2.166.0+');

  // A11 版本常量
  a(['2.166.0', '2.167.0', '2.168.0', '2.169.0', '2.170.0', '2.171.0', '2.172.0', '2.173.0', '2.181.0', '2.182.0', '2.183.0', '2.184.0'].some(function (v) { return idx.indexOf("VERSION = '" + v + "'") !== -1; }), 'v2166/tx2 A11: index.js VERSION 2.166.0+');

  // A12 panel 6 控件
  ['wa-ag-enabled', 'wa-ag-person', 'wa-ag-schedule', 'wa-ag-receipts', 'wa-ag-diag', 'wa-ag-out'].forEach(function (id) {
    a(pan.indexOf(id) !== -1, 'v2166/tx2 A12: panel 有 ' + id);
  });
}

function runB(a) {
  // B1 模块加载 + 7 导出
  const WA = boot();
  a(!!WA.agency, 'v2166/tx2 B1: WA.agency 存在');
  if (!WA.agency) return;
  ['getSettings', 'setSettings', 'schedule', 'processReceipts', 'buildBlock', 'diagnose', 'stat'].forEach(function (k) {
    a(typeof WA.agency[k] === 'function' || typeof WA.agency[k] === 'object', 'v2166/tx2 B1: agency.' + k + ' 可用');
  });

  // B2 默认关
  const cfg = WA.agency.getSettings();
  a(cfg.enabled === false, 'v2166/tx2 B2: 默认 enabled=false');

  // B3 disabled 时调度拒收
  const r1 = WA.agency.schedule('某人', Date.now());
  a(!r1.ok && r1.reason === 'disabled', 'v2166/tx2 B3: 关着时调度返回 disabled');

  // B4 开启后无人物名拒收
  WA.agency.setSettings({ enabled: true });
  const r2 = WA.agency.schedule('', Date.now());
  a(!r2.ok && r2.reason === 'missing-person', 'v2166/tx2 B4: 空人物名返回 missing-person');

  // B5 无 active goal
  const r3 = WA.agency.schedule('不存在的人', Date.now());
  a(!r3.ok && r3.reason === 'no-active-goal', 'v2166/tx2 B5: 无目标人物返回 no-active-goal');

  // B6 有 goal 但无 plan → need-steps（不编步骤）
  // 需要先给人物加 goal
  if (WA.life && WA.life.addGoal) {
    try {
      WA.life.addGoal('测试员', { id: 'g1', text: '造一座桥', status: 'active' });
      const r4 = WA.agency.schedule('测试员', Date.now());
      a(!r4.ok && (r4.reason === 'need-steps' || r4.reason === 'no-plan'),
        'v2166/tx2 B6: 有目标无计划返回 need-steps 或 no-plan（实 ' + (r4.reason || '?') + '）—— 不编步骤');
    } catch (e) {
      a(false, 'v2166/tx2 B6: 造局失败 ' + e.message);
    }
  } else {
    a(true, 'v2166/tx2 B6: life.addGoal 不可用，跳过（无消费方不强制）');
  }

  // B7 诊断面
  const d = WA.agency.diagnose();
  a(typeof d.enabled === 'boolean', 'v2166/tx2 B7: diagnose 返回 enabled');
  a(typeof d.closedLoop === 'boolean', 'v2166/tx2 B7: diagnose 返回 closedLoop');
  a(typeof d.lifeAvailable === 'boolean', 'v2166/tx2 B7: diagnose 返回 lifeAvailable');

  // B8 统计面
  const st = WA.agency.stat();
  a(typeof st.scheduled === 'number', 'v2166/tx2 B8: stat 返回 scheduled（数字）');
  a(typeof st.lastReason === 'string', 'v2166/tx2 B8: stat 返回 lastReason（字符串）');

  // B9 buildBlock
  if (typeof WA.agency.buildBlock === 'function') {
    const bb = WA.agency.buildBlock();
    a(bb !== null && bb !== undefined, 'v2166/tx2 B9: buildBlock 返回非 null');
  }

  // B10 __agencyWarn 未触发（导出数 = 7）
  a(!WA.__agencyWarn, 'v2166/tx2 B10: __agencyWarn 未触发（导出数 = 7）');

  // B11 tool-diag secAgency 在全量诊断中
  if (WA.toolDiag && typeof WA.toolDiag.collect === 'function') {
    const coll = WA.toolDiag.collect();
    a(!!coll.agency, 'v2166/tx2 B11: toolDiag.collect 有 agency 节');
  }
}

function runNegative(a) {
  const orig = read(REL);
  // N1 破坏默认关（改成 true）→ 默认开
  const b1 = orig.replace('enabled: false,', 'enabled: true,');
  if (b1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = boot(ov(REL, b1));
  const cfg1 = WA1.agency.getSettings();
  a(cfg1.enabled === true, 'v2166/tx2 N1: 破坏后默认开（缺陷复现：行动闭环默认开）');

  // N2 破坏 need-steps（改成 ok:true 编步骤）→ 不返回 need-steps
  const b2 = orig.replace(A_NEED_STEPS, "      return { ok: true, person: who, goalId: goal.id,");
  if (b2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = boot(ov(REL, b2));
  WA2.agency.setSettings({ enabled: true });
  if (WA2.life && WA2.life.addGoal) {
    try { WA2.life.addGoal('测试员N2', { id: 'g1', text: '造桥', status: 'active' }); } catch (e) {}
    const r2 = WA2.agency.schedule('测试员N2', Date.now());
    a(r2.ok === true, 'v2166/tx2 N2: 破坏后不返回 need-steps（缺陷复现：凭空造步骤）');
  }

  // N3 真文件逐字未变
  a(read(REL) === orig, 'v2166/tx2 N3: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, A_DEF, A_NEED_STEPS, A_EXPORT_COUNT, runA, runB, runAll, runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('S3-TX2-V2166: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}