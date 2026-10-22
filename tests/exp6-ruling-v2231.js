#!/usr/bin/env node
// WorldAxis tests/exp6-ruling-v2231.js (v2.231.0) -- EXP-6 专锁：案件裁决与处罚执行
//
// 【它治什么（缺口，开工前逐条复核现场）】
//   计划原文：「**管辖规则、立案、告知/传唤、提交与质证、裁决、处罚执行与复核**。
//   区分**客观事件、已知证据、指控和裁决**；虚构世界的制度可配置，不把现代法律假定为通则。」
//   验收原文：「**证据不足的指控不能仅凭通缉分值定罪**；**新证据经复核改变裁决**；
//   **罚款确实进入既有经济结算，撤销处罚不重复退款**。」
//
//   现场事实（不是静态推测）：
//     · `engines/warrant.js` 的头注释**自己写明**「只记账不执法」—— 它有 report / pardon /
//       read / buildBlock，答「谁在案上、罪度几档、是不是惯犯」，**答不出**「这桩指控立案了
//       没有、传唤过没有、质证过没有、谁判的、判了什么、罚了没有、撤销过没有」；
//     · `engines/investigation.js` 的 `checkEvidence` 给 `verified` / `unverified` /
//       `contradictory` / `cannot-judge` —— 那是**证据面**的结论，不是**案件**的裁决；
//     · `engines/evidence-board.js` 记的是**主张与边**（谁主张什么、缺哪条边）——
//       论证结构，没有当事人、没有程序、没有处罚；
//     · `engines/economy.js` 认的是**交易**（有卖家有货），罚款不是交易，它不认。
//   四者合起来仍缺的那一格：**「有罪」不是记账的结论，是走完程序后的裁决**。
//
// 【本锁咬住的十一条否定式边界】
//   · **不自动抓人**：全文不读 warrant 的通缉名单去批量立案（B2/N1）。
//   · **不建第二份名册**：当事人必须是世界里的人物（B3/N2）。
//   · **程序六段有先后**：跳段 ⇒ bad-phase；已执行完 ⇒ case-closed（两者分列，B4/N3）。
//   · **不假定现代法律**：管辖名单是配置，留空 ⇒ 不设限（B5/N4）。
//   · **不凭空定罪**：guilty 必须有非通缉类证物（`no-grounds`，验收原文，B6/N5）。
//   · **不凭空执行**：没定罪就执行 ⇒ case-not-ruled（B7/N6）。
//   · **先判后扣**：罚款不够 ⇒ short-fine，一克不动（B8/N7）。
//   · **不重复退款**：第二次 ⇒ already-refunded（验收原文，B9/N8）。
//   · **不静默造钱**：退款从收款方扣不够时，差额如实进 clawbackShort（B9e）。
//   · **复核必须有新证据**：否则 ⇒ no-new-grounds（验收原文，B10/N9）。
//   · **不替世界定位置**：全文不写 world.*（B11）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约与边界 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/exp6-ruling-v2231.js';
const RG = 'engines/ruling.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
const ANCHOR = {
  // ① 不自动抓人：破坏点落在**必经**的阶段闸入口。
  //    ⚠ 原先把破坏点放 `money()` —— 而 `money()` 只在「未指定 material」时被调，
  //      主路径（显式给 material）**一次都不经过** ⇒ 破坏从不发生、判据恒假
  //      （实测 /tmp/e6lock2.txt 的 N1 红灯）。这里与 ③ 共用同一个锚文本。
  // ② 不建第二份名册
  partyGate: { rel: RG, txt: "    if (!personExists(accused)) return refuse('unknown-party', { who: accused, role: 'accused' });" },
  // ③ 程序先后：外层阶段闸（open/notify/submit/rule/enforce/review 全必经 ⇒ 也当 ① 的破坏点）
  phaseGateFn: { rel: RG, txt: "  function phaseGate(cur, allow) {\n    const c = clean(cur, 12);" },
  // ④ 管辖闸（制度可配置：留空不设限）
  jurisGate: { rel: RG, txt: "    if (!jurisOk(cfg, juris)) return refuse('no-jurisdiction', { jurisdiction: juris," },
  // ⑤ 定罪证据闸（**核心**：非通缉类证物）
  groundGate: { rel: RG, txt: "      if (!solid.length) {\n        return refuse('no-grounds', { case: cur.id, exhibits: exs.length, solid: 0," },
  // ⑤b 同一条闸的**内层**（transact 里那一层）。⚠ 必须带**两行**：`rule` 与 `review` 里
  //    那两行**逐字相同**（各 1 处 ⇒ 共 2 处），第三行才分得开（`rule` 的 `solid:` 另起一行、
  //    `review` 的 `solid:` 在同一行）。
  groundGateIn: { rel: RG, txt: "      if (verdict === 'guilty' && (live.length < cfg.minGrounds || !solidNow.length)) {\n        out = { ok: false, reason: 'no-grounds', case: row.id, exhibits: live.length,\n          solid: solidNow.length }; return false;" },
  // ⑥ 执行前的定罪闸
  ruledGate: { rel: RG, txt: "    const verdict = clean(cur.verdict, 20);\n    if (verdict !== 'guilty') return refuse('case-not-ruled', { case: cur.id, verdict: verdict," },
  // ⑥b 同一条闸的内层
  ruledGateIn: { rel: RG, txt: "      if (clean(row.verdict, 20) !== 'guilty') {" },
  // ⑦ 罚款先判后扣（外层）。⚠ 只写条件行会命中 2 次：那 6 空格的一句是内层 8 空格那行的**子串**。
  fineGate: { rel: RG, txt: "      if (haveOf(pur, material) < amount) {\n        return refuse('short-fine', { who: cur.accused, material: material," },
  // ⑦b 同一条闸的内层
  fineGateIn: { rel: RG, txt: "        if (haveOf(pur, material) < amount) {" },
  // ⑧ 不重复退款
  refundGate: { rel: RG, txt: "      if (pr.refunded) {\n        out = { ok: false, reason: 'already-refunded', id: pr.id," },
  // ⑨ 复核必须有新证据
  freshGate: { rel: RG, txt: "    if (!fresh.length) {\n      return refuse('no-new-grounds', { case: cur.id, exhibits: exs.length," },
  // ⑨b 同一条闸的内层
  freshGateIn: { rel: RG, txt: "      if (!freshNow.length) {" },
  // ⑩ 注入第一道闸：无观察者 ⇒ 空串
  viewerGate: { rel: RG, txt: "    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版案卷）" },
  // ⑪ 注入第二道闸：没参与任何一案 ⇒ 仍是零 token（纵深防御）
  memberGate: { rel: RG, txt: "    if (!mine.length) return '';   // 没参与任何一案 ⇒ 仍是零 token（纵深防御）" }
};
const EXPORTS = ['CASE_STATUS', 'VERDICTS', 'PENALTY_KINDS', 'EXHIBIT_KINDS', 'PARTIES', 'OPEN_CASE',
  'getSettings', 'setSettings', 'open', 'notify', 'submit', 'rule', 'enforce', 'review', 'refund',
  'caseOf', 'exhibits', 'verdictOf', 'penaltyOf', 'penalties', 'list', 'reload', 'view', 'buildBlock',
  'stat', 'resetStat', 'reset'];

