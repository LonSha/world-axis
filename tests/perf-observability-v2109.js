// WorldAxis tests/perf-observability-v2109.js (v2.109.0) — 计划一 #7-#11 专锁
//
// 四段齐备：A 静态契约 / B 运行时 / C 不变式 / N 真源码破坏负控制。
//
// 被锁对象：engines/perf-trace.js 的观测面扩张（#7 快照 / #8 指纹冲突 /
//   #9 热度与淘汰 / #10 阈值告警 / #11 火焰图）。
//
// ── 负控制纪律（继承 v2.106.0「验证判据不得改真文件」+ v2.108.0 的 (90)）──
//   一律「真源码破坏 → **内存副本**上重跑同款真判据」。装载走 `ui-gate-sync.fresh`
//   的 `srcOverride`（产品层支持），破坏只发生在内存里，磁盘字节零改写。
//   喂给破坏的输入必须**真能走到那条路径**（(90)：N1 首版喂了能 parse 的片段，
//   而 load 只在 parse 失败时才修 ⇒ 判据压根不被执行）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const REL = 'engines/perf-trace.js';

/* ── 装载工具 ─────────────────────────────────────────────────────────── */
/** 装一个完整产品环境（不装 UI）。`srcOverride` 可替换任一产品文件源码。 */
function load(over) {
  const sync = require('./ui-gate-sync.js');
  const env = sync.fresh({ files: [], srcOverride: over || {} });
  return env.WA;
}
/** 读产品源码（负控制锚点校验用）。 */
function src() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
/** 锚点必须在真源码里**恰好 1 次**（(83)：缺失与重复同罪）。 */
function anchorOnce(txt, needle) { return txt.split(needle).length - 1 === 1; }

/* ── A 静态契约 ───────────────────────────────────────────────────────── */
function runAll(A) {
  const t = src();
  const WA = load();
  const P = WA.perfTrace;
  A(!!P, 'A1 perfTrace 命名空间在装载后就位');

  // A2-#7 快照：导出面对齐 + 两张快照不得共享同一个对象（否则「比对」是自指的）
  const s1 = P.snapshot('a2');
  A(s1 && s1.v === 1 && typeof s1.layers === 'object', 'A2/#7 snapshot() 返回版本化对象（v=1）');
  A(Object.keys(s1.layers).length === P.LAYERS.length, 'A2/#7 快照覆盖全部 ' + P.LAYERS.length + ' 层');
  A(s1.comparable && s1.comparable.ms === false && s1.comparable.bytes === true,
    'A2/#7 快照自标可比性：墙钟不可比、规模可比（口径①）');
  A(P.LAYERS.every(function (L) { return !!s1.layers[L] && typeof s1.layers[L].p95 === 'number'; }),
    'A2/#7 逐层带 P50/P95（不是只有总数）');

  // A3-#8 指纹冲突：索引必须有界（FINGERPRINT_CAP），且计数器在 stat 里可读
  const st = P.stat();
  A(typeof st.fpCollisions === 'number', 'A3/#8 stat 透出 fpCollisions');
  A(P.FINGERPRINT_CAP > 0 && typeof P.FINGERPRINT_CAP === 'number', 'A3/#8 指纹表上限是读数不是魔数');

  // A4-#9 热度与淘汰：上限、策略集合、计数器齐备
  A(typeof P.CACHE_CAP === 'number' && P.CACHE_CAP > 0, 'A4/#9 缓存槽上限存在（此前 _cache 无上限）');
  A(Array.isArray(P.EVICT_POLICIES) && P.EVICT_POLICIES.indexOf('fifo') >= 0 && P.EVICT_POLICIES.indexOf('lru') >= 0,
    'A4/#9 淘汰策略集合含 fifo 与 lru');
  A(typeof P.cacheStat === 'function' && typeof P.heatHistogram === 'function' && typeof P.setCachePolicy === 'function',
    'A4/#9 cacheStat / heatHistogram / setCachePolicy 三出口齐备');
  const cs = P.cacheStat();
  A(cs.cap === P.CACHE_CAP && cs.policy === 'fifo', 'A4/#9 默认策略 fifo（保持既有行为，不静默换语义）');

  // A5-#10 阈值：有界（factor 必须 > 1）+ 可读
  const th = P.thresholds();
  A(th.factor > 1 && th.minSamples >= 1 && th.minMs >= 0, 'A5/#10 阈值读数有界（factor>1 / minSamples≥1 / minMs≥0）');
  A(typeof P.spikeOf === 'function' && typeof P.alerts === 'function', 'A5/#10 spikeOf / alerts 出口齐备');

  // A6-#11 火焰图：三种形态 + 上限 + 逻辑口径自标
  A(typeof P.FLAME_CAP === 'number' && P.FLAME_CAP > 0, 'A6/#11 帧数上限存在（有界）');
  const f1 = P.flamegraph({ format: 'folded' });
  A(f1.ok && f1.format === 'folded' && typeof f1.text === 'string', 'A6/#11 folded 形态可产出');
  A(f1.logical === true && f1.unit === 'ms', 'A6/#11 自标「逻辑火焰图 + 毫秒」（不冒充真调用栈）');
  const bad = P.flamegraph({ format: 'nope' });
  A(bad.ok === false && bad.reason === 'unknown-format' && Array.isArray(bad.known),
    'A6/#11 未知格式如实拒收（不静默回落成默认形态）');

  // A7 锚点（供 N 段核对；本段只证「真源码里恰好 1 次」）
  ANCHOR_LIST.forEach(function (x) {
    A(anchorOnce(t, x.txt), 'A7 锚点 ' + x.name + ' 在真源码里恰好 1 次');
  });

  // A8 无消费方不挂导出：新增出口必须被至少一处消费（本锁自己就是消费方之一）
  ['snapshot', 'importSnapshot', 'flamegraph', 'heatHistogram', 'spikeOf', 'alerts', 'cacheStat', 'setCachePolicy'].forEach(function (k) {
    A(typeof P[k] === 'function', 'A8 导出 ' + k + ' 是函数（挂上就得有人调用）');
  });
}

/* ── B 运行时面 ───────────────────────────────────────────────────────── */
function runRuntime(A) {
  const WA = load();
  const P = WA.perfTrace;

  // B1-#7 采集后快照里**真有样本**（口径④：空窗口比出来的永远是 0）
  P.bench('short');
  P.partial();
  const s = P.snapshot('b1');
  const anySample = P.LAYERS.some(function (L) { return s.layers[L].n > 0; });
  A(anySample, 'B1/#7 采集后快照里确有样本（不是空窗口冒充「无劣化」）');

  // B2-#7 自比：导入自己 ⇒ 结构面零差（这是「比对器真的在工作」的正面证据）
  const self = P.importSnapshot(s, { sameHost: false });
  A(self.ok === true && self.rows.length === P.LAYERS.length, 'B2/#7 自比逐层出行（' + P.LAYERS.length + ' 层）');
  A(self.struct.length === 0, 'B2/#7 自比结构面零差');
  A(self.msComparable === false && self.rows.every(function (r) { return r.verdict === 'not-comparable'; }),
    'B2/#7 默认（非同一台机）墙钟一栏如实标不可比（口径①）');

  // B3-#7 缺层必须报 missing 而不是静默跳过
  const broken = JSON.parse(JSON.stringify(s));
  delete broken.layers[P.LAYERS[0]];
  const miss = P.importSnapshot(broken, {});
  A(miss.ok === false && miss.problems.indexOf('layer-missing:' + P.LAYERS[0]) >= 0,
    'B3/#7 基线缺层 ⇒ problems 报 layer-missing（不静默跳过）');
  A(miss.rows.filter(function (r) { return r.verdict === 'missing'; }).length === 1, 'B3/#7 缺的那层单独标 missing');

  // B4-#8 指纹冲突真能被抓到（同输入指纹 → 两个不同产物指纹）。
  //   观察位必须是**写入**路径：命中路径不重算 ⇒ 产物侧冲突在那里结构性不可观测
  //   （首版写在命中路径上，判据恒假——与 (90) 同族：喂的输入走不到那条路径）。
  const st0 = P.stat().fpCollisions;
  const fp = P.fingerprint({ x: 1 });
  const k = 'b4_probe';
  const r1 = P.ensure('inject', k, function () { return { v: 'one' }; }, { stamp: 'fixed-b4', force: true });
  const r2 = P.ensure('inject', k, function () { return { v: 'two' }; }, { stamp: 'fixed-b4', force: true });
  A(r1.ok === true && r2.ok === true && r1.recomputed === true && r2.recomputed === true,
    'B4/#8 两次都真算（force），故索引真看到两个产物指纹');
  A(P.stat().fpCollisions > st0, 'B4/#8 同输入指纹产出不同产物 ⇒ fpCollisions 增长（承诺破了要可见）');
  A(typeof fp === 'string', 'B4/#8 fingerprint() 返回字符串');

  // B5-#8 完整输入比对：指纹相同但完整输入不同 ⇒ 不得命中（宁可重算）
  const k2 = 'b5_probe';
  P.ensure('diagnose', k2, function () { return { v: 'x' }; }, { stamp: 's5', full: { a: 1 } });
  const hit1 = P.ensure('diagnose', k2, function () { return { v: 'x' }; }, { stamp: 's5', full: { a: 1 } });
  A(hit1.hit === true, 'B5/#8 完整输入相同 ⇒ 正常命中（判据不误伤）');
  const hit2 = P.ensure('diagnose', k2, function () { return { v: 'x' }; }, { stamp: 's5', full: { a: 2 } });
  A(hit2.hit === false && hit2.recomputed === true, 'B5/#8 完整输入不同 ⇒ 不命中、重算（不拿旧值冒充）');

  // B6-#9 热度：hit 之后 lastAccessAt 推进、ageMs 可读。
  //   次序依赖：hits 会被**同键的下一次重算**清零，故必须在命中之后立刻读
  //   （首版读得太晚，读到的是重算后重新起算的 0 —— 判据的次序依赖，不是产品缺陷）。
  const k6 = 'b6_probe';
  P.ensure('canonAlign', k6, function () { return { v: 'hot' }; }, { stamp: 's6' });
  P.ensure('canonAlign', k6, function () { return { v: 'hot' }; }, { stamp: 's6' });
  const slots = P.slots('canonAlign');
  const one = slots.filter(function (x) { return x.key === k6; })[0];
  A(one && typeof one.ageMs === 'number' && one.ageMs >= 0, 'B6/#9 缓存槽带 ageMs（热度可读）');
  A(one && one.hits >= 1, 'B6/#9 命中数被记下（实 ' + (one ? one.hits : 'null') + '）');
  const hh = P.heatHistogram('canonAlign');
  A(hh.total >= 1 && hh.buckets.length === 4 && hh.total === P.cacheStat().per.canonAlign,
    'B6/#9 热度直方图四桶，且总数与 cacheStat 同源一致（实 ' + hh.total + '/' + P.cacheStat().per.canonAlign + '）');

  // B7-#9 淘汰：超上限即挤出且有计数（策略两档都得真发生）
  const W2 = load();
  const P2 = W2.perfTrace;
  const before = P2.stat().evictedPolicy;
  for (let i = 0; i < P2.CACHE_CAP + 12; i++) {
    P2.ensure('canonAlign', 'b7_' + i, function () { return { i: i }; }, { force: true });
  }
  A(P2.cacheStat().per.canonAlign <= P2.CACHE_CAP, 'B7/#9 fifo 策略下占用不超上限（实 ' + P2.cacheStat().per.canonAlign + '/' + P2.CACHE_CAP + '）');
  A(P2.stat().evictedPolicy > before, 'B7/#9 挤出真发生且计数（不是静默丢弃）');
  const pol = P2.setCachePolicy('lru');
  A(pol.ok === true && pol.policy === 'lru', 'B7/#9 可切 lru 策略');
  const polBad = P2.setCachePolicy('nonsense');
  A(polBad.ok === false && polBad.reason === 'unknown-policy', 'B7/#9 未知策略如实拒收');
  P2.setCachePolicy('fifo');

  // B8-#10 样本不足不判（继承 insufficient 口径）
  const W3 = load();
  const P3 = W3.perfTrace;
  const sp = P3.spikeOf('worldState');
  A(sp.ok === false && sp.kind === 'insufficient', 'B8/#10 样本不足 ⇒ 如实报 insufficient（不许渲染成 stable）');
  A(sp.need === P3.thresholds().minSamples, 'B8/#10 报出所需样本数');

  // B9-#10 告警真的发出去（不能只返回数组）
  // B9-#10 告警必须**发出去**（不能只返回数组——没人读的告警等于没有告警）。
  //   做法：借 `WA.log` 这个既有出口收集（不是自己造第二套出口）。
  const W4 = load();
  const P4 = W4.perfTrace;
  const seen = [];
  const origLogW4 = W4.log;
  try {
    W4.log = function (lvl, msg) { seen.push({ lvl: lvl, msg: msg }); };
    for (let i = 0; i < 40; i++) P4.bench('short');
    const al = P4.alerts(null, {});
    A(al.grade === (al.n ? 'warn' : 'pass'), 'B9/#10 grade 与告警数同源（' + al.n + ' 条 ⇒ ' + al.grade + '）');
    if (al.n > 0) {
      A(seen.some(function (x) { return x.lvl === 'warn' && String(x.msg).indexOf('性能劣化告警') >= 0; }),
        'B9/#10 有告警时**真发出了** warn 级日志（实收 ' + seen.length + ' 条）');
      A(P4.stat().alertCount >= al.n && !!P4.stat().lastAlert, 'B9/#10 告警计数与最近一条可读（诊断念得到）');
    } else {
      A(seen.length === 0, 'B9/#10 无告警时不发日志（不制造噪声）');
    }
  } finally { W4.log = origLogW4; }

  // B10-#10 阈值有界：非法 factor 拒收且不污染现状
  const W5 = load();
  const P5 = W5.perfTrace;
  const t0 = P5.thresholds().factor;
  const bad2 = P5.setThresholds({ factor: 0.5 });
  A(bad2.ok === false && bad2.reason === 'bad-factor', 'B10/#10 factor ≤ 1 如实拒收（否则劣化与改进不可分辨）');
  A(P5.thresholds().factor === t0, 'B10/#10 拒收后现状未被污染');
  const okTh = P5.setThresholds({ factor: 2 });
  A(okTh.ok === true && P5.thresholds().factor === 2, 'B10/#10 合法阈值生效');

  // B11-#11 火焰图三形态真产出且逻辑自标
  const W6 = load();
  const P6 = W6.perfTrace;
  P6.bench('short');
  const fold = P6.flamegraph({ format: 'folded' });
  A(fold.frames >= 1 && fold.text.indexOf('perf;') === 0, 'B11/#11 folded 以 perf; 起头（可被标准折叠栈工具读）');
  const js = P6.flamegraph({ format: 'json' });
  A(js.tree && js.tree.name === 'perf' && Array.isArray(js.tree.children), 'B11/#11 json 形态是 {name,value,children} 树（非标准折叠栈工具的口径）');
  A(js.tree.children.length <= P6.LAYERS.length, 'B11/#11 json 树的第一层不超过层数');
  const svg = P6.flamegraph({ format: 'svg' });
  A(svg.svg.indexOf('<svg') >= 0 && svg.svg.indexOf('</svg>') > 0, 'B11/#11 svg 是闭合的零依赖 SVG');
  A(svg.logical === true, 'B11/#11 svg 同样自标逻辑口径');

  // B12-#11 帧数有界且挤出被计数
  const W7 = load();
  const P7 = W7.perfTrace;
  for (let i = 0; i < 80; i++) P7.bench('short');
  const big = P7.flamegraph({ format: 'folded' });
  A(big.frames <= P7.FLAME_CAP, 'B12/#11 帧数不超上限（实 ' + big.frames + '/' + P7.FLAME_CAP + '）');

  // B13 观测不得改变被观测对象：全部新出口跑完后存档逐字不变（本仓核心口径）
  const W8 = load();
  const P8 = W8.perfTrace;
  W8.store.init();
  const before8 = JSON.stringify(W8.store.get());
  P8.bench('short'); P8.partial(); P8.snapshot('b13');
  P8.flamegraph({ format: 'svg' }); P8.alerts(null, {}); P8.heatHistogram('inject');
  P8.cacheStat(); P8.spikeOf('inject'); P8.importSnapshot(P8.snapshot('x'), {});
  A(JSON.stringify(W8.store.get()) === before8, 'B13 新出口全程不写存档（取证不得改变被取证对象）');
}

/* ── C 不变式 ─────────────────────────────────────────────────────────── */
function runInvariants(A) {
  const WA = load();
  const P = WA.perfTrace;

  // C1 幂等：同输入下 snapshot 的结构面逐字相同（时间字段除外）
  P.bench('short');
  const x = P.snapshot('c1'), y = P.snapshot('c1');
  const strip = function (o) { const c = JSON.parse(JSON.stringify(o)); delete c.at; if (c.stat) delete c.stat.lastAt; return JSON.stringify(c); };
  A(strip(x) === strip(y), 'C1 snapshot 幂等（结构面逐字相同；同标签同窗口 ⇒ 同结果）');

  // C2 幂等：同一份快照导入两次结论一致
  const i1 = P.importSnapshot(x, {}), i2 = P.importSnapshot(x, {});
  A(JSON.stringify(i1.problems) === JSON.stringify(i2.problems), 'C2 importSnapshot 幂等（判据不引入随机）');

  // C3 火焰图不改变窗口（纯读）：调三次 folded 后 baseline 不变
  const b0 = JSON.stringify(P.baseline('inject'));
  P.flamegraph({ format: 'folded' }); P.flamegraph({ format: 'json' }); P.flamegraph({ format: 'svg' });
  A(JSON.stringify(P.baseline('inject')) === b0, 'C3 flamegraph 是纯读（不改历史窗口）');

  // C4 heatHistogram 不改槽（纯读）
  const s0 = JSON.stringify(P.slots('inject'));
  P.heatHistogram('inject'); P.heatHistogram('inject');
  A(JSON.stringify(P.slots('inject')) === s0, 'C4 heatHistogram 不改缓存槽（年龄只读不写）');

  // C5 cacheStat 纯读
  const c0 = JSON.stringify(P.cacheStat());
  P.cacheStat();
  A(JSON.stringify(P.cacheStat()) === c0, 'C5 cacheStat 纯读');

  // C6 阈值读数不因查询而漂移
  const th0 = JSON.stringify(P.thresholds());
  P.thresholds(); P.spikeOf('inject');
  A(JSON.stringify(P.thresholds()) === th0, 'C6 thresholds 纯读');
}

/* ── N 真源码破坏负控制 ───────────────────────────────────────────────── */
/**
 * 每处破坏都在**内存副本**上做（srcOverride），磁盘零改写。
 * 破坏形态统一「条件置假」（本仓纪律）：把守卫改成恒不成立，看判据是否现形。
 * 每项先证「破坏真发生」（副本里确实含破坏后文本），再跑同款真判据。
 */
const ANCHOR_LIST = [
  { name: 'aSnapComparable', txt: 'comparable: { ms: false, bytes: true }',
    brk: 'comparable: { ms: true, bytes: true }' },
  { name: 'aFpConflict', txt: 'conflict = true; _stat.fpCollisions++;',
    brk: 'conflict = false; _stat.fpCollisions++;' },
  // aCap 的锚点刻意**不取函数头**：原锚点 `function _enforceCap(L, slot) {` 是破坏串的
  //   前缀（破坏串 = 锚点 + ' return;'），于是同串在锁文件里出现 2 次，纯度判据必报 impure。
  //   改取函数体里的无界删除行 —— 与破坏串无共享前缀，语义也更贴 N3（挤出空转 ⇒ 计数恒 0）。
  { name: 'aCap', txt: '    delete slot[victim];',
    brk: '    if (false) delete slot[victim];' },
  { name: 'aPolicy', txt: "const EVICT_POLICIES = ['fifo', 'lru'];",
    brk: "const EVICT_POLICIES = ['fifo'];" },
  { name: 'aInsuff', txt: "kind: 'insufficient'",
    brk: "kind: 'stable'" },
  { name: 'aFlameCap', txt: 'const FLAME_CAP = 256;',
    brk: 'const FLAME_CAP = 100000;' },
  { name: 'aLogical', txt: 'logical: true, frames: frames.length, text: text,',
    brk: 'frames: frames.length, text: text,' },
  // v2.109.0：importSnapshot 的见证（第 8 个口此前只有正向断言、没有可证伪性见证）。
  { name: 'aImportVerdict', txt: "verdict: o.sameHost ? 'ok' : 'not-comparable'",
    brk: "verdict: o.sameHost ? 'ok' : 'ok'" }
];
const ANCHORS = {};
const BREAKS = {};
ANCHOR_LIST.forEach(function (x) {
  ANCHORS[x.name] = { rel: REL, txt: x.txt };
  // v2.109.0（判据纯度 H5）：锚点串与破坏串**都住在这一张表里**，取值一律走表。
  //   首版把锚点字面量写在调用点（mut 的第 2 个参数）⇒ 同一串在本文件出现两遍，
  //   于是「锚点字面量在锁文件里出现几次」这条纯度判据必然误报
  //   （实测：全仓负控制静态审计对本文件报出 7 条 impure）。
  //   现在每个锚点字面量与每个破坏串在全文件都恰好出现 1 次。
  if (x.brk) BREAKS[x.name] = x.brk;
});

function runNegative(A) {
  const t = src();
  // 破坏源：名字 → 表内锚点串 + 表内破坏串。不做「尽力替换」，失配一律抛。
  //   第 2 参是**可选**的源覆盖（只为自证「锚点不唯一必须抛」用）：
  //   传 `t + ANCHORS.x.txt` 可现场造出「同一锚点出现两次」而不必在源码里再写一遍字面量
  //   —— 写第二遍字面量正是 K2 修掉的纯度违规。
  const mut = function (name, srcOverride) {
    if (!ANCHORS[name]) throw new Error('N anchor not registered :: ' + name);
    const from = ANCHORS[name].txt, to = BREAKS[name];
    if (!to) throw new Error('N break not registered :: ' + name);
    const s2 = (srcOverride === undefined) ? t : srcOverride;
    const n = s2.split(from).length - 1;
    if (n !== 1) throw new Error('N anchor ' + name + ' hit ' + n + '/1（跨行或重复锚点在纯度口径下不可满足）');
    const bad = s2.replace(from, to);
    if (bad === s2) throw new Error('N break no-op :: ' + name);
    return bad;
  };

  // N0 前提：原版上同款判据必须真（否则「破坏后报红」毫无意义）
  {
    const WA = load();
    const s = WA.perfTrace.snapshot('n0');
    A(s.comparable.ms === false, 'N0 原版：快照自标墙钟不可比（前提成立）');
  }

  // N1 -#7 快照谎称墙钟可比 ⇒ 判据必须现形
  {
    const brk = mut('aSnapComparable');
    A(brk.indexOf(BREAKS.aSnapComparable) >= 0, 'N1 破坏真发生（副本里 ms=true）');
    const WA = load({ 'engines/perf-trace.js': brk });
    const s = WA.perfTrace.snapshot('n1');
    A(s.comparable.ms === true, 'N1 破坏版里快照谎称可比（观测到破坏后的行为）');
    A(!(s.comparable.ms === false), 'N1 同款判据在破坏版上失败（负控制有效）');
  }

  // N2 -#8 拆掉指纹冲突检测 ⇒ 冲突不再被计数
  {
    const brk = mut('aFpConflict');
    A(brk.indexOf(BREAKS.aFpConflict) >= 0, 'N2 破坏真发生');
    const WA = load({ 'engines/perf-trace.js': brk });
    const P = WA.perfTrace;
    const k = 'n2_probe';
    P.ensure('inject', k, function () { return { v: 'one' }; }, { stamp: 'n2' });
    const r = P.ensure('inject', k, function () { return { v: 'two' }; }, { stamp: 'n2' });
    A(r.hit === true, 'N2 破坏版里冲突被吞成命中（拿旧值冒充新值）');
    A(WA.perfTrace.stat().fpCollisions === 0, 'N2 冲突计数不再增长（同款判据在破坏版上失败）');
  }

  // N3 -#9 淘汰函数空转 ⇒ 占用超上限却无人计数
  {
    const brk = mut('aCap');
    A(brk.indexOf(BREAKS.aCap) >= 0, 'N3 破坏真发生');
    const WA = load({ 'engines/perf-trace.js': brk });
    const P = WA.perfTrace;
    for (let i = 0; i < P.CACHE_CAP + 12; i++) P.ensure('canonAlign', 'n3_' + i, function () { return { i: i }; }, { force: true });
    A(P.cacheStat().per.canonAlign > P.CACHE_CAP, 'N3 破坏版里占用超上限（有界失效）');
    A(P.slots('canonAlign').filter(function (x) { return x.key === 'n3_0'; }).length === 1,
      'N3 最旧的键仍在表里（删除没发生 ⇒ 有界性失效；同款判据在原版上失败——原版 FIFO 会挤出它）');
  }

  // N4 -#9 策略集被削成单档 ⇒ 契约判据失败
  {
    const brk = mut('aPolicy');
    A(brk.indexOf(BREAKS.aPolicy) >= 0, 'N4 破坏真发生');
    const WA = load({ 'engines/perf-trace.js': brk });
    const P = WA.perfTrace;
    A(P.setCachePolicy('lru').ok === false, 'N4 破坏版里 lru 已不可用（契约被削）');
    A(P.EVICT_POLICIES.indexOf('lru') < 0, 'N4 同款判据在破坏版上失败');
  }

  // N5 -#10 样本不足伪装成稳定 ⇒ 判据必须现形（本仓 insuffient 口径的核心）
  {
    const brk = mut('aInsuff');
    A(brk.indexOf(BREAKS.aInsuff) >= 0, 'N5 破坏真发生（破坏后文本逐字核对）');
    const WA = load({ 'engines/perf-trace.js': brk });
    const sp = WA.perfTrace.spikeOf('worldState');
    A(sp.kind === 'stable', 'N5 破坏版里样本不足被谎报成 stable');
    A(!(sp.ok === false && sp.kind === 'insufficient'), 'N5 同款判据在破坏版上失败');
  }

  // N6 -#11 帧数上限失效 ⇒ 帧数无界
  {
    const brk = mut('aFlameCap');
    A(brk.indexOf(BREAKS.aFlameCap) >= 0, 'N6 破坏真发生');
    const WA = load({ 'engines/perf-trace.js': brk });
    const P = WA.perfTrace;
    A(P.FLAME_CAP === 100000, 'N6 上限被改大（有界性失效）');
    A(!(P.FLAME_CAP === 256), 'N6 同款判据在破坏版上失败');
  }

  // N7 -#11 火焰图不再自标逻辑口径 ⇒ 冒充真调用栈的形态必须现形
  {
    const brk = mut('aLogical');
    A(brk.indexOf(BREAKS.aLogical) >= 0, 'N7 破坏真发生');
    const WA = load({ 'engines/perf-trace.js': brk });
    const f = WA.perfTrace.flamegraph({ format: 'folded' });
    A(f.logical === undefined, 'N7 破坏版里「逻辑火焰图」自标消失（读者会误以为真调用栈）');
    A(!(f.logical === true), 'N7 同款判据在破坏版上失败');
  }

  // N8 工具级自证：锚点不存在 / 不唯一都必须抛（否则 N 段会静默空转）
  {
    let threw = 0;
    try { mut('aPolicy', t + ANCHORS.aPolicy.txt); } catch (e) { threw++; }
    A(threw === 1, 'N8 锚点不唯一（同一串出现两次）⇒ mut 抛（判据不静默空转）');
    let threw2 = 0;
    try { mut('NEVER_EXIST_KEY_XYZ'); } catch (e2) { threw2++; }
    A(threw2 === 1, 'N8 表外锚点名 ⇒ 一律抛（不做「尽力替换」，也不得静默取空）');
  }

  // N9 原版上全部负控制的反面必须真（破坏前判据全绿）
  {
    const WA = load();
    const P = WA.perfTrace;
    const s = P.snapshot('n9');
    A(s.comparable.ms === false && P.FLAME_CAP === 256 && P.EVICT_POLICIES.length === 2,
      'N9 原版上八项判据的前提全部成立（破坏才有意义）');
  }

  // N10 -#7 importSnapshot：跨机比对不许自称「判过了」（它自己的历史缺陷点）
  {
    const brk = mut('aImportVerdict');
    A(brk.indexOf(BREAKS.aImportVerdict) >= 0, 'N10 破坏真发生（副本里跨机 verdict 回到 ok）');
    const WA = load({ 'engines/perf-trace.js': brk });
    const P = WA.perfTrace;
    const snap = JSON.parse(JSON.stringify(P.snapshot('n10')));
    const im = P.importSnapshot(snap, { sameHost: false });
    const rows = im.rows.filter(function (r) { return r.then; });
    A(rows.length > 0, 'N10 前提：至少有一层可比对（空集上的「全部合规」恒真）');
    A(rows.every(function (r) { return r.verdict === 'ok'; }),
      'N10 破坏版里跨机比对自称判过且没问题（把「没判」写成「判过没问题」）');
    A(!rows.every(function (r) { return r.verdict === 'not-comparable'; }),
      'N10 同款判据在破坏版上失败');
  }
}

module.exports = { runAll: runAll, runRuntime: runRuntime, runInvariants: runInvariants, runNegative: runNegative, ANCHORS: ANCHORS, REL: REL };

if (require.main === module) {
  let pass = 0, fail = 0;
  const failures = [];
  const assert = function (c, m) { if (c) { pass++; } else { fail++; failures.push(m); console.log('  ✗ ' + m); } };
  runAll(assert); runRuntime(assert); runInvariants(assert); runNegative(assert);
  console.log('PERF-OBS-V2109: ' + (fail ? 'FAIL' : 'pass') + '（' + pass + ' 项 / 失败 ' + fail + '）');
  if (failures.length) console.log('失败项：' + failures.join(' | '));
  process.exit(fail ? 1 : 0);
}