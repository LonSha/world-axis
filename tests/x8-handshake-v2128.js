#!/usr/bin/env node
// WorldAxis tests/x8-handshake-v2128.js —— v2.128.0（拓展计划 X8）：跨插件业务闭环验证
//
// 【它治的病】
//   `theme.separation()` 报得出三插件分工，但答不出**「契约对不对得上」**：
//   无头环境下 `engine-absent`，真机联调只能靠人。缺席与「版本读不到」在读数上长得一样。
//
// 【本版落点（已实现，本锁钉住它）】
//   · `bridge.handshake()` —— `worldaxis_bridge_v1` 的**版本化握手**（纯读）。
//     每边如实报 `present / version / expect / matched / why`：
//       在场且两版都是数字且相等 ⇒ `matched:true`；
//       在场但版本读不到（旧版无字段）⇒ `matched:false` 且 `why:'version-unknown'`
//         （**不当作匹配** —— 把「不知道」说成「对上了」正是本面要治的病）；
//       缺席 ⇒ `present:false` 照实留档，**不写死「已接入」**。
//   · 真读者：`theme.separation()` 带上 `handshake` 那一面（分工 + 契约两件事实同框）。
//   · 本版口径（写进锁）：**不在无头环境伪称实机已验证** —— `ok:true` 只表示读数算得出来，
//     「对端在不在」由每条边的 `present` 承载，不由 ok 承载。
//
// 【判据结构（与 x1–x7 同规格）】A 结构 · B 运行时 · C 消费方 · N1–N5 真源码破坏 + N6 纯度
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const BRIDGE = 'engines/bridge.js', THEME = 'engines/theme.js', DIAG = 'engines/tool-diag.js';
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
  // 缺席 ⇒ 照实留档（不写死「已接入」）
  absent: { rel: BRIDGE, txt: "      if (r.present !== true) { matched = false; why = why || 'absent'; }" },
  // 版本读不到 ⇒ 不当作匹配
  versionUnknown: { rel: BRIDGE, txt: "      else if (expect === null || version === null) { matched = false; why = 'version-unknown'; }" },
  // 两版相等才 matched
  versionMatch: { rel: BRIDGE, txt: "      else if (version === expect) { matched = true; why = 'matched'; }" },
  // 降级名单：每条没握手成的边都要现身
  degraded: { rel: BRIDGE, txt: "    const degraded = edges.filter(function (x) { return x.matched !== true; }).map(function (x) { return x.key + ':' + x.why; });" },
  // 真读者：separation 带上 handshake 那一面
  readerCall: { rel: THEME, txt: "          const h = WA.bridge.handshake();" },
  readerField: { rel: THEME, txt: "      handshake: (function () {" }
};
function env() { return fresh(); }
function edgeOf(h, key) { return (h.edges || []).filter(function (e) { return e.key === key; })[0] || null; }
// ── A 面 ────────────────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2128/x8: [A] 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const b = src(BRIDGE);
  a(b.indexOf('  function handshake() {') > 0, 'v2128/x8: [A] `handshake` 在位');
  a(b.indexOf('    handshake: handshake,') > 0, 'v2128/x8: [A] `handshake` 登记在导出面');
  // 纯读：handshake 体内不得有 transact / refresh / 对端调用
  const body = b.slice(b.indexOf('  function handshake() {'), b.indexOf('  const bridge = WA.bridge = {'));
  ['store.transact', 'saveSettings(', '.refresh(', '.publish('].forEach(function (bad) {
    a(body.indexOf(bad) < 0, 'v2128/x8: [A] `handshake` 体内零 `' + bad + '`（诊断不是命令）');
  });
}
// ── B 面 ────────────────────────────────────────────────────────────
function runB(a) {
  const W = env();
  const h = W.bridge.handshake();
  // B1 每个边都带齐五件：present / version / expect / matched / why
  a(h.ok === true && Array.isArray(h.edges) && h.edges.length >= 3,
    'v2128/x8: [B1] 握手报出全部边（实 ' + JSON.stringify((h.edges || []).length) + '）');
  a(h.edges.every(function (e) {
    return typeof e.present === 'boolean' && typeof e.matched === 'boolean'
      && typeof e.expect !== 'undefined' && typeof e.why === 'string' && e.why.length > 0;
  }), 'v2128/x8: [B1] 每边五件齐（present / version / expect / matched / why）');
  // B2 契约身份：桥 id 与本版认的版本
  a(h.bridge === 'worldaxis_bridge_v1' && typeof h.expectVersion === 'number',
    'v2128/x8: [B2] 报的是**契约身份**（实 ' + JSON.stringify([h.bridge, h.expectVersion]) + '）');
  // B3 本侧那条边在场且版本对得上（自己的边都握不上，别的都别提）
  const self = edgeOf(h, 'out');
  a(self && self.present === true && self.matched === true && self.why === 'matched',
    'v2128/x8: [B3] 本侧边在场且版本相符（实 ' + JSON.stringify(self && [self.present, self.matched, self.why]) + '）');
  // B4 缺席的边**如实留档**（不写死「已接入」），且进 degraded 名单
  const off = edgeOf(h, 'lonsha');
  a(off && off.present === false && off.matched === false && h.degraded.indexOf('lonsha:' + off.why) >= 0,
    'v2128/x8: [B4] 缺席边如实报 present:false 且进降级名单（实 ' + JSON.stringify(off && [off.present, off.why]) + '）');
  // B5 matched 的算法口子：**不是**「present 就算对上」
  a(self && typeof self.version === 'number' && self.version === self.expect,
    'v2128/x8: [B5] matched 要**两版相等**，不是「在场就算对上」（实 ' + JSON.stringify(self && [self.version, self.expect]) + '）');
  // B6 版本读不到 ⇒ version-unknown（把「不知道」说成「对上了」是本面要治的病）
  const W6 = env();
  const keep = W6.phoneBridge.version;
  W6.phoneBridge.version = null;
  const h6 = W6.bridge.handshake();
  W6.phoneBridge.version = keep;
  const e6 = edgeOf(h6, 'rubyphone');
  a(e6 && e6.present === true && e6.version === null && e6.matched === false && e6.why === 'version-unknown',
    'v2128/x8: [B6] 对端在场但版本读不到 ⇒ `version-unknown` 且不算匹配（实 '
    + JSON.stringify(e6 && [e6.present, e6.version, e6.matched, e6.why]) + '）');
  // B7 版本对不上 ⇒ version-mismatch
  const W7 = env();
  const keepV = W7.phoneBridge.version;
  W7.phoneBridge.version = 999;
  const h7 = W7.bridge.handshake();
  W7.phoneBridge.version = keepV;
  const e7 = edgeOf(h7, 'rubyphone');
  a(e7 && e7.matched === false && e7.why === 'version-mismatch',
    'v2128/x8: [B7] 版本对不上 ⇒ `version-mismatch`（实 ' + JSON.stringify(e7 && e7.why) + '）');
  // B8 探针抛错 ⇒ 该边如实记 probe-threw（不把异常吞成「在场」）
  const W8 = env();
  const keepP = W8.phoneBridge.phaseOf;
  W8.phoneBridge.phaseOf = function () { throw new Error('boom'); };
  const h8 = W8.bridge.handshake();
  W8.phoneBridge.phaseOf = keepP;
  const e8 = edgeOf(h8, 'rubyphone');
  a(e8 && e8.present === false && String(e8.why).indexOf('probe-threw') === 0,
    'v2128/x8: [B8] 探针抛错 ⇒ 该边记 `probe-threw` 且不算在场（实 ' + JSON.stringify(e8 && [e8.present, e8.why]) + '）');
  // B9 纯读：读数两次逐字相同；且不动存档
  const W9 = env();
  const sig = JSON.stringify(W9.store.get());
  //   比的是**去掉时点之后**的读数：`at` 取墙钟（`clockWall()`），两次调用必然差几十毫秒，
  //   拿整个 JSON 比会把「纯读」这条判据误伤成红（判据要落在被测的那个量上）。
  const strip = function (h) { const o = Object.assign({}, h); delete o.at; return JSON.stringify(o); };
  const r1 = W9.bridge.handshake(), r2 = W9.bridge.handshake();
  a(strip(r1) === strip(r2) && r1.at <= r2.at && JSON.stringify(W9.store.get()) === sig,
    'v2128/x8: [B9] 握手纯读（除时点外两次读数逐字相同、存档未变）');
  // B10 总账自洽：matchedCount + degraded.length = 边数
  const h10 = env().bridge.handshake();
  a(h10.matchedCount + h10.degraded.length === h10.edges.length
    && h10.matched === (h10.degraded.length === 0),
    'v2128/x8: [B10] 总账自洽（matched/degraded 与边数对得上；实 '
    + JSON.stringify([h10.matchedCount, h10.degraded.length, h10.edges.length]) + '）');
  // B11 口径诚实：note 明说「不宣称实机已验证」
  a(typeof h.note === 'string' && h.note.indexOf('不宣称实机已验证') > 0,
    'v2128/x8: [B11] 口径明写「只核契约、不宣称实机已验证」（实 ' + JSON.stringify(h.note) + '）');
  // B12 时间戳来自世界钟外墙钟（可核对：是个数）
  a(typeof h.at === 'number' && isFinite(h.at),
    'v2128/x8: [B12] 读数带时点（实 ' + JSON.stringify(h.at) + '）');
}
// ── C 面：真读者 ────────────────────────────────────────────────────
function runC(a) {
  const th = src(THEME);
  a(hits(th, 'WA.bridge.handshake()') === 1,
    'v2128/x8: [C1] 恰 1 处真调 `bridge.handshake`（在 separation 里）');
  a(th.indexOf(ANCHORS.readerField.txt) > 0,
    'v2128/x8: [C1] 读数落在 separation 的返回体上（调了不接结果就不算读者）');
  const W = env();
  const sep = W.theme.separation();
  a(sep && sep.roles && sep.roles.length === 3,
    'v2128/x8: [C2] separation 仍报三插件分工（旧口径没被挤掉；实 '
    + JSON.stringify(sep && sep.roles && sep.roles.length) + '）');
  a(sep.handshake && typeof sep.handshake.matched === 'boolean'
    && Array.isArray(sep.handshake.degraded),
    'v2128/x8: [C2] 分工那一面**带得动**契约这一件事实（实 '
    + JSON.stringify(sep.handshake && sep.handshake.matched) + '）');
  a(sep.roles.every(function (r) { return r && typeof r.present === 'boolean' && r.owner && r.duty; }),
    'v2128/x8: [C2] 三行的 present/owner/duty 逐行都在（缺席降级可见）');
  // C3 桥面缺席 ⇒ separation 如实降级（不抛、不假装）
  const W3 = env();
  const keep = W3.bridge;
  W3.bridge = undefined;
  let sep3 = null;
  try { sep3 = W3.theme.separation(); } catch (e) { sep3 = { threw: true }; }
  W3.bridge = keep;
  a(sep3 && !sep3.threw,
    'v2128/x8: [C3] 桥面缺席时 separation 不抛（如实降级）');
  a(sep3 && (sep3.handshake === null || (sep3.handshake && sep3.handshake.error === 'handshake-threw')),
    'v2128/x8: [C3] 桥面缺席 ⇒ 那一面如实说读不到（**null 就是「读不到」的合法形态**；实 '
    + JSON.stringify(sep3 && sep3.handshake) + '）');
  // C4 诊断面有真消费（handshake 的第二个读者）
  const dg = src(DIAG);
  a(dg.indexOf('const h = WA.bridge.handshake();') > 0,
    'v2128/x8: [C4] 诊断节也真读握手（无头环境下「谁在不在」必须当场可答）');
}
// ── N 面 ────────────────────────────────────────────────────────────
function runNegative(a) {
  const B0 = src(BRIDGE), T0 = src(THEME);
  const q = function (WA) { try { return WA.bridge.handshake(); } catch (e) { return { ok: false, reason: 'threw' }; } };
  // N1 缺席闸被拆 ⇒ 缺席的边被当成在场
  const n1 = breakOnce(B0, ANCHORS.absent.txt, "      if (false) { matched = false; why = why || 'absent'; }", 'N1');
  const W1 = fresh(over(BRIDGE, n1));
  const e1 = edgeOf(q(W1), 'lonsha');
  a(e1 && e1.present !== true,
    'v2128/x8: [N1]（正）原版上缺席边就是 present:false（两向自证；实 '
    + JSON.stringify(e1 && e1.present) + '）');
  a((function () {
    const eo = edgeOf(q(fresh()), 'lonsha');
    return eo && eo.present === false && eo.matched === false;
  })(), 'v2128/x8: [N1] 原版：缺席 ⇒ 不匹配');
  //   破坏点选在 `why` 上没有读数的路径：直接拆 matched 分支才可观测
  const n1b = breakOnce(B0, ANCHORS.absent.txt, "      if (r.present !== true) { matched = true; why = why || 'absent'; }", 'N1b');
  const e1b = edgeOf(q(fresh(over(BRIDGE, n1b))), 'lonsha');
  a(e1b && e1b.matched === true,
    'v2128/x8: [N1b] 拆掉缺席闸 ⇒ 缺席的边被报成「已握手」（B4 不是恒真；破坏后实 '
    + JSON.stringify(e1b && e1b.matched) + '）');
  // N2 版本读不到闸被拆 ⇒ 把「不知道」说成「对上了」
  const n2 = breakOnce(B0, ANCHORS.versionUnknown.txt, "      else if (expect === null || version === null) { matched = true; why = 'version-unknown'; }", 'N2');
  const W2 = fresh(over(BRIDGE, n2));
  const keep2 = W2.phoneBridge.version;
  W2.phoneBridge.version = null;
  const e2 = edgeOf(q(W2), 'rubyphone');
  W2.phoneBridge.version = keep2;
  a(e2 && e2.matched === true,
    'v2128/x8: [N2] 拆掉版本读不到闸 ⇒ 「不知道」被说成「对上了」（B6 不是恒真；破坏后实 '
    + JSON.stringify(e2 && e2.matched) + '）');
  // N3 版本相符闸被拆 ⇒ 版本对不上也算对上
  const n3 = breakOnce(B0, ANCHORS.versionMatch.txt, "      else if (version === expect) { matched = false; why = 'matched'; }", 'N3');
  const W3 = fresh(over(BRIDGE, n3));
  const self3 = edgeOf(q(W3), 'out');
  a(self3 && self3.matched === false,
    'v2128/x8: [N3] 拆掉相符闸 ⇒ 版本相符也不认（B3/B7 不是恒真；破坏后实 '
    + JSON.stringify(self3 && self3.matched) + '）');
  // N4 降级名单被拆 ⇒ 没握上的边在名单里消失（读者再也看不到「谁不在」）
  const n4 = breakOnce(B0, ANCHORS.degraded.txt, '    const degraded = [];', 'N4');
  a(q(fresh(over(BRIDGE, n4))).degraded.length === 0 && q(fresh()).degraded.length > 0,
    'v2128/x8: [N4] 拆掉降级名单 ⇒ 「谁没握上」在读数里消失（B4/B10 不是恒真；破坏后实 '
    + JSON.stringify(q(fresh(over(BRIDGE, n4))).degraded) + '）');
  // N5 读者被拆（separation 不再带 handshake）⇒ 该面成为孤儿
  const n5 = breakOnce(T0, ANCHORS.readerCall.txt, '          const h = null;', 'N5');
  a(q(fresh()).ok === true && hits(src(BRIDGE), ANCHORS.readerCall.txt.replace('WA.bridge.', '')) === 0,
    'v2128/x8: [N5]（前置）原版上那处读者调用在位（判据不是空集）');
  const W5 = fresh(over(THEME, n5));
  const sep5 = (function () { try { return W5.theme.separation(); } catch (e) { return { threw: true }; } })();
  a(sep5 && (sep5.handshake === null || (sep5.handshake && sep5.handshake.error)),
    'v2128/x8: [N5] 拆掉读者调用 ⇒ separation 那一面读不到契约（C1 不是恒真；实 '
    + JSON.stringify(sep5 && sep5.handshake) + '）');
  // N6 纯度
  a(src(BRIDGE) === B0 && src(THEME) === T0,
    'v2128/x8: [N6]（纯度）全部负控制跑完后两个真文件逐字未变');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: BRIDGE
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); runB(a); runC(a); } catch (e) { fail++; console.log('  x A/B/C threw: ' + (e && e.stack)); }
  try { runNegative(a); } catch (e) { fail++; console.log('  x neg threw: ' + (e && e.stack)); }
  if (fail) { console.log('X8-HANDSHAKE-V2128: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('X8-HANDSHAKE-V2128: pass（' + pass + ' 项）');
}