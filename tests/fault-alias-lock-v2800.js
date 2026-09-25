#!/usr/bin/env node
// WorldAxis tests/fault-alias-lock-v2800.js -- 故障台账读面隔离专锁（v2.80.0 第十四面 B）
//
// 治的病
//   v2.63.0 给 world / shadow / threads 立了「被拒了什么」的账，三个模块的 stat() 写的是
//     stat: function () { return Object.assign({}, stat); }
//   ——**浅拷贝**：返回值的 faults 与模块内部 stat.faults 是同一个对象。
//   于是调用方 `mod.stat().faults['x'] = 0` 或 `delete mod.stat().faults['x']` 就改写了
//   模块的观测记录：下一次读数里，那次拒收要么被凭空造出来、要么被抹掉。
//   讽刺之处在于：**留痕做得最彻底的三个模块，恰是唯三可以被伪造/抹除观测记录的模块**
//   （其余走 manual 留痕的模块早已写作 `Object.assign({}, stat, { faults: Object.assign({}, stat.faults) })`）。
//
// 这是 v2.79.0 面 B「读面回传活引用」的**镜像**：
//   那边是「改返回值 = 改持久态」，这边是「改返回值 = 伪造观测记录」。
//
// 判据（会自己长大，不靠维护者记得来加一行）：
//   全仓**凡 stat() 交回 faults 的模块，都不得交回内部活引用**。
//   探针：取两次 stat()，在第一次的返回值上插一个哨兵键，看第二次读数里它在不在。
//
// 三向自证：A 结构 / B 现场（全仓扫描）/ C 三处真源码破坏 / D 非空转 / E 零文件改写。
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const fresh = function (opts) { return require('./ui-gate-sync.js').fresh(opts).WA; };

function sha(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, rel), 'utf8')).digest('hex'); }
const TARGETS = ['engines/world.js', 'engines/shadow.js', 'engines/threads.js'];
const HASH_AT_LOAD = TARGETS.map(function (r) { return r + ':' + sha(r); }).join('|');

function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function broke(rel, from, to) {
  const raw = srcOf(rel);
  const n = raw.split(from).length - 1;
  if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + rel + ' :: ' + from.slice(0, 60));
  return raw.split(from).join(to);
}

const OLD_FORM = '    stat: function () { return Object.assign({}, stat); }';
// v2.93.0：world 的 stat() 因 X4 多了一个快照面（transits/blocks），故「新形态」不再唯一。
//   判据按模块分别给锚点：同一纪律（快照而非浅拷贝）在字面上允许不同形状。
const NEW_FORM = '    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }';
const NEW_FORM_BY = { 'engines/world.js':
  'stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults), transits: Object.assign({}, stat.transits), blocks: Object.assign({}, stat.blocks) }); }' };
function newFormOf(rel) { return NEW_FORM_BY[rel] || NEW_FORM; }
// 「退回浅拷贝」在 world 上的形态：整条快照面被去掉（faults 不再是副本）——
//   若把它只写成「少快照 transits/blocks 而 faults 仍快照」，那破坏后并不泄露，
//   判据会以为自己证明了「破坏必现形」，实际证明的是一个不构成泄露的形态。
const OLD_FORM_BY = { 'engines/world.js':
  'stat: function () { return Object.assign({}, stat); }' };
function oldFormOf(rel) { return OLD_FORM_BY[rel] || OLD_FORM; }

// ── 破坏表：把该模块退回「浅拷贝」形态（各恰 1 次）──
const BROKEN = TARGETS.map(function (rel) {
  return { key: rel.split('/')[1].replace('.js', ''), rel: rel, from: newFormOf(rel), to: oldFormOf(rel),
    why: '退回浅拷贝形态 ⇒ 改 stat() 返回值即改模块内部台账（观测记录可被伪造/抹除）' };
});

/** 症状探针：把返回值上的哨兵键写进去，看下一次读数里在不在。返回 true = 泄露。 */
function leaks(WA, key) {
  const m = WA[key];
  if (!m || typeof m.stat !== 'function') return null;
  let a = null, b = null;
  try { a = m.stat(); } catch (e) { return null; }
  if (!a || !a.faults || typeof a.faults !== 'object') return null;
  a.faults.__ALIAS_PROBE__ = 999;
  try { b = m.stat(); } catch (e) { return null; }
  const hit = !!(b && b.faults && b.faults.__ALIAS_PROBE__);
  if (hit) delete a.faults.__ALIAS_PROBE__;           // 收拾干净，避免污染后续判据
  return hit;
}
/** 全仓扫描：凡 stat() 交回 faults 的模块，返回其中泄露的键名列表。 */
function leakSet(WA) {
  const out = [];
  Object.keys(WA).forEach(function (k) {
    if (leaks(WA, k) === true) out.push(k);
  });
  return out.sort();
}
/** 有 faults 面的模块（判据宽度的分母，用于证明扫描非空转）。 */
function faultOwners(WA) {
  const out = [];
  Object.keys(WA).forEach(function (k) {
    const m = WA[k];
    if (!m || typeof m !== 'object' || typeof m.stat !== 'function') return;
    let st = null;
    try { st = m.stat(); } catch (e) { return; }
    if (st && st.faults && typeof st.faults === 'object') out.push(k);
  });
  return out.sort();
}

// ═══ A 结构 / B 现场 ═══
function runAll(a) {
  const WA = fresh({});

  // A 结构：三个模块的 stat() 采用与其余模块逐字一致的快照写法
  TARGETS.forEach(function (rel) {
    const src = srcOf(rel);
    a(src.indexOf(newFormOf(rel)) >= 0, 'A1 采用快照写法 [' + rel + ']（与仓库既有先例同一纪律）');
    a(src.indexOf(oldFormOf(rel)) < 0, 'A2 已无浅拷贝形态 [' + rel + ']');
  });

  // B 现场：全仓扫描，零泄露
  const owners = faultOwners(WA);
  a(owners.length > 0, 'B0 现场确有带 faults 面的模块（扫描非空转，实 ' + owners.length + ' 个）');
  const leaked = leakSet(WA);
  a(leaked.length === 0, 'B1 全仓零活引用：无模块交回内部 faults（泄露 ' + leaked.length + ' 个：' + JSON.stringify(leaked) + '）');
  TARGETS.forEach(function (rel) {
    const k = rel.split('/')[1].replace('.js', '');
    a(leaks(WA, k) === false, 'B2 逐模块复核不泄露 [' + k + ']');
  });

  // B 现场：口径与「真有 faults 面」同宽（不是把范围缩到三个模块才成立的假绿）
  a(owners.indexOf('world') >= 0 && owners.indexOf('shadow') >= 0 && owners.indexOf('threads') >= 0,
    'B3 扫描面覆盖三个曾泄露的模块（' + owners.length + ' 个模块里含 world/shadow/threads）');
}

// ═══ C 实质 / D 非空转 / E 无副作用 ═══
function runNegative(a) {
  // D1 判据纯度：原版上（各模块）都不泄露
  const WA0 = fresh({});
  TARGETS.forEach(function (rel) {
    const k = rel.split('/')[1].replace('.js', '');
    a(leaks(WA0, k) === false, 'D1 原版上判据为真 [' + k + ']——判据不是恒真');
  });

  // C 三处真源码破坏必须现形
  BROKEN.forEach(function (b) {
    let WA;
    try {
      WA = fresh({ srcOverride: (function () { const o = {}; o[b.rel] = broke(b.rel, b.from, b.to); return o; })() });
    } catch (e) {
      a(false, 'C 破坏可施加（' + b.key + '）：' + e.message);
      return;
    }
    a(leaks(WA, b.key) === true, 'C 真源码破坏必须现形 [' + b.key + ']：' + b.why);
    a(leakSet(WA).indexOf(b.key) >= 0, 'C 破坏被全仓扫描捕获 [' + b.key + ']（漏报即判据面太窄）');
  });

  // C 锚点各恰命中 1 次
  BROKEN.forEach(function (b) {
    const n = srcOf(b.rel).split(b.from).length - 1;
    a(n === 1, 'C 锚点恰命中 1 次 [' + b.key + ']（实 ' + n + '）');
  });

  // D2 非空转：破坏确实可观测地改变了行为（紧接各自 fresh 取值）
  const WAg = fresh({});
  const goodLeak = leaks(WAg, 'world');
  const WAb = fresh({ srcOverride: (function () { const o = {}; o['engines/world.js'] = broke('engines/world.js', newFormOf('engines/world.js'), oldFormOf('engines/world.js')); return o; })() });
  const badLeak = leaks(WAb, 'world');
  a(goodLeak === false && badLeak === true,
    'D2 破坏可观测地改变了行为（原版泄露=' + goodLeak + ' / 破坏后泄露=' + badLeak + '）');

  // E 无副作用：三份产品源码逐字节未变
  a(TARGETS.map(function (r) { return r + ':' + sha(r); }).join('|') === HASH_AT_LOAD,
    'E1 三份产品源码逐字节未变（sha256 比对，破坏只发生在内存副本上）');
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  BROKEN: BROKEN,
  leakSet: leakSet,
};

if (require.main === module) {
  let p = 0, f = 0;
  const a = function (c, name) { if (c) { p++; console.log('  \u2713 ' + name); } else { f++; console.log('  \u2717 ' + name); } };
  try { require('./mock.js'); runAll(a); runNegative(a); } catch (e) { f++; console.log('  \u2717 抛错: ' + e.message); }
  console.log('\n' + p + ' / ' + f);
  process.exit(f ? 1 : 0);
}