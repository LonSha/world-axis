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
  return fs.readFileSync(path.join(BASE, rel), 'utf8')
    // OPV29-07：tool-diag 的注册表/校验表已出闸到 engines/tool-diag-tables.js。
    //   本读取器给 rel 是 tool-diag 时补上表源 —— 判据问的是「产品里有没有这条登记」，
    //   不是「它写在哪个文件」（与 e9 锁改读「引擎+表」合并面同一口径）。
    + (rel === 'engines/tool-diag.js'
      ? String.fromCharCode(10) + fs.readFileSync(path.join(BASE, 'engines/tool-diag-tables.js'), 'utf8')
      : '');
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

// ═══ 出厂基线（**登记点**，不是魔法数；顶层声明，runB 与 runNegative 共用）════
//   R1 lite 基线：机制 100、running 5、dormant 95。
//   ⚠ BASE_ON 是「**本测试面**出厂态真的开着多少个带 enabled 的引擎」，v2.274.0 实测 26。
//     它与 mechanisms(100)/running(5) 是**三个不同的面**，别混：
//       · mechanisms 100 = 有 buildBlock（有注入面）的引擎
//       · running      5 = 出厂开 且 有 buildBlock 的
//       · BASE_ON     26 = 出厂开的全部（含 21 个无注入面的观测型引擎）
//     恒等式：full 后 running = mechanisms + (BASE_ON − running0) = 100 + 21 = 121。
//
//   ⚠⚠ **26 而不是 27，是「面」的问题，不是引擎少了**（实施期实测立据，别再用 27）：
//     本文件 `fresh()` 只装 `tests/run.js` 的 `LOAD` 清单 = **纯产品层**，开关 187 / 出厂开 26。
//     而 `tests/ui-gate-sync.js` 的 `fresh()` 多装 UI 层，开关 188 / 出厂开 27 —— 多出来的那一个
//     是 `renderPerf`（文件在 `ui/render-perf.js`，是 UI 层模块，不在 LOAD 里）。
//     跨面取数会得到 27，然后本文件的每一条计数判据都会差 1（实测：B6d2/B8/B8b 三红）。
//     故此处登记的必须是**本测试面**的真值。要数 UI 层的那个，另开一条判据，别混进这个基线。
//
//     历史：V6 批次新增 8 个默认开启的产品层引擎（worldDiary / dayRoute / relationTemp /
//     undercurrentCalendar / roundCost / saveHealth / firstRun / handoffPack），故 18 → 26。
//     **引擎出厂态变了就改这里，别改判据形态。**
// v2.293.0（V7 收口 · 基线跟位）：V7 九项（EXV7-1..9）逐个落地后出厂态又长了一截，
//   四个基线常量随之跟位。**只动登记值，不动判据形态**（同 v2.274.0 的口径）：
//     · BASE_ON  29 → 33：V7 新增 4 个默认开启的产品层引擎（worldBrief / dayRoute 侧
//       的 EXV7-1/2/8/9 四批：世界简报 / 人物意图看板 / 世界自传 / 一键播种）。
//     · MECH    100 → 102：有 buildBlock（= 有注入面）的引擎数多了两个 —— 世界自传与
//       一键播种的读数面各带一个 buildBlock。
//     · RUNNING0  5 → 7：出厂开 **且** 有注入面的，随上面两枚一起从 5 涨到 7。
//     · FULL_MECH 65 → 67：= MECH − 35（L3_EXCLUDES 悬空名单未变）。
//   DORMANT 仍是 95：它算的是「关着但有注入面的」，本次两枚新引擎出厂是开的，
//   不进这一桶 —— 与 MECH − RUNNING0 的恒等式同时成立（102 − 7 = 95）。
// v2.381.0（V20/V21 收口 · 基线跟位）：V20 九机制与 V21 八源全域接入后出厂态与注入面
//   同时长了一截，五个基线常量按恒等式一起跟位。**只动登记值，不动判据形态**：
//     · BASE_ON   33 → 39：出厂开着的带 enabled 引擎数（+6）
//     · MECH     105 → 109：有 buildBlock（有注入面）的引擎数（+4）
//     · RUNNING0   7 → 10：出厂开 **且** 有注入面的（+3）
//     · DORMANT   98 → 99：关着但有注入面的（+1，恒等式 109 − 10 = 99 成立）
//     · FULL_MECH 70 → 74：MECH − 35（L3_EXCLUDES 悬空名单未变，109 − 35 = 74）
//   连带同批跟位的非常量判据（数值来自同一现场，逐条核过恒等式）：
//     B4b 38 → 39（74 − 35 已开）；B5c 41 → 44（34 白名单 + 10 出厂）；
//     C3c 69 → 70（109 机制 vs 208 开关）；C7 64 → 65（99 − 34）；
//     D2b 63 → 64（74 − 10）；B6b/C3/C4d/C6 改读常量，不再写第二份数字。
// v2.410.0（V23 收口 · 基线跟位）：V23 批（6a2379d）9 个拓展引擎进场后五个基线常量按恒等式跟位：
//     · BASE_ON   39 → 48：EXV23 九引擎（commodity-circulation / somatic-trauma / psyche-dissociation /
//       mob-stampede / geophysical-reshaping / artifice-degradation / shadow-council /
//       dynastic-lineage / world-singularity）出厂全开且都无注入面（+9）
//     · MECH     109 → 115：另有 6 个有 buildBlock（有注入面）的机制进场（+6）
//     · DORMANT   99 → 105：那 6 个出厂是关的（115 − 10 = 105，恒等式成立）
//     · RUNNING0  10 不变：9 个新出厂开的全无注入面，不进这一桶
//     · FULL_MECH 74 → 80：= MECH − 35（L3_EXCLUDES 悬空名单未变，115 − 35 = 80）
// v2.524.0 收口：本文件这五个常量自 v2.517.0 起就没再跟位，实测早已漂了 ——
//   干净树 f3a2706（v2.522.0）上就已经是 **261 开 / 117 机制**，而登记还写着 234 / 116，
//   于是这条面在 v2.518–v2.522 五个版本里**一直红**（本机全量从来跑不到它，没人看见）。
//   本轮把它一次跟到位，并把「谁推的」写清楚：252 → 261 是 v2.518–v2.522 五个版本的存量漂移，
//   261 → 270 是本批 9 台 EXV27 引擎（pawnRedemption / silverAssay / saltFranchise /
//   brokerHouse / nightWatch / fireWatch / festivalFair / wardCompact / divinationCraft）。
//   口径证据：探针 `/tmp/probe_sw.cjs` 在 f3a2706 与本树上逐名 diff，开集新增恰这 9 个键；
//   MECH（有 buildBlock 的机制）**两树同为 117** —— 本批没有新增注入面，故 MECH 不动。
//   ⚠ v2.539.8 读数跟位（同族第二次漂移，形态与上一批逐字相同）：
//     本面实测 **290 开 / 131 机制**，登记还写着 270 / 117。两处都涨了 20 和 14 ——
//     这次不是新引擎批量入场，而是**有注入面的机制也涨了**（MECH 117 → 131），
//     说明上一批 EXV27 之后又有一批带 buildBlock 的引擎进了装载面，而登记没跟。
//     判据本身没动：仍是「本测试面的实测值写进常量，断了就红」。
// v2.584.0 跟位：attireState（穿着状态，v2.583.0 入场）**出厂 enabled:true 且有 buildBlock**，
//   ⇒ 四数同批 +1：BASE_ON 290 → 291、MECH 132 → 133、RUNNING0 131 → 132、FULL_MECH 132 → 133。
//   恒等式不动：MECH − RUNNING0 = DORMANT 仍成立（133 − 132 = 1），
//   FULL_RUNNING = MECH + (BASE_ON − RUNNING0) 仍由恒等式算出，不写魔法数。
//   为什么这不是「放宽」：四个常量都是**读数**，判据（出厂态自洽 / full 后真涨 / 回滚真收回）
//   一条没动；新引擎默认开启这件事本身若被改成关闭，这四数会再次红。
// v2.587.0 跟位：mapEditor（地图编辑器，v2.587.0 入场）出厂 `enabled:true`，但**没有 buildBlock**
//   ⇒ 只动开集、不动注入面：BASE_ON 291 → 292，MECH 133 / DORMANT 1 / RUNNING0 132 / FULL_MECH 133 全不动。
//   恒等式照旧成立：FULL_RUNNING = MECH + (BASE_ON − RUNNING0) = 133 + (292 − 132) = 293（实测 293）。
//   ⚠ 这一条与 v2.584.0 那批的区别就在这里：那批是「有注入面的机制」涨，这批只是「出厂开着的观测/编辑型」
//   涨一个 —— 只改 BASE_ON 一个数是**对的**，把 MECH 也 +1 才是造数据。
// v2.588.0（R264 / MAP-4）跟位：mapGenerator（底图生成器）出厂 `enabled:true`，同样**没有 buildBlock**
//   —— 它不往注入面里塞任何字节（底图是几何，不是每轮都要喂给模型的文本）。
//   与 v2.587.0 的 mapEditor 同一形态：**只动开集、不动注入面** ⇒ BASE_ON 292 → 293；
//   MECH 133 / DORMANT 1 / RUNNING0 132 / FULL_MECH 133 全不动。
//   恒等式照旧成立：FULL_RUNNING = MECH + (BASE_ON − RUNNING0) = 133 + (293 − 132) = 294。
//   涨一个 —— 只改 BASE_ON 一个数是对的；把 MECH 也 +1 才是造数据。
//   v2.591.0 跟位（NAR-1）：新增 engines/arc-guide-bridge.js —— **只动注入面、不动开集**：
//   它有 buildBlock 且 def.enabled=false（与 sceneIntent 同一形态：零 token 边界，
//   总开关关着时 buildBlock 返回空串），故 MECH 133 → 134、DORMANT 1 → 2、
//   FULL_MECH 133 → 134，BASE_ON 293 不动。恒等式 134 − 132 = 2 成立。
//   ⚠ 它**不进** standard 白名单：进白名单等于替所有存量用户把新机制静默打开，
//     那是另一件事，不能搭在「补落地面」这一版里做。玩家想开请在设置面自己开。

const BASE_ON = 293;        // 本测试面：出厂就开着的带 enabled 引擎数（全开策略 v2.412.0）
// v2.542.6 跟位：叙事脊柱 L1 的 sceneIntent **有 buildBlock（有注入面）但出厂 enabled:false**。
//   为什么它必须是出厂关：L1 的零 token 边界——它被打开之前，注入字节必须与 v2.541.7 逐字节一致
//   （判据见 tests/scene-intent-v2542.js 的 A 段）。于是它成为**第一个**「关着但有注入面」的机制，
//   这不是漂移，是有意的设计：MECH 131→132、DORMANT 0→1、FULL_MECH 131→132，
//   恒等式 MECH − RUNNING0 = DORMANT 仍成立（132 − 131 = 1）。
const MECH = 134;           // 有注入面的机制数（v2.591.0: +arcGuideBridge；v2.584.0: +attireState）
const DORMANT = 2;          // 关着但有注入面的（= sceneIntent + arcGuideBridge：出厂关、有注入面，见上）
const RUNNING0 = 132;        // 出厂开 且 有注入面的（v2.584.0: +attireState）
// full 后的 running 不是魔法数，是恒等式：全部有注入面的 + 出厂就开着的无注入面那些
// v2.294.0：= MECH(103) − L3_EXCLUDES(35)。排除名单本身未变，变的只有 MECH。
const FULL_MECH = 134; // 全开策略后 full 与出厂一致（134；v2.591.0 随 MECH 133→134 跟位；v2.584.0 随 MECH 132→133 跟位）
const FULL_RUNNING = FULL_MECH + (BASE_ON - RUNNING0);

// ═══ 装载环境 ═══════════════════════════════════════════════════════
let __g = null;
function fresh(ov) {
  // 每次都从真 LOAD 重新装载：档位会真写各引擎的设置键，必须一盘干净
  const vm = require('vm');
  const mockPath = path.join(BASE, 'tests/mock.js');
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  // ── v2.275.0：**先摘掉上一轮残留在 global.WorldAxis 上的成员** ──────────────────
  //   治的病（全量回归实测立据）：本文件在**全量**里读到 187→188 个开关、BASE_ON 变 27，
  //     而单跑稳定是 187/26。差别就在 `global.WorldAxis` 是**同一个对象**：
  //     `tests/ui-gate-sync.js` 的 `fresh()` 会把 UI 层（含 `ui/render-perf.js` 导出的
  //     `renderPerf`）装进来，而本文件的 `fresh()` 只重装 `LOAD` —— **不装载却也不清除**，
  //     于是前序节留下的 `WA.renderPerf` 一路活着，`allSwitches()` 动态探测时把它算进开关集。
  //   为什么必须在这里清（而不是把 BASE_ON 改成"全量时 27"）：那等于让判据随"跑的顺序"
  //     变值 —— 正是本仓点名的「靠顺序活着」。本测试面的定义就是"只装 LOAD"，
  //     所以它必须真的**只有** LOAD 装出来的东西。
  //   口径：把 WA 上其余可枚举成员逐个摘掉；LOAD 装出来的产品层由下面重新求值重建。
  //   ⚠ **顺序不可换：必须在 `require(mockPath)` 之前。** `tests/mock.js:173` 是
  //     `const WA = global.WorldAxis = global.WorldAxis || {}` —— 它**复用同一个对象**、
  //     只把自己那份基础设施桩（`WA.log` / `eventLog` / `flushLog` / `on` / `emit`…）
  //     挂上去。先 require 再清空，等于把宿主桩一起摘掉：实测后果是全量里
  //     `capability-ui-v2257` 三条 `WA.log is not a function`（产品模块装载第一句就打日志），
  //     而单跑因 require 缓存命中、旧的 `log` 还活着而看不见 —— 又一处「靠顺序活着」。
  //     故：先清残留 → 再 require mock（桩重建）→ 再装 LOAD（产品层重建）。
  try {
    if (global.WorldAxis && typeof global.WorldAxis === 'object') {
      Object.keys(global.WorldAxis).forEach(function (k) {
        try { delete global.WorldAxis[k]; } catch (e) {}
      });
    }
  } catch (e) {}
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
  // 基线常量在文件顶层声明（runNegative 也要用），此处不再重复定义。
  // 出厂 on 集（逐名快照）—— B6d 拿它做集合相等，防「关一个开一个」计数照样对。
  const ON0 = (function () { try { return T.list().on.slice().sort().join(','); } catch (e) { return ''; } })();
  a(true, 'B0: 本文件以 BASE_ON=' + BASE_ON + ' / MECH=' + MECH + ' / DORMANT=' + DORMANT
    + ' 为基线（本测试面真值，引擎出厂态变更时改这里）');
  a(ON0.split(',').filter(Boolean).length === BASE_ON,
    'B0b: 出厂 on 集快照的长度 = BASE_ON（实 ' + ON0.split(',').filter(Boolean).length + '）—— 基线登记值与本面实测自洽');
  const v0 = T.view();
  a(v0.tier === 'lite', 'B1: 出厂档位 lite（实 ' + v0.tier + '）');
  a(v0.mechanisms === MECH, 'B1b: 有注入面的机制 ' + MECH + ' 个（实 ' + v0.mechanisms + '，探针同数）');
  a(v0.dormant === DORMANT, 'B1c: 关着但有注入面的 ' + DORMANT + ' 个（实 ' + v0.dormant + '，探针同数）');
  a(v0.running === RUNNING0, 'B1d: 出厂真在跑的机制 ' + RUNNING0 + ' 个（带开关且有注入面的，实 ' + v0.running + '）');
  a(v0.gap === 0, 'B1e: 离 standard 还差 0 个（全开策略，实 ' + v0.gap + '）');
  // B2 standard：真开 34 个、零 notEffective、零 partial
  const r1 = T.applyTier('standard');
  a(r1.ok === true && r1.partial === false, 'B2: 切 standard 成功且非 partial');
  a(r1.turnedOn.length === 0, 'B2b: 全开后 standard 无可新开（实 ' + r1.turnedOn.length + '）');
  a(r1.notEffective.length === 0, 'B2c: 复核零未生效（实 ' + r1.notEffective.length + '：' + r1.notEffective.join(',') + '）');
  a(r1.turnedOff.length === 0, 'B2d: 切档路上不关任何东西（实关 ' + r1.turnedOff.length + '）');
  a(r1.rollbackDepth === 0, 'B2e: 全开下 standard 为 noop 不入栈（实 ' + r1.rollbackDepth + '）');
  // B2g 标签面（v2.539.8 新增判据）：**全开装载面上「开关无事可做」≠「档位标签无事可做」**。
  //   原来这两件事被同一个 noop 早退吞掉：r.noop=true、开关一个没动、出口照抄 r.noop 说
  //   「已经是 standard」，而 `getSettings().tier` 仍是 lite——**说的和存的不是一回事**，
  //   玩家关掉面板再进来，档位读数还停在旧档；回滚栈也永远是空的。
  //   capability-ui-v2257 的 B7a / D5 / N6 三条红就是它，但那是**界面面**的证据；
  //   引擎面必须自己有一条，否则「界面锁绿了、引擎又悄悄变回去」无人拦。
  //   判据拆成三件互不替代的事实（缺一条都能让同类缺陷重新长出来）：
  //     ① 开关面确实没动：turnedOn / turnedOff 双空（B2b/B2d 已锁，此处只复核不重复计分）
  //     ② 标签面必须落盘：getSettings().tier === 'standard'
  //     ③ 必须自报 from 与 labelChanged —— 界面据此重绘、据此改措辞，不自报就只能靠猜
  a(T.getSettings().tier === 'standard',
    'B2g1: 全开下切 standard 后档位标签真落盘（要 standard，实 ' + T.getSettings().tier + '）');
  a(r1.noop === true && r1.labelChanged === true && r1.from === 'lite',
    'B2g2: 同一动作被分成两件事报出来：noop(开关没动) + labelChanged(标签变了)，'
    + '实 noop=' + r1.noop + ' labelChanged=' + r1.labelChanged + ' from=' + r1.from);
  a(T.getSettings().granted.length === 0,
    'B2g3: 标签落盘不夹带 granted（没开过的东西不许记成「本模块开的」，实 '
    + T.getSettings().granted.length + ' 条）');
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
  a(r2.rollbackDepth === 0, 'B3b2: 重复切同档栈深不变（实 ' + r2.rollbackDepth + '）');
  a(T.stat().noops >= 1, 'B3c: noop 计数真涨（stat.noops = ' + T.stat().noops + '）');
  // B4 full：本次新开 38 个（70 个 full 机制 − 其中已开 32 个）
  const r3 = T.applyTier('full');
  a(r3.ok === true, 'B4: 切 full 成功');
  // v2.591.0：出厂休眠机制从 1 个变 2 个（sceneIntent + arcGuideBridge）。
  //   这里不写成 turnedOn[0] === 'sceneIntent' —— 顺序取决于 ns 枚举序，
  //   那是在赌实现细节；问「集合是否恰为这两个」才是判据本身。
  a(r3.turnedOn.length === DORMANT
    && r3.turnedOn.indexOf('sceneIntent') >= 0 && r3.turnedOn.indexOf('arcGuideBridge') >= 0,
    'B4b: 全开后 full 只新开那 ' + DORMANT + ' 个「出厂关着但有注入面」的机制（实 '
      + r3.turnedOn.join(',') + '）—— 其余 ' + RUNNING0 + ' 个本就在跑，不是「一键开整个世界」的假象',
    r3.turnedOn);
  const vf = T.view();
  a(vf.running === FULL_MECH, 'B4c: full 后 ' + FULL_MECH + ' 个机制在跑（OPV7-8 下调排除 35 悬空，实 ' + vf.running + '）');
  a(vf.dormant === 0, 'B4d: full 后休眠机制为 0 个（全开策略，实 ' + vf.dormant + '）');
  // B5 回滚：full → standard（栈顶是 standard→full 那行，from=standard）
  const r4 = T.rollback();
  a(r4.ok === true && r4.tier === 'standard',
    'B5: full → standard 回滚成功且档位真回到 standard（实 ' + (r4 && (r4.tier || r4.reason)) + '）'
      + ' —— v2.542.6 之前这里是 no-history：full 无可开故不写栈，现在 full 真开了那一个', r4);
  a(r4.turnedOff.slice().sort().join(',') === 'arcGuideBridge,sceneIntent' && r4.granted.length === 0,
    'B5b: 回滚只收回 full 开的那一个（turnedOff ' + r4.turnedOff.join(',') + ' / granted ' + r4.granted.length + '）',
    r4.turnedOff);
  a(T.view().running === MECH - DORMANT,
    'B5c: 回到 standard 后 ' + (MECH - DORMANT) + ' 个机制在跑（full 新开的那一个已随回滚关掉，实 ' + T.view().running + '）');
  // B6 **本版最要紧的一条**：full → lite 后出厂机制一个不少（初版缺陷在此）
  const r5 = T.applyTier('lite');
  a(r5.ok === true, 'B6: 切回 lite 成功');
  const vl = T.view();
  a(vl.running === RUNNING0, 'B6b: 切回 lite 后真在跑的仍是出厂 ' + RUNNING0 + ' 个（实 ' + vl.running + '，初版此处置 0/丢机制）');
  a(vl.mechanisms === MECH, 'B6c: 机制总数不因档位变化（实 ' + vl.mechanisms + '）');
  // B6d 关键是「出厂那批开关」一个不许被关。
  //   ⚠ 判据升级（v2.274.0）：此前只数个数（=== 18），引擎一增长就红，
  //     且数对了个数也不等于「没被换掉」——若档位关掉 A 又开了 B，计数照样对。
  //     改成**集合相等**：出厂 on 集必须原样回来。这才是本版②号口径
  //     「档位只收回自己开过的」的字面含义。
  const onNow = T.list().on.slice().sort().join(',');
  a(onNow === ON0, 'B6d: 出厂开关集全部完好（' + T.list().on.length + ' 个，逐名一致）'
    + '—— 档位绝不收回不归自己开的东西' + (onNow === ON0 ? '' : '（现：' + onNow.slice(0, 120) + '）'));
  a(T.list().on.length === BASE_ON, 'B6d2: 出厂开关数 = 基线 ' + BASE_ON + '（实 ' + T.list().on.length + '）');
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
  a(s1.running === BASE_ON && s1.dormantWorld === DORMANT,
    'B8: 出厂 summary 读数为 ' + BASE_ON + ' 开 / ' + DORMANT + ' 可开（实 ' + s1.running + '/' + s1.dormantWorld + '）');
  T3.applyTier('full');
  const s2 = A3.summary();
  // full 后的 running 用顶层恒等式 FULL_RUNNING（= MECH + BASE_ON − RUNNING0 = 100 + 26 − 5 = 121）
  a(s2.running === FULL_RUNNING,
    'B8b: full 后 summary 的 running 真涨到 ' + FULL_RUNNING + '（实 ' + s2.running
    + ' = ' + MECH + ' 有注入面 + ' + (BASE_ON - RUNNING0) + ' 出厂开着的观测型）—— 文案不是恒真');
  a(s1.line.indexOf(String(s1.running)) >= 0, 'B8c: 结论文案含现场读数（全开策略下切档不再改变开关面，文案一致是预期）');
  // 结论里出现的数必须是**现场读数**本身，而不是某个写死的字面量。
  a(s2.line.indexOf(String(s2.running)) >= 0,
    'B8d: 结论里的数就是现场读数（' + s2.running + ' 应出现在「' + s2.line + '」里）');
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
  a(au.byReason.defaultOff === DORMANT, 'C3: 出厂关（有注入面）' + DORMANT + ' 个（实 ' + au.byReason.defaultOff + '）');
  a(au.byReason.userOff === 0, 'C3b: 出厂态玩家关掉 0 个（干净盘上没有表态）');
  // v2.542.8：这里比的是**出厂态**（fresh()）的归因面。全开策略下「关着的」只剩
  //   L3/L4 那三台纯读数引擎（arcPhase / characterDrive / injectTier）—— 它们不写注入面，
  //   归因如实给 no-builder。断言点名到 ns 而不是数字：数字漂了看不出是谁。
  const nbNs = au.dormantRows.filter(function (r) { return r.reason === 'no-builder'; })
    .map(function (r) { return r.ns; }).sort();
  a(nbNs.join(',') === 'arcPhase,characterDrive,injectTier',
    'C3c: 「关着且没有注入面」的休眠者恰是叙事脊柱那三台纯读数引擎（' + nbNs.join(',') + '）'
      + ' —— 它们不写注入面，归因如实给 no-builder（不是丢档）', nbNs);
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
    a(a2.byReason.defaultOff === DORMANT, 'C4d: defaultOff 不被污染（实 ' + a2.byReason.defaultOff + '）');
    // C5 恢复 ⇒ 回到 running，userOff 归零
    m.setSettings({ enabled: true });
    const a3 = A.audit();
    a(a3.runningRows.some(function (r) { return r.ns === onRow.ns; }), 'C5: 恢复后回到 running');
    a(a3.byReason.userOff === 0, 'C5b: userOff 归零（实 ' + a3.byReason.userOff + '）');
  }
  // C6 dormantMechanisms 只返回「开了会有内容」的（不含 no-builder）
  const dm = A.dormantMechanisms();
  a(dm.length === DORMANT, 'C6: dormantMechanisms 恰好 ' + DORMANT + ' 个（实 ' + dm.length + '）—— 不含「开了也没用」的');
  const dmBad = dm.filter(function (k) { return typeof env.WA[k].buildBlock !== 'function'; });
  a(dmBad.length === 0, 'C6b: 该清单里每个都真有注入面（坏 ' + dmBad.length + ' 个）');
  // C7 档位与归因交叉：applyTier('standard') 后 defaultOff 应降到 61
  T.applyTier('standard');
  const a4 = A.audit();
  a(a4.byReason.defaultOff === DORMANT, 'C7: standard 后出厂关只剩 ' + DORMANT + ' 个（= sceneIntent + arcGuideBridge：有注入面但不在白名单里，实 ' + a4.byReason.defaultOff + '）—— 两个模块读的是同一个现场');
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
  let outsider = all.off.filter(function (k) {
    if (inStd[k]) return false;
    const m = env.WA[k];
    return m && typeof m.setSettings === 'function';
  })[0];
  // 全开策略下 off 集为空：手动关掉一个非白名单引擎来构造「玩家自配」样本
  if (!outsider) {
    const cand = Object.keys(env.WA).find(function (k) {
      return !inStd[k] && env.WA[k] && typeof env.WA[k].setSettings === 'function'
        && env.WA[k].getSettings && env.WA[k].getSettings().enabled === true;
    });
    if (cand) { env.WA[cand].setSettings({ enabled: false }); outsider = cand; }
  }
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
  a(g.length === DORMANT && g.indexOf('sceneIntent') >= 0 && g.indexOf('arcGuideBridge') >= 0,
    'D2b: 全开只把出厂休眠的 sceneIntent / arcGuideBridge 记进 granted（' + g.join(',') + '）'
      + ' —— 出厂就开着的 ' + RUNNING0 + ' 个一个都不进（否则 lite 回滚会误关它们）', g);
  a(g.indexOf('livingWorld') < 0, 'D2c: 出厂就开着的 livingWorld 不在 granted 里 —— 它不该被档位收回');
  // D3 回滚栈只装启用面（不装世界键、不装引擎设置副本）
  const cfg = T2.getSettings();
  a(Array.isArray(cfg.history), 'D3: 回滚栈存在（全开下为空是合法，实 ' + cfg.history.length + ' 条）');
  const h0 = cfg.history[0];
  if (h0) {
    a(typeof h0.from === 'string' && typeof h0.to === 'string' && Array.isArray(h0.granted),
      'D3b: 栈行只有 {at,from,to,granted} 四个字段的语义（实键 ' + Object.keys(h0).join(',') + '）');
    a(Object.keys(h0).length === 4, 'D3c: 栈行恰 4 个键 —— 不装世界键也不装设置副本（那是 rule-pack 的职责）');
  } else {
    a(true, 'D3b/c: 全开策略下回滚栈恒空，无栈行可验（语义跳过）');
  }
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
    // v2.542.8：负控制的**方向**写反了。N2 破坏的是 granted 计算里的「排除已开」那一步
    //   （`stillOn = target.filter(on === true)`），破坏后 granted 会把出厂就开着的机制也吞进来，
    //   于是 lite 回滚会误关它们 —— 这正是初版缺陷的形态。所以本条要断言的是**病会复现**
    //   （lite 后的开关数明显少于出厂），而不是「仍然保全」。原式 `n === BASE_ON` 在
    //   破坏副本上结构性恒假（它不是判据，是一句永远说不通的话）。
    a(n < BASE_ON - 30,
      'N2: 破坏「排除已开」后 lite 回滚真误关了出厂开关（' + n + ' < ' + BASE_ON + '）'
        + ' —— 初版回收病会复现，故 D2 系列不是恒真');
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
    a(au.byReason.noBuilder === 0,
      'N5: 摘掉 no-builder 判据后归因面不再能区分休眠者（noBuilder=' + au.byReason.noBuilder + ' / defaultOff=' + au.byReason.defaultOff + '）⇒ C3c 不是恒真');
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