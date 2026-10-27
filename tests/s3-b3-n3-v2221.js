#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b3-n3-v2221.js (v2.221.0) — N3 经营供应链专锁（五段齐备）
//
// 【拓展原文逐条对照】（engines/supply-chain.js 头注释与 N3 注释）
//   缺口：「采购 → 运输 → 生产 → 交付」四段各有各的口，却**没有一个面把一条订单串起来回答**：
//     · economy.buy / craft 各管一段钱货两清，但它们是**单步**口 —— 答不出「这一条链从头到尾
//       走不走得通、会断在第几段、为什么断」；
//     · freight.dispatch 要五个参数，而玩家/面板拿不到「我这条订单该给什么路线、够不够货」；
//     · operations / commission 是**登记**，答得出「花了几笔」，答不出「这批货卡在哪一段」。
//   后果不是「读不出来」，而是**每个消费方都要自己把四段拼一遍** —— 拼出来的判据必然慢慢漂开。
//
// 【钉的四件事与六条否定式边界】
//   ① **逐段检查各接一个真源**：采购→economy.view、运输→economy.routeView + economy.view、
//      生产→economy.RECIPES、交付→org.canAfford。**不重算**（没有第二份算法可分家）。
//   ② **commit 原样透传**：各段动作原样交给来源写口（economy.buy / freight.dispatch /
//      economy.craft / org.transfer），自己不开事务、不碰 draft。
//   ③ **断在哪段停在哪段**：不假装整条订单原子，前面的段如实标已生效、后面的段如实标未执行。
//   ④ **瓶颈图只报量到的**：约束量与缺口逐字段取自来源读口，不编概率、不给建议。
//   否定式：不另存第二份库存/资金/回执（全文零 store.transact）· 不新增拒收码语义（段级 reason
//      一律复用既有已登记码）· 不做参数校验（缺什么由来源自己拒收）· 跨模块非原子（如实标各段状态）·
//      预览是进程态交互物（stamp 调用方回带，本模块只比对不存储）· 全关即零存在（chain-off，无 buildBlock）。
//
// 【本锁五段】A 静态契约与面板真消费方 / B 逐段检查接真源 / C 透传与断点 /
//   D 零写入不变式与分栏计数 / N 真源码破坏 + 两向自证（H5 锚点纯度 + H6 两向）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/supply-chain.js';
const PANEL_REL = 'ui/panel.js';
const RUN_REL = 'tests/run.js';
const IDX_REL = 'index.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 剥掉注释（判据纯度：不得被沿革注释冒充成现场）。 */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
/** 取出 `WA.supplyChain = { … }` 的对象字面量体。 */
function exportBody(src) {
  const at = src.indexOf('WA.supplyChain = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  return '';
}
function env0(ov) { return sync.fresh(ov ? { srcOverride: ov } : {}).WA; }
/** 种一个最小可判世界：甲（银元 10）+ 码头（米 5 存）+ 一条商路 + 一条配方。 */
function seed(WA, cfg) {
  WA.supplyChain.setSettings(Object.assign({ enabled: true, maxStages: 8, maxRows: 24 }, cfg || {}));
  WA.economy.setSettings({ enabled: true });
  WA.freight.setSettings({ enabled: true });
  WA.org.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 10 }, updatedAt: 1 },
      'p_乙': { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1 }
    };
    d.economy = d.economy || {};
    d.economy.goods = [
      { place: '码头', resource: '米', base: 2, price: 2, stock: 5, demand: 0, consumed: 0, tickedAt: 0 },
      // 采购段从「码头」买走米后，码头米存量会下降；运输段若仍运米就会与采购段抢同一格库存。
      // 故给码头另备一条独立货源（面）专供运输段 —— 四段各接各的货，互不抢库存。
      { place: '码头', resource: '面', base: 2, price: 2, stock: 5, demand: 0, consumed: 0, tickedAt: 0 },
      { place: '城北', resource: '米', base: 3, price: 3, stock: 0, demand: 0, consumed: 0, tickedAt: 0 }
    ];
    d.economy.routes = [{ id: 'r1', lane: '水路', from: '码头', to: '城北', cost: 1, status: 'open', reason: '' }];
    d.economy.orders = [];
    d.org = d.org || {};
    d.org.journal = d.org.journal || [];
  }, 'n3:seed');
  return WA;
}
const ORD = [
  { kind: 'procure', place: '码头', resource: '米', qty: 3, by: '甲' },
  { kind: 'transport', routeId: 'r1', from: '码头', resource: '面', qty: 3, to: '城北', transitDays: 1, base: 3 },
  { kind: 'deliver', fromKind: 'person', fromName: '甲', toKind: 'person', toName: '乙', item: '银元', amount: 2 }
];
function order(extra) { return Object.assign({ id: 'o1', stages: ORD.slice() }, extra || {}); }
function snap(WA) { return JSON.stringify(WA.store.get()); }
// ═══════════════════════ A 段：静态契约与真消费方 ═══════════════════════
function runA(a) {
  const S = rd(REL);
  const code = stripComments(S);
  const body = exportBody(S);
  a(body.length > 0, 'n3/A1: 能从真源码取出 WA.supplyChain 的对象字面量体');
  ['plan', 'commit', 'bottleneck', 'verify', 'diagnose'].forEach(function (m) {
    a(body.indexOf(m + ':') > 0, 'n3/A2: 导出面含 ' + m);
  });
  // 四段与设置默认值（逐字）
  a(/const STAGES = \['procure', 'transport', 'produce', 'deliver'\];/.test(S), 'n3/A3: 四段名逐字在位');
  a(/const DEF = \{ enabled: false, maxStages: 8, maxRows: 24 \};/.test(S), 'n3/A4: 设置默认值逐字在位（默认关）');
  a(/bounds: \{ maxStages: \[2, 12\], maxRows: \[4, 48\] \}/.test(S), 'n3/A5: 区间声明逐字在位（上界有界）');
  // 逐段检查各接真源（不重算）
  a(code.indexOf('E.view(') >= 0, 'n3/A6: 采购接 economy.view（不重算价）');
  a(code.indexOf('E.routeView(') >= 0, 'n3/A7: 运输接 economy.routeView（不重算路程）');
  // v2.231.0（OPT-8）把生产段的真源从常量表改成 economy 的具名配方声明面 recipeOf()，
  //   常量 E.RECIPES 降为「声明面缺席」时的回落分支 —— 旧锚点 `E.RECIPES[` 因此再也中不了
  //   （现场红：n3/A8）。判据口径随之改成「接的是具名声明面」，回落面一并钉住（两条都要在）。
  a(code.indexOf('recipeOf(') >= 0 && code.indexOf('WA.economy.RECIPES[') >= 0,
    'n3/A8: 生产接 economy 的具名配方声明面 recipeOf()（回落 WA.economy.RECIPES，不现编合成关系）');
  a(code.indexOf('O.canAfford(') >= 0, 'n3/A9: 交付接 org.canAfford（不重算持有）');
  // commit 原样透传
  a(code.indexOf('E.buy(') >= 0 && code.indexOf('F.dispatch(') >= 0 && code.indexOf('E.craft(') >= 0 && code.indexOf('O.transfer(') >= 0,
    'n3/A10: commit 逐段原样透传给来源写口（buy / dispatch / craft / transfer）');
  // 零 store.transact（不另存第二份）
  a(cnt(code, 'WA.store.transact') === 0,
    'n3/A11: 全文零 store.transact（不另存第二份库存/资金/回执；实 ' + cnt(code, 'WA.store.transact') + '）');
  a(cnt(code, 'draft') === 0, 'n3/A12: 全文零 draft 赋值');
  // 不新增拒收码语义：段级 reason 一律复用既有已登记码（不出现编排层自造码）
  a(code.indexOf("reason: 'chain-off'") < 0 && /fail\('chain-off'\)/.test(code), 'n3/A13: chain-off 走 fail（fault 命名空间）');
  a(code.indexOf("reason: 'bad-order'") < 0 && /fail\('bad-order'/.test(code), 'n3/A14: bad-order 走 fail（fault 命名空间）');
  a(/const FAULTS = \['chain-off', 'bad-order'\];/.test(S), 'n3/A15: fault 命名空间只装编排层自身能产生的失败（2 码）');
  // 预览作废只有一份判据（commit 复用 verify 的 stampFrom）
  a(/function stampFrom\(/.test(S), 'n3/A16: stampFrom 在位（预览作废只有一份判据）');
  // 面板真消费方（无消费方不挂导出）
  const pan = rd(PANEL_REL);
  a(pan.indexOf('WA.supplyChain.plan(') >= 0, 'n3/A17: 面板真调 WA.supplyChain.plan()');
  a(pan.indexOf('WA.supplyChain.commit(') >= 0, 'n3/A18: 面板真调 WA.supplyChain.commit()');
  ['wa-schain-order', 'wa-schain-plan', 'wa-schain-bottleneck', 'wa-schain-verify', 'wa-schain-dia', 'wa-schain-who', 'wa-schain-commit']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'n3/A19: 面板控件 ' + id + ' 在位'); });
  // 守卫表登记（渲染 + 绑定 + 守卫三件齐）
  const diag = rd('engines/tool-diag.js');
  a(diag.indexOf("'wa-schain-plan'") >= 0, 'n3/A20: 守卫表登记新控件');
  a(diag.indexOf("'engines/supply-chain.js': 'supplyChain'") >= 0, 'n3/A21: 模块登记表登记（LOAD 进了不等于登记了）');
  // 版本面：模块自报 ver = 本模块**最后一次交付**的版本（不固定跟随 index）。
  //   沿革：本锁交付于 N3（2.221.0）；模块 registerModule 用 `ver: VERSION`（常量引用而非字面量），
  //   故判据钉模块源码里的 `const VERSION`，与 e8/n5 同款（index 升版不应拖动未变模块）。
  const mv = (rd(IDX_REL).match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  a(/const VERSION = '2\.221\.0'/.test(S), 'n3/A22: 模块自报 ver === 本模块交付版本 2.221.0');
  a(mv === JSON.parse(rd('manifest.json')).version, 'n3/A22b: 入口与清单同源同值（实 ' + mv + '）');
  a(rd(RUN_REL).indexOf('|supplyChain:') >= 0, 'n3/A23: FROZEN2800 的出口面契约含 supplyChain 段');
  a(rd(IDX_REL).indexOf("'engines/supply-chain.js'") >= 0, 'n3/A24: index.js LOAD_ORDER 含本模块');
}
// ═══════════════════════ B 段：逐段检查接真源 ═══════════════════════
function runB(a) {
  const WA = seed(env0());
  const p = WA.supplyChain.plan(order());
  a(p.ok === true && p.stages.length === 3 && p.runnable === true,
    'n3/B1: 三段全通（实 ' + j([p.ok, p.stages.length, p.runnable]) + '）');
  // ① 采购：米 5 ≥ 3 ⇒ 通，detail 带来源给的价带
  const s0 = p.stages[0];
  a(s0.kind === 'procure' && s0.ok === true && s0.detail.have === 5 && s0.detail.want === 3 && s0.detail.price === 2,
    'n3/B2: 采购读 economy.view（实 ' + j(s0.detail) + '）');
  // ② 运输：路线 open + 货源 5 ≥ 3 ⇒ 通
  const s1 = p.stages[1];
  a(s1.kind === 'transport' && s1.ok === true && s1.detail.routeId === 'r1' && s1.detail.lane === '水路',
    'n3/B3: 运输读 economy.routeView（实 ' + j(s1.detail) + '）');
  // ③ 交付：甲有银元 10 ≥ 2 ⇒ 通
  const s2 = p.stages[2];
  a(s2.kind === 'deliver' && s2.ok === true && s2.detail.canAfford === true,
    'n3/B4: 交付读 org.canAfford（实 ' + j(s2.detail) + '）');
  // 缺货 ⇒ 采购断，blockedBy 收第一段
  const W2 = seed(env0());
  const p2 = W2.supplyChain.plan(order({ stages: [{ kind: 'procure', place: '码头', resource: '米', qty: 99, by: '甲' }] }));
  a(p2.runnable === false && p2.blockedBy.index === 0 && p2.blockedBy.reason === 'short-stock',
    'n3/B5: 缺货 ⇒ 断在第 0 段 short-stock（实 ' + j(p2.blockedBy) + '）');
  // 封路 ⇒ 运输断 route-blocked
  const W3 = seed(env0());
  W3.store.transact(function (d) { d.economy.routes[0].status = 'blocked'; d.economy.routes[0].reason = '塌方'; }, 'n3:block');
  const p3 = W3.supplyChain.plan(order({ stages: [ORD[1]] }));
  a(p3.runnable === false && p3.blockedBy.reason === 'route-blocked',
    'n3/B6: 封路 ⇒ 运输断 route-blocked（实 ' + j(p3.blockedBy) + '）');
  // 未知段名 ⇒ bad-order（不静默截断）
  const W4 = seed(env0());
  const p4 = W4.supplyChain.plan({ id: 'x', stages: [{ kind: 'zzz' }] });
  a(p4.ok === false && p4.fault === 'bad-order' && (p4.known || []).length === 4,
    'n3/B7: 未知段名 ⇒ bad-order 且带可选段表（实 ' + j(p4) + '）');
  // 空段表 ⇒ bad-order
  const p5 = W4.supplyChain.plan({ id: 'x', stages: [] });
  a(p5.ok === false && p5.fault === 'bad-order', 'n3/B8: 空段表 ⇒ bad-order');
  // 超段数上限 ⇒ bad-order（不静默截断）
  const W5 = seed(env0(), { maxStages: 2 });
  const many = [];
  for (let i = 0; i < 3; i++) many.push(ORD[0]);
  const p6 = W5.supplyChain.plan({ id: 'x', stages: many });
  a(p6.ok === false && p6.fault === 'bad-order' && p6.want === 3 && p6.cap === 2,
    'n3/B9: 超段数上限 ⇒ bad-order（不静默截断；实 ' + j([p6.want, p6.cap]) + '）');
  // 全关 ⇒ chain-off
  const W6 = seed(env0(), { enabled: false });
  a(W6.supplyChain.plan(order()).fault === 'chain-off', 'n3/B10: 全关 ⇒ plan 拒 chain-off');
  a(W6.supplyChain.bottleneck(order()).fault === 'chain-off', 'n3/B11: 全关 ⇒ bottleneck 拒 chain-off');
  a(W6.supplyChain.verify('o1', { order: order() }).fault === 'chain-off', 'n3/B12: 全关 ⇒ verify 拒 chain-off');
  a(W6.supplyChain.commit('o1', { order: order() }).fault === 'chain-off', 'n3/B13: 全关 ⇒ commit 拒 chain-off');
}
// ═══════════════════════ C 段：透传与断点 ═══════════════════════
function runC(a) {
  // 全通：三段各一笔，complete=true，atomic=false
  const WA = seed(env0());
  const c = WA.supplyChain.commit('o1', { order: order() });
  a(c.ok === true && c.complete === true && c.ranCount === 3 && c.atomic === false,
    'n3/C1: 全通三段各一笔（实 ' + j([c.complete, c.ranCount, c.atomic]) + '）');
  a(c.done[0].receipt && c.done[0].receipt.ok === true, 'n3/C2: 采购段回执来自 economy.buy（实 ' + j(c.done[0].receipt) + '）');
  // 断点：第 2 段交付目标不存在 ⇒ 前段已生效、后段未执行
  const W2 = seed(env0());
  const ord2 = order({ stages: [ORD[0], { kind: 'deliver', fromKind: 'person', fromName: '甲', toKind: 'person', toName: '查无此人', item: '银元', amount: 2 }] });
  const c2 = W2.supplyChain.commit('o1', { order: ord2 });
  a(c2.complete === false && c2.ranCount === 1 && c2.stoppedAt.index === 1,
    'n3/C3: 断在第 1 段（前段已生效、后段未执行；实 ' + j([c2.ranCount, c2.stoppedAt && c2.stoppedAt.index]) + '）');
  // 断点前段真生效：米库存 5 → 2
  const g = W2.store.get().economy.goods.filter(function (x) { return x.place === '码头' && x.resource === '米'; })[0];
  a(g && g.stock === 2, 'n3/C4: 断点前的段真生效（米 5 → 2；实 ' + j(g && g.stock) + '）');
  // 来源拒收原样透传（不改成编排层自造码）
  a(c2.stoppedAt.reason === 'missing-holder', 'n3/C5: 来源拒收原样透传（missing-holder 不是编排层自造；实 ' + j(c2.stoppedAt.reason) + '）');
  // 不做参数校验：缺 by 由来源自己拒（missing-fields）
  const W3 = seed(env0());
  const c3 = W3.supplyChain.commit('o1', { order: order({ stages: [{ kind: 'procure', place: '码头', resource: '米', qty: 3 }] }) });
  a(c3.complete === false && c3.stoppedAt.reason === 'missing-fields',
    'n3/C6: 不做参数校验（缺 by 由来源自己拒 missing-fields；实 ' + j(c3.stoppedAt && c3.stoppedAt.reason) + '）');
  // 瓶颈图：缺货 ⇒ gap 报真缺口
  const W4 = seed(env0());
  const b = W4.supplyChain.bottleneck(order({ stages: [{ kind: 'procure', place: '码头', resource: '米', qty: 99, by: '甲' }] }));
  a(b.ok === true && b.rows[0].gap === 94 && b.gapCount === 1,
    'n3/B? 瓶颈图报真缺口（want 99 − have 5 = 94；实 ' + j([b.rows[0].gap, b.gapCount]) + '）');
  // 瓶颈图不编概率：返回体无 chance / probability 字段
  a(JSON.stringify(b).indexOf('chance') < 0 && JSON.stringify(b).indexOf('probab') < 0,
    'n3/C7: 瓶颈图不编概率（返回体无 chance / probability）');
  // verify：约束未变 ⇒ stale:false；世界动了 ⇒ stale:true
  const W5 = seed(env0());
  const pv = W5.supplyChain.plan(order());
  a(W5.supplyChain.verify('o1', { order: order(), stamp: pv.stamp }).stale === false,
    'n3/C8: 约束未变 ⇒ stale:false');
  W5.store.transact(function (d) { d.economy.goods[0].stock = 1; }, 'n3:shrink');
  a(W5.supplyChain.verify('o1', { order: order(), stamp: pv.stamp }).stale === true,
    'n3/C9: 世界动了 ⇒ stale:true（旧预览作废）');
}
// ═══════════════════════ D 段：零写入不变式与分栏计数 ═══════════════════════
function runD(a) {
  const WA = seed(env0());
  // ① 只读口零写入：plan / bottleneck / verify 前后存档逐字节同
  const before = snap(WA);
  WA.supplyChain.plan(order());
  WA.supplyChain.bottleneck(order());
  WA.supplyChain.verify('o1', { order: order() });
  a(snap(WA) === before, 'n3/D1: plan / bottleneck / verify 零写入（三读口只读来源引擎）');
  // ② 设置只经 settingsBus 单一真源
  a(WA.store.get()['worldaxis_supply_chain_settings_v1'] === undefined,
    'n3/D2: 设置**不落 store**（走 settingsBus 键）');
  // ③ 越界夹回
  WA.supplyChain.setSettings({ maxStages: 999 });
  a(WA.supplyChain.getSettings().maxStages === 12, 'n3/D3: maxStages 越界夹回 12');
  WA.supplyChain.setSettings({ maxRows: 1 });
  a(WA.supplyChain.getSettings().maxRows === 4, 'n3/D4: maxRows 下界夹回 4');
  WA.supplyChain.setSettings({ maxStages: 8, maxRows: 24 });
  // ④ 预览是进程态交互物：存档里没有 stamp 键
  const p = WA.supplyChain.plan(order());
  a(typeof p.stamp === 'string' && snap(WA).indexOf('stamp') < 0,
    'n3/D5: 预览 stamp 只在返回体、**不落盘**（进程态交互物）');
  // ⑤ 分栏计数：plans / commits / partials 各自成栏
  const st = WA.supplyChain.stat();
  a(typeof st.plans === 'number' && typeof st.commits === 'number' && typeof st.partials === 'number',
    'n3/D6: plans / commits / partials 各自成栏（实 ' + j([st.plans, st.commits, st.partials]) + '）');
  // ⑥ 无 buildBlock（全关即零存在：不产注入块）
  a(typeof WA.supplyChain.buildBlock === 'undefined', 'n3/D7: 本模块**没有** buildBlock（全关即零存在）');
  // ⑦ diagnose 自证面
  const d = WA.supplyChain.diagnose();
  a(d.ok === true && d.stages.declared.length === 4 && d.stages.missing.length === 0 && d.faultCodes.length === 2,
    'n3/D8: diagnose 自证（四段在位、fault 两码；实 ' + j(d.stages) + '）');
}
// ═══════════════════════ N 段：真源码破坏 + 两向自证 ═══════════════════════
/** 负控制锚点表（H5：本表内每处锚点字面量只声明一次；判据层不引用这些串）。 */
const ANCHOR = {
  stockShort: "      return { ok: short === null || short <= 0, kind: kind, reason: (short !== null && short > 0) ? 'short-stock' : '',\n        detail: { place: place, resource: resource, want: need, have: have, short: short, price: v.price, lo: v.lo, hi: v.hi } };",
  routeBlock: "      if (rv.status !== 'open') return { ok: false, kind: kind, reason: 'route-blocked', detail: { routeId: rid, status: rv.status, why: rv.reason } };",
  stopAt: "        stoppedAt = { index: i, kind: stageKind(s), reason: (r && r.reason) || 'throw', detail: r };\n        break;",
  capGate: "    if (raw.length > cap) return { ok: false, want: raw.length, cap: cap };"
};
function broke(key) {
  const s = rd(REL);
  const an = ANCHOR[key];
  const n = cnt(s, an);
  if (n !== 1) throw new Error('破坏锚点【' + key + '】命中 ' + n + ' 次（期望恰好 1）—— 锚点必须是一处唯一的真源码文本');
  let out = null;
  if (key === 'stockShort') out = s.replace(an, an.replace("reason: (short !== null && short > 0) ? 'short-stock' : ''", "reason: ''"));
  if (key === 'routeBlock') out = s.replace(an, an.replace("if (rv.status !== 'open')", 'if (false)'));
  if (key === 'stopAt') out = s.replace(an, '        stoppedAt = null;\n        break;');
  if (key === 'capGate') out = s.replace(an, '    if (false) return { ok: false, want: raw.length, cap: cap };');
  if (out === null || out === s) throw new Error('破坏【' + key + '】没有改变源码文本');
  return out;
}
function runN(a) {
  const SRC = rd(REL);
  // ① 缺货判据被抹 ⇒ 采购不再报 short-stock（第 0 段失守）
  {
    const src = broke('stockShort');
    a(src !== SRC, 'n3/N1: [破坏1] 缺货判据被改成恒空（源码文本变了）');
    const W = seed(env0({ [REL]: src }));
    const p = W.supplyChain.plan(order({ stages: [{ kind: 'procure', place: '码头', resource: '米', qty: 99, by: '甲' }] }));
    a(!(p.blockedBy && p.blockedBy.reason === 'short-stock'),
      'n3/N1b: [破坏1] 副本上缺货不再报 short-stock（实 ' + j(p.blockedBy) + '）—— 原版那条判据真在起作用');
  }
  // ② 封路判据被拆 ⇒ 封路也能过（运输段失守）
  {
    const src = broke('routeBlock');
    a(src !== SRC, 'n3/N2: [破坏2] 封路判据被改成恒假（源码文本变了）');
    const W = seed(env0({ [REL]: src }));
    W.store.transact(function (d) { d.economy.routes[0].status = 'blocked'; }, 'n3:b2');
    const p = W.supplyChain.plan(order({ stages: [ORD[1]] }));
    a(!(p.blockedBy && p.blockedBy.reason === 'route-blocked'),
      'n3/N2b: [破坏2] 副本上封路也放行（实 ' + j(p.blockedBy) + '）—— 原版能拦住，判据不是空转');
  }
  // ③ 断点判据被拆 ⇒ 断在哪段不再停（后段照跑）
  {
    const src = broke('stopAt');
    a(src !== SRC, 'n3/N3: [破坏3] 断点判据被改成恒空（源码文本变了）');
    const W = seed(env0({ [REL]: src }));
    const ord = order({ stages: [ORD[0], { kind: 'deliver', fromKind: 'person', fromName: '甲', toKind: 'person', toName: '查无此人', item: '银元', amount: 2 }] });
    const c = W.supplyChain.commit('o1', { order: ord });
    a(c.stoppedAt === null || c.stoppedAt.index !== 1,
      'n3/N3b: [破坏3] 副本上断点不再停（实 ' + j(c.stoppedAt) + '）—— 原版能拦住');
  }
  // ④ 段数上限判据被拆 ⇒ 超段不拒（不静默截断这条失守）
  {
    const src = broke('capGate');
    a(src !== SRC, 'n3/N4: [破坏4] 段数上限判据被改成恒假（源码文本变了）');
    const W = seed(env0({ [REL]: src }), { maxStages: 2 });
    const many = [ORD[0], ORD[0], ORD[0]];
    const p = W.supplyChain.plan({ id: 'x', stages: many });
    a(p.fault !== 'bad-order',
      'n3/N4b: [破坏4] 副本上超段不再拒（实 ' + j(p.fault) + '）—— 原版能拦住');
  }
  // 纯度：原版上同款判据必须真（H6 第二向）
  const W0 = seed(env0());
  a(W0.supplyChain.plan(order({ stages: [{ kind: 'procure', place: '码头', resource: '米', qty: 99, by: '甲' }] })).blockedBy.reason === 'short-stock',
    'n3/Nb1: （纯度）原版上缺货 ⇒ short-stock');
  const W1 = seed(env0());
  W1.store.transact(function (d) { d.economy.routes[0].status = 'blocked'; }, 'n3:pb');
  a(W1.supplyChain.plan(order({ stages: [ORD[1]] })).blockedBy.reason === 'route-blocked',
    'n3/Nb2: （纯度）原版上封路 ⇒ route-blocked');
  const W2 = seed(env0());
  const c2 = W2.supplyChain.commit('o1', { order: order({ stages: [ORD[0], { kind: 'deliver', fromKind: 'person', fromName: '甲', toKind: 'person', toName: '查无此人', item: '银元', amount: 2 }] }) });
  a(c2.stoppedAt && c2.stoppedAt.index === 1, 'n3/Nb3: （纯度）原版上断点停在第 1 段');
  const W3 = seed(env0(), { maxStages: 2 });
  a(W3.supplyChain.plan({ id: 'x', stages: [ORD[0], ORD[0], ORD[0]] }).fault === 'bad-order',
    'n3/Nb4: （纯度）原版上超段 ⇒ bad-order');
  a(SRC.length > 15000, 'n3/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
  a(cnt(rd(REL), ANCHOR.stockShort) === 1 && cnt(rd(REL), ANCHOR.routeBlock) === 1
    && cnt(rd(REL), ANCHOR.stopAt) === 1 && cnt(rd(REL), ANCHOR.capGate) === 1,
    'n3/Nd: 负控制全程未改真源码（四处锚点在收尾复核时仍各在原位恰 1 次）');
}
function mkA(report) { return function (ok, name) { report.total++; if (ok) report.pass++; else { report.fail++; console.log('FAIL ' + name); } }; }
function main() {
  const report = { total: 0, pass: 0, fail: 0 };
  const a = mkA(report);
  runA(a); runB(a); runC(a); runD(a); runN(a);
  console.log('N3 s3-b3-n3-v2221 ' + report.pass + ' / 失败 ' + report.fail);
  process.exit(report.fail ? 1 : 0);
}
if (require.main === module) main();