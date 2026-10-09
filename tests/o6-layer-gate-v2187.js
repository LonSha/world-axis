#!/usr/bin/env node
// WorldAxis tests/o6-layer-gate-v2187.js — 分层选区入口门禁（O6，v2.187.0）
//
// ── 它守的是什么 ───────────────────────────────────────────────────────
//   计划 O6 原文：「提供分层入口（快 / 中 / 全），用现有 section 名与专锁文件做分层依据；
//   慢节显式标注并可选跳过；输出落盘以避免大输出 PIPE 死锁」。
//   边界：「分层不得改变全量判据；跳过只允许显式声明并记录在读数里；
//   全量入口仍是 `node tests/run.js`，分层入口是它的真子集」。
//
//   由此拆出四条**可机械判定**的判据，各对应一种现场踩到过的失效形态：
//     A. **单一真源**：裁定只有一份。run.js 若自己再写一遍 `matched/selfContained`，
//        两处必然漂移 —— 而漂移的表现是「门禁说一致、跑起来不一致」。
//        判据：run.js 的选区段里**必须**调 `test-layers.select(`，且**不得**出现
//        自己实现的 `selfContained` 直接判定；test-layers 必须导出 `select`。
//     B. **真子集**：分层入口不得改变全量判据形态 —— 不给选区时 `section()` 的
//        执行路径逐字不变（判据：`__layerOn` 为假时 `__layerVerdict` 首个分支直接 `return 'run'`）；
//        且选区只可能**减少**执行的节（不可能凭空多跑一节）。
//     C. **跳过必须显式**：三态裁定 run/skip/refuse 各有落点；refuse **不是跳过**
//        （被点名的节不可独跑时以 exit 3 收尾，不许给出通过结论）；跳过项要计数并打印。
//        v2.187.0 收口：这一段此前靠「真跑一次 run.js 看退出码」来验，**跑不通** ——
//        实测 900s 超时，根因是裸语句节的节体在 `section()` 提前返回时仍然全跑
//        （229 节里 90 节是裸语句形态）。故把收尾裁定抽成 `test-layers.buildOutcome()`
//        纯函数，判据拿**真返回**驱动三态（比只看退出码更严：三态每个字段都在判据里），
//        并加一条否定式判据 —— run.js 的**执行行**里不许再出现手写条件式。
//     D. **省时是真的**（v2.187.0 收口新增，治「假分层」）：`tools/prune-sections.js`
//        必须能把未选中节的**节体**从源码里拿掉（不是只把打印注释掉），且
//        ① 裁剪版过 `node --check`；② 合成源自证里「未选中节的副作用**真的没发生**」。
//        这条判据的分母是**副作用文件**，不是 stdout —— 「没打印」证明不了「没执行」。
//
// ── 负控制（N 系列，都在内存副本上做真破坏）────────────────────────────
//   N1 合成源里把「块节被省略」的实现摘掉 ⇒ 裁剪器自证必须失败；
//   N2 run.js 的选区段换回手写三分支（删掉 `select(` 调用）⇒ A 判据必须现形；
//   N3 收尾裁定的**真源**里摘掉拒绝分支 ⇒ C10 必须现形（「拒绝」被当成「常态」）；
//   N4 prune-sections 的 `--check` 兜底被绕过（把 check 改成恒真）⇒ D 判据必须现形；
//   N6 删掉 run.js 里的 buildOutcome 调用 ⇒ C3 必须现形；
//   N7 往副本里插一个含 `/*` 的**字符串字面量** ⇒ C3 仍须命中（wired 不得失明）。
//   全部**不写死模拟常量**：破坏打在真源码的内存副本上，判据在副本上重跑。
//   负控制若与判据无反应（该红的不红）⇒ 以非零码收尾（判据失效不得算通过）。
//
// ── 本轮（v2.187.0 收口）由实跑揪出的三处**门禁自身缺陷**（全部已修，留档）──
//   ① **wired() 吞行**：v1 按行 `indexOf('/*')` 判块注释、**不解析字符串**，而 run.js 里
//      有 `section('actors/*')` 这类字符串字面量 ⇒ 它当场进入块注释态、一直吞到第 8396 行
//      才闭合：**输出 7335 行 vs 源 22090 行**。后果是 C3/C7 在真源码上**假红**
//      （判据看不见那半文件）。修法：字符串/模板串感知的状态机 + 一条恒等式判据（A12 不吞行）。
//   ② **锚点过期 ≠ 判据失败**：B3 原先钉 run.js 里那句手写条件式，而那句话按 C3 的设计
//      搬进了 test-layers.js ⇒ 锚点 0 命中、判据红。修法：B3 改钉**结论**（真返回驱动）。
//   ③ **观测错了量 + 探针转义坑**：D12 原盯 `omittedCount`，而破坏摘掉的是 `splice`
//      （「记名」是另一行）⇒ 破坏了计数仍是 1；同时 `-e` 拼串经三层转义后 `"\\n"` 成了
//      字面反斜杠 + n、源成一行 ⇒ 扫描 0 节。修法：探针落**文件**，观测量改为**行数真的下降**。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tests/o6-layer-gate-v2187.js            # 全量（A/B/C/D + N）
//   node tests/o6-layer-gate-v2187.js --methods=A,B
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const RUN_P = path.join(ROOT, 'tests', 'run.js');
const LAYERS_P = path.join(ROOT, 'tools', 'test-layers.js');
const PRUNE_P = path.join(ROOT, 'tools', 'prune-sections.js');

let pass = 0, fail = 0;
const failures = [];
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; failures.push(name); console.log('  \u2717 ' + name + (extra ? ' — ' + extra : '')); }
}

const runSrc = fs.readFileSync(RUN_P, 'utf8');
const layersSrc = fs.readFileSync(LAYERS_P, 'utf8');

/** 选区段（从 `const __layerSel` 到 `function section(`），判据只在这个范围里找。 */
function layerSeg(src) {
  const i = src.indexOf('const __layerSel');
  const j = src.indexOf('function section(');
  return (i >= 0 && j > i) ? src.slice(i, j) : '';
}

/** **只取会被执行的代码面**：剥掉块注释、行注释与串内的注释标记。
 *
 *  为什么要剥（本仓 name 过两次的老病，「提及不是引用」）：
 *    初版 A2 判据写的是「选区段里含 `select(`」，而我在同一段里加了一句注释
 *    『裁定…调 `tools/test-layers.js` 的 `select()`』—— 注释里就含 `select(`，
 *    于是**判据被一句注释满足了**；N2b 当场把它抓了出来。
 *
 *  ── v2（v2.187.0 收口重写，治一次**假红**）─────────────────────────────
 *    v1 逐行 `indexOf('/*')` 判块注释、**不解析字符串**，而 `tests/run.js` 里有
 *    `section('actors/*')` 这类**含 `/*` 的字符串字面量** ⇒ 它当场进入块注释态、
 *    一直吞到第 8396 行的第一个**注释结束标记**：实测 `wired(run.js)` 输出 **7335 行**、
 *    而源是 **22090 行**（差 14755 行）。C3/C7 因此「看不见」目标而假红。
 *    v2：逐字符状态机（块注释 / 行注释 / 单引号 / 双引号 / 模板串），
 *    **串内的注释标记只做占位（换成空格）**，其余文本原样保留 —— 于是
 *    「字符串里的 `/*`」再也没机会把后面的代码判成注释，而既有判据要看的
 *    字面量（如 `require('../tools/test-layers.js')`）仍然搜得到。
 *    如实登记：**不解析正则字面量**（正文里含注释标记的正则会把串状态带偏），故不完备；
 *    兜底是 A12 那条恒等式判据 —— 剥注释**不得吞行**。 */
function wired(src) {
  const out = [];
  let inBlock = false, inS = null, inTpl = false;
  String(src).split('\n').forEach(function (l) {
    const buf = [];
    let i = 0;
    while (i < l.length) {
      const c = l[i], n = l[i + 1];
      if (inBlock) {
        if (c === '*' && n === '/') { inBlock = false; i += 2; continue; }
        i += 1; continue;
      }
      if (inS || inTpl) {
        const q = inTpl ? '`' : inS;
        if (c === '\\') { buf.push(c); if (n !== undefined) buf.push(n); i += 2; continue; }
        if (c === q) { if (inS) inS = null; else inTpl = false; buf.push(c); i += 1; continue; }
        if ((c === '/' && (n === '/' || n === '*')) || (c === '*' && n === '/')) {
          buf.push(' '); i += 1; continue;
        }
        buf.push(c); i += 1; continue;
      }
      if (c === '/' && n === '/') break;                    // 行注释：本行到此为止
      if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
      if (c === '"' || c === "'") { inS = c; buf.push(c); i += 1; continue; }
      if (c === '`') { inTpl = true; buf.push(c); i += 1; continue; }
      buf.push(c); i += 1;
    }
    out.push(buf.join(''));
  });
  return out.join('\n');
}

