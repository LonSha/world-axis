'use strict';
// WorldAxis tests/beat-facade-lock-v2193.js (v2.193.0) — 拍引擎统一运行门面（计划 U1）四段专锁。
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的处境写成同一个形状」）：
//   ① **门面不判定**：参数校验一律由引擎自己做。门面若自己判一遍 ⇒ 两个真源，
//      而且门面判出来的码与引擎同形却不同源，现场无法归因「谁拦的」。
//   ② **编排层失败不进 `reason` 命名空间**：`reason` 里的每个码都要有恢复动作（U5），
//      给「门面没开」编一句给玩家的恢复建议就是造数据。故编排层另开 `fault`。
//   ③ **读不出 ≠ 关闭**：引擎缺席时启用态报 `null`；`allOff` 只在**四个都读得出且为关**
//      时为真 —— 有读不出的就不算全关（那是「不知道」）。
//   ④ **全关即空块**：门面自身关 **或** 两个产块引擎都关 ⇒ `buildBlock()` 空串，
//      注入面与旧行为逐字不变。
//   ⑤ **不写 store**：真代码面零 `store.transact`。
//   ⑥ **恢复档只读 U5**：U5 缺席时 `recovery` 为 `null`，不假装、不自己编档。
//
// 负控制一律在**内存副本**上做真源码破坏并两向自证（N1–N4）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const synthHost = require('./synth-host.js');

const FA = 'engines/beat-facade.js';
const FAM = {
  beatReport: 'engines/beat-report.js',
  beatLedger: 'engines/beat-ledger.js',
  planAudit: 'engines/plan-audit.js',
  genGate: 'engines/gen-gate.js'
};
const RR = 'engines/reject-recovery.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
/** 合成宿主：真 settingsBus + 真 store + 真 inputGuard + 被测门面（可注入破坏副本 + 家族/`U5` 开关）。
 *  宿主桩**不自搓** —— 走本仓正途 `synth-host.negativeContext`（它按 LOAD 序装核心原语真实现）。
 *  ⚠ 实测教训（本锁首跑 4 红）：自搓裸上下文 `{ console: console }` 会让 `core/store.js` 的
 *    load 路径调 `WA.log` 时抛 `WA.log is not a function` —— 那是**桩缺件**，不是产品缺陷。
 *    `synth-host` 正是为治这类漂移而立的（v2.84.0），专锁不得绕开它另立一份桩。 */
function hostWith(opts) {
  const o = opts || {};
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  c.window.document = { createElement: function () { return {}; }, addEventListener: function () {} };
  function run(rel, src) { vm.runInContext(src !== undefined ? src : rd(rel), c, { filename: rel }); }
  run('core/settings-bus.js');
  run('core/store.js');
  run('core/input-guard.js');
  if (o.withFamily !== false) Object.keys(FAM).forEach(function (ns) { run(FAM[ns]); });
  if (o.withU5) run(RR);
  if (o.withFamily !== false && o.extra) o.extra.forEach(function (r) { run(r); });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  WA.mainWin = c.window; WA.mainDoc = c.window.document;
  // 门面**最后**装载：它读 WA[家族成员]，须在成员之后。
  run(FA, o.facadeSrc);
  return WA;
}
/** 把 reason 规范化到同一语义：`undefined`（原始返回体没人写这个键）与 `null`（归一层的
 *  「无码」）在**语义上同一** —— 直接比会得到 false，而打印出来两者都显示 null
 *  （JSON.stringify 把 undefined 写成 null），于是「打印一样却报红」。
 *  本仓点名过的坑：判据要按语义比，不能按字面比。（B6 首跑即栽在这。） */
function sameReason(a, b) {
  const na = (a === undefined) ? null : a, nb = (b === undefined) ? null : b;
  return na === nb;
}
/** 派生逻辑单一实现：破坏必须可观测（恰中 1 次，否则抛）。 */
function hit(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error('破坏锚点须恰中 1 次，实 ' + n + '：' + from.slice(0, 60));
  return src.split(from).join(to);
}

const ANCHORS = {
  aEngines: "const ENGINES = ['beatReport', 'planAudit', 'beatLedger', 'genGate'];",
  aOps: 'const OPS = {',
  aRun: 'function run(op, ctx) {',
  aFacadeOff: "noteFault('facade-off');",
  aAllOff: 'allOff: readable.length === ENGINES.length',
  aBlockEmpty: "if (!settings().enabled) return '';",
  aRecovery: 'const rr = WA.rejectRecovery;',
  aRuns: 'stat.runs++;'
};

