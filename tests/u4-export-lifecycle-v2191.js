'use strict';
// WorldAxis tests/u4-export-lifecycle-v2191.js — U4「导出面从『有登记』升级为『有去向与复查期』」专锁
//
// ── 本锁要证的（U4 验收四条，逐条对应一段）────────────────────────────
//   ① 新增导出无登记即红  —— 由 `tests/o8-consumer-gate-v2187.js` 的 B 段承担（不重复实现），
//      本锁只证「它还在跑」+ 本锁与它同源（不另立一份档位/形态表）；
//   ② 超期未复核的 programmatic 条目**进入清单并能在诊断面列出**；
//   ③ 四个新引擎（v2.189.0）的每个导出都有明确去向；
//   ④ `disposition: 应删除` 的条目真的被删，或改成保留并给出理由。
//
// ── 分四段 ───────────────────────────────────────────────────────────
//   A 静态：生命周期四项字段齐备、去向**由形态派生**（不手写）、复查窗是常量、导出面齐备；
//   B 运行时：现场零超期、零缺字段、零去向过期；清单可列（超期/缺字段/去向过期三档分开）；
//   C 不变式：连调两次逐字相同；
//   N 负控制（**全部纯函数 / 内存副本真破坏**，两向自证）：
//     N1 把「现在」推到复查窗之外 ⇒ overdue 成片现形（**窗口真的在算**）
//     N2 删掉一个生命周期字段 ⇒ missing-field
//     N3 复查期写成不可解析串 ⇒ unreadable（**读不到 ≠ 未超期**）
//     N4 把 purpose 改成别的形态 ⇒ purpose-stale（**形态变了与理由过期分开报**）
//     N5 disposition 词表：现场不允许出现「应删除」却仍在册的条目
//     N6 两向自证：原版零超期（判据非恒真）
//     N7 版本比较：不可解析返回 null，**不当作 0**（否则坏值会被判成「没到期」）
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CT = require('../tools/consumer-types.js');

const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
const FIELDS = ['purpose', 'nextConsumer', 'reviewAfter', 'disposition'];

// ══════════ A. 静态 ══════════
function runA(A) {
  console.log('\nA. 生命周期字段的形态');
  ['staleReviews', 'reviewAfterOf', 'compareVersion', 'parseVersion']
    .forEach(function (k) { A(typeof CT[k] === 'function', 'A1 consumer-types 导出 ' + k); });
  A(typeof CT.REVIEW_WINDOW_MINOR === 'number' && CT.REVIEW_WINDOW_MINOR >= 1,
    'A2 复查窗是常量（' + CT.REVIEW_WINDOW_MINOR + ' 个小版本）—— 不是散在各处的字面量');
  A(!!CT.NEXT_CONSUMER_OF && typeof CT.NEXT_CONSUMER_OF === 'object',
    'A3 「下一个消费者」按形态派生（' + Object.keys(CT.NEXT_CONSUMER_OF || {}).length + ' 个形态）');
  // 规则面不许留缺口：所有合法形态都要有去向派生规则
  A(CT.SHAPES.every(function (s) { return !!CT.NEXT_CONSUMER_OF[s]; }),
    'A4 每个合法形态都有去向派生规则（缺口 ' + CT.SHAPES.filter(function (s) { return !CT.NEXT_CONSUMER_OF[s]; }).join(',') + '）');
  const led = CT.loadRegistry();
  const keys = Object.keys(led.programmatic || {});
  A(keys.length >= 100, 'A5 登记面非空（' + keys.length + ' 条）—— 空表上「零超期」是恒真的');
  const missing = keys.filter(function (k) {
    return FIELDS.some(function (f) { return !String((led.programmatic[k] || {})[f] || '').trim(); });
  });
  A(missing.length === 0, 'A6 每条登记都有四项生命周期字段（缺 ' + missing.length + ' 条）',
    missing.slice(0, 4).join(', '));
  // 去向必须**由形态派生**（purpose === shape），不是人手写的另一套说法
  const drifted = keys.filter(function (k) { return led.programmatic[k].purpose !== led.programmatic[k].shape; });
  A(drifted.length === 0, 'A7 去向与形态同源（purpose === shape；漂移 ' + drifted.length + ' 条）');
  A(keys.every(function (k) { return ['keep', '应删除'].indexOf(led.programmatic[k].disposition) >= 0; }),
    'A8 disposition 落在有限词表内（keep / 应删除）');
  // 复查期算术必须与窗口常量同源
  const bad = keys.filter(function (k) {
    const v = led.programmatic[k];
    const p = CT.parseVersion(v.reviewAfter);
    return !p || p[1] - CT.REVIEW_WINDOW_MINOR < 0;
  });
  A(bad.length === 0, 'A9 复查期都可解析（坏值 ' + bad.length + ' 条）');
}

// ══════════ B. 运行时 ══════════
function runB(A) {
  console.log('\nB. 现场：零超期 / 零缺字段 / 零去向过期');
  const res = CT.classify();
  const led = CT.loadRegistry();
  const probs = CT.staleReviews(res, led);
  A(probs.length === 0, 'B1 当前版本下零问题（实 ' + probs.length + '）',
    JSON.stringify(probs.slice(0, 3)));
  const overdue = probs.filter(function (x) { return x.kind === 'overdue'; });
  A(overdue.length === 0, 'B2 零超期（实 ' + overdue.length + '）');
  const miss = probs.filter(function (x) { return x.kind === 'missing-field'; });
  A(miss.length === 0, 'B3 零缺字段（实 ' + miss.length + '）');
  // 四个新引擎的导出都有去向（验收③ 的现场面）
  const ns4 = ['beatReport', 'planAudit', 'beatLedger', 'genGate'];
  const entries4 = res.entries.filter(function (e) { return ns4.indexOf(e.ns) >= 0; });
  A(entries4.length >= 20, 'B4 v2.189.0 四个引擎的导出在清册面里（实 ' + entries4.length + ' 项）');
  const pro4 = entries4.filter(function (e) { return e.type === 'programmatic'; });
  const noDest = pro4.filter(function (e) {
    const v = (led.programmatic || {})[e.key];
    return !v || !v.nextConsumer;
  });
  A(noDest.length === 0, 'B5 四个引擎里每一位 programmatic 导出都有明确去向'
    + '（programmatic ' + pro4.length + ' 项 / 无去向 ' + noDest.length + ' 项）',
    noDest.slice(0, 4).map(function (e) { return e.key; }).join(', '));
  // 清单**可列**（验收②）：用推后版本的纯函数驱动，不改真文件
  const bumped = CT.staleReviews(res, led, CT.reviewAfterOf('2.196.0'));
  A(bumped.filter(function (x) { return x.kind === 'overdue'; }).length > 0,
    'B6 把「现在」推到窗口之外 ⇒ 清单真的列得出（实 '
    + bumped.filter(function (x) { return x.kind === 'overdue'; }).length + ' 条超期）');
}

// ══════════ C. 不变式 ══════════
function runC(A) {
  console.log('\nC. 不变式（连调两次逐字相同，无副作用）');
  const res = CT.classify();
  const led = CT.loadRegistry();
  const r1 = JSON.stringify(CT.staleReviews(res, led));
  const r2 = JSON.stringify(CT.staleReviews(res, led));
  A(r1 === r2, 'C1 连续两次现算逐字相同');
  const l1 = JSON.stringify(CT.loadRegistry());
  const l2 = JSON.stringify(CT.loadRegistry());
  A(l1 === l2, 'C2 台账读取无副作用');
}

