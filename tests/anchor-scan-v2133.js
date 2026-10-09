#!/usr/bin/env node
// WorldAxis tests/anchor-scan-v2133.js —— v2.133.0（O18 第二刀）
//
// 【它治的病：扫描器认不出「本仓自己的惯用写法」】
//   `tools/anchor-scan.js`（v2.126.0 / O18 第一刀）把锚点覆盖面从 20 把推到 104 把。
//   它留下了 11 把「认不出」的锁，其中 4 把的理由是**认不出目标文件**。逐一侦察后发现：
//   `journal-v2940` / `perf-recalc-v2123` / `life-turn-v2132` 三把锁的目标面写的是
//     const ORG = 'engines/org.js', STORE = 'core/store.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
//   —— **逗号分隔的多常量声明串**，而当时的 `file-const` 只认单条 `const NAME = '…';`
//   （正则里 `[^;]*` 一遇逗号就断）。这是本仓的**惯用写法**（一行钉住本锁关心的全部目标文件），
//   不是异常写法 ⇒ 该改的是扫描器，不是源码。
//
// 【本版落点（四件，全部有现场取证）】
//   ① `file-const-multi`：外层切「一条 const 语句」，内层 `each` 子模式在串内逐个取目标。
//      实测：三把锁从 `unidentified` 转为已识别，覆盖 101 → **104（92.86%）**，未识别 11 → **8**。
//   ② `txt-field` **翻案恢复**。v2.131.0 曾以「`--self-test` 实测零贡献」删掉它 ——
//      那条结论是**判据范围**造成的假象（见下「代理判据」）。恢复后 journal-v2940 的锚点
//      1 条 → **7 条**（+6 条全是 txt 字段，即它的 6 个真破坏锚点第一次被看见）。
//   ③ `exclude` 增「声明串门」：`const A = 'x', B = 'y';` 的**整串**此前被 `anchor-const`
//      误收成锚点原文（现场 5 条：journal-v2940 / perf-recalc-v2123 ×2 / life-turn-v2132 /
//      rumor-e3-v2115 的 `PLAIN = '甲', EYE = '乙', FAR = '丙'`）。它们是目标面的猎物，不是锚点。
//   ④ `file-const` **当场删除**（零消费能力）：摘除自证实测它三项读数零变化（猎物全被 ① 收走）
//      ⇒ 留着就是一条不参与判定的死判据。合并后外层 `[^;]*?` 允许跨行，能力只增不减。
//
// 【本版最值得记的一件：**代理判据**第二次现身】
//   v2.131.0 的自证口径是「**已识别锁**的锚点总量」：
//       if (ex.anchors.length && ex.targets.length) { n += ex.anchors.length; locked++; }
//   于是 `txt:` 字段**只存在于 journal-v2940 一把**、而那把锁当时因目标面认不出整体落在
//   `unidentified` ⇒ 它的 6 条锚点**从不进入统计** ⇒ 自证报「摘掉 txt-field 后总量不变」。
//   判据范围（只统计已识别锁）与被测对象（识别能力）不是同一件事。
//   现场两向取证（/tmp/wa_hist2.js，装载 HEAD 版形态表复跑两套口径）：
//     HEAD 形态表 · old 口径  base 锚点 549 / +txt 锚点 549  ⇒ 判「不可观测」（于是被删）
//     HEAD 形态表 · new 口径  base 锚点 576 / +txt 锚点 582  ⇒ 判「可观测」（差 6 条）
//   本版把口径改成**三分量分别统计**（anchors / targets / locks，含未识别锁），
//   并把「逐个摘掉」从只摘 anchor 面扩到**全部模式**（target 面模式同样要证明自己在参与判定）。
//   自证项数 2 → 8（模式表全摘）+ 3 个门（值拒收表 / 收尾门 / exclude 声明串门）。
//
// 【判据结构（与 anchor-scan-v2126 / delete-gate-v2124 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 负控制（真源码破坏 ⇒ 装载破坏副本 ⇒ 同款真判据现形）
//   N 纯度：全部负控制跑完后两个真文件逐字未变。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const SCAN_REL = 'tools/anchor-scan.js';
const LOCK_V2126 = 'tests/anchor-scan-v2126.js';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
// ── 隔离装载（与 v2126 同法）：把扫描器装进独立 vm，破坏副本落进沙箱 ──────────
function loadScan(srcOverride) {
  const code = (srcOverride || src(SCAN_REL)).split('\n')
    .filter(function (l, i) { return !(i === 0 && l.indexOf('#!') === 0); }).join('\n');
  const m = { exports: {} };
  const sandbox = {
    module: m, exports: m.exports, require: require,
    __dirname: path.dirname(path.join(BASE, SCAN_REL)),
    __filename: path.join(BASE, SCAN_REL),
    console: console, process: process, Buffer: Buffer,
    setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  sandbox.global = sandbox; sandbox.globalThis = sandbox;
  vm.runInNewContext('(function(module, exports, require, __dirname, __filename){' + code + '\n})'
    + '(module, exports, require, __dirname, __filename)', sandbox, { filename: SCAN_REL });
  return m.exports;
}
// ── 真源码破坏锚点（各须恰中 1 次；判据一律引用 ANCHORS.x.txt）────────────
const ANCHORS = {
  // ① 目标面：子模式（`each`）—— 摘掉它 ⇒ 声明串里的文件常量一个也认不出
  eachMulti: { rel: SCAN_REL, txt: 'each: /\\b([A-Z][A-Z0-9_]*)\\s*=\\s*([\'"`])([a-z][\\w.-]*\\/[\\w.-]+\\.js)\\2/g },' },
  // ② 锚点面：`txt:` 字段模式 —— 摘掉它 ⇒ journal-v2940 的 6 个真破坏锚点重新隐形
  //   破坏点选 `re:` 那一行（**不是** id 行）：改 id 只换名字，正则照跑 ⇒ 破坏不生效，
  //   而「破坏不生效」会以「判据无反应」的形态被读成「判据坏了」（本仓点名过的假绿第三形）。
  txtField: { rel: SCAN_REL, txt: 're: /\\btxt\\s*:\\s*([\'"`])([\\s\\S]*?)\\1/g,' },
  // ③ 声明串门（exclude 的第三条）—— 摘掉它 ⇒ 声明串整串被误收成锚点原文
  declGate: { rel: SCAN_REL, txt: '|| /,\\s*[A-Z][A-Z0-9_]*\\s*=\\s*[\'"`]/.test(val);' },
  // ④ 自证口径：三分量统计 —— 退回「只统计已识别锁」是本版治的那条代理判据
  threeWay: { rel: SCAN_REL, txt: 'anchors += ex.anchors.length;          // v2.133.0：**不再以「已识别」为门**（教训二）' },
  // ⑤ 自证范围：全部模式逐个摘（原版只摘 anchor 面）
  allPatterns: { rel: SCAN_REL, txt: 'PATTERNS.forEach(function (p) {' },
  // ⑥ 死判据已删（零消费能力）：单条版 `file-const` 不得复活
  deadFileConst: { rel: SCAN_REL, txt: "{ id: 'file-const', what: 'const REL/FILE/MOD = \"rel\"（唯一的文件常量）'," }
};
// ── A 面：结构 ──────────────────────────────────────────────────────
function runA(a) {
  const s = src(SCAN_REL);
  Object.keys(ANCHORS).forEach(function (k) {
    if (k === 'deadFileConst') return;                     // 反向锚点（要求 0 次），单独判
    const n = hits(s, ANCHORS[k].txt);
    a(n === 1, 'v2133/A: 锚点 ' + k + ' 在 ' + SCAN_REL + ' 里恰 1 次（实 ' + n + '）');
  });
  a(hits(s, ANCHORS.deadFileConst.txt) === 0,
    'v2133/A: 单条版 `file-const` 已删除（零消费能力 ⇒ 不留死判据）');
  const M = loadScan();
  const multi = (M.PATTERNS || []).filter(function (p) { return p.id === 'file-const-multi'; })[0];
  // 注意：跨 realm 的 `instanceof RegExp` 恒 false（vm 沙箱有独立的 RegExp 构造器）——
  //   判据改成 `Object.prototype.toString` 口径（跨 realm 稳定），这是本仓「判据别钉在代理量上」的一例。
  function isRe(x) { return Object.prototype.toString.call(x) === '[object RegExp]'; }
  a(!!multi && multi.kind === 'target' && isRe(multi.each),
    'v2133/A: `file-const-multi` 在位且带 `each` 子模式（一条声明串里取多个目标）');
  const txt = (M.PATTERNS || []).filter(function (p) { return p.id === 'txt-field'; })[0];
  a(!!txt && txt.kind === 'anchor',
    'v2133/A: `txt-field` 已恢复（v2.131.0 以「零贡献」删除它的那条结论是代理判据造成的）');
  a(typeof M.scan === 'function' && typeof M.extract === 'function' && typeof M.scanLock === 'function',
    'v2133/A: 导出面未变（scan / extract / scanLock —— 消费方 v2126 锁与 run.js 不破）');
  a(hits(s, ANCHORS.threeWay.txt) === 1 && hits(s, ANCHORS.allPatterns.txt) === 1,
    'v2133/A: 自证口径为三分量 + 全模式摘（原口径「只统计已识别锁」是本版治的代理判据）');
  // 反向：那条代理判据的**旧写法**不得残留
  a(hits(s, 'if (ex.anchors.length && ex.targets.length) { n += ex.anchors.length; locked++; }') === 0,
    'v2133/A: 旧口径（以「已识别」为门）已消失 —— 否则 txt-field 会再被判一次「零贡献」');
  // 与 v2126 锁并存：两把锁的破坏锚点不得互相踩（同文件、不同锚点串）
  const S26 = src(LOCK_V2126);
  Object.keys(ANCHORS).forEach(function (k) {
    if (k === 'deadFileConst') return;
    a(S26.indexOf(ANCHORS[k].txt) < 0,
      'v2133/A: 本锁锚点 ' + k + ' 未被 v2126 锁引用（两把锁的破坏点互不重叠）');
  });
}
// ── B 面：运行时（原版成绿）─────────────────────────────────────────
function runB(a) {
  const M = loadScan();
  const r = M.scan({});
  a(r.summary.reach === r.uniform.locks + r.nonUniform.scanned,
    'v2133/B: 覆盖数 = 统一档 + 非统一档已识别（' + r.uniform.locks + ' + ' + r.nonUniform.scanned
      + ' = ' + r.summary.reach + '）');
  a(r.summary.reachRate >= 92 && r.summary.reach >= 104,
    'v2133/B: 覆盖率 ≥ 92%（实 ' + r.summary.reachRate + '% / ' + r.summary.reach + ' 把）'
      + ' —— O18 第一刀是 39.81% → 90.18%，本版再推一档');
  a(r.nonUniform.unidentified <= 8,
    'v2133/B: 未识别 ≤ 8 把（实 ' + r.nonUniform.unidentified + '）—— 三把「认不出目标文件」的锁已落地');
  a(r.uniform.problems === 0 && r.summary.gateProblems === 0,
    'v2133/B: 统一档零问题且门禁面为零（非统一档「只报不红」口径未变）');
  // 三把锁逐把：目标面必须认出来，且**不再**落在 unidentified
  const unid = {};
  r.unidentified.forEach(function (u) { unid[u.file] = u.why; });
  ['journal-v2940.js', 'perf-recalc-v2123.js', 'life-turn-v2132.js'].forEach(function (f) {
    a(!unid[f], 'v2133/B: ' + f + ' 已被识别（此前理由：认不出目标文件）');
    const s = r.scanned.filter(function (x) { return x.file === f; })[0];
    a(!!s && s.targets >= 3, 'v2133/B: ' + f + ' 目标面 ≥ 3 个（实 ' + (s ? s.targets : '(未识别)') + '）');
  });
  // ② 的直接读数：journal-v2940 的 6 个 txt 锚点第一次进入统计
  const j = r.scanned.filter(function (x) { return x.file === 'journal-v2940.js'; })[0];
  a(!!j && j.anchors >= 6,
    'v2133/B: journal-v2940 锚点 ≥ 6 条（实 ' + (j ? j.anchors : 0) + '）'
      + ' —— 修复前是 1 条（6 个真破坏锚点全部隐形，而自证因范围问题判它「零贡献」）');
  // ③ 的直接读数：声明串不再被当成锚点原文（逐条点名现场那 5 条）
  const bad = [];
  r.scanned.forEach(function (x) {
    x.problems.forEach(function (p) {
      if (p.kind === 'ambiguous-target' && /^[A-Z][A-Z0-9_]* = '/.test(p.evidence)) bad.push(x.file + ' :: ' + p.evidence.slice(0, 40));
    });
  });
  a(bad.length === 0, 'v2133/B: 无「声明串被当成锚点原文」的残留（实 ' + bad.length + ' 条）'
    + (bad.length ? '：' + bad.slice(0, 3).join(' | ') : ''));
  // ④ 死判据已删的行为面：`file-const-multi` 必须能独立吃下**单条**形态（合并后能力不缩）
  const single = 'const REL = \'engines/world.js\';\n';
  const ex1 = M.extract(single);
  a(ex1.targets.length === 1 && ex1.targets[0] === 'engines/world.js',
    'v2133/B: 合并后的 `file-const-multi` 仍认单条形态（实 ' + JSON.stringify(ex1.targets) + '）');
  const multi2 = 'const A = \'engines/a.js\', B = \'core/b.js\';\n';
  const ex2 = M.extract(multi2);
  a(ex2.targets.length === 2 && ex2.anchors.length === 0,
    'v2133/B: 声明串取到 2 个目标且**不产生锚点**（实 目标 ' + JSON.stringify(ex2.targets)
      + ' / 锚点 ' + ex2.anchors.length + '）');
  // 跨行声明串（合并后外层放宽到 `[^;]*?` 的直接收益）
  const multi3 = 'const A =\n  \'engines/a.js\',\n  B = \'core/b.js\';\n';
  const ex3 = M.extract(multi3);
  a(ex3.targets.length === 2, 'v2133/B: 跨行声明串也取到 2 个目标（实 ' + ex3.targets.length + '）');
  // ⑤ 自证 CLI：两向自证必须真通过（子进程跑，避免污染本进程）
  const cp = require('child_process');
  const st = cp.spawnSync(process.execPath, [path.join(BASE, SCAN_REL), '--self-test'],
    { cwd: BASE, encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL' });
  a(st.status === 0, 'v2133/B: `--self-test` 退出码 0（实 ' + st.status + '）'
    + (st.status === 0 ? '' : ' :: ' + String(st.stdout || st.stderr || '').slice(-300)));
  const out = String(st.stdout || '');
  a(out.indexOf('全部破坏可观测') > 0, 'v2133/B: 自证结论含「全部破坏可观测」');
  a(/摘掉 file-const-multi\s*\[target\] ⇒ 破坏可观测/.test(out),
    'v2133/B: 自证**覆盖 target 面**（原版只摘 anchor 面，目标面模式从不被自证）');
  a(out.indexOf('摘掉 txt-field') > 0 && out.indexOf('摘掉 exclude 的声明串门') > 0,
    'v2133/B: 自证含 txt-field 与 exclude 声明串门两项');
}
// ── C 面：负控制（真源码破坏 ⇒ 装载破坏副本 ⇒ 同款真判据现形）────────────
function runC(a) {
  const S0 = src(SCAN_REL);
  const W = loadScan();
  function wreck(anchor, repl) {
    const n = hits(S0, anchor);
    a(n === 1, 'v2133/C: 破坏锚点恰 1 处（实 ' + n + '）:: ' + anchor.slice(0, 50));
    if (n !== 1) return null;
    const out = S0.split(anchor).join(repl);
    a(out !== S0, 'v2133/C: 破坏真的改动了源码文本');
    return out;
  }
  // C1 摘掉 `each` 子模式 ⇒ 三把锁回落未识别（覆盖面收缩）
  const b1 = wreck(ANCHORS.eachMulti.txt, 'each: /__DEAD__/ },');
  if (b1) {
    const r1 = loadScan(b1).scan({});
    a(r1.summary.reach < W.scan({}).summary.reach,
      'v2133/C1: 摘掉 each 子模式 ⇒ 覆盖 ' + W.scan({}).summary.reach + ' → ' + r1.summary.reach
        + '（声明串形态的锁重新认不出）');
    a(r1.unidentified.some(function (u) { return u.file === 'journal-v2940.js' && u.why; }),
      'v2133/C1: journal-v2940 重新落入未识别且带原因（不静默变成「零问题」）');
  }
  // C2 摘掉 `txt-field` 的**正则** ⇒ journal 锚点数下降（**这条判据在 v2.131.0 下会假绿**）
  const b2 = wreck(ANCHORS.txtField.txt, 're: /__DEAD__/g,');
  if (b2) {
    const M2 = loadScan(b2);
    const r2 = M2.scan({});
    const withTxt = W.scan({}).scanned.filter(function (x) { return x.file === 'journal-v2940.js'; })[0];
    const noTxt = r2.scanned.filter(function (x) { return x.file === 'journal-v2940.js'; })[0];
    // 现场实测（本锁首轮）：journal-v2940 的锚点**全部**来自 txt 字段（6/6），
    //   声明串已被 exclude 挡掉 ⇒ 摘掉 txt-field 后它锚点归零、整体落入未识别。
    //   故判据写成「原版有锚点 / 破坏版归零且如实进未识别」，比「数量下降」更贴事实。
    a(!!withTxt && withTxt.anchors >= 6 && !noTxt,
      'v2133/C2: 摘掉 txt-field ⇒ journal-v2940 锚点 ' + (withTxt && withTxt.anchors)
        + ' → ' + (noTxt ? noTxt.anchors : '0（整体回落未识别）') + '（真贡献，不是「零贡献」）');
    a(r2.unidentified.some(function (u) { return u.file === 'journal-v2940.js' && u.why; }),
      'v2133/C2: 破坏后该锁如实落入未识别并带原因（不静默变成「零问题」）');
    // 两向：原版上同一判据**不**为假报
    a(withTxt.anchors >= 6 && !noTxt,
      'v2133/C2:（两向自证）原版锚点 ≥ 6 而破坏版归零 —— 判据真在测被测对象');
  }
  // C3 摘掉声明串门 ⇒ 假锚点回归（锚点总量上升，且是**声明串**形态）
  const b3 = wreck(ANCHORS.declGate.txt, '|| false;');
  if (b3) {
    const M3 = loadScan(b3);
    const jReal = W.extract(src('tests/journal-v2940.js'));
    const jBroken = M3.extract(src('tests/journal-v2940.js'));
    a(jBroken.anchors.length > jReal.anchors.length,
      'v2133/C3: 摘掉声明串门 ⇒ journal-v2940 锚点 ' + jReal.anchors.length + ' → '
        + jBroken.anchors.length + '（声明串被误收成锚点原文）');
    a(jBroken.anchors.some(function (x) { return /,\s*[A-Z][A-Z0-9_]*\s*=\s*['"`]/.test(x.txt); }),
      'v2133/C3: 误收的正是「逗号 + 次级声明」形态（形态可辨，不是数量噪声）');
  }
  // C4 把自证口径退回「只统计已识别锁」⇒ 在**当时的形态**下 txt-field 会被误判成死判据。
  //    这条破坏证明的是**口径判据本身**承重：退回后 `--self-test` 必须失败（因为 txt-field
  //    的猎物是「已识别锁」里的 journal-v2940 —— 退回口径后它仍被统计，故需连**目标面**一起退）。
  //    做法：把三分量退回单分量（只 anchors），并把范围门退回「已识别」⇒ 目标面模式全部不可观测。
  const b4 = wreck(ANCHORS.threeWay.txt, 'if (ex.anchors.length && ex.targets.length) { anchors += ex.anchors.length; locks++; }');
  if (b4) {
    const b4b = b4.split(ANCHORS.allPatterns.txt)
      .join('PATTERNS.filter(function (p) { return p.kind === \'anchor\'; }).forEach(function (p) {');
    a(b4b !== b4, 'v2133/C4: 口径退回改造成功（两个锚点都命中）');
    const cp = require('child_process');
    const tmp = path.join(require('os').tmpdir(), 'wa2133-c4-' + process.pid + '.js');
    fs.writeFileSync(tmp, b4b);
    const st = cp.spawnSync(process.execPath, [tmp, '--self-test'],
      { cwd: BASE, encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL' });
    a(st.status !== 0,
      'v2133/C4: 退回旧口径（单分量 + 只摘 anchor 面）⇒ `--self-test` 失败（实退出码 ' + st.status + '）'
        + ' —— 口径本身是承重判据，不是注释');
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
  // C5 纯度：两个真文件逐字未变 + 原版判据仍为真
  a(src(SCAN_REL) === S0, 'v2133/C5:（纯度）全部负控制跑完后 ' + SCAN_REL + ' 逐字未变');
  a(src(LOCK_V2126).indexOf('const AUDIT = require(') > 0,
    'v2133/C5:（纯度）v2126 锁未被本锁的负控制改动');
  const back = loadScan().scan({});
  a(back.summary.reach >= 104 && back.nonUniform.unidentified <= 8,
    'v2133/C5:（纯度）原版上同款判据为真（覆盖 ' + back.summary.reach + ' / 未识别 '
      + back.nonUniform.unidentified + '）—— 两向自证成立');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); }),
  REL: SCAN_REL
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); } catch (e) { fail++; console.log('  x A threw: ' + (e && e.stack)); }
  try { runB(a); } catch (e) { fail++; console.log('  x B threw: ' + (e && e.stack)); }
  try { runC(a); } catch (e) { fail++; console.log('  x C threw: ' + (e && e.stack)); }
  if (fail) { console.log('ANCHOR-SCAN-V2133: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('ANCHOR-SCAN-V2133: pass（' + pass + ' 项）');
}
