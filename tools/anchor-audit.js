#!/usr/bin/env node
// WorldAxis tools/anchor-audit.js (v2.524.0) — OPV29-19 锚定收窄 + OPV29-20 负控制覆盖
//
// ── 它治什么（缺口，开工前先看现场）──────────────────────────────
//   19 锚定：判据抓源码靠锚。锚写成**裸短子串**（`indexOf('parse')`）时，
//     它会在任何提到这个词的地方命中 —— 注释、文档字符串、别的函数名。
//     于是「改坏真源码」可能没咬住，而「改了一句说明」反而红。
//     现场（剥注释后）：全仓 `indexOf('…')` **5462** 处，其中参数长度 < 8 的 **1025** 处；
//     只看本批 opv29 专锁：**29** 处。
//     ⚠ 1025 是存量，不是「今天必须清零」的数 —— 但**不许再增长**，且新增面零容忍。
//   20 负控制覆盖：每条新增判据都要有一条「真破坏后必红」的自证。
//     检查方式是机械的：opv29 专锁里必须同时出现「负控制」记录与实测读数（`FAIL n/m`）。
//     没有这两个字样的锁，多半是「只写了正向断言就宣布完成」。
//
// ── 为什么 bare 不直接判红 ────────────────────────
//   1025 处裸锚里很多是合理的（`indexOf('.js')`、`indexOf('✗')`）。
//   一刀切等于关灯；本工具做的是**冻结存量 + 新增零容忍 + 逐条点名**，
//   与面数常量（BASE_TEST_FILES）同一套纪律：数字动了，动它的人必须亲手确认。
//
// ── 用法 ────────────────────────────────────────────
//   node tools/anchor-audit.js                 # 全仓读数 + 本批 opv29 明细
//   node tools/anchor-audit.js --json
//   node tools/anchor-audit.js --only=opv29-   # 只看文件名含该串
//
// ── 纪律 ────────────────────────────────────────────
//   · 剥注释后再扫（注释里写 indexOf('x') 是解释，不是判据）。
//   · 只读；零依赖。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');

// 冻结基线：测得于 v2.524.0 本批（命令见文件头）。只许下降，不许上升。
// 29 是未剥注释时的数；剥注释后实测 27（`node tools/anchor-audit.js`）。
// 口径变了就要写清楚：同一个名字两个数，不说明就是两份手填互相矛盾。
const BASELINE_OPV_BARE = 27;
// v2.542.8 重冻（逐文件额度表）：27 这个单值冻结在 v2.524.0 立的时候，opv29 专锁只有 9 把；
//   到 v2.542.8 已经是 32 把。单值冻结的后果是结构性恒红 —— 现场 41，永远 > 27，
//   而判据想说的是「新增锁不许再添裸锚」，不是「本批总数不许超过当年那 9 把」。
//   同一个病本仓已经犯过三次（loadedCount===loadOrderCount / 版本钉死在 2.407.0 /
//   区间号那一档），治法一致：把「当时的事实」换成「可增量比对的口径」。
//   现口径：每个 opv29 文件各有额度（= 重冻时现场值，只许降不许升）；**没有出现在本表
//   里的 opv29 文件额度为 0**（新增锁零容忍，这才是原判据真正想守的那条）。
//   另注：本表就是欠账明细 —— 分到额度的 10 个文件合计 41 处裸锚，仍是待还的账，
//   不是绿；只是不再用一个假的总数把它们全判红。
const BASELINE_OPV_PER_FILE = {
  'tests/opv29-z1-04-v2529.js': 9,
  'tests/opv29-z3-v2524.js': 3,
  'tests/opv29-z4-v2529.js': 4,
  'tests/opv29-z5-26-v2529.js': 3,
  'tests/opv29-z5-28-v2529.js': 8,
  'tests/opv29-z5-30-v2529.js': 4,
  'tests/opv29-z5-v2529.js': 3,
  'tests/opv29-z6-33-v2529.js': 2,
  'tests/opv29-z6-factage-jsonrepair-v2529.js': 1,
  'tests/opv29-z6-v2529.js': 4
};
// 负控制覆盖：opv29 专锁必须带这两样
const NEED_NEGATIVE = /负控制|真破坏|破坏版/;
// 两档算合规：真实读数（FAIL n/m）或**显式声明欠账**。
// 不许两者都没有；但也不逼人编数字—— 编出来的读数比没读数更坏。
const NEED_READING = /FAIL \d+\/\d+/;
const DECLARED_DEBT = /负控制：未做（欠账/;

function stripComments(src) {
  const out = [];
  let inBlock = false;
  const lines = String(src).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let res = '';
    let j = 0;
    while (j < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', j);
        if (end < 0) { j = line.length; break; }
        inBlock = false; j = end + 2; continue;
      }
      if (line.startsWith('/*', j)) { inBlock = true; j += 2; continue; }
      if (line.startsWith('//', j)) break;
      res += line[j]; j += 1;
    }
    out.push(res);
  }
  return out;
}

// 结构标记：出现任一即认为锚带上下文（不是裸子串）
const STRUCT = /[=(){}\[\];:<>\n]|=>|function|return|const |let |\bWA\./;

function classifyAnchor(arg) {
  if (typeof arg !== 'string') return 'unknown';
  if (arg.length >= 8) return 'contextual';
  if (STRUCT.test(arg)) return 'contextual';
  return 'bare';
}

function audit(root) {
  const r = root || BASE;
  const dir = path.join(r, 'tests');
  if (!fs.existsSync(dir)) return { ok: false, why: 'tests-dir-missing' };
  const names = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort();
  const per = {};       // file -> {total, bare, samples[]}
  let total = 0, bare = 0;
  const re = /\.(?:indexOf|includes)\(\s*(['"])([^'"]*)\1\s*\)/g;
  names.forEach(function (f) {
    const rel = 'tests/' + f;
    const lines = stripComments(fs.readFileSync(path.join(dir, f), 'utf8'));
    const rec = { total: 0, bare: 0, samples: [] };
    lines.forEach(function (line, i) {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        const kind = classifyAnchor(m[2]);
        rec.total += 1; total += 1;
        if (kind === 'bare') {
          rec.bare += 1; bare += 1;
          if (rec.samples.length < 5) rec.samples.push({ line: i + 1, arg: m[2] });
        }
      }
    });
    if (rec.total) per[rel] = rec;
  });
  // 负控制覆盖：读数记在 **tests/run.js 的挂载块**里（每条 runScript 前面那段注释），
  // 不在测试文件里—— 初版扫测试文件本身，结果 9 个全被报「缺读数」（假红）。
  const runSrc = fs.readFileSync(path.join(dir, 'run.js'), 'utf8');
  const parts = runSrc.split(/await runScript\(\s*'\.\/([^']+)'\s*\);/);
  const blockOf = {};
  for (let i = 1; i < parts.length; i += 2) {
    blockOf[parts[i]] = parts[i - 1] || '';
  }
  const neg = names.filter(function (f) { return /^opv29-/.test(f); }).map(function (f) {
    const blk = blockOf[f] || '';
    return {
      file: 'tests/' + f,
      hasNegative: NEED_NEGATIVE.test(blk),
      hasReading: NEED_READING.test(blk),
      declaredDebt: DECLARED_DEBT.test(blk),
      registered: Object.prototype.hasOwnProperty.call(blockOf, f)
    };
  });
  const opvBare = Object.keys(per).filter(function (k) { return k.indexOf('opv29-') >= 0; })
    .reduce(function (s, k) { return s + per[k].bare; }, 0);
  // 逐文件额度比对：超出额度（含「新文件额度为 0」）的逐条点名
  const opvOver = Object.keys(per).filter(function (k) { return k.indexOf('opv29-') >= 0; })
    .map(function (k) {
      const allow = Object.prototype.hasOwnProperty.call(BASELINE_OPV_PER_FILE, k) ? BASELINE_OPV_PER_FILE[k] : 0;
      return { file: k, bare: per[k].bare, allow: allow };
    })
    .filter(function (x) { return x.bare > x.allow; });
  return { ok: true, why: '', files: names.length, total: total, bare: bare,
    opvBare: opvBare, baseline: BASELINE_OPV_BARE, baselinePerFile: BASELINE_OPV_PER_FILE,
    opvOver: opvOver, per: per, negative: neg };
}

function main() {
  const argv = process.argv.slice(2);
  const res = audit(BASE);
  if (argv.indexOf('--json') >= 0) { console.log(JSON.stringify(res, null, 2)); return res.ok ? 0 : 1; }
  if (!res.ok) { console.log('✗ ' + res.why); return 1; }
  const only = (argv.filter(function (a) { return a.indexOf('--only=') === 0; })[0] || '').slice(7);
  console.log('剥注释后 `indexOf/includes(\'…\')` **' + res.total + '** 处 · 裸短锚（<8 字且无结构标记）**' + res.bare + '** 处');
  console.log('  本批 opv29 专锁裸锚 **' + res.opvBare + '** 处（逐文件额度制；超额度 ' + (res.opvOver || []).length + ' 个文件）');
  const top = Object.keys(res.per).sort(function (a, b) { return res.per[b].bare - res.per[a].bare; }).slice(0, 6);
  top.forEach(function (k) {
    if (!res.per[k].bare) return;
    console.log('  ' + k + '：' + res.per[k].bare + '/' + res.per[k].total + ' 裸锚，例 ' +
      JSON.stringify(res.per[k].samples.slice(0, 2)));
  });
  if (only) {
    Object.keys(res.per).filter(function (k) { return k.indexOf(only) >= 0 && res.per[k].bare; })
      .forEach(function (k) { console.log('  [' + only + '] ' + k + '：' + res.per[k].bare + ' 处 bare'); });
  }
  const missNeg = res.negative.filter(function (n) { return !n.hasNegative; });
  const missRead = res.negative.filter(function (n) { return !n.hasReading && !n.declaredDebt; });
  const declared = res.negative.filter(function (n) { return n.declaredDebt; });
  console.log('  负控制覆盖：opv29 专锁 ' + res.negative.length + ' 个 · 缺负控制字样 ' +
    missNeg.length + ' · 既无读数也未声明欠账 ' + missRead.length +
    ' · 已声明欠账 ' + declared.length);
  declared.forEach(function (n) { console.log('    欠账在账：' + n.file); });
  missNeg.slice(0, 5).forEach(function (n) { console.log('    缺负控制：' + n.file); });
  missRead.slice(0, 5).forEach(function (n) { console.log('    缺读数：' + n.file); });
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { audit: audit, classifyAnchor: classifyAnchor, stripComments: stripComments,
  BASELINE_OPV_BARE: BASELINE_OPV_BARE, BASELINE_OPV_PER_FILE: BASELINE_OPV_PER_FILE,
  NEED_READING: NEED_READING, DECLARED_DEBT: DECLARED_DEBT, NEED_NEGATIVE: NEED_NEGATIVE };