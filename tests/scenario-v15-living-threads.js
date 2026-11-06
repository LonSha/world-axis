'use strict';
// WorldAxis tests/scenario-v15-living-threads.js
// 验证 WorldAxis V15 活世界底层逻辑 场景 18：通用退场角色跨题材自主生计与怪诞市井暗线演化
//
// 机制贯通矩阵：
//   1. 跨题材多世界角色退场（offstageLife.markOffstage）：
//      - 修仙界（xianxia）：炼丹杂役弟子退场打坐
//      - 科幻界（scifi）：暗巷黑客退场调试义体
//      - 西幻界（fantasy）：法师学徒退场擦坩埚
//      - 现代都市（modern）：格子间社畜退场整理票据
//   2. 幕后时间流转与市井生活意外发酵（offstageLife.progressOffstage）：
//      - 角色经历生理/精力磨损、零钱花销
//      - 触发非全知市井糗事（misadventures，如灵禽夺烧饼、义体死机兰花指、漂浮咒飞发带、点外卖送错门）
//   3. 怪诞市井支线与搞笑暗线自主演化（eccentricThreads）：
//      - 开启市井乌龙线（farce）：两帮人抢葱油饼与暗号误会
//      - 推进啼笑纠葛（entanglement）与滑稽高潮（farce_climax）
//      - 市井收敛与荒诞和解（settled）
//   4. 久别重逢烟火气切片回流（offstageLife.reunionSnap）：
//      - 提取真实生活尘土气与谈资（reunionGossip）
//   5. 大模型主生成注入管线汇流（injectCollector.buildBlock）：
//      - 提取【退场生计】与【市井暗线】结构化 Prompt 注入层
//   6. 破坏性真负控制断言：
//      - 未离场角色拒绝生成重逢切片（not-offstage）
//      - 缺省标题或非法类型支线拒绝开启（missing-title / invalid-kind）
//      - 支线结案后拒绝重复推进（already-settled）
//      - 结案无明确结局拒绝收敛（missing-resolution）

const assert = require('assert');
const path = require('path');
const uiGate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');

function env() {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = uiGate.fresh().WA;
  W.store.init();
  ['actionDesk', 'offstageLife', 'eccentricThreads', 'injectCollector', 'life'].forEach(function (k) {
    if (W[k] && typeof W[k].setSettings === 'function') {
      W[k].setSettings({ enabled: true });
    }
  });
  return W;
}

