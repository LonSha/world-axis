#!/usr/bin/env node
// WorldAxis tests/o9-outlet-gate-v2186.js — 全知出口闸专锁（v2.186.0，计划 O9）
//
// 【它治的病】视角锁自 v2.142.0 管**叙事视角**，v2.149.0 起把「面板给谁看」做成了观测视角，
//   并在**重绘出口**对 DOM 做过滤（摘除 `data-omniscient` 节点）。而面板上真正把世界信息
//   交给外面的六条通道 —— 复制运行日志 / 复制错误报告 / 复制内存审计 / 复制配置包 /
//   复制番外 / 复制记忆采样 / 导出全量快照 / 导出诊断包 —— **本来就不在被摘除的容器里**：
//   按钮挂在 DOM 上、点一下照样交出去；日志页此前更是整页没有标记。
//   病灶不是「某条通道写错了」，而是「**不进 DOM 被当成了不泄漏**」：判定在 DOM 面，
//   而出口根本不过 DOM。
//
// 【本版两条治面（互补，各治一条泄漏面）】
//   ① 引擎面：`perspective.outletAllowed(channel)` —— 三条登记通道（clipboard / export-file /
//      diagnostics）的显式权限判定；玩家视角下拦下并计数（blockedByView），表外通道名拒收。
//   ② 面板面：`outletGate()` 成为**唯一**出口入口，八处调用点全部接上；
//      日志页整页打 `data-omniscient`（与 events/tools 页的标记同一口径）。
//
// 【判据四层】
//   A 结构面（纯静态，任何机器都必须全绿）：通道闭集 / 闸在位 / 调用点计数 / 整页标记 / 无绝对路径。
//   B 行为面（mini-DOM，毫秒级）：闸三态（关=放行 / 玩家=拦下并计数 / 表外=拒收带 allowed）。
//   C 实机面（真浏览器 + 真控件）：玩家视角下 11 个控制点**不在 DOM**、全知下全部在场（两向）；
//     玩家视角下点出口控件 ⇒ **剪贴板零写入、导出零调用**，切回全知 ⇒ 两半都真发生
//     （只判「拦住了」的话，把闸写成恒拒也会绿 —— 故「允许」那一半必须同批取证）。
//   D 负控制（真源码内存副本破坏，两向自证）：破坏引擎闸 / 破坏面板接线 ⇒ C 面判据现形。
//
// 【宿主纪律】A/B 面在进程内（mini-DOM）；C/D 面在真浏览器里（runLive）。破坏只改内存副本。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const gate = require('./ui-gate-sync.js');
const LIVE = require('./ui-live.js');
const REL_ENG = 'engines/perspective-lock.js';
const REL_PANEL = 'ui/panel.js';
const REL_LIVE = 'tests/ui-live.js';

function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }

/** 面板八条出口调用点的锚点（每条在真源码里必须恰中 1 次 —— 少一处就是「有一条出口没接闸」）。 */
const OUTLETS = [
  { tag: 'clipboard:日志', needle: "on('#wa-log-copy', () => { const __gl = outletGate('clipboard')" },
  { tag: 'clipboard:错误报告', needle: "on('#wa-err-report', () => { const __ge = outletGate('clipboard')" },
  { tag: 'clipboard:内存审计', needle: "on('#wa-audit-copy', () => { const __ga = outletGate('clipboard')" },
  { tag: 'clipboard:配置包', needle: "const __gc = outletGate('clipboard')" },
  { tag: 'clipboard:番外', needle: "const __gt = outletGate('clipboard')" },
  { tag: 'clipboard:记忆采样', needle: "const __gs = outletGate('clipboard')" },
  { tag: 'export-file:快照', needle: "outletGate('export-file')" },
  { tag: 'diagnostics:诊断包', needle: "outletGate('diagnostics')" },
];
/** C 面控制点：每个 TX 模块「开关键」所在的容器都必须随观测视角摘除。 */
const CONTROL_KEYS = ['dp', 'ag', 'fr', 'sc', 'cm', 'af', 'ops', 'bp', 'ws', 'pbl', 'ck'];

