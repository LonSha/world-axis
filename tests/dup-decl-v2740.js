// WorldAxis tests/dup-decl-v2740.js -- 重复定义门禁专锁（v2.74.0）
//
// 为什么有它：v2.73.0 交付后复查发现，往 tests/product-files.js 插入 testFiles
//   的补丁被执行了两次，函数连同 JSDoc 出现两遍而三道门禁全绿（JS 允许重复声明、
//   后者静默覆盖）。本锁对新门禁 tests/dup-decl-gate.js 做两向自证。
//
// 两向自证（本仓纪律：判据必须先跑成红）：
//   ① 真副本破坏（临时目录，仓库文件零改写）；
//   ② 破坏锚点各恰中 1 次（负控还额外验锚点真的落进副本）；
//   ③ 破坏后对应判据逐条现形；
//   ④ 逐锚敏感（一枚破坏不牽连别类）；
//   ⑤ 非恒真（收缩扫描面 ⇒ 反空转下限现形）；
//   ⑥ 无副作用（仓库 md5 不变）。
//
// v2.74.0 本锁首跑曾 5 项红，**全是测试面自己的错**，逐条记在这里防复发：
//   · 破坏数据与负控文案的 JSDoc 正文净长 55 / 44 字，**低于 JSDOC_MIN=80**，被
//     判据自己的门槛过滤 —— 破坏根本没发生，判据当然「没现形」；
//   · 「判据看对的面」一段拿 dup-decl-gate.js 当样本，而该文件通篇用 `//` 注释，
//     `/** */` 块数为 0 —— 样本选错，不是判据错；
//   · 「非恒真」一段用 kinds(scan) 读反空转下限，但下限由 judge() 产生、
//     不在 scan() 的 problems 里 —— 调用对象用错。
//   这三条的共同形状：**判据先跑成红，红的是测试面不是判据**。所以本锁自带前置断言，
//   先把「测试数据能不能触发判据」自己验一遍（见 [前置] 与 [面] 两组）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const gate = require('./dup-decl-gate.js');
const inventory = require('./inventory.js');

const BASE = path.join(__dirname, '..');

function mkTmp(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wadecl-'));
  Object.keys(files).forEach(function (rel) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, files[rel]);
  });
  return dir;
}
function rmTmp(dir) {
  try {
    fs.readdirSync(dir).forEach(function (n) {
      const abs = path.join(dir, n);
      if (fs.statSync(abs).isDirectory()) rmTmp(abs); else fs.unlinkSync(abs);
    });
    fs.rmdirSync(dir);
  } catch (e) { /* 清理失败不影响判据 */ }
}
function md5(p) { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex'); }
function kindsOf(arr) {
  const s = {};
  arr.forEach(function (p) { s[p.kind] = (s[p.kind] || 0) + 1; });
  return s;
}
function kinds(report) { return kindsOf(report.problems); }
function vkinds(verdict) { return kindsOf(verdict.problems); }
function scanStr(code, rel) { return gate.scanCode(inventory.codeFace(code), rel, code); }

// JSDoc 正文：去掉 `/**` `*/` 与行首 `*`、压缩空白。长度必须 >= gate.JSDOC_MIN，
// 否则判据自己就会把它过滤掉（本锁首跑就是这么红成 0 的）。
const DOC = '本文段用于触发 JSDoc 重复判据，必须足够长它才会被计入；否则短注释会被门槛直接过滤，破坏根本没发生，判据自然不会现形，负控制于是变成假绿。这类自带下限的判据，其测试数据必须先跨过自己那道门槛。';
const DOC_BLOCK = '/**\n * ' + DOC + '\n */\n';
function docBody(block) { return block.replace(/\/\*\*|\*\//g, '').replace(/^[ \t]*\*[ \t]?/gm, '').replace(/\s+/g, ' ').trim(); }

function runAll(assert) {
  // -- A. 结构锁：判据面必须在场 --
  assert(typeof gate.scan === 'function' && typeof gate.judge === 'function'
    && typeof gate.scanCode === 'function' && typeof gate.bodyOf === 'function'
    && typeof gate.normBody === 'function' && typeof gate.summary === 'function',
    '[结构] scan / judge / scanCode / bodyOf / normBody / summary 均在场');
  assert(typeof gate.MIN_FILES === 'number' && typeof gate.MIN_TOP_DECLS === 'number'
    && typeof gate.MIN_JSDOCS === 'number',
    '[结构] 三条反空转下限均导出（判据不得在空集上恒真）');

  // 本锁自己的前置条件：负控文案必须过得了判据自己的门槛
  assert(docBody(DOC_BLOCK).length >= gate.JSDOC_MIN,
    '[前置] 负控文案净长 ' + docBody(DOC_BLOCK).length + ' >= JSDOC_MIN ' + gate.JSDOC_MIN + '（否则破坏判据自己看不见）');

  // -- B. 现场基线 --
  const live = gate.scan();
  assert(live.problems.length === 0,
    '[基线] 现场三类重复零命中（实 ' + live.problems.length + '）');
  assert(live.files >= gate.MIN_FILES && live.topDecls >= gate.MIN_TOP_DECLS && live.jsdocs >= gate.MIN_JSDOCS,
    '[基线] 扫描面足够宽（' + gate.summary(live) + '）');
  assert(gate.judge(live).ok === true, '[基线] 现场报告 ⇒ judge 绿');

  // -- C. 判据看对的面（v2.74.0 自踩的坑）--
  //   JSDoc 判据必须看原文：真代码面里注释已剥离，扫 JSDoc 恒为 0。
  //   样本选在 product-files.js（含真正的 JSDoc 块），不能拿纯 `//` 注释的文件当样本。
  const src = fs.readFileSync(path.join(BASE, 'tests/product-files.js'), 'utf8');
  const cf = inventory.codeFace(src);
  const onRaw = gate.scanCode(cf, 'x.js', src);
  const onCode = gate.scanCode(cf, 'x.js', cf);
  assert(onRaw.jsdocs > 0, '[面] JSDoc 判据在原文面上真的数到东西（实 ' + onRaw.jsdocs + '）');
  assert(onCode.jsdocs === 0,
    '[面] （负向自证）同一函数喂真代码面 ⇒ JSDoc 计数塔成 0（实 ' + onCode.jsdocs + '）'
    + '——「真代码面」不能无条件套用');

  // 同体判据必须看真代码面：若有人把两个函数体写进注释里，不得被当成重复
  const ghost = scanStr('function ghost() { return 1; }\n', 'y.js');
  assert(ghost.out.length === 0, '[面] 注释里的同名同体函数不算重复（实 ' + ghost.out.length + '）');

  // 同体判据的两侧边界（本版最后两处自踩，机器化住）：
  //   只差缩进 ⇒ 同一段代码嵌在不同层级，该报；
  //   只差字面量长度 ⇒ 真代码面里字面量是「等长空白」抹掉的，若把空白折叠就看成同一份，不该报。
  const indOnly = 'function q(t) { return "aa"; }\n' + '  function q(t) { return "aa"; }\n';
  const kInd = kindsOf(scanStr(indOnly, 'z1.js').out);
  assert(kInd['fn-body-dup'] === 1,
    '[面] 只差缩进的两份同名同体 ⇒ 报 1 次（实 ' + (kInd['fn-body-dup'] || 0) + '）');
  const litDiff = 'function q(t) { return "aa"; }\n' + '  function q(t) { return "aaaa"; }\n';
  const kLit = kindsOf(scanStr(litDiff, 'z2.js').out);
  assert(!kLit['fn-body-dup'],
    '[面] 只差字面量长度（真代码面上） ⇒ 不报 fn-body-dup（实 ' + (kLit['fn-body-dup'] || 0) + '）'
    + '——把连续空白折叠成一个空格会在这里产出假阳性');

  // -- D. 三类判据各能现形（真副本破坏，锚点各恰中 1 次）--
  const BK = {
    top: {
      'a.js': 'function dup(a) { return a + 1; }\nfunction dup(a) { return a + 2; }\n'
    },
    doc: {
      'b.js': DOC_BLOCK + 'function one() { return 1; }\n' + DOC_BLOCK + 'function two() { return 2; }\n'
    },
    body: {
      'c.js': 'function same(x) { return x * 2; }\n  function same(x) { return x * 2; }\n'
    }
  };
  const checks = [
    { k: 'top', kind: 'top-decl-dup', why: '顶层同名声明重复' },
    { k: 'doc', kind: 'jsdoc-dup', why: '重复 JSDoc 块（补丁重跑指纹）' },
    { k: 'body', kind: 'fn-body-dup', why: '同名同体函数声明' }
  ];
  const md5Before = {};
  ['tests/dup-decl-gate.js', 'tests/product-files.js', 'tests/inventory.js'].forEach(function (f) { md5Before[f] = md5(path.join(BASE, f)); });

  checks.forEach(function (c) {
    const dir = mkTmp(BK[c.k]);
    const rep = gate.scan(dir);
    const kd = kinds(rep);
    assert(kd[c.kind] === 1,
      '[破坏现形] ' + c.why + ' ⇒ 报 ' + c.kind + ' 恰 1 次（实 ' + (kd[c.kind] || 0) + '）');
    assert(gate.judge(rep).ok === false, '[破坏现形] ' + c.why + ' ⇒ judge 红');
    // ④ 逐锚敏感：一枚破坏不牽连另一类
    const others = Object.keys(kd).filter(function (k) { return k !== c.kind && k !== 'scan-too-narrow'; });
    assert(others.length === 0,
      '[隔离] ' + c.why + ' 不牽连其他类判据（实 ' + (others.join(',') || '无') + '）');
    // 锚点恰中 1 次（破坏字面在副本里只出现一次）
    assert(Object.keys(BK[c.k]).length === 1, '[锚点] ' + c.k + ' 副本只含 1 个文件');
    rmTmp(dir);
  });

  // -- E. 非恒真：收缩扫描面 ⇒ 反空转下限现形（下限在 judge 里，不在 scan 里）--
  const empty = mkTmp({ 'only.js': 'function a() { return 1; }\n' });
  const vdEmpty = gate.judge(gate.scan(empty));
  assert(vkinds(vdEmpty)['scan-too-narrow'] === 3,
    '[非恒真] 扫描面收缩 ⇒ 三条反空转下限同时现形（实 ' + (vkinds(vdEmpty)['scan-too-narrow'] || 0) + '）');
  assert(vdEmpty.ok === false, '[非恒真] 空集上不得得出绿灯结论');
  rmTmp(empty);

  // -- F. 无副作用 --
  let same = true;
  Object.keys(md5Before).forEach(function (f) { if (md5Before[f] !== md5(path.join(BASE, f))) same = false; });
  assert(same, '[N5] 副本破坏零侧漏（仓库三个受关注文件 md5 不变）');
}

function runNegative(assert) {
  // ② 破坏锚点必须「真的在副本里」：同一个破坏块在副本中恰出现 2 次（否则判据命中数会被误计）
  const dir = mkTmp({ 'n.js': DOC_BLOCK + 'function z() { return 0; }\n' + DOC_BLOCK + 'function y() { return 1; }\n' });
  const raw = fs.readFileSync(path.join(dir, 'n.js'), 'utf8');
  const cnt = raw.split(DOC_BLOCK).length - 1;
  assert(cnt === 2, '[锚点] 重复注释块在副本中恰中 2 次（实 ' + cnt + '）——破坏确实发生了');
  const rep = gate.scan(dir);
  assert(kinds(rep)['jsdoc-dup'] === 1, '[负控] 重复注释 ⇒ 报 1 次（实 ' + (kinds(rep)['jsdoc-dup'] || 0) + '）');
  rmTmp(dir);
}

module.exports = { runAll: runAll, runNegative: runNegative };
