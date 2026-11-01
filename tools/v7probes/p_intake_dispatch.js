#!/usr/bin/env node
'use strict';
/**
 * tools/v7probes/p_intake_dispatch.js — OPV7-1 验收探针（分发器真跑）。
 *
 * 【它验什么】不是“函数能调通”，而是四件事：
 *   A 关着时逐字无变化：enabled=false → run() 回 disabled、四个引擎一行未写（回归安全）。
 *   B 开着时真的喂进去了：四组映射各自能从零状态长出 buildBlock 内容。
 *   C 不喂不缺、不编事实：缺 intent / base===habit / 无 witnesses 的行必须**跳过**，
 *     而不是把空串或占位符填进必填位（假数据入库是本项最要防的失真）。
 *   D 拒收可读：引擎关着时如实记 disabled，不冒充成功；拒因分桶能念出来。
 *
 * 【为什么必须真跑】按纪律 13：判据不许恒真。本探针每一条都在**该变的地方**观察变化：
 *   buildBlock 从 '' 变非空、store 里真的多出目标/气质/谜题/待办行、关着时确实一条没多。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..', '..');
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const m = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
const LOAD = vm.runInNewContext('[' + m[1] + ']');
const ctx = vm.createContext(global);
for (const rel of LOAD) {
  const p = path.join(BASE, rel);
  if (!fs.existsSync(p)) continue;
  try { vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: rel }); } catch (e) {}
}
const WA = global.WorldAxis;

let pass = 0, fail = 0;
function A(c, msg) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function head(t) { console.log('\n=== ' + t + ' ==='); }

function freshStore() {
  try { WA.store.init(); } catch (e) {}
  try { WA.capabilityTier.applyTier('full'); } catch (e) {}
}
function blen(ns) {
  const mod = WA[ns];
  if (!mod || typeof mod.buildBlock !== 'function') return -2;
  try {
    const b = mod.buildBlock();
    return (typeof b === 'string') ? b.length : (b ? JSON.stringify(b).length : 0);
  } catch (e) { return -1; }
}
function countRows() {
  const st = WA.store.get() || {};
  const people = Object.keys(st.people || {});
  let goals = 0;
  people.forEach(function (k) {
    const p = st.people[k];
    goals += ((p && p.life && p.life.goals) || []).length;
  });
  return {
    goals: goals,
    temperament: ((st.temperament || {}).rows || []).length,
    enigma: ((st.enigma || {}).rows || []).length,
    events: ((st.events || {}).rows || []).length
  };
}

// 装一个真实人物（走 registry，不直写 store）
function seedPeople(names) {
  if (!WA.registry || typeof WA.registry.ensurePerson !== 'function') return [];
  const out = [];
  names.forEach(function (n) {
    try { WA.registry.ensurePerson(n, { source: 'intake-probe' }); out.push(n); } catch (e) {}
  });
  return out;
}

// ── 0 前置：分发器在装载面里、且默认关 ──────────────────────────────────
head('0 装载与默认态');
A(!!WA.intake, 'WA.intake 已装载');
A(WA.intake && typeof WA.intake.run === 'function', 'run 是函数');
A(WA.intake && WA.intake.getSettings().enabled === false, '默认 enabled=false（不静默改变旧行为）');
A(WA.intake && Array.isArray(WA.intake.MAPPING) && WA.intake.MAPPING.length === 4,
  '映射表 4 行（实 ' + ((WA.intake && WA.intake.MAPPING) || []).length + '）');

const PAY = {
  people: [
    { name: '阿岚', intent: '把父亲的铺子赎回来', personalityAnchor: '倔强、不肯欠人情', speakingStyle: '短句，少用敬语' },
    { name: '阿岚', intent: '把父亲的铺子赎回来', personalityAnchor: '倔强', speakingStyle: '倔强' },  // base===habit → 必须跳过
    { name: '无意图者' }                                                                              // 缺 intent → 跳过
  ],
  blackbox: { secretActions: [
    { action: '往井里下毒', witnesses: '阿岚' },
    { action: '无目击者的秘密', witnesses: '' }        // 缺 witnesses → 跳过（不拿占位符凑）
  ] },
  events_create: [
    { title: '铺子被人砸了', type: 'conflict', level: 2, desc: '夜里有人来' },
    { title: '' }                                     // 缺 title → 跳过
  ],
  currents: [{ title: '暗流甲', summary: '与 events 语义不同，本项不接' }]
};

// ── A 关着：逐字无变化 ──────────────────────────────────────────────────
head('A 关着时逐字无变化');
freshStore();
seedPeople(['阿岚', '无意图者']);
const before0 = countRows();
const r0 = WA.intake.run(PAY, { idx: 7 });
A(r0 && r0.ok === false && r0.reason === 'disabled', '关着时 run 回 {ok:false,reason:disabled}');
const after0 = countRows();
A(JSON.stringify(before0) === JSON.stringify(after0),
  '关着时四类行一条未增（前 ' + JSON.stringify(before0) + ' 后 ' + JSON.stringify(after0) + '）');
A(blen('life') === 0 || (WA.life.getSettings().enabled === false), '关着时 life.buildBlock 仍空（或 life 自己关着）');

// 引擎全开（分发器仍关）—— 验证「不是引擎关着才没写」
['life', 'temperament', 'enigma', 'events'].forEach(function (k) {
  try { WA[k].setSettings(Object.assign(WA[k].getSettings(), { enabled: true })); } catch (e) {}
});
const before1 = countRows();
WA.intake.run(PAY, { idx: 7 });
const after1 = countRows();
A(JSON.stringify(before1) === JSON.stringify(after1),
  '引擎全开但分发器关着 ⇒ 一条也未写（前 ' + JSON.stringify(before1) + ' 后 ' + JSON.stringify(after1) + '）');

// ── B 开着：真的喂进去了 ────────────────────────────────────────────────
head('B 开着时真的喂进四个面');
try { WA.intake.setSettings({ enabled: true }); } catch (e) {}
const b0 = { life: blen('life'), temperament: blen('temperament'), enigma: blen('enigma'), events: blen('events') };
const r1 = WA.intake.run(PAY, { idx: 7 });
A(r1 && r1.ok === true, '开着时 run 回 ok');
A(r1.written >= 4, 'written ≥ 4（实 ' + (r1 && r1.written) + '）');
const b1 = { life: blen('life'), temperament: blen('temperament'), enigma: blen('enigma'), events: blen('events') };
console.log('  buildBlock 前: ' + JSON.stringify(b0));
console.log('  buildBlock 后: ' + JSON.stringify(b1));
A(b1.life > 0 && b0.life === 0, 'life.buildBlock 从空变有（前 ' + b0.life + ' 后 ' + b1.life + '）');
A(b1.temperament > 0 && b0.temperament === 0, 'temperament.buildBlock 从空变有（前 ' + b0.temperament + ' 后 ' + b1.temperament + '）');
A(b1.enigma > 0 && b0.enigma === 0, 'enigma.buildBlock 从空变有（前 ' + b0.enigma + ' 后 ' + b1.enigma + '）');
A(b1.events > 0 && b0.events === 0, 'events.buildBlock 从空变有（前 ' + b0.events + ' 后 ' + b1.events + '）');

const rows1 = countRows();
A(rows1.goals >= 1, '目标至少建 1 条（实 ' + rows1.goals + '）');
A(rows1.temperament === 1, '气质只建 1 条（base===habit 的行被跳过，实 ' + rows1.temperament + '）');
A(rows1.enigma === 1, '谜题只建 1 条（无 witnesses 的行被跳过，实 ' + rows1.enigma + '）');
A(rows1.events === 1, '待办只建 1 条（空 title 的行被跳过，实 ' + rows1.events + '）');
A(r1.skipped >= 3, '跳过数 ≥ 3（实 ' + (r1 && r1.skipped) + '）');

// ── C 不编事实 ─────────────────────────────────────────────────────────
head('C 不编事实（派生只许标识符/常量）');
const st = WA.store.get() || {};
// 目标正文必须就是 intent 原文，不是占位或拼接
let goalText = '';
Object.keys(st.people || {}).forEach(function (k) {
  const p = st.people[k];
  ((p && p.life && p.life.goals) || []).forEach(function (g) { goalText += g.text + '|'; });
});
A(goalText.indexOf('把父亲的铺子赎回来') >= 0, '目标正文 = 契约 intent 原文（实 ' + goalText + '）');
A(goalText.indexOf('undefined') < 0 && goalText.indexOf('待定') < 0 && goalText.indexOf('未知') < 0,
  '目标正文无占位词（undefined/待定/未知）');
// 事件 id 是派生标识符，title 是契约原文
let evId = '', evTitle = '';
((st.events || {}).rows || []).forEach(function (e) { evId += String(e && e.id) + '|'; evTitle += String(e && e.title) + '|'; });
A(evId.indexOf('intake_7_') === 0, '事件 id = 派生标识符 intake_<floor>_<i>（实 ' + evId + '）');
A(evTitle.indexOf('铺子被人砸了') >= 0, '事件 title = 契约原文（实 ' + evTitle + '）');
// currents 未被当成待办写进调度队列
A(evTitle.indexOf('暗流甲') < 0, 'currents 未被改写成待办事件（语义不同，本项不接）');

// ── D 拒收如实记账 ─────────────────────────────────────────────────────
head('D 拒收如实记账');
// 关掉 **enigma**：只有它回 {ok:true, reason:'disabled'}（temperament.setTemperament 压根不读 enabled，
//   所以拿它测 disabled 会测不到——探针不能断言一个不会发生的事）。
WA.enigma.setSettings(Object.assign(WA.enigma.getSettings(), { enabled: false }));
const baseStat = WA.intake.stat();
const r2 = WA.intake.run({
  blackbox: { secretActions: [{ action: '再试一次的秘密', witnesses: '阿岚' }] }
}, { idx: 8 });
A(r2 && r2.ok === true, '引擎关着时 run 仍 ok（分发器不把引擎开关当自身失败）');
const sv = WA.intake.stat();
A((sv.reasons.disabled || 0) >= 1, 'disabled 进了拒因分桶（实 ' + JSON.stringify(sv.reasons) + '）');
A(sv.calls > baseStat.calls, '本轮真的发起了调用（前 ' + baseStat.calls + ' 后 ' + sv.calls + '）');
A(sv.rejected === baseStat.rejected, '引擎关着不算分发器拒收（前 ' + baseStat.rejected + ' 后 ' + sv.rejected + '）');
A((sv.byEngine['enigma.mark'] || 0) >= 2, 'byEngine 里有 enigma.mark 计数（实 '
  + (sv.byEngine['enigma.mark'] || 0) + '）');


// view 只读态可念
const v = WA.intake.view();
A(v && v.rules && v.rules.length === 4, 'view().rules 4 条');
A(v && v.enabled === true, 'view().enabled 跟随设置');
A(JSON.stringify(WA.intake.stat()) === JSON.stringify(sv), 'view/stat 两次读数一致（无副作用）');


// ── N 负控制：破坏分发器，判据必须现形（防“探针恒真”） ─────────────────
head('N 负控制（真源码破坏 → 重跑同款判据）');
const DISP = path.join(BASE, 'engines/intake-dispatch.js');
const origDisp = fs.readFileSync(DISP, 'utf8');
let broken = 0;
function probeBroken(label, from, to, expectFn) {
  const mutated = origDisp.split(from).join(to);
  if (mutated === origDisp) { fail++; console.log('  ✗ N 破坏未生效：' + label); return; }
  try {
    fs.writeFileSync(DISP, mutated);
    // 重新装载分发器（删缓存 + 重新跑源码）
    delete require.cache[require.resolve(DISP)];
    vm.runInContext(mutated, ctx, { filename: 'engines/intake-dispatch.js' });
    broken++;
    const ok = expectFn(WA.intake);
    A(ok, 'N ' + label + '：破坏后判据现形');
  } finally {
    fs.writeFileSync(DISP, origDisp);
    delete require.cache[require.resolve(DISP)];
    vm.runInContext(origDisp, ctx, { filename: 'engines/intake-dispatch.js' });
  }
}

// N1 把 “关着就早退” 删掉 → 关着时必须报警
probeBroken('删掉 enabled 守卫', 'if (!cfg.enabled) return { ok: false, reason: \'disabled\' };',
  'if (false) return { ok: false, reason: \'disabled\' };',
  function (api) {
    api.setSettings({ enabled: false });
    const before = countRows();
    const r = api.run(PAY, { idx: 9 });
    const after = countRows();
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    return changed || (r && r.ok !== false);      // 关着还写了 / 或不再回 disabled ⇒ 判据现形
  });

// N2 把 disabled 判定改回“先看 ok” → enigma 关着时必须被算成写入
probeBroken('把 disabled 判定移到 ok 之后',
  "if (why0 === 'disabled') { note('disabled'); stat.skipped++; return false; }", '',
  function (api) {
    api.setSettings({ enabled: true });
    try { WA.enigma.setSettings(Object.assign(WA.enigma.getSettings(), { enabled: false })); } catch (e) {}
    const b = api.stat().ok;
    api.run({ blackbox: { secretActions: [{ action: 'N2秘密', witnesses: '阿岚' }] } }, { idx: 10 });
    return api.stat().ok > b;                     // ok 涨了 ⇒ 把没写算成写了 ⇒ 判据现形
  });

// N3 让映射表退化成“什么都跳过” → B 段必须写不进
probeBroken('映射表恒返回 null', 'if (!text) return null;', 'return null;',
  function (api) {
    const b = blen('life');
    api.run(PAY, { idx: 11 });
    return blen('life') === b;                    // 没写进去 ⇒ 判据现形
  });

A(broken === 3, '三处破坏全部真的改到了源码（实 ' + broken + '）');
// 恢复后必须在原版上重新为真（H6 两向自证）
WA.intake.setSettings({ enabled: true });
const rBack = WA.intake.run({ people: [{ name: '阿岚', intent: '恢复后仍能喂' }] }, { idx: 12 });
A(rBack && rBack.written >= 1, '恢复原版后同款判据重新为真（written=' + (rBack && rBack.written) + '）');

// ── 收尾 ──────────────────────────────────────────────────────────────
console.log('\n========== 汇总：' + pass + ' passed, ' + fail + ' failed ==========');
process.exit(fail ? 1 : 0);
