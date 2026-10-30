#!/usr/bin/env node
// WorldAxis tests/capability-tier-v2257.js —— v2.257.0（V6 OPV6-1 + OPV6-2）能力档位与启用面可见专锁
//
// 【它治的病（现场实测立据，非阅读推断）】
//   探针 p_defaults.js / p_off_classify.js / p_inject_default.js 实测（v2.256.0）：
//     · 带 enabled 开关的引擎 **179** 个，默认只开 **18** 个；
//     · 关闭的 161 个里 **95 个有 buildBlock**（真会进注入面的世界机制）；
//     · 空世界下注入面只有 4 个源非空 —— 玩家拿到的是「4/107」。
//   人话：**机制做了，玩家碰不到**。V6 的两条第一刀就是「一键打开」与「看见谁在跑」。
//
// 【四条口径（都是本仓反复付过价的）】
//   ① **档位必须真写、真复核**：`setSettings({enabled:true})` 返回 ok 不等于真开
//      （有模块的 saveSettings 会吞盘）。故每个引擎写完必须回读 getSettings().enabled，
//      读不回 true 就进 notEffective，**绝不报「已开启」**。
//   ② **档位只收回自己开过的**：出厂就开着的那 18 个一次都不许被档位关掉。
//      这条是本版实施期实测抓到的真缺陷 —— 初版把「目标集里开着的」全算进 granted，
//      于是 full→lite 回来 running 只有 13（丢了 5 个出厂机制）。
//   ③ **幂等**：重复切同档不许在回滚栈里堆记录（noop:true 且 depth 不变）。
//   ④ **归因三分**：关着的引擎必须能分出「出厂关 / 玩家关 / 没有注入面」三档。
//      判据是**落盘原值里真的写了 enabled:false**，不是 getSettings() ——
//      后者把 def 合并进来，「没表过态」与「表过态说 false」在它眼里长得一样。
//
// 【判据】
//   A 结构：两引擎在 LOAD / LOAD_ORDER 同序 / tool-diag 登记 / 设置键登记 /
//          capability-tier 的 def 里没有 enabled（动作模块不设总开关）/ standard 白名单逐名可解析
//   B 运行时：lite 基线 18 / standard 真开 34 / full 探测 95 / 复核零 notEffective /
//            full→lite 回滚后出厂机制一个不少 / 幂等 noop / 坏档名 bad-value / 空栈 no-history
//   C 归因：三档计数恒等式（running + dormant === switches；三档之和 === dormant）/
//          玩家手动关掉一个默认开的 ⇒ 归因变 user-off / 恢复后回 running
//   D 边界：summary 文案随档位真实变化 / 不改玩家手动开的引擎（边界①反向证）/
//          纯只读模块 capabilityAudit 不写任何引擎开关
//   N1–N6 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚各须恰中 1 次）
//   N7 纯度：全部负控制跑完后原文件逐字未变（含本锁自身）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const TIER = 'engines/capability-tier.js';
const AUDIT = 'engines/capability-audit.js';
const IDX = 'index.js';
const RUNJ = 'tests/run.js';
const DIAG = 'engines/tool-diag.js';
const SELF_REL = 'tests/capability-tier-v2257.js';

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

// ── 破坏锚点（各须恰中 1 次；字面量在本文件里也只许出现一次，故一律用变量拼接）──
// ① 复核口径：turnOn 的回读判据（把「回读确认」换成「信返回值」＝本版要治的病）
const A_VERIFY = '    const back = shapeOf(key);\n    return (back && back.on) ? \'on\' : \'not-effective\';';
// ② granted 判据（初版缺陷锚：target.filter(开着) 会把出厂机制算进 granted）
const A_GRANT = '    const stillOn = uniq(keptGrant.concat(didOn));';
// ③ 幂等早退（摘掉它 ⇒ 重复切同档也写盘入栈）
const A_NOOP = '    if (!toOff.length && !toOn.length) {';
// ④ 归因：落盘原值判据（换成读 getSettings() 就分不出「没表过态」与「表过态 false」）
const A_WROTEFALSE = '    return val.enabled === false;';
// ⑤ 三档归因顺序：先判 no-builder（没有注入面）再判 user-off
const A_REASON = '      if (!r.hasBuild) { reason = \'no-builder\'; byReason.noBuilder++; }';
// ⑥ 动作模块不设 enabled：def 里只有 tier/granted/history
const A_DEF = "  const DEF = { tier: 'lite', granted: [], history: [] };";

