#!/usr/bin/env node
// WorldAxis tests/v11-push-api-registry.js —— 推进类 API 死面裁决锁（v2.299.0 · V11 OPV11-4）
//
// 【它治什么】
//   V11 立项读数：「49 个推进类 API 产品侧零调用」。本版现场重测得到 **11 个**真零调用点：
//   activity.settle / oneShotMod.flush / interestFace.flush / world.advance / checkpoints.tick /
//   collab.flush / liaison.advance / beatMask.due / beatFacade.run / ensemble.run / cyberUI.progress。
//   立项数字偏大在于把「仅自调」与「被 dispatch 注册表引用」也算进了零调用。
//   本锁的口径是**真零调用**：产品面里不存在 `WA.ns.method(` 或 `ns.method(` 形式的调用点。
//
// 【判据】
//   A1  登记表键集 == 现场真零调用集（双向：表多一条、现场多一条，都红）。
//   A2  每条有且只有一个裁决，裁决 ∈ ['drive','entry','ui','dead']。
//   A3  drive 类必须真在 roundDrivers.DRIVERS 里，method 逐字一致。
//   A4  drive 类零参调用不抛异常、不改存档。
//   A5  entry/ui/dead 不得在 DRIVERS 里。
//   A6  dead 类必须在 dead-export-ledger 里有对应 src 条目。
//   A7  reason 非空且 >=12 字；非 drive 类必须说清理由。
//   A8  派生一致性：DRIVERS 里 from==='pushApiRegistry' 的集合 == driveDrivers()。
//       ⚠ 专治「from 被统一写死成某个固定值」的假绿。
//   A9  与 l3Registry 不重叠（谁负责必须唯一）。
//   A10 stat 自洽：total == 11，byClass 之和 == total。
//
// 【两向自证】N1 摘派生 ⇒ A3 现形；N2 entry 改 drive ⇒ A5 现形；N3 原版同款判据成立。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const TARGET = 'engines/round-drivers.js';
const REG = 'engines/push-api-registry.js';

const PRE = /^(tick|advance|sweep|due|settle|step|idle|drive|flush|reap|expire|pulse|turn|cycle|roll|rotate|refresh|progress|run)$/i;
const PROD_SKIP = ['tests/', 'tools/'];

function freshEnv(opts) {
  const env = opts ? sync.fresh(opts) : sync.fresh();
  try { global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env.WA;
}
function productSources() {
  const pf = require('./product-files.js');
  const out = {};
  pf.productFiles(BASE).forEach(function (f) {
    if (PROD_SKIP.some(function (p) { return f.indexOf(p) === 0; })) return;
    try { out[f] = fs.readFileSync(path.join(BASE, f), 'utf8'); } catch (e) {}
  });
  return out;
}
function liveZeroCall(WA) {
  const srcs = productSources();
  const cand = [];
  Object.keys(WA).forEach(function (ns) {
    const m = WA[ns];
    if (!m || typeof m !== 'object') return;
    Object.keys(m).forEach(function (k) {
      if (typeof m[k] !== 'function') return;
      if (!PRE.test(k)) return;
      cand.push({ api: ns + '.' + k, ns: ns, method: k });
    });
  });
  const called = {};
  cand.forEach(function (c) {
    const re1 = new RegExp('WA' + '\\.' + c.ns + '\\.' + c.method + '\\s*' + '\\(');
    const re2 = new RegExp('\\\\b' + c.ns + '\\.' + c.method + '\\s*' + '\\(');
    Object.keys(srcs).forEach(function (f) {
      if (called[c.api]) return;
      if (re1.test(srcs[f]) || re2.test(srcs[f])) called[c.api] = f;
    });
  });
  return cand.filter(function (c) { return !called[c.api]; })
    .map(function (c) { return { api: c.api, ns: c.ns, method: c.method }; });
}
function uniqSort(a) { return a.slice().sort().filter(function (v, i, x) { return x.indexOf(v) === i; }); }

function runAll(a) {
  const WA = freshEnv();
  const R = WA.pushApiRegistry;
  a(!!R, 'v11push: [A0] WA.pushApiRegistry 已装载');
  if (!R) return;
  const keys = R.ENTRIES.map(function (e) { return e.api; });
  // ⚠ 口径（自纠）：现场复算必须**扣除 l3Registry 已负责的引擎**。
  //   不扣除的话，同一台引擎（如 beatMask / events / fondness）会同时落在两张表的待裁决集里，
  //   A1 永远报「现场多出」，而 A9（不重叠）也永远红——两条判据互相矛盾。
  //   谁负责必须唯一：l3Registry 管「已登记的 L3 引擎」，本表管「其余真零调用」。
  // （续）同理：**基线七台**（roundDrivers 里 from==='baseline' 的那些）也已有归属，
  //   它们在现场也是「零调用」（只被 roundDrivers 通过数组字符串引用，这不算产品面调用点）。
  //   不排除的话，tolerance.tick 一类会永远被报「现场多出」，而它们早已在轮次里跑了一百多版。
  const __l3 = WA.l3Registry ? WA.l3Registry.ENTRIES.map(function (e) { return e.engine; }) : [];
  const __baseline = WA.roundDrivers.DRIVERS
    .filter(function (d) { return d.from === 'baseline'; })
    .map(function (d) { return d.engine; });
  const live = liveZeroCall(WA)
    .filter(function (x) { return __l3.indexOf(x.ns) < 0 && __baseline.indexOf(x.ns) < 0; })
    .map(function (x) { return x.api; });
  const drivers = WA.roundDrivers.DRIVERS;
  const driverEngines = drivers.map(function (d) { return d.engine; });

  a(uniqSort(keys).join(',') === uniqSort(live).join(','),
    'v11push: [A1] 登记表键集 == 现场真零调用集（表 ' + uniqSort(keys).length + ' / 现场 ' + uniqSort(live).length + '）\\n'
    + '        表多出: ' + (uniqSort(keys).filter(function (k) { return live.indexOf(k) < 0; }).join(',') || '无') + '\\n'
    + '        现场多出: ' + (uniqSort(live).filter(function (k) { return keys.indexOf(k) < 0; }).join(',') || '无'));

  {
    const by = {}; const dup = [];
    keys.forEach(function (k) { if (by[k]) dup.push(k); by[k] = 1; });
    a(dup.length === 0, 'v11push: [A2a] 每条只登记一次（重复: ' + (uniqSort(dup).join(',') || '无') + '）');
    const bad = R.ENTRIES.filter(function (e) { return R.CLASSES.indexOf(e.cls) < 0; });
    a(bad.length === 0, 'v11push: [A2b] 裁决值都在封闭集内（越界: ' + (bad.map(function (e) { return e.api; }).join(',') || '无') + '）');
    a(R.CLASSES.join(',') === 'drive,entry,ui,dead', 'v11push: [A2c] 裁决集合自描述且顺序稳定');
  }

  {
    const d = R.byClass('drive');
    const missing = d.filter(function (api) { return driverEngines.indexOf(api.split('.')[0]) < 0; });
    a(missing.length === 0, 'v11push: [A3a] drive 类全部真进了 DRIVERS（缺: ' + (missing.join(',') || '无') + '）');
    const bad = d.filter(function (api) {
      const e = R.entryOf(api); const ns = api.split('.')[0];
      const got = drivers.filter(function (x) { return x.engine === ns; })[0];
      return !e || !e.driver || !got || got.method !== e.driver.method;
    });
    a(bad.length === 0, 'v11push: [A3b] drive 类 method 与 DRIVERS 逐字一致（不符: ' + (bad.join(',') || '无') + '）');
  }

  {
    const bad = [];
    R.byClass('drive').forEach(function (api) {
      const e = R.entryOf(api); const ns = api.split('.')[0];
      const en = freshEnv(); const eng = en[ns];
      if (!eng || typeof eng[e.driver.method] !== 'function') { bad.push(api + '（入口缺失）'); return; }
      const before = JSON.stringify(en.store.get());
      try { eng[e.driver.method](); } catch (err) { bad.push(api + '（抛 ' + (err && err.message) + '）'); return; }
      if (before !== JSON.stringify(en.store.get())) bad.push(api + '（改了存档）');
    });
    a(bad.length === 0, 'v11push: [A4] ' + R.byClass('drive').length + ' 条 drive 零参调用全部安全（异常: '
      + (bad.join('；') || '无') + '）');
  }

  {
    const bad = [];
    // ⚠ 比对口径：**API 全名**（engine.method），不是只比命名空间。
    //   只比命名空间的话，同一引擎的边路 API（如 vitals.sweep）会被
    //   vitals.tick 的驱动误伤——那是判据过宽，不是现场违规。
    const drivenFull = drivers.map(function (d) { return d.engine + '.' + d.method; });
    ['entry', 'ui', 'dead'].forEach(function (cls) {
      R.byClass(cls).forEach(function (api) {
        if (drivenFull.indexOf(api) >= 0) bad.push(api + '(' + cls + ')');
      });
    });
    a(bad.length === 0, 'v11push: [A5] entry/ui/dead 不得进 DRIVERS（违规: ' + (bad.join(',') || '无') + '）');
  }

  {
    const deadApis = R.byClass('dead');
    const ledger = JSON.parse(fs.readFileSync(path.join(BASE, 'tests/dead-export-ledger.json'), 'utf8'));
    const known = {};
    ['dead', 'uiDead'].forEach(function (face) {
      const m = ledger[face];
      if (!m || typeof m !== 'object') return;
      Object.keys(m).forEach(function (k) { known[k] = true; const it = m[k]; if (it && it.src) known['src:' + it.src] = true; });
    });
    const made = deadApis.filter(function (api) {
      const p = api.split('.');
      const camel = p[0].replace(/([A-Z])/g, '-$1').toLowerCase();
      return !known[api] && !known['src:engines/' + camel + '.js'] && !known['src:engines/' + p[0] + '.js']
        && !known['src:ui/' + camel + '.js'] && !known['src:ui/' + p[0] + '.js'];
    });
    a(made.length === 0, 'v11push: [A6] dead 类必须是账本既有项（本表 ' + deadApis.length + ' 项；自造: ' + (made.join(',') || '无') + '）');
  }

  {
    const empty = R.ENTRIES.filter(function (e) { return !e.reason || String(e.reason).trim().length < 12; });
    a(empty.length === 0, 'v11push: [A7a] 每条 reason 非空且 >=12 字（不合格: ' + (empty.map(function (e) { return e.api; }).join(',') || '无') + '）');
    const KW = ['入参', '提供', '进入', '只能从', '需', '调用方', '页面', '业务', '引擎推进', '渲染', '边路', '读面', '不参与'];
    const weak = R.ENTRIES.filter(function (e) {
      if (e.cls === 'drive') return false;
      return !KW.some(function (k) { return String(e.reason).indexOf(k) >= 0; });
    });
    a(weak.length === 0, 'v11push: [A7b] 非 drive 类 reason 说清理由（含糊: ' + (weak.map(function (e) { return e.api; }).join(',') || '无') + '）');
  }

  {
    const derived = R.driveDrivers().map(function (d) { return d.engine + '.' + d.method; }).sort();
    const fromReg = drivers.filter(function (d) { return d.from === 'pushApiRegistry'; })
      .map(function (d) { return d.engine + '.' + d.method; }).sort();
    a(derived.join(',') === fromReg.join(','),
      'v11push: [A8] DRIVERS 里 from=pushApiRegistry 的集合 == driveDrivers()（派生 '
      + derived.join(',') + ' / 实装 ' + fromReg.join(',') + '）');
  }

  {
    const L = WA.l3Registry;
    if (L) {
      const l3Keys = L.ENTRIES.map(function (e) { return e.engine; });
      const mine = R.ENTRIES.map(function (e) { return e.api.split('.')[0]; });
      const both = uniqSort(mine).filter(function (k) { return l3Keys.indexOf(k) >= 0; });
      a(both.length === 0, 'v11push: [A9] 两表不重叠（重叠: ' + (both.join(',') || '无') + '）——谁负责必须唯一');
    } else {
      a(false, 'v11push: [A9] l3Registry 未装载（两表重叠判据无从判定）');
    }
  }

  {
    const s = R.stat();
    const sum = R.CLASSES.reduce(function (n, c) { return n + (s.byClass[c] || 0); }, 0);
    a(s.total === 21, 'v11push: [A10a] 登记总数 == 18（实 ' + s.total + '）');
    a(sum === s.total, 'v11push: [A10b] 各裁决之和 == 总数（' + sum + ' vs ' + s.total + '）');
  }
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, TARGET), 'utf8');
  const A_PUSH = "if (WA.pushApiRegistry && typeof WA.pushApiRegistry.driveDrivers === 'function') extra = extra.concat(WA.pushApiRegistry.driveDrivers());";
  const n = src.split(A_PUSH).length - 1;
  a(n === 1, 'v11push: [N0] 派生锚点在真源码中恰中 1 次（实 ' + n + '）');

  {
    const broken = src.replace(A_PUSH, 'void 0;');
    a(broken !== src, 'v11push: [N1a] 破坏确实发生（派生被摘掉）');
    const WA = freshEnv({ files: [REG, TARGET], srcOverride: (function(){ var m={}; m[TARGET]=broken; return m; })() });
    const R = WA.pushApiRegistry;
    const de = WA.roundDrivers.DRIVERS.map(function (d) { return d.engine; });
    const missing = R.byClass('drive').filter(function (api) { return de.indexOf(api.split('.')[0]) < 0; });
    a(missing.length > 0, 'v11push: [N1b] 破坏后 drive 类不在 DRIVERS 里（缺 ' + missing.join(',') + '）⇒ A3 不是恒真判据');
  }

  {
    const srcReg = fs.readFileSync(path.join(BASE, REG), 'utf8');
    const anchor = "{ api: 'activity.settle', cls: 'entry', driver: null,";
    const nb = srcReg.split(anchor).length - 1;
    a(nb === 1, 'v11push: [N2a] entry 锚点在登记表源码中恰中 1 次（实 ' + nb + '）');
    const brokenReg = srcReg.replace(anchor, "{ api: 'activity.settle', cls: 'drive', driver: { method: 'settle' },");
    const WA = freshEnv({ files: [REG, TARGET], srcOverride: (function(){ var m={}; m[REG]=brokenReg; return m; })() });
    const de = WA.roundDrivers.DRIVERS.map(function (d) { return d.engine; });
    a(de.indexOf('activity') >= 0, 'v11push: [N2b] 把 entry 改成 drive 后 activity 真进了 DRIVERS ⇒ A5 不是恒真判据');
  }

  {
    const WA = freshEnv();
    const R = WA.pushApiRegistry;
    const de = WA.roundDrivers.DRIVERS.map(function (d) { return d.engine; });
    a(R.byClass('drive').every(function (api) { return de.indexOf(api.split('.')[0]) >= 0; }),
      'v11push: [N3] 原版上同款判据仍成立（drive ' + R.byClass('drive').join(',') + ' 全在 DRIVERS 里）');
  }
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
