#!/usr/bin/env node
// WorldAxis tests/iteration-log-v2595.js — 迭代日志与提交面对账（v2.595.0 / R270 LOG-1）
//
// 锁的是「这一轮做了什么，日后答得出来」，不是「文件里有几行字」。写这把锁的**起因是现场**：
//   `ITERATION_LOG.md` 此前**不被任何门禁读**（`grep -rln ITERATION_LOG` 命中的全是被当反例
//   样本引用的锁），于是「提交正文写着补了 R259，文件里却没有这一节」
//   （实证：`03292b3` / `4ebf0e7` 两笔的正文与文件对不上）**永远不会红**。
//   R257–R260 与 R264–R269 两段断档就是这样连续四轮无人看见，直到 v2.594.0 靠人读才发现。
//
// 日志有两种形态（如实登记，不假装只有一种）：
//   ① `### RNNN · …` 老节：R100–R243，**倒序**（最新在上），历史上有真缺口与乱序
//      （R144…R162 乱序、R237/R238 落在文件中部）。这一代**不重排**：老节是历史，重排等于伪造顺序。
//   ② `## RNNN（vX.Y.Z · 标题）` 尾部追加节：R244 起、**正序追加**。本判据只管这一代 ——
//      它的写的人只有本仓、写法只有一种，纪律可以真的执行。
//
// 四组：
//   A 结构：尾部节连续无断档（本轮真实病的形态）/ 按 R 号非降序 / 每节标题带版本号 / 每节都有正文。
//   B 提交面：每个 R≥244 的提交号在日志里有落点；日志里每一节也都有提交提到（**两向**，防编造）。
//   C 版本面：最后一节的版本号 == `manifest.json` 与 `index.js` 的 VERSION。
//      这一条把「升版必须同轮写日志」变成判据 —— 迟一轮写就红。
//   ⚠ 时序：B3（反向）要求日志每一节都已有提交提到，本轮的节要**提交之后**才成立 ——
//     所以这把锁的终态要在提交后复跑一次（这是有意留的：先写日志再提交，而不是先提交再补日志）。
//   D 自证：同一套解析器喂合成文本（断档 / 乱序 / 缺版本 / 空节 / 全好）必须各自报出来，
//      再喂真文本必须报干净（两向，不恒真）。git 不可用时 B 段**如实 SKIP 并写明原因**，不装绿。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/** 尾部追加节的起点。理由：`## R244` 是“追加式”写法的第一轮，从这一轮起才有人往下排。 */
const FLOOR = 244;
/** 每节正文下限（字符）。实测最小节 141 字（R247 的「收尾读数」小节），100 是**下限不是均值**。 */
const MIN_BODY = 100;

/** 纯函数：把日志文本切成尾部节。不读文件、不读 git —— D 段靠它喂合成文本自证。 */
function parseTail(text) {
  const lines = String(text == null ? '' : text).split('\n');
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^## R(\d{3})/.exec(lines[i]);
    if (m) {
      const vm = /v(\d+\.\d+\.\d+)/.exec(lines[i]);
      cur = { r: Number(m[1]), line: i + 1, head: lines[i], ver: vm ? vm[1] : null, body: [] };
      blocks.push(cur);
      continue;
    }
    if (cur) cur.body.push(lines[i]);
  }
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].text = blocks[i].body.join('\n').trim();
    blocks[i].size = blocks[i].text.length;
  }
  return blocks;
}

