'use strict';
/**
 * tests/module-cycle-gate-v2107.js — 模块依赖静态图（计划一 #20）四段专锁。
 *   A 静态契约：导出面形状、五张登记面形态、形态表不许放宽、锚点纯度。
 *   B 运行时：真跑 module-cycle-gate，拿现场读数（覆盖率 / 三类边 / 恒等式 / 交叉验证）。
 *   C 不变式：判据纯只读（连调不变量、不改被取证文件）。
 *   N 负控制：**真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据**。
 *
 * 为什么负控制走「装载破坏副本」而不是改真文件：本门禁要治的病之一正是
 *   「0 条边」与「扫描器全瞎了」长得一模一样；若验证判据真会现形要靠改真文件，
 *   验证者自己就成了新的风险源。副本装载用 vm.runInNewContext 包 CommonJS 外壳，
 *   `__dirname` 指到 tests/，故相对 require 与 path.join(__dirname,'..') 照原样工作
 *   （这是「装载」而不是「字符串匹配」：破坏必须在**真模块**上现形）。
 *
 * 本锁自证（H 系列口径）：
 *   H5 每个锚点字面量在其目标文件里恰中 1 次、且在本文件里恰声明 1 次（缺失与重复同罪）。
 *   H6 判据两向自证：原版上必须为真（A/B 组），破坏副本上必须为假（N 组）；
 *      且每处破坏必须**真的改变源码**（breakOnce 会抛，不许静默）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/module-cycle-gate-v2107.js';
const MOD_REL = 'tests/module-cycle-gate.js';
const RUN_REL = 'tests/run.js';
const LEDGER_REL = 'tests/module-registry-ledger.json';

/**
 * 统一锚点表（{rel, txt}；txt 在目标文件里恰中 1 次）。
 * 一律取**不含反斜杠**的行首片段——含非换行反斜杠的锚点在统一纯度口径下结构性不可满足（R87 H7）。
 */
const ANCHORS = {
  aAlias: { rel: MOD_REL, txt: 'const ALIAS_RE = (function () {' },
  aExternal: { rel: MOD_REL, txt: 'const EXTERNAL = {};' },
  aEntry: { rel: MOD_REL, txt: 'const ENTRY_NS = {' },
  aSkip: { rel: MOD_REL, txt: 'if (refs[rel] !== undefined) return;' },
  aOrder: { rel: MOD_REL, txt: 'if (pi > ci) orderViolation.push(' },
  aAlive: { rel: MOD_REL, txt: 'scanAlive: g.coverage.nsProvided > 0' },
  aLeak: { rel: MOD_REL, txt: 'const deadNs = Object.keys(g.nsOwner).filter(' },
  aWire: { rel: RUN_REL, txt: "const mcg = require('./module-cycle-gate.js');" }
};

/** 现场破坏：**全部**出现处一次改掉（字符串版 replace 只改第一处——v2.105.0 的 D2 教训）。 */
function allReplace(src, from, to) { return src.split(from).join(to); }

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

/** 真源码破坏，并证明破坏真的发生（没打中 ⇒ 抛，不许静默）。 */
function breakOnce(src, from, to, label) {
  const out = allReplace(src, from, to);
  if (out === src) throw new Error('破坏未生效（锚点没打中）:: ' + label + ' :: ' + from);
  return out;
}

/** 装载破坏副本（CommonJS 外壳 + 原目录 __dirname）。 */
function loadCopy(rel, src) {
  const dir = path.dirname(path.join(BASE, rel));
  const m = { exports: {} };
  // require 解析必须与 Node 同规矩：裸模块名（fs / path / vm）走模块查找，
  // 只有相对路径才补 dir。若一律 path.resolve(dir, p)，`fs` 会被拼成 <dir>/fs ⇒
  // Cannot find module（副本装载失败会被误读成「判据在破坏下也没反应」）。
  const req = function (p) {
    if (p.charAt(0) !== '.') return require(p);
    return require(path.resolve(dir, p));
  };
  // shebang 不是合法 JS：包进 CommonJS 外壳后 `#!...` 会变成 SyntaxError
  // （Invalid or unexpected token），而 `.js` 带 shebang 本身是对的（可执行入口）。
  // 装载副本前必须先剥掉——本锁锚点一律取函数体/常量区，不取首行，故此剥离不影响破坏落点。
  const body = src.replace(/^#![^\n]*\n/, '');
  const fn = vm.runInNewContext(
    '(function (module, exports, require, __filename, __dirname) {\n' + body + '\n})',
    { console: console, process: process, Buffer: Buffer });
  fn(m, m.exports, req, path.join(BASE, rel), dir);
  return m.exports;
}

/** 锚点纯度（H5）。 */
function auditAnchors(A) {
  const self = rd(SELF_REL);
  Object.keys(ANCHORS).forEach(function (k) {
    const a = ANCHORS[k];
    const nTarget = rd(a.rel).split(a.txt).length - 1;
    const nSelf = self.split(a.txt).length - 1;
    A(nTarget === 1, 'A5 锚点 ' + k + ' 在 ' + a.rel + ' 里恰 1 次（实 ' + nTarget + '）');
    A(nSelf === 1, 'A5 锚点 ' + k + ' 在本锁里恰声明 1 次（实 ' + nSelf + '，缺失与重复同罪）');
  });
}

/** 造一份最小假产品面（负控制用：不改真文件，全部走 opt.read 注入）。 */
function fakeProduct(over) {
  const d = {
    'index.js': 'const WA = (function () { return (typeof G !== "undefined" ? (G.WorldAxis = G.WorldAxis || {}) : {}); })();\n',
    'core/a.js': "const WA = window.WorldAxis = window.WorldAxis || {};\nWA.alpha = function () {};\nWA.beta = 1;\nWA.alpha();\n",
    'core/b.js': 'const WA = (window.WorldAxis = window.WorldAxis || {});\nWA.gamma = 1;\nWA.alpha();\n'
  };
  return Object.assign(d, over || {});
}

function runAll(A) {
  const S = rd(MOD_REL);
  const M = require('./module-cycle-gate.js');

  // ── A 静态契约 ──
  const EXPORTS = ['scan', 'audit', 'summary', 'loadOrder', 'loadOrderSrc', 'productFiles',
    'acyclic', 'readLedger', 'EXTERNAL', 'ENTRY_NS', 'UI_NS', 'CONTRACT_NS', 'SELF_REF_NS',
    'NS_FACE_EXPECT', 'ALIAS_HOST_NS', 'EXTERNAL_PREFIX', 'NS_FIELD_MAP', 'ALIAS_RE', 'LEDGER'];
  const keys = Object.keys(M).sort();
  A(keys.join(',') === EXPORTS.slice().sort().join(','),
    'A1 导出面恰为 ' + EXPORTS.length + ' 项（实 ' + keys.length + '：' + keys.join(',') + '）');
  // 形态表必须**真宽**（三种 alias 形态都在同一正则里）
  A(M.ALIAS_RE instanceof RegExp && !M.ALIAS_RE.global,
    'A2 ALIAS_RE 是正则且非全局（逐文件 match 用）');
  const reSrc = M.ALIAS_RE.source;
  A(reSrc.indexOf('\\(?') >= 0 && reSrc.indexOf('\\)?') >= 0,
    'A2b ALIAS_RE 允许外层括号（第二种形态：const WA = (window.WorldAxis = ...));');
  A(reSrc.indexOf('WorldAxis') >= 0 && reSrc.indexOf('\\|\\|') >= 0,
    'A2c ALIAS_RE 认 `HOST.WorldAxis || {}` 本体（宿主变量名不限，第三种形态靠它兜）');
  // 五张登记面必须是对象（逐条理由表）
  ['EXTERNAL', 'ENTRY_NS', 'UI_NS', 'CONTRACT_NS', 'SELF_REF_NS'].forEach(function (t) {
    A(M[t] && typeof M[t] === 'object' && !Array.isArray(M[t]),
      'A3 ' + t + ' 是「名字 -> 理由」的对象表（不是数组：每条必须给理由）');
  });
  A(Object.keys(M.CONTRACT_NS).length >= 1 && M.CONTRACT_NS.digest,
    'A3b digest 的跨文件替换已登记在 CONTRACT_NS 并附理由（try/finally 成对，不是第二个提供方）');
  A(Object.keys(M.EXTERNAL).length === 0,
    'A4 EXTERNAL 显式为空 —— 本仓没有「由宿主提供、且以 A.ns 形态被读」的外名'
    + '（别名宿主名走 ALIAS_HOST_NS，不进这条判据）');
  A(M.EXTERNAL_PREFIX.length === 0,
    'A4b EXTERNAL_PREFIX 为空 —— 不放宽到「凡下划线一律放行」（那是掩盖而非覆盖）');
  A(Object.keys(M.NS_FACE_EXPECT).length === 3
    && Array.isArray(M.NS_FACE_EXPECT.onlyStatic) && Array.isArray(M.NS_FACE_EXPECT.onlyLedger)
    && Array.isArray(M.NS_FACE_EXPECT.internalPrefixed),
    'A4c ns 面差集的三张登记面齐备（onlyStatic / onlyLedger / internalPrefixed）');
  // 边界必须真写在实现里
  A(S.indexOf('EXTERNAL_PREFIX.some') >= 0, 'A6 外名前缀真的参与了「未提供」判定');
  A(S.indexOf('if (rel.indexOf(\'ui/\') === 0) return false;') >= 0,
    'A6b notInOrder 跳过 ui/（UI 层由运行时外壳挂载，不进 LOAD_ORDER）');
  A(S.indexOf(ANCHORS.aLeak.txt) >= 0 && S.indexOf('return !readAll[ns];') >= 0,
    'A6c 零读 ns 的判据按 readAll（产品源面读集合）而不是「文件里出现过」');
  A(S.indexOf('恒等式') >= 0 && S.indexOf('覆盖率') >= 0,
    'A7 summary 同时给出覆盖率与恒等式态（缺一都无法区分「真没有」与「瞎了」）');
  A(S.indexOf('if (mods) {') >= 0 && S.indexOf('refUnseen: true') >= 0,
    'A8 账本有 requires 而静态面没扫到时不许静默丢边（补 refUnseen）');
  A(S.indexOf("if (!led) return false;") >= 0 || S.indexOf('ledNs[ns]') >= 0,
    'A9 ns 面差集读账本（账本不可用时整面跳过）');
  auditAnchors(A);

  // ── B 运行时（现场真跑） ──
  const a = M.audit();
  // v2.140.0（F1 防全知闸门）：新增 engines/noesis.js（noesis 命名空间）⇒ 文件面 165 → 166、
  //   解析出别名 165 → 166、有引用 163 → 164（零引用仍恰 core/input-guard.js / core/sanitize.js
  //   两个声明过的纯函数基元——noesis 读 store（登记自己）故有引用，不落零引用名单）。
  //   现场读数由 M.audit() 采，非估算；增量逐条可核（+1 文件、+1 别名、+1 有引用）。
  // v2.141.0（F2）：新增 engines/lifeline.js（lifeline 命名空间）⇒ 文件面 166 → 167、
  //   解析出别名 166 → 167、有引用 164 → 165（零引用仍恰 core/input-guard.js / core/sanitize.js
  //   两个声明过的纯函数基元——lifeline 读 store（登记自己）故有引用，不落零引用名单）。
  // v2.142.0（F3）：新增 engines/perspective-lock.js（perspective 命名空间）⇒ 文件面 167 → 168、
  //   解析出别名 167 → 168、有引用 165 → 166（零引用仍恰 core/input-guard.js / core/sanitize.js
  //   两个声明过的纯函数基元 —— perspective-lock 读 store（登记自己）故有引用，不落零引用名单）。
  //   现场读数由 M.audit() 采，非估算；增量逐条可核（+1 文件、+1 别名、+1 有引用）。
  // v2.153.0（RX5+RX6）：新增 engines/plot-gauge.js 与 engines/branch-tree.js ⇒
  //   文件面 176 → 178、解析出别名 176 → 178、有引用 174 → 176（两模块都读 store（登记自己）
  //   故有引用，零引用仍恰 core/input-guard.js / core/sanitize.js 两个声明过的纯函数基元）。
  // v2.154.0（RX4+RX7）：新增 engines/world-bridge.js 与 engines/eco-audit.js ⇒
  //   文件面 178 → 180、解析出别名 178 → 180、有引用 176 → 178（两模块都读 store（登记自己）
  //   故有引用，零引用仍恰 core/input-guard.js / core/sanitize.js 两个声明过的纯函数基元）。
  // v2.165.0（TX1）：新增 engines/diplomacy.js ⇒ 文件面 185 → 186、解析出别名 185 → 186、
  //   有引用 183 → 184（diplomacy 读 store（登记自己）故有引用；零引用名单不变）。
  // v2.166.0（TX2）：新增 engines/agency.js ⇒ 文件面 186 → 187、解析出别名 186 → 187、
  //   有引用 184 → 185（agency 读 store/plan/act/life 故有引用；零引用名单不变）。
  A(a.files === 188 && a.aliasFiles === 188 && a.refFiles === 186,
    'B1 文件面 ' + a.files + ' / 解析出别名 ' + a.aliasFiles + ' / 有引用 ' + a.refFiles
    + '（覆盖率三数一起报，不许只报边数）');
  // v2.124.0（R4 · 补 v2.123.0 欠账）：1054 / 1091 → 1057 / 1094。
  //   现场逐条 diff（`git show 73be9de^:<file>` 对照工作区，只算 WA.<ns>.<mem> 形态的
  //   静态引用，排除注释行与自引用）得到**恰好三条新增**，与 +3 逐条对得上：
  //     · render/inject.js +timeline.hashText        （P3 的键级指纹复用既有实现）
  //     · render/inject.js +injectBudget.incrementalCost（P3 的观测面真调用）
  //     · engines/tool-diag.js +perfTrace.bandCompare（P4 的诊断结构面）
  //   三条都在调用期（无一条落在装载期）⇒ 装载期 37 不变、调用期 1054→1057、总 1091→1094。
  //   再叠上 v2.124.0（P5 + P6）本版自己新增的两条：
  //     · core/settings-bus.js +permissions.gate（rmRemove 的删除闸门 —— `permissions` 这个
  //       命名空间此前只有 core/store.js 一处消费方，现在多了设置总线这一处）
  //     · ui/panel.js +permissions.gateStat（心跳块的删除闸门那一格）
  //   ⇒ 调用期 1057→1059、总 1094→1096。两条都由现场 diff 逐条核对过，不是「+2 就对了」。
  //   ui/panel.js 的 `perfTrace.bandCompare` 与 tool-diag 同属**同一命名空间同一成员**，
  //   集合去重后只算一条 —— 这也是为什么「文件改了两处、边只多一条」。
  // v2.140.0（F1）：engines/noesis.js 尾部真调 WA.registerModule('engines/noesis.js', …)
  //   （registerModule 由 store 提供）⇒ 装载期边 63 → 64；调用期 1215 不变——
  //   它读的 store / clock / settingsBus 三个 ns 早在调用期面内，集合去重后不新增边
  //   （同 v2.124.0 记过的「文件改两处、边只多一条」：边是 (file, ns) 对，不是站点数）。
  // v2.141.0（F2）：两条新硬边，逐条可核——
  //   ① engines/lifeline.js 尾部真调 WA.registerModule（registerModule 由 store 提供）
  //      ⇒ 装载期边 64 → 65；
  //   ② 调用期 1215 → 1225（+10）：它读的 ns 里 store / clock / settingsBus / inputGuard / evict
  //      早已在调用期面内（集合去重后不新增边），真正新增的 (file, ns) 对来自**五处新读者**：
  //      render/inject.js（注入分支读 lifeline.buildBlock）、engines/tool-diag.js（secLifeline 读 boundary）、
  //      ui/panel.js（13 枚控件真读 register / advance / capacityOf / careGap / view / getSettings / setSettings）、
  //      engines/noesis.js（attenuationOf 读 lifeline.capacityOf，感知第二轴的真源）
  //      —— 同 v2.124.0 记过的「边是 (file, ns) 对，不是站点数」，故 +11 而非按控件数膨胀。
  // v2.142.0（F3）：两条新硬边，逐条可核——
  //   ① engines/perspective-lock.js 尾部真调 WA.registerModule（registerModule 由 store 提供）
  //      ⇒ 装载期边 65 → 66；
  //   ② 调用期 1225 → 1234（+9）：它读的 ns 里 store / clock / settingsBus / inputGuard / evict
  //      早已在调用期面内（集合去重后不新增边），真正新增的 (file, ns) 对来自**四处新读者**：
  //      render/inject.js（注入分支读 perspective.buildBlock）、engines/tool-diag.js（secPerspective 读 boundary）、
  //      ui/panel.js（8 枚控件真读 assign / current / allows / boundary / buildBlock / leakScan / getSettings / setSettings）、
  //      engines/probe.js（`view` 的第二参读 intel.project —— 这正是 D2 信息生态收口那条口）
  //      —— 同 v2.124.0 记过的「边是 (file, ns) 对，不是站点数」，故 +9 而非按控件数膨胀。
  // v2.153.0（RX5+RX6）：两条新硬边，逐条可核——
  //   ① 两个新引擎尾部各真调 WA.registerModule（registerModule 由 store 提供）⇒ 装载期边 71 → 73；
  //   ② 调用期 1297 → 1313（+16）：它们读的 ns 里 store / clock / settingsBus / inputGuard / evict
  //      早已在调用期面内（集合去重后不新增边），真正新增的 (file, ns) 对来自**五处新读者**：
  //      engines/rehearsal.js（branch-tree 经 rehearsal.preview / checkPreview 反读，指纹面同批）
  //      —— 实为 tools 侧；render/inject.js 无（两者都不产注入块）、engines/tool-diag.js
  //      （secPlotGauge / secBranchTree 两节）、ui/panel.js（11 枚控件真读）、
  //      engines/branch-tree.js 与 engines/plot-gauge.js 各读彼此无关的 ns。
  //      —— 同 v2.124.0 记过的「边是 (file, ns) 对，不是站点数」。
  // v2.154.0（RX4+RX7）：两条新硬边 + 调用期 1313 → 1335（+22）——逐条可核：
  //   ① 两个新引擎尾部各真调 WA.registerModule（registerModule 由 store 提供）⇒ 装载期边 73 → 75；
  //   ② 调用期 1313 → 1335：真正新增的 (file, ns) 对来自五处新读者（world-bridge 读 store/rumor/chronicle，
  //      eco-audit 读 causal/chrono/people/rumor，两者都不产注入块）—— 同 v2.124.0 记过的
  //      「边是 (file, ns) 对，不是站点数」，故不按控件数膨胀。
  A(a.edgesLoad === 85 && a.edgesCall === 1425 && a.edgesAll === 1510 && a.identityOk,
    'B2 边恒等式：装载期 ' + a.edgesLoad + ' + 调用期 ' + a.edgesCall + ' = ' + a.edgesAll
    + '（v2.117.0（计划二 B1–B6）：新增 engines/act.js / engines/opportunity.js /'
    + ' engines/recipe.js 三文件（act / opportunity 尾读 registerModule ⇒ 装载期边 +1；'
    + '三者调用期读 store/clock/evict/org/intel/theme ⇒ 调用期 +33）'
    + '（v2.123.0（优化计划 P3 + P4）：render/inject.js 真调 injectBudget.incrementalCost 与'
    + ' timeline.hashText、engines/tool-diag.js 真读 perfTrace.bandCompare（面板那一处同成员去重）'
    + ' ⇒ 调用期 +3，37 / 1054 / 1091 → 37 / 1057 / 1094；本常量在 v2.123.0 漏回填，v2.124.0 补账）'
    + '（运行期定案 37 条装载期读；静态引用 1091 条里 1054 条是调用期，'
    + '拿 909 判次序会报 281 条噪声；v2.110.0（计划一 #21/#22 + 计划二 #39/#70）新增 core/fault-context.js / core/schema.js / core/permissions.js 三文件后：装载期边 23 不变、调用期 +9（归因为提供方）、文件面 +3）'
    + ' v2.111.0（计划二 #67/#69）新增 core/audit-log.js（auditLog）与 core/sanitize.js（sanitize）两文件后：装载期边 23 不变、调用期 +5（store 的审计写入 + permissions 两处拒绝留痕 + 面板字面调用 sanitize）、文件面 +2）'
    + ' v2.112.0（计划二 #31/#32/#33 + #36/#37/#38/#40）新增 engines/chrono.js（chrono）与 engines/collab.js（collab）两文件后：装载期边 23 不变、调用期 +15（chrono 只读 store/clock、collab 只读 store/inputGuard，两者都不在装载期读 WA）、文件面 +2）' + ' v2.114.0（计划二 #56/#68）新增 core/sandbox.js（sandbox）与 core/plugin.js（plugin）两文件后：装载期边 23 → 25（两模块尾部都调 WA.registerModule 登记自己，而 registerModule 由 store 提供 ⇒ 各多 1 条装载期硬边；两者初版排在 store 之前，现场报 2 条 order-violation，已移到 store 之后修正）、调用期 +12（store 两处 WA.plugin.fire + tool-diag 诊断节 + 面板字面调用）、文件面 +2） v2.114.0 收口：engines/collab.js（prune 三处）与 engines/chrono.js（entries 落盘后挤出）各接 WA.evict.array ⇒ 调用期再 +2（915 / 940，2 条新站点引用 core/evict.js）'
    + ' v2.129.0（拓展计划 A1–A10）：新增十个引擎文件（userlock / rewriter / storyclock / rhythm-loop / motif /'
    + ' beat-mask / preset-world / power-anchor / request-viewer / wb-search）⇒ 文件面 140 → 150、有引用 148。'
    + '装载期边 37 → 47：十个文件尾部各调 WA.registerModule（registerModule 由 store 提供）⇒ 各 +1；'
    + '它们分三组插在 render/inject.js 之前与之后，全部排在 store 之后，现场 order-violation 0。'
    + '调用期 1072 → 1125（+53）：五条产注入块的引擎（userlock / rhythm-loop / motif / beat-mask / power-anchor）'
    + '在 render/inject.js 真调 buildBlock；rewriter / storyclock 为旁路；preset-world / request-viewer /'
    + ' wb-search 三条旁路只在 tests/run.js 与 ui/panel.js 接读者。LOAD_ORDER 139 → 149（同十个文件）。'
    + ' v2.136.0（E6）：新增 engines/foreshadow.js（foreshadow 命名空间）⇒ 文件面 162 → 163、有引用 160 → 161、LOAD_ORDER 161 → 162；装载期边 59 → 60（尾部调 WA.registerModule，registerModule 由 store 提供）；调用期 1178 → 1185（它读 store / clock / inputGuard / settingsBus 四 ns，并经 tool-diag 的诊断节与 render/inject.js 的注入分支各被读一次）；命名空间面：静态提供方 191 → 192、账本 166 → 167、读面 170 → 171。'
    + ' v2.138.0（E7 + E5）：文件面 163 → 164、有引用 161 → 162、LOAD_ORDER 162 → 163；'
    + '装载期边 60 → 62、调用期 1185 → 1191、合计 1245 → 1253；命名空间面：静态提供方 192 → 193、'
    + '账本 167 → 168、读面 171 不变（新增的 apiRouter / inputGuard / workflow 三个 ns 都早已在读面内）。'
    + ' **逐条 diff（HEAD 树 256aead vs 工作区，只算 (file, ns) 对、集合去重）实测恰好 8 条新增、0 条消失**：'
    + ' E7 给 engines/hazard.js 加 workflow 节点（chain after / order 13），尾部真调 `WA.workflow.register`'
    + ' ⇒ +1 装载期边（workflow 由 core/workflow.js 提供，供者 LOAD_ORDER 下标在前，order-violation 仍 0）；'
    + ' 另有 ui/settings.js → hazard 一条**调用期**边 —— E7 的面板读数行（wa-hzwx-view）真读'
    + ' hazard.getSettings / hazard.stat，这也是那两个成员从死导出面离场的原因（人真读了）。'
    + ' E7 自身**没有再添调用期边**：rollAll 新读的 settingsBus（联动开关）与 clock（上轮结算时刻）'
    + '在基线就已作为 (engines/hazard.js, ns) 对存在（E6 的结算链同读这两个 ns），集合去重后计数不动 ——'
    + ' 这正与 v2.124.0 记过的「文件改了两处、边只多一条」同款：边是 (file, ns) 对，不是站点数。'
    + ' E5 新增 engines/ensemble.js（ensemble 命名空间）⇒ 尾部同样调 WA.registerModule'
    + '（registerModule 由 store 提供）⇒ +1 装载期边；调用期 +5：apiRouter（并发取模型通道）/'
    + ' clock（超时与耗时刻度）/ inputGuard（入参净化，与 hazard 同款口径）/ settingsBus（配置面）'
    + ' / __settingsRegs（设置注册槽，全仓同一形态）。合计装载期 +2、调用期 +6、总计 +8 = 实测 8 条，'
    + ' 恒等式 62 + 1191 = 1253。专锁 tests/ensemble-v2138.js 的 N 面另钉「它零 store.transact / 零 store.patch」'
    + '（本门禁的 store 边只算 ns 对，读不出这一层；两条判据互补，不互相代替）。');
    // v2.161.0（TP3 页面恢复入口）：调用期 1382 → 1383（+1）、装载期 81 不变。
    //   新增的唯一一条 (file, ns) 对是 **engines/offline-return.js → index.js 的 mainWin** ——
    //   页面恢复入口要拿宿主窗口挂 `visibilitychange` / `pageshow`（与 playtime.win() 同规：
    //   `WA.mainWin || window`，故「真实宿主存在」时这条边在）。其余读面（clock / store /
    //   playtime / offlineTick / evolution / world / life / rand / inputGuard / settingsBus / log）
    //   在基线就已作为 (file, ns) 对存在，集合去重后不动。恒等式 81 + 1383 = 1464。
    //   为什么页面入口不新增**装载期**边：它不调 WA.registerModule、也不调 WA.workflow.register
    //   （入口是事件面的，不是链上的）—— 这一点由 tests/s3-tp3-v2161.js 的 A 段单独钉住。
    // v2.165.0（TX1）：装载期 82 → 83（diplomacy 尾部真调 WA.registerModule，registerModule 由
    //   store 提供）；调用期 1395 → 1404（+9）：diplomacy 自身读 store/clock/inputGuard/settingsBus/
    //   evolution/inst 六 ns（部分在基线内集合去重后不新增，真正新增的 (file, ns) 对来自它的
    //   三处新读者 —— render/inject.js 注入分支、ui/panel.js 控件（含 getSettings 初值渲染与
    //   setSettings 开关）、engines/tool-diag.js 诊断节（secDiplomacy 读 pairId/diagnose））。
    //   恒等式 83 + 1404 = 1487。
    // v2.166.0（TX2）：装载期 83 → 84（agency 尾部真调 WA.registerModule，registerModule 由
    //   store 提供）；调用期 1404 → 1415（+11）：agency 自身读 store/plan/act/life/inputGuard/
    //   settingsBus/clock 七 ns（部分在基线内集合去重后不新增，真正新增的 (file, ns) 对来自
    //   它的三处新读者 —— render/inject.js 注入分支、ui/panel.js 控件（含 getSettings 初值渲染
    //   与 setSettings 开关）、engines/tool-diag.js 诊断节（secAgency 读 diagnose/stat））。
    //   恒等式 84 + 1415 = 1499。
  // v2.140.0（F1）：LOAD_ORDER 164 → 165（engines/noesis.js 入序）。
  // v2.141.0（F2）：LOAD_ORDER 165 → 166（engines/lifeline.js 入序，紧随 noesis）。
  // v2.142.0（F3）：LOAD_ORDER 166 → 167（engines/perspective-lock.js 入序，紧随 lifeline）。
  // v2.153.0（RX5+RX6）：LOAD_ORDER 175 → 177（两个新引擎入序，紧随 storage-forecast）。
  // v2.154.0（RX4+RX7）：LOAD_ORDER 177 → 179（两个新引擎入序，紧跟 branch-tree）。
  // v2.165.0（TX1）：LOAD_ORDER 184 → 185（engines/diplomacy.js 入序）。
  // v2.166.0（TX2）：LOAD_ORDER 185 → 186（engines/agency.js 入序）。
  A(a.edgesLoad >= 20 && a.orderLen === 187,
    'B3 次序判据只在运行时定案的 ' + a.edgesLoad + ' 条装载期边上判（LOAD_ORDER ' + a.orderLen + ' 条）');
  A(a.orderViolation.length === 0,
    'B4 装载期边零次序违规（供者 LOAD_ORDER 下标恒 < 消费方）');
  // v2.141.0（F2）：静态提供方 195 → 196、账本 170 → 171、读面 173 → 174（lifeline 由
  //   module-registry-gate --update 落进账本，读面含上面那五处新读者）。
  // v2.142.0（F3）：静态提供方 196 → 197、账本 171 → 172、读面 174 → 175（perspective 由
  //   module-registry-gate --update 落进账本，读面含上面那四处新读者）。
  // v2.153.0（RX5+RX6）：静态提供方 205 → 207、账本 179 → 181、读面 183 → 186
  //   （plotGauge / branchTree 由 module-registry-gate --update 落进账本，
  //   读面含 tool-diag 两节与 ui/panel.js 的 11 枚控件）。
  // v2.154.0（RX4+RX7）：静态提供方 207 → 209、账本 181 → 183、读面 186 → 188
  //   （worldBridge / ecoAudit 由 module-registry-gate --update 落进账本，
  //   读面含 tool-diag 两节与 ui/panel.js 的联网页控件）。
  // v2.165.0（TX1）：静态提供方 214 → 216、账本 188 → 189、读面 193 → 194
  //   （diplomacy 与新消费面 render/inject.js 注入分支 + ui/panel.js 控件 + tool-diag 诊断节；
  //   静态 +2 = diplomacy 命名空间与 __settingsRegs 之外的引擎面新增，账本经 --update 落定）。
  // v2.166.0（TX2）：静态提供方 216 → 218、账本 189 → 190、读面 194 → 195
  //   （agency 与新消费面 render/inject.js 注入分支 + ui/panel.js 控件 + tool-diag 诊断节；
  //   静态 +2 = agency 命名空间与 clock 消费面新增，账本经 --update 落定）。
  A(a.nsProvided === 220 && a.nsLedger === 191 && a.nsRead === 196,
    'B5 命名空间面：静态提供方 ' + a.nsProvided + ' / 账本 ' + a.nsLedger + ' / 读面 ' + a.nsRead);
  // v2.152.0（RP6+RP7）：ui/render-perf.js 的 renderPerf 是 static-only 差（UI 层刻意不进
  //   LOAD，静态扫不到它的消费者）⇒ 差 25 → 26。
  // v2.153.0（RX5+RX6）：差仍为 26 —— 两个新 ns 都进了账本（引擎层不是 static-only 差）。
  // v2.165.0（TX1）：差 26 → 27（diplomacy 已入账本；差 +1 来自静态提供方面新增，
  //   登记理由同前——入口/内部前缀类，非未登记漂移）。
  // v2.166.0（TX2）：差 27 → 28（agency 已入账本；差 +1 来自静态提供方面新增，
  //   登记理由同前——入口/内部前缀类，非未登记漂移）。
  A(a.nsFaceDrift.length === 0 && a.nsProvided - a.nsLedger === 29,
    'B6 ns 面差 ' + (a.nsProvided - a.nsLedger) + ' 个全部有登记理由（入口/UI/内部前缀），零未登记漂移');
  // v2.153.0（RX5+RX6）：零读 ns 22 → 21（plotGauge 与 branchTree 都被 tool-diag 与面板真读，
  //   从零读名单里离场）。
  // v2.165.0（TX1）：零读 ns 21 → 22（diplomacy 的新消费面在 render/inject.js 注入分支 /
  //   ui/panel.js 控件 / tool-diag 诊断节，但静态扫描下其 __settingsRegs 等内部槽面新增
  //   一项未被读出的 ns —— 与 v2.153.0 前的 static-only 差同性质，只报不红）。
  // v2.166.0（TX2）：零读 ns 22 → 23（agency 的新消费面同上）。
  A(a.deadNs.length === 24, 'B7 零读 ns ' + a.deadNs.length + ' 个（只报不红：消费者可能是 tests/宿主）');
  A(a.crossFileWrite.length === 0 && a.staleRegistration.length === 0
    && a.unreflected.length === 0 && a.ownerMismatch.length === 0,
    'B8 四条硬判据全绿（跨文件写 ' + a.crossFileWrite.length + ' / 过期登记 '
    + a.staleRegistration.length + ' / 静态漏扫 ' + a.unreflected.length
    + ' / 归属错配 ' + a.ownerMismatch.length + '）');
  A(a.problems === 0 && a.ok && a.scanAlive && !a.cycle && !a.cycleWithProv && !a.notInOrder.length,
    'B9 总判据：problems ' + a.problems + ' / ok ' + a.ok + ' / 扫描面活着 ' + a.scanAlive
    + ' / 环 无 / 悬空文件 ' + a.notInOrder.length);
    // v2.153.0（RX5+RX6）：**B10 不变**（16/21）—— 本表数的是入口 ns（17）+ UI 层 ns（4），
  //   两个新引擎是普通引擎模块（进的是账本，不是这张表）。改动本项前先看这一行，
  //   否则会把「引擎进账本」误读成「登记表多两项」（本轮实测过一次）。
  A(a.registeredUsed === 16 && a.registeredTotal === 21,
    'B10 登记面在用 ' + a.registeredUsed + '/' + a.registeredTotal
    + '（未在用的 5 个是取数型入口 ns，只在 index.js 内部自用）');
  // v2.153.0（RX5+RX6）：两个新引擎进账本 ⇒ 账本缺项文件面收缩，缺项 5 不变（UI 层仍 4 文件）。
  A(a.runtimeMissing === 5 && a.ledgerAvailable,
    'B11 账本缺项文件 ' + a.runtimeMissing + ' 个（入口 + 四个 UI 文件，如实报出）');
  // 次序判据方向的两向自证（用假产品面，不碰真文件）
  const fakeOk = M.audit({
    read: function (rel) { return fakeProduct()[rel] || ''; },
    files: Object.keys(fakeProduct()),
    indexSrc: 'const LOAD_ORDER = [\n  \'core/a.js\',\n  \'core/b.js\'\n];',
    // 注入面必须与真源同构：readLedger 返回的是**账本对象**（含 modules 一层）。
    // 少写一层 ⇒ 交叉验证面静默全空，「0 条违规」会在空集上恒真（不可用 ≠ 健康）。
    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },
      'core/b.js': { requires: ['alpha'], requiresFiles: ['core/a.js'] } } },
    ledgerText: null
  });
  A(fakeOk.orderViolation.length === 0 && fakeOk.unprovided.length === 0,
    'B12 假面上「供者先装」不报违规（实 ' + fakeOk.orderViolation.length + '）—— 判据不是恒真');
  const fakeBad = M.audit({
    read: function (rel) { return fakeProduct()[rel] || ''; },
    files: Object.keys(fakeProduct()),
    indexSrc: 'const LOAD_ORDER = [\n  \'core/b.js\',\n  \'core/a.js\'\n];',
    // 注入面必须与真源同构：readLedger 返回的是**账本对象**（含 modules 一层）。
    // 少写一层 ⇒ 交叉验证面静默全空，「0 条违规」会在空集上恒真（不可用 ≠ 健康）。
    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },
      'core/b.js': { requires: ['alpha'], requiresFiles: ['core/a.js'] } } },
    ledgerText: null
  });
  A(fakeBad.orderViolation.length === 1
    && fakeBad.orderViolation[0].from === 'core/b.js' && fakeBad.orderViolation[0].to === 'core/a.js',
    'B12b 假面上把装载序倒过来 ⇒ 恰报 1 条次序违规（用者先装 b@0 → 供者 a@1）—— 判据真在测方向');
  // 「未提供」判据的两向自证
  const fakeGhost = M.audit({
    read: function (rel) {
      const f = fakeProduct({ 'core/b.js': 'const WA = window.WorldAxis = window.WorldAxis || {};\nWA.nobody = 1;\nWA.ghostNs();\n' });
      return f[rel] || '';
    },
    files: Object.keys(fakeProduct()),
    indexSrc: 'const LOAD_ORDER = [\n  \'core/a.js\',\n  \'core/b.js\'\n];',
    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },
      'core/b.js': { requires: [], requiresFiles: [] } } },
    ledgerText: null
  });
  A(fakeGhost.unprovided.length === 1 && fakeGhost.unprovided[0].ns === 'ghostNs',
    'B13 假面上读一个无人提供的 ns ⇒ 恰报 1 条未提供（'
    + fakeGhost.unprovided.map(function (u) { return u.ns; }).join(',') + '）');
  // 跨文件写判据的两向自证
  const fakeDup = M.audit({
    read: function (rel) {
      const f = fakeProduct({ 'core/b.js': 'const WA = window.WorldAxis = window.WorldAxis || {};\nWA.alpha = function () {};\n' });
      return f[rel] || '';
    },
    files: Object.keys(fakeProduct()),
    indexSrc: 'const LOAD_ORDER = [\n  \'core/a.js\',\n  \'core/b.js\'\n];',
    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },
      'core/b.js': { requires: [], requiresFiles: [] } } },
    ledgerText: null
  });
  A(fakeDup.crossFileWrite.length === 1 && fakeDup.crossFileWrite[0].ns === 'alpha',
    'B14 假面上两文件都赋值 alpha ⇒ 恰报 1 条跨文件写（'
    + fakeDup.crossFileWrite.map(function (c) { return c.ns; }).join(',') + '）');
  void fakeOk;

  // ── C 不变式 ──
  const before = { mod: rd(MOD_REL), led: rd(LEDGER_REL) };
  const a1 = M.audit(), a2 = M.audit(), a3 = M.audit();
  A(JSON.stringify(a1) === JSON.stringify(a2) && JSON.stringify(a2) === JSON.stringify(a3),
    'C1 audit 连调幂等（三次同值）');
  A(M.summary() === M.summary(), 'C1b summary 连调幂等');
  A(JSON.stringify(M.loadOrder()) === JSON.stringify(M.loadOrder()), 'C1c loadOrder 连调幂等');
  A(rd(MOD_REL) === before.mod && rd(LEDGER_REL) === before.led,
    'C2 判据纯只读：连调后模块与账本逐字未变（取证不得改变被取证对象）');
  A(M.productFiles().length === a.files,
    'C2b productFiles 连调同长且与现场文件面同源（' + M.productFiles().length
    + ' === ' + a.files + '）');
}

