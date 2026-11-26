#!/usr/bin/env node
// WorldAxis tests/projection-bridge-v2594.js — 多观察者投影落地面专锁（v2.594.0 / R269 OPJ-1）
//
// 锁的是「同一条事实，场上每人手里是哪一版」这件事终于有人能答，不是「多一段 HTML」。五组：
//
//   A 静态契约：真委托 WA.observationProjection.project（不重写投影）、零写、不反解复合键、
//      两张装载表各一条且排在 observation-projection 之后、工具页段三件齐。
//   B 现场语义：三档分开数（有说法 / 登记无内容 / 一概不知）、**说法按正文全等分组而非标签**、
//      公共段不泄别人的说法、distorted 只数不改。
//   C 渲染：真渲染一次工具页，读数行与逐话题行真出现。
//   D 反空转：模块缺失 / 总开关关 / 台账空 / 被上限截断 四档各自报自己的原因；
//      零写实测；还原后读数又回来（两向自证）。
//   E 页面纪律：控件 id 唯一、段内零写口、无交互件、自己写明不写信念账。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function render(WA) {
  WA.panelToolsPage.bind({
    esc: function (s) { return String(s == null ? '' : s); },
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

/** 剥掉整行注释（含块注释的续行），只留可执行代码面。 */
function codeOf(src) {
  return src.split(String.fromCharCode(10)).filter(function (l) {
    const t = l.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 && t.indexOf('/*') !== 0;
  }).join(String.fromCharCode(10));
}

/** 造一本信念账：两个人两种说法（标签却都是 v1）+ 一条只登记没内容 + 一条根本不在这账上。 */
function seed() {
  return {
    epistemicStore: {
      beliefs: {
        'p_李明:码头失火': { personId: 'p_李明', topicId: '码头失火', version: 'v1', summary: '李明亲见：码头东仓起火', certainty: 'certain', source: 'witnessed', faithful: true },
        'p_王五:码头失火': { personId: 'p_王五', topicId: '码头失火', version: 'v1', summary: '听说码头有人継火', certainty: 'tentative', source: 'hearsay', faithful: false },
        'p_赵六:码头失火': { personId: 'p_赵六', topicId: '码头失火', version: 'v2', summary: '李明亲见：码头东仓起火', certainty: 'tentative', source: 'hearsay', faithful: true },
        'p_孙七:码头失火': { personId: 'p_孙七', topicId: '码头失火', version: 'v1', summary: '', certainty: 'tentative', source: 'rumor', faithful: true },
        'p_李明:盐引': { personId: 'p_李明', topicId: '盐引', version: 'v1', summary: '盐引三百张在库', certainty: 'certain', source: 'document', faithful: true },
        'broken:no-topic': { personId: 'p_钱八' }
      }
    },
    people: {
      p_李明: { name: '李明' },
      p_王五: { name: '王五' },
      p_赵六: { name: '赵六' },
      p_孙七: { name: '孙七' },
      p_钱八: { name: '钱八' }
    }
  };
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA && WA.projectionBridge;
  a(!!B, 'A0b: WA.projectionBridge 在位');
  if (!B) return { topics: 0 };

  const OP = WA.observationProjection;
  a(!!OP && typeof OP.project === 'function', 'A0c: WA.observationProjection 在位（被委托方）');

  // ── A 静态契约 ──────────────────────────────
  a(B.VERSION === '2.594.0', 'A1: 模块自报版本 2.594.0（实 ' + B.VERSION + '）');
  const keys = Object.keys(B).sort().join(',');
  a(keys === 'VERSION,__reset,diagnose,lineOf,scan,stat,summaryText,view',
    'A2: 恰好八个导出（实 ' + keys + '）');
  const engSrc = fs.readFileSync(path.join(ROOT, 'engines/projection-bridge.js'), 'utf8');
  const eng = codeOf(engSrc);
  a(eng.indexOf('OP.project(') >= 0, 'A3: 座位划分真委托 observationProjection.project（不重写投影）');
  a(eng.indexOf('transact(') < 0 && eng.indexOf('setItem(') < 0 && eng.indexOf('saveOrThrow(') < 0 && eng.indexOf('patch(') < 0,
    'A4: 代码面 0 处写口（不写信念账）');
  a(eng.indexOf("split(':')") < 0, 'A5: 不按冒号反解复合键（personId(\'a:b\') 得 p_a:b，键不可反解）');
  a(eng.indexOf('e.personId') >= 0 && eng.indexOf('e.topicId') >= 0,
    'A5b: 逐行只认行内自带的 personId / topicId 两个字段');
  a(eng.indexOf('buildBlock') < 0, 'A6: 无 buildBlock（不进注入面）');
  a(eng.indexOf('__settingsRegs') < 0 && eng.indexOf('settingsBus') < 0, 'A6b: 零设置面（纯读，不另立开关）');
  a(engSrc.indexOf('正文全等') >= 0, 'A6c: 源注释里写清「说法按正文全等分组、不按标签」（口径不得回退）');

  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const P_REL = "'engines/projection-bridge.js'";
  const OP_REL = "'engines/observation-projection.js'";
  a(idxSrc.split(P_REL).length - 1 === 1, 'A7: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(P_REL) > idxSrc.indexOf(OP_REL), 'A7b: 排在 observation-projection 之后（供者先装）');
  a(runSrc.split(P_REL).length - 1 === 1, 'A8: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split('./projection-bridge-v2594.js').length - 1 === 1, 'A8b: run.js 里挂了一次本专锁');

  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const ti = toolsSrc.indexOf("'projection'");
  a(ti >= 0, 'A9: 工具页有 projection 段');
  // 段面只取到下一个 foldSec 之前 —— 否则后面的段落（带按钮的）会被算进本段。
  const segEnd = ti >= 0 ? toolsSrc.indexOf('foldSec(', ti) : -1;
  const seg = (ti >= 0 && segEnd > ti) ? toolsSrc.slice(ti, segEnd) : '';
  a(seg.indexOf('WA.projectionBridge') >= 0 && seg.indexOf('opj.scan(') >= 0 && seg.indexOf('opj.summaryText(') >= 0,
    'A9b: 读数真委托 projectionBridge（面板不另算一份投影）');
  a(seg.indexOf('未装载') >= 0 && seg.indexOf('读数抛错') >= 0, 'A9c: 两条不可读分支各自写明原因');

  // ── B 现场语义（接一本真账） ───────────────
  const real = WA.store;
  const fake = seed();
  const before = JSON.stringify(fake);
  let calls = { get: 0, set: 0, tx: 0 };
  WA.store = {
    get: function () { calls.get++; return fake; },
    setItem: function () { calls.set++; return true; },
    transact: function () { calls.tx++; return true; },
    patch: function () { calls.tx++; return true; }
  };
  let r = null, vv = null, html = '';
  try {
    r = B.scan({ top: 6 });
    vv = B.view('码头失火');
    html = render(WA);
    B.diagnose();
  } finally { WA.store = real; }

  a(r.ok === true && r.why === 'ok', 'B0: 有账时 why=ok（实 ' + r.why + '）');
  a(r.totals.topics === 2, 'B1: 两个话题（实 ' + r.totals.topics + '）');
  a(r.totals.beliefs === 5, 'B2: 六行里五行入账（实 ' + r.totals.beliefs + '）');
  a(r.totals.legacy === 1, 'B3: 缺 topicId 的行计入 legacy 跳过（实 ' + r.totals.legacy + '）—— 不猜、不按冒号切');
  a(r.totals.audience === 5, 'B3b: 受众来自 store.people（实 ' + r.totals.audience + '）');

  const dock = r.all.filter(function (x) { return x.topic === '码头失火'; })[0];
  a(!!dock, 'B4: 码头失火在读数里');
  a(dock.seats === 5, 'B4b: 五座（持版 3 + 只登记无内容 1 + 一概不知 1）（实 ' + dock.seats + '）');
  a(dock.held === 3, 'B5: 有说法 3 座（实 ' + dock.held + '）');
  a(dock.bare === 1, 'B5b: 登记无内容 1 座，单独成档（不并进「一概不知」）（实 ' + dock.bare + '）');
  a(dock.unaware === 1, 'B5c: 一概不知 1 座（实 ' + dock.unaware + '）');
  a(dock.held + dock.bare + dock.unaware === dock.seats, 'B5d: 三档加起来等于总座数（不重不漏）');
  a(dock.distinct === 2, 'B6: **两个人两种说法 = 2 处**，尽管三人的版本标签是 v1/v1/v2（实 ' + dock.distinct + '）—— 按正文分，不按标签');
  a(dock.groups.length === 2 && dock.groups[0].who.length === 2,
    'B6b: 同文的两人被并到一组（' + (dock.groups[0] ? dock.groups[0].who.join('/') : '') + '）');
  a(dock.groups.every(function (g) { return g.who.indexOf('孙七') < 0 && g.who.indexOf('钱八') < 0; }),
    'B6c: 只登记无内容的人 与 一概不知的人 都不进说法分组');
  a(dock.distorted === 1, 'B7: 与事实不符 1 座（实 ' + dock.distorted + '）');

  a(vv.ok === true && vv.topic === '码头失火', 'B8: view() 能取单话题细节');
  a(vv.seats.filter(function (s) { return s.kind !== 'held'; }).every(function (s) { return s.version === ''; }),
    'B8b: 只拿公共段的座位里没有任何人的说法正文（公共段不泄私版）');
  a(vv.seats.filter(function (s) { return s.kind === 'held'; }).every(function (s) { return s.version !== ''; }),
    'B8c: 持版座的 block.version 就是他自己那份正文');
  const bad = vv.seats.filter(function (s) { return s.faithful === false; });
  a(bad.length === 1 && bad[0].who === '王五', 'B8d: faithful:false 只落在王五那一座（只数不改）');
  a(vv.counts.held === dock.held && vv.counts.bare === dock.bare && vv.counts.unaware === dock.unaware,
    'B8e: view() 与 scan() 的三档读数同源');

  a(r.totals.seats === 10 && r.totals.held === 4 && r.totals.bare === 1 && r.totals.unaware === 5,
    'B9: 总计座位 10 / 有说法 4 / 无内容 1 / 不知 5（实 ' + r.totals.seats + '/' + r.totals.held + '/' + r.totals.bare + '/' + r.totals.unaware + '）');
  a(r.totals.distinct === 3 && r.totals.distorted === 1, 'B9b: 分歧 3 处 / 不符 1 座');

  const st1 = B.summaryText(r);
  a(st1 === B.lineOf(r), 'B10: summaryText() 与 lineOf() 是同一份读数（不在第二处另写短版）');
  a(st1.indexOf('投影台账：2 个话题 / 5 条信念') >= 0, 'B10b: 一行读数带话题数与信念行数');
  a(st1.indexOf('有说法 4') >= 0 && st1.indexOf('登记无内容 1') >= 0 && st1.indexOf('一概不知 5') >= 0,
    'B10c: 一行读数三档都写（不只报总数）');
  a(vv.line.indexOf('码头失火') >= 0 && vv.line.indexOf('说法 2 处') >= 0, 'B10d: view().line 就这一条读数出口');

  const unk = B.view('根本没有这个话题');
  a(unk.ok === false && unk.why === 'unknown-topic' && unk.line.indexOf('信念账上没有这个话题') >= 0,
    'B11: 未知话题报 unknown-topic 且读数说清（不拿空投影冒充「都说同一版」）');
  a(B.view('').why === 'no-topic', 'B11b: 没给话题报 no-topic');
  const stt = B.stat();
  a(stt.scans >= 3 && stt.last && stt.last.topics === 2, 'B11c: stat().last 是上一次读数（不触发新扫描）');

  // ── C 渲染 ──────────────────────────────────
  a(html.indexOf('观察投影与说法分歧') >= 0, 'C1: 段落真渲染出来了');
  a(html.indexOf('投影台账：2 个话题 / 5 条信念') >= 0, 'C2: 读数行是现场数，不是写死字');
  a(html.indexOf('码头失火') >= 0 && html.indexOf('盐引') >= 0, 'C3: 两个话题名都在页面上');
  a(html.indexOf('码头失火') >= 0 && html.split('说法 2 种').length - 1 >= 1, 'C4: 「说法 2 种」可见（分歧数上了页面）');
  a(html.indexOf('与事实不符 1') >= 0, 'C5: 「与事实不符 1」可见（不隐着不报）');
  a(html.indexOf('本面只读') >= 0 && html.indexOf('正文全等') >= 0,
    'C6: 页面自己写明只读与分组口径');

  // ── D 反空转（四档 why + 零写 + 两向自证） ───
  {
    const oOP = WA.observationProjection;
    const oStore = WA.store;
    WA.store = { get: function () { return seed(); } };
    try {
      WA.observationProjection = undefined;
      const r1 = B.scan({});
      a(r1.why === 'module-missing' && B.summaryText(r1).indexOf('未装载') >= 0,
        'D1: 被委托方缺席时报 module-missing，不拿空投影冒充');
      const h1 = render(WA);
      a(h1.indexOf('observationProjection 未装载') >= 0 && h1.indexOf(' 座 · 说法 ') < 0,
        'D1b: 页面对模块缺席也单独报（不静默成空）');

      WA.observationProjection = {
        settings: function () { return { enabled: false, maxSeats: 24 }; },
        project: function () { return { ok: false, reason: 'disabled', degraded: true, seats: [] }; }
      };
      const r2 = B.scan({});
      a(r2.why === 'disabled' && r2.totals.seats === 0, 'D2: 总开关关时报 disabled（实 ' + r2.why + '）');
      const t2 = B.summaryText(r2);
      a(t2.indexOf('总开关关着') >= 0 && t2.indexOf('所有人都知道同一版') >= 0,
        'D2b: 关窗的读数写明「不是所有人都知道同一版」（不拿 0 冒充一致）');
      a(B.lineOf(B.scan({})) !== '', 'D2c: 关窗也是一条读数，不返回空串');

      WA.store = { get: function () { return {}; } };
      const r3 = B.scan({});
      a(r3.why === 'no-beliefs' && r3.totals.beliefs === 0, 'D3: 台账空报 no-beliefs（实 ' + r3.why + '）');
      const t3 = B.summaryText(r3);
      a(t3.indexOf('0 条') >= 0 && t3.indexOf('不是「所有人都知道同一版」') >= 0,
        'D3b: 空账的读数写「0 条」并逐字否认「一致」');

      WA.store = { get: function () { return seed(); } };
      const oHolder = '李明亲见：码头东仓起火';
      WA.observationProjection = {
        settings: function () { return { enabled: true, maxSeats: 4 }; },
        project: function (shared, holders) {
          const got = (holders || []).filter(function (h) { return h.version === oHolder; });
          return { ok: true, seats: [{ who: got[0] ? got[0].who : '李明', block: { version: got[0] ? got[0].version : oHolder }, redacted: false }], stats: { seats: 1, dup: 0, redacted: 0 } };
        }
      };
      const r4 = B.scan({});
      const d4 = r4.all.filter(function (x) { return x.topic === '码头失火'; })[0];
      a(d4.truncated === true && d4.lost === 2, 'D4: 被座位上限截断时如实记 truncated / lost（实 ' + d4.lost + '）');
      a(d4.unaware === 0, 'D4b: **没排上座不算「不知道」**（unaware 仍为 0，实 ' + d4.unaware + '）');
      a(r4.totals.truncated === 1 && B.summaryText(r4).indexOf('被座位上限截断') >= 0,
        'D4c: 截断数进一行读数，不隐着');
    } finally {
      WA.observationProjection = oOP;
      WA.store = oStore;
    }

    // 零写：真账走完扫描/单话题/渲染/诊断，一格未动
    WA.store = {
      get: function () { calls.get++; return fake; },
      setItem: function () { calls.set++; return true; },
      transact: function () { calls.tx++; return true; },
      patch: function () { calls.tx++; return true; }
    };
    try {
      B.scan({}); B.view('码头失火'); B.view('盐引'); render(WA); B.diagnose();
    } finally { WA.store = oStore; }
    a(JSON.stringify(fake) === before, 'D5: 走完全部四条路径，信念账逐字未变');
    a(calls.set === 0 && calls.tx === 0, 'D5b: setItem / transact / patch 被调 0 次（实 ' + calls.set + '/' + calls.tx + '）');

    WA.store = { get: function () { return seed(); } };
    try {
      const back = B.scan({});
      a(back.why === 'ok' && back.totals.topics === 2 && B.summaryText(back).indexOf('2 个话题') >= 0,
        'D6: 还原后读数又回来（D1~D4 不是恒真——两向自证）');
    } finally { WA.store = oStore; }
  }

  // ── E 页面纪律 ─────────────────────────────
  a(toolsSrc.split('wa-opj-line').length - 1 === 1, 'E1: 读数行 id 全页只一次');
  a(seg.indexOf('transact(') < 0 && seg.indexOf('setItem(') < 0 && seg.indexOf('store.patch(') < 0,
    'E2: 段内 0 处写口（看说法不等于改说法）');
  a(seg.indexOf('<button') < 0 && seg.indexOf('<input') < 0, 'E3: 本面无交互件（纯静态读数，不提供任何「改说法」入口）');
  a(seg.indexOf('不写信念账') >= 0, 'E4: 段内自己写明不写信念账');

  return { topics: r.totals.topics, beliefs: r.totals.beliefs, seats: r.totals.seats, distinct: r.totals.distinct, distorted: r.totals.distorted };
}

module.exports = { runAll: runAll };
