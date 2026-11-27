#!/usr/bin/env node
// WorldAxis tests/write-authority-v2610.js —— 写权面覆盖面锁（v2.610.0 · R285 WRA-1）
//
// 【它治什么（两层，都是实测）】
//   ① 扫描面：`tests/v11-field-writers.js` 的 W2 确实是双向对账，但它的扫描面就是 `FIELDS`
//      数组本身（5 个字段）。于是「表里没有的字段」永远不会被扫 —— 27 个多写者字段只声明 5 个
//      这件事在读数上完全不可见。与 R283（默认值只扫它认识的那 354 台）、R284（指路只扫带
//      目录前缀的引用）同族：**判据的扫描面被它自己锁死**。
//   ② 挂载面（比 ① 更硬）：那把锁本是用 `runScript`（spawn 子进程、rc 即结论）挂上去的，
//      而文件只有 `module.exports = { runAll }`、**没有顶层执行** ⇒ 子进程什么都不跑就 rc=0。
//      不是「总是绿」，是**从未跑过**。改成 `runLock` 后它当场报了两条真红（W8a/W8b）。
//      本锁的同一批把另外 4 把同型锁也逐个实数过（见 docs/PROJECT_ASSESSMENT.md R7）。
//
// 【判据】
//   B1  骨架顶层键数 == COVERAGE.topKeys（真源 Object.keys(store.get())，不是账本）。
//   B2  现场多写者字段数（写者 >= 2）== COVERAGE.multiWriter。
//   B3  **吃掉型字段必须进表**：现场扫出的「吃掉型」集合 ⊆ 声明表字段集，且计数 == COVERAGE.eatFields。
//   B4  覆盖面自洽：声明数 == COVERAGE.declared；多写者 - 声明 == COVERAGE.deferred；
//       这 deferred 个字段的写者总数 == COVERAGE.deferredSites（此数一动即红）。
//   B5  全表逐字段双向对账（不是只对 5 个）：声明写者集 == 现场扫描写者集。
//   B6  纯只读：view()/coverage 前后 store 深比较相等。
//
// 【「吃掉型」的可复算判据（本锁的定义，注释也写在引擎头上）】
//   整块赋值站点，且：
//     · 右值**不引用本字段当前值**（`d.X = (d.X && ...) ? d.X : ...` 不算）
//     · 且不是建行守卫：同行或紧邻上一行有 `if (!d.X)` / `if (d.X === undefined)`
//   理由：前两种写法只建行 / 只归一化，`d.X = {}` 之类才把别人的账整块抄掉。
//   已知误报（**故意留着**）：`if (!ec) ec = d.economy = {...}` 这种先赋局部别名的写法
//   判据看不出它其实也是守卫（economy 已进表，影响仅限「mode 由人判定」这一层）。
//   mode 列**不由本锁推导** —— 扫描器只能看「写没写整块」，看不出语义。
//
// 【两向自证】
//   N0  锚点：COVERAGE 在真源码中恰中 1 次；表内字段名在源码中都能找到。
//   N1  给一个 deferred 字段（clock）凭空加一个写者 ⇒ deferredSites 判据必现形。
//   N2  把 schemaVersion 从表里摘掉 ⇒ B3（吃掉型 ⊆ 表内）必现形。
//   N3  原版上同款判据仍成立。
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const TARGET = 'engines/field-writers.js';
const SKIP = ['tests/', 'tools/'];
const VAR = '(?:d|draft|root|doc|state)';

function freshEnv(opts) {
  const env = opts ? sync.fresh(opts) : sync.fresh();
  try { global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env.WA;
}

/** 建行守卫：`if (!d.X)` / `if (d.X === undefined)` */
function guardRe(V, K) {
  return new RegExp('if\\s*\\([^)]*!\\s*' + V + '\\.' + K + '\\b|if\\s*\\([^)]*' + V + '\\.' + K + '\\s*===\\s*(?:undefined|null)');
}

/**
 * 静态扫描：对每个顶层键返回写者集合与「吃掉型」站点数。
 * opt.extra = { 'rel/path.js': 'src' } 用于自证（凭空多一个写者）。
 */
function scan(topKeys, opt) {
  const o = opt || {};
  const pf = require('./product-files.js');
  const srcs = {};
  pf.productFiles(BASE).forEach(function (rel) {
    if (SKIP.some(function (s) { return rel.indexOf(s) === 0; })) return;
    try { srcs[rel] = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) {}
  });
  const extra = o.extra || {};
  Object.keys(extra).forEach(function (rel) { srcs[rel] = extra[rel]; });
  const rows = {};
  topKeys.forEach(function (K) {
    const reA = new RegExp('\\b(' + VAR + ')\\.' + K + '\\s*=(?!=)', 'g');
    const reB = new RegExp('\\b' + VAR + '\\.' + K + '\\s*\\[[^\\]]*\\]\\s*=(?!=)', 'g');
    const reC = new RegExp('\\b' + VAR + '\\.' + K + '\\.(?:push|splice|unshift|sort|forEach)\\(', 'g');
    const writers = [];
    const eats = [];
    Object.keys(srcs).forEach(function (rel) {
      const s = srcs[rel];
      const L = s.split('\n');
      let hit = false;
      reB.lastIndex = 0; if (reB.test(s)) hit = true;
      reC.lastIndex = 0; if (reC.test(s)) hit = true;
      reA.lastIndex = 0;
      let m;
      while ((m = reA.exec(s))) {
        hit = true;
        const ln = s.slice(0, m.index).split('\n').length - 1;
        const line = L[ln] || '';
        const rhs = line.slice(line.indexOf(m[0]) + m[0].length) || '';
        const refs = new RegExp(m[1] + '\\.' + K + '\\b').test(rhs);
        let guard = guardRe(m[1], K).test(line);
        if (!guard) {
          for (let i = ln - 1; i >= 0 && i >= ln - 2; i--) {
            const p = L[i] || '';
            if (!p.trim()) continue;
            if (guardRe(m[1], K).test(p)) guard = true;
            break;
          }
        }
        if (!refs && !guard) eats.push(rel + ':' + (ln + 1));
      }
      if (hit) writers.push(rel);
    });
    rows[K] = { writers: writers.sort(), eats: eats };
  });
  return rows;
}

function summary(rows) {
  const multi = [];
  const eat = [];
  Object.keys(rows).forEach(function (K) {
    if (rows[K].writers.length >= 2) multi.push(K);
    if (rows[K].writers.length >= 2 && rows[K].eats.length >= 1) eat.push(K);
  });
  return { multiWriter: multi.length, eatFields: eat.length, multi: multi.sort(), eat: eat.sort() };
}

function topKeysOf(WA) { return Object.keys(WA.store.get()); }

function runAll(a) {
  const WA = freshEnv();
  const FW = WA.fieldWriters;
  a(!!FW, 'wa2610: [B0] WA.fieldWriters 已装载');
  if (!FW) return;
  const cov = FW.view().coverage || {};
  const top = topKeysOf(WA);
  const rows = scan(top);
  const sum = summary(rows);
  const declared = FW.FIELDS.map(function (e) { return e.field; });

  // B1 骨架顶层键
  a(top.length === cov.topKeys, 'wa2610: [B1] 骨架顶层键 == 冻结值（现场 ' + top.length + ' vs 冻结 ' + cov.topKeys + '）'
    + ' —— 真源是 Object.keys(store.get())，不是账本');

  // B2 多写者字段数
  a(sum.multiWriter === cov.multiWriter, 'wa2610: [B2] 多写者字段数 == 冻结值（现场 ' + sum.multiWriter
    + ' vs 冻结 ' + cov.multiWriter + '）：' + sum.multi.join(','));

  // B3 吃掉型必须进表
  {
    const missing = sum.eat.filter(function (k) { return declared.indexOf(k) < 0; });
    a(sum.eatFields === cov.eatFields, 'wa2610: [B3a] 吃掉型字段数 == 冻结值（现场 ' + sum.eatFields
      + ' vs 冻结 ' + cov.eatFields + '）');
    a(missing.length === 0, 'wa2610: [B3b] 吃掉型字段全部在声明表里（缺: ' + (missing.join(',') || '无') + '）'
      + ' —— 表外的吃掉型字段永远是绿的，这正是本项要治的病');
  }

  // B4 覆盖面自洽
  {
    const deferred = sum.multi.filter(function (k) { return declared.indexOf(k) < 0; });
    const sites = deferred.reduce(function (n, k) { return n + rows[k].writers.length; }, 0);
    a(declared.length === cov.declared, 'wa2610: [B4a] 声明数 == 冻结值（' + declared.length + ' vs ' + cov.declared + '）');
    a(deferred.length === cov.deferred, 'wa2610: [B4b] 未声明多写者字段数 == 冻结值（' + deferred.length
      + ' vs ' + cov.deferred + '）：' + deferred.join(','));
    a(sites === cov.deferredSites, 'wa2610: [B4c] 未声明字段的写者总数 == 冻结值（' + sites + ' vs '
      + cov.deferredSites + '）—— 此数一动，先看看新增那个写者是不是吃掉型');
  }

  // B5 全表逐字段双向对账（扫描面不再等于表本身）
  {
    const diffs = [];
    declared.forEach(function (f) {
      const dec = FW.writersOf(f).slice().sort();
      const act = (rows[f] ? rows[f].writers : []).slice().sort();
      if (dec.join(',') !== act.join(',')) {
        diffs.push(f + '\n          声明多出: ' + (dec.filter(function (x) { return act.indexOf(x) < 0; }).join(',') || '无')
          + '\n          现场多出: ' + (act.filter(function (x) { return dec.indexOf(x) < 0; }).join(',') || '无'));
      }
    });
    a(diffs.length === 0, 'wa2610: [B5] ' + declared.length + ' 个字段逐字段双向对账（不一致: '
      + (diffs.length ? '\n        ' + diffs.join('\n        ') : '无') + '）');
  }

  // B6 纯只读
  {
    const WA2 = freshEnv();
    const before = JSON.stringify(WA2.store.get());
    WA2.fieldWriters.view(); WA2.fieldWriters.stat(); WA2.fieldWriters.conflicts();
    a(before === JSON.stringify(WA2.store.get()), 'wa2610: [B6] view/stat/conflicts 纯只读（store 深比较相等）');
  }
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, TARGET), 'utf8');
  const A_COV = 'const COVERAGE = {';
  a(src.split(A_COV).length - 1 === 1, 'wa2610: [N0a] COVERAGE 锚点在真源码中恰中 1 次');

  // N1：给 deferred 字段 clock 凭空加一个写者，deferredSites 判据必须现形
  {
    const WA = freshEnv();
    const top = topKeysOf(WA);
    const base = summary(scan(top));
    const ghost = {};
    ghost['engines/__ghost__.js'] = 'draft.clock = { hour: 0, minute: 0 };\n';
    const after = summary(scan(top, { extra: ghost }));
    a(base.multiWriter === after.multiWriter, 'wa2610: [N1a] 幽灵写者不改变「多写者字段数」（clock 本来就是多写者）');
    const declared = WA.fieldWriters.FIELDS.map(function (e) { return e.field; });
    const rowsB = scan(top);
    const sitesB = base.multi.filter(function (k) { return declared.indexOf(k) < 0; })
      .reduce(function (n, k) { return n + rowsB[k].writers.length; }, 0);
    const rowsA = scan(top, { extra: ghost });
    const sitesA = after.multi.filter(function (k) { return declared.indexOf(k) < 0; })
      .reduce(function (n, k) { return n + rowsA[k].writers.length; }, 0);
    a(sitesA === sitesB + 1, 'wa2610: [N1b] 幽灵写者让 deferredSites 真的 +1（' + sitesB + ' \u2192 ' + sitesA
      + '）\u21d2 B4c 不是恒真判据');
  }

  // N2：把 schemaVersion 从表里摘掉，B3b（吃掉型 ⊆ 表内）必须现形
  {
    const i = src.indexOf("{ field: 'schemaVersion'");
    a(i > 0, 'wa2610: [N2a] schemaVersion 条目在真源码中找得到');
    const j = src.indexOf("note: '", i);
    const k = src.indexOf("' }\n", j);
    const broken = src.slice(0, i) + src.slice(k + 3);
    a(broken !== src, 'wa2610: [N2b] 破坏确实发生（摘掉 schemaVersion）');
    const sb = { window: {}, console: { log: function () {} } };
    sb.window.WorldAxis = { log: function () {}, registerModule: function () {}, settingsBus: null };
    const ctx = vm.createContext(sb);
    vm.runInContext(broken, ctx);
    const F2 = sb.window.WorldAxis.fieldWriters;
    const decl = F2.FIELDS.map(function (e) { return e.field; });
    a(decl.indexOf('schemaVersion') < 0, 'wa2610: [N2c] 破坏版里确实没有 schemaVersion');
    const WA = freshEnv();
    const sum2 = summary(scan(topKeysOf(WA)));
    const missing = sum2.eat.filter(function (x) { return decl.indexOf(x) < 0; });
    a(missing.length > 0, 'wa2610: [N2d] 摘掉 schemaVersion 后 B3b 真会报缺（' + missing.join(',') + '）\u21d2 不是恒真判据');
  }

  // N3：原版上同款判据仍成立
  {
    const WA = freshEnv();
    const decl = WA.fieldWriters.FIELDS.map(function (e) { return e.field; });
    const sum3 = summary(scan(topKeysOf(WA)));
    a(sum3.eat.filter(function (x) { return decl.indexOf(x) < 0; }).length === 0,
      'wa2610: [N3] 原版上同款判据仍成立（吃掉型全在表内）');
  }
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
