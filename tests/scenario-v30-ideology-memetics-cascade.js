/**
 * WorldAxis tests/scenario-v30-ideology-memetics-cascade.js
 * V17 场景 30 终验专锁：意识形态模因共振与信仰狂热传播专锁
 *
 * 核心验证：
 *  1. 模因宣讲与群体狂热裂变 (EXV17-4)
 *  2. 区域智识启蒙与富庶度防御
 *  3. 狂热审判态（fanatic-frenzy）阶段跃迁
 *  4. 真实破坏性负控制硬门禁 (NC-1 ~ NC-3):
 *     - NC-1: 智识启蒙度极高区域（enlightenment >= 80），理性免疫直接阻断低质煽动
 *     - NC-2: 民众安居乐业富庶区域（contentment >= 85），末日狂热煽动无法立足
 *     - NC-3: 空模因键广播断言拒收
 */

'use strict';

const assert = require('assert');
const path = require('path');

require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();

if (WA.store && typeof WA.store.init === 'function') WA.store.init();
if (WA.actionDesk && typeof WA.actionDesk.setSettings === 'function') {
  WA.actionDesk.setSettings({ enabled: true });
}

const ideologyMemetics = require('../engines/ideology-memetics.js');

let passCount = 0;
let failCount = 0;

function it(desc, fn) {
  try {
    fn();
    console.log('  ✓ ' + desc);
    passCount++;
  } catch (err) {
    console.error('  ✗ ' + desc + ' -> ' + err.message);
    failCount++;
  }
}

console.log('=== 开始执行 V17 场景 30 专锁：意识形态模因与狂热审判风暴 ===\n');

try {
  ideologyMemetics.resetAll();

  it('1. 模因宣讲在贫困落后区域迅速裂变并进入狂热审判态', function () {
    ideologyMemetics.setRegionalSociology('slum_district', {
      enlightenment: 25.0,
      contentment: 15.0
    });

    const res = WA.actionDesk.plan('culture.broadcastMeme', {
      memeKey: 'meme_purifying_flame',
      regionId: 'slum_district',
      dogmaName: '净世圣火教',
      dogmaContent: '一切苦难皆因不洁，唯有圣火涤罪方得升华',
      intensity: 85.0
    });

    assert.strictEqual(res.ok, true, '模因宣讲应成功');
    assert.strictEqual(res.isFrenzy, true, '狂热度超标应触发狂暴审判态');
    assert.strictEqual(res.infectionStage, 'fanatic-frenzy');
    assert.strictEqual(res.totalAdherents > 0, true);
  });

  it('2. [负控制 NC-1] 智识启蒙高等学府区域，极端模因断言被理性免疫自然阻断', function () {
    ideologyMemetics.setRegionalSociology('grand_library_district', {
      enlightenment: 90.0,
      contentment: 70.0
    });

    const res = WA.actionDesk.plan('culture.broadcastMeme', {
      memeKey: 'meme_witchcraft_heresy',
      regionId: 'grand_library_district',
      dogmaContent: '凡读书思辨皆为罪恶',
      intensity: 60.0
    });

    assert.strictEqual(res.ok, false, '高等学府应免疫低劣模因');
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.reason, 'rational-immunity-enlightened');
  });

  it('3. [负控制 NC-2] 民众安居乐业富庶区域，末日煽动断言被富足免疫自然阻断', function () {
    ideologyMemetics.setRegionalSociology('peaceful_valley', {
      enlightenment: 60.0,
      contentment: 92.0
    });

    const res = WA.actionDesk.plan('culture.broadcastMeme', {
      memeKey: 'meme_doomsday_cult',
      regionId: 'peaceful_valley',
      dogmaContent: '大难临头，捐献所有粮草可免天谴',
      intensity: 65.0
    });

    assert.strictEqual(res.ok, false, '安居乐业民众应免疫末日蛊惑');
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.reason, 'rational-immunity-contentment');
  });

  it('4. [负控制 NC-3] 广播缺失 memeKey 的非法请求断言直接拒收', function () {
    const res = WA.actionDesk.plan('culture.broadcastMeme', {
      memeKey: '',
      regionId: 'slum_district'
    });

    assert.strictEqual(res.ok, false);
  });

} catch (e) {
  console.error('专锁执行异常:', e);
  failCount++;
}

console.log(`\n测试汇总: 通过 = ${passCount}, 失败 = ${failCount}`);

if (failCount > 0) {
  console.error('❌ 场景 30 专锁测试未全部通过！');
  process.exit(1);
} else {
  console.log('🎉 场景 30 专锁 100% 全部通过！');
}