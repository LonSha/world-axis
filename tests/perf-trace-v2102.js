#!/usr/bin/env node
// WorldAxis tests/perf-trace-v2102.js —— v2.102.0（A2 = O12 性能基线与分层增量）
//
// 【它治的病：读数看着有数，其实没有意义】
//   v2.88.0（O1）给注入链装了成本账（按源记 {ms, n}），答得出「这一轮慢在谁身上」。
//   但它答不出另外三件事，而这三件事恰恰是「优化能不能落地」的前提：
//     ① 「冷启一次要多久」——那张账是按源横切的**本轮**读数，没有「第一次 vs 已经热了」的分列；
//     ② 「变了的东西才重算」——全部源每轮重建，而「哪些源真受影响」此前无从判定；
//     ③ 「慢在哪**一类事**上」——本地计算 / 宿主 API / 序列化 / UI 渲染四类全混在一个 totalMs 里。
//   本面把这三件事做成可核对的读数。而本锁治的是**本面自己**最容易犯的四种病——
//   它们的共同症状是「读数看着有数」：
//     · 拿**产物真假**判「模块在不在」（空串被读成「模块不在」）；
//     · 拿**带计时的整行**判「缓存值对不对」（两次毫秒数必然不同 ⇒ 判据恒假 ⇒ 永远报「不一致」）；
//     · 让「缺席」也记一笔 0ms（该层的 P50 被「没跑」稀释成「很快」）；
//     · 拿「缓存 vs 缓存」判一致性（自指的恒真判据，验不出任何东西）。
//   四条都在本版开工时**实测**抓到并修掉（文件头有逐条自纠说明），本锁把它们逐条钉住。
//
// 【口径（全是否定式）】
//   ① **纯内存观测**：不写存档、不落盘、不隐式写盘。判据钉**存档**而不是钉 `stat`——
//      `stat`（进程计数）会被懒初始化推高，那是本面实测到的一条事实（取证不得改变被取证对象）。
//   ② **指纹不可读（na）一律重算**：绝不拿旧值冒充命中（一次「算失败」不许以下一次命中的样子发出去）。
//   ③ **复用值必须等于现算值**：判据比的是**独立再算一遍**的那份，不是缓存里那份（否则自指、恒真）。
//   ④ **缺席不记样本、不编 0ms**：缺席由行的 `absent` 计数，不靠一笔假样本留下来。
//   ⑤ **「缓存过期」与「被观测面自己不可复现」分列**：前者是本面的缺陷，后者是**面**的性质
//      （实测第一例：`tool-diag.collect()` 的产物带 `collectedAt` 时间戳 ⇒ 它本来就每遍都不同）。
//      把两者压成一个读数，等于把「去修缓存」和「这面本来就不会命中」说成同一句话。
//   ⑥ **lowend 档不许冒充真机**：它是**同机放大估计**，定义里就写着 `approx:true` 与「真机读数须实机」。
//
// 【判据】
//   A 静态面：perfTrace 登记为必载 / 诊断节在位 / 面板两枚真消费方（足量） / 守卫登记
//             / 装载位（run.js 的 LOAD 与 index.js 的 LOAD_ORDER 都在 tool-diag 之后） / 零 npm 依赖
//   B 运行时面：J1 封闭集合与标签齐备 / J2 有界窗口与分位数 / J3 指纹确定性 / J4 复用与 force
//     J5 失败诚实（不写缓存、不返回旧值） / J6 槽位计数 / J7 只读出口 / J8 面可用性判「装配」
//     J9 缺席不记样本 / J10 冷启写缓存、热启真命中 / J11 冷启自洽 / J12 冷/热分歧分诊
//     J13 计数从 0 起算 / J14 汇总面跟随现场 / J15 耗时分列 / J16 档位定义 / J17 基准与基准全档
//   C 不变式：全量出口零落盘 + 三个封闭集合 + 两个有界窗口 + 冷/热同一次调用自洽
//   N1–N24 负控制：真源码破坏 ⇒ 装载破坏副本 ⇒ 在副本上重跑**同款**真判据（逐锚）
//   N25 判据纯度：每条锚点字面量在本文件只出现一次
//
// 【为什么静态面判据不做负控制】
//   同 v2.100.0 / v2.101.0 口径：面板与诊断的「消费方在位」判据读的是**真文件**，而负控制的破坏
//   写在临时副本（srcOverride）上，读真文件的判据在破坏副本面前照样绿 —— 那是假绿。
//   这类「导出有没有人用」由 tests/dead-export-gate.js 兜（它是全仓面的），本锁只做在位核对。
//
// 【一条不改的事（留档）】
//   `engines/interop.js` 的 `freeze().diagSections` 是**三伙伴的冻结节键**（8 个），
//   语义是「外部读者认这些字符串」，不是「诊断包的目录」。故本面新增 `perfTrace` 节
//   **不**并入那张表（否则等于把「协议面」当成「目录面」，冻结表的含义会被稀释）。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const PF = 'engines/perf-trace.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const RUNJS = 'tests/run.js', INDEX = 'index.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自恰中 1 次）══════════════
const ANCHORS = {
  // 口径① 层封闭集合写死（顺序也在内：面板与诊断按此序念出，不随装载顺序漂）
  LAYER_SET: { rel: PF, txt: "  const LAYERS = ['inject', 'diagnose', 'canonAlign', 'worldState'];" },
  // 口径① 历史窗口有界（64）
  CAP_BOUND: { rel: PF, txt: '  const HISTORY_CAP = 64;' },
  // 口径② 指纹不可读 ⇒ 一律重算（此处是「不可读」的判定本身）
  FP_NA: { rel: PF, txt: "      if (!WA.timeline || typeof WA.timeline.hashText !== 'function') return 'na';" },
  // 口径② 命中条件（脏集干净 + 指纹相同 + 非 force）
  ENSURE_HIT: { rel: PF, txt: '    if (cur && !o.force && okStamp && cur.fp === f) {' },
  // 口径② produce 失败 ⇒ ok:false 且不写缓存
  ENSURE_FAIL: { rel: PF, txt: "      return { layer: L, key: K, ok: false, hit: false, recomputed: true, error: err, fp: f, vfp: '', reason: 'produce-failed' };" },
  // 口径③ 写缓存时命中计数从 0 起算（不是编出来的数）
  ENSURE_WRITE: { rel: PF, txt: '    slot[K] = { fp: f, vfp: vfp, value: v, at: clockWall(), hits: 0, stale: (cur ? (cur.stale || 0) : 0) };' },
  // 口径① 历史曲线只留数字（环形有界：进样本）
  RING_PUSH: { rel: PF, txt: '    s.ring.push(x);' },
  // 口径① 挤出要计数（不许静默丢）
  RING_EVICT: { rel: PF, txt: '    if (s.ring.length > HISTORY_CAP) { s.ring.shift(); s.dropped++; }' },
  // 口径④ 「面可用」判的是**装配**（模块与出口在不在），不是产物真假
  FACEAVAIL: { rel: PF, txt: '    try { return !!d.ready(); } catch (e) { return false; }' },
  // 口径④ 缺席不记样本（记了就等于替缺席编 0ms）
  ABSENT_NO_SAMPLE: { rel: PF, txt: "    if (!faceAvail(d)) return { face: d.key, layer: d.layer, ok: false, absent: true, reason: 'module-absent', ms: 0, fp: '', bytes: 0 };" },
  // 口径③ 冷启真跑**并写缓存**（不写 ⇒ 紧跟着的热启复用率恒 0，读数被读成「缓存没用」）
  COLD_WRITES_CACHE: { rel: PF, txt: "      const r = ensure(d.layer, 'startup:' + d.key, function () { return runFace(d, scope); }, { dirty: true, force: true });" },
  // 口径④ 冷启的缺席数如实（不许写死 0）
  COLD_ABSENT_SELF: { rel: PF, txt: '      cold: rows.filter(function (x) { return x.ok; }).length, absent: rows.filter(function (x) { return x.absent; }).length,' },
  // 口径③ 一致性比的是**产物指纹**，不是带计时的整行
  WARM_FP_COMPARE: { rel: PF, txt: '        const same = (!!again.fp && again.fp === v.fp);' },
  // 口径③⑤ 分诊方向：两遍现算一致 ⇒ 缓存过期；不一致 ⇒ 面自己不可复现
  WARM_VERDICT: { rel: PF, txt: "          row.check.verdict = (!!third.fp && third.fp === again.fp) ? 'stale' : 'volatile';" },
  // 口径⑤ 两种分歧**分列**（不是压成一个 consistent:false）
  WARM_STALE_SPLIT: { rel: PF, txt: '      stale: stale.map(function (x) { return x.face; }), volatile: volatileRows.map(function (x) { return x.face; }),' },
  // 口径③ 第三步必须**真算**（走了缓存 ⇒ 与缓存里那份当然一样 ⇒ 判据假绿）
  CWC_AGAIN_FORCE: { rel: PF, txt: '    const again = ensure(layer, key, produce, { force: true, stamp: stamp });' },
  // 口径① 计量「没发生过的事不许有数」
  STAT_DECLARED: { rel: PF, txt: '      evicted: _stat.evicted, forced: _stat.forced, dirtyHit: _stat.dirtyHit,' },
  // 口径① 汇总文本与现场同源（不是一份写死的文案）
  SUMMARY_HEAD: { rel: PF, txt: '      const s = split();' },
  // 口径① 未知分列如实拒收，并把可选项报出来
  NOTE_SPAN_GUARD: { rel: PF, txt: "    if (SPANS.indexOf(S) < 0) return { ok: false, reason: 'unknown-span', known: SPANS.slice() };" },
  // 口径⑥ lowend 档必须标 approx（不许冒充真机读数）
  CLASS_LOWEND: { rel: PF, txt: "    lowend: { repeats: 3, budget: 2000, approx: true, note: '低端移动设备（同机放大估计，真机读数须实机）' }" },
  // 口径① 非法层/键的标记如实拒收（且不计数）
  MARK_LAYER_GUARD: { rel: PF, txt: "    if (!L || !K || !inLayers(L)) return { layer: L, key: K, fp: 'na', changed: true, first: true, ok: false, reason: 'bad-layer-or-key' };" },
  // 口径① 每层指纹键有界（挤出要计数，否则 cap 是个没人核对的常量）
  FPRINT_CAP_EVICT: { rel: PF, txt: '    if (ks.length > FINGERPRINT_CAP) { delete slot[ks[0]]; _stat.evicted++; }' },
  // 口径① 未知档位如实拒收（不许「默认当成 short」跑一遍再把数字报出去）
  BENCH_UNKNOWN: { rel: PF, txt: "    if (!def) return { ok: false, reason: 'unknown-class', known: CLASSES.slice() };" },
  // 口径⑦ 增量的输入是**真生产者**（世界步进），不是常数、也不是「上一次的读数」
  //   锚点取**整个 return 行**（含 rev/seq/at/value 四处）——首版只取 `value` 那一行，
  //   破坏后顶层 `rev` 仍取 `m.stateRev`、指纹照样随世界变 ⇒ 破坏**打不中判据**
  //   （负控制必须以「破坏后判据真现形」为准，不是「破坏后源码变了」为准）。
  //   字符串用双引号包：锚点文本本身含单引号，用单引号包会让锁源码里的字面量与 txt 逐字不符。
  WORLDREV_SRC: { rel: PF, txt: "      return { ok: true, kind: 'world-step', rev: m.stateRev, seq: value.seq, at: value.at, value: value };" },
  // 口径⑦ 输入读不出来 ⇒ **一律重算**（不许拿上一轮的值冒充）
  PARTIAL_UNREADABLE: { rel: PF, txt: '        inp.ok ? { rev: inp } : { force: true });' }
};
const BREAK = {
  LAYER_SET: "  const LAYERS = ['inject', 'diagnose', 'canonAlign', 'worldState', 'ghost'];",
  CAP_BOUND: '  const HISTORY_CAP = 8;',
  FP_NA: "      return 'na';",
  ENSURE_HIT: '    if (false) {',
  ENSURE_FAIL: "      return { layer: L, key: K, ok: true, hit: false, recomputed: true, error: err, fp: f, vfp: 'x', reason: 'forced' };",
  ENSURE_WRITE: '    slot[K] = { fp: f, vfp: vfp, value: v, at: clockWall(), hits: 99, stale: (cur ? (cur.stale || 0) : 0) };',
  RING_PUSH: '    if (false) s.ring.push(x);',
  RING_EVICT: '    if (false) { s.ring.shift(); s.dropped++; }',
  FACEAVAIL: '    try { return false; } catch (e) { return false; }',
  ABSENT_NO_SAMPLE: "    if (!faceAvail(d)) { record(d.layer, 0); return { face: d.key, layer: d.layer, ok: false, absent: true, reason: 'module-absent', ms: 0, fp: '', bytes: 0 }; }",
  COLD_WRITES_CACHE: "      const r = ensure(d.layer, 'startup:' + d.key, function () { return runFace(d, scope); }, { force: true });",
  COLD_ABSENT_SELF: '      cold: rows.filter(function (x) { return x.ok; }).length, absent: 0,',
  WARM_FP_COMPARE: '        const same = sameValue(v, again);',
  WARM_VERDICT: "          row.check.verdict = (!!third.fp && third.fp === again.fp) ? 'volatile' : 'stale';",
  WARM_STALE_SPLIT: '      stale: [], volatile: [],',
  CWC_AGAIN_FORCE: '    const again = ensure(layer, key, produce, { stamp: stamp });',
  STAT_DECLARED: '      evicted: 999,',
  SUMMARY_HEAD: '      const s = { localMs: 0 };',
  NOTE_SPAN_GUARD: "    if (false) return { ok: false, reason: 'unknown-span', known: SPANS.slice() };",
  CLASS_LOWEND: "    lowend: { repeats: 3, budget: 2000, approx: false, note: '低端移动设备（同机放大估计，真机读数须实机）' }",
  MARK_LAYER_GUARD: "    if (!L || !K) return { layer: L, key: K, fp: 'na', changed: true, first: true, ok: false, reason: 'bad-layer-or-key' };",
  FPRINT_CAP_EVICT: '    if (false) { delete slot[ks[0]]; _stat.evicted++; }',
  BENCH_UNKNOWN: "    if (!def) return { ok: true, reason: 'unknown-class', known: CLASSES.slice() };",
  // 破坏①：输入换成**常数**（那正是「增量只活在测试里」的原始形态：没人真读输入）。
  //   覆盖整条 return ⇒ 判据里 p2/p3/p4 的 `p.rev` 恒为 0 而世界步进不为 0 ⇒ 立即现形。
  WORLDREV_SRC: "      return { ok: true, kind: 'world-step', rev: 0, seq: 0, at: 0, value: { rev: 0, seq: 0, at: 0 } };",
  // 破坏②：读不出来也照样按指纹走（= 拿上一轮的值冒充命中）
  PARTIAL_UNREADABLE: '        { rev: inp });'
};
function breakOne(key) {
  const A = ANCHORS[key];
  const s = src(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}
// ══════════════ 运行时装置 ══════════════
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  return H;
}
const MEMBERS = ['LAYERS', 'LAYER_LABEL', 'SPANS', 'CLASSES', 'CLASS_DEF', 'HISTORY_CAP', 'FINGERPRINT_CAP',
  'fingerprint', 'mark', 'dirtyOf', 'dirtyAll', 'consume', 'ensure', 'slots', 'coldWarmCheck',
  'coldStart', 'warmStart', 'bench', 'benchAll', 'baseline', 'curve', 'curveAll',
  'noteSpan', 'split', 'partial', 'stat', 'summaryText'];