// ══════════ N. 负控制 ══════════
function runN(A) {
  console.log('\nN. 负控制（纯函数 / 内存副本真破坏 + 两向自证）');
  const res = CT.classify();
  const real = CT.loadRegistry();
  const clone = function () { return JSON.parse(JSON.stringify(real)); };
  const key = Object.keys(real.programmatic)[0];

  // N1：把「现在」推到窗口之外 ⇒ overdue 成片现形
  const far = clone();
  Object.keys(far.programmatic).forEach(function (k) { far.programmatic[k].reviewAfter = '2.191.0'; });
  const n1 = CT.staleReviews(res, far, '2.199.0');
  const n1over = n1.filter(function (x) { return x.kind === 'overdue'; });
  A(n1over.length === Object.keys(far.programmatic).length,
    'N1 全部条目超期都现形（' + n1over.length + ' / ' + Object.keys(far.programmatic).length + '）—— 窗口真在算');
  A(n1over[0] && n1over[0].reviewAfter === '2.191.0' && n1over[0].now === '2.199.0',
    'N1b 超期条带齐字段（reviewAfter / now）供诊断面列出');

  // N2：删掉一个字段 ⇒ missing-field
  const n2 = clone(); delete n2.programmatic[key].nextConsumer;
  A(CT.staleReviews(res, n2).some(function (x) { return x.kind === 'missing-field' && x.field === 'nextConsumer'; }),
    'N2 删掉 nextConsumer ⇒ missing-field 现形（' + key + '）');

  // N3：复查期不可解析 ⇒ unreadable（读不到 ≠ 未超期）
  const n3 = clone(); n3.programmatic[key].reviewAfter = 'soon';
  const n3p = CT.staleReviews(res, n3);
  A(n3p.some(function (x) { return x.kind === 'unreadable' && x.key === key; }),
    'N3 复查期写成不可解析串 ⇒ 报 unreadable（**不当作「没到期」**）');
  A(CT.compareVersion('soon', '2.196.0') === null && CT.compareVersion('2.191.0', '2.196.0') === -1
    && CT.compareVersion('2.199.0', '2.196.0') === 1 && CT.compareVersion('2.196.0', '2.196.0') === 0,
    'N3b 版本比较四态齐备（坏值 null / 小 / 大 / 相等）—— 坏值不会被当成 0');

  // N4：purpose 改成别的形态 ⇒ purpose-stale（形态变了与理由过期分开报）
  const n4 = clone();
  n4.programmatic[key].purpose = n4.programmatic[key].purpose === 'query-api' ? 'data-const' : 'query-api';
  A(CT.staleReviews(res, n4).some(function (x) { return x.kind === 'purpose-stale' && x.key === key; }),
    'N4 去向与现场形态不一致 ⇒ purpose-stale 现形（与 overdue 分开报，不合成一档）');

  // N5：disposition 词表 —— 不许「应删除」却仍在册（验收④）
  const inList = Object.keys(real.programmatic).filter(function (k) {
    return real.programmatic[k].disposition === '应删除'; });
  const stillHasConsumer = inList.filter(function (k) {
    const e = res.entries.filter(function (x) { return x.key === k; })[0];
    return e && e.hits.some(function (h) { return h !== 'programmatic'; });
  });
  A(stillHasConsumer.length === 0,
    'N5 现场没有「标了应删除却仍有真实消费者」的条目（实 ' + stillHasConsumer.length + ' 条）'
    + ' —— 登记不是豁免，也不是拖延借口');
  A(inList.length === 0, 'N5b 现场 0 条 disposition=应删除（本版全部复核为 keep）');

  // N6：两向自证 —— 原版零超期
  A(CT.staleReviews(res, real).filter(function (x) { return x.kind === 'overdue'; }).length === 0,
    'N6 对照：原版上同款判据为零超期（判据非恒真）');

  // N7：真源码 / 真台账未被改动
  A(JSON.stringify(CT.loadRegistry()) === JSON.stringify(real),
    'N7 负控制全程未改真台账（消费登记表逐字未变）');
}

// ── 加载契约（v2.191.0 收口补）───────────────────────────────────────────
//   本文件初版**没有 `runAll` 导出**，且顶层无条件自跑 + `process.exit`。
//   两个缺陷叠在一起：被 `tests/run.js` 的 `runLock` require 时（a）先终止整个回归进程，
//   而 `runLock` 取 `require(spec)['runAll']` 会拿到 undefined；（b）因为上一条锁先退出了
//   整个进程，**本锁一次都没被执行到，所以从未暴露**。
//   现场代价：整趟回归读数从 15907 掉到 53，status 仍是 `passed`、`unchanged: true` ——
//   本仓点过名的**假绿**：没有任何一条门禁报错，只是后面几千条再也没跑。
function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A); runC(A); runN(A);
}
module.exports = { runAll: require('./lock-assert.js').restoring(runAll) };
if (require.main === module) {
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nU4-EXPORT-LIFECYCLE-V2191: '
    + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
  failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
  process.exit(failures.length ? 1 : 0);
}