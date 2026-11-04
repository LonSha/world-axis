#!/usr/bin/env node
// WorldAxis tests/v11-snapshot-state.js —— 空世界快照三态锁（v2.297.0 · V11 OPV11-1）
//
// 【它治什么】
//   实测（V11 立项第零节）：**空世界 `buildWorldSnapshot()` 返回长度 0**。
//   后果是三个完全不同的处境在读数上完全同形：
//     ① 世界还没开局（no-session）
//     ② 已开局但一个事实都没有（no-facts）
//     ③ 构建链路出了故障（fault）
//   `applyInjections` 里 `if (snap) items.push(...)` 因此整块世界状态不产条目 ——
//   下游（预算裁决 / 覆盖率统计 / 诊断面）只能读到一个空，分不清「我没开局」还是「系统坏了」。
//   这与 OPV7-7 判定的 no-data / fault 同形问题是同一族，只是发生在快照层。
//
// 【判据】
//   S1  空世界（未开局）⇒ 快照**非空**且 state === 'no-session'，且**不编造事实**
//       （不得出现世界时间/背景/人物任何一段的真实内容）。
//   S2  已开局、六段全空 ⇒ state === 'no-facts'，且与 no-session 的产物**必须不同**
//       （否则「去开局」与「去录事实」这两句完全不同的下一步指引会退化成同一句）。
//   S3  已开局且有事实 ⇒ state === 'live'，且产物**保持原样**（外壳逐字不变：
//       这是 v0.1.13b / v2.38.0 已锁死的既有语义，本版不许动它）。
//   S4  六源全关 ⇒ **必须**仍是空串，且 state === 'off'。
//       这是 v0.1.29 已锁死的语义（tests/run.js「全源关闭时世界快照为空串」）：
//       开关生效优先于状态声明 —— 用户明确关掉了，系统不该拿状态声明去绕过他的开关。
//   S5  取数故障 ⇒ state === 'fault'，faults 含坏掉的那一段名；且**不得**降级成 'no-facts'
//       （把故障读成真空，正是本项要治的病）。
//   S6  `snapshotState()` 与 `buildWorldSnapshot()` **同源同刻**：前者报的 state 必须与
//       后者产物里的 `state="..."` 属性逐字一致（两处不一致就是在制造第二个真源）。
//   S7  注入链联动：空世界一轮 `applyInjections({injections:[]})` 之后，世界状态**至少有 1 条**
//       条目（旧实现在这里 items=0 —— 「世界状态块」整块缺席）。
//   S8  纯只读：调 `buildWorldSnapshot()` / `snapshotState()` 前后 `store` 深比较相等、
//       `meta.writeSeq` 不变（诊断面不许顺手改世界）。
//
// 【判据纯度与两向自证】
//   全部判据以**运行时真实调用**为口径（无桩、真装载、真 store），不 parse 源码猜行为。
//   负控制以「真源码破坏 → 装上破坏副本 → 重跑**同款**判据」自证，且破坏锚点必须恰中 1 次。
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const SNAP_SOURCES = ['clock', 'pulse', 'background', 'people', 'currents', 'echoes'];
function freshEnv(opts) {
  const env = opts ? sync.fresh(opts) : sync.fresh();
  // ── 存储环境复位（V11 OPV11-1 自纠 第二处）────────────────────────────
  // 实测：`sync.fresh()` 只重装产品模块，**不重置 localStorage**（tests/mock.js 的
  //   store 是进程级单例）。于是上一用例 `store.transact` 写下的 echoes / worldPulse /
  //   clock 会被下一个 `store.init()` 从盘上读回来 —— S2 的「已开局无事实」现场永远
  //   被上一轮的 facts 污染成 live，一条链只走得出一个态。
  //   口径：**先清存储、再 init**（与 core/store.js 注释里「LS.clear()+init()」的复位
  //   写法一致）。这不是掩盖问题，正相反：本锁要证的正是「同一个 store、不同事实」
  //   下的三态可分，故每个用例必须从同一份出厂存档起步。
  try { global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  // ── 可见性环境复位 ────────────────────────────────────────────────────
  // 实测：可见性落盘键 `worldaxis_inject_visibility_v1` 同样是进程级共享的 —— 上一用例
  //   把源全关掉之后，下一个 `fresh()` 读到的仍是「全关」，S2/S5/S6 全读到 'off'。
  //   每用例先恢复**出厂缺省**（clock/pulse/background/people/currents 为 true、
  //   echoes 为 false，与 v2.38.0 起的 DEF 一致），再各自构造现场。
  //   不这么做，本锁就会变成「跑单条时绿、连跑时红」的假绿/假红 —— 正是 V11 要治的病。
  SNAP_SOURCES.forEach(function (k) { env.WA.render.setVisibility(k, k !== 'echoes'); });
  return env.WA;
}
function snapText(WA) { try { return String(WA.render.buildWorldSnapshot() || ''); } catch (e) { return '<<THROW:' + e.message + '>>'; } }
function stateAttr(txt) {
  const m = /^<world_axis_state([^>]*)>/.exec(txt);
  if (!m) return null;
  const s = /state="([^"]*)"/.exec(m[1]);
  return s ? s[1] : null;
}
/** 开局：把 clock 设成已开局态（这是全仓唯一的「开局过」判据：clock.source !== 'unset' 且 label 非空） */
function startWorld(WA) {
  WA.store.transact(function (d) { d.clock = { iso: '2026-01-01T00:00:00Z', label: '第1日', dayIndex: 1, source: 'seed' }; });
}
/** 已开局 + 真事实 */
function seedFacts(WA) {
  WA.store.transact(function (d) {
    d.clock = { iso: '2026-01-01T00:00:00Z', label: '第1日·入夜', dayIndex: 1, source: 'seed' };
    d.worldPulse = { pressure: 2, trend: 'rising', note: '风声鹤唳' };
  });
}
function allVis(WA, on) { WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, on); }); }

function runAll(a) {
  // ── S1 空世界：no-session ─────────────────────────────────────────────
  {
    const WA = freshEnv();
    const t = snapText(WA);
    const st = WA.render.snapshotState();
    a(t.length > 0, 'v11snap: [S1a] 空世界快照非空（v10 实现为长度 0；实测 ' + t.length + '）');
    a(st.state === 'no-session', 'v11snap: [S1b] 空世界 state === no-session（实 ' + st.state + '）');
    a(stateAttr(t) === 'no-session', 'v11snap: [S1c] 产物自带 state="no-session" 属性（实 ' + stateAttr(t) + '）');
    a(t.indexOf('尚未开局') >= 0, 'v11snap: [S1d] 产物明确声明「尚未开局」（零编造）');
    a(t.indexOf('【世界时间】') < 0 && t.indexOf('【世界背景】') < 0 && t.indexOf('【人物此刻】') < 0,
      'v11snap: [S1e] 空世界不得编造任何事实段（无世界时间/背景/人物）');
    a(t.indexOf('呈现铁律') < 0, 'v11snap: [S1f] 未开局不追加呈现铁律（这一轮没有任何内容可呈现）');
  }
  // ── S2 已开局但无事实：no-facts，且与 no-session 产物不同 ──────────────
  {
    const WA = freshEnv();
    const t0 = snapText(WA);
    startWorld(WA);
    const t1 = snapText(WA);
    const st = WA.render.snapshotState();
    a(st.state === 'no-facts', 'v11snap: [S2a] 已开局无事实 state === no-facts（实 ' + st.state + '）');
    a(t1 !== t0, 'v11snap: [S2b] no-facts 产物与 no-session **不同**（下一步动作不同，不许同形）');
    a(t1.indexOf('已开局') >= 0 && t1.indexOf('没有任何世界内容') >= 0, 'v11snap: [S2c] 产物说清「已开局但无世界内容」（实 ' + JSON.stringify(t1.slice(0, 120)) + '）');
    a(t1.indexOf('呈现铁律') >= 0, 'v11snap: [S2d] no-facts 追加呈现铁律（有状态声明，需约束呈现口径）');
  }
  // ── S3 已开局且有事实：live，产物保持既有语义 ────────────────────────
  {
    const WA = freshEnv();
    seedFacts(WA);
    const t = snapText(WA);
    const st = WA.render.snapshotState();
    a(st === undefined ? false : st.state === 'live', 'v11snap: [S3a] 有事实 state === live（实 ' + st.state + '）');
    a(t.indexOf('<world_axis_state>') === 0, 'v11snap: [S3b] live 产物外壳逐字不变（不许给 live 加 state 属性）');
    a(t.indexOf('【世界时间】第1日·入夜') >= 0, 'v11snap: [S3c] live 仍产出世界时间');
    a(t.indexOf('【世界脉搏】') >= 0, 'v11snap: [S3d] live 仍产出世界脉搏');
    a(t.indexOf('呈现铁律') >= 0 && t.indexOf('系统旁白') >= 0, 'v11snap: [S3e] live 仍带呈现铁律（既有语义不动）');
    a(t.indexOf('world_axis_state') >= 0, 'v11snap: [S3f] 外壳标签保持');
  }
  // ── S4 六源全关：必须仍是空串 + state === 'off' ───────────────────────
  {
    const WA = freshEnv();
    startWorld(WA);
    allVis(WA, false);
    const t = snapText(WA);
    const st = WA.render.snapshotState();
    a(t === '', 'v11snap: [S4a] 六源全关必须仍返回空串（开关生效优先于状态声明；实测 ' + JSON.stringify(t.slice(0, 80)) + '）');
    a(st.state === 'off', 'v11snap: [S4b] 全关时 state === off（实 ' + st.state + '）');
  }
  // ── S5 取数故障：fault，且不降级成 no-facts ──────────────────────────
  {
    const WA = freshEnv();
    startWorld(WA);
    const realGet = WA.store.get;
    WA.store.get = function () {
      const s = realGet.apply(this, arguments);
      try {
        Object.defineProperty(s, 'worldPulse', { configurable: true, enumerable: true, get: function () { throw new Error('boom-pulse'); } });
      } catch (e) {}
      return s;
    };
    const t = snapText(WA);
    WA.store.get = realGet;
    const st = WA.render.snapshotState();
    a(st.state === 'fault', 'v11snap: [S5a] 取数故障 state === fault（实 ' + st.state + '；把故障读成 no-facts 就是本项要治的病）');
    a(st.faults.indexOf('pulse') >= 0, 'v11snap: [S5b] faults 含坏掉的段名 pulse（实 ' + JSON.stringify(st.faults) + '）');
    a(t.indexOf('故障') >= 0, 'v11snap: [S5c] 产物明确报「故障」，不伪装成真空');
    a(stateAttr(t) === 'fault', 'v11snap: [S5d] 产物 state 属性跟 fault 一致（实 ' + stateAttr(t) + '）');
    a(t.indexOf('呈现铁律') < 0, 'v11snap: [S5e] fault 态不追加呈现铁律（没有内容可呈现）');
  }
  // ── S6 snapshotState 与产物同源同刻 ─────────────────────────────────
  {
    const WA = freshEnv();
    const states = [];
    const seq = [function () { /* 空世界 */ }, function () { startWorld(WA); }, function () { seedFacts(WA); }, function () { allVis(WA, false); }];
    seq.forEach(function (f) {
      f();
      const t = snapText(WA);
      const st = WA.render.snapshotState();
      states.push({ api: st.state, attr: t === '' ? 'off' : stateAttr(t) });
    });
    const bad = states.filter(function (x) { return x.attr !== null && x.api !== x.attr; });
    a(bad.length === 0, 'v11snap: [S6a] snapshotState().state 与产物 state 属性逐字一致（不一致: ' + JSON.stringify(bad) + '）');
    a(states[0].api === 'no-session' && states[1].api === 'no-facts' && states[2].api === 'live' && states[3].api === 'off',
      'v11snap: [S6b] 五态在同一条链上逐态可达（实 ' + states.map(function (x) { return x.api; }).join('→') + '）');
    a(WA.render.snapshotState().keys.join(',') === 'live,no-facts,no-session,fault,off',
      'v11snap: [S6c] 状态枚举是封闭集且可自描述（实 ' + WA.render.snapshotState().keys.join(',') + '）');
  }
  // ── S7 注入链联动：空世界一轮注入后世界状态至少 1 条 ───────────────────
  {
    const WA = freshEnv();
    global.__lastExtensionPrompt = null;
    WA.render.applyInjections({ injections: [] });
    const li = WA.store.get().lastInjection || {};
    const hostTxt = String((global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '');
    a(hostTxt.indexOf('world_axis_state') >= 0,
      'v11snap: [S7a] 空世界注入后宿主槽位真含世界状态块（v10 实现主路径 items=0、快照整块缺席）');
    a(hostTxt.indexOf('no-session') >= 0, 'v11snap: [S7b] 槽位里的状态块带 no-session 标记');
    a(typeof li.len === 'number' && li.len > 0, 'v11snap: [S7c] lastInjection.len 反映真实注入长度（实 ' + li.len + '）');
  }
  // ── S7b 打点联动：本轮快照状态随 lastInjection 落盘（只读口必须有真消费点）──
  //   为什么单列一条：`snapshotState()` 若只有测试引用，就是「记了没人看」的第二个死面
  //   （dead-export-gate 会当场抓到）。真消费点在注入主路径：applyInjections 把本轮
  //   状态随打点写进 lastInjection.snapState。诊断面据此回答「这一轮世界状态块为什么
  //   是 no-facts/fault 而不是 live」，而不必去读快照字符串猜（V11 命题）。
  {
    const WA = freshEnv();
    startWorld(WA);
    global.__lastExtensionPrompt = null;
    WA.render.applyInjections({ injections: [] });
    const li = WA.store.get().lastInjection || {};
    a(!!li.snapState && li.snapState.state === 'no-facts',
      'v11snap: [S7d] lastInjection.snapState 记录本轮快照状态（实 ' + JSON.stringify(li.snapState) + '）');
    a(Array.isArray(li.snapState && li.snapState.faults) && li.snapState.faults.length === 0,
      'v11snap: [S7e] 打点里的 faults 是数组且本轮为空（如实反映现场）');
    const WA2 = freshEnv();
    seedFacts(WA2);
    global.__lastExtensionPrompt = null;
    WA2.render.applyInjections({ injections: [] });
    const li2 = WA2.store.get().lastInjection || {};
    a(li2.snapState && li2.snapState.state === 'live',
      'v11snap: [S7f] 有事实时打点记 live（实 ' + JSON.stringify(li2.snapState) + '）——读数随事实变化，不是恒真');
  }
  // ── S8 纯只读 ────────────────────────────────────────────────────────
  {
    const WA = freshEnv();
    seedFacts(WA);
    const before = JSON.stringify(WA.store.get());
    const wsBefore = WA.store.get().meta ? WA.store.get().meta.writeSeq : undefined;
    snapText(WA); WA.render.snapshotState(); snapText(WA); WA.render.snapshotState();
    const after = JSON.stringify(WA.store.get());
    const wsAfter = WA.store.get().meta ? WA.store.get().meta.writeSeq : undefined;
    a(before === after, 'v11snap: [S8a] 构建快照与读状态口不改存档（深比较相等）');
    a(wsBefore === wsAfter, 'v11snap: [S8b] 不推进 meta.writeSeq（' + wsBefore + '→' + wsAfter + '）');
  }
}
/** 负控制：真源码破坏 → 装上破坏副本 → 重跑同款判据 */
function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
  // N1：把「已开局三态判定」整段退化成 v10 的真实形态（一律走空串路径）
  //     锚点选 hasContent 判定那一行：把它改成恒真 ⇒ 已开局必然 live，no-facts 不可达。
  {
    const anchor = "const hasContent = parts.some(function (p) {";
    const n = src.split(anchor).length - 1;
    a(n === 1, 'v11snap: [N1a] 内容判定锚点在真源码中恰中 1 次（实 ' + n + '）');
    const broken = src.replace(anchor, "const hasContent = true || parts.some(function (p) {");
    a(broken !== src, 'v11snap: [N1b] 破坏确实发生');
    const env = sync.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken } });
    const WA = env.WA; WA.store.init();
    startWorld(WA);
    const st = WA.render.snapshotState();
    const t = snapText(WA);
    a(st.state !== 'no-facts', 'v11snap: [N1c] 破坏后「已开局无内容」不再被判成 no-facts（实 ' + st.state + '）');
    a(t.indexOf('没有任何世界内容') < 0, 'v11snap: [N1d] 破坏后产物里没有「没有任何世界内容」声明');
  }
  // N2：把「全源关 ⇒ 空串」这条既有语义打破（改成照样出声）⇒ S4 必须现形
  {
    const anchor = "if (!visOn.length) { this.__lastSnapState = 'off'; this.__lastSnapFaults = []; return ''; }";
    const n = src.split(anchor).length - 1;
    a(n === 1, 'v11snap: [N2a] 全关短路锚点在真源码中恰中 1 次（实 ' + n + '）');
    const broken = src.replace(anchor, "if (false) { }");
    const env = sync.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken } });
    const WA = env.WA; WA.store.init();
    startWorld(WA);
    allVis(WA, false);
    const t = snapText(WA);
    a(t !== '', 'v11snap: [N2b] 破坏后全关仍出声 ⇒ S4a 那条语义确实由真源码保证（否则它只是注释）');
  }
  // N3：把 fault 降级成 no-facts（把故障读成真空）⇒ S5 必须现形
  {
    const anchor = "const st = faults.length ? 'fault'\n          : (hasContent ? 'live' : ((clockLine || clockSet) ? 'no-facts' : 'no-session'));";
    const n = src.split(anchor).length - 1;
    a(n === 1, 'v11snap: [N3a] fault 判定锚点在真源码中恰中 1 次（实 ' + n + '）');
    const broken = src.replace(anchor, "const st = hasContent ? 'live' : ((clockLine || clockSet) ? 'no-facts' : 'no-session');");
    const env = sync.fresh({ files: ['render/inject.js'], srcOverride: { 'render/inject.js': broken } });
    const WA = env.WA; WA.store.init();
    startWorld(WA);
    const realGet = WA.store.get;
    WA.store.get = function () {
      const s = realGet.apply(this, arguments);
      try { Object.defineProperty(s, 'worldPulse', { configurable: true, enumerable: true, get: function () { throw new Error('boom'); } }); } catch (e) {}
      return s;
    };
    snapText(WA);
    WA.store.get = realGet;
    const st = WA.render.snapshotState();
    a(st.state !== 'fault', 'v11snap: [N3b] 破坏后 fault 不再被识别 ⇒ 证明 S5a 不是恒真判据（实 ' + st.state + '）');
  }
  // N4：原版上同款判据仍成立（双向自证）
  {
    const WA = freshEnv();
    const t = snapText(WA);
    a(t.length > 0 && WA.render.snapshotState().state === 'no-session', 'v11snap: [N4] 原版上同款判据仍成立（不是把判据写死）');
  }
}
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); }
  };
  runAll(a);
  runNegative(a);
  if (fail) { console.log('V11-SNAPSHOT-STATE: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('V11-SNAPSHOT-STATE: pass（' + pass + ' 项）');
  assert.ok(true);
}
module.exports = { runAll: runAll, runNegative: runNegative, snapText: snapText, stateAttr: stateAttr };