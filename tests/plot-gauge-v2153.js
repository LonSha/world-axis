#!/usr/bin/env node
// v2.153.0 RX5 专锁：剧情深度仪 —— 四分量加权合成、分量缺席按在场权重归一、「两个点连不成趋势」、
//   建议只按现场读数给、三源全缺席不拿 0 分冒充。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/plot-gauge.js';
const SELF_REL = 'tests/plot-gauge-v2153.js';

// 锚点取「分量缺席不参与归一」这一条：它是合成指数全部可信度的来源 ——
//   一旦失效，「没有线程」会被算成 0 分（=『暗流全不成熟』），
//   而那是把「无从判定」伪装成「判定为最差」。
const ANCHOR = "    const live_ = parts.filter(function (p) { return p.v !== null; });";
const ANCHOR2 = "const W = { suspense: 30, momentum: 30, threads: 25, due: 15 };";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }

function reset(WA) {
  WA.store.init();
  if (WA.plotGauge && WA.plotGauge.reset) WA.plotGauge.reset();
  WA.plotGauge.setSettings({ enabled: true, staleMs: 3600000, maxPulses: 24, risingDelta: 5 });
}

/** 造一份世界：counts = { live, settled, stage, fsActive, fsTotal, threads, mature } */
function world(WA, c) {
  const st = WA.store.get();
  st.causal = st.causal || { chains: [] };
  st.causal.chains = [];
  const total = (c.live || 0) + (c.settled || 0);
  for (let i = 0; i < total; i++) {
    if (i < (c.settled || 0)) st.causal.chains.push({ id: 'c' + i, status: 'settled', stage: 4 });
    else st.causal.chains.push({ id: 'c' + i, status: 'open', stage: (typeof c.stage === 'number' ? c.stage : 2) });
  }
  st.memory = st.memory || {};
  st.memory.foreshadows = [];
  for (let i = 0; i < (c.fsTotal || 0); i++) {
    st.memory.foreshadows.push({ id: 'f' + i, status: i < (c.fsActive || 0) ? 'waiting' : 'triggered' });
  }
  st.threads = [];
  for (let i = 0; i < (c.threads || 0); i++) {
    st.threads.push(i < (c.mature || 0) ? { id: 't' + i, status: 'open', leads: [{}] } : { id: 't' + i, status: 'open' });
  }
  return st;
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2153/pg A1: 「分量缺席不参与归一」的判据锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2153/pg A2: 四分量权重常量恰声明 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  a(src.indexOf("WA.registerModule('engines/plot-gauge.js'") >= 0, 'v2153/pg A3: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0, 'v2153/pg A4: 设置键走 __settingsRegs 登记');
  a(src.indexOf('store.transact') < 0, 'v2153/pg A5: 零 store.transact（进程态内存环，不写存档）');
  // H5 纯度：锚点字面量在**本文件**里只出现在 ANCHOR 常量那一处语义上；
  //   判据一律引用常量，不重复抄锚点原文。
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1, 'v2153/pg A6: 锚点在本文件里至少各引用 1 次');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  reset(WA);
  const PG = WA.plotGauge;
  a(!!PG && typeof PG.tension === 'function' && typeof PG.trend === 'function'
    && typeof PG.advice === 'function' && typeof PG.stat === 'function'
    && typeof PG.reset === 'function' && typeof PG.tensionCore === 'function',
    'v2153/pg B1: 六个真出口在场');

  // B2 三源全不在场 ⇒ no-signal（**不拿 0 分冒充「故事刚开始」**）
  WA.store.init();
  PG.reset();
  const st0 = WA.store.get();
  delete st0.causal; delete st0.memory; delete st0.threads;
  const r0 = PG.tension();
  a(r0.ok === false && r0.reason === 'no-signal', 'v2153/pg B2: 三源全不在场如实报 no-signal（不是 0 分）');
  a(PG.stat().faults['no-signal'] === 1, 'v2153/pg B3: 拒收进 faults 分桶（可归因）');

  // B2b 源在场但为空 ⇒ no-reading（**与 no-signal 不可合成**：一个要补数据源，一个要确认剧情进度）
  WA.store.init();
  PG.reset();
  const r0b = PG.tension();
  a(r0b.ok === false && r0b.reason === 'no-reading',
    'v2153/pg B2b: 源在场但为空世界 ⇒ no-reading（不是 no-signal，也不是 0 分）');
  a(PG.stat().faults['no-reading'] === 1, 'v2153/pg B2c: no-reading 单独分桶（两码不相混）');

  // B4 只有 causal 在场 ⇒ 分量部分在场
  world(WA, { live: 4, settled: 0, stage: 2, fsTotal: 0, threads: 0 });
  const r1 = PG.tension();
  a(r1.ok === true, 'v2153/pg B4: 单源在场即可出指数');
  const comp = {};
  r1.components.forEach(function (c) { comp[c.key] = c; });
  a(comp.suspense.present === true && comp.momentum.present === true, 'v2153/pg B5: 在场分量标 present');
  a(comp.threads.present === false && comp.due.present === false, 'v2153/pg B6: 缺席分量标 present:false');
  a(comp.threads.score === null && comp.due.score === null, 'v2153/pg B7: 缺席分量不给分（null，不给 0）');
  a(r1.activeWeight === 60, 'v2153/pg B8: 在场权重 = 30+30 = 60（缺席的 25+15 被剔除）');
  a(typeof r1.score === 'number' && isFinite(r1.score),
    'v2153/pg B8b: 链表为空时合成值有限（0/0 的 NaN 不许漏进读数，实 ' + r1.score + '）');
  a(r1.band === 'calm' || r1.band === 'warming' || r1.band === 'tense',
    'v2153/pg B8c: 空世界的档位不许落到 climax（NaN 曾落进最后一段，实 ' + r1.band + '）');

  // B9 纯函数方向：注入构造源，验单调性与归一
  const core1 = PG.tensionCore({ chains: 4, live: 4, settled: 0, stageSum: 8, stageSamples: 4, foreshadows: 4, fsActive: 4, threads: 0, matureThreads: 0, sources: 2 }, {});
  const core2 = PG.tensionCore({ chains: 4, live: 0, settled: 4, stageSum: 0, stageSamples: 0, foreshadows: 4, fsActive: 0, threads: 0, matureThreads: 0, sources: 2 }, {});
  a(core1.score > core2.score, 'v2153/pg B9: 存量高 + 未结算 的张力 > 全部结算完（方向自洽）');
  //   B10 订正过：core2 的 `foreshadows:4 / fsActive:0` ⇒ 到期压力**在场**（0/4=0，权重 15 参与），
  //     在场权重 = 30+30+15 = 75（只有 threads 的 25 被剔除）。
  a(core2.activeWeight === 75, 'v2153/pg B10: 在场权重按在场分量累加（实 ' + core2.activeWeight + '，threads 缺席被剔除）');
  const core3 = PG.tensionCore({ chains: 0, live: 0, settled: 0, stageSum: 0, stageSamples: 0, foreshadows: 0, fsActive: 0, threads: 6, matureThreads: 6, sources: 1, hasThreads: true }, {});
  a(core3.activeWeight === 25, 'v2153/pg B11: 只有线程源时在场权重 = 25（按在场归一，不是按 100）');
  a(core3.components.filter(function (c) { return c.key === 'threads'; })[0].score === 100,
    'v2153/pg B12: 单一分量在场时它拿满分（若按总权重 100 归一则会得到 25）');

  // B13 趋势：两个点连不成趋势
  PG.reset(); world(WA, { live: 4, settled: 0, stage: 2, fsTotal: 0, threads: 0 });
  PG.tension(); PG.tension();
  const t2 = PG.trend();
  a(t2.ok === false && t2.reason === 'insufficient-samples' && t2.need === 3 && t2.samples === 2,
    'v2153/pg B13: 只有 2 个采样点时如实报 insufficient-samples（两个点连不成趋势）');

  // B14 同轮多次读数只留最新一条（不刷环）
  WA.store.get().meta = WA.store.get().meta || {};
  WA.store.get().meta.round = 10;
  PG.reset();
  PG.tension(); PG.tension(); PG.tension();
  a(PG.stat().samples === 1, 'v2153/pg B14: 同轮多次读数环内只留 1 条（纯函数可反复算，但不刷环）');

  // B15 轮次回退拒收
  WA.store.get().meta.round = 5;
  const back = PG.tension();
  a(back.ok === false && back.reason === 'stale-round', 'v2153/pg B15: 轮次回退拒收（stale-round）');
  a(PG.stat().faults['stale-round'] === 1, 'v2153/pg B16: 同类拒收进同一分桶');
  WA.store.get().meta.round = 11;

  // B17 环 cap
  PG.setSettings({ maxPulses: 4 });
  PG.reset();
  for (let r = 1; r <= 10; r++) { WA.store.get().meta.round = r; PG.tension(); }
  a(PG.stat().samples === 4, 'v2153/pg B17: 趋势环按 maxPulses 截断（实 ' + PG.stat().samples + '）');
  a(PG.stat().caps.maxPulses === 4, 'v2153/pg B18: cap 随读数返回');
  PG.setSettings({ maxPulses: 24 });

  // B19 上行判定：构造上升序列
  PG.setSettings({ risingDelta: 1 });
  PG.reset();
  world(WA, { live: 8, settled: 0, stage: 2, fsTotal: 8, fsActive: 8, threads: 0 });
  for (let r = 1; r <= 4; r++) { WA.store.get().meta.round = r; PG.tension(); }
  const tU = PG.trend();
  a(tU.ok === true && tU.direction === 'wave' || tU.direction === 'rising',
    'v2153/pg B19: 走向判定给出三态之一（rising/falling/wave），实 ' + (tU.ok ? tU.direction : tU.reason));

  // B20 建议：过期伏笔多 ⇒ close-overdue
  PG.reset();
  world(WA, { live: 2, settled: 0, stage: 1, fsTotal: 10, fsActive: 9, threads: 0 });
  WA.store.get().meta.round = 20;
  const adv = PG.advice();
  a(adv.ok === true, 'v2153/pg B20: 建议可出');
  a(adv.rows.some(function (r) { return r.id === 'close-overdue'; }), 'v2153/pg B21: 活跃伏笔过半 ⇒ 报 close-overdue');
  a(adv.rows.every(function (r) { return r.id && r.label && r.detail; }),
    'v2153/pg B22: 每条建议都带 id/label/detail（带自己读到的数）');

  // B23 建议：干净局面 ⇒ keep-going
  PG.reset();
  world(WA, { live: 2, settled: 2, stage: 4, fsTotal: 8, fsActive: 1, threads: 4, mature: 4 });
  WA.store.get().meta.round = 30;
  const adv2 = PG.advice();
  a(adv2.rows.some(function (r) { return r.id === 'keep-going'; }), 'v2153/pg B23: 无该处理项时给 keep-going（不是空列表）');

  // B24 关闭态
  PG.setSettings({ enabled: false });
  a(PG.tension().reason === 'disabled' && PG.trend().reason === 'disabled' && PG.advice().reason === 'disabled',
    'v2153/pg B24: 关闭后三面均拒收（disabled）');
  PG.setSettings({ enabled: true });

  // B25 bounds
  PG.setSettings({ maxPulses: 999, risingDelta: 0, staleMs: 1 });
  const g = PG.getSettings();
  a(g.maxPulses <= 96 && g.maxPulses >= 4, 'v2153/pg B25: maxPulses 越界被收进界内（实 ' + g.maxPulses + '）');
  a(g.risingDelta >= 1, 'v2153/pg B26: risingDelta 越界被收进界内（实 ' + g.risingDelta + '）');
  a(g.staleMs >= 60000, 'v2153/pg B27: staleMs 越界被收进界内（实 ' + g.staleMs + '）');

  // B28 只读：全程不写存档
  PG.reset(); world(WA, { live: 3, settled: 1, stage: 2, fsTotal: 4, fsActive: 2, threads: 2, mature: 1 });
  const snap = JSON.stringify(WA.store.get());
  PG.tension(); PG.trend(); PG.advice(); PG.stat();
  a(JSON.stringify(WA.store.get()) === snap, 'v2153/pg B28: 全链路不写存档（读数是纯合成）');

  // B29 无副作用读数：push:false 不进环
  PG.reset(); PG.tension(); const n1 = PG.stat().samples;
  PG.tension({ push: false }); PG.tension({ push: false });
  a(PG.stat().samples === n1, 'v2153/pg B29: push:false 的读数不进环（诊断面据此做到零副作用）');
}

