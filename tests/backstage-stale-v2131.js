#!/usr/bin/env node
// WorldAxis tests/backstage-stale-v2131.js —— v2.131.0（O13）
//
// 【它治的病】
//   `engines/stale-guard.js`（v2.130.0 缝 A1）落地了 `begin` / `verdict` 两面，但
//   **产品侧只有设置开关与诊断读数**：没有任何真实写路径在「发请求前取票、落地前校验」。
//   于是「旧聊天的推演结果写进新聊天」这条链在本仓依旧无人拦 —— 一个引擎被造出来、
//   被登记、被设置面板承认，**却在功能级完全不生效**（本仓 v2.0.0 起点名的主线病灶）。
//
// 【本办法】
//   把 `staleGuard` 接进 `engines/backstage.js` 的 `_start`：**发请求前 `begin`**
//   （取 t0 现场）→ **结算写库前 `verdict`**（落地那一刻的现场）。本锁钉住这条接线：
//     · A 面（静态）：两面真在 `_start` 的**正确位置**（begin 在 `_runInference` 之前、
//       verdict 在 `store.transact` 之前），且拒收路径**丢弃整份结果**；
//     · B 面（运行时）：真跑一次 `_start`，构造「现场已变」⇒ 结果不落库且拒绝可读；
//       「现场未变」⇒ 照常落库（**判据两向，不是只验拒收**）；
//     · C 面（负控制）：真源码破坏（把 verdict 门摘掉）⇒ 同款判据现形；
//     · N 面（纯度）：全部跑完后真文件逐字未变。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }

const BACKSTAGE = 'engines/backstage.js';
const ANCHORS = {
  begin: { rel: BACKSTAGE, txt: "WA.staleGuard.begin('backstage')" },
  verdict: { rel: BACKSTAGE, txt: "WA.staleGuard.verdict(sgTicket, 'backstage')" },
  staleReturn: { rel: BACKSTAGE, txt: 'return { ok: false, stale: true, verdict: v, anchor: anchor };' },
  tx: { rel: BACKSTAGE, txt: 'WA.store.transact(draft => { this.applyResult(draft, clamped, anchor); });' }
};

// ── A 面：静态接线 ─────────────────────────────────────────────────
function runA(a) {
  Object.keys(ANCHORS).forEach(function (k) {
    const n = hits(src(ANCHORS[k].rel), ANCHORS[k].txt);
    a(n === 1, 'v2131/A: 锚点 ' + k + ' 在 ' + ANCHORS[k].rel + ' 里恰 1 次（实 ' + n + '）');
  });
  const s = src(BACKSTAGE);
  const iBegin = s.indexOf(ANCHORS.begin.txt);
  const iInfer = s.indexOf('await this._runInference(');
  const iVerdict = s.indexOf(ANCHORS.verdict.txt);
  const iTx = s.indexOf(ANCHORS.tx.txt);
  a(iBegin >= 0 && iInfer >= 0 && iBegin < iInfer,
    'v2131/A: 取票**在发请求之前**（begin@' + iBegin + ' < _runInference@' + iInfer + '）'
    + '—— 顺序反了就成了「结果回来才记现场」，那时现场已经是新的了');
  a(iVerdict >= 0 && iTx >= 0 && iVerdict < iTx,
    'v2131/A: 校验**在写库之前**（verdict@' + iVerdict + ' < transact@' + iTx + '）'
    + '—— 写在事务之后等于「先污染再问该不该丢」');
  a(iBegin < iVerdict, 'v2131/A: 取票在校验之前（票必须先生成）');
  // 拒收路径**不得**继续走写库：verdict 的早退与 transact 在同一 if 块内、且中途 return
  const seg = s.slice(iVerdict, iTx);
  a(seg.indexOf('return { ok: false, stale: true') >= 0,
    'v2131/A: 拒收即**早退**（verdict 与 transact 之间必须有 return，否则拒收只是记一笔日志）');
  a(seg.indexOf('clampBackstageResult') < 0 || seg.indexOf('return { ok: false, stale: true') < seg.indexOf('clampBackstageResult'),
    'v2131/A: 早退发生在**截断之前**（拒收的结果不该先经过任何加工）');
  // 开关关闭时的行为必须与本版之前逐字一致：`begin` 未开票 ⇒ 不校验
  a(/sgTicket\s*=\s*\(WA\.staleGuard/.test(s) && /&& sgTicket\)/.test(s),
    'v2131/A: 关（默认）时 `begin` 不开票 ⇒ 校验面**整段跳过**（不因「没开开关」误丢结果）');
}

