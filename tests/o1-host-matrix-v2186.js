#!/usr/bin/env node
'use strict';
/**
 * WorldAxis tests/o1-host-matrix-v2186.js — 真实宿主验收矩阵（计划 O1 · v2.186.0）
 *
 * 【本锁做什么】为三个代表模块（TX1 外交 / TX3 运输 / TX4 剧情选择）各定义四条路径 ——
 *   成功 / 拒收 / 重载 / 重复，并**在两个宿主上**跑同一批判据：
 *     · B 面（无头 mini-DOM，`gate.fresh`）：不需要浏览器，判引擎侧行为与守恒；
 *     · C 面（真浏览器，`LIVE.runLive`）：走**真控件点击**，判「面板接的线到底通不通」。
 *
 * 【为什么选这三个】TX1 是纯写口模块（无 UI 读面也能判）；TX3 有守恒面（扣减可数）；
 *   TX4 有 present/confirm 两段（重复路径天然存在）。其余六个模块的同族路径由同一模板覆盖，
 *   不在这里各写一遍（矩阵是**代表制**，不是清单复制）。
 *
 * 【v2.186.0 实测抓到的东西 · 三条都属「无头全绿、真宿主不绿」】
 *   ① 面板「发运」此前只传 `transitDays`，**没有目的地基础价入口** ⇒ 引擎对「目的地首次
 *      进货」依约拒收 `missing-base` ⇒ 新目的地首运在 UI 上**永远做不成**：控件在、路径不通。
 *      修法：面板补 `#wa-fr-base`（空值 ≡ 不传，旧行为不变）。本锁 C1 就是这条的常驻判据。
 *   ② TX1 的提案前置是「两家势力必须已在册」；本锁夹具必须**真造势力**（走 editorFaction
 *      的真实入账口），否则 `unknown-faction` 会被误读成「模块坏了」。
 *   ③ 「重载」路径此前只能用「同会话读写往返」顶替 —— 那不构成重载证据。本版给实机通道
 *      加了 `opts.reloadProbe`：**同 profile 内第二次真导航**（页内一切态作废）后重新装载
 *      再复读盘上状态。C3 因此从「降级声明」升级为**真重载**。
 *
 * 【四层判据】A 结构（锁自己会不会自欺）/ B 无头 / C 宿主 / N 负控制。
 *   N 面按仓规做两向自证：**先破坏真源码（锚点必须恰中一次）→ 再在破坏副本上跑同款判据**，
 *   确认 C 面绿灯来自真接线，而不是来自「按钮点了个空」。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const gate = require('./ui-gate-sync.js');
const LIVE = require('./ui-live.js');
const REL_FR = 'engines/freight.js';
const REL_PANEL = 'ui/panel.js';
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }

/** 三个模块 × 四路径：**单一真源**（B 面与 C 面读同一份，少一处即少一条路径）。 */
const MATRIX = {
  TX1: { label: '势力外交', engine: 'diplomacy' },
  TX3: { label: '守恒运输', engine: 'freight' },
  TX4: { label: '剧情选择', engine: 'storyChoice' }
};
const PATHS = ['成功', '拒收', '重载', '重复'];
/** C 面控件锚点（真控件的 id；面板里必须恰 1 次）。 */
const CTRLS = {
  TX3: ['wa-fr-route', 'wa-fr-from', 'wa-fr-res', 'wa-fr-qty', 'wa-fr-days', 'wa-fr-base', 'wa-fr-dispatch', 'wa-fr-out'],
  TX1: ['wa-dp-enabled', 'wa-dp-from', 'wa-dp-to', 'wa-dp-terms', 'wa-dp-propose', 'wa-dp-out'],
  TX4: ['wa-sc-enabled', 'wa-sc-prompt', 'wa-sc-opts', 'wa-sc-present', 'wa-sc-id', 'wa-sc-option', 'wa-sc-confirm', 'wa-sc-out']
};

// ── 页内夹具（走真入账口，不直接写内存）──────────────────────────────────
/** TX3 货物/路线夹具：`transact` 是公开写口 ⇒ 夹具经它入账（不是改内存态幻觉）。 */
const FIXTURE_FR = [
  'WA.store.transact(function (d) {',
  '  d.economy = { goods: [], orders: [], routes: [] };',
  "  d.economy.routes.push({ id: 'r1', lane: 'road', from: '城中集市', to: '北方关口', cost: 10, status: 'open', reason: '', at: 1000, updatedAt: 1000 });",
  "  d.economy.goods.push({ place: '城中集市', resource: '布匹', base: 5, stock: 20, price: 5, demand: 0, consumed: 0, tickedAt: '', at: 1000, updatedAt: 1000 });",
  "}, 'o1:fixture');",
  'WA.freight.setSettings({ enabled: true });'
].join('\n');
/** TX1 势力夹具：经 `editorFaction.add` 真入账（它是势力名录的真写口）。 */
const FIXTURE_DP = [
  'WA.store.transact(function (d) {',
  '  d.evolution = d.evolution || {};',
  '  d.evolution.factions = [];',
  "  ['甲盟', '乙邦'].forEach(function (nm) {",
  "    // 五要件缺一不可（实测：漏 core_person ⇒ add 拒收「缺少要件」，势力没入册）",
  "    WA.editorFaction.add(d, { name: nm, scope: '郡', status: '稳固', relation: '中立', currentGoal: '守境', core_person: '守将', powerPillars: ['兵'] });",
  '  });',
  "}, 'o1:tx1fixture');",
  'WA.diplomacy.setSettings({ enabled: true });'
].join('\n');

