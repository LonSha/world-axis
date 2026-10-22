#!/usr/bin/env node
// WorldAxis tests/opt2310-lock-v2231.js (v2.231.0) -- OPT-2B / OPT-4 专锁
//
// 【它治什么（三处真缺陷，全部现场实测，不是静态推测）】
//   1 **挤出器误用：写一次就把整张表毁掉**（9 处，同一形态）。
//     `WA.evict.array(arr, site)` 的契约是「**原地截断** + 返回一份报告对象
//     {ok,dropped,before,after}」（见 core/evict.js 与 engines/world.js 的三处正确用法）。
//     而 backstage-tone / coordinate(2) / dream(3) / elsewhere / modelink / vitals 九处把它
//     当成「返回新数组」：
//         b.rows = WA.evict.array(b.rows.concat([x]), 'site');
//     后果：写一次之后数据槽变成一个**报告对象**，下一次进桶时 bucket() 的防御分支
//     把非数组重置为 [] ⇒ **整张表被静默清空** ⇒ 表永远只有最后写入的那一条。
//     判据：B1/B1b（elsewhere 两卡）、B1c（vitals 两人）、B1d（backstageTone 两条）。
//     负控制：N1 把 elsewhere 那处改回误用形态 ⇒ 同款判据必现形。
//
//   2 **能力写好了却没进导出面**。`elsewhere.sweep` / `vitals.sweep` 两函数在
//     v2.230.0 收口时已写好，却**不在 WA.elsewhere / WA.vitals 的导出面里** ——
//     专锁测不到、诊断包不住、出口面契约也看不见它。实现存在与能力可用是两件事。
//     判据：A2/A2b（导出面静态 + 运行时），B0/B0b（真能调到）。
//
//   3 **推进锚点只活在内存**。vitals 的 `stat.lastSweepDay` 是模块内存，重载后归零，
//     第一次 sweep 只记锚点，把「重载期间跨过的剧情日」静默吞掉一次（推进链断在重载上，
//     而面板上日子照走）。锚点必须进存档，内存值只作同会话缓存。
//     判据：B6b（存档里真有锚点）/ B6d（把存档锚点回拨后 sweep 按**存档**值算差）/ C1。
//     负控制：N2 把锚点写口改回只写内存 ⇒ B6d 必现形。
//
// 【四条口径（都是否定式，逐条有判据咬）】
//   · 同日不重复：dayIndex 没变 ⇒ 一格不动（判据 B5c/B5d）。
//   · 跨日不漏算：一次跨 N 日 ⇒ 一次推进 N 日（判据 B6/B6d）。
//   · 无钟不猜：世界钟缺失 ⇒ 如实 no-clock，**不**拿真实时间顶替（判据 B5d）。
//   · 到期不杜撰：孕期到 gestDays ⇒ 只标 birthDue 等**剧情事件**，不由计时自动结束孕期
//     （判据 B7/B7b/B7c）；而剧情事件到了必须真清标记（判据 B7e，endPregnancy 的另一半）。
//
// 【elsewhere.sweep 的两条口径】
//   · **一次全表**：sweep 只取全表一次（实测 store.get 调用数 1），
//     而旧形态「对每个名字调一次无参 view()」是 N+1 次（判据 B4/B4b，实测差）。
//   · **只报不替**：对账只报「还有几条事务没被逐条表态」，不替上游表态
//     （判据 B3：sweep 后台账 answeredAt 仍为 0）。
//
// 四段结构（与 N10/N11 同规格）：A 静态契约 / B 运行时行为 / C 持久化与只读边界 /
//   N 真源码破坏 + 两向自证（含 N0 静态面）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const EW_REL = 'engines/elsewhere.js';
const VT_REL = 'engines/vitals.js';
const BT_REL = 'engines/backstage-tone.js';
const SELF_REL = 'tests/opt2310-lock-v2231.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }

// -- 破坏锚点（各恰 1 次，A3 逐键核）--
const ANCHORS = {
  ewCleanDirty: { rel: EW_REL, txt: "if (ongoing.length) { dirty++; pending += ongoing.length; } else clean++;" },
  vtSameDay: { rel: VT_REL, txt: "if (day <= last) { stat.lastReason = 'same-day'; return { ok: true, reason: 'same-day', day: day, days: 0, ticked: 0 }; }" },
  vtAnchorSave: { rel: VT_REL, txt: "WA.store.transact(function (draft) { bucket(draft).lastSweepDay = day; return true; }, 'vitals:anchor');" },
  ewEvict: { rel: EW_REL, txt: "if (WA.evict && WA.evict.array) WA.evict.array(_keptEw, 'elsewhere.rows');\n      b.rows = _keptEw;" },
  vtBirthDue: { rel: VT_REL, txt: "r.gestDay = cfg.gestDays; r.birthDue = true; out.due.push(r.name);" },
  ewExport: { rel: EW_REL, txt: "    sweep: sweep,\n    buildBlock: buildBlock" },
  vtExport: { rel: VT_REL, txt: "    sweep: sweep,\n    stat: function" }
};
const ANCHOR = ANCHORS;

const EXPORT_KEYS = ['getSettings', 'setSettings', 'open', 'update', 'reconcile', 'romance', 'remove',
  'card', 'list', 'view', 'romanceOf', 'bandOf', 'sweep', 'buildBlock', 'stat', 'reset'];
const VEXPORT_KEYS = ['getSettings', 'setSettings', 'register', 'conceive', 'know', 'tell', 'knows',
  'knowsOthers', 'tick', 'endPregnancy', 'phaseOf', 'view', 'list', 'buildBlock', 'sweep', 'stat', 'reset'];
// 九个挤出器误用点（文件 -> 站点名）；判据 A4 逐点咬字面
const EVICT_SITES = [
  [BT_REL, 'backstageTone.notes'], ['engines/coordinate.js', 'coordinate.anchors'],
  ['engines/coordinate.js', 'coordinate.rows'], ['engines/dream.js', 'dream.threads'],
  ['engines/dream.js', 'dream.deviations'], ['engines/dream.js', 'dream.volumes'],
  [EW_REL, 'elsewhere.rows'], ['engines/modelink.js', 'modelink.drafts'], [VT_REL, 'vitals.rows']
];

function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env;
}
function setDay(WA, d) { WA.store.transact(function (draft) { draft.clock.dayIndex = d; }, 'opt2310:day'); }

