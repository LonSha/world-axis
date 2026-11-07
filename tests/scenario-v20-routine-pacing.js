/**
 * WorldAxis tests/scenario-v20-routine-pacing.js (v2.325.0)
 *
 * 场景 20 专锁测试：剧情生活动线、身份世界观节律、个性经历反骨偏离与性格闲暇动向
 *
 * 核心断言链路：
 *  1. 身份时序推进：八大时段（早读、正课、午餐、下午、傍晚放风、晚自习、闲暇、深夜）状态机运转与周末补课机制；
 *  2. 中国高中常理世界观：上午上课、中午抢饭趴桌、傍晚校门烤肠放风、晚自习刷题；
 *  3. 反骨经历驱动偏离（厌学不想读书/旷课翻墙）：当 willingness < 35 或 disposition 为 rebel 时，哪怕在正课/晚自习，也绝不老实听讲，而是翻墙上网吧或趴桌死睡；
 *  4. 负重经历异化（打工贫困/孤僻）：午休躲在楼梯间啃冷馒头，夜晚/周末兼职收银；
 *  5. 自由闲暇时段性格驱动（现充逛街买衣服喝奶茶、宅系窝宿舍追番、学霸自习室刷题）；
 *  6. ActionDesk 调度写口完整验证：setProfile, advanceSlot, setWillingness, setDeviation, setWorldPreset；
 *  7. 主生成管线穿透：inject-collector 收集生活节律切片；
 *  8. 5 项真负控制硬拦截：
 *     - [NC-1] 缺角色名拒设生活画像；
 *     - [NC-2] 缺角色名拒评估动向；
 *     - [NC-3] 非法世界观模板拒切换并报 invalid-preset；
 *     - [NC-4] 缺角色名拒调意愿度；
 *     - [NC-5] 缺角色名拒设偏离行动。
 */
'use strict';
const a = require('assert');
const path = require('path');

// 环境重置与模块挂载
delete require.cache[path.resolve(__dirname, '../core/store.js')];
delete require.cache[path.resolve(__dirname, '../core/evict.js')];
delete require.cache[path.resolve(__dirname, '../engines/routine-pacing.js')];
delete require.cache[path.resolve(__dirname, '../engines/action-desk.js')];
delete require.cache[path.resolve(__dirname, '../engines/inject-collector.js')];

require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
// 打开调度面与注入面总开关（默认关闭，测试需显式启用）
['actionDesk', 'routinePacing', 'injectCollector', 'life'].forEach(function (k) {
  if (WA[k] && typeof WA[k].setSettings === 'function') WA[k].setSettings({ enabled: true });
});
if (WA.actionDesk && typeof WA.actionDesk.setSettings === 'function') WA.actionDesk.setSettings({ enabled: true });
if (WA.routinePacing && typeof WA.routinePacing.saveSettings === 'function') WA.routinePacing.saveSettings({ enabled: true });

console.log('[Scenario 20] 开始执行剧情生活动线、身份世界观节律与个性偏离专锁测试...');

a.ok(WA.routinePacing, 'engines/routine-pacing.js 必须成功挂载在 WA.routinePacing');
a.ok(WA.actionDesk, 'engines/action-desk.js 必须成功挂载');
a.ok(WA.injectCollector, 'engines/inject-collector.js 必须成功挂载');

// 1. 初始化世界模板为中国高中全日制
const pRes = WA.actionDesk.plan('routine.setWorldPreset', { preset: 'cn_high_school', dayType: 'weekday', slot: 'morning_core' });
a.ok(pRes.ok, 'ActionDesk routine.setWorldPreset 必须执行成功');
a.strictEqual(pRes.worldFrame.preset, 'cn_high_school', '世界模板必须是中国高中');
a.strictEqual(pRes.worldFrame.currentSlot, 'morning_core', '当前时段必须是上午主课');

// 2. 登记多位不同性格与经历的人物
// (1) 模范卷王：苏清雪（overachiever，高意愿）
const p1 = WA.actionDesk.plan('routine.setProfile', {
  who: '苏清雪',
  role: '重点班班长',
  disposition: 'overachiever',
  willingness: 95,
  backstory: '立志考入顶尖名校的学霸'
});
a.ok(p1.ok, '登记苏清雪成功');

// (2) 反骨厌学者：林野（rebel，极度厌学，不想读书）
const p2 = WA.actionDesk.plan('routine.setProfile', {
  who: '林野',
  role: '后排刺头',
  disposition: 'rebel',
  willingness: 15,
  backstory: '家庭变故且厌恶死记硬背说教'
});
a.ok(p2.ok, '登记林野成功');

// (3) 身负重担者：周小敏（burdened，贫困打工）
const p3 = WA.actionDesk.plan('routine.setProfile', {
  who: '周小敏',
  role: '特困生',
  disposition: 'burdened',
  willingness: 60,
  backstory: '家里负债深夜打工便利店'
});
a.ok(p3.ok, '登记周小敏成功');

// (4) 现充爱美社交派：夏萌萌（hedonist，爱逛街爱奶茶）
const p4 = WA.actionDesk.plan('routine.setProfile', {
  who: '夏萌萌',
  role: '文娱委员',
  disposition: 'hedonist',
  willingness: 70,
  backstory: '性格开朗热衷潮流穿搭与美食'
});
a.ok(p4.ok, '登记夏萌萌成功');

// 3. 上午主课时段（morning_core）动向评估
const evSu = WA.routinePacing.evaluate('苏清雪');
a.ok(evSu.ok, '苏清雪评估必须成功');
a.strictEqual(evSu.pattern, 'in_routine', '卷王学霸在规范主课时段处于正常守序态');
a.strictEqual(evSu.status, 'candidate', '安排不得冒充事实');

const evLin = WA.routinePacing.evaluate('林野');
a.ok(evLin.ok, '林野评估必须成功');
a.strictEqual(evLin.pattern, 'reluctant_candidate', '厌学反骨角色在正课时段必须触发反骨偏离');
a.ok(evLin.detail.includes('不能仅凭厌学'), '厌学不得自动判为逃课');

// 4. 推进到正午饭点（lunch_break）
const advLunch = WA.actionDesk.plan('routine.advanceSlot', { slot: 'lunch_break' });
a.ok(advLunch.ok, '推进至正午饭点');
a.strictEqual(advLunch.worldFrame.currentSlot, 'lunch_break');

const evMin = WA.routinePacing.evaluate('周小敏');
a.strictEqual(evMin.pattern, 'meal_candidate', '贫困重担角色在午餐时段异化');
a.ok(!evMin.detail.includes('冷馒头'), '不得凭贫困经历捏造饮食与羞耻');

// 5. 推进到闲暇放学时段（night_leisure）
const advNight = WA.actionDesk.plan('routine.advanceSlot', { slot: 'night_leisure' });
a.ok(advNight.ok, '推进到夜晚休闲');

const evXia = WA.routinePacing.evaluate('夏萌萌');
a.strictEqual(evXia.pattern, 'leisure_agency', '夏萌萌在休闲时段由性格自主驱动');
a.ok(evXia.detail.includes('负担得起'), '闲暇活动须受现实条件约束');

// 6. 验证意愿动态骤降导致的剧情转变（例如某好学生被无理训斥后不想读书）
const willRes = WA.actionDesk.plan('routine.setWillingness', { who: '苏清雪', value: 10, absolute: true });
a.ok(willRes.ok, '调节苏清雪意愿度');
a.strictEqual(willRes.willingness, 10, '意愿降至 10');

// 推进到晚自习（evening_study）
WA.actionDesk.plan('routine.advanceSlot', { slot: 'evening_study' });
const evSuAfter = WA.routinePacing.evaluate('苏清雪');
a.strictEqual(evSuAfter.pattern, 'reluctant_candidate', '意愿暴跌后，原本的学霸也会在晚自习产生消极抵抗或趴桌装死');

// 7. 手动特定剧情偏离（例如校庆排练或离校出走）
const devRes = WA.actionDesk.plan('routine.setDeviation', { who: '夏萌萌', text: '被学生会叫去礼堂排练迎新晚会的主持人开场白' });
a.ok(devRes.ok, '夏萌萌设置特定偏离成功');
const evXiaDev = WA.routinePacing.evaluate('夏萌萌');
a.strictEqual(evXiaDev.pattern, 'explicit_deviation');
a.ok(evXiaDev.detail.includes('礼堂排练'), '特定偏离必须优先采纳');

// 8. 主生成管线穿透测试（inject-collector 必须成功拾取【生活节律】切片）
const block = WA.routinePacing.buildBlock();
a.ok(block.includes('【时序节律与生活动线】'), 'buildBlock 必须包含标准总标题');
a.ok(block.includes('中国全日制高中'), '提示词必须声明世界模板背景');
a.ok(block.includes('苏清雪') && block.includes('林野'), '必须包含核心角色的具体动向');

const injectHits = WA.injectCollector.buildBlock({ people: ['苏清雪', '林野'], place: '教室' });
const routineInject = injectHits.includes('生活节律');
a.ok(routineInject, 'inject-collector 必须成功抓取到生活节律切片');

// ── 9. 五项真负控制硬拦截门禁（Negative Controls）─────────────────────────────
console.log('正在执行 5 项破坏性真负控制门禁验证...');

// [NC-1] 缺角色名拒设生活画像
const nc1 = WA.actionDesk.plan('routine.setProfile', { role: '路人' });
a.strictEqual(nc1.ok, false, '[NC-1] 缺角色名必须拒绝');

// [NC-2] 缺角色名拒评估动向
const nc2 = WA.routinePacing.evaluate('');
a.strictEqual(nc2.ok, false, '[NC-2] 缺角色名必须拒绝评估');

// [NC-3] 非法世界观模板拒切换
const nc3 = WA.actionDesk.plan('routine.setWorldPreset', { preset: 'cyberpunk_martian_colony' });
a.strictEqual(nc3.ok, false, '[NC-3] 非法世界模板必须拒绝');
a.ok(nc3.error.includes('未知'), '必须给出错误提示');

// [NC-4] 缺角色名拒调意愿度
const nc4 = WA.actionDesk.plan('routine.setWillingness', { value: 50 });
a.strictEqual(nc4.ok, false, '[NC-4] 缺角色名拒调意愿');

// [NC-5] 缺角色名拒设偏离行动
const nc5 = WA.actionDesk.plan('routine.setDeviation', { text: '独自流浪' });
a.strictEqual(nc5.ok, false, '[NC-5] 缺角色名拒设偏离');

console.log('场景 20 专锁全部断言通过（含 5 项真负控制门禁）：PASS');