/** 夹具：两个人（甲 100 银元 / 乙 10 银元）+ 空的案件面（自己 seed、自己收）。 */
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { '银元': 100 }, updatedAt: 1 };
    d.people['p_乙'] = { id: 'p_乙', name: '乙', resources: { '银元': 10 }, updatedAt: 1 };
    d.ruling = { cases: [], exhibits: [], rulings: [], penalties: [] };
    return true;
  }, 'exp6:seed');
}
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  seed(env.WA);
  env.WA.ruling.setSettings({ enabled: true, maxCases: 24, maxExhibits: 96, maxRulings: 48,
    maxPenalties: 48, minGrounds: 1, jurisdictions: '', treasury: '', viewer: '' });
  return env;
}
/** 立案（默认被告甲、指控夜闯官仓）。 */
function openCase(W, spec) {
  const s = spec || {};
  return W.ruling.open({ accused: s.accused || '甲', charge: s.charge || '夜闯官仓',
    place: s.place || '官仓', jurisdiction: s.jurisdiction === undefined ? '' : s.jurisdiction,
    by: s.by || '乙' });
}
/** 一路推到「已质证」：立案 → 告知 → 提交一条非通缉类证物。 */
function toHearing(W, spec) {
  const o = openCase(W, spec);
  if (!o.ok) return o;
  const n = W.ruling.notify(o.id, { by: '乙' });
  if (!n.ok) return n;
  const s = W.ruling.submit(o.id, { side: 'prosecution', kind: 'testimony', content: '看守亲眼所见', by: '乙' });
  if (!s.ok) return s;
  return { ok: true, id: o.id };
}
/** 一路推到「已执行」（默认罚 10 银元）。 */
function toEnforced(W, spec) {
  const h = toHearing(W, spec);
  if (!h.ok) return h;
  const r = W.ruling.rule(h.id, { verdict: 'guilty', by: '乙' });
  if (!r.ok) return r;
  const e = W.ruling.enforce(h.id, { kind: 'fine', amount: 10, material: '银元',
    to: (spec && spec.to) || '' });
  if (!e.ok) return e;
  return { ok: true, id: h.id, penalty: e.id, balance: e.balance };
}

