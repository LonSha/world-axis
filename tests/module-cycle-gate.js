#!/usr/bin/env node
'use strict';
/**
 * tests/module-cycle-gate.js — 模块依赖静态图门禁（v2.107.0 计划一 #20）。
 *
 * 为什么要它（与 module-registry-gate.js 互补，不是重复）：
 *   module-registry-gate 的文件头已把边界写死：**静态面能回答的只有「提到了谁」（refs），
 *   回答不了「装载顺序上必须先有谁」**——它的两条静态扫描器都失败了（v1 朴素 DFS 指数爆炸；
 *   v2 括号配平把装载期读判成调用期读，输出「装载期 558 / 调用期 0」，而真相是 23 / 44）。
 *   它治的是**运行期实测边**（真装载 + Proxy + 调用栈定案，23 条装载期边、44 条调用期引用）。
 *   本门禁治的是运行期实测的**结构性盲区**：实测只看得见「真跑到了」的边。
 *
 *   本门禁只负责**静态能回答的那部分**，次序判据不靠静态猜：order-violation 建立在
 *   **运行时定案过的 requires 边**上，用 LOAD_ORDER 定性质。
 *
 * 本版实测到的四个事实，直接决定判据设计（全部由本文件自己的读数给出）：
 *   ① 静态引用 909 条文件级边，其中**只有 23 条**被运行期定为装载期读。
 *      若拿全部静态引用判次序，会报出 281 条「违规」——全是调用期读
 *      （函数体里的 WA.clock.now() 之类），红得铺天盖地却一条不是缺陷。
 *      ⇒ 这正是 module-registry-gate 记档的那句：「引用最多」不等于「必须先装载」。
 *   ② 23 条装载期边**全部**满足「供者先装」（供者 LOAD_ORDER 下标 < 消费方），零违规。
 *   ③ 本仓有且仅有 2 条**模块级跨文件顶替**，两条各有明确理由（见 CONTRACT_NS）。
 *      顶替本身不可怕，可怕的是一次静默重读全部 providerOrderOk 翻转——可见性才是判据。
 *   ④ 「静态面 148 个 ns / 账本 123 个」的差集**不是噪声**：148 里有 25 个由入口 index.js
 *      与 UI 层提供（它们不进 LOAD_ORDER，故不在账本），其余 123 与账本逐项吻合。
 *      另有一处成对替换（v2.107.0 时读作 121 ↔ 120 的一对一差；v2.110.0 两边同步各 +3 后差集归零）：`engines/contract-audit.js` 的
 *      `if (keepDigest) WA.digest = ...`（try/finally 里条件屏蔽 digest.generate，
 *      finally 原位还原，见 contract-audit.js:138-142 / 211）——它是**成对的临时替换**，
 *      不是新提供方，故计入 CONTRACT_NS 而不是报冲突。
 *
 * 判据（红）：
 *   ① unprovided：读了「既不在任何文件的提供方集合、又未登记为入口/外名」的 ns。
 *      这类边在运行期是 undefined.x —— 静态能提前抓住。
 *   ② order-violation：**运行时定案的装载期边**上，供者的 LOAD_ORDER 下标 > 消费方，
 *      即「供的人后装」。只判 requires 边，不对静态引用判。
 *   ③ cross-file-write：同名 ns 被 ≥2 个文件**赋值**，且未登记为共享/自引用。
 *      这类边在运行期是「后跑的静默顶掉先跑的」——与 dup-decl-gate 同族的静默覆盖。
 *   ④ misattributed：账本 requiresFiles 指向了一个并不提供该 ns 的文件（归属错配）。
 *   ⑤ dead-registration：登记了（入口/外名/共享/自引用表里）却**全仓无人读**的名字
 *      = 过期登记，会静默掩盖真·未提供。与 lonsha 的 scan_config_liveness 同族。
 *   ⑥ ns-face-drift：静态提供方集合 与 账本 ns 面 出现**未登记的一对一差**。
 *   ⑦ unreflected：运行时定案、静态面扫不出来的装载期边（扫描器瞎了）；以及环。
 *
 * 只报不红（读数，不是缺陷）：
 *   · dead-ns：模块提供了但**产品源面**零读。消费者可能是 tests / 宿主 / 运行时外壳
 *     （本仓实测 10 个；v2.110.0 的 11 个里 faultContext / schema / permissions 只有 tests 侧消费，而 v2.111.0 的 auditLog 与 sanitize 都接了产品真消费方故**离开这一面**，10 个里绝大多数各有 tests 侧或运行时消费方；唯一真正零消费的是
 *     core/interceptor.js 的 LEAK_THRESHOLD，它已被 dead-export-gate 记为 dead，
 *     本门禁不抢那份账）。
 *   · 账本 requires 里 NS_FIELD_MAP 未登记的 ns = 未定性读数（不许当成 0 条边蒙过去）。
 *
 * 静态图无环：load 边 + 顶替序（供者在前 → 被顶替者在后）。这两类边方向由「事实」给定
 *   （requires 由实测定案、顶替序由 LOAD_ORDER 先后给定），故无环性可证。静态引用边**不**参与
 *   环判定（含 886 条调用期边，本就有环，且环无意义）。本仓实测：模块装载不循环。
 *
 * 覆盖率是读数的一部分（不许把「解析不出来」当成「没有引用」）：
 *   - aliasFiles / productFiles —— 有多少文件真的解析出了 WA 别名（本仓 121 / 121）。
 *   - refFiles / aliasFiles —— 解析出别名的文件里，有多少真的引用了别的 ns（本仓 119 / 121；两个零引用文件是 core/input-guard.js 与 core/sanitize.js——**纯函数基元不读别人**，这是事实不是缺陷）。
 *   - 登记在用 N / 总数、账本缺项文件数（入口 + 三个 UI 文件不在账本内，实测 4）。
 *   只看「0 条边」无法区分「真没有边」与「扫描器全瞎了」，故覆盖率是一等读数。
 *
 * 形态多样性（实测三种，宽匹配的必要性）：
 *   const WA = window.WorldAxis = window.WorldAxis || {};    （主流）
 *   const WA = (window.WorldAxis = window.WorldAxis || {});  （带外层括号：limits / digest / horizon）
 *   const WA = G.WorldAxis = G.WorldAxis || {};              （宿主变量叫 G：tool-diag / contract-audit）
 *   初版只认第一种 ⇒ 15 个文件被当成「无引用」——即「扫描器瞎了」长得像「没有边」。
 *
 * 边界（如实登记）：
 *   - 别名只认 const A = [ ( ] HOST.WorldAxis = HOST.WorldAxis || { } [ ) ] ; 一种形态；
 *     其他方式拿到 WA（参数传入、重新赋值）本轮未纳入，由 aliasFiles / productFiles 如实反映。
 *   - 只认 A.<ns> 形态的直接引用；A['ns'] / A[key] 代码不确定，不报错也不伪归。
 *   - 赋值只认 A.<ns> =，且**不剥注释**做归属判定：`// WA.x = ` 这类注释里的形态由
 *     该文件的正确性兜底——本仓实测把注释里被当提供方的 ns 数为 0，故不额外剥一层。
 *   - EXTERNAL_PREFIX 本轮为空：本仓 __ 前缀命名空间（__settingsRegs / __loaderState /
 *     __loadOrder / __loadFailed / __inited / __inputGuardInternal）**全部**有模块提供方，
 *     零例外；登记空前缀等于把口径放宽成「凡下划线一律放行」，那是掩盖而非覆盖。
 *   - dead-ns 的「零读」以**产品源面**为准（core/engines/actors/direction/render/compat/ui + index.js）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const { stripComments } = require('./test-surface-gate.js');

const DIRS = ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui'];
const LEDGER = path.join(__dirname, 'module-registry-ledger.json');

/** 外名：由宿主 / 测试外壳提供，不属于任何模块文件。逐条必须给理由 */
const EXTERNAL = {};

