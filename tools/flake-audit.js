#!/usr/bin/env node
// WorldAxis tools/flake-audit.js (v2.524.0) — OPV29-23 抖测试治理
//
// ── 它治什么（缺口，开工前先看现场）──────────────────────────────
//   判据能不能绿，不该取决于「这次跑的时候几点」或「这次随机数是多少」。
//   本仓有基建（`core/clock.js` 时间、`core/rand.js` 随机），但**测试里到处是直采**：
//   实测 `tests/*.js` 里 `Date.now()` **307 处 / 54 个文件**、`Math.random` **34 处 / 10 个文件**、
//   `new Date(` **8 处**。这些不全是病 —— 测自己计时、给临时目录起名是合理的；
//   有病的是「**把真实时间/随机当真值去断言被测逻辑**」。
//   所以本工具不搞「一律禁止」（一刀切会把 307 处全判红，人就会立刻关掉它），
//   而是三档 + 一条行为判据：
//     harness  同一行就是计时/命名/超时语境 ⇒ 合理（规则见 RULES，可逐条复算）
//     suspect  其余 ⇒ **点名到 文件:行:片段**，让人逐条看
//     exempt   显式登记（文件 + 理由），为「确实是测被测逻辑所需」的少数留口
//   行为判据（这才是验收原文的第二半）：`--repeat=3 --files=…` 连跑三次，
//   剥掉耗时行后**输出 md5 必须相同**。读数会抖的测试，这一条会当场现形。
//
// ── 为什么 suspect 不直接判红 ─────────────────────────
//   因为「307 处全红」不是治理，是关灯。Z4-23 的验收是「有抖即点名」——
//   点名是硬要求（清单可复算、逐行可查），一刀切不是。真正判红的是**行为面**
//   （连跑三次不一致）与**新增面**（本批及之后新增的文件不许出现 suspect）。
//
// ── 用法 ────────────────────────────────────────────
//   node tools/flake-audit.js                        # 三档读数 + suspect 清单
//   node tools/flake-audit.js --json
//   node tools/flake-audit.js --repeat=3 --files=tests/a.js,tests/b.js
//   node tools/flake-audit.js --new=opv29-            # 只看文件名含该串的 suspect（新增面判据）
//
// ── 纪律 ────────────────────────────────────────────
//   · 只读；零依赖。
//   · `--repeat` 用 `execFile` 起子进程，不加 shell（判据里有 `!` 时不会被历史展开咬到）。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const BASE = path.resolve(__dirname, '..');

// harness 规则：命中任一即视为「测自己」而不是「测被测逻辑」
const RULES = [
  { id: 'elapsed', re: /elapsed|duration|cost|耗时|用时|ms\b|毫秒/, why: '计时读数' },
  { id: 'timeout', re: /timeout|budget|deadline|超时|预算/, why: '超时预算' },
  { id: 'naming', re: /tmpdir|mkdtemp|uniq|suffix|\.toISOString|toString\(36\)|pid|stamp|命名|后缀/, why: '临时目录/唯一名' },
  { id: 'clock-seed', re: /clock\.|rand\.|seed|setNow|freeze/i, why: '注入时钟/随机（正解）' }
  // 曾有一条 log 规则（console\.log … ⇒ harness），已删：
  // 把时间打印到输出里恰恰就是抖动本身，豁免它等于把抖源藏起来。
  // 本工具初版凭这条把「写一个打印时间的测试文件」判成 harness，
  // 于是「新增面零 suspect」在一个真抖源存在时照样绿—— 这就是假绿。
];

// 显式豁免：文件 → 理由（必须是「测被测逻辑需要真实时间/随机」的具体理由）
const EXEMPT = {
  // 例：'tests/some.js': '被测逻辑就是「超时后行为」，必须给真实流逝时间'
};

const PATTERNS = [
  { id: 'date-now', re: /Date\.now\(\)/g },
  { id: 'new-date', re: /new Date\(/g },
  { id: 'math-random', re: /Math\.random/g }
];

function readLines(p) { return fs.readFileSync(p, 'utf8').split('\n'); }

// 剥注释：注释里写着 `Date.now()` 是**解释**，不是直采。
// 不剥的后果：本工具自己的注释就把自己报成 suspect（与 dep-audit 同族），
// 而且仓里大量注释提到时间/随机，会把 suspect 数吹到没人看。
function stripComments(src) {
  const out = [];
  let inBlock = false;
  const lines = String(src).split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let res = '';
    let j = 0;
    while (j < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', j);
        if (end < 0) { j = line.length; break; }
        inBlock = false; j = end + 2; continue;
      }
      if (line.startsWith('/*', j)) { inBlock = true; j += 2; continue; }
      if (line.startsWith('//', j)) break;          // 行注释到尾
      res += line[j]; j += 1;
    }
    out.push(res);
  }
  return out;
}

function classifyLine(line) {
  for (let i = 0; i < RULES.length; i++) {
    if (RULES[i].re.test(line)) return RULES[i].id;
  }
  return null;
}

function audit(root) {
  const r = root || BASE;
  const dir = path.join(r, 'tests');
  if (!fs.existsSync(dir)) return { ok: false, why: 'tests-dir-missing', files: 0, total: 0, harness: [], suspect: [], exempt: [] };
  const names = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort();
  const harness = [], suspect = [], exempt = [];
  let total = 0;
  names.forEach(function (f) {
    const rel = 'tests/' + f;
    const lines = stripComments(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let hit = null;
      for (let k = 0; k < PATTERNS.length; k++) {
        PATTERNS[k].re.lastIndex = 0;
        if (PATTERNS[k].re.test(line)) { hit = PATTERNS[k].id; break; }
      }
      if (!hit) continue;
      total += 1;
      const rec = { file: rel, line: i + 1, kind: hit, text: line.trim().slice(0, 90) };
      if (EXEMPT[rel]) { rec.why = EXEMPT[rel]; exempt.push(rec); continue; }
      const tag = classifyLine(line);
      if (tag) { rec.rule = tag; harness.push(rec); } else { suspect.push(rec); }
    }
  });
  return { ok: true, why: '', files: names.length, total: total,
    harness: harness, suspect: suspect, exempt: exempt };
}

// 连跑三次比输出：剥掉耗时行（那是唯一允许每次不同的东西）
function normalize(out) {
  return String(out).split('\n').filter(function (l) {
    return !/(耗时|用时|elapsed|\bms\b|duration|Time:)/i.test(l);
  }).join('\n');
}
function repeat(files, times, root) {
  const r = root || BASE;
  const rows = [];
  files.forEach(function (rel) {
    const p = path.join(r, rel);
    const md5s = [];
    let err = null;
    for (let i = 0; i < times; i++) {
      try {
        const out = cp.execFileSync(process.execPath, [p], {
          encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024, env: Object.assign({}, process.env, { WA_REPEAT: String(i) })
        });
        md5s.push(crypto.createHash('md5').update(normalize(out)).digest('hex'));
      } catch (e) {
        err = 'exit=' + (e.status === undefined ? 'null' : e.status);
        break;
      }
    }
    rows.push({ file: rel, times: md5s.length, md5s: md5s, stable: !err && new Set(md5s).size === 1, err: err });
  });
  return rows;
}

function main() {
  const argv = process.argv.slice(2);
  function arg(k) {
    const hit = argv.filter(function (a) { return a.indexOf('--' + k + '=') === 0; })[0];
    return hit ? hit.slice(k.length + 3) : null;
  }
  let root = BASE;
  const rootArg = arg('root'); if (rootArg) root = path.resolve(rootArg);

  if (arg('repeat')) {
    const files = (arg('files') || '').split(',').filter(Boolean);
    if (!files.length) { console.log('--repeat 需要 --files=a.js,b.js'); return 2; }
    const rows = repeat(files, Number(arg('repeat')) || 3, root);
    rows.forEach(function (x) {
      console.log((x.stable ? '✓ ' : '✗ ') + x.file + '：' + x.times + ' 次 · ' +
        (x.stable ? '输出逐字节相同' : '输出不一致 md5=' + x.md5s.join('/')) + (x.err ? ' ' + x.err : ''));
    });
    return rows.every(function (x) { return x.stable; }) ? 0 : 1;
  }

  const res = audit(root);
  if (argv.indexOf('--json') >= 0) { console.log(JSON.stringify(res, null, 2)); return res.ok ? 0 : 1; }
  if (!res.ok) { console.log('✗ ' + res.why); return 1; }
  const onlyNew = arg('new');
  const suspect = onlyNew ? res.suspect.filter(function (s) { return s.file.indexOf(onlyNew) >= 0; }) : res.suspect;
  console.log('扫描 tests/*.js **' + res.files + '** 个文件 · 直采点 **' + res.total + '** 处');
  console.log('  harness ' + res.harness.length + ' · suspect ' + res.suspect.length +
    ' · exempt ' + res.exempt.length + (onlyNew ? '（仅看含 ' + onlyNew + ' 的：' + suspect.length + '）' : ''));
  const byFile = {};
  res.suspect.forEach(function (s) { byFile[s.file] = (byFile[s.file] || 0) + 1; });
  Object.keys(byFile).sort(function (a, b) { return byFile[b] - byFile[a]; }).slice(0, 8).forEach(function (f) {
    console.log('  suspect ' + f + '：' + byFile[f] + ' 处');
  });
  suspect.slice(0, 10).forEach(function (s) {
    console.log('    · ' + s.file + ':' + s.line + ' [' + s.kind + '] ' + s.text);
  });
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { audit: audit, repeat: repeat, classifyLine: classifyLine, stripComments: stripComments, RULES: RULES, EXEMPT: EXEMPT, normalize: normalize };