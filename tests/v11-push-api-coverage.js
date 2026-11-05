#!/usr/bin/env node
// push-api 覆盖缺口锁（V11 EXV11-7 未完成项的诚实冻结）。
// 事实：登记表 21 条已裁决；运行时扫描到 81 个推进类 API；60 条未裁决。
// 计划要求「49 条全部在表内、表与源码双向一致」——当前未达成，本锁把这个缺口钉成
// 可复算的冻结基线：任何新增未裁决项立刻判红，任何已裁决项消失也判红。
'use strict';
const gate = require('./ui-gate-sync.js');
const PRE = /^(tick|advance|sweep|due|settle|step|idle|drive|flush|reap|expire|pulse|turn|cycle|roll|rotate|refresh|progress|run)$/i;
const BASELINE = ('auditLog.flush,sandbox.run,workflow.run,commit.flush,commit.settle,commit.step,evolution.tick,' +
  'regional.roll,regional.tick,parallelWorld.advance,directEvent.advance,training.progress,production.advance,' +
  'survey.advance,research.advance,genTiming.tick,oneShotMod.advance,oracle.advance,life.tick,longline.sweep,' +
  'causal.tick,causal.due,causal.settle,world.tick,fondness.advance,eraCycle.tick,quota.tick,spotlight.idle,' +
  'marginal.tick,tolerance.tick,events.due,act.advance,collab.settle,opportunity.sweep,rehearsal.run,plan.advance,' +
  'plan.settle,mend.step,economy.tick,inst.settle,rhythmLoop.step,motif.tick,beatMask.advance,beatMask.due,' +
  'lifeline.advance,sediment.settle,injectValue.settle,offlineTick.tick,ecoAudit.sweep,diplomacy.expire,' +
  'commission.advance,commission.settle,operations.settle,campaign.advance,worldLab.run,worldLab.advance,' +
  'elsewhere.sweep,storylineAdvance.tick,worldChanges.settle,intake.run').split(',');
function scan(WA) {
  const found = [];
  Object.keys(WA).forEach(function (ns) {
    const o = WA[ns];
    if (!o || typeof o !== 'object') return;
    Object.keys(o).forEach(function (m) { if (PRE.test(m) && typeof o[m] === 'function') found.push(ns + '.' + m); });
  });
  return found.sort();
}
function runAll(a) {
  const W = gate.fresh().WA;
  const found = scan(W);
  const reg = W.pushApiRegistry.ENTRIES.map(function (e) { return e.api; });
  const miss = found.filter(function (k) { return reg.indexOf(k) < 0; });
  a(reg.every(function (k) { return found.indexOf(k) >= 0; }),
    'coverage C1: 登记项全部在运行时存在（幽灵 ' + reg.filter(function (k) { return found.indexOf(k) < 0; }).length + ' 条）');
  a(miss.length === BASELINE.length, 'coverage C2: 未裁决条数等于冻结基线（实 ' + miss.length + ' / 基线 ' + BASELINE.length + '）');
  const added = miss.filter(function (k) { return BASELINE.indexOf(k) < 0; });
  const gone = BASELINE.filter(function (k) { return miss.indexOf(k) < 0; });
  a(added.length === 0, 'coverage C3: 无新增未裁决项（新增 ' + added.length + ' 条：' + added.slice(0, 6).join(',') + '）');
  a(gone.length === 0, 'coverage C4: 基线项未悄悄消失（消失 ' + gone.length + ' 条：' + gone.slice(0, 6).join(',') + '）');
  a(reg.length === W.pushApiRegistry.stat().total, 'coverage C5: stat.total 与 ENTRIES 同源（' + reg.length + '）');
}
function runNegative(a) {
  // 拆掉一条登记项 ⇒ C2 应现形（被摘的那条重新变成「未裁决」）
  const W = gate.fresh().WA;
  const found = scan(W);
  const dropOne = W.pushApiRegistry.ENTRIES[0].api;
  const regWithout = W.pushApiRegistry.ENTRIES.slice(1).map(function (e) { return e.api; });
  const miss = found.filter(function (k) { return regWithout.indexOf(k) < 0; });
  a(miss.length === BASELINE.length + 1 && miss.indexOf(dropOne) >= 0,
    'coverage N1: 摘掉一条裁决（' + dropOne + '）⇒ 未裁决条数上涨到 ' + miss.length + '（基线 ' + BASELINE.length + ' + 1）');
  // 反向：往基线里塞一条假项 ⇒ C3 必须能看见（否则「无新增」是恒真句）
  const fakeMiss = miss.concat(['fake.api']);
  a(fakeMiss.filter(function (k) { return BASELINE.indexOf(k) < 0; }).length === 2,
    'coverage N2: 塞入未裁决假项 ⇒ C3 判据能看见（新增计数上涨）');
}
module.exports = { runAll, runNegative, scan: scan, BASELINE: BASELINE };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + msg); };
  runAll(a); runNegative(a);
  console.log('v11-push-api-coverage: ' + pass + ' pass / ' + fail + ' fail');
  process.exitCode = fail ? 1 : 0;
}