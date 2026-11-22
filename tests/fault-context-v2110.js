// WorldAxis tests/fault-context-v2110.js (v2.110.0) — 异常上下文与恢复专锁（计划一 #21）
//
// 四段（本仓专锁的统一形状）：
//   A 导出面枚举（静态：真源码里的键名与 KEYS 一致，防「文档说的口」与「真有的口」漂移）
//   B 运行时探针（每个导出至少被真调用一次，且断言**行为**而不是只断言存在）
//   C 不变式（跨断言的恒等式 / 边界值）
//   N 负控制（**真源码破坏** → 在真宿主里重跑同款真判据 → 判据必须现形）
//
// 为什么 N 段必须是「真源码破坏」（v2.104.0 立的三条假绿纪律，此处逐条对应）：
//   ① 对**原文件**断言 —— 破坏没发生也绿。故本文件所有负控制都加载**破坏副本**。
//   ② 破坏写死成模拟常量 —— 真判据根本没被调用。故破坏是**文本替换真源码**，
//      锚点必须恰中 1 次（`split().length-1 === 1`），否则报红并跳过该条。
//   ③ 破坏把判据自己删了（自我指涉）。故判据字符串与破坏锚点串**不同源**：
//      判据只描述「应该观察到什么」，不含锚点原文。
//
// 宿主：用 tests/synth-host.js 的 negativeContext（核心原语真实现 + LOAD 里的对等引擎），
//   而**不是**裸上下文 —— v2.84.0 实测过：裸上下文里任何 engine 一调 inputGuard 就抛，
//   于是「破坏后判据现形」根本轮不到执行，整段变成 runner-failed。
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const synthHost = require('./synth-host.js');
const BASE = path.join(__dirname, '..');
const REL = 'core/fault-context.js';
/** 导出面清单（与真源码的 `WA.faultContext = {...}` 逐项对应）。 */
const KEYS = ['wrap', 'recent', 'stat', 'reset', 'classify', 'isRetriable', 'stateBrief', 'CAP', 'RETRIABLE'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
/** 真宿主（见文件头）：synth-host 提供核心原语真实现，**被测模块自己装进去**。
 *  刻意**不**装全部 engines：`negativeContext({engines:true})` 会把 39 个引擎一并装进来，
 *  而它们各自需要 workflow / settingsBus 等未在 CORE_MODULES 里的核心模块，宿主在装载期就炸 ——
 *  那是「宿主装多了」，不是被测模块的问题。被测模块的依赖面有多宽，宿主就装多宽：
 *  **这就是边界的定义**。 */
function freshHost() {
  const c = synthHost.negativeContext({});
  vm.runInContext(srcOf(), c, { filename: REL });
  return c;
}
/** 真宿主 + 破坏副本：同一个宿主构造器，唯一的差别就是这一段源码 —— 这就是「对等比对」的定义。 */
function hostWith(broken) {
  const c = synthHost.negativeContext({});
  vm.runInContext(broken, c, { filename: REL + '#broken' });
  return c;
}
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
/** 把一次调用折成「没抛 + 结果」两读数（断言需要「抛没抛」本身，不只是返回值）。 */
function attempt(fn) {
  try { return { threw: false, value: fn() }; } catch (e) { return { threw: true, error: e }; }
}

// ── A 段：导出面枚举 ─────────────────────────────────────────────────────
//   口径：只取 `WA.faultContext = { … }` 那个对象字面量的**花括号配平体**，在体内找键名。
//   为什么不直接 `src.indexOf(k + ':')`：那样会连 `_stat` 内部字段、注释、字符串一起算进来，
//   于是「导出面少了 recent」与「代码里某处写了 recent:」不可分（本仓 v2.104.0 的假绿第②形）。
function exportBody(src) {
  const m = /WA\.faultContext\s*=\s*\{/.exec(src);
  if (!m) return '';
  let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i + 1, j); }
  }
  return '';
}
function runA(a) {
  const src = srcOf();
  a(/WA\.faultContext\s*=\s*\{/.test(src), 'faultCtx/A: 命名空间赋值形态未变（WA.faultContext = { … }）');
  const body = exportBody(src);
  a(body.length > 50, 'faultCtx/A: 导出面对象字面量可定位（' + body.length + ' 字符）');
  KEYS.forEach(function (k) {
    const re = new RegExp('(^|[\\s,{])' + k + '\\s*:');
    a(re.test(body), 'faultCtx/A: 导出面**对象体内**含 ' + k);
  });
  // 反向：体内键数必须与清单一致（多出来的口没登记 = 承诺漂移）
  const keys = (body.match(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g) || [])
    .map(function (s) { return s.replace(/[^A-Za-z_$]/g, ''); });
  const uniq = keys.filter(function (k, i) { return keys.indexOf(k) === i && KEYS.indexOf(k) < 0; });
  a(uniq.length === 0, 'faultCtx/A: 导出面无未登记的多余口（实 ' + JSON.stringify(uniq) + '）');
  a(src.indexOf('window.WorldAxis = window.WorldAxis || {}') >= 0,
    'faultCtx/A: 宿主入口沿用 window.WorldAxis（与其余 111 个模块同源）');
}

// ── B 段：运行时探针（真调用 + 行为断言）────────────────────────────────
function runB(a, WA) {
  const FC = (WA || global.WorldAxis || {}).faultContext;
  a(!!FC, 'faultCtx/B: 命名空间已装载（LOAD 与 index.js LOAD_ORDER 同源）');
  if (!FC) return;
  FC.reset();

  // B1. 成功路径必须**原样返回**，不许把返回值包进结果对象
  const okVal = FC.wrap('probe.ok', function () { return 42; });
  a(okVal === 42, 'faultCtx/B: 成功路径原样返回 fn 的返回值（实 ' + JSON.stringify(okVal) + '）');

  // B2. 非函数入参不抛，而是如实报 not-a-function
  const nf = FC.wrap('probe.nf', null);
  a(nf && nf.ok === false && nf.reason === 'not-a-function',
    'faultCtx/B: 非函数入参返回 {reason:not-a-function} 而不是抛（实 ' + JSON.stringify(nf) + '）');

  // B3. 默认吞错：返回**结果对象**（不是抛、也不是 undefined）
  const r = FC.wrap('probe.type', function () { null.x; }, { params: { a: 1 } });
  a(r && r.ok === false && r.reason === 'fault-handled',
    'faultCtx/B: 默认返回 {ok:false, reason:fault-handled}（实 ' + JSON.stringify(r && r.reason) + '）');
  a(r && r.kind === 'type' && r.operation === 'probe.type',
    'faultCtx/B: 分类与业务名随结果返回（kind=' + (r && r.kind) + ' operation=' + (r && r.operation) + '）');
  a(!!(r && r.ctx && typeof r.ctx.seq === 'number' && typeof r.ctx.at === 'number'),
    'faultCtx/B: ctx 带 seq/at（可定位到「第几次」与「什么时候」）');
  a(!!(r && r.ctx && r.ctx.state && 'actorCount' in r.ctx.state && 'step' in r.ctx.state),
    'faultCtx/B: ctx.state 是**现场摘要**而不是裸对象（键 ' + JSON.stringify(r && r.ctx && r.ctx.state && Object.keys(r.ctx.state)) + '）');

  // B4. rethrow:true ⇒ 原样重抛**同一个 error 对象**（身份不变 —— 上层 instanceof 判据不许被改写）
  const boom = new TypeError('probe-boom');
  const th = attempt(function () { return FC.wrap('probe.rethrow', function () { throw boom; }, { rethrow: true }); });
  a(th.threw && th.error === boom,
    'faultCtx/B: rethrow 抛回**同一个** error 对象（identity，实 ' + (th.threw ? (th.error === boom) : '未抛') + '）');

  // B5. fallback：给了就用它，且**不**再返回结果对象
  const fb = FC.wrap('probe.fb', function () { throw new Error('x'); }, { fallback: 'FALLBACK' });
  a(fb === 'FALLBACK', 'faultCtx/B: 显式 fallback 优先于结果对象（实 ' + JSON.stringify(fb) + '）');

  // B6. 重试：只对可重试档 + 必须显式声明。两向都测。
  let n1 = 0;
  const v1 = FC.wrap('probe.retry-ok', function () { n1++; if (n1 < 2) { const e = new Error('network down'); throw e; } return 'RETRIED'; },
    { retry: true, tries: 3 });
  a(v1 === 'RETRIED' && n1 === 2, 'faultCtx/B: 可重试档 + 显式声明 ⇒ 真重试并返回成功值（试了 ' + n1 + ' 次）');
  let n2 = 0;
  FC.wrap('probe.retry-off', function () { n2++; throw new Error('network down'); });
  a(n2 === 1, 'faultCtx/B: **默认不重试**（未声明时同一次调用只跑一遍，实 ' + n2 + ' 次）');
  let n3 = 0;
  FC.wrap('probe.retry-nonretriable', function () { n3++; throw new TypeError('bad type'); }, { retry: true, tries: 3 });
  a(n3 === 1, 'faultCtx/B: 不可重试档（type）即使声明了也不重试（实 ' + n3 + ' 次）——「重试」不是「重跑」');

  // B7. annotate：正常 error 上挂得上；**冻结** error 上挂不上但不得影响 ctx 返回
  const e7 = new Error('annotate-me');
  FC.wrap('probe.note', function () { throw e7; });
  a(!!e7.waContext, 'faultCtx/B: 取证挂在 error.waContext 上');
  const e8 = Object.freeze(new Error('frozen'));
  const r8 = FC.wrap('probe.frozen', function () { throw e8; });
  a(!e8.waContext && r8 && r8.ctx && r8.ctx.operation === 'probe.frozen',
    'faultCtx/B: 冻结 error 上取证失败**不影响** ctx 返回（取证不得改被取证对象）');

  // B8. classify 的每一档（判据只有一处：导出给调用方自判）
  a(FC.classify(new TypeError('x')) === 'type', 'faultCtx/B: classify(TypeError) = type');
  a(FC.classify(new RangeError('x')) === 'range', 'faultCtx/B: classify(RangeError) = range');
  a(FC.classify(new Error('fetch failed: ETIMEDOUT')) === 'network', 'faultCtx/B: classify(超时) = network');
  a(FC.classify(new Error('storage quota exceeded')) === 'transient', 'faultCtx/B: classify(quota) = transient');
  a(FC.classify(new Error('真·别的东西')) === 'other', 'faultCtx/B: 认不出的如实落 other（不自造档位）');
  a(FC.classify(null) === 'other', 'faultCtx/B: classify(null) 不抛且落 other');

  // B9. isRetriable 与 RETRIABLE 同源
  a(FC.isRetriable('network') && FC.isRetriable('transient'), 'faultCtx/B: network/transient 属可重试档');
  a(!FC.isRetriable('type') && !FC.isRetriable('range') && !FC.isRetriable('other'),
    'faultCtx/B: type/range/other 一律不可重试');
  a(eq(FC.RETRIABLE, ['network', 'transient']), 'faultCtx/B: RETRIABLE 名单逐字为 [network, transient]');

  // B10. stateBrief：**取不到现场**时字段如实为 null（不是 0、不是 ''）
  const sb = FC.stateBrief();
  a(sb && typeof sb === 'object' && 'actorCount' in sb && 'step' in sb && 'rev' in sb && 'phase' in sb,
    'faultCtx/B: stateBrief 返回固定四键（' + JSON.stringify(Object.keys(sb)) + '）');
  a(sb.actorCount === null || typeof sb.actorCount === 'number',
    'faultCtx/B: actorCount 是数或 null（不许出现 undefined / NaN 这类「不像读数」的值，实 '
    + JSON.stringify(sb.actorCount) + '）');
  a(sb.step === null || typeof sb.step === 'number', 'faultCtx/B: step 是数或 null');

  // B11. recent 返回**副本**：外部改不动环
  const rc = FC.recent(3);
  a(Array.isArray(rc), 'faultCtx/B: recent() 返回数组');
  if (rc.length) {
    rc[0].operation = '被外部改坏了';
    a(FC.recent(3)[0].operation !== '被外部改坏了',
      'faultCtx/B: recent() 是副本（外部改动不回写环 —— 否则「取证」会变成「篡改证据」）');
  }

  // B12. stat 与 CAP
  a(FC.CAP === 60, 'faultCtx/B: CAP = 60（实 ' + FC.CAP + '）');
  const st = FC.stat();
  a(st && typeof st.caught === 'number' && st.cap === FC.CAP && Array.isArray(st.retriable),
    'faultCtx/B: stat() 带 caught/cap/retriable（实 cap=' + (st && st.cap) + '）');
  FC.reset();
}

// ── C 段：不变式 ────────────────────────────────────────────────────────
function runC(a, WA) {
  const FC = (WA || global.WorldAxis).faultContext;
  if (!FC) { a(false, 'faultCtx/C: 命名空间缺席，不变式无从判定'); return; }

  // C1. 环上限恒成立（跨 100 次失败 —— 环**不许**无限长）
  FC.reset();
  for (let i = 0; i < 100; i++) FC.wrap('bulk.' + i, function () { throw new Error('bulk'); });
  a(FC.recent().length === FC.CAP,
    'faultCtx/C: 环长恰等于 CAP（实 ' + FC.recent().length + ' / ' + FC.CAP + '）');
  a(FC.stat().caught === 100, 'faultCtx/C: caught 计数与实际失败次数一致（实 ' + FC.stat().caught + '）');

  // C2. 恒等式：wraps = caught + 未抛的那些
  FC.reset();
  FC.wrap('c.ok', function () { return 1; });
  FC.wrap('c.bad', function () { throw new Error('x'); });
  const s = FC.stat();
  a(s.wraps === 2 && s.caught === 1 && s.recovered === 1 && s.rethrown === 0,
    'faultCtx/C: wraps/caught/recovered/rethrown 四读数自洽（' + JSON.stringify([s.wraps, s.caught, s.recovered, s.rethrown]) + '）');
  a(s.recovered + s.rethrown === s.caught,
    'faultCtx/C: recovered + rethrown === caught（每个被抓到的错都有唯一去向，实 '
    + s.recovered + '+' + s.rethrown + ' vs ' + s.caught + '）');

  // C3. reset 之后一切归零（取证面可复位 —— 测试之间不许互相污染）
  FC.reset();
  const s0 = FC.stat();
  a(s0.wraps === 0 && s0.caught === 0 && s0.ring === 0 && s0.lastCtx === null,
    'faultCtx/C: reset 之后 wraps/caught/ring/lastCtx 全归零');

  // C4. op 名超长时被截断（不许把整段业务名塞进每一条上下文 —— 那是内存与日志的双重浪费）
  FC.reset();
  const long = new Array(200).join('长');
  const r4 = FC.wrap(long, function () { throw new Error('x'); });
  a(r4.ctx.operation.length <= 80, 'faultCtx/C: 业务名截断到 ≤80（实 ' + r4.ctx.operation.length + '）');
  FC.reset();
}

// ── N 段：负控制（真源码破坏 + 真宿主重跑同款判据）────────────────────────
function runNegative(a) {
  const src = srcOf();

  // N1. 破坏「原样重抛同一对象」：把 `throw e;` 改成包一层新错 → identity 判据必须现形
  const A1 = '        throw e;                                     // 原样重抛：类型/身份都不改';
  const n1 = src.split(A1).length - 1;
  a(n1 === 1, 'faultCtx/N1: 破坏锚点（原样重抛）在真源码中恰 1 处（实 ' + n1 + '）');
  const b1 = src.replace(A1, '        throw new Error(String(e && e.message));');
  a(n1 === 1 && b1 !== src, 'faultCtx/N1: 破坏真的改动了源码文本');
  if (n1 === 1) {
    const FC1 = hostWith(b1).WorldAxis.faultContext;
    const boom = new TypeError('n1');
    const t1 = attempt(function () { return FC1.wrap('n1', function () { throw boom; }, { rethrow: true }); });
    a(t1.threw && t1.error !== boom,
      'faultCtx/N1: 包一层后 identity 判据**现形**（同款判据由假变假 → 真源码上确实生效）');
  }

  // N2. 破坏「冻结 error 不影响 ctx 返回」：把 annotate 的 try/catch 摘成裸赋值
  const A2 = '        try { e.waContext = ctx; _stat.annotated++; }\n        catch (e2) { _stat.annotateFailed++; }';
  const n2 = src.split(A2).length - 1;
  a(n2 === 1, 'faultCtx/N2: 破坏锚点（annotate 取证）在真源码中恰 1 处（实 ' + n2 + '）');
  const b2 = src.replace(A2, '        e.waContext = ctx; _stat.annotated++;');
  a(n2 === 1 && b2 !== src, 'faultCtx/N2: 破坏真的改动了源码文本');
  if (n2 === 1) {
    const FC2 = hostWith(b2).WorldAxis.faultContext;
    const frozen = Object.freeze(new Error('n2'));
    const t2 = attempt(function () { return FC2.wrap('n2', function () { throw frozen; }); });
    a(t2.threw === true,
      'faultCtx/N2: 裸赋值下冻结 error 让**取证自己炸**（判据现形：取证不得改被取证对象 —— '
      + '破坏前同款调用返回结果对象，破坏后直接抛）');
  }

  // N3. 破坏「默认不重试」：把重试门槛里的 `o.retry &&` 摘掉 → 默认重试判据必须现形
  const A3 = "      if (o.retry && tries > 1 && isRetriable(ctx.kind)) {";
  const n3 = src.split(A3).length - 1;
  a(n3 === 1, 'faultCtx/N3: 破坏锚点（重试门槛）在真源码中恰 1 处（实 ' + n3 + '）');
  const b3 = src.replace(A3, '      if (tries > 1 && isRetriable(ctx.kind)) {');
  a(n3 === 1 && b3 !== src, 'faultCtx/N3: 破坏真的改动了源码文本');
  if (n3 === 1) {
    const FC3 = hostWith(b3).WorldAxis.faultContext;
    let cnt = 0;
    FC3.wrap('n3', function () { cnt++; throw new Error('network timeout'); }, { tries: 3 });
    a(cnt > 1, 'faultCtx/N3: 摘掉 o.retry 门槛后**默认就重试**了（实跑 ' + cnt + ' 次）—— '
      + '「默认关」不是口头约定，它由一处 `&&` 承担');
  }

  // N4. 纯度：原版上同款判据必须为真（否则上三条「现形」说明不了什么）
  const FC0 = freshHost().WorldAxis.faultContext;
  const boom0 = new TypeError('purity');
  const t0 = attempt(function () { return FC0.wrap('p0', function () { throw boom0; }, { rethrow: true }); });
  a(t0.threw && t0.error === boom0, 'faultCtx/N4: （纯度）原版上 identity 判据为真');
  const e0 = Object.freeze(new Error('purity2'));
  const r0 = attempt(function () { return FC0.wrap('p1', function () { throw e0; }); });
  a(r0.threw === false && r0.value && r0.value.ok === false,
    'faultCtx/N4: （纯度）原版上「冻结 error 不炸取证」为真');
  let c0 = 0;
  FC0.wrap('p2', function () { c0++; throw new Error('network timeout'); }, { tries: 3 });
  a(c0 === 1, 'faultCtx/N4: （纯度）原版上「未声明就只跑一遍」为真（实 ' + c0 + ' 次）');

  // N5. 反空转下限：负控制必须发生在**非空**源码上
  a(src.length > 3000, 'faultCtx/N5: 被破坏的源码面非空（' + src.length + ' 字符）—— 零字符上的「零现形」恒真');
}

module.exports = { REL: REL, KEYS: KEYS, srcOf: srcOf, exportBody: exportBody,
  runA: runA, runB: runB, runC: runC, runNegative: runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  // 独立运行（`node tests/fault-context-v2110.js`）时自建宿主：
  //   与真装载同序、同源码（synth-host），**不复制实现**。
  const _c = freshHost();
  runA(a); runB(a, _c.WorldAxis); runC(a, _c.WorldAxis); runNegative(a);
  console.log('fault-context-v2110 ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
}