// ══════════════ 同款真判据 ══════════════
/** J1 三个封闭集合恰为预期 + 标签与档位定义齐备（少一个 ⇒ 面板上出现空白行而不是报错）。 */
function jLayers(W) {
  try {
    const P = W.perfTrace;
    if (!P) return false;
    if (P.LAYERS.length !== 4 || P.SPANS.length !== 4 || P.CLASSES.length !== 4) return false;
    if (!['inject', 'diagnose', 'canonAlign', 'worldState'].every(function (k) { return P.LAYERS.indexOf(k) >= 0; })) return false;
    if (!['local', 'host', 'serialize', 'render'].every(function (k) { return P.SPANS.indexOf(k) >= 0; })) return false;
    if (!['short', 'medium', 'long', 'lowend'].every(function (k) { return P.CLASSES.indexOf(k) >= 0; })) return false;
    if (!P.LAYERS.every(function (L) { return typeof P.LAYER_LABEL[L] === 'string' && P.LAYER_LABEL[L].length > 0; })) return false;
    return P.CLASSES.every(function (c) {
      const d = P.CLASS_DEF[c];
      return !!d && typeof d.repeats === 'number' && d.repeats > 0
        && typeof d.budget === 'number' && d.budget > 0
        && typeof d.note === 'string' && d.note.length > 0 && typeof d.approx === 'boolean';
    });
  } catch (e) { return false; }
}
/** J2 有界窗口：P50 ≤ P95 ≤ 峰值、subTick 在界内、超窗必挤出且计数。 */
function jCaps(W) {
  try {
    const P = W.perfTrace;
    if (P.HISTORY_CAP !== 64 || P.FINGERPRINT_CAP !== 256) return false;
    for (let i = 0; i < 9; i++) P.coldStart();          // 每趟 4 面各记一笔 ⇒ inject 9 笔
    const b = P.baseline('inject');
    if (b.n !== 9 || b.window !== 9 || b.dropped !== 0) return false;
    if (!(b.p50 <= b.p95 && b.p95 <= b.max && b.min <= b.p50)) return false;
    if (typeof b.subTick !== 'number' || b.subTick < 0 || b.subTick > b.window) return false;
    if (P.curve('inject').series.length !== 9 || P.curve('inject').cap !== P.HISTORY_CAP) return false;
    if (P.curveAll().inject.series.length !== 9) return false;
    for (let i = 0; i < 61; i++) P.coldStart();          // 累计 70 笔 > 64
    const b2 = P.baseline('inject');
    return b2.n === 70 && b2.window === P.HISTORY_CAP && b2.dropped === 70 - P.HISTORY_CAP;
  } catch (e) { return false; }
}
/** J3 指纹确定性（同一份输入同一份输出）+ 口径②「不可读 ⇒ 一律重算」。 */
function jFpConsistency(W) {
  try {
    const P = W.perfTrace;
    const f1 = P.fingerprint({ a: [1, 2], b: 'x' });
    const f2 = P.fingerprint({ a: [1, 2], b: 'x' });
    if (typeof f1 !== 'string' || !f1 || f1 === 'na') return false;
    if (f1 !== f2) return false;
    if (P.fingerprint({ a: [1, 2], b: 'y' }) === f1) return false;
    if (P.fingerprint('abc') !== P.fingerprint('abc')) return false;
    if (P.fingerprint('abc') === P.fingerprint('abd')) return false;
    // 指纹不可读 ⇒ 不许命中缓存（否则就是拿旧值冒充命中）。
    //   破坏文本**取常驻锚点**、不在这里重写一遍字面量——那正是 H5 禁的自指
    //   （判据自己引用锚点串 ⇒ 「锚点字面量只出现一次」这条纯度判据会被自己破坏）。
    const H = env({ [PF]: src(PF).replace(ANCHORS.FP_NA.txt, BREAK.FP_NA) });
    const Q = H.WA.perfTrace;
    if (!Q) return false;
    Q.ensure('inject', 'na1', function () { return { v: 'A' }; }, { stamp: 's1' });
    const r2 = Q.ensure('inject', 'na1', function () { return { v: 'B' }; }, { stamp: 's1' });
    return r2.hit === false && r2.recomputed === true && !!r2.value && r2.value.v === 'B';
  } catch (e) { return false; }
}
/** J4 复用语义：脏集干净才命中、force 一律不命中、冷/热三步的动作与值都对。 */
function jReuse(W) {
  try {
    const P = W.perfTrace;
    const s0 = P.stat().reuse;
    const r1 = P.ensure('inject', 'c1', function () { return { n: 'A' }; }, { dirty: true });
    if (r1.hit !== false || r1.recomputed !== true) return false;
    const r2 = P.ensure('inject', 'c1', function () { return { n: 'B' }; }, { dirty: true });
    if (r2.hit !== true || !r2.value || r2.value.n !== 'A') return false;   // 命中返旧值（produce 不该跑）
    if (P.stat().reuse !== s0 + 1) return false;
    const r3 = P.ensure('inject', 'c1', function () { return { n: 'C' }; }, { dirty: true, force: true });
    if (r3.hit !== false || r3.value.n !== 'C') return false;               // force 一律不命中
    P.mark('inject', 'evt', 'v1');
    const r4 = P.ensure('inject', 'c1', function () { return { n: 'D' }; }, { dirty: true });
    if (r4.hit !== false || r4.value.n !== 'D') return false;               // 一有脏键 ⇒ 该层不命中
    const cwc = P.coldWarmCheck('inject', 'cwc1', function () { return { t: 7 }; }, { t: 7 });
    return cwc.okAll === true && cwc.warmReused === true && cwc.coldRecomputed === true
      && cwc.againRecomputed === true && cwc.cachedMatchesFresh === true && cwc.sameFields === true;
  } catch (e) { return false; }
}
/** J5 失败诚实：ok:false / 无 value / 计量涨 / 旧值仍在缓存里。 */
function jFailHonest(W) {
  try {
    const P = W.perfTrace;
    P.ensure('inject', 'f1', function () { return { v: 'ok' }; }, { stamp: 's' });
    const m0 = P.stat().miss;
    const bad = P.ensure('inject', 'f1', function () { throw new Error('boom'); }, { stamp: 's', force: true });
    if (bad.ok !== false || bad.value !== undefined || bad.recomputed !== true) return false;
    if (bad.reason !== 'produce-failed') return false;
    if (P.stat().miss !== m0 + 1) return false;
    const back = P.ensure('inject', 'f1', function () { return { v: 'ok2' }; }, { stamp: 's' });
    return back.hit === true && back.value.v === 'ok';        // 失败不写缓存 ⇒ 旧值还在，且没被当成新值发出去
  } catch (e) { return false; }
}
/** J6 槽位读数：命中计数从 0 起算、失败的槽不进表。 */
function jSlots(W) {
  try {
    const P = W.perfTrace;
    P.ensure('inject', 's1', function () { return { a: 1 }; }, { stamp: 's1' });
    let sl = P.slots('inject');
    if (sl.length !== 1 || sl[0].key !== 's1' || sl[0].hits !== 0 || sl[0].stale !== 0) return false;
    if (typeof sl[0].vfp !== 'string' || !sl[0].vfp) return false;
    P.ensure('inject', 's1', function () { return { a: 1 }; }, { stamp: 's1' });
    sl = P.slots('inject');
    if (sl[0].hits !== 1) return false;
    P.ensure('inject', 's2', function () { throw new Error('x'); }, { stamp: 's2', force: true });
    const sl2 = P.slots('inject').filter(function (x) { return x.key === 's2'; })[0];
    return !sl2;
  } catch (e) { return false; }
}
/** J7 只读出口：全量出口跑完后**存档逐字不变**；诊断节读得到。 */
function jReadonly(W) {
  try {
    const P = W.perfTrace;
    const before = JSON.stringify(W.store.get());
    W.render.visibilityStat();
    W.canon.alignView();
    W.render.buildWorldSnapshot();
    P.coldStart(); P.warmStart(); P.benchAll(); P.curveAll();
    P.dirtyAll(); P.slots('inject'); P.summaryText(); P.stat(); P.split();
    P.noteSpan('render', 3);
    P.coldWarmCheck('inject', 'ro', function () { return { a: 1 }; }, { a: 1 });
    const dg = W.toolDiag.collect();
    const hasSec = !!dg && Object.prototype.hasOwnProperty.call(dg, 'perfTrace');
    const secOk = !!dg.perfTrace && !!dg.perfTrace.stat && !!dg.perfTrace.split && !!dg.perfTrace.layers;
    return before === JSON.stringify(W.store.get()) && hasSec && secOk;
  } catch (e) { return false; }
}
/** J8 面可用性判的是**装配**（模块与出口在不在），不是产物真假。 */
function jReady(W) {
  try {
    const P = W.perfTrace;
    const c = P.coldStart();
    if (c.cold !== 4 || c.absent !== 0) return false;
    delete W.toolDiag;
    const c2 = P.coldStart();
    if (c2.cold !== 3 || c2.absent !== 1) return false;
    const row = c2.rows.filter(function (x) { return x.face === 'diagnose'; })[0];
    if (!row || row.absent !== true || row.reason !== 'module-absent') return false;
    delete W.canon;
    const c3 = P.coldStart();
    return c3.cold === 2 && c3.absent === 2;
  } catch (e) { return false; }
}
/** J9 缺席**不记样本**（记了就等于替缺席编 0ms，P50 被稀释成「很快」）。 */
function jAbsentNoSample(W) {
  try {
    const P = W.perfTrace;
    delete W.toolDiag; delete W.canon;
    const c = P.coldStart();
    if (c.absent < 2) return false;
    if (P.baseline('diagnose').n !== 0 || P.baseline('canonAlign').n !== 0) return false;
    if (P.baseline('inject').n !== 1 || P.baseline('worldState').n !== 1) return false;
    return true;
  } catch (e) { return false; }
}
/** J10 冷启真跑**并写缓存** ⇒ 紧随其后的热启真命中；分歧分诊如实（口径⑤）。 */
function jColdWarm(W) {
  try {
    const P = W.perfTrace;
    const c = P.coldStart();
    if (c.reused !== 0 || c.recomputed !== 4 || c.consistent !== null) return false;
    const w = P.warmStart();
    if (w.reused < 3) return false;
    if (w.checked < 3) return false;
    const agree = w.rows.filter(function (x) { return x.check.verdict === 'agree'; });
    if (agree.length < 3) return false;
    if ((w.stale || []).length !== 0) return false;                 // 缓存不许过期
    // 已知唯一不可复现的面：诊断包带 collectedAt 时间戳 ⇒ 必须如实标成 volatile 而不是赖给缓存
    if ((w.volatile || []).indexOf('diagnose') < 0) return false;
    return w.consistentNote.indexOf('diagnose') >= 0;
  } catch (e) { return false; }
}
/** J11 冷启自洽：reused 0 / consistent null（没有第二份可比的东西）+ 缺席数如实。 */
function jColdSelfConsistent(W) {
  try {
    const P = W.perfTrace;
    const c = P.coldStart();
    if (c.reused !== 0 || c.recomputed !== 4 || c.consistent !== null) return false;
    if (c.cold !== 4 || c.absent !== 0) return false;
    delete W.toolDiag;
    const c2 = P.coldStart();
    if (c2.absent !== 1 || c2.cold !== 3) return false;
    return c2.rows.filter(function (x) { return x.absent; }).length === 1;
  } catch (e) { return false; }
}
/** J12 冷/热分歧分诊：每算必变的产物 ⇒ volatile（不赖缓存）；稳定产物 ⇒ agree（不是「永远不一致」）。 */
function jWarmSplit(W) {
  try {
    const P = W.perfTrace;
    const d0 = W.render.buildWorldSnapshot;
    let nonce = 0, k = 0;
    const busy = function () { const t = Date.now(); while (Date.now() - t < 3) { /* 让两次调用耗时不同 */ } };
    W.render.buildWorldSnapshot = function () { k++; if (k % 2 === 0) busy(); nonce++; return 'snap#' + nonce; };
    P.coldStart(); P.warmStart();
    const w = P.warmStart();
    const row = w.rows.filter(function (x) { return x.face === 'worldState'; })[0];
    if (!row || row.hit !== true || row.check.same !== false) return false;
    if (row.check.verdict !== 'volatile') return false;
    if ((w.stale || []).indexOf('worldState') >= 0) return false;
    if ((w.volatile || []).indexOf('worldState') < 0) return false;
    W.render.buildWorldSnapshot = function () { k++; if (k % 2 === 0) busy(); return 'stable-snap'; };
    P.coldStart(); P.warmStart();
    const w2 = P.warmStart();
    const row2 = w2.rows.filter(function (x) { return x.face === 'worldState'; })[0];
    W.render.buildWorldSnapshot = d0;
    return !!row2 && row2.hit === true && row2.check.same === true && row2.check.verdict === 'agree';
  } catch (e) { return false; }
}
/** J13 三步判据（coldWarmCheck）：恒变的 produce ⇒ 缓存值必然 ≠ 现算值；稳定的 ⇒ 三条路一致。 */
function jCwcSelfRef(W) {
  try {
    const P = W.perfTrace;
    let n = 0;
    const t = P.coldWarmCheck('inject', 'sr', function () { n++; return { t: n }; }, { k: 1 });
    if (t.coldRecomputed !== true || t.againRecomputed !== true) return false;
    if (t.warmReused !== true) return false;
    if (t.cachedMatchesFresh !== false || t.sameFields !== false) return false;
    const q = P.coldWarmCheck('inject', 'sr2', function () { return { t: 'stable' }; }, { k: 2 });
    return q.cachedMatchesFresh === true && q.sameFields === true && q.againRecomputed === true;
  } catch (e) { return false; }
}
/** J14 计数从 0 起算、非法标记不计数、脏集消费语义。 */
function jStat(W) {
  try {
    const P = W.perfTrace;
    const s = P.stat();
    if (s.evicted !== 0 || s.forced !== 0 || s.miss !== 0 || s.reuse !== 0 || s.calls !== 0) return false;
    if (s.layers !== 4 || s.faces !== 4) return false;
    if (s.historyCap !== P.HISTORY_CAP || s.fingerprintCap !== P.FINGERPRINT_CAP) return false;
    if (typeof s.lastErr !== 'string') return false;
    if (P.mark('ghost', 'k', 1).ok !== false) return false;
    if (P.stat().marks !== 0) return false;                       // 非法层不得计入
    if (P.mark('inject', 'k', 'v').ok !== true) return false;
    if (P.stat().marks !== 1) return false;
    if (P.dirtyAll().inject.indexOf('k') < 0 || P.dirtyOf('inject').indexOf('k') < 0) return false;
    if (P.consume('inject').join(',') !== 'k') return false;
    if (P.dirtyAll().inject.length !== 0 || P.stat().dirty !== 0) return false;
    return P.consume('inject').length === 0;
  } catch (e) { return false; }
}
/** J15 汇总面与现场同源（跑一轮后文本必须跟着动，不许是写死的文案）。 */
function jSummary(W) {
  try {
    const P = W.perfTrace;
    const t0 = P.summaryText();
    if (typeof t0 !== 'string' || !t0.length) return false;
    if (t0.indexOf('undefined') >= 0 || t0.indexOf('NaN') >= 0) return false;
    if (t0.indexOf('注入面 P50') < 0 || t0.indexOf('重算 0') < 0) return false;
    P.coldStart();
    if (P.summaryText().indexOf('重算 4') < 0) return false;
    return true;
  } catch (e) { return false; }
}
/** J16 耗时分列：local/serialize 可自量，host/render 未上报即如实说「未上报」（不写成 0）。 */
function jSpan(W) {
  try {
    const P = W.perfTrace;
    const s0 = P.split();
    if (s0.declared.host !== false || s0.declared.render !== false) return false;
    if (s0.undeclared.join(',') !== 'host,render') return false;
    if (s0.total !== Math.round((s0.localMs + s0.hostMs + s0.serializeMs + s0.renderMs) * 100) / 100) return false;
    const bad = P.noteSpan('nope', 1);
    if (bad.ok !== false || bad.reason !== 'unknown-span') return false;
    if (bad.known.join(',') !== 'local,host,serialize,render') return false;
    if (P.noteSpan('local', 2).ok !== true) return false;
    if (P.noteSpan('render', 3).ok !== true) return false;
    const s1 = P.split();
    if (s1.declared.host !== false || s1.declared.render !== true) return false;
    if (s1.undeclared.join(',') !== 'host') return false;
    return s1.localMs >= 2 && s1.renderMs === 3;
  } catch (e) { return false; }
}
/** J17 四类基准定义：重复次数与预算逐档递增、lowend 标 approx 并写明边界。 */
function jClasses(W) {
  try {
    const P = W.perfTrace;
    const d = P.CLASS_DEF;
    if (Object.keys(d).sort().join(',') !== 'long,lowend,medium,short') return false;
    if (d.lowend.approx !== true) return false;
    if (d.short.approx !== false || d.medium.approx !== false || d.long.approx !== false) return false;
    if (!(d.short.repeats < d.medium.repeats && d.medium.repeats < d.long.repeats)) return false;
    if (!(d.short.budget < d.medium.budget && d.medium.budget < d.long.budget)) return false;
    return d.lowend.note.indexOf('实机') >= 0;
  } catch (e) { return false; }
}
/** J18 基准：未知档位如实拒收、缺席档不编耗时、repeats 真被执行。 */
function jBench(W) {
  try {
    const P = W.perfTrace;
    const bad = P.bench('nope');
    if (bad.ok !== false || bad.reason !== 'unknown-class') return false;
    if (bad.known.join(',') !== P.CLASSES.join(',')) return false;
    const d0 = W.render.visibilityStat;
    W.render.visibilityStat = function () { return { sources: 0 }; };
    const r = P.bench('short');
    W.render.visibilityStat = d0;
    if (r.ok !== true || r.cls !== 'short' || r.repeats !== 1 || r.approx !== false) return false;
    if (r.rows.length !== 4) return false;
    const inj = r.rows.filter(function (x) { return x.face === 'inject'; })[0];
    if (!inj || inj.runs !== 1 || inj.ok !== true) return false;
    //   注意：这里**不**断言 `inj.ms === 0`。踩过一次真坑——`wallNow()` 底子是
    //   `Date.now()`（1ms 精度），单次调用绝大多数落在同一个 tick 里读数确实为 0，
    //   但在满载机器上（全套回归跑到这一段时正是如此）偶尔恰好跨过边界 ⇒ 断言抖动。
    //   「真很快」与「只有 1ms 精度」由读数里的 `subTick` 表达，不该由一条精确断言承担。
    if (typeof inj.ms !== 'number' || inj.ms < 0) return false;
    delete W.toolDiag;
    const r2 = P.bench('short');
    const dg = r2.rows.filter(function (x) { return x.face === 'diagnose'; })[0];
    if (!dg || dg.absent !== 1 || dg.ms !== 0 || dg.runs !== 1) return false;
    return typeof r2.totalMs === 'number';
  } catch (e) { return false; }
}
/** J19 基准全档：四档齐全、逐档 repeats 真被尊重、历史窗口累积（1+3+6+3 = 13 趟）。 */
function jBenchAll(W) {
  try {
    const P = W.perfTrace;
    const all = P.benchAll();
    if (Object.keys(all).sort().join(',') !== 'long,lowend,medium,short') return false;
    if (all.lowend.approx !== true || all.short.approx !== false) return false;
    if (all.short.repeats !== 1 || all.medium.repeats !== 3 || all.long.repeats !== 6 || all.lowend.repeats !== 3) return false;
    if (!all.long.baselines || typeof all.long.baselines.inject.p50 !== 'number') return false;
    const c = P.curveAll();
    if (Object.keys(c).sort().join(',') !== 'canonAlign,diagnose,inject,worldState') return false;
    return c.inject.n === 13;
  } catch (e) { return false; }
}
/**
 * J21 增量**真成立**（口径⑦的正向判据）：增量的输入是**真生产者**（世界步进），
 *   不是常数、也不是「上一次的读数」。分四步把这件事钉住：
 *     ① 未落盘（无 `stateRev`）⇒ 输入判不出来 ⇒ **全重算**（不许拿上一轮的值冒充）；
 *     ② 落一次盘 ⇒ 首轮仍全重算（该层还没有槽）；
 *     ③ **同一世界步进**再读一次 ⇒ 全复用、一次活都不干（这就是「增量」的读数）；
 *     ④ 世界再前进一步 ⇒ 输入变了 ⇒ **全重算**（不许因为「上次算过」就跳过）。
 *   判据是**两向**的：只测③会漏掉「把输入写成常数」（那会让④也复用 = 永远不重算）；
 *   只测④会漏掉「根本不复用」（那让③失败）。两向都在，判据才谈不上「恒真」或「恒假」。
 */