// ── A. 单一真源 ───────────────────────────────────────────────────────
function runA() {
  console.log('\nA. 单一真源（裁定只有一份）');
  const L = require(LAYERS_P);
  const seg = layerSeg(runSrc);
  const segWired = wired(seg);
  a(seg.length > 0, 'A1 run.js 选区段可定位（锚点 const __layerSel → function section）');
  a(segWired.indexOf('select(') >= 0, 'A2 run.js 的裁定**执行行**里调 select()（注释里提到不算）');
  a(segWired.indexOf("require('../tools/test-layers.js')") >= 0 && segWired.indexOf('.select(') >= 0,
    'A3 该调用来自 test-layers 模块（require + .select( 都在执行行上）');
  a(segWired.indexOf('selfContained') < 0,
    'A4 run.js 不再自己判 selfContained（判据只有一份，避免两处漂移）');
  a(typeof L.select === 'function', 'A5 test-layers 导出 select（门禁与运行期同一函数）');
  // select() 的三态：用**真返回**驱动，不抄判据
  const okEntry = { name: 'x', selfContained: true, shared: [] };
  const shEntry = { name: 'x', selfContained: false, shared: ['vm.'] };
  a(L.select(okEntry, ['x']).verdict === 'run', 'A6 select(选中且可独跑) → run');
  a(L.select(okEntry, ['y']).verdict === 'skip', 'A7 select(未选中) → skip');
  a(L.select(shEntry, ['x']).verdict === 'refuse', 'A8 select(选中但共享上下文) → refuse');
  a(L.select(null, ['x']).verdict === 'refuse', 'A9 select(归属表里没有这个节) → refuse（不是静默 skip）');
  a(L.analyze().sections.length >= 200, 'A10 归属表现场复算 ≥200 节（实 ' + L.analyze().sections.length + '）');
  a(L.analyze({ src: 'section("a");\n' }).sections.length === 0,
    'A11 analyze(opt.src) 可注入 —— 负控制能在合成源上重跑同款判据');
  // A12：**剥注释不得吞行** —— 一条恒等式，专治本轮那次假红。
  //   下一次「判据莫名不命中」时，这条能立刻把方向指对：是**判据的输入面被自己的
  //   预处理器吃掉了**，还是源码里真没有。
  const wl = wired(runSrc).split('\n').length, sl = runSrc.split('\n').length;
  a(wl === sl, 'A12 wired() 逐行守恒（剥注释不吞行：' + wl + ' == 源 ' + sl + '）');
  // A13：**失明那一行本身必须还在**（前缀搜得到 ⇒ 没被整段吞掉）。
  //   注意**不能**断言「`/*` 原文逐字保留」——v2 的 wired() 按设计把**串内的注释标记
  //   占位成空格**（不占位就没法既剥注释又保住字面量），故那一行输出成 `section('actors  ')`。
  //   上一稿就是这么写的：断言与实现口径互相矛盾 ⇒ 判据红。口径写进注释，免得下次再撞。
  a(wired(runSrc).indexOf("section('actors") >= 0,
    'A13 失明那一行仍在代码面上（串内注释标记按设计占位，故不求逐字保留）');
}

// ── B. 真子集 ─────────────────────────────────────────────────────────
function runB() {
  console.log('\nB. 分层入口是全量的真子集');
  const L = require(LAYERS_P);
  const seg = layerSeg(runSrc);
  a(/if \(!__layerOn\) return 'run';/.test(seg),
    'B1 不给选区时裁定恒为 run（全量路径不受影响）');
  a(runSrc.indexOf('const __layerOn = __layerSel.length > 0;') >= 0, 'B2 分层开关由「有没有选区」决定');
  // B3：全量路径不受收尾裁定影响 —— 判据钉**结论**（真返回驱动），不钉旧文本。
  //   上一版这条钉的是 run.js 里那句手写条件式；那句话按 C3 的设计已搬进 tools/test-layers.js，
  //   于是旧锚点**必然过期**（0 命中 ⇒ 判据红 —— 那不是缺陷，是锚点跟着实现跑）。
  //   「锚点过期」与「判据失败」必须分得开，故改为断言结论本身。
  const full = L.buildOutcome([], [], []);
  a(full.kind === 'full' && full.exit === 0 && full.showLine === false && full.refuseLine === false
    && runSrc.indexOf('process.exit(0);') >= 0,
    'B3 全量路径不受分层收尾影响（不给选区 ⇒ 全量态、exit 0，且全量出口仍在）');
  const r = cp.spawnSync(process.execPath, ['-e',
    "const L=require('" + LAYERS_P + "');const m=L.analyze();" +
    "const sel=m.sections.filter(s=>L.select(s,['v2.188.0']).verdict==='run').length;" +
    "const all=m.sections.length;" +
    "process.stdout.write(JSON.stringify({sel:sel,all:all}));"], { encoding: 'utf8' });
  let ok = true, info = '';
  try {
    const j = JSON.parse(String(r.stdout || '{}'));
    ok = j.sel >= 1 && j.sel <= j.all;
    info = '选中 ' + j.sel + ' / 全部 ' + j.all;
  } catch (e) { ok = false; info = '解析失败: ' + String(r.stdout).slice(0, 80); }
  a(ok, 'B4 选区选中的节数 ∈ [1, 全部]（分层只可能减少执行面）', info);
}

// ── C. 跳过必须显式 ───────────────────────────────────────────────────
function runC() {
  console.log('\nC. 跳过必须显式；拒绝不得算跳过');
  const L = require(LAYERS_P);
  const wRun = wired(runSrc);
  a(runSrc.indexOf('__layerSkipped.push(t)') >= 0, 'C1 跳过项被收集（逐条列名，不只是计数）');
  a(runSrc.indexOf('__layerRefused.push(t)') >= 0, 'C2 拒绝项被单独收集（与跳过分开）');
  // ── C3–C5：**收尾裁定只有一份**（住 tools/test-layers.js），run.js 不许再手写一遍 ──
  //   判据一律走 wired()：run.js 的汇总段现在有**注释**逐字写着旧条件式
  //   （「本段此前自己写了两条 `if (__layerOn && …) process.exit(3)`」），
  //   直接 indexOf 会被一句解释性注释满足 —— 这正是 N2b 在本文件里抓过的老病。
  a(wRun.indexOf('.buildOutcome(') >= 0,
    'C3 run.js 的**执行行**里调 buildOutcome()（收尾裁定单一真源；注释里提到不算）');
  a(wRun.indexOf('__layerOn && __layerRefused.length') < 0,
    'C4 run.js 不再自己重写拒绝收尾条件（两处各写一遍必然漂移）');
  a(wRun.indexOf('__layerOn && !__layerRan.length') < 0,
    'C5 run.js 不再自己重写空跑收尾条件（同上）');
  a(runSrc.indexOf('分层选区: ') >= 0 && runSrc.indexOf('__layerMisses') >= 0,
    'C6 汇总段报出「实跑 / 跳过 / 拒绝 / 表外未识别」四项读数');
  a(/if \(__layerOut\.exit !== 0\) process\.exit\(__layerOut\.exit\);/.test(wRun),
    'C7 裁定结果真的被用于退出（算出来不退出等于没算）');

  // ── C8–C12：拿**真函数的真返回**驱动三态 ────────────────────────────────
  //   为什么不再真跑 run.js（本轮现场实测）：`node tests/run.js --only-v-section <必然不存在的节名>`
  //   跑了 900 秒仍未返回 —— 根因不是「选区别扭」，而是**裸语句节的节体在 section() 提前
  //   返回时仍然逐条执行**（229 节里 90 节是裸语句形态）。抽成纯函数后同一条判据毫秒级可复算，
  //   而且比「跑一趟看退出码」更严：三态的**每一个字段**都在判据里（旧写法只知道 exit 码）。
  const full = L.buildOutcome([], [], []);
  a(full.on === false && full.exit === 0 && full.showLine === false && full.refuseLine === false
    && full.kind === 'full', 'C8 不给选区 ⇒ 全量收尾（读数行与拒绝行都不打印，输出逐字不变）');
  const empty = L.buildOutcome(['x'], [], []);
  a(empty.exit === 3 && empty.refuseLine === true && empty.kind === 'empty',
    'C9 选区一节未命中 ⇒ 空跑收尾 exit 3（空跑不得算通过）');
  const ref = L.buildOutcome(['x'], [], ['y']);
  a(ref.exit === 3 && ref.refuseLine === true && ref.kind === 'refused',
    'C10 点名不可独跑的节 ⇒ 拒绝收尾 exit 3（拒绝不得算跳过）');
  const part = L.buildOutcome(['x'], ['x'], []);
  a(part.exit === 0 && part.showLine === true && part.refuseLine === false && part.kind === 'partial',
    'C11 常态 ⇒ exit 0 且打印读数行（跳过必须显式声明）');
  a(L.EXIT_OK === 0 && L.EXIT_REFUSED === 3 && L.EXIT_EMPTY === 3
    && ref.exit === L.EXIT_REFUSED && empty.exit === L.EXIT_EMPTY && part.exit === L.EXIT_OK,
    'C12 退出码常量与真返回同源（不是判据自己抄的一份数字）');

  // ── C13/C14：打印与退出的**执行路径**真跑一遍（不是只看返回结构）──────────
  const said = []; let got = -1;
  const rc = L.finish(ref, function (s) { said.push(s); }, function (c) { got = c; });
  a(rc === 3 && got === 3 && said.length === 2,
    'C13 finish() 真执行：拒绝态打印读数行 + 拒绝行（实收 ' + said.length + ' 行）并以 3 收尾',
    'said=' + said.length + ' got=' + got);
  const said2 = []; let got2 = -1;
  L.finish(full, function (s) { said2.push(s); }, function (c) { got2 = c; });
  a(got2 === 0 && said2.length === 0, 'C14 全量收尾：一行不打印、以 0 收尾（全量路径不受分层影响）');
}

