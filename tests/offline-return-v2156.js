#!/usr/bin/env node
// v2.156.0 S1 专锁：离线恢复编排（engines/offline-return.js）
//   它锁的判据（按「静默失效」代价排序）：
//     ① **票据两道**：进门比 chatId、事务内比 lastSettledAt 快照 —— 丢了它，并发窗口里
//        同一段离线会被推第二遍，而读数上与「真的又离开了一回」长得一模一样；
//     ② **失败不吞随机**：首跑录磁带、失败留卷、重试重放 —— 丢了它，重试就是「换一个世界」；
//     ③ **消费的唯一现场证据**是 `store.lastInjection.sources` —— 丢了它，没进正文的摘要
//        会被记成已消费（那段「你不在时」永远消失）；
//     ④ **订阅惰性**：打开开关不挂，**真结算过一次**才挂 ——
//        本仓总线上「有发出无监听」是刻意可见的健康信号（G21 逐位钉住）；
//     ⑤ **零 localStorage**（getItem/setItem 各 0 处）与**恰一处世界事务**；
//     ⑥ **失败不动基准**（下次仍然算「你离开过」）与**重试不改运气**。
//   ── 夹具纪律（本文件实测自纠，三条都是被红判据逼出来的）：
//      ① **同域时间**：`playtime.touch` 落的是真实时钟，`recover` 的 now 由调用方给 ——
//         必须读回真实基准后构造成「基准 + 足够的 gap」；
//      ② **gap 要跨过 stepMs**：`offlineTick.tick` 的轮数 = floor(elapsed/stepMs)，
//         只给一个 minGapMs 量级的 gap 会是 rounds=0/applied=false —— 那断的是
//         「推演没发生」，不是被测的判据；
//      ③ **fresh() 不清世界账**：store 会从宿主 localStorage 载入上一轮的状态
//         （含 offlineTick.lastSettledAt / batches）。故每个用例前必须 resetHost()：
//         键、世界账、lastInjection 三件一起清，否则上例的残留会先于断言生效。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/offline-return.js';
const SELF_REL = 'tests/offline-return-v2156.js';

