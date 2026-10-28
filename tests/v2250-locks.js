// WorldAxis tests/v2250-locks.js (v2.250.0) — 四个真空区引擎专锁
//   （主动的时机 / 只这一轮的临时调制 / 情绪惯性 / 别替玩家说话）
//
// 【锁什么、为什么这四把要锁在一起】
//   四个引擎治的是同一类病：**「一次」与「一直」被模型混为一谈**。
//     · genTiming  —— 主动搭话没有时机（凌晨三点和下午三点一样拽你）；
//     · oneShotMod —— 「只这一轮咳嗽」没有出口，只能写进长期设定然后忘了撤；
//     · moodGlide  —— 一场口角变成永久记仇，久别十年反而毫无惦记；
//     · outputGuard—— 正文替玩家说话，玩家没说过的话被写成引述。
//   四条共用两条纪律：
//     ① **一次性不许变成一直**（过期 / 回落 / 放行 都要有真出口）；
//     ② **拒收要带理由码**（不静默失效 —— 静默失效正是这类引擎最危险的形态：
//        关了跟坏了一样，外面看不出来）。
//
// 【负控制（先跑成红是纪律）】
//   N1 空/非法入参一律带码拒收，且不写坏存档。
//   N2 开关关闭时各入口判 disabled，不掷骰、不入队、不推进、不出块。
//   N3 硬闸优先于软判：安静时段内即便掷骰命中也不发；最小间隔内不连发。
//   N4 幂等：oneShotMod.consume 同 id 第二次不重复计数（not-queued）。
//   N5 队列满如实拒收（queue-full），不挤掉旧条目。
//   N6 情绪夹紧：越界输入被夹在 [-1,1]，不溢出。
//   N7 伪造引述被逮；改写成旁白（无引号）不判；短引述放行。
//   N8 无观测时用先验（不臆造），后验和为 1。
//   N9 事务抛错如实归因 store-unavailable 且不半写。
//   N10 空 id 销账带码。
//   N0 两向自证：同一正面用例在开/关两种状态下必须换结论（判据不是恒真）。
//
// 【为什么自带 store / settingsBus 桩而不是 require 真模块】
//   四把锁要驱动的全是**边界**（跨零点安静时段、ttl 过期、基线回落、lookback 截断），
//   真 store 落盘会把本锁变成有副作用的慢用例；桩保留「抛错即不提交」这一条真语义，
//   骨架物化与容量（G18/registryParity）由那几把专锁负责，不在这里重复。
'use strict';

global.window = global;
const WorldAxis = global.WorldAxis = global.WorldAxis || {};

WorldAxis.log = function () {};
WorldAxis.clock = { now: function () { return 1700000000000; }, wallNow: function () { return 1700000000000; } };
WorldAxis.inputGuard = { text: function (v, max) { return String(v == null ? '' : v).trim().slice(0, max); } };
WorldAxis.evict = {
  array: function (arr, site, cap) {
    if (!Array.isArray(arr)) return { ok: false, reason: 'not-array' };
    if (typeof cap !== 'number') return { ok: false, reason: 'bad-cap' };
    if (arr.length > cap) arr.splice(0, arr.length - cap);
    return { ok: true, dropped: 0 };
  },
  object: function (obj, site, ordered, cap) {
    if (typeof cap !== 'number') return { ok: false, reason: 'bad-cap', dropped: 0 };
    const keys = Array.isArray(ordered) ? ordered.slice() : Object.keys(obj);
    const excess = Object.keys(obj).length - cap;
    if (excess <= 0) return { ok: true, dropped: 0 };
    keys.slice(0, excess).forEach(function (k) { delete obj[k]; });
    return { ok: true, dropped: excess };
  },
  note: function () { return { ok: true }; }
};

let store = {};
WorldAxis.store = {
  get: function () { return store; },
  // 事务语义与真 store 同口径：回调抛错 ⇒ 草稿丢弃（半写不留）
  transact: function (fn, site) {
    const draft = JSON.parse(JSON.stringify(store));
    fn(draft);
    store = draft;
    return { ok: true, site: site };
  }
};

