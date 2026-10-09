#!/usr/bin/env node
// WorldAxis tools/prune-sections.js — 分层选区的**真省时**裁剪器（O6，v2.187.0）
//
// ── 它治的病（现场实证，v2.187.0 本轮扫描）────────────────────────────
//   选区入口（`tests/run.js --only-v-section`）此前只做了一件事：`section()` 提前返回。
//   于是**没被选中的节，节体语句仍然逐条执行、断言仍然计数** —— 省下的只有打印，
//   不是时间。这叫「假分层」：读数说「跳过 N 节」，机器上那 N 节的活一点没少干。
//   本仓对同类事情的规矩是现成的（`算不出来不得当作算过`）：**跳过必须真的不执行，
//   否则不许说跳过**。
//
// ── 本办法：把未选中节的节体从源码里拿掉 ──────────────────────────────
//   扫 `tests/run.js`，对每个 `section('…')` 调用点取节体：
//     · **块形态**（`section(…);` 之后是 `{ … }`）：未选中 ⇒ **整块换成一行占位**。
//       词法作用域自洽（块内 const/let/function 不出块）⇒ 删除不可能影响块外。
//     · **裸语句形态**（节体是散落语句、无块包装）：**只标不裁**（调用点注释掉、节体保留）。
//       凭什么不裁：它的语句可能给**后面的节**留夹具（现场就有：`core/store` 节的
//       `WA.store.init()` 后面好几节都在用同一份 store）。裁它省不了多少，
//       却能把「选了 A 节」变成「A 节在缺夹具的世界里跑」——那是假绿制造机。
//   两种形态都**逐条列名**，裁了多少行、剩多少行都写进读数。
//
// ── 兜底：裁剪结果必须能过 `node --check` ────────────────────────────
//   括号扫描器**不是 JS 解析器**（现场自证：用它算 `tests/run.js` 的净深度得 **15**，
//   不是 0 —— 模板串 `${}` 与正则里的括号会把它带偏）。所以「配平」只当**候选**，
//   真判据是 `node --check <裁剪版>`：**不通过就拒裁**（exit 2），绝不把破源码写出去。
//   这条与仓里「破坏必须可观测」同规：要么有证据，要么报错，不许猜。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tools/prune-sections.js --sel '<节名子串>'            # dry-run：报统计
//   node tools/prune-sections.js --sel '<子串>' --out f.js     # 落盘裁剪版（默认 tests/_pruned-run.js）
//   node tools/prune-sections.js --self-test                   # 合成源真执行自证
//   node tools/prune-sections.js --sel '<子串>' --run          # 落盘 → --check → 执行 → 清理
//
// ── 边界（如实登记）──────────────────────────────────────────────────
//   · 只读 `tests/run.js`，只写你指定的 `--out`（默认路径带 `_` 前缀，且已在 `.gitignore`）。
//   · 「省了多少秒」不由本工具承诺：裁剪只保证**那些行真的不执行**；耗时归 `slow-sections.js` 归集。
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUN = path.join(ROOT, 'tests', 'run.js');
const DEFAULT_OUT = path.join(ROOT, 'tests', '_pruned-run.js');

/** JS 感知的逐行花括号净增量（跳过行注释 / 块注释 / 三种字符串 / 模板串 / **正则字面量**）。
 *  **只作候选**：它不是解析器，真判据在 `check()` 的 node --check（切不中时由 `pruneSafe` 自动降级）。
 *
 *  正则字面量判据（v2.187.0 本轮补）：`/` 到底是「正则开始」还是「除法」，按**它前面最后一个
 *  有意义字符**判 —— 是 `( , = : [ ! & | ? { } ; + - * % ~ ^ < >` 之一（或行首无此字符）就当正则。
 *  为什么非补不可：现场第 9960 行 `(order2500.match(/'([^']+\.js)'/g) || [])` ——
 *  没这条判据时，扫描器把 `/` 当除法、接着把 `'([^']+'` 当单引号串，于是
 *  `function (x) {` 的 `{` 落进「串里」被吞、而配对的 `}` 照算 ⇒ 该行净增量 **-1**，
 *  整个扫描自此错位一行，把这一节的块尾判定提前到了 9960（删它就把文件切成两半）。
 *  这条判据的收益是「少踩坑」，**不是**「不必兜底」——兜底仍在 `pruneSafe`。 */
function braceDelta(lines) {
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    let d = 0, i = 0, inS = null, inTpl = false, lastSig = null;
    while (i < line.length) {
      const ch = line[i], nx = line[i + 1];
      if (inBlock) {
        if (ch === '*' && nx === '/') { inBlock = false; i += 2; continue; }
        i += 1; continue;
      }
      if (inS) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === inS) inS = null;
        i += 1; continue;
      }
      if (inTpl) {
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`') inTpl = false;
        i += 1; continue;
      }
      if (ch === '/' && nx === '/') break;
      if (ch === '/' && nx === '*') { inBlock = true; i += 2; continue; }
      if (ch === '/') {
        // 正则 or 除法：看前一个有意义字符
        const asRegex = (lastSig === null) || '([{,;:=!&|?+-*%~^<>'.indexOf(lastSig) >= 0;
        if (asRegex) {
          i += 1;
          while (i < line.length) {
            if (line[i] === '\\') { i += 2; continue; }
            if (line[i] === '/') { i += 1; break; }
            i += 1;
          }
          while (i < line.length && /[a-z]/i.test(line[i])) i += 1;   // flags
          lastSig = '/';
          continue;
        }
        lastSig = '/'; i += 1; continue;
      }
      if (ch === '"' || ch === "'") { inS = ch; i += 1; continue; }
      if (ch === '`') { inTpl = true; i += 1; continue; }
      if (ch === '{') { d += 1; lastSig = '{'; i += 1; continue; }
      if (ch === '}') { d -= 1; lastSig = '}'; i += 1; continue; }
      if (ch !== ' ' && ch !== '\t') lastSig = ch;
      i += 1;
    }
    out.push(d);
  }
  return out;
}

/** 扫描节：name / 调用行号 / 节体范围 / 形态 / 可否裁剪候选。 */
function scan(src) {
  const lines = src.split('\n');
  const delta = braceDelta(lines);
  const marks = [];
  lines.forEach(function (l, i) {
    const m = l.match(/^  section\((['"])(.*)\1\);\s*$/);
    if (m) marks.push({ line: i, name: m[2] });
  });
  return marks.map(function (mk, k) {
    const next = (k + 1 < marks.length) ? marks[k + 1].line : lines.length;
    let j = mk.line + 1;
    while (j < next && lines[j].trim() === '') j += 1;
    const blockForm = (j < next && lines[j].trim() === '{');
    let close = null;
    if (blockForm) {
      let run = 0;
      for (let t = j; t < next; t++) {
        run += delta[t];
        if (run === 0) { close = t; break; }
      }
    }
    const block = (blockForm && close !== null);
    // ── 嵌套块判据（v2.187.0 本轮现场踩到）──────────────────────────────
    //   候选闭合行的**下一非空行若是裸 `}`**（例如 `  } // end v2.4.0 block`），说明这一节
    //   的 `{…}` 是**嵌在旧版块里的内层块**：删它只会拆掉内层，外层那个 `}` 当场多出来。
    //   现场两例（本文件 9915 与 13236 行）：前者删掉后报语法错，后者删掉后吞了 10 个外层 `}`。
    //   形态上无从分辨（两处都是规规矩矩的 `{` … `}`），所以判据必须写在**边界之后的那一行**，
    //   而不是块自己身上。
    let nested = false;
    if (block) {
      let t = close + 1;
      while (t < next && lines[t].trim() === '') t += 1;
      nested = (t < next && lines[t].trim().indexOf('}') === 0);
    }
    const usable = (block && !nested);
    return {
      name: mk.name, line: mk.line, openLine: j, closeLine: close,
      nextLine: next, blockForm: blockForm, block: usable, nested: nested,
      bodyLines: usable ? (close - j + 1) : (next - mk.line - 1)
    };
  });
}

/** 生成裁剪版源码。返回 { text, kept, omitted, marked, stats }。
 *  · needles 命中的节：原样保留（它跑它原来的全部判据）；
 *  · 未命中且**可裁块**（顶层块，不含 9815/13236 那两处内层块）：整块 → 一行占位（**节体不执行**）；
 *  · 未命中且裸语句 / 内层块：调用点 → 注释（**如实声明：节体仍执行，本形态省时为 0**）。 */
function prune(src, needles, opt) {
  const ns = (needles || []).map(String);
  const fob = (opt && opt.forbid) ? opt.forbid : [];
  const lines = src.split('\n');
  const secs = scan(src);
  const kept = [], omitted = [], marked = [];
  // 从后往前替换，行号不漂
  for (let k = secs.length - 1; k >= 0; k--) {
    const s = secs[k];
    const hit = ns.some(function (n) { return s.name.indexOf(n) >= 0; });
    if (hit) { kept.unshift(s.name); continue; }
    const usable = s.block && fob.indexOf(s.name) < 0;
    if (usable) {
      const placeholder = "  section('" + s.name + "');"
        + "  // [O6 裁剪] 未被 --only-v-section 选中：节体已省略（" + s.bodyLines + " 行不执行）";
      lines.splice(s.line, s.closeLine - s.line + 1, placeholder);
      omitted.unshift({ name: s.name, lines: s.bodyLines });
    } else {
      const why = fob.indexOf(s.name) >= 0
        ? '块边界未过语法自证（单独删它会崩，故降级为只标不裁）'
        : (s.nested
          ? '内层块（嵌在旧版块里，删它会拆出多余的 `}`）'
          : '裸语句节体（它可能给后面的节留夹具）');
      lines.splice(s.line, 1, "  // [O6 裁剪·只标不裁] section('" + s.name + "')"
        + "  —— " + why + '，故保留（如实：这些行仍执行）');
      marked.unshift({ name: s.name, lines: s.bodyLines, nested: !!s.nested, forbidden: fob.indexOf(s.name) >= 0 });
    }
  }
  return {
    text: lines.join('\n'),
    kept: kept, omitted: omitted, marked: marked,
    stats: {
      selected: kept.length, omittedCount: omitted.length,
      omittedLines: omitted.reduce(function (a, o) { return a + o.lines; }, 0),
      markedCount: marked.length,
      markedNested: marked.filter(function (m) { return m.nested; }).length,
      markedForbidden: marked.filter(function (m) { return m.forbidden; }).length,
      markedLines: marked.reduce(function (a, o) { return a + o.lines; }, 0),
      srcLines: src.split('\n').length, outLines: lines.length
    }
  };
}

/** 硬兜底：裁剪版必须能被 Node 解析。不通过 ⇒ 抛（调用方须拒裁，不得写出去）。 */
function check(file) {
  const r = cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error('裁剪版未通过 node --check（拒裁）: ' + String(r.stderr || '').split('\n').slice(0, 4).join(' / '));
  }
  return true;
}

/** 只删这一个节 → 语法自证。用于定位「块边界切错了」的节（扫描器的候选边界不等于真边界）。 */
function probeOne(src, sec, tmpFile) {
  const lines = src.split('\n');
  lines.splice(sec.line, sec.closeLine - sec.line + 1, "  section('" + sec.name + "');");
  fs.writeFileSync(tmpFile, lines.join('\n'));
  return cp.spawnSync(process.execPath, ['--check', tmpFile], { encoding: 'utf8' }).status === 0;
}

/** 带降级的裁剪：**切不中就退，绝不把破源码交出去**。
 *  口径（三层，逐层兜底）：
 *    ① 先按候选边界全裁，过 `node --check` 就收工（常态：136 个块只有个位数切不准）；
 *    ② 不过 ⇒ 逐个候选**单独试删**，把「删了会语法崩」的节挑出来，降级为只标不裁，重建；
 *    ③ 再不过 ⇒ 抛（拒裁）。**没有第四步「硬写」**。
 *  为什么值得这样麻烦：物理裁剪是本仓第一次「按行改自己的运行器」，而扫描器不是解析器。
 *  把真判据交给 `node --check`、把形态判据留给扫描器当候选，两者分工 —— 这条分工本身
 *  就是本工具存在的意义（见 `--self-test` 里「形态自证」那两条）。 */
function pruneSafe(src, needles, opt) {
  const ns = (needles || []).map(String);
  const secs = scan(src);
  const cand = secs.filter(function (s) {
    return s.block && !ns.some(function (n) { return s.name.indexOf(n) >= 0; });
  });
  const tmpFile = path.join(require('os').tmpdir(), 'wa-prune-probe-' + process.pid + '.js');
  let forbid = [];
  let r = null, degraded = [];
  try {
    for (let round = 0; round < 3; round++) {
      r = prune(src, ns, { forbid: forbid });
      fs.writeFileSync(tmpFile, r.text);
      let ok = true;
      try { check(tmpFile); } catch (e) { ok = false; }
      if (ok) { try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ } return { r: r, degraded: degraded }; }
      if (round === 2) break;
      // 定位坏节：只在本轮仍被裁的候选里找
      const still = cand.filter(function (s) { return forbid.indexOf(s.name) < 0; });
      let found = 0;
      still.forEach(function (s) {
        if (!probeOne(src, s, tmpFile)) { forbid.push(s.name); degraded.push(s.name); found += 1; }
      });
      if (!found) break;   // 找不到坏节却仍不过 ⇒ 不是「单节边界」问题，越界交给外层抛
    }
    try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ }
    if (r) { fs.writeFileSync(tmpFile, r.text); check(tmpFile); }
    try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ }
    return { r: r, degraded: degraded };
  } catch (e) {
    try { fs.unlinkSync(tmpFile); } catch (e2) { /* 已删 */ }
    throw e;
  }
}

// ── 自证：合成源真执行（不只看函数返回值）────────────────────────────
/** 造一个三节合成源并在真 Node 里跑，用**副作用探针**证明「未选中 ⇒ 真不执行」。
 *  探针口径（挑剔的那一面）：
 *    ① 选中节 B 的判据必须真跑（它的副作用文件出现）；
 *    ② 未选中且块形态的 A、C 的副作用文件**必须不出现**（不是「没打印」，是文件没有）；
 *    ③ 裸语句形态的 D：调用点被注释（打印里没有它的名字）但**节体照执行** —— 这条也要证，
 *       否则「只标不裁」就是一句没人核过的话。 */
function selfTest() {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-prune-selftest-'));
  const probe = function (n) { return "require('fs').writeFileSync(" + JSON.stringify(path.join(dir, 'hit_' + n)) + ", '1');"; };
  const src = [
    "'use strict';",
    "function section(t) { console.log('\\u25a0 ' + t); }",
    "let n = 0;",
    // 形态必须与**真源**一致（两空格缩进的独立节行）——第一次写自证就栽在这儿：
    // 合成源顶格写 section(...)，`^  section\(` 一条都不中，prune 于是「一节未裁」，
    // 四条判据同时红。教训：自证的合成源要抄真源的**形态**，不只抄语义；
    // 并把「扫描器认出了几个节」本身当成一条判据（见下面 checks 的第一条）。
    "  section('A 未选中·块形态');",
    "{",
    "  " + probe('A'),
    "  n += 1;",
    "}",
    "  section('B 选中·块形态');",
    "{",
    "  " + probe('B'),
    "  n += 10;  // 选中节必须真跑：n 只可能来自这里",
    "}",
    "  section('C 未选中·块形态');",
    "{",
    "  " + probe('C'),
    "  n += 100;",
    "}",
    "  section('D 未选中·裸语句');",
    "  " + probe('D'),
    "console.log('N=' + n);"
  ].join('\n');

  const r = prune(src, ['B 选中']);
  const outFile = path.join(dir, 'run.js');
  fs.writeFileSync(outFile, r.text);
  const chk = cp.spawnSync(process.execPath, ['--check', outFile], { encoding: 'utf8' });
  if (chk.status !== 0) throw new Error('自证：裁剪版语法检查失败 ' + chk.stderr);
  const run = cp.spawnSync(process.execPath, [outFile], { encoding: 'utf8' });
  const stdout = String(run.stdout || '');
  const has = function (n) { return fs.existsSync(path.join(dir, 'hit_' + n)); };

  const checks = [
    ['扫描器认出 4 个节（形态自证：合成源与真源同为两空格缩进）', scan(src).length === 4],
    ['块形态识别正确（A/B/C 是块、D 是裸语句）',
      scan(src).filter(function (s) { return s.block; }).length === 3],
    ['选中节 B 真执行（副作用文件在）', has('B') === true],
    ['未选中块节 A 真不执行（副作用文件不在）', has('A') === false],
    ['未选中块节 C 真不执行（副作用文件不在）', has('C') === false],
    ['未选中裸语句节 D 体仍执行（只标不裁，如实）', has('D') === true],
    ['选中节的赋值真的生效（N=10，不是 0/110）', /N=10\b/.test(stdout)],
    ['未选中块节名仍出现在读数里（可解释，不是消失）', stdout.indexOf('A 未选中') >= 0 && stdout.indexOf('C 未选中') >= 0],
    ['裁剪后行数确实下降', r.stats.outLines < r.stats.srcLines]
  ];
  fs.rmSync(dir, { recursive: true, force: true });
  const bad = checks.filter(function (c) { return !c[1]; });
  checks.forEach(function (c) { console.log((c[1] ? '  \u2713 ' : '  \u2717 ') + c[0]); });
  if (bad.length) { console.log('自证失败 ' + bad.length + ' 项'); return 1; }
  console.log('自证通过 ' + checks.length + ' / 0');
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.indexOf('--self-test') >= 0) process.exit(selfTest());
  const sel = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sel' && argv[i + 1]) sel.push(argv[++i]);
    else if (argv[i].indexOf('--sel=') === 0) sel.push(argv[i].slice(6));
  }
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_OUT;
  if (!sel.length) {
    console.log('用法：node tools/prune-sections.js --sel \'<节名子串>\' [--out f.js] [--run] | --self-test');
    process.exit(1);
  }
  const src = fs.readFileSync(RUN, 'utf8');
  const safe = pruneSafe(src, sel);
  const r = safe.r;
  console.log('■ 裁剪计划（源 ' + r.stats.srcLines + ' 行 → ' + r.stats.outLines + ' 行）');
  console.log('  选中保留 ' + r.stats.selected + ' 节：' + (r.kept.join(' | ') || '（无 —— 没人被选中，整趟会被拒）'));
  console.log('  块形态省略 ' + r.stats.omittedCount + ' 节 / ' + r.stats.omittedLines + ' 行**真不执行**');
  console.log('  只标不裁 ' + r.stats.markedCount + ' 节 / ' + r.stats.markedLines + ' 行（如实：这些行仍执行）'
    + ' —— 其中内层块 ' + r.stats.markedNested + ' 节 · 语法自证降级 ' + r.stats.markedForbidden + ' 节');
  if (safe.degraded.length) {
    console.log('  ⚠ 块边界未过语法自证、已降级为只标不裁：' + safe.degraded.join(' | '));
  }
  if (!r.kept.length) { console.log('✗ 选区没有命中任何节 ⇒ 拒裁（跑一个空的本子没有意义）'); process.exit(3); }
  try {
    fs.writeFileSync(out, r.text);
    check(out);
    console.log('  ✓ 落盘 ' + path.relative(ROOT, out) + ' 并通过 node --check');
  } catch (e) {
    try { fs.unlinkSync(out); } catch (e2) { /* 已删/未写 */ }
    console.log('✗ ' + e.message);
    process.exit(2);
  }
  if (argv.indexOf('--run') >= 0) {
    const run = cp.spawnSync(process.execPath, [out], {
      cwd: ROOT, encoding: 'utf8',
      env: Object.assign({}, process.env, { WA_O6_PRUNED: '1' })
    });
    console.log('  ↳ 执行裁剪版：exit ' + run.status);
    try { fs.unlinkSync(out); } catch (e) { /* 已删 */ }
    process.exit(run.status === null ? 4 : run.status);
  }
}

// v2.187.0（O6 收口）：`pruneSafe` 一并导出 —— 门禁要在**真实调用形态**上做真源码破坏
//   与两向自证（摘掉「块节被省略」那一行后，降级链必须真的动起来）。
//   只导出 `prune` 会把门禁护在另一半上：`prune` 是「老实人」版本，
//   语法兜底与自动降级都发生在 `pruneSafe` 里，而 `main()` 走的正是它。
module.exports = {
  scan: scan, prune: prune, pruneSafe: pruneSafe, check: check,
  braceDelta: braceDelta, RUN: RUN
};
if (require.main === module) main();