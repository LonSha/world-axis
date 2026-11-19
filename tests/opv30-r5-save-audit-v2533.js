#!/usr/bin/env node
// WorldAxis tests/opv30-r5-save-audit-v2533.js — 存档体检：只说话，不动手
//
// 这件引擎的病根不是「读档会坏」，而是**诊断与治疗长在同一个器官上**：
// save-migrate 会顺手补默认值、迁移版本、丢坏字段 —— 于是「这份存档本来是坏的」
// 这件事永久消失，读档者拿到的永远是一份「看起来正常」的世界。
// 最容易的假绿是「体检顺手把缺的补上，于是体检通过」：样本能过，代价是报告与存档
// 对不上、同一个人两次体检结论不同。
// 所以本锁钉的是否定面：不 mutate、不补默认值、不迁移版本、缺≠坏分开报、版本不猜。
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
  if (src.indexOf(from) < 0) { a(false, '负控制锚点存在：' + from.slice(0, 40)); return; }
  fn(loadFile(rel, src.split(from).join(to)), rel);
}
const ENG = 'engines/save-audit.js';
const m0 = loadFile(ENG);
const SA = m0.wa.saveAudit;
const SPEC = { require: ['version', 'clock', 'actors'], types: { clock: 'object', actors: 'array' }, versionKey: 'version', knownVersions: ['2', '3'] };
const GOOD = { version: '3', clock: { day: 12 }, actors: [] };

console.log('\n── 装载与基本形态 ──');
{
  a(!!SA, 'A1 模块已挂载 WA.saveAudit');
  a(m0.regs.length === 1 && m0.regs[0].rel === ENG, 'A2 只注册一次且名对', m0.regs);
  a(m0.threw === null, 'A3 装载不抛', m0.threw);
  const r = SA.audit(GOOD, SPEC);
  a(r.ok === true && r.problems.length === 0, 'A4 合法存档零问题', r.problems);
  a(SA.audit(null, SPEC).problems[0].code === 'bad-blob', 'A5 null ⇒ bad-blob');
  a(SA.audit([], SPEC).problems[0].code === 'bad-blob', 'A6 数组不是存档 ⇒ bad-blob');
  a(SA.audit('x', SPEC).problems[0].code === 'bad-blob', 'A7 字符串 ⇒ bad-blob');
  a(SA.audit(GOOD, {}).ok === true, 'A8 空 spec ⇒ 不擅自加规则（ok 通过）');
  a(SA.audit(GOOD, SPEC).counts.keys === 3, 'A9 counts.keys 现算顶层键数', SA.audit(GOOD, SPEC).counts);
  a(SA.audit(GOOD, {}).version === null, 'A10 没要求版本时不回填版本号');
}

console.log('\n── 缺 ≠ 坏：同一个病因只报一次 ──');
{
  const bad = { clock: {}, actors: {} };
  const r = SA.audit(bad, SPEC);
  const codes = r.problems.map(function (p) { return p.path + ':' + p.code; });
  a(codes.indexOf('version:missing') >= 0, 'B1 缺必填键 ⇒ missing（不是 bad-type）', codes);
  a(codes.indexOf('actors:bad-type') >= 0 && codes.indexOf('actors:missing') < 0, 'B2 在的键类型错 ⇒ bad-type', codes);
  const r2 = SA.audit({ actors: [] }, SPEC);
  a(r2.problems.filter(function (p) { return p.path === 'version'; }).length === 1,
    'B3 缺的键即使也列在 types 里，也只报一次（不重复计红）', r2.problems);
  a(SA.audit({ x: null }, { types: { x: 'object' } }).problems[0].code === 'bad-type', 'B4 null 不等于 object');
  a(SA.audit({ x: {} }, { types: { x: 'array' } }).problems[0].code === 'bad-type', 'B5 对象不等于 array');
  a(SA.audit(GOOD, { forbid: ['cheat'] }).ok === true, 'B6 不含禁用键时不报');
  a(SA.audit({ cheat: 1 }, { forbid: ['cheat'] }).problems[0].code === 'forbidden', 'B7 含禁用键 ⇒ forbidden');
  const p = SA.audit(GOOD, SPEC).problems;
  a(Array.isArray(p) && p.length === 0, 'B8 空问题时回空数组（调用方不必写两种取法）');
  const one = SA.audit({ clock: {} }, { types: { clock: 'array' } }).problems[0];
  a(Object.keys(one).sort().join(',') === 'actual,code,expected,path', 'B9 每条问题恒四栏', Object.keys(one));
  const paths = SA.audit({ clock: 1, actors: 1 }, { require: ['zzz', 'aaa'], types: { clock: 'object', actors: 'array' }, versionKey: 'version' }).problems
    .map(function (x) { return x.path; });
  a(paths.join(',') === paths.slice().sort().join(','), 'B10 problems 按 path 字典序（同输入同输出）', paths);
  a(SA.audit({ n: 1 }, { types: { n: 'string' } }).problems[0].actual === 'number', 'B11 actual 用可读类型名（number 而不是 object）');
}

console.log('\n── 版本不猜 ──');
{
  const rv = SA.audit({ clock: {} }, { require: ['clock'], versionKey: 'version' });
  a(rv.problems.filter(function (p) { return p.code === 'missing-version'; }).length === 1,
    'C1 要求查版本但存档没版本号 ⇒ missing-version（版本键不在 require 里时才走这条）', rv.problems);
  const rv2 = SA.audit({ clock: {} }, SPEC);
  a(rv2.problems.filter(function (p) { return p.path === 'version'; }).length === 1,
    'C1b 版本键已是必填时只报 missing 一条（不重复报 missing-version）', rv2.problems.filter(function (p) { return p.path === 'version'; }));
  const r = SA.audit({ version: '9', clock: {}, actors: [] }, SPEC);
  a(r.problems.some(function (p) { return p.code === 'unknown-version'; }), 'C2 版本不在已知表 ⇒ unknown-version', r.problems);
  a(r.version === '9', 'C3 未知版本照原样回报（不改写成「最近版本」）', r.version);
  a(SA.audit({ version: '3', clock: {}, actors: [] }, SPEC).ok === true, 'C4 已知版本通过');
  a(SA.audit({ version: '9', clock: {}, actors: [] }, { require: [], versionKey: 'version' }).ok === true,
    'C5 没给 knownVersions ⇒ 不判未知（没有标准就不判）');
  const blob = { version: '9', clock: {}, actors: [] };
  SA.audit(blob, SPEC);
  a(blob.version === '9', 'C6 体检不迁移版本（存档一字未变）', blob.version);
  a(SA.audit({ clock: {}, actors: [] }, { versionKey: '', require: [] }).ok === true,
    'C7 versionKey 为空串 ⇒ 不查版本（不猜键名）');
}

console.log('\n── 只读不修 / 可复算 / 读数 ──');
{
  const frozen = Object.freeze({ version: '3', clock: Object.freeze({ day: 1 }), actors: Object.freeze([]) });
  let threw = null;
  try { SA.audit(frozen, SPEC); } catch (e) { threw = String(e && e.message); }
  a(threw === null, 'D1 冻结存档上体检不抛（证明没写它）', threw);
  const blob = { version: '3', clock: { day: 1 }, actors: [{ id: 'a' }] };
  const before = JSON.stringify(blob);
  SA.audit(blob, SPEC);
  a(JSON.stringify(blob) === before, 'D2 深层也不 mutate');
  const r1 = JSON.stringify(SA.audit(blob, SPEC));
  const r2 = JSON.stringify(SA.audit(blob, SPEC));
  a(r1 === r2, 'D3 同输入同输出');
  a(SA.audit(blob, SPEC).counts.bytes === JSON.stringify(blob).length, 'D4 counts.bytes 与序列化长度同源');
  const circ = { version: '3' };
  circ.self = circ;
  const rc = SA.audit(circ, { require: [] });
  a(rc.counts.bytes === -1 && rc.problems.some(function (p) { return p.code === 'unserializable'; }),
    'D5 循环引用 ⇒ unserializable 且 bytes=-1（不抛）', rc.problems);
  const many = {};
  const need = [];
  for (let i = 0; i < 70; i++) { need.push('k' + i); }
  const rm = SA.audit(many, { require: need });
  a(rm.problems.length === 64 && rm.problemCount === 70 && rm.truncated === true,
    'D6 超上限截断，但 problemCount 报全量（不假装只有 64 个问题）', [rm.problems.length, rm.problemCount]);
  const s0 = SA.stat();
  SA.audit(GOOD, SPEC); SA.audit({}, SPEC);
  const s1 = SA.stat();
  a(s1.calls === s0.calls + 2 && s1.ok === s0.ok + 1 && s1.rejected === s0.rejected + 1,
    'D7 stat 计数器随调用走', [s0, s1]);
  a(SA.stat().calls === s1.calls, 'D8 stat 只读（再取一次不改计数）');
  const src = RD(ENG);
  a(src.indexOf('WA.store') < 0 && src.indexOf('localStorage') < 0, 'D9 源码零 store / 零本地存储');
  a(src.split('registerModule').length - 1 === 2, 'D10 尾调 registerModule 恰一处');
}

console.log('\n── 负控制：拆掉判据，上面必须现形 ──');
negCtl(ENG, '      if (!has(k)) return;', '      if (false) return;', function (mm) {
  const r = mm.wa.saveAudit.audit({ clock: {} }, SPEC);
  a(r.problems.filter(function (p) { return p.path === 'actors'; }).length === 2,
    'E1 负控制：不再跳过缺键时，同一个病因会报两遍（B3 不是空断言）', r.problems.filter(function (p) { return p.path === 'actors'; }));
});
negCtl(ENG, '        if (known && known.indexOf(version) < 0) {', '        if (false) {', function (mm) {
  const r = mm.wa.saveAudit.audit({ version: '9', clock: {}, actors: [] }, SPEC);
  a(!r.problems.some(function (p) { return p.code === 'unknown-version'; }),
    'E2 负控制：不查已知表时未知版本被放行（C2 不是空断言）', r.problems);
});
negCtl(ENG, '    problems.sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });', '    void 0;', function (mm) {
  const r = mm.wa.saveAudit.audit({ x: 1 }, { require: ['q', 'b', 'y'] });
  a(r.problems.map(function (p) { return p.path; }).join(',') === 'q,b,y',
    'E3 负控制：不去排序时顺序随入参漂（B10 不是空断言）', r.problems.map(function (p) { return p.path; }));
});
negCtl(ENG, "      if (has(k)) problems.push(four(String(k), 'forbidden', '不含该键', 'present'));", '      void 0;', function (mm) {
  const r = mm.wa.saveAudit.audit({ cheat: 1 }, { forbid: ['cheat'] });
  a(r.ok === true, 'E4 负控制：不查禁用键时污染存档被放行（B7 不是空断言）', r.problems);
});
negCtl(ENG, "    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {", '    if (!blob) {', function (mm) {
  const r = mm.wa.saveAudit.audit([], SPEC);
  a(r.problems[0].code !== 'bad-blob', 'E5 负控制：不拦数组时它被当存档体检（A6 不是空断言）', r.problems[0]);
});
console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);