// ═══ 装载环境 ═══════════════════════════════════════════════════════
let __g = null;
function fresh(ov) {
  // 每次都从真 LOAD 重新装载：档位会真写各引擎的设置键，必须一盘干净
  const vm = require('vm');
  const mockPath = path.join(BASE, 'tests/mock.js');
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(mockPath);
  // 清空 localStorage，保证每节从出厂态开始
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
  const T = rd(TIER);
  const U = rd(AUDIT);
  const I = rd(IDX);
  const R = rd(RUNJ);
  const D = rd(DIAG);
  must1(T, A_VERIFY, 'A1 turnOn 复核判据');
  must1(T, A_GRANT, 'A1 granted 判据');
  must1(T, A_NOOP, 'A1 幂等早退');
  must1(T, A_DEF, 'A1 def 无 enabled');
  must1(U, A_WROTEFALSE, 'A1 落盘原值判据');
  must1(U, A_REASON, 'A1 三档归因顺序');
  // A2 两引擎进 LOAD 且同序（tier 在前，audit 在后）
  const li = R.indexOf('const LOAD = [');
  const lj = R.indexOf('];', li);
  const LOAD = eval('(' + R.slice(R.indexOf('[', li), lj + 1) + ')');
  const ti = LOAD.indexOf('engines/capability-tier.js');
  const ai = LOAD.indexOf('engines/capability-audit.js');
  a(ti >= 0, 'A2: capability-tier 在 tests/run.js 的 LOAD 里（实 idx ' + ti + '）');
  a(ai >= 0, 'A2b: capability-audit 在 LOAD 里（实 idx ' + ai + '）');
  a(ti >= 0 && ai > ti, 'A2c: tier 在 audit 之前（audit 要看见 tier 自己的设置键）');
  // A3 index.js LOAD_ORDER 同序，且两者都在 ui/panel.js 之前
  const xi = I.indexOf("'engines/capability-tier.js'");
  const yi = I.indexOf("'engines/capability-audit.js'");
  const pi = I.indexOf("'ui/panel.js'");
  a(xi > 0 && yi > xi && pi > yi, 'A3: index.js LOAD_ORDER 同序且在 ui/panel.js 之前（实 ' + xi + '/' + yi + '/' + pi + '）');
  // A4 tool-diag MODULE_EXPORTS 登记（漏登记 = 自检看不见的黑盒）
  a(cnt(D, "'engines/capability-tier.js': 'capabilityTier',") === 1, 'A4: tool-diag 登记 capabilityTier 恰一处');
  a(cnt(D, "'engines/capability-audit.js': 'capabilityAudit',") === 1, 'A4b: tool-diag 登记 capabilityAudit 恰一处');
  // A5 动作模块不设 enabled 总开关：def 里不出现 enabled
  const defLine = T.split(A_DEF)[1] ? A_DEF : '';
  a(defLine.length > 0 && defLine.indexOf('enabled') < 0, 'A5: capabilityTier 的 def 里没有 enabled（关掉它 = 关掉唯一档位入口，会死锁）');
  // A6 standard 白名单 34 条且无重复
  const env = fresh();
  const T2 = env.WA.capabilityTier;
  a(T2.TIERS.standard.length === 34, 'A6: standard 白名单 34 条（实 ' + T2.TIERS.standard.length + '）');
  a(T2.TIERS.standard.length === new Set(T2.TIERS.standard).size, 'A6b: standard 白名单无重复');
  const miss = T2.TIERS.standard.filter(function (k) {
    const m = env.WA[k];
    if (!m || typeof m.getSettings !== 'function') return true;
    const s = m.getSettings();
    return !s || !Object.prototype.hasOwnProperty.call(s, 'enabled');
  });
  a(miss.length === 0, 'A6c: standard 白名单每个名字都是真开关（坏名 ' + miss.length + '：' + miss.join(',') + '）');
  const noBuild = T2.TIERS.standard.filter(function (k) { return typeof env.WA[k].buildBlock !== 'function'; });
  a(noBuild.length === 0, 'A6d: standard 白名单每个都真会进注入面（无 buildBlock 的 ' + noBuild.length + '：' + noBuild.join(',') + '）');
  // A7 三档名单齐备且顺序即动线顺序（由轻到重）
  a(JSON.stringify(T2.TIER_NAMES) === JSON.stringify(['lite', 'standard', 'full']), 'A7: 三档顺序由轻到重（lite → standard → full）');
  // A8 回滚栈上限 12（与 rule-pack 同规格，一眼可对）
  a(T2.MAX_HISTORY === 12, 'A8: 回滚栈上限 12（与 rule-pack 的 MAX_HISTORY 同规格）');
}

// ═══ B 面：运行时（真写 + 真复核）═══════════════════════════════════
function runB(a) {
  const env = fresh();
  const T = env.WA.capabilityTier;
  const A = env.WA.capabilityAudit;
  // B1 lite 基线：机制 100、running 18、dormant 95（与探针 p_off_classify 逐字同数）
  const v0 = T.view();
  a(v0.tier === 'lite', 'B1: 出厂档位 lite（实 ' + v0.tier + '）');
  a(v0.mechanisms === 100, 'B1b: 有注入面的机制 100 个（实 ' + v0.mechanisms + '，探针同数）');
  a(v0.dormant === 95, 'B1c: 关着但有注入面的 95 个（实 ' + v0.dormant + '，探针同数）');
  a(v0.running === 5, 'B1d: 出厂真在跑的机制 5 个（18 个开关里有注入面的那 5 个，实 ' + v0.running + '）');
  a(v0.gap === 34, 'B1e: 离 standard 还差 34 个（实 ' + v0.gap + '）');
  // B2 standard：真开 34 个、零 notEffective、零 partial
  const r1 = T.applyTier('standard');
  a(r1.ok === true && r1.partial === false, 'B2: 切 standard 成功且非 partial');
  a(r1.turnedOn.length === 34, 'B2b: 真开 34 个（实 ' + r1.turnedOn.length + '）');
  a(r1.notEffective.length === 0, 'B2c: 复核零未生效（实 ' + r1.notEffective.length + '：' + r1.notEffective.join(',') + '）');
  a(r1.turnedOff.length === 0, 'B2d: 切档路上不关任何东西（实关 ' + r1.turnedOff.length + '）');
  a(r1.rollbackDepth === 1, 'B2e: 入栈一条（实 ' + r1.rollbackDepth + '）');
  // B2f 逐个真开（不是只数个数）：白名单里每个引擎的 getSettings().enabled 都是 true
  const offStill = T.TIERS.standard.filter(function (k) { return env.WA[k].getSettings().enabled !== true; });
  a(offStill.length === 0, 'B2f: 白名单 34 个逐个回读 enabled===true（未开 ' + offStill.length + '：' + offStill.join(',') + '）');
  // B3 幂等：再切一次 standard ⇒ noop、不写盘、栈不涨
  //   ⚠ 「栈不涨」单独一条**不足以自证幂等**（实施期实测抓到）：第二次切同档时
  //     `from === nm`，即使幂等早退被摘掉也不会入栈。幂等真正保住的是**不重复写盘**，
  //     故判据必须落在 settingsBus 的写入计数上（见 B3c），栈深度只作辅证。
  const w0 = env.WA.settingsBus.stats.writes;
  const r2 = T.applyTier('standard');
  const w1 = env.WA.settingsBus.stats.writes;
  a(r2.noop === true, 'B3: 重复切同档报 noop（实 ' + r2.noop + '）');
  a(w1 === w0, 'B3b: 幂等不重复写盘（writes ' + w0 + ' → ' + w1 + '）—— 这才是幂等保住的实质');
  a(r2.rollbackDepth === 1, 'B3b2: 幂等不往回滚栈里堆记录（实 ' + r2.rollbackDepth + '）');
  a(T.stat().noops >= 1, 'B3c: noop 计数真涨（stat.noops = ' + T.stat().noops + '）');
  // B4 full：本次新开 61 个（100 个有注入面的 − 已开的 39 = 5 出厂 + 34 standard）
  const r3 = T.applyTier('full');
  a(r3.ok === true, 'B4: 切 full 成功');
  a(r3.turnedOn.length === 61, 'B4b: full 本次新开 61 个（100 − 39 已开，实 ' + r3.turnedOn.length + '）');
  const vf = T.view();
  a(vf.running === 100, 'B4c: full 后 100 个机制全在跑（实 ' + vf.running + '）');
  a(vf.dormant === 0, 'B4d: full 后零休眠机制（实 ' + vf.dormant + '）');
  // B5 回滚：full → standard（栈顶是 standard→full 那行，from=standard）
  const r4 = T.rollback();
  a(r4.ok === true, 'B5: 回滚成功');
  a(r4.tier === 'standard', 'B5b: 回滚回到 standard（实 ' + r4.tier + '）');
  a(T.view().running === 39, 'B5c: 回到 standard 的 39 个（34 白名单 + 5 出厂，实 ' + T.view().running + '）');
  // B6 **本版最要紧的一条**：full → lite 后出厂机制一个不少（初版缺陷在此）
  const r5 = T.applyTier('lite');
  a(r5.ok === true, 'B6: 切回 lite 成功');
  const vl = T.view();
  a(vl.running === 5, 'B6b: 切回 lite 后真在跑的仍是出厂 5 个（实 ' + vl.running + '，初版此处置 0/丢机制）');
  a(vl.mechanisms === 100, 'B6c: 机制总数不因档位变化（实 ' + vl.mechanisms + '）');
  // B6d 关键是「出厂那 18 个开关」一个不许被关
  const onNow = T.list().on.length;
  a(onNow === 18, 'B6d: 出厂 18 个开关全部完好（实 ' + onNow + '）—— 档位绝不收回不归自己开的东西');
  // B7 坏档名 / 空栈
  const r6 = T.applyTier('nope');
  a(r6.ok === false && r6.reason === 'bad-value', 'B7: 坏档名如实拒收 bad-value（实 ' + r6.reason + '）');
  a(Array.isArray(r6.known) && r6.known.length === 3, 'B7b: 拒收时答出认识的三个档名');
  // 清栈后 rollback ⇒ no-history
  while (T.rollback().ok === true) { /* 清空 */ }
  const r7 = T.rollback();
  a(r7.ok === false && r7.reason === 'no-history', 'B7c: 空栈回滚如实报 no-history（实 ' + r7.reason + '）');
  // B8 audit 三档归因恒等式与 summary 随档位真变
  const en2 = fresh();
  const T3 = en2.WA.capabilityTier;
  const A3 = en2.WA.capabilityAudit;
  const s1 = A3.summary();
  a(s1.running === 18 && s1.dormantWorld === 95, 'B8: 出厂 summary 读数为 18 开 / 95 可开（实 ' + s1.running + '/' + s1.dormantWorld + '）');
  T3.applyTier('full');
  const s2 = A3.summary();
  a(s2.running === 113, 'B8b: full 后 summary 的 running 真涨到 113（实 ' + s2.running + '）—— 文案不是恒真');
  a(s2.line !== s1.line, 'B8c: 玩家面结论随档位真的变了（「' + s1.line + '」→「' + s2.line + '」）');
  a(s2.line.indexOf('113') >= 0, 'B8d: 结论里的数就是现场读数（不是写死文案）');
  // B9 纯只读模块不写任何引擎开关（audit 调 10 次，开关面一个不动）
  const beforeOn = T3.list().on.join(',');
  for (let i = 0; i < 10; i++) A3.audit();
  a(T3.list().on.join(',') === beforeOn, 'B9: capabilityAudit 连调 10 次不改任何开关（纯只读）');
}

