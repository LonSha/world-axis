#!/usr/bin/env node
// WorldAxis tests/org-econ-v2950.js —— v2.95.0（X2 · B3 经济引擎：职册 / 功簿 / 薪俸 / 欠薪 / 罚没）
//
// 它治的病：四句话在 v2.94.0 都答不上来——
//   ① 「这个组织里有谁、各任什么职」（只有库存，没有名册）；
//   ② 「这一期该发多少、按什么行情发」（经济风只是个读数，不影响任何人拿到什么）；
//   ③ 「发薪发出去了吗、欠着谁的」（没有欠薪概念——「发过」与「没发」长得一样）；
//   ④ 「谁做得好、谁该升、谁受过罚」（没有功簿与处分）。
//
// 口径三条：
//   ① **不新造写通道**：薪酬 / 补发 / 罚没一律复用 transfer ⇒ 自动进 O5 流水、可被 O6
//      带外对账核、异常时进 O7 健康分。同一本账，没有影子账。
//   ② **两档同账不同词**：同一个倍率在精确档给 `mul`、叙事档给「宽裕/如常/紧绌/朝不保夕」；
//      经济风不可读时两档都不给（`known:false`）——「不知道」不借用「如常」。
//   ③ **欠就是欠**：发不出不假装发得出，记 `owed` 并报 `partial`/`insufficient`；
//      `ok`（流程跑完）与 `settled`（从此不欠谁）是两件事。
//
// 判据：
//   A 静态面：常量与七口在真源码 / 导出对象 / 诊断读数 / 面板九控件九绑定 / 守卫登记 /
//            内部面不导出（writeOwed / membersOf / organizationSummary）。
//   B 运行时面（真装载真调用）：
//     B1 职册：编入 ⇒ 名册读数；repeat 编入是**改职**（changed=true，count 不变，不叠加）
//     B2 功簿：记功只记在册者；不在册报 not-on-roster；够门槛只报 ready、**不自动晋升**
//     B3 晋升：够门槛升一阶；不够报 insufficient-contrib 且带 need/have（不四舍五入）
//     B4 经济风倍率真进账：同职阶在「繁荣」与「衰退」下 due 不同（否则口径②是空话）
//     B5 发薪走 transfer：库存减少量与流水笔数对得上（同一本账，没有影子账）
//     B6 欠就是欠：钱不够 ⇒ 欠薪记进名册、报 partial、settled=false；补发后 settled=true
//     B7 补发只补得起的量：欠 30 补 12 ⇒ left=18、settled=false（不抹成「清了」）
//     B8 罚没一次 transfer 走完：本人减、势力增、fined 累计，且**只有一笔**流水
//     B9 纯读：连读四次 rosterView，存档与 stat 字节级不变
//     B10 诊断与账本读数同源：diag.organization 与 ledgerView().organization 同读数
//   C 不变式：O5 / O6 面不被本版破坏（ledgerView 旧字段与 exportJournal 语义不变）
//   N0–N4 负控制：**真源码破坏 ⇒ 加载破坏副本 ⇒ 在副本上重跑同款真判据**（不是只验文本被改过）。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const ORG = 'engines/org.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自**只在本文件声明一次**）══════════════
const ANCHORS = {
  // 口径① 不新造写通道：把罚没从「一次 transfer」破坏成「直接改两面库存」（影子写通道）
  PENALTY_ONE_SHOT: { rel: ORG, txt: "    const r = transfer('person', p, 'faction', f, it, n);" },
  // 口径③ 欠就是欠：把「发不出就记账」破坏成「静默跳过」（欠薪烂在账里没人知道）
  OWED_RECORD: { rel: ORG, txt: "    writeOwed(f, m.name, m.owed + due.pay, item);" },
  // 口径③ ok/settled 分离：把「欠薪不叫 settled」破坏成「流程跑完就算清」
  SETTLED_HONEST: { rel: ORG, txt: "    const settled = failed.length === 0 && owed.length === 0 && left === 0;" },
  // 口径② 两档同词源：把「不可读就不给词」破坏成「回落成「如常」」
  TIDE_NO_FALLBACK: { rel: ORG, txt: "    const word = (c.available && TIDE_WORD[climate]) ? TIDE_WORD[climate] : null;" },
  // 口径② 倍率真进账：把倍率从应付里摘掉（经济风又变回「不影响任何人拿到什么」）
  TIDE_MUL_IN_DUE: { rel: ORG, txt: "    const fine = Math.max(0.1, Math.round((role.pay * rs * m) * 20) / 20);" },
  // 功簿只记在册者：把「不在册拒收」破坏成「随手补一条名册记录」
  // 功簿只记在册者：把「不在册拒收」破坏成「随手补一条名册记录」。
  //   锚点必须**含那段守卫本身**：单看 `rec.contrib = Math.min(...)` 会与 assignRole 里的同型行撞车
  //   （实测 self=2），锚点撞车 = 判据改错地方（v2.94.0 血教训）。
  CREDIT_ROSTERED_ONLY: { rel: ORG, txt: "      const rec = rosterOf(row)[p];\n      if (!rec) { out = { ok: false, reason: 'not-on-roster' }; return false; }\n      const before = typeof rec.contrib === 'number' ? rec.contrib : 0;" }
};
// ══════════════ 破坏形态（每条对应一个可观测行为变化）══════════════
const BREAK = {
  PENALTY_ONE_SHOT: "    const r = { ok: true };\n    WA.store.transact(function (d) {\n      const a1 = holder('person', p, d), b1 = holder('faction', f, d);\n      if (!a1 || !b1) return false;\n      a1.resources = stockOf(a1); b1.resources = stockOf(b1);\n      a1.resources[it] = (a1.resources[it] || 0) - n; b1.resources[it] = (b1.resources[it] || 0) + n;\n    }, 'org:penalty-shadow');",
  OWED_RECORD: "    void 0;",
  SETTLED_HONEST: "    const settled = failed.length === 0;",
  TIDE_NO_FALLBACK: "    const word = TIDE_WORD[climate] || '如常';",
  TIDE_MUL_IN_DUE: "    const fine = Math.max(0.1, Math.round((role.pay * rs) * 20) / 20);",
  CREDIT_ROSTERED_ONLY: "      let rec = rosterOf(row)[p];\n      if (!rec) { rec = { role: 'novice', contrib: 0, owed: 0, owedItem: '', fined: 0, hiredAt: clockNow('org') }; row.roster[p] = rec; }\n      const before = typeof rec.contrib === 'number' ? rec.contrib : 0;"
};
/** 真源码破坏：锚点恰中 1 次才动手，返回 {src, changed} */
function breakOne(key) {
  const A = ANCHORS[key];
  const s = src(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}
// ══════════════ 运行时装置 ══════════════
function seed(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    ['甲', '乙', '丙', '丁'].forEach(function (n) { d.people['p_' + n] = { id: 'p_' + n, name: n, resources: {} }; });
    d.evolution = d.evolution || {};
    // 复位到**已知票面**：fresh() 复用宿主 localStorage，上一用例改坏的存档会带着出场。
    // 势力数组**整体重写**，不是「按名字找再改」、更不是「不存在才 push」：
    //   全量套件里前面几十个锁共用同一宿主 localStorage，它们往 factions 里塞过别的势力，
    //   于是『按名字找』会找到旧票面、『读数组首元素』会读到别人的库存
    //   （首次全量回归实测：B5 断言出现「实 999」——那是别的套件留下的）。
    d.evolution.factions = [{ name: '会', resources: { 粮: 30 } }];
    d.evolution.economy = { climate: '平稳', signals: [] };
  }, 'v2950:seed');
  if (WA.org && WA.org.setSettings) WA.org.setSettings({ enabled: true });
  return WA;
}
/** 按**名字**取势力读数（不依赖下标）。
 *  为什么不能用数组首元素：全量套件里同一宿主 localStorage 被几十个锁共用，
 *  数组里可能有别的势力排在前面（首次全量回归实测踩到，B5 读到「实 999」）。
 *  这是 v2.94.0「夹具必须复位到已知票面」那条纪律的延伸：读数面同样不能依赖偶然顺序。 */
function facOf(W) {
  const st = W.store.get() || {};
  const hit = (((st.evolution || {}).factions) || []).filter(function (x) { return x && x.name === '会'; })[0];
  return hit || { resources: {} };
}
/** 在**草稿**上按名字改票面：只换 `resources`，**保留 roster 等其它字段**。
 *  不能像 seed() 那样整换整个势力对象——那条路径会把已经编好的名册一起抹掉，
 *  于是 payroll 读到空名册报 empty-roster，欠薪判据在**两边都**读到 0（N4 实测踩到：
 *  so=0 / sb=0，破坏与否都观测不到差异）。
 *  此刻数组不可能还有别的势力：seed() 已把整数组重写成恰好一个「会」。 */
function setFac(d, res) {
  const arr = d.evolution.factions || [];
  const hit = arr.filter(function (x) { return x && x.name === '会'; })[0];
  if (hit) { hit.resources = res; return; }
  d.evolution.factions = arr.concat([{ name: '会', resources: res }]);
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H.WA;
}
// ══════════════ 同款真判据（原版与破坏副本上跑的是同一批函数）══════════════
/** B8：罚没**一次 transfer** 走完 —— 罚没是「本人 → 势力」的转移，
 *  故「本人减、势力增」必须落在**同一支笔**上（两步写法在第二步失败时会凭空多出资源）。
 *  实测：甲入 40、势力 30 ⇒ 罚 10 后 甲 30 / 势力 40 / 流水恰 +1 笔。 */
function probePenaltyOneShot(W) {
  try {
    W.org.assignRole('会', '甲', 'member');
    W.org.grant('person', '甲', '粮', 40);
    const stockOfPerson = function () { return (W.store.get().people['p_甲'].resources || {})['粮'] || 0; };
    const stockOfFac = function () { return (facOf(W).resources || {})['粮'] || 0; };
    const p0 = stockOfPerson(), f0 = stockOfFac(), j0 = W.org.exportJournal().entries;
    const r = W.org.penalize('会', '甲', '粮', 10);
    if (!r.ok) return false;
    const p1 = stockOfPerson(), f1 = stockOfFac(), j1 = W.org.exportJournal().entries;
    return p1 === p0 - 10 && f1 === f0 + 10 && (j1 - j0) === 1;
  } catch (e) { return false; }
}
/** B6：欠就是欠 —— 势力只有 1 单位、名册里三个人 ⇒ 只发得出一个人，其余记欠薪。 */
function probeOwedRecord(W) {
  try {
    W.store.transact(function (d) { setFac(d, { 粮: 1 }); }, 'v2950:thin');
    ['甲', '乙', '丙'].forEach(function (n) { W.org.assignRole('会', n, 'chief'); });
    const r = W.org.payroll('会', { item: '粮' });
    const rv = W.org.rosterView('会');
    const owedN = rv.members.reduce(function (a2, b) { return a2 + b.owed; }, 0);
    // 三个人各应付 30，势力只有 1 ⇒ 恰一个人拿到 1（被截到 1 是因为整数下限），两人欠。
    return r.ok === true && r.owed.length >= 2 && owedN >= 59 && r.leftOwed === owedN && r.settled === false;
  } catch (e) { return false; }
}
/** B6b：`ok` 与 `settled` 必须分开 —— 流程跑完而全员欠薪，是最坏也最容易被读成成功的一种结局。 */
function probeSettledHonest(W) {
  try {
    W.store.transact(function (d) { setFac(d, {}); }, 'v2950:broke');
    ['甲', '乙'].forEach(function (n) { W.org.assignRole('会', n, 'chief'); });
    const r = W.org.payroll('会', { item: '粮' });
    return r.ok === true && r.settled === false && r.reason === 'insufficient'
      && r.paid === 0 && r.owedTotal === 60 && r.owed.length === 2;
  } catch (e) { return false; }
}
/** 口径②：经济风不可读时**不给词**（`known:false` / `word:null`），不回落成「如常」。 */
function probeTideNoFallback(W) {
  try {
    W.store.transact(function (d) { delete d.evolution.economy; }, 'v2950:noeco');
    const rv = W.org.rosterView('会');
    return rv.ok === true && rv.tide.known === false && rv.tide.word === null && rv.tide.reason === 'missing'
      && W.store.get().evolution.economy === undefined;
  } catch (e) { return false; }
}
/** 口径②：倍率**真进账** —— 同名册在「繁荣」与「衰退」下应付不同。 */
function probeTideMulInDue(W) {
  try {
    W.org.assignRole('会', '甲', 'chief');
    W.store.transact(function (d) { d.evolution.economy = { climate: '繁荣', signals: [] }; }, 'v2950:boom');
    const boom = W.org.rosterView('会').members[0].due;
    W.store.transact(function (d) { d.evolution.economy = { climate: '衰退', signals: [] }; }, 'v2950:bust');
    const bust = W.org.rosterView('会').members[0].due;
    return boom === 38 && bust === 23 && boom > bust;
  } catch (e) { return false; }
}
/** 功簿只记在册者：不在册报 not-on-roster，且**不得**顺手补一条名册记录。 */
function probeCreditRosteredOnly(W) {
  try {
    const before = Object.keys((facOf(W).roster) || {}).length;
    const r = W.org.creditWork('会', '丁', 5);
    const after = Object.keys((facOf(W).roster) || {}).length;
    return r.ok === false && r.reason === 'not-on-roster' && before === 0 && after === 0;
  } catch (e) { return false; }
}
// ══════════════ A / B / C 判据 ══════════════
function runAll(a) {
  const oSrc = src(ORG), dSrc = src(DIAG), pSrc = src(PANEL);
  // ── A 静态面 ──
  Object.keys(ANCHORS).forEach(function (k) {
    const A = ANCHORS[k];
    a(hits(src(A.rel), A.txt) === 1, 'v2950: [A1] 锚点在真源码恰中 1 次（' + k + '）');
  });
  a(oSrc.indexOf("  const ROLES = [") > 0 && oSrc.indexOf("  const TIDE = { 繁荣: 1.25, 平稳: 1, 衰退: 0.75, 动荡: 0.6 };") > 0
    && oSrc.indexOf("  const TIDE_WORD = { 繁荣: '宽裕', 平稳: '如常', 衰退: '紧绌', 动荡: '朝不保夕' };") > 0,
    'v2950: [A1] 职阶表 + 倍率表 + 词表在场（两档同账不同词的真源各只此一份）');
  a(hits(oSrc, 'TIDE_WORD') === 3 && oSrc.indexOf('PAY_CYCLE') < 0,
    'v2950: [A1] 词表只有「声明 1 + 使用 2」三处引用（两档同词源）；不引入工分换算系数（它会摊薄倍率）');
  a(oSrc.indexOf('    assignRole: assignRole, creditWork: creditWork, promote: promote, rosterView: rosterView,') > 0
    && oSrc.indexOf('    payroll: payroll, settleOwed: settleOwed, penalize: penalize,') > 0,
    'v2950: [A1] 七个新成员在 WA.org 导出对象里（导出即有承诺）');
  a(['writeOwed', 'membersOf', 'organizationSummary'].every(function (n) {
    return oSrc.indexOf('    ' + n + ': ' + n) < 0;
  }) && oSrc.indexOf('function organizationSummary()') > 0,
    'v2950: [A1] 三个内部面**不导出**（各自只有本体内的消费方：writeOwed→payroll/settleOwed、membersOf→rosterView/payroll、organizationSummary→ledgerView）');
  a(oSrc.indexOf('      organization: organizationSummary(),') > 0,
    'v2950: [A1] 账本读带 organization 段（欠薪不必靠用户点面板才看得见）');
  // A2 接线两面
  a(dSrc.indexOf('organization: orgz ? { rosterCount: orgz.rosterCount, owedTotal: orgz.owedTotal,') > 0,
    'v2950: [A2] 诊断 secOrg 组织读数在场（真消费方一）');
  // 两类控件形态不同，判据必须分开写：
  //   · 按钮七件：`id="X"` 渲染 + `on('#X',` 绑定（绑定形态带**逗号**——不带逗号的写法
  //     在本仓一次都不出现，「七个都搜不到」是判据写错而不是产品没接，实测踩到并纠正）；
  //   · 输入框两件（person / role）：`id="X"` 渲染 + 被 `orgVal('#X')` 读值——
  //     它们**没有也不该有** on() 绑定，把输入当按钮判会让这条永久为假。
  const BTN7 = ['wa-org-assign', 'wa-org-credit', 'wa-org-promote', 'wa-org-roster',
    'wa-org-pay', 'wa-org-settle', 'wa-org-penalize'];
  const INP2 = ['wa-org-person', 'wa-org-role'];
  a(BTN7.every(function (id) {
    return pSrc.indexOf('id="' + id + '"') > 0 && pSrc.indexOf("on('#" + id + "',") > 0;
  }), 'v2950: [A2] 面板七个新按钮「渲染 + 绑定」成对在场（真消费方二——每个口一个真消费方）');
  a(INP2.every(function (id) {
    return pSrc.indexOf('id="' + id + '"') > 0 && pSrc.indexOf("'#" + id + "'") > 0;
  }), 'v2950: [A2] 面板两个新输入框「渲染 + 被读值」成对在场（输入框不走 on 绑定）');
  a(dSrc.indexOf("'wa-org-person', 'wa-org-role', 'wa-org-assign', 'wa-org-credit', 'wa-org-promote',") > 0,
    'v2950: [A2] 守卫表登记了九个新控件（登记错页比不登记更坏）');
  // ── B 运行时面 ──
  const W = env();
  a(typeof W.org.assignRole === 'function' && typeof W.org.payroll === 'function'
    && typeof W.org.penalize === 'function' && typeof W.org.rosterView === 'function',
    'v2950: [B0] 四口从产品面读到（assignRole / payroll / penalize / rosterView）');
  a(typeof W.org.organizationSummary === 'undefined' && typeof W.org.writeOwed === 'undefined',
    'v2950: [B0] 内部面不挂在产品面上（无消费方不挂）');
  a(typeof W.org.stat().assigns === 'number' && typeof W.org.stat().payrolls === 'number'
    && typeof W.org.stat().penalties === 'number',
    'v2950: [B0] stat 扩到五类新动作计数（assigns/credits/promotions/payrolls/penalties）');

  // B1 职册：编入 / 改任
  const r1 = W.org.assignRole('会', '甲', 'member');
  a(r1.ok === true && r1.role === 'member' && r1.roleName === '管事' && r1.changed === false && r1.count === 1,
    'v2950: [B1] 编入 ⇒ 名册 1 人且 changed=false（「刚收进来」）');
  const r1b = W.org.assignRole('会', '甲', 'steward');
  a(r1b.ok === true && r1b.changed === true && r1b.count === 1 && r1b.role === 'steward',
    'v2950: [B1] 重复编入 = **改职**（changed=true 且 count 仍为 1，不叠加——改任不能读起来像招聘）');
  a(W.org.assignRole('会', '甲', 'no-such-role').reason === 'bad-role'
    && W.org.assignRole('不存在的势力', '甲', 'member').reason === 'missing-holder',
    'v2950: [B1] 表外职阶与不存在的势力各自点名（bad-role / missing-holder）');

  // B2 功簿
  a(probeCreditRosteredOnly(env()), 'v2950: [B2] 记功只记在册者（不在册 ⇒ not-on-roster，且不顺手补名册记录）');
  //   **独立实例**：上面 B1 的第二次编入已把 甲 改成 steward，共用实例会让职阶
  //   与断言的预期错位（实测踩到：need 实测 120 而断言写 40）。
  const Wb = env();
  Wb.org.assignRole('会', '甲', 'member');
  const cr = Wb.org.creditWork('会', '甲', 50);
  a(cr.ok === true && cr.contrib === 50 && cr.plus === 50 && cr.need === 40 && cr.ready === true,
    'v2950: [B2] 记功入账（管事→主事 门槛 40，记到 50 ⇒ ready=true）');
  const cr2 = Wb.org.creditWork('会', '甲', 99);
  a(cr2.contrib === 149 && cr2.plus === 99 && cr2.need === 40,
    'v2950: [B2] 单次上限 99（149 = 50 + 99，累计履历不是一次性灌满的门票）');
  const Wc2 = env();
  Wc2.org.assignRole('会', '甲', 'chief');
  const crT = Wc2.org.creditWork('会', '甲', 1);
  a(crT.need === null && crT.ready === false,
    'v2950: [B2] 到顶职阶（当家）⇒ need=null 且不报 ready（不假装还有上一阶）');
  const Wn = env();
  Wn.org.assignRole('会', '甲', 'member');
  const crN = Wn.org.creditWork('会', '甲', 6);
  a(crN.ready === false && crN.need === 40,
    'v2950: [B2] 6/40 **不报 ready**，且**不自动晋升**（晋升是显式决策，不是记账的副作用）');
  a(Wn.org.rosterView('会').members[0].role === 'member',
    'v2950: [B2] 记功之后职阶仍是 member（自动晋升会让「谁做主的」从账上消失）');

  // B3 晋升
  const Wp = env();
  Wp.org.assignRole('会', '甲', 'novice');
  const pr0 = Wp.org.promote('会', '甲');
  a(pr0.ok === false && pr0.reason === 'insufficient-contrib' && pr0.need === 12 && pr0.have === 0,
    'v2950: [B3] 贡献不够 ⇒ insufficient-contrib 且照实报差多少（need 12 / have 0，不四舍五入）');
  Wp.org.creditWork('会', '甲', 12);
  const pr1 = Wp.org.promote('会', '甲');
  a(pr1.ok === true && pr1.from === 'novice' && pr1.to === 'member' && pr1.toName === '管事',
    'v2950: [B3] 够门槛 ⇒ 升一阶（帮闲 → 管事）');
  a(Wp.org.promote('会', '甲').reason === 'insufficient-contrib'
    && Wp.org.creditWork('会', '甲', 28).ready === true && Wp.org.promote('会', '甲').ok === true,
    'v2950: [B3] 逐阶门槛各自生效（12 → 40）');
  let lastRole = '';
  for (let i = 0; i < 2; i++) { Wp.org.creditWork('会', '甲', 99); const x = Wp.org.promote('会', '甲'); lastRole = x.ok ? x.to : lastRole; }
  a(Wp.org.promote('会', '甲').reason === 'top-role',
    'v2950: [B3] 到顶报 top-role（不假装还能升）');

  // B4 口径②：倍率真进账
  a(probeTideMulInDue(env()), 'v2950: [B4] 经济风**真进账**：当家在繁荣 38 / 衰退 23（否则口径②只是墙上标语）');
  a(probeTideNoFallback(env()), 'v2950: [B4] 经济风不可读 ⇒ known=false / word=null（**不回落成「如常」**）');
  const Wt = env();
  Wt.org.assignRole('会', '甲', 'member');
  const tRoster = Wt.org.rosterView('会');
  a(tRoster.tide.known === true && tRoster.tide.word === '如常' && tRoster.tide.mul === 1,
    'v2950: [B4] 平稳 ⇒ 叙事档「如常」+ 精确档 ×1（两档同账不同词）');

  // B5 发薪走 transfer（同一本账）
  const Wpay = env();
  ['甲', '乙'].forEach(function (n) { Wpay.org.assignRole('会', n, 'member'); });
  const j0 = Wpay.org.exportJournal().entries;
  const st0 = Wpay.org.stat();
  const pay1 = Wpay.org.payroll('会', { item: '粮' });
  const j1 = Wpay.org.exportJournal().entries;
  const stock1 = (facOf(Wpay).resources || {})['粮'];
  a(pay1.ok === true && pay1.settled === true && pay1.paid === 10 && pay1.leftOwed === 0
    && j1 - j0 === 2 && stock1 === 20 && Wpay.org.stat().transfers === st0.transfers + 2,
    'v2950: [B5] 发薪走 transfer：势力 30→20（实 ' + stock1 + '）、流水 +2 笔、transfers +2 —— 同一本账，没有影子账');

  // B6 欠就是欠
  a(probeOwedRecord(env()), 'v2950: [B6] 钱不够 ⇒ 欠薪**记进名册**并报 partial（欠薪烂在账里没人知道，正因为它看起来和按时发了一样干净）');
  a(probeSettledHonest(env()), 'v2950: [B6] 流程跑完但全员欠薪 ⇒ ok=true 而 **settled=false**（两者必须分开）');
  const Ws = env();
  Ws.store.transact(function (d) { setFac(d, { 粮: 12 }); }, 'v2950:recover');
  Ws.org.assignRole('会', '甲', 'chief');
  const p1 = Ws.org.payroll('会', { item: '粮' });
  const g1 = Ws.org.settleOwed('会', '甲', { item: '粮' });
  const p2 = Ws.org.payroll('会', { item: '粮' });
  a(p1.settled === false && p1.leftOwed === 30 && p1.paid === 0 && p1.reason === 'insufficient',
    'v2950: [B6] 当家一份 30 / 库存 12 ⇒ **整笔拒收并记欠 30**（离散量：发半份不叫发薪）');
  a(g1.ok === true && g1.paid === 12 && g1.owed === 30 && g1.left === 18 && g1.settled === false && g1.reason === 'partial',
    'v2950: [B6] 补发按库存还：还 12 ⇒ left=18 照实留着（**不把「还欠着」抹成「清了」**）；债务可分次还，这是与 payroll 的有意差异');
  a(p2.ok === true && p2.settled === false && p2.leftOwed === 48 && p2.paid === 0,
    'v2950: [B6] 欠薪期再发一期 ⇒ 欠额继续累计（18 + 30 = 48，不是把旧欠忘掉重开）');

  // B7 补发边界
  const Wd = env();
  Wd.org.assignRole('会', '甲', 'novice');
  a(Wd.org.settleOwed('会', '甲', {}).reason === 'no-debt',
    'v2950: [B7] 没欠薪时补发报 no-debt（不假装补了一笔）');
  a(Wd.org.settleOwed('会', '乙', {}).reason === 'not-on-roster'
    && Wd.org.settleOwed('会不存在', '甲', {}).reason === 'missing-holder',
    'v2950: [B7] 不在册 / 势力不存在各自点名');

  // B8 罚没
  const Wpen = env();
  Wpen.org.assignRole('会', '甲', 'member');
  Wpen.org.grant('person', '甲', '粮', 40);
  const jp0 = Wpen.org.exportJournal().entries;
  const pn = Wpen.org.penalize('会', '甲', '粮', 10);
  const jp1 = Wpen.org.exportJournal().entries;
  a(pn.ok === true && pn.amount === 10 && pn.to === '会' && jp1 - jp0 === 1
    && (facOf(Wpen).resources || {})['粮'] === 40
    && (Wpen.store.get().people['p_甲'].resources || {})['粮'] === 30
    && Wpen.org.rosterView('会').members[0].fined === 10,
    'v2950: [B8] 罚没**一次 transfer** 走完：甲 40→30、势力 30→40、fined 累计 10、流水**恰 +1 笔**（两步写法会留下没有原子性的中间态）');
  a(Wpen.org.penalize('会', '甲', '粮', 99).reason === 'insufficient'
    && Wpen.org.penalize('会', '乙', '粮', 1).reason === 'not-on-roster',
    'v2950: [B8] 库存不够与不在册各自点名（罚没不把库存扣成负的）');
  a(probePenaltyOneShot(env()), 'v2950: [B8] 罚没真消费方：走产品出口时同样只留一笔流水');

  // B9 纯读
  const Wr = env();
  Wr.org.assignRole('会', '甲', 'member');
  Wr.org.creditWork('会', '甲', 8);
  const snap0 = JSON.stringify(Wr.store.get());
  const stA = Wr.org.stat();
  Wr.org.rosterView('会'); Wr.org.rosterView('会'); Wr.org.ledgerView(); Wr.org.rosterView('会');
  a(snap0 === JSON.stringify(Wr.store.get()) && JSON.stringify(stA) === JSON.stringify(Wr.org.stat()),
    'v2950: [B9] 连读四次 rosterView + 一次 ledgerView，存档与 stat 字节级不变（观测不得改变被观测对象）');

  // B10 诊断与账本读数同源
  const Wg = env();
  Wg.org.assignRole('会', '甲', 'steward');
  Wg.org.creditWork('会', '甲', 20);
  const diag = Wg.toolDiag.collect().org.organization;
  const lv = Wg.org.ledgerView().organization;
  a(diag && diag.rosterCount === lv.rosterCount && diag.owedTotal === lv.owedTotal
    && diag.tide && diag.tide.word === lv.tide.word && diag.tide.mul === lv.tide.mul,
    'v2950: [B10] 诊断 org.organization 与 ledgerView().organization 同读数（含两档经济风）');
  a(diag.tide.mul === 1 && diag.factions === 1,
    'v2950: [B10] 读数带倍率与势力数（「有几个人、欠多少钱、什么行情」一次答齐）');

  // ── C 不变式：O5 / O6 面不被本版破坏 ──
  const Wc = env();
  Wc.org.assignRole('会', '甲', 'member');
  const lvo = Wc.org.ledgerView();
  a(lvo.flow.in === 0 && lvo.entries === 0 && lvo.holderCount >= 1
    && lvo.anomalies.count === 0 && lvo.reconciled.ok === true
    && lvo.climate.available === true && lvo.climate.climate === '平稳',
    'v2950: [C] O5 / O8 的账本读数语义一字不变（零流水 / 零异常 / 自洽 / 经济风 ok）');
  const vj = Wc.org.exportJournal();
  a(vj.ok === true && vj.format === 'worldaxis.org.journal' && vj.formatVersion === 1 && vj.cap === 200,
    'v2950: [C] O6 的 exportJournal 卷头语义一字不变');
  Wc.org.payroll('会', { item: '粮' });
  const anom = Wc.org.ledgerView().anomalies;
  a(anom.count === 0, 'v2950: [C] 本版新增的写路径（发薪/罚没）走 transfer ⇒ 流水恒自洽（零异常笔）');
}
// ══════════════ 负控制（真源码破坏 → 破坏副本 → 副本上重跑同款真判据）══════════════
function runNegative(a) {
  const CASES = [
    ['PENALTY_ONE_SHOT', probePenaltyOneShot, '罚没一次 transfer 走完'],
    ['OWED_RECORD', probeOwedRecord, '欠薪记进名册'],
    ['SETTLED_HONEST', probeSettledHonest, 'ok 与 settled 分离'],
    ['TIDE_NO_FALLBACK', probeTideNoFallback, '经济风不可读时不给词'],
    ['TIDE_MUL_IN_DUE', probeTideMulInDue, '倍率真进账'],
    ['CREDIT_ROSTERED_ONLY', probeCreditRosteredOnly, '记功只记在册者']
  ];
  // N0 六锚点各中 1 次（并顺带证明原版上同款判据为真——判据纯度）
  let n0 = 0;
  CASES.forEach(function (c) {
    try {
      const br = breakOne(c[0]);
      must1(src(ANCHORS[c[0]].rel), ANCHORS[c[0]].txt, c[0] + ':origin');
      if (c[1](env()) !== true) throw new Error('probe false on ORIGINAL');
      const o = {}; o[br.rel] = br.src;
      const got = c[1](env(o));
      if (got !== false) throw new Error('probe still true on BROKEN');
      n0++;
    } catch (e) { console.log('  ✗ N1 ' + c[0] + ': ' + e.message); }
  });
  a(n0 === 6, 'v2950: [N1] 六向破坏各自现形（真源码破坏 ⇒ 破坏副本上同款判据由真变假）');

  // N2 读数随事实变化（同一实例内 rosterCount 0 → 2）
  const W = env();
  const b0 = W.org.rosterView('会');
  a(b0.count === 0, 'v2950: [N2] 空名册报 count=0（设计内默认态，不是错误）');
  W.org.assignRole('会', '甲', 'novice');
  W.org.assignRole('会', '乙', 'member');
  const b1 = W.org.rosterView('会');
  a(b1.count === 2 && b1.members.length === 2, 'v2950: [N2] 编入两人 ⇒ count 0 → 2（读数随事实变化，不是恒值）');
  a(W.org.payroll('会', {}).count === 2, 'v2950: [N2] 发薪覆盖名册全员（不是只发头一个）');

  // N3 空名册与坏参数各自点名
  const W3 = env();
  a(W3.org.payroll('会', {}).reason === 'empty-roster', 'v2950: [N3] 空名册发薪报 empty-roster（不假装发过）');
  a(W3.org.assignRole('', '甲', 'member').reason === 'bad-name'
    && W3.org.creditWork('会', '甲', 0).reason === 'bad-amount'
    && W3.org.penalize('会', '甲', '粮', 0).reason === 'bad-resource',
    'v2950: [N3] 坏参数三种各自点名（bad-name / bad-amount / bad-resource）');

  // N4 工具两向自证：锚点不存在 / 不唯一须抛；破坏须可观测改行为
  let n4 = 0;
  try { must1(src(ORG), 'const NO_SUCH_ANCHOR_2950 = 1;', 'n4-absent'); }
  catch (e) { n4++; }
  try { must1(src(ORG), '  function ', 'n4-not-unique'); }
  catch (e) { n4++; }
  try {
    const br = breakOne('OWED_RECORD');
    const broken = (function () { const o = {}; o[br.rel] = br.src; return o; })();
    // 必须先**制造欠薪**再比：两个都没欠薪时 rosterView 逐字相同，差异根本观测不到
    //   （实测踩到——这样的「自证」是恒假或恒真的，证不了破坏可观测）。
    const owedAfter = function (W) {
      W.org.assignRole('会', '甲', 'chief');
      W.store.transact(function (d) { setFac(d, {}); }, 'n4:broke');
      W.org.payroll('会', { item: '粮' });
      return W.org.rosterView('会').owed;
    };
    const so = owedAfter(env()), sb = owedAfter(env(broken));
    if (so === 30 && sb === 0) n4++;
  } catch (e) {}
  a(n4 === 3, 'v2950: [N4] 锚点不存在/不唯一各自抛；且破坏真能改变可观测行为（工具两向自证）');

  // H5 判据纯度：负控制层内每条锚点字面量只声明一次。
  //   **输入面必须与结论面同宽**：锚点在源文件里是双引号串，多行锚点写作转义的 `\n`，
  //   而运行时 ANCHORS[k].txt 已被 JS 解析成真换行——拿真换行去原文里搜恒为 0 命中，
  //   于是「多行锚点」会让 H5 永久为假（实测踩到）。故把真换行还原成转义形态再比对。
  const self = src('tests/org-econ-v2950.js');
  const ok5 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok5, 'v2950: [H5] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };
if (require.main === module) {
  console.log('■ WorldAxis v2.95.0 专锁（X2 · B3 经济引擎）');
  runAll(a);
  runNegative(a);
  console.log('  通过 ' + PASS + ' / 失败 ' + FAIL);
  process.exit(FAIL ? 1 : 0);
}