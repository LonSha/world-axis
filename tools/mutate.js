#!/usr/bin/env node
// WorldAxis tools/mutate.js (v2.524.0) — OPV29-21 空转检测：改不到就必须报错
//
// ── 它治什么（缺口，开工前先看现场）──────────────────────────────
//   本仓的负控制都靠「改坏源码 → 跑判据 → 必须红」证明。这套办法有一个**静默失效形态**：
//   `src.replace('锚', '坏版本')` 里锚没命中（源码被改写过、或锚写成裸短子串），
//   于是 `replace` 原样返回 —— **源码没坏，判据当然绿，而人以为「负控制验证过了」**。
//   这不是判据松，是「负控制本身空转」。本轮之前的做法是每处手写 `assert old in s`，
//   写一次防一次，漏一次就静默通过（本段真实踩到：`p3`/`p4` 两次 patch 的锚差一个字，
//   靠 shell 的 assert 才没白跑）。
//   本模块把那句 assert 变成**任何破坏点都必须经过的一道门**：
//     找不到锚 ⇒ MutateMiss · 替换后文本没变 ⇒ MutateAirTurn · 恢复后 md5 不符 ⇒ MutateRestoreDirty
//
// ── 三条错都不能被当成「没问题」（分隔线）
//   · 找不到锚   —— 「看不出来」≠「没坏」
//   · 换了没变   —— from === to、或 from 出现两次只换到不影响断言的处
//   · 恢复不干净 —— 跑完源码停在坏版本，后面的判据全在被污染的面里跑
//
// ── 用法（既可 require，也可命令行）──────────────────────
//   const M = require('../tools/mutate.js');
//   const r = M.runUnderMutate(file, '原锚', '坏版本', function (m) {
//     // m.after 是坏版本文本；这里跑判据，必须红
//     return redCount;
//   });
//   r.reds // 破坏期间观察到的红数；r.restored // 是否已逐字节恢复
//   命令行：node tools/mutate.js --file=a.js --from=锚 --to=坏版本 --rev   （只做四步并报读数）
//
// ── 纪律 ────────────────────────────────────────────────
//   · 零依赖；不碰网络。
//   · 恢复走 finally + md5 复核：任何异常路径都不许把仓库停在坏版本。
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex'); }

function MutateMiss(anchor) {
  const e = new Error('mutate-miss：锚在目标文件里找不到（' + String(anchor).slice(0, 40) + '）');
  e.kind = 'mutate-miss';
  return e;
}
function MutateAirTurn(anchor) {
  const e = new Error('mutate-airturn：替换后文本没变（空转）—— 破坏没有发生，判据的绿不算数');
  e.kind = 'mutate-airturn';
  return e;
}
function MutateRestoreDirty(p) {
  const e = new Error('mutate-restore-dirty：恢复后与原文不一致（' + p + '）—— 面已被污染，后续判据全部不可信');
  e.kind = 'mutate-restore-dirty';
  return e;
}

// 纯函数：不写盘。找不到锚 ⇒ Miss；换完没变 ⇒ AirTurn。
function apply(src, from, to, opts) {
  const o = opts || {};
  if (String(from) === String(to)) throw MutateAirTurn(from);
  const i = String(src).indexOf(from);
  if (i < 0) throw MutateMiss(from);
  const after = o.all
    ? String(src).split(from).join(to)
    : String(src).slice(0, i) + to + String(src).slice(i + from.length);
  if (after === src) throw MutateAirTurn(from);
  const hits = String(src).split(from).length - 1;
  return { after: after, hits: hits };
}

// 写盘版：改 → 交给 fn → finally 恢复 → md5 复核
function runUnderMutate(file, from, to, fn, opts) {
  const before = fs.readFileSync(file);
  const beforeMd5 = md5(before);
  const r = apply(before.toString('utf8'), from, to, opts);
  let out;
  try {
    fs.writeFileSync(file, r.after, 'utf8');
    // 写盘后复核：**磁盘上必须真的是坏版本**。
    // 不复核的后果：写入静默失败（只读、磁盘满、被 monkeypatch）时，
    // 评判跑的是**原版本**，而人以为「破坏过了」—— 这叫空转。
    if (fs.readFileSync(file, 'utf8') !== r.after) {
      const e = MutateAirTurn(from);
      e.why = 'write-not-landed';
      throw e;
    }
    out = fn ? fn({ file: file, after: r.after, hits: r.hits }) : null;
  } finally {
    fs.writeFileSync(file, before, 'utf8');
  }
  if (md5(fs.readFileSync(file)) !== beforeMd5) throw MutateRestoreDirty(file);
  return { value: out, hits: r.hits, restored: true, beforeMd5: beforeMd5 };
}

function main() {
  const argv = process.argv.slice(2);
  function arg(k) {
    const hit = argv.filter(function (a) { return a.indexOf('--' + k + '=') === 0; })[0];
    return hit ? hit.slice(k.length + 3) : null;
  }
  const file = arg('file');
  const from = arg('from');
  const to = arg('to');
  if (!file || from === null || to === null) {
    console.log('用法：node tools/mutate.js --file=<路径> --from=<锚> --to=<坏版本> [--all]');
    return 2;
  }
  try {
    const r = runUnderMutate(path.resolve(file), from, to, function (m) {
      return m.after.length - m.after.split(from).join('').length;
    }, { all: argv.indexOf('--all') >= 0 });
    console.log('✓ mutate: 命中 ' + r.hits + ' 处 · 破坏期间文本确已改变 · 恢复后 md5 一致（' + r.beforeMd5.slice(0, 8) + '）');
    return 0;
  } catch (e) {
    console.log('✗ mutate: ' + e.kind + ' —— ' + e.message);
    return 1;
  }
}

if (require.main === module) process.exit(main());
module.exports = { apply: apply, runUnderMutate: runUnderMutate, md5: md5 };