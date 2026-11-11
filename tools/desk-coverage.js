#!/usr/bin/env node
'use strict';
/**
 * WorldAxis tools/desk-coverage.js — ActionDesk 路由覆盖治理（计划 OPV22-2）
 *
 * ── 它治的病（G2）────────────────────────────────────────────────────────
 * 「这个引擎能不能被玩家/叙事调度」此前只能靠人读 engines/action-desk.js 里
 * 那份 700 行的 ROUTES 表，或者靠猜。于是出现四种自欺：
 *   ① 用「路由数 / 引擎数」当覆盖率 —— 纯读面本就不该有玩家路由，
 *      这个比值没有治理意义；
 *   ② 用路由键前缀当模块名 —— `finance.triggerRunOnBank` 调的是
 *      WA.financialContagion，`schedule.claim` 调的是 WA.laborSchedule。
 *      前缀只是逻辑分组，不是命名空间；
 *   ③ 只认 ROUTES 表 —— 漏掉 writeDesk.call 这条**通用透传入口**
 *      （action-desk.js:196 一条路由扇出到 write-desk.js 的 DESK 名单）；
 *   ④ 用动词名猜写口 —— `upcoming` / `places` / `bounds` / `tension`
 *      这些名字里没有 get/list/view，但方法体里也没有 transact。
 *      按名字判会把 110 个纯读面误算成「有入口」。
 *
 * 唯一问得出口的问题是：
 *   「这个引擎会改动世界状态，而玩家/叙事却没有任何一条路能触发它，
 *     那它凭什么存在？」
 *
 * ── 判据的核心：入口必须是**写口**，写口由方法体判定 ────────────────────
 *   一个方法是不是写口，不看它叫什么，看它**方法体里有没有 transact**。
 *   实测对照（tools/desk-coverage.js 的负控制用例）：
 *     agenda.upcoming      bodyLen=2933  transact=no   ← 读口
 *     atlas.places         bodyLen=1222  transact=no   ← 读口
 *     horizon.bounds       bodyLen=196   transact=no   ← 读口
 *     factionGraph.tension bodyLen=1103  transact=no   ← 读口
 *     collab.open          bodyLen=1562  transact=YES  ← 真写口
 *     collab.claim         bodyLen=1243  transact=YES  ← 真写口
 *
 * ── 入口面（三条，任一命中即 routable）────────────────────────────────────
 *   R1  action-desk.ROUTES 路由体里 `WA.<ns>.<m>(`，且 m 是写口
 *   R2  action-desk.ROUTES 的 `writeDesk.call` 路由 + write-desk.DESK 名单里
 *       至少一个上台面方法在该 ns 里是写口
 *       （**必须**同时满足：ui/ 有真实 `writeDesk.call(` 消费点。
 *         driver-ledger.js:527 原话：「Catalog alone is not an entrance」）
 *   R3  ui/ 面板里对该 ns 的写口调用（`WA.<ns>.<m>(`，且 m 是写口）
 *
 * ── 五档判据（闭合集合，恒等式必须成立）──────────────────────────────────
 *   routable      至少一条入口面命中
 *   wired         无入口面，但有其他产品代码入站调用（叙事/总线驱动，合法）
 *   readonlyOnly  无入口面、无世界写盘、零入站（纯读面，合法）
 *   orphan        有世界写盘、零入口、零入站  ← 唯一该红的一档
 *   noNs          命名空间扫描盲区（无法判定归属）
 *
 *   恒等式：routable + wired + readonlyOnly + orphan + noNs === total
 *
 * ── 为什么「有登记」不算 routable，但要单独报 ──────────────────────────────
 *   l3-registry（28 台四类裁决）、push-api-registry（19 条死面裁决）
 *   是仓库已有的「为什么没有玩家路由」声明面。它们**不构成入口**
 *   （声明≠可点），但能让 orphan 的追问有个落点：
 *   orphan 里凡已被裁决过的，是「已知且已裁决」；没被裁决过的才是真缺口。
 *   故本工具把登记情况作为 orphan 的子标注，而不是新开一档 ——
 *   新开一档会让「已裁决」与「有入口」同形，那正是 V6/V7 反复拒绝的合并。
 *
 * ── 实测踩过的坑（勿回退）────────────────────────────────────────────────
 *   · `const memory = WA.memory = {` 这种「先赋局部再挂载」写法，
 *     用行首锚定的 /^\s*WA\.X = \{/ 会漏识别 → memory/proactive 读成 null。
 *   · `WA.__agencyStepShapeWarn = {` 是内部探针变量，不是引擎命名空间。
 *   · 写盘有两种形态：`WA.store.transact(` 与解构后的裸 `transact(`。
 *     只认前者会造成 orphan 假阴性。
 *   · 入站扫描面**必须**覆盖全产品代码（engines/core/ui/render/actors/
 *     direction/compat + index.js）。只扫 engines/ 会把 beatReport 这类
 *     「被 render/inject.js 调用」的引擎误判成零入站。
 *   · ROUTES 表里有 41 个重复键（705 条 → 664 唯一）。JS 对象字面量后键
 *     覆盖前键 ⇒ 前一份是死代码。本工具按**唯一键**统计，重复单独报。
 *
 * 用法：
 *   node tools/desk-coverage.js            # 五档读数 + 明细
 *   node tools/desk-coverage.js --check    # 恒等式破 or 有未裁决 orphan ⇒ exit 1
 *   node tools/desk-coverage.js --json     # 机器可读
 *   node tools/desk-coverage.js --orphans  # 只列 orphan
 *   node tools/desk-coverage.js --dupes    # 只列 ROUTES 重复键（死代码）
 *   node tools/desk-coverage.js --breakdown# routable 的入口面构成
 *   node tools/desk-coverage.js --tiers    # 每台引擎的分档与命中的入口面（可诊断）
 *                                          #   --tiers=wired 只看某一档
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENGINES_DIR = path.join(ROOT, 'engines');

/** 产品代码扫描面：不含 tests/ 与 tools/ —— 测试里的调用不是入口，那是判据在自证。 */
const PRODUCT_DIRS = ['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat'];

/* ─────────────────────────── 词法辅助 ─────────────────────────── */

/** 从 src[openIdx] 的 `{` 起做括号配平，跳过字符串与注释，返回匹配的 `}` 下标。 */
function matchBrace(src, openIdx) {
  let depth = 0;
  let i = openIdx;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? n : nl + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      i += 1;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return -1;
}

