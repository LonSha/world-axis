#!/usr/bin/env node
'use strict';
// WorldAxis tests/s3-b3-n2-v2220.js (v2.220.0) — N2 NPC 候选策略与受挫重规划专锁（五段齐备）
//
// 【拓展原文逐条对照】（engines/plan.js 头注释与 N2 注释）
//   缺口：`candidates()` 此前只答「卡在哪一步、声明了哪条改选、还剩几次」，答不出**为什么卡**——
//     是没资源、装不下、去不了、还是他还不该知道？四类是四种处置（补货 / 等窗口 / 换地 / 先获取
//     知情），合一句「受阻」无从下手。且「默认只建议，自动采用另需明确开关预算」此前**一个都没做**：
//     只有显式改选（rechoose），没有受闸的自动采用入口。
//
// 【钉的四件事与六条否定式边界】
//   ① **四类限制各接一个真源**：资源→org.stockOf、在场/时间→world.canBeAt（拆两码）、
//      知情→noesis.knows。**不复制判定**（advance 的准入仍是唯一真源）。
//   ② **未声明就如实说未声明**：没写 need/place/know 的一项报 `declared:false`，
//      绝不臆测「他大概需要什么」（凭空编正是 N2 要治的）。
//   ③ **真源缺席就报缺席**：org/world/noesis 缺席时报 `source:'absent'`，不回落成「无限制」。
//   ④ **自动采用受双闸**：`autoAdopt`（默认关 ⇒ `auto-adopt-off`）+ 每轮预算 `adoptBudget`
//      （超预算 ⇒ `adopt-budget-exhausted`）。「自动」指**闸门自动**，不是内容自动——
//      `steps` 仍必须调用方显式给（与 rechoose 同纪律）。
//   否定式：不凭空造目标（目标不在 life.goals 就不排）· 不自动改写计划（默认只读/只建议）·
//      预算只在**内存**记账（不落盘）· 四类限制**零写侧**（只读三个引擎，不改任何状态）·
//      未声明 ≠ 阻塞（`blockedBy` 只收 `ok:false` 项）· 上界有界（adoptBudget 落在 [0,8]）。
//
// 【本锁五段】A 静态契约与面板真消费方 / B 四类限制比较 / C 自动采用双闸 /
//   D 零写入不变式与分栏计数 / N 真源码破坏 + 两向自证（H5 锚点纯度 + H6 两向）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/plan.js';
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
/** 取出 `WA.plan = { … }` 的对象字面量体。 */
function exportBody(src) {
  const at = src.indexOf('WA.plan = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); }
  }
  return '';
}
function env0(ov) { return sync.fresh(ov ? { srcOverride: ov } : {}).WA; }
/** 种一个最小可判世界：甲（银元 1 / 目标 g1 / 一条日程占住「别处」）。 */
function seed(WA, cfg) {
  WA.plan.setSettings(Object.assign({ enabled: true, maxSteps: 4, maxPlans: 12, maxTries: 3, autoAdopt: false, adoptBudget: 2 }, cfg || {}));
  WA.world.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.people = {
      'p_甲': { id: 'p_甲', name: '甲', resources: { '银元': 1 }, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '攒钱去乙地', status: 'active' }], commitments: [], schedule: [] } }
    };
    d.world = d.world || {};
    d.world.places = [{ name: '码头', kind: 'town', open: 0, close: 10000000000000 },
      { name: '别处', kind: 'town', open: 0, close: 10000000000000 }];
    d.world.roads = [];
    d.world.uses = [];
    d.plan = { plans: [] };
  }, 'n2:seed');
  return WA;
}
const S3 = [
  { kind: 'work', text: '去码头搬货', place: '码头' },
  { kind: 'work', text: '攒够路费', need: { resource: '银元', amount: 3 }, place: '码头', know: 'fact_x' },
  { kind: 'move', text: '搭船去乙地', after: '1', fallback: '改走陆路' }
];
/** 把第 1 步推成 blocked（第 0 步先完成）。 */
function toBlocked(WA) {
  WA.plan.expand('甲', 'g1', S3);
  WA.plan.advance('甲'); WA.plan.settle('甲', 'done');
  WA.plan.advance('甲'); WA.plan.settle('甲', 'blocked', { reason: '路断' });
}
function snap(WA) { return JSON.stringify(WA.store.get()); }
// ═══════════════════════ A 段：静态契约与真消费方 ═══════════════════════
function runA(a) {
  const S = rd(REL);
  const code = stripComments(S);
  const body = exportBody(S);
  a(body.length > 0, 'n2/A1: 能从真源码取出 WA.plan 的对象字面量体');
  a(body.indexOf('adopt:') > 0, 'n2/A2: 导出面含 adopt（受闸自动采用口）');
  // 两格新设置与区间（逐字）
  a(/autoAdopt: false, adoptBudget: 2 \};/.test(S), 'n2/A3: autoAdopt / adoptBudget 默认值逐字在位（默认关）');
  a(/adoptBudget: \[0, 8\] \}/.test(S), 'n2/A4: adoptBudget 区间声明逐字在位（上界有界）');
  // 四类限制口与来源
  a(/function limitsOf\(personName, step\)/.test(S), 'n2/A5: 四类限制比较口 limitsOf 在位');
  a(code.indexOf('WA.world.canBeAt(') >= 0, 'n2/A6: 在场/时间接 world.canBeAt（不复制判定）');
  a(code.indexOf('WA.noesis.knows(') >= 0, 'n2/A7: 知情接 noesis.knows');
  a(code.indexOf('stockOf(who)') >= 0, 'n2/A8: 资源接 org.stockOf（经本模块 stockOf 薄封装）');
  ['resource', 'presence', 'time', 'knowledge'].forEach(function (k) {
    a(code.indexOf("kind: '" + k + "'") >= 0, 'n2/A9: 四类之一 ' + k + ' 在码里（四类分别成码，不合并）');
  });
  a(code.indexOf("reason: 'source-absent'") >= 0, 'n2/A10: 真源缺席走 source-absent（不回落成无限制）');
  // 自动采用：双闸与预算内存
  a(/function adopt\(personName, steps, opts\)/.test(S), 'n2/A11: 自动采用口 adopt 在位');
  a(code.indexOf("reason: 'auto-adopt-off'") >= 0, 'n2/A12: 开关默认关 ⇒ auto-adopt-off');
  a(code.indexOf("reason: 'adopt-budget-exhausted'") >= 0, 'n2/A13: 超预算 ⇒ adopt-budget-exhausted');
  a(/let _adoptTurn = null, _adoptCount = 0;/.test(S), 'n2/A14: 预算只在内存记账（模块级变量，不落盘）');
  a(cnt(code, 'WA.store.transact') === 5,
    'n2/A15: 写侧只经既有 5 处 store.transact（adopt 不新增写路径，未开第二套；实 ' + cnt(code, 'WA.store.transact') + '）');
  a(cnt(code, "autoRechoose") === 0, 'n2/A16: 无「自动编步骤」的代码路径（自动指闸门自动）');
  a(code.indexOf('rechoose(personName, steps)') >= 0, 'n2/A17: adopt 复用 rechoose（不另存一份改选实现）');
  // 面板真消费方（无消费方不挂导出）
  const pan = rd(PANEL_REL);
  a(pan.indexOf('WA.plan.adopt(') >= 0, 'n2/A18: 面板真调 WA.plan.adopt()');
  ['wa-plan-limits', 'wa-plan-autoadopt', 'wa-plan-adoptbudget', 'wa-plan-adopt']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'n2/A19: 面板控件 ' + id + ' 在位'); });
  // 守卫表登记（渲染 + 绑定 + 守卫三件齐）
  a(rd('engines/tool-diag.js').indexOf("'wa-plan-limits'") >= 0, 'n2/A20: 守卫表登记新控件');
  // 版本面：自报 ver 与 index.js 同值
  const mv = (rd(IDX_REL).match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  a(new RegExp("ver: '" + mv.replace(/\./g, '\\.') + "'").test(S),
    'n2/A21: 模块自报 ver === index.js VERSION（实 ' + mv + '）');
  a(rd(RUN_REL).indexOf('|plan:') >= 0 && rd(RUN_REL).indexOf(' adopt ') >= 0,
    'n2/A22: FROZEN2800 的 plan 契约成员含 adopt');
}
// ═══════════════════════ B 段：四类限制比较 ═══════════════════════
function runB(a) {
  const WA = seed(env0());
  toBlocked(WA);
  const c = WA.plan.candidates('甲');
  a(c.ok === true && Array.isArray(c.limits) && c.limits.length === 4,
    'n2/B1: 候选带出四类限制（实 ' + j(c.ok && c.limits.length) + '）');
  const kinds = c.limits.map(function (l) { return l.kind; }).join(',');
  a(kinds === 'resource,presence,time,knowledge', 'n2/B2: 四类顺序稳定（实 ' + kinds + '）');
  // ① 资源：银元 1 < 3 ⇒ need-unmet
  const rs = c.limits.filter(function (l) { return l.kind === 'resource'; })[0];
  a(rs.declared === true && rs.ok === false && rs.reason === 'need-unmet' && rs.have === 1 && rs.want === 3,
    'n2/B3: 资源受限接 org.stockOf（实 ' + j(rs) + '）');
  // ② 在场：码头登记 ⇒ ok
  const pr = c.limits.filter(function (l) { return l.kind === 'presence'; })[0];
  a(pr.declared === true && pr.ok === true && pr.place === '码头', 'n2/B4: 在场 OK（码头存在）');
  // ③ 时间：码头开窗覆盖 ⇒ ok
  const tm = c.limits.filter(function (l) { return l.kind === 'time'; })[0];
  a(tm.declared === true && tm.ok === true, 'n2/B5: 时间 OK（窗口容得下）');
  // ④ 知情：noesis 默认关 ⇒ knows 报 disabled ⇒ knowledge 受限（真源如实报）
  const kn = c.limits.filter(function (l) { return l.kind === 'knowledge'; })[0];
  a(kn.declared === true && kn.ok === false && (kn.reason === 'disabled' || kn.reason === 'not-registered' || kn.reason === 'not-holder'),
    'n2/B6: 知情受限接 noesis.knows（实 ' + j(kn) + '）');
  // blockedBy 只收 ok:false 项（未声明 ≠ 阻塞）
  a(c.blockedBy.length === 2 && c.blockedBy.indexOf('resource:need-unmet') >= 0,
    'n2/B7: blockedBy 只收真阻塞（实 ' + j(c.blockedBy) + '）');
  // 未声明项如实报 declared:false（不猜）
  seed(WA);
  WA.store.transact(function (d) {
    d.people['p_甲'].resources = {};
  }, 'n2:nores');
  WA.plan.expand('甲', 'g1', [{ kind: 'work', text: '没声明任何限制的一步' }]);
  WA.plan.advance('甲'); WA.plan.settle('甲', 'blocked', { reason: 'x' });
  const c2 = WA.plan.candidates('甲');
  const l2 = c2.limits;
  a(l2.filter(function (l) { return l.kind === 'resource'; })[0].declared === false
    && l2.filter(function (l) { return l.kind === 'presence'; })[0].declared === false
    && l2.filter(function (l) { return l.kind === 'knowledge'; })[0].declared === false,
    'n2/B8: 未声明的一项如实报 declared:false（不臆测）');
  a(c2.blockedBy.length === 0, 'n2/B9: 全未声明 ⇒ 无阻塞项（未声明 ≠ 阻塞）');
  // 真源缺席：删掉 world ⇒ 在场/时间报 source-absent
  seed(WA);
  toBlocked(WA);
  const keepWorld = WA.world;
  try {
    WA.world = null;
    const c3 = WA.plan.candidates('甲');
    const pr3 = c3.limits.filter(function (l) { return l.kind === 'presence'; })[0];
    a(pr3.ok === false && pr3.reason === 'source-absent', 'n2/B10: world 缺席 ⇒ 在场报 source-absent（不假装无限制）');
  } finally { WA.world = keepWorld; }
  // 地点不存在 ⇒ 在场受限（unknown-place），不是时间
  seed(WA);
  WA.plan.expand('甲', 'g1', [{ kind: 'work', text: '去一个不存在的镇', place: '鬼镇' }]);
  WA.plan.advance('甲'); WA.plan.settle('甲', 'blocked', { reason: 'x' });
  const c4 = WA.plan.candidates('甲');
  const pr4 = c4.limits.filter(function (l) { return l.kind === 'presence'; })[0];
  a(pr4.ok === false && pr4.reason === 'unknown-place', 'n2/B11: 地点不存在 ⇒ 在场 unknown-place（与时间分开）');
}
// ═══════════════════════ C 段：自动采用双闸 ═══════════════════════
function runC(a) {
  const WA = seed(env0(), { autoAdopt: false, adoptBudget: 2 });
  toBlocked(WA);
  // 默认关 ⇒ 拒收且零写入
  const before = snap(WA);
  const a0 = WA.plan.adopt('甲', S3, { turn: 't1' });
  a(a0.ok === false && a0.reason === 'auto-adopt-off', 'n2/C1: 默认关 ⇒ auto-adopt-off（实 ' + j(a0.reason) + '）');
  a(snap(WA) === before, 'n2/C2: 关闸时一个字节都不写');
  // 开开关 + 预算 1
  WA.plan.setSettings({ autoAdopt: true, adoptBudget: 1 });
  const a1 = WA.plan.adopt('甲', S3, { turn: 't1' });
  a(a1.ok === true && a1.adopted === true && a1.used === 1 && a1.budget === 1,
    'n2/C3: 开闸后采用成功（本轮 1/1）（实 ' + j([a1.ok, a1.used, a1.budget]) + '）');
  // 再受阻同轮 ⇒ 预算耗尽
  WA.plan.advance('甲'); WA.plan.settle('甲', 'blocked', { reason: '又断' });
  const a2 = WA.plan.adopt('甲', S3, { turn: 't1' });
  a(a2.ok === false && a2.reason === 'adopt-budget-exhausted' && a2.used === 1,
    'n2/C4: 同轮第二次 ⇒ 预算耗尽（实 ' + j([a2.reason, a2.used]) + '）');
  // 换轮 ⇒ 预算复位
  const a3 = WA.plan.adopt('甲', S3, { turn: 't2' });
  a(a3.ok === true && a3.used === 1, 'n2/C5: 换轮 ⇒ 预算复位（实 ' + j(a3.used) + '）');
  // 总开关关 ⇒ 一律拒（自动采用也在总开关之下）
  WA.plan.setSettings({ enabled: false });
  const a4 = WA.plan.adopt('甲', S3, { turn: 't3' });
  a(a4.ok === false && a4.reason === 'disabled', 'n2/C6: 总开关关 ⇒ 拒 disabled（自动采用不绕过总开关）');
  // 采用仍必须显式给步骤（不凭空编）：空步骤 ⇒ rechoose 的拒因透传
  WA.plan.setSettings({ enabled: true, autoAdopt: true, adoptBudget: 2 });
  const a5 = WA.plan.adopt('甲', [], { turn: 't4' });
  a(a5.ok === false && a5.reason === 'missing-steps', 'n2/C7: adopt 不凭空编步骤（空步骤 ⇒ missing-steps）');
  // stat 计数
  const st = WA.plan.stat();
  a(typeof st.adopted === 'number' && st.adopted >= 2 && typeof st.adoptRefused === 'number' && st.adoptRefused >= 2,
    'n2/C8: 采用 / 拒收各自计数（实 ' + j([st.adopted, st.adoptRefused]) + '）');
}
// ═══════════════════════ D 段：零写入不变式与分栏计数 ═══════════════════════
function runD(a) {
  const WA = seed(env0());
  toBlocked(WA);
  // ① 只读口零写入：candidates 前后存档逐字节同
  const before = snap(WA);
  WA.plan.candidates('甲');
  a(snap(WA) === before, 'n2/D1: candidates 零写入（四类限制只读三个引擎）');
  // ② 关闸的 adopt 零写入
  WA.plan.setSettings({ autoAdopt: false });
  const b2 = snap(WA);
  WA.plan.adopt('甲', S3, { turn: 'q' });
  a(snap(WA) === b2, 'n2/D2: 关闸 adopt 零写入');
  // ③ 预算不落盘：开闸采用后存档里没有预算键
  WA.plan.setSettings({ autoAdopt: true, adoptBudget: 2 });
  WA.plan.adopt('甲', S3, { turn: 'q' });
  const dump = JSON.stringify(WA.store.get());
  a(dump.indexOf('_adoptTurn') < 0 && dump.indexOf('adoptBudget') < 0,
    'n2/D3: 预算 / 轮次**不落盘**（只在内存记账）');
  // ④ 设置只经 settingsBus 单一真源
  a(WA.store.get()['worldaxis_plan_settings_v1'] === undefined,
    'n2/D4: 两格新设置**不落 store**（走 settingsBus 键）');
  // ⑤ 越界夹回
  WA.plan.setSettings({ adoptBudget: 999 });
  a(WA.plan.getSettings().adoptBudget === 8, 'n2/D5: adoptBudget 越界夹回 8');
  WA.plan.setSettings({ adoptBudget: -3 });
  a(WA.plan.getSettings().adoptBudget === 0, 'n2/D6: adoptBudget 下界夹回 0');
  WA.plan.setSettings({ adoptBudget: 2 });
  // ⑥ 不凭空造目标：目标不在 life.goals ⇒ expand 拒（N2 边界仍守）
  const e = WA.plan.expand('甲', '查无此目标', S3);
  a(e.ok === false && e.reason === 'unknown-goal', 'n2/D7: 不凭空造目标（unknown-goal）');
}
// ═══════════════════════ N 段：真源码破坏 + 两向自证 ═══════════════════════
/** 负控制锚点表（H5：本表内每处锚点字面量只声明一次；判据层不引用这些串）。 */
const ANCHOR = {
  srcAbsent: "    if (!s.need) out.push({ kind: 'resource', declared: false, ok: true, note: '未声明资源需求' });",
  adoptOff: "    if (!cfg.autoAdopt) { stat.adoptRefused++; stat.lastReason = 'auto-adopt-off'; return { ok: false, reason: 'auto-adopt-off' }; }",
  budget: "    if (_adoptCount >= cfg.adoptBudget) {",
  knowParse: "      know: s.know || '', place: s.place || '',"
};
function broke(key) {
  const s = rd(REL);
  const an = ANCHOR[key];
  const n = cnt(s, an);
  if (n !== 1) throw new Error('破坏锚点【' + key + '】命中 ' + n + ' 次（期望恰好 1）—— 锚点必须是一处唯一的真源码文本');
  let out = null;
  if (key === 'srcAbsent') out = s.replace(an, "    if (!s.need) out.push({ kind: 'resource', declared: true, ok: true, note: '未声明资源需求' });");
  if (key === 'adoptOff') out = s.replace(an, "    if (false) { stat.adoptRefused++; stat.lastReason = 'auto-adopt-off'; return { ok: false, reason: 'auto-adopt-off' }; }");
  if (key === 'budget') out = s.replace(an, "    if (false) {");
  if (key === 'knowParse') out = s.replace(an, "      know: '', place: s.place || '',");
  if (out === null || out === s) throw new Error('破坏【' + key + '】没有改变源码文本');
  return out;
}
function runN(a) {
  const SRC = rd(REL);
  // ① 未声明项不再如实报 ⇒ 「未声明」被静默吞掉（四类之一失守）
  {
    const src = broke('srcAbsent');
    a(src !== SRC, 'n2/N1: [破坏1] 未声明资源项被改成恒假（源码文本变了）');
    const W = seed(env0({ [REL]: src }));
    W.plan.expand('甲', 'g1', [{ kind: 'work', text: '没声明限制' }]);
    W.plan.advance('甲'); W.plan.settle('甲', 'blocked', { reason: 'x' });
    const c = W.plan.candidates('甲');
    const rs = c.limits.filter(function (l) { return l.kind === 'resource'; })[0];
    a(!(rs && rs.declared === false && rs.ok === true),
      'n2/N1b: [破坏1] 副本上未声明项不再如实报（实 ' + j(rs) + '）—— 原版那条判据真在起作用');
  }
  // ② 开关默认闸被拆 ⇒ 关闸也能采用（默认只建议这条失守）
  {
    const src = broke('adoptOff');
    a(src !== SRC, 'n2/N2: [破坏2] 开关闸被改成恒假（源码文本变了）');
    const W = seed(env0({ [REL]: src }), { autoAdopt: false, adoptBudget: 2 });
    toBlocked(W);
    const r = W.plan.adopt('甲', S3, { turn: 'z1' });
    a(r.reason !== 'auto-adopt-off',
      'n2/N2b: [破坏2] 副本上关闸也放行（实 ' + j(r.reason) + '）—— 原版能拦住，判据不是空转');
  }
  // ③ 预算闸被拆 ⇒ 同轮无限采用（预算失守）
  {
    const src = broke('budget');
    a(src !== SRC, 'n2/N3: [破坏3] 预算闸被改成恒假（源码文本变了）');
    const W = seed(env0({ [REL]: src }), { autoAdopt: true, adoptBudget: 1 });
    toBlocked(W);
    W.plan.adopt('甲', S3, { turn: 'z2' });
    W.plan.advance('甲'); W.plan.settle('甲', 'blocked', { reason: 'x' });
    const r = W.plan.adopt('甲', S3, { turn: 'z2' });
    a(r.reason !== 'adopt-budget-exhausted',
      'n2/N3b: [破坏3] 副本上同轮超预算仍放行（实 ' + j(r.reason) + '）—— 原版能拦住');
  }
  // ④ 知情人解析被抹 ⇒ 声明了知情依赖也读不出来（第 4 类失守）
  {
    const src = broke('knowParse');
    a(src !== SRC, 'n2/N4: [破坏4] 知情人解析被抹掉（源码文本变了）');
    const W = seed(env0({ [REL]: src }));
    toBlocked(W);
    const v = W.plan.view('甲');
    const s1 = v.steps.filter(function (s) { return s.seq === 1; })[0];
    a(s1 && s1.know !== 'fact_x',
      'n2/N4b: [破坏4] 副本上 view 读不到声明的知情依赖（实 ' + j(s1 && s1.know) + '）—— 原版逐字带出');
  }
  // 纯度：原版上同款判据必须真（H6 第二向）
  const W0 = seed(env0());
  toBlocked(W0);
  const c0 = W0.plan.candidates('甲');
  a(c0.limits.filter(function (l) { return l.kind === 'resource'; })[0].reason === 'need-unmet',
    'n2/Nb1: （纯度）原版上资源不足 ⇒ need-unmet');
  const t0 = seed(env0(), { autoAdopt: false });
  toBlocked(t0);
  a(t0.plan.adopt('甲', S3, { turn: 'p1' }).reason === 'auto-adopt-off',
    'n2/Nb2: （纯度）原版上关闸 ⇒ auto-adopt-off');
  const b0 = seed(env0(), { autoAdopt: true, adoptBudget: 1 });
  toBlocked(b0);
  b0.plan.adopt('甲', S3, { turn: 'p2' });
  b0.plan.advance('甲'); b0.plan.settle('甲', 'blocked', { reason: 'x' });
  a(b0.plan.adopt('甲', S3, { turn: 'p2' }).reason === 'adopt-budget-exhausted',
    'n2/Nb3: （纯度）原版上同轮超预算 ⇒ adopt-budget-exhausted');
  const k0 = seed(env0());
  toBlocked(k0);
  a(k0.plan.view('甲').steps.filter(function (s) { return s.seq === 1; })[0].know === 'fact_x',
    'n2/Nb4: （纯度）原版上 view 逐字带出声明的知情依赖');
  a(SRC.length > 20000, 'n2/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
  a(cnt(rd(REL), ANCHOR.srcAbsent) === 1 && cnt(rd(REL), ANCHOR.adoptOff) === 1
    && cnt(rd(REL), ANCHOR.budget) === 1 && cnt(rd(REL), ANCHOR.knowParse) === 1,
    'n2/Nd: 负控制全程未改真源码（四处锚点在收尾复核时仍各在原位恰 1 次）');
}
function mkA(report) { return function (ok, name) { report.total++; if (ok) report.pass++; else { report.fail++; console.log('FAIL ' + name); } }; }
function main() {
  const report = { total: 0, pass: 0, fail: 0 };
  const a = mkA(report);
  runA(a); runB(a); runC(a); runD(a); runN(a);
  console.log('N2 s3-b3-n2-v2220 ' + report.pass + ' / 失败 ' + report.fail);
  process.exit(report.fail ? 1 : 0);
}
if (require.main === module) main();
module.exports = { runA: runA, runB: runB, runC: runC, runD: runD, runN: runN, REL: REL, ANCHOR: ANCHOR };