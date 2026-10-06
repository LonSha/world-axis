#!/usr/bin/env node
// v2.152.0 RP7 专锁：存储水位预测 —— 字节数单一真源、样本单调性、最小二乘外推与四档阈值。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/storage-forecast.js';
// 锚点取「非单调拒收」这一条：它是样本序列可信的全部依据 —— 一旦失效，
// 同一轮被采两次、或轮次回退，最小二乘会把一条打了结的序列拟合出一条假斜率。
const ANCHOR = "if (ring.length && r <= ring[ring.length - 1].round) { note('non-monotonic'); return { ok: false, reason: 'non-monotonic', round: r, last: ring[ring.length - 1].round }; }";

function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }

function reset(WA) {
  WA.store.init();
  if (WA.storageForecast && WA.storageForecast.reset) WA.storageForecast.reset();
  WA.storageForecast.setSettings({ enabled: true, lsQuotaMB: 5, minSamples: 6 });
}

function runAll(a) {
  const WA = fresh();
  reset(WA);
  const SF = WA.storageForecast;
  a(!!SF && typeof SF.sample === 'function' && typeof SF.forecast === 'function'
    && typeof SF.stat === 'function' && typeof SF.reset === 'function'
    && typeof SF.getSettings === 'function' && typeof SF.setSettings === 'function',
    'v2152/sf: 六个真出口在场');
  a(SF.getSettings().enabled === true && SF.getSettings().lsQuotaMB === 5 && SF.getSettings().minSamples === 6,
    'v2152/sf: 默认口径（关闭由 def 承担；本轮显式打开以验行为）');

  // ── 字节数取单一真源：两条读法（sizeAudit / saveStat）必须都给出数 ──
  WA.store.transact(function (d) { d.probe2152 = { pad: new Array(200).join('x') }; }, 'sf2152:pad');
  const r1 = SF.sample(1);
  a(r1.ok === true && typeof r1.bytes === 'number' && r1.bytes > 0,
    'v2152/sf: 采样取到 store 的真字节数（单一真源，不自己枚举存储）');
  a(r1.round === 1 && r1.count === 1, 'v2152/sf: 首次采样入账');

  // ── 单调性：同轮重采与轮次回退都必须拒收并归因 ──
  const dup = SF.sample(1);
  a(dup.ok === false && dup.reason === 'non-monotonic', 'v2152/sf: 同轮重采拒收（non-monotonic）');
  a(dup.last === 1, 'v2152/sf: 拒收时回报上一轮次（用户能看出撞在哪）');
  const back = SF.sample(0);
  a(back.ok === false && back.reason === 'non-monotonic', 'v2152/sf: 轮次回退拒收（non-monotonic）');
  const st1 = SF.stat();
  a(st1.samples === 1 && st1.samplesInRing === 1, 'v2152/sf: 拒收不进样本环（宁可少收也不污染趋势）');
  a(st1.faults['non-monotonic'] === 2, 'v2152/sf: 同类拒收进同一分桶（可归因）');

  // ── 样本不足不假装 ──
  const f0 = SF.forecast();
  a(f0.ok === false && f0.reason === 'insufficient-samples' && f0.need === 6,
    'v2152/sf: 样本不足如实报 insufficient-samples（绝不拿两个点外推）');
  a(f0.samples === 1, 'v2152/sf: 拒收时带上当前样本数（读数自解释）');

  // ── 灌一条**已知斜率**的序列：靠 pad 顶字节数，斜率可复算 ──
  const pad = function (bytes) {
    WA.store.transact(function (d) {
      const n = Math.max(0, Math.floor(bytes / 2));
      d.probe2152 = { pad: new Array(n + 1).join('xy') };
    }, 'sf2152:pad');
  };
  SF.reset();
  for (let k = 1; k <= 8; k++) {
    pad(k * 4000);                 // 每轮涨 ~4000 字节
    SF.sample(k);
  }
  const st2 = SF.stat();
  a(st2.samplesInRing === 8, 'v2152/sf: 八轮样本全部入账');
  const f1 = SF.forecast();
  a(f1.ok === true && f1.samples === 8, 'v2152/sf: 达到 minSamples 后可预测');
  a(f1.slopeBytesPerRound > 0, 'v2152/sf: 正增速被识别（斜率 > 0）');
  a(f1.rows.length === 4 && f1.rows.map(function (r) { return r.level; }).join(',') === '0.5,0.75,0.9,1',
    'v2152/sf: 四档阈值齐备（50/75/90/100%）');
  a(f1.rows.every(function (r) { return typeof r.bytes === 'number' && r.bytes > 0; }),
    'v2152/sf: 每档给出阈值字节数（用户不用自己换算）');
  a(f1.rows.every(function (r) { return r.inRounds === null || r.inRounds >= 0; }),
    'v2152/sf: 每档给出轮数（到不了时如实 null，不编一个假数）');
  a(f1.rows[0].inRounds !== null && f1.rows[3].inRounds !== null && f1.rows[0].inRounds < f1.rows[3].inRounds,
    'v2152/sf: 档位越高越晚到达（单调序，方向搞反一眼可辨）');
  a(typeof f1.windowRounds === 'number' && f1.windowRounds >= 8, 'v2152/sf: 窗口轮数随读数返回');
  a(f1.note.indexOf('不是精确预言') >= 0, 'v2152/sf: 外推口径写进读数本体（不假装是预言）');
  a(f1.quotaMB === 5, 'v2152/sf: 配额口径随读数返回');

  // ── 阈值档与 lsQuotaMB 绑定：改配额，阈值跟着变 ──
  SF.setSettings({ lsQuotaMB: 10 });
  const f2 = SF.forecast();
  a(f2.quotaMB === 10 && f2.rows[0].bytes === Math.round(10 * 1024 * 1024 * 0.5),
    'v2152/sf: 配额改后阈值同步（两处口径不许各说一套）');
  a(f2.rows[0].inRounds > f1.rows[0].inRounds, 'v2152/sf: 配额翻倍后到达更晚（方向自洽）');
  SF.setSettings({ lsQuotaMB: 5 });

  // ── 有界：样本环 cap 120，且丢最旧留最新 ──
  SF.reset();
  for (let k = 1; k <= 160; k++) { pad(k * 100); SF.sample(k); }
  const st3 = SF.stat();
  a(st3.cap === 120 && st3.samplesInRing === 120, 'v2152/sf: 样本环上限 120（预测器自身不许撑爆内存）');
  a(st3.lastRound === 160, 'v2152/sf: 截断丢最旧、留最新');

  // ── 设置面：bounds 生效（越界被 normalize 收进界内，不静默穿过） ──
  SF.setSettings({ lsQuotaMB: 999, minSamples: 1 });
  const g = SF.getSettings();
  a(g.lsQuotaMB <= 50 && g.lsQuotaMB >= 1, 'v2152/sf: lsQuotaMB 越界被收进界内（实 ' + g.lsQuotaMB + '）');
  a(g.minSamples >= 3, 'v2152/sf: minSamples 越界被收进界内（实 ' + g.minSamples + '）');

  // ── 关闭态：采样与预测都拒收，并各自归因 ──
  SF.setSettings({ enabled: false });
  a(SF.sample(999).reason === 'disabled', 'v2152/sf: 关闭后采样拒收（disabled）');
  a(SF.forecast().reason === 'disabled', 'v2152/sf: 关闭后预测拒收（disabled）');
  SF.setSettings({ enabled: true });

  // ── 只读观测面：全程不写 store 骨架里属于本模块的键 ──
  const snap = JSON.stringify(WA.store.get());
  SF.sample(5000); SF.forecast(); SF.stat();
  a(JSON.stringify(WA.store.get()) === snap, 'v2152/sf: 全链路不写存档（样本在内存环里）');

  // ── 源码面：三件登记 + 零 store.transact ──
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(src.indexOf("__settingsRegs = (WA.__settingsRegs || []).concat([__REG])") >= 0,
    'v2152/sf: 设置键走 __settingsRegs 登记');
  a(src.indexOf("WA.registerModule('engines/storage-forecast.js'") >= 0, 'v2152/sf: 模块自报登记');
  a(src.indexOf('store.transact') < 0, 'v2152/sf: 零 store.transact（进程态内存环，不落盘）');
  a(src.indexOf("bounds: { lsQuotaMB: [1, 50], minSamples: [3, 40] }") >= 0,
    'v2152/sf: 两个数值设置都有界（界写在唯一真源上）');
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const n = src.split(ANCHOR).length - 1;
  a(n === 1, 'v2152/sf/N0: 非单调守卫唯一锚定（' + n + '）');
  if (n !== 1) return;
  const broken = src.replace(ANCHOR, "if (false) { note('non-monotonic'); return { ok: false, reason: 'non-monotonic', round: r, last: ring[ring.length - 1].round }; }");
  a(broken !== src, 'v2152/sf/N0b: 破坏改动了内存副本');
  const ov = {}; ov[REL] = broken;
  const WA = fresh(ov); reset(WA);
  WA.store.transact(function (d) { d.probe2152 = { pad: new Array(200).join('x') }; }, 'sf2152:pad');
  WA.storageForecast.sample(5);
  const dup = WA.storageForecast.sample(5);
  a(dup.ok === true && WA.storageForecast.stat().samplesInRing === 2,
    'v2152/sf/N1: 破坏后同轮重采真被收下（判据非空转）');
  a(WA.storageForecast.stat().faults['non-monotonic'] === undefined, 'v2152/sf/N1b: 破坏后该类归因消失');
  const clean = fresh(); reset(clean);
  clean.store.transact(function (d) { d.probe2152 = { pad: new Array(200).join('x') }; }, 'sf2152:pad');
  clean.storageForecast.sample(5);
  const dup2 = clean.storageForecast.sample(5);
  a(dup2.ok === false && dup2.reason === 'non-monotonic', 'v2152/sf/N2: 同款判据在原源码上通过');
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === src, 'v2152/sf/N3: 负向探针不改产品源码');
}

module.exports = { runAll: runAll, runNegative: runNegative };