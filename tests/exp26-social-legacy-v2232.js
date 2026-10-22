'use strict';
// WorldAxis tests/exp26-social-legacy-v2232.js
// 验证 IN-8 社会遗产：遗产形成、承接、见证版本、追溯、真变异负控制

const fs = require('fs');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  return W;
}

let pass = 0, fail = 0;
function a(desc, cond) {
  if (cond) pass++;
  else { fail++; console.error('FAIL: ' + desc); }
}

async function runPositive() {
  const W = env();

  a('socialLegacy 模块已加载', !!W.socialLegacy);
  a('formLegacy 为函数', typeof W.socialLegacy.formLegacy === 'function');
  a('acceptLegacy 为函数', typeof W.socialLegacy.acceptLegacy === 'function');
  a('witnessAccount 为函数', typeof W.socialLegacy.witnessAccount === 'function');

  // 1. 形成遗产
  const l1 = W.socialLegacy.formLegacy({
    legacyType: 'unfinished-work',
    sourceEventId: 'evt_bridge_project',
    originator: '张三',
    description: '未完成的东桥修缮项目'
  });
  a('遗产形成成功', l1 && l1.ok);
  a('遗产有来源事件', l1.legacy.sourceEventId === 'evt_bridge_project');
  a('遗产初始状态 pending', l1.legacy.acceptStatus === 'pending');

  // 拒绝无来源
  const lBad = W.socialLegacy.formLegacy({
    legacyType: 'named-item', originator: '李四'
  });
  a('无来源事件被拒绝', lBad && !lBad.ok && lBad.reason === 'missing-fields');

  // 拒绝未知类型
  const lBad2 = W.socialLegacy.formLegacy({
    legacyType: 'magic', sourceEventId: 'x', originator: 'y'
  });
  a('未知遗产类型被拒绝', lBad2 && !lBad2.ok && lBad2.reason === 'bad-legacy-type');

  // 2. 见证者登记（不同版本）
  W.socialLegacy.witnessAccount(l1.legacy.id, '王五', '张三为人勤恳，项目几乎完成');
  W.socialLegacy.witnessAccount(l1.legacy.id, '赵六', '张三离开了，项目烂尾');

  const v1 = W.socialLegacy.viewLegacy(l1.legacy.id);
  a('viewLegacy 返回 ok', v1 && v1.ok);
  a('有2个见证描述', v1.witnessAccounts.length === 2);
  a('王五版本与赵六不同', v1.witnessAccounts[0].account !== v1.witnessAccounts[1].account);

  // 3. 承接遗产
  const ac1 = W.socialLegacy.acceptLegacy(l1.legacy.id, {
    successor: '李四',
    status: 'accepted',
    acceptScope: ['bridge', 'materials'],
    note: '接手继续修缮'
  });
  a('承接成功', ac1 && ac1.ok && ac1.status === 'accepted');

  // 已决定不能重复
  const ac2 = W.socialLegacy.acceptLegacy(l1.legacy.id, {
    successor: '王五', status: 'declined'
  });
  a('已决定的遗产不能重复承接', ac2 && !ac2.ok && ac2.reason === 'already-decided');

  // 4. legaciesOf
  const of1 = W.socialLegacy.legaciesOf('张三');
  a('legaciesOf 返回1条', of1 && of1.count === 1);

  // 5. 行动桌路由联通
  const deskRes = W.actionDesk.plan('socialLegacy.viewLegacy', { legacyId: l1.legacy.id });
  a('行动桌 socialLegacy.viewLegacy 路由成功', deskRes && deskRes.ok);

  // 6. 拒绝遗产（另造一个）
  const l2 = W.socialLegacy.formLegacy({
    legacyType: 'facility',
    sourceEventId: 'evt_workshop_built',
    originator: '老李',
    description: '公共工坊'
  });
  const ac3 = W.socialLegacy.acceptLegacy(l2.legacy.id, {
    successor: '小王', status: 'declined', note: '不愿接手'
  });
  a('拒绝遗产成功', ac3 && ac3.ok && ac3.status === 'declined');

  // 7. 重新解释
  const l3 = W.socialLegacy.formLegacy({
    legacyType: 'named-item',
    sourceEventId: 'evt_sword_forge',
    originator: '铁匠赵',
    description: '一把名剑'
  });
  const ac4 = W.socialLegacy.acceptLegacy(l3.legacy.id, {
    successor: '后人甲', status: 'reinterpreted', acceptScope: ['display'], note: '改为纪念品'
  });
  a('重新解释成功', ac4 && ac4.ok && ac4.status === 'reinterpreted');
}

async function runNegative() {
  const filePath = path.resolve(__dirname, '../engines/social-legacy.js');
  const rawCode = fs.readFileSync(filePath, 'utf8');

  // 变异 1: 破坏 already-decided 检查（允许重复承接）
  const anchor1 = "if (leg.acceptStatus !== 'pending') return { ok: false, reason: 'already-decided', status: leg.acceptStatus };";
  if (rawCode.split(anchor1).length < 2) throw new Error('anchor1 not found or duplicate');
  const mutated1 = rawCode.replace(anchor1, "// already-decided check removed");

  const W1 = env({ 'engines/social-legacy.js': mutated1 });
  const l1 = W1.socialLegacy.formLegacy({
    legacyType: 'named-item', sourceEventId: 'evt_x', originator: '甲', description: 'test'
  });
  W1.socialLegacy.acceptLegacy(l1.legacy.id, { successor: '乙', status: 'accepted' });
  const r2 = W1.socialLegacy.acceptLegacy(l1.legacy.id, { successor: '丙', status: 'declined' });
  a('负控制1: already-decided 破坏后可重复承接（证明判据真在守）', r2 && r2.ok);

  // 变异 2: 破坏 sourceEventId 必须检查
  const anchor2 = "if (!legacyType || !sourceEventId || !originator) return { ok: false, reason: 'missing-fields' };";
  if (rawCode.split(anchor2).length < 2) throw new Error('anchor2 not found or duplicate');
  const mutated2 = rawCode.replace(anchor2, "if (!legacyType || !originator) return { ok: false, reason: 'missing-fields' };");

  const W2 = env({ 'engines/social-legacy.js': mutated2 });
  const l2 = W2.socialLegacy.formLegacy({
    legacyType: 'named-item', originator: '甲', description: '无来源'
  });
  a('负控制2: 来源检查破坏后无来源也可形成遗产（证明判据真在守）', l2 && l2.ok);
}

(async function main() {
  console.log('[exp26-social-legacy] 开始正向功能测试...');
  await runPositive();
  console.log('[exp26-social-legacy] 开始真变异负控制测试...');
  await runNegative();
  console.log('[exp26-social-legacy] 测试完成: pass=' + pass + ', fail=' + fail);
  process.exitCode = fail ? 1 : 0;
})();