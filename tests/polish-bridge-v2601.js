#!/usr/bin/env node
// WorldAxis tests/polish-bridge-v2601.js — 润色通道归位表专锁（v2.601.0 / R276 PLS-1）
//
// 锁的是两句话：
//   ① 「润色到底用的是哪个模型？」—— 今天全库答不出，因为 `rewrite` 不在 apiRouter 的 CHANNELS 里，
//      `cfg[name] || cfg.default` 静默回落到了 default，而 polish 的注释写着「不回落别的通道」。
//   ② 「本表会不会自己变成又一个静默消费方？」—— 所以 A/B 两组都把「零跑 / 零写 / 不报密钥」
//      做成可执行的否定判据，而不是写在注释里的承诺。
//
// 三组：
//   A 静态：导出面 / why 五值 / verdict 八值 / 0 写口 / 不调 variants·pick·split /
//      名单现读 / 装载与面板同批登记 / 段内真委托。
//   B 行为：自造 apiRouter + settingsBus + polish —— 回落四态（fallback / own / empty-seg / none）/
//      参数三比三分家 / 夹取比对 / 七码含义与未登记码 / 三种不可用态 / 零跑零写实测。
//   C 现场：真渲染 / 段内 0 写口无按钮 / 参数分家表真的画出来了。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SECRET = 'SECRET-KEY-MUST-NOT-LEAK';
const BASE_URL = 'https://inner-net.example.ddns.net/v1';
const CH6 = ['default', 'inference', 'digest', 'judge', 'choices', 'observe'];
const BOUNDS = { count: [2, 5], temperature: [0, 100], maxTokens: [128, 4000], timeoutMs: [5000, 120000] };
const PDEF = { enabled: true, count: 3, temperature: 70, maxTokens: 800, timeoutMs: 30000 };

function clampBy(bounds, def, v) {
  const out = Object.assign({}, v);
  Object.keys(bounds).forEach(function (k) {
    const b = bounds[k];
    if (!b) return;
    let x = Number(out[k]);
    if (!isFinite(x)) x = def[k];
    if (x < b[0]) x = b[0];
    if (x > b[1]) x = b[1];
    out[k] = x;
  });
  return out;
}

/** 把 apiRouter / settingsBus / polish 三台换成本地壳；返回还原函数。 */
function stub(WA, o) {
  const cfg = o || {};
  const prev = { r: WA.apiRouter, s: WA.settingsBus, p: WA.polish, regs: WA.__settingsRegs };
  const store = cfg.store || { default: { baseUrl: BASE_URL, apiKey: SECRET, model: 'm-default', temperature: 0.8, maxTokens: 4000 } };
  const pset = Object.assign({}, PDEF, cfg.pset || {});
  const praw = Object.assign({}, pset, cfg.praw || {});
  const pstat = cfg.pstat || { runs: 0, produced: 0, failed: 0, blocked: 0, lastReason: '', faults: {} };
  const fired = { call: 0, save: 0, setChannel: 0, setSettings: 0 };
  const regs = [];

  if (cfg.withRouter === false) { WA.apiRouter = null; }
  else {
    WA.apiRouter = {
      CHANNELS: CH6.slice(),
      getChannel: function (n) {
        const c = store[n] || store.default || {};
        return {
          baseUrl: c.baseUrl || '', apiKey: c.apiKey || '', model: c.model || '',
          temperature: c.temperature != null ? c.temperature : 0.8,
          maxTokens: c.maxTokens || 4000,
          useTavernProxy: false
        };
      },
      setChannel: function () { fired.setChannel++; },
      call: function () { fired.call++; throw new Error('PLS-1 专锁：体检不该发模型请求'); }
    };
    regs.push({ key: 'worldaxis_api_channels_v1', def: {}, module: 'apiRouter' });
  }

  if (cfg.withBus === false) { WA.settingsBus = null; }
  else {
    WA.settingsBus = {
      read: function (reg) {
        if (!reg) return null;
        if (reg.module === 'apiRouter') return JSON.parse(JSON.stringify(store));
        if (reg.module === 'polish') return Object.assign({}, praw);
        return {};
      },
      normalize: function (reg, v) { return clampBy((reg && reg.bounds) || BOUNDS, (reg && reg.def) || PDEF, v || {}); },
      save: function () { fired.save++; return true; },
      saveOrThrow: function () { fired.save++; return { ok: true }; }
    };
    regs.push({ key: 'worldaxis_polish_settings_v1', def: PDEF, module: 'polish', bounds: BOUNDS });
  }
  WA.__settingsRegs = regs;

  if (cfg.withPolish === false) { WA.polish = null; }
  else {
    WA.polish = {
      CHANNEL: cfg.name || 'rewrite',
      getSettings: function () { return clampBy(BOUNDS, PDEF, praw); },
      setSettings: function () { fired.setSettings++; return { ok: true }; },
      variants: function () { throw new Error('PLS-1 专锁：体检不该调 variants'); },
      pick: function () { throw new Error('PLS-1 专锁：体检不该调 pick'); },
      split: function () { throw new Error('PLS-1 专锁：体检不该调 split'); },
      stat: function () { return Object.assign({}, pstat, { faults: Object.assign({}, pstat.faults) }); }
    };
  }

  return {
    fired: fired,
    restore: function () {
      WA.apiRouter = prev.r; WA.settingsBus = prev.s; WA.polish = prev.p; WA.__settingsRegs = prev.regs;
    }
  };
}

