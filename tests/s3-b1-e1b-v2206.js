'use strict';
// WorldAxis tests/s3-b1-e1b-v2206.js (v2.206.0) — E1 可处理面（拓展 2）专锁
//
// 本锁钉的是**拓展 2 新增的那一面**，逐条都是「不许把两件事压成一件」：
//   ① **透传 ≠ 第二套确认逻辑**：act() 调的是来源模块的公开写口（真被调到），
//      而不是本模块自己实现一遍；本模块不碰 store、不开事务（写口自持）。
//   ② **编排失败与来源拒收可分**：fault 命名空间（本层没接上）与 reason 命名空间
//      （来源自己的判定）**分开报**，与 engines/beat-facade.js 的 U1 同规。
//   ③ **只收推得出参数的动作**：要回执号 / 金额 / 选项标签 / 参与者的动作**不在表里**，
//      且**如实报缺**（no-such-action + why），不是静默略过。
//   ④ **不做半写**：tx:true 的写口在无事务机制时拒收 write-needs-tx，且**不调**写口。
//   ⑤ farfield.settlePulse 不收 —— 它查 pulses 桶，而 pending() 给 pending 桶的 id，
//      两个 id 空间；接上去就是「点一个查不到的 id」。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/pending-center.js';

let pass = 0, fail = 0;
const failures = [];
function a(c, m) { if (c) pass++; else { fail++; failures.push(m); } }
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }

// ── A 段：静态契约 ────────────────────────────────────────────────
function runA() {
  const src = srcOf();
  // ① 动作表只收「推得出参数」的动作：表里出现的 args 只准是 'ref'
  a(/function argsFor\(spec, ref\)/.test(src), 'A1: argsFor 在位（参数装配只有一个入口）');
  a(/return t === 'ref' \? ref : null;/.test(src), 'A2: 只有 ref 一种推法（别的推法返回 null，不猜）');
  // ② 未收录动作如实登记
  a(/const NOT_ACTIONS = \{/.test(src), 'A3: NOT_ACTIONS 在位（未收录动作如实列出，不静默略过）');
  a(/两个 id 空间/.test(src), 'A4: farfield.settlePulse 不收的理由（两个 id 空间）写在源码里');
  // ③ fault 命名空间
  ['bad-action', 'no-such-action', 'action-unavailable', 'action-threw', 'missing-ref', 'write-needs-tx']
    .forEach(function (c) { a(src.indexOf("'" + c + "'") >= 0, 'A5: 编排层码 ' + c + ' 在位（fault 命名空间）'); });
  a(/fault: null, reason: 'disabled'/.test(src), 'A6: disabled 走 reason（来源语义），fault 为 null');
  // ④ 不做半写
  a(/write-needs-tx/.test(src) && /宁可不动，也不留一笔非原子的世界写/.test(src),
    'A7: write-needs-tx 的判据与理由都在源码里');
  // ⑤ 导出面 + 自证串
  a(/EXPORT_COUNT = 11/.test(src), 'A8: EXPORT_COUNT = 11');
  a(/\n    act: act,\n/.test(src), 'A9: act 在导出面上（本模块唯一写口）');
  a(/\n    timeline: timeline,\n/.test(src), 'A9b: timeline 在导出面上（本模块新增的**只读**期限并集面）');
  a(/timeline\(\{?\}?\)/.test(src) || /function timeline\(opts\)/.test(src), 'A9c: timeline 是函数（不是数组/常量冒充的读数）');
  a(/actions: actionsOf\(kind\),/.test(src), 'A10: mk() 给每条记录带 actions（面板据此知道能点什么）');
  a(/actions: \{ declared: actDeclared, live: actLive, bySource: actChecks \}/.test(src),
    'A11: diagnose 报动作面自证（declared vs live）');
  a(/const ok = checks.settingsBus && actDeclared === actLive;/.test(src),
    'A12: 动作面自证是**可红**判据（表与现场不符即 ok=false），不是自报家门');
  a(/version: '2.209.0'/.test(src), 'A13: 模块自报 2.209.0');
  // ⑥ 消费方（仓规：无消费方不挂导出）
  const pan = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  a(pan.indexOf('WA.pendingCenter.act(') >= 0,
    'A14: 面板真调 act()（字面形态 WA.<ns>.<口> —— 引用面清册只认这种形态）');
  a(pan.indexOf('wa-td-act') >= 0, 'A15: 面板有「处理第一条」控件');
  a(pan.indexOf("on('#wa-td-act'") >= 0, 'A16: 面板接线在位');
  a(/out\.fault/.test(pan), 'A17: 面板把 fault 与 reason **分开显示**（不压成一行）');
}

// ── B 段：运行时行为（真宿主）────────────────────────────────────
function runB() {
  const boot = sync.fresh({});
  const WA = boot.WA;
  const P = WA.pendingCenter;
  a(typeof P === 'object' && typeof P.act === 'function', 'B1: 模块装载且 act 可调用');
  a(Object.keys(P).length === 11, 'B2: 导出面 11 个（实 ' + Object.keys(P).length + '）');
  // 关闭时：走 reason，不落 fault
  let r = P.act('commission', 'cancel', 'x');
  a(r.ok === false && r.reason === 'disabled' && r.fault === null, 'B3: 关闭时拒收走 reason、fault 为 null');
  P.setSettings({ enabled: true });
  // 编排层失败 ⇒ fault
  r = P.act('commission', 'no_such', 'x');
  a(r.fault === 'no-such-action' && !r.reason, 'B4: 未知动作 ⇒ fault=no-such-action（不落 reason）');
  a(Array.isArray(r.allowed), 'B5: 拒收时回带 allowed（本层允许的动作名）');
  r = P.act('commission', 'cancel', '');
  a(r.fault === 'missing-ref', 'B6: 空 ref ⇒ fault=missing-ref');
  // ③ 未收录动作如实报缺（不是静默略过）
  r = P.act('storyChoice', 'confirm', 'x');
  a(r.fault === 'no-such-action' && typeof r.why === 'string' && r.why.length > 0,
    'B7: 未收录动作（storyChoice.confirm）如实报缺并给 why');
  r = P.act('farfield', 'settlePulse', 'x');
  a(r.fault === 'no-such-action' && /pulses/.test(r.why || ''), 'B8: farfield.settlePulse 不收且理由点明 id 空间不同');
  // ② 来源拒收原样透传
  if (WA.commission.setSettings) WA.commission.setSettings({ enabled: true });
  r = P.act('commission', 'cancel', 'no_such_id_zz');
  a(r.fault === null && r.reason === 'not-found' && r.data && r.data.reason === 'not-found',
    'B9: 来源拒收原样透传（fault=null / reason=not-found / 原体在 data 上）');
  // ④ 不做半写：摘掉事务机制 ⇒ 拒收且不调写口
  const storeReal = WA.store, commitReal = WA.commit, afterReal = WA.aftermath;
  let called = 0;
  WA.aftermath = Object.assign({}, afterReal, { repair: function () { called++; return { ok: true }; } });
  WA.store = undefined; WA.commit = undefined;
  r = P.act('aftermath', 'repair', 'r1');
  a(r.fault === 'write-needs-tx' && called === 0, 'B10: 无事务机制 ⇒ write-needs-tx 且**没调**写口（不做半写）');
  WA.store = storeReal; WA.commit = commitReal;
  // ① 透传：真调来源写口
  r = P.act('aftermath', 'repair', 'r1');
  a(called === 1 && r.ok === true && r.fn === 'repair', 'B11: 有事务机制时真调到来源写口（透传，不是自己实现一遍）');
  WA.aftermath = Object.assign({}, afterReal, { repair: function () { throw new Error('boom-zz'); } });
  r = P.act('aftermath', 'repair', 'r1');
  a(r.fault === 'action-threw' && /boom-zz/.test(r.detail || ''), 'B12: 写口抛错 ⇒ action-threw（不冒泡、不静默）');
  WA.aftermath = afterReal;
  const opsReal = WA.operations;
  WA.operations = undefined;
  r = P.act('operations', 'cancel', 'r1');
  a(r.fault === 'action-unavailable', 'B13: 写口不在场 ⇒ action-unavailable（与来源拒收分开）');
  WA.operations = opsReal;
  // ⑤ diagnose 动作面自证可红
  let d = P.diagnose();
  a(d.actions && d.actions.declared === 4 && d.actions.live === 4, 'B14: 动作面 declared=live=4（实 '
    + (d.actions ? d.actions.declared + '/' + d.actions.live : '?') + '）');
  a(d.version === '2.209.0', 'B15: diagnose 自报 2.209.0');
  WA.operations = undefined;
  d = P.diagnose();
  a(d.actions.live === 3 && d.ok === false, 'B16: 负控制 —— 摘掉一个写口 ⇒ live 3 且 ok 变 false（判据可红）');
  WA.operations = opsReal;
  // 计数
  P.reset();
  P.act('commission', 'cancel', 'no_such_id_zz');   // 来源拒收
  P.act('commission', 'bogus', 'x');                 // 编排失败
  const st = P.stat();
  a(st.actRejects === 1 && st.acts === 0, 'B17: stat.actRejects 只记来源拒收');
  a(st.faults['no-such-action'] === 1 && st.faults['not-found'] === 1,
    'B18: 编排失败与来源拒收都进 faults（但出参命名空间分开）');
  P.reset();
  a(P.stat().acts === 0 && P.stat().actRejects === 0, 'B19: reset 清动作面计数');
  // 条目带 actions；无动作的源如实说没有
  const rows = P.items({}).rows;
  a(rows.every(function (x) { return Array.isArray(x.actions); }), 'B20: 每条记录都带 actions 数组（缺席也是空数组，不是 undefined）');
  const dBack = P.describe('backstage', '');
  a(typeof dBack.actionNote === 'string' && dBack.actionNote.length > 0,
    'B21: 没有可透传动作的来源，describe 也**如实说明为什么**（不是空话）');
  // 三态口径没被本轮改动破坏
  const r0 = P.items({});
  a(typeof r0.emptyAll === 'boolean' && typeof r0.unavailable === 'boolean' && typeof r0.allClear === 'boolean',
    'B22: 三旗标仍在（本轮没碰三态口径）');
  a(r0.perSource && Object.keys(r0.perSource).length === 8, 'B23: perSource 仍 8 源全覆盖');
}

runA();
runB();
console.log('E1b s3-b1-e1b-v2206 ' + pass + ' / 失败 ' + fail);
if (failures.length) { console.log('失败项：'); failures.forEach(function (m) { console.log('  FAIL ' + m); }); }
process.exitCode = fail ? 1 : 0;