#!/usr/bin/env node
// WorldAxis tests/opv31-b1-break-selfproof-v2569.js — 「破坏点自证」读数器专锁
//
// ── 它锁什么（先看现场）─────────────────────────────────────────
//   v2.570.0 之前，仓库里 27 处「把源码改坏」的点**没有一句「我真的改到了」的自证**：
//   锚点漂了也不会红，负控制静默哑火。新工具 tools/break-selfproof.js 把这些点第一次
//   变成读数。但**「工具报了个数字」本身不安全** —— 工具自己也可能：
//     ① 把模板渲染/探针改写算成破坏点（假阳满天，读数没人信）；
//     ② 把锚点自带的不等号当成自证（锚点自证自己，假绿）；
//     ③ 把「破坏后判据红」当「破坏真发生」自证（把负控有效误报成锚点命中）。
//   本锁就在这三条上做**两向自证**：合成样例上必须逐档判对，且真破坏工具后必须现形。
//
// ── 判据 ───────────────────────────────────────────────────
//   A 读数面（真仓库）：装载非空 · 破坏点 ≥ 下限 · 额度表逐文件覆盖 · 点名清单非空。
//   B 合成样例（造一棵临时 tests/，用工具自己的 audit(root) 跑）：
//     B1 有自证（notStrictEqual）⇒ certified，不进未自证
//     B2 无自证 ⇒ 进未自证（且带 file/line/target）
//     B3 无负控制语境的模板渲染 replace ⇒ **不算破坏点**（不进 sites）
//     B4 锚点自身含 !== ⇒ 不得凭锚点自证（仍需真自证）
//     B5 内联形态（无目标变量）而有一句「真的改到了」的话术 ⇒ 算自证（不误杀）
//     B6 前缀条件：空目录 ⇒ ok:false / sites-dir-missing（不报「零破坏点」的假绿）
//   C 负控制（在真仓库副本里真改工具，各自单打）：
//     C1 把 CERT_WORDS 换成永不匹配 ⇒ 未自证数必须上升（证明该判据在起作用）
//     C2 把 NEGCTX 去掉（恒真）⇒ 破坏点数必须上升（证明⓪门在起作用）
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const F = require(path.join(ROOT, 'tools', 'break-selfproof.js'));
const BS = String.fromCharCode(92);

let pass = 0;
const fails = [];
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  \u2713 ' + name); }
  else { fails.push(name + (extra ? ' :: ' + extra : '')); console.log('  \u2717 ' + name + (extra ? ' :: ' + extra : '')); }
}

// 合成样例：一棵最小 tests/ ----
//   good.js       有自证的破坏点
//   absent.js     无自证的破坏点
//   template.js   模板渲染的 replace（无负控制语境）
//   anchor-trap.js 锚点自带 !==（不得凭锚点自证）
//   inline.js     内联形态 + 一句「真的改到了」的话术
function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-bsp-'));
  const tdir = path.join(dir, 'tests');
  fs.mkdirSync(tdir, { recursive: true });
  fs.writeFileSync(path.join(tdir, 'good.js'), [
    "'use strict';",
    "const CODE = \"return cand.slice().sort(byWhen).slice(0, 3);\";",
    "// 负控制：把排序去掉",
    "const broken = CODE.replace('return cand.slice().sort(byWhen).slice(0, 3);', 'return cand.slice(0, 3);');",
    "assert.notStrictEqual(broken, CODE, '破坏未生效');",
    ""
  ].join('\n'));
  fs.writeFileSync(path.join(tdir, 'absent.js'), [
    "'use strict';",
    "const SRC = \"if (isTerminal(f)) { out = { ok: false }; }\";",
    "// 负控制：去掉终态门",
    "const wrecked = SRC.replace('if (isTerminal(f)) { out = { ok: false }; }', 'if (false) { }');",
    "run(wrecked);  // 这里故意不写任何报账",
    ""
  ].join('\n'));
  fs.writeFileSync(path.join(tdir, 'template.js'), [
    "'use strict';",
    "// 这不是负控制，只是渲染模板",
    "const out = tpl.replace('${BLOCK}', renderBlock());",
    ""
  ].join('\n'));
  fs.writeFileSync(path.join(tdir, 'anchor-trap.js'), [
    "'use strict';",
    "const CODE = \"if (a.kind !== 'x') { b = 1; }\";",
    "// 负控制：把分支去掉",
    "const broken2 = CODE.replace(\"if (a.kind !== 'x') { b = 1; }\", 'if (false) { b = 1; }');",
    "assert(broken2.indexOf('false') >= 0, '破坏后应含 false');",
    ""
  ].join('\n'));
  fs.writeFileSync(path.join(tdir, 'inline.js'), [
    "'use strict';",
    "const SRC2 = \"enabled: true,\";",
    "// 负控制：把开关改反",
    "vm.runInContext(SRC2.replace('enabled: true,', 'enabled: false,'), ctx, {});",
    "if (SRC2.indexOf('enabled: true,') < 0) throw new Error('破坏没有改变源码');",
    ""
  ].join('\n'));
  return { dir: dir, tdir: tdir };
}

function runA() {
  console.log('\nA. 读数面（真仓库）');
  const res = F.audit(ROOT);
  a(res.ok === true, 'A1 真仓库可读', res.why);
  a(res.files > 0 && res.sites > 0, 'A2 装载面与破坏点都非空',
    String(res.files) + ' / ' + String(res.sites));
  a(res.sites >= res.minSites, 'A3 破坏点 ≥ 下限 ' + res.minSites + '（0 命中在空集上恒真）', String(res.sites));
  a(res.belowFloor === false, 'A4 belowFloor 如实为 false', String(res.belowFloor));
  a(res.certified + res.absent === res.sites, 'A5 已自证 + 未自证 ≡ 破坏点（三数咬合）',
    String(res.certified) + '+' + String(res.absent) + ' vs ' + String(res.sites));
  a(res.absent > 0 && res.absentList.length === res.absent,
    'A6 未自证有点名清单且条数一致（只报百分比等于没报）',
    String(res.absentList.length) + ' vs ' + String(res.absent));
  a(res.absentList.every(function (s) { return s.file && s.line > 0 && s.anchor; }),
    'A7 每条点名都带 file/line/anchor 证据');
  // 额度表逐文件覆盖：表里每个文件必须真在 perFile 里（防止「表里写个幽灵文件混白」）
  const ghost = Object.keys(res.baselinePerFile).filter(function (k) {
    return !Object.prototype.hasOwnProperty.call(res.perFile, k);
  });
  a(ghost.length === 0, 'A8 额度表里没有幽灵文件（全是真存在的测试文件）', JSON.stringify(ghost));
  // 表外文件额度为 0：没有任何未在表内的文件被超额度
  a(res.over.length === 0, 'A9 当前无超额度的文件（新增锁零容忍）',
    JSON.stringify(res.over.slice(0, 5).map(function (x) { return x.file + ':' + x.absent; })));
  a(res.indentCoupled > 0 && res.indentList.length === res.indentCoupled,
    'A10 缩进耦合锚点如实点名（不静默）', String(res.indentCoupled));
}

function runB() {
  console.log('\nB. 合成样例（工具自己跑在造的树上）');
  const fx = makeFixture();
  try {
    const res = F.audit(fx.dir);
    a(res.ok === true, 'B0 合成树可读', res.why);
    const byFile = {};
    res.absentList.forEach(function (s) { byFile[s.file] = s; });
    // B1 good.js：有 notStrictEqual 自证 ⇒ 不进未自证
    a(!Object.prototype.hasOwnProperty.call(byFile, 'tests/good.js'),
      'B1 有 notStrictEqual 自证的破坏点判为已自证',
      byFile['tests/good.js'] ? byFile['tests/good.js'].anchor : '(not listed)');
    // B2 absent.js：无自证 ⇒ 进未自证，且带证据
    const ab = byFile['tests/absent.js'];
    a(!!ab && ab.file === 'tests/absent.js' && ab.line > 0 && ab.target === 'wrecked',
      'B2 无自证的破坏点被点名（带 target 证据）',
      ab ? JSON.stringify({ line: ab.line, target: ab.target }) : '(not listed)');
    // B3 template.js：无负控制语境 ⇒ 不是破坏点
    a(!res.absentList.some(function (s) { return s.file === 'tests/template.js'; }) &&
      !Object.prototype.hasOwnProperty.call(res.perFile, 'tests/template.js'),
      'B3 无负控制语境的模板 replace 不算破坏点（0 门生效）',
      JSON.stringify(Object.keys(res.perFile)));
    // B4 anchor-trap.js：锚点自带 !== 不得自证（唯一一句是 indexOf 自证 ⇒ 由 inject-visible 认）
    const at = byFile['tests/anchor-trap.js'];
    a(!at, 'B4 锚点自带的 !== 不能自证自己（key：不能因锚点而绿）',
      at ? at.anchor : '(not listed)');
    // B4b 反向：把唯一的自证语句删掉，同一处破坏必须变成未自证
    fs.writeFileSync(path.join(fx.tdir, 'anchor-trap2.js'), [
      "'use strict';",
      "const CODE3 = \"if (a.kind !== 'x') { b = 1; }\";",
      "// 负控制：把分支去掉",
      "const broken3 = CODE3.replace(\"if (a.kind !== 'x') { b = 1; }\", 'if (false) { b = 1; }');",
      ""
    ].join('\n'));
    const res2 = F.audit(fx.dir);
    const at2 = res2.absentList.filter(function (s) { return s.file === 'tests/anchor-trap2.js'; })[0];
    a(!!at2, 'B4b 去掉唯一的自证语句后同款破坏点变未自证（锚点自证自己会被当场拆穿）',
      at2 ? at2.anchor : '(not listed)');
    fs.unlinkSync(path.join(fx.tdir, 'anchor-trap2.js'));
    // B5 inline.js：无目标变量 + 「破坏没有改变源码」话术 ⇒ 算自证（不误杀内联形态）
    a(!byFile['tests/inline.js'], 'B5 内联形态带「真的改到了」话术 ⇒ 判为已自证（不误杀）',
      byFile['tests/inline.js'] ? byFile['tests/inline.js'].anchor : '(not listed)');
    // B6 前缀条件：空目录 ⇒ ok:false
    const miss = F.audit(fs.mkdtempSync(path.join(os.tmpdir(), 'wa-bsp-empty-')));
    a(miss.ok === false && miss.why === 'tests-dir-missing',
      'B6 空目录 ⇒ ok:false / tests-dir-missing（不是「零破坏点」的假绿）', miss.why);
  } finally {
    try { fs.rmSync(fx.dir, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响判据 */ }
  }
}

// C 组：在真仓库副本里真改工具，各自单打
function copyTool() {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(ROOT, 'tools', 'break-selfproof.js'), 'utf8');
  return src;
}
function evalTool(src) {
  const vm = require('vm');
  const sandbox = { module: { exports: {} }, console: console, require: require, __dirname: path.join(ROOT, 'tools'), __filename: path.join(ROOT, 'tools', 'break-selfproof.js'), process: process };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'break-selfproof.probe.js' });
  return sandbox.module.exports;
}

function runC() {
  console.log('\nC. 负控制（真改工具源码后单打）');
  const base = F.audit(ROOT);
  // C1 把 CERT_WORDS 换成永不匹配
  let src1 = copyTool().replace(
    'const CERT_WORDS = /自证|破坏(?:真发生|已落盘|生效|未生效|没有改变|未改变)|恰中 1 次|锚点命中|锚点在真源上|注入点命中/;',
    'const CERT_WORDS = /\\u0000NEVERMATCH\\u0000/;');
  if (src1 === copyTool()) throw new Error('C1 破坏未落盘（CERT_WORDS 锚点失配）');
  const C1 = evalTool(src1).audit(ROOT);
  a(C1.absent > base.absent, 'C1 抽掉「真的改到了」话术表 ⇒ 未自证数上升（该判据在起作用）',
    base.absent + ' -> ' + C1.absent);
  // C2 把 NEGCTX 改成恒真
  let src2 = copyTool().replace(
    'const NEGCTX = /负控制|破坏|自证|wreck|broken|doctored|mutated|injected|\\bN[1-9]\\b/;',
    'const NEGCTX = /.*/;');
  if (src2 === copyTool()) throw new Error('C2 破坏未落盘（NEGCTX 锚点失配）');
  const C2 = evalTool(src2).audit(ROOT);
  a(C2.sites > base.sites, 'C2 拆掉 0 负控制语境门 ⇒ 破坏点数上升（假阳会进来的方向）',
    base.sites + ' -> ' + C2.sites);
  // C3 把锚点屏蔽去掉（锚点自证自己的方向）
  let src3 = copyTool().replace("      win = win.split(text).join('<ANCHOR>');", '      // 破坏：锚点不再屏蔽');
  if (src3 === copyTool()) throw new Error('C3 破坏未落盘（锚点屏蔽行失配）');
  const C3 = evalTool(src3).audit(ROOT);
  a(C3.certified >= base.certified, 'C3 去掉锚点屏蔽 ⇒ 自证数只会虚高（说明这条屏蔽确实在压假绿）',
    base.certified + ' -> ' + C3.certified);
  // C3b 两向合成对照：锚点原文里自带「目标变量 !== 别的变量」，不屏蔽就会自证自己。
  //   真工具（带屏蔽）⇒ 未自证；去掉屏蔽的变体 ⇒ 已自证。合成样例上差 1，才证得住这条判据不是空的。
  const trapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-bsp-trap-'));
  fs.mkdirSync(path.join(trapDir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(trapDir, 'tests', 'trap.js'), [
    "'use strict';",
    'const CODE = "if (broken !== other) { c = 1; }";',
    "// 负控制：把分支去掉",
    "const broken = CODE.replace('if (broken !== other) { c = 1; }', 'if (false) { c = 1; }');",
    "run(broken);",
    ''
  ].join('\n'));
  try {
    const masked = F.audit(trapDir);
    const unmasked = evalTool(src3).audit(trapDir);
    a(masked.absent === 1 && unmasked.absent === 0,
      'C3b 锚点自带目标变量的 !== 时：带屏蔽 ⇒ 未自证，去掉屏蔽 ⇒ 假自证（两向）',
      'masked absent=' + masked.absent + ' / unmasked absent=' + unmasked.absent);
  } finally {
    try { fs.rmSync(trapDir, { recursive: true, force: true }); } catch (e2) { /* 清理失败不影响判据 */ }
  }
}

function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A); runC(A);
}

module.exports = { runAll: runAll };

if (require.main === module) {
  runA(); runB(); runC();
  console.log('\nOPV31-B1-BREAK-SELFPROOF-V2569: '
    + (fails.length ? 'FAIL ' + fails.length + '/' + (pass + fails.length) : 'pass (' + pass + ')'));
  fails.slice(0, 8).forEach(function (f) { console.log('  \u00b7 ' + f); });
  process.exitCode = fails.length ? 1 : 0;
}
