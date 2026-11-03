'use strict';
/**
 * WorldAxis tests/v7-driver-ledger-2275.js (v2.275.0 · V7/OPV7-5) — 驱动者登记表专锁
 *
 * ══ 锁什么 ═══════════════════════════════════════════════════════════════
 * V7 立项的靶子是「109 个带 buildBlock 的引擎里，开关开着、三条产品面却没人喂它」。
 * 本锁锁的是**这一栏读数凭什么可信**，而不是它此刻读出几个：
 *
 *   A 静态契约：四条自证面的判据在源码里各自唯一；导出面只有 6 口；
 *     台账不改任何引擎的 enabled、不写 store、不落盘。
 *   B 分层契约：**每条面各有一个「只有它命中」的对照引擎**，判据不许恒真；
 *     裁决顺序（链 > 路由 > 面板 > 互调 > 未判定 > 只诊断 > 没人碰）逐条走一遍。
 *   C 两条「读不到不许写成没有」的硬纪律：
 *       C1 预取不完整 ⇒ L3a + L3b **必须为 0**（全进未判定）；
 *       C2 运行期口径（只有函数体）⇒ 同样 **L3a + L3b 必须为 0**。
 *     这两条是本锁的主诉求：把「没扫到」说成「没人喂」，正是 V7 立项现场
 *     （healthPreflight 报 passed=3 而引擎不出内容）的放大版。
 *   D 计数契约：`blindOrphanCount` / `diagOnlyOrphanCount` 必须是**真实条数**，
 *     不是清单截断后的长度（`maxList=10` 时清单 10 条、计数仍须 33）。
 *   E 同源契约：扫描面与互调图必须同源 —— 先跑完整预取、再退回运行期，
 *     L2e 必须归零（拿「扫描面 A」的边解释「扫描面 B」的结论 = 读数不可复现）。
 *   F 缓存契约：缓存必须自带签名（预取变多要重扫），且**导出面无 invalidate**
 *     ——「靠外部记得调来失效」的缓存，产品侧零调用点就是永不失效。
 *
 * ══ 负控制（先跑成红是纪律）═══════════════════════════════════════════════
 *   N0 两向自证：同一判据在「原版源码」上必须为真、在「破坏副本」上必须现形
 *      （不是恒真）。每个破坏都走「真源码锚点恰中 1 次 → 加载破坏副本 →
 *      在副本上重跑同款断言」，不用手写模拟常量。
 *   N1 破坏「未判定闸」⇒ 预取不完整时冒出 L3b（把读不到写成没有）。
 *   N2 破坏「运行期清图」⇒ 从预取退回运行期后 L2e 不归零（面与图不同源）。
 *   N3 破坏「可达性扩散范围」⇒ ui/ 面板的调用被当互调边（面板自证面被重复计一次）。
 *   N4 破坏「自己文件调自己」跳过 ⇒ 引擎内部互调被当成外部驱动者。
 *   N5 破坏「缓存签名」⇒ 预取从 40 涨到全量，读数仍停在不完整（永不重扫）。
 *   N6 破坏「计数字段」⇒ 计数退化成清单截断长度（把上限当真实条数）。
 *
 * ══ 为什么自带私有 vm 宿主、不 require 真引擎 ═══════════════════════════════
 *   本锁的每条判据都要**换一套扫描面**（static / prefetch 完整 / prefetch 残缺 /
 *   runtime）跑同一段产品代码，且破坏副本要换掉引擎源码本身。若用 require，
 *   引擎会把宿主钉在 `require.cache` 与全局 `WorldAxis` 上：换面就只能靠删缓存重装，
 *   而删全局又会污染同进程的其它锁（本仓点名的「靠顺序活着」）。
 *   故这里每次都在**新建的 vm 上下文**里装载「mock + LOAD_ORDER 全量模块」，
 *   引擎读到的 `window.WorldAxis` 是这一份私有的，跑完即丢。
 *   ⚠ 不做「加载时装配 + 运行时比对」的折中：那等于让本锁的结论取决于
 *     「谁在什么时候 require 过它」，而本仓已经为此付过两次价（v2.250 / v2.257）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
const SELF_REL = 'tests/v7-driver-ledger-2275.js';
const ENG_REL = 'engines/driver-ledger.js';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

// 装载清单的真源只有一处：index.js / tests/run.js 的 LOAD_ORDER（两处必须同序）。
const LOAD = vm.runInNewContext(
  '[' + (rd('tests/run.js').match(/const LOAD = \[([\s\S]*?)\];/)[1]) + ']');

/** 破坏锚点：每条都要在真源码里恰中 1 次（A1 会核），且破坏后语法必须完整。 */
const ANCHOR = {
  // ① 「没命中已读面」必须先进未判定，才轮到诊断面/无人碰两档
  undeterminedGate: "else if (!canConclude) { layer = 'L?'; driver = 'undetermined'; }",
  // ② 运行期拿不到源码 ⇒ 互调图必须清空（面与图同源）
  runtimeClearGraph: "    __graph = null;\n    let names = [];",
  // ③ 互调扩散只从 engines/ 与 core/ 出发（render/ 的 buildBlock 是渲染读，不是喂食）
  // v2.294.0（V8 OPV8-4）：reachSet 多了两段播种（宿主入口 / actionDesk 本体），
  //   锚点取「目录过滤」这一行 —— 它仍是「扩散范围」的唯一开关，破坏它 = 放开范围。
  reachScope: "return r.indexOf('engines/') === 0 || r.indexOf('core/') === 0;",
  // ④ 同一个文件里调自己的命名空间不算外部驱动
  selfCallSkip: "if (verbatim.defs.indexOf(dst) >= 0) continue;   // 自己文件调自己",
  // ⑤ 缓存自带签名（扫描面一变就重扫）
  cacheSig: 'if (__scan && __scanSig === sig) return __scan;',
  // ⑥ 清单可截断，但计数必须是真实条数
  blindCount: 'diagOnlyOrphanCount: b.diagOnlyOrphans.length,\n      blindOrphans: b.blindOrphans.slice(0, maxList),\n      blindOrphanCount: b.blindOrphans.length,',
  // ⑦ 诊断面按文件认（静态面）；运行期另按命名空间认（DIAG_NS）
  diagFace: "return READ_FACES[rel] ? 'diag' : 'other';",
  // ⑧ 互调档排在面板之后、未判定之前
  // v2.294.0（V8 OPV8-4）：L2e 判据同时认 'call' 与 'entry'（入口边同样是驱动）。
  //   锚点必须与产品源码逐字一致，否则 N7 会在「锚点不是恰 1 次」上抛出原因不对的红。
  l2eGate: "else if (reached[ns] === 'call' || reached[ns] === 'entry') { layer = 'L2e'; driver = 'engine'; }",
  // ⑨ 面板档的字面判据（用作两向自证的「正面」那一向）
  panelGate: "else if (panelM.length) { layer = 'L2p'; driver = 'panel'; }",
  // ⑩ 三个下界面合并时 diag 桶不许漏
  mergeDiag: "['diag', 'panel', 'other'].forEach(",
  // ⑪ hint 必须把专属成员念在前面（通用口径词排后）
  hintPanel: 'const ps = byPriority(r.panelMembers);',
  // ⑫ 导出面收口在 6 口（summaryText/stat 是末两口）
  exportFace: '    summaryText: summaryText,\n    stat: statView'
};

