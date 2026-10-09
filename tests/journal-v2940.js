#!/usr/bin/env node
// WorldAxis tests/journal-v2940.js —— v2.94.0（O6 流水导出/带外对账 + O7 异常笔进健康分 + O8 经济风纳入账本）
//
// 它治的病：三句话在 v2.93.0 都答不上来——
//   ① 「上一节会话里那笔之后存量对不对」（流水只驻内存，跨会话不可判定）；
//   ② 「库存被写坏了吗」（异常笔只进面板，体检结论照样报 ok）；
//   ③ 「这些物资是在盛世囤的还是乱世抢的」（账本里没有经济风）。
//
// 口径三条：
//   ① **导出是纯读**：exportJournal 不挤出、不清空、不改 stat、不改 journalStat——
//      观测不得改变被观测对象；落盘由用户显式触发，不自动发生。
//   ② **不知道不回落**：经济风在引擎缺席 / 字段缺失 / 表外气候词三态下各有其名，
//      绝不回落成「平稳」；流水卷被截断时照实报 truncated，不假装完整。
//   ③ **没核与核过是两件事**：没拿到卷时面板报 `no-volume`，不说「核对一致」。
//
// 判据：
//   A 静态面：三面在真源码 + 两个新成员在 WA.org 导出对象里 + 内部面不导出 +
//             诊断两读数在场 + 面板三控件/绑定/守卫登记齐 + 健康分采集节不调 grant/transfer。
//   B 运行时面（真装载真调用）：
//     B1 导出卷头完整（format / version / cap / entries / recorded / dropped / truncated）
//     B2 **导出是纯读**：连导三次，流水长度与 stat 一字不变
//     B3 **带外对账**：卷与存量一致 ⇒ ok；人为改存量 ⇒ 报 vs-stock 断裂
//     B4 卷不合规四种（bad-volume / bad-format / bad-version / bad-rows）各自点名
//     B5 截断卷：挤出 5 笔 ⇒ truncated=true、dropped=5，且带外对账仍核带内
//     B6 经济风三态：表内词 ok / 表外词 unknown-climate / 字段缺失 missing（不回落）
//     B7 经济风**只读**：连读三次 evolution.economy 字节级不变
//     B8 异常笔进健康分：造负库存 ⇒ issues 出现 org.anomalies（error）且 score 下降
//     B9 **健康分纯读**：两次巡视不改变 grant/transfer/blocked
//     B10 挤出后报 org.journal（info 级且说清「对账只核到带内」）
//   C 不变式：O5 的 ledgerView / reconcile 语义一字不变
//   N0–N4 负控制：**真源码破坏 ⇒ 加载破坏副本 ⇒ 在副本上重跑同款真判据**（不是只验文本被改过）。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const ORG = 'engines/org.js', STORE = 'core/store.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const SELF = __filename;

let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }

// ══════════════ 真源码破坏锚点（各自**只在本文件声明一次**）══════════════
const ANCHORS = {
  // O6 导出纯读：把「切片返回」破坏成「导出即清空流水」（观测改变被观测对象）
  EXPORT_PURE: { rel: ORG, txt: "        savedAt: clockNow('org'), rows: journal.slice()" },
  // O6 带外对账：把「链比对」破坏成不比对（对账退化成永远自洽）
  OUTSIDE_CHAIN: { rel: ORG, txt: "    if (Object.prototype.hasOwnProperty.call(last, k) && typeof before === 'number' && before !== last[k]) {" },
  // O8 经济风不回落：把「引擎缺席报 engine-absent」破坏成「回落成平稳」
  CLIMATE_FALLBACK: { rel: ORG, txt: "      if (!WA.evolution || typeof WA.evolution !== 'object') return { available: false, reason: 'engine-absent', climate: null, signals: [] };" },
  // O8 表外气候词点名：把 unknown-climate 破坏成「装作认识」
  CLIMATE_UNKNOWN: { rel: ORG, txt: "      return { available: true, reason: recognized ? 'ok' : 'unknown-climate', climate: climate || null," },
  // O7 健康分：把「异常笔 ⇒ error」破坏成「只计不报」（体检对库存被写坏继续无感）
  HEALTH_ANOMALY: { rel: STORE, txt: '            if (orgAnomaliesN > 0) {' },
  // O7 挤出期提示：把「挤出 ⇒ info 说明只核带内」破坏成静默
  HEALTH_DROPPED: { rel: STORE, txt: '            } else if (orgJournalDroppedN > 0) {' }
};

