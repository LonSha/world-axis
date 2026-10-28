'use strict';
/**
 * tests/reject-recovery-lock-v2192.js — 拒收码恢复映射（计划 U5）四段专锁。
 *   A 静态契约：产品模块与工具的导出面、六档纪律（无 ignore / 不出现「忽略」）、
 *                三面快照与登记表的一对一、锚点逐字恰中 1 次（H5 纯度）。
 *   B 运行时：真读现场源码复算三面 + 真装载产品模块，拿两侧的现场读数。
 *   C 不变式：判据**纯只读** —— 连调两次逐字节相同，且不改任何产品源码。
 *   N 负控制：**在内存副本上做真源码破坏 → 重跑同款真判据**（可注入读接缝 `opt.read`）。
 *
 * 为什么负控制走内存副本：本锁要治的病之一就是「面判错了 —— 把成功分支的理由
 *   也当成要恢复的拒收码」。验证「判据真会现形」如果靠改真文件，验证者自己
 *   就成了新的风险源（与 tests/u9-fact-report-v2190.js 同口径）。
 *
 * 本锁自证（H 系列口径）：
 *   H5 每个锚点字面量在目标文件里恰中 1 次、且在本文件里恰声明 1 次（缺失与重复同罪）。
 *   H6 判据两向自证：原版上该判据必须为真（B 组），破坏副本上必须为假（N 组）；
 *      且每处破坏必须**可观测地改变行为**（否则「没现形」会被误读成「判据太弱」）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/reject-recovery-lock-v2192.js';
const PROD_REL = 'engines/reject-recovery.js';
const TOOL_REL = 'tools/reject-recovery.js';
const RUN_REL = 'tests/run.js';
const rr = require('../tools/reject-recovery.js');
/** 统一锚点表（{rel, txt}；txt 在目标文件里恰中 1 次，且不含反斜杠）。 */
const ANCHORS = {
  aKinds: { rel: PROD_REL, txt: "const KINDS = ['retry-same-input', 'request-setup', 'adjust-input'," },
  aRules: { rel: PROD_REL, txt: 'const RULES = [' },
  aOver: { rel: PROD_REL, txt: 'const OVERRIDES = {' },
  aNeutral: { rel: PROD_REL, txt: 'const NEUTRAL_REVIEW = {' },
  aArtifacts: { rel: PROD_REL, txt: 'const ARTIFACTS = {' },
  aRejectFace: { rel: PROD_REL, txt: 'const REJECT_FACE = [' },
  aSuccessFace: { rel: PROD_REL, txt: "'anonymous', 'applied', 'attenuated', 'checked', 'clean', 'first', 'first-baseline'," },
  aNeutralFace: { rel: PROD_REL, txt: 'const NEUTRAL_FACE = [' },
  aExplain: { rel: PROD_REL, txt: 'function explain(code, opt) {' },
  aFrozen: { rel: PROD_REL, txt: 'function frozenFace(c) {' },
  aExport: { rel: PROD_REL, txt: 'WA.rejectRecovery = {' },
  aReg: { rel: PROD_REL, txt: "WA.registerModule('engines/reject-recovery.js'" },
  tLive: { rel: TOOL_REL, txt: 'function live(opt) {' },
  tEnclose: { rel: TOOL_REL, txt: 'function enclosingObject(text, idx) {' },
  tAudit: { rel: TOOL_REL, txt: 'function audit(opt) {' },
  tProd: { rel: TOOL_REL, txt: 'function product() {' },
  aWire: { rel: RUN_REL, txt: ", 'engines/reject-recovery.js'," }
};
/** 产品模块导出面（逐个点名，防「少一个也没人说话」）。 */
const EXPORTS = ['KINDS', 'KIND_ACTION', 'RULES', 'OVERRIDES', 'ARTIFACTS', 'NEUTRAL_REVIEW',
  'REJECT_FACE', 'SUCCESS_FACE', 'NEUTRAL_FACE', 'ruleKind', 'explain', 'counts',
  'diagnose', 'stat'];
/** 六档（计划 U5 原文的封闭集合）。
 *  常量名**故意不叫 KINDS**：产品模块里也有一个 `KINDS`，若本文件凭空再声明一个同名字面量，
 *  锚点 `aKinds` 就会在本文件里被自己命中第二次（A15 纯度当场报红）—— 详见文件头 H5。 */
const KIND_LIST = ['retry-same-input', 'request-setup', 'adjust-input',
  'rollback', 'manual-review', 'permanent-reject'];
/** 方向一致性样本（验收 ②：建议与码的处置方向不矛盾）。
 *  样本**刻意不成对反例**：`landed-immutable` 必须 rollback 而非 adjust，
 *  而 `bad-round` 必须 adjust 而非 rollback —— 这两个方向相反，是 U5 全部理由的来源。 */
const DIRECTIONS = [
  { code: 'landed-immutable', expect: 'rollback' },
  { code: 'bad-round', expect: 'adjust-input' },
  { code: 'hard-cut', expect: 'rollback' },
  { code: 'missing-person', expect: 'request-setup' },
  { code: 'out-of-order', expect: 'rollback' }
];
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
/** 全量替换（字符串版 replace 只改第一处 —— v2.105.0 的 D2 教训）。 */
function allReplace(src, from, to) { return src.split(from).join(to); }
/** 在真源码上做一次破坏，并证明破坏真的发生了（没打中 ⇒ 抛，不许静默）。 */
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label + ' :: ' + from);
  return out;
}
/** 读接缝：目标文件换成破坏副本，其余文件读真源。 */
function readerWith(rel, broken) {
  return function (r) {
    if (r === rel) return broken;
    return rd(r);
  };
}
function setOf(arr) { const s = {}; (arr || []).forEach(function (x) { s[x] = true; }); return s; }
function runA(A) {
  const S = rd(PROD_REL);
  const p = rr.product();
  const keys = Object.keys(p).sort();
  A(keys.join(',') === EXPORTS.slice().sort().join(','),
    'A1 产品导出面恰为 ' + EXPORTS.length + ' 项（实 ' + keys.length + '）');
  A(p.KINDS.join(',') === KIND_LIST.join(','),
    'A2 六档与计划原文逐字相同（实 ' + p.KINDS.join(',') + '）');
  A(p.KINDS.indexOf('ignore') < 0,
    'A3 六档里**没有** ignore（边界 ①：不把可重试与可忽略合成一档）');
  A(p.KINDS.every(function (k) { return typeof p.KIND_ACTION[k] === 'string' && p.KIND_ACTION[k].length > 0; }),
    'A4 每档都配一句可执行的话（空串会让面板显示一片空白）');
  A(p.KINDS.every(function (k) { return p.KIND_ACTION[k].indexOf('忽略') < 0; }),
    'A5 六句建议都不出现「忽略」（边界 ②：不得暗示忽略即可 —— 那是静默降级）');
  // A6 面判定不得拿规则表兜（边界 ③ 的静态形态）：frozenFace 只查三张快照
  //   注意：这里**引用锚点表的字段**而不是再抄一遍函数签名 —— 抄一遍就等于本文件里
  //   出现两次该字面量，A15（H5 纯度）当场报红。判据不得自带锚点串的副本。
  const frozenBody = S.slice(S.indexOf(ANCHORS.aFrozen.txt));
  const frozenEnd = frozenBody.slice(0, frozenBody.indexOf('}'));
  A(frozenEnd.indexOf('ruleKind') < 0,
    'A6 面判定函数不调 ruleKind —— 否则任意字符串都会被规则表兜成某一档（边界 ③）');
  A(frozenEnd.indexOf('REJECT_FACE') >= 0 && frozenEnd.indexOf('SUCCESS_FACE') >= 0 && frozenEnd.indexOf('NEUTRAL_FACE') >= 0,
    'A6b 面判定只查三张冻结快照');
  // A7 判不出面快照 = 登记表键集（一对一的静态形态）
  A(p.NEUTRAL_FACE.slice().sort().join('|') === Object.keys(p.NEUTRAL_REVIEW).sort().join('|'),
    'A7 判不出面快照与 NEUTRAL_REVIEW 键集逐字相同（多一条少一条都会让面判定与登记脱钩）');
  // A8 拒收面快照 ⊇ 全部显式登记
  Object.keys(p.OVERRIDES).forEach(function (c) {
    A(p.REJECT_FACE.indexOf(c) >= 0, 'A8 拒收面快照含 OVERRIDES 键「' + c + '」');
  });
  // A9 三面两两不相交
  const rS = setOf(p.REJECT_FACE), sS = setOf(p.SUCCESS_FACE), nS = setOf(p.NEUTRAL_FACE);
  A(p.REJECT_FACE.every(function (c) { return !sS[c] && !nS[c]; }), 'A9 拒收面与另两面不相交');
  A(p.SUCCESS_FACE.every(function (c) { return !nS[c]; }), 'A9b 成功面与判不出面不相交');
  // A10 产品模块零 fs / 零 store / 零 localStorage（边界 ④）
  A(S.indexOf('require(') < 0, 'A10 产品模块不带任何 require（零依赖，也就不可能写盘）');
  // 注意：查的是**真的调用了 store/localStorage**（`WA.store.` / `.localStorage`），
  //   不是「文本里提到这两个词」—— 注释里为说明「零 store」而写下的字面量不算违规。
  A(S.indexOf('WA.store.') < 0 && S.indexOf('.localStorage') < 0 && S.indexOf('localStorage.') < 0,
    'A10b 产品模块零 store 调用 / 零 localStorage 调用（恢复语义不落盘，边界 ④）');
  // A11 工具侧**不再自带一份表**（单一真源：表在产品）
  A(rd(TOOL_REL).indexOf('const KINDS = [') < 0,
    'A11 工具侧不再自带六档表（一份表两处拷贝 = 两个真源，会慢慢漂开）');
  // A12 工具侧有读接缝（负控制要在内存副本上做真破坏）
  A(rd(TOOL_REL).indexOf(ANCHORS.tLive.txt) >= 0 && rd(TOOL_REL).indexOf('o.read') >= 0,
    'A12 工具侧的现场复算带读接缝（无接缝就不能在内存副本上验证判据）');
  // A14 锚点逐条：在目标文件里恰中 1 次
  Object.keys(ANCHORS).forEach(function (k) {
    const t = ANCHORS[k];
    const n = rd(t.rel).split(t.txt).length - 1;
    A(n === 1, 'A14 锚点「' + k + '」在 ' + t.rel + ' 恰中 1 次（实 ' + n + '）');
  });
  // A15 纯度：每个锚点字面量在本文件恰声明 1 次（判据不得引用锚点串当期望值）
  const selfSrc = rd(SELF_REL);
  const impure = Object.keys(ANCHORS).filter(function (k) {
    return selfSrc.split(ANCHORS[k].txt).length - 1 !== 1;
  });
  A(impure.length === 0, 'A15 锚点字面量在本文件各恰出现一次（违者：' + (impure.join(',') || '无') + '）');
}
function runB(A) {
  const p = rr.product();
  const f = rr.live();
  const codesAll = Object.keys(f).sort();
  const facesLive = { reject: [], success: [], neutral: [] };
  codesAll.forEach(function (c) { facesLive[f[c].face].push(c); });
  A(codesAll.length > 700, 'B1 现场复算覆盖 ' + codesAll.length + ' 个 reason 字面量（下限 700）');
  A(facesLive.reject.length > 0 && facesLive.success.length > 0 && facesLive.neutral.length > 0,
    'B2 三面都非空（拒收 ' + facesLive.reject.length + ' / 成功 ' + facesLive.success.length
    + ' / 判不出 ' + facesLive.neutral.length + '）—— 塌成一面说明分面判据没在干活');
  ['reject', 'success', 'neutral'].forEach(function (k) {
    const liveSet = facesLive[k].slice().sort().join('|');
    const prodSet = (k === 'reject' ? p.REJECT_FACE : (k === 'success' ? p.SUCCESS_FACE : p.NEUTRAL_FACE)).slice().sort().join('|');
    A(liveSet === prodSet, 'B3 ' + k + ' 面：产品快照与现场逐条一致（' + facesLive[k].length + ' 条）');
  });
  const a = rr.audit();
  A(a.ok === true, 'B4 核对器整体为真（problems ' + a.problems.length + ' / undecided '
    + a.undecided.length + ' / tainted ' + a.tainted.length + '）');
  A(a.product.ok === true, 'B5 产品自证 diagnose 为真');
  // B6 拒收面逐条有档（拿真现场面复算）
  const liveFaceMap = {};
  codesAll.forEach(function (c) { liveFaceMap[c] = f[c].face; });
  const noKind = codesAll.filter(function (c) {
    const r = p.explain(c, { face: liveFaceMap });
    return r.face === 'reject' && !r.kind && r.via !== 'artifact';
  });
  A(noKind.length === 0, 'B6 拒收面每条都有档（无档：' + (noKind.slice(0, 8).join(' ') || '无') + '）');
  // B7 成功面**不许**被配档（给「做成了」编恢复动作 = 造数据）
  const tainted = codesAll.filter(function (c) {
    const r = p.explain(c, { face: liveFaceMap });
    return r.face === 'success' && !!r.kind;
  });
  A(tainted.length === 0, 'B7 成功面没有被配档（违者：' + (tainted.join(' ') || '无') + '）');
  A(codesAll.filter(function (c) { return f[c].face === 'success'; }).length > 0,
    'B7b 成功面确实非空 —— 否则 B7 在空集上恒真（这正是本版分面判据的价值所在）');
  // B8 方向一致性：样本里没有一例「建议与码的方向矛盾」
  const dp = p.KINDS.length ? rrDirections(p, f) : [];
  A(dp.length === 0, 'B8 方向一致性样本无矛盾（违者：' + (dp.map(function (x) { return x.code + ':' + x.why; }).join(' / ') || '无') + '）');
  // B9 单点语义抽查（三条各代表一面）
  const e1 = p.explain('landed-immutable', { face: { 'landed-immutable': 'reject' } });
  A(e1.kind === 'rollback', 'B9 已落拍的标题被改 ⇒ rollback（实 ' + e1.kind + '）——「演过的东西是既成事实」');
  const e2 = p.explain('clean', { face: { clean: 'success' } });
  A(e2.kind === null && e2.via === 'face-success',
    'B9b 成功分支的 clean 不配恢复动作（实 kind=' + e2.kind + '）—— 给它编动作就是造数据');
  const e3 = p.explain('crisis', { face: { crisis: 'neutral' } });
  A(e3.kind === null && e3.via === 'out-of-contract',
    'B9c 决策理由 crisis 落在契约外（实 via=' + e3.via + '）—— 它答的是「往哪走」，不是「能不能做」');
  // B10 边界 ③ 的运行时形态：任意字符串不得被判成拒收
  ['zzz-not-a-code', 'not-a-real-thing-42', 'aaa'].forEach(function (s) {
    const r = p.explain(s, { face: liveFaceMap });
    A(r.face === 'unknown' && r.kind === null,
      'B10 非法码「' + s + '」被判 unknown 且无档（实 face=' + r.face + ' kind=' + r.kind + '）');
  });
  // B11 工具与产品同源：工具 audit 的三面计数直接来自产品快照与现场
  A(a.totals.reject === facesLive.reject.length && a.totals.success === facesLive.success.length,
    'B11 工具核对的计数与现场复算同源（不另算一套）');
  // B12 契约外登记：确有「不在这份契约里」的码被如实分开（不硬塞进六档）
  A(Object.keys(p.NEUTRAL_REVIEW).some(function (k) { return !!p.NEUTRAL_REVIEW[k].out; }),
    'B12 判不出面确有「契约外」登记（决策理由与治理理由不得硬塞进六档）');
}
function rrDirections(p, f) {
  const out = [];
  const faceMap = {};
  Object.keys(f).forEach(function (c) { faceMap[c] = f[c].face; });
  DIRECTIONS.forEach(function (d) {
    const r = p.explain(d.code, { face: faceMap });
    if (r.face !== 'reject') out.push({ code: d.code, why: '不在拒收面（face=' + r.face + '）' });
    else if (r.kind !== d.expect) out.push({ code: d.code, why: '得 ' + r.kind + ' 期望 ' + d.expect });
  });
  return out;
}
function runC(A) {
  const before = rd(PROD_REL);
  const f1 = rr.live(), f2 = rr.live();
  A(JSON.stringify(Object.keys(f1).sort()) === JSON.stringify(Object.keys(f2).sort()),
    'C1 连调两次面复算的码集相同（判据无副作用）');
  A(JSON.stringify(f1) === JSON.stringify(f2), 'C1b 连调两次面复算逐字节相同');
  const a1 = rr.audit(), a2 = rr.audit();
  A(JSON.stringify(a1.ok) === JSON.stringify(a2.ok) && a1.total === a2.total,
    'C2 连调两次核对结论一致（audit 无副作用）');
  A(rd(PROD_REL) === before, 'C3 产品模块逐字节未变（判据纯只读）');
  // C4 工具与产品两侧都不得产生任何文件（本锁只在内存里跑）
  const a = rr.audit();
  A(a.problems.length === 0, 'C4 审计问题面为空（problems 0 才是通过）');
}
function runN(A) {
  // ── N1 拒收面破坏：把一条码从 REJECT_FACE 挪到 SUCCESS_FACE ⇒ 快照与现场必须现形 ──
  {
    const S = rd(PROD_REL);
    const broken = breakOnce(S, "'hard-cut', ", "'hard-cutX', ", 'n1-move-off-reject');
    // 破坏的是**产品副本**：产品经由读缝装载，工具仍读真源码
    const p2 = loadBrokenProduct(broken);
    A(p2.REJECT_FACE.indexOf('hard-cut') < 0, 'N1 破坏版里 hard-cut 不在拒收面（判据真在读产品快照）');
    const liveF = rr.live();
    const liveReject = Object.keys(liveF).filter(function (c) { return liveF[c].face === 'reject'; });
    A(liveReject.indexOf('hard-cut') >= 0, 'N1b 现场复算里 hard-cut 仍在拒收面（工具读的是真源码）');
    A(p2.REJECT_FACE.slice().sort().join('|') !== liveReject.slice().sort().join('|'),
      'N1c 快照与现场不再一致 —— 这正是核对器要抓的形态（原版上两者一致）');
  }
  // ── N2 分面判据破坏：把括号配对换成「看同行」⇒ 多行对象必然误判 ──
  {
    const T = rd(TOOL_REL);
    // 把「向前找 { 」的循环体挖空 ⇒ enclosingObject 恒返回 null ⇒ 全部塌成 neutral
    const broken = breakOnce(T, 'for (let i = idx; i >= 0; i -= 1) {', 'for (let i = -1; i >= 0; i -= 1) {', 'n2-enclose');
    const m = loadBrokenToolLive(broken);
    A(m.faceOf('hard-cut') === 'neutral',
      'N2 挖空括号配对后 hard-cut 塌成 neutral（实 ' + m.faceOf('hard-cut') + '）—— 破坏可观测地改变了行为');
    A(rr.live()['hard-cut'].face === 'reject', 'N2b 原版上同款判据为真（hard-cut 在拒收面）');
  }
  // ── N3 规则表兜底破坏：把 frozenFace 换成「查不到就过规则表」⇒ 任意字符串变拒收 ──
  {
    const S = rd(PROD_REL);
    const broken = breakOnce(S, "    return 'unknown';\n  }\n", "    return ruleKind(c) ? 'reject' : 'unknown';\n  }\n", 'n3-fallback');
    const p3 = loadBrokenProduct(broken);
    // **不注入面** —— 这里验的正是「产品自己按快照判面」这条路径；
    //   注入空面表等于告诉它「现场面说 unknown」，那就验不到 frozenFace 被破坏。
    const r = p3.explain('zzz-not-a-code');
    A(r.face === 'reject', 'N3 兜底版把非法码 zzz-not-a-code 判成拒收（实 ' + r.face + '）—— 边界 ③ 被破坏后当场现形');
    const r0 = rr.product().explain('zzz-not-a-code');
    A(r0.face === 'unknown', 'N3b 原版上同款判据为真（非法码 = unknown）');
  }
  // ── N4 成功面破坏：给 clean 配上档位 ⇒ tainted 判据必须现形 ──
  {
    const S = rd(PROD_REL);
    const broken = breakOnce(S, "  const SUCCESS_FACE = ['absent', ", "  const SUCCESS_FACE = ['absentX', ", 'n4-success');
    const p4 = loadBrokenProduct(broken);
    A(p4.SUCCESS_FACE.indexOf('absent') < 0, 'N4 破坏版里 absent 被移出成功面（实含 ' + (p4.SUCCESS_FACE.indexOf('absent') >= 0) + '）');
    A(rr.product().SUCCESS_FACE.indexOf('absent') >= 0, 'N4b 原版上 absent 在成功面');
    // 破坏版上，absent 会被面判定成 unknown（它既不在成功面也不在拒收面）
    A(p4.explain('absent', { face: {} }).face === 'unknown',
      'N4c 破坏版里 absent 落成 unknown（面判定只认快照，不猜）');
  }
  // ── N5 判不出面破坏：把 NEUTRAL_REVIEW 的键集与快照拆开 ⇒ A7/B3 必须现形 ──
  {
    const S = rd(PROD_REL);
    const broken = breakOnce(S, "'crisis': { out: true, why: '决策理由（action=pause）' },",
      '', 'n5-neutral-drop');
    const p5 = loadBrokenProduct(broken);
    A(Object.keys(p5.NEUTRAL_REVIEW).indexOf('crisis') < 0, 'N5 破坏版里 crisis 不在登记表');
    A(p5.NEUTRAL_FACE.indexOf('crisis') >= 0, 'N5b 但快照里还在 —— 两侧脱钩，正是 A7 要抓的形态');
    A(p5.NEUTRAL_FACE.slice().sort().join('|') !== Object.keys(p5.NEUTRAL_REVIEW).sort().join('|'),
      'N5c 键集与快照不再逐字相同（原版上相同）');
  }
  // ── N6 工具两向自证 ──
  {
    const S = 'const A = 1;\nconst B = 2;\n';
    let threw = false;
    try { breakOnce(S, 'const ZZZ = 9;', 'x', 'n6'); } catch (e) { threw = true; }
    A(threw, 'N6 锚点不存在时工具**必须抛**（不许静默返回原串）');
    A(breakOnce(S, 'const A = 1;', 'const A = 2;', 'n6c') !== S, 'N6c 破坏可观测地改动了文本');
    const dup = 'const A = 1;\nconst A = 1;\n';
    A(allReplace(dup, 'const A = 1;', 'const A = 2;').split('const A = 2;').length - 1 === 2,
      'N6d 全量替换改掉**全部**出现处 —— 只改第一处会让多数站点静默漏改');
  }
  // ── N7 读接缝自证：注入 read 只影响目标文件，其余仍读真源 ──
  {
    const fake = {};
    const f = rr.live({ read: function (rel) { return fake[rel] !== undefined ? fake[rel] : rd(rel); } });
    A(Object.keys(f).length === Object.keys(rr.live()).length,
      'N7 注入读缝但内容未变时，复算结果相同（读缝本身不改变判据）');
    fake['engines/warrant.js'] = "return { ok: true, reason: 'clean' };\n";
    const f2 = rr.live({ read: function (rel) { return fake[rel] !== undefined ? fake[rel] : rd(rel); } });
    A(f2['clean'] && f2['clean'].face === 'success', 'N7b 换掉一个文件的副本后该文件的码面随之改变（读缝真在生效）');
  }
  // ── N8 全量注入负控制：把所有文件换成「只剩一条成功码」⇒ 拒收面必须塌掉 ──
  {
    const f = rr.live({ read: function () { return "const a = { ok: true, reason: 'only-ok' };\n"; } });
    const ks = Object.keys(f);
    A(ks.length === 1 && f['only-ok'].face === 'success',
      'N8 全部换成合成源码后只剩一条成功码（实 ' + ks.length + ' 条：' + ks.slice(0, 5).join(',') + '）');
    A(rr.live()['only-ok'] === undefined, 'N8b 原版上不存在合成码（破坏可观测地改变了结果）');
  }
}
/** 在内存里装载一份破坏版产品模块（不进模块缓存、不碰真文件）。 */
function loadBrokenProduct(src) {
  const vm = require('vm');
  const ctx = { window: {}, console: console };
  ctx.window.WorldAxis = { registerModule: function () {} };
  ctx.window.WorldAxis = ctx.window.WorldAxis;
  ctx.window = ctx.window;
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: PROD_REL + '#broken' });
  const WA = ctx.window.WorldAxis;
  if (!WA || !WA.rejectRecovery) throw new Error('破坏版产品模块没装上 WA.rejectRecovery（破坏可能把它整段打断了）');
  return WA.rejectRecovery;
}
/** 在内存里装载一份破坏版工具的 live()（只取复算能力）。 */
function loadBrokenToolLive(src) {
  const vm = require('vm');
  const mod = { exports: {} };
  const ctx = {
    require: require, module: mod, exports: mod.exports, console: console,
    __dirname: path.join(BASE, 'tools'), process: process
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: TOOL_REL + '#broken' });
  const live = mod.exports.live;
  if (typeof live !== 'function') throw new Error('破坏版工具没导出 live（破坏可能把它整段打断了）');
  const f = live();
  return { faceOf: function (c) { return f[c] ? f[c].face : 'absent'; } };
}
function runAll(assert) {
  const A = function (c, n) { assert(c, n); };
  runA(A); runB(A); runC(A);
}
function runNegative(assert) {
  const A = function (c, n) { assert(c, n); };
  runN(A);
}
module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  ANCHORS: ANCHORS, EXPORTS: EXPORTS, KIND_LIST: KIND_LIST, DIRECTIONS: DIRECTIONS
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try {
    require('./mock.js');
    runAll(a);
    runNegative(a);
  } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('REJECT-RECOVERY-V2192: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('REJECT-RECOVERY-V2192: pass (' + pass + ')');
}