function runNegative(A) {
  const S = rd(MOD_REL);
  let n = 0;
  const done = function (label) { n += 1; return label; };

  // ── N1 真源码破坏：ALIAS_RE 窄到只认一种形态 ⇒ 别名覆盖率塌陷 ──
  const narrow = 'const ALIAS_RE = new RegExp("const\\\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\\\s*=\\\\s*window\\\\.WorldAxis\\\\s*=\\\\s*window\\\\.WorldAxis\\\\s*\\\\|\\\\|\\\\s*\\\\{\\\\s*\\\\}\\\\s*;");';
  // 破坏必须换掉**整个 IIFE 块**：只换首行会留下孤立的 `})();`，破坏副本变成 SyntaxError，
  // 于是「判据没反应」与「副本根本没装载起来」长得一模一样（本锁要治的正是这类混淆）。
  // 块文本由切片取得（不是字面量），故锚点整串在本锁里仍只出现 1 次（锚点表那行）。
  const n1i = S.indexOf(ANCHORS.aAlias.txt);
  const n1j = S.indexOf('})();', n1i) + 5;
  const aliasBlock = S.slice(n1i, n1j);
  const n1src = breakOnce(S, aliasBlock, narrow, 'N1');
  const n1 = loadCopy(MOD_REL, n1src);
  const n1a = n1.audit();
  A(n1a.aliasFiles < n1a.files,
    done('N1b 装载破坏副本 ⇒ 别名面塌陷（' + n1a.aliasFiles + '/' + n1a.files
      + ' < 119）—— 证明 B1 的下限判据真在测覆盖率，而不是恒真'));

  // ── N2 真源码破坏：EXTERNAL 表填一个假外名 ⇒ 「过期登记」判据必须现形 ──
  const n2src = breakOnce(S, ANCHORS.aExternal.txt, "const EXTERNAL = { ghostExternal: '假外名' };", 'N2');
  const n2 = loadCopy(MOD_REL, n2src);
  const n2a = n2.audit();
  A(n2a.staleRegistration.some(function (s) { return s.ns === 'ghostExternal'; }),
    done('N2b 装载破坏副本 ⇒ 报出过期登记 ' + n2a.staleRegistration.map(function (s) { return s.ns; }).join(',')
      + '（原版为空）—— 证明 B8 的「无过期登记」不是恒真'));

  // ── N3 真源码破坏：次序方向写反（pi < ci）⇒ 真源码上必须报违规 ──
  const n3src = breakOnce(S, ANCHORS.aOrder.txt, 'if (pi < ci) orderViolation.push(', 'N3');
  const n3 = loadCopy(MOD_REL, n3src);
  const n3a = n3.audit();
  A(n3a.orderViolation.length > 20,
    done('N3b 装载破坏副本 ⇒ 方向写反后报出 ' + n3a.orderViolation.length
      + ' 条「违规」（真源码上恒 0）—— 证明判据方向是现场测出来的，不是恒真'));

  // ── N4 真源码破坏：恒真保护被抽掉 ⇒ 空扫描面也会判绿 ──
  const n4src = breakOnce(S, ANCHORS.aAlive.txt, 'scanAlive: false && g.coverage.nsProvided > 0', 'N4');
  const n4 = loadCopy(MOD_REL, n4src);
  const n4a = n4.audit({ read: function () { return ''; }, files: ['index.js'], indexSrc: 'const LOAD_ORDER = [];' });
  A(n4a.scanAlive === false && n4a.ok === false,
    done('N4b 装载破坏副本 + 空扫描面 ⇒ ok 为假（恒真保护生效；原版上 scanAlive 为真）'
      + '—— 证明「0 问题」不会被空集伪装'));

  // ── N5 真源码破坏：账本漏扫不再补边 ⇒ 有 requires 却扫不到的边被静默丢掉 ──
  const n5src = breakOnce(S, ANCHORS.aSkip.txt, 'if (true) return;', 'N5');
  const n5 = loadCopy(MOD_REL, n5src);
  const n5a = n5.audit({ read: function (rel) { return rel === 'core/a.js' ? fakeProduct()['core/a.js'] : ''; },
    files: ['core/a.js'], indexSrc: "const LOAD_ORDER = ['core/a.js', 'core/b.js'];",
    runtime: { modules: { 'core/a.js': { requires: [], requiresFiles: [] },
      'core/b.js': { requires: ['alpha'], requiresFiles: ['core/a.js'] } } } });
  A(n5a.unreflected.length === 0 && n5a.edgesLoad === 0,
    done('N5b 装载破坏副本 ⇒ 账本里 b→a 的装载期边整条消失（漏扫补丁失效，实装载期边 '
      + n5a.edgesLoad + ' 条）—— 证明 A8 锁的「不许静默丢边」真在生效'));

  // ── N6 假锚点（v2.107.0 开发期占位串，从未落进模块）⇒ breakOnce 必抛 ──
  let threw = false;
  try { breakOnce(S, 'const fld = s.raw || s.field;', 'X', 'N6'); } catch (e) { threw = true; }
  A(threw, done('N6 破坏锚点不存在时 breakOnce 抛（不许静默通过）'
    + '—— 证明「破坏没发生也会报绿」这条假路径被堵死'));

  // ── N7 反向自证（H6）：原版上同款判据必须为真 ──
  const M = require('./module-cycle-gate.js');
  A(M.audit().aliasFiles === M.audit().files,
    done('N7 原版上别名覆盖率满格为真，破坏副本上塌陷（N1b）—— 两向自证成立'));
  A(M.audit().orderViolation.length === 0,
    done('N7b 原版上零次序违规为真，方向反转后报 ' + '20+' + ' 条（N3b）—— 两向自证成立'));

  // ── N8 破坏落点全部可核（不靠改真文件） ──
  A([n1src, n2src, n3src, n4src, n5src].every(function (x) { return x !== S; }) && n >= 6,
    done('N8 五处真源码破坏 + 一处「锚点不存在必抛」全部可核（本组共 ' + n + ' 项断言），'
      + '且全部是内存副本，真文件逐字未动'));
  A(rd(MOD_REL) === S, done('N8b 真文件在全部负控制跑完后逐字未变（负控制不得改真文件）'));
}

module.exports = { ANCHORS: ANCHORS, runAll: runAll, runNegative: runNegative };

if (require.main === module) {
  let P = 0, F = 0;
  const A = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  ✗ ' + m); } };
  try { runAll(A); } catch (e) { F += 1; console.log('  ✗ 异常：' + e.message); }
  try { runNegative(A); } catch (e) { F += 1; console.log('  ✗ 负控制异常：' + e.message); }
  console.log('MODULE-CYCLE-V2107: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
  process.exit(F === 0 ? 0 : 1);
}