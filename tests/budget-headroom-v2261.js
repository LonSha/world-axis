'use strict';
/**
 * v2.261.0（V6 · OPV6-6）专锁：**预算余量可见与档位建议**
 *
 * ── 这一版治的是什么（现场立据见 tools/v6probes/p_budget2.js）────────────────
 * 实测长局用到 2400 的 43%，余量 1368t 在三处消费面**全部不可见**：
 *   ① `summaryText` 只有 `注入 500/2400t`——「还剩多少」要读者自己做减法；
 *   ② 诊断包 `budget` 段只有 `used` / `cap` 两个裸数，答不出「算不算饱和」；
 *   ③ 面板「注入预算裁决」段同形。于是「预算不够」永远是玩家的第一直觉，
 *      而真实结论是「额度用了不到一半，机制没开够」。
 * 另一处同源假绿：`-1 自动` 与「从未配置」都报 `source:'default'`
 *   （`autoBudget()` 量不到上下文窗口时返回的就是它），两种**不同的原因共用一个读数**——
 *   玩家按 `-1` 的语义以为额度随上下文长，实际恒 2400，界面上无处告诉他。
 *
 * ── 本版交付 ───────────────────────────────────────────────────────────────
 *  `engines/inject-budget.js`
 *    · `resolveBudget()` 补 `mode`（auto / auto-noctx / manual / off）与 `requested`；
 *      `source` / `contextSize` 语义逐字不变（既有消费方零改动）。
 *    · `plan()` 补 `budgetMode` 与 `headroom`（remain / usedPct / freePct / saturated /
 *      avgKeptTokens / spareSources / note）—— 纯观测，不改变任何裁决结果。
 *    · `summaryText()` 补余量句与超支句（两句互斥）。
 *    · 新增导出 `budgetView()` —— 三个真消费方吃**同一判据**的唯一口。
 *  `render/inject.js` 落盘快照补 `budgetMode` / `headroom`。
 *  `engines/tool-diag.js` 诊断包补 `headroom` / `mode` / `modeText` / `advice` / `headroomText`。
 *  `ui/panel.js` 预算段补余量行 / 档位说明 / 饱和警告 / 建议 / 现算提示。
 *  `engines/backstage.js` 新增只读口 `budgetHeadroom()`（stored / resolved / last / advice）。
 *
 * ── 负控制（N1~N5）：每一条都是「真源码破坏 → 装破坏副本 → 重跑同款判据」──
 *  N1 破坏 `mode` 分支 ⇒ `-1` 与「未配置」又合回一个读数（假绿③复活）。
 *  N2 破坏 `saturated` 判据（只看 used >= cap）⇒「余量剩 12t」被报成「还有余量」。
 *  N3 破坏 `plan().headroom` ⇒ 余量退化成三个消费方各自做减法。
 *  N4 破坏 `summaryText` 的余量句 ⇒ 余量在读面上消失。
 *  N5 破坏 `budgetView` 的 `derived` 标记 ⇒ 事后现算的余量与裁决当时所记同形。
 *  N6 破坏 `backstage.budgetHeadroom` 的 `last` 分支 ⇒ 未注入过时拿 resolved 冒充「用过」。
 *  锚点字面量一律用变量持有（H5 判据纯度：锚点串在判据区只声明一次）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const BASE = ROOT;
require(path.join(BASE, 'tests/mock.js'));

let pass = 0, fail = 0;
const fails = [];
let __extAssert = null;
function assert(ok, msg) {
  if (__extAssert) {
    // 挂载态（runLock）：把结果交给 run.js 的总账，本锁只维护自己的计数
    __extAssert(ok, msg);
    if (ok) { pass++; } else { fail++; fails.push(msg); }
    return;
  }
  if (ok) { pass++; return; }
  fail++; fails.push(msg);
  console.log('  ✗ ' + msg);
}
function eq(a, b, msg) { assert(a === b, msg + '（实得 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'); }
function section(t) { console.log('\n── ' + t + ' ──'); }

// ── mock 基础面快照：每次 boot 重建 WA 时必须保留这些基础函数 ──
//   为什么必要：mock.js 把 WA.log 等基础设施挂在 WA 上，而 boot() 要重建 WA
//   来隔离各段状态。若直接 WA = {}，WA.log 就没了 —— 注入链路第一句就抛
//   WA.log is not a function，整段端到端静默跳过（这就是一处**假绿**：
//   锁照样全绿，但端到端那一段根本没跑）。
const MOCK_WA_BASE = Object.assign({}, global.WorldAxis);

// ── 装载骨架（与 tests/run.js 同源 LOAD 清单）──
function boot() {
  global.WA = global.WorldAxis = Object.assign({}, MOCK_WA_BASE);
  const ctx = vm.createContext(global);
  const src = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const li = src.indexOf('const LOAD = ['), lj = src.indexOf('];', li);
  const LOAD = vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
  for (const rel of LOAD) {
    try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) { /* 单模块失败不阻断骨架 */ }
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}

// ── 内存副本破坏器：绝不动真源码（N5 判据）──
function loadBudgetFromSource(srcText, tag) {
  const WA = global.WorldAxis;
  const old = WA.injectBudget;
  const ctx = vm.createContext(global);
  vm.runInContext(srcText, ctx, { filename: 'inject-budget[' + tag + '].js' });
  return WA.injectBudget;
}

const IB_SRC_PATH = path.join(BASE, 'engines/inject-budget.js');
const IB_SRC = fs.readFileSync(IB_SRC_PATH, 'utf8');

// 锚点：字面量在此声明一次，判据区只引用变量（H5）
const A_MODE = "mode: (a.source === 'auto') ? 'auto' : 'auto-noctx', requested: req }";
const A_SAT = 'saturated: used >= budget || remainRaw < MIN_KEEP_TOKENS,';
const A_HEADROOM = '      headroom: {';
const A_GAP = "      ? '｜余量 ' + hr.remain + 't(' + hr.freePct + '%)'";
const A_DERIVED = '    const derived = !hr;';
const A_BACKLAST = "        const b = (li && li.budget) ? li.budget : null;";

function runCore() {
let WA = boot();
let IB = WA.injectBudget;

// ═══════════════════════════════════════════════════════════════════════════
section('A. 源码面：六处改动各恰 1 处（防重复打补丁）');
assert((IB_SRC.match(new RegExp("mode: \\(a\\.source === 'auto'\\) \\? 'auto' : 'auto-noctx'", 'g')) || []).length === 1, 'A1 resolveBudget 的 mode 分支恰 1 处');
assert((IB_SRC.match(/mode: \(n === 0 \? 'off' : 'manual'\)/g) || []).length === 1, 'A2 resolveBudget 的 off 分支恰 1 处');
assert((IB_SRC.match(/budgetMode: rb\.mode \|\|/g) || []).length === 1, 'A3 plan 的 budgetMode 恰 1 处');
assert((IB_SRC.match(/headroom: \{/g) || []).length === 1, 'A4 plan 的 headroom 恰 1 处');
assert((IB_SRC.match(/function budgetView\(p\) \{/g) || []).length === 1, 'A5 budgetView 定义恰 1 处');
assert((IB_SRC.match(/\n    budgetView,\n/g) || []).length === 1, 'A6 budgetView 在导出面恰 1 处');
assert(/const derived = !hr;/.test(IB_SRC), 'A7 derived 标记在位');

const INJ_SRC = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
assert((INJ_SRC.match(/budgetMode: planInfo\.budgetMode/g) || []).length === 1, 'A8 快照写入 budgetMode 恰 1 处');
assert((INJ_SRC.match(/headroom: planInfo\.headroom \?/g) || []).length === 1, 'A9 快照写入 headroom 恰 1 处');

const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
assert((DIAG_SRC.match(/WA\.injectBudget\.budgetView\(b\)/g) || []).length === 1, 'A10 诊断包调 budgetView 恰 1 处');
assert(/out\.budget\.headroom = \{/.test(DIAG_SRC), 'A11 诊断包落 headroom 字段');
assert(/out\.budget\.advice = bv\.advice;/.test(DIAG_SRC), 'A12 诊断包落 advice 字段');

const PANEL_SRC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
const rp = (function () {
  const s = PANEL_SRC.indexOf('function renderInject()');
  const e = PANEL_SRC.indexOf('function renderInjectValue', s);
  return PANEL_SRC.slice(s, e > 0 ? e : s + 20000);
})();
assert(/budgetView\(b\)/.test(rp), 'A13 面板预算段调 budgetView');
assert(/余量<\/span>/.test(rp), 'A14 面板有「余量」行');
assert(/bh\.modeText/.test(rp), 'A15 面板显示档位说明');
assert(/bh\.advice/.test(rp), 'A16 面板显示建议');
assert(/余量按快照现算/.test(rp), 'A17 面板显示现算提示');

const BACK_SRC = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
assert((BACK_SRC.match(/budgetHeadroom\(\) \{/g) || []).length === 1, 'A18 backstage.budgetHeadroom 定义恰 1 处');
assert(/out\.stored = \(st && typeof st\.injectBudget === 'number'\)/.test(BACK_SRC), 'A19 backstage 回显落盘值');
assert(/不拿 `resolved` 冒充「用过」/.test(BACK_SRC), 'A20 backstage 承诺未注入即 null');

// ═══════════════════════════════════════════════════════════════════════════
section('B. resolveBudget 档位口径：`-1` 与「未配置」必须分得开');

// 干净起点：清掉上下文窗口
WA.store.transact(function (d) { d.meta = d.meta || {}; d.meta.contextSize = null; });

const rUndef = IB.resolveBudget();
const rNull = IB.resolveBudget(null);
const rMinus = IB.resolveBudget(-1);
const rZero = IB.resolveBudget(0);
const rManual = IB.resolveBudget(2400);

eq(rUndef.mode, 'auto-noctx', 'B1 未给值 → auto-noctx');
eq(rNull.mode, 'auto-noctx', 'B2 null → auto-noctx');
eq(rMinus.mode, 'auto-noctx', 'B3 -1 在无上下文时 → auto-noctx');
eq(rZero.mode, 'off', 'B4 0 → off（不限）');
eq(rManual.mode, 'manual', 'B5 正数 → manual');

// 核心：两者 source 相同，但 requested 不同 —— 这才是分得开的**唯一**依据
eq(rUndef.source, rMinus.source, 'B6 前者 source 与 -1 相同（故光看 source 分不开，这是修前的现场）');
assert(rUndef.requested === null, 'B7 未给值 requested = null');
eq(rMinus.requested, -1, 'B8 -1 的 requested = -1（与未配置区分开）');

// 语义不变：既有消费方零改动
eq(rZero.source, 'manual', 'B9 0 仍报 manual（既有语义不变）');
eq(rZero.budget, 0, 'B10 0 的 budget 仍是 0');
eq(rManual.source, 'manual', 'B11 正数仍报 manual');
eq(rManual.budget, 2400, 'B12 正数透传');
eq(rManual.contextSize, null, 'B13 手动档 contextSize 仍是 null');
eq(rUndef.budget, IB.DEFAULT_BUDGET, 'B14 无上下文时回 DEFAULT_BUDGET（语义不变）');

// 有上下文后自动档真跑起来
WA.store.transact(function (d) { d.meta = d.meta || {}; d.meta.contextSize = 30000; });
const rAuto = IB.resolveBudget(-1);
eq(rAuto.mode, 'auto', 'B15 有上下文 → mode=auto');
eq(rAuto.source, 'auto', 'B16 有上下文 → source=auto（既有语义不变）');
eq(rAuto.budget, 1800, 'B17 30K×6% = 1800t');
eq(rAuto.contextSize, 30000, 'B18 contextSize 透出');
eq(rAuto.requested, -1, 'B19 requested 仍是 -1');
WA.store.transact(function (d) { d.meta = d.meta || {}; d.meta.contextSize = null; });

// ═══════════════════════════════════════════════════════════════════════════
section('C. plan().headroom：未饱和时必须报得出余量');

function mkItems() {
  const a = [];
  for (let i = 0; i < 5; i++) a.push({ source: 'probe' + i, content: 'x'.repeat(400), tokens: 100 + i * 10 });
  return a;
}
const pLoose = IB.plan(mkItems(), { budget: 2400 });
assert(!!pLoose.headroom && typeof pLoose.headroom === 'object', 'C1 headroom 存在');
eq(pLoose.headroom.remain, 1900, 'C2 余量 1900t（500 用了，2400 额度）');
eq(pLoose.used, 500, 'C3 used=500（输入 token 由 tokens 字段给出）');
eq(pLoose.headroom.freePct, 79.2, 'C4 余量占比 79.2%');
eq(pLoose.headroom.usedPct, 20.8, 'C5 用量占比 20.8%');
eq(pLoose.headroom.saturated, false, 'C6 未饱和');
eq(pLoose.budgetMode, 'manual', 'C7 budgetMode 随计划带出');
eq(pLoose.remain, pLoose.headroom.remain, 'C8 plan.remain 与 headroom.remain 同值（不各算一套）');

// 「可再开几个源」按已落地源平均体量估
eq(pLoose.headroom.avgKeptTokens, 100, 'C9 平均体量 100t/源（取整数部分）');
eq(pLoose.headroom.spareSources, 19, 'C10 可再开 19 个源（1900 / 100）');
assert(/可再开 19 个源/.test(pLoose.headroom.note), 'C11 note 报出可再开数');
assert(/不是承诺/.test(pLoose.headroom.note), 'C12 note 明确「估算不是承诺」');

// 口径：usedPct + freePct 互补
eq(Math.round((pLoose.headroom.usedPct + pLoose.headroom.freePct) * 10) / 10, 100, 'C13 两个占比互补成 100%');

// ═══════════════════════════════════════════════════════════════════════════
section('D. 饱和判据：余量小到放不下最小可保项也算饱和');

const pTight = IB.plan(mkItems(), { budget: 200 });
eq(pTight.headroom.remain, 0, 'D1 塞满后余量 0');
eq(pTight.headroom.saturated, true, 'D2 塞满 → saturated');
assert(pTight.used > 0 && pTight.overBudget === false, 'D3 恰好用满不算超支');

// 「剩一点但已无意义」：budget 略大于 used，余量 < MIN_KEEP_TOKENS
const minKeep = IB.MIN_KEEP_TOKENS;
const pTiny = IB.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 100 + minKeep - 1 });
eq(pTiny.headroom.remain, minKeep - 1, 'D4 余量恰为 MIN_KEEP_TOKENS-1');
eq(pTiny.headroom.saturated, true, 'D5 余量 < MIN_KEEP_TOKENS ⇒ 仍算饱和（不能报「还有余量」）');
assert(pTiny.overBudget === false, 'D6 它确实没超支（故饱和不能只看 overBudget）');

// 对照：余量刚好等于 MIN_KEEP_TOKENS ⇒ 不饱和
const pEdge = IB.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 100 + minKeep });
eq(pEdge.headroom.saturated, false, 'D7 余量恰等于 MIN_KEEP_TOKENS ⇒ 不饱和（边界不含）');

// ═══════════════════════════════════════════════════════════════════════════
section('E. summaryText：余量句与超支句互斥');

const tLoose = IB.summaryText(pLoose);
assert(/注入 500\/2400t/.test(tLoose), 'E1 原有「注入 used/cap」仍在');
assert(/余量 1900t\(79\.2%\)/.test(tLoose), 'E2 余量句（含占比）');
assert(/可再开 19 源/.test(tLoose), 'E3 可再开几个源');
assert(!/超支/.test(tLoose), 'E4 未超支时不出超支句');

const tTight = IB.summaryText(pTight);
assert(!/余量/.test(tTight), 'E5 余量为 0 时不出余量句');
assert(!/超支/.test(tTight), 'E6 恰好用满不出超支句');

const tOver = IB.summaryText({ used: 300, budget: 200, overBudget: true, headroom: { remain: 0, freePct: 0, spareSources: 0 }, folded: [], dropped: [], saved: 0, cost: null });
assert(/超支 100t/.test(tOver), 'E7 超支时报超出量');
assert(/pinned 保底项不可裁/.test(tOver), 'E8 超支句说明原因');
assert(!/余量/.test(tOver), 'E9 超支时不出余量句（两句互斥）');

// 零用量不出余量句（不制造噪音）
const tZero = IB.summaryText({ used: 0, budget: 2400, overBudget: false, headroom: { remain: 2400, freePct: 100, spareSources: 0 }, folded: [], dropped: [], saved: 0, cost: null });
assert(!/余量/.test(tZero), 'E10 一分没用时不出余量句（避免噪音）');

// ═══════════════════════════════════════════════════════════════════════════
section('F. budgetView：判据唯一口（三消费方吃同一份）');

const bvPlan = IB.budgetView(pLoose);
assert(!!bvPlan, 'F1 plan 形态可取');
eq(bvPlan.remain, 1900, 'F2 余量透传');
eq(bvPlan.derived, false, 'F3 plan 形态 derived=false（裁决当时就记下了）');
assert(/用了 500\/2400t（20\.8%）/.test(bvPlan.text), 'F4 结论句含用量与占比');
assert(/余量 1900t/.test(bvPlan.text), 'F5 结论句含余量');
assert(/可再开 19 个源/.test(bvPlan.text), 'F6 结论句含可再开数');
assert(!/现算/.test(bvPlan.text), 'F7 derived=false 时不带现算提示');

const bvSnap = IB.budgetView({ used: 500, cap: 2400, source: 'manual', remain: 1900, overBudget: false, headroom: pLoose.headroom });
eq(bvSnap.derived, false, 'F8 快照带 headroom ⇒ derived=false');
eq(bvSnap.remain, 1900, 'F9 快照形态余量同值');

const bvOld = IB.budgetView({ used: 500, cap: 2400, source: 'default', remain: 1900, overBudget: false });
eq(bvOld.derived, true, 'F10 旧快照无 headroom ⇒ derived=true（如实说明是事后现算）');
assert(/余量按快照现算/.test(bvOld.text), 'F11 结论句标注现算');
eq(bvOld.remain, 1900, 'F12 现算余量正确（2400-500）');

// modeText 人话：三态必须分得开
const bvAutoNoctx = IB.budgetView({ budget: 2400, used: 0, budgetMode: 'auto-noctx', requested: -1, source: 'default' });
assert(/设为自动档（-1）/.test(bvAutoNoctx.modeText), 'F13 设了 -1 但量不到窗口 ⇒ 如实说出来');
assert(/不会随上下文增长/.test(bvAutoNoctx.modeText), 'F14 说清后果');
const bvUndef = IB.budgetView({ budget: 2400, used: 0, budgetMode: 'auto-noctx', requested: null, source: 'default' });
assert(/未显式配置/.test(bvUndef.modeText), 'F15 未配置与 -1 分得开（人话层）');
assert(bvUndef.modeText !== bvAutoNoctx.modeText, 'F16 两句文案不同（这是本项的核心区分）');
const bvAuto = IB.budgetView({ budget: 1800, used: 0, budgetMode: 'auto', requested: -1, contextSize: 30000, source: 'auto' });
assert(/按上下文 30000 的 6%/.test(bvAuto.modeText), 'F17 真自动档报出上下文与比例');
const bvOff = IB.budgetView({ budget: 0, used: 0, budgetMode: 'off', source: 'manual' });
assert(/不设上限/.test(bvOff.modeText), 'F18 0 档说成「不设上限」');

// advice：只在闲置过半时提
assert(!!bvPlan.advice, 'F19 闲置 79% ⇒ 给建议');
assert(/70\.5%|79\.2%/.test(bvPlan.advice), 'F20 建议含闲置占比');
assert(/也可以不动/.test(bvPlan.advice), 'F21 建议明确「不动也没事」（不制造焦虑）');
const bvBusy = IB.budgetView({ used: 2200, cap: 2400, overBudget: false, headroom: { remain: 200, freePct: 8.3, spareSources: 0 } });
assert(!bvBusy.advice, 'F22 闲置不足一半 ⇒ 不提建议');

// 边界：0 预算、空入参
eq(IB.budgetView(null), null, 'F23 空入参 → null（不合成读数）');
const bvZero = IB.budgetView({ used: 0, cap: 0 });
assert(!!bvZero, 'F24 0 预算仍给读数');
assert(/一分没用/.test(bvZero.text), 'F25 0 预算的结论句如实');
eq(bvZero.saturated, true, 'F26 0 预算算饱和（余量 0 < MIN_KEEP_TOKENS）');

// ═══════════════════════════════════════════════════════════════════════════
section('G. 端到端：三个消费方吃同一判据');

WA = boot();
IB = WA.injectBudget;
try { WA.store.init(); } catch (e) {}
WA.backstage.setSettings({ injectBudget: 2400 });
try {
  WA.render.applyInjections({ injections: [
    { source: '测试源A', content: '甲'.repeat(120) },
    { source: '测试源B', content: '乙'.repeat(120) }
  ] });
} catch (e) { console.log('  注入异常（探针容错）: ' + e.message); }

const snapB = (WA.store.get().lastInjection || {}).budget || null;
assert(!!snapB, 'G1 落盘快照有 budget');
assert(typeof snapB.budgetMode === 'string', 'G2 快照带 budgetMode');
assert(!!snapB.headroom && typeof snapB.headroom.remain === 'number', 'G3 快照带 headroom.remain');
eq(snapB.budgetMode, 'manual', 'G4 快照档位口径正确');
assert(snapB.headroom.freePct > 0, 'G5 快照余量占比 > 0');

// 三个消费方取值一致（这是「唯一判据」的自证）
const fromSnap = IB.budgetView(snapB);
const back = WA.backstage.budgetHeadroom();
assert(!!back.last, 'G6 backstage.last 有读数');
eq(back.last.remain, fromSnap.remain, 'G7 backstage 与 budgetView 余量一致');
eq(back.last.spareSources, fromSnap.spareSources, 'G8 可再开数一致');
eq(back.last.advice, fromSnap.advice, 'G9 建议一致');
eq(back.stored, 2400, 'G10 backstage 回显落盘值');
eq(back.resolved.mode, 'manual', 'G11 backstage 现算档位');
eq(back.last.derived, false, 'G12 快照带 headroom ⇒ 不是现算');

// 诊断包
try {
  const diag = WA.toolDiag.collect({ sections: ['inject'] });
  const b = (((diag || {}).sections || {})['inject'] || (diag || {})['inject'] || {}).budget || null;
  assert(!!b, 'G13 诊断包有 budget 段');
  assert(!!b.headroom, 'G14 诊断包有 headroom');
  eq(b.headroom.remain, snapB.headroom.remain, 'G15 诊断包余量与快照一致');
  eq(b.mode, 'manual', 'G16 诊断包档位');
  assert(!!b.modeText, 'G17 诊断包有档位说明');
  assert(!!b.headroomText, 'G18 诊断包有结论句');
  assert(/余量/.test(String(b.summary || '')), 'G19 诊断包 summary 含余量');
} catch (e) {
  assert(false, 'G19.x 诊断包采集异常：' + e.message);
}

// ═══════════════════════════════════════════════════════════════════════════
section('H. 未注入过：backstage.last 必须是 null（不拿 resolved 冒充「用过」）');

WA = boot();
IB = WA.injectBudget;
try { WA.store.init(); } catch (e) {}
WA.backstage.setSettings({ injectBudget: 2400 });
try { WA.store.transact(function (d) { d.lastInjection = null; }); } catch (e) {}
const backClean = WA.backstage.budgetHeadroom();
eq(backClean.stored, 2400, 'H1 落盘值仍回显');
assert(!!backClean.resolved, 'H2 现算档位仍给（回答「按我的配置额度是多少」）');
eq(backClean.last, null, 'H3 没注入过 ⇒ last=null');
eq(backClean.advice, null, 'H4 没用量 ⇒ 无建议');

// ═══════════════════════════════════════════════════════════════════════════
section('I. 负控制 N1：破坏 mode 分支 ⇒ `-1` 与「未配置」又合回一个读数');

(function () {
  const broken = IB_SRC.replace(A_MODE, 'mode: \'auto-noctx\', requested: req }');
  assert(broken !== IB_SRC, 'N1.0 破坏确实发生（源码被改写）');
  WA = boot();
  const B = loadBudgetFromSource(broken, 'N1');
  eq(B.resolveBudget(-1).mode, B.resolveBudget().mode, 'N1.1 破坏后两者 mode 又相同（假绿③复活，判据当场抓出）');
  // 同款判据在正版上必须真
  WA = boot();
  const G = WA.injectBudget;
  assert(G.resolveBudget(-1).mode !== null || G.resolveBudget().mode !== null, 'N1.2 正版两口径都有值');
  eq(G.resolveBudget().requested, null, 'N1.3 正版未配置 requested=null');
  eq(G.resolveBudget(-1).requested, -1, 'N1.4 正版 -1 requested=-1');
})();

// ═══════════════════════════════════════════════════════════════════════════
section('J. 负控制 N2：破坏 saturated 判据 ⇒「余量剩 12t」被报成「还有余量」');

(function () {
  const broken = IB_SRC.replace(A_SAT, 'saturated: used >= budget,');
  assert(broken !== IB_SRC, 'N2.0 破坏确实发生');
  WA = boot();
  const B = loadBudgetFromSource(broken, 'N2');
  const mk = function (budget) { return B.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: budget }); };
  eq(mk(100 + B.MIN_KEEP_TOKENS - 1).headroom.saturated, false, 'N2.1 破坏后「余量不足最小可保项」被报成未饱和（假读数）');
  // 同款判据在正版上必须真
  WA = boot();
  const G = WA.injectBudget;
  eq(G.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 100 + G.MIN_KEEP_TOKENS - 1 }).headroom.saturated, true, 'N2.2 正版同类场景判为饱和');
})();

// ═══════════════════════════════════════════════════════════════════════════
section('K. 负控制 N3：破坏 plan().headroom ⇒ 余量退化成各消费方做减法');

(function () {
  const broken = IB_SRC.replace(A_HEADROOM, '      __gone: {');
  assert(broken !== IB_SRC, 'K0 破坏确实发生');
  WA = boot();
  const B = loadBudgetFromSource(broken, 'N3');
  const p = B.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 2400 });
  eq(p.headroom, undefined, 'K1 破坏后 plan 不再产出 headroom');
  eq(p.spareSources, undefined, 'K2 「可再开几个源」无从得出');
  // 同款判据在正版上必须真
  WA = boot();
  const G = WA.injectBudget;
  const gp = G.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 2400 });
  assert(!!gp.headroom && typeof gp.headroom.spareSources === 'number', 'K3 正版 headroom 与 spareSources 都在');
})();

// ═══════════════════════════════════════════════════════════════════════════
section('L. 负控制 N4：破坏 summaryText 余量句 ⇒ 余量在日志/诊断面消失');

(function () {
  const broken = IB_SRC.replace(A_GAP, "      ? ''");
  assert(broken !== IB_SRC, 'L0 破坏确实发生');
  WA = boot();
  const B = loadBudgetFromSource(broken, 'N4');
  const p = B.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 2400 });
  assert(!/余量/.test(B.summaryText(p)), 'L1 破坏后摘要里再无「余量」');
  // 同款判据在正版上必须真
  WA = boot();
  const G = WA.injectBudget;
  const gp = G.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 2400 });
  assert(/余量/.test(G.summaryText(gp)), 'L2 正版摘要含余量');
})();

// ═══════════════════════════════════════════════════════════════════════════
section('M. 负控制 N5：破坏 derived 标记 ⇒ 事后现算与裁决所记同形');

(function () {
  const broken = IB_SRC.replace(A_DERIVED, '    const derived = false;');
  assert(broken !== IB_SRC, 'M0 破坏确实发生');
  WA = boot();
  const B = loadBudgetFromSource(broken, 'N5');
  const bv = B.budgetView({ used: 500, cap: 2400, remain: 1900, overBudget: false });
  eq(bv.derived, false, 'M1 破坏后旧快照被标成「裁决当时所记」（假读数）');
  assert(!/现算/.test(bv.text), 'M2 也不再提示现算');
  // 同款判据在正版上必须真
  WA = boot();
  const G = WA.injectBudget;
  eq(G.budgetView({ used: 500, cap: 2400, remain: 1900, overBudget: false }).derived, true, 'M3 正版旧快照如实标 derived');
})();

// ═══════════════════════════════════════════════════════════════════════════
section('N. 负控制 N6：破坏 backstage.last 分支 ⇒ 未注入过时拿 resolved 冒充用量');

(function () {
  const BACK_BROKEN = BACK_SRC.replace(A_BACKLAST, "        const b = { used: 0, cap: 2400 };");
  assert(BACK_BROKEN !== BACK_SRC, 'N0.0 破坏确实发生');
  WA = boot();
  try { WA.store.init(); } catch (e) {}
  vm.runInContext(BACK_BROKEN, vm.createContext(global), { filename: 'backstage[N6].js' });
  WA.backstage.setSettings({ injectBudget: 2400 });
  try { WA.store.transact(function (d) { d.lastInjection = null; }); } catch (e) {}
  const bad = WA.backstage.budgetHeadroom();
  assert(bad.last !== null, 'N0.1 破坏后没注入过也报出了 last（合成读数）');
  // 同款判据在正版上必须真
  WA = boot();
  try { WA.store.init(); } catch (e) {}
  WA.backstage.setSettings({ injectBudget: 2400 });
  try { WA.store.transact(function (d) { d.lastInjection = null; }); } catch (e) {}
  eq(WA.backstage.budgetHeadroom().last, null, 'N0.2 正版没注入过就是 null');
})();

// ═══════════════════════════════════════════════════════════════════════════
section('O. 假绿记录：本版抓到的两处，必须留痕在锁里');

// 假绿①：`-1 自动` 与「未配置」共用一个 source 读数 —— 光看 source 永远判不出来
WA = boot();
const G2 = WA.injectBudget;
eq(G2.resolveBudget(-1).source, G2.resolveBudget().source, 'O1 光看 source 两口径完全同形（这就是修前的假绿）');
assert(G2.resolveBudget(-1).requested !== G2.resolveBudget().requested, 'O2 只有 requested 才分得开（故本版必须加它）');

// 假绿②：`overBudget` 不等于「饱和」—— 恰好用满与「余量无意义」是两件事
const pFull = G2.plan([{ source: 'a', content: 'x'.repeat(400), tokens: 100 }], { budget: 100 });
eq(pFull.overBudget, false, 'O3 恰好用满不报超支');
eq(pFull.headroom.saturated, true, 'O4 但它是饱和的（故不能用 overBudget 冒充 saturated）');

// 假绿③：面板与诊断若各自做减法，「算不算饱和」会得出两种结论 —— 本版收敛到一个口
const srcPanel = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
const srcDiag = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
assert(/budgetView/.test(srcPanel) && /budgetView/.test(srcDiag), 'O5 面板与诊断都走 budgetView（不各自现算）');
assert((srcPanel.match(/b\.cap - b\.used/g) || []).length === 0, 'O6 面板不再自己做「cap - used」（收敛完成）');

// ═══════════════════════════════════════════════════════════════════════════
}

function report() {
  console.log('\n═══ budget-headroom-v2261: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
  if (fail) { console.log('失败项：'); fails.forEach(function (f) { console.log('  · ' + f); }); }
}

async function runAll(assert) {
  __extAssert = assert || null;
  pass = 0; fail = 0; fails.length = 0;
  try {
    runCore();
  } catch (e) {
    // 正文抛错不得静默：如实记一条失败并把栈打出来（否则挂载方只看到「少了几十条」）
    assert(false, 'budget-headroom-v2261 正文抛错：' + ((e && e.stack) || e));
    fail++;
  } finally {
    __extAssert = null;
  }
  if (!assert) report();
  return { pass: pass, fail: fail };
}

if (require.main === module) {
  runAll(null).then(function (r) { process.exit(r.fail === 0 ? 0 : 1); }).catch(function (e) {
    console.error('FATAL: ' + ((e && e.stack) || e)); process.exit(1);
  });
}
module.exports = { runAll: runAll };