#!/usr/bin/env node
// WorldAxis tests/fact-age-bridge-v2596.js — 事实老化的落地面专锁（v2.596.0 / R271 FAG-1）
//
// 锁的是「哪些事实已经陈了」这个问题**今天能不能回答**，不是「多一段 HTML」。四组：
//
//   A 静态契约：真委托 `factAge.plan`（不重写分档）/ 零写口 / **不补 lastTurn** / 不用 at 偷换 lastTurn /
//      源表封闭且两源的**身份列不同**（worldFacts 用 id、memory.facts 用 key，不统一成 id 猜）/ 装载两表各一条
//      且排在 fact-age 之后（惰性同档）/ 工具页三件齐 / **面板折叠表同批登记**（上一轮才因为漏登记拖红五条）。
//   B 现场：自造两源六行（含 active:false 旧版本、含一行无 at）—— 体检数 / 旧版本不入档 /
//      `no-last-turn` 不装绿 / 显式降级的分档与阈值一致 / degraded 每行都带 `at-as-age` / 两向（
//      造一行带 lastTurn 就能真打档，证明不是恒红）。
//   C 四档 why：`module-missing` / `no-store` / `no-facts` / `no-now` / `unknown-source` 各自报自己的原因，
//      不拿空账冒充干净；`no-now` 尤其重要：读不到时间与“全是新的”不是一回事。
//   D 零写 + 页面纪律：走完全部路径后账本逐字未变；段内 0 写口、0 交互件、id 唯一、
//      并把「写入时刻 ≠ 引用时刻」写在自己段里。
//
// 为什么这些数要写死：本锁的价值全在“最后一个读数到底能不能用”。若写成“有读数就绿”，
//   那就正好把 v2.568.0 裁决过的「lastTurn 全库无人写」这件事重新盖住一遍。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function esc(s) { return String(s == null ? '' : s); }

