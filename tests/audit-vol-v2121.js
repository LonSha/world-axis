#!/usr/bin/env node
// WorldAxis tests/audit-vol-v2121.js —— v2.121.0（P1 取证持久化：审计卷）
//
// 【它治的病：审计证据出了会话就没了】
//   v2.111.0 立了写操作审计（事实环），v2.112.0 给它接了落盘（flush / restore）。
//   可是这两个口答的是**同一个问题**——「本机存过什么」。`restore` 明写「不并进内存环」，
//   且读回来之后**不比对任何东西**：它把一段历史摆出来，却不说这段历史自不自洽。
//   于是「把一段审计带出去、在别处核一遍」在这条线上无处可说。取证三件套的另两件
//   （磁带 core/rand.js v2.98.0 的 tapeVol/verifyTapeWith、流水 engines/org.js v2.94.0 的
//   exportJournal/reconcileWith）早就有这一对通道，审计这一件一直空着。本版补上。
//
// 【本版口径】三条（全是否定式，与另两件同规格）
//   ① **不自动落盘**：本模块不替调用方写盘。卷由调用方拿走——「要不要留下这一卷」是人的决定。
//   ② 导出**不改本侧**：不挤出、不清环、不改 `_seq`、不改 stat 任何一格。
//      取证动作不得改变被取证对象——这一条在本仓库从不打折。
//   ③ **序号真源照搬**：每条的 `seq` 是 `record()` 时现算的，导出与带外核对**都不重算**。
//      重算会把被挤出/被手改的卷洗白成「自洽」，于是「这卷缺不缺头」永远说不出口。
//
// 【边界照实说（本版刻意不假装更强）】
//   · 环是**环形**（CAP=256，挤出即丢）⇒ 挤出过就 `truncated=true`，卷首无上游可核。
//   · `reset()` 会重启序号谱系 ⇒ 卷内 `seq` 可能不从 1 起。故 `truncated=false` 而首条
//     `seq !== 1` 时另报 `headless=true`（自称完整却缺头）——两件事分开说，合成一句就是失实。
//   · `compared === 0`（空卷）时只说明「没什么可核」，**不构成**「核过且一致」。
//   · 本口**不回答**「这卷与本机 localStorage 里那份是否一致」：读回不比对任何东西，
//     两者是两条不同的证据。本文件把这句话写成断言。
//
// 【判据】（A 结构 / B 运行时 / C 不变式 / N 负控制）
//   A1 两口在位、且**各有真消费方**（面板绑定 + 诊断/面板调用点；无消费方的导出等于死面）。
//   A2 常量与 inspectVol 不单独导出（信息经两个口的返回值带出——本模块只认调用点）。
//   A3 头注里的三条口径逐字在位（口径写在纸上才算口径）。
//   B1 记录 → 导出：格式头 / 条数 / 容量 / 累计 / 挤出 / 序号逐条 +1 如实。
//   B2 带外核对：序号链 + 时间链都过 ⇒ outcome='self-consistent'、compared>0。
//   B3 篡改**任意一条的 seq** ⇒ seqOk=false，第一处断点条号准确；时间链照旧（两链独立）。
//   B4 篡改**时间链**（倒退）⇒ atOk=false 且总判否；序号链照旧为真。
//   B5 **空环** ⇒ outcome='empty'、compared=0（「空卷」不等于「核过且一致」）。
//   B6 拒收四态各归各因：bad-volume / bad-format（带 want/got）/ bad-version / bad-rows（行不是对象）。
//   B7 删掉中间一条 ⇒ 序号跳号被抓（照搬 seq 的价值就在这里）。
//   B8 挤出后：truncated=true 且卷首 seq 是**真实**序号（不被重算成 1）；自称完整却缺头 ⇒ headless。
//   C1 不变式：导出前后 stat 逐项不变；连续导出两次拿到同一卷。
//   C2 不变式：带外核对**零状态触碰**——核对前后 stat 逐项不变，且核对不并环、不顶替本侧卷。
//   C3 口径分列：restore（答「本机存过什么」）与 verifyVolWith（答「这卷自洽吗」）互不替代；
//      核对一份卷**不读** localStorage（清空存储后照旧核得出）。
//   N0 两个真源码锚点各恰中 1 次；N1 破坏 ⇒ 口径③/B6 各现形；N2 影响面有限；
//      N3 非恒真；N4 锚点工具两向自证（不存在 / 不唯一都必须抛）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const AUDIT = path.join(BASE, 'core/audit-log.js');
const PANEL = path.join(BASE, 'ui/panel.js');
const DIAG = path.join(BASE, 'engines/tool-diag.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }
function auditSrc() { return src(AUDIT); }
function panelSrc() { return src(PANEL); }
function diagSrc() { return src(DIAG); }
// ── 两个真源码破坏锚点（各须恰中 1 次）──
//   锚点选的是**判据所依赖的那一行**，不是随便一处代码：
//     · 导出行面那三行 —— 它是「照搬 seq 而不重算」的落点（本版最贵的口径③）；
//     · 带外核对的行面早退 —— 它是「行面读不了就当场归因」的落点。
const ANCHOR_ROWS = "        rows: _ring.map(function (r) {\n          return { seq: r.seq, at: r.at, user: r.user, action: r.action, surface: r.surface,\n            params: r.params, paramsTruncated: r.paramsTruncated, result: r.result, ip: r.ip };\n        })";
const ANCHOR_BADROWS = "    if (badRows) return { ok: false, reason: 'bad-rows', badRows: badRows, entries: rows.length };";

/** 锚点命中计数，要求恰为 1（工具两向自证：不存在 / 不唯一都必须抛） */
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 50));
  return n;
}
function fresh(opts) { return gate.fresh(opts || {}).WA; }
/** 灌 n 条事实（判据须可复算：动作名/参数/结果全部写死） */
function fill(WA, n) {
  const L = WA.auditLog;
  for (let i = 0; i < n; i++) L.record('t.act', { i: i }, { surface: 'lock', result: 'ok' });
  return L;
}
/** 快照「本侧状态」——C 面的判据全部对比这一份 */
function snap(WA) {
  const st = WA.auditLog.stat();
  return {
    records: st.records, inRing: st.inRing, cap: st.cap, dropped: st.dropped,
    truncated: st.truncated, badAction: st.badAction, unknowns: st.unknowns,
    flushes: st.flushes, persisted: st.persisted, flushFailed: st.flushFailed,
    restored: st.restored, restoreFailed: st.restoreFailed, lost: st.lost,
    lineageResets: st.lineageResets, persistedSeq: st.persistedSeq
  };
}