const SETTINGS = {};
WorldAxis.settingsBus = {
  read: function (reg) { return Object.assign({}, reg.def, SETTINGS[reg.key] || {}); },
  normalize: function (reg, val) { return Object.assign({}, reg.def, val || {}); },
  saveOrThrow: function (reg, val) { SETTINGS[reg.key] = val; return val; }
};

// v2.257.0：**必须清掉引擎的 require 缓存再加载**。
//   治的病（全量回归里本锁 8 条红，独立跑 98/0 全绿 —— 「靠顺序活着」的典型）：
//   引擎模块在**加载那一刻**就把宿主钉进了闭包（`const WA = window.WorldAxis = window.WorldAxis || {}`）。
//   全量里前面的用例可能已经把引擎加载过一次、且当时那个 WorldAxis 是**另一个对象**；
//   本锁再 require 时命中缓存 ⇒ 拿到的引擎仍绑在旧宿主，而本锁的 store 桩装在本锁看到的
//   host 上。于是引擎读写旧宿主的 store，本锁断言读新宿主的 store ⇒
//   「shouldSend 通过、但 lastSentAt/ledger 读不到」「pending 为空 ⇒ pending[0].kind 抛错」。
//   独立跑时宿主是全新的、缓存是空的，引擎正好绑到本锁宿主 ⇒ 必然绿。
//   修法：加载前 delete 掉这四个模块的缓存条目，让它们按本锁的 WorldAxis 重新绑定。
//   （只清引擎条目，不动别的模块；本锁自带全套桩，重绑不会碰到真实落盘。）
['gen-timing', 'one-shot-mod', 'mood-glide', 'output-guard'].forEach(function (n) {
  const p = require.resolve('../engines/' + n + '.js');
  delete require.cache[p];
});
require('../engines/gen-timing.js');
require('../engines/one-shot-mod.js');
require('../engines/mood-glide.js');
require('../engines/output-guard.js');

const GT = WorldAxis.genTiming;
const OSM = WorldAxis.oneShotMod;
const MG = WorldAxis.moodGlide;
const OG = WorldAxis.outputGuard;

function seed() {
  store = {
    genTiming: { p: null, lastTickAt: 0, lastSentAt: 0, ledger: [] },
    oneShotMod: { pending: [], round: 0 },
    moodGlide: { moods: {}, baselines: {} }
  };
}
/** 清空设置（回 DEF 真值）——否则相邻用例会继承上一段的旋钮，读数就不再是本段的。 */
function reset() { Object.keys(SETTINGS).forEach(function (k) { delete SETTINGS[k]; }); }
function on(ns, patch) { ns.setSettings(Object.assign({ enabled: true }, patch || {})); }
function off(ns) { ns.setSettings({ enabled: false }); }

