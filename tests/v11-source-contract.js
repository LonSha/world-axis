#!/usr/bin/env node
// WorldAxis tests/v11-source-contract.js —— 注入源五表契约锁（v2.297.0 · V11 OPV11-8）
//
// 【它治什么】
//   V10 起 `render/inject.js` 的注入面靠**四件齐做**的人肉纪律维持：
//     ① SOURCES 源表登记 ② applyInjections 里的 vis.X 分支 ③ def 默认值 ④ 面板 VIS_NAMES 显示名
//   既有 tests/inject-sources-v2560.js 已经用 A/A2/B/C/D 五条判据锁住了**这四件事之间**的双向
//   一致性。但它锁的仍然是「源表内部」这一个面 —— **第五张表从来没有被纳入判据**：
//     ⑤ 全仓真实存在的 `WA.<ns>.buildBlock` 集合
//   后果是实测出来的（V11 立项第零节硬读数）：SOURCES **115** 条、buildBlock **114** 台、
//   差集 **8** 台，三个数字互相咬不上，而没有一条门禁把这层错位抓出来。更隐蔽的是反向：
//   SOURCES 里有 **9** 项自己**没有** buildBlock —— 它们由 `buildWorldSnapshot()` 内联成块
//   或走各自的取数口。这一面同样无人断言，于是「源表项没有产出路径」也能长期隐形。
//
// 【本锁的判据形态：五表交叉 + 双面白名单 + 闭合等式】
//   T1  SOURCES 数组可解析且非空（真源唯一，与 v2560 共用同一个解析器）。
//   T2  SOURCES 每项在 def 有默认值（复刻 v2560 [C]，作为五表交叉的一环就地断言）。
//   T3  SOURCES 每项在面板 VIS_NAMES 有显示名（复刻 v2560 [D]）。
//   T4  SOURCES 每项在真代码面有 `vis.X` 读取点（复刻 v2560 [B]）。
//   T5  SOURCES 每项**要么**真实存在 buildBlock，**要么**在 `SOURCE_WITHOUT_BUILDBLOCK`
//       白名单里，且该白名单项的 `verify` 断言在现场成立。
//   T6  buildBlock 集合每项**要么**在 SOURCES 里，**要么**在 `NON_SOURCE_BUILDBLOCK`
//       白名单里，且该白名单项的 `verify` 断言在现场成立。
//   T7  闭合等式**双向**成立：`SOURCES = 交集 + 无 buildBlock 白名单`、
//       `buildBlock 集合 = 交集 + 非源白名单`。任一侧多一项或少一项都现形。
//   T8  白名单**不许过期**：白名单里登记了但现场已不存在的项 ⇒ 红灯（防止「改了代码忘了改表」
//       之后白名单变成一层长期免检的空洞）。
//   T9  白名单每条**必须**有非空 `reason`（裁决理由），且 `verify` 必须是可执行断言名 ——
//       这条是「白名单不许凭空空缺」的形式化：登记一个名字而说不出理由，直接红灯。
//
// 【为什么白名单不可绕开】
//   「未接入的引擎」有两种完全不同的处境：**真死面**（没人要）与**走别的通道**（只是不走
//   SOURCES）。把前者当后者登记，就是拿白名单当遮羞布。故每条白名单都绑定一个 `verify`：
//     · subsource  —— 由 v2560 的 SUBSOURCES 声明统管源，且统管源确在 SOURCES；
//     · workflow   —— 该引擎自注册 `workflow.register({chain:'before'})` 并 `ctx.injections.push`；
//     · reasoning  —— 产品代码（非 tests/tools）里确有一处 `WA.<ns>.buildBlock` 调用点；
//     · editor     —— dead-export 账本里如实登记为 `test-only`；
//     · dead       —— dead-export 账本里如实登记为 `self-only`；
//     · inline     —— `buildWorldSnapshot()` 真代码面里确有 `vis.<key>` 分支；
//     · ownBuilder —— 该源分支真的调用了自有的取数口（buildMemoryBlock 等）。
//   裁决变了而代码没变、或代码变了而裁决没变，**两个方向都会红**。
//
// 【判据纯度与两向自证】
//   判据只吃**真代码面**（`inventory.codeFace` 剥注释与字符串字面量），故在注释里写一句
//   「intentBoard 是推演通道」不算裁决成立。负控制一律「真源码/真白名单破坏 → 在破坏副本上
//   重跑**同款判据**」，且破坏锚点必须恰中 1 次，否则抛（锚点不存在/不唯一即红灯）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const inventory = require('./inventory.js');
const codeFace = inventory.codeFace;
const v2560 = require('./inject-sources-v2560.js');
const INJECT_REL = 'render/inject.js';
const PANEL_REL = 'ui/panel.js';
const LEDGER_REL = 'tests/dead-export-ledger.json';
/**
 * 只剥注释、**保留字符串字面量**的扫描器（与 inventory.codeFace 互补）。
 * 为什么必须再写一个：codeFace 把字符串整体抹成空格（那是「提及不算引用」的正确口径），
 *   但本锁有一条判据要看**字符串内容本身** —— `workflow.register({ chain: 'before' })`
 *   的 `'before'` 与 `ctx.injections.push({ source: '变量驱动' })` 的 `'变量驱动'` 都是字面量。
 *   用 raw 源码能读到它们，但注释里写一句 `chain: 'before'` 就能骗过判据；
 *   故这里剥注释而不剥字符串：注释里的字面量不算数，真代码里的才算。
 */