/**
 * 生成一条「真控件点击」场景的页内源码。scenario 参数都是**字面量**（本锁自己拼），不来自外部输入。
 */
function sceneSource(opts) {
  const L = [];
  L.push('(function () {');
  L.push('  var WA = window.WorldAxis;');
  L.push('  var doc = WA.mainDoc || document;');
  L.push('  var q = function (s) { return doc.querySelector(s); };');
  L.push('  var seq = [];');
  L.push('  try {');
  L.push("    var t = q('.wa-tab[data-page=\"events\"]');");
  L.push('    if (t) { t.click(); seq.push("切到 events 页"); }');
  L.push('    var set = function (sel, v) { var e = q(sel); if (e) { e.value = v; seq.push("填 " + sel); } return !!e; };');
  if (opts.fixtureFr) { L.push('    ' + FIXTURE_FR.split('\n').join('\n    ')); L.push('    seq.push("夹具 TX3：路线 r1 + 布匹×20");'); }
  if (opts.fixtureDp) { L.push('    ' + FIXTURE_DP.split('\n').join('\n    ')); L.push('    seq.push("夹具 TX1：势力 甲盟 / 乙邦");'); }
  if (opts.tx3) {
    L.push('    if (!set("#wa-fr-route", "r1")) return { fatal: "no-route" };');
    L.push('    set("#wa-fr-from", "城中集市"); set("#wa-fr-res", "布匹");');
    L.push('    set("#wa-fr-qty", "10"); set("#wa-fr-days", "3");');
    // 总开关默认是关的（handler 会在调 dispatch **之前**早退，于是 lastReason 永远为空）——
    //   场景自己开闸，让判据落在 dispatch 的拒收上，而不是落在开关早退上。
    L.push('    WA.freight.setSettings({ enabled: true });');
    // 总开关默认是关的（handler 会在调 dispatch **之前**早退，于是 lastReason 永远为空）——
    //   场景自己开闸，让判据落在 dispatch 的拒收上，而不是落在开关早退上。
    L.push('    WA.freight.setSettings({ enabled: true });');
    if (opts.withBase) L.push('    set("#wa-fr-base", "6");');
    L.push('    var btn = q("#wa-fr-dispatch");');
    L.push('    if (!btn) return { fatal: "no-dispatch" };');
    L.push('    var stock0 = (function () { var g = (WA.store.get().economy || {}).goods || []; return g.length ? g[0].stock : null; })();');
    L.push('    var raw0 = (window.localStorage.getItem("worldaxis_state_ui_live_chat") || "").length;');
    L.push('    seq.push("点击 #wa-fr-dispatch");');
    L.push('    btn.click();');
    if (opts.clickTwice) {
      L.push('    seq.push("再次点击 #wa-fr-dispatch");');
      L.push('    var b2 = q("#wa-fr-dispatch"); if (b2) b2.click();');
    }
    L.push('    var outEl = q("#wa-fr-out");');
    L.push('    var goods = ((WA.store.get().economy || {}).goods) || [];');
    L.push('    var rows = ((WA.store.get().freight || {}).shipments) || [];');
    L.push('    var stat = (function () { try { return WA.freight.stat(); } catch (e) { return { err: String(e && e.message) }; } })();');
    L.push('    return { seq: seq,');
    L.push('      out: outEl ? String(outEl.textContent || "").slice(0, 160) : null,');
    L.push('      stockBefore: stock0, stockAfter: goods.length ? goods[0].stock : null,');
    L.push('      rowCount: rows.length, sid: rows.length ? rows[0].id : null,');
    L.push('      rows: rows.map(function (x) { return { id: x.id, status: x.status, qty: x.qty, from: x.from, to: x.to }; }),');
    L.push('      rawLenHint: raw0,');
    L.push('      stat: stat, lastReason: stat.lastReason };');
  } else if (opts.tx1) {
    L.push('    if (!set("#wa-dp-from", "' + (opts.dpFrom || '甲盟') + '")) return { fatal: "no-dp-from" };');
    L.push('    set("#wa-dp-to", "' + (opts.dpTo || '乙邦') + '");');
    L.push('    set("#wa-dp-terms", "trade");');
    L.push('    var dpBtn = q("#wa-dp-propose");');
    L.push('    if (!dpBtn) return { fatal: "no-dp-propose" };');
    L.push('    seq.push("点击 #wa-dp-propose");');
    L.push('    dpBtn.click();');
    L.push('    var out1 = String((q("#wa-dp-out") || {}).textContent || "").slice(0, 160);');
    L.push('    var prop1 = Object.keys((WA.store.get().diplomacy || {}).proposals || {}).length;');
    L.push('    // 第二条：把受方清空 ⇒ 同一按钮应当**如实拒收**（missing-fields），且盘上零新增');
    L.push('    set("#wa-dp-to", "");');
    L.push('    q("#wa-dp-propose").click();');
    L.push('    var out2 = String((q("#wa-dp-out") || {}).textContent || "").slice(0, 160);');
    L.push('    var prop2 = Object.keys((WA.store.get().diplomacy || {}).proposals || {}).length;');
    L.push('    return { seq: seq, outOk: out1, outReject: out2, proposalsAfterOk: prop1, proposalsAfterReject: prop2,');
    L.push('      stat: (function () { try { return WA.diplomacy.stat(); } catch (e) { return { err: String(e && e.message) }; } })() };');
  } else if (opts.tx4) {
    L.push('    // TX4 的两个开关默认都是关的 —— 场景自己走真产品写口打开（不猜、不绕过）');
    L.push('    WA.storyChoice.setSettings({ enabled: true });');
    L.push('    if (WA.branchTree && WA.branchTree.setSettings) WA.branchTree.setSettings({ enabled: true });');
    L.push('    set("#wa-sc-round", "1");');
    L.push('    if (!set("#wa-sc-prompt", "往东还是往西")) return { fatal: "no-sc-prompt" };');
    L.push('    set("#wa-sc-opts", "往东,往西");');
    L.push('    var pBtn = q("#wa-sc-present");');
    L.push('    if (!pBtn) return { fatal: "no-sc-present" };');
    L.push('    seq.push("点击 #wa-sc-present");');
    L.push('    pBtn.click();');
    L.push('    var outPresent = String((q("#wa-sc-out") || {}).textContent || "").slice(0, 160);');
    L.push('    var pend = WA.storyChoice.pending();');
    L.push('    var pid = (pend.points && pend.points.length) ? pend.points[0].id : null;');
    L.push('    if (!pid) {  // 登记没成：这是一个**可断言状态**，不是场景中断（交给判据分开问）');
    L.push('      return { seq: seq, outPresent: outPresent, pendingAfterPresent: pend.count,');
    L.push('        pendingAfterConfirm: null, outConfirm1: null, outConfirm2: null, choice: null, applied: null };');
    L.push('    }');
    L.push('    set("#wa-sc-id", pid); set("#wa-sc-option", "往东");');
    L.push('    var cBtn = q("#wa-sc-confirm");');
    L.push('    seq.push("点击 #wa-sc-confirm");');
    L.push('    cBtn.click();');
    L.push('    var outConfirm1 = String((q("#wa-sc-out") || {}).textContent || "").slice(0, 160);');
    L.push('    var pend2 = WA.storyChoice.pending();');
    L.push('    seq.push("再次点击 #wa-sc-confirm");');
    L.push('    q("#wa-sc-confirm").click();');
    L.push('    var outConfirm2 = String((q("#wa-sc-out") || {}).textContent || "").slice(0, 160);');
    L.push('    var rv = WA.storyChoice.review(pid);');
    L.push('    return { seq: seq, pointId: pid, outPresent: outPresent, outConfirm1: outConfirm1, outConfirm2: outConfirm2,');
    L.push('      pendingAfterPresent: pend.count, pendingAfterConfirm: pend2.count,');
    L.push('      choice: rv && rv.choice, applied: rv && rv.applied };');
  }
  L.push('  } catch (e) { return { fatal: String((e && e.message) || e) }; }');
  L.push('})()');
  return L.join('\n');
}

