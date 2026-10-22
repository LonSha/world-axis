'use strict';
// WorldAxis tests/exp18-aftermath-impact-v2232.js (v2.231.0)
// OP-6 世界痕迹消费专锁：设施/道路破坏改变行动空间、绕路交货、投入抢修与不可逆成本。
const fs = require('fs');
const path = require('path');
const PR = 'engines/aftermath-impact.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.aftermath.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.region = d.region || { places: [], events: [] };
    d.region.places = [
      { name: 'stone_bridge', title: '青石桥' },
      { name: 'town', title: '城镇' },
      { name: 'forest_mill', title: '林场工坊' }
    ];
    d.places = d.places || {};
    d.places.stone_bridge = { id: 'stone_bridge', name: '青石桥' };
    d.places.town = { id: 'town', name: '城镇' };
    d.places.forest_mill = { id: 'forest_mill', name: '林场工坊' };
    return true;
  }, 'exp18:seed');
  return W;
}

async function runAll(a) {
  const W = env();
  a(!!W.aftermathImpact, 'aftermathImpact 存在于 WA');

  // 1. 在青石桥登记严重损坏事件
  const regRes = W.aftermath.register({
    eventId: 'flood_2026',
    placeId: 'stone_bridge',
    kind: 'road_damaged',
    summary: '山洪冲塌石桥主拱，车辆无法通行',
    blocksRoute: true,
    duration: 30
  });
  a(regRes.ok === true, '登记地点损坏后果成功');
  const effectId = regRes.id;

  // 2. 检查青石桥的影响
  const imp = W.aftermathImpact.inspectImpact('stone_bridge');
  a(imp.ok === true && imp.hasActiveImpact === true, '成功检出桥梁封阻');
  a(imp.availableActions.indexOf('reroute') >= 0, '提供绕路选项');
  a(imp.availableActions.indexOf('repair') >= 0, '提供抢修选项');

  // 3. 计算从林场工坊到城镇的绕路方案
  const detourRes = W.aftermathImpact.findDetour('forest_mill', 'town', 'stone_bridge', {
    normalDays: 2,
    extraDays: 3,
    extraCost: 8,
    detourWaypoints: ['shallow_ford', 'south_gate']
  });
  a(detourRes.ok === true, '绕路计算成功');
  a(detourRes.originalRouteBlocked === true, '标记原直达路线受阻');
  a(detourRes.detour.totalDays === 5, '绕路总耗时从 2 天增加到 5 天');
  a(detourRes.detour.extraCost === 8, '绕路额外费用 8');
  a(detourRes.canReach === true, '依然能够迂回送达');

  // 4. 投入资源组织抢修
  const repRes = W.aftermathImpact.commissionRepair(effectId, {
    who: 'master_carpenter',
    days: 4,
    cost: 25,
    materials: { timber: 10, stone: 5 }
  });
  a(repRes.ok === true, '抢修工程立项');
  a(repRes.status === 'repaired', '显式标记为已修复');
  a(repRes.historyIrreversible === true, '历史投入成本不可回滚');
  a(repRes.costsIncurred.cost === 25, '记录支出 25 成本');

  // 5. 行动桌路由
  const deskRes = W.actionDesk.plan('aftermath.reroute', {
    from: 'forest_mill',
    to: 'town',
    blockedPlace: 'stone_bridge'
  });
  a(deskRes.ok === true && deskRes.detour, '行动桌 aftermath.reroute 路由成功');
}

const mutations = [
  [
    'blocked-state-bypass',
    'originalRouteBlocked: true,',
    'originalRouteBlocked: false,',
    function (W) {
      const res = W.aftermathImpact.findDetour('p1', 'p2', 'bridge');
      return res.originalRouteBlocked === true;
    }
  ],
  [
    'repair-status-bypass',
    "status: 'repaired',",
    "status: 'pending',",
    function (W) {
      const res = W.aftermathImpact.commissionRepair('eff_1', {});
      return res.status === 'repaired';
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
  console.log('EXP18-OP6: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();