/** C/D 面共用的页内探针：一次跑完「玩家视角拦下」与「全知视角放行」两半。 */
function probeSource() {
  return [
    '(function () {',
    '  var WA = window.WorldAxis;',
    '  var doc = WA.mainDoc || document;',
    '  var R = { dom: {}, outlets: {}, clipErr: null };',
    '  window.__waClip = [];',
    '  try { Object.defineProperty(navigator, "clipboard", { configurable: true,',
    '    value: { writeText: function (t) { window.__waClip.push(String(t).slice(0, 40)); return Promise.resolve(); } } }); }',
    '  catch (e) { R.clipErr = String((e && e.message) || e); }',
    '  var dl = 0;',
    '  if (WA.toolSnapshot && typeof WA.toolSnapshot.download === "function") {',
    '    WA.toolSnapshot.download = function () { dl++; return { ok: true, bytes: 1 }; };',
    '  }',
    '  var q = function (s) { return doc.querySelector(s); };',
    '  var goPage = function (p) { var t = q(".wa-tab[data-page=\\"" + p + "\\"]"); if (t) t.click(); };',
    '  var keys = CONTROL_KEYS_PLACEHOLDER;',
    '  var scan = function (view) {',
    '    WA.perspective.setSettings({ enabled: true });',
    '    WA.perspective.setView(view);',
    '    var live = [], gone = [];',
    '    keys.forEach(function (k) {',
    '      var found = false;',
    '      WA.ui.pages().forEach(function (p) {',
    '        goPage(p);',
    '        var b = q(".wa-body");',
    '        if (b && b.querySelector("#wa-" + k + "-enabled")) found = true;',
    '      });',
    '      (found ? live : gone).push(k);',
    '    });',
    '    var bb = q(".wa-body");',
    '    return { live: live, gone: gone, hasLogCopy: !!(bb && bb.querySelector("#wa-log-copy")) };',
    '  };',
    '  R.dom.player = scan("player");',
    '  R.dom.omni = scan("omniscient");',
    '  R.dom.viewFiltered = WA.perspective.stat().viewFiltered;',
    '  // 出口面：全知下先渲染（控件在 DOM）→ 再切档**不重绘** ⇒ 点击落在「DOM 还没跟上」的窗口期。',
    '  //   这不是造作的场景：它正是出口闸存在的理由（DOM 过滤只在重绘时生效，而调用随时能发生）。',
    '  var outletTrip = function (page, sel, view) {',
    '    WA.perspective.setSettings({ enabled: true });',
    '    WA.perspective.setView("omniscient");',
    '    goPage(page);',
    '    var b = q(".wa-body");',
    '    var btn = b ? b.querySelector(sel) : null;',
    '    if (!btn) return { missing: sel };',
    '    WA.perspective.setView(view);',
    '    var c0 = window.__waClip.length, d0 = dl;',
    '    var s0 = Object.assign({}, WA.perspective.stat().blockedByView);',
    '    btn.click();',
    '    var s1 = Object.assign({}, WA.perspective.stat().blockedByView);',
    '    var delta = {};',
    '    Object.keys(s1).forEach(function (k) { var d = (s1[k] || 0) - (s0[k] || 0); if (d) delta[k] = d; });',
    '    var outEl = q("#wa-snap-out");',
    '    return { gone: !b.querySelector(sel), clipWrites: window.__waClip.length - c0, dlCalls: dl - d0,',
    '      blockedDelta: delta, snapOut: outEl ? outEl.textContent : null };',
    '  };',
    '  R.outlets.playerLog = outletTrip("logs", "#wa-log-copy", "player");',
    '  R.outlets.playerSnap = outletTrip("tools", "#wa-snap-dl", "player");',
    '  R.outlets.omniLog = outletTrip("logs", "#wa-log-copy", "omniscient");',
    '  R.outlets.omniSnap = outletTrip("tools", "#wa-snap-dl", "omniscient");',
    '  WA.perspective.setView("omniscient");',
    '  return R;',
    '})()'
  ].join('\n').replace('CONTROL_KEYS_PLACEHOLDER', JSON.stringify(CONTROL_KEYS));
}
// ── A 结构面 ─────────────────────────────────────────────────────────────
function runA(a) {
  const eng = read(REL_ENG), pn = read(REL_PANEL), live = read(REL_LIVE);
  // A1 通道闭集（三条登记通道）+ 闸导出
  a(eng.indexOf("const EXPORT_CHANNELS = ['clipboard', 'export-file', 'diagnostics'];") >= 0,
    'A1 通道闭集三档（clipboard / export-file / diagnostics）单点声明');
  a(cnt(eng, 'function outletAllowed(channel)') === 1, 'A1 outletAllowed 定义恰 1 处（实 '
    + cnt(eng, 'function outletAllowed(channel)') + '）');
  a(eng.indexOf('EXPORT_CHANNELS.indexOf(ch) < 0') >= 0 && eng.indexOf("reason: 'bad-value', field: 'channel'") >= 0,
    'A1 表外通道名拒收且带 allowedChannels（自造通道 = 自造判定）');
  a(eng.indexOf('CHANNELS: EXPORT_CHANNELS.slice(),') >= 0 && eng.indexOf('outletAllowed: outletAllowed,') >= 0,
    'A1 导出面含 CHANNELS / outletAllowed（消费方问得到）');
  a(eng.indexOf('blockedByView[ch] = (blockedByView[ch] || 0) + 1;') >= 0
    && eng.indexOf('blockedByView: Object.assign({}, blockedByView)') >= 0,
    'A1 拦下必须**可数**（blockedByView 计数并进 stat，不是静默 return false）');
  a(eng.indexOf("isPlayerView: isPlayerView") < 0,
    'A1 不导出 isPlayerView（内部判据零消费方 —— 过度导出是同一类病）');
  // A2 面板唯一入口：模块缺席放行（只补权限，不制造新停摆点）
  a(cnt(pn, 'const outletGate = function (channel)') === 1, 'A2 面板 outletGate 恰 1 处');
  a(pn.indexOf("if (!WA.perspective || typeof WA.perspective.outletAllowed !== 'function') return { allowed: true, reason: 'module-missing' }") >= 0,
    'A2 模块缺席时**放行**（不在旧版本/装载失败上制造新停摆点）');
  a(pn.indexOf('已阻止：当前为玩家视角（全知数据不进剪贴板/导出）') >= 0,
    'A2 被拒话术给出**可执行的下一步**（切到全知），不是只说「不行」');
  // A3 八条出口调用点全部接闸
  let miss = [];
  OUTLETS.forEach(function (o) {
    const n = cnt(pn, o.needle);
    if (n !== 1) miss.push(o.tag + '×' + n);
  });
  a(miss.length === 0, 'A3 八条出口调用点各接一次闸（缺/多即报：' + (miss.join(' / ') || '无') + '）');
  a(cnt(pn, 'outletGate(') === OUTLETS.length + 1,
    'A3 outletGate 调用点恰 ' + (OUTLETS.length + 1) + ' 处（八条出口 + 视角回执读档；实 '
      + cnt(pn, 'outletGate(') + '）');
  // A4 整页标记：日志页 + TX 控制点所在容器
  a(cnt(pn, 'return `<div data-omniscient><div class="wa-sec">${label}</div>') === 1,
    'A4 日志页整页标记 data-omniscient（此前整页无标记：全知诊断面直接摊在玩家视角下）');
  const marked = cnt(pn, 'data-omniscient><div class="wa-row"><label class="wa-row">')
    + cnt(pn, "data-omniscient>' + '<div class=\"wa-row\">") + cnt(pn, "return '<div data-omniscient><div");
  a(marked >= 6, 'A4 TX 模块区块标记在场（实 ' + marked + ' 处起——标记是**容器级**，'
    + '不用逐控件标 60 次：逐控件标记的失效模式是「新增控件忘了标」）');
  a(cnt(pn, '<div data-omniscient>' + '\n' + '      <div class="wa-sec">势力外交（成对事实）</div>') === 1,
    'A4 外交区块（事件页）整段标记恰 1 处');
  // A5 新接缝同源（C 面靠它把页内运行态带出来）
  a(live.indexOf('opts.probeSource') > 0 && live.indexOf('out.probe = ') > 0,
    'A5 实机通道的页内探针接缝在位（O1/O9 共用：两者判的都是页内运行态）');
  // A6 宿主纪律：不写死绝对路径
  const bad = read(REL_LIVE).split('\n').filter(function (l) {
    return /['"]\/[A-Za-z]/.test(l) && l.indexOf('http') < 0 && l.indexOf('//') !== 0;
  });
  const badSelf = read('tests/o9-outlet-gate-v2186.js').split('\n').filter(function (l) {
    return /['"]\/[A-Za-z]/.test(l) && l.indexOf('http') < 0 && l.indexOf('//') !== 0
      && l.indexOf('REL_') < 0 && l.indexOf('process.chdir') < 0 && l.indexOf('fs.') < 0;
  });
  a(bad.length === 0, 'A6 通道无绝对路径字面量（实 ' + bad.length + '）');
  a(badSelf.length === 0, 'A6 本锁无绝对路径字面量（实 ' + badSelf.length + '）');
}

// ── B 行为面（mini-DOM）─────────────────────────────────────────────────
function runB(a) {
  const WA = gate.fresh({}).WA;
  const P = WA.perspective;
  a(!!P && typeof P.outletAllowed === 'function', 'B0 装载面：perspective.outletAllowed 在场');
  if (!P) return;
  const chs = P.CHANNELS;
  a(Array.isArray(chs) && chs.length === 3 && chs.indexOf('clipboard') >= 0
    && chs.indexOf('export-file') >= 0 && chs.indexOf('diagnostics') >= 0,
    'B1 通道闭集三档（实 [' + (chs || []).join(',') + ']）');
  // 关着（模块未启用）：放行 —— 「关掉视角锁」不该变成「连日志都复制不了」
  P.setSettings({ enabled: false });
  const off = P.outletAllowed('clipboard');
  a(off.ok === true && off.allowed === true && off.reason === 'module-disabled',
    'B2 模块关 ⇒ 放行（reason=module-disabled，实 ' + JSON.stringify(off.reason) + '）');
  // 玩家视角：拦下 + 计数
  P.setSettings({ enabled: true });
  P.setView('omniscient');
  const before = P.stat().blockedByView.clipboard || 0;
  P.setView('player');
  const blocked = P.outletAllowed('clipboard');
  const after = P.stat().blockedByView.clipboard || 0;
  a(blocked.allowed === false && blocked.ok === true && blocked.reason === 'player-view' && blocked.channel === 'clipboard',
    'B3 玩家视角 ⇒ 拦下（allowed:false / reason:player-view，实 ' + JSON.stringify(blocked.reason) + '）');
  a(after === before + 1, 'B3 拦下**可数**（blockedByView.clipboard ' + before + ' → ' + after + '）');
  // 余额：全局视角放行
  P.setView('omniscient');
  const om = P.outletAllowed('export-file');
  a(om.allowed === true && om.reason === 'omniscient',
    'B4 全局视角 ⇒ 放行（reason=omniscient）—— 只判「拦住了」会让恒拒也绿');
  // 表外通道：拒收并带 allowed（不是「拦下玩家」那一档，两件事必须分开）
  const bad = P.outletAllowed('telepathy');
  a(bad.ok === false && bad.reason === 'bad-value' && Array.isArray(bad.allowedChannels) && bad.allowedChannels.length === 3,
    'B5 表外通道 ⇒ 拒收带 allowedChannels（bad-value 与 player-view 不同形）');
  a(P.stat().blockedByView.telepathy === undefined, 'B5 表外通道**不计入** blockedByView（没拦过就不该有账）');
  const bad2 = P.outletAllowed(null);
  a(bad2.ok === false && bad2.reason === 'bad-value', 'B5 null 通道同样拒收（不静默当「没通道」放行）');
  P.setView('omniscient');
  P.setSettings({ enabled: false });
}

// ── C/D 面（真浏览器）────────────────────────────────────────────────────
function makeOv(rel, body) { const ov = {}; ov[rel] = body; return ov; }

async function runLive2(a) {
  const L = LIVE;
  const p = L.probe();
  if (p.tier !== 'full') {
    a(true, 'C/D 跳过：实机通道为 ' + p.tier + '（' + p.why + '）—— 降档如实报出，不伪装成通过');
    return;
  }
  // ── C 原版（两向同批取证）──
  const r = await L.runLive({ probeSource: probeSource() });
  a(r.tier === 'full' && r.failedLoad.length === 0 && r.loaded === r.files,
    'C0 实机装载干净（' + r.loaded + '/' + r.files + '，0 失败）');
  const P = r.probe || {};
  const pl = P.dom && P.dom.player, om = P.dom && P.dom.omni;
  a(!!pl && !!om, 'C0 页内探针返回两态 DOM 读数（实 ' + JSON.stringify(Object.keys(P)) + '）');
  if (!pl || !om) { a(false, 'C0 探针读数缺失，后续判据无从谈起'); return; }
  a(P.clipErr === null, 'C0 剪贴板替身装得上（实 ' + P.clipErr + '）—— 装不上则整层判据失真');
  // C1 DOM 面：控制点两向（摘除只在**重绘出口**生效 ⇒ 这一层管「看得见」）
  a(pl.gone.length === CONTROL_KEYS.length && pl.live.length === 0,
    'C1（正向）玩家视角下 ' + CONTROL_KEYS.length + ' 个控制点**全不在 DOM**（实 gone='
      + pl.gone.length + ' live=' + pl.live.length + '）');
  a(om.live.length === CONTROL_KEYS.length && om.gone.length === 0,
    'C1（反向）全知视角下全部在场（实 live=' + om.live.length + '）—— 非「恒摘除」');
  a(P.dom.viewFiltered > 0, 'C1 摘除计数落账（viewFiltered=' + P.dom.viewFiltered + '）');
  a(pl.hasLogCopy === false && om.hasLogCopy === true,
    'C1 日志页整页跟随视角（玩家 ' + pl.hasLogCopy + ' / 全知 ' + om.hasLogCopy + '）');
  // C2 出口面（玩家视角拦下）：受测控件**点击时仍在 DOM**（窗口期）—— 否则测的是「点不到」不是「闸」
  const O = P.outlets || {};
  const plLog = O.playerLog, plSnap = O.playerSnap, omLog = O.omniLog, omSnap = O.omniSnap;
  a(!!(plLog && plSnap && omLog && omSnap), 'C2 四条出口读数齐（实 ' + JSON.stringify(Object.keys(O)) + '）');
  if (!(plLog && plSnap && omLog && omSnap)) { a(false, 'C2 出口读数缺失，C2/C3 无从谈起'); return; }
  a(plLog.gone === false && plSnap.gone === false,
    'C2 受测控件**点击时仍在 DOM**（gone=' + plLog.gone + '/' + plSnap.gone
      + '）—— 走的是「DOM 还没跟上」的窗口期，不是「被摘后点了个空」');
  a(plLog.clipWrites === 0, 'C2（正向）玩家视角下点「复制运行日志」⇒ 剪贴板**零写入**（实 '
    + plLog.clipWrites + '）');
  a(plSnap.dlCalls === 0, 'C2（正向）玩家视角下点「导出 JSON」⇒ 导出函数**零调用**（实 ' + plSnap.dlCalls + '）');
  a(String(plSnap.snapOut || '').indexOf('已阻止') >= 0,
    'C2 被拒时读数行给出可执行的下一步（实 ' + JSON.stringify(String(plSnap.snapOut || '').slice(0, 48)) + '）');
  a((plLog.blockedDelta.clipboard || 0) === 1 && (plSnap.blockedDelta['export-file'] || 0) === 1,
    'C2 两条通道各落一次账（实 ' + JSON.stringify(plLog.blockedDelta) + ' / '
      + JSON.stringify(plSnap.blockedDelta) + '）');
  // C3 允许那一半：同一控件在全知视角下必须**真发生**（否则把闸写成恒拒也会绿）
  a(omLog.clipWrites >= 1, 'C3（反向）全知视角下同一控件**真写入剪贴板**（实 ' + omLog.clipWrites
    + '）—— 「拦住了」与「根本不会写」必须分得开');
  a(omSnap.dlCalls >= 1, 'C3（反向）全知视角下导出函数真被调用（实 ' + omSnap.dlCalls + '）');
  a(r.thrown.length === 0, 'C3 全程零控件抛出（实 ' + r.thrown.length + '）');

  // ── D 负控制：真源码破坏 → 同款判据现形 ──
  // D1 破坏引擎闸：把「玩家视角」那一支改成死支 ⇒ C2 必须现形（剪贴板真被写）
  {
    const eng = read(REL_ENG);
    const anchor = '    if (isPlayerView()) {';
    a(cnt(eng, anchor) === 1, 'D1 破坏锚点（闸内玩家分支）恰中 1 次（实 ' + cnt(eng, anchor) + '）');
    const broken = eng.replace(anchor, '    if (false) {');
    a(broken !== eng && cnt(broken, anchor) === 0, 'D1 破坏确实改到源码（副本与原件不同）');
    const rr = await L.runLive({ srcOverride: makeOv(REL_ENG, broken), probeSource: probeSource() });
    if (rr.tier !== 'full') { a(true, 'D1 跳过：档位 ' + rr.tier); }
    else {
      const oo1 = (rr.probe && rr.probe.outlets) || {};
      a(!!oo1.playerLog && !!oo1.playerSnap && oo1.playerLog.clipWrites >= 1 && oo1.playerSnap.dlCalls >= 1,
        'D1（正向）引擎闸被破坏 ⇒ 玩家视角下**两条出口都真发生**（剪贴板 '
          + (oo1.playerLog ? oo1.playerLog.clipWrites : 'null') + ' 次 / 导出 '
          + (oo1.playerSnap ? oo1.playerSnap.dlCalls : 'null') + ' 次）—— C2 的绿灯来自闸本身');
    }
  }
  // D2 破坏面板接线：把日志复制那一处的闸拆掉 ⇒ C2 现形（接线才是承重件）
  {
    const pn = read(REL_PANEL);
    const anchor = "const __gl = outletGate('clipboard');";
    a(cnt(pn, anchor) === 1, 'D2 破坏锚点（日志出口的闸）恰中 1 次（实 ' + cnt(pn, anchor) + '）');
    const broken = pn.replace(anchor, 'const __gl = { allowed: true };');
    a(broken !== pn && cnt(broken, anchor) === 0, 'D2 破坏确实改到源码');
    const rr = await L.runLive({ srcOverride: makeOv(REL_PANEL, broken), probeSource: probeSource() });
    if (rr.tier !== 'full') { a(true, 'D2 跳过：档位 ' + rr.tier); }
    else {
      const oo2 = (rr.probe && rr.probe.outlets) || {};
      a(!!oo2.playerLog && oo2.playerLog.clipWrites >= 1,
        'D2（正向）面板接线被拆 ⇒ 该出口在玩家视角下真发生（剪贴板 '
          + (oo2.playerLog ? oo2.playerLog.clipWrites : 'null') + ' 次）—— 承重的是八条调用点的接线');
      a(!!oo2.playerSnap && oo2.playerSnap.dlCalls === 0,
        'D2（对照）同一轮里**没被拆的**那条出口仍拦得住（导出 '
          + (oo2.playerSnap ? oo2.playerSnap.dlCalls : 'null') + ' 次）—— 红来自那一处接线，不是整层失效');
      a(rr.failedLoad.length === 0, 'D2 破坏副本仍装载干净（破坏落在运行态，不是装载期）');
    }
  }
}

/** 方法级 CLI：`--methods=runA,runB,runLive2`（不传 = 全跑，与旧行为逐字相同）。 */
function pickMethods(argv) {
  const hit = argv.filter(function (x) { return x.indexOf('--methods=') === 0; })[0];
  if (!hit) return null;
  return hit.slice('--methods='.length).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}
async function main() {
  const staticOnly = process.argv.indexOf('--static') >= 0;
  const picks = pickMethods(process.argv);
  const want = function (n) { return picks === null || picks.indexOf(n) >= 0; };
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  const p = LIVE.probe();
  if (want('runA')) { try { runA(a); } catch (e) { fail++; console.log('  x A threw: ' + (e && e.stack)); } }
  if (want('runB')) { try { runB(a); } catch (e) { fail++; console.log('  x B threw: ' + (e && e.stack)); } }
  if (!staticOnly && want('runLive2')) {
    try { await runLive2(a); } catch (e) { fail++; console.log('  x C/D threw: ' + (e && e.stack)); }
  }
  console.log('O9-OUTLET-V2186: tier=' + p.tier + '（' + p.why + '）' + (staticOnly ? ' [--static]' : '')
    + ' —— ' + (fail ? 'FAIL ' + fail : 'pass') + ' / ' + (pass + fail) + (fail ? '' : ' 项全绿'));
  if (fail) process.exit(1);
}
if (require.main === module) {
  main().catch(function (e) { console.error('O9-OUTLET 运行器异常: ', e && e.stack); process.exit(2); });
}
module.exports = { runA: runA, runB: runB, OUTLETS: OUTLETS, CONTROL_KEYS: CONTROL_KEYS };