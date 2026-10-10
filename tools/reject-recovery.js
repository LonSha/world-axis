#!/usr/bin/env node
'use strict';
// WorldAxis tools/reject-recovery.js — 拒收码恢复映射的**现场复算与核对器**（计划 U5，v2.192.0）
//
// ── 它不做什么 ───────────────────────────────────────────────────────
//   本文件**不再自带一份映射表**。表（六档词表 / 显式登记 / 三面快照）住在产品模块
//   `engines/reject-recovery.js` 里 —— 那份是**产品承诺**，诊断面 / 面板面 / 日志面
//   运行时读的就是它。工具这里只做两件事：
//     ① 现场复算：按源码形态把 804 个 `reason:` 字面量分面（拒收 / 成功 / 判不出）；
//     ② 逐条核对：产品承诺与现场必须**逐字一致**，多一条 / 少一条 / 面变了都报红。
//
//   一份表两处拷贝是本仓点过名的一类病（「两件不同的事在读数上同形」，或反过来
//   「同一件事有两个真源，慢慢漂开」）。所以这里**只留一个真源**：
//   产品模块持有表，本文件持有判据。
//
// ── 复算用的判据：括号配对 ───────────────────────────────────────────
//   扫描面的词法是 `reason: 'x'` 的**内联字面量**，它不管这个 reason 写在成功返回里
//   还是失败返回里。故复算时把每次命中还原到它所属的**对象字面量**（向前找未配对的
//   `{`、向后配到闭合），再读该字面量的 `ok:`：
//     reject   至少一处落在 `ok:false` 对象里
//     success  每一处都在 `ok:true` 对象里（且有一处）
//     neutral  所有出现都不在带 `ok` 的对象里（机器判不出来，逐条人工登记）
//
//   为什么不用「看邻近几行」：多行对象与嵌套三元会误判，而
//   `{ ok:true, faithful:false, reason:'distorted' }` 这类同时含真假字段的对象，
//   只有拿到**整个字面量**才判得准。
//
// ── 边界（计划 U5 原文）─────────────────────────────────────────────
//   ① 不把可重试与可忽略合成一档（六档无 `ignore`，由产品模块 diagnose 自证）；
//   ② 恢复建议不得暗示「忽略即可」（同上，产品模块静态自证）；
//   ③ 表外码不落进任何默认档（产品 `explain()` 对未知码给 `kind:null`；本核对的
//      `unknown` 面即由此兜住 —— 这里再钉一遍「任意字符串都不得被判成拒收」）；
//   ④ 恢复语义不写 store（本文件只读源码，零写盘；产品模块零 fs / 零 store）。
//
// ── 用法 ─────────────────────────────────────────────────────────────
//   node tools/reject-recovery.js            # 面分布 + 核对结论（不一致则退出码 1）
//   node tools/reject-recovery.js --json     # 机器可读
//   const RR = require('../tools/reject-recovery.js')   # codes / faces / live / audit
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('../tests/reject-code-gate.js');
const { stripComments } = require('../tests/test-surface-gate.js');

