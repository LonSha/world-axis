#!/usr/bin/env node
// WorldAxis tests/vis-default-v2260.js —— v2.260.0（V6 OPV6-5）注入源可见性缺省对账专锁
//
// 【它治的病（现场实测立据，非阅读推断）】
//   `worldaxis_inject_visibility_v1` 可以**整键不落盘**。探针 tools/v6probes/p_vis_default.js
//   实测出厂态 `localStorage.getItem(...) === null`：玩家从没配过，107 个源全走 `__REG.def`
//   的出厂缺省，其中 3 个默认关（echoes / opinion / style）。
//   这时现场是三件事**长得一样**：「引擎装着但内容不注入」/「引擎关着」/「本来就没内容」。
//   玩家只会结论成「世界没内容」，然后去改世界内容——改不动，因为根本没调用它。
//   v2.259.0 的 threeGates 已经能报「107 源只通 6 个」，但答不出**这 6 个之外有多少是被
//   出厂缺省挡住的、那份缺省是不是真在用**。本版补的就是这一面，并与 faceAudit 分列。
//
// 【四条口径（每条都是本仓反复付过价的）】
//   ① **落盘真相只有 settingsBus 知道**：判「有没有配过」不许自己读 localStorage、也不许
//      看 `read()` 的返回值——`read()` 必然 `applyDefaults` 补齐全部 107 子键，返回的永远
//      非空。唯一真源是 `stats.lastRead.source`（disk / legacy / default / default-after-failure）。
//   ② **三态封闭，不许人间蒸发**：`moduleEnabled` 是 true / false / **null** 三态
//      （null = 该源无模块级总开关、由 store 直供）。默认关的源必须**逐个**落进
//      silent / doubleOff / noSwitch 三桶之一，三桶相加必须等于 defaultOff 长度。
//   ③ **不并入 faceAudit**：那一面是四态封闭集（on/vis-off/mod-off/unavailable），
//      tests/switch-matrix-v2910.js 有全景负控制盯着。本面在顶层单列。
//   ④ **只报读数、不写配置**：体检不许顺手改世界——连调零写盘。
//
// 【实施期抓到的两处「假绿」（都写成本锁的负控制）】
//   ⚠ 一、首版判 `configured` 用「`read(__REG)` 返回对象非空」⇒ 恒为 true，
//      出厂态被报成「玩家配过」（默认值伪装成用户配置）。探针 p_vis_default2 实测
//      写前 configured = true，与落盘 null 直接矛盾 ⇒ 本锁 C1 的真源断言。
//   ⚠ 二、首版三桶只写了 true/false 两支，`moduleEnabled === null` 被静默丢掉
//      ⇒ 3 个默认关的源里 2 个（echoes/style）在读数里消失，读者以为「只剩 1 个有问题」
//      ⇒ 本锁 C3 的三桶封闭断言 + N2 负控制。
//
// 【判据】
//   A 结构：锚点各恰中 1 次 / 导出面自证 / 零写入口 / 消费方接线 / 版本已升位
//   B 运行时：出厂读数 / 三桶封闭 / 与 faceAudit 同源 / 只读 / note 是完整人话
//   C 归因：configured 走 lastRead 真源（四条来源路径逐一验）/ 三态不丢 / 与落盘一致
//   D 消费方：tool-diag 的 visDefault 子读数 / 面板提示行 / 静默优先 / 没毛病不占屏
//   N1–N4 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据
//   N5 纯度：全部负控制跑完后原文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const INJ = 'render/inject.js';
const BUS = 'core/settings-bus.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const RUNJ = 'tests/run.js';
const IDX = 'index.js';
const SELF_REL = 'tests/vis-default-v2260.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return String(s).split(n).length - 1; }
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag + ' :: ' + String(n).slice(0, 70));
  return c;
}
function fresh(ov) {
  const vm = require('vm');
  const mockPath = path.join(BASE, 'tests/mock.js');
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(mockPath);
  try {
    const ls = global.localStorage;
    if (ls && typeof ls.clear === 'function') ls.clear();
    else if (ls && ls.__store) ls.__store = {};
  } catch (e) {}
  const src = fs.readFileSync(path.join(BASE, RUNJ), 'utf8');
  const li = src.indexOf('const LOAD = ['), lj = src.indexOf('];', li);
  const LOAD = vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
  const ctx = vm.createContext(global);
  for (const rel of LOAD) {
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8');
    vm.runInContext(body, ctx, { filename: rel });
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return { WA: WA, LOAD: LOAD };
}
// ── 破坏锚点（各须恰中 1 次；字面量在本文件里也只许出现一次，故用变量持有）──
// ① 落盘真相走 lastRead.source（口径①；退回「read() 返回非空」⇒ 出厂态被报成配过）
const A_SRC = "          ? WA.settingsBus.readEx(__REG)";
const A_SRC_BAD = "          ? (WA.settingsBus.read(__REG), { source: 'disk', key: LS_KEY })";
// ①-b configured 的判据本体（把 default 也算成配过 ⇒ 默认值伪装成用户配置）
const A_CONF = "      const configured = (readSrc === 'disk' || readSrc === 'legacy');";
const A_CONF_BAD = "      const configured = true;";
// ② 第三态桶（口径②；摘掉它 ⇒ moduleEnabled===null 的源人间蒸发）
const A_NOSW = "        else noSwitch.push(k);";
const A_NOSW_OFF = "        else /* dropped */ void 0;";
// ③ 静默优先（面板口径②；摘掉 ⇒ 最该看见的那一句被普通缺省句挤掉）
const A_SIL = "        const head = vd.silent > 0";
const A_SIL_OFF = "        const head = false";

// ═══ A 面：结构 ═════════════════════════════════════════════════════
function runA(a) {
  const I = rd(INJ);
  const B = rd(BUS);
  const D = rd(DIAG);
  const P = rd(PANEL);
  const ID = rd(IDX);
  // A1 四个锚点各恰中 1 次
  must1(I, A_SRC, 'A1a'); must1(I, A_CONF, 'A1b'); must1(I, A_NOSW, 'A1c'); must1(P, A_SIL, 'A1d');
  a(true, 'A1: 四个破坏锚点各恰中 1 次');
  // A1b 首版那两条错判据没有留在产品里（否则「假绿」会以「历史代码」名义复活）
  a(cnt(I, A_SRC_BAD) === 0, 'A1b: 首版「不查 lastRead」的写法没留在产品里（实 ' + cnt(I, A_SRC_BAD) + '）');
  a(cnt(I, A_CONF_BAD) === 0, 'A1c: 首版「configured 恒真」没留在产品里（实 ' + cnt(I, A_CONF_BAD) + '）');
  // A2 导出面自证：visibilityDefault 在 WA.render 的返回对象里
  a(cnt(I, 'visibilityDefault() {') === 1, 'A2: visibilityDefault 定义恰 1 处（实 ' + cnt(I, 'visibilityDefault() {') + '）');
  a(cnt(I, 'visibilityDefault,') === 0 && cnt(I, 'visibilityDefault:') === 0,
    'A2b: 没有第二种导出写法（同一口不许两个形态）');
  // A3 口径①的真源真存在（settingsBus 侧必须有 lastRead 台账，否则我用的是一个不存在的口）
  a(cnt(B, 'stats.lastRead = {') === 1, 'A3: settings-bus 真写 stats.lastRead（实 ' + cnt(B, 'stats.lastRead = {') + '）');
  a(cnt(B, "source: __finalSrc") === 1, 'A3b: lastRead.source 取自 __finalSrc（读后来源，非入参）');
  a(cnt(B, "if (__src === 'disk' && !__why) { __src = 'default';") === 1,
    'A3c: 磁盘显式存 null 被降为 default（否则 null 会被当成「配过」，实 ' + cnt(B, "if (__src === 'disk' && !__why) { __src = 'default';") + '）');
  // A4 口径③不并入 faceAudit：四态封闭集原样（改枚举会撞 switch-matrix 的全景负控制）
  a(cnt(I, "face = 'vis-off';") === 1 && cnt(I, "face = 'mod-off';") === 1 && cnt(I, "face = 'unavailable';") === 1,
    'A4: faceAudit 仍是四态封闭集（本版没往里塞第五态）');
  // A5 口径④零写入口：函数体内不许出现 save/setVisibility/applyTier
  (function () {
    const i0 = I.indexOf('visibilityDefault() {');
    const i1 = I.indexOf('buildWorldSnapshot() {', i0);
    a(i0 > 0 && i1 > i0, 'A5 前提：能切出函数体（' + i0 + '~' + i1 + '）');
    const body = I.slice(i0, i1);
    a(cnt(body, 'save(') === 0 && cnt(body, 'setVisibility(') === 0
      && cnt(body, 'applyTier(') === 0 && cnt(body, 'removeItem(') === 0,
      'A5: visibilityDefault 函数体内零写入口（体检不许顺手改世界）');
    a(body.indexOf('readSrc') > 0, 'A5b: 函数体真用落盘来源这个判据（不是摆设）');
  })();
  // A6 消费方接线（否则就是死导出）
  a(cnt(D, 'WA.render.visibilityDefault') === 2, 'A6: tool-diag 真读 visibilityDefault（守卫+调用，实 ' + cnt(D, 'WA.render.visibilityDefault') + '）');
  a(cnt(D, 'out.visDefault = {') === 1, 'A6b: 诊断包真挂 visDefault 子读数');
  a(cnt(P, 'WA.render.visibilityDefault') === 2, 'A6c: 面板真读（守卫+调用，玩家可达，实 ' + cnt(P, 'WA.render.visibilityDefault') + '）');
  a(cnt(P, 'wa-vis-line') === 2, 'A6d: 面板行有稳定 id（正常出口 + 异常出口，实 ' + cnt(P, 'wa-vis-line') + '）');
  // A7 版本已升位
  // ⚠ v2.270.0 修：原式 `2\.(?:26[0-9]|[3-9][0-9]{2})\.\d+` 有个**区间洞** ——
//   `26[0-9]` 只覆盖 260-269，`[3-9][0-9]{2}` 只覆盖 300+，于是 **2.270~2.299 全不匹配**。
//   自 v2.270.0 起这两个断言会红，而红的原因与「版本没跟上」正好反向（版本明明更新了）。
//   治法：写成「次版本 ≥ 260」的开放区间（`2\.(?:26[0-9]|2[7-9][0-9]|[3-9][0-9]{2})`），
//   与 three-gates-v2259 里同族断言的口径逐字对齐。
  a(/VERSION\s*=\s*'2\.(?:26[0-9]|2[7-9][0-9]|[3-9][0-9]{2})\.\d+'/.test(ID), 'A7: index.js VERSION 不早于 2.260.0（实 ' + (ID.match(/const VERSION = '([^']+)'/) || [])[1] + '）');
  const mani = rd('manifest.json');
  a(/"version"\s*:\s*"2\.(?:26[0-9]|2[7-9][0-9]|[3-9][0-9]{2})\.\d+"/.test(mani), 'A7b: manifest.json version 不早于 2.260.0');
}
// ═══ B 面：运行时（真读数 + 三桶封闭 + 只读）═════════════════════════
function runB(a) {
  const env = fresh();
  const WA = env.WA;
  a(!!WA.render && typeof WA.render.visibilityDefault === 'function', 'B1: 运行时有 visibilityDefault');
  const r = WA.render.visibilityDefault();
  // B2 出厂态：未配置（探针实测落盘为 null）
  a(r.configured === false, 'B2: 出厂态 configured 为 false（实 ' + r.configured
    + '）—— 107 源全走出厂缺省，不许报成「玩家配过」');
  a(r.key === 'worldaxis_inject_visibility_v1', 'B2b: key 就是可见性落盘键（实 ' + r.key + '）');
  a(r.sources > 0, 'B2c: sources 是真数（实 ' + r.sources + '）');
  // B3 三桶封闭（口径②：默认关的源必须逐个有归属）
  a(r.doubleOff + r.silent + r.noSwitch === r.defaultOff.length,
    'B3: 三桶相加 === defaultOff 长度（' + r.doubleOff + '+' + r.silent + '+' + r.noSwitch
    + ' vs ' + r.defaultOff.length + '）—— 没有源人间蒸发');
  const union = [].concat(r.doubleOffKeys || [], r.silentKeys || [], r.noSwitchKeys || []);
  const uniq = union.filter(function (k, i) { return union.indexOf(k) === i; });
  a(uniq.length === union.length, 'B3b: 三桶互不重叠（重复 ' + (union.length - uniq.length) + '）');
  const notInDef = union.filter(function (k) { return r.defaultOff.indexOf(k) < 0; });
  a(notInDef.length === 0, 'B3c: 三桶里的每个键都在 defaultOff 里（越界 ' + notInDef.length + '：' + notInDef.join(',') + '）');
  // B4 与 faceAudit 同源（口径③：分列但不打架）
  const fa = WA.render.visibilityStat().faceAudit || [];
  const faces = r.faces || {};
  a(faces.on === fa.filter(function (x) { return x.face === 'on'; }).length,
    'B4: faces.on 与 faceAudit 直数一致（' + faces.on + '）');
  a(r.sources === fa.length, 'B4b: sources 与 faceAudit 行数一致（' + r.sources + ' vs ' + fa.length + '）');
  // B4c 三桶的模块态必须真的符合各自的定义（不是随便塞桶）
  const faceOf = {};
  fa.forEach(function (f) { faceOf[f.key] = f; });
  const badSil = (r.silentKeys || []).filter(function (k) { return !faceOf[k] || faceOf[k].moduleEnabled !== true; });
  a(badSil.length === 0, 'B4c: silent 桶里每条都真是 moduleEnabled===true（不合 ' + badSil.length + '）');
  const badDbl = (r.doubleOffKeys || []).filter(function (k) { return !faceOf[k] || faceOf[k].moduleEnabled !== false; });
  a(badDbl.length === 0, 'B4d: doubleOff 桶里每条都真是 moduleEnabled===false（不合 ' + badDbl.length + '）');
  const badNo = (r.noSwitchKeys || []).filter(function (k) { return !faceOf[k] || faceOf[k].moduleEnabled !== null; });
  a(badNo.length === 0, 'B4e: noSwitch 桶里每条都真是 moduleEnabled===null（不合 ' + badNo.length + '）');
  // B5 只读（口径④）——连调三次零写盘，且读源台账不被污染
  const w0 = WA.settingsBus.stats.writes;
  WA.render.visibilityDefault(); WA.render.visibilityDefault(); WA.render.visibilityDefault();
  a(WA.settingsBus.stats.writes === w0,
    'B5: 连调三次零写盘（writes ' + w0 + ' → ' + WA.settingsBus.stats.writes + '）');
  // B6 note 是完整人话：未配置时必说「未配置」且点名默认关的源
  a(typeof r.note === 'string' && r.note.length > 0, 'B6: 未配置时 note 非空（不许静默成 null）');
  a(r.note.indexOf('从未配置') >= 0, 'B6b: note 明说「从未配置」（实「' + String(r.note).slice(0, 60) + '…」）');
  (r.defaultOff || []).forEach(function (k) {
    a(r.note.indexOf(k) >= 0, 'B6c: note 点名默认关的源（' + k + '）—— 只说「有几个」等于没说');
  });
  // B6d 双重关与无开关都要在 note 里说清（否则读者以为「都是同一类问题」）
  if (r.doubleOff > 0) a(r.note.indexOf('双重关') >= 0, 'B6d: 有 doubleOff 时 note 说清「双重关，先开模块」');
  if (r.noSwitch > 0) a(r.note.indexOf('无模块级总开关') >= 0, 'B6e: 有 noSwitch 时 note 说清「只能按可见性开关」');
}
// ═══ C 面：归因（落盘真相四条路径 + 三态不丢）═══════════════════════
function runC(a) {
  const env = fresh();
  const WA = env.WA;
  const ls = global.localStorage;
  const KEY = 'worldaxis_inject_visibility_v1';
  // C1 【防假绿·一】configured 必须走「读取来源」这个真源，且该真源在总线侧真实存在。
  //   ⚠ 判据不许假设 `stats.lastRead` 是「按本键记」的——它是**全局单槽**，任何别的读都会覆盖
  //     （p_lastread_slot.js 实测：读完本键再读 chrono，key 就变成 chrono）。故这里分两层证：
  //     ① 总线 `readEx` 契约面本身正确（出厂 default / 写后 disk / 中间插队仍报本键）；
  //     ② 本口 `configured` 与此一致。
  const REG_FOR_C1 = { key: KEY, def: { a: true }, module: 'render' };
  ls.removeItem(KEY);
  const ex0 = WA.settingsBus.readEx(REG_FOR_C1);
  a(ex0.key === KEY, 'C1: readEx 报的 key 就是本键（实 ' + ex0.key + '）');
  a(ex0.source === 'default', 'C1b: 无磁盘值时来源是 default 而非 disk（实 ' + ex0.source
    + '）—— 首版用「read() 返回非空」判定会把它错报成配过');
  a(WA.render.visibilityDefault().configured === false, 'C1c: 来源 default ⇒ configured false');
  // C1d 抗插队自证：写后中间插两个别的键，readEx 仍报本键 + disk
  WA.render.setVisibility('echoes', true);
  WA.settingsBus.read({ key: 'worldaxis_chrono_settings_v1', def: {} });
  WA.settingsBus.read({ key: 'worldaxis_eco_audit_settings_v1', def: {} });
  const ex1 = WA.settingsBus.readEx(REG_FOR_C1);
  a(ex1.key === KEY && ex1.source === 'disk',
    'C1d: 中间插两个别的读后 readEx 仍报本键 disk（实 ' + ex1.key + ' / ' + ex1.source
    + '）—— 这正是「全局单槽 lastRead」做不到的，也是必须走 readEx 的理由');
  WA.render.setVisibility('echoes', false);
  ls.removeItem(KEY);
  WA.render.visibilityDefault();
  // C2 真写一次后来源变 disk、configured 变 true
  ls.removeItem(KEY);
  WA.render.visibilityDefault();
  a(WA.render.visibilityDefault().configured === false, 'C2 前提：删键后先回到未配置');
  WA.render.setVisibility('echoes', true);
  const r2 = WA.render.visibilityDefault();
  a(r2.configured === true, 'C2: 真落盘后 configured true（实 ' + r2.configured + '）');
  const ex2 = WA.settingsBus.readEx({ key: KEY, def: { a: true }, module: 'render' });
  a(ex2.source === 'disk', 'C2b: 真落盘后来源是 disk（实 ' + ex2.source + '）');
  // C2c 配过 ≠ 配成开：把值写回 false 仍须 configured true（不许把「配成关」当成「没配」）
  WA.render.setVisibility('echoes', false);
  a(WA.render.visibilityDefault().configured === true,
    'C2c: 写成 false 仍 configured true（实 ' + WA.render.visibilityDefault().configured
    + '）—— 「配成关」与「没配」是两件事');
  // C3 【防假绿·二】三态不丢：抽掉 noSwitch 桶后，默认关的源会少几个（负控制 N2 的正向对照）
  a(r2.noSwitchKeys.length > 0 || r2.doubleOffKeys.length > 0 || r2.silentKeys.length > 0,
    'C3 前提：出厂缺省里真有默认关的源（d/s/n = ' + r2.doubleOff + '/' + r2.silent + '/' + r2.noSwitch + '）');
  // C4 删键后回到「未配置」（真删才算；写 false 不算 —— 见 C2c）
  ls.removeItem(KEY);
  WA.render.visibilityDefault();
  const r4 = WA.render.visibilityDefault();
  a(r4.configured === false, 'C4: 删键后回到 configured false（实 ' + r4.configured + '）');
  a(r4.note && r4.note.indexOf('从未配置') >= 0, 'C4b: 删键后 note 回到「从未配置」那一句');
  // C5 落盘值形态不被本口改写（只读自证的第二条：读一遍后磁盘原文未变）
  const before = ls.getItem(KEY);
  WA.render.visibilityDefault(); WA.render.visibilityDefault();
  a(ls.getItem(KEY) === before, 'C5: 连读两次磁盘原文逐字未变（实 ' + String(before).slice(0, 20) + '）');
}
// ═══ D 面：消费方（诊断可见 + 玩家可达）═════════════════════════════
function runD(a) {
  const env = fresh();
  const WA = env.WA;
  const col = WA.toolDiag.collect();
  a(!!col.inject, 'D1: 诊断面有 inject 节');
  const vd = col.inject && col.inject.visDefault;
  a(!!vd, 'D1b: inject 节里有 visDefault 子读数（实 ' + (typeof vd) + '）');
  a(!!vd && vd.configured === WA.render.visibilityDefault().configured,
    'D1c: visDefault.configured 与引擎直读一致（' + (vd && vd.configured) + '）');
  a(!!vd && typeof vd.defaultOff === 'object' && Array.isArray(vd.defaultOff),
    'D1d: visDefault 带 defaultOff 逐源名单（不是只有一个数）');
  a(!!vd && (vd.doubleOff + vd.silent + vd.noSwitch) === vd.defaultOff.length,
    'D1e: 诊断侧三桶同样封闭（' + (vd && (vd.doubleOff + vd.silent + vd.noSwitch)) + ' vs '
    + (vd && vd.defaultOff.length) + '）—— 消费方不许把第三态丢掉');
  a(!!vd && typeof vd.note === 'string' && vd.note.length > 0, 'D1f: visDefault 带人话 note');
  // D2 诊断只读（collect 前后零写盘）
  const w0 = WA.settingsBus.stats.writes;
  WA.toolDiag.collect();
  a(WA.settingsBus.stats.writes === w0, 'D2: collect() 两次零写盘（' + w0 + ' → ' + WA.settingsBus.stats.writes + '）');
  // D3 面板口径：配过就不说（缺省不背锅）、没毛病不占屏
  const P = rd(PANEL);
  a(cnt(P, 'if (!vd || vd.configured === true) return') === 1,
    'D3: 面板在「配过」时整行不出现（实 ' + cnt(P, 'if (!vd || vd.configured === true) return') + '）');
  a(cnt(P, "if (!off.length) return '';") === 1, 'D3b: 没有默认关的源时整行不出现');
  a(cnt(P, '>注入源缺省读数异常：') === 1,
    'D3c: 读数异常时明说异常（不渲染成「都没问题」，实 ' + cnt(P, '>注入源缺省读数异常：') + '）');
  // D4 面板挂载点真在渲染流里（不是死代码）
  a(cnt(P, '${visLine}') === 1, 'D4: visLine 真插进渲染流（实 ' + cnt(P, '${visLine}') + '）');
}
// ═══ N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据 ═════════════
function runNegative(a) {
  const I = rd(INJ);
  const P = rd(PANEL);
  // N1 破坏①：不查 lastRead ⇒ configured 回到「恒真」（假绿①复活）
  //   判据：两版 configured 必须**不同**，且破坏版是 true。若哪天真配过了，
  //   正版也会是 true ⇒ 两版相同 ⇒ 本条红并提醒改靶标（绝不静默跳过）。
  {
    must1(I, A_SRC, 'N1');
    const broken = I.replace(A_SRC, A_SRC_BAD);
    a(broken !== I, 'N1a: 破坏副本真改了字节（不再查 lastRead）');
    // ⚠ 顺序敏感：必须先建 W0、立刻取它的读数，再建 W1。`fresh()` 会清空 localStorage，
    //   但 `WA` 是挂在 global 上的**同一个对象**——先建两个实例再取读数，W0.render 已被 W1 覆盖，
    //   读到的其实是 W1 的状态（实施期踩过：N1 前提报 configured true 而正版明明是 false）。
    const W0 = fresh().WA;
    const r0 = W0.render.visibilityDefault();
    const W1 = fresh({ 'render/inject.js': broken }).WA;
    const r1 = W1.render.visibilityDefault();
    a(r0.configured === false, 'N1 前提：正版出厂态 configured false（实 ' + r0.configured + '）');
    a(r1.configured === true, 'N1b: 首版写法（read 返回非空 ⇒ 配过）下出厂态被报成「配过」（实 '
      + r1.configured + '）—— 默认值伪装成用户配置');
    a(r1.configured !== r0.configured, 'N1c: 破坏后结论与正版不同（正 ' + r0.configured + ' / 破 ' + r1.configured + '）');
  }
  // N2 破坏②：configured 写死 true ⇒ 同一病灶的第二种形态（比 N1 更粗暴）
  {
    must1(I, A_CONF, 'N2');
    const broken = I.replace(A_CONF, A_CONF_BAD);
    a(broken !== I, 'N2a: 破坏副本真改了字节（configured 恒真）');
    // ⚠ 同 N1：必须取完 r0 再建第二个实例（WA 是同一个 global 对象）
    const r0 = fresh().WA.render.visibilityDefault();
    const r1 = fresh({ 'render/inject.js': broken }).WA.render.visibilityDefault();
    void 0;
    a(r0.configured === false && r1.configured === true,
      'N2b: 恒真版必现形（正 ' + r0.configured + ' / 破 ' + r1.configured + '）');
  }
  // N3 破坏③：摘掉 noSwitch 桶 ⇒ moduleEnabled===null 的源人间蒸发（假绿②）
  {
    must1(I, A_NOSW, 'N3');
    const broken = I.replace(A_NOSW, A_NOSW_OFF);
    a(broken !== I, 'N3a: 破坏副本真改了字节（第三态被丢）');
    // ⚠ 同 N1：必须取完 r0 再建第二个实例（WA 是同一个 global 对象）
    const r0 = fresh().WA.render.visibilityDefault();
    const r1 = fresh({ 'render/inject.js': broken }).WA.render.visibilityDefault();
    void 0;
    a(r0.noSwitch > 0, 'N3 前提：正版真有 noSwitch 桶非空（实 ' + r0.noSwitch + '）');
    a(r1.noSwitch === 0, 'N3b: 破坏版 noSwitch 归零（实 ' + r1.noSwitch + '）');
    a(r1.doubleOff + r1.silent + r1.noSwitch !== r1.defaultOff.length,
      'N3c: 破坏版三桶不再封闭（' + (r1.doubleOff + r1.silent + r1.noSwitch) + ' vs '
      + r1.defaultOff.length + '）—— 这正是「源人间蒸发」的读数形态');
    a(r0.defaultOff.length === r1.defaultOff.length,
      'N3d: 破坏版 defaultOff 本身不变（' + r0.defaultOff.length + '）—— 蒸发的是归属，不是名单');
  }
  // N4 破坏④：面板静默优先被摘 ⇒ 最该看见的那一句被普通缺省句挤掉
  //   面板口径是纯文案分叉，故这里用**同款判据**跑在副本上：静默分支永不成立。
  {
    must1(P, A_SIL, 'N4');
    const broken = P.replace(A_SIL, A_SIL_OFF);
    a(broken !== P, 'N4a: 破坏副本真改了字节（静默分支永不成立）');
    // 同款判据的等价检查：正版该串存在且能命中 silent>0 分叉，破坏版只剩 false 分叉
    a(cnt(P, "vd.silent > 0") === 2 && cnt(broken, "vd.silent > 0") === 1,
      'N4b: 正版 silent>0 分叉 2 处（head + tail）/ 破坏后剩 1 处 —— 实测 ' + cnt(P, "vd.silent > 0")
      + ' / ' + cnt(broken, "vd.silent > 0") + '；摘掉的正是**主句**那一处');
    a(cnt(broken, "const head = false") === 1, 'N4c: 破坏版落入死分支（恒 false）');
    // 4d 而且正版那一段的措辞是「引擎在跑」这句人话（不是随便一个 if）
    a(cnt(P, '引擎在跑，这部分内容不会进正文') === 1,
      'N4d: 正版静默分支的措辞点名后果（实 ' + cnt(P, '引擎在跑，这部分内容不会进正文') + '）');
  }
  // N5 纯度：全部负控制跑完后原文件逐字未变
  {
    const self = rd(SELF_REL);
    a(self.indexOf('runNegative') > 0, 'N5: 本锁自身可读且含 runNegative（纯度前提）');
    const I2 = rd(INJ);
    a(cnt(I2, A_SRC) === 1 && cnt(I2, A_CONF) === 1 && cnt(I2, A_NOSW) === 1,
      'N5b: render/inject.js 三个锚点各恰中 1 次（负控制全跑在内存副本上，零文件改写）');
    a(cnt(I2, A_SRC_BAD) === 0 && cnt(I2, A_CONF_BAD) === 0 && cnt(I2, A_NOSW_OFF) === 0,
      'N5c: 三条破坏形态一个都没留在产品里（实 '
      + (cnt(I2, A_SRC_BAD) + cnt(I2, A_CONF_BAD) + cnt(I2, A_NOSW_OFF)) + '）');
    const P2 = rd(PANEL);
    a(cnt(P2, A_SIL) === 1 && cnt(P2, A_SIL_OFF) === 0,
      'N5d: ui/panel.js 的静默分叉正版 1 处、破坏形态 0 处');
  }
}
async function runAll(assert) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) pass++; else { fail++; assert(false, msg); } };
  const title = function (s) { console.log('\n\u25a0 ' + s); };
  title('A 结构面：四锚点 / 导出面 / 真源存在 / 四态未扩 / 零写入口 / 消费方');
  runA(a);
  title('B 运行时：出厂未配置 / 三桶封闭 / 与 faceAudit 同源 / 只读 / note 完整');
  runB(a);
  title('C 归因：lastRead 真源 / 配过与配成开分离 / 删键回退 / 磁盘原文不变');
  runC(a);
  title('D 消费方：诊断 visDefault / 面板提示行 / 配过不说 / 没毛病不占屏');
  runD(a);
  title('N 负控制：四条真源码破坏 + 纯度');
  runNegative(a);
  console.log('\n' + (fail === 0 ? '\u2713 ' : '\u2717 ') + 'vis-default-v2260: ' + pass + ' 通过 / ' + fail + ' 失败');
  return { pass: pass, fail: fail };
}
if (require.main === module) {
  const assert = function (cond, msg) { if (!cond) { console.error('  \u2717 ' + msg); } };
  runAll(assert).then(function (r) { process.exit(r.fail === 0 ? 0 : 1); }).catch(function (e) {
    console.error('FATAL: ' + ((e && e.stack) || e)); process.exit(1);
  });
}
module.exports = { runAll: runAll };