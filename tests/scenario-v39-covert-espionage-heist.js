'use strict';
/**
 * WorldAxis tests/scenario-v39-covert-espionage-heist.js
 * 场景 39：雨夜谍影潜伏伪装、眼线收买与密函刺探专锁 (EXV19-1 + OPV19-1)
 *
 * 验收旅程：
 * 1. 注册间谍【影狐】（真实身份：暗影会精锐细作，掩护身份：总督府厨役，文牒完整度 85）；
 * 2. 潜入总督府后厨（infiltrate），可疑度安全累加，未暴露；
 * 3. 施展利诱收买侍从【小林】（cultivateAsset），建立暗网眼线；
 * 4. 截获总督调兵商路封锁密函【disp-garrison-01】（interceptDispatch）；
 * 5. 密函信息驱动【economy.simulateTradeShock】验证宏观贸易冲击物价暴涨（OPV19-1）；
 * 6. 散布反间计伪证（plantDisinformation）；
 * 7. 4 项真实破坏性负控制门禁测试（100% 拒绝与受控反噬）。
 */

const assert = require('assert');
const path = require('path');

// 导入统一测试沙盒环境
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

// 加载被测生产引擎
require('../engines/economy.js');
require('../engines/covert-espionage.js');

console.log('[Scenario 39] 开始执行间谍潜伏渗透与密函刺探专锁测试...');

// 开启总开关
WA.covertEspionage.setSettings({ enabled: true });
WA.economy.setSettings({ enabled: true });

// 通过官方 API 登记商品与开辟商路
WA.economy.stock('总督要塞', '粮草', 120, { base: 10 });
WA.economy.route('route-main', 'road', '总督要塞', '外港', 15);

// 1. 注册间谍
const regRes = WA.covertEspionage.registerSpy({
  actorId: 'fox_007',
  factionId: 'shadow_syndicate',
  coverName: '老张厨役',
  coverRole: 'cook',
  coverIntegrity: 85,
  locationId: 'outer_tavern'
});
assert.strictEqual(regRes.ok, true, '间谍注册应当成功');
assert.strictEqual(regRes.spy.coverName, '老张厨役');

// 2. 潜入高戒备据点
const infRes = WA.covertEspionage.operateSpy({
  spyId: 'fox_007',
  action: 'infiltrate',
  locationId: 'governors_mansion',
  securityLevel: 60,
  hasPermit: true
});
assert.strictEqual(infRes.ok, true, '持证潜入应当成功');
assert.strictEqual(infRes.status, 'infiltrating');
assert.strictEqual(infRes.exposed, false, '持假文牒潜入不应暴露');

// 3. 收买眼线
const assetRes = WA.covertEspionage.operateSpy({
  spyId: 'fox_007',
  action: 'cultivateAsset',
  targetActorId: 'servant_lin',
  method: 'bribe',
  bribeAmount: 300,
  assetRole: 'valet'
});
assert.strictEqual(assetRes.ok, true, '收买侍从应当成功');
assert.strictEqual(assetRes.asset.assetId, 'servant_lin');
assert.strictEqual(assetRes.totalAssets, 1);

// 4. 截获调兵封锁密函
const dispRes = WA.covertEspionage.operateSpy({
  spyId: 'fox_007',
  action: 'interceptDispatch',
  dispatchId: 'disp-garrison-01',
  sender: 'governor',
  recipient: 'commander',
  content: '即日起全面封锁总督要塞全域商路，严控一切粮草进出！'
});
assert.strictEqual(dispRes.ok, true, '截获密函应当成功');
assert.strictEqual(dispRes.content.includes('全面封锁'), true);

// 5. 密函引爆宏观贸易冲击 (OPV19-1)
// 先标记商路受阻
WA.economy.markRoute('route-main', false, { reason: '戒严封锁' });
const shockRes = WA.economy.simulateTradeShock('总督要塞', {
  resource: '粮草',
  severity: 3.5,
  blockade: true
});
assert.strictEqual(shockRes.ok, true, '贸易冲击应当成功引爆');
assert.strictEqual(shockRes.newPrice >= 35, true, '粮价应暴涨至 35+');
assert.strictEqual(shockRes.remainingStock < 120, true, '粮草库存应大幅受损');

// 6. 散布假情报反间计
const disRes = WA.covertEspionage.operateSpy({
  spyId: 'fox_007',
  action: 'plantDisinformation',
  targetFaction: 'garrison_guard',
  disinformationText: '叛军主力已向北门集结，南门守备空虚系诱敌之计。'
});
assert.strictEqual(disRes.ok, true, '散布反间计应当成功');
assert.strictEqual(disRes.totalPlanted, 1);

// 提示词注入块构建检查
const block = WA.covertEspionage.buildBlock();
assert.strictEqual(block.includes('老张厨役'), true, '注入块应包含潜伏暗线老张厨役');

// ─────────────────────────────────────────────────────────────
// 7. 4 项真实破坏性真负控制门禁
console.log('[Scenario 39] 验证 4 项真实破坏性负控制门禁...');

// 负控制 1：掩护完整度为 0 且无文牒潜入高密据点 -> 必当场识破扣押
const nakedSpyRes = WA.covertEspionage.registerSpy({
  actorId: 'naked_infiltrator',
  coverName: '流民甲',
  coverIntegrity: 0
});
const caughtRes = WA.covertEspionage.operateSpy({
  spyId: 'naked_infiltrator',
  action: 'infiltrate',
  locationId: 'secret_armory',
  securityLevel: 80,
  hasPermit: false
});
assert.strictEqual(caughtRes.ok, false, '破绽百出者强行潜入必须被拒');
assert.strictEqual(caughtRes.captured, true, '必须当场被捕');
assert.strictEqual(caughtRes.refusal, 'compromised-cover-detected', '拒绝码必须严密断言');

// 负控制 2：已捕获的间谍无法再执行任何谍务行动
const actWhileCaptured = WA.covertEspionage.operateSpy({
  spyId: 'naked_infiltrator',
  action: 'plantDisinformation',
  targetFaction: 'garrison',
  disinformationText: '放我出去！'
});
assert.strictEqual(actWhileCaptured.ok, false, '被俘间谍不可行动');
assert.strictEqual(actWhileCaptured.reason, 'spy-captured-cannot-act');

// 负控制 3：空头支票收买眼线（bribe 且金额 <= 0）必须被拒
const cheapBribe = WA.covertEspionage.operateSpy({
  spyId: 'fox_007',
  action: 'cultivateAsset',
  targetActorId: 'guard_captain',
  method: 'bribe',
  bribeAmount: 0
});
assert.strictEqual(cheapBribe.ok, false, '零资金贿赂必须拦截');
assert.strictEqual(cheapBribe.refusal, 'bribe-requires-funds');

// 负控制 4：物资充沛且商路通达时，严禁无端贸易恐慌冲击
WA.economy.stock('安定镇', '食盐', 80, { base: 5 });
const falseShock = WA.economy.simulateTradeShock('安定镇', { resource: '食盐', severity: 2.0 });
assert.strictEqual(falseShock.ok, false, '商路通达且库存充沛时不应允许无端恐慌冲击');
assert.strictEqual(falseShock.refusal, 'stable-supply-no-shock');

console.log('[Scenario 39] 场景 39 全链路断言与 4 项破坏性负控制门禁全量通过！PASS');