// ══════════════════════════════════════════════════════════
// GT — 主动的时机（gen-timing）
// ══════════════════════════════════════════════════════════
function gtAll(a) {
  a(!!GT, 'GT: 模块导出存在');
  reset();
  seed();

  // 正面：三闸全过 + roll 命中 ⇒ 该发
  on(GT, { quietStart: '00:00', quietEnd: '00:01', minIntervalHours: 0, utilityThreshold: 0.01, minInfoGain: 0.01, lambdaRate: 5, growthFactor: 0.5 });
  const r1 = GT.tick({ hour: 14, replyGapMin: 20, replyLen: 40, roll: 0 });
  a(r1.ok === true && r1.shouldSend === true, 'GT 正面：三闸全过 + roll 命中 ⇒ shouldSend');
  a(r1.reason === '', 'GT 正面：发出时 reason 为空串（不是「没发」的码）');
  a(store.genTiming.lastSentAt > 0, 'GT 正面：发出后写 lastSentAt');
  a(store.genTiming.ledger.length === 1 && store.genTiming.ledger[0].send === true, 'GT 正面：台账如实记 send');

  // 硬闸②：安静时段（把 0-23 全段设成安静）
  reset(); seed();
  on(GT, { quietStart: '00:00', quietEnd: '23:59', minIntervalHours: 0 });
  const rQ = GT.tick({ roll: 0 });
  a(rQ.shouldSend === false && rQ.reason === 'quiet-hours', 'GT N3：安静时段硬闸优先于掷骰');
  a(rQ.posterior !== null && typeof rQ.utility === 'number', 'GT N3：被安静挡也照样给读数（答得出为什么不发）');

  // 硬闸③：反连发
  reset(); seed();
  on(GT, { quietStart: '00:00', quietEnd: '00:01', minIntervalHours: 5 });
  store.genTiming.lastSentAt = 1700000000000;
  const rI = GT.tick({ roll: 0 });
  a(rI.shouldSend === false && rI.reason === 'min-interval', 'GT N3：最小间隔内不连发');

  // 渴望累积 + 封顶 + 命中回落
  reset(); seed();
  on(GT, { quietStart: '00:00', quietEnd: '00:01', minIntervalHours: 0, lambdaRate: 0.15, growthFactor: 0.08, maxProbability: 0.95 });
  const first = GT.tick({ roll: 0.999999 });
  a(first.shouldSend === false && first.reason === 'miss', 'GT：roll 不命中判 miss');
  const second = GT.tick({ roll: 0.999999 });
  a(second.probability > first.probability, 'GT：未命中后渴望累积（下一次概率更高）');
  for (let i = 0; i < 40; i++) GT.tick({ roll: 0.999999 });
  a(GT.read().probability <= 0.95 + 1e-9, 'GT ⑤：渴望封顶 maxProbability');
  seed();
  const before = GT.read().probability;
  const hit = GT.tick({ roll: 0 });
  a(hit.ticked === true, 'GT ⑤：命中');
  a(GT.read().probability < 0.95, 'GT ⑤：命中后渴望回落（不单调上涨）');

  // 价值闸：增益不足
  reset(); seed();
  on(GT, { quietStart: '00:00', quietEnd: '00:01', minIntervalHours: 0, utilityThreshold: 0.01, minInfoGain: 0.99, lambdaRate: 5 });
  const rL = GT.tick({ hour: 14, roll: 0 });
  a(rL.shouldSend === false && rL.reason === 'low-info', 'GT：增益不足判 low-info（不发「在吗」式空话）');

  // 效用闸：深夜久无回复 ⇒ 睡意压倒
  reset(); seed();
  on(GT, { quietStart: '00:00', quietEnd: '00:01', minIntervalHours: 0, utilityThreshold: 0.99, lambdaRate: 5 });
  const rU = GT.tick({ hour: 3, replyGapMin: 400, roll: 0 });
  a(rU.shouldSend === false && rU.reason === 'low-utility', 'GT N8：效用不足判 low-utility');

  // 后验：无观测用先验且归一
  const prior = GT.posterior({});
  let sum = 0;
  Object.keys(prior).forEach(function (k) { sum += prior[k]; });
  a(Math.abs(sum - 1) < 1e-9, 'GT N8：无观测时后验 = 先验且归一（不臆造）');
  const post3 = GT.posterior({ hour: 3, replyGapMin: 400 });
  a((post3.asleep || 0) > (prior.asleep || 0), 'GT：深夜久无回复抬 asleep');
  a(GT.utilityOf(post3) <= GT.utilityOf(prior), 'GT ④：睡意抬升 ⇒ 打扰效用下降');

  // 关开关
  reset(); seed();
  off(GT);
  const rD = GT.tick({ roll: 0 });
  a(rD.shouldSend === false && rD.reason === 'disabled', 'GT N2：关开关判 disabled');
  a(GT.buildBlock() === '', 'GT N2：关开关 buildBlock 返回空串（不占额度）');

  // 安静时段跨零点（左闭右开）
  reset();
  on(GT, { quietStart: '23:00', quietEnd: '07:00' });
  a(GT.inQuiet(new Date(2026, 0, 1, 23, 30).getTime()) === true, 'GT ⑥：跨零点区间内判安静');
  a(GT.inQuiet(new Date(2026, 0, 1, 12, 0).getTime()) === false, 'GT ⑥：区间外不判安静');
  a(GT.inQuiet(new Date(2026, 0, 1, 7, 0).getTime()) === false, 'GT ⑥：右开（07:00 整算醒着）');
  a(GT.inQuiet(new Date(2026, 0, 1, 23, 0).getTime()) === true, 'GT ⑥：左闭（起点含）');

  // 非法时段不冒充午夜
  reset();
  on(GT, { quietStart: 'xx', quietEnd: '07:00' });
  a(GT.inQuiet(new Date(2026, 0, 1, 3, 0).getTime()) === false, 'GT ②：非法时段不拿 0 冒充午夜');
}