function runAll(a) {
  const r = auditSrc(), p = panelSrc(), d = diagSrc();
  // ─────────────── A 面：结构 ───────────────
  {
    // A1 两口在位
    a(r.indexOf('    exportVol: exportVol, verifyVolWith: verifyVolWith,') >= 0,
      'v2121: [A1] auditLog 导出 exportVol（导出卷——导出即有承诺）');
    // A1 真消费方：面板绑定（与磁带卷 v2980 的判据同形态）
    a(p.indexOf("on('#wa-audit-vol'") >= 0, 'v2121: [A1] exportVol 的消费方：面板「导出审计」');
    a(p.indexOf("on('#wa-audit-vol-check'") >= 0, 'v2121: [A1] verifyVolWith 的消费方：面板「带外核对」');
    a(p.indexOf('WA.auditLog.exportVol()') >= 0, 'v2121: [A1] 面板真调 exportVol（不是绑了不用）');
    a(p.indexOf('WA.auditLog.verifyVolWith(') >= 0, 'v2121: [A1] 面板真调 verifyVolWith');
    // A1 诊断侧消费方（第二处真消费者：诊断只读口）
    a(d.indexOf('audit: secAudit(),') >= 0, 'v2121: [A1] 诊断采集真调 secAudit（第二处消费方）');
    a(d.indexOf('WA.auditLog.exportVol') >= 0, 'v2121: [A1] secAudit 真调 exportVol（诊断自己去看，不转发摘要）');
    // A1 四枚控件都渲染（ui-wire-audit 的反向判据同款：绑到不渲染的 id = 点了没反应）
    a(p.indexOf('id="wa-audit-vol"') >= 0 && p.indexOf('id="wa-audit-vol-check"') >= 0
      && p.indexOf('id="wa-audit-vol-text"') >= 0 && p.indexOf('id="wa-audit-vol-out"') >= 0,
      'v2121: [A1] 四枚新控件都在模板里渲染（否则 on() 静默空转，用户视角「点了没反应」）');
    // A1 守卫表登记（渲染了但没登记的控件，绑定写错时无人发现）
    a(d.indexOf("'wa-audit-vol', 'wa-audit-vol-check', 'wa-audit-vol-text', 'wa-audit-vol-out'") >= 0,
      'v2121: [A1] 四枚控件登记进 UI_BINDINGS（守卫表是接线面的唯一真源）');
    // A2 常量与 inspectVol 不单独导出
    a(r.indexOf('    VOL_FORMAT:') < 0 && r.indexOf('    VOL_FORMAT_VERSION:') < 0 && r.indexOf('    inspectVol:') < 0,
      'v2121: [A2] 常量与 inspectVol **不单独导出**（信息经两个口的返回值带出——无独立消费方不挂）');
    a(r.indexOf('const VOL_FORMAT = ') >= 0 && r.indexOf('const VOL_FORMAT_VERSION = ') >= 0,
      'v2121: [A2] 两常量在位（格式头是读的人判断「这是哪一版、能不能用」的唯一依据）');
    // A3 头注三条口径
    a(r.indexOf('① **不自动落盘**：本模块不替调用方写盘') >= 0, 'v2121: [A3] 口径①不自动落盘写在头注里');
    a(r.indexOf('② 导出**不改本侧**') >= 0, 'v2121: [A3] 口径②导出不改本侧写在头注里');
    a(r.indexOf('③ **序号真源照搬**') >= 0, 'v2121: [A3] 口径③序号真源照搬写在头注里');
    a(r.indexOf('本口**不回答**「这卷与本机 localStorage 里那份是否一致」') >= 0,
      'v2121: [A3] 头注明写「卷自洽 ≠ 与本机那份一致」（这句话说不出口时，读的人会自己编一句）');
  }

  // ─────────────── B 面：运行时 ───────────────
  {
    // B1 记录 → 导出
    const WA = fresh();
    const L = fill(WA, 3);
    const v = L.exportVol();
    a(v && v.ok === true, 'v2121: [B1] 有环时导出一卷（ok=' + (v && v.ok) + '）');
    a(v.format === 'worldaxis.audit.vol' && v.formatVersion === 1,
      'v2121: [B1] 格式头如实（' + v.format + ' v' + v.formatVersion + '）');
    a(v.entries === 3 && v.rows.length === 3, 'v2121: [B1] 条数如实（实 ' + v.entries + '）');
    a(v.cap === 256, 'v2121: [B1] 容量是确定量（实 ' + v.cap + '）');
    a(v.recorded === 3 && v.dropped === 0 && v.truncated === false,
      'v2121: [B1] 累计/挤出/截断如实（recorded=' + v.recorded + ' dropped=' + v.dropped + ' truncated=' + v.truncated + '）');
    a(v.rows.every(function (x, i) { return x.seq === i + 1; }),
      'v2121: [B1] 序号逐条 +1（' + v.rows.map(function (x) { return x.seq; }).join(',') + '）');
    a(v.rows[0].action === 't.act' && v.rows[0].surface === 'lock' && v.rows[0].result === 'ok',
      'v2121: [B1] 行面九字段照实带出（动作/面/结果）');
    a(v.rows[0].ip === null, 'v2121: [B1] ip 恒为 null（本扩展没有网络身份——不替调用方编事实）');

    // B2 带外核对：自洽
    const w = L.verifyVolWith(v);
    a(w.ok === true && w.outcome === 'self-consistent', 'v2121: [B2] 两链都过 ⇒ self-consistent（实 ' + w.outcome + '）');
    a(w.seqOk === true && w.atOk === true, 'v2121: [B2] 序号链与时间链各自为真');
    a(w.compared === 3 && w.headless === false, 'v2121: [B2] 比了 ' + w.compared + ' 条，卷首与自称一致');

    // B3 篡改一条 seq
    const t1 = JSON.parse(JSON.stringify(v));
    t1.rows[1].seq = 99;
    const w1 = L.verifyVolWith(t1);
    a(w1.ok === false && w1.outcome === 'broken', 'v2121: [B3] 篡改一条 seq 即报断（outcome=' + w1.outcome + '）');
    a(w1.seqOk === false && w1.seqBroken.length >= 1 && w1.seqBroken[0].at === 1,
      'v2121: [B3] 第一处断点条号准确（at=' + (w1.seqBroken[0] && w1.seqBroken[0].at) + '）——一处断裂之后全都错位，报第一处才有用');
    a(w1.atOk === true, 'v2121: [B3] 只改 seq 时时间链仍完整（两个面独立——合成一句就是失实）');

    // B4 篡改时间链
    const t2 = JSON.parse(JSON.stringify(v));
    t2.rows[2].at = t2.rows[0].at - 1000;
    const w2 = L.verifyVolWith(t2);
    a(w2.atOk === false && w2.atRegressions.length >= 1 && w2.atRegressions[0].at === 2,
      'v2121: [B4] 时间倒退即报（首处第 ' + (w2.atRegressions[0] && w2.atRegressions[0].at) + ' 条）');
    a(w2.seqOk === true && w2.ok === false,
      'v2121: [B4] 且序号链照旧为真、总判否——「序号对得上」不掩盖「时间倒着走」');

    // B5 空环
    const WA5 = fresh();
    const v5 = WA5.auditLog.exportVol();
    a(v5.ok === true && v5.entries === 0 && v5.rows.length === 0,
      'v2121: [B5] 空环导出成功但 0 条（「空环」与「导不出」是两件事）');
    const w5 = WA5.auditLog.verifyVolWith(v5);
    a(w5.ok === true && w5.outcome === 'empty' && w5.compared === 0,
      'v2121: [B5] 空卷 ⇒ empty（「空卷」不等于「核过且一致」——本口不把它算作通过）');

    // B6 拒收四态
    a(L.verifyVolWith(null).reason === 'bad-volume', 'v2121: [B6] 非对象 ⇒ bad-volume');
    const wF = L.verifyVolWith({ format: 'x', formatVersion: 1, rows: [] });
    a(wF.reason === 'bad-format' && wF.want === 'worldaxis.audit.vol' && wF.got === 'x',
      'v2121: [B6] 格式头不符 ⇒ bad-format（带 want/got，否则读的人无从知道差在哪）');
    a(L.verifyVolWith({ format: 'worldaxis.audit.vol', formatVersion: 9, rows: [] }).reason === 'bad-version',
      'v2121: [B6] 版本不符 ⇒ bad-version（格式头三元组的第三位）');
    a(L.verifyVolWith({ format: 'worldaxis.audit.vol', formatVersion: 1 }).reason === 'bad-rows',
      'v2121: [B6] 缺行面 ⇒ bad-rows');
    const wB = L.verifyVolWith({ format: 'worldaxis.audit.vol', formatVersion: 1, rows: ['x'] });
    a(wB.reason === 'bad-rows' && wB.badRows === 1,
      'v2121: [B6] 行不是对象 ⇒ 当场归因 bad-rows（实 badRows=' + wB.badRows + '）——不静默跳过，跳过等于把它们算进「核过了」');

    // B7 删中间一条
    const t3 = JSON.parse(JSON.stringify(v));
    t3.rows.splice(1, 1);
    const w3 = L.verifyVolWith(t3);
    a(w3.seqOk === false, 'v2121: [B7] 删掉中间一条 ⇒ 序号跳号被抓（' + w3.seqBroken.length + ' 处断裂）——照搬 seq 的价值就在这里');

    // B8 挤出后的卷首
    const WA8 = fresh();
    fill(WA8, 300);
    const v8 = WA8.auditLog.exportVol();
    a(v8.truncated === true && v8.dropped === 44 && v8.entries === 256,
      'v2121: [B8] 挤出过 ⇒ truncated=true、dropped=' + v8.dropped + '、环内 ' + v8.entries + ' 条');
    a(v8.rows[0].seq === 45,
      'v2121: [B8] **序号真源照搬**：卷首是真实的 45（不是被重算成 1）——缺头这件事因此说得出口（实 ' + v8.rows[0].seq + '）');
    // 自称完整却缺头（外来卷检测面）
    const t8 = JSON.parse(JSON.stringify(v8));
    t8.truncated = false; t8.rows = t8.rows.slice(1);
    const w8 = WA8.auditLog.verifyVolWith(t8);
    a(w8.headless === true, 'v2121: [B8] 裁掉卷首却自称完整 ⇒ headless=true（自称与事实不符，单独报，不与链断混成一句）');
  }

  // ─────────────── C 面：不变式 ───────────────
  {
    // C1 导出不改本侧
    const WA = fresh();
    const L = fill(WA, 4);
    L.flush();                                   // 制造落盘面读数（导出不该碰它）
    const before = snap(WA);
    const v = L.exportVol();
    const after = snap(WA);
    a(JSON.stringify(before) === JSON.stringify(after),
      'v2121: [C1] 导出**不改本侧**：stat 逐项不变（前后 ' + JSON.stringify(after) + '）');
    a(v.entries === 4, 'v2121: [C1] 且导出的确实是环内那 4 条');
    // 复核留存：再导一次仍拿得到（「取证不得擦掉证据」）
    const v2 = L.exportVol();
    a(v2.entries === 4 && JSON.stringify(v2.rows) === JSON.stringify(v.rows),
      'v2121: [C1] 连续导出两次拿到同一卷（导出不清环）');

    // C2 带外核对零状态触碰
    const WA2 = fresh();
    WA2.mainWin.localStorage.clear();            // 存储是**共享的**（跨用例累积）⇒ 显式清一次
    const L2 = fill(WA2, 4);
    L2.flush();
    const b2 = snap(WA2);
    const self2 = L2.exportVol();
    const foreign = JSON.parse(JSON.stringify(self2));
    // 制造**跳号**（只平移整体是抓不到的：序号链只判「逐条 +1」，整体平移照样连续——
    //   这是本版自纠：首版把所有 seq 一起 +100，实测 seqOk 仍为 true，判据形态选错了地方）。
    foreign.rows[1].seq = foreign.rows[1].seq + 100;
    const w = L2.verifyVolWith(foreign);
    const a2 = snap(WA2);
    a(w.ok === false && w.seqOk === false, 'v2121: [C2] 外来错卷如实报断（seqOk=' + w.seqOk + '）');
    a(JSON.stringify(b2) === JSON.stringify(a2),
      'v2121: [C2] 核对**零状态触碰**：stat 逐项不变');
    a(L2.count() === 4, 'v2121: [C2] 且核对**不并入环**（环仍是 4 条，没被外来卷塞满）');
    a(JSON.stringify(L2.exportVol().rows) === JSON.stringify(self2.rows),
      'v2121: [C2] 也不顶替本侧卷（本侧导出的仍是自己那一卷）');
    a(L2.record('t.act', {}) && L2.exportVol().entries === 5,
      'v2121: [C2] 核对之后照旧能继续记录（序号没被外来卷带偏）');

    // C3 口径分列
    const WA3 = fresh();
    WA3.mainWin.localStorage.clear();
    const L3 = fill(WA3, 2);
    L3.flush();
    const byRestore = L3.restore();
    const byVerify = L3.verifyVolWith(L3.exportVol());
    a(byRestore.available === true && byRestore.total === 2, 'v2121: [C3] restore 答「本机存过什么」（' + byRestore.total + ' 条）');
    a(byVerify.ok === true && byVerify.outcome === 'self-consistent', 'v2121: [C3] verifyVolWith 答「这卷自洽吗」');
    a(byRestore.seqOk === undefined && byVerify.available === undefined,
      'v2121: [C3] 两个口互不替代（各报各的字段）——缺一留缝，故两个都留');
    // 核对一份卷**不读** localStorage：清空存储后照旧核得出
    const WA4 = fresh();
    const L4 = fill(WA4, 2);
    const vol4 = JSON.parse(JSON.stringify(L4.exportVol()));
    L4.flush();
    WA4.mainWin.localStorage.clear();
    a(L4.verifyVolWith(vol4).ok === true, 'v2121: [C3] 核对一份卷**不读** localStorage（清空存储后照旧核得出）');
    a(L4.restore().total === 0, 'v2121: [C3] 对照：restore 读的正是存储，清空后确实什么都没了（两条不同的证据）');
  }
}