function runLivingThreads(a) {
  const W = env();

  // ── 环节 1：跨题材退场角色登记（四类迥异题材） ──
  const rXianxia = W.offstageLife.markOffstage('青玄门小杂役', {
    genre: 'xianxia',
    role: 'alchemist',
    place: '后山草药阁',
    spareCoins: 20
  });
  a.ok(rXianxia.ok, '修仙退场角色登记成功');
  a.strictEqual(rXianxia.card.genre, 'xianxia', '题材严格绑定为修仙 xianxia');
  a.strictEqual(rXianxia.card.role, 'alchemist', '职业身份绑定为炼丹学徒');

  const rScifi = W.offstageLife.markOffstage('零号接线生', {
    genre: 'scifi',
    role: 'hacker',
    place: '底层地下数据仓',
    spareCoins: 50
  });
  a.ok(rScifi.ok, '科幻退场角色登记成功');
  a.strictEqual(rScifi.card.genre, 'scifi', '题材严格绑定为科幻 scifi');

  const rFantasy = W.offstageLife.markOffstage('托比学徒', {
    genre: 'fantasy',
    role: 'apprentice',
    place: '魔法学院塔楼下层',
    spareCoins: 5
  });
  a.ok(rFantasy.ok, '西幻退场角色登记成功');

  const rModern = W.offstageLife.markOffstage('老张', {
    genre: 'modern',
    role: 'worker',
    place: '老居民弄堂口',
    spareCoins: 15
  });
  a.ok(rModern.ok, '现代退场角色登记成功');

  // ── 环节 2：幕后时间流转与烟火生活意外 ──
  const progRes = W.offstageLife.progressOffstage({
    rounds: 3,
    forceMisadventure: true,
    customMisadventure: '在弄堂小摊买打折烧饼跟老板唠叨了半刻钟'
  });
  a.ok(progRes.ok, '离线生活流转推进成功');
  a.strictEqual(progRes.progressedCount, 4, '全量推进 4 名退场角色的幕后生活');

  const cardZhang = W.offstageLife.getOffstageCard('老张');
  a.ok(cardZhang, '成功读取老张幕后生计卡');
  a.strictEqual(cardZhang.roundsAway, 3, '老张离场轮次累计为 3 轮');
  a.ok(cardZhang.weariness > 10, '老张生理磨损自然增长');
  a.ok(cardZhang.misadventures.length > 0, '老张记录了市井生活插曲');

  // ── 环节 3：怪诞市井支线与搞笑暗线发酵 ──
  const openFarce = W.eccentricThreads.openThread({
    id: 'ethread_pie_war',
    title: '最后一张葱油饼归属案',
    kind: 'farce',
    genre: 'modern',
    participants: ['老张', '隔壁李婶'],
    premise: '两家邻居早起在早餐摊为了最后一张刚出锅的葱油饼暗自较劲'
  });
  a.ok(openFarce.ok, '市井搞笑乌龙线开启成功');
  a.strictEqual(openFarce.thread.stage, 'rumor_spark', '初始阶段为 rumor_spark');

  // 推进到啼笑纠葛
  const adv1 = W.eccentricThreads.advanceThread('ethread_pie_war', {
    leadText: '李婶假装看手机悄悄往前挪了半步，老张咳嗽一声拉出帆布袋挡位',
    actor: '李婶'
  });
  a.ok(adv1.ok, '搞笑支线推进到纠葛阶段');
  a.strictEqual(adv1.thread.stage, 'entanglement', '阶段自然流转至 entanglement');

  // 推进到滑稽高潮
  const adv2 = W.eccentricThreads.advanceThread('ethread_pie_war', {
    nextStage: 'farce_climax',
    leadText: '摊主手一抖，葱油饼掉在案板上被窜出的流浪橘猫一口叼走，两人面面相觑',
    actor: '摊主'
  });
  a.ok(adv2.ok, '搞笑支线推进到高潮');
  a.strictEqual(adv2.thread.stage, 'farce_climax', '进入 farce_climax 荒诞高潮');

  // 市井化解收敛
  const resFarce = W.eccentricThreads.resolveThread('ethread_pie_war', {
    resolution: '两人破涕为笑，李婶请老张喝了碗豆浆，老张分了李婶半根油条和解'
  });
  a.ok(resFarce.ok, '市井乌龙线圆满市井和解');
  a.strictEqual(resFarce.thread.stage, 'settled', '支线进入 settled 终态');
  a.ok(resFarce.thread.resolution.indexOf('破涕为笑') >= 0, '依据明确写入终态');

  // ── 环节 4：久别重逢烟火气切片回流 ──
  const snapRes = W.offstageLife.reunionSnap('青玄门小杂役', { consume: false });
  a.ok(snapRes.ok, '重逢切片生成成功');
  a.strictEqual(snapRes.snap.who, '青玄门小杂役', '切片角色无误');
  a.strictEqual(snapRes.snap.roundsAway, 3, '离线 3 轮如实回流');
  a.ok(snapRes.snap.reunionTone.indexOf('近别重会') >= 0, '重聚语调自然接地气');

  // ── 环节 5：主生成 Prompt 汇流管线注入 ──
  const deskOff = W.actionDesk.plan('life.markOffstage', {
    who: '流浪散修',
    genre: 'xianxia',
    role: 'stallkeeper',
    place: '坊市散摊'
  });
  a.ok(deskOff.ok, 'ActionDesk life.markOffstage 端点执行成功');

  const deskAdv = W.actionDesk.plan('life.progressOffstage', {
    who: '流浪散修',
    rounds: 2,
    forceMisadventure: true,
    customMisadventure: '在坊市被一只偷嘴仙鹤啄破了袖口'
  });
  a.ok(deskAdv.ok, 'ActionDesk life.progressOffstage 端点执行成功');

  const block = W.injectCollector.buildBlock({
    people: ['流浪散修'],
    place: '坊市散摊'
  });
  a.ok(typeof block === 'string', '主生成汇流管线返回文本');
  a.ok(block.indexOf('流浪散修') >= 0, 'Prompt 注入块中包含退场角色');
  a.ok(block.indexOf('偷嘴仙鹤') >= 0 || block.indexOf('退场生计') >= 0, 'Prompt 注入块动态感知退场生活意外');

  // ── 环节 6：4 项破坏性真负控制门禁 ──
  // 负控制 1：从未退场且未建档角色拒绝生成重逢切片
  const negSnap = W.offstageLife.reunionSnap('路人甲不存在');
  a.strictEqual(negSnap.ok, false, '负控制 1：未退场角色拒绝生成切片');
  a.strictEqual(negSnap.reason, 'not-offstage', '拒绝原因为 not-offstage');

  // 负控制 2：缺省标题拒绝开启怪诞支线
  const negThreadTitle = W.eccentricThreads.openThread({
    kind: 'farce',
    title: ''
  });
  a.strictEqual(negThreadTitle.ok, false, '负控制 2：空标题支线拒收');
  a.strictEqual(negThreadTitle.reason, 'missing-title', '拒绝原因为 missing-title');

  // 负控制 3：非法种类支线拒绝开启
  const negThreadKind = W.eccentricThreads.openThread({
    title: '某种大案',
    kind: 'illegal_epic_crime'
  });
  a.strictEqual(negThreadKind.ok, false, '负控制 3：非法支线种类拒收');
  a.strictEqual(negThreadKind.reason, 'invalid-kind', '拒绝原因为 invalid-kind');

  // 负控制 4：已结案支线拒绝重复推进
  const negAdvSettled = W.eccentricThreads.advanceThread('ethread_pie_war', {
    leadText: '试图继续挑事'
  });
  a.strictEqual(negAdvSettled.ok, false, '负控制 4：已结案支线拒绝推进');
  a.strictEqual(negAdvSettled.reason, 'already-settled', '拒绝原因为 already-settled');

  // 负控制 5：结案无明确结局依据拒绝收敛
  const negResolveNoReason = W.eccentricThreads.resolveThread('some_id', {
    resolution: ''
  });
  a.strictEqual(negResolveNoReason.ok, false, '负控制 5：无依据结案拒收');
  a.strictEqual(negResolveNoReason.reason, 'missing-resolution', '拒绝原因为 missing-resolution');
}

function run() {
  const a = assert;
  console.log('[Scenario 18] 开始执行通用退场生计与怪诞市井暗线世界级专锁测试...');
  runLivingThreads(a);
  console.log('场景 18 专锁全部断言通过（含 5 项真负控制门禁）：PASS');
}

run();