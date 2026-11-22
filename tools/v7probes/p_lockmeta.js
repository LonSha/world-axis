'use strict';
// 元检验：对每个破坏锚点单独注入，跑完整 runAll + runNegative，按**段**归因期望红点。
//
//   【这个脚本能证什么、不能证什么 —— 必须先说清，否则会得出过强的结论】
//   能证：注入破坏后**语义段**确实有红点。即「这段判据对源码有反应」，
//        不是压根没被执行的死代码。
//   不能证：**两向性**。因为破坏注入模式下，锁内部所有 `boot(null)` 的对照
//        读的也是 rd() —— 也就是磁盘上这份破坏副本，于是 O 与 P 相同。
//        实测痕迹：破坏 reachScope 那一格首红写的是「L2e 由 44 暴涨到 44」，
//        两个 44 是同一个值 —— 它红是因为 `44 > 44` 为假，不是因为观测到差异。
//        这类红点**原因不对**，与「锚点没找到」是同一族陷阱。
//   两向性由谁负责：原版源码下跑的 N 段。那里 O = boot(null)（磁盘原版）、
//        P = boot(broken(k))（内存破坏副本），两者是**真正不同的两份源码**。
//        故本脚本必须在**洁净基线**上单独跑一次「锁全绿」，再跑这里看红点分布。
//
//   故下面把红分成两栏：
//     · A 段（源码契约）：破坏副本下必然红，属预期噪音，不计入主结论；
//     · B–F / N 段（语义契约）：必须红 —— 才算「判据确实是活的」。
//   两栏都列出来，任何一栏为空都要能被看见。
const path = require('path');
const fs = require('fs');
const BASE = path.resolve(__dirname, '..', '..');
const ENG = 'engines/driver-ledger.js';
const LOCK = path.join(BASE, 'tests/v7-driver-ledger-2275.js');

// 破坏表与锚点表只从锁文件导出，不在这里复制一份 ——
//   复制就是第二份真源，锁一改这里就静默漂移（本仓反复裁决的那条）。
const { ANCHOR, BREAK } = require(LOCK);

const orig = fs.readFileSync(path.join(BASE, ENG), 'utf8');

// ── 洁净度前置检查（这一条是被真事故逼出来的）──────────────────────────────
//   事故现场：上一趟本脚本被外部 `Stream closed` 掐死，磁盘上的源码被留在
//   「mergeDiag 已破坏」的状态；下一趟于是把**破坏版**当成 orig 基准，在它上面
//   再叠破坏 —— 结果那一格报 anchor*0，看着像「锚点漂移」，实际是上一趟没复原。
//   故开跑前必须确认：每个锚点恰 1 次、且没有任何破坏串残留。
{
  const dirty = [];
  Object.keys(ANCHOR).forEach(function (k) {
    if (orig.split(ANCHOR[k]).length - 1 !== 1) dirty.push(k + ':anchor≠1');
    // 破坏串残留**只在它能与锚点互斥时**才有判据力。
    //   反例：exportFace 的破坏串 `    summaryText: summaryText`
    //   本身是锚点（两行串）的前缀 —— 洁净源码里它当然也命中 1 次。
    //   拿它判残留，会把干净源码误判成脏的（这里踩过一次）。
    //   故只在「破坏串不是锚点的子串」时才检查残留。
    if (ANCHOR[k].indexOf(BREAK[k]) < 0 && orig.split(BREAK[k]).length - 1 !== 0) {
      dirty.push(k + ':break残留');
    }
  });
  if (dirty.length) {
    console.log('✗ 源码不洁净，拒绝开跑（否则会在破坏版上再叠破坏）：' + dirty.join(', '));
    console.log('  修法：用 BREAK→ANCHOR 逆向替换复原，见本脚本末尾的 restore 提示');
    process.exit(2);
  }
}
const SIG = require('crypto').createHash('sha1').update(orig).digest('hex');
fs.writeFileSync('/tmp/wa_dl_clean_' + SIG + '.js', orig, 'utf8');
console.log('洁净基线已备档：/tmp/wa_dl_clean_' + SIG + '.js（' + orig.length + ' 字节）');
const rows = [];
try {
  Object.keys(ANCHOR).forEach(function (k) {
    const n = orig.split(ANCHOR[k]).length - 1;
    if (n !== 1) { rows.push({ k: k, err: 'anchor*' + n }); return; }
    fs.writeFileSync(path.join(BASE, ENG), orig.split(ANCHOR[k]).join(BREAK[k]), 'utf8');
    delete require.cache[require.resolve(LOCK)];
    const cfg = { a: 0, sem: 0 };
    const semNames = [];
    const a = function (c, msg) {
      if (c) return;
      const m = String(msg).match(/^(?:v2275\/)?([A-Za-z])/);
      const seg = m ? m[1] : '?';
      if (seg === 'A') cfg.a++;
      else { cfg.sem++; if (semNames.length < 4) semNames.push(String(msg).slice(0, 80)); }
    };
    try {
      const L = require(LOCK);
      L.runAll(a);
      L.runNegative(a);
    } catch (e) {
      cfg.sem++;
      semNames.push('[抛] ' + (e && e.message ? e.message.slice(0, 70) : '?'));
    }
    rows.push({ k: k, a: cfg.a, sem: cfg.sem, semNames: semNames });
  });
} finally {
  fs.writeFileSync(path.join(BASE, ENG), orig, 'utf8');
}

let bad = 0, badA = 0;
console.log('锚点'.padEnd(20) + ' A段红  B-F/N段红   语义段首红');
rows.forEach(function (r) {
  if (r.err) { bad++; console.log('✗ ' + r.k.padEnd(20) + ' ' + r.err); return; }
  const ok = r.sem > 0;
  if (!ok) bad++;
  if (r.a === 0) badA++;
  console.log((ok ? '✓ ' : '✗ ') + r.k.padEnd(20) + String(r.a).padStart(5) + String(r.sem).padStart(9)
    + '   ' + (r.semNames[0] || '（无语义红！）'));
});
console.log('\n结论一（判据活性）：' + (bad === 0
  ? '全部 ' + rows.length + ' 个锚点破坏后都有**语义段**红点 —— 这些判据对源码有反应，不是死代码'
  : bad + ' 个锚点破坏后语义段全绿（判据没在核源码）：'
    + rows.filter(function (r) { return !(r.sem > 0); }).map(function (r) { return r.k; }).join(', ')));
console.log('结论二（噪音自检）：' + (badA === 0
  ? '每个破坏副本都同时让 A 段现红（源码契约确实在核源码）'
  : badA + ' 个锚点破坏后 A 段居然没红 —— 源码契约判据没在核源码'));
console.log('结论三（本脚本**不**负责的口径）：'
  + '两向性由原版源码下的 N 段负责（那里 O=磁盘原版、P=内存破坏副本）。'
  + '本脚本跑在破坏副本上，boot(null) 的对照与破坏版同源，故「红了」不等于「观测到差异」。'
  + '要看两向性，请以洁净基线上 `node tests/v7-driver-ledger-2275.js` 全绿为准。');
const back = fs.readFileSync(path.join(BASE, ENG), 'utf8');
console.log('源码已复原：' + (back === orig ? '逐字节一致' : '不一致！'));
process.exit((bad === 0 && badA === 0 && back === orig) ? 0 : 1);