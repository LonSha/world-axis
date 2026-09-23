#!/usr/bin/env node
// WorldAxis tests/evict-meta-v2610.js —— 有界容器「淘汰元字段」的生产者供给面锁（v2.61.0）
//
// 【它治的病】`people` 是有界容器（cap 48），`core/evict.js` 的 SITES 表把它自陈为
//   「按 `updatedAt` 最旧优先挤出」。但**淘汰消费的排序键，没有任何判据问过「谁负责提供它」**：
//     · engines/backstage.js   people 主通道      —— 写了 updatedAt ✔
//     · engines/backstage.js   knowledge_updates  —— 不写 ✘
//     · engines/intel.js       addIntel           —— 不写 ✘
//     · engines/life.js        addGoal            —— 写了 ✔
//     · engines/life.js        addCommitment      —— 不写 ✘（同一文件内自相矛盾）
//     · engines/life.js        addSchedule        —— 不写 ✘
//     · engines/life.js        tick（改写 intent） —— 不写 ✘
//     · actors/registry.js     setProfileSafe     —— 写了 ✔
//   缺 updatedAt ⇒ 排序键恒 0 ⇒ 这些条目**恒定被视为「最旧」**。
//   行为级实证（容器恒满 48 个 `updatedAt=1000` 的老 NPC 后各写一个**全新** NPC）：
//     主通道 / setProfileSafe 的新条目存活；knowledge_updates / addIntel / addCommitment / addSchedule
//     的新条目**全部被挤出** —— 「保留近期活跃者」的设计口径被整个反转成「优先扔掉刚登场的角色」。
//   同型的第二个缺口：`people.<id>.lastSeenAt` 在 `core/store.js` 的 schema 里声明了、
//     `engines/bridge.js` 的对外投影也真的读它（`num(p.lastSeenAt)`），
//     但全库**零写入方** ⇒ 对另一侧插件永远读到一个恒 0 / undefined 的字段。
//   第三个：`life.tick` 改写了 `p.intent`（观测面 `observe.slice` 的输入），却不算「人物被更新」。
//
// 【为什么既有锁全都照不到】（本锁与已覆盖 45 个面正交的一维）
//   · run.js 的 people 容量治理用例（v1.0.0）种下 60 个 **都带 updatedAt** 的条目，
//     验证的是「排序生效、挤出 48」——它把排序键**当既有事实**，从不问生产者给不给。
//   · run.js 的 G18 门禁（v2.13.0）钉的是「站点声明 ⇄ 调用点存在」，不看调用点**排的是哪个键**。
//   · core/evict.js 的 SITES 只声明「cap 几、怎么排」，不声明「排序键由谁维护」。
//   · field-liveness-gate 管的是「骨架一级键的读写归属」，`people` 内部的 `updatedAt` 在其粒度之下。
//   · v2.60.0 的锁管「输出契约的节内字段 ⇄ 引擎读取面」，与「持久化元字段的生产者供给面」不同轴。
//   一句话：既有锁把淘汰**读什么**钉住了，没人钉**写什么**。
//
// 【判据（两侧都从运行时/源码面读出，不写死清单）】
//   A  站点声明⇄淘汰消费者：`evict.siteDecls()` 里每个 `kind:'object'` 站点，必须能在
//      **产品源码全仓**（经 tests/product-files.js 单一真源推导，不写死文件清单）定位到它的
//      淘汰调用点；且其 `why` 文案若自陈「按 X 排序」，该 X 必须与调用点实际排序键一致。
//   B  消费者⇄排序键：从该调用点的排序表达式解析出真正读取的字段名
//      （如 `draft.people[a].updatedAt` ⇒ `updatedAt`）——这就是「淘汰元字段」。
//   C  生产者供给面（主判据，行为级）：
//        C1 每条「会创建 people 条目」的写入路径，都必须在**容满**时写一个全新条目后存活于淘汰。
//        C2 清单⇄源码面：源码里枚举到的生产者语句必须全部落在已覆盖文件内（防写了直写而锁不知道）。
//   D  声明⇄写入方（防幽灵字段）：容器 schema 里为条目声明、且**被产品代码真的读过**的元字段，
//      都必须至少有一个写入方 —— 直接覆盖 `lastSeenAt` 零写入方那一类。
//   E  无副作用：全部探测后，live store / localStorage 不得残留哨兵（用快照还原，判据本身无副作用）。
//
// 【负控制（先跑成红是纪律）】
//   N0 破坏锚点在真源码中各恰中 1 次。
//   N1 判据纯度：把六处修复点逐字还原成**修复前形态**的源码副本装载后，同款判据必须现形，
//      且现形集合与修复前实测一致（`knowledge_updates` / `addIntel` / `addCommitment` / `addSchedule`）。
//   N2 两向自证：当前（修复后）源码在同款判据下必须全部通过。
//   N3 逐路径敏感：只还原其中一路，判据必须恰好报出那一路。
//   N4 非恒真：判据必须能观测到「淘汰确实发生过」，否则「全部存活」可由「没淘汰」伪造。
//   N5 端到端行为注入：把某条**原本正常**的路径的排序键真写坏（置 0），判据必须现形。
//   N6 两向自证：未注入时同一路存活（现形源自破坏，非恒真）。
//   N7 D 面敏感：`lastSeenAt` 确有写入方（此前全库零写入方）。
//   N8 站点面敏感：篡改 SITES 的 kind / 排序键自陈，A 面必须现形。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');                 // 宿主桩：localStorage / SillyTavern（与 ui-gate-sync 同一份）
const { productFiles } = require('./product-files.js');
const LS = global.localStorage;

const TARGET = 'people';            // 被锁的有界容器（站点名 = SITES 的键）
const CAP = 48;                     // 与 SITES / __BOUNDED_CAPS 同源
const TAG = '__em2610_';            // 哨兵前缀

// ── 会创建 people 条目的写入路径（**源码面枚举**，不是写死名单）：
//    凡产品文件里出现「创建 people 条目」的语句，都是「条目生产者」。
//    此处把有公开 API 的路径与一个可调用的**行为驱动器**对应起来。
const PRODUCERS = [
  { key: 'backstage.applyResult.people', file: 'engines/backstage.js',
    drive: function (WA, name) { WA.backstage.applyResult(draftOf(WA), { people: [{ name: name, location: 'L' }] }, { idx: 9 }); } },
  { key: 'backstage.applyResult.knowledge_updates', file: 'engines/backstage.js',
    drive: function (WA, name) { WA.backstage.applyResult(draftOf(WA), { knowledge_updates: [{ person: name, about: 'a', status: 'fact', route: 'told' }] }, { idx: 9 }); } },
  { key: 'intel.addIntel', file: 'engines/intel.js',
    drive: function (WA, name) { WA.intel.addIntel(name, { claim: 'c', source: 's', level: 'witness' }); } },
  { key: 'life.addGoal', file: 'engines/life.js',
    drive: function (WA, name) { WA.life.addGoal(name, { text: 'g' }); } },
  { key: 'life.addCommitment', file: 'engines/life.js',
    drive: function (WA, name) { WA.life.addCommitment(name, { target: 't', text: 'x', kind: 'promise' }); } },
  { key: 'life.addSchedule', file: 'engines/life.js',
    drive: function (WA, name) { WA.life.addSchedule(name, { activity: 'a', start: 1, end: 2 }); } },
  { key: 'registry.setProfileSafe', file: 'actors/registry.js',
    drive: function (WA, name) { WA.registry.setProfileSafe(name, { persona: { d1: 1, d2: 2, d3: 3, d4: 4, d5: 5 } }); } }
];

// 需要 store 事务包一层的那两条（applyResult 的调用方负责开事务）
function draftOf(WA) {
  const box = {};
  WA.store.transact(function (d) { box.d = d; }, '__em2610_open');
  return box.d;
}

// ── 存档快照 / 还原：让判据**自身无副作用**（探测灌进去的脏 draft 不得留在真存档里）
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k !== null) out[k] = LS.getItem(k);
  }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k !== null && !(k in snap)) drop.push(k);
  }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}

/**
 * 把一次「灌脏 state → 跑探测」包在「快照 → 清除落盘 → 还原」里。
 * 为什么必须隔离：`fillFull` 走 `store.transact`，而 transact 在批外**会落盘**（store.save）；
 *   探测用的快照因此写进 true localStorage。若不擦掉，
 *     · 下一路 `gate.fresh()` 会把上一轮的哨兵**读回**（污染后续判据）；
 *     · E 面的「零副作用」从判据变成奢望。
 * 本函数让探测**自身无副作用**，而不是削弱判据。
 */
function isolatedProbe(fn) {
  const snap = snapshotLS();
  // 不删任何键再写回——`removeItem` + `setItem` 会把键挪到枚举序末尾，
  //   而 mock 的 localStorage 是按插入序枚举的（storageStat 类用例依赖它）。
  //   本窗口只做「fn 之后把被改动的键还原」：窗口内新增键移除、已有键恢复原值，
  //   setItem 对已存在键不改枚举序 ⇒ 副作用面最小。
  // 同时把 WA.log 静音：mock 的日志是**防抖异步落盘**（MOCK_LOG_DEBOUNCE_MS=500 后
  //   `persistMockLog` 写 `worldaxis_event_log_*`）。探测真会触发挤出日志，那些计时器
  //   落在本窗口之外才落盘 ⇒ 会污染后续判据、也会把 E 面变成不可判。
  //   静音的是**诊断出口**（日志环），不改任何被测行为：存活/淘汰/排序键全部照常计算。
  const WAobj = global.WorldAxis;
  const origLog = WAobj.log;
  WAobj.log = function () {};
  try { return fn(); }
  finally {
    if (origLog) WAobj.log = origLog;
    restoreLS(snap);
  }
}

/** 扫出真实存档里内容含某哨兵的键（E 面用：探测脏数据不得经落盘泄漏） */
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}


// ── 把 store 灌成「容器恒满、全部同样老」的状态，使淘汰必然发生 ──
function fillFull(WA) {
  WA.store.transact(function (d) {
    d.people = {};
    for (let i = 0; i < CAP; i++) {
      d.people[TAG + 'old' + i] = { id: TAG + 'old' + i, name: '旧' + i, knowledge: {}, updatedAt: 1000 };
    }
  }, '__em2610_fill');
}

// ── 触发一次真实淘汰：走 applyResult 尾部的容量治理（people 的唯一淘汰调用点） ──
function evictOnce(WA) {
  const before = Object.keys(WA.store.get().people).length;
  WA.store.transact(function (d) { WA.backstage.applyResult(d, {}, { idx: 9 }); }, '__em2610_evict');
  return { before: before, keys: Object.keys(WA.store.get().people) };
}

/** 单条路径的行为实证：灌满 → 写一个全新条目 → 触发淘汰 → 看它是否存活 */
function producerSurvives(WA, spec) {
  fillFull(WA);
  const name = TAG + 'new';
  let err = null;
  try { spec.drive(WA, name); } catch (e) { err = String((e && e.message) || e); }
  const entry = WA.store.get().people['p_' + name];
  const ev = evictOnce(WA);
  return {
    err: err,
    created: !!entry,
    updatedAt: entry ? entry.updatedAt : undefined,
    evicted: ev.before > CAP,                       // 前提：淘汰确实发生过
    survived: ev.keys.indexOf('p_' + name) >= 0
  };
}

/**
 * 从源码解析「某对象型站点的淘汰调用点及其排序键」。
 * 形态（core/evict.js object(obj, site, orderedKeys) 的调用惯例）：
 *   const <ks> = Object.keys(<container>);
 *   <ks>.sort((a, b) => ((<container>[a] && <container>[a].<F>) || 0) - ...);
 *   WA.evict.object(<container>, '<site>', <ks>);
 * 返回 { file, line, seg, keys:Set, orderDecl:'<F>'|null, why:'<F>'|null }
 */
function siteCallIn(rel, siteName) {
  const raw = fs.readFileSync(path.join(BASE, rel), 'utf8');
  const lines = raw.split('\n');
  const re = new RegExp("evict\\s*\\.\\s*object\\s*\\(\\s*[^,()]+,\\s*'" + siteName.replace(/\./g, '\\.') + "'\\s*,");
  for (let i = 0; i < lines.length; i++) {
    if (!re.test(lines[i])) continue;
    // 向上取最近一次 sort(，最多回溯 8 行（容器对象的排序语句紧邻调用点）
    const from = Math.max(0, i - 8);
    const seg = lines.slice(from, i + 1).join('\n');
    const sIdx = seg.lastIndexOf('.sort(');
    const sub = sIdx >= 0 ? seg.slice(sIdx) : '';
    const keys = new Set();
    let m;
    // 排序表达式形态：`<ks>.sort((a, b) => ((<obj>[a] && <obj>[a].<F>) || 0) - ...)`
    //   `<obj>` 可以是 `draft.people` / `person.knowledge` 这类带点路径，
    //   故接收者部分必须允许 `(?:.prop)*` —— 只写 `\[x\]` 会漏掉全部带点路径（首版即由此空集）。
    const kre = /\[[A-Za-z_$][\w$]*\]\s*&&\s*(?:[A-Za-z_$][\w$]*\s*\.\s*)*[A-Za-z_$][\w$]*\s*\[[A-Za-z_$][\w$]*\]\s*\.\s*([A-Za-z_$][\w$]*)/g;
    while ((m = kre.exec(sub)) !== null) keys.add(m[1]);
    return { file: rel, line: i + 1, seg: sub, keys: keys };
  }
  return null;
}

/** 站点声明里自陈的「按 X 最旧优先挤出」——从 why 文案解析 X（无自陈则 null） */
function declaredOrderField(siteName, whyText) {
  if (typeof whyText !== 'string') return null;
  const m = whyText.match(/按\s*([A-Za-z_$][\w$]*)\s*(?:最旧|最新|升序|降序)/);
  return m ? m[1] : null;
}

