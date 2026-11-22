#!/usr/bin/env node
// WorldAxis tests/v11-field-writers.js —— 多写者字段写权声明锁（v2.300.0 · V11 OPV11-6）
//
// 【它治什么】
//   立项读数：`worldFacts` / `people` / `evolution` 各被 5 个引擎写，`customLax` / `economy`
//   各 3 个。**全仓没有任何地方声明「这个字段由谁负责、其他人是追加还是覆盖」**。
//   后果：同一字段两个覆盖型写者同时存在时，后写的静默吃掉先写的，而读面只看到一个
//   「正常」的值 —— 与 V11 其它项同族，只是发生在写权层。
//
// 【判据】
//   W1  五个字段都存在且有 owner / conflict / note（缺一个即红）。
//   W2  **双向对账**：声明里的写者集合 == 静态扫描出的写者集合（多一个少一个都红）。
//       ⚠ 这是本项的核心：不做对账，声明表就只是一份「看起来对」的文档。
//   W3  每个写者的 mode ∈ ['append','merge','overwrite']（拼错即红）。
//   W4  owner 必须在 writers 清单里（责任方自己不写，等于没有责任方）。
//   W5  **真冲突必须登记**：>=2 个 overwrite 写者的字段，conflict 必须 === 'declared'。
//       未登记的冲突 ⇒ `undeclaredConflicts()` 非空 ⇒ 红。
//   W6  登记过的冲突必须有**非空且够长**的 note（>20 字）：空说明 = 遮羞布。
//   W7  无冲突字段（<2 覆盖者）不得标成 'declared'（虚报治理项同样是把账本弄脏）。
//   W8  stat 自洽：fields == 5，writers == 各字段写者数之和，declared == 已登记数。
//   W9  纯只读：调 view/conflicts/stat 前后 store 深比较相等。
//
// 【两向自证】
//   N0  锚点各恰中 1 次；N1 给某字段加一个现场不存在的写者 ⇒ W2 现形；
//   N2 把某字段的 conflict 从 'declared' 改成 'none' ⇒ W5 现形；N3 原版上同款判据仍成立。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const TARGET = 'engines/field-writers.js';
const FIELDS = ['worldFacts', 'people', 'evolution', 'customLax', 'economy'];
const MODES = ['append', 'merge', 'overwrite'];
const SKIP = ['tests/', 'tools/'];

