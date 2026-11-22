#!/usr/bin/env node
'use strict';
/**
 * tests/render-pre-v2108.js — 渲染层防御式边界（计划一 #19）四段专锁。
 *
 * 治的病：渲染层五个公开入口接受「类型错的参数」时，要么把它插进提示词
 *   （`generate` 拿对象 → 发给模型的导演指令是 `[object Object]`），要么把错误归类成语义结论
 *   （`removeRuleSafe(123)` → `not-found`，即「没这条规则」，而对一个永远匹配不上的参数说
 *   「找不到」是**假结论**），要么静默转成字符串（`send({})` → `'[object Object]'` 进消息框）。
 *
 * 本版给这五处加 `@pre` 契约，违约统一返回
 *   `{ ok:false, reason:'pre-violation', detail:'<哪个参数>-not-<类型>', got:typeof }`，
 *   与既有的「合法但空」归因（missing-find / no-id / empty-text / instruction-not-string）**分开**。
 *
 * 四段：A 静态契约 / B 运行时（含 async 的 generate）/ C 不变式 / N 真源码破坏负控制。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PUR_REL = 'render/purifier.js';
const TH_REL = 'render/theater.js';
const INJ_REL = 'render/inject.js';
const WIT_REL = 'tests/reject-v2780.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/render-pre-v2108.js';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function allReplace(src, from, to) { return src.split(from).join(to); }
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label + ' :: ' + from);
  return out;
}

/** 统一锚点表（每条在目标文件里恰中 1 次；且在本文件里恰声明 1 次）。 */
const ANCHORS = {
  aAdd: { rel: PUR_REL, txt: `if (rule !== null && rule !== undefined && (typeof rule !== 'object' || Array.isArray(rule))) {` },
  aRemove: { rel: PUR_REL, txt: `if (id !== null && id !== undefined && typeof id !== 'string') {` },
  aGen: { rel: TH_REL, txt: `if (instruction !== null && instruction !== undefined && typeof instruction !== 'string') {` },
  aSend: { rel: TH_REL, txt: `if (text !== null && text !== undefined && typeof text !== 'string') {` },
  aUnj: { rel: INJ_REL, txt: `if (trigger !== null && trigger !== undefined && typeof trigger !== 'string') {` },
  aWire: { rel: RUN_REL, txt: "await require('./render-pre-v2108.js').runAll(assert)" }
};

function auditAnchors(A) {
  const self = rd(SELF_REL);
  Object.keys(ANCHORS).forEach(function (k) {
    const a = ANCHORS[k];
    const nT = rd(a.rel).split(a.txt).length - 1;
    const nS = self.split(a.txt).length - 1;
    A(nT === 1, 'A5 锚点 ' + k + ' 在 ' + a.rel + ' 里恰 1 次（实 ' + nT + '）');
    A(nS === 1, 'A5 锚点 ' + k + ' 在本锁里恰声明 1 次（实 ' + nS + '，缺失与重复同罪）');
  });
}

/** 渲染层装载：单独一份 WA（不动宿主），与既有 render 锁同口径。 */
function freshRender() {
  const fresh = require('./ui-gate-sync.js').fresh;
  return fresh({});
}

