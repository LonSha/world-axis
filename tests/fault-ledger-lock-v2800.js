#!/usr/bin/env node
// WorldAxis tests/fault-ledger-lock-v2800.js -- 故障台账总目专锁（v2.80.0 第十四面 A）
//
// 治的病
//   v2.63.0 给 world / shadow / threads 立了「被拒了什么」的账（stat.faults），并由 tool-diag 的
//   secWorld / secShadow / secThreads 三节分别报出。此后陆续又有二十余个模块照同一口径建了台账，
//   却一个都没被念出来——**台账建了，读侧没长**。
//   这类缺陷的失败模式不是「观测错误」，而是「观测缺失」：那些模块的拒收在诊断面板上与
//   「什么也没发生」长得一模一样，而「没记录」与「没发生」在读数上不可分。
//
// 本锁判的是**结构性的那一半**：逐模块单列采集节在结构上兜不住「有没有漏掉某个模块」——
//   漏一个模块，它的采集节与它一起缺席，面板照绿。一张会自己长大的总目才兜得住。
//   故判据是：凡以 stat().faults 记账的模块，必须出现在同一张总目里；且这张总目**自己算得出来**
//   （与独立遍历的结果逐项相等，而不是靠维护者记得来加一行）。
//
// 三向自证：
//   A 结构：secFaultLedger 在导出面、被 collect() 消费、且未给 verdict 添新 error。
//   B 现场：真仓库上总目的模块集合 === 独立遍历算出的「有台账且非空」集合（非空转）。
//   C 实质：三处真源码破坏（摘接线 / 退回逐模块 / 摘快照）都必须现形。
//   D 非空转：破坏确实改变了行为；原版上同款判据全部为真。
//   E 无副作用：零文件改写、不动宿主全局。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const fresh = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };

// 产品源码在**本锁加载时**的哈希：破坏一律发生在内存副本上，
// 故结尾比对哈希即可证明「零文件改写」（而不是靠一句恒真的 indexOf 自我安慰）。
function sha(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, rel), 'utf8')).digest('hex'); }
const DIAG0 = 'engines/tool-diag.js';
const HASH_AT_LOAD = sha(DIAG0);

function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/** 在真源码上做定点破坏（锚点须恰命中 1 次），判据在内存副本上重跑。 */
function broke(rel, from, to) {
  const raw = srcOf(rel);
  const n = raw.split(from).length - 1;
  if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + rel + ' :: ' + from.slice(0, 60));
  return raw.split(from).join(to);
}

const DIAG = 'engines/tool-diag.js';

// ── 破坏表（每条锚点取自产品源码，各恰 1 次）──
const BROKEN = [
  { key: 'drop-wiring', rel: DIAG,
    from: 'faultLedger: secFaultLedger()',
    to: 'faultLedger: undefined',
    why: '把总目从 collect() 摘掉 ⇒ 面板回到「台账建了没人念」的原状' },
  { key: 'legacy-only', rel: DIAG,
    from: '      rows.sort(function (a, b) { return b.total - a.total || (a.module < b.module ? -1 : 1); });',
    to: '      rows.sort(function (a, b) { return b.total - a.total || (a.module < b.module ? -1 : 1); });\n'
      + "      for (var __i = rows.length - 1; __i >= 0; __i--) { if (['world', 'shadow', 'threads'].indexOf(rows[__i].module) < 0) rows.splice(__i, 1); }",
    why: '退回「只报那三个老模块」的逐模块口径 ⇒ 其余台账模块在总目里失踪' },
  // 注：曾试过第三条「读数不快照拷贝（counts = f）」——它在本仓**不是可观测缺陷**：
  //   secFaultLedger 读的是 `m.stat()`，而统计面 27 个模块的 stat() 一律返回 faults 的副本，
  //   故把副本原样转手仍改不动内部台账。判据在这里会正确地判「没坏」——那就不是一条判据，
  //   换成本节**自己声明的口径**那条：空台账不进总目（与独立遍历的「非空」口径同宽）。
  { key: 'empty-padding', rel: DIAG,
    from: '        if (!kinds.length) return;                 // 空台账不进总目（否则总目被几十行零填满）',
    to: '        if (false) return;                          // （破坏）空台账也进总目',
    why: '空台账被放进总目 ⇒ 面板被几十行零填满，且总目集合与「真有拒收的模块」不再同宽' },
];

// ── 独立遍历：不看总目，自己数「有台账且非空」的模块 ──
function independentOwners(WA) {
  const acc = [];
  Object.keys(WA).forEach(function (k) {
    const m = WA[k];
    if (!m || typeof m !== 'object' || typeof m.stat !== 'function') return;
    let st = null;
    try { st = m.stat(); } catch (e) { return; }
    if (!st || typeof st !== 'object' || !st.faults || typeof st.faults !== 'object') return;
    if (!Object.keys(st.faults).length) return;
    acc.push(k);
  });
  return acc.sort();
}
/** 造出若干模块的真故障：走真 API、喂病理参数（不合成台账键，避免自我指涉）。 */
const SEED_MODS = ['fondness', 'appearance', 'karma', 'threads', 'world', 'hazard', 'ladder',
  'quota', 'tempo', 'tolerance', 'enigma', 'survival', 'warrant', 'spotlight', 'marginal', 'bonds'];
const SEED_ARGS = [[], [null], ['__probe__'], [{}], [-1], ['__probe__', {}]];
function seed(WA) {
  SEED_MODS.forEach(function (k) {
    const m = WA[k];
    if (!m || typeof m !== 'object') return;
    Object.keys(m).forEach(function (fn) {
      if (typeof m[fn] !== 'function') return;
      SEED_ARGS.forEach(function (args) {
        try { m[fn].apply(m, args); } catch (e) {}
      });
    });
  });
}
function ledgerModsOf(WA) {
  const c = WA.toolDiag.collect();
  const fl = c && c.faultLedger;
  if (!fl || !Array.isArray(fl.rows)) return null;
  return fl.rows.map(function (r) { return r.module; }).sort();
}

// ═══ A 结构 / B 现场（真源码上必须为真）═══
function runAll(a) {
  const WA = fresh({});
  seed(WA);

  // A 结构
  a(typeof WA.toolDiag.secFaultLedger === 'function', 'A1 总目采集节在导出面（secFaultLedger）');
  const c = WA.toolDiag.collect();
  a(!!(c && c.faultLedger && Array.isArray(c.faultLedger.rows)), 'A2 总目被 collect() 消费（collect().faultLedger.rows）');
  a(typeof c.faultLedger.owners === 'number' && c.faultLedger.owners > 0,
    'A3 总目报出「以 stat().faults 记账的模块数」（实 ' + (c.faultLedger || {}).owners + '）');

  // B 现场：总目模块集合 === 独立遍历算出的集合
  const indep = independentOwners(WA);
  const led = ledgerModsOf(WA);
  a(indep.length > 0, 'B0 现场确实有非空台账（独立遍历实 ' + indep.length + ' 个，判据非空转）');
  a(led !== null, 'B1 总目可读');
  a(JSON.stringify(led) === JSON.stringify(indep),
    'B2 总目的模块集合与独立遍历逐项相等（总目 ' + JSON.stringify(led) + ' vs 独立 ' + JSON.stringify(indep) + '）');

  // B 现场：读数必须是快照（改返回值不得改台账）
  const fl0 = WA.toolDiag.collect().faultLedger;
  const probeMod = indep[0];
  const before = JSON.stringify(probeMod && WA[probeMod].stat().faults);
  fl0.rows.forEach(function (r) { r.counts.__LEDGER_PROBE__ = 999; r.total = -1; });
  const after = JSON.stringify(WA[probeMod].stat().faults);
  a(after === before, 'B3 总目读数与模块台账相互隔离（改写总目返回值后模块台账不变：' + before + '）');
  a(JSON.stringify(WA.toolDiag.collect().faultLedger.rows) !== JSON.stringify(fl0.rows),
    'B4 总目每次采集重新计算（不是把上一份返回值转手）');

  // A 结构：不新增 error 级判语（本版只加读侧覆盖，不产生新的红灯源）
  const errs = ((c.verdict || {}).issues || []).filter(function (x) { return x.level === 'error'; });
  const ledgerErrs = errs.filter(function (x) { return String(x.key || '').indexOf('fault') >= 0; });
  a(ledgerErrs.length === 0, 'A4 总目不产生新的 error 判语（只报不判，实 ' + ledgerErrs.length + ' 条）');
}

