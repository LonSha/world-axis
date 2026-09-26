#!/usr/bin/env node
// WorldAxis tests/hazard-weather-v2960.js —— v2.96.0（X6 判定面接天气：累积风险随天候滑落）
//
// 【它治的病：风险判定对天气一无所知】
//   weather.js 回答「此地此刻什么天气、耗时乘几」；hazard.js 回答「重复行为的概率滑落到哪」。
//   两者从不交谈，于是这一句话在世界状态里**无法表达**：
//       「同一件没有防护的事，在暴风雪里比在晴天更早出事」
//   而比「无法表达」更坏的是**回落**：把「天气面不可用」折进 factor:1，
//   于是「天气很好」与「根本不知道天气」长得一模一样，而这两件事的补救完全不同。
//
// 【口径（全是否定式）】
//   ① 判定面只**读**天气：hazard.js 源码里零天气写入口（观测不得改变被观测对象）。
//   ② 天气面不可用**不回落成「无影响」**：四态 link-off / engine-absent / missing / ok
//      各自可读（自身不可读时如实报 missing-fields），三态一律带 factor:1
//      —— 不是「天气好」，是「这一项没参与」。
//   ③ 不加修正 ≠ 天气没影响：回执里 targetBase 与 target 分列，两者必须能分辨。
//   ④ 天气不许把风险变成必然发生：修正后的目标值**硬下界 1**。
//   ⑤ 严重程度只有一个真源（weather.FACTOR）：本侧不叠第二套用户旋钮。
//   ⑥ 导出面刻意不变：targetFor 保持原签名；weatherAt / targetWith / weatherGain 不导出。
//   ⑦ 旧调用兼容：roll(key) 单参形态行为逐字不变（天气只在显式给地点时才参与）。
//   ⑧ 天气在**写事务之外**预读（weather.effect 走 store.get，放进事务里就是读自己正在写的快照）。
//   ⑨ 旧调用的分界是**显式给了 at 没有**：给了（哪怕空串）就一定带出天气面读数，
//      不给就落旧路径、回执里不出现 weather 字段；天气模块关着时也一律交成不可用态
//      —— 否则「关闭」会在回执里「有效且无修正」，与晴天逐字相同。
//
// 判据：
//   A 静态面：WEATHER_GAIN 常量 + 三助手在真源码 + 三助手**不**在导出面 +
//            targetFor 原签名 + 源码零 setWeather + 零新增控件（本版零新增导出）。
//   B 运行时面（真装载真调用）：
//     B0 前置：默认票面（baseTarget/floorTarget/revealDelay）与天气白名单都从产品面读
//     B1 单参 roll(key) 与旧行为逐字一致（不带 weather 字段、不看天气）
//     B2 天气修正真进目标值：storm 下 target < targetBase，且差值 = weatherGain(factor)
//     B3 映射规则从 FACTOR 读：逐天气实测下调量与「每 +0.5 系数 → −1」一致
//     B4 只借系数不改判定口径：掷骰 sides 仍取 baseTarget（天气改的是目标，不是骰面）
//     B5 硬下界 1：base 6 / floor 2 / 次数压到底 / storm(−2) ⇒ target 仍为 1（非 0）
//     B6 四态如实：link-off / missing / disabled / ok 各自可读，且三态一律不加修正
//     B7 不加修正 ≠ 无影响：晴天（valid 且 gain 0）与暴风（valid 且 gain>0）必须能分辨
//     B9 判定面不吃天气的写入口：整轮 roll 之后 weather.rows 与 weather.stat 字节级不变
//     B10 三个内部助手不进运行时导出对象（导出即有承诺，无消费方不挂）
//     B11 不给地点则天气不参与：单参 / 空 opts 调用的读数逐字相同（旧调用兼容是有意的）
//     B12 命中路径不被绕开：把目标压到 1 后必命中，pending / tick / confirm 走原语义
//     B13 四态两两可分辨（折叠任意两态即判失败）
//   C 不变式：hazard.roll 走 WA.rand.dice（不裸调 Math.random）；导出面与 v2.95.0 逐字相同。
//   N0–N5 负控制：**真源码破坏 ⇒ 加载破坏副本 ⇒ 在副本上重跑同款真判据**（不是只验文本被改过）。
//     N5 钉的是「假绿三形」之首：破坏必须真的替换掉锚点，而不是对原文件断言。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const HZ = 'engines/hazard.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自**只在本文件声明一次**）══════════════
const ANCHORS = {
  // 口径① 判定面只读天气：读天气这一句里不许夹带写
  READONLY_WEATHER: { rel: HZ, txt: 'const e = wx.effect(pl);' },
  // 口径② 引擎缺席不回落成「天气很好」
  NO_FALLBACK_ABSENT: { rel: HZ, txt: "if (!wx || typeof wx.effect !== 'function') return { ok: false, reason: 'engine-absent', place: pl, factor: 1 };" },
  // 口径③ 不加修正 ≠ 无影响（判定必须拿天气修正过的目标值）
  DISTINGUISH_BASE: { rel: HZ, txt: 'const tg = targetWith(row.count, eff);' },
  // 口径④ 天气不许把风险变成必然发生（硬下界 1）
  HARD_FLOOR_ONE: { rel: HZ, txt: 'return Math.max(1, base - g);' },
  // 口径⑤ 严重程度单一真源（换算只此一处，倍数取自 WEATHER_GAIN）
  SINGLE_SEVERITY: { rel: HZ, txt: 'return Math.max(0, Math.round((f - 1) * WEATHER_GAIN));' },
  // 口径② 该地未登记天气如实报 missing
  MISSING_HONEST: { rel: HZ, txt: "if (!e || !e.ok) return { ok: false, reason: (e && e.reason) || 'missing', place: pl, factor: 1 };" },
  // 口径⑦ 旧调用兼容的分界：显式给了 at 就一定带出天气面读数（含空地点的 link-off）
  HAS_AT_DISCRIMINATION: { rel: HZ, txt: 'const hasAt = !!(opts && opts.at !== undefined);' },
  // 口径② 「天气关着」不许被交成「有效且无修正」（否则关闭与晴天在回执里长得一样）
  DISABLED_NOT_SUNNY: { rel: HZ, txt: "if (e.reason === 'disabled') return { ok: false, reason: 'disabled', place: pl, factor: 1 };" }
};
// ══════════════ 破坏形态（每条对应一个可观测行为变化，不删行以免留下悬空结构）══════════════
//   纪律：破坏串**不得含对应锚点的字面量**（否则 N5 与 H5 会把「锚点还在」当成假象）。
const BREAK = {
  READONLY_WEATHER: "const e = (function () { try { wx.setWeather(pl, 'clear'); } catch (e0) {} return wx.effect(pl); })();",
  NO_FALLBACK_ABSENT: "if (!wx || typeof wx.effect !== 'function') return { ok: true, place: pl, kind: 'clear', factor: 1, reason: 'ok' };",
  DISTINGUISH_BASE: 'const tg = targetFor(row.count);',
  HARD_FLOOR_ONE: 'return Math.max(0, base - g);',
  SINGLE_SEVERITY: 'return Math.max(0, Math.round((f - 1) * 4));',
  MISSING_HONEST: "if (!e || !e.ok) return { ok: true, place: pl, kind: 'clear', factor: 1, reason: 'ok' };",
  HAS_AT_DISCRIMINATION: 'const hasAt = !!opts;',
  DISABLED_NOT_SUNNY: "if (false) return { ok: false, reason: 'disabled', place: pl, factor: 1 };"
};
/** 真源码破坏：锚点恰中 1 次才动手，返回 {rel, src} */
function breakOne(key) {
  const A = ANCHORS[key];
  const s = src(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}
// ══════════════ 运行时装置 ══════════════
const PL = { A: '甲镇', B: '乙镇', C: '丙镇' };
const HKEY = '怀孕';
/** 夹具复位到已知票面（fresh 复用宿主 localStorage，上一用例的存档会带着出场）。 */
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.world = { places: [], roads: [], events: [], journeys: [] };
    d.weather = { rows: [] };
    d.hazard = { rows: [] };
  }, 'v2960hz:seed');
  WA.world.addPlace({ name: PL.A, kind: 'public' });
  WA.world.addPlace({ name: PL.B, kind: 'public' });
  WA.world.addPlace({ name: PL.C, kind: 'public' });   // 登记地点但**不**登记天气 ⇒ missing 那一态
  WA.world.addRoad(PL.A, PL.B, 30);
  WA.world.setSettings({ enabled: true });
  WA.weather.setSettings({ enabled: true });
  WA.hazard.setSettings({ enabled: true, maxRows: 16, baseTarget: 10, floorTarget: 4, revealDelay: 3 });
  return WA;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H.WA;
}
function wx(WA, place, kind) { return WA.weather.setWeather(place, kind); }
/**
 * 把风险项复位成一个**干净的已知次数**再交回 roll。
 *   必要性：命中会置 pending，第二次 roll 立刻被 already-pending 拒收；
 *   而「同一实例里连掷两次」正是本版几条判据（纯读 / 可分辨）的手法。
 */