// ══════════════ 破坏形态（每条对应一个可观测行为变化）══════════════
const BREAK = {
  EXPORT_PURE: "        savedAt: clockNow('org'), rows: (journal.length = 0, [])",
  OUTSIDE_CHAIN: '    if (false) {',
  CLIMATE_FALLBACK: "      if (!WA.evolution || typeof WA.evolution !== 'object') return { available: true, reason: 'ok', climate: '平稳', signals: [] };",
  CLIMATE_UNKNOWN: "      return { available: true, reason: 'ok', climate: climate || null,",
  HEALTH_ANOMALY: '            if (false) {',
  HEALTH_DROPPED: '            } else if (false) {'
};

/** 真源码破坏：锚点恰中 1 次才动手，返回 {src, changed} */
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
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: {} };
    d.evolution = d.evolution || {};
    d.evolution.factions = d.evolution.factions || [];
    // 夹具必须把世界复位到**已知票面**，不是「不存在才建」：
    //   fresh() 复用宿主 localStorage，上一个用例改坏的存档会带着出场
    //   （实测：probeVsStock 把「会」的粮写成 9999 后，C 面读到 holderGone 断裂）。
    //   复位而非跳过，才让每个用例的初始世界逐字相同。
    const f = d.evolution.factions.filter(function (x) { return x.name === '会'; })[0];
    if (f) { f.resources = { 粮: 100 }; } else { d.evolution.factions.push({ name: '会', resources: { 粮: 100 } }); }
    // 经济风同样复位（骨架默认），免得上一用例的 delete 传染给下一用例。
    d.evolution.economy = { climate: '平稳', signals: [] };
  }, 'v2940:seed');
  if (WA.org && WA.org.setSettings) WA.org.setSettings({ enabled: true });
  return WA;
}
/** 装一个可在此环境上跑探针的实例（over 用于注入破坏副本） */
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H.WA;
}
const F = function (rel) { const o = {}; o[rel] = src(rel); return o; };

// ══════════════ 同款真判据（原版与破坏副本上跑的是同一批函数）══════════════
/** B2：导出是纯读（连导三次，长度与 stat 一字不变） */
function probeExportPure(W) {
  try {
    W.org.grant('faction', '会', '粮', 5);
    const st1 = W.org.stat(), len1 = W.org.exportJournal().entries;
    W.org.exportJournal(); W.org.exportJournal(); W.org.exportJournal();
    const st2 = W.org.stat(), len2 = W.org.exportJournal().entries;
    return len1 === 1 && len2 === 1 && st1.grants === st2.grants && st1.transfers === st2.transfers && st1.blocked === st2.blocked;
  } catch (e) { return false; }
}
/** B3：带外对账的**链比对**——卷内自相矛盾（本笔 before 对不上上游 after）⇒ 报 chain。
 *  为什么必须验 chain 而不是只验 vs-stock：vs-stock 的比对循环在链比对**之外**，
 *  把链比对整条打断它照样报得出来——于是「对账退化成只比末值」这个缺陷看不见。
 *  链比对只核**卷内**（与本侧存量无关），故它才是「对账 ≠ 数笔数」的证明。 */
function probeOutsideChain(W) {
  try {
    W.org.grant('faction', '会', '粮', 5);
    const vol = W.org.exportJournal();
    // 追加一笔「上一位是 105、却自称 before 987」的笔——卷内自相矛盾。
    const rows = vol.rows.concat([{ op: 'grant', toKind: 'faction', toName: '会', toBefore: 987, toAfter: 990, resource: '粮', amount: 3 }]);
    const rc = W.org.reconcileWith(Object.assign({}, vol, { rows: rows }));
    return rc.ok === false && rc.breaks.some(function (b) { return b.why === 'chain'; });
  } catch (e) { return false; }
}
/** B3b：带外对账的**存量比对**——本侧存量被改坏（卷内自洽）⇒ 报 vs-stock。
 *  带外的意义正在于：本侧环形已挤出的那些笔，只有外来卷才核得到。 */
