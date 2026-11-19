#!/usr/bin/env node
// WorldAxis tests/opv30-r2-ctx-boundary-v2530.js — 上下文边界剔除
//
// 这件引擎的病根是「剥得干净」比「剥得对」更容易做到：正则一把梭就能让样本变短，
// 代价是半截块吃掉用户正文、剥完行号错位、坏规则静默当没给。
// 本锁钉的同样是否定面：配对才剥、行数守恒、幂等、坏规则必须被点名。
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
  fn(loadFile(rel, src.split(from).join(to)), rel);
}
const NL = function (s) { return s.split('\n').length - 1; };

const m0 = loadFile('engines/ctx-boundary.js');
const CB = m0.wa.ctxBoundary;

console.log('\n── 装载与规则解析 ──');
{
  a(!!CB, 'A1 模块已挂载 WA.ctxBoundary');
  a(m0.regs.length === 1 && m0.regs[0].rel === 'engines/ctx-boundary.js', 'A2 只注册一次且名对', m0.regs);
  a(m0.threw === null, 'A3 装载不抛', m0.threw);
  const r1 = CB.parseRule('后台|<<B|B>>');
  a(r1 && r1.name === '后台' && r1.open === '<<B' && r1.close === 'B>>', 'A4 三段串写法（name|open|close）', r1);
  const r2 = CB.parseRule({ name: '', open: '[[', close: ']]' });
  a(r2 && r2.name === '[[', 'A5 不给名字时用开标记兜底（读数里不至于全是空名）', r2);
  a(CB.parseRule(['x', '<x>', '</x>']).name === 'x', 'A6 数组写法');
  a(CB.parseRule('后台|<<B') === null, 'A7 段数不对是 null（不会把 close 当空串接受）');
  a(CB.parseRule('a|b|c|d') === null, 'A8 四段也是 null');
  a(CB.parseRule({ open: '', close: ']]' }) === null, 'A9 空开标记 null（空串会匹配任意位置）');
  a(CB.parseRule({ open: '##', close: '##' }) === null, 'A10 起止相同 null（配对无意义）');
  a(CB.parseRule({ open: new Array(40).join('a'), close: 'b' }) === null, 'A11 超长标记 null', null);
  a(CB.parseRule(null) === null && CB.parseRule(42) === null, 'A12 非规则形态一律 null');
  a(CB.blankLines('a\nb\n\nc') === '\n\n\n' && CB.blankLines('abc') === '', 'A13 blankLines 只回吐换行数', CB.blankLines('a\nb\n\nc'));
}

console.log('\n── 剥离：配对才剥、行数守恒、坏的要说 ──');
{
  const R = ['系统|<<S|S>>'];
  const t1 = '开场\n<<S内部指令S>>\n正文';
  const r1 = CB.scrub(t1, R);
  a(r1.removed === 1 && r1.matchedRules.length === 1, 'B1 配对的块被剥 1 块', r1);
  a(r1.text.indexOf('内部指令') < 0 && r1.text.indexOf('开场') === 0, 'B2 块内文字没了、块外原样', r1.text);
  a(r1.charsSaved === '<<S内部指令S>>'.length, 'B3 charsSaved = 实际省下的字符数', r1.charsSaved);
  a(r1.unmatched.length === 0, 'B4 都配上了就没有 unmatched');
  const t2 = '开场\n<<S只有开头\n正文';
  const r2 = CB.scrub(t2, R);
  a(r2.text === t2, 'B5 有起无收时文本逐字不动（半截块不吃正文）', r2.text);
  a(r2.removed === 0, 'B6 同上：一块都没剥');
  a(r2.unmatched.length === 1 && r2.unmatched[0].rule === '系统', 'B7 但要报出是谁在哪儿', r2.unmatched);
  a(r2.unmatched[0].at === t2.indexOf('<<S'), 'B8 unmatched.at 指向器起点（可定位）', r2.unmatched[0]);
  const t3 = 'a\n<<S一\n二\n三S>>\nb';
  const r3 = CB.scrub(t3, R);
  a(NL(r3.text) === NL(t3), 'B9 行数守恒：剥前剥后换行数相等', [NL(t3), NL(r3.text)]);
  a(r3.lines[0] === r3.lines[1], 'B10 lines 两个读数相等（判据②的直接读数）', r3.lines);
  a(r3.text === 'a\n\n\n\nb', 'B11 块内 3 个换行原样留成 3 个（楼层映射不变）', JSON.stringify(r3.text));
  const r4 = CB.scrub('<<A1A>><<A2A>><<A3A>>', ['a|<<A|A>>']);
  a(r4.removed === 3 && r4.text === '', 'B12 多块逐个剥（并列块不互相吞）');
  const t5 = 'X<<S1S>>Y<<S2S>>Z';
  const r5 = CB.scrub(t5, R);
  a(r5.text === 'X\nY\nZ'.replace(/\n/g, '') && r5.removed === 2, 'B13 块外文字按原顺序接回来', JSON.stringify(r5.text));
  const r6 = CB.scrub('<<S1S>>', { open: '<<S', close: 'S>>' });
  a(r6.removed === 1, 'B14 单条规则也给剥（不当成没给规则）', r6);
  const r7 = CB.scrub('abc', ['坏规则', 'a|b|c']);
  a(r7.rejected.length === 1 && r7.rejected[0] === '坏规则', 'B15 坏规则进 rejected（不静默忽略）', r7.rejected);
  a(r7.text === 'a', 'B16 好规则照常生效（一条坏的不拖累其它的）', r7.text);
  const r8 = CB.scrub('原样', []);
  a(r8.text === '原样' && r8.removed === 0, 'B17 没给规则时逐字不动');
  a(CB.scrub(null, R).text === '' && CB.scrub(undefined, R).removed === 0, 'B18 非串入参按空文本处理，不抛');
  const once = CB.scrub(t1, R).text;
  const twice = CB.scrub(once, R).text;
  a(twice === once, 'B19 幂等：剥两次与剥一次逐字相等', [once, twice]);
  const t9 = '<<S1S>>尾巴<<S2';
  const r9 = CB.scrub(t9, R);
  const again = CB.scrub(r9.text, R);
  a(again.text === r9.text, 'B20 幂等（含半截块）：再剥也不会继续蚕食', JSON.stringify([r9.text, again.text]));
  const r10 = CB.scrub('a<<SbS>>c', ['x|<<S|S>>', 'y|<<S|S>>']);
  a(r10.removed === 1 && r10.rejected.length === 0, 'B21 两条同规则不重复剥（第二条看到的是已剥结果）', r10);
  const st = CB.stat(['a|<<S|S>>', '坏']);
  a(st.count === 1 && st.rejected.length === 1 && st.valid[0].name === 'a', 'B22 stat 读数与 scrub 同口径', st);
  a(CB.DEFAULTS.maxMarkLen === 32, 'B23 DEFAULTS 冻结面', CB.DEFAULTS);
}

console.log('\n── 负控制：把判据改坏，上面的断言必须变红 ──');
negCtl('engines/ctx-boundary.js', 'out.unmatched.push({ rule: R.name, at: at });\n          res += cur.slice(i);\n          break;',
  'out.unmatched.push({ rule: R.name, at: at });\n          res += cur.slice(i, at) + cur.slice(at + R.open.length);\n          break;', function (mm) {
  const t = '正文<<S半截';
  const bad = mm.wa.ctxBoundary.scrub(t, ['系统|<<S|S>>']);
  a(bad.text !== t, 'C1 负控制：把「有起无收」当成半截块剥掉时正文就被动了（B5 不是空断言）', JSON.stringify(bad.text));
});
negCtl('engines/ctx-boundary.js', 'res += cur.slice(i, at) + blank;', 'res += cur.slice(i, at);', function (mm) {
  const t = 'a\n<<S一\n二\n三S>>\nb';
  const bad = mm.wa.ctxBoundary.scrub(t, ['系统|<<S|S>>']);
  a(NL(bad.text) !== NL(t), 'C2 负控制：不补换行时行数就变了（B9 不是空断言）', [NL(t), NL(bad.text)]);
});
negCtl('engines/ctx-boundary.js', "if (!R) { out.rejected.push(", "if (!R) { void (", function (mm) {
  const bad = mm.wa.ctxBoundary.scrub('abc', ['坏规则']);
  a(bad.rejected.length === 0, 'C3 负控制：不登记坏规则时就静默忽略了（B15 不是空断言）', bad.rejected);
});

console.log('\n合计：' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);