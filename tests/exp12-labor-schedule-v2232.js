'use strict';
// EXP-12 / OP-3: 劳动与日程结算专锁。同一段时间只能花一次，跨业务时段排他。
const fs = require('fs');
const path = require('path');
const PR = 'engines/labor-schedule.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  W.laborSchedule.setSettings({ enabled: true });

  W.store.transact(function (d) {
    d.people = d.people || {};
    ['甲', '乙', '丙'].forEach(function (name) {
      d.people['p_' + name] = { id: 'p_' + name, name: name };
    });
    return true;
  }, 'exp12:seed');

  return W;
}

async function runAll(a) {
  const W = env();

  // 1. 纯读 view() 零写入
  const snap1 = JSON.stringify(W.store.get());
  const v0 = W.laborSchedule.view({ who: '甲', day: 1 });
  const snap2 = JSON.stringify(W.store.get());
  a(snap1 === snap2, 'view 纯读零写入');
  a(v0 && v0.ok && v0.count === 0, '初始状态零占用');

  // 2. 正常预约排班
  const c1 = W.laborSchedule.claim({ who: '甲', day: 1, slot: 'morning', task: '外勤勘察', kind: 'survey' });
  a(c1 && c1.ok && c1.booking, '甲成功预约第 1 天上午');
  const bid1 = c1.booking.id;

  const c2 = W.laborSchedule.claim({ who: '甲', day: 1, slot: 'afternoon', task: '作坊生产', kind: 'production' });
  a(c2 && c2.ok, '甲成功预约第 1 天下午');

  // 3. 冲突互斥验收：甲同一天上午不能再预约生产
  const cConflict = W.laborSchedule.claim({ who: '甲', day: 1, slot: 'morning', task: '加急生产', kind: 'production' });
  a(!cConflict.ok && cConflict.reason === 'slot-conflict', '同一人同时段冲突被拒收');
  a(cConflict.conflictWith && cConflict.conflictWith.task === '外勤勘察', '冲突报出具体占用的任务详情');

  // 4. 换班交接验收：甲将上午的勘察转交给乙
  const tr1 = W.laborSchedule.transfer(bid1, '乙');
  a(tr1 && tr1.ok, '成功将任务换班交接给乙');
  const v甲 = W.laborSchedule.view({ who: '甲', day: 1 });
  a(!v甲.bookings.some(b => b.slot === 'morning'), '换班后甲上午时段已释放');
  const v乙 = W.laborSchedule.view({ who: '乙', day: 1 });
  a(v乙.bookings.some(b => b.slot === 'morning' && b.task === '外勤勘察'), '换班后乙接手了上午的勘察任务');

  // 5. 换班冲突防护：若丙上午已有安排，再转交给丙必被拒，且乙的排班保持
  W.laborSchedule.claim({ who: '丙', day: 1, slot: 'morning', task: '看管药圃', kind: 'care' });
  const trFail = W.laborSchedule.transfer(bid1, '丙');
  a(!trFail.ok && trFail.reason === 'target-has-conflict', '目标已有冲突时换班被拒绝');
  const v乙Check = W.laborSchedule.view({ who: '乙', day: 1 });
  a(v乙Check.bookings.some(b => b.id === bid1), '换班失败原责任人保持不变');

  // 6. 推进故事日
  const adv = W.laborSchedule.advanceDay();
  a(adv && adv.ok && adv.currentDay === 2, '故事日推进到第 2 天');
  // 第 2 天甲上午恢复空闲
  const cDay2 = W.laborSchedule.claim({ who: '甲', day: 2, slot: 'morning', task: '新一日工作' });
  a(cDay2 && cDay2.ok, '推进新一日后甲上午可重新预约');

  // 7. 行动桌路由验证
  if (W.actionDesk && typeof W.actionDesk.plan === 'function') {
    const routeClaim = W.actionDesk.plan('schedule.claim', {
      who: '乙',
      day: 2,
      slot: 'afternoon',
      task: '研究实验'
    });
    a(routeClaim && routeClaim.ok, '行动桌成功路由 schedule.claim');
  }
}

// 负控制变异
const mutations = [
  ['conflict-guard-bypass', 'if (conflict) {',
    'if (false) {',
    function (W) {
      W.laborSchedule.claim({ who: '甲', day: 1, slot: 'morning', task: 'T1' });
      const c = W.laborSchedule.claim({ who: '甲', day: 1, slot: 'morning', task: 'T2' });
      return !c.ok && c.reason === 'slot-conflict';
    }
  ],
  ['target-conflict-bypass', 'if (toConflict) {',
    'if (false) {',
    function (W) {
      const c = W.laborSchedule.claim({ who: '甲', day: 1, slot: 'morning', task: 'T1' });
      W.laborSchedule.claim({ who: '乙', day: 1, slot: 'morning', task: 'T2' });
      const tr = W.laborSchedule.transfer(c.booking.id, '乙');
      return !tr.ok && tr.reason === 'target-has-conflict';
    }
  ]
];

async function runNegative(a) {
  for (const [name, anchor, replacement, criterion] of mutations) {
    const source = fs.readFileSync(path.join(BASE, PR), 'utf8');
    a(criterion(env()), name + ': 原版真判据通过');
    if (source.split(anchor).length !== 2) throw new Error(name + ': nonunique mutation anchor');
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
  console.log('EXP12-OPT3: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();