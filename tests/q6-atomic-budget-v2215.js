// WorldAxis tests/q6-atomic-budget-v2215.js — v2.215.0（优化计划 Q6：结构化注入预算 —— 原子块独立裁切边界）
//
// 【它治的病：被折叠的注入块「半条 + 断尾」】
//   注入预算是按**源整块 token** 裁决的（`plan()`：pinned 保底、optional 按 rank 填充、
//   超限的 foldable 项交给 `trim()` 折叠）。而 `trim()` 此前是**字符前缀截断 + 标点回退**：
//   取「最大满足上限的字符前缀」，再回退到最近的换行/句末。本仓各源 block 形态**统一**为
//     `[标题]\n原子行…\n尾部约束句`      （intel / life / bonds / causal / org / world 实测皆然）
//   源头即 `engines/intel.js:187`：
//     `'[因果与情报]\n' + lines.join('\n') + '\n人物只能依据自己持有的情报行动；…不得补写。'`
//   于是字符级截断必产生两种半条件：
//     ① **原子行被行内切断**：`因果：A、B → ` 之后没了 —— 读者拿到半条因果；
//     ② **尾部约束句整条消失**：`不得补写` / `只能依据自己持有的情报行动` 这类**关键约束
//        压根没进 prompt** —— 比半条更糟，模型会照着没有约束的块自由发挥。
//   Q6 原文要求的正是这两条的反面：原子块有独立裁切边界、保留闭合结构与事实来源、
//   最终 prompt 不出现半条关键约束。
//
// 【本版口径】四条
//   ① **不新增预算真源**：tokensOf / plan / apply / PRIORITY / 成本账一律不动，只在
//      `trim()` 内部**换裁切粒度**（整行 → 整结构单元）。裁决结果结构（kept/folded/dropped
//      与 remainAt/blockedBy 账）逐字不变 —— C1c 钉这件事。
//   ② **优先级 head > tail > body**：头（事实来源）与尾（关键约束）各是**不可分单元**，
//      预算不够先舍 body 行、不先舍它们。尾是约束 ⇒ 比 body 行值钱。
//   ③ **判不出就不假装**：认不出 `[标题]` 头、或头本身就超预算、或结构结果复核超限 ⇒
//      返回 `null` 并落回字符级 trim（保守失败只影响裁切粒度，不会切错内容）。
//   ④ **上限契约不破**：`tokensOf(trim(x, cap)) <= cap` 恒成立 —— 结构化路径出厂前自己
//      再复核一次，不满足即回退字符级（N0b 单证这道复核真在拦）。
//
// 【首跑 4 红 + 一次被实测推翻的假设（本文件最贵的一课）】
//   ① 判据写错（前缀陷阱）：首版用「输出行是原文某行的**前缀**」判整行，而
//      `因果：起因1 → 结果1` 恰是 `因果：起因10 → 结果10` 的前缀 ⇒ 真半行被判成整行。
//      正确口径是**精确相等**（整取整舍的实现下每行必精确命中原文行，见 B1）。
//   ② 判据写错（新增导出面）：首版直接消费 `WA.injectBudget.splitStruct()`，而该函数
//      无任何产品消费方 —— 本仓纪律是「导出须有真消费方」。改为纯**对外行为**断言：
//      只见 `trim()` 的输出判头/尾/整行（见 A1），产品导出面**一字未动**。
//   ③ 判据写错（cap 押在单值上）：首版 C3/C4/N0b/N2 各押一个 cap 常数（45 / hT±4 / 61），
//      而**块长一变这些常数全失效**：C3 的 cap 45 让尾按设计放不下（head6+tail37+mark8=51），
//      N0b 的 cap 61 恰在越界窗**之外**，N2 的 cap 61 恰在尾丢窗**之内**。全改为
//      **区间扫描式判据**（扫全 cap 或扫目标区间），不押任何单值。
//   ④ **假设被实测推翻**：首版断言「单破坏 tailKept 会被兜底复核掩蔽」。实测**反了** ——
//      结构化路径只在**自身超限**时才回退，故 `tailKept=false` 在多数 cap 档下让尾**真丢**
//      （可观测区间 cap 51..136，86 档）；反倒是单破坏**兜底复核**只在「头+标记刚好超限」
//      的窄窗（cap 6..13，8 档）才现形。负控要挑**真能现形**的形态，且**先测再写**，
//      不靠推断 —— 判据的观测区间必须实测取得。
//
// 【正向】
//   A1 三段结构识别（纯行为断言：头 / 尾 / 整行 三者同时成立，不消费未导出函数）
//   A2 预算充裕时恒等：仍在预算内的块 trim 后**一字不改**（== 原文）
//   B1 折叠后**零半行**（逐行精确比对；前缀不算整行）
//   B2 尾部关键约束句在预算够时**必须保留**（body 行被牺牲也在所不惜）
//   B3 结构头 `[因果与情报]` 必在输出首位（保留事实来源）
//   B4 上限契约扫描：多档 cap 下 `tokensOf(trim(...)) <= cap` 恒成立
//   B5 非结构化输入回退字符级，且仍守上限（不假装能判）
//   B6 预算小到连头都放不下 ⇒ 回退字符级（不返回半结构块）
//   C1 `plan()` 真消费链：低预算折叠后的 content 零半行 + 保头
//   C1b 折叠 content 不越过账面 `to`（不改预算真源）
//   C1c 裁决账结构未变（顶层 keys 与 reason 与旧口径一致）
//   C2 中英混排：逐行整取整舍对 CJK / 拉丁**同口径**（半行 = 0 且守上限）
//   C3 空行不占账：带空行的块保留的原子行数**不少于**无空行版本（同口径 cap）
//   C4 全 cap 扫描：零越界，且结构头自某一档起稳定出现（边界分段，不出现越界块）
// 【负控】N0a/N0b/N0c 锚点各恰中一次（含 LIMIT 锚点）；
//   N0b 单证兜底复核在拦边界超限（扫描得越界档数 > 0，原版 0）；
//   N1 破坏结构化分支调用 ⇒ 落回字符级（半条因果 / 断尾现形）；
//   N2 单破坏 tailKept ⇒ 尾约束**真丢**（扫描区间内 lost > 0）；
//   N3 原版同判据全绿（两向自证，防恒绿）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const gate = require('./ui-gate-sync.js');

