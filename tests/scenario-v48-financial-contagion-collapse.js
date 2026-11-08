/**
 * WorldAxis tests/scenario-v48-financial-contagion-collapse.js
 * 场景 48：地下钱庄挤兑暴雷与黑市商业信用连环破产专锁 (Financial Contagion & Run on Bank)
 */
'use strict';

const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();

require('../engines/financial-contagion.js');
require('../engines/action-desk.js');

WA.actionDesk.setSettings({ enabled: true });

console.log('[Scenario 48] 开始执行地下钱庄挤兑暴雷与黑市商业信用连环破产专锁测试...');

WA.store.init();
WA.store.transact(draft => {
  draft.financialContagions = {
    banks: {},
    collapseLedger: []
  };
});

// 1. 负控制门禁 1：准备金极其充沛，挤兑被驳回
const resNoRun = WA.financialContagion.triggerRunOnBank({
  bankId: 'solid_bank_01',
  place: 'imperial_capital',
  cashReserves: 50000,
  issuedNotes: 50000,
  withdrawalDemand: 5000,
  panicIndex: 10,
  counterfeitRatio: 0.01
});
assert.strictEqual(resNoRun.ok, false, '准备金极其充沛时挤兑不应成功判定暴雷');
assert.strictEqual(resNoRun.refusal, 'reserves-sufficient-no-run', '应命中准备金充沛拒止码');
console.log('✓ 负控制门禁 1（准备金充沛刚性兑付拒止）验证通过');

// 2. 负控制门禁 2：缺少地点或银行标识
const resBadTarget = WA.financialContagion.triggerRunOnBank({
  bankId: '',
  place: ''
});
assert.strictEqual(resBadTarget.ok, false, '缺少参数时不应执行');
assert.strictEqual(resBadTarget.refusal, 'invalid-bank-target', '应命中参数缺失拒止码');
console.log('✓ 负控制门禁 2（缺少钱庄/地点标识拦截）验证通过');

// 3. 真实钱庄挤兑暴雷：准备金被瞬间击穿，恐慌与假币蔓延
const runResult = WA.financialContagion.triggerRunOnBank({
  bankId: 'underground_vault_blackstone',
  place: 'port_shadow_bay',
  cashReserves: 1000,
  issuedNotes: 15000,
  withdrawalDemand: 8000,
  panicIndex: 85,
  counterfeitRatio: 0.45
});
assert.strictEqual(runResult.ok, true, '挤兑计算应当成功');
assert.strictEqual(runResult.data.isDefault, true, '流动性缺口巨大应当违约破产');
assert.strictEqual(runResult.data.status, 'insolvent', '状态应转为 insolvent');
assert(runResult.data.liquidityDeficit >= 7000, '赤字缺口应正确计算');
assert(runResult.data.priceInflationMultiplier > 1.0, '全城物价应产生通胀乘数效应');
console.log('✓ 地下钱庄挤兑暴雷与流动性违约闭环验证通过');

// 4. 对已破产银行重复挤兑拦截
const repeatRun = WA.financialContagion.triggerRunOnBank({
  bankId: 'underground_vault_blackstone',
  place: 'port_shadow_bay',
  withdrawalDemand: 1000
});
assert.strictEqual(repeatRun.ok, false, '已破产银行不应重复发生挤兑');
assert.strictEqual(repeatRun.refusal, 'bank-already-insolvent', '应命中已破产拒止码');
console.log('✓ 已破产节点防重入负控制验证通过');

// 5. 紧急救市注资
const bailoutRes = WA.financialContagion.injectLiquidityBailout({
  bankId: 'underground_vault_blackstone',
  bailoutFunds: 100000
});
assert.strictEqual(bailoutRes.ok, true, '注资救市应成功');
assert.strictEqual(bailoutRes.status, 'bailed_out', '状态应转为 bailed_out');
console.log('✓ 紧急流动性注资救市验证通过');

// 6. ActionDesk 集中调度闭环
const adRun = WA.actionDesk.plan('finance.triggerRunOnBank', {
  bankId: 'iron_guild_treasury',
  place: 'mining_colony',
  cashReserves: 500,
  issuedNotes: 8000,
  withdrawalDemand: 3000,
  panicIndex: 80
});
assert.strictEqual(adRun.ok, true, 'ActionDesk 应成功分发挤兑操作');
assert.strictEqual(adRun.data.status, 'insolvent', '通过 ActionDesk 调度的钱庄应破产');
console.log('✓ ActionDesk 路由闭环调用验证通过');

// 7. Prompt 知觉提示词块
const block = WA.financialContagion.buildBlock();
assert(block.includes('地下金融与信用挤兑风暴'), '提示词块应包含标题');
assert(block.includes('物价乘数'), '提示词块应反映通胀影响');
console.log('✓ Prompt 知觉注入提示词块验证通过');

console.log('[Scenario 48] 地下钱庄挤兑暴雷与黑市商业信用连环破产专锁全部通过！');