// ══════════════════════════════════════════════════════════
// OSM — 只这一轮的临时调制（one-shot-mod）
// ══════════════════════════════════════════════════════════
function osmAll(a) {
  a(!!OSM, 'OSM: 模块导出存在');
  reset(); seed();
  on(OSM, { maxPending: 3, defaultTtl: 1, maxTtl: 3 });

  const d1 = OSM.dose({ kind: 'body', text: '他咳得厉害' });
  a(d1.ok === true && !!d1.id, 'OSM 正面：投一粒成功并回 id');
  a(store.oneShotMod.pending.length === 1 && store.oneShotMod.pending[0].ttl === 1, 'OSM：默认 ttl = 1（只活一轮）');

  const blk = OSM.buildBlock();
  a(blk.indexOf('只这一轮的临时调制') >= 0 && blk.indexOf('他咳得厉害') >= 0, 'OSM 正面：注入块摊出这一粒');
  a(blk.indexOf('只在这一轮有效') >= 0, 'OSM 正面：块里明写「只这一轮」（防写成长期设定）');

  // N4 幂等
  const c1 = OSM.consume(d1.id);
  a(c1.ok === true && c1.stillQueued === false, 'OSM N4：首次销账成功');
  a(store.oneShotMod.pending.length === 0, 'OSM N4：销账后出队（消费即焚）');
  const c2 = OSM.consume(d1.id);
  a(c2.ok === true && c2.consumed === null && c2.reason === 'not-queued', 'OSM N4：二次销账不重复成功（not-queued）');

  // N5 队列满如实拒收
  seed();
  OSM.dose({ text: 'a' }); OSM.dose({ text: 'b' }); OSM.dose({ text: 'c' });
  const dfull = OSM.dose({ text: 'd' });
  a(dfull.ok === false && dfull.reason === 'queue-full', 'OSM N5：满则如实拒收 queue-full');
  a(store.oneShotMod.pending.length === 3 && store.oneShotMod.pending[0].text === 'a', 'OSM N5：拒收不挤掉旧条目（最旧那条仍在）');

  // ⑤ 过期按轮数
  seed();
  const dT = OSM.dose({ text: '一场雨', kind: 'scene', ttl: 1 });
  const adv = OSM.advance();
  a(adv.ok === true && adv.expired.length === 1 && adv.expired[0].id === dT.id, 'OSM ⑤：按轮过期并如实列出 expired');
  a(store.oneShotMod.pending.length === 0, 'OSM ⑤：过期后出队');
  a(OSM.stat().expired >= 1, 'OSM ⑤：过期计数入账（不静默消失）');

  seed();
  OSM.dose({ text: '两天', ttl: 2 });
  OSM.advance();
  a(store.oneShotMod.pending.length === 1 && store.oneShotMod.pending[0].ttl === 1, 'OSM ⑤：ttl 递减而非立刻作废');
  OSM.advance();
  a(store.oneShotMod.pending.length === 0, 'OSM ⑤：第二轮才作废');

  // N1 空文本
  a(OSM.dose({ text: '   ' }).reason === 'empty-text', 'OSM N1：空文本拒收 empty-text');

  // kind 白名单：未知 kind 落 scene（不静默丢弃）
  seed();
  const dk = OSM.dose({ text: 'x', kind: '不存在的类型' });
  a(dk.ok === true && store.oneShotMod.pending[0].kind === 'scene', 'OSM：未知 kind 落默认 scene');

  // N2 关开关
  reset(); seed();
  off(OSM);
  a(OSM.dose({ text: 'y' }).reason === 'disabled', 'OSM N2：关开关拒投 disabled');
  a(OSM.buildBlock() === '', 'OSM N2：关开关不出块');

  // flush
  reset(); seed();
  on(OSM);
  OSM.dose({ text: 'p' }); OSM.dose({ text: 'q' });
  const fl = OSM.flush();
  a(fl.ok === true && fl.dropped === 2 && store.oneShotMod.pending.length === 0, 'OSM：flush 一次带走并回报条数');
}

