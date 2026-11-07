/**
 * WorldAxis tests/scenario-v18-acoustic-whisper.js (v2.330.0)
 *
 * 场景 18 专锁：密室私密交谈、隔门声学阻抗窃听与视窗语义降噪裁剪
 *
 * 贯通引擎与机制闭环：
 *  1. 真实声学分贝与介质物理阻抗 (environmental-occlusion):
 *     耳语(whisper: 25dB)、正常交谈(talk: 55dB)、激烈争吵(quarrel: 75dB)；
 *     隔木门/隔断提供介质阻抗衰减与空气传播对数衰减；
 *  2. 隔墙窃听与信噪比截获判定 (spatial-acoustics):
 *     耳语穿透后分贝低于走廊背景白噪音(45dB)，信噪比为负，窃听彻底判定为 inaudible；
 *  3. 微观透镜语义安全降噪裁剪 (lens-culling):
 *     - 当室内为耳语时，走廊视界中该事件彻底被 culled（移除），杜绝大模型穿墙全知；
 *     - 当室内爆发争吵(75dB)时，声波突破阈值进入 muffled 状态，
 *       正文透镜将具体词义自动替换为模糊降噪文本（“隔板对面隐约传来激烈急促的争执闷响”），
 *       确保既传递了客观物理动静，又绝对保守了核心机密词句。
 *  4. 5 项真实破坏性负控制硬门禁：
 *     - [NC-1] 缺声学事件入参报 missing-sound-event；
 *     - [NC-2] 缺地点位置判定视线可见性报 missing-location；
 *     - [NC-3] 隐藏暗格物证在观察者感知不足时被 culled；
 *     - [NC-4] 极度超距传播声波信噪比为负报 inaudible；
 *     - [NC-5] 同室声学直传保留 full 原话不执行误降噪。
 */
'use strict';

const assert = require('assert');
const path = require('path');

// 引入被测生产引擎
require('../engines/environmental-occlusion.js');
const lensCulling = require('../engines/lens-culling.js');
const occlusion = global.WorldAxis.environmentalOcclusion;

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${desc}:`, err.message);
  }
}

console.log('=== 开始执行 V15 场景 18 专锁：密室私密交谈、声学阻抗与视窗降噪裁剪 ===');

// 1. 密室物理隔绝与视线遮蔽
it('1.1 密室内室与门外走廊被墙板门扉隔断，视线判定完全不可视 (occluded)', () => {
  const visRes = occlusion.canSee(
    { nodeId: 'secret_chamber', room: 'inner_room' },
    { nodeId: 'secret_chamber', room: 'outer_corridor' }
  );
  assert.strictEqual(visRes.visible, false);
  assert.strictEqual(visRes.occluded, true);
  assert.strictEqual(visRes.reason, 'room_partition');
});

// 2. 密室耳语密谋与声学彻底淹没
it('2.1 室内低语耳语 (25dB)，门外走廊底噪 45dB，声波彻底湮没并被语义透镜 culled', () => {
  const soundEvt = {
    sourceActorId: 'agent_alpha',
    soundLevel: 'whisper',
    sourceRoomId: 'inner_room',
    speechText: '三更时分，在西城水闸动手毁掉阵眼符箓。'
  };
  const listenerCtx = {
    listenerActorId: 'eavesdropper',
    listenerRoomId: 'outer_corridor',
    backgroundNoiseDb: 45
  };

  const cullRes = lensCulling.cullAcousticEvent(soundEvt, listenerCtx);
  assert.strictEqual(cullRes.ok, true);
  assert.strictEqual(cullRes.action, 'culled');
  assert.strictEqual(cullRes.audibleText, null);
});

// 3. 室内激烈争吵突破门板阻抗与模糊降噪
it('3.2 室内爆发争执争吵 (75dB)，穿透门板达到 muffled 级别，透镜输出模糊降噪文本', () => {
  const soundEvt = {
    sourceActorId: 'agent_alpha',
    soundLevel: 'quarrel',
    sourceRoomId: 'inner_room',
    speechText: '你疯了吗！提前动手所有人都会死无葬身之地！'
  };
  const listenerCtx = {
    listenerActorId: 'eavesdropper',
    listenerRoomId: 'outer_corridor',
    backgroundNoiseDb: 35
  };

  const cullRes = lensCulling.cullAcousticEvent(soundEvt, listenerCtx);
  assert.strictEqual(cullRes.ok, true);
  assert.strictEqual(cullRes.action, 'muffled');
  assert.ok(cullRes.audibleText.includes('争执闷响'));
  assert.strictEqual(cullRes.audibleText.includes('死无葬身之地'), false, '敏感原话必须被屏蔽过滤');
});

// 4. 真实破坏性负控制断言矩阵 (5 项)
it('4.1 [NC-1] 缺声学事件入参拒收 (missing-sound-event)', () => {
  const r = lensCulling.cullAcousticEvent(null, {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'missing-sound-event');
});

it('4.2 [NC-2] 缺地点位置判定视线可见性报 missing-location', () => {
  const r = occlusion.canSee(null, { nodeId: 'room_a' });
  assert.strictEqual(r.visible, false);
  assert.strictEqual(r.reason, 'missing-location');
});

it('4.3 [NC-3] 隐藏深层暗格密信在搜查者感知不足时被裁汰 (culled)', () => {
  const traceItem = {
    name: '通敌密信',
    concealed: true,
    concealThreshold: 75
  };
  const r = lensCulling.cullTraceFact(traceItem, { perception: 40 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.action, 'culled');
  assert.strictEqual(r.visibleTrace, null);
});

it('4.4 [NC-4] 极度超距衰减且隔双层实心外墙，大声呼喊仍判定为 inaudible', () => {
  const r = occlusion.auditAcoustic('scream', { nodeId: 'building_a' }, { nodeId: 'building_b' }, {
    barriers: ['concrete_wall', 'reinforced_door'],
    distanceMeters: 50,
    backgroundNoiseDb: 50
  });
  assert.strictEqual(r.perception, 'none');
  assert.ok(r.snr <= 0);
});

it('4.5 [NC-5] 同一微观房间内低语交谈保留 full 原话，不执行误降噪', () => {
  const soundEvt = {
    sourceActorId: 'agent_alpha',
    soundLevel: 'whisper',
    sourceRoomId: 'inner_room',
    speechText: '这是我们之间的绝密。'
  };
  const listenerCtx = {
    listenerActorId: 'agent_beta',
    listenerRoomId: 'inner_room',
    backgroundNoiseDb: 40
  };
  const r = lensCulling.cullAcousticEvent(soundEvt, listenerCtx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.action, 'full');
  assert.strictEqual(r.audibleText, '这是我们之间的绝密。');
});

console.log(`\n=== 场景 18 专锁测试完成：通过 ${passed} 项，失败 ${failed} 项 ===`);
if (failed > 0) process.exit(1);