function jPartial(W) {
  try {
    const P = W.perfTrace;
    const m = W.store.get().meta;
    const had = m.stateRev;
    // ① 输入不可读（用「内存态没有 stateRev」表达——与「世界从未落过盘」是**同一形态**）。
    //   为什么不真去造「未落过盘」：存档**跨实例持久**，上一次运行的残留会让那一步
    //   不可复现（本版实测抓到的顺序依赖）。本步要考的只是：没有 stateRev 时归
    //   `unversioned`、且调用方**全重算**。
    delete m.stateRev;
    const p1 = P.partial();
    if (had === undefined) delete m.stateRev; else m.stateRev = had;   // 探针自己改的内存，自己还原
    if (p1.revOk !== false || p1.revKind !== 'unversioned') return false;
    if (p1.reused !== 0 || p1.recomputed !== 4 || p1.reusedFaces.length !== 0) return false;
    // ② 落盘一次 ⇒ 有世界步进；该层还没有槽 ⇒ 仍全重算
    W.store.transact(function (d) { d.__jp = { n: 1 }; }, 'perf-trace:j21');
    const r1 = W.store.get().meta.stateRev;
    const p2 = P.partial();
    if (p2.revOk !== true || p2.rev !== r1 || p2.revKind !== 'world-step') return false;
    if (p2.reused !== 0 || p2.recomputed !== 4) return false;
    // ③ **同一世界步进**重复读取 ⇒ 全复用、一次活都不干（这就是「增量」的读数）
    const p3 = P.partial();
    if (p3.rev !== r1 || p3.reused !== 4 || p3.recomputed !== 0) return false;
    if (p3.reusedFaces.length !== 4 || p3.recomputedFaces.length !== 0) return false;
    if (!p3.rows.every(function (r) { return r.hit === true && r.ms === 0 && r.inputOk === true; })) return false;
    // ④ 世界再前进一步 ⇒ 输入变了 ⇒ **全重算**（不许因为「上次算过」就跳过）
    W.store.transact(function (d) { d.__jp.n = 2; }, 'perf-trace:j21b');
    const r2 = W.store.get().meta.stateRev;
    const p4 = P.partial();
    if (p4.rev !== r2 || p4.reused !== 0 || p4.recomputed !== 4) return false;
    if (p4.rows.some(function (r) { return r.inputRev !== r2; })) return false;
    // ⑤ 增量计数跟着动（不是没人核对的常量）；顺手清掉本探针自己的痕迹（不留手指印）
    W.store.transact(function (d) { delete d.__jp; }, 'perf-trace:j21-clean');
    const s = P.stat();
    return s.partialCalls >= 4 && s.partialReused >= 4 && s.rev.ok === true;
  } catch (e) { return false; }
}
/**
 * J22 增量的输入**读不出来时一律重算**（口径⑦的负向半边）。
 *   把 store 摘掉 ⇒ `worldRev()` 归 `store-absent` ⇒ 每一面都必须重算；
 *   若在这里复用了，那就是「拿上一轮的值冒充命中」——与本面口径②同款的病。
 *   ⚠ 必须**连读两次**：第一次因为「输入判不出来」走 `force` 顺手写了槽，
 *     第二次才是真考验（槽已在、输入仍不可读）——只读一次时，
 *     「读不出来也照样按指纹走」这个破坏照样全重算，判据抓不到它（本版实测抓到的假绿）。
 *   同时校验：缺席数如实（摘掉 toolDiag 后该面 `absent` 而不是「复用」）。
 */
