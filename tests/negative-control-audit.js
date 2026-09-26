// WorldAxis tests/negative-control-audit.js (v2.104.0) — 负控制锚点的自动化审计
//
// 【它治的病】本仓每版手写 25+ 条负控制锚点，而「锚点是否真的唯一」「锚点字面量有没有
//   被写在判据里（判据引用锚点串 = 自我指涉）」「破坏是否真的发生」这些性质，此前只有
//   各锁**自己**在运行时自查一遍。于是产生两个后果：
//     ① 审计口径散落在 61 个 runNegative 里，**改一处口径只管一把锁**；
//     ② 谁都没统计过「全仓到底有多少把锁的负控制是**可静态审计**的」——
//        即「不可审计的那部分」从来不是一个可读的数字。
//   本条把「锚点的静态性质」收敛成**一次全仓审计**：唯一性、纯度、rel 可读性、
//   锁文件可装载性，全部给出**逐锚点**的结论与**逐锁**的归类。
//
// 【口径（与 tests/interop-v2101.js 同源，刻意不另立第二套）】
//   · 唯一性：锚点字面量在其 `rel` 指向的文件中**恰中 1 次**；
//   · 判据纯度（H5）：锚点字面量在**锁文件自身**只出现一次——若判据里出现两次，
//     说明判据引用了锚点串，破坏它会连判据一起打掉（自我指涉的假绿）；
//     转义口径：`txt.replace(/\n/g, '\\n')`（`txt` 是解转义后的真文本，源码里是转义形态）。
//     【本条是本版实测踩出来的】首版审计漏了这个转义口径，17 条锚点被误报「出现 0 次」——
//     多行锚点（`txt` 里有真换行）拿去 split 单行源码必然 0 命中。**误报比漏报更费事**：
//     它会让一把健康的锁看起来坏了。故口径必须与既有实现逐字对齐，不能凭直觉写。
//
// 【两条否决式口径】
//   · **零命中不得算通过**：锚点找不到就是缺陷（源码变了而锚点没跟），不是「没什么可查」。
//   · **装载失败不得静默跳过**：锁文件 require 不起来时如实记为 `unloadable`；
//     这正是 v2.103.0（O16）治的「缺东西 ⇒ 静默 skip ⇒ 照样绿」同一族病，审计自己不得复发。
//
// 【覆盖面的诚实边界】登记表只覆盖**导出 `ANCHORS` 且形态统一**的锁（`{rel, txt}`）。
//   其余锁的锚点住在各自的局部变量里（如 `const ANCHOR_ROW = '…'`），静态无法可靠提取；
//   本模块把「统一 / 非统一 / 装载不了」三个数**都报出来**——不假装覆盖了全部。
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..');
const TESTS = __dirname;
const SELF_FILE = 'negative-control-audit.js';

/** 锚点形态（统一类必须同时具备）：rel = 目标文件相对路径，txt = 锚点原文 */
const KINDS = { UNIFORM: 'uniform', NON_UNIFORM: 'non-uniform', UNLOADABLE: 'unloadable',
  PENDING: 'pending' };   // pending = 此刻正在装载中（见下方 auditLock 的 in-flight 守卫）
/** 问题类别（逐条可读，便于归因） */
const PROBLEM_KINDS = ['shape', 'rel-unreadable', 'not-unique', 'impure', 'not-a-lock', 'empty-anchors'];

function hits(s, x) { return s.split(x).length - 1; }

