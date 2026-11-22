/**
 * WorldAxis tests/test-advanced-maps.js
 * 空间物理、分形拓扑、多模态通勤滞留与视听遮蔽痕迹四引擎联合测试
 */
'use strict';
const assert = require('assert');
// v2.380.0（历史欠账消红）：本文件是「纯引擎直跑」老形态，直接 require 引擎而未搭台 ——
//   引擎头 `const WA = window.WorldAxis = ...` 与 `WA.rand.next(...)` 都需要宿主+随机源。
//   台子统一收在 tests/host-boot.js（宿主 = mock.js、随机源 = 真 core/rand.js），本文件只调它。
require('./host-boot.js').boot();

// 1. 测试空间分形拓扑引擎
require('../engines/spatial-topology.js');
const topology = global.WorldAxis.spatialTopology;

console.log('--- 开始 spatial-topology 空间分形拓扑测试 ---');
assert(topology && topology.version, '拓扑引擎加载失败');

// 注册层级地点：新宿区 -> 歌舞伎町 -> 风林会馆 -> 2F 包厢
topology.registerNode('shinjuku', { name: '新宿区', level: 'region' });
topology.registerNode('kabukicho', { name: '歌舞伎町一番街', level: 'sector', parentId: 'shinjuku' });
topology.registerNode('bar_venue', {
  name: '风林会馆居酒屋',
  level: 'venue',
  parentId: 'kabukicho',
  type: 'izakaya',
  schedule: { openHour: 18, closeHour: 4, allDay: false } // 18:00 到次日 04:00 营业
});
topology.registerNode('room_vip', { name: '2F 樱之间包厢', level: 'subspace', parentId: 'bar_venue' });

// 连通通道与门禁
topology.connect('kabukicho', 'bar_venue', { status: 'open' });
topology.connect('bar_venue', 'room_vip', { status: 'locked', keyId: 'vip_key_01' });

// 营业时间与门锁判定
const closedCheck = topology.canTraverse('kabukicho', 'bar_venue', { currentHour: 14 });
assert(!closedCheck.ok && closedCheck.reason === 'closed_hours', '营业时间未开门拦截失败');

const openCheck = topology.canTraverse('kabukicho', 'bar_venue', { currentHour: 20 });
assert(openCheck.ok, '营业时间内通行放行失败');

const lockedCheck = topology.canTraverse('bar_venue', 'room_vip', { currentHour: 20, keys: [] });
assert(!lockedCheck.ok && lockedCheck.reason === 'portal_locked', '未持钥匙门禁拦截失败');

const unlockCheck = topology.canTraverse('bar_venue', 'room_vip', { currentHour: 20, keys: ['vip_key_01'] });
assert(unlockCheck.ok, '持钥匙开门失败');

// 角色落位与层级链路
topology.locateCharacter('桐生战兔', 'room_vip', { floor: '2F', room: '樱之间' });
const chain = topology.getHierarchy('room_vip');
assert(chain.length === 4, '四级分形嵌套链路长度错误');
assert(chain.map(x => x.name).join(' > ') === '新宿区 > 歌舞伎町一番街 > 风林会馆居酒屋 > 2F 樱之间包厢', '层级名称链路不符');

const block = topology.buildBlock();
assert(block.includes('歌舞伎町一番街') && block.includes('樱之间'), '拓扑透镜未正确渲染角色位置');
console.log('✓ spatial-topology 测试通过！');

// 2. 测试多模态通勤与滞留仲裁
require('../engines/transit-scheduler.js');
const transit = global.WorldAxis.transitScheduler;

console.log('--- 开始 transit-scheduler 多模态通勤与滞留仲裁测试 ---');
assert(transit && transit.version, '通勤调度引擎加载失败');

// 白天 14:00 通勤方案
const dayPlan = transit.planCommute(6.0, 14.0);
assert(dayPlan.options.transit.available === true, '白天电车骨干网未开放');
assert(dayPlan.options.foot.durationMin > 0, '徒步时间计算失败');
assert(dayPlan.options.direct.cost > dayPlan.options.transit.cost, '直达出租费用未高于电车');

