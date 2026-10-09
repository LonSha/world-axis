#!/usr/bin/env node
// WorldAxis tests/inject-sources-v2560.js —— 注入源表 × 注入分支 双向成类锁（v2.56.0）
//
// 【缺陷】v2.52.0~v2.55.0 往 applyInjections 里先后加了四条注入分支（life / intel / org /
//   longline），四次都没有登记进 SOURCES 与 def。后果三重，而**既有守卫一条都照不到**：
//     ① 面板上这四项没有可见性开关，用户关不掉单个源；
//     ② 不在 def ⇒ 逃出「声明完整性 / 子键自愈 / undeclared 记账」三重校验；
//     ③ 反向守卫（SOURCES 有而 def 无、def 有而 SOURCES 无）两边都没有它 ⇒ 也照不到。
//   更隐蔽的是这四条分支当时**只判了模块在不在**（未读可见性）—— 于是即便事后补登记
//   SOURCES，面板开关依然点了零效果。这与 v2.38.0 的 echoes「复选框点了零效果」是同一种病。
//
// 【判据】（A/A2 治单边增长与假开关，B 治幽灵源，C 治与默认值脱节，D 治面板裸露英文键）
//   A  注入分支 → 源表：applyInjections 里每个 `WA.<ns>.buildBlock(` 的 ns 必须 ∈ SOURCES。
//      唯一例外是**子源**（由某个已登记源统管、不单独设开关），须在 SUBSOURCES 里显式声明
//      统管源，且声明处确实真读该统管源的开关。未声明的 ns ⇒ 红灯（强制显式决策）。
//   A2 源守卫必须走可见性通道：不得存在「只判源模块在不在、不读开关」的守卫形态。
//   B  源表 → 消费点：SOURCES 每一项都要在真代码面里有对应开关的读取点
//      （「声明了源却没人读」= 幽灵开关）。
//   C  SOURCES ⇄ def 键集**互为子集**（任一侧单边增长都现形）。
//   D  SOURCES 每一项在 ui/panel.js 的 VIS_NAMES 里都要有显示名，且 VIS_NAMES 不得有
//      超出 SOURCES 的键（反向：显示名指向不存在的源）。
//
// 【判据纯度与两向自证】判据只吃「真代码面」（codeFace 剥注释与字符串），故注释里写出
//   开关名不算消费点；负控制以「真源码破坏 → 在破坏副本上重跑**同款**判据」自证，
//   破坏锚点必须恰中 1 次，否则抛（工具两向自证：锚点不存在/不唯一即为红灯）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const codeFace = require('./inventory.js').codeFace;

const INJECT_REL = 'render/inject.js';
const PANEL_REL = 'ui/panel.js';

// 子源登记：值 = 统管它的已登记源。新增此类消费点必须在此显式声明，否则 A 判据红灯 ——
//   这样「这个模块为什么不单独设开关」永远有人答得出来，不会变成静默缺口。
const SUBSOURCES = { memorySampler: 'memory', pmem: 'memory', summarizer: 'memory' };

function applyBody(face) {
  const at = face.indexOf('applyInjections');
  if (at < 0) throw new Error('判据失效：真代码面里找不到 applyInjections（方法被改名或删除）');
  return face.slice(at);
}

