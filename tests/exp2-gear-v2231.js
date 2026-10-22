#!/usr/bin/env node
// WorldAxis tests/exp2-gear-v2231.js (v2.231.0) -- EXP-2 专锁：个人物品、装备与使用后果
//
// 【它治什么（缺口，开工前逐条复核现场）】
//   EXP-2 原文要的是「**唯一物件与堆叠资源分开**，明确持有人、容器/携带状态、适用场景、
//   使用次数或耐久、修理材料；需要装备槽的世界才启用装备槽」。验收原文：「买到同型号两件工具，
//   使用其中一件**只损耗该件**；借给 NPC 后玩家不能同时使用；修好再归还，**物件身份、持有人
//   和状态连续**。」
//
//   现场事实（不是静态推测）：
//     · `engines/entities.js` 的 `object` **只是一张名字清单** —— 答得出「有没有『铁锤』」，
//       答不出「这一把在谁手上、还能用几次」；
//     · `engines/economy.js` 管**堆叠资源**（`{place, resource, base, stock, price}`）——
//       「铁锤 ×2」在那里是**同一个键的两个单位**，两件分不开：用坏一件，另一件跟着坏；
//     · `engines/freight.js` 管「货从哪发到哪」，不管「这一件在谁身上」。
//   三者合起来就是本项要补的那一格：**库存有数量、没有身份**。
//
// 【九条口径（逐条有判据咬）】
//   · **逐件身份**：同型号两件是两条行，各带 id；用坏一件另一件不受影响（B3/N1，验收原文点名）。
//   · **借出即失权**：`lend` 之后原持有人 `canUse` 为假（B5/N3，验收原文点名）。
//   · **身份连续**：修好再归还，id 不变、修过的次数累进（B6/B7，验收原文点名）。
//   · **不建第二份物品真源**：物件名必须已在 entities 的 object 表里（B2/N2）。
//   · **装备槽按需启用**：没声明的槽 ⇒ `no-such-slot`；一槽一件（B8/N4）。
//   · **耗尽即拒收**：`worn-out`（不静默当一次成功使用）（B4/N5）。
//   · **修理要材料**：材料不足 ⇒ `short-material`（不凭空修好）（B6）。
//   · **携带三态**：`held` / `stowed` / `placed`（封闭集，自造一个 ⇒ `bad-carry`）（B9）。
//   · **存档是唯一真源**：`reload()` 从存档重建（B10）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp2-gear-v2231.js';
const GR = 'engines/gear.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 逐件：使用**按 id**落到那一行（不是按名字找第一件）
  grUseById: { rel: GR, txt: "      const row = b.items.filter(function (x) { return x && clean(x.id, 60) === clean(id, 60); })[0] || null;\n      if (!row) { out = { ok: false, reason: 'unknown-item', id: id }; return false; }\n      if (clean(row.holder, 60) !== who) { out = { ok: false, reason: 'not-holder', holder: row.holder, by: who }; return false; }\n      if ((num(row.durability) || 0) <= 0) { out = { ok: false, reason: 'worn-out', id: id, name: row.name }; return false; }" },
  // ② 借出即失权（持有人被真改）
  grLend: { rel: GR, txt: "      row.holder = toWho;\n      row.carry = 'held';" },
  // ③ 物品真源在 entities（本模块只记这一件的生命史）
  grEntity: { rel: GR, txt: "    const rows = (em && Array.isArray(em.object)) ? em.object : null;" },
  // ④ 装备槽按需启用（未声明 ⇒ 拒收）
  grSlotGate: { rel: GR, txt: "    if (!slotOf(sl)) return refuse('no-such-slot', { slot: sl, allowed: slotsOf().map(function (s) { return s.name; }) });" },
  // ⑤ 一槽一件（同一持有人的另一件占了 ⇒ 拒收）
  grSlotTaken: { rel: GR, txt: "      if (taken) { out = { ok: false, reason: 'slot-taken', slot: sl, by: taken.id, name: taken.name }; return false; }" },
  // ⑥ 修理要材料（材料不足 ⇒ 拒收）
  grMat: { rel: GR, txt: "    if (have < need) return refuse('short-material', { id: id, material: material, need: need, have: have });" },
  // ⑦ 耗尽闸（前置闸那条，与事务内那条分列）
  grWorn: { rel: GR, txt: "    if ((num(it.durability) || 0) <= 0) return refuse('worn-out', { id: id, name: it.name });" },
  // ⑧ 携带三态封闭
  grCarry: { rel: GR, txt: "    if (CARRIES.indexOf(carry) < 0) return refuse('bad-carry', { carry: carry, allowed: CARRIES.slice() });" },
  // ⑨ 修好不改 id（身份连续）
  grRepair: { rel: GR, txt: "      row.repairs = (num(row.repairs) || 0) + 1;" }
};
const EXPORTS = ['getSettings', 'setSettings', 'declareSlot', 'make', 'use', 'lend', 'equip', 'unequip',
  'repair', 'canUse', 'list', 'reload', 'view', 'stat', 'resetStat', 'reset', 'CARRIES'];
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.gear.setSettings({ enabled: true });
  return env;
}
/** 夹具：两个人 + 一张物品表（**自己 seed、自己收**）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { '铁': 5 }, updatedAt: 1 };
    d.people['p_乙'] = { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1 };
    d.evolution = d.evolution || {};
    d.evolution.entityMemory = d.evolution.entityMemory || { organization: [], object: [], ability: [], location: [] };
    d.evolution.entityMemory.object = [{ id: 'ob_h', name: '铁锤', aliases: [], desc: '', refs: 0, updatedAt: 1 }];
    d.gear = { items: [], slots: [] };
    return true;
  }, 'exp2:seed');
}
async function runAll(a, ov) {
  ov = ov || {};
  const S = rd(GR, ov);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, GR)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/gear.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('index.js', ov).indexOf("'engines/gear.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/gear.js': 'gear'") > 0, 'A3: tool-diag 声明表已登记');
  a(rd('engines/tool-diag.js', ov).indexOf('gear: secGear()') > 0
    && rd('engines/tool-diag.js', ov).indexOf('function secGear()') > 0,
    'A3b: 诊断面单列一节（与 economy 分列：那一节答「堆叠资源的价与量」，本节答「这一件在谁手上」）');
  (function () {
    a(rd('core/store.js', ov).indexOf('gear: { items: [], slots: [] }') > 0,
      'A4: 骨架已物化（登记不等于物化）');
    a(rd('core/evict.js', ov).indexOf("'gear.items'") > 0, 'A4b: 挤出站点已登记');
  })();
  (function () {
    const P = rd('ui/panel.js', ov);
    a(cnt(P, 'id="wa-gr-enabled"') === 1, 'A5: 面板渲染了唯一物件段（实 ' + cnt(P, 'id="wa-gr-enabled"') + ' 处）');
    a(cnt(P, "on('#wa-gr-use'") === 1 && cnt(P, "on('#wa-gr-lend'") === 1,
      'A5b: 用一次 / 借出各恰 1 处绑定');
    a(rd('engines/tool-diag.js', ov).indexOf("'wa-gr-use'") > 0
      && rd('engines/tool-diag.js', ov).indexOf("'wa-gr-out'") > 0,
      'A5c: 守卫表登记了本段控件（三件齐做）');
  })();
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A6: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A7: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  (function () {
    const e0 = envWith(ov);
    const miss = EXPORTS.filter(function (k) { return e0.WA.gear[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 开关
  (function () {
    const W = envWith(ov).WA;
    W.gear.setSettings({ enabled: false });
    a(W.gear.make('铁锤', {}).reason === 'disabled', 'B1: 关着时造物件拒收 disabled');
    a(W.gear.use('gr_x', {}).reason === 'disabled', 'B1b: 关着时使用拒收 disabled');
    W.gear.setSettings({ enabled: true });
  })();
  // B2 不建第二份物品真源
  (function () {
    const W = envWith(ov).WA;
    const r = W.gear.make('查无此物', {});
    a(r.ok === false && r.reason === 'entity-absent',
      'B2: 物件名没在 entities 的 object 表里 ⇒ 拒收 entity-absent（实 ' + r.reason + '）—— 本模块只记这一件的生命史');
    a(W.gear.make('铁锤', {}).ok === true, 'B2b: 登记过的物件名可造');
  })();
  // B3 **验收原文**：同型号两件，用坏一件另一件不受影响
  (function () {
    const W = envWith(ov).WA;
    const m1 = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    const m2 = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    a(m1.ok && m2.ok && m1.id !== m2.id,
      'B3: 同型号两件是**两条行**、各带自己的 id（' + m1.id + ' / ' + m2.id + '）');
    const u = W.gear.use(m1.id, { by: '甲', wear: 4 });
    a(u.ok === true && u.durability === 6, 'B3b: 用第一件扣的是第一件（实 ' + u.durability + '）');
    const rows = W.gear.list('甲');
    const r1 = rows.filter(function (x) { return x.id === m1.id; })[0];
    const r2 = rows.filter(function (x) { return x.id === m2.id; })[0];
    a(r1.durability === 6 && r2.durability === 10,
      'B3c: **用坏一件，另一件不受影响**（' + r1.durability + ' vs ' + r2.durability + '）—— 验收原文点名');
  })();
  // B4 耗尽即拒收
  (function () {
    const W = envWith(ov).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 2 });
    const u1 = W.gear.use(m.id, { by: '甲', wear: 2 });
    a(u1.ok === true && u1.wornOut === true, 'B4: 用到 0 ⇒ 回执标 wornOut');
    const u2 = W.gear.use(m.id, { by: '甲' });
    a(u2.ok === false && u2.reason === 'worn-out',
      'B4b: 耗尽后再用 ⇒ 拒收 worn-out（实 ' + u2.reason + '）—— 不静默当一次成功使用');
    const bad = W.gear.use(m.id, { by: '甲', wear: 0 });
    a(bad.reason === 'worn-out', 'B4c: 耗尽优先于参数校验（同一件已用不了，先答那条）');
  })();
  // B5 **验收原文**：借出即失权
  (function () {
    const W = envWith(ov).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    const l = W.gear.lend(m.id, '乙', { from: '甲' });
    a(l.ok === true && l.from === '甲' && l.to === '乙', 'B5: 借出成功（甲 → 乙）');
    const aCan = W.gear.canUse(m.id, '甲');
    const bCan = W.gear.canUse(m.id, '乙');
    a(aCan.pass === false && aCan.why === 'not-holder',
      'B5b: **原持有人当场失去使用权**（实 pass=' + aCan.pass + ' / why=' + aCan.why + '）—— 验收原文点名');
    a(bCan.pass === true, 'B5c: 借入方拿到使用权（实 pass=' + bCan.pass + '）');
    const u = W.gear.use(m.id, { by: '甲' });
    a(u.ok === false && u.reason === 'not-holder',
      'B5d: 原持有人真用一次 ⇒ 拒收 not-holder（实 ' + u.reason + '）—— 不只是读数，写口也拦');
    const self = W.gear.lend(m.id, '甲', { from: '乙' });
    a(self.ok === true, 'B5e: 归还（乙 → 甲）');
    a(W.gear.canUse(m.id, '甲').pass === true, 'B5f: 归还后原持有人恢复使用权');
  })();
  // B6 修理要材料 + **验收原文**：修好再归还，身份连续
  (function () {
    const W = envWith(ov).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    W.gear.use(m.id, { by: '甲', wear: 6 });
    const short = W.gear.repair(m.id, { by: '甲', material: '查无此料', amount: 1 });
    a(short.ok === false && short.reason === 'short-material',
      'B6: 材料不足 ⇒ short-material（实 ' + short.reason + '）—— 不凭空修好');
    const before = W.store.get().people['p_甲'].resources['铁'];
    const r = W.gear.repair(m.id, { by: '甲', material: '铁', amount: 2 });
    const after = W.store.get().people['p_甲'].resources['铁'];
    a(r.ok === true && r.spent === 2 && before - after === 2,
      'B6b: 修理真扣材料（铁 ' + before + '→' + after + '）');
    a(r.durability > 4 && r.repairs === 1, 'B6c: 耐久真回升（实 ' + r.durability + '）、修过次数累进（实 ' + r.repairs + '）');
    // 身份连续：id 不变
    a(W.gear.list('甲')[0].id === m.id, 'B6d: **修好之后 id 不变**（身份连续）');
    const nd = W.gear.repair(m.id, { by: '甲', material: '铁', amount: 1 });
    a(nd.reason === 'not-damaged' || nd.ok === true, 'B6e: 满耐久时如实报 not-damaged（或继续修到满）');
  })();
  // B7 物件身份/持有人/状态连续（跨借出-修好-归还全过程）
  (function () {
    const W = envWith(ov).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    W.gear.use(m.id, { by: '甲', wear: 3 });
    W.gear.lend(m.id, '乙', { from: '甲' });
    const mid = W.gear.list('乙')[0];
    a(mid.id === m.id && mid.holder === '乙' && mid.durability === 7,
      'B7: 借出后 id / 持有人 / 耐久三样都连续（' + mid.id + ' / ' + mid.holder + ' / ' + mid.durability + '）');
    W.gear.lend(m.id, '甲', { from: '乙' });
    const back = W.gear.list('甲')[0];
    a(back.id === m.id && back.holder === '甲' && back.uses === 1,
      'B7b: 归还后仍是同一件（id 不变、用过次数保留 ' + back.uses + ' 次）');
  })();
  // B8 装备槽按需启用 + 一槽一件
  (function () {
    const W = envWith(ov).WA;
    const m1 = W.gear.make('铁锤', { holder: '甲', durability: 5 });
    const m2 = W.gear.make('铁锤', { holder: '甲', durability: 5 });
    const ns = W.gear.equip(m1.id, '手');
    a(ns.ok === false && ns.reason === 'no-such-slot' && (ns.allowed || []).length === 0,
      'B8: 未声明的槽 ⇒ no-such-slot（实 ' + ns.reason + '）—— 装备槽**按需启用**');
    W.gear.declareSlot('手', { label: '手' });
    const e1 = W.gear.equip(m1.id, '手');
    a(e1.ok === true && e1.slot === '手', 'B8b: 声明后装备成功');
    const e2 = W.gear.equip(m2.id, '手');
    a(e2.ok === false && e2.reason === 'slot-taken' && e2.by === m1.id,
      'B8c: 一槽一件（实 ' + e2.reason + '，被 ' + e2.by + ' 占）—— 要换得先脱，不静默顶掉');
    const un = W.gear.unequip(m1.id);
    a(un.ok === true && un.was === '手', 'B8d: 卸下清空槽位（原槽 ' + un.was + '）');
    a(W.gear.equip(m2.id, '手').ok === true, 'B8e: 卸下之后另一件可装');
    const un2 = W.gear.unequip(m2.id);
    a(un2.ok === true, 'B8f: 可卸');
    a(W.gear.unequip(m2.id).reason === 'not-equipped',
      'B8g: 没装在槽上再卸 ⇒ not-equipped（与「槽被占了」分列）');
  })();
  // B9 携带三态封闭
  (function () {
    const W = envWith(ov).WA;
    const bad = W.gear.make('铁锤', { holder: '甲', carry: '挂在天上' });
    a(bad.ok === false && bad.reason === 'bad-carry' && (bad.allowed || []).length === 3,
      'B9: 自造携带态 ⇒ bad-carry（实 ' + JSON.stringify(bad.allowed) + '）—— 三态是封闭集');
    const ok = W.gear.make('铁锤', { holder: '甲', carry: 'stowed' });
    a(ok.ok === true && ok.carry === 'stowed', 'B9b: 三态各自可用（实 ' + ok.carry + '）');
    const rows = W.gear.list('甲', { heldOnly: true });
    a(rows.every(function (x) { return x.carry === 'held'; }), 'B9c: heldOnly 只列随身（实 ' + rows.length + ' 件）');
  })();
  // B10 存档是唯一真源
  (function () {
    const W = envWith(ov).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 5 });
    W.gear.use(m.id, { by: '甲', wear: 2 });
    const stored = JSON.stringify(W.store.get().gear);
    a(stored.indexOf(m.id) > 0, 'B10: 物件行**进存档**（不是模块内存）');
    const rl = W.gear.reload();
    a(rl.ok === true && rl.items === 1, 'B10b: reload() 从存档重建索引（实 ' + rl.items + ' 件）');
    a(W.gear.list('甲')[0].durability === 3, 'B10c: **重载后损耗保留**（实 ' + W.gear.list('甲')[0].durability + '）');
  })();

  /* ============ C 契约与边界 ============ */
  (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'C1: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();
  (function () {
    const s = rd(GR, ov);
    const code = s.split('\n').filter(function (ln) {
      const t = ln.replace(/^\s+/, '');
      return !(t.indexOf('//') === 0 || t.indexOf('*') === 0 || t.indexOf('/*') === 0);
    }).join('\n');
    a(cnt(code, 'store.transact') >= 8, 'C2: 引擎里有真写口（造/用/借/装/卸/修/槽/重置，实 ' + cnt(code, 'store.transact') + '）');
    a(code.indexOf('document') < 0 && code.indexOf('localStorage') < 0,
      'C2b: 代码面零 DOM / 零裸调 localStorage（剥注释后判）');
    a(code.indexOf('eval(') < 0 && code.indexOf('new Function') < 0, 'C2c: 零 eval / Function');
  })();
  (function () {
    // 不碰堆叠资源面（economy.goods）—— 两者分列是本项的核心分野
    const W = envWith(ov).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 5 });
    const before = JSON.stringify(W.store.get().economy || null);
    W.gear.use(m.id, { by: '甲', wear: 1 });
    W.gear.lend(m.id, '乙', { from: '甲' });
    a(JSON.stringify(W.store.get().economy || null) === before,
      'C3: 唯一物件的操作**不碰堆叠资源面**（economy.goods 逐字不变）—— 「物件生命周期」对「生产项目」的分工');
  })();
  (function () {
    const W = envWith(ov).WA;
    W.gear.make('铁锤', { holder: '甲', durability: 5 });
    const before = JSON.stringify(W.store.get());
    W.gear.list(''); W.gear.canUse(W.gear.list('')[0].id, '甲'); W.gear.view(); W.gear.stat();
    a(JSON.stringify(W.store.get()) === before, 'C4: 只读口不改世界（存档逐字不变）');
  })();

  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  await runNegative(a, ov);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
async function runNegative(a, ov) {
  ov = ov || {};
  const S = rd(GR, ov);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n').replace(/"/g, '\\"'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：使用不再按 id（改成按名字取第一件）⇒ 同型号两件分不开
  (function () {
    const S1 = brk(S, ANCHOR.grUseById.txt,
      "      const row = b.items.filter(function (x) { return x && clean(x.name, 40) === clean((itemOf(id) || {}).name, 40); })[0] || null;\n"
      + "      if (!row) { out = { ok: false, reason: 'unknown-item', id: id }; return false; }");
    const ov1 = {}; ov1[GR] = S1;
    const W = envWith(ov1).WA;
    const m1 = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    const m2 = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    W.gear.use(m2.id, { by: '甲', wear: 4 });
    const rows = W.gear.list('甲');
    const r1 = rows.filter(function (x) { return x.id === m1.id; })[0];
    a(r1.durability === 6,
      'N1: 破坏版上「用第二件」把**第一件**扣了（实 ' + r1.durability + '）⇒ 同型号两件分不开；'
        + '原版只扣被点名的那一件（B3c）⇒ 两向自证');
  })();
  // N2 破坏：物品真源不再校（本模块自认物件）⇒ 第二份真源出现
  (function () {
    const S2 = brk(S, ANCHOR.grEntity.txt, '    const rows = [{ name: k }];');
    const ov2 = {}; ov2[GR] = S2;
    const W = envWith(ov2).WA;
    const r = W.gear.make('查无此物', {});
    a(r.ok === true,
      'N2: 破坏版上没登记过的物件也能造（实 ok=' + r.ok + '）⇒ 第二份物品真源当场出现；'
        + '原版 entity-absent（B2）⇒ 两向自证');
  })();
  // N3 破坏：借出不改持有人（失权失效）
  (function () {
    const S3 = brk(S, ANCHOR.grLend.txt, "      row.carry = 'held';");
    const ov3 = {}; ov3[GR] = S3;
    const W = envWith(ov3).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    W.gear.lend(m.id, '乙', { from: '甲' });
    a(W.gear.canUse(m.id, '甲').pass === true,
      'N3: 破坏版上借出后原持有人**仍能用**（实 pass=' + W.gear.canUse(m.id, '甲').pass + '）⇒ 「借出即失权」当场失效；'
        + '原版 pass=false（B5b）⇒ 两向自证');
  })();
  // N4 破坏：装备槽那道闸摘掉 ⇒ 自造槽位被接受
  (function () {
    const S4 = brk(S, ANCHOR.grSlotGate.txt, "    void sl;");
    const ov4 = {}; ov4[GR] = S4;
    const W = envWith(ov4).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 5 });
    const r = W.gear.equip(m.id, '翅膀');
    a(r.ok === true,
      'N4: 破坏版上自造槽位也被接受（实 ok=' + r.ok + '）⇒ 「按需启用」当场失效；'
        + '原版 no-such-slot（B8）⇒ 两向自证');
  })();
  // N5 破坏：耗尽闸摘掉 ⇒ 用坏了的还能用
  (function () {
    //   ⚠ 耗尽闸是**纵深两层**（前置那条 + 事务内那条）—— 只摘一处，另一处照样拦，
    //     判据会读到 ok=false（首跑实测）。故两处一起摘：这样才是在证「这道闸拦着」。
    const S5 = S.split(ANCHOR.grWorn.txt).join('    void it;')
      .split("      if ((num(row.durability) || 0) <= 0) { out = { ok: false, reason: 'worn-out', id: id, name: row.name }; return false; }")
      .join('      void row;');
    if (cnt(S5, 'worn-out') === cnt(S, 'worn-out')) throw new Error('N5 破坏未生效');
    const ov5 = {}; ov5[GR] = S5;
    const W = envWith(ov5).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 1 });
    W.gear.use(m.id, { by: '甲', wear: 1 });
    const again = W.gear.use(m.id, { by: '甲' });
    a(again.ok === true,
      'N5: 破坏版上耗尽后还能用（实 ok=' + again.ok + '）⇒ 耗尽闸失效；原版 worn-out（B4b）⇒ 两向自证');
  })();
  // N6 破坏：修理不再看材料 ⇒ 凭空修好
  (function () {
    //   ⚠ 同 N5：材料闸也是**纵深两层**（前置 `have < need` + 事务内 `(num(pur[…]) || 0) < need`）。
    const S6 = S.split(ANCHOR.grMat.txt).join('    void have;')
      .split("      if (!pur || (num(pur[material]) || 0) < need) { out = { ok: false, reason: 'short-material', material: material, need: need }; return false; }")
      .join('      void pur;');
    if (cnt(S6, 'short-material') === cnt(S, 'short-material')) throw new Error('N6 破坏未生效');
    const ov6 = {}; ov6[GR] = S6;
    const W = envWith(ov6).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    W.gear.use(m.id, { by: '甲', wear: 5 });
    const r = W.gear.repair(m.id, { by: '甲', material: '查无此料', amount: 1 });
    a(r.ok === true,
      'N6: 破坏版上没材料也能修（实 ok=' + r.ok + '）⇒ 「修理要材料」当场失效；'
        + '原版 short-material（B6）⇒ 两向自证');
  })();
  // N7 破坏：一槽一件那道闸摘掉 ⇒ 同槽两件并存
  (function () {
    const S7 = brk(S, ANCHOR.grSlotTaken.txt, '      void taken;');
    const ov7 = {}; ov7[GR] = S7;
    const W = envWith(ov7).WA;
    W.gear.declareSlot('手');
    const m1 = W.gear.make('铁锤', { holder: '甲', durability: 5 });
    const m2 = W.gear.make('铁锤', { holder: '甲', durability: 5 });
    W.gear.equip(m1.id, '手');
    const r = W.gear.equip(m2.id, '手');
    a(r.ok === true && W.gear.list('甲').filter(function (x) { return x.slot === '手'; }).length === 2,
      'N7: 破坏版上同槽并存两件（实 ' + W.gear.list('甲').filter(function (x) { return x.slot === '手'; }).length
        + ' 件）⇒ 「一槽一件」失效；原版 slot-taken（B8c）⇒ 两向自证');
  })();
  // N8 破坏：携带三态不校 ⇒ 自造态被接受
  (function () {
    const S8 = brk(S, ANCHOR.grCarry.txt, '    void carry;');
    const ov8 = {}; ov8[GR] = S8;
    const W = envWith(ov8).WA;
    const r = W.gear.make('铁锤', { holder: '甲', carry: '挂在天上' });
    a(r.ok === true,
      'N8: 破坏版上自造携带态被接受（实 ok=' + r.ok + '）⇒ 三态封闭失效；原版 bad-carry（B9）⇒ 两向自证');
  })();
  // N9 破坏：修好之后 id 变了（身份不连续）
  (function () {
    const S9 = brk(S, ANCHOR.grRepair.txt,
      "      row.id = row.id + '_fixed'; row.repairs = (num(row.repairs) || 0) + 1;");
    const ov9 = {}; ov9[GR] = S9;
    const W = envWith(ov9).WA;
    const m = W.gear.make('铁锤', { holder: '甲', durability: 10 });
    W.gear.use(m.id, { by: '甲', wear: 5 });
    W.gear.repair(m.id, { by: '甲', material: '铁', amount: 1 });
    const after = W.gear.list('甲')[0];
    a(after.id !== m.id,
      'N9: 破坏版上修好之后 id 变了（' + m.id + ' → ' + after.id + '）⇒ 身份不连续；'
        + '原版 id 不变（B6d）⇒ 两向自证');
  })();
  // N10 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-EXP2', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N10: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N10b: 锚点不唯一必须抛');
  // N11 真源码逐字未变
  a(rd(GR) === S, 'N11: 被破坏过的引擎真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    console.log('\nEXP2-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}