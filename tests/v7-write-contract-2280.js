#!/usr/bin/env node
'use strict';
/**
 * tests/v7-write-contract-2280.js — v2.280.0（V7 OPV7-4）写口契约自描述专锁。
 *
 * 【本锁与探针的分工】探针答「本次改动对不对」；本锁答「以后会不会退回去」。
 *   这一项最容易被「优化」掉的两处，都记在这里：
 *   ① **另写一张契约表**：看起来更快、更漂亮，但它是第二真源 ——
 *      引擎改了表还在念旧的，而表比引擎更容易被相信。锁钉「真源必须是函数体文本」。
 *   ② **读不到时返回空契约**：空数组在调用方眼里就是「没有约束」，于是它会放心去调，
 *      然后被拒。锁钉「读不到 ⇒ null + why，绝不给空数组」。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const WC_REL = 'engines/write-contract.js';
const WC_SRC = fs.readFileSync(path.join(BASE, WC_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
// v2.401.0(OPV23):锚点已搬进 ui/pages/overview-main.js 段体——改读 panelSource() 重组面（重组面 = 真实 panel.js + 段文件重拼,逐字等于拆前面;锚点跟现场走,扩输入面）
const PANEL_SRC = require('./panel-source.js').panelSource();
const RUN_SRC = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function assert(ok, msg) {
  if (ok) { pass++; return; }
  fail++; fails.push(msg);
  console.log('  ✗ ' + msg);
}
function eq(a, b, msg) { assert(a === b, msg + '（实得 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'); }
function section(t) { console.log('\n── ' + t + ' ──'); }
function cnt(s, n) { return String(s).split(n).length - 1; }
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
  return c;
}

const A_ATTR = "} else if (cur) {";
const A_UNR = "        params: null, arity: null, reasons: null, hints: null, guards: null };";
const A_STRIP = "      if (c === '/' && d === '/') { while (i < n && t.charAt(i) !== '\\n') i++; continue; }";

let LOAD = null;
function loadList() {
  if (LOAD) return LOAD;
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  LOAD = vm.runInNewContext('[' + m[1] + ']');
  return LOAD;
}
function loadAll(ov) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try {
    const ls = global.localStorage;
    if (ls && typeof ls.clear === 'function') ls.clear();
    else if (ls && ls.__store) ls.__store = {};
  } catch (e) {}
  const ctx = vm.createContext(global);
  for (const rel of loadList()) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}

const EXPORTS = ['getSettings', 'setSettings', 'contractOf', 'explain', 'scan', 'summaryText', 'stat'];
const KW = { ns: 'worldbook', method: 'safeUpdateEntry', code: 'hand-edited-conflict',
  hint: '条目内容已被外部手动修改，拒绝静默覆盖（需 force: true）' };

// ═══ A 结构 ═══════════════════════════════════════════════════════════
function runA() {
  section('A. 结构：装载同序 / 导出表 / 真源 / 零写 / 消费方');
  assert(IDX_SRC.indexOf("'engines/write-contract.js'") >= 0, 'A1 已进 index.js LOAD_ORDER');
  assert(RUN_SRC.indexOf("'engines/write-contract.js'") >= 0, 'A1b 已进 tests/run.js LOAD');
  // 两处必须严格同序：位置描述用前后邻居判
  const iIdx = IDX_SRC.indexOf("'engines/write-contract.js'");
  const iInt = IDX_SRC.indexOf("'engines/intake-dispatch.js'");
  const iTier = IDX_SRC.indexOf("'engines/capability-tier.js'");
  assert(iInt >= 0 && iTier > 0 && iIdx > iInt && iIdx < iTier,
    'A2 index.js 里位置正确（intake-dispatch 之后、capability-tier 之前）');
  const jIdx = RUN_SRC.indexOf("'engines/write-contract.js'");
  const jInt = RUN_SRC.indexOf("'engines/intake-dispatch.js'");
  const jTier = RUN_SRC.indexOf("'engines/capability-tier.js'");
  assert(jInt >= 0 && jTier > 0 && jIdx > jInt && jIdx < jTier,
    'A2b tests/run.js 里位置严格同序');
  const WA = loadAll();
  eq(Object.keys(WA.writeContract).sort().join(','), EXPORTS.slice().sort().join(','),
    'A3 导出面恰 7 项');
  // A4 真源：必须靠 toString，不许手抄表
  eq(cnt(WC_SRC, 'Function.prototype.toString.call(fn)'), 1, 'A4 真源恰一处（toString）');
  assert(WC_SRC.indexOf("'life") < 0, 'A4b 模块源码里无具体引擎名（不手抄写口名单）');
  eq(WC_SRC.indexOf('store.transact'), -1, 'A5 零世界写入（无 store.transact）');
  eq(WC_SRC.indexOf('store.patch'), -1, 'A5b 零世界写入（无 store.patch）');
  assert(DIAG_SRC.indexOf('WA.writeContract') >= 0, 'A6 诊断面真读');
  assert(DIAG_SRC.indexOf('writeContract: secWriteContract()') >= 0, 'A6b 诊断节已接线');
  assert(PANEL_SRC.indexOf('WA.writeContract') >= 0, 'A6c 面板真读');
  assert(PANEL_SRC.indexOf('wa-wc-line') >= 0, 'A6d 面板提示行有稳定 id');
}

// ═══ B 真值 ═══════════════════════════════════════════════════════════
function runB() {
  section('B. 真值：真实写口的 hint 逐字一致');
  const WA = loadAll();
  const c = WA.writeContract.contractOf(KW.ns, KW.method);
  assert(c && c.ok && c.readable === true, 'B1 目标写口可读');
  eq((c.reasons || []).indexOf(KW.code) >= 0, true, 'B2 抽到拒收码');
  eq((c.hints || {})[KW.code], KW.hint, 'B3 hint 与源码逐字一致');
  assert(Array.isArray(c.params) && c.arity === c.params.length, 'B4 params 与 arity 自洽');
  const c2 = WA.writeContract.contractOf('production', 'deliver');
  eq(c2.cached, false, 'B5 首次未命中缓存');
  const c3 = WA.writeContract.contractOf('production', 'deliver');
  eq(c3.cached, true, 'B5b 同签名第二次命中缓存');
  eq(JSON.stringify(c3.reasons), JSON.stringify(c2.reasons), 'B5c 缓存不改读数');
  assert(WA.writeContract.scan().entries > 100,
    'B6 扫描面非空（实 ' + WA.writeContract.scan().entries + ' 个有拒收码的写口）—— 空集上判据恒真');
}

// ═══ C 不冒充 ═══════════════════════════════════════════════════════════
function runC() {
  section('C. 读不到 / 不存在 / 缺参 三条分支各说各的');
  const WA = loadAll();
  WA.__probeNative = { fake: Function.prototype.bind.call(function () {}) };
  const c = WA.writeContract.contractOf('__probeNative', 'fake');
  eq(c.ok, true, 'C1 不可读不是 ok:false（它是可读性问题，不是没这个方法）');
  eq(c.readable, false, 'C2 readable=false');
  eq(c.reasons, null, 'C3 reasons 为 null（不给空数组）');
  eq(c.hints, null, 'C3b hints 为 null');
  eq(c.params, null, 'C3c params 为 null');
  assert(typeof c.why === 'string' && c.why.length > 0, 'C3d why 说清原因');
  eq(WA.writeContract.contractOf('__no_such_ns__', 'x').reason, 'unknown-namespace', 'C4 不存在的 ns');
  eq(WA.writeContract.contractOf('production', '__no_such__').reason, 'unknown-method', 'C4b 不存在的方法');
  eq(WA.writeContract.contractOf('', '').reason, 'missing-fields', 'C4c 缺参');
}

// ═══ D 归属 ═══════════════════════════════════════════════════════════
function runD() {
  section('D. 归属：不错配 / 不继承 / 不认注释');
  const WA = loadAll();
  WA.__probeAttr = {
    twoBranches: function () {
      if (1) return { ok: false, reason: 'aaa', hint: 'H-A' };
      return { ok: false, reason: 'bbb', hint: 'H-B' };
    },
    onlySecond: function () {
      if (1) return { ok: false, reason: 'ccc' };
      return { ok: false, reason: 'ddd', hint: 'H-D' };
    },
    withComments: function () {
      // 说明：这里原来会 return { ok: false, reason: 'commented', hint: 'H-C' }
      return { ok: false, reason: 'real' };
    },
    useRefuse: function () { return refuse('eee', { hint: 'H-E' }); },
    noHintAtAll: function () { return { ok: false, reason: 'zzz' }; }
  };
  const a1 = WA.writeContract.contractOf('__probeAttr', 'twoBranches');
  eq(a1.hints.aaa, 'H-A', 'D1 分支一各归各的');
  eq(a1.hints.bbb, 'H-B', 'D1b 分支二各归各的');
  const a2 = WA.writeContract.contractOf('__probeAttr', 'onlySecond');
  eq(a2.hints.ccc, undefined, 'D2 无 hint 的 reason 不许继承后一个的');
  eq(a2.hints.ddd, 'H-D', 'D2b 有 hint 的仍归得上');
  const a3 = WA.writeContract.contractOf('__probeAttr', 'withComments');
  eq(a3.reasons.indexOf('commented'), -1, 'D3 注释里的 reason 不算码');
  eq(Object.keys(a3.hints).length, 0, 'D3b 注释里的 hint 也不算');
  const a4 = WA.writeContract.contractOf('__probeAttr', 'useRefuse');
  eq(a4.hints.eee, 'H-E', 'D4 refuse(code,{hint}) 形态也认');
  // D5 explain 三支
  const e1 = WA.writeContract.explain(KW.ns, KW.method, KW.code);
  eq(e1.known, true, 'D5 已知码 known=true');
  eq(e1.hint, KW.hint, 'D5b 且给作者那句');
  const e2 = WA.writeContract.explain(KW.ns, KW.method, 'made-up-code');
  eq(e2.known, false, 'D6 未知码 known=false');
  const e3 = WA.writeContract.explain('__probeAttr', 'noHintAtAll', 'zzz');
  eq(e3.hint, null, 'D7 码有但没写 hint ⇒ null（不编）');
  eq(WA.writeContract.explain(KW.ns, KW.method, '').reason, 'missing-reason', 'D8 缺 reason');
}

// ═══ E 只读 ═══════════════════════════════════════════════════════════
function runE() {
  section('E. 只读：scan 不写世界、不写设置');
  const WA = loadAll();
  try { WA.capabilityTier.applyTier('full'); } catch (e) {}
  const w0 = (WA.settingsBus && WA.settingsBus.stats) ? WA.settingsBus.stats.writes : null;
  const before = JSON.stringify(WA.store.get() || {});
  WA.writeContract.scan(); WA.writeContract.scan();
  eq(JSON.stringify(WA.store.get() || {}), before, 'E1 两次 scan 后 store 逐字未变');
  if (w0 !== null) eq(WA.settingsBus.stats.writes, w0, 'E2 零 settingsBus 写盘');
  // E3 截断必须如实报
  WA.writeContract.setSettings({ maxScan: 100 });
  const rt = WA.writeContract.scan();
  eq(rt.truncated, true, 'E3 maxScan=100 时 truncated=true');
  assert(WA.writeContract.summaryText().indexOf('截断') >= 0, 'E3b 整句里带「截断」');
  try { WA.writeContract.setSettings({ maxScan: 4000 }); } catch (e) {}
}

// ═══ N 负控制 ═══════════════════════════════════════════════════════════
function runNegative() {
  section('N. 负控制：三处真源码破坏 → 装载破坏副本 → 重跑同款判据');
  let broken = 0;
  // N1 归属闸坏掉（hint 无主时也硬塞）
  {
    must1(WC_SRC, A_ATTR, 'N1');
    const b = WC_SRC.replace(A_ATTR, '} else if (true) {');
    assert(b !== WC_SRC, 'N1a 破坏副本真改了字节');
    if (b !== WC_SRC) broken++;
    const ov = {}; ov[WC_REL] = b;
    const W = loadAll(ov);
    W.__probeAttr = { hintFirst: function () {
      const note = "hint: 'H-ORPHAN'";
      return { ok: false, reason: 'qqq', hint: 'H-Q' };
    } };
    const c = W.writeContract.contractOf('__probeAttr', 'hintFirst');
    assert(Object.prototype.hasOwnProperty.call(c.hints, 'null'),
      'N1b 破坏后无主 hint 被塞进 "null" 桶（实 ' + JSON.stringify(c.hints) + '）');
  }
  // N2 读不到时给空契约
  {
    must1(WC_SRC, A_UNR, 'N2');
    const b = WC_SRC.replace(A_UNR, '        params: [], arity: 0, reasons: [], hints: {}, guards: [] };');
    assert(b !== WC_SRC, 'N2a 破坏副本真改了字节');
    if (b !== WC_SRC) broken++;
    const ov = {}; ov[WC_REL] = b;
    const W = loadAll(ov);
    W.__probeNative = { fake: Function.prototype.bind.call(function () {}) };
    const c = W.writeContract.contractOf('__probeNative', 'fake');
    eq(Array.isArray(c.reasons) && c.reasons.length, 0,
      'N2b 破坏后读不到时给空数组 —— 「没有约束」蒙住「读不出来」');
  }
  // N3 注释剥离坏掉
  {
    must1(WC_SRC, A_STRIP, 'N3');
    const b = WC_SRC.replace(A_STRIP, A_STRIP.replace('if (c ===', 'if (false && c ==='));
    assert(b !== WC_SRC, 'N3a 破坏副本真改了字节');
    if (b !== WC_SRC) broken++;
    const ov = {}; ov[WC_REL] = b;
    const W = loadAll(ov);
    W.__probeAttr = { withComments: function () {
      // reason: 'commented' hint: 'H-C'
      return { ok: false, reason: 'real' };
    } };
    const c = W.writeContract.contractOf('__probeAttr', 'withComments');
    assert((c.reasons || []).indexOf('commented') >= 0,
      'N3b 破坏后注释里的 reason 成了真码（实 ' + JSON.stringify(c.reasons) + '）');
  }
  eq(broken, 3, 'N4 三处破坏全部真的改到了源码');
  // N5 两向自证
  const W = loadAll();
  eq(W.writeContract.contractOf(KW.ns, KW.method).hints[KW.code], KW.hint,
    'N5 原版恢复后 hint 重新逐字一致');
  // N6 判据纯度（搜索串用拼接避开自指）
  const SELF = fs.readFileSync(__filename, 'utf8');
  const P1 = 'const A_' + 'ATTR =';
  const P2 = 'const A_' + 'UNR =';
  const P3 = 'const A_' + 'STRIP =';
  eq(cnt(SELF, P1), 1, 'N6a 锚点 N1 只声明一次');
  eq(cnt(SELF, P2), 1, 'N6b 锚点 N2 只声明一次');
  eq(cnt(SELF, P3), 1, 'N6c 锚点 N3 只声明一次');
}

function runAll() {
  pass = 0; fail = 0; fails.length = 0;
  runA(); runB(); runC(); runD(); runE(); runNegative();
  console.log('\n═══ v7-write-contract-2280: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
}
function runNegativeOnly() { pass = 0; fail = 0; runNegative(); }

if (require.main === module) { runAll(); if (fail) process.exit(1); }
module.exports = { runAll: runAll, runNegative: runNegativeOnly };