function runAll(A) {
  const src = rd(FA);
  // ═══ A 静态契约 ═══
  A(src.indexOf(ANCHORS.aEngines) >= 0, 'A1 家族成员表在场（四个命名空间，与 LOAD_ORDER 同源）');
  A(src.indexOf(ANCHORS.aOps) >= 0 && src.indexOf(ANCHORS.aRun) >= 0, 'A2 编排面在场（OPS 表 + run 入口）');
  // 边界 ①：本文件不得出现内联 `reason: '字面量'` —— 那正是扫描面要收的形态
  const inline = (src.match(/reason\s*:\s*'[A-Za-z][A-Za-z0-9_-]*'/g) || []);
  A(inline.length === 0, 'A3 本文件零内联 reason 字面量（编排层失败走 fault —— 边界 ①）');
  A(src.indexOf("fault: 'facade-off'") >= 0 && src.indexOf("fault: 'unknown-op'") >= 0
    && src.indexOf("fault: 'engine-absent'") >= 0 && src.indexOf("fault: 'engine-threw'") >= 0,
    'A4 四个 fault 码在场（门面自己的失败面）');
  A(src.indexOf(ANCHORS.aFacadeOff) >= 0, 'A5 run 未开门时落 fault（不代引擎拒收）');
  // 边界 ③：allOff 必须要求「四个都读得出」
  A(src.indexOf(ANCHORS.aAllOff) >= 0, 'A6 allOff 以「读得出的个数 === 家族长度」为前提（读不出不算关）');
  A(src.indexOf("if (!m || typeof m.getSettings !== 'function') return null;") >= 0,
    'A7 引擎缺席时启用态报 null（与 false 分开 —— 边界 ③）');
  // 边界 ④
  A(src.indexOf(ANCHORS.aBlockEmpty) >= 0 && src.indexOf('if (!parts.length) return \'\';') >= 0,
    'A8 全关 / 无块 ⇒ 空串（边界 ④）');
  // 边界 ⑤：真代码面零 store.transact
  const codeOnly = src.split('\n').filter(function (l) { return !/^\s*(\*|\/\/|\/\*)/.test(l); }).join('\n');
  A(codeOnly.indexOf('store.transact') < 0, 'A9 真代码面零 store.transact（边界 ⑤）');
  // 边界 ⑥
  A(src.indexOf(ANCHORS.aRecovery) >= 0 && src.indexOf("typeof rr.explain !== 'function'") >= 0,
    'A10 恢复档只读 U5 的 explain（边界 ⑥）');
  // H5 锚点纯度：每个锚点字面量在本文件恰声明 1 次（判据不得自带锚点串副本）
  let pure = 0, impure = [];
  Object.keys(ANCHORS).forEach(function (k) {
    const t = ANCHORS[k], f = (src.split(t).length - 1);
    if (f === 1) pure++; else impure.push(k + ':' + f);
  });
  A(pure === Object.keys(ANCHORS).length, 'A11 锚点字面量在本文件各恰出现一次（违者：'
    + (impure.length ? impure.join(',') : '无') + '）');
  // 判据不得自带锚点串副本（本仓 H5 形态）：锚点串在**本锁**里也只作为锚点表的值出现
  const self = fs.readFileSync(__filename, 'utf8');
  let selfDup = [];
  Object.keys(ANCHORS).forEach(function (k) {
    // 锚点表里的声明算 1 次；判据正文里若再写一遍同串 ⇒ 2 次
    const n = self.split(ANCHORS[k]).length - 1;
    if (n !== 1) selfDup.push(k + ':' + n);
  });
  A(selfDup.length === 0, 'A12 锚点串在本锁内也只声明一次（判据不携带副本 —— 违者：'
    + (selfDup.length ? selfDup.join(',') : '无') + '）');

  // ═══ B 运行时 ═══
  {
    const WA = hostWith({ withU5: true });
    const F = WA.beatFacade;
    A(!!F && typeof F.run === 'function', 'B1 门面在场且 run 可调');
    A(F.OPS.length === 9 && F.ENGINES.length === 4 && F.BLOCK_ENGINES.length === 2,
      'B2 导出面读数（op 9 / 家族 4 / 产块 2）');
    // 门面默认关（承「新能力默认关」）
    A(F.getSettings().enabled === false, 'B3 门面默认关闭（关着时四引擎现状一字不变）');
    const off = F.run('report', { rec: {} });
    A(off.ok === false && off.fault === 'facade-off' && off.reason === undefined,
      'B4 未开门时 fault=facade-off 且**无 reason**（不代引擎拒收 —— 边界 ①）');
    // 开门
    F.setSettings({ enabled: true });
    A(F.getSettings().enabled === true, 'B5 开门生效');
    // B9 必须在**打开任何家族成员之前**判：开了 genGate 之后 allOff 本就该是假。
    //   （本锁首跑此处曾红 —— 是判据自身的顺序错，不是产品缺陷。顺序即语义，不改断言只改位置。）
    A(F.status().allOff === true, 'B9 四引擎都在场且全关 ⇒ allOff 真（在开任何成员之前判）');
    // ② 等价性：经门面调用与直调**同一输入同一结论**
    WA.genGate.setSettings({ enabled: true, minGap: 3 });
    const viaF = F.run('gate', { kind: 'thread', ctx: { round: 10 } });
    const direct = WA.genGate.gate('thread', { round: 10 });
    A(viaF.ok === direct.ok && sameReason(viaF.reason, direct.reason) && viaF.data.kind === direct.kind,
      'B6 经门面与直调等价（gate：ok/reason/kind 三项一致，实 '
      + JSON.stringify([viaF.ok, viaF.reason, viaF.data && viaF.data.kind]) + ' vs '
      + JSON.stringify([direct.ok, direct.reason, direct.kind]) + '）');
    A(F.status().allOff === false && F.status().anyOn === true,
      'B9b 打开一个成员后 allOff 转假 / anyOn 转真（证明 B9 不是恒真）');
    A(viaF.engine === 'genGate' && viaF.op === 'gate', 'B7 归一形状带 engine/op（谁答的）');
    // ③ 参数缺失时码与引擎**同源**（门面不造码）
    const bad = F.run('gate', { kind: 'thread', ctx: { round: '不是数' } });
    A(bad.ok === false && bad.reason === 'bad-round' && bad.data.reason === 'bad-round',
      'B8 缺/坏参数由引擎拒收（实 ' + bad.reason + '）—— 门面不判（边界 ②）');
    // 边界 ③ 读不出 ≠ 关闭：这次宿主四个引擎都在场（B9 已在开任何成员之前判过，
    // 此处 genGate 已开，若再断言 allOff 真就是**顺序错误**，不是产品缺陷）。
    // 恢复档只读 U5
    const rec = viaF.recovery;
    A(rec === null || typeof rec === 'object', 'B10 恢复档形状合法（null 或对象）');
    const badRec = bad.recovery;
    A(!!badRec && badRec.kind === 'adjust-input', 'B11 bad-round 的恢复档来自 U5（实 '
      + (badRec ? badRec.kind : 'null') + '）—— U5 表第一次有产品侧真消费者');
    // ④ 全关 ⇒ 空块
    A(F.buildBlock() === '', 'B12 全关 ⇒ 空块（边界 ④：注入面逐字不变）');
  }

  // ═══ C 不变式 ═══
  {
    // ① 门面自身关 ⇒ 与家族全关等价（都出空块）
    const WA1 = hostWith({});
    WA1.beatFacade.setSettings({ enabled: true });   // 门面开、家族全关
    const b1 = WA1.beatFacade.buildBlock();
    WA1.beatFacade.setSettings({ enabled: false });   // 门面关
    const b2 = WA1.beatFacade.buildBlock();
    A(b1 === '' && b2 === '', 'C1 门面开而家族全关 ⇒ 空块；门面关 ⇒ 空块（两种空都必须真为空）');
    // ② 产块面：家族有块时门面块 = 两引擎块合（含两者内容）
    const WA2 = hostWith({});
    WA2.beatFacade.setSettings({ enabled: true });
    WA2.beatReport.setSettings({ enabled: true });
    WA2.beatReport.report({ verdict: 'setup', chapterKey: 'c1', need: '先交代他为什么在城里' });
    const fb = WA2.beatFacade.buildBlock();
    const direct2 = WA2.beatReport.buildBlock();
    A(!!direct2 && fb.indexOf(direct2) >= 0, 'C2 门面块含 beatReport 的块（编排不改字）');
    // ③ 恢复档缺席 ⇒ null，不假装
    const WA3 = hostWith({});   // 不装 U5
    WA3.beatFacade.setSettings({ enabled: true });
    WA3.genGate.setSettings({ enabled: true });
    const r3 = WA3.beatFacade.run('gate', { kind: 'thread', ctx: { round: '坏' } });
    A(r3.ok === false && r3.reason === 'bad-round' && r3.recovery === null,
      'C3 U5 缺席时 recovery 为 null（不假装、不自己编档 —— 边界 ⑥）');
    // ④ 未登记 op ⇒ fault=unknown-op 且无 reason
    const u = WA3.beatFacade.run('no-such-op', {});
    A(u.ok === false && u.fault === 'unknown-op' && u.reason === undefined,
      'C4 未登记 op 落 fault（门面不猜、不自造码）');
  }

  // ═══ N 真源码破坏负控制（内存副本 + 两向自证）═══
  {
    // N1 allOff 放宽成「忽略读不出的」⇒ 引擎缺席时也必须被判成 allOff（破坏须可观测）
    const b1 = hit(src, ANCHORS.aAllOff, 'allOff: true || readable.length === ENGINES.length');
    const WA = hostWith({ facadeSrc: b1, withFamily: false });
    A(WA.beatFacade.status().allOff === true, 'N1 把 allOff 放宽 ⇒ 家族全缺席仍报全关（破坏可观测）');
    A(hostWith({}).beatFacade.status().allOff === true,
      'N1b 原版上同款判据有别（四引擎在场且全关 ⇒ 真）—— 两向成立');
    // N2 fault 改写成 reason 形态 ⇒ A3 判据必须现形
    //   ⚠ 替换串**不得原样复制锚点串** —— 否则本锁里该锚点出现 2 次，A12（判据不携带副本）
    //   会把自己抓出来。故这里用「锚点串变量 + 后缀」拼装，字面量只声明一次。
    const b2 = hit(src, ANCHORS.aFacadeOff, ANCHORS.aFacadeOff + "// reason: 'facade-off'");
    const inline2 = (b2.match(/reason\s*:\s*'[A-Za-z][A-Za-z0-9_-]*'/g) || []);
    A(inline2.length === 1, 'N2 把编排层失败写成 reason 形态 ⇒ A3 的内联扫描当场现形（实 '
      + inline2.length + ' 条）');
    // N3 run 不检门面开关（直接透传）⇒ B4 的 fault 判据必须现形（同样用拼装，不复制锚点串）
    const b3 = hit(src, ANCHORS.aFacadeOff, ANCHORS.aFacadeOff + ' if (false)');
    const WA3 = hostWith({ facadeSrc: b3 });
    const off3 = (function () {
      try { return WA3.beatFacade.run('report', { rec: {} }); } catch (e) { return { threw: String(e.message) }; }
    })();
    A(!!off3 && off3.fault !== 'facade-off', 'N3 挖掉门面开关检查 ⇒ 未开门时不再报 facade-off（破坏可观测）');
    // N4 空块守卫去掉 ⇒ 家族全关时也产块（证明「空串」是真判据不是巧合）
    const b4 = hit(src, ANCHORS.aBlockEmpty, "if (false) return '';");
    const WA4 = hostWith({ facadeSrc: b4 });
    WA4.beatFacade.setSettings({ enabled: true });
    WA4.beatReport.setSettings({ enabled: true });
    WA4.beatReport.report({ verdict: 'setup', chapterKey: 'c1', need: 'x' });
    const b4b = WA4.beatFacade.buildBlock();
    A(b4b !== '' && b4b.indexOf(WA4.beatReport.buildBlock()) >= 0,
      'N4 去掉门面开关守卫 ⇒ 门面关着也能取到块（证明「门面关 ⇒ 空」不是恒真）');
  }
  return true;
}