const REL = 'engines/inject-budget.js';
const BUDGET = path.join(BASE, REL);
const MARK = '…（内容过长已折叠）';
const HEAD = '[因果与情报]';
const TAIL_TEXT = '人物只能依据自己持有的情报行动；怀疑不得写成既成事实，缺少来源的内容不得补写。';
const TAIL_KEY = '不得补写';

function budgetSrc() { return fs.readFileSync(BUDGET, 'utf8'); }
function fresh(srcOverride) {
  const ov = {};
  if (srcOverride) ov[REL] = srcOverride;
  return gate.fresh({ files: [REL], srcOverride: ov }).WA;
}

// ── 破坏锚点（各须恰中 1 次）──
const ANCHOR_CALL = '    const sorted = trimStructured(s, maxTokens);\n    if (sorted !== null) return sorted;\n';
const ANCHOR_LIMIT = '    return tokensOf(out) <= maxTokens ? out : null;      // 兜底：不满足上限即回退\n';
const ANCHOR_TAIL = '    const tailKept = tailT > 0 && (headT + tailT + markT <= maxTokens);\n';

// 合成结构化块：`[标题]` + N 条原子行 + 尾约束句（与 intel.js 的模板同形）
function makeBlock(n, opts) {
  opts = opts || {};
  const lines = [HEAD];
  for (let i = 0; i < n; i++) lines.push('因果：起因' + i + ' → 结果' + i);
  if (opts.blank) lines.push('', '   ');
  if (opts.tail !== false) lines.push(TAIL_TEXT);
  return lines.join('\n');
}
// 判据：逐行精确比对（**前缀不算整行** —— 见文首 ①）
function lineScan(src, out) {
  const srcLines = src.split('\n');
  const outLines = out.split('\n').filter(function (l) { return l && l.indexOf(MARK) < 0; });
  let whole = 0, half = 0;
  outLines.forEach(function (l) { if (srcLines.indexOf(l) >= 0) whole++; else half++; });
  return { whole: whole, half: half };
}
function countAtoms(src, out) {
  return out.split('\n').filter(function (l) { return l.indexOf('因果：') === 0 && src.indexOf(l) >= 0; }).length;
}