/**
 * 别名宿主名：出现在别名形态 `const A = HOST.WorldAxis = HOST.WorldAxis || {}` 里的 HOST 属性名。
 * 它由**别名形态本身**消费（本文件 ALIAS_RE 认的就是它），不会以 `A.<ns>` 形态被读，
 * 故不能进 EXTERNAL（那里判「全仓无人读 = 过期」会误报）。
 */
const ALIAS_HOST_NS = {
  WorldAxis: '别名宿主对象名（window.WorldAxis / G.WorldAxis 本体，写到宿主全局上）'
};

/** 入口命名空间：由 index.js 提供（不是外名），不进 LOAD_ORDER（入口先于所有模块执行） */
const ENTRY_NS = {
  mainWin: '宿主窗口（入口注入）',
  mainDoc: '宿主文档（入口注入）',
  VERSION: '入口版本常量',
  version: '入口版本常量别名',
  log: '入口日志出口',
  flushLog: '入口日志冲刷',
  loadEventLog: '入口日志载入',
  clearEventLog: '入口日志清空',
  loadScript: '入口脚本装载',
  loadFailures: '入口装载失败台账',
  loaderStatus: '入口装载器状态',
  baseUrl: '入口基址',
  logCaps: '入口诊断环动态上限',
  logTrimStat: '入口日志裁剪计量',
  eventLog: '入口事件环',
  errorLog: '入口错误子环',
  __inited: '入口「本次激活了哪些引擎」记账'
};

/** UI 层命名空间：由 ui/*.js 提供（运行时外壳挂载，不进 LOAD_ORDER） */
const UI_NS = {
  ui: 'UI 面板门面（ui/panel.js）',
  uiSettings: 'UI 设置门面（ui/settings.js）',
  assistant: '助手门面（ui/assistant.js）',
  // v2.152.0：第四个 UI 层命名空间。本仓的 UI ns 名单在两处，必须同批 ——
  //   tests/run.js 的 UI_NS2800、tests/export-contract.js 的 OPTIONAL、
  //   engines/tool-diag.js 的 OPTIONAL_EXPORTS；本表是第四处（静态图侧）。
  //   漏在这里的后果不是「少一行字」：renderPerf 会被判成「未登记的一对一差」（ns 面漂移），
  //   而它明明是 UI 层——先装后装的差别被读成「接线出了问题」。
  renderPerf: 'UI 面板渲染观测（ui/render-perf.js）',
  // v2.181.0：赛博朋克 UI 主题层的 9 个命名空间（ui/cyberpunk-*.js + ui/theme-switch.js）。
  //   本仓的 UI ns 名单有四份副本，必须同批 —— 漏在本表的后果是它们被判成「未登记的一对一差」
  //   （ns 面漂移），而它们明明是 UI 层。
  cyberUI: 'UI 主题层（ui/cyberpunk-components.js）',
  cyberDashboard: 'UI 主题层（ui/cyberpunk-dashboard.js）',
  cyberPeople: 'UI 主题层（ui/cyberpunk-people.js）',
  cyberLogs: 'UI 主题层（ui/cyberpunk-logs.js）',
  cyberAnimate: 'UI 主题层（ui/cyberpunk-animations.js）',
  cyberResponsive: 'UI 主题层（ui/cyberpunk-responsive.js）',
  cyberpunkTheme: 'UI 主题层（ui/cyberpunk-theme.js）',
  themeStyles: 'UI 主题层（ui/cyberpunk-theme.js）',
  themeSwitch: 'UI 主题层（ui/theme-switch.js）',
};

/**
 * 自引用型 ns：同一文件里 `WA.x = WA.x || {}` 或 `WA.x = (WA.x || []).concat(...)`
 * 反复赋值 —— 这是**累加**，不是「后跑的顶掉先跑的」。逐条必须给理由。
 */
const SELF_REF_NS = {
  __settingsRegs: '各模块用 (WA.__settingsRegs || []).concat([__REG]) 自注册，累加语义',
  modules: '入口兜底 WA.modules = WA.modules || {}（重复赋值是幂等置位）',
  registerModule: '入口兜底 typeof 守卫下赋值，非重复提供',
  moduleRegistry: '入口兜底 WA.moduleRegistry = function ...（typeof 守卫 + 返回 WA.modules 键清单），'
    + '与 core/store.js:36 同源同实现，重复赋值是幂等兜底'
};

/** 共享命名空间：同一 ns 多文件**有意**赋值且属「成对替换」。ns -> 理由 */
const CONTRACT_NS = {
  digest: 'engines/contract-audit.js 在 try 里 Object.assign 屏蔽 digest.generate、'
    + 'finally 原位还原（138-142 / 211 成对），是探测期的临时替换，不是第二个提供方'
};

/** 明确放行的外名前缀（本轮为空，见文件头边界） */
const EXTERNAL_PREFIX = [];

/**
 * 账本 requires 字段名 → 提供方文件名（复刻 module-registry-gate 的 NS_FIELD_MAP）。
 * 账本只给 ns 名与归属文件，不给「哪个文件提供了哪个 ns」的全局表，故此处显式登记。
 * 未登记的 ns 在交叉验证时进 unidentified（读数，不红）。
 */
const NS_FIELD_MAP = {
  workflow: 'core/workflow.js',
  settingsBus: 'core/settings-bus.js',
  store: 'core/store.js',
  clock: 'core/clock.js',
  rand: 'core/rand.js',
  digest: 'engines/digest.js',
  registerModule: 'core/store.js',
  // v2.182.0（第二批 · O3）：engines/perf-baseline.js 的装载期**硬边**是 perfTrace。
  //   判据与同批另四个新模块一致（perfLedger / renderPerf / storageForecast 走它们自己的
  //   模块文件），只有 perfTrace 一直没登记 —— 而它从 v2.102.0 起就在 perTrace 的提供方
  //   （engines/perf-trace.js）手里。不登记它，账本里那条 requires 会被报成「未定性」：
  //   按读数报出（不红），但下一个人读到时会以为这个 ns 的口径还没定。
  perfTrace: 'engines/perf-trace.js'
};

/**
 * 静态提供方集合与账本 ns 面之间**已核实的**差集（逐项核过，非噪声）：
 *   only-static：由入口 / UI 提供的 ns，不进 LOAD_ORDER 故不在账本。
 *   only-ledger：无（本仓实测为空；留空表以保可证伪性）。
 */
const NS_FACE_EXPECT = {
  onlyStatic: Object.keys(ENTRY_NS).concat(Object.keys(UI_NS)),
  onlyLedger: [],
  /**
   * __ 前缀面：账本不收录内部 ns（nsCount 的口径是「对外承诺的命名空间」），
   * 静态面照收。这 5 个是本仓全部 __ 前缀提供方（各有模块提供方，零例外），
   * 显式登记以免把「口径差」当成「漂移」。
   */
  internalPrefixed: ['__settingsRegs', '__loaderState', '__loadOrder', '__loadFailed',
    '__inited', '__inputGuardInternal', '__diplomacyWarn', '__agencyWarn', '__freightWarn']
};

/** 别名形态：const A = ( HOST.WorldAxis = HOST.WorldAxis || {} ) ; */
const ALIAS_RE = (function () {
  const host = '[A-Za-z_$][A-Za-z0-9_$]*';
  return new RegExp('const\\s+([A-Za-z_$][A-Za-z0-9_$]*)\\s*=\\s*\\(?\\s*' + host +
    '\\.WorldAxis\\s*=\\s*' + host + '\\.WorldAxis\\s*\\|\\|\\s*\\{\\s*\\}\\s*\\)?\\s*;');
})();

function productFiles() {
  const out = ['index.js'];
  DIRS.forEach(function (d) {
    const abs = path.join(BASE, d);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).sort().forEach(function (f) { if (f.endsWith('.js')) out.push(d + '/' + f); });
  });
  return out;
}

function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