// ══════════════════════════════════════════════════════════
// MG — 情绪惯性（mood-glide）
// ══════════════════════════════════════════════════════════
function mgAll(a) {
  a(!!MG, 'MG: 模块导出存在');
  reset(); seed();
  on(MG, { halfLifeMinutes: 60, longingRate: 0.05, baselinePull: 1, maxMoods: 3 });

  MG.setBaseline('阿岚', { v: 0.2 });
  const s1 = MG.set('阿岚', { v: -0.34, why: '为了碗的事吵了一架' });
  a(s1.ok === true, 'MG 正面：写冲击成功');
  a(Math.abs(MG.read('阿岚').mood.v - (-0.14)) < 1e-9, 'MG 正面：冲击按 delta 落到坐标上');

  // ③ 回落目标是基线（不是 0）
  const g1 = MG.glide({ elapsedMinutes: 60 * 8 });
  a(g1.ok === true && g1.rows.length === 1, 'MG：glide 返回推进读数');
  a(Math.abs(MG.read('阿岚').mood.v - 0.2) < 0.02, 'MG ③：久置后回落到**基线**（0.2），不是回 0');

  // ④ 步进上限 + N6 夹紧
  seed();
  MG.set('阿岚', { v: -1 });
  a(MG.read('阿岚').mood.v <= -0.3 + 1e-9 && MG.read('阿岚').mood.v >= -1, 'MG：单次步进被 clampStep 限制');
  for (let i = 0; i < 10; i++) MG.set('阿岚', { v: -1, a: -1, d: -1 });
  const m10 = MG.read('阿岚').mood;
  a(m10.v >= -1 && m10.a >= -1 && m10.d >= -1, 'MG N6：反复写负值不越界');
  for (let i = 0; i < 20; i++) MG.set('阿岚', { v: 1, a: 1, d: 1 });
  const m20 = MG.read('阿岚').mood;
  a(m20.v <= 1 && m20.a <= 1 && m20.d <= 1, 'MG N6：反复写正值不越界');

  // ⑤ 思念：增长 / 封顶 / 不衰减
  seed();
  MG.miss('阿岚', 0.5);
  a(MG.read('阿岚').mood.longing === 0.5, 'MG ⑤：miss 直接抬思念');
  MG.glide({ elapsedMinutes: 60 * 100 });
  a(MG.read('阿岚').mood.longing >= 0.5, 'MG ⑤：久别后思念继续累积（不衰减）');
  MG.miss('阿岚', 10);
  a(MG.read('阿岚').mood.longing === 1, 'MG ⑤：思念封顶 1');
  MG.glide({ elapsedMinutes: 60 * 100 });
  a(MG.read('阿岚').mood.longing === 1, 'MG ⑤：封顶后不再增长');

  // ⑥ 基线只收声明过的键
  const bset = MG.setBaseline('阿岚', { v: 0.5, 不是轴: 9 });
  a(bset.ok === true && bset.baseline.v === 0.5 && bset.baseline['不是轴'] === undefined, 'MG ⑥：未知基线键不收');
  a(MG.baselineOf('阿岚').v === 0.5, 'MG ⑥：基线可回落读取');

  const blk = MG.buildBlock();
  a(blk.indexOf('情绪惯性') >= 0 && blk.indexOf('半衰期') >= 0, 'MG 正面：buildBlock 出块并写明半衰期口径');

  // 全贴基线后不出块（思念是**独立维度**，久别本来就该挂着；这一条只验三轴，
  //   所以把 longing 显式归零，否则测的就不是「贴回基线」而是「想念还在」）
  seed();
  MG.set('阿岚', { v: 0.2 });
  MG.glide({ elapsedMinutes: 60 * 20 });
  store.moodGlide.moods['阿岚'].longing = 0;
  a(MG.buildBlock() === '', 'MG 正面：全部贴基线后不出块');

  // N1 非法入参
  a(MG.set('', { v: 1 }).reason === 'missing-person', 'MG N1：空人名拒收');
  a(MG.set('阿岚', {}).reason === 'missing-delta', 'MG N1：空 delta 拒收');
  a(MG.setBaseline('阿岚', {}).reason === 'missing-baseline', 'MG N1：空基线拒收');

  // N2 关开关
  reset();
  off(MG);
  a(MG.set('阿岚', { v: 1 }).reason === 'disabled', 'MG N2：关开关拒写 disabled');
  a(MG.glide({}).ok === false, 'MG N2：关开关不推进');
  a(MG.buildBlock() === '', 'MG N2：关开关不出块');

  // ⑦ 容器上界：按 at 最旧挑人
  reset(); seed();
  on(MG, { maxMoods: 3 });
  ['甲', '乙', '丙'].forEach(function (n, i) {
    store.moodGlide.moods[n] = { v: 0, a: 0, d: 0, longing: 0, at: 1000 + i };
  });
  a(MG.set('丁', { v: 0.3 }).ok === true, 'MG ⑦：满时新来者仍写成功');
  a(Object.keys(store.moodGlide.moods).length <= 3, 'MG ⑦：容器不超上界');
  a(store.moodGlide.moods['丁'] !== undefined, 'MG ⑦：新写的那条存活');
  a(store.moodGlide.moods['甲'] === undefined, 'MG ⑦：最旧的那条被挑掉（甲 at 最小）');
  a(store.moodGlide.moods['丙'] !== undefined, 'MG ⑦：次旧的仍在');
}

