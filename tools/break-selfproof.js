#!/usr/bin/env node
// WorldAxis tools/break-selfproof.js — 「破坏点必须自证真的改到了」读数器（v2.569.0，OPV31-B1）
//
// ── 它治什么（先看现场，再谈判据）────────────────────────────────────
//   仓库里的「负控制」大量是这么写的：
//       const broken = CODE.replace('<一段源码>', '<改坏后的源码>');
//       …断言 bad 里应该出现 B1…
//   整条链只在**锚点真打中**时才成立。锚点漂了（源码改字、缩进变动、多行拼接错位、
//   原文被谁重排过），replace 原封不动返回**原文**，broken === CODE，
//   而「破坏后判据必须红」的断言**照样能亮绿** —— 因为判据压根没被破坏。
//   于是负控制静默哑火：锁看起来最硬，其实一个指针都没有。
//
//   本工具不问「负控制断言写得对不对」（那要人读），只问一件机械的事：
//     **每个把源码改坏的点，有没有一句「我真的改到了」的自证？**
//
// ── 判据分四步（全部只读文本，不 require 被测锁）───────────────────
//   0 负控制语境门：锚点行前后各 4 行内必须出现负控制语义词（负控制/破坏/自证/N1..N9/
//      wreck/broken/doctored/mutated/injected）。同一处 .replace 在仓库里有两种用法：
//      1 把源码改坏（破坏点）；2 渲染模板、改写探针文本（与负控制无关）。缺席这道门，
//      2 会被全算成破坏点（本工具第一版实测有 43 个文件全是这类假阳）。
//   1 扫描面：.replace(<字符串字面量>, …)，锚点带**代码形态**（含 (){}[]=;: 之一）
//      且长度 >= 10。纯文本/短标签替换不算破坏点。
//   2 目标变量：replace 结果的赋值目标（const broken = … .replace(…) 里的 broken；
//      a = b.replace 里的 a）。认不出来（形如 vm.runInContext(SRC.replace(...)) 的内联
//      形态）时记 target=null。
//   3 自证（cert）：**必须带着那个目标变量** —— 这是本工具第一版最大的假阳来源：
//      只要窗口里出现一个 !== 就算自证，于是断言语里那句 rawTitle !== '边境密谍'
//      把一处根本没有自证的破坏点判成了合规。现口径：
//        · notStrictEqual(目标变量, 原串) / 目标变量 !== 原串 / 原串 !== 目标变量
//        · 目标变量.length === 原串.length - 被删量
//        · 目标变量.indexOf(<注入串>) >= 0
//        · if (目标变量 === 原串) throw
//        · 人写的自证话术（「自证」「破坏真发生」「恰中 1 次」「没有改变源码」…）
//        · 内联形态（无目标变量）只认最后一档：没有一句「真的改到了」的报账 ⇒ 无自证。
//      都缺 ⇒ **absent（未自证）**。未自证不等于错（很多是「破坏后的行为断言本身就依赖
//      锚点命中」，属等价自证），所以 absent **只报不判死**，由下面的额度制管住。
//      比较窗口内**先把锚点原文屏蔽**：锚点本身常含 !== 与 .length 表达式，不屏蔽就会
//      「锚点自证自己」。
//   4 缩进耦合锚点：字面量里出现换行后又跟空格/制表符。这种锚点一旦有人重排缩进就
//      整体漂移 —— 同档只报不判死，逐条点名。
//
// ── 为什么 absent 不直接判红（以及凭什么不判红是诚实的）────────────
//   「等价自证」在文本上认不出（它证明的是行为，不是字符串差异）。一律判红等于把既有
//   正确写法判成缺陷 —— 那正是本仓反复治过的「判据比事实严」的假红。
//   治法与既有裸锚额度（tools/anchor-audit.js）、面数常量同一套纪律：
//     **冻结存量 + 新增零容忍 + 逐条点名。**
//   BASELINE_ABSENT_PER_FILE 写的是「立这条判据那天的现场值」，只许降不许升；
//   **没有出现在表里的文件额度为 0**（新增锁一个未自证的破坏点都不许有）。
//   这张表就是欠账明细：表里的数不是绿，是「还没还，但已经看得见」。
//
// ── 诚实边界 ───────────────────────────────────────────────
//   · 只扫 tests/*.js（负控制的驻地）。tools/ 与 engines/ 里的 replace 不是这类判据。
//   · 先剥注释行，避免把「说明里写的 replace」算成破坏点。
//   · 字面量扫描是本文件自写的最小解释器（认反斜杠转义与 + 拼接）；正则形式的 replace
//     （斜杠开头的 /re/g）**不算破坏点**（那是格式化，不是弄坏源码）。
//   · 启发式必有假阳/假阴：每条都带 file/line/anchor/target 证据，读的人可照证据复核。
//     本工具不代替人读，只保证「有没有人核过」这件事本身有读数。
//
// ── 用法 ──────────────────────────────────────────────
//   node tools/break-selfproof.js              # 读数 + 未自证点名
//   node tools/break-selfproof.js --json       # 机器读
//   node tools/break-selfproof.js --only=xx    # 只看文件名含 xx 的
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

// 扫描面下限：低于它说明扫描器自己坏了（0 命中在空集上恒真）
const MIN_SITES = 40;

// 冻结额度：立表于 v2.569.0，现场 26 条 / 17 个文件（逐条证据见 --json 的 perFile）。
//   只许降不许升；表外文件 = 0（新增锁零容忍）。表里的数不是绿，是欠账明细。
const BASELINE_ABSENT_PER_FILE = {
  'tests/foreshadow-v2135.js': 1,
  'tests/inline-tags-v2302.js': 2,
  'tests/input-guard-v2840.js': 1,
  'tests/o6-layer-gate-v2187.js': 1,
  'tests/rel-contract-v2590.js': 1,
  'tests/rel-contract-v2600.js': 1,
  'tests/s3-b3-n3-v2221.js': 2,
  'tests/s3-b4-n10-v2228.js': 1,
  'tests/s3-e8-v2210.js': 2,
  'tests/transit-v2930.js': 1,
  'tests/undercurrent-calendar-v2268.js': 2,
  'tests/v11-pages-cats.js': 3,
  'tests/v7-drive-gate-2278.js': 1,
  'tests/v7-faction-ledger-2289.js': 2,
  'tests/v7-playable-seed-2281.js': 1,
  'tests/v7-relation-network-2288.js': 2,
};

// 0 负控制语境
const NEGCTX = /负控制|破坏|自证|wreck|broken|doctored|mutated|injected|\bN[1-9]\b/;
const NEGCTX_BEFORE = 4;
const NEGCTX_AFTER = 4;

// 代码形态：出现即认为是「源码片段」，不是普通文本标签
const CODESHAPE = /[(){}[\]=;:]/;
const MIN_ANCHOR = 10;

// 3 自证形态：{T} 是目标变量名的占位，构建时做字面替换（不用分组反转义）。
const CERT_FORMS = [
  { id: 'notStrictEqual', re: /notStrictEqual\s*\(\s*{T}\b/ },
  { id: 'var-differs', re: /\b{T}\s*[!]==\s*[A-Za-z_$][\w$]*/ },
  { id: 'orig-differs', re: /[A-Za-z_$][\w$]*\s*[!]==\s*{T}\b/ },
  { id: 'length-delta', re: /\b{T}\.length\s*(?:===|==|>=|<=)\s*[^\n;]{0,120}\.length/ },
  { id: 'inject-visible', re: /\b{T}\.(?:indexOf|includes)\s*\([^()]{1,120}\)\s*(?:>=|>|===|!==)/ },
  { id: 'throw-differs', re: /if\s*\(\s*{T}\s*[!]==\s*[A-Za-z_$][\w$]*\s*\)\s*(?:throw|\{)/ }
];
// 人写的自证话术（不需要目标变量；必须是「破坏真发生」这一类，而不是「破坏后判据红」）
const CERT_WORDS = /自证|破坏(?:真发生|已落盘|生效|未生效|没有改变|未改变)|恰中 1 次|锚点命中|锚点在真源上|注入点命中/;

// 字符串/模板字面量屏蔽：replace( 出现在字符串里（样例文本、错误消息、模板）时不是代码，
// 不能当破坏点。本工具第一版没做这件事，实测直接导致新加的那把专锁把自己报成「未自证」
// —— 因为它内部定义的样例文本里写着 replace(…)。
// 返回长度 = src.length 的字节数组，1 = 该位置在字符串/模板字面量里。
function stringMask(src) {
  const BS = String.fromCharCode(92);
  const SQ = String.fromCharCode(39);
  const DQ = String.fromCharCode(34);
  const BT = String.fromCharCode(96);
  const mask = new Uint8Array(src.length);
  const n = src.length;
  let i = 0;
  let q = 0;
  while (i < n) {
    const ch = src.charAt(i);
    if (q === 0) {
      if (ch === SQ || ch === DQ || ch === BT) { q = src.charCodeAt(i); mask[i] = 1; }
      i += 1; continue;
    }
    mask[i] = 1;
    if (ch === BS) { if (i + 1 < n) mask[i + 1] = 1; i += 2; continue; }
    if (src.charCodeAt(i) === q) q = 0;
    i += 1;
  }
  return mask;
}


function stripCommentLines(src) {
  const lines = String(src).split('\n');
  let inBlock = false;
  return lines.map(function (line) {
    if (inBlock) {
      const end = line.indexOf('*/');
      if (end < 0) return '';
      inBlock = false;
      return line.slice(end + 2);
    }
    const t = line.trim();
    if (t.indexOf('/*') === 0) {
      if (line.indexOf('*/', line.indexOf('/*') + 2) < 0) inBlock = true;
      return '';
    }
    if (t.indexOf('//') === 0) return '';
    return line;
  });
}

// 从 ( 之后读第一个参数：字符串字面量（允许 + 拼接多个字面量）。
// 返回 { text } 或 null（第 1 参数不是字面量 ⇒ 不是破坏点）。
function readFirstLiteral(src, i) {
  const BS = String.fromCharCode(92);
  let p = i;
  const n = src.length;
  let text = '';
  let sawAny = false;
  while (p < n) {
    while (p < n && /\s/.test(src[p])) p += 1;
    const q = src[p];
    if (q !== "'" && q !== '"' && q !== '`') break;
    sawAny = true;
    p += 1;
    let buf = '';
    while (p < n) {
      const c = src[p];
      if (c === BS) { buf += src.substr(p, 2); p += 2; continue; }
      if (c === q) { p += 1; break; }
      if (q === '`' && c === '$' && src[p + 1] === '{') return null;
      buf += c; p += 1;
    }
    text += buf;
    let k = p;
    while (k < n && /\s/.test(src[k])) k += 1;
    if (src[k] === '+') { p = k + 1; continue; }
    break;
  }
  if (!sawAny) return null;
  return { text: text };
}

function unescapeLit(s) {
  const BS = String.fromCharCode(92);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === BS && i + 1 < s.length) {
      const d = s[i + 1];
      out += (d === 'n' ? '\n' : d === 't' ? '\t' : d === 'r' ? '\r' : d);
      i += 2;
    } else { out += c; i += 1; }
  }
  return out;
}

// 目标变量：replace 表达式左侧的赋值目标。认不出返回 null。
function targetOf(src, at) {
  const back = src.slice(Math.max(0, at - 300), at);
  const m = /(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*[^;=(){}[\]]*$/.exec(back);
  if (!m) return null;
  const head = back.slice(0, back.length - m[0].length);
  if (/return\s*$/.test(head)) return null;
  if (/object\s*$/.test(head)) return null;
  return m[1];
}

function escRe(s) {
  const BS = String.fromCharCode(92);
  const special = '*+?^$()[]{}|.' + BS;
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    out += special.indexOf(s[i]) >= 0 ? BS + s[i] : s[i];
  }
  return out;
}

function audit(root) {
  const r = root || BASE;
  const dir = path.join(r, 'tests');
  if (!fs.existsSync(dir)) return { ok: false, why: 'tests-dir-missing' };
  const names = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort();
  const perFile = {};
  const sites = [];
  names.forEach(function (f) {
    let raw;
    try { raw = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return; }
    const src = stripCommentLines(raw).join('\n');
    const MASK = stringMask(src);
    const all = src.split(String.fromCharCode(10));
    let i = 0;
    while (i < src.length) {
      const at = src.indexOf('.replace(', i);
      if (at < 0) break;
      i = at + 1;                              // 先前进一格：后面任何 continue 都不会原地打转
      if (MASK[at]) continue;                  // 字符串里的 replace( 不是代码（样例文本 / 错误消息 / 模板）
      const lit = readFirstLiteral(src, at + '.replace('.length);
      if (!lit) continue;
      const text = unescapeLit(lit.text);
      if (!text || text.length < MIN_ANCHOR || !CODESHAPE.test(text)) continue;
      const line = src.slice(0, at).split('\n').length;
      const ctx = all.slice(Math.max(0, line - 1 - NEGCTX_BEFORE), line + NEGCTX_AFTER).join('\n');
      if (!NEGCTX.test(ctx)) continue;      // 0 不在负控制语境 ⇒ 不是破坏点
      const target = targetOf(src, at);
      // 3 窗口 = replace 行之后 10 行；先把锚点原文屏蔽（否则锚点自证自己）
      let win = all.slice(line - 1, line + 10).join('\n');
      win = win.split(text).join('<ANCHOR>');
      let cert = null;
      if (target) {
        const T = escRe(target);
        for (let c = 0; c < CERT_FORMS.length; c += 1) {
          const body = CERT_FORMS[c].re.source.split('{T}').join(T);
          if (new RegExp(body).test(win)) { cert = CERT_FORMS[c].id; break; }
        }
      }
      if (!cert && CERT_WORDS.test(win)) cert = 'semantic';
      const indentCoupled = /\n[ \t]/.test(text);
      sites.push({ file: 'tests/' + f, line: line, target: target,
        anchor: text.length > 60 ? text.slice(0, 60) + '…' : text, anchorLen: text.length,
        cert: cert, indentCoupled: indentCoupled });
      if (!perFile['tests/' + f]) perFile['tests/' + f] = { sites: 0, absent: 0, indentCoupled: 0 };
      perFile['tests/' + f].sites += 1;
      if (!cert) perFile['tests/' + f].absent += 1;
      if (indentCoupled) perFile['tests/' + f].indentCoupled += 1;
    }
  });
  const absentList = sites.filter(function (s) { return !s.cert; });
  const over = Object.keys(perFile).map(function (k) {
    const allow = Object.prototype.hasOwnProperty.call(BASELINE_ABSENT_PER_FILE, k)
      ? BASELINE_ABSENT_PER_FILE[k] : 0;
    return { file: k, absent: perFile[k].absent, allow: allow };
  }).filter(function (x) { return x.absent > x.allow; });
  return {
    ok: true, why: '', files: names.length,
    sites: sites.length, certified: sites.length - absentList.length,
    absent: absentList.length,
    indentCoupled: sites.filter(function (s) { return s.indentCoupled; }).length,
    inlineNoTarget: sites.filter(function (s) { return !s.target; }).length,
    minSites: MIN_SITES, belowFloor: sites.length < MIN_SITES,
    baselinePerFile: BASELINE_ABSENT_PER_FILE, perFile: perFile, over: over,
    absentList: absentList, indentList: sites.filter(function (s) { return s.indentCoupled; })
  };
}

function render(res, only) {
  const out = [];
  out.push('破坏点自证读数（OPV31-B1）');
  out.push('  装载面 ' + res.files + ' 个测试文件 · 破坏点 **' + res.sites + '** 处' +
    '（过 0 负控制语境门 + 代码形态锚点，长度 >= ' + MIN_ANCHOR + '）');
  out.push('  已自证 **' + res.certified + '** · 未自证 **' + res.absent + '** · ' +
    '缩进耦合锚点 **' + res.indentCoupled + '** · 内联形态（无目标变量）' + res.inlineNoTarget);
  if (res.belowFloor) out.push('  X 扫描面 ' + res.sites + ' < 下限 ' + res.minSites + '（0 命中在空集上恒真）');
  out.push('  额度：超额度文件 ' + res.over.length + ' 个（表外文件额度 = 0 ⇒ 新增锁零容忍）');
  res.over.slice(0, 20).forEach(function (x) {
    out.push('    超额度：' + x.file + ' 未自证 ' + x.absent + ' > 额度 ' + x.allow);
  });
  const list = only ? res.absentList.filter(function (s) { return s.file.indexOf(only) >= 0; }) : res.absentList;
  out.push('  未自证点名（前 40 / 共 ' + list.length + '）：');
  list.slice(0, 40).forEach(function (s) {
    out.push('    · ' + s.file + ':' + s.line + '  target=' + (s.target || '(inline)') +
      '  ' + s.anchor.replace(/\n/g, '\\n'));
  });
  out.push('  缩进耦合点名（共 ' + res.indentList.length + '）：');
  res.indentList.slice(0, 20).forEach(function (s) {
    out.push('    · ' + s.file + ':' + s.line + '  ' + s.anchor.replace(/\n/g, '\\n').replace(/\t/g, '\\t'));
  });
  return out.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const res = audit(BASE);
  if (argv.indexOf('--json') >= 0) { console.log(JSON.stringify(res, null, 2)); return res.ok ? 0 : 1; }
  if (!res.ok) { console.log('X ' + res.why); return 1; }
  const only = (argv.filter(function (a) { return a.indexOf('--only=') === 0; })[0] || '').slice(7);
  console.log(render(res, only));
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { audit: audit, render: render, stripCommentLines: stripCommentLines,
  readFirstLiteral: readFirstLiteral, targetOf: targetOf, unescapeLit: unescapeLit,
  CERT_FORMS: CERT_FORMS, CERT_WORDS: CERT_WORDS, CODESHAPE: CODESHAPE, NEGCTX: NEGCTX,
  NEGCTX_BEFORE: NEGCTX_BEFORE, NEGCTX_AFTER: NEGCTX_AFTER, MIN_ANCHOR: MIN_ANCHOR,
  MIN_SITES: MIN_SITES, BASELINE_ABSENT_PER_FILE: BASELINE_ABSENT_PER_FILE };