/** 重载后复读（真导航之后求值）：只读盘上状态，**不点控件**。 */
const RELOAD_SOURCE = [
  '(function () {',
  '  var WA = window.WorldAxis;',
  '  try {',
  '    var g = WA.store.get();',
  '    var rows = (((g.freight || {}).shipments) || []);',
  '    var prop = Object.keys(((g.diplomacy || {}).proposals) || {}).length;',
  '    return { chatId: (WA.store.chatId && WA.store.chatId()) || null,',
  '      stock: ((((g.economy || {}).goods) || [])[0] || {}).stock,',
  '      rows: rows.length, sid: rows.length ? rows[0].id : null,',
  '      view: rows.length ? WA.freight.view(rows[0].id) : null,',
  '      proposals: prop,',
  '      freightEnabled: WA.freight.getSettings().enabled,',
  '      rawLen: (window.localStorage.getItem("worldaxis_state_ui_live_chat") || "").length };',
  '  } catch (e) { return { fatal: String((e && e.message) || e) }; }',
  '})()'
].join('\n');

// ── A 结构面 ─────────────────────────────────────────────────────────────
function runA(a) {
  const live = read('tests/ui-live.js');
  const pn = read(REL_PANEL);
  const p = LIVE.probe();
  a(!!p.tier, 'A1 实机通道探针可用（tier=' + p.tier + '）');
  a(live.indexOf('opts.probeSource') > 0 && live.indexOf('opts.afterLoad') > 0
    && live.indexOf('opts.reloadProbe') > 0,
    'A1 三条页内接缝都在位（afterLoad 造病灶 / probeSource 取读数 / reloadProbe 真重载后复读）');
  a(live.indexOf('CLICK_SOURCE') > 0 && live.indexOf('ROUNDTRIP_SOURCE') > 0,
    'A1 通道既有两段（逐页点控件 / 设置往返）未被替换（本锁只**加**路径面）');
  const miss = [];
  Object.keys(CTRLS).forEach(function (k) {
    CTRLS[k].forEach(function (id) {
      const n = cnt(pn, 'id="' + id + '"');
      if (n !== 1) miss.push(id + '(' + n + ')');
    });
  });
  a(miss.length === 0, 'A2 矩阵控件 id 在面板恰各 1 次（异常：' + (miss.join(',') || '无') + '）');
  const n = Object.keys(MATRIX).length * PATHS.length;
  a(n === 12, 'A3 矩阵规模 ' + n + ' 条路径（' + Object.keys(MATRIX).length + ' 模块 × ' + PATHS.length + ' 路径）');
  a(typeof LIVE.runLive === 'function' && typeof gate.fresh === 'function', 'A4 两个宿主面都可用（宿主 / 无头）');
  a(cnt(pn, 'wa-fr-base') >= 2 && pn.indexOf('base: base') > 0,
    'A5 面板「发运」已带目的地基础价入口（渲染一处 + 传参一处）—— 本版修好的缺口有常驻判据');
}

// ── B 无头面（mini-DOM）：同判据、不同宿主 ────────────────────────────────
function runB(a) {
  // ══ TX3 守恒运输 ══
  const WA = gate.fresh({}).WA;
  const F = WA.freight;
  a(!!F && typeof F.dispatch === 'function', 'B0 装载面：freight 在场');
  if (F) {
    WA.store.transact(function (d) {
      d.economy = { goods: [], orders: [], routes: [] };
      d.economy.routes.push({ id: 'r1', lane: 'road', from: '城中集市', to: '北方关口', cost: 10, status: 'open', reason: '', at: 1000, updatedAt: 1000 });
      d.economy.goods.push({ place: '城中集市', resource: '布匹', base: 5, stock: 20, price: 5, demand: 0, consumed: 0, tickedAt: '', at: 1000, updatedAt: 1000 });
    }, 'o1b:fixture');
    F.setSettings({ enabled: true });
    const ok = F.dispatch('r1', '城中集市', '布匹', 10, { transitDays: 3, base: 6 });
    a(ok && ok.ok === true && !!ok.id, 'B/TX3 成功路径：dispatch 受理并回单据 id（实 ' + JSON.stringify(ok && ok.id) + '）');
    const g0 = ((WA.store.get().economy || {}).goods || [])[0] || {};
    a(g0.stock === 10, 'B/TX3 成功路径：源库存**真扣减** 20→10（实 ' + g0.stock + '）');
    const v0 = F.view(ok && ok.id);
    a(v0 && /在途=10/.test(String(v0.conservation)), 'B/TX3 成功路径：读面与写面一致（conservation=' + (v0 && v0.conservation) + '）');
    const bad = F.dispatch('r1', '城中集市', '布匹', 5, {});
    a(bad && bad.ok === false && bad.reason === 'missing-transit-time',
      'B/TX3 拒收路径：缺在途时长 ⇒ missing-transit-time（实 ' + (bad && bad.reason) + '）');
    const st1 = (((WA.store.get().economy || {}).goods || [])[0] || {}).stock;
    a(st1 === 10, 'B/TX3 拒收路径：**世界零写入**（源库存仍 ' + st1 + '）');
    const over = F.dispatch('r1', '城中集市', '布匹', 999, { transitDays: 3, base: 6 });
    a(over && over.ok === false && over.reason === 'short-stock',
      'B/TX3 拒收路径：超量 ⇒ short-stock（实 ' + (over && over.reason) + '）且同样零写入');
    const missBase = F.dispatch('r2x', '城中集市', '布匹', 1, { transitDays: 3 });
    a(missBase && missBase.ok === false, 'B/TX3 拒收路径：未登记路线 ⇒ 拒收（实 ' + (missBase && missBase.reason) + '）');
    const dup = F.arrive(ok.id, { force: true });
    a(dup && dup.ok === true, 'B/TX3 重复路径：到货受理（实 ' + JSON.stringify(dup && dup.ok) + '）');
    const dup2 = F.arrive(ok.id, { force: true });
    a(dup2 && dup2.ok === false && dup2.reason === 'already-arrived',
      'B/TX3 重复路径：第二次 ⇒ already-arrived（实 ' + (dup2 && dup2.reason) + '）—— 不产生第二条到货');
    const WA2 = gate.fresh({}).WA;
    const rows2 = ((WA2.store.get().freight || {}).shipments) || [];
    a(rows2.length >= 1, 'B/TX3 重载路径：新宿主实例里单据仍在盘上（实 ' + rows2.length + ' 条）');
    const v2 = WA2.freight.view(rows2[0] && rows2[0].id);
    a(v2 && v2.ok !== false, 'B/TX3 重载路径：读面复读一致（status=' + (v2 && v2.status) + '）—— 不是内存态幻觉');
  }

  // ══ TX4 剧情选择 ══
  {
    const W4 = gate.fresh({}).WA;
    const S = W4.storyChoice;
    W4.branchTree.setSettings({ enabled: true });
    a(S.getSettings().enabled === false, 'B/TX4 默认关（未开启前一切入口拒收）');
    const off = S.present({ round: 1, prompt: '问', options: [{ label: 'a' }, { label: 'b' }] });
    a(off && off.ok === false && off.reason === 'disabled', 'B/TX4 拒收路径：关闭时 ⇒ disabled');
    S.setSettings({ enabled: true });
    const pr = S.present({ round: 1, prompt: '往东还是往西', options: [{ label: '往东' }, { label: '往西' }] });
    a(pr && pr.ok === true && !!pr.id, 'B/TX4 成功路径：present 登记选择点（id=' + (pr && pr.id) + '）');
    const prBad = S.present({ round: 1, prompt: '只给一个', options: [{ label: '唯一' }] });
    a(prBad && prBad.ok === false && prBad.reason === 'no-options',
      'B/TX4 拒收路径：不足两项 ⇒ no-options（实 ' + (prBad && prBad.reason) + '）');
    const c1 = S.confirm(pr.id, '往东');
    a(c1 && c1.ok === true, 'B/TX4 成功路径：confirm 兑现（applied=' + (c1 && c1.applied) + '）');
    const c2 = S.confirm(pr.id, '往东');
    a(c2 && c2.ok === false && c2.reason === 'already-confirmed',
      'B/TX4 重复路径：同一选择点二次兑现 ⇒ already-confirmed（实 ' + (c2 && c2.reason) + '）');
    const pend = S.pending();
    a(pend.count === 0, 'B/TX4 重复路径：已兑现的选择点不再出现在待办里（实 ' + pend.count + '）');
    const W4b = gate.fresh({}).WA;
    const nodes = ((W4b.store.get().branchTree || {}).nodes) || [];
    a(nodes.length >= 1, 'B/TX4 重载路径：分支节点落在盘上（' + nodes.length + ' 条）');
  }

  // ══ TX1 势力外交（纯写口）══
  {
    const W1 = gate.fresh({}).WA;
    const D = W1.diplomacy;
    a(!!D && typeof D.propose === 'function', 'B0 装载面：diplomacy 在场');
    const off1 = D.propose({ from: '甲盟', to: '乙邦', terms: [{ term: 'trade' }] });
    a(off1 && off1.ok === false && off1.reason === 'disabled', 'B/TX1 拒收路径：关闭时 ⇒ disabled');
    W1.store.transact(function (d) {
      d.evolution = d.evolution || {}; d.evolution.factions = [];
      ['甲盟', '乙邦'].forEach(function (nm) {
        W1.editorFaction.add(d, { name: nm, scope: '郡', status: '稳固', relation: '中立', currentGoal: '守境', core_person: '守将', powerPillars: ['兵'] });
      });
    }, 'o1b:tx1fixture');
    D.setSettings({ enabled: true });
    const noFac = D.propose({ from: '甲盟', to: '丙方', terms: [{ term: 'trade' }] });
    a(noFac && noFac.ok === false && noFac.reason === 'unknown-faction',
      'B/TX1 拒收路径：名录外的势力 ⇒ unknown-faction（实 ' + (noFac && noFac.reason) + '）');
    const p1 = D.propose({ from: '甲盟', to: '乙邦', terms: [{ term: 'trade' }] });
    a(p1 && p1.ok === true && !!p1.id, 'B/TX1 成功路径：提案受理（id=' + (p1 && p1.id) + '）');
    const p2 = D.propose({ from: '甲盟', to: '', terms: [{ term: 'trade' }] });
    a(p2 && p2.ok === false && p2.reason === 'missing-fields',
      'B/TX1 拒收路径：缺对方势力 ⇒ missing-fields（实 ' + (p2 && p2.reason) + '）');
    const pid = D.pairId('甲盟', '乙邦');
    a(typeof pid === 'string' && pid.length > 0 && pid === D.pairId('乙邦', '甲盟'),
      'B/TX1 重复路径：pairId 对同一对势力稳定且与顺序无关（' + pid + '）');
    const v1 = D.view();
    a(v1 && v1.ok !== false && !!v1.counts, 'B/TX1 成功路径：读面在场（open=' + (v1 && v1.counts && v1.counts.open) + '）');
    const W1b = gate.fresh({}).WA;
    const rows3 = ((W1b.store.get().diplomacy || {}).proposals) || {};
    a(typeof rows3 === 'object' && Object.keys(rows3).length >= 1,
      'B/TX1 重载路径：提案表落在盘上（' + Object.keys(rows3).length + ' 条）');
  }
}

