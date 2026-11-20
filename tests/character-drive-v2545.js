#!/usr/bin/env node
'use strict';
/**
 * tests/character-drive-v2545.js — 叙事脊柱 L4「人物驱动力」专锁（v2.542.5）
 *
 * 锁七组：
 *   A 关闭零变化：stakes 返回 null、touchesLine 如实报 disabled；
 *   B 三向映射：want←intent、line←behaviorBoundaries、fear**无真字段⇒ 永为 null 且点名**；
 *     显式 drive.* 优先于画像字段（来源如实写进 sources）；
 *   C 筹码：只有真字段才出，一侧缺失 partial:true，全缺返回 null（不编一行空话）；
 *   D 底线判据：只认**字面包含**（宁可漏，不可冕）；
 *   E 接回 L1：触碰底线 ⇒ 强制 press；筹码进 compose 返回值；关闭时不点名；
 *   F 零写入纪律：本模块不改世界（people 快照逐字节相同，不写 people[id].drive）；
 *   G 接线：LOAD 两面同序、诊断映射、早于 scene-intent、零总线订阅。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
let pass = 0; let fail = 0;
function a(cond, msg) { if (cond) pass += 1; else { fail += 1; console.error('FAIL ' + msg); } }
const rd = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
const sync = require('./ui-gate-sync.js');

function seed(env, extra) {
  const WA = env.WA;
  WA.store.init();
  WA.store.transact(function (s) {
    s.evolution = s.evolution || {}; s.evolution.round = 5;
    s.people = s.people || {};
    s.people.p_su = Object.assign({ name: '苏晚', location: '旧宅', action: '坐着',
      intent: '把那封没拆的信送出去',
      behaviorBoundaries: '不出卖朋友' }, extra || {});
  });
  return WA;
}
function stubDirector(WA, item) {
  WA.director = { rank: function () { return { ok: true, round: 5, picked: [item], deferred: [], suppressed: [] }; } };
}
function stubGauge(WA, score, dir) {
  WA.plotGauge = { tension: function () { return { ok: true, score: score, band: 'warming' }; },
    trend: function () { return { ok: true, direction: dir || 'wave' }; },
    advice: function () { return { ok: true, rows: [] }; } };
}

/* ─────────── A 关闭时零变化 ─────── */
{
  const env = sync.fresh(); const WA = seed(env);
  WA.characterDrive.setSettings({ enabled: false });
  a(WA.characterDrive.stakes('p_su') === null, 'A1: 关闭时 stakes 返回 null（不是返回半个筹码）');
  const tl = WA.characterDrive.touchesLine('p_su', '不出卖朋友');
  a(tl.hit === false && tl.reason === 'disabled', 'A2: 关闭时 touchesLine 如实报 disabled（命中也不认）');
  const d = WA.characterDrive.derive('p_su');
  a(d.ok === true && d.want, 'A3: derive 是纯读，关闭也照实推导（供诊断看，不进注入）');
  a(WA.characterDrive.getSettings().enabled === false, 'A4: 默认关闭（沿用仓库纪律）');
}

