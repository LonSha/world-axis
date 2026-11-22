'use strict';
// WorldAxis tests/s3-b1-e1c-v2207.js (v2.208.0) — 「待办 × 期限」专锁
//
// 本锁钉的是 v2.208.0 新增的那**唯一一个只读面** `timeline()`，逐条都是
// 「不许把两件不同的事压成一件」—— 这也是本面存在的全部理由：
//   ① **并集 ≠ 交集**：日程面有而待办面没有的行**必须出现**（link='agenda'）。
//      只做交集＝把「日程上到期了、待办页看不见」这条病原样留着。
//   ② **absent ≠ 无期限**：`due.state === 'absent'` 时 `why` 必须区分
//      `not-in-agenda`（该源没接上日程面）与 `agenda-no-row`（该源在日程面、
//      但这一条没有对应行）—— 两者是完全不同的回答。
//   ③ **日程面不可用 ≠ 没有期限**：日程面关掉 / 缺席时，表里的期限缺席是
//      **读不到**，须单列 `why='agenda-unavailable'` 且 `agenda.ok === false`。
//   ④ **时间未知不拿「现在」冒充**：日程行明说 unknown 时报 `unknown` 且 `atMs === null`。
//   ⑤ **只读**：本面零 store 写；且**不替** agenda 排序（排序口径仍住 agenda）。
//   ⑥ **稳定序可复算**：有时间者按时间升序、其余按 (来源, ref)；连调两次逐字同。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL = 'engines/pending-center.js';
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, sub) { return String(s).split(sub).length - 1; }
/** 只去行注释（本锁判的是源码常量与字面量，不能把字符串里的字也当注释切掉）。 */
function stripLineComments(src) {
  return String(src).split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
function boot() {
  const b = sync.fresh({});
  const WA = b.WA;
  WA.pendingCenter.setSettings({ enabled: true });
  return WA;
}

function runA(a) {
  const SRC = srcOf();
  const CODE = stripLineComments(SRC);
  a(/function timeline\(opts\)/.test(CODE), 'A1: timeline(opts) 在源码里');
  a(/\n    timeline: timeline,\n/.test(SRC), 'A2: timeline 在导出面上');
  a(/var EXPORT_COUNT = 11;/.test(CODE), 'A3: EXPORT_COUNT = 11（v2.208.0 起含 timeline）');
  a(/pendingCenter: export count mismatch/.test(SRC), 'A4: 导出面自证串在位');
  a(/version: '2.209.0'/.test(SRC) && /ver: '2.209.0'/.test(SRC), 'A5: 模块自报与登记 ver 都是 2.209.0');
  ['agenda-row', 'agenda-unknown', 'agenda-no-row', 'not-in-agenda', 'agenda-unavailable'].forEach(function (k) {
    a(SRC.indexOf("'" + k + "'") >= 0, 'A6: due.why 子因字面量在位：' + k);
  });
  ['both', 'pending', 'agenda'].forEach(function (k) {
    a(SRC.indexOf("'" + k + "'") >= 0, 'A7: link 三值字面量在位：' + k);
  });
  // A8 判据**只对 timeline 的函数体**成立 —— 全文件扫是过宽：`store.transact` 是 act() 的
  //   事务能力探测（v2.206.0 的形状），与只读的 timeline 无关。切片范围 = 从 `function timeline(`
  //   到 `// ── 逐源可用性` 之前的最后一行。
  const tlStart = SRC.indexOf('function timeline(opts)');
  const tlEnd = SRC.indexOf('\n  // ── 逐源可用性', tlStart);
  const TL = (tlStart >= 0 && tlEnd > tlStart) ? SRC.slice(tlStart, tlEnd) : '';
  a(TL.length > 200, 'A8: 成功切出 timeline 的函数体（实 ' + TL.length + ' 字符）');
  ['store.transact', 'localStorage.setItem', 'commit.begin', 'WA.store.set', 'save('].forEach(function (k) {
    a(TL.indexOf(k) < 0, 'A8b: timeline 函数体内不出现 ' + k + '（本面只读；写侧走 act 的透传）');
  });
  a(/const DUE_KEYS = \['etaMs', 'expiresAtMs', 'untilMs', 'deadlineMs'\]/.test(SRC),
    'A9: 时限字段名表与 agenda 现场同源（四个名字，不猜）');
  const pan = readOf('ui/panel.js');
  a(pan.indexOf('WA.pendingCenter.timeline(') >= 0, 'A10: 面板真调 WA.pendingCenter.timeline(...)（产品引用）');
  a(pan.indexOf('wa-pc-timeline') >= 0, 'A11: 面板控件 id 在位');
  a(readOf('tests/run.js').indexOf('|pendingCenter:act bySource describe diagnose getSettings items setSettings soon stat timeline|') >= 0,
    'A12: FROZEN2800 逐字含 timeline（产品真引用成员进契约；reset 仍不进）');
  a(cnt(SRC, 'const DUE_KEYS =') === 1, 'A13: DUE_KEYS 声明恰 1 次');
  a(cnt(SRC, "if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }") === 1,
    'A14: 禁用守卫在源码里**恰 1 次**（timeline 委托 items，不重写 —— 重复即第二份真源）');
  a(SRC.indexOf('Date.now()') < 0, 'A15: 本面零 Date.now()（时间只来自来源，不自己造「现在」）');
}

/** 给一个**确定的**日程面桩：真 agenda 在无世界钟时会整表拒算，探针不该拿它当「有事」。 */
function stubAgenda(WA, rows) {
  WA.agenda = { upcoming: function () { return { ok: true, rows: rows }; } };
}
function runB(a) {
  const WA = boot();
  stubAgenda(WA, []);
  const r0 = WA.pendingCenter.timeline();
  a(r0.ok === true && typeof r0.counts === 'object', 'B1: timeline 可调用且带 counts');
  a(['both', 'pending', 'agenda', 'timed', 'undated'].every(function (k) { return typeof r0.counts[k] === 'number'; }),
    'B2: counts 五个读数齐（both / pending / agenda / timed / undated）');
  // ① 配对：造一条 commission 待办（该源在日程面上）
  WA.commission = Object.assign({}, WA.commission, {
    pending: function () { return { ok: true, items: [{ id: 'c1', title: '委托甲' }], empty: false }; }
  });
  stubAgenda(WA, [{ source: 'commission', ref: 'c1', label: '委托甲 · 第1阶段', status: 'active',
    canAct: true, deadlineMs: 1700000000000 }]);
  const r1 = WA.pendingCenter.timeline();
  const row1 = r1.rows.filter(function (x) { return x.source === 'commission' && x.ref === 'c1'; })[0];
  a(!!row1, 'B3: 待办面的行出现在 timeline 里');
  a(row1 && row1.link === 'both', 'B4: 与日程行配上 ⇒ link=both（实 ' + (row1 && row1.link) + '）');
  a(row1 && row1.due && row1.due.state === 'timed' && row1.due.why === 'agenda-row',
    'B5: 配上且日程有期限 ⇒ timed / why=agenda-row（实 ' + j(row1 && row1.due) + '）');
  // ② absent ≠ 无期限：待办面有而该源**不在**日程面
  WA.coop = { pending: function () { return [{ id: 'k1', actor: '阿甲', load: 'x' }]; } };
  stubAgenda(WA, []);   // 日程面**在**且空 ⇒ 该源（coop）不在其源表里 ⇒ not-in-agenda
  const r2 = WA.pendingCenter.timeline();
  const row2 = r2.rows.filter(function (x) { return x.source === 'coop' && x.ref === 'k1'; })[0];
  a(!!row2 && row2.link === 'pending', 'B6: 只在待办面的行出现且 link=pending');
  a(row2 && row2.due.state === 'absent' && row2.due.why === 'not-in-agenda',
    'B7: absent 且 why=not-in-agenda（该源没接上日程面 —— **不是**「无期限」）实 ' + (row2 && row2.due.why));
  a(row2 && row2.due.atMs === null, 'B8: absent 行不带假时间（atMs 为 null）');
  // ③ 日程面缺席 ⇒ 单列
  const WA3 = boot();
  stubAgenda(WA3, [{ source: 'commission', ref: 'c9', label: '孤儿行', status: 'active' }]);
  WA3.agenda = null;
  const r3 = WA3.pendingCenter.timeline();
  a(r3.ok === true && r3.agenda.ok === false, 'B9: 日程面缺席时本面仍可读，且如实报 agenda.ok=false');
  a(r3.rows.filter(function (x) { return x.due.state === 'timed'; }).length === 0,
    'B10: 日程面缺席时零行被报成 timed（读不到 ≠ 有时间）');
  a(r3.rows.filter(function (x) { return x.link === 'pending'; })
    .every(function (x) { return x.due.why === 'agenda-unavailable'; }),
    'B11: 日程面缺席时 absent 行的 why 一律 agenda-unavailable（与 not-in-agenda 分开）');
  // ④ 并集 + 未知时间
  const WA4 = boot();
  stubAgenda(WA4, [{ source: 'longline', ref: 'L9', label: '承诺九', status: 'overdue', canAct: true, unknown: true }]);
  const r4 = WA4.pendingCenter.timeline();
  const row4 = r4.rows.filter(function (x) { return x.ref === 'L9'; })[0];
  a(!!row4 && row4.link === 'agenda', 'B12: 只在日程面的行也出现（link=agenda）—— 并集不是交集');
  a(row4 && row4.due.state === 'unknown' && row4.due.atMs === null && row4.due.why === 'agenda-unknown',
    'B13: 日程行时间未知 ⇒ unknown / atMs=null / why=agenda-unknown（不拿「现在」冒充）');
  // ⑤ 只读
  const s1 = JSON.stringify(WA4.store.get());
  WA4.pendingCenter.timeline();
  a(JSON.stringify(WA4.store.get()) === s1, 'B14: 只读（store 逐字节不变）');
  // ⑥ 稳定序
  a(JSON.stringify(WA4.pendingCenter.timeline()) === JSON.stringify(WA4.pendingCenter.timeline()),
    'B15: 连调两次逐字节同读数（判据不含墙钟 / 随机源）');
  // 关闭时拒算（走 reason，与 items 同规）
  WA4.pendingCenter.setSettings({ enabled: false });
  const rc = WA4.pendingCenter.timeline();
  a(rc.ok === false && rc.reason === 'disabled', 'B16: 关闭时拒算（reason=disabled）');
  a(typeof WA4.pendingCenter.timeline === 'function', 'B17: 拒算时面不消失（仍是函数）');
}

function runC(a) {
  const WA = boot();
  stubAgenda(WA, []);
  const r = WA.pendingCenter.timeline();
  a(r.total === r.counts.both + r.counts.pending + r.counts.agenda,
    'C1: total === both + pending + agenda（三值划分完备：实 ' + r.total + ' vs '
    + (r.counts.both + r.counts.pending + r.counts.agenda) + '）');
  a(r.counts.timed + r.counts.undated === r.total, 'C2: timed + undated === total（时间维度也完备）');
  a(r.rows.every(function (x) { return x.due && typeof x.due.state === 'string' && typeof x.due.why === 'string'; }),
    'C3: 每行都带 due.state 与 due.why（不许有行漏报时间维度）');
  a(r.rows.every(function (x) { return x.link === 'both' || x.link === 'pending' || x.link === 'agenda'; }),
    'C4: link 只取三值之一（不出现第四种拼法）');
}
function j(v) { return JSON.stringify(v); }

/** N 段：真源码破坏（内存副本，不写回盘）+ 两向自证。 */
function runN(a) {
  const SRC = srcOf();
  const A_ABSENT = "        : { state: 'absent', atMs: null, basis: null,\n"
    + "          why: !agOk ? 'agenda-unavailable' : (isInAg ? 'agenda-no-row' : 'not-in-agenda') };";
  //   锚点必须唯一：`agRows.forEach(` 在源码里出现 2 次（配对循环与并集循环），
  //   故带上紧随其后那行 filter 才唯一。
  const A_UNION = "    agRows.forEach(function (r) {\n      if (!r || !r.source || !r.ref) return;\n      if (usedAg[keyOf(r.source, r.ref)]) return;";
  const A_UNKNOWN = "    return { state: 'unknown', atMs: null, basis: null };";
  const c1 = cnt(SRC, A_ABSENT), c2 = cnt(SRC, A_UNION), c3 = cnt(SRC, A_UNKNOWN);
  if (c1 !== 1 || c2 !== 1 || c3 !== 1) {
    a(false, 'N0: 三处锚点各恰中 1 次（实 ' + c1 + '/' + c2 + '/' + c3 + '）');
    return;
  }
  a(true, 'N0: 三处锚点各恰中 1 次');
  // N1：absent 被压成一个字面量 ⇒ 「没接上」与「该源没这条」不可分
  const b1 = SRC.split(A_ABSENT).join("        : { state: 'absent', atMs: null, basis: null, why: 'absent' };");
  a(b1 !== SRC, 'N1a: 破坏真的改动了源码文本');
  a(b1.indexOf("'not-in-agenda'") < 0, 'N1b: 破坏副本里不再有 not-in-agenda（靶子真被抹掉）');
  a(SRC.indexOf("'not-in-agenda'") >= 0, 'N1c: 原版上两种 absent 因都在（两向）');
  // N2：并集退化成交集
  const b2 = SRC.split(A_UNION).join("    [].forEach(function (r) {\n      if (!r || !r.source || !r.ref) return;\n      if (usedAg[keyOf(r.source, r.ref)]) return;");
  a(b2 !== SRC && b2.indexOf('    [].forEach(function (r) {') >= 0, 'N2a: 破坏把日程独有的行的来源掏空（并集 → 交集）');
  a(SRC.indexOf(A_UNION) >= 0, 'N2b: 原版上是并集（两向）');
  // N3：未知时间被填成「现在」
  const b3 = SRC.split(A_UNKNOWN).join("    return { state: 'unknown', atMs: Date.now(), basis: null };");
  a(b3 !== SRC && b3.indexOf('atMs: Date.now()') >= 0, 'N3a: 破坏给 unknown 填了假时间');
  a(SRC.indexOf('Date.now()') < 0, 'N3b: 原版零 Date.now()（时间只来自来源）—— 两向');
  // N4：负控制未写回盘
  a(cnt(srcOf(), A_ABSENT) === 1 && cnt(srcOf(), A_UNION) === 1 && cnt(srcOf(), A_UNKNOWN) === 1,
    'N4: 负控制之后真源码仍是原版（破坏只活在内存副本里）');
}

function runAll(a) { runA(a); runB(a); runC(a); runN(a); }

module.exports = { runAll: runAll };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  try { runAll(a); } catch (e) { fail++; console.log('FAIL threw: ' + (e && e.stack)); }
  console.log('\ns3-b1-e1c-v2207 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}