/** 真渲染一次工具页：bind 的两个工具与 ui/panel.js 同形（esc 原样返回 / foldSec 展开）。 */
function render(WA) {
  WA.panelToolsPage.bind({
    esc: esc,
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

function seed() {
  return {
    worldFacts: [
      { id: 'wf1', key: '桥', value: '城东桥塌了', scope: 'world', at: 100 },
      { id: 'wf2', key: '盐', value: '盐价翻倍', scope: 'region', at: 140 },
      { id: 'wf3', key: '疫', value: '西城起疫', scope: 'world', at: 10 }
    ],
    memory: { facts: [
      { key: 'k1', value: '新值', version: 2, active: true, at: 150 },
      { key: 'k1', value: '旧值', version: 1, active: false, at: 20 },
      { key: 'k2', value: '无时间戳', version: 1, active: true }
    ] }
  };
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA.factAgeBridge;
  a(!!B, 'A0b: WA.factAgeBridge 在位（惰性档：本锁由 run.js 的 LOAD 面保证已装）');
  const FA = WA.factAge;
  a(!!FA, 'A0c: 被委托方 WA.factAge 在位（全部判据的前提）');
  if (!B) return { exports: 0 };

  // ── A 静态契约 ───────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'engines/fact-age-bridge.js'), 'utf8');
  // 剥掉块注释与行注释后的源码：判「0 处写口 / 0 处赋值」时不能把注释里的字面量算进去
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  a(B.version === '2.596.0', 'A1: 版本 2.596.0（实 ' + B.version + '）');
  const EX = Object.keys(B).sort().join(',');
  a(EX === 'SOURCES,__reset,audit,degraded,diagnose,lineOf,plan,sources,stat,summaryText,version,view',
    'A2: 恰好十二导出（实 ' + EX + '）');
  a(code.indexOf('FA.plan(') >= 0 && code.indexOf('.plan(rows, now)') >= 0,
    'A3: 分档真委托 factAge.plan（本模块不重写四档）');
  a(code.indexOf('transact(') < 0 && code.indexOf('setItem(') < 0 && code.indexOf('.patch(') < 0
    && code.indexOf('store.save(') < 0,
    'A4: 源码 0 处写口（看老化不等于删事实）');
  // 口径：只咬“给某一行/某个事实的 lastTurn 赋值”，不咬 `let lastTurn = 0` 这种本地计数器。
  a(!/[A-Za-z_$][\w$]*\.lastTurn\s*=[^=]/.test(code), 'A5: 没有任何一处给某行的 lastTurn 赋值（不补时间戳）');
  a(code.indexOf('lastTurn: f ? f[ageField] : undefined') >= 0,
    'A5d: 打档行的 lastTurn 是**透传**调用方点名的列（不是自己造一个）');
  a(code.indexOf("o.ageField = 'at'") >= 0 && (code.match(/ageField = 'at'/g) || []).length === 1,
    'A5b: 只有 degraded() 一处把 ageField 设为 at（唯一入口，不在 plan 里偷换）');
  a(code.indexOf("=== 'lastTurn'") >= 0 && code.indexOf("o.ageField === undefined ? 'lastTurn'") >= 0,
    'A5c: plan 的默认老化基准是 lastTurn（不是 at）');
  const SN = (B.SOURCES || []).map(function (s) { return s.name + ':' + s.idField; }).join(',');
  a(SN === 'worldFacts:id,memoryFacts:key',
    'A6: 源表封闭且两源身份列不同（实 ' + SN + '）—— 统一成 id 就只能在 memory.facts 上编一个');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const REL = "'engines/fact-age-bridge.js'";
  a(idxSrc.split(REL).length - 1 === 1, 'A7: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf("'engines/fact-age.js'"), 'A7b: 排在 fact-age 之后（被委托方先装）');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf('const LAZY_ORDER'),
    'A7c: 登记在**惰性档**（与被委托方同档；提到首帧只会让面板在首帧读到 module-missing）');
  a(runSrc.split(REL).length - 1 === 1, 'A8: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split('./fact-age-bridge-v2596.js').length - 1 === 1, 'A8b: run.js 里挂了一次本专锁');

  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const ti = toolsSrc.indexOf("'factage'");
  a(ti >= 0, 'A9: 工具页有 factage 段');
  const segEnd = ti >= 0 ? toolsSrc.indexOf('foldSec(', ti) : -1;
  const seg = (ti >= 0 && segEnd > ti) ? toolsSrc.slice(ti, segEnd) : '';
  a(seg.indexOf('WA.factAgeBridge') >= 0 && seg.indexOf('fag.audit(') >= 0 && seg.indexOf('fag.summaryText(') >= 0,
    'A9b: 读数真委托 factAgeBridge（面板不另算一份体检）');
  a(seg.indexOf('装载中') >= 0 && seg.indexOf('装载失败') >= 0 && seg.indexOf('lazyLoad') >= 0,
    'A9c: 惰性档三档（装在中 / 装失败 / 走装载器）各自写明，不把“还没装”写成“没有陈事实”');
  const foldSrc = fs.readFileSync(path.join(ROOT, 'ui/panel-fold.js'), 'utf8');
  a(foldSrc.indexOf("id: 'factage'") >= 0, 'A9d: 面板折叠封闭表里**同批**登记了 factage（上一轮就是因为漏登记拖红五条）');
  const diagSrc = fs.readFileSync(path.join(ROOT, 'engines/tool-diag-tables.js'), 'utf8');
  a(diagSrc.indexOf(REL + ": 'factAgeBridge'") >= 0, 'A10: tool-diag 表已登记（缺席才能如实报 missing）');

  // ── B 现场：接一本真账 ─────────────────────────
  const oStore = WA.store;
  const oClock = WA.clock;
  const fake = seed();
  const before = JSON.stringify(fake);
  const calls = { get: 0, set: 0, tx: 0 };
  WA.store = {
    get: function () { calls.get++; return fake; },
    setItem: function () { calls.set++; return true; },
    transact: function () { calls.tx++; return true; },
    patch: function () { calls.tx++; return true; }
  };
  WA.clock = { now: function () { return 170; } };
  try {
    const sr = B.sources();
    a(sr.ok === true && sr.sources.length === 2, 'B1: 源表两源都能读（实 ' + (sr.sources || []).length + '）');
    const wf = sr.sources.filter(function (s) { return s.name === 'worldFacts'; })[0];
    const mf = sr.sources.filter(function (s) { return s.name === 'memoryFacts'; })[0];
    a(wf.count === 3 && mf.count === 3, 'B1b: 两源各 3 行（' + wf.count + ' / ' + mf.count + '）');
    a(wf.idField === 'id' && mf.idField === 'key', 'B1c: 身份列按源声明（' + wf.idField + ' / ' + mf.idField + '）');
    a(wf.keep === 3 && mf.keep === 2 && mf.inactive === 1,
      'B2: **旧版本不入档**（worldFacts ' + wf.keep + ' / memoryFacts ' + mf.keep + ' · 旧版本 ' + mf.inactive + ' 行）');
    a(wf.hasLastTurn === false && mf.hasLastTurn === false,
      'B3: 两个源都**没有** lastTurn（实 ' + wf.lastTurn + '/' + mf.lastTurn + ' 行）');

    const au = B.audit({});
    a(au.ok === false && au.why === 'no-last-turn', 'B4: 体检结论 no-last-turn（实 ' + au.why + '）');
    a(au.verdict.facts === 5 && au.verdict.lastTurnRows === 0,
      'B4b: 5 条当前事实 / 0 行带 lastTurn（' + au.verdict.facts + ' / ' + au.verdict.lastTurnRows + '）');
    a(au.verdict.atRows === 5, 'B4c: 5 行只有写入时刻 at（实 ' + au.verdict.atRows + '）');
    a(au.verdict.usable.length === 0 && au.verdict.blocked.length === 2,
      'B4d: 可用源 0 / 被阻源 2（usable ' + au.verdict.usable.length + ' · blocked ' + au.verdict.blocked.length + '）');
    a(au.now === 170, 'B4e: now 取自 clock（实 ' + au.now + '）');
    const line = B.summaryText(au);
    a(line.indexOf('0 行带 lastTurn') >= 0 && line.indexOf('不可用') >= 0,
      'B5: 一行读数直说不可用（不拿 0 当“都不陈”）');
    a(line.indexOf('多久没被引用过') >= 0 && line.indexOf('多久没更新过') >= 0,
      'B5b: 读数把两个问题分开写（引用 ≠ 更新）');

    const p1 = B.plan({});
    a(p1.ok === false && p1.why === 'no-last-turn' && p1.rows.length === 0,
      'B6: plan 默认按 lastTurn ⇒ 不可用且**不给行**（不拿 at 顶替）');
    const z = p1.counts;
    a(z.fresh === 0 && z.aging === 0 && z.stale === 0 && z.dead === 0 && z.unknown === 0,
      'B6b: 不可用时 counts 全 0（不编一个看起来正常的分档）');

    const d = B.degraded({});
    a(d.ok === true && d.degraded === 'at-as-age', 'B7: 显式降级能跑且标记 at-as-age（实 ' + d.degraded + '）');
    a(d.counts.fresh === 0 && d.counts.aging === 2 && d.counts.stale === 1 && d.counts.dead === 1 && d.counts.unknown === 1,
      'B7b: 降级分档与阈值一致（新 ' + d.counts.fresh + '/渐陈 ' + d.counts.aging + '/陈 ' + d.counts.stale
      + '/死 ' + d.counts.dead + '/无时间戳 ' + d.counts.unknown + '）');
    a(d.counts.fresh + d.counts.aging + d.counts.stale + d.counts.dead + d.counts.unknown === d.total,
      'B7c: 五档之和 = 打档行数（' + d.total + '）—— 不多不少');
    a(d.unknown === undefined && d.counts.unknown === 1,
      'B7d: 无时间戳那行落 unknown（不判 dead）');
    const staleIds = (d.ids.stale || []);
    a(staleIds.indexOf('wf1') >= 0, 'B8: stale 的 id 取的是身份列（worldFacts 的 id，实 ' + JSON.stringify(staleIds) + '）');
    a(d.ids.dead.indexOf('wf3') >= 0 && d.ids.dead.indexOf('k1') < 0,
      'B8b: dead 只落在真超过阈值的行上（wf3）');
    const rowsOk = d.rows.every(function (r) { return isFinite(Number(r.lastTurn)) ? r.age === 170 - Number(r.lastTurn) : true; });
    a(rowsOk, 'B8c: age 由 now − 基准算出来（不是另算一套）');

    const v = B.view('memoryFacts');
    a(v.ok === true && v.usable === false && v.planWhy === 'no-last-turn',
      'B9: 单源读数如实报“不可按 lastTurn 打档”');
    a(v.line.indexOf('旧版本 1 行不入档') >= 0 && v.line.indexOf('多久没更新过') >= 0,
      'B9b: 单源读数把旧版本与语义差别都写出来');
    a(B.view('nope').ok === false && B.view('nope').why === 'unknown-source',
      'B9c: 源表外一律拒收 unknown-source（不静默当空）');
    const pAtB = B.plan({ ageField: 'at' });
    a(pAtB.ok === true && JSON.stringify(pAtB.counts) === JSON.stringify(d.counts),
      'B10: plan({ageField:at}) 与 degraded 同源（一个实现，两个名字）');
    a(pAtB.degraded === 'at-as-age', 'B10b: 走 at 就一定带降级标记（不冒充正经分档）');

    // 两向：真有一行带 lastTurn 时，读数必须真的能用
    const fake2 = seed();
    fake2.worldFacts[0].lastTurn = 160;
    const oGet = WA.store.get;
    WA.store.get = function () { return fake2; };
    try {
      const au2 = B.audit({});
      a(au2.ok === true && au2.why === 'ok' && au2.verdict.lastTurnRows === 1,
        'B11: 造一行带 lastTurn ⇒ 体检转 ok（实 ' + au2.why + ' / ' + au2.verdict.lastTurnRows + ' 行）');
      const p2 = B.plan({});
      a(p2.ok === true && p2.counts.fresh === 1 && p2.total === 5,
        'B11b: 同一账上 plan 真打档（新 ' + p2.counts.fresh + '）—— B4/B6 不是恒真');
    } finally { WA.store.get = oGet; }

    // ── C 四档 why ────────────────────────────
    const oFA = WA.factAge;
    try {
      WA.factAge = undefined;
      const c1 = B.audit({});
      const c1p = B.plan({});
      a(c1.why === 'module-missing' && c1.ok === false, 'C1: 被委托方缺席 ⇒ module-missing（实 ' + c1.why + '）');
      a(c1p.why === 'module-missing' && c1p.rows.length === 0, 'C1b: plan 同样不抛、回原因');
    } finally { WA.factAge = oFA; }

    const oStore2 = WA.store;
    WA.store = null;
    try {
      const c2 = B.audit({});
      a(c2.why === 'no-store' && c2.ok === false, 'C2: 读不到账 ⇒ no-store（实 ' + c2.why + '）');
    } finally { WA.store = oStore2; }

    const oGet3 = WA.store.get;
    WA.store.get = function () { return {}; };
    try {
      a(B.audit({}).why === 'no-facts', 'C3: 账上 0 条事实 ⇒ no-facts（不冒充“全都不陈”）');
    } finally { WA.store.get = oGet3; }

    const oClock2 = WA.clock;
    WA.clock = null;
    try {
      const c4 = B.plan({ ageField: 'at' });
      a(c4.why === 'no-now' && c4.ok === false,
        'C4: 读不到当前轮 ⇒ no-now（一屏 unknown 与“全是新的”不是一回事，实 ' + c4.why + '）');
      const c4b = B.audit({ now: 999 });
      a(c4b.now === 999, 'C4b: 调用方显式给 now 时不依赖 clock（实 ' + c4b.now + '）');
    } finally { WA.clock = oClock2; }

    // ── D 零写 + 页面纪律 ───────────────────────
    const h = render(WA);
    a(h.indexOf('wa-fag-line') >= 0 && h.indexOf('事实老化面') >= 0, 'D0: 真渲染出读数行');
    B.audit({}); B.plan({}); B.degraded({}); B.view('worldFacts'); B.diagnose(); B.stat();
    a(JSON.stringify(fake) === before, 'D1: 走完全部路径，账本逐字未变');
    a(calls.set === 0 && calls.tx === 0, 'D1b: setItem / transact / patch 被调 0 次（实 ' + calls.set + '/' + calls.tx + '）');
    a(toolsSrc.split('wa-fag-line').length - 1 === 1, 'D2: 读数行 id 全页只一次');
    a(seg.indexOf('transact(') < 0 && seg.indexOf('setItem(') < 0 && seg.indexOf('store.patch(') < 0,
      'D3: 段内 0 处写口');
    a(seg.indexOf('<button') < 0 && seg.indexOf('<input') < 0, 'D4: 本面无交互件（不提供任何“删事实”入口）');
    a(seg.indexOf('不拿前者冒充') >= 0, 'D5: 段内自己写明不拿写入时刻冒充分档');
    const dg = B.diagnose();
    a(dg.lines.length === 2 && dg.lines[0].indexOf('worldFacts') === 0,
      'D6: diagnose 逐源一行（实 ' + dg.lines.length + ' 行）');
    a(B.stat().audits >= 3 && B.stat().last && B.stat().last.why === 'no-last-turn',
      'D6b: stat 记到了本锁跑过（audits ' + B.stat().audits + ' · last ' + (B.stat().last && B.stat().last.why) + '）—— 末次审的是原账，所以是 no-last-turn');
  } finally {
    WA.store = oStore;
    WA.clock = oClock;
  }

  return { sources: 2, facts: 5 };
}

module.exports = { runAll: runAll };
