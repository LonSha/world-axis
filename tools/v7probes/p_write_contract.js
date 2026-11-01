#!/usr/bin/env node
'use strict';
/**
 * tools/v7probes/p_write_contract.js — OPV7-4 验收探针（写口契约自描述）。
 *
 * 【它验什么】不是「函数能调通」，而是四件事：
 *   A 结构：只读不写 / 不新写一份契约 / 六口各有真消费者 / 导出面收窄
 *   B 真值：三个已知带 hint 的真实写口必须**逐字**读出作者写的那句（不是我们另写的）
 *   C 不冒充：读不到函数体时报 readable:false 且其余字段为 null（不给空数组）
 *   D 归属不错配：构造「hint 出现在别处」的假函数，验证它不会被错配到上一个 reason
 *   E explain：已知码给 hint / 未知码说「本写口里没有这个码」/ 缺参报 missing-fields
 *   F 只读：连调 scan 三次不写任何东西（settingsBus 写计数不动、store 不动）
 *   G 负控制：三处真源码破坏（hint 归属规则 / 读不到时的返回值 / reasons 抽取）
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
const WC_REL = 'engines/write-contract.js';
const WC_SRC = fs.readFileSync(path.join(BASE, WC_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');

let pass = 0, fail = 0;
function A(c, msg) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function head(t) { console.log('\n=== ' + t + ' ==='); }
function cnt(s, n) { return String(s).split(n).length - 1; }

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
  for (const rel of LOAD) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}

// ═══ A 结构 ═══════════════════════════════════════════════════════════
head('A 结构：只读 / 不新写契约 / 六口有读者');
const EXPORTS = ['getSettings', 'setSettings', 'contractOf', 'explain', 'scan', 'summaryText', 'stat'];
let WA = loadAll();
A(!!WA.writeContract, 'A1 writeContract 已装载');
A(WA.writeContract && Object.keys(WA.writeContract).sort().join(',') === EXPORTS.slice().sort().join(','),
  'A2 导出面恰 7 项（实 ' + (WA.writeContract ? Object.keys(WA.writeContract).join(',') : 'none') + '）');
// A3 不新写一份契约：模块里不许出现手抄的写口名单（那会漂移成第二真源）
A(WC_SRC.indexOf("'life") < 0 && WC_SRC.indexOf('\"life') < 0,
  'A3 模块源码里不出现具体引擎名（不手抄写口名单）');
// A4 真源是 toString：源码里必须出现 Function.prototype.toString
//   ⚠ 首版写成 `indexOf(...) === 1` —— indexOf 返回的是**位置**不是次数，
//   而那个位置恰好是 7414（不是 1）。判据自己用错了函数，会把一件已经成立的事报成红。
A(cnt(WC_SRC, 'Function.prototype.toString.call(fn)') === 1,
  'A4 真源是函数体文本（Function.prototype.toString.call(fn) 恰 1 处，实 '
  + cnt(WC_SRC, 'Function.prototype.toString.call(fn)') + '）');
// A5 零写：模块里不许出现 store.transact / store.patch
A(WC_SRC.indexOf('store.transact') < 0 && WC_SRC.indexOf('store.patch') < 0,
  'A5 零世界写入（无 store.transact / store.patch）');
// A6 消费方：诊断节真读、面板真读
A(DIAG_SRC.indexOf('WA.writeContract') >= 0, 'A6 诊断面真读 writeContract');
A(PANEL_SRC.indexOf('WA.writeContract') >= 0, 'A6b 面板真读 writeContract');
// A6c 面板那一行有稳定 id（否则 ui-gate 与专锁没法按节点定位它）
A(PANEL_SRC.indexOf('wa-wc-line') >= 0, 'A6c 面板提示行带稳定 id（wa-wc-line）');
// A6d 「只在值得说的时候说」这条口径真在代码里（withHint 为 0 就整行不出现）
A(/if \(!st \|\| !\(Number\(st\.withHint\) > 0\)\) return '';/.test(PANEL_SRC),
  'A6d withHint 为 0 时整行不出现（提示不是装饰）');

// ═══ B 真值：三个已知写口逐字核对 ═══════════════════════════════════
head('B 真值：三个已知带 hint 的写口必须逐字读出作者那句');
const CASES = [
  { ns: 'worldbook', method: 'safeUpdateEntry', code: 'hand-edited-conflict',
    hint: '条目内容已被外部手动修改，拒绝静默覆盖（需 force: true）' },
  { ns: 'production', method: 'deliver', code: 'not-done',
    hint: '工期没走完就交不出货（两日单首日不出货）' },
  { ns: 'production', method: 'deliverPartial', code: 'insufficient-progress',
    hint: '当前工期进度尚未做完任何整件，无法部分交付' }
];
CASES.forEach(function (cs) {
  const c = WA.writeContract.contractOf(cs.ns, cs.method);
  const tag = cs.ns + '.' + cs.method;
  A(c && c.ok && c.readable === true, 'B1 ' + tag + ' 可读');
  A((c.reasons || []).indexOf(cs.code) >= 0, 'B2 ' + tag + ' 抽到拒收码 ' + cs.code
    + '（实 ' + JSON.stringify(c.reasons) + '）');
  A((c.hints || {})[cs.code] === cs.hint, 'B3 ' + tag + ' 的 hint 与源码逐字一致（实「'
    + String((c.hints || {})[cs.code]).slice(0, 40) + '…」）');
});
// B4 形参与 arity 来自函数头，不是猜的
const cDeliver = WA.writeContract.contractOf('production', 'deliver');
A(Array.isArray(cDeliver.params) && cDeliver.params.length === cDeliver.arity,
  'B4 params 与 arity 自洽（' + JSON.stringify(cDeliver.params) + '）');
A(cDeliver.guards.indexOf('switch') >= 0, 'B5 认出开关闸（production.deliver 首行就是 !settings().enabled）');
// B6 缓存：同签名第二次命中缓存
const c1 = WA.writeContract.contractOf('production', 'deliver');
A(c1.cached === true, 'B6 第二次读命中缓存（实 ' + c1.cached + '）');
A(JSON.stringify(c1.reasons) === JSON.stringify(cDeliver.reasons), 'B6b 缓存不改读数');

// ═══ C 不冒充 ═══════════════════════════════════════════════════════════
head('C 读不到时如实报 readable:false，不给空数组冒充「没有约束」');
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
// 造一个不可读的函数（native code 形态：用绑定函数无法伪造 toString，故直接替换 WA 上的一格）
WA.__probeNative = { fake: Function.prototype.bind.call(function () {}) };
const cN = WA.writeContract.contractOf('__probeNative', 'fake');
A(cN && cN.ok === true, 'C1 不可读时不返回 ok:false（它是「可读性」的问题，不是「没这个方法」）');
A(cN.readable === false, 'C2 readable === false（实 ' + cN.readable + '）');
A(cN.reasons === null && cN.hints === null && cN.guards === null && cN.params === null,
  'C3 其余字段一律 null，**不给空数组**（空数组在调用方眼里等于「没有约束」，与「读不出来」处置相反）');
A(typeof cN.why === 'string' && cN.why.length > 0, 'C3b why 说清原因（实「' + cN.why + '」）');
// C4 不存在的命名空间 / 方法各有独立的码
A(WA.writeContract.contractOf('__no_such_ns__', 'x').reason === 'unknown-namespace',
  'C4 不存在的 ns ⇒ unknown-namespace');
A(WA.writeContract.contractOf('production', '__no_such__').reason === 'unknown-method',
  'C4b 不存在的方法 ⇒ unknown-method');
A(WA.writeContract.contractOf('', '').reason === 'missing-fields', 'C4c 缺参 ⇒ missing-fields');

// ═══ D 归属不错配 ═══════════════════════════════════════════════════════
head('D 归属不错配：hint 出现在别的 reason 段里不会被错配');
WA = loadAll();
// 造四个假函数，各测一种归属形态
WA.__probeAttr = {
  // ① 前置闸（A）带 hint，后面（B）也带 hint —— 必须各归各的
  twoBranches: function () {
    if (1) return { ok: false, reason: 'aaa', hint: 'H-A' };
    return { ok: false, reason: 'bbb', hint: 'H-B' };
  },
  // ② 只有 B 带 hint，A 没有 —— A 不许**继承** B 的 hint
  onlySecond: function () {
    if (1) return { ok: false, reason: 'ccc' };
    return { ok: false, reason: 'ddd', hint: 'H-D' };
  },
  // ③ 注释里的 reason 与 hint 是文档，不是码 —— 必须被剥离
  withComments: function () {
    // 说明：这里原来会 return { ok: false, reason: 'commented', hint: 'H-C' }
    /* blocked: reason: 'blocked-c', hint: 'H-BLOCK' */
    return { ok: false, reason: 'real' };
  },
  // ④ refuse 辅助形态（引擎主流写法之一）也必须认
  useRefuse: function () {
    return refuse('eee', { hint: 'H-E' });
  }
};
const a1 = WA.writeContract.contractOf('__probeAttr', 'twoBranches');
A(a1.hints.aaa === 'H-A' && a1.hints.bbb === 'H-B',
  'D1 两个分支各归各的（实 ' + JSON.stringify(a1.hints) + '）');