// 深夜 02:30 通勤方案与滞留
const nightPlan = transit.planCommute(6.0, 2.5);
assert(nightPlan.options.transit.available === false, '深夜末班车停运判定失败');

// 深夜滞留仲裁（穷困时）
const strandedResult = transit.arbitrateStranded('万丈龙我', {
  currentHour: 2.5,
  distanceToHomeKm: 8.0,
  walletFunds: 200,
  nearbyAffordances: ['convenience_store']
});
assert(strandedResult.stranded === true, '末班车断绝且无钱时未能正确判定滞留');
assert(strandedResult.record.emergencyOption === 'convenience_store_stand', '滞留应急庇护判定不符');

const transitBlock = transit.buildBlock();
assert(transitBlock.includes('处于深夜滞留状态'), '滞留透镜反哺未生效');
console.log('✓ transit-scheduler 测试通过！');

// 3. 测试视听遮蔽与环境阻抗
require('../engines/environmental-occlusion.js');
const occlusion = global.WorldAxis.environmentalOcclusion;

console.log('--- 开始 environmental-occlusion 视听遮蔽与环境阻抗测试 ---');
assert(occlusion && occlusion.version, '视听遮蔽引擎加载失败');

// 视线判定
const seeSame = occlusion.canSee({ nodeId: 'bar', room: 'hall' }, { nodeId: 'bar', room: 'hall' });
assert(seeSame.visible === true, '同室视线判定失败');

const seeDifferent = occlusion.canSee({ nodeId: 'bar', room: 'hall' }, { nodeId: 'bar', room: 'kitchen' });
assert(seeDifferent.visible === false, '隔门隔断遮蔽判定失败');

// 声学分贝衰减：耳语在 10 米外隔木门
const whisperAud = occlusion.auditAcoustic('whisper', { nodeId: 'bar', room: '1' }, { nodeId: 'bar', room: '2' }, {
  distanceMeters: 8,
  barriers: ['wooden_door'],
  backgroundNoiseDb: 35
});
assert(whisperAud.perception === 'none', '微弱耳语隔门未正确判定听不见');

// 尖叫呼救 3 米内同房间
const screamAud = occlusion.auditAcoustic('scream', { nodeId: 'bar' }, { nodeId: 'bar' }, {
  distanceMeters: 3,
  barriers: ['none'],
  backgroundNoiseDb: 40
});
assert(screamAud.perception === 'clear', '同房间近距离尖叫未判定清晰可辨');

console.log('✓ environmental-occlusion 测试通过！');

// 4. 测试空间物理痕迹引擎
require('../engines/spatial-trace.js');
const trace = global.WorldAxis.spatialTrace;

console.log('--- 开始 spatial-trace 物理痕迹与半衰衰减测试 ---');
assert(trace && trace.version, '物理痕迹引擎加载失败');

// 留下烟头与打斗痕迹
trace.leaveTrace('room_vip', 'cigarette', { sourceChar: '战兔', createdHour: 20.0 });
trace.leaveTrace('room_vip', 'struggle', { sourceChar: 'Evolto', createdHour: 20.0 });

// 1 小时后勘验 (21:00)
const inspect1h = trace.inspectTraces('room_vip', 21.0);
assert(inspect1h.length === 2, '1小时后痕迹数量不符');
assert(inspect1h.some(x => x.type === 'cigarette' && x.freshness === '新鲜刚留'), '新鲜烟头痕迹判定失败');

// 6 小时后勘验 (02:00)，烟头半衰期 2h，剩余衰减
const inspect6h = trace.inspectTraces('room_vip', 2.0); // 跨天 02:00 等于过了 6 小时
const cig = inspect6h.find(x => x.type === 'cigarette');
assert(!cig || cig.currentStrength < 0.25, '烟头痕迹半衰衰减计算失败');

const traceBlock = trace.buildBlock();
assert(traceBlock.includes('现场有残留'), '物理痕迹透镜反哺未生效');
console.log('✓ spatial-trace 测试通过！');

console.log('=== 四大地形物理与空间高级引擎全量测试全部 PASS！===');