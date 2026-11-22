// WorldAxis tests/tools-v2110.js (v2.110.0) — 开发体验工具链专锁（计划一 #23 / #25 / #26 / #27 / #28 / #29 / #30）
//
// 为什么工具也要有专锁：`tools/` 不进出口面契约（product-files 的 SKIP_DIRS 排掉 tests/ 与 tools/），
//   所以**没有任何一道既有门禁看得见它们**。而它们恰恰是「下一次改动会不会踩坑」的判官：
//   一个 `tools/patch-idempotency.js` 判错了一次，代价是整个仓库被重复插入两次代码块
//   （v2.109.0 收口期真实发生过两处）。故本文件对七件工具逐件给四段：
//     A 导出面（静态键名）· B 行为（每个判据至少一条真调用）· C 不变式 · N 真源码破坏
//
// N 段的宿主说明：七件工具全部**零相对依赖**（顶层只 require node 内置模块），
//   所以「破坏副本」可以直接落进临时目录再 require —— 不必复制实现、也不必碰仓库。
//   破坏锚点必须恰中 1 次；命中数不等于 1 时该条报红并跳过（不许部分破坏）。
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const vm = require('vm');
const cp = require('child_process');
const BASE = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wa2110-tools-'));
let _gcFixture = null;
/** gen-changelog 区间用例的**自足夹具**：一个真 · 3 提交的 git 仓，落在仓库之外。
 *  为何需要（v2.110.0 收口期实测抳出）：整轮回归跑在 `git archive HEAD` 出来的**候选树**里，
 *  那棵树只有 1 个提交——在它上问 `HEAD~3..HEAD` 只会得到 `{ok:false}`，
 *  而断言的消息参数会无条件读 `rg.revs.length` ⇒ 整段崩掉。
 *  区间语义是 gen-changelog 的真待测面，不能为了避开宿主而删；故把它打在自建夹具仓上。
 */
