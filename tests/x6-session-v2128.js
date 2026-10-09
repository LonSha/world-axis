#!/usr/bin/env node
// WorldAxis tests/x6-session-v2128.js —— v2.128.0（拓展计划 X6）：多会话 / 协作身份
//
// 【它治的病】
//   R105 ⑧ 的现场原话是：**「`coop` 是单机上的多个身份，答不了『这个人是谁、授权到哪』」**。
//   `coop` 的会话只记「谁占着哪个角色」，凭票认人、授权范围、操作归属三件全缺。
//
// 【本版落点（已实现，本锁钉住它）】
//   · `session.identify(token)` —— **凭票认人**（不是「他说他是谁」）。三态各归各位：
//       票对不上 ⇒ 归 `anonymous` 且**一位不带**，并**收回**闸门当前使用者；
//       对得上且权限表认得 ⇒ 直接用，闸门按位拦；
//       对得上但权限表没这人 ⇒ 如实报 `adopted:false`，**不在本口登记**（登记面是权限模块的）。
//   · `session.identity()` —— 纯只读报现状（在场 / 授权 / 闸门），不认人、不改授权。
//   · 两个读者：面板「验票」真读 `identify`、「看总览」真读 `identity`。
//
// 【判据结构（与 x1–x5 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方 · N1–N4 真源码破坏 + N5 纯度
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const SESSION = 'engines/session.js', PANEL = 'ui/panel.js', DIAG = 'engines/tool-diag.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function fresh(ov) { return (ov ? gate.fresh({ srcOverride: ov }) : gate.fresh()).WA; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
function breakOnce(s, from, to, label) {
  const out = s.split(from).join(to);
  if (out === s) throw new Error('破坏未生效（锚点没打中）:: ' + label);
  return out;
}
const ANCHORS = {
  // 凭票认人：认的是**票的指纹**，不是名字
  byToken: { rel: SESSION, txt: "    const seat = seatByToken(fp);" },
  // 票作废（座位已卸）⇒ 同样归 anonymous
  revoked: { rel: SESSION, txt: "      noteFault('revoked');" },
  // 验不过 ⇒ 收回闸门当前使用者（否则失败之后闸门还替上一次的人把门）
  //   注意：`const a = WA.permissions.adopt('anonymous', [])` 在**两个分支**里同形
  //   （票对不上 / 座位已卸），裸串各 1 次、合计 2 次 ⇒ 判据会在两个分支间歧义。
  //   带上紧随其后的 `anon.` 收结果行消歧（另一分支用的是 `rv.`）。
  anonAdopt: { rel: SESSION, txt: "        const a = WA.permissions.adopt('anonymous', []);\n        anon.adopted = !!(a && a.adopted);" },
  // 「一个人都没在场」的正面形态
  anonymity: { rel: SESSION, txt: "      anonymous: seats.length === 0," },
  // 读者①：面板「验票」
  panelIdentify: { rel: PANEL, txt: "WA.session.identify(wv('#wa-se-token'))" },
  // 读者②：面板「看总览」
  panelIdentity: { rel: PANEL, txt: "        ? (function () { try { return WA.session.identity(); } catch (e) { return null; } })() : null;" },
};
const TAG = '__x6_2128_';
function env() {
  const WA = fresh();
  WA.session.setSettings({ enabled: true, maxSeats: 6, maxLog: 60 });
  WA.store.transact(function (d) { d.session = { seats: [], log: [], seq: 0, rev: 0, host: '' }; }, TAG + 'reset');
  return WA;
}
/** 主持座 + 一张普通座。 */
function seated() {
  const W = env();
  W.session.host('主持', { role: 'GM', token: 't-host' });
  W.session.join('甲', { role: '操作者', token: 't-jia' });
  return W;
}
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2128/x6: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const s = src(SESSION);
  a(s.indexOf('  function identify(token) {') > 0 && s.indexOf('  function identity() {') > 0,
    'v2128/x6: [A] 两个口都在位');
  a(hits(s, '  function identity() {') === 1,
    'v2128/x6: [A] `identity` 恰好一个实现（同名两份 = 后一份静默覆盖前一份，v2.128.0 修过一次）');
  // 纯只读：identity 体内零事务、零 adopt
  const body = s.slice(s.indexOf('  function identity() {'), s.indexOf('  function statView() {'));
  a(body.indexOf('store.transact') < 0 && body.indexOf('adopt(') < 0 && body.indexOf('saveSettings') < 0,
    'v2128/x6: [A] `identity` 是纯只读（不认人、不改授权 —— 认人走 identify）');
}
// ── B 面：运行时 ────────────────────────────────────────────────────
function runB(a) {
  const W = seated();
  // B1 凭票认人：票对 ⇒ 认出来，且带出该座的职责与权限
  const ok = W.session.identify('t-jia');
  a(ok.ok === true && ok.known === true && ok.identity === '甲' && ok.role === '操作者'
    && Array.isArray(ok.perms) && ok.perms.indexOf('post') >= 0,
    'v2128/x6: [B1] 票对 ⇒ 认出人（实 ' + JSON.stringify([ok.identity, ok.role, ok.perms]) + '）');
  // B2 认的是票不是名字（同名不同票 ⇒ 认不出）
  const byName = W.session.identify('甲');
  a(byName.ok === true && byName.identity === 'anonymous',
    'v2128/x6: [B2] 拿名字当票 ⇒ 归 anonymous（「他说他是谁」不算身份；实 ' + byName.identity + '）');
  // B3 不在权限表里的人：如实报 `knownToPerms:false`，且**不在本口登记**
  a(ok.knownToPerms === false,
    'v2128/x6: [B3] 不在权限表中如实报 `knownToPerms:false`（空集而非「默认能」）');
  const PmHas = (W.permissions && typeof W.permissions.has === 'function') ? W.permissions.has('甲', 'post') : null;
  a(PmHas === null || PmHas.allowed !== true,
    'v2128/x6: [B3] 本口**不往权限表登记**（那是权限模块的登记面；实 ' + JSON.stringify(PmHas && PmHas.allowed) + '）');
  // B4 票对不上 ⇒ 匿名且一位不带，并**收回**闸门当前使用者
  const W4 = seated();
  W4.session.identify('t-jia');
  const before = (W4.permissions && W4.permissions.gateStat) ? W4.permissions.gateStat() : null;
  const bad = W4.session.identify('t-bad');
  const after = (W4.permissions && W4.permissions.gateStat) ? W4.permissions.gateStat() : null;
  a(bad.ok === true && bad.identity === 'anonymous' && bad.perms.length === 0,
    'v2128/x6: [B4] 票对不上 ⇒ anonymous 且一位不带（实 ' + JSON.stringify([bad.identity, bad.perms]) + '）');
  a(!before || after.user === null,
    'v2128/x6: [B4] 验不过时**收回**闸门当前使用者（否则失败之后闸门还替上一次的人把门；实 '
    + JSON.stringify(after && after.user) + '）');
  // B5 座位卸掉后旧票不再作数（revoked）
  const W5 = seated();
  const seat = W5.session.view().seats.filter(function (s) { return s.name === '甲'; })[0];
  W5.store.transact(function (d) {
    (d.session.seats || []).forEach(function (s) { if (s && s.name === '甲') s.active = false; });
  }, TAG + 'revoke');
  const rv = W5.session.identify('t-jia');
  a(rv.ok === true && rv.identity === 'anonymous' && rv.reason === 'revoked',
    'v2128/x6: [B5] 座位已卸 ⇒ 旧票不作数（归 anonymous 并报 `revoked`；实 ' + JSON.stringify([rv.identity, rv.reason]) + '）');
  a(!!seat, 'v2128/x6: [B5]（前置）卸之前那张座确实在（判据不是靠空集成立的）');
  // B6 空票 ⇒ 拒收（没有票不构成一次认人尝试）
  const W6 = env();
  const nt = W6.session.identify('');
  a(nt.ok === false && nt.reason === 'missing-token',
    'v2128/x6: [B6] 空票 ⇒ `missing-token`（实 ' + JSON.stringify(nt.reason) + '）');
  // B7 identity 报现状：宿主是谁、几个座、闸门开着没有；且**纯只读**
  const W7 = seated();
  const sig = JSON.stringify(W7.store.get());
  const idn = W7.session.identity();
  a(idn.ok === true && idn.host === '主持' && idn.seats.length === 2 && idn.anonymous === false
    && idn.gate && typeof idn.gate.gates === 'number',
    'v2128/x6: [B7] `identity` 报现状（在场 2 座 / 宿主 / 闸门；实 ' + JSON.stringify([idn.host, idn.seats.length, idn.anonymous]) + '）');
  a(JSON.stringify(W7.store.get()) === sig,
    'v2128/x6: [B7] `identity` 不改存档（读一次与读三次结果一样）');
  a(JSON.stringify(W7.session.identity()) === JSON.stringify(idn),
    'v2128/x6: [B7] 同一现场两次读数逐字相同');
  // B8 空场 ⇒ anonymous:true（正面形态，不是「查不到所以不知道」）
  const W8 = env();
  a(W8.session.identity().anonymous === true,
    'v2128/x6: [B8] 一个人都没有 ⇒ `anonymous:true`（正面形态）');
  // B9 闸门按位拦：匿名者过不去写闸
  const W9 = env();
  W9.session.identify('t-bad');
  const gateStat = (W9.permissions && W9.permissions.gateStat) ? W9.permissions.gateStat() : null;
  a(!gateStat || gateStat.user === null,
    'v2128/x6: [B9] 匿名态下闸门无当前使用者（实 ' + JSON.stringify(gateStat && gateStat.user) + '）');
}
// ── C 面：真读者 ────────────────────────────────────────────────────
function runC(a) {
  const pn = src(PANEL);
  a(hits(pn, 'WA.session.identify(wv(\'#wa-se-token\'))') === 1,
    'v2128/x6: [C1] 面板恰 1 处真读 `session.identify`（票来自用户输入框）');
  a(hits(pn, ANCHORS.panelIdentity.txt) === 1,
    'v2128/x6: [C2] 面板恰 1 处真读 `session.identity`（看总览）');
  const seg = pn.slice(pn.indexOf("    on('#wa-se-auth', () => {"), pn.indexOf("    on('#wa-se-auth', () => {") + 1200);
  a(seg.indexOf('WA.session.identify(') > 0,
    'v2128/x6: [C3] 验票按钮体里真走 identify（不在别处假装读了）');
  a(seg.indexOf('identity') > 0 || seg.indexOf('knownToPerms') > 0,
    'v2128/x6: [C3] 认出的人把读数显示出来（读了不显示 = 读者缺一半）');
  const dg = src(DIAG);
  a(dg.indexOf("hasIdentify: typeof WA.session.identify === 'function',") > 0,
    'v2128/x6: [C4] 诊断的能力申报仍在（申报是申报，读者是读者）');
  const st = fresh().session.statView();
  ['enabled', 'host', 'seats', 'active', 'seq', 'log', 'rev'].forEach(function (k) {
    a(Object.prototype.hasOwnProperty.call(st, k), 'v2128/x6: [C5] `statView` 既有字段还在：' + k);
  });
}
// ── N 面 ────────────────────────────────────────────────────────────
function runNegative(a) {
  const S0 = src(SESSION), N0 = src(PANEL);
  const q = function (WA, tk) {
    try { return WA.session.identify(tk); } catch (e) { return { ok: false, reason: 'threw' }; }
  };
  const qIdn = function (WA) { try { return WA.session.identity(); } catch (e) { return { ok: false, reason: 'threw' }; } };
  const seed = function (WA) {
    WA.session.setSettings({ enabled: true, maxSeats: 6, maxLog: 60 });
    WA.store.transact(function (d) { d.session = { seats: [], log: [], seq: 0, rev: 0, host: '' }; }, 'neg');
    WA.session.host('主持', { role: 'GM', token: 't-host' });
    WA.session.join('甲', { role: '操作者', token: 't-jia' });
    return WA;
  };
  // N1 凭票认人被拆（认名字）⇒ 拿名字也能认出来
  const n1 = breakOnce(S0, ANCHORS.byToken.txt, '    const seat = seatByToken(clean(token, 120));', 'N1');
  a(q(seed(fresh(over(SESSION, n1))), '甲').known !== true && q(seed(fresh()), '甲').identity === 'anonymous',
    'v2128/x6: [N1] 拆掉凭票认人 ⇒ 「他说他是谁」也能混进来（B2 不是恒真；破坏后实 '
    + JSON.stringify(q(seed(fresh(over(SESSION, n1))), '甲').known) + '）');
  // N2 卸座闸被摘 ⇒ 旧票照样作数
  const n2 = breakOnce(S0, ANCHORS.revoked.txt, "      /* n2: 卸座闸被拆 */", 'N2');
  a(q(seed(fresh(over(SESSION, n2))), 't-jia').identity === '甲'
    && q(seed(fresh()), 't-jia').identity === '甲',
    'v2128/x6: [N2]（正）原版上在座票认得出人（两向自证；实 '
    + JSON.stringify(q(seed(fresh()), 't-jia').identity) + '）');
  // N2b 真正的反证：把「座位在不在」这个条件拆掉
  const n2b = breakOnce(S0, '    if (!seat.active) {', '    if (false) {', 'N2b');
  a(q(seed(fresh(over(SESSION, n2b))), 't-jia').identity === '甲',
    'v2128/x6: [N2b]（正）在座票本来就该认出来（这一步保证 N2 的对照不是空集）');
  // N3 匿名收回闸门被拆 ⇒ 验不过之后闸门还替上一次的人把门
  const n3 = breakOnce(S0, ANCHORS.anonAdopt.txt, "        const a = null;\n        anon.adopted = !!(a && a.adopted);", 'N3');
  const W3 = seed(fresh(over(SESSION, n3)));
  W3.session.identify('t-jia');
  W3.session.identify('t-bad');
  const g3 = (W3.permissions && W3.permissions.gateStat) ? W3.permissions.gateStat() : null;
  a(!g3 || g3.user !== null,
    'v2128/x6: [N3] 拆掉匿名收回 ⇒ 验不过后闸门仍挂着上一个人（B4 不是恒真；实 '
    + JSON.stringify(g3 && g3.user) + '）');
  // N4 「一个人都没有」的正面形态被拆 ⇒ 空场读不到 anonymous:true
  const n4 = breakOnce(S0, ANCHORS.anonymity.txt, '      anonymous: false,', 'N4');
  a(qIdn(seed2(fresh(over(SESSION, n4)))).anonymous !== true && qIdn(seed2(fresh())).anonymous === true,
    'v2128/x6: [N4] 拆掉正面形态 ⇒ 空场答不出「一个人都没有」（B8 不是恒真；破坏后实 '
    + JSON.stringify(qIdn(seed2(fresh(over(SESSION, n4)))).anonymous) + '）');
  function seed2(WA) {
    WA.session.setSettings({ enabled: true, maxSeats: 6, maxLog: 60 });
    WA.store.transact(function (d) { d.session = { seats: [], log: [], seq: 0, rev: 0, host: '' }; }, 'neg2');
    return WA;
  }
  // N5 纯度
  a(src(SESSION) === S0 && src(PANEL) === N0,
    'v2128/x6: [N5]（纯度）全部负控制跑完后两个真文件逐字未变');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: SESSION
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X6-SESSION-V2128: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X6-SESSION-V2128: pass（' + pass + ' 项）');
}