const ANCHOR = "    const sources = (li && Array.isArray(li.sources)) ? li.sources : [];";
const ANCHOR2 = "      const cur = num(draft.offlineTick && draft.offlineTick.lastSettledAt);";
const ANCHOR3 = "      if (!failed || mode !== 'record') __retryTape = null;";
const ANCHOR4 = "      ensureSubscribed();";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function on(WA) {
  WA.store.init();
  WA.offlineTick.setSettings({ enabled: true });
  WA.offlineReturn.setSettings({ enabled: true });
}
/** 前置条件复位：三件一起清（键 / 世界账 / 上轮注入现场），再把活动基准落一次。 */
function resetHost(WA) {
  try { WA.mainWin.localStorage.removeItem('worldaxis_playtime_v1'); } catch (e) {}
  try {
    WA.store.transact(function (d) {
      d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 };
      d.lastInjection = null;
    }, 'offline-return-v2156:reset');
  } catch (e) {}
  try { WA.playtime.touch({ force: true }); } catch (e) {}
}
/** 与已落基准**同域**的 now，且跨过 mult 个 stepMs（保证 rounds>=1）。 */
function stepNow(WA, mult) {
  const st = WA.offlineTick.getSettings();
  return WA.playtime.lastActive().at + st.stepMs * mult;
}
/** 预热：把 offlineTick 基准落下（此后 recover 才会真结算）。 */
function prime(WA) { return WA.offlineReturn.recover({ now: stepNow(WA, 2) }); }
function busChat(WA) {
  const e = WA.busStats(999).events.filter(function (r) { return r.event === 'chat:changed'; })[0];
  return e ? e.listeners : -1;
}
/** 事务内并发：模拟「进门之后、起事务之前，另一个结算把基准前移了」。 */
function raceInsideTx(WA) {
  let inner = null;
  WA.store.transact(function (d) {
    d.offlineTick = Object.assign({}, d.offlineTick, { lastSettledAt: (d.offlineTick && d.offlineTick.lastSettledAt) + 1 });
    inner = WA.offlineReturn.recover({ now: stepNow(WA, 3) });
    return true;
  }, 'offline-return-v2156:race');
  return inner;
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2156/or A1: 消费判据（sources）锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2156/or A2: 事务内票据复核锚点恰中 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  a(countOcc(src, ANCHOR3) === 1, 'v2156/or A3: 磁带留卷判据锚点恰中 1 次（实 ' + countOcc(src, ANCHOR3) + '）');
  a(countOcc(src, ANCHOR4) === 1, 'v2156/or A4: 惰性订阅挂载点恰中 1 次（实 ' + countOcc(src, ANCHOR4) + '）');
  a(countOcc(src, "if (out && out.enabled) ensureSubscribed();") === 0,
    'v2156/or A5: 防回归 —— setSettings 里**不得**挂订阅（saveOrThrow 返回的是写结果，不是设置值）');
  a(countOcc(src, 'getItem') === 0 && countOcc(src, 'setItem') === 0,
    'v2156/or A6: 零 localStorage（getItem/setItem 各 ' + countOcc(src, 'getItem') + '/' + countOcc(src, 'setItem') + '）—— 票据就是世界状态里的 lastSettledAt');
  a(countOcc(src, '.transact(') === 1 && countOcc(src, 'WA.store.transact(') === 1,
    'v2156/or A7: 全模块恰一处世界事务（实 ' + countOcc(src, '.transact(') + '）—— 「只写世界、不写自己」是结构事实');
  a(countOcc(src, "chain: 'before', order: 7,") === 1 && countOcc(src, "chain: 'after', order: 41,") === 1,
    'v2156/or A8: 两个节点 order 7 / 41 各恰 1 处（前者早于全部注入节点，后者紧随 memory.digest）');
  a(countOcc(src, 'critical: false') === 2, 'v2156/or A9: 两节点 critical 皆 false（附属面失败不拖主链）');
  a(src.indexOf("const SRC = '你不在时';") >= 0, 'v2156/or A10: 摘要源名在场');
  const inj = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
  a(inj.indexOf("source: '你不在时'") >= 0,
    'v2156/or A11: 源名与 render/inject.js 的 items.push({source}) 逐字同名（改一处就断）');
  a(src.indexOf("WA.registerModule('engines/offline-return.js'") >= 0, 'v2156/or A12: 模块自报登记');
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1 && countOcc(self, ANCHOR3) >= 1 && countOcc(self, ANCHOR4) >= 1,
    'v2156/or A13: 四个锚点在本文件里至少各引用 1 次');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  on(WA); resetHost(WA);
  const R = WA.offlineReturn;
  a(Object.keys(R).sort().join(',') === 'consume,getSettings,recover,setSettings,stat',
    'v2156/or B1: 导出面恰为 SRC/getSettings/setSettings/recover/consume/stat（实 ' + Object.keys(R).sort().join(',') + '）');

  R.setSettings({ enabled: false });
  a(R.recover().reason === 'disabled' && R.consume().reason === 'disabled',
    'v2156/or B2: 关闭时 recover / consume 一并拒收（disabled）');
  a(R.stat().subscribed === false, 'v2156/or B3: 默认休眠不占总线监听位（subscribed=false）');
  R.setSettings({ enabled: true });
  a(R.stat().subscribed === false,
    'v2156/or B4: 只打开开关仍不占位 —— 订阅挂在「真结算过一次」（否则 G21 的休眠期读数被抹平）');
  const bus0 = busChat(WA);

  // B5 首见：只落两本账的起点，不结算
  const rf = R.recover({ now: stepNow(WA, 2) });
  a(rf.ok === true && rf.first === true && R.stat().settleTicks === 0,
    'v2156/or B5: 首见只落两本账的起点、不结算（first=true）—— 「不知道你走了多久」≠「你走了零秒」');

  // B6 短间隔 ⇒ too-short（门槛取自 offlineTick 自己的 minGapMs）
  const r2 = R.recover({ now: WA.playtime.lastActive().at + 30000 });
  a(r2.reason === 'too-short' && r2.minGapMs === WA.offlineTick.getSettings().minGapMs,
    'v2156/or B6: 短间隔拒算 too-short，门槛取自 offlineTick 的 minGapMs（不造第二真源）');

  // B7 时钟回拨 ⇒ backward
  const bb = WA.playtime.lastActive().at;
  a(R.recover({ now: bb - 5000 }).reason === 'backward', 'v2156/or B7: 时钟回拨拒算 backward（不把负时长当 0）');

  // B8 正常一跑：settled + 至少两轮 + 一批待消费 + 订阅此刻才挂
  const r4 = R.recover({ now: stepNow(WA, 4) });
  const st4 = R.stat();
  a(r4.ok === true && r4.reason === 'settled' && r4.applied === true && r4.rounds >= 2,
    'v2156/or B8: 一次恢复如实结算（rounds ' + r4.rounds + ' / applied ' + r4.applied + '）');
  a(st4.pending === 1 && st4.settleTicks === 1, 'v2156/or B9: 结算后待消费批数=1（消费面还未走）');
  a(busChat(WA) === bus0 + 1,
    'v2156/or B10: 真结算过一次之后才挂 chat:changed（' + bus0 + '\u2192' + busChat(WA) + '）—— 惰性只对「没结算过」成立');
  a(R.stat().subscribed === true && R.stat().hasRetryTape === false,
    'v2156/or B11: 成功后订阅已挂且**不留卷**（留卷只在真失败时）');

  // B12 消费：未进正文 ⇒ not-injected 且**不记账**
  WA.store.transact(function (d) { d.lastInjection = { at: 1, sources: ['世界状态'], injected: 1, len: 1, mainCount: 1 }; }, 'or-v2156:inj');
  const c1 = R.consume();
  a(c1.ok === false && c1.reason === 'not-injected' && R.stat().pending === 1,
    'v2156/or B12: 摘要未进正文时 consume 拒收 not-injected，且**不记消费**（待消费仍为 1）');

  // B13 真进正文 ⇒ 消费；消费后 buildBlock 归零；重复消费幂等
  WA.store.transact(function (d) { d.lastInjection = { at: 2, sources: ['你不在时', '世界状态'], injected: 1, len: 1, mainCount: 1 }; }, 'or-v2156:inj2');
  const c2 = R.consume();
  a(c2.ok === true && c2.already === false, 'v2156/or B13: 真进正文后消费落账（already=false）');
  a(R.stat().pending === 0 && (WA.offlineTick.buildBlock() || '') === '',
    'v2156/or B14: 消费后待消费归零且摘要块**不再重复注入**（未消费的批次会每轮重念同一段）');
  const c3 = R.consume();
  a(c3.ok === true && c3.already === true && R.stat().consumes === 1,
    'v2156/or B15: 重复消费幂等（already=true，consumes 不双计）');

  // B16 票据复核：事务内基准被并发前移 ⇒ 如实拒收 stale-baseline 且不落批
  const WA3 = fresh(); on(WA3); resetHost(WA3);
  const R3 = WA3.offlineReturn;
  prime(WA3);
  const pendBefore = R3.stat().pending;
  const inner = raceInsideTx(WA3);
  a(inner && inner.reason === 'stale-baseline' && R3.stat().staleTickets >= 1 && R3.stat().pending === pendBefore,
    'v2156/or B16: 事务内基准被前移 ⇒ 拒收 stale-baseline 且**不落批**（实 ' + JSON.stringify(inner) + '）');

  // B17 失败不动基准 + 留卷；重试重放同一磁带；重试成功后清卷
  const WA2 = fresh(); on(WA2); resetHost(WA2);
  const R2 = WA2.offlineReturn;
  prime(WA2);
  const baseBefore = WA2.playtime.lastActive().at;
  const origTick = WA2.life.tickDraft;
  WA2.life.tickDraft = function () { return { ok: false, reason: 'stub-fail' }; };
  const f1 = R2.recover({ now: stepNow(WA2, 3) });
  WA2.life.tickDraft = origTick;
  a(f1.ok === false && R2.stat().fails === 1 && R2.stat().hasRetryTape === true,
    'v2156/or B17: 推演失败 ⇒ 如实拒收、失败入账且**留一卷磁带**（别改随机）');
  a(WA2.playtime.lastActive().at === baseBefore,
    'v2156/or B18: **失败不动基准**（基准 ' + baseBefore + '）—— 下次仍然算一次「你离开过」');
  const f2 = R2.recover({ now: stepNow(WA2, 3) });
  a(f2.ok === true && R2.stat().retries === 1,
    'v2156/or B19: 重试走**重放**（retries=1）—— 同一批离线重试不换运气');
  a(R2.stat().hasRetryTape === false,
    'v2156/or B20: 重试成功后清卷（不清的话，下一次无关恢复会重放上一批的磁带）');

  // B21 stat 字段齐全（面板与诊断读的字段）
  const ks = Object.keys(R.stat());
  a(['recovers', 'firsts', 'skipped', 'fails', 'retries', 'ticketChecks', 'staleTickets',
    'settleTicks', 'rounds', 'protectedRows', 'consumeChecks', 'consumes', 'consumeSkips',
    'lastReason', 'faults', 'enabled', 'deferMs', 'running', 'subscribed', 'hasRetryTape',
    'chatId', 'settledAt', 'offlineTickEnabled', 'stepMs', 'minGapMs', 'pending', 'src', 'settingsKey']
    .every(function (k) { return ks.indexOf(k) >= 0; }),
    'v2156/or B21: 面板与诊断读的字段全在（缺一个就是静默少显示）');
}