const a2 = WA.writeContract.contractOf('__probeAttr', 'onlySecond');
A(a2.hints.ccc === undefined, 'D2 没有 hint 的 reason 不许继承后一个的（ccc 实 '
  + JSON.stringify(a2.hints.ccc) + '）');
A(a2.hints.ddd === 'H-D', 'D2b 后一个有 hint 的仍能归上（ddd=' + a2.hints.ddd + '）');
const a3 = WA.writeContract.contractOf('__probeAttr', 'withComments');
A(a3.reasons.indexOf('commented') < 0 && a3.reasons.indexOf('blocked-c') < 0,
  'D3 注释里的 reason 不算码（实 ' + JSON.stringify(a3.reasons) + '）—— 注释是文档不是码');
A(Object.keys(a3.hints || {}).length === 0,
  'D3b 注释里的 hint 也不算（实 ' + JSON.stringify(a3.hints) + '）');
const a4 = WA.writeContract.contractOf('__probeAttr', 'useRefuse');
A(a4.reasons.indexOf('eee') >= 0 && a4.hints.eee === 'H-E',
  'D4 refuse(\'code\', {hint}) 形态也认（实 ' + JSON.stringify(a4.hints) + '）');

// ═══ E explain ═══════════════════════════════════════════════════════════
head('E explain：已知码给 hint / 未知码如实说没有 / 缺参报字段');
WA = loadAll();
const e1 = WA.writeContract.explain('production', 'deliver', 'not-done');
A(e1.ok === true && e1.known === true && e1.hint === CASES[1].hint,
  'E1 已知码给出作者那句 hint（实「' + String(e1.hint).slice(0, 30) + '…」）');
