#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-mid-v2206.js (v2.206.0) — 「两档之间的那一档」专锁：
//   tools/mid-tier.js（中档回归入口与单一真源）
//
// ── 本锁要证的（四条，逐条对应一段）────────────────────────────────────
//   ① **单一真源**：中档的「快档那一半」取自 `SMOKE.SMOKE_SET` 本身，**不重列** ——
//      重列快档成员就是第二份真源（本仓治过同型病：两张各写一遍的表必然只改一处）。
//   ② **包含关系可红**：快 ⊆ 中（反方向不要求）。把快档成员从中档里摘掉（而不是只加）
//      时当场报红；反空转下限 `MIN_SMOKE` 在位（快档成空表时「全部在集内」在空集上恒真）。
//   ③ **不收录的成员必须留实测数字与理由**：`EXCLUDED` 每条都要有实测毫秒（或入口形态）
//      与成句理由 —— 「太慢」两个字不算理由。
//   ④ **它不是替代品**：源码逐字写明「全量仍是收口门槛」；且它是**判据**不是生成器
//      （执行面零写盘、无 `--fix`）；子进程输出**落盘不走 PIPE**（本仓实测过的父子互等死锁）。
//   ⑤ **模块冒烟面不许只在全量里跑**：`tools/*_smoke.js` 那 14 个的**唯一现形通道**是
//      `tests/run.js` 的挂载点（29 分钟那一趟），实测每个 110–539ms ⇒ 整类收进中档。
//      真源**不搬家**（派生的漏匹配会静默少收成员 —— 档照绿、覆盖面悄悄变窄）：
//      A14 判「run.js 挂了而本档没收」，A15 配反空转下限，N7 走两向。
//
// ── 为什么 N 段走「加载真源码破坏副本」（H 系列口径）──────────────────────
//   「判据不恒真」有三种假绿形态（v2.6 记档）：①对原文件断言、破坏没发生也绿；
//   ②破坏被写死成模拟常量，真判据根本没被调用；③破坏把判据自己删了（自我指涉）。
//   故本锁统一用：**真源码破坏（锚点恰中 1 次）→ 在内存里把破坏副本装成模块 →
//   在副本上重跑同一份真判据**。破坏一律不写回盘（N6 复核锚点仍恰中 1 次）。
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const MID_REL = 'tools/mid-tier.js';
const SMOKE_REL = 'tools/smoke.js';
const RUN_REL = 'tests/run.js';
const SELF_REL = 'tests/s3-mid-v2206.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, sub) { return String(s).split(sub).length - 1; }
function j(v) { return JSON.stringify(v); }
/** 只去注释、**保留字符串原文**（本锁判的是源码常量与字面量，不能用 codeFace）。 */
function stripComments(src) {
  return String(src).split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/**
 * 把一段真源码装成 CommonJS 模块（**破坏副本的载体**）。
 *   `require` 必须按**该文件自己的位置**解析相对路径 —— `tools/mid-tier.js` 里写的是
 *   `require('./smoke.js')`，直接拿宿主的 require 会相对 `tests/` 去找（找不到）。
 *   `__dirname` / `__filename` 同理按仓库内的真实位置给。
 */
function makeRequire(dirRel) {
  return function (spec) {
    if (spec.charAt(0) === '.') return require(path.join(BASE, dirRel, spec));
    return require(spec);
  };
}
function loadAsModule(rel, text) {
  let src = (text === undefined) ? rd(rel) : text;
  // shebang 只在**文件首行**合法：装进函数体后会变成 `#!...` 语法错误（实测踩过）。
  src = src.replace(/^#![^\n]*\n/, '');
  const dir = path.join(BASE, path.dirname(rel));
  const file = path.join(BASE, rel);
  const mod = { exports: {} };
  const fn = vm.runInNewContext(
    '(function(module, exports, require, __dirname, __filename){' + src + '\n})',
    { console: console, process: process, Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout,
      JSON: JSON, Math: Math, Date: Date, String: String, Array: Array, Object: Object, Number: Number },
    { filename: rel });
  fn(mod, mod.exports, makeRequire(path.dirname(rel)), dir, file);
  return mod.exports;
}
/** 破坏一个锚点（**必须恰中 1 次**，否则前置失效 —— 不许在 0 命中上继续跑）。 */
function breakAnchor(src, from, to) {
  if (cnt(src, from) !== 1) return { ok: false, n: cnt(src, from) };
  return { ok: true, text: src.split(from).join(to) };
}
/** 新增层与快档的交集（「重列快档」= 第二份真源）。纯函数：A2 与 N3 用**同一份**判据。 */
function dupMembers(smokeRels, extraRels) {
  return extraRels.filter(function (r) { return smokeRels.indexOf(r) >= 0; });
}
/**
 * 冒烟面差集（「run.js 挂了而本档没收」）。纯函数：**A14 与 N7 用同一份判据** ——
 *   在 N 段里另写一份就不算两向自证（判的是另一套逻辑）。
 */
function faceComplaints(mounted, midRels) {
  return mounted.filter(function (r) { return midRels.indexOf(r) < 0; });
}
/**
 * 负控制锚点表（H5 口径）：每条字面量在本文件**只声明一次**，N 段一律引用这里的条目 ——
 *   在 N 段里再抄一遍字面量，N0 的纯度判据当场就会报双重声明。
 */
const ANCHOR = {
  fastMerge: 'SMOKE.SMOKE_SET.map(',
  minSmoke: 'const MIN_SMOKE = 10;',
  scriptFallback: "return (src.indexOf(ENTRY_EXPORTS) < 0 && !abs) ? 'script' : 'bare';",
  extraHead: 'const MID_EXTRA = [',
  smokeMount: "path.join(BASE, 'tools/agenda_smoke.js')",
  faceRe: '[A-Za-z0-9_]+_smoke'
};
function runAll(a) {
  const M = require(path.join(BASE, MID_REL));
  const S = require(path.join(BASE, SMOKE_REL));
  const MID = rd(MID_REL), RUN = rd(RUN_REL), SELF = rd(SELF_REL);
  const MID_CODE = stripComments(MID);
  // ════ A 段：静态契约 ══════════════════════════════════════════════
  (function () {
    ['members', 'runOne', 'verifySet', 'MID_EXTRA', 'EXCLUDED', 'MAX_MS_MID', 'BASE']
      .forEach(function (k) { a(typeof M[k] !== 'undefined', 'A1: mid-tier 导出 ' + k); });
    // ① 单一真源：新增层与快档**零交集**（重列快档成员 = 第二份真源）
    const dup = dupMembers(S.SMOKE_SET.map(function (m) { return m.rel; }),
      M.MID_EXTRA.map(function (m) { return m.rel; }));
    a(dup.length === 0, 'A2: MID_EXTRA 与快档集零交集（实 ' + j(dup) + '）—— 重列快档成员即第二份真源');
    // 快档那一半**取自** smoke.js 的同一份表（源码形态：直接 map 真源，不抄一份）
    a(MID_CODE.indexOf(ANCHOR.fastMerge) >= 0,
      'A3: 快档成员取自 SMOKE.SMOKE_SET（同一份真源，不另抄表）');
    a(MID_CODE.indexOf('net-audit.js') < 0 && MID_CODE.indexOf('module-registry-gate.js') < 0,
      'A4: 执行面上不出现快档成员字面量（一旦重列，会在这里现形）');
    a(M.MAX_MS_MID > S.MAX_MS && M.MAX_MS_MID <= 120000,
      'A5: 中档单成员上限 ' + M.MAX_MS_MID + 'ms 宽于快档 ' + S.MAX_MS + 'ms 且在合理区间');
    // 入口档位：三档口径（selfTest / cli / script / bare）在本档**自持** ——
    //   v2.256.0 起 README 面向玩家精简，原委托对象 tests/toolchain-gate.js（tools/ 名单与
    //   README 自述同源判据）已退役，本档不再有第二真源可委托，故判「口径常量在位」。
    a(M.ENTRY_SELFTEST === '--self-test' && M.ENTRY_CLI === 'require.main' && M.ENTRY_EXPORTS === 'module.exports'
      && MID_CODE.indexOf("'" + M.ENTRY_SELFTEST + "'") >= 0
      && MID_CODE.indexOf("'" + M.ENTRY_CLI + "'") >= 0
      && MID_CODE.indexOf("'" + M.ENTRY_EXPORTS + "'") >= 0,
      'A6: 三档入口口径常量在职（toolchain-gate 退役后由本档自持）');
    a(MID_CODE.indexOf('MIN_SMOKE') >= 0 && MID_CODE.indexOf(ANCHOR.minSmoke) >= 0,
      'A7: 反空转下限在位（快档集塌成空表时「全部在集内」恒真 —— 必须有下限守门）');
    // ③ 不收录的成员**必须留下实测数字与理由**（「太慢」两个字不算理由）
    const exBad = M.EXCLUDED.filter(function (e) {
      const num = typeof e.ms === 'number' && e.ms > 0;
      const ent = typeof e.entry === 'string' && e.entry.length > 0;
      return (!num && !ent) || typeof e.why !== 'string' || e.why.length < 20;
    });
    a(exBad.length === 0, 'A8: EXCLUDED 每条都留了实测数字（或入口形态）与成句理由（违反者 '
      + j(exBad.map(function (e) { return e.rel; })) + '）');
    // ④ 子进程输出**落盘**不走 PIPE（本仓实测过的父子互等死锁）
    a(MID_CODE.indexOf('stdio') >= 0 && MID_CODE.indexOf('openSync') >= 0
      && MID_CODE.indexOf("'pipe'") < 0 && MID_CODE.indexOf('maxBuffer') < 0,
      'A9: 子进程输出落盘（不走 PIPE —— 输出超 64KB 时 PIPE 会让父子互等死锁）');
    a(MID_CODE.indexOf('writeFileSync') < 0 && MID_CODE.indexOf('appendFileSync') < 0 && MID_CODE.indexOf('--fix') < 0,
      'A10: 执行面上零写盘、无 --fix（自动修会让判据变成改产品的人）');
    a(MID_CODE.indexOf('收口门槛') >= 0, 'A11: 源码逐字写明「全量仍是收口门槛」（中档不是替代品）');
    a(cnt(RUN, "runLock('./s3-mid-v2206.js')") === 1,
      'A12: 本锁在 tests/run.js 上恰挂 1 处（实 ' + cnt(RUN, "runLock('./s3-mid-v2206.js')") + '）');
    // ⑤ 模块冒烟面：真源在 tests/run.js 的挂载点，本档必须把它们全部收进来
    const faceMounted = M.smokeFaceRels({});
    const faceMiss = faceComplaints(faceMounted, M.members().map(function (m) { return m.rel; }));
    a(faceMiss.length === 0, 'A14: run.js 挂载的模块冒烟全部在本档内（缺 ' + j(faceMiss) + '）'
      + ' —— 少收是最难发现的一类失效：档照绿、覆盖面悄悄变窄');
    a(faceMounted.length >= M.SMOKE_FACE_MIN && M.SMOKE_FACE_MIN >= 10,
      'A15: 冒烟面反空转下限在位（现场挂载 ' + faceMounted.length + ' 个 ≥ 下限 ' + M.SMOKE_FACE_MIN + '）'
      + ' —— 读取器一旦失配，A14 会在空集上恒真');
  })();
  // ════ B 段：运行时读数（真跑，并与同源面交叉核对）═════════════════
  (function () {
    const v = M.verifySet({});
    a(v.ok === true, 'B1: 中档集自证现场全绿（实 ' + j(v.complaints) + '）');
    const smokeRels = v.rows.filter(function (r) { return r.from === 'smoke'; }).map(function (r) { return r.rel; });
    const want = S.SMOKE_SET.map(function (m) { return m.rel; });
    a(smokeRels.length === want.length && want.every(function (r) { return smokeRels.indexOf(r) >= 0; }),
      'B2: 集内 from=smoke 的成员与 SMOKE_SET **逐字**同源（' + smokeRels.length + ' vs ' + want.length + '）'
      + ' —— 两处各算一份必然漂移');
    a(v.missing.length === 0 && v.smokeSize === S.SMOKE_SET.length,
      'B3: 快 ⊆ 中（缺 ' + j(v.missing) + '）· 快档规模 ' + v.smokeSize);
    a(v.midSize === S.SMOKE_SET.length + M.MID_EXTRA.length,
      'B4: 中档规模 === 快档 + 新增（' + v.midSize + ' vs ' + (S.SMOKE_SET.length + M.MID_EXTRA.length) + '）');
    const bare = v.rows.filter(function (r) { return r.entry === 'bare'; });
    a(bare.length === 0, 'B5: 每个成员入口档位合法（无 bare；实 ' + j(bare.map(function (r) { return r.rel; })) + '）');
    const missExtra = M.MID_EXTRA.filter(function (m) { return !fs.existsSync(path.join(BASE, m.rel)); });
    a(missExtra.length === 0, 'B6: 中档新增层每个成员在磁盘上真存在（零命中不算通过）');
    const missEx = M.EXCLUDED.filter(function (e) { return !fs.existsSync(path.join(BASE, e.rel)); });
    a(missEx.length === 0, 'B7: EXCLUDED 每条的理由对象也真存在（实 '
      + j(missEx.map(function (e) { return e.rel; })) + '）');
    // 沙箱注入面是真的：在临时目录里真跑一个成员
    const r1 = M.runOne({ rel: 'tools/mid-tier.js', args: ['--self-test'] }, { dir: os.tmpdir() });
    a(r1.rc === 0 && typeof r1.ms === 'number' && r1.ms >= 0,
      'B8: runOne 在沙箱目录里真跑通一个成员（rc=' + r1.rc + ' · ' + r1.ms + 'ms）—— 沙箱注入面是真的');
  })();
  // ════ C 段：只读不变式（判据不许是生成器，连调不许漂）════════════════
  (function () {
    const a1 = M.verifySet({}), a2 = M.verifySet({});
    a(JSON.stringify(a1) === JSON.stringify(a2),
      'C1: verifySet 连调两次逐字节同读数（判据不含墙钟 / 随机源 / 缓存副作用）');
    const m1 = M.members(), m2 = M.members();
    a(JSON.stringify(m1) === JSON.stringify(m2), 'C2: members() 连调不变量');
    a(MID_CODE.indexOf('writeFileSync') < 0 && MID_CODE.indexOf('appendFileSync') < 0,
      'C3: 只读不变式（判据不是生成器 —— 连调不写盘）');
  })();
  // ════ N 段：真源码破坏 + 两向自证 ══════════════════════════════════
  // N0：锚点纯度（每个锚点字面量在**本文件**只声明一次；判据不引用锚点串作期望值）
  (function () {
    const anchors = [ANCHOR.fastMerge, ANCHOR.minSmoke, ANCHOR.scriptFallback, ANCHOR.extraHead,
      ANCHOR.smokeMount, ANCHOR.faceRe];
    const dup0 = anchors.filter(function (x) { return cnt(SELF, x) !== 1; });
    a(dup0.length === 0, 'N0: 锚点字面量在本锁中各恰 1 次（违反者 ' + j(dup0) + '）');
  })();
  // N1：快档那一半被摘掉 ⇒ 「快 ⊆ 中」当场现形
  (function () {
    const b = breakAnchor(MID, ANCHOR.fastMerge, '[].map(');
    if (!b.ok) { a(false, 'N1a: 快档合并锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const broken = loadAsModule(MID_REL, b.text);
    const bad = broken.verifySet({});
    a(bad.ok === false && bad.complaints.some(function (c) { return c.why === 'smoke-member-not-in-mid'; }),
      'N1b: （两向）快档那一半被摘掉 ⇒ 现形 smoke-member-not-in-mid（实 '
      + j(bad.complaints.map(function (c) { return c.why; })) + '）—— 这正是「中档比快档还窄」的形态');
    a(M.verifySet({}).ok === true, 'N1c: （两向）原版仍绿 —— 破坏了才红，不是本来就红');
  })();
  // N2：反空转下限被抹掉 ⇒ 空快档集上「全部在集内」恒真
  (function () {
    const b = breakAnchor(MID, ANCHOR.minSmoke, 'const MIN_SMOKE = 0;');
    if (!b.ok) { a(false, 'N2a: 下限锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const broken = loadAsModule(MID_REL, b.text);
    const bad = broken.verifySet({ smokeSet: [] });
    a(bad.ok === true && !bad.complaints.some(function (c) { return c.why === 'smoke-set-too-small'; }),
      'N2b: （两向）下限被抹成 0 ⇒ 空快档集上判绿（实 ' + j(bad.complaints) + '）'
      + ' —— 空集上的普遍命题恒真，这一条是它的守门人');
    const good = M.verifySet({ smokeSet: [] });
    a(good.ok === false && good.complaints.some(function (c) { return c.why === 'smoke-set-too-small'; }),
      'N2c: （两向）原版在同款空集上报 smoke-set-too-small（实 ' + j(good.complaints) + '）—— 两向区分得开');
  })();
  // N3：新增层里塞进快档成员 ⇒ 「不重列」判据现形
  (function () {
    const b = breakAnchor(MID, ANCHOR.extraHead,
      ANCHOR.extraHead + "\n  { rel: 'tools/net-audit.js', why: 'zzz-duplicate-member' },");
    if (!b.ok) { a(false, 'N3a: 新增层锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const broken = loadAsModule(MID_REL, b.text);
    const dup = dupMembers(S.SMOKE_SET.map(function (m) { return m.rel; }),
      broken.MID_EXTRA.map(function (m) { return m.rel; }));
    a(dup.indexOf('tools/net-audit.js') >= 0,
      'N3b: （两向）新增层塞进快档成员 ⇒ 现形重复（实 ' + j(dup) + '）—— 重列快档 = 第二份真源');
    a(dupMembers(S.SMOKE_SET.map(function (m) { return m.rel; }),
      M.MID_EXTRA.map(function (m) { return m.rel; })).length === 0,
      'N3c: （两向）原版零重复 —— 判据不是恒假');
  })();
  // N4：入口回落退化成「一律 bare」⇒ no-entry 现形
  (function () {
    const b = breakAnchor(MID, ANCHOR.scriptFallback, "return 'bare';");
    if (!b.ok) { a(false, 'N4a: 入口回落锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const broken = loadAsModule(MID_REL, b.text);
    const bad = broken.verifySet({});
    const noEntry = bad.complaints.filter(function (c) { return c.why === 'no-entry'; });
    a(bad.ok === false && noEntry.length >= 1,
      'N4b: （两向）入口回落退化成「一律 bare」⇒ 现形 no-entry ' + noEntry.length + ' 条'
      + ' —— 「哪些脚本可以没有入口」这条口径一旦松掉，当场有判据');
    a(M.verifySet({}).ok === true, 'N4c: （两向）原版上零 no-entry');
  })();
  // N6：负控制全程未改真源码（破坏只活在内存储存里）
  (function () {
    [ANCHOR.fastMerge, ANCHOR.minSmoke, ANCHOR.scriptFallback, ANCHOR.extraHead].forEach(function (x) {
      a(cnt(rd(MID_REL), x) === 1,
        'N6: tools/mid-tier.js 在负控制之后仍是原版（锚点 ' + j(String(x).slice(0, 24)) + ' 仍恰中 1 次）');
    });
  })();
  // N7：模块冒烟面 —— 「run.js 挂了而本档没收」这条判据的两向自证
  (function () {
    // N7a：两个锚点各自的宿主文件里恰中 1 次（前置；0 命中不许继续跑）
    const nb = cnt(RUN, ANCHOR.smokeMount);
    const mb = cnt(MID, ANCHOR.faceRe);
    if (nb !== 1 || mb !== 1) { a(false, 'N7a: 冒烟面锚点恰中 1 次（run.js ' + nb + ' / mid-tier ' + mb + '）'); return; }
    a(true, 'N7a: 冒烟面锚点各恰中 1 次（run.js 挂载点 / mid-tier 真源读取器正则）');
    // N7b：run.js 上真源码破坏 —— 注入一条**新挂载点**（本档没收）⇒ 判据当场报出
    const b1 = breakAnchor(RUN, ANCHOR.smokeMount, "path.join(BASE, 'tools/zzzsynthetic_smoke.js')");
    if (!b1.ok) { a(false, 'N7b 前置失效（实 ' + b1.n + '）'); return; }
    const mounted1 = M.smokeFaceRels({ src: b1.text });
    const miss1 = faceComplaints(mounted1, M.members().map(function (m) { return m.rel; }));
    a(miss1.indexOf('tools/zzzsynthetic_smoke.js') >= 0,
      'N7b: （两向）run.js 新挂一条本档没收的冒烟 ⇒ 现形（实 ' + j(miss1) + '）'
      + ' —— 这正是「只在全量里跑」那类成员漏收的形态');
    // N7c：原版上同一份判据为真（判据不是恒假）
    a(faceComplaints(M.smokeFaceRels({}), M.members().map(function (m) { return m.rel; })).length === 0,
      'N7c: （两向）原版 run.js 上零漏收');
    // N7d：真源读取器正则被破坏（加载 mid-tier 破坏副本）⇒ face 塌成空集，
    //      「挂载点 ⊆ 本档」在空集上**恒真**，恰由反空转下限守门
    const b2 = breakAnchor(MID, ANCHOR.faceRe, 'zzznever');
    if (!b2.ok) { a(false, 'N7d 前置失效（实 ' + b2.n + '）'); return; }
    const brokenMid = loadAsModule(MID_REL, b2.text);
    const faceEmpty = brokenMid.smokeFaceRels({});
    a(faceEmpty.length === 0 && faceEmpty.length < brokenMid.SMOKE_FACE_MIN,
      'N7d: （两向）读取器失配 ⇒ face 塌成空集（' + faceEmpty.length + '），A14 空集恒真，'
      + '而下限判据当场为假（floor ' + brokenMid.SMOKE_FACE_MIN + '）—— 下限是它的守门人');
    a(M.smokeFaceRels({}).length >= M.SMOKE_FACE_MIN,
      'N7e: （两向）原版 face ' + M.smokeFaceRels({}).length + ' 个 ≥ 下限，下限判据为真 —— 两向区分得开');
    a(cnt(rd(RUN_REL), ANCHOR.smokeMount) === 1 && cnt(rd(MID_REL), ANCHOR.faceRe) === 1,
      'N7f: 负控制之后 run.js 与 mid-tier 仍是原版（破坏只活在内存副本里）');
  })();
}
module.exports = { runAll: runAll };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\ns3-mid-v2206 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
