/**
 * tools/v7probes/p_yield_baseline.js —— OPV7-9 产出回归基线探针
 *
 * 核心机制（防衰退门锁）：
 *   把空世界、真实开局播种、推演分发三个阶段的非空 buildBlock 产出数建立为动态基线。
 *   契约：允许向上漂移（机制增加、内容丰富），禁止向下衰退（出现空转或漏产出）。
 *   实测下界：
 *     - 空世界未开局未推演：emptyYield >= 4（livingWorld, healthPreflight, antiOmniscience, outputGuard）
 *     - 真实开局（playableBlueprint.installSample 播种）：seededYield >= 18（相比立项前 14 真实增长）
 *     - 主链推演分发（intake.run 分发）：intakeYield >= 21
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);

function createFreshEnv() {
  require(path.join(BASE, 'tests/mock.js'));
  const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const mm = runSrc.match(/const LOAD = \[([\s\S]*?)\];/);
  const LOAD = vm.runInNewContext('[' + mm[1] + ']');
  const ctx = vm.createContext(global);
  for (const rel of LOAD) {
    try { vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel }); } catch (e) {}
  }
  return global.WorldAxis;
}

function countNonEmpty(WA) {
  let count = 0;
  const list = [];
  const keys = Object.keys(WA).filter(function (k) { return WA[k] && typeof WA[k] === 'object'; });
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const m = WA[k];
    if (!m || typeof m.buildBlock !== 'function') continue;
    let b = '';
    try { b = m.buildBlock(); } catch (e) { b = ''; }
    const s = typeof b === 'string' ? b : JSON.stringify(b);
    if (s && s.length > 2 && s.replace(/[\s{}\[\]"\,:0-9a-zA-Z_]/g, '') !== '') {
      count++;
      list.push({ ns: k, len: s.length });
    }
  }
  return { count: count, list: list };
}

function measureYieldBaseline(WA) {
  // 1. 空世界未开局未推演
  const yEmpty = countNonEmpty(WA);

  // 2. 真实开局播种（installSample）
  if (WA.capabilityTier && typeof WA.capabilityTier.applyTier === 'function') {
    WA.capabilityTier.applyTier('full');
  }
  let seededRes = null;
  if (WA.playableBlueprint && typeof WA.playableBlueprint.installSample === 'function') {
    seededRes = WA.playableBlueprint.installSample('town-workshop', { force: true, ignoreMissing: true });
  }
  const ySeeded = countNonEmpty(WA);

  // 3. 推演分发（intake.run）
  let intakeRes = null;
  if (WA.intake && typeof WA.intake.run === 'function') {
    WA.intake.setSettings({ enabled: true });
    const payload = {
      people: [
        { name: '学徒小李', intent: '完成纺织并前往集市采购丝线', personalityAnchor: '谨慎勤勉', speakingStyle: '轻声细语' },
        { name: '师傅老王', intent: '检修织机并向行会提交图纸', personalityAnchor: '严厉固执', speakingStyle: '中气十足' }
      ],
      events_create: [
        { title: '工坊季度技术评定', kind: 'once' }
      ],
      blackbox: {
        secretActions: [
          { action: '秘密清点备用丝线仓库', witnesses: '学徒小李' }
        ]
      }
    };
    intakeRes = WA.intake.run(payload, { idx: 1 });
  }
  const yIntake = countNonEmpty(WA);

  return {
    empty: yEmpty,
    seeded: ySeeded,
    intake: yIntake,
    seededRes: seededRes,
    intakeRes: intakeRes
  };
}

if (require.main === module) {
  console.log('=== OPV7-9 产出回归基线测量 ===');
  const WA = createFreshEnv();
  try { WA.store.init(); } catch (e) {}
  const res = measureYieldBaseline(WA);

  let pass = 0, fail = 0;
  function a(cond, msg) {
    if (cond) { pass++; console.log('  ✓ ' + msg); }
    else { fail++; console.error('  ✗ ' + msg); }
  }

  // 基线底线断言（V7_MASTER_PLAN.md OPV7-9 固化契约）：
  // 「空世界 4 / 开局 14 / 五轮 14」固化为门禁底线；任一版本使产出掉出基线即红；允许向上漂移，严禁向下衰退。
  a(res.empty.count >= 4, '空世界非空产出 >= 4（实 ' + res.empty.count + '，基线底线 4）');
  a(res.seeded.count >= 14, '真实开局后非空产出 >= 14（实 ' + res.seeded.count + '，基线底线 14）');
  a(res.intake.count >= 14, '推演分发后非空产出 >= 14（实 ' + res.intake.count + '，基线底线 14）');
  a(res.intake.count >= res.seeded.count, '推演后产出不低于开局产出（单调递增性验证）');
  a(res.seeded.count >= res.empty.count, '开局后产出不低于空世界产出（单调递增性验证）');

  console.log('\n产出列表详情:');
  console.log('  空世界 (' + res.empty.count + '): ' + res.empty.list.map(x => x.ns).join(', '));
  console.log('  开局后 (' + res.seeded.count + '): ' + res.seeded.list.map(x => x.ns).join(', '));
  console.log('  推演后 (' + res.intake.count + '): ' + res.intake.list.map(x => x.ns).join(', '));

  console.log('\n探针汇总: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

module.exports = {
  createFreshEnv: createFreshEnv,
  countNonEmpty: countNonEmpty,
  measureYieldBaseline: measureYieldBaseline
};