function jPartialUnreadable(W) {
  try {
    const P = W.perfTrace;
    W.store.transact(function (d) { d.__ju = { n: 1 }; }, 'perf-trace:j22');
    P.partial();                                 // 建槽
    const b = P.partial();                       // 输入可读且未变 ⇒ 应命中
    if (b.reused !== 4) return false;
    const keep = W.store;
    delete W.store;                              // 输入读不出来
    const c1 = P.partial();                      // 第一次：走 force，写槽
    const c2 = P.partial();                      // 第二次：槽已在、输入仍不可读 ⇒ 仍须重算
    W.store = keep;
    if (c2.revOk !== false || c2.revKind !== 'store-absent') return false;
    if (c1.reused !== 0 || c2.reused !== 0 || c2.recomputed !== 4) return false;
    if (!c2.rows.every(function (r) { return r.inputOk === false && r.inputKind === 'store-absent'; })) return false;
    // 缺席的面如实报缺席（而不是「复用」）
    delete W.toolDiag;
    const d = P.partial();
    const row = d.rows.filter(function (x) { return x.face === 'diagnose'; })[0];
    return !!row && row.absent === true && row.hit === false && d.absent === 1;
  } catch (e) { return false; }
}
/** J20 每层指纹键有界：挤出的是最旧的、计数如实。 */
function jFpCap(W) {
  try {
    const P = W.perfTrace;
    const s0 = P.stat().evicted;
    for (let i = 0; i < 300; i++) P.mark('inject', 'fk' + i, 'fv' + i);
    const gone = P.mark('inject', 'fk0', 'fv0');
    const kept = P.mark('inject', 'fk299', 'fv299');
    const s1 = P.stat().evicted;
    return gone.first === true && kept.first === false && s1 > s0 && s1 >= 44;
  } catch (e) { return false; }
}
function runAll(a) {
  const iSrc = src(PF), diagSrc = src(DIAG), panSrc = src(PANEL), runSrc = src(RUNJS), idxSrc = src(INDEX);
  // ── A 静态面（消费方在位；这类判据读真文件，故不做负控制，见文件头）──
  a(diagSrc.indexOf("'engines/perf-trace.js': 'perfTrace',") >= 0
    && diagSrc.indexOf("const OPTIONAL_EXPORTS = ['ui', 'uiSettings', 'assistant', 'compat'];") >= 0,
    'v2102: [A1] perfTrace 登记为**必载**模块（缺席即断裂，不该被静默兜住）');
  a(diagSrc.indexOf('function secPerfTrace()') >= 0 && diagSrc.indexOf('perfTrace: secPerfTrace(),') >= 0
    && diagSrc.indexOf('WA.perfTrace.stat') >= 0 && diagSrc.indexOf('WA.perfTrace.curve') >= 0,
    'v2102: [A2] 诊断节 perfTrace 在位（collect 挂节 + 只读出口 stat/curve）');
  // 「面板真消费了这些导出」的判据面。
  //   注意 `WA.perfTrace.curve(` 不在列表里：面板读曲线改走 `curveAll()`（一趟取齐，
  //    并配 `baseline()` 报「上次真算于」），故字面量 `curve(` 已经不出现——
  //    这本是**接线演进**，不是消费方缺失；判据面必须跟着接线走，否则会误报断裂。
  const consumed = ['WA.perfTrace.split(', 'WA.perfTrace.stat(', 'WA.perfTrace.curveAll(',
    'WA.perfTrace.baseline(', 'WA.perfTrace.slots(', 'WA.perfTrace.LAYERS',
    'WA.perfTrace.LAYER_LABEL', 'WA.perfTrace.HISTORY_CAP', 'WA.perfTrace.dirtyAll(',
    'WA.perfTrace.summaryText(', 'WA.perfTrace.coldStart(', 'WA.perfTrace.warmStart(', 'WA.perfTrace.CLASSES',
    'WA.perfTrace.partial('];
  const lacked = consumed.filter(function (x) { return hits(panSrc, x) < 1; });
  a(panSrc.indexOf('id="wa-perf-view"') >= 0 && panSrc.indexOf('id="wa-perf-bench"') >= 0
    && panSrc.indexOf('id="wa-perf-partial"') >= 0
    && panSrc.indexOf("$('#wa-perf-view')") > 0 && panSrc.indexOf("$('#wa-perf-bench')") > 0
    && panSrc.indexOf("$('#wa-perf-partial')") > 0
    && lacked.length === 0,
    'v2102: [A3] 面板三枚真消费方，且足量消费真导出（缺 ' + JSON.stringify(lacked) + '）——只在测试里活的导出不算交付');
  a(diagSrc.indexOf('incremental: { rev: st.rev, calls: st.partialCalls, reused: st.partialReused },') >= 0,
    'v2102: [A3b] 诊断节念出增量现场（世界步进 + 累计复用），但**不在诊断里跑基准**（看一眼体检 ≠ 跑一轮全量）');
  a(hits(diagSrc, "'wa-perf-view', 'wa-perf-bench', 'wa-perf-partial',") === 1,
    'v2102: [A4] 两枚控件登记进 UI_BINDINGS 守卫表（渲染了不登记 ⇒ 守卫永远查不到）');
  const loadSeg = runSrc.slice(runSrc.indexOf('const LOAD = ['), runSrc.indexOf('];', runSrc.indexOf('const LOAD = [')));
  const posIn = function (rel) { return loadSeg.indexOf("'" + rel + "'"); };
  const pRun = posIn(PF);
  a(pRun > 0 && pRun > posIn('engines/tool-diag.js') && pRun > posIn('render/inject.js') && pRun > posIn('engines/canon.js'),
    'v2102: [A5] run.js 的 LOAD 位置在 tool-diag / render / canon 之后（三个面的真源，顺序写反就永远是「缺席」）');
  const pIdx = idxSrc.indexOf("'engines/perf-trace.js'");
  a(pIdx > 0 && pIdx > idxSrc.indexOf("'engines/interop.js'") && pIdx < idxSrc.indexOf("'ui/panel.js'"),
    'v2102: [A6] index.js 的 LOAD_ORDER 位置与 tests 同序（interop 之后、ui 之前）');
  a(hits(iSrc, 'require(') === 0 && hits(iSrc, 'jsdom') === 0,
    'v2102: [A7] 零 npm 依赖（本仓红线：无 package.json / node_modules）');
  // ── B 运行时面 ──
  a(jLayers(env().WA), 'v2102: [J1] 三个封闭集合恰为预期 + 标签与档位定义齐备');
  a(jCaps(env().WA), 'v2102: [J2] 有界窗口：P50≤P95≤峰值、subTick 在界内、超窗必挤出并计数');
  a(jFpConsistency(env().WA), 'v2102: [J3] 指纹确定性 + 不可读 ⇒ 一律重算（不拿旧值冒充命中）');
  a(jReuse(env().WA), 'v2102: [J4] 复用语义：脏集干净才命中 / force 不命中 / 冷热三步动作与值都对');
  a(jFailHonest(env().WA), 'v2102: [J5] 失败诚实：不写缓存、不返回旧值、计量如实涨');
  a(jSlots(env().WA), 'v2102: [J6] 槽位读数：命中计数从 0 起算、失败的槽不进表');
  a(jReadonly(env().WA), 'v2102: [J7] 全量出口零落盘（存档逐字不变）+ 诊断节读得到');
  a(jReady(env().WA), 'v2102: [J8] 面可用性判**装配**而非产物（模块缺席才 absent；正常读出的空结果不算缺席）');
  a(jAbsentNoSample(env().WA), 'v2102: [J9] 缺席不记样本（不替缺席编 0ms 去稀释 P50）');
  a(jColdWarm(env().WA), 'v2102: [J10] 冷启真跑并写缓存 ⇒ 热启真命中；分歧分诊如实（volatile 不赖缓存）');
  a(jColdSelfConsistent(env().WA), 'v2102: [J11] 冷启：reused 0 / consistent null / 缺席数如实');
  a(jWarmSplit(env().WA), 'v2102: [J12] 冷热分歧分诊：每算必变 ⇒ volatile；稳定 ⇒ agree（不是「永远不一致」）');
  a(jCwcSelfRef(env().WA), 'v2102: [J13] 三步判据：第三步真算（走了缓存就是自指假绿）');
  a(jStat(env().WA), 'v2102: [J14] 计数从 0 起算 / 非法标记不计数 / 脏集消费语义');
  a(jSummary(env().WA), 'v2102: [J15] 汇总面与现场同源（跑一轮后文本跟着动）');
  a(jSpan(env().WA), 'v2102: [J16] 耗时分列：未上报就说未上报（不写成 0ms）');
  a(jClasses(env().WA), 'v2102: [J17] 四档定义：重复与预算逐档递增、lowend 标 approx 并写明边界');
  a(jBench(env().WA), 'v2102: [J18] 基准：未知档拒收 / 缺席档不编耗时 / repeats 真被执行');
  a(jBenchAll(env().WA), 'v2102: [J19] 基准全档：四档齐全、逐档 repeats 被尊重、窗口累积 13 趟');
  a(jFpCap(env().WA), 'v2102: [J20] 每层指纹键有界：挤出最旧的、计数如实');
  a(jPartial(env().WA), 'v2102: [J21] 增量真成立：同一世界步进全复用 / 世界前进全重算（两向都测，判据不恒真也不恒假）');
  a(jPartialUnreadable(env().WA), 'v2102: [J22] 增量的输入读不出来 ⇒ 一律重算（不拿上一轮的值冒充命中）');
  // ── C 不变式 ──
  const Wc = env().WA;
  const beforeC = JSON.stringify(Wc.store.get());
  Wc.perfTrace.coldStart(); Wc.perfTrace.warmStart(); Wc.perfTrace.benchAll();
  Wc.toolDiag.collect();
  const afterC = JSON.stringify(Wc.store.get());
  a(beforeC === afterC, 'v2102: [C1] 全量出口**不落盘**（存档逐字不变——取证不得改变被取证对象）');
  a(JSON.stringify(Wc.perfTrace.LAYERS) === JSON.stringify(['inject', 'diagnose', 'canonAlign', 'worldState'])
    && JSON.stringify(Wc.perfTrace.SPANS) === JSON.stringify(['local', 'host', 'serialize', 'render'])
    && JSON.stringify(Wc.perfTrace.CLASSES) === JSON.stringify(['short', 'medium', 'long', 'lowend']),
    'v2102: [C2] 三个封闭集合恰为预期（集合变化必须有人确认过）');
  a(Wc.perfTrace.HISTORY_CAP === 64 && Wc.perfTrace.FINGERPRINT_CAP === 256,
    'v2102: [C3] 两个有界窗口如实（历史 64 样本 / 每层指纹 256 键）');
  const wc = Wc.perfTrace.warmStart();
  a((wc.stale || []).length === 0 && wc.checked >= 3,
    'v2102: [C4] 热启复用值指纹与现算值一致（「缓存过期」必须是 0 起算的真实读数）');
}
function runNegative(a) {
  Object.keys(ANCHORS).forEach(function (k) { must1(src(ANCHORS[k].rel), ANCHORS[k].txt, k); });
  a(Object.keys(ANCHORS).length === 25, 'v2102n: [N0] 二十五个破坏锚点在真源码各恰中 1 次（实 ' + Object.keys(ANCHORS).length + '）');
  let threw = 0;
  try { must1(src(PF), '锚点根本不在源码里__v2102n', 'self'); } catch (e) { threw++; }
  try { must1(src(PF) + ANCHORS.CAP_BOUND.txt, ANCHORS.CAP_BOUND.txt, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'v2102n: [N0] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  const probes = [['jLayers', jLayers], ['jCaps', jCaps], ['jFpConsistency', jFpConsistency], ['jReuse', jReuse],
    ['jFailHonest', jFailHonest], ['jSlots', jSlots], ['jReadonly', jReadonly], ['jReady', jReady],
    ['jAbsentNoSample', jAbsentNoSample], ['jColdWarm', jColdWarm], ['jColdSelfConsistent', jColdSelfConsistent],
    ['jWarmSplit', jWarmSplit], ['jCwcSelfRef', jCwcSelfRef], ['jStat', jStat], ['jSummary', jSummary],
    ['jSpan', jSpan], ['jClasses', jClasses], ['jBench', jBench], ['jBenchAll', jBenchAll], ['jFpCap', jFpCap],
    ['jPartial', jPartial], ['jPartialUnreadable', jPartialUnreadable]];
  // N1 原版干净（每条探针独立实例——它们都会改缓存 / 删模块，共享实例会读到前一条的手指印）
  const n1 = probes.map(function (x) { return { name: x[0], ok: x[1](env().WA) }; });
  const bad = n1.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
  a(bad.length === 0, 'v2102n: [N1] 原版上二十条判据全部干净（不干净的是 ' + (bad.join(',') || '无') + '）');
  // N2–N23 逐锚：真源码破坏 ⇒ 装载破坏副本 ⇒ 在副本上重跑**同款**真判据
  let step = 1;
  Object.keys(ANCHORS).forEach(function (key) {
    step++;
    const fn = probes.filter(function (x) { return x[0] === CAMP[key]; })[0];
    if (!fn) throw new Error('no probe bound to anchor :: ' + key);
    const b = breakOne(key);
    const Hn = env({ [b.rel]: b.src });
    const ok = fn[1](Hn.WA);
    a(ok === false, 'v2102n: [N' + step + '] 拆掉「' + key + '」后判据现形');
    // 破坏副本必须仍能正常装载，且命名空间完整 —— 否则「判据现形」可能只是它装不起来了
    const memOk = !!Hn.WA.perfTrace && MEMBERS.every(function (m) {
      const v = Hn.WA.perfTrace[m];
      return typeof v === 'function' || (v !== undefined && v !== null);
    });
    a(memOk, 'v2102n: [N' + step + '] 破坏副本仍正常装载且成员完整（是**判据真敏感**，不是装不起来）');
  });
  // N24 判据纯度（H5：锚点字面量在本文件只准声明一次）
  const self = src('tests/perf-trace-v2102.js');
  const okP = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(okP, 'v2102n: [N24] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
// 锚点 → 探针的绑定（逐锚负控制要跑**同款**判据，绑定关系显式写出来）
const CAMP = {
  LAYER_SET: 'jLayers', CAP_BOUND: 'jCaps', FP_NA: 'jFpConsistency', ENSURE_HIT: 'jReuse',
  ENSURE_FAIL: 'jFailHonest', ENSURE_WRITE: 'jSlots', RING_PUSH: 'jCaps', RING_EVICT: 'jCaps',
  FACEAVAIL: 'jReady', ABSENT_NO_SAMPLE: 'jAbsentNoSample', COLD_WRITES_CACHE: 'jColdWarm',
  COLD_ABSENT_SELF: 'jColdSelfConsistent', WARM_FP_COMPARE: 'jWarmSplit', WARM_VERDICT: 'jWarmSplit',
  WARM_STALE_SPLIT: 'jWarmSplit', CWC_AGAIN_FORCE: 'jCwcSelfRef', STAT_DECLARED: 'jStat',
  SUMMARY_HEAD: 'jSummary', NOTE_SPAN_GUARD: 'jSpan', CLASS_LOWEND: 'jClasses',
  MARK_LAYER_GUARD: 'jStat', FPRINT_CAP_EVICT: 'jFpCap', BENCH_UNKNOWN: 'jBench',
  WORLDREV_SRC: 'jPartial', PARTIAL_UNREADABLE: 'jPartialUnreadable'
};
if (require.main === module) {
  const a2 = function (cond, name) {
    if (cond) { PASS++; }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('PERF-TRACE-V2102: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('PERF-TRACE-V2102: pass（' + PASS + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };