#!/usr/bin/env node
// WorldAxis tests/resource-ledger-v2920.js —— v2.92.0（O5 资源账本健康面）
//
// 【它治的病：资源账本此前只有「发生了多少次」，没有「每一次前后是多少」】
//   engines/org.js 从 v2.54.0 起就有 `stat = { grants, transfers, blocked }`——**累计计数**。
//   于是本版要断言的那句话在此之前**根本不可判定**：
//         「某笔交易后，存量 == 存量 ± 流量」
//   计数只知道发生了多少次，不知道每一次的前后值。库存被写坏（有人直接改 store、
//   迁移把某人的 resources 覆盖、两个模块各写一半）时，账上一切正常、诊断全绿，
//   而「谁的粮凭空少了 30」没有任何出口能答。这是 B3 经济侧在落功能之前的观测底座。
//
// 【口径三条】（与 core/evict.js「挤出 ≠ 取样」同族的分类纪律）
//   ① **只记成功的交易**：被拒的转移不是流量。把它记进去，流入流出就同时虚高，
//      「净 = 流入 − 流出」这种等式看起来还成立（两边一起错），比不记更坏。
//   ② **流量必须带上前后值**：只记 `+30` 的流水无法与存量对账——对账要的是
//      `这笔 before 是多少、after 是多少`，以及「这笔的 before == 上一笔的 after」。
//   ③ **挤出即记账**：环形上限 200，挤掉一笔就 `dropped++`。静默丢弃会让
//      「对账通过」变成一句空话（核对范围悄悄缩小，而用户以为核的是全部）。
//
// 【判据】（A 静态 / B 运行时 / C 缺陷锁 / N 负控制）
//   A1 流水与两个读数口在真源码、且在 `WA.org` 的导出对象里。
//   A2 接线两面：诊断 `org.ledger` 段 + 面板按钮/绑定/守卫登记；读数措辞不与「写盘回执」混用。
//   B1 增量守恒：每一笔之后「存量 == 上一笔存量 ± 流量」。
//   B2 被拒的交易不记流水（insufficient / missing-holder 两路都不记）。
//   B3 异常笔单列三类（负库存 / 前后值漂移 / 超额支付），且正常流水下**一笔都不报**。
//   B4 对账自洽：不篡改时 ok / breakCount 0 / checked == 流水笔数，基线照实（未截断）。
//   B5 对账现形：**绕过产品写路径**直接改 store（这正是流水存在的理由）⇒ 必须报 vs-stock。
//   B6 纯读：两个读数口前后 store 逐字符一致，且不动 stat（观测不得改变被观测对象）。
//   B7 环形与挤出记账：写满 CAP+5 ⇒ entries == CAP、dropped == 5、truncated == true。
//   B8 诊断面真消费：`collect().org.ledger` 与 `ledgerView()` 同读数。
//   B9 面板面真消费：按钮在场、绑定在场、失败分支给**可读原因**（不是「未知原因」）。
//   C1 不硬编码绝对计数（CAP 从源码解析）、不自造壳读设置。
//   C2 归因诚实：持有者消失 ⇒ holderGone 单列，不崩、不假装对账通过。
//   N0 四个真源码破坏锚点各恰中 1 次。
//   N1a/N1b/N1c/N1d 真源码破坏 ⇒ B1/B3/B5 各自现形（含两向：静默报零 / 失去分辨力）。
//   N2 读数随事实变化（同一实例内连续两笔），不跨段复用实例。
//   N3 原版读数自洽；N4 锚点工具两向自证（命中 0 / 命中 2 都必须抛）。
//
// 【本版的两条纪律（首跑实测踩到）】
//   ① **内联 `node -e` 传中文与引号会被 bash 吃掉**（探针三因此把终端卡在续行态，
//      须 Ctrl+C 复位）——探针一律落盘成文件再跑，与「复杂脚本一律写文件」同一条。
//   ② **读数类出口不得复用「写盘回执」措辞**：首版账本按钮在对账断裂时留空 reason，
//      面板于是印出「未记录：未知原因」——用户读到的是「这个动作没记下来」，
//      而事实是「存量与流水对不上」。错的是措辞，且它同时把原因丢了。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const ORG = path.join(BASE, 'engines/org.js');
const DIAG = path.join(BASE, 'engines/tool-diag.js');
const PANEL = path.join(BASE, 'ui/panel.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }

// ── 真源码破坏锚点（各恰中 1 次才动刀）──
const ANCHOR_NOTE_G = "stat.lastReason = 'granted'; noteJournal(pending); } else stat.blocked++;";
const ANCHOR_PENDING_G = "toBefore: before, toAfter: row.resources[resource] };";
const ANCHOR_DRIFT = "if (typeof before === 'number' && typeof after === 'number' && (before + sign * amt) !== after) {";
const ANCHOR_CHAIN = "if (has(k) && typeof before === 'number' && before !== last[k]) {";
const ANCHOR_VSSTOCK = "if (cur !== last[k]) breaks.push({ i: -1, why: 'vs-stock', key: k, expect: last[k], got: cur });";
// 破坏形态：条件置假 / 入参置无效（**不删行**——删条件会留下悬空结构，语法错证明不了判据敏感）
const BREAK_NOTE_NIL = "stat.lastReason = 'granted'; noteJournal(null); } else stat.blocked++;";
const BREAK_PENDING_DRIFT = "toBefore: before, toAfter: row.resources[resource] + 1 };";
const BREAK_DRIFT_BLIND = "if (false && typeof before === 'number' && typeof after === 'number' && (before + sign * amt) !== after) {";
const BREAK_CHAIN_BLIND = "if (false && has(k) && typeof before === 'number' && before !== last[k]) {";
const BREAK_VSSTOCK_BLIND = "if (false && cur !== last[k]) breaks.push({ i: -1, why: 'vs-stock', key: k, expect: last[k], got: cur });";

function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 60));
  return n;
}
function fresh(ov) { return gate.fresh(ov || undefined); }
/** 从真源码解析环形上限（不抄副本——抄的那份迟早漂） */
function capOf() {
  const m = src(ORG).match(/const JOURNAL_CAP = (\d+);/);
  if (!m) throw new Error('resources: 无法从源码解析 JOURNAL_CAP');
  return Number(m[1]);
}
const CAP = capOf();
const P = function (x) { return JSON.stringify(x); };
const HOLD_A = { name: '甲', status: '鼎盛', relation: '血盟', resources: { 粮: 100 } };
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.clock = { iso: '', label: '第1日', dayIndex: 0, source: 'unset' };
    d.evolution = d.evolution || {};
    d.evolution.round = 1;
    d.evolution.factions = [{ name: '甲', status: '鼎盛', relation: '血盟', resources: { 粮: 100 } }];
    d.people = { p_丙: { id: 'p_丙', name: '丙', resources: {} } };
  }, 'resource-ledger-v2920:seed');
  // 模块总开关**显式置定**（run.js 各 section 共享宿主面，不吃环境）
  if (WA.org.setSettings) WA.org.setSettings({ enabled: true, maxItems: 3 });
}
function view(W) { return W.org.ledgerView(); }
function rec(W) { return W.org.reconcile(); }

function runAll(a) {
  const orgSrc = src(ORG), diagSrc = src(DIAG), panSrc = src(PANEL);
  // ── A 面 ──
  a(orgSrc.indexOf('const journal = [];') > 0 && orgSrc.indexOf('function noteJournal(') > 0,
    'v2920: [A1] 资源流水容器与入账口在真源码（此前只有累计计数，逐笔前后值无处可查）');
  a(orgSrc.indexOf('ledgerView: ledgerView') > 0 && orgSrc.indexOf('reconcile: reconcile') > 0,
    'v2920: [A1] 两个读数口在 `WA.org` 导出对象里（声明面）');
  a(CAP > 0 && orgSrc.indexOf('journalStat.dropped++') > 0,
    'v2920: [A1] 环形上限 ' + CAP + ' 与「挤出即记账」都在源码（静默丢弃会让对账范围悄悄缩小）');
  a(diagSrc.indexOf('ledger: led ? {') > 0, 'v2920: [A2] 诊断 secOrg 有 ledger 段（真消费方一）');
  a(panSrc.indexOf("on('#wa-org-ledger'") > 0 && panSrc.indexOf("id=\"wa-org-ledger\"") > 0,
    'v2920: [A2] 面板按钮与绑定成对在场（真消费方二）');
  a(diagSrc.indexOf("'wa-org-check', 'wa-org-ledger', 'wa-org-out',") > 0,
    'v2920: [A2] 守卫表登记了该控件（登记错页比不登记更坏）');
  a(panSrc.indexOf("'账本 · '") > 0 && panSrc.indexOf("'reconcile-break'") > 0,
    'v2920: [A2] 读数措辞与「写盘回执」分开，且失败分支给可读原因（不是「未知原因」）');

  // ── B 面 ──
  const H1 = fresh(); const W1 = H1.WA; seed(W1);
  a(view(W1).entries === 0 && view(W1).recorded === 0, 'v2920: [B1] 起始无流水（本段自己 seed 过，不吃环境）');
  const g = W1.org.grant('faction', '甲', '粮', 50);
  let v = view(W1);
  a(g.ok && g.amount === 150, 'v2920: [B1] 入库 50 生效（实 ' + P(g) + '）');
  a(v.entries === 1 && v.flow.in === 50 && v.flow.out === 0 && v.flow.net === 50,
    'v2920: [B1] 一笔入库 ⇒ 流水 1 笔 / 流入 50 / 流出 0（实 entries=' + v.entries + ' flow=' + P(v.flow) + '）');
  a(v.holders.length === 1 && v.holders[0].items[0].qty === 150,
    'v2920: [B1] 存量读数与交易结果一致（甲 150，实 ' + P(v.holders) + '）');
  const t = W1.org.transfer('faction', '甲', 'person', '丙', '粮', 30);
  v = view(W1);
  a(t.ok && v.entries === 2 && v.flow.in === 80 && v.flow.out === 30,
    'v2920: [B1] 一笔转移 ⇒ 流水 2 笔 / 流入累计 80 / 流出 30（实 ' + P(v.flow) + '）');
  const qtyOf = function (holders, kind, name, id) {
    const h = holders.filter(function (x) { return x.kind === kind && x.name === name; })[0];
    const it = h && h.items.filter(function (y) { return y.id === id; })[0];
    return it ? it.qty : 0;
  };
  a(qtyOf(v.holders, 'faction', '甲', '粮') === 120 && qtyOf(v.holders, 'person', '丙', '粮') === 30,
    'v2920: [B1] **守恒**：甲 150−30=120 / 丙 0+30=30（两方同时正确才算，实 甲=' + qtyOf(v.holders, 'faction', '甲', '粮') + ' 丙=' + qtyOf(v.holders, 'person', '丙', '粮') + '）');

  // B2：被拒的交易不是流量
  const e0 = view(W1).entries, st0 = W1.org.stat();
  const rej1 = W1.org.transfer('faction', '甲', 'person', '丙', '粮', 9999);
  const rej2 = W1.org.transfer('person', '无此人', 'person', '丙', '粮', 1);
  const rej3 = W1.org.grant('person', '无此人', '粮', 1);
  v = view(W1);
  a(!rej1.ok && rej1.reason === 'insufficient' && !rej2.ok && rej2.reason === 'missing-holder' && !rej3.ok,
    'v2920: [B2] 三路拒收都如实回执（' + rej1.reason + ' / ' + rej2.reason + ' / ' + rej3.reason + '）');
  a(v.entries === e0 && v.flow.in === 80 && v.flow.out === 30,
    'v2920: [B2] 被拒的交易**不记流水**（记了会让流入流出同时虚高，而「净」看着还对；实 entries=' + v.entries + '）');
  // v2.92.0（自纠）：`blocked` 只统计**走进交易体**的拒收。missing-holder 是参数/持有者
  //   校验的**早退**（不进交易体），故三路拒收里只有 insufficient 那一路计数。
  //   把这条既有语义钉住：否则「早退路开始计时」这种改动不会让任何判据变红。
  a(W1.org.stat().blocked === st0.blocked + 1,
    'v2920: [B2] 只有走进交易体的拒收计 blocked（+1，实 ' + W1.org.stat().blocked + '）；参数/持有者校验早退不计——两种「没做成」不是一件事');

  // B3：正常流水下三类异常笔一笔都不报
  v = view(W1);
  a(v.anomalies.count === 0 && v.anomalies.stockDrift.length === 0 && v.anomalies.negativeStock.length === 0 && v.anomalies.overpay.length === 0,
    'v2920: [B3] 正常流水下异常笔为 0（不该报的不报；实 ' + P(v.anomalies) + '）');
  a(v.anomalies.count === v.anomalies.stockDrift.length + v.anomalies.negativeStock.length + v.anomalies.overpay.length,
    'v2920: [B3] 总数 == 三类之和（异常笔不混计）');

  // B4：对账自洽
  const r = rec(W1);
  a(r.ok && r.breakCount === 0 && r.checked === 2 && r.truncated === false,
    'v2920: [B4] 未篡改时对账自洽（ok=' + r.ok + ' checked=' + r.checked + ' 基线=' + r.baseline + '）');

  // B6：纯读（放篡改之前，保证读数未被上一段污染）
  const before = P(W1.store.get()), statB = P(W1.org.stat());
  view(W1); rec(W1);
  a(P(W1.store.get()) === before, 'v2920: [B6] ledgerView / reconcile **纯读**：store 前后逐字符一致');
  a(P(W1.org.stat()) === statB, 'v2920: [B6] 读数不动 stat（观测不得改变被观测对象）');

  // B5：绕过产品写路径直接改 store ⇒ 必须报出来（这正是流水存在的理由）
  W1.store.transact(function (d) { d.people.p_丙.resources['粮'] = 999; }, 'v2920:tamper');
  const r2 = rec(W1);
  a(!r2.ok && r2.breakCount >= 1 && r2.breaks.some(function (b) { return b.why === 'vs-stock' && b.key === 'person|丙|粮'; }),
    'v2920: [B5] 存量被绕过写路径篡改 ⇒ 对账报 vs-stock（实 ' + P(r2.breaks) + '）');
  a(r2.breaks.filter(function (b) { return b.why === 'vs-stock'; })[0].expect === 30
    && r2.breaks.filter(function (b) { return b.why === 'vs-stock'; })[0].got === 999,
    'v2920: [B5] 断裂点带上「应为 / 实为」（预期 30 / 实 999）——只报「对不上」等于什么都没说');

  // B7：环形与挤出记账（CAP 从源码解析，不硬编码）
  const H2 = fresh(); const W2 = H2.WA; seed(W2);
  for (let i = 0; i < CAP + 5; i++) W2.org.grant('faction', '甲', '粮', 1);
  const v2 = view(W2), r3 = rec(W2);
  a(v2.entries === CAP && v2.recorded === CAP + 5 && v2.dropped === 5,
    'v2920: [B7] 写满后 entries=' + CAP + ' / recorded=' + (CAP + 5) + ' / dropped=5（实 ' + v2.entries + '/' + v2.recorded + '/' + v2.dropped + '）');
  a(r3.truncated === true && r3.baseline === 'truncated',
    'v2920: [B7] 挤出过就照实报 truncated（核对范围缩小不能瞒着用户）');

  // B8：诊断面真消费
  const rep = W1.toolDiag.collect();
  const dled = rep.org && rep.org.ledger;
  a(dled && dled.entries === view(W1).entries && dled.flowIn === view(W1).flow.in && dled.flowOut === view(W1).flow.out,
    'v2920: [B8] 诊断 `org.ledger` 与 `ledgerView()` 同读数（实 ' + P(dled) + '）');
  a(dled && dled.abnormal === view(W1).anomalies.count && dled.reconciled === rec(W1).ok,
    'v2920: [B8] 诊断里的异常笔数与对账结论同源');

  // B9：面板面真消费（真实点击，读数落在输出节点上）
  const panel = H1.dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (x) { return x.dataset.page === 'people'; })[0];
  a(!!tab, 'v2920: [B9] 人物页 tab 在场');
  tab.click();
  const body = panel.querySelector('.wa-body');
  const btn = body.querySelectorAll('button').filter(function (b) { return b.id === 'wa-org-ledger'; })[0];
  a(!!btn, 'v2920: [B9] 「资源账本」按钮渲染成树（绑定不会空转）');
  btn.click();
  const out = H1.dom.getElementById('wa-org-out');
  const txt = out ? out.textContent : '';
  a(txt.indexOf('账本 ·') === 0 && txt.indexOf('持有者') > 0,
    'v2920: [B9] 成功读数以「账本 ·」开头（不复用「已记录」——那是写盘回执的措辞；实 ' + txt + '）');
  a(txt.indexOf('reconcile-break') > 0 || txt.indexOf('对账') > 0,
    'v2920: [B9] 断裂态给出可读原因或对账结论（实 ' + txt + '）');

  // C2：持有者消失 ⇒ holderGone 单列，不崩、不假装通过
  const H3 = fresh(); const W3 = H3.WA; seed(W3);
  W3.org.grant('faction', '甲', '粮', 5);
  // 先让丙手里真有资源——否则删掉甲之后「还在的持有者」本来就该是空的（判据会自己写错）
  W3.org.transfer('faction', '甲', 'person', '丙', '粮', 3);
  W3.store.transact(function (d) { delete d.evolution.factions; }, 'v2920:dropHolder');
  const r4 = rec(W3), v3 = view(W3);
  a(r4.holderGone.some(function (k) { return k.indexOf('faction|甲|粮') === 0; }),
    'v2920: [C2] 持有者消失 ⇒ holderGone 单列（不静默当成对账通过；实 ' + P(r4.holderGone) + '）');
  a(v3.holderCount === 1 && v3.holders[0].name === '丙' && v3.holders[0].items[0].qty === 3,
    'v2920: [C2] 存量读数只列**还在**的持有者（甲已消失、丙 3 在列；实 ' + P(v3.holders) + '）');

  // ── N0 / N2 / N3 ──
  a(hits(orgSrc, ANCHOR_NOTE_G) === 1 && hits(orgSrc, ANCHOR_PENDING_G) === 1
    && hits(orgSrc, ANCHOR_DRIFT) === 1 && hits(orgSrc, ANCHOR_CHAIN) === 1 && hits(orgSrc, ANCHOR_VSSTOCK) === 1,
    'v2920: [N0] 五个真源码破坏锚点各恰中 1 次');
  const H4 = fresh(); const W4 = H4.WA; seed(W4);
  W4.org.grant('faction', '甲', '粮', 7);
  const n1 = view(W4).entries;
  W4.org.grant('faction', '甲', '粮', 8);
  const n2 = view(W4).entries;
  a(n1 === 1 && n2 === 2, 'v2920: [N2] 读数随事实变化（同一实例内 1 → 2，实 ' + n1 + ' → ' + n2 + '）');
  a(typeof CAP === 'number' && CAP >= 10 && orgSrc.indexOf('JOURNAL_CAP = ' + CAP) > 0,
    'v2920: [N3] 上限从源码解析而来（不硬编码第二份：' + CAP + '）');
}

function runNegative(a) {
  const orgSrc = src(ORG);
  // N1a：流水入账被置无效 ⇒ B1 现形（流水不涨，而存量照涨——正是「账与库存脱钩」的形态）
  const srcA = orgSrc.replace(ANCHOR_NOTE_G, BREAK_NOTE_NIL);
  a(srcA !== orgSrc, 'v2920: [N1a] 破坏确实改写了源码（流水入账置无效）');
  let HA = fresh({ srcOverride: { 'engines/org.js': srcA } }); let WAa = HA.WA; seed(WAa);
  WAa.org.grant('faction', '甲', '粮', 50);
  a(view(WAa).entries === 0 && qtyOfStock(WAa, 'faction', '甲', '粮') === 150,
    'v2920: [N1a] 破坏后 B1 现形：库存涨到 150 而流水 0 笔（实 entries=' + view(WAa).entries + '）');
  // N1b：人为制造前后值漂移 ⇒ 三类异常笔必须报出（判据有分辨力，不是恒 0）
  const srcB = orgSrc.replace(ANCHOR_PENDING_G, BREAK_PENDING_DRIFT);
  a(srcB !== orgSrc && srcB !== srcA, 'v2920: [N1b] 破坏确实改写了源码（前后值漂移）');
  const HB = fresh({ srcOverride: { 'engines/org.js': srcB } }); const WB = HB.WA; seed(WB);
  WB.org.grant('faction', '甲', '粮', 50);
  a(view(WB).anomalies.stockDrift.length === 1 && view(WB).anomalies.count >= 1,
    'v2920: [N1b] 破坏后 B3 现形：前后值漂移被报出（实 ' + P(view(WB).anomalies) + '）');
  // N1b-2：漂移检出**置假** ⇒ 同一份坏数据不再被报（两向自证：既会报，也不是瞎报）
  const srcB2 = srcB.replace(ANCHOR_DRIFT, BREAK_DRIFT_BLIND);
  a(srcB2 !== srcB, 'v2920: [N1b] 破坏确实改写了源码（漂移检出置假）');
  const HB2 = fresh({ srcOverride: { 'engines/org.js': srcB2 } }); const WB2 = HB2.WA; seed(WB2);
  WB2.org.grant('faction', '甲', '粮', 50);
  a(view(WB2).anomalies.stockDrift.length === 0,
    'v2920: [N1b] 检出置假后同一份坏数据**静默通过**（这正是最危险的失效形态，实 ' + view(WB2).anomalies.stockDrift.length + '）');
  // N1c：对账链检置假 ⇒ 篡改不再被检出（B5 现形）
  const srcC = orgSrc.replace(ANCHOR_CHAIN, BREAK_CHAIN_BLIND);
  a(srcC !== orgSrc, 'v2920: [N1c] 破坏确实改写了源码（链检置假）');
  const HC = fresh({ srcOverride: { 'engines/org.js': srcC } }); const WC = HC.WA; seed(WC);
  WC.org.grant('faction', '甲', '粮', 5);
  WC.store.transact(function (d) { d.evolution.factions[0].resources['粮'] = 999; }, 'v2920:N1c');
  a(rec(WC).breaks.filter(function (b) { return b.why === 'chain'; }).length === 0,
    'v2920: [N1c] 链检置假后链上断裂不再现形（实 ' + P(rec(WC).breaks) + '）');
  // N1d：与存量比对置假 ⇒ 篡改不再被检出（另一路，单独自证）
  const srcD = orgSrc.replace(ANCHOR_VSSTOCK, BREAK_VSSTOCK_BLIND);
  a(srcD !== orgSrc, 'v2920: [N1d] 破坏确实改写了源码（存量比对置假）');
  const HD = fresh({ srcOverride: { 'engines/org.js': srcD } }); const WD = HD.WA; seed(WD);
  WD.org.grant('faction', '甲', '粮', 5);
  WD.store.transact(function (d) { d.evolution.factions[0].resources['粮'] = 999; }, 'v2920:N1d');
  a(rec(WD).ok === true,
    'v2920: [N1d] 存量比对置假后「对账通过」变成假绿（实 ok=' + rec(WD).ok + '）——故原版那条判据必须同时钉住两路');
  // N4：锚点工具两向自证
  let threw = 0;
  try { hits(orgSrc, '不存在的锚点字面量 ###'); } catch (e) { threw++; }
  try { hits('aa bb aa bb', 'aa'); } catch (e) { threw++; }
  a(threw === 2, 'v2920: [N4] 锚点工具两向自证：命中 0 与命中 2 都必须抛（实 ' + threw + '/2）');
}
function qtyOfStock(W, kind, name, id) {
  const v = view(W);
  const h = v.holders.filter(function (x) { return x.kind === kind && x.name === name; })[0];
  const it = h && h.items.filter(function (y) { return y.id === id; })[0];
  return it ? it.qty : 0;
}
module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runNegative: require('./lock-assert.js').restoring(runNegative) };