// ═══ C 面：归因三分 ═════════════════════════════════════════════════
function runC(a) {
  const env = fresh();
  const T = env.WA.capabilityTier;
  const A = env.WA.capabilityAudit;
  const au = A.audit();
  // C1 恒等式：running + dormant === switches
  a(au.running + au.dormant === au.switches, 'C1: running + dormant === switches（' + au.running + '+' + au.dormant + '=' + au.switches + '）');
  // C2 三档之和 === dormant
  const s3 = au.byReason.defaultOff + au.byReason.userOff + au.byReason.noBuilder;
  a(s3 === au.dormant, 'C2: 三档归因之和 === dormant（' + s3 + '=' + au.dormant + '）');
  // C3 出厂态：defaultOff 95 / userOff 0 / noBuilder 66（与探针逐字同数）
  a(au.byReason.defaultOff === 95, 'C3: 出厂关（有注入面）95 个（实 ' + au.byReason.defaultOff + '）');
  a(au.byReason.userOff === 0, 'C3b: 出厂态玩家关掉 0 个（干净盘上没有表态）');
  a(au.byReason.noBuilder === 66, 'C3c: 没有注入面 66 个（实 ' + au.byReason.noBuilder + '，100 机制 vs 179 开关）');
  // C4 玩家手动关掉一个默认开的 ⇒ 归因变 user-off（不是 default-off）
  const onRow = au.runningRows.filter(function (r) { return r.hasBuild; })[0];
  a(!!onRow, 'C4: 找一个出厂开着的世界机制做样本（' + (onRow ? onRow.ns : '无') + '）');
  if (onRow) {
    const m = env.WA[onRow.ns];
    m.setSettings({ enabled: false });
    const a2 = A.audit();
    const row = a2.dormantRows.filter(function (r) { return r.ns === onRow.ns; })[0];
    a(!!row && row.reason === 'user-off', 'C4b: 玩家手动关掉后归因是 user-off（实 ' + (row ? row.reason : 'missing') + '）—— 判据走落盘原值，不走 getSettings');
    a(a2.byReason.userOff === 1, 'C4c: userOff 计数真涨（实 ' + a2.byReason.userOff + '）');
    a(a2.byReason.defaultOff === 95, 'C4d: defaultOff 不被污染（实 ' + a2.byReason.defaultOff + '）');
    // C5 恢复 ⇒ 回到 running，userOff 归零
    m.setSettings({ enabled: true });
    const a3 = A.audit();
    a(a3.runningRows.some(function (r) { return r.ns === onRow.ns; }), 'C5: 恢复后回到 running');
    a(a3.byReason.userOff === 0, 'C5b: userOff 归零（实 ' + a3.byReason.userOff + '）');
  }
  // C6 dormantMechanisms 只返回「开了会有内容」的（不含 no-builder）
  const dm = A.dormantMechanisms();
  a(dm.length === 95, 'C6: dormantMechanisms 恰好 95 个（实 ' + dm.length + '）—— 不含「开了也没用」的');
  const dmBad = dm.filter(function (k) { return typeof env.WA[k].buildBlock !== 'function'; });
  a(dmBad.length === 0, 'C6b: 该清单里每个都真有注入面（坏 ' + dmBad.length + ' 个）');
  // C7 档位与归因交叉：applyTier('standard') 后 defaultOff 应降到 61
  T.applyTier('standard');
  const a4 = A.audit();
  a(a4.byReason.defaultOff === 61, 'C7: standard 后出厂关剩 61 个（95−34，实 ' + a4.byReason.defaultOff + '）—— 两个模块读的是同一个现场');
}

// ═══ D 面：边界与不变量 ═════════════════════════════════════════════
function runD(a) {
  const env = fresh();
  const T = env.WA.capabilityTier;
  // D1 **边界①的反向证**：玩家自己手动开的引擎，切档时不关它
  //    选一个不在 standard 白名单里、也没注入面的开关（no-builder 类），手动开
  const all = T.list();
  const inStd = {};
  T.TIERS.standard.forEach(function (k) { inStd[k] = true; });
  const outsider = all.off.filter(function (k) {
    if (inStd[k]) return false;
    const m = env.WA[k];
    return m && typeof m.setSettings === 'function';
  })[0];
  a(!!outsider, 'D1: 找一个白名单外的开关做样本（' + outsider + '）');
  if (outsider) {
    env.WA[outsider].setSettings({ enabled: true });
    a(env.WA[outsider].getSettings().enabled === true, 'D1b: 玩家手动开起来了');
    T.applyTier('standard');
    a(env.WA[outsider].getSettings().enabled === true, 'D1c: 切 standard 后玩家手动开的不被关（实 ' + env.WA[outsider].getSettings().enabled + '）—— 档位只动 granted');
    T.applyTier('lite');
    a(env.WA[outsider].getSettings().enabled === true, 'D1d: 切回 lite 后仍不被关 —— 「换个档，我配的东西没了」这条病不存在');
    env.WA[outsider].setSettings({ enabled: false });
  }
  // D2 granted 只装「本模块开过的」：lite 出厂态 granted 必须为空
  const en2 = fresh();
  const T2 = en2.WA.capabilityTier;
  a(T2.view().granted.length === 0, 'D2: 出厂 granted 为空（出厂机制不进 granted，实 ' + T2.view().granted.length + '）');
  T2.applyTier('full');
  const g = T2.view().granted;
  a(g.length === 95, 'D2b: full 后 granted 恰好是本次真开的 95 个（实 ' + g.length + '，不含出厂 5 个）');
  a(g.indexOf('livingWorld') < 0, 'D2c: 出厂就开着的 livingWorld 不在 granted 里 —— 它不该被档位收回');
  // D3 回滚栈只装启用面（不装世界键、不装引擎设置副本）
  const cfg = T2.getSettings();
  a(Array.isArray(cfg.history) && cfg.history.length >= 1, 'D3: 回滚栈有记录（实 ' + cfg.history.length + '）');
  const h0 = cfg.history[0];
  a(h0 && typeof h0.from === 'string' && typeof h0.to === 'string' && Array.isArray(h0.granted),
    'D3b: 栈行只有 {at,from,to,granted} 四个字段的语义（实键 ' + Object.keys(h0).join(',') + '）');
  a(Object.keys(h0).length === 4, 'D3c: 栈行恰 4 个键 —— 不装世界键也不装设置副本（那是 rule-pack 的职责）');
  // D4 档位不写 store 骨架（零 store 写）
  const st0 = JSON.stringify(env.WA.store.get());
  T2.applyTier('lite');
  T2.applyTier('standard');
  a(JSON.stringify(en2.WA.store.get()) === st0, 'D4: 切两次档后 store 骨架逐字未变（本模块零 store 写）');
  // D5 两个模块的统计面都能回答「做过什么」
  const auD5 = en2.WA.capabilityAudit.audit();   // 先真调一次，计量才有得读
  a(T2.stat().applies >= 2, 'D5: stat.applies 记了切档次数（实 ' + T2.stat().applies + '）');
  a(auD5.ok === true && en2.WA.capabilityAudit.stat().audits >= 1, 'D5b: capabilityAudit.stat().audits 记了盘点次数（实 ' + en2.WA.capabilityAudit.stat().audits + '）');
  // D6 summary 的 showSummary 开关可关（玩家可以不要这条摘要）
  en2.WA.capabilityAudit.setSettings({ showSummary: false });
  a(en2.WA.capabilityAudit.summary().showSummary === false, 'D6: showSummary 可关（玩家不想要摘要时不显示）');
  en2.WA.capabilityAudit.setSettings({ showSummary: true });
  a(en2.WA.capabilityAudit.summary().showSummary === true, 'D6b: 可再打开');
}