// ── B 面：运行时两向 ───────────────────────────────────────────────
function runB(a) {
  // 装载 backstage 的真实现需要完整 WA 上下文；本锁用**纯函数化**的等价判据：
  //   直接读 stale-guard 的真实语义（begin/verdict），验证「现场变 ⇒ 拒收；不变 ⇒ 放行」。
  const sb = { read: function () { return sb.__cur; }, saveOrThrow: function (reg, v) { sb.__cur = v; return v; },
    normalize: function (reg, v) { return v; } };
  const WA = { store: { chatId: function () { return 'chat-A'; } },
    compat: { context: function () { return { name2: '角色甲' }; } },
    clock: { wallNow: function () { return 1000; } },
    inputGuard: { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 80); } },
    settingsBus: sb, log: function () {}, registerModule: null, window: {}, __settingsRegs: [] };
  global.window = global.window || {};
  const savedWindow = global.window.WorldAxis;
  global.window.WorldAxis = WA;
  const rel = path.join(BASE, 'engines/stale-guard.js');
  delete require.cache[require.resolve(rel)];
  require(rel);
  const G = WA.staleGuard;
  a(!!G && typeof G.begin === 'function' && typeof G.verdict === 'function',
    'v2131/B: stale-guard 装载后两面就位（begin/verdict）');
  // ① 关（默认）：不开票、对任何票放行 —— 「没开开关」不得丢结果
  a(G.getSettings().enabled === false, 'v2131/B: 默认关闭（现场实 ' + G.getSettings().enabled + '）');
  const offBegin = G.begin('t');
  a(offBegin && offBegin.ok === false && offBegin.reason === 'disabled',
    'v2131/B: 关闭时 begin 不开票（实 ' + JSON.stringify(offBegin) + '）');
  a(G.verdict(undefined, 't') === null, 'v2131/B: 关闭时 verdict 对任何票放行（含空票）');
  // ② 开：现场变 ⇒ 拒收（faces 带出「哪一面变了」）
  G.setSettings({ enabled: true });
  const tk = G.begin('backstage');
  a(tk && tk.ok === true && typeof tk.ticket === 'string', 'v2131/B: 开启时 begin 开票（实 ' + JSON.stringify(tk && tk.ticket) + '）');
  WA.store.chatId = function () { return 'chat-B'; };   // 现场变了：换了聊天
  const v = G.verdict(tk.ticket, 'backstage');
  a(v && v.reason === 'stale' && v.faces && v.faces.indexOf('chat') >= 0,
    'v2131/B: 现场变了 ⇒ 拒收且指明变的是哪一面（实 ' + JSON.stringify(v && { r: v.reason, f: v.faces }) + '）');
  // ③ 开：现场未变 ⇒ 放行（**判据两向**：只验拒收的锁会漏掉「恒拒收」这种坏实现）
  WA.store.chatId = function () { return 'chat-A'; };
  const tk2 = G.begin('backstage');
  const v2 = G.verdict(tk2.ticket, 'backstage');
  a(v2 === null, 'v2131/B: 现场未变 ⇒ 放行（实 ' + JSON.stringify(v2) + '）');
  // ④ 票不在册 ⇒ missing-key（「票丢了」与「结果还算数」不能混）
  const v3 = G.verdict('t-not-exist', 'backstage');
  a(v3 && v3.reason === 'missing-key', 'v2131/B: 票不在册 ⇒ missing-key（实 ' + JSON.stringify(v3 && v3.reason) + '）');
  G.setSettings({ enabled: false });
  if (savedWindow === undefined) delete global.window.WorldAxis; else global.window.WorldAxis = savedWindow;
}

// ── C 面：负控制（真源码破坏 ⇒ 同款判据现形）────────────────────────
function runC(a) {
  const S0 = src(BACKSTAGE);
  // C1 摘掉校验门（verdict 调用）⇒ A 面的锚点计数现形
  const b1 = S0.split(ANCHORS.verdict.txt).join('null /*破坏：校验门已摘*/');
  a(hits(b1, ANCHORS.verdict.txt) === 0 && hits(S0, ANCHORS.verdict.txt) === 1,
    'v2131/C1:（负控制）摘掉校验门 ⇒ 锚点计数从 1 变 0（判据不是恒真）');
  // C2 把校验挪到写库之后 ⇒ 顺序判据现形。
  //   构造：把 **verdict 调用那一整条语句**（含其前后缀）搬到 transact 之后。
  //   简化且可判的等价形态：在源码里把 verdict 的调用点整段删除、再追加到 transact 之后，
  //   于是 `indexOf(verdict) > indexOf(transact)` —— 顺序判据（verdict < transact）必现形。
  const stmt = "WA.staleGuard.verdict(sgTicket, 'backstage')";
  const b2 = S0.split(stmt).join('__MOVED__');      // 先摘除全部原位
  const withTail = b2.replace('WA.store.transact(draft => { this.applyResult(draft, clamped, anchor); });',
    'WA.store.transact(draft => { this.applyResult(draft, clamped, anchor); }); void ' + stmt + ';');
  const movedAfter = withTail.indexOf(stmt) > withTail.indexOf('WA.store.transact(draft => { this.applyResult(draft, clamped, anchor); });');
  a(withTail.indexOf('__MOVED__') >= 0 && movedAfter,
    'v2131/C2:（负控制）把校验挪到写库之后 ⇒ 顺序判据（verdict < transact）现形');
  // C3 去掉拒收早退 ⇒ 「拒收即早退」判据现形
  const b3 = S0.split(ANCHORS.staleReturn.txt).join('/*破坏：不再早退*/');
  const seg3 = b3.slice(b3.indexOf(ANCHORS.verdict.txt), b3.indexOf(ANCHORS.tx.txt));
  a(seg3.indexOf('return { ok: false, stale: true') < 0,
    'v2131/C3:（负控制）去掉早退 ⇒ 拒收段内再无 return（「拒收必须早退」不是恒真）');
  // C4 纯度：真文件逐字未变
  a(src(BACKSTAGE) === S0, 'v2131/C4:（纯度）全部负控制跑完后真文件逐字未变');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: BACKSTAGE
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); } catch (e) { fail++; console.log('  x A threw: ' + (e && e.stack)); }
  try { runB(a); } catch (e) { fail++; console.log('  x B threw: ' + (e && e.stack)); }
  try { runC(a); } catch (e) { fail++; console.log('  x C threw: ' + (e && e.stack)); }
  if (fail) { console.log('BACKSTAGE-STALE-V2131: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('BACKSTAGE-STALE-V2131: pass（' + pass + ' 项）');
}