#!/usr/bin/env node
// WorldAxis tests/b7-rehearsal-v2118.js -- B7 专锁：统一试演 / 回滚范围 / 原著分歧（v2.118.0）
//
// 规划 02 的 B7 原文要点：「统一试演、回滚与原著分歧管理。当前 causal.rehearse 能在副本推进因果，
//   rand 有录制/校验，undo/checkpoints 有恢复基础；chrono 是依赖记录与 revert 记录，
//   applyUndo 不等于恢复全部世界，simBranch 也不等于完整业务试跑。在 A1 和 B1 的共享执行逻辑上，
//   构造隔离的世界快照、故事时钟、随机源及本轮候选。**真实运行与试演使用同样的准入、冲突与
//   效果处理，执行上下文显式传入**。检查当轮因果推进里读取全局状态的分支，确保**试演不回读
//   真实世界，也不产生外部副作用**。先支持限定步数和明确动作的比较，例如『等待』『改道』
//   『提前通知』的两步后果。确定性部分可比较，依赖未来模型生成的部分标为未知或候选；
//   **随机序列一致不能冒充文本输出和未来剧情完全可复现**。应用预览时检查真实世界版本是否仍
//   匹配，变化后重新计算或报冲突。回滚显示恢复的数据范围；对已经发到外部的消息使用补偿状态
//   或标注不可撤销，**不伪称删除本地记录就撤回了现实动作**。原著对位继续复用 canon 幕目和
//   gap/position：原著事实带来源，角色视点只获得当前可知部分。提供遵循、有限偏离和自由分支的
//   约束政策；玩家偏离后根据已发生事实继续演化，**不强迫 NPC 修正剧情去复刻原著**。」
//
// 落点：engines/rehearsal.js（新顶层容器 rehearsal.previews）+ core/exec.js（上下文栈的正式格）。
//   新容器的三处登记（evict.SITES / store 骨架 / store __BOUNDED_CAPS）由 [A1]–[A3] 守住。
//   core/exec.js 的装载面由 [A4] 守住（它与 act.js / world.js 的关系是**调用期**的，
//   装载面漏给模块不会报错，只会让两条路径各自静默降级成「一律按真世界执行」）。
//
// 本锁逐条守住的语义 —— 每一条都是「写出来了、但某个条件下不会成立」：
//   ① 试演不回读真实世界，也不产生外部副作用：跑完真世界的指纹逐字不变。
//   ② 真跑与试演共用同一条执行路径：apply 用的是 `runStep(null, ...)`（ctx=null ⇒ 真跑），
//      而不是另一套推进规则 —— 「试演通过、真跑走另一条」是这里唯一要防的事。
//   ③ 指纹不被自身记账污染：登记完那一刻必须**仍能** match（rev 每事务递增、meta 每次都动，
//      两者都不许进比对）。这一条是本轮实测抓到的真缺陷。
//   ④ 旧预览不许覆盖新进度：真改世界后判 stale-preview，且 apply **拒收并零变化**、不顺手重算。
//   ⑤ 不可撤销面单独一档：已提交到桥的操作标 `reversible: false`，不伪称删本地记录就撤回现实。
//   ⑥ 回滚不宣称恢复全部世界：报告里同时给 recoverable 与 outOfScope，claim 明说不覆盖全部。
//   ⑦ 可比较 / 不可比较分列：正文与未来走向进 no 档、且 unknown 是**结论**不是「还没算」。
//   ⑧ 原著分歧不强迫 NPC 复刻：三种政策只改提示口径，**不改任何状态面**（写盘零新增）。
//   ⑨ 容量有界且挤出有账：预览环形挤出，不做无界增长。
//   ⑩ 关闭时拒收（不产生半截预览）；exec 缺席时拒收（宁可拒收，也不在真世界上跑假试演）。
//
// 每条判据两向自证：真源码成绿 / 就地破坏现形。
//   N0 锚点在真源码恰 1 次 · N1 破坏现形 · N2 原版成绿 · N3 破坏互不串扰 · N4 判据非恒真。
// 破坏只改内存副本（srcOverride），零文件改写。
//
// 判据形态（沿用 v2.117.0 B6 的纪律）：每个 p* 判据**接收注入环境** `{ ov }`，
//   在**那个环境**里自建世界与夹具；返回值是**语义常量串**（原版永远返回同一个词），
//   不是会随夹具变化的读数 —— 否则 N2/N3 就失去意义。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const TAG = '__b7r2118_';
const REL = 'engines/rehearsal.js';
const REL_X = 'core/exec.js';
// ── 破坏锚点（逐字取自真源码，各恰 1 次）──
const A_EX1   = "    const ex = execMod();\n    if (!ex) { noteFault('exec-absent');";
const A_SDB   = "    const base = ex.cloneState(WA);\n    if (!base) return null;";
const A_SINK  = "      sink: base,";
const A_CTX   = "    return { ctx: c, base: base, store: sand };";
const A_WSINK = "    if (c && c.sink) {\n      c.writes = (c.writes || 0) + 1;";
const A_FP1   = "    BOOKS.forEach(function (k) { delete world[k]; });\n    delete world.meta;";
const A_FP2   = "    return a.keys === b.keys && a.chars === b.chars && a.digest === b.digest;";
const A_FP1B  = "    BOOKS.forEach(function (k) { delete world[k]; });";
const A_RER   = "      WA.exec.withContext(ctx, function () {\n        added = WA.act.add(who,";
const A_NOT   = "    WA.exec.withContext(ctx, function () {\n      na = WA.phoneBridge.noteAction(";
const A_CAU   = "    WA.exec.withContext(ctx, function () { r = WA.causal.tick({ now: atMs }); });";
const A_STALE = "      return { ok: false, reason: 'stale-preview', id: chk.id, pinned: chk.pinned, current: chk.current,";
const A_EXT   = "          reversible: false, note: '已提交到桥：本地记录可删，对方是否收到不由本地决定' };";
const A_CLAIM = "      claim: '本报告只覆盖上面列出的面；「恢复全部世界」不在本模块的承诺里（同样不在 chrono.applyUndo 里）',";
const A_COMB  = "      no: ['正文输出', 'NPC 的临场反应', '后续剧情的走向'].slice(),";
const A_RING  = "      WA.evict.array(draft.rehearsal.previews, 'rehearsal.previews', cfg.keepPreviews);";
const A_OKNO  = "      if (r.ok) ok++; else { no++; refusedKinds.push(String(r.reason || '')); }";
const A_STEP  = "      const r = runStep(null, steps[i], now);";
const A_PREV  = "    if (r.done === 0) { stat.lastReason = 'all-steps-refused';";
const A_RUN   = "    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }\n    const ex = execMod();";
// 反向：exec.js 的副作用分岔点（改这里必须让「试演不落真世界」现形）
const A_MUT   = "      c.writes = (c.writes || 0) + 1;";
const BROKEN = [
  { rel: REL,   key: 'ex1',   from: A_EX1,   to: "    const ex = execMod();\n    if (false) { noteFault('exec-absent');",
    why: 'exec 缺席不拒收 ⇒ 试演在真世界上跑（假试演比不试演更危险）' },
  { rel: REL,   key: 'sdb',   from: A_SDB,   to: "    const base = state();\n    if (!base) return null;",
    why: '快照不深拷贝（直接用真状态）⇒ 试演的写入落进真世界' },
  { rel: REL,   key: 'sink',  from: A_SINK,  to: "      sink: (WA.store && WA.store.get ? WA.store.get() : base),",
    why: 'sink 指向真 store ⇒ 试演的写直接落进真世界（隔离当场失效）' },
  { rel: REL,   key: 'ctx',   from: A_CTX,   to: "    return { ctx: null, base: base, store: sand };",
    why: '上下文不传给执行器 ⇒ act/world 读的是真世界门面（回读真世界）' },
  { rel: REL_X, key: 'wsink', from: A_WSINK, to: "    if (false) {\n      c.writes = (c.writes || 0) + 1;",
    why: '试演写入不计数 ⇒ writes 恒 0，「试演会产生副作用吗」失去读数' },
  { rel: REL,   key: 'fp1',   from: A_FP1,   to: "    const world = Object.assign({}, s || {});",
    why: '记账面完全不排除（自身簿进指纹）⇒ preview 的登记事务自己把指纹顶脏，登记完即 stale' },
  { rel: REL,   key: 'fp2',   from: A_FP2,   to: "    return a.rev === b.rev && a.keys === b.keys && a.chars === b.chars;",
    why: 'rev 进比对 ⇒ 登记完即 stale（判据变恒真话）' },
  { rel: REL,   key: 'fp3',   from: A_FP1B,  to: "    delete world.rehearsal;",
    why: '记账面清单收窄成「只删自己的簿」⇒ 别的账本一登记，预览就永久 stale（v2.153.0 分支树实测到的缺口）' },
  { rel: REL,   key: 'fp4',   from: A_FP1B,  to: "    delete world.rehearsal;\n    delete world.world;\n    delete world.meta;",
    why: '记账面清单扩宽到真世界键 ⇒ 真改世界被判无变化（判据变恒真话）' },
  { rel: REL,   key: 'rer',   from: A_RER,   to: "      if (true) {\n        added = WA.act.add(who,",
    why: '改道不经上下文 ⇒ 试演在真世界登记行动' },
  { rel: REL,   key: 'not',   from: A_NOT,   to: "    if (true) {\n      na = WA.phoneBridge.noteAction(",
    why: '提前通知不经上下文 ⇒ 试演把手机操作落进真台账' },
  { rel: REL,   key: 'cau',   from: A_CAU,   to: "    r = WA.causal.tick({ now: atMs });",
    why: '因果推进不经上下文 ⇒ B7 点名的「当轮因果推进里读取全局状态的分支」' },
  { rel: REL,   key: 'stale', from: A_STALE, to: "      return { ok: true, id: chk.id, applied: 0, refused: 0, until: 0, trace: [], staleBypass: true };",
    why: '旧预览不拒收 ⇒ 旧结论覆盖新进度' },
  { rel: REL,   key: 'ext',   from: A_EXT,   to: "          reversible: true, note: '已提交到桥：本地记录可删，对方是否收到不由本地决定' };",
    why: '外部动作标成可撤销 ⇒ 伪称删本地记录就撤回了现实' },
  { rel: REL,   key: 'claim', from: A_CLAIM, to: "      claim: '已恢复全部世界',",
    why: '回滚面自报「恢复全部世界」⇒ B7 原文点名的 overclaim' },
  { rel: REL,   key: 'comb',  from: A_COMB,  to: "      no: [].slice(),",
    why: '不可比较面空 ⇒ 「试演过了」变成无法反驳的话' },
  { rel: REL,   key: 'ring',  from: A_RING,  to: "      if (false) WA.evict.array(draft.rehearsal.previews, 'rehearsal.previews', cfg.keepPreviews);",
    why: '预览无界增长 ⇒ 长局存档被拖垮' },
  { rel: REL,   key: 'okno',  from: A_OKNO,  to: "      if (r.ok) ok++;" ,
    why: '应用不记拒收数 ⇒ 「拒绝了什么」在读数里消失' },
  { rel: REL,   key: 'step',  from: A_STEP,  to: "      const r = runStep(sandOf(), steps[i], now);",
    why: 'apply 复用试演上下文 ⇒ 应用变成「再跑一次假试演」，真跑与试演不再是同一条路径' },
  { rel: REL,   key: 'prev',  from: A_PREV,  to: "    if (false) { stat.lastReason = 'all-steps-refused';",
    why: '试演失败也照样登记预览 ⇒ 预览里出现「没跑成的结论」' },
  { rel: REL_X, key: 'mut',   from: A_MUT,   to: "      c.writes = (c.writes || 0) + 0;",
    why: 'exec 的试演写入不计数 ⇒ 试演副作用在读数上不可见' }
];
const B = {};
BROKEN.forEach(function (s, i) { B[s.key] = i; });
const OK = {
  ex1: 'exec-absent-refused', sdb: 'snapshot-isolated', sink: 'sink-mounted', ctx: 'ctx-passed',
  wsink: 'writes-counted', fp1: 'meta-excluded', fp2: 'rev-not-compared',
  fp3: 'books-explicit', fp4: 'books-explicit', rer: 'reroute-in-ctx',
  not: 'notify-in-ctx', cau: 'causal-in-ctx', stale: 'stale-refused', ext: 'external-irreversible',
  claim: 'claim-honest', comb: 'comparable-split', ring: 'ring-bounded', okno: 'refused-counted',
  step: 'apply-real-run', prev: 'no-preview-on-fail', mut: 'mut-counted'
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
  ov.__origSrc = src;
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
// 三个开关都要开：act（登记）/ world（move 类准入要问 world.reach）/ rehearsal。
//   只开 act 时改道会一路以 `disabled` 报回来（实测踩过）——而未开场的世界确实该拒。
function reset(WA, opts) {
  const o = opts || {};
  WA.act.setSettings({ enabled: false, maxActs: 8 });
  WA.world.setSettings({ enabled: false });
  WA.phoneBridge.setSettings({ enabled: false, linkCausal: true });
  WA.rehearsal.setSettings({ enabled: false });
  WA.store.transact(function (d) {
    d.people = { 'p_甲': { id: 'p_甲', name: '甲', resources: {}, updatedAt: 1,
      knowledge: { intel: [] }, life: { goals: [{ id: 'g1', text: '去乙地', obstacle: '', status: 'active' }] },
      schedule: o.schedule || [] } };
    d.world = d.world && typeof d.world === 'object' ? d.world : {};
    // 地点**按名匹配**（world.js 的 placeByName 比 name，不比 id）；道路字段是 { a, b, minutes }。
    d.world.places = [{ id: 'pl_A', name: '甲地', kind: 'public' }, { id: 'pl_B', name: '乙地', kind: 'public' }];
    d.world.roads = [{ id: 'rd_1', a: '甲地', b: '乙地', minutes: 30 }];
    // 行程面必须清：真跑（apply 那条路径）**会合法地把「甲在路上」写进真世界**，
    //   而 store 在同一个进程里跨用例存活 ⇒ 不清就累积成 already-in-transit，
    //   于是「第二次调用同一条判据」开始报假的失败（实测：N2 的 apply 探针）。
    d.world.journeys = [];
    d.acts = { rows: [], res: [] };
    d.causal = d.causal && typeof d.causal === 'object' ? d.causal : { chains: [], settled: [] };
    d.causal.phoneOps = [];
    // 一条**在推进窗口内**的链（原因已在世界事实里）：试演里它会从 open 走到 acted。
    //   没有这条链时 causal.tick 无事可做，「因果推进不经上下文」这条破坏
    //   在真世界上一笔都不写 —— 缺口复现不出来（实测踩过）。
    d.worldFacts = [{ id: 'wf_k1', key: 'k1', value: '试演原因', scope: 'world', source: TAG, at: 1 }];
    d.causal.chains = [{ id: 'cs_diag_1', cause: 'k1', condition: '', action: 'a1', immediate: '因已成立',
      delayed: [], status: 'open', stage: 'open', at: 1, updatedAt: 1 }];
    d.rehearsal = { previews: [] };
  }, TAG + 'reset');
  WA.act.setSettings({ enabled: true, maxActs: 8 });
  WA.world.setSettings({ enabled: true });
  WA.phoneBridge.setSettings({ enabled: o.bridge !== false, linkCausal: o.bridge !== false });
  WA.causal.setSettings({ enabled: true, maxChains: 4, maxItems: 2 });
  WA.rehearsal.setSettings({ enabled: true, maxSteps: 4, keepPreviews: 6, stepMs: 60000, policy: 'limited' });
  return WA;
}
/** 真世界指纹（本锁自算一份，不复用被测函数 —— 否则「不回读真世界」的判据会自我指涉）。 */
function worldSig(WA) {
  const s = WA.store.get();
  const w = Object.assign({}, s);
  delete w.rehearsal; delete w.meta;
  return JSON.stringify(w);
}
const WAIT = { kind: 'wait', who: '甲', ms: 60000 };
const RER = { kind: 'reroute', who: '甲', goalId: 'g1', from: '甲地', to: '乙地', duration: 60000 };
const NOT = { kind: 'notify', who: '甲', to: '乙', opId: 'op_1', act: 'message' };

// ── 判据 ──────────────────────────────────────────────────────────────
const PROBES = {
  // ① exec 缺席 ⇒ 拒收（不在真世界上跑假试演）
  pEx1: function (env) {
    const WA = mkW(env.ov);
    // 现场摘掉 exec（不动文件）：模拟「装载面漏给模块」。原版必须以 exec-absent 拒收；
    //   破坏版虽最终也可能因 sandbox-failed 拒收，但拒收原因改变，说明 guard 被绕开。
    const keep = WA.exec;
    try {
      WA.exec = undefined;
      const r = WA.rehearsal.run([WAIT], { now: 1000 });
      return r.ok === false && r.reason === 'exec-absent' ? 'exec-absent-refused' : (r.reason || 'ran');
    } finally { WA.exec = keep; }
  },
  // ② 快照隔离：跑完真世界逐字不变
  pSnap: function (env) {
    const WA = mkW(env.ov);
    const before = worldSig(WA);
    WA.rehearsal.run([WAIT, RER], { now: 1000 });
    WA.rehearsal.preview([WAIT], { now: 1000 });
    return worldSig(WA) === before ? 'snapshot-isolated' : 'leaked';
  },
  // ③ sink 挂上：试演一步写入计数 > 0（且真世界零变化）
  pSink: function (env) {
    const WA = mkW(env.ov);
    const before = worldSig(WA);
    const r = WA.rehearsal.run([RER], { now: 1000 });
    if (worldSig(WA) !== before) return 'leaked';
    return (r.writes > 0) ? 'sink-mounted' : 'no-writes';
  },
  // ④ 上下文真的传下去：改道结论由真执行器给出（act-admitted 形态）
  pCtx: function (env) {
    const WA = mkW(env.ov);
    const before = worldSig(WA);
    const r = WA.rehearsal.run([RER], { now: 1000 });
    const tr = (r.trace || [])[0] || {};
    if (worldSig(WA) !== before) return 'leaked';
    return (tr.ok === true && tr.reason === undefined) ? 'ctx-passed' : 'no/' + tr.reason;
  },
  // ⑤ writes 读数存在且真世界零变化
  pWrites: function (env) {
    const WA = mkW(env.ov);
    const before = worldSig(WA);
    const r = WA.rehearsal.run([RER], { now: 1000 });
    if (worldSig(WA) !== before) return 'leaked';
    return (typeof r.writes === 'number' && r.writes > 0) ? 'writes-counted' : 'writes-zero';
  },
  // ⑥ 登记完那一刻必须仍能 match（指纹不含自身记账）
  pFpSelf: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([WAIT], { now: 1000 });
    if (!pv.ok) return 'no/' + pv.reason;
    const c = WA.rehearsal.checkPreview(pv.previewId);
    return c.match === true ? 'self-clean' : 'self-dirty';
  },
  // ⑥b 别的账本登记之后，本模块预览仍须 match（记账面清单**不能只删自己**）
  //   v2.153.0 实测：branchTree 一登录分叉点，指纹 chars 2357 → 2400 ⇒ match:false，
  //   即任何 fork 之后 replay 恒报 not-comparable —— 那是「登记一本账」冒充「世界变了」。
  pFpOther: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([WAIT], { now: 1000 });
    if (!pv.ok) return 'no/' + pv.reason;
    // 模拟另一个模块的账本被登记（夹具用 branchTree 真实节点，形状与真登记一致）
    WA.store.transact(function (d) {
      d.branchTree = d.branchTree || { nodes: [] };
      d.branchTree.nodes.push({ id: 'br_x_1', round: 1, prompt: '岔路', options: ['左', '右'], parent: '' });
    }, TAG + 'book');
    const c = WA.rehearsal.checkPreview(pv.previewId);
    return c.match === true ? 'other-book-clean' : 'other-book-dirty';
  },
  // ⑥c 扩宽清单（把真世界键也删掉）⇒ 真改世界必须被判过（反向：判据非恒真）
  pFpReal: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([WAIT], { now: 1000 });
    WA.store.transact(function (d) { d.world.places.push({ id: 'pl_C', name: '丙地', kind: 'public' }); }, TAG + 'bump');
    const c = WA.rehearsal.checkPreview(pv.previewId);
    return c.match === false ? 'stale-detected' : 'blind';
  },
  // ⑦ 真改世界后判 stale
  pStale: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([WAIT], { now: 1000 });
    WA.store.transact(function (d) { d.world.places.push({ id: 'pl_C', name: '丙地', kind: 'public' }); }, TAG + 'bump');
    const c = WA.rehearsal.checkPreview(pv.previewId);
    return c.match === false ? 'stale-detected' : 'blind';
  },
  // ⑧ stale 时 apply 拒收且零变化
  pStaleRefuse: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([WAIT], { now: 1000 });
    WA.store.transact(function (d) { d.world.places.push({ id: 'pl_C', name: '丙地', kind: 'public' }); }, TAG + 'bump');
    const before = worldSig(WA);
    const a = WA.rehearsal.apply(pv.previewId, { steps: [WAIT], now: 1000 });
    if (worldSig(WA) !== before) return 'mutated';
    return (a.ok === false && a.reason === 'stale-preview') ? 'stale-refused' : 'ok/' + a.reason;
  },
  // ⑨ 真跑与试演共用同一执行路径：apply 在**真世界**上登记行动
  pApplyReal: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([RER], { now: 1000 });
    if (!pv.ok) return 'no/' + pv.reason;
    const a = WA.rehearsal.apply(pv.previewId, { steps: [RER], now: 1000 });
    if (!a.ok) return 'no/' + a.reason;
    const rows = ((WA.store.get().acts || {}).rows || []).length;
    return (a.applied === 1 && rows === 1) ? 'apply-real-run' : 'applied:' + a.applied + '/rows:' + rows;
  },
  // ⑩ 回滚范围三档 + claim 不 overclaim
  pClaim: function (env) {
    const WA = mkW(env.ov);
    const s = WA.rehearsal.rollbackScope({});
    if (!s.ok) return 'no';
    const honest = (s.claim && s.claim.indexOf('不在本模块的承诺里') >= 0) ? 'honest' : 'overclaim';
    const split = (s.recoverable.length > 0 && s.counts.outOfScope > 0) ? 'split' : 'nosplit';
    return honest + '/' + split;
  },
  // ⑪ 外部动作标不可撤销
  pExt: function (env) {
    const WA = mkW(env.ov);
    // 先在真世界落一笔手机操作（走 bridge 的真入口）
    WA.phoneBridge.noteAction({ opId: 'op_x', act: 'message', from: '甲', to: '乙' });
    const s = WA.rehearsal.rollbackScope({});
    if (!s.external.length) return 'no-external';
    const allFalse = s.external.every(function (x) { return x.reversible === false; });
    return allFalse ? 'external-irreversible' : 'claims-reversible';
  },
  // ⑫ 可比较 / 不可比较分列
  pComb: function (env) {
    const WA = mkW(env.ov);
    const r = WA.rehearsal.run([WAIT], { now: 1000 });
    const c = (r.comparable || {});
    const yes = Array.isArray(c.yes) && c.yes.length > 0;
    const no = Array.isArray(c.no) && c.no.length > 0;
    if (!yes || !no) return 'not-split';
    // unknown 是结论：试演一次必须带上「哪条不可比较」
    return (Array.isArray(r.unknown) && r.unknown.length > 0) ? 'comparable-split' : 'unknown-empty';
  },
  // ⑬ 容量有界：挤出有账、不做无界增长
  pRing: function (env) {
    const WA = mkW(env.ov);
    WA.rehearsal.setSettings({ keepPreviews: 2 });
    for (let i = 0; i < 5; i++) WA.rehearsal.preview([WAIT], { now: 1000 + i });
    const n = (((WA.store.get().rehearsal || {}).previews) || []).length;
    return (n === 2) ? 'ring-bounded' : 'n=' + n;
  },
  // ⑭ 应用时记拒收数
  pOkNo: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([WAIT], { now: 1000 });
    // 混一步坏动作：一条 ok、一条拒收
    const a = WA.rehearsal.apply(pv.previewId, { steps: [WAIT, { kind: 'nope', who: '甲' }], now: 1000 });
    if (!a.ok) return 'no/' + a.reason;
    return (a.applied === 1 && a.refused === 1) ? 'refused-counted' : 'applied:' + a.applied + '/refused:' + a.refused;
  },
  // ⑮ 试演失败不登记预览
  pPrevFail: function (env) {
    const WA = mkW(env.ov);
    const pv = WA.rehearsal.preview([{ kind: 'nope', who: '甲' }], { now: 1000 });
    const n = (((WA.store.get().rehearsal || {}).previews) || []).length;
    return (pv.ok === false && n === 0) ? 'no-preview-on-fail' : 'pv:' + pv.ok + '/n:' + n;
  },
  // ⑯ exec 的写入计数（core/exec.js 一侧）
  pMut: function (env) {
    const WA = mkW(env.ov);
    const before = worldSig(WA);
    let wrote = 0;
    WA.exec.withContext({ store: WA.exec.sandStore({}), world: WA.world, stat: {}, sink: {} },
      function () { WA.exec.mutate(null, function () {}); wrote = WA.exec.current().writes || 0; });
    if (worldSig(WA) !== before) return 'leaked';
    if (WA.exec.current() !== null) return 'ctx-stuck';
    return (wrote > 0) ? 'mut-counted' : 'writes-zero';
  },
  // ⑰ 关闭时拒收，且不产生半截预览
  pDisabled: function (env) {
    const WA = mkW(env.ov);
    WA.rehearsal.setSettings({ enabled: false });
    const r = WA.rehearsal.run([WAIT], {});
    const p = WA.rehearsal.preview([WAIT], {});
    const n = (((WA.store.get().rehearsal || {}).previews) || []).length;
    return (r.ok === false && r.reason === 'disabled' && p.ok === false && n === 0) ? 'off-refused' : 'ran';
  },
  // ⑱ 政策只改提示口径、不改任何状态面（写盘零新增）
  pPolicy: function (env) {
    const WA = mkW(env.ov);
    const before = worldSig(WA);
    const d0 = WA.rehearsal.divergence('x');
    WA.rehearsal.policy('follow');
    const d1 = WA.rehearsal.divergence('x');
    WA.rehearsal.policy('free');
    const d2 = WA.rehearsal.divergence('x');
    if (worldSig(WA) !== before) return 'wrote-state';
    const hints = [d0.hint, d1.hint, d2.hint].map(function (x) { return String(x || ''); });
    const distinct = (hints[0] !== hints[1]) && (hints[1] !== hints[2]);
    return distinct ? 'policy-hint-only' : 'hints-same';
  },
  // ⑲ 未知政策拒收（不回落成任何一个合法值）
  pPolicyBad: function (env) {
    const WA = mkW(env.ov);
    const before = WA.rehearsal.policy().policy;
    const r = WA.rehearsal.policy('banana');
    const after = WA.rehearsal.policy().policy;
    return (r.ok === false && r.reason === 'unknown-policy' && before === after) ? 'bad-refused' : 'fell-back';
  },
  // ⑳ 空步表拒收
  pNoSteps: function (env) {
    const WA = mkW(env.ov);
    const r = WA.rehearsal.run([], {});
    return (r.ok === false && r.reason === 'no-steps') ? 'empty-refused' : 'ran';
  }
};
// ── N1：破坏现形（每条给出「破坏后必须不再是原版结论」）──
const N1 = [
  { k: 'ex1',   p: PROBES.pEx1,        okk: 'exec-absent-refused', note: 'exec 缺席不拒收' },
  { k: 'sdb',   p: PROBES.pSnap,       okk: 'snapshot-isolated',   note: '快照不深拷贝' },
  { k: 'sink',  p: PROBES.pSnap,       okk: 'snapshot-isolated',   note: 'sink 不挂 ⇒ 写落回真世界' },
  { k: 'ctx',   p: PROBES.pSnap,       okk: 'snapshot-isolated',   note: '上下文不传 ⇒ 回读真世界' },
  { k: 'wsink', p: PROBES.pWrites,     okk: 'writes-counted',      note: '试演写入不计数' },
  { k: 'fp1',   p: PROBES.pFpSelf,     okk: 'self-clean',          note: 'meta 进指纹 ⇒ 登记完即 stale' },
  { k: 'fp2',   p: PROBES.pFpSelf,     okk: 'self-clean',          note: 'rev 进比对 ⇒ 登记完即 stale' },
  { k: 'rer',   p: PROBES.pSnap,       okk: 'snapshot-isolated',   note: '改道不经上下文' },
  { k: 'not',   p: PROBES.pSnap,       okk: 'snapshot-isolated',   note: '提前通知不经上下文' },
  { k: 'cau',   p: PROBES.pSnap,       okk: 'snapshot-isolated',   note: '因果推进不经上下文' },
  { k: 'stale', p: PROBES.pStaleRefuse,okk: 'stale-refused',       note: '旧预览不拒收' },
  { k: 'ext',   p: PROBES.pExt,        okk: 'external-irreversible', note: '外部动作标成可撤销' },
  { k: 'claim', p: PROBES.pClaim,      okk: 'honest/split',        note: '回滚面 overclaim' },
  { k: 'comb',  p: PROBES.pComb,       okk: 'comparable-split',    note: '不可比较面空' },
  { k: 'ring',  p: PROBES.pRing,       okk: 'ring-bounded',        note: '预览无界增长' },
  { k: 'okno',  p: PROBES.pOkNo,       okk: 'refused-counted',     note: '应用不记拒收数' },
  { k: 'prev',  p: PROBES.pPrevFail,   okk: 'no-preview-on-fail',  note: '试演失败仍登记预览' },
  { k: 'mut',   p: PROBES.pMut,        okk: 'mut-counted',         note: 'exec 试演写入不计数' }
];
function judge(a) {
  // ── A 静态段：登记链与装载面（不跑世界，只看源码与骨架） ──
  const ev = readSrc('core/evict.js');
  const st = readSrc('core/store.js');
  const ix = readSrc('index.js');
  const rj = readSrc('tests/run.js');
  a(ev.indexOf("'rehearsal.previews'") >= 0, 'v2118/b7: [A1] evict.SITES 登记 rehearsal.previews');
  // 站点 cap：static 数字 或 per-call（keepPreviews 是滑块，per-call 是正解）。
  a(/rehearsal\.previews[^\n]*cap:\s*('per-call'|\d+)/.test(ev), 'v2118/b7: [A1] 站点登记 cap（static 或 per-call）');
  // 数字上界必须落在 store 登记表（per-call 站点的上界真源，与 acts.rows 同口径）
  a(/rehearsal\.previews[^\n]*cap:\s*\d+/.test(st), 'v2118/b7: [A1] store 侧登记数字上界');
  a(st.indexOf('rehearsal: { previews: [] }') >= 0, 'v2118/b7: [A2] store 骨架物化 rehearsal（冷启动直写不炸事务）');
  a(st.indexOf("'rehearsal.previews'") >= 0, 'v2118/b7: [A3] __BOUNDED_CAPS 登记同键（挤出侧有账）');
  a(ix.indexOf("'core/exec.js'") >= 0 && ix.indexOf("'engines/rehearsal.js'") >= 0, 'v2118/b7: [A4] index.js LOAD_ORDER 两文件都在');
  a(rj.indexOf("'core/exec.js'") >= 0 && rj.indexOf("'engines/rehearsal.js'") >= 0, 'v2118/b7: [A4] tests/run.js 同步登记（LOAD 区间内可见）');
  const src = readSrc(REL);
  a(src.indexOf("WA.exec.withContext(ctx, function () {") >= 0, 'v2118/b7: [A5] 试演经显式上下文执行');
  a(src.indexOf("runStep(null, steps[i], now)") >= 0, 'v2118/b7: [A6] apply 与试演共用同一 runStep（真跑一侧）');
  a(src.indexOf("reversible: false") >= 0, 'v2118/b7: [A7] 外部动作标不可撤销');
  a(src.indexOf('const BOOKS = [') >= 0 && src.indexOf("'branchTree'") >= 0,
    'v2118/b7: [A7b] 记账面是显式清单（不只删自己一本簿）');
  // ⑧ 原著分歧不强迫 NPC 复刻：政策只改提示口径（源码层：三分支都有 hint，无状态写入）
  a(src.indexOf('不自动掰回') >= 0 && src.indexOf('只记当前坐标') >= 0, 'v2118/b7: [A8] 三政策只改提示口径');
  // ── B 运行时段 ──
  Object.keys(OK).forEach(function (k) {
    if (!PROBES['p' + k[0].toUpperCase() + k.slice(1)] && !{
      ex1: 1, sdb: 1, sink: 1, ctx: 1, wsink: 1, fp1: 1, fp2: 1, fp3: 1, fp4: 1, rer: 1, not: 1, cau: 1,
      stale: 1, ext: 1, claim: 1, comb: 1, ring: 1, okno: 1, step: 1, prev: 1, mut: 1
    }[k]) return;
  });
  const map = { ex1: 'pEx1', sdb: 'pSnap', sink: 'pSink', ctx: 'pCtx', wsink: 'pWrites',
    fp1: 'pFpSelf', fp2: 'pFpSelf', fp3: 'pFpOther', fp4: 'pFpReal', rer: 'pCtx', not: 'pCtx', cau: 'pCtx',
    stale: 'pStale', ext: 'pExt', claim: 'pClaim', comb: 'pComb', ring: 'pRing',
    okno: 'pOkNo', step: 'pApplyReal', prev: 'pPrevFail', mut: 'pMut' };
  Object.keys(map).forEach(function (k) {
    const got = probeClean(PROBES[map[k]]);
    if (map[k] === 'pSnap' || map[k] === 'pCtx') {
      a(got === 'snapshot-isolated' || got === 'ctx-passed',
        'v2118/b7: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
    } else {
      a(typeof got === 'string' && got.indexOf('threw:') !== 0 && got.indexOf('no/') !== 0,
        'v2118/b7: [B] 原版可用 :: ' + k + '（实 ' + got + '）');
    }
  });
  // ── C 不变式段（结构断言，与 B 段互为交叉验证）──
  const W = mkW(null);
  const r0 = W.rehearsal.run([WAIT], { now: 1000 });
  a(r0.ok === true && r0.dryRun === true, 'v2118/b7: [C] 试演结果自标 dryRun（读数不冒充真跑）');
  a(typeof r0.comparable === 'object' && r0.comparable.yes && r0.comparable.no,
    'v2118/b7: [C] 每次试演都带「可比较/不可比较」两档');
  const W2 = mkW(null);
  const v = W2.rehearsal.view({});
  a(v.ok === true && typeof v.previews === 'number', 'v2118/b7: [C] view 只读面可用');
  a(W2.rehearsal.statView() && typeof W2.rehearsal.statView().policy === 'string',
    'v2118/b7: [C] statView 暴露 policy（面板可读当前政策）');
  // 三条动作词汇都在（B7 点名的「等待/改道/提前通知」）
  const K = W2.rehearsal.KINDS;
  a(K.indexOf('wait') >= 0 && K.indexOf('reroute') >= 0 && K.indexOf('notify') >= 0,
    'v2118/b7: [C] 动作词汇含等待/改道/提前通知三型');
  const P = W2.rehearsal.POLICIES;
  a(P.indexOf('follow') >= 0 && P.indexOf('limited') >= 0 && P.indexOf('free') >= 0,
    'v2118/b7: [C] 政策三档：遵循/有限偏离/自由分支');
  // 顶层键零新增（rehearsal 由骨架物化，不是写侧临时造出来的）
  const top = Object.keys(W2.store.get()).sort();
  a(top.indexOf('rehearsal') >= 0, 'v2118/b7: [C] rehearsal 由骨架物化（写侧不造顶层键）');
  // notify 走 bridge：phase 只到 submitted（**不**宣称对方已收到 —— 那是 B8 的验收面）
  const W3 = mkW(null);
  const rn = W3.rehearsal.run([NOT], { now: 1000 });
  a(rn.ok === true && (rn.trace[0] || {}).effect === 'bridge-submitted',
    'v2118/b7: [C] 提前通知只登记到桥（submitted），不假装送达');
}
function runNegative(a) {
  a(BROKEN.length === 21 && new Set(BROKEN.map(function (x) { return x.key; })).size === 21,
    'v2118/b7: [N0] 破坏面覆盖 21 个互异锚点');
  BROKEN.forEach(function (s) { a(anchorHits(s) === 1, 'v2118/b7: [N0] 锚点在真源码中恰 1 次 :: ' + s.key + ' @ ' + s.rel); });
  N1.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2118/b7: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  const N1b = [
    { k: 'fp3', p: PROBES.pFpOther, okk: 'other-book-clean',
      note: '记账面清单收窄 ⇒ 别的账本登记即 stale（fork 之后 replay 恒不可回放）' },
    { k: 'fp4', p: PROBES.pFpReal,  okk: 'stale-detected',
      note: '记账面清单扩宽到真世界键 ⇒ 真改世界被判无变化' }
  ];
  N1b.forEach(function (it) {
    const got = probeWith(BROKEN[B[it.k]], it.p);
    a(got !== it.okk, 'v2118/b7: [N1] ' + it.note + '（缺口复现；实测 ' + got + '）');
  });
  // N2：原版成立（语义常量串，逐条对照）
  a(probeClean(PROBES.pFpSelf) === 'self-clean', 'v2118/b7: [N2] 原版成立 :: 指纹不被自身记账污染');
  a(probeClean(PROBES.pFpOther) === 'other-book-clean', 'v2118/b7: [N2] 原版成立 :: 别的账本登记不污染指纹');
  a(probeClean(PROBES.pFpReal) === 'stale-detected', 'v2118/b7: [N2] 原版成立 :: 真改世界仍被判 stale（清单没有宽到把世界删掉）');
  a(probeClean(PROBES.pStale) === 'stale-detected', 'v2118/b7: [N2] 原版成立 :: 真改世界后被判 stale');
  a(probeClean(PROBES.pStaleRefuse) === 'stale-refused', 'v2118/b7: [N2] 原版成立 :: stale 时 apply 拒收');
  a(probeClean(PROBES.pApplyReal) === 'apply-real-run', 'v2118/b7: [N2] 原版成立 :: apply 走真跑同一路径');
  a(probeClean(PROBES.pExt) === 'external-irreversible', 'v2118/b7: [N2] 原版成立 :: 外部动作不可撤销');
  a(probeClean(PROBES.pClaim) === 'honest/split', 'v2118/b7: [N2] 原版成立 :: 回滚面不 overclaim');
  a(probeClean(PROBES.pComb) === 'comparable-split', 'v2118/b7: [N2] 原版成立 :: 可比/不可比分列');
  a(probeClean(PROBES.pRing) === 'ring-bounded', 'v2118/b7: [N2] 原版成立 :: 容量环形有界');
  a(probeClean(PROBES.pOkNo) === 'refused-counted', 'v2118/b7: [N2] 原版成立 :: 拒收数可读');
  a(probeClean(PROBES.pPrevFail) === 'no-preview-on-fail', 'v2118/b7: [N2] 原版成立 :: 失败不登记预览');
  a(probeClean(PROBES.pPolicy) === 'policy-hint-only', 'v2118/b7: [N2] 原版成立 :: 政策只改提示口径');
  a(probeClean(PROBES.pPolicyBad) === 'bad-refused', 'v2118/b7: [N2] 原版成立 :: 未知政策拒收不回落');
  a(probeClean(PROBES.pNoSteps) === 'empty-refused', 'v2118/b7: [N2] 原版成立 :: 空步表拒收');
  a(probeClean(PROBES.pDisabled) === 'off-refused', 'v2118/b7: [N2] 原版成立 :: 关闭时拒收且不落半截预览');
  a(probeClean(PROBES.pMut) === 'mut-counted', 'v2118/b7: [N2] 原版成立 :: exec 上下文退出后复位');
  // N3：破坏互不串扰（换一个锚点，原结论不该变）
  // 破坏 causal 面**会**污染指纹自洁（试演期真世界被写），故换成真无关的面（comb）。
  a(probeWith(BROKEN[B.comb], PROBES.pFpSelf) === 'self-clean', 'v2118/b7: [N3] 破坏可比面分档不影响指纹自洁');
  a(probeWith(BROKEN[B.ext], PROBES.pRing) === 'ring-bounded', 'v2118/b7: [N3] 破坏外部分档不影响环形挤出');
  a(probeWith(BROKEN[B.ring], PROBES.pExt) === 'external-irreversible', 'v2118/b7: [N3] 破坏环形不影响外部分档');
  a(probeWith(BROKEN[B.claim], PROBES.pComb) === 'comparable-split', 'v2118/b7: [N3] 破坏 claim 不影响可比面分列');
  // N4：判据非恒真（原版与破坏对同一条判据给出不同结论）
  const okv = probeClean(PROBES.pFpSelf);
  const badv = probeWith(BROKEN[B.fp2], PROBES.pFpSelf);
  a(okv !== badv && okv === 'self-clean', 'v2118/b7: [N4] 指纹自洁判据非恒真（原版 ' + okv + ' / 破坏 ' + badv + '）');
  const ok2 = probeClean(PROBES.pSnap);
  const bad2 = probeWith(BROKEN[B.sink], PROBES.pSnap);
  a(ok2 !== bad2 && ok2 === 'snapshot-isolated', 'v2118/b7: [N4] 隔离判据非恒真（原版 ' + ok2 + ' / 破坏 ' + bad2 + '）');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('B7-REHEARSAL-V2118: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('B7-REHEARSAL-V2118: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: REL, anchorHits: anchorHits,
  PROBES: PROBES, mkW: mkW, probeClean: probeClean, probeWith: probeWith, worldSig: worldSig };