/** 破坏方式：把锚点替换成「同语法、错语义」的串。每条都写清破坏后应当现形什么。 */
const BREAK = {
  undeterminedGate: "else if (!canConclude && false) { layer = 'L?'; driver = 'undetermined'; }",
  runtimeClearGraph: "    __graph = __graph;\n    let names = [];",
  reachScope: 'return true;',
  selfCallSkip: 'if (false) continue;   // 自己文件调自己',
  cacheSig: 'if (__scan) return __scan;',
  blindCount: 'diagOnlyOrphanCount: b.diagOnlyOrphans.slice(0, 2).length,\n      blindOrphans: b.blindOrphans.slice(0, 10),\n      blindOrphanCount: b.blindOrphans.slice(0, 10).length,',
  diagFace: "return 'other';",
  l2eGate: "else if ((reached[ns] === 'call' || reached[ns] === 'entry') && false) { layer = 'L2e'; driver = 'engine'; }",
  panelGate: 'else if (panelM.length && false) { layer = \'L2p\'; driver = \'panel\'; }',
  mergeDiag: "['panel', 'other'].forEach(",
  hintPanel: 'const ps = r.panelMembers;',
  exportFace: '    summaryText: summaryText'
};

// ── 宿主装配 ────────────────────────────────────────────────────────────────
//   每个 case 都新建一个 vm 上下文：装 mock（localStorage / 定时器等宿主面）+
//   按 LOAD_ORDER 装全量产品模块。eng 参数可换成破坏副本（只替 driver-ledger 一支）。
function boot(engSrc) {
  const sb = {
    console: { log: function () {}, warn: function () {}, error: function () {} },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    setInterval: setInterval, clearInterval: clearInterval,
    JSON: JSON, Math: Math, Date: Date, Promise: Promise
  };
  sb.window = sb;
  sb.globalThis = sb;
  // mock.js 自己是用 `global.localStorage = {...}` 建宿主面的（它是 Node 脚本，
  //   不是模块），沙箱里没有 global 时 mock 直接抛「global is not defined」，
  //   而那个异常被下面的 try 吞掉了 —— 后果是 localStorage 压根没建起来，
  //   settingsBus 的落盘静默失败：`setSettings({maxList:10})` 返回 ok 但读回仍是 200。
  //   实测症状就是 D1a（清单没按 10 截断）与 F4a（关了读不回）两条假红。
  //   故 global 必须与 window 指向同一份沙箱。
  sb.global = sb;
  vm.createContext(sb);
  try { vm.runInContext(rd('tests/mock.js'), sb, { filename: 'tests/mock.js' }); } catch (e) {}
  const fail = [];
  let sawEng = false;
  for (let i = 0; i < LOAD.length; i++) {
    const rel = LOAD[i];
    let src = null;
    // engSrc 为 falsy ⇒ 用磁盘上的原版；给了串 ⇒ 只替 driver-ledger 这一支（破坏副本）。
    try {
      src = (rel === ENG_REL && typeof engSrc === 'string') ? engSrc : rd(rel);
    } catch (e) { continue; }
    if (src == null) continue;
    if (rel === ENG_REL) sawEng = true;
    try { vm.runInContext(src, sb, { filename: rel }); } catch (e) { fail.push(rel + ': ' + e.message); }
  }
  // 装载清单里没有 driver-ledger ⇒ 后面的判据全在空对象上恒真，必须自己报出来
  if (!sawEng) fail.push('LOAD_ORDER 里没有 ' + ENG_REL);
  return { host: sb, WA: sb.WorldAxis || {}, fail: fail };
}

/** 预取面装配：把 n 个产品源文件塞进 WA.__prefetch / __loadOrder（模拟真机主场景）。 */
function setPrefetch(WA, n) {
  const PROD_DIRS = ['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat', 'design'];
  const all = [];
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (let i = 0; i < ents.length; i++) {
      const rel = dir + '/' + ents[i].name;
      if (ents[i].isDirectory()) walk(rel);
      else if (ents[i].name.endsWith('.js')) all.push(rel);
    }
  })('ui');
  for (let d = 0; d < PROD_DIRS.length; d++) {
    if (PROD_DIRS[d] === 'ui') continue;
    (function walk(dir) {
      let ents = [];
      try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
      for (let i = 0; i < ents.length; i++) {
        const rel = dir + '/' + ents[i].name;
        if (ents[i].isDirectory()) walk(rel);
        else if (ents[i].name.endsWith('.js')) all.push(rel);
      }
    })(PROD_DIRS[d]);
  }
  all.push('index.js');
  const take = (n == null) ? all.length : Math.min(n, all.length);
  const pf = new Map();
  for (let i = 0; i < take; i++) {
    let t = '';
    try { t = rd(all[i]); } catch (e) { continue; }
    if (t && t.length >= 16) pf.set(all[i], t);
  }
  WA.baseUrl = '';
  WA.__prefetch = pf;
  WA.__loadOrder = all.slice();
  return { declared: all.length, prefetched: pf.size };
}