// ── 正向探针 ──
function probeAtomic(WA) {
  const B = WA.injectBudget;
  const block = makeBlock(12);
  const full = B.tokensOf(block);
  const cap = Math.max(30, Math.floor(full * 0.45));
  const out = B.trim(block, cap);
  const s = lineScan(block, out);
  // B4 上限契约：多档 cap 扫描（含块长比例档）
  let capViolations = 0;
  [10, 25, 40, 60, 100, 200, Math.floor(full * 0.45), Math.floor(full * 0.75)].forEach(function (c) {
    if (B.tokensOf(B.trim(block, c)) > c) capViolations++;
  });
  return {
    full: full, cap: cap, outT: B.tokensOf(out),
    half: s.half, whole: s.whole,
    hasHead: out.indexOf(HEAD) === 0,
    hasTail: out.indexOf(TAIL_KEY) >= 0,
    capViolations: capViolations,
    // A2 预算充裕 ⇒ 恒等
    identity: B.trim(block, full) === block && B.trim(block, full + 50) === block,
    // B5 非结构化回退：无 `[标题]` 头 ⇒ 走字符级，仍守上限
    plainOk: (function () {
      const plain = '这是一段没有任何结构头的长文本，'.repeat(30);
      const po = B.trim(plain, 40);
      return B.tokensOf(po) <= 40 && po.indexOf(MARK) >= 0;
    })(),
    // B6 头都放不下 ⇒ 回退（不返回半结构块）
    tinyOk: (function () {
      const t = B.trim(block, 6);
      return B.tokensOf(t) <= 6 && t.indexOf(HEAD) < 0;
    })(),
    // C3 空行不占账：同口径 cap 下，带空行块保留的原子行数**不少于**无空行块
    blank: (function () {
      const bn = makeBlock(6);
      const bb = makeBlock(6, { blank: true });
      const cN = Math.max(30, Math.floor(B.tokensOf(bn) * 0.5));
      const cB = Math.max(30, Math.floor(B.tokensOf(bb) * 0.5));
      const on = B.trim(bn, cN);
      const ob = B.trim(bb, cB);
      return {
        half: lineScan(bb, ob).half,
        atomsN: countAtoms(bn, on), atomsB: countAtoms(bb, ob),
        t: B.tokensOf(ob), cap: cB, head: ob.indexOf(HEAD) === 0
      };
    })(),
    // C4 全 cap 扫描：零越界 + 结构头自某档起稳定出现（**不要求单调**：
    //   字符级回退段（cap 9..13）本身非单调，实测 t 序列 0…0,9,10,11,12,11,14…）
    edge: (function () {
      let over = 0, headAt = -1, headGaps = 0;
      for (let c = 1; c <= full; c++) {
        const o = B.trim(block, c);
        if (B.tokensOf(o) > c) over++;
        const h = o.indexOf(HEAD) === 0;
        if (h && headAt < 0) headAt = c;
        if (headAt > 0 && c > headAt && !h) headGaps++;   // 头出现后又消失 ⇒ 分段不稳
      }
      return { over: over, headAt: headAt, headGaps: headGaps, full: full };
    })()
  };
}

