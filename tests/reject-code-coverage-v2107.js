'use strict';
/**
 * tests/reject-code-coverage-v2107.js — 拒收码分类完备性（计划一 #17）四段专锁。
 *   A 静态契约：导出面形状、三张登记面形态、口径表不许放宽、锚点纯度。
 *   B 运行时：真跑 reject-code-coverage，拿现场读数（声明面 / 恒等式 / 覆盖率 / 发现面）。
 *   C 不变式：判据纯只读（连调不变量、不改被取证文件）。
 *   N 负控制：**真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据**。
 *
 * 为什么负控制走「装载破坏副本」而不是改真文件：本模块要治的病之一正是「覆盖率与恒等式
 *   各自看起来正常」，若验证判据真会现形要靠改真文件，验证者自己就成了新的风险源。
 *   副本装载用 vm.runInNewContext 包一层 CommonJS 外壳，`__dirname` 指到 tests/，
 *   故副本里的相对 require 与 path.join(__dirname,'..') 都照原样工作——这是「装载」
 *   而不是「字符串匹配」：破坏必须在**真模块**上现形，否则破坏可能只改到了注释。
 *
 * 本锁自证（H 系列口径）：
 *   H5 每个锚点字面量在其目标文件里恰中 1 次，且在本文件里恰声明 1 次（缺失与重复同罪）。
 *   H6 判据两向自证：原版上必须为真（A/B 组），破坏副本上必须为假（N 组）；
 *      且每处破坏必须**真的改变源码**（breakOnce 会抛，不许静默）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/reject-code-coverage-v2107.js';
const MOD_REL = 'tests/reject-code-coverage.js';
const RUN_REL = 'tests/run.js';
const WIT_REL = 'tests/reject-v2780.js';

/**
 * 统一锚点表（{rel, txt}；txt 在目标文件里恰中 1 次）。
 * 一律取**不含反斜杠**的行首片段——含非换行反斜杠的锚点在统一纯度口径下结构性不可满足
 * （R87 的 H7 已记档）。
 */
const ANCHORS = {
  aDefer: { rel: MOD_REL, txt: 'const DEFERRED = {};' },
  aWant: { rel: MOD_REL, txt: 'const WANT_RE = ' },
  aStrip: { rel: MOD_REL, txt: 'const src = stripComments(' },
  aDecl: { rel: MOD_REL, txt: 'function declarations(opt) {' },
  aCov: { rel: MOD_REL, txt: 'function coverage(deps) {' },
  aSum: { rel: MOD_REL, txt: 'function summary(deps) {' },
  aDisc: { rel: MOD_REL, txt: 'function discover() {' },
  aWire: { rel: RUN_REL, txt: "const rcc = require('./reject-code-coverage.js');" }
};

/** 现场破坏：**全部**出现处一次改掉（字符串版 replace 只改第一处——v2.105.0 的 D2 教训）。 */
function allReplace(src, from, to) { return src.split(from).join(to); }

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/** 在真源码上做一次破坏，并证明破坏真的发生了（没打中 ⇒ 抛，不许静默）。 */
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label + ' :: ' + from);
  return out;
}

/**
 * 装载破坏副本：把源码包成 CommonJS 外壳在 vm 里跑，`__dirname` 指到目标文件原目录，
 * 故相对 require 与 path.join(__dirname,'..') 与真模块完全一致。
 */