/** 返回 Promise：本锁含一个 async 入口（theater.generate），回归侧须 `await runAll(assert)`。 */
async function runAll(A) {
  const env = freshRender();
  const WA = env.WA;
  const Pr = WA.purifier, Th = WA.theater, Rd = WA.render;

  // ── A 静态契约 ──
  A(!!Pr && typeof Pr.addRuleSafe === 'function' && typeof Pr.removeRuleSafe === 'function',
    'A1 purifier 两个安全入口在场');
  A(!!Th && typeof Th.generate === 'function' && typeof Th.send === 'function', 'A1b theater 两个入口在场');
  A(!!Rd && typeof Rd.uninject === 'function', 'A1c render.uninject 在场');
  // 见证表已有本码（否则门禁会报未分类）
  const wit = require('./reject-v2780.js');
  const w = wit.runWitness(WA);
  A(typeof w.expect['pre-violation'] === 'string' && w.expect['pre-violation'].length > 0,
    'A2 见证表声明了 pre-violation（' + String(w.expect['pre-violation'] || '').slice(0, 60) + '）');
  A(w.seen['pre-violation'] === true, 'A2b 见证真把它跑出来了（不是只声明）');
  A(w.missing.length === 0 && w.unexpected.length === 0,
    'A2c 见证面零缺口零意外（missing ' + JSON.stringify(w.missing) + ' / unexpected ' + JSON.stringify(w.unexpected) + '）');
  // 三张标签表仍然同源（本版为 recoverBak 登记过，顺带钉住不被回退）
  A(rd('core/store.js').indexOf("recoverBak: '") > 0, 'A3 store.LAB 已登记 recoverBak');
  A(rd('engines/tool-diag.js').indexOf("recoverBak: '") > 0, 'A3b toolDiag.SRC_LABEL 已登记 recoverBak');
  A(rd('ui/panel.js').indexOf("recoverBak: '") > 0, 'A3c ui/panel.js LAB_P 已登记 recoverBak');

  auditAnchors(A);

  // ── B 运行时：逐入口真跑「类型错」与「合法但空」 ──
  const r1 = Pr.addRuleSafe('str');
  A(r1.ok === false && r1.reason === 'pre-violation' && r1.detail === 'rule-not-object' && r1.got === 'string',
    'B1 addRuleSafe 传字符串 ⇒ pre-violation/rule-not-object（实 ' + JSON.stringify(r1) + '）');
  const r1b = Pr.addRuleSafe(123);
  A(r1b.reason === 'pre-violation' && r1b.detail === 'rule-not-object' && r1b.got === 'number',
    'B1b 传数字同款（实 got ' + r1b.got + '）');
  const r1c = Pr.addRuleSafe([{ find: 'a' }]);
  A(r1c.reason === 'pre-violation' && r1c.got === 'object',
    'B1c 传数组也拒（数组不是朴素对象；实 ' + JSON.stringify(r1c) + '）');
  const r2 = Pr.removeRuleSafe(123);
  A(r2.ok === false && r2.reason === 'pre-violation' && r2.detail === 'id-not-string',
    'B2 removeRuleSafe 传数字 id ⇒ pre-violation/id-not-string（实 ' + JSON.stringify(r2) + '）');
  const r3 = Th.send({});
  A(r3.ok === false && r3.reason === 'pre-violation' && r3.detail === 'text-not-string',
    'B3 theater.send 传对象 ⇒ pre-violation/text-not-string（旧行为是静默转成 [object Object]）');
  const r4 = Rd.uninject(123);
  A(r4.ok === false && r4.reason === 'pre-violation' && r4.detail === 'trigger-not-string',
    'B4 render.uninject 传数字 trigger ⇒ pre-violation/trigger-not-string（旧行为是写进账本污染审计）');
  // uninject 的违约也必须进撤销账本（否则「谁把 trigger 传错了」完全不可见）
  const led = Rd.injectionLedger();
  const ledRows = (led && led.entries) || [];
  A(Array.isArray(ledRows) ? ledRows.some(function (e) { return e && e.reason === 'pre-violation'; }) : true,
    'B4b uninject 违约入账（可见性：不是静默返回）');

  // 反向共证：合法但空的值必须**仍答旧码**——类型守卫不得把可用路径一并堵死
  const s1 = Pr.addRuleSafe({ find: '' });
  A(s1.ok === false && s1.reason === 'missing-find', 'B5 「合法但空」仍答 missing-find（实 ' + JSON.stringify(s1) + '）');
  const s2 = Pr.removeRuleSafe('');
  A(s2.ok === false && s2.reason === 'no-id', 'B5b 空 id 仍答 no-id（实 ' + JSON.stringify(s2) + '）');
  const s3 = Th.send('   ');
  A(s3.ok === false && s3.reason === 'empty-text', 'B5c 纯空白文本仍答 empty-text（实 ' + JSON.stringify(s3) + '）');
  const s4 = Pr.addRuleSafe(null);
  A(s4.ok === false && s4.reason === 'missing-find', 'B5d null 规则仍走旧路（合法「没给规则」，实 ' + JSON.stringify(s4) + '）');
  const s5 = Pr.removeRuleSafe(null);
  A(s5.ok === false && s5.reason === 'no-id', 'B5e null id 仍走旧路（实 ' + JSON.stringify(s5) + '）');

  // async 入口：theater.generate 的 instruction-not-string（同步的见证函数拿不到 Promise）
  const g = Th.generate({});
  A(g && typeof g.then === 'function', 'B6 generate 返回 Promise（async 入口）');
  const rg = await Promise.resolve(g);
  A(rg && rg.ok === false && rg.reason === 'pre-violation' && rg.detail === 'instruction-not-string',
    'B6b generate 传对象 ⇒ pre-violation/instruction-not-string（实 ' + JSON.stringify(rg) + '）'
    + '——见证函数的同步 trip() 拿不到 Promise 结果，故在此补');
}

/** 同样返回 Promise，与 runAll 同规格。 */
async function runNegative(A) {
  const fresh = require('./ui-gate-sync.js').fresh;
  const P0 = rd(PUR_REL), T0 = rd(TH_REL), I0 = rd(INJ_REL);

  // N1 破坏 addRuleSafe 的类型守卫 ⇒ 字符串参数重回「静默当真」路径
  const n1 = breakOnce(P0, ANCHORS.aAdd.txt, "if (false) {", 'N1');
  const e1 = fresh({ srcOverride: { 'render/purifier.js': n1 } });
  const a1 = e1.WA.purifier.addRuleSafe('str');
  A(a1.reason !== 'pre-violation',
    'N1b 装载破坏副本 ⇒ 字符串参数不再被 pre-violation 拦（实 ' + JSON.stringify(a1) + '）——证明 B1 真在测那道守卫');

  // N2 破坏 removeRuleSafe 的守卫 ⇒ 数字 id 重回假结论 not-found
  const n2 = breakOnce(P0, ANCHORS.aRemove.txt, "if (false) {", 'N2');
  const e2 = fresh({ srcOverride: { 'render/purifier.js': n2 } });
  const a2 = e2.WA.purifier.removeRuleSafe(123);
  A(a2.reason === 'not-found',
    'N2b 装载破坏副本 ⇒ 数字 id 被答成 not-found（实 ' + JSON.stringify(a2) + '）——即本版要治的假结论现场');

  // N3 破坏 theater.send 的守卫 ⇒ 对象被静默转成 [object Object] 送进输入框
  const n3 = breakOnce(T0, ANCHORS.aSend.txt, "if (false) {", 'N3');
  const e3 = fresh({ srcOverride: { 'render/theater.js': n3 } });
  const a3 = e3.WA.theater.send({});
  A(a3.reason !== 'pre-violation',
    'N3b 装载破坏副本 ⇒ 对象不再被拦（实 ' + JSON.stringify(a3) + '）——原版是把 [object Object] 当脚本产物送出');

  // N4 破坏 render.uninject 的守卫 ⇒ 非字符串 trigger 落进撤销账本
  const n4 = breakOnce(I0, ANCHORS.aUnj.txt, "if (false) {", 'N4');
  const e4 = fresh({ srcOverride: { 'render/inject.js': n4 } });
  const a4 = e4.WA.render.uninject(123);
  A(a4.reason !== 'pre-violation',
    'N4b 装载破坏副本 ⇒ 数字 trigger 不再被拦（实 ' + JSON.stringify(a4) + '）——旧路径会把它写进审计台账');

  // N5 双向自证：原版上同款判据必须为真
  const e5 = fresh({});
  A(e5.WA.purifier.addRuleSafe('str').reason === 'pre-violation',
    'N5 原版上「字符串参数必须被 pre-violation 拦」为真，破坏副本上为假（N1b）—— 两向自证成立');
  A(e5.WA.purifier.removeRuleSafe(123).reason === 'pre-violation',
    'N5b 原版上「数字 id 不得被答成 not-found」为真，破坏副本上为假（N2b）—— 两向自证成立');

  A(rd(PUR_REL) === P0 && rd(TH_REL) === T0 && rd(INJ_REL) === I0,
    'N6 真文件在全部负控制跑完后逐字未变（四处破坏全是内存副本）');
}

module.exports = { ANCHORS: ANCHORS, runAll: runAll, runNegative: runNegative };

if (require.main === module) {
  let P = 0, F = 0;
  const A = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  x ' + m); } };
  (async function () {
    try { require('./mock.js'); await runAll(A); await runNegative(A); }
    catch (e) { F += 1; console.log('  x 异常：' + (e && e.stack)); }
    console.log('RENDER-PRE-V2108: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
    process.exit(F === 0 ? 0 : 1);
  })();
}
