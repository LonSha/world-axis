#!/usr/bin/env node
// WorldAxis tests/q1-load-integrity-v2211.js — v2.211.0(优化 Q1)专锁:
//   同版加载(CDN 回退源绑定不可变构建标识)+ 启动完整性闸门(关键模块缺席 ⇒ 停写)。
//
// ── 它治的两件事(都不是「做得对不对」,是「做完了能不能被证明」)──────────────
//   1 **同版容灾**:`index.js` 的回退源此前写死 `@main`,而那是一个**会走的引用**
//     (实测:本地 v2.210.0,远端 main 的 manifest 是 v2.181.0 —— 另一条历史线)。
//     「本地某个文件读不到就从 main 取同名文件」于是会把另一个版本的模块拼进当前运行时,
//     而混版**不报错**:每个模块各自自洽,只是彼此的约定不同。判据:回退源必须绑
//     40 位不可变构建标识,且**夹具不许抄第二份**(抄就必然与产品分叉,见下方 B 段)。
//   2 **启动完整性**:加载失败此前只是「记一条 error 日志 + 列个名字」,`init()` 照常往下走,
//     而写路径对「谁的代码在跑」一无所知 ⇒ `core/commit.js` 没装上的运行时里,每个引擎
//     的写调用只在**它自己**那层失败,彼此无关地各写一半。判据:关键模块缺席时**不产生候选**。
//
// ── 两处承重设计(判据必须打在这两条上,否则锁的是无关紧要的地方)────────────────
//   · **只挡写**:读 / 诊断 / 导出 / 恢复入口一律不受影响。把整台机器锁死会把一次局部故障
//     升级成「存档不可用」,而那比原始故障更坏。
//   · **三态不许压成两态**:装载面不在场(无头壳)= 闸门**不适用**、放行;
//     在场且失败表可读 = 按表判;在场而失败表不可读 = **不可知** ⇒ 收紧为「关键模块全缺」。
//     压成两态的方向两种都坏:把「不适用」当「未知」⇒ 本仓全部无头回归当场不可用(判据把自己的
//     测试环境判死);把「未知」当「不适用」⇒ 真实运行时里最该拦的那一档静默放行。
//
// ── 负控制口径(H6)────────────────────────────────────────────────────
//   每组都是**真源码破坏**:锚点取自产品源码、各恰中 1 次 → 在**内存副本**上重装重跑同款
//   真判据 → 原版上同判据必须仍为真(两向)。破坏一律不触碰磁盘,不写任何产品文件。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/q1-load-integrity-v2211.js';
const RUN_REL = 'tests/run.js';
const STORE_REL = 'core/store.js';
const INDEX_REL = 'index.js';

function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(read(rel)).digest('hex').slice(0, 16); }

/**
 * 关键模块表:**从产品源码提取**(单一真源),不在本锁里抄第二份当作输入面。
 *   `EXPECT_CRITICAL` 是**期望**(判据拿真源与期望比对),不是第二份真源 —— 本仓既有口径
 *   (synth-host 的 CORE_MODULES 同规格):期望写死是为了「表被悄悄改短」这件事能被看见。
 */
function criticalRels(src) {
  const s = typeof src === 'string' ? src : read(STORE_REL);
  const m = s.match(/const LOAD_CRITICAL = \[([\s\S]*?)\];/);
  if (!m) throw new Error('core/store.js 里找不到 LOAD_CRITICAL(唯一真源的前提不成立)');
  return vm.runInNewContext('[' + m[1] + ']');
}
const EXPECT_CRITICAL = ['core/clock.js', 'core/input-guard.js', 'core/settings-bus.js',
  'core/permissions.js', 'core/commit.js', 'core/interceptor.js'];

/**
 * 夹具段:run.js 里**从夹具开始向产品要真源的那一行**起切。
 *   起点为什么不是 `WA.loadScript = _ls.loadScript;`:首轮实测该切片起点在真正的取值行
 *   (`_idxSrc.match(/const BUILD_ID …`) **之后** 643 字符 —— 于是「夹具是不是在抄第二份真源」
 *   这条判据看不见取值行本身,只能看见一个已经成形的对象。判据的输入面必须包含它所要判的那件事。
 *   起点取「第一处 `_idxSrc.match(`」= 夹具第一次向产品源码要值;若产品把提取改成别的写法,
 *   该锚点消失 ⇒ 本函数抛 ⇒ A9 记红(而不是静默放过)。
 *   窗口 3000 字符:足够覆盖取值段 → loadScript 挂载 → 装载面状态声明(N5 也在这段里做破坏)。
 */
function fixtureSeg(src) {
  const i = src.indexOf('const _bidM = _idxSrc.match(');
  if (i < 0) throw new Error('tests/run.js 的「夹具从产品源码取真源」锚点不在(夹具与真源的关系变了?)');
  return { at: i, seg: src.slice(i, i + 3000) };
}

/**
 * 写链路**宿主件**清单:不在本锁判据里(故不进 LOAD_CRITICAL),但 store 的写路径会真的调它。
 *   为什么必须预装(`core/rand.js`):`store.save()` → `writerId()` → `WA.rand.id(...)`。
 *   首轮实测的现场:漏装它时 save() **在健康面上也返回 false**(reason `error`,内部 TypeError),
 *   于是 B4「save 这条兜底出口同样拦下」与 N3「摘掉 save 闸门 ⇒ 不再返回 false」两条判据
 *   落在同一个**恒假信号**上 —— 前者假绿(它拦下的其实是缺件,不是闸门),后者假红(摘了闸门也不放行)。
 *   这正是本仓 v2.84.0 立 synth-host 时要治的形态:**桩缺件被误读成产品缺陷**。
 *   按 index.js 的装载序,`core/rand.js` 紧随 `core/clock.js`(写链路一路在用),故此处对齐产品序。
 */
const HOST_WRITE_CHAIN = ['core/rand.js'];

function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    clear: function () { Object.keys(m).forEach(function (k) { delete m[k]; }); },
    key: function (i) { return Object.keys(m)[i] || null; },
    get length() { return Object.keys(m).length; },
    _dump: function () { return m; }
  };
}

/**
 * 独立无头装载面:只装「写入链路上的依赖面」+ store。
 *   刻意**不**装整个 LOAD(209 个模块):本锁判的正是「关键模块**缺席**时写侧会怎样」,
 *   故装载面必须能逐个摘掉关键模块 —— 装全量的夹具做不到这件事,而它一装就必然带上
 *   `index.js` 切片的 `loaderStatus`(那会让三态落进「不可知」,见 A9/B7)。
 *   宿主桩补齐入口侧提供的那两样(`log` / `mainWin`):它们由 `index.js` 提供,
 *   不在被测模块里 —— 缺件会让「桩缺件」被误读成「产品缺陷」(v2.84.0 立 synth-host 的同一条理由)。
 */
function harness(opts) {
  const o = opts || {};
  const ov = o.srcOverride || {};
  const skip = o.skip || [];
  const logs = [];
  const G = {};
  G.window = G; G.global = G; G.console = console;
  G.localStorage = fakeLS();
  G.document = { createElement: function () { return {}; }, addEventListener: function () {} };
  const ctx = vm.createContext(G);
  G.window.WorldAxis = { log: function (level, msg, err) { logs.push(level + ':' + msg + (err ? ' :: ' + (err && err.message) : '')); } };
  function run(rel) {
    vm.runInContext(ov[rel] !== undefined ? ov[rel] : read(rel), ctx, { filename: rel });
  }
  const host = o.host === undefined ? HOST_WRITE_CHAIN : o.host;
  host.forEach(run);
  criticalRels(ov[STORE_REL]).forEach(function (rel) { if (skip.indexOf(rel) < 0) run(rel); });
  run(STORE_REL);
  const WA = G.window.WorldAxis;
  WA.mainWin = G.window; WA.mainDoc = G.window.document;
  try { WA.store.init(); } catch (e) { /* init 失败不影响闸门判据(闸门只读失败表) */ }
  /**
   * `entryFace:true` = 制造「**入口面在场,但失败投影不可知**」这一态(B3 的判据对象)。
   *   为什么不能靠「设一个无效属性」:`loaderFailureRels()` 的在场判据是
   *   `typeof WA.loaderStatus === 'function' || Array.isArray(WA.__loadFailed)`;
   *   随便塞一个 `__loaderStateNeverProjected = true` 两条都不成立 ⇒ 实际落进「装载面不在场」,
   *   读数变成 `applicable:false`,B3 要验的「不可知 ⇒ 收紧」根本没有被制造出来(判据空转)。
   *   这里的 `loaderStatus()` 返回 `{ failedModules: null }`,对应 store 源码里那条**防御分支**
   *   (`st && Array.isArray(st.failedModules)` 不成立 ⇒ 落到 `rels: null`)。
   *   ⚠ 不是「产品常态」:index.js 的 loaderStatus 在 `__loaderState` 缺失时返回的是
   *   `failedModules: []`(空数组,读成「已知无失败」)。本条验的是**契约**:
   *   「入口在、数组读不出来」(读取抛错 / 被外部改写 / 返回非数组)时,闸门必须收紧而不是放行 ——
   *   「读不出来」与「没有失败」在这条判据上必须分得开。
   */
  if (o.entryFace) {
    WA.loaderStatus = function () { return { failedModules: null }; };
  }
  /** `entryFaceThrows:true` = 同一态的**另一形态**:入口口在,但读它本身抛错(被 catch 吞成不可知)。 */
  if (o.entryFaceThrows) {
    WA.loaderStatus = function () { throw new Error('loaderStatus unavailable'); };
  }
  WA.__probeLogs = logs;
  return WA;
}
/** 在内存副本上做定点破坏:锚点必须恰中 1 次(不唯一即抛 —— 破坏没落在热路径上,后面全是假绿)。 */
function over(rel, from, to) {
  const raw = read(rel);
  const hits = raw.split(from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点命中 ' + hits + ' 次(要求恰 1): ' + rel + ' :: ' + from.slice(0, 70));
  const o = {}; o[rel] = raw.split(from).join(to);
  return o;
}
function merge(a, b) { return Object.assign({}, a, b); }

// ── A 段:静态契约 ──────────────────────────────────────────────────────
function runAll(a) {
  const srcStore = read(STORE_REL), srcIdx = read(INDEX_REL), srcRun = read(RUN_REL);
  const shaBefore = { store: sha(STORE_REL), idx: sha(INDEX_REL), run: sha(RUN_REL) };

  // A1 关键模块表的唯一真源 + 期望比对(表被悄悄改短 ⇒ 这里先红)
  const crit = criticalRels(srcStore);
  a(JSON.stringify(crit) === JSON.stringify(EXPECT_CRITICAL),
    'q1: [A1] LOAD_CRITICAL 六项与期望逐字一致(实 ' + JSON.stringify(crit) + ')');
  a(crit.length === 6 && crit.every(function (r) { return r.indexOf('core/') === 0; }),
    'q1: [A1] 关键模块全部落在 core/(不含 engines —— 引擎缺席不该锁死整台机器)');
  // A2 三个判定口 + 两个只读读口在场(读口是给诊断/面板/专锁消费的,不是装饰)
  a(/function loaderFailureRels\(/.test(srcStore) && /function loadGap\(/.test(srcStore)
    && /function gateLoadIntegrity\(/.test(srcStore),
    'q1: [A2] 判定三件套(loaderFailureRels / loadGap / gateLoadIntegrity)在 store 里定义');
  a(/integrity\(\)\s*\{[\s\S]{0,400}?loadGap\(\)/.test(srcStore)
    && /writeGate\(\)\s*\{ return gateLoadIntegrity\(\); \}/.test(srcStore),
    'q1: [A2] 只读读口 integrity / writeGate 在位(诊断面不必自己重实现判定)');
  // A2b 反向:不得留「同一件事两个读口」的冗余导出 —— 本版首轮那个 `loadGateStat()`
  //   字段是 integrity() 的真子集,已被死子面冻结门禁按「产品与测试零引用」报红并删除;
  //   这里钉住「它不再回来」:再造一个只答「要不要挡」的读数口,两口径必然慢慢漂开。
  //   判据写法注意(H5 纯度):锚点必须是**定义形态**(行首四空格缩进的成员定义),
  //   不能是裸的 `loadGateStat(` —— 后者会被本段自己那句注释命中,判据当场恒假。
  a(!/^ {4}loadGateStat\(\)/m.test(srcStore),
    'q1: [A2b] 不留 loadGateStat 这类 integrity() 子集读口(一件事只留一个真源)');
  // A3 两条写出口都必须过闸门:transact 前置 + save 兜底(少一条就是「有一条路绕过了闸门」)
  a(/const loadDeny1 = gateLoadIntegrity\(\);/.test(srcStore) && /const loadDeny2 = gateLoadIntegrity\(\);/.test(srcStore),
    'q1: [A3] transact 与 save **两条**写出口各有一处闸门(不是只挡一条)');
  a(srcStore.indexOf("reason: 'load-integrity', rejected: 'load-integrity'") > 0
    && srcStore.indexOf("__saveStat.reason = 'load-integrity'") > 0,
    'q1: [A3] 拒收码 load-integrity 在两条出口上同名(同一个语义不许有两个码)');
  // A4 同版加载:40 位不可变构建标识 + 三条回退源全部绑它 + 无 @main
  const bidM = srcIdx.match(/const BUILD_ID = '([0-9a-f]{40})';/);
  a(!!bidM, 'q1: [A4] index.js 声明 40 位不可变构建标识 BUILD_ID');
  const cdnM = srcIdx.match(/const CDN_BASES = \[([\s\S]*?)\];/);
  a(!!cdnM && cdnM[1].indexOf('BUILD_ID') >= 0, 'q1: [A4] CDN_BASES 由 BUILD_ID 拼接(不是写死引用)');
  const bases = cdnM ? vm.runInNewContext('[' + cdnM[1].replace(/BUILD_ID/g, JSON.stringify(bidM[1])) + ']', {}) : [];
  a(bases.length === 3 && bases.every(function (u) { return u.indexOf('@' + bidM[1]) > 0; }),
    'q1: [A4] 三条回退基址绑定**同一**构建标识(同版容灾): ' + bases.join(' '));
  a(bases.every(function (u) { return u.indexOf('@main') < 0; }), 'q1: [A4] 回退基址不得引用可变分支 @main');
  // A5 入口只转出不重实现:三个转出口 + 恢复入口
  a(['loaderStatus', 'loaderIntegrity', 'writeGate', 'loadRetry'].every(function (n) {
    return srcIdx.indexOf('WA.' + n + ' = function') > 0;
  }), 'q1: [A5] 入口转出 loaderStatus / loaderIntegrity / writeGate / loadRetry 四个口');
  // A6 启动投影**必须在 store.init() 之前**:下一句就是 init(),它可能触发首次写路径
  const iProj = srcIdx.indexOf('WA.__loadFailed = failedList.map(');
  const iInit = srcIdx.indexOf('try { WA.store && WA.store.init && WA.store.init(); }');
  a(iProj > 0 && iInit > iProj, 'q1: [A6] 失败表投影发生在 store.init() 之前(投影行 ' + iProj + ' < init 行 ' + iInit + ')');
  a(/WA\.__loadFailed = failedList\.map\(function \(f\) \{ return f\.rel; \}\);/.test(srcIdx),
    'q1: [A6] 投影无条件写数组(空数组也是「已知」;「没失败就不写」会退化成不可知)');
  // A7 重试后必须重算投影:失败表变了而投影不更新 ⇒ store 读着旧表继续拒写且无一处能解释
  a(srcIdx.indexOf('WA.__loadFailed = Array.from(WA.__loaderState.failed.keys());') > 0,
    'q1: [A7] loadRetry 成功后从**失败表真源**重算投影');
  a(srcIdx.indexOf("return { ok: false, reason: 'not-failed'") > 0,
    'q1: [A7] loadRetry 对未登记的模块如实报 not-failed(不替用户「清一下表」)');
  // A8 闸门自身异常 ⇒ fail-open,但异常必须可观测(放行不得静默)
  a(/启动完整性闸门自身异常 ⇒ 本次放行\(fail-open/.test(srcStore), 'q1: [A8] 闸门自身异常按 fail-open 处理');
  a(srcStore.indexOf("WA.log('error', '启动完整性闸门自身异常") > 0,
    'q1: [A8] fail-open 同时记一笔 error(放行不得变成静默)');
  // A9 夹具不许抄第二份真源,且必须自己声明装载面状态(否则被闸门判成不可知)
  //   首轮实测修正:原判据写成 `/const BUILD_ID = '\(\[0-9a-f\]\{40\}\)'/` —— 这串转义在**正则**里
  //   要求源码出现 `const BUILD_ID = '\([0-9a-f]{40}\)'`,把夹具里那句 true-源码 `[0-9a-f]{40}`
  //   转义掉了,故恒假;而 `fixtureSeg` 的起点又在取值行之后 643 字符,连取值行都没覆盖到。
  //   两处一起改:段起点上移到取值行(见 fixtureSeg),判据改成**字面量包含**——
  //   判据要判的是「夹具有没有向产品源码取值」这件事本身,不是这句代码的某种书写风格。
  const fx = fixtureSeg(srcRun);
  //   `>= 0` 而不是 `> 0`:段的起点**就是**这一行 ⇒ 它在段内索引为 0,用 `> 0` 会恒假
  //   (本仓 `indexOf(...) > 0` 的写法到处在用,它隐含「被找的东西不在段首」这个前提;
  //    这里的前提恰好相反,故必须显式写成 `>= 0`,否则又是一条不辨真伪的判据)。
  a(fx.seg.indexOf("const _bidM = _idxSrc.match(/const BUILD_ID = '([0-9a-f]{40})';/);") >= 0,
    'q1: [A9] 夹具从 index.js 提取 BUILD_ID(不抄第二份;提取式与产品声明式同为 40 位十六进制)');
  a(fx.seg.indexOf('const _cdnM = _idxSrc.match(') > 0,
    'q1: [A9] 夹具的 CDN 基址同样从产品源码取(真源只有一份:改产品 ⇒ 夹具跟着变)');
  a(fx.seg.indexOf('jsdelivr.net/gh/') < 0,
    'q1: [A9] 夹具里不得出现硬编码 CDN 地址(产品改了它照样绿 = 判据与真源脱钩)');
  a(/WA\.__loadFailed = \[\];/.test(fx.seg),
    'q1: [A9] 夹具如实声明装载面状态(空数组 = 已知且无失败)——否则三态落进不可知、写路径被锁死');
  // A10 接入 run.js:**正 / 负各恰 1 处**(与 reject-recovery-lock-v2192 / beat-facade-lock-v2193 同规)。
  //   为什么必须是这个形状:只创建在磁盘上而不挂进回归 ⇒ 它是「躺在磁盘上的文件」,
  //   由 tests/test-surface-gate.js 判为 orphan;挂两遍 ⇒ 同一套判据跑两次,
  //   计数类判据(B10/N 段)会在第二次上得到不同读数而不知原因。
  //   为什么负向也非挂不可:本锁的 N 段是**真源码破坏 + 两向自证**,
  //   它证明「上面那些判据不是恒真」;不挂它,能证明的只有「当前产品是这个样子」。
  const q1Fwd = "runLock('./q1-load-integrity-v2211.js')";
  const q1Neg = "runLock('./q1-load-integrity-v2211.js', 'runNegative')";
  const nFwd = srcRun.split(q1Fwd).length - 1;
  const nNeg = srcRun.split(q1Neg).length - 1;
  a(nFwd === 1 && nNeg === 1,
    'q1: [A10] 本锁在 run.js 里正 / 负向各恰挂 1 处(实 正 ' + nFwd + ' / 负 ' + nNeg + ')');

  // ── B 段:运行时(真跑闸门)──────────────────────────────────────────
  // B1 装载面不在场 ⇒ **不适用**、放行(判据不得把自己的测试环境判死)
  const h1 = harness({});
  const ig1 = h1.store.integrity();
  a(ig1.applicable === false && ig1.armed === false && ig1.ok === true,
    'q1: [B1] 装载面不在场 ⇒ 闸门不适用且放行(applicable ' + ig1.applicable + ' / armed ' + ig1.armed + ')');
  a(h1.store.transact(function (d) { d.__b1 = 1; return true; }).ok === true, 'q1: [B1] 不适用时写路径照常');
  // B2 在场 + 失败表可读(空数组)⇒ 放行
  const h2 = harness({});
  h2.__loadFailed = [];
  a(h2.store.integrity().known === true && h2.store.writeGate() === null,
    'q1: [B2] 已知且无失败 ⇒ 放行(known ' + h2.store.integrity().known + ')');
  // B3 在场 + 投影不可读 ⇒ **不可知** ⇒ 收紧为「关键模块全缺」并拒写
  //   首轮实测修正:原来只写了 `h3.__loaderStateNeverProjected = true` —— 一个产品根本不看的属性。
  //   `loaderFailureRels()` 的在场判据是 `typeof WA.loaderStatus === 'function'
  //   || Array.isArray(WA.__loadFailed)`,那个属性两条都不成立 ⇒ 实际落进「装载面不在场」,
  //   读数 `applicable:false`,于是本条恒假(判据空转,不是产品缺陷)。
  //   现在用 harness 的 `entryFace` 真造出那一态:入口口在、数组读不出来。
  const h3 = harness({ entryFace: true });
  const i3 = h3.store.integrity();
  a(i3.applicable === true && i3.known === false && i3.missing.length === 6 && i3.armed === true,
    'q1: [B3] 入口在场但失败投影不可读 ⇒ 判**不可知**并收紧为「六个关键模块全缺」(实 applicable '
      + i3.applicable + ' / known ' + i3.known + ' / missing ' + i3.missing.length + ')');
  a((h3.store.writeGate() || {}).reason === 'load-integrity'
    && h3.store.transact(function (d) { d.__b3 = 1; return true; }).ok === false,
    'q1: [B3] 不可知态**必须拒写**(「读不出来」不得被当成「没有失败」)');
  a(h3.store.read('clock.label') !== undefined || typeof h3.store.loadStat() === 'object',
    'q1: [B3] 不可知态下读侧照常(收紧的是写侧,不是整台机器)');
  // B3b 同一态的第二种形态:`loaderStatus` 本身抛错(被 catch 吞成不可知)⇒ 同样收紧
  const h3b = harness({ entryFaceThrows: true });
  const i3b = h3b.store.integrity();
  a(i3b.applicable === true && i3b.known === false && i3b.missing.length === 6
    && h3b.store.transact(function (d) { d.__b3b = 1; return true; }).ok === false,
    'q1: [B3] 入口口读它**自身抛错** ⇒ 同样归入不可知并拒写(异常不得被降级成放行)');
  // B4 关键模块缺席 ⇒ 拒写、**内存与磁盘都不变**、save 也拦
  const h4 = harness({});
  h4.__loadFailed = [];
  h4.store.transact(function (d) { d.__seed = 1; return true; });
  h4.store.save();
  const diskBefore = JSON.stringify(h4.mainWin.localStorage._dump());
  const memBefore = JSON.stringify(h4.store.get());
  h4.__loadFailed = ['core/commit.js'];
  const rDeny = h4.store.transact(function (d) { d.__denied = 1; return true; });
  a(rDeny.ok === false && rDeny.reason === 'load-integrity' && rDeny.rejected === 'load-integrity'
    && rDeny.applied === false && rDeny.persisted === false,
    'q1: [B4] 缺关键模块 ⇒ 拒收体齐(reason ' + rDeny.reason + ' / rejected ' + rDeny.rejected + ')');
  a(JSON.stringify(h4.store.get()) === memBefore && JSON.stringify(h4.mainWin.localStorage._dump()) === diskBefore,
    'q1: [B4] 拒收**不产生候选**:内存与磁盘逐字不变(拒收不是半写)');
  a(h4.store.save() === false, 'q1: [B4] save 这条兜底出口同样拦下(返回值 false,不抛)');
  //   ⚠ 首轮实测的假绿:漏装写链路宿主件(`core/rand.js`)时 save() **在健康面上也返回 false**
  //   (内部 TypeError ⇒ reason:'error'),于是「save === false」这条不辨闸门与缺件,恒真。
  //   修法是给 save 的拒收加一条**归因**判据:reason 必须是 load-integrity,
  //   且与健康面上的同款调用**必须不同**(下面这条对照把恒真信号拆开)。
  a(h4.store.saveStat().reason === 'load-integrity',
    'q1: [B4] save 是被**闸门**拦下的(reason 实为 ' + JSON.stringify(h4.store.saveStat().reason)
      + ' —— 缺件/异常会记成 error,那与闸门拦下不是一回事)');
  const h4h = harness({}); h4h.__loadFailed = [];
  const healthySave = h4h.store.save();
  a(healthySave === true && h4h.store.saveStat().reason === null,
    'q1: [B4] (对照)同一套 harness 在**健康面上**save 真的能成功(实 ' + JSON.stringify(healthySave)
      + ' / reason ' + JSON.stringify(h4h.store.saveStat().reason)
      + ')—— 否则上面那条 false 证明不了任何事');
  a(String(JSON.stringify(h4.store.get())) .indexOf('__denied') < 0, 'q1: [B4] 被拒的那笔确实没落进内存');
  // B5 六个关键模块**逐个**都要拦(不是只拦 commit 一个 —— 那会把「依赖面」写成「某一个文件」)
  const perRel = EXPECT_CRITICAL.filter(function (rel) {
    const h = harness({});
    h.__loadFailed = [rel];
    return h.store.transact(function (d) { d.__x = 1; return true; }).ok === false;
  });
  a(perRel.length === EXPECT_CRITICAL.length,
    'q1: [B5] 六个关键模块逐个都拦得住(实 ' + perRel.length + '/6;漏: '
      + JSON.stringify(EXPECT_CRITICAL.filter(function (r) { return perRel.indexOf(r) < 0; })) + ')');
  // B6 非关键模块(引擎/渲染面)缺席 ⇒ **不锁写**(引擎缺席是「某块玩法没起」,读侧照常)
  const h6 = harness({});
  h6.__loadFailed = ['engines/gauge.js', 'engines/world.js', 'render/inject.js'];
  a(h6.store.writeGate() === null && h6.store.transact(function (d) { d.__b6 = 1; return true; }).ok === true,
    'q1: [B6] 只有引擎/渲染面缺席 ⇒ 放行(不把一次局部故障升级成「存档不可用」)');
  // B7 恢复:把文件补上、失败表清空 ⇒ 闸门重开(恢复入口的语义由入口的 loadRetry 承担,这里判闸门侧)
  const h7 = harness({});
  h7.__loadFailed = ['core/interceptor.js'];
  const denied7 = h7.store.transact(function (d) { d.__b7 = 1; return true; }).ok;
  h7.__loadFailed = [];
  const ok7 = h7.store.transact(function (d) { d.__b7 = 1; return true; }).ok;
  a(denied7 === false && ok7 === true, 'q1: [B7] 缺 ⇒ 拒、补上 ⇒ 放行(denied ' + denied7 + ' / recovered ' + ok7 + ')');
  // B8 关闭态下**读 / 诊断 / 导出**一律仍可用(只挡写,不挡看)
  const h8 = harness({});
  h8.store.transact(function (d) { d.clock.label = '第1日·黄昏'; return true; });
  h8.__loadFailed = ['core/commit.js'];
  const reads = {};
  try { reads.read = h8.store.read('clock.label') === '第1日·黄昏'; } catch (e) { reads.read = false; }
  try { reads.loadStat = Object.keys(h8.store.loadStat()).length > 0; } catch (e) { reads.loadStat = false; }
  try { reads.sizeProfile = !!h8.store.sizeProfile(3); } catch (e) { reads.sizeProfile = false; }
  try { reads.integrity = h8.store.integrity().armed === true; } catch (e) { reads.integrity = false; }
  a(reads.read && reads.loadStat && reads.sizeProfile && reads.integrity,
    'q1: [B8] 关闭态下读/诊断/完整性读数照常可用(实 ' + JSON.stringify(reads) + ')');
  // B9 fail-open:闸门**自身**异常 ⇒ 放行,且异常有日志(不静默)
  const h9 = harness({});
  h9.__loadFailed = [];
  try {
    Object.defineProperty(h9, '__loadFailed', { configurable: true, get: function () { throw new Error('hostile getter'); } });
  } catch (e) {}
  let wg9 = null, threw9 = false, ok9 = null;
  try { wg9 = h9.store.writeGate(); ok9 = h9.store.transact(function (d) { d.__b9 = 1; return true; }).ok; }
  catch (e2) { threw9 = true; }
  a(threw9 === false && wg9 === null && ok9 === true,
    'q1: [B9] 闸门自身异常 ⇒ fail-open 且可写(wg ' + JSON.stringify(wg9) + ' / threw ' + threw9 + ')');
  a(h9.__probeLogs.some(function (l) { return l.indexOf('启动完整性闸门自身异常') > 0; }),
    'q1: [B9] fail-open 留下 error 日志(放行不是静默): ' + JSON.stringify(h9.__probeLogs.slice(-2)));
  // B10 反空转:上面这些判据在**空集**上不得恒真 —— 闸门读数必须真的随失败表变
  const hA = harness({}); hA.__loadFailed = [];
  const hB = harness({}); hB.__loadFailed = ['core/clock.js'];
  a(hA.store.integrity().missing.length === 0 && hB.store.integrity().missing.length === 1
    && hA.store.integrity().armed !== hB.store.integrity().armed,
    'q1: [B10] 读数随失败表真的变(0 缺 vs 1 缺,armed 不同)—— 判据不是恒真');

  // ── C 段:只读不变式 ────────────────────────────────────────────────
  const hC = harness({}); hC.__loadFailed = [];
  const r1 = JSON.stringify(hC.store.integrity());
  hC.store.integrity(); hC.store.writeGate();
  const r2 = JSON.stringify(hC.store.integrity());
  a(r1 === r2, 'q1: [C1] 连调不变量:多次取证读数逐字相同(取证不得改变被取证对象)');
  const hD = harness({}); hD.__loadFailed = ['core/commit.js'];
  const memD = JSON.stringify(hD.store.get());
  for (let i = 0; i < 10; i++) hD.store.transact(function (d) { d['__c3_' + i] = 1; return true; });
  a(JSON.stringify(hD.store.get()) === memD, 'q1: [C3] 连续 10 次拒收后内存零变化(拒收不半写)');
  a(sha(STORE_REL) === shaBefore.store && sha(INDEX_REL) === shaBefore.idx && sha(RUN_REL) === shaBefore.run,
    'q1: [C2] 本段跑完产品源码与夹具逐字节未动(sha 不变)');
}

// ── N 段:真源码破坏 + 两向自证(全部在内存副本上)──────────────────────
function runNegative(a) {
  const shaBefore = { store: sha(STORE_REL), idx: sha(INDEX_REL), run: sha(RUN_REL) };
  const rawStore = read(STORE_REL), rawIdx = read(INDEX_REL), rawRun = read(RUN_REL);

  // N1 摘掉关键表里的一项 ⇒ 「逐个都拦得住」的判据必须在副本上**失效**
  const ovN1 = over(STORE_REL, "'core/permissions.js', 'core/commit.js', 'core/interceptor.js'",
    "'core/permissions.js', 'core/interceptor.js'");
  a(criticalRels(ovN1[STORE_REL]).length === 5 && criticalRels(rawStore).length === 6,
    'q1: [N1] 锚点恰中 1 次且真改了表(副本 5 项 vs 原版 6 项)');
  const hN1 = harness({ srcOverride: ovN1 });
  hN1.__loadFailed = ['core/commit.js'];
  const n1Ok = hN1.store.transact(function (d) { d.__n1 = 1; return true; }).ok;
  a(n1Ok === true, 'q1: [N1] 表里没有 commit 时,缺 commit 不再拦(实 ok=' + n1Ok + ')—— B4/B5 真在看那张表');
  const hN1b = harness({});
  hN1b.__loadFailed = ['core/commit.js'];
  a(hN1b.store.transact(function (d) { d.__n1b = 1; return true; }).ok === false,
    'q1: [N1] (两向)原版上同款判据仍为真:缺 commit 必拦');

  // N2 摘掉 transact 里的闸门调用 ⇒ 关闭态下 transact 必须**放行**(证明它不是恒真拒绝)
  const ovN2 = over(STORE_REL, '      const loadDeny1 = gateLoadIntegrity();\n      if (loadDeny1) {',
    '      const loadDeny1 = null;\n      if (loadDeny1) {');
  const hN2 = harness({ srcOverride: ovN2 });
  hN2.__loadFailed = ['core/commit.js'];
  const n2Ok = hN2.store.transact(function (d) { d.__n2 = 1; return true; }).ok;
  a(n2Ok === true, 'q1: [N2] 摘掉 transact 的闸门 ⇒ 关闭态也放行(实 ok=' + n2Ok + ')—— 拦下写的正是那一处');
  a(hN2.store.save() === false, 'q1: [N2] (两向)摘下 transact 那一处后,save 兜底**仍在**(两处出口各司其职)');

  // N3 摘掉 save 里的闸门 ⇒ save 在关闭态不再拦(而 transact 仍拦)
  //   首轮实测修正:原判据 `n3Save !== false` 在**漏装写链路宿主件**时恒假(save 因内部 TypeError
  //   返回 false,与闸门无关)。补上 `core/rand.js` 后,这里还必须把**归因**一并锁住 ——
  //   否则「值不是 false」仍可能被别的失败路径满足。两条一起判:返回值真放行 + reason 不再是闸门码。
  const ovN3 = over(STORE_REL, '        const loadDeny2 = gateLoadIntegrity();\n        if (loadDeny2) {',
    '        const loadDeny2 = null;\n        if (loadDeny2) {');
  const hN3 = harness({ srcOverride: ovN3 });
  hN3.__loadFailed = ['core/commit.js'];
  const n3Save = hN3.store.save();
  a(n3Save !== false && hN3.store.saveStat().reason !== 'load-integrity',
    'q1: [N3] 摘掉 save 的闸门 ⇒ save 不再返回 false(实 ' + JSON.stringify(n3Save)
      + ' / reason ' + JSON.stringify(hN3.store.saveStat().reason) + ')');
  a(hN3.store.transact(function (d) { d.__n3 = 1; return true; }).ok === false,
    'q1: [N3] (两向)transact 那一处不受影响,仍拦(两处不是同一处)');

  // N4 BUILD_ID 被换成可变分支 ⇒ 同版加载判据必须现形(锚点动态构造,不写死某个提交)
  const bidAnchor = rawIdx.match(/const BUILD_ID = '[^']*';/);
  a(!!bidAnchor, 'q1: [N4] 能定位到 BUILD_ID 声明行(动态锚点)');
  const idxBroken = rawIdx.replace(bidAnchor[0], "const BUILD_ID = 'main';");
  const bidBroken = idxBroken.match(/const BUILD_ID = '([0-9a-f]{40})';/);
  a(bidBroken === null, 'q1: [N4] 破坏版失去 40 位构建标识(判据输入确实变了)');
  a(/const BUILD_ID = '([0-9a-f]{40})';/.test(rawIdx) === true, 'q1: [N4] (两向)原版同判据仍真');

  // N5 夹具不再声明装载面状态 ⇒ 夹具侧判据必须现形(且原版仍真)
  const fxA = fixtureSeg(rawRun);
  const fxAbs = fxA.at + fxA.seg.indexOf('WA.__loadFailed = [];');
  const runBroken = rawRun.slice(0, fxAbs) + '/* 破坏:夹具不再声明装载面状态 */'
    + rawRun.slice(fxAbs + 'WA.__loadFailed = [];'.length);
  a(/WA\.__loadFailed = \[\];/.test(fxA.seg) === true,
    'q1: [N5] (两向)原版夹具段里确有那条声明');
  a(/WA\.__loadFailed = \[\];/.test(fixtureSeg(runBroken).seg) === false,
    'q1: [N5] 破坏版夹具段里那条声明消失(A9 判据的输入面确实变了)');

  // N6 无副作用:整段破坏全在内存里,磁盘逐字节未动
  a(sha(STORE_REL) === shaBefore.store && sha(INDEX_REL) === shaBefore.idx && sha(RUN_REL) === shaBefore.run,
    'q1: [N6] 负控制段跑完三个文件 sha 不变(破坏从不落盘)');
  a(fs.readdirSync(path.join(BASE, 'tests')).filter(function (f) { return f.indexOf('.bak') >= 0; }).length === 0,
    'q1: [N6] 不留 .bak 之类的临时产物');

  // N7 宿主件两向自证:摘掉写链路宿主件 ⇒ 健康面上的 save **必须**失败(带 error 归因)
  //   这条是 B4「对照」与「归因」两条判据的反面证据。没有它的话,「save 成功」这条对照
  //   可能在宿主件根本不在场时也成立(例如 save 走了别的早退分支)—— 那就又是一次空转。
  const hN7 = harness({ host: [] });
  hN7.__loadFailed = [];
  const n7Save = hN7.store.save();
  a(n7Save === false && hN7.store.saveStat().reason === 'error',
    'q1: [N7] 摘掉 core/rand.js ⇒ 健康面 save 也失败且归因 error(实 ' + JSON.stringify(n7Save)
      + ' / ' + JSON.stringify(hN7.store.saveStat().reason) + ')—— 证明 B4 的两条判据真在看宿主件');
  a(harness({}).store.save() === true,
    'q1: [N7] (两向)把 core/rand.js 装回去,同款调用即成功(不是「save 永远 false」)');

  // N8 冗余读口判据两向自证(对应 A2b):在**内存副本**上把 loadGateStat 定义注回去
  //   ⇒ 同款判据必须翻假。没有这条,A2b 可能是「本来就没有这个词」的空真:
  //   判据看不见「它回不回来」,只看得到「当下有没有」。
  const redunRaw = read(STORE_REL);
  const redunAnchor = '    /** v2.211.0(优化 Q1):闸门本体转出';
  a((redunRaw.split(redunAnchor).length - 1) === 1,
    'q1: [N8] 注回锚点恰中 1 次(不唯一即抛 —— 破坏没落在目标位置,后面全是假绿)');
  const redunBroken = redunRaw.split(redunAnchor).join(
    '    loadGateStat() {\n      const g = loadGap();\n'
    + '      return { applicable: g.applicable, known: g.known, armed: g.applicable && g.missing.length > 0 };\n'
    + '    },\n' + redunAnchor);
  a(/^ {4}loadGateStat\(\)/m.test(redunBroken) === true && /^ {4}loadGateStat\(\)/m.test(redunRaw) === false,
    'q1: [N8] (两向)破坏副本上同判据翻假、原版上仍真'
      + '(红口回来 ⇒ A2b 现形;这是 A2b 非恒真的唯一证据)');
}

const lockAssert = require('./lock-assert.js');
module.exports = { runAll: lockAssert.restoring(runAll), runNegative: lockAssert.restoring(runNegative) };

// CLI:可独立跑(与本仓门禁同规格:命令行 / require / 自证三件齐)
if (require.main === module) {
  let pass = 0, fail = 0; const failures = [];
  const assert = function (cond, msg) {
    if (cond) { pass++; return; }
    fail++; failures.push(msg);
    console.log('  ✗ ' + msg);
  };
  console.log('■ q1-load-integrity-v2211(优化 Q1 专锁)');
  lockAssert.restoring(runAll)(assert);
  lockAssert.restoring(runNegative)(assert);
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
  console.log('全部通过 ✓');
}