function freshHz(W, count) {
  W.store.transact(function (d) {
    d.hazard.rows = [{ key: HKEY, note: '测试', count: count || 0, hits: 0, pending: false, waiting: 0, at: 0 }];
  }, 'v2960hz:fh');
  return W.hazard.roll;
}
/** 把掷骰面钉死：返回 [回执, sides]，并在调用后复位——用于分离「天气改目标」与「掷骰本身」。 */
function rollWith(WA, key, opts, face) {
  const keep = WA.rand.dice;
  let sides = null;
  WA.rand.dice = function (s) { sides = s; return face; };
  let r = null;
  try { r = WA.hazard.roll(key, opts); } finally { WA.rand.dice = keep; }
  return { r: r, sides: sides };
}
/** 天气侧的快照（读表 + 读计数），用于「判定面不吃天气写入口」的字节级比对。 */
function wxSnap(W) {
  return JSON.stringify((W.store.get() || {}).weather) + '|' + JSON.stringify(W.weather.stat());
}
// ══════════════ 同款真判据（原版与破坏副本上跑的是同一批函数）═════════════
/** 口径①：判定面只读天气 —— 整轮判定之后天气表与天气计数**字节级不变**。 */
function probeReadonlyWeather(W) {
  try {
    wx(W, PL.B, 'storm');
    freshHz(W, 0);
    const before = wxSnap(W);
    W.hazard.roll(HKEY, { at: PL.B });
    freshHz(W, 0);
    W.hazard.roll(HKEY, { at: PL.B });
    const after = wxSnap(W);
    // 双向：不能写成 `before !== after`（那样「稳定不动」会被判成假），必须要求前后相等。
    return before === after && JSON.parse(after.split('|')[1]).sets === 1;
  } catch (e) { return false; }
}
/** 口径②：天气引擎缺席 ⇒ engine-absent 且**不加修正**（不回落成「天气很好」）。 */
function probeNoFallbackAbsent(W) {
  try {
    // 真模拟「模块缺席」：缺席就是它不在那儿。替换整个 WA.weather（而不是把它绞成
    //   一个「找不到」的壳——那走的是 missing 那一条路，验不到 engine-absent 这一条）。
    const keepWx = W.weather;
    let r = null;
    try {
      W.weather = undefined;
      freshHz(W, 0);
      r = W.hazard.roll(HKEY, { at: PL.B });
    } finally { W.weather = keepWx; }
    return !!r && r.ok === true && r.weather && r.weather.reason === 'engine-absent'
      && r.weather.valid === false && r.weather.place === PL.B && r.weather.factor === 1
      && r.weatherGain === 0 && r.target === r.targetBase && r.targetBase === 10;
  } catch (e) { return false; }
}
/** 口径③：不加修正 ≠ 天气没影响 —— 「修正生效」「根本没读」两种情形必须能分辨。 */
function probeDistinguishBase(W) {
  try {
    freshHz(W, 0);
    const noAt = rollWith(W, HKEY, {}, 1).r;
    wx(W, PL.B, 'storm');
    freshHz(W, 0);
    const storm = rollWith(W, HKEY, { at: PL.B }, 1).r;
    // 先判「两个回执都在」再进字段断言——否则 `undefined && ...` 会把 undefined 当 false 交回，
    //   而 `return undefined` 与 `return false` 在上层是同一件事，却让「回执根本没回来」也记成探针为假。
    if (!noAt || !storm || noAt.ok !== true || storm.ok !== true) return false;
    return storm.target < storm.targetBase && storm.weatherGain > 0
      && noAt.target === noAt.targetBase && noAt.weather === undefined;
  } catch (e) { return false; }
}
/** 口径④：天气不许把风险变成必然发生（硬下界 1）。 */
function probeHardFloorOne(W) {
  try {
    W.hazard.setSettings({ baseTarget: 6, floorTarget: 2 });
    wx(W, PL.B, 'storm');
    // 次数压到底：目标先被 count 压到 floorTarget(2)，再被 storm(−2) 压过 0 —— 硬下界必须提回 1。
    freshHz(W, 4);
    const r = rollWith(W, HKEY, { at: PL.B }, 1).r;
    return !!r && r.ok === true && r.target === 1 && r.targetBase === 2 && r.weatherGain === 2;
  } catch (e) { return false; }
}
/** 口径⑤：严重程度单一真源 —— 映射必须由 FACTOR 派生（换一套倍数必须现形）。 */
function probeSingleSeverity(W) {
  try {
    const out = [];
    W.weather.WEATHERS.forEach(function (k) {
      wx(W, PL.B, k);
      freshHz(W, 0);
      const r = rollWith(W, HKEY, { at: PL.B }, 1).r;
      out.push([k, r.targetBase - r.target, W.weather.FACTOR[k]]);
    });
    const bad = out.filter(function (x) { return x[1] !== Math.round((x[2] - 1) * 2); });
    return bad.length === 0 && out.filter(function (x) { return x[1] > 0; }).length >= 2;
  } catch (e) { return false; }
}
/** 口径②：该地未登记天气如实报 missing（不回落成「晴天」）。 */
function probeMissingHonest(W) {
  try {
    freshHz(W, 0);
    const r = rollWith(W, HKEY, { at: PL.C }, 1).r;   // 丙镇在册，但没有天气行
    return !!r && r.ok === true && r.weather && r.weather.valid === false && r.weather.reason === 'missing'
      && r.weather.place === PL.C && r.weather.factor === 1 && r.weatherGain === 0 && r.target === r.targetBase;
  } catch (e) { return false; }
}
/** 口径⑦：显式给了 at 就一定带出天气面读数 —— 空地点的 link-off 必须当场可读。 */
function probeHasAtDiscrimination(W) {
  try {
    freshHz(W, 0);
    const emptyAt = rollWith(W, HKEY, { at: '' }, 1).r;
    freshHz(W, 0);
    const noOpts = rollWith(W, HKEY, {}, 1).r;
    freshHz(W, 0);
    const noArg = W.hazard.roll(HKEY);
    // 显式取布尔：`a && b` 在 a 为 undefined 时返回 undefined，
    //   而 N1 判的是「探针必须交回 false」——`undefined !== false` 会被记成「破坏没现形」。
    return !!(emptyAt && emptyAt.weather && emptyAt.weather.reason === 'link-off'
      && emptyAt.weather.valid === false && emptyAt.target === emptyAt.targetBase
      && noOpts.weather === undefined && noArg.weather === undefined);
  } catch (e) { return false; }
}
/** 口径②：「天气关着」不许被交成「有效且无修正」（关闭与晴天必须能分辨）。 */
function probeDisabledNotSunny(W) {
  try {
    wx(W, PL.B, 'storm');
    W.weather.setSettings({ enabled: false });
    let r = null;
    try { freshHz(W, 0); r = W.hazard.roll(HKEY, { at: PL.B }); } finally { W.weather.setSettings({ enabled: true }); }
    return !!r && r.ok === true && r.weather && r.weather.reason === 'disabled'
      && r.weather.valid === false && r.weatherGain === 0 && r.target === r.targetBase;
  } catch (e) { return false; }
}
// ══════════════ A / B / C 判据 ══════════════
const EXP_NAMES = ['getSettings', 'setSettings', 'open', 'bump', 'roll', 'tick', 'confirm', 'read', 'drop',
  'buildBlock', 'targetFor', 'stat'];