/** 现场复算用的去注释读缝（可注入：负控制要在内存副本上重跑同一份判据）。 */
function readSource(rel, opt) {
  const o = opt || {};
  if (o.read) return o.read(rel);
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
/** 括号配对：把命中位置还原到它所属的对象字面量。 */
function enclosingObject(text, idx) {
  let depth = 0, start = -1;
  for (let i = idx; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === '}') depth += 1;
    else if (ch === '{') { if (depth === 0) { start = i; break; } depth -= 1; }
  }
  if (start < 0) return null;
  depth = 0;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) return text.slice(start, i + 1); }
  }
  return null;
}
const OK_TRUE_RE = /(^|[\s,{([])ok:\s*true/;
const OK_FALSE_RE = /(^|[\s,{([])ok:\s*false/;
/**
 * 现场复算三面（**每次真读源码**，不读任何历史常量）。
 * 返回 {code: {face, sites, trueSites, falseSites, noObjSites, at}}。
 *   opt.read 可注入 —— 负控制用它换掉某个文件的读取，判据本身一个字不改。
 */
function live(opt) {
  const files = gate.productFiles();
  const re = new RegExp(gate.CODE_RE.source, 'g');
  const out = {};
  files.forEach(function (rel) {
    const text = stripComments(readSource(rel, opt));
    let m;
    while ((m = re.exec(text)) !== null) {
      const code = m[1];
      const obj = enclosingObject(text, m.index);
      const line = text.slice(0, m.index).split('\n').length;
      const row = out[code] || (out[code] = { code: code, sites: 0, trueSites: 0, falseSites: 0, noObjSites: 0, at: [] });
      row.sites += 1;
      if (obj === null) row.noObjSites += 1;
      else if (OK_FALSE_RE.test(obj)) row.falseSites += 1;
      else if (OK_TRUE_RE.test(obj)) row.trueSites += 1;
      else row.noObjSites += 1;
      row.at.push(rel + ':' + line);
    }
  });
  Object.keys(out).forEach(function (c) {
    const r = out[c];
    if (r.falseSites > 0) r.face = 'reject';
    else if (r.trueSites > 0) r.face = 'success';
    else r.face = 'neutral';
  });
  return out;
}
/** 现场码的单一真源 = 扫描面。 */
function codes() { return Object.keys(gate.scan({}).hits).sort(); }
/** 装载产品模块（Node 侧用 mock 的 window 别名）。**只读，不写任何东西。** */
function product() {
  require('../tests/mock.js');
  require('../engines/reject-recovery.js');
  const WA = global.window && global.window.WorldAxis;
  if (!WA || !WA.rejectRecovery) throw new Error('产品模块 engines/reject-recovery.js 没装上 WA.rejectRecovery');
  return WA.rejectRecovery;
}
function setOf(arr) { const s = {}; (arr || []).forEach(function (x) { s[x] = true; }); return s; }
function diff(a, b) { return a.filter(function (x) { return b.indexOf(x) < 0; }); }
/**
 * 核对：产品承诺 vs 现场复算。**四类都核**：
 *   ① 三面快照逐条一致（多 / 少 / 面变三类分开报）；
 *   ② 每条显式登记都在它该在的那一面（登记错面 = 面判错了）；
 *   ③ 拒收面上没有任何一条 `explain()` 判不出档（`kind:null` 而 face=reject 即缺口）；
 *   ④ 任意字符串都不得被判成拒收（边界 ③ 的运行时形态）。
 */
function audit(opt) {
  const p = product();
  const f = live(opt);
  const codesAll = Object.keys(f).sort();
  const problems = [];
  const facesLive = { reject: [], success: [], neutral: [] };
  codesAll.forEach(function (c) { facesLive[f[c].face].push(c); });
  const facesProd = { reject: (p.REJECT_FACE || []).slice().sort(), success: p.SUCCESS_FACE.slice().sort(), neutral: p.NEUTRAL_FACE.slice().sort() };
  ['reject', 'success', 'neutral'].forEach(function (k) {
    const a = facesProd[k], b = facesLive[k];
    diff(a, b).forEach(function (c) { problems.push({ kind: 'stale-snapshot', face: k, code: c, why: '产品快照里有、现场没有（快照过期或写错）' }); });
    diff(b, a).forEach(function (c) { problems.push({ kind: 'missing-snapshot', face: k, code: c, why: '现场有、产品快照里没有（新码没进快照）' }); });
  });
  // 显式登记面归属
  Object.keys(p.OVERRIDES).forEach(function (c) {
    if (facesProd.reject.indexOf(c) < 0) problems.push({ kind: 'wrong-face', code: c, why: 'OVERRIDES 登记的码不在拒收面快照里' });
  });
  Object.keys(p.ARTIFACTS).forEach(function (c) {
    if (facesProd.reject.indexOf(c) < 0) problems.push({ kind: 'wrong-face', code: c, why: 'ARTIFACTS 登记的码不在拒收面快照里' });
  });
  Object.keys(p.NEUTRAL_REVIEW).forEach(function (c) {
    if (facesProd.neutral.indexOf(c) < 0) problems.push({ kind: 'wrong-face', code: c, why: 'NEUTRAL_REVIEW 登记的码不在判不出面快照里' });
  });
  // 拒收面逐条要有档（拿注入的现场面复算，确保与运行时同判据）
  const liveFaceMap = {};
  codesAll.forEach(function (c) { liveFaceMap[c] = f[c].face; });
  const undecided = [], tainted = [];
  codesAll.forEach(function (c) {
    const r = p.explain(c, { face: liveFaceMap });
    // 词法碎片（`via:'artifact'`）**不算无档** —— 它根本不是「一个码」，是拼接式 reason
    //   被词法面看到的前缀；给它编恢复动作就是造数据。它的正确处置是「如实说明」。
    if (r.face === 'reject' && !r.kind && r.via !== 'artifact') undecided.push(c);
    if (r.face === 'success' && r.kind) tainted.push(c);
  });
  // 边界 ③ 的运行时形态：任意字符串不得被判成拒收
  const strangerProbe = ['zzz-not-a-code', 'not-a-real-thing-42', 'a'.repeat(3)];
  strangerProbe.forEach(function (s) {
    const r = p.explain(s, { face: liveFaceMap });
    if (r.face !== 'unknown') problems.push({ kind: 'phantom-reject', code: s, why: '非法码被判成 ' + r.face + '（面判定拿规则表兜了）' });
  });
  const prodDiag = p.diagnose();
  const totals = { reject: facesLive.reject.length, success: facesLive.success.length, neutral: facesLive.neutral.length };
  const ok = !problems.length && !undecided.length && !tainted.length && prodDiag.ok;
  return {
    total: codesAll.length, totals: totals, problems: problems, undecided: undecided,
    tainted: tainted, product: prodDiag, ok: ok,
    byKind: p.counts()
  };
}
module.exports = { live: live, codes: codes, audit: audit, product: product, enclosingObject: enclosingObject };
if (require.main === module) {
  const a = audit();
  if (process.argv.indexOf('--json') >= 0) {
    console.log(JSON.stringify(a, null, 2));
  } else {
    console.log('reason 字面量面 ' + a.total + ' 个 —— 现场分面：拒收 ' + a.totals.reject
      + ' / 成功 ' + a.totals.success + ' / 判不出 ' + a.totals.neutral);
    console.log('  产品承诺：六档 ' + a.byKind.kinds + ' · 词表 ' + a.byKind.rules
      + ' · 显式登记 ' + a.byKind.overrides + ' · 判不出面登记 ' + a.byKind.neutralReview
      + '（其中契约外 ' + a.byKind.neutralOut + '）· 词法碎片 ' + a.byKind.artifacts);
    console.log('  产品自证 diagnose.ok = ' + a.product.ok);
    if (a.problems.length) {
      console.log('  ✗ 承诺与现场不一致 ' + a.problems.length + ' 处：');
      a.problems.slice(0, 20).forEach(function (x) { console.log('    [' + x.kind + '] ' + (x.face ? x.face + ' ' : '') + x.code + ' —— ' + x.why); });
    }
    if (a.undecided.length) console.log('  ✗ 拒收面无档 ' + a.undecided.length + '：' + a.undecided.slice(0, 12).join(' '));
    if (a.tainted.length) console.log('  ✗ 成功面被配了档 ' + a.tainted.length + '：' + a.tainted.join(' '));
    if (a.ok) console.log('  ✓ 承诺与现场逐条一致');
  }
  process.exit(a.ok ? 0 : 1);
}