function probeVsStock(W) {
  try {
    W.org.grant('faction', '会', '粮', 5);
    const vol = W.org.exportJournal();
    W.store.transact(function (d) {
      d.evolution.factions.filter(function (x) { return x.name === '会'; })[0].resources['粮'] = 9999;
    }, 'v2940:tamper');
    const rc = W.org.reconcileWith(vol);
    return rc.ok === false && rc.breaks.some(function (b) { return b.why === 'vs-stock'; });
  } catch (e) { return false; }
}
/** B6a：**两条不回落路径**——字段缺失 ⇒ missing；引擎缺席 ⇒ engine-absent。
 *  两者都必须是 available:false + climate:null。骨架自带 economy{climate:'平稳'}，
 *  故「缺失」必须先显式 delete（不 delete 时测到的是默认值，而默认值不等于缺失）；
 *  只验 missing 也证不了「不回落」——回落发生在引擎缺席那条分支上。 */
function probeClimateMissing(W) {
  try {
    W.store.transact(function (d) { if (d.evolution) delete d.evolution.economy; }, 'v2940:no-eco');
    const m = W.org.ledgerView().climate;
    const keep = W.evolution; delete W.evolution;
    const a = W.org.ledgerView().climate;
    W.evolution = keep;
    return m.available === false && m.reason === 'missing' && m.climate === null
      && a.available === false && a.reason === 'engine-absent' && a.climate === null;
  } catch (e) { return false; }
}
/** B6b：表外气候词 ⇒ unknown-climate */
function probeClimateUnknown(W) {
  try {
    W.store.transact(function (d) { d.evolution.economy = { climate: '大萧条', signals: [] }; }, 'v2940:unknown');
    const c = W.org.ledgerView().climate;
    return c.available === true && c.reason === 'unknown-climate' && c.recognized === false;
  } catch (e) { return false; }
}
/** B8：**真实写坏路径** ⇒ 健康分报 org.anomalies（error）且分数真的下降。
 *  为什么不用「把库存改成负数」：grant / transfer 都在事务内先读 before 再算 after，
 *  算术恒成立——负库存 / 前后值漂移 / 超额支付三类异常笔在正常路径**永不自发产生**，
 *  它们正是给「账本被外部写坏」准备的探针。而 exportJournal 返回的 rows 是**元素同引用**
 *  的浅拷贝，篡改 toAfter 就是真的把账本改成「与存量对不上」——异常笔由产品自身算出，
 *  不打桩、不伪造业务状态。测的是接线（健康分确实消费了异常笔），
 *  故同实例内比相位：同笔数、同票面，只差「账本坏没坏」。 */
function probeHealthAnomaly(W) {
  try {
    W.org.grant('faction', '会', '粮', 5);
    W.store.maintain({});
    const base = W.store.maintain({}).score;
    W.org.exportJournal().rows[0].toAfter = 999;
    const m = W.store.maintain({});
    const tam = W.store.maintain({}).score;
    return (m.issues || []).some(function (x) { return x.key === 'org.anomalies' && x.level === 'error'; })
      && tam < base;
  } catch (e) { return false; }
}
/** B10：流水挤出 ⇒ 健康分报 org.journal（info，说清只核带内） */
function probeHealthDropped(W) {
  try {
    for (let i = 0; i < 205; i++) W.org.grant('faction', '会', '粮', 1);
    const m = W.store.maintain({});
    const j = (m.issues || []).filter(function (x) { return x.key === 'org.journal'; })[0];
    return !!j && j.level === 'info' && j.detail.indexOf('带内') > 0;
  } catch (e) { return false; }
}

