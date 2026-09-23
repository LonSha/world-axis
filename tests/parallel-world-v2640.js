#!/usr/bin/env node
// WorldAxis tests/parallel-world-v2640.js —— 独立性面「导出读口真生效、闸门真独立、越界真不落盘」锁（v2.64.0）
//
// 【它治的病】平行世界引擎（主线之外独立推演）最有价值的四条能力全是否定式：
//   · 导出读口**必须真的被读**（`getSettings` 此前产品与测试均零引用——引擎内部一律
//     裸调内部闭包 `effSettings()`，于是导出面与真正生效的口可以各自漂移：
//     门禁只钉得住「导出还在场」，钉不住「它就是真正被读的那只口」）；
//   · 自动推进**必须由独立闸门判定**（`shouldAuto` 说的是「此刻该不该跑」，
//     与 `stat()` 报的「跑过几次」是两件事——把两者当同一件事的实现，
//     在「一直没跑」时答不出是「没开」「没到轮」「骰子没中」中的哪一种）；
//   · 非法枚举**不得落盘**（磁盘长出引擎认不出的值 ⇒ 下次归一回落默认，
//     用户的既有选择被静默改掉）；
//   · 独立性边界必须写在注入面上才作数（只有高影响事件能渗回主线；
//     提示词必须明写「不得为衬托主角而硬造事件」——那是本模块存在的理由）。
//   存在面判据（有 advance 吗 / 有 IMPACTS 吗）对这四条一无所知：
//   一个把 `shouldAuto` 当摆设、把非法枚举直接落盘的实现，拥有全套函数名与常量。
//
// 【为什么既有锁全都照不到】
//   · tests/run.js 的 `v2.34.0` 节钉的是**呈现面与数据流**（页面真读 store、
//     高影响注入、同名覆盖、连带清理），它证明了「能跑」，没证明「只有那一条口能跑」；
//   · v2.63.0 三面（world/shadow/threads）钉的是**世界织体 / 社交漩涡 / 悬案**，
//     与「主线之外此刻正在发生什么」不是同轴；
//   · field-liveness / dead-export 是静态面：它们**能**发现 `getSettings` 零引用，
//     但只能把它记进账本（test-only / unwired），钉不住「它必须是真路径」。
//   一句话：既有锁把「平行世界能推进」钉住了，没人钉「推进时到底谁说了算」。
//
// 【做法】判据全部跑在**真源码**上：经 tests/ui-gate-sync.js 的 fresh() 装载真 LOAD，
//   自动推进走 `WA.workflow.run('after', ctx)` 真链（与运行时同一入口），
//   推演调用走 mock 的 fetch（`global.__pushApiJson`），不 mock 被测逻辑本身。
//   破坏自证走 opts.srcOverride：真源码在**内存副本**上改坏后重跑同款判据，仓库文件零改写。
//
// 【判据】
//   1 导出读口在面上，且默认为关闭、默认不自动推进。
//   2 空库不产空头段（注入块为空）——需空库前提，故放在最前。
//   3 写入即归一：非法枚举不落盘、越界被夹取（磁盘里不得有引擎认不出的值）。
//   4 独立闸门：every_n 命中/非命中两向；骰子未开即关；总开关关即关。
//   5 注入独立性：只有 high/critical 进注入面，低影响只存档。
//   6 时间锚为空时明写「禁止使用现实日期」；有锚时用锚。
//   7 提示词含独立性铁律与认知五分类（NPC 不得知道它不该知道的事）。
//   8 手动录入：空名拒收（不得产生无名 NPC）。
//   9 容量四容器与 evict 站点声明同源。
//   10 高影响注入条数受控（不得全量展开）。
//   11 **导出读口闭环**：关掉总开关 ⇒ after 链真跑一遍也不得产生任何写入；
//      打开并喂一条真响应 ⇒ 恰好入账一次（证明闸门与推演口都真的在链上）。
//
// 【负控制】N0 破坏锚点在真源码中各恰中 1 次；N1/N2 两向自证；N3 逐锚敏感；N4 非恒真；N5 无副作用。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require('./mock.js');
const LS = global.localStorage;
const TAG = '__pw2640_';
const LS_KEY = 'worldaxis_parallel_settings_v1';
// ── 四个破坏锚点：**只在真源码里各恰中 1 次**（N0 校验） ──
// 破坏锚点覆盖**整条闸门**（读口 + enabled 判定 + running 串行 + shouldAuto）——
//   这才是「导出读口被架空」的完整破坏面：只架空读口而留着闸门，
//   关掉开关/手动模式时依然不写入，N1 不会现形。
const A_READ = "      const raw = WA.parallelWorld.getSettings();\n"
  + "      if (!raw) return;\n"
  + "      const cfg = WA.parallelWorld.effectiveSettings();\n"
  + "      if (!cfg.enabled) return;\n"
  + "      if (running) return;\n"
  + "      // 触发判定走导出面（WA.parallelWorld.shouldAuto）——shouldAuto 的真实消费方；\n"
  + "      // 不走内部闭包，否则它是 self-only 过度导出（门禁口径同 regional.getSettings 先例）。\n"
  + "      if (!WA.parallelWorld.shouldAuto()) return;\n"
  + "      advance('auto-' + cfg.autoMode);";
// 第二锚点：advance() **自己**也有一道 enabled 守卫。关闭态「不写」是
//   闸门 + advance 内部守卫**两条**联合保证的 —— 只拆闸门，advance 仍会拦下，
//   于是 N1 不现形（本轮实测 delta 恒为 0 的原因）。破坏面必须拆全。
const A_ADVGUARD = "    const cfg = effSettings();\n"
  + "    if (!cfg.enabled) return Promise.resolve({ ok: false, reason: 'disabled' });";
const A_MODE = "      if (o.autoMode !== undefined && AUTO_MODES.indexOf(o.autoMode) < 0) next.autoMode = cur.autoMode;";
const A_MIN = "  const INJECT_MIN_IMPACT = 'high'; // 注入主线门槛（源卡 impactMode=strong 口径：只放高影响）";
const A_NAME = "    if (!o.name || !String(o.name).trim()) return { ok: false, reason: 'no-name' };";
function fresh(opts) { return require('./ui-gate-sync.js').fresh(opts).WA; }
function pwOf(WA) {
  if (!WA.parallelWorld) throw new Error('WA.parallelWorld 未装载（engines/parallel-world.js 不在 LOAD 清单里？）');
  return WA.parallelWorld;
}
function st(WA) { return WA.store.get() || {}; }
function pwSt(WA) { return st(WA).parallelWorld || {}; }
function mods(WA) { return pwSt(WA).modules || []; }
// settingsBus 的落盘真源是 **localStorage**（store.read 拿不到它——实测返回 null）。
//   按 store 读会让「非法枚举不落盘」这条判据读到 undefined，于是**原版上也假绿**
//   （undefined !== 'bogus-mode' 恒成立）。判据必须读真正的落盘面。
function diskCfg(WA) {
  try { return JSON.parse(LS.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function resetPW(WA, tag) {
  WA.store.transact(function (d) {
    d.parallelWorld = { clock: '', npcs: [], relations: [], modules: [], round: 0, snapshots: [] };
  }, TAG + (tag || 'reset'));
}
function tick() { return new Promise(function (r) { setTimeout(r, 40); }); }
// ── 无副作用隔离 ──
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
    const k = LS.key(i);
    if (k === null) continue;
    let v = '';
    try { v = String(LS.getItem(k)); } catch (e) { v = ''; }
    if (v.indexOf(tag) >= 0) out.push(k);
  }
  return out;
}
async function isolatedAsync(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return await fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
function isolated(fn) {
  const snap = snapshotLS();
  const WA0 = global.WorldAxis;
  const origLog = WA0 && WA0.log;
  if (WA0) WA0.log = function () {};
  try { return fn(); }
  finally { if (WA0 && origLog) WA0.log = origLog; restoreLS(snap); }
}
// ══════════════ 判据 ══════════════
async function judge(a) {
  const WA = fresh();
  const pw = pwOf(WA);
  resetPW(WA);
  // ── 1 读口与默认值 ──
  a(typeof pw.getSettings === 'function' && typeof pw.effectiveSettings === 'function',
    'v2640/parallel: [1] 导出读口与归一读口都在面上');
  a(pw.getSettings() && pw.getSettings().enabled === false,
    'v2640/parallel: [1] 默认关闭（防意外触网）');
  a(pw.shouldAuto() === false, 'v2640/parallel: [1] 默认不自动推进');
  // ── 2 空库不产空头段（需空库前提，放最前） ──
  a(pw.buildParallelBlock() === '', 'v2640/parallel: [2] 无高影响模块 ⇒ 注入块为空（不产空头段）');
  // ── 3 写入即归一 ──
  pw.setSettings({ autoMode: 'bogus-mode', detailLevel: 'bogus-detail', autoInterval: 999, enabled: true });
  const dk = diskCfg(WA);
  a(dk.autoMode !== 'bogus-mode',
    'v2640/parallel: [3] 非法 autoMode **不落盘**（磁盘里没有引擎认不出的值；实 ' + JSON.stringify(dk.autoMode) + '）');
  a(dk.detailLevel !== 'bogus-detail',
    'v2640/parallel: [3] 非法 detailLevel **不落盘**（实 ' + JSON.stringify(dk.detailLevel) + '）');
  a(dk.autoInterval == null || (dk.autoInterval >= 1 && dk.autoInterval <= 50),
    'v2640/parallel: [3] autoInterval 越界被夹取到声明区间（实 ' + JSON.stringify(dk.autoInterval) + '）');
  a(pw.effectiveSettings().autoMode !== 'bogus-mode',
    'v2640/parallel: [3] 归一读口也不认非法枚举（不静默回退成用户没选过的值）');
  // ── 4 独立闸门 ──
  pw.setSettings({ enabled: true, autoMode: 'every_n', autoInterval: 4 });
  WA.store.transact(function (d) { d.evolution.round = 8; }, TAG + 'r8');
  a(pw.shouldAuto() === true, 'v2640/parallel: [4] every_n 命中轮次 ⇒ 闸门开（轮 8 % 4）');
  WA.store.transact(function (d) { d.evolution.round = 9; }, TAG + 'r9');
  a(pw.shouldAuto() === false, 'v2640/parallel: [4] 非命中轮次 ⇒ 闸门关（不得每轮都跑）');
  pw.setSettings({ autoMode: 'dice', diceEnabled: false });
  a(pw.shouldAuto() === false, 'v2640/parallel: [4] 骰子模式但骰子未开 ⇒ 闸门关（两项是 AND 不是 OR）');
  pw.setSettings({ autoMode: 'manual' });
  a(pw.shouldAuto() === false, 'v2640/parallel: [4] 手动模式 ⇒ 闸门恒关（不偷跑）');
  pw.setSettings({ enabled: false, autoMode: 'per_turn' });
  a(pw.shouldAuto() === false, 'v2640/parallel: [4] 总开关关 ⇒ 闸门恒关（每轮模式也不跑）');
  // ── 5 注入独立性：只有 high/critical 渗回主线 ──
  WA.store.transact(function (d) {
    d.parallelWorld.modules = [
      { id: 'm1', title: '茶馆闲谈', perspective: '柳三娘', detail: '低事件', impact_level: 'low', at: 1 },
      { id: 'm2', title: '码头火并', perspective: '柳三娘', detail: '高事件', impact_level: 'high', at: 2 },
      { id: 'm3', title: '势力覆灭', perspective: '赵九', detail: '致命事件', impact_level: 'critical', at: 3 }
    ];
    d.parallelWorld.npcs = [{ id: 'n1', name: '柳三娘', emotionLevel: 0, attitudeLevel: 0, knowledge: {} }];
  }, TAG + 'mods');
  const blk = pw.buildParallelBlock();
  a(blk.indexOf('码头火并') >= 0 && blk.indexOf('势力覆灭') >= 0,
    'v2640/parallel: [5] high / critical 进注入面');
  a(blk.indexOf('茶馆闲谈') < 0,
    'v2640/parallel: [5] 低影响**只存档不进主线**（独立性铁律）');
  a(blk.indexOf('禁止NPC直接说出平行世界细节') >= 0,
    'v2640/parallel: [5] 注入面明写呈现代入约束（不得直说平行世界细节）');
  WA.store.transact(function (d) {
    d.parallelWorld.modules = [{ id: 'x', title: '闲谈', perspective: '', detail: '', impact_level: 'low', at: 1 }];
  }, TAG + 'lowonly');
  a(pw.buildParallelBlock() === '', 'v2640/parallel: [5] 全低影响 ⇒ 注入块重新为空');
  // ── 6 时间锚 ──
  const p1 = pw.buildPrompt();
  a(p1.indexOf('禁止使用现实日期') >= 0,
    'v2640/parallel: [6] 时间锚为空时**明写禁止现实日期**（不得让推演化成现实时间）');
  WA.store.transact(function (d) { d.parallelWorld.clock = '建安十二年秋'; }, TAG + 'clock');
  a(pw.buildPrompt().indexOf('建安十二年秋') >= 0, 'v2640/parallel: [6] 有锚时用锚（锚就是唯一时间真源）');
  // ── 7 提示词的独立性铁律 ──
  const p2 = pw.buildPrompt();
  a(p2.indexOf('禁止"为衬托主角"') >= 0 || p2.indexOf('不得让平行事件围绕主角发生') >= 0,
    'v2640/parallel: [7] 提示词明写独立性铁律（不为衬托主角硬造事件）');
  a(p2.indexOf('确认') >= 0 && p2.indexOf('传言') >= 0 && p2.indexOf('推测') >= 0
    && p2.indexOf('误认') >= 0 && p2.indexOf('讳言') >= 0,
    'v2640/parallel: [7] 认知五分类随提示词下发（NPC 不得知道它不该知道的事）');
  a(p2.indexOf('不得输出主线续写') >= 0,
    'v2640/parallel: [7] 明写不得续写主线（平行世界不侵占正文）');
  // ── 8 手动录入拒收空名 ──
  const r8 = pw.addNpc({});
  a(r8.ok === false && r8.reason === 'no-name',
    'v2640/parallel: [8] 空名拒收并归因（不产生无名 NPC；实 ' + JSON.stringify(r8) + '）');
  a((pwSt(WA).npcs || []).every(function (n) { return n && n.name; }),
    'v2640/parallel: [8] 容器里**不存在**无名档案（拒收确实没落盘）');
  // ── 9 容量同源 ──
  const decls = WA.evict.siteDecls();
  a(decls['parallelWorld.npcs'] && decls['parallelWorld.npcs'].cap === pw.CAP_NPCS,
    'v2640/parallel: [9] NPC 容量与站点声明同源（' + pw.CAP_NPCS + '）');
  a(decls['parallelWorld.modules'] && decls['parallelWorld.modules'].cap === pw.CAP_MODULES,
    'v2640/parallel: [9] 模块容量与站点声明同源（' + pw.CAP_MODULES + '）');
  a(decls['parallelWorld.relations'] && decls['parallelWorld.relations'].cap === pw.CAP_RELATIONS,
    'v2640/parallel: [9] 关系网容量与站点声明同源（' + pw.CAP_RELATIONS + '）');
  // ── 10 高影响注入条数受控 ──
  WA.store.transact(function (d) {
    const arr = [];
    for (let i = 0; i < 12; i++) arr.push({ id: 'h' + i, title: TAG + '高' + i, perspective: '', detail: '', impact_level: 'critical', at: i });
    d.parallelWorld.modules = arr;
  }, TAG + 'hot12');
  const blk10 = pw.buildParallelBlock();
  const shown = (blk10.match(/高\d+/g) || []).length;
  a(shown > 0 && shown <= 5,
    'v2640/parallel: [10] 高影响注入条数受控（≤5，实 ' + shown + '——不得全量展开）');

  // ── 11 导出读口闭环（本锁的核心：谁说了算） ──
  //   为什么走真 after 链：这是运行时唯一入口。链上另有若干推演消费者
  //   （backstage 排在 parallel 之前），故**不能假设「我 push 的那条响应一定轮到它」**——
  //   所以多喂几条，并把「节点到底有没有被调度」用 run() 的返回值（executed）单独钉住。
  const feed = function (clock, who, title) {
    const payload = { clock: clock, npcs: [{ name: who, CURRENT_THOUGHT: TAG }],
      modules: [{ title: title, perspective: who, detail: TAG, impact_level: 'high' }] };
    for (let i = 0; i < 8; i++) global.__pushApiJson(payload);
  };
  resetPW(WA, 'loop');
  pw.setSettings({ enabled: false, autoMode: 'per_turn' });
  WA.apiRouter.setChannel('inference', { baseUrl: 'http://mock', apiKey: 'k', model: 'm' });
  feed('不应被采用', TAG + '不应入账', TAG + '不应入账');
  const w0 = pw.stat().advances;
  const ex0 = await WA.workflow.run('after', {});
  await tick();
  a(ex0.some(function (n) { return n && n.id === 'parallel.simulate'; }),
    'v2640/parallel: [11] after 链确实调度了 parallel.simulate（证明下面那条不是「节点压根没跑」的假绿）');
  a(pw.stat().advances === w0 && (pwSt(WA).npcs || []).length === 0 && mods(WA).length === 0,
    'v2640/parallel: [11] 总开关关 ⇒ 链跑到了节点、库仍**一格不动**（advances ' + w0 + '→' + pw.stat().advances
    + '，NPC ' + (pwSt(WA).npcs || []).length + '，模块 ' + mods(WA).length + '）');
  //   11b 打开 + 每轮 ⇒ 闸门放行后恰好推进一次。
  pw.setSettings({ enabled: true, autoMode: 'per_turn' });
  feed('建安十二年冬', TAG + '看门人', TAG + '粮船失期');
  const w1 = pw.stat().advances;
  await WA.workflow.run('after', {});
  await tick(); await tick();
  a(pw.stat().advances === w1 + 1,
    'v2640/parallel: [11] 开关打开 + 每轮 ⇒ 链把它推进**恰好一次**（advances ' + w1 + '→' + pw.stat().advances + '）');
  a((pwSt(WA).npcs || []).some(function (n) { return String(n.name || '').indexOf(TAG) === 0; }),
    'v2640/parallel: [11] 推演结果真的落盘（NPC 入账；实 ' + JSON.stringify((pwSt(WA).npcs || []).map(function (n) { return n.name; })) + '）');
  a(String(pwSt(WA).clock || '').length > 0, 'v2640/parallel: [11] 时间锚被推演结果推进（实 ' + JSON.stringify(pwSt(WA).clock) + '）');
  a(mods(WA).some(function (m) { return String(m.title || '').indexOf(TAG) >= 0; }),
    'v2640/parallel: [11] 高影响模块入账（此后可经注入面渗回主线）');

  console.log('  ✓ v2640/parallel: 独立性面（读口真生效 / 闸门真独立 / 越界真不落盘 / 只放高影响）');
}
// ══════════════ 破坏探针 ══════════════
/** 闸门与总开关：打开 + 每轮时应该开 */
function probeGate(WA) {
  const pw = pwOf(WA);
  pw.setSettings({ enabled: true, autoMode: 'per_turn' });
  return { auto: pw.shouldAuto(), enabled: pw.effectiveSettings().enabled };
}
/** 非法枚举写入后磁盘上是什么 */
function probeMode(WA) {
  const pw = pwOf(WA);
  pw.setSettings({ autoMode: 'bogus-mode' });
  return { disk: (diskCfg(WA) || {}).autoMode, effective: pw.effectiveSettings().autoMode };
}
/** 注入门槛：低影响是否渗回主线 */
function probeMin(WA) {
  const pw = pwOf(WA);
  resetPW(WA, 'pm');
  WA.store.transact(function (d) {
    d.parallelWorld.modules = [{ id: 'lo', title: TAG + '低影响事件', perspective: '', detail: '', impact_level: 'low', at: 1 }];
  }, TAG + 'pm');
  return { block: String(pw.buildParallelBlock() || ''), leaked: String(pw.buildParallelBlock() || '').indexOf('低影响事件') >= 0 };
}
/** 空名录入 */
function probeName(WA) {
  const pw = pwOf(WA);
  resetPW(WA, 'pn');
  const r = pw.addNpc({});
  return { ok: r.ok === true, reason: r.reason || '', count: (pwSt(WA).npcs || []).length };
}
/** 读口闭环：总开关关时 after 链是否仍写入（异步） */
async function probeLoop(WA) {
  const pw = pwOf(WA);
  resetPW(WA, 'pl');
  pw.setSettings({ enabled: false, autoMode: 'per_turn' });
  WA.apiRouter.setChannel('inference', { baseUrl: 'http://mock', apiKey: 'k', model: 'm' });
  // 同 [11]：after 链上另有推演消费者，多喂几条以免被前面的节点吃掉
  for (let i = 0; i < 8; i++) {
    global.__pushApiJson({ clock: 'x', npcs: [{ name: TAG + '偷跑' }], modules: [{ title: TAG + '偷跑', impact_level: 'high' }] });
  }
  const before = pw.stat().advances;
  await WA.workflow.run('after', {});
  await tick(); await tick();
  return { delta: pw.stat().advances - before, npcs: (pwSt(WA).npcs || []).length };
}
const BROKEN = [
  // 破坏面拆全：闸门**和** advance() 内部守卫一起拆 —— 关闭态「不写」是两条联合保证的
  { key: 'read', rel: 'engines/parallel-world.js',
    parts: [
      { from: A_READ,
        to: "      // 破坏：整条闸门拆掉——不看开关、不看闸门，无条件推进\n"
          + "      const cfg = { enabled: true, autoMode: 'per_turn' };\n"
          + "      advance('auto-per_turn');" },
      { from: A_ADVGUARD,
        to: "    const cfg = effSettings();" }
    ] },
  { key: 'mode', rel: 'engines/parallel-world.js', from: A_MODE,
    to: "      if (o.autoMode !== undefined && AUTO_MODES.indexOf(o.autoMode) < 0) next.autoMode = o.autoMode;" },
  { key: 'min', rel: 'engines/parallel-world.js', from: A_MIN,
    to: "  const INJECT_MIN_IMPACT = 'low';" },
  { key: 'name', rel: 'engines/parallel-world.js', from: A_NAME,
    to: "    if (!o.name) o.name = '未具名'; if (!String(o.name).trim()) return { ok: false, reason: 'no-name' };" }
];
/** 一个破坏可以覆盖多处锚点（parts）；缺 parts 时按单锚点处理 */
function specParts(spec) { return spec.parts && spec.parts.length ? spec.parts : [{ from: spec.from, to: spec.to }]; }
function brokenOverride(spec) {
  let src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  specParts(spec).forEach(function (p) {
    const hits = src.split(p.from).length - 1;
    if (hits !== 1) throw new Error('破坏锚点应恰中 1 次，实 ' + hits + ' 次：' + spec.rel + ' :: ' + p.from);
    src = src.split(p.from).join(p.to);
  });
  const ov = {};
  ov[spec.rel] = src;
  return ov;
}
function probeWith(spec, fn) {
  return isolated(function () { return fn(fresh({ srcOverride: brokenOverride(spec) })); });
}
async function probeWithAsync(spec, fn) {
  return await isolatedAsync(async function () { return await fn(fresh({ srcOverride: brokenOverride(spec) })); });
}
function probeClean(fn) { return isolated(function () { return fn(fresh()); }); }
async function probeCleanAsync(fn) { return await isolatedAsync(async function () { return await fn(fresh()); }); }
/** 返回「不恰中 1 次」的锚点数（0 = 全部合格；多锚点破坏逐处核） */
function anchorHits(spec) {
  const src = fs.readFileSync(path.join(BASE, spec.rel), 'utf8');
  return specParts(spec).filter(function (p) { return src.split(p.from).length - 1 !== 1; }).length;
}
// ══════════════ 负控制 ══════════════
async function runNegative(a) {
  const anchorBad = BROKEN.filter(function (p) { return anchorHits(p) !== 0; })
    .map(function (p) { return p.key + '(' + anchorHits(p) + '处异)'; });
  a(anchorBad.length === 0, 'v2640/parallel: [N0] 每个破坏的每处锚点在真源码中都恰中 1 次（异: ' + (anchorBad.join(',') || '无') + '）');
  const diffOk = BROKEN.every(function (p) {
    const src = fs.readFileSync(path.join(BASE, p.rel), 'utf8');
    return brokenOverride(p)[p.rel] !== src;
  });
  a(diffOk, 'v2640/parallel: [N0] 四种破坏的内存副本都与真源码不同（非空转）');
  // N1 判据现形
  const lBad = await probeWithAsync(BROKEN[0], probeLoop);
  a(lBad.delta > 0 || lBad.npcs > 0,
    'v2640/parallel: [N1] 导出读口被架空 ⇒ 「关掉就一格不动」判据现形（' + JSON.stringify(lBad) + '）');
  const mBad = probeWith(BROKEN[1], probeMode);
  a(mBad.disk === 'bogus-mode',
    'v2640/parallel: [N1] 归一被摘 ⇒ 「非法枚举不落盘」判据现形（磁盘实为 ' + JSON.stringify(mBad.disk) + '）');
  const iBad = probeWith(BROKEN[2], probeMin);
  a(iBad.leaked === true,
    'v2640/parallel: [N1] 门槛被降到 low ⇒ 「低影响不进主线」判据现形（块里出现了低影响事件）');
  const nBad = probeWith(BROKEN[3], probeName);
  a(nBad.count === 1 && nBad.reason !== 'no-name',
    'v2640/parallel: [N1] 空名被自动补 ⇒ 「空名拒收」判据现形（' + JSON.stringify(nBad) + '）');
  // N2 原版全绿
  const lOk = await probeCleanAsync(probeLoop);
  a(lOk.delta === 0 && lOk.npcs === 0,
    'v2640/parallel: [N2] 原版：总开关关 ⇒ after 链跑完也不推进、不入账（' + JSON.stringify(lOk) + '）');
  const mOk = probeClean(probeMode);
  a(mOk.disk !== 'bogus-mode',
    'v2640/parallel: [N2] 原版：非法枚举不落盘（磁盘 ' + JSON.stringify(mOk.disk) + '）');
  const iOk = probeClean(probeMin);
  a(iOk.leaked === false, 'v2640/parallel: [N2] 原版：低影响确实不进注入面');
  const nOk = probeClean(probeName);
  a(nOk.ok === false && nOk.reason === 'no-name' && nOk.count === 0,
    'v2640/parallel: [N2] 原版：空名拒收且不落盘（' + JSON.stringify(nOk) + '）');
  // N3 逐锚敏感
  a((probeWith(BROKEN[0], probeMode).disk || '') !== 'bogus-mode', 'v2640/parallel: [N3] 读口破坏不牵连归一写口（逐锚敏感）');
  a(probeWith(BROKEN[1], probeMin).leaked === false, 'v2640/parallel: [N3] 归一闪失不牵连注入门槛（逐锚敏感）');
  a(probeWith(BROKEN[2], probeName).reason === 'no-name', 'v2640/parallel: [N3] 门槛破坏不牵连录入守卫（逐锚敏感）');
  a(probeClean(probeGate).auto === true, 'v2640/parallel: [N3] 原版闸门在打开+每轮时为开（对照）');
  // N4 非恒真：闸门确实随状态变化（不是恒真也不是恒假）
  const chg = isolated(function () {
    const WA = fresh();
    const pw = pwOf(WA);
    pw.setSettings({ enabled: true, autoMode: 'per_turn' });
    const s1 = pw.shouldAuto();
    pw.setSettings({ enabled: false });
    const s2 = pw.shouldAuto();
    pw.setSettings({ enabled: true, autoMode: 'manual' });
    const s3 = pw.shouldAuto();
    pw.setSettings({ autoMode: 'dice', diceEnabled: true });
    const s4 = pw.shouldAuto();
    pw.setSettings({ diceEnabled: false });
    const s5 = pw.shouldAuto();
    return { s1: s1, s2: s2, s3: s3, s4: s4, s5: s5 };
  });
  a(chg.s1 === true && chg.s2 === false && chg.s3 === false && chg.s5 === false,
    'v2640/parallel: [N4] 闸门确实随状态变化：每轮开 → 总开关关/手动/骰子未开皆关（实 ' + JSON.stringify(chg) + '）');
  // N5 无副作用
  const leak = scanKeys(TAG);
  a(leak.length === 0, 'v2640/parallel: [N5] 探测哨兵不泄漏进真存档（残留键: ' + (leak.join(',') || '无') + '）');
}
// ══════════════ 入口 ══════════════
async function runAll(a) { await isolatedAsync(async function () { await judge(a); }); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  (async function () {
    try { await runAll(a); await runNegative(a); }
    catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
    if (fail) { console.log('PARALLEL-V2640: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
    console.log('PARALLEL-V2640: pass（' + pass + ' 项）');
  })();
}
module.exports = {
  runAll: runAll, runNegative: runNegative,
  probeGate: probeGate, probeMode: probeMode, probeMin: probeMin, probeName: probeName, probeLoop: probeLoop,
  brokenOverride: brokenOverride
};