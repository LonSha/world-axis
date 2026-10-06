#!/usr/bin/env node
// v2.161.0 专锁（TP3 + TP5）：离线恢复的**页面入口**与**时间编排收口**。
//
// ── 本锁治的两件事（TP3 原文）────────────────────────────────────────
//   TP3「离线恢复入口与时间编排收口」的两处缺口，两处都由源码搜索/读码确证，不是推测：
//     ① **页面恢复入口不存在**：全产品面 `visibilitychange` / `pageshow` 零命中 ——
//        「你关掉页面又回来」这件事在宿主真实事件源里无人监听。
//     ② **时间编排跨源相减**：`gapMs = now - base.at` 里的 now 取**决策时间**（clockNow），
//        而 base.at 由 `playtime.touch()` 用**测量时间**（clockWall）写入。core/clock.js 的头注
//        写得很清楚：「时间分两类，不得混流」。未冻结时两者数值相等，所以这个缺陷
//        **只在决策时钟被冻结/回放时现形**：时钟一冻，gapMs 当场变成「冻结时刻 − 墙钟基准」，
//        于是「时钟被冻住」被读成「你真的离开了那么久」，而读数与真离开同形。
//
// ── 判据分三层（按「静默失效」代价排序）──────────────────────────────
//   A 结构面：页面监听两条各恰 1 处；分域三件（gapAt / injected / crossSource）在位；
//     已有的结构纪律不得回退（零 localStorage、恰一处事务、两节点 order 7/41、critical 皆 false、
//     不新增工作流节点）。
//   B 行为面（时间源相关的三条一律用**基准桩**，不用实时时序）：
//     B1 同源：基准在 30s 前 ⇒ gapMs **恰为 30000**（不是「小于门槛」这类模糊判据）。
//     B2 **冻结不得被读成离开**（承重）：决策时钟冻到墙钟 +2h、基准在 30s 前 ⇒ 仍拒收 too-short，
//        且台账里的时长仍是 30000、零结算。
//     B3 **真离开不能被一起拒掉**（修复不得误伤）：基准在两小时前 ⇒ 照常结算。
//     B4 注入时刻逐字沿用：gapMs === 注入时刻 − 基准。
//     B5 回拨归因分列两时刻（gapAt / decisionAt / crossSource）。
//     B6 页面入口的合并窗：同一次回前台连发两拍 ⇒ 窗内只跑一次；非 page 触发不受窗影响。
//     B7 台账留痕四个位在册且非 NaN。B8 惰性挂载（未结算不占位、结算后占位）。
//   N 负控制：真源码内存副本破坏，两向自证（锚点恰中一次 / 原版同判据成立 / 破坏版失败）。
//     N1 把 gap 拨回决策时间 ⇒ 冻结场景下**照常结算**（缺陷复现）
//     N2 拆掉合并窗 ⇒ 第二拍照跑
//     N3 改掉 visibilitychange 事件名 ⇒ 监听面判据当场缺失
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/offline-return.js';

// ── 锚点（真源码里各恰中 1 次）───────────────────────────────
const ANCHOR_GAP = '    const gapMs = gapAt - base.at;';
const ANCHOR_COAL = "    if (trig.indexOf('page-') === 0) {";
const ANCHOR_VIS = "      win.addEventListener('visibilitychange', function () {";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }
function src() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function step(WA, mult) {
  const st = WA.offlineTick.getSettings();
  return WA.playtime.lastActive().at + st.stepMs * mult;
}
/** 前置：总开关都开 + 把活动基准落下（此后 recover 才会真结算）。 */
function on(WA) {
  WA.store.init();
  WA.offlineTick.setSettings({ enabled: true });
  WA.offlineReturn.setSettings({ enabled: true });
  WA.playtime.touch({ force: true });
}
/**
 * **基准桩**：把「上次活动」钉在一个确定量上（现在是 _delta_ 毫秒前）。
 *   为什么不用实时时序：touch() 与 recover() 可能落在**同一毫秒**里，于是 gap 在 0/1 之间跳，
 *   判据会时而读成 backward、时而读成 too-short —— 一条会看运气的判据不是判据。
 *   桩本身是正当的：基准的写入口与这里是同一个量（`clockWall()` 毫秒），产品只消费 `base.at`。
 *   返回 restore()。
 */
function stubBase(WA, deltaMs, tag) {
  const keep = WA.playtime.lastActive;
  WA.playtime.lastActive = function () {
    return { ok: true, chatId: tag || 'v2161', at: WA.clock.wallNow() - deltaMs, ageMs: deltaMs, updates: 1, firstAt: 0 };
  };
  return function restore() { WA.playtime.lastActive = keep; };
}

/** 固定值基准桩：把「上次活动」钉在某个**确定时刻**上（用于注入时刻的对照场景）。 */
function stubFixed(WA, at, tag) {
  const keep = WA.playtime.lastActive;
  WA.playtime.lastActive = function () {
    return { ok: true, chatId: tag || 'v2161f', at: at, ageMs: WA.clock.wallNow() - at, updates: 1, firstAt: 0 };
  };
  return function restore() { WA.playtime.lastActive = keep; };
}

// ── A 结构面 ──────────────────────────────────────────
function runA(a) {
  const s = src();
  a(countOcc(s, ANCHOR_VIS) === 1,
    'v2161/tp3 A1: visibilitychange 监听恰 1 处（实 ' + countOcc(s, ANCHOR_VIS) + '）—— 重复绑定会让同一次回来跑两轮编排');
  a(countOcc(s, "win.addEventListener('pageshow'") === 1,
    'v2161/tp3 A2: pageshow 监听恰 1 处');
  a(countOcc(s, 'function ensurePageHook()') === 1 && countOcc(s, 'ensurePageHook();') === 1,
    'v2161/tp3 A3: 入口有明确的挂载函数与唯一的调用点（与总线订阅同一处，判据同为「真结算过一次」）');
  a(countOcc(s, 'PAGE_COALESCE_MS') === 2,
    'v2161/tp3 A4: 合并窗常量引用恰 2 处（声明 1 + 判据 1）—— 写成字面量散在两处就是第二份真源（实 '
      + countOcc(s, 'PAGE_COALESCE_MS') + '）');
  a(countOcc(s, ANCHOR_GAP) === 1,
    'v2161/tp3 A5: gapMs 由**同域时刻**相减（gapAt − base.at），实 ' + countOcc(s, ANCHOR_GAP) + ' 次');
  a(countOcc(s, 'const gapAt = injected === null ? clockWall() : injected;') === 1,
    'v2161/tp3 A6: 判定时刻与推进时刻分域（注入时刻逐字沿用，未注入时判定走测量时间）');
  a(s.indexOf('      if (at - __lastResumeAt < PAGE_COALESCE_MS) {') >= 0,
    'v2161/tp3 A7: 合并窗判据在 recover 内部执行（页面入口与总线订阅共用同一道判定）');
  a(countOcc(s, 'win.document && win.document.visibilityState') === 1,
    'v2161/tp3 A8: 只认「变回可见」那一半（hidden 时同一事件名也会发一次，而那一刻你并没有回来）');
  a(s.indexOf('if (!e || !e.persisted) return;') >= 0,
    'v2161/tp3 A9: pageshow 只认 bfcache 恢复 —— 首次加载也发 pageshow，认了就会与 before 链抢「首见」');
  a(countOcc(s, 'getItem') === 0 && countOcc(s, 'setItem') === 0 && countOcc(s, '.transact(') === 1,
    'v2161/tp3 A10: 新增入口不得动摇既有纪律（零 localStorage / 恰一处事务）');
  a(countOcc(s, 'critical: false') === 2 && countOcc(s, "chain: 'before', order: 7,") === 1
    && countOcc(s, "chain: 'after', order: 41,") === 1,
    'v2161/tp3 A11: 页面入口**不新增工作流节点**（两节点与 critical 计数逐字不变）——入口是事件面的，不是链上的');
  a(countOcc(s, '      ensureSubscribed();') === 1 && countOcc(s, '      ensurePageHook();') === 1,
    'v2161/tp3 A12: 两条监听各恰 1 个挂载点（惰性纪律：都挂在真结算成功之后）');
}

// ── B 行为面 ──────────────────────────────────────────
function runB(a) {
  const SPAN = 30000;      // 30s：短于 minGapMs(60000)
  const HOURS2 = 7200000;  // 2h：远大于 minGapMs

  // B1 同源：基准 30s 前 ⇒ gapMs 恰为 30000
  const W1 = fresh(); on(W1);
  const R1 = W1.offlineReturn;
  const res1 = stubBase(W1, SPAN, 'v2161b1');
  const r1 = R1.recover({});
  res1();
  //   容差 ±3ms：基准与判定各自现读一次 clockWall，两次读数之间**真的会走 1ms**（实测 30000 → 29999）；
  //   把一个「必然会有」的毫秒误差写成严格相等，等于让判据看机器的忙闲。
  a(r1 && r1.reason === 'too-short' && Math.abs(r1.gapMs - SPAN) <= 3,
    'v2161/tp3 B1: 未冻结时不注入时刻 ⇒ 判定用测量时间（gapMs ' + (r1 && r1.gapMs) + ' 应落在 ' + SPAN + '±3ms）');
  a(R1.stat().settleTicks === 0,
    'v2161/tp3 B1b: 未过门槛就不结算（settleTicks 0）');

  // B2 承重：决策时钟冻到 +2h，**不得**被读成「你真的离开了两小时」
  const W2 = fresh(); on(W2);
  const R2 = W2.offlineReturn;
  const res2 = stubBase(W2, SPAN, 'v2161b2');
  let frozen = false;
  let b2 = null, b2s = null;
  try {
    const fz = W2.clock.freeze(W2.clock.wallNow() + HOURS2);
    frozen = (fz !== null && W2.clock.frozen() === true);
    b2 = R2.recover({});
    b2s = R2.stat();
  } finally {
    try { W2.clock.unfreeze(); } catch (e) {}
    res2();
  }
  a(frozen === true, 'v2161/tp3 B2a: 夹具成立（决策时钟真被冻在墙钟 +2h）');
  a(b2 && b2.reason === 'too-short' && Math.abs(b2.gapMs - SPAN) <= 3,
    'v2161/tp3 B2b（承重）: 冻结决策时钟不得被当成「真过了两小时」（实 ' + (b2 && b2.reason) + ' / gapMs ' + (b2 && b2.gapMs) + '）'
      + ' —— 跨源相减时会拿到「冻结时刻 − 墙钟基准」= ' + (HOURS2 + SPAN) + ' 而照常结算');
  a(b2s && b2s.settleTicks === 0 && Math.abs(b2s.lastGapMs - SPAN) <= 3,
    'v2161/tp3 B2c: 冻结场景下零结算、且台账里的时长仍是 ' + SPAN + '±3ms（实 ' + (b2s && b2s.lastGapMs) + '）');

  // B3 真离开不能被一起拒掉（修复不得伤正当用法）
  //   两条边界必须一起满足，本判据刻意把两件事摆在同一场景里：
  //     ① 注入时刻走的是「判定用注入值」那条分支，故它是一个**固定值**（不是现测的墙钟）；
  //     ② 推进走的是 offlineTick，而它的轮数由**对齐后的窗口**算出，故注入时刻必须落在窗边界上
  //        （非对齐时 elapsed 会被窗口吸收成 0 轮 —— 那是 offlineTick 自身的既定口径，不是本项缺陷）。
  const W3 = fresh(); on(W3);
  const R3 = W3.offlineReturn;
  const DAY = 86400000;
  const T0 = Math.floor(W3.clock.wallNow() / DAY) * DAY;   // 窗边界（同一世界日的零点）
  const res3a = stubFixed(W3, T0 - HOURS2, 'v2161b3a');
  const r3a = R3.recover({ now: T0 });                      // 首见：只落两本账起点
  res3a();
  const res3b = stubFixed(W3, T0, 'v2161b3b');
  let r3 = null;
  try { r3 = R3.recover({ now: T0 + HOURS2 }); } finally { res3b(); }
  a(r3a && r3a.ok === true, 'v2161/tp3 B3a: 首见只落基准（' + (r3a && r3a.reason) + '）—— 夹具前提成立');
  a(r3 && r3.ok === true && r3.applied === true && r3.gapMs === HOURS2 && (r3.rounds || 0) >= 1,
    'v2161/tp3 B3: 真的离开两小时 ⇒ 照常结算（修复不得把正当用法一起拒掉；gapMs ' + (r3 && r3.gapMs)
      + ' / rounds ' + (r3 && r3.rounds) + ' / applied ' + (r3 && r3.applied) + '）');

  // B4 注入时刻逐字沿用（显式自证路径零行为变化）
  const W4 = fresh(); on(W4);
  const R4 = W4.offlineReturn;
  const b4base = W4.playtime.lastActive().at;
  const rs4 = W4.offlineTick.getSettings();
  const r4 = R4.recover({ now: b4base + rs4.stepMs * 3 });
  a(r4 && r4.gapMs === rs4.stepMs * 3,
    'v2161/tp3 B4: 注入时刻逐字沿用（gapMs ' + (r4 && r4.gapMs) + ' === 3×stepMs）—— 既有调用点零行为变化');

  // B5 回拨归因分列两时刻
  const W5 = fresh(); on(W5);
  const R5 = W5.offlineReturn;
  const b5base = W5.playtime.lastActive().at;
  const r5 = R5.recover({ now: b5base - 5000 });
  a(r5 && r5.reason === 'backward' && r5.crossSource === false
    && r5.gapAt === b5base - 5000 && r5.decisionAt === b5base - 5000,
    'v2161/tp3 B5: 回拨归因带上两个时刻各自的去处（gapAt / decisionAt / crossSource 三件在位）'
      + ' —— 只报一个差值时「时钟被冻住」与「用户把手机时间改乱了」在读数上同形');

  // B6 页面入口的合并窗
  const W6 = fresh(); on(W6);
  const R6 = W6.offlineReturn;
  const res6 = stubBase(W6, SPAN, 'v2161b6');
  let p1 = null, p2 = null, p3 = null;
  try {
    p1 = R6.recover({ trigger: 'page-visibility' });   // 零写入早退（too-short）——先占住本拍
    p2 = R6.recover({ trigger: 'page-pageshow' });     // 窗内 ⇒ 合并
  } finally { res6(); }
  const st6 = R6.stat();
  a(p1 && p1.reason === 'too-short',
    'v2161/tp3 B6a: 第一拍真走到了判定（too-short）—— 否则本判据测的不是合并窗');
  a(p2 && p2.reason === 'coalesced' && st6.pageCoalesced >= 1 && st6.pageResumes === 1,
    'v2161/tp3 B6b: 同一次回来的第二拍被合并（coalesced）；「合并了几拍」与「跑了几次」分开记（resumes '
      + st6.pageResumes + ' / coalesced ' + st6.pageCoalesced + '）');
  p3 = R6.recover({ trigger: 'chat-changed' });
  a(p3 && p3.reason !== 'coalesced',
    'v2161/tp3 B6c: 非 page 触发不受合并窗影响（总线订阅与工作流节点各有自己的时序，被这层窗改写会让「它们什么时候跑」失去解释）');

  // B7 台账留痕在册且非 NaN
  const st7 = R6.stat();
  a(['pageResumes', 'pageCoalesced', 'pageHookBound', 'lastPageReason'].every(function (k) {
    return Object.prototype.hasOwnProperty.call(st7, k) && !(typeof st7[k] === 'number' && isNaN(st7[k]));
  }), 'v2161/tp3 B7: 四个留痕位都在 stat() 声明行里（少一个就是面板上恒 NaN，看起来像「这个读数没实现」）');

  // B8 惰性挂载位
  const W8 = fresh(); on(W8);
  const R8 = W8.offlineReturn;
  a(R8.stat().pageHookBound === false,
    'v2161/tp3 B8a: 未结算过 ⇒ 页面入口不占位（惰性：打开开关是意图，「跑过」才是事实）');
  const res8 = stubBase(W8, HOURS2, 'v2161b8');
  let r8 = null;
  try { r8 = R8.recover({}); } finally { res8(); }
  a(r8 && r8.ok === true, 'v2161/tp3 B8b: 真结算一次（' + (r8 && r8.reason) + '）');
  a(R8.stat().pageHookBound === true,
    'v2161/tp3 B8c: 真结算之后页面入口已占位（pageHookBound=true）—— 与总线订阅同一处补挂');
  void step;
}

// ── N 负控制：真源码破坏 → 加载破坏副本 → 在副本上重跑同款判据 ────────────
function runNegative(a) {
  const orig = src();
  const SPAN = 30000, HOURS2 = 7200000;
  a(countOcc(orig, ANCHOR_GAP) === 1, 'v2161/tp3 N0 前提: gap 锚点恰中 1 次');
  a(countOcc(orig, ANCHOR_COAL) === 1, 'v2161/tp3 N0b 前提: 合并窗锚点恰中 1 次');
  a(countOcc(orig, ANCHOR_VIS) === 1, 'v2161/tp3 N0c 前提: visibilitychange 锚点恰中 1 次');

  // N1 把 gap 拨回决策时间（缺陷复现）
  const b1 = orig.replace(ANCHOR_GAP, '    const gapMs = now - base.at;');
  a(b1 !== orig, 'v2161/tp3 N1a: 破坏副本已生成（内存态，真源码不动）');
  const W1 = fresh((function () { const o = {}; o[REL] = b1; return o; })());
  on(W1);
  const res1 = stubBase(W1, SPAN, 'v2161n1');
  let n1 = null;
  try {
    W1.clock.freeze(W1.clock.wallNow() + HOURS2);
    n1 = W1.offlineReturn.recover({});
  } finally { try { W1.clock.unfreeze(); } catch (e) {} res1(); }
  //   容差 ±3ms：冻结点与基准各自现读一次 wallNow()。
  a(n1 && n1.ok === true && Math.abs(n1.gapMs - (HOURS2 + SPAN)) <= 3,
    'v2161/tp3 N1b: 拨回决策时间后，冻住的时钟被读成「你真离开了那么久」（gapMs ' + (n1 && n1.gapMs)
      + ' / reason ' + (n1 && n1.reason) + '）—— 而读数与真离开同形');

  // N1 对照：原版上同款判据为真
  const W1o = fresh(); on(W1o);
  const res1o = stubBase(W1o, SPAN, 'v2161n1o');
  let n1o = null;
  try {
    W1o.clock.freeze(W1o.clock.wallNow() + HOURS2);
    n1o = W1o.offlineReturn.recover({});
  } finally { try { W1o.clock.unfreeze(); } catch (e) {} res1o(); }
  a(n1o && n1o.reason === 'too-short' && Math.abs(n1o.gapMs - SPAN) <= 3,
    'v2161/tp3 N1c: 同款判据在原版上为真（冻结场景拒收 too-short）—— 破坏确实改变了行为，不是判据本来就绿');

  // N2 拆掉合并窗
  const b2 = orig.replace(ANCHOR_COAL, '    if (false) {');
  a(b2 !== orig, 'v2161/tp3 N2a: 破坏副本已生成');
  const W2 = fresh((function () { const o = {}; o[REL] = b2; return o; })());
  on(W2);
  const res2 = stubBase(W2, SPAN, 'v2161n2');
  let q1 = null, q2 = null;
  try {
    q1 = W2.offlineReturn.recover({ trigger: 'page-visibility' });
    q2 = W2.offlineReturn.recover({ trigger: 'page-pageshow' });
  } finally { res2(); }
  a(q1 && q1.reason === 'too-short' && q2 && q2.reason !== 'coalesced',
    'v2161/tp3 N2b: 拆掉合并窗后，同一次回来的第二拍**照跑**（实 ' + (q2 && q2.reason) + '）—— 后台节流恢复时连发三拍就推三轮');

  // N3 改掉事件名
  const b3 = orig.replace(ANCHOR_VIS, "      win.addEventListener('visibilitychangX', function () {");
  a(b3 !== orig, 'v2161/tp3 N3a: 破坏副本已生成');
  a(countOcc(b3, ANCHOR_VIS) === 0 && countOcc(orig, ANCHOR_VIS) === 1,
    'v2161/tp3 N3b: 改掉事件名后，监听面判据（A1）当场缺失 —— 入口静默不挂而其余判据全绿，这正是本仓最怕的形态');

  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig,
    'v2161/tp3 N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR_GAP, ANCHOR_COAL, ANCHOR_VIS, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('S3-TP3-V2161: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