// ── C 宿主面（真浏览器）──────────────────────────────────────────────────
function makeOv(rel, body) { const ov = {}; ov[rel] = body; return ov; }
async function runC(a) {
  const p = LIVE.probe();
  if (p.tier !== 'full') {
    a(true, 'C/D 跳过：实机通道为 ' + p.tier + '（' + p.why + '）—— 降档如实报出（O1 边界：'
      + '宿主证据缺失就保留「待验收」，不用无头全绿顶替）');
    return;
  }
  // ══ TX3 · 成功（真控件点击，带目的地基础价）══
  const r1 = await LIVE.runLive({ skipClick: true, probeSource: sceneSource({ tx3: true, fixtureFr: true, withBase: true }), reloadProbe: RELOAD_SOURCE });
  a(r1.tier === 'full' && r1.failedLoad.length === 0 && r1.loaded === r1.files,
    'C0 宿主装载干净（' + r1.loaded + '/' + r1.files + '）');
  a(r1.sweepSkipped === true,
    'C0 全面板扫点已按约跳过（sweepSkipped=' + r1.sweepSkipped + '）—— 判据落在场景自带序列上，不落空集');
  const s1 = r1.probe || {};
  a(!s1.fatal, 'C0 页内场景无致命中断（实 ' + (s1.fatal || '无') + '）');
  if (s1.fatal) { a(false, 'C0 场景中断，C1 起后续判据无从谈起'); return; }
  a(Array.isArray(s1.seq) && s1.seq.length >= 6,
    'C1（成功）交互序列留证 ' + s1.seq.length + ' 步：' + (s1.seq || []).slice(0, 3).join(' → ') + ' …');
  a(s1.stockBefore === 20 && s1.stockAfter === 10,
    'C1（成功）**操作后最终状态**：源库存 20→10（实 ' + s1.stockBefore + '→' + s1.stockAfter + '）');
  a(s1.rowCount === 1, 'C1（成功）盘上恰一条运输单（实 ' + s1.rowCount + '）');
  a(s1.rows[0] && s1.rows[0].qty === 10 && s1.rows[0].from === '城中集市' && s1.rows[0].to === '北方关口',
    'C1（成功）单据内容与输入一致（' + JSON.stringify(s1.rows[0]) + '）');
  a(/已发运/.test(String(s1.out || '')), 'C1（成功）**控件回执**给出结果（实 ' + JSON.stringify(String(s1.out || '').slice(0, 60)) + '）');
  a(r1.pageErrors.length === 0 && r1.errors.length === 0,
    'C1（成功）零页面级异常（pageErr=' + r1.pageErrors.length + ' errs=' + r1.errors.length
      + '）；本轮的点击由场景自带序列承担（sweepSkipped=' + r1.sweepSkipped + '）');

  // ══ TX3 · 拒收（无货可运 ⇒ 世界零写入）══
  const r2 = await LIVE.runLive({ skipClick: true, probeSource: sceneSource({ tx3: true, fixtureFr: false, withBase: true }) });
  const s2 = r2.probe || {};
  a(!s2.fatal, 'C2（拒收）页内场景无致命中断（实 ' + (s2.fatal || '无') + '）');
  if (!s2.fatal) {
    a(s2.stockAfter === null || s2.stockAfter === s2.stockBefore,
      'C2（拒收）**世界零写入**（库存 ' + s2.stockBefore + '→' + s2.stockAfter + '）');
    a(s2.rowCount === 0, 'C2（拒收）盘上零单据（实 ' + s2.rowCount + '）—— 拒收不留痕');
    a(String(s2.lastReason || '').length > 0 && s2.lastReason !== 'ok' && s2.lastReason !== 'dispatched',
      'C2（拒收）拒收理由落账（lastReason=' + s2.lastReason + '）');
    a(/unknown|missing|short|未|失败/.test(String(s2.out || '')),
      'C2（拒收）控件如实回执拒因（实 ' + JSON.stringify(String(s2.out || '').slice(0, 60)) + '）');
  }

  // ══ TX3 · 重载（**真导航**后复读盘上状态）══
  {
    const rp = r1.reloadProbe || {};
    a(r1.reloadError === null && r1.reloadBoot && r1.reloadBoot.loaded === r1.files,
      'C3（重载）真导航后重新装载干净（' + JSON.stringify(r1.reloadBoot) + ' err=' + r1.reloadError + '）');
    a(!rp.fatal && rp.rows === 1 && rp.stock === 10,
      'C3（重载）**导航后盘上状态仍在**（row=' + rp.rows + ' stock=' + rp.stock + '）—— 不是内存态幻觉');
    a(rp.view && /在途=10/.test(String(rp.view.conservation)),
      'C3（重载）重载后读面守恒读数完整（conservation=' + (rp.view && rp.view.conservation) + '）');
    a(rp.sid === s1.sid, 'C3（重载）重载前后是**同一张单据**（' + rp.sid + ' vs ' + s1.sid + '）');
    a(rp.rawLen > 0, 'C3（重载）盘上存档可直读（rawLen=' + rp.rawLen + '，会话一 ' + s1.rawLenHint + '）');
    a(r1.roundtrip && r1.roundtrip.ok === true,
      'C3（重载）设置往返两半皆真（storedOk=' + (r1.roundtrip && r1.roundtrip.storedOk)
        + ' readBackOk=' + (r1.roundtrip && r1.roundtrip.readBackOk) + '）');
  }

  // ══ TX3 · 重复（同一按钮连点两次）══
  const r4 = await LIVE.runLive({ skipClick: true, probeSource: sceneSource({ tx3: true, fixtureFr: true, withBase: true, clickTwice: true }) });
  const s4 = r4.probe || {};
  a(!s4.fatal, 'C4（重复）页内场景无致命中断（实 ' + (s4.fatal || '无') + '）');
  if (!s4.fatal) {
    a(s4.rowCount === 2 && s4.stockAfter === 0,
      'C4（重复）连点两次 ⇒ 两条单据、库存再扣一批（row=' + s4.rowCount + ' stock=' + s4.stockAfter
        + '）—— 重复被**如实记账**，不是静默丢一次');
    a(s4.stat && s4.stat.dispatched >= 2, 'C4（重复）台账读数与盘上一致（dispatched=' + (s4.stat && s4.stat.dispatched) + '）');
    a(r4.pageErrors.length === 0 && r4.errors.length === 0, 'C4（重复）零页面级异常（pageErr=' + r4.pageErrors.length + '）');
  }

  // ══ TX1 · 成功 + 拒收（同一轮两条读数）══
  const r5 = await LIVE.runLive({ skipClick: true, probeSource: sceneSource({ tx1: true, fixtureDp: true }) });
  const s5 = r5.probe || {};
  a(!s5.fatal, 'C5（TX1）页内场景无致命中断（实 ' + (s5.fatal || '无') + '）');
  if (!s5.fatal) {
    a(s5.proposalsAfterOk === 1 && /提案已立/.test(String(s5.outOk || '')),
      'C5（TX1 成功）真点击 ⇒ 盘上恰一条提案（实 ' + s5.proposalsAfterOk + '；回执 '
        + JSON.stringify(String(s5.outOk || '').slice(0, 50)) + '）');
    a(s5.proposalsAfterReject === 1 && s5.outReject !== s5.outOk,
      'C5（TX1 拒收）清空受方再点 ⇒ 零新增且回执变化（提案仍 ' + s5.proposalsAfterReject + '；回执 '
        + JSON.stringify(String(s5.outReject || '').slice(0, 50)) + '）');
    a(r5.pageErrors.length === 0 && r5.errors.length === 0, 'C5（TX1）零页面级异常（pageErr=' + r5.pageErrors.length + '）');
  }

  // ══ TX4 · 登记 → 确认 → 重复确认 ══
  const r6 = await LIVE.runLive({ skipClick: true, probeSource: sceneSource({ tx4: true }) });
  const s6 = r6.probe || {};
  a(!s6.fatal, 'C6（TX4）页内场景无致命中断（实 ' + (s6.fatal || '无') + '）');
  if (!s6.fatal) {
    a(s6.pendingAfterPresent === 1 && /已登记/.test(String(s6.outPresent || '')),
      'C6（TX4 成功）真点击登记 ⇒ 待办恰一点（实 ' + s6.pendingAfterPresent + '；回执 '
        + JSON.stringify(String(s6.outPresent || '').slice(0, 50)) + '）');
    a(s6.pendingAfterConfirm === 0 && /已选/.test(String(s6.outConfirm1 || '')),
      'C6（TX4 成功）确认后待办清空且回执给出（实 ' + s6.pendingAfterConfirm + '；'
        + JSON.stringify(String(s6.outConfirm1 || '').slice(0, 50)) + '）');
    a(/已选|already-confirmed|确认失败/.test(String(s6.outConfirm2 || '')),
      'C6（TX4 重复）同一选择点二次确认 ⇒ 面板**如实回执**（回执 '
        + JSON.stringify(String(s6.outConfirm2 || '').slice(0, 60)) + '）—— 不静默、不假成功');
    a(s6.choice === '往东', 'C6（TX4）盘上记账与点击一致（choice=' + s6.choice + ' applied=' + s6.applied + '）');
    a(r6.pageErrors.length === 0 && r6.errors.length === 0, 'C6（TX4）零页面级异常（pageErr=' + r6.pageErrors.length + '）');
  }
}

// ── N 负控制（两向自证：破坏真源码 → 破坏副本上跑同款判据）────────────────
async function runN(a) {
  const p = LIVE.probe();
  if (p.tier !== 'full') return;
  // N1：把面板传的基础价掐掉 ⇒ C1 现形（这正是本版修好的那个缺口 —— 反向证明判据承重）
  {
    const pn = read(REL_PANEL);
    const anchor = 'var r = WA.freight.dispatch(route, from, res, qty, { transitDays: days, base: base });';
    a(cnt(pn, anchor) === 1, 'N1 破坏锚点（面板 dispatch 调用）恰中 1 次（实 ' + cnt(pn, anchor) + '）');
    const broken = pn.replace(anchor, 'var r = WA.freight.dispatch(route, from, res, qty, { transitDays: days });');
    a(broken !== pn, 'N1 破坏确实改到源码');
    const rr = await LIVE.runLive({ skipClick: true, srcOverride: makeOv(REL_PANEL, broken),
      probeSource: sceneSource({ tx3: true, fixtureFr: true, withBase: true }) });
    const ss = rr.probe || {};
    a(!ss.fatal && ss.rowCount === 0 && ss.stockAfter === 20,
      'N1（正向）把基础价掐掉 ⇒ 真实宿主里这条路径**现形**（row=' + ss.rowCount + ' stock=' + ss.stockAfter
        + '，理由 ' + ss.lastReason + '）—— C1 的绿灯来自真接线，不是「按钮点了个空」');
  }
  // N2：面板把数量写死成 0 ⇒ 同一条 C 面判据现形
  {
    const pn = read(REL_PANEL);
    const anchor2 = "var qty = parseInt(wv('#wa-fr-qty'), 10), days = parseFloat(wv('#wa-fr-days'));";
    a(cnt(pn, anchor2) === 1, 'N2 破坏锚点（面板数量读取）恰中 1 次（实 ' + cnt(pn, anchor2) + '）');
    const broken2 = pn.replace(anchor2, "var qty = 0, days = parseFloat(wv('#wa-fr-days'));");
    const rr2 = await LIVE.runLive({ skipClick: true, srcOverride: makeOv(REL_PANEL, broken2),
      probeSource: sceneSource({ tx3: true, fixtureFr: true, withBase: true }) });
    const ss2 = rr2.probe || {};
    a(!ss2.fatal && ss2.rowCount === 0 && ss2.stockAfter === 20,
      'N2（正向）数量写死成 0 ⇒ 同款判据现形（row=' + ss2.rowCount + ' stock=' + ss2.stockAfter + '）');
  }
  // N3：引擎守恒被破坏（扣减改成扣 0）⇒ C1 的守恒判据现形
  {
    const fr = read(REL_FR);
    const anchor3 = 'gg.stock -= n;';
    a(cnt(fr, anchor3) === 1, 'N3 破坏锚点（守恒扣减）恰中 1 次（实 ' + cnt(fr, anchor3) + '）');
    const broken3 = fr.replace(anchor3, 'gg.stock -= 0;');
    const rr3 = await LIVE.runLive({ skipClick: true, srcOverride: makeOv(REL_FR, broken3),
      probeSource: sceneSource({ tx3: true, fixtureFr: true, withBase: true }) });
    const ss3 = rr3.probe || {};
    a(!ss3.fatal && ss3.stockAfter === 20 && ss3.rowCount === 1,
      'N3（正向）守恒被破坏 ⇒ 源库存不扣但单据照样立（row=' + ss3.rowCount + ' stock=' + ss3.stockAfter
        + '）—— C1 的守恒判据承重');
  }
  // N4：面板 TX4 接线被破坏（选项标签传空）⇒ C6 现形
  {
    const pn = read(REL_PANEL);
    const anchor4 = "const labels = wv('#wa-sc-opts').split(',').map(function (s) { return s.trim(); }).filter(Boolean);";
    a(cnt(pn, anchor4) === 1, 'N4 破坏锚点（TX4 选项读取）恰中 1 次（实 ' + cnt(pn, anchor4) + '）');
    const broken4 = pn.replace(anchor4, 'const labels = [];');
    const rr4 = await LIVE.runLive({ skipClick: true, srcOverride: makeOv(REL_PANEL, broken4),
      probeSource: sceneSource({ tx4: true }) });
    const ss4 = rr4.probe || {};
    a(!ss4.fatal && ss4.pendingAfterPresent === 0,
      'N4（正向）选项传空 ⇒ 真宿主里登记被拒、待办零（实 ' + ss4.pendingAfterPresent + '）');
  }
}

/** 方法级 CLI：`--methods=runA,runB`（不传 = 全跑，与旧行为逐字相同）。 */
function pickMethods(argv) {
  const hit = argv.filter(function (x) { return x.indexOf('--methods=') === 0; })[0];
  if (!hit) return null;
  return hit.slice('--methods='.length).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}
async function main() {
  const staticOnly = process.argv.indexOf('--static') >= 0;
  const picks = pickMethods(process.argv);
  const want = function (n) { return picks === null ? (n !== 'runN' || !staticOnly) : picks.indexOf(n) >= 0; };
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  const p = LIVE.probe();
  if (want('runA')) { try { runA(a); } catch (e) { fail++; console.log('  x A threw: ' + (e && e.stack)); } }
  if (want('runB')) { try { runB(a); } catch (e) { fail++; console.log('  x B threw: ' + (e && e.stack)); } }
  if (!staticOnly && want('runC')) {
    try { await runC(a); } catch (e) { fail++; console.log('  x C threw: ' + (e && e.stack)); }
  }
  if (!staticOnly && want('runN')) {
    try { await runN(a); } catch (e) { fail++; console.log('  x N threw: ' + (e && e.stack)); }
  }
  console.log('O1-MATRIX-V2186: tier=' + p.tier + '（' + p.why + '）'
    + (staticOnly ? ' [--static]' : '') + (picks ? ' [--methods=' + picks.join(',') + ']' : '')
    + ' —— ' + (fail ? 'FAIL ' + fail : 'pass') + ' / ' + (pass + fail) + (fail ? '' : ' 项全绿'));
  if (fail) process.exit(1);
}
if (require.main === module) {
  main().catch(function (e) { console.error('O1-MATRIX 运行器异常: ', e && e.stack); process.exit(2); });
}
module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, MATRIX: MATRIX, PATHS: PATHS };