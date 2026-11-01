#!/usr/bin/env node
'use strict';
/**
 * tools/v7probes/p_playable_seed.js — OPV7-6 验收探针（开局即喂）。
 *
 * 【它验什么】不是「函数能调通」，而是五件事：
 *   A 结构：装载同序 / 导出面 6 口 / 零 store 直写 / 四个真写口各恰一次调用 /
 *          不造第二真源 / 三件齐做（诊断节 + 面板 + 守卫表）
 *   B 真值：装一份蓝图后四个结构位从零变有；每一行带 src；实词可追到蓝图原文
 *   C 幂等：第二遍 written=0、世界逐字未变；【含 bonds 出厂关着这一态】——
 *         这就是本版实测踩到的真缺陷（读口 disabled 被当成「没有」）
 *   D 不编事实：没有蓝图 ⇒ no-blueprint；取不到实词 ⇒ 不播；半填保护
 *   E 势力真源：world.factions 零读口死键已改为 evolution.factions（org.rosterView 读得到）
 *   N 负控制：三处真源码破坏 → 装载破坏副本 → 重跑同款判据 → 复原后再证
 *
 * 用法：node tools/v7probes/p_playable_seed.js
 * 末行固定打印「0 failed」，供 p_closeout 的 expect 判据咬住（防零断言静默通过）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..', '..');
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const LOAD = vm.runInNewContext('[' + runSrc.match(/const LOAD = \[([\s\S]*?)\];/)[1] + ']');
const SEED_REL = 'engines/playable-seed.js';
const BP_REL = 'engines/playable-blueprint.js';
const SEED_SRC = fs.readFileSync(path.join(BASE, SEED_REL), 'utf8');
const BP_SRC = fs.readFileSync(path.join(BASE, BP_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');

let pass = 0, fail = 0;
function A(c, msg) { if (c) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function EQ(a, b, msg) { A(a === b, msg + '（实 ' + JSON.stringify(a) + ' / 期望 ' + JSON.stringify(b) + '）'); }
function head(t) { console.log('\n=== ' + t + ' ==='); }
function cnt(s, n) { return String(s).split(n).length - 1; }
function cntCode(s, n) {
  return String(s).split('\n').filter(function (l) {
    return !/^\s*(\/\/|\*|\/\*)/.test(l) && l.indexOf(n) >= 0;
  }).length;
}

function loadAll(ov) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try {
    const ls = global.localStorage;
    if (ls && typeof ls.clear === 'function') ls.clear();
    else if (ls && ls.__store) ls.__store = {};
  } catch (e) {}
  const ctx = vm.createContext(global);
  for (const rel of LOAD) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}
function counts(WA) {
  const d = WA.store.get() || {};
  const people = d.people || {};
  let goals = 0, sched = 0;
  Object.keys(people).forEach(function (id) {
    const L = (people[id] || {}).life || {};
    goals += (L.goals || []).length;
    sched += (L.schedule || []).length;
  });
  return {
    people: Object.keys(people).length,
    places: ((d.world || {}).places || []).length,
    goals: goals, sched: sched,
    bonds: (((d.bonds || {}).rows) || []).length,
    worldFactions: (((d.world || {}).factions) || []).length,
    evoFactions: (((d.evolution || {}).factions) || []).length,
    rostered: ((((d.evolution || {}).factions) || []).reduce(function (a, f) {
      return a + Object.keys((f && f.roster) || {}).length;
    }, 0))
  };
}

// ═══ A 结构 ═══════════════════════════════════════════════════════════
head('A 结构：装载同序 / 六口 / 零直写 / 四个真写口 / 三件齐做');
A(IDX_SRC.indexOf("'engines/playable-seed.js'") >= 0, 'A1 已进 index.js LOAD_ORDER');
A(runSrc.indexOf("'engines/playable-seed.js'") >= 0, 'A1b 已进 tests/run.js LOAD');
{
  const iS = IDX_SRC.indexOf("'engines/playable-seed.js'");
  const iB = IDX_SRC.indexOf("'engines/playable-blueprint.js'");
  A(iB >= 0 && iS > iB && iS - iB < 400, 'A2 index.js 紧随 blueprint（间隔 ' + (iS - iB) + '）');
  const jS = runSrc.indexOf("'engines/playable-seed.js'");
  const jB = runSrc.indexOf("'engines/playable-blueprint.js'");
  A(jB >= 0 && jS > jB && jS - jB < 300, 'A2b run.js 同样紧随（间隔 ' + (jS - jB) + '）');
}
const WA = loadAll();
const EXP = ['getSettings', 'setSettings', 'preview', 'seed', 'view', 'stat'];
EQ(Object.keys(WA.playableSeed).sort().join(','), EXP.slice().sort().join(','), 'A3 导出面恰 6 项');
EQ(SEED_SRC.indexOf('store.transact'), -1, 'A4 零 store.transact');
EQ(SEED_SRC.indexOf('store.patch'), -1, 'A4b 零 store.patch');
EQ(SEED_SRC.indexOf('store.set'), -1, 'A4c 零 store.set');
['WA.life.addGoal', 'WA.life.addSchedule', 'WA.bonds.setBond', 'WA.org.assignRole'].forEach(function (p, i) {
  EQ(cntCode(SEED_SRC, p + '('), 1, 'A4d.' + (i + 1) + ' ' + p + ' 调用恰一处');
});
EQ(cntCode(SEED_SRC, 'world.factions'), 0, 'A5 代码行里零 world.factions（只有文件头注释提它）');
EQ(SEED_SRC.indexOf('draft.people'), -1, 'A5b 不自己造人物');
EQ(SEED_SRC.indexOf('evolution.factions ='), -1, 'A5c 不自己写 evolution.factions');
A(/enabled:\s*true/.test(SEED_SRC), 'A6 出厂默认 enabled:true（开局即喂）');
A(DIAG_SRC.indexOf('playableSeed: secPlayableSeed()') >= 0, 'A7 诊断节已接线');
A(DIAG_SRC.indexOf('WA.playableSeed') >= 0, 'A7b 诊断面真读');
A(PANEL_SRC.indexOf('WA.playableSeed') >= 0, 'A7c 面板真读');
EQ(cnt(DIAG_SRC, "'wa-seed-enabled', 'wa-seed-line', 'wa-seed-replay', 'wa-seed-view', 'wa-seed-out'"), 1, 'A7d 守卫表登记 5 个新控件（含开关）');
['wa-seed-enabled', 'wa-seed-line', 'wa-seed-replay', 'wa-seed-view', 'wa-seed-out'].forEach(function (id, i) {
  A(PANEL_SRC.indexOf('id="' + id + '"') >= 0, 'A7e.' + (i + 1) + ' 面板渲染 ' + id);
});
A(PANEL_SRC.indexOf("on('#wa-seed-replay'") >= 0, 'A7f 补播有绑定');
A(PANEL_SRC.indexOf("on('#wa-seed-view'") >= 0, 'A7g 读数有绑定');

// ═══ B 真值 ═══════════════════════════════════════════════════════════
head('B 真值：装完立刻有剧本（四个结构位从零变有）');
{
  const W = loadAll();
  const b0 = counts(W);
  EQ(b0.goals, 0, 'B1 装之前 life.goals = 0（立据：有演员、没剧本）');
  EQ(b0.sched, 0, 'B1b 装之前 life.schedule = 0');
  EQ(b0.bonds, 0, 'B1c 装之前 bonds.rows = 0');
  EQ(b0.rostered, 0, 'B1d 装之前名册 = 0');
  // 先只装世界、不播种：这才是「有演员、没剧本」的真现场。
  //   拿空世界当基线会误判——安装蓝图本来就该造人物，那不是播种造的。
  const r0 = W.playableBlueprint.installSample('town-workshop', { force: true, noSeed: true });
  A(r0.ok === true && r0.seeded === null, 'B1e noSeed:true 时安装成功且确实没播');
  const bA = counts(W);
  A(bA.people > 0, 'B1f 装上世界之后有 ' + bA.people + ' 个人（蓝图造人）');
  EQ(bA.goals, 0, 'B1g 但 goals 仍是 0 —— 演员齐了，剧本空白（正是 OPV7-6 要治的病）');
  const r = W.playableSeed.seed({});
  const b1 = counts(W);
  A(r.ok === true, 'B2 播种成功');
  EQ(r.written, 7, 'B2c 真写 7 行');
  console.log('    读数：people ' + b1.people + ' / places ' + b1.places
    + ' / goals ' + b1.goals + ' / sched ' + b1.sched + ' / bonds ' + b1.bonds
    + ' / evoFactions ' + b1.evoFactions + ' / rostered ' + b1.rostered);
  EQ(b1.people, bA.people, 'B3 播种不新增人物（不造第二真源）');
  EQ(b1.places, bA.places, 'B3c 也不新增地点');
  A(b1.goals > 0 && b1.sched > 0 && b1.bonds > 0 && b1.rostered > 0, 'B3b 四个结构位全部从零变有');
  // 每一行带 src
  const pv = W.playableSeed.preview({});
  EQ(pv.rows.filter(function (x) { return !x.src; }).length, 0, 'B4 每行都带 src 出处');
  // 实词可追
  const defs = W.playableBlueprint.getSample('town-workshop').sample.playDefs;
  const stage = defs.training.stages[defs.training.stages.length - 1];
  const g = pv.rows.filter(function (x) { return x.kind === 'goal'; })[0];
  A(g && g.text.indexOf(stage) >= 0, 'B5 目标句含蓝图阶段「' + stage + '」');
  A(g && g.text.indexOf(defs.training.method) >= 0, 'B5b 目标句含蓝图方法「' + defs.training.method + '」');
  const bd = pv.rows.filter(function (x) { return x.kind === 'bond'; })[0];
  EQ(bd.types[0], '平行共存', 'B6 关系型 = 平行共存（最弱语义承诺）');
  A(W.bonds.TYPES.indexOf('平行共存') >= 0, 'B6b 它是 bonds 的合法枚举');
}

// ═══ C 幂等（含 bonds 出厂关着这一态 —— 本版实测踩到的真缺陷）═══════════
head('C 幂等：第二遍必须 written=0，且世界逐字未变');
{
  const W = loadAll();
  W.playableBlueprint.installSample('town-workshop', { force: true });
  const snap = JSON.stringify(W.store.get());
  const r2 = W.playableSeed.seed({});
  EQ(r2.written, 0, 'C1 第二遍 written = 0');
  EQ(r2.skipped, r2.planned, 'C1b 全部跳过（' + r2.skipped + '/' + r2.planned + '）');
  EQ(r2.reasons.already, r2.planned, 'C1c 归因 already');
  EQ(JSON.stringify(W.store.get()), snap, 'C2 第二遍后世界逐字未变');
  // C3 bonds 出厂关着这一态单独钉一条：disabled 不是「没有」
  A(W.bonds.getSettings().enabled === false, 'C3 bonds 出厂 enabled:false（这正是踩到缺陷的那个态）');
  const rd = W.bonds.read('大师傅', '青年学徒');
  A(rd && rd.ok === true && rd.reason === 'disabled', 'C3b 读口在该态回 {ok:true, reason:disabled}（容易骗过「有没有」判据）');
  A(rd.types.length === 0, 'C3c 且 types 是空数组 —— 光看它必判「没有这一对」');
  const b0 = counts(W).bonds;
  const r3 = W.playableSeed.seed({});
  EQ(r3.written, 0, 'C3d 即便如此，第三遍仍 written = 0（容器直读兜底生效）');
  EQ(counts(W).bonds, b0, 'C3e 关系行数未被重复写（实 ' + counts(W).bonds + '）');
}

// ═══ D 不编事实 ═══════════════════════════════════════════════════════
head('D 不编事实：没输入就说没输入，取不到就不播');
{
  const W = loadAll();
  EQ(W.playableSeed.seed({}).reason, 'no-blueprint', 'D1 空世界 ⇒ no-blueprint');
  const v0 = W.playableSeed.view();
  EQ(v0.blueprint, null, 'D1b blueprint = null');
  EQ(v0.planned, 0, 'D1c planned = 0');
  A(typeof v0.note === 'string' && v0.note.length > 0, 'D1d note 说清「没有蓝图」');
  EQ(W.playableSeed.seed({ sampleId: '__no_such__' }).reason, 'no-blueprint', 'D2 未安装的 sampleId');
  const W2 = loadAll();
  W2.playableBlueprint.installSample('town-workshop', { force: true });
  const pv = W2.playableSeed.preview({});
  EQ(pv.rows.filter(function (x) { return x.kind === 'goal' && /[（(]\s*[）)]/.test(x.text); }).length, 0,
    'D3 目标句里没有空括号（半填出来的句子是编的）');
  // 三份样例各自装一遍，逐份零 noSource
  ['town-workshop', 'settlement-exploration', 'sci-fi-station'].forEach(function (id, i) {
    const X = loadAll();
    X.playableBlueprint.installSample(id, { force: true });
    const p = X.playableSeed.preview({ sampleId: id });
    A(p.ok, 'D4.' + (i + 1) + ' ' + id + ' 可预览');
    EQ(p.noSource.length, 0, 'D4.' + (i + 1) + 'b ' + id + ' 零取不到实词');
    EQ(p.counts.goal, 2, 'D4.' + (i + 1) + 'c ' + id + ' 每人一条目标');
    console.log('    ' + id + ' → ' + JSON.stringify(p.counts));
  });
}

// ═══ E 势力真源（本版顺带修掉的真缺陷）═══════════════════════════════════
head('E 势力真源：world.factions（零读口死键）→ evolution.factions');
{
  const codeLines = BP_SRC.split('\n').filter(function (l) {
    return !/^\s*(\/\/|\*|\/\*)/.test(l) && l.indexOf('world.factions') >= 0;
  });
  EQ(codeLines.length, 0, 'E1 蓝图代码行里无 world.factions');
  EQ(cnt(BP_SRC, 'WA.evolution.applyFactions(draft, factions)'), 1, 'E2 走唯一合法写口 applyFactions');
  const W = loadAll();
  W.playableBlueprint.installSample('town-workshop', { force: true });
  const c = counts(W);
  EQ(c.worldFactions, 0, 'E3 世界里 world.factions 仍是 0');
  A(c.evoFactions >= 2, 'E3b evolution.factions 有 ' + c.evoFactions + ' 个');
  const rv = W.org.rosterView('工匠协会');
  A(rv && rv.ok !== false, 'E4 org.rosterView 读得到（此前 firstEvoFaction=null ⇒ assignRole 直接 skipped）');
  const names = ((W.store.get().evolution || {}).factions || []).map(function (f) { return f.name; });
  A(names.indexOf('工匠协会') >= 0, 'E4b 蓝图的势力名真在位（' + JSON.stringify(names) + '）');
}

// ═══ N 负控制 ═════════════════════════════════════════════════════════
head('N 负控制：三处真源码破坏 → 装载破坏副本 → 重跑同款判据');
{
  let broken = 0;
  const A1 = "return g && clean(g.text, 80) === clean(row.text, 80);";
  // N2 咬的是本版真正修掉的那一处：bond 的容器直读兜底。
  //   原先想咬 `if (why0 === 'disabled')`，但查证后发现四个写口（life.addGoal /
  //   life.addSchedule / bonds.setBond / org.assignRole）没有一个在关着时回
  //   `{ok:true, reason:'disabled'}` —— 破坏那行行为不变，是**假绿**。宁可换成
  //   真的能改行为的锚点，也不留一条咬不住的负控制。
  const A2 = "      return (((st.bonds || {}).rows) || []).some(function (x) { return x && x.key === key; });";
  const A3 = "      if (o.noSeed !== true && WA.playableSeed && typeof WA.playableSeed.seed === 'function') {";
  EQ(cnt(SEED_SRC, A1), 1, 'N0.1 锚点 N1 在源码里恰一处');
  EQ(cnt(SEED_SRC, A2), 1, 'N0.2 锚点 N2 恰一处');
  EQ(cnt(BP_SRC, A3), 1, 'N0.3 锚点 N3 恰一处');
  {
    const b = SEED_SRC.replace(A1, "return g && clean(g.text, 80) === '__never__';");
    A(b !== SEED_SRC, 'N1a 破坏副本真改了字节'); if (b !== SEED_SRC) broken++;
    const ov = {}; ov[SEED_REL] = b;
    const W = loadAll(ov);
    W.playableBlueprint.installSample('town-workshop', { force: true });
    const r = W.playableSeed.seed({});
    A(r.written > 0, 'N1b 破坏后第二遍仍写 ' + r.written + ' 行（幂等失效可观测）');
  }
  {
    const b = SEED_SRC.replace(A2, '      return false;');
    A(b !== SEED_SRC, 'N2a 破坏副本真改了字节'); if (b !== SEED_SRC) broken++;
    const ov = {}; ov[SEED_REL] = b;
    const W = loadAll(ov);
    W.playableBlueprint.installSample('town-workshop', { force: true });
    A(W.bonds.getSettings().enabled === false, 'N2b 破坏副本里 bonds 仍出厂关着（缺陷暴露的前提）');
    EQ(W.bonds.read('大师傅', '青年学徒').reason, 'disabled', 'N2c 读口确实回 disabled（不是「没有」）');
    const rows0 = counts(W).bonds;
    const r = W.playableSeed.seed({});
    EQ(r.written, 1, 'N2d 破坏后第二遍又写了 1 行 —— 幂等在这一个开关态下失效');
    EQ(r.byKind.bond, 1, 'N2e 写的正是 bond');
    EQ(r.reasons.already, r.planned - 1, 'N2f 其余 ' + (r.planned - 1) + ' 行仍判 already（只有这一行被误判成「没有」）');
    EQ(counts(W).bonds, rows0, 'N2g 关系行数没变 —— 是改写不是新增，所以它从不报错（这才是它安静的原因）');
  }
  {
    const b = BP_SRC.replace(A3, A3.replace('o.noSeed !== true &&', 'false &&'));
    A(b !== BP_SRC, 'N3a 破坏副本真改了字节'); if (b !== BP_SRC) broken++;
    const ov = {}; ov[BP_REL] = b;
    const W = loadAll(ov);
    const r = W.playableBlueprint.installSample('town-workshop', { force: true });
    EQ(r.ok, true, 'N3b 破坏后安装照样 ok:true（这正是它安静的原因）');
    EQ(r.seeded, null, 'N3c 但 seeded 为 null —— 没播');
    EQ(counts(W).goals, 0, 'N3d 世界里 goals 仍为 0');
  }
  EQ(broken, 3, 'N4 三处破坏全部真的改到了源码');
  const W = loadAll();
  W.playableBlueprint.installSample('town-workshop', { force: true });
  A(counts(W).goals > 0, 'N5 原版恢复后装完就有目标行');
  EQ(W.playableSeed.seed({}).written, 0, 'N5b 且第二遍仍 written = 0');

  // ── N6 判据纯度（H5）──────────────────────────────────────────────
  //   三条规矩：① 锚点字面量在本层内只声明一次（声明两遍就能拿另一份去凑绿）；
  //   ② 断言文案里不许出现锚点串（否则文案本身就是第二份锚点）；
  //   ③ 破坏用的替换串必须与锚点不同（同串替换 = 什么都没做）。
  {
    const SELF = fs.readFileSync(__filename, 'utf8');
    [['A1', A1], ['A2', A2], ['A3', A3]].forEach(function (p, i) {
      EQ(cnt(SELF, p[1]), 1, 'N6.' + (i + 1) + ' 锚点 ' + p[0] + ' 在探针源码里只出现一次');
    });
    A(A1 !== 'return g && clean(g.text, 80) === \'__never__\';', 'N6.4 破坏串与锚点不同（N1）');
    A(A2 !== '      return false;', 'N6.5 破坏串与锚点不同（N2）');
    A(broken === 3, 'N6.6 三处破坏各自可观测（N1b/N2d/N3d 的行为都变了）');
  }

  // ── N7 工具两向自证（H6）──────────────────────────────────────────
  //   负控制工具本身也要被证：锚点不存在时不许假装改到；锚点不唯一时必须能被认出来。
  {
    const ghost = SEED_SRC.replace('__this_anchor_is_not_in_source__', 'x');
    A(ghost === SEED_SRC, 'N7a 锚点不存在 ⇒ 字节不变（「没咬到」可识别，不会假绿）');
    const twin = A1 + '\n' + A1;
    EQ(cnt(twin, A1), 2, 'N7b 出现两次时 cnt 报 2（「不唯一」可识别，不会咬错地方）');
    // 真源码上同款判据仍须为真（破坏副本上的结论不能盖住原版的结论）
    EQ(cnt(SEED_SRC, A1), 1, 'N7c 原版上锚点恰一处（与破坏副本的读数分开看）');
    EQ(cnt(BP_SRC, A3), 1, 'N7d 蓝图一侧同样恰一处');
  }
}

console.log('\n═══ p_playable_seed: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
console.log(fail + ' failed');
if (fail) process.exit(1);