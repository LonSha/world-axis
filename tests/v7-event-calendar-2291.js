#!/usr/bin/env node
'use strict';
/**
 * tests/v7-event-calendar-2291.js — v2.291.0（V7 EXV7-7 事件日历）专锁
 *
 * 治的病：`events` 有 `active()`（状态清单，按 priority 排序）与 `due()`（只报到点的），
 *   但「按时间看，接下来先后会到点什么」没有任何一处能一屏答出来 ——
 *   消费方只能自己遍历 rows() 再逐条判 kind 与时刻，那是各自重算，不是一份读数。
 *   承诺这一面更糟：`life.buildBlock()` 里承诺只以短句出现、只取每人前 maxItems 条、
 *   只取 active、不报 due、不报谁许给谁 —— 「谁欠着几笔、哪笔到期了」在注入面上一格都没有。
 *   本锁盯的就是两个新读口是否**真投影真源**、是否**真不猜时刻**、是否**真只读**、
 *   以及三条消费方（诊断 / 面板渲染 / 守卫登记）是否真接上。
 *
 * A 静态面：导出与实现锚点、消费方锚点、UI_BINDINGS 登记、时间基准声明
 * B 事件轴运行时：四 kind 分列 / 排序 / due 与 blocked 分离 / 周期剩余轮次 / 不猜条件
 * C 承诺台账运行时：五类词表恒全 / 逾期事实 / 不补人 / 稳定序 / 有界
 * D 只读与边界：零写盘 / 关闭态拒收 / 容量截断 / 参数转发
 * N 真源码破坏负控制：条件行被当有时刻 ⇒ 现形；摘掉导出 ⇒ 消费方显式分支
 *
 * 纪律：本锁**不在主进程装载产品面**（与 v7 系各锁同规：走 vm 上下文自建 WA）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const EV = 'engines/events.js';
const LF = 'engines/life.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const RUN = 'tests/run.js';
const EV_SRC = fs.readFileSync(path.join(BASE, EV), 'utf8');
const LF_SRC = fs.readFileSync(path.join(BASE, LF), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN), 'utf8');
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }
function load(override) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try { global.localStorage.clear(); } catch (e) {}
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  const list = vm.runInNewContext('[' + m[1] + ']');
  const ctx = vm.createContext(global);
  for (const rel of list) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    try {
      vm.runInContext(override && override[rel] !== undefined ? override[rel] : fs.readFileSync(p, 'utf8'), ctx, { filename: rel });
    } catch (e) {}
  }
  const WA = global.WorldAxis;
  WA.store.init();
  WA.events.setSettings({ enabled: true });
  WA.life.setSettings({ enabled: true, maxPeople: 8, maxItems: 4 });
  return WA;
}
const T0 = 1700000000000;
function runAll(assertFn) {
  const WA = load();
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── A 静态面 ──────────────────────────────────────────────────────
  aa(typeof WA.events.timelineView === 'function', 'A0 timelineView 导出');
  aa(typeof WA.life.commitmentsView === 'function', 'A1 commitmentsView 导出');
  aa(EV_SRC.indexOf('function timelineView(opts)') >= 0, 'A2 timelineView 实现锚点');
  aa(EV_SRC.indexOf('    timelineView: timelineView,') >= 0, 'A3 事件轴导出接上实现（不是同名空壳）');
  aa(LF_SRC.indexOf('function commitmentsView(opts)') >= 0, 'A4 commitmentsView 实现锚点');
  aa(LF_SRC.indexOf('    commitmentsView: commitmentsView,') >= 0, 'A5 承诺台账导出接上实现');
  // 时间基准声明：事件轴必须自报走事件钟，且**不**折算剧情日
  aa(EV_SRC.indexOf("clock: 'events'") >= 0, 'A6 事件轴自报时钟（clock:events）—— 不冒充剧情日');
  // 「conditional 不猜时刻」是判据，不是文案：源码里必须有这一条排除
  aa(EV_SRC.indexOf("String(x.kind) !== 'conditional'") >= 0, 'A7 conditional 被显式排除出确定时刻（不猜）');
  aa(LF_SRC.indexOf('COMMITMENTS.forEach(function (k) { byKind[k] = 0; });') >= 0,
    'A8 五类词表恒全（缺的报 0，不是不存在）');
  // 诊断消费方：一节 + 两条来源各有缺席分支
  aa(DIAG_SRC.indexOf('function secCalendar()') >= 0 && DIAG_SRC.indexOf('calendar: secCalendar()') >= 0,
    'A9 诊断 secCalendar 定义 + 挂载双件');
  aa(DIAG_SRC.indexOf('WA.events.timelineView(') >= 0 && DIAG_SRC.indexOf('WA.life.commitmentsView(') >= 0,
    'A10 诊断真消费两个读口');
  aa(DIAG_SRC.indexOf("typeof WA.events.timelineView !== 'function'") >= 0
    && DIAG_SRC.indexOf("typeof WA.life.commitmentsView !== 'function'") >= 0,
    'A11 诊断对两读口缺席各有显式分支（不塌成空表）');
  // 面板三件齐做
  aa(PANEL_SRC.indexOf('id="wa-cal-events"') >= 0 && PANEL_SRC.indexOf("on('#wa-cal-events'") >= 0
    && PANEL_SRC.indexOf('id="wa-cal-commit"') >= 0 && PANEL_SRC.indexOf("on('#wa-cal-commit'") >= 0,
    'A12 面板渲染 + 绑定四件齐做');
  aa(DIAG_SRC.indexOf("'wa-cal-events', 'wa-cal-commit',") >= 0, 'A13 UI_BINDINGS 登记两枚控件');
  // 容量截断**不是**拒收码：commitmentsView 正文里不许出现 `reason: '码'`。
  //   取函数切片而非全文 —— life.js 别处的 reason: 'disabled' 等是合法拒收码。
  {
    const cvBody = LF_SRC.slice(LF_SRC.indexOf('function commitmentsView(opts)'));
    const cvEnd = cvBody.indexOf('\n  function buildBlock(');
    const body = cvEnd > 0 ? cvBody.slice(0, cvEnd) : cvBody;
    const codes = (body.match(/reason\s*:\s*'([a-zA-Z][a-zA-Z0-9_-]*)'/g) || [])
      .map(function (m) { return m.replace(/^[^']*'/, '').replace(/'$/, ''); })
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; });
    // 这个读口的拒收码**只该有 disabled 一个**：多了说明有人让容量/边界冒充拒收码，
    // 少了说明连「模块关着」的如实拒收都被删了 —— 两向都是红。
    aa(codes.length === 1 && codes[0] === 'disabled',
      'A14 承诺台账拒收码只许 disabled（实 ' + JSON.stringify(codes) + '）—— 容量截断不得冒充拒收码');
    aa(body.indexOf('truncated: truncated, dropped: dropped,') >= 0,
      'A15 容量用 truncated + dropped 表达（与 bonds.view / 事件轴同词表）');
  }

  // ── B 事件轴运行时 ────────────────────────────────────────────────
  WA.clock.freeze(T0);
  WA.events.schedule({ id: 'b-once', kind: 'once', title: '一次', at: T0 + 5000, priority: 5 });
  WA.events.schedule({ id: 'b-delay', kind: 'delayed', title: '延迟', inMs: 9000, priority: 3 });
  WA.events.schedule({ id: 'b-rep', kind: 'repeat', title: '周期', at: T0 + 2000, intervalMs: 60000, priority: 7 });
  WA.events.schedule({ id: 'b-cond', kind: 'conditional', title: '条件', condition: '雨停', priority: 9 });
  WA.events.schedule({ id: 'b-past', kind: 'once', title: '已到点', at: T0 - 1000 });
  const v = WA.events.timelineView();
  aa(v.ok === true && v.clock === 'events' && v.now === T0, 'B1 ok + 自报事件钟与当前时刻（实 now=' + v.now + '）');
  aa(v.total === 5 && v.timedCount === 4 && v.untimedCount === 1,
    'B2 四 kind 分列：有确定时刻 4 / 条件待触发 1（实 ' + v.timedCount + '/' + v.untimedCount + '）');
  aa(v.byKind.once === 2 && v.byKind.delayed === 1 && v.byKind.repeat === 1 && v.byKind.conditional === 1,
    'B3 byKind 逐类计数（实 ' + JSON.stringify(v.byKind) + '）');
  aa(v.rows.length === 5 && v.rows[0].id === 'b-past' && v.rows[0].due === true,
    'B4 时刻升序 + 已到点未认领标 due（实首行 ' + v.rows[0].id + '）');
  aa(v.rows[1].id === 'b-rep' && v.rows[1].due === false, 'B5 未到点不标 due（到点判定不越权）');
  aa(v.dueCount === 1, 'B6 dueCount 只数真到点的（实 ' + v.dueCount + '）');
  // conditional 必须无时刻、进 untimed、且**不以「现在」冒充**
  const cond = v.rows.filter(function (r) { return r.kind === 'conditional'; })[0];
  aa(!!cond && cond.at === null && cond.unknown === true && cond.blocked === true,
    'B7 conditional 无确定时刻（at=null / unknown / blocked）');
  aa(v.untimed.length === 1 && v.untimed[0].id === 'b-cond', 'B8 条件行单列进 untimed（不排进时间序）');
  // repeat 剩余轮次与 nextAt 语义
  const rep = v.rows.filter(function (r) { return r.kind === 'repeat'; })[0];
  aa(!!rep && rep.remainRuns === 12 && rep.runs === 0 && rep.nextAt === T0 + 2000,
    'B9 repeat 报剩余轮次与下一次时刻（实 remain=' + (rep && rep.remainRuns) + '）');
  // canAct：claimed 不可再触发
  aa(v.rows.every(function (r) { return r.canAct === (r.status === 'pending'); }),
    'B10 canAct 由状态派生（claimed 不可再触发）');
  // 终态行默认不进未来轴
  WA.events.cancel('b-delay');
  const v2 = WA.events.timelineView();
  aa(v2.rows.every(function (r) { return r.id !== 'b-delay'; }),
    'B11 终态行默认不进未来轴（过去不是未来）');
  const v2b = WA.events.timelineView({ includeTerminal: true });
  aa(v2b.rows.some(function (r) { return r.id === 'b-delay'; }),
    'B12 includeTerminal 可复盘（但那时它仍不进 due）');

  // ── C 承诺台账运行时 ──────────────────────────────────────────────
  WA.life.addGoal('林岚', { text: '找到父亲' });
  WA.life.addCommitment('林岚', { kind: 'promise', target: '母亲', text: '我会回来', due: T0 + 86400000 });
  WA.life.addCommitment('林岚', { kind: 'debt', target: '商会', text: '欠三百两', due: T0 - 5000 });
  WA.life.addCommitment('周牧', { kind: 'secret', target: '官府', text: '他是内应' });
  WA.life.addCommitment('林岚', { kind: 'boundary', target: '任何人', text: '不许提她' });
  const cv = WA.life.commitmentsView();
  aa(cv.ok === true && cv.total === 4, 'C1 承诺总数（实 ' + cv.total + '）');
  aa(cv.people === 2 && cv.peopleTotal === 2, 'C2 两人有承诺（实 ' + cv.people + '）');
  aa(Object.keys(cv.byKind).length === 5 && cv.byKind.promise === 1 && cv.byKind.debt === 1
    && cv.byKind.secret === 1 && cv.byKind.boundary === 1 && cv.byKind.cooperation === 0,
    'C3 五类词表恒全，缺的报 0（实 ' + JSON.stringify(cv.byKind) + '）');
  aa(cv.overdueCount === 1, 'C4 逾期只数真有到期时刻且已过的（实 ' + cv.overdueCount + '）');
  const lin = cv.rows.filter(function (r) { return r.person === '林岚'; })[0];
  aa(!!lin && lin.count === 3, 'C5 逐人条数（林岚 3 条）');
  const debt = (lin.items || []).filter(function (i) { return i.kind === 'debt'; })[0];
  aa(!!debt && debt.overdue === true && debt.target === '商会', 'C6 逾期事实带目标（欠谁的）');
  const promise = (lin.items || []).filter(function (i) { return i.kind === 'promise'; })[0];
  aa(!!promise && promise.overdue === false && promise.due === T0 + 86400000,
    'C7 未逾期保留到期时刻（不当成没过期）');
  const secret = cv.rows.filter(function (r) { return r.person === '周牧'; })[0];
  aa(!!secret && secret.items[0].kind === 'secret', 'C8 secret 不因是秘密在作者面被藏起');
  // 排序稳定：多者在前，同数按名字升序
  aa(cv.rows[0].person === '林岚', 'C9 稳定序：承诺多者在前');
  // 不补人 / 只报真存在的人
  const empt = WA.life.commitmentsView({ person: '查无此人' });
  aa(empt.ok === true && empt.total === 0 && empt.people === 0,
    'C10 不存在的人 ⇒ 空台账（不补占位）');
  // 无到期时刻的承诺：due=null 且不标逾期
  aa((secret.items[0].due === null && secret.items[0].overdue === false),
    'C11 无到期时刻 ⇒ due=null 且不标逾期（不拿「现在」冒充到期）');

  // ── D 只读与边界 ──────────────────────────────────────────────────
  const before = JSON.stringify(WA.store.get());
  WA.events.timelineView(); WA.events.timelineView();
  WA.life.commitmentsView(); WA.life.commitmentsView();
  aa(before === JSON.stringify(WA.store.get()), 'D1 两读口连读零写盘（存档逐字节不变）');
  aa(WA.events.stat().timelineReads >= 2 && WA.life.stat().commitmentReads >= 2,
    'D2 两读口留读数（timelineReads=' + WA.events.stat().timelineReads
    + ' / commitmentReads=' + WA.life.stat().commitmentReads + '）');
  // 事件行状态未被读口改动
  const rawRows = (WA.store.get().events || {}).rows || [];
  aa(rawRows.filter(function (x) { return x.id === 'b-once'; })[0].status === 'pending',
    'D3 读未来轴不改事件状态（pending 仍是 pending）');
  const capEv = WA.events.timelineView({ maxRows: 2 });
  aa(capEv.rows.length === 2 && capEv.cap === 2 && capEv.truncated === true && capEv.dropped >= 2,
    'D4 事件轴显式容量截断（实 rows=' + capEv.rows.length + ' dropped=' + capEv.dropped + '）');
  const capLf = WA.life.commitmentsView({ maxPeople: 1 });
  aa(capLf.rows.length === 1 && capLf.truncated === true && capLf.cap === 1,
    'D5 承诺台账显式容量截断（实 rows=' + capLf.rows.length + '）');
  // 截断必须带**实数**：字段名写对但值恒 0 的写法骗得过 grep，骗不过这里。
  aa(capLf.dropped === capLf.peopleTotal - capLf.people && capLf.dropped > 0,
    'D11 截断的 dropped 是实数（dropped=' + capLf.dropped + ' peopleTotal=' + capLf.peopleTotal + '）');
  const fullLf = WA.life.commitmentsView();
  aa(fullLf.truncated === false && fullLf.dropped === 0,
    'D12 未截断时 dropped 为 0（不是缺字段，也不是恒 >0）');
  const capPer = WA.life.commitmentsView({ maxPer: 1 });
  aa(capPer.rows.some(function (r) { return r.truncated === true; }), 'D6 maxPer 逐人截断并如实标注');
  WA.events.setSettings({ enabled: false });
  const offEv = WA.events.timelineView();
  aa(offEv.ok === false && offEv.reason === 'disabled', 'D7 事件轴关闭态如实拒收（不是空表）');
  WA.events.setSettings({ enabled: true });
  WA.life.setSettings({ enabled: false });
  const offLf = WA.life.commitmentsView();
  aa(offLf.ok === false && offLf.reason === 'disabled', 'D8 承诺台账关闭态如实拒收（不是空集）');
  WA.life.setSettings({ enabled: true });
  // 空世界：真没条目 ⇒ ok:true 且 total 0（与 disabled 可分）
  const WA2 = load();
  WA2.clock.freeze(T0);
  const emptyEv = WA2.events.timelineView();
  const emptyLf = WA2.life.commitmentsView();
  aa(emptyEv.ok === true && emptyEv.total === 0 && emptyLf.ok === true && emptyLf.total === 0,
    'D9 真没条目 ⇒ ok:true / total:0（与关闭态可分）');
  aa(Object.keys(emptyLf.byKind).length === 5, 'D10 空台账仍报全五类（词表不因空而缺）');
  return true;
}
function runNegative(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── N1 真源码破坏：把 conditional 的排除条件拆掉 ⇒ 它必须被当成有时刻而串进时间序 ──
  const BRK1 = "const hasAt = at !== null && String(x.kind) !== 'conditional';";
  aa(EV_SRC.split(BRK1).length - 1 === 1, 'N0 破坏锚点 A 恰中 1 次');
  const WA = load({ [EV]: EV_SRC.replace(BRK1, 'const hasAt = at !== null;') });
  WA.clock.freeze(T0);
  WA.events.schedule({ id: 'n-cond', kind: 'conditional', title: '条件', condition: '雨停' });
  const bv = WA.events.timelineView();
  aa(bv.ok === true && bv.untimedCount === 0 && bv.timedCount === 1,
    'N1 破坏「不猜时刻」⇒ 条件行被塞进时间序当场现形（实 timed=' + bv.timedCount
    + ' untimed=' + bv.untimedCount + '）');
  aa(EV_SRC === fs.readFileSync(path.join(BASE, EV), 'utf8'), 'N2 负控制不改动真源码');
  // 原版在同一判据上仍真（破坏不是把判据自己删了）
  const WAo = load();
  WAo.clock.freeze(T0);
  WAo.events.schedule({ id: 'n-cond', kind: 'conditional', title: '条件', condition: '雨停' });
  const ov = WAo.events.timelineView();
  aa(ov.timedCount === 0 && ov.untimedCount === 1, 'N3 原版同判据仍真（conditional 不进时间序）');
  // ── N2 真源码破坏：五类词表初始化被摘掉 ⇒ 缺的类不再报 0 ──
  const BRK2 = 'COMMITMENTS.forEach(function (k) { byKind[k] = 0; });';
  aa(LF_SRC.split(BRK2).length - 1 === 1, 'N4 破坏锚点 B 恰中 1 次');
  const WA2 = load({ [LF]: LF_SRC.replace(BRK2, '') });
  WA2.clock.freeze(T0);
  WA2.life.addCommitment('林岚', { kind: 'debt', target: '商会', text: '欠债' });
  const bcv = WA2.life.commitmentsView();
  aa(bcv.ok === true && Object.keys(bcv.byKind).length === 1,
    'N5 破坏「词表恒全」⇒ 只报出现过的类（实 ' + JSON.stringify(Object.keys(bcv.byKind)) + '）');
  const WAo2 = load();
  WAo2.clock.freeze(T0);
  WAo2.life.addCommitment('林岚', { kind: 'debt', target: '商会', text: '欠债' });
  aa(Object.keys(WAo2.life.commitmentsView().byKind).length === 5, 'N6 原版同判据仍真（五类恒全）');
  // ── N3 摘掉导出 ⇒ 消费方必须走显式缺席分支 ──
  const BRK3 = '    timelineView: timelineView,';
  aa(EV_SRC.split(BRK3).length - 1 === 1, 'N7 导出锚点恰中 1 次');
  const WA3 = load({ [EV]: EV_SRC.replace(BRK3, '') });
  aa(WA3.events.timelineView === undefined, 'N8 摘掉导出 ⇒ API 真消失（消费方走缺席分支）');
  const BRK4 = '    commitmentsView: commitmentsView,';
  aa(LF_SRC.split(BRK4).length - 1 === 1, 'N9 承诺导出锚点恰中 1 次');
  const WA4 = load({ [LF]: LF_SRC.replace(BRK4, '') });
  aa(WA4.life.commitmentsView === undefined, 'N10 摘掉承诺导出 ⇒ API 真消失');
}

module.exports = { runAll, runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('EXV7-7 EVENT CALENDAR LOCK: ' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
}