#!/usr/bin/env node
// WorldAxis tools/consumer-types.js — 导出的**消费者类型**归属表（O8，v2.187.0）
//
// ── 它治的病（计划 O8 现状原文）──────────────────────────────────────────
//   「`tests/dead-export-gate.js` / `field-liveness-gate.js` 已把『有没有被调用』变成读数。
//   但**『被调用』不等于『玩家可见』**：`WA.commit` 九成员里 `settle`/`replay` 只有 `coop`
//    一个消费方；`engines/checkpoints.js`（28 个导出成员）在 `ui/panel.js` 里零控件
//    （只有一个注入源与一个 `topKeys` 读取）——完整存档槽能力已经存在，玩家摸不到。」
//   一句话：**「被引用次数」答不出「这个能力到底有没有入口」**。
//
// ── 本办法：把每个导出归到**消费者类型**（八档，全部由现场复算）──────────
//   对每个导出成员 `ns.mem`，在**产品面**（`tests/product-files.js` 的文件面）里找它的
//   `WA.ns.mem` 引用，按引用方分档：
//     · `panel`   —— `ui/panel.js` 引用（玩家可见的面板路径）
//     · `inject`  —— `render/inject.js` 引用（提示词注入源）
//     · `diag`    —— `engines/tool-diag.js` 引用（诊断节）
//     · `engine`  —— 其他产品文件引用（引擎间调用）
//     · `internal`—— 只有**定义文件自己**在用（`own ≥ 2`：过度导出，能力在、门没开）
//     · `test-only` —— 只有测试面在用（产能保留在测试里）
//     · `programmatic` — 产品与测试都零引用，但**已登记**「仅程序化接口」并写明理由
//     · `none`    —— 以上都不是，且**没有登记** ⇒ 这正是本项要求「归零」的那一类
//   一个成员可以同时有多个消费者（`panel+diag`）；本工具给出**排序后的主档**（见 RANK）
//   与逐档布尔，避免「归到一档就丢掉其余证据」。
//
// ── 单一真源（本文件不另写遍历器 / 引用正则）────────────────────────────
//   文件面   → `tests/product-files.js`（经 `tests/inventory.js` 的 `PRODUCT_FILES`）
//   引用面   → `tests/inventory.js` 的 `REF_RE` 与 `codeFace()`（剥注释与字符串，注释里提到不算）
//   测试侧   → `tests/dead-export-gate.js` 的产品面快照（`walkPass` 内，含 tests/ 全部 .js）
//   自用数   → `tests/dead-export-gate.js` 的 `countRefsOnCode` 口径（逐字同一条正则）
//   注册表   → `tests/consumer-ledger.json` 的 `programmatic`（**唯一人工面**，须带理由）
//
// ── 本轮（v2.187.0）由现场交叉对账揪出的两处自身缺陷（已修，留档）──────────
//   ① **成员清单取自一个不存在的键**：初稿想从 `MODULE_EXPORTS[rel + '::members']` 取成员表 ——
//      `MODULE_EXPORTS` 是 file → ns 的映射，成员表只有运行期才有 ⇒ 整个 forEach 空转、
//      表是空的而工具**照样打印一份很好看的分布**。这是本仓点名过的形态：**空集上的判据恒真**。
//      现口径：成员 = ① 有消费者者（引用面扫出来的键）∪ ② 零消费者者（清册的
//      `dead ∪ dataOnly ∪ uiDead`）—— 由清册的求差规则保证并集不漏成员。
//   ② **own 口径与门禁不一致**：初版我把正则写成「前面不许是 `.`」，于是 `WA.ui.open` 这类
//      **经命名空间自引用**被漏掉（实测 `ui.open` mine=4 vs 门禁 19）⇒ 本工具说「未过度导出」、
//      门禁说「过度导出」，**同一件事两套口径**。现改为逐字对齐 `countRefsOnCode`。
//
// ── 边界（如实登记）──────────────────────────────────────────────────
//   · 静态引用面，不做运行期探测：某成员经 `Object.keys(...)` 动态派发时**看不见**，
//     本工具会把它判成「无消费者」—— 这是**保守的错**（宁可要求登记，不可谎报有入口）。
//   · 只认 `WA.ns.mem` 形态（与清册同宽）。`bridge.js` 之类对外投影面不计入产品引用。
//   · 耗时：真装载全产品面（约 200 文件）+ 一次清册 —— 实测约 1.6 秒，与 inventory 同量级。
//
// 用法：
//   node tools/consumer-types.js                 # 分布 + 未登记的无消费者清单
//   node tools/consumer-types.js --json          # 机器可读
//   node tools/consumer-types.js --type none     # 只看某一档
//   node tools/consumer-types.js --who checkpoints  # 某一命名空间逐成员
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = ROOT;
const LEDGER_P = path.join(ROOT, 'tests', 'consumer-ledger.json');

/** 消费者类型的**有限词表**（门禁按它校验取值；扩词表必须走显式改动，不许悄悄多一档）。 */
const TYPES = ['panel', 'inject', 'diag', 'engine', 'internal', 'test-only', 'programmatic', 'none'];
/** 排档优先级：**玩家可见性从高到低**。多档命中时取最靠近玩家的那一档做主档。 */
const RANK = ['panel', 'inject', 'diag', 'engine', 'internal', 'test-only', 'programmatic', 'none'];
/** 产品面里具有**独立入口语义**的三个文件（其余一律归 `engine`）。 */
const ENTRY_FILES = { 'ui/panel.js': 'panel', 'render/inject.js': 'inject', 'engines/tool-diag.js': 'diag' };

function readJsonOrNull(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}
/** 「仅程序化接口」的**形态类别**（有限词表）。
 *  为什么要有它：理由若只写散文，「为什么这一条算合格」就回到了人工判断；
 *  形态类别是**可复算**的 —— 门禁按同一条 `shapeOf()` 现算，与登记不符即 stale。
 *  如实登记两类边界：
 *    · `ui-component-library` / `version-const` / `data-const` 三类**完全可复算**（看 ns / 成员名即可）；
 *    · `settings-registry-only` / `query-api` 两类**部分可复算** —— 前者要求该模块
 *      **确实向 `settingsBus` 注册过**（门禁读 `__settingsRegs` 现场核对），
 *      后者复算不了「它到底做什么用」，故只校验类别合法 + 理由非空（不假装能判对错）。 */
const SHAPES = ['settings-registry-only', 'ui-component-library', 'version-const', 'data-const', 'query-api'];
/** UI 组件库命名空间（`ui/cyberpunk-*.js` + 主题开关）：它们的成员由**库内构件与面板模板**
 *  消费（以局部引用而非 `WA.ns.mem` 形态），静态引用面看不见 —— 这是**已知的感知边界**，
 *  不是「无入口」。名单从 `index.js` 的 LOAD_ORDER 现场取，不写死。 */
function uiComponentNamespaces() {
  const out = {};
  try {
    const idx = require('fs').readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    const m = idx.match(/const LOAD_ORDER = \[([\s\S]*?)\];/);
    const body = m ? m[1] : '';
    (body.match(/'([^']+)'/g) || []).forEach(function (q) {
      const rel = q.slice(1, -1);
      // **只认组件库**：`ui/cyberpunk-*.js` 与 `ui/theme-switch.js`。
      //   初版把 LOAD_ORDER 里全部 ui/* 都算进来，于是 `ui`（**面板本体**）/`uiSettings`/
      //   `assistant`/`renderPerf` 也被一并豁免 —— 那等于让「面板自己的死导出」蒙混过关，
      //   而面板恰恰是「玩家可见路径」的**定义者**，它自己的成员最不该被免检。
      if (rel.indexOf('ui/cyberpunk-') !== 0 && rel !== 'ui/theme-switch.js') return;
      const list = require(path.join(ROOT, 'tests', 'inventory.js')).MODULE_EXPORTS;
      if (list[rel]) out[list[rel]] = rel;
    });
  } catch (e) { /* 读不到就不认任何 UI 组件库（宁可多要求登记，不可谎报豁免） */ }
  return out;
}
/** 现场复算某个「无消费者」导出的**形态类别**（生成器与门禁共用这一份）。 */
function shapeOf(entry) {
  const uiNs = uiComponentNamespaces();
  if (uiNs[entry.ns]) return 'ui-component-library';
  if (entry.mem === 'getSettings' || entry.mem === 'setSettings') return 'settings-registry-only';
  if (entry.mem === 'version') return 'version-const';
  if (/^[A-Z][A-Z0-9_]*$/.test(entry.mem)) return 'data-const';
  return 'query-api';
}
/** 注册表：`programmatic` 是**唯一人工面**（键 = `ns.mem`，值 = `{ shape, why }`；
 *  兼容历史形态「直接给字符串」——门禁会把字符串形态报成 legacy-shape）。 */
function loadRegistry() {
  const j = readJsonOrNull(LEDGER_P);
  if (!j || typeof j !== 'object') return { _note: '', version: '', programmatic: {} };
  return j;
}

/** 现场复算：产品面每个文件的 `ns.mem` 引用按消费方分档。
 *  opt.src：`{ 'ui/panel.js': '<改过的文本>' }` —— **门禁负控用**（在内存副本上重跑同款判据，
 *  与 `inventory.codeFace` / `gen-plan-status` 的注入面同规格）。 */
function scanRefs(opt) {
  const inv = require(path.join(ROOT, 'tests', 'inventory.js'));
  const overrides = (opt && opt.src) || null;
  const map = {};   // key → { panel, inject, diag, engine, files: [] }
  const bump = function (k, tag, rel) {
    const e = map[k] || (map[k] = { panel: 0, inject: 0, diag: 0, engine: 0, files: [] });
    e[tag] += 1;
    if (e.files.indexOf(rel) < 0) e.files.push(rel);
  };
  inv.PRODUCT_FILES.forEach(function (rel) {
    let raw;
    try {
      raw = (overrides && overrides[rel] !== undefined)
        ? overrides[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8');
    } catch (e) { return; }   // 读不到就不计入（宁缺勿编）
    const tag = ENTRY_FILES[rel] || 'engine';
    inv.codeFace(raw).split('\n').forEach(function (line) {
      inv.REF_RE.lastIndex = 0;
      let m;
      while ((m = inv.REF_RE.exec(line)) !== null) bump(m[1] + '.' + m[2], tag, rel);
    });
  });
  return map;
}
/** 测试侧引用数 —— **委托** `tests/dead-export-gate.js` 的 `testRefCount(rec)`。
 *  面 = `tests/` 下全部 .js（不是只读 run.js）—— 与清册 v2.73.0 起的口径一致。
 *  为什么逐成员调而不是自己扫一遍：那一份实现住在门禁里、同一趟内共用一份快照缓存；
 *  本文件再扫一遍就等于**给同一件事写第二套口径**（本轮已因为这个栽过一次，见 own 那一条）。
 *  边界：`opt.src` 的注入**不覆盖测试面**（快照读的是文件系统面）—— 如实登记，
 *  门禁若要对测试侧做负控，须走「改文件 → 还原」之外的内存副本路径（本工具不提供）。 */
function testRefOf(DE, ns, mem) {
  return DE.testRefCount({ ns: ns, mem: mem });
}
// 定义文件的**代码面缓存**：`ownOf` 会被逐成员调用（约 2400 次），每次都读盘 + codeFace 是纯浪费。
//   缓存以文件路径为键；`opt.src` 注入时**必须绕过缓存**（否则负控拿到的是被缓存的原版）。
const __codeCache = Object.create(null);
function codeFaceOf(rel, opt) {
  const inv = require(path.join(ROOT, 'tests', 'inventory.js'));
  const overrides = (opt && opt.src) || null;
  if (overrides && overrides[rel] !== undefined) return inv.codeFace(overrides[rel]);
  if (__codeCache[rel] !== undefined) return __codeCache[rel];
  let raw;
  try { raw = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { __codeCache[rel] = ''; return ''; }
  __codeCache[rel] = inv.codeFace(raw);
  return __codeCache[rel];
}
/** 定义文件内部自用数 —— 正则**逐字对齐** `tests/dead-export-gate.js` 的 `countRefsOnCode`：
 *  `(?<![\w$])<mem>(?![\w$])`，只要求词边界、**不排除 `.` 前缀**（`WA.ui.open` 这种经命名空间
 *  自引用也要算）。`own ≥ 2` 才算「自用」：导出声明那一行本身算 1 次。
 *  现场对账抓出的差异：初版我多加了「前面不许是 `.`」，`ui.open` 于是 4 vs 门禁 19 ——
 *  本工具说「未过度导出」而门禁说「过度导出」，同一件事两套口径。已改齐。 */
function ownOf(rel, mem, opt) {
  const code = codeFaceOf(rel, opt);
  const re = new RegExp('(?<![\\w$])' + String(mem).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])', 'g');
  return (code.match(re) || []).length;
}

/** 主分类：产出每个导出成员的消费者档位（含逐档布尔，不丢证据）。 */
function classify(opt) {
  const inv = require(path.join(ROOT, 'tests', 'inventory.js'));
  const reg = loadRegistry();
  // `opt.ignoreRegistry` —— **重建登记表时必须用**。
  //   为什么非有它不可（现场踩到）：登记表一旦写盘，那些条目就命中 `programmatic` 档、
  //   不再落进 `unregistered`，于是「重建」会拿着一张**已被自己污染**的现场，
  //   第二次跑就输出「0 条登记」—— 它会**静默地把整张表清空**。
  //   这是「判据的输入面被自己的产物改写」，比空集恒真更隐蔽。
  const programmatic = (opt && opt.ignoreRegistry) ? {} : (reg.programmatic || {});
  const refs = scanRefs(opt);
  const DE = require(path.join(ROOT, 'tests', 'dead-export-gate.js'));
  const R = inv.collect();
  const fileOfNs = {};
  Object.keys(inv.MODULE_EXPORTS).forEach(function (f) { fileOfNs[inv.MODULE_EXPORTS[f]] = f; });
  // 成员清单 = ① ∪ ②（见文件头「本轮修出的第一处缺陷」）
  const members = [];
  const entries = [];
  const seenKey = {};
  Object.keys(refs).forEach(function (k) {
    const ns = k.split('.')[0];
    if (!fileOfNs[ns]) return;                       // 不是模块接口面（宿主级导出），不进表
    seenKey[k] = true;
    members.push({ ns: ns, mem: k.slice(ns.length + 1), src: fileOfNs[ns] });
  });
  [].concat(R.dead, R.dataOnly, R.uiDead).forEach(function (rec) {
    const k = rec.ns + '.' + rec.mem;
    if (seenKey[k]) return;
    seenKey[k] = true;
    members.push({ ns: rec.ns, mem: rec.mem, src: fileOfNs[rec.ns] || '' });
  });
  // 整段分类跑在门禁的 `walkPass` 里：同一趟内产品/测试面只核一次签名（门禁自带三层缓存），
  //   实测 entry 数从「每条核一次全量签名 = 每趟 40 秒」降到毫秒级。
  DE.walkPass(function () {
  members.forEach(function (rec) {
    const key = rec.ns + '.' + rec.mem;
    const r = refs[key] || { panel: 0, inject: 0, diag: 0, engine: 0, files: [] };
    const t = testRefOf(DE, rec.ns, rec.mem);
    const own = rec.src ? ownOf(rec.src, rec.mem, opt) : 0;
    const hit = {};
    if (r.panel) hit.panel = true;
    if (r.inject) hit.inject = true;
    if (r.diag) hit.diag = true;
    if (r.engine) hit.engine = true;
    if (own >= 2) hit.internal = true;
    if (t > 0) hit['test-only'] = true;
    if (programmatic[key] && !Object.keys(hit).length) hit.programmatic = true;
    const ranked = RANK.filter(function (x) { return hit[x]; });
    const type = ranked.length ? ranked[0] : 'none';
    entries.push({
      key: key, ns: rec.ns, mem: rec.mem, src: rec.src,
      type: type, hits: ranked,
      refs: { panel: r.panel, inject: r.inject, diag: r.diag, engine: r.engine, test: t, own: own },
      files: r.files.slice(0, 6)
    });
  });
  });
  const summary = {};
  TYPES.forEach(function (x) { summary[x] = 0; });
  const combo = {};
  entries.forEach(function (e) {
    summary[e.type] += 1;
    const c = e.hits.join('+') || '(无)';
    combo[c] = (combo[c] || 0) + 1;
  });
  const unregistered = entries.filter(function (e) { return e.type === 'none'; });
  // 扫描文件面（现场读数，供门禁的反空转下限用 —— 「归零不得靠扫描面塌掉达成」）
  const scanned = {};
  Object.keys(refs).forEach(function (k) {
    (refs[k].files || []).forEach(function (rel) { scanned[rel] = (scanned[rel] || 0) + 1; });
  });
  return {
    total: entries.length, entries: entries, summary: summary, combo: combo,
    unregistered: unregistered,
    entryFiles: scanned,
    scannedFiles: Object.keys(scanned).length,
    refKeys: Object.keys(refs).length,
    registryLiveness: registryLiveness(),
    registrySize: Object.keys(programmatic).length,
    registry: programmatic,
    note: 'type 是**主档**（按玩家可见性排序取最靠近玩家的那一档）；hits 保留全部命中，不丢证据'
  };
}
/** 现场核对：每个命名空间是否**真的**向 `settingsBus` 注册过设置键。
 *  数据源 = `WA.__settingsRegs`（全仓单一真源：各模块自己 concat 进去），
 *  经 `tests/inventory.js` 的 `collect()` 用的同一个 vm 装载面 —— 不另写一份装载器。
 *  返回 `{ ns: true|false }`；装载失败时整项缺失（**缺失 ≠ 通过**：门禁只对 false 报红，
 *  缺失时由「settings-registry-only 那一档的存在性核对」缺席而**不豁免**任何东西）。 */
function registryLiveness() {
  const out = {};
  try {
    const g = require(path.join(ROOT, 'tests', 'inventory.js'));
    g.collect();   // 幂等确保装载（装载清单里的模块若已有实例则复用）
    const WA = global.WorldAxis || {};
    const regs = Array.isArray(WA.__settingsRegs) ? WA.__settingsRegs : [];
    const fileOfNs = {};
    Object.keys(g.MODULE_EXPORTS).forEach(function (f) { fileOfNs[g.MODULE_EXPORTS[f]] = f; });
    Object.keys(fileOfNs).forEach(function (ns) { out[ns] = false; });
    regs.forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      const mod = r.module;
      if (typeof mod === 'string' && out[mod] !== undefined) out[mod] = true;
    });
  } catch (e) { /* 读不到就整项缺失（如实：不假称已核对） */ }
  return out;
}
/** 注册表的**双面核对**：登记项必须真的无消费者（过期登记即报 stale），
 *  未登记的「无消费者」条目即报 unregistered。空注册表在非空无消费者面上不得算通过。 */
function registryProblems(res) {
  const out = [];
  const keys = {};
  res.entries.forEach(function (e) { keys[e.key] = e; });
  Object.keys(res.registry).forEach(function (k) {
    const e = keys[k];
    if (!e) { out.push({ kind: 'ghost-entry', key: k, detail: '登记了消费者类型，但该导出已不在导出面上（改名或删除后请清理登记）' }); return; }
    const consumerHits = e.hits.filter(function (x) { return x !== 'programmatic'; });
    if (consumerHits.length) {
      out.push({ kind: 'stale-entry', key: k, detail: '登记为「仅程序化接口」，但它已有真实消费者（' + consumerHits.join('+') + '）—— 过期登记比没有登记更坏' });
    }
    const v = res.registry[k];
    // 兼容历史形态（直接给字符串）：**报成 legacy-shape**，不留「两种登记形态并存」的活口。
    if (typeof v === 'string') {
      out.push({ kind: 'legacy-shape', key: k, detail: '登记值是裸字符串 —— 须改成 { shape, why }（否则形态无法复算）' });
      if (!v.trim()) out.push({ kind: 'reason-absent', key: k, detail: '「仅程序化接口」必须写出理由（空理由等于没登记）' });
      return;
    }
    if (!v || typeof v !== 'object') {
      out.push({ kind: 'shape-absent', key: k, detail: '登记项必须是 { shape, why } 对象' });
      return;
    }
    if (typeof v.why !== 'string' || !v.why.trim()) {
      out.push({ kind: 'reason-absent', key: k, detail: '「仅程序化接口」必须写出理由（空理由等于没登记）' });
    }
    if (SHAPES.indexOf(v.shape) < 0) {
      out.push({ kind: 'shape-unknown', key: k, detail: 'shape=' + JSON.stringify(v.shape) + ' 不在有限词表里（' + SHAPES.join('/') + '）' });
      return;
    }
    // **形态复算**：登记的类别必须与现场现算的一致（形态变了而登记没改 ⇒ stale 红）
    const now = shapeOf(e);
    if (now !== v.shape) {
      out.push({ kind: 'shape-stale', key: k, detail: '登记 shape=' + v.shape + '，现场复算=' + now + '（形态已变，请重跑 --register）' });
    }
    // settings-registry-only 的**存在性**核对：该模块必须真的向 settingsBus 注册过。
    //   为什么单挑这一条：它是本批最大的一档（70 条），而它成立的前提是「设置已经注册」——
    //   若某模块连注册都没有，那这两条导出就不是「注册了但没人读」，而是**根本没接线**，
    //   两者处置完全不同（前者等面板、后者要先接总线），不可合成一档。
    if (v.shape === 'settings-registry-only') {
      const regs = res.registryLiveness || {};
      if (regs[e.ns] === false) {
        out.push({ kind: 'registry-absent', key: k, detail: e.ns + ' 未向 settingsBus 注册任何设置键 ⇒ 它不是「注册了没人读」，是「根本没接总线」' });
      }
    }
  });
  res.unregistered.forEach(function (e) {
    out.push({ kind: 'unregistered', key: e.key, detail: '无任何消费者且未登记：接上消费者，或显式登记为「仅程序化接口」并写明理由' });
  });
  return out;
}