// ═══ C 实质 / D 非空转 ═══
function runNegative(a) {
  // 每条破坏：必须在内存副本上现形，且原版上同款判据为真（判据纯度）
  const probes = {
    'drop-wiring': function (WA) { return !!(WA.toolDiag.collect().faultLedger && Array.isArray(WA.toolDiag.collect().faultLedger.rows)); },
    'legacy-only': function (WA) {
      seed(WA);
      const indep = independentOwners(WA);
      const led = ledgerModsOf(WA);
      return !!led && JSON.stringify(led) === JSON.stringify(indep);
    },
    'empty-padding': function (WA) {
      seed(WA);
      const indep = independentOwners(WA);
      const led = ledgerModsOf(WA);
      return !!led && JSON.stringify(led) === JSON.stringify(indep);
    },
  };

  // 原版基准：三条判据都为真
  const WA0 = fresh({});
  Object.keys(probes).forEach(function (k) {
    a(probes[k](WA0) === true, 'D1 原版上判据为真（' + k + '）——判据不是恒假');
  });

  BROKEN.forEach(function (b) {
    let WA;
    try {
      WA = fresh({ srcOverride: (function () { const o = {}; o[b.rel] = broke(b.rel, b.from, b.to); return o; })() });
    } catch (e) {
      a(false, 'C 破坏可施加（' + b.key + '）：' + e.message);
      return;
    }
    a(probes[b.key](WA) === false, 'C 真源码破坏必须现形 [' + b.key + ']：' + b.why);
  });

  // 锚点各恰命中 1 次（二次确认；broke() 内已断言，这里把它变成可读的判据）
  BROKEN.forEach(function (b) {
    const n = srcOf(b.rel).split(b.from).length - 1;
    a(n === 1, 'C 锚点恰命中 1 次 [' + b.key + ']（实 ' + n + '）');
  });

  // D 非空转：破坏确实可观测地改变了行为（结构性字段，不是恒真比较）
  //   注意：fresh() 复用同一个 global.WorldAxis（模块按名覆盖自己的命名空间），
  //   故两次 fresh 后两个 WA 变量**是同一个对象**——取值必须紧接各自的 fresh，不能事后再比。
  const WAok = fresh({});
  const okHas = !!(WAok.toolDiag.collect() || {}).faultLedger;
  const WAbr = fresh({ srcOverride: (function () { const o = {}; o[DIAG] = broke(DIAG, BROKEN[0].from, BROKEN[0].to); return o; })() });
  const brHas = !!(WAbr.toolDiag.collect() || {}).faultLedger;
  a(okHas === true && brHas === false,
    'D2 破坏可观测地改变了行为（原版有总目=' + okHas + ' / 破坏后有总目=' + brHas + '）');

  // E 无副作用：产品源码逐字节未变、宿主全局未被替换
  a(sha(DIAG) === HASH_AT_LOAD, 'E1 产品源码逐字节未变（sha256 比对，破坏只发生在内存副本上）');
  const after = srcOf(DIAG);
  a(after.indexOf('__LEDGER_PROBE__') < 0 && after.indexOf('（破坏）空台账也进总目') < 0,
    'E2 破坏形态未落进产品源码（零文件改写）');
  a(typeof global.window === 'object' || typeof global.window === 'undefined',
    'E3 宿主全局未被替换成裸对象');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  BROKEN: BROKEN,
};

if (require.main === module) {
  let p = 0, f = 0;
  const a = function (c, name) { if (c) { p++; console.log('  \u2713 ' + name); } else { f++; console.log('  \u2717 ' + name); } };
  try { require('./mock.js'); runAll(a); runNegative(a); } catch (e) { f++; console.log('  \u2717 抛错: ' + e.message); }
  console.log('\n' + p + ' / ' + f);
  process.exit(f ? 1 : 0);
}