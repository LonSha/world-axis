#!/usr/bin/env node
// tests/living-world-v2237.js — Living World V6 专锁：
// 通用世界自治与深层人情（生态涟漪、人情势能债务、生计自愈闭环、久别重逢心理发酵、多感官痕迹）
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const BASE = path.join(__dirname, '..');
const LIVING_PATH = path.join(BASE, 'engines/living-world.js');
const ANCHOR = "b.ripples.push(rip);";

function runSuite() {
  try { if (global.localStorage && typeof global.localStorage.clear === 'function') global.localStorage.clear(); } catch (e) {}
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;

  WA.store.init();
  WA.actionDesk.setSettings({ enabled: true });
  WA.livingWorld.setSettings({
    enabled: true,
    rumorDiffusion: true,
    decayRounds: 4,
    peerInteractions: true,
    metabolicLoopEnabled: true
  });
  WA.elsewhere.setSettings({ enabled: true });
  WA.rumor.setSettings({ enabled: true });

  let tested = 0;
  function t(desc, cond) {
    assert(cond, desc);
    tested++;
  }

  // 1. 静态接口与 ActionDesk 路由检查
  t('propagateRipple 导出', typeof WA.livingWorld.propagateRipple === 'function');
  t('recordRelationalDebt 导出', typeof WA.livingWorld.recordRelationalDebt === 'function');

  // 2. 准备角色：苏晴（诊所/药铺）与张三（商贩/隔壁）
  WA.elsewhere.open('苏晴');
  WA.elsewhere.update('苏晴', {
    place: '街区小巷',
    doing: '清点出诊药箱',
    status: '神色疲惫',
    worry: '急缺药材'
  });
  WA.actionDesk.actFromScene({ actionId: 'livingWorld.registerRoutine', mode: 'execute', name: '苏晴', occupation: 'healer' });

  WA.elsewhere.open('张三');
  WA.elsewhere.update('张三', {
    place: '街区小巷',
    doing: '整理摊头货物',
    status: '寻常神色',
    worry: ''
  });
  WA.actionDesk.actFromScene({ actionId: 'livingWorld.registerRoutine', mode: 'execute', name: '张三', occupation: 'vendor' });

  // 3. 验证微观生计代谢自愈闭环（Metabolic Loop）：
  // 将苏晴的干粮清空，饥饿度拉高至 70，但腰间给足铜钱（24文）
  const stBefore = WA.store.get().livingWorld.characterStates['苏晴'];
  stBefore.vitalStrain.hunger = 70;
  stBefore.belongings.provisions = 0;
  stBefore.belongings.copper = 24;

  const tickRes = WA.livingWorld.autonomousTick({});
  t('推演步进成功', tickRes && tickRes.ok);
  t('代谢买粮自愈触发', tickRes.result.metabolicBuysCount >= 1);

  const stAfter = WA.store.get().livingWorld.characterStates['苏晴'];
  t('苏晴自愈后铜板减少', stAfter.belongings.copper < 24);
  t('苏晴饥饿度得到有效自愈控制', stAfter.vitalStrain.hunger < 70);

  // 4. 验证投石入水生态涟漪（propagateRipple）
  const ripRes = WA.actionDesk.actFromScene({
    actionId: 'livingWorld.propagateRipple',
    mode: 'execute',
    sourceWho: '苏晴',
    cause: '诊所遭逢突击盘查，药箱被扣',
    impactType: 'distress'
  });
  t('生态涟漪调度执行成功', ripRes && (ripRes.result ? ripRes.result.ok : ripRes.ok));

  const storeRip = WA.store.get();
  t('涟漪成功推入 livingWorld.ripples 记录', storeRip.livingWorld.ripples.length >= 1);
  const zsCard = storeRip.elsewhere.rows.find(x => x.name === '张三');
  t('同地缘的张三生活动机被涟漪级联偏折', zsCard.doing.includes('打探') || zsCard.worry.includes('提防'));

  // 5. 验证人情势能与债务沉淀（recordRelationalDebt）
  const debtRes = WA.actionDesk.actFromScene({
    actionId: 'livingWorld.recordRelationalDebt',
    mode: 'execute',
    fromWho: '苏晴',
    toWho: '张三',
    debtType: 'favor',
    amount: 2,
    reason: '借用推车搬运药材'
  });
  t('记录人情势能调度成功', debtRes && (debtRes.result ? debtRes.result.ok : debtRes.ok));
  const storeDebt = WA.store.get();
  const debtItem = storeDebt.livingWorld.relationalDebts.find(x => x.from === '苏晴' && x.to === '张三');
  t('人情恩义记录成功入账', !!debtItem && debtItem.amount >= 2);

  // 6. 验证久别重逢心理重力发酵（reunionSubtext）
  // 模拟久别（推演推进 4 轮，给苏晴施恩）
  WA.livingWorld.deflectTrajectory('苏晴', '潜心修整', '研读旧病案', { giveSilver: 10 });
  WA.livingWorld.autonomousTick({});
  WA.livingWorld.autonomousTick({});
  WA.livingWorld.autonomousTick({});
  WA.livingWorld.autonomousTick({});

  const encRes = WA.livingWorld.detectEncounters('街区小巷');
  t('偶遇探测成功', encRes && encRes.ok);
  const sqEnc = encRes.presentNPCs.find(x => x.name === '苏晴');
  t('捕获苏晴在场', !!sqEnc);
  t('久别重逢深层心理潜台词生成', sqEnc.reunionSubtext && sqEnc.reunionSubtext.includes('久别'));

  // 7. 多感官空间痕迹
  WA.livingWorld.leaveTrace('街区小巷', '张三', '摊位前残留未扫的包装细绳与微温茶盏');
  const encTrace = WA.livingWorld.detectEncounters('街区小巷');
  t('多感官痕迹被探测到', encTrace.recentTraces.some(tr => tr.trace.includes('微温') || tr.trace.includes('细绳')));

  // 8. 正文全景透镜（buildBlock）
  const prompt = WA.livingWorld.buildBlock('街区小巷');
  t('透镜包含久别重逢心理重力', prompt.includes('久别重逢心理重力'));
  t('透镜包含周遭突发事态生态涟漪', prompt.includes('周遭突发事态生态涟漪'));
  t('透镜包含眼前与周遭感官痕迹', prompt.includes('眼前与周遭生活痕迹'));

  return tested;
}

const passCount = runSuite();
console.log(`[PASS] living-world-v2237 测试通过！共执行 ${passCount} 项断言。`);

// 负控制变异测试
const src = fs.readFileSync(LIVING_PATH, 'utf8');
assert(src.includes(ANCHOR), `负控制锚点未找到: ${ANCHOR}`);

const broken = src.replace(
  ANCHOR,
  "// b.ripples.push(rip); 负控制破坏"
);

try {
  fs.writeFileSync(LIVING_PATH, broken, 'utf8');
  let threw = false;
  try {
    runSuite();
  } catch (err) {
    threw = true;
  }
  assert(threw, '负控制单行真变异（破坏生态涟漪推送）必须导致断言失败！');
  console.log('[PASS] living-world-v2237 负控制变异测试通过！');
} finally {
  fs.writeFileSync(LIVING_PATH, src, 'utf8');
}