// ══════════════════════════════════════════════════════════
// OG — 别替玩家说话（output-guard）
// ══════════════════════════════════════════════════════════
function ogAll(a) {
  a(!!OG, 'OG: 模块导出存在');
  reset();
  on(OG, { mode: 'block', strict: false });

  // 抽取面
  const ex = OG.extract('你推门进来，你说「我早想去了」。你笑了笑。');
  a(ex.length === 1 && ex[0].quote === '我早想去了', 'OG ①：只抽带引号的玩家引述，旁白不抽');
  a(OG.extract('他说「你走吧」').length === 0, 'OG ②：角色说的话不判');

  // N7 伪造被逮
  const rF = OG.check('你点点头说「那就这么办吧」。', ['嗯，好']);
  a(rF.ok === false && rF.fabricated.length === 1 && rF.reason === 'fabricated-user-quote', 'OG N7：伪造引述被逮并带原因码');
  a(rF.suggestions.length === 1 && rF.suggestions[0].indexOf('没找到') >= 0, 'OG ⑧：给出改写建议');

  const rT = OG.check('你说「那就这么办吧」，他点头。', ['那就这么办吧']);
  a(rT.ok === true && rT.fabricated.length === 0 && rT.verified === 1, 'OG 正面：真说过的引述通过');

  const rS = OG.check('你说「嗯」就坐下了。', ['好']);
  a(rS.quotes === 0 && rS.reason === 'all-quotes-too-short', 'OG ③：短引述放行');

  const rDup = OG.check('你说「明日午时动身」；过了一会你说「明日午时动身」。', ['明日午时动身']);
  a(rDup.verified === 2 && rDup.fabricated.length === 0, 'OG ⑤：同一句各记 verified，不互相算分');

  // ⑦ strict：半真半假
  const mixed = '你说「明日午时动身」。你说「带上银两」。';
  a(OG.check(mixed, ['明日午时动身']).ok === true, 'OG ⑦：非 strict 时半真半假不整段拦');
  on(OG, { strict: true });
  a(OG.check(mixed, ['明日午时动身']).ok === false, 'OG ⑦：strict 时一句伪造即拦');

  // warn 档
  on(OG, { mode: 'warn', strict: false });
  const rW = OG.check('你说「带上银两」。', ['明日午时动身']);
  a(rW.ok === true && rW.fabricated.length === 1 && rW.mode === 'warn', 'OG：warn 档只记账不拦');

  // N1 空文本 / 除零
  a(OG.check('', ['x']).reason === 'empty-text', 'OG N1：空正文如实报 empty-text');
  a(OG.overlap('', ['x']) === 0, 'OG N1：空引述重合度 0（不除零）');

  const rNone = OG.check('你说「随便吧」。', []);
  a(rNone.fabricated.length === 1 && rNone.fabricated[0].why === 'no-user-message', 'OG：无玩家发言时 why=no-user-message');

  // ④ lookback
  on(OG, { lookback: 1 });
  a(OG.check('你说「明日午时动身」。', ['上一句', '明日午时动身', '更近的一句']).fabricated.length === 1, 'OG ④：只在 lookback 条内找');

  // 阈值旋钮真的生效（阈值 1 = 逐字）
  on(OG, { lookback: 6, threshold: 1 });
  //   注意 norm() 会吃掉标点，所以「明日午时，动身」与「明日午时动身」在阈值 1 下**仍算逐字**；
  //   要真验「非逐字不通过」，得多一个字（bigram 侧留下一个落空的格）。
  a(OG.check('你说「明日午时动身」。', ['明日午时动身']).fabricated.length === 0, 'OG ⑥：阈值 1 下逐字相同仍通过（判据不是恒拒）');
  a(OG.check('你说「明日午时动身吧」。', ['明日午时动身']).fabricated.length === 1, 'OG ⑥：阈值调到 1 时非逐字不通过');

  // N2 关开关
  reset();
  off(OG);
  a(OG.check('你说「x」。', []).reason === 'disabled', 'OG N2：关开关判 disabled');
  a(OG.buildBlock() === '', 'OG N2：关开关不出块');

  reset();
  on(OG, {});
  const blk = OG.buildBlock();
  a(blk.indexOf('代玩家说话的规矩') >= 0 && blk.indexOf('旁白') >= 0, 'OG ⑧：注入块讲清「旁白不算伪造」');
}

