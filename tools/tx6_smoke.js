'use strict';
// TX6 冒烟脚本：多阶段委托、交付核验与资源履约（engines/commission.js v2.169.0）
const path = require('path');
process.chdir(path.resolve(__dirname, '..'));
const sync = require('../tests/ui-gate-sync.js');
var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('FAIL: ' + name); } }

var boot = sync.fresh({});
var WA = boot.WA;

// 1: 模块装载
ok('1: commission 装载', typeof WA.commission === 'object');

// 2: 默认关
// v2.518.0 收口补账：v2.412.0 全开策略把 203 引擎的**出厂默认**改成 enabled:true
//   （玩家装好即见全量世界），而本冒烟钉的是「闸关着时的行为」（下面几条 disabled
//   拒收判据）。断言「出厂默认是关」等于把一条已经不存在的口径钉下去 —— 保留它
//   只会让整条冒烟恒红，而真正的判据（关了就拒）反而没人看了。改为**显式关闸**
//   再验拒收：判据本身一个字未改，改的只是「谁来关」。
WA.commission.setSettings({ enabled: false });
ok('2: 默认关', WA.commission.getSettings().enabled === false);

// 3: 开启
WA.commission.setSettings({ enabled: true });
ok('3: 开启', WA.commission.getSettings().enabled === true);

// 4: create 多阶段委托
var c = WA.commission.create({
  title: '建造城墙',
  principal: '城主',
  agent: '工匠公会',
  stages: [
    { label: '采石', deliverable: '石料500方', verifyRule: 'freight:arrived', reward: 0 },
    { label: '砌墙', deliverable: '城墙完工', verifyRule: 'act:complete', reward: 0 },
    { label: '验收', deliverable: '验收通过', verifyRule: 'act:inspect', reward: 0 }
  ]
});
ok('4: create 成功', c.ok === true && c.stages === 3);

// 5: advance 阶段一→二
var a1 = WA.commission.advance(c.id, 'rec_001');
ok('5: advance 1→2', a1.ok === true && a1.receiptId === 'rec_001');

// 6: duplicate-receipt 拒收
var a2 = WA.commission.advance(c.id, 'rec_001');
ok('6: duplicate 拒收', a2.ok === false && a2.reason === 'duplicate-receipt');

// 7: advance 阶段二→三
var a3 = WA.commission.advance(c.id, 'rec_002');
ok('7: advance 2→3', a3.ok === true && a3.receiptId === 'rec_002');

// 8: advance 阶段三→completed
var a4 = WA.commission.advance(c.id, 'rec_003');
ok('8: advance 3→completed', a4.ok === true);

// 9: view
var v = WA.commission.view(c.id);
ok('9: view 成功', v.ok === true && v.title === '建造城墙');

// 10: settle
var s = WA.commission.settle(c.id);
ok('10: settle 成功', s.ok === true && s.paid === true);

// 11: already-settled
var s2 = WA.commission.settle(c.id);
ok('11: already-settled', s2.ok === false && s2.reason === 'already-settled');

// 12: cancel 另一个委托
var c2 = WA.commission.create({
  title: '运输物资',
  principal: '商队',
  agent: '镖局',
  stages: [
    { label: '出发', deliverable: '到达中转', verifyRule: 'act:arrive', reward: 0 }
  ]
});
var can = WA.commission.cancel(c2.id, '道路不通');
ok('12: cancel 成功', can.ok === true && can.reason === '道路不通');

// 13: diagnose
var dg = WA.commission.diagnose();
ok('13: diagnose closedLoop', dg.closedLoop === true && dg.checks.org === true);

console.log('\\nTX6 smoke: ' + pass + '/' + (pass + fail));
process.exit(fail > 0 ? 1 : 0);