function gcFixture() {
  if (_gcFixture) return _gcFixture;
  const root = path.join(TMP, 'chglog-fixture');
  fs.mkdirSync(root, { recursive: true });
  const env = Object.assign({}, process.env, {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(TMP, 'gitconfig-none'),
    GIT_AUTHOR_NAME: 'lock', GIT_AUTHOR_EMAIL: 'lock@example.invalid',
    GIT_COMMITTER_NAME: 'lock', GIT_COMMITTER_EMAIL: 'lock@example.invalid'
  });
  const g = function (args) {
    const r = cp.spawnSync('git', args, { cwd: root, env: env, encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      throw new Error('夹具仓 git 失败: ' + args.join(' ') + ' :: '
        + String(r.stderr || '').slice(0, 160));
    }
  };
  g(['init', '--quiet', '.']);
  for (let i = 0; i < 3; i++) {
    fs.writeFileSync(path.join(root, 'fixture-' + i + '.txt'), 'fixture ' + i + '\n');
    g(['add', '-A']);
    g(['commit', '--quiet', '--allow-empty', '-m', 'fixture ' + (i + 1)]);
  }
  _gcFixture = root;
  return root;
}

let _seq = 0;
/** 把破坏副本落进临时目录并 require（顶层无相对依赖 ⇒ 可安全外置）。 */
function loadBroken(text) {
  const p = path.join(TMP, 'broken_' + (++_seq) + '.js');
  fs.writeFileSync(p, text);
  return require(p);
}
function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hit(src, anchor) { return src.split(anchor).length - 1; }
/** 破坏锚点恰中 1 次才算真破坏（否则报红、返回 null 让该条跳过）。 */
function wreck(src, anchor, repl, a, tag) {
  const n = hit(src, anchor);
  a(n === 1, tag + ': 破坏锚点在真源码中恰 1 处（实 ' + n + '）');
  if (n !== 1) return null;
  const out = src.split(anchor).join(repl);
  a(out !== src, tag + ': 破坏真的改动了源码文本');
  return out;
}

// ── A 段：七件工具的导出面 ───────────────────────────────────────────────
const FACES = {
  'tools/gen-lock.js': ['SIGN', 'exportsOf', 'render', 'generate', 'check'],
  'tools/coverage-report.js': ['collect', 'summary', 'totals', 'foldScript', 'lineStarts', 'lineOf'],
  'tools/doc-gate.js': ['scanSource', 'audit', 'reference'],
  'tools/impact-analysis.js': ['analyze', 'summary', 'countOf', 'filesIn'],
  'tools/patch-idempotency.js': ['VERDICTS', 'decide', 'checkFile', 'exitCodeFor'],
  'tools/hooks.js': ['SIGN', 'FAST_GATES', 'renderHook', 'hooksDir', 'install', 'uninstall', 'status'],
  'tools/gen-changelog.js': ['git', 'range', 'filesOf', 'draft']
};
function runA(a) {
  Object.keys(FACES).forEach(function (rel) {
    const src = srcOf(rel);
    a(src.length > 1000, 'tools/A: ' + rel + ' 存在且非空（' + src.length + ' 字符）');
    // 取**最后一个** module.exports 块：gen-lock.js 的 render() 里有 `L.push('module.exports = {…};')`
    //   一行**模板文本**（生成物里要写导出语句），非贪婪匹配会先撞上它 —— 于是整段 A 段
    //   对着「生成器想生成什么」判，而不是「工具自己导出什么」。实测这就是本文件首轮 5 条假红的原因。
    const all = [];
    const rex = /module\.exports\s*=\s*\{([\s\S]*?)\};/g;
    let mm;
    while ((mm = rex.exec(src)) !== null) all.push({ text: mm[1], at: mm.index });
    const real = all.filter(function (x) { return !/L\.push\(/.test(src.slice(Math.max(0, x.at - 60), x.at)); });
    const keys = (real.length ? real[real.length - 1] : all[all.length - 1] || { text: '' }).text;
    a(!!keys, 'tools/A: ' + rel + ' 有 module.exports 对象（真导出块，非模板文本）');
    FACES[rel].forEach(function (k) {
      a(new RegExp('(^|[\\s,{])' + k + '\\s*:').test(keys), 'tools/A: ' + rel + ' 导出 ' + k);
    });
    a(src.indexOf('require.main === module') > 0,
      'tools/A: ' + rel + ' 有 CLI 入口守卫（可被 require 而不跑 CLI）');
  });
  // 零依赖：顶层只准 require node 内置
  const BUILTIN = ['fs', 'path', 'os', 'vm', 'child_process', 'crypto', 'util'];
  Object.keys(FACES).forEach(function (rel) {
    const tops = (srcOf(rel).match(/^const\s+\w+\s*=\s*require\('([^']+)'\);/gm) || [])
      .map(function (s) { return (s.match(/require\('([^']+)'\)/) || [])[1]; });
    const bad = tops.filter(function (n) { return BUILTIN.indexOf(n) < 0; });
    a(bad.length === 0, 'tools/A: ' + rel + ' 顶层依赖全是 node 内置（实 ' + JSON.stringify(bad) + '）'
      + ' —— 零依赖是本仓对工具链的硬约束（不引入 istanbul / c8 一类）');
  });
}

// ── B 段：逐件行为 ──────────────────────────────────────────────────────
function runB(a) {
  // ── #23 gen-lock：抽导出面 → 生成**能跑**的模板 ──
  const gl = require(path.join(BASE, 'tools/gen-lock.js'));
  const ex = gl.exportsOf(srcOf('core/fault-context.js'));
  a(ex.ns === 'faultContext' && ex.keys.length === 9,
    'tools/B(#23): exportsOf 从真源码抽出 faultContext 的 9 个键（实 ' + ex.ns + '/' + ex.keys.length + '）');
  a(gl.exportsOf('var x = 1;').reason === 'no-namespace-assignment',
    'tools/B(#23): 没有命名空间赋值时如实报 no-namespace-assignment（不猜）');
  const proj = path.join(TMP, 'proj');
  fs.mkdirSync(path.join(proj, 'core'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'core', 'demo.js'), 'WA.demo = { alpha: alpha, beta: beta };\n');
  const gen1 = gl.generate('core/demo.js', { root: proj });
  a(gen1.ok === true && gen1.ns === 'demo' && gen1.keys.join(',') === 'alpha,beta',
    'tools/B(#23): generate 产出到 tests/demo-template.js（实 ' + gen1.out + '）');
  // **本条是这份工具存在的理由**：生成物必须是能跑的 JS。
  //   首版生成器用「正则字面量拼接」写 A 段，产出的模板有一行语法错误 —— 这条判据当时会红。
  let parses = true, perr = '';
  try { new vm.Script(gen1.text); } catch (e) { parses = false; perr = e.message; }
  a(parses, 'tools/B(#23): 生成物可被 JS 解析器接受（实 ' + (parses ? 'ok' : perr) + '）');
  a(gen1.text.indexOf(gl.SIGN) === 0, 'tools/B(#23): 生成物首行是签名（幂等重生成的前提）');
  const chk = gl.check(gen1.text);
  a(chk.ok === false && chk.todos > 0,
    'tools/B(#23): 未补全的模板 check 报 has-placeholders（实 ' + chk.todos + ' 个占位）—— '
    + '占位不构成通过');
  a(gl.generate('core/没这个文件.js', { root: proj }).reason === 'module-not-found',
    'tools/B(#23): 目标模块不存在 ⇒ module-not-found（不抛）');

  // ── #25 coverage-report：no-data 而不是 0% ──
  const cv = require(path.join(BASE, 'tools/coverage-report.js'));
  const nod = cv.collect(path.join(TMP, '不存在'), { root: TMP });
  a(nod.ok === false && nod.reason === 'no-data' && typeof nod.hint === 'string' && nod.hint.length > 0,
    'tools/B(#25): 目录不存在 ⇒ no-data + 产出数据的指引（实 ' + JSON.stringify(nod.reason) + '）—— '
    + '**打印 0% 是伪读数**：「没数据」≠「覆盖率为 0」');
  const emptyDir = path.join(TMP, 'emptydir');
  fs.mkdirSync(emptyDir, { recursive: true });
  a(cv.collect(emptyDir, { root: TMP }).reason === 'no-data', 'tools/B(#25): 空目录同样是 no-data');
  // 端到端：真跑一次 NODE_V8_COVERAGE，看它能不能从小探针里读出**部分覆盖**。
  //   探针刻意含一条**永不执行**的分支（`if (false)`）：覆盖率工具的「读过字节」口径是
  //   **字节级**的，只测「函数进过」会恒为 100%（首版探针只有一个 if/else，实测 100%）。
  //   这与本仓 perf-trace 的实测动机同形：**全绿 ≠ 覆盖到**。
  const covDir = path.join(TMP, 'cov');
  const probe = path.join(TMP, 'probe.js');
  fs.writeFileSync(probe, [
    'function f(n) { if (n > 0) { return 1; } else { return 0; } }',
    'function neverRun() { var a = 1; return a + 1; }',
    'function deadBranch() { if (false) { return "这条永不执行"; } return "ok"; }',
    'for (var i = 0; i < 3; i++) f(i);',
    'deadBranch();'
  ].join('\n') + '\n');
  cp.spawnSync(process.execPath, [probe], { env: Object.assign({}, process.env, { NODE_V8_COVERAGE: covDir }), timeout: 30000 });
  const cov = cv.collect(covDir, { root: TMP });
  a(cov.ok === true && cov.rows.length >= 1, 'tools/B(#25): 真覆盖率数据可解析（实 ' + cov.rows.length + ' 个文件）');
  const prow = cov.rows.filter(function (r) { return r.file === 'probe.js'; })[0];
  a(!!prow && prow.ratio > 0 && prow.ratio < 1,
    'tools/B(#25): 探针的部分覆盖被如实读出（实 ' + (prow ? (prow.ratio * 100).toFixed(0) + '%' : 'null')
    + '）—— 全 100% 才是可疑信号：`neverRun` 与 `if (false)` 那两支没跑过');
  const rowsSyn = [{ file: 'core/store.js', bytes: 100, coveredBytes: 89, lines: 263, coveredLines: 234, ratio: 0.89, lineRatio: 0.89 }];
  a(cv.summary(rowsSyn).indexOf('core/store.js 89% (234/263 行)') >= 0,
    'tools/B(#25): summary 输出计划原文的形态（实 ' + JSON.stringify(cv.summary(rowsSyn)) + '）');
  a(cv.lineOf(cv.lineStarts('a\nbb\n'), 3) === 2, 'tools/B(#25): lineOf/lineStarts 偏移换算正确');
  a(cv.totals(rowsSyn).files === 1 && Math.abs(cv.totals(rowsSyn).ratio - 0.89) < 1e-9,
    'tools/B(#25): totals 按**字节**口径聚合');

  // ── #26 doc-gate：只判可机械核对的三件事 ──
  const dg = require(path.join(BASE, 'tools/doc-gate.js'));
  const synth = [
    '/**', ' * 有完整注释', ' * @param {number} n 数', ' * @returns {number} 结果', ' */',
    'function good(n) { return n; }',
    '// 只有行注释，不是 JSDoc', 'function half(n) { return n; }',
    'function bare(n) { return n; }',
    '/**', ' * 名字对不上但条数够', ' * @param {string} 随便写的名字', ' * @returns {number} 结果', ' */',
    'function renamed(alpha) { return 1; }'
  ].join('\n');
  const sc = dg.scanSource(synth);
  a(sc.length === 4, 'tools/B(#26): scanSource 抽出 4 个顶层 function（实 ' + sc.length + '）');
  a(sc[0].hasDoc === true && sc[0].declares === 1 && sc[0].returns === true, 'tools/B(#26): 完整注释三件全过');
  a(sc[1].hasDoc === false, 'tools/B(#26): `//` 行注释**不**算 JSDoc（hasDoc 由 `/**` 认定）');
  a(sc[2].hasDoc === false, 'tools/B(#26): 无注释者 hasDoc=false');
  a(sc[3].hasDoc === true && sc[3].declares >= sc[3].params,
    'tools/B(#26): @param **条数够**即算合格（刻意不查名字 —— 重命名噪声会让门禁被当成噪声，'
    + '实测 declares=' + sc[3].declares + ' params=' + sc[3].params + '）');
  const au = dg.audit({ root: BASE });
  a(au.ok === true && au.files > 100 && au.total > 200,
    'tools/B(#26): audit 在 product 文件面上有真读数（' + au.files + ' 文件 / ' + au.total + ' 个函数）');
  a(au.rate >= 0 && au.rate <= 1, 'tools/B(#26): 文档率落在 [0,1]（实 ' + au.rate.toFixed(3) + '）');
  a(typeof dg.reference(au.rows) === 'string' && dg.reference(au.rows).indexOf('# API 参考') >= 0,
    'tools/B(#26): reference 产出纯文本草稿（不落盘）');

  // ── #27 impact-analysis：四层各自成词 + 自报边界 ──
  const ia = require(path.join(BASE, 'tools/impact-analysis.js'));
  const an = ia.analyze('inputGuard.text', { root: BASE });
  a(an.ok === true && an.granularity === 'ns.fn' && an.needle === 'WA.inputGuard.text',
    'tools/B(#27): ns.fn 粒度的锚点形态正确（实 ' + an.needle + '）');
  a(an.direct.length >= 20, 'tools/B(#27): inputGuard.text 的直接调用方 ≥20 个（实 ' + an.direct.length + '）');
  a(an.unseen === true, 'tools/B(#27): 静态近似**自报边界**（unseen:true —— 动态访问看不见，'
    + '不假装全找到了）');
  a(Array.isArray(an.alias) && Array.isArray(an.indirect) && Array.isArray(an.locks) && Array.isArray(an.ui),
    'tools/B(#27): 四层各自成字段（direct/alias/indirect/locks + ui）—— 不合并成一个数字');
  a(ia.analyze('', { root: BASE }).reason === 'missing-target',
    'tools/B(#27): 空查询 ⇒ missing-target（**不**返回一个 ok:true 的空影响面 —— 那比报错更危险）');
  a(ia.countOf('aXbXc', 'X') === 2 && ia.filesIn(BASE).product.length > 100,
    'tools/B(#27): countOf 与 filesIn 的基本读数成立');
  const sm = ia.summary(an);
  a(sm.indexOf('直接调用方') > 0 && sm.indexOf('动态访问') > 0,
    'tools/B(#27): summary 印出四层 + 边界声明');

  // ── #28 patch-idempotency：四种判定 ──
  const pi = require(path.join(BASE, 'tools/patch-idempotency.js'));
  a(pi.VERDICTS.length === 4, 'tools/B(#28): 四种判定（实 ' + JSON.stringify(pi.VERDICTS) + '）');
  a(pi.decide('abcXYZdef', 'XYZ').verdict === 'can-apply', 'tools/B(#28): 恰 1 次 ⇒ can-apply');
  a(pi.decide('abcdef', 'XYZ').verdict === 'already-applied', 'tools/B(#28): 0 次 ⇒ already-applied（跳过不报错）');
  const amb = pi.decide('abcXYZdefXYZghi', 'XYZ');
  a(amb.verdict === 'refuse-ambiguous' && amb.hits === 2,
    'tools/B(#28): ≥2 次 ⇒ refuse-ambiguous（实 hits=' + amb.hits + '）—— '
    + '「半新半旧」状态的唯一安全动作是不动它');
  a(pi.decide('abcXYZ', '').reason.indexOf('不猜锚点') > 0, 'tools/B(#28): 不给锚点 ⇒ 拒绝（本工具不猜锚点）');
  a(pi.decide(null, 'x').verdict === 'no-target', 'tools/B(#28): 源码不可读 ⇒ no-target');
  a(pi.exitCodeFor('can-apply') === 0 && pi.exitCodeFor('already-applied') === 0
    && pi.exitCodeFor('refuse-ambiguous') === 2 && pi.exitCodeFor('no-target') === 2,
    'tools/B(#28): 退出码语义（可应用/已应用 0；歧义/无目标 2）');
  const realChk = pi.checkFile('core/fault-context.js', 'WA.faultContext', {});
  a(realChk.verdict === 'can-apply' && realChk.hits === 1,
    'tools/B(#28): 对真文件真锚点的只读检查成立（实 ' + realChk.verdict + '/' + realChk.hits + '）');

  // ── #29 hooks：快门槛进 pre-commit、pre-push 不阻断 ──
  const hk = require(path.join(BASE, 'tools/hooks.js'));
  const pc = hk.renderHook('pre-commit');
  a(pc.ok === true && pc.text.indexOf('set -e') > 0,
    'tools/B(#29): pre-commit 带 set -e（快门槛失败即阻断）');
  a(hk.FAST_GATES.length === 3 && hk.FAST_GATES.every(function (g) { return pc.text.indexOf(g.name) > 0; }),
    'tools/B(#29): 三道秒级门禁全在 pre-commit 里（' + hk.FAST_GATES.map(function (g) { return g.name; }).join('/') + '）');
  const pp = hk.renderHook('pre-push');
  a(pp.ok === true && pp.text.indexOf('WORLDAXIS_FULL') > 0 && pp.text.indexOf('set -e') < 0,
    'tools/B(#29): pre-push 默认**不阻断**（WORLDAXIS_FULL=1 才跑；无 set -e）—— '
    + '全量回归做成硬门槛只会让所有 hook 一起被绕过');
  a(hk.renderHook('pre-bogus').reason === 'unknown-hook-kind', 'tools/B(#29): 未知 hook 类型 ⇒ 如实报（不生成半份脚本）');
  const gitRoot = path.join(TMP, 'gitroot');
  fs.mkdirSync(path.join(gitRoot, '.git', 'hooks'), { recursive: true });
  const i1 = hk.install('pre-commit', { root: gitRoot });
  a(i1.ok === true && fs.existsSync(path.join(gitRoot, '.git', 'hooks', 'pre-commit')),
    'tools/B(#29): install 在**显式 root** 下落盘（实 ' + i1.path + '）');
  const i2 = hk.install('pre-commit', { root: gitRoot });
  a(i2.ok === true && i2.backup === '', 'tools/B(#29): 重复安装自己装的 hook ⇒ 直接覆盖、不备份');
  fs.writeFileSync(path.join(gitRoot, '.git', 'hooks', 'pre-push'), '#!/bin/sh\necho 别人的 hook\n');
  const i3 = hk.install('pre-push', { root: gitRoot });
  a(i3.ok === false && i3.reason === 'refuse-foreign-hook',
    'tools/B(#29): 外来 hook ⇒ refuse-foreign-hook（**不碰别人的 hook**）');
  const i4 = hk.install('pre-push', { root: gitRoot, force: true });
  a(i4.ok === true && i4.backup.indexOf('pre-worldaxis') > 0 && fs.existsSync(i4.backup),
    'tools/B(#29): --force 覆盖并**先把原文件备份**（实 ' + path.basename(i4.backup) + '）');
  const st = hk.status({ root: gitRoot });
  a(st.length === 2 && st.every(function (s) { return s.managed === true; }),
    'tools/B(#29): status 认出两个 hook 都是本工具管理的');
  const un1 = hk.uninstall('pre-commit', { root: gitRoot });
  a(un1.ok === true && un1.removed === true, 'tools/B(#29): uninstall 移除自己装的');
  fs.writeFileSync(path.join(gitRoot, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho 外来\n');
  a(hk.uninstall('pre-commit', { root: gitRoot }).reason === 'foreign-hook-not-removed',
    'tools/B(#29): uninstall 拒绝删外来 hook');

  // ── #30 gen-changelog：只生成事实草稿、不写日志 ──
  const gc = require(path.join(BASE, 'tools/gen-changelog.js'));
  const rg = gc.range('HEAD~2..HEAD', { root: gcFixture() });
  a(rg.ok === true && rg.revs.length === 2,
    'tools/B(#30): 显式区间取到 2 个提交（实 ' + rg.revs.length + '）（夹具仓共 3 提交，区间含两端）');
  a(rg.revs.every(function (r) { return /^[0-9a-f]{7,}$/.test(r.hash) && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && r.subject.length > 0; }),
    'tools/B(#30): 每条提交带 hash / date / subject 三读数');
  a(gc.range('HEAD', { root: BASE }).reason === 'need-explicit-range',
    'tools/B(#30): 不给区间 ⇒ need-explicit-range（版本号与 git tag 在本仓并不同步，不许猜）');
  const fo = gc.filesOf(rg.revs[0].hash, { root: gcFixture() });
  a(fo.ok === true && Array.isArray(fo.added) && Array.isArray(fo.modified) && Array.isArray(fo.deleted),
    'tools/B(#30): filesOf 按 A/M/D 三档分开（实 +' + fo.added.length + ' ~' + fo.modified.length + ' -' + fo.deleted.length + '）');
  const logPath = path.join(BASE, 'ITERATION_LOG.md');
  const logBefore = fs.readFileSync(logPath, 'utf8');
  const dr = gc.draft('HEAD~2..HEAD', { root: gcFixture() });
  a(dr.ok === true && dr.commits === 2 && dr.text.indexOf('待人工补') > 0,
    'tools/B(#30): draft 产出事实清单 + 人工补写提示（实 ' + dr.commits + ' 条）');
  a(fs.readFileSync(logPath, 'utf8') === logBefore,
    'tools/B(#30): draft **不写** ITERATION_LOG.md（只输出到 stdout，落盘由人决定）');
}

// ── C 段：不变式 ────────────────────────────────────────────────────────
function runC(a) {
  const gl = require(path.join(BASE, 'tools/gen-lock.js'));
  // C1. 手写锁不被静默覆盖（幂等性的**否定面**）
  const proj = path.join(TMP, 'proj2');
  fs.mkdirSync(path.join(proj, 'core'), { recursive: true });
  fs.mkdirSync(path.join(proj, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'core', 'demo.js'), 'WA.demo = { alpha: alpha };\n');
  fs.writeFileSync(path.join(proj, 'tests', 'demo-template.js'), '// 人手写的专锁\n');
  const r1 = gl.generate('core/demo.js', { root: proj });
  a(r1.ok === false && r1.reason === 'refuse-overwrite-handwritten',
    'tools/C(#23): 目标存在且不含签名 ⇒ refuse-overwrite-handwritten（实 ' + r1.reason + '）');
  a(fs.readFileSync(path.join(proj, 'tests', 'demo-template.js'), 'utf8') === '// 人手写的专锁\n',
    'tools/C(#23): 拒绝时**文件一字未动**');
  const r2 = gl.generate('core/demo.js', { root: proj, force: true });
  a(r2.ok === true && r2.text.indexOf(gl.SIGN) === 0, 'tools/C(#23): --force 才覆盖');

  // C2. coverage：readonly（工具不写任何文件 —— 用「无新文件 + 目录变更」验）
  const cv = require(path.join(BASE, 'tools/coverage-report.js'));
  const watch = path.join(TMP, 'watchdir');
  fs.mkdirSync(watch, { recursive: true });
  const before = fs.readdirSync(watch).length;
  cv.collect(watch, { root: TMP }); cv.summary([]); cv.totals([]);
  a(fs.readdirSync(watch).length === before, 'tools/C(#25): 调用覆盖工具不产生任何文件（只报不改）');
  a(cv.totals([]).ratio === 0 && isFinite(cv.totals([]).ratio),
    'tools/C(#25): 空集合的 ratio 是 0 而不是 NaN（空集上的读数必须仍是数）');

  // C3. hooks 的生成物是**固定文本**（纯函数：同参数同结果）+ 不许是空转
  const hk = require(path.join(BASE, 'tools/hooks.js'));
  a(hk.renderHook('pre-commit').text === hk.renderHook('pre-commit').text,
    'tools/C(#29): renderHook 是纯函数（同参数逐字同结果）');
  // 判据从「文本里没有 --no-verify」改为**语义判据**：pre-commit 必须真的会阻断（`exit 1`），
  //   而 pre-push 必须真的不阻断（无 set -e 且有 exit 0 的早退）。
  //   首版用「文本不含 --no-verify」是错的 —— 生成物的**注释里**会说明「那会训练人 --no-verify」，
  //   于是判据把一句正当的告诫当成了缺陷（这正是本仓反复登记的「静态串判据 ≠ 语义判据」）。
  const pcT = hk.renderHook('pre-commit').text;
  a(pcT.indexOf('exit 1') > 0 && pcT.indexOf('|| { echo') > 0,
    'tools/C(#29): pre-commit 真会阻断（门禁失败 ⇒ exit 1，不是 || true 空转）');
  const ppT = hk.renderHook('pre-push').text;
  a(ppT.indexOf('exit 0') > 0 && ppT.indexOf('exit 1') < 0,
    'tools/C(#29): pre-push 不会阻断（无 exit 1 —— 全量回归是提示不是门槛）');

  // C4. impact-analysis 的四层互不冒充（direct 与 alias 同一文件不同时出现）
  const ia = require(path.join(BASE, 'tools/impact-analysis.js'));
  const an = ia.analyze('inputGuard.text', { root: BASE });
  const dset = {};
  an.direct.forEach(function (d) { dset[d.file] = true; });
  a(an.alias.every(function (x) { return !dset[x.file]; }),
    'tools/C(#27): direct 与 alias 两层互斥（同一文件不会既算直接调用又算别名持有）');

  // C5. patch-idempotency：判定只有四种取值（穷尽性 —— 任何输入不得落进第五种）
  const pi = require(path.join(BASE, 'tools/patch-idempotency.js'));
  const inputs = [[undefined, 'a'], ['abc', undefined], ['', 'x'], ['aaa', 'a'], ['abc', 'abc'], [null, 'a']];
  const all = inputs.map(function (p) { return pi.decide(p[0], p[1]).verdict; });
  a(all.every(function (v) { return pi.VERDICTS.indexOf(v) >= 0; }),
    'tools/C(#28): 任意输入都落在四种判定内（实 ' + JSON.stringify(all) + '）');

  // C7. **安全前置**：临时工作目录必须在仓库**之外**。
  //   理由不是洁癖：`tools/hooks.js` 的 hooksDir 在非 git 仓库下落回 `<root>/.git/hooks`，
  //   而上一条 install 用例正是**故意**造一个假 `.git/hooks`。若 TMP 落在仓库内，
  //   该用例会把文件写进**真的** `.git/hooks/pre-commit` —— 测试污染开发环境。
  a(path.relative(BASE, TMP).indexOf('..') === 0,
    'tools/C: 临时工作目录在仓库之外（' + TMP + '）—— 否则 hooks 安装用例会改写真 .git/hooks');

  // C6. gen-changelog：区间必须**由调用方给**，且不猜「上一个版本」
  const gc = require(path.join(BASE, 'tools/gen-changelog.js'));
  a(gc.range('', { root: BASE }).ok === false && gc.range('..', { root: BASE }).ok === false,
    'tools/C(#30): 空区间 / 裸 ".." 都不猜（如实拒绝）');
  a(gc.range('HEAD~1..HEAD', { root: gcFixture() }).revs.length === 1,
    'tools/C(#30): 单提交区间同样成立（夹具仓上）');
}

// ── N 段：真源码破坏（七件工具各一条）────────────────────────────────────
function runNegative(a) {
  // N1(#23). 摘掉「手写锁不许覆盖」的守卫 ⇒ 人手写的专锁被静默覆盖
  const src23 = srcOf('tools/gen-lock.js');
  const b23 = wreck(src23, '  if (existed && prev.indexOf(SIGN) < 0 && !o.force) {', '  if (false) {', a, 'tools/N1');
  if (b23) {
    const gl1 = loadBroken(b23);
    const proj = path.join(TMP, 'n1proj');
    fs.mkdirSync(path.join(proj, 'core'), { recursive: true });
    fs.mkdirSync(path.join(proj, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'core', 'demo.js'), 'WA.demo = { alpha: alpha };\n');
    fs.writeFileSync(path.join(proj, 'tests', 'demo-template.js'), '// 人手写的\n');
    const r = gl1.generate('core/demo.js', { root: proj });
    a(r.ok === true && fs.readFileSync(path.join(proj, 'tests', 'demo-template.js'), 'utf8').indexOf('人手写的') < 0,
      'tools/N1: 破坏后人手写的专锁被覆盖（判据现形：`refuse-overwrite-handwritten` 由 false 变 true）');
  }

  // N2(#25). 摘掉「目录打不开 ⇒ no-data」的兜底 ⇒ 工具自己抛（「没数据」被升级成崩溃）
  //   注意替换体必须仍是**合法 JS**：首版替换成两个空格，于是 try 没了 catch ——
  //   破坏副本自己语法错，`loadBroken` 直接抛，判据根本没跑到（这属于「破坏把被测对象弄坏了」
  //   而不是「破坏改掉了行为」）。改成 `throw e;` 才是「保留可运行性、只改行为」的破坏。
  const src25 = srcOf('tools/coverage-report.js');
  const b25 = wreck(src25, "  catch (e) { return { ok: false, reason: 'no-data', hint: '目录不存在：' + d + '（覆盖率数据须由 NODE_V8_COVERAGE 产出）', rows: [] }; }", '  catch (e) { throw e; }', a, 'tools/N2');
  if (b25) {
    const cv2 = loadBroken(b25);
    let threw = false;
    try { cv2.collect(path.join(TMP, '仍然不存在'), { root: TMP }); } catch (e) { threw = true; }
    a(threw === true, 'tools/N2: 破坏后不存在的目录让工具**抛异常**（判据现形：原版返回 no-data 而不抛）');
  }

  // N3(#26). 让「无 JSDoc」永远不被计数 ⇒ 缺文档从读数里消失
  const src26 = srcOf('tools/doc-gate.js');
  const b26 = wreck(src26, "      if (!f.hasDoc) { undocumented++; missing.push({ file: rel, fn: f.name, line: f.line, why: 'no-jsdoc' }); return; }", '      if (false) { }', a, 'tools/N3');
  if (b26) {
    const dg2 = loadBroken(b26);
    const au2 = dg2.audit({ root: BASE });
    a(au2.missing.length === 0 && au2.rate === 1,
      'tools/N3: 破坏后缺文档面归零、文档率变 100%（判据现形：原版 missing>0 且 rate<1，实 '
      + au2.missing.length + '/' + au2.rate + '）');
  }

  // N4(#27). 摘掉空查询守卫 ⇒ 一个无意义查询返回 ok:true 的「零影响」
  const src27 = srcOf('tools/impact-analysis.js');
  const b27 = wreck(src27, "  if (!t) return { ok: false, reason: 'missing-target' };", '  ', a, 'tools/N4');
  if (b27) {
    const ia2 = loadBroken(b27);
    const r2 = ia2.analyze('', { root: BASE });
    a(r2.ok === true, 'tools/N4: 破坏后空查询返回 ok:true（判据现形：原版 missing-target）—— '
      + '「查不出来」被伪装成「没有影响」，这正是本工具要防的误导');
  }

  // N5(#28). 把「恰 1 次」放宽成「≥1 次」⇒ 2 次命中的目标被判为可应用（重复插入的源头）
  //   为什么锚点选这一行而不是 `hits >= 2` 那行：后者**去掉了也不会改变结论** ——
  //   末行兜底 `命中 N 次 != 期望 w` 同样返回 refuse-ambiguous（首版就是这么写的，
  //   实测破坏后判定仍是 refuse-ambiguous，判据没现形）。这条经验值得留下：
  //   **同一结论有两条路径时，只破坏其中一条不会让判据现形。**
  const src28 = srcOf('tools/patch-idempotency.js');
  const b28 = wreck(src28, "  if (hits === 1 && w === 1) return { verdict: 'can-apply', hits: 1, reason: '锚点恰 1 次' };", "  if (hits >= 1) return { verdict: 'can-apply', hits: hits, reason: '锚点命中' };", a, 'tools/N5');
  if (b28) {
    const pi2 = loadBroken(b28);
    const d2 = pi2.decide('abcXYZdefXYZ', 'XYZ');
    a(d2.verdict === 'can-apply',
      'tools/N5: 破坏后 2 次命中的目标被判为「可应用」（实 ' + d2.verdict + '）—— '
      + '而重复插入两次代码块正是这个判定失效后的形态');
  }

  // N6(#29). 摘掉「外来 hook 拒绝覆盖」⇒ 别人的 hook 被静默吃掉
  const src29 = srcOf('tools/hooks.js');
  const b29 = wreck(src29, "  if (prev !== null && prev.indexOf(SIGN) < 0 && !o.force) {", '  if (false) {', a, 'tools/N6');
  if (b29) {
    const hk2 = loadBroken(b29);
    const root = path.join(TMP, 'n6root');
    fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho 别人的\n');
    const r = hk2.install('pre-commit', { root: root });
    a(r.ok === true && fs.readFileSync(path.join(root, '.git', 'hooks', 'pre-commit'), 'utf8').indexOf('别人的') < 0,
      'tools/N6: 破坏后外来 hook 被直接覆盖且无备份（判据现形：原版 refuse-foreign-hook）');
  }

  // N7(#30). 摘掉「区间必须显式」⇒ 工具自己猜一个区间出来
  const src30 = srcOf('tools/gen-changelog.js');
  const b30 = wreck(src30, "  if (parts.length !== 2 || !parts[0] || !parts[1]) {", "  if (false) {", a, 'tools/N7');
  if (b30) {
    const gc2 = loadBroken(b30);
    // 判据取「裸 rev（无 ..）不再被拒」这一**行为面**，而不是「它猜出了某个区间」：
    //   破坏后 range('HEAD') 会去 `git log --reverse HEAD` 跑一条合法命令，返回**单个**提交。
    //   原始判据写 `r.ok === true` 是过强的 —— 它把「拒绝与否」与「git 命令成不成功」混在一起。
    const r = gc2.range('HEAD', { root: BASE });
    a(r.reason !== 'need-explicit-range',
      'tools/N7: 破坏后裸 rev 不再被拒（reason 由 need-explicit-range 变成 '
      + JSON.stringify(r.reason) + '）—— 判据现形：原版对无区间输入一律不猜');
  }

  // N8. 纯度：全部工具在原版上，本文件用过的判据必须为真（否则上面「现形」说明不了什么）
  const gl0 = require(path.join(BASE, 'tools/gen-lock.js'));
  a(gl0.check(gl0.render('core/fault-context.js', 'faultContext', ['wrap'])).todos > 0,
    'tools/N8: （纯度）原版上 gen-lock 的占位判据为真');
  const cv0 = require(path.join(BASE, 'tools/coverage-report.js'));
  a(cv0.collect(path.join(TMP, '真不存在'), { root: TMP }).reason === 'no-data',
    'tools/N8: （纯度）原版上覆盖率 no-data 判据为真');
  const pi0 = require(path.join(BASE, 'tools/patch-idempotency.js'));
  a(pi0.decide('aXYZbXYZ', 'XYZ').verdict === 'refuse-ambiguous',
    'tools/N8: （纯度）原版上幂等拒绝判据为真');
  const hk0 = require(path.join(BASE, 'tools/hooks.js'));
  a(hk0.renderHook('pre-push').text.indexOf('WORLDAXIS_FULL') > 0,
    'tools/N8: （纯度）原版上 pre-push 不阻断判据为真');
  const gc0 = require(path.join(BASE, 'tools/gen-changelog.js'));
  a(gc0.range('HEAD', { root: BASE }).reason === 'need-explicit-range',
    'tools/N8: （纯度）原版上显式区间判据为真');

  // N9. 反空转下限：破坏面必须是**七件真有内容的源文件**
  const sizes = Object.keys(FACES).map(function (rel) { return srcOf(rel).length; });
  a(sizes.every(function (n) { return n > 1000; }),
    'tools/N9: 七件工具源码面全部非空（最小 ' + Math.min.apply(null, sizes) + ' 字符）—— '
    + '空文件上的「零现形」恒真');
}

module.exports = { FACES: FACES, TMP: TMP, srcOf: srcOf, hit: hit, loadBroken: loadBroken,
  runA: runA, runB: runB, runC: runC, runNegative: runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runNegative(a);
  console.log('tools-v2110 ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
}