function runAll(a) {
  gtAll(a);
  osmAll(a);
  mgAll(a);
  ogAll(a);
  a(typeof GT.stat().faults === 'object' && typeof OSM.stat().faults === 'object'
    && typeof MG.stat().faults === 'object' && typeof OG.stat().faults === 'object',
    '四个模块都导出 stat().faults 分桶（失败可归因）');
}

function runNegative(a) {
  // N0 两向自证：同一正面用例在开/关两种状态下必须换结论（判据不是恒真）
  reset(); seed();
  on(GT, { quietStart: '00:00', quietEnd: '00:01', minIntervalHours: 0, lambdaRate: 5, utilityThreshold: 0.01, minInfoGain: 0.01 });
  a(GT.tick({ hour: 14, roll: 0 }).shouldSend === true, 'N0：正面对照下确实会发');
  off(GT);
  a(GT.tick({ hour: 14, roll: 0 }).shouldSend === false, 'N0：关掉后同一用例必须不再发');

  // N9 事务抛错 ⇒ 如实归因且不半写
  reset(); seed();
  on(OSM);
  OSM.dose({ text: '先有一粒' });
  const origTx = WorldAxis.store.transact;
  WorldAxis.store.transact = function () { throw new Error('boom'); };
  const rErr = OSM.advance();
  a(rErr.ok === false && rErr.reason === 'store-unavailable', 'N9：事务抛错如实归因 store-unavailable');
  WorldAxis.store.transact = origTx;
  a(store.oneShotMod.pending.length === 1, 'N9：抛错不写坏存档（原条目还在）');

  // N10 空 id 销账带码
  a(OSM.consume('').reason === 'missing-id', 'N10：空 id 销账带 missing-id（不静默成功）');
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (c, name) => { if (c) pass++; else { fail++; console.error('FAIL: ' + name); } };
  runAll(a);
  runNegative(a);
  console.log(`Summary: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

module.exports = { runAll, runNegative };