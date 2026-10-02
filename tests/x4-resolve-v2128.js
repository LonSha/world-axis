#!/usr/bin/env node
// WorldAxis tests/x4-resolve-v2128.js —— v2.128.0（拓展计划 X4）：认知冲突裁决
//
// 【它治的病】
//   R105 ⑤ 的现场原话是：**「两条线索互相打脸怎么办」**。
//   本仓 `intel` 有来源与置信度、`enigma` 有知情边界、`rumor` 有传播与辟谣 ——
//   三者各自成立，但没有任何一处回答得了「这两条并排的线索该采信谁」。
//   现场于是只剩两种做法：要么一有线索就真相大白（悬疑变通知），要么永远悬着。
//
// 【本版落点】
//   · `probe.resolve(a, b)` —— 按**来源等级**裁决两条线索：采信谁 / 为什么 / 存疑什么。
//     强度表 `STRENGTH` 由 `LEVELS` 直接派生（不另立第二把尺子）。
//   · 六条边界（全是否定式）：同源等级 · 同向不是冲突 · 等强对撞不硬裁 ·
//     不写存档 · 等级与方向都必填 · 不跨链合并。
//   · 两个读者（能力申报不算读者）：
//     ① `resolve` ← `engines/rumor.js` 的 `investigate`（同一时间握着「事实侧原始值」
//        与「链终态值」两条并排线索的**只有那条链自己**），读数再由面板「调查」按钮显示；
//     ② `auditRecord` ← 面板「看卷宗」按钮（用户输入的案件 id 是真输入，读数落在既有输出节点上）。
//
// 【判据结构（与 x1/x2/x3 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（真读者）· N1–N7 真源码破坏 ⇒ 破坏副本重跑同款判据
//   N8 纯度：全部负控制跑完后三个真文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const PROBE = 'engines/probe.js', RUMOR = 'engines/rumor.js', PANEL = 'ui/panel.js', DIAG = 'engines/tool-diag.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
// ── 真源码破坏锚点（各须恰中 1 次）─────────────────────────────────
const ANCHORS = {
  // ② 同向不是冲突：同向且等强 ⇒ 印证（不是僵局）
  corroborate: { rel: PROBE, txt: "        verdict = 'both'; reason = 'corroborated';" },
  // ③ 等强对撞不硬裁：一支持一反驳且同强 ⇒ undecided（cross-tie）
  crossTie: { rel: PROBE, txt: "    } else if (sa === sb) {" },
  // ⑤ 来源等级必填
  badLevel: { rel: PROBE, txt: "LEVELS.indexOf(s.level) < 0" },
  // ⑤ 方向必填
  missDir: { rel: PROBE, txt: "s.dir !== 'support' && s.dir !== 'refute'" },
  // ① 同源等级（强度表由 LEVELS 派生，不另立第二套）
  strength: { rel: PROBE, txt: "  LEVELS.forEach(function (k, i) { STRENGTH[k] = i + 1; });" },
  // 读者①：rumor.investigate 里的裁决调用
  callResolve: { rel: RUMOR, txt: "      r = WA.probe.resolve(" },
  // 读者①的三态闸：probe 缺席 / 未知层 / 空值 ⇒ 问不出来（不是「未决」）
  absent: { rel: RUMOR, txt: "    if (!WA.probe || typeof WA.probe.resolve !== 'function') return null;" },
  // 读者①的等级单源反查（不自建第二把尺子）
  lvEnd: { rel: RUMOR, txt: "LAYER_LEVEL[clean(c.layer, 20)]" },
  // 读者①的异常隔离：附属面抛错不得让「调查」整条读数中断
  catchGuard: { rel: RUMOR, txt: "    } catch (e) { return null; }" },
  // 读者②：面板真读 auditRecord
  auditRead: { rel: PANEL, txt: "return WA.probe.auditRecord(probeCase());" },
  // 读者①的显示口
  showRuling: { rel: PANEL, txt: "    on('#wa-rm-investigate', () => {" }
};
// ── 夹具 ────────────────────────────────────────────────────────────
const TAG = '__x4_2128_';
function env() {
  const WA = fresh();
  WA.rumor.setSettings({ enabled: true, maxChains: 8, maxHops: 6, maxSuppressed: 4 });
  WA.probe.setSettings({ enabled: true, maxCases: 8, maxEvidence: 24, minSupport: 2 });
  WA.store.transact(function (d) {
    d.worldFacts = [{ key: '桥', value: '桥在', at: 1 }];
    d.rumor = { chains: [] };
    d.probe = { cases: [] };
  }, TAG + 'reset');
  return WA;
}
/** 标准两条线索（等级 / 方向由参数给，值固定 —— 判据只看裁决面，不看内容）。 */
function S(dir, level, claim) { return { claim: claim || ('线' + level + dir), level: level, dir: dir, about: 'h0' }; }
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2128/x4: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const p = src(PROBE);
  a(p.indexOf('  function resolve(a, b, opts) {') > 0, 'v2128/x4: [A] `resolve` 在位');
  a(p.indexOf('    auditRecord: auditRecord, resolve: resolve,') > 0, 'v2128/x4: [A] 导出面已登记（不在导出面 = 没有承诺）');
  // 六条边界以注释形态留证（判据读代码面，注释作旁证）
  ['**同源等级**', '**同向不是冲突**', '**等强对撞不硬裁**', '**不写存档**', '**来源等级与方向都必填**', '**不跨链合并**']
    .forEach(function (k) {
      a(p.indexOf(k) > 0, 'v2128/x4: [A] 边界留证在位：' + k);
    });
  // 纯函数：resolve 体内零落盘、零事务
  const body = p.slice(p.indexOf('  function resolve(a, b, opts) {'), p.indexOf('  function view(caseId'));
  ['WA.store.transact', 'WA.store.save', 'saveSettings('].forEach(function (bad) {
    a(body.indexOf(bad) < 0, 'v2128/x4: [A] resolve 体内零 `' + bad + '`（给的是裁决**依据**，不是裁决结果）');
  });
}
// ── B 面：运行时（原版成绿）─────────────────────────────────────────
function runB(a) {
  const W = env();
  const R = function (x, y) {
    try { return W.probe.resolve(x, y, { by: '甲' }); }
    catch (e) { return { ok: false, reason: 'threw:' + (e && e.message) }; }
  };
  // B1 **边界②**：同向且等强 ⇒ 互相印证，不是僵局
  const b1 = R(S('support', 'witness'), S('support', 'witness'));
  a(b1.ok === true && b1.verdict === 'both' && b1.reason === 'corroborated' && b1.doubtedCount === 0,
    'v2128/x4: [B1] 同向等强 ⇒ 「互相印证」（不是 undecided；实 ' + JSON.stringify([b1.verdict, b1.reason, b1.doubtedCount]) + '）');
  // B2 同向不等强 ⇒ 采信更强，弱的那条**逐条带因**留档（不是删掉）
  const b2 = R(S('support', 'record'), S('support', 'rumor'));
  a(b2.ok === true && b2.verdict === 'a' && b2.reason === 'stronger-level'
    && b2.doubtedCount === 1 && b2.doubted[0].why === 'weaker-level' && b2.doubted[0].side === 'b',
    'v2128/x4: [B2] 同向不等强 ⇒ 采强、弱条存疑留档（实 ' + JSON.stringify(b2.doubted) + '）');
  // B3 反向不等强 ⇒ 采信更强，反方存疑（why='outweighed'）
  const b3 = R(S('support', 'record'), S('refute', 'report'));
  a(b3.ok === true && b3.verdict === 'a' && b3.doubtedCount === 1 && b3.doubted[0].why === 'outweighed'
    && b3.trusted && b3.trusted.dir === 'support',
    'v2128/x4: [B3] 反向不等强 ⇒ 采强；反方**存疑留档**（实 ' + JSON.stringify(b3.doubted) + '）');
  // B3b 对称性：把两侧调换，采信的仍是「强的那条」，不是「a 位」
  const b3b = R(S('refute', 'report'), S('support', 'record'));
  a(b3b.ok === true && b3b.verdict === 'b' && b3b.trusted && b3b.trusted.dir === 'support',
    'v2128/x4: [B3b] 采信的是「更强的那条」而不是「a 位」（换位后 verdict 变 b；实 ' + b3b.verdict + '）');
  // B4 **边界③**：反向且等强 ⇒ 不硬裁（两条都进 doubted，verdict=undecided）
  const b4 = R(S('support', 'witness'), S('refute', 'witness'));
  a(b4.ok === true && b4.verdict === 'undecided' && b4.reason === 'cross-tie'
    && b4.doubtedCount === 2 && b4.trusted === null,
    'v2128/x4: [B4] 等强反向 ⇒ 不硬裁（undecided/cross-tie、两条都存疑、trusted=null；实 '
    + JSON.stringify([b4.verdict, b4.reason, b4.doubtedCount, b4.trusted]) + '）');
  // B5 **边界①**：强度表由 LEVELS 直接派生（record 最高、rumor 最低；两把尺子会分叉）
  const b5 = R(S('support', 'record'), S('support', 'rumor'));
  a(b5.strength.a === 4 && b5.strength.b === 1 && b5.levels.a === 'record' && b5.levels.b === 'rumor',
    'v2128/x4: [B5] 强度由 `LEVELS` 顺序派生（record=4 / rumor=1；实 ' + JSON.stringify(b5.strength) + '）');
  // B6 **边界⑤**：自造等级拒收（「我觉得可靠」不是证据）
  const b6 = R(S('support', 'gut'), S('refute', 'witness'));
  a(b6.ok === false && b6.reason === 'bad-level' && Array.isArray(b6.allowed) && b6.allowed.join(',') === 'rumor,report,witness,record',
    'v2128/x4: [B6] 自造等级 ⇒ `bad-level` 且带出合法等级表（实 ' + JSON.stringify(b6) + '）');
  // B7 **边界⑤**：方向必填（不说支持还是反驳的线索构不成冲突）
  const b7 = R(S('maybe', 'witness'), S('refute', 'witness'));
  a(b7.ok === false && b7.reason === 'missing-direction',
    'v2128/x4: [B7] 方向不明 ⇒ `missing-direction`（实 ' + b7.reason + '）');
  // B8 线索内容必填（说不出内容的线索不进裁决）
  const b8 = R({ level: 'witness', dir: 'support' }, S('refute', 'witness'));
  a(b8.ok === false && b8.reason === 'missing-claim' && b8.side === 'a',
    'v2128/x4: [B8] 缺内容 ⇒ `missing-claim` 并指出是哪一侧（实 ' + JSON.stringify(b8) + '）');
  // B9 **边界④**：不写存档（dryRun:true；两侧前后逐字相同）
  const before = JSON.stringify(W.store.get());
  const b9 = R(S('support', 'record'), S('refute', 'rumor'));
  a(b9.dryRun === true && JSON.stringify(W.store.get()) === before,
    'v2128/x4: [B9] 裁决不落盘（dryRun:true 且存档逐字未变 —— 定案仍然只走 decide）');
  // B10 **边界⑥**：只裁给定的两条（存疑条数不可能超过两侧）
  const b10 = R(S('support', 'record'), S('refute', 'rumor'));
  a(b10.doubted.length <= 2 && b10.doubted.every(function (d) { return d.side === 'a' || d.side === 'b'; }),
    'v2128/x4: [B10] 不跨链合并：存疑只可能来自给定的两条（实 ' + b10.doubtedCount + '）');
  // B11 纯读：连调三次读数相同，且**零故障**（合法输入不该记 fault）
  const b0 = W.probe.stat();
  const r1 = R(S('support', 'record'), S('refute', 'rumor'));
  const r2 = R(S('support', 'record'), S('refute', 'rumor'));
  const r3 = R(S('support', 'record'), S('refute', 'rumor'));
  const b1x = W.probe.stat();
  a(JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(r2) === JSON.stringify(r3),
    'v2128/x4: [B11] 同一输入三次裁决读数逐字相同');
  a(b1x.blocked === b0.blocked && JSON.stringify(b1x.faults) === JSON.stringify(b0.faults),
    'v2128/x4: [B11] 合法输入零故障（实 blocked ' + b0.blocked + '→' + b1x.blocked + '）');
  // B12 拒收才记故障（故障台账与拒收同源）
  const g0 = W.probe.stat().faults;
  R(S('support', 'gut'), S('refute', 'witness'));
  const g1 = W.probe.stat().faults;
  a((g1['bad-level'] || 0) === (g0['bad-level'] || 0) + 1,
    'v2128/x4: [B12] 拒收进故障台账（bad-level 计数 +1；实 ' + JSON.stringify(g1) + '）');
}
// ── C 面：真读者 ────────────────────────────────────────────────────
function runC(a) {
  // C1 读者①确实调了 resolve（源码面：调用点恰 1 次）
  const rm = src(RUMOR);
  a(hits(rm, ANCHORS.callResolve.txt) === 1, 'v2128/x4: [C1] rumor 恰有 1 处调用 probe.resolve');
  a(rm.indexOf('      ruling: rulingOf(c, finalValue) };') > 0,
    'v2128/x4: [C1] `investigate` 的返回体带出裁决读数（调用点不接结果就不算读者）');
  // C2 运行时：未改写链 ⇒ 事实侧与终态侧同向 ⇒ 互相印证
  const W = env();
  const c2 = W.rumor.startChain('桥', '起链');
  const iv2 = W.rumor.investigate(c2.id);
  a(iv2.ruling && iv2.ruling.verdict === 'both' && iv2.ruling.reason === 'corroborated',
    'v2128/x4: [C2] 未改写的链上裁决 = 互相印证（实 ' + JSON.stringify(iv2.ruling && iv2.ruling.verdict) + '）');
  // C3 运行时：被改写的链 ⇒ 终态反着事实说 ⇒ 采信事实侧；反方逐条带因
  const W3 = env();
  const c3 = W3.rumor.startChain('桥', '起链');
  W3.rumor.relay(c3.id, { from: '甲', to: '乙', layer: 'witness' });
  W3.rumor.relay(c3.id, { from: '乙', to: '丙', layer: 'hearsay', motive: 'distort', value: '桥垮了' });
  const iv3 = W3.rumor.investigate(c3.id);
  a(iv3.tampered === true && iv3.ruling && iv3.ruling.verdict === 'a' && iv3.ruling.reason === 'stronger-level'
    && iv3.ruling.doubtedCount === 1,
    'v2128/x4: [C3] 被改写的链上裁决 = 采信事实侧（record 压过 report；实 ' + JSON.stringify(iv3.ruling) + '）');
  a(iv3.ruling.levels.a === 'record' && iv3.ruling.levels.b === 'report',
    'v2128/x4: [C3] 两侧等级由 `LAYER_LEVEL` 单源反查（fact→record、hearsay→report；实 '
    + JSON.stringify(iv3.ruling.levels) + '）');
  // C4 **两态可分**：问不出来 ≠ 问出来是僵局。probe 缺席 ⇒ ruling=null，而调查本身仍然成功
  const W4 = env();
  const c4 = W4.rumor.startChain('桥', '起链');
  const keepProbe = W4.probe;
  W4.probe = undefined;
  let iv4 = null;
  try { iv4 = W4.rumor.investigate(c4.id); } finally { W4.probe = keepProbe; }
  a(iv4 && iv4.ok === true && iv4.ruling === null,
    'v2128/x4: [C4] 裁决面缺席 ⇒ `ruling:null`（问不出来），且调查读数**不中断**（实 '
    + JSON.stringify([iv4 && iv4.ok, iv4 && iv4.ruling]) + '）');
  a(iv4 && iv4.layer === 'fact' && iv4.tampered === false,
    'v2128/x4: [C4] 裁决面缺席不影响调查本身的结论（同一次调用里两件事分得开）');
  // C4b 裁决面在场但抛错 ⇒ 同样只是「问不出来」（附属面失败不拖主链）
  const W4b = env();
  const c4b = W4b.rumor.startChain('桥', '起链');
  const keepR = W4b.probe.resolve;
  let iv4b = null;
  W4b.probe.resolve = function () { throw new Error('boom'); };
  try { iv4b = W4b.rumor.investigate(c4b.id); } finally { W4b.probe.resolve = keepR; }
  a(iv4b && iv4b.ok === true && iv4b.ruling === null,
    'v2128/x4: [C4b] 裁决面抛错 ⇒ 仍只是「问不出来」（附属面失败不拖主链；实 '
    + JSON.stringify([iv4b && iv4b.ok, iv4b && iv4b.ruling]) + '）');
  // C5 读者②：面板真读 auditRecord（源码面 + 落点自证）
  const pn = src(PANEL);
  a(hits(pn, ANCHORS.auditRead.txt) === 1,
    'v2128/x4: [C5] 面板恰 1 处真读 `probe.auditRecord`（用户输入的案件 id 是真输入）');
  a(pn.indexOf("'；审计 线索' + au.evidence") > 0,
    'v2128/x4: [C5] 审计读数落在既有输出节点上（读了不显示 = 读者缺一半）');
  // C6 读者①的显示口在面板上（零新增控件：复用既有「调查」按钮）
  a(hits(pn, "      const rlTxt = !rl ? '裁决 问不出来（缺裁决面或缺来源等级）'") === 1,
    'v2128/x4: [C6] 面板恰 1 处显示裁决（复用既有控件）');
  a(pn.indexOf('    on(\'#wa-rm-investigate\', () => {') > 0,
    'v2128/x4: [C6] 显示口挂在既有「调查」按钮上（不新增控件 = 不碰接线守卫）');
  // C7 能力申报仍在（申报是申报，读者是读者 —— 两者都要）
  const dg = src(DIAG);
  a(dg.indexOf('hasResolve: typeof WA.probe.resolve === \'function\',') > 0
    && dg.indexOf('hasAudit: typeof WA.probe.auditRecord === \'function\',') > 0,
    'v2128/x4: [C7] 诊断的能力申报仍在（本版为它补了真读者，不是拆掉申报）');
  // C8 导出口注释**不再声称假读者**（注释声称不存在的读者 = 撒谎）
  const p = src(PROBE);
  a(hits(p, 'secProbe') === 0,
    'v2128/x4: [C8] 导出面注释不再把诊断的能力申报说成「读者」（实 ' + hits(p, 'secProbe') + ' 处）');
  a(p.indexOf('`resolve` ← `engines/rumor.js` 的 `investigate`') > 0,
    'v2128/x4: [C8] 注释如实写明读者是谁（可核对的地址，不是一句「有读者」）');
}
// ── N 面：真源码破坏 ⇒ 破坏副本上重跑同款判据 ────────────────────────
function runNegative(a) {
  const P0 = src(PROBE), R0 = src(RUMOR), N0 = src(PANEL);
  // 同款判据（正例与负控制共用同一份实现 —— 两侧不同源就会「写进去的对不上复算的」）
  const p = function (WA, x, y) {
    // 自带 catch：破坏后若把 resolve 拆成会抛的形态，异常逃逸会让**后面所有断言静默漏跑**
    //   （v2.127.0 X1 与 X3 都付过这个学费）。
    try { return WA.probe.resolve(x, y, { by: '甲' }); } catch (e) { return { ok: false, reason: 'threw:' + (e && e.message) }; }
  };
  const pCross = function (WA) { const r = p(WA, S('support', 'witness'), S('refute', 'witness')); return r.verdict || r.reason; };
  const pCorr = function (WA) { const r = p(WA, S('support', 'witness'), S('support', 'witness')); return r.verdict || r.reason; };
  const pLvl = function (WA) { const r = p(WA, S('support', 'gut'), S('refute', 'witness')); return r.reason; };
  const pDir = function (WA) { const r = p(WA, S('maybe', 'witness'), S('refute', 'witness')); return r.reason; };
  const pRuling = function (WA) {
    try {
      const c = WA.rumor.startChain('桥', '起链');
      WA.rumor.relay(c.id, { from: '甲', to: '乙', layer: 'witness' });
      WA.rumor.relay(c.id, { from: '乙', to: '丙', layer: 'hearsay', motive: 'distort', value: '桥垮了' });
      const iv = WA.rumor.investigate(c.id);
      return iv && iv.ruling ? ('v:' + iv.ruling.verdict) : ('null/ok:' + (iv && iv.ok));
    } catch (e) { return 'threw:' + (e && e.message); }
  };
  const pAbsent = function (WA) {
    // 自带 catch：异常隔离闸被拆后这一抛会逃逸出负控制段。
    try {
      WA.rumor.setSettings({ enabled: true });
      const c = WA.rumor.startChain('桥', '起链');
      const keep = WA.probe.resolve;
      WA.probe.resolve = function () { throw new Error('boom'); };
      let iv = null;
      try { iv = WA.rumor.investigate(c.id); } finally { WA.probe.resolve = keep; }
      return (iv && iv.ok === true) ? ('null:' + (iv.ruling === null)) : ('bad:' + JSON.stringify(iv && iv.ok));
    } catch (e) { return 'threw:' + (e && e.message); }
  };
  // N1 **边界③**的反证：拆掉等强闸 ⇒ 真·打脸被硬裁成某一方
  const n1 = breakOnce(P0, ANCHORS.crossTie.txt, '    } else if (false) {', 'N1');
  a(pCross(fresh(over(PROBE, n1))) !== 'undecided' && pCross(fresh()) === 'undecided',
    'v2128/x4: [N1] 拆掉等强闸 ⇒ 同强对撞被硬裁（B4 不是恒真；破坏后实 ' + pCross(fresh(over(PROBE, n1))) + '）');
  a(pCross(fresh()) === 'undecided', 'v2128/x4: [N1]（正）原版上同款判据为 undecided（两向自证）');
  // N2 **边界②**的反证：拆掉同向印证 ⇒ 印证被读成「采信某一条」
  const n2 = breakOnce(P0, ANCHORS.corroborate.txt, "        verdict = 'a'; reason = 'corroborated';", 'N2');
  a(pCorr(fresh(over(PROBE, n2))) !== 'both' && pCorr(fresh()) === 'both',
    'v2128/x4: [N2] 拆掉印证分支 ⇒ 同向等强被报成「采信一条」（B1 不是恒真；破坏后实 ' + pCorr(fresh(over(PROBE, n2))) + '）');
  // N3 **边界⑤**的反证：拆掉等级闸 ⇒ 自造等级进得来
  const n3 = breakOnce(P0, ANCHORS.badLevel.txt, 'false', 'N3');
  a(pLvl(fresh(over(PROBE, n3))) !== 'bad-level' && pLvl(fresh()) === 'bad-level',
    'v2128/x4: [N3] 拆掉等级闸 ⇒ 自造等级不被拒收（B6 不是恒真；破坏后实 ' + pLvl(fresh(over(PROBE, n3))) + '）');
  // N4 **边界⑤**的反证：拆掉方向闸 ⇒ 方向不明的线索参与裁决
  const n4 = breakOnce(P0, ANCHORS.missDir.txt, 'false', 'N4');
  a(pDir(fresh(over(PROBE, n4))) !== 'missing-direction' && pDir(fresh()) === 'missing-direction',
    'v2128/x4: [N4] 拆掉方向闸 ⇒ 方向不明也进裁决（B7 不是恒真；破坏后实 ' + pDir(fresh(over(PROBE, n4))) + '）');
  // N5 读者①的**异常隔离**被拆 ⇒ 附属面失败拖垮整条调查读数
  const n5 = breakOnce(R0, ANCHORS.catchGuard.txt, '    } catch (e) { throw e; }', 'N5');
  const absentBroken = pAbsent(fresh(over(RUMOR, n5)));
  a(absentBroken !== 'null:true' && absentBroken.indexOf('threw') === 0,
    'v2128/x4: [N5] 拆掉异常隔离 ⇒ 裁决面抛错把整条调查拖垮（C4b 不是恒真；破坏后实 ' + absentBroken + '）');
  a(pAbsent(fresh()) === 'null:true',
    'v2128/x4: [N5]（正）原版上附属面抛错只让裁决读数变 null（两向自证）');
  // N6 读者①的**等级单源反查**被拆 ⇒ 层名直传（非法等级）⇒ 裁决读数消失
  const n6 = breakOnce(R0, ANCHORS.lvEnd.txt, 'clean(c.layer, 20)', 'N6');
  a(pRuling(fresh(over(RUMOR, n6))).indexOf('null') === 0 && pRuling(fresh()).indexOf('v:') === 0,
    'v2128/x4: [N6] 拆掉单源反查后层名直传 ⇒ 裁决读数消失（C2 不是恒真；破坏后实 '
    + pRuling(fresh(over(RUMOR, n6))) + '）');
  // N7 读者②被拆 ⇒ 面板读者判据现形（源码面判，避免面板未装载时的假绿）
  const n7 = breakOnce(N0, ANCHORS.auditRead.txt, '', 'N7');
  a(n7.indexOf(ANCHORS.auditRead.txt) < 0
    && N0.indexOf(ANCHORS.auditRead.txt) > 0,
    'v2128/x4: [N7] 摘掉面板读者后该调用在破坏副本里为零、在原版里为一（C5 判据不是恒真）');
  // N8 纯度：全部负控制跑完后三个真文件逐字未变
  a(src(PROBE) === P0 && src(RUMOR) === R0 && src(PANEL) === N0,
    'v2128/x4: [N8]（纯度）全部负控制跑完后三个真文件逐字未变');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: PROBE
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X4-RESOLVE-V2128: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X4-RESOLVE-V2128: pass（' + pass + ' 项）');
}