function runAll(a) {
  const E = rd(EW_REL), V = rd(VT_REL);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, EW_REL)) && fs.existsSync(path.join(BASE, VT_REL)), 'A1: 两个引擎都落到仓库里');
  a(cnt(E, ANCHOR.ewExport.txt) === 1, 'A2: elsewhere 导出表里 sweep 紧邻 buildBlock（恰 1 处）');
  a(cnt(V, ANCHOR.vtExport.txt) === 1, 'A2b: vitals 导出表里 sweep 紧邻 stat（恰 1 处）');
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A3: 破坏锚点在各自目标文件里恰中 1 次（不合 ' + badA.length + ' 个：' + badA.join(',') + '）');
  const badEv = EVICT_SITES.filter(function (p) { return rd(p[0]).indexOf(p[1]) < 0; });
  a(badEv.length === 0, 'A4: 九个挤出站点都在（缺 ' + badEv.length + '）');
  const badKept = EVICT_SITES.filter(function (p) { return rd(p[0]).indexOf('evict.array(_kept') < 0; });
  a(badKept.length === 0, 'A4b: 九处全部改为**原地**调用挤出器（仍是报告当数组用的文件：'
    + badKept.map(function (p) { return p[0]; }).join(',') + '）');
  const badAssign = EVICT_SITES.filter(function (p) { return /=\s*WA\.evict\.array\(/.test(rd(p[0])); });
  a(badAssign.length === 0, 'A4c: 没有任何文件还把 evict.array 的返回值直接赋给数据槽（实 ' + badAssign.length + ' 个）');
  (function () {
    const self = rd(SELF_REL);
    const table = self.slice(self.indexOf('const ANCHORS = {'), self.indexOf('\n};', self.indexOf('const ANCHORS = {')));
    const bad = Object.keys(ANCHORS).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A5: 锚点逐键在 ANCHORS 表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  a(ANCHOR.vtAnchorSave.txt.indexOf('vitals:anchor') > 0, 'A5b: 锚点写口的站点名是 vitals:anchor（写进存档，不是内存）');

  /* ============ B 运行时行为 ============ */
  const e0 = envWith(null); const W0 = e0.WA;
  a(typeof W0.elsewhere.sweep === 'function', 'B0: elsewhere.sweep 真在运行时导出面上（此前只定义未导出）');
  a(typeof W0.vitals.sweep === 'function', 'B0b: vitals.sweep 真在运行时导出面上');
  const missE = EXPORT_KEYS.filter(function (k) { return W0.elsewhere[k] === undefined; });
  a(missE.length === 0, 'B0c: elsewhere 导出面齐备（缺 ' + (missE.join(',') || '无') + '）');
  const missV = VEXPORT_KEYS.filter(function (k) { return W0.vitals[k] === undefined; });
  a(missV.length === 0, 'B0d: vitals 导出面齐备（缺 ' + (missV.join(',') || '无') + '）');

  const e1 = envWith(null); const W1 = e1.WA;
  W1.elsewhere.setSettings({ enabled: true });
  W1.elsewhere.open('甲');
  W1.elsewhere.open('乙');
  a(W1.elsewhere.list().length === 2, 'B1: 连开两张幕后档案后 list 仍是 2（此前第二张会把第一张顶掉，实 '
    + W1.elsewhere.list().length + '）');
  a(Array.isArray(W1.store.get().elsewhere.rows), 'B1b: 数据槽仍是数组（此前被写成挤出报告对象）');
  W1.vitals.setSettings({ enabled: true });
  W1.vitals.register('丙');
  W1.vitals.register('丁');
  a(W1.vitals.list().length === 2, 'B1c: 连登记两人后 list 仍是 2（实 ' + W1.vitals.list().length + '）');
  const e1b = envWith(null); const W1b = e1b.WA;
  W1b.backstageTone.setSettings({ enabled: true });
  W1b.backstageTone.noteAdd({ text: '甲说了一件事', speaker: '甲' });
  W1b.backstageTone.noteAdd({ text: '乙说了另一件', speaker: '乙' });
  a(W1b.backstageTone.noteList().count === 2, 'B1d: 连加两条众口笔记后 noteList.count 仍是 2（实 '
    + W1b.backstageTone.noteList().count + '）');

  const e2 = envWith(null); const W2 = e2.WA;
  W2.elsewhere.setSettings({ enabled: true });
  W2.elsewhere.open('甲');
  W2.elsewhere.open('乙');
  W2.elsewhere.update('甲', { doing: '劈柴', status: '忙', place: '柴房', ledger: [{ text: '送信' }, { text: '还钱' }] });
  const sw = W2.elsewhere.sweep();
  a(sw.ok === true && sw.cards === 2, 'B2: sweep 报出卡片总数（实 ' + sw.cards + '）');
  a(sw.dirty === 1 && sw.clean === 1, 'B2b: 干净卡与待表态卡**分开计**（clean=' + sw.clean + ' / dirty=' + sw.dirty + '）');
  a(sw.pending === 2 && sw.ongoing === 2, 'B2c: 待表态条数如实报出（pending=' + sw.pending + ' / ongoing=' + sw.ongoing + '）');
  const led = W2.elsewhere.card('甲').card.ledger;
  a(led.length === 2 && led.every(function (x) { return x.answeredAt === 0 && x.state === 'ongoing'; }),
    'B3: sweep 后台账逐条仍是 ongoing / answeredAt=0（对账是**例行确认**，不替上游表态）');
  a(W2.elsewhere.stat().swept === 1 && W2.elsewhere.stat().pendingLedger === 2,
    'B3b: 读数落进 stat（swept=' + W2.elsewhere.stat().swept + ' / pendingLedger=' + W2.elsewhere.stat().pendingLedger + '）');
  (function () {
    const orig = W2.store.get; let n = 0;
    W2.store.get = function () { n++; return orig.apply(this, arguments); };
    let got = 0;
    try { W2.elsewhere.sweep(); got = n; } catch (e) { got = -1; }
    W2.store.get = orig;
    a(got === 1, 'B4: sweep 只取全表一次（实测 store.get 调用数 ' + got + '）');
    let n2 = 0;
    W2.store.get = function () { n2++; return orig.apply(this, arguments); };
    W2.elsewhere.list().forEach(function () { W2.elsewhere.view(); });
    W2.store.get = orig;
    a(n2 > 1, 'B4b: 旧形态「对每个名字调一次无参 view()」确实是 N+1 次（实测 ' + n2 + ' 次）—— 两向自证');
  })();

  const e5 = envWith(null); const W5 = e5.WA;
  W5.vitals.setSettings({ enabled: true });
  W5.vitals.setSettings({ enabled: false });
  const sDis = W5.vitals.sweep();
  a(sDis.ok === false && sDis.reason === 'disabled', 'B5: 关闭时 sweep 拒收 disabled（不猜）');
  W5.vitals.setSettings({ enabled: true });
  setDay(W5, 3);
  const sA = W5.vitals.sweep();
  a(sA.reason === 'anchored' && sA.days === 0, 'B5b: 首次见钟只记锚点、不追溯（reason=' + sA.reason + '）');
  a(W5.vitals.sweep().reason === 'same-day', 'B5c: 同日再跑一格不动（同日不重复）');
  W5.store.transact(function (draft) { delete draft.clock.dayIndex; }, 'opt2310:noclock');
  const sNo = W5.vitals.sweep();
  a(sNo.reason === 'no-clock' && sNo.day === null, 'B5d: 世界钟缺失 ⇒ 如实 no-clock，**不**拿真实时间顶替');

  const e6 = envWith(null); const W6 = e6.WA;
  W6.vitals.setSettings({ enabled: true });
  setDay(W6, 1); W6.vitals.sweep();
  setDay(W6, 4);
  const s4 = W6.vitals.sweep();
  a(s4.days === 3 && s4.reason === 'ok', 'B6: 剧情日 1→4 一次推进 3 日（days=' + s4.days + '）');
  a(W6.store.get().vitals.lastSweepDay === 4, 'B6b: 推进锚点写进**存档**（store.vitals.lastSweepDay='
    + W6.store.get().vitals.lastSweepDay + '）');
  a(W6.vitals.stat().lastSweepDay === 4, 'B6c: 内存缓存与存档同值（同会话读数一致）');
  W6.store.transact(function (draft) { draft.vitals.lastSweepDay = 2; }, 'opt2310:rollback');
  const sR = W6.vitals.sweep();
  a(sR.days === 2, 'B6d: 存档锚点回拨到 2 后 sweep 按**存档**值算差（days=2，实 ' + sR.days + '）'
    + ' —— 推进链不因重载而吞掉一次跨日');

  const e7 = envWith(null); const W7 = e7.WA;
  W7.vitals.setSettings({ enabled: true });
  setDay(W7, 10);
  W7.vitals.sweep();
  W7.vitals.register('戊');
  W7.vitals.conceive('戊');
  W7.vitals.tick('戊', 270);
  setDay(W7, 20);
  const s7 = W7.vitals.sweep();
  const v7 = W7.vitals.view('戊');
  a(v7.pregnant === true, 'B7: 孕期到 gestDays 后**仍是孕期**（不由计时自动结束）');
  a(v7.gestDay === 280, 'B7b: 孕周夹在阈值上（gestDay=' + v7.gestDay + '）');
  a(s7.due.indexOf('戊') >= 0 && W7.vitals.stat().birthDue === 1,
    'B7c: 到期只标 birthDue 等剧情事件（due=' + JSON.stringify(s7.due) + '）');
  const endR = W7.vitals.endPregnancy('戊', 'birth');
  a(endR.ok === true && W7.vitals.view('戊').pregnant === false, 'B7d: 剧情事件到了才真结束孕期（endPregnancy birth）');
  a(W7.store.get().vitals.rows.filter(function (r) { return r.name === '戊'; })[0].birthDue === false,
    'B7e: 结束孕期时**清掉** birthDue 标记（口径 ④ 的另一半）');

  /* ============ C 持久化与只读边界 ============ */
  const eC = envWith(null); const WC = eC.WA;
  WC.vitals.setSettings({ enabled: true });
  setDay(WC, 7);
  WC.vitals.sweep();
  a(WC.store.get().vitals.lastSweepDay === 7, 'C1: 锚点落盘（重载后仍可读）');
  setDay(WC, 9);
  a(WC.vitals.sweep().days === 2, 'C1b: 锚点在盘上时跨日推进照常（days=2）');
  const eC2 = envWith(null); const WC2 = eC2.WA;
  WC2.elsewhere.setSettings({ enabled: true });
  WC2.elsewhere.open('己');
  const before = JSON.stringify(WC2.store.get().elsewhere.rows);
  WC2.elsewhere.setSettings({ enabled: false });
  const rOff = WC2.elsewhere.sweep();
  a(rOff.ok === false && JSON.stringify(WC2.store.get().elsewhere.rows) === before,
    'C2: 关闭时 sweep 拒收且不改世界（逐字未变）');
  const selfSrc = rd(SELF_REL);
  const reqs = (selfSrc.match(/require\('([a-z_]+)'\)/g) || []).filter(function (r) {
    return r.indexOf("'fs'") < 0 && r.indexOf("'path'") < 0;
  });
  a(reqs.length === 0, 'C3: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');

  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  runNegative(a);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
function runNegative(a) {
  const E = rd(EW_REL), V = rd(VT_REL);
  // N0 静态面：锚点字面量在本文件里只出现一次（判据不得引用锚点串）
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n'); };
    const bad = Object.keys(ANCHORS).filter(function (k) { return cnt(self, esc(ANCHORS[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：把 elsewhere 那处挤出器改回「报告当数组用」⇒ B1 必现形
  (function () {
    const E2 = brk(E, ANCHOR.ewEvict.txt, "b.rows = WA.evict.array(_keptEw, 'elsewhere.rows');");
    const ov = {}; ov[EW_REL] = E2;
    const WA = envWith(ov).WA;
    WA.elsewhere.setSettings({ enabled: true });
    WA.elsewhere.open('甲');
    WA.elsewhere.open('乙');
    a(WA.elsewhere.list().length === 0,
      'N1: 破坏版上连开两张后一条不剩（原版为 2 ⇒ 两向自证「写一次毁整表」真的被修掉了）');
    a(!Array.isArray(WA.store.get().elsewhere.rows), 'N1b: 破坏版上数据槽确实被写成报告对象（破坏真的发生）');
  })();
  // N2 破坏：锚点写口改回只写内存 ⇒ B6d 必现形
  (function () {
    const V2 = brk(V, ANCHOR.vtAnchorSave.txt, 'stat.lastSweepDay = day;');
    const ov = {}; ov[VT_REL] = V2;
    const WA = envWith(ov).WA;
    WA.vitals.setSettings({ enabled: true });
    setDay(WA, 4);
    WA.vitals.sweep();
    a(WA.store.get().vitals.lastSweepDay === undefined,
      'N2: 破坏版上锚点**不在存档里**（原版落盘 ⇒ 两向自证「锚点只活在内存」真的被修掉了）');
    a(WA.vitals.stat().lastSweepDay === 4,
      'N2b: 破坏版上锚点**只在内存**（stat 有值 4、存档无值 ⇒ 重载即丢，推进链断在重载上）');
  })();
  // N3 破坏：导出面去掉 sweep ⇒ 被测对象消失（「写好了没导出」的负控制）
  (function () {
    const E3 = brk(E, ANCHOR.ewExport.txt, '    buildBlock: buildBlock');
    const ov = {}; ov[EW_REL] = E3;
    a(typeof envWith(ov).WA.elsewhere.sweep !== 'function',
      'N3: 破坏版上 elsewhere.sweep 不在导出面（原版在 ⇒ 两向自证）');
    const V3 = brk(V, ANCHOR.vtExport.txt, '    stat: function');
    const ov3 = {}; ov3[VT_REL] = V3;
    a(typeof envWith(ov3).WA.vitals.sweep !== 'function', 'N3b: 破坏版上 vitals.sweep 不在导出面（原版在 ⇒ 两向）');
  })();
  // N4 破坏：拆掉同日守卫 ⇒ 同日也会重复推进（「同日不重复」的负控制）
  (function () {
    const V4 = brk(V, ANCHOR.vtSameDay.txt, '');
    const ov = {}; ov[VT_REL] = V4;
    const WA = envWith(ov).WA;
    WA.vitals.setSettings({ enabled: true });
    WA.vitals.register('庚');
    setDay(WA, 3);
    WA.vitals.sweep();
    const again = WA.vitals.sweep();
    a(again.reason !== 'same-day',
      'N4: 破坏版上同日不再被拦住（reason=' + again.reason + ' ⇒ 原版 same-day 的两向自证）');
  })();
  // N5 破坏：拆掉 clean/dirty 分开计 ⇒ 干净卡被算进待表态卡
  (function () {
    const E5 = brk(E, ANCHOR.ewCleanDirty.txt, 'dirty++;');
    const ov = {}; ov[EW_REL] = E5;
    const WA = envWith(ov).WA;
    WA.elsewhere.setSettings({ enabled: true });
    WA.elsewhere.open('甲');
    WA.elsewhere.open('乙');
    WA.elsewhere.update('甲', { doing: '劈柴', status: '忙', place: '柴房', ledger: [{ text: '送信' }] });
    const s = WA.elsewhere.sweep();
    a(s.clean === 0 && s.dirty === 2,
      'N5: 破坏版上干净卡被算进待表态卡（clean=0 / dirty=2，原版 1/1 ⇒ 两向自证）');
  })();
  // N6 破坏：拆掉「到期不杜撰」的标记 ⇒ due 为空
  (function () {
    const V6 = brk(V, ANCHOR.vtBirthDue.txt, 'r.gestDay = cfg.gestDays;');
    const ov = {}; ov[VT_REL] = V6;
    const WA = envWith(ov).WA;
    WA.vitals.setSettings({ enabled: true });
    setDay(WA, 10);
    WA.vitals.sweep();
    WA.vitals.register('辛');
    WA.vitals.conceive('辛');
    WA.vitals.tick('辛', 270);
    setDay(WA, 20);
    const s = WA.vitals.sweep();
    a(s.due.length === 0, 'N6: 破坏版上到期不再标记（due 为空 ⇒ 原版 due=[辛] 的两向自证）');
    a(WA.vitals.stat().birthDue === 0, 'N6b: 破坏版上 birthDue 读数为 0（原版 1）');
  })();
  // N7 工具两向自证：锚点不存在 / 不唯一都抛
  let threw = false;
  try { brk(E, 'THIS-DOES-NOT-EXIST-OPT2310', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N7: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(E, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N7b: 锚点不唯一必须抛');
  // N8 真源码逐字未变（破坏只发生在内存副本上）
  a(rd(EW_REL) === E && rd(VT_REL) === V, 'N8: 被破坏过的两个引擎真源码逐字未变');
  a(rd(EW_REL).indexOf('>> CUT <<') < 0 && rd(VT_REL).indexOf('>> CUT <<') < 0, 'N8b: 真源码里没有 CUT 标记');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name, extra) {
    if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
  };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制失效：' + (e && e.stack)); }
  console.log('\nOPT2310-V2231: ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}