/** 负控制：真源码破坏 → 在破坏副本上重跑**同款**判据 */
function runNegative(a) {
  const r = auditSrc();
  hits(r, ANCHOR_ROWS);
  hits(r, ANCHOR_BADROWS);
  // N1a：把行面导出改成**现算 seq**（本版最贵的口径③——「序号真源照搬」——被抹掉）
  //   ⇒ B8 必须现形。破坏形态是**实测定的**：环内序号永远是 1..n 连续，故在「未挤出」的
  //   路径上照搬与重算**同值**、破坏不可观测。必须先把卷推过环形上限（挤出 ⇒ 卷首为 45），
  //   照搬与重算才分道——判据的形态要选在「两者不同」的地方，否则测的是巧合。
  const brokenRows = r.replace(ANCHOR_ROWS, [
    '        rows: _ring.map(function (r, __i) {',
    '          return { seq: (__i + 1), at: r.at, user: r.user, action: r.action, surface: r.surface,',
    '            params: r.params, paramsTruncated: r.paramsTruncated, result: r.result, ip: r.ip };',
    '        })'
  ].join('\n'));
  a(brokenRows !== r, 'v2121: [N1] 破坏确实改写了源码（导出行面改成现算 seq）');
  const WAo = fresh();
  fill(WAo, 300);
  const vo = WAo.auditLog.exportVol();
  a(vo.rows[0].seq === 45, 'v2121: [N1] 对照：原版导出**照搬**被挤出后剩下的真实序号（实 ' + vo.rows[0].seq + '）——口径③的落点就在这里');
  a(vo.truncated === true && vo.rows[0].seq === 45,
    'v2121: [N1] 对照：原版上 truncated=true 与卷首 45 是**两条互证**的事实（都指向「缺头」）');
  const WAn = gate.fresh({ srcOverride: { 'core/audit-log.js': brokenRows } }).WA;
  fill(WAn, 300);
  const vn = WAn.auditLog.exportVol();
  a(vn.rows[0].seq === 1, 'v2121: [N1] 破坏版把 45 重算成 ' + vn.rows[0].seq + '——缺头被洗白成「自洽」');
  a(vn.truncated === true && vn.rows[0].seq === 1,
    'v2121: [N1] 破坏后 B8 现形：同一份卷里 truncated=true 与卷首 1 **自相矛盾**——「这卷缺不缺头」被彻底消除了，正是本口径要防的那种静默');
  // N1b：抹掉行面早退 ⇒ B6 必须现形：读不了的行**被算进「核过了」**
  //   自纠：此处**不**断言「破坏后抛错」——实测不抛（`Number(undefined)` 得 NaN，不会炸），
  //   真实形态比抛错更坏：它**静默地把垃圾行当成核过的一条**，于是「连读都读不了」
  //   被伪装成「核过了，自洽」。判据改看这个可观测形态（与 v2980 的同款自纠同规格）。
  const brokenBad = r.replace(ANCHOR_BADROWS, "    if (badRows) { /* 行面不再早退 */ }");
  a(brokenBad !== r, 'v2121: [N1] 破坏确实改写了源码（行面早退被抹掉）');
  const WAb = gate.fresh({ srcOverride: { 'core/audit-log.js': brokenBad } }).WA;
  const rb = WAb.auditLog.verifyVolWith({ format: 'worldaxis.audit.vol', formatVersion: 1, rows: ['x'] });
  const okb = fresh().auditLog.verifyVolWith({ format: 'worldaxis.audit.vol', formatVersion: 1, rows: ['x'] });
  a(okb.reason === 'bad-rows' && okb.compared === undefined,
    'v2121: [N1] 对照：原版上读不了的行被如实拒收（reason=' + okb.reason + '），不进核对面');
  a(!rb.reason && rb.compared === 1,
    'v2121: [N1] 破坏后 B6 现形：同一份卷不再拒收，反而报「核了 1 条」（compared=' + rb.compared + '）'
    + '——垃圾行被伪装成核过的一条，这正是「静默跳过」那一类');
  a(rb.ok === true, 'v2121: [N1] 且它给的是「自洽」而不是「卷不合规」（ok=' + rb.ok + '）——两句话被混成一句');
  // N2：影响面有限——导出行面的破坏不影响 restore（它读的是 localStorage，不读卷的行面）
  const WA2 = gate.fresh({ srcOverride: { 'core/audit-log.js': brokenRows } }).WA;
  const L2 = WA2.auditLog;
  L2.record('t.act', {});
  L2.flush();
  const rs2 = L2.restore();
  a(rs2.available === true && rs2.total === 1,
    'v2121: [N2] 影响面有限：restore（落盘读回）不读卷的行面，破坏后照旧为真（' + rs2.total + ' 条）');
  // N3：非恒真——原版上两条判据都能取到真值，且一次核对不改状态
  const WA3 = fresh();
  const L3 = fill(WA3, 3);
  const v3 = L3.exportVol();
  a(L3.verifyVolWith(v3).ok === true, 'v2121: [N3] 非恒真：原版上带外核对为真（不是恒假）');
  const s3a = snap(WA3);
  L3.verifyVolWith(JSON.parse(JSON.stringify(v3)));
  a(JSON.stringify(snap(WA3)) === JSON.stringify(s3a),
    'v2121: [N3] 且一次核对之后读数逐项不变（判据不是靠「核对碰了状态」才成立）');
  a(L3.exportVol().entries === 3, 'v2121: [N3] 核对之后仍导得出同一卷（证据没被核对擦掉）');
  // N4：锚点工具两向自证
  let threw0 = null;
  try { hits(auditSrc(), '这段代码在真源码里不存在__N4__'); } catch (e) { threw0 = e; }
  a(!!threw0, 'v2121: [N4] 锚点工具两向自证：不存在的锚点必须抛（实 ' + (threw0 && threw0.message.slice(0, 30)) + '）');
  let threw2 = null;
  try { hits('aaa', 'a'); } catch (e) { threw2 = e; }
  a(!!threw2, 'v2121: [N4] 锚点工具两向自证：不唯一的锚点必须抛（实 ' + (threw2 && threw2.message.slice(0, 30)) + '）');
  a(hits(auditSrc(), ANCHOR_ROWS) === 1 && hits(auditSrc(), ANCHOR_BADROWS) === 1,
    'v2121: [N4] 两个真锚点在真源码各恰中 1 次');
}
module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
