'use strict';
// EXP-11 / OP-2: 能力—工具—行动结果联动专锁。真 training/gear/act 消费，无 mock。
const fs = require('fs');
const path = require('path');
const PR = 'engines/action-methods.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.training.setSettings({ enabled: true });
  W.gear.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });
  W.actionMethods.setSettings({ enabled: true });

  W.store.transact(function (d) {
    // 种子人物：甲（新手）、乙（熟练者）、丙（借入者）
    d.people = d.people || {};
    ['甲', '乙', '丙'].forEach(function (name) {
      d.people['p_' + name] = { id: 'p_' + name, name: name, resources: { '合金': 50 } };
    });
    // 注册能力实体与物品实体定义（训练和物件的真源必须在 entities 里）
    d.evolution = d.evolution || {};
    d.evolution.entityMemory = d.evolution.entityMemory || {};
    d.evolution.entityMemory.ability = [
      { id: 'ab_repair', name: '修理', mode: 'stage', stageNames: ['初学', '入门', '熟练', '精通'] }
    ];
    d.evolution.entityMemory.object = [
      { id: 'obj_wrench', name: '扳手', kind: '工具' }
    ];
    return true;
  }, 'exp11:seed');

  // 初始化 training 声明
  W.training.declare('修理', { mode: 'stage', stageNames: ['初学', '入门', '熟练', '精通'] });
  // 乙设定为熟练阶段 (stage 2)
  W.store.transact(function (d) {
    d.training = d.training || { abilities: [], rows: [] };
    d.training.rows.push({
      who: '乙',
      ability: '修理',
      mode: 'stage',
      points: 0,
      stage: 2,
      sessions: 6
    });
    return true;
  }, 'exp11:training_seed');

  return W;
}

async function runAll(a) {
  const W = env();

  // 1. 制造工具：toolGood（完好，耐久10）
  const m1 = W.gear.make('扳手', { holder: '甲', durability: 10, maxDurability: 10 });
  a(m1 && m1.ok, 'toolGood 制造成功');
  const toolGood = m1.id;

  // 制造工具并用坏：toolBroken（耐久归0）
  const m2 = W.gear.make('扳手', { holder: '乙', durability: 2, maxDurability: 10 });
  a(m2 && m2.ok, 'toolBroken 基础制造成功');
  const toolBroken = m2.id;
  const useDown = W.gear.use(toolBroken, { by: '乙', wear: 2 });
  a(useDown && useDown.ok && useDown.durability === 0, 'toolBroken 已通过真实使用磨损至耐久 0');

  // 2. 场景 A 验收：新手甲 + 完好工具
  //    纯读评估 evaluate：前后状态逐字不变
  const snapBefore = JSON.stringify(W.store.get());
  const resA = W.actionMethods.evaluate('task:repair', '甲', { gearId: toolGood });
  const snapAfter = JSON.stringify(W.store.get());
  a(snapBefore === snapAfter, '评估过程纯读零写入');
  a(resA && resA.ok, '场景 A 评估成功');
  a(resA.available.some(m => m.methodId === 'novice_tool'), '新手甲+完好工具开放新手照图检修路径');
  a(resA.blocked.some(m => m.methodId === 'expert_improvise'), '新手甲被阻断熟练替代路径（能力不足）');
  a(resA.blocked.some(m => m.methodId === 'expert_standard'), '新手甲被阻断熟练精修路径（能力不足）');

  // 3. 场景 B 验收：熟练者乙 + 损坏工具
  const resB = W.actionMethods.evaluate('task:repair', '乙', { gearId: toolBroken });
  a(resB && resB.ok, '场景 B 评估成功');
  a(resB.available.some(m => m.methodId === 'expert_improvise'), '熟练者乙+损坏工具开放应急替代路径');
  a(resB.blocked.some(m => m.methodId === 'novice_tool'), '损坏工具阻断需工具路径（worn-out）');
  a(resB.blocked.some(m => m.methodId === 'expert_standard'), '损坏工具阻断需工具路径（worn-out）');

  // 4. 场景 C 验收：熟练者乙 + 完好工具
  const m3 = W.gear.make('扳手', { holder: '乙', durability: 8, maxDurability: 10 });
  const toolGood2 = m3.id;
  const resC = W.actionMethods.evaluate('task:repair', '乙', { gearId: toolGood2 });
  a(resC && resC.ok, '场景 C 评估成功');
  a(resC.available.length >= 2, '熟练者+好工具产生至少两条可用路径（标准精修 + 应急替代）');
  a(resC.available.some(m => m.methodId === 'expert_standard'), '熟练者开放熟练精修路径');
  a(resC.available.some(m => m.methodId === 'expert_improvise'), '熟练者同时保留应急替代路径');

  // 5. 借出即失权验收：甲把 toolGood 借给丙
  const lendRes = W.gear.lend(toolGood, '丙', { from: '甲' });
  a(lendRes && lendRes.ok, '工具成功借出');
  const resALent = W.actionMethods.evaluate('task:repair', '甲', { gearId: toolGood });
  a(resALent && resALent.ok, '借出后评估成功返回');
  a(!resALent.available.some(m => m.methodId === 'novice_tool'), '工具借出后原持有人无法使用该工具路径');
  a(resALent.blocked.some(m => m.reasons.some(r => r.includes('not-holder'))), '借出后原持有人显示 not-holder 阻断原因');

  // 6. 执行提交与单次磨损验收：
  //    选择 execute 执行 expert_standard，消耗耐久 1
  function getDur(id) { const it = (W.gear.view().items || []).filter(x => x.id === id)[0]; return it ? it.durability : null; }
  const durBefore = getDur(toolGood2);
  const execRes = W.actionMethods.execute('task:repair', '乙', 'expert_standard', { gearId: toolGood2 });
  a(execRes && execRes.ok, '执行提交成功');
  a(execRes.path === 'path:expert_standard', '产出指定解法路径');
  const durAfter = getDur(toolGood2);
  a(durAfter === durBefore - 1, '执行后工具耐久恰好磨损设定值且单一真源持久化');

  // 7. 应急替代执行：不消耗工具耐久
  const execImprovise = W.actionMethods.execute('task:repair', '乙', 'expert_improvise', { gearId: toolGood2 });
  a(execImprovise && execImprovise.ok, '应急替代执行成功');
  const durAfter2 = getDur(toolGood2);
  a(durAfter2 === durAfter, '应急替代路径未损耗专业工具');

  // 8. 路由接入验证：通过 actionDesk 路由执行 method.execute
  if (W.actionDesk && typeof W.actionDesk.plan === 'function') {
    const routeRes = W.actionDesk.plan('method.execute', {
      taskId: 'task:repair',
      who: '乙',
      methodId: 'expert_improvise'
    });
    a(routeRes && routeRes.ok, '行动桌成功路由 method.execute');
  }
}

// 负控制变异
const mutations = [
  ['eval-writes', 'stat.evaluations++;',
    'stat.evaluations++; if (WA.store && WA.store.transact) { WA.store.transact(function(d){ d.__corrupt=1; return true; }, "leak"); }',
    function (W) {
      const snap1 = JSON.stringify(W.store.get());
      W.actionMethods.evaluate('task:repair', '甲', {});
      const snap2 = JSON.stringify(W.store.get());
      return snap1 === snap2;
    }
  ],
  ['ability-guard-bypass', 'if (abilityStage < minStage) {',
    'if (false) {',
    function (W) {
      // 甲是新手持好工具，如果能力守卫被绕过，expert_standard 就会错误地变为可用
      const m = W.gear.make('扳手', { holder: '甲', durability: 10 });
      const res = W.actionMethods.evaluate('task:repair', '甲', { gearId: m.id });
      return !res.available.some(m => m.methodId === 'expert_standard');
    }
  ],
  ['gear-durability-bypass', 'if (!gearOk) {',
    'if (false) {',
    function (W) {
      // 损坏工具不应通过需要工具的方法
      const m = W.gear.make('扳手', { holder: '乙', durability: 1 });
      W.gear.use(m.id, { by: '乙', wear: 1 });
      const res = W.actionMethods.evaluate('task:repair', '乙', { gearId: m.id });
      return !res.available.some(m => m.methodId === 'novice_tool');
    }
  ],
  ['lend-loss-of-rights-bypass', 'gearOk = !!gCheck.pass;',
    'gearOk = true;',
    function (W) {
      // 借出后借出方不能用
      const m = W.gear.make('扳手', { holder: '甲', durability: 10 });
      W.gear.lend(m.id, '丙', { from: '甲' });
      const res = W.actionMethods.evaluate('task:repair', '甲', { gearId: m.id });
      return !res.available.some(m => m.methodId === 'novice_tool');
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
  console.log('EXP11-OPT2: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();