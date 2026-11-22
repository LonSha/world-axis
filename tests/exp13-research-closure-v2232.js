'use strict';
// EXP-13 / OP-4: 研究成果闭环专锁。类型化前置验证与三权分立就绪度。
const fs = require('fs');
const path = require('path');
const PR = 'engines/research-closure.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.gear.setSettings({ enabled: true });
  W.training.setSettings({ enabled: true });
  W.laborSchedule.setSettings({ enabled: true });
  W.research.setSettings({ enabled: true });
  W.researchClosure.setSettings({ enabled: true });

  W.store.transact(function (d) {
    d.people = d.people || {};
    ['甲', '乙'].forEach(function (name) {
      d.people['p_' + name] = { id: 'p_' + name, name: name };
    });
    d.evolution = d.evolution || {};
    d.evolution.entityMemory = d.evolution.entityMemory || {};
    d.evolution.entityMemory.object = [{ id: 'obj_scope', name: '显微镜' }];
    d.evolution.entityMemory.ability = [
      { id: 'ab_craft', name: '制造', mode: 'stage', stageNames: ['新手', '熟手'] }
    ];
    return true;
  }, 'exp13:seed');

  W.training.declare('制造', { mode: 'stage', stageNames: ['新手', '熟手'] });

  return W;
}

async function runAll(a) {
  const W = env();

  // 1. 设备型前置验证（gear 设备必须真实持有且完好）
  const tool = W.gear.make('显微镜', { holder: '甲', durability: 5 });
  const pGear = { type: 'gear', target: tool.id };
  const vGearPass = W.researchClosure.verifyPrereq(pGear, { who: '甲', gearId: tool.id });
  a(vGearPass && vGearPass.ok && vGearPass.pass, '持有完好设备通过设备型前置');

  const vGearFail = W.researchClosure.verifyPrereq(pGear, { who: '乙', gearId: tool.id });
  a(!vGearFail.ok && vGearFail.reason === 'gear-not-ready', '非持有人无法通过设备型前置');

  // 2. 能力型前置验证（training 能力阶段）
  const pSkill = { type: 'training', target: '制造', need: 1 };
  const vSkillFail = W.researchClosure.verifyPrereq(pSkill, { who: '甲' });
  a(!vSkillFail.ok && vSkillFail.reason === 'insufficient-skill', '能力未达标时前置被拒');

  // 甲训练达标
  W.store.transact(function (d) {
    d.training.rows.push({ who: '甲', ability: '制造', mode: 'stage', stage: 1 });
    return true;
  }, 'exp13:train_pass');
  const vSkillPass = W.researchClosure.verifyPrereq(pSkill, { who: '甲' });
  a(vSkillPass && vSkillPass.ok && vSkillPass.pass, '能力达标后通过前置');

  // 3. 工时型前置验证（schedule 日程占用）
  const pSched = { type: 'schedule', target: 'morning' };
  const vSchedFail = W.researchClosure.verifyPrereq(pSched, { who: '甲', day: 1, slot: 'morning' });
  a(!vSchedFail.ok && vSchedFail.reason === 'missing-schedule-slot', '未排班无法通过工时型前置');

  W.laborSchedule.claim({ who: '甲', day: 1, slot: 'morning', task: '前置研发' });
  const vSchedPass = W.researchClosure.verifyPrereq(pSched, { who: '甲', day: 1, slot: 'morning' });
  a(vSchedPass && vSchedPass.ok && vSchedPass.pass, '排班后通过工时前置');

  // 4. 三权分立就绪度评估
  const r1 = W.researchClosure.evaluateReadiness('甲', '配方A');
  a(r1 && r1.ok, '就绪度评估调用成功');

  // 5. 失败线索持久化
  const clueRes = W.researchClosure.recordFailureClue('proj_1', '晶体提纯温度过高导致裂解');
  a(clueRes && clueRes.ok && clueRes.clue, '失败线索成功记录');
  const snap = W.store.get();
  a(snap.researchClues && snap.researchClues.some(c => c.projectId === 'proj_1'), '失败线索持久化落盘在 store');
}

// 负控制变异
const mutations = [
  ['gear-prereq-bypass', 'if (!can || !can.pass) {\n        noteFault(\'gear-not-ready\');',
    'if (false) {\n        noteFault(\'gear-not-ready\');',
    function (W) {
      const tool = W.gear.make('显微镜', { holder: '甲', durability: 5 });
      const res = W.researchClosure.verifyPrereq({ type: 'gear', target: tool.id }, { who: '乙', gearId: tool.id });
      return !res.ok && res.reason === 'gear-not-ready';
    }
  ],
  ['skill-prereq-bypass', 'if (!can || !can.pass) {\n        noteFault(\'insufficient-skill\');',
    'if (false) {\n        noteFault(\'insufficient-skill\');',
    function (W) {
      const res = W.researchClosure.verifyPrereq({ type: 'training', target: '制造', need: 1 }, { who: '甲' });
      return !res.ok && res.reason === 'insufficient-skill';
    }
  ]
];

async function runNegative(a) {
  for (const [name, anchor, replacement, criterion] of mutations) {
    const source = fs.readFileSync(path.join(BASE, PR), 'utf8');
    a(criterion(env()), name + ': 原版真判据通过');
    if (source.split(anchor).length < 2) throw new Error(name + ': nonunique mutation anchor');
    const ov = {}; ov[PR] = source.replace(anchor, replacement);
    a(!criterion(env(ov)), name + ': 变异后判据必捕获失败');
    a(fs.readFileSync(path.join(BASE, PR), 'utf8') === source, name + ': 源码文件保持未变');
  }
}

module.exports = { runAll, runNegative };

if (require.main === module) (async function () {
  let pass = 0, fail = 0;
  const a = (ok, name) => {
    if (ok) pass++;
    else { fail++; console.log('FAIL ' + name); }
  };
  try {
    await runAll(a);
    await runNegative(a);
  } catch (e) {
    fail++;
    console.log(e.stack);
  }
  console.log('EXP13-OPT4: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();