function runAll(a) {
  const hSrc = src(HZ);
  // ── A 静态面 ──
  Object.keys(ANCHORS).forEach(function (k) {
    a(hits(src(ANCHORS[k].rel), ANCHORS[k].txt) === 1, 'v2960hz: [A1] 锚点在真源码恰中 1 次（' + k + '）');
  });
  a(hits(hSrc, 'setWeather') === 0,
    'v2960hz: [A2] hazard.js 源码**零天气写入口**（判定面只读；观测不得改变被观测对象）');
  a(hSrc.indexOf('const WEATHER_GAIN = 2;') > 0
    && hits(hSrc, 'function weatherGain(factor)') === 1
    && hits(hSrc, 'function weatherAt(place)') === 1
    && hits(hSrc, 'function targetWith(count, eff)') === 1,
    'v2960hz: [A2] 换算常量与三个内部助手都在真源码（且各自只此一处）');
  a(hits(hSrc, 'function targetFor(count)') === 1 && hSrc.indexOf('baseTarget: [6, 12], floorTarget: [2, 6]') > 0,
    'v2960hz: [A2] targetFor 原签名保持不变（旧调用兼容），且设置边界未被本版放宽');
  const expPart = hSrc.split('WA.hazard = {')[1] || '';
  const leaked = ['weatherAt:', 'targetWith:', 'weatherGain:', 'WEATHER_GAIN:'].filter(function (x) { return expPart.indexOf(x) >= 0; });
  a(leaked.length === 0,
    'v2960hz: [A3] 三个内部助手一律不进导出面（导出即有承诺，无消费方不挂；漏 ' + (leaked.join('、') || '无') + '）');
  a(expPart.indexOf('targetFor: targetFor,') > 0 && expPart.indexOf('roll: roll,') > 0,
    'v2960hz: [A3] targetFor / roll 仍在导出面（旧签名的公开承诺不撤）');
  a(src(PANEL).indexOf('id="wa-hz-') < 0,
    'v2960hz: [A4] 本版**不加**新控件（零新增出口 ⇒ 零新增按钮；无出口的按钮只会骗人）');

  // ── B 运行时面 ──
  const W = env();
  const cfg0 = W.hazard.getSettings();
  a(W.weather.WEATHERS.length === 6 && cfg0.baseTarget === 10 && cfg0.floorTarget === 4 && cfg0.revealDelay === 3,
    'v2960hz: [B0] 默认票面与天气白名单都从产品面读（实 ' + W.weather.WEATHERS.length + ' / '
    + cfg0.baseTarget + ' / ' + cfg0.floorTarget + ' / ' + cfg0.revealDelay + '）');
  a(W.hazard.targetFor(0) === 10 && W.hazard.targetFor(1) === 9 && W.hazard.targetFor(99) === 4,
    'v2960hz: [B0] targetFor 旧语义（−count、封底 floorTarget）未被本版改动');
  // B1 单参兼容
  freshHz(W, 0);
  const r1 = W.hazard.roll(HKEY);
  a(r1.ok === true && r1.weather === undefined && r1.weatherGain === 0 && r1.target === r1.targetBase,
    'v2960hz: [B1] 单参 roll(key) 与旧行为逐字一致（不带 weather 字段、不看天气，实 '
    + JSON.stringify({ w: r1.weather, g: r1.weatherGain }) + '）');
  // B11 不给地点 ⇒ 天气不参与（旧调用兼容是有意的）
  //   注意分界：`roll(key)` / `roll(key, {})` 走旧路径（无 weather 字段）；
  //   显式 `at: ''` 是**另一种**调用意图，带出 link-off 读数（见 B6）。
  const HB = fresh(); const WB = seed(HB.WA);
  wx(WB, PL.B, 'storm');
  freshHz(WB, 0);
  const noAtRun = WB.hazard.roll(HKEY);
  freshHz(WB, 0);
  const emptyOptsRun = WB.hazard.roll(HKEY, {});
  a(noAtRun.target === WB.hazard.targetFor(0) && noAtRun.weather === undefined,
    'v2960hz: [B11] 单参调用在暴风雪下**与晴天读数相同**（不给地点就不参与——兼容是有意的）');
  a(emptyOptsRun.target === noAtRun.target && emptyOptsRun.weather === undefined,
    'v2960hz: [B11] 空 opts 对象同样落旧路径（逐字兼容，不是「碰巧等价」）');
  // B2 修正真进目标值
  wx(W, PL.B, 'storm');
  freshHz(W, 0);
  const rs = W.hazard.roll(HKEY, { at: PL.B });
  a(rs.ok === true && rs.targetBase === 10 && rs.target === rs.targetBase - rs.weatherGain && rs.weatherGain > 0,
    'v2960hz: [B2] storm 下 target < targetBase 且 targetBase 不变（实 '
    + JSON.stringify({ base: rs.targetBase, tg: rs.target, g: rs.weatherGain }) + '）');
  a(rs.weather && rs.weather.place === PL.B && rs.weather.kind === 'storm' && rs.weather.valid === true
    && rs.weather.factor === W.weather.FACTOR.storm && rs.weather.reason === 'ok',
    'v2960hz: [B2] 回执带地点 / 天气名 / 系数（判定面必须能自证它读了哪条天气）');
  a(rs.weatherGain === Math.round((W.weather.FACTOR.storm - 1) * 2) && rs.target === 10 - rs.weatherGain,
    'v2960hz: [B2] 下调量由 FACTOR 派生（storm factor=' + W.weather.FACTOR.storm + ' ⇒ −'
    + rs.weatherGain + '，目标 10→' + rs.target + '）');
  // B3 逐天气实测映射（从 FACTOR 读，不抄表）
  const H3 = fresh(); const W3 = seed(H3.WA);
  W3.weather.WEATHERS.forEach(function (k) {
    wx(W3, PL.B, k);
    freshHz(W3, 0);
    const r = W3.hazard.roll(HKEY, { at: PL.B });
    const want = Math.round((W3.weather.FACTOR[k] - 1) * 2);
    a(r.ok === true && r.targetBase - r.target === want,
      'v2960hz: [B3] ' + k + ' 的修正量由 FACTOR(' + W3.weather.FACTOR[k] + ') 派生 ⇒ −' + want
      + '（实 −' + (r.targetBase - r.target) + '）');
  });
  // B4 掷骰口径不动：sides 仍取 baseTarget（天气改的是目标，不是骰面）
  const H4 = fresh(); const W4 = seed(H4.WA);
  wx(W4, PL.B, 'storm');
  freshHz(W4, 0);
  const p4 = rollWith(W4, HKEY, { at: PL.B }, 8);
  a(p4.sides === W4.hazard.getSettings().baseTarget,
    'v2960hz: [B4] 掷骰面仍取 baseTarget（天气只改目标值，不改骰面——实 ' + p4.sides + '）');
  a(p4.r.target === 8 && p4.r.face === 8 && p4.r.hit === true && p4.r.pending === true,
    'v2960hz: [B4] face=target 即命中（下界语义：target 恒 ≥1 ⇒ 「必中」说不出口，实 '
    + JSON.stringify({ t: p4.r.target, f: p4.r.face, hit: p4.r.hit }) + '）');
  // B5 硬下界 1
  const H5b = fresh(); const W5 = seed(H5b.WA);
  W5.hazard.setSettings({ baseTarget: 6, floorTarget: 2 });
  wx(W5, PL.B, 'storm');
  freshHz(W5, 4);
  const f5 = rollWith(W5, HKEY, { at: PL.B }, 1);
  a(f5.r.targetBase === 2 && f5.r.weatherGain === 2 && f5.r.target === 1,
    'v2960hz: [B5] 硬下界 1：base 6 / floor 2 / 次数到底 ⇒ 目标 2，再被 storm(−2) 压过 0 ⇒ 实 '
    + f5.r.target + '（旧算法会给 0）');
  a(f5.r.hit === true, 'v2960hz: [B5] 目标 1 时 face=1 命中（下界不是 0 ⇒ 天气不能让风险变成必然发生）');
  // B6 四态如实
  const H6 = fresh(); const W6 = seed(H6.WA);
  freshHz(W6, 0);
  const off = W6.hazard.roll(HKEY, { at: '' });
  a(off.ok === true && off.weather && off.weather.reason === 'link-off' && off.weather.valid === false
    && off.weather.place === '' && off.weather.factor === 1 && off.weatherGain === 0 && off.target === off.targetBase,
    'v2960hz: [B6] 显式给了 at 但地点为空 ⇒ link-off（当场可读，不是「静默不参与」，实 ' + JSON.stringify(off.weather) + '）');
  a(off.weather.place === '' && off.weather.reason !== 'ok',
    'v2960hz: [B6] 「没给地点」与「天气很好」在回执里长得不一样（本版全部意义所在）');
  freshHz(W6, 0);
  const mp = W6.hazard.roll(HKEY, { at: PL.C });
  a(mp.weather && mp.weather.reason === 'missing' && mp.weather.valid === false && mp.weather.factor === 1
    && mp.weather.place === PL.C && mp.weatherGain === 0 && mp.target === mp.targetBase,
    'v2960hz: [B6] 该地未登记天气 ⇒ missing 且不加修正（不回落成「晴天」，实 ' + JSON.stringify(mp.weather) + '）');
  wx(W6, PL.B, 'storm');
  W6.weather.setSettings({ enabled: false });
  freshHz(W6, 0);
  const dis = W6.hazard.roll(HKEY, { at: PL.B });
  a(dis.weather && dis.weather.reason === 'disabled' && dis.weather.valid === false
    && dis.weatherGain === 0 && dis.target === dis.targetBase,
    'v2960hz: [B6] 天气模块关闭 ⇒ reason=disabled 且不加修正（关闭不是「天气很好」，实 '
    + JSON.stringify(dis.weather) + '）');
  W6.weather.setSettings({ enabled: true });
  freshHz(W6, 0);
  const okk = W6.hazard.roll(HKEY, { at: PL.B });
  a(okk.weather && okk.weather.reason === 'ok' && okk.weather.valid === true && okk.weatherGain === 2
    && okk.target === okk.targetBase - 2,
    'v2960hz: [B6] 四态最后一态必须真生效（ok = valid 且 gain>0；否则前三态可以是靠「从不生效」蒙对的）');
  // B13 四态各自可分辨：把四种情形的 weather 读数摆在一起，任意两态必须有差异
  freshHz(W6, 0);
  const st6 = [off.weather, mp.weather, dis.weather, okk.weather].map(function (w) {
    return [w.reason, w.valid, w.factor, w.place].join('/');
  });
  a(new Set(st6).size === 4,
    'v2960hz: [B13] 四态在回执里两两可分辨（link-off / missing / disabled / ok 不得折叠成同一种「没影响」；实 '
    + JSON.stringify(st6) + '）');
  // B7 不加修正 ≠ 无影响（晴天与暴风必须能分辨）
  const H7 = fresh(); const W7 = seed(H7.WA);
  wx(W7, PL.A, 'clear');
  freshHz(W7, 0);
  const sun = W7.hazard.roll(HKEY, { at: PL.A });
  wx(W7, PL.A, 'storm');
  freshHz(W7, 0);
  const sto = W7.hazard.roll(HKEY, { at: PL.A });
  a(sun.weather.valid === true && sun.weather.kind === 'clear' && sun.weatherGain === 0 && sun.target === sun.targetBase
    && sto.weather.valid === true && sto.weather.kind === 'storm' && sto.weatherGain === 2 && sto.target < sto.targetBase
    && sun.target !== sto.target,
    'v2960hz: [B7] 晴天（valid 且 gain 0）与暴风（valid 且 gain>0）在回执里必须能分辨（实 '
    + JSON.stringify([sun.target, sun.weatherGain, sto.target, sto.weatherGain]) + '）');
  // B9 判定面不吃天气的写入口
  const H9 = fresh(); const W9 = seed(H9.WA);
  wx(W9, PL.B, 'storm');
  const wx0 = wxSnap(W9);
  const hz0 = JSON.stringify(W9.hazard.stat());
  freshHz(W9, 0); W9.hazard.roll(HKEY, { at: PL.B });
  freshHz(W9, 0); W9.hazard.roll(HKEY, { at: PL.B });
  a(wxSnap(W9) === wx0,
    'v2960hz: [B9] 判定面**不吃天气的写入口**：整轮判定后天气表与天气计数字节级不变');
  a(JSON.stringify(W9.hazard.stat()) !== hz0,
    'v2960hz: [B9] （对照）判定面自己的计数确实动了——纯读只针对天气侧，不是「什么都没发生」');
  // B10 三助手不进运行时导出对象
  const keys = Object.keys(W.hazard).sort();
  a(JSON.stringify(keys) === JSON.stringify(EXP_NAMES.slice().sort()),
    'v2960hz: [B10] 运行时导出面与 v2.95.0 逐字相同（新增能力一律不挂出口；实 ' + keys.join(',') + '）');
  a(['weatherAt', 'targetWith', 'weatherGain'].every(function (n) { return keys.indexOf(n) < 0; }),
    'v2960hz: [B10] weatherAt / targetWith / weatherGain 不在导出对象上（内部助手不得成为公开承诺）');
  // B12 命中路径不被天气绕开
  const H12 = fresh(); const W12 = seed(H12.WA);
  W12.hazard.setSettings({ baseTarget: 6, floorTarget: 2 });
  wx(W12, PL.B, 'snow');
  freshHz(W12, 4);
  const f12 = rollWith(W12, HKEY, { at: PL.B }, 1);
  a(f12.r.hit === true && f12.r.pending === true && f12.r.target === 1 && f12.r.weather.kind === 'snow',
    'v2960hz: [B12] 命中路径语义不变（pending 照原样置位，实 ' + JSON.stringify(f12.r) + '）');
  a(W12.hazard.read(HKEY).pending === true && W12.hazard.tick().advanced === 1,
    'v2960hz: [B12] tick 的等待推进不受天气影响（本版只动目标值，不动显形节奏）');
  a(W12.hazard.confirm(HKEY).reason === 'too-soon',
    'v2960hz: [B12] 显形延迟仍由 revealDelay 说话（tick 一次未达 3 轮 ⇒ too-soon）');
  W12.hazard.tick(); W12.hazard.tick();
  a(W12.hazard.confirm(HKEY).ok === true,
    'v2960hz: [B12] 等待满 revealDelay ⇒ 照旧显形（天气不改这条链的任何一个环节）');
  // ── C 不变式 ──
  a(hits(hSrc, "dice(sides, 'hazard')") === 2 && hits(hSrc, 'Math.random(') === 0,
    'v2960hz: [C1] 掷骰仍走 WA.rand.dice（裸调 Math.random 会绕过冻结种子，v2.14.0 起的全库纪律；'
    + '判据数的是**调用**而非注释散文，实 dice 调用 '
    + (hits(hSrc, "dice(sides, 'hazard')") - 1) + ' 处 / Math.random( ' + hits(hSrc, 'Math.random(') + ' 处）');
  const missC = EXP_NAMES.filter(function (n) { return expPart.indexOf(n) >= 0; });
  a(missC.length === EXP_NAMES.length,
    'v2960hz: [C2] 源码导出清单与 v2.95.0 逐字相同（本版零增零删；实 ' + missC.length + '/' + EXP_NAMES.length + '）');
}
// ══════════════ 负控制（真源码破坏 → 破坏副本 → 副本上重跑同款真判据）══════════════
function runNegative(a) {
  const CASES = [
    ['READONLY_WEATHER', probeReadonlyWeather, '判定面只读天气（不吃天气的写入口）'],
    ['NO_FALLBACK_ABSENT', probeNoFallbackAbsent, '引擎缺席不回落成「天气很好」'],
    ['DISTINGUISH_BASE', probeDistinguishBase, '不加修正 ≠ 天气没影响'],
    ['HARD_FLOOR_ONE', probeHardFloorOne, '天气不许把风险变成必然发生'],
    ['SINGLE_SEVERITY', probeSingleSeverity, '严重程度只有一个真源'],
    ['MISSING_HONEST', probeMissingHonest, '该地未登记天气如实报 missing'],
    ['HAS_AT_DISCRIMINATION', probeHasAtDiscrimination, '显式给了 at 就带出天气面读数'],
    ['DISABLED_NOT_SUNNY', probeDisabledNotSunny, '天气关着不许被交成「有效且无修正」']
  ];
  // N1 六锚点各中 1 次，且原版上同款判据为真、破坏副本上由真变假
  let n1 = 0;
  CASES.forEach(function (c) {
    try {
      const br = breakOne(c[0]);
      must1(src(ANCHORS[c[0]].rel), ANCHORS[c[0]].txt, c[0] + ':origin');
      if (c[1](env()) !== true) throw new Error('probe false on ORIGINAL');
      const o = {}; o[br.rel] = br.src;
      if (c[1](env(o)) !== false) throw new Error('probe still true on BROKEN');
      n1++;
    } catch (e) { console.log('  ✗ N1 ' + c[0] + ' (' + c[2] + '): ' + e.message); }
  });
  a(n1 === CASES.length, 'v2960hz: [N1] ' + CASES.length + ' 向破坏各自现形（真源码破坏 ⇒ 破坏副本上同款判据由真变假）');

  // N0 六锚点在真源码各中 1 次（与 A1 分列：A1 是产品契约，N0 是负控制的前置）
  let n0 = 0;
  Object.keys(ANCHORS).forEach(function (k) {
    try { must1(src(ANCHORS[k].rel), ANCHORS[k].txt, k); n0++; } catch (e) {}
  });
  a(n0 === Object.keys(ANCHORS).length, 'v2960hz: [N0] ' + Object.keys(ANCHORS).length + ' 条锚点在真源码各中恰 1 次');

  // N2 读数随事实变化（同一实例内 0 → 1，不跨段复用实例）
  const W = env();
  a(W.hazard.stat().rolls === 0 && (((W.store.get() || {}).hazard || {}).rows || []).length === 0,
    'v2960hz: [N2] 起始零次判定、零风险项');
  freshHz(W, 0);
  a((((W.store.get() || {}).hazard || {}).rows || []).length === 1, 'v2960hz: [N2] 登记一项 ⇒ 行数 0 → 1');
  W.hazard.roll(HKEY, { at: PL.B });
  a(W.hazard.stat().rolls === 1, 'v2960hz: [N2] 判定一次 ⇒ rolls 0 → 1（读数真的随事实走）');
  a(W.hazard.read(HKEY).count === 0 && W.hazard.bump(HKEY).count === 1 && W.hazard.read(HKEY).count === 1,
    'v2960hz: [N2] bump 让次数真长（不是恒值读数）');

  // N3 坏参数各自点名
  const W3 = env();
  a(W3.hazard.roll('').reason === 'missing-fields' && W3.hazard.roll('没登记过的').reason === 'missing',
    'v2960hz: [N3] 空风险名与未登记风险项各自点名（不把「没给」与「没找到」混为一谈）');
  a(W3.hazard.roll(HKEY, { at: PL.B }).reason === 'missing', 'v2960hz: [N3] 天气面可用也不许凭空造风险项');
  const W3b = env();
  W3b.hazard.setSettings({ enabled: false });
  a(W3b.hazard.roll(HKEY, {}).reason === 'disabled' && W3b.hazard.roll(HKEY, {}).weather === undefined,
    'v2960hz: [N3] 总开关关闭时不进入判定（如实报 disabled；且**天气面根本不被读**）');

  // N4 工具两向自证：锚点不存在 / 不唯一须抛；破坏须可观测改行为
  let n4 = 0;
  try { must1(src(HZ), 'const NO_SUCH_ANCHOR_2960 = 1;', 'n4-absent'); } catch (e) { n4++; }
  try { must1(src(HZ), 'WA.store.transact', 'n4-not-unique'); } catch (e) { n4++; }
  try {
    const br = breakOne('DISTINGUISH_BASE');
    const broken = (function () { const o = {}; o[br.rel] = br.src; return o; })();
    // 必须先**给天气**再比：晴天与暴风都没参与时两侧读数逐字相同，差异根本观测不到。
    const targetAfter = function (W) {
      wx(W, PL.B, 'storm');
      freshHz(W, 0);
      return W.hazard.roll(HKEY, { at: PL.B }).target;
    };
    const so = targetAfter(env()), sb = targetAfter(env(broken));
    if (so === 8 && sb === 10) n4++;
  } catch (e) {}
  a(n4 === 3, 'v2960hz: [N4] 锚点不存在/不唯一各自抛；且破坏真能改变可观测行为（工具两向自证）');

  // N5 判据纯度：破坏形态必须**真进源码**（不是写死的模拟常量），且不得与锚点同形
  let n5 = 0;
  Object.keys(ANCHORS).forEach(function (k) {
    const br = breakOne(k);
    if (br.src.indexOf(ANCHORS[k].txt) < 0 && br.src !== src(ANCHORS[k].rel)) n5++;
  });
  a(n5 === Object.keys(ANCHORS).length,
    'v2960hz: [N5] 每条破坏形态都真的替换掉了锚点（假绿三形之一：对原文件断言 ⇒ 破坏没发生也绿）');

  // H5 判据纯度：负控制层内每条锚点字面量只声明一次（判据不得引用锚点串）
  const self = src('tests/hazard-weather-v2960.js');
  const ok5 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok5, 'v2960hz: [H5] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
// ══════════════ 入口 ══════════════
if (require.main === module) {
  let pass = 0, fail = 0;
  const a2 = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('HAZARD-WEATHER-V2960: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('HAZARD-WEATHER-V2960: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };
