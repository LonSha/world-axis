#!/usr/bin/env node
// WorldAxis tests/theme-engines-v2258.js —— v2.258.0（V6 OPV6-3）题材驱动启用面专锁
//
// 【它治的病（现场实测立据，非阅读推断）】
//   v2.257.0 探针 tools/v6probes/p_engines.js 实测：100 个「带 enabled + buildBlock +
//   有写入口」的真机制里，**出厂只开 5 个**。而 `theme.apply(['urban'])` 此前只改
//   `rules.ORDER`（题材模块的注入**顺序**），一次都不碰任何引擎的 `enabled`。
//   于是「我选了都市」与「都市机制在跑」是**两件互不相干的事**：
//   选完都市，经济/仇敌/律法机制照样一个个关着。
//
// 【五条口径（每条都是本仓反复付过价的）】
//   ① **只加开，不关别人的**：收回面严格等于 `settings().engines`（本模块自己开的）。
//      玩家手动开的、档位（capabilityTier.granted）开的，一次都不许被题材关掉 ——
//      踩这条的后果是「我换个题材，我自己配的东西没了」。
//   ② **逐个真写 + 当场回读复核**：走 capabilityTier.flipSwitch（与档位面**同一判据**）。
//      自己再写一遍 setSettings 就是第二套判据，分叉后玩家只看得见报「成功」那条。
//   ③ **部分成功就是部分成功**：没真起来的进 notEffective、无注入面的进 notInjected，
//      两者非空 ⇒ partial:true + tier-partial 归因，绝不折成「已开启」。
//   ④ **幂等**：真开关一个没动、题材名与 granted 名单都没变 ⇒ noop，不写盘。
//   ⑤ **副作用自收尾**：本文件每个用例结束都把题材清空（否则引擎被开着外溢到后续用例，
//      实测会让 shadow-v2630 / threads-v2630 的「默认关闭」当场红）。
//
// 【判据】
//   A 结构：THEME_ENGINES 真源 / 表内每个名字都是真开关 / apply 里无第二套写盘路径 /
//           engineFace 已导出 / 导出面自证
//   B 运行时：选都市真开机制（running 真涨）/ 逐个回读 / 幂等 / 清空真收回 /
//           叠加为并集 / 玩家手开的不被收走
//   C 归因：notInjected 如实分类（表里点名不存在的键）/ partial 与 tier-partial 同现
//   D 消费方：面板预览/应用回执带机制面 / tool-diag secWorldLexicon 的 theme.engines /
//           recipe.apply 透传 partial
//   N1–N5 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚各须恰中 1 次）
//   N6 纯度：全部负控制跑完后原文件逐字未变（含本锁自身）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const THEME = 'engines/theme.js';
const TIER = 'engines/capability-tier.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const RECIPE = 'engines/recipe.js';
const SELF_REL = 'tests/theme-engines-v2258.js';
const RUNJ = 'tests/run.js';

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

// ── 破坏锚点（各须恰中 1 次；字面量在本文件里也只许出现一次，故用变量拼接）──
// ① 复用判据：题材必须走 capabilityTier.flipSwitch，不许自带第二套写盘（本版要治的病）
//   注：调用点**显式点名** `WA.capabilityTier.flipSwitch`（不经局部变量）—— 清册引用面按
//   `WA.ns.mem` 口径计数，走 `c.flipSwitch(...)` 会让这两口在产品侧读成 refs=0，
//   被 dead-export 台账误记成「过度导出」。锚点与实现同批改动，保持「恰中 1 次」契约。
const A_VIA = "if (c && typeof c.flipSwitch === 'function') { try { return WA.capabilityTier.flipSwitch(key, on); } catch (e) { return 'not-effective'; } }";
// ② 收回面：只能收自己开过的（players 手开的不许被题材关掉）
const A_SCOPE = 'const toOff = before.filter(function (k) { return !wantSet[k]; });';
// ③ 幂等早退（摘掉它 ⇒ 重复 apply 同题材也写盘）
const A_NOOP = 'if (!didOn.length && !didOff.length && !themesChanged && !grantChanged) {';
// ④ granted 判据：只记「本次真开的」+'仍在新目标里且真开着的'（不可把 already 算成自己开的）
const A_GRANT = 'const granted = uniqArr(kept.concat(didOn));';
// ⑤ 归因：无注入面如实进 notInjected（不可静默跳过）
const A_NOTINJ = 'if (!sh.hasBuild) { notInjected.push(k); return; }        // 没有注入面：开了也不出声';

// ═══ 装载环境 ═══════════════════════════════════════════════════════
function fresh(ov) {
  const vm = require('vm');
  const mockPath = path.join(BASE, 'tests/mock.js');
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(mockPath);
  // 清空 localStorage，保证每节从出厂态开始（题材会真写各引擎的设置键）
  try {
    const ls = global.localStorage;
    if (ls && typeof ls.clear === 'function') ls.clear();
    else if (ls && ls.__store) ls.__store = {};
  } catch (e) {}
  const src = fs.readFileSync(path.join(BASE, RUNJ), 'utf8');
  const li = src.indexOf('const LOAD = [');
  const lj = src.indexOf('];', li);
  const LOAD = vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
  const ctx = vm.createContext(global);
  for (const rel of LOAD) {
    const body = ov && ov[rel] !== undefined ? ov[rel] : fs.readFileSync(path.join(BASE, rel), 'utf8');
    vm.runInContext(body, ctx, { filename: rel });
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return { WA: WA, LOAD: LOAD };
}

// ═══ A 面：结构 ═════════════════════════════════════════════════════
function runA(a) {
  const T = rd(THEME);
  const I = rd(TIER);
  const D = rd(DIAG);
  const P = rd(PANEL);
  const R = rd(RECIPE);
  const RUN = rd(RUNJ);
  must1(T, A_VIA, 'A1 题材侧转发 capabilityTier.flipSwitch（同一判据）');
  must1(T, A_SCOPE, 'A1 收回面 = 自己开过的（边界①）');
  must1(T, A_NOOP, 'A1 幂等早退');
  must1(T, A_GRANT, 'A1 granted 判据');
  must1(T, A_NOTINJ, 'A1 无注入面归因');
  // A2 flipSwitch / shapeOf 在 capabilityTier 导出面上（题材侧要转发它们）
  a(cnt(I, 'flipSwitch(key, want)') === 1, 'A2: capabilityTier 有 flipSwitch 唯一入口（实 ' + cnt(I, 'flipSwitch(key, want)') + '）');
  a(cnt(I, 'flipSwitch: flipSwitch,') === 1, 'A2b: flipSwitch 在导出面上（题材侧要转发它）');
  a(cnt(I, 'shapeOf: shapeOf,') === 1, 'A2c: shapeOf 在导出面上（「什么算引擎」的唯一判据）');
  // A3 题材侧必须**没有**裸 setSettings({enabled:...})（第二套写盘路径 = 本版要治的病）
  a(cnt(T, 'enabled: true') === 0 && cnt(T, 'enabled: false') === 0,
    'A3: theme.js 里没有裸写 enabled 的路径（实 ' + (cnt(T, 'enabled: true') + cnt(T, 'enabled: false')) + ' 处）');
  // A4 engineFace 导出（面板与诊断的真消费方）
  a(cnt(T, 'engineFace: engineFace') === 1, 'A4: theme 导出 engineFace 恰一处');
  a(cnt(D, 'Th.engineFace()') >= 1, 'A4b: tool-diag 真读 engineFace（否则就是死导出）');
  a(cnt(P, 'WA.theme.engineFace()') >= 1, 'A4c: 面板真读 engineFace（玩家可达）');
  // A5 两个新模块都在 LOAD 里（题材在前、档位在后）
  const li = RUN.indexOf('const LOAD = [');
  const lj = RUN.indexOf('];', li);
  const LOAD = eval('(' + RUN.slice(RUN.indexOf('[', li), lj + 1) + ')');
  const ti = LOAD.indexOf('engines/theme.js');
  const ci = LOAD.indexOf('engines/capability-tier.js');
  a(ti >= 0 && ci > ti, 'A5: theme 在 capability-tier 之前（装载序：题材要能转发档位判据，实 ' + ti + '/' + ci + '）');
  // A6 表内每个名字都是真开关（坏名 = 表的质量缺陷，必须为 0）
  const env = fresh();
  const keys = Object.keys(env.WA.theme.THEME_ENGINES);
  a(keys.length === 9, 'A6: 九个题材都有引擎面（实 ' + keys.length + '：' + keys.join(',') + '）');
  const allNames = [];
  keys.forEach(function (k) { (env.WA.theme.THEME_ENGINES[k] || []).forEach(function (x) { if (allNames.indexOf(x) < 0) allNames.push(x); }); });
  const badNamed = allNames.filter(function (k) {
    const m = env.WA[k];
    if (!m || typeof m.getSettings !== 'function' || typeof m.setSettings !== 'function') return true;
    const s = m.getSettings();
    return !s || !Object.prototype.hasOwnProperty.call(s, 'enabled');
  });
  a(badNamed.length === 0, 'A6b: 表内每个名字都是真开关（坏名 ' + badNamed.length + '：' + badNamed.join(',') + '）');
  const noBuild = allNames.filter(function (k) { return typeof env.WA[k].buildBlock !== 'function'; });
  a(noBuild.length === 0, 'A6c: 表内每个都有注入面（无 buildBlock 的 ' + noBuild.length + '：' + noBuild.join(',') + '）');
  // A7 每个题材的引擎面非空（空题材面 = 该题材的 apply 什么都不开，等于没做）
  const empty = keys.filter(function (k) { return !(env.WA.theme.THEME_ENGINES[k] || []).length; });
  a(empty.length === 0, 'A7: 每个题材的引擎面都非空（空的 ' + empty.length + '：' + empty.join(',') + '）');
  // A8 recipe 透传 partial（配方不再吞掉题材的部分成功）
  a(cnt(R, 'partial: partial, partialReason:') === 1, 'A8: recipe.apply 透传 partial / partialReason');
}

// ═══ B 面：运行时（真写 + 真复核）═══════════════════════════════════
function runB(a) {
  const env = fresh();
  const WA = env.WA;
  const T = WA.capabilityTier;
  const Th = WA.theme;
  // B1 出厂：题材为空、机制只开 5 个（与 OPV6-1 的 B1d 同数）
  a(WA.theme.statView().themes.length === 0, 'B1: 出厂无题材');
  const r0 = T.view().running;
  a(r0 === 5, 'B1b: 出厂真在跑的机制 5 个（实 ' + r0 + '）');
  // B2 预览答得出「会开几个机制」，且**不落设置**（预览不覆盖）
  const pv = Th.preview(['urban']);
  a(pv.previewOnly === true && pv.engineCount > 0 && pv.engineWillOn === pv.engineCount,
    'B2: 预览答出机制面（将开 ' + pv.engineWillOn + '/' + pv.engineCount + '）');
  a(T.view().running === 5, 'B2b: 预览不改任何引擎（running 仍 ' + T.view().running + '）—— 预览不覆盖');
  a(WA.theme.statView().themes.length === 0, 'B2c: 预览不落设置');
  // B3 选都市真开机制（本版最要紧的一条：不再是「只改顺序」）
  const r1 = Th.apply(['urban']);
  a(r1.ok === true && r1.noop !== true, 'B3: 应用都市成功且非 noop');
  a(r1.enginesOn.length > 0, 'B3b: 真开了机制（实 ' + r1.enginesOn.length + ' 个）');
  const running1 = T.view().running;
  a(running1 === r0 + r1.enginesOn.length,
    'B3c: running 真涨了等量（' + r0 + ' + ' + r1.enginesOn.length + ' = ' + running1 + '）—— 不是只写设置');
  // B3d 逐个回读：enginesOn 里每个 getSettings().enabled 都是 true
  const offStill = r1.enginesOn.filter(function (k) { return WA[k].getSettings().enabled !== true; });
  a(offStill.length === 0, 'B3d: 逐个回读 enabled===true（未读回 ' + offStill.length + '：' + offStill.join(',') + '）');
  a(r1.notEffective.length === 0, 'B3e: 复核零未生效（实 ' + r1.notEffective.length + '：' + r1.notEffective.join(',') + '）');
  // B4 幂等：再 apply 同题材 ⇒ noop、不写盘、不重复计数
  const w0 = WA.settingsBus.stats.writes;
  const r2 = Th.apply(['urban']);
  const w1 = WA.settingsBus.stats.writes;
  a(r2.noop === true, 'B4: 重复 apply 同题材报 noop（实 ' + r2.noop + '）');
  a(w1 === w0, 'B4b: 幂等不写盘（writes ' + w0 + ' → ' + w1 + '）');
  a(r2.enginesOn.length === 0 && r2.enginesOff.length === 0, 'B4c: 幂等不虚报工作量');
  // B5 切题材：只收回自己开的
  const campus = Th.apply(['campus']);
  a(campus.enginesOff.length > 0, 'B5: 切校园收回了都市开的（实 ' + campus.enginesOff.length + ' 个）');
  const urbanOnly = r1.enginesOn.filter(function (k) { return (WA.theme.THEME_ENGINES.campus || []).indexOf(k) < 0; });
  const stillOn = urbanOnly.filter(function (k) { return WA[k].getSettings().enabled === true; });
  a(stillOn.length === 0, 'B5b: 都市独有机制已全部收回（残留 ' + stillOn.length + '：' + stillOn.join(',') + '）');
  // B6 **边界①反向证**：玩家手动开的引擎，题材切走时一次都不许被关
  //   ⚠ 靶标选取有两条硬约束（实施期实测踩过）：① 不在任何题材表内（题材永不碰它）；
  //     ② **不在 consumer-ledger 的 programmatic 登记里** —— 登记意味着「产品面与测试面都零引用」，
  //     测试一旦直接调它的设置口，它当场变成 test-only 消费方，o8-consumer-gate 报 stale-entry
  //     （首版用 research 就是这么红的：C1 / D6 / N4b / N4c 四条）。靶标由
  //     tools/v6probes/p_manual_engine.js 现场筛出（35 个候选），这里取 plan。
  const env2 = fresh();
  const W2 = env2.WA;
  W2.plan.setSettings({ enabled: true });              // 玩家手动开（plan 不在任何题材表内）
  const manualBefore = W2.plan.getSettings().enabled;
  W2.theme.apply(['urban']);
  W2.theme.apply(['campus']);
  W2.theme.apply([]);
  a(manualBefore === true && W2.plan.getSettings().enabled === true,
    'B6: 玩家手动开的引擎跨三次题材切换仍开着（实 ' + W2.plan.getSettings().enabled + '）—— 题材绝不越界关别人的');
  // B7 叠加为并集
  const env3 = fresh();
  const W3 = env3.WA;
  const uOnly = W3.theme.apply(['urban']);
  const uCount = uOnly.enginesOn.length;
  const um = W3.theme.apply(['urban', 'mystery']);
  a(um.enginesOn.length > 0 && W3.investigation.getSettings().enabled === true,
    'B7: 都市+悬疑叠加把悬疑特有机制开起来（investigation 在跑）');
  a(um.enginesGranted.length > uCount, 'B7b: 叠加后 granted 比单都市大（' + uCount + ' → ' + um.enginesGranted.length + '）');
  // B8 清空真收回（连自己开的一起收）
  const env4 = fresh();
  const W4 = env4.WA;
  const on4 = W4.theme.apply(['urban']);
  const n4 = on4.enginesOn.length;
  const clear = W4.theme.apply([]);
  a(clear.ok === true && clear.enginesOff.length === n4,
    'B8: 清空收回等量机制（开 ' + n4 + ' / 收 ' + clear.enginesOff.length + '）');
  const leak = clear.enginesGranted.filter(function (k) { return W4[k].getSettings().enabled === true; });
  a(clear.enginesGranted.length === 0 && leak.length === 0,
    'B8b: 清空后 granted 名单为空且无残留（实 ' + JSON.stringify(clear.enginesGranted) + '）');
  const back = W4.capabilityTier.view().running;
  a(back === 5, 'B8c: 清空后 running 回到出厂 5 个（实 ' + back + '）—— 收回是真收回');
  // B9 engineFace 读数与现场一致
  const env5 = fresh();
  const W5 = env5.WA;
  W5.theme.apply(['mystery']);
  const f = W5.theme.engineFace();
  const realRunning = f.want.filter(function (k) { return W5[k].getSettings().enabled === true; });
  a(f.want.length === realRunning.length && f.gap === 0,
    'B9: engineFace 的 want 全部真在跑（' + f.running.length + '/' + f.want.length + '，gap ' + f.gap + '）');
  a(f.via === 'capabilityTier', 'B9b: 判据来源如实报 capabilityTier（实 ' + f.via + '）');
  a(f.granted.length > 0, 'B9c: granted 非空（本模块真开过）');
}

// ═══ C 面：归因 ═════════════════════════════════════════════════════
function runC(a) {
  // C1 表里点名一个不存在的键 ⇒ 如实进 notInjected 且 partial=true（不静默、不假装开了）
  const T = rd(THEME);
  const broken = T.replace(
    "urban: ['economy',",
    "urban: ['zz-not-such-engine',");
  a(broken !== T, 'C1: 破坏副本构造成功');
  const env = fresh({ 'engines/theme.js': broken });
  const WA = env.WA;
  const r = WA.theme.apply(['urban']);
  a(r.ok === true, 'C1b: 应用仍成功（表有坏名不该让整个题材失败）');
  a(r.notInjected.indexOf('zz-not-such-engine') >= 0,
    'C1c: 坏名如实进 notInjected（实 ' + JSON.stringify(r.notInjected) + '）—— 不假装「开了」');
  a(r.partial === true && r.partialReason === 'tier-partial',
    'C1d: 有坏名 ⇒ partial + tier-partial（实 ' + r.partial + '/' + r.partialReason + '）');
  a(WA.theme.statView().partials > 0, 'C1e: partials 计数真涨（实 ' + WA.theme.statView().partials + '）');
  // C2 正常表下 partial=false（不是恒真）
  const env2 = fresh();
  const r2 = env2.WA.theme.apply(['urban']);
  a(r2.partial === false && r2.partialReason === '',
    'C2: 正常表下 partial=false（实 ' + r2.partial + '）—— partial 不是恒真');
  a(r2.notInjected.length === 0, 'C2b: 正常表下 notInjected 为空');
  // C3 lastReason 随情形变化（不是写死文案）
  const env3 = fresh();
  const W3 = env3.WA;
  W3.theme.apply(['urban']);
  const rApp = W3.theme.statView().lastReason;
  W3.theme.apply(['urban']);
  const rNoop = W3.theme.statView().lastReason;
  a(rApp === 'applied' && rNoop === 'noop',
    'C3: lastReason 随情形变（applied → noop，实 ' + rApp + ' → ' + rNoop + '）');
  const bad = W3.theme.apply(['no-such-theme']);
  a(bad.ok === false && bad.reason === 'unknown-theme' && W3.theme.statView().lastReason === 'unknown-theme',
    'C3b: 未知题材仍如实拒收 unknown-theme（旧契约逐字不变）');
  // C4 拒收时不动引擎（拒收后状态不变）
  const before = W3.capabilityTier.view().running;
  W3.theme.apply(['zz-nope']);
  a(W3.capabilityTier.view().running === before,
    'C4: 拒收不改任何引擎（running ' + before + ' → ' + W3.capabilityTier.view().running + '）');
}

// ═══ D 面：消费方（玩家可达 + 诊断可见）═════════════════════════════
function runD(a) {
  // D1 诊断节：secWorldLexicon 的 theme 节点带 engines 读数
  const env = fresh();
  const WA = env.WA;
  WA.theme.apply(['urban']);
  const col = WA.toolDiag.collect();
  // ⚠ worldLexicon 是 collect() 的**顶层键**（与 worldBlueprint / capability 并列），
  //   不在 `col.modules` 下面 —— `modules` 那个键装的是「逐模块装载状态」。
  //   实施期实测：按 col.modules.worldLexicon 取会得到 undefined，红在这里。
  const lx = col.worldLexicon;
  a(!!lx, 'D1: 诊断面有 worldLexicon 节');
  a(!!(lx && lx.theme && lx.theme.engines), 'D1b: theme 节点带 engines 读数');
  a(lx.theme.engines.want > 0 && lx.theme.engines.running === lx.theme.engines.want,
    'D1c: 诊断读数与现场一致（' + (lx.theme.engines && lx.theme.engines.running) + '/' + (lx.theme.engines && lx.theme.engines.want) + '）');
  a(typeof lx.theme.engines.via === 'string' && lx.theme.engines.via.length > 0,
    'D1d: 判据来源如实带出（实 ' + (lx.theme.engines && lx.theme.engines.via) + '）');
  // D1e 诊断面**不影响**启用面（只读）
  const before = JSON.stringify(WA.theme.engineFace().running);
  for (let i = 0; i < 5; i++) WA.toolDiag.collect();
  a(JSON.stringify(WA.theme.engineFace().running) === before,
    'D1e: 诊断面连调 5 次不改启用面（纯只读）');
  // D2 recipe.apply 透传机制面 + partial
  const env2 = fresh();
  const W2 = env2.WA;
  const rp = W2.recipe.apply('urban');
  a(rp.ok === true, 'D2: recipe.apply(urban) 成功');
  a(!!rp.themeApplied && Array.isArray(rp.themeApplied.enginesOn),
    'D2b: 配方回执带题材开的机制清单');
  a(Array.isArray(rp.enginesOn) && rp.enginesOn.length === rp.themeApplied.enginesOn.length,
    'D2c: 引擎面平铺一份与 themeApplied 同数（' + rp.enginesOn.length + '）');
  a(typeof rp.partial === 'boolean', 'D2d: 配方回执带 partial 布尔（实 ' + rp.partial + '）');
  // D2e 真开了（不是只报数）
  const realOn = rp.enginesOn.filter(function (k) { return W2[k].getSettings().enabled === true; });
  a(realOn.length === rp.enginesOn.length, 'D2e: 配方回执里每个机制真在跑（' + realOn.length + '/' + rp.enginesOn.length + '）');
  W2.theme.apply([]);
}

// ═══ 负控制：真源码破坏 → 装载破坏副本 → 重跑同款真判据 ═════════════
function runNegative(a) {
  // N1 破坏①：题材侧不走 capabilityTier.flipSwitch（改成自己裸写 setSettings）⇒ 第二套判据
  //   判据：A3 那条「theme.js 里没有裸写 enabled」必须现形 —— 这正是本版要治的病。
  {
    const T = rd(THEME);
    const broken = T.replace(A_VIA,
      "if (false) { return 'x'; }\n    try { WA[key].setSettings({ enabled: on === true }); } catch (e) { return 'not-effective'; }\n    const bk = shape(key);\n    return (bk && bk.on === (on === true)) ? (on === true ? 'on' : 'off') : 'not-effective';");
    must1Count(T, A_VIA, 'N1');
    a(broken !== T, 'N1: 破坏副本真改了字节（题材自带第二套写盘）');
    // 正向：原版上同款判据为真（无裸写 enabled）
    a(cnt(T, 'enabled: true') === 0 && cnt(T, 'enabled: false') === 0,
      'N1a: 原版上同款判据为真（theme.js 零裸写 enabled）');
    // 破坏后：出现了裸写 enabled ⇒ 同款判据必现形
    a(cnt(broken, 'enabled: on === true') > 0 || cnt(broken, 'enabled: true') > 0,
      'N1b: 破坏后出现裸写 enabled（实 ' + (cnt(broken, 'enabled: true') + cnt(broken, 'enabled: false')) + ' 处）⇒ A3 判据必现形');
    // 而且破坏副本里锚点确实没了（证明是这条通路被改，不是别处）
    a(cnt(broken, A_VIA) === 0, 'N1c: 破坏副本里转发锚点已消失（实 ' + cnt(broken, A_VIA) + ' 次）');
  }
  // N2 破坏②：收回面越界（改成关掉「目标集之外的全部引擎」）⇒ 玩家手开的东西被关
  //   判据：B6 那条「玩家手动开的跨三次切换仍开着」必须现形。
  //   靶标同 B6 口径：不在任何题材表内、且不在 consumer-ledger 的 programmatic 登记里
  //   （否则测试直接调它的设置口会把过期登记这条账翻出来，与本条要测的事无关）。
  {
    const T = rd(THEME);
    const broken = T.replace(A_SCOPE, 'const toOff = Object.keys(WA).filter(function (k) { const s2 = shape(k); return !!(s2 && s2.on && !wantSet[k]); });');
    must1Count(T, A_SCOPE, 'N2');
    a(broken !== T, 'N2: 破坏副本真改了字节（收回面越界）');
    const env = fresh({ 'engines/theme.js': broken });
    const WA = env.WA;
    WA.plan.setSettings({ enabled: true });
    WA.theme.apply(['urban']);
    WA.theme.apply(['campus']);
    const kept = WA.plan.getSettings().enabled === true;
    a(kept === false, 'N2b: 越界收回后同款判据必现形（玩家手开的 plan 被关了，实 ' + kept + '）');
  }
  // N3 破坏③：摘掉幂等早退 ⇒ 重复 apply 同题材也写盘
  //   判据：B4b「幂等不写盘」必须现形
  {
    const T = rd(THEME);
    const broken = T.replace(A_NOOP, 'if (false) {');
    must1Count(T, A_NOOP, 'N3');
    a(broken !== T, 'N3: 破坏副本真改了字节（摘幂等）');
    const env = fresh({ 'engines/theme.js': broken });
    const WA = env.WA;
    WA.theme.apply(['urban']);
    const w0 = WA.settingsBus.stats.writes;
    WA.theme.apply(['urban']);
    const w1 = WA.settingsBus.stats.writes;
    a(w1 > w0, 'N3b: 摘掉幂等后同款判据必现形（重复 apply 真写盘 ' + w0 + ' → ' + w1 + '）');
  }
  // N4 破坏④：granted 判据错（把「目标集里的**全部**」都算成自己开的）⇒ 清空时会越界收回
  //   判据：玩家**手动开**一个「恰好在题材表内」的引擎 ⇒ 正版下它是 'already'（不进 granted），
  //   清空时绝不被题材关；错误判据下它被记进 granted，清空时被关掉。
  //   ⚠ 实施期实测的第一版破坏**不敏感**：破坏成 `uniqArr(wantKeys)` 后读数与正版逐字相同
  //     （urban 表内 20 个出厂全关，'already' 一个都没有）⇒ 判据恒绿，等于没测。
  //     修法是把破坏**打在真正的分叉点上**：表内已开着的引擎才是「already 不得入 granted」
  //     这句话唯一能被观测的情形。
  {
    const T = rd(THEME);
    const broken = T.replace(A_GRANT, 'const granted = uniqArr(wantKeys);');
    must1Count(T, A_GRANT, 'N4');
    a(broken !== T, 'N4: 破坏副本真改了字节（granted 判据错）');
    const env = fresh({ 'engines/theme.js': broken });
    const WA = env.WA;
    WA.economy.setSettings({ enabled: true });            // 玩家手动开，且 economy 在 urban 表内
    WA.theme.apply(['urban']);
    const cleared = WA.theme.apply([]);
    const stillMine = WA.economy.getSettings().enabled === true;
    a(stillMine === false,
      'N4b: 错误 granted 下清空会越界收回玩家手开的引擎（economy 被关，实 ' + stillMine
      + '；正版此处必为 true）—— 收 ' + cleared.enginesOff.length + ' 个');
    // N4c **正向对照**（两向自证的另一半）：同一段判据在**原版**上必须为真。
    //   没有这一半，「N4b 变红」也可能只是因为「economy 压根开不起来」这类无关原因。
    const envOk = fresh();
    const WOk = envOk.WA;
    WOk.economy.setSettings({ enabled: true });
    WOk.theme.apply(['urban']);
    WOk.theme.apply([]);
    a(WOk.economy.getSettings().enabled === true,
      'N4c: 原版上同款判据为真（玩家手开的 economy 跨题材切换与清空仍开着，实 ' + WOk.economy.getSettings().enabled + '）');
  }
  // N5 破坏⑤：无注入面的引擎静默跳过（不报 notInjected）⇒ 「无注入面」归因失效
  //   判据：把一个**真实存在但无 buildBlock** 的引擎放进题材表 ⇒ 正版下它进 notInjected；
  //   静默跳过的破坏版下 notInjected 变空（玩家看不到「这个机制开了也不出声」）。
  //   ⚠ 实施期实测的第一版破坏**打错了分支**：用不存在的键 `zz-not-such-engine` 当靶标，
  //     而那个名字先命中 `!sh` 那一条（不是 `!sh.hasBuild`）⇒ 破坏对结果毫无影响，判据恒绿。
  //     修法是取现场真靶标（tools/v6probes/p_nobuild.js 实测：78 个「带 enabled + 有 setSettings
  //     但无 buildBlock」的引擎，如 opinion / researchClosure）—— 那才是这条分支唯一能被观测的情形。
  {
    const T = rd(THEME);
    const broken = T.replace(A_NOTINJ, 'if (!sh.hasBuild) { return; }');
    must1Count(T, A_NOTINJ, 'N5');
    a(broken !== T, 'N5: 破坏副本真改了字节（无注入面静默跳过）');
    const src = broken.replace("urban: ['economy',", "urban: ['opinion',");
    a(src !== broken, 'N5a: 破坏副本真把真靶标放进表（opinion：有 enabled 有 setSettings，无 buildBlock）');
    const env = fresh({ 'engines/theme.js': src });
    const r = env.WA.theme.apply(['urban']);
    a(r.notInjected.length === 0,
      'N5b: 静默跳过后同款判据必现形（notInjected 变空：' + JSON.stringify(r.notInjected) + '）');
  }
  // N6 纯度：全部负控制跑完后，原文件逐字未变（含本锁自身）
  {
    const self = rd(SELF_REL);
    a(self.indexOf('runNegative') > 0, 'N6: 本锁自身可读且含 runNegative（纯度前提）');
    const T = rd(THEME);
    a(cnt(T, A_VIA) === 1 && cnt(T, A_SCOPE) === 1 && cnt(T, A_NOOP) === 1
      && cnt(T, A_GRANT) === 1 && cnt(T, A_NOTINJ) === 1,
      'N6b: 五个锚点在原文件里各恰中 1 次（负控制全部跑在内存副本上，零文件改写）');
  }
}
/** 负控制专用：锚点须恰中 1 次（失败即抛，避免「锚点不存在」被静默当成通过） */
function must1Count(src, anchor, tag) {
  const c = cnt(src, anchor);
  if (c !== 1) throw new Error('负控制锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
}

async function runAll(assert) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) pass++; else { fail++; assert(false, msg); } };
  const title = function (s) { console.log('\n\u25a0 ' + s); };
  title('A 结构面：真源表 / 单一判据 / 无第二套写盘');
  runA(a);
  title('B 运行时：真开 / 幂等 / 只收自己开的 / 清空真收回');
  runB(a);
  title('C 归因：坏名如实分类 / partial 非恒真 / 拒收不动引擎');
  runC(a);
  title('D 消费方：诊断节 / 配方回执');
  runD(a);
  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  runNegative(a);
  console.log('\ntheme-engines-v2258: ' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) throw new Error('theme-engines-v2258 有 ' + fail + ' 项失败');
}
module.exports = { runAll: runAll };
if (require.main === module) {
  const assert = function (c, m) { if (!c) throw new Error(m); };
  runAll(assert).then(function () { process.exit(0); }).catch(function (e) { console.log('FAIL: ' + e.message); process.exit(1); });
}