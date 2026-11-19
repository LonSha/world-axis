'use strict';
// WorldAxis tests/opv29-z4-anchor-v2529.js — OPV29-19 锚定收窄 + OPV29-20 负控制覆盖 专锁
//
// ── 现场读数（剥注释后，可复算：`node tools/anchor-audit.js`）────────────
//   `indexOf/includes('…')` **5488** 处 · 裸短锚（<8 字且无结构标记）**1858** 处
//   其中本批 opv29 专锁：**27** 处（冻结基线 27，只许降不许升）
//   负控制覆盖：opv29 专锁 9 个 · 缺「负控制」字样 **0** · 既无读数也未声明欠账 **0**
//               · 已显式声明欠账 **1**（`opv29-z3-v2524.js`：只有正向断言，没留过真破坏读数）
//
// ── 为什么裸锚不清零 ────────────────────────────────
//   1858 处里很多是合理的（`indexOf('.js')`、`indexOf('✗')`）。一刀切等于关灯。
//   纪律与面数常量同族：**冻结存量 + 新增零容忍 + 逐条点名**。
//
// ── 为什么允「声明欠账」这一档 ──────────────────────
//   因为编出来的读数比没有读数更坏。z3-v2524 确实没做过负控制，
//   让它写「负控制：未做（欠账）」比逼它抄一个 FAIL 3/28 好 —— 后者会让门禁永远绿在一个假数字上。
//   但「声明欠账」必须**被单独统计且打印出来**，不能混进「有读数」里。
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const AN = require(path.join(ROOT, 'tools', 'anchor-audit.js'));
const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

// ══════════ A. Z4-19 锚定收窄 ══════════
function runA() {
  console.log('\nA. OPV29-19 锚定收窄（冻结存量 + 新增零容忍）');
  const res = AN.audit(ROOT);
  a(res.ok === true, 'A1 扫描面可读', res.why);
  a(res.total >= 5000, 'A2 扫描面非空（' + res.total + ' 处 indexOf/includes 字面锚）', String(res.total));
  a(res.bare > 0 && res.bare < res.total,
    'A3 裸锚与上下文锚都非零（' + res.bare + '/' + res.total + '）—— 若 bare 为 0，多半是规则过宽把一切都当上下文',
    res.bare + '/' + res.total);
  a(typeof res.baseline === 'number' && res.baseline >= 0,
    'A4 冻结基线是个数字（' + res.baseline + '）', String(res.baseline));
  a(res.opvBare <= res.baseline,
    'A5 本批 opv29 裸锚不增长（' + res.opvBare + ' <= 基线 ' + res.baseline + '）',
    res.opvBare + ' vs ' + res.baseline);
  // 分类两向
  a(AN.classifyAnchor('a.b') === 'bare', 'A6 短且无结构的锚判 bare（a.b）');
  a(AN.classifyAnchor('reading.marks') === 'contextual', 'A7 长锚判 contextual（reading.marks，13 字）');
  a(AN.classifyAnchor('const CAP = ') === 'contextual', 'A8 带结构标记的短锚判 contextual（const CAP =）');
  a(AN.classifyAnchor('a=b') === 'contextual', 'A9 结构标记 `=` 生效（a=b 只有 3 字也不算裸）');
  // 剥注释：注释里的锚不是判据
  const stripped = AN.stripComments("// 举例 indexOf('parseAnchorSample')\nconst x = 1;\n").join('\n');
  a(stripped.indexOf('parseAnchorSample') < 0 && stripped.indexOf('const x = 1;') >= 0,
    'A10 剥注释生效（注释里的锚不计入，代码不丢）');
}

// ══════════ B. Z4-20 负控制覆盖 ══════════
function runB() {
  console.log('\nB. OPV29-20 负控制覆盖（每条新增判据都要有真破坏读数）');
  const res = AN.audit(ROOT);
  const neg = res.negative;
  a(neg.length >= 8, 'B1 opv29 专锁被扫到（' + neg.length + ' 个）', String(neg.length));
  const unreg = neg.filter(function (n) { return !n.registered; });
  a(unreg.length === 0, 'B2 每个 opv29 专锁都挂进了 tests/run.js（没挂就是孤儿）',
    JSON.stringify(unreg.map(function (x) { return x.file; })));
  const missNeg = neg.filter(function (n) { return !n.hasNegative; });
  a(missNeg.length === 0, 'B3 每块挂载注释都写了「负控制」（缺了就是只写正向断言就宣布完成）',
    JSON.stringify(missNeg.map(function (x) { return x.file; })));
  const missBoth = neg.filter(function (n) { return !n.hasReading && !n.declaredDebt; });
  a(missBoth.length === 0, 'B4 每块要么有 FAIL 读数、要么显式声明欠账（两者皆无不许）',
    JSON.stringify(missBoth.map(function (x) { return x.file; })));
  // 两向：读数的两种写法都认；欠账声明单独认
  a(AN.NEED_READING.test('FAIL 3/40') && AN.NEED_READING.test('FAIL 13/28'),
    'B5 FAIL 读数被认（含多位数分子分母）');
  a(!AN.NEED_READING.test('红了一片') && !AN.NEED_READING.test('全红'),
    'B6 只有「红了」没有数字不算读数（那是描述，不是实测）');
  a(AN.DECLARED_DEBT.test('负控制：未做（欠账，Z4-20 记账）'),
    'B7 「声明欠账」这一档被单独识别（不许混进「有读数」）');
  a(!AN.DECLARED_DEBT.test('FAIL 3/40'), 'B8 有真读数时不会被误判成欠账声明');
  // 声明欠账必须可见：计数打印，且每一项都点名到文件
  const declared = neg.filter(function (n) { return n.declaredDebt; });
  a(declared.every(function (n) { return n.file && n.file.slice(0, 6) === 'tests/'; }),
    'B9 已声明欠账的项都点名到文件（不静默）', JSON.stringify(declared.map(function (x) { return x.file; })));
  const missDir = AN.audit(fs.mkdtempSync(path.join(os.tmpdir(), 'wa-an-')));
  a(missDir.ok === false && missDir.why === 'tests-dir-missing',
    'B10 tests 目录缺失 ⇒ ok:false（不是「零裸锚」的假绿）', missDir.why);
}

function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A);
}
module.exports = { runAll: runAll };
if (require.main === module) {
  runA(); runB();
  console.log('\nOPV29-Z4-ANCHOR-V2529: '
    + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
  failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
  process.exitCode = failures.length ? 1 : 0;
}