// ── D. 省时是真的（治「假分层」）────────────────────────────────────────
function runD() {
  console.log('\nD. 裁剪是真的（未选中节的节体不执行）');
  const P = require(PRUNE_P);
  a(typeof P.prune === 'function' && typeof P.check === 'function', 'D1 prune-sections 导出 prune/check');
  const secs = P.scan(fs.readFileSync(RUN_P, 'utf8'));
  a(secs.length >= 200, 'D2 真源扫描出 ≥200 节（实 ' + secs.length + '）');
  const blocks = secs.filter(function (s) { return s.block; });
  a(blocks.length >= 100, 'D3 可裁块节 ≥100（实 ' + blocks.length + '）—— 分层省时的分母');
  // 合成源自证（真执行 + 副作用文件）
  const r = cp.spawnSync(process.execPath, [PRUNE_P, '--self-test'], { cwd: ROOT, encoding: 'utf8' });
  a(r.status === 0, 'D4 裁剪器自证 exit 0（实 ' + r.status + '）');
  a(String(r.stdout).indexOf('未选中块节 A 真不执行') >= 0
    && String(r.stdout).indexOf('副作用文件不在') >= 0,
    'D5 自证覆盖「未选中 ⇒ 副作用文件真的不存在」（不是只看 stdout）');
  a(String(r.stdout).indexOf('选中节 B 真执行') >= 0, 'D6 自证含正向（选中节真执行，判据不是恒假）');
  a(String(r.stdout).indexOf('扫描器认出 4 个节') >= 0,
    'D7 自证含「形态自证」（合成源与真源同缩进形态 —— 本轮第一次就栽在这）');
  // 不做全量裁剪（慢）：只验「单个块节删掉后仍能被解析」这条兜底真的在跑
  const srcOne = "  section('t');\n  {\n    const x = 1;\n    if (x) { console.log(x); }\n  }\n";
  const pr = P.prune(srcOne, ['\u0000none']);
  a(pr.stats.omittedCount === 1 && pr.stats.srcLines > pr.stats.outLines,
    'D9 块节被省略（行数下降：' + pr.stats.srcLines + ' → ' + pr.stats.outLines + '）');
  const tmp = path.join(require('os').tmpdir(), 'wa-o6-gate-' + process.pid + '.js');
  fs.writeFileSync(tmp, pr.text);
  let chk = true;
  try { P.check(tmp); } catch (e) { chk = false; }
  fs.unlinkSync(tmp);
  a(chk, 'D8 裁剪结果过 node --check（硬兜底在跑）');
  // D10：降级链的入口必须真的导出（`main()` 走的那条路 === 门禁验的那条路）
  a(typeof P.pruneSafe === 'function',
    'D10 pruneSafe 被导出（门禁验的就是 main() 真正走的那条带降级的路）');
  // D11–D13：真源码破坏 → 在**破坏副本**上重跑同款判据 ⇒ 必须现形
  const brokenPruneD = fs.readFileSync(PRUNE_P, 'utf8').replace(
    'lines.splice(s.line, s.closeLine - s.line + 1, placeholder);',
    '/* 破坏：块节省略被关掉 */');
  a(brokenPruneD !== fs.readFileSync(PRUNE_P, 'utf8'), 'D11 破坏「块节被省略」⇒ 破坏可观测');
  const tmpP = path.join(require('os').tmpdir(), 'wa-o6-gate-broken-' + process.pid + '.js');
  fs.writeFileSync(tmpP, brokenPruneD);
  // 探针落**文件**，不用 `-e` 拼串：上一稿在这里踩过一个转义坑 ——
  //   `-e` 参数经多层转义后，`"\\n"` 到 JS 里成了**字面反斜杠 + n**，源文本成一行
  //   ⇒ 扫描出 0 节 ⇒ 判据恒假。落文件的探针没有这层不确定性。
  const probeFile = path.join(require('os').tmpdir(), 'wa-o6-gate-probe-' + process.pid + '.js');
  fs.writeFileSync(probeFile, [
    "'use strict';",
    "const P = require(process.argv[2]);",
    'const src = "  section(\'t\');\\n  {\\n    const x = 1;\\n  }\\n";',
    "const r = P.prune(src, ['\\u0000none']);",
    "process.stdout.write(JSON.stringify({ o: r.stats.omittedCount, s: r.stats.srcLines, u: r.stats.outLines }));"
  ].join('\n'));
  const probeOmit = function (mod) {
    const rr = cp.spawnSync(process.execPath, [probeFile, mod], { encoding: 'utf8' });
    try { return JSON.parse(String(rr.stdout || '{}')); } catch (e) { return { err: String(rr.stdout || rr.stderr) }; }
  };
  const omB = probeOmit(tmpP), omO = probeOmit(PRUNE_P);
  fs.unlinkSync(tmpP); fs.unlinkSync(probeFile);
  // 观测量 = **行数真的下降**（不是 omittedCount）：破坏摘掉的是 splice，
  //   而「记进 omitted 名单」是另一行 —— 只盯计数会把「没裁但记了名」判成裁成功。
  a(omB.u >= omB.s, 'D12 破坏副本上同款判据现形（源 ' + omB.s + ' 行 → 出 ' + omB.u + ' 行，未下降）',
    JSON.stringify(omB));
  a(omO.u < omO.s && omO.o === 1, 'D13 原版上同款判据必须真（源 ' + omO.s + ' → 出 ' + omO.u
    + '，省略 ' + omO.o + ' 节）', JSON.stringify(omO));
}

