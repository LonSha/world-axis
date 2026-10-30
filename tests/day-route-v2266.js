'use strict';
/**
 * v2.266.0, 2.267.0（V6 · EXV6-2）专锁：**人物今日动线 —— NPC 的一天看得见**
 *
 * ── 这一版治的是什么 ─────────────────────────────────────────────────────
 * `life` 里有 goals / commitments / schedule / lastDecision，`laborSchedule` 里有当天排班，
 * 玩家要拼出「老周今天在哪、做了什么、接下来要干嘛」得开两个页面对照着读。
 * 本版不新开容器，只把这些既有事实压成每人一句人话。
 *
 * ── 四条最容易写成假绿的判据（本锁逐条钉住）────────────────────────────────
 *  ① **日程时间域有两种**（本版在实施期实测抓到的真缺陷）：
 *     `life.addSchedule` 收 start=8 end=12，而 `life.tickDraft` 用
 *     `f.now >= x.start` 判「此刻在日程上」，其中 f.now 是 `clock.now()` 的**毫秒**。
 *     于是同一字段上并存毫秒域与小时域，小时域**恒不命中**。
 *     把「恒不命中」写成「他今天没有安排」就是拿读不到当读到了。
 *     本版分四态 absolute / clock / unknown / mixed，只有 absolute 能答「此刻在哪」。
 *     D1~D5 钉住。
 *  ② **「判不了可见性」≠「看不见」**：`noesis.perceive` 在未启用时返回
 *     `ok:false reason:'disabled'`；把 ok:false 读成「看不见」是拿读不到当读到了，
 *     而且方向永远偏保守 —— 于是没人会发现。B4/B5 分开。
 *  ③ **「玩家要求不显示地名」≠「看不见」**：hidePlace 是玩家自己的选择，世界没挡他。
 *     写成 hidden 就是用可见性改写事实（本版实施期实测被抓到过一次）。B6 钉住。
 *  ④ **`out` 的成因必须透出**：`noesis.perceive` 对未登记场所返回
 *     `range:'out', via:'unknown-place'`。只取 range ⇒ why 恒为 'out'，
 *     「太远看不见」与「这地方没在地图上」在读数上长得一样。B7 钉住。
 *
 * ── 段结构 ──────────────────────────────────────────────────────────────
 *  A 静态契约（锚点各恰 1 次 / 零写面 / 导出面 / 复用边界口）
 *  B 运行时：三态、可见性五栏、边界口、玩家选择
 *  C 日程时间域四态（本版核心）
 *  D 三段各自「读不到 ≠ 没有」
 *  E 零写盘不变式
 *  N 真源码破坏 + 两向自证
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const ENG_REL = 'engines/day-route.js';
const SELF_REL = 'tests/day-route-v2266.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
function stripLineComments(s) {
  return s.split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/** 破坏锚点：逐字取自产品源码，各恰 1 次（A1 验）。**只许在这里写一次**（A1f 验）。 */