// ── N 负控制（真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据）──
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');

  // N0 锚点必须恰中 1 次（锚点漂移即「负控制作废」）
  if (countOcc(orig, ANCHOR) !== 1) throw new Error('N0 锚点未恰中 1 次：' + countOcc(orig, ANCHOR));

  // N1 真源码破坏：把「分量缺席不参与归一」改成「缺席按 0 计」⇒ B8/B11 类判据必须现形
  const broken1 = orig.replace(ANCHOR,
    "    const live_ = parts.filter(function (p) { return true; });");
  if (broken1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = fresh((function () { const o = {}; o[REL] = broken1; return o; })());
  WA1.store.init();
  if (WA1.plotGauge && WA1.plotGauge.reset) WA1.plotGauge.reset();
  WA1.plotGauge.setSettings({ enabled: true });
  world(WA1, { live: 4, settled: 0, stage: 2, fsTotal: 0, threads: 0 });
  const c = WA1.plotGauge.tensionCore({ chains: 0, live: 0, settled: 0, stageSum: 0, stageSamples: 0,
    foreshadows: 0, fsActive: 0, threads: 6, matureThreads: 6, sources: 1 }, {});
  a(c.activeWeight !== 25, 'v2153/pg N1: 破坏「缺席剔除」后在场权重不再恒等于 25（实 ' + c.activeWeight + '）—— 判据对破坏敏感');

  // N2 破坏权重常量 ⇒ 在场权重口径随之改变（证明权重真的参与合成）
  const broken2 = orig.replace(ANCHOR2, "const W = { suspense: 0, momentum: 0, threads: 25, due: 15 };");
  if (broken2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = fresh((function () { const o = {}; o[REL] = broken2; return o; })());
  WA2.store.init();
  if (WA2.plotGauge && WA2.plotGauge.reset) WA2.plotGauge.reset();
  WA2.plotGauge.setSettings({ enabled: true });
  world(WA2, { live: 4, settled: 0, stage: 2, fsTotal: 0, threads: 0 });
  const s2 = WA2.plotGauge.tensionCore({ chains: 4, live: 4, settled: 0, stageSum: 8, stageSamples: 4,
    foreshadows: 0, fsActive: 0, threads: 0, matureThreads: 0, sources: 1 }, {});
  a(s2.activeWeight === 0 && s2.score === null,
    'v2153/pg N2: 把两分量权重改成 0 后合成值不再可得（实 activeWeight=' + s2.activeWeight + '）—— 权重真参与合成');

  // N3 破坏「三源全缺席即 no-signal」⇒ 必须给出一个 0 分（这就是本版点名要防的假读数）
  const broken3 = orig.replace("    if (!srcs.sources) { note('no-signal'); return { ok: false, reason: 'no-signal', sources: 0 }; }",
    "    if (false) { }");
  if (broken3 === orig) throw new Error('N3 破坏没有改变源码');
  const WA3 = fresh((function () { const o = {}; o[REL] = broken3; return o; })());
  WA3.store.init();
  if (WA3.plotGauge && WA3.plotGauge.reset) WA3.plotGauge.reset();
  WA3.plotGauge.setSettings({ enabled: true });
  const r3 = WA3.plotGauge.tensionCore({ chains: 0, live: 0, settled: 0, stageSum: 0, stageSamples: 0,
    foreshadows: 0, fsActive: 0, threads: 0, matureThreads: 0, sources: 0 }, {});
  a(r3.activeWeight === 0 && r3.score === null,
    'v2153/pg N3: 三源全缺席时纯函数给不出分（score null）—— 证明「0 分」不是被算出来的，而是被 no-signal 拦住的');

  // N4 真文件逐字未变（破坏只发生在内存副本上）
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig, 'v2153/pg N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  ✗ 抛出：' + e.message); }
  console.log('PLOT-GAUGE-V2153: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}