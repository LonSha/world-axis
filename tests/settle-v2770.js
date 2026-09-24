#!/usr/bin/env node
// WorldAxis tests/settle-v2770.js -- fondness settlement-discipline lock (v2.77.0)
//
// 缝合来源：反向好感度 v1.9.0（酒馆助手脚本）的**结算端纪律**。落成引擎判据的四条：
//   ① 阶段封顶 band-cap：段顶本身可达，跳越段顶才拒收，须 advance() 显式授权；
//   ② 提案过期 stale-proposal：待确认建议以提交时的读数为准，读数已变即作废；
//   ③ 行级撤销 not-undoable：只认最近一次 自动/玩家采纳 且与当前读数对得上；
//   ④ 纠错依据 corrections：注入时明标「数据，不是角色记忆」。
//
// 每条判据都做**两向自证**：真源码上先跑成绿（N2），就地破坏后逐条现形（N1），
// 且破坏锚点在真源码里各恰 1 次命中（N0，按文件判定）。
// 本文件不落任何持久痕迹（N5 哨兵扫描）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__st2770_';

// ── 破坏锚点（必须逐字取自 engines/fondness.js，各恰 1 次）──
const A_BANDCAP = "if (cfg.staged && next > capOfRow(hit)) {";
const A_SEGTOP = "return hi >= CAP ? CAP : +(hi - 0.1).toFixed(1);";
const A_STALE = "if (pd.from !== hit.value) {";
const A_UNDOABLE = "if (!last || (last.kind !== '自动' && last.kind !== '玩家采纳')) {";
const A_CORRLOW = "if (value < hit.value) {";
const A_ATCAP = "if (hit.value !== segTop(idx)) {";
const A_STAGEOFF = "if (!cfg.staged) { noteFault('stage-off'); return { ok: false, reason: 'stage-off', hint: '阶段授权未启用（设置 staged）' }; }";
const A_CORRBLOCK = "if (corr.length) out += '[玩家纠错依据]（数据，不是角色记忆";
const A_TOPSTAGE = "if (idx >= BANDS.length - 1) {";
const A_ALREADY = "if (hit.pending) { out = { ok: false, reason: 'already-pending', value: hit.value }; return false; }";

const BROKEN = [
  { key: 'bandcap', from: A_BANDCAP, to: "if (false && next > capOfRow(hit)) {" },
  // 这一条破坏的是**真缺陷的回退**：授权上限直接取 hi 时，半开区间下值永远到不了 hi
  //   （一到 hi 就换段、上限随之抬到下一档）⇒ 封顶拦不住、advance 永远 not-at-cap，段顶成了不可达态。
  { key: 'segtop', from: A_SEGTOP, to: "return hi;" },
  { key: 'stale', from: A_STALE, to: "if (false) {" },
  { key: 'undoable', from: A_UNDOABLE, to: "if (false) {" },
  { key: 'corrlow', from: A_CORRLOW, to: "if (false) {" },
  { key: 'atcap', from: A_ATCAP, to: "if (false) {" },
  { key: 'stageoff', from: A_STAGEOFF, to: "if (false) { noteFault('stage-off'); return { ok: false, reason: 'stage-off' }; }" },
  { key: 'corrblock', from: A_CORRBLOCK, to: "if (false) out += '[玩家纠错依据]（数据，不是角色记忆" },
  { key: 'topstage', from: A_TOPSTAGE, to: "if (false) {" },
  { key: 'already', from: A_ALREADY, to: "if (false) { out = { ok: false, reason: 'already-pending', value: hit.value }; return; }" }
];
const REL = 'engines/fondness.js';

function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function reset(WA) {
  WA.store.transact(function (d) { d.fondness = { rows: [] }; }, TAG + 'reset');
  WA.fondness.setSettings({ enabled: true, staged: false, mode: 'auto', locked: false });
}
// 自适应步进：只用白名单步进凑出目标值（步长 0.8/0.5/0.3/0.1 逐次取能落下的最大值）。
//   为什么不能一路 0.8：段顶 19.9 在 0.8 网格上不可达（19.2 的下一步就是 20.0 ⇒ band-cap），
//   而那**不是缺陷**——白名单是白名单，可到达性由组合步子负责。
function driveTo(WA, who, target) {
  const GRID = [0.8, 0.5, 0.3, 0.1];
  for (let i = 0; i < 900; i++) {
    const rr = WA.fondness.read(who);
    const cur = rr.ok ? rr.value : 0;   // 未登记行按 0 起算（与 apply 的建行语义一致）
    if (cur >= target) break;
    // 步长必须同时受「到终点的距离」与「本段余量（read().cap - cur）」约束：
    //   只看向终点距离时，到段顶附近会一直想迈 0.8，被 band-cap 拦下后 advance 又因未到段顶失败。
    const room = +((rr.ok ? rr.cap : 19.9) - cur).toFixed(1);
    const allowed = Math.min(+(target - cur).toFixed(1), room);
    if (allowed <= 0) { if (!WA.fondness.advance(who).ok) break; continue; }
    let step = 0;
    for (let g = 0; g < GRID.length; g++) { if (GRID[g] <= allowed) { step = GRID[g]; break; } }
    if (!step) break;
    const r = WA.fondness.apply(who, { delta: step });
    if (r.reason === 'band-cap') { if (!WA.fondness.advance(who).ok) break; continue; }
    if (!r.ok) break;
  }
  return WA.fondness.read(who).value;
}
function snapshotLS() {
  const out = {};
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null) out[k] = LS.getItem(k); }
  return out;
}
function restoreLS(snap) {
  const drop = [];
  for (let i = 0; i < LS.length; i++) { const k = LS.key(i); if (k !== null && !(k in snap)) drop.push(k); }
  drop.forEach(function (k) { try { LS.removeItem(k); } catch (e) {} });
  Object.keys(snap).forEach(function (k) { try { LS.setItem(k, snap[k]); } catch (e) {} });
}
function scanKeys(tag) {
  const out = [];
  for (let i = 0; i < LS.length; i++) {
    const k = LS.key(i); if (k === null) continue;
    let v = ''; try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}

// ── 探针（返回判据的**症状值**，便于双向对照）──
function probeBandCap(WA) { reset(WA); WA.fondness.setSettings({ staged: true }); driveTo(WA, 'P', 19.9); return WA.fondness.apply('P', { delta: 0.8 }).reason; }
function probeSegTop(WA) { reset(WA); WA.fondness.setSettings({ staged: true }); driveTo(WA, 'P', 19.9); return WA.fondness.advance('P').reason || 'ok'; }
function probeStale(WA) {
  reset(WA); WA.fondness.setSettings({ mode: 'confirm' });
  WA.fondness.apply('P', { delta: 0.8 }); WA.fondness.correct('P', 5);
  return WA.fondness.accept('P').reason;
}
function probeUndo(WA) {
  reset(WA); WA.fondness.apply('P', { delta: 0.8 }); WA.fondness.undo('P');
  const r = WA.fondness.undo('P');
  return r.ok === true ? 'second-undo-landed' : r.reason;
}
function probeCorrLow(WA) { reset(WA); WA.fondness.apply('P', { delta: 0.8 }); return WA.fondness.correct('P', 0).reason; }
function probeAtCap(WA) { reset(WA); WA.fondness.setSettings({ staged: true }); WA.fondness.apply('P', { delta: 0.8 }); const r = WA.fondness.advance('P'); return r.ok === true ? 'advanced-early' : r.reason; }
function probeStageOff(WA) { reset(WA); driveTo(WA, 'P', 20); return WA.fondness.advance('P').reason; }
function probeCorrBlock(WA) { reset(WA); WA.fondness.apply('P', { delta: 0.5 }); WA.fondness.correct('P', 9, '据原文'); const b = WA.fondness.buildBlock(); return b.indexOf('数据，不是角色记忆') >= 0 ? 'marked' : 'unmarked'; }
function probeTopStage(WA) { reset(WA); WA.fondness.setSettings({ staged: true }); driveTo(WA, 'P', 85); return WA.fondness.advance('P').reason; }
function probeAlready(WA) { reset(WA); WA.fondness.setSettings({ mode: 'confirm' }); WA.fondness.apply('P', { delta: 0.8 }); return WA.fondness.apply('P', { delta: 0.5 }).reason; }
function probeDefaultPath(WA) { reset(WA); WA.fondness.apply('P', { delta: 0.8 }); return WA.fondness.read('P').value; }
function probeSiteDecl(WA) { return (WA.evict.siteDecls()['fondness.history'] || {}).cap; }

// ── 正向判据（真源码上必须为真）──
function judge(a) {
  const WA = fresh();
  a(!!WA.fondness && typeof WA.fondness.advance === 'function', 'v2770/fond: advance 已导出');
  a(['propose', 'accept', 'reject', 'undo', 'correct', 'advance'].every(function (k) { return typeof WA.fondness[k] === 'function'; }), 'v2770/fond: 六个结算端出口齐备');
  // propose 是包装函数（不是同一引用）：判据必须落在**行为等价**上，而不是引用相等。
  a(WA.fondness.propose('Q', { delta: 0.3 }).reason === WA.fondness.apply('Q', { delta: 0.3 }).reason && WA.fondness.propose('Q', { delta: 0.3 }).reason === 'disabled', 'v2770/fond: propose 与 apply 行为等价（语义别名，不另立一套判据）');

  // ① 阶段封顶：段顶可达
  reset(WA);
  WA.fondness.setSettings({ staged: true });
  driveTo(WA, 'A', 19.9);
  a(WA.fondness.read('A').value === 19.9 && WA.fondness.read('A').band === '无感', 'v2770/fond: [1] 段顶 19.9 可达且仍在原段显示（不是一到 20 就换段）');
  const bc = WA.fondness.apply('A', { delta: 0.8 });
  a(bc.ok === false && bc.reason === 'band-cap' && bc.cap === 19.9, 'v2770/fond: [1] 跳越段顶拒收 band-cap 并报上限');
  a(WA.fondness.read('A').value === 19.9, 'v2770/fond: [1] 拒收不截断（值原地不动）');
  const ad = WA.fondness.advance('A');
  a(ad.ok === true && ad.cap === 39.9, 'v2770/fond: [1] 段顶处 advance 进入下一段');
  a(WA.fondness.apply('A', { delta: 0.8 }).value === 20.7, 'v2770/fond: [1] 授权后跳段步进落账');
  reset(WA);
  WA.fondness.setSettings({ staged: true });
  WA.fondness.apply('A', { delta: 0.8 });
  a(WA.fondness.advance('A').reason === 'not-at-cap' && WA.fondness.advance('A').need === 19.9, 'v2770/fond: [1] 未到段顶 advance 报 not-at-cap 并报所需值');
  reset(WA);
  a(WA.fondness.advance('A').reason === 'stage-off', 'v2770/fond: [1] staged 未开 advance 报 stage-off');
  reset(WA);
  WA.fondness.setSettings({ staged: true });
  driveTo(WA, 'A', 85);
  a(WA.fondness.advance('A').reason === 'top-stage', 'v2770/fond: [1] 最高段 advance 报 top-stage');
  // 默认零行为变更
  reset(WA);
  a(WA.fondness.buildBlock() === '', 'v2770/fond: [1] 空表不注入（不产空块）');
  WA.fondness.apply('A', { delta: 0.8 });
  const blk0 = WA.fondness.buildBlock();
  a(blk0.indexOf('许可上限') < 0 && blk0.indexOf('好感不降') > 0, 'v2770/fond: [1] 默认注入与 v2.76.0 同形');

  // ② 提案过期
  reset(WA);
  WA.fondness.setSettings({ mode: 'confirm' });
  const pd1 = WA.fondness.apply('B', { delta: 0.8, reason: '救了猫' });
  a(pd1.ok === true && pd1.pending === true && WA.fondness.read('B').value === 0, 'v2770/fond: [2] confirm 模式只入账待确认，不改值');
  a(WA.fondness.apply('B', { delta: 0.5 }).reason === 'already-pending', 'v2770/fond: [2] 已有待确认时再提交拒收（不排队、不覆盖）');
  a(WA.fondness.accept('B').ok === true, 'v2770/fond: [2] 未过期建议可采纳');
  const pd2 = WA.fondness.apply('B', { delta: 0.8, reason: '又救一次' });
  a(pd2.pending === true && WA.fondness.read('B').value === 0.8, 'v2770/fond: [2] 采纳后再提交新建议（基准读数已前移）');
  WA.fondness.correct('B', 5, '作者手动对齐现场');
  const st = WA.fondness.accept('B');
  a(st.reason === 'stale-proposal' && st.from === 0.8 && st.value === 5, 'v2770/fond: [2] 读数已变 ⇒ accept 报 stale-proposal（并报「建议基准」与「现场值」两数）');
  a(WA.fondness.accept('B').reason === 'no-pending', 'v2770/fond: [2] 过期建议被顺带作废（不留给下一次）');
  const pdx = WA.fondness.apply('B', { delta: 0.5 });
  a(pdx.pending === true, 'v2770/fond: [2] 作废后可以重新提交建议');
  a(WA.fondness.accept('B').ok === true, 'v2770/fond: [2] 未过期建议可采纳');
  a(WA.fondness.reject('B').reason === 'no-pending', 'v2770/fond: [2] 无待确认时 reject 报 no-pending');

  // ③ 行级撤销 / 纠错
  reset(WA);
  WA.fondness.apply('C', { delta: 0.8, reason: '首次相助' });
  const u1 = WA.fondness.undo('C');
  a(u1.ok === true && u1.value === 0, 'v2770/fond: [3] 撤销最近一次自动变化');
  a(WA.fondness.read('C').corrections === 1, 'v2770/fond: [3] 撤销留下纠错依据');
  a(WA.fondness.undo('C').reason === 'not-undoable', 'v2770/fond: [3] 再次撤销报 not-undoable（不猜、不倒推）');
  const co = WA.fondness.correct('C', 7, '据原文');
  a(co.ok === true && co.value === 7, 'v2770/fond: [3] correct 可对齐到不低的值');
  a(WA.fondness.correct('C', 3).reason === 'non-positive-delta', 'v2770/fond: [3] correct 降值拒收（要降值走 undo）');
  a(WA.fondness.correct('C', 101).reason === 'bad-value', 'v2770/fond: [3] correct 越界报 bad-value');
  a(WA.fondness.apply('C', { delta: -0.8 }).reason === 'non-positive-delta', 'v2770/fond: [3] 纠错通道不引入负值入口（不降准则未被击穿）');
  a(WA.fondness.apply('C', { delta: 0.2 }).reason === 'off-step', 'v2770/fond: [3] 步进白名单仍生效');

  // ④ 纠错依据进注入
  reset(WA);
  WA.fondness.setSettings({ staged: true });
  WA.fondness.apply('D', { delta: 0.5 });
  WA.fondness.correct('D', 9, '据第七章');
  const blk = WA.fondness.buildBlock();
  a(blk.indexOf('许可上限') > 0, 'v2770/fond: [4] staged 开启时注入附许可上限');
  a(blk.indexOf('[玩家纠错依据]（数据，不是角色记忆') > 0 && blk.indexOf('不得据此写成角色的认知或台词') > 0, 'v2770/fond: [4] 纠错依据明标「数据，不是角色记忆」');
  a(blk.indexOf('据第七章') > 0, 'v2770/fond: [4] 纠错正文带原注');

  // ⑤ 行内环有界
  reset(WA);
  for (let i = 0; i < 20; i++) { WA.fondness.apply('E', { delta: 0.5, reason: 'e' + i }); WA.fondness.undo('E'); }
  const rowE = WA.store.get().fondness.rows.filter(function (r) { return r.person === 'E'; })[0];
  a(rowE.history.length === 8 && rowE.corrections.length === 8, 'v2770/fond: [5] 历史环与纠错环各自有界（8/8）');
  const es = WA.evict.evictStat();
  a(!(es.failedBy && es.failedBy['unknown-site']), 'v2770/fond: [5] 两站点均已登记（无 unknown-site 静默失败）');
  a(WA.evict.siteDecls()['fondness.history'].cap === 8 && WA.evict.siteDecls()['fondness.corrections'].cap === 8, 'v2770/fond: [5] 站点上限与实现同源');
  a(!!WA.store.sizeCaps()['fondness.rows.*.history'] && !!WA.store.sizeCaps()['fondness.rows.*.corrections'], 'v2770/fond: [5] 容量登记表双侧同源');
  const stt = WA.fondness.stat();
  a(['pending', 'accepts', 'rejects', 'undos', 'advances', 'corrections'].every(function (k) { return typeof stt[k] === 'number'; }), 'v2770/fond: [5] stat 透出六项新计量');
}

// ── 破坏覆盖（只在内存副本上）──
function brokenOverride(spec) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  const hits = src.split(spec.from).length - 1;
  if (hits !== 1) throw new Error('anchor hits ' + hits + ' :: ' + spec.key);
  const ov = {};
  ov[REL] = src.split(spec.from).join(spec.to);
  ov.__brokenSrc = src.split(spec.from).join(spec.to);
  ov.__origSrc = src;
  return ov;
}
function anchorHits(spec) { return fs.readFileSync(path.join(BASE, REL), 'utf8').split(spec.from).length - 1; }
function guarded(fn) { return function (WA) { try { return fn(WA); } catch (e) { return 'threw'; } }; }
function probeWith(spec, fn) { return isolated(function () { return guarded(fn)(fresh({ srcOverride: brokenOverride(spec) })); }); }
function probeClean(fn) { return isolated(function () { return guarded(fn)(fresh()); }); }
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });

function runNegative(a) {
  // N0 锚点唯一性 + 破坏真的改到源码（且只改这一处）
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2770/fond: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  BROKEN.forEach(function (s) {
    const ov = brokenOverride(s);
    a(ov[REL] !== ov.__origSrc && ov[REL].length === ov.__origSrc.length - (s.from.length - s.to.length), 'v2770/fond: [N0] 破坏真的改变了源码且只改这一处 :: ' + s.key);
  });
  // N1 逐条现形
  a(probeWith(BROKEN[B.bandcap], probeBandCap) !== 'band-cap', 'v2770/fond: [N1] 封顶移除 ⇒ 跨段步进不再报 band-cap');
  a(probeWith(BROKEN[B.segtop], probeSegTop) === 'not-at-cap', 'v2770/fond: [N1] 段顶退回 hi ⇒ 站在段顶也永远报 not-at-cap（段顶不可达，正是本版修掉的真缺陷）');
  a(probeWith(BROKEN[B.stale], probeStale) !== 'stale-proposal', 'v2770/fond: [N1] 过期校验移除 ⇒ 旧建议套到新现场上');
  a(probeWith(BROKEN[B.undoable], probeUndo) === 'second-undo-landed', 'v2770/fond: [N1] 可撤性校验移除 ⇒ 不可撤的变化被撤');
  a(probeWith(BROKEN[B.corrlow], probeCorrLow) !== 'non-positive-delta', 'v2770/fond: [N1] 纠错降值守卫移除 ⇒ 纠错通道可降值');
  a(probeWith(BROKEN[B.atcap], probeAtCap) === 'advanced-early', 'v2770/fond: [N1] 段顶校验移除 ⇒ 未到段顶就能授权跳档');
  a(probeWith(BROKEN[B.stageoff], probeStageOff) !== 'stage-off', 'v2770/fond: [N1] 开关校验移除 ⇒ staged 未开也能授权');
  a(probeWith(BROKEN[B.corrblock], probeCorrBlock) === 'unmarked', 'v2770/fond: [N1] 纠错注入移除 ⇒ 依据不再标「不是角色记忆」');
  a(probeWith(BROKEN[B.topstage], probeTopStage) !== 'top-stage', 'v2770/fond: [N1] 最高段校验移除 ⇒ 越顶「授权」仍被接受');
  a(probeWith(BROKEN[B.already], probeAlready) !== 'already-pending', 'v2770/fond: [N1] 待确认守卫移除 ⇒ 旧建议被静默覆盖');
  // N2 真源码上同一批判据为真
  a(probeClean(probeBandCap) === 'band-cap', 'v2770/fond: [N2] 原版跨段步进报 band-cap');
  a(probeClean(probeSegTop) === 'ok', 'v2770/fond: [N2] 原版在段顶可授权（段顶可达）');
  a(probeClean(probeStale) === 'stale-proposal', 'v2770/fond: [N2] 原版报 stale-proposal');
  a(probeClean(probeUndo) === 'not-undoable', 'v2770/fond: [N2] 原版报 not-undoable');
  a(probeClean(probeCorrLow) === 'non-positive-delta', 'v2770/fond: [N2] 原版拒绝纠错降值');
  a(probeClean(probeAtCap) === 'not-at-cap', 'v2770/fond: [N2] 原版报 not-at-cap');
  a(probeClean(probeStageOff) === 'stage-off', 'v2770/fond: [N2] 原版报 stage-off');
  a(probeClean(probeCorrBlock) === 'marked', 'v2770/fond: [N2] 原版注入标出「不是角色记忆」');
  a(probeClean(probeTopStage) === 'top-stage', 'v2770/fond: [N2] 原版报 top-stage');
  a(probeClean(probeAlready) === 'already-pending', 'v2770/fond: [N2] 原版报 already-pending');
  // N3 隔离：破坏的可见面恰好是本判据——默认路径与邻居站点不受影响
  a(probeWith(BROKEN[B.segtop], probeDefaultPath) === 0.8, 'v2770/fond: [N3] 段顶语义破坏不影响默认（staged 关）路径');
  a(probeWith(BROKEN[B.bandcap], probeSiteDecl) === 8, 'v2770/fond: [N3] 封顶破坏不影响挤出侧站点声明');
  // N4 真状态改变（不是恒真判据）
  const chg = isolated(function () {
    const WA = fresh();
    reset(WA);
    WA.fondness.setSettings({ mode: 'confirm' });
    WA.fondness.apply('Z', { delta: 0.5, trust: 30 });
    const before = WA.fondness.read('Z').value;
    WA.fondness.accept('Z');
    return { before: before, after: WA.fondness.read('Z').value };
  });
  a(chg.before === 0 && chg.after === 0.5, 'v2770/fond: [N4] 采纳真的改变了持久值（判据非恒真）');
  // N5 哨兵不泄漏
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2770/fond: [N5] 哨兵未泄漏（' + (leak.join(',') || 'none') + '）');
}
function runAll(a) { isolated(function () { judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SETTLE-V2770: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SETTLE-V2770: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative };
