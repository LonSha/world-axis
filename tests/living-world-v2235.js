#!/usr/bin/env node
// tests/living-world-v2235.js — Living World V5.1 专锁：
// 原生职业作息网格、生理磨损沉淀与生计行囊契约验证
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const LIVING_PATH = path.join(BASE, 'engines/living-world.js');
const ANCHOR = "strain.weariness = Math.max(0, Math.min(100, strain.weariness + wearDelta));";

function runSuite() {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;

  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });
  WA.livingWorld.setSettings({ enabled: true, rumorDiffusion: true, decayRounds: 5 });
  WA.elsewhere.setSettings({ enabled: true });
  WA.rumor.setSettings({ enabled: true });

  let tested = 0;
  function t(desc, cond) {
    assert(cond, desc);
    tested++;
  }

  // 1. 基础存在性与职业模板存在性
  t('WA.livingWorld 导出存在', !!WA.livingWorld);
  t('autonomousTick 为函数', typeof WA.livingWorld.autonomousTick === 'function');
  t('OCCUPATIONAL_ROUTINES 字典存在', typeof WA.livingWorld.OCCUPATIONAL_ROUTINES === 'object');
  t('包含 healer 作息', !!WA.livingWorld.OCCUPATIONAL_ROUTINES.healer);
  t('包含 constable 作息', !!WA.livingWorld.OCCUPATIONAL_ROUTINES.constable);

  // 2. ActionDesk 路由接线
  const actDeskRoutines = WA.actionDesk.actFromScene({ actionId: 'livingWorld.occupationalRoutines' });
  t('ActionDesk 正确返回职业作息', !!(actDeskRoutines && actDeskRoutines.healer));

  // 3. 在彼方档案开立苏晴（医者）与陆捕头（捕快）
  const openRes1 = WA.elsewhere.open('苏晴');
  t('开立苏晴彼方档案成功', openRes1 && openRes1.ok === true);
  WA.elsewhere.update('苏晴', {
    place: '医馆',
    doing: '坐堂搭脉',
    status: '神色从容',
    worry: '急需一味三年沉香'
  });

  const openRes2 = WA.elsewhere.open('陆捕头');
  t('开立陆捕头彼方档案成功', openRes2 && openRes2.ok === true);
  WA.elsewhere.update('陆捕头', {
    place: '东市集市',
    doing: '巡查商摊',
    status: '目光如炬',
    worry: ''
  });

  // 4. 显式登记职业作息
  const r1 = WA.actionDesk.actFromScene({ actionId: 'livingWorld.registerRoutine', mode: 'execute', name: '苏晴', occupation: 'healer' });
  const out1 = r1.result || r1;
  t('苏晴成功登记为 healer', out1 && out1.ok === true && out1.occupation === 'healer');
  const r2 = WA.actionDesk.actFromScene({ actionId: 'livingWorld.registerRoutine', mode: 'execute', name: '陆捕头', occupation: 'constable' });
  const out2 = r2.result || r2;
  t('陆捕头成功登记为 constable', out2 && out2.ok === true && out2.occupation === 'constable');

  // 5. 初始探测行囊与生理状态
  const enc0 = WA.livingWorld.detectEncounters('医馆');
  t('探测医馆成功', enc0 && enc0.ok === true);
  t('苏晴在场', enc0.presentNPCs.length === 1 && enc0.presentNPCs[0].name === '苏晴');
  const sq0 = enc0.presentNPCs[0];
  t('苏晴身份为 healer', sq0.occupation === 'healer');
  t('存在 weariness 生理指标', typeof sq0.vitalStrain.weariness === 'number');
  t('初始行囊有散碎铜板', sq0.belongings.copper > 0);

  // 6. 执行一轮自治推进，见证作息演化与生理磨损累加
  const tick1 = WA.livingWorld.autonomousTick({});
  t('第1轮自治演化成功', tick1 && tick1.ok === true);

  const storeState1 = WA.store.get();
  const sqState1 = storeState1.livingWorld.characterStates['苏晴'];
  t('苏晴状态已沉淀入 characterStates', !!sqState1);
  t('医者劳碌，weariness 显著累积', sqState1.vitalStrain.weariness > 10);

  // 7. 再推进入夜（连续推进），见证饥饿消耗与风霜加深
  WA.livingWorld.autonomousTick({});
  WA.livingWorld.autonomousTick({});
  WA.livingWorld.autonomousTick({});

  const encNight = WA.livingWorld.detectEncounters('医馆');
  const sqNight = encNight.presentNPCs[0] || (WA.store.get().livingWorld.characterStates['苏晴']);
  t('连续推演后生理磨损与风尘累积', sqNight.vitalStrain.weathering > 5 || sqNight.vitalStrain.weariness > 20);

  // 8. 正文生动叙事透镜检验（buildBlock）
  const promptBlock = WA.livingWorld.buildBlock('医馆');
  t('透镜包含时节市井', promptBlock.indexOf('【时节与市井运转】') >= 0);
  t('透镜包含生活实况', promptBlock.indexOf('【在场/周边人物生活实况】') >= 0);
  t('透镜中包含苏晴', promptBlock.indexOf('苏晴') >= 0);
  t('透镜中呈现随身行囊细节', promptBlock.indexOf('随身行囊') >= 0);
  // 货币名由经济配方声明（银元/铜板/元皆可），只钉行囊额度真被具体物化、不钉币名
  t('透镜中行囊额度被具体物化', /随身所余[^(]*\(\d+\p{L}+\)/u.test(promptBlock));

  return tested;
}

// 执行主套件
const passCount = runSuite();
console.log(`[PASS] living-world-v2235 测试通过！共执行 ${passCount} 项断言。`);

// 负控制变异测试
const src = fs.readFileSync(LIVING_PATH, 'utf8');
assert(src.includes(ANCHOR), `负控制锚点未找到: ${ANCHOR}`);

// 破坏逻辑：将精力疲惫累加替换为固定常数 10
const broken = src.replace(
  ANCHOR,
  "strain.weariness = 10;"
);

try {
  fs.writeFileSync(LIVING_PATH, broken, 'utf8');
  let threw = false;
  try {
    runSuite();
  } catch (err) {
    threw = true;
  }
  assert(threw, '负控制单行真变异（破坏精力累加）必须导致断言失败！');
  console.log('[PASS] living-world-v2235 负控制变异测试通过！');
} finally {
  fs.writeFileSync(LIVING_PATH, src, 'utf8');
}