'use strict';
/**
 * WorldAxis tests/v5-op-1-2-3.js (v2.239.0)
 * 专项锁定与门禁验证：
 *   - OPV5-1: 生态涟漪向宏观势力汇流 (propagateRipple -> evolution.factions vigilance/status)
 *   - OPV5-2: 人情势能债务在行动桌的折现兑付 (livingWorld.redeemDebt via actionDesk)
 *   - OPV5-3: 空间痕迹主动清理伪造与调查系统证据提取闭环 (cleanTrace & investigation.extractFromTrace via actionDesk)
 * 具备独立断言与严格单行真源码破坏负控制验证。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));

function createTestEnv(srcOverrides) {
  if (global.localStorage) global.localStorage.clear();
  const freshInst = gate.fresh({ srcOverride: srcOverrides || {} });
  const W = freshInst.WA;
  W.store.init();
  W.recipe.apply('historical');
  W.livingWorld.setSettings({ enabled: true, decayRounds: 5, peerInteractions: true });
  W.investigation.setSettings({ enabled: true });
  W.actionDesk.setSettings({ enabled: true });

  W.store.transact(function (draft) {
    draft.evolution.factions = [
      { name: '顺天巡捕营', scope: '东四牌楼', status: '稳固', vigilance: 20 },
      { name: '漕运总把口', scope: '通州码头', status: '稳固', vigilance: 15 }
    ];
    draft.elsewhere = draft.elsewhere || {};
    draft.elsewhere.rows = [
      { name: '赵掌柜', place: '东四牌楼', doing: '核算账本', worry: '盘缠见底' },
      { name: '钱六哥', place: '东四牌楼', doing: '沿街叫卖', worry: '生计艰难' },
      { name: '孙捕头', place: '通州码头', doing: '巡视关卡', worry: '私盐过境' }
    ];
    return true;
  }, 'test:seed');

  return W;
}

// 判据①：OPV5-1 局部生态危机向势力警戒状态传导
function testOPV5_1(W) {
  const r = W.livingWorld.propagateRipple('赵掌柜', '店铺遭乱民哄抢纵火', 'crisis', { place: '东四牌楼' });
  if (!r || !r.ok) return false;

  const s = W.store.get();
  const f1 = (s.evolution.factions || []).find(f => f.name === '顺天巡捕营');
  const f2 = (s.evolution.factions || []).find(f => f.name === '漕运总把口');

  // 顺天巡捕营位于东四牌楼，警戒度必须上升（基础20 + crisis 30 = 50）
  const f1Ok = f1 && f1.vigilance >= 50;
  // 危机同时记入涟漪的 escalatedFactions 回执中
  const receiptOk = r.ripple && Array.isArray(r.ripple.escalatedFactions) && r.ripple.escalatedFactions.length > 0;

  return !!(f1Ok && receiptOk);
}

// 判据②：OPV5-2 人情债务记录与行动桌折现兑付闭环
function testOPV5_2(W) {
  // 记录恩义人情
  const rec = W.actionDesk.plan('livingWorld.recordRelationalDebt', {
    fromWho: '赵掌柜',
    toWho: '孙捕头',
    debtType: 'favor',
    amount: 3,
    reason: '暗中垫付通关关税'
  });
  if (!rec || !rec.ok) return false;

  // 在行动桌折现兑付 2 点恩义
  const rdm = W.actionDesk.plan('livingWorld.redeemDebt', {
    fromWho: '赵掌柜',
    toWho: '孙捕头',
    debtType: 'favor',
    amount: 2,
    reason: '恳请网开一面免于盘查'
  });
  if (!rdm || !rdm.ok || rdm.remaining !== 1) return false;

  // 尝试超额兑现（剩余1，尝试兑现2），必须失败拒绝
  const failRdm = W.actionDesk.plan('livingWorld.redeemDebt', {
    fromWho: '赵掌柜',
    toWho: '孙捕头',
    debtType: 'favor',
    amount: 2,
    reason: '再次恳请放行'
  });
  if (failRdm.ok !== false || failRdm.reason !== 'insufficient-debt') return false;

  return true;
}

// 判据③：OPV5-3 空间痕迹的主动清理与调查提取
function testOPV5_3(W) {
  // 1. 留下痕迹
  const tr = W.actionDesk.plan('livingWorld.leaveTrace', {
    place: '东四牌楼',
    who: '神秘黑衣人',
    detail: '墙角留有极深刀劈刻印与私盐包装麻绳'
  });
  if (!tr || !tr.ok || !tr.trace) return false;

  // 2. 调查系统提取现场痕迹转化为线索与证据
  const ext = W.actionDesk.plan('investigation.extractFromTrace', {
    traceObj: tr.trace,
    person: '孙捕头',
    options: { receiptId: 'rcpt_trace_test_01' }
  });
  if (!ext || !ext.ok || !ext.evidenceId) return false;

  // 检查线索与证据库
  const clueId = ext.clueId;
  const chk = W.investigation.checkEvidence(clueId);
  if (!chk || !chk.ok || chk.count < 1) return false;

  // 3. 另一涉案人员对现场进行伪造和清理覆盖
  const cln = W.actionDesk.plan('livingWorld.cleanTrace', {
    place: '东四牌楼',
    who: '神秘黑衣人',
    options: { coverWho: '街头小贩', coverDetail: '案头仅摆放数个烂果皮与市井杂物，刀痕已被石灰抹平' }
  });
  if (!cln || !cln.ok || cln.cleanedCount < 1 || !cln.covered) return false;

  // 再次探测，原黑衣人痕迹已不在，仅存伪造小贩痕迹
  const enc = W.livingWorld.detectEncounters('东四牌楼');
  const hasOriginal = (enc.recentTraces || []).some(t => t.who === '神秘黑衣人' && !t.isCover);
  const hasCover = (enc.recentTraces || []).some(t => t.isCover === true);

  return (!hasOriginal && hasCover);
}

function runAll() {
  console.log('[v5-op-1-2-3] 开始运行正向断言...');
  const W = createTestEnv();

  assert(testOPV5_1(W), 'OPV5-1 判定失败：生态危机未能成功传导至势力警戒');
  assert(testOPV5_2(W), 'OPV5-2 判定失败：人情势能未能正确在行动桌折现兑付');
  assert(testOPV5_3(W), 'OPV5-3 判定失败：空间痕迹伪造清理与调查闭环未达成');

  console.log('[PASS] v5-op-1-2-3 所有正向断言全部通过！');
}

// 单行真源码破坏负控制变异测试
const mutations = [
  {
    name: 'OPV5-1_vigilance_mutated',
    file: 'engines/living-world.js',
    anchor: "fac.vigilance = Math.min(100, (typeof fac.vigilance === 'number' ? fac.vigilance : 20) + (imp === 'crisis' ? 30 : 15));",
    replacement: "/* mutated */ fac.vigilance = fac.vigilance;",
    criterion: testOPV5_1
  },
  {
    name: 'OPV5-2_redeemDebt_mutated',
    file: 'engines/living-world.js',
    anchor: "entry.amount = entry.amount - amt;",
    replacement: "/* mutated */ entry.amount = entry.amount;",
    criterion: testOPV5_2
  },
  {
    name: 'OPV5-3_cleanTrace_mutated',
    file: 'engines/living-world.js',
    anchor: "const matchTarget = !target || t.id === target || t.who === target;",
    replacement: "const matchTarget = false; /* mutated */",
    criterion: testOPV5_3
  }
];