/** 逐条理由（**唯一人工面，住在仓库里**）—— 为什么这几条是「仅程序化接口」。
 *  纪律：这一批**复算不了「它到底做什么用」**（形态类别能判，用途判不了），
 *  故逐条写明；门禁只校验「理由非空 + 类别合法 + 形态与现场一致」，**不假装能判对错**。 */
const REASONS = {
  'rand.getSeed': '随机流种子读取口：供「可复现一局」的程序化排查读当前种子（面板未接）',
  'rand.seeded': '按种子上膛的口：供程序化指定随机流起点（复现故障现场用）',
  'apiRouter.fetchModels': '联网渠道的模型清单拉取口：由设置页在「拉取模型」时按需调用',
  'exec.depth': '执行上下文的嵌套深度读数：供程序化排查重入',
  'hostWbTrace.fingerprint': '宿主世界书数据的指纹：供程序化比对两次激活是否同一份',
  'world.blocksOf': '世界织体的区块查询：供程序化按地点取在场内容',
  'world.shipmentsInTransit': '在途货运查询：供程序化读「还在路上的货」',
  'world.messagesInTransit': '在途消息查询：供程序化读「还没送达的话」',
  'liaison.isDue': '联络是否到期：供程序化判「这一轮该不该联系」，面板未渲染',
  'stage.stagesOf': '玩法进度阶段枚举：供程序化取某进度的全部阶段',
  'stage.metricsOf': '玩法进度指标：供程序化取某进度的读数',
  'session.fingerprint': '会话指纹：供程序化比对两次会话是否同一场',
  'userlock.list': '用户锁清单：供程序化列出已锁条目',
  'beatMask.list': '节拍掩码清单：供程序化列出已登记的节拍',
  'presetWorld.round': '预设世界的轮次读数：供程序化读当前轮',
  'wbSearch.size': '世界书检索规模读数：供程序化读最近一次检索命中数',
  'staleGuard.size': '陈旧守卫规模读数：供程序化读被守卫的条目数',
  'purifyScope.kinds': '净化范围类别：供程序化读本次净化覆盖了哪几类',
  'compat.diagnose': '兼容层诊断读数：供程序化取兼容面结论（与 tool-diag 的采集面口径不同）'
};
/** 形态类别 → 那类的一句话说清（**由形态推出**，不是逐条手写散文）。 */
const SHAPE_WHY = {
  'settings-registry-only': '设置口：模块已把设置注册进 settingsBus（可落盘、可程序化读写），'
    + '但当前没有任何消费方调用这个读/写口 —— 面板设置面尚未渲染该模块',
  'ui-component-library': 'UI 组件库成员：由库内构件与面板模板消费（以局部引用而非 WA.ns.mem 形态调用），'
    + '静态引用面看不见它 —— 这是已知的感知边界，不是「无入口」',
  'version-const': '版本常量：由 UI 组件库与诊断按需读取，非调用型接口',
  'data-const': '数据常量/枚举：供程序化与测试消费（非调用型接口）',
  'query-api': '程序化查询口：由调用方按需派生（面板与诊断当前未接）'
};
/** 由现场复算 + 仓库内常量**重建**登记表（`--register` 走它）。 */
function buildLedger(res) {
  // 入参 res 允许是「认登记」的快照，但**生成必须用不认登记的现场**：
  //   否则第二次跑会把刚写好的登记当成「已有消费者」而不重建（实测输出「0 条登记」）。
  const clean = classify({ ignoreRegistry: true });
  res = clean;
  const programmatic = {};
  res.unregistered.forEach(function (e) {
    const shape = shapeOf(e);
    programmatic[e.key] = { shape: shape, why: REASONS[e.key] || SHAPE_WHY[shape] };
  });
  return {
    _note: 'WorldAxis 导出消费者类型登记表（v2.187.0）。'
      + 'programmatic 面登记的是「产品面与测试面都零引用、且已确认只有程序化用途」的导出；'
      + '键 = ns.mem，值 = { shape（形态类别，有限词表）、why（该类的可读理由） }。'
      + '纪律：① 未登记的无消费者导出即红（tests/o8-consumer-gate-v2187.js）；'
      + '② 登记的 shape 必须与现场复算一致（形态变了而登记没改 ⇒ shape-stale 红）；'
      + '③ 已有真实消费者的登记即红（过期登记比没有登记更坏）；'
      + '④ 本表由 `node tools/consumer-types.js --register` 重建，理由来自**形态**（不是手写散文）；'
      + '⑤ 两个如实登记的边界：`ui-component-library` 与 `query-api` 的「用途」判不了，'
      + '门禁只校验类别合法与形态一致，不假装能判对错。',
    version: versionOf(),
    programmatic: programmatic
  };
}
function versionOf() {
  try {
    const idx = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    return (idx.match(/const VERSION = '([\d.]+)'/) || [])[1] || '0.0.0';
  } catch (e) { return '0.0.0'; }
}