/** 抽出 src 中所有 `WA.<ns>` / `WA.engines.<ns>` 引用名。 */
function waRefsIn(src) {
  const out = new Set();
  const re = /\bWA\.(?:engines\.)?([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const ns = m[1];
    if (ns.startsWith('__')) continue;
    if (ns === 'engines' || ns === 'store' || ns === 'config' || ns === 'log') continue;
    out.add(ns);
  }
  return out;
}

/**
 * 剥离注释，保留字符串字面量原样。
 * 目的：注释里写 `WA.foo` 不算入站；但字符串里的 `WA.foo` 也不算——
 * 只是剥字符串会把代码结构打散，所以这里只剥注释。
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      out += src[i];
      i += 1;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * 判断 `src` 是否**真实调用**了 `ns` 的某个方法（入站判据的唯一口径）。
 *
 * 为什么不能用「名字出现过」：注释提及、表驱动字符串键、清单数组的一行
 * 都会命中裸名字，却零运行期调用 —— 足以把真死面从 orphan 洗进 wired。
 *
 * 为什么不能只认直接调用：本仓 `ui/panel.js:3614` 的写法是
 *     const rg = WA.replyGuard;
 *     ... rg.diagnose() ...
 * 只认 `WA.replyGuard.diagnose(` 会把这条真实入站判成零入站。
 *
 * 故口径 = 直接调用 ∪ 别名绑定后调用。两向都要求紧跟 `(`，
 * 取属性（`WA.ns.ver`）不算调用。
 */
function waCalledIn(src, ns) {
  if (!src || !ns) return false;
  const code = stripComments(src);
  const base = '\\bWA\\.(?:engines\\.)?' + ns + '\\b';
  return waCalledInStripped(
    code,
    new RegExp(base + '\\s*\\.\\s*[A-Za-z0-9_$]+\\s*\\('),
    new RegExp('([A-Za-z0-9_$]{2,})\\s*=\\s*' + base + '\\s*(?:;|\\n|\\}|$)', 'g'),
  );
}

/**
 * `waCalledIn` 的快路径：调用方已剥好注释、并预编译好两条正则。
 * 批量扫描（391 引擎 × 上千文件）时必须走这条，否则每次调用都要
 * 重剥一遍注释 + 重构造 RegExp —— 实测那会把 scan 拖到 89s。
 */
function waCalledInStripped(code, directRe, bindRe) {
  if (!code) return false;
  // ① 直接调用
  if (directRe.test(code)) return true;
  // ② 别名绑定后调用
  bindRe.lastIndex = 0;
  let bm;
  while ((bm = bindRe.exec(code)) !== null) {
    const alias = bm[1];
    if (new RegExp('\\b' + alias + '\\s*\\.\\s*[A-Za-z0-9_$]+\\s*\\(').test(code)) return true;
  }
  return false;
}

/** 抽出 src 中所有 `WA.<ns>.<method>(` 的 ns→methods 映射。 */
function callsIn(src) {
  const out = new Map();
  const re = /\bWA\.(?:engines\.)?([A-Za-z_$][A-Za-z0-9_$]*)\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const ns = m[1];
    const method = m[2];
    if (ns.startsWith('__')) continue;
    if (!out.has(ns)) out.set(ns, new Set());
    out.get(ns).add(method);
  }
  return out;
}

/**
 * 找方法定义体。支持四种写法（均已实测命中）：
 *   function name(...) { }
 *   name: function (...) { }
 *   const name = function (...) { }
 *   name(...) { }            ← 方法简写
 */
function methodBodyOf(src, name) {
  const esc = name.replace(/\$/g, '\\$');
  const pats = [
    new RegExp('function\\s+' + esc + '\\s*\\(', 'g'),
    new RegExp('[\\s,{]' + esc + '\\s*:\\s*(?:async\\s+)?function\\b', 'g'),
    new RegExp('[\\s,{](?:const|let|var)\\s+' + esc + '\\s*=\\s*(?:async\\s+)?function\\b', 'g'),
    new RegExp('[\\s,{]' + esc + '\\s*\\([^)]*\\)\\s*\\{', 'g'),
  ];
  for (const re of pats) {
    re.lastIndex = 0;
    const mm = re.exec(src);
    if (!mm) continue;
    // ⚠ 括号定位必须用 `mm.index` 重新找，不能用 `mm.index + mm[0].length - 1`。
    //   后者对第 4 条模式（`bounds() {`）会落在匹配串**末尾的 `{`** 上，
    //   于是 indexOf('(') 找到的是**下一个函数**的左括号 —— 把别人的方法体当成本方法体。
    //   实测事故：engines/regional.js 的 `bounds() { return WA.settingsBus.boundsOf(...) }`
    //   是纯读口，却因错位取到了紧随其后的 `roll()` 的方法体（内含 transact），
    //   被判成写口 ⇒ 该引擎凭 R3 进了 routable。同类错位在 human-realism.js 也有。
    const parenIdx = src.indexOf('(', mm.index);
    if (parenIdx < 0) continue;
    let j = parenIdx;
    let d = 0;
    while (j < src.length) {
      if (src[j] === '(') d += 1;
      else if (src[j] === ')') { d -= 1; if (d === 0) break; }
      j += 1;
    }
    const bo = src.indexOf('{', j);
    if (bo < 0) continue;
    const bc = matchBrace(src, bo);
    if (bc < 0) continue;
    return src.slice(bo, bc + 1);
  }
  return null;
}
/**
 * 方法是否写口：不看方法名，看它**能否到达 transact**。
 *
 * 实测为什么不能只看「方法体里有没有 transact」：
 *   act.add              bodyLen=3823  transact=no   ← 但它调 commit() 间接写盘
 *   actionMethods.execute bodyLen=3896  transact=no   ← 同上
 *   autoHide.plan        bodyLen=867   transact=no   ← 同上
 * 这些名字看起来是写口、行为也是写口，只是把 transact 藏在同文件的内部辅助函数里。
 * 所以判据必须是**传递闭包**：方法体里调用的同文件函数，只要有任何一个能到达
 * transact，这个方法就是写口。
 *
 * 对照组（真读口）：
 *   agenda.upcoming / atlas.places / horizon.bounds / factionGraph.tension
 *   它们的方法体与传递闭包里都没有 transact。
 */
function makeWriteJudge(engineSrc) {
  // 预抽所有函数定义体：name -> body
  //   五种写法都要认，缺一种就会出现 judge=null 的盲区：
  //     ① function name(...) { }
  //     ② name: function (...) { }
  //     ③ const name = function (...) { }
  //     ④ name(...) { }        对象内方法简写（WA.xxx = { schedule(name, at) { ... } }）
  //     ⑤ async name(...) { }  带 async 的方法简写
  //
  //   ⚠ ④ 这条模式必须排掉控制流关键字。实测 engines/action-desk.js（222KB）：
  //     该模式命中 1022 处，其中 982 处是 `if (` / `catch (` / `function (` ——
  //     它们同样满足「标识符 + 括号 + 花括号」的形状。若不排掉，defs 会装进
  //     近千条假条目，而每条假条目都要跑一次括号配平（最坏扫到文件尾），
  //     整份 scan 从「可接受」退化到 3 分 13 秒。真实方法定义只有 40 个。
  const RESERVED = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'do', 'else', 'return', 'typeof', 'function',
    'new', 'delete', 'void', 'in', 'of', 'instanceof', 'with', 'try', 'finally', 'throw',
    'case', 'default', 'break', 'continue', 'yield', 'await', 'async', 'super', 'this', 'let',
    'const', 'var', 'class', 'extends', 'import', 'export',
  ]);
  const defs = new Map();
  const defPats = [
    /function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
    /([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*(?:async\s+)?function\b/g,
    /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?function\b/g,
    /(?:^|[\s,{])(?:async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/gm,
  ];
  for (const re of defPats) {
    re.lastIndex = 0;
    let mm;
    while ((mm = re.exec(engineSrc)) !== null) {
      const name = mm[1];
      if (RESERVED.has(name)) continue;
      if (defs.has(name)) continue;
      // 同 methodBodyOf：括号必须从 mm.index 找，不能用匹配串末尾偏移。
      const parenIdx = engineSrc.indexOf('(', mm.index);
      if (parenIdx < 0) continue;
      let j = parenIdx;
      let d = 0;
      while (j < engineSrc.length) {
        if (engineSrc[j] === '(') d += 1;
        else if (engineSrc[j] === ')') { d -= 1; if (d === 0) break; }
        j += 1;
      }
      const bo = engineSrc.indexOf('{', j);
      if (bo < 0) continue;
      const bc = matchBrace(engineSrc, bo);
      if (bc < 0) continue;
      defs.set(name, engineSrc.slice(bo, bc + 1));
    }
  }

  const verdict = new Map();   // name -> bool
  const visiting = new Set();

  /** 方法体能否（直接或经同文件函数）到达 transact */
  function canReach(body) {
    if (/transact\s*\(/.test(body)) return true;
    // 抽出 body 里所有被调用的标识符 name(
    const callRe = /(?:^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    let cm;
    const seen = new Set();
    while ((cm = callRe.exec(body)) !== null) {
      const callee = cm[1];
      if (seen.has(callee)) continue;
      seen.add(callee);
      if (verdict.has(callee)) {
        if (verdict.get(callee)) return true;
        continue;
      }
      if (!defs.has(callee)) continue;
      if (visiting.has(callee)) continue;   // 防环
      visiting.add(callee);
      const v = canReach(defs.get(callee));
      visiting.delete(callee);
      verdict.set(callee, v);
      if (v) return true;
    }
    return false;
  }

  return function judge(name) {
    if (verdict.has(name)) return verdict.get(name);
    if (!defs.has(name)) {
      // 方法简写形态（name(...) { }）不在 defs 里，单独找
      const body = methodBodyOf(engineSrc, name);
      if (body === null) return null;
      const v = canReach(body);
      verdict.set(name, v);
      return v;
    }
    visiting.add(name);
    const v = canReach(defs.get(name));
    visiting.delete(name);
    verdict.set(name, v);
    return v;
  };
}

/** 单方法一次性判定（供外部调用/测试用，不建缓存）。 */
function isWriteMethod(engineSrc, name) {
  return makeWriteJudge(engineSrc)(name);
}

/* ─────────────────────────── 命名空间识别 ─────────────────────────── */

const NS_PATTERNS = [
  // ① WA.engines.<ns> = ...  —— 必须排在裸 WA.<ns> 之前，否则会把 'engines' 当命名空间
  /(?:^|[^\w$.])WA\.engines\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm,
  // ② const x = WA.<ns> = ...  —— 先赋局部再挂载
  /(?:^|[^\w$.])(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*WA\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm,
  // ③ WA.<ns> = ...  —— 顶层直挂。前面不能跟 '.'，且排除 engines/store 等容器
  /(?:^|[^\w$.])WA\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm,
  // ④ namespace: 'x' / module: 'x'  —— 设置面自报
  /(?:^|[\s,{])namespace\s*:\s*['"]([A-Za-z_$][A-Za-z0-9_$]*)['"]/gm,
  /(?:^|[\s,{])module\s*:\s*['"]([A-Za-z_$][A-Za-z0-9_$]*)['"]/gm,
];

/** 不是引擎命名空间的容器/工具名。 */
const NON_NS = new Set([
  'engines', 'store', 'config', 'log', 'settings', 'settingsBus', 'ui', 'render',
  'workflow', 'registerModule', 'on', 'off', 'emit', 'util', 'utils', 'rand',
]);

function detectNamespaces(src) {
  const hits = [];
  for (const re of NS_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      const ns = m[1];
      if (!ns || ns.startsWith('__')) continue;
      if (NON_NS.has(ns)) continue;
      hits.push(ns);
    }
  }
  if (hits.length === 0) return null;
  const tally = new Map();
  for (const h of hits) tally.set(h, (tally.get(h) || 0) + 1);
  const sorted = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]);
  return sorted[0][0];
}

/** 世界写盘识别：两种形态，缺一会造成 orphan 假阴性。 */
function hasWrite(src) {
  if (/\bWA\.store\.transact\s*\(/.test(src)) return true;
  if (/(?:^|[^.\w$])transact\s*\(/m.test(src)) return true;
  return false;
}

/* ─────────────────────────── ROUTES 解析 ─────────────────────────── */

function parseRoutes(src) {
  const routes = [];
  const anchor = src.indexOf('const ROUTES = {');
  if (anchor < 0) throw new Error('ROUTES table not found in action-desk.js');
  const openIdx = src.indexOf('{', anchor);
  const closeIdx = matchBrace(src, openIdx);
  if (closeIdx < 0) throw new Error('ROUTES table brace not balanced');
  const table = src.slice(openIdx + 1, closeIdx);

  const keyRe = /(?:^|[\s,{])'([A-Za-z0-9_$.]+)'\s*:\s*(?:async\s+)?function\b/g;
  let m;
  while ((m = keyRe.exec(table)) !== null) {
    const key = m[1];
    let i = m.index + m[0].length;
    const parenIdx = table.indexOf('(', i);
    if (parenIdx < 0) continue;
    let depth = 0;
    let j = parenIdx;
    while (j < table.length) {
      if (table[j] === '(') depth += 1;
      else if (table[j] === ')') { depth -= 1; if (depth === 0) break; }
      j += 1;
    }
    const bodyOpen = table.indexOf('{', j);
    if (bodyOpen < 0) continue;
    const bodyClose = matchBrace(table, bodyOpen);
    if (bodyClose < 0) continue;
    routes.push({ key, body: table.slice(bodyOpen, bodyClose + 1) });
    keyRe.lastIndex = bodyClose;
  }
  return routes;
}

/** 重复键 = 死代码：JS 对象字面量后键覆盖前键。 */
function findDuplicateRouteKeys(routes) {
  const seen = new Map();
  for (const r of routes) {
    if (!seen.has(r.key)) seen.set(r.key, []);
    seen.get(r.key).push(r.body);
  }
  const dupes = [];
  for (const [key, bodies] of seen) {
    if (bodies.length > 1) dupes.push({ key, count: bodies.length });
  }
  dupes.sort((a, b) => a.key.localeCompare(b.key));
  return dupes;
}

/* ─────────────────────────── 登记面（不构成入口）─────────────────────────── */

/** l3-registry：28 台未驱动引擎的四类裁决。 */
function readL3Registry() {
  const file = path.join(ENGINES_DIR, 'l3-registry.js');
  if (!fs.existsSync(file)) return new Map();
  const src = fs.readFileSync(file, 'utf8');
  const out = new Map();
  const re = /engine:\s*'([A-Za-z0-9_]+)'\s*,\s*cls:\s*'([a-z-]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) out.set(m[1], 'l3:' + m[2]);
  return out;
}

/** push-api-registry：19 条推进类 API 的死面裁决。 */
/**
 * 读 tests/dead-export-ledger.json —— **方法级**死子面冻结账本。
 *
 * 这是本仓对「有产出路径但零消费者」的既有权威裁决面：
 * tests/dead-export-gate.js 以 `dead` / `uiDead` 两面冻结它，出现新条目即红灯，
 * 只能显式 --update 登记、或接上消费方、或删除。归因三码：test-only / self-only / unwired。
 *
 * 为什么 orphan 的裁决必须读它：
 *   本工具的 orphan 档是「有世界写盘 · 六面零入口 · 零产品入站」= 引擎级同形。
 *   账本是**方法级**，比引擎级更细。若某台 orphan 的全部写口方法都已在账本里判死，
 *   那它就不是「待裁决」，而是「已被裁决」—— 再往 l3-registry 里写一条只会制造第二真源。
 *   实测：binding(7) / calendarPlan(8) / narrativeDeduction(9) 三台全部命中，共 24 条。
 *
 * 返回 ns → { count, codes:Set, sample:string[] }
 */
function readDeadExportLedger() {
  const file = path.join(ROOT, 'tests', 'dead-export-ledger.json');
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return out; }
  for (const kind of ['dead', 'uiDead']) {
    const face = doc[kind] || {};
    for (const key of Object.keys(face)) {
      const ns = key.split('.')[0];
      const item = face[key] || {};
      if (!out.has(ns)) out.set(ns, { count: 0, codes: new Set(), sample: [] });
      const rec = out.get(ns);
      rec.count += 1;
      if (item.reason) rec.codes.add(item.reason);
      if (rec.sample.length < 3) rec.sample.push(key);
    }
  }
  return out;
}
function readPushApiRegistry() {
  const file = path.join(ENGINES_DIR, 'push-api-registry.js');
  if (!fs.existsSync(file)) return new Map();
  const src = fs.readFileSync(file, 'utf8');
  const out = new Map();
  const re = /api:\s*'([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)'\s*,\s*cls:\s*'([a-z]+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const ns = m[1];
    if (!out.has(ns)) out.set(ns, []);
    out.get(ns).push('push:' + m[2] + '/' + m[3]);
  }
  return out;
}

/** write-desk DESK 名单：ns → 上台面的写口名。 */
function readWriteDesk() {
  const file = path.join(ENGINES_DIR, 'write-desk.js');
  if (!fs.existsSync(file)) return new Map();
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('const DESK = {');
  if (start < 0) return new Map();
  const end = src.indexOf('};', start);
  const blk = src.slice(start, end < 0 ? src.length : end);
  const out = new Map();
  const re = /^\s{2,6}([A-Za-z0-9_]+):\s*\[([^\]]*)\]/gm;
  let m;
  while ((m = re.exec(blk)) !== null) {
    const ns = m[1];
    const methods = m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    out.set(ns, methods);
  }
  return out;
}

/* ─────────────────────────── 主扫描 ─────────────────────────── */

function readProductFiles() {
  const files = [];
  for (const dir of PRODUCT_DIRS) {
    const full = path.join(ROOT, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      if (!f.endsWith('.js')) continue;
      files.push({ rel: dir + '/' + f, abs: path.join(full, f), dir });
    }
  }
  const idx = path.join(ROOT, 'index.js');
  if (fs.existsSync(idx)) files.push({ rel: 'index.js', abs: idx, dir: '.' });
  return files;
}

function scan() {
  const productFiles = readProductFiles();
  const srcOf = new Map();
  for (const f of productFiles) srcOf.set(f.rel, fs.readFileSync(f.abs, 'utf8'));

  const engineFiles = productFiles.filter((f) => f.dir === 'engines').map((f) => f.rel);
  const deskSrc = srcOf.get('engines/action-desk.js');
  if (!deskSrc) throw new Error('engines/action-desk.js not readable');

  const routes = parseRoutes(deskSrc);
  const dupes = findDuplicateRouteKeys(routes);

  // ── 先建引擎记录：ns + 源码，供写口判定 ──
  const records = engineFiles.map((rel) => {
    const src = srcOf.get(rel);
    return {
      file: rel.replace(/^engines\//, ''),
      rel,
      src,
      ns: detectNamespaces(src),
      writes: hasWrite(src),
      inbound: 0,
      inboundFrom: [],
      entrances: [],
      verdict: null,
    };
  });

  /** ns → 引擎源码（写口判定用） */
  const srcByNs = new Map();
  for (const r of records) if (r.ns) srcByNs.set(r.ns, r.src);

  /** ns → 写口判定器（每引擎一个，内部带缓存） */
  const judgeByNs = new Map();
  function judgeOf(ns) {
    if (judgeByNs.has(ns)) return judgeByNs.get(ns);
    const src = srcByNs.get(ns);
    if (!src) { judgeByNs.set(ns, null); return null; }
    const j = makeWriteJudge(src);
    judgeByNs.set(ns, j);
    return j;
  }
  function isWrite(ns, method) {
    const j = judgeOf(ns);
    if (!j) return null;
    return j(method);
  }

  // ── R1：路由体 `WA.<ns>.<m>(`，且 m 是写口 ──
  //   注意：路由体常常不直接调 WA.ns，而是调 action-desk 自己的本地辅助函数
  //   （declareOpportunity / previewAction / chapterOpen / sceneFlow ...），
  //   由辅助函数再去调 WA.ns。只扫路由体本身会漏掉这层。
  //   实测：8 个 ns（actionMethods / survival / sceneNarrative / branchDiff /
  //   aftermathImpact / beatLedger / clock / chapters 的一部分）只能经辅助函数到达。
  const deskHelpers = new Map();   // helperName -> body
  (function collectHelpers() {
    const defPats = [
      /function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g,
      /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?function\b/g,
    ];
    for (const re of defPats) {
      re.lastIndex = 0;
      let mm;
      while ((mm = re.exec(deskSrc)) !== null) {
        const nm = mm[1];
        if (deskHelpers.has(nm)) continue;
        const b = methodBodyOf(deskSrc, nm);
        if (b) deskHelpers.set(nm, b);
      }
    }
  })();

  /** 把路由体展开：自身 + 它调用的本地辅助函数（一层足够，实测无更深） */
  function expandRouteBody(body) {
    const parts = [body];
    const callRe = /(?:^|[^.\w$])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    const seen = new Set();
    let cm;
    while ((cm = callRe.exec(body)) !== null) {
      const nm = cm[1];
      if (seen.has(nm)) continue;
      seen.add(nm);
      if (deskHelpers.has(nm)) parts.push(deskHelpers.get(nm));
    }
    return parts.join('\n');
  }

  const r1 = new Map();
  const r1ViaHelper = new Map();   // 经辅助函数才可达的，单独标记
  const routeReach = new Set();
  for (const rt of routes) {
    for (const ns of waRefsIn(rt.body)) routeReach.add(ns);
    const direct = callsIn(rt.body);
    const expanded = callsIn(expandRouteBody(rt.body));
    // 直接命中的
    for (const [ns, methods] of direct) {
      for (const mm of methods) {
        if (isWrite(ns, mm) === true) {
          if (!r1.has(ns)) r1.set(ns, new Set());
          r1.get(ns).add(mm);
        }
      }
    }
    // 经辅助函数命中的
    for (const [ns, methods] of expanded) {
      for (const mm of methods) {
        if (isWrite(ns, mm) === true) {
          if (!r1.has(ns)) r1.set(ns, new Set());
          if (!r1.get(ns).has(mm)) {
            r1.get(ns).add(mm);
            if (!r1ViaHelper.has(ns)) r1ViaHelper.set(ns, new Set());
            r1ViaHelper.get(ns).add(mm);
          }
        }
      }
    }
  }

  // ── R2：writeDesk.call 透传入口 ──
  //   Catalog alone is not an entrance ⇒ 必须有 ui/ 真实消费点。
  const desk = readWriteDesk();
  const uiFiles = productFiles.filter((f) => f.dir === 'ui' || f.dir === 'render');
  const uiSrc = uiFiles.map((f) => srcOf.get(f.rel)).join('\n');
  const deskConsumed = /\bWA\.writeDesk\.call\s*\(/.test(uiSrc);
  const r2 = new Map();
  const r2Rejected = [];
  if (deskConsumed) {
    for (const [ns, methods] of desk) {
      const realWrites = methods.filter((mm) => isWrite(ns, mm) === true);
      if (realWrites.length > 0) r2.set(ns, new Set(realWrites));
      else r2Rejected.push(ns);
    }
  }

  // ── R3：ui/ 面板里的写口调用 ──
  const r3 = new Map();
  const uiCalls = callsIn(uiSrc);
  for (const [ns, methods] of uiCalls) {
    const realWrites = [];
    for (const mm of methods) if (isWrite(ns, mm) === true) realWrites.push(mm);
    if (realWrites.length > 0) r3.set(ns, new Set(realWrites));
  }

  // ── R4：workflow 链节点（driver-ledger 的 L1 面）──
  //   workflow 节点是**运行期注册**的，形如：
  //     WA.workflow.register({ id:'agency.schedule', chain:'after', async run(){ ...WA.agency.schedule(...) } })
  //
  //   ★ 关键：节点的 id **不是**要调用的方法名，它只是个标签。
  //     实测反例：
  //       id='agency.schedule'   → 体内真正调 WA.agency.schedule(name, at)
  //       id='summarizer.run'    → 体内调 WA.summarizer.makeSmallSummary/makeBigSummary
  //                                （WA.summarizer.run 根本不存在）
  //       id='chapters.inject'   → 体内调 WA.chapters.buildChapterBlock（读口，不写盘）
  //     所以 R4 必须扫**节点 run() 体内的 WA.<ns>.<m>( 调用**，再经写口判定，
  //     而不是拿 id 前缀当方法名。这与 R1「路由键前缀不是命名空间」是同一类错误。
  //
  //   只认 before / after 两条链：其它链不属轮次自动驱动面（与 driver-ledger 同口径）。
  const r4 = new Map();
  for (const f of productFiles) {
    const s = srcOf.get(f.rel);
    const regRe = /workflow\.register\s*\(\s*\{/g;
    let rm;
    while ((rm = regRe.exec(s)) !== null) {
      const open = s.indexOf('{', rm.index);
      const close = matchBrace(s, open);
      if (close < 0) continue;
      const obj = s.slice(open, close + 1);
      const chainM = obj.match(/\bchain\s*:\s*['"]([A-Za-z0-9_-]+)['"]/);
      const chain = chainM ? chainM[1] : '';
      if (chain !== 'before' && chain !== 'after') continue;
      // 整个节点对象体就是调用面（run() 在里面）
      const calls = callsIn(obj);
      for (const [ns, methods] of calls) {
        for (const mm of methods) {
          if (isWrite(ns, mm) === true) {
            if (!r4.has(ns)) r4.set(ns, new Set());
            r4.get(ns).add(mm + '@' + chain);
          }
        }
      }
    }
  }

  // ── R5：round-drivers 的 DRIVERS 表（自动面：每轮零参推进）──
  //   engines/round-drivers.js 是「每轮推进」的自动面。它的 DRIVERS 由
  //   BASE_DRIVERS（基线七台）+ l3Registry.zeroArgDrivers() + pushApiRegistry.driveDrivers()
  //   合成。这些引擎**不需要玩家点**，但每轮真的会被调用 —— 是合法入口。
  //   判据：表项 { engine:'x', method:'y' } 且 x.y 是写口。
  const r5 = new Map();
  (function collectRoundDrivers() {
    const file = 'engines/round-drivers.js';
    const s = srcOf.get(file);
    if (!s) return;
    // BASE_DRIVERS 里的字面量
    const re = /engine:\s*'([A-Za-z0-9_]+)'\s*,\s*method:\s*'([A-Za-z0-9_]+)'/g;
    let mm;
    while ((mm = re.exec(s)) !== null) {
      const ns = mm[1], meth = mm[2];
      if (isWrite(ns, meth) === true) {
        if (!r5.has(ns)) r5.set(ns, new Set());
        r5.get(ns).add(meth + '@round');
      }
    }
  })();

  // ── R6：intake-dispatch 的 MAPPING 表（翻译面：契约 → 写口自动喂入）──
  //   engines/intake-dispatch.js 的 MAPPING 每项声明 { engine:'x', method:'y' }，
  //   表示「字段 x 可自动翻译成 x.y 写口调用」。同样是合法入口（无需玩家点）。
  const r6 = new Map();
  (function collectIntake() {
    const file = 'engines/intake-dispatch.js';
    const s = srcOf.get(file);
    if (!s) return;
    const re = /engine:\s*'([A-Za-z0-9_]+)'\s*,\s*method:\s*'([A-Za-z0-9_]+)'/g;
    let mm;
    while ((mm = re.exec(s)) !== null) {
      const ns = mm[1], meth = mm[2];
      if (isWrite(ns, meth) === true) {
        if (!r6.has(ns)) r6.set(ns, new Set());
        r6.get(ns).add(meth + '@intake');
      }
    }
  })();

  // ── 登记面 ──
  const l3 = readL3Registry();
  const pushApi = readPushApiRegistry();
  const deadLedger = readDeadExportLedger();

  // ── 入站引用统计（全产品面，排除自身文件）──
  //   ⚠ 判据必须是「真实调用点」，不能是「名字出现过」。
  //   用宽松口径（任意位置出现 `WA.ns`）会把三种东西误算成入站：
  //     ① 注释里提一句名字（"知情裁决仍归 anti-omniscience"）；
  //     ② 表驱动字符串键（`channelProbe: '渠道探针账本读回'`）；
  //     ③ 白名单/清单数组里的一行。
  //   三者都不产生任何运行期调用，却足以让一台真死面从 orphan 档逃进 wired 档。
  //   本仓实测（tmp-probe-inbound3）：宽松 373 / 严格 373，差集 0 —— 说明现有读数
  //   没有假阳性；但判据仍收紧，因为读数正确是运气，判据正确才是保证。
  //
  //   严格口径 = 直接调用 或 别名绑定后调用：
  //     直接：`WA.ns.m(` / `WA.engines.ns.m(`
  //     别名：`const rg = WA.replyGuard;` 且同文件内 `rg.diagnose(`
  //           （ui/panel.js:3614 就是这种形态，只认直接调用会漏掉真实入站）
  const allSrc = productFiles.map((f) => ({ rel: f.rel, src: srcOf.get(f.rel) }));
  // ⚠ 性能：入站判据的本质是「文件 f 是否真实调用了命名空间 ns」。
  //   朴素写法是「391 引擎 × 上千文件」的双重循环，每个组合都重剥注释 + 重跑正则
  //   ⇒ 实测 87s（占 scan 总耗时 97%）。这里改成**以文件为主序**：
  //     每个文件只剥一次注释、只扫一遍，把「它真实调用到的 ns 集合」算出来，
  //     再回填到对应引擎。复杂度从 O(引擎×文件) 降到 O(文件)，且判据完全等价。
  //
  //   判据与 waCalledIn 严格同义，两条路都要算：
  //     ① 直接调用：`WA.ns.m(` / `WA.engines.ns.m(`
  //     ② 别名绑定：`x = WA.ns;` 且同文件内有 `x.m(`
  const nsSet = new Set();
  for (const r of records) if (r.ns) nsSet.add(r.ns);
  const inboundOf = new Map();   // ns -> [rel...]
  for (const other of allSrc) {
    const code = stripComments(other.src);
    const hit = new Set();
    // ① 直接调用
    const directRe = /\bWA\.(?:engines\.)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
    let dm;
    while ((dm = directRe.exec(code)) !== null) {
      const ns = dm[1];
      if (nsSet.has(ns)) hit.add(ns);
    }
    // ② 别名绑定后调用
    const bindRe = /\b([A-Za-z0-9_$]{2,})\s*=\s*WA\.(?:engines\.)?([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:;|\n|\}|$)/g;
    let bm;
    while ((bm = bindRe.exec(code)) !== null) {
      const alias = bm[1];
      const ns = bm[2];
      if (!nsSet.has(ns)) continue;
      if (hit.has(ns)) continue;
      if (new RegExp('\\b' + alias + '\\s*\\.\\s*[A-Za-z0-9_$]+\\s*\\(').test(code)) hit.add(ns);
    }
    for (const ns of hit) {
      if (!inboundOf.has(ns)) inboundOf.set(ns, []);
      inboundOf.get(ns).push(other.rel);
    }
  }
  for (const r of records) {
    if (!r.ns) continue;
    const from = (inboundOf.get(r.ns) || []).filter((rel) => rel !== r.rel);
    r.inbound = from.length;
    r.inboundFrom = from.slice(0, 3);
  }

  // ── 分档 ──
  const buckets = { routable: [], wired: [], readonlyOnly: [], orphan: [], noNs: [] };
  const declaredNs = new Set();
  for (const r of records) {
    if (!r.ns) { buckets.noNs.push(r); continue; }
    declaredNs.add(r.ns);
    const hits = [];
    if (r1.has(r.ns)) hits.push('R1(' + Array.from(r1.get(r.ns)).slice(0, 2).join(',') + ')');
    if (r2.has(r.ns)) hits.push('R2(writeDesk)');
    if (r3.has(r.ns)) hits.push('R3(' + Array.from(r3.get(r.ns)).slice(0, 2).join(',') + ')');
    if (r4.has(r.ns)) hits.push('R4(' + Array.from(r4.get(r.ns)).slice(0, 2).join(',') + ')');
    if (r5.has(r.ns)) hits.push('R5(round)');
    if (r6.has(r.ns)) hits.push('R6(intake)');
    r.entrances = hits;

    if (hits.length > 0) buckets.routable.push(r);
    else if (r.inbound > 0) buckets.wired.push(r);
    else if (r.writes) {
      // orphan 的裁决来自三个既有真源，本工具**不新造裁决面**：
      //   ① l3-registry      —— 引擎级四类裁决（zero-arg / needs-input / decision / dead）
      //   ② push-api-registry —— 推进类 API 级四类裁决（drive / entry / ui / dead）
      //   ③ dead-export-ledger —— 方法级死子面冻结（dead / uiDead，归因 test-only/self-only/unwired）
      // 三者都为空的才是真正「没人裁决过」的孤儿，那才该红。
      const marks = [];
      if (l3.has(r.ns)) marks.push(l3.get(r.ns));
      if (pushApi.has(r.ns)) marks.push(pushApi.get(r.ns).join('|'));
      const dl = deadLedger.get(r.ns);
      if (dl) {
        marks.push('ledger:' + dl.count + '条(' + Array.from(dl.codes).join('/') + ')');
        r.deadExports = dl;
      }
      r.verdict = marks.length ? marks.join(' ') : null;
      buckets.orphan.push(r);
    } else buckets.readonlyOnly.push(r);
  }

  const counts = {
    total: records.length,
    declaredNs: declaredNs.size,
    routable: buckets.routable.length,
    wired: buckets.wired.length,
    readonlyOnly: buckets.readonlyOnly.length,
    orphan: buckets.orphan.length,
    noNs: buckets.noNs.length,
    routesRaw: routes.length,
    routesUnique: new Set(routes.map((r) => r.key)).size,
    routeDupes: dupes.length,
    routeReachNs: routeReach.size,
    r1Ns: r1.size,
    r2Ns: r2.size,
    r2Rejected: r2Rejected.length,
    r3Ns: r3.size,
    r4Ns: r4.size,
    r5Ns: r5.size,
    r6Ns: r6.size,
    deskDeclared: desk.size,
    deskConsumed,
    l3Registered: l3.size,
    pushRegistered: pushApi.size,
  };
  counts.identityOk =
    counts.routable + counts.wired + counts.readonlyOnly + counts.orphan + counts.noNs === counts.total;
  counts.orphanUnadjudicated = buckets.orphan.filter((r) => !r.verdict).length;

  return { counts, buckets, routes, dupes, routeReach, records, r1, r1ViaHelper, r2, r3, r4, r5, r6, r2Rejected };
}

/* ─────────────────────────── 输出 ─────────────────────────── */

function pad(s, n) { return String(s).padEnd(n, ' '); }
function lpad(s, n) { return String(s).padStart(n, ' '); }

function printReport(result) {
  const c = result.counts;
  console.log('WorldAxis · ActionDesk 路由覆盖治理（OPV22-2）');
  console.log('─'.repeat(72));
  console.log('  引擎文件            ' + lpad(c.total, 5));
  console.log('  声明命名空间        ' + lpad(c.declaredNs, 5));
  console.log('  ROUTES 条目（原始） ' + lpad(c.routesRaw, 5));
  console.log('  ROUTES 条目（唯一） ' + lpad(c.routesUnique, 5) +
    '   重复键 ' + c.routeDupes + ' 个 = 死代码');
  console.log('─'.repeat(72));
  console.log('  入口面命中（均经「方法体含 transact」写口判定）');
  console.log('    R1 路由体真写口调用 ' + lpad(c.r1Ns, 5) + '  ns');
  console.log('    R2 writeDesk 透传   ' + lpad(c.r2Ns, 5) + '  ns' +
    (c.deskConsumed ? '  （面板有 writeDesk.call 消费点 ✓）' : '  （面板无消费点，未计入 ✗）') +
    (c.r2Rejected > 0 ? '\n                         被写口判据挡掉 ' + c.r2Rejected + ' 个 ns（台上只有读口）' : ''));
  console.log('    R3 ui/ 面板真写口   ' + lpad(c.r3Ns, 5) + '  ns');
  console.log('    R4 workflow 链节点  ' + lpad(c.r4Ns, 5) + '  ns（before/after 自动驱动面）');
  console.log('    R5 round-drivers 表 ' + lpad(c.r5Ns, 5) + '  ns（每轮零参推进）');
  console.log('    R6 intake 翻译表    ' + lpad(c.r6Ns, 5) + '  ns（契约→写口自动喂入）');
  console.log('─'.repeat(72));
  console.log('  ' + pad('档位', 15) + lpad('数量', 6) + '   说明');
  console.log('  ' + pad('routable', 15) + lpad(c.routable, 6) + '   至少一条入口面命中');
  console.log('  ' + pad('wired', 15) + lpad(c.wired, 6) + '   无入口面但有入站调用（叙事/总线驱动）');
  console.log('  ' + pad('readonlyOnly', 15) + lpad(c.readonlyOnly, 6) + '   无入口无写盘零入站（纯读面）');
  console.log('  ' + pad('orphan', 15) + lpad(c.orphan, 6) + '   有写盘零入口零入站  ← 该红');
  console.log('  ' + pad('noNs', 15) + lpad(c.noNs, 6) + '   命名空间扫描盲区');
  console.log('─'.repeat(72));
  const sum = c.routable + c.wired + c.readonlyOnly + c.orphan + c.noNs;
  console.log('  恒等式  ' + c.routable + ' + ' + c.wired + ' + ' + c.readonlyOnly +
    ' + ' + c.orphan + ' + ' + c.noNs + ' = ' + sum + ' / ' + c.total +
    '  ' + (c.identityOk ? '✓ 成立' : '✗ 破裂'));
  console.log('  routable 占比       ' + ((c.routable / c.total) * 100).toFixed(1) +
    '%  （计划目标 ≥200 条）' + (c.routable >= 200 ? '  ✓ 达标' : '  ✗ 未达标'));
  console.log('  orphan 未裁决       ' + lpad(c.orphanUnadjudicated, 5) +
    ' / ' + c.orphan + '  （其余已被 l3/push 登记面裁决）');

  if (c.noNs > 0) {
    console.log('\n── noNs（扫描盲区，需人工确认）' + '─'.repeat(38));
    for (const r of result.buckets.noNs) console.log('   ' + r.rel);
  }

  if (c.orphan > 0) {
    console.log('\n── orphan（有写盘 · 零入口 · 零入站）' + '─'.repeat(30));
    for (const r of result.buckets.orphan) {
      const mark = r.verdict ? '  [' + r.verdict + ']' : '  [未裁决]';
      console.log('   ' + pad(r.ns, 24) + pad(r.file, 30) + mark);
    }
  } else {
    console.log('\n── orphan 为空：所有会写盘的引擎都有入口或入站调用 ✓');
  }
}

function printBreakdown(result) {
  const b = { R1: [], R2: [], R3: [], R1R2: [], R1R3: [], R2R3: [], all: [] };
  for (const x of result.buckets.routable) {
    const has = { R1: false, R2: false, R3: false };
    for (const h of x.entrances) {
      if (h.startsWith('R1')) has.R1 = true;
      if (h.startsWith('R2')) has.R2 = true;
      if (h.startsWith('R3')) has.R3 = true;
    }
    if (has.R1 && has.R2 && has.R3) b.all.push(x);
    else if (has.R1 && has.R2) b.R1R2.push(x);
    else if (has.R1 && has.R3) b.R1R3.push(x);
    else if (has.R2 && has.R3) b.R2R3.push(x);
    else if (has.R1) b.R1.push(x);
    else if (has.R2) b.R2.push(x);
    else b.R3.push(x);
  }
  const c = result.counts;
  console.log('routable ' + c.routable + ' 的入口面构成');
  console.log('  仅 R1（路由体真写口）  : ' + b.R1.length);
  console.log('  仅 R2（writeDesk）     : ' + b.R2.length);
  console.log('  仅 R3（ui/ 面板真写口）: ' + b.R3.length);
  console.log('  R1+R2                 : ' + b.R1R2.length);
  console.log('  R1+R3                 : ' + b.R1R3.length);
  console.log('  R2+R3                 : ' + b.R2R3.length);
  console.log('  三面齐全               : ' + b.all.length);
  console.log('\n仅 R3 命中的 ' + b.R3.length + ' 个：');
  for (const x of b.R3) console.log('  ' + pad(x.ns, 26) + x.entrances.join(' '));
  console.log('\n仅 R2 命中的 ' + b.R2.length + ' 个：');
  for (const x of b.R2) console.log('  ' + pad(x.ns, 26) + x.file);
  if (result.r2Rejected.length) {
    console.log('\n被写口判据挡掉的 writeDesk 成员（' + result.r2Rejected.length + '）：');
    console.log('  ' + result.r2Rejected.join(' '));
  }
}

function main(argv) {
  const wantJson = argv.includes('--json');
  const wantOrphans = argv.includes('--orphans');
  const wantDupes = argv.includes('--dupes');
  const wantBreakdown = argv.includes('--breakdown');
  // --tiers 或 --tiers=wired
  const tiersArg = argv.find((a) => a === '--tiers' || a.startsWith('--tiers='));
  const wantTiers = tiersArg ? (tiersArg.includes('=') ? tiersArg.split('=')[1] : true) : null;
  const wantCheck = argv.includes('--check');

  const result = scan();

  if (wantJson) {
    const out = {
      counts: result.counts,
      orphan: result.buckets.orphan.map((r) => ({ ns: r.ns, file: r.file, verdict: r.verdict || null })),
      noNs: result.buckets.noNs.map((r) => r.rel),
      routeDupes: result.dupes,
    };
    console.log(JSON.stringify(out, null, 2));
  } else if (wantOrphans) {
    for (const r of result.buckets.orphan) {
      console.log(r.ns + '\t' + r.file + '\t' + (r.verdict || 'UNADJUDICATED'));
    }
    if (result.buckets.orphan.length === 0) console.log('(none)');
  } else if (wantDupes) {
    for (const d of result.dupes) console.log(d.key + '\t×' + d.count);
    if (result.dupes.length === 0) console.log('(none)');
  } else if (wantBreakdown) {
    printBreakdown(result);
  } else if (wantTiers) {
    const only = wantTiers === true ? null : String(wantTiers);
    const order = ['routable', 'wired', 'readonlyOnly', 'orphan', 'noNs'];
    for (const tier of order) {
      if (only && tier !== only) continue;
      const list = result.buckets[tier];
      if (!only) console.log('── ' + tier + '（' + list.length + '）' + '─'.repeat(40));
      for (const r of list) {
        const ent = r.entrances && r.entrances.length ? r.entrances.join(' ') : '-';
        const inb = r.inboundFrom && r.inboundFrom.length ? r.inboundFrom.slice(0, 2).join(',') : '-';
        console.log([tier, r.ns || '(noNs)', r.file, 'writes=' + r.writes,
          'in=' + r.inbound, ent, inb].join('\t'));
      }
    }
  } else {
    printReport(result);
  }

  if (wantCheck) {
    const c = result.counts;
    const problems = [];
    if (!c.identityOk) problems.push('恒等式破裂：五档之和 ≠ 引擎总数');
    if (c.orphanUnadjudicated > 0) {
      problems.push('存在 ' + c.orphanUnadjudicated + ' 个未裁决 orphan（有写盘、零入口、零入站）');
    }
    if (problems.length > 0) {
      console.error('\n✗ --check 失败：');
      for (const p of problems) console.error('   · ' + p);
      process.exit(1);
    }
    console.error('\n✓ --check 通过：恒等式成立，且无未裁决 orphan');
  }
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  scan,
  parseRoutes,
  findDuplicateRouteKeys,
  detectNamespaces,
  hasWrite,
  waRefsIn,
  waCalledIn,
  stripComments,
  callsIn,
  methodBodyOf,
  makeWriteJudge,
  isWriteMethod,
  readL3Registry,
  readPushApiRegistry,
  readWriteDesk,
  matchBrace,
};