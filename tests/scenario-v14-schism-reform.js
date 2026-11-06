'use strict';
// WorldAxis tests/scenario-v14-schism-reform.js
// 验证 WorldAxis V14 场景 16：阵营分裂政变与行会制度变迁风暴
// 机制覆盖：
//   - OPV14-7: factionSchism.triggerSchism 阵营离心力临界分裂与资产兵权交割
//   - EXV14-7: institutionalSchism.enactReform 地方思潮改革公决与市政法条规则永久重构
//   - 负控制测试：离心力不足拒绝、诉求不足拒绝、缺失父阵营拒绝、熔断开关关闭拒绝

const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'factionSchism', 'institutionalSchism'].forEach(function (k) {
    if (W[k]) {
      if (typeof W[k].setSettings === 'function') W[k].setSettings({ enabled: true });
      if (typeof W[k].saveSettings === 'function') W[k].saveSettings({ enabled: true });
    }
  });
  return W;
}

function runScenario() {
  const W = env();
  let asserts = 0;
  function a(cond, msg) {
    asserts++;
    if (!cond) {
      console.error('FAIL: ' + msg);
      process.exit(1);
    }
  }

  // 初始化阵营与世界状态
  W.store.transact(function (d) {
    d.factions = d.factions || {};
    d.factions['fac_regime'] = {
      id: 'fac_regime',
      name: '旧领主政权',
      treasury: 50000,
      relations: {}
    };
    return true;
  });

  // 1. 离心力突破临界阈值，副将发动政变分裂阵营 (OPV14-7)
  const schism = W.actionDesk.plan('faction.triggerSchism', {
    parentFactionId: 'fac_regime',
    rebelLeaderId: 'p_rebel_general',
    centrifugalForce: 85, // > 70 临界值
    assetShare: 0.5
  });
  a(schism.ok === true && schism.reason === 'faction-split-enacted',
    'S16-1: 阵营离心力爆表，副将成功分裂并宣告自立政权');

  const s = W.store.get();
  const splId = schism.schism.splinterFactionId;
  a(s.factions[splId] && s.factions[splId].leader === 'p_rebel_general',
    'S16-2: 叛逆新阵营持久化创建并在册');
  a(s.factions['fac_regime'].relations[splId] === 'at-war',
    'S16-3: 旧领主与叛军新阵营自动确立交战敌对关系');
  a(s.factions['fac_regime'].treasury === 25000,
    'S16-4: 原政权金库被瓜分 50%（50000 -> 25000）');

  // 2. 地方思潮发酵达标，工团通过公决改写城市市政制度 (EXV14-7)
  const reform = W.actionDesk.plan('chronicle.enactReform', {
    regionId: 'city_valdor',
    reformType: 'trade_autonomy',
    reformDemand: 80, // > 60 门槛
    newTaxRate: 0.03
  });
  a(reform.ok === true && reform.reason === 'reform-enacted',
    'S16-5: 地方自治风潮突破门槛，市政改革法令公决通过');

  const sAfterReform = W.store.get();
  const inst = sAfterReform.regionalInstitutions['city_valdor'];
  a(inst && inst.charter === 'autonomous-guild' && inst.taxRate === 0.03,
    'S16-6: 城市制度规则永久改写为行会自治宪章与 3% 低税率');
  a(sAfterReform.institutionalReforms && sAfterReform.institutionalReforms.length === 1,
    'S16-7: 改革记录载入世界历史公决名录');

  // 3. 破坏性负控制测试 1：离心力不足分裂必然拒绝
  const neg1 = W.actionDesk.plan('faction.triggerSchism', {
    parentFactionId: 'fac_regime',
    rebelLeaderId: 'p_officer',
    centrifugalForce: 40 // < 70
  });
  a(neg1.ok === false && neg1.reason === 'insufficient-centrifugal-force',
    'S16-NC1: 离心力未达临界值时阵营分裂必然拒绝');

  // 4. 破坏性负控制测试 2：改革思潮诉求不足公决必然拒绝
  const neg2 = W.actionDesk.plan('chronicle.enactReform', {
    regionId: 'city_valdor',
    reformType: 'free_market',
    reformDemand: 30 // < 60
  });
  a(neg2.ok === false && neg2.reason === 'demand-below-threshold',
    'S16-NC2: 民意诉求未达门槛时制度改革公决必然拒绝');

  // 5. 破坏性负控制测试 3：缺失父阵营代码必然拒绝
  const neg3 = W.actionDesk.plan('faction.triggerSchism', {
    parentFactionId: '  ',
    rebelLeaderId: 'p_officer'
  });
  a(neg3.ok === false && neg3.reason === 'missing-parent-faction',
    'S16-NC3: 缺失父阵营代码时分裂必然拒绝');

  // 6. 破坏性负控制测试 4：制度变迁引擎开关熔断关闭
  if (W.settingsBus) {
    const reg = W.__settingsRegs.find(function (r) { return r.module === 'institutionalSchism'; });
    if (reg) W.settingsBus.save(reg, { enabled: false });
  }
  const neg4 = W.actionDesk.plan('chronicle.enactReform', {
    regionId: 'city_valdor',
    reformType: 'trade_autonomy',
    reformDemand: 90
  });
  a(neg4.ok === false && neg4.reason === 'disabled',
    'S16-NC4: 引擎开关关闭时制度改革硬熔断拒收');

  console.log('场景 16 专锁全部断言通过（含 4 项真负控制）！');
  console.log('PASS ' + asserts + ' / ' + asserts);
}

runScenario();