// ══════════════ A / B / C 判据 ══════════════
function runAll(a) {
  const oSrc = src(ORG), sSrc = src(STORE), dSrc = src(DIAG), pSrc = src(PANEL);

  // ── A 静态面 ──
  Object.keys(ANCHORS).forEach(function (k) {
    const A = ANCHORS[k];
    a(hits(src(A.rel), A.txt) === 1, 'v2940: [A1] 锚点在真源码恰中 1 次（' + k + '）');
  });
  a(oSrc.indexOf("  const JOURNAL_FORMAT = 'worldaxis.org.journal';") > 0
    && oSrc.indexOf('  const JOURNAL_FORMAT_VERSION = 1;') > 0,
    'v2940: [A1] 流水卷 format / version 常量在场（跨会话可查的载体）');
  a(oSrc.indexOf('exportJournal: exportJournal, reconcileWith: reconcileWith,') > 0,
    'v2940: [A1] 两个新成员在 WA.org 导出对象里（导出即有承诺）');
  a(oSrc.indexOf('inspectJournal: inspectJournal') < 0 && oSrc.indexOf('function inspectJournal(vol)') > 0,
    'v2940: [A1] inspectJournal 是内部面**不导出**（只被 reconcileWith 消费，无独立消费方不挂）');
  a(oSrc.indexOf('climate: climateOf(),') > 0 && oSrc.indexOf('function climateOf()') > 0,
    'v2940: [A1] ledgerView 带 climate 段（账本里看得到经济风）');

  // A2 接线两面
  a(dSrc.indexOf('climate: cli ? { available: cli.available, reason: cli.reason, climate: cli.climate,') > 0
    && dSrc.indexOf('journal: vol && vol.error ? vol : (vol ? {') > 0,
    'v2940: [A2] 诊断 secOrg 经济风 + 流水卷头两读数在场（真消费方一）');
  a(['wa-org-export', 'wa-org-reconcile', 'wa-org-climate'].every(function (id) {
    return pSrc.indexOf('id="' + id + '"') > 0 && pSrc.indexOf("on('#" + id + "'") > 0;
  }), 'v2940: [A2] 面板三控件 + 三绑定成对在场（真消费方二）');
  a(dSrc.indexOf("'wa-org-export', 'wa-org-reconcile', 'wa-org-climate',") > 0,
    'v2940: [A2] 守卫表登记了三个新控件（登记错页比不登记更坏）');

  // A3 观测纯读（采集节体）
  const sec = (function () {
    const i = sSrc.indexOf('// ── 9.10 资源账本异常笔（v2.94.0 / O7）──');
    const j = sSrc.indexOf('// ── 10. 巡视自身完整性（v2.0.0）──');
    return i > 0 && j > i ? sSrc.slice(i, j) : '';
  })();
  a(sec.length > 0 && sec.indexOf('grant(') < 0 && sec.indexOf('transfer(') < 0,
    'v2940: [A3] 健康分采集节**不调** grant / transfer（观测不得改变被观测对象）');
  a(sec.indexOf('ledgerView()') > 0,
    'v2940: [A3] 健康分读的是 ledgerView（已承诺的出口），不是内部面');

  // ── B 运行时面 ──
  const W = env();
  a(typeof W.org.exportJournal === 'function' && typeof W.org.reconcileWith === 'function',
    'v2940: [B0] 两面从产品面读到（exportJournal / reconcileWith）');
  a(typeof W.org.inspectJournal === 'undefined',
    'v2940: [B0] inspectJournal 不挂在产品面上（无消费方不挂）');

  const v1 = (function () { W.org.grant('faction', '会', '粮', 5); return W.org.exportJournal(); })();
  a(v1.ok && v1.format === 'worldaxis.org.journal' && v1.formatVersion === 1 && v1.cap === 200
    && v1.dropped === 0 && v1.truncated === false && Array.isArray(v1.rows) && v1.rows.length === v1.entries,
    'v2940: [B1] 导出卷头完整（format/version/cap/entries/recorded/dropped/truncated + rows 与 entries 一致）');
  a(probeExportPure(env()), 'v2940: [B2] 导出是**纯读**：连导三次长度与 stat 一字不变');
  a(probeOutsideChain(env()), 'v2940: [B3] 卷内自相矛盾 ⇒ 带外对账报 chain 断裂（对账 ≠ 数笔数）');
  a(probeVsStock(env()), 'v2940: [B3] 本侧存量被改坏 ⇒ 报 vs-stock（卷内自洽，只有存量比对看得见）');

  const b4 = [['bad-volume', null], ['bad-format', { format: 'x', formatVersion: 1, rows: [] }],
    ['bad-version', { format: 'worldaxis.org.journal', formatVersion: 99, rows: [] }],
    ['bad-rows', { format: 'worldaxis.org.journal', formatVersion: 1 }]];
  a(b4.every(function (p) { const r = W.org.reconcileWith(p[1]); return r.ok === false && r.reason === p[0]; }),
    'v2940: [B4] 卷不合规四态各自点名（bad-volume / bad-format / bad-version / bad-rows）');

  const W2 = env();
  for (let i = 0; i < 205; i++) W2.org.grant('faction', '会', '粮', 1);
  const v2 = W2.org.exportJournal();
  a(v2.dropped === 5 && v2.truncated === true && v2.entries === 200,
    'v2940: [B5] 挤出 5 笔 ⇒ 照实报 truncated=true 与 dropped=5（不假装完整）');
  const rc3 = W2.org.reconcileWith(v2);
  a(rc3.truncated === true && rc3.checked === 200,
    'v2940: [B5] 截断卷仍可做带外对账（核带内 200 笔）');

  a(W.org.ledgerView().climate.reason === 'ok' && W.org.ledgerView().climate.climate === '平稳',
    'v2940: [B6] 表内气候词报 ok');
  a(probeClimateUnknown(env()), 'v2940: [B6] 表外气候词报 unknown-climate（既不假装认识也不隐藏）');
  a(probeClimateMissing(env()), 'v2940: [B6] 字段缺失报 missing 且 climate 为 null（**不回落成「平稳」**）');

  const W3 = env();
  W3.store.transact(function (d) { d.evolution.economy = { climate: '衰退', signals: [{ summary: 's', at: 1 }] }; }, 'v2940:ro');
  const before = JSON.stringify(W3.store.get().evolution.economy);
  W3.org.ledgerView(); W3.org.ledgerView(); W3.org.ledgerView();
  a(before === JSON.stringify(W3.store.get().evolution.economy),
    'v2940: [B7] 经济风**只读**：连读三次 evolution.economy 字节级不变');

  const W4 = env();
  a(!(W4.store.maintain({}).issues || []).some(function (x) { return x.key === 'org.anomalies'; }),
    'v2940: [B8] 无异常笔时健康分**不报** org.anomalies（设计内默认态）');
  a(probeHealthAnomaly(env()), 'v2940: [B8] 账本被真实写坏 ⇒ 报 org.anomalies error 且分数下降（体检不再对库存被写坏无感）');
  const W4b = env();
  W4b.org.grant('faction', '会', '粮', 5);
  W4b.store.maintain({});
  const b8base = W4b.store.maintain({}).score;
  W4b.org.exportJournal().rows[0].toAfter = 999;
  const b8tam = W4b.store.maintain({}).score;
  a(b8tam < b8base, 'v2940: [B8] 且 score 真的下降（同实例同笔数相位：' + b8base + ' → ' + b8tam + '）');
  const g1 = W4b.org.stat();
  W4b.store.maintain({}); W4b.store.maintain({});
  const g2 = W4b.org.stat();
  a(g1.grants === g2.grants && g1.transfers === g2.transfers && g1.blocked === g2.blocked,
    'v2940: [B9] 跑两次巡视不改变 grant/transfer/blocked（观测不得改变被观测对象）');
  a(probeHealthDropped(env()), 'v2940: [B10] 挤出期报 org.journal（info 级且说清「对账只核到带内」）');

  // ── C 不变式：O5 面不被本版破坏 ──
  const W6 = env();
  W6.org.grant('faction', '会', '粮', 10);
  const lv = W6.org.ledgerView();
  a(lv.flow.in === 10 && lv.flow.out === 0 && lv.entries === 1 && lv.holderCount >= 1
    && lv.anomalies.count === 0 && lv.reconciled.ok === true,
    'v2940: [C] O5 的账本读数语义一字不变（流入 10 / 1 笔 / 零异常 / 自洽）');
  a(W6.org.reconcile().ok === true && W6.org.reconcile().checked === 1,
    'v2940: [C] O5 的 reconcile 仍只核**带内**（带外是新增入口，不改旧语义）');
}

// ══════════════ 负控制（真源码破坏 → 破坏副本 → 副本上重跑同款真判据）══════════════
function runNegative(a) {
  const CASES = [
    ['EXPORT_PURE', probeExportPure, '导出纯读'],
    ['OUTSIDE_CHAIN', probeOutsideChain, '带外对账链比对'],
    ['CLIMATE_FALLBACK', probeClimateMissing, '经济风两态（missing/engine-absent）不回落'],
    ['CLIMATE_UNKNOWN', probeClimateUnknown, '经济风表外词点名'],
    ['HEALTH_ANOMALY', probeHealthAnomaly, '异常笔进健康分'],
    ['HEALTH_DROPPED', probeHealthDropped, '挤出期提示']
  ];
  // N0 六锚点各中 1 次（并顺带证明原版上同款判据为真——判据纯度）
  let n0 = 0;
  CASES.forEach(function (c) {
    try {
      const br = breakOne(c[0]);
      must1(src(ANCHORS[c[0]].rel), ANCHORS[c[0]].txt, c[0] + ':origin');
      // 判据纯度：原版上必须先为真，否则「破坏后为假」什么也证明不了
      if (c[1](env()) !== true) throw new Error('probe false on ORIGINAL');
      // 负控制：真源码破坏 → 装载破坏副本 → 在副本上重跑同一判据函数
      const o = {}; o[br.rel] = br.src;
      const got = c[1](env(o));
      if (got !== false) throw new Error('probe still true on BROKEN');
      n0++;
    } catch (e) { console.log('  ✗ N1 ' + c[0] + ': ' + e.message); }
  });
  a(n0 === 6, 'v2940: [N1] 六向破坏各自现形（真源码破坏 ⇒ 破坏副本上同款判据由真变假）');

  // N2 读数随事实变化（同一实例内 entries 0 → 1）
  const W = env();
  const before = W.org.exportJournal().entries;
  W.org.grant('faction', '会', '粮', 1);
  a(before === 0 && W.org.exportJournal().entries === 1,
    'v2940: [N2] 读数随事实变化（同一实例内 entries 0 → 1）');

  // N3 原版读数自洽
  a(env().org.exportJournal().format === 'worldaxis.org.journal',
    'v2940: [N3] 原版读数自洽（format 常量照实）');

  // N4 工具两向自证：命中 0 必抛 / 命中 2 必抛 / 破坏必须可观测改行为
  let t0 = false, t2 = false, tNoop = false;
  try { must1(src(ORG), 'THIS-ANCHOR-DOES-NOT-EXIST-AT-ALL', 'n4-zero'); } catch (e) { t0 = true; }
  try { must1(ANCHORS.EXPORT_PURE.txt + '\n' + ANCHORS.EXPORT_PURE.txt, ANCHORS.EXPORT_PURE.txt, 'n4-two'); } catch (e) { t2 = true; }
  try { const s = src(ORG); if (s.replace(ANCHORS.EXPORT_PURE.txt, BREAK.EXPORT_PURE) === s) throw new Error('no-op'); } catch (e) { tNoop = true; }
  a(t0 && t2 && !tNoop, 'v2940: [N4] 工具两向自证（命中 0 必抛 / 命中 2 必抛 / 破坏须可观测改行为）');

  // H5 判据纯度：锚点字面量在本文件内只出现一次（不得在判据里重复引用锚点串）
  const self = fs.readFileSync(SELF, 'utf8');
  let h5 = 0;
  Object.keys(ANCHORS).forEach(function (k) {
    if (hits(self, ANCHORS[k].txt) === 1) h5++;
  });
  a(h5 === 6, 'v2940: [H5] 锚点字面量在本文件各只声明一次（判据不得重复引用锚点串）');
}

if (require.main === module) {
  console.log('JOURNAL-V2940');
  const t0 = Date.now();
  runAll(a);
  runNegative(a);
  console.log('JOURNAL-V2940: ' + (FAIL === 0 ? 'pass' : 'FAIL') + '（' + PASS + ' 项' + (FAIL ? ' / ' + FAIL + ' 红' : '') + '，' + (Date.now() - t0) + 'ms）');
  process.exit(FAIL === 0 ? 0 : 1);
}
module.exports = { runAll, runNegative };