/** LOAD_ORDER（index.js 里声明）——「必须先有谁」的唯一真源。 */
function loadOrderSrc(src) {
  const s = src !== undefined ? src : fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  const m = s.match(/LOAD_ORDER\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return null;
  return (m[1].match(/'([^']+\.js)'/g) || []).map(function (q) { return q.slice(1, -1); });
}

function loadOrder(opt) {
  return loadOrderSrc((opt || {}).indexSrc);
}

/** 运行时实测账本。缺账本返回 null（此时交叉验证面整体不可用，读数必须显式报出）。 */
function readLedger(opt) {
  const d = opt || {};
  if (d.runtime) return d.runtime;
  if (d.ledger === null) return null;
  const raw = d.ledgerText !== undefined ? d.ledgerText : safeRead(LEDGER);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/** 有向图环检测（DFS + 三色）。返回环路径数组或 null。 */
function acyclic(nodes, edges) {
  const adj = {};
  edges.forEach(function (e) { (adj[e.from] = adj[e.from] || []).push(e.to); });
  const color = {};
  const stack = [];
  let found = null;
  function visit(n) {
    color[n] = 1; stack.push(n);
    const outs = adj[n] || [];
    for (let i = 0; i < outs.length; i++) {
      const t = outs[i];
      if (found) break;
      if (color[t] === 1) { found = stack.slice(stack.indexOf(t)).concat([t]); return; }
      if (!color[t]) visit(t);
    }
    stack.pop(); color[n] = 2;
  }
  nodes.forEach(function (n) { if (!found && !color[n]) visit(n); });
  return found;
}

/**
 * 静态建图。返回 files / aliasOf / refs / nsOwner / providerLine / edges / coverage / order。
 * edges 项：{ from, to, ns, kind: 'load' | 'call', owners, refUnseen?, ownerMismatch? }
 */
function scan(opt) {
  const d = opt || {};
  const read = d.read || function (rel) { return safeRead(path.join(BASE, rel)) || ''; };
  const files = d.files || productFiles();
  const order = loadOrder(d) || [];
  const orderIdx = {};
  order.forEach(function (r, i) { orderIdx[r] = i; });

  const aliasOf = {};
  const refs = {};
  const nsOwner = {};
  const providerLine = {};
  const edgeMap = {};
  let aliasFiles = 0, refFiles = 0;

  files.forEach(function (rel) {
    const src = stripComments(read(rel));
    const am = src.match(ALIAS_RE);
    const A = am ? am[1] : null;
    aliasOf[rel] = A;
    if (!A) { refs[rel] = []; return; }
    aliasFiles++;
    const esc = A.replace(/\$/g, '\\$');
    const reAny = new RegExp('(?:^|[^A-Za-z0-9_$])' + esc + '\\.([A-Za-z_$][A-Za-z0-9_$]*)', 'g');
    const own = new Set();
    const use = new Set();
    let m;
    while ((m = reAny.exec(src)) !== null) {
      const ns = m[1];
      if (!ns) continue;
      const after = src.slice(m.index + m[0].length);
      if (/^\s*=(?!=)/.test(after)) {
        own.add(ns);
        const ln = src.slice(0, m.index).split('\n').length;
        if (providerLine[ns] === undefined) providerLine[ns] = {};
        if (providerLine[ns][rel] === undefined) providerLine[ns][rel] = ln;
      } else {
        use.add(ns);
      }
      if (m.index === reAny.lastIndex) reAny.lastIndex++;
    }
    refs[rel] = Array.from(use).sort();
    if (refs[rel].length) refFiles++;
    Array.from(own).sort().forEach(function (ns) { (nsOwner[ns] = nsOwner[ns] || []).push(rel); });
  });

  // 提供方次序：按 LOAD_ORDER 先后（不在装载序的排最后，不参与运行期顶替）
  Object.keys(nsOwner).forEach(function (ns) {
    nsOwner[ns].sort(function (a, b) {
      const ia = orderIdx[a] === undefined ? 1e9 : orderIdx[a];
      const ib = orderIdx[b] === undefined ? 1e9 : orderIdx[b];
      return ia - ib;
    });
  });

  // 边：静态引用 → 归属到提供方；「装载期 vs 调用期」由运行期账本定案
  const led = readLedger(d);
  const mods = led && led.modules ? led.modules : null;
  let runtimeMissing = 0;
  Object.keys(refs).forEach(function (rel) {
    const entry = mods ? mods[rel] : null;
    const reqNs = {};
    if (entry && Array.isArray(entry.requires)) {
      entry.requires.forEach(function (ns, i) {
        const to = (entry.requiresFiles || [])[i];
        if (to) reqNs[ns] = to;
      });
    } else if (mods && !entry) {
      runtimeMissing++;
    }
    refs[rel].forEach(function (ns) {
      const owners = (nsOwner[ns] || []).filter(function (o) { return o !== rel; });
      if (!owners.length) return;
      const isLoad = Object.prototype.hasOwnProperty.call(reqNs, ns);
      const to = isLoad ? reqNs[ns] : owners[0];
      const e = { from: rel, to: to, ns: ns, kind: isLoad ? 'load' : 'call', owners: owners.slice() };
      if (isLoad && owners.indexOf(to) < 0) e.ownerMismatch = true;
      edgeMap[rel + '\u0000' + ns] = e;
    });
    // 运行期定案了、静态面却扫不出来的装载期边（= 静态扫描器瞎了）
    Object.keys(reqNs).forEach(function (ns) {
      const key = rel + '\u0000' + ns;
      if (!edgeMap[key]) {
        edgeMap[key] = { from: rel, to: reqNs[ns], ns: ns, kind: 'load',
          owners: [reqNs[ns]], refUnseen: true };
      }
    });
  });
  if (mods) {
    Object.keys(mods).forEach(function (rel) {
      if (refs[rel] !== undefined) return;
      const e = mods[rel];
      if (!e || !Array.isArray(e.requires)) return;
      e.requires.forEach(function (ns, i) {
        const to = (e.requiresFiles || [])[i];
        if (!to) return;
        edgeMap[rel + '\u0000' + ns] = { from: rel, to: to, ns: ns, kind: 'load',
          owners: [to], refUnseen: true };
      });
    });
  }

  const edges = Object.keys(edgeMap).sort().map(function (k) { return edgeMap[k]; });
  const multiProvider = Object.keys(nsOwner).filter(function (ns) { return nsOwner[ns].length > 1; })
    .map(function (ns) { return { ns: ns, providers: nsOwner[ns].slice() }; });
  const readNs = {};
  Object.keys(refs).forEach(function (rel) { refs[rel].forEach(function (ns) { readNs[ns] = true; }); });

  return {
    files: files, aliasOf: aliasOf, refs: refs, nsOwner: nsOwner, providerLine: providerLine,
    multiProvider: multiProvider, edges: edges, order: order, orderIdx: orderIdx,
    coverage: { productFiles: files.length, aliasFiles: aliasFiles, refFiles: refFiles,
      nsProvided: Object.keys(nsOwner).length, nsRead: Object.keys(readNs).length,
      runtimeMissing: runtimeMissing }
  };
}

/** 判据 + 双向交叉验证。opt.read / opt.indexSrc / opt.runtime / opt.ledgerText / opt.files 可注入 */
function audit(opt) {
  const d = opt || {};
  const g = scan(d);
  const idx = g.orderIdx;
  const extNames = Object.keys(EXTERNAL);
  const isExternal = function (ns) {
    if (Object.prototype.hasOwnProperty.call(EXTERNAL, ns)) return true;
    return EXTERNAL_PREFIX.some(function (p) { return ns.indexOf(p) === 0; });
  };
  const isEntry = function (ns) { return Object.prototype.hasOwnProperty.call(ENTRY_NS, ns); };
  const isUi = function (ns) { return Object.prototype.hasOwnProperty.call(UI_NS, ns); };

  const readAll = {};
  Object.keys(g.refs).forEach(function (rel) {
    g.refs[rel].forEach(function (ns) { (readAll[ns] = readAll[ns] || []).push(rel); });
  });

  // ① 读了无人提供的 ns（入口 / UI / 外名须显式登记）
  const unprovided = Object.keys(readAll).sort().filter(function (ns) {
    return !g.nsOwner[ns] && !isEntry(ns) && !isUi(ns) && !isExternal(ns);
  }).map(function (ns) { return { ns: ns, files: readAll[ns].slice(0, 4) }; });

  // ⑤ 过期登记（登记了但全仓无人读 = 静默掩盖面）
  const regTable = { entry: ENTRY_NS, ui: UI_NS, external: EXTERNAL, self: SELF_REF_NS, shared: CONTRACT_NS };
  const staleRegistration = [];
  Object.keys(regTable).forEach(function (kind) {
    Object.keys(regTable[kind]).forEach(function (ns) {
      if (kind === 'ui' || kind === 'external') {
        if (!readAll[ns]) staleRegistration.push({ ns: ns, kind: kind, reason: regTable[kind][ns] });
      }
    });
  });
  const registered = Object.keys(ENTRY_NS).concat(Object.keys(UI_NS)).concat(extNames);
  const registeredUsed = registered.filter(function (ns) { return !!readAll[ns]; }).length;

  const loadEdges = g.edges.filter(function (e) { return e.kind === 'load'; });
  const callEdges = g.edges.filter(function (e) { return e.kind === 'call'; });

  // ② 装载期次序违规：供者的装载下标 > 消费方 =「供的人后装」
  const orderViolation = [];
  loadEdges.forEach(function (e) {
    const ci = idx[e.from], pi = idx[e.to];
    if (ci === undefined || pi === undefined) return;
    if (pi > ci) orderViolation.push({ from: e.from, to: e.to, ns: e.ns, fromIdx: ci, toIdx: pi });
  });

  // ⑦ 静态漏扫 / 归属错配
  const unreflected = loadEdges.filter(function (e) { return e.refUnseen; })
    .map(function (e) { return { from: e.from, to: e.to, ns: e.ns }; });
  const ownerMismatch = loadEdges.filter(function (e) { return e.ownerMismatch; })
    .map(function (e) { return { from: e.from, to: e.to, ns: e.ns, owners: e.owners }; });

  // ③ 跨文件写：同名 ns 被 ≥2 个文件赋值，且未登记为共享 / 自引用
  const crossFileWrite = g.multiProvider.filter(function (mp) {
    return !(mp.ns in CONTRACT_NS) && !(mp.ns in SELF_REF_NS) && !isEntry(mp.ns) &&
      !isUi(mp.ns) && !isExternal(mp.ns);
  }).map(function (mp) { return { ns: mp.ns, providers: mp.providers, at: g.providerLine[mp.ns] }; });

  // ④ dead-ns：模块提供了、产品源面零读（只报不红）
  const deadNs = Object.keys(g.nsOwner).filter(function (ns) { return !readAll[ns]; }).sort()
    .map(function (ns) { return { ns: ns, providers: g.nsOwner[ns].slice() }; });

  // 交叉验证：账本 requires 的定性
  const led = readLedger(d);
  const unidentified = [];
  const misattributed = [];
  if (led && led.modules) {
    Object.keys(led.modules).forEach(function (rel) {
      const e = led.modules[rel];
      if (!e || !Array.isArray(e.requires)) return;
      e.requires.forEach(function (ns, i) {
        const to = (e.requiresFiles || [])[i];
        if (!(ns in NS_FIELD_MAP)) unidentified.push({ from: rel, ns: ns, to: to || null });
        else if (to && to !== NS_FIELD_MAP[ns]) {
          misattributed.push({ from: rel, ns: ns, to: to, expected: NS_FIELD_MAP[ns] });
        }
      });
    });
  }

  // ⑥ ns 面差集（一对一无登记差即红）。账本不可用时**整面跳过**——不可用 ≠ 漂移，
  //   否则「账本读不到」会被报成 125 条漂移（把不可用伪装成缺陷，是本仓反复治理的那类病）。
  const ledNs = {};
  if (led && led.modules) {
    Object.keys(led.modules).forEach(function (rel) {
      (led.modules[rel].ns || []).forEach(function (ns) { if (ns.indexOf('__') !== 0) ledNs[ns] = rel; });
    });
  }
  const nsOnlyStatic = Object.keys(g.nsOwner).filter(function (ns) { return !ledNs[ns]; }).sort();
  const nsOnlyLedger = Object.keys(ledNs).filter(function (ns) { return !g.nsOwner[ns]; }).sort();
  const nsFaceDrift = !led ? [] : nsOnlyStatic.filter(function (ns) {
    if (NS_FACE_EXPECT.onlyStatic.indexOf(ns) >= 0) return false;
    if (NS_FACE_EXPECT.internalPrefixed.indexOf(ns) >= 0) return false;
    return true;
  }).map(function (ns) { return { ns: ns, side: 'static-only' }; })
    .concat(nsOnlyLedger.filter(function (ns) { return NS_FACE_EXPECT.onlyLedger.indexOf(ns) < 0; })
      .map(function (ns) { return { ns: ns, side: 'ledger-only' }; }));

  // 环判定：load 边；以及 load 边 + 跨文件写的顶替序（供者在前 → 被顶替者在后）
  const cyc = acyclic(g.files.slice(), loadEdges.slice());
  const writeBack = crossFileWrite.map(function (c) {
    const inOrder = c.providers.filter(function (p) { return idx[p] !== undefined; })
      .sort(function (a, b) { return idx[a] - idx[b]; });
    if (inOrder.length < 2) return null;
    return { from: inOrder[0], to: inOrder[1], ns: c.ns };
  }).filter(Boolean);
  const cyc2 = acyclic(g.files.slice(), loadEdges.concat(writeBack));

  // 交叉验证：不在装载序的悬空文件 / 装载期边的提供方不在装载序
  const notInOrder = g.files.filter(function (rel) {
    if (rel === 'index.js') return false;
    if (rel.indexOf('ui/') === 0) return false;
    return idx[rel] === undefined;
  });
  const unknownProvider = loadEdges.filter(function (e) { return idx[e.to] === undefined; })
    .map(function (e) { return { from: e.from, to: e.to, ns: e.ns }; });

  const problems = unprovided.length + orderViolation.length + crossFileWrite.length +
    staleRegistration.length + unreflected.length + ownerMismatch.length +
    nsFaceDrift.length + misattributed.length;

  return {
    files: g.files.length, aliasFiles: g.coverage.aliasFiles, refFiles: g.coverage.refFiles,
    nsProvided: g.coverage.nsProvided, nsRead: g.coverage.nsRead,
    nsLedger: Object.keys(ledNs).length,
    edgesLoad: loadEdges.length, edgesCall: callEdges.length, edgesAll: g.edges.length,
    orderLen: g.order.length, runtimeMissing: g.coverage.runtimeMissing,
    ledgerAvailable: !!led,
    unprovided: unprovided, orderViolation: orderViolation, crossFileWrite: crossFileWrite,
    staleRegistration: staleRegistration, unreflected: unreflected, ownerMismatch: ownerMismatch,
    nsFaceDrift: nsFaceDrift, misattributed: misattributed, deadNs: deadNs,
    unidentified: unidentified, nsOnlyStatic: nsOnlyStatic, nsOnlyLedger: nsOnlyLedger,
    registeredUsed: registeredUsed, registeredTotal: registered.length,
    notInOrder: notInOrder, unknownProvider: unknownProvider,
    cycle: cyc, cycleWithProv: cyc2,
    identityOk: g.edges.length === loadEdges.length + callEdges.length &&
      g.coverage.nsProvided === Object.keys(g.nsOwner).length,
    providers: g.nsOwner, graph: g,
    // 恒真保护：提供方集合为空 / 别名面为零 ⇒ 扫描器自己瞎了，不许判绿
    scanAlive: g.coverage.nsProvided > 0 && g.coverage.aliasFiles > 0 && loadEdges.length > 0,
    problems: problems,
    ok: problems === 0 && !notInOrder.length && !cyc && !cyc2 &&
      g.coverage.nsProvided > 0 && g.coverage.aliasFiles > 0 && loadEdges.length > 0
  };
}

function summary(opt) {
  const r = audit(opt);
  return '静态图：文件 ' + r.files + '（解析出别名 ' + r.aliasFiles + ' / 真引用他模块 ' + r.refFiles + '）'
    + ' · 提供方 ' + r.nsProvided + '（账本 ' + r.nsLedger + '） · 读面 ' + r.nsRead
    + ' · 边 ' + r.edgesAll + '（装载期 ' + r.edgesLoad + ' / 调用期 ' + r.edgesCall + '）'
    + ' · LOAD_ORDER ' + r.orderLen
    + ' · 未提供 ' + r.unprovided.length + ' · 次序违规 ' + r.orderViolation.length
    + ' · 跨文件写 ' + r.crossFileWrite.length + ' · 过期登记 ' + r.staleRegistration.length
    + ' · 静态漏扫 ' + r.unreflected.length + ' · 归属错配 ' + r.ownerMismatch.length
    + ' · ns 面漂移 ' + r.nsFaceDrift.length + ' · 零读 ns ' + r.deadNs.length
    + ' · 账本未定性 ' + r.unidentified.length
    + ' · 不在装载序 ' + r.notInOrder.length
    + ' · 环 ' + (r.cycle ? '有' : '无') + ' · 恒等式 ' + (r.identityOk ? '平' : '不平');
}

module.exports = {
  scan: scan, audit: audit, summary: summary, loadOrder: loadOrder, loadOrderSrc: loadOrderSrc,
  productFiles: productFiles, acyclic: acyclic, readLedger: readLedger,
  EXTERNAL: EXTERNAL, ENTRY_NS: ENTRY_NS, UI_NS: UI_NS, CONTRACT_NS: CONTRACT_NS,
  SELF_REF_NS: SELF_REF_NS, NS_FACE_EXPECT: NS_FACE_EXPECT, ALIAS_HOST_NS: ALIAS_HOST_NS,
  EXTERNAL_PREFIX: EXTERNAL_PREFIX, NS_FIELD_MAP: NS_FIELD_MAP, ALIAS_RE: ALIAS_RE, LEDGER: LEDGER
};

if (require.main === module) {
  const r = audit();
  console.log('■ 模块依赖静态图门禁（计划一 #20）');
  console.log('  ' + summary());
  console.log('  覆盖率：别名 ' + r.aliasFiles + '/' + r.files + ' · 有引用 ' + r.refFiles + '/' + r.aliasFiles
    + ' · 登记在用 ' + r.registeredUsed + '/' + r.registeredTotal
    + ' · 账本 ' + (r.ledgerAvailable ? '可用' : '缺失') + ' · 账本缺项文件 ' + r.runtimeMissing);
  if (!r.scanAlive) console.log('  ✗ 扫描面为空或全盲（恒真保护：不许在这种状态下判绿）');
  if (r.unprovided.length) {
    console.log('  ✗ 未提供（读了无人提供、且未登记为入口/UI/外名的命名空间）:');
    r.unprovided.slice(0, 20).forEach(function (u) { console.log('      · ' + u.ns + '  ← ' + u.files.join('、')); });
  }
  if (r.orderViolation.length) {
    console.log('  ✗ 装载期次序违规（供的人后装）:');
    r.orderViolation.slice(0, 20).forEach(function (e) {
      console.log('      · ' + e.from + '(' + e.fromIdx + ') → ' + e.to + '(' + e.toIdx + ')（' + e.ns + '）');
    });
  }
  if (r.crossFileWrite.length) {
    console.log('  ✗ 跨文件写（同名 ns 多文件赋值、未登记共享/自引用）:');
    r.crossFileWrite.forEach(function (c) {
      console.log('      · ' + c.ns + ' ← ' + c.providers.map(function (p) {
        return p + '@' + ((c.at && c.at[p]) || '?');
      }).join(' → '));
    });
  }
  if (r.staleRegistration.length) {
    console.log('  ✗ 过期登记（登记了但全仓无人读，会静默掩盖未提供）:');
    r.staleRegistration.forEach(function (s) {
      console.log('      · ' + s.ns + '（' + s.kind + '：' + s.reason + '）');
    });
  }
  if (r.unreflected.length) {
    console.log('  ✗ 静态漏扫（运行期定案的装载期边，静态面扫不出来）:');
    r.unreflected.forEach(function (e) { console.log('      · ' + e.from + ' → ' + e.to + '（' + e.ns + '）'); });
  }
  if (r.ownerMismatch.length) {
    console.log('  ✗ 归属错配（账本指向的文件并不提供该 ns）:');
    r.ownerMismatch.forEach(function (e) {
      console.log('      · ' + e.from + ' → ' + e.to + '（' + e.ns + '，提供方 ' + e.owners.join('、') + '）');
    });
  }
  if (r.nsFaceDrift.length) {
    console.log('  ✗ ns 面漂移（未登记的一对一差）:');
    r.nsFaceDrift.forEach(function (x) { console.log('      · ' + x.ns + '（' + x.side + '）'); });
  }
  if (r.misattributed.length) {
    console.log('  ✗ requiresFiles 归属与 NS_FIELD_MAP 不符:');
    r.misattributed.forEach(function (m) {
      console.log('      · ' + m.from + ' 的 ' + m.ns + ' 指向 ' + m.to + '（登记为 ' + m.expected + '）');
    });
  }
  if (r.unidentified.length) {
    console.log('  · 账本 requires 未定性（NS_FIELD_MAP 未登记，按读数报出）: '
      + r.unidentified.map(function (u) { return u.ns + '@' + u.from; }).join('、'));
  }
  if (r.deadNs.length) {
    console.log('  · 零读 ns（模块提供了但产品源面无人读，消费者可能是 tests/宿主，只报不红）: '
      + r.deadNs.map(function (x) { return x.ns; }).join('、'));
  }
  if (r.unknownProvider.length) {
    console.log('  ✗ 装载期边的提供方不在装载序:');
    r.unknownProvider.forEach(function (e) { console.log('      · ' + e.from + ' → ' + e.to + '（' + e.ns + '）'); });
  }
  if (r.notInOrder.length) console.log('  ✗ 不在装载序（源码存在但从未被装载）: ' + r.notInOrder.join('、'));
  if (r.cycle || r.cycleWithProv) console.log('  ✗ 环: ' + JSON.stringify(r.cycle || r.cycleWithProv));
  if (r.ok) {
    console.log('  ✓ 无未提供、无次序违规、无跨文件写、无过期登记、无漏扫、无归属错配、'
      + '无 ns 面漂移、无悬空文件、无环');
  }
  process.exit(r.ok ? 0 : 1);
}