// ── N. 负控制（真破坏 + 两向自证）──────────────────────────────────────
//  口径：**真源码破坏 → 在破坏副本上重跑同款真判据 → 判据必须现形**。
//  三条假绿形态在本轮初稿里各出现过一次，故写在这里当检查表：
//    ① 对**原文件**断言（破坏没发生也绿）；
//    ② 破坏写死成模拟常量（真判据根本没被调用）—— 初版 D8 的 `PRUNE_P.indexOf ? true : true` 就是它；
//    ③ 破坏把判据自己删了（自我指涉）—— 初版 N4c 用 `P.check(已删掉的 t4)` 当「原版必抛」。
//  现版三条都改成：破坏必须**可观测地改变行为**，且原版上同款判据必须**真的**给出相反结果。
function runN() {
  console.log('\nN. 负控制（真源码/真合成源内存破坏，判据须现形）');
  const P = require(PRUNE_P);
  const pruneSrc0 = fs.readFileSync(PRUNE_P, 'utf8');
  const tmp = function (n) { return path.join(require('os').tmpdir(), 'wa-o6-neg-' + n + '-' + process.pid + '.js'); };

  // N1：把「块节被省略」的实现摘掉 ⇒ 裁剪器自证必须失败
  const brokenPrune = pruneSrc0.replace(
    'lines.splice(s.line, s.closeLine - s.line + 1, placeholder);',
    '/* 破坏：省略被关掉 */');
  a(brokenPrune !== pruneSrc0, 'N1 破坏「块节被省略」⇒ 破坏可观测（源码文本变了）');
  const t1 = tmp('1');
  fs.writeFileSync(t1, brokenPrune);
  const r1 = cp.spawnSync(process.execPath, [t1, '--self-test'], { encoding: 'utf8' });
  fs.unlinkSync(t1);
  a(r1.status !== 0, 'N1b 破坏副本的 --self-test 必须失败（判据真在看实现，不是恒绿）',
    r1.status === 0 ? '破坏后仍 exit 0 ⇒ 自证是恒绿的' : '');

  // N2：run.js 选区段换回手写三分支 ⇒ A2/A4 必须现形
  const handWritten = runSrc.replace(
    "const v = require('../tools/test-layers.js').select(hit, __layerSel);\n  return v.verdict;",
    "const matched = __layerSel.some(function (n) { return t.indexOf(n) >= 0; });\n" +
    "  if (!matched) return 'skip';\n  return hit.selfContained ? 'run' : 'refuse';");
  a(handWritten !== runSrc, 'N2 破坏「裁定单一真源」⇒ 破坏可观测');
  const segW = layerSeg(handWritten);
  a(wired(segW).indexOf('select(') < 0, 'N2b 破坏副本上 A2 现形（select( 调用真的从**执行行**上消失了）');
  a(wired(segW).indexOf('selfContained') >= 0, 'N2c 破坏副本上 A4 现形（手写 selfContained 判定出现）');

  // N3：把拒绝分支从**收尾裁定的真源码**上摘掉 ⇒ C10 必须现形
  //   这一条在本轮改造前也踩过一次：旧稿破坏的是 run.js 里那句手写条件式，而改造后
  //   run.js 里已经没有那句话了 —— 若照旧写法，「破坏可观测」会直接失败（锚点 0 命中），
  //   而那**不是**判据红，是锚点过期。锚点必须钉在**真源**上（tools/test-layers.js）。
  const noRefuse = layersSrc.replace(
    "  if (nRef > 0) return { on: true, exit: EXIT_REFUSED, showLine: true, refuseLine: true, kind: 'refused' };",
    "  /* 破坏：拒绝分支被摘掉（拒绝从此与常态同形）*/");
  a(noRefuse !== layersSrc, 'N3 破坏「拒绝不得算跳过」⇒ 破坏可观测（真源文本变了）');
  const t3 = tmp('3');
  fs.writeFileSync(t3, noRefuse);
  const probeOutcome = function (mod) {
    return cp.spawnSync(process.execPath, ['-e',
      "const L=require(" + JSON.stringify(mod) + ");" +
      "process.stdout.write(JSON.stringify(L.buildOutcome(['x'],[],['y'])));"], { encoding: 'utf8' });
  };
  const r3 = probeOutcome(t3);
  fs.unlinkSync(t3);
  const parse = function (s) { try { return JSON.parse(String(s || '{}')); } catch (e) { return {}; } };
  const o3 = parse(r3.stdout), o3o = parse(probeOutcome(LAYERS_P).stdout);
  a(o3.exit !== 3 || o3.kind !== 'refused',
    'N3b 破坏副本上 C10 现形（拒绝态不再以 exit 3 收尾）',
    'exit=' + o3.exit + ' kind=' + o3.kind);
  a(o3o.exit === 3 && o3o.kind === 'refused',
    'N3c 原版上同款判据必须真（两向自证成立，判据不是恒假）',
    'exit=' + o3o.exit + ' kind=' + o3o.kind);

  // N4：把 check() 的判据改成恒假条件 ⇒ 「破语法文件」不再抛
  const noCheck = pruneSrc0.replace('if (r.status !== 0) {', 'if (false) {');
  a(noCheck !== pruneSrc0, 'N4 破坏「node --check 硬兜底」⇒ 破坏可观测');
  const t4 = tmp('4');
  fs.writeFileSync(t4, noCheck);
  const bad = t4 + '.bad.js';
  fs.writeFileSync(bad, '} syntax error {');
  const probe = function (mod) {
    return cp.spawnSync(process.execPath, ['-e',
      "const P=require(" + JSON.stringify(mod) + ");" +
      "try{P.check(" + JSON.stringify(bad) + ");process.stdout.write('NO-THROW');}" +
      "catch(e){process.stdout.write('THREW');}"], { encoding: 'utf8' });
  };
  const r4 = probe(t4);
  fs.unlinkSync(t4); fs.unlinkSync(bad);
  a(String(r4.stdout).indexOf('NO-THROW') >= 0,
    'N4b 破坏副本对破语法文件不再抛（⇒ 原版的「必抛」不是恒真）', String(r4.stdout).slice(0, 60));
  // 原版对照：同样一个**存在但语法崩**的文件，原版必须抛（与 N4b 同一个文件形态，
  //   差别只在模块版本 —— 因此它不是「拿不存在文件凑一个 throw」，那是假对照）
  const t5 = tmp('5');
  const bad5 = t5 + '.bad.js';
  fs.writeFileSync(t5, pruneSrc0);
  fs.writeFileSync(bad5, '} syntax error {');
  const r5 = probe(t5);
  fs.unlinkSync(t5); fs.unlinkSync(bad5);
  a(String(r5.stdout).indexOf('THREW') >= 0, 'N4c 原版对同一个破语法文件必抛（两向自证成立）',
    String(r5.stdout).slice(0, 60));

  // N6：删掉 run.js 里的 buildOutcome 调用 ⇒ C3 必须现形（C3 的负控制）
  const noCall = runSrc.replace(
    "  const __layerOut = require('../tools/test-layers.js')\n" +
    "    .buildOutcome(__layerSel, __layerRan, __layerRefused);",
    "  /* 破坏：收尾裁定调用被摘掉 */");
  a(noCall !== runSrc, 'N6 破坏「收尾裁定单一真源」⇒ 破坏可观测');
  a(wired(noCall).indexOf('.buildOutcome(') < 0,
    'N6b 破坏副本上 C3 现形（真调用真的从执行行上消失了）');

  // N7：往副本里插一个**含 `/*` 的字符串字面量** ⇒ C3 仍须命中
  //   （这一条钉的正是本轮假红的根因：wired 的 v1 会在这里失明，
  //    把后面整段代码判成块注释 —— 判据于是「看不见」真调用）
  const withStr = runSrc.replace(
    "  const __layerOut = require('../tools/test-layers.js')",
    "  const __noise = 'actors/*';\n" +
    "  const __layerOut = require('../tools/test-layers.js')");
  a(withStr !== runSrc, 'N7 注入含 `/*` 的字符串字面量 ⇒ 注入可观测');
  a(wired(withStr).indexOf('.buildOutcome(') >= 0
    && wired(withStr).split('\n').length === withStr.split('\n').length,
    'N7b 注入后 C3 仍命中且行数守恒（wired v2 的字符串感知真的在起作用）');

  // N5：真源码逐字未变（负控制没有污染真树）
  a(fs.readFileSync(RUN_P, 'utf8') === runSrc
    && fs.readFileSync(LAYERS_P, 'utf8') === layersSrc
    && fs.readFileSync(PRUNE_P, 'utf8') === pruneSrc0,
    'N5 负控制全程未改真源码（run.js / test-layers.js / prune-sections.js 逐字未变）');
}

const ARGV = process.argv.slice(2);
const only = (ARGV.filter(function (x) { return x.indexOf('--methods=') === 0; })[0] || '').slice(10)
  .split(',').filter(Boolean);
function want(k) { return !only.length || only.indexOf(k) >= 0; }

if (want('A')) runA();
if (want('B')) runB();
if (want('C')) runC();
if (want('D')) runD();
if (want('N')) runN();

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
if (failures.length) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
process.exit(0);