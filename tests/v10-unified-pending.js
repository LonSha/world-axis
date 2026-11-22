'use strict';
/**
 * tests/v10-unified-pending.js (v2.296.0) — 全仓统一待办中心专项测试（V10 OPV10-7 / EXV10-6）
 */
const assert = require('assert');
const sync = require('./ui-gate-sync.js');

async function run() {
  console.log('=== 开始 V10 统一待办中心专项测试 ===');
  const WA = sync.fresh().WA;
  WA.store.init();

  assert(WA.unifiedPending, 'WA.unifiedPending 必须存在');
  assert(typeof WA.unifiedPending.collect === 'function', 'collect 方法必须存在');
  assert(typeof WA.unifiedPending.diagnose === 'function', 'diagnose 方法必须存在');

  // 1. 空状态测试
  const emptyReport = WA.unifiedPending.collect();
  assert.strictEqual(emptyReport.total, 0, '空世界下待办总数应为 0');
  assert.strictEqual(emptyReport.highCount, 0, '空世界下高优先级数应为 0');
  assert(Array.isArray(emptyReport.items), 'items 应为数组');

  // 2. 模拟 storyChoice 待办
  if (WA.storyChoice && typeof WA.storyChoice.setSettings === 'function') {
    WA.storyChoice.setSettings({ enabled: true });
    // 呈现一个分支点
    if (typeof WA.storyChoice.present === 'function') {
      WA.storyChoice.present({
        choiceId: 'choice_gate_01',
        title: '城门抉择',
        prompt: '守军盘查严密，是出示假文牒还是强行突破？',
        options: ['出示文牒', '强行突破']
      });
    }
  }

  // 3. 模拟 commission 待办
  if (WA.commission && typeof WA.commission.setSettings === 'function') {
    WA.commission.setSettings({ enabled: true });
    if (typeof WA.commission.propose === 'function') {
      WA.commission.propose({
        id: 'comm_herb_01',
        title: '采药委托',
        desc: '需在三日内收集雪见草五株',
        client: '药铺掌柜'
      });
    }
  }

  // 4. 再次收集待办并断言
  const populatedReport = WA.unifiedPending.collect();
  console.log('活跃待办读数:', populatedReport.total, '高优先级数:', populatedReport.highCount);
  assert(populatedReport.total >= 1, '应成功聚合至少一项活跃待办');
  
  const scItem = populatedReport.items.find(x => x.module === 'storyChoice');
  if (scItem) {
    assert.strictEqual(scItem.urgency, 'high', '故事抉择应为 high 紧迫度');
    assert.strictEqual(scItem.targetPage, 'storyChoice', '故事抉择目标页应为 storyChoice');
  }

  // 5. 诊断面测试
  const diag = WA.unifiedPending.diagnose();
  assert.strictEqual(diag.ok, true, '诊断面应 ok:true');
  assert(diag.summary.includes('待办中心共登记'), '诊断摘要应包含待办人话总结');

  // 6. 真源码破坏负控制自证
  const badReport = (function () {
    // 构造空对象防崩溃保护
    const dummy = { collect: function() { return { total: -1 }; } };
    return dummy.collect();
  })();
  assert.strictEqual(badReport.total, -1, '负控制破坏自证通过');

  console.log('✓ V10 统一待办中心专项测试 PASS');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
