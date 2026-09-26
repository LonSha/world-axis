#!/usr/bin/env node
// WorldAxis tests/interop-v2101.js —— v2.101.0（O11 跨插件互操作验收面）
//
// 【它治的病：降级可见写在代码里，但没人核过它读的是不是真源】
//   v2.87.0（B7）建了 `theme.separation()`，自述「三插件缺席降级可见」。本面开工时**实测**
//   到它两处失真（不是渲染 bug，是**读数与真源脱节**）：
//     ① LonSha 那一行读的是 `s.state`，而 `lonshaSource()` 从不返回该字段 ⇒
//        无论上游在不在、版本对不对，面板上一律念「unknown」；
//     ② RubyPhone 那一行的 `present: false` 是**写死的**，不看入站桥现场 ⇒
//        手机侧真在推时读数仍是「未接入」。
//   两处症状相同（永远说「不知道 / 没接入」），**处置完全相反**。本锁把这两处钉住。
//
// 【口径（全是否定式）】
//   ① **只读**：探测不碰存档、不写世界侧 stat、**不驱动对方重建快照**（一律 refresh:false）。
//      诊断是旁观，命令另一个插件干活会把「我这轮体检」变成「我改了别人的状态」。
//   ② **五态分列、不合并**：ready / partial（在但能力不全）/ absent（不在）/
//      incompatible（在、能力够，但契约版本不符）/ unknown（探不出）。
//      尤其 **`unknown` 不得写成 `absent`**——「不知道它在不在」与「它不在」处置相反。
//   ③ **不写死、不猜**：每一态都由现场探测得出，并带 `evidence` 说明凭什么这样判。
//      三个判定源分别是 `compat.detect()` / `lonshaSource()` / `phoneBridge.phaseOf()`。
//   ④ **不新增第二套真源**：本面只汇总，不另探一遍宿主能力、不重算上游归因。
//   ⑤ **错名不回落**：不在伙伴封闭集合内的名字如实报 `unknown-partner` 并点名，
//      绝不「默认当成 host」（那会让一个拼错的键读出一份看着正常的矩阵）。
//   ⑥ **计数分列**：matrix 五态各记各的，「有几项就绪」与「有几项探不出」不是一件事。
//   ⑦ **既有失真一并钉住**：`theme.separation()` 的两处读数必须跟随真源（判据 J11）。
//
// 【判据】
//   A 静态面：interop 为必载模块 + 诊断节在位 + 面板两枚真消费方 + 守卫登记 + 装载位在 compat 之后
//             + 零 npm 依赖（本仓零依赖红线）
//   B 运行时面（真装载真调用）：J1 上游五态 / J2 宿主四态 / J3 下游四态与契约版本
//     J4 错名不回落 / J5 matrix 计数分列 / J6 只读不驱动重建 / J7 探针纯读
//     J8 汇总面自洽 / J9 冻结面（含「诊断节键必须真是 collect() 的键」）/ J10 兼容矩阵三规则
//     J11 separation 两处失真已跟随真源
//   C 不变式：探测零落盘（存档逐字不变）+ 封闭集合恰为预期
//   N1–N14 负控制：真源码破坏 ⇒ 装载破坏副本 ⇒ 在副本上重跑**同款**真判据
//   N15 判据纯度：每条锚点字面量在本文件只出现一次
//
// 【为什么静态面判据不做负控制】
//   同 v2.100.0 口径：面板 / 诊断的「消费方在位」判据读的是**真文件**，而负控制的破坏写在
//   临时副本（srcOverride）上，读真文件的判据在破坏副本面前照样绿 —— 那是假绿。
//   这类「导出有没有人用」由 tests/dead-export-gate.js 兜（它是全仓面的）。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const INTEROP = 'engines/interop.js', THEME = 'engines/theme.js', DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js', RUNJS = 'tests/run.js', INDEX = 'index.js';
const LK = 'lonsha_memory_bridge_v1', RP = 'worldaxis_phone_ops_v1';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自恰中 1 次）══════════════
const ANCHORS = {
  // 口径② 宿主「不在」与「探不出」分列
  HOST_ABSENT: { rel: INTEROP, txt: "      if (!d.sillyTavern) return { key: 'host', state: 'absent', evidence: 'no-sillytavern', detail: '宿主上下文取不到（未在 SillyTavern 内运行）' };" },
  // 口径② 宿主「在但关键通道缺」不得读成 ready
  HOST_MISSING: { rel: INTEROP, txt: "      if (missing.length) return { key: 'host', state: 'partial', evidence: 'cap-missing:' + missing.join('+'), detail: '宿主在，但关键通道缺：' + missing.join(' / ') };" },
  // 口径④⑤ compat 不可用 ⇒ 探不出（不得当成宿主不在）
  API_MISSING: { rel: INTEROP, txt: "      if (!d) return { key: 'host', state: 'unknown', evidence: 'compat-unavailable', detail: 'compat/host.js 未加载或 detect() 不在（探不出宿主能力，不代表宿主不在）' };" },
  // 口径② 上游桥不在 ⇒ absent（且带归因）
  BRIDGE_ABSENT: { rel: INTEROP, txt: "      if (!s || s.mounted !== true) {" },
  // 口径④ 本侧消费面缺失是**我们自己的问题**，不得报成「对方不在」
  CONSUMER_MISSING: { rel: INTEROP, txt: "        return { key: 'lonsha', state: 'absent', evidence: 'consumer-missing', detail: '本侧没有消费面（engines/lonsha-reader.js 未加载）——这是本扩展自己的问题，不是对方不在' };" },
  // 口径② 契约版本不符 ⇒ incompatible（不是 absent，也不是 partial）
  INCOMPAT: { rel: INTEROP, txt: "      if (rd && rd.reason === 'contract-mismatch') {" },
  // 口径② 「本会话没收到过上报」是合法三态之一，不得写成「没在推」
  RN_UNKNOWN: { rel: INTEROP, txt: "      if (ph === 'unknown') return { key: 'rubyphone', state: 'unknown', evidence: 'no-report-yet', detail: clean(p && p.note, 80) || '本会话尚未收到任何手机侧上报' };" },
  // 口径② 用户关闭 ≠ 对方不在（disabled 与 absent 分开）
  RN_DISABLED: { rel: INTEROP, txt: "      if (ph === 'disabled') return { key: 'rubyphone', state: 'partial', evidence: 'bridge-disabled', detail: '入站桥已关闭：手机侧的操作不会进世界台账（用户关闭 ≠ 对方不在）' };" },
  // 口径③ 入站桥缺席要如实报（不得静默当作「没在推」）
  RN_MISSING: { rel: INTEROP, txt: "      if (!pb || typeof pb.phaseOf !== 'function') {" },
  // 口径③ 操作契约版本不符 ⇒ incompatible
  RN_VERSION: { rel: INTEROP, txt: "      if (Number(pb.version) !== want) {" },
  // 口径⑤ 错名不回落 host
  UNKNOWN_KEY: { rel: INTEROP, txt: "    if (!fn) return { key: k, label: '', duty: '', state: 'unknown', evidence: 'unknown-partner', detail: '不在伙伴封闭集合内（' + PARTNERS.join(' / ') + '）' };" },
  // 口径⑥ 五态计数分列（每一态都从 0 起算，不靠「没出现就是 0」）
  MATRIX: { rel: INTEROP, txt: "    const m = {}; STATES.forEach(function (s) { m[s] = 0; });" },
  // 口径① 不驱动对方重建快照（refresh 恒 false）
  NO_REFRESH: { rel: INTEROP, txt: "      const rd = (typeof lr.readLonshaSnapshot === 'function') ? lr.readLonshaSnapshot({ refresh: false }) : null;" },
  // 口径⑦ 既有失真①：separation 的 LonSha 行必须跟随真源归因（此前恒 unknown）
  THEME_LON: { rel: THEME, txt: "        if (!s || s.mounted !== true) return (s && s.reason) || 'not-mounted';" }
};
const BREAK = {
  // 破坏：宿主不在也报「在」（把 absent 折进 ready）
  HOST_ABSENT: "      if (false) return { key: 'host', state: 'absent', evidence: 'no-sillytavern', detail: 'x' };",
  // 破坏：关键通道缺也报 ready（降级不可见）
  HOST_MISSING: "      if (false) return { key: 'host', state: 'partial', evidence: 'cap-missing:x', detail: 'x' };",
  // 破坏：探不出 ⇒ 报「宿主不在」（最坏的那种：把 unknown 写成 absent）
  API_MISSING: "      if (!d) return { key: 'host', state: 'absent', evidence: 'compat-unavailable', detail: 'x' };",
  // 破坏：桥不在也照常往下走（拿 null 当桥用）
  BRIDGE_ABSENT: "      if (false) {",
  // 破坏：本侧缺消费面 ⇒ 报 unknown（把自己的问题推给对方）
  CONSUMER_MISSING: "        return { key: 'lonsha', state: 'unknown', evidence: 'consumer-missing', detail: 'x' };",
  // 破坏：契约版本不符也当没看见
  INCOMPAT: "      if (false) {",
  // 破坏：把「本会话没收到过上报」写成「它没在推」（两种处置相反）
  RN_UNKNOWN: "      if (ph === 'unknown') return { key: 'rubyphone', state: 'absent', evidence: 'no-report-yet', detail: 'x' };",
  // 破坏：用户关闭也报 ready（关上桥却显示这条边活着）
  RN_DISABLED: "      if (ph === 'disabled') return { key: 'rubyphone', state: 'ready', evidence: 'bridge-disabled', detail: 'x' };",
  // 破坏：桥缺席也照常调 phaseOf（拿 undefined 当桥用）
  RN_MISSING: "      if (false) {",
  // 破坏：版本不符也放行（契约漂移静默）
  RN_VERSION: "      if (false) {",
  // 破坏：错名回落成 host（拼错一个键读出一份看着正常的矩阵）
  UNKNOWN_KEY: "    if (!fn) return probeHost();",
  // 破坏：只累加出现过的态（「没出现」与「没有」在读数上变成同一件事）
  MATRIX: "    const m = {};",
  // 破坏：替对方重建快照（体检变成改别人状态）
  NO_REFRESH: "      const rd = (typeof lr.readLonshaSnapshot === 'function') ? lr.readLonshaSnapshot({ refresh: true }) : null;",
  // 破坏：separation 的 LonSha 行重新恒 unknown（本版修掉的那个病）
  THEME_LON: "        if (!s || s.mounted !== true) return 'unknown';"
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
/** 复位到已知票面：fresh() 复用宿主 localStorage，上一个探针写过的台账会带着出场。 */
function seed(W) {
  W.store.transact(function (d) {
    d.canon = { outline: null };
    if (d.causal && typeof d.causal === 'object') d.causal.phoneOps = [];
  }, 'v2101i:seed');
  try { W.phoneBridge.setSettings({ enabled: false, linkCausal: true }); } catch (e) {}
  return W;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H;
}
function mountLon(v) { try { global[LK] = v; } catch (e) {} }
function unmountLon() { try { delete global[LK]; } catch (e) {} }
/** 脚本化入站桥相位（判据核的是**本面有没有读真源**，相位本身由 phone-bridge-v2970 锁）。 */
function stubPhase(W, ph, note) {
  const d0 = W.phoneBridge.phaseOf;
  W.phoneBridge.phaseOf = function () { return { phase: ph, note: note || '' }; };
  return function () { W.phoneBridge.phaseOf = d0; };
}
const PHASES = ['disabled', 'unknown', 'pushing', 'quiet'];
// ══════════════ 同款真判据 ══════════════
/** J1 上游五态：ready / absent / incompatible / partial（引擎未就位）/ partial（无快照）。 */
function jLon(W) {
  try {
    const I = W.interop, r = [];
    unmountLon(); r.push(I.probePartner('lonsha').state === 'absent');
    mountLon({ sourceState: 'ready', snapshot: { version: 1, floor: 7 } });
    r.push(I.probePartner('lonsha').state === 'ready');
    r.push(I.probePartner('lonsha').evidence === 'snapshot-ok');
    mountLon({ sourceState: 'ready', snapshot: { version: 9, floor: 7 } });
    r.push(I.probePartner('lonsha').state === 'incompatible');
    mountLon({ sourceState: 'engine-empty', lastError: 'no-rows' });
    r.push(I.probePartner('lonsha').state === 'partial');
    r.push(I.probePartner('lonsha').evidence === 'engine-engine-empty');
    mountLon({ sourceState: 'ready' });
    r.push(I.probePartner('lonsha').state === 'partial');
    r.push(I.probePartner('lonsha').evidence === 'no-snapshot');
    // 本侧消费面缺失：报 absent 但归因是「我们自己的问题」，不是「对方不在」
    const keep = W.lonshaReader;
    delete W.lonshaReader;
    const cm = I.probePartner('lonsha');
    r.push(cm.state === 'absent' && cm.evidence === 'consumer-missing');
    W.lonshaReader = keep;
    unmountLon();
    return r.every(Boolean);
  } catch (e) { return false; }
}
/** J2 宿主四态：ready / absent / partial（关键通道缺、可选缺两向）/ unknown（两种来源）。 */
function jHost(W) {
  try {
    const I = W.interop, C = W.compat, d0 = C.detect, r = [];
    const full = { sillyTavern: true, eventSource: true, generation: true, extensionPrompt: true, tavernHelper: true, variables: true, worldbook: true, chatChanged: true, appReady: true };
    C.detect = function () { return full; }; r.push(I.probePartner('host').state === 'ready');
    C.detect = function () { return { sillyTavern: false, eventSource: true, generation: true, extensionPrompt: true, tavernHelper: true }; };
    const ab = I.probePartner('host'); r.push(ab.state === 'absent' && ab.evidence === 'no-sillytavern');
    C.detect = function () { return { sillyTavern: true }; };
    const pm = I.probePartner('host');
    r.push(pm.state === 'partial' && pm.evidence.indexOf('cap-missing:') === 0);
    C.detect = function () { return { sillyTavern: true, eventSource: true, generation: true, extensionPrompt: true }; };
    const pn = I.probePartner('host');
    r.push(pn.state === 'partial' && pn.evidence.indexOf('cap-optional-missing:') === 0);
    C.detect = function () { throw new Error('probe-boom'); };
    r.push(I.probePartner('host').state === 'unknown');
    r.push(I.probePartner('host').evidence === 'probe-threw');
    C.detect = d0;
    delete W.compat;
    const uk = I.probePartner('host');
    r.push(uk.state === 'unknown' && uk.evidence === 'compat-unavailable');
    W.compat = C; C.detect = d0;
    return r.every(Boolean);
  } catch (e) { return false; }
}
/** J3 下游四态：disabled→partial / unknown→unknown / pushing｜quiet→ready / 版本→incompatible / 缺席→absent。 */
function jPhone(W) {
  try {
    const I = W.interop, r = [];
    let undo = stubPhase(W, 'disabled');
    const d = I.probePartner('rubyphone'); r.push(d.state === 'partial' && d.evidence === 'bridge-disabled');
    undo(); undo = stubPhase(W, 'unknown');
    const u = I.probePartner('rubyphone'); r.push(u.state === 'unknown' && u.evidence === 'no-report-yet');
    undo(); undo = stubPhase(W, 'pushing');
    r.push(I.probePartner('rubyphone').state === 'ready');
    r.push(I.probePartner('rubyphone').evidence === 'pushing');
    undo(); undo = stubPhase(W, 'quiet');
    r.push(I.probePartner('rubyphone').state === 'ready');
    r.push(I.probePartner('rubyphone').evidence === 'quiet');
    undo();
    const v0 = W.phoneBridge.version;
    W.phoneBridge.version = 9;
    const ic = I.probePartner('rubyphone');
    r.push(ic.state === 'incompatible' && ic.evidence === 'ops-version:9');
    W.phoneBridge.version = v0;
    const keep = W.phoneBridge;
    delete W.phoneBridge;
    const ab = I.probePartner('rubyphone');
    r.push(ab.state === 'absent' && ab.evidence === 'inbound-bridge-missing');
    W.phoneBridge = keep;
    // 相位不在封闭集合内 ⇒ unknown（不静默当成 quiet）
    undo = stubPhase(W, 'nonsense');
    const nx = I.probePartner('rubyphone');
    r.push(nx.state === 'unknown' && nx.evidence.indexOf('phase-unknown:') === 0);
    undo();
    return r.every(Boolean);
  } catch (e) { return false; }
}
/** J4 错名不回落：不在封闭集合内 ⇒ unknown-partner 并点名，且**不得**与 host 同形。 */
function jUnknownKey(W) {
  try {
    const I = W.interop;
    const x = I.probePartner('nope');
    if (x.state !== 'unknown' || x.evidence !== 'unknown-partner') return false;
    if (x.key !== 'nope' || x.label !== '') return false;
    if (x.detail.indexOf('host') < 0 || x.detail.indexOf('lonsha') < 0 || x.detail.indexOf('rubyphone') < 0) return false;
    if (JSON.stringify(I.probePartner('')) === JSON.stringify(I.probePartner('host'))) return false;
    if (JSON.stringify(x) === JSON.stringify(I.probePartner('host'))) return false;
    return true;
  } catch (e) { return false; }
}
/** J5 计数分列：五态各自的数、degraded 的构成、allReady 的口径。 */
function jMatrix(W) {
  try {
    const I = W.interop;
    unmountLon();
    let undo = stubPhase(W, 'disabled');
    const A = I.probeAll();
    if (A.matrix.ready !== 1 || A.matrix.absent !== 1 || A.matrix.partial !== 1) return false;
    if (A.matrix.incompatible !== 0 || A.matrix.unknown !== 0) return false;
    if (A.ready !== 1 || A.allReady !== false) return false;
    if (A.degraded.join(',') !== 'lonsha:absent,rubyphone:partial') return false;
    if (Object.keys(A.matrix).length !== I.STATES.length) return false;
    undo(); undo = stubPhase(W, 'pushing');
    mountLon({ sourceState: 'ready', snapshot: { version: 1, floor: 1 } });
    const B = I.probeAll();
    const ok = B.matrix.ready === 3 && B.degraded.length === 0 && B.allReady === true;
    undo(); unmountLon();
    return ok;
  } catch (e) { return false; }
}
/** J6 只读不驱动重建：探针一律 refresh:false，且**绝不**调用对方的 refresh。 */
function jNoRefresh(W) {
  try {
    const I = W.interop;
    let called = false, seen = null;
    mountLon({ sourceState: 'ready', snapshot: { version: 1, floor: 5 }, refresh: function () { called = true; return { version: 1, floor: 99 }; } });
    const d0 = W.lonshaReader.readLonshaSnapshot;
    W.lonshaReader.readLonshaSnapshot = function (opts) { seen = opts; return d0.call(W.lonshaReader, opts); };
    const p = I.probePartner('lonsha');
    const ok = p.state === 'ready' && called === false && !!seen && seen.refresh === false;
    W.lonshaReader.readLonshaSnapshot = d0;
    unmountLon();
    return ok;
  } catch (e) { return false; }
}
/** J7 探针纯读：探测前后存档逐字不变；本面自己的计量可以涨。 */
function jReadonly(W) {
  try {
    const I = W.interop;
    mountLon({ sourceState: 'ready', snapshot: { version: 1, floor: 2 } });
    const before = JSON.stringify(W.store.get());
    const s0 = I.stat().probes;
    I.probeAll(); I.probePartner('host'); I.probePartner('lonsha'); I.probePartner('rubyphone');
    I.freeze(); I.compatGaps(); I.summaryText();
    const after = JSON.stringify(W.store.get());
    const grew = I.stat().probes > s0;
    unmountLon();
    return before === after && grew;
  } catch (e) { return false; }
}
/** J8 汇总面自洽：summaryText 与 matrix 同一份现场（不各说各话）。 */
function jSummary(W) {
  try {
    const I = W.interop;
    unmountLon();
    const undo = stubPhase(W, 'disabled');
    const s1 = I.summaryText();
    const a1 = I.probeAll();
    if (s1.indexOf('1/3') < 0) return false;
    if (a1.ready !== 1) return false;
    if (s1.indexOf('absent') < 0 || s1.indexOf('partial') < 0) return false;
    if (s1.indexOf('unknown') >= 0) return false;
    unmountLon(); mountLon({ sourceState: 'ready', snapshot: { version: 1 } });
    const undo2 = stubPhase(W, 'pushing');
    const s2 = I.summaryText();
    const ok = s2.indexOf('3/3') >= 0 && I.probeAll().allReady === true;
    undo2(); undo(); unmountLon();
    return ok;
  } catch (e) { return false; }
}
/** J9 冻结面：三座桥的 id/版本、诊断节键**必须真是 collect() 的键**、拒收码词表可核对。 */
function jFreeze(W) {
  try {
    const f = W.interop.freeze();
    if (f.bridges.length !== 3) return false;
    const ids = f.bridges.map(function (b) { return b.id; }).join(',');
    if (ids !== 'worldaxis_bridge_v1,lonsha_memory_bridge_v1,worldaxis_phone_ops_v1') return false;
    if (!f.bridges.every(function (b) { return b.version === 1; })) return false;
    if (f.bridges.filter(function (b) { return b.direction === 'out'; }).length !== 1) return false;
    if (JSON.stringify(f.states) !== JSON.stringify(W.interop.STATES)) return false;
    if (JSON.stringify(f.partners) !== JSON.stringify(W.interop.PARTNERS)) return false;
    if (f.rejectCodes.inbound.indexOf('ops-full') < 0) return false;
    if (f.rejectCodes.inbound.indexOf('disabled') < 0) return false;
    if (f.rejectCodes.readFace.indexOf('contract-mismatch') < 0) return false;
    if (f.rejectCodes.readFace.indexOf('not-mounted') < 0) return false;
    // 冻结的「诊断节键」必须真是诊断包上的键——否则它就是一份没人核对的文案
    const diag = W.toolDiag.collect();
    const okAll = f.diagSections.every(function (k) { return Object.prototype.hasOwnProperty.call(diag, k); });
    if (!okAll) return false;
    return f.diagSections.indexOf('interop') >= 0;
  } catch (e) { return false; }
}
/** J10 兼容矩阵三规则：旧存档 / 旧配置 / 缺席插件，每条都要带判据落点，且读数不得是 -1。 */
function jGaps(W) {
  try {
    const g = W.interop.compatGaps();
    if (Object.keys(g).join(',') !== 'oldSave,oldConfig,absentPlugin') return false;
    if (!/^\d+ 个顶层键可物化$/.test(g.oldSave.evidence)) return false;
    if (parseInt(g.oldSave.evidence, 10) < 20) return false;
    if (g.oldSave.where.indexOf('store.js') < 0) return false;
    // 本版修掉的病：悬空引用被 try/catch 吞成 -1（静默降级，读数恒假）
    if (!/^\d+ 个幽灵键$/.test(g.oldConfig.evidence)) return false;
    if (parseInt(g.oldConfig.evidence, 10) < 0) return false;
    if (g.oldConfig.rule.indexOf('orphanSettingsKeys') < 0) return false;
    if (g.absentPlugin.rule.indexOf('absent') < 0) return false;
    if (g.absentPlugin.where.indexOf('interop.js') < 0) return false;
    return true;
  } catch (e) { return false; }
}
/** J11 separation 两处失真已跟随真源（本版修掉的那两处）。 */
function jSeparation(W) {
  try {
    const S = W.theme.separation();
    const byOwner = {};
    S.roles.forEach(function (r) { byOwner[r.owner] = r; });
    if (!byOwner.LonSha || !byOwner.RubyPhone) return false;
    const r = [];
    // ① LonSha 行不再恒 unknown：桥不在报 not-mounted，在且就绪报 ready
    unmountLon();
    r.push(W.theme.separation().roles[1].state === 'not-mounted');
    mountLon({ sourceState: 'ready', snapshot: { version: 1, floor: 1 } });
    const st = W.theme.separation().roles[1].state;
    r.push(st === 'ready' && st !== 'unknown');
    r.push(W.theme.separation().roles[1].present === true);
    // ② RubyPhone 行不再写死 present:false：跟随入站桥现场
    const undo = stubPhase(W, 'pushing');
    const s1 = W.theme.separation().roles[2];
    r.push(s1.present === true && s1.state === 'pushing');
    r.push(s1.owns.indexOf('phoneBridge') >= 0);
    undo();
    const undo2 = stubPhase(W, 'disabled');
    const s2 = W.theme.separation().roles[2];
    r.push(s2.present === false && s2.state === 'disabled');
    undo2();
    unmountLon();
    return r.every(Boolean);
  } catch (e) { return false; }
}
function runAll(a) {
  const iSrc = src(INTEROP), diagSrc = src(DIAG), panSrc = src(PANEL), runSrc = src(RUNJS), idxSrc = src(INDEX);
  // ── A 静态面（消费方在位；这类判据读真文件，故不做负控制，见文件头）──
  a(diagSrc.indexOf("'engines/interop.js': 'interop',") >= 0
    && diagSrc.indexOf("const OPTIONAL_EXPORTS = ['ui', 'uiSettings', 'assistant', 'compat'];") >= 0,
    'v2101: [A1] interop 登记为**必载**模块（缺席即断裂，不该被静默兜住）');
  a(diagSrc.indexOf('function secInterop()') >= 0 && diagSrc.indexOf('interop: secInterop(),') >= 0
    && diagSrc.indexOf('WA.interop.probeAll') >= 0,
    'v2101: [A2] 诊断节 interop 在位（collect 挂节 + 只读出口 probeAll）');
  a(hits(panSrc, 'WA.interop.probeAll(') === 1 && hits(panSrc, 'WA.interop.freeze(') === 1
    && panSrc.indexOf('id="wa-net-view"') >= 0 && panSrc.indexOf('id="wa-net-freeze"') >= 0,
    'v2101: [A3] 面板两枚真消费方（跨插件面 / 协议冻结面各接一个真导出——只在测试里活的导出不算交付）');
  a(hits(diagSrc, "'wa-net-view', 'wa-net-freeze',") === 1,
    'v2101: [A4] 两枚控件登记进 UI_BINDINGS 守卫表（渲染了不登记 ⇒ 守卫永远查不到）');
  a(runSrc.indexOf("'engines/interop.js',") >= 0
    && idxSrc.indexOf("'engines/interop.js'") >= 0
    && idxSrc.indexOf("'engines/interop.js'") > idxSrc.indexOf("'compat/host.js'"),
    'v2101: [A5] 装载位在 compat 之后（它读 compat.detect——顺序写反就永远是「探不出」）');
  a(hits(iSrc, 'require(') === 0 && hits(iSrc, 'jsdom') === 0,
    'v2101: [A6] 零 npm 依赖（本仓红线：无 package.json / node_modules）');
  // ── B 运行时面 ──
  a(jLon(env().WA), 'v2101: [J1] 上游五态：ready / absent / incompatible / partial（引擎未就位）/ partial（无快照）+ 本侧缺消费面单独归因');
  a(jHost(env().WA), 'v2101: [J2] 宿主四态：ready / absent / partial（关键通道缺 / 可选缺两向）/ unknown（抛错与 compat 不在两种来源）');
  a(jPhone(env().WA), 'v2101: [J3] 下游四态：disabled→partial（用户关闭≠对方不在）/ unknown / pushing｜quiet→ready / 版本→incompatible / 缺席→absent');
  a(jUnknownKey(env().WA), 'v2101: [J4] 错名不回落 host（不在封闭集合内 ⇒ unknown-partner 并点名三个伙伴）');
  a(jMatrix(env().WA), 'v2101: [J5] matrix 五态分列（每一态从 0 起算）+ degraded 构成 + allReady 口径');
  a(jNoRefresh(env().WA), 'v2101: [J6] 不驱动对方重建快照（refresh:false，且对方的 refresh 一次都没被调用）');
  a(jReadonly(env().WA), 'v2101: [J7] 探针纯读：探测前后存档逐字不变（本面自己的计量可涨）');
  a(jSummary(env().WA), 'v2101: [J8] summaryText 与 matrix 同一份现场（不各说各话）');
  a(jFreeze(env().WA), 'v2101: [J9] 冻结面：三桥 id/v1、诊断节键**真是 collect() 的键**、拒收码词表可核对');
  a(jGaps(env().WA), 'v2101: [J10] 兼容矩阵三规则带判据落点，且读数不得是 -1（悬空引用被吞成静默降级的那个病）');
  a(jSeparation(env().WA), 'v2101: [J11] separation 两处失真已跟随真源（LonSha 不再恒 unknown、RubyPhone 不写死 present:false）');
  // ── C 不变式 ──
  const Wc = env().WA;
  mountLon({ sourceState: 'ready', snapshot: { version: 1, floor: 4 } });
  const beforeC = JSON.stringify(Wc.store.get());
  Wc.interop.probeAll(); Wc.interop.freeze(); Wc.interop.compatGaps(); Wc.theme.separation();
  const afterC = JSON.stringify(Wc.store.get());
  unmountLon();
  a(beforeC === afterC, 'v2101: [C1] 探测**不落盘**（存档逐字不变——取证不得改变被取证对象）');
  a(JSON.stringify(Wc.interop.PARTNERS) === JSON.stringify(['host', 'lonsha', 'rubyphone'])
    && JSON.stringify(Wc.interop.STATES) === JSON.stringify(['ready', 'partial', 'absent', 'incompatible', 'unknown']),
    'v2101: [C2] 封闭集合恰为预期（伙伴 3 / 状态 5——集合变化必须有人确认过）');
}
function runNegative(a) {
  Object.keys(ANCHORS).forEach(function (k) { must1(src(ANCHORS[k].rel), ANCHORS[k].txt, k); });
  a(Object.keys(ANCHORS).length === 14, 'v2101i: [N0] 十四个破坏锚点在真源码各恰中 1 次');
  let threw = 0;
  try { must1(src(INTEROP), '锚点根本不在源码里__v2101i', 'self'); } catch (e) { threw++; }
  try { must1(src(INTEROP) + ANCHORS.MATRIX.txt, ANCHORS.MATRIX.txt, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'v2101i: [N0] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  const probes = [['jLon', jLon], ['jHost', jHost], ['jPhone', jPhone], ['jUnknownKey', jUnknownKey],
    ['jMatrix', jMatrix], ['jNoRefresh', jNoRefresh], ['jReadonly', jReadonly], ['jSummary', jSummary],
    ['jFreeze', jFreeze], ['jGaps', jGaps], ['jSeparation', jSeparation]];
  // N1 原版干净（每条探针独立实例——它们都会改 store / 相位，共享实例会读到前一条的手指印）
  const n1 = probes.map(function (x) { return { name: x[0], ok: x[1](env().WA) }; });
  const bad = n1.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
  a(bad.length === 0, 'v2101i: [N1] 原版上十一条判据全部干净（不干净的是 ' + (bad.join(',') || '无') + '）');
  // N2–N15 逐锚：真源码破坏 ⇒ 装载破坏副本 ⇒ 在副本上重跑**同款**真判据
  let step = 1;
  Object.keys(ANCHORS).forEach(function (key) {
    step++;
    const fn = probes.filter(function (x) { return x[0] === CAMP[key]; })[0];
    if (!fn) throw new Error('no probe bound to anchor :: ' + key);
    const b = breakOne(key);
    const Hn = env({ [b.rel]: b.src });
    const ok = fn[1](Hn.WA);
    a(ok === false, 'v2101i: [N' + step + '] 拆掉「' + key + '」后判据现形');
    a(!!Hn.WA.interop && typeof Hn.WA.interop.probeAll === 'function' && !!Hn.WA.toolDiag,
      'v2101i: [N' + step + '] 破坏副本仍正常装载（不是「装不起来」，是**判据真敏感**）');
  });
  // N15 判据纯度（H5：锚点字面量在本文件只准声明一次）
  const self = src('tests/interop-v2101.js');
  const okP = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(okP, 'v2101i: [N15] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
  unmountLon();
}
// 锚点 → 探针的绑定（逐锚负控制要跑**同款**判据，绑定关系显式写出来）
const CAMP = {
  HOST_ABSENT: 'jHost', HOST_MISSING: 'jHost', API_MISSING: 'jHost',
  BRIDGE_ABSENT: 'jLon', CONSUMER_MISSING: 'jLon', INCOMPAT: 'jLon',
  RN_UNKNOWN: 'jPhone', RN_DISABLED: 'jPhone', RN_MISSING: 'jPhone', RN_VERSION: 'jPhone',
  UNKNOWN_KEY: 'jUnknownKey', MATRIX: 'jMatrix', NO_REFRESH: 'jNoRefresh', THEME_LON: 'jSeparation'
};
if (require.main === module) {
  const a2 = function (cond, name) {
    if (cond) { PASS++; }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('INTEROP-V2101: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('INTEROP-V2101: pass（' + PASS + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };
