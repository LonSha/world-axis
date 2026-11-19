#!/usr/bin/env node
// WorldAxis tests/opv29-z6-factage-jsonrepair-v2529.js — 事实老化分层 + 脆 JSON 修复
//
// 这两件的共同病根是「读数被当成结论」：
//   · 事实老化 —— 最容易的假绿是「按阈值分档，缺时间戳的一律当最老」，数字很好看，
//     代价是一份没带时间戳的老档全体阵亡；
//   · JSON 修复 —— 最容易的假绿是「正则一把梭把单引号/逗号/注释全换掉」，样本能过，
//     代价是 `"http://a//b"` 被当成注释截断、已经合法的 JSON 被改坏。
// 所以本锁钉的是**否定面**：不该动的没动、缺证据的不判死、修不了的说修不了。
// 每条关键断言都配一处**负控制**：把引擎里对应的判据改坏，断言必须变红。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
function mkSandbox() {
  const win = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  const sb = {
    window: win, console: win.console,
    JSON: JSON, Math: Math, Object: Object, Array: Array, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite
  };
  win.WorldAxis = { registerModule: function (n, m) { (win.__regs = win.__regs || []).push({ rel: n, meta: m }); } };
  sb.WA = win.WorldAxis;
  return sb;
}
function loadFile(rel, srcOverride) {
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  try {
    vm.runInContext(srcOverride === undefined ? RD(rel) : srcOverride, ctx, { filename: rel });
  } catch (e) { return { wa: sb.WA, threw: String(e && e.message) }; }
  return { wa: sb.WA, regs: sb.window.__regs || [], threw: null };
}
function negCtl(rel, from, to, fn) {
  const src = RD(rel);
  if (src.indexOf(from) < 0) { a(false, '负控制锚点存在：' + rel + ' :: ' + from.slice(0, 30)); return; }
  const m = loadFile(rel, src.split(from).join(to));
  fn(m, rel);
}

// ══════════ 一、事实老化分层 ══════════
console.log('\n── 事实老化：分层与缺证据 ──');
{
  const m = loadFile('engines/fact-age.js');
  const FA = m.wa.factAge;
  a(!!FA, 'A1 模块已挂载 WA.factAge');
  a(m.regs.length === 1 && m.regs[0].rel === 'engines/fact-age.js', 'A2 只注册一次且名对', m.regs);
  a(FA.classify(0) === 'fresh' && FA.classify(19) === 'fresh', 'A3 阈值下界：0/19 是 fresh');
  a(FA.classify(20) === 'aging', 'A4 边界闭区间：age===aging 归 aging（不是 fresh）', FA.classify(20));
  a(FA.classify(60) === 'stale' && FA.classify(120) === 'dead', 'A5 60→stale、120→dead');
  a(FA.classify(-5) === 'fresh', 'A6 负数 age（时钟回退）按 0');
  a(FA.classify(NaN) === 'unknown' && FA.classify(undefined) === 'unknown', 'A7 非有限 age 是 unknown 不是 dead');
  const before = FA.getSettings();
  const after = FA.setSettings({ aging: 70 });
  a(after.aging === 20 && after.stale === 60, 'A8 乱序阈值被回绝（aging>stale），不就地接受', after);
  a(FA.stat().faults === 1, 'A9 回绝记一次 fault', FA.stat());
  FA.setSettings({ aging: 10, stale: 60, dead: 120 });
  a(FA.getSettings().aging === 10 && FA.classify(10) === 'aging', 'A10 合法阈值被采纳');
  FA.setSettings(before);
  const facts = [
    { id: 'a', lastTurn: 100 }, { id: 'b', lastTurn: 95 }, { id: 'c', lastTurn: 30 },
    { id: 'd', lastTurn: 0 }, { id: 'e' }, { id: 'f', lastTurn: 'nope' }
  ];
  const p = FA.plan(facts, 100);
  a(p.rows.length === 6, 'A11 plan 不丢条目', p.rows.length);
  a(p.rows.map(function (r) { return r.id; }).join(',') === 'a,b,c,d,e,f', 'A12 plan 保持输入顺序');
  a(p.counts.unknown === 2 && p.counts.fresh === 2 && p.counts.stale === 2 && p.counts.aging === 0 && p.counts.dead === 0,
    'A13 各档计数对（unknown 2：无时间戳与时间戳非法）', p.counts);
  a(p.rows[4].age === null && p.rows[4].level === 'unknown', 'A14 缺 lastTurn 的条目 age=null 且不判 dead', p.rows[4]);
  a(p.ids.unknown.join(',') === 'e,f', 'A15 unknown 名单可追溯', p.ids);
  const zero = FA.plan([], 100);
  a(zero.rows.length === 0 && zero.counts.fresh === 0 && zero.counts.unknown === 0, 'A16 空输入不产出幽灵档');
  const noNow = FA.plan(facts, NaN);
  a(noNow.counts.unknown === 6 && noNow.now === null, 'A17 nowTurn 无效时全体 unknown（不猜）', noNow.counts);
  // 负控制：把边界 >= 改成 >，A4 必须变红
  negCtl('engines/fact-age.js', 'if (a >= settings.aging) return', 'if (a > settings.aging) return', function (mm) {
    a(mm.wa.factAge.classify(20) === 'fresh', 'A18 负控制：边界判据改 >= 为 > 后 age=20 落到 fresh（A4 不是空断言）');
  });
}

// ══════════ 二、脆 JSON 修复 ══════════
console.log('\n── 脆 JSON：只改动真的坏掉的地方 ──');
{
  const m = loadFile('engines/json-repair.js');
  const JR = m.wa.jsonRepair;
  a(!!JR, 'B1 模块已挂载 WA.jsonRepair');
  a(m.regs.length === 1 && m.regs[0].rel === 'engines/json-repair.js', 'B2 只注册一次且名对', m.regs);
  const legal = '{"a":1,"u":"http://a//b","s":"it\'s","e":"\\u0041"}';
  const r0 = JR.parse(legal);
  a(r0.ok === true && r0.fixes.length === 0, 'B3 合法 JSON 零改动（fixes 为空）', r0.fixes);
  a(r0.text === legal, 'B4 合法 JSON 逐字未动（转义序列没被重写）');
  a(r0.value.u === 'http://a//b' && r0.value.s === "it's" && r0.value.e === 'A', 'B5 合法样本值正确');
  const r1 = JR.parse('{"a":1,}');
  a(r1.ok === true && r1.value.a === 1, 'B6 尾逗号可修');
  a(r1.fixes.indexOf('去尾逗号') >= 0, 'B7 尾逗号修复有登记', r1.fixes);
  const r2 = JR.parse('```json\n{"a":1}\n```');
  a(r2.ok === true && r2.value.a === 1 && r2.fixes.indexOf('去 ``` 围栏') >= 0, 'B8 围栏可脱且登记', r2.fixes);
  const r3 = JR.parse('{"a":1, /* 注释 */ "u":"http://x"}');
  a(r3.ok === true && r3.value.u === 'http://x', 'B9 去注释但不动字符串里的 //', r3);
  const r4 = JR.parse("{'a':'it\\'s'}");
  a(r4.ok === true && r4.value.a === "it's", 'B10 单引号串可转（含转义单引号）', r4);
  const r5 = JR.parse('{name:"x",list:[1,2,]}');
  a(r5.ok === true && r5.value.name === 'x' && r5.value.list.length === 2, 'B11 裸键补引号 + 尾逗号同时生效', r5);
  const r6 = JR.parse('这不是 JSON');
  a(r6.ok === false && r6.value === undefined, 'B12 修不了就说修不了（ok=false 且 value=undefined）', r6);
  let threw = null;
  try { JR.repair('{{{{'); } catch (e) { threw = e; }
  a(threw === null, 'B13 修不好不抛（调用方还拿得到原文）', threw && String(threw.message));
  const r7 = JR.repair('{"a":1,}');
  a(r7.ok === true && typeof r7.text === 'string' && r7.text.indexOf(',}') < 0, 'B14 repair 返回规范化文本');
  // 负控制：去掉字符串边界识别，B9 的 // 样本必须被截坏
  negCtl('engines/json-repair.js', "if (c === '\"' || c === \"'\") { inStr = true; q = c; out += c; i++; continue; }",
    'if (false) { inStr = true; }', function (mm) {
      const bad = mm.wa.jsonRepair.parse('{"a":1, /* c */ "u":"http://x"}');
      a(bad.ok === false, 'B15 负控制：不认字符串边界时该样本修不了（B9 不是空断言）', bad.fixes);
    });
  negCtl('engines/json-repair.js', 'return { ok: true, value: JSON.parse(src), fixes: [], text: src };',
    'return { ok: true, value: JSON.parse(src), fixes: [\'硬报\'], text: src };', function (mm) {
      a(mm.wa.jsonRepair.parse('{"a":1}').fixes.length === 1, 'B16 负控制：先试原样这一步真的在（改了它 fixes 立刻非空）');
    });
}

console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
