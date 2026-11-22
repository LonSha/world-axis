#!/usr/bin/env node
// v2.156.0 S1 专锁（跨模块）：摘要消费契约（offline-tick \u00d7 offline-return）
//   为什么单独一把锁：这两条链的**接缝**不在任一模块内部 ——
//     · `offlineTick.markConsumed` 只答「账记下了」；
//     · `offlineReturn.consume` 只答「该不该记」（现场证据 = lastInjection.sources）；
//     · 而「已消费的摘要不再重复注入」这个**行为**只有两者同时正确才成立。
//   它锁的判据：
//     ① 无批次 ⇒ no-batch；重复消费幂等（already）；
//     ② summary().consumed / stat().pending / buildBlock() 三处读数**跟着一起动**
//        （三处各读各的判据，任一处漏改就是「一个说消费了一个说没有」）；
//     ③ `consumedAt: null` 与 `consumedAt: 0` 必须可分（`Number(null)===0` 是本仓实测过的坑）；
//     ④ 两个总开关**各管各的**（offlineTick 开而 offlineReturn 关 ⇒ consume 拒收，
//        但底层 markConsumed 依旧可用 —— 编排关闭不该让账口也跟着坏）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/offline-return.js';
const REL_T = 'engines/offline-tick.js';
const SELF_REL = 'tests/offline-consume-v2156.js';

// 锚点一取 offline-tick 的「未消费」判据：显式 `!== null` 是唯一正确的写法。
const ANCHOR_T1 = '      if (num(last.consumedAt) !== null) { out = { ok: true, already: true, at: num(last.consumedAt) }; return false; }';
// 锚点二取 buildBlock 的「已消费则不再注入」闸门。
const ANCHOR_T2 = '    if (Array.isArray(lb) && lb.length && num(lb[lb.length - 1].consumedAt) !== null) return \'\';';
// 锚点三取跨模块桥点：consume 的唯一现场证据。
const ANCHOR_R1 = '    if (sources.indexOf(SRC) < 0) {';

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function on(WA) {
  WA.store.init();
  WA.offlineTick.setSettings({ enabled: true });
  WA.offlineReturn.setSettings({ enabled: true });
}
function resetHost(WA) {
  try { WA.mainWin.localStorage.removeItem('worldaxis_playtime_v1'); } catch (e) {}
  try {
    WA.store.transact(function (d) {
      d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 };
      d.lastInjection = null;
    }, 'offline-consume-v2156:reset');
  } catch (e) {}
  try { WA.playtime.touch({ force: true }); } catch (e) {}
}
function stepNow(WA, mult) {
  const st = WA.offlineTick.getSettings();
  return WA.playtime.lastActive().at + st.stepMs * mult;
}
/** 造一批待消费的账（预热一次、再真结算一次）。 */
function makeBatch(WA) {
  WA.offlineReturn.recover({ now: stepNow(WA, 2) });
  return WA.offlineReturn.recover({ now: stepNow(WA, 3) });
}
function markInjected(WA, yes) {
  WA.store.transact(function (d) {
    d.lastInjection = { at: 9, sources: yes ? ['你不在时', '世界状态'] : ['世界状态'], injected: 1, len: 1, mainCount: 1 };
  }, 'offline-consume-v2156:inj');
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const t = fs.readFileSync(path.join(BASE, REL_T), 'utf8');
  const r = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(t, ANCHOR_T1) === 1, 'v2156/oc A1: 「未消费」判据锚点恰中 1 次（实 ' + countOcc(t, ANCHOR_T1) + '）');
  a(countOcc(t, ANCHOR_T2) === 1, 'v2156/oc A2: buildBlock 消费闸门锚点恰中 1 次（实 ' + countOcc(t, ANCHOR_T2) + '）');
  a(countOcc(r, ANCHOR_R1) === 1, 'v2156/oc A3: 跨模块桥点（sources 判据）锚点恰中 1 次（实 ' + countOcc(r, ANCHOR_R1) + '）');
  a(t.indexOf('markConsumed: markConsumed,') >= 0, 'v2156/oc A4: offlineTick 导出 markConsumed（账口对编排可见）');
  a(r.indexOf('markConsumed({ now: now })') >= 0, 'v2156/oc A5: offlineReturn 调的是账口（不自己动 batches —— 批次账只有一个写方）');
  a(countOcc(t, "if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }") >= 2,
    'v2156/oc A6: offlineTick 的账口与摘口各自过自己的总开关（各管各的）');
  // 自引用核对走**标识符**：锚点常量里含转义引号（如 buildBlock 闸门那个 `return '';`），
  //   按字面串匹配会被转义形式绕开 —— 「本文件有没有引用它们」这件事只与标识符有关。
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, 'ANCHOR_T1') >= 2 && countOcc(self, 'ANCHOR_T2') >= 2 && countOcc(self, 'ANCHOR_R1') >= 2,
    'v2156/oc A7: 三个锚点常量在本文件里各至少出现 2 次（声明 + 引用）');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  on(WA); resetHost(WA);
  const T = WA.offlineTick, R = WA.offlineReturn;

  // B1 无批次 ⇒ no-batch（编造一段「什么都没发生」比拒收更坏）
  a(T.summary().reason === 'no-batch' && T.markConsumed().reason === 'no-batch',
    'v2156/oc B1: 无批次时 summary 与 markConsumed 一并拒收 no-batch');

  // B2 造一批：三处读数一致为「未消费」
  const b = makeBatch(WA);
  a(b && b.ok === true && b.applied === true, 'v2156/oc B2: 夹具造出一批已结算的账（rounds ' + (b && b.rounds) + '）');
  a(T.summary().consumed === false && T.summary().consumedAt === null && T.stat().pending === 1
    && (T.buildBlock() || '').length > 0,
    'v2156/oc B3: 未消费时三处读数一致（summary.consumed=false / pending=1 / 块非空）');

  // B4 未进正文 ⇒ 编排拒收且**账未动**（三处读数不变）
  markInjected(WA, false);
  const c1 = R.consume();
  a(c1.reason === 'not-injected' && T.summary().consumed === false && T.stat().pending === 1,
    'v2156/oc B4: 源未进正文时编排拒收，且**批次账未被碰**（宁可多注入一次，也不把没发生的事记成发生）');

  // B5 真进正文 ⇒ 账动，三处读数同时翻转
  markInjected(WA, true);
  const c2 = R.consume();
  a(c2.ok === true && c2.already === false, 'v2156/oc B5: 真进正文后消费落账');
  a(T.summary().consumed === true && T.summary().consumedAt > 0 && T.stat().pending === 0
    && (T.buildBlock() || '') === '',
    'v2156/oc B6: 消费后三处读数同时翻转（consumed=true / pending=0 / 块归空）—— 任一处漏改就是「一个说消费了一个说没有」');

  // B7 重复消费幂等（账不双计）
  const c3 = R.consume();
  const c4 = T.markConsumed();
  a(c3.already === true && c4.already === true && T.stat().consumed === 1,
    'v2156/oc B7: 重复消费幂等（两边都答 already，底层 consumed 计数不双计）');

  // B8 两个总开关各管各的：底层账口在编排关闭时仍可用
  R.setSettings({ enabled: false });
  a(R.consume().reason === 'disabled' && T.markConsumed().ok === true,
    'v2156/oc B8: 编排关闭 ⇒ consume 拒收，但底层 markConsumed 仍可用（总开关各管各的）');
  R.setSettings({ enabled: true });

  // B9 offlineTick 自身关闭 ⇒ 账口与摘口一并拒收（关闭不该留下一个能记账的口）
  T.setSettings({ enabled: false });
  a(T.markConsumed().reason === 'disabled' && (T.buildBlock() || '') === '' && T.summary().ok === true,
    'v2156/oc B9: 账口关闭 ⇒ 记账拒收、注入块归空（summary 仍可读：读数不该因关闭而消失）');
  T.setSettings({ enabled: true });
}

