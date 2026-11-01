#!/usr/bin/env node
'use strict';
/**
 * tests/v7-playable-seed-2281.js — v2.281.0（V7 OPV7-6）开局播种专锁。
 *
 * 【本锁与探针的分工】探针答「本次改动对不对」（现场打印读数、可单跑）；
 *   本锁答「以后会不会退回去」。这一项最容易被「优化」掉的三处，都钉在这里：
 *   ① **走 store 直写**：看起来更短，但它绕开各引擎自己的容量、挤出、记账与拒收 ——
 *      「播进去了」于是变成一句只有本模块相信的话。锁钉「只走四个真写口」。
 *   ② **去重判据放水**：重复播不报错，只是白占容量、把后来的真实内容挤出去 ——
 *      这种病每次都很安静。锁钉「第二遍必须 written=0」。
 *   ③ **装完不播**：接线一旦被摘掉，世界里依旧是「有演员、没剧本」，
 *      而安装器照样回 ok:true。锁钉「installSample 默认播种」。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const SEED_REL = 'engines/playable-seed.js';
const BP_REL = 'engines/playable-blueprint.js';
const SEED_SRC = fs.readFileSync(path.join(BASE, SEED_REL), 'utf8');
const BP_SRC = fs.readFileSync(path.join(BASE, BP_REL), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');

let pass = 0, fail = 0;
const fails = [];
function assert(ok, msg) {
  if (ok) { pass++; return; }
  fail++; fails.push(msg);
  console.log('  ✗ ' + msg);
}
function eq(a, b, msg) { assert(a === b, msg + '（实得 ' + JSON.stringify(a) + '，期望 ' + JSON.stringify(b) + '）'); }
function section(t) { console.log('\n── ' + t + ' ──'); }
function cnt(s, n) { return String(s).split(n).length - 1; }
// 只数**代码行**（注释里的名字不算调用 —— 本仓 v2.29.0 起的老账：注释能掏空判据）
function cntCode(s, n) {
  return String(s).split('\n').filter(function (l) {
    return !/^\s*(\/\/|\*|\/\*)/.test(l) && l.indexOf(n) >= 0;
  }).length;
}
function must1(s, n, tag) {
  const c = cnt(s, n);
  if (c !== 1) throw new Error('锚点命中 ' + c + ' 次（要求恰 1 次）: ' + tag);
  return c;
}

// 负控制锚点（本文件内各只声明一次 —— 判据纯度，见 N6）
const A_DEDUP = "return g && clean(g.text, 80) === clean(row.text, 80);";
const A_DISABLED = "    if (why0 === 'disabled') { note('disabled'); return false; }";
const A_NOSEED = "      if (o.noSeed !== true && WA.playableSeed && typeof WA.playableSeed.seed === 'function') {";

let LOAD = null;
function loadList() {
  if (LOAD) return LOAD;
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  LOAD = vm.runInNewContext('[' + m[1] + ']');
  return LOAD;
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
  for (const rel of loadList()) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    const body = (ov && ov[rel] !== undefined) ? ov[rel] : fs.readFileSync(p, 'utf8');
    try { vm.runInContext(body, ctx, { filename: rel }); } catch (e) {}
  }
  const WA = global.WorldAxis;
  try { WA.store.init(); } catch (e) {}
  return WA;
}

const EXPORTS = ['getSettings', 'setSettings', 'preview', 'seed', 'view', 'stat'];

// 读数 helper：直接从 store 现场数（不复用被测模块的读数口 —— 否则它错了也看不出来）
function readCounts(WA) {
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
function runA() {
  section('A. 结构：装载同序 / 导出面 / 只走真写口 / 不造第二真源 / 三件齐做');
  assert(IDX_SRC.indexOf("'engines/playable-seed.js'") >= 0, 'A1 已进 index.js LOAD_ORDER');
  assert(RUN_SRC.indexOf("'engines/playable-seed.js'") >= 0, 'A1b 已进 tests/run.js LOAD');
  // 位置必须紧随 playable-blueprint：调用期它读 WA.playableBlueprint.getSample
  const iSeed = IDX_SRC.indexOf("'engines/playable-seed.js'");
  const iBp = IDX_SRC.indexOf("'engines/playable-blueprint.js'");
  assert(iBp >= 0 && iSeed > iBp && iSeed - iBp < 400,
    'A2 index.js 里紧随 playable-blueprint（间隔 ' + (iSeed - iBp) + ' 字符）');
  const jSeed = RUN_SRC.indexOf("'engines/playable-seed.js'");
  const jBp = RUN_SRC.indexOf("'engines/playable-blueprint.js'");
  assert(jBp >= 0 && jSeed > jBp && jSeed - jBp < 300,
    'A2b tests/run.js 里同样紧随（间隔 ' + (jSeed - jBp) + ' 字符）');

  const WA = loadAll();
  eq(Object.keys(WA.playableSeed).sort().join(','), EXPORTS.slice().sort().join(','),
    'A3 导出面恰 6 项');
  // A4 只走真写口：零 store 直写、四个写口各恰一处
  eq(SEED_SRC.indexOf('store.transact'), -1, 'A4 零 store.transact（不直写世界）');
  eq(SEED_SRC.indexOf('store.patch'), -1, 'A4b 零 store.patch');
  eq(SEED_SRC.indexOf('store.set'), -1, 'A4c 零 store.set');
  ['WA.life.addGoal', 'WA.life.addSchedule', 'WA.bonds.setBond', 'WA.org.assignRole'].forEach(function (p, i) {
    // 只数代码行：typeof 存在性检查那一行也是代码，故恰 1 处 = 唯一的<b>调用</b>行
    assert(cntCode(SEED_SRC, p + '(') === 1, 'A4d.' + (i + 1) + ' 走真写口 ' + p + ' 调用恰一处（实 '
      + cntCode(SEED_SRC, p + '(') + '）');
  });
  // A5 不造第二真源：不新建势力、不新建人物、不写已废弃的 world.factions
  eq(cnt(SEED_SRC, 'world.factions'), 1, 'A5 world.factions 只出现在文件头注释一次（零代码路径）');
  eq(SEED_SRC.indexOf('evolution.factions ='), -1, 'A5b 不自己写 evolution.factions（那是 evolution 的格）');
  eq(SEED_SRC.indexOf('draft.people'), -1, 'A5c 不自己造人物');
  // A6 出厂默认开（计划原文：开局即喂；关掉要显式设）
  assert(/enabled:\s*true/.test(SEED_SRC), 'A6 出厂默认 enabled:true');
  // A7 三件齐做：诊断节接线 + 面板真读 + 守卫表登记
  assert(DIAG_SRC.indexOf('playableSeed: secPlayableSeed()') >= 0, 'A7 诊断节已接线');
  assert(DIAG_SRC.indexOf('WA.playableSeed') >= 0, 'A7b 诊断面真读');
  assert(PANEL_SRC.indexOf('WA.playableSeed') >= 0, 'A7c 面板真读');
  // 守卫表登记 5 个 id（收口补 wa-seed-enabled —— 开关没有控件就等于这一面不可关，
  //   而「关着」与「没播」在本栏本来是两句话，缺开关就只能靠改设置文件去区分）。
  eq(cnt(DIAG_SRC, "'wa-seed-enabled', 'wa-seed-line', 'wa-seed-replay', 'wa-seed-view', 'wa-seed-out'"), 1,
    'A7d 守卫表一次登记四个新控件');
  ['wa-seed-enabled', 'wa-seed-line', 'wa-seed-replay', 'wa-seed-view', 'wa-seed-out'].forEach(function (id, i) {
    assert(PANEL_SRC.indexOf('id="' + id + '"') >= 0, 'A7e.' + (i + 1) + ' 面板渲染了 ' + id);
  });
  assert(PANEL_SRC.indexOf("on('#wa-seed-replay'") >= 0, 'A7f 补播按钮有绑定');
  assert(PANEL_SRC.indexOf("on('#wa-seed-view'") >= 0, 'A7g 读数按钮有绑定');
}

// ═══ A2 势力真源修复（本版顺带修掉的真缺陷）═══════════════════════════════
function runA2() {
  section('A2 势力真源：蓝图改写 evolution.factions（world.factions 是零读口死键）');
  // 代码路径里不得再出现 world.factions 的写入
  const codeLines = BP_SRC.split('\n').filter(function (l) {
    return !/^\s*(\/\/|\*|\/\*)/.test(l) && l.indexOf('world.factions') >= 0;
  });
  eq(codeLines.length, 0, 'A2a playable-blueprint 代码路径里无 world.factions（实 ' + codeLines.length + ' 行）');
  eq(cnt(BP_SRC, 'WA.evolution.applyFactions(draft, factions)'), 1, 'A2b 走唯一合法写口 applyFactions');
  const WA = loadAll();
  const r = WA.playableBlueprint.installSample('town-workshop', { force: true });
  eq(r.ok, true, 'A2c 安装成功');
  const c = readCounts(WA);
  eq(c.worldFactions, 0, 'A2d 世界里 world.factions 仍是 0（没人往那儿写）');
  assert(c.evoFactions >= 2, 'A2e evolution.factions 有 ' + c.evoFactions + ' 个势力（org/editorFaction/diplomacy 的共同真源）');
  const names = ((WA.store.get().evolution || {}).factions || []).map(function (f) { return f.name; });
  assert(names.indexOf('工匠协会') >= 0, 'A2f 蓝图声明的势力真的在位（实 ' + JSON.stringify(names) + '）');
  // 名册读口读得到，说明写对了键（此前 firstEvoFaction=null ⇒ org.assignRole 直接 skipped）
  //   注：holder 是 org 内部面（不导出），对外真读口是 rosterView。
  const rv = WA.org.rosterView('工匠协会');
  assert(rv && rv.ok !== false, 'A2g org.rosterView 能读到该势力（此前 firstEvoFaction=null ⇒ skipped）');
  const members = (rv && (rv.rows || rv.members)) || [];
  assert(members.length >= 2, 'A2h 名册里至少 2 人（实 ' + members.length + '）');
}

// ═══ B 真值：装完立刻有剧本 ═══════════════════════════════════════════════
function runB() {
  section('B. 真值：装一份蓝图后，四个结构位从零变有');
  const WA = loadAll();
  const before = readCounts(WA);
  const r = WA.playableBlueprint.installSample('town-workshop', { force: true });
  const after = readCounts(WA);
  assert(r.seeded && r.seeded.ok === true, 'B1 安装器回带了播种结果（seeded.ok）');
  assert(r.seeded && r.seeded.written > 0, 'B1b 真写了 ' + ((r.seeded || {}).written) + ' 行');
  eq(r.seeded.blocked, 0, 'B1c 零受阻');
  eq(before.goals, 0, 'B2 装之前 life.goals 为 0（立据：这就是「有演员没剧本」）');
  assert(after.goals > 0, 'B2b 装之后 life.goals = ' + after.goals);
  assert(after.sched > 0, 'B2c life.schedule = ' + after.sched);
  assert(after.bonds > 0, 'B2d bonds.rows = ' + after.bonds);
  assert(after.rostered > 0, 'B2e 势力名册里有 ' + after.rostered + ' 人');
  eq(after.goals, r.seeded.counts.goal, 'B3 实写目标数 == 计划数（计划与落笔同源）');
  eq(after.rostered, r.seeded.counts.roster, 'B3b 实写名册数 == 计划数');
  // B4 结构位逐类对上：每个行都带 src（「不编事实」的可审凭据）
  const pv = WA.playableSeed.preview({});
  eq(pv.ok, true, 'B4 preview 可读');
  const noSrc = pv.rows.filter(function (x) { return !x.src; });
  eq(noSrc.length, 0, 'B4b 每一行都带 src 出处（实缺 ' + noSrc.length + ' 行）');
  const kinds = {};
  pv.rows.forEach(function (x) { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
  eq(JSON.stringify(kinds.goal), JSON.stringify(pv.counts.goal), 'B5 counts.goal 与行数一致');
  eq(JSON.stringify(kinds.roster), JSON.stringify(pv.counts.roster), 'B5b counts.roster 与行数一致');
  // B6 实词可追：目标句里的阶段/方法必须是蓝图原文
  const sample = WA.playableBlueprint.getSample('town-workshop');
  const defs = sample.sample.playDefs;
  const goalRows = pv.rows.filter(function (x) { return x.kind === 'goal'; });
  assert(goalRows.length > 0, 'B6 有目标行');
  const stage = defs.training.stages[defs.training.stages.length - 1];
  assert(goalRows[0].text.indexOf(stage) >= 0, 'B6b 目标句含蓝图声明的阶段「' + stage + '」');
  assert(goalRows[0].text.indexOf(defs.training.method) >= 0, 'B6c 目标句含蓝图声明的方法「' + defs.training.method + '」');
  // B7 关系型取六型里最弱的那个（不做剧情判断）
  const bondRows = pv.rows.filter(function (x) { return x.kind === 'bond'; });
  assert(bondRows.length > 0, 'B7 有关系行');
  eq(bondRows[0].types[0], '平行共存', 'B7b 关系型 = 平行共存（最弱语义承诺）');
  assert(WA.bonds.TYPES.indexOf('平行共存') >= 0, 'B7c 且它真是 bonds 的合法枚举（不是自造词）');
  // B8 三份样例都不缺实词（每份单独装载 —— preview 只认**已安装**的蓝图，
  //   不装就问「这份会播什么」是拿不到输入的，那不是缺陷而是没有输入）
  ['town-workshop', 'settlement-exploration', 'sci-fi-station'].forEach(function (id, i) {
    const W = loadAll();
    const ir = W.playableBlueprint.installSample(id, { force: true });
    assert(ir.ok, 'B8.' + (i + 1) + ' 样例 ' + id + ' 可安装');
    assert(ir.seeded && ir.seeded.ok, 'B8.' + (i + 1) + 'b ' + id + ' 装完即播');
    const p = W.playableSeed.preview({ sampleId: id });
    assert(p.ok, 'B8.' + (i + 1) + 'c 样例 ' + id + ' 可预览');
    eq(p.noSource.length, 0, 'B8.' + (i + 1) + 'd ' + id + ' 零「取不到实词」行（实 ' + JSON.stringify(p.noSource) + '）');
    assert(p.counts.goal === 2, 'B8.' + (i + 1) + 'e ' + id + ' 每人一条目标（实 ' + p.counts.goal + '）');
  });
}

// ═══ C 幂等 ═══════════════════════════════════════════════════════════
function runC() {
  section('C. 幂等：同一份蓝图播两次不重复写');
  const WA = loadAll();
  WA.playableBlueprint.installSample('town-workshop', { force: true });
  const s1 = JSON.stringify(WA.store.get());
  const again = WA.playableSeed.seed({});
  eq(again.ok, true, 'C1 第二遍仍 ok（幂等不是失败）');
  eq(again.written, 0, 'C1b written = 0');
  eq(again.skipped, again.planned, 'C1c 全部跳过（' + again.skipped + '/' + again.planned + '）');
  eq(again.reasons.already, again.planned, 'C1d 拒不重复的归因是 already');
  eq(JSON.stringify(WA.store.get()), s1, 'C2 第二遍之后世界逐字未变');
  // C3 播过的行真在（跳过不是「没写进去」）
  const c = readCounts(WA);
  assert(c.goals > 0 && c.rostered > 0, 'C3 跳过之后行还在（goals ' + c.goals + ' / rostered ' + c.rostered + '）');
  // C4 补一条人工内容，重播不得覆盖也不得挤掉它
  const d0 = WA.store.get();
  const firstId = Object.keys(d0.people || {})[0];
  const nm = (d0.people[firstId] || {}).name;
  WA.life.addGoal(nm, { text: '人工写的目标（不是播种来的）' });
  const r3 = WA.playableSeed.seed({});
  eq(r3.written, 0, 'C4 人工内容之后重播仍 written = 0');
  const goals = ((WA.store.get().people[firstId] || {}).life || {}).goals || [];
  assert(goals.filter(function (g) { return g.text === '人工写的目标（不是播种来的）'; }).length === 1,
    'C4b 人工那条还在（播种不挤别人的内容）');
}

// ═══ D 不编事实 / 不冒充 ═════════════════════════════════════════════════
function runD() {
  section('D. 不编事实：取不到就说取不到，没有输入就说没有输入');
  const WA = loadAll();
  // D1 空世界（没装蓝图）⇒ 如实说 no-blueprint，不渲染成「播过了但没内容」
  eq(WA.playableSeed.seed({}).reason, 'no-blueprint', 'D1 空世界 ⇒ no-blueprint');
  const v0 = WA.playableSeed.view();
  eq(v0.blueprint, null, 'D1b view().blueprint = null');
  eq(v0.planned, 0, 'D1c planned = 0');
  assert(typeof v0.note === 'string' && v0.note.length > 0, 'D1d view().note 说清「没有蓝图」');
  // D2 未安装的 sampleId ⇒ 同样 no-blueprint（不猜别的蓝图）
  eq(WA.playableSeed.seed({ sampleId: '__no_such__' }).reason, 'no-blueprint', 'D2 未安装的 sampleId');
  // D3 fill 的半填保护：缺任一占位键就整句不给
  const WA2 = loadAll();
  WA2.playableBlueprint.installSample('town-workshop', { force: true });
  const pv = WA2.playableSeed.preview({});
  const half = pv.rows.filter(function (x) {
    return x.kind === 'goal' && /[（(]\s*[）)]/.test(x.text);
  });
  eq(half.length, 0, 'D3 目标句里没有空括号（半填出来的句子是编的）');
  // D4 noSource 与 rows 互斥：取不到实词的行绝不进 rows
  const dup = pv.noSource.filter(function (n) { return pv.rows.some(function (r) { return r.who === n.split(':')[1]; }); });
  assert(dup.length === 0, 'D4 进了 noSource 的人不该同时出现在 rows 里（实 ' + JSON.stringify(dup) + '）');
}

// ═══ E 只读 / 开关 / 事务边界 ═════════════════════════════════════════════
function runE() {
  section('E. 开关 / 只读 / 事务边界');
  const WA = loadAll();
  WA.playableBlueprint.installSample('town-workshop', { force: true });
  // E1 view() 不触发播种
  const runs0 = WA.playableSeed.stat().runs;
  WA.playableSeed.view(); WA.playableSeed.view();
  eq(WA.playableSeed.stat().runs, runs0, 'E1 两次 view() 不触发播种（runs 未变）');
  // E2 关掉之后 seed 如实回 disabled（不是静默不播）
  WA.playableSeed.setSettings({ enabled: false });
  const off = WA.playableSeed.seed({});
  eq(off.ok, false, 'E2 关着时 seed.ok = false');
  eq(off.reason, 'disabled', 'E2b reason = disabled');
  WA.playableSeed.setSettings({ enabled: true });
  // E3 noSeed:true 跳过播种（给测试与迁移用）
  const WA2 = loadAll();
  const r = WA2.playableBlueprint.installSample('town-workshop', { force: true, noSeed: true });
  eq(r.ok, true, 'E3 noSeed:true 时安装仍成功');
  eq(r.seeded, null, 'E3b 且 seeded 为 null（没播就是没播）');
  eq(readCounts(WA2).goals, 0, 'E3c 世界里确实没有目标行');
  // E4 播种不在 store 事务内（写口内部各自 transact，嵌进来会回滚连锁）
  //   判据只数代码行：文件头注释里写着「写口内部各自 transact」这句理由，它是文档不是调用。
  eq(cntCode(SEED_SRC, 'transact'), 0, 'E4 代码行里零 transact 调用（只在事务外调用）');
  // E5 蓝图段与播种段不共用输出区
  assert(PANEL_SRC.indexOf('#wa-seed-out') >= 0 && PANEL_SRC.indexOf('#wa-bp-out') >= 0,
    'E5 两个输出区各自存在（不共用）');
}

// ═══ N 负控制：三处真源码破坏 → 装载破坏副本 → 重跑同款判据 ═════════════
function runNegative() {
  section('N. 负控制：三处真源码破坏 → 装载破坏副本 → 重跑同款判据');
  let broken = 0;
  // N1 去重判据放水（goal 恒判「不存在」）
  {
    must1(SEED_SRC, A_DEDUP, 'N1');
    const b = SEED_SRC.replace(A_DEDUP, "return g && clean(g.text, 80) === '__never__';");
    assert(b !== SEED_SRC, 'N1a 破坏副本真改了字节');
    if (b !== SEED_SRC) broken++;
    const ov = {}; ov[SEED_REL] = b;
    const W = loadAll(ov);
    W.playableBlueprint.installSample('town-workshop', { force: true });
    const r2 = W.playableSeed.seed({});
    assert(r2.written > 0, 'N1b 破坏后第二遍仍写 ' + r2.written + ' 行 —— 幂等失效可观测');
  }
  // N2 disabled 前置判定失效（把「没写进去」记成「写进去了」）
  {
    must1(SEED_SRC, A_DISABLED, 'N2');
    const b = SEED_SRC.replace(A_DISABLED, "    if (false && why0 === 'disabled') { note('disabled'); return false; }");
    assert(b !== SEED_SRC, 'N2a 破坏副本真改了字节');
    if (b !== SEED_SRC) broken++;
    const ov = {}; ov[SEED_REL] = b;
    const W = loadAll(ov);
    W.playableBlueprint.installSample('town-workshop', { force: true });
    // 关掉 life 引擎：真写口会回 {ok:false, reason:'disabled'}
    W.life.setSettings({ enabled: false });
    const g0 = readCounts(W).goals;
    const r3 = W.playableSeed.seed({ sampleId: 'town-workshop' });
    const g1 = readCounts(W).goals;
    eq(g1, g0, 'N2b 破坏后 life 真没写进去（goals 未变）');
    assert(r3.reasons.disabled === undefined,
      'N2c 而账上却记不成 disabled（实 ' + JSON.stringify(r3.reasons) + '）—— 「没写」被算成别的');
  }
  // N3 安装器的自动播种接线被摘（世界里仍是空舞台，安装器照样 ok:true）
  {
    must1(BP_SRC, A_NOSEED, 'N3');
    const b = BP_SRC.replace(A_NOSEED, A_NOSEED.replace('o.noSeed !== true &&', 'false &&'));
    assert(b !== BP_SRC, 'N3a 破坏副本真改了字节');
    if (b !== BP_SRC) broken++;
    const ov = {}; ov[BP_REL] = b;
    const W = loadAll(ov);
    const r4 = W.playableBlueprint.installSample('town-workshop', { force: true });
    eq(r4.ok, true, 'N3b 破坏后安装照样回 ok:true（这正是它安静的原因）');
    eq(r4.seeded, null, 'N3c 但 seeded 为 null —— 没播');
    eq(readCounts(W).goals, 0, 'N3d 世界里 goals 仍为 0');
  }
  eq(broken, 3, 'N4 三处破坏全部真的改到了源码');
  // N5 两向自证：原版恢复后同款判据重新为真
  const W = loadAll();
  W.playableBlueprint.installSample('town-workshop', { force: true });
  assert(readCounts(W).goals > 0, 'N5 原版恢复后装完就有目标行');
  eq(W.playableSeed.seed({}).written, 0, 'N5b 且第二遍仍 written = 0（幂等回来）');
  // N6 判据纯度：三个锚点常量在本文件里各只声明一次（搜索串拼接，避开自指）
  const SELF = fs.readFileSync(__filename, 'utf8');
  eq(cnt(SELF, 'const A_' + 'DEDUP ='), 1, 'N6a 锚点 N1 只声明一次');
  eq(cnt(SELF, 'const A_' + 'DISABLED ='), 1, 'N6b 锚点 N2 只声明一次');
  eq(cnt(SELF, 'const A_' + 'NOSEED ='), 1, 'N6c 锚点 N3 只声明一次');
}

function runAll() {
  pass = 0; fail = 0; fails.length = 0;
  runA(); runA2(); runB(); runC(); runD(); runE(); runNegative();
  console.log('\n═══ v7-playable-seed-2281: ' + pass + ' 通过 / ' + fail + ' 失败 ═══');
}
function runNegativeOnly() { pass = 0; fail = 0; runNegative(); }

if (require.main === module) { runAll(); if (fail) process.exit(1); }
module.exports = { runAll: runAll, runNegative: runNegativeOnly };