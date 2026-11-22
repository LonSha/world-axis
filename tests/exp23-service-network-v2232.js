'use strict';
// WorldAxis tests/exp23-service-network-v2232.js
// 验证 IN-6 公共设施与服务网络：声明、激活、容量排队、维护降级、修复、地点校验、真变异负控制

const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  // 种入地点
  W.store.transact(function (d) {
    d.region = d.region || {};
    d.region.places = d.region.places || [];
    d.region.places.push({ id: 'east_village', name: '东村' });
    d.region.places.push({ id: 'west_field', name: '西田' });
    return true;
  }, 'test:places');
  return W;
}

let pass = 0, fail = 0;
function a(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error('FAIL: ' + desc); }
}

async function runPositive() {
  const W = env();

  a('serviceNetwork 模块已加载', !!W.serviceNetwork);
  a('declareFacility 为函数', typeof W.serviceNetwork.declareFacility === 'function');
  a('requestService 为函数', typeof W.serviceNetwork.requestService === 'function');

  // 1. 声明设施
  const f1 = W.serviceNetwork.declareFacility({
    name: '公共工坊', placeId: 'east_village', serviceType: 'crafting',
    capacity: 2, maintainer: '张三', buildCost: 100
  });
  a('设施声明成功', f1 && f1.ok);
  a('设施初始状态为 planned', f1.facility.status === 'planned');

  // 拒绝不存在的地点
  const fBad = W.serviceNetwork.declareFacility({
    name: '幽灵', placeId: 'nowhere', serviceType: 'crafting'
  });
  a('不存在的地点被拒绝', fBad && !fBad.ok && fBad.reason === 'place-not-found');

  // 拒绝未知服务类型
  const fBad2 = W.serviceNetwork.declareFacility({
    name: '非法', placeId: 'east_village', serviceType: 'magic'
  });
  a('未知服务类型被拒绝', fBad2 && !fBad2.ok && fBad2.reason === 'bad-service-type');

  // 2. 激活
  const act = W.serviceNetwork.activateFacility(f1.facility.id);
  a('设施激活成功', act && act.ok);

  // 3. 容量与排队
  const r1 = W.serviceNetwork.requestService(f1.facility.id, '李四', 1);
  a('正常服务请求成功', r1 && r1.ok && r1.served === 1 && r1.queued === 0);

  const r2 = W.serviceNetwork.requestService(f1.facility.id, '王五', 2);
  a('超容量请求报排队', r2 && r2.ok && r2.served === 1 && r2.queued === 1);

  // 4. 释放负载
  const rel = W.serviceNetwork.releaseService(f1.facility.id, 1);
  a('释放负载成功', rel && rel.ok);

  const r3 = W.serviceNetwork.requestService(f1.facility.id, '赵六', 1);
  a('释放后有容量', r3 && r3.ok && r3.queued === 0);

  // 5. 维护降级与修复
  W.serviceNetwork.decayFacility(f1.facility.id);
  const sv = W.serviceNetwork.servicesAt('east_village');
  const fac = sv.facilities[0];
  a('降级后状态为 degraded', fac && fac.status === 'degraded');

  W.serviceNetwork.restoreFacility(f1.facility.id);
  const sv2 = W.serviceNetwork.servicesAt('east_village');
  const fac2 = sv2.facilities[0];
  a('修复后状态为 operational', fac2 && fac2.status === 'operational');

  // 6. 行动桌路由联通
  const deskRes = W.actionDesk.plan('serviceNetwork.declareFacility', {
    spec: { name: '水渠', placeId: 'west_field', serviceType: 'irrigation', capacity: 3 }
  });
  a('行动桌 serviceNetwork.declareFacility 路由成功', deskRes && deskRes.ok);
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/service-network.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 破坏容量检查（让 effective = amt 永远成立）
  const anchor1 = "var capped = newLoad > fac.capacity;";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "var capped = false;");

  const W1 = env({ 'engines/service-network.js': mutated1 });
  const f1 = W1.serviceNetwork.declareFacility({
    name: '测试', placeId: 'east_village', serviceType: 'crafting', capacity: 1
  });
  W1.serviceNetwork.activateFacility(f1.facility.id);
  W1.serviceNetwork.requestService(f1.facility.id, '甲', 1);
  const r2 = W1.serviceNetwork.requestService(f1.facility.id, '乙', 5);
  a('负控制1: 容量检查破坏后不报排队（证明判据真在守）', r2 && r2.queued === 0 && r2.served === 5);

  // 变异 2: 破坏地点校验（移除 return 使其继续执行）
  const anchor2 = "if (!placeExists(placeId)) return { ok: false, reason: 'place-not-found', placeId: placeId,";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "if (false) return { ok: false, reason: 'place-not-found', placeId: placeId,");

  const W2 = env({ 'engines/service-network.js': mutated2 });
  const f2 = W2.serviceNetwork.declareFacility({
    name: '幽灵', placeId: 'nowhere', serviceType: 'crafting', capacity: 1
  });
  a('负控制2: 地点校验破坏后不存在的地点可声明（证明判据真在守）', f2 && f2.ok);
}


async function runAll() { await runPositive(); }
module.exports = { runAll, runNegative };

(async function main() {
  console.log('[exp23-service-network] 开始正向功能测试...');
  await runPositive();
  console.log('[exp23-service-network] 开始真变异负控制测试...');
  await runNegative();
  console.log('[exp23-service-network] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();