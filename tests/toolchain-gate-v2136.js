#!/usr/bin/env node
// WorldAxis tests/toolchain-gate-v2136.js —— v2.136.0（计划一 O16 收尾面：维护工具运行质量）
//
// 【它治的病】README「tools/ 的取舍」里那句判据（「只有被可执行代码引用才入库」）自写下那天
//   起就没人执行：tests/product-files.js 的 SKIP_DIRS = ['tests','tools'] 把整个 tools/ 排出去，
//   export-contract / inventory / module-registry / dead-export 四面都看不见它。本版新增
//   tests/toolchain-gate.js 把它执行起来，本锁就是那把门禁的双向自证面。
//   无专锁的门禁＝「写了但不可证」。
//
// 【判据结构（与 anchor-scan-v2133 同规格）】
//   A 结构面 · B 运行时（原版成绿）· C 负控制（两向：**先制造病灶让判据现形** →
//   **再摘掉该判据证明是它在承重**）。单向破坏只能证明「源码变了」，两向才证明「判据承重」。
//
// 【宿主纪律】本锁不在主进程装载产品面；全部审计走 spawnSync 子进程，跑在**镜像根**里：
//   顶层条目全部软链真仓库，tests/ 与 tools/ 与 README 用副本覆盖（于是 git ls-files 读真索引、
//   文本面读副本），破坏只落在副本上。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const GATE_REL = 'tests/toolchain-gate.js';
const LOCK_REL = 'tests/toolchain-gate-v2136.js';
// C3 的靶子（选取判据）：它的 wired 引用全部集中在 tests/tools-v2110.js 一处，
//   且本锁自身不得出现该名 —— 否则本锁的注释会成为它的 documented 引用兜底，
//   「让该工具失去全部引用」就永远造不出 orphan（v2.136.0 实测踩过，见 A9）。
const TARGET_TOOL = 'coverage-report.js';
const README_REL = 'README.md';
// 破坏锚点（每条在目标文件里恰中 1 次；不等于 1 时 A8 报红）
const ANCHORS = {
  claimCount: { rel: GATE_REL, txt: "  if (claim.count !== null && claim.count !== tracked.length) {" },
  claimExtra: { rel: GATE_REL, txt: "    if (trackedNames.indexOf(n) < 0) problems.push({ kind: 'in-claim-not-tracked', detail: n });" },
  emptyIndex: { rel: GATE_REL, txt: "  if (!tracked.length) problems.push({ kind: 'empty-index', detail: 'git ls-files tools/ 为空 ⇒ 零命中不算通过' });" },
  idxRead: { rel: GATE_REL, txt: "  const r = cp.spawnSync('git', ['-C', root || BASE, 'ls-files', prefix], { encoding: 'utf8' });" }, 
  commentGate: { rel: GATE_REL, txt: "    if (isCommentLine(l, ext)) return;" },
  orphanJudge: { rel: GATE_REL, txt: "    if (t.reach === 'orphan') problems.push({ kind: 'orphan', detail: t.rel + '（零引用 —— README 判据：被可执行代码引用才入库）' });" },
  entryJudge: { rel: GATE_REL, txt: "  const entry = src.indexOf(ENTRY_SELFTEST) >= 0 ? 'selfTest'" }
};
const MARK = '__WA2136_JSON__';
const PROBE = [
  'const g=require(%R%);const a=g.audit();const st=g.selfTest();',
  'process.stdout.write(' + JSON.stringify(MARK) + ' + JSON.stringify({',
  'ok:a.ok,',
  'kinds:a.problems.map(function(p){return p.kind;}),',
  'details:a.problems.map(function(p){return p.detail;}),',
  'tracked:a.tracked.length,',
  'claimCount:a.claim.count,',
  'claimNames:a.claim.names.length,',
  'reach:a.tools.reduce(function(m,t){m[t.reach]=(m[t.reach]||0)+1;return m;},{}),',
  'entry:a.tools.reduce(function(m,t){m[t.entry]=(m[t.entry]||0)+1;return m;},{}),',
  'absTool:a.tools.filter(function(t){return t.absLiteral;}).map(function(t){return t.rel;}),',
  'selfOk:st.ok,',
  'selfFails:st.fails',
  '}));'
].join('');
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hit(s, x) { return s.split(x).length - 1; }
/** 镜像根：顶层条目全部软链（目录也软链）；tests/ 与 tools/ 逐文件副本；README 副本。 */
function mirrorRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wa2136-lock-'));
  fs.readdirSync(BASE).forEach(function (n) {
    if (n === '.git' || n === 'tools' || n === 'tests' || n === README_REL) return;
    fs.symlinkSync(path.join(BASE, n), path.join(root, n));
  });
  fs.symlinkSync(path.join(BASE, '.git'), path.join(root, '.git'));
  ['tests', 'tools'].forEach(function (d) {
    fs.mkdirSync(path.join(root, d));
    fs.readdirSync(path.join(BASE, d)).forEach(function (n) {
      const p = path.join(BASE, d, n);
      if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(root, d, n));
    });
  });
  fs.copyFileSync(path.join(BASE, README_REL), path.join(root, README_REL));
  return root;
}
/** 在镜像根里跑一次审计：gateText / readme / files 三者可选覆盖。 */
function probeRun(opt) {
  opt = opt || {};
  const root = mirrorRoot();
  try {
    const gate = (opt.gateText !== undefined) ? opt.gateText : fs.readFileSync(path.join(BASE, GATE_REL), 'utf8');
    fs.writeFileSync(path.join(root, GATE_REL), gate);
    if (opt.readme !== undefined) fs.writeFileSync(path.join(root, README_REL), opt.readme);
    if (opt.files) Object.keys(opt.files).forEach(function (rel) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), opt.files[rel]);
    });
    const code = PROBE.replace('%R%', JSON.stringify(path.join(root, GATE_REL)));
    const r = cp.spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 180000 });
    const out = String(r.stdout || '');
    const at = out.indexOf(MARK);
    if (at < 0) return { error: 'no-marker :: ' + out.slice(0, 160) + ' :: ' + String(r.stderr || '').slice(0, 160) };
    const j = JSON.parse(out.slice(at + MARK.length));
    j.status = r.status;
    return j;
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
/** 改 README 名单句（个数 / 名单两处都能改）。 */
function readmeWith(count, names) {
  return '### tools/ 的取舍\n\n**只有被可执行代码引用（或被门禁链引用）的工具才入库**（' + count
    + ' 个，`git ls-files tools/ | wc -l` 为准：\n'
    + names.map(function (x) { return '`' + x + '`'; }).join(' / ') + '）。\n';
}
function namesOf() { return require('./toolchain-gate.js').readmeClaim(BASE).names; }
// ── A：结构面（静态，不装载） ─────────────────────────────────────────────
function runA(a) {
  const s = src(GATE_REL);
  a(s.length > 4000, 'v2136/A1: ' + GATE_REL + ' 存在且非空（' + s.length + ' 字符）');
  a(s.indexOf('git ls-files') > 0, 'v2136/A2: 在册集合取自 git 索引（不是磁盘清单）');
  a(s.indexOf('README_SECTION') > 0 && s.indexOf('### tools/ 的取舍') > 0,
    'v2136/A3: README 名单解析面就位（名单真源只有一处＝README）');
  a(s.indexOf('ENTRY_SELFTEST') > 0 && s.indexOf('ENTRY_CLI') > 0 && s.indexOf('ENTRY_EXPORTS') > 0,
    'v2136/A4: 入口三档常量就位（--self-test / require.main / module.exports）');
  a(s.indexOf('module.exports = {') > 0, 'v2136/A5: 导出面就位（audit / selfTest / scanTool …）');
  // A6/A7 只判顶层（行首零缩进）的 require：本锁的 selfTest 夹具里写着 require('/tmp/...')
  //   这类示例串，它们是缩进的字符串字面量，不是门禁的依赖。
  const topReq = [];
  s.split('\n').forEach(function (l) {
    const m = l.match(/^const [A-Za-z_$][\w$]* = require\('([^']+)'\);/);
    if (m) topReq.push(m[1]);
  });
  a(topReq.length >= 3, 'v2136/A6-a: 顶层 require 真被扫到（实 ' + topReq.length + ' 条：' + topReq.join('/') + '）');
  a(topReq.every(function (x) { return ['fs', 'path', 'child_process', 'os'].indexOf(x) >= 0; }),
    'v2136/A6: 顶层相对依赖为零（只用 node 内置 ⇒ 破坏副本可安全外置）');
  a(!topReq.some(function (x) { return x.charAt(0) === '/'; }),
    'v2136/A7: 顶层无绝对路径字面量 require（自证夹具里的示例串按缩进排除）');
  const asum = Object.keys(ANCHORS).map(function (k) { return hit(src(ANCHORS[k].rel), ANCHORS[k].txt); });
  a(asum.every(function (n) { return n === 1; }),
    'v2136/A8: 全部破坏锚点恰中 1 次（实 ' + JSON.stringify(asum) + '）');
  // A9（本锁第七处自身缺陷的固化）：C3 首版把**自变量注释**里写出的 'tools/' + 靶子名
  //   变成了该工具的 documented 引用（scanTool 按行判：行内出现 tools/<name> 即命中），
  //   于是「靶子失去全部引用」造不出 orphan（实 reach=documented）。教训与全仓同源：
  //   解释病灶的文字不是病灶 —— 不许它反过来成为引用源。此断言把该形态焊死。
  const lockSrc = fs.readFileSync(path.join(BASE, LOCK_REL), 'utf8');
  const tgtRef = 'tools' + '/' + TARGET_TOOL;
  a(lockSrc.indexOf(tgtRef) < 0, 'v2136/A9: C3 靶子不被本锁自身引用（禁 ' + tgtRef + ' 形态）');
}
// ── B：运行时（原版成绿 —— 与门禁现场读数同源） ────────────────────────────
function runB(a) {
  const live = probeRun();
  if (live.error) { a(false, 'v2136/B0: 原版读数可取得（' + live.error + '）'); return; }
  a(live.selfOk === true, 'v2136/B1: 门禁 selfTest() 两向自证通过'
    + (live.selfOk ? '' : '（' + JSON.stringify(live.selfFails) + '）'));
  a(live.ok === true, 'v2136/B2: 原版 audit() 成绿（problems ' + live.kinds.length + ' 条 ' + JSON.stringify(live.kinds) + '）');
  a(live.tracked >= 10, 'v2136/B3: 在册工具 ≥ 10 个（实 ' + live.tracked + '）—— 零命中不算通过');
  a(live.claimCount === live.tracked, 'v2136/B4: README 自述个数 === 索引实况（' + live.claimCount + ' vs ' + live.tracked + '）');
  a(live.claimNames === live.tracked, 'v2136/B5: README 自述名单 === 索引清单（' + live.claimNames + ' vs ' + live.tracked + '）');
  a((live.reach.wired || 0) >= 8, 'v2136/B6: 代码行引用（wired）≥ 8 个工具（实 ' + (live.reach.wired || 0) + '）');
  a((live.entry.cli || 0) + (live.entry.selfTest || 0) >= 8,
    'v2136/B7: 带入口（cli + selfTest）≥ 8 个（实 ' + ((live.entry.cli || 0) + (live.entry.selfTest || 0)) + '）');
  a((live.absTool || []).length === 0, 'v2136/B8: abs-path 零报警（实 ' + JSON.stringify(live.absTool) + '）—— diag_inject 的绝对路径 require 已改相对');
  a(live.kinds.indexOf('claim-count') < 0 && live.kinds.indexOf('in-claim-not-tracked') < 0,
    'v2136/B9: 名单句与索引无残差（patch_o17_v2104 已按既有判据离开索引，README 按现场回填）');
}
// ── C：负控制（两向自证：制造病灶 ⇒ 判据现形；摘掉判据 ⇒ 同一病灶不再现形） ──
function runC(a) {
  const base = src(GATE_REL);
  const names = namesOf();
  // C1 个数同源（两向）
  const r1a = probeRun({ readme: readmeWith(names.length + 1, names) });
  a((r1a.kinds || []).indexOf('claim-count') >= 0,
    'v2136/C1-a: 把 README 个数写成 ' + (names.length + 1) + ' ⇒ claim-count 现形（实 ' + JSON.stringify(r1a.kinds) + '）');
  const bad1 = base.replace(ANCHORS.claimCount.txt, '  if (false && claim.count !== tracked.length) {');
  a(bad1 !== base, 'v2136/C1-b: 破坏真落在源码上');
  const r1b = probeRun({ readme: readmeWith(names.length + 1, names), gateText: bad1 });
  a((r1b.kinds || []).indexOf('claim-count') < 0,
    'v2136/C1-c: 同一病灶 + 摘掉该判据 ⇒ 不再现形（实 ' + JSON.stringify(r1b.kinds) + '）—— 承重判据');
  // C2 名单双向差集的「名单有索引无」（两向）
  const r2a = probeRun({ readme: readmeWith(names.length, names.concat(['ghost-tool'])) });
  a((r2a.details || []).indexOf('ghost-tool') >= 0 && (r2a.kinds || []).indexOf('claim-count') < 0,
    'v2136/C2-a: README 里多写一个不存在的工具名 ⇒ 差集点名而个数向不误报（实 ' + JSON.stringify(r2a.details)
    + ' / ' + JSON.stringify(r2a.kinds) + '）—— 两条判据各是各的');
  const bad2 = base.replace(ANCHORS.claimExtra.txt,
    "    if (false) problems.push({ kind: 'in-claim-not-tracked', detail: n });");
  a(bad2 !== base, 'v2136/C2-b: 破坏真落在源码上');
  const r2b = probeRun({ readme: readmeWith(names.length + 1, names.concat(['ghost-tool'])), gateText: bad2 });
  a((r2b.details || []).indexOf('ghost-tool') < 0 && (r2b.kinds || []).indexOf('claim-count') >= 0,
    'v2136/C2-c: 同一病灶 + 摘掉差集向 ⇒ 差集消失而个数向仍在（实 ' + JSON.stringify(r2b.kinds)
    + ' / details ' + JSON.stringify(r2b.details) + '）—— 两向各是各的判据');
  // C3 引用可达（两向）：让一个真工具失去**全部**引用 ⇒ orphan 现形
  //   靶子选 TARGET_TOOL：它的 wired 引用 5 条全部落在 tests/tools-v2110.js 一处
  //   （.md 里那些只写裸名的本就不过 scanTool 的行过滤器，不计入引用）。
  //   上一版改 'tools/gen-lock.js' 的 FACES 键 ⇒ 造不出 orphan（gen-lock 另有 7 处代码引用），
  //   那是病灶选得不对，不是判据不承重 —— 本仓口径：破坏必须打得到靶。
  const v2110 = src('tests/tools-v2110.js');
  const short = TARGET_TOOL.replace(/\..*$/, '');
  const nRef = v2110.split(short).length - 1;
  // 替换名必须**不是靶名的超串**：首版用 short + 'X'（= coverage-reportX），
  //   scanTool 的行过滤器判的是 indexOf('tools/' + base)，'coverage-reportX'
  //   仍含子串 'coverage-report' ⇒ 病灶改了而引用照旧命中，orphan 永造不出
  //   （实测 reach 恒为 wired）。v2.136.0 第二个坑，在此焊死。
  const fac = v2110.split(short).join('covx');
  a(fac !== v2110 && nRef >= 5 && fac.indexOf(short) < 0,
    'v2136/C3-a: 病灶真落在副本上（靶子的 ' + nRef + ' 处引用全改名，且残留 0）');
  const r3a = probeRun({ files: { 'tests/tools-v2110.js': fac } });
  a((r3a.reach && r3a.reach.orphan || 0) >= 1,
    'v2136/C3-b: 一个真工具失去全部引用 ⇒ orphan ≥ 1（实 ' + JSON.stringify(r3a.reach) + '）');
  const bad3 = base.replace(ANCHORS.orphanJudge.txt,
    "    if (false) problems.push({ kind: 'orphan', detail: t.rel });");
  a(bad3 !== base, 'v2136/C3-c: 破坏真落在源码上');
  const r3b = probeRun({ files: { 'tests/tools-v2110.js': fac }, gateText: bad3 });
  // 两向证明的判据是 **kinds**（判据的输出），不是 reach（现场读数）：
  //   摘掉 problems.push 后 reach 仍是 {orphan:1} —— 读数两侧完全相同，
  //   唯一变化的是「还有没有东西报出来」。这正好把承重关系钉死：
  //   病灶没变、读数没变，只有判据被摘 ⇒ 红转绿。
  a((r3b.kinds || []).indexOf('orphan') < 0 && (r3a.kinds || []).indexOf('orphan') >= 0
    && (r3b.reach && r3b.reach.orphan) === (r3a.reach && r3a.reach.orphan),
    'v2136/C3-d: 同一病灶 + 摘掉该判据 ⇒ kinds 里的 orphan 消失而读数不变（实 kinds ' + JSON.stringify(r3b.kinds) + ' / reach ' + JSON.stringify(r3b.reach) + '）—— 承重判据');
  // C4 注释行门（两向）：注释里写绝对路径不得被算成活字面量
  const dj = src('tools/diag_inject_v2860.js');
  const djGhost = dj.replace("'use strict';", "'use strict';\n// 历史叙述：当年用 require('/tmp/wa_git/tests/x.js') 跑过");
  a(djGhost !== dj, 'v2136/C4-a: 病灶真落在副本上');
  const r4a = probeRun({ files: { 'tools/diag_inject_v2860.js': djGhost } });
  a((r4a.absTool || []).indexOf('tools/diag_inject_v2860.js') < 0,
    'v2136/C4-b: 注释行里的绝对路径不算活字面量（实 ' + JSON.stringify(r4a.absTool) + '）—— 注释行门生效');
  const bad4 = base.replace(ANCHORS.commentGate.txt, '    if (false) return;');
  a(bad4 !== base, 'v2136/C4-c: 破坏真落在源码上');
  const r4b = probeRun({ files: { 'tools/diag_inject_v2860.js': djGhost }, gateText: bad4 });
  a((r4b.absTool || []).indexOf('tools/diag_inject_v2860.js') >= 0,
    'v2136/C4-d: 同一病灶 + 摘掉注释行门 ⇒ 立刻误报（实 ' + JSON.stringify(r4b.absTool) + '）—— 注释行门承重');
  // C5 零命中不算通过（两向）
  const bad5 = base.replace(ANCHORS.idxRead.txt, "  const r = { status: 0, stdout: '' };");
  a(bad5 !== base, 'v2136/C5-a: 破坏真落在源码上');
  const r5a = probeRun({ gateText: bad5 });
  a((r5a.kinds || []).indexOf('empty-index') >= 0,
    'v2136/C5-b: 索引读空 ⇒ empty-index 现形（实 ' + JSON.stringify(r5a.kinds) + '）—— 「零命中不算通过」');
  const bad5b = bad5.replace(ANCHORS.emptyIndex.txt, "  if (false) problems.push({ kind: 'empty-index', detail: 'x' });");
  a(bad5b !== bad5, 'v2136/C5-c: 破坏真落在源码上');
  const r5b = probeRun({ gateText: bad5b });
  a((r5b.kinds || []).indexOf('empty-index') < 0,
    'v2136/C5-d: 索引读空 + 摘掉该判据 ⇒ 不再现形（实 ' + JSON.stringify(r5b.kinds) + '）—— 假绿就是这么来的');
  // C6 入口档判据（两向，合成站点在 selfTest 内）
  const bad6 = base.replace(ANCHORS.entryJudge.txt, "  const entry = 'xxxWrongxxx' ? 'selfTest'");
  a(bad6 !== base, 'v2136/C6-a: 破坏真落在源码上');
  const r6 = probeRun({ gateText: bad6 });
  a(r6.selfOk === false && (r6.selfFails || []).length > 0,
    'v2136/C6-b: 破坏入口档判据 ⇒ selfTest 当场失败（实 ' + JSON.stringify(r6.selfFails) + '）');
  // C7 纯度
  a(src(GATE_REL) === base, 'v2136/C7:（纯度）全部破坏只在镜像根里做，真 ' + GATE_REL + ' 逐字未变');
  a(!/ghost-tool/.test(src(README_REL)), 'v2136/C7-b:（纯度）README 未被破坏副本污染');
  a(src('tests/tools-v2110.js').indexOf("'tools/gen-lock.js':") > 0,
    'v2136/C7-c:（纯度）tests/tools-v2110.js 未被破坏副本污染');
  const r7 = probeRun();
  a(r7.ok === true && (r7.kinds || []).length === 0,
    'v2136/C7-d:（纯度）原版上同款判据仍为真（problems 0）—— 两向自证成立');
}
const restoring = require('./lock-assert.js').restoring;
module.exports = {
  ANCHORS: ANCHORS, GATE_REL: GATE_REL, README_REL: README_REL,
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); })
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runA(a); } catch (e) { fail++; console.log('  x A threw: ' + (e && e.stack)); }
  try { runB(a); } catch (e) { fail++; console.log('  x B threw: ' + (e && e.stack)); }
  try { runC(a); } catch (e) { fail++; console.log('  x C threw: ' + (e && e.stack)); }
  if (fail) { console.log('TOOLCHAIN-GATE-V2136: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('TOOLCHAIN-GATE-V2136: pass（' + pass + ' 项）');
}