const e2 = WA.writeContract.explain('production', 'deliver', 'totally-made-up');
A(e2.ok === true && e2.known === false, 'E2 未知码 known=false');
A(typeof e2.why === 'string' && e2.why.indexOf('没有出现该拒收码') >= 0,
  'E2b 且说清是「本写口里没有这个码」（实「' + String(e2.why).slice(0, 40) + '…」）');
const e3 = WA.writeContract.explain('production', 'deliver', '');
A(e3.ok === false && e3.reason === 'missing-reason', 'E3 缺 reason ⇒ missing-reason');
// E4 码存在但作者没写 hint —— 必须如实说「没有」，不许编
WA = loadAll();
WA.__probeAttr = { noHint: function () { return { ok: false, reason: 'zzz' }; } };
const e4 = WA.writeContract.explain('__probeAttr', 'noHint', 'zzz');
A(e4.ok === true && e4.known === true && e4.hint === null,
  'E4 码有但作者没写 hint ⇒ hint=null（不许编，实 ' + JSON.stringify(e4.hint) + '）');
A(typeof e4.why === 'string' && e4.why.indexOf('没有自带 hint') >= 0,
  'E4b 且说明「作者没写下一步」（实「' + String(e4.why).slice(0, 30) + '…」）');

// ═══ F 只读 ═══════════════════════════════════════════════════════════
head('F 只读：连调三次 scan 不写任何东西');
WA = loadAll();
try { WA.capabilityTier.applyTier('full'); } catch (e) {}
const w0 = (WA.settingsBus && WA.settingsBus.stats) ? WA.settingsBus.stats.writes : null;
const before = JSON.stringify(WA.store.get() || {});
const r1 = WA.writeContract.scan();
const r2 = WA.writeContract.scan();
const r3 = WA.writeContract.scan();
const after = JSON.stringify(WA.store.get() || {});
const w1 = (WA.settingsBus && WA.settingsBus.stats) ? WA.settingsBus.stats.writes : null;
A(before === after, 'F1 三次 scan 后 store 逐字未变');
if (w0 !== null) A(w0 === w1, 'F2 零 settingsBus 写盘（' + w0 + ' → ' + w1 + '）');
else A(true, 'F2 前提：settingsBus.stats 不可读（本行如实标注）');
A(r1.scanned === r2.scanned && r2.scanned === r3.scanned, 'F3 三次读数一致（实 '
  + r1.scanned + '/' + r2.scanned + '/' + r3.scanned + '）');
A(r1.entries > 0, 'F4 扫描面非空（实 ' + r1.entries + ' 个有拒收码的写口）—— 空集上的一切判据都恒真');
A(r1.withHint > 0 && r1.withHint <= r1.entries, 'F4b withHint 在 (0, entries] 内（实 ' + r1.withHint + '）');
A(typeof WA.writeContract.summaryText() === 'string' && WA.writeContract.summaryText().length > 10,
  'F5 summaryText 是可读整句');
// F6 截断必须如实报（maxScan 是容量，不是「扫完了」）
WA.writeContract.setSettings({ maxScan: 100 });
const rt = WA.writeContract.scan();
A(rt.truncated === true && rt.scanned <= 100, 'F6 maxScan=100 时 truncated=true（实 scanned '
  + rt.scanned + ' / truncated ' + rt.truncated + '）');
