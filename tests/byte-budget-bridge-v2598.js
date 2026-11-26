#!/usr/bin/env node
// WorldAxis tests/byte-budget-bridge-v2598.js — 字节预算体检面专锁（v2.598.0 / R273 SLT-1）
//
// 锁的是什么：本仓里「文本有多长」有两个计数法 —— `String.length` 是 UTF-16 码元数，
// 而局限（localStorage 配额 / 后端 255 字节截断 / 导出）按 UTF-8 字节。两者的差别在中文上是
// 3 倍、在 emoji 上是 2 倍（且方向不同：length 会低估中文、高估 emoji 的“字数”），
// 这就是“字符数报喜不报忧”的具体形态。本面把它变成一行读数。
//
// 四组：
//   A 静态：**真委托** slotFormat.byteLength（不自带第二套字节算法）/ 零写 / 零截断 /
//      不把文本内容带进读数 / 敏感键名整枝跳过 / 装载与面板同批登记。
//   B 行为：自造一棵含中文、emoji、5KB 长串、嵌套、数组、两个敏感键的仓 —— 10 条数字逐条对；
//      扫描上限（深度/节点）是**部分读数**且如实登记。
//   C 缺件：module-missing / no-store / no-text / unknown-name 各自报自己的原因。
//   D 现场：真渲染 / 零写实测 / 段内 0 写口 0 交互件 / 自己写明“不替你截”。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function esc(s) { return String(s == null ? '' : s); }
function render(WA) {
  WA.panelToolsPage.bind({
    esc: esc,
    foldSec: function (p, sec, label, body) { return '[' + label + ']' + ((typeof body === 'function') ? body() : body); }
  });
  return String(WA.panelToolsPage.renderTools() || '');
}

/** 自造仓：中文 3 字节 / emoji 4 字节（length 2）/ 5KB 长串 / 嵌套 / 数组 / 两个敏感键。 */
function seed() {
  const long = new Array(5000 + 1).join('x');
  return {
    a: 'ascii',
    b: '中文四字',
    c: '\uD83D\uDE00',
    long: long,
    nest: { deep: { text: '中' } },
    arr: ['一', '二'],
    secretKey: 'VERYSECRETVALUE-should-never-appear',
    settings: { apiKey: 'sk-xxx-should-never-appear', token: 't-should-never-appear' }
  };
}

function stubStore(WA, value) {
  const prev = WA.store.get;
  WA.store.get = function () { return value; };
  return function () { WA.store.get = prev; };
}

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位');
  const B = WA.byteBudgetBridge;
  a(!!B, 'A0b: WA.byteBudgetBridge 在位（惰性档：本锁由 run.js 的 LOAD 面保证已装）');
  a(!!WA.slotFormat, 'A0c: 被委托方 WA.slotFormat 在位（全部字节读数的前提）');
  if (!B) return { exports: 0 };
  if (typeof B.__reset === 'function') B.__reset();

  // ── A 静态契约 ───────────────────────────────
  const src = fs.readFileSync(path.join(ROOT, 'engines/byte-budget-bridge.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  a(B.version === '2.598.0', 'A1: 版本 2.598.0（实 ' + B.version + '）');
  const EX = Object.keys(B).sort().join(',');
  a(EX === 'LIMITS,WHY,__reset,audit,diagnose,lineOf,longest,scan,slotRoom,stat,summaryText,version,whyText',
    'A2: 恰好十三导出（实 ' + EX + '）');
  a(code.indexOf('SF.byteLength(') >= 0, 'A3: 字节算法**真委托** slotFormat.byteLength');
  a(code.indexOf('0x7ff') < 0 && code.indexOf('codePointAt') < 0 && code.indexOf('0xffff') < 0,
    'A3b: 源码里没有自己的 UTF-8 分支（两套算法必然漂移）');
  a(code.indexOf('transact(') < 0 && code.indexOf('setItem(') < 0 && code.indexOf('.patch(') < 0
    && code.indexOf('store.save(') < 0, 'A4: 源码 0 处写口');
  a(code.indexOf('truncateBytes(') < 0, 'A5: 源码不调 truncateBytes（只量不截）');
  a(!/text\s*:/.test(code.replace(/textOf|context/gi, '')), 'A6: 没有叫 text 的输出字段（不把内容带进读数）');
  a(code.indexOf('sensitive(') >= 0 && code.indexOf('skipped.push') >= 0,
    'A6b: 敏感键名整枝跳过且被点名记录');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');
  const REL = "'engines/byte-budget-bridge.js'";
  a(idxSrc.split(REL).length - 1 === 1, 'A7: index.js 装载表里恰好一条');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf("'engines/slot-format.js'"), 'A7b: 排在 slot-format 之后（被委托方先装）');
  a(idxSrc.indexOf(REL) > idxSrc.indexOf('const LAZY_ORDER'), 'A7c: 登记在惰性档');
  a(runSrc.split(REL).length - 1 === 1, 'A8: tests/run.js 的 LOAD 面恰好一条');
  a(runSrc.split('./byte-budget-bridge-v2598.js').length - 1 === 1, 'A8b: run.js 里挂了一次本专锁');
  const toolsSrc = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  a(toolsSrc.indexOf("'bytebudget'") >= 0, 'A9: 工具页有 bytebudget 段');
  const segStart = toolsSrc.indexOf("foldSec('tools', 'bytebudget'");
  const segEnd = toolsSrc.indexOf("foldSec('tools', 'refine'", segStart);
  const seg = toolsSrc.slice(segStart, segEnd > segStart ? segEnd : segStart + 4000);
  a(seg.indexOf('bb.audit(') >= 0 && seg.indexOf('bb.summaryText(') >= 0, 'A9b: 段内真委托 audit + summaryText');
  a(seg.indexOf('装载失败') >= 0 && seg.indexOf('装载中') >= 0, 'A9c: 三档各自写明');
  const foldSrc = fs.readFileSync(path.join(ROOT, 'ui/panel-fold.js'), 'utf8');
  a(foldSrc.indexOf("id: 'bytebudget'") >= 0, 'A9d: 面板折叠表**同批登记**');
  const diagSrc = fs.readFileSync(path.join(ROOT, 'engines/tool-diag-tables.js'), 'utf8');
  a(diagSrc.indexOf("'engines/byte-budget-bridge.js': 'byteBudgetBridge'") >= 0, 'A10: tool-diag 表已登记');

  // ── B 行为 ───────────────────────────────────
  let un = stubStore(WA, seed());
  let s = null;
  try {
    s = B.scan({});
    a(s.ok === true && s.why === 'ok', 'B0: 自造仓扫描 ok（实 ' + s.why + '）');
    a(s.count === 7, 'B1: 量到 7 条文本（实 ' + s.count + '）');
    a(s.bytes === 5030, 'B1b: 总字节 5030（实 ' + s.bytes + '）');
    a(s.maxBytes === 5000 && s.worstPath === 'long', 'B2: 最长 5000 字节且路径是 long（实 ' + s.maxBytes + ' / ' + s.worstPath + '）');
    const byPath = {};
    s.rows.forEach(function (r) { byPath[r.path] = r; });
    a(byPath.b && byPath.b.chars === 4 && byPath.b.bytes === 12 && byPath.b.ratio === 3,
      'B3: 中文 4 字 = 12 字节 ×3（实 ' + JSON.stringify(byPath.b) + '）');
    a(byPath.c && byPath.c.chars === 2 && byPath.c.bytes === 4 && byPath.c.ratio === 2,
      'B4: emoji length 2 / 字节 4 —— 两个计数法在这里方向不同（实 ' + JSON.stringify(byPath.c) + '）');
    a(byPath['nest.deep.text'] && byPath['nest.deep.text'].bytes === 3, 'B4b: 嵌套路径可读且字节对');
    a(byPath['arr[0]'] && byPath['arr[1]'], 'B4c: 数组按索引路径报');
    a(s.overWarn === 1, 'B5: ≥4096 字节的 1 条（实 ' + s.overWarn + '）');
    const js = JSON.stringify(s);
    a(js.indexOf('VERYSECRETVALUE') < 0 && js.indexOf('sk-xxx') < 0 && js.indexOf('t-should') < 0,
      'B6: 读数 JSON 里没有敏感值');
    const sk = s.skipped.map(function (x) { return x.key; }).join(',');
    a(sk.indexOf('secretKey') >= 0 && sk.indexOf('apiKey') >= 0 && sk.indexOf('token') >= 0,
      'B6b: 三个敏感键全被点名跳过（实 ' + sk + '）');
    a(!byPath.secretKey && !byPath['settings.apiKey'] && !byPath['settings.token'],
      'B6c: 敏感枝连路径也不进 rows（长度本身也是信息）');
    a(s.scanned > 0 && s.truncated === false, 'B6d: 未触上限时 truncated=false（扫完就说扫完）');
  } finally { un(); }

  un = stubStore(WA, seed());
  try {
    const t2 = B.scan({ topN: 2 });
    a(t2.rows.length === 2, 'B7: topN 生效（实 ' + t2.rows.length + '）');
    const t3 = B.scan({ warnBytes: 100 });
    a(t3.overWarn === 1 && t3.warnBytes === 100, 'B7b: 阈值可给（100 字节 ⇒ 1 条，long）');
    const t4 = B.scan({ warnBytes: 1 });
    a(t4.overWarn === 7, 'B7c: 阈值 1 字节 ⇒ 7 条全超（实 ' + t4.overWarn + '）');
    const t5 = B.scan({ maxDepth: 1 });
    a(t5.count === 4, 'B8: maxDepth 限深 —— 只量到顶层 4 条（a/b/c/long，实 ' + t5.count + '）');
    const t6 = B.scan({ maxNodes: 2 });
    a(t6.truncated === true, 'B9: 节点上限 ⇒ truncated 为真（部分读数必须自曝）');
    a(B.lineOf(B.audit({ maxNodes: 2 })).indexOf('部分读数') > 0, 'B9b: 读数明写“这是部分读数”');
  } finally { un(); }

  un = stubStore(WA, {});
  try {
    const e1 = B.audit({});
    a(e1.why === 'no-text' && e1.ok === false, 'B10: 空仓 ⇒ no-text（实 ' + e1.why + '）');
    a(B.lineOf(e1).indexOf('真的没有') > 0, 'B10b: 读数把“真的没有”与“量不了”分开');
  } finally { un(); }

  un = stubStore(WA, { k: '', n: { t: '' } });
  try {
    a(B.audit({}).why === 'no-text', 'B10c: 只有空串也算 no-text（空串不是文本）');
  } finally { un(); }

  // slotRoom
  const r1 = B.slotRoom('张三');
  a(r1.ok === true && r1.chars === 2 && r1.bytes === 6 && r1.budget === 220 && r1.room === 214,
    'B11: 张三 2 字符/6 字节、预算 220、余量 214（实 ' + JSON.stringify(r1) + '）');
  a(r1.ratio === 3, 'B11b: 中文比值 3（余量按字节算才对得上 255 的后端上限）');
  a(B.slotRoom('').why === 'unknown-name', 'B11c: 空名字 ⇒ unknown-name（不编一个默认名）');
  const r2 = B.slotRoom(new Array(100 + 1).join('x'));
  a(r2.room === 120, 'B11d: 100 个 ASCII ⇒ 余量 120（预算 220）');

  a(B.longest(3).rows.length === 3 || B.longest(3).why !== 'ok', 'B12: longest(n) 最多 n 行');
  const dg = B.diagnose({});
  a(dg.lines.length >= 1, 'B12b: 诊断至少一行（读数）');
  a(B.whyText('no-text').indexOf('没有任何非空文本') > 0, 'B12c: whyText 认得 no-text');
  a(B.whyText('zzz').indexOf('未登记') === 0, 'B12d: 表外 why 不编一个说法');

  // ── C 缺件 ────────────────────────────────────
  const prevSF = WA.slotFormat;
  try {
    WA.slotFormat = null;
    const c1 = B.audit({});
    a(c1.why === 'module-missing', 'C1: 被委托方不在 ⇒ module-missing（实 ' + c1.why + '）');
    a(B.lineOf(c1).indexOf('不自己再写一套') > 0, 'C1b: 读数说清为何不就地算一份');
  } finally { WA.slotFormat = prevSF; }

  un = stubStore(WA, null);
  try {
    a(B.audit({}).why === 'no-store', 'C2: store 读不到 ⇒ no-store');
    a(B.lineOf(B.audit({})).indexOf('量不了') > 0, 'C2b: 读数把“量不了”与“没有长文本”分开');
  } finally { un(); }

  const c3 = B.audit({});
  a(['ok', 'no-text', 'no-store'].indexOf(c3.why) >= 0, 'C3: 环境恢复后回到真实结论（实 ' + c3.why + '）');

  // ── D 现场 ────────────────────────────────────
  un = stubStore(WA, seed());
  try {
    B.__reset();
    const html = render(WA);
    a(html.indexOf('wa-byte-line') > 0, 'D0: 段内读数容器在真渲染里出现');
    a(html.indexOf('×3') > 0 || html.indexOf('字节面') > 0, 'D0b: 真渲染里看得到字节面读数');
    a((html.match(/id="wa-byte-line"/g) || []).length === 1, 'D2: wa-byte-line 全页只一次');
    a(html.indexOf('不替你截') > 0, 'D5: 段内自己写明“只量不截”');
    // 段边界用“本面只量”收尾语定（固定窗口会溢出到旁段：旁段的按钮会被当成自己的）
    const bi = html.indexOf('字节预算');
    const be = html.indexOf('本面只量', bi);
    const btn = html.indexOf('<button', bi);
    const inp = html.indexOf('<input', bi);
    a(be > bi, 'D0c: 段有收尾声明（用它当段边界）');
    a(be > bi && (btn < 0 || btn > be), 'D4: 段内没有按钮（体检不提供“点一下变干净”）');
    a(be > bi && (inp < 0 || inp > be), 'D4b: 段内没有输入框');
  } finally { un(); }

  const toolsSrc2 = fs.readFileSync(path.join(ROOT, 'ui/pages/tools-page.js'), 'utf8');
  const s2i = toolsSrc2.indexOf("foldSec('tools', 'bytebudget'");
  const s2e = toolsSrc2.indexOf("foldSec('tools', 'refine'", s2i);
  const segSrc = toolsSrc2.slice(s2i, s2e > s2i ? s2e : s2i + 4000);
  a(segSrc.indexOf('transact(') < 0 && segSrc.indexOf('setItem(') < 0 && segSrc.indexOf('.patch(') < 0,
    'D3: 段内 0 写口');

  // 零写实测：跑完全部路径，账本逐字未变
  const seedObj = seed();
  un = stubStore(WA, seedObj);
  let before = '';
  try {
    before = JSON.stringify(seedObj);
    B.audit({}); B.scan({ topN: 3 }); B.longest(2); B.diagnose({}); B.slotRoom('张三');
    a(JSON.stringify(seedObj) === before, 'D1: 跑完全部路径后账本逐字未变（零写）');
  } finally { un(); }

  const st = B.stat();
  a(st.scans > 0 && st.rooms > 0, 'D6: 本面账记到跑过（scans ' + st.scans + ' / rooms ' + st.rooms + '）');
  a(st.last && typeof st.last.why === 'string', 'D6b: 末次体检记下了 why（实 ' + (st.last && st.last.why) + '）');
  B.__reset();
  a(B.stat().scans === 0 && B.stat().rooms === 0, 'D7: __reset 清本面计数');
  a(B.LIMITS.warnBytes === 4096 && B.MAX_NAME_BYTES === undefined,
    'D8: LIMITS 是拷的（改它不影响引擎）；MAX_NAME_BYTES 不在导出面（预算常量只有一个真源）');

  return { exports: Object.keys(B).length, scans: 1 };
}

module.exports = { runAll: runAll };
