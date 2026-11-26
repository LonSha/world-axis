#!/usr/bin/env node
// WorldAxis tests/ensemble-bridge-v2597.js — 仲裁面体检专锁（v2.597.0 / R272 ENS-1）
//
// 锁的不是“多一段 HTML”，而是两个问题今天能不能回答：
//   ① 我这套通道现在能不能跑仲裁？（开关 / 策略 / 三件齐不齐）
//   ② “就绪 3 条”里到底有几条是**真配**的 —— 其余是不是 `getChannel` 回退到 default 读出来的？
// ②才是本模块存在的理由：回退出来的通道与 default 是同一模型，拿它们投票 = 同一模型答两遍，
//   一致性 1.0 是伪造的，而 ensemble 自己的去重（按通道名 + 模型名）**管不住**这个。
//
// 四组：
//   A 静态契约：零写口 / **一次模型调用都不发**（不引用 run）/ key 只算布尔不出值 /
//      两套三档表对照 / 真调 listChannels / 装载与面板同批登记。
//   B 行为：fresh 默认（没配通道）/ 全配 / 继承 default / dupRisk / key 不泄 / 缺件清单 /
//      no-runs 与 ok 必须长得不一样 / 一致性读不到时不写 0。
//   C 缺件：module-missing / settings-error / disabled / bad-strategy / strategy-drift /
//      no-router / router-error 各自报自己的原因，且**顺序**不能被下位支枝盖掉。
//   D 现场：真渲染 / 零写实测 / id 唯一 / 段内 0 写口 0 交互件 / 不拿“跑过”冒充“跑得对”。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function esc(s) { return String(s == null ? '' : s); }

