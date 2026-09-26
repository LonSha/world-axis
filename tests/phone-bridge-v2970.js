#!/usr/bin/env node
// WorldAxis tests/phone-bridge-v2970.js —— v2.97.0（X5 跨插件因果桥·入站边）
//
// 【它治的病：两边的「现在」对不上】
//   engines/bridge.js 做的是**出站**边（本扩展的世界投影出去给 RubyPhone / LonSha 读），
//   而反向那条边一直是断的：手机侧的交互动作（回消息 / 置顶 / 拉黑 / 解除）在真实剧情里
//   **就是世界里的因**，本扩展却看不见它们。于是一次「拉黑」之后，因果结算面照旧只有
//   正文里冒出来的那些 cause —— 同一件事在两边各说一遍，谁的版本算数没有判据。
//
// 【口径（六条，全是否定式——这六条正是本模块存在的全部理由）】
//   ① 入站是**显式动作**：`noteAction()` 是唯一写入口。不挂监听、不轮询、不自动消费快照。
//   ② **绝不覆盖世界状态**：只写 `causal.phoneOps` 一笔台账，一个字段都不碰
//      ——手机侧说「拉黑了谁」不等于世界里的关系已变，那是结算面的事。
//   ③ **幂等**：同一笔操作重复上报（手机侧重试是常态）返回 `reused:true`，台账不涨。
//      且幂等判定必须**先于**满员判定——否则台账满时同一笔重试会从「已收下」翻成「没收下」。
//   ④ **不认识的动作一律拒收**（`unknown-act`）：白名单四值封闭，不回落成 message。
//   ⑤ **能力缺席如实降级**：默认休眠时 `disabled`；零上报时 `unknown`
//      ——不允许用 `quiet` 冒充「我检查过，它没在推」。
//   ⑥ **可追溯**：`traceOf` / `opTrace` 双向读，追溯靠真源比对而不是字符串拼接猜。
//
// 【判据】
//   A 静态面：容量常量（不做滑块）+ 十二个导出口 + 消费方（store 骨架 / evict 站点 /
//             诊断 secPhoneBridge / 面板 wa-pb-*）。
//   B 运行时面（真装载真调用）：
//     B1 默认休眠 ⇒ 拒收且不入台账（「收下了但不记」与「没收下」是两件事）
//     B2 上报后台账多一笔，而 `causal.chains` **一格不动**（口径②的运行时证据）
//     B3 幂等（reused，台账不涨）；B4 未知动作拒收（不入台账）
//     B5 接链四态（unknown-chain / ok / already / already-linked 且**不覆盖**）
//     B6 traceOf / opTrace 双向；B7 满员拒收 + 满员时重试仍 reused（顺序不可颠倒）
//     B8 相位三态（disabled / unknown / pushing）；B9 诊断 traces 真消费。
//   N0–N8 负控制：真源码破坏 ⇒ 加载破坏副本 ⇒ 在副本上重跑同款真判据。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const PB = 'engines/phone-bridge.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js', STORE = 'core/store.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自恰中 1 次）══════════════
const ANCHORS = {
  // 口径⑤ 关闭时照实报 disabled，**不返回成功**
  DISABLED_NOT_OK: { rel: PB, txt: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }" },
  // 口径③ 幂等判定（在满员判定之前短路）
  IDEMPOTENT_FIRST: { rel: PB, txt: "      const hit = c.phoneOps.filter(function (x) { return x && x.opId === opId; })[0];" },
  // 口径③ 满员**拒收**（不静默挤掉最早的——挤掉一笔等于让「这条链的因」事后消失）
  CAP_REJECT: { rel: PB, txt: "      if (c.phoneOps.length >= MAX_OPS) { out = { ok: false, reason: 'ops-full', cap: MAX_OPS }; return false; }" },
  // 口径⑥ 已接过别的链**不覆盖**
  LINK_NO_OVERWRITE: { rel: PB, txt: "      if (hit.chainId) { out = { ok: false, reason: 'already-linked', opId: op, chainId: hit.chainId, want: cid }; return false; }" },
  // 口径⑥ 链必须**已存在**（接一条不存在的链 = 用桥给世界造一条因果）
  LINK_CHAIN_EXISTS: { rel: PB, txt: "    if (!exists) { stat.linkFails++; return { ok: false, reason: 'unknown-chain', chainId: cid }; }" },
  // 口径⑤ 零上报 ⇒ unknown（不是 quiet）
  PHASE_NO_FAKE_QUIET: { rel: PB, txt: "    if (!last) return { phase: 'unknown', sinceMs: -1, note: '本会话尚未收到过任何手机侧上报（与「它没在推」不是同一件事）' };" }
};
const BREAK = {
  DISABLED_NOT_OK: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: true, reason: 'disabled' }; }",
  IDEMPOTENT_FIRST: "      const hit = null; // 破坏：不认重复 ⇒ 手机侧重试会把台账写胀",
  CAP_REJECT: "      if (false) { out = { ok: false, reason: 'ops-full', cap: MAX_OPS }; return false; }",
  LINK_NO_OVERWRITE: "      if (false) { out = { ok: false, reason: 'already-linked', opId: op, chainId: hit.chainId, want: cid }; return false; }",
  LINK_CHAIN_EXISTS: "    if (false && !exists) { stat.linkFails++; return { ok: false, reason: 'unknown-chain', chainId: cid }; }",
  PHASE_NO_FAKE_QUIET: "    if (!last) return { phase: 'quiet', sinceMs: -1, note: '本会话尚未收到过任何手机侧上报（与「它没在推」不是同一件事）' };"
};
function breakOne(key) {
  const A = ANCHORS[key];
  const s = src(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}
// ══════════════ 运行时装置 ══════════════
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.causal = { chains: [], settled: [], phoneOps: [] };
    // cause 必须是**已存在的世界事实**（causal.addChain 按 worldFacts 校验，unknown-cause 拒收）
    d.worldFacts = [{ id: 'fx', key: 'fx' }, { id: 'fy', key: 'fy' }];
  }, 'v2970pb:seed');
  return WA;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H;
}
function on(W) { W.phoneBridge.setSettings({ enabled: true }); return W; }
function rows(W) { return ((W.store.get().causal || {}).phoneOps || []); }
function chainIds(W) { return ((W.store.get().causal || {}).chains || []).map(function (x) { return x.id; }); }
function mkChain(W, cause, action) {
  const r = W.causal.addChain({ cause: cause || 'fx', action: action || 'a' });
  return r && r.ok ? r.id : '';
}
// ══════════════ 同款真判据 ══════════════
/** 口径⑤：关闭时「收下了但不记」与「没收下」必须分得开——关闭即拒收且不入台账。 */
function probeDisabled(W) {
  try {
    const P = W.phoneBridge;
    // 装置注意：`fresh()` 的 localStorage 是**跨实例保留**的，设置一经写入后续实例照样读到。
    //   故这里先复位到默认休眠——否则本探针会读到上一条探针的手指印（与「共享实例」同型的陷阱）。
    P.setSettings({ enabled: false });
    if (P.getSettings().enabled !== false) return false;   // 默认必须休眠
    const r = P.noteAction({ opId: 'd1', act: 'message' });
    const p = P.phaseOf();
    return r.ok === false && r.reason === 'disabled' && rows(W).length === 0 && p.phase === 'disabled';
  } catch (e) { return false; }
}
/** 口径③：幂等——同一笔操作上报两次，台账只应有一笔。 */
function probeIdempotent(W) {
  try {
    on(W);
    const P = W.phoneBridge;
    const r1 = P.noteAction({ opId: 'i1', act: 'block', to: '甲' });
    const n1 = rows(W).length;
    const r2 = P.noteAction({ opId: 'i1', act: 'block', to: '甲' });
    const n2 = rows(W).length;
    // 幂等的判据有两半：返回值说 reused，且**台账真的一格没涨**（只说 reused 而偷偷 push 是更坏的失实）
    return r1.ok === true && r1.reused === false && n1 === 1
      && r2.ok === true && r2.reused === true && n2 === 1 && r2.id === r1.id;
  } catch (e) { return false; }
}
/** 口径③：满员**拒收**且原有台账逐笔还在（不静默挤掉最早的那一笔）。 */
function probeCapReject(W) {
  try {
    on(W);
    const P = W.phoneBridge;
    for (let i = 0; i < 40; i++) P.noteAction({ opId: 'c' + i, act: 'message' });
    const n0 = rows(W).length;
    const firstId = rows(W)[0] && rows(W)[0].id;
    const over = P.noteAction({ opId: 'over', act: 'message' });
    const after = rows(W);
    // 两件事一并验：① 满员那一笔被拒（ops-full 且 cap 报得出）；② 台账里**第一笔仍是原来那一笔**。
    //   缺了②，判据只证「拒了」而不证「没挤掉」——而「静默挤掉」正是本仓库点名反对的那类失效。
    return n0 === 40 && over.ok === false && over.reason === 'ops-full' && over.cap === 40
      && after.length === 40 && after[0].id === firstId;
  } catch (e) { return false; }
}
/** 口径⑥：已接过别的链**不覆盖**（静默改写会让「这条链的因」事后被换掉而没人知道）。 */
function probeLinkNoOverwrite(W) {
  try {
    on(W);
    const P = W.phoneBridge;
    P.noteAction({ opId: 'k1', act: 'pin' });
    const c1 = mkChain(W, 'fx'), c2 = mkChain(W, 'fy');
    if (!c1 || !c2 || c1 === c2) return false;
    const a1 = P.linkChain('k1', c1);
    const bad = P.linkChain('k1', c2);
    const st = P.opTrace('k1');
    return a1.ok === true && a1.already === false
      && bad.ok === false && bad.reason === 'already-linked' && bad.chainId === c1
      && st.chainId === c1;
  } catch (e) { return false; }
}
/** 口径⑥：链必须已存在（拿桥给世界造因果是更坏的选项）。 */
function probeLinkChainExists(W) {
  try {
    on(W);
    const P = W.phoneBridge;
    P.noteAction({ opId: 'e1', act: 'message' });
    const r = P.linkChain('e1', 'cs_not_a_real_chain');
    const t = P.opTrace('e1');
    return r.ok === false && r.reason === 'unknown-chain' && t.linked === false && t.chainId === '';
  } catch (e) { return false; }
}
/** 口径⑤：零上报 ⇒ unknown（**不允许**用 quiet 冒充「我检查过，它没在推」）。 */
function probePhaseNoFakeQuiet(W) {
  try {
    const P = W.phoneBridge;
    P.setSettings({ enabled: false });                      // 同上：设置跨实例保留，先复位
    if (P.phaseOf().phase !== 'disabled') return false;     // 休眠态是第三态，先确认
    on(W);
    const p0 = P.phaseOf();
    if (p0.phase !== 'unknown' || p0.sinceMs !== -1) return false;
    P.noteAction({ opId: 'p1', act: 'message' });
    const p1 = P.phaseOf();
    // 三态必须**分得开**：disabled / unknown（不知道）/ pushing（确在推）
    return p1.phase === 'pushing' && P.PHASES.length === 3;
  } catch (e) { return false; }
}
function runAll(a) {
  const pbSrc = src(PB), diagSrc = src(DIAG), panSrc = src(PANEL), stSrc = src(STORE);
  // ── A 静态面 ──
  // 自纠：容量必须是**常量**，且这个常量要能被读出来（`stat().maxOps` 与 evict 站点同源）。
  //   前两版判据都写错了方向：拿 `maxOps:` 当「滑块的痕迹」判死 —— 而常量正该被报出来让人看见。
  //   真正的反面证据是「设置项里有它 + 有 bounds 滑块」：那才会出现
  //   「设置里写着 200、evict 站点却按 40 静默挤掉」的两套容量治理。
  a(pbSrc.indexOf('const MAX_OPS = 40;') >= 0
    && pbSrc.indexOf('maxOps: MAX_OPS') >= 0
    && pbSrc.indexOf('bounds') < 0 && pbSrc.indexOf('maxOps:') === pbSrc.indexOf('maxOps: MAX_OPS'),
    'v2970pb: [A1] 容量是**常量** MAX_OPS（报得出来 + 设置面**没有**同名滑块/bounds——两套容量治理会互相打架）');
  const EXPORTS = ['id', 'version', 'PHONE_ACTS', 'ACT_LABEL', 'PHASES', 'getSettings', 'setSettings',
    'noteAction', 'linkChain', 'traceOf', 'opTrace', 'phaseOf', 'stat', 'opsView'];
  // 判据只问「这个名字在导出块里有没有出口」——不假定缩进（`id` 与 `version` 同在一行）。
  const missing = EXPORTS.filter(function (k) { return pbSrc.indexOf(k + ': ') < 0; });
  a(missing.length === 0, 'v2970pb: [A1] 十四个导出口在位（缺 ' + (missing.join(',') || '无') + '）');
  a(pbSrc.indexOf("'worldaxis_phone_ops_v1'") >= 0 && pbSrc.indexOf('WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);') >= 0,
    'v2970pb: [A1] 桥 id 与设置登记在位（设置项走 settingsBus 同一套，不自建第二套）');
  // 消费方：台账容器 + evict 站点同源 + 诊断节 + 面板八控件
  a(stSrc.indexOf('phoneOps') >= 0 && stSrc.indexOf("'causal.phoneOps'") >= 0,
    'v2970pb: [A2] store 侧有台账容器与容量登记（causal.phoneOps）');
  a(pbSrc.indexOf("WA.evict.array(c.phoneOps, 'phoneBridge.ops')") >= 0,
    'v2970pb: [A2] 兜底剪枝走**既有 evict 站点**（phoneBridge.ops）——不自建第二套容量治理');
  a(diagSrc.indexOf('function secPhoneBridge()') >= 0 && diagSrc.indexOf('phoneBridge: secPhoneBridge(),') >= 0,
    'v2970pb: [A2] 诊断节 secPhoneBridge 在位并挂进 collect()（无消费方的导出等于死面，本仓库判据只认调用点）');
  a(diagSrc.indexOf('tr = WA.phoneBridge.traceOf(cid)') >= 0,
    'v2970pb: [A2] 诊断真消费 traceOf（「这条链的因在不在手机侧」必须在诊断面可答，否则只有写它的那一方知道）');
  a(panSrc.indexOf('id="wa-pb-note"') >= 0 && panSrc.indexOf('WA.phoneBridge.noteAction(') >= 0
    && panSrc.indexOf('WA.phoneBridge.linkChain(') >= 0 && panSrc.indexOf('WA.phoneBridge.opTrace(') >= 0,
    'v2970pb: [A2] 面板八控件与三处真调用在位（登记 / 接链 / 追溯各有唯一入口）');
  a(diagSrc.indexOf("'wa-pb-enabled'") >= 0 && diagSrc.indexOf("'wa-pb-trace'") >= 0
    && panSrc.indexOf("$('#wa-pb-enabled')") >= 0 && panSrc.indexOf('el.onchange') >= 0,
    'v2970pb: [A2] 八个控件登记进 UI_BINDINGS（tool-diag 侧）且有绑定期接线——渲染↔绑定一致性守卫的通路');
  // ── B 运行时面 ──
  a(probeDisabled(env().WA),
    'v2970pb: [B1] 默认休眠 ⇒ 拒收 disabled 且**不入台账**（「收下了但不记」与「没收下」是两件事，状态里必须分得开）');
  // B2 只写台账、不碰世界状态
  const W2 = on(env().WA);
  const chainN0 = chainIds(W2).length;
  const r2 = W2.phoneBridge.noteAction({ opId: 'n1', act: 'unblock', to: '乙', from: '本机' });
  const row2 = rows(W2)[0];
  a(r2.ok === true && r2.reused === false && rows(W2).length === 1
    && row2.opId === 'n1' && row2.act === 'unblock' && row2.actLabel === '解除拉黑' && row2.seq === 1 && row2.chainId === '',
    'v2970pb: [B2] 一笔上报落成台账一行（opId / act / actLabel / seq / 未接链时 chainId 为空）');
  a(chainIds(W2).length === chainN0,
    'v2970pb: [B2] **绝不覆盖世界状态**：上报一笔操作后 causal.chains 一格不动（口径②的运行时证据）');
  // B3 未知动作拒收
  const W3 = on(env().WA);
  const u1 = W3.phoneBridge.noteAction({ opId: 'u1', act: 'nonsense' });
  const u2 = W3.phoneBridge.noteAction({ opId: '', act: 'message' });
  a(u1.ok === false && u1.reason === 'unknown-act' && rows(W3).length === 0,
    'v2970pb: [B3] 未知动作拒收 unknown-act 且不入台账（不回落成 message——那是替外部决定本扩展的因果词汇表）');
  a(u2.ok === false && u2.reason === 'missing-op',
    'v2970pb: [B3] 缺 opId 拒收 missing-op（「缺哪个」比「失败」有用）');
  // B4 幂等
  a(probeIdempotent(env().WA),
    'v2970pb: [B4] 幂等：重复上报返回 reused 且**台账一格没涨**（手机侧重试是常态，不能把台账写胀）');
  // B5 接链四态
  const W5 = on(env().WA);
  W5.phoneBridge.noteAction({ opId: 'l1', act: 'block', to: '甲' });
  const c1 = mkChain(W5, 'fx'), c2 = mkChain(W5, 'fy');
  const bx = W5.phoneBridge.linkChain('l1', 'cs_nope');
  const b1 = W5.phoneBridge.linkChain('l1', c1);
  const b2 = W5.phoneBridge.linkChain('l1', c1);
  a(bx.ok === false && bx.reason === 'unknown-chain',
    'v2970pb: [B5] 接不存在的链被拒（unknown-chain）——拿桥给世界造一条因果是更坏的选项');
  a(b1.ok === true && b1.already === false && b2.ok === true && b2.already === true,
    'v2970pb: [B5] 接链成功，重复接同一条返回 already:true（幂等，不重复计数）');
  a(probeLinkNoOverwrite(env().WA),
    'v2970pb: [B5] 已接过别的链 ⇒ already-linked 且**不覆盖**（静默改写会让「这条链的因」事后被换掉而没人知道）');
  a(probeLinkChainExists(env().WA),
    'v2970pb: [B5] 链存在性是真判据（副本上拆掉它，判据现形）');
  // B6 双向追溯
  const W6 = on(env().WA);
  W6.phoneBridge.noteAction({ opId: 't1', act: 'message', to: '丙' });
  const c6 = mkChain(W6, 'fx');
  W6.phoneBridge.linkChain('t1', c6);
  const tr = W6.phoneBridge.traceOf(c6);
  const ot = W6.phoneBridge.opTrace('t1');
  a(tr.ok === true && tr.count === 1 && tr.items[0].opId === 't1' && tr.items[0].act === 'message',
    'v2970pb: [B6] traceOf（链 → 操作）：evidence() 那条判据的读口，答「这条链的因在手机侧」');
  a(ot.ok === true && ot.chainId === c6 && ot.linked === true,
    'v2970pb: [B6] opTrace（操作 → 链）：反方向同样只读可查');
  const trNone = W6.phoneBridge.traceOf(mkChain(W6, 'fy'));
  a(trNone.ok === true && trNone.count === 0 && !!trNone.note,
    'v2970pb: [B6] 一笔都没接上**不是错误**但必须可见（给出 note：这条链的因在世界侧）——缺席不得被读成无事发生');
  const otMiss = W6.phoneBridge.opTrace('never-noted');
  a(otMiss.ok === false && otMiss.reason === 'unknown-op',
    'v2970pb: [B6] 查不到的操作照实报 unknown-op（不返回一个空对象冒充「它在，只是没接链」）');
  // B7 满员拒收 + 顺序（幂等先于满员）
  a(probeCapReject(env().WA),
    'v2970pb: [B7] 满员**拒收**（ops-full 且报 cap）且原有台账逐笔还在——挤掉一笔等于让「这条链的因」事后消失');
  const W7 = on(env().WA);
  for (let i = 0; i < 40; i++) W7.phoneBridge.noteAction({ opId: 'f' + i, act: 'message' });
  const retry = W7.phoneBridge.noteAction({ opId: 'f1', act: 'message' });
  a(retry.ok === true && retry.reused === true && rows(W7).length === 40,
    'v2970pb: [B7] 台账满时**重试已有那一笔**仍返回 reused（幂等判定必须先于满员判定——顺序颠倒会把重试语义从「已收下」翻成「没收下」）');
  // B8 相位三态
  a(probePhaseNoFakeQuiet(env().WA),
    'v2970pb: [B8] 相位三态分得开：disabled / unknown（零上报，**不许**用 quiet 冒充）/ pushing');
  const W8 = on(env().WA);
  W8.phoneBridge.noteAction({ opId: 'ph1', act: 'message' });
  const p8 = W8.phoneBridge.phaseOf();
  a(p8.phase === 'pushing' && p8.sinceMs >= 0 && typeof p8.note === 'string',
    'v2970pb: [B8] 有过上报且窗口内 ⇒ pushing（带 sinceMs 与 note，读数带说明而不是一个光秃秃的枚举）');
  // B9 诊断面
  const W9 = on(env().WA);
  W9.phoneBridge.noteAction({ opId: 'z1', act: 'message' });
  const cz = mkChain(W9, 'fx');
  W9.phoneBridge.linkChain('z1', cz);
  const dg = W9.toolDiag.collect();
  const pb9 = dg.phoneBridge || {};
  a(pb9.id === 'worldaxis_phone_ops_v1' && pb9.maxOps === 40 && pb9.rows === 1 && pb9.linkedRows === 1 && pb9.unlinked === 0,
    'v2970pb: [B9] 诊断报出桥 id / 容量常量 / 台账现值（rows / linkedRows / unlinked 三态分列）');
  a(Array.isArray(pb9.traces) && pb9.traces.length === 1 && pb9.traces[0].chainId === cz && pb9.traces[0].count === 1,
    'v2970pb: [B9] 诊断的 traces 走**真 traceOf**（链 → 操作）而不是自己拼字符串（实 '
      + JSON.stringify(pb9.traces) + '）');
  a(pb9.phase === 'pushing' && Array.isArray(pb9.acts) && pb9.acts.length === 4 && !!pb9.actLabels,
    'v2970pb: [B9] 诊断报出相位与动作白名单（白名单是**封闭集合**，诊断面必须能读出它封了哪四个）');
  // B10 台账行的形状（追溯靠真源比对，不靠字符串拼接猜）
  const rw = rows(W9)[0];
  a(!!rw.id && !!rw.at && rw.seq === 1 && typeof rw.actLabel === 'string' && 'chainId' in rw,
    'v2970pb: [B10] 台账行带 id / at（决策时间）/ seq（递变序）/ actLabel——追溯的凭据是这些字段，不是把 opId 拼进链 id 去猜');
}
function runNegative(a) {
  const pbSrc = src(PB);
  Object.keys(ANCHORS).forEach(function (k) { must1(src(ANCHORS[k].rel), ANCHORS[k].txt, k); });
  // N0 锚点工具两向自证（自证必须打 must1——hits 是纯计数永不抛，拿它自证等于什么都没证）
  let threw = 0;
  try { must1(pbSrc, '锚点根本不在源码里__v2970pb', 'self'); } catch (e) { threw++; }
  try { must1(pbSrc + ANCHORS.CAP_REJECT.txt, ANCHORS.CAP_REJECT.txt, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'v2970pb: [N0] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  // N1 原版干净（每条探针**独立实例**——它们都会写台账，共享实例会读到前一条的手指印）
  const n1 = [['disabled', probeDisabled], ['idempotent', probeIdempotent], ['capReject', probeCapReject],
    ['linkNoOverwrite', probeLinkNoOverwrite], ['linkChainExists', probeLinkChainExists],
    ['phaseNoFakeQuiet', probePhaseNoFakeQuiet]]
    .map(function (p) { return { name: p[0], ok: p[1](env().WA) }; });
  const bad = n1.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
  a(bad.length === 0, 'v2970pb: [N1] 原版上六条判据全部干净（不干净的是 ' + (bad.join(',') || '无') + '）');
  // N2–N7 逐锚
  function neg(key, fn, label) {
    const b = breakOne(key);
    const Hn = env({ [b.rel]: b.src });
    const ok = fn(Hn.WA);
    a(ok === false, 'v2970pb: [N' + label + '] 拆掉「' + key + '」后判据现形');
    a(!!Hn.WA.phoneBridge && typeof Hn.WA.phoneBridge.noteAction === 'function',
      'v2970pb: [N' + label + '] 破坏副本仍正常装载（不是「装不起来」，是**判据真敏感**）');
  }
  neg('DISABLED_NOT_OK', probeDisabled, '2');
  neg('IDEMPOTENT_FIRST', probeIdempotent, '3');
  neg('CAP_REJECT', probeCapReject, '4');
  neg('LINK_NO_OVERWRITE', probeLinkNoOverwrite, '5');
  neg('LINK_CHAIN_EXISTS', probeLinkChainExists, '6');
  neg('PHASE_NO_FAKE_QUIET', probePhaseNoFakeQuiet, '7');
  // N8 非恒真
  const W8 = on(env().WA);
  const q0 = W8.phoneBridge.phaseOf().phase;
  W8.phoneBridge.noteAction({ opId: 'n8', act: 'message' });
  const q1 = W8.phoneBridge.phaseOf().phase;
  a(q0 === 'unknown' && q1 === 'pushing', 'v2970pb: [N8] 非恒真：相位从 ' + q0 + ' 变 ' + q1 + '（读数随事实变化）');
  // N9 判据纯度
  const self = src('tests/phone-bridge-v2970.js');
  const ok9 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok9, 'v2970pb: [N9] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
if (require.main === module) {
  const a2 = function (cond, name) {
    if (cond) { PASS++; }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('PHONE-BRIDGE-V2970: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('PHONE-BRIDGE-V2970: pass（' + PASS + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };