#!/usr/bin/env node
// WorldAxis tests/dup-decl-gate.js — 重复定义门禁（把「补丁重跑」这类事故变成判据）
//
// 缺口（它治什么）：
//   v2.73.0 交付后复查发现：往 tests/product-files.js 插入 testFiles 的那只补丁**被执行了两次**，
//   同一个函数连同它的 JSDoc 在文件里出现了两遍（:89 与 :107）。而**三道门禁全绿**
//   （全量回归 6528/0、死子面门禁绿、清册绿）——因为 JS 允许重复的顶层 function 声明，
//   后者**静默覆盖**前者；本例两份实现逐字相同、行为等价，所以运行期完全无感。
//   这是一个「运行时不可见、只能静态看见」的缺陷，而静态面此前没有任何判据。
//
//   不只洁癖：真正的危害在**两份实现不同**的那天——谁生效取决于声明顺序，
//   而读的人、改的人看到的可能是另一份（「我改了怎么没生效」的经典来源）。
//   （同族先例：v2.43.0 治「同一件事在四处各写一遍」，v2.71.0 治「无幂等保护的文档补丁」）
//
// 三条判据：
//   A. 顶层声明重名：同一文件内，缩进为 0 的 function / const / let / var 同名两次。
//      顶层重名没有任何合法用法——要么是重跑，要么是手滑。看**真代码面**（注释里的举例不算）。
//   B. 重复 JSDoc 块：同一文件内两段完全相同的 JSDoc（正文 ≥ JSDOC_MIN 字符）。
//      这是「补丁重跑」的**指纹**——重跑的补丁会把说明块一起复制，而人不会写两段一模一样的。
//      看**原文面**：真代码面里注释已被剥离，在它上面扫 JSDoc 恒为 0。
//      （本版首跑就踩过这一坑，靠 D 段的反空转下限才抓住——判据的输入面必须与它要观测的东西同面。）
//   C. 同名同体的函数声明：名字相同、**函数体逐字相同**的 function 声明出现两次。
//      限定「同体」是为了只看得出重跑，不把「两个不同作用域里的同名小助手」误判（那是合法代码）。
//      不限定作用域，因为真正的作用域解析在这里不可靠（本仓 180 个文件里既有 IIFE 也有裸顶层，
//      字符串与正则里的花括号也会干扰朴素括号计数；v2.74.0 试过深度法，本仓原文净差最大到 78）。
//      判据宁窄勿宽：只看自证得了的那一种。
//
// 反空转（判据不得在空集上恒真）：
//   D. 扫描面下限。文件数 / 顶层声明数 / JSDoc 块数都必须足够大，
//      否则「零告警」只说明扫描器没在工作。下限定得比现场低得多（现场约 180 / 1400 / 311），
//      只对「扫描面塔掉」敏感。
//
// 复用的判据：文件面 = tests/product-files.js 的 repoFiles()（全仓 .js，含 tests/ 与 tools/），
//   真代码面 = tests/inventory.js 的 codeFace()。两者都是单一真源，本文件不另写一份。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const { repoFiles } = require('./product-files.js');
const inventory = require('./inventory.js');

// 顶层声明（缩进为 0）
const TOP_DECL_RE = /^(function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/;
// 函数声明（任意缩进）
const FN_RE = /^(\s*)function\s+([A-Za-z_$][\w$]*)\s*\(/;
// JSDoc 块
const JSDOC_RE = /\/\*\*([\s\S]*?)\*\//g;
const JSDOC_MIN = 80;

// 反空转下限（现场约 180 文件 / 1400 顶层声明 / 311 JSDoc 块，远高于此）
const MIN_FILES = 100;
const MIN_TOP_DECLS = 200;
const MIN_JSDOCS = 60;

/**
 * 取出「函数体」文本。
 * 关键是先配平参数列表再找函数体的左花括号：`function f(a, opts = {}) { ... }` 里
 * 参数默认值就是一个花括号，朴素地「找第一个 {」会把函数体截断成 `function f(a, opts = {}`，
 * 于是同体判定对这类函数失效（现仓 6 处默认对象参数，暂无重名，是隐雷）。
 * 花括号配对时跳过字符串/模板/注释，避免字面量里的花括号把深度带偏。
 */
function bodyOf(code, fromIdx) {
  const p = code.indexOf('(', fromIdx);
  if (p < 0) return '';
  let d = 0, j = p;
  for (; j < code.length; j++) {
    if (code[j] === '(') d++;
    else if (code[j] === ')') { d--; if (d === 0) break; }
  }
  let i = code.indexOf('{', j + 1);
  if (i < 0) return '';
  const start = i;
  let depth = 0, state = 0;
  for (; i < code.length; i++) {
    const c = code[i], n = code[i + 1];
    if (state === 0) {
      if (c === "'") state = 1;
      else if (c === '"') state = 2;
      else if (c === '`') state = 3;
      else if (c === '/' && n === '/') { state = 4; i++; }
      else if (c === '/' && n === '*') { state = 5; i++; }
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return code.slice(fromIdx, i + 1); }
    } else if (state === 1) { if (c === '\\') i++; else if (c === "'") state = 0; }
    else if (state === 2) { if (c === '\\') i++; else if (c === '"') state = 0; }
    else if (state === 3) { if (c === '\\') i++; else if (c === '`') state = 0; }
    else if (state === 4) { if (c === '\n') state = 0; }
    else if (state === 5) { if (c === '*' && n === '/') { state = 0; i++; } }
  }
  return code.slice(fromIdx, start + 1);
}

/**
 * 归一化函数体，用于「同名同体」比对。
 * 只做一件事：按**最小公共缩进**去掉行首缩进（同一段代码嵌在不同层级时仍能对上）。
 * 刻意**不**把连续空白折叠成一个空格——真代码面的字符串字面量是被「等长空白」抹掉的，
 * 一折叠，「字面量长度不同」的两份代码就看成同一份，于是产出假阳性
 * （现仓 tests/run.js 的 section 正是这种形状：一份写 '\n■ '、一份写 '\n\u25a0 '，
 *  运行结果一样、源码不是同一份，不该报）。判据宁窄勿宽。
 */
function normBody(body) {
  const lines = body.split('\n');
  let min = Infinity;
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const m = lines[i].match(/^[ \t]*/)[0].length;
    if (m < min) min = m;
  }
  if (min === Infinity) min = 0;
  return lines.map(function (l, i) {
    return i === 0 ? l.replace(/^[ \t]*/, '') : l.slice(min);
  }).join('\n');
}

// 单文件扫描。code 为真代码面；raw 为原文
function scanCode(code, rel, raw) {
  const out = [];
  const lines = code.split('\n');
  // 行首偏移预计算。不能拿 split/join 的长度当偏移：join 会少一个换行，提取就错位。
  const off = new Array(lines.length);
  let acc = 0;
  for (let i = 0; i < lines.length; i++) { off[i] = acc; acc += lines[i].length + 1; }

  // A. 顶层声明重名
  const topSeen = Object.create(null);
  lines.forEach(function (line, i) {
    const m = TOP_DECL_RE.exec(line);
    if (!m) return;
    const name = m[2] || m[3];
    if (topSeen[name] !== undefined) out.push({ kind: 'top-decl-dup', rel: rel, name: name, first: topSeen[name], again: i + 1 });
    else topSeen[name] = i + 1;
  });

  // B. 重复 JSDoc 块（看 raw）
  const docSeen = Object.create(null);
  const src = raw === undefined ? code : raw;
  const re = new RegExp(JSDOC_RE.source, 'g');
  let dm;
  while ((dm = re.exec(src))) {
    const body = dm[1].replace(/\s+/g, ' ').trim();
    if (body.length < JSDOC_MIN) continue;
    const ln = src.slice(0, dm.index).split('\n').length;
    if (docSeen[body] !== undefined) out.push({ kind: 'jsdoc-dup', rel: rel, name: body.slice(0, 40) + '\u2026', first: docSeen[body], again: ln });
    else docSeen[body] = ln;
  }

  // C. 同名同体的函数声明
  // 缩进不参与签名、但空白长度参与：`bodyOf` 从行首切起，缩进靠 normBody 的「最小公共缩进」消掉；
  // 其余空白原样保留，所以「只差字面量长度」的两份不会被误判成同一份。
  const fnSeen = Object.create(null);
  lines.forEach(function (line, i) {
    const m = FN_RE.exec(line);
    if (!m) return;
    const name = m[2];
    const body = bodyOf(code, off[i]);
    const sig = name + '\u0000' + normBody(body);
    if (fnSeen[sig] !== undefined) out.push({ kind: 'fn-body-dup', rel: rel, name: name, first: fnSeen[sig], again: i + 1 });
    else fnSeen[sig] = i + 1;
  });

  return { out: out, topDecls: Object.keys(topSeen).length, jsdocs: Object.keys(docSeen).length };
}

/** 全仓扫描。root 可注入，便于在副本上做行为级负向自证。 */
function scan(root) {
  const rootDir = root || BASE;
  const files = repoFiles(rootDir);
  const problems = [];
  let topDecls = 0, jsdocs = 0;
  files.forEach(function (rel) {
    let src;
    try { src = fs.readFileSync(path.join(rootDir, rel), 'utf8'); } catch (e) { return; }
    const r = scanCode(inventory.codeFace(src), rel, src);
    topDecls += r.topDecls;
    jsdocs += r.jsdocs;
    r.out.forEach(function (p) { problems.push(p); });
  });
  return { files: files.length, topDecls: topDecls, jsdocs: jsdocs, problems: problems };
}

/** 判据：三类重复零命中 + 扫描面不空转。 */
function judge(report) {
  const problems = [];
  if (!report || report.files < MIN_FILES) {
    problems.push({ kind: 'scan-too-narrow', detail: '文件面仅 ' + ((report && report.files) || 0) + ' 个（下限 ' + MIN_FILES + '）' });
  }
  if (!report || report.topDecls < MIN_TOP_DECLS) {
    problems.push({ kind: 'scan-too-narrow', detail: '顶层声明仅 ' + ((report && report.topDecls) || 0) + ' 条（下限 ' + MIN_TOP_DECLS + '）' });
  }
  if (!report || report.jsdocs < MIN_JSDOCS) {
    problems.push({ kind: 'scan-too-narrow', detail: 'JSDoc 块仅 ' + ((report && report.jsdocs) || 0) + ' 段（下限 ' + MIN_JSDOCS + '）' });
  }
  (report ? report.problems : []).forEach(function (p) {
    problems.push({ kind: p.kind, detail: p.rel + ' :' + p.again + ' 「' + p.name + '」与 :' + p.first + ' 重复——静默覆盖，谁生效取决于顺序' });
  });
  return { ok: problems.length === 0, problems: problems, report: report };
}

/** 一句话口径（CLI 与 tests/run.js 共用） */
function summary(report) {
  return '扫描 ' + report.files + ' 文件 · 顶层声明 ' + report.topDecls + ' · JSDoc ' + report.jsdocs + ' · 重复 ' + report.problems.length + ' 处';
}

function main() {
  const report = scan();
  const verdict = judge(report);
  console.log('■ 重复定义门禁（重名 / 重文档 / 重函数体 ⇒ 静默覆盖）');
  console.log('  ' + summary(report));
  verdict.problems.slice(0, 20).forEach(function (p) { console.log('  ✗ [' + p.kind + '] ' + p.detail); });
  if (verdict.problems.length > 20) console.log('  … 其余 ' + (verdict.problems.length - 20) + ' 处省略');
  if (verdict.ok) console.log('  ✓ 三类重复均零命中、扫描面足够宽（判据不在空集上恒真）');
  process.exitCode = verdict.ok ? 0 : 1;
}
if (require.main === module) main();

module.exports = { TOP_DECL_RE: TOP_DECL_RE, FN_RE: FN_RE, JSDOC_RE: JSDOC_RE, JSDOC_MIN: JSDOC_MIN,
  MIN_FILES: MIN_FILES, MIN_TOP_DECLS: MIN_TOP_DECLS, MIN_JSDOCS: MIN_JSDOCS,
  normBody: normBody, bodyOf: bodyOf, scanCode: scanCode, scan: scan, judge: judge, summary: summary };
