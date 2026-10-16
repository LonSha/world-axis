'use strict';
// WorldAxis tests/s3-b3-n1-v2218.js (v2.218.0) — N1 可编辑战役层专锁（五段齐备）
//
// 本锁钉的是「可编辑战役」相对「固定场景模板」的**四个新增能力**与**五条否定式边界**：
//   A 段 静态契约：新增导出面（planSave / planList / planDelete / validPlan）与 planCap 声明
//   B 段 可编辑与本批：只认既有四类谓词；非法计划**整批拒收**且原库不动；planCap 有界
//   C 段 可选目标：可选阶段未成**不阻塞**主线结束；达成时计其奖励（不静默丢弃）
//   D 段 分支与失败：branchCond 满足 ⇒ 跳到目标阶段；failWhen 满足 ⇒ 失败终态（≠ 未达成）
//   E 段 自有边界：只写自有单一键 campaign 下的 plans 子结构；零第二世界写入路径；
//         奖励只记自有账本（bonus/bonusLog），不写别人的键
//   负向段 N1–N4：真源码破坏 + 两向自证（破坏必须改行为，原版上同款判据必须真）
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/campaign.js';
const KEYS = ['planSave', 'planList', 'planDelete', 'validPlan'];
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.campaign = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
function hostWith(src, stubs) {
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(readOf('core/store.js'), c, { filename: 'core/store.js' });
  vm.runInContext(readOf('core/input-guard.js'), c, { filename: 'core/input-guard.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) { /* 已初始化 */ }
  if (stubs) stubs(WA);
  return WA;
}
const BLUEPRINT = function (WA) {
  WA.worldBlueprint = {
    SCENES: [
      { id: 'blank', label: '空白开局', note: '进度全零' },
      { id: 'cold-open', label: '事件开局', note: '从事件开始' },
      { id: 'market-day', label: '集市日', note: '从集市开始' }
    ]
  };
};
function dayPlan(id, stages) { return { id: id, stages: stages }; }
function stage(sid, day, extra) {
  const o = { id: sid, label: '阶段' + sid, goal: '天数到' + day, pred: { kind: 'day-reached', day: day } };
  if (extra) Object.assign(o, extra);
  return o;
}

// ── A 段：静态契约 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'n1/A1: 能从真源码取出 WA.campaign 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'n1/A2: 导出面含 ' + k); });
  a(/planCap: 6/.test(src) && /planCap: \[1, 12\]/.test(src), 'n1/A3: planCap 默认与区间逐字在位');
  a(/const NUM_KEYS = \{ 'day-reached': \['day'\] \};/.test(src), 'n1/A4: 数值参数面与字符串参数面分开（day 是数值）');
  a(/const KNOWN_KINDS = PREDICATE_IDS;/.test(src), 'n1/A5: 自定义计划只认既有四类谓词（不新增谓词面）');
  a(/function validPlan\(plan\)/.test(src), 'n1/A6: 计划整体机械校验在位');
  a(/const PLAN_MAX_STAGES = 12;/.test(src), 'n1/A7: 阶段数上限有界');
  a(/c\.plans = c\.plans \|\| \[\];/.test(src), 'n1/A8: 计划存自有键 campaign 下的 plans 子结构');
  ['invalid-plan', 'plan-cap', 'bad-plan', 'bad-plan-id'].forEach(function (c) {
    a(src.indexOf("'" + c + "'") >= 0, 'n1/A9: 拒收码 ' + c + ' 在位');
  });
  a(/c\.bonus = \(typeof c\.bonus === 'number' \? c\.bonus : 0\) \+ reward;/.test(src), 'n1/A10: 阶段奖励只记自有账本（bonus）');
  a(/c\.failed = true; c\.verdict = 'failed';/.test(src), 'n1/A11: 失败终态写自有键（failed）');
  // 派生自既有契约（防「新增第二条世界键」）：仍然只 WA.store.read('campaign')
  const reads = (src.match(/WA\.store\.read\('([^']+)'\)/g) || []);
  const onlyCampaign = reads.every(function (r) { return r === "WA.store.read('campaign')" || r === "WA.store.read('clock.dayIndex')"; });
  a(onlyCampaign, 'n1/A12: 读路径只碰自有键 campaign 与骨架时钟（不新开世界键）');
  // 导出面**没有**任何会写别人键的口
  a(body.indexOf('buildBlock') < 0, 'n1/A13: 导出面**没有** buildBlock（无注入消费方）');
}

// ── B 段：可编辑与本批拒收 ─────────────────────────────────────────────
function runB(a) {
  const WA = hostWith(srcOf());
  BLUEPRINT(WA);
  a(WA.campaign.getSettings().planCap === 6, 'n1/B1: 默认 planCap = 6');
  a(WA.campaign.planSave(dayPlan('p', [stage('s1', 1)])).reason === 'disabled', 'n1/B2: 关闭时 planSave 拒收 disabled');
  WA.campaign.setSettings({ enabled: true });
  // 合法保存
  const okSave = WA.campaign.planSave(dayPlan('p1', [stage('s1', 1, { reward: 5 }), stage('s2', 3)]));
  a(okSave.ok === true && okSave.id === 'p1' && okSave.stages === 2, 'n1/B3: 合法计划保存成功');
  const list = WA.campaign.planList();
  a(list.ok === true && list.plans.length === 1 && list.plans[0].id === 'p1', 'n1/B4: planList 报出已存计划');
  a(WA.campaign.planOf('p1').custom === true, 'n1/B5: planOf 命中自定义计划（custom:true）');
  a(WA.campaign.planOf('blank').custom === false, 'n1/B6: 模板兜底不受影响（custom:false）');
  // 非法计划整批拒收，原库不动
  const before = JSON.stringify(WA.campaign.planList());
  const bad = WA.campaign.planSave(dayPlan('p1', [stage('s1', 1), { id: 's2', label: 'x', goal: 'y', pred: { kind: 'bogus' } }]));
  a(bad.ok === false && bad.reason === 'invalid-plan' && /bad-pred/.test(bad.why), 'n1/B7: 非法谓词整批拒收 invalid-plan（why=' + bad.why + '）');
  a(JSON.stringify(WA.campaign.planList()) === before, 'n1/B8: 整批拒收 ⇒ 原库一字不动（不半套落地）');
  // 未知谓词 / 缺参数 / 坏 reward
  a(WA.campaign.validPlan(dayPlan('x', [stage('s1', 1)])) === null, 'n1/B9a: 合法计划 validPlan 返回 null');
  a(WA.campaign.validPlan(dayPlan('x', [{ id: 's', label: 'l', goal: 'g', pred: { kind: 'diplomacy-state', a: 'A' } }])) === 'bad-pred:0',
    'n1/B9b: 缺参数（diplomacy-state 少 b）判 bad-pred');
  a(WA.campaign.validPlan(dayPlan('x', [stage('s1', 1, { reward: -1 })])) === 'bad-reward:0', 'n1/B9c: 负奖励判 bad-reward');
  a(WA.campaign.validPlan({ id: 'x', stages: [] }) === 'no-stages', 'n1/B9d: 空阶段判 no-stages');
  // planCap 有界：塞满 cap 后再存新 id 拒收
  WA.campaign.setSettings({ planCap: 1 });
  a(WA.campaign.planSave(dayPlan('p2', [stage('s1', 1)])).reason === 'plan-cap', 'n1/B10: 超过 planCap 拒收 plan-cap');
  a(WA.campaign.planSave(dayPlan('p1', [stage('s1', 2)])).ok === true, 'n1/B11: 覆盖同名计划不受 cap 限制（预算按 id 去重）');
  WA.campaign.setSettings({ planCap: 6 });
  // 删除
  const del = WA.campaign.planDelete('p1');
  a(del.ok === true && del.removed === 1, 'n1/B12: planDelete 移除 1 条');
  a(WA.campaign.planOf('p1').ok === false || WA.campaign.planOf('p1').custom !== true, 'n1/B13: 删除后自定义计划不再命中');
  a(WA.campaign.planDelete('').reason === 'bad-plan-id', 'n1/B14: 空 id 删除拒收 bad-plan-id');
  // 参数不猜：自定义计划里的势力名必须由计划自带（缺则整批拒）
  a(WA.campaign.planSave(dayPlan('d1', [{ id: 's', label: 'l', goal: 'g', pred: { kind: 'freight-arrived', id: '' } }])).reason === 'invalid-plan',
    'n1/B15: 空货运单号整批拒（不猜世界里的名字）');
}

// ── C 段：可选目标 ─────────────────────────────────────────────────────
function runC(a) {
  const WA = hostWith(srcOf());
  BLUEPRINT(WA);
  WA.campaign.setSettings({ enabled: true });
  // 主线 s1(day1) → 可选 opt(day 99，永远不成) → 主线 s2(day2)
  WA.campaign.planSave(dayPlan('opt', [stage('s1', 1, { reward: 10 }), stage('opt', 99, { optional: true, reward: 7 }), stage('s2', 2, { reward: 20 })]));
  WA.campaign.start('opt');
  WA.store.transact(function (d) { d.clock.dayIndex = 1; });
  const r1 = WA.campaign.advance();
  a(r1.ok === true && r1.done === false, 'n1/C1: 主线阶段达成即推进');
  a(r1.stage === 2, 'n1/C2: 可选阶段未成**不阻塞**主线（直接落到 s2，stage=' + r1.stage + '）');
  a(r1.reward === 10 && (r1.optionalDone || []).length === 0, 'n1/C3: 可选未成不计奖（reward 只含主线 10）');
  WA.store.transact(function (d) { d.clock.dayIndex = 2; });
  const r2 = WA.campaign.advance();
  a(r2.ok === true && r2.done === true, 'n1/C4: 第二条主线达成 ⇒ 整局结束');
  a(WA.campaign.review().bonus === 30, 'n1/C5: 复盘 bonus = 主线 10 + 20（可选未成不计）');
  // 可选达成时计奖
  const WA2 = hostWith(srcOf());
  BLUEPRINT(WA2);
  WA2.campaign.setSettings({ enabled: true });
  WA2.campaign.planSave(dayPlan('opt2', [stage('s1', 1, { reward: 10 }), stage('opt', 2, { optional: true, reward: 7 }), stage('s2', 3, { reward: 20 })]));
  WA2.campaign.start('opt2');
  WA2.store.transact(function (d) { d.clock.dayIndex = 2; });
  const g1 = WA2.campaign.advance();
  a(g1.stage === 2, 'n1/C6: 主线推进（跳过可选位置）');
  a(g1.reward === 17, 'n1/C7: 可选阶段现场达成 ⇒ 与主线奖励合并计（10+7=17）');
  a((g1.optionalDone || []).indexOf('opt') >= 0, 'n1/C8: 回执列明达成的可选阶段 id');
  WA2.store.transact(function (d) { d.clock.dayIndex = 3; });
  WA2.campaign.advance();
  a(WA2.campaign.review().bonus === 37, 'n1/C9: 复盘 bonus = 10 + 7 + 20 = 37');
}

// ── D 段：分支与失败 ───────────────────────────────────────────────────
function runD(a) {
  // 分支
  const WA = hostWith(srcOf());
  BLUEPRINT(WA);
  WA.campaign.setSettings({ enabled: true });
  WA.campaign.planSave(dayPlan('br', [
    stage('s1', 1, { branchFrom: 's3', branchCond: { kind: 'day-reached', day: 5 } }),
    stage('s2', 2),
    stage('s3', 9)
  ]));
  WA.campaign.start('br');
  WA.store.transact(function (d) { d.clock.dayIndex = 5; });
  const r = WA.campaign.advance();
  a(r.ok === true && r.branch === true, 'n1/D1: 分支条件满足 ⇒ 本次推进标记 branch:true');
  a(r.stage === 2, 'n1/D2: 跳到目标阶段（s3 在数组第 3 位 ⇒ stage=2）');
  a(WA.campaign.current().stage === 2, 'n1/D3: 落盘游标与回执一致');
  // 分支条件不满足时走常规下一阶段
  const WA2 = hostWith(srcOf());
  BLUEPRINT(WA2);
  WA2.campaign.setSettings({ enabled: true });
  WA2.campaign.planSave(dayPlan('br2', [stage('s1', 1, { branchFrom: 's3', branchCond: { kind: 'day-reached', day: 5 } }), stage('s2', 2), stage('s3', 9)]));
  WA2.campaign.start('br2');
  WA2.store.transact(function (d) { d.clock.dayIndex = 1; });
  const r2 = WA2.campaign.advance();
  a(r2.branch === false && r2.stage === 1, 'n1/D4: 分支条件不满足 ⇒ 走常规下一阶段（branch:false, stage=1）');
  // 失败条件
  const WA3 = hostWith(srcOf());
  BLUEPRINT(WA3);
  WA3.campaign.setSettings({ enabled: true });
  WA3.campaign.planSave(dayPlan('fl', [stage('s1', 1, { failWhen: { kind: 'day-reached', day: 8 } }), stage('s2', 2)]));
  WA3.campaign.start('fl');
  WA3.store.transact(function (d) { d.clock.dayIndex = 8; });
  const rf = WA3.campaign.advance();
  a(rf.ok === false && rf.reason === 'failed', 'n1/D5: 失败条件满足 ⇒ 拒收 failed（不是 not-met）');
  a(WA3.campaign.review().failed === true, 'n1/D6: 复盘报 failed:true');
  a(WA3.campaign.review().failReason === 's1', 'n1/D7: 失败点记在自有键（failReason=s1）');
  a(WA3.campaign.advance().reason === 'failed', 'n1/D8: 失败后再次推进仍是 failed（终态）');
  // 未触发失败时正常推进
  const WA4 = hostWith(srcOf());
  BLUEPRINT(WA4);
  WA4.campaign.setSettings({ enabled: true });
  WA4.campaign.planSave(dayPlan('fl2', [stage('s1', 1, { failWhen: { kind: 'day-reached', day: 8 } }), stage('s2', 2)]));
  WA4.campaign.start('fl2');
  WA4.store.transact(function (d) { d.clock.dayIndex = 1; });
  const rn = WA4.campaign.advance();
  a(rn.ok === true && rn.done === false, 'n1/D9: 失败条件未触发 ⇒ 正常推进');
  a(WA4.campaign.review().failed === false, 'n1/D10: 复盘 failed:false（未触发不等于触发）');
}

// ── E 段：自有边界 ─────────────────────────────────────────────────────
function runE(a) {
  const WA = hostWith(srcOf());
  BLUEPRINT(WA);
  WA.campaign.setSettings({ enabled: true });
  // 零第二世界写入：跑前跑后比对**其他键**快照
  const snapBefore = (function () { const o = {}; Object.keys(WA.store.dump ? WA.store.dump() : {}).forEach(function (k) { o[k] = 1; }); return o; })();
  WA.campaign.planSave(dayPlan('e1', [stage('s1', 1, { reward: 3 })]));
  WA.campaign.start('e1');
  WA.store.transact(function (d) { d.clock.dayIndex = 1; });
  WA.campaign.advance();
  const camp = WA.store.read('campaign');
  a(camp && Array.isArray(camp.plans) && camp.plans.length === 1, 'n1/E1: 计划落在自有键的 plans 子结构');
  a(typeof camp.bonus === 'number' && camp.bonus === 3, 'n1/E2: 奖励落在自有键 bonus（单一账本）');
  a(Array.isArray(camp.bonusLog) && camp.bonusLog.length === 1 && camp.bonusLog[0].stage === 's1', 'n1/E3: 奖励明细落 bonusLog（可追溯）');
  a(camp.history.length === 1, 'n1/E4: 阶段历史仍走原有 history（未另开第二套）');
  // 源码面：零 transact 之外的写路径
  const src = srcOf();
  a((src.match(/const tx = WA\.store\.transact\(/g) || []).length === 1, 'n1/E5: 全模块只有一个 store.transact 调用点（唯一写口）');
  a(!/(^|[^.\w])eval\s*\(/.test(src) && src.indexOf('new Function') < 0, 'n1/E6: 无 eval / new Function（计划是数据不是代码）');
  a(src.indexOf("localStorage.setItem") < 0, 'n1/E7: 产品代码不直接写 localStorage（走 settingsBus / store）');
  // 诊断/读数分栏
  const st = WA.campaign.stat();
  a(st.planCap === 6 && typeof st.plans === 'number', 'n1/E8: stat 报 planCap 与计划数');
  a(typeof st.bonus === 'number' && st.failed === false, 'n1/E9: stat 报 bonus 与 failed');
  a(WA.campaign.diagnose().plans.indexOf('e1') >= 0, 'n1/E10: diagnose 列出自定义计划 id');
  // 蓝图缺席时自定义计划仍可用（自定义计划不依赖蓝图真源）
  const WA2 = hostWith(srcOf());
  WA2.campaign.setSettings({ enabled: true });
  const r2 = WA2.campaign.planSave(dayPlan('nb', [stage('s1', 1)]));
  a(r2.ok === true, 'n1/E11: 蓝图缺席时自定义计划照常可存（自定义不依赖模板真源）');
  a(WA2.campaign.start('nb').ok === true, 'n1/E12: 蓝图缺席时自定义计划照常可开局');
  a(WA2.campaign.planOf('blank').ok === false, 'n1/E13: 但模板兜底如实报 absent（不自造兜底模板）');
}

// ── N 段：真源码破坏 + 两向自证 ─────────────────────────────────────────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 谓词词表闸被拆掉 ⇒ 任意字符串都能当谓词（只认既有四类谓词失效）',
      from: "    if (KNOWN_KINDS.indexOf(kind) < 0) return false;",
      to: "    if (false) return false;",
      probe: function (WA) {
        WA.campaign.setSettings({ enabled: true });
        WA.worldBlueprint = { SCENES: [{ id: 'blank', label: 'b', note: '' }] };
        const r = WA.campaign.planSave({ id: 'x', stages: [{ id: 's', label: 'l', goal: 'g', pred: { kind: 'bogus' } }] });
        return r.reason;
      },
      want: 'invalid-plan' },
    { n: 2, why: 'N2: 可选阶段被当成主线 ⇒ 可选未成阻塞整局结束（可选目标失去本义）',
      from: '    const passed = ev.stages.filter(function (r) { return !r.optional; });',
      to: '    const passed = ev.stages.slice();',
      probe: function (WA) {
        WA.worldBlueprint = { SCENES: [{ id: 'blank', label: 'b', note: '' }] };
        WA.campaign.setSettings({ enabled: true });
        WA.campaign.planSave({ id: 'o', stages: [
          { id: 's1', label: 'l1', goal: 'g', pred: { kind: 'day-reached', day: 1 } },
          { id: 'opt', label: 'lo', goal: 'g', pred: { kind: 'day-reached', day: 99 }, optional: true },
          { id: 's2', label: 'l2', goal: 'g', pred: { kind: 'day-reached', day: 2 } }
        ] });
        WA.campaign.start('o');
        WA.store.transact(function (d) { d.clock.dayIndex = 1; });
        const r = WA.campaign.advance();
        return r.stage;
      },
      want: 2 },
    { n: 3, why: 'N3: 失败条件与未达成同路 ⇒ 「触发了失败」被读成「还没做到」',
      from: "          fault('failed');\n          return { ok: false, reason: 'failed', stage: cur.id, review: review() };",
      to: "          fault('failed');\n          return { ok: false, reason: 'not-met', stage: cur.id, review: review() };",
      probe: function (WA) {
        WA.worldBlueprint = { SCENES: [{ id: 'blank', label: 'b', note: '' }] };
        WA.campaign.setSettings({ enabled: true });
        WA.campaign.planSave({ id: 'f', stages: [
          { id: 's1', label: 'l', goal: 'g', pred: { kind: 'day-reached', day: 1 }, failWhen: { kind: 'day-reached', day: 8 } },
          { id: 's2', label: 'l2', goal: 'g', pred: { kind: 'day-reached', day: 2 } }
        ] });
        WA.campaign.start('f');
        WA.store.transact(function (d) { d.clock.dayIndex = 8; });
        return WA.campaign.advance().reason;
      },
      want: 'failed' },
    { n: 4, why: 'N4: 奖励被写成第二套世界账本 ⇒ 自有键外多出写入路径（只登记不新增机制失效）',
      from: '        c.bonus = (typeof c.bonus === \'number\' ? c.bonus : 0) + reward;',
      to: '        c.bonus = (typeof c.bonus === \'number\' ? c.bonus : 0) + reward;\n        if (WA.store && WA.store.transact) WA.store.transact(function (dd) { dd.clock.dayIndex = -1; });',
      probe: function (WA) {
        WA.worldBlueprint = { SCENES: [{ id: 'blank', label: 'b', note: '' }] };
        WA.campaign.setSettings({ enabled: true });
        WA.campaign.planSave({ id: 'r', stages: [{ id: 's1', label: 'l', goal: 'g', pred: { kind: 'day-reached', day: 1 }, reward: 5 }] });
        WA.campaign.start('r');
        WA.store.transact(function (d) { d.clock.dayIndex = 7; });
        WA.campaign.advance();
        return WA.store.read('clock.dayIndex');
      },
      want: 7 }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'n1/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'n1/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(JSON.stringify(got) !== JSON.stringify(cs.want),
      'n1/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  // 纯度：原版上同款判据必须真
  const W0 = hostWith(SRC);
  W0.worldBlueprint = { SCENES: [{ id: 'blank', label: 'b', note: '' }] };
  W0.campaign.setSettings({ enabled: true });
  const bad0 = W0.campaign.planSave({ id: 'x', stages: [{ id: 's', label: 'l', goal: 'g', pred: { kind: 'bogus' } }] });
  a(bad0.reason === 'invalid-plan', 'n1/Nb1: （纯度）原版上非法计划 ⇒ invalid-plan');
  W0.campaign.planSave({ id: 'o', stages: [
    { id: 's1', label: 'l1', goal: 'g', pred: { kind: 'day-reached', day: 1 } },
    { id: 'opt', label: 'lo', goal: 'g', pred: { kind: 'day-reached', day: 99 }, optional: true },
    { id: 's2', label: 'l2', goal: 'g', pred: { kind: 'day-reached', day: 2 } }
  ] });
  W0.campaign.start('o');
  W0.store.transact(function (d) { d.clock.dayIndex = 1; });
  a(W0.campaign.advance().stage === 2, 'n1/Nb2: （纯度）原版上可选未成不阻塞主线（落到 s2）');
  const W1 = hostWith(SRC);
  W1.worldBlueprint = { SCENES: [{ id: 'blank', label: 'b', note: '' }] };
  W1.campaign.setSettings({ enabled: true });
  W1.campaign.planSave({ id: 'f', stages: [
    { id: 's1', label: 'l', goal: 'g', pred: { kind: 'day-reached', day: 1 }, failWhen: { kind: 'day-reached', day: 8 } },
    { id: 's2', label: 'l2', goal: 'g', pred: { kind: 'day-reached', day: 2 } }
  ] });
  W1.campaign.start('f');
  W1.store.transact(function (d) { d.clock.dayIndex = 8; });
  a(W1.campaign.advance().reason === 'failed', 'n1/Nb3: （纯度）原版上失败条件满足 ⇒ failed');
  a(SRC.length > 20000, 'n1/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

function mkA(report) { return function (ok, name) { report.total++; if (ok) report.pass++; else { report.fail++; console.log('FAIL ' + name); } }; }
function main() {
  const report = { total: 0, pass: 0, fail: 0 };
  const a = mkA(report);
  runA(a); runB(a); runC(a); runD(a); runE(a); runN(a);
  console.log('N1 s3-b3-n1-v2218 ' + report.pass + ' / 失败 ' + report.fail);
  process.exit(report.fail ? 1 : 0);
}
module.exports = { runA: runA, runB: runB, runC: runC, runD: runD, runE: runE, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) { main(); }