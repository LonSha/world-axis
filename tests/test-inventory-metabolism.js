/**
 * WorldAxis tests/test-inventory-metabolism.js
 * 随身行囊物理口袋约束与生理代谢疲劳时钟双引擎联合测试
 */
'use strict';
const assert = require('assert');

// 1. 加载随身行囊引擎
require('../engines/personal-inventory.js');
const invEngine = global.WorldAxis.personalInventory;
console.log('--- 开始 personal-inventory 行囊与物理约束测试 ---');
assert(invEngine && invEngine.version, '行囊引擎未正确加载');

const charId = 'test_hero';
const initialInv = invEngine.getInventory(charId);
assert(initialInv.cash === 3500, '初始现金异常');
assert(initialInv.pockets.length >= 3, '初始口袋物件不齐');

// 钥匙与门禁判定闭环
assert(invEngine.hasKey(charId, 'vip_key_01') === true, '钥匙链未检出 vip_key_01');
assert(invEngine.hasKey(charId, 'secret_vault_key') === false, '虚构钥匙误检出');

// 扣除现金用于通勤打车
const spendRes = invEngine.deductCash(charId, 1200);
assert(spendRes.ok && spendRes.balance === 2300, '通勤现金扣款失败');
const failSpend = invEngine.deductCash(charId, 99999);
assert(!failSpend.ok && failSpend.reason === 'insufficient_funds', '余额不足拦截失败');

// 口袋容量溢出拦截
const fillPocket1 = invEngine.addItem(charId, { name: '长柄防暴棍', size: 5 }, 'pockets');
assert(fillPocket1.ok === false && fillPocket1.reason === 'container_full', '口袋容量超限拦截失败');

// 夹层暗格隐蔽度
invEngine.addItem(charId, { id: 'secret_usb', name: '加密黑客U盘', size: 1, concealed: true, concealTier: 'deep' }, 'pockets');
const searchRoutine = invEngine.conductSearch(charId, 'routine');
const foundUsbRoutine = searchRoutine.foundItems.some(it => it.id === 'secret_usb');
assert(foundUsbRoutine === false, '深层夹层违禁品在常规盘查中被误搜出');

const feedInv = invEngine.buildInventoryFeed(charId);
assert(feedInv.indexOf('真皮钱夹') >= 0, '正文行囊透镜未渲染物品');
console.log('行囊透镜输出预览:\n' + feedInv);

// 2. 加载生理代谢时钟引擎
require('../engines/metabolism-clock.js');
const metaEngine = global.WorldAxis.metabolismClock;
console.log('--- 开始 metabolism-clock 生理代谢时钟测试 ---');
assert(metaEngine && metaEngine.version, '生理代谢引擎未正确加载');

// 醒觉熬夜推演 (连续清醒 16 小时)
metaEngine.advanceClock(charId, 6, { sleeping: false });
const stateTired = metaEngine.evaluateState(charId);
assert(stateTired.fatigueTier === 'tired' || stateTired.fatigueTier === 'exhausted', '长期熬夜未进入疲劳阶段');
assert(stateTired.actionPenalty > 0, '疲劳惩罚系数未生效');

// 居酒屋饮酒代谢测试
metaEngine.advanceClock(charId, 1, { drinkingUnits: 2, sleeping: false });
const stateDrunk = metaEngine.evaluateState(charId);
assert(stateDrunk.alcoholTier === 'tipsy' || stateDrunk.alcoholTier === 'drunk', '饮酒未产生醉酒阶段');

// 恶劣天气暴露导致受寒
metaEngine.advanceClock(charId, 2, { weather: 'rain', sheltered: false });
const stateChilled = metaEngine.evaluateState(charId);
assert(stateChilled.bodyTemp === 'chilled' || stateChilled.bodyTemp === 'hypothermic', '淋雨未触发失温警告');

// 睡眠恢复与清醒
metaEngine.advanceClock(charId, 8, { sleeping: true, sheltered: true });
const stateRecovered = metaEngine.evaluateState(charId);
assert(stateRecovered.fatigue === 0 && stateRecovered.fatigueTier === 'fresh', '充分睡眠未清空疲劳');
assert(stateRecovered.alcoholTier === 'sober', '长时间后酒精未完全代谢');
assert(stateRecovered.bodyTemp === 'normal', '室内避寒后体温未恢复正常');

console.log('✅ personal-inventory 与 metabolism-clock 全部联合测试通过！');
process.exit(0);
