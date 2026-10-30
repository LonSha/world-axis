#!/usr/bin/env node
// WorldAxis tests/three-gates-v2259.js —— v2.259.0（V6 OPV6-4）三重门槛自检专锁
//
// 【它治的病（现场实测立据，非阅读推断）】
//   v2.257.0 的 `capability` 节能答「179 个开关此刻谁在跑」（running 5 / dormant 95），
//   却答不出玩家最先撞上的那个问题：**机制开着的那些，为什么正文里没内容**。
//   v2.259.0 探针 tools/v6probes/p_three_gates.js 实测出厂态：
//     · 门槛① 引擎 enabled      → running 5 / mechanisms 100 / tier lite（过）
//     · 门槛② 注入源 visibility → 107 源里 on 6 / mod-off 74 / vis-off 3 / unavailable 24（不过）
//     · 门槛③ 预算档位          → budget 2400 未挤掉任何源（过）
//   三重门槛全通的源只有 6 个 —— 这就是「装了插件却只看到一点世界」的真原因。
//
// 【四条口径（每条都是本仓反复付过价的）】
//   ① **只用现场读数，不另立真源**：引擎门槛走 capabilityTier.view（「什么算引擎」的唯一判据），
//      可见性走 render.visibilityStat().faceAudit（v2.91.0 已把两面真值摆在一起），
//      预算走 injectBudget.resolveBudget()/plan()。本节不重算任何一条。
//   ② **每个门槛的动作必须真可执行**：fix.do 只能是现场存在的写入口名，
//      给不出动作就 fix:null + why（编一个假按钮比不给更坏）。
//   ③ **缺件如实报 absent，绝不当通过**：诊断面不在场 ⇒ 'unknown'，
//      不在没读到的情况下说「这道门槛过了」。
//   ④ **部分成功就是部分成功**：可见性按比例三档（≥半数 pass / >0 不足半数 degraded / =0 blocked），
//      绝不把「6/107 通」折成「三道门槛都通」。
//
// 【实施期抓到的两处「假绿」（都写成本锁的负控制）】
//   ⚠ 一、`capabilityTier.view()` 返回的是 `{running, mechanisms, dormant, granted, ...}`，
//      **没有** `total` / `off`。首版照计划文字写成 `v.total` / `v.off` ⇒ 三个数字全 undefined，
//      而判据（`v.running > 0 ? 'pass' : 'blocked'`）照样绿。**判据读到不存在的字段时不会红**，
//      这是最隐蔽的一类假绿 ⇒ 本锁 C1 逐字段断言 nums 是真数字。
//   ⚠ 二、门槛②首版判据 `on.length > 0 ? 'pass' : 'blocked'` 在 6/107 时仍报 pass，
//      `threeGatesLine` 输出「三道门槛都通，可以开始推演」——玩家读到「都通」就不会去开
//      那 74 个被模块总开关挡住的源 ⇒ 本锁 N1 就是这条的负控制。
//
// 【判据】
//   A 结构：四条锚点各恰中 1 次 / 导出面自证 / 不另立真源（三个现场读口都在）/ 函数体内零写入口 /
//           诊断节真注册 / 面板真接线 / 版本已升位
//   B 运行时：出厂三门槛读数 / 每条 gate 形态合法 / 六接通数与 faceAudit 自洽 / 只读（不动世界）
//   C 归因：nums 逐字段是真数字（防字段名假绿）/ verdict 与计数四态自洽 / 缺件报 absent 不假称通过
//   D 消费方：tool-diag 的 health 节 / 面板概览体检块 / 通过时不占屏 / 模块映射表已登记
//   N1–N4 负控制：真源码破坏 ⇒ 在**破坏副本**上重跑**同款**真判据（逐锚各须恰中 1 次）
//   N5 纯度：全部负控制跑完后原文件逐字未变
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const HP = 'engines/health-preflight.js';
const TIER = 'engines/capability-tier.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const RUNJ = 'tests/run.js';
const IDX = 'index.js';
const SELF_REL = 'tests/three-gates-v2259.js';

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
function gateOf(r, id) {
  const g = (r.gates || []).filter(function (x) { return x.id === id; });
  return g.length === 1 ? g[0] : null;
}

// ── 破坏锚点（各须恰中 1 次；字面量在本文件里也只许出现一次，故用变量持有）──
// ① 可见性比例三档（口径④；摘掉它 ⇒ 「6/107 通」被折成「都通」）
const A_RATIO = "const visState = on.length === 0 ? 'blocked' : (ratio >= 0.5 ? 'pass' : 'degraded');";
// ①-b 首版判据（负控制要装回去的那一句：把部分成功折成全成功）
const A_RATIO_BAD = "const visState = on.length > 0 ? 'pass' : 'blocked';";
// ② degraded ⇒ partial（摘掉它 ⇒ 有门槛只过一半也报 running）
const A_DEG = "else if (degraded.length) verdict = 'partial';";
const A_DEG_OFF = "else if (false) verdict = 'partial';";
// ③ absent ⇒ unknown（口径③：缺件不得当通过）
const A_ABS = "else if (absent.length) verdict = 'unknown';";
const A_ABS_OFF = "else if (absent.length) verdict = 'running';";
// ④ 先修哪条：blocked / degraded 里第一条带动作的（摘掉 degraded ⇒ partial 时给不出动作）
const A_FIRST = 'const first = blocked[0] || degraded[0] || null;';

// ═══ 装载环境（与 theme-engines-v2258 同一套：mock + run.js 的 LOAD 清单）═══
function fresh(ov) {
  const vm = require('vm');
  const mockPath = path.join(BASE, 'tests/mock.js');
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(mockPath);
  // 清空 localStorage：三门槛读数受各引擎设置影响，必须每节从出厂态开始
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
  const H = rd(HP);
  const I = rd(TIER);
  const D = rd(DIAG);
  const P = rd(PANEL);
  const ID = rd(IDX);
  // A1 四条锚点各恰 1 次（口径②③④的唯一实现处）
  must1(H, A_RATIO, 'A1 可见性比例三档');
  must1(H, A_DEG, 'A1 degraded ⇒ partial');
  must1(H, A_ABS, 'A1 absent ⇒ unknown');
  must1(H, A_FIRST, 'A1 先修哪条（blocked / degraded 首条）');
  // A2 导出面自证：两个口都在（且各只声明一次）
  a(cnt(H, 'threeGates: threeGates,') === 1, 'A2: threeGates 在导出面上（实 ' + cnt(H, 'threeGates: threeGates,') + '）');
  a(cnt(H, 'threeGatesLine: threeGatesLine') === 1, 'A2b: threeGatesLine 在导出面上');
  // A3 不另立真源：三个门槛各走现场的读口
  a(cnt(H, 'WA.capabilityTier.view()') >= 1, 'A3: 门槛①走 capabilityTier.view（「什么算引擎」的唯一判据）');
  a(cnt(H, 'WA.render.visibilityStat()') >= 1, 'A3b: 门槛②走 render.visibilityStat（两面真值只有一份）');
  a(cnt(H, 'WA.injectBudget.resolveBudget()') >= 1, 'A3c: 门槛③走 injectBudget.resolveBudget（预算只算一次）');
  a(cnt(H, 'faceAudit') >= 1, 'A3d: 可见性面直读 faceAudit（不自己重算两面对账）');
  // A4 函数体内零写入口：体检面不许边诊断边改世界（口径②只说「该按哪个写入口」，不替玩家点）
  const i0 = H.indexOf('function threeGates(opts)');
  const i1 = H.indexOf('WA.healthPreflight = {');
  a(i0 > 0 && i1 > i0, 'A4: 能切出 threeGates / threeGatesLine 的函数体区间（' + i0 + '..' + i1 + '）');
  const body = H.slice(i0, i1);
  const WRITERS = ['applyTier(', 'flipSwitch(', 'setVisibility(', 'setSettings(', 'enableModule(', 'saveTier('];
  const hitW = WRITERS.filter(function (w) { return cnt(body, w) > 0; });
  a(hitW.length === 0, 'A4b: 三门槛函数体里零写入口调用（命中 ' + hitW.length + '：' + hitW.join(',') + '）—— 诊断不改世界');
  // A5 absent 分支真的存在（每条门槛**两种**「读不到」出口：读取异常 + 模块未加载 ⇒ 3×2=6）
  //   ⚠ 实施期首版本条写成 === 3，实跑 6 ⇒ 红。这不是代码错，是判据口径错：
  //     只看「每门槛一条」会漏掉「模块压根没加载」那一支，而那一支才是出厂缺件的真实形态。
  a(cnt(H, "'absent', {}") === 6, 'A5: 三条门槛各两种 absent 出口（读取异常 + 未加载，实 ' + cnt(H, "'absent', {}") + ' / 应 6）');
  // A5b 而且 absent 不参与 passed 计数（否则缺件会被数成「过了一道」）
  a(cnt(H, "v.running > 0 ? 'pass' : 'blocked'") === 1,
    'A5b: 门槛①只在真读到 running>0 时才 pass（缺件不冒充通过）');
  // A5c ok 的判据必须含 absent（实施期首版漏了它 ⇒ verdict 报 unknown 而 ok 仍是 true）
  a(cnt(H, 'ok: blocked.length === 0 && degraded.length === 0 && absent.length === 0') === 1,
    'A5c: ok 把 absent 也算进去（「读不到」不是「过了」，实 ' + cnt(H, 'absent.length === 0,') + '）');
  // A6 诊断节真注册（否则 threeGates 就是死导出）
  a(cnt(D, 'function secHealth()') === 1, 'A6: tool-diag 有 secHealth 节（实 ' + cnt(D, 'function secHealth()') + '）');
  a(cnt(D, 'health: secHealth()') === 1, 'A6b: health 节真登记进 collect()');
  a(cnt(D, 'threeGates({ sample: 8 })') >= 1, 'A6c: 诊断节真读 threeGates（产品侧真消费方）');
  // A7 面板真接线（玩家可达）
  a(cnt(P, 'WA.healthPreflight.threeGatesLine') >= 1, 'A7: 面板真读 threeGatesLine（玩家可达）');
  a(cnt(P, 'wa-health-line') >= 2, 'A7b: 体检块有稳定 id（渲染分支与占位各一处，实 ' + cnt(P, 'wa-health-line') + '）');
  // A8 版本已升位（VERSION 与 manifest 同批）
  a(/VERSION\s*=\s*'2\.(?:25[9]|2[6-9][0-9]|[3-9][0-9]{2})\.\d+'/.test(ID), 'A8: index.js VERSION 不早于 2.259.0（实 ' + (ID.match(/const VERSION = '([^']+)'/) || [])[1] + '）');
  const mani = rd('manifest.json');
  a(/"version"\s*:\s*"2\.(?:25[9]|2[6-9][0-9]|[3-9][0-9]{2})\.\d+"/.test(mani), 'A8b: manifest.json version 不早于 2.259.0');
}

// ═══ B 面：运行时（真读数 + 只读）═══════════════════════════════════
function runB(a) {
  const env = fresh();
  const WA = env.WA;
  const hp = WA.healthPreflight;
  a(!!hp && typeof hp.threeGates === 'function', 'B1: 运行时有 threeGates');
  const r = hp.threeGates();
  // B2 三条门槛一条不少（缺一条 = 少了三分之一的诊断面）
  a((r.gates || []).length === 3, 'B2: 恰好三条门槛（实 ' + (r.gates || []).length + '）');
  const ids = (r.gates || []).map(function (g) { return g.id; }).join(',');
  a(ids === 'engine,visibility,budget', 'B2b: 门槛身份与顺序固定（实 ' + ids + '）');
  // B3 每条 gate 形态合法：state 四态封闭集、fix 为 null 或 {do,arg,hint}
  const STATES = ['pass', 'blocked', 'degraded', 'absent'];
  const badState = (r.gates || []).filter(function (g) { return STATES.indexOf(g.state) < 0; });
  a(badState.length === 0, 'B3: state 落在四态封闭集里（越界 ' + badState.length + '）');
  const badFix = (r.gates || []).filter(function (g) {
    if (g.fix === null) return false;
    return !(g.fix && typeof g.fix.do === 'string' && g.fix.do.length > 0 && typeof g.fix.hint === 'string');
  });
  a(badFix.length === 0, 'B3b: fix 只能是 null 或 {do:string, hint:string}（不合规 ' + badFix.length + '）');
  // B3c 口径②的执行面：do 必须是现场真存在的写入口名（不是好看的假按钮）
  const REAL_DO = ['applyTier', 'enableModule', 'setVisibility', 'resolveBudget', 'flipSwitch'];
  const fakeDo = (r.gates || []).filter(function (g) { return g.fix && REAL_DO.indexOf(g.fix.do) < 0; });
  a(fakeDo.length === 0, 'B3c: fix.do 都是现场存在的写入口（编造 ' + fakeDo.length + '：'
    + fakeDo.map(function (g) { return g.fix.do; }).join(',') + '）');
  // B4 六接通数与 faceAudit 自洽（诊断读数不许与真值面打架）
  const vs = WA.render.visibilityStat();
  const faces = vs.faceAudit || [];
  const onReal = faces.filter(function (x) { return x.face === 'on'; }).length;
  const gv = gateOf(r, 'visibility');
  a(!!gv, 'B4: 有可见性门槛');
  a(gv.nums.sources === faces.length && gv.nums.on === onReal,
    'B4b: 门槛②读数与 faceAudit 同源（' + gv.nums.on + '/' + gv.nums.sources + ' vs ' + onReal + '/' + faces.length + '）');
  a(r.sourcePassing === onReal && r.sourceTotal === faces.length,
    'B4c: 顶层 sourcePassing/sourceTotal 就是同一组数（' + r.sourcePassing + '/' + r.sourceTotal + '）');
  const sumFaces = gv.nums.on + gv.nums.modOff + gv.nums.visOff + gv.nums.unavailable;
  a(sumFaces === gv.nums.sources, 'B4d: 四种面相加等于总源数（' + sumFaces + ' vs ' + gv.nums.sources + '）—— 没有源漏分类');
  // B5 门槛①读数与 capabilityTier 同源
  const tv = WA.capabilityTier.view();
  const ge = gateOf(r, 'engine');
  a(ge.nums.running === tv.running && ge.nums.mechanisms === tv.mechanisms && ge.nums.dormant === tv.dormant,
    'B5: 门槛①读数与 capabilityTier.view 同源（' + ge.nums.running + '/' + ge.nums.mechanisms + '）');
  a(ge.nums.dormant === ge.nums.mechanisms - ge.nums.running,
    'B5b: dormant 与 mechanisms-running 自洽（' + ge.nums.dormant + ' vs ' + (ge.nums.mechanisms - ge.nums.running) + '）');
  // B6 门槛③读数与 injectBudget 同源
  const b = WA.injectBudget.resolveBudget();
  const gb = gateOf(r, 'budget');
  a(gb.nums.budget === b.budget && gb.nums.source === b.source,
    'B6: 门槛③读数与 resolveBudget 同源（' + gb.nums.budget + '/' + gb.nums.source + '）');
  // B7 只读（口径②：诊断不改世界）—— 连调三次，三面读数与写盘计数一律不动
  const w0 = WA.settingsBus.stats.writes;
  const run0 = WA.capabilityTier.view().running;
  const tier0 = WA.capabilityTier.view().tier;
  hp.threeGates(); hp.threeGates({ sample: 20 }); hp.threeGatesLine();
  a(WA.settingsBus.stats.writes === w0, 'B7: 连调三次零写盘（writes ' + w0 + ' → ' + WA.settingsBus.stats.writes + '）');
  a(WA.capabilityTier.view().running === run0 && WA.capabilityTier.view().tier === tier0,
    'B7b: 启用面读数不被诊断改变（running ' + run0 + ' / tier ' + tier0 + '）');
  // B8 threeGatesLine 是一句人话且带关键数（面板摘要行整句逐字取它）
  const line = hp.threeGatesLine();
  a(typeof line === 'string' && line.length > 0, 'B8: threeGatesLine 返回非空整句');
  a(line.indexOf(String(r.sourcePassing) + '/' + r.sourceTotal) >= 0,
    'B8b: 整句里带「源全通 N/M」（面板不再自己拼数字，实「' + line + '」）');
  // B9 sample 上限真的夹紧（20 上限，防玩家/诊断把整表拉出来）
  const gs = gateOf(hp.threeGates({ sample: 999 }), 'visibility');
  a((gs.nums.sample || []).length <= 20, 'B9: sample 上限夹在 20（实 ' + (gs.nums.sample || []).length + '）');
}

// ═══ C 面：归因（假绿三条防线）═══════════════════════════════════════
function runC(a) {
  const env = fresh();
  const WA = env.WA;
  const hp = WA.healthPreflight;
  const r = hp.threeGates();
  // C1 【防字段名假绿】nums 逐字段必须是真数字，不是 undefined
  //   实施期首版照计划文字写成 v.total / v.off ⇒ 三个数字全 undefined 而判据恒绿。
  const ge = gateOf(r, 'engine'), gv = gateOf(r, 'visibility'), gb = gateOf(r, 'budget');
  const numFields = [
    [ge, ['running', 'mechanisms', 'dormant']],
    [gv, ['sources', 'on', 'modOff', 'visOff', 'unavailable', 'onRatio']],
    [gb, ['budget']]
  ];
  const badNums = [];
  numFields.forEach(function (p) {
    p[1].forEach(function (k) { if (typeof p[0].nums[k] !== 'number' || !isFinite(p[0].nums[k])) badNums.push(p[0].id + '.' + k); });
  });
  a(badNums.length === 0, 'C1: 每条门槛的关键 nums 都是真数字（空洞 ' + badNums.length + '：' + badNums.join(',') + '）');
  // C1b 而且不是恒 0（恒 0 也是「读不到」的一种伪装）
  a(gv.nums.sources > 0 && ge.nums.mechanisms > 0, 'C1b: 关键数不是恒 0（sources ' + gv.nums.sources + ' / mechanisms ' + ge.nums.mechanisms + '）');
  // C2 【防分支漏写】verdict 必须与四态计数自洽
  const expect = r.blocked > 0 ? 'empty-risk' : (r.degraded > 0 ? 'partial' : (r.absent > 0 ? 'unknown' : 'running'));
  a(r.verdict === expect, 'C2: verdict 与计数四态自洽（应 ' + expect + '，实 ' + r.verdict
    + '；b/d/a = ' + r.blocked + '/' + r.degraded + '/' + r.absent + '）');
  a(r.ok === (r.blocked === 0 && r.degraded === 0 && r.absent === 0),
    'C2b: ok 只在三门槛全 pass 时为真（无 blocked / degraded / absent，实 ' + r.ok + '）');
  a(r.passed + r.blocked + r.degraded + r.absent === 3, 'C2c: 四态计数相加等于门槛数 3（实 '
    + (r.passed + r.blocked + r.degraded + r.absent) + '）');
  // C3 【口径③】缺件如实报 absent，不假称通过
  const savedRender = WA.render;
  let rAbs = null;
  try {
    WA.render = undefined;                        // 运行时抽掉门槛②的读口（不改源码、不落盘）
    rAbs = hp.threeGates();
  } finally { WA.render = savedRender; }
  const gvAbs = gateOf(rAbs, 'visibility');
  a(gvAbs.state === 'absent', 'C3: 读口缺席 ⇒ 门槛②如实报 absent（实 ' + gvAbs.state + '）');
  a(gvAbs.fix === null, 'C3b: absent 时不给动作（fix 为 null，不编假按钮）');
  a(rAbs.verdict === 'unknown' && rAbs.ok === false,
    'C3c: 有 absent ⇒ verdict unknown 且 ok false（实 ' + rAbs.verdict + '/' + rAbs.ok + '）—— 缺件不得当通过');
  a(String(gvAbs.why || '').length > 0, 'C3d: absent 时 why 说清哪块没装上（实「' + gvAbs.why + '」）');
  // C3e 恢复后读数回到原样（运行时不改真源，抽掉的只是探针当下的读口）
  const rBack = hp.threeGates();
  a(gateOf(rBack, 'visibility').state !== 'absent' && rBack.verdict === r.verdict,
    'C3e: 读口恢复后读数回原样（' + rBack.verdict + '）');
  // C4 【口径④】degraded 时 nextAction 必须指名道姓（不是「有门槛只过了一部分」这类空话）
  if (r.degraded > 0) {
    const deg = (r.gates || []).filter(function (g) { return g.state === 'degraded'; })[0];
    a(r.nextAction.indexOf(deg.label) >= 0,
      'C4: partial 时 nextAction 指名是哪道门槛（实「' + r.nextAction + '」）');
    a(deg.fix !== null, 'C4b: degraded 的门槛必须给得出动作（实 ' + (deg.fix ? deg.fix.do : 'null') + '）');
  } else {
    a(false, 'C4 前提失效：现场没有 degraded 门槛（verdict 实 ' + r.verdict + '）—— 判据要改靶标，不许静默跳过');
  }
  // C5 lastReason 随情形变化（不是写死一句）
  const line1 = hp.threeGatesLine();
  a(typeof line1 === 'string', 'C5: threeGatesLine 稳定可读');
}

// ═══ D 面：消费方（玩家可达 + 诊断可见）═════════════════════════════
function runD(a) {
  const env = fresh();
  const WA = env.WA;
  const col = WA.toolDiag.collect();
  const h = col.health;
  a(!!h, 'D1: 诊断面有 health 节（实 ' + (typeof h) + '）');
  a(!!h && h.verdict === WA.healthPreflight.threeGates().verdict,
    'D1b: health 节 verdict 与引擎直读一致（' + (h && h.verdict) + '）');
  a(!!h && typeof h.sourcePassing === 'number' && typeof h.sourceTotal === 'number',
    'D1c: health 节带「源全通 N/M」两个真数（' + (h && h.sourcePassing) + '/' + (h && h.sourceTotal) + '）');
  a(!!h && (h.gates || []).length === 3, 'D1d: health 节带三条门槛（实 ' + ((h && h.gates) || []).length + '）');
  const badG = ((h && h.gates) || []).filter(function (g) { return !g.id || !g.state; });
  a(badG.length === 0, 'D1e: 逐条门槛都有 id 与 state（缺 ' + badG.length + '）');
  a(!!h && typeof h.line === 'string' && h.line.length > 0, 'D1f: health 节带整句 line（面板与诊断同一份措辞）');
  a(!!h && typeof h.note === 'string' && h.note.length > 0,
    'D1g: health 节 reserves 人话 note（partial 时不折成「健康」，实「' + (h && h.note) + '」）');
  // D2 诊断节的 note 与 verdict 一致（不许 partial 却写「一切正常」）
  a(!!h && (h.verdict === 'partial' ? h.note.indexOf('一部分') >= 0 : true),
    'D2: partial 时 note 明说「只过了一部分」');
  // D3 面板体检块：通过时不占屏（running ⇒ 整块不出现）
  const P = rd(PANEL);
  a(cnt(P, "if (!r || r.verdict === 'running') return '';") === 1,
    'D3: 面板在 running 时不渲染体检块（没毛病就不打扰，实 ' + cnt(P, "if (!r || r.verdict === 'running') return '';") + '）');
  // D3b 引擎缺席时的措辞：用带 id 的完整串当锚点（"体检读数不可用" 在注释里也出现，
  //   裸串会把注释算成一次渲染出口 ⇒ 判据自己就会被注释骗过）
  a(cnt(P, '>体检读数不可用（engines/health-preflight.js 缺席）<') === 1,
    'D3b: 引擎缺席时面板明说「读数不可用」（不渲染成「都通」，实 '
    + cnt(P, '>体检读数不可用（engines/health-preflight.js 缺席）<') + '）');
  // D4 诊断的模块映射表已登记（漏登记 ⇒ 诊断包里看不见这个引擎）
  const D = rd(DIAG);
  a(cnt(D, "'engines/health-preflight.js': 'healthPreflight'") === 1,
    'D4: health-preflight 在诊断模块映射表里（漏登记 = 诊断少报一个黑盒）');
}

// ═══ N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据 ═════════════
function runNegative(a) {
  const H = rd(HP);
  // N1 破坏①：可见性判据退回首版（`on>0 ⇒ pass`）⇒ 「6/107 通」被折成「都通」
  //   判据：正版 state 与破坏版 state 必须**不同**，且破坏版必须是 pass。
  //   ⚠ 这条判据自带上限：若哪天真把 107 源全通了，正版也会是 pass ⇒ 两版相同 ⇒ 本条红，
  //     提醒改靶标（绝不静默跳过 —— 静默跳过就是「负控制没跑还报绿」）。
  {
    must1(H, A_RATIO, 'N1');
    const broken = H.replace(A_RATIO, A_RATIO_BAD);
    a(broken !== H, 'N1a: 破坏副本真改了字节（判据退回 on>0 ⇒ pass）');
    const r0 = fresh().WA.healthPreflight.threeGates();
    const r1 = fresh({ 'engines/health-preflight.js': broken }).WA.healthPreflight.threeGates();
    const g0 = gateOf(r0, 'visibility'), g1 = gateOf(r1, 'visibility');
    a(g1.state === 'pass', 'N1b: 首版判据下部分通也报 pass（实 ' + g1.state + '，源 '
      + g1.nums.on + '/' + g1.nums.sources + '）');
    a(g1.state !== g0.state, 'N1c: 破坏后状态与正版不同（正 ' + g0.state + ' / 破 ' + g1.state
      + '）—— 相同说明现场已全通，本负控制失效，须改靶标');
  }
  // N2 破坏②：摘掉 degraded ⇒ partial ⇒ 只过一半也报 running
  {
    must1(H, A_DEG, 'N2');
    const broken = H.replace(A_DEG, A_DEG_OFF);
    a(broken !== H, 'N2a: 破坏副本真改了字节（degraded 不再折成 partial）');
    const r0 = fresh().WA.healthPreflight.threeGates();
    a(r0.degraded > 0, 'N2 前提：现场有 degraded 门槛（实 ' + r0.degraded + '）—— 没有就测不出这条');
    const r1 = fresh({ 'engines/health-preflight.js': broken }).WA.healthPreflight.threeGates();
    a(r0.verdict === 'partial', 'N2b: 正版 partial（实 ' + r0.verdict + '）');
    a(r1.verdict === 'running', 'N2c: 摘掉 degraded 分支后同款判据必现形（实 ' + r1.verdict
      + '）—— 这正是「有门槛只过一半却报都通」');
  }
  // N3 破坏③：absent 不再 ⇒ unknown（口径③：缺件当通过）
  {
    must1(H, A_ABS, 'N3');
    const broken = H.replace(A_ABS, A_ABS_OFF);
    a(broken !== H, 'N3a: 破坏副本真改了字节（absent 折成 running）');
    function probe(ov) {
      const W = fresh(ov).WA;
      const saved = W.render;
      let r = null;
      try { W.render = undefined; r = W.healthPreflight.threeGates(); } finally { W.render = saved; }
      return r;
    }
    const r0 = probe();
    a(r0.verdict === 'unknown', 'N3b: 正版缺读口时报 unknown（实 ' + r0.verdict + '）');
    const r1 = probe({ 'engines/health-preflight.js': broken });
    a(r1.verdict === 'running', 'N3c: 破坏后同款判据必现形（实 ' + r1.verdict + '）—— 缺件被当成通过');
  }
  // N4 破坏④：先修哪条只认 blocked ⇒ partial 时给不出动作（玩家读到「先修上面那条」却不知修哪条）
  {
    must1(H, A_FIRST, 'N4');
    const broken = H.replace(A_FIRST, 'const first = blocked[0] || null;');
    a(broken !== H, 'N4a: 破坏副本真改了字节（first 不再含 degraded）');
    const r0 = fresh().WA.healthPreflight.threeGates();
    const r1 = fresh({ 'engines/health-preflight.js': broken }).WA.healthPreflight.threeGates();
    const gd = (r0.gates || []).filter(function (g) { return g.state === 'degraded'; })[0];
    a(!!gd && r0.nextAction.indexOf(gd.label) >= 0,
      'N4b: 正版 partial 时 nextAction 指名门槛（实「' + r0.nextAction + '」）');
    a(r1.nextAction.indexOf(gd ? gd.label : '\u0000') < 0,
      'N4c: 破坏后 nextAction 不再指名门槛（实「' + r1.nextAction + '」）—— 动作丢失');
  }
  // N5 纯度：全部负控制跑完后原文件逐字未变（含本锁自身）
  {
    const self = rd(SELF_REL);
    a(self.indexOf('runNegative') > 0, 'N5: 本锁自身可读且含 runNegative（纯度前提）');
    const H2 = rd(HP);
    a(cnt(H2, A_RATIO) === 1 && cnt(H2, A_DEG) === 1 && cnt(H2, A_ABS) === 1 && cnt(H2, A_FIRST) === 1,
      'N5b: 四个锚点在原文件里各恰中 1 次（负控制全跑在内存副本上，零文件改写）');
    a(cnt(H2, A_RATIO_BAD) === 0, 'N5c: 首版那条错判据没有留在产品里（实 ' + cnt(H2, A_RATIO_BAD) + ' 处）');
  }
}

async function runAll(assert) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) pass++; else { fail++; assert(false, msg); } };
  const title = function (s) { console.log('\n\u25a0 ' + s); };
  title('A 结构面：四锚点 / 导出面 / 现场读口 / 零写入口 / 消费方接线');
  runA(a);
  title('B 运行时：三门槛读数 / 形态合法 / 六通自洽 / 只读');
  runB(a);
  title('C 归因：字段真读到 / 四态自洽 / 缺件不假称通过');
  runC(a);
  title('D 消费方：诊断节 / 面板体检块 / 通过不占屏');
  runD(a);
  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  runNegative(a);
  console.log('\nthree-gates-v2259: ' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) throw new Error('three-gates-v2259 有 ' + fail + ' 项失败');
}
module.exports = { runAll: runAll };
if (require.main === module) {
  const assert = function (c, m) { if (!c) throw new Error(m); };
  runAll(assert).then(function () { process.exit(0); }).catch(function (e) { console.log('FAIL: ' + e.message); process.exit(1); });
}