async function runAll(a, ov) {
  ov = ov || {};
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, RG)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/ruling.js'") > 0, 'A2: tests/run.js LOAD 已挂');
  a(rd('index.js', ov).indexOf("'engines/ruling.js'") > 0, 'A2b: index.js LOAD_ORDER 已挂');
  a(rd('engines/tool-diag.js', ov).indexOf("'engines/ruling.js': 'ruling'") > 0, 'A3: tool-diag 声明表已登记');
  a(rd('engines/tool-diag.js', ov).indexOf('ruling: secRuling()') > 0
    && rd('engines/tool-diag.js', ov).indexOf('function secRuling()') > 0,
    'A3b: 诊断面单列一节（与 warrant 分列：那一节答「谁在通缉名单上」，本节答「这桩指控走到哪一段」）');
  (function () {
    a(rd('core/store.js', ov).indexOf('ruling: { cases: [], exhibits: [], rulings: [], penalties: [] }') > 0,
      'A4: 骨架已物化（登记不等于物化）');
    const E = rd('core/evict.js', ov);
    a(E.indexOf("'ruling.cases'") > 0 && E.indexOf("'ruling.exhibits'") > 0
      && E.indexOf("'ruling.rulings'") > 0 && E.indexOf("'ruling.penalties'") > 0,
      'A4b: 挤出站点已登记（四本账各一处）');
  })();
  (function () {
    const I = rd('render/inject.js', ov);
    a(I.indexOf("'ruling'") > 0 && I.indexOf('ruling: true') > 0,
      'A5: 注入源已进 SOURCES 与默认可见表（只加源表不加分支 = 声明了没人消费）');
    a(I.indexOf('WA.ruling.buildBlock()') > 0,
      'A5b: 注入分支真消费 buildBlock（只加分支不加源表 = 开关点了零效果）');
    a(I.indexOf("ruling: 'worldaxis_ruling_settings_v1'") > 0,
      'A5c: 模块开关表已登记（不登记 ⇒ moduleEnabled 返回 null，勾了总开关却说「模块没加载」）');
    a(rd('ui/panel.js', ov).indexOf("ruling: '案件裁决'") > 0,
      'A5d: 面板显示名已登记（否则用户在开关面板上看到英文键名）');
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
    const miss = EXPORTS.filter(function (k) { return e0.WA.ruling[k] === undefined; });
    a(miss.length === 0, 'A8: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 开关
  (function () {
    const W = envWith(ov).WA;
    W.ruling.setSettings({ enabled: false });
    a(openCase(W).reason === 'disabled', 'B1: 关着时立案拒收 disabled（显式启用）');
    a(W.ruling.notify('cs_x', {}).reason === 'disabled', 'B1b: 关着时告知/传唤拒收 disabled');
    a(W.ruling.buildBlock() === '', 'B1c: 关着时不产注入块');
    W.ruling.setSettings({ enabled: true });
  })();
  // B2 不自动抓人：通缉名单上有记录 ≠ 自动立案
  (function () {
    const W = envWith(ov).WA;
    // 先往 warrant 里记一桩（如果 warrant 在场），再确认 ruling 一案未开
    if (W.warrant && typeof W.warrant.report === 'function') {
      const keep = W.warrant.getSettings ? W.warrant.getSettings() : null;
      try {
        W.warrant.setSettings({ enabled: true });
        W.warrant.report('甲', 'major', '夜闯官仓', '官仓');
      } finally { if (keep) W.warrant.setSettings(keep); }
      a(W.ruling.list().length === 0,
        'B2: 通缉名单上有人 ⇒ 本模块**一案未开**（不自动把所有有通缉记录的人抓走，实 '
          + W.ruling.list().length + ' 案）—— 「记录」不是「立案」');
    } else {
      a(W.ruling.list().length === 0, 'B2: 前置对照 —— warrant 缺席时本模块同样一案未开');
    }
  })();
  // B3 当事人必须在册（不建第二份名册）
  (function () {
    const W = envWith(ov).WA;
    a(openCase(W, { accused: '查无此人' }).reason === 'unknown-party',
      'B3: 被告不在人物册上 ⇒ unknown-party（不建第二份名册）');
    a(openCase(W, { by: '查无此人' }).reason === 'unknown-party',
      'B3b: 提出方不在册 ⇒ 同样 unknown-party（四处同规：被告/提出方/提交人/收款方）');
  })();
  // B4 程序六段有先后（bad-phase 与 case-closed 分列）
  (function () {
    const W = envWith(ov).WA;
    const o = openCase(W);
    a(o.ok === true && o.status === 'filed', 'B4: 立案落在第一段 filed（实 ' + (o && o.status) + '）');
    a(W.ruling.rule(o.id, { verdict: 'guilty' }).reason === 'bad-phase',
      'B4b: 刚立案就裁决 ⇒ bad-phase（跳过了告知与质证）');
    a(W.ruling.submit(o.id, { side: 'prosecution', kind: 'testimony', content: '越过程序' }).reason === 'bad-phase',
      'B4c: 刚立案就提交证物 ⇒ bad-phase（程序有先后）');
    const e = toEnforced(W);
    a(e.ok === true, 'B4d: 走完全程推到已执行（前置）');
    a(W.ruling.submit(e.id, { side: 'defense', kind: 'document', content: '迟到的辩词' }).reason === 'case-closed',
      'B4e: 已执行完再提交证物 ⇒ case-closed（与 bad-phase 分列：一个「案结了」、一个「顺序不对」）');
  })();
  // B5 管辖是配置（不假定现代法律：留空不设限）
  (function () {
    const W = envWith(ov).WA;
    a(openCase(W, { jurisdiction: '任何地方' }).ok === true,
      'B5: 没声明管辖名单 ⇒ 不设限（不假定现代法律 —— 任何地方都收）');
    W.ruling.setSettings({ jurisdictions: '长安, 洛阳' });
    a(openCase(W, { jurisdiction: '长安' }).ok === true,
      'B5b: 声明了名单 ⇒ 名单内的管辖收（实 ok）');
    a(openCase(W, { jurisdiction: '临安' }).reason === 'no-jurisdiction',
      'B5c: 名单外的管辖 ⇒ no-jurisdiction（制度可配置，不是写死一种文化）');
    W.ruling.setSettings({ jurisdictions: '' });
  })();
  // B6 不得仅凭通缉分值定罪（验收原文核心）
  (function () {
    const W = envWith(ov).WA;
    const o = openCase(W);
    W.ruling.notify(o.id, { by: '乙' });
    const w = W.ruling.submit(o.id, { side: 'prosecution', kind: 'warrant', content: '他在通缉名单上' });
    a(w.ok === true, 'B6: 通缉记录可以进证物册（它确实是一条记录）');
    a(w.note && w.note.indexOf('记录') > 0,
      'B6b: 提交时点名「通缉记录只是记录，不能单独作为定罪依据」');
    const r = W.ruling.rule(o.id, { verdict: 'guilty' });
    a(r.reason === 'no-grounds',
      'B6c: 只有通缉类证物就定罪 ⇒ no-grounds（实 ' + (r && r.reason) + '）—— **不能仅凭通缉分值定罪**（验收原文）');
    const s2 = W.ruling.submit(o.id, { side: 'prosecution', kind: 'testimony', content: '看守亲眼所见' });
    a(s2.ok === true, 'B6d: 补一条非通缉类证物（前置）');
    const r2 = W.ruling.rule(o.id, { verdict: 'guilty' });
    a(r2.ok === true && r2.verdict === 'guilty' && r2.solid >= 1,
      'B6e: 有了非通缉类证物 ⇒ 判得掉（实 ' + (r2 && r2.verdict) + ' solid=' + (r2 && r2.solid) + '）');
  })();
  // B7 判无罪不需要证据（举证责任在控方）
  (function () {
    const W = envWith(ov).WA;
    const o = openCase(W);
    W.ruling.notify(o.id, { by: '乙' });
    W.ruling.submit(o.id, { side: 'prosecution', kind: 'warrant', content: '只有通缉记录' });
    const r = W.ruling.rule(o.id, { verdict: 'not-guilty' });
    a(r.ok === true && r.verdict === 'not-guilty',
      'B7: 判无罪不需要非通缉类证据（实 ' + (r && r.verdict) + '）—— 举证责任在控方');
    a(W.ruling.enforce(o.id, { kind: 'fine', amount: 5, material: '银元' }).reason === 'case-not-ruled',
      'B7b: 没定罪就执行 ⇒ case-not-ruled（不凭空执行）');
  })();
  // B8 罚款确实进入既有经济结算 + 先判后扣（验收原文）
  (function () {
    const W = envWith(ov).WA;
    const e = toEnforced(W);
    a(e.ok === true, 'B8: 走完全程（前置）');
    a(W.store.get().people['p_甲'].resources['银元'] === 90,
      'B8b: 罚款真的从被告账上扣了（100 → ' + W.store.get().people['p_甲'].resources['银元'] + '）—— 走既有资源账');
    a(e.balance === 90, 'B8c: 回执带扣后余额（实 ' + e.balance + '）');
    a(W.store.get().people['p_甲'].resources['银元'] === 90,
      'B8d: 不另立币种 —— 扣的就是 people[].resources 里那一项');
    // 先判后扣：不够时一克不动
    const W2 = envWith(ov).WA;
    const h = toHearing(W2);
    W2.ruling.rule(h.id, { verdict: 'guilty' });
    const before = W2.store.get().people['p_甲'].resources['银元'];
    const bad = W2.ruling.enforce(h.id, { kind: 'fine', amount: 99999, material: '银元' });
    a(bad.reason === 'short-fine', 'B8e: 罚不起 ⇒ short-fine（实 ' + (bad && bad.reason) + '）');
    a(W2.store.get().people['p_甲'].resources['银元'] === before,
      'B8f: **先判后扣** —— 一克都没动（实 ' + before + ' → ' + W2.store.get().people['p_甲'].resources['银元'] + '）');
  })();
  // B9 撤销处罚不重复退款（验收原文）
  (function () {
    const W = envWith(ov).WA;
    const e = toEnforced(W);
    const r1 = W.ruling.refund(e.penalty, { why: '判错了' });
    a(r1.ok === true && r1.refunded === true,
      'B9: 撤销处罚 ⇒ 退款（实 ok=' + (r1 && r1.ok) + '）');
    a(W.store.get().people['p_甲'].resources['银元'] === 100,
      'B9b: 钱真的退回被告（90 → ' + W.store.get().people['p_甲'].resources['银元'] + '）');
    const r2 = W.ruling.refund(e.penalty, { why: '再退一次' });
    a(r2.reason === 'already-refunded',
      'B9c: 第二次撤销 ⇒ already-refunded（实 ' + (r2 && r2.reason) + '）—— **不重复退款**（验收原文）');
    a(W.store.get().people['p_甲'].resources['银元'] === 100,
      'B9d: 重复退款被挡住 —— 钱没多出来（实 ' + W.store.get().people['p_甲'].resources['银元'] + '）');
    // 不静默造钱：收款方已经把罚金花掉，扣不回来时如实上报差额
    const W2 = envWith(ov).WA;
    // ⚠ 必须显式指定收款方：不指定 ⇒ 罚款走「上缴出账」⇒ 没有可从 `to` 扣回的那一笔，
    //   clawbackShort 恒为 0，这条判据拿不到预期输入（实测 /tmp/e6lock2.txt 的 B9e 红灯）。
    const e2 = toEnforced(W2, { to: '乙' });
    a(e2.ok === true, 'B9e0: 前置 —— 罚了 10 并记入乙账');
    // 把收款方（乙）的钱挪走，模拟「已经花掉了」
    W2.store.transact(function (d) { d.people['p_乙'].resources['银元'] = 0; return true; }, 'exp6:drain');
    const r3 = W2.ruling.refund(e2.penalty, { why: '判错了' });
    a(r3.ok === true && r3.clawedBack === 0 && r3.clawbackShort === 10,
      'B9e: 收款方钱不够 ⇒ 差额如实进 clawbackShort（实 clawedBack=' + (r3 && r3.clawedBack)
        + ' short=' + (r3 && r3.clawbackShort) + '）—— 不静默造钱');
    a(W2.store.get().people['p_乙'].resources['银元'] === 0,
      'B9f: 收款方没被扣成负数（实 ' + W2.store.get().people['p_乙'].resources['银元'] + '）');
  })();
  // B10 新证据经复核改变裁决（验收原文）
  (function () {
    const W = envWith(ov).WA;
    const h = toHearing(W);
    const r = W.ruling.rule(h.id, { verdict: 'guilty', by: '乙' });
    a(r.ok === true && r.verdict === 'guilty', 'B10: 先判有罪（前置）');
    const noNew = W.ruling.review(h.id, { verdict: 'not-guilty' });
    a(noNew.reason === 'no-new-grounds',
      'B10b: 没有新证据就复核 ⇒ no-new-grounds（实 ' + (noNew && noNew.reason) + '）—— 不许同一批证据翻来覆去改判');
    const s = W.ruling.submit(h.id, { side: 'defense', kind: 'document', content: '新发现的账册' });
    a(s.ok === true, 'B10c: 裁决后提交新证物（前置）');
    const rev = W.ruling.review(h.id, { verdict: 'not-guilty', by: '乙', reason: '新证据' });
    a(rev.ok === true && rev.verdict === 'not-guilty' && rev.changed === true,
      'B10d: **新证据经复核改变裁决**（实 ' + (rev && rev.prevVerdict) + ' → ' + (rev && rev.verdict)
        + ' changed=' + (rev && rev.changed) + '）—— 验收原文');
    a(rev.fresh === 1, 'B10e: 回执点名用了新证据（实 fresh=' + (rev && rev.fresh) + '）');
    a(s.postRuling === true && s.seq === 2,
      'B10g: 裁决之后的提交被标为**复核用新证据**（实 postRuling=' + (s && s.postRuling)
        + ' seq=' + (s && s.seq) + '）');
    a(W.ruling.caseOf(h.id).status === 'reviewed',
      'B10h: 复核后案件落 reviewed（**不被改回 hearing** —— 已判过的案不会「倒退」成待质证）');
    const v = W.ruling.verdictOf(h.id);
    a(v && v.verdict === 'not-guilty' && v.seq === 2,
      'B10f: 裁决面记到第二次（实 seq=' + (v && v.seq) + ' verdict=' + (v && v.verdict) + '）');
  })();
  // B11 不替世界定位置：跑完全程，world 一字未改
  (function () {
    const W = envWith(ov).WA;
    const before = JSON.stringify(W.store.get().world || {});
    const e = toEnforced(W);
    a(e.ok === true, 'B11: 前置 —— 走完全程');
    W.ruling.enforce(e.id, { kind: 'custody', amount: 0 });
    a(JSON.stringify(W.store.get().world || {}) === before,
      'B11b: 收监只记账，world **一字未改**（位置改动走世界侧，本模块不瞬移）');
  })();
  // B12 注入：两道闸 + 只列当事人
  (function () {
    const W = envWith(ov).WA;
    toHearing(W);
    W.ruling.setSettings({ viewer: '' });
    a(W.ruling.buildBlock() === '', 'B12: 没设观察者 ⇒ 注入块为空串（宁可零 token，也不产全知版案卷）');
    W.ruling.setSettings({ viewer: '丙' });
    a(W.ruling.buildBlock() === '',
      'B12b: 观察者没参与任何一案 ⇒ 仍是空串（不靠「别人在打官司」把块撑起来）');
    W.ruling.setSettings({ viewer: '甲' });
    const blk = W.ruling.buildBlock();
    a(blk.indexOf('[案件]') >= 0, 'B12c: 当事人有案子 ⇒ 产出注入块');
    a(blk.indexOf('不能单独作为定罪依据') >= 0,
      'B12d: 块里点名「通缉记录不能单独作为定罪依据」（验收原文）');
    a(blk.indexOf('不重复退款') >= 0, 'B12e: 块里点名「撤销处罚不重复退款」（验收原文）');
    a(blk.indexOf('世界侧') >= 0, 'B12f: 块里点名位置由世界侧落实（不瞬移）');
  })();

  /* ============ C 契约与边界 ============ */
  // C1 三档裁决是封闭集
  (function () {
    const W = envWith(ov).WA;
    a(W.ruling.VERDICTS.join(',') === 'guilty,not-guilty,dismissed',
      'C1: 三档裁决是封闭集（实 ' + W.ruling.VERDICTS.join(',') + '）');
    const h = toHearing(W);
    a(W.ruling.rule(h.id, { verdict: '处斩' }).reason === 'bad-ruling',
      'C1b: 表外裁决 ⇒ bad-ruling（自造一个档不认）');
  })();
  // C2 程序六段是封闭集
  (function () {
    const W = envWith(ov).WA;
    a(W.ruling.CASE_STATUS.join(',') === 'filed,notified,hearing,ruled,enforced,reviewed',
      'C2: 程序六段是封闭集（实 ' + W.ruling.CASE_STATUS.join(',') + '）');
    a(openCase(W).status === 'filed', 'C2b: 立案落在 filed（第一段）');
  })();
  // C3 缺字段如实报
  (function () {
    const W = envWith(ov).WA;
    a(W.ruling.open({ accused: '甲' }).reason === 'missing-fields', 'C3: 缺指控/案发地 ⇒ missing-fields');
    const o = openCase(W);
    a(W.ruling.submit(o.id, { side: 'prosecution', content: 'x' }).reason === 'bad-phase',
      'C3b: 刚立案 ⇒ 先撞阶段闸（阶段闸比字段闸更靠前 —— 如实报当前障碍）');
    W.ruling.notify(o.id, { by: '乙' });
    a(W.ruling.submit(o.id, { side: '', content: 'x' }).reason === 'missing-fields',
      'C3c: 进到质证段后，缺 side ⇒ missing-fields');
    a(W.ruling.submit(o.id, { side: '第三方', content: 'x' }).reason === 'unknown-party',
      'C3d: 两造之外 ⇒ unknown-party（parties 是封闭集）');
  })();
  // C4 容量闸
  (function () {
    const W = envWith(ov).WA;
    W.ruling.setSettings({ maxCases: 2 });
    openCase(W, { charge: '案一' });
    openCase(W, { charge: '案二' });
    a(openCase(W, { charge: '案三' }).reason === 'cases-full',
      'C4: 案件行到上限 ⇒ cases-full（不静默挤掉已立的案）');
    W.ruling.setSettings({ maxCases: 24 });
  })();
  // C5 非罚款处罚没有可退的款项
  (function () {
    const W = envWith(ov).WA;
    toEnforced(W);
    // ⚠ 不能对已执行的案子再 enforce：案已落 `enforced`（CLOSED_CASE）⇒ 撞 case-closed。
    //   另开一案走完程序再执行（实测 /tmp/e6lock2.txt 的 C5 红灯）。
    const o2 = openCase(W, { charge: '案二' });
    W.ruling.notify(o2.id, { by: '乙' });
    W.ruling.submit(o2.id, { side: 'prosecution', kind: 'testimony', content: '证词' });
    W.ruling.rule(o2.id, { verdict: 'guilty' });
    const c = W.ruling.enforce(o2.id, { kind: 'custody', amount: 0 });
    a(c.ok === true && c.kind === 'custody',
      'C5: 非罚款处罚（收监）只记账（实 ok=' + (c && c.ok) + '）');
    a(W.ruling.refund(c.id, { why: 'x' }).reason === 'no-penalty',
      'C5b: 非罚款类处罚退款 ⇒ no-penalty（没有可退的款项）');
  })();
  // C6 不存在的处罚 id
  (function () {
    const W = envWith(ov).WA;
    a(W.ruling.refund('pn_查无此罚', { why: 'x' }).reason === 'no-penalty',
      'C6: 不存在的处罚 id ⇒ no-penalty（不凭 id 编一笔出来退）');
    a(W.ruling.notify('cs_查无此案', {}).reason === 'no-such-case',
      'C6b: 不存在的案子 ⇒ no-such-case（两件事分得开）');
  })();
  // C7 reload 从存档重建
  (function () {
    const W = envWith(ov).WA;
    toEnforced(W);
    const r = W.ruling.reload();
    a(r.ok === true && r.cases === 1 && r.penalties === 1,
      'C7: reload 从存档重建（实 cases=' + r.cases + ' penalties=' + r.penalties + '）');
    a(W.ruling.list().length === 1, 'C7b: 存档是唯一真源 —— 重建后案子还在');
  })();

}

/* ============ N 真源码破坏 + 两向自证 ============ */
async function runNegative(a, ov) {
  ov = ov || {};
  function broken(key, repl) {
    const o = {};
    o[ANCHOR[key].rel] = rd(ANCHOR[key].rel, ov).replace(ANCHOR[key].txt, repl);
    return o;
  }
  // N1 不自动抓人：把必经的阶段闸入口改成写口（warrant 名单被本模块改动）
  //   破坏点落在 `phaseGate()` 而非 `money()` —— 后者只在「未指定 material」时被调，主路径不经过。
  (function () {
    const o = broken('phaseGateFn',
      "  function phaseGate(cur, allow) {\n    if (WA.warrant) WA.warrant.pardon('甲', 'major', '被 ruling 抹掉');\n    const c = clean(cur, 12);");
    let hit = false;
    try {
      const W = envWith(o).WA;
      if (W.warrant && typeof W.warrant.report === 'function') {
        W.warrant.setSettings({ enabled: true });
        W.warrant.report('甲', 'major', '夜闯官仓', '官仓');
        const before = JSON.stringify(W.warrant.read('甲'));
        toHearing(W);
        hit = JSON.stringify(W.warrant.read('甲')) !== before;
      } else { hit = true; }
    } catch (e) { hit = true; }
    a(hit, 'N1: 让本模块去动通缉名单 ⇒ 名单被改（B2 的「一案未开且不动 warrant」确实是判据）');
  })();
  // N2 名册闸：拆掉 ⇒ 不在册的人也能当被告
  (function () {
    const W = envWith(broken('partyGate', '')).WA;
    const r = openCase(W, { accused: '查无此人' });
    a(r.ok === true, 'N2: 拆掉名册闸 ⇒ 不在册的人也能被立案（B3 的 unknown-party 确实是判据）');
  })();
  // N3 程序闸：拆掉 ⇒ 跳段（刚立案就能裁决）
  (function () {
    const o = broken('phaseGateFn', "  function phaseGate(cur, allow) {\n    return null;\n    const c = clean(cur, 12);");
    const W = envWith(o).WA;
    const c = openCase(W);
    const r = W.ruling.rule(c.id, { verdict: 'guilty' });
    a(r.reason !== 'bad-phase',
      'N3: 拆掉阶段闸 ⇒ 跳段不再拒收 bad-phase（B4b 的判据非恒真，实 ' + (r && r.reason) + '）');
  })();
  // N4 管辖闸：拆掉 ⇒ 名单外也收
  (function () {
    const o = broken('jurisGate', "    if (false) return refuse('no-jurisdiction', { jurisdiction: juris,");
    const W = envWith(o).WA;
    W.ruling.setSettings({ jurisdictions: '长安' });
    const r = openCase(W, { jurisdiction: '临安' });
    a(r.ok === true, 'N4: 拆掉管辖闸 ⇒ 名单外的管辖也收（B5c 的 no-jurisdiction 确实是判据）');
  })();
  // N5 定罪证据闸：拆掉 ⇒ 仅凭通缉记录就能定罪
  (function () {
    const o = {};
    o[RG] = rd(RG, ov)
      .replace(ANCHOR.groundGate.txt, "      if (false) {\n        return refuse('no-grounds', { case: cur.id, exhibits: exs.length, solid: 0,")
      .replace(ANCHOR.groundGateIn.txt, "      if (false) {\n        out = { ok: false, reason: 'no-grounds', case: row.id, exhibits: live.length,\n          solid: solidNow.length }; return false;");
    const W = envWith(o).WA;
    const c = openCase(W);
    W.ruling.notify(c.id, { by: '乙' });
    W.ruling.submit(c.id, { side: 'prosecution', kind: 'warrant', content: '他在通缉名单上' });
    const r = W.ruling.rule(c.id, { verdict: 'guilty' });
    a(r.ok === true && r.verdict === 'guilty',
      'N5: 拆掉定罪证据闸 ⇒ **仅凭通缉记录就能定罪**（实 ' + (r && r.verdict) + '）—— B6c 的 no-grounds 确实是判据（验收原文核心）');
  })();
  // N6 执行前的定罪闸：拆掉 ⇒ 判无罪也能罚
  (function () {
    const o = {};
    o[RG] = rd(RG, ov)
      .replace(ANCHOR.ruledGate.txt, "    const verdict = clean(cur.verdict, 20);\n    if (false) return refuse('case-not-ruled', { case: cur.id, verdict: verdict,")
      .replace(ANCHOR.ruledGateIn.txt, '      if (false) {');
    const W = envWith(o).WA;
    const c = openCase(W);
    W.ruling.notify(c.id, { by: '乙' });
    W.ruling.submit(c.id, { side: 'prosecution', kind: 'testimony', content: '证词' });
    W.ruling.rule(c.id, { verdict: 'not-guilty' });
    const before = W.store.get().people['p_甲'].resources['银元'];
    const e = W.ruling.enforce(c.id, { kind: 'fine', amount: 5, material: '银元' });
    a(e.ok === true && W.store.get().people['p_甲'].resources['银元'] < before,
      'N6: 拆掉执行前的定罪闸 ⇒ 判无罪也能罚款（实 ok=' + (e && e.ok) + '，'
        + before + ' → ' + W.store.get().people['p_甲'].resources['银元'] + '）—— B7b 的 case-not-ruled 确实是判据');
  })();
  // N7 罚款先判后扣：拆掉 ⇒ 照收单（不够也扣）
  (function () {
    const o = {};
    o[RG] = rd(RG, ov)
      .replace(ANCHOR.fineGate.txt, "      if (false) {\n        return refuse('short-fine', { who: cur.accused, material: material,")
      .replace(ANCHOR.fineGateIn.txt, '        if (false) {');
    const W = envWith(o).WA;
    const h = toHearing(W);
    W.ruling.rule(h.id, { verdict: 'guilty' });
    const r = W.ruling.enforce(h.id, { kind: 'fine', amount: 99999, material: '银元' });
    a(r.ok === true && r.reason !== 'short-fine',
      'N7: 拆掉罚款闸 ⇒ 罚不起也照收单（实 ok=' + (r && r.ok) + ' reason=' + (r && r.reason)
        + '，钱袋 ' + W.store.get().people['p_甲'].resources['银元'] + '）—— B8e 的 short-fine 确实是判据');
  })();
  // N8 不重复退款：拆掉 ⇒ 退两次
  (function () {
    const o = broken('refundGate', "      if (false) {\n        out = { ok: false, reason: 'already-refunded', id: pr.id,");
    const W = envWith(o).WA;
    const e = toEnforced(W);
    W.ruling.refund(e.penalty, { why: '第一次' });
    const r2 = W.ruling.refund(e.penalty, { why: '第二次' });
    a(r2.ok === true && W.store.get().people['p_甲'].resources['银元'] === 110,
      'N8: 拆掉退款闸 ⇒ 同一笔退两次（实 ok=' + (r2 && r2.ok) + '，钱袋 '
        + W.store.get().people['p_甲'].resources['银元'] + '）—— B9c 的 already-refunded 确实是判据（验收原文）');
  })();
  // N9 复核必须有新证据：拆掉 ⇒ 同一批证据反复改判
  (function () {
    const o = {};
    o[RG] = rd(RG, ov)
      .replace(ANCHOR.freshGate.txt, "    if (false) {\n      return refuse('no-new-grounds', { case: cur.id, exhibits: exs.length,")
      .replace(ANCHOR.freshGateIn.txt, '      if (false) {');
    const W = envWith(o).WA;
    const h = toHearing(W);
    W.ruling.rule(h.id, { verdict: 'guilty' });
    const r = W.ruling.review(h.id, { verdict: 'not-guilty' });
    a(r.ok === true && r.verdict === 'not-guilty',
      'N9: 拆掉新证据闸 ⇒ 没新证据也改判（实 ' + (r && r.verdict) + '）—— B10b 的 no-new-grounds 确实是判据（验收原文）');
  })();
  // N10 两道注入闸：一起拆 ⇒ 无观察者也产全知版案卷
  (function () {
    const o = {};
    o[RG] = rd(RG, ov)
      .replace(ANCHOR.viewerGate.txt, '    // viewer gate removed')
      .replace(ANCHOR.memberGate.txt, '    // member gate removed');
    const W = envWith(o).WA;
    toHearing(W);
    W.ruling.setSettings({ viewer: '' });
    a(W.ruling.buildBlock() !== '',
      'N10: 两道闸一起拆 ⇒ 无观察者也产出注入块（B12 的「空串」确实是判据；单拆一层拆不掉 = 纵深防御）');
  })();
  // N10b 成员闸单独：拆掉 ⇒ 没参与的人也能看到别人的案卷
  (function () {
    const o = broken('memberGate', '    // member gate removed');
    const W = envWith(o).WA;
    toHearing(W);
    W.ruling.setSettings({ viewer: '丙' });
    a(W.ruling.buildBlock() !== '',
      'N10b: 只拆成员闸 ⇒ 没参与的人也能拿到别人的案件读数（B12b 的判据非恒真）');
  })();
  // N11 正控制：原版上同款判据必须真
  (function () {
    const W = envWith(ov).WA;
    const c = openCase(W);
    W.ruling.notify(c.id, { by: '乙' });
    W.ruling.submit(c.id, { side: 'prosecution', kind: 'warrant', content: '只有通缉记录' });
    a(W.ruling.rule(c.id, { verdict: 'guilty' }).reason === 'no-grounds'
      && W.ruling.buildBlock() === '',
      'N11: 正控制 —— 原版上「仅凭通缉记录定不了罪 + 无观察者零注入」同时为真');
    const h = toHearing(W);
    W.ruling.rule(h.id, { verdict: 'guilty' });
    a(W.ruling.review(h.id, { verdict: 'not-guilty' }).reason === 'no-new-grounds',
      'N11b: 正控制 —— 原版上「没新证据改不了判」');
    const e = toEnforced(W);
    a(e.ok === true && W.ruling.refund(e.penalty, { why: 'x' }).ok === true
      && W.ruling.refund(e.penalty, { why: 'x' }).reason === 'already-refunded',
      'N11c: 正控制 —— 原版上「退一次成功、退两次被挡」');
  })();
}


module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };

/* ============ 单独运行 ============ */
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    try { await runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控失效：' + (e && e.stack)); }
    console.log('\nEXP6-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}