function main() {
  const ARGV = process.argv.slice(2);
  const res = classify();
  if (ARGV.indexOf('--register') >= 0) {
    const led = buildLedger(classify({ ignoreRegistry: true }));
    fs.writeFileSync(LEDGER_P, JSON.stringify(led, null, 2) + '\n');
    const g = {};
    Object.keys(led.programmatic).forEach(function (k) {
      const s = led.programmatic[k].shape; g[s] = (g[s] || 0) + 1;
    });
    console.log('■ 已重建 ' + LEDGER_P + '（' + Object.keys(led.programmatic).length + ' 条登记）');
    Object.keys(g).sort(function (a, b) { return g[b] - g[a]; }).forEach(function (k) {
      console.log('    ' + k.padEnd(24) + g[k]);
    });
    // **重新 classify 再核对**：上面那次 `res` 是**写盘前**的快照（它的 `registry` 还是旧表），
    //   拿它核对必然把刚登记好的 133 条全报成 unregistered —— 那是**假红**，
    //   病根是「判据的输入面与结论面不是同一件事」（与「破坏没发生也绿」同族）。
    const after = classify();
    const p = registryProblems(after);
    console.log('  重建后核对：' + (p.length ? ('问题 ' + p.length + ' 项') : '通过'));
    p.slice(0, 10).forEach(function (x) { console.log('    · [' + x.kind + '] ' + x.key + ' —— ' + x.detail); });
    if (p.length) process.exitCode = 1;
    return;
  }
  if (ARGV.indexOf('--json') >= 0) { console.log(JSON.stringify(res, null, 2)); return; }
  const whoIdx = ARGV.indexOf('--who');
  if (whoIdx >= 0) {
    const n = ARGV[whoIdx + 1] || '';
    res.entries.filter(function (e) { return e.ns.indexOf(n) >= 0; }).forEach(function (e) {
      console.log('  ' + e.key.padEnd(34) + e.type.padEnd(13) + '[' + e.hits.join('+') + ']  '
        + e.src + '  refs(p/i/d/e)=' + e.refs.panel + '/' + e.refs.inject + '/' + e.refs.diag + '/' + e.refs.engine
        + ' test=' + e.refs.test + ' own=' + e.refs.own);
    });
    return;
  }
  const typeIdx = ARGV.indexOf('--type');
  if (typeIdx >= 0) {
    const t = ARGV[typeIdx + 1];
    res.entries.filter(function (e) { return e.type === t; }).forEach(function (e) { console.log('  ' + e.key); });
    return;
  }
  console.log('■ 导出消费者类型归属表（现场复算自产品面 + 测试面）');
  console.log('  导出成员 ' + res.total + ' · 登记为「仅程序化接口」' + res.registrySize + ' 条');
  TYPES.forEach(function (t) {
    console.log('    ' + t.padEnd(13) + String(res.summary[t]).padStart(5) + '   档位：' + (RANK.indexOf(t) + 1) + '/' + RANK.length);
  });
  const p = registryProblems(res);
  console.log('  注册表核对：' + (p.length ? ('问题 ' + p.length + ' 项') : '通过（无未登记、无过期登记）'));
  p.slice(0, 20).forEach(function (x) { console.log('    · [' + x.kind + '] ' + x.key + ' —— ' + x.detail); });
  if (p.length > 20) console.log('    …（共 ' + p.length + ' 项）');
}
module.exports = {
  TYPES: TYPES, RANK: RANK, SHAPES: SHAPES, ENTRY_FILES: ENTRY_FILES, LEDGER_P: LEDGER_P,
  shapeOf: shapeOf, uiComponentNamespaces: uiComponentNamespaces, registryLiveness: registryLiveness,
  REASONS: REASONS, SHAPE_WHY: SHAPE_WHY, buildLedger: buildLedger, versionOf: versionOf,
  loadRegistry: loadRegistry, scanRefs: scanRefs, testRefOf: testRefOf,
  ownOf: ownOf, codeFaceOf: codeFaceOf, classify: classify, registryProblems: registryProblems
};
if (require.main === module) main();