function esc(s) { return String(s == null ? '' : s); }
function render(WA) {
  WA.panelToolsPage.bind({
    esc: esc,
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA.polishBridge;
  a(!!B, 'A0b: WA.polishBridge 在位');
  a(!!WA.polish, 'A0c: 被读方 WA.polish 在位');
  if (!B) return { exports: 0 };
  if (typeof B.__reset === 'function') B.__reset();

  // ── A 静态 ────────────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'engines/polish-bridge.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  a(B.version === '2.601.0', 'A1: 版本 2.601.0（实 ' + B.version + '）');
  const EX = Object.keys(B).sort().join(',');
  a(EX === 'NAME,VERDICT,WHY,__reset,audit,clamp,diagnose,faults,known,lineOf,params,route,stat,summaryText,version',
    'A2: 恰好十五导出（实 ' + EX + '）');
  a(B.WHY.join(',') === 'ok,module-missing,no-router,off-list,drift', 'A3: why 五值（实 ' + B.WHY.join(',') + '）');
  a(B.VERDICT.length === 8 && B.VERDICT[0] === 'module-missing' && B.VERDICT[7] === 'channel-off-list-none',
    'A4: verdict 八值且两端在（实 ' + B.VERDICT.length + '）');
  a(code.indexOf('setSettings') < 0 && code.indexOf('setChannel') < 0 && code.indexOf('saveOrThrow') < 0
    && code.indexOf('transact(') < 0 && code.indexOf('setItem(') < 0 && code.indexOf('save(') < 0,
    'A5: 源码 0 处写口（不 setSettings / 不 setChannel / 不 save）');
  a(code.indexOf('variants(') < 0 && code.indexOf('.pick(') < 0 && code.indexOf('.split(') < 0,
    'A6: 源码不调 variants / pick / split（一次模型调用都不发，也不改 polish 的失败计数）');
  a(code.indexOf('apiKey:') < 0 && code.indexOf('baseUrl:') < 0,
    'A7: 源码里没把 apiKey / baseUrl 的值写成返回字段（只出布尔）');
  a(code.indexOf('.CHANNEL') >= 0, 'A8: 通道名现读 polish.CHANNEL（不自带一份）');
  a(code.indexOf('.CHANNELS') >= 0, 'A9: 名单现读 apiRouter.CHANNELS（不自带副本）');
  a(code.indexOf('__settingsRegs') >= 0, 'A9b: 登记项从自注册清单取（不硬编码 localStorage key）');

  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const REL = "'engines/polish-bridge.js'";
  a(idxSrc.split(REL).length - 1 === 1, 'A10: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf("'engines/polish.js'"), 'A10b: 排在 polish 之后');
  a(runSrc.split(REL).length - 1 === 1, 'A11: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split("'./polish-bridge-v2601.js'").length - 1 === 1, 'A11b: run.js 里挂了一次本专锁');
  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const segStart = toolsSrc.indexOf("foldSec('tools', 'polishroute'");
  a(segStart > 0, 'A12: 工具页有 polishroute 段');
  const segEnd = toolsSrc.indexOf("foldSec('tools', 'refine'", segStart);
  const seg = toolsSrc.slice(segStart, segEnd > segStart ? segEnd : segStart + 4000);
  a(seg.indexOf('pb.audit(') >= 0 && seg.indexOf('pb.summaryText(') >= 0 && seg.indexOf('pb.lineOf(') >= 0,
    'A12b: 段内真委托 audit + summaryText + lineOf');
  const foldSrc = fs.readFileSync(path.join(ROOT, 'ui/panel-fold.js'), 'utf8');
  a(foldSrc.indexOf("id: 'polishroute'") >= 0, 'A13: 面板折叠表**同批登记**');
  const diagSrc = fs.readFileSync(path.join(ROOT, 'engines/tool-diag-tables.js'), 'utf8');
  a(diagSrc.indexOf("'engines/polish-bridge.js': 'polishBridge'") >= 0, 'A14: tool-diag 登记了（缺席时报 missing 而非静默）');

  // ── B 行为 ────────────────────────────────────
  // B1–B3：默认形态 —— 名单没有 rewrite、盘上也无独立段 ⇒ 回落 default
  let st = stub(WA, {});
  try {
    const K = B.known();
    a(K.why === 'off-list' && K.known === false, 'B1: 名字在名单外 ⇒ off-list（实 ' + K.why + '）');
    a(K.list.join(',') === CH6.join(','), 'B1b: 名单原样报出六个（实 ' + K.list.join('/') + '）');
    const R1 = B.route();
    a(R1.via === 'fallback' && R1.fallbackTo === 'default', 'B2: 无独立段 ⇒ 回落 default（实 ' + R1.via + '）');
    a(R1.model === 'm-default', 'B2b: 模型取的是 default 的（实 ' + R1.model + '）');
    a(R1.sameAsDefault === true, 'B2c: 与 default 逐字同一份');
    a(R1.hasKey === true && R1.hasBaseUrl === true, 'B2d: 密钥与地址只报“有”（布尔）');
    const js1 = JSON.stringify(R1) + JSON.stringify(B.known()) + JSON.stringify(B.audit({}));
    a(js1.indexOf(SECRET) < 0, 'B3: 密钥一个字符都没泄漏');
    a(js1.indexOf('inner-net') < 0, 'B3b: baseUrl 也没泄漏（可能是内网地址，只报有没有）');
  } finally { st.restore(); }

  // B4：盘上有独立段 ⇒ own
  st = stub(WA, { store: {
    default: { baseUrl: BASE_URL, apiKey: SECRET, model: 'm-default' },
    rewrite: { baseUrl: 'https://cheap.example/v1', apiKey: 'k2', model: 'm-cheap' }
  } });
  try {
    const R2 = B.route();
    a(R2.via === 'own' && R2.seg === 'own', 'B4: 盘上有独立段 ⇒ own（实 ' + R2.via + '）');
    a(R2.model === 'm-cheap' && R2.sameAsDefault === false, 'B4b: 模型是它自己的，与 default 不同');
    a(B.audit({}).verdict === 'channel-off-list-own', 'B4c: verdict 报 off-list-own');
  } finally { st.restore(); }

  // B5：空段 —— 真值判定会**截断**回落，这是最容易被当成“没配”的一态
  st = stub(WA, { store: { default: { baseUrl: BASE_URL, apiKey: SECRET, model: 'm-default' }, rewrite: {} } });
  try {
    const R3 = B.route();
    a(R3.seg === 'empty' && R3.via === 'empty-seg', 'B5: 空段 ⇒ empty-seg（实 ' + R3.via + '）');
    a(R3.model === '', 'B5b: 空段截断了回落 ⇒ 拿不到任何模型');
    const A3 = B.audit({});
    a(A3.verdict === 'channel-off-list-empty', 'B5c: verdict 报 off-list-empty');
    a(B.lineOf(A3).indexOf('截断') > 0, 'B5d: 读数写明“截断”这个词');
  } finally { st.restore(); }

  // B6：连 default 都没内容
  st = stub(WA, { store: {} });
  try {
    const R4 = B.route();
    a(R4.via === 'none', 'B6: 两层都空 ⇒ none（实 ' + R4.via + '）');
    a(B.audit({}).verdict === 'channel-off-list-none', 'B6b: verdict 报 off-list-none');
  } finally { st.restore(); }

  // B7：参数三比三
  st = stub(WA, {});
  try {
    const P1 = B.params();
    a(P1.rows.length === 6, 'B7: 参数六行（实 ' + P1.rows.length + '）');
    a(P1.ownedByPolish === 3 && P1.ownedByChannel === 3, 'B7b: 本模块三项 / 通道三项');
    const row = function (k) { return P1.rows.filter(function (r) { return r.key === k; })[0]; };
    a(row('temperature').emit === 0.7, 'B8: 温度 70/100 = 0.7（实 ' + row('temperature').emit + '）');
    a(row('temperature').chan === 0.8 && row('temperature').overridden === true,
      'B8b: 覆盖了通道里的 0.8（overridden）');
    a(row('maxTokens').emit === 800 && row('maxTokens').overridden === true, 'B8c: 上限 800 覆盖通道 4000');
    a(row('timeoutMs').emit === 30000 && row('timeoutMs').router === 120000, 'B8d: 超时 30000 覆盖 router 缺省 120000');
    a(row('model').by === 'channel' && row('model').emit === null, 'B8e: 模型是通道给的，polish 不发');
    a(P1.notes.length === 3 && P1.notes[1].indexOf('||') > 0 && P1.notes[2].indexOf('!= null') > 0,
      'B9: 三条口径注释（含 || 与 != null 的判据不一致）');
  } finally { st.restore(); }

  // B10：夹取比对
  st = stub(WA, {});
  try {
    const C0 = B.clamp();
    a(C0.rows.length === 4 && C0.clampedCount === 0, 'B10: 四组边界，未超界时夹取 0（实 ' + C0.clampedCount + '）');
  } finally { st.restore(); }
  st = stub(WA, { praw: { maxTokens: 64 } });
  try {
    const C1 = B.clamp();
    const m = C1.rows.filter(function (r) { return r.key === 'maxTokens'; })[0];
    a(m.raw === 64 && m.eff === 128 && m.clamped === true, 'B11: 盘上 64 ⇒ 生效 128（夹到下限）');
    a(C1.clampedCount === 1, 'B11b: 夹取计数 1');
  } finally { st.restore(); }

  // B12：失败码
  const F7 = { 'empty-text': 1, 'disabled': 2, 'no-channel': 0, 'api-fail': 3, 'empty-response': 1, 'bad-type': 1, 'not-found': 2, 'zzz-new': 1 };
  st = stub(WA, { pstat: { runs: 4, produced: 9, failed: 2, blocked: 10, lastReason: 'produced', faults: F7 } });
  try {
    const F = B.faults();
    a(F.codes.length === 8, 'B12: 八类码原样报出（实 ' + F.codes.length + '）');
    a(F.codes[0].code === 'api-fail', 'B12b: 按次数降序（api-fail 3 次在最前）');
    a(F.codes.filter(function (c) { return c.code === 'not-found'; })[0].means.indexOf('越界') > 0,
      'B12c: 每个码带用户可见含义');
    a(F.unregistered.join(',') === 'zzz-new', 'B12d: 表外码进 unregistered（表自己过时了会被读出来）');
    a(F.runs === 4 && F.produced === 9 && F.blocked === 10, 'B12e: 五个计数原样透传');
  } finally { st.restore(); }

  // B13：合成与 ok 语义
  st = stub(WA, {});
  try {
    const A1 = B.audit({});
    a(A1.verdict === 'channel-off-list-fallback', 'B13: 现场形态 ⇒ off-list-fallback（实 ' + A1.verdict + '）');
    a(A1.ok === false, 'B13b: ok=false 是如实读数（名单外就是没归位），不是抛错');
    a(A1.line.indexOf('参数（温度/上限/超时）是自己的，连接（地址/密钥/模型）是 default 的') > 0,
      'B13c: 一句话说清“参数自己的、连接别人的”');
    a(A1.text.indexOf('零跑零写') > 0, 'B13d: 摘要里写明零跑零写');
  } finally { st.restore(); }

  // B14：名字进名单 ⇒ channel-ok
  st = stub(WA, { name: 'inference' });
  try {
    const A2 = B.audit({});
    a(A2.verdict === 'channel-ok' && A2.ok === true, 'B14: 名字在名单内 ⇒ channel-ok 且 ok（实 ' + A2.verdict + '）');
  } finally { st.restore(); }

  // B15：名字漂移
  st = stub(WA, { name: 'rewrite2' });
  try {
    const A3 = B.audit({});
    a(A3.why === 'drift' && A3.verdict === 'drift', 'B15: 既不在名单又不是 rewrite ⇒ drift');
    a(B.lineOf(A3).indexOf('拒绝硬算') > 0, 'B15b: 读数说清为何不硬算');
  } finally { st.restore(); }

  // B16/B17：两个装载缺失态
  st = stub(WA, { withPolish: false });
  try {
    a(B.audit({}).why === 'module-missing', 'B16: polish 不在 ⇒ module-missing');
    a(B.lineOf(B.audit({})).indexOf('通道归位无从判断') > 0, 'B16b: 读数如实说无从判断');
  } finally { st.restore(); }
  st = stub(WA, { withRouter: false });
  try {
    a(B.audit({}).why === 'no-router', 'B17: apiRouter 不在 ⇒ no-router');
    a(B.audit({}).verdict === 'no-router', 'B17b: verdict 也是 no-router');
  } finally { st.restore(); }

  // B18：零跑零写实测
  const pst = { runs: 5, produced: 12, failed: 3, blocked: 20, lastReason: 'produced', faults: { 'api-fail': 3, 'empty-text': 2 } };
  st = stub(WA, { pstat: pst });
  try {
    const before = JSON.stringify(WA.polish.stat());
    const h = B.audit({});
    B.known(); B.route(); B.params(); B.clamp(); B.faults(); B.diagnose({}); B.summaryText(h); B.lineOf(h);
    const after = JSON.stringify(WA.polish.stat());
    a(before === after, 'B18: 零跑 —— 调用前后 polish.stat() 逐字相等（含 faults 字典）');
    a(st.fired.call === 0, 'B18b: apiRouter.call 一次都没被调（探针计数 0）');
    a(st.fired.save === 0 && st.fired.setSettings === 0 && st.fired.setChannel === 0,
      'B18c: 零写 —— save / setSettings / setChannel 全 0');
  } finally { st.restore(); }

  // B19：本面账
  st = stub(WA, {});
  try {
    B.__reset();
    B.audit({}); B.audit({});
    const s1 = B.stat();
    a(s1.audits === 2, 'B19: 本面账记到跑过两次（实 ' + s1.audits + '）');
    a(s1.last && s1.last.verdict === 'channel-off-list-fallback', 'B19b: 末次体检记下了 verdict');
    a(s1.reads >= 8, 'B19c: 读面计数一并记（实 ' + s1.reads + '）');
    B.__reset();
    const s2 = B.stat();
    a(s2.audits === 0 && s2.reads === 0 && s2.last.verdict === '', 'B20: __reset 清本面计数');
  } finally { st.restore(); }

  // B21：诊断单
  st = stub(WA, {});
  try {
    const dg = B.diagnose({});
    a(dg.counts.params === 6 && dg.counts.clamp === 4, 'B21: 诊断计数 6 / 4（实 ' + dg.counts.params + ' / ' + dg.counts.clamp + '）');
    a(dg.counts.faults === 0, 'B21b: 未跑过的现场失败码 0 类（不是“没有失败码”这个表）');
  } finally { st.restore(); }

  // ── C 现场 ────────────────────────────────────
  st = stub(WA, {});
  let html = '';
  try {
    B.__reset();
    html = render(WA);
    a(html.indexOf('wa-pls-line') > 0, 'C0: 段内读数容器在真渲染里出现');
    a((html.match(/id="wa-pls-line"/g) || []).length === 1, 'C0b: wa-pls-line 全页只一次');
    a(html.indexOf('本模块发') > 0 && html.indexOf('通道给') > 0, 'C0c: 参数分家表真画出来了（两栏都在）');
    const bi = html.indexOf('润色通道归位');
    const be = html.indexOf('本面只量', bi);
    const btn = html.indexOf('<button', bi);
    a(be > bi, 'C1: 段有收尾声明（用它当段边界）');
    a(be > bi && (btn < 0 || btn > be), 'C2: 段内没有按钮');
    a(html.indexOf('一次模型调用都不发') > 0, 'C3: 段内自己写明不发请求');
  } finally { st.restore(); }

  const toolsSrc2 = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const s2i = toolsSrc2.indexOf("foldSec('tools', 'polishroute'");
  const s2e = toolsSrc2.indexOf("foldSec('tools', 'refine'", s2i);
  const segSrc = toolsSrc2.slice(s2i, s2e > s2i ? s2e : s2i + 4000);
  // 判据看「调用形态」（带点前缀），不看字样 —— 段里的收尾语会点名不碰哪些函数，
  //   那是说明而不是调用。只看裸字样会把说明误判成写口（本仓栽过这种「判据读文案」）。
  a(segSrc.indexOf('.setSettings(') < 0 && segSrc.indexOf('.setChannel(') < 0
    && segSrc.indexOf('transact(') < 0 && segSrc.indexOf('setItem(') < 0, 'C4: 段内 0 写口');
  a(segSrc.indexOf('.variants(') < 0, 'C4b: 段内不调 variants（不然一展开面板就烧 token）');
  a(segSrc.indexOf('__plsEnsureFail') >= 0, 'C5: 段内有装载失败记忆（不把装不上说成“没问题”）');

  const st2 = B.stat();
  a(st2.audits > 0, 'C6: 本面账记到真渲染跑过（audits ' + st2.audits + '）');

  return { exports: Object.keys(B).length, verdicts: B.VERDICT.length };
}

module.exports = { runAll: runAll };