function loadCopy(rel, src) {
  const dir = path.dirname(path.join(BASE, rel));
  const m = { exports: {} };
  // require 解析必须与 Node 同规矩：裸模块名（fs / path / vm）走模块查找，
  // 只有相对路径才补 dir。若一律 path.resolve(dir, p)，`fs` 会被拼成 <dir>/fs ⇒
  // Cannot find module（副本装载失败会被误读成「判据在破坏下也没反应」）。
  const req = function (p) {
    if (p.charAt(0) !== '.') return require(p);
    return require(path.resolve(dir, p));
  };
  // shebang 不是合法 JS：包进 CommonJS 外壳后 `#!...` 会变成 SyntaxError
  // （Invalid or unexpected token），而 `.js` 带 shebang 本身是对的（可执行入口）。
  // 装载副本前必须先剥掉——本锁锚点一律取函数体/常量区，不取首行，故此剥离不影响破坏落点。
  const body = src.replace(/^#![^\n]*\n/, '');
  const fn = vm.runInNewContext(
    '(function (module, exports, require, __filename, __dirname) {\n' + body + '\n})',
    { console: console, process: process, Buffer: Buffer });
  fn(m, m.exports, req, path.join(BASE, rel), dir);
  return m.exports;
}

/** 锚点纯度（H5）：每条锚点在目标文件里恰 1 次、在本锁里恰 1 次。 */
function auditAnchors(A) {
  const self = rd(SELF_REL);
  Object.keys(ANCHORS).forEach(function (k) {
    const a = ANCHORS[k];
    const nTarget = rd(a.rel).split(a.txt).length - 1;
    const nSelf = self.split(a.txt).length - 1;
    A(nTarget === 1, 'A5 锚点 ' + k + ' 在 ' + a.rel + ' 里恰 1 次（实 ' + nTarget + '）');
    A(nSelf === 1, 'A5 锚点 ' + k + ' 在本锁里恰声明 1 次（实 ' + nSelf + '，缺失与重复同罪）');
  });
}

/** 取 DEFERRED 字面量区（供字符串级破坏与判据共用）。 */
function deferredRegion(src) {
  const i = src.indexOf('const DEFERRED = ');
  if (i < 0) return null;
  const j = src.indexOf(';', i);
  return src.slice(i, j + 1);
}

function runAll(A) {
  const S = rd(MOD_REL);
  const M = require('./reject-code-coverage.js');

  // ── A 静态契约 ──
  const EXPORTS = ['DEFERRED', 'declarations', 'coverage', 'summary', 'discover', 'WANT_RE'];
  const keys = Object.keys(M).sort();
  A(keys.join(',') === EXPORTS.slice().sort().join(','),
    'A1 导出面恰为 ' + EXPORTS.length + ' 项（实 ' + keys.join(',') + '）');
  A(typeof M.declarations === 'function' && typeof M.coverage === 'function'
    && typeof M.summary === 'function' && typeof M.discover === 'function',
    'A1b 四个入口全是函数（declarations / coverage / summary / discover）');

  // 延后登记表必须**显式为空**：任何一条登记都是「已接受的缺口」，需要人复核
  const dKeys = Object.keys(M.DEFERRED);
  A(M.DEFERRED && typeof M.DEFERRED === 'object' && !Array.isArray(M.DEFERRED) && dKeys.length === 0,
    'A2 DEFERRED 是空表（一条都不允许延后；实 ' + dKeys.length + ' 条：' + dKeys.join(',') + '）');
  A(typeof M.WANT_RE === 'object' && M.WANT_RE.global === true && M.WANT_RE.source.indexOf('want\\(') >= 0,
    'A3 WANT_RE 是全局匹配且认 want( 调用（反斜杠转义写法）');
  A(deferredRegion(S) === ANCHORS.aDefer.txt,
    'A3b DEFERRED 的**字面量区**是空对象（不许靠动态赋值绕开 A2 的读法）');
  // 「注释里的 want() 是文档」这条边界必须真写在实现里
  const declBody = S.slice(S.indexOf(ANCHORS.aDecl.txt), S.indexOf(ANCHORS.aCov.txt));
  A(declBody.indexOf('stripComments') >= 0,
    'A5b declarations 先剥注释再匹配（注释里的 want() 是文档，不是码）');
  // 读数必须能被打出来：summary 里必须有覆盖率与百分号
  A(S.indexOf("+ '%'") >= 0 || S.indexOf("'%'") >= 0, 'A6 summary 输出百分号（读数必须打出来）');
  A(S.indexOf('恒等式平') >= 0 && S.indexOf('覆盖率') >= 0,
    'A6b summary 同时给出覆盖率与恒等式态（两者缺一都无法区分「真没有」与「扫描器瞎了」）');
  A(S.indexOf('identities: { leftover:') >= 0 && S.indexOf('identityOk') >= 0,
    'A7 恒等式口径存在（sum === total，且缺口可读）');
  // 口径表不许放宽：EXTERNAL_PREFIX 属模块级 NS 面，此处只锁本模块的 DEFERRED 默认源
  A(S.indexOf('d.deferred || DEFERRED') >= 0,
    'A8 coverage 的延后登记默认源是 DEFERRED 本体（不是就地空对象）');
  
  auditAnchors(A);

  // ── B 运行时（现场真跑） ──
  const dec = M.declarations();
  A(dec.declared >= 100 && dec.occurrences >= dec.declared,
    'B1 见证表声明面：' + dec.declared + ' 个码 / ' + dec.occurrences + ' 次出现 ≥100（防空集恒真）');
  A(Array.isArray(dec.duplicated),
    'B1b 重复声明清单可读（字典静默覆盖 ⇒ 必须能报出来；实 ' + JSON.stringify(dec.duplicated) + '）');
  // 注释里的 want() 不得计入
  const withComment = "// want('ghost-code', 'doc')\n" + "want('real-code', 'real');\n";
  const dGhost = M.declarations({ src: withComment });
  A(dGhost.declared === 1 && dGhost.rows[0].code === 'real-code',
    'B2 注释里的 want() 不计入声明面（实声明 ' + dGhost.declared + ' 个：'
    + dGhost.rows.map(function (r) { return r.code; }).join(',') + '）');

  const D = M.discover();
  const c = D.coverage;
  A(c.total >= 300 && c.witnessed >= 100 && c.dead >= 1 && c.base >= 100,
    'B3 覆盖率分母 ' + c.total + ' ≥300（见证 ' + c.witnessed + ' / 死表 ' + c.dead + ' / 基线 ' + c.base + '）');
  A(c.identityOk && c.sum === c.total && c.identities.leftover === 0,
    'B4 三集恒等式：' + c.witnessed + '+' + c.dead + '+' + c.base + ' = ' + c.sum
    + ' === 扫描面 ' + c.total + '（差 ' + c.identities.leftover + '）');
  A(c.allInScan, 'B4b 三集都是扫描面的子集（名单里有、源码里没有的码不许混进分母）');
  A(Math.abs(c.rate - c.covered / c.total) < 1e-12 && c.covered === c.witnessed + c.dead,
    'B5 覆盖率读数自洽：covered ' + c.covered + ' = 见证+死表，rate ' + c.rate.toFixed(4));
  A(c.rate >= 0.3, 'B5b 覆盖率下限 ' + (c.rate * 100).toFixed(2) + '% ≥30%（口径不许被悄悄改小）');
  // summary 与 coverage 必须同源（两处各写一种数就是 v2.106.x 那族病）
  A(D.summary.indexOf(String(c.total)) >= 0 && D.summary.indexOf(String(c.covered)) >= 0
    && D.summary.indexOf('%') >= 0 && D.summary.indexOf('恒等式平') >= 0,
    'B6 summary 与 coverage 同源：' + D.summary);
  A(D.missing.length === 0 && D.unexpected.length === 0,
    'B7 见证面零缺口（missing ' + D.missing.length + ' / unexpected ' + D.unexpected.length + '）');
  A(D.declarations.declared === dec.declared && D.declarations.occurrences === dec.occurrences,
    'B7b discover 里的声明面与 declarations() 同值（同一真源，不重算）');
  // 分母必须与门禁扫描面同源
  const gate = require('./reject-code-gate.js');
  const sc = gate.scan();
  A(Object.keys(sc.hits).length === c.total,
    'B8 覆盖率分母 === reject-code-gate 扫描面（' + Object.keys(sc.hits).length + ' === ' + c.total + '）');
  const ledger = JSON.parse(rd('tests/reject-code-ledger.json'));
  A(Object.keys(ledger.base || {}).length === c.base,
    'B9 基线集与台账 base 同源（' + Object.keys(ledger.base || {}).length + ' === ' + c.base + '；'
    + '台账结构：' + (Array.isArray(ledger.base) ? '数组' : '对象') + '）');
  // 延后登记的两向：未登记 ⇒ 算缺口；登记 ⇒ 才算已接受
  const twoWay = M.coverage({ scan: sc, expect: { 'ghost-code': 'desc' }, seen: {}, dead: {}, base: {} });
  A(twoWay.undeclaredDefer.length === 1 && twoWay.undeclaredDefer[0] === 'ghost-code',
    'B10 声明了却跑不出来的码 ⇒ 未登记的算真缺口（实 ' + JSON.stringify(twoWay.undeclaredDefer) + '）');
  const twoWay2 = M.coverage({ scan: sc, expect: { 'ghost-code': 'desc' }, seen: {},
    dead: {}, base: {}, deferred: { 'ghost-code': 'known' } });
  A(twoWay2.undeclaredDefer.length === 0,
    'B10b 显式登记后才算已接受（登记表真在生效，不是装饰）');
  A(D.deferred && Object.keys(D.deferred).length === 0, 'B10c 现场 DEFERRED 为空（默认一条都不许延后）');

  // ── C 不变式 ──
  const before = { wit: rd(WIT_REL), led: rd('tests/reject-code-ledger.json') };
  const r1 = M.declarations(), r2 = M.declarations(), r3 = M.declarations();
  A(JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(r2) === JSON.stringify(r3),
    'C1 declarations 连调幂等（三次同值）');
  const c1 = M.coverage({ scan: sc }), c2 = M.coverage({ scan: sc });
  A(JSON.stringify(c1) === JSON.stringify(c2), 'C1b coverage 连调幂等（同输入同输出）');
  const s1 = M.summary({ scan: sc }), s2 = M.summary({ scan: sc });
  A(s1 === s2, 'C1c summary 连调幂等');
  A(rd(WIT_REL) === before.wit && rd('tests/reject-code-ledger.json') === before.led,
    'C2 判据纯只读：连调后见证表与台账逐字未变（取证不得改变被取证对象）');
}

function runNegative(A) {
  const S = rd(MOD_REL);
  const gate = require('./reject-code-gate.js');
  const sc = gate.scan();

  // ── N1 真源码破坏：DEFERRED 字面量区填一条假码 ⇒ 空表判据必须现形 ──
  const n1src = breakOnce(S, ANCHORS.aDefer.txt, "const DEFERRED = { 'ghost-code': 'X' };", 'N1');
  A(n1src !== S, 'N1 破坏真的发生（DEFERRED 字面量区已被替换）');
  const n1 = loadCopy(MOD_REL, n1src);
  A(Object.keys(n1.DEFERRED).length === 1 && defaultDeferJudgment(n1) === false,
    'N1b 装载破坏副本 ⇒ 空表判据为假（原版为真，见 A2）——判据不是恒真');
  A(deferredRegion(n1src) !== deferredRegion(S),
    'N1c 字面量区判据（A3b）同样在副本上现形（破坏绕不过两条读法）');

  // ── N2 真源码破坏：declarations 被短路 ⇒ 声明面归零，B1 的下限判据必须现形 ──
  const n2src = allReplace(S, ANCHORS.aDecl.txt,
    ANCHORS.aDecl.txt + ' return { rows: [], counts: {}, declared: 0, occurrences: 0, duplicated: [] };',
    'N2');
  A(n2src !== S, 'N2 破坏真的发生（declarations 被短路）');
  const n2 = loadCopy(MOD_REL, n2src);
  A(n2.declarations().declared === 0 && n2.declarations().declared < 100,
    'N2b 装载破坏副本 ⇒ 声明面归零、B1 的下限判据为假（证明 B1 真在测现场而不是在测常量）');

  // ── N3 真源码破坏：移除 stripComments ⇒ 注释里的 want() 被算进来 ──
  const n3src = breakOnce(S, ANCHORS.aStrip.txt, 'const src = ((x) => x)(', 'N3');
  const n3 = loadCopy(MOD_REL, n3src);
  const dGhost = n3.declarations({ src: "// want('ghost-code', 'doc')\nwant('real-code', 'real');\n" });
  A(dGhost.declared === 2,
    'N3b 装载破坏副本 ⇒ 注释里的 want() 被计入（实 ' + dGhost.declared + ' 个：'
    + dGhost.rows.map(function (r) { return r.code; }).join(',') + '）——证明 B2 真的在挡这条边界');

  // ── N4 真源码破坏：恒等式被短路 ⇒ 现场必须报不平 ──
  const n4src = breakOnce(S, 'const sum = wCodes.length + dCodes.length + bCodes.length;',
    'const sum = 0;', 'N4');
  const n4 = loadCopy(MOD_REL, n4src);
  const covered4 = n4.coverage({ scan: sc, expect: { a: 1 }, seen: { a: true }, dead: {}, base: {} });
  A(covered4.identityOk === false && covered4.sum === 0,
    'N4b 装载破坏副本 ⇒ 恒等式不平（sum ' + covered4.sum + ' vs total ' + covered4.total
    + '）——证明 B4 不是恒真');

  // ── N5 真源码破坏：延后登记的默认源被抽空 ⇒ 注入了 DEFERRED 也不再豁免 ──
  // 破坏点必须选在**本用例真会走到**的那条路径上：原破坏（默认源抽空）在
  // 「显式注入了 deferred 表」的用例里根本不可观测（注入优先于默认源），
  // 于是判据在副本上也报 0，被误读成「判据恒真」。改为让副本**无视注入表**。
  const n5src = breakOnce(S, 'const deferredRegistry = d.deferred || DEFERRED;',
    'const deferredRegistry = {};', 'N5');
  const n5 = loadCopy(MOD_REL, n5src);
  const cov5 = n5.coverage({ scan: sc, expect: { 'ghost-code': 'desc' }, seen: {}, dead: {}, base: {},
    deferred: { 'ghost-code': 'known' } });
  A(cov5.undeclaredDefer.length === 1,
    'N5b 装载破坏副本 ⇒ 即便注入了登记表也不再豁免（实 ' + cov5.undeclaredDefer.length
    + '）——证明 A8 锁的「默认源」真在生效');

  // ── N6 真源码破坏：summary 去掉百分号 ⇒ 读数可读性判据现形 ──
  const n6src = breakOnce(S, "(c.rate * 100).toFixed(2) + '%'", "(c.rate * 100).toFixed(2) + ''", 'N6');
  const n6 = loadCopy(MOD_REL, n6src);
  A(n6.summary({ scan: sc }).indexOf('%') < 0,
    'N6b 装载破坏副本 ⇒ summary 不再含百分号（证明 A6 真在测读数可读性）');

  // ── N7 反向自证（H6）：原版上同款判据必须为真 ──
  const M = require('./reject-code-coverage.js');
  A(defaultDeferJudgment(M) === true,
    'N7 原版上「DEFERRED 恰为空」为真，破坏副本上为假 —— 两向自证成立');
  A(M.discover().coverage.identityOk === true,
    'N7b 原版上恒等式为真，破坏副本上为假（N4b）—— 两向自证成立');

  // ── N8 破坏落点全部可核（不靠改真文件） ──
  A([n1src, n2src, n3src, n4src, n5src, n6src].every(function (x) { return x !== S; }),
    'N8 六处破坏全部真的改变了源码（且都是内存副本，真文件逐字未动）');
  A(rd(MOD_REL) === S, 'N8b 真文件在全部负控制跑完后逐字未变（负控制不得改真文件）');
}

/** 与 A2 同款判据（抽成函数以便在破坏副本上重跑；不得引用锚点串当期望值）。 */
function defaultDeferJudgment(M) {
  const k = Object.keys(M.DEFERRED);
  return M.DEFERRED && typeof M.DEFERRED === 'object' && !Array.isArray(M.DEFERRED) && k.length === 0;
}

module.exports = { ANCHORS: ANCHORS, runAll: runAll, runNegative: runNegative };

if (require.main === module) {
  let P = 0, F = 0;
  const A = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  ✗ ' + m); } };
  try { runAll(A); } catch (e) { F += 1; console.log('  ✗ 异常：' + e.message); }
  try { runNegative(A); } catch (e) { F += 1; console.log('  ✗ 负控制异常：' + e.message); }
  console.log('REJECT-COVERAGE-V2107: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
  process.exit(F === 0 ? 0 : 1);
}
