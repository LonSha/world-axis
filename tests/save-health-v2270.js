'use strict';
/**
 * v2.270.0（V6 · EXV6-6）专锁：**存档体检 —— 这局还能跑多久**
 *
 * ── 这一版治的是什么（现场立据见 tools/v6probes/p_storage6.js）────────────
 * 实测出厂态：`storageForecast.forecast()` → `{ok:false, reason:'disabled'}`、
 *   `capacityAudit.waterline()` 同、`obligations()` 同。三个面**全部关着**，
 *   而「这局还能跑多久」在出厂态一个字都答不出来 —— 不是没有数据，是没入口。
 *
 * ── 三条不许（每条都在 N 段配真源码破坏与两向自证）────────────────────────
 *   ① 「预测器关着」≠「到不了顶」：`reason='disabled'` 时 `inRounds` 必须是 null，
 *      而**不是** 0 / Infinity —— 折成「到不了」会让玩家以为余量无限；
 *   ② 「水位表关着」≠「零满容器」：关着时报 `available:false + fullCount:null`，
 *      **绝不**报 `fullCount:0`（「没查」与「查了没满」是两件事）；
 *   ③ 建议必须带来源（`from`）且**不许替别的引擎开开关**：`build()` 里零 `setSettings`
 *      调用 —— 那是「档位不是开关」的反面。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const ENG_SH = 'engines/save-health.js';
const SELF_REL = 'tests/save-health-v2270.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const ANCHOR = {
  // ① 关着 ≠ 到不了：关着分支必须把 inRounds 显式置 null
  pvDisabledBranch: "trend = { available: false, reason: why, inRounds: null,",
  // ② 水位关着分支：fullCount 必须为 null（不是 0）
  pvWlOff: "waterline = { available: false, reason: str(wl.reason, 32), rows: [], full: [], fullCount: null, nearCount: null };",
  // ③ 判态：超额度判据（N3 的锚点：破坏它 ⇒ 超了额度仍报健康）
  pvOverQuota: "const overQuota = (quotaBytes !== null && bytes >= quotaBytes);",
  // ④ 建议带来源
  pvAdviceFrom: "advice.push({ code: 'containers-full', from: 'capacityAudit.waterline.full',",
  // ⑤ 额度只从趋势面拿（不许拿别处的数凑）
  pvQuotaSrc: "const quotaBytes = (trend.available && num(trend.quotaMB)) ? Math.round(num(trend.quotaMB) * 1024 * 1024) : null;",
  // ⑥ 字节读不到 ≠ 0（**锚点取两行**：这条 return 横跨两行，只咬首行的话
  //   破坏副本会被紧随其后的 `bytes: null` 覆盖回去，负控制当场变成假绿 —— 本仓踩过这一类）
  pvNoBytes: "return { ok: false, reason: 'no-bytes', state: 'no-data',\n        bytes: null, quotaBytes: null, usedPct: null, advice: [],"
};

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  require(path.join(BASE, 'tests/mock.js'));
  const WA = global.WorldAxis;
  require(path.join(BASE, 'core/store.js'));
  require(path.join(BASE, 'core/input-guard.js'));
  require(path.join(BASE, 'core/clock.js'));
  require(path.join(BASE, 'core/settings-bus.js'));
  require(path.join(BASE, 'engines/storage-forecast.js'));
  require(path.join(BASE, 'engines/capacity-audit.js'));
  require(path.join(BASE, 'engines/save-health.js'));

  const SH = WA.saveHealth;
  const Ec = rd(ENG_SH);
  const SELF = rd(SELF_REL);

  // ── A 静态契约 ──────────────────────────────────────────────────────────
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(Ec, ANCHOR[k]);
    a(c === 1, 'v2270/A1: 锚点 ' + k + ' 恰中 1 次（实 ' + c + '）');
  });
  const dupA = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) > 1; });
  a(dupA.length === 0, 'v2270/A1f: 破坏锚点在 SELF 里只出现 1 次（越界：' + j(dupA) + '）');
  // 零写面：本模块绝不写 store，也绝不替别的引擎开开关
  a(cnt(Ec, 'store.transact(') === 0, 'v2270/A2a: 零 store.transact 写调用');
  a(cnt(Ec, 'localStorage.getItem(') === 0 && cnt(Ec, 'localStorage.setItem(') === 0,
    'v2270/A2b: 零 localStorage 读写调用');
  // ★ 唯一的 setSettings 必须是自己的（saveSettings 里的 saveOrThrow），不许出现别的引擎名。
  //   注：咬**调用形态** `WA.<引擎>.setSettings(` —— 建议文本里出现
  //   `storageForecast.setSettings({enabled:true})` 这类**字面说明**是合规的（告诉玩家怎么开），
  //   裸词会被它算进去出假红（本仓已有多次同类教训）。
  a(cnt(Ec, 'WA.storageForecast.setSettings(') === 0, 'v2270/A2c: 绝不替 storageForecast 开开关（调用形态零命中）');
  a(cnt(Ec, 'WA.capacityAudit.setSettings(') === 0, 'v2270/A2d: 绝不替 capacityAudit 开开关（调用形态零命中）');
  a(cnt(Ec, 'saveOrThrow(') === 1, 'v2270/A2e: 唯一写入口是玩家显式 setSettings');
  a(typeof SH.build === 'function', 'v2270/A3: build 是函数');
  a(typeof SH.build().line === 'string', 'v2270/A3b: 人话一行由 build() 直接给出（导出面不另立 line 口）');
  a(typeof SH.stat === 'function', 'v2270/A3c: stat 是函数');
  a(typeof SH.reset === 'function', 'v2270/A3d: reset 是函数');
  a(SH.DEF && typeof SH.DEF.warnRounds === 'number', 'v2270/A4: DEF 带 warnRounds');
  a(SH.BOUNDS && Array.isArray(SH.BOUNDS.urgentRounds), 'v2270/A4b: BOUNDS 声明 urgentRounds 区间');
  a(SH.DEF.enabled === true, 'v2270/A5: 出厂开着（「这局还能跑多久」本来就该能问）');

  // ── B 运行时 ────────────────────────────────────────────────────────────
  SH.reset();
  WA.store.init();
  SH.setSettings({ enabled: true, warnRounds: 40, urgentRounds: 8, maxAdvice: 3 });

  // B1 出厂上游全关：三个面都如实报「关着」，绝不是 0
  WA.storageForecast.setSettings({ enabled: false });
  WA.capacityAudit.setSettings({ enabled: false });
  const b1 = SH.build();
  a(b1.ok === true && b1.state === 'no-data', 'v2270/B1a: 三面全缺 ⇒ state 为 no-data（不是 healthy）');
  a(b1.trend.available === false, 'v2270/B1b: 趋势面报不可用');
  a(b1.trend.reason === 'disabled', 'v2270/B1c: 原因逐字带出 disabled（关着就是关着）');
  a(b1.trend.inRounds === null, 'v2270/B1d: 关着时 inRounds 为 null —— 绝不折成「到不了」');
  a(b1.waterline.available === false, 'v2270/B1e: 水位面报不可用');
  a(b1.waterline.fullCount === null, 'v2270/B1f: 关着时 fullCount 为 null（不是 0）');
  a(b1.obligations.available === false, 'v2270/B1g: 义务面报不可用');
  a(b1.quotaBytes === null && b1.usedPct === null, 'v2270/B1h: 趋势面关着时额度与占比都是 null（不拿别处的数凑）');
  a(b1.advice.length === 3, 'v2270/B1i: 三个缺口各给一条建议');
  a(b1.advice.every(function (x) { return x.code && x.from && x.text; }), 'v2270/B1j: 每条建议都带 code/from/text');
  a(b1.advice.some(function (x) { return x.code === 'forecaster-disabled'; }), 'v2270/B1k: 趋势关着给 forecaster-disabled');
  a(b1.advice.some(function (x) { return x.code === 'waterline-disabled'; }), 'v2270/B1l: 水位关着给 waterline-disabled');
  a(b1.line.indexOf('读不全') >= 0, 'v2270/B1m: line 明说「读不全（不等于健康）」');
  a(b1.line.indexOf('趋势未知') >= 0, 'v2270/B1n: line 明说趋势未知');
  a(typeof b1.note === 'string' && b1.note.indexOf('缺口不等于健康') >= 0, 'v2270/B1o: note 明说缺口 ≠ 健康');

  // B2 开趋势面但样本不足：与「关着」必须分得开
  WA.storageForecast.reset();
  WA.storageForecast.setSettings({ enabled: true, lsQuotaMB: 5, minSamples: 6 });
  const b2 = SH.build();
  a(b2.trend.available === false, 'v2270/B2a: 样本不足时仍报不可用');
  a(b2.trend.reason === 'insufficient-samples', 'v2270/B2b: 原因是 insufficient-samples（不是 disabled）');
  a(b2.trend.need === 6, 'v2270/B2c: 需要几条也带出来（处置动作不同）');
  a(b2.advice[0].text.indexOf('再推演几轮') >= 0, 'v2270/B2d: 建议明说「再跑几轮就有」而不是「去开开关」');

  // B3 灌样本后趋势可用，且给出「约 N 轮后触顶」
  for (let i = 0; i < 8; i++) {
    WA.store.transact(function (d) { d.__pad6 = (d.__pad6 || '') + 'x'.repeat(20000); });
    WA.storageForecast.sample(1 + i);
  }
  const b3 = SH.build();
  a(b3.trend.available === true, 'v2270/B3a: 样本够了之后趋势可用');
  a(b3.trend.inRounds !== null && b3.trend.inRounds > 0, 'v2270/B3b: 给出「约 N 轮后触顶」（实 ' + b3.trend.inRounds + '）');
  a(b3.trend.slope > 0, 'v2270/B3c: 斜率为正（在增长）');
  a(b3.quotaBytes === 5 * 1024 * 1024, 'v2270/B3d: 额度取自趋势面 lsQuotaMB');
  a(b3.usedPct !== null, 'v2270/B3e: 占比可算（实 ' + b3.usedPct + '%）');
  a(b3.trend.note.indexOf('不是精确预言') >= 0, 'v2270/B3f: 外推读数自带「不是预言」声明');

  // B4 判态：轮数进 watch / urgent 的门槛真的按设置走
  const bU = SH.build({ urgentRounds: 999 });
  a(bU.state === 'urgent', 'v2270/B4a: 触顶轮数 ≤ urgentRounds 时转 urgent');
  const bW = SH.build({ urgentRounds: 1, warnRounds: 999 });
  a(bW.state === 'watch', 'v2270/B4b: 只过 warnRounds 门槛时转 watch');
  const bH = SH.build({ urgentRounds: 1, warnRounds: 5 });
  a(bH.state === 'healthy' || bH.state === 'watch', 'v2270/B4c: 门槛都很小时不误报 urgent（实 ' + bH.state + '）');

  // B5 开水位面：水位零满时 state 不再因水位而 urgent
  WA.capacityAudit.setSettings({ enabled: true });
  const b5 = SH.build({ urgentRounds: 1, warnRounds: 5 });
  a(b5.waterline.available === true, 'v2270/B5a: 水位面可读');
  a(b5.waterline.fullCount === 0, 'v2270/B5b: 空世界零满容器（这次是「查了没满」，不是「没查」）');
  a(b5.obligations.available === true, 'v2270/B5c: 义务面可读');
  a(b5.advice.every(function (x) { return x.code !== 'waterline-disabled'; }), 'v2270/B5d: 开了之后不再报「关着」');

  // B6 水位关着 vs 水位查了没满：两态**不同形**（这是本版第二条不许）
  WA.capacityAudit.setSettings({ enabled: false });
  const b6off = SH.build();
  WA.capacityAudit.setSettings({ enabled: true });
  const b6on = SH.build();
  a(b6off.waterline.fullCount === null && b6on.waterline.fullCount === 0,
    'v2270/B6a: 「没查」为 null、「查了没满」为 0（两态不同形）');
  a(j(b6off.waterline) !== j(b6on.waterline), 'v2270/B6b: 两态整块读数不相等（不是同一个对象形状）');

  // B7 关闭态
  SH.setSettings({ enabled: false });
  const b7 = SH.build();
  a(b7.ok === false && b7.reason === 'disabled', 'v2270/B7a: 关闭态报 disabled');
  a(b7.bytes === null && b7.trend === undefined, 'v2270/B7b: 关闭态不伪造任何读数');
  SH.setSettings({ enabled: true });

  // B8 建议条数上限真的生效（先把水位面关掉，制造出一个必然存在的建议）
  WA.capacityAudit.setSettings({ enabled: false });
  const b8 = SH.build({ maxAdvice: 1 });
  a(b8.advice.length === 1, 'v2270/B8a: maxAdvice 生效（实 ' + b8.advice.length + '）');
  a(b8.adviceTotal >= 1, 'v2270/B8b: 被截掉的条数仍报在 adviceTotal（截断看得见）');
  a(b8.adviceTotal >= b8.advice.length, 'v2270/B8c: adviceTotal ≥ 实列条数（截断只能往下）');
  WA.capacityAudit.setSettings({ enabled: true });

  // B9 stat 面
  const st = SH.stat();
  a(st.sources.store === true, 'v2270/B9a: stat 报 store 在位');
  a(st.sources.storageForecast === true, 'v2270/B9b: stat 报 storageForecast 在位');
  a(st.sources.capacityAudit === true, 'v2270/B9c: stat 报 capacityAudit 在位');
  a(st.forecasterOff >= 1 && st.waterlineOff >= 1, 'v2270/B9d: 缺口计数真在涨（不是恒 0）');
  a(typeof st.lastState === 'string' && st.lastState.length > 0, 'v2270/B9e: lastState 记最近一次判决');

  // ── C 零写盘不变式 ──────────────────────────────────────────────────────
  const snapBefore = j(WA.store.get());
  for (let i = 0; i < 5; i++) { SH.build(); SH.build().line; SH.stat(); }
  const snapAfter = j(WA.store.get());
  a(snapBefore === snapAfter, 'v2270/C1: 纯读聚合，store 零写盘不变');

  // ── N 真源码破坏 + 两向自证 ────────────────────────────────────────────
  function loadBroken(srco) {
    const sandboxWA = {
      store: WA.store, settingsBus: WA.settingsBus,
      storageForecast: WA.storageForecast, capacityAudit: WA.capacityAudit,
      registerModule: function () {}
    };
    const G2 = { WorldAxis: sandboxWA };
    const fn = new Function('window', 'global', srco);
    fn(G2, G2);
    return sandboxWA;
  }

  // N1 破坏「关着时 inRounds 必须为 null」⇒ 关着被读成「到不了顶」
  const badN1 = Ec.replace(ANCHOR.pvDisabledBranch, "trend = { available: false, reason: why, inRounds: 0,");
  a(badN1 !== Ec, 'v2270/N1a: N1 源码破坏成功（锚点命中）');
  const w1 = loadBroken(badN1);
  WA.storageForecast.setSettings({ enabled: false });
  const rv1 = SH.build({});
  a(rv1.trend.inRounds === null, 'v2270/N1b: 原版上关着时 inRounds 为 null（两向自证正向半边）');
  a(w1.saveHealth.build({}).trend.inRounds === 0, 'v2270/N1c: 破坏副本上关着被读成 0（「到不了」的假象）');

  // N2 破坏「水位关着 fullCount 为 null」⇒ 关着与「查了没满」同形
  //   前置：把水位面显式关掉（与前一段 B8 的开关状态解耦，不依赖执行顺序）
  WA.capacityAudit.setSettings({ enabled: false });
  const badN2 = Ec.replace(ANCHOR.pvWlOff,
    "waterline = { available: false, reason: str(wl.reason, 32), rows: [], full: [], fullCount: 0, nearCount: 0 };");
  a(badN2 !== Ec, 'v2270/N2a: N2 源码破坏成功（锚点命中）');
  const w2 = loadBroken(badN2);
  const rv2 = SH.build({});
  a(rv2.waterline.fullCount === null, 'v2270/N2b: 原版上关着时 fullCount 为 null（两向自证正向半边）');
  a(w2.saveHealth.build({}).waterline.fullCount === 0, 'v2270/N2c: 破坏副本上关着变成 0 —— 与「查了没满」同形');

  // N3 破坏「超额度即 urgent」判据 ⇒ 存档已经超了额度却仍报健康
  //   构造：把额度调到 1MB，把字节灌到 1MB 以上（>quota）⇒ 原版必转 urgent。
  WA.capacityAudit.setSettings({ enabled: true });
  WA.storageForecast.setSettings({ enabled: true, lsQuotaMB: 1, minSamples: 6 });
  WA.store.transact(function (d) { d.__padBig = 'y'.repeat(1400000); });
  const rv3 = SH.build({});
  a(rv3.overflow === true && rv3.state === 'urgent',
    'v2270/N3b: 原版上超额度 ⇒ overflow 且 urgent（两向自证正向半边，实 ' + rv3.state + '/' + rv3.bytes + 'B）');
  const badN3 = Ec.replace(ANCHOR.pvOverQuota, 'const overQuota = false;');
  a(badN3 !== Ec, 'v2270/N3a: N3 源码破坏成功（锚点命中）');
  const w3 = loadBroken(badN3);
  a(w3.saveHealth.build({}).overflow === false, 'v2270/N3c: 破坏副本上超额度不再现形');
  WA.store.transact(function (d) { delete d.__padBig; });
  WA.storageForecast.setSettings({ lsQuotaMB: 5 });

  // N4 破坏「建议带 from」⇒ 建议失去来源
  const badN4 = Ec.replace(ANCHOR.pvAdviceFrom, "advice.push({ code: 'containers-full',");
  a(badN4 !== Ec, 'v2270/N4a: N4 源码破坏成功（锚点命中）');
  const w4 = loadBroken(badN4);
  // 造一个真有满容器的现场做不到（空世界），故用「缺 from」的静态差异 + 运行时形状断言
  a(b1.advice.every(function (x) { return x.from; }), 'v2270/N4b: 原版上每条建议都有 from（两向自证正向半边）');

  // N5 破坏「额度只从趋势面拿」⇒ 拿趋势面关着时的假额度
  const badN5 = Ec.replace(ANCHOR.pvQuotaSrc,
    "const quotaBytes = (trend.available && num(trend.quotaMB)) ? Math.round(num(trend.quotaMB) * 1024 * 1024) : (5 * 1024 * 1024);");
  a(badN5 !== Ec, 'v2270/N5a: N5 源码破坏成功（锚点命中）');
  const w5 = loadBroken(badN5);
  WA.storageForecast.setSettings({ enabled: false });
  a(SH.build({}).quotaBytes === null, 'v2270/N5b: 原版上趋势关着时额度为 null（两向自证正向半边）');
  a(w5.saveHealth.build({}).quotaBytes === 5 * 1024 * 1024, 'v2270/N5c: 破坏副本上凭空冒出 5MB 额度（编读数）');

  // N6 破坏「字节读不到 ≠ 0」⇒ 让 no-bytes 分支返回 bytes:0
  const badN6 = Ec.replace(ANCHOR.pvNoBytes,
    "return { ok: true, reason: 'no-bytes', state: 'no-data',\n        bytes: 0, quotaBytes: null, usedPct: null, advice: [],");
  a(badN6 !== Ec, 'v2270/N6a: N6 源码破坏成功（锚点命中）');
  const w6 = loadBroken(badN6);
  const savedAudit = WA.store.sizeAudit, savedStat = WA.store.saveStat;
  WA.store.sizeAudit = function () { return { totalBytes: NaN }; };
  WA.store.saveStat = function () { return { bytes: NaN }; };
  a(SH.build({}).state === 'no-data', 'v2270/N6b: 原版上读不到字节 ⇒ no-data（两向自证正向半边）');
  const r6 = w6.saveHealth.build({});
  a(r6.bytes === 0, 'v2270/N6c: 破坏副本上「读不到」长成「很空」（正是本仓要防的那一类）');
  WA.store.sizeAudit = savedAudit; WA.store.saveStat = savedStat;

  // N7 负控制全程未改真源码与真设置
  a(rd(ENG_SH) === Ec, 'v2270/N7a: 负控制后引擎源码逐字未变');
  a(j(SH.getSettings()) === j({ enabled: true, warnRounds: 40, urgentRounds: 8, maxAdvice: 3 }),
    'v2270/N7b: 负控制后真设置逐字未变');

  console.log('EXV6-6 save-health-v2270: 全部通过');
  return true;
}
// 挂载面：tests/run.js 用 runLock('./save-health-v2270.js','runAll') 调它；
//   缺这一行时全量回归会记 NO runAll（独立跑绿、回归记红的假红）。
module.exports = { runAll: runAll };
if (require.main === module) {
  runAll();
}