/** 预取面 + 静态面都关掉 ⇒ 只剩运行期口径。 */
function setRuntimeOnly(WA) {
  try { delete WA.__prefetch; } catch (e) {}
  try { delete WA.__loadOrder; } catch (e) {}
}

// ══ A 静态契约 ══════════════════════════════════════════════════════════════
function secA(a, Ec) {
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(Ec, ANCHOR[k]);
    a(c === 1, 'v2275/A1: 锚点 ' + k + ' 在 ' + ENG_REL + ' 里恰中 1 次（实 ' + c + '）');
  });
  // 破坏串必须真的改了源码（否则 N 段「加载破坏副本仍绿」无法解释）
  const same = Object.keys(BREAK).filter(function (k) { return BREAK[k] === ANCHOR[k]; });
  a(same.length === 0, 'v2275/A1b: 每个破坏串都与原锚点不同（未改动：' + j(same) + '）');
  // 破坏串在 SELF 里出现次数不做限制（本文件就是破坏表的宿主），
  //   但**锚点字面量**只准在 ANCHOR 里声明一次（H5 判据纯度）。
  const UNDECLARED = 'else if (!canConclude) { layer = ';
  a(cnt(Ec, UNDECLARED) === 1, 'v2275/A1c: 未判定闸判据在源码里只有一处（禁止第二份真源）');

  const pr = /^[\s\S]*$/;
  a(pr.test(Ec), 'v2275/A1d: 源码可读');
  // 零写面：本节是纯读数台账
  a(cnt(Ec, 'store.transact(') === 0, 'v2275/A2a: 零 store.transact 写调用（纯读数）');
  a(cnt(Ec, 'localStorage.setItem(') === 0, 'v2275/A2b: 零 localStorage 直接写');
  a(cnt(Ec, 'saveOrThrow(') === 1, 'v2275/A2c: 唯一写入口是自己的 saveOrThrow');
  // 不改别人的 enabled（档位归 capabilityTier）
  const tamper = Object.keys(ENG_NS_SETTINGS).filter(function (ns) {
    return cnt(Ec, 'WA.' + ns + '.setSettings(') > 0;
  });
  a(tamper.length === 0, 'v2275/A2d: 绝不替别的引擎改设置（越界：' + j(tamper) + '）');
  // 导出面收口：只 6 口，且无 invalidate / build / DEF。
  //   ⚠ 判据只看**导出面字面量那一段**：整文件里 invalidate 仍出现在注释中
  //     （那段注释在讲「为什么撤掉它」），按整文件数会把沿革说明当成实现残留。
  const exp = Ec.slice(Ec.indexOf('WA.driverLedger = {'));
  a(exp.indexOf('invalidate') < 0, 'v2275/A2e: 导出面字面量里无 invalidate（缓存自带签名）');
  a(cnt(Ec, 'function invalidate') === 0, 'v2275/A2e2: 实现里也确已无 invalidate 函数体');
  const faces274 = (exp.match(/^\s{4}[a-zA-Z]+:/gm) || []).length;
  a(faces274 === 6, 'v2275/A2f: 导出面字面量恰 6 口（实 ' + faces274 + '）');
}

// 台账「不许替人开开关」的对照名单：这些引擎自己有 setSettings，源码里不该被本模块点开
const ENG_NS_SETTINGS = { capabilityTier: 1, outputGuard: 1, genTiming: 1 };

// ══ B 分层契约（每条面各有一个「只有它命中」的对照） ═══════════════════════
function secB(a, WA) {
  setPrefetch(WA, null);          // 完整预取 = 可下结论的面
  const v = WA.driverLedger.view();
  a(v.scan.canConclude === true, 'v2275/B0: 完整预取时可下结论（现 canConclude=' + v.scan.canConclude + '）');
  a(v.scan.level === 'prefetch' || v.scan.level === 'static',
    'v2275/B0b: 扫描面是能下结论的两档之一（实 ' + v.scan.level + '）');

  // 平账：七档合计必须等于 total（探针手算漏键曾造成「合计 104≠109」）
  const sum = Object.keys(v.counts).reduce(function (s, k) { return s + (v.counts[k] || 0); }, 0);
  a(sum === v.total, 'v2275/B1: 七档合计 = total（' + sum + ' vs ' + v.total + '）');
  a(v.total > 0, 'v2275/B1b: 确实盘点到了带 buildBlock 的引擎（实 ' + v.total + '）');

  // 每一档的名单条数必须与计数一致（计数不许是清单截断长度）
  a(v.layerNames.L1.length === v.counts.L1, 'v2275/B2a: L1 名单条数 = 计数');
  a(v.layerNames.L2r.length === v.counts.L2r, 'v2275/B2b: L2r 名单条数 = 计数');
  a(v.layerNames.L2p.length === v.counts.L2p, 'v2275/B2c: L2p 名单条数 = 计数');
  a(v.layerNames.L2e.length === v.counts.L2e, 'v2275/B2d: L2e 名单条数 = 计数');

  // 四条面互不重叠（一台引擎只能落一档）
  const seen = {};
  let dup = [];
  ['L1', 'L2r', 'L2p', 'L2e', 'L3a', 'L3b'].forEach(function (L) {
    (v.layerNames[L] || []).forEach(function (ns) {
      if (seen[ns]) dup.push(ns + ' 在 ' + seen[ns] + ' 与 ' + L);
      else seen[ns] = L;
    });
  });
  a(dup.length === 0, 'v2275/B3: 六档名单两两不重叠（越界：' + j(dup.slice(0, 3)) + '）');

  // 每条面各点一个对照：判据必须能区分「这一面命中」与「没有」
  if (v.layerNames.L1.length) {
    const ns = v.layerNames.L1[0];
    const w = WA.driverLedger.why(ns);
    a(w.layer === 'L1' && w.chainSteps.length > 0,
      'v2275/B4a: L1 对照 ' + ns + ' 的 why() 能点出链步名（实 ' + j(w.chainSteps.slice(0, 2)) + '）');
  }
  if (v.layerNames.L2r.length) {
    const ns = v.layerNames.L2r[0];
    const w = WA.driverLedger.why(ns);
    a(w.layer === 'L2r' && w.routedBy.length > 0,
      'v2275/B4b: L2r 对照 ' + ns + ' 能点出路由键名（实 ' + j(w.routedBy.slice(0, 2)) + '）');
  }
  if (v.layerNames.L2p.length) {
    const ns = v.layerNames.L2p[0];
    const w = WA.driverLedger.why(ns);
    a(w.layer === 'L2p' && w.panelMembers.length > 0,
      'v2275/B4c: L2p 对照 ' + ns + ' 能点出面板成员名（实 ' + j(w.panelMembers.slice(0, 2)) + '）');
  }
  if (v.layerNames.L2e.length) {
    const ns = v.layerNames.L2e[0];
    const w = WA.driverLedger.why(ns);
    a(w.layer === 'L2e' && /被可达引擎调用：\S/.test(w.hint),
      'v2275/B4d: L2e 对照 ' + ns + ' 的 hint 点出是谁在喂（实 ' + w.hint.slice(0, 40) + '）');
  }

  // L3 两档的措辞必须分得开（只诊断读 ≠ 谁都不碰）
  const blind = v.layerNames.L3b[0];
  const diagOnly = v.layerNames.L3a[0];
  if (blind) {
    const w = WA.driverLedger.why(blind);
    a(/诊断面也没念它/.test(w.hint), 'v2275/B5a: L3b 对照 ' + blind + ' 的 hint 报「诊断面也没念它」');
  }
  if (diagOnly) {
    const w = WA.driverLedger.why(diagOnly);
    a(/只有诊断\/健康聚合在读它/.test(w.hint), 'v2275/B5b: L3a 对照 ' + diagOnly + ' 的 hint 报「只有诊断面在读」');
  }

  // 驱动者必须自身可达：互调面的驱动者名字要能解析成「可达引擎.成员」
  const e = v.layerNames.L2e[0];
  if (e) {
    const w = WA.driverLedger.why(e);
    const via = (w.hint.match(/被可达引擎调用：([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)/) || [])[1] || '';
    a(!!via, 'v2275/B6: L2e 的驱动者形态是「引擎.成员」（实 ' + j(via) + '）');
  }

  // 摘要必须把「未判定」与「没有驱动入口」分开念
  const s = WA.driverLedger.summaryText();
  a(v.scan.canConclude ? /没有驱动入口/.test(s) : /未判定/.test(s),
    'v2275/B7: 摘要按 canConclude 换说法（实 ' + s.slice(0, 60) + '…）');
}

// ══ C 两条「读不到不许写成没有」 ═══════════════════════════════════════════
function secC(a, WA) {
  // C1 预取不完整（只喂 40 个文件）
  setPrefetch(WA, 40);
  const v1 = WA.driverLedger.view();
  a(v1.scan.canConclude === false,
    'v2275/C1a: 预取 40/全量时不冒充可下结论（canConclude=' + v1.scan.canConclude + '）');
  a(v1.counts.L3a + v1.counts.L3b === 0,
    'v2275/C1b: 预取不完整时 L3a+L3b 必须为 0（实 ' + (v1.counts.L3a + v1.counts.L3b) + '）');
  a(v1.counts.undetermined > 0,
    'v2275/C1c: 未判定必须真的有人（实 ' + v1.counts.undetermined + '）');
  a(v1.counts.L2e === 0, 'v2275/C1d: 预取不完整时不做互调推断（L2e 实 ' + v1.counts.L2e + '）');
  a(/未判定/.test(v1.note) && /预取/.test(v1.note),
    'v2275/C1e: note 说清「预取不完整」这个原因（不是笼统一句读不到）');

  // C2 只有函数体（运行期口径）
  setRuntimeOnly(WA);
  const v2 = WA.driverLedger.view();
  a(v2.scan.level === 'runtime', 'v2275/C2a: 无预取时退到运行期口径（实 ' + v2.scan.level + '）');
  a(v2.scan.canConclude === false, 'v2275/C2b: 运行期口径永不 canConclude');
  a(v2.counts.L3a + v2.counts.L3b === 0,
    'v2275/C2c: 运行期口径 L3a+L3b 必须为 0（实 ' + (v2.counts.L3a + v2.counts.L3b) + '）');
  a(v2.counts.L2e === 0, 'v2275/C2d: 运行期口径不做互调推断（L2e 实 ' + v2.counts.L2e + '）');
  a(/函数体/.test(v2.note), 'v2275/C2e: note 说清「只有导出函数体」这个原因');
}

// ══ D 计数契约（不许拿截断后的长度当总数） ═════════════════════════════════
function secD(a, WA) {
  setPrefetch(WA, null);
  WA.driverLedger.setSettings({ maxList: 10 });
  const v = WA.driverLedger.view();
  const blindCount = v.counts.L3b;
  const diagCount = v.counts.L3a;
  a(v.blindOrphans.length <= 10, 'v2275/D1a: 清单按 maxList=10 截断（实 ' + v.blindOrphans.length + '）');
  a(v.blindOrphanCount === blindCount,
    'v2275/D2a: blindOrphanCount 是真实条数而不是清单长度（' + v.blindOrphanCount + ' vs L3b ' + blindCount + '）');
  a(v.diagOnlyOrphanCount === diagCount,
    'v2275/D2b: diagOnlyOrphanCount 是真实条数（' + v.diagOnlyOrphanCount + ' vs L3a ' + diagCount + '）');
  a(v.undeterminedCount === v.counts.undetermined,
    'v2275/D2c: undeterminedCount 是真实条数（' + v.undeterminedCount + '）');
  a(v.orphanCount === blindCount + diagCount,
    'v2275/D2d: orphanCount = L3a + L3b（' + v.orphanCount + '）');
  WA.driverLedger.setSettings({ maxList: 200 });

  // maxList 变大后清单条数应当跟着涨（反过来证明上面的相等不是因为「刚好都小于 10」）
  WA.driverLedger.setSettings({ maxList: 400 });
  const v2 = WA.driverLedger.view();
  a(v2.blindOrphans.length >= v.blindOrphans.length,
    'v2275/D3: 清单上限放大后条数不减（' + v.blindOrphans.length + ' → ' + v2.blindOrphans.length + '）');
  WA.driverLedger.setSettings({ maxList: 200 });
}

// ══ E 同源契约（扫描面与互调图必须同源） ═══════════════════════════════════
function secE(a, WA) {
  setPrefetch(WA, null);
  const v1 = WA.driverLedger.view();
  const e1 = v1.counts.L2e;
  a(v1.scan.reachOk === true, 'v2275/E1a: 完整预取时互调图可用（reachOk=' + v1.scan.reachOk + '）');
  a(v1.scan.reachSize > 0, 'v2275/E1b: 可达集非空（实 ' + v1.scan.reachSize + '）');
  // 先跑完整预取，再退回运行期：图必须被清掉，L2e 归零
  setRuntimeOnly(WA);
  const v2 = WA.driverLedger.view();
  a(v2.counts.L2e === 0,
    'v2275/E2a: 从预取退回运行期后 L2e 必须归零（实 ' + v2.counts.L2e + '；'
    + '否则是用扫描面 A 的边解释扫描面 B 的结论）');
  a(v2.scan.reachOk === false, 'v2275/E2b: 运行期口径互调图不可用（reachOk 须为 false）');
  a(e1 >= 0, 'v2275/E2c: 预取面的 L2e 读数已记录（' + e1 + '）');
  // 再装回预取：图必须重建（只清不建也是一种坏）
  setPrefetch(WA, null);
  const v3 = WA.driverLedger.view();
  a(v3.counts.L2e === e1,
    'v2275/E3: 装回预取后 L2e 读数复原（' + v3.counts.L2e + ' vs ' + e1 + '）');
}

// ══ F 缓存契约（自带签名、导出面无 invalidate） ═════════════════════════════
function secF(a, WA) {
  setPrefetch(WA, 40);
  const v1 = WA.driverLedger.view();
  a(v1.scan.canConclude === false, 'v2275/F1a: 缓存建立时是「不完整」态');
  const u1 = v1.counts.undetermined;
  // 扫描面变完整：签名必须让缓存自己失效
  setPrefetch(WA, null);
  const v2 = WA.driverLedger.view();
  a(v2.scan.canConclude === true,
    'v2275/F2a: 预取补到全量后缓存自己失效并重扫（canConclude=' + v2.scan.canConclude + '）');
  a(v2.counts.undetermined !== u1 || u1 === 0,
    'v2275/F2b: 重扫后未判定数变了（' + u1 + ' → ' + v2.counts.undetermined + '）');
  // 导出面：无 invalidate（「靠外部记得调」的缓存产品侧零调用点 = 永不失效）
  a(typeof WA.driverLedger.invalidate === 'undefined',
    'v2275/F3a: 导出面无 invalidate（缓存自己会失效）');
  a(typeof WA.driverLedger.build === 'undefined', 'v2275/F3b: build 不对外（内部实现，读数走 view）');
  const keys = Object.keys(WA.driverLedger).sort();
  a(j(keys) === j(['getSettings', 'setSettings', 'stat', 'summaryText', 'view', 'why']),
    'v2275/F3c: 导出面恰 6 口（实 ' + j(keys) + '）');
  // 关着的时候读数仍在（台账是只读面，关只影响面板展示口径）
  WA.driverLedger.setSettings({ enabled: false });
  a(WA.driverLedger.getSettings().enabled === false, 'v2275/F4a: 关掉后设置读得回来');
  WA.driverLedger.setSettings({ enabled: true });
  a(WA.driverLedger.getSettings().enabled === true, 'v2275/F4b: 再打开读得回来（不滞留关闭态）');
}

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  const Ec = rd(ENG_REL);
  secA(a, Ec);

  const B = boot(null);
  a(B.fail.length === 0, 'v2275/A0: 全量模块在私有宿主里装载无失败（实 ' + B.fail.length + ' 个：'
    + j(B.fail.slice(0, 2)) + '）');
  a(!!B.WA.driverLedger, 'v2275/A0b: driverLedger 已装载');
  secB(a, B.WA);
  secC(a, B.WA);

  // 计数/同源/缓存三段换新宿主跑：避免上段的扫描缓存与设置残留串档
  const C = boot(null);
  secD(a, C.WA);
  const D = boot(null);
  secE(a, D.WA);
  const E = boot(null);
  secF(a, E.WA);
}

// ══ N 负控制：真源码破坏 → 加载破坏副本 → 在副本上重跑同款判据 ═════════════
//
//   【幂等】源码若**已经是**破坏副本（例如元检验 tools/v7probes/p_lockmeta.js
//   正把整份文件换成破坏版），这里就直接返回它，不再抛「锚点不是恰 1 次」。
//   踩过的坑：第一版没有这条，元检验时 reachScope 那一格的红是
//   `[抛] 破坏锚点 reachScope 在源码里不是恰 1 次` —— 红灯**原因不对**，
//   那只能证明「锚点没了」，不能证明「这条破坏改了行为」。
//   注意两种情形的界限：锚点缺失**且**破坏串也不在 ⇒ 那是真的锚点漂移，必须抛。
function broken(anchorKey) {
  const src = rd(ENG_REL);
  if (src.indexOf(BREAK[anchorKey]) >= 0 && cnt(src, ANCHOR[anchorKey]) === 0) return src;
  const n = cnt(src, ANCHOR[anchorKey]);
  if (n !== 1) throw new Error('破坏锚点 ' + anchorKey + ' 在源码里不是恰 1 次（实 ' + n + '）');
  const bad = src.split(ANCHOR[anchorKey]).join(BREAK[anchorKey]);
  if (bad === src) throw new Error('破坏未生效：' + anchorKey);
  return bad;
}

function runNegative(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };

  // N0 两向自证：正面用例在原版上必须成立（判据不是恒真，也不是恒假）
  {
    const O = boot(null);
    setPrefetch(O.WA, null);
    const v = O.WA.driverLedger.view();
    a(v.counts.L2p > 0, 'N0a（正面）：原版上确实有引擎落在 L2p（实 ' + v.counts.L2p + '）');
    const P = boot(broken('panelGate'));
    setPrefetch(P.WA, null);
    const v2 = P.WA.driverLedger.view();
    a(v2.counts.L2p === 0, 'N0b（两向）：破坏面板判据后 L2p 必须归零（实 ' + v2.counts.L2p + '）');
  }

  // N1 破坏「未判定闸」⇒ 预取不完整时冒出 L3b（把读不到写成没有）
  {
    const O = boot(null);
    setPrefetch(O.WA, 40);
    a(O.WA.driverLedger.view().counts.L3b === 0, 'N1a（正面）：原版预取残缺时 L3b = 0');
    const P = boot(broken('undeterminedGate'));
    setPrefetch(P.WA, 40);
    const v = P.WA.driverLedger.view();
    a(v.counts.L3b > 0, 'N1b（现形）：破坏未判定闸 ⇒ 残缺预取也敢报「没人喂」（实 L3b '
      + v.counts.L3b + '）—— 这正是本锁要挡的假读数');
  }

  // N2 破坏「运行期清图」⇒ 从预取退回运行期后 L2e 不归零（面与图不同源）
  {
    const O = boot(null);
    setPrefetch(O.WA, null);
    O.WA.driverLedger.view();
    setRuntimeOnly(O.WA);
    a(O.WA.driverLedger.view().counts.L2e === 0, 'N2a（正面）：原版退回运行期后 L2e = 0');
    const P = boot(broken('runtimeClearGraph'));
    setPrefetch(P.WA, null);
    const pre = P.WA.driverLedger.view().counts.L2e;
    setRuntimeOnly(P.WA);
    const v = P.WA.driverLedger.view();
    a(pre > 0, 'N2b（前提）：破坏副本在预取面确有 L2e 读数（实 ' + pre + '）');
    a(v.counts.L2e > 0, 'N2c（现形）：图未清 ⇒ 运行期口径仍报出 ' + v.counts.L2e
      + ' 台「被引擎互调驱动」，而这一面此刻根本读不到源码');
  }

  // N3 破坏「扩散范围」⇒ 面板/渲染的调用被当成互调边，L3 整档被洗白
  //
  //   【为什么不能用 reachSize】实测原版与原版自己比是 `184 → 184`？
  //   不对 —— 那次是磁盘源码被上一趟元检验留在破坏态，两版都是破坏版。
  //   干净基线上的真读数：原版 reachSize=136 / L2e=5 / L3a=6 / L3b=33；
  //   破坏后 reachSize=184 / L2e=44 / L3a=0 / L3b=0。
  //   判据因此必须盯**语义值**（L2e 暴涨 + L3 两档被洗成 0），
  //   盯 reachSize 只能说「变大」，说不出「坏在哪」。
  {
    const O = boot(null);
    setPrefetch(O.WA, null);
    const v1 = O.WA.driverLedger.view();
    const P = boot(broken('reachScope'));
    setPrefetch(P.WA, null);
    const v2 = P.WA.driverLedger.view();
    a(v2.counts.L2e > v1.counts.L2e,
      'N3a（现形）：扩散范围放开后 L2e 由 ' + v1.counts.L2e + ' 暴涨到 ' + v2.counts.L2e
      + '（ui/render 的调用被当成引擎互调）');
    a(v2.counts.L3a + v2.counts.L3b === 0 && v1.counts.L3a + v1.counts.L3b > 0,
      'N3b（现形）：同时 L3 两档被洗成 0（原版 ' + (v1.counts.L3a + v1.counts.L3b)
      + ' 台）—— 这一栏就再也不成其为判据');
    // 洗白的具体机制：L3a 的引擎连「只有诊断面在读」都保不住，被改判成「有引擎在喂」
    const moved = v1.layerNames.L3a.filter(function (ns) { return v2.layerNames.L2e.indexOf(ns) >= 0; });
    a(moved.length > 0,
      'N3c（机制）：原版 L3a 里的引擎被改判成 L2e（' + j(moved.slice(0, 3)) + '）');
  }

  // N4 破坏「自己文件调自己」跳过 ⇒ 同一文件里定义的另一个命名空间被自己的调用判成「有引擎在喂」
  //
  //   【为什么不能只看 reachSize 涨没涨】实测原版与破坏版的 reachSize 都是 136 ——
  //   现行仓库里定义多个命名空间的文件只有 3 个（agency / input-guard / driver-ledger），
  //   而它们的第二个命名空间本来就不可达，于是这条规则在真实数据上是**空转**的：
  //   用「可达集膨胀」当判据，两版读数一样，N4b 就成了一条恒假的断言（踩过一次）。
  //   改法：人造一个**规则必然现形**的最小场景 —— 同一文件里定义 aaa 与 zzz，
  //   aaa 由路由表登记（因而可达），文件里调 `WA.zzz.tick(`：
  //     · 原版：zzz 是本文件自己定义的 ⇒ 跳过 ⇒ 不构成驱动；
  //     · 破坏：zzz 被记成「被可达引擎调用」⇒ 一个谁都没接的命名空间凭空有了驱动者。
  {
    function fakeHost(engSrc) {
      const B = boot(engSrc);
      const WA = B.WA;
      setPrefetch(WA, null);
      // 两个带 buildBlock 的命名空间（只有它们才进台账）
      WA.aaa = { buildBlock: function () { return []; } };
      WA.zzz = { buildBlock: function () { return []; } };
      // aaa 由产品自己的路由表登记 ⇒ 它是自证面、是扩散起点
      WA.actionDesk.ROUTES = ['aaa.act'];
      // 人造源码文件：同一文件里定义 aaa 与 zzz，并调用 zzz 的成员
      const fakeRel = 'engines/zz-selfcall-fixture.js';
      const fakeSrc = 'WA.aaa = {};\nWA.zzz = {};\nWA.zzz.tick();\n';
      WA.__prefetch.set(fakeRel, fakeSrc);
      WA.__loadOrder = WA.__loadOrder.concat([fakeRel]);
      return WA;
    }
    const O = fakeHost(null);
    const vo = O.driverLedger.view();
    const wo = O.driverLedger.why('zzz');
    a(vo.layerNames.L1.length >= 0 && wo.layer !== 'L2e',
      'N4a（正面）：同一文件里的自调不构成驱动（zzz 实落 ' + wo.layer + '）');
    const P = fakeHost(broken('selfCallSkip'));
    const wp = P.driverLedger.why('zzz');
    a(wp.layer === 'L2e',
      'N4b（现形）：跳过自调后 zzz 被记成「被可达引擎调用」（实落 ' + wp.layer + '）'
      + ' —— 一个没人接的命名空间凭空有了驱动者');
    a(/zzz\.tick/.test(wp.hint) || /被可达引擎调用/.test(wp.hint),
      'N4c（现形）：hint 甚至能点出那条自调边（实 ' + wp.hint.slice(0, 40) + '…）');
  }

  // N5 破坏「缓存签名」⇒ 预取从 40 涨到全量，读数仍停在不完整（永不重扫）
  {
    const O = boot(null);
    setPrefetch(O.WA, 40);
    O.WA.driverLedger.view();
    setPrefetch(O.WA, null);
    a(O.WA.driverLedger.view().scan.canConclude === true, 'N5a（正面）：原版补全预取后能下结论');
    const P = boot(broken('cacheSig'));
    setPrefetch(P.WA, 40);
    P.WA.driverLedger.view();
    setPrefetch(P.WA, null);
    const v = P.WA.driverLedger.view();
    a(v.scan.canConclude === false, 'N5b（现形）：缓存永不失效 ⇒ 补全了预取仍报「读不全」，'
      + '这一栏会永久停在未判定');
  }

  // N6 破坏「计数字段」⇒ 计数退化成清单截断长度（把上限当真实条数）
  {
    const O = boot(null);
    setPrefetch(O.WA, null);
    O.WA.driverLedger.setSettings({ maxList: 10 });
    const vo = O.WA.driverLedger.view();
    a(vo.blindOrphanCount === vo.counts.L3b, 'N6a（正面）：原版计数 = 真实条数');
    // 【v2.294.0（V8 OPV8-4）】被截断档从 L3b 换成 L3a：
    //   OPV8-4 修完两处假阴性后 L3b 真实归零（5 台进 L2e、survival 进 L2e、4 台留 L3a），
    //   原前提「真实 L3b > 上限」结构性消失。这里改用仍有真实样本的 L3a，
    //   并把上限压到 2 —— 判据语义不变（计数必须是真实条数，不是 slice 后长度）。
    //   不选「往 L3b 塞假引擎」：那是拿锁给假读数背书。
    const lim = 2;
    const P = boot(broken('blindCount'));
    setPrefetch(P.WA, null);
    P.WA.driverLedger.setSettings({ maxList: lim });
    const vp = P.WA.driverLedger.view();
    a(vp.diagOnlyOrphanCount <= lim,
      'N6c（现形）：计数退化成截断长度（' + vp.diagOnlyOrphanCount
      + ' vs 真实 ' + vp.counts.L3a + '）—— 少报的 ' + (vp.counts.L3a - vp.diagOnlyOrphanCount)
      + ' 台从此看不见');
    // 前提必须独立成立：真实条数确实超过上限，否则上面那条会因「本来就小于上限」而恒真。
    a(vp.counts.L3a > lim, 'N6b（前提）：真实 L3a 超过清单上限 ' + lim + '（实 ' + vp.counts.L3a + '）');
    // L3b 侧补一条：真实为 0 时计数也必须报 0，不许编数。
    a(vp.counts.L3b === 0 ? vp.blindOrphanCount === 0 : vp.blindOrphanCount === vp.counts.L3b,
      'N6d：L3b 计数与真实条数一致（' + vp.blindOrphanCount + ' vs ' + vp.counts.L3b + '）');
  }

  // N7 破坏「诊断面按文件认」⇒ L3a 与 L3b 分不开（只诊断读被折进「没人碰」）
  {
    const O = boot(null);
    setPrefetch(O.WA, null);
    const vo = O.WA.driverLedger.view();
    a(vo.counts.L3a > 0, 'N7a（正面）：原版确实有只被诊断面读的引擎（实 ' + vo.counts.L3a + '）');
    const P = boot(broken('diagFace'));
    setPrefetch(P.WA, null);
    const vp = P.WA.driverLedger.view();
    a(vp.counts.L3a === 0 && vo.counts.L3a > 0,
      'N7b（现形）：诊断面认不出 ⇒ L3a 归零（「还有人在看」与「没人碰」被折成一档）');
  }

  // N8 破坏「互调档排位」⇒ L2e 台数归零且被折进 L2p/L3（裁决顺序不许乱）
  {
    const O = boot(null);
    setPrefetch(O.WA, null);
    const vo = O.WA.driverLedger.view();
    a(vo.counts.L2e > 0, 'N8a（正面）：原版确有引擎互调驱动（实 ' + vo.counts.L2e + '）');
    const P = boot(broken('l2eGate'));
    setPrefetch(P.WA, null);
    const vp = P.WA.driverLedger.view();
    a(vp.counts.L2e === 0, 'N8b（现形）：关掉互调档 ⇒ 这 ' + vo.counts.L2e
      + ' 台会掉进「没人喂」，把有引擎在喂写成没有驱动入口（假阴性）');
  }

  // N9 破坏「合并时带上 diag 桶」⇒ 预取残缺时补进来的运行期证据把诊断面整批丢掉
  //
  //   【为什么不能用「未判定总数」当判据】实测原版与破坏版的 undetermined 都是 44
  //   —— 合并只影响「来源分桶」，不影响「这台引擎有没有命中面」，总数本就不该变。
  //   我一开始正是拿总数写成了断言，那条判据两边同值 ⇒ 恒真，等于什么都没锁（踩过一次）。
  //   真正可观测的是**诊断面证据本身**：预取只有 40 个文件时，
  //   `memorySampler` 的诊断面调用来自运行期扫描补进来的那一份；
  //   破坏版把 diag 桶漏掉，这份证据就整批消失（diagMembers 由非空变空）。
  {
    const O = boot(null);
    setPrefetch(O.WA, 40);
    const vo = O.WA.driverLedger.view();
    const sample = vo.layerNames.L3a
      .concat(vo.layerNames.L3b, vo.undetermined, vo.layerNames.L2p)
      .filter(function (ns) { return (O.WA.driverLedger.why(ns).diagMembers || []).length > 0; });
    a(sample.length > 0, 'N9a（正面）：残缺预取时确有引擎带着合并进来的诊断面证据'
      + '（样本 ' + j(sample.slice(0, 3)) + '）');
    const P = boot(broken('mergeDiag'));
    setPrefetch(P.WA, 40);
    const keep = sample.filter(function (ns) {
      return (P.WA.driverLedger.why(ns).diagMembers || []).length > 0;
    });
    a(keep.length === 0, 'N9b（现形）：漏掉 diag 桶 ⇒ 诊断面证据整批消失（仍残留：' + j(keep.slice(0, 3)) + '）'
      + ' —— L3a「还有人在看」与 L3b「没人碰」就此分不开');
    // 两版的「有没有命中面」不受影响（合并只改来源归属，不改命中判定）
    a(vo.counts.undetermined === P.WA.driverLedger.view().counts.undetermined,
      'N9c：合并桶只改来源归属，不改「未判定」总数（' + vo.counts.undetermined + '）');
  }

  // N10 破坏「hint 优先级」⇒ 通用口径词排到专属成员前面（读数没错但报告误导）
  //
  //   实测对照：原版 `diplomacy` 念「applies、pairView、propose 等 11 个成员」，
  //   破坏后念「getSettings、setSettings、view 等 11 个成员」——**同一个 11**，
  //   但后者会让人以为这个引擎只有读数口。判据必须盯住「前三个是谁」，
  //   不能写成「两版 hint 不同就算过」（那连换个标点都能通过）。
  {
    const GEN = { getSettings: 1, setSettings: 1, stat: 1, statView: 1, view: 1,
      summaryText: 1, why: 1, build: 1, DEF: 1, settings: 1 };
    const O = boot(null);
    setPrefetch(O.WA, null);
    const ns = O.WA.driverLedger.view().layerNames.L2p.filter(function (x) {
      return O.WA.driverLedger.why(x).panelMembers.length > 3;
    })[0];
    a(!!ns, 'N10a（前提）：找得到「专属控件 > 3」的 L2p 引擎（实 ' + j(ns) + '）');
    if (ns) {
      const head = function (hint) {
        const m = hint.match(/面板有控件在调它：([^。]*)/);
        return m ? m[1].split('、') : [];
      };
      const ho = head(O.WA.driverLedger.why(ns).hint);
      a(ho.length > 0 && !ho.slice(0, 3).some(function (x) { return GEN[x]; }),
        'N10b（正面）：原版前三个成员都不是通用口径词（实 ' + j(ho.slice(0, 3)) + '）');
      const P = boot(broken('hintPanel'));
      setPrefetch(P.WA, null);
      const hp = head(P.WA.driverLedger.why(ns).hint);
      a(hp.slice(0, 3).some(function (x) { return GEN[x]; }),
        'N10c（现形）：拿掉优先级后通用口径词占满前三位（实 ' + j(hp.slice(0, 3)) + '）');
      a(hp.length === ho.length,
        'N10d：优先级只改顺序不改成员集合（' + ho.length + ' vs ' + hp.length + '）');
    }
  }

  // N11 破坏导出面 ⇒ 少一口就必须被 F3c 逮到（本段证明 F3c 不是恒真）
  {
    const P = boot(broken('exportFace'));
    const keys = Object.keys(P.WA.driverLedger || {}).sort();
    a(keys.indexOf('stat') < 0, 'N11（现形）：破坏导出面后 stat 口消失（实 ' + j(keys) + '）');
  }
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (c, name) { if (c) pass++; else { fail++; console.error('FAIL: ' + name); } };
  runAll(a);
  runNegative(a);
  console.log('Summary: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
}

module.exports = { runAll, runNegative, ANCHOR, BREAK };