/** 源码真源：SOURCES 数组（必须用原始源码解析——codeFace 会把字符串字面量剥掉） */
function parseSources(src) {
  const a = src.indexOf('const SOURCES = [');
  if (a < 0) throw new Error('判据失效：找不到 SOURCES 数组声明');
  if (src.indexOf('const SOURCES = [', a + 1) >= 0) throw new Error('判据失效：SOURCES 声明不唯一');
  const b = src.indexOf('];', a);
  if (b < 0) throw new Error('判据失效：SOURCES 数组未闭合');
  const seg = src.slice(a, b);
  const out = [];
  const re = /'([A-Za-z_$][\w$]*)'/g;
  let m;
  while ((m = re.exec(seg))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}

/** def 键集（真代码面解析：注释已剥，键名保留） */
function parseDefKeys(face) {
  const a0 = face.indexOf('def: {');
  if (a0 < 0) throw new Error('判据失效：找不到 def 声明');
  const a = a0 + 'def: {'.length;   // 从 `{` 之后开始——否则 `def` 自身会被当成一个键
  const b = face.indexOf('}, module:', a);
  if (b < 0) throw new Error('判据失效：def 声明未闭合');
  const seg = face.slice(a, b);
  const out = [];
  const re = /([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  while ((m = re.exec(seg))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}

/** A：注入分支 → 源表 */
function checkBranches(body, sources) {
  const r = { undeclared: [], badSub: [], subNotGuarded: [] };
  const seen = [];
  const re = /WA\.(\w+)\.buildBlock\(/g;
  let m;
  while ((m = re.exec(body))) if (seen.indexOf(m[1]) < 0) seen.push(m[1]);
  seen.forEach(function (ns) {
    if (sources.indexOf(ns) >= 0) return;
    if (Object.prototype.hasOwnProperty.call(SUBSOURCES, ns)) {
      const owner = SUBSOURCES[ns];
      if (sources.indexOf(owner) < 0) { r.badSub.push(ns + '→' + owner); return; }
      const idx = body.indexOf('WA.' + ns + '.buildBlock(');
      const seg = body.slice(Math.max(0, idx - 260), idx);
      if (seg.indexOf(owner) < 0) r.subNotGuarded.push(ns + '（未见其统管源 ' + owner + ' 的开关）');
      return;
    }
    r.undeclared.push(ns);
  });
  return r;
}

/** A2：不得存在「只判源模块在不在」的守卫（源必须走可见性通道） */
function checkModuleOnlyGuards(body, sources) {
  const hits = [];
  sources.forEach(function (k) { if (body.indexOf('if (WA.' + k + ')') >= 0) hits.push(k); });
  return hits;
}

/** B：SOURCES 每项须有开关读取点 */
function checkConsumed(face, sources) {
  return sources.filter(function (k) { return !(new RegExp('vis\\.' + k + '\\b')).test(face); });
}

/** C：SOURCES ⇄ def 互为子集 */
function checkDef(sources, defKeys) {
  return {
    notInDef: sources.filter(function (k) { return defKeys.indexOf(k) < 0; }),
    notInSrc: defKeys.filter(function (k) { return sources.indexOf(k) < 0; })
  };
}

/** D：源表 → 面板显示名（两向） */
function checkNames(sources, panelFace) {
  const at = panelFace.indexOf('VIS_NAMES');
  if (at < 0) throw new Error('判据失效：ui/panel.js 真代码面里找不到 VIS_NAMES');
  const seg = panelFace.slice(at, panelFace.indexOf('};', at) + 2);
  const keys = [];
  const re = /([A-Za-z_$][\w$]*)\s*:/g;
  let m;
  while ((m = re.exec(seg))) if (m[1] !== 'VIS_NAMES' && keys.indexOf(m[1]) < 0) keys.push(m[1]);
  return {
    unnamed: sources.filter(function (k) { return keys.indexOf(k) < 0; }),
    dangling: keys.filter(function (k) { return sources.indexOf(k) < 0; })
  };
}

/** 判据总入口：对给定源码文本运行全部面（负控制在破坏副本上重跑**同款**这一入口） */
function judge(injectSrc, panelSrc) {
  const face = codeFace(injectSrc);
  const pFace = codeFace(panelSrc);
  const sources = parseSources(injectSrc);
  const body = applyBody(face);
  return {
    sources: sources,
    defKeys: parseDefKeys(face),
    branches: checkBranches(body, sources),
    moduleOnly: checkModuleOnlyGuards(body, sources),
    unread: checkConsumed(face, sources),
    def: checkDef(sources, parseDefKeys(face)),
    names: checkNames(sources, pFace)
  };
}

/** SOURCES 段内定点破坏（锚点在段内必须恰中 1 次） */
function spliceSources(src, from, to) {
  const a = src.indexOf('const SOURCES = [');
  const b = src.indexOf('];', a);
  if (a < 0 || b < 0) throw new Error('判据失效：找不到 SOURCES 数组段');
  const seg = src.slice(a, b);
  const n = seg.split(from).length - 1;
  if (n !== 1) throw new Error('破坏锚点在 SOURCES 段内出现 ' + n + ' 次（须恰 1 次）');
  return { src: src.slice(0, a) + seg.replace(from, to) + src.slice(b), seg: seg };
}

function readAll() {
  return {
    inject: fs.readFileSync(path.join(BASE, INJECT_REL), 'utf8'),
    panel: fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8')
  };
}

/** 正向面 + 负控制面。a = 断言函数(cond, name, extra) */
function runAll(a) {
  const F = readAll();
  const j = judge(F.inject, F.panel);
  a(j.sources.length >= 15, 'v2560: 源表解析到 ' + j.sources.length + ' 项（≥15：含 v2.51.0 的 style 与本版补登记的四条分支）');
  a(j.branches.undeclared.length === 0, 'v2560: [A] 注入分支无一漏登记源表（漏: ' + (j.branches.undeclared.join(',') || '无') + '）');
  a(j.branches.badSub.length === 0, 'v2560: [A] 子源统管源均已登记（错: ' + (j.branches.badSub.join(',') || '无') + '）');
  a(j.branches.subNotGuarded.length === 0, 'v2560: [A] 子源确实受统管源开关守卫（缺: ' + (j.branches.subNotGuarded.join(',') || '无') + '）');
  a(j.moduleOnly.length === 0, 'v2560: [A2] 无「只判模块在不在」的源守卫（现形: ' + (j.moduleOnly.join(',') || '无') + '）');
  a(j.unread.length === 0, 'v2560: [B] 源表每项都有开关读取点（幽灵源: ' + (j.unread.join(',') || '无') + '）');
  a(j.def.notInDef.length === 0, 'v2560: [C] 源表每项在 def 有默认值（缺: ' + (j.def.notInDef.join(',') || '无') + '）');
  a(j.def.notInSrc.length === 0, 'v2560: [C] def 无超出源表的键（多余: ' + (j.def.notInSrc.join(',') || '无') + '）');
  a(j.names.unnamed.length === 0, 'v2560: [D] 源表每项都有面板显示名（缺: ' + (j.names.unnamed.join(',') || '无') + '）');
  a(j.names.dangling.length === 0, 'v2560: [D] 面板显示名无指向不存在的源（悬空: ' + (j.names.dangling.join(',') || '无') + '）');
}

/** 负控制：真源码破坏 → 破坏副本上重跑同款判据 */
function runNegative(a) {
  const F = readAll();
  const SRC_SEG_ANCHOR = "'longline'";
  const DEF_ANCHOR = 'life: true, intel: true, org: true, longline: true';
  const NAME_ANCHOR = "life: '人物生活',";
  const GATE_ANCHOR = 'vis.life && WA.life';

  // N1：把「源守卫读开关」还原成「只判模块存在」（旧缺陷形态）⇒ A2/B 必须现形
  {
    const n = F.inject.split(GATE_ANCHOR).length - 1;
    a(n === 1, 'v2560: [N1a] 破坏锚点在真源码中恰中 1 次（实 ' + n + ' 次）');
    const broken = F.inject.replace(GATE_ANCHOR, 'WA.life');
    a(broken !== F.inject, 'v2560: [N1b] 破坏确实改写了源码');
    const jb = judge(broken, F.panel);
    a(jb.moduleOnly.indexOf('life') >= 0, 'v2560: [N1c] 破坏后 [A2] 现形（源守卫不读开关）');
    a(jb.unread.indexOf('life') >= 0, 'v2560: [N1d] 破坏后 [B] 现形（开关读取点消失）');
    const jg = judge(F.inject, F.panel);
    a(jg.moduleOnly.indexOf('life') < 0 && jg.unread.indexOf('life') < 0, 'v2560: [N1e] 原版上同款判据仍成立（双向自证：不是把判据写死）');
  }
  // N2：源表删一项（该源仍被注入链消费）⇒ A 必须现形
  {
    const sp = spliceSources(F.inject, SRC_SEG_ANCHOR, '');
    const jb = judge(sp.src, F.panel);
    a(jb.branches.undeclared.length > 0, 'v2560: [N2] 源表删项后 [A] 现形（漏登: ' + jb.branches.undeclared.join(',') + '）');
  }
  // N3：def 删一项（源表仍有）⇒ C 必须现形
  {
    const n = F.inject.split(DEF_ANCHOR).length - 1;
    a(n === 1, 'v2560: [N3a] def 破坏锚点恰中 1 次（实 ' + n + ' 次）');
    const broken = F.inject.replace(DEF_ANCHOR, 'intel: true, org: true, longline: true');
    const jb = judge(broken, F.panel);
    a(jb.def.notInDef.indexOf('life') >= 0, 'v2560: [N3b] def 删项后 [C] 现形（源表项无默认值）');
  }
  // N4：面板显示名删一项 ⇒ D 必须现形
  {
    const n = F.panel.split(NAME_ANCHOR).length - 1;
    a(n === 1, 'v2560: [N4a] 显示名破坏锚点恰中 1 次（实 ' + n + ' 次）');
    const broken = F.panel.replace(NAME_ANCHOR, '');
    const jb = judge(F.inject, broken);
    a(jb.names.unnamed.indexOf('life') >= 0, 'v2560: [N4b] 删显示名后 [D] 现形（面板将裸露英文键）');
  }
}

if (require.main === module) {
  const nodeAssert = require('assert');
  let pass = 0, fail = 0;
  const a = function (cond, name, extra) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  runAll(a);
  runNegative(a);
  if (fail) { console.log('INJECT-SOURCES-V2560: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('INJECT-SOURCES-V2560: pass（' + pass + ' 项）');
  nodeAssert.ok(true);
}

module.exports = { judge: judge, runAll: runAll, runNegative: runNegative, parseSources: parseSources, SUBSOURCES: SUBSOURCES };
