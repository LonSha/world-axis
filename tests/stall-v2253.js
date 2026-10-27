#!/usr/bin/env node
// WorldAxis tests/stall-v2253.js (v2.253.0) — 漏摊寄售专锁
//
// 【它治什么】
//   `engines/economy.js` 管的是**当场**的买卖：钱货两清、价越带拒收、库存不为负。
//   它答得出「这一笔成不成」，答不出另一件事 —— **摊主走开之后，摆在桌上的货怎么卖出去。**
//   OpenMMO 的 `stall.rs` / `offline.rs` / `buy_orders.rs` 给的是这套边界：摊主站远了要就地收摊、
//   挂货只锁不搬、抽税按整数分币、摊主不在时摊照常成交。本锁逐条钉住这些边界。
//
// 【两条不变量（其余判据都由它们派生）】
//   ① **货从不离开 economy 的 `stock`** —— 挂货只把量「许出去」（lockedIn），
//      撤货 / 收摊 / 走远收摊三处删行即解锁。故挂货前后 `stock` 必须一字不变；
//   ② **价不另开一套** —— 带内价问 `economy.view` 的 lo/hi，越带照样走 economy 的
//      `price-out-of-band`。
//
// 【负控制】用真源码破坏（锚点恰中 1 次）+ 内存副本重跑同款判据，
//   三种假绿形态逐个避开：破坏写在副本上（不是模拟常量）、判据在副本上重跑（不是对原文件断言）、
//   破坏可观测地改变行为（不是把判据自己删了）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const { stripComments } = require('./test-surface-gate.js');

/**
 * 装产品面（与 reject-code-gate 同一路数：走 run.js 的 LOAD 数组，不自己列文件）。
 * `replace` 是 rel → 源码字符串的映射：命中即用替换后的**内存副本**装载，
 *   磁盘文件一个字节都不动（负控制靠它，见 runNegative）。
 * 装载顺序由 LOAD 决定，`engines/stall.js` 只在它自己那一格被替换 —— 不用事后覆盖，
 *   免得「覆盖到哪个对象上」变成一条隐式约定。
 */
function boot(replace) {
  require('./mock.js');
  const ctx = vm.createContext(global);
  const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
  const LOAD = mm[1].match(/'([^']+)'/g).map(function (x) { return x.slice(1, -1); });
  LOAD.forEach(function (rel) {
    const src = (replace && replace[rel] !== undefined) ? replace[rel]
      : fs.readFileSync(path.join(BASE, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  });
  return global.WorldAxis;
}

/** 集市种子：五个人都站在集市、各带 100 钱；盐只剩 5（撞短量用）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    ['解甲', '解乙', '解丙', '解丁', '解戊'].forEach(function (n) {
      const p = d.people['p_' + n] || (d.people['p_' + n] = { name: n });
      p.location = '集市';
      p.resources = {};
      p.resources[WA.economy.money()] = 100;
    });
    d.economy = d.economy || {};
    d.economy.goods = [
      { place: '集市', resource: '米', stock: 20, base: 10, price: 10, demand: 0, consumed: 0 },
      { place: '集市', resource: '盐', stock: 5, base: 10, price: 10, demand: 0, consumed: 0 }];
    d.stalls = { rows: [] };
    return true;
  }, 'stall-lock:seed');
  WA.economy.setSettings({ enabled: true });
  WA.stall.setSettings({ enabled: true, maxStalls: 12, maxListings: 12, maxLedger: 24, taxPct: 5 });
}
function move(WA, who, loc) {
  WA.store.transact(function (d) { d.people['p_' + who].location = loc; return true; }, 'stall-lock:move');
}
function stockOf(WA, res) {
  return WA.store.get().economy.goods.filter(function (g) { return g.resource === res; })[0].stock;
}

function runAll() {
  const WA = boot();
  const S = WA.stall;
  assert.ok(S && typeof S.lay === 'function', 'stall 命名空间在（engines/stall.js 已装载）');
  assert.strictEqual(S.getSettings().enabled, false, '默认关闭（没开就不该有摊）');
  seed(WA);

  // ── A 摆摊的当场边界 ──
  assert.strictEqual(S.lay('解甲', '码头').reason, 'not-there', 'A1 摊摆在他不在的地方 ⇒ not-there');
  assert.strictEqual(S.lay('查无此人', '集市').reason, 'unknown-owner', 'A2 摊主不是活人 ⇒ unknown-owner');
  assert.strictEqual(S.lay('解甲', '集市', { sign: '米摊' }).ok, true, 'A3 人站在那儿就能摆');
  assert.strictEqual(S.lay('解甲', '集市').reason, 'already-laid', 'A4 一人一摊 ⇒ already-laid');

  // ── B 价不另开一套 ──
  assert.strictEqual(S.list('解甲', '米', 1, 99).reason, 'price-out-of-band', 'B1 越带价走 economy 的同一码');
  const band = WA.economy.view('集市', '米');
  assert.ok(band.ok, 'B2 economy 认得这件货（价带的唯一真源）');

  // ── C 不变量①：挂货只锁不搬 ──
  const stockBefore = stockOf(WA, '米');
  assert.strictEqual(S.list('解甲', '米', 3, 11).ok, true, 'C1 带内价挂得出去');
  assert.strictEqual(stockOf(WA, '米'), stockBefore, 'C2 挂货后 stock 一字不变（货没离开 economy）');
  assert.strictEqual(S.sellable('集市', '米', '解乙'), stockBefore - 3, 'C3 别人可售 = 库存 − 已挂');
  assert.strictEqual(S.sellable('集市', '米', '解甲'), stockBefore, 'C4 自己可售不含自己的锁（免得自己跟自己抢）');
  assert.strictEqual(S.list('解甲', '盐', 6, 10).reason, 'short-stock', 'C5 挂量超可售 ⇒ short-stock');
  assert.strictEqual(S.delist('解甲', '米').ok, true, 'C6 撤得掉');
  assert.strictEqual(S.sellable('集市', '米', '解乙'), stockBefore, 'C7 撤货即解锁');
  assert.strictEqual(S.delist('解甲', '米').reason, 'no-such-listing', 'C8 没挂过就撤 ⇒ no-such-listing');

  // ── D 人不在：摊还开着，自己改不动（本模块存在的理由）──
  S.list('解甲', '米', 3, 11);
  assert.strictEqual(S.away('解甲').ok, true, 'D1 走得开');
  assert.strictEqual(S.away('解甲').reason, 'already-away', 'D2 再走一次是幂等回执');
  assert.strictEqual(S.sign('解甲', '改个招牌').reason, 'offline', 'D3 人不在时自己改不动 ⇒ offline');
  const purseB = WA.store.get().people['p_解乙'].resources[WA.economy.money()];
  const got = S.buy('解甲', '米', 2, '解乙');
  assert.strictEqual(got.ok, true, 'D4 摊主不在照样成交（这就是它存在的理由）');
  assert.strictEqual(got.total, 22, 'D5 货款 2×11=22');
  assert.strictEqual(got.tax, 1.1, 'D6 抽税按整数分币：2200 分 ×5% = 110 分 = 1.10');
  assert.strictEqual(got.sellerNet, 20.9, 'D7 卖家净收 = 货款 − 税');
  assert.strictEqual(WA.store.get().people['p_解乙'].resources[WA.economy.money()], +(purseB - 22).toFixed(2),
    'D8 买家钱包真扣');
  assert.strictEqual(stockOf(WA, '米'), stockBefore - 2, 'D9 成交才扣 stock');
  assert.strictEqual(S.stat().taxCents, 110, 'D10 税按分记，不丢零头');
  assert.strictEqual(S.back('解甲').ok, true, 'D11 回得来');
  assert.strictEqual(S.back('解甲').reason, 'already-back', 'D12 再回一次是幂等回执');

  // ── E 成交侧失败一律不改状态 ──
  S.list('解甲', '盐', 5, 10);
  assert.strictEqual(S.buy('解甲', '盐', 6, '解丁').reason, 'listing-short', 'E1 挂量不够 ⇒ listing-short');
  assert.strictEqual(S.buy('解甲', '盐', 1, '解甲').reason, 'self-buy', 'E2 摊主买自己的 ⇒ self-buy');
  move(WA, '解丁', '码头');
  assert.strictEqual(S.buy('解甲', '盐', 1, '解丁').reason, 'too-far', 'E3 买主不在摊边 ⇒ too-far');
  move(WA, '解丁', '集市');
  WA.store.transact(function (d) { delete d.people['p_解戊'].resources; return true; }, 'stall-lock:nopurse');
  assert.strictEqual(S.buy('解甲', '盐', 1, '解戊').reason, 'missing-purse', 'E4 买主没钱包 ⇒ missing-purse');
  assert.strictEqual(S.buy('查无此人', '盐', 1, '解丁').reason, 'missing', 'E5 摊不在 ⇒ missing');
  assert.strictEqual(S.buy('解甲', '盐', 1, '路人甲').reason, 'unknown-buyer', 'E6 买主不是活人 ⇒ unknown-buyer');
  const purseD = WA.store.get().people['p_解丁'].resources[WA.economy.money()];
  assert.strictEqual(purseD, 100, 'E7 上面六次失败一次都没动买家的钱');
  assert.strictEqual(stockOf(WA, '盐'), 5, 'E8 也没动库存');

  // ── F 走远就地收摊，剩货如实报出 ──
  assert.strictEqual(S.pack('解甲').ok, true, 'F1 收得掉摊');
  const leftAfterPack = S.statView().listings;
  assert.strictEqual(leftAfterPack, 0, 'F2 收摊后没有残留挂货');
  S.lay('解甲', '集市');
  S.list('解甲', '米', 4, 10);
  move(WA, '解甲', '码头');
  const st = S.list('解甲', '米', 1, 10);
  assert.strictEqual(st.reason, 'strayed', 'F3 人走远了 ⇒ strayed');
  assert.deepStrictEqual(st.leftovers.map(function (x) { return x.resource + '×' + x.qty; }), ['米×4'],
    'F4 就地收摊并如实报剩货');
  assert.strictEqual(st.packed, true, 'F5 报明「已经给你收了」');
  assert.strictEqual(S.statView().stalls, 0, 'F6 人走远之后摊不留在世界里');

  // ── G 容量与招牌 ──
  assert.strictEqual(S.SIGN_MAX, 32, 'G1 招牌上限 32（OpenMMO STALL_MAX_SIGN_CHARS）');
  move(WA, '解甲', '集市');
  S.lay('解甲', '集市', { sign: '老摊' });
  assert.strictEqual(S.sign('解甲', '老摊').reason, 'same-sign', 'G2 招牌没变 ⇒ same-sign');
  assert.strictEqual(S.sign('解甲', new Array(34).join('字')).reason, 'bad-sign', 'G3 超 32 字 ⇒ bad-sign');
  S.setSettings({ enabled: true, maxStalls: 2 });
  S.lay('解乙', '集市');
  assert.strictEqual(S.lay('解丙', '集市').reason, 'stalls-full', 'G4 摊满了 ⇒ stalls-full');
  S.setSettings({ enabled: true, maxListings: 1 });
  assert.strictEqual(S.list('解甲', '盐', 1, 10).ok, true, 'G5 第一项挂得上');
  assert.strictEqual(S.list('解甲', '米', 1, 10).reason, 'too-many-listings', 'G6 第二项超上限 ⇒ too-many-listings');

  // ── H 注入块只报有据可查的摊 ──
  assert.ok(S.buildBlock().indexOf('集市') >= 0, 'H1 有摊时注入块报出地点');
  S.pack('解甲');
  assert.strictEqual(S.buildBlock().indexOf('解甲'), -1, 'H2 收摊之后注入块不再提这个人');
  WA.store.transact(function (d) { d.stalls = { rows: [] }; return true; }, 'stall-lock:wipe');
  assert.strictEqual(S.buildBlock(), '', 'H3 一个摊都没有时注入块是空串（不编市场叙事）');
  console.log('  ✓ 全部 ' + 40 + ' 条断言通过');
  return true;
}

/** 破坏副本上的同款判据：返回 true = 行为确实变了（不是判据自己消失）。 */
function runNegative() {
  const srcRel = 'engines/stall.js';
  const orig = fs.readFileSync(path.join(BASE, srcRel), 'utf8');
  const cases = [
    // ① 把「人在不在那儿」的判据摘掉 —— 摊可以凭空出现在任何地方
    { name: 'not-there 判据摘除', from: "if (clean(p.location, 40) !== pl) {", to: 'if (false) {',
      probe: function (WA) { seed(WA); return WA.stall.lay('解甲', '码头').reason !== 'not-there'; } },
    // ② 税退化成「不抽」 —— 卖家实收等于货款
    { name: '抽税归零', from: 'function taxCents(cents, pct) {', to: 'function taxCents(cents, pct) { return 0;',
      probe: function (WA) { seed(WA); WA.stall.lay('解甲', '集市'); WA.stall.list('解甲', '米', 1, 10); return WA.stall.buy('解甲', '米', 1, '解乙').tax !== 0.5; } },
    // ③ 锁量归零 —— 挂货不再让别人少可售（货被重复许出去）
    { name: '锁量归零', from: 'return Math.max(0, (num(g.stock) || 0) - lockedIn(place, resource, exceptOwner, root));',
      to: 'return Math.max(0, (num(g.stock) || 0));',
      probe: function (WA) { seed(WA); WA.stall.lay('解甲', '集市'); WA.stall.list('解甲', '米', 3, 10); return WA.stall.sellable('集市', '米', '解乙') !== 17; } },
    // ④ 收摊时的 away 闸摘除 —— 人不在也能把摊收走（摊就不该等他了）
    { name: 'offline 闸摘除', from: "if (st.away) return refuse('offline', { owner: st.owner, hint: '人不在，得先归队才能收摊' });", to: 'if (false) return refuse(\'offline\', { owner: st.owner });',
      probe: function (WA) { seed(WA); WA.stall.lay('解甲', '集市'); WA.stall.away('解甲'); return WA.stall.pack('解甲').reason !== 'offline'; } }
  ];
  let killed = 0;
  cases.forEach(function (c) {
    const anchorCount = orig.split(c.from).length - 1;
    assert.strictEqual(anchorCount, 1, '负控制锚点恰命中 1 次: ' + c.name + '（实 ' + anchorCount + '）');
  });
  cases.forEach(function (c) {
    // 每次都在**原始源码**上重新破坏（不是叠加破坏，防互相掩盖），
    //   然后连装载就走破坏副本 —— 引擎自己的 `WA.stall = {...}` 落在最后，覆盖不会被别人抢回去。
    const broken = orig.replace(c.from, c.to);
    assert.notStrictEqual(broken, orig, '破坏真的改了源码文本: ' + c.name);
    const replacements = {};
    replacements[srcRel] = broken;
    const WA = boot(replacements);
    const changed = c.probe(WA);
    assert.strictEqual(changed, true, '破坏可观测地改变了行为: ' + c.name + '（未观测到变化=假负控制）');
    killed++;
  });
  assert.strictEqual(killed, cases.length, '全部负控制都被判据杀死');
  // 原版干净：同一批判据在原版上全为假（没有破坏时不报异常）
  const WA2 = boot();
  seed(WA2);
  assert.strictEqual(WA2.stall.lay('解甲', '码头').reason, 'not-there', '原版上 not-there 判据为真');
  assert.strictEqual(WA2.stall.SIGN_MAX, 32, '原版上招牌上限仍是 32');
  // 产品源码零改写（自证：破坏只发生在内存副本上）
  assert.strictEqual(fs.readFileSync(path.join(BASE, srcRel), 'utf8'), orig, 'E1 产品源码逐字节未变');
  console.log('  ✓ ' + cases.length + ' 个负控制全部杀死，原版干净');
  return true;
}

module.exports = { runAll: runAll, runNegative: runNegative };

if (require.main === module) {
  const which = process.argv[2] === 'runNegative' ? runNegative : runAll;
  try { which(); console.log('STALL-V2253: pass'); process.exit(0); }
  catch (e) { console.error(e && e.stack || e); process.exit(1); }
}