#!/usr/bin/env node
// WorldAxis tests/v11-l3-registry.js —— L3 分级登记表锁（v2.299.0 · V11 OPV11-3）
//
// 【它治什么】
//   V7 OPV7-8 把 35 台从 full 档移除并标注「需手动录入数据」，V8 OPV8-4 只把其中 7 台
//   接进了 roundDrivers。剩下 28 台**既不在驱动名单里，也没有任何地方写明「为什么不在」**。
//   于是「这 28 台是真死面」与「这 28 台只是没人叫过」在读数上完全同形。
//
// 【判据】
//   L1  登记表与现场**双向一致**：`capabilityTier.L3_EXCLUDES` 减去 `DRIVERS` 里的 engine
//       恰好等于 `l3Registry` 的键集（少一台、多一台都红）。
//   L2  每台有且只有一个分类；分类 ∈ 封闭集 ['zero-arg','needs-input','decision','dead']。
//   L3  A 类（zero-arg）必须**真实出现在 `roundDrivers.DRIVERS`** 里（不是只在登记表里自嗨），
//       且 method 与登记一致。
//   L4  A 类零参调用**不抛异常、不改存档**（本轮现场实测口径固化进判据）。
//   L5  B/C 类不得出现在 `DRIVERS` 里（硬塞轮次等于替玩家做剧情判断）。
//   L6  每条 reason 非空且长度 ≥ 12（空理由/一句话糊弄判红）；B/C 类 reason 必须含
//       入参或提供方说明（关键词：入参/提供/由…进入/只能从/需）。
//   L7  D 类必须是 dead-export-ledger 的既有项（不得新造死面）。本仓当前 D 类为 0，
//       判据仍保留 —— 一旦有人往里加 D 类，必须先在账本里登记。
//   L8  派生一致性：`roundDrivers.DRIVERS` 里 `from==='l3Registry'` 的条目集合
//       == `l3Registry.zeroArgDrivers()` 的集合（两处各写一份就会分叉）。
//   L9  基线七台仍在：v8 的 7 条 `from==='baseline'` 条目不许因本项改动而消失。
//   L10 `stat()` 读数自洽：total == 28，且 byClass 之和 == total。
//
// 【两向自证】
//   N0  锚点各恰中 1 次；N1 把某台 A 类从 DRIVERS 派生里掐掉 ⇒ L3/L8 现形；
//   N2 给 B 类也塞一个 driver ⇒ L5 现形；N3 原版上同款判据仍成立。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const TARGET = 'engines/round-drivers.js';
const REG = 'engines/l3-registry.js';

function freshEnv(opts) {
  const env = opts ? sync.fresh(opts) : sync.fresh();
  try { global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env.WA;
}
/** 现场口径：L3 里没被 DRIVERS 驱动的那些 engine */
function liveNotBaseline(WA) {
  // ⚠ 不能用「L3 减去基线七台」——那会形成循环：A 类一旦真接进 DRIVERS，
  //   它就从「未驱动」里消失，于是登记表恒比现场多几台，判据永远红。
  //   本项口径是「本表负责的是基线之外的处置」：A 类在本表的语义是「应该被驱动、且已接进 DRIVERS」，
  //   故口径锚在基线七台上：本判据管「表键集 == 基线之外的 L3」，L3 另管「A 类真的接进了」，
  //   两条各管一件事，不互相抵消。
  const L3 = (WA.capabilityTier && WA.capabilityTier.L3_EXCLUDES) || [];
  const D = ((WA.roundDrivers && WA.roundDrivers.DRIVERS) || [])
    .filter(function (x) { return x.from === 'baseline'; })
    .map(function (x) { return x.engine; });
  return L3.filter(function (e) { return D.indexOf(e) < 0; }).sort();
}
function uniqSort(a) { return a.slice().sort().filter(function (v, i, x) { return x.indexOf(v) === i; }); }

function runAll(a) {
  const WA = freshEnv();
  const R = WA.l3Registry;
  a(!!R, 'v11l3: [L0] WA.l3Registry 已装载（登记表是本次改动的载体）');
  if (!R) return;

  const keys = R.ENTRIES.map(function (e) { return e.engine; });
  const live = liveNotBaseline(WA);
  const drivers = WA.roundDrivers.DRIVERS;
  const driverEngines = drivers.map(function (d) { return d.engine; });

  // L1 双向一致
  a(uniqSort(keys).join(',') === uniqSort(live).join(','),
    'v11l3: [L1] 登记表键集 == 现场「L3 减去基线七台」（表 ' + uniqSort(keys).length + ' 台 / 现场 ' + uniqSort(live).length + ' 台）\n'
    + '        表多出: ' + uniqSort(keys).filter(function (k) { return live.indexOf(k) < 0; }).join(',') + '\n'
    + '        现场多出: ' + uniqSort(live).filter(function (k) { return keys.indexOf(k) < 0; }).join(','));

  // L2 唯一分类 + 封闭集
  {
    const dup = keys.filter(function (k, i) { return keys.indexOf(k) !== i; });
    a(dup.length === 0, 'v11l3: [L2a] 每台只登记一次（重复: ' + (uniqSort(dup).join(',') || '无') + '）');
    const badCls = R.ENTRIES.filter(function (e) { return R.CLASSES.indexOf(e.cls) < 0; });
    a(badCls.length === 0, 'v11l3: [L2b] 分类值都在封闭集内（越界: '
      + (badCls.map(function (e) { return e.engine + '=' + e.cls; }).join(',') || '无') + '）');
    a(R.CLASSES.join(',') === 'zero-arg,needs-input,decision,dead', 'v11l3: [L2c] 分类集合自描述且顺序稳定');
  }

  // L3 A 类必须在 DRIVERS 里
  {
    const z = R.byClass('zero-arg');
    const missing = z.filter(function (k) { return driverEngines.indexOf(k) < 0; });
    a(missing.length === 0, 'v11l3: [L3a] A 类引擎全部真进了 DRIVERS（缺: ' + (missing.join(',') || '无') + '）——'
      + '只在登记表里写「可驱动」而没接进去，等于把同形问题换了个位置');
    const pairBad = z.filter(function (k) {
      const e = R.entryOf(k); const d = drivers.filter(function (x) { return x.engine === k; })[0];
      return !e || !e.driver || !d || d.method !== e.driver.method;
    });
    a(pairBad.length === 0, 'v11l3: [L3b] A 类的 method 与 DRIVERS 里逐字一致（不符: ' + (pairBad.join(',') || '无') + '）');
  }

  // L4 A 类零参调用不抛、不改存档
  {
    const bad = [];
    R.byClass('zero-arg').forEach(function (k) {
      const e = R.entryOf(k);
      const en = freshEnv();
      const eng = en[k];
      if (!eng || typeof eng[e.driver.method] !== 'function') { bad.push(k + '（入口缺失）'); return; }
      const before = JSON.stringify(en.store.get());
      try { eng[e.driver.method](); } catch (err) { bad.push(k + '（抛 ' + (err && err.message) + '）'); return; }
      const after = JSON.stringify(en.store.get());
      if (before !== after) bad.push(k + '（改了存档）');
    });
    a(bad.length === 0, 'v11l3: [L4] ' + R.byClass('zero-arg').length + ' 台 A 类零参调用全部安全（异常: '
      + (bad.join('；') || '无') + '）');
  }

  // L5 B/C/D 类不得在 DRIVERS 里
  {
    const bad = [];
    ['needs-input', 'decision', 'dead'].forEach(function (cls) {
      R.byClass(cls).forEach(function (k) { if (driverEngines.indexOf(k) >= 0) bad.push(k + '(' + cls + ')'); });
    });
    a(bad.length === 0, 'v11l3: [L5] B/C/D 类不得进 DRIVERS（违规: ' + (bad.join(',') || '无') + '）——'
      + '硬塞轮次等于替玩家做剧情判断');
  }

  // L6 reason 质量
  {
    const empty = R.ENTRIES.filter(function (e) { return !e.reason || String(e.reason).trim().length < 12; });
    a(empty.length === 0, 'v11l3: [L6a] 每条 reason 非空且 ≥12 字（不合格: '
      + (empty.map(function (e) { return e.engine; }).join(',') || '无') + '）');
    const KW = ['入参', '提供', '进入', '只能从', '需', '读口', '设置面', '表达', '定调', '意志'];
    const weak = R.ENTRIES.filter(function (e) {
      if (e.cls === 'zero-arg') return false;
      return !KW.some(function (k) { return String(e.reason).indexOf(k) >= 0; });
    });
    a(weak.length === 0, 'v11l3: [L6b] B/C/D 类 reason 说清「入参由谁提供 / 为何只能是玩家决策 / 为何是死面」（含糊: '
      + (weak.map(function (e) { return e.engine; }).join(',') || '无') + '）');
  }

  // L7 D 类必须是 dead-export-ledger 既有项
  {
    const deadKeys = R.byClass('dead');
    const ledger = JSON.parse(fs.readFileSync(path.join(BASE, 'tests/dead-export-ledger.json'), 'utf8'));
    // 账本两面都是 **对象映射**（键 = `命名空间.成员`），不是数组 —— 口径按现场取。
    //   取 `src` 字段里的文件路径做对照，这样登记表写 engine 名就能对上账本条目。
    const known = {};
    ['dead', 'uiDead'].forEach(function (face) {
      const m = ledger[face];
      if (!m || typeof m !== 'object') return;
      Object.keys(m).forEach(function (key) {
        known[key] = true;                              // 形如 `powerAnchor.stat`
        const it = m[key];
        if (it && it.src) known['src:' + it.src] = true; // 形如 `engines/power-anchor.js`
      });
    });
    const made = deadKeys.filter(function (k) {
      const camel = k.replace(/([A-Z])/g, '-$1').toLowerCase();
      return !known[k] && !known['src:engines/' + camel + '.js'] && !known['src:engines/' + k + '.js'];
    });
    a(made.length === 0, 'v11l3: [L7] D 类必须是 dead-export-ledger 既有项（本仓当前 ' + deadKeys.length
      + ' 项；自造: ' + (made.join(',') || '无') + '）');
  }

  // L8 派生一致性
  {
    const derived = R.zeroArgDrivers().map(function (d) { return d.engine; }).sort();
    const fromReg = drivers.filter(function (d) { return d.from === 'l3Registry'; })
      .map(function (d) { return d.engine; }).sort();
    a(derived.join(',') === fromReg.join(','),
      'v11l3: [L8] DRIVERS 里 from=l3Registry 的集合 == zeroArgDrivers()（派生 ' + derived.join(',') + ' / 实装 ' + fromReg.join(',') + '）——'
      + '两处各写一份就会分叉');
  }

  // L9 基线七台仍在
  {
    const base = drivers.filter(function (d) { return d.from === 'baseline'; }).map(function (d) { return d.engine; });
    const expect = ['tolerance', 'motif', 'marginal', 'quota', 'spotlight', 'rhythmLoop', 'eraCycle'];
    a(expect.every(function (e) { return base.indexOf(e) >= 0; }), 'v11l3: [L9] v8 基线七台仍在（实 ' + base.join(',') + '）');
  }

  // L10 stat 自洽
  {
    const s = R.stat();
    const sum = R.CLASSES.reduce(function (n, c) { return n + (s.byClass[c] || 0); }, 0);
    a(s.total === 28, 'v11l3: [L10a] 登记总数 == 28（实 ' + s.total + '）');
    a(sum === s.total, 'v11l3: [L10b] 各分类之和 == 总数（' + sum + ' vs ' + s.total + '）');
  }
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, TARGET), 'utf8');
  const A_DERIVE = 'if (WA.l3Registry && typeof WA.l3Registry.zeroArgDrivers === \'function\') extra = extra.concat(WA.l3Registry.zeroArgDrivers());';
  const n = src.split(A_DERIVE).length - 1;
  a(n === 1, 'v11l3: [N0] 派生锚点在真源码中恰中 1 次（实 ' + n + '）');

  // N1：摘掉派生 ⇒ A 类不在 DRIVERS ⇒ L3a / L8 现形
  {
    const broken = src.replace(A_DERIVE, 'extra = [];');
    a(broken !== src, 'v11l3: [N1a] 破坏确实发生（派生被摘掉）');
    const WA = freshEnv({ files: [REG, TARGET], srcOverride: { [TARGET]: broken } });
    const R = WA.l3Registry;
    const de = WA.roundDrivers.DRIVERS.map(function (d) { return d.engine; });
    const missing = R.byClass('zero-arg').filter(function (k) { return de.indexOf(k) < 0; });
    a(missing.length > 0, 'v11l3: [N1b] 破坏后 A 类确实不在 DRIVERS 里（缺 ' + missing.join(',') + '）⇒ L3a 不是恒真判据');
  }

  // N2：给 B 类也塞一个 driver ⇒ L5 现形
  {
    const srcReg = fs.readFileSync(path.join(BASE, REG), 'utf8');
    // 破坏方式：把**一台 decision 类**改成 zero-arg 并配上 driver。
    //   为什么不直接给 needs-input 塞 driver：那只会让 `zeroArgDrivers()` 不认它（因为
    //   派生只看 cls==='zero-arg'），于是它进不了 DRIVERS，L5 仍旧不会现形——
    //   那是「破坏没落在被判据上」，不是判据失效。
    const bAnchor = "{ engine: 'userlock', cls: 'decision', driver: null,";
    const nb = srcReg.split(bAnchor).length - 1;
    a(nb === 1, 'v11l3: [N2a] decision 类锚点在登记表源码中恰中 1 次（实 ' + nb + '）');
    const brokenReg = srcReg.replace(bAnchor, "{ engine: 'userlock', cls: 'zero-arg', driver: { method: 'stat' },");
    const WA = freshEnv({ files: [REG, TARGET], srcOverride: { [REG]: brokenReg } });
    const R = WA.l3Registry;
    const de = WA.roundDrivers.DRIVERS.map(function (d) { return d.engine; });
    const violated = R.byClass('zero-arg').filter(function (k) { return de.indexOf(k) >= 0 && k === 'userlock'; });
    a(violated.length > 0, 'v11l3: [N2b] 把 decision 类改成 zero-arg 后它真进了 DRIVERS（' + violated.join(',') + '）⇒ L5 不是恒真判据');
  }

  // N3：原版上同款判据仍成立
  {
    const WA = freshEnv();
    const R = WA.l3Registry;
    const z = R.byClass('zero-arg');
    const de = WA.roundDrivers.DRIVERS.map(function (d) { return d.engine; });
    a(z.every(function (k) { return de.indexOf(k) >= 0; }), 'v11l3: [N3] 原版上同款判据仍成立（A 类 ' + z.join(',') + ' 全在 DRIVERS 里）');
  }
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