/** 锁的本体判据：含有 runNegative（负控制段）——用**段名**而非行号，免顺序依赖 */
function isLock(src) { return /function\s+runNegative\s*\(/.test(src); }

function listTestFiles() {
  return fs.readdirSync(TESTS)
    .filter(function (f) { return /\.js$/.test(f) && f !== SELF_FILE; })
    .sort();
}

function readSelf(file) {
  return fs.readFileSync(path.join(TESTS, file), 'utf8');
}

function makeReader() {
  const cache = Object.create(null);
  return function readTarget(rel) {
    if (cache[rel]) return cache[rel];
    let out;
    if (typeof rel !== 'string' || !rel) out = { ok: false, error: '空路径' };
    else if (rel.indexOf('..') >= 0 || path.isAbsolute(rel)) out = { ok: false, error: '路径越界（只准许仓库内相对路径）' };
    else {
      try { out = { ok: true, src: fs.readFileSync(path.join(BASE, rel), 'utf8') }; }
      catch (e) { out = { ok: false, error: String((e && e.message) || e).slice(0, 100) }; }
    }
    cache[rel] = out;
    return out;
  };
}

/** 逐锚点审计（纯只读；不抛——问题一律作为记录返回） */
function auditAnchor(file, key, a, selfSrc, readTarget) {
  const out = [];
  const push = function (kind, detail) { out.push({ file: file, key: key, kind: kind, detail: detail }); };
  if (!a || typeof a !== 'object' || Array.isArray(a)) { push('shape', '锚点不是对象'); return out; }
  if (typeof a.rel !== 'string' || !a.rel) push('shape', '缺 rel（目标文件）');
  if (typeof a.txt !== 'string' || !a.txt) push('shape', '缺 txt（锚点原文）');
  if (out.length) return out;

  const t = readTarget(a.rel);
  if (!t.ok) { push('rel-unreadable', a.rel + '：' + t.error); return out; }
  const n = hits(t.src, a.txt);
  if (n !== 1) push('not-unique', '在 ' + a.rel + ' 命中 ' + n + ' 次（要求恰好 1）');

  // 判据纯度：转义口径与 interop-v2101 的 N15 逐字同源（多行锚点在源码里是转义形态）
  const selfN = hits(selfSrc, a.txt.replace(/\n/g, '\\n'));
  if (selfN !== 1) push('impure', '字面量在本文件出现 ' + selfN + ' 次（要求 1；判据不得引用锚点串）');
  return out;
}

/** 单把锁的审计：返回 {file, kind, anchors, problems} */
function auditLock(file, readTarget) {
  let selfSrc;
  try { selfSrc = readSelf(file); }
  catch (e) { return { file: file, kind: KINDS.UNLOADABLE, anchors: 0, problems: [{ file: file, key: '-', kind: 'not-a-lock', detail: '读不到：' + e.message }] }; }

  if (!isLock(selfSrc)) {
    return { file: file, kind: KINDS.NON_UNIFORM, anchors: 0, problems: [] };
  }

  // in-flight 守卫：被审计文件**此刻正在装载中**（专锁自己作入口时必经此处）⇒
  // 它的 exports 尚未完成，`mod.ANCHORS` 读到 undefined，会平白多出一档「非统一」并把
  // 归类结果绑在运行顺序上。如实记为 pending——既不是静默跳过，也不是 unloadable。
  const abs = path.join(TESTS, file);
  const cached = require.cache[abs];
  if (cached && cached.loaded !== true) {
    return { file: file, kind: KINDS.PENDING, anchors: 0, problems: [] };
  }
  let mod = null;
  try { mod = require(abs); }
  catch (e) {
    return { file: file, kind: KINDS.UNLOADABLE, anchors: 0,
      problems: [{ file: file, key: '-', kind: 'not-a-lock', detail: 'require 失败：' + String((e && e.message) || e).slice(0, 120) }] };
  }
  const A = mod && mod.ANCHORS;
  if (!A || typeof A !== 'object' || Array.isArray(A)) {
    return { file: file, kind: KINDS.NON_UNIFORM, anchors: 0, problems: [] };
  }
  const keys = Object.keys(A);
  const problems = [];
  if (!keys.length) problems.push({ file: file, key: '-', kind: 'empty-anchors', detail: '导出了 ANCHORS 但一条锚点都没有（空表上的审计恒真）' });
  keys.forEach(function (k) {
    auditAnchor(file, k, A[k], selfSrc, readTarget).forEach(function (p) { problems.push(p); });
  });
  return { file: file, kind: KINDS.UNIFORM, anchors: keys.length, problems: problems };
}

/** 全仓审计：一次扫描，确定性输出（文件序固定） */
function audit() {
  const readTarget = makeReader();
  const locks = [];
  listTestFiles().forEach(function (f) {
    let src;
    try { src = readSelf(f); } catch (e) { return; }
    if (!isLock(src)) return;
    locks.push(auditLock(f, readTarget));
  });
  const uniform = locks.filter(function (l) { return l.kind === KINDS.UNIFORM; });
  const nonUniform = locks.filter(function (l) { return l.kind === KINDS.NON_UNIFORM; });
  const unloadable = locks.filter(function (l) { return l.kind === KINDS.UNLOADABLE; });
  const pending = locks.filter(function (l) { return l.kind === KINDS.PENDING; });
  const problems = [];
  locks.forEach(function (l) { l.problems.forEach(function (p) { problems.push(p); }); });
  return {
    locks: locks,
    summary: {
      locks: locks.length,
      uniform: uniform.length,
      nonUniform: nonUniform.length,
      unloadable: unloadable.length,
      pending: pending.length,
      anchors: uniform.reduce(function (a, l) { return a + l.anchors; }, 0),
      problems: problems.length
    },
    problems: problems
  };
}

/** 概览（供 run.js / 诊断节只读消费；与 audit() 同源，不另写扫描面） */
function discover() {
  const r = audit();
  return {
    locks: r.summary.locks,
    uniform: r.summary.uniform,
    nonUniform: r.summary.nonUniform,
    unloadable: r.summary.unloadable,
    pending: r.summary.pending,
    anchors: r.summary.anchors,
    problems: r.summary.problems,
    problemKinds: PROBLEM_KINDS.slice()
  };
}

module.exports = {
  KINDS: KINDS,
  PROBLEM_KINDS: PROBLEM_KINDS,
  hits: hits,
  isLock: isLock,
  listTestFiles: listTestFiles,
  auditAnchor: auditAnchor,
  auditLock: auditLock,
  audit: audit,
  discover: discover
};