A(WA.writeContract.summaryText().indexOf('截断') >= 0, 'F6b 整句里带「截断」二字（不许冒充扫完）');
try { WA.writeContract.setSettings({ maxScan: 4000 }); } catch (e) {}

// ═══ G 负控制：三处真源码破坏 ═══════════════════════════════════════
head('G 负控制（三处真源码破坏）');
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
}
let broken = 0;
// G1 归属规则坏掉：hint 无条件归最后一个 reason（最容易写错的写法）
(function () {
  const A_ATTR = "} else if (cur) {";
  must1(WC_SRC, A_ATTR, 'G1');
  const b = WC_SRC.replace(A_ATTR, "} else if (true) {");
  A(b !== WC_SRC, 'G1a 破坏副本真改了字节');
  if (b !== WC_SRC) broken++;
  const ov = {}; ov[WC_REL] = b;
  const W = loadAll(ov);
  //   ⚠ G1 的靶标换过一次（记下来）：第一版拿两个 reason 各带 hint 的夹具测，
  //   结果破坏版与正版读数一样 —— 因为那个夹具下「最后一个 reason」正好就是该 hint 的主人。
  //   闸门 `if (cur)` 真正防的是**hint 出现在任何 reason 之前**（此时归给谁都是错的）。
  W.__probeAttr = { hintFirst: function () {
    const note = "hint: 'H-ORPHAN'";
    return { ok: false, reason: 'qqq', hint: 'H-Q' };
  } };
  const c = W.writeContract.contractOf('__probeAttr', 'hintFirst');
  //   破坏版下，那个「无主的 hint」会被硬塞进一个叫 "null" 的桶里。
  A(Object.prototype.hasOwnProperty.call(c.hints, 'null') || c.hints.qqq !== 'H-Q',
    'G1b 破坏后无主的 hint 被硬塞进某个桶（实 ' + JSON.stringify(c.hints) + '）—— 闸门失效');
})();
// G2 读不到时返回空契约（「没有约束」冒充「读不出来」）
(function () {
  const A_UNR = "        params: null, arity: null, reasons: null, hints: null, guards: null };";
  must1(WC_SRC, A_UNR, 'G2');
  const b = WC_SRC.replace(A_UNR, "        params: [], arity: 0, reasons: [], hints: {}, guards: [] };");
  A(b !== WC_SRC, 'G2a 破坏副本真改了字节');
  if (b !== WC_SRC) broken++;
  const ov = {}; ov[WC_REL] = b;
  const W = loadAll(ov);
  W.__probeNative = { fake: Function.prototype.bind.call(function () {}) };
  const c = W.writeContract.contractOf('__probeNative', 'fake');
  A(Array.isArray(c.reasons) && c.reasons.length === 0,
    'G2b 破坏后读不到时给的是空数组（实 ' + JSON.stringify(c.reasons) + '）—— 「没有约束」蒙住了「读不出来」');
})();
// G3 括号/注释剥离坏掉：注释里的码被当真的
(function () {
  const A_STRIP = "      if (c === '/' && d === '/') { while (i < n && t.charAt(i) !== '\\n') i++; continue; }";
  must1(WC_SRC, A_STRIP, 'G3');
  // 摘掉行注释剥离：把 continue 改成什么都不做（于是注释内容留在正文里）
  const b = WC_SRC.replace(A_STRIP, "      if (false) { while (i < n && t.charAt(i) !== '\\n') i++; continue; }");
  A(b !== WC_SRC, 'G3a 破坏副本真改了字节');
  if (b !== WC_SRC) broken++;
  const ov = {}; ov[WC_REL] = b;
  const W = loadAll(ov);
  W.__probeAttr = { withComments: function () {
    // reason: 'commented' hint: 'H-C'
    return { ok: false, reason: 'real' };
  } };
  const c = W.writeContract.contractOf('__probeAttr', 'withComments');
  A((c.reasons || []).indexOf('commented') >= 0,
    'G3b 破坏后注释里的 reason 被当成真的码（实 ' + JSON.stringify(c.reasons) + '）—— 文档冒充代码');
})();
A(broken === 3, 'G4 三处破坏全部真的改到了源码（实 ' + broken + '）');
// G5 两向自证：恢复原版后判据重新为真
WA = loadAll();
const back = WA.writeContract.contractOf('production', 'deliver');
A(back.hints['not-done'] === CASES[1].hint, 'G5 原版恢复后 hint 重新逐字一致（两向自证成立）');
A(cnt(WC_SRC, "      if (c === '/' && d === '/') { while (i < n && t.charAt(i) !== '\\n') i++; continue; }") === 1,
  'G6 行注释锚点在原文件里恰 1 次（负控制全跑在内存副本上，零文件改写）');

console.log('');
console.log('========== 汇总：' + pass + ' passed, ' + fail + ' failed ==========');
if (fail) process.exit(1);