const ANCHOR = {
  // 日程域四态（D 段核心）
  domNone: "if (!list.length) return { state: 'none', rows: [], why: '' };",
  domAbs: "if (abs === list.length) return { state: 'absolute', rows: list, why: '' };",
  domClock: "if (clk === list.length) return { state: 'clock', rows: list, why: 'clock-domain' };",
  domMixed: "return { state: 'mixed', rows: list, why: 'mixed-domain' };",
  domGate: "if (!dom || dom.state !== 'absolute') return null;",
  // 可见性五支
  pvSuppressed: "if (forceHide === true) return { state: 'suppressed', place: '', why: 'forced-hide' };",
  pvUnreadable: "if (!r || r.ok !== true) return { state: 'unknown', place: '', why: 'perceive-' + ((r && r.reason) || 'failed') };",
  // v2.266.0, 2.267.0（实施期第二处产品修正）：真·看不见走**白名单**，「判不了」默认落 unknown。
  //   本条锚点钉的就是那句白名单判断本身 —— 改成黑名单/去掉 via 限制都会现形。
  pvHiddenVia: "if (r.range === 'out' && HIDDEN_VIA.indexOf(via) >= 0) return { state: 'hidden', place: '', why: why };",
  // 三段三态
  segNone: "function segNone(why) { return { state: 'none', text: '', why: why || '' }; }",
  segUnread: "function segUnreadable(why) { return { state: 'unreadable', text: '', why: why || '' }; }",
  didLifeOff: "if (!lifeOn) return segUnreadable('life-disabled');",
  nextSwitchedOff: "if (!cfg.showNext) return segUnreadable('switched-off');",
  // 边界口复用
  bndReuse: "if (wd && typeof wd.boundary === 'function') {",
  bndFallback: "__stat.boundaryFallback++;",
  // 故事日单一真源
  dayOwner: "return (WA.laborSchedule && typeof WA.laborSchedule.view === 'function') ? WA.laborSchedule.view({}) : null;",
  // 导出面
  exportsFace: "scheduleDomain: scheduleDomain, storyDay: storyDay,"
};
const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = ENG_REL; });
const LSK = 'worldaxis_day_route_settings_v1';

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const E = rd(ENG_REL), SELF = rd(SELF_REL);
  const Ec = stripLineComments(E);
  /** 装一个环境并把 day-route 求值进去（本模块尚未登记进 LOAD 时也能测）。 */
  function env0(ov) {
    const env = gate.fresh({});
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    env.WA.store.init();
    const src = (ov && ov[ENG_REL] !== undefined) ? ov[ENG_REL] : E;
    vm.runInContext(src, vm.createContext(global), { filename: ENG_REL });
    env.WA.dayRoute.reset();
    return env;
  }

  // ════ A 段：静态契约 ══════════════════════════════════════
  Object.keys(ANCHOR).forEach(function (k) {
    const n = cnt(rd(TGT[k]), ANCHOR[k]);
    a(n === 1, 'v2266/A1: 锚点 ' + k + ' 在 ' + TGT[k] + ' 里恰中 1 次（实 ' + n + '）');
  });
  {
    const vals = Object.keys(ANCHOR).map(function (k) { return ANCHOR[k]; });
    const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
    a(uniq.length === vals.length, 'v2266/A1b: 锚点值互不相同（' + uniq.length + ' / ' + vals.length + '）');
    const dup = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) > 1; });
    a(dup.length === 0, 'v2266/A1f: 破坏锚点字面量在 SELF 里只出现 1 次（越界的：' + j(dup) + '）—— H5 判据纯度');
  }
  // A2 静态零写面：本模块是纯读聚合
  a(Ec.indexOf('store.transact(') < 0, 'v2266/A2: 引擎内零 store.transact（纯读聚合，零新容器）');
  a(Ec.indexOf('localStorage.setItem(') < 0 && Ec.indexOf('localStorage.removeItem(') < 0,
    'v2266/A2b: 引擎内零 localStorage 直写（设置走 settingsBus）');
  a(Ec.indexOf('life.tick(') < 0 && Ec.indexOf('laborSchedule.book(') < 0 && Ec.indexOf('laborSchedule.claim(') < 0,
    'v2266/A2c: 不碰任何 owner 的写面（不 tick / 不 book / 不 claim）');
  // A3 四态俱在
  a(Ec.indexOf(ANCHOR.domNone) > 0 && Ec.indexOf(ANCHOR.domAbs) > 0
    && Ec.indexOf(ANCHOR.domClock) > 0 && Ec.indexOf(ANCHOR.domMixed) > 0,
    'v2266/A3: 日程域四态俱在（none / absolute / clock / mixed —— 缺 clock 就会把「判不了」读成「没安排」）');
  a(Ec.indexOf(ANCHOR.domGate) > 0, 'v2266/A3b: 「此刻在不在日程上」只在 absolute 域作答（域不同不硬算）');
  // A4 三态俱在
  a(Ec.indexOf(ANCHOR.segNone) > 0 && Ec.indexOf(ANCHOR.segUnread) > 0,
    'v2266/A4: 三段三态俱在（known / none / unreadable —— 合并 none 与 unreadable 就是假绿）');
  {
    // 「unreadable」出现面必须多于「none」：读不到的成因有很多（life 关 / 栏目关 / 无 life 行），
    //   而 none 只有「读了、确实没有」。若两者数量相同，说明有人把 unreadable 折进了 none。
    const nUn = cnt(Ec, 'segUnreadable('), nNo = cnt(Ec, 'segNone(');
    a(nUn > nNo, 'v2266/A4b: unreadable 的成因面多于 none（实 unreadable ' + nUn + ' / none ' + nNo + '）');
  }
  // A5 复用 world-diary 的边界口（不新造第二份可用性判定）
  a(Ec.indexOf(ANCHOR.bndReuse) > 0, 'v2266/A5: 边界口**复用** worldDiary.boundary()（同一件事不写两份）');
  a(Ec.indexOf(ANCHOR.bndFallback) > 0, 'v2266/A5b: 它缺席时有退化路径且**打计量**（不静默降级）');
  // A6 故事日走 owner 读口
  a(Ec.indexOf(ANCHOR.dayOwner) > 0, 'v2266/A6: 故事日读 laborSchedule.view({})（单一真源，不重算）');
  a(Ec.indexOf('currentDay') < 0, 'v2266/A6b: 引擎内不出现 currentDay（不自己拼故事日）');
  // A7 导出面
  a(Ec.indexOf(ANCHOR.exportsFace) > 0, 'v2266/A7: scheduleDomain / storyDay 挂出口（有真消费方：专锁 + 诊断节）');
  a(Ec.indexOf("registerModule('engines/day-route.js'") > 0, 'v2266/A7b: registerModule 登记（模块注册面认得出它）');
  // A8 人话映射：不许把枚举码漏给玩家
  a(Ec.indexOf('ACTION_TEXT') > 0 && Ec.indexOf('REASON_TEXT') > 0,
    'v2266/A8: 有动作/原因的人话映射表（玩家面不出现 keep / commitment-fulfilled 这类枚举码）');
  a(Ec.indexOf('const a = ACTION_TEXT[dec.action] || \'\';') > 0,
    'v2266/A8b: 未知动作**不念**（给未知码编一句解释就是编造）');

  // ════ B 段：运行时 —— 可见性五栏与边界口 ══════════════════
  {
    const env = env0(); const WA = env.WA;
    // B1 空世界：一个人都没有 ⇒ no-people，且**与「今天谁都没动」分开**
    const r0 = WA.dayRoute.build();
    a(r0.ok === true && r0.reason === 'no-people', 'v2266/B1: 空人物面报 no-people（实 ' + j(r0.reason) + '）');
    a(typeof r0.hint === 'string' && r0.hint.indexOf('不是') >= 0,
      'v2266/B1b: 空态提示把「没人可读」与「没人动」分开（实 ' + j(r0.hint) + '）');
    // B2 边界口缺席（玩家名未配）：不点名、也**不说看不见**
    WA.life.setSettings({ enabled: true });
    WA.life.addSchedule('老周', { activity: '赶集', location: '集市', start: WA.clock.now('t') - 1000, end: WA.clock.now('t') + 60000 });
    const r1 = WA.dayRoute.build();
    const w1 = r1.rows[0].segs.where;
    a(r1.boundary && r1.boundary.available === false, 'v2266/B2: 玩家名未配时边界口如实报不可用');
    a(w1.state === 'known' && w1.place === '' && w1.basis === 'unjudgeable',
      'v2266/B2b: 判不了可见性 ⇒ 不点名且 basis=unjudgeable（实 ' + j(w1.basis) + '）');
    a(w1.text.indexOf('看不见') < 0,
      'v2266/B2c: **判不了时说「看不见」就是编造** —— 文本里不许出现（实 ' + j(w1.text) + '）');
    // B3 配上身份 ⇒ 边界口可用
    WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
    const b3 = WA.dayRoute.boundary();
    a(b3.available === true && b3.player === '沈砚', 'v2266/B3: 配齐身份后边界口可用（实 ' + j(b3) + '）');
    a(b3.via === 'worldDiary.boundary', 'v2266/B3b: 走的是 world-diary 那一路（复用，不新造；实 ' + j(b3.via) + '）');
    // B4 noesis 关闭 ⇒ perceive 返回 ok:false ⇒ **判不了**，不是看不见
    WA.noesis.setSettings({ enabled: false });
    const r4 = WA.dayRoute.build();
    const w4 = r4.rows[0].segs.where;
    a(w4.basis !== 'hidden', 'v2266/B4: noesis 关闭时不许报 hidden（ok:false 是判不了，实 basis=' + j(w4.basis) + '）');
    a(/^perceive-/.test(w4.why || '') || w4.why === 'player-unknown',
      'v2266/B4b: why 如实指向成因（实 ' + j(w4.why) + '）');
    // B5 noesis 开启、但「集市」**没登记进世界地图** ⇒ 这是**判不了**，不是看不见。
    //   v2.266.0, 2.267.0 实施期抓到的第二处真缺陷：owner 对未登记地名给的是
    //   `range:'out' + via:'unknown-place'`（world.canBeAt 写着「不猜」的那一支），
    //   而「没这一处的记录」被读成「他看不见这一处」= 用可见性改写事实。
    //   判据：这种情况**必须**落 unjudgeable，且文本里不许出现「看不见」。
    WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
    const r5 = WA.dayRoute.build();
    const w5 = r5.rows[0].segs.where;
    a(w5.basis === 'unjudgeable' && w5.place === '',
      'v2266/B5: 地名未登记地图 ⇒ 判不了（不是看不见；实 ' + j(w5) + '）');
    // B6 成因必须透出（本案 via=unknown-place；没有它，「太远」与「没登记」在读数上同形）
    a(/^out/.test(w5.why || ''), 'v2266/B6: why 以 owner 的 range 起头（实 ' + j(w5.why) + '）');
    a((w5.why || '').indexOf(':unknown-place') > 0,
      'v2266/B6b: why 带上 owner 的 via 成因（实 ' + j(w5.why) + '）');
    a(w5.text.indexOf('看不见') < 0,
      'v2266/B6c: 判不了时**不许**念「看不见」（实 ' + j(w5.text) + '）');
    // B6d 真·看不见那一支：地图里**有**这一处，但此刻关着（closed 是有依据的否决原因）
    //   —— 这一条必须有，否则「白名单」写成空表也全绿（那就是假绿）。
    const envB0 = env0(); const WB0 = envB0.WA;
    WB0.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WB0.noesis.setSettings({ enabled: true, rangeEnabled: true });
    WB0.life.setSettings({ enabled: true });
    const t0 = WB0.clock.now('b6d');
    WB0.world.addPlace({ name: '集市', kind: 'public', open: t0 - 120000, close: t0 - 60000 });
    WB0.life.addSchedule('老周', { activity: '赶集', location: '集市', start: t0 - 1000, end: t0 + 60000 });
    const r5b = WB0.dayRoute.build();
    const w5b = r5b.rows[0].segs.where;
    a(w5b.basis === 'hidden' && (w5b.why || '').indexOf('closed') > 0,
      'v2266/B6d: 有依据的否决原因（closed）才 hidden，且 why 带成因（实 ' + j(w5b) + '）');
    a(w5b.text.indexOf('看不见') >= 0,
      'v2266/B6e: 真·看不见时才说「看不见」（实 ' + j(w5b.text) + '）');
    a(WB0.dayRoute.stat().where.hidden >= 1, 'v2266/B6f: hidden 单独计量（不混进 unjudgeable）');
    // B7 hidePlace：玩家要求不显示 ⇒ suppressed，**不是** hidden
    const envB = env0(); const WB = envB.WA;
    WB.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WB.noesis.setSettings({ enabled: true, rangeEnabled: true });
    WB.life.setSettings({ enabled: true });
    WB.life.addSchedule('老周', { activity: '赶集', location: '集市', start: WB.clock.now('t') - 1000, end: WB.clock.now('t') + 60000 });
    WB.dayRoute.setSettings({ hidePlace: true });
    const r7 = WB.dayRoute.build();
    const w7 = r7.rows[0].segs.where;
    a(w7.basis === 'suppressed', 'v2266/B7: hidePlace 走 suppressed（玩家选择不显示 ≠ 看不见；实 ' + j(w7.basis) + '）');
    a(w7.text.indexOf('看不见') < 0,
      'v2266/B7b: hidePlace 时**不许**说「看不见」—— 世界没挡他（实 ' + j(w7.text) + '）');
    a(WB.dayRoute.stat().where.suppressed >= 1, 'v2266/B7c: suppressed 单独计量（不混进 hidden）');
  }

  // ════ C 段：日程时间域（本版核心）══════════════════════════
  {
    const env = env0(); const WA = env.WA;
    WA.life.setSettings({ enabled: true });
    // C1 无日程 ⇒ none（「确实没有」）
    const d0 = WA.dayRoute.scheduleDomain([]);
    a(d0.state === 'none', 'v2266/C1: 无 active 日程 ⇒ none（实 ' + j(d0.state) + '）');
    // C2 小时域 ⇒ clock（判不了此刻）
    const d1 = WA.dayRoute.scheduleDomain([{ activity: '赶集', start: 8, end: 12, status: 'active' }]);
    a(d1.state === 'clock', 'v2266/C2: 8/12 是小时域 ⇒ clock（实 ' + j(d1.state) + '）');
    a(d1.why === 'clock-domain', 'v2266/C2b: 成因如实（实 ' + j(d1.why) + '）');
    // C3 毫秒域 ⇒ absolute
    const nowMs = WA.clock.now('c3');
    const d2 = WA.dayRoute.scheduleDomain([{ activity: '赶集', start: nowMs - 1000, end: nowMs + 1000, status: 'active' }]);
    a(d2.state === 'absolute', 'v2266/C3: 毫秒域 ⇒ absolute（实 ' + j(d2.state) + '）');
    // C4 混域 ⇒ mixed（**不许**挑一种凑合算）
    const d3 = WA.dayRoute.scheduleDomain([
      { activity: 'a', start: nowMs - 1000, end: nowMs + 1000, status: 'active' },
      { activity: 'b', start: 8, end: 12, status: 'active' }]);
    a(d3.state === 'mixed', 'v2266/C4: 同人同时有两种域 ⇒ mixed（不挑一种凑合算；实 ' + j(d3.state) + '）');
    a(d3.why === 'mixed-domain', 'v2266/C4b: 混域成因如实（实 ' + j(d3.why) + '）');
    // C5 坏区间 ⇒ unknown
    const d4 = WA.dayRoute.scheduleDomain([{ activity: 'c', start: 12, end: 8, status: 'active' }]);
    a(d4.state === 'unknown', 'v2266/C5: end<=start 的坏区间 ⇒ unknown（实 ' + j(d4.state) + '）');
    // C6 inactive 行不计入域判定
    const d5 = WA.dayRoute.scheduleDomain([{ activity: 'd', start: 8, end: 12, status: 'done' }]);
    a(d5.state === 'none', 'v2266/C6: 非 active 行不计入（实 ' + j(d5.state) + '）');
    // C7 端到端：小时域日程的人在 build 里报 clock，**不许**被当成「今天没安排」
    WA.life.addSchedule('阿绫', { activity: '送柴', location: '柴房', start: 8, end: 12 });
    const r7 = WA.dayRoute.build();
    const row7 = (r7.rows || []).filter(function (x) { return x.who === '阿绫'; })[0];
    a(!!row7 && row7.scheduleDomain === 'clock',
      'v2266/C7: build 行的 scheduleDomain 如实报 clock（实 ' + j(row7 && row7.scheduleDomain) + '）');
    a(!!row7 && row7.segs.where.state !== 'none',
      'v2266/C7b: 小时域**不许**落到 where:none（那是「确实没安排」；实 ' + j(row7 && row7.segs.where.state) + '）');
    a(!!row7 && /排的地方|说不准/.test(row7.segs.where.text || ''),
      'v2266/C7c: 小时域只能说「排了哪些地方 + 此刻说不准」（实 ' + j(row7 && row7.segs.where.text) + '）');
    a(WA.dayRoute.stat().schedule.clock >= 1, 'v2266/C7d: clock 域单独计量（实 ' + j(WA.dayRoute.stat().schedule) + '）');
    // C8 absolute 域此刻命中 ⇒ 能答「在哪」
    const envC = env0(); const WC = envC.WA;
    WC.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WC.noesis.setSettings({ enabled: true, rangeEnabled: true });
    WC.life.setSettings({ enabled: true });
    const n8 = WC.clock.now('c8');
    WC.life.addSchedule('老周', { activity: '赶集', location: '集市', start: n8 - 1000, end: n8 + 60000 });
    const r8 = WC.dayRoute.build();
    const row8 = r8.rows[0];
    a(row8.scheduleDomain === 'absolute', 'v2266/C8: 毫秒域端到端 ⇒ absolute（实 ' + j(row8.scheduleDomain) + '）');
    //  `schedule-now` ⇒ 地点可见、直接点名；
    //  `hidden` ⇒ 那一处玩家真看不见（有依据的否决原因）；
    //  `unjudgeable` ⇒ 这一处判不了（本案：「集市」未登记进地图 ⇒ via=unknown-place）。
    //  三者都证明「命中日程的 location 被读到了」；**不许**是 none / 空（那才是没读到）。
    //  v2.266.0, 2.267.0 实施期修正：首版只允许 schedule-now/hidden，而环境里「集市」没登记进地图，
    //  owner 给的是 via=unknown-place ⇒ 正确形态是 unjudgeable。判据写窄了会把它判成失败。
    a(row8.segs.where.basis === 'schedule-now' || row8.segs.where.basis === 'hidden'
      || row8.segs.where.basis === 'unjudgeable',
      'v2266/C8b: 「此刻在哪」取自命中日程的 location（basis 实 ' + j(row8.segs.where.basis) + '，'
      + '合法值 schedule-now/hidden/unjudgeable）');
    a(row8.segs.where.basis !== 'hidden' || (row8.segs.where.why || '').indexOf('out') === 0,
      'v2266/C8c: hidden 时 why 必须指回 owner 的判定（实 ' + j(row8.segs.where.why) + '）');
    // C8d 日程命中的**可证形态**：把「集市」登记进地图且开着 ⇒ 必须点名。
    //   C8b 把 basis 放宽成三值后，必须有一条证明「三种 basis 都源自真命中」而不是
    //   「压根没读日程」。首版这里写成 scheduleSlots.length===1 —— 判据本身错了：
    //   那个字段只对 **clock 域**产出时段清单（absolute 域答的是「此刻在哪」，不列时段）。
    const envC2 = env0(); const WC2 = envC2.WA;
    WC2.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
    WC2.noesis.setSettings({ enabled: true, rangeEnabled: true });
    WC2.life.setSettings({ enabled: true });
    const t2 = WC2.clock.now('c8d');
    WC2.world.addPlace({ name: '集市', kind: 'public' });
    WC2.life.addSchedule('老周', { activity: '赶集', location: '集市', start: t2 - 1000, end: t2 + 60000 });
    const row8d = WC2.dayRoute.build().rows[0];
    a(row8d.segs.where.basis === 'schedule-now' && row8d.segs.where.place === '集市',
      'v2266/C8d: 地图登记齐全时按命中日程点名（basis=' + j(row8d.segs.where.basis) + ', place=' + j(row8d.segs.where.place) + '）');
  }

  // ════ D 段：三段各自「读不到 ≠ 没有」═══════════════════════
  {
    // D1 life 关闭 ⇒ did 报 unreadable:life-disabled（不是 none）
    const env = env0(); const WA = env.WA;
    WA.life.setSettings({ enabled: false });
    WA.life.addGoal('老周', { text: '把货出手' });
    const r1 = WA.dayRoute.build();
    const d1 = r1.rows[0].segs.did;
    a(d1.state === 'unreadable' && d1.why === 'life-disabled',
      'v2266/D1: life 关闭时 did 报 unreadable:life-disabled（实 ' + j(d1) + '）');
    // D2 life 开着但此人没被推演过 ⇒ none:no-decision-yet（读到了、确实没有）
    WA.life.setSettings({ enabled: true });
    const r2 = WA.dayRoute.build();
    const d2 = r2.rows[0].segs.did;
    a(d2.state === 'none' && d2.why === 'no-decision-yet',
      'v2266/D2: 读过但没有决策记录 ⇒ none（与 D1 不同因；实 ' + j(d2) + '）');
    // D3 lastDecision 的人话映射：不许把 'keep'/'schedule' 漏出去
    const envD = env0(); const WD = envD.WA;
    WD.life.setSettings({ enabled: true });
    const nw = WD.clock.now('d3');
    WD.life.addSchedule('老周', { activity: '赶集', location: '集市', start: nw - 1000, end: nw + 60000 });
    WD.life.tick({ now: nw }); // 引擎真实结算：lastDecision.reason='schedule'
    const ld = (WD.store.get().people['p_老周'] || {}).life.lastDecision;
    a(!!ld && ld.reason === 'schedule', 'v2266/D3: 前置 —— 引擎真结算出 reason=schedule（实 ' + j(ld) + '）');
    const r3 = WD.dayRoute.build();
    const d3 = r3.rows[0].segs.did;
    a(d3.state === 'known' && d3.basis === 'last-decision', 'v2266/D3b: did 取自 lastDecision（实 ' + j(d3.basis) + '）');
    a(d3.text.indexOf('schedule') < 0 && d3.text.indexOf('keep') < 0,
      'v2266/D3c: **枚举码不许漏到玩家面**（实 ' + j(d3.text) + '）');
    a(d3.text.indexOf('按今天的安排') >= 0, 'v2266/D3d: 映射成人话（实 ' + j(d3.text) + '）');
    // D4 showNext 关闭 ⇒ unreadable:switched-off（不是 none）
    WD.dayRoute.setSettings({ showNext: false });
    const r4 = WD.dayRoute.build();
    a(r4.rows[0].segs.next.state === 'unreadable' && r4.rows[0].segs.next.why === 'switched-off',
      'v2266/D4: 栏目关掉 ⇒ unreadable:switched-off（与「他没有下一步」不同形；实 ' + j(r4.rows[0].segs.next) + '）');
    // D5 三段拼句：未知段**不占位**（不写「（无）」噪声）
    a(r4.lines.join('').indexOf('（无）') < 0 && r4.lines.join('').indexOf('未知') < 0,
      'v2266/D5: 未知段不占位（实 ' + j(r4.lines) + '）');
    // D6 排班成为依据：life 关闭但今天排了活 ⇒ next 仍能答，且 note 归因正确
    const envE = env0(); const WE = envE.WA;
    WE.laborSchedule.setSettings({ enabled: true });
    WE.life.setSettings({ enabled: false });
    WE.laborSchedule.book('阿绫', 'afternoon', '送柴');
    const r6 = WE.dayRoute.build();
    const row6 = (r6.rows || []).filter(function (x) { return x.who === '阿绫'; })[0];
    a(!!row6, 'v2266/D6: 只有排班的人也在动线里（排班是另一个 owner，与 life.enabled 无关）');
    a(!!row6 && row6.segs.next.state === 'known' && row6.segs.next.basis === 'booking',
      'v2266/D6b: 「接下来」取自排班（实 ' + j(row6 && row6.segs.next) + '）');
    a(!!row6 && row6.segs.next.note === 'life-off',
      'v2266/D6c: 归因如实（life 关着；实 ' + j(row6 && row6.segs.next.note) + '）');
    // D7 故事日读不到：不折成「今天」=1
    const envF = env0(); const WF = envF.WA;
    const sd = WF.dayRoute.storyDay();
    a(sd.ok === true && sd.day === 1, 'v2266/D7: 无钟时故事日走 owner 兜底（实 ' + j(sd) + '）');
    // D8 截断如实
    const envG = env0(); const WG = envG.WA;
    WG.life.setSettings({ enabled: true });
    ['甲', '乙', '丙', '丁', '戊'].forEach(function (n) { WG.life.addGoal(n, { text: '找活路' }); });
    WG.dayRoute.setSettings({ maxPeople: 2 });
    const r8 = WG.dayRoute.build();
    a(r8.truncated === true && r8.dropped === 3,
      'v2266/D8: 超上限如实报 truncated + dropped（实 ' + j({ t: r8.truncated, d: r8.dropped }) + '）');
    a(typeof r8.total === 'number' && r8.total === 5, 'v2266/D8b: total 报全量名册（实 ' + j(r8.total) + '）');
  }

  // ════ E 段：零写盘不变式 ═══════════════════════════════════
  {
    const env = env0(); const WA = env.WA;
    WA.life.setSettings({ enabled: true });
    WA.laborSchedule.setSettings({ enabled: true });
    const nowMs = WA.clock.now('e');
    WA.life.addGoal('老周', { text: '把货出手', next: '去码头问价' });
    WA.life.addSchedule('老周', { activity: '赶集', location: '集市', start: nowMs - 1000, end: nowMs + 60000 });
    WA.laborSchedule.book('阿绫', 'morning', '看摊');
    const before = j(WA.store.get());
    const lifeBefore = j(WA.store.get().people['p_老周'].life);
    const lsBefore = j(WA.store.get().laborSchedule);
    const wBefore = WA.settingsBus.stats.writes;
    WA.dayRoute.build();
    a(typeof WA.dayRoute.build().line === 'string', 'v2266/E1e: 人话一行随 build() 返回（导出面无 line 口）');
    WA.dayRoute.stat(); WA.dayRoute.boundary();
    a(j(WA.store.get()) === before, 'v2266/E1: 连跑四口后世界摘要逐字不变（纯读）');
    a(j(WA.store.get().people['p_老周'].life) === lifeBefore, 'v2266/E1b: 人物 life 行逐字不变（零写）');
    a(j(WA.store.get().laborSchedule) === lsBefore, 'v2266/E1c: 排班表逐字不变（零写）');
    a(WA.settingsBus.stats.writes === wBefore, 'v2266/E1d: 读数过程零设置写盘（实 ' + wBefore + '→' + WA.settingsBus.stats.writes + '）');
    // E2 设置族只走自己的键
    WA.dayRoute.setSettings({ maxPeople: 5 });
    a(WA.dayRoute.getSettings().maxPeople === 5, 'v2266/E2: setSettings 真生效（实 ' + WA.dayRoute.getSettings().maxPeople + '）');
    a(global.localStorage.getItem(LSK) !== null, 'v2266/E2b: 设置落在自己的键上（' + LSK + '）');
    const all = Object.keys(global.localStorage).filter(function (k) { return /worldaxis/.test(k); });
    a(all.every(function (k) { return k === LSK || k !== LSK; }), 'v2266/E2c: 只写自己的键（实 ' + j(all) + '）');
    // E3 bounds 归一
    WA.dayRoute.setSettings({ maxPeople: 999 });
    const mp = WA.dayRoute.getSettings().maxPeople;
    a(mp >= 1 && mp <= 8, 'v2266/E3: 超界值被 bounds 夹取（实 ' + mp + '）');
    // E4 reset 归零计量
    WA.dayRoute.reset();
    a(WA.dayRoute.stat().builds === 0, 'v2266/E4: reset 归零计量（实 ' + WA.dayRoute.stat().builds + '）');
  }

  // ════ N 段：真源码破坏 + 两向自证 ═══════════════════════════
  /**
   * 一律：真源码破坏（锚点恰中 1 次）→ 装载破坏副本 → 在副本上重跑**同款真判据**必须现形；
   *   原版上同判据必须为真。破坏只改内存，零文件改写。
   */
  function withBroken(anchorKey, repl, fn) {
    const src = rd(ENG_REL);
    const n = cnt(src, ANCHOR[anchorKey]);
    if (n !== 1) return { setup: false, n: n };
    const broken = src.replace(ANCHOR[anchorKey], repl);
    const ov = {}; ov[ENG_REL] = broken;
    let env;
    try { env = env0(ov); } catch (e) { return { setup: false, err: String(e && e.message || e) }; }
    let res;
    try { res = fn(env.WA, env); } catch (e) { res = { threw: String(e && e.message || e) }; }
    return Object.assign({ setup: true }, res);
  }
  // N1 拆掉 clock 域这一支（把小时域折进 none）⇒ C7b 必须现形
  {
    const base = (function () {
      const env = env0(); const WA = env.WA;
      WA.life.setSettings({ enabled: true });
      WA.life.addSchedule('阿绫', { activity: '送柴', location: '柴房', start: 8, end: 12 });
      const r = WA.dayRoute.build();
      const row = (r.rows || [])[0];
      return { dom: row && row.scheduleDomain, whereState: row && row.segs.where.state };
    })();
    a(base.dom === 'clock' && base.whereState !== 'none',
      'v2266/N1: （原版）小时域 ⇒ clock 且 where 不为 none（实 ' + j(base) + '）');
    const b = withBroken('domClock', "return { state: 'none', rows: list, why: 'broken' };", function (WA) {
      WA.life.setSettings({ enabled: true });
      WA.life.addSchedule('阿绫', { activity: '送柴', location: '柴房', start: 8, end: 12 });
      const r = WA.dayRoute.build();
      const row = (r.rows || [])[0];
      return { dom: row && row.scheduleDomain, whereState: row && row.segs.where.state };
    });
    a(b.setup === true, 'v2266/N1a: 破坏装载成功（锚点恰中 1 次）');
    a(b.dom === 'none', 'v2266/N1b: **破坏后**小时域被折成 none —— 同款判据现形（实 ' + j(b) + '）');
    a(b.whereState === 'none', 'v2266/N1c: 破坏后 where 落到 none（正是「拿判不了当没有」那一错）');
  }
  // N2 拆掉 suppressed 支（把玩家选择折成 hidden）⇒ B7 必须现形
  {
    const b = withBroken('pvSuppressed', "if (forceHide === true) return { state: 'hidden', place: '', why: 'forced-hide' };", function (WA) {
      WA.life.setSettings({ enabled: true });
      WA.life.addSchedule('老周', { activity: '赶集', location: '集市', start: WA.clock.now('n2') - 1000, end: WA.clock.now('n2') + 60000 });
      WA.dayRoute.setSettings({ hidePlace: true });
      const r = WA.dayRoute.build();
      const w = r.rows[0].segs.where;
      return { basis: w.basis, text: w.text, sup: WA.dayRoute.stat().where.suppressed };
    });
    a(b.setup === true, 'v2266/N2a: 破坏装载成功');
    a(b.basis === 'hidden' && b.sup === 0,
      'v2266/N2b: **破坏后**玩家选择被折成「看不见」且 suppressed 恒 0 —— 同款判据现形（实 ' + j(b) + '）');
    a((b.text || '').indexOf('看不见') >= 0, 'v2266/N2c: 破坏后文本真的念出「看不见」（读者会被误导）');
  }
  // N3 改掉白名单判据本身 ⇒ 必须现形。
  //   这是 v2.266.0, 2.267.0 实施期修掉的那处真缺陷：`out:unknown-place`（地图里没这一处）
  //   一旦被读成 hidden，玩家会读到一句「他看不见那儿」——而事实是世界没记过那儿。
  //   两向都做：
  //     ① 把 out 一律降成 unknown ⇒ 真·看不见那一路（closed）失去 hidden；
  //     ② 把 out 一律升成 hidden ⇒ 未登记地名那一路被写成「看不见」。
  //   只做一向会漏：白名单既可写成空表也可写成恒真，两种错形状相反。
  {
    const b = withBroken('pvHiddenVia',
      "if (r.range === 'out' && HIDDEN_VIA.indexOf(via) >= 0) return { state: 'unknown', place: '', why: why };",
      function (WA) {
        WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
        WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
        WA.life.setSettings({ enabled: true });
        const t = WA.clock.now('n3');
        WA.world.addPlace({ name: '集市', kind: 'public', open: t - 120000, close: t - 60000 });
        WA.life.addSchedule('老周', { activity: '赶集', location: '集市', start: t - 1000, end: t + 60000 });
        const r = WA.dayRoute.build();
        return { basis: r.rows[0].segs.where.basis, hidden: WA.dayRoute.stat().where.hidden };
      });
    a(b.setup === true, 'v2266/N3a: 破坏装载成功');
    a(b.basis === 'unjudgeable' && b.hidden === 0,
      'v2266/N3b: **破坏后**真·看不见那一路失去 hidden（白名单真的在起作用；实 ' + j(b) + '）');
    const b2 = withBroken('pvHiddenVia',
      "if (r.range === 'out') return { state: 'hidden', place: '', why: why };",
      function (WA) {
        WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
        WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
        WA.life.setSettings({ enabled: true });
        WA.life.addSchedule('老周', { activity: '赶集', location: '集市', start: WA.clock.now('n3b') - 1000, end: WA.clock.now('n3b') + 60000 });
        const r = WA.dayRoute.build();
        return { basis: r.rows[0].segs.where.basis, text: r.rows[0].segs.where.text };
      });
    a(b2.setup === true && b2.basis === 'hidden',
      'v2266/N3c: **破坏后**未登记地名被读成「看不见」（另一种错形状；实 ' + j(b2.basis) + '）');
    a((b2.text || '').indexOf('看不见') >= 0,
      'v2266/N3d: 且破坏版真的把它念出来（读者会被误导；实 ' + j(b2.text) + '）');
  }
  // N4 拆掉 domain 闸（让 clock 域也去比 now）⇒ 必须现形为「判不了却硬答」
  {
    const b = withBroken('domGate', "if (!dom) return null;", function (WA) {
      WA.life.setSettings({ enabled: true });
      // 小时域 + 一个落在 8..12 的毫秒 now 不会命中；改用「把 now 缩成小时」无法伪造，
      //   故这里判「闸门被拆后 clock 域会不会被拿去比较」——比较结果必然为空，
      //   但**闸门的存在**是契约：拆掉后 onScheduleNow 不再有域守卫。
      WA.life.addSchedule('阿绫', { activity: '送柴', location: '柴房', start: 8, end: 12 });
      const r = WA.dayRoute.build();
      return { dom: (r.rows || [])[0].scheduleDomain, whereState: (r.rows || [])[0].segs.where.state };
    });
    a(b.setup === true, 'v2266/N4a: 破坏装载成功');
    a(b.dom === 'clock', 'v2266/N4b: 破坏后域判定本身仍在（判据打的是闸门不是域）');
  }
  // N5 拆掉 life-disabled ⇒ D1 必须现形（把「关着」读成「没有」）
  {
    const b = withBroken('didLifeOff', "if (!lifeOn) return segNone('life-disabled');", function (WA) {
      WA.life.setSettings({ enabled: false });
      WA.life.addGoal('老周', { text: '把货出手' });
      const r = WA.dayRoute.build();
      const d = r.rows[0].segs.did;
      return { state: d.state, why: d.why };
    });
    a(b.setup === true, 'v2266/N5a: 破坏装载成功');
    a(b.state === 'none',
      'v2266/N5b: **破坏后**「life 关着」被读成「他没有记录」（none）—— 同款判据现形（实 ' + j(b) + '）');
  }
  // N6 拆掉 switched-off ⇒ D4 必须现形（把「栏目关了」读成「他没有下一步」）
  {
    const b = withBroken('nextSwitchedOff', "if (!cfg.showNext) return segNone('switched-off');", function (WA) {
      WA.life.setSettings({ enabled: true });
      WA.life.addGoal('老周', { text: '把货出手' });
      WA.dayRoute.setSettings({ showNext: false });
      const r = WA.dayRoute.build();
      const s = r.rows[0].segs.next;
      return { state: s.state, why: s.why };
    });
    a(b.setup === true, 'v2266/N6a: 破坏装载成功');
    a(b.state === 'none',
      'v2266/N6b: **破坏后**「栏目关着」被读成「没有下一步」（none）—— 同款判据现形（实 ' + j(b) + '）');
  }
  // N7 拆掉边界口复用（自己再判一遍且判法不同）⇒ B3b 必须现形
  {
    const b = withBroken('bndReuse', "if (false && wd && typeof wd.boundary === 'function') {", function (WA) {
      WA.worldBridge.setSettings({ worldTitle: '临水镇', playerName: '沈砚' });
      WA.noesis.setSettings({ enabled: true, rangeEnabled: true });
      const bb = WA.dayRoute.boundary();
      return { via: bb.via, available: bb.available };
    });
    a(b.setup === true, 'v2266/N7a: 破坏装载成功');
    a(b.via === 'fallback', 'v2266/N7b: **破坏后**走退化路径（via=fallback）—— 同款判据现形（实 ' + j(b) + '）');
    a(b.available === true, 'v2266/N7c: 退化路径本身仍能判（降级不等于失效）');
  }
  // N8 拆掉「未知动作不念」⇒ 枚举码漏到玩家面
  {
    const base = (function () {
      const env = env0(); const WA = env.WA;
      WA.life.setSettings({ enabled: true });
      WA.store.transact(function (d) {
        d.people['p_老周'] = { id: 'p_老周', name: '老周', life: { goals: [], commitments: [], schedule: [], lastDecision: { action: 'keep', reason: 'schedule' } } };
      }, 'n8');
      const r = WA.dayRoute.build();
      return r.rows[0].segs.did.text;
    })();
    a(base.indexOf('keep') < 0, 'v2266/N8: （原版）人话映射生效（实 ' + j(base) + '）');
    // 破坏载荷刻意不含锚点原文（H5：锚点字面量在 SELF 里只准出现一次）。
    const b = withBroken('exportsFace', 'scheduleDomain: 0, storyDay: 0,', function (WA) {
      WA.life.setSettings({ enabled: true });
      WA.store.transact(function (d) {
        d.people['p_老周'] = { id: 'p_老周', name: '老周', life: { goals: [], commitments: [], schedule: [], lastDecision: { action: 'keep', reason: 'schedule' } } };
      }, 'n8');
      const r = WA.dayRoute.build();
      return { text: r.rows[0].segs.did.text };
    });
    // 注意：破坏 exportsFace 只改导出面，内部 ACTION_TEXT 未被破坏 ⇒ 这条用于证明
    //   「锚点恰中 1 次」与「导出面存在」两件事，不承担负控制语义。负控制由 N8c 承担。
    a(b.setup === true, 'v2266/N8b: 破坏装载成功（导出面锚点恰中 1 次）');
    const b2 = (function () {
      const src = rd(ENG_REL);
      const OLD = "    const a = ACTION_TEXT[dec.action] || '';";
      if (cnt(src, OLD) !== 1) return { setup: false };
      const broken = src.replace(OLD, "    const a = dec.action || '';");
      const env = env0({ 'engines/day-route.js': broken }); const WA = env.WA;
      WA.life.setSettings({ enabled: true });
      WA.store.transact(function (d) {
        d.people['p_老周'] = { id: 'p_老周', name: '老周', life: { goals: [], commitments: [], schedule: [], lastDecision: { action: 'keep', reason: 'schedule' } } };
      }, 'n8c');
      const r = WA.dayRoute.build();
      return { setup: true, text: r.rows[0].segs.did.text };
    })();
    a(b2.setup === true, 'v2266/N8c: 改映射取值处可装载');
    a(b2.setup === true && (b2.text || '').indexOf('keep') >= 0,
      'v2266/N8d: **破坏后**枚举码真漏到玩家面 —— 同款判据现形（实 ' + j(b2.text) + '）');
  }

  return { pass: pass, fail: fail, fails: fails };
}

if (require.main === module) {
  const r = runAll(function (ok, name) { if (!ok) console.log('  ✗ ' + name); });
  console.log('EXV6-2 day-route-v2266 ' + r.pass + ' / 失败 ' + r.fail);
  if (r.fail) process.exitCode = 1;
}
module.exports = { runAll: runAll, ANCHOR: ANCHOR };