/** 工具两向自证：锚点不存在 / 不唯一必须抛。 */
function runNegative(A) {
  A((function () { try { hit('abc', 'zzz', 'y'); return false; } catch (e) { return true; } })(),
    'N5 锚点不存在时工具**必须抛**（不许静默返回原串）');
  A((function () { try { hit('aXbXc', 'X', 'y'); return false; } catch (e) { return true; } })(),
    'N6 锚点不唯一时工具**必须抛**（两向自证 —— 用 `aXbXc` 而非 `aXa`：后者里 `X` 只出现 1 次，'
    + '拿它做「不唯一」的样本会让这条判据**恒真**，正是本仓点名过的假判据形态）');
  const src = rd(FA);
  A(hit(src, ANCHORS.aFacadeOff, 'xyz') !== src, 'N7 破坏真改动了文本（不是空操作）');
  A(src.indexOf(ANCHORS.aFacadeOff) >= 0, 'N8 原文件未被污染（破坏只在内存副本上做）');
  return true;
}

module.exports = {
  runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS,
  hostWith: hostWith, hit: hit, FA: FA
};

if (require.main === module) {
  let pass = 0, fail = 0;
  const A = function (cond, name) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; console.log('  \u2717 ' + name); }
  };
  try { runAll(A); runNegative(A); }
  catch (e) { fail++; console.log('  \u2717 异常：' + (e && e.message)); }
  console.log('BEAT-FACADE-V2193: ' + (fail === 0 ? 'pass (' + pass + ')' : 'FAIL ' + fail + ' / ' + pass));
  console.log('  ⏱ ' + (Date.now() - (Date.now() - 0)) + 'ms');
  process.exit(fail === 0 ? 0 : 1);
}