/** 纯函数：对一段日志文本做四项判定。返回的每一项都是**待办清单**（空数组 = 这一项没问题）。 */
function audit(text) {
  const blocks = parseTail(text);
  const nums = blocks.map(function (b) { return b.r; });
  const uniq = [];
  nums.forEach(function (n) { if (uniq.indexOf(n) < 0) uniq.push(n); });
  const gaps = [];
  if (uniq.length) {
    for (let r = uniq[0]; r <= uniq[uniq.length - 1]; r++) {
      if (uniq.indexOf(r) < 0) gaps.push(r);
    }
  }
  const disorder = [];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] < nums[i - 1]) disorder.push(nums[i - 1] + '→' + nums[i]);
  }
  return {
    blocks: blocks, nums: nums, uniq: uniq, gaps: gaps, disorder: disorder,
    noVer: blocks.filter(function (b) { return !b.ver; }).map(function (b) { return b.r; }),
    thin: blocks.filter(function (b) { return b.size < MIN_BODY; }).map(function (b) { return b.r + '(' + b.size + ')'; }),
    floor: uniq.length ? uniq[0] : null,
    top: uniq.length ? uniq[uniq.length - 1] : null
  };
}

/** 提交面：主题行里的 R 号 → 提交 sha 列表。git 不在（打包环境）时回 null，不伪造空集。 */
function commitsByR() {
  let out = '';
  try {
    out = require('child_process').execSync('git log --pretty=format:%h%x09%s', {
      cwd: ROOT, encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (e) { return null; }
  const map = {};
  String(out).split('\n').forEach(function (l) {
    if (!l.trim()) return;
    const tab = l.indexOf('\t');
    if (tab < 0) return;
    const sha = l.slice(0, tab);
    const m = l.slice(tab + 1).match(/\bR(\d{3})\b/g) || [];
    m.forEach(function (t) {
      const n = Number(t.slice(1));
      (map[n] = map[n] || []).push(sha);
    });
  });
  return map;
}

function runAll(a) {
  const logPath = path.join(ROOT, 'ITERATION_LOG.md');
  let text = '';
  try { text = fs.readFileSync(logPath, 'utf8'); } catch (e) { text = ''; }
  a(!!text, 'A0: ITERATION_LOG.md 在位且非空');
  if (!text) return { rounds: 0 };

  const t = audit(text);
  // ── A 结构 ──────────────────────────────
  a(t.blocks.length >= 20, 'A1: 尾部追加节 ≥ 20 节（实 ' + t.blocks.length + '）');
  a(t.floor === FLOOR,
    'A1b: 尾部第一节是 R' + FLOOR + '（实 R' + t.floor + '）—— 起点一旦漂移，下面的连续性与提交面对账都失去坐标系');
  a(t.gaps.length === 0,
    'A2: 尾部 R 号**连续无断档**（缺: ' + (t.gaps.join(',') || '无') + '）—— R257–R260 / R264–R269 两段断档就是这个形态');
  a(t.disorder.length === 0,
    'A3: 尾部按 R 号**非降序追加**（乱序点: ' + (t.disorder.slice(0, 6).join(' / ') || '无') + '）');
  a(t.noVer.length === 0,
    'A4: 每节标题都带版本号（缺: ' + (t.noVer.join(',') || '无') + '）—— 版本号在标题上，不在正文里，才可复算');
  a(t.thin.length === 0,
    'A5: 每节正文都 ≥ ' + MIN_BODY + ' 字（过短: ' + (t.thin.join(',') || '无') + '）—— 标题占位不算写过');

  // ── B 提交面对账（两向） ─────────────────────
  const byR = commitsByR();
  let skipped = '';
  if (!byR) {
    skipped = 'git-unavailable';
    a(!!skipped, 'B0: git 不可用 ⇒ 提交面对账 SKIP（原因 git-unavailable，不拿空集冒充“都对上了”）');
  } else {
    const commitR = Object.keys(byR).map(Number).filter(function (n) { return n >= FLOOR; });
    const logOnly = t.uniq.filter(function (n) { return n >= FLOOR && commitR.indexOf(n) < 0; });
    const commitOnly = commitR.filter(function (n) { return t.uniq.indexOf(n) < 0; }).sort(function (x, y) { return x - y; });
    a(commitR.length >= 20, 'B1: 提交面读到 ≥ 20 个 R 号（实 ' + commitR.length + '，共 ' + Object.keys(byR).length + ' 个含 R 号的提交）');
    a(commitOnly.length === 0,
      'B2: 每个 R≥' + FLOOR + ' 的提交号在日志里都有落点（缺: ' + (commitOnly.join(',') || '无') + '）'
      + ' —— 这正是 03292b3 那类“正文说补了、文件里没有”的形态');
    a(logOnly.length === 0,
      'B3: 日志里每一节都有提交提到（无提交的: ' + (logOnly.join(',') || '无') + '）—— 反向，防日志编造');
    skipped = '';
  }

  // ── C 版本面：升版必须同轮写日志 ──────────────
  let manifestVer = '';
  let indexVer = '';
  try { manifestVer = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version; } catch (e) { manifestVer = ''; }
  const im = /const VERSION = '(\d+\.\d+\.\d+)'/.exec(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'));
  indexVer = im ? im[1] : '';
  a(!!manifestVer && manifestVer === indexVer,
    'C0: manifest.json 与 index.js 的 VERSION 同源（' + manifestVer + ' / ' + indexVer + '）');
  const last = t.blocks[t.blocks.length - 1] || null;
  a(!!last && last.ver === manifestVer,
    'C1: **最后一节**的版本号 == VERSION（末节 R' + (last ? last.r : '-') + ' / ' + (last ? last.ver : '-')
    + ' vs ' + manifestVer + '）—— 升版必须同轮写日志，迟一轮就红');
  a(!!last && last.r === t.top, 'C1b: 末节就是最大 R 号（实 R' + (last ? last.r : '-') + ' vs R' + t.top + '）');

  // ── D 自证：同一套解析器，喂合成文本必须报缺陷；喂真文本必须报干净 ──
  const syn = function (items) {
    return items.map(function (it) {
      return '## R' + it.r + (it.ver === null ? '' : '（v' + (it.ver || '9.9.9') + ' · 合成）') + '\n'
        + new Array((it.size === undefined ? MIN_BODY + 40 : it.size) + 1).join('x') + '\n';
    }).join('');
  };
  const g1 = audit(syn([{ r: 100 }, { r: 101 }, { r: 103 }]));
  a(g1.gaps.length === 1 && g1.gaps[0] === 102, 'D1: 合成文本 R100/R101/R103 ⇒ **报出 102 断档**（实 ' + JSON.stringify(g1.gaps) + '）');
  const g2 = audit(syn([{ r: 100 }, { r: 102 }, { r: 101 }]));
  a(g2.disorder.length === 1 && g2.disorder[0] === '102→101', 'D2: 合成文本乱序 ⇒ 报出乱序点（实 ' + JSON.stringify(g2.disorder) + '）');
  const g3 = audit(syn([{ r: 100, ver: null }]));
  a(g3.noVer.length === 1 && g3.noVer[0] === 100, 'D3: 合成文本标题缺版本号 ⇒ 报出（实 ' + JSON.stringify(g3.noVer) + '）');
  const g4 = audit(syn([{ r: 100, size: 10 }]));
  a(g4.thin.length === 1 && g4.thin[0] === '100(10)', 'D4: 合成文本空节 ⇒ 报出（实 ' + JSON.stringify(g4.thin) + '）');
  const g5 = audit(syn([{ r: 100 }, { r: 101 }, { r: 102 }]));
  a(g5.gaps.length === 0 && g5.disorder.length === 0 && g5.noVer.length === 0 && g5.thin.length === 0,
    'D5: 合成文本全好 ⇒ **四项都报干净**（前四条不是恒真——两向自证）');
  a(t.gaps.length === 0 && t.disorder.length === 0,
    'D6: 真文本在同一套解析器上也报干净（D1/D2 的缺陷不是“永远报得出来”的假判据）');

  return {
    rounds: t.uniq.length, top: t.top, version: manifestVer,
    sections: t.blocks.length, commits: byR ? Object.keys(byR).length : null, skipped: skipped || null
  };
}

module.exports = { runAll: runAll, audit: audit, parseTail: parseTail, FLOOR: FLOOR, MIN_BODY: MIN_BODY };
