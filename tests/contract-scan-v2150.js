// WorldAxis tests/contract-scan-v2150.js —— v2.150.0（RP5 跨模块契约漂移静态扫描器）专锁
//
// 【为什么工具也要专锁】`tools/` 不进出口面契约（tests/product-files.js 的 SKIP_DIRS 把
//   tests/ 与 tools/ 整个排掉），所以工具唯一的可见面是 tests/toolchain-gate.js 的三档
//   （在册 / 引用 / 入口）。那三档答的是「它在不在、被不被用」，**答不出「它说的话对不对」**：
//   一个永远返回空数组的扫描器在引用面上与真扫描器长得一模一样。本锁补的正是这一面。
//
// 【判据结构（与 tests/tools-v2110.js 同规格）】
//   A 结构面（静态，不装载产品面）· B 运行时（原版读数逐项与现场同源）
//   · C 负控制（真源码破坏 ⇒ 对应面现形；破坏点不在扫描面上 ⇒ 读数逐字不变）
//
// 【负控制的三条纪律（本项目反复踩过）】
//   ① 破坏必须打得到靶：不存在的东西不能被破坏，故先断言每个锚点在真源码中**恰中 1 次**；
//   ② 不许自指：不做「把判据自己删了」的破坏（那只能证明源码变了，不能证明判据承重）；
//   ③ fields 面必须**成对破坏** —— 原版该字段两侧写的都是 `{}`（非字面量），
//      只破坏一侧时该路径连第二个写者都没有，判据按「不足两个模块」跳过，
//      那会得到一个假红（「判据不承重」的假结论）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const TOOL_REL = 'tools/contract-scan.js';
const SRC_OF = function (rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); };
const TOOL = require(path.join(BASE, TOOL_REL));

//   真源码破坏锚点（每条在目标文件里恰中 1 次；A 段断言该条）
const ANCHORS = {
  ghostCode: { rel: 'engines/sediment.js',
    txt: "reason: 'bad-value', field: 'fact'",
    sub: "reason: 'lock-ghost-code', field: 'fact'" },
  enumThird: { rel: 'engines/collab.js',
    txt: "const STRATEGIES = ['last-write-wins', 'keep-a', 'keep-b'];",
    sub: "const STRATEGIES = ['first', 'vote', 'blend', 'lock-third'];" },
  fieldA: { rel: 'engines/horizon.js',
    txt: 'if (!d.evolution) d.evolution = {};',
    sub: "if (!d.evolution) d.evolution = 'lock-a';" },
  fieldB: { rel: 'engines/tool-import.js',
    txt: 'if (!d.evolution) d.evolution = {};',
    sub: "if (!d.evolution) d.evolution = 'lock-b';" }
};
const hitOf = function (s, x) { return s.split(x).length - 1; };
/** 在内存副本上重跑同一份真判据（真源码破坏、零文件改写）。 */
const readWith = function (over) {
  return function (rel) {
    return over[rel] !== undefined ? over[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8');
  };
};
const wrecked = function () {
  const out = {};
  Object.keys(ANCHORS).forEach(function (k) {
    const a = ANCHORS[k];
    out[a.rel] = SRC_OF(a.rel).split(a.txt).join(a.sub);
  });
  return out;
};

// ── A：结构面（静态） ────────────────────────────────────────────────
const FACES_A = ['EXEMPT', 'scan', 'audit', 'print', 'reportLines', 'selfTest', 'productFiles',
  'deadTable', 'ledgerBase', 'witnessDeclared'];
function runA(a) {
  const s = SRC_OF(TOOL_REL);
  a(s.length > 8000, 'v2150/A1: ' + TOOL_REL + ' 存在且非空（' + s.length + ' 字符）');
  FACES_A.forEach(function (k) {
    a(typeof TOOL[k] !== 'undefined', 'v2150/A2: 导出 ' + k);
  });
  // 单一真源：三面所依赖的四个外源全部走委托，不得另立第二份
  a(s.indexOf("tests', 'product-files.js'") > 0, 'v2150/A3: 产品面委托 tests/product-files.js（不另写遍历器）');
  a(s.indexOf('reject-code-gate.js') > 0 && s.indexOf('reject-v2780.js') > 0
    && s.indexOf('reject-code-ledger.json') > 0,
    'v2150/A4: codes 面三源（扫描面 / 死表 / 台账）均委托既有真源');
  a(s.indexOf('stripComments') > 0, 'v2150/A5: 注释剥离复用 tests/test-surface-gate.js（解释病灶的文字不是病灶）');
  // 入口三档至少一档（本仓口径：工具必须有入口）
  a(s.indexOf('require.main === module') > 0 && s.indexOf('--self-test') > 0
    && s.indexOf('--json') > 0,
    'v2150/A6: 三入口就位（默认打印 / --json / --self-test）');
  // 零命中不算通过：空产品面必须有一条独立判据（不许以「problems 为空」冒充健康）
  a(s.indexOf('empty-product-face') > 0, 'v2150/A7: 空面判据就位（零命中不算通过）');
  // 名单会过期：EXEMPT 必须双向核对（登记项仍分歧 / 分歧项已登记）
  a(s.indexOf('stale-exempt') > 0,
    'v2150/A8: EXEMPT 表有「过期」向核对（名单会过期，过期名单比没有名单更坏）');
  // 破坏锚点各恰中 1 次
  const hits = Object.keys(ANCHORS).map(function (k) { return hitOf(SRC_OF(ANCHORS[k].rel), ANCHORS[k].txt); });
  a(hits.every(function (n) { return n === 1; }),
    'v2150/A9: 四个破坏锚点在真源码中各恰中 1 次（实 ' + JSON.stringify(hits) + '）');
  // fields 面的成对性：两个锚点必须在**不同**模块上（同一模块不构成跨模块）
  a(ANCHORS.fieldA.rel !== ANCHORS.fieldB.rel,
    'v2150/A10: fields 面破坏成对且跨模块（' + ANCHORS.fieldA.rel + ' vs ' + ANCHORS.fieldB.rel + '）');
  // 本锁自身不得成为被测工具的 wired 引用兜底（同 toolchain-gate-v2136 的 A9 口径：
  //   本锁里出现的是相对路径 require，不是 tools/contract-scan.js 形态，故不构成兜底）
  const lockSrc = SRC_OF('tests/contract-scan-v2150.js');
  a(lockSrc.indexOf('runLock') > 0,
    'v2150/A11: 本锁由 run.js 的 runLock 真执行（不是「文件在场」）');
  a(lockSrc.indexOf('require.main === module') > 0,
    'v2150/A12: 本锁可单独跑（require.main 守卫）');
}

// ── B：运行时（原版成绿，且两面读数与既有真源逐字同源） ──────────────
function runB(a) {
  const r = TOOL.scan({});
  const au = TOOL.audit({ result: r });
  a(au.ok === true && au.problems.length === 0,
    'v2150/B1: 三面零漂移（实 ' + JSON.stringify(au.problems.map(function (p) { return p.face + ':' + p.key; })) + '）');
  a(r.files > 100, 'v2150/B2: 扫描面非空（产品面 ' + r.files + ' 文件）—— 零命中不算通过');
  a(r.codes.total > 200 && r.codes.uncovered.length === 0,
    'v2150/B3: 内联码 ' + r.codes.total + ' 个全部有归属（无归属 ' + r.codes.uncovered.length + '）');
  //   与 reject-code-gate 的扫描面逐码同源（不得各扫一份）
  const rc = require('./reject-code-gate.js').scan({});
  const k1 = Object.keys(rc.hits).sort();
  const k2 = Object.keys(r.codes.hits).sort();
  a(k1.length === k2.length && k1.every(function (c, i) { return c === k2[i]; }),
    'v2150/B4: codes 面与 tests/reject-code-gate.js 逐码同源（' + k1.length + ' vs ' + k2.length + '）');
  //   与三本账同源：见证声明 / 死表 / 台账 base
  const w = TOOL.witnessDeclared();
  const d = TOOL.deadTable();
  const b = TOOL.ledgerBase();
  a(w.length > 300, 'v2150/B5: 见证声明面来自真源（实 ' + w.length + ' 个）');
  a(Object.keys(d).length > 0 && b.length > 0,
    'v2150/B6: 死表 ' + Object.keys(d).length + ' 条 / 台账 base ' + b.length + ' 条');
  a(w.every(function (c) { return r.codes.hits[c]; }),
    'v2150/B7: 见证声明的码全部是扫描面上的码（无幽灵见证）');
  a(r.enums.declared > 100, 'v2150/B8: enums 面真扫到具名常量（实 ' + r.enums.declared + ' 个）');
  a(r.enums.divergent.length > 0 && r.exempt.size === r.enums.divergent.length,
    'v2150/B9: 分歧 ' + r.enums.divergent.length + ' 名全在 EXEMPT（' + r.exempt.size + ' 条）');
  a(r.exempt.stale.length === 0 && r.exempt.missing.length === 0,
    'v2150/B10: EXEMPT 零过期 / 零缺理由');
  a(Object.keys(TOOL.EXEMPT).every(function (n) {
    return r.enums.divergent.some(function (x) { return x.name === n; });
  }), 'v2150/B11: 已豁免名均仍分歧');
  a(r.fields.divergent.length === 0,
    'v2150/B12: fields 面零「字面量互斥」（实 ' + r.fields.divergent.length + ' 条）');
  a(TOOL.selfTest() === true, 'v2150/B13: --self-test 两向自证通过（合成站点报出 / 原版不假报）');
  //   CLI 真跑（不是「文件在场」）：默认档必须打印读数且 exitCode 与 audit 同向
  const cp = require('child_process');
  const out = cp.spawnSync(process.execPath, [path.join('tools', 'contract-scan.js')],
    { cwd: BASE, encoding: 'utf8', timeout: 120000 });
  a(out.status === 0, 'v2150/B14: CLI 默认档 rc=0（实 ' + out.status + '）'
    + (out.status === 0 ? '' : ' :: ' + String(out.stdout || '').slice(-200)));
  a(/契约漂移: 0/.test(String(out.stdout || '')),
    'v2150/B15: CLI 人读出口打印「契约漂移: 0」');
  const outJ = cp.spawnSync(process.execPath, [path.join('tools', 'contract-scan.js'), '--json'],
    { cwd: BASE, encoding: 'utf8', timeout: 120000 });
  a(outJ.status === 0 && String(outJ.stdout || '').indexOf('"ok": true') > 0,
    'v2150/B16: --json 档 rc=0 且 ok:true');
  //   人读报告行单一真源：print 与 --json 的 lines 共用同一份（不各写一种排版）
  const rl = TOOL.reportLines(au);
  a(Array.isArray(rl) && rl.length >= 5
    && rl.some(function (l) { return l.indexOf('契约漂移: 0') >= 0; }),
    'v2150/B17: reportLines 交出人读报告行（' + rl.length + ' 行，含结论行）');
  a(rl.some(function (l) { return l.indexOf('产品面 ') >= 0 && l.indexOf('内联拒收码 ') >= 0; }),
    'v2150/B18: 报告行含「看了多少」（产品面数与码数）—— 零命中不算通过的前提');
}

// ── C：负控制（真源码破坏 ⇒ 对应面现形；不在面上 ⇒ 读数逐字不变） ────
function runC(a) {
  const pristine = TOOL.scan({});
  const over = wrecked();
  Object.keys(ANCHORS).forEach(function (k) {
    a(over[ANCHORS[k].rel] !== SRC_OF(ANCHORS[k].rel),
      'v2150/C1: 破坏 ' + k + ' 真落在源码副本上（' + ANCHORS[k].rel + '）');
  });
  const rB = TOOL.scan({ read: readWith(over) });
  const aB = TOOL.audit({ result: rB });
  a(rB.codes.uncovered.indexOf('lock-ghost-code') >= 0,
    'v2150/C2: 一个新内联码 ⇒ codes 面报无归属（实 '
      + JSON.stringify(rB.codes.uncovered) + '）—— 原版该码不在面内，是破坏带出来的');
  a(pristine.codes.uncovered.length === 0,
    'v2150/C2b: 同一判据在原版上不报（不是见谁都报）');
  a(rB.enums.divergent.some(function (x) { return x.name === 'STRATEGIES'; })
    && !aB.problems.some(function (p) { return p.face === 'enums' && p.key === 'STRATEGIES'; }),
    'v2150/C3: 原版已豁免的 STRATEGIES 被锯成第三套值 ⇒ 仍认出它是分歧，'
      + '但豁免表让它不红（豁免是「已登记的同名不同义」，不是「不再报」）');
  a(rB.fields.divergent.some(function (x) { return x.path === 'evolution'; })
    && aB.problems.some(function (p) { return p.face === 'fields' && p.key === 'evolution'; }),
    'v2150/C4: 同一字段两模块各写互斥字面量 ⇒ fields 面报出（原版该路径两侧皆非字面量）');
  a(aB.ok === false, 'v2150/C5: 有漂移时 audit 必须报 ok:false（坐实判据承重）');
  //   逐面分离：只破坏 fields 那一对 ⇒ 只有该面变
  const onlyF = TOOL.scan({ read: function (rel) {
    if (rel === ANCHORS.fieldA.rel || rel === ANCHORS.fieldB.rel) return over[rel];
    return fs.readFileSync(path.join(BASE, rel), 'utf8');
  } });
  a(onlyF.fields.divergent.some(function (x) { return x.path === 'evolution'; })
    && onlyF.codes.uncovered.length === 0
    && onlyF.enums.divergent.length === pristine.enums.divergent.length,
    'v2150/C6: 只破坏 fields 一面 ⇒ 只有该面变（codes 零无归属、enums 分歧数不变）');
  //   不在扫描面上的破坏：把整份源码逐行注释化 ⇒ 读数必须逐字不变
  const cmt = TOOL.scan({ read: function (rel) {
    if (rel === 'engines/sediment.js') {
      return SRC_OF(rel).split(String.fromCharCode(10)).map(function (l) { return '// ' + l; })
        .join(String.fromCharCode(10));
    }
    return fs.readFileSync(path.join(BASE, rel), 'utf8');
  } });
  a(JSON.stringify(cmt.codes.uncovered) === JSON.stringify(pristine.codes.uncovered)
    && cmt.codes.total === pristine.codes.total
    && cmt.enums.divergent.length === pristine.enums.divergent.length,
    'v2150/C7: 同一份源码整体注释化 ⇒ 读数逐字不变（解释病灶的文字不是病灶）');
  //   零命中不算通过：空面必须报 empty-product-face
  const empty = TOOL.audit({ result: TOOL.scan({ files: [], codeScan: { files: [], hits: {} } }) });
  a(empty.ok === false && empty.problems.some(function (p) { return p.key === 'empty-product-face'; }),
    'v2150/C8: 空产品面必须报 empty-product-face（零命中不算通过）');
  const emptyOk = TOOL.scan({ files: [], codeScan: { files: [], hits: {} } });
  a(emptyOk.codes.uncovered.length === 0 && emptyOk.enums.divergent.length === 0,
    'v2150/C8b: 同一份空读数若只看三面「红项」会显得全绿 ⇒ 故空面判据必须独立（这正是 C8 治的病）');
  //   两向自证工具本身
  a(TOOL.selfTest() === true, 'v2150/C9: selfTest 在原版上为真（不得假报）');
  const bad = require(path.join(BASE, TOOL_REL));
  a(bad.EXEMPT && Object.keys(bad.EXEMPT).length > 0,
    'v2150/C10: EXEMPT 表非空（零命中的豁免表等于没有名单）');
}

function runAll(a) { runA(a); runB(a); runC(a); }
if (require.main === module) {
  const fails = [];
  let pass = 0;
  const a = function (c, m) { if (c) pass += 1; else fails.push(m); };
  runAll(a);
  fails.forEach(function (m) { console.log('  x ' + m); });
  console.log('CONTRACT-SCAN-V2150: ' + (fails.length ? 'FAIL (' + fails.length + ')' : 'pass')
    + ' (' + pass + ')');
  process.exitCode = fails.length ? 1 : 0;
}
module.exports = { runA: runA, runB: runB, runC: runC, runAll: runAll,
  ANCHORS: ANCHORS, hitOf: hitOf };