/* ─────────── B 三向映射 ─────── */
{
  const env = sync.fresh(); const WA = seed(env);
  WA.characterDrive.setSettings({ enabled: true });
  const d = WA.characterDrive.derive('p_su');
  a(d.want === '把那封没拆的信送出去', 'B1: want ← people[id].intent');
  a(d.sources.want === 'people[id].intent', 'B2: want 的出处如实写 intent（不冒充 drive）');
  a(d.line === '不出卖朋友', 'B3: line ← people[id].behaviorBoundaries');
  a(d.sources.line === 'people[id].behaviorBoundaries', 'B4: line 的出处如实写 behaviorBoundaries');
  a(d.fear === null, 'B5: **fear 无真字段 ⇒ 永远推不出来**（画像里没有 fear/dread 槽）');
  a(d.skipped.some(function (x) { return x.face === 'fear' && x.reason === 'no-field'; }),
    'B6: fear 缺席被**点名**（不编一个“怕失去她”充数）');
  WA.store.transact(function (s) { s.people.p_su.drive = { want: '显式目标', fear: '被认出', line: '显式底线' }; });
  const d2 = WA.characterDrive.derive('p_su');
  a(d2.want === '显式目标' && d2.fear === '被认出' && d2.line === '显式底线', 'B7: 显式 drive.* 优先于画像字段');
  a(d2.sources.want === 'people[id].drive.want' && d2.sources.fear === 'people[id].drive.fear',
    'B8: 显式值的出处也如实标（“这是我的推断”与“这是写进去的”不能混）');
  const g = WA.characterDrive.derive('p_ghost');
  a(g.ok === false && g.reason === 'no-such-person', 'B9: 不存在的人如实报 no-such-person（不凭空造一个）');
  const long = '一'.repeat(80);
  WA.store.transact(function (s) { s.people.p_long = { name: '长篇', intent: long }; });
  a(WA.characterDrive.derive('p_long').want.length === 40, 'B10: want 按 maxText=40 截断（不进无限长文本）');
}

/* ─────────── C 筹码 ─────── */
{
  const env = sync.fresh(); const WA = seed(env);
  WA.characterDrive.setSettings({ enabled: true });
  const s1 = WA.characterDrive.stakes('p_su');
  a(s1 && s1.win === '争取到：把那封没拆的信送出去', 'C1: 取得侧来自 want');
  a(s1.partial === true && !('lose' in s1), 'C2: 只有 want ⇒ partial:true 且**不写“失手：未知”**（不编另一倒）');
  WA.store.transact(function (s) { s.people.p_su.fear = '被认出'; });
  a(WA.characterDrive.stakes('p_su').partial === true, 'C3: 画像上裸加的 fear 不读（只读真字段，不扫任意键）');
  WA.store.transact(function (s) { s.people.p_su.drive = { want: '甲', fear: '乙' }; });
  const s3 = WA.characterDrive.stakes('p_su');
  a(s3.partial === false && s3.win === '争取到：甲' && s3.lose === '失手：乙', 'C4: 两倒齐 ⇒ partial:false');
  WA.store.transact(function (s) { delete s.people.p_su.drive; delete s.people.p_su.intent; s.people.p_su.behaviorBoundaries = '不出卖朋友'; });
  a(WA.characterDrive.stakes('p_su') === null, 'C5: want 与 fear 都取不到 ⇒ null（只有 line 不算筹码）');
  a(WA.characterDrive.stakes('p_ghost') === null, 'C6: 不存在的人 ⇒ null');
}

/* ─────────── D 底线字面判据 ─────── */
{
  const env = sync.fresh(); const WA = seed(env);
  WA.characterDrive.setSettings({ enabled: true });
  a(WA.characterDrive.touchesLine('p_su', '逼他不出卖朋友，否则…').hit === true, 'D1: 文本**字面包含**底线 ⇒ 命中');
  a(WA.characterDrive.touchesLine('p_su', '逼他出卖朋友，否则…').hit === false,
    'D2: 同义表达（少了“不”）⇒ **不命中**（字面判据宁可漏，不可冕）');
  a(WA.characterDrive.touchesLine('p_su', '').reason === 'no-text', 'D3: 空文本 ⇒ no-text');
  WA.store.transact(function (s) { s.people.p_noline = { name: '无底线', intent: '想活' }; });
  a(WA.characterDrive.touchesLine('p_noline', '随便什么').reason === 'no-line', 'D4: 画象没 line ⇒ no-line（不把“想活”当底线）');
  a(WA.characterDrive.touchesLine('p_ghost', '不出卖朋友').hit === false, 'D5: 不存在的人不命中');
}