function stripCommentsKeepStrings(src) {
  let out = '';
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i += 1; } continue; }
    if (c === '/' && d === '*') {
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += (src[i] === '\n' ? '\n' : ' '); i += 1; }
      out += '  '; i += 2; continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c; i += 1;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    out += c; i += 1;
  }
  return out;
}
// ─────────────────────────────────────────────────────────────────────────────
// 白名单 A：有 buildBlock、但**不是** SOURCES 源。V11 立项实测差集 8 台，逐台裁决。
//   顺序即裁决顺序：子源（3） / 走别的注入通道（2） / 编辑面（2） / 真死面（1）。
//   v2.382.0（幽灵引用治理批次⑦）：现场差集已由 8 变 11 —— v2.360.0 之后新增的三台
//   （eccentricThreads / offstageLife / routinePacing）走 inject-collector 第三通道，见下方补登记。
// ─────────────────────────────────────────────────────────────────────────────
const NON_SOURCE_BUILDBLOCK = {
  memorySampler: { verify: 'subsource', reason: '记忆采样器：由 memory 源统管、不单独设可见性开关（v2560 SUBSOURCES 已声明），块随记忆源一并进出正文' },
  pmem: { verify: 'subsource', reason: '提示词记忆：由 memory 源统管的子源，供记忆块组装取料，独立开关会让它与记忆源互斥' },
  summarizer: { verify: 'subsource', reason: '摘要器：由 memory 源统管的子源，产出是记忆块的一节而非独立注入项' },
  // ↓ 两台真正"进了正文"但不是走 SOURCES 的——这正是本锁存在的最强理由：
  //   它们看起来「没接入」（SOURCES 里查无此名），实际每轮都在往正文写东西。
  kaleidoscope: { verify: 'workflow', reason: '变量驱动条款：自注册 workflow before 链 order 22，直接 ctx.injections.push，不经 SOURCES 也不受 vis 开关管辖（属第三通道）' },
  intentBoard: { verify: 'reasoning', reason: '人物意图看板：块进的是推演引擎上下文（backstage.buildContext），不是正文注入——给正文的是 plan.buildBlock，两者分工固定' },
  // ↓ 编辑面：buildBlock 只是把编辑器当前态导成一段可读文本，正文侧无消费者。
  editorFaction: { verify: 'editor', reason: '势力编辑器：buildBlock 供编辑态导出/对照，产品侧零引用（死面账本 test-only），正文不需要知道编辑器里躺着什么' },
  editorEvents: { verify: 'editor', reason: '事件链编辑器：buildBlock 供编辑态导出/对照，产品侧零引用（死面账本 test-only），理由同上' },
  // ↓ 真死面：门面聚合会与 beatReport / genGate 重复，故门面自身不产注入块。
  beatFacade: { verify: 'dead', reason: '拍门面：真正的产块者是 beatReport / genGate（二者均已在 SOURCES），门面再产一块会与它们重复；自身 buildBlock 外部零引用，已入死面账本 self-only' },
  // v2.382.0 补登记：这三台的 buildBlock 由 engines/inject-collector.js 直接调用、折叠进正文，
  //   属「不经 SOURCES / 不受 vis 开关管辖」的第三通道（与 kaleidoscope 的 workflow 通道同理）。
  //   它们没有 def / VIS_NAMES / vis.X 分支，故**不能**塞进 SOURCES（否则 T2/T3/T4 恒红）。
  //   裁决用 reasoning（judge 里 = 产品侧确有 WA.<ns>.buildBlock 调用点），现场证据即
  //   inject-collector.js 的 185 / 261 / 283 三处真实调用；不是死面、不是拿白名单遮羞。
  eccentricThreads: { verify: 'reasoning', reason: '市井奇闻：engines/inject-collector.js 直接调 buildBlock 折叠入正文，产品侧真调用点，非死面' },
  offstageLife: { verify: 'reasoning', reason: '台下生活：engines/inject-collector.js 直接调 buildBlock 折叠入正文，产品侧真调用点，非死面' },
  routinePacing: { verify: 'reasoning', reason: '时序节律：engines/inject-collector.js 直接调 buildBlock 折叠入正文，产品侧真调用点，非死面' }
};
// ─────────────────────────────────────────────────────────────────────────────
// 白名单 B：SOURCES 源、但该命名空间上**没有** buildBlock。V11 立项实测 9 项，两种产出方式。
//   v2.382.0（幽灵引用治理批次⑦）：现场差集已由 9 变 11 —— 新增两台自有取数口源，见下方补登记。
// ─────────────────────────────────────────────────────────────────────────────
const SOURCE_WITHOUT_BUILDBLOCK = {
  clock: { verify: 'inline', reason: '世界时间：由 buildWorldSnapshot 直接读 s.clock.label 内联成行，无独立块' },
  pulse: { verify: 'inline', reason: '世界脉搏：由 buildWorldSnapshot 直接读 s.worldPulse 内联成行，无独立块' },
  background: { verify: 'inline', reason: '世界背景：由 buildWorldSnapshot 直接读 s.background.text 内联成行，无常驻模块（store 直供）' },
  people: { verify: 'inline', reason: '人物此刻：由 buildWorldSnapshot 扫 s.people 内联成行，无常驻模块（store 直供）' },
  currents: { verify: 'inline', reason: '可感知暗流：由 buildWorldSnapshot 扫 s.currents 内联成行，无常驻模块（store 直供）' },
  echoes: { verify: 'inline', reason: '已结算回声：由 buildWorldSnapshot 扫 s.echoes 内联成行，无常驻模块（store 直供）' },
  memory: { verify: 'ownBuilder', builder: 'buildMemoryBlock', reason: '记忆块：命名空间自带 buildMemoryBlock 取数口（同一个 ns 上不放两个 builder 名）' },
  opinion: { verify: 'ownBuilder', builder: 'buildOpinionBlock', reason: '舆情块：命名空间自带 buildOpinionBlock 取数口' },
  ledger: { verify: 'ownBuilder', builder: 'buildLedgerText', reason: '重大事件账本：命名空间自带 buildLedgerText 取数口' },
  // v2.382.0 补登记：两处取数口调用都在 applyInjections 内（render/inject.js 1541 / 1542），
  //   judge 的 ownBuilder 会逐字验证 vis.<k> 与 WA.<k>.<builder>( 同时在场，非凭空登记。
  personalInventory: { verify: 'ownBuilder', builder: 'buildInventoryFeed', reason: '随身行囊：源走自有的 buildInventoryFeed 取数口，同一 ns 上不放两个 builder 名' },
  metabolismClock: { verify: 'ownBuilder', builder: 'buildVitalsFeed', reason: '生理代谢：源走自有的 buildVitalsFeed 取数口，同一 ns 上不放两个 builder 名' }
};
// ─────────────────────────────────────────────────────────────────────────────
// 源码切片工具
// ─────────────────────────────────────────────────────────────────────────────
/** applyInjections 的函数体（真代码面）：从方法名起切到文件末 */
function applyBody(face) {
  const at = face.indexOf('applyInjections');
  if (at < 0) throw new Error('判据失效：真代码面里找不到 applyInjections（方法被改名或删除）');
  return face.slice(at);
}
/** buildWorldSnapshot 的函数体（真代码面）：方法名起切到它的结束 `},` */
function snapBody(face) {
  const at = face.indexOf('buildWorldSnapshot()');
  if (at < 0) throw new Error('判据失效：真代码面里找不到 buildWorldSnapshot（方法被改名或删除）');
  const end = face.indexOf('\n    },', at);
  if (end < 0) throw new Error('判据失效：buildWorldSnapshot 函数体未闭合');
  return face.slice(at, end);
}
/** def 键集（真代码面解析：注释已剥、字符串已剥，键名保留） */
function parseDefKeys(face) {
  const a0 = face.indexOf('def: {');
  if (a0 < 0) throw new Error('判据失效：找不到 def 声明');
  const a = a0 + 'def: {'.length;
  const b = face.indexOf('}, module:', a);
  if (b < 0) throw new Error('判据失效：def 声明未闭合');
  const out = [];
  const re = /([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  const seg = face.slice(a, b);
  while ((m = re.exec(seg))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
/** 面板 VIS_NAMES 的键集 */
function parseVisNames(panelFace) {
  const at = panelFace.indexOf('VIS_NAMES');
  if (at < 0) throw new Error('判据失效：ui/panel.js 真代码面里找不到 VIS_NAMES');
  const seg = panelFace.slice(at, panelFace.indexOf('};', at) + 2);
  const out = [];
  const re = /([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  while ((m = re.exec(seg))) if (m[1] !== 'VIS_NAMES' && out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
// ─────────────────────────────────────────────────────────────────────────────
// verify 各面：每条白名单项都必须有一条真实成立的现场证据
// ─────────────────────────────────────────────────────────────────────────────
/** 产品侧（除 tests/ tools/）里 `WA.<ns>.buildBlock` 的真实调用点计数 */
function productCallSites(ns) {
  const re = new RegExp('WA\\.' + ns + '\\.buildBlock\\b');
  let n = 0;
  const hits = [];
  inventory.PRODUCT_FILES.forEach(function (rel) {
    let src;
    try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { return; }
    const face = codeFace(src);
    if (re.test(face)) { n += 1; hits.push(rel); }
  });
  return { count: n, files: hits };
}
/** workflow 通道：该引擎自注册 before 链节点并直接 push 到 ctx.injections */
function workflowChannel(ns, sourcesById) {
  const rel = sourcesById[ns];
  if (!rel) return { ok: false, why: '找不到 ' + ns + ' 的源文件' };
  let raw;
  try { raw = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { return { ok: false, why: '读取失败 ' + rel }; }
  // 注释已剥、字符串保留：注释里写一句 chain:'before' 骗不过判据，真注册才算
  const face = stripCommentsKeepStrings(raw);
  const hasRegister = /workflow\.register\s*\(\s*\{[^}]*chain:\s*'before'/.test(face);
  const hasPush = /ctx\.injections\.push\s*\(/.test(face);
  if (!hasRegister) return { ok: false, why: rel + ' 里没有 workflow.register({chain:\'before\'})' };
  if (!hasPush) return { ok: false, why: rel + ' 注册了 before 节点但从不 ctx.injections.push（不算注入通道）' };
  return { ok: true, why: rel };
}
/** 死面账本里某导出的归因 */
function ledgerReason(ledger, key) {
  if (!ledger || typeof ledger !== 'object') return null;
  const kinds = ['dead', 'uiDead'];
  for (let i = 0; i < kinds.length; i++) {
    const seg = ledger[kinds[i]];
    if (seg && Object.prototype.hasOwnProperty.call(seg, key)) {
      const rec = seg[key] || {};
      return { kind: kinds[i], reason: String(rec.reason || ''), detail: String(rec.detail || '') };
    }
  }
  return null;
}
/** 运行时可执行面：全仓 `WA.<ns>` 里带 buildBlock 的命名空间（真值，不是静态猜的） */
function runtimeBuildBlockKeys() {
  const sync = require('./ui-gate-sync.js');
  const env = sync.fresh();
  const WA = env.WA;
  return Object.keys(WA).filter(function (k) {
    return WA[k] && typeof WA[k].buildBlock === 'function';
  }).sort();
}
/** ns → 源文件相对路径（用定价表：文件头声明的 WA.<ns> = {...}） */
function sourceFileMap() {
  const map = Object.create(null);
  const enginesDir = path.join(BASE, 'engines');
  fs.readdirSync(enginesDir).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    const rel = 'engines/' + f;
    let face;
    try { face = codeFace(fs.readFileSync(path.join(enginesDir, f), 'utf8')); } catch (e) { return; }
    const re = /WA\.([A-Za-z_$][\w$]*)\s*=\s*\{/g;
    let m;
    while ((m = re.exec(face))) {
      if (!map[m[1]]) map[m[1]] = rel;   // 首见即主文件（同 ns 多处定义时以先加载者为准）
    }
  });
  return map;
}
// ─────────────────────────────────────────────────────────────────────────────
// 判据总入口：对给定源码/白名单/运行时真值运行全部面
//   负控制就是「改一处入参 → 重跑**同一个** judge」
// ─────────────────────────────────────────────────────────────────────────────
function judge(opts) {
  const o = opts || {};
  const injectSrc = o.injectSrc;
  const panelSrc = o.panelSrc;
  const runtimeKeys = o.runtimeKeys || [];
  const ledger = o.ledger || null;
  const noBuild = o.noBuild || SOURCE_WITHOUT_BUILDBLOCK;
  const nonSource = o.nonSource || NON_SOURCE_BUILDBLOCK;
  const srcMap = o.srcMap || (function () { try { return sourceFileMap(); } catch (e) { return Object.create(null); } })();
  const face = codeFace(injectSrc);
  const pFace = codeFace(panelSrc);
  const snap = snapBody(face);
  const apply = applyBody(face);
  const sources = v2560.parseSources(injectSrc);
  const defKeys = parseDefKeys(face);
  const visNames = parseVisNames(pFace);
  const inSources = Object.create(null);
  sources.forEach(function (k) { inSources[k] = 1; });
  const inRuntime = Object.create(null);
  runtimeKeys.forEach(function (k) { inRuntime[k] = 1; });
  const out = {
    sources: sources,
    runtimeKeys: runtimeKeys,
    intersection: [],
    missingDef: [],
    missingName: [],
    missingVis: [],
    srcNoBlock_notWhitelisted: [],
    blockNoSrc_notWhitelisted: [],
    whitelistFail: [],
    expired: [],
    noReason: [],
    closure: null
  };
  // 交集：既在源表、又真在运行时带 buildBlock
  sources.forEach(function (k) { if (inRuntime[k]) out.intersection.push(k); });
  // T2/T3/T4：源表项的三面跟随（与 v2560 同口径，交叉断言就地复算）
  sources.forEach(function (k) {
    if (defKeys.indexOf(k) < 0) out.missingDef.push(k);
    if (visNames.indexOf(k) < 0) out.missingName.push(k);
    if (!(new RegExp('vis\\.' + k + '\\b')).test(face)) out.missingVis.push(k);
  });
  // T5：源表项必须有产出路径（真 buildBlock 或白名单 + 证据）
  sources.forEach(function (k) {
    if (inRuntime[k]) return;
    const w = noBuild[k];
    if (!w) { out.srcNoBlock_notWhitelisted.push(k); return; }
    if (!w.reason || !String(w.reason).trim()) { out.noReason.push('SOURCE_WITHOUT_BUILDBLOCK.' + k); return; }
    let ok = false, why = '';
    if (w.verify === 'inline') {
      ok = (new RegExp('vis\\.' + k + '\\b')).test(snap);
      why = ok ? 'buildWorldSnapshot 内联分支在场' : 'buildWorldSnapshot 里找不到 vis.' + k + ' 分支';
    } else if (w.verify === 'ownBuilder') {
      ok = (new RegExp('vis\\.' + k + '\\b')).test(apply)
        && (new RegExp('WA\\.' + k + '\\.' + w.builder + '\\s*\\(')).test(apply);
      why = ok ? '自有取数口 ' + w.builder + ' 被真实调用' : '注入链里找不到 WA.' + k + '.' + w.builder + ' 的调用点';
    } else {
      why = '未知 verify 类型：' + w.verify;
    }
    if (!ok) out.whitelistFail.push('SOURCE_WITHOUT_BUILDBLOCK.' + k + '（' + why + '）');
  });
  // T6：buildBlock 集合项必须有归属（在源表 或 白名单 + 证据）
  runtimeKeys.forEach(function (ns) {
    if (inSources[ns]) return;
    const w = nonSource[ns];
    if (!w) { out.blockNoSrc_notWhitelisted.push(ns); return; }
    if (!w.reason || !String(w.reason).trim()) { out.noReason.push('NON_SOURCE_BUILDBLOCK.' + ns); return; }
    let ok = false, why = '';
    if (w.verify === 'subsource') {
      const owner = v2560.SUBSOURCES[ns];
      ok = !!owner && inSources[owner] === 1;
      why = owner ? ('统管源 ' + owner + ' 不在 SOURCES') : '未在 v2560 SUBSOURCES 里声明统管源';
    } else if (w.verify === 'workflow') {
      const r = workflowChannel(ns, srcMap);
      ok = r.ok; why = r.why;
    } else if (w.verify === 'reasoning') {
      const r = productCallSites(ns);
      ok = r.count > 0;
      why = ok ? '' : '产品侧零调用点（这不是「走别的通道」，这是死面）';
    } else if (w.verify === 'editor') {
      const r = ledgerReason(ledger, ns + '.buildBlock');
      ok = !!r && r.reason === 'test-only';
      why = r ? ('死面账本归因为 ' + r.reason + '（期望 test-only）') : ('死面账本里没有 ' + ns + '.buildBlock');
    } else if (w.verify === 'dead') {
      const r = ledgerReason(ledger, ns + '.buildBlock');
      ok = !!r && r.reason === 'self-only';
      why = r ? ('死面账本归因为 ' + r.reason + '（期望 self-only）') : ('死面账本里没有 ' + ns + '.buildBlock');
    } else {
      why = '未知 verify 类型：' + w.verify;
    }
    if (!ok) out.whitelistFail.push('NON_SOURCE_BUILDBLOCK.' + ns + '（' + why + '）');
  });
  // T8：白名单不许过期（登记了但现场已不存在 / 或现场已进源表）
  Object.keys(noBuild).forEach(function (k) {
    if (inSources[k] && inRuntime[k]) out.expired.push('SOURCE_WITHOUT_BUILDBLOCK.' + k + '（该源已带 buildBlock，白名单项作废）');
    else if (!inSources[k]) out.expired.push('SOURCE_WITHOUT_BUILDBLOCK.' + k + '（该源已不在 SOURCES）');
  });
  Object.keys(nonSource).forEach(function (k) {
    if (!inRuntime[k]) out.expired.push('NON_SOURCE_BUILDBLOCK.' + k + '（该 ns 已无 buildBlock）');
    else if (inSources[k]) out.expired.push('NON_SOURCE_BUILDBLOCK.' + k + '（该 ns 已进 SOURCES）');
  });
  // T7：闭合等式双向
  const outside = runtimeKeys.filter(function (k) { return inSources[k] !== 1; });
  const inline = sources.filter(function (k) { return inRuntime[k] !== 1; });
  out.closure = {
    sources: sources.length,
    runtimeKeys: runtimeKeys.length,
    intersection: out.intersection.length,
    inline: inline.length,
    outside: outside.length,
    // sources == intersection + inline ；runtimeKeys == intersection + outside
    lhsOk: sources.length === out.intersection.length + inline.length,
    rhsOk: runtimeKeys.length === out.intersection.length + outside.length,
    // 白名单两侧的规模必须与实测差集逐一对上（多登记一项 = 遮羞布）
    noBuildSize: Object.keys(noBuild).length,
    nonSourceSize: Object.keys(nonSource).length,
    inlineSet: inline.slice(),
    outsideSet: outside.slice()
  };
  return out;
}
function readAll() {
  return {
    injectSrc: fs.readFileSync(path.join(BASE, INJECT_REL), 'utf8'),
    panelSrc: fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8'),
    ledger: JSON.parse(fs.readFileSync(path.join(BASE, LEDGER_REL), 'utf8'))
  };
}
// ─────────────────────────────────────────────────────────────────────────────
// 正向面
// ─────────────────────────────────────────────────────────────────────────────
function runAll(a) {
  const F = readAll();
  const runtimeKeys = runtimeBuildBlockKeys();
  const j = judge({ injectSrc: F.injectSrc, panelSrc: F.panelSrc, runtimeKeys: runtimeKeys, ledger: F.ledger });
  // v2.382.0（幽灵引用治理批次⑦）：立项基线 115 / 114 被 v2.360.0 之后新增的注入源与
  //   buildBlock 顶过期；现场复算 SOURCES 144、runtimeKeys 144。与 checked 187→185、
  //   cap-tier 70→74 同属「表跟位」，改前改后均以本脚本 N0~N6 双向自证验收。
  a(j.sources.length === 144, 'v11src: [T1] SOURCES 解析到 ' + j.sources.length + ' 项（v2.382.0 现场基线 144；立项 115）');
  a(j.runtimeKeys.length === 144, 'v11src: [T1] 运行时 buildBlock 命名空间 ' + j.runtimeKeys.length + ' 台（v2.382.0 现场基线 144；立项 114）');
  a(j.missingDef.length === 0, 'v11src: [T2] 源表每项在 def 有默认值（缺: ' + (j.missingDef.join(',') || '无') + '）');
  a(j.missingName.length === 0, 'v11src: [T3] 源表每项有面板显示名（缺: ' + (j.missingName.join(',') || '无') + '）');
  a(j.missingVis.length === 0, 'v11src: [T4] 源表每项有 vis 读取点（缺: ' + (j.missingVis.join(',') || '无') + '）');
  a(j.srcNoBlock_notWhitelisted.length === 0, 'v11src: [T5] 无 buildBlock 的源项全部有裁决（未裁决: ' + (j.srcNoBlock_notWhitelisted.join(',') || '无') + '）');
  a(j.blockNoSrc_notWhitelisted.length === 0, 'v11src: [T6] 未进源表的 buildBlock 全部有归属（未归属: ' + (j.blockNoSrc_notWhitelisted.join(',') || '无') + '）');
  a(j.whitelistFail.length === 0, 'v11src: [T6] 白名单逐条证据成立（证伪: ' + (j.whitelistFail.join(' | ') || '无') + '）');
  a(j.expired.length === 0, 'v11src: [T8] 白名单无过期项（过期: ' + (j.expired.join(',') || '无') + '）');
  a(j.noReason.length === 0, 'v11src: [T9] 白名单每条都有裁决理由（缺理由: ' + (j.noReason.join(',') || '无') + '）');
  a(j.closure.lhsOk, 'v11src: [T7] 闭合等式 SOURCES = 交集 + 内联（' + j.closure.sources + ' = ' + j.closure.intersection + ' + ' + j.closure.inline + '）');
  a(j.closure.rhsOk, 'v11src: [T7] 闭合等式 buildBlock = 交集 + 非源（' + j.closure.runtimeKeys + ' = ' + j.closure.intersection + ' + ' + j.closure.outside + '）');
  a(j.closure.inline === j.closure.noBuildSize, 'v11src: [T7] 内联差集 ' + j.closure.inline + ' 与白名单 B 规模 ' + j.closure.noBuildSize + ' 相等（多登记即遮羞布）');
  a(j.closure.outside === j.closure.nonSourceSize, 'v11src: [T7] 非源差集 ' + j.closure.outside + ' 与白名单 A 规模 ' + j.closure.nonSourceSize + ' 相等');
  // 逐字对账：差集名单与白名单键集必须**同名**（不只是同规模）
  const noBuildKeys = Object.keys(SOURCE_WITHOUT_BUILDBLOCK).sort().join(',');
  a(j.closure.inlineSet.slice().sort().join(',') === noBuildKeys, 'v11src: [T7] 内联差集名单 == 白名单 B 键集（实测: ' + j.closure.inlineSet.join(',') + '）');
  const nonSourceKeys = Object.keys(NON_SOURCE_BUILDBLOCK).sort().join(',');
  a(j.closure.outsideSet.slice().sort().join(',') === nonSourceKeys, 'v11src: [T7] 非源差集名单 == 白名单 A 键集（实测: ' + j.closure.outsideSet.join(',') + '）');
  return j;
}
// ─────────────────────────────────────────────────────────────────────────────
// 负控制：真源码 / 真白名单破坏 → 破坏副本上重跑**同款** judge
// ─────────────────────────────────────────────────────────────────────────────
function runNegative(a) {
  const F = readAll();
  const runtimeKeys = runtimeBuildBlockKeys();
  const base = { panelSrc: F.panelSrc, runtimeKeys: runtimeKeys, ledger: F.ledger };
  const pristine = judge(Object.assign({ injectSrc: F.injectSrc }, base));
  // N0：原版全绿（正反成对：不是把判据写死）
  a(pristine.srcNoBlock_notWhitelisted.length === 0 && pristine.blockNoSrc_notWhitelisted.length === 0
    && pristine.whitelistFail.length === 0 && pristine.expired.length === 0,
    'v11src: [N0] 原版上五表交叉判据全绿（双向自证的前提）');
  // N1：源表删一项（该源无 buildBlock 又在白名单里）⇒ T5/T8/T7 必须现形
  {
    const anchor = "'clock'";
    const n = F.injectSrc.slice(F.injectSrc.indexOf('const SOURCES = ['), F.injectSrc.indexOf('];', F.injectSrc.indexOf('const SOURCES = ['))).split(anchor).length - 1;
    a(n === 1, 'v11src: [N1a] 源表破坏锚点 ' + anchor + ' 在 SOURCES 段内恰中 1 次（实 ' + n + ' 次）');
    const a0 = F.injectSrc.indexOf('const SOURCES = [');
    const b0 = F.injectSrc.indexOf('];', a0);
    const broken = F.injectSrc.slice(0, a0) + F.injectSrc.slice(a0, b0).replace(anchor, "''") + F.injectSrc.slice(b0);
    a(broken !== F.injectSrc, 'v11src: [N1b] 破坏确实改写了源码');
    const jb = judge(Object.assign({ injectSrc: broken }, base));
    a(jb.expired.some(function (x) { return x.indexOf('clock') >= 0; }), 'v11src: [N1c] 破坏后 [T8] 现形（白名单项已不在源表）');
    a(jb.closure.lhsOk === false || jb.closure.sources !== pristine.closure.sources, 'v11src: [N1d] 破坏后 [T7] 闭合等式现形');
  }
  // N2：把一台真实存在的非源 buildBlock（intentBoard）从白名单 A 删掉 ⇒ T6 必须现形
  {
    const bn = Object.assign({}, NON_SOURCE_BUILDBLOCK);
    delete bn.intentBoard;
    const jb = judge(Object.assign({ injectSrc: F.injectSrc, nonSource: bn }, base));
    a(jb.blockNoSrc_notWhitelisted.indexOf('intentBoard') >= 0,
      'v11src: [N2] 白名单删项后 [T6] 现形（未归属: ' + jb.blockNoSrc_notWhitelisted.join(',') + '）');
  }
  // N3：把两台的 verify 归因互换成「另一种错误归因」⇒ 证据面必须现形
  //     把 intentBoard 从 reasoning 改成 dead：它的账本归因是 test-only，不是 self-only
  {
    const bn = Object.assign({}, NON_SOURCE_BUILDBLOCK);
    bn.intentBoard = { verify: 'dead', reason: '故意错报成真死面' };
    const jb = judge(Object.assign({ injectSrc: F.injectSrc, nonSource: bn }, base));
    a(jb.whitelistFail.some(function (x) { return x.indexOf('intentBoard') >= 0; }),
      'v11src: [N3a] 错报归因后证据面现形（intentBoard 不是 self-only 死面）');
    const bn2 = Object.assign({}, NON_SOURCE_BUILDBLOCK);
    bn2.beatFacade = { verify: 'reasoning', reason: '故意错报成有产品消费者' };
    const jb2 = judge(Object.assign({ injectSrc: F.injectSrc, nonSource: bn2 }, base));
    a(jb2.whitelistFail.some(function (x) { return x.indexOf('beatFacade') >= 0; }),
      'v11src: [N3b] 错报归因后证据面现形（beatFacade 产品侧零调用）');
  }
  // N4：真源码破坏——把 kaleidoscope 的 workflow 注册改成 after 链 ⇒ workflow 通道证据必须翻红
  {
    const rel = 'engines/kaleidoscope.js';
    const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
    const anchor = "id: 'kaleidoscope.inject', chain: 'before'";
    const n = src.split(anchor).length - 1;
    a(n === 1, 'v11src: [N4a] workflow 破坏锚点在 ' + rel + ' 恰中 1 次（实 ' + n + ' 次）');
    const brokenSrc = src.replace(anchor, "id: 'kaleidoscope.inject', chain: 'after'");
    // 走**同一个** stripCommentsKeepStrings：证明该判据真读源码且真读字符串内容
    const face = stripCommentsKeepStrings(brokenSrc);
    const hasRegister = /workflow\.register\s*\(\s*\{[^}]*chain:\s*'before'/.test(face);
    a(hasRegister === false, 'v11src: [N4b] 改成 after 链后 before 注册判据翻假（说明该判据真读源码）');
    const faceOk = stripCommentsKeepStrings(src);
    a(/workflow\.register\s*\(\s*\{[^}]*chain:\s*'before'/.test(faceOk) === true, 'v11src: [N4c] 原版上同款判据仍为真');
    // N4d：把 'before' 只写进注释（真代码改成 after）⇒ 必须仍判假（证明不是「源码里搜到字面量就算」）
    const sneaky = src.replace(anchor, "id: 'kaleidoscope.inject', chain: 'after' /* chain: 'before' */");
    const sneakyFace = stripCommentsKeepStrings(sneaky);
    a(/workflow\.register\s*\(\s*\{[^}]*chain:\s*'before'/.test(sneakyFace) === false,
      'v11src: [N4d] 把 before 藏进注释不得被当成真注册（注释里的字面量不算数）');
  }
  // N5：白名单条目缺理由 ⇒ T9 必须现形
  {
    const bn = Object.assign({}, SOURCE_WITHOUT_BUILDBLOCK);
    bn.memory = { verify: 'ownBuilder', builder: 'buildMemoryBlock', reason: '   ' };
    const jb = judge(Object.assign({ injectSrc: F.injectSrc, noBuild: bn }, base));
    a(jb.noReason.some(function (x) { return x.indexOf('memory') >= 0; }),
      'v11src: [N5] 白名单缺理由后 [T9] 现形（缺理由: ' + jb.noReason.join(',') + '）');
  }
  // N6：把 memory 的 ownBuilder 名字改错 ⇒ 证据面必须现形（防止「登记了名字就算数」）
  {
    const bn = Object.assign({}, SOURCE_WITHOUT_BUILDBLOCK);
    bn.memory = { verify: 'ownBuilder', builder: 'buildBlockThatDoesNotExist', reason: '故意写错的取数口' };
    const jb = judge(Object.assign({ injectSrc: F.injectSrc, noBuild: bn }, base));
    a(jb.whitelistFail.some(function (x) { return x.indexOf('memory') >= 0; }),
      'v11src: [N6] 取数口名字写错后证据面现形');
  }
}
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); }
  };
  runAll(a);
  runNegative(a);
  if (fail) { console.log('V11-SOURCE-CONTRACT: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('V11-SOURCE-CONTRACT: pass（' + pass + ' 项）');
}
module.exports = {
  judge: judge, runAll: runAll, runNegative: runNegative,
  NON_SOURCE_BUILDBLOCK: NON_SOURCE_BUILDBLOCK,
  SOURCE_WITHOUT_BUILDBLOCK: SOURCE_WITHOUT_BUILDBLOCK,
  runtimeBuildBlockKeys: runtimeBuildBlockKeys,
  productCallSites: productCallSites, workflowChannel: workflowChannel, sourceFileMap: sourceFileMap
};