/** 真渲染一次工具页：bind 的两个工具与 ui/panel.js 同形。 */
function render(WA) {
  WA.panelToolsPage.bind({
    esc: esc,
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

const FULL = { baseUrl: 'http://127.0.0.1:9', apiKey: 'sk-test-ENS-SECRET', model: 'm-a' };
const ALL6 = ['default', 'inference', 'digest', 'judge', 'choices', 'observe'];

/** 把 listChannels 换成给定表；返回还原函数（**必须在 finally 里调**，否则污染别的块）。 */
function wrap(WA, list) {
  const prev = WA.apiRouter.listChannels;
  WA.apiRouter.listChannels = function () { return list; };
  return function () { WA.apiRouter.listChannels = prev; };
}

function row(name, cfg, eff) { return { name: name, cfg: cfg, effective: eff }; }

/** 六条通道：default 全配，inference / judge 自身未配（effective 是 default 回退值），其余空。 */
function seeded() {
  return [
    row('default', { baseUrl: FULL.baseUrl, model: FULL.model, apiKey: FULL.apiKey }, FULL),
    row('inference', null, FULL),
    row('judge', {}, FULL),
    row('digest', null, {}),
    row('choices', null, {}),
    row('observe', null, {})
  ];
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA.ensembleBridge;
  a(!!B, 'A0b: WA.ensembleBridge 在位（惰性档：本锁由 run.js 的 LOAD 面保证已装）');
  a(!!WA.ensemble, 'A0c: 被读方 WA.ensemble 在位（全部判据的前提）');
  if (!B) return { exports: 0 };
  if (typeof B.__reset === 'function') B.__reset();

  // ── A 静态契约 ───────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'engines/ensemble-bridge.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  a(B.version === '2.597.0', 'A1: 版本 2.597.0（实 ' + B.version + '）');
  const EX = Object.keys(B).sort().join(',');
  a(EX === 'STRATEGIES,WHY,__reset,audit,channels,diagnose,governance,lineOf,stat,summaryText,version,view,whyText',
    'A2: 恰好十三导出（实 ' + EX + '）');
  a(code.indexOf('transact(') < 0 && code.indexOf('setItem(') < 0 && code.indexOf('.patch(') < 0
    && code.indexOf('store.save(') < 0 && code.indexOf('settingsBus.save') < 0
    && code.indexOf('setSettings') < 0,
    'A3: 源码 0 处写口（体检不等于改设置）');
  // “一次模型调用都不发”只能靠源码级证据：不引用引擎入口
  a(code.indexOf('.run(') < 0 && code.indexOf('ensemble.run') < 0,
    'A4: 源码不引用 run（诊断面不是入口 —— 它一次通道调用都不发）');
  // key 只参与布尔运算，不能成为返回字段
  a(!/apiKey\s*:/.test(code), 'A5: 没有任何对象字段叫 apiKey（key 只落布尔，不出函数）');
  a((code.match(/String\(e\.apiKey\)/g) || []).length === 1,
    'A5b: key 只在唯一一处取真值（而它紧接 .trim() 后进 !!，不进返回值）');
  a(B.STRATEGIES.join(',') === 'first,vote,blend', 'A6: 三档封闭表 first/vote/blend');
  a(Array.isArray(B.WHY) && B.WHY.length === 10 && B.WHY[0] === 'ok',
    'A6b: why 封闭表恰好十值（实 ' + (B.WHY || []).length + '）');
  a(code.indexOf('R.listChannels()') >= 0, 'A7: 通道表**真读** apiRouter.listChannels()（不自己拼一份）');
  a(code.indexOf('cfg[name] || cfg.default') < 0,
    'A7b: 不自己重实现 getChannel 的 default 回退（否则就看不见“继承”这件事）');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const REL = "'engines/ensemble-bridge.js'";
  a(idxSrc.split(REL).length - 1 === 1, 'A8: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf("'engines/ensemble.js'"), 'A8b: 排在 ensemble 之后（被读方先装）');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf('const LAZY_ORDER'),
    'A8c: 登记在**惰性档**（与被读方同档；提到首帧只会让面板读到 module-missing）');
  a(runSrc.split(REL).length - 1 === 1, 'A8d: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split('./ensemble-bridge-v2597.js').length - 1 === 1, 'A8e: run.js 里挂了一次本专锁');

  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  a(toolsSrc.indexOf("'ensemble'") >= 0, 'A9: 工具页有 ensemble 段');
  const segStart = toolsSrc.indexOf("'ensemble'");
  const seg = toolsSrc.slice(segStart, segStart + 6000);
  a(seg.indexOf('eb.audit(') >= 0 && seg.indexOf('eb.summaryText(') >= 0,
    'A9b: 段内真委托 audit + summaryText（不自己拼一句读数）');
  a(seg.indexOf('装载失败') >= 0 && seg.indexOf('装载中') >= 0 && seg.indexOf('lazyLoad') >= 0,
    'A9c: 三档各自写明（装不上 / 正在装 / 走装载器）');
  const foldSrc = fs.readFileSync(path.join(ROOT, 'ui/panel-fold.js'), 'utf8');
  a(foldSrc.indexOf("id: 'ensemble'") >= 0,
    'A9d: 面板折叠表**同批登记**（本仓四次栽在“只加面板不加表”上，这里与段一次写齐）');
  const diagSrc = fs.readFileSync(path.join(ROOT, 'engines/tool-diag-tables.js'), 'utf8');
  a(diagSrc.indexOf("'engines/ensemble-bridge.js': 'ensembleBridge'") >= 0, 'A10: tool-diag 表已登记（诊断面自身也在账上）');

  // ── B 行为 ───────────────────────────────────
  B.__reset();
  const a0 = B.audit({});
  a(a0.ch.total === 6, 'B0: 六条通道全在表内（实 ' + a0.ch.total + '）');
  a(a0.ch.ready === 0 && a0.why === 'no-channel-ready',
    'B1: fresh 环境一条也没配 ⇒ no-channel-ready（实 ready ' + a0.ch.ready + ' / ' + a0.why + '）');
  a(a0.verdict.canRun === false, 'B1b: canRun 为 false（没通道就没法跑）');
  a(B.lineOf(a0).indexOf('没有一条同时有') > 0, 'B1c: 读数直说“没有一条同时有”');

  let un = wrap(WA, [row('default', { baseUrl: FULL.baseUrl, model: FULL.model, apiKey: FULL.apiKey }, FULL)]);
  try {
    const a1 = B.audit({});
    a(a1.ch.ready === 1 && a1.ch.own === 1 && a1.ch.inherited === 0,
      'B2: 仅 default 真配 ⇒ ready 1 / own 1 / inherited 0（实 ' + a1.ch.ready + '/' + a1.ch.own + '/' + a1.ch.inherited + '）');
    a(a1.ch.dupRisk === false, 'B2b: 只有一条成员时 dupRisk 为 false（一条投不出“一致”）');
  } finally { un(); }

  un = wrap(WA, seeded());
  try {
    const a2 = B.audit({});
    a(a2.ch.ready === 3 && a2.ch.own === 1 && a2.ch.inherited === 2,
      'B3: seeded ⇒ ready 3 / own 1 / inherited 2（实 ' + a2.ch.ready + '/' + a2.ch.own + '/' + a2.ch.inherited + '）');
    a(a2.ch.dupRisk === true, 'B3b: 有继承成员且 ≥2 条就绪 ⇒ dupRisk true');
    const line = B.lineOf(a2);
    a(line.indexOf('继承 default 2 条') > 0, 'B4: 读数单列“继承 default 2 条”');
    a(line.indexOf('同一个模型') > 0 && line.indexOf('假高') > 0,
      'B4b: 并把后果写明（同一模型答两遍 ⇒ 一致性会假高）');
    const j = JSON.stringify(a2.ch);
    a(j.indexOf('sk-test-ENS-SECRET') < 0, 'B5: 体检结果 JSON 里没有明文 key');
    a(a2.ch.rows[0].apiKey === undefined, 'B5b: 行对象上没有 apiKey 字段（只有 hasKey 布尔）');
    const inf = B.view('inference');
    a(inf.why === 'inherited' && inf.row.inherited === true,
      'B5c: 继承通道单看时报 inherited（不是 ok —— 它是借了 default 的配置）');
    a(B.view('default').why === 'ok', 'B5d: 真配通道单看时报 ok');
    a(B.view('nope').why === 'unknown-channel', 'B5e: 表外通道名不编一行，如实报 unknown-channel');
  } finally { un(); }

  un = wrap(WA, [row('default', { baseUrl: FULL.baseUrl, apiKey: FULL.apiKey }, { baseUrl: FULL.baseUrl, apiKey: FULL.apiKey, model: '' })]);
  try {
    const a3 = B.audit({});
    a(a3.ch.ready === 0 && a3.ch.rows[0].hasModel === false,
      'B6: 缺 model 就不算就绪（三件齐才算）');
    a(B.view('default').line.indexOf('model') > 0, 'B6b: 单看时点名缺的是 model');
  } finally { un(); }

  // no-runs：能跑但一次没跑过
  un = wrap(WA, seeded());
  try {
    const a4 = B.audit({});
    a(a4.why === 'no-runs', 'B7: 配好了但引擎没跑过 ⇒ no-runs（实 ' + a4.why + '）');
    a(a4.ok === false, 'B7b: no-runs 不算绿（能跑 ≠ 跑过）');
    const l = B.lineOf(a4);
    a(l.indexOf('一次都没跑过') > 0, 'B7c: 读数直说一次都没跑过');
    a(l.indexOf('不是 0，是没有') > 0, 'B7d: 并列明“不是 0，是没有”（不许把没量过写成量出 0）');
  } finally { un(); }

  // 造一份引擎账：有读数
  const E = WA.ensemble;
  const prevStat = E.stat;
  un = wrap(WA, seeded());
  try {
    E.stat = function () {
      return { runs: 3, members: 9, agreed: 2, conflicted: 1, blended: 0, fellback: 0, allFailed: 0,
        blocked: 0, duplicates: 0, lastReason: 'voted', faults: {}, lastConsistency: 0.67,
        lastMs: 2100, worstMs: 1200, worstChannel: 'judge', strategy: 'first', maxModels: 3, concurrency: 3 };
    };
    const a5 = B.audit({});
    a(a5.why === 'ok', 'B8: 跑过且读得到 ⇒ ok（实 ' + a5.why + '）');
    a(a5.verdict.consistency === 0.67 && a5.verdict.agree === 2 && a5.verdict.conflict === 1,
      'B8b: 一致性 / 已同意 / 分歧 逐项照账');
    const l = B.lineOf(a5);
    a(l.indexOf('0.67') > 0 && l.indexOf('judge 1200ms') > 0 && l.indexOf('已同意 2 / 分歧 1') > 0,
      'B8c: 读数含一致性 + 最慢通道 + 同意/分歧');
    a(l.indexOf('最近结论 voted') > 0, 'B8d: 读数带引擎自报的最近结论（不自己归纳）');
    // 只有 1 份答案：一致性为 null，不许写成 0
    E.stat = function () {
      return { runs: 1, members: 1, agreed: 0, conflicted: 0, lastReason: 'first-pick', faults: {},
        lastConsistency: null, worstMs: 300, worstChannel: 'default', strategy: 'first', maxModels: 3, concurrency: 3 };
    };
    const a6 = B.audit({});
    a(a6.verdict.consistency === null, 'B9: 单成员时一致性为 null（不是 0）');
    a(B.lineOf(a6).indexOf('只有 1 份答案') > 0, 'B9b: 读数说明为何无数（只有 1 份答案，比不出）');
    a(B.lineOf(a6).indexOf('上次一致性 0 ') < 0, 'B9c: 不会出现“一致性 0”这种把没量过写成零的写法');
  } finally { E.stat = prevStat; un(); }

  // 零调用：体检不得让引擎的 runs 动一下
  const before = (WA.ensemble.stat() || {}).runs || 0;
  B.audit({}); B.audit({});
  const after = (WA.ensemble.stat() || {}).runs || 0;
  a(before === after, 'B10: 连着体检两次后引擎 runs 未变（' + before + ' → ' + after + '）');

  a(B.whyText('strategy-drift').indexOf('不一致') > 0, 'B11: whyText 认得 strategy-drift');
  a(B.whyText('no-such-why').indexOf('未登记') === 0, 'B11b: 表外 why 不编一个说法，直说未登记');
  const dg = B.diagnose();
  a(dg.lines.length === 2 + 6, 'B12: 诊断行 = 读数 1 + 治理 1 + 通道 6（实 ' + dg.lines.length + '）');
  a(dg.lines[1].indexOf('出厂默认值读不到') > 0,
    'B12b: 诊断明写出厂默认值读不到（不从文件头注释里抄一个）');

  // ── C 缺件 ────────────────────────────────────
  const prevEns = WA.ensemble;
  try {
    WA.ensemble = null;
    const c1 = B.audit({});
    a(c1.why === 'module-missing', 'C1: 引擎不在 ⇒ module-missing（实 ' + c1.why + '）');
    a(B.lineOf(c1).indexOf('不是 0，是没有') > 0, 'C1b: 读数把“读不到”与“量出零”分开');
  } finally { WA.ensemble = prevEns; }

  try {
    WA.ensemble = Object.assign({}, prevEns, { getSettings: function () { throw new Error('boom'); } });
    const c2 = B.audit({});
    a(c2.why === 'settings-error', 'C2: 设置面抛错 ⇒ settings-error（实 ' + c2.why + '）');
  } finally { WA.ensemble = prevEns; }

  try {
    WA.ensemble = Object.assign({}, prevEns, {});
    WA.ensemble.getSettings = function () { return Object.assign({}, prevEns.getSettings(), { enabled: false }); };
    const c3 = B.audit({});
    a(c3.why === 'disabled', 'C3: 总开关关着 ⇒ disabled（实 ' + c3.why + '）');
    a(B.lineOf(c3).indexOf('一次通道调用都不发') > 0, 'C3b: 读数写明一次调用都不发（不是发了丢结果）');
    a(c3.verdict.canRun === false, 'C3c: canRun 为 false');
  } finally { WA.ensemble = prevEns; }

  try {
    WA.ensemble = Object.assign({}, prevEns);
    WA.ensemble.getSettings = function () { return Object.assign({}, prevEns.getSettings(), { strategy: 'majority' }); };
    const c4 = B.audit({});
    a(c4.why === 'bad-strategy', 'C4: 策略不在三档表 ⇒ bad-strategy（实 ' + c4.why + '）');
    a(c4.gov.strategy === 'majority' && B.lineOf(c4).indexOf('majority') > 0,
      'C4b: 原值原样带回（不静默回落 first）');
  } finally { WA.ensemble = prevEns; }

  try {
    WA.ensemble = Object.assign({}, prevEns, { STRATEGIES: ['first', 'vote'] });
    const c5 = B.audit({});
    a(c5.why === 'strategy-drift', 'C5: 两套三档表不一致 ⇒ strategy-drift（实 ' + c5.why + '）');
    a(c5.gov.drift === false, 'C5b: drift 标记为 false');
  } finally { WA.ensemble = prevEns; }

  const prevList = WA.apiRouter.listChannels;
  try {
    delete WA.apiRouter.listChannels;
    const c6 = B.audit({});
    a(c6.why === 'no-router', 'C6: listChannels 不在 ⇒ no-router（实 ' + c6.why + '）');
  } finally { WA.apiRouter.listChannels = prevList; }

  try {
    WA.apiRouter.listChannels = function () { throw new Error('router boom'); };
    const c7 = B.audit({});
    a(c7.why === 'router-error', 'C7: 列举通道抛错 ⇒ router-error（实 ' + c7.why + '）');
  } finally { WA.apiRouter.listChannels = prevList; }

  const c8 = B.audit({});
  a(c8.why !== 'module-missing' && c8.why !== 'settings-error' && c8.why !== 'router-error',
    'C8: 逐个恢复后回到真实结论（实 ' + c8.why + '）—— 证明 C 组不是把环境搞坏后恒红');

  // ── D 现场 ────────────────────────────────────
  un = wrap(WA, seeded());
  try {
    B.__reset();
    const html = render(WA);
    a(html.indexOf('sha-placeholder-never') < 0, 'D0: 占位字符串未泄');
    a(html.indexOf('wa-ens-line') > 0, 'D0b: 段内读数容器在真渲染里出现');
    a(html.indexOf('继承 default') > 0, 'D0c: 真渲染里看得到“继承 default”（seeded 下应有 2 条）');
    a((html.match(/id="wa-ens-line"/g) || []).length === 1, 'D2: wa-ens-line 全页只一次');
    a(html.indexOf('一次模型调用都不发') > 0, 'D5: 段内自己写明不发调用');
    // 段内不许有交互件：体检面不提供“跑一下”按钮（那就会花钱）
    const segStart2 = html.indexOf('仲裁面');
    const segHtml = html.slice(segStart2, segStart2 + 900);
    a(segHtml.indexOf('<button') < 0, 'D4: 段内没有按钮（没有“点一下跑一次”）');
  } finally { un(); }

  const toolsSrc2 = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const s2i = toolsSrc2.indexOf("foldSec('tools', 'ensemble'");
  // 到下一个 foldSec 为止（固定窗口会溢出到相邻段：旁段的按钮会被当成自己的）
  const s2e = toolsSrc2.indexOf("foldSec('tools', 'refine'", s2i);
  const segSrc = toolsSrc2.slice(s2i, s2e > s2i ? s2e : s2i + 4000);
  a(segSrc.indexOf('transact(') < 0 && segSrc.indexOf('setItem(') < 0 && segSrc.indexOf('.patch(') < 0,
    'D3: 段内 0 写口');
  a(segSrc.indexOf('<button') < 0, 'D4b: 源码级确认段内无按钮');

  const st = B.stat();
  a(st.reads > 0 && st.last && typeof st.last.why === 'string', 'D6: 本面账记到跑过（reads ' + st.reads + '）');
  a(st.last.why === 'no-runs' || st.last.why === 'no-channel-ready' || st.last.why === 'ok',
    'D6b: 末次体检的 why 是真实结论（实 ' + (st.last && st.last.why) + '）');
  a(st.views > 0, 'D6c: view 调过就有计数（' + st.views + '）');

  const runsBefore = (WA.ensemble.stat() || {}).runs || 0;
  B.__reset();
  a(B.stat().reads === 0, 'D7: __reset 清本面计数');
  a(((WA.ensemble.stat() || {}).runs || 0) === runsBefore, 'D7b: __reset 不动引擎的账（清别人账 = 造假）');

  return { exports: Object.keys(B).length, reads: B.stat().reads };
}

module.exports = { runAll: runAll };
