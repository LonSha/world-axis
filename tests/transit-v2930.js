#!/usr/bin/env node
// WorldAxis tests/transit-v2930.js —— v2.93.0（X4 天气封锁联动：三层通行判定）
//
// 【它治的病：世界只有「到得了吗」一个答案】
//   engines/world.js 的 reach() 只回答「路通不通」，engines/weather.js 的 effect()
//   只回答「耗时乘几」。两者从不交谈，于是下面这句话在状态里**无法表达**：
//       「暴风雪封了乙镇——人过不去、货过不去，但口信送到了」
//   而比「无法表达」更坏的是**合并**：常见做法把封路折进 reachable:false，
//   于是「天气封住」与「本来就没路」长得一模一样——而这两件事的补救完全不同
//   （等天晴 vs 修路）。本锁钉的正是这一分：三层的否定理由必须各自可读。
//
// 【口径三条】
//   ① **封锁必须由一个显式事实承当**：没登记天气的地方不回落成晴，但也不因此被
//      当成封锁（封锁是有代价的断言，不能由「我不知道」推出来）。
//   ② **三层分列**：人可到 / 物可到 / 消息可到各自作答。封锁表本版固化——
//      storm 与 snow 封路（人/物不可，消息可），其余天气只减速（factor 照实报出）。
//   ③ **归因分开**：被封报 weather-blocked 并带上地点与天气名；没路报 unreachable；
//      通道不在封闭集合报 bad-channel；世界或天气模块关着报 disabled。合成一个
//      「不行」就再也答不出是哪一层断的、以及断了要不要等天晴。
//
// 【判据】（A 静态 / B 运行时 / C 不变式与诚实降级 / N 负控制）
//   A1 三层集合与封锁表在真源码、且在 WA.world 导出对象里。
//   A2 接线两面：诊断 secWorld 三读数 + 面板控件/绑定/守卫登记；措辞分身。
//   A3 观测纯读：诊断节**不得**调 transit（它会增 stat 计数，观测不得改变被观测对象）。
//   B1 三层分辨率：同一对起终点、同一实例内，storm 下 person/goods 不可而 message 可。
//   B2 封锁归因带地点/天气名/路径；且与「没路」分开（同一条判据两向都问）。
//   B3 只减速的天气不封路：factor 照实报出（从 weather.FACTOR 读，不抄表）。
//   B4 未登记天气 ⇒ missing，且据此**不封锁**（不回落成晴，也不回落成封锁）。
//   B5 天气模块关着 ⇒ weatherReason disabled，且不封锁（关闭不是「天气很差」）。
//   B6 未知通道 ⇒ bad-channel，并列出合法通道（与导出集合逐元素相同）。
//   B7 计数分列：成功进 transits[ch]、被封进 blocks[ch]，两者不混。
//   B8 诊断面真消费：collect().world.* 与 stat() 同源；且 collect 前后计数不变。
//   B9 面板面真消费：按钮与通道输入成对、点击后读数落在输出节点上，
//      且「被封」与「不达」**分列措辞**（不得合成一句「不行」）。
//   B12 多跳：路径逐段检查，途中封锁也拦住并点名到点；封锁不改耗时。
//   B13 起点语义：起点天气不拦出发（问的是路，不是出发许可）。
//   B10 未知天气词：把封锁表里的一个键摘掉（内存副本）⇒ 该天气报 unknown-kind，
//      **既不假装通行也不假装封锁**（available:true / blocked:null）。
//   B11 天气模块缺席 ⇒ engine-absent，如实报、不崩、不封锁。
//   C1 不变式：message 的封锁面**绝不比 person 更严**（消息不可能比人还难走）；
//      封锁表覆盖天气白名单全集（逐词实测 weatherReason 为 ok，不抄表）。
//   C2 不硬编码：通道集合与耗时倍数都从产品面读（同一份真源）。
//   N0 五个真源码破坏锚点各恰中 1 次。
//   N1a/N1b/N1c/N1d 真源码破坏 ⇒ B1/B7/B5/B10 各自现形（含「静默放行」与「假装知道」两向）。
//   N2 读数随事实变化（同一实例内 0 → 1），不跨段复用实例。
//   N3 原版读数自洽；N4 锚点工具两向自证（命中 0 / 命中 2 都必须抛）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const WORLD = path.join(BASE, 'engines/world.js');
const DIAG = path.join(BASE, 'engines/tool-diag.js');
const PANEL = path.join(BASE, 'ui/panel.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }
// ── 真源码破坏锚点（各恰中 1 次才动刀）──
const A_CH = "const CHANNELS = ['person', 'goods', 'message'];";
const A_LV_STORM = "storm: { person: false, goods: false, message: true },";
const A_LV_CLEAR = "rain: { person: true, goods: true, message: true },\n    clear: { person: true, goods: true, message: true } };";
const A_WB_DISABLED = "blocked: { person: true, goods: true, message: true }, reason: 'disabled' }";
const A_WB_UNKNOWN = "if (!lv) return { ok: true, available: true, place: pl, kind: e.kind, blocked: null, reason: 'unknown-kind' };";
const A_BLOCK_CNT = "stat.blocks[ch] = (stat.blocks[ch] || 0) + 1;";
// 破坏形态：条件/映射置反，**不删行**——删行会留下悬空结构，语法错证明不了判据敏感
const B_LV_OPEN = "storm: { person: true, goods: true, message: true },";
const B_LV_RAIN_ONLY = "rain: { person: true, goods: true, message: true } };";
const B_WB_DISABLED_OPEN = "blocked: null, reason: 'ok' }";
const B_WB_UNKNOWN_FAKE = "if (!lv) return { ok: true, available: true, place: pl, kind: '', blocked: null, reason: 'ok' };";
const B_BLOCK_AS_TRANSIT = "stat.transits[ch] = (stat.transits[ch] || 0) + 1;";
const B_CH_WIDE = "const CHANNELS = ['person', 'goods', 'message', 'teleport'];";
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 60));
  return n;
}
function fresh(ov) { return gate.fresh(ov || undefined); }
const P = function (x) { return JSON.stringify(x); };
const TAG = '__tr2930_';
const PL = { A: '甲镇', B: '乙镇', C: '丙镇', D: '丁镇' };
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.clock = { iso: '', label: '第1日', dayIndex: 0, source: 'unset' };
    d.world = { places: [], roads: [], events: [], journeys: [] };
    d.weather = { rows: [] };
    d.people = {};
  }, TAG + 'seed');
  const w = WA.world;
  w.addPlace({ name: PL.A, kind: 'public' });
  w.addPlace({ name: PL.B, kind: 'work' });
  w.addPlace({ name: PL.C, kind: 'market' });
  w.addPlace({ name: PL.D, kind: 'wild' });
  w.addRoad(PL.A, PL.B, 30);
  w.addRoad(PL.C, PL.D, 40);
}
function on(WA) { WA.world.setSettings({ enabled: true }); WA.weather.setSettings({ enabled: true }); }
function wOn(WA) { WA.world.setSettings({ enabled: true }); }
function wx(WA, place, kind) { return WA.weather.setWeather(place, kind); }
function secBody(srcText, from, to) {
  const i = srcText.indexOf(from);
  const j = to ? srcText.indexOf(to) : -1;
  if (i < 0) throw new Error('secBody: 找不到起点 ' + from);
  return srcText.slice(i, (j > i) ? j : srcText.length);
}
function tOf(WA, ch, f, t) { return WA.world.transit(ch, f, t); }
// ══════════════ 判据 ══════════════
function runAll(a) {
  const wSrc = src(WORLD), dSrc = src(DIAG), pSrc = src(PANEL);
  // ── A 面（静态）──
  a(hits(wSrc, A_CH) === 1, 'v2930: [A1] 三层通道封闭集合在真源码（person / goods / message）');
  a(wSrc.indexOf('CHANNELS: CHANNELS, transit: transit,') > 0,
    'v2930: [A1] 两个新成员在 WA.world 导出对象里（导出即有承诺）');
  a(hits(wSrc, A_LV_STORM) === 1 && hits(wSrc, 'snow: { person: false, goods: false, message: true },') === 1,
    'v2930: [A1] 封锁表：storm / snow 封人·物而留消息（两条都在真源码）');
  a(wSrc.indexOf('function weatherBlockOf(place)') > 0 && wSrc.indexOf('function transit(channel, from, to)') > 0,
    'v2930: [A1] 只读封锁面与判定入口都在真源码，且 transit 签名只有三参（不收用不上的 at）');
  // A2 接线两面
  a(dSrc.indexOf('channels: WA.world.CHANNELS || []') > 0
    && dSrc.indexOf('transits: (st.transits || { person: 0, goods: 0, message: 0 }),') > 0
    && dSrc.indexOf('transitBlocks: (st.blocks || { person: 0, goods: 0, message: 0 }) };') > 0,
    'v2930: [A2] 诊断 secWorld 三个读数在场（真消费方一）');
  a(pSrc.indexOf('id="wa-world-transit"') > 0 && pSrc.indexOf("on('#wa-world-transit'") > 0
    && pSrc.indexOf('id="wa-world-tr-ch"') > 0,
    'v2930: [A2] 面板按钮 + 通道输入 + 绑定成对在场（真消费方二）');
  a(dSrc.indexOf("'wa-world-tr-ch', 'wa-world-transit',") > 0,
    'v2930: [A2] 守卫表登记了两个新控件（登记错页比不登记更坏）');
  a(pSrc.indexOf("'通行 · 被封 · '") > 0 && pSrc.indexOf("('通行 · ' + (r.reason || 'unknown'))") > 0,
    'v2930: [A2] 「被封」与「不达」两股措辞分列（合成一句就答不出要不要等天晴）');
  // A3 观测纯读
  a(secBody(dSrc, 'function secWorld()', 'function secShadow()').indexOf('transit(') < 0,
    'v2930: [A3] 诊断节**不调** transit（它会增 stat 计数；观测不得改变被观测对象）');
  a(secBody(dSrc, 'function secWorld()', 'function secShadow()').indexOf('weatherBlockOf') < 0,
    'v2930: [A3] 诊断节也不调 weatherBlockOf 做推断（只读已发生的计数，不自赠结论）');
  // ── B 面（运行时，全部真装载真调用）──
  const H1 = fresh(); const W1 = H1.WA; seed(W1); on(W1);
  const chans = W1.world.CHANNELS.slice();
  a(chans.length === 3 && chans.indexOf('person') >= 0 && chans.indexOf('goods') >= 0 && chans.indexOf('message') >= 0,
    'v2930: [B0] 通道集合从产品面读（' + P(chans) + '）');
  // B4 未登记天气：不回落成晴、也不回落成封锁
  const n0 = tOf(W1, 'person', PL.A, PL.B);
  a(n0.ok === true && n0.weatherReason === 'missing',
    'v2930: [B4] 未登记天气 ⇒ weatherReason missing，且**不因此封路**（实 ok=' + n0.ok + ' / ' + n0.weatherReason + '）');
  a(n0.weather === null, 'v2930: [B4] 没有天气就是没有（weather 为 null，不编一个晴）');
  a(n0.path.length === 2 && n0.path[0] === PL.A && n0.path[1] === PL.B && n0.hops === 1 && n0.minutes === 30,
    'v2930: [B1] 通行结果带真实路径与耗时（实 ' + P(n0.path) + ' minutes=' + n0.minutes + '）');
  // B1 三层分辨率（同一实例、同一对起终点）
  wx(W1, PL.B, 'storm');
  const p1 = tOf(W1, 'person', PL.A, PL.B);
  const g1 = tOf(W1, 'goods', PL.A, PL.B);
  const m1 = tOf(W1, 'message', PL.A, PL.B);
  a(p1.ok === false && p1.reason === 'weather-blocked', 'v2930: [B1] storm ⇒ 人过不去（实 ' + P(p1) + '）');
  a(g1.ok === false && g1.reason === 'weather-blocked', 'v2930: [B1] storm ⇒ 物过不去');
  a(m1.ok === true, 'v2930: [B1] storm ⇒ **消息仍可到**（实 ok=' + m1.ok + '）——三层不得合并成一个结论');
  a(p1.channel === 'person' && g1.channel === 'goods', 'v2930: [B1] 回执里点名是**哪一层**被拒（不靠调用方自己记）');
  // B2 归因分开 + 带上地点/天气名/倍数/路径
  a(p1.at === PL.B && p1.kind === 'storm' && p1.factor === W1.weather.FACTOR.storm && P(p1.path) === P([PL.A, PL.B]),
    'v2930: [B2] 封锁回执带地点/天气/倍数/路径（实 at=' + p1.at + ' kind=' + p1.kind + ' factor=' + p1.factor + '）');
  const far = tOf(W1, 'person', PL.A, '戊镇');
  a(far.ok === false && far.reason === 'unknown-place',
    'v2930: [B2] 未登记终点 ⇒ unknown-place（不猜）');
  const iso = tOf(W1, 'person', PL.A, PL.C);
  a(iso.ok === false && iso.reason === 'unreachable',
    'v2930: [B2] **有登记地点但无路** ⇒ unreachable——与 weather-blocked 分开（实 ' + P(iso) + '）');
  // B6 未知通道
  const bc = tOf(W1, 'teleport', PL.A, PL.B);
  a(bc.ok === false && bc.reason === 'bad-channel' && P(bc.channels) === P(chans),
    'v2930: [B6] 未知通道 ⇒ bad-channel，并列出合法通道（实 ' + P(bc.channels) + '）');
  // B3 只减速的天气不封路
  wx(W1, PL.B, 'rain');
  const r1 = tOf(W1, 'person', PL.A, PL.B);
  a(r1.ok === true && r1.weather && r1.weather.kind === 'rain' && r1.weather.factor === W1.weather.FACTOR.rain,
    'v2930: [B3] rain 只减速不封路，倍数照实报出（实 ' + P(r1.weather) + '）');
  a(W1.weather.FACTOR.rain > 1, 'v2930: [B3] 该倍数确实大于 1（否则「只减速」是空话）');
  // B5 天气模块关着：关闭不是「天气很差」
  W1.weather.setSettings({ enabled: false });
  const d1 = tOf(W1, 'person', PL.A, PL.B);
  a(d1.ok === true && d1.weatherReason === 'disabled',
    'v2930: [B5] 天气模块关闭 ⇒ 不封路，且理由是可读的 disabled（实 ok=' + d1.ok + ' / ' + d1.weatherReason + '）');
  W1.weather.setSettings({ enabled: true });
  // B7 计数分列（新实例，读数从 0 起）
  const H2 = fresh(); const W2 = H2.WA; seed(W2); on(W2);
  const st0 = W2.world.stat();
  a(st0.transits.person === 0 && st0.transits.goods === 0 && st0.transits.message === 0,
    'v2930: [B7] 起始三层计数均为 0（实 ' + P(st0.transits) + '）');
  wx(W2, PL.B, 'storm');
  tOf(W2, 'person', PL.A, PL.B);
  tOf(W2, 'goods', PL.A, PL.B);
  tOf(W2, 'message', PL.A, PL.B);
  const st1 = W2.world.stat();
  a(st1.transits.person === 0 && st1.transits.goods === 0 && st1.transits.message === 1,
    'v2930: [B7] 只有真过去了的那一层计 transits（实 ' + P(st1.transits) + '）');
  a(st1.blocks.person === 1 && st1.blocks.goods === 1 && st1.blocks.message === 0,
    'v2930: [B7] 被封逐层计 blocks，与成功计数**分列**（实 ' + P(st1.blocks) + '）——混计就答不出「没过去几次」');
  a(st1.blocked === st0.blocked + 2, 'v2930: [B7] 总 blocked 计两次被封（实 ' + st1.blocked + '）');
  wx(W2, PL.B, 'storm');
  // B8 诊断面真消费 + 观测纯读
  const rep1 = W2.toolDiag.collect();
  const wd1 = rep1.world || {};
  a(P(wd1.channels) === P(chans), 'v2930: [B8] 诊断里的通道集合与 `WA.world.CHANNELS` 同源（实 ' + P(wd1.channels) + '）');
  a(wd1.transits && wd1.transits.message === st1.transits.message && wd1.transitBlocks && wd1.transitBlocks.person === st1.blocks.person,
    'v2930: [B8] 诊断三层读数与 `stat()` 同读数（实 ' + P(wd1.transits) + ' / ' + P(wd1.transitBlocks) + '）');
  const rep2 = W2.toolDiag.collect();
  a(P(rep2.world.transits) === P(rep1.world.transits) && P(rep2.world.transitBlocks) === P(rep1.world.transitBlocks),
    'v2930: [B8] 连采两次读数不变（诊断节不调 transit：观测不得改变被观测对象）');
  // B9 面板面真消费
  const panel = H2.dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (x) { return x.dataset.page === 'people'; })[0];
  a(!!tab, 'v2930: [B9] 承载世界织体控件的 tab 在场');
  tab.click();
  const body = panel.querySelector('.wa-body');
  const btn = body.querySelectorAll('button').filter(function (b) { return b.id === 'wa-world-transit'; })[0];
  const chIn = body.querySelectorAll('input').filter(function (b) { return b.id === 'wa-world-tr-ch'; })[0];
  a(!!btn && !!chIn, 'v2930: [B9] 「判通行」按钮与通道输入同时渲染成树（绑定不会空转）');
  const fromIn = body.querySelectorAll('input').filter(function (b) { return b.id === 'wa-world-mv-from'; })[0];
  const toIn = body.querySelectorAll('input').filter(function (b) { return b.id === 'wa-world-mv-to'; })[0];
  a(!!fromIn && !!toIn, 'v2930: [B9] 起终点输入复用移动行控件（同一个「从/到」语义，不另造一份）');
  chIn.value = 'person'; fromIn.value = PL.A; toIn.value = PL.B;
  btn.click();
  const out = H2.dom.getElementById('wa-world-out');
  const txt = out ? String(out.textContent || '') : '';
  a(txt.indexOf('通行 · 被封 · person') === 0 && txt.indexOf('storm') > 0 && txt.indexOf('封住') > 0,
    'v2930: [B9] 被封读数点名通道与地点（实 ' + txt + '）');
  a(txt.indexOf('人/物不可，消息可') > 0,
    'v2930: [B9] 封路读数同时说明**消息仍可**（不把三层压成一句「不行」；实 ' + txt + '）');
  chIn.value = 'message'; btn.click();
  const txt2 = out ? String(out.textContent || '') : '';
  a(txt2.indexOf('通行 · message') > 0 && txt2.indexOf('storm') > 0 && txt2.indexOf('×') > 0,
    'v2930: [B9] 消息层成功读数带天气与倍数（实 ' + txt2 + '）');
  a(txt2.indexOf('被封') < 0, 'v2930: [B9] 成功与失败两股措辞不混用（实 ' + txt2 + '）');
  // B12：多跳路径逐段检查——途中被封锁也拦住，且点名是哪一个点
  const H7 = fresh(); const W7 = H7.WA; seed(W7); on(W7);
  W7.world.addRoad(PL.B, PL.C, 25);
  wx(W7, PL.B, 'storm');
  const m7 = tOf(W7, 'person', PL.A, PL.C);
  a(m7.ok === false && m7.reason === 'weather-blocked' && m7.at === PL.B && m7.path.length === 3,
    'v2930: [B12] 三跳路径在**中途**被封锁也拦住，并点名是哪个点（实 ' + P(m7.at) + ' / ' + P(m7.path) + '）');
  const m7b = tOf(W7, 'message', PL.A, PL.C);
  a(m7b.ok === true && m7b.hops === 2, 'v2930: [B12] 同一中途封锁下消息仍可到（实 ok=' + m7b.ok + '）');
  wx(W7, PL.B, 'clear');
  const m7c = tOf(W7, 'person', PL.A, PL.C);
  a(m7c.ok === true && m7c.hops === 2 && m7c.minutes === 55,
    'v2930: [B12] 解除后逐段耗时相加（30+25=55，实 ' + m7c.minutes + '）；封锁只是拦住，不改耗时');
  // B13：起点天气不拦（本版口径：通行判定问的是**路**，不是出发许可——
  //   已到场的人不因当地天气被注销；这条必须钉住，否则下次改回「连起点一起查」
  //   会让同一条封锁把「在甲镇的人」也拦住，而没人会发现这是漂移）
  const H8 = fresh(); const W8 = H8.WA; seed(W8); on(W8);
  wx(W8, PL.A, 'storm');
  const q8 = tOf(W8, 'person', PL.A, PL.B);
  a(q8.ok === true && q8.weatherReason === 'missing',
    'v2930: [B13] 起点暴风雪不拦住出发（终点未登记天气 ⇒ missing；实 ' + q8.ok + ' / ' + q8.weatherReason + '）');
  // ── C 面（不变式与诚实降级）──
  // C1a：封锁表覆盖面逐词实测——每个已登记天气词都能得到一个可读的封锁面
  const H3 = fresh(); const W3 = H3.WA; seed(W3); on(W3);
  const kinds = W3.weather.WEATHERS.slice();
  a(kinds.length >= 6, 'v2930: [C1] 天气白名单从产品面读（' + P(kinds) + '）');
  const lvOf = function (kind) {
    wx(W3, PL.B, kind);
    const r = tOf(W3, 'person', PL.A, PL.B);
    return { person: r.ok, message: tOf(W3, 'message', PL.A, PL.B).ok, kind: kind };
  };
  const rows = kinds.map(lvOf);
  a(rows.length === kinds.length, 'v2930: [C1] 每个天气词都得到了可读的封锁面（逐词实测 ' + rows.length + '/' + kinds.length + '）');
  a(rows.filter(function (r) { return r.message && !r.person; }).length >= 2,
    'v2930: [C1] 至少两种天气呈「人不可而消息可」——三层真在分叉（实 '
    + P(rows.filter(function (r) { return r.message && !r.person; }).map(function (r) { return r.kind; })) + '）');
  a(rows.every(function (r) { return !(r.person && !r.message); }),
    'v2930: [C1] 不变式：**人过得去则消息必过得去**（没有任何一种天气只封消息：'
    + P(rows.filter(function (r) { return r.person && !r.message; })) + '）');
  a(rows.filter(function (r) { return r.person && r.message; }).length >= 1,
    'v2930: [C1] 至少一种天气两层都通（封锁不是「一律封」——一律封等于没有分辨率）');
  // C1b：罕见天气词（不在封锁表里）⇒ 既不假装通行也不假装封锁
  const H4 = fresh(); const W4 = H4.WA; seed(W4); on(W4);
  const wSrcB = src(WORLD).replace("    rain: { person: true, goods: true, message: true },\n    clear: { person: true, goods: true, message: true } };",
    '    rain: { person: true, goods: true, message: true } };');
  a(wSrcB !== src(WORLD), 'v2930: [B10] 破坏确实改写了源码（从封锁表摘掉 clear）');
  const H5 = fresh({ srcOverride: { 'engines/world.js': wSrcB } }); const W5 = H5.WA; seed(W5); on(W5);
  wx(W5, PL.B, 'clear');
  const uk = tOf(W5, 'person', PL.A, PL.B);
  a(uk.ok === true && uk.weatherReason === 'unknown-kind',
    'v2930: [B10] 封锁表未覆盖的天气词 ⇒ weatherReason unknown-kind（实 ' + P(uk.weatherReason) + '）');
  a(uk.weather && uk.weather.kind === 'clear',
    'v2930: [B10] **不假装通行也不假装封锁**：封锁面未知但天气仍是它自己（不报成空、也不报成 storm；实 ' + P(uk.weather) + '）');
  // B11 天气模块缺席：如实报、不崩、不封锁
  const H6 = fresh(); const W6 = H6.WA; seed(W6); wOn(W6);
  const keepEff = W6.weather.effect;
  W6.weather.effect = undefined;
  const ab2 = tOf(W6, 'person', PL.A, PL.B);
  W6.weather.effect = keepEff;
  a(ab2.ok === true && ab2.weather === null,
    'v2930: [B11] 缺席时不编一个天气（weather 为 null，不回落成晴；实 ' + P(ab2.weather) + '）');
  a(ab2.ok === true && ab2.weatherReason === 'engine-absent',
    'v2930: [B11] 缺席时通行**不被它封住**（「我不知道」不是「路不通」；实 ' + P(ab2.weatherReason) + '）');
  // C2 不硬编码：耗时倍数取产品面，封锁判定与 weather.travelMinutes 同源倍数
  a(W6.weather.FACTOR.storm === W1.weather.FACTOR.storm && W6.weather.FACTOR.clear === 1,
    'v2930: [C2] 耗时倍数取产品面（两实例同值；clear=1 表示「晴天不减速」）');
}
function runNegative(a) {
  const wSrc = src(WORLD);
  // N0：六个真源码破坏锚点各恰中 1 次（先证锚点干净，否则下面的「破坏」可能改在别处）
  a(hits(wSrc, A_CH) === 1 && hits(wSrc, A_LV_STORM) === 1 && hits(wSrc, A_LV_CLEAR) === 1
    && hits(wSrc, A_WB_DISABLED) === 1 && hits(wSrc, A_WB_UNKNOWN) === 1 && hits(wSrc, A_BLOCK_CNT) === 1,
    'v2930: [N0] 六个真源码破坏锚点各恰中 1 次');
  // N1a：storm 改成「什么都不封」⇒ B1 现形（三层分辨率消失，而库存判定全绿）
  const sA = wSrc.replace(A_LV_STORM, B_LV_OPEN);
  a(sA !== wSrc, 'v2930: [N1a] 破坏确实改写了源码（storm 不再封路）');
  const HA = fresh({ srcOverride: { 'engines/world.js': sA } }); const WAa = HA.WA; seed(WAa); on(WAa);
  wx(WAa, PL.B, 'storm');
  const pa = tOf(WAa, 'person', PL.A, PL.B), ga = tOf(WAa, 'goods', PL.A, PL.B), ma = tOf(WAa, 'message', PL.A, PL.B);
  a(pa.ok === true && ga.ok === true && ma.ok === true,
    'v2930: [N1a] 破坏后 B1 现形：storm 下人与物都过得去（实 ' + P([pa.ok, ga.ok, ma.ok]) + '）——「不封」与「封三层」都通不过原版判据');
  a(HA.WA.world.stat().blocks.person === 0, 'v2930: [N1a] 破坏后封锁计数永远为 0（死面）');
  // N1b：从封锁表摸掉 clear ⇒ 该天气词变 unknown-kind（「不知道」不再静默当通行）
  const sB = wSrc.replace(A_LV_CLEAR, B_LV_RAIN_ONLY);
  a(sB !== wSrc, 'v2930: [N1b] 破坏确实改写了源码（封锁表未被白名单全覆盖）');
  const HB = fresh({ srcOverride: { 'engines/world.js': sB } }); const WB = HB.WA; seed(WB); on(WB);
  wx(WB, PL.B, 'clear');
  const rb = tOf(WB, 'person', PL.A, PL.B);
  a(rb.ok === true && rb.weatherReason === 'unknown-kind',
    'v2930: [N1b] 破坏后 B10 现形（未覆盖的天气词报 unknown-kind，实 ' + rb.weatherReason + '）');
  a(rb.weather && rb.weather.kind === 'clear',
    'v2930: [N1b] 且不把它当成可通的三层（封锁面未知则归因 unknown-kind，不得静默报 ok）');
  // N1c：天气模块关闭时不再现身 ⇒ B5 现形（「关掉」变成「天气很好」）
  const sC = wSrc.replace(A_WB_DISABLED, B_WB_DISABLED_OPEN);
  a(sC !== wSrc, 'v2930: [N1c] 破坏确实改写了源码（关闭态不再报 disabled）');
  const HC = fresh({ srcOverride: { 'engines/world.js': sC } }); const WC = HC.WA; seed(WC); on(WC);
  WC.weather.setSettings({ enabled: false });
  const rc = tOf(WC, 'person', PL.A, PL.B);
  a(rc.ok === true && rc.weatherReason !== 'disabled',
    'v2930: [N1c] 破坏后 B5 现形：关闭态的理由不再是 disabled（实 ' + P(rc.weatherReason) + '）');
  // N1d：未覆盖的天气词被报成 ok（还带个空天气名）⇒ 两向自证：原版报不知道，破坏后**假装知道**
  const sD = wSrc.replace(A_LV_CLEAR, B_LV_RAIN_ONLY).replace(A_WB_UNKNOWN, B_WB_UNKNOWN_FAKE);
  a(sD !== sC && sD !== wSrc, 'v2930: [N1d] 破坏确实改写了源码（两处累积改写）');
  const HD = fresh({ srcOverride: { 'engines/world.js': sD } }); const WD = HD.WA; seed(WD); on(WD);
  wx(WD, PL.B, 'clear');
  const rdd = tOf(WD, 'person', PL.A, PL.B);
  a(rdd.ok === true && rdd.weatherReason === 'ok' && rdd.weather && rdd.weather.kind === '',
    'v2930: [N1d] 破坏后同一份现状变成「知道」（实 ' + P(rdd.weatherReason) + ' / ' + P(rdd.weather) + '）——这就是「静默掠过的不知」形态');
  // N1e：被封计成成功 ⇒ B7 现形（分列丢失）
  const sE = wSrc.replace(A_BLOCK_CNT, B_BLOCK_AS_TRANSIT);
  a(sE !== wSrc, 'v2930: [N1e] 破坏确实改写了源码（被封计入成功计数）');
  const HE = fresh({ srcOverride: { 'engines/world.js': sE } }); const WE = HE.WA; seed(WE); on(WE);
  wx(WE, PL.B, 'storm');
  tOf(WE, 'person', PL.A, PL.B);
  const stE = WE.world.stat();
  a(stE.transits.person === 1 && stE.blocks.person === 0,
    'v2930: [N1e] 破坏后 B7 现形：没过去也计成功（实 transits=' + P(stE.transits) + ' blocks=' + P(stE.blocks) + '）');
  // N1f：通道集合被改宽（多一个词）⇒ B6 现形：不在封闭集合里的通道不再被拒
  const sF = wSrc.replace(A_CH, B_CH_WIDE);
  a(sF !== wSrc, 'v2930: [N1f] 破坏确实改写了源码（通道集合被改宽）');
  const HF = fresh({ srcOverride: { 'engines/world.js': sF } }); const WF = HF.WA; seed(WF); on(WF);
  const te = tOf(WF, 'teleport', PL.A, PL.B);
  a(te.reason !== 'bad-channel' && te.ok === true,
    'v2930: [N1f] 破坏后 B6 现形：集合外的通道不再被拒（实 ' + P(te.reason) + '）');
  // N2：读数随事实变化（同一实例内 0 → 1，不跨段复用实例）
  const H4 = fresh(); const W4 = H4.WA; seed(W4); on(W4);
  a(W4.world.stat().transits.message === 0, 'v2930: [N2] 起始 message 成功计数为 0');
  tOf(W4, 'message', PL.A, PL.B);
  a(W4.world.stat().transits.message === 1, 'v2930: [N2] 跑一次后变 1（读数真的随事实走；实 ' + W4.world.stat().transits.message + '）');
  // N3：原版读数自洽（不硬编码第二份）
  a(W4.world.CHANNELS.length === 3 && W4.weather.WEATHERS.length >= 6,
    'v2930: [N3] 集合长度从产品面读（通道 ' + W4.world.CHANNELS.length + ' / 天气 ' + W4.weather.WEATHERS.length + '）');
  const bt = W4.world.stat();
  a(bt.transits.message === 1 && bt.transits.person === 0 && bt.transits.goods === 0,
    'v2930: [N3] 只计入被跑到的那一层（实 ' + P(bt.transits) + '）');
  // N4：锚点工具两向自证（命中 0 与命中 2 都必须抛）
  let threw = 0;
  try { hits(wSrc, '不存在的锚点字面量 ###'); } catch (e) { threw++; }
  try { hits('aa bb aa bb', 'aa'); } catch (e) { threw++; }
  a(threw === 2, 'v2930: [N4] 锚点工具两向自证：命中 0 与命中 2 都必须抛（实 ' + threw + '/2）');
}
// ══════════════ 入口 ══════════════
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('TRANSIT-V2930: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('TRANSIT-V2930: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative };
