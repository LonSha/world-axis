'use strict';
/**
 * tests/u9-fact-report-v2190.js — 发布前事实报告（计划 U9）四段专锁。
 *   A 静态契约：导出面形状、九项齐备、扫面下限、锚点逐字恰中 1 次（H5 纯度）。
 *   B 运行时：真跑 `tools/fact-report.js`，拿现场读数（三方版本 / 九项 / 旧基线带行号）。
 *   C 不变式：判据**纯只读** —— 连调两次逐字节相同，且不改被取证的 11 份文档与 4 本台账。
 *   N 负控制：**在内存副本上做真源码破坏 → 重跑同款真判据**（可注入读接缝 `opt.read`）。
 *
 * 为什么负控制走内存副本：本报告要治的病之一就是「读到的数与现场脱钩」，
 *   而验证「判据真会现形」如果靠改真文件，验证者自己就成了新的风险源
 *   （与 `tests/readings-v2106.js` / `tests/docs-archive-gate-v2120.js` 同口径）。
 *
 * 本锁自证（H 系列口径）：
 *   H5 每个锚点字面量在目标文件里恰中 1 次、且在本文件里恰声明 1 次（缺失与重复同罪）。
 *   H6 判据两向自证：原版上该判据必须为真（B 组），破坏副本上必须为假（N 组）；
 *      且每处破坏必须**可观测地改变行为**（否则「没现形」会被误读成「判据太弱」）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/u9-fact-report-v2190.js';
const MOD_REL = 'tools/fact-report.js';
const RUN_REL = 'tests/run.js';
const README_REL = 'README.md';
const fr = require('../tools/fact-report.js');

/** 统一锚点表（{rel, txt}；txt 在目标文件里恰中 1 次，且不含反斜杠）。 */
const ANCHORS = {
  aVer: { rel: MOD_REL, txt: 'function versions(rd) {' },
  aStale: { rel: MOD_REL, txt: 'function staleBaselines(cur, rd) {' },
  aWork: { rel: MOD_REL, txt: 'function worktree() {' },
  aDead: { rel: MOD_REL, txt: 'function deadSurface(rd) {' },
  aHost: { rel: MOD_REL, txt: 'function hostStatus(rd) {' },
  aNote: { rel: MOD_REL, txt: 'note: ' },
  aTargets: { rel: MOD_REL, txt: 'const STALE_TARGETS = [' },
  aWire: { rel: RUN_REL, txt: "runLock('./u9-fact-report-v2190.js');" }
};
const ITEMS = ['versions', 'regression', 'rejectCodes', 'moduleRegistry', 'deadSurface',
  'host', 'worktree', 'leftovers', 'staleBaselines'];
const EXPORTS = ['build', 'print', 'selfTest', 'versions', 'rejectCodes', 'moduleRegistry',
  'deadSurface', 'hostStatus', 'staleBaselines', 'worktree', 'STALE_TARGETS', 'ITEMS', 'howLines'];
/** 取证面：报告读的文档与台账（C 组逐字节核对用）。 */
const EVIDENCE = ['README.md', 'ITERATION_LOG.md', 'NEXT_PLAN.md', 'docs/ERROR_CODES.md',
  'tests/reject-code-ledger.json', 'tests/module-registry-ledger.json',
  'tests/dead-export-ledger.json', 'tests/consumer-ledger.json'];
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
/** 现场破坏：**全部**出现处一次改掉（字符串版 replace 只改第一处 —— v2.105.0 的 D2 教训）。 */
function allReplace(src, from, to) { return src.split(from).join(to); }
/** 在真源码上做一次破坏，并证明破坏真的发生了（没打中 ⇒ 抛，不许静默）。 */
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label + ' :: ' + from);
  return out;
}
/** 读接缝：目标文件换成破坏副本，其余文件读真源。 */
function readerWith(rel, broken) {
  return function (r) {
    if (r === rel) return broken;
    return rd(r);
  };
}

function runA(A) {
  const S = rd(MOD_REL);
  const keys = Object.keys(fr).sort();
  A(keys.join(',') === EXPORTS.slice().sort().join(','),
    'A1 导出面恰为 ' + EXPORTS.length + ' 项（实 ' + keys.length + '：' + keys.join(',') + '）');
  A(fr.ITEMS === 9, 'A2 报告项数登记为 9（实 ' + fr.ITEMS + '）—— 项数变了而这里不变就会出现「少一项也没人说话」');
  A(Array.isArray(fr.STALE_TARGETS) && fr.STALE_TARGETS.length >= 8,
    'A3 旧基线取证面 ≥8 份文档（实 ' + fr.STALE_TARGETS.length + '）—— 扫面塌成空集时本报告会恒真');
  A(fr.STALE_TARGETS.indexOf('plans/U_OPTIMIZATION.md') >= 0 && fr.STALE_TARGETS.indexOf('plans/Y_EXPANSION.md') >= 0,
    'A3b 两份本代计划文件都在取证面内（本代自己的现场读数块也要被盯着）');
  A(typeof fr.build === 'function' && typeof fr.print === 'function' && typeof fr.selfTest === 'function',
    'A4 三个入口齐备（build / print / selfTest）');
  A(S.indexOf('\u53ea\u8bfb') >= 0 && S.indexOf('\u5217\u51fa \u2260 \u5df2\u4fee') >= 0,
    'A5 只读声明与「列出 ≠ 已修」两条纪律真写在源码里（不是只在注释里喊口号）');
  A(S.indexOf('opt.read') >= 0 && S.indexOf('const rd = (opt && opt.read) || read;') >= 0,
    'A6 负控制所需的读接缝真存在（无接缝就不能在内存副本上做真破坏）');
  // A7 锚点逐条：在目标文件里恰中 1 次（逐个站点判断，不做全局存在性判断）
  Object.keys(ANCHORS).forEach(function (k, i) {
    const t = ANCHORS[k];
    const n = rd(t.rel).split(t.txt).length - 1;
    A(n === 1, 'A' + (7 + i) + ' 锚点「' + k + '」在 ' + t.rel + ' 恰中 1 次（实 ' + n + '）');
  });
  // A15 纯度：每个锚点字面量在本文件恰声明 1 次（判据不得引用锚点串当期望值）
  const selfSrc = rd(SELF_REL);
  const impure = Object.keys(ANCHORS).filter(function (k) {
    return selfSrc.split(ANCHORS[k].txt).length - 1 !== 1;
  });
  A(impure.length === 0, 'A15 锚点字面量在本文件各恰出现一次（违者：' + (impure.join(',') || '无') + '）');
  A(rd(README_REL).indexOf('fact-report') >= 0,
    'A16 README 的工具名单含 fact-report（toolchain-gate 的名单真源只有一处：README）');
  // A17 取法面（U9 验收四：报告里的每一项都要能被读者用给出的命令复算）
  const hows = fr.howLines(fr.build());
  A(Array.isArray(hows) && hows.length === 9,
    'A17 取法面九行齐备（实 ' + (Array.isArray(hows) ? hows.length : '非数组') + '）');
  A(Array.isArray(hows) && hows.every(function (l) { return typeof l === 'string' && l.length > 8; }),
    'A17b 每一行都是非空命令串（空行在空集上恒真）');
  // A18 取法不是第二真源：每一行都必须包含对应取数函数自己写的 how
  const rH = fr.build();
  const allHow = Array.isArray(hows) ? hows.join('\n') : '';
  [rH.versions.how, rH.worktree.how, rH.leftovers.how, rH.host.how].forEach(function (h, i) {
    A(allHow.indexOf(h) >= 0, 'A18 取法第 ' + (i + 1) + ' 项与取数函数同源（不另写第二份）');
  });
}

function runB(A) {
  const r = fr.build();
  A(ITEMS.every(function (k) { return Object.prototype.hasOwnProperty.call(r, k); }),
    'B1 报告九项齐备（缺：' + ITEMS.filter(function (k) { return !Object.prototype.hasOwnProperty.call(r, k); }).join(',') + '）');
  A(!!r.versions.index && r.versions.index === r.versions.manifest,
    'B2 版本三方：index ' + r.versions.index + ' === manifest ' + r.versions.manifest);
  A(r.versions.agree && r.versions.runPins > 0,
    'B3 入口版本真的在 run.js 消息面上被钉过（钉 ' + r.versions.runPins + ' 处；0 处说明「消息面」这项在空集上恒真）');
  const cv = r.rejectCodes.cov;
  A(!!cv && cv.total > 0 && cv.sum === cv.total && cv.identityOk,
    'B4 拒收码三集恒等式在现场为平（' + (cv ? cv.total + ' = ' + cv.witnessed + '+' + cv.dead + '+' + cv.base : '不可读') + '）');
  A(!!cv && cv.declared > 0, 'B4b 见证声明面非空（实 ' + (cv ? cv.declared : '?') + '）—— 与 reject-code-coverage 同源，不另算一套');
  A(r.moduleRegistry.nsCount > 0 && r.moduleRegistry.loadedCount > 0,
    'B5 模块注册读数非空（引用 ' + r.moduleRegistry.nsCount + ' / 装载 ' + r.moduleRegistry.loadedCount + '）');
  A(r.deadSurface.deadCount > 0 && r.deadSurface.programmatic > 0,
    'B6 死子面与消费者读数非空（dead ' + r.deadSurface.deadCount + ' / programmatic ' + r.deadSurface.programmatic + '）');
  A(r.host.uiLivePresent === true, 'B7 宿主取证通道在（ui-live ' + (r.host.uiLivePresent ? '在' : '缺') + '）');
  A(Array.isArray(r.staleBaselines) && r.staleBaselines.every(function (h) {
    return typeof h.file === 'string' && typeof h.line === 'number' && h.line > 0 && typeof h.said === 'string';
  }), 'B8 旧基线每条都带文件与行号（逐站点断言，不按「文件里存在」断言）');
  // B9 现算与直接调模块级取值面一致（防止 print 与 build 各算一套）
  const v2 = fr.versions(function (rel) { return rd(rel); });
  A(v2.index === r.versions.index && v2.runPins === r.versions.runPins,
    'B9 模块级 versions() 与 build() 同源（' + v2.index + '/' + v2.runPins + ' vs ' + r.versions.index + '/' + r.versions.runPins + '）');
  const txt = fr.print(r);
  A(txt.indexOf('\u2460') >= 0 && txt.indexOf('\u2468') >= 0 && txt.indexOf(r.note) >= 0,
    'B10 打印面含九项与只读声明（文本长度 ' + txt.length + '）');
  const st = fr.selfTest();
  A(st.ok === true, 'B11 selfTest 在现场为真（' + JSON.stringify(st) + '）');
}

function runC(A) {
  const before = {};
  EVIDENCE.forEach(function (rel) { before[rel] = rd(rel); });
  const r1 = fr.build(), r2 = fr.build();
  A(JSON.stringify(r1) === JSON.stringify(r2), 'C1 连调两次读数逐字节相同（判据无副作用、且不依赖调用次序）');
  const ev2 = {};
  EVIDENCE.forEach(function (rel) { ev2[rel] = rd(rel); });
  const changed = EVIDENCE.filter(function (rel) { return before[rel] !== ev2[rel]; });
  A(changed.length === 0, 'C2 取证面逐字节未变（改动的：' + (changed.join(',') || '无') + '）');
  A(JSON.stringify(r1.worktree) === JSON.stringify(r2.worktree), 'C3 shell 面（工作树）两次一致');
}

function runN(A) {
  // ── N1 版本面破坏：把 index.js 的 VERSION 改成另一个号 ⇒ 三方必须不再一致 ──
  {
    const idx = rd('index.js');
    const broken = breakOnce(idx, "const VERSION = '", "const VERSION = '9.9.9'; const __x = '", 'n1-index-version');
    const r = fr.build({ read: readerWith('index.js', broken) });
    A(r.versions.index === '9.9.9', 'N1 破坏版读到的入口版本变成 9.9.9（判据真在读现场）');
    A(r.versions.agree === false, 'N1b 三方一致判据在破坏版上现形（agree false）——原版为真');
  }
  // ── N2 manifest 面破坏：只改 manifest ⇒ 同样必须现形 ──
  {
    const man = rd('manifest.json');
    const broken = breakOnce(man, '"version": "', '"version": "9.9.9", "_pad": "', 'n2-manifest');
    const r = fr.build({ read: readerWith('manifest.json', broken) });
    A(r.versions.manifest === '9.9.9' && r.versions.agree === false,
      'N2 只改 manifest 即现形（实 manifest ' + r.versions.manifest + ' · agree ' + r.versions.agree + '）');
  }
  // ── N3 旧基线判据：往一份取证文档里插入一条落后基线 ⇒ 必须被列出来 ──
  {
    const readme = '\u57fa\u7ebf\uff1av2.1.0\n\u57fa\u7ebf\uff1av2.2.0\n';
    const r0 = fr.build();
    const r = fr.build({ read: readerWith('README.md', readme) });
    const hit = r.staleBaselines.filter(function (h) { return h.file === 'README.md'; });
    A(hit.length > 0, 'N3 合成 README 里的旧基线被列出（实 ' + hit.length + ' 条）');
    const realN = r0.staleBaselines.filter(function (h) { return h.file === 'README.md'; }).length;
    A(hit.length === 2 && hit.length > realN - 1,
      'N3b 合成文档的两条旧基线都被列出（实 ' + hit.length + ' 条；真 README ' + realN + ' 条）'
      + '—— 判据不依赖真 README 里恰好有几条史实（否则一改历史文档就会伪红）');
  }
  // ── N4 旧基线判据纯度：合成文档里写当前版本 ⇒ 不得被误报 ──
  {
    const r = fr.build();
    const cur = r.versions.index;
    const r2 = fr.build({ read: readerWith('README.md', '\u57fa\u7ebf\uff1av' + cur + '\n') });
    A(r2.staleBaselines.filter(function (h) { return h.file === 'README.md'; }).length === 0,
      'N4 与当前同版本的基线不被误报为旧基线（判据不恒真）');
  }
  // ── N5 台账面破坏：摘掉 reject-code-ledger ⇒ 该面如实报 absent，而不是静默当成 0 ──
  {
    const r = fr.build({ read: readerWith('tests/reject-code-ledger.json', '{ not json') });
    A(r.rejectCodes.absent === true, 'N5 台账不可解析时如实报 absent（不拿 0 冒充读数）');
  }
  // ── N6 工具两向自证（破坏工具本身两向行为）──
  {
    const S = 'const A = 1;\nconst B = 2;\n';
    let threw = false;
    try { breakOnce(S, 'const ZZZ = 9;', 'x', 'n6'); } catch (e) { threw = true; }
    A(threw, 'N6 锚点不存在时工具**必须抛**（不许静默返回原串）');
    A(breakOnce(S, 'const A = 1;', 'const A = 2;', 'n6c') !== S, 'N6c 破坏可观测地改动了文本');
    const dup = 'const A = 1;\nconst A = 1;\n';
    A(allReplace(dup, 'const A = 1;', 'const A = 2;').split('const A = 2;').length - 1 === 2,
      'N6d 全量替换（allReplace）改掉**全部**出现处 —— 只改第一处会让多数站点静默漏改');
  }
  // ── N7 原版上同款判据为真（纯只读、且不是「只有破坏才为真」的恒假）──
  {
    const r = fr.build();
    A(r.versions.agree === true && r.staleBaselines.every(function (h) {
      return Number(h.said.match(/(\d+)\.(\d+)/) ? h.said.match(/(\d+)\.(\d+)/)[2] : 9999) < Number(r.versions.index.split('.')[1]);
    }), 'N7 原版上：三方一致为真，且每条旧基线确实落后于当前次版本');
  }
  // ── N8 取法面负控制：真模块上同款判据为真，把一行命令挖空后必须现形 ──
  {
    const hows0 = fr.howLines(fr.build());
    const pure = function (arr) {
      return Array.isArray(arr) && arr.every(function (l) { return typeof l === 'string' && l.length > 8; });
    };
    A(pure(hows0), 'N8 原版上同款判据为真（判据不是只有破坏才为真）');
    const fake = hows0.map(function (x, i) { return i === 0 ? '' : x; });
    A(pure(fake) === false, 'N8b 命令挖空后判据现形（破坏可观测地改变了行为）');
    A(fr.howLines(fr.build())[0] === hows0[0], 'N8c 取法判据无副作用（连调两次首行逐字相同）');
  }
}

function runAll(assert) {
  const A = function (c, n) { assert(c, n); };
  runA(A); runB(A); runC(A);
}
function runNegative(assert) {
  const A = function (c, n) { assert(c, n); };
  runN(A);
}
module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative),
  ANCHORS: ANCHORS, ITEMS: ITEMS, EXPORTS: EXPORTS, EVIDENCE: EVIDENCE
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { require('./mock.js'); runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('U9-FACT-REPORT-V2190: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('U9-FACT-REPORT-V2190: pass (' + pass + ')');
}