/* ─────────── E 接回 L1 ─────── */
{
  const env = sync.fresh(); const WA = seed(env);
  WA.characterDrive.setSettings({ enabled: true });
  WA.sceneIntent.setSettings({ enabled: true });
  WA.arcPhase.setSettings({ enabled: false });
  stubGauge(WA, 50, 'wave');
  stubDirector(WA, { kind: 'foreshadow', who: 'p_su', what: '逼他不出卖朋友', urgency: 3, bucket: 'foreshadow', why: 'x' });
  const c1 = WA.sceneIntent.compose();
  a(c1.ok === true && c1.pace === 'press', 'E1: 字面碰到底线 ⇒ 强制 press（实 ' + (c1 && c1.pace) + '）');
  a(c1.why.join('|').indexOf('触碰底线') >= 0, 'E2: why 写明被底线改写（不静默改节奏）');
  a(c1.stakes && c1.stakes.win, 'E3: 筹码进了 compose 返回值（下游能读到“赌的是什么”）');
  stubDirector(WA, { kind: 'foreshadow', who: 'p_su', what: '递给他那封没拆的信', urgency: 3, bucket: 'foreshadow', why: 'x' });
  const c2 = WA.sceneIntent.compose();
  a(c2.pace !== undefined && c2.why.join('|').indexOf('触碰底线') < 0, 'E4: 不碰底线 ⇒ 节奏不被改写');
  a(c2.stakes && c2.stakes.win, 'E5: 不碰底线时筹码仍然在（筹码不依赖触碰）');
  WA.characterDrive.setSettings({ enabled: false });
  const c3 = WA.sceneIntent.compose();
  a(c3.ok === true && c3.stakes === null, 'E6: 关闭时 stakes 为 null，compose 仍正常');
  a(!c3.skipped.some(function (x) { return x.face === 'drive'; }),
    'E7: **关闭不点名**（用户选择不是缺席，不能每轮在 skipped 里唠叨）');
  WA.sceneIntent.setSettings({ enabled: false });
}

/* ─────────── F 零写入纪律 ─────── */
{
  const env = sync.fresh(); const WA = seed(env);
  WA.characterDrive.setSettings({ enabled: true });
  const before = JSON.stringify(WA.store.get().people);
  WA.characterDrive.derive('p_su');
  WA.characterDrive.stakes('p_su');
  WA.characterDrive.touchesLine('p_su', '不出卖朋友');
  const after = JSON.stringify(WA.store.get().people);
  a(before === after, 'F1: 推导/筹码/底线三趟跑完，people 逐字节相同（零写入）');
  a(!('drive' in WA.store.get().people.p_su), 'F2: **不把推导结果写回 people[id].drive**（下次读到的不能是“我上次的推断”）');
  a(WA.characterDrive.stat().derives >= 3, 'F3: 推导次数自己被记账');
}

/* ─────────── G 接线 ─────── */
{
  const IDX = rd('index.js');
  const RUN = rd('tests/run.js');
  const DIAG = rd('engines/tool-diag-tables.js');
  const ENGINE = rd('engines/character-drive.js');
  const L1 = rd('engines/scene-intent.js');
  const order = (IDX.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
  a(order.indexOf("'engines/character-drive.js'") >= 0, 'G1: index.js LOAD_ORDER 登记了 L4 引擎');
  a(order.indexOf("'engines/character-drive.js'") < order.indexOf("'engines/scene-intent.js'"),
    'G2: character-drive 早于 scene-intent（后者在 compose 里取筹码）');
  a(RUN.indexOf("'engines/character-drive.js'") >= 0, 'G3: tests/run.js 的 LOAD 同序登记');
  a(RUN.indexOf('tests/character-drive-v2545.js') >= 0, 'G4: 本专锁已挂进 run.js');
  a(DIAG.indexOf("'engines/character-drive.js': 'characterDrive'") >= 0, 'G5: tool-diag 文件面映射登记');
  a(L1.indexOf('driveStakes(') >= 0 && L1.indexOf('driveLineTouch(') >= 0, 'G6: L1 真调筹码与底线');
  a(!/WA\.store\.transact/.test(ENGINE) && !/WA\.store\.set\(/.test(ENGINE), 'G7: 引擎源码里零 store 写入调用');
  a(!/WA\.on\(/.test(ENGINE), 'G8: **零总线订阅**（不占监听位契约）');
}

console.log('\nCHARACTER-DRIVE-V2545: ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