// ── 负控制 ────────────────────────────────────────────────────────────
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');

  // N1 拆掉事务内票据复核 ⇒ 并发窗口内的第二次推演被放行
  const b1 = orig.replace(ANCHOR2, '      const cur = expected;');
  if (b1 === orig) throw new Error('N1 破坏没有命中');
  const WA1 = fresh((function () { const o = {}; o[REL] = b1; return o; })());
  on(WA1); resetHost(WA1);
  prime(WA1);
  const p0 = WA1.offlineReturn.stat().pending;
  const in1 = raceInsideTx(WA1);
  const p1 = WA1.offlineReturn.stat().pending;
  a(in1 && in1.ok === true && p1 > p0,
    'v2156/or N1: 拆掉票据复核后，并发窗口内的第二次推演被放行（待消费 ' + p0 + '\u2192' + p1 + '；正确实现应保持不变）—— 「同一段离线推两遍」与「真的又离开一回」不再可分');

  // N2 拆掉留卷判据 ⇒ 失败后无处可重放
  const b2 = orig.replace(ANCHOR3, '      __retryTape = null;');
  if (b2 === orig) throw new Error('N2 破坏没有命中');
  const WA2 = fresh((function () { const o = {}; o[REL] = b2; return o; })());
  on(WA2); resetHost(WA2);
  const R2 = WA2.offlineReturn;
  prime(WA2);
  const ot2 = WA2.life.tickDraft;
  WA2.life.tickDraft = function () { return { ok: false, reason: 'stub-fail' }; };
  R2.recover({ now: stepNow(WA2, 3) });
  WA2.life.tickDraft = ot2;
  a(R2.stat().hasRetryTape === false,
    'v2156/or N2: 去掉留卷后失败不留磁带（hasRetryTape=false）—— 重试将重新掷骰，「重试」变「换一个世界」');

  // N3 拆掉「源必须真进正文」的判据 ⇒ 没进正文也被记成已消费
  const FIND3 = [ANCHOR, '    if (sources.indexOf(SRC) < 0) {'].join(String.fromCharCode(10));
  a(countOcc(orig, FIND3) === 1, 'v2156/or N3 前提：sources 判据块恰中 1 次');
  const b3 = orig.replace(FIND3, [ANCHOR, '    if (false) {'].join(String.fromCharCode(10)));
  if (b3 === orig) throw new Error('N3 破坏没有命中');
  const WA3 = fresh((function () { const o = {}; o[REL] = b3; return o; })());
  on(WA3); resetHost(WA3);
  const R3 = WA3.offlineReturn;
  prime(WA3);
  R3.recover({ now: stepNow(WA3, 3) });
  WA3.store.transact(function (d) { d.lastInjection = { at: 2, sources: [], injected: 0, len: 0, mainCount: 0 }; }, 'or-v2156:m');
  const cx = R3.consume();
  a(cx.ok === true && R3.stat().consumes === 1 && R3.stat().pending === 0,
    'v2156/or N3: 去掉「源必须真进正文」的判据后，**没进正文**也被记成已消费（consumes=' + R3.stat().consumes + '）—— 那段「你不在时」从此永远不再出现');

  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig, 'v2156/or N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, ANCHOR3, ANCHOR4, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('OFFLINE-RETURN-V2156: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
