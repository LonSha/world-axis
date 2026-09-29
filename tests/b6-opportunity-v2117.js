#!/usr/bin/env node
// WorldAxis tests/b6-opportunity-v2117.js -- B6 专锁：机会形成 + 题材完整配置配方（v2.117.0）
//
// 规划 02 的 B6 原文要点：「复用 causal、longline、chapters、spotlight、tempo、theme 和 canon。
//   机会优先从未解决承诺、资源瓶颈、相互冲突的目标、信息差和未结因果中形成。每个机会都能回答
//   『由哪项变化产生、涉及谁、窗口多久、忽略会怎样』。玩家可以参与、拒绝、延后或不知情；
//   世界根据已有规则继续，不能因玩家没接任务就凭空停摆。忽略的后果按规模和可见性控制，
//   避免所有小线索最终都升级为灾难。推进节奏可以调密度，但已确认事实与角色自主性保持约束。
//   题材包升级为完整配置配方，包含必要能力、运行政策、允许的行动/资源词汇、场景种子、
//   信息边界和验收样本。采用现有 theme 的组合能力并给出规则冲突预览；基础事实、时间和
//   身份约束不被题材覆盖」。
//
// 落点：engines/opportunity.js（新顶层容器 opportunity.openings）+ engines/recipe.js（零新容器）。
//   新容器的三处登记（evict.SITES / store 骨架 / store __BOUNDED_CAPS）由 [8] 守住；
//   recipe 的「不落新容器」由 [13] 的顶层键指纹守住。
//
// 本锁逐条守住的语义 —— 每一条都是「写出来了、但某个条件下不会成立」：
//   ① 四个必答项：由哪项变化产生 / 涉及谁 / 窗口多久 / 忽略会怎样，逐项非空（未记录就印未记录）。
//   ② 两档窗口不混同：源记了期限才给 deadline 且窗口结束时刻取源；默认宽限一律 deadline=0。
//   ③ 窗口真的会关：过窗口末刻的作答一律 window-closed，且**这次作废真落盘**、事后读得到；
//      作废后被源条件重开，也仍读得到「这扇窗曾经关过」。
//   ④ 世界不会因没人接而停摆：源条件仍在 ⇒ 作废的行会被重新开窗（reopens 计数）；
//      已接 / 已拒永不重开（那是玩家的明确决定）。
//   ⑤ 不知道就不给：世界侧记了涉及谁而作答者不在其中 ⇒ not-entitled（不入库、不再作答）。
//   ⑥ 作答必须可分辨：延后没有默认延长期（missing-window）；已答行留在册上但不进注入块。
//   ⑦ 容量有界且挤出有账：溢出只能环形挤出，不静默丢弃、不做无界增长。
//   ⑧ 同一机会反复扫描只有一个 id；两个不同机会不坍成一条（id 不用自增序号）。
//   ⑨ 不改任何源状态面：扫描与作答都不写 memory.foreshadows 的状态与期限。
//   ⑩ 零新写通道：顶层键集合不变（opportunity 由骨架物化，不是写侧临时造出来的）。
//   ⑪ 登记进册的机会行会落盘，重载后仍在册（不是只在内存里的一次性读数）。
//   ⑫ recipe：未知配方拒收且不回落；题材被真源拒收即不写半截；随机源缺席不整体崩。
//   ⑬ recipe：基础事实三态（通过 / 未核 / 落空）**三个不同的词**；
//      「查不到」才记落空，未核不许被当成落空、也不许被当成通过。
//   ⑭ recipe：冲突与边界如实下发；预览不写盘；场景种子不含人名与世界设定。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
//
// 判据形态（**这是本锁上一版的病灶，写在这里免得再犯**）：
//   每个 p* 判据**接收注入环境** `{ ov }`（`ov` 为源码覆盖或 null），
//   在**那个环境**里自建世界与夹具。早先的版本在判据内部自建干净 `fresh()`，
//   注入的破坏根本没进过被测代码 —— 19 条 N1（破坏现形）一路全绿，
//   而「全绿」本身被当成了通过。判据**不能**自己造环境，必须用传进来的那个。
//   返回值是**语义常量串**（原版永远返回同一个词），不是会随夹具变化的读数 ——
//   否则 N2「原版成立」与 N3「破坏互不串扰」就失去意义。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b6o2117_';
const REL_O = 'engines/opportunity.js';
const REL_R = 'engines/recipe.js';

// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
// opportunity（14）
const A_ENT2     = "      if (who && (r.actors || []).length && (r.actors || []).indexOf(who) < 0) {\n";
const A_WINDL    = "      deadline: recorded ? (Number(r.deadlineAt) || 0) : 0,";
const A_DEADF    = "      deadlineAt: c.windowBasis === 'recorded' ? (c.due || 0) : 0,\n            ignoredRef: c.ignoredRef || '', conflict: c.conflict || '', stage: 'open', actor: '',";
const A_SCLOSE   = "        if (t > endOf(r, cfg)) { r.stage = 'lapsed'; r.lapsedAt = t; r.updatedAt = t; lapsed++; }";
const A_SCLOSE2  = "        out = { ok: false, reason: 'window-closed', id: cid };\n";
const A_ROWCLOSE = "      endAt: end, windowClosed: (t > end) || !!r.lapsedAt,\n";
const A_REOPEN   = "        if (hit.stage === 'lapsed') {\n";
const A_OPENSET  = "        if (hit.stage === 'open') {\n";
const A_EVICT    = "      if (WA.evict) WA.evict.array(rs, 'opportunity.openings');   // 挤出有账";
const A_IDOF     = "    return 'op:' + source + ':' + String(ref || '').replace(/[:,;|]/g, '/');";
const A_DEFER    = "        if (!isFinite(by) || by <= 0) { out = { ok: false, reason: 'missing-window', id: cid }; return false; }";
const A_ACTORS   = "          actors: who ? [who] : [],\n          due: 0, windowMs: 0, windowBasis: 'default',\n          ignoredRef: 'intel:' + k + ':' + about,";
const A_NODESC   = "      bits.push('涉及：' + ((v.actors || []).length ? v.actors.join('、') : '未记录'));";

// recipe（9）
const B_UNK        = "    if (!k) { const r = saveSettings({ name: '' }); stat.applies++; stat.lastReason = 'cleared'; return { ok: true, name: '', cleared: true, saved: r }; }\n    if (!known(k)) { stat.rejects++; stat.lastReason = 'unknown-recipe'; return { ok: false, reason: 'unknown-recipe', unknown: k, known: Object.keys(RECIPES) }; }";
const B_THEME      = "      if (!themeApplied || !themeApplied.ok) {\n        stat.rejects++; stat.lastReason = 'theme-refused';";
const B_SEED       = "      try { if (WA.rand && typeof WA.rand.int === 'function') i = WA.rand.int(arr.length); } catch (e) { i = 0; }";
const B_CONF       = "      (p.vs || []).forEach(function (other) {";
const B_STATE      = "      const st = hard ? 'no-symbol' : (injected ? 'verified' : 'unverified');";
const B_STALEONLY  = "    return basics(opts).filter(function (b) { return b.state === 'no-symbol'; }).map(function (b) { return b.id; });";
const B_UNVERONLY  = "    return basics(opts).filter(function (b) { return b.state === 'unverified'; }).map(function (b) { return b.id; });";
const B_WROTE      = "      wrote: null };";
const B_BOUND      = "      boundaries: (r.boundaries || []).slice(), acceptance: (r.acceptance || []).slice(),";

const BROKEN = [
  // ── opportunity（14）──
  { rel: REL_O, key: 'ent2',      from: A_ENT2,     to: "      if (false) {\n",
    why: '涉及者之外的人也能答 ⇒ 信息差被架空' },
  { rel: REL_O, key: 'windl',     from: A_WINDL,    to: "      deadline: 0,",
    why: '读数恒不给期限 ⇒「源记了期限」与「本模块宽限」在读数里长得一样' },
  { rel: REL_O, key: 'deadf',     from: A_DEADF,    to: "      deadlineAt: 0,\n            ignoredRef: c.ignoredRef || '', conflict: c.conflict || '', stage: 'open', actor: '',",
    why: '登记时丢掉源期限 ⇒ 两档从入口就混成一档' },
  { rel: REL_O, key: 'sclose',    from: A_SCLOSE,   to: "        if (false) { lapsed++; }",
    why: '扫描不再作废过期窗口 ⇒ 机会永远堆在「在途」里' },
  { rel: REL_O, key: 'sclose2',   from: A_SCLOSE2,  to: "        out = { ok: false, reason: 'window-closed', id: cid };\n        return false;\n",
    why: '作答太晚时放弃整笔事务 ⇒ 刚打的作废标记被一起回滚（窗口关不上）' },
  { rel: REL_O, key: 'rowclose',  from: A_ROWCLOSE, to: "      endAt: end, windowClosed: isActive(r) && t > end,\n",
    why: '「此刻点过了没有」冒充「这扇窗曾经关过吗」⇒ 作废在读数里消失' },
  { rel: REL_O, key: 'reopen',    from: A_REOPEN,   to: "        if (false) {\n          reopened++;\n          return;\n        }\n        if (false) {\n",
    why: '源条件仍在也不重开 ⇒ 世界因为没人接就悄悄停了' },
  { rel: REL_O, key: 'openset',   from: A_OPENSET,  to: "        if (true) {\n",
    why: '延后的行也被扫描刷新 ⇒ 玩家显式给的延长期被无声改掉' },
  { rel: REL_O, key: 'evict',     from: A_EVICT,    to: "      if (false) {}",
    why: '溢出不做环形挤出 ⇒ 长局里只增不减' },
  { rel: REL_O, key: 'idof',      from: A_IDOF,     to: "    return 'op:' + source;",
    why: 'id 不含稳定引用 ⇒ 两个不同机会坍成一条' },
  { rel: REL_O, key: 'defer',     from: A_DEFER,    to: "        if (false) { out = { ok: false, reason: 'missing-window', id: cid }; return false; }",
    why: '延后不必给新窗口 ⇒「先放着」与「没看见」分不出来' },
  { rel: REL_O, key: 'actors',    from: A_ACTORS,   to: "          actors: [],\n          due: 0, windowMs: 0, windowBasis: 'default',\n          ignoredRef: 'intel:' + k + ':' + about,",
    why: '来源侧不记涉及谁 ⇒ not-entitled 这道闸永不触发' },
  { rel: REL_O, key: 'nodesc',    from: A_NODESC,   to: "      bits.push('涉及：' + ((v.actors || []).length ? v.actors.join('、') : '（全体）'));",
    why: '没记涉及谁时替人编一个 ⇒ 本仓最贵的那类默认值' },
  // ── recipe（9）──
  { rel: REL_R, key: 'b_unk',       from: B_UNK,       to: "    if (!k) { const r = saveSettings({ name: '' }); stat.applies++; stat.lastReason = 'cleared'; return { ok: true, name: '', cleared: true, saved: r }; }",
    why: '未知配方回落成「清空」⇒「启用了」与「没启用」长得一样' },
  { rel: REL_R, key: 'b_theme',     from: B_THEME,     to: "      if (false) {\n        stat.rejects++; stat.lastReason = 'theme-refused';",
    why: '题材被真源拒收也照落配方名 ⇒ 档位与生效题材对不上' },
  { rel: REL_R, key: 'b_seed',      from: B_SEED,      to: "      i = WA.rand.int(arr.length);",
    why: '随机源不可用就直接抛 ⇒ 取场景在无随机源环境里整体不可用' },
  { rel: REL_R, key: 'b_conf',      from: B_CONF,      to: "      [].forEach(function (other) {",
    why: '政策冲突表不被读 ⇒ 规则冲突预览永远照不到它' },
  { rel: REL_R, key: 'b_state',     from: B_STATE,     to: "      const st = injected ? 'verified' : 'unverified';",
    why: '锚点查不到也印「通过」⇒ 三态里少掉「落空」，等于替人猜了一个答案' },
  { rel: REL_R, key: 'b_staleonly', from: B_STALEONLY, to: "    return basics().filter(function (b) { return !!b.state; }).map(function (b) { return b.id; });",
    why: '「未核」被算进落空 ⇒ 正常装载的仓库每跑都报三条假落空' },
  { rel: REL_R, key: 'b_unveronly', from: B_UNVERONLY, to: "    return basics().filter(function (b) { return b.state === 'no-symbol'; }).map(function (b) { return b.id; });",
    why: '未核面被印成落空面 ⇒ 面板把「没核对过」说成「对不上」' },
  { rel: REL_R, key: 'b_wrote',     from: B_WROTE,     to: "      wrote: saveSettings({ name: k }) };",
    why: '预览竟然写盘 ⇒ 与「预览只报不改」冲突' },
  { rel: REL_R, key: 'b_bound',     from: B_BOUND,     to: "      boundaries: [], acceptance: (r.acceptance || []).slice(),",
    why: '信息边界不下发 ⇒ 运维与作者看不到「本不该知道什么」' }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

const OK = {
  items: 'four-items', win2: 'two-window-axes', winclose: 'window-closed-traced',
  winclosed: 'window-closed-kept', worldgoes: 'world-goes-on', entitlement: 'entitlement',
  traces: 'traces-kept', cap: 'cap-bounded', noReopen: 'answered-never-reopens',
  ids: 'stable-ids', defer: 'defer-needs-window', opensetWin: 'defer-window-kept',
  readonly: 'read-only',
  nosrc: 'source-untouched', persist: 'opportunity-persisted',
  recUnknown: 'rec-unknown-refused', recTheme: 'rec-theme-refused', recSeed: 'rec-seed-fallback',
  recConflict: 'rec-conflict-reported', recBasics: 'rec-basics-three-state',
  recGuess: 'rec-basics-no-guess', recPreview: 'rec-preview-nodisk', recBound: 'rec-boundaries'
};

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function readSrc(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function anchorHits(spec) { return readSrc(spec.rel).split(spec.from).length - 1; }
function brokenOverride(spec) {
  const src = readSrc(spec.rel);
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[spec.rel] = src.split(spec.from).join(spec.to);
  ov.__origSrc = readSrc(REL_O) + '|' + readSrc(REL_R);
  return ov;
}
/** 判据载入环境的唯一入口：`ov` 是源码覆盖（破坏），判据**必须**用它建世界。 */
function mkW(ov, opts) { return reset(fresh(ov ? { srcOverride: ov } : {}), opts); }
function probeWith(spec, fn) {
  let out;
  try { out = fn({ ov: brokenOverride(spec) }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}
function probeClean(fn) {
  let out;
  try { out = fn({ ov: null }); } catch (e) { out = 'threw:' + (e && e.message); }
  return out;
}

// ── 夹具 ──────────────────────────────────────────────────────────────
// 顺序要点：先把本模块设置复位成「未知档」，再落夹具并开启 ——
//   设置写在 localStorage 里，**会跨 fresh() 活下来**（这是真行为，不是测试缺陷），
//   不收窄它的话用例之间会互相串（实测：不复位时下一例读到的是上一例留下的宽限）。
const FO = { id: 'F1', content: '修堤', status: 'waiting', dueAt: 1000 };
function reset(WA, opts) {
  const o = opts || {};
  WA.opportunity.setSettings({ enabled: false, maxOpen: 4, defaultWindowMs: 60000 });
  if (WA.recipe) WA.recipe.setSettings({ name: '' });
  WA.store.transact(function (d) {
    d.people = {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: {}, updatedAt: 1,
      knowledge: { intel: o.intel || [] },
      life: { goals: o.goals || [{ id: 'g1', text: '去修堤', obstacle: '', status: 'active' }] } };
    d.evolution = { factions: o.factions || [] };
    d.memory = d.memory || {};
    d.memory.foreshadows = o.fore || [FO];
    d.opportunity = { openings: [] };
  }, TAG + 'reset');
  WA.opportunity.setSettings({ enabled: true, maxOpen: 4, defaultWindowMs: 60000 });
  return WA;
}
/** 顶层键 + 源面指纹（只读面与「零新写通道 / 源面零改写」判据全靠它）。 */
function shape(WA) {
  const st = WA.store.get();
  const out = [];
  out.push('k:' + Object.keys(st).sort().join(','));
  out.push('p:' + Object.keys(st.people || {}).sort().join(','));
  out.push('fs:' + (((st.memory || {}).foreshadows) || []).map(function (f) {
    return f.id + '/' + f.status + '/' + f.dueAt; }).join(','));
  out.push('g:' + (((((st.people || {})['p_甲'] || {}).life || {}).goals) || []).map(function (g) {
    return g.id + '/' + g.status; }).join(','));
  out.push('op:' + (((st.opportunity || {}).openings) || []).map(function (r) {
    return r.id + '/' + r.stage; }).join(','));
  return out.join('||');
}
function rec(WA) { return (WA.store.get().opportunity || {}).openings || []; }
/** 造一个「世界侧已记涉及谁」的来源（情报未核实），用于 not-entitled 与「谁被记进去」。 */
const INTEL = [{ id: 'I1', about: '修堤', claim: '堤要塌', source: '路人',
  level: 'report', confidence: 20, status: 'active' }];

// ── 判据（返回语义常量串；破坏只可能把它变成别的词）──────────────────
/** ① 四个必答项逐项落地。 */
function pItems(env) {
  const w = mkW(env.ov);
  const s = w.opportunity.sweep(700000);
  const blk = w.opportunity.buildBlock();
  const v = w.opportunity.view('op:promise:F1', { now: 700000 });
  const ok = blk.indexOf('由：') >= 0 && blk.indexOf('涉及：未记录') >= 0
    && blk.indexOf('窗口：本模块默认宽限 1 分钟（源未记期限）') >= 0 && blk.indexOf('忽略：') >= 0;
  return (ok && s.added === 1 && v.source === 'promise' && v.sourceLabel === '承诺逾期'
    && v.deadline === 0 && v.windowBasis === 'default' && v.active === true) ? OK.items
    : ('items:' + [s.added, v.windowBasis, v.deadline].join(','));
}
/** ② 两档窗口不混同：recorded 给 deadline 且结束时刻取源；default 一律 0。 */
function pWin2(env) {
  const w = mkW(env.ov, { factions: [{ name: '会', resources: {} }] });
  w.org.setSettings({ enabled: true });
  w.org.openProject('会', { what: '修堤', needs: '粮100', due: 1200000 });
  w.opportunity.sweep(700000);
  const v = w.opportunity.list({ now: 700000 });
  const p = v.filter(function (x) { return x.source === 'pressure'; })[0] || {};
  const d = v.filter(function (x) { return x.source === 'promise'; })[0] || {};
  return (p.windowBasis === 'recorded' && p.deadline === 1200000 && p.endAt === 1200000
    && d.windowBasis === 'default' && d.deadline === 0 && d.endAt === 760000)
    ? OK.win2 : ('win2:' + [p.windowBasis, p.deadline, p.endAt, d.windowBasis, d.deadline, d.endAt].join(','));
}
/** ③ 窗口真的会关：过末刻的作答被拒，且这次作废**落盘**、事后读得到。 */
function pWinClose(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  const def = w.opportunity.respond('op:promise:F1', 'defer', { by: 1, actor: '甲', now: 700000 });
  const shut = w.opportunity.respond('op:promise:F1', 'decline', { actor: '甲', now: 700002 });
  const v = w.opportunity.view('op:promise:F1', { now: 700002 });
  const row = rec(w).filter(function (r) { return r.id === 'op:promise:F1'; })[0] || {};
  return (def && def.ok && shut && !shut.ok && shut.reason === 'window-closed'
    && v.stage === 'lapsed' && v.windowClosed === true && !!row.lapsedAt) ? OK.winclose
    : ('winclose:' + [(def && def.ok), (shut && shut.reason), v.stage, v.windowClosed, row.lapsedAt].join(','));
}
/** ③′「这扇窗曾经关上过」不因被重开而消失。 */
function pWinClosedOnly(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  w.opportunity.sweep(2000000);              // 作废 + 源条件仍在 ⇒ 重开
  const v = w.opportunity.view('op:promise:F1', { now: 2000000 });
  return (v.stage === 'open' && v.reopens === 1 && v.windowClosed === true) ? OK.winclosed
    : ('winclosed:' + [v.stage, v.reopens, v.windowClosed].join(','));
}
/** ④ 世界不会因没人接而停摆；且不替玩家接。 */
function pWorldGoes(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  const s = w.opportunity.sweep(2000000);
  const v = w.opportunity.view('op:promise:F1', { now: 2000000 });
  const sv = w.opportunity.statView();
  return (s.lapsed === 1 && s.reopened === 1 && s.added === 0
    && v.stage === 'open' && v.reopens === 1 && v.active === true
    && sv.taken === 0 && rec(w).length === 1) ? OK.worldgoes
    : ('worldgoes:' + [s.lapsed, s.reopened, s.added, v.stage, v.reopens, sv.taken].join(','));
}
/** ④ 已接 / 已拒永不重开。 */
function pNoReopen(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  w.opportunity.respond('op:promise:F1', 'decline', { actor: '甲', now: 700000 });
  const s = w.opportunity.sweep(2000000);
  const v = w.opportunity.view('op:promise:F1', { now: 2000000 });
  return (v.stage === 'declined' && s.reopened === 0 && v.reopens === 0 && v.active === false)
    ? OK.noReopen : ('noreopen:' + [v.stage, s.reopened, v.reopens].join(','));
}
/** ⑤ 不知道就不给：涉及者之外不得作答（不入库、不再作答）。 */
function pEntitlement(env) {
  const w = mkW(env.ov, { fore: [], intel: INTEL });
  w.opportunity.sweep(700000);
  const rs = w.opportunity.list({ now: 700000 });
  if (!rs.length) return 'no-candidate';
  const id = rs[0].id;
  const bad = w.opportunity.respond(id, 'decline', { actor: '乙', now: 700000 });
  const ok = w.opportunity.respond(id, 'decline', { actor: '甲', now: 700000 });
  const v = w.opportunity.view(id, { now: 700000 });
  return (rs[0].actors.join('/') === '甲' && bad && bad.reason === 'not-entitled'
    && ok && ok.ok === true && v.stage === 'declined' && v.actor === '甲') ? OK.entitlement
    : ('ent:' + [rs[0].actors.join('/'), bad && bad.reason, ok && ok.ok, v.stage].join(','));
}
/** ⑥ 已答行留痕但不进注入块；源状态面零改写。 */
function pTraces(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  w.opportunity.respond('op:promise:F1', 'decline', { actor: '甲', now: 700000 });
  const all = w.opportunity.list({ all: true, now: 700000 });
  const act = w.opportunity.list({ now: 700000 });
  const blk = w.opportunity.buildBlock();
  const f = w.store.get().memory.foreshadows[0];
  return (all.length === 1 && act.length === 0 && all[0].stage === 'declined' && all[0].actor === '甲'
    && blk === '' && f.status === 'waiting' && f.dueAt === 1000) ? OK.traces
    : ('traces:' + [all.length, act.length, all[0] && all[0].stage, blk.length, f.status, f.dueAt].join(','));
}
/** ⑦ 容量有界且挤出有账。 */
function pCap(env) {
  const fore = [];
  for (let i = 0; i < 12; i++) fore.push({ id: 'F' + i, content: 'x' + i, status: 'waiting', dueAt: 1000 });
  const w = mkW(env.ov, { fore: fore });
  const s = w.opportunity.sweep(700000);
  const site = w.evict.evictStat().bySite['opportunity.openings'] || { evicts: 0, dropped: 0 };
  return (rec(w).length === 8 && s.added === 12 && site.evicts === 1 && site.dropped === 4
    && !!w.evict.siteDecls()['opportunity.openings']) ? OK.cap
    : ('cap:' + [rec(w).length, s.added, site.evicts, site.dropped].join(','));
}
/** ⑧ 同一机会反复扫描只有一个 id；两个机会不坍成一条。 */
function pIds(env) {
  const w = mkW(env.ov, { fore: [FO, { id: 'F2', content: '修路', status: 'waiting', dueAt: 1000 }] });
  w.opportunity.sweep(700000);
  const s2 = w.opportunity.sweep(700000);
  const ids = rec(w).map(function (r) { return r.id; }).sort().join(',');
  return (rec(w).length === 2 && s2.added === 0 && ids === 'op:promise:F1,op:promise:F2') ? OK.ids
    : ('ids:' + [rec(w).length, s2.added, ids].join(','));
}
/** ⑥ 延后必须显式给新窗口。 */
function pDefer(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  const r = w.opportunity.respond('op:promise:F1', 'defer', { actor: '甲', now: 700000 });
  const v = w.opportunity.view('op:promise:F1', { now: 700000 });
  return (r && !r.ok && r.reason === 'missing-window' && v.stage === 'open' && v.active === true)
    ? OK.defer : ('defer:' + [(r && r.reason), v.stage].join(','));
}
/** ⑥ 玩家给的延长期不许被下一次扫描无声改掉（只有 open 行才刷新窗口起点）。 */
function pOpenSet(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  const def = w.opportunity.respond('op:promise:F1', 'defer', { by: 3600000, actor: '甲', now: 700000 });
  const mid = w.opportunity.view('op:promise:F1', { now: 1000000 });
  w.opportunity.sweep(1000000);
  const v = w.opportunity.view('op:promise:F1', { now: 1000000 });
  return (def && def.ok && mid.stage === 'deferred' && mid.windowMs === 3600000
    && v.stage === 'deferred' && v.windowMs === 3600000 && v.endAt === 4300000) ? OK.opensetWin
    : ('opensetwin:' + [(def && def.ok), v.stage, v.windowMs, v.endAt].join(','));
}
/** ⑩ 只读面零写副作用。 */
function pReadOnly(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  const b = shape(w);
  w.opportunity.list({ all: true, now: 700000 });
  w.opportunity.view('op:promise:F1', { now: 700000 });
  w.opportunity.collect(700000);
  w.opportunity.buildBlock();
  w.opportunity.statView();
  w.opportunity.stat();
  return shape(w) === b ? OK.readonly : 'write!';
}
/** ⑨ 扫描与作答都不改源面，也不新增顶层键。 */
function pNoSrc(env) {
  const w = mkW(env.ov);
  const keys = Object.keys(w.store.get()).sort().join(',');
  const before = shape(w);
  w.opportunity.sweep(700000);
  w.opportunity.respond('op:promise:F1', 'take', { actor: '甲', kind: 'wait', goalId: 'g1', now: 700000 });
  const after = shape(w);
  const f = w.store.get().memory.foreshadows[0];
  const bq = before.split('||'), aq = after.split('||');
  return (keys === Object.keys(w.store.get()).sort().join(',')
    && bq[2] === aq[2] && bq[3] === aq[3] && bq[1] === aq[1]
    && f.status === 'waiting' && f.dueAt === 1000) ? OK.nosrc
    : ('nosrc:' + [bq[2], aq[2], bq[3], aq[3], f.status].join(','));
}
/** ⑪ 登记进册的机会行会落盘：换一个实例重载后仍在册。 */
function pPersist(env) {
  const w = mkW(env.ov);
  w.opportunity.sweep(700000);
  const w2 = fresh(env.ov ? { srcOverride: env.ov } : {});
  const v = w2.opportunity.view('op:promise:F1', { now: 700000 });
  return (v.ok === true && v.stage === 'open' && v.windowBasis === 'default') ? OK.persist
    : ('persist:' + [v.ok, v.reason, v.stage, v.windowBasis].join(','));
}
/** ⑫ 未知配方拒收且不回落（档位与题材真源一致）。 */
function pRecUnknown(env) {
  const w = mkW(env.ov);
  w.recipe.apply('');
  const first = w.recipe.apply('urban');
  const pv = w.recipe.preview('nope');
  const ap = w.recipe.apply('nope');
  const cur = w.recipe.statView().name;
  return (first && first.ok && first.themes.join('+') === 'urban+campus'
    && pv && pv.reason === 'unknown-recipe' && ap && ap.reason === 'unknown-recipe'
    && cur === 'urban' && pv.known.length === 4) ? OK.recUnknown
    : ('recunk:' + [(first && first.themes), pv && pv.reason, ap && ap.reason, cur].join(','));
}
/** ⑫ 题材被真源拒收即不写半截。 */
function pRecTheme(env) {
  const w = mkW(env.ov);
  w.recipe.apply('');
  const saved = w.theme.THEMES.campus;
  delete w.theme.THEMES.campus;
  const r = w.recipe.apply('urban');
  const cur = w.recipe.statView().name;
  w.theme.THEMES.campus = saved;
  return (r && !r.ok && r.reason === 'theme-refused' && r.themeReason === 'unknown-theme'
    && r.name === 'urban' && !cur) ? OK.recTheme
    : ('rectheme:' + [(r && r.ok), r && r.reason, r && r.themeReason, cur].join(','));
}
/** ⑫ 随机源不可用时仍可显式取场景（不假装随机成功也不整体崩）。 */
function pRecSeed(env) {
  const w = mkW(env.ov);
  w.recipe.apply('urban');
  const saved = w.rand.int;
  let s = null;
  try {
    w.rand.int = function () { throw new Error('no-rand'); };
    s = w.recipe.seed('urban');
  } finally { w.rand.int = saved; }
  const s2 = w.recipe.seed('urban', 1);
  return (s && s.ok && s.index === 0 && s.scene.id === 'urban-double-book'
    && s2.ok && s2.index === 1 && s2.count === 3) ? OK.recSeed
    : ('recseed:' + [(s && s.index), (s && s.scene && s.scene.id), (s2 && s2.index)].join(','));
}
/** ⑭ 规则冲突只报不改（题材叠加 + 政策并存）。 */
function pRecConflict(env) {
  const w = mkW(env.ov);
  const cat = w.recipe.catalogView();
  const tm = w.recipe.themeClashes(['mystery', 'fantasy']);
  const po = w.recipe.policyClashes(['intel-source', 'improv']);
  return (cat.themeClash.length === 2 && tm.length === 1 && tm[0].id === 'double-blackbox'
    && po.length === 1 && po[0].id === 'improv|intel-source') ? OK.recConflict
    : ('recconf:' + [cat.themeClash.length, tm.length, tm[0] && tm[0].id, po[0] && po[0].id].join(','));
}
/** ⑬ 基础事实三态：通过 / 未核 / 落空 —— 三个不同的词，各有各的入口。 */
function pRecBasics(env) {
  const w = mkW(env.ov);
  const realStale = w.recipe.basicsStale().length;
  const realUnver = w.recipe.basicsUnverified().length;
  const uninj = w.recipe.basics();
  // 源码面由**显式传参**点亮（产品面不读任何全局名）：传真读盘 ⇒ verified；
  //   传垃圾 ⇒ 锚点当场查不到 ⇒ no-symbol（落空）。
  const good = w.recipe.basics({ readSrc: function (f) { return readSrc(f); } });
  const bad = w.recipe.basicsStale({ readSrc: function () { return 'garbage'; } });
  const live = uninj[0].evidence.map(function (e) { return e.live ? 1 : 0; }).join('');
  const okAll = realStale === 0 && realUnver === 3 && uninj.length === 3
    && uninj.every(function (b) { return b.state === 'unverified'; })
    && good.every(function (b) { return b.state === 'verified'; })
    && good.every(function (b) { return b.evidence.every(function (e) { return e.hits === 1; }); })
    && bad.length === 3 && bad.join('/') === 'worldFacts/time/identity' && live === '11';
  return okAll ? OK.recBasics
    : ('recbas:' + [realStale, realUnver, uninj[0] && uninj[0].state,
      good && good[0] && good[0].state, bad && bad.length, live].join(','));
}
/** ⑬ 未核不许被当成落空、也不许被当成通过：同一个面在三种注入下读数互异，且用完能复原。 */
function pRecGuess(env) {
  const w = mkW(env.ov);
  const none = w.recipe.basicsStale().length;
  const noneUnver = w.recipe.basicsUnverified().length;
  const bad = w.recipe.basicsStale({ readSrc: function () { return 'garbage'; } }).length;
  const after = w.recipe.basicsStale().length;   // 不再注入 ⇒ 回到「未核」，不是落空
  return (none === 0 && noneUnver === 3 && bad === 3 && after === 0) ? OK.recGuess
    : ('recguess:' + [none, noneUnver, bad, after].join(','));
}
/** ⑭ 预览不写盘；边界与验收样本如实下发。 */
function pRecPreview(env) {
  const w = mkW(env.ov);
  w.recipe.apply('');
  const pv = w.recipe.preview('urban');
  const cur = w.recipe.statView().name;
  return (pv && pv.ok && pv.wrote === null && !cur && pv.boundaries.length === 3
    && pv.acceptance.length === 4 && Object.keys(pv.scenes[0]).sort().join(',') === 'id,title') ? OK.recPreview
    : ('recpv:' + [(pv && pv.wrote), cur, (pv && pv.boundaries.length), (pv && pv.scenes[0] && Object.keys(pv.scenes[0]).join('/'))].join(','));
}
/** ⑭ 场景种子只有 id/title/prompt（不含人名与世界设定）；本模块无注入面、零静态漂移。 */
function pRecBound(env) {
  const w = mkW(env.ov);
  const sc = w.recipe.RECIPES.urban.scenes[0];
  const pv = w.recipe.preview('survival');
  const v = w.recipe.statView();
  return (Object.keys(sc).sort().join(',') === 'id,prompt,title'
    && Object.keys(pv.scenes[0]).sort().join(',') === 'id,title'
    && pv.boundaries.length === 3 && pv.acceptance.length === 4
    && w.recipe.RECIPES.urban.scenes.length === 3 && typeof w.recipe.buildBlock === 'undefined'
    && v.staleness.total === 0 && v.basicsStale.length === 0) ? OK.recBound
    : ('recbnd:' + [Object.keys(sc).sort().join(','), (v.staleness && v.staleness.total), (v.basicsStale || []).length].join(','));
}

// ── 正向判据 ──────────────────────────────────────────────────────────
function chk(a, fn, okk, label) {
  const got = probeClean(fn);
  a(got === okk, label + ' :: ' + got);
}
function judge(a) {
  chk(a, pItems, OK.items, 'v2117/b6: [1] 四个必答项逐项落地（未记涉及谁就印未记录）');
  chk(a, pWin2, OK.win2, 'v2117/b6: [2] 两档窗口不混同（源记期限者给 deadline 且结束取源）');
  chk(a, pWinClose, OK.winclose, 'v2117/b6: [3] 过窗口末刻的作答被拒，且这次作废真落盘');
  chk(a, pWinClosedOnly, OK.winclosed, 'v2117/b6: [4] 作废后重开，仍读得到「这扇窗曾经关过」');
  chk(a, pWorldGoes, OK.worldgoes, 'v2117/b6: [5] 源条件仍在 ⇒ 作废后重新敲门，且不替玩家接');
  chk(a, pEntitlement, OK.entitlement, 'v2117/b6: [6] 世界侧记了涉及谁 ⇒ 之外的人 not-entitled');
  chk(a, pTraces, OK.traces, 'v2117/b6: [7] 已答行留痕但不进注入块；源状态面零改写');
  chk(a, pCap, OK.cap, 'v2117/b6: [8] 容量有界且挤出有账（溢出环形挤出、站点已登记）');
  chk(a, pNoReopen, OK.noReopen, 'v2117/b6: [9] 已接 / 已拒永不重开（那是玩家的明确决定）');
  chk(a, pIds, OK.ids, 'v2117/b6: [10] 同一机会反复扫描只有一个 id，两个机会不坍成一条');
  chk(a, pDefer, OK.defer, 'v2117/b6: [11] 延后必须显式给新窗口（先放着与没看见可分辨）');
  chk(a, pOpenSet, OK.opensetWin, 'v2117/b6: [12] 玩家给的延长期不被下一次扫描无声改掉');
  chk(a, pReadOnly, OK.readonly, 'v2117/b6: [12] 只读面零写副作用');
  chk(a, pNoSrc, OK.nosrc, 'v2117/b6: [13] 零新写通道、源面三处逐项未被改写');
  chk(a, pPersist, OK.persist, 'v2117/b6: [14] 登记进册的机会行落盘，重载后仍在册');
  chk(a, pRecUnknown, OK.recUnknown, 'v2117/b6: [15] 未知配方拒收且不回落（题材组合交既有真源）');
  chk(a, pRecTheme, OK.recTheme, 'v2117/b6: [16] 题材被真源拒收即不留半截');
  chk(a, pRecSeed, OK.recSeed, 'v2117/b6: [17] 随机源不可用时仍可显式取场景（不整体崩）');
  chk(a, pRecConflict, OK.recConflict, 'v2117/b6: [18] 规则冲突只报不改（题材叠加 + 政策并存）');
  chk(a, pRecBasics, OK.recBasics, 'v2117/b6: [19] 基础事实三态：通过 / 未核 / 落空三个不同的词');
  chk(a, pRecGuess, OK.recGuess, 'v2117/b6: [20] 只有查不到才记落空（未核不当落空、也不当通过）');
  chk(a, pRecPreview, OK.recPreview, 'v2117/b6: [21] 预览不写盘，边界与验收样本如实下发');
  chk(a, pRecBound, OK.recBound, 'v2117/b6: [22] 场景种子只有 id/title/prompt（不含人名与世界设定）');

  // 两档不互换：改本模块宽限只动 default 档，recorded 档的结束时刻一个字都不动
  {
    const w = mkW(null, { factions: [{ name: '会', resources: {} }] });
    w.org.setSettings({ enabled: true });
    w.org.openProject('会', { what: '修堤', needs: '粮100', due: 1200000 });
    const b = w.opportunity.sweep(700000);
    const before = w.opportunity.list({ now: 700000 });
    w.opportunity.setSettings({ defaultWindowMs: 600000 });       // 只动本模块宽限
    w.opportunity.sweep(700000);                                  // 再扫一次，让在途行吃上新宽限
    const after = w.opportunity.list({ now: 700000 });
    const pick = function (rows, src) { return rows.filter(function (x) { return x.source === src; })[0] || {}; };
    const p = pick(after, 'pressure'), d = pick(after, 'promise');
    a(b.ok && pick(before, 'pressure').endAt === pick(after, 'pressure').endAt
      && p.windowBasis === 'recorded' && p.deadline === 1200000 && p.endAt === 1200000
      && d.windowBasis === 'default' && d.deadline === 0 && d.endAt === 1300000,
      'v2117/b6: [23] 改本模块宽限只动 default 档（recorded 档的结束时刻一个字都不动）:: '
      + [p.endAt, d.endAt].join(','));
  }
}

// ── 负向自证 ──────────────────────────────────────────────────────────
const N1 = [
  { k: 'ent2',        p: pEntitlement,   okk: OK.entitlement,   note: '涉及者之外也能答 ⇒ 信息差被架空' },
  { k: 'windl',       p: pWin2,          okk: OK.win2,          note: '读数恒不给期限 ⇒ 两档在读数里长得一样' },
  { k: 'deadf',       p: pWin2,          okk: OK.win2,          note: '登记时丢掉源期限 ⇒ 从入口就混成一档' },
  { k: 'sclose',      p: pWorldGoes,     okk: OK.worldgoes,     note: '扫描不再作废过期窗口 ⇒ 在途只增不减' },
  { k: 'sclose2',     p: pWinClose,      okk: OK.winclose,      note: '答得太晚时放弃整笔事务 ⇒ 作废标记被回滚' },
  { k: 'rowclose',    p: pWinClosedOnly, okk: OK.winclosed,     note: '「此刻点过没有」冒充「曾经关过」⇒ 作废读不到' },
  { k: 'reopen',      p: pWorldGoes,     okk: OK.worldgoes,     note: '源条件仍在也不重开 ⇒ 世界因没人接而悄悄停' },
  { k: 'openset',     p: pOpenSet,       okk: OK.opensetWin,    note: '延后的行也被扫描刷新 ⇒ 玩家给的延长期被改掉' },
  { k: 'evict',       p: pCap,           okk: OK.cap,           note: '溢出不做环形挤出 ⇒ 长局只增不减' },
  { k: 'idof',        p: pIds,           okk: OK.ids,           note: 'id 不含稳定引用 ⇒ 两个机会坍成一条' },
  { k: 'defer',       p: pDefer,         okk: OK.defer,         note: '延后不必给新窗口 ⇒ 先放着与没看见分不出' },
  { k: 'actors',      p: pEntitlement,   okk: OK.entitlement,   note: '来源侧不记涉及谁 ⇒ not-entitled 永不触发' },
  { k: 'nodesc',      p: pItems,         okk: OK.items,         note: '没记涉及谁时替人编一个 ⇒ 自己造了一个答案' },
  { k: 'b_unk',       p: pRecUnknown,    okk: OK.recUnknown,    note: '未知配方回落成清空 ⇒ 启用与没启用长得一样' },
  { k: 'b_theme',     p: pRecTheme,      okk: OK.recTheme,      note: '题材被拒也照落配方名 ⇒ 档位与生效题材对不上' },
  { k: 'b_seed',      p: pRecSeed,       okk: OK.recSeed,       note: '无随机源时直接抛 ⇒ 取场景整体不可用' },
  { k: 'b_conf',      p: pRecConflict,   okk: OK.recConflict,   note: '政策冲突表不被读 ⇒ 冲突预览照不到它' },
  { k: 'b_state',     p: pRecBasics,     okk: OK.recBasics,     note: '锚点查不到也印通过 ⇒ 三态里少掉落空' },
  { k: 'b_staleonly', p: pRecGuess,      okk: OK.recGuess,      note: '未核算进落空 ⇒ 正常仓库每跑都报三条假落空' },
  { k: 'b_unveronly', p: pRecGuess,      okk: OK.recGuess,      note: '未核面印成落空面 ⇒ 把「没核过」说成「对不上」' },
  { k: 'b_wrote',     p: pRecPreview,    okk: OK.recPreview,    note: '预览竟然写盘 ⇒ 与「预览只报不改」冲突' },
  { k: 'b_bound',     p: pRecBound,      okk: OK.recBound,      note: '信息边界不下发 ⇒ 看不到「本不该知道什么」' }
];
const N3 = [
  ['ent2',        pWin2,        OK.win2,        '涉及者闸破坏不影响两档窗口'],
  ['windl',       pWinClose,    OK.winclose,    '读数闸破坏不影响窗口关闭'],
  ['deadf',       pWinClose,    OK.winclose,    '登记闸破坏不影响窗口关闭'],
  ['sclose',      pNoReopen,    OK.noReopen,    '扫描作废闸破坏不影响已拒不重开'],
  ['sclose2',     pWin2,        OK.win2,        '事务放弃闸破坏不影响两档窗口'],
  ['rowclose',    pWorldGoes,   OK.worldgoes,   '读数作废闸破坏不影响世界继续'],
  ['reopen',      pNoReopen,    OK.noReopen,    '重开闸破坏不影响已拒不重开'],
  ['openset',     pNoReopen,    OK.noReopen,    '窗口刷新闸破坏不影响已拒不重开'],
  ['evict',       pIds,         OK.ids,         '挤出闸破坏不影响 id 稳定性'],
  ['idof',        pCap,         OK.cap,         'id 构造破坏不影响容量有界'],
  ['defer',       pTraces,      OK.traces,      '延后闸破坏不影响留痕与源面'],
  ['actors',      pCap,         OK.cap,         '来源涉及者破坏不影响容量有界'],
  ['nodesc',      pCap,         OK.cap,         '描述回落破坏不影响容量有界'],
  ['b_unk',       pRecConflict, OK.recConflict, '未知配方闸破坏不影响冲突预览'],
  ['b_theme',     pRecUnknown,  OK.recUnknown,  '题材闸破坏不影响未知配方拒收'],
  ['b_seed',      pRecPreview,  OK.recPreview,  '取场景闸破坏不影响预览不写盘'],
  ['b_conf',      pRecBasics,   OK.recBasics,   '冲突表破坏不影响基础事实三态'],
  ['b_state',     pRecPreview,  OK.recPreview,  '状态归类破坏不影响预览不写盘'],
  ['b_staleonly', pRecPreview,  OK.recPreview,  '落空面破坏不影响预览不写盘'],
  ['b_unveronly', pRecPreview,  OK.recPreview,  '未核面破坏不影响预览不写盘'],
  ['b_wrote',     pRecUnknown,  OK.recUnknown,  '预览写盘闸破坏不影响配方拒收'],
  ['b_bound',     pRecConflict, OK.recConflict, '边界闸破坏不影响冲突预览']
];
const OKPROBE = { items: pItems, win2: pWin2, winclose: pWinClose, winclosed: pWinClosedOnly,
  worldgoes: pWorldGoes, entitlement: pEntitlement, traces: pTraces, cap: pCap, noReopen: pNoReopen,
  ids: pIds, defer: pDefer, opensetWin: pOpenSet, readonly: pReadOnly, nosrc: pNoSrc,
  persist: pPersist,
  recUnknown: pRecUnknown, recTheme: pRecTheme, recSeed: pRecSeed, recConflict: pRecConflict,
  recBasics: pRecBasics, recGuess: pRecGuess, recPreview: pRecPreview, recBound: pRecBound };

function runNegative(a) {
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2117/b6: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  a(BROKEN.length === 22 && new Set(BROKEN.map(function (x) { return x.key; })).size === 22,
    'v2117/b6: [N0] 破坏面覆盖 22 个互异锚点');
  a(BROKEN.filter(function (s) { return s.rel === REL_O; }).length === 13 &&
    BROKEN.filter(function (s) { return s.rel === REL_R; }).length === 9,
    'v2117/b6: [N0] 两个落点的破坏面分列（opportunity 13 / recipe 9）');
  N1.forEach(function (it) {
    a(probeWith(BROKEN[B[it.k]], it.p) !== it.okk, 'v2117/b6: [N1] ' + it.note + '（缺口复现）');
  });
  Object.keys(OK).forEach(function (k) {
    a(probeClean(OKPROBE[k]) === OK[k], 'v2117/b6: [N2] 原版成立 :: ' + k);
  });
  N3.forEach(function (t) {
    a(probeWith(BROKEN[B[t[0]]], t[1]) === t[2], 'v2117/b6: [N3] ' + t[3]);
  });
  a(probeWith(BROKEN[B.evict], pReadOnly) === OK.readonly,
    'v2117/b6: [N4] 对照：挤出闸破坏后只读面仍零写副作用');
  const chg = (function () {
    const w = mkW(null);
    const b = rec(w).length;
    w.opportunity.sweep(700000);
    return b + '>' + rec(w).length;
  })();
  a(chg === '0>1', 'v2117/b6: [N4] 扫描真的改变状态（判据非恒真，实 ' + chg + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('B6-OPPORTUNITY-V2117: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('B6-OPPORTUNITY-V2117: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL_O, anchorHits: anchorHits };