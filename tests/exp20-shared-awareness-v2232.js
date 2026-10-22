'use strict';
// WorldAxis tests/exp20-shared-awareness-v2232.js
// 验证 IN-3 共同知晓与默契：二阶认知、具名约定、缺席不自动加入、误会识别与真变异负控制

const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');

function freshEnv(override) {
  return uiGate.fresh({ srcOverride: override });
}

let pass = 0, fail = 0;
function assert(desc, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('FAIL: ' + desc);
  }
}

async function runPositive() {
  const env = freshEnv();
  const WA = env.WA;

  assert('sharedAwareness 模块已加载', !!WA.sharedAwareness);
  assert('assertMeta 为函数', typeof WA.sharedAwareness.assertMeta === 'function');
  assert('metaOf 为函数', typeof WA.sharedAwareness.metaOf === 'function');
  assert('openPact 为函数', typeof WA.sharedAwareness.openPact === 'function');
  assert('confirmPact 为函数', typeof WA.sharedAwareness.confirmPact === 'function');
  assert('coordination 为函数', typeof WA.sharedAwareness.coordination === 'function');

  // 1. 二阶认知登记与判定
  const r1 = WA.sharedAwareness.assertMeta('张三', '李四', 'fact_road_block', 'told-directly');
  assert('当面告知登记成功', r1 && r1.ok);

  const m1 = WA.sharedAwareness.metaOf('张三', '李四', 'fact_road_block');
  assert('张三认为李四知情', m1 && m1.assumes === true && m1.certainty === 'confirmed');

  const m2 = WA.sharedAwareness.metaOf('李四', '张三', 'fact_road_block');
  assert('李四并未被记录认为张三知情（单向二阶认知）', m2 && m2.assumes === false);

  const rInvalid = WA.sharedAwareness.assertMeta('张三', '王五', 'fact_road_block', 'hearsay');
  assert('不支持的无凭据登记被拒绝', rInvalid && !rInvalid.ok && rInvalid.reason === 'insufficient-basis');

  // 2. 具名协作约定与缺席排他
  const p1 = WA.sharedAwareness.openPact('escort_convoy', {
    title: '押送货队',
    factId: 'fact_road_block',
    participants: ['张三', '李四']
  });
  assert('协作约定创建成功', p1 && p1.ok && p1.pact.status === 'pending');

  const rOut = WA.sharedAwareness.confirmPact('escort_convoy', '赵六');
  assert('非参与人/缺席者无法确认约定', rOut && !rOut.ok && rOut.reason === 'not-a-participant');

  // 3. 协调状态推导：误会风险识别
  // 张三已自认李四知道封路，但李四未确认
  const c1 = WA.sharedAwareness.coordination('escort_convoy');
  assert('检测到单方误会风险（以为对方知道但对方未确认）', c1 && c1.state === 'misunderstanding');

  // 4. 全体确认完成闭环
  WA.sharedAwareness.confirmPact('escort_convoy', '张三');
  WA.sharedAwareness.confirmPact('escort_convoy', '李四');
  const c2 = WA.sharedAwareness.coordination('escort_convoy');
  assert('全体当面确认后进入 coordinated', c2 && c2.state === 'coordinated');

  // 5. 行动桌路由联通
  WA.actionDesk.setSettings({ enabled: true });
  const deskPlan = WA.actionDesk.plan('sharedAwareness.assertMeta', {
    who: '王五', target: '赵六', factId: 'bridge_collapse', basis: 'shared-presence'
  });
  assert('行动桌可调用 sharedAwareness.assertMeta', deskPlan && deskPlan.ok);
  const mDesk = WA.sharedAwareness.metaOf('王五', '赵六', 'bridge_collapse');
  assert('行动桌操作真实沉淀到共享认知', mDesk && mDesk.assumes === true && mDesk.certainty === 'probable');
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/shared-awareness.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 抹除 told-directly 凭据允许，破坏依据有效性
  const anchor1 = "const allowed = ['told-directly', 'shared-presence', 'saw-receipt'];";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "const allowed = [];");

  const env1 = freshEnv({ 'engines/shared-awareness.js': mutated1 });
  const WA1 = env1.WA;
  const neg1 = WA1.sharedAwareness.assertMeta('张三', '李四', 'fact_test', 'told-directly');
  assert('负控制1: 凭据门禁破坏后当面告知应被拒绝', neg1 && !neg1.ok && neg1.reason === 'insufficient-basis');

  // 变异 2: 破坏 coordinated 状态判断，使其永远为 pending
  const anchor2 = "p.status = p.confirmedBy.length >= p.participants.length ? 'coordinated' : 'pending';";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "p.status = 'pending';");

  const env2 = freshEnv({ 'engines/shared-awareness.js': mutated2 });
  const WA2 = env2.WA;
  WA2.sharedAwareness.openPact('pact_test', { participants: ['甲', '乙'] });
  WA2.sharedAwareness.confirmPact('pact_test', '甲');
  const cf2 = WA2.sharedAwareness.confirmPact('pact_test', '乙');
  assert('负控制2: 状态流转破坏后确认状态应滞留在 pending', cf2 && cf2.status === 'pending');
}

(async function main() {
  console.log('[exp20-shared-awareness] 开始正向功能测试...');
  await runPositive();
  console.log('[exp20-shared-awareness] 开始真变异负控制测试...');
  await runNegative();

  console.log('[exp20-shared-awareness] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();