// ── 负控制 ────────────────────────────────────────────────────────────
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL_T), 'utf8');

  // N1 拆掉 buildBlock 的消费闸门 ⇒ 已消费的摘要被反复重念
  const b1 = orig.replace(ANCHOR_T2, '    if (false) return \'\';');
  if (b1 === orig) throw new Error('N1 破坏没有命中');
  const WA1 = fresh((function () { const o = {}; o[REL_T] = b1; return o; })());
  on(WA1); resetHost(WA1);
  makeBatch(WA1);
  markInjected(WA1, true);
  WA1.offlineReturn.consume();
  a((WA1.offlineTick.buildBlock() || '').length > 0,
    'v2156/oc N1: 拆掉闸门后已消费的摘要仍被注入（块长 ' + (WA1.offlineTick.buildBlock() || '').length + '）—— 玩家每轮都读到一段早就发生过的「你不在时」');

  // N2 把「未消费」判据写成 isFinite 形态 ⇒ `Number(null)===0` 让未消费被读成已消费
  const b2 = orig.replace(ANCHOR_T1,
    '      if (isFinite(Number(last.consumedAt))) { out = { ok: true, already: true, at: last.consumedAt }; return false; }');
  if (b2 === orig) throw new Error('N2 破坏没有命中');
  const WA2 = fresh((function () { const o = {}; o[REL_T] = b2; return o; })());
  on(WA2); resetHost(WA2);
  const T2 = WA2.offlineTick;
  makeBatch(WA2);
  markInjected(WA2, true);
  const cx = WA2.offlineReturn.consume();
  a(cx.already === true && T2.summary().consumed === false && T2.stat().pending === 1,
    'v2156/oc N2: 改用 isFinite 后，**未消费**的批次被判成已消费（markConsumed 答 already、而 summary 仍答 consumed=false）—— 两处读数当场打架，那段摘要永远记不上消费');

  a(fs.readFileSync(path.join(BASE, REL_T), 'utf8') === orig, 'v2156/oc N3: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, REL_T, ANCHOR_T1, ANCHOR_T2, ANCHOR_R1, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('OFFLINE-CONSUME-V2156: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
