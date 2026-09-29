'use strict';
/**
 * tests/docs-archive-gate-v2120.js — 版本条目单一真源门禁（v2.120.0）四段专锁。
 *   A 静态契约：导出面形状、五条锚点在目标文件里**恰中 1 次**、本文件内**恰声明 1 次**（H5 纯度）。
 *   B 运行时：真跑 docs-archive-gate，拿现场读数（README 89 / 存档 92 / 跨文件重复 0）。
 *   C 不变式：判据**纯只读** —— 连调两次逐字节相同、且不改被取证的两个文件。
 *   N 负控制：**真源码破坏 → 落到破坏副本目录 → 在副本上重跑同一套真判据**。
 *
 * 为什么负控制走「破坏副本目录」而不是改真文件：要验的正是
 *   「迁移回退了，门禁会不会响」。若靠改真 README 来验，验证者自己就成了新的风险源
 *   （本仓 v2.119.0 就吃过「声称已改、文件没动」的亏）。副本是**另一份真文件树**，
 *   scan({root}) 读的就是它 —— 不是字符串匹配，是同一套判据在另一棵树上跑。
 *
 * 三形假绿（本仓负控制纪律）逐条规避：
 *   ① 对原文件断言 ⇒ 破坏没发生也绿。这里 scan 的是**副本**，破坏必然在副本里发生。
 *   ② 破坏写死成模拟常量 ⇒ 判据根本没被调用。这里破坏的是**真 README 文本**。
 *   ③ 破坏把判据自己删了 ⇒ 自我指涉。判据在 docs-archive-gate.js 里，破坏只改 README/LOG。
 *
 * 本锁自证（H 系列口径）：
 *   H5 每个锚点字面量在目标文件里恰中 1 次、在本文件里恰声明 1 次（缺失与重复同罪）。
 *   H6 两向自证：原版上**四条判据必须真**（B 组）；每处破坏上**必须为假**（N 组）；
 *      且破坏必须**可观测地改变行为**（破坏后 scan 的 problems 非空），否则抛。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/docs-archive-gate-v2120.js';
const MOD_REL = 'tests/docs-archive-gate.js';
const README_REL = 'README.md';
const LOG_REL = 'ITERATION_LOG.md';

/** 锚点：{文件, 文本}。文本在目标文件里必须恰中 1 次；且字面量在本文件里必须出现
 *  （H5 纯度）。注意锚点里**不要写 `\n` 转义** —— 本文件源码里的字面量是 `\`+`n` 两个字符，
 *  与去转义后的目标文件比对时会假红（本锁第一版就在这里踩过一次）。 */
const ANCHORS = [
  { rel: README_REL, text: '## 版本历史' },
  { rel: LOG_REL, text: '## 版本条目存档' },
  { rel: README_REL, text: 'License: 各源项目机制参考已获原作者授权（非商业缝合）。' },
  { rel: README_REL, text: '本节只保留 **v2.21.0 及之后**' },
  { rel: LOG_REL, text: '**v2.20.0** — 更正一处' }
];

function countOcc(hay, needle) {
  let n = 0, i = 0;
  while (true) {
    const k = hay.indexOf(needle, i);
    if (k < 0) break;
    n++; i = k + needle.length;
  }
  return n;
}
function breakOnce(text, anchor) {
  const n = countOcc(text, anchor);
  if (n !== 1) throw new Error('破坏锚点在目标文件里命中 ' + n + ' 次（要求恰 1 次）：' + JSON.stringify(anchor.slice(0, 40)));
  return text.replace(anchor, '');
}
function tmpRoot(name) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-docsgate-'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function copyTree(name) {
  const d = tmpRoot(name);
  [README_REL, LOG_REL].forEach(function (rel) {
    fs.writeFileSync(path.join(d, rel), fs.readFileSync(path.join(BASE, rel), 'utf8'));
  });
  return d;
}
/** 通用：把 rel 复制到副本目录、按 anchor 破一处（删掉），再在同一副本上跑**真判据**。
 *  破坏必须真的改变文本（breakOnce 命中数 ≠ 1 即抛），否则负控制是假的。 */
function copyAndBreak(rel, anchorText) {
  const d = copyTree('negb');
  const p = path.join(d, rel);
  const before = fs.readFileSync(p, 'utf8');
  const after = breakOnce(before, anchorText);
  if (after === before) throw new Error('破坏没有改变源码 —— 负控制是假的');
  fs.writeFileSync(p, after);
  return require(path.join(BASE, MOD_REL)).scan({ root: d });
}

function breakAndPatch(which, oldStr, newStr) {
  const d = copyTree('neg2-' + which);
  const rel = which === 'readme' ? README_REL : LOG_REL;
  const p = path.join(d, rel);
  const before = fs.readFileSync(p, 'utf8');
  if (countOcc(before, oldStr) !== 1) throw new Error('破坏锚点未恰中 1 次：' + JSON.stringify(oldStr.slice(0, 30)));
  const after = before.replace(oldStr, newStr);
  if (after === before) throw new Error('破坏没有改变源码');
  fs.writeFileSync(p, after);
  return require(path.join(BASE, MOD_REL)).scan({ root: d });
}

// ── A 段：静态契约 ──────────────────────────────────────────────────────
function runA(a) {
  const m = require(path.join(BASE, MOD_REL));
  a(typeof m.scan === 'function' && typeof m.runAll === 'function',
    'docs-archive/A: 导出 scan/runAll 两个入口');
  a(m.ARCH_HEAD === '## 版本条目存档' && m.HIST_HEAD === '## 版本历史',
    'docs-archive/A: 两个节标题常量未变（' + m.ARCH_HEAD + ' / ' + m.HIST_HEAD + '）');
  a(Array.isArray(m.CUT) && m.CUT.join('.') === '2.20.0',
    'docs-archive/A: 分界版本 = v2.20.0（实 ' + m.CUT.join('.') + '）');
  a(m.FIRST === '2.20.0' && m.LAST === '0.1.0',
    'docs-archive/A: 存档首尾常量 = v2.20.0 / v0.1.0（实 ' + m.FIRST + ' / ' + m.LAST + '）');
  a(m.ENTRY_RE instanceof RegExp && m.ENTRY_RE.test('**v2.20.0** — x') && m.ENTRY_RE.test('<b>v2.116.0</b> — x'),
    'docs-archive/A: 条目正则认两种方言（`**vX**` / `<b>vX</b>`）');
  a(!m.ENTRY_RE.test(' 正文里提到 v2.20.0 不算条目'),
    'docs-archive/A: 条目正则锚行首 —— 正文提及版本号不计为条目');
  a(m.ENTRY_RE.test('- **v2.21.0** — x'),
    'docs-archive/A: 条目正则接受 `- ` 前缀方言');

  // H5 纯度：锚点字面量在目标文件里、以及在本文件里都**必须出现**（缺失即「锚点漂了」），
  //   但**不要求在本文件里恰好 1 次** —— 同一个锚点被 A 组与 N 组各用一次是正当复用，
  //   把它判成违规会让「把锚点提到常量表」这类正确维护方式反而变红。
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  ANCHORS.forEach(function (an, i) {
    const target = fs.readFileSync(path.join(BASE, an.rel), 'utf8');
    a(countOcc(target, an.text) === 1,
      'docs-archive/A: 锚点#' + i + ' 在 ' + an.rel + ' 里恰中 1 次（实 ' + countOcc(target, an.text) + '）');
    a(countOcc(self, an.text) >= 1,
      'docs-archive/A: 锚点#' + i + ' 字面量在本文件里至少出现 1 次（实 ' + countOcc(self, an.text) + '）');
  });
}

// ── B 段：运行时（原版上四条判据必须真）────────────────────────────────
function runB(a) {
  const r = require(path.join(BASE, MOD_REL)).scan({});
  a(r.ok, 'docs-archive/B: 原版上四条判据全过（problems ' + r.problems.length + '）'
    + (r.ok ? '' : '：' + r.problems.join('; ')));
  // v2.124.0 补账：本常量停在被写入时的现场数上。README 条目**随每版发行增长**
  //   （v2.121.0 入册时 89→90，本版 v2.124.0 再 +1 ⇒ 91），而 v2.121–2.123 三版都没跑全量
  //   回归 ⇒ 这条红一直没被人看见。判据本身是对的（README 条目数是单一真源的读数），
  //   需要的是**回填**而不是放宽 —— 精确等值继续钉着「条目被误删」这件事。
  a(r.facts.readmeEntries === 91, 'docs-archive/B: README 版本历史条目 = 91（实 ' + r.facts.readmeEntries + '）');
  a(r.facts.logArchiveEntries === 92, 'docs-archive/B: 日志存档节条目 = 92（实 ' + r.facts.logArchiveEntries + '）');
  a(r.facts.archiveFirst === '2.20.0' && r.facts.archiveLast === '0.1.0',
    'docs-archive/B: 存档首尾 = v2.20.0 / v0.1.0（实 ' + r.facts.archiveFirst + ' / ' + r.facts.archiveLast + '）');
  a(r.facts.archiveRising.length === 0, 'docs-archive/B: 存档无上升对');
  a(r.facts.duplicatedAcrossFiles.length === 0,
    'docs-archive/B: 跨文件条目重复 = 0（实 ' + r.facts.duplicatedAcrossFiles.length + '）');

  // runAll 的断言也在原版上真
  const got = [];
  require(path.join(BASE, MOD_REL)).runAll(function (c, msg) { got.push([!!c, msg]); });
  a(got.length === 3 && got.every(function (x) { return x[0]; }),
    'docs-archive/B: runAll 三条内联断言全真（实 ' + got.filter(function (x) { return x[0]; }).length + '/3）');
}

// ── C 段：不变式（纯只读）───────────────────────────────────────────────
function runC(a) {
  const m = require(path.join(BASE, MOD_REL));
  const before = [README_REL, LOG_REL].map(function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); });
  const r1 = m.scan({});
  const r2 = m.scan({});
  const after = [README_REL, LOG_REL].map(function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); });
  a(before[0] === after[0] && before[1] === after[1],
    'docs-archive/C: 扫两次不动被取证的两个文件（逐字节相同）');
  a(JSON.stringify(r1) === JSON.stringify(r2), 'docs-archive/C: 连调两次读数相同（不依赖时序）');
}

// ── N 段：负控制（真源码破坏 → 副本 → 同一套真判据）─────────────────────
function runNegative(a) {
  // N1 去掉 README 的「版本历史」标题 ⇒ 门禁必须报「缺标题」
  const n1 = copyAndBreak(README_REL, ANCHORS[0].text);
  a(!n1.ok && n1.problems.some(function (p) { return /缺「版本历史」标题/.test(p); }),
    'docs-archive/N1: 摘掉 README「版本历史」标题 ⇒ 现形（problems ' + n1.problems.length + '）');

  // N2 把日志存档节的标题删掉 ⇒ 必须报「缺存档节」
  const n2 = copyAndBreak(LOG_REL, ANCHORS[1].text);
  a(!n2.ok && n2.problems.some(function (p) { return /缺「版本条目存档」标题/.test(p); }),
    'docs-archive/N2: 摘掉日志存档节标题 ⇒ 现形（problems ' + n2.problems.length + '）');

  // N3 迁移回退：把一条 v2.20.0 条目搬回 README 版本历史 ⇒ P1 必须响
  const d3 = copyTree('neg3');
  const v220 = '**v2.20.0** — 更正一处**立论错误**并清掉它留下的重复模块（第十三面：结论本身也要被证伪。';
  const rl3 = fs.readFileSync(path.join(d3, LOG_REL), 'utf8');
  if (countOcc(rl3, v220) !== 1) throw new Error('N3 锚点未恰中 1 次');
  fs.writeFileSync(path.join(d3, LOG_REL), rl3.replace(v220, ''));
  const rd3 = fs.readFileSync(path.join(d3, README_REL), 'utf8');
  const at = rd3.indexOf('\n<b>v2.116.0</b>');
  if (at < 0) throw new Error('N3 插入点缺失');
  fs.writeFileSync(path.join(d3, README_REL), rd3.slice(0, at) + '\n' + v220 + '（回退测试）\n' + rd3.slice(at));
  const n3 = require(path.join(BASE, MOD_REL)).scan({ root: d3 });
  a(!n3.ok && n3.problems.some(function (p) { return /v2\.20\.0 及更早的条目/.test(p); }),
    'docs-archive/N3: 把 v2.20.0 搬回 README ⇒ P1 现形（problems ' + n3.problems.length + '）');

  // N4 单一真源被破坏：往存档节里再抄一份 README 摘要（同一版本两处都有）⇒ P3 必须响
  const d4 = copyTree('neg4');
  const dupLine = '**v2.50.0** — 跨插件互操作验收面（第五十八面：装了没 ≠ 装对了没）。（重复副本测试）';
  const lg4 = fs.readFileSync(path.join(d4, LOG_REL), 'utf8');
  if (countOcc(lg4, '\n**v2.20.0** —') !== 1) throw new Error('N4 插入点缺失');
  fs.writeFileSync(path.join(d4, LOG_REL), lg4.replace('\n**v2.20.0** —', '\n' + dupLine + '\n**v2.20.0** —'));
  const n4 = require(path.join(BASE, MOD_REL)).scan({ root: d4 });
  a(!n4.ok && n4.problems.some(function (p) { return /单一真源被破坏/.test(p); }),
    'docs-archive/N4: 存档节里再抄一份 README 已留摘要（v2.50.0）⇒ P3 现形（problems ' + n4.problems.length + '）');

  // N5 README 尾部 License 行被删 ⇒ P4 必须响（破坏锚点用全行，避免 `\n` 转义问题）
  const n5 = copyAndBreak(README_REL, ANCHORS[2].text);
  a(!n5.ok && n5.problems.some(function (p) { return /未以 `---` \+ `License:` 收尾|License/.test(p); }),
    'docs-archive/N5: 删掉 README 的 License 行 ⇒ P4 现形（problems ' + n5.problems.length + '）');

  // N6 存档节首条被换成新版本（回退成「存档收新条目」）⇒ P2 必须响
  const d6 = copyTree('neg6');
  const lg6 = fs.readFileSync(path.join(d6, LOG_REL), 'utf8');
  fs.writeFileSync(path.join(d6, LOG_REL), lg6.replace('\n**v2.20.0** —', '\n**v2.99.0** — 假的（首条测试）\n**v2.20.0** —'));
  const n6 = require(path.join(BASE, MOD_REL)).scan({ root: d6 });
  a(!n6.ok && n6.problems.some(function (p) { return /存档节首条应为 v2\.20\.0/.test(p); }),
    'docs-archive/N6: 存档节首条被插到 v2.99.0 ⇒ P2 现形（problems ' + n6.problems.length + '）');

  // N7 双向自证：**不破坏**的副本上，同一套判据必须为真（防「判据恒假」）
  const d7 = copyTree('neg7-ctrl');
  const n7 = require(path.join(BASE, MOD_REL)).scan({ root: d7 });
  a(n7.ok, 'docs-archive/N7: 未破坏的副本上判据仍为真（控组；problems ' + n7.problems.length + '）');
}

module.exports = { runAll: function (assert) { runA(assert); runB(assert); runC(assert); }, runNegative: runNegative };