// ═══ N 面：真源码破坏 → 破坏副本上重跑同款判据 ═════════════════════
//   ⚠ 纪律：破坏打在**语义**上（不是把判据删掉），锚点在真源码里恰中 1 次。
function brk(src, txt, repl, tag) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('破坏锚点命中 ' + n + ' 次（要求恰 1 次）: ' + tag);
  return src.replace(txt, repl);
}
function runNegative(a) {
  const T0 = rd(TIER);
  const U0 = rd(AUDIT);
  const SELF0 = rd(SELF_REL);
  // N0 锚点纯度
  must1(T0, A_VERIFY, 'N0 复核判据');
  must1(T0, A_GRANT, 'N0 granted 判据');
  must1(T0, A_NOOP, 'N0 幂等早退');
  must1(U0, A_WROTEFALSE, 'N0 落盘原值判据');
  must1(U0, A_REASON, 'N0 三档归因');
  // N1 摘掉回读复核（信 setSettings 的返回值）⇒ B2c「零未生效」不是恒真
  //    做法：把复核换成恒真 —— 这样 turnOn 永远返回 'on'，即使真没开也一样。
  {
    const T1 = brk(T0, A_VERIFY, '    const back = shapeOf(key);\n    return true ? \'on\' : \'not-effective\';', 'N1');
    // 破坏后：把一个「写不进去」的模块伪装成能开，判据应该看见 notEffective 为空（假绿）
    // 故本判据反过来证明：真判据下 notEffective 会真的抓到写不进去的模块。
    // 构造一个写不进去的模块：setSettings 存在但 getSettings 恒 false
    const env = fresh({ [TIER]: T1 });
    const T = env.WA.capabilityTier;
    // 打桩一个「假装成功」的引擎进 WA（setSettings 什么也不做）
    env.WA.__n1Probe = {
      getSettings: function () { return { enabled: false }; },
      setSettings: function () { return { ok: true }; },
      buildBlock: function () { return ''; }
    };
    T.TIERS.standard.push('__n1Probe');
    const r = T.applyTier('standard');
    a(r.notEffective.indexOf('__n1Probe') < 0,
      'N1: 摘掉回读复核后「写不进去的模块」被当成开成功（notEffective 里没有它）⇒ B2c 的「零未生效」不是恒真');
    T.TIERS.standard.pop();
    delete env.WA.__n1Probe;
  }
  // N1b 真判据下同一个假模块**必须**被抓住
  {
    const env = fresh();
    const T = env.WA.capabilityTier;
    env.WA.__n1bProbe = {
      getSettings: function () { return { enabled: false }; },
      setSettings: function () { return { ok: true }; },
      buildBlock: function () { return ''; }
    };
    T.TIERS.standard.push('__n1bProbe');
    const r = T.applyTier('standard');
    a(r.notEffective.indexOf('__n1bProbe') >= 0,
      'N1b: 真判据下「setSettings 说 ok 但回读还是 false」的模块被如实报进 notEffective ⇒ 复核是真的');
    T.TIERS.standard.pop();
    delete env.WA.__n1bProbe;
  }
  // N2 把 granted 判据换回初版缺陷写法 ⇒ B6b「出厂机制一个不少」现形
  {
    const T2 = brk(T0, A_GRANT,
      '    const stillOn = target.filter(function (k) { const sh = shapeOf(k); return !!(sh && sh.on === true); });', 'N2');
    const env = fresh({ [TIER]: T2 });
    const T = env.WA.capabilityTier;
    T.applyTier('full');
    T.applyTier('lite');
    const n = T.list().on.length;
    a(n < 18, 'N2: 换回初版 granted 写法后切回 lite 出厂开关只剩 ' + n + ' 个（<18）⇒ B6d 不是恒真');
  }
  // N3 摘掉幂等早退 ⇒ B3b「幂等不重复写盘」现形
  //   ⚠ 破坏不能只摘 `if` 早退：从 lite 切到 standard 时 from !== nm，即使没有幂等早退
  //     也不入栈、不写盘 —— 那样破坏后判据仍绿，是假负控制。
  //     真正让「重复切同档」产生写盘的，是**无条件 saveSettings** 这段落盘路径。
  //     故破坏打在「幂等早退之后立即写盘」这一语义上：把早退换成「照常走完并多写一次盘」。
  {
    const T3 = brk(T0, A_NOOP,
      '    if (!toOff.length && !toOn.length && saveSettings({ tier: nm, granted: before })) {', 'N3');
    const env = fresh({ [TIER]: T3 });
    const T = env.WA.capabilityTier;
    T.applyTier('standard');
    const w0 = env.WA.settingsBus.stats.writes;
    T.applyTier('standard');
    const w1 = env.WA.settingsBus.stats.writes;
    a(w1 > w0, 'N3: 摘掉幂等早退后重复切同档真的写盘了（writes ' + w0 + ' → ' + w1 + '）⇒ B3b 不是恒真');
  }
  // N4 落盘原值判据换成 getSettings ⇒ C4b「玩家关的归因是 user-off」现形
  //    做法：把 wroteFalse 改成恒 false —— 于是玩家关掉的会被归成 default-off
  {
    const U4 = brk(U0, A_WROTEFALSE, '    return false && val.enabled === false;', 'N4');
    const env = fresh({ [AUDIT]: U4 });
    const A = env.WA.capabilityAudit;
    const au = A.audit();
    const onRow = au.runningRows.filter(function (r) { return r.hasBuild; })[0];
    if (onRow) {
      env.WA[onRow.ns].setSettings({ enabled: false });
      const a2 = A.audit();
      const row = a2.dormantRows.filter(function (r) { return r.ns === onRow.ns; })[0];
      a(!!row && row.reason === 'default-off',
        'N4: 落盘原值判据被摘掉后玩家关掉的被误归成 default-off（实 ' + (row ? row.reason : 'missing') + '）⇒ C4b 不是恒真');
    }
  }
  // N5 三档归因顺序反了（先判 user-off 再判 no-builder）⇒ C3c「没有注入面 66」现形
  //    做法：把 no-builder 那行换成「永不成立」，于是 66 个会被算进 default-off
  {
    const U5 = brk(U0, A_REASON, '      if (false) { reason = \'no-builder\'; byReason.noBuilder++; }', 'N5');
    const env = fresh({ [AUDIT]: U5 });
    const au = env.WA.capabilityAudit.audit();
    a(au.byReason.noBuilder === 0 && au.byReason.defaultOff > 95,
      'N5: 摘掉 no-builder 判据后归因塌成一堆（noBuilder=' + au.byReason.noBuilder + ' / defaultOff=' + au.byReason.defaultOff + '）⇒ C3c 不是恒真');
  }
  // N6 给 capabilityTier 的 def 加 enabled:false ⇒ A5「动作模块不设总开关」现形
  {
    const T6 = brk(T0, A_DEF, "  const DEF = { enabled: false, tier: 'lite', granted: [], history: [] };", 'N6');
    const env = fresh({ [TIER]: T6 });
    const s = env.WA.capabilityTier.getSettings();
    a(s.enabled === false,
      'N6: def 里加上 enabled:false 后档位模块自己变成可关（实 ' + s.enabled + '）⇒ A5 的「不设总开关」不是恒真');
  }
  // N7 纯度：全部负控制跑完后原文件逐字未变
  a(rd(TIER) === T0, 'N7:（纯度）全部负控制跑完后 engines/capability-tier.js 逐字未变');
  a(rd(AUDIT) === U0, 'N7b:（纯度）capability-audit.js 逐字未变');
  a(rd(SELF_REL) === SELF0, 'N7c:（纯度）本锁自身文件逐字未变 —— 负控制只许动内存副本');
}

const restoring = require('./lock-assert.js').restoring;
module.exports = {
  runA: restoring(runA), runB: restoring(runB), runC: restoring(runC), runD: restoring(runD),
  runNegative: restoring(runNegative),
  runAll: restoring(function (a) { runA(a); runB(a); runC(a); runD(a); }),
  REL: TIER
};
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  const run = function (fn, tag) {
    try { fn(a); } catch (e) { fail++; console.log('  x ' + tag + ' threw: ' + (e && e.stack)); }
  };
  run(runA, 'A'); run(runB, 'B'); run(runC, 'C'); run(runD, 'D');
  run(runNegative, 'N');
  console.log('capability-tier-v2257: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}