function runNegative() {
  console.log('[v5-op-1-2-3] 开始运行单行真源码负控制破坏测试...');
  for (const mut of mutations) {
    const fullPath = path.join(BASE, mut.file);
    const originSrc = fs.readFileSync(fullPath, 'utf8');

    // 锚点唯一性断言
    const parts = originSrc.split(mut.anchor);
    assert.strictEqual(parts.length, 2, '锚点在文件中必须唯一: ' + mut.anchor);

    // 原版正常运行断言
    const envClean = createTestEnv();
    assert(mut.criterion(envClean), '原版代码必须通过判据: ' + mut.name);

    // 注入变异
    const mutatedSrc = originSrc.replace(mut.anchor, mut.replacement);
    const overrides = {};
    overrides[mut.file] = mutatedSrc;
    const envMutated = createTestEnv(overrides);

    // 变异破坏后必须判定失败
    const passUnderMutation = mut.criterion(envMutated);
    assert(!passUnderMutation, '代码受破坏后判据不得通过（防假绿）: ' + mut.name);

    // 验证原版文件逐字节未受污染
    const currentOnDisk = fs.readFileSync(fullPath, 'utf8');
    assert.strictEqual(currentOnDisk, originSrc, '磁盘文件必须严格保持原样: ' + mut.file);

    console.log('  ✓ 负控制通过: ' + mut.name);
  }
  console.log('[PASS] v5-op-1-2-3 负控制变异测试全部通过！');
}

runAll();
runNegative();