function probePlan(WA) {
  const B = WA.injectBudget;
  const block = makeBlock(10);
  const items = [{ source: '因果与情报', content: block }, { source: '叙事摘要', content: makeBlock(6) }];
  const p = B.plan(items, { budget: Math.floor(B.tokensOf(block) * 0.6) });
  const folded = (p.folded || [])[0];
  if (!folded) return { noFold: true };
  const s = lineScan(block, String(folded.content));
  return {
    fill: true, half: s.half,
    hasHead: String(folded.content).indexOf(HEAD) === 0,
    withinTo: B.tokensOf(folded.content) <= folded.to + 1,
    keys: Object.keys(p).sort().join(','),
    reasons: (p.folded || []).map(function (f) { return f.reason; }).join(',')
  };
}

function probeMix(WA) {
  const B = WA.injectBudget;
  const mix = '[混合块]\nkey: alpha beta → gamma delta\n规则：不得越权；rule: must not exceed\n尾部约束：只能依据已获得的事实行动。';
  const out = B.trim(mix, 30);
  return { half: lineScan(mix, out).half, over: B.tokensOf(out) > 30, t: B.tokensOf(out) };
}

// ── 负控探针 ──
function probeN1(WA) {   // 无结构化分支 ⇒ 字符级：半条 / 断尾
  const B = WA.injectBudget;
  const block = makeBlock(12);
  const full = B.tokensOf(block);
  const out = B.trim(block, Math.floor(full * 0.45));
  const s = lineScan(block, out);
  const tail = out.indexOf(TAIL_KEY) >= 0;
  return { half: s.half, tail: tail, broken: s.half > 0 || tail === false };
}
function probeN2(WA) {   // 单破坏 tailKept ⇒ 尾真丢（**区间扫描**，不押单值）
  //   只在「尾按设计放得下」的区间里扫：cap >= headT + tailT + markT。
  //   低于此档时原版本就按设计舍尾 ⇒ 那不是「丢失」，算进去会把 N3 判成红（首跑即此坑）。
  const B = WA.injectBudget;
  const block = makeBlock(12);
  const full = B.tokensOf(block);
  const floor = B.tokensOf(HEAD) + B.tokensOf(TAIL_TEXT) + B.tokensOf('\n' + MARK);
  let lost = 0, caps = 0;
  for (let c = floor; c <= full; c++) {
    const out = B.trim(block, c);
    if (B.tokensOf(out) <= c) { caps++; if (out.indexOf(TAIL_KEY) < 0) lost++; }
  }
  return { lost: lost, caps: caps, floor: floor };
}
function probeLimit(WA) {  // 兜底复核破坏的可观测性（**全 cap 扫描**：越界档）
  const B = WA.injectBudget;
  const block = makeBlock(12);
  const full = B.tokensOf(block);
  let over = 0, first = -1, last = -1;
  for (let c = 1; c <= full; c++) {
    if (B.tokensOf(B.trim(block, c)) > c) { over++; if (first < 0) first = c; last = c; }
  }
  return { over: over, first: first, last: last };
}

function judge(a) {
  const WA = fresh();
  const r = probeAtomic(WA);
  a(r.hasHead && r.hasTail && r.half === 0 && r.whole > 0,
    'Q6 A1 三段结构识别（头/尾/整行 同时成立：头 ' + r.hasHead + ' / 尾 ' + r.hasTail +
    ' / 整行 ' + r.whole + ' / 半行 ' + r.half + '）');
  a(r.identity === true, 'Q6 A2 预算充裕时恒等（仍在预算内 ⇒ trim 后一字不改）');
  a(r.half === 0 && r.whole > 0, 'Q6 B1 折叠后零半行（逐行精确比对；整行 ' + r.whole + ' / 半行 ' + r.half + '）');
  a(r.hasTail === true, 'Q6 B2 尾部关键约束句保留（预算够时必须保留）');
  a(r.hasHead === true, 'Q6 B3 结构头保留于首位（事实来源不丢）');
  a(r.capViolations === 0, 'Q6 B4 上限契约恒成立（多档 cap 越界 ' + r.capViolations + ' 处）');
  a(r.plainOk === true, 'Q6 B5 非结构化输入回退字符级且守上限（不假装能判）');
  a(r.tinyOk === true, 'Q6 B6 预算极小（头都放不下）⇒ 回退字符级，不返回半结构块');
  a(r.blank.atomsB >= r.blank.atomsN && r.blank.half === 0 && r.blank.t <= r.blank.cap && r.blank.head,
    'Q6 C3 空行不占账（原子行 无空行 ' + r.blank.atomsN + ' vs 带空行 ' + r.blank.atomsB +
    ' / 半行 ' + r.blank.half + ' / 上限 ' + r.blank.t + '<=' + r.blank.cap + '）');
  a(r.edge.over === 0 && r.edge.headAt > 0 && r.edge.headGaps === 0,
    'Q6 C4 全 cap 扫描（越界 ' + r.edge.over + ' 档 / 头首现 cap=' + r.edge.headAt +
    ' / 头出现后再消失 ' + r.edge.headGaps + ' 档）');
  const p = probePlan(WA);
  a(p.noFold !== true && p.half === 0 && p.hasHead === true,
    'Q6 C1 plan() 真消费链：折叠 content 零半行且保头');
  a(p.noFold !== true && p.withinTo === true, 'Q6 C1b 折叠 content 不越过账面 to（不改预算真源）');
  a(p.noFold !== true && p.keys.indexOf('remainAt') < 0 && p.reasons.indexOf('over_budget') >= 0,
    'Q6 C1c 裁决账结构未变（keys/reason 与旧口径一致）');
  const m = probeMix(WA);
  a(m.half === 0 && m.over === false, 'Q6 C2 中英混排逐行整取整舍（半行 ' + m.half + ' / 守上限 ' + !m.over + '）');
}

function runNegative(a) {
  const src = budgetSrc();
  [['CALL', ANCHOR_CALL], ['LIMIT', ANCHOR_LIMIT], ['TAIL', ANCHOR_TAIL]].forEach(function (pair) {
    const n = src.split(pair[1]).length - 1;
    a(n === 1, 'Q6 N0 锚点 ' + pair[0] + ' 恰中一次（实 ' + n + '）');
  });
  // N1 破坏结构化分支调用 ⇒ 落回字符级
  const noCall = src.split(ANCHOR_CALL).join('');
  a(noCall.indexOf('trimStructured(s, maxTokens)') < 0, 'Q6 N0a 破坏后结构化分支已不可达');
  const r1 = probeN1(fresh(noCall));
  a(r1.broken === true, 'Q6 N1 破坏结构化分支 ⇒ 字符级半条/断尾现形（半行 ' + r1.half + ' / 尾在 ' + r1.tail + '）');
  // N0b 单证兜底复核在拦边界超限（扫描得越界档）
  const noLimit = src.split(ANCHOR_LIMIT).join('    return out;\n');
  const rl = probeLimit(fresh(noLimit));
  a(rl.over > 0, 'Q6 N0b 去掉兜底复核 ⇒ 越界档现形（证明复核真在拦：' + rl.over +
    ' 档，cap ' + rl.first + '..' + rl.last + '）');
  const rlo = probeLimit(fresh());
  a(rlo.over === 0, 'Q6 N0b2 原版同扫描零越界（两向自证）');
  // N2 单破坏 tailKept ⇒ 尾真丢（区间扫描）
  const tailF = src.split(ANCHOR_TAIL).join('    const tailKept = false;\n');
  const r2 = probeN2(fresh(tailF));
  a(r2.lost > 0, 'Q6 N2 单破坏 tailKept ⇒ 尾关键约束真丢（' + r2.lost + '/' + r2.caps + ' 档可观测）');
  // N3 原版同判据全绿
  const rc = probeN2(fresh());
  a(rc.lost === 0 && rc.caps > 0, 'Q6 N3 原版同判据全绿（' + rc.caps + ' 档零丢失，两向自证防恒绿）');
}

function runAll(a) { judge(a); }

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('Q6-ATOMIC-V2215: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('Q6-ATOMIC-V2215: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative };