#!/usr/bin/env node
// v2.155.0 RP8 专锁：回归套件自身健康（tools/test-audit.js）
//   它锁的判据：
//     ① 三面各自**真出数**（锚点存活 / 锚点重复 / 失效测试），且读数不是常量；
//     ② **精确面报红、启发面只报**：统一档锚点漂移与登记文件消失会让 gate 变红；
//        而「锚点靶子已消失」**永不单独把 gate 判红**（那是超集，实测 8 条全属夹具串）；
//     ③ gate 只由**精确面**构成（破坏启发面 ⇒ gate 不变；破坏精确面 ⇒ gate 必红）；
//     ④ 零自动修改：本工具不修锁、不给自动修法（源码里零 writeFile / 零 spawn 写动作）；
//     ⑤ 不另立锚点口径：抽取与核查全部委派 tools/anchor-scan.js（本文件里不得出现第二套抽取正则）。
//   ⚠ 本锁**不用测试面破坏**（不删真锁文件）：工具自身读的是 tests/*.js 的内容，
//   对它做破坏会真改仓库。故驱动全部走 **scan(opts) 的注入面**（读/存在/清单/锚点行/登记表）——
//   这也是 v2.155.0 给 test-audit.js 加注入面的唯一理由：没有它，RP8 无法被负控制。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const REL = 'tools/test-audit.js';
const SELF_REL = 'tests/test-audit-v2155.js';
const audit = require('../tools/test-audit.js');

// 锚点一取 gate 判定的**精确面构成**（它决定了「什么算真失败」）。
//   丢了它，一条「靶子没了」的提示会把 gate 判红 —— 而实测 8 条靶子全是测试内部夹具串。
const ANCHOR = "  if (facts.uniformProblems > 0) gateFails.push('统一档锚点漂移 ' + facts.uniformProblems + ' 条');";
// 锚点二取**重复率分母**（声明总数）。写错分母（例如拿去重数当分母）会让重复率恒偏低，
//   于是重复永远报不出来，而读数看上去很正常。
const ANCHOR2 = "  facts.dupRate = declTotal ? (declTotal - uniq) / declTotal : 0;";
// 锚点三取「委派、不另立口径」这一行：它是边界 2 的可执行形态。
const ANCHOR3 = "    scanRow = o.anchorRow !== undefined ? o.anchorRow : anchorScan.scan({});";

function countOcc(s, sub) { return s.split(sub).length - 1; }

// ── A 结构面 ──────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2155/ta A1: gate 精确面构成锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2155/ta A2: 重复率分母锚点恰中 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  a(countOcc(src, ANCHOR3) === 1, 'v2155/ta A3: 委派 anchor-scan 锚点恰中 1 次（实 ' + countOcc(src, ANCHOR3) + '）');
  // 边界 1：只报不改。修锁/自动修法是人的事 —— 工具里不得有写动作。
  a(countOcc(src, 'writeFileSync') === 0 && countOcc(src, 'appendFileSync') === 0
    && countOcc(src, 'unlinkSync') === 0 && countOcc(src, 'rmSync') === 0,
    'v2155/ta A4: 零写动作调用点（只报不改是结构事实，不是承诺）');
  a(countOcc(src, "require('./anchor-scan.js')") === 1,
    'v2155/ta A5: 唯一锚点口径来源是 anchor-scan.js（不另造第二套抽取正则）');
  a(src.indexOf('module.exports = { scan: scan, fmt: fmt') >= 0,
    'v2155/ta A6: scan / fmt 真导出（要被 tests/run.js 与专锁消费）');
  a(src.indexOf('const DUP_THRESHOLD = 0.30;') >= 0, 'v2155/ta A7: 重复率阀值是显式常量（不是散落在判定里的魔数）');
  a(src.indexOf('--strict') >= 0 && src.indexOf('if (strict && !res.gate)') >= 0,
    'v2155/ta A8: 默认建议式退出（0）、--strict 只对精确面报红');
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1 && countOcc(self, ANCHOR3) >= 1,
    'v2155/ta A9: 三个锚点在本文件里至少各引用 1 次');
}

// ── B 运行时（真仓库上的三面读数）───────────────────────────
function runB(a) {
  const r = audit.scan({});
  const f = r.facts;
  a(f.files > 100, 'v2155/ta B1: 锁文件面非空（实 ' + f.files + ' 个）');
  a(f.uniformLocks > 0 && f.uniformAnchors > 0, 'v2155/ta B2: 统一档读数非空（' + f.uniformLocks + ' 把 / ' + f.uniformAnchors + ' 条）');
  a(f.nonUniformLocks > 0 && f.nonUniformAnchors > 0, 'v2155/ta B3: 非统一档读数非空（' + f.nonUniformLocks + ' 把 / ' + f.nonUniformAnchors + ' 条锚点）');
  a(f.anchorDecls > 100 && f.anchorUniq > 0 && f.anchorUniq <= f.anchorDecls,
    'v2155/ta B4: 锚点声明 ' + f.anchorDecls + ' / 去重 ' + f.anchorUniq + '（去重数不得超声明数）');
  a(f.targets > 50, 'v2155/ta B5: 锚点靶子面非空（实 ' + f.targets + ' 个）');
  a(f.ledgerModules > 0, 'v2155/ta B6: 模块登记表读到了（实 ' + f.ledgerModules + ' 个）');
  a(f.gate === true, 'v2155/ta B7: 真仓库上精确面通过（gate=' + f.gate + '）—— 它红了就是真漂移');
  a(r.problems.length > 0 && r.problems.every(function (p) { return p.kind && p.detail; }),
    'v2155/ta B8: 逐条问题都带 kind 与 detail（只给数字的体检报告没法处理）');
  const out = audit.fmt(r);
  a(out.indexOf('精确面（gate）') >= 0 && out.indexOf('只报不红') >= 0,
    'v2155/ta B9: 输出把「门禁面」与「只报不红」写在同一张报告里（读的人不必猜哪个数字算失败）');
}

// ── N 负控制（注入面驱动；**不动真仓库任何文件**）───────────
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');

  if (countOcc(orig, ANCHOR) !== 1) throw new Error('N0 锚点未恰中 1 次：' + countOcc(orig, ANCHOR));
  if (countOcc(orig, ANCHOR2) !== 1) throw new Error('N0b 锚点二未恰中 1 次：' + countOcc(orig, ANCHOR2));
  if (countOcc(orig, ANCHOR3) !== 1) throw new Error('N0c 锚点三未恰中 1 次：' + countOcc(orig, ANCHOR3));

  // N1 破坏**精确面**（统一档锚点问题 1）⇒ gate 必红。
  //   这是「gate 真在管它该管的事」的第一半。
  const n1 = audit.scan({
    ls: function () { return ['ui-gate.js']; },
    read: function (rel) { return rel === 'tests/ui-gate.js' ? "const A = 'rw2155n1';" : ''; },
    exists: function () { return true; },
    anchorRow: { uniform: { locks: 9, anchors: 40, problems: 1,
      rows: [{ file: 'tests/x-v2155.js', problems: [{ target: 'engines/world-seed.js', hits: 0 }] }] },
      nonUniform: { total: 0, anchors: 0, issues: 0 } },
    ledger: { modules: {} }
  });
  a(n1.gate === false && n1.facts.uniformProblems === 1,
    'v2155/ta N1: 统一档锚点漂移 1 条 ⇒ gate 变红（实 gate=' + n1.gate + '）—— 这就是「真漂移」的样子');

  // N2 破坏**精确面**的另一半（登记文件消失）⇒ gate 必红
  const n2 = audit.scan({
    ls: function () { return ['ui-gate.js']; },
    read: function (rel) { return rel === 'tests/ui-gate.js' ? "const A = 'rw2155n2';" : ''; },
    exists: function (rel) { return rel !== 'engines/gone.js'; },
    anchorRow: { uniform: { locks: 9, anchors: 40, problems: 0, rows: [] }, nonUniform: { total: 0, anchors: 0, issues: 0 } },
    ledger: { modules: { 'engines/gone.js': {} } }
  });
  a(n2.gate === false && n2.facts.ledgerGone === 1,
    'v2155/ta N2: 登记表里的模块文件消失 1 个 ⇒ gate 变红（实 gate=' + n2.gate + '）—— 登记面空转是真失败');

  // N3 **启发面**破坏（靶子消失 8 条）⇒ gate **必须不变**。
  //   这是本版最要紧的一条：超集面一旦进了 gate，工具会天天喊狼来了，
  //   而真漂移就被淹在噪声里。
  const tripwire = ['core/a.js', 'engines/x.js', 'core/y.js', 'compat/__v2900_probe.js',
    'engines/render-illust.js', 'core/__g19_probe.js', 'tools/x.js', 'tests/deadlock.js'];
  const n3 = audit.scan({
    ls: function () { return ['ui-gate.js']; },
    read: function (rel) { return rel === 'tests/ui-gate.js' ? "const TARGET_A = 'core/a.js';" : ''; },
    exists: function (rel) { return tripwire.indexOf(rel) < 0; },
    anchorRow: { uniform: { locks: 9, anchors: 40, problems: 0, rows: [] }, nonUniform: { total: 0, anchors: 0, issues: 0 } },
    ledger: { modules: {} }
  });
  a(n3.facts.targetsGone === 1 && n3.gate === true,
    'v2155/ta N3: 靶子消失 ⇒ 进 problems 但 **gate 不变**（实 targetsGone=' + n3.facts.targetsGone
    + ' / gate=' + n3.gate + '）—— 启发面是超集，把超集当判据只会天天喊狼来了');
  a(n3.problems.some(function (p) { return p.kind === 'target-gone'; }),
    'v2155/ta N3b: 那条启发面提示仍在 problems 里（不红 ≠ 不说）');

  // N4 重复率分母：**跨文件**重复同一段锚点原文 ⇒ 重复率必须真涨（分母是声明数不是去重数）
  //   注意不能用「同一文件里写 3 遍」造场：`extract()` 内部会去重，同一把锁自己抄两遍
  //   到这里只剩 1 条 —— 初版就这么写，实测 declTotal 3 / uniq 3 / 率 0（**假绿**）。
  const dupTxt = 'rw2155dupA长锚点文本';
  const n4 = audit.scan({
    ls: function () { return ['a.js', 'b.js', 'c.js']; },
    read: function (rel) {
      if (rel === 'tests/a.js') return "const A1 = '" + dupTxt + "';\nconst A2 = 'rw2155onlyA长锚点文本';";
      if (rel === 'tests/b.js') return "const B1 = '" + dupTxt + "';\nconst B2 = 'rw2155onlyB长锚点文本';";
      return "const C1 = '" + dupTxt + "';";
    },
    exists: function () { return true; },
    anchorRow: { uniform: { locks: 9, anchors: 40, problems: 0, rows: [] }, nonUniform: { total: 0, anchors: 0, issues: 0 } },
    ledger: { modules: {} }
  });
  a(n4.facts.anchorDecls === 5 && n4.facts.anchorUniq === 3 && n4.facts.dupAnchors === 1,
    'v2155/ta N4: 三文件共享同一段锚点原文 ⇒ 跨文件重复真被数出（声明 ' + n4.facts.anchorDecls
    + ' / 去重 ' + n4.facts.anchorUniq + ' / 重复处 ' + n4.facts.dupAnchors + ' · 率 '
    + n4.facts.dupRate.toFixed(2) + '）');

  // N5 阀值：把跨文件重复率推过 0.30 ⇒ 报 anchor-dup；反之不报
  const manyFiles = (function () { const L = []; for (let i = 0; i < 10; i++) L.push('f' + i + '.js'); return L; })().concat(['u1.js', 'u2.js', 'u3.js']);
  const sameTxt = 'rw2155same重复锚点文本';
  const n5 = audit.scan({
    ls: function () { return manyFiles; },
    read: function (rel) {
      if (/^tests\/f/.test(rel)) return "const S = '" + sameTxt + "';";
      return "const U = 'rw2155uniq" + rel.replace(/[^a-z0-9]/gi, '') + "长锚点文本';";
    },
    exists: function () { return true; },
    anchorRow: { uniform: { locks: 9, anchors: 40, problems: 0, rows: [] }, nonUniform: { total: 0, anchors: 0, issues: 0 } },
    ledger: { modules: {} }
  });
  a(n5.facts.dupRate > audit.DUP_THRESHOLD
    && n5.problems.some(function (p) { return p.kind === 'anchor-dup' && p.samples.length > 0; }),
    'v2155/ta N5: 重复率 ' + n5.facts.dupRate.toFixed(2) + ' 超阀值 ' + audit.DUP_THRESHOLD
    + ' ⇒ 报 anchor-dup 并附样本（建议合并是真建议，不是装饰）');

  // N6 真文件逐字未变 —— 本锁全程**没碰过仓库**（注入面驱动）
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig,
    'v2155/ta N6: 真源码文件逐字未变（负控制走注入面，零文件改写）');
  a(fs.existsSync(path.join(BASE, 'tests/deadlock.js')) === false,
    'v2155/ta N6b: 真仓库里 tests/deadlock.js 本来就不存在（N3 里的「消失」是注入面造的，不是删掉的）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, ANCHOR3, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('TEST-AUDIT-V2155: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