function freshEnv(opts) {
  const env = opts ? sync.fresh(opts) : sync.fresh();
  try { global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env.WA;
}
/** 现场静态扫描：每个字段的写者文件集合（写形态见文件头注释） */
function liveWriters() {
  const pf = require('./product-files.js');
  const out = {}; FIELDS.forEach(function (f) { out[f] = []; });
  pf.productFiles(BASE).forEach(function (rel) {
    if (SKIP.some(function (s) { return rel.indexOf(s) === 0; })) return;
    let src; try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { return; }
    FIELDS.forEach(function (k) {
      const pats = [
        new RegExp('\\b(?:d|draft|root|doc|state)\\.' + k + '\\s*=[^=]', 'g'),
        new RegExp('\\b(?:d|draft|root|doc|state)\\.' + k + '\\s*\\[[^\\]]*\\]\\s*=[^=]', 'g'),
        new RegExp('\\b(?:d|draft|root|doc|state)\\.' + k + '\\.(?:push|splice|unshift|sort|forEach)\\(', 'g')
      ];
      let n = 0; pats.forEach(function (re) { const m = src.match(re); if (m) n += m.length; });
      if (n > 0) out[k].push(rel);
    });
  });
  FIELDS.forEach(function (k) { out[k].sort(); });
  return out;
}
function uniqSort(x) { return x.slice().sort().filter(function (v, i, a) { return a.indexOf(v) === i; }); }

function runAll(a) {
  const WA = freshEnv();
  const FW = WA.fieldWriters;
  a(!!FW, 'v11fw: [W0] WA.fieldWriters 已装载');
  if (!FW) return;

  // W1 五字段齐备
  {
    const missing = FIELDS.filter(function (f) { return !FW.entryOf(f); });
    a(missing.length === 0, 'v11fw: [W1a] 五个字段都在声明表里（缺: ' + (missing.join(',') || '无') + '）');
    const bad = FIELDS.map(function (f) { return FW.entryOf(f); }).filter(function (e) {
      return !e || !e.owner || !e.conflict || !e.note;
    });
    a(bad.length === 0, 'v11fw: [W1b] 每条都有 owner / conflict / note（不合格: '
      + (bad.map(function (e) { return e && e.field; }).join(',') || '无') + '）');
  }

  // W2 双向对账（核心）
  {
    const live = liveWriters();
    const diffs = [];
    FIELDS.forEach(function (f) {
      const declared = uniqSort(FW.writersOf(f));
      const actual = uniqSort(live[f] || []);
      if (declared.join(',') !== actual.join(',')) {
        diffs.push(f + '\n          声明多出: ' + (declared.filter(function (x) { return actual.indexOf(x) < 0; }).join(',') || '无')
          + '\n          现场多出: ' + (actual.filter(function (x) { return declared.indexOf(x) < 0; }).join(',') || '无'));
      }
    });
    a(diffs.length === 0, 'v11fw: [W2] 五个字段的写者集合双向对账（不一致: '
      + (diffs.length ? '\n        ' + diffs.join('\n        ') : '无') + '）——不做对账，声明表就只是一份看起来对的文档');
  }

  // W3 mode 合法性
  {
    const bad = [];
    FIELDS.forEach(function (f) {
      const e = FW.entryOf(f);
      (e ? e.writers : []).forEach(function (w) { if (MODES.indexOf(w.mode) < 0) bad.push(f + ':' + w.file + '=' + w.mode); });
    });
    a(bad.length === 0, 'v11fw: [W3] 每个写者的 mode 都在封闭集内（越界: ' + (bad.join(',') || '无') + '）');
  }

  // W4 owner 必须在 writers 里
  {
    const bad = FIELDS.filter(function (f) {
      const e = FW.entryOf(f);
      return !e || e.writers.map(function (w) { return w.file; }).indexOf(e.owner) < 0;
    });
    a(bad.length === 0, 'v11fw: [W4] owner 自己也在 writers 清单里（缺: ' + (bad.join(',') || '无') + '）——'
      + '责任方自己不写，等于没有责任方');
  }

  // W5 真冲突必须登记
  {
    const und = FW.undeclaredConflicts();
    a(und.length === 0, 'v11fw: [W5] 所有 >=2 覆盖者的冲突都已登记为 declared（未登记: '
      + (und.map(function (c) { return c.field + '(' + c.overwriters.join('/') + ')'; }).join(',') || '无') + '）——'
      + '未登记的冲突会被静默吃掉，正是本项要治的病');
  }

  // W6 已登记冲突的 note 要够长
  {
    const cs = FW.conflicts().filter(function (c) { return c.declared; });
    const thin = cs.filter(function (c) {
      const e = FW.entryOf(c.field);
      return !e || String(e.note || '').trim().length <= 20;
    });
    a(thin.length === 0, 'v11fw: [W6] ' + cs.length + ' 个已登记冲突都有 >20 字的治理说明（过短: '
      + (thin.map(function (c) { return c.field; }).join(',') || '无') + '）');
  }

  // W7 无冲突字段不得虚报 declared
  {
    const fake = FW.conflicts().filter(function (c) { return !c.conflicts && c.declared; });
    a(fake.length === 0, 'v11fw: [W7] 无冲突字段不得标 declared（虚报: '
      + (fake.map(function (c) { return c.field; }).join(',') || '无') + '）——虚报治理项同样把账本弄脏');
  }

  // W8 stat 自洽
  {
    const s = FW.stat();
    const sum = FIELDS.reduce(function (n, f) { const e = FW.entryOf(f); return n + (e ? e.writers.length : 0); }, 0);
    a(s.fields === 5, 'v11fw: [W8a] 字段数 == 5（实 ' + s.fields + '）');
    a(s.writers === sum, 'v11fw: [W8b] 写者总数自洽（' + s.writers + ' vs ' + sum + '）');
    a(s.declared === FW.conflicts().filter(function (c) { return c.declared; }).length,
      'v11fw: [W8c] declared 计数自洽（' + s.declared + '）');
  }

  // W9 纯只读
  {
    const WA2 = freshEnv();
    const before = JSON.stringify(WA2.store.get());
    WA2.fieldWriters.view(); WA2.fieldWriters.conflicts(); WA2.fieldWriters.stat();
    a(before === JSON.stringify(WA2.store.get()), 'v11fw: [W9] view/conflicts/stat 纯只读（store 深比较相等）');
  }
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, TARGET), 'utf8');
  const A_PEOPLE = "{ file: 'engines/intel.js', mode: 'merge' },";
  const n1 = src.split(A_PEOPLE).length - 1;
  a(n1 === 1, 'v11fw: [N0a] 写者条目锚点在真源码中恰中 1 次（实 ' + n1 + '）');
  const A_DECL = "conflict: 'declared',";
  const n2 = src.split(A_DECL).length - 1;
  a(n2 === 2, 'v11fw: [N0b] declared 标记在真源码中恰中 2 次（实 ' + n2 + '）');

  // N1：加一个现场不存在的写者 ⇒ W2 现形
  {
    const broken = src.replace(A_PEOPLE, "{ file: 'engines/intel.js', mode: 'merge' },\n        { file: 'engines/__ghost__.js', mode: 'merge' },");
    a(broken !== src, 'v11fw: [N1a] 破坏确实发生（注入幽灵写者）');
    const WA = freshEnv({ files: [TARGET], srcOverride: (function () { var m = {}; m[TARGET] = broken; return m; })() });
    const FW = WA.fieldWriters;
    const live = liveWriters();
    const declared = uniqSort(FW.writersOf('people'));
    const actual = uniqSort(live.people || []);
    a(declared.join(',') !== actual.join(','), 'v11fw: [N1b] 注入幽灵写者后对账确实失败 ⇒ W2 不是恒真判据');
  }

  // N2：把 people 的 declared 改成 none ⇒ W5 现形
  {
    const i = src.indexOf("field: 'people'");
    const j = src.indexOf("conflict: 'declared',", i);
    const broken = src.slice(0, j) + "conflict: 'none'," + src.slice(j + "conflict: 'declared',".length);
    const WA = freshEnv({ files: [TARGET], srcOverride: (function () { var m = {}; m[TARGET] = broken; return m; })() });
    const und = WA.fieldWriters.undeclaredConflicts();
    a(und.length > 0, 'v11fw: [N2] 把 people 的 declared 改成 none 后未登记冲突真出现（'
      + und.map(function (c) { return c.field; }).join(',') + '）⇒ W5 不是恒真判据');
  }

  // N3：原版上同款判据仍成立
  {
    const WA = freshEnv();
    a(WA.fieldWriters.undeclaredConflicts().length === 0,
      'v11fw: [N3] 原版上同款判据仍成立（零未登记冲突）');
  }
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
