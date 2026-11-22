'use strict';
// WorldAxis tests/exp17-family-ops-v2232.js (v2.231.0)
// OP-5 共同生活经营专锁：预算分工、外出缺口多解法、具名比例资产守恒继承与退出处置。
const fs = require('fs');
const path = require('path');
const PR = 'engines/family-ops.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.family.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.people = d.people || {};
    ['jia', 'yi', 'bing', 'ding'].forEach(function (name) {
      d.people['p_' + name] = {
        id: 'p_' + name,
        name: name,
        resources: { funds: 100 },
        life: {}
      };
    });
    return true;
  }, 'exp17:seed');
  return W;
}

async function runAll(a) {
  const W = env();
  a(!!W.familyOps, 'familyOps 存在于 WA');

  // 1. 创建共同生活单位并注资
  const uRes = W.family.createUnit({ name: '工坊合作社', type: '合伙', by: 'jia' });
  a(uRes.ok === true, '创建共同生活单位');
  const uId = uRes.id;
  W.family.addMember(uId, 'yi', '工匠');
  W.family.addMember(uId, 'bing', '学徒');
  // 注入初始共同池资金 50
  W.family.contribute(uId, 'jia', 'funds', 50);

  // 2. 设立周期预算与共同目标
  const bRes = W.familyOps.setBudget(uId, {
    periodicExpense: 20,
    careRoster: [{ caregiver: 'jia', target: 'bing', slot: 'morning' }],
    sharedGoals: [{ id: 'g_furnace', text: '修缮高炉', deadlineDays: 30 }]
  });
  a(bRes.ok === true, '设立预算与目标成功');

  // 3. 成员 jia 外出造成照护与工位缺口
  // 解法 A: 雇佣帮手（花钱保时间）
  const gapA = W.familyOps.handleGap(uId, 'care-gap', 'hire_help', { cost: 15, helperName: '临时帮工' });
  a(gapA.ok === true && gapA.action.cost === 15, '雇工方案成功');
  const uAfterHire = W.store.get().family.units.filter(function (x) { return x.id === uId; })[0];
  a(uAfterHire.treasury.funds === 35, '共同池资金扣除 15，剩余 35');

  // 解法 B: 成员代班（花时间省钱）
  const gapB = W.familyOps.handleGap(uId, 'care-gap', 'substitute', { substituteName: 'yi', target: 'bing' });
  a(gapB.ok === true && gapB.action.cost === 0, '代班方案成功且零花费');
  a(gapB.action.substitute === 'yi', 'yi 承担代班责任');

  // 解法 C: 延期目标
  const gapC = W.familyOps.handleGap(uId, 'goal-gap', 'defer_goal', { goalId: 'g_furnace', delayDays: 15 });
  a(gapC.ok === true && gapC.action.deferred === true, '目标延期成功');
  const bAfterDefer = W.store.get().familyOps.budgets[uId];
  a(bAfterDefer.sharedGoals[0].deadlineDays === 45, '工期延长到 45 天');

  // 4. 三人具名比例遗产分配（50% : 30% : 20%）：严格资产守恒
  W.store.transact(function (s) {
    s.people.p_jia.resources.funds = 103;
    return true;
  });
  const shares = [
    { who: 'yi', ratio: 0.5 },
    { who: 'bing', ratio: 0.3 },
    { who: 'ding', ratio: 0.2 }
  ];
  const inheritRes = W.familyOps.inheritRatio(uId, 'jia', shares);
  a(inheritRes.ok === true, '具名比例继承执行成功');
  a(inheritRes.conserved === true, '资产严格守恒（分配总数 === 被继承人总额）');
  a(inheritRes.allocatedTotal === 103, '分配总量等于 103');
  a(inheritRes.noMemoryTransferred === true, '不转移私密记忆');
  const sAfter = W.store.get();
  a(sAfter.people.p_jia.resources.funds === 0, '被继承人资金清零');
  // 103 * 0.5 = 51, 103 * 0.3 = 30, 最后一笔 = 103 - 51 - 30 = 22
  a(inheritRes.distribution[0].amount === 51, 'yi 获得 51');
  a(inheritRes.distribution[1].amount === 30, 'bing 获得 30');
  a(inheritRes.distribution[2].amount === 22, 'ding 吃余量获得 22');

  // 5. 退出成员
  const retRes = W.familyOps.retireMember(uId, 'ding', 'debt-cleared');
  a(retRes.ok === true && retRes.disposition === 'debt-cleared', '退出成员并处置责任');

  // 6. 行动桌路由连通
  const deskRes = W.actionDesk.plan('familyOps.gap', {
    unitId: uId,
    gapType: 'care-gap',
    solution: 'hire_help',
    cost: 10
  });
  a(deskRes.ok === true, '行动桌 familyOps.gap 路由执行成功');
}

const mutations = [
  [
    'treasury-deduct-bypass',
    'u.treasury[mKey] = Math.max(0, (Number(u.treasury[mKey]) || 0) - wage);',
    'u.treasury[mKey] = Number(u.treasury[mKey]) || 0;',
    function (W) {
      const uRes = W.family.createUnit({ name: '测试社', type: '合伙', by: 'jia' });
      W.family.contribute(uRes.id, 'jia', 'funds', 50);
      W.familyOps.handleGap(uRes.id, 'gap', 'hire_help', { cost: 15 });
      const u = W.store.get().family.units.filter(function (x) { return x.id === uRes.id; })[0];
      return u.treasury.funds === 35;
    }
  ],
  [
    'estate-conservation-bypass',
    'amt = decRes - allocatedTotal;',
    'amt = Math.floor(decRes * sh.ratio);',
    function (W) {
      const uRes = W.family.createUnit({ name: '测试社2', type: '合伙', by: 'jia' });
      W.store.transact(function (s) { s.people.p_jia.resources.funds = 103; return true; });
      const res = W.familyOps.inheritRatio(uRes.id, 'jia', [
        { who: 'yi', ratio: 0.5 },
        { who: 'bing', ratio: 0.3 },
        { who: 'ding', ratio: 0.2 }
      ]);
      return res.conserved === true;
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
  console.log('EXP17-OP5: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();