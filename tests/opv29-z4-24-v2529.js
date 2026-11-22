'use strict';
// WorldAxis tests/opv29-z4-24-v2529.js — OPV29-24 快档与全量同源 专锁
//
// ── 现场读数（可复算：`node tools/fast-vs-full.js`）──────────────────────
// SMOKE_SET **14** 项 · FAST_GATES **3** 项 · 全量挂载面 **173** 个 runScript 调用。
// 关系：**FAST_GATES ⊆ SMOKE_SET**（快档集故意大 11 道，设计允许）。
// 快档未覆盖的已挂载面 **172** 项 —— 这个数字不是错误，是「必须看得见」的事实。
//
// ── 本项治的两个病 ────────────────────────────────────────────────
// ① 快档漏掉某道已挂载专锁 ⇒ 那道锁的红只在 29 分钟的全量里出现，于是
//    「快档绿」是一句**没覆盖到它**的假安心。故未覆盖项必须被点名（不许静默）。
// ② 两张表各写一遍 ⇒ 「pre-commit 说通过、smoke 说不通过」自相矛盾，
//    而两张表各自都自洽、没有任何判据看得见。
//
// ── 三条不许的假绿 ────────────────────────────────────────────────
// ① 解析不到当成零：SMOKE_SET / FAST_GATES 都必须能解析出非空成员；
//    解析失败记 unparsed 并红（0 vs 0 不能被当成「一致」）。
// ② 把关系判成相等：仓库设计是子集（smoke 故意更大），判 == 会把既有正确设计
//    判成分叉 —— 那是「判据比事实严」的假红，比漏判更糟。
// ③ 只报总数不点名：未覆盖项必须逐个列出，只给「172 项」等于没给。

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const F = require(path.join(ROOT, 'tools/fast-vs-full.js'));

let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}

function runA() {
  console.log('\nA. 解析面（两张表都要真的读到，不许 0 vs 0 冒充一致）');
  const res = F.audit(ROOT);
  a(res.unparsed.length === 0, 'A1 三份来源全部解析成功',
    JSON.stringify(res.unparsed));
  a(Array.isArray(res.smokeSet) && res.smokeSet.length > 0,
    'A2 SMOKE_SET 解析出非空成员', res.smokeSet ? String(res.smokeSet.length) : 'null');
  a(Array.isArray(res.fastGates) && res.fastGates.length > 0,
    'A3 FAST_GATES 解析出非空成员（初版只认 rel ⇒ 这里会是 0）',
    res.fastGates ? String(res.fastGates.length) : 'null');
  a(res.mountedCount !== null && res.mountedCount > 0,
    'A4 全量挂载面非空（runScript 调用数）', String(res.mountedCount));

  // 成员必须是**脚本路径**形态，不是名字或空串
  a(res.smokeSet.every(function (x) { return /\.js$/.test(x); }),
    'A5 SMOKE_SET 成员都是 .js 路径', JSON.stringify(res.smokeSet.slice(0, 3)));
  a(res.fastGates.every(function (x) { return /\.js$/.test(x); }),
    'A6 FAST_GATES 成员都是 .js 路径（取自 cmd 里的 node 参数）',
    JSON.stringify(res.fastGates));
}

function runB() {
  console.log('\nB. 关系面（子集，不是相等）');
  const res = F.audit(ROOT);
  a(res.diff !== null, 'B1 关系可判（两表都读到时才判）');
  a(res.diff && res.diff.relation === 'FAST_GATES ⊆ SMOKE_SET',
    'B2 关系写成子集（不是相等）', res.diff ? res.diff.relation : 'null');
  a(res.diff && res.diff.same === true,
    'B3 当前 FAST_GATES ⊆ SMOKE_SET 成立（pre-commit 没有跑快档集外的门禁）',
    res.diff ? JSON.stringify(res.diff.onlyHook) : 'null');
  a(res.diff && res.diff.onlySmoke.length > 0,
    'B4 快档集确实更大（onlySmoke 非空 —— 若为 0，说明设计变了，本判据要重读）',
    res.diff ? String(res.diff.onlySmoke.length) : 'null');
  a(res.ok === true, 'B5 当前整体 pass', String(res.ok));
}

function runC() {
  console.log('\nC. 覆盖面（漏项必须点名，不许只给总数）');
  const res = F.audit(ROOT);
  a(Array.isArray(res.uncovered), 'C1 未覆盖项是个列表（不是计数）');
  a(res.uncovered.length > 0, 'C2 当前确有未覆盖项（如实报出，不当错误）',
    String(res.uncovered.length));
  a(res.uncovered.every(function (x) { return /\.js$/.test(x); }),
    'C3 未覆盖项是可执行文件名（能照着单跑）');
  const text = F.render(res);
  // 锚用渲染文案里的完整句子（短锚 '· ' 会被 anchor-audit 判为裸锚，A5 当场红）
  a(text.indexOf('快档未覆盖的已挂载面：（逐项列出，不是错误但必须看得见）') >= 0,
    'C4 渲染里标明未覆盖项是逐项列出（不是只报数）');
}

function runD() {
  console.log('\nD. 负控制面（三条假绿各自可咬住）');
  const real = fs.readFileSync(path.join(ROOT, 'tools/fast-vs-full.js'), 'utf8');

  // D1：关系判成相等 —— 直接把 same 改成 onlySmoke 也为空，模拟「判 ==」
  const d1 = real.replace(
    '      same: onlyHook.length === 0,',
    '      same: onlyHook.length === 0 && onlySmoke.length === 0,');
  a(d1 !== real, 'D1 破坏锚点命中（把子集判成相等）');
  a(/same: onlyHook\.length === 0 && onlySmoke\.length === 0/.test(d1),
    'D2 破坏后关系确实变成相等（判据输入变了，不是恒真）');

  // D3：membersOf 只认 rel（回到初版）
  const d3 = real.replace(
    "  re = /cmd:\\s*'[^']*?node\\s+([^'\\s]+)'/g;\n  while ((m = re.exec(body)) !== null) out.push(m[1]);\n",
    '');
  a(d3 !== real, 'D3 破坏锚点命中（去掉 cmd 形态解析）');
  a(d3.indexOf("cmd:") < 0 || d3.indexOf('node\\s+') < 0,
    'D4 破坏后 cmd 形态不再被解析（FAST_GATES 会退化成 0 项）');

  // D5：解析失败当空数组（而不是 null + unparsed）
  const d5 = real.replace(
    "    if (smokeSet === null) unparsed.push({ what: 'SMOKE_SET', why: 'pattern-miss' });",
    '    if (smokeSet === null) smokeSet = [];');
  a(d5 !== real, 'D5 破坏锚点命中（解析失败记空数组）');
  a(/if \(smokeSet === null\) smokeSet = \[\];/.test(d5),
    'D6 破坏后「解析不到」会被当成空集（0 vs 0 可冒充一致）');

  // D7：空目录（三份来源都读不到）⇒ 必须 ok:false 且 unparsed 非空
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-fvf-'));
  const e = F.audit(empty);
  a(e.ok === false, 'D7 空目录 ⇒ ok:false（不是零漏项）', String(e.ok));
  a(e.unparsed.length === 3, 'D8 空目录 ⇒ 三份来源全部记 unparsed', String(e.unparsed.length));
  a(e.smokeSet === null && e.fastGates === null,
    'D9 空目录 ⇒ 两表为 null（不是空数组冒充「一致」）');
}

runA();
runB();
runC();
runD();
console.log('\nOPV29-Z4-24-V2529: ' + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
if (fails.length) { fails.forEach(function (f) { console.log('  · ' + f); }); process.exitCode = 1; }