/** 产品源码面：枚举所有「创建 people 条目」的语句（不写死文件清单，靠 product-files 单一真源） */
function producerSites() {
  const out = [];
  productFiles(BASE).forEach(function (rel) {
    const src = stripComments(fs.readFileSync(path.join(BASE, rel), 'utf8'));
    src.split('\n').forEach(function (line, i) {
      // 创建形态：`people[<id>] = ...` 且右侧是对象字面量/||/Object.assign
      //   （排除纯赋值已有引用、delete 等非创建语句）
      if (/people\[[A-Za-z_$][\w$]*\]\s*=(?!=)/.test(line) &&
          (/\|\|\s*\(?\s*\{/.test(line) || /Object\.assign\s*\(/.test(line) || /=\s*\{\s*id\s*:/.test(line))) {
        out.push({ file: rel, line: i + 1, text: line.trim() });
      }
    });
  });
  return out;
}

/** 容器 schema 里声明的「条目字段」——从 core/store.js 的 people 注释解析 */
function declaredMetaFields() {
  const src = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  const m = src.match(/people:\s*\{\},\s*\/\/\s*id -> \{([^}]*)\}/);
  if (!m) return null;
  return m[1].split(',').map(function (s) { return s.trim().split(':')[0].trim(); }).filter(Boolean);
}

/** 某字段在产品代码里是否有写入方（对象属性赋值 / 字段简写） */
function writersOf(field) {
  const out = [];
  productFiles(BASE).forEach(function (rel) {
    const src = stripComments(fs.readFileSync(path.join(BASE, rel), 'utf8'));
    const reAssign = new RegExp('\\.' + field + '\\s*=(?!=)');
    // 字段简写：对象字面量属性 `{ field: ... }`。行首也算（多行字面量里属性各占一行，
    //   如 `Object.assign(old, {\n  avatar: ...`）—— 首版只认 `{`/`,` 前缀，于是
    //   逐行扫描时行首属性全部漏掉，把 backstage 的 avatar 误报成幽灵字段。
    const reShorthand = new RegExp('(?:^|[\\{,])\\s*' + field + '\\s*:');
    src.split('\n').forEach(function (line, i) {
      if (reAssign.test(line) || reShorthand.test(line)) out.push(rel + ':' + (i + 1));
    });
  });
  return out;
}

/** 真代码面（剥注释/字符串）——避免注释里的字段名被当成写入方 */
function stripComments(src) {
  let out = '', i = 0, st = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (st === 0) {
      if (c === '/' && n === '/') { st = 1; i += 2; continue; }
      if (c === '/' && n === '*') { st = 2; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { st = c; i++; out += ' '; continue; }
      out += c; i++;
    } else if (st === 1) { if (c === '\n') { st = 0; out += c; } i++; }
    else if (st === 2) { if (c === '*' && n === '/') { st = 0; i += 2; } else i++; }
    else { if (c === '\\') { i += 2; continue; } if (c === st) { st = 0; out += ' '; } i++; }
  }
  return out;
}

// ══════════════ 正向判据 ══════════════
function runAll(a) {
  const gate = require('./ui-gate-sync.js');

  // ── A. 站点声明 ⇄ 淘汰消费者（全仓源码面） ──
  const WA0 = gate.fresh().WA;
  const decls = WA0.evict.siteDecls();
  a(decls[TARGET] && decls[TARGET].kind === 'object' && decls[TARGET].cap === CAP,
    'v2610: [A] 站点 ' + TARGET + ' 被声明为对象型有界容器（cap ' + CAP + '，实 '
    + JSON.stringify(decls[TARGET] || null) + '）');

  // 每个对象型站点都必须在产品源码里定位到调用点（声明⇄执行未漂移）
  const objSites = Object.keys(decls).filter(function (k) { return decls[k].kind === 'object'; });
  const noCall = [];
  const siteInfo = {};
  productFiles(BASE).forEach(function (rel) {
    objSites.forEach(function (s) {
      if (siteInfo[s]) return;
      const hit = siteCallIn(rel, s);
      if (hit) siteInfo[s] = hit;
    });
  });
  objSites.forEach(function (s) { if (!siteInfo[s]) noCall.push(s); });
  a(noCall.length === 0,
    'v2610: [A] 每个对象型站点都能在产品源码定位到淘汰调用点（悬空: ' + (noCall.join(',') || '无') + '）');

  // ── B. 消费者 ⇄ 排序键（且与 why 自陈一致） ──
  const site = siteInfo[TARGET];
  a(!!site && site.keys.size > 0,
    'v2610: [B] ' + TARGET + ' 的调用点确有排序键（解析得: '
    + (site ? Array.from(site.keys).join(',') : '—') + '）');
  a(!!site && site.keys.has('updatedAt'),
    'v2610: [B] 排序键就是元字段 updatedAt（实: ' + (site ? Array.from(site.keys).join(',') : '—') + '）');
  const why = decls[TARGET] && decls[TARGET].why;
  const selfDecl = declaredOrderField(TARGET, why);
  a(selfDecl === null || (site && site.keys.has(selfDecl)),
    'v2610: [B] 站点 why 自陈的排序键（' + String(selfDecl) + '）与调用点实际排序键一致'
    + (selfDecl && !(site && site.keys.has(selfDecl)) ? '——自陈漂移' : ''));

  // ── C. 生产者供给面（行为级，主判据） ──
  const results = [];
  PRODUCERS.forEach(function (spec) {
    const r = probeWith(gate, spec);
    results.push({ key: spec.key, r: r });
  });
  const noEvict = results.filter(function (x) { return !x.r.evicted; }).map(function (x) { return x.key; });
  a(noEvict.length === 0,
    'v2610: [C] 每路探测都真的触发了淘汰（否则「存活」是恒真——未淘汰: ' + (noEvict.join(',') || '无') + '）');
  const notCreated = results.filter(function (x) { return !x.r.created; }).map(function (x) { return x.key; });
  a(notCreated.length === 0,
    'v2610: [C] 每路探测都真的创建了条目（未创建: ' + (notCreated.join(',') || '无') + '）');
  const starved = results.filter(function (x) { return !x.r.survived; })
    .map(function (x) { return x.key + '(updatedAt=' + String(x.r.updatedAt) + ')'; });
  a(starved.length === 0,
    'v2610: [C] 每条创建 people 条目的路径都提供淘汰排序键，新条目不被优先挤出（缺: '
    + (starved.join(', ') || '无') + '）');
  const weak = results.filter(function (x) { return !(typeof x.r.updatedAt === 'number' && x.r.updatedAt > 1000); })
    .map(function (x) { return x.key + '=' + String(x.r.updatedAt); });
  a(weak.length === 0,
    'v2610: [C] 存活条目的排序键严格大于基线（防「有字段但恒 0」骗过判据: '
    + (weak.join(',') || '无') + '）');

  // ── C2. 生产者清单 ⇄ 源码面 ──
  const sites = producerSites();
  const knownModules = new Set(PRODUCERS.map(function (p) { return p.file; }));
  const uncovered = sites.filter(function (s) { return !knownModules.has(s.file); });
  a(uncovered.length === 0,
    'v2610: [C2] 源码面枚举到的 people 条目生产者都落在已覆盖文件内（未覆盖: '
    + (uncovered.map(function (s) { return s.file + ':' + s.line; }).join(',') || '无') + '）');
  const hitKeys = new Set();
  sites.forEach(function (s) { hitKeys.add(s.file); });
  a(hitKeys.size >= 3,
    'v2610: [C2] 源码面确实枚举到生产者语句（实 ' + sites.length + ' 处 / ' + hitKeys.size
    + ' 个文件，判据不在空集上恒真）');

  // ── D. 声明 ⇄ 写入方（防幽灵字段） ──
  const meta = declaredMetaFields();
  a(!!meta && meta.length > 0, 'v2610: [D] 能解析容器 schema 的条目字段声明（实 '
    + (meta ? meta.join('/') : '—') + '）');
  const ghost = ghostFields();
  a(ghost.length === 0,
    'v2610: [D] 被读取的条目元字段都有写入方（幽灵字段: ' + (ghost.join(',') || '无') + '）');
}

/** 幽灵字段 = 「被产品代码真的读过」却「全库零写入方」的条目元字段 */
function ghostFields() {
  const meta = declaredMetaFields() || [];
  return meta.filter(function (f) {
    const readers = productFiles(BASE).filter(function (rel) {
      // 读法：`.field`（属性访问）；剥注释后统计，避免注释里的字段名算读点
      return new RegExp('\\.' + f + '\\b').test(stripComments(fs.readFileSync(path.join(BASE, rel), 'utf8')));
    });
    if (!readers.length) return false;
    return writersOf(f).length === 0;
  });
}

// ══════════════ 负控制 ══════════════
// 六个修复点的「修复前形态」——破坏锚点在真源码中各恰中 1 次
const REVERTS = [
  { name: 'backstage.people', file: 'engines/backstage.js',
    neu: '          lastSeenAt: now, updatedAt: now\n        });',
    old: '          updatedAt: now\n        });' },
  { name: 'backstage.knowledge_updates', file: 'engines/backstage.js',
    neu: '        person.lastSeenAt = now; person.updatedAt = now;\n', old: '' },
  { name: 'intel.addIntel', file: 'engines/intel.js',
    neu: "      p.lastSeenAt = clockNow('intel'); p.updatedAt = p.lastSeenAt;\n", old: '' },
  { name: 'life.addCommitment', file: 'engines/life.js',
    neu: 'life.commitments = life.commitments.concat([row]).slice(-12); p.updatedAt = row.at; out = { ok: true, id: row.id };',
    old: 'life.commitments = life.commitments.concat([row]).slice(-12); out = { ok: true, id: row.id };' },
  { name: 'life.addSchedule', file: 'engines/life.js',
    neu: "life.schedule = life.schedule.concat([row]).slice(-12); p.updatedAt = clockNow('life'); out = { ok: true, id: row.id };",
    old: 'life.schedule = life.schedule.concat([row]).slice(-12); out = { ok: true, id: row.id };' },
  { name: 'life.tick', file: 'engines/life.js',
    neu: 'p.intent = decision.action === \'wait\' ? \'等待条件\' : decision.reason; p.updatedAt = f.now || stat.lastAt; changed++;',
    old: 'p.intent = decision.action === \'wait\' ? \'等待条件\' : decision.reason; changed++;' }
];

/** 生成「修复前形态」的源码覆盖副本（**内存里**，一个字节都不改仓库文件） */
function revertedSources(names) {
  const ov = {};
  REVERTS.forEach(function (p) {
    if (names && names.indexOf(p.name) < 0) return;
    const cur = ov[p.file] !== undefined ? ov[p.file] : fs.readFileSync(path.join(BASE, p.file), 'utf8');
    ov[p.file] = cur.split(p.neu).join(p.old);
  });
  return ov;
}

/** 建环境（可注入源码覆盖）并在隔离窗口里跑一次 producerSurvives */
function probeWith(gate, spec, srcOverride) {
  const WA = gate.fresh(srcOverride ? { srcOverride: srcOverride } : undefined).WA;
  return isolatedProbe(function () { return producerSurvives(WA, spec); });
}

/** 在隔离窗口里对给定环境跑全部生产者，返回「被饿死」（缺排序键 ⇒ 被挤出）的路径清单 */
function starvedUnder(gate, WA) {
  return isolatedProbe(function () {
    const out = [];
    PRODUCERS.forEach(function (spec) {
      const r = producerSurvives(WA, spec);
      if (!r.survived) out.push(spec.key);
    });
    return out;
  });
}

function runNegative(a) {
  const gate = require('./ui-gate-sync.js');

  // N0 破坏锚点在真源码中各恰中 1 次
  const anchorBad = REVERTS.filter(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.file), 'utf8');
    return (src.split(p.neu).length - 1) !== 1;
  }).map(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.file), 'utf8');
    return p.name + '(' + (src.split(p.neu).length - 1) + '次)';
  });
  a(anchorBad.length === 0, 'v2610: [N0] 破坏锚点在真源码中各恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');

  // 前提：修复前形态的副本确实被生成（与真源码不同）
  const ovAll = revertedSources(null);
  const differs = Object.keys(ovAll).filter(function (rel) {
    return ovAll[rel] !== fs.readFileSync(path.join(BASE, rel), 'utf8');
  });
  a(differs.length === Object.keys(ovAll).length && differs.length > 0,
    'v2610: [N1] 「修复前形态」副本确已生成且与真源码不同（实 ' + differs.length + ' 个文件）');

  // N1 判据纯度：修复前形态下，同款判据必须现形——且现形集合 == 修复前实测
  const EXPECT_BEFORE = ['backstage.applyResult.knowledge_updates', 'intel.addIntel',
    'life.addCommitment', 'life.addSchedule'];
  const WAold = gate.fresh({ srcOverride: ovAll }).WA;
  const starvedOld = starvedUnder(gate, WAold);
  a(starvedOld.length === EXPECT_BEFORE.length && EXPECT_BEFORE.every(function (k) { return starvedOld.indexOf(k) >= 0; }),
    'v2610: [N1] 修复前形态下判据现形恰 ' + EXPECT_BEFORE.length + ' 处（实 ' + starvedOld.length + ': '
    + starvedOld.join(',') + '）');

  // N2 两向自证：当前源码在同款判据下必须全部通过
  const WAnow = gate.fresh().WA;
  const starvedNow = starvedUnder(gate, WAnow);
  a(starvedNow.length === 0, 'v2610: [N2] 修复后源码在同款判据下全部通过（现形: '
    + (starvedNow.join(',') || '无') + '）');

  // N3 逐路径敏感：只还原 life.addSchedule
  const WAone = gate.fresh({ srcOverride: revertedSources(['life.addSchedule']) }).WA;
  const starvedOne = starvedUnder(gate, WAone);
  a(starvedOne.length === 1 && starvedOne[0] === 'life.addSchedule',
    'v2610: [N3] 只还原一路时判据恰好报出那一路（实: ' + (starvedOne.join(',') || '无') + '）');

  // N4 非恒真：「淘汰确已发生」这条前提本身可被观测（否则「存活」判据可恒绿）
  const rProbe = probeWith(gate, { key: 'probe', drive: function (WA2, name) { WA2.intel.addIntel(name, { claim: 'c', source: 's', level: 'witness' }); } });
  a(rProbe.evicted === true, 'v2610: [N4] 「淘汰确已发生」这条前提本身可被观测（防存活判据恒真）');

  // N5 端到端行为注入：把某一路**原本正常**的路径的排序键真写坏（置 0）→ 判据必须现形
  const patchedDrive = function (WA2, name) {
    const box = {};
    WA2.store.transact(function (d) { box.d = d; }, '__em2610_inj');
    WA2.backstage.applyResult(box.d, { people: [{ name: name, location: 'L' }] }, { idx: 9 });
    WA2.store.transact(function (d) { if (d.people['p_' + name]) d.people['p_' + name].updatedAt = 0; }, '__em2610_inj2');
  };
  const rInj = probeWith(gate, { key: 'inject', drive: patchedDrive });
  a(rInj.created && !rInj.survived,
    'v2610: [N5] 行为注入（真把排序键写坏）时判据现形（created=' + rInj.created + ' survived=' + rInj.survived + '）');

  // N6 两向自证：原版源码上同款注入前，那条路径是存活的
  const rOk = probeWith(gate, PRODUCERS[0]);
  a(rOk.survived === true, 'v2610: [N6] 未注入时同一路存活（现形源于破坏，非恒真）');

  // N7 D 面敏感：lastSeenAt 的写入方确实存在（它此前全库为 0）
  const lsWriters = writersOf('lastSeenAt');
  a(lsWriters.length > 0,
    'v2610: [N7] lastSeenAt 确有写入方（此前全库零写入方，实 ' + lsWriters.length + ' 处）');
  a(ghostFields().length === 0,
    'v2610: [N7] 当前源码上 D 面无幽灵字段（两向自证的正向端）');

  // N8 站点面敏感：篡改 SITES 的 kind / 排序键自陈，A/B 面必须现形
  const declsNow = gate.fresh().WA.evict.siteDecls();
  const fakeKind = JSON.parse(JSON.stringify(declsNow));
  fakeKind[TARGET].kind = 'array';
  const aHit = !(fakeKind[TARGET] && fakeKind[TARGET].kind === 'object' && fakeKind[TARGET].cap === CAP);
  a(aHit, 'v2610: [N8] 站点 kind 被篡改时 A 面现形（判据对声明侧敏感）');

  const fakeWhy = { path: 'people', cap: 48, kind: 'object', why: '人物容器（按 createdAt 最旧优先挤出）' };
  const selfDecl = declaredOrderField(TARGET, fakeWhy.why);
  const realKeys = siteInfoFresh().keys;
  a(selfDecl === 'createdAt' && !realKeys.has(selfDecl),
    'v2610: [N8] why 自陈与实际排序键不一致时 B 面现形（自陈 ' + String(selfDecl) + '）');

  // E. 无副作用：探测的脏数据（哨兵）不得经落盘泄漏进真实存档。
  //   为什么不是「全字节逐键比对」：本锁搭在 `tests/mock.js` 的 localStorage 上，
  //   而 mock 的日志是**防抖异步落盘**、`store.init()` 自身在 `loadEventLog` 时会
  //   `flushLog()` 落一次盘 —— 这些是**基建行为**，与本锁探测语义无关，
  //   拿它们当判据会把「基建时序」误判成「锁有副作用」。真正该钉的是本锁的契约：
  //   它自己的哨兵不得留在存档里（探测窗口已做快照还原）。
  //   放在 runNegative 末尾而不是 require.main 里：否则回归路径（只调 runAll/runNegative）
  //   覆盖不到它——判据在门禁里缺席等于不存在。
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2610: [E] 探测哨兵不泄漏进真实存档（残留键: ' + (leak.join(',') || '无') + '）');
}

/** 现读一次 people 调用点（供 N8 使用，不依赖 runAll 的局部变量） */
function siteInfoFresh() {
  const objSites = ['people'];
  let hit = null;
  productFiles(BASE).forEach(function (rel) {
    if (hit) return;
    objSites.forEach(function (s) { if (!hit) { const h = siteCallIn(rel, s); if (h) hit = h; } });
  });
  return hit || { keys: new Set() };
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try {
    runAll(a);
    runNegative(a);
  } catch (e) {
    fail++; console.log('  ✗ 判据失效：' + (e && e.stack));
  }
  if (fail) { console.log('EVICT-META-V2610: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('EVICT-META-V2610: pass（' + pass + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, PRODUCERS: PRODUCERS,
  producerSurvives: producerSurvives, producerSites: producerSites, siteCallIn: siteCallIn,
  declaredMetaFields: declaredMetaFields, declaredOrderField: declaredOrderField,
  writersOf: writersOf, ghostFields: ghostFields, revertedSources: revertedSources,
  stripComments: stripComments };
