#!/usr/bin/env node
'use strict';
/**
 * tests/v7-world-autobiography-2292.js — v2.292.0（V7 EXV7-8 世界自传）专锁
 *
 * 治的病：`chrono.chronicle()` 答「逐条发生了什么」，长局会滚成几百条扁平列表；
 *   `worldDiary.build()` 只覆盖最近几轮（向前滚动）；`worldBriefing.view()` 只给
 *   单轮流水。**「整局下来世界分几个阶段、每个阶段留了什么」一格都没有** ——
 *   这是长局唯一还缺的那一层，也是读者（与注入侧）真正需要的那一层。
 *
 * 本锁盯四件事：
 *   ① 分章是否**只用真轮号**（缺轮不补、冲突判不可信、绝不折算时间）；
 *   ② 章正文是否**逐条摘自原文**（不生成新情节、不润色、没文本就留空）；
 *   ③ 三种「没得看」是否**可分**（关着 / 一条都没有 / 源读不出来）；
 *   ④ 三条消费方（诊断 / 面板 / 守卫登记）是否**真接上**，且拒收码是真能跑出来。
 *
 * A 静态面：导出七口 + 实现锚点 + 三条消费方 + 装载链同序 + 拒收码面
 * B 分章运行时：按轮断章 / 缺轮不补 / 冲突判不可信 / by-volume 退化 / hidden 只计数
 * C 附记：日记与简报只作尾部附记，且各自缺席各自如实报
 * D 只读与边界：零写盘 / disabled / empty 可分 / chrono 缺席与抛错与拒收分列 / 章数有界
 * N 真源码破坏负控制：轮差判据被拆 / 冲突判据被拆 / hidden 过滤被拆
 *
 * 纪律：本锁**不在主进程装载产品面**（与 v7 系各锁同规：走 vm 上下文自建 WA）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const AB = 'engines/world-autobiography.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const RUN = 'tests/run.js';
const INDEX = 'index.js';
const AB_SRC = fs.readFileSync(path.join(BASE, AB), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(BASE, INDEX), 'utf8');
const SET_SRC = fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8');
const INJ_SRC = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
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
  return WA;
}
// 归档种子：轮 1,2,3 → 轮 10,11,12 → 轮 20,21。三处轮差 7 / 8 都 ≥ 默认 chapterRounds=5，
//   故应当断成 3 章。**at 与 round 都必须给**——本模块的轮坐标只从存档按 at 反查。
const SEED = [
  { id: 's1', kind: 'event', title: '开城', summary: '城门开了', at: 1000, round: 1 },
  { id: 's2', kind: 'event', title: '雨停', summary: '连下三日停了', at: 2000, round: 2 },
  { id: 's3', kind: 'regional', title: '河涨', at: 3000, round: 3 },
  { id: 's4', kind: 'event', title: '换守将', summary: '北门归了新人', at: 10000, round: 10 },
  { id: 's5', kind: 'event', title: '密约', summary: '不该被玩家看到', at: 11000, round: 11, visibility: 'hidden' },
  { id: 's6', kind: 'horizon_distant', title: '远方来信', summary: '海那边有船', at: 12000, round: 12 },
  { id: 's7', kind: 'event', title: '秋收', summary: '粮入仓', at: 20000, round: 20 },
  { id: 's8', kind: 'event', title: '封赏', summary: '赏了三家', at: 21000, round: 21 }
];
function seed(WA, rows) {
  WA.store.transact(function (d) {
    d.chronicle = (rows || SEED).map(function (x) { return Object.assign({}, x); });
  }, 'lock:seed');
}

function runAll(assertFn) {
  const WA = load();
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };

  // ── A 静态面 ──────────────────────────────────────────────────────
  const NS = WA.worldAutobiography;
  aa(!!NS, 'A0 worldAutobiography 已装载');
  const EXP = ['getSettings', 'setSettings', 'autobiography', 'exportText', 'buildBlock', 'stat', 'reset'];
  aa(EXP.every(function (k) { return typeof NS[k] === 'function'; }),
    'A1 导出七口齐（缺 ' + JSON.stringify(EXP.filter(function (k) { return typeof NS[k] !== 'function'; })) + '）');
  aa(AB_SRC.indexOf('function autobiography(opts)') >= 0 && AB_SRC.indexOf('    autobiography: autobiography,') >= 0,
    'A2 autobiography 实现锚点 + 导出接上实现（不是同名空壳）');
  aa(AB_SRC.indexOf('function exportText(opts)') >= 0 && AB_SRC.indexOf('exportText: exportText,') >= 0,
    'A3 exportText 实现锚点 + 导出接上实现');
  // 轮坐标来源必须是**存档按 at 反查**，不是猜，也不是用 at 折算
  aa(AB_SRC.indexOf('function roundIndexOf()') >= 0 && AB_SRC.indexOf('if (idx[k] !== r) idx[k] = null;') >= 0,
    'A4 轮坐标按 at 从存档反查，冲突时整格判 null（宁可少边界不给错轮号）');
  aa(AB_SRC.indexOf('const a = rows[i - 1].round, b = rows[i].round;') >= 0
    && AB_SRC.indexOf('(b - a) >= cfg.chapterRounds') >= 0,
    'A5 断章只用轮差（同一把尺子上的减法，不折算时间）');
  aa(AB_SRC.indexOf("if (gaps.length) return { mode: 'by-round', gaps: gaps, degraded: false };") >= 0
    && AB_SRC.indexOf("return { mode: 'by-volume', gaps: g, degraded: true };") >= 0,
    'A6 一条轮边界都没有而长局装不下时退化为 by-volume 并显式 degraded');
  // hidden 过滤判据**不在本模块重写**：源码里一个 `visibility` 字样都不该有
  //   （它只在 chrono.chronicle 里判一次）。这里写成可判假的正判据 ——
  //   `x || true` 那种恒真写法等于给「判据被抄进来」发通行证。
  aa(AB_SRC.indexOf('visibility') < 0,
    'A7 hidden 过滤判据不在本模块重写（源码零 `visibility` 字样，只在 chrono.chronicle 里判一次）');
  aa(AB_SRC.indexOf('WA.chrono.chronicle({ limit: cfg.maxEntries })') >= 0,
    'A8 条目集合走 chrono.chronicle（hidden/排序/上限判据全部不重写）');
  // 三条否定式边界必须是源码事实，不是文案
  aa(AB_SRC.indexOf('function lineOf(x)') >= 0 && AB_SRC.indexOf("'· ' + (x.title || '（无题）') + (x.text ? '：' + x.text : '')") >= 0,
    'A9 章正文逐条摘自原文（无 text 就留空，不补写）');
  aa(AB_SRC.indexOf('WA.store.transact') < 0 && AB_SRC.indexOf('WA.store.save') < 0
    && AB_SRC.indexOf('WA.store.patch') < 0,
    'A10 本模块零写口（不 transact / save / patch —— 只读投影）');
  // 三条消费方
  aa(DIAG_SRC.indexOf('function secAutobio()') >= 0 && DIAG_SRC.indexOf('autobiography: secAutobio(),') >= 0,
    'A11 诊断 secAutobio 定义 + 挂载双件');
  aa(DIAG_SRC.indexOf('WA.worldAutobiography.autobiography(') >= 0, 'A12 诊断真消费读口');
  aa(DIAG_SRC.indexOf("typeof WA.worldAutobiography.autobiography !== 'function'") >= 0,
    'A13 诊断对读口缺席有显式分支（不塌成空表）');
  aa(PANEL_SRC.indexOf('id="wa-auto-view"') >= 0 && PANEL_SRC.indexOf("on('#wa-auto-view'") >= 0
    && PANEL_SRC.indexOf('id="wa-auto-export"') >= 0 && PANEL_SRC.indexOf("on('#wa-auto-export'") >= 0,
    'A14 面板渲染 + 绑定四件齐做');
  aa(DIAG_SRC.indexOf("'wa-auto-view', 'wa-auto-export',") >= 0
    && DIAG_SRC.indexOf("'wa-wh-cv-out', 'wa-auto-out'") >= 0,
    'A15 UI_BINDINGS 登记两枚控件 + 一枚动态输出容器');
  // 装载链同序：两处必须都把世界自传放在 intent-board 之后、capability-tier 之前
  {
    const pick = function (src) {
      const i = src.indexOf("'engines/world-autobiography.js'");
      const prev = src.lastIndexOf("'engines/intent-board.js'", i);
      const next = src.indexOf("'engines/capability-tier.js'", i);
      return i >= 0 && prev > 0 && prev < i && next > i;
    };
    aa(pick(RUN_SRC) && pick(INDEX_SRC),
      'A16 装载链同序（tests/run.js 的 LOAD 与 index.js 的 LOAD_ORDER 都把世界自传放在 intent-board 后、capability-tier 前）');
  }
  // 拒收码面：本模块只该有这三个码，且**不拿容量/边界冒充拒收码**
  {
    const codes = (AB_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      .match(/reason\s*:\s*'([a-zA-Z][a-zA-Z0-9_-]*)'/g) || [])
      .map(function (m) { return m.replace(/^[^']*'/, '').replace(/'$/, ''); })
      .filter(function (v, i, arr) { return arr.indexOf(v) === i; })
      .sort();
    // 本模块的拒收码**只该有这四个**：三路源故障 + 「模块关着」。
    //   多了说明有人让容量/边界冒充拒收码（容量必须走 droppedChapters / droppedLines），
    //   少了说明某一路坏法被并进了另一路（读者就分不出「没装」「装了但坏了」「装好了但关着」）。
    aa(codes.length === 4 && codes.indexOf('chrono-absent') >= 0 && codes.indexOf('chrono-threw') >= 0
      && codes.indexOf('chronicle-refused') >= 0 && codes.indexOf('disabled') >= 0,
      'A17 拒收码恰为四路（三路源故障 + disabled，实 ' + JSON.stringify(codes) + '）—— 容量截断不得冒充拒收码');
    aa(AB_SRC.indexOf('droppedChapters') > 0 && AB_SRC.indexOf('droppedLines') > 0,
    'A18 容量用 droppedChapters + droppedLines 表达（与 bonds.view 同词表）');
  // 四个「能力未接线」导出必须各有真消费方（本仓迭代主线：导出面有口、无人调 = 未接线）。
  //   逐个点名字面锚点 —— 只查「某文件里出现过某串」不够，要点到那个导出的调用字形。
  aa(DIAG_SRC.indexOf('WA.worldAutobiography.stat()') >= 0,
    'A19 stat 有真消费方（诊断节读出 reads / exports / byRound / byVolume / roundMisses）');
  aa(PANEL_SRC.indexOf('WA.worldAutobiography && WA.worldAutobiography.reset') >= 0,
    'A20 reset 有真消费方（面板读数仪清零表里的一台）');
  aa(SET_SRC.indexOf('WA.worldAutobiography.setSettings(') >= 0
    && SET_SRC.indexOf('id="wa-ab-save"') >= 0,
    'A21 setSettings 有真消费方（设置页保存按钮，渲染 + 绑定齐做）');
  aa(INJ_SRC.indexOf("'worldAutobiography'") >= 0
    && INJ_SRC.indexOf('WA.worldAutobiography.buildBlock()') >= 0,
    'A22 buildBlock 有真消费方（注入源表 + 分支消费点同批登记）');
  // 注入源默认必须是 false：DEF.enabled 为 true 的模块若注入面默认开，
  //   会让没开过这个设置面的老用户凭空多出一段约束（与 style 同一条理由）。
  aa(INJ_SRC.indexOf('worldAutobiography: false,') >= 0,
    'A23 注入源默认关闭（不给老用户凭空多出约束）');
  aa(DIAG_SRC.indexOf("'engines/world-autobiography.js': 'worldAutobiography',") >= 0,
    'A24 MODULE_EXPORTS 已登记（漏登记 ⇒ 契约面与守卫同时看不见它，而专锁照绿）');
  }

  // ── B 分章运行时 ──────────────────────────────────────────────────
  seed(WA);
  const r = NS.autobiography({});
  aa(r.ok === true, 'B1 读出自传 ok（实 ' + JSON.stringify(r.ok) + '）');
  aa(r.chapterMode === 'by-round' && r.degraded === false, 'B2 主口径按轮断章（实 ' + r.chapterMode + '）');
  aa(r.chapters === 3 && r.chaptersTotal === 3,
    'B3 轮差 7/8 ≥ 5 ⇒ 断成 3 章（实 chapters=' + r.chapters + '）');
  aa(r.total === 7 && r.hiddenCount === 1,
    'B4 hidden 条目只计数不进正文（总 8 条中 1 条 hidden，实 total=' + r.total + ' hidden=' + r.hiddenCount + '）');
  aa(r.roundMisses === 0, 'B5 种子全覆盖轮号 ⇒ roundMisses 为 0（实 ' + r.roundMisses + '）');
  const ch = r.rows;
  aa(ch[0].rounds && ch[0].rounds.min === 1 && ch[0].rounds.max === 3, 'B6 第一章轮区间 1～3');
  aa(ch[1].rounds && ch[1].rounds.min === 10 && ch[1].rounds.max === 12, 'B7 第二章轮区间 10～12');
  aa(ch[2].rounds && ch[2].rounds.min === 20 && ch[2].rounds.max === 21, 'B8 第三章轮区间 20～21');
  // 注意：hidden 那条（s5）本就在第二章的位置上，被 chrono 过滤掉之后第二章只剩 2 条 ——
  //   这正是「hidden 只计数不进正文」在条数上的直接后果，不是断章出错。
  aa(ch[0].count === 3 && ch[1].count === 2 && ch[2].count === 2,
    'B9 逐章条数 3/2/2（第二章因 hidden 被滤掉少一条，实 ' + ch.map(function (c) { return c.count; }).join('/') + '）');
  aa(ch.every(function (c) { return c.index >= 1; }) && ch[0].index === 1,
    'B10 章序号从 1 起（不是内部数组下标）');
  aa(ch[0].lines.some(function (l) { return l.indexOf('开城') >= 0; }),
    'B11 章正文摘自归档原文（首章含「开城」）');
  aa(ch[1].lines.every(function (l) { return l.indexOf('密约') < 0; }),
    'B12 hidden 条目不进章正文（第二章不含「密约」）');
  // 无 summary 的条目如实留空 —— 不补写、不润色
  const silent = ch[0].lines.filter(function (l) { return l.indexOf('河涨') >= 0; })[0];
  aa(!!silent && silent === '· 河涨', 'B13 无文本的条目如实留空（实 ' + JSON.stringify(silent) + '）');
  // 分布按**进正文的 7 条**算（hidden 那条不计入任何 kind —— 它连正文都没进）。
  aa(r.byKind.event === 5 && r.byKind.regional === 1 && r.byKind.horizon_distant === 1
    && r.byKind.event + r.byKind.regional + r.byKind.horizon_distant === r.total,
    'B14 归档分布与 total 自洽（实 ' + JSON.stringify(r.byKind) + ' 共 ' + r.total + ' 条）');

  // 缺轮号 ⇒ 不补，且如实计入 roundMisses
  {
    const WA2 = load();
    const rows = SEED.map(function (x) { return Object.assign({}, x); });
    rows[1].round = undefined;    // 第二条没有 round（同 backstage 写入方的真实形态）
    seed(WA2, rows);
    const r2 = WA2.worldAutobiography.autobiography({});
    aa(r2.ok === true && r2.roundMisses === 1, 'B15 缺轮号如实计入 roundMisses（实 ' + r2.roundMisses + '）');
    aa(r2.rows.every(function (c) { return c.rounds === null || c.rounds.min > 0; }),
      'B16 缺轮号不补一个假的轮号（章只报真存在的轮）');
  }
  // 同一 at 两条不同 round ⇒ 该时刻轮坐标判不可信（null），不取其中一个
  {
    const WA3 = load();
    const rows = [
      { id: 'c1', kind: 'event', title: '甲', summary: 'x', at: 5000, round: 1 },
      { id: 'c2', kind: 'event', title: '乙', summary: 'y', at: 5000, round: 9 },   // 冲突
      { id: 'c3', kind: 'event', title: '丙', summary: 'z', at: 9000, round: 10 }
    ];
    seed(WA3, rows);
    const r3 = WA3.worldAutobiography.autobiography({});
    aa(r3.ok === true && r3.roundMisses === 2,
      'B17 同一 at 挂两个不同轮号 ⇒ 两行都判不可信（实 roundMisses=' + r3.roundMisses + '）');
    aa(r3.chapterMode === 'by-round' && r3.chapters === 1,
      'B18 冲突不得凭空造出章边界（实 chapters=' + r3.chapters + ' mode=' + r3.chapterMode + '）');
  }
  // by-volume 退化：全无轮号且条目数超体积上限
  {
    const WA4 = load();
    const rows = [];
    for (let i = 0; i < 30; i++) {
      rows.push({ id: 'v' + i, kind: 'event', title: '条' + i, summary: 's' + i, at: 1000 + i });
    }
    seed(WA4, rows);
    const r4 = WA4.worldAutobiography.autobiography({});
    aa(r4.ok === true && r4.chapterMode === 'by-volume' && r4.degraded === true,
      'B19 一条轮边界都没有而长局装不下 ⇒ 退化为 by-volume 且 degraded=true（实 ' + r4.chapterMode + '）');
    aa(r4.note.indexOf('by-volume') >= 0 && r4.note.indexOf('不是按轮切') >= 0,
      'B20 退化口径在 note 里当场说破（读者不会把「按体积切的」当成「按阶段切的」）');
    aa(r4.roundMisses === 30, 'B21 退化时轮坐标缺失仍如实计数（实 ' + r4.roundMisses + '）');
  }

  // ── C 附记 ────────────────────────────────────────────────────────
  aa(r.appendix && r.appendix.diary && typeof r.appendix.diary.absent === 'boolean',
    'C1 附记·世界日记有独立读数（absent 是显式布尔，不是缺字段）');
  aa(r.appendix && r.appendix.briefing && typeof r.appendix.briefing.absent === 'boolean',
    'C2 附记·本轮简报有独立读数');
  aa(r.rows.every(function (c) { return c.lines.every(function (l) { return l.indexOf('附记') < 0; }); }),
    'C3 附记**不进章正文**（它们覆盖最近几轮 / 单轮流水，不属于任何一章）');
  // 摘掉上游 ⇒ 附记缺席必须如实报，不是静默消失
  {
    const WA5 = load();
    seed(WA5);
    const keepD = WA5.worldDiary, keepB = WA5.worldBriefing;
    WA5.worldDiary = undefined; WA5.worldBriefing = undefined;
    try {
      const r5 = WA5.worldAutobiography.autobiography({});
      aa(r5.ok === true && r5.chapters === 3, 'C4 附记缺席不影响章正文（两件事分开报）');
      aa(r5.appendix.diary.absent === true && r5.appendix.briefing.absent === true,
        'C5 上游缺席 ⇒ 附记如实报 absent（不静默当作「没事发生」）');
      aa(!!r5.appendix.diary.why, 'C6 缺席带原因（不是一句「没有」）');
    } finally { WA5.worldDiary = keepD; WA5.worldBriefing = keepB; }
  }

  // ── D 只读与边界 ──────────────────────────────────────────────────
  const before = JSON.stringify(WA.store.get());
  NS.autobiography({}); NS.autobiography({});
  NS.exportText({}); NS.buildBlock();
  aa(before === JSON.stringify(WA.store.get()), 'D1 连读四次零写盘（存档逐字节不变）');
  aa(NS.stat().reads >= 2 && NS.stat().exports >= 1,
    'D2 读口留读数（reads=' + NS.stat().reads + ' exports=' + NS.stat().exports + '）');
  aa(NS.stat().sources && NS.stat().sources.chrono === true,
    'D3 stat 报四路来源在场（chrono / worldDiary / worldBriefing / store 各一格）');
  // exportText 只拼已算好的东西
  const x = NS.exportText({});
  aa(x.ok === true && x.markdown.indexOf('# 世界自传') === 0 && x.chapters === 3,
    'D4 导出文本以标题起、章数与读口一致（实 ' + x.chapters + ' 章 / ' + x.chars + ' 字符）');
  aa(x.note.indexOf('不写盘') >= 0, 'D5 导出面自报「不写盘、不下载」（去处归消费方）');
  // 章数有界：超出 maxChapters 取最近的，并如实报 droppedChapters
  const cap = NS.autobiography({ maxChapters: 1 });
  aa(cap.chapters === 1 && cap.droppedChapters === 2 && cap.chaptersTotal === 3,
    'D6 章数有界（chapters=' + cap.chapters + ' dropped=' + cap.droppedChapters + ' total=' + cap.chaptersTotal + '）');
  aa(cap.rows[0].index === 3, 'D7 超上限时保留**最近**的章（实保留第 ' + cap.rows[0].index + ' 章）');
  // 每章行数有界
  const capL = NS.autobiography({ maxLines: 1 });
  aa(capL.rows.every(function (c) { return c.shown <= 1 && c.dropped === c.count - c.shown; }),
    'D8 每章行数有界且 dropped 是实数（不恒 0、不缺字段）');
  // 关闭态如实拒收，与「空」可分
  NS.setSettings({ enabled: false });
  const off = NS.autobiography({});
  aa(off.ok === false && off.reason === 'disabled' && off.chapters === 0,
    'D9 关闭态如实拒收 disabled（不是空表）');
  aa(NS.buildBlock() === '', 'D10 关闭态注入块为空（不输出半份自传）');
  NS.setSettings({ enabled: true });
  // 真没条目 ⇒ ok:true + chapters:0（与 disabled 可分）
  {
    const WA6 = load();
    seed(WA6, []);
    const e = WA6.worldAutobiography.autobiography({});
    aa(e.ok === true && e.chapters === 0 && e.total === 0,
      'D11 真没条目 ⇒ ok:true / chapters:0（与关闭态可分）');
    aa(e.note.indexOf('不是「读不到」') >= 0, 'D12 空态在 note 里说破「还没发生 ≠ 读不到」');
  }
  // 三路源故障分列（chrono 缺席 / 抛错 / 拒收）
  {
    const WA7 = load();
    seed(WA7);
    const keep = WA7.chrono;
    try {
      WA7.chrono = undefined;
      const e1 = WA7.worldAutobiography.autobiography({});
      aa(e1.ok === false && e1.reason === 'chrono-absent', 'D13 chrono 缺席 ⇒ chrono-absent（实 ' + e1.reason + '）');
      WA7.chrono = Object.assign({}, keep, { chronicle: function () { throw new Error('lock'); } });
      const e2 = WA7.worldAutobiography.autobiography({});
      aa(e2.ok === false && e2.reason === 'chrono-threw', 'D14 读口抛错 ⇒ chrono-threw（不吞成「没有条目」）');
      WA7.chrono = Object.assign({}, keep, { chronicle: function () { return { ok: false }; } });
      const e3 = WA7.worldAutobiography.autobiography({});
      aa(e3.ok === false && e3.reason === 'chronicle-refused', 'D15 拒收 ⇒ chronicle-refused（与缺席分列）');
    } finally { WA7.chrono = keep; }
    aa(WA7.worldAutobiography.autobiography({}).ok === true, 'D16 还原后读口恢复正常（见证不靠顺序活着）');
  }
  // 参数转发与夹取
  const cl = NS.autobiography({ chapterRounds: 999, maxChapters: 999 });
  aa(cl.ok === true, 'D17 越界参数被夹取而不是拒收（chapterRounds 上限 30 / maxChapters 上限 24）');
  return true;
}

function runNegative(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };

  // ── N1 真源码破坏：把「两个都带轮号」的前置条件拆掉 ⇒ 缺轮的行也能凑出边界 ──
  const BRK1 = 'if (a !== null && b !== null && (b - a) >= cfg.chapterRounds) gaps.push(i);';
  aa(AB_SRC.split(BRK1).length - 1 === 1, 'N0 破坏锚点 A 恰中 1 次');
  {
    const WA = load({ [AB]: AB_SRC.replace(BRK1, 'if ((b - a) >= cfg.chapterRounds) gaps.push(i);') });
    const rows = SEED.map(function (x) { return Object.assign({}, x); });
    rows[1].round = undefined;     // 第二条缺轮号：原版该漏掉这个边界
    seed(WA, rows);
    const bn = WA.worldAutobiography.autobiography({});
    aa(bn.ok === true && bn.roundMisses === 1 && bn.chapters !== 1,
      'N1 破坏「两个都带轮号」⇒ 缺轮行参与减法并凑出边界（原版此处恰 1 章，破坏后 ' + bn.chapters + ' 章）');
    aa(AB_SRC === fs.readFileSync(path.join(BASE, AB), 'utf8'), 'N2 负控制不改动真源码');
    // 原版在同一判据上仍真
    const WAo = load();
    seed(WAo, rows);
    const on = WAo.worldAutobiography.autobiography({});
    aa(on.chapters > 1, 'N3 原版同判据仍真（缺轮行不参与断章）');
  }

  // ── N2 真源码破坏：把「同一 at 冲突判不可信」拆掉 ⇒ 直接取后一个轮号 ──
  const BRK2 = 'if (idx[k] !== r) idx[k] = null;';
  aa(AB_SRC.split(BRK2).length - 1 === 1, 'N4 破坏锚点 B 恰中 1 次');
  {
    const WA = load({ [AB]: AB_SRC.replace(BRK2, 'if (false) idx[k] = null;') });
    seed(WA, [
      { id: 'c1', kind: 'event', title: '甲', summary: 'x', at: 5000, round: 1 },
      { id: 'c2', kind: 'event', title: '乙', summary: 'y', at: 5000, round: 9 },
      { id: 'c3', kind: 'event', title: '丙', summary: 'z', at: 9000, round: 10 }
    ]);
    const bn = WA.worldAutobiography.autobiography({});
    aa(bn.ok === true && bn.roundMisses === 0,
      'N5 破坏「冲突判不可信」⇒ 冲突时刻被塞进一个轮号（roundMisses 从 2 变 ' + bn.roundMisses + '）');
    const WAo = load();
    seed(WAo, [
      { id: 'c1', kind: 'event', title: '甲', summary: 'x', at: 5000, round: 1 },
      { id: 'c2', kind: 'event', title: '乙', summary: 'y', at: 5000, round: 9 },
      { id: 'c3', kind: 'event', title: '丙', summary: 'z', at: 9000, round: 10 }
    ]);
    aa(WAo.worldAutobiography.autobiography({}).roundMisses === 2, 'N6 原版同判据仍真（冲突两行都不可信）');
  }

  // ── N3 真源码破坏：把「不生成新叙述」的 lineOf 改成补写句 ⇒ 章正文不再是原文 ──
  const BRK3 = "'· ' + (x.title || '（无题）') + (x.text ? '：' + x.text : '')";
  aa(AB_SRC.split(BRK3).length - 1 === 1, 'N7 破坏锚点 C 恰中 1 次');
  {
    const WA = load({ [AB]: AB_SRC.replace(BRK3, "'· ' + (x.title || '（无题）') + (x.text ? '：' + x.text : '：此处发生了一件值得记下的事')") });
    seed(WA);
    const bn = WA.worldAutobiography.autobiography({});
    const line = bn.rows[0].lines.filter(function (l) { return l.indexOf('河涨') >= 0; })[0];
    aa(!!line && line.indexOf('值得记下的事') >= 0,
      'N8 破坏「不补写」⇒ 无文本条目被塞进一句生成的话（实 ' + JSON.stringify(line) + '）');
    const WAo = load();
    seed(WAo);
    const lineo = WAo.worldAutobiography.autobiography({}).rows[0].lines
      .filter(function (l) { return l.indexOf('河涨') >= 0; })[0];
    aa(lineo === '· 河涨', 'N9 原版同判据仍真（无文本如实留空）');
  }
}

module.exports = { runAll, runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('EXV7-8 WORLD AUTOBIOGRAPHY LOCK: ' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
}