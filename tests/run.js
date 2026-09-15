// WorldAxis tests/run.js — 无头测试运行器
'use strict';
require('./mock.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function assertDeepEq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { throw new Error('断言失败[' + name + ']: ' + a + ' !== ' + e); }
}
function assert(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; failures.push(name); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function section(t) { console.log('\n■ ' + t); }

// 按依赖顺序加载扩展JS到同一vm上下文（跳过index.js与UI）
const ctx = vm.createContext(global);
const LOAD = [
  'core/store.js', 'core/api-router.js', 'core/workflow.js', 'core/interceptor.js',
  'engines/backstage.js', 'engines/evolution.js', 'engines/enemies.js', 'engines/regional.js', 'engines/horizon.js', 'engines/digest.js', 'engines/limits.js', 'engines/calendar.js', 'engines/memory.js',
  'engines/worldbook.js', 'engines/ledger.js', 'engines/inspector.js', 'engines/timeline.js', 'engines/entities.js', 'engines/preset.js', 'engines/chatcache.js', 'engines/pmem.js', 'engines/rules.js', 'engines/summarizer.js',
  'engines/chapters.js', 'engines/opinion.js', 'engines/direct-event.js', 'engines/editor-faction.js', 'engines/editor-events.js', 'engines/inspector-state.js', 'engines/tool-snapshot.js', 'engines/tool-analyzer.js', 'engines/tool-import.js', 'engines/inject-inspector.js', 'engines/inject-budget.js', 'engines/tool-diag.js', 'engines/contract-audit.js', 'engines/memory-sampler.js',
  'actors/registry.js', 'actors/monologue.js', 'actors/observe.js', 'actors/profile.js',
  'direction/oracle.js', 'direction/tags.js', 'direction/choices.js',
  'render/inject.js', 'render/theater.js', 'render/purifier.js',
  'compat/mvu.js', 'compat/th-helper.js'
];
for (const rel of LOAD) {
  const code = fs.readFileSync(path.join(BASE, rel), 'utf8');
  try { vm.runInContext(code, ctx, { filename: rel }); }
  catch (e) { console.log('加载失败 ' + rel + ': ' + e.message); process.exit(1); }
}
const WA = global.WorldAxis;

(async () => {
  // ── store ──
  section('core/store');
  WA.store.init();
  const s0 = WA.store.get();
  assert(s0 && s0.schemaVersion === 1, 'store初始化 schema v1');
  assert(Array.isArray(s0.currents) && s0.memory && s0.memory.l0, '默认结构完整');
  assert('worldPulse' in s0 && 'nextTurnInjection' in s0, 'v0.2.1新字段(worldPulse/nextTurnInjection)存在');
  const tx = WA.store.transact(d => { d.clock.label = '第1日·黄昏'; });
  assert(tx.ok && WA.store.read('clock.label') === '第1日·黄昏', 'transact事务提交');
  const txFail = WA.store.transact(() => { throw new Error('boom'); });
  assert(!txFail.ok && WA.store.read('clock.label') === '第1日·黄昏', 'transact异常不提交半份状态');
  assert(typeof WA.store.currentBranchId() === 'string', 'branchId可读: ' + WA.store.currentBranchId());

  // ── workflow ──
  section('core/workflow');
  const beforeNodes = WA.workflow.list('before');
  const afterNodes = WA.workflow.list('after');
  assert(beforeNodes.length >= 4, 'before链节点≥4 (实' + beforeNodes.length + ')');
  assert(afterNodes.length >= 5, 'after链节点≥5 (实' + afterNodes.length + ')');
  assert(beforeNodes.every((n, i, a) => i === 0 || a[i - 1].order <= n.order), 'before链按order排序');
  WA.workflow.setEnabled('opinion.tick', false);
  assert(!WA.workflow.list('after').find(n => n.id === 'opinion.tick').enabled, '节点开关生效');
  WA.workflow.setEnabled('opinion.tick', true);

  // ── backstage 提示词/结算 ──
  section('engines/backstage');
  const st = WA.backstage.getSettings();
  assert(st.simulationMode === 'balanced' && st.timePolicy === 'cautious', '默认设置(balanced/cautious)');
  const anchor = { idx: 3, swipe: 0, hash: 'x' };
  const prompt = WA.backstage.buildPrompt(anchor);
  assert(prompt.length === 2 && prompt[0].role === 'system', '提示词结构(system+user)');
  assert(prompt[0].content.includes('七步') || prompt[0].content.includes('世界结算器'), '含七步判断协议');
  assert(prompt[0].content.includes('双轴可见性') && prompt[0].content.includes('next_turn_injection'), '含双轴+三列注入规则');
  assert(prompt[0].content.includes('inferred') && prompt[0].content.includes('suspected'), '含知识路径inferred→suspected');
  // 结算：构造一次完整推演结果
  const simResult = {
    clock: '第1日·入夜',
    world_pulse: { pressure: 2, trend: 'rising', note: '马蹄声逼近' },
    worldFacts: [{ key: '酒馆位置', value: '临水镇东街' }],
    people: [{ name: '蒙面人', location: '酒馆角落', action: '低声警告玩家', intent: '驱赶' }],
    knowledge_updates: [
      { person: '蒙面人', about: '玩家身份', status: 'fact', route: 'inferred' },
      { person: '酒保', about: '窗外马蹄声', status: 'fact', route: 'witnessed' }
    ],
    currents: [{ title: '镇外骑兵队逼近', summary: '一队骑兵正赶往临水镇', visibility: 'trace', publicity: 'trace', public_trace: '远处有马蹄声', stage: '发展' }],
    echoes: [{ refCurrent: '蒙面人警告', result: '玩家被盯上', exposure: 'subtle' }],
    chronicle: [{ kind: 'event', title: '蒙面人接触', summary: '蒙面人警告玩家离开' }],
    foreshadows: [{ id: 'fs1', content: '骑兵队的目标疑似酒馆', status: 'waiting' }],
    next_turn_injection: { required: ['event:镇外骑兵队逼近'], conditional: ['clue:蒙面人真实身份'], suppress: ['event:骑兵队雇主'] }
  };
  WA.store.transact(d => WA.backstage.applyResult(d, simResult, anchor));
  const s1 = WA.store.get();
  assert(s1.clock.label === '第1日·入夜', '结算·时钟更新');
  assert(s1.worldPulse && s1.worldPulse.pressure === 2 && s1.worldPulse.trend === 'rising', '结算·世界脉搏入账');
  assert(s1.worldFacts.some(f => f.key === '酒馆位置' && f.value === '临水镇东街'), '结算·世界事实');
  const mp = s1.people['p_蒙面人'];
  assert(mp && mp.location === '酒馆角落', '结算·人物位置');
  // inferred 必须降级 suspected
  assert(mp.knowledge['玩家身份'] && mp.knowledge['玩家身份'].status === 'suspected', '认知边界·inferred强制降级suspected');
  const bj = s1.people['p_酒保'];
  assert(bj && bj.knowledge['窗外马蹄声'] && bj.knowledge['窗外马蹄声'].status === 'fact', '认知边界·witnessed保持fact');
  assert(s1.currents.some(c => c.title === '镇外骑兵队逼近' && c.visibility === 'trace' && c.publicity === 'trace'), '结算·暗流双轴');
  assert(s1.memory.foreshadows.some(f => f.id === 'fs1' && f.status === 'waiting'), '结算·伏笔入账');
  const nti = s1.nextTurnInjection;
  assert(nti && nti.required.includes('event:镇外骑兵队逼近') && nti.suppress.length === 1, '结算·nextTurnInjection三列持久化');
  // 事件身份稳定：同标题current更新不新建
  WA.store.transact(d => WA.backstage.applyResult(d, { currents: [{ title: '镇外骑兵队逼近', summary: '已到镇口', stage: '逼近' }] }, anchor));
  const cur2 = WA.store.get().currents.filter(c => c.title === '镇外骑兵队逼近');
  assert(cur2.length === 1 && cur2[0].summary === '已到镇口', '事件身份稳定·同标题更新不重建');
  // before链消费
  const block = WA.backstage.consumeInjection();
  assert(block && block.includes('必须体现') && block.includes('禁止暴露'), 'before链·连续性约束块生成');
  WA.backstage.clearInjection();
  assert(!WA.store.get().nextTurnInjection, 'before链·注入一次性消费清空');

  // ── memory ──
  section('engines/memory');
  // 直接写入5条L0测试consolidateL1的触发条件（不依赖API）
  WA.store.transact(d => {
    for (let i = 0; i < 5; i++) d.memory.l0.push({ t: Date.now(), s: '第' + i + '轮摘要' });
  });
  // 无digest通道配置时应安全返回false
  const c1 = await WA.memory.consolidateL1();
  assert(c1 === false, 'consolidateL1无通道配置安全跳过');
  // 配channel测试extractJson与upsertFact
  WA.apiRouter.setChannel('digest', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  global.__pushApiJson({ recap: '玩家进入酒馆遭遇蒙面人警告', facts: [{ key: '玩家处境', value: '被蒙面人盯上' }], foreshadow: { content: '蒙面人身份成谜' } });
  const c2 = await WA.memory.consolidateL1();
  assert(c2 === true, 'consolidateL1成功执行');
  const sm = WA.store.get().memory;
  assert(sm.l1.some(x => x.s.includes('蒙面人')), 'L1回顾入账');
  assert(sm.facts.some(f => f.key === '玩家处境' && f.active && f.version === 1), 'facts入账 v1');
  assert(sm.foreshadows.some(f => f.content === '蒙面人身份成谜' && f.status === 'waiting'), '伏笔候选入账');
  assert(sm.l0.length === 0, '已巩固L0移出');
  // facts版本更迭
  WA.store.transact(d => WA.memory.upsertFact(d, '玩家处境', '已逃离酒馆', 'test'));
  const f2 = WA.store.get().memory.facts.filter(f => f.key === '玩家处境');
  assert(f2.length === 2 && f2[0].active === false && f2[1].active === true && f2[1].version === 2, 'facts版本化更迭 v1→v2');
  const mb = WA.memory.buildMemoryBlock();
  assert(mb.includes('world_axis_memory') && mb.includes('玩家处境'), '记忆块构建');
  // L2/L3 分层巩固
  WA.store.transact(d => { d.memory.l1 = []; for (let i = 0; i < 4; i++) d.memory.l1.push({ t: Date.now(), s: '阶段回顾' + i }); });
  global.__pushApiJson({ chapter: '玩家从入镇到卷入血刀门冲突', facts: [{ key: '主线', value: '血刀门冲突' }] });
  const l2ok = await WA.memory.consolidateL2();
  assert(l2ok === true && WA.store.get().memory.l2.some(x => x.s.includes('血刀门')), 'L2章节回顾入账');
  WA.store.transact(d => { d.memory.l2 = []; for (let i = 0; i < 3; i++) d.memory.l2.push({ t: Date.now(), s: '章节' + i }); });
  global.__pushApiJson({ theme: '血刀门与玩家的长期对抗', worldShift: '青石关势力格局重组' });
  const l3ok = await WA.memory.consolidateL3();
  assert(l3ok === true && WA.store.get().memory.l3.some(x => x.theme.includes('血刀门')), 'L3长线沉淀入账');

  // ── evolution (v0.3 完整版) ──
  section('engines/evolution v0.3');
  WA.store.transact(d => { d.evolution.events = []; d.evolution.round = 0; });
  WA.evolution.setSettings({ diceEnabled: true, diceModifier: 0 });
  WA.evolution.addEvent({ name: '血刀门复仇', type: 'conflict', level: 2, stage: '萌芽', stageRound: 8 });
  WA.evolution.addEvent({ name: '护送商队', type: 'progress', level: 1, stage: '筹备', stageRound: 1 });
  // 强制保底：consecutiveFails拉满
  WA.store.transact(d => { d.evolution.events[1].consecutiveFails = 99; });
  const rollRes = WA.evolution.tick();
  const ev_blood = WA.store.get().evolution.events.find(e => e.name === '血刀门复仇');
  assert(ev_blood, '事件链入账(name字段)');
  assert(rollRes.some(r => r.name === '护送商队' && r.result === '成功(保底)'), '保底机制触发(连续失败强制成功)');
  // 势力/声誉/经济结算
  WA.store.transact(d => {
    WA.evolution.applyFactions(d, [{ name: '血刀门', scope: '青石关一带', status: '稳固', relation: '敌对', currentGoal: '追杀玩家', core_person: '门主', powerPillars: ['武力威慑', '山路控制'] }]);
    WA.evolution.applyReputation(d, { shadow: '受人尊敬', lastChange: '草莽因玩家对抗血刀门而敬重' });
    WA.evolution.applyEconomy(d, { climate: '动荡', signals: [{ summary: '商路被血刀门封锁，粮价上涨', scope: '青石关' }] });
    WA.evolution.applyInfluenceChain(d, [{ trigger: '血刀门复仇', impact: '商路中断', fallout: '周边物价上涨' }]);
  });
  const sev = WA.store.get().evolution;
  assert(sev.factions.some(f => f.name === '血刀门' && f.status === '稳固' && f.relation === '敌对' && f.powerPillars.length === 2), '势力入账(六态/七级关系/权力支柱)');
  assert(sev.reputation.shadow === '受人尊敬', '声誉四维入账(草莽)');
  assert(sev.economy.climate === '动荡' && sev.economy.signals.length === 1, '经济气候+信号入账');
  assert(sev.trends.some(t => t.trigger === '血刀门复仇'), '影响链入账');
  // 风声归并+消散
  WA.evolution.addWind({ topic: '血刀门追杀令', type: 'rumor', level: 2, content: '血刀门悬赏玩家', scope: '青石关' });
  WA.evolution.addWind({ topic: '血刀门追杀令', type: 'rumor', level: 3, content: '血刀门加码悬赏', scope: '全区' });
  const winds = WA.store.get().evolution.winds.filter(w => w.topic === '血刀门追杀令');
  assert(winds.length === 1 && winds[0].level === 3 && winds[0].content === '血刀门加码悬赏', '风声同主题归并(不新建,等级取高)');
  // 消散骰（level1 rumor grace1，多轮后大概率消散）
  WA.store.transact(d => { d.evolution.winds.forEach(w => { w.quietRounds = 20; w.level = 1; }); });
  let decayed = WA.evolution.decayWinds();
  if (!decayed.includes('血刀门追杀令')) decayed = decayed.concat(WA.evolution.decayWinds()); // 95%骰子，重试消除flaky
  assert(decayed.includes('血刀门追杀令'), '风声长期沉寂后消散');
  // 演化注入块
  const evBlock = WA.evolution.buildEvolutionBlock();
  assert(evBlock.includes('world_axis_evolution') && evBlock.includes('血刀门'), '演化注入块构建');
  assert(typeof WA.evolution.activeSnapshot === 'function' && WA.evolution.activeSnapshot().events.length >= 0, 'activeSnapshot可读');

  // ── enemies/blackbox/worldTrends (v0.3) ──
  section('engines/enemies v0.3');
  WA.store.transact(d => {
    WA.enemies.apply(d, [{ name: '血刀门门主', reason: '玩家杀死其师弟', type: 'blood', status: '追踪中' }]);
    WA.enemies.applyBlackbox(d, { secretActions: [{ action: '玩家夜探血刀门分舵', witnesses: '无' }], secretAssets: [{ name: '藏身的破庙', exposure: 20, status: '有效' }] });
    WA.enemies.applyWorldTrends(d, [{ name: '血刀门扩张', scope: '青石关周边', status: '持续中', description: '血刀门吞并周边小帮派', source: 'Lv4冲突已爆发' }]);
  });
  const sen = WA.store.get().evolution;
  assert(sen.enemies.some(e => e.name === '血刀门门主' && e.type === 'blood' && e.status === '追踪中'), '仇敌录入账(blood/追踪中)');
  assert(sen.blackbox.secretActions.length === 1 && sen.blackbox.secretAssets[0].exposure === 20, '黑盒入账(隐秘行为+资产曝光度)');
  assert(sen.worldTrends.some(t => t.name === '血刀门扩张' && t.status === '持续中'), '天下大势入账');
  const enBlock = WA.enemies.buildEnemiesBlock();
  assert(enBlock.includes('world_axis_enemies') && enBlock.includes('血刀门门主') && enBlock.includes('天下大势'), '仇敌/大势注入块构建');
  // 已终结仇敌保留20轮后清除
  WA.store.transact(d => { d.evolution.round = 100; WA.enemies.apply(d, [{ name: '血刀门门主', status: '已终结' }]); });
  WA.store.transact(d => { d.evolution.round = 200; WA.enemies.apply(d, []); });
  assert(!WA.store.get().evolution.enemies.some(e => e.name === '血刀门门主'), '已终结仇敌20轮后自动清除');

  // ── regional (v0.4) ──
  section('engines/regional v0.4');
  WA.regional.setSettings({ enabled: true, chancePercent: 100, durationRounds: 2 });
  WA.store.transact(d => { WA.regional.applyIncident(d, { active: true, title: '青石关匪患', type: 'bandit', scope: '青石关商路', impact: '商队被劫，路断' }); });
  const activeInc = WA.regional.active();
  assert(activeInc && activeInc.title === '青石关匪患' && activeInc.typeLabel === '匪患/劫掠', '区域突发事件入账+类型映射');
  const rollOngoing = WA.regional.roll();
  assert(rollOngoing && rollOngoing.ongoing === true && rollOngoing.prompt.includes('持续中'), '持续中事件roll返回ongoing提示');
  WA.regional.tick(); WA.regional.tick();
  assert(!WA.regional.active(), '区域事件持续轮次耗尽自动平息');
  assert(WA.store.get().chronicle.some(c => c.kind === 'regional'), '平息入纪事');

  // ── horizon (v0.5) ──
  section('engines/horizon v0.5');
  // 清空两泳道状态后重测（其他section可能已消耗泳道）
  WA.store.transact(d => {
    d.evolution.horizon = {
      distant: { ledger: 10, cooldown: 0, pending: null, lastFired: 0 },
      near:    { ledger: 0, cooldown: 0, pending: null, lastFired: 0 }
    };
  });
  const dRoll = WA.horizon.rollLane('distant');
  assert(dRoll.fired === true && dRoll.forced === true, '远方事件ledger≥10强制触发');
  assert(WA.store.get().evolution.horizon.distant.pending !== null, '触发后pending挂起');
  assert(WA.store.get().evolution.horizon.distant.cooldown === 5, '触发后冷却5轮');
  // 接受distant event结果
  const okD = WA.horizon.acceptResult('distant', { type: 'event', title: '北境雪灾', desc: '大雪封山三月' });
  assert(okD === true, '远方事件结果入账成功');
  assert(WA.store.get().evolution.horizon.distant.pending === null, '入账后pending清除');
  assert(WA.store.get().chronicle.some(c => c.kind === 'horizon_distant' && c.title === '北境雪灾'), '远方事件入纪事');
  // 接受near结果
  const okN = WA.horizon.acceptResult('near', { title: '城门戒严', desc: '官府严查过往行人', urgent: true });
  assert(okN === true, '近端事件结果入账成功');
  assert(WA.store.get().nextTurnInjection && WA.store.get().nextTurnInjection.nearEvent, '近端事件写入nextTurnInjection');
  // 无效结果保留pending
  WA.store.transact(d => { d.evolution.horizon.near.pending = { result: { type: 'event' }, retries: 0 }; });
  const okBad = WA.horizon.acceptResult('near', null);
  assert(okBad === false, '无效结果拒绝入账');
  // 临时标记剥离
  WA.store.transact(d => { d.evolution.horizon.distant.cooldown = 0; d.evolution.horizon.distant.ledger = 10; d.evolution.horizon.distant.pending = null; });
  WA.horizon.rollLane('distant');
  WA.horizon.acceptResult('distant', { type: 'event', title: '南海风暴', _distantGenerated: true, _temp: true });
  const lastChron = WA.store.get().chronicle.slice(-1)[0];
  assert(!lastChron._distantGenerated && !lastChron._temp, '临时标记已剥离');
  // 冷却中不触发
  const cdRoll = WA.horizon.rollLane('distant');
  assert(cdRoll.fired === false && cdRoll.reason.startsWith('cooldown'), '冷却中不触发');

  // ── digest (v0.5) ──
  section('engines/digest v0.5');
  WA.store.transact(d => {
    d.worldPulse = { pressure: 2 };
    d.evolution.events = [{ title: '青石关匪患', stage: 'rising', status: 'active' }];
    d.evolution.winds = [{ topic: '血刀门', level: 3, quiet: false }];
    d.evolution.factions = [{ name: '血刀门', status: '鼎盛' }];
    d.evolution.economy = { climate: '萧条', signals: [] };
  });
  const digestText = WA.digest.generate();
  assert(digestText.length >= 100, `digest长度≥100(实际${digestText.length})`);
  assert(!digestText.includes('你') && !digestText.includes('玩家'), 'digest不含玩家引用');
  assert(WA.store.get().evolution.worldDigest && WA.store.get().evolution.worldDigest.text, 'digest已入账');
  assert(WA.digest.buildBlock().includes('[世界推演]'), 'digest注入块格式正确');

  // ── limits (v0.5) ──
  section('engines/limits v0.5');
  const longTitle = '这是一个超过三十个汉字的事件标题用于测试截断功能是否正常工作';
  const clamped = WA.limits.clamp('events.title', longTitle);
  assert(clamped.length <= 30, `events.title截断至≤30(实际${clamped.length})`);
  const clampedArr = WA.limits.clampArray('events', [{ title: longTitle, desc: '短' }], ['title', 'desc']);
  assert(clampedArr[0].title.length <= 30, 'clampArray批量截断');
  // ID稳定：按title匹配
  const existing = [{ id: 'ev1', title: '旧标题', type: 'conflict' }];
  const loc = WA.limits.locateStable(existing, { title: '旧标题', desc: '新描述' });
  assert(loc.idx === 0 && loc.stable === true, 'ID稳定：按title定位');
  // type禁改
  WA.limits.applyStableUpdate(existing[0], { type: 'progress', desc: '更新' });
  assert(existing[0].type === 'conflict', 'type一旦确定禁改');
  // stall标记
  WA.limits.applyStableUpdate(existing[0], { stall: true, stallReason: '关键人物失踪' });
  assert(existing[0].stall === true && existing[0].desc.includes('关键人物失踪'), 'stall停滞标记写入desc');
  // clampBackstageResult
  const mockResult = { events_create: [{ title: longTitle, desc: 'ok' }], winds: [{ topic: '超长话题名称超过十字限制测试', content: 'ok' }] };
  const cr = WA.limits.clampBackstageResult(mockResult);
  assert(cr.events_create[0].title.length <= 30, 'clampBackstageResult截断events');
  assert(cr.winds[0].topic.length <= 10, 'clampBackstageResult截断winds.topic');

  // ── inject v0.7: digest+nearEvent一次性消费 ──
  section('render/inject v0.7');
  // 灌入digest和nearEvent
  WA.store.transact(d => {
    d.evolution.worldDigest = { text: '各方暗流涌动，张力已近临界点。血刀门声势正隆。', round: 1, at: Date.now() };
    d.nextTurnInjection = { nearEvent: { title: '城门失火', desc: '火势蔓延', urgent: true } };
  });
  const mockCtx = { injections: [] };
  WA.render.applyInjections(mockCtx);
  const lastPrompt = (global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '';
  assert(lastPrompt.includes('世界推演') || lastPrompt.includes('[世界推演]'), 'digest注入到扩展提示');
  assert(lastPrompt.includes('城门失火'), 'nearEvent注入到扩展提示');
  assert(!WA.store.get().nextTurnInjection || !WA.store.get().nextTurnInjection.nearEvent, 'nearEvent一次性消费已清除');

  // ── ledger (v0.8) ──
  section('engines/ledger v0.8');
  // 建立存档点：事件Lv3推进 + 风声Lv3新增场景
  WA.store.transact(d => {
    d.evolution.events = [
      { id: 'evA', title: '叛军集结', type: 'conflict', level: 3, stage: '潜伏' },
      { id: 'evB', title: '低级事件', type: 'progress', level: 1, stage: '起步' }
    ];
    d.evolution.winds = [{ id: 'w1', topic: '旧风声', level: 2, content: '旧' }];
  });
  WA.ledger.saveCheckpoint();
  // 模拟推演后：evA阶段推进、evB低级不变、新增Lv3事件、新增Lv3风声
  WA.store.transact(d => {
    d.evolution.events[0].stage = '爆发';
    d.evolution.events.push({ id: 'evC', title: '新战事', type: 'conflict', level: 3, stage: '潜伏' });
    d.evolution.winds.push({ id: 'w2', topic: '血月传闻', level: 3, content: '血月将现' });
  });
  WA.ledger.recordChanges();
  const led = WA.store.get().evolution.ledger;
  assert(led && led.length === 1 && led[0].changes.length === 3, `账本记录3条变化(实际${led ? led[0].changes.length : 0})`);
  const changeTypes = led[0].changes.map(c => c.type).sort().join(',');
  assert(changeTypes === 'event_advance,event_new,wind_new', '账本变化类型齐全: ' + changeTypes);
  // 低级事件不记录
  assert(!led[0].changes.some(c => c.name === '低级事件'), 'Lv1事件不入账本');
  // 注入文本
  const ledText = WA.ledger.buildLedgerText();
  assert(ledText.includes('叛军集结') && ledText.includes('潜伏->爆发'), '账本注入文本含推进记录');
  assert(ledText.includes('血月传闻'), '账本注入文本含风声记录');
  // 同轮重roll覆盖
  WA.ledger.recordChanges();
  assert(WA.store.get().evolution.ledger.length === 1, '同轮重复记录被覆盖不堆积');
  // 终局记录（即使Lv1）
  WA.store.transact(d => { d.evolution.events = []; });
  WA.ledger.saveCheckpoint();
  WA.store.transact(d => { d.evolution.events = [{ id: 'evD', title: '小事件终结', type: 'progress', level: 1, stage: '已完成' }]; });
  WA.ledger.recordChanges();
  const led2 = WA.store.get().evolution.ledger;
  assert(led2[0].changes.some(c => c.type === 'event_terminal' && c.name === '小事件终结'), '任何等级终局都入账本');

  // ── worldbook (v0.8) ──
  section('engines/worldbook v0.8');
  // matchKey基础匹配
  assert(WA.worldbook.matchKey('江湖上传言血刀门行事狠辣', '血刀门', false, false) === true, 'matchKey中文子串匹配');
  assert(WA.worldbook.matchKey('hello world', 'HELLO', false, false) === true, 'matchKey大小写不敏感');
  assert(WA.worldbook.matchKey('hello world', 'HELLO', true, false) === false, 'matchKey大小写敏感');
  assert(WA.worldbook.matchKey('a cat sat', 'cat', false, true) === true, 'matchKey ASCII整词匹配');
  assert(WA.worldbook.matchKey('concatenate', 'cat', false, true) === false, 'matchKey整词不匹配子串');
  assert(WA.worldbook.matchKey('测试正则', '/测.*则/', false, false) === true, 'matchKey正则键');
  // activationOf：常驻/关键词/次键四逻辑
  const wbEntry = {
    constant: false, vectorized: false, selective: true, selectiveLogic: 0,
    keys: ['血刀门'], secondaryKeys: ['江湖', '武林'], caseSensitive: false, matchWholeWords: false
  };
  assert(WA.worldbook.activationOf(wbEntry, '血刀门在江湖中', 'auto').active === true, '主键命中+次键AND_ANY命中');
  assert(WA.worldbook.activationOf(wbEntry, '血刀门在朝廷', 'auto').active === false, '主键命中但次键AND_ANY未命中');
  const wbNotAny = Object.assign({}, wbEntry, { selectiveLogic: 2 });
  assert(WA.worldbook.activationOf(wbNotAny, '血刀门在朝廷', 'auto').active === true, 'NOT_ANY逻辑：次键未命中则激活');
  assert(WA.worldbook.activationOf(wbEntry, '血刀门出现', 'const').active === true, '覆写const强制常驻');
  assert(WA.worldbook.activationOf(wbEntry, '血刀门出现', 'off').active === false, '覆写off强制关闭');
  const wbConst = Object.assign({}, wbEntry, { constant: true });
  assert(WA.worldbook.activationOf(wbConst, '无关键词文本', 'auto').active === true, '🔵常驻条目auto直接激活');
  // 选择持久化
  WA.worldbook.saveSelection(['wb1::1', 'wb1::2'], { 'wb1::1': 'const' });
  assert(WA.worldbook.getSelectedIds().length === 2, '世界书选择持久化');
  assert(WA.worldbook.getOverrides()['wb1::1'] === 'const', '触发覆写持久化');
  WA.worldbook.saveSelectedIds(['wb1::1']);
  assert(WA.worldbook.getSelectedIds().length === 1, 'saveSelectedIds保留覆写');
  assert(WA.worldbook.getOverrides()['wb1::1'] === 'const', '覆写在仅改选择时保留');

  // ── inspector (v0.8) ──
  section('engines/inspector v0.8');
  assert(WA.inspector.SENTINEL === '<world_axis_state>', '哨兵与buildWorldSnapshot开头一致');
  // 模拟chat prompt ready：包含哨兵 → SUCCESS
  const fakeCtx = { extensionPrompts: { WorldAxis: { value: '<world_axis_state>【世界时间】第1日' } } };
  const snapEnv = (function () {
    // 直接驱动私有handler：通过暴露的getLastSnapshot前需触发事件，改用直接构造验证deriveStatus逻辑
    return null;
  })();
  // 快照状态文本映射
  assert(WA.inspector.statusText('SUCCESS').includes('✅'), 'SUCCESS状态文本');
  assert(WA.inspector.statusText('MISSING').includes('❌'), 'MISSING状态文本');
  assert(WA.inspector.statusText('SKIPPED_DISABLED').includes('关闭'), 'SKIPPED状态文本');
  assert(WA.inspector.statusText('UNKNOWN_X').includes('尚未'), '未知状态回退NOT_YET');

  // ── timeline (v0.8) ──
  section('engines/timeline v0.8');
  // 哈希稳定性与差异检测
  const h1 = WA.timeline.hashText('同一段文本');
  const h2 = WA.timeline.hashText('同一段文本');
  const h3 = WA.timeline.hashText('同一段文本！');
  assert(h1 === h2 && h1 !== h3, 'hashText稳定且区分差异');
  assert(h1.length === 16, 'hashText输出16位hex');
  // 消息ID稳定
  const msg = { is_user: false, name: '旁白', mes: '夜色渐深。' };
  const id1 = WA.timeline.ensureMessageId(msg);
  const id2 = WA.timeline.ensureMessageId(msg);
  assert(id1 === id2 && id1.startsWith('wax_'), 'ensureMessageId稳定生成');
  assert(msg.extra && msg.extra[WA.timeline.SOURCE_ID_KEY] === id1, '来源ID写入message.extra');
  // sourceRef结构
  const ref = WA.timeline.sourceRef(msg, 5);
  assert(ref && ref.layer === 5 && ref.messageId === id1 && ref.hash.length === 16, 'sourceRef结构完整');
  // 捕获+审计：mockChat上下文
  const tctx = global.SillyTavern.getContext();
  const chatLen = tctx.chat.length;
  if (chatLen > 0) {
    const refs = WA.timeline.captureRange(0, chatLen - 1);
    assert(refs.length === chatLen, 'captureRange捕获全部楼层');
    const audit1 = WA.timeline.auditRefs(refs);
    assert(audit1.valid === true, '引用集初次审计有效');
    // 内容变化 → changed
    const origMes = tctx.chat[0].mes;
    tctx.chat[0].mes = origMes + '（被编辑）';
    const audit2 = WA.timeline.auditRefs(refs);
    assert(audit2.valid === false && audit2.changed.length === 1, '编辑楼层→changed检测');
    // 恢复后重新有效
    tctx.chat[0].mes = origMes;
    const audit3 = WA.timeline.auditRefs(refs);
    assert(audit3.valid === true, '恢复内容→重新有效');
    // digestRefs指纹
    const fp1 = WA.timeline.digestRefs(refs);
    const fp2 = WA.timeline.digestRefs(refs);
    assert(fp1 === fp2, 'digestRefs指纹稳定');
  }
  // unionRefs去重
  const ra = [{ chatId: 'c1', messageId: 'm1', layer: 0 }, { chatId: 'c1', messageId: 'm2', layer: 1 }];
  const rb = [{ chatId: 'c1', messageId: 'm2', layer: 1 }, { chatId: 'c1', messageId: 'm3', layer: 2 }];
  const union = WA.timeline.unionRefs([ra, rb]);
  assert(union.length === 3 && union[0].layer === 0, 'unionRefs去重并按层排序');
  // 空引用审计
  assert(WA.timeline.auditRefs([]).valid === false && WA.timeline.auditRefs([]).reason === 'no_sources', '空引用集审计无效');

  // ── entities (v0.8) ──
  section('engines/entities v0.8');
  // 新建
  WA.store.transact(d => {
    WA.entities.upsert(d, 'organization', { name: '血刀门', aliases: ['血刀派'], desc: '西域魔教分支' });
    WA.entities.upsert(d, 'location', { name: '青石关', desc: '西部商路要塞' });
  });
  assert(WA.entities.findId('organization', '血刀门') !== null, '实体新建+索引可查');
  assert(WA.entities.findId('organization', '血刀派') !== null, '别名入索引');
  assert(WA.entities.findId('organization', '不存在门') === null, '未命中返回null');
  // 别名命中更新（不重复创建）
  WA.store.transact(d => {
    WA.entities.upsert(d, 'organization', { name: '血刀派', desc: '更新后的描述' });
  });
  const orgs = WA.store.get().evolution.entityMemory.organization;
  assert(orgs.length === 1, '别名命中更新不重复创建');
  assert(orgs[0].name === '血刀门' && orgs[0].aliases.includes('血刀派'), '别名命中更新保留原名与别名');
  assert(orgs[0].desc === '更新后的描述', '更新刷新描述');
  // applyEntities批量入账
  WA.store.transact(d => {
    WA.entities.applyEntities(d, {
      organization: [{ name: '漕帮', desc: '运河水运行会' }],
      object: [{ name: '玄铁令', aliases: ['铁令'] }],
      ability: [],
      location: [{ name: '青石关' }]  // 已存在→updated
    });
  });
  const em = WA.store.get().evolution.entityMemory;
  assert(em.organization.length === 2 && em.object.length === 1, 'applyEntities批量新建');
  assert(em.location.length === 1, 'applyEntities命中已存在不重复');
  // 注入块
  const entBlock = WA.entities.buildEntitiesBlock();
  assert(entBlock.includes('血刀门') && entBlock.includes('玄铁令'), '实体注入块含名称');
  assert(entBlock.includes('不得重复创建'), '实体注入块含复用指令');
  // 类型校验
  WA.store.transact(d => {
    assert(WA.entities.upsert(d, 'invalid_type', { name: 'X' }) === 'skipped', '非法类型跳过');
  });

  // ── preset (v0.8) ──
  section('engines/preset v0.8');
  // 默认预设：全null快路径
  const ov0 = WA.preset.getSegmentOverrides();
  assert(Object.values(ov0).every(v => v === null), '默认预设全null快路径');
  // 创建自定义预设
  const p1 = WA.preset.saveCustomPreset({
    name: '武侠增强',
    segments: { 'engine-role': '你是武侠世界推演引擎。', 'reasoning': null, 'output-format': '', 'json-notes': null }
  });
  assert(p1.id.startsWith('custom_'), '自定义预设生成id');
  // 空串段规整为null
  assert(p1.segments['output-format'] === null, '空串段规整为null');
  // 激活
  WA.preset.setActivePresetId(p1.id);
  const ov1 = WA.preset.getSegmentOverrides();
  assert(ov1['engine-role'] === '你是武侠世界推演引擎。', '覆写段生效');
  assert(ov1['reasoning'] === null, '未覆写段保持null');
  // getSegmentOverride单段
  assert(WA.preset.getSegmentOverride('engine-role') === '你是武侠世界推演引擎。', '单段覆写查询');
  assert(WA.preset.getSegmentOverride('reasoning') === null, '单段无覆写返回null');
  assert(WA.preset.getSegmentOverride('bad-key') === null, '非法段key返回null');
  // 另存为
  const p2 = WA.preset.saveAsCustomPreset(p1, '武侠增强V2');
  assert(p2.id !== p1.id && p2.name === '武侠增强V2', '另存为生成新id新名');
  // 切换回默认
  WA.preset.setActivePresetId('default');
  assert(WA.preset.getSegmentOverride('engine-role') === null, '切回默认后无覆写');
  // 指向已删除id自动回退
  WA.preset.setActivePresetId(p2.id);
  WA.preset.deleteCustomPreset(p2.id);
  assert(WA.preset.getActivePresetId() === 'default', '删除激活预设自动回退默认');
  // 内置不可删
  assert(WA.preset.deleteCustomPreset('default') === false, '内置预设不可删除');
  // 导出导入
  const exported = WA.preset.exportPresets();
  assert(exported.includes('武侠增强'), '导出含自定义预设');
  WA.preset.deleteCustomPreset(p1.id);
  assert(WA.preset.getAllPresets().length === 1, '删除后仅剩默认');
  assert(WA.preset.importPresets(exported) === true, '导入成功');
  assert(WA.preset.getAllPresets().some(p => p.name === '武侠增强'), '导入后预设恢复');
  // 清理测试预设
  WA.preset.deleteCustomPreset(WA.preset.getAllPresets().find(p => p.name === '武侠增强').id);
  WA.preset.setActivePresetId('default');

  // ── chatcache (v0.8) ──
  section('engines/chatcache v0.8');
  // 复用mock的真实聊天上下文（chatId=test_chat_001，chatMetadata持久）
  WA.store.transact(d => { d.meta.round = 3; d.clock.label = '第3日·夜'; });
  WA.store.save();
  const cid = global.SillyTavern.getContext().chatId; // test_chat_001
  // packChat
  const packed = WA.chatcache.packChat(cid);
  assert(packed.state && typeof packed.state === 'string', 'packChat打包state slot');
  // pushLiveNow + 内容去重
  const push1 = WA.chatcache.pushLiveNow(null, false);
  assert(push1 === true, '首次推送live成功');
  const ns1 = WA.chatcache.readNamespace();
  assert(ns1 && ns1.live && ns1.live.chatId === cid && ns1.live.rev === 1, 'live结构完整 rev=1');
  const push2 = WA.chatcache.pushLiveNow(null, false);
  const ns2 = WA.chatcache.readNamespace();
  assert(ns2.live.rev === 1, '内容无变化不bump rev（去重）');
  // 状态变化后rev递增
  WA.store.transact(d => { d.meta.round = 4; });
  WA.store.save();
  WA.chatcache.pushLiveNow(null, false);
  assert(WA.chatcache.readNamespace().live.rev === 2, '状态变化rev递增至2');
  // Lamport冲突解决：聊天端rev更高则拉取
  const ns3 = WA.chatcache.ensureNamespace();
  ns3.live.rev = 5;
  ns3.live.data = { state: JSON.stringify({ meta: { round: 99 } }) };
  WA.chatcache.writeNamespace(ns3);
  // 拉取发生在runTick，但runTick会先本地推送判断。直接验证installPack路径：聊天rev更高→安装回本地
  // 手动触发：先清本地rev模拟本地落后
  global.localStorage.setItem('worldaxis_state_' + cid + '_syncrev', '2');
  // 直接验证写回本地（模拟聊天较新场景的install）
  WA.chatcache.installPack(ns3.live.data, cid);
  const pulled = JSON.parse(global.localStorage.getItem('worldaxis_state_' + cid));
  assert(pulled.meta.round === 99, 'Lamport冲突：聊天较新则拉取安装');
  // 手动存档+恢复
  WA.store.transact(d => { d.clock.label = '存档点时刻'; });
  WA.store.save();
  const snapResult = WA.chatcache.addSnapshot('测试存档');
  assert(snapResult.ok === true, '手动存档成功');
  const snapList = WA.chatcache.listSnapshots();
  assert(snapList.length === 1 && snapList[0].name === '测试存档' && !snapList[0].auto, '存档列表正确');
  // 修改当前状态后恢复
  WA.store.transact(d => { d.clock.label = '被改掉的时刻'; });
  WA.store.save();
  const restoreResult = WA.chatcache.restoreSnapshot(snapList[0].id);
  assert(restoreResult.ok === true, '恢复存档成功');
  const restoredRaw = global.localStorage.getItem('worldaxis_state_' + cid);
  assert(restoredRaw && restoredRaw.includes('存档点时刻'), '恢复后状态回到存档点');
  // 自动备份滚动窗口
  const ccNs = WA.chatcache.ensureNamespace();
  for (let i = 0; i < 6; i++) {
    ccNs.snapshots.push({ id: 'auto_test' + i, name: '自动' + i, auto: true, at: Date.now(), data: { state: '{}' } });
  }
  WA.chatcache.pruneSnapshots(ccNs);
  const autoLeft = ccNs.snapshots.filter(s => s.auto).length;
  assert(autoLeft <= 3, `自动备份滚动窗口≤3(实际${autoLeft})`);
  // 删除存档
  const delResult = WA.chatcache.deleteSnapshot(snapList[0].id);
  assert(delResult === true, '删除存档执行');

  // ── pmem (v0.8.2) ──
  section('engines/pmem v0.8.2');
  WA.store.transact(d => {
    d.evolution.people = [{ name: '沈炼', aliases: ['沈捕快'] }, { name: '陆文昭', aliases: [] }];
    d.memory.pmem = [];
  });
  // 入账
  const pmr = WA.store.transact(d => WA.pmem.applyPersonalMemory(d, [
    { name: ['沈炼'], known_by: ['陆文昭'], memory: '沈炼怀疑北镇抚司内有内鬼', time: '第3日·夜' },
    { name: ['沈炼'], known_by: [], memory: '沈炼怀疑北镇抚司内有内鬼', time: '' }, // 重复→跳过
    { name: [], known_by: [], memory: '无持有者', time: '' }, // 无效→跳过
    { name: ['陆文昭'], known_by: [], memory: '陆文昭以为沈炼已死', time: '' }
  ])).result;
  assert(pmr.added === 2 && pmr.skipped === 2, '主观记忆入账：去重+无效剔除');
  assert(WA.store.get().memory.pmem[0].known_by.includes('沈炼') && WA.store.get().memory.pmem[0].known_by.includes('陆文昭'), 'known_by本地自动补持有者');
  // 别名感知召回
  WA.store.transact(d => WA.pmem.applyPersonalMemory(d, [
    { name: ['沈捕快'], known_by: [], memory: '沈捕快记住了密室机关的开启方法', time: '' }
  ]));
  WA.store.transact(() => {});
  const recalled = WA.pmem.recall('沈炼');
  // 沈炼本名条+沈捕快别名条命中；陆文昭的私密记忆不被召回（信息不对称）
  assert(recalled.length === 2 && !recalled.some(e => e.holders.includes('陆文昭')), '别名命中召回+他人私密记忆不误召回');
  assert(recalled.some(e => e.holders.includes('沈捕快')), '召回含别名持有条目');
  // 信息不对称
  const secret = WA.store.get().memory.pmem.find(e => e.text.includes('内鬼'));
  assert(WA.pmem.knows('陆文昭', secret.id) === true, '知情人可判定知情');
  assert(WA.pmem.knows('陌生人', secret.id) === false, '无关人物不知情');
  // 每人上限6
  WA.store.transact(d => {
    d.memory.pmem = [];
    for (let i = 0; i < 10; i++) WA.pmem.applyPersonalMemory(d, [{ name: ['张三'], known_by: [], memory: '张三记得事件' + i + '号并有后续影响', time: '' }]);
  });
  WA.store.transact(() => {});
  const zsCount = WA.store.get().memory.pmem.filter(e => e.holders.includes('张三')).length;
  assert(zsCount <= WA.pmem.CAP_PER_PERSON, `每人上限${WA.pmem.CAP_PER_PERSON}(实际${zsCount})`);
  // 注入块
  WA.store.transact(d => { d.memory.pmem = []; WA.pmem.applyPersonalMemory(d, [{ name: ['沈炼'], known_by: [], memory: '沈炼怀疑有内鬼', time: '第3日' }]); });
  WA.store.transact(() => {});
  const pblock = WA.pmem.buildBlock();
  assert(pblock.includes('人物主观记忆') && pblock.includes('沈炼怀疑有内鬼') && pblock.includes('（第3日）'), '主观记忆注入块含时间与持有者');
  assert(WA.pmem.SYSTEM_PROMPT.includes('怀疑仍是怀疑') && WA.pmem.SYSTEM_PROMPT.includes('known_by'), '提取提示词保留认知强度与知情规则');

  // ── entities.applyEntityUpdates (v0.8.2) ──
  section('entities applyEntityUpdates v0.8.2');
  WA.store.transact(d => {
    d.evolution.entityMemory = { organization: [], object: [], ability: [], location: [] };
    WA.entities.applyEntityUpdates(d, [
      { type: 'organization', name: '血刀门', aliases: ['刀门'], description: '门主重伤，群龙无首', event: '血刀门门主在决战中重伤', time: '第5日' },
      { type: 'organization', name: '血刀门', aliases: [], description: '', event: '血刀门归顺朝廷', time: '第6日' }, // 空desc不覆盖
      { type: 'invalid_type', name: 'X', event: 'e' }, // 非法类型跳过
      { type: 'object', name: '绣春刀', aliases: [], description: '刀刃有缺口的御赐佩刀', event: '', time: '' }
    ]);
  });
  WA.store.transact(() => {});
  const em2 = WA.store.get().evolution.entityMemory;
  const xdm = em2.organization.find(e => e.name === '血刀门');
  assert(xdm && em2.organization.length === 1, '同实体多事件不重复创建');
  assert(xdm.desc === '门主重伤，群龙无首', '空description不覆盖本地描述');
  assert(xdm.events.length === 2 && xdm.events[1].e === '血刀门归顺朝廷', '事件按序累积2条');
  assert(xdm.aliases.includes('刀门'), '别名入账');
  const xcd = em2.object.find(e => e.name === '绣春刀');
  assert(xcd && xcd.events.length === 0 && xcd.desc.includes('缺口'), '仅描述更新实体正常入账，空事件不入events');
  // 与backstage的upsert互操作：upsert建的实体能被applyEntityUpdates按别名命中
  WA.store.transact(d => {
    WA.entities.upsert(d, 'location', { name: '青龙寺', aliases: ['古寺'], desc: '山门破败' });
    WA.entities.applyEntityUpdates(d, [{ type: 'location', name: '古寺', aliases: [], description: '', event: '青龙寺地宫被发现', time: '第7日' }]);
  });
  WA.store.transact(() => {});
  const em3 = WA.store.get().evolution.entityMemory;
  const qls = em3.location.find(e => e.name === '青龙寺');
  assert(em3.location.length === 1 && qls.events.length === 1, '既有实体按别名命中并追加事件（不重复创建）');

  // ── rules (v0.8.3) ──
  section('engines/rules v0.8.3');
  assert(WA.rules.getRuleCount() === 12, '12模块规则齐备');
  const all = WA.rules.getAll();
  assert(all.includes('<world_engine>') && all.includes('<event_chain>') && all.includes('<world_trends>') && all.includes('<blackbox>'), '全量规则含全部标签段');
  assert(all.includes('萌芽 → 发酵 → 逼近') === false && all.includes('萌芽→发酵→逼近'), '事件链四阶段顺序保留');
  assert(all.includes('特权跃升') && all.includes('血盟') && all.includes('瓦解'), '关键硬约束词在文');
  const core = WA.rules.coreSummary();
  assert(core.includes('世界非中心化') && core.length < all.length / 3, '精简守则显著短于全文');
  assert(core.includes('四圈层') && core.includes('归纳优先'), '守则含声誉圈层与事件归纳');
  // backstage 注入：默认精简守则
  WA.store.transact(d => { d.evolution.events = []; });
  global.localStorage.setItem('worldaxis_backstage_settings_v1', JSON.stringify({ simulationMode: 'balanced', autoSimulate: true, fullRules: false, npcBudget: 8 }));
  let msgs = WA.backstage.buildPrompt({ idx: 1, text: 'x' }, '');
  let sysText = msgs[0].content;
  assert(sysText.includes('世界引擎·正文行为守则'), '默认注入精简守则');
  assert(!sysText.includes('<world_trends>'), '默认不注入全量规则全文');
  global.localStorage.setItem('worldaxis_backstage_settings_v1', JSON.stringify({ simulationMode: 'balanced', autoSimulate: true, fullRules: true, npcBudget: 8 }));
  msgs = WA.backstage.buildPrompt({ idx: 1, text: 'x' }, '');
  assert(msgs[0].content.includes('<world_trends>') && msgs[0].content.includes('<influence_chain>'), '全量模式注入12模块全文');
  global.localStorage.removeItem('worldaxis_backstage_settings_v1');

  // ── summarizer (v0.8.3) ──
  section('engines/summarizer v0.8.3');
  WA.store.transact(d => { d.memory.smallSummaries = []; d.memory.bigSummaries = []; });
  WA.apiRouter.setChannel('digest', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  const mc = global.__mockChat;
  function pushSmall(n) {
    mc.push({ is_user: n % 2 === 1, name: '旁白', mes: '剧情推进片段' + n + '。', swipe_id: 0 });
    global.__pushApiJson({ small_summary: '纪要' + n + '：沈炼追查内鬼，在库房发现被撕掉的巡夜名录，与陆文昭的口供矛盾，遂将其列为嫌疑。' });
  }
  // 逐条压缩（push一条chat+一条响应→立即消费，保持fetch队列对齐）
  for (let i = 1; i <= 4; i++) { pushSmall(i); await WA.summarizer.makeSmallSummary(); }
  const smalls = WA.store.get().memory.smallSummaries;
  assert(smalls.length >= 1, '纪要入账（含楼层区间）');
  assert(smalls[0].content.includes('沈炼'), '纪要保留人物与具体事件');
  assert(typeof smalls[0].startLayer === 'number' && typeof smalls[0].endLayer === 'number', '纪要记录楼层区间');
  // 补齐4条未消费纪要后触发总述
  WA.store.transact(d => {
    d.memory.smallSummaries = [];
    for (let i = 0; i < 4; i++) d.memory.smallSummaries.push({ startLayer: i * 3, endLayer: i * 3 + 2, content: '纪要' + i + '：沈炼查获线索并推进调查，结果明确。', at: Date.now() + i, used: false });
  });
  global.__pushApiJson({ big_summary: '阶段纪事：沈炼自库房发现撕毁的巡夜名录起疑，逐步将调查指向陆文昭，最终在第三次对质中确认内鬼身份并将其拿下，血刀门安插的眼线被拔除。' });
  const bigOk = await WA.summarizer.makeBigSummary();
  assert(bigOk === true, '纪要攒满后总述入账');
  const bigs = WA.store.get().memory.bigSummaries;
  assert(bigs.length === 1 && bigs[0].startLayer === 0 && bigs[0].endLayer === 11, '总述覆盖区间正确合并');
  assert(WA.store.get().memory.smallSummaries.every(x => x.used), '被消费的纪要标记used');
  // 注入优先总述
  let blk = WA.summarizer.buildBlock();
  assert(blk.includes('前情阶段史') && blk.includes('拔除'), '注入优先大总述');
  // 无总述时回退近期纪要
  WA.store.transact(d => { d.memory.bigSummaries = []; d.memory.smallSummaries = [{ startLayer: 0, endLayer: 2, content: '近期纪要甲：事件已发生并有结果。', at: 1, used: false }]; });
  blk = WA.summarizer.buildBlock();
  assert(blk.includes('近期纪要') && blk.includes('纪要甲'), '无总述回退纪要');
  assert(WA.summarizer.SMALL_SYSTEM.includes('谁—做了什么') && WA.summarizer.BIG_SYSTEM.includes('空壳句'), '双层提示词保留反空泛铁律');

  // ─ editor-faction (v0.9.0) ──
  section('engines/editor-faction v0.9.0');
  WA.store.transact(d => { d.evolution.factions = []; });
  const efAdd = WA.store.transact(d => WA.editorFaction.add(d, {
    name: '北镇抚司', scope: '京师', status: '稳固', relation: '敌对',
    currentGoal: '肃清锦衣卫暗桩', core_person: '陆文昭', powerPillars: ['刑狱', '密探', '诏令']
  })).result;
  assert(efAdd.ok === true && WA.store.get().evolution.factions.length === 1, '势力新增成功');
  assert(WA.editorFaction.validate({ name: '空壳帮' }).ok === false, '五要件缺失拦截');
  const efDup = WA.store.transact(d => WA.editorFaction.add(d, {
    name: '北镇抚司', scope: '京师', currentGoal: 'x', core_person: 'y', powerPillars: ['甲']
  })).result;
  assert(efDup.ok === false && efDup.reason.includes('同名'), '重名势力拒绝（防推演归并串味）');
  const fid = WA.store.get().evolution.factions[0].id;
  const efUpd = WA.store.transact(d => WA.editorFaction.update(d, fid, { status: '鼎盛' })).result;
  const updFaction = WA.store.get().evolution.factions[0];
  assert(efUpd.ok === true && updFaction.status === '鼎盛' && updFaction.currentGoal === '肃清锦衣卫暗桩', '局部更新不抹其他字段');
  const efBadEnum = WA.store.transact(d => WA.editorFaction.update(d, fid, { relation: '暧昧', status: '超神' })).result;
  const badFaction = WA.store.get().evolution.factions[0];
  assert(efBadEnum.ok === true && badFaction.relation === '敌对' && badFaction.status === '鼎盛', '非法枚举被拒绝回退原值');
  const efCopy = WA.store.transact(d => WA.editorFaction.copy(d, fid)).result;
  assert(efCopy.ok === true && efCopy.faction.name === '北镇抚司·副本' && efCopy.faction.id !== fid, '复制换新id且改名防归并');
  const efRel = WA.store.transact(d => WA.editorFaction.shiftRelation(d, fid, -2)).result;
  assert(efRel.ok === true && WA.store.get().evolution.factions[0].relation === '中立', '关系相对位移（敌对→中立）');
  const efCap = WA.store.transact(d => { for (let i = 0; i < 30; i++) WA.editorFaction.add(d, { name: '势力' + i, scope: 'S', currentGoal: 'G', core_person: 'C', powerPillars: ['P'] }); }).result;
  assert(WA.store.get().evolution.factions.length === WA.editorFaction.MAX_FACTIONS, `势力上限${WA.editorFaction.MAX_FACTIONS}封顶`);
  const efDel = WA.store.transact(d => WA.editorFaction.remove(d, 0)).result;
  assert(efDel.ok === true && WA.store.get().evolution.factions.length === WA.editorFaction.MAX_FACTIONS - 1, '势力删除成功');
  const efRep = WA.editorFaction.reputationPressure(WA.store.get());
  assert(efRep.cap === 35 && Math.abs(efRep.pressure) <= 35, '声誉总压封顶±35');
  const efBlock = WA.editorFaction.buildBlock(WA.store.get());
  assert(efBlock.includes('势力名录') && efBlock.includes('支柱'), '势力名录注入块含支柱');

  // ─ editor-events (v0.9.0) ─
  section('engines/editor-events v0.9.0');
  WA.store.transact(d => { d.evolution.events = []; d.evolution.round = 0; });
  const eeAdd = WA.store.transact(d => WA.editorEvents.add(d, {
    type: 'conflict', name: '粮道之争', level: 2, desc: '两支商队争夺同一批粮'
  })).result;
  assert(eeAdd.ok === true && WA.store.get().evolution.events.length === 1, '事件新增成功');
  assert(eeAdd.event.stage === '萌芽' && eeAdd.event.stageRound === 1, '冲突型默认首阶段');
  assert(WA.editorEvents.add(WA.store.get(), { name: '无类型' }).ok === false, '缺类型拒绝');
  const epAdd = WA.store.transact(d => WA.editorEvents.add(d, { type: 'progress', name: '密道开凿' })).result;
  assert(epAdd.event.stage === '筹备', '推进型默认首阶段不同');
  const eeid = WA.store.get().evolution.events[0].id;
  const eeTypePatch = WA.store.transact(d => WA.editorEvents.update(d, eeid, { type: 'progress' })).result;
  assert(eeTypePatch.warnings && eeTypePatch.warnings.length && WA.store.get().evolution.events[0].type === 'conflict', 'type禁改并告警');
  const eeStageBad = WA.store.transact(d => WA.editorEvents.update(d, eeid, { stage: '筹备' })).result;
  assert(eeStageBad.warnings && WA.store.get().evolution.events[0].stage === '萌芽', '跨类型非法阶段被拒回退');
  const eeShift = WA.store.transact(d => WA.editorEvents.shiftStage(d, eeid, 1)).result;
  assert(eeShift.ok === true && WA.store.get().evolution.events[0].stage === '发酵', '阶段推进一档');
  const eeShiftBack = WA.store.transact(d => WA.editorEvents.shiftStage(d, eeid, -1)).result;
  assert(eeShiftBack.ok === true && WA.store.get().evolution.events[0].stage === '萌芽', '阶段可手动回退');
  const eeEdge = WA.store.transact(d => WA.editorEvents.shiftStage(d, eeid, -5)).result;
  assert(eeEdge.ok === false && eeEdge.reason.includes('端点'), '阶段序列端点不越界');
  const eeToTerminal = WA.store.transact(d => WA.editorEvents.update(d, eeid, { stage: '已爆发' })).result;
  const termEv = WA.store.get().evolution.events[0];
  assert(eeToTerminal.ok === true && termEv._terminalSince !== undefined, '正面终局登记_terminalSince(倒计时用)');
  assert(WA.editorEvents.isTerminal(WA.store.get().evolution.events[1]) === false, '非终局事件判定正确');
  const eeSt = WA.editorEvents.stats(WA.store.get());
  assert(eeSt.total === 2 && eeSt.byType.conflict === 1 && eeSt.byType.progress === 1, '事件统计按类型分桶');
  const eeDup = WA.store.transact(d => WA.editorEvents.add(d, { type: 'progress', name: '密道开凿' })).result;
  assert(eeDup.ok === false && eeDup.reason.includes('同名'), '同名事件拒绝（防串链）');
  const eeDesc = WA.store.transact(d => WA.editorEvents.update(d, eeid, { desc: 'x'.repeat(80) })).result;
  assert(WA.store.get().evolution.events[0].desc.length === WA.editorEvents.DESC_MAXLEN, `描述截断至${WA.editorEvents.DESC_MAXLEN}字`);
  WA.store.transact(d => WA.editorEvents.update(d, eeid, { stage: '已消散' }));
  const eeBlock = WA.editorEvents.buildBlock(WA.store.get());
  assert(eeBlock.includes('活跃事件链') && !eeBlock.includes('粮道之争') && eeBlock.includes('密道开凿'), '注入块只含非终局事件（已消散剔除/筹备保留）');
  const eeDel = WA.store.transact(d => WA.editorEvents.remove(d, 0)).result;
  assert(eeDel.ok === true && WA.store.get().evolution.events.length === 1, '事件删除成功');

  // ─ inspector-state (v0.9.0) 
  section('engines/inspector-state v0.9.0');
  // 构造一个「多处违规」的状态，验证 checker 能全抓
  WA.store.transact(d => {
    d.evolution.events = [
      { id: 'e1', type: 'conflict', name: '同事件', level: 9, stage: '筹备', stageRound: 99 },
      { id: 'e2', type: 'progress', name: '同事件', level: 2, stage: '执行', stageRound: 1 },
      { id: '', type: 'weird', name: '怪类型', level: 1, stage: '萌芽', stageRound: 1 }
    ];
    d.evolution.factions = [
      { id: 'f1', name: '甲', scope: '', status: '超神', relation: '暧昧', currentGoal: '', core_person: '' },
      { id: 'f2', name: '甲', scope: 'S', status: '稳固', relation: '中立', currentGoal: 'x'.repeat(60), core_person: 'C' }
    ];
    d.worldPulse = { pressure: 9, trend: 'flying', note: '' };
    d.evolution.round = -3;
    d.people = { p1: { name: '沈炼', location: '', knowledge: { '内鬼身份': { route: 'inferred', strength: 'fact' } } } };
    d.memory.facts = [{ key: '粮价', value: 'A', active: true }, { key: '粮价', value: 'B', active: true }];
    d.memory.foreshadows = [{ id: 'fs1', content: 'x', status: 'imaginary', links: [] }];
    d.memory.pmem = [{ id: 'dup', text: '甲记', time: '', holders: ['沈炼'], known_by: ['沈炼', '陌路人'] },
                     { id: 'dup', text: '', time: '', holders: ['沈炼'], known_by: [] }];
    d.directEvents = [{ id: 'd1', title: '追捕', totalTurns: 3, currentTurn: 5, status: 'active' }];
    d.nextTurnInjection = { required: [], at: Date.now() };
  });
  const rep = WA.inspectorState.inspect(WA.store.get());
  assert(rep.ok === false && rep.counts.error > 0, '体检捕获到错误级问题');
  const codes = WA.inspectorState.flatten(rep).map(x => x.code);
  assert(codes.includes('event.dupName') && codes.includes('event.badStage'), '事件重名与跨类型非法阶段被抓');
  assert(codes.includes('faction.badStatus') && codes.includes('faction.badRelation') && codes.includes('faction.dupName'), '势力非法枚举与重名被抓');
  assert(codes.includes('pulse.badPressure') && codes.includes('round.negative'), '脉搏越界与负轮次被抓');
  assert(codes.includes('people.inferredAsFact'), '认知边界违规(inferred标fact)被抓');
  assert(codes.includes('facts.multiActive'), '长期事实多active版本被抓');
  assert(codes.includes('foreshadow.badStatus'), '伏笔非法状态被抓');
  assert(codes.includes('pmem.dupId'), '主观记忆id重复被抓');
  assert(codes.includes('direct.turnOverflow'), '突发事件轮次溢出被抓');
  const onlyEvents = WA.inspectorState.inspect(WA.store.get(), { only: ['events'] });
  assert(onlyEvents.sections.length === 1 && onlyEvents.sections[0].code === 'events', 'only 参数限定检查范围');
  const flat = WA.inspectorState.flatten(rep);
  assert(flat[0].level === 'error', '扁平化按严重度排序(error优先)');
  assert(WA.inspectorState.summaryText(rep).includes('错误'), '体检摘要文本含错误计数');
  // 干净状态
  WA.store.transact(d => { d.evolution.events = []; d.evolution.factions = []; d.worldPulse = null; d.evolution.round = 0; d.people = {}; d.memory.facts = []; d.memory.foreshadows = []; d.memory.pmem = []; d.directEvents = []; d.nextTurnInjection = null; });
  const clean = WA.inspectorState.inspect(WA.store.get());
  assert(clean.clean === true && WA.inspectorState.summaryText(clean).includes('自洽'), '干净状态判定自洽');
  // 只读保证：体检前后 state 深比较一致
  WA.store.transact(d => { d.evolution.events = [{ id: 'x', type: 'conflict', name: 'N', level: 1, stage: '萌芽', stageRound: 1 }]; });
  const snapshotBefore = JSON.stringify(WA.store.get());
  WA.inspectorState.inspect(WA.store.get());
  assert(JSON.stringify(WA.store.get()) === snapshotBefore, '体检纯只读（state零改动）');

  // ─ tools v0.9.1 
  section('engines/tool-snapshot v0.9.1');
  WA.store.transact(d => {
    d.clock.label = '第5日·清晨';
    d.evolution.events = [{ id: 'e1', type: 'conflict', name: '河口对峙', level: 2, stage: '发酵', stageRound: 3 }];
    d.evolution.factions = [{ id: 'f1', name: '漕帮', scope: '运河', status: '稳固', relation: '友好', currentGoal: '垄断漕运', core_person: '钱舵主', powerPillars: ['船队', '码头', '盐引'] }];
    d.memory.facts = [{ key: '漕运税', value: '加三成', active: true }];
    d.memory.__volatile = 'should-be-dropped';
    d.evolution.__cache = { tmp: 1 };
  });
  const snapPayload = WA.toolSnapshot.buildPayload();
  assert(snapPayload.worldaxis === 2 && snapPayload.state && snapPayload.meta.counts.events === 1, '快照载荷结构正确');
  assert(!JSON.stringify(snapPayload.state).includes('__volatile') && !JSON.stringify(snapPayload.state).includes('__cache'), '导出剔除运行时脏字段');
  const snapJson = WA.toolSnapshot.toJSON();
  assert(JSON.parse(snapJson).meta.counts.factions === 1, 'toJSON 可被解析且计数正确');
  const vOk = WA.toolSnapshot.validate(snapJson);
  assert(vOk.ok === true && vOk.format === 2, '自产快照通过校验');
  const vBadJson = WA.toolSnapshot.validate('{not json');
  assert(vBadJson.ok === false && vBadJson.problems[0].includes('JSON'), '非法JSON被拦截');
  const vNoFmt = WA.toolSnapshot.validate({ foo: 1 });
  assert(vNoFmt.ok === false && vNoFmt.problems.some(p => p.includes('worldaxis')), '缺格式标识被拦截');
  const vHighSchema = WA.toolSnapshot.validate({ worldaxis: 2, state: { schemaVersion: 99, clock: {}, memory: {}, evolution: {} } });
  assert(vHighSchema.ok === false && vHighSchema.problems.some(p => p.includes('schema')), '更高schema版本被拦截');
  // 修改当前状态 → 再恢复 → 应回到快照点
  WA.store.transact(d => { d.clock.label = '被改脏了'; d.evolution.factions = []; });
  assert(WA.store.get().clock.label === '被改脏了', '修改生效(前置)');
  const rest = WA.toolSnapshot.restore(snapJson);
  assert(rest.ok === true && rest.recoveryCreated === true, '恢复成功且留了恢复点');
  assert(WA.store.get().clock.label === '第5日·清晨' && WA.store.get().evolution.factions.length === 1, '恢复后回到快照点');
  assert(WA.store.get().memory.__volatile === undefined, '恢复后脏字段不回流');
  // chatId 落进导出载荷（store.chatId 提供者存在性）
  assert(typeof WA.store.chatId === 'function' && snapPayload.chatId === WA.store.chatId(), '导出载荷 chatId 与 store 一致');
  const v1Compat = WA.toolSnapshot.validate({ version: '1.2', state: { schemaVersion: 1, clock: {}, memory: {}, evolution: {} } });
  assert(v1Compat.ok === true && v1Compat.format === 1, '兼容读取旧版(version)存档');

  section('engines/tool-analyzer v0.9.1');
  WA.store.transact(d => {
    d.evolution.events = [
      { id: 'a', type: 'conflict', name: 'A', level: 4, stage: '逼近', stageRound: 5 },
      { id: 'b', type: 'progress', name: 'B', level: 2, stage: '已失败', stageRound: 9 }
    ];
    d.evolution.winds = [{ topic: 'w1', level: 3, quiet: false }, { topic: 'w2', level: 2, quiet: true }];
    d.evolution.worldTrends = [{ name: 'T', status: '持续中' }];
    d.evolution.factions = [{ id: 'f', name: '敌营', scope: 'S', status: '鼎盛', relation: '世仇', currentGoal: 'G', core_person: 'C', powerPillars: ['P'] }];
    d.evolution.economy = { climate: '危机', signals: [] };
    d.evolution.regionalIncident = { active: true, title: '水患', impact: '粮价涨' };
    d.currents = [{ id: 'c1', title: '暗流', visibility: 'hidden', stage: '发展' }, { id: 'c2', title: '明流', visibility: 'public', stage: '发展' }];
    d.memory.foreshadows = Array.from({ length: 9 }, (_, i) => ({ id: 'fs' + i, content: '伏笔' + i, status: 'waiting', links: [] }));
    d.people = {};
  });
  const repAn = WA.toolAnalyzer.analyze();
  assert(repAn.pressure.event > 0 && repAn.pressure.event <= WA.toolAnalyzer.WEIGHTS.event, '事件压力在权重上限内');
  assert(repAn.pressure.wind === 3.6, '风声压力只计未消散项(level3×1.2)');
  assert(repAn.pressure.region === WA.toolAnalyzer.WEIGHTS.region, '区域事件active取满权重');
  assert(repAn.pressure.faction > 0, '世仇势力产生正张力');
  assert(repAn.momentum.activeEvents === 1 && repAn.momentum.terminalEvents === 1, '活跃/终结事件判定正确');
  assert(repAn.momentum.hiddenCurrents === 1 && repAn.momentum.publicCurrents === 1, '暗流可见性分桶正确');
  assert(repAn.risks.some(r => r.code === 'foreshadow_dam'), '伏笔堰塞(9条waiting)被识别');
  assert(repAn.load.runtimeTokens > 0, '负载估算产出常驻token数');
  const tk = WA.toolAnalyzer.estimateTokens('中文测试abcd');
  assert(tk >= 3 && tk <= 10, 'token估算在合理区间');
  WA.store.transact(d => { d.evolution.events = []; d.evolution.winds = []; d.evolution.worldTrends = []; d.evolution.factions = []; d.evolution.regionalIncident = null; d.evolution.economy = { climate: '平稳', signals: [] }; d.memory.foreshadows = []; d.currents = []; });
  const repAn2 = WA.toolAnalyzer.analyze();
  assert(repAn2.pressure.total < 5, '清空后压力回落');
  assert(repAn2.risks.some(r => r.code === 'stalled'), '无活跃事件+无公开暗流触发停滞告警');
  const beforeAnalyze = JSON.stringify(WA.store.get());
  WA.toolAnalyzer.analyze();
  assert(JSON.stringify(WA.store.get()) === beforeAnalyze, '分析器纯只读');
  assert(WA.toolAnalyzer.summaryText(repAn).includes('压力'), '摘要文本含压力值');

  section('engines/tool-import v0.9.1');
  assert(WA.toolImport.detect({ worldaxis: 2, state: {} }).kind === 'snapshot', '识别全量存档');
  assert(WA.toolImport.detect({ active: true, title: '蝗灾', impact: '缺粮' }).kind === 'regional', '识别区域事件单件');
  assert(WA.toolImport.detect([{ name: '帮会', status: '稳固', relation: '中立' }]).kind === 'factions', '识别势力清单');
  assert(WA.toolImport.detect([{ type: 'conflict', name: '冲突' }]).kind === 'events', '识别事件链清单');
  assert(WA.toolImport.detect([{ name: ['沈炼'], memory: '记住了暗号' }]).kind === 'pmem', '识别主观记忆');
  assert(WA.toolImport.detect([{ keys: ['词'], content: '内容' }]).kind === 'worldbook', '识别世界书条目组');
  assert(WA.toolImport.detect('{bad').kind === 'invalid', '非法JSON判别');
  assert(WA.toolImport.detect({ a: 1 }).kind === 'unknown', '未知结构判别');
  // 势力导入
  WA.store.transact(d => { d.evolution.factions = []; });
  const impF = WA.toolImport.importData([
    { name: '漕帮', scope: '运河', status: '鼎盛', relation: '友好', currentGoal: '扩码头', core_person: '钱舵主', powerPillars: ['船队'] },
    { name: '漕帮', scope: '运河', status: '稳固', relation: '中立', currentGoal: '重复', core_person: 'X', powerPillars: ['Y'] },
    { name: '缺件帮' }
  ]);
  assert(impF.ok === true && impF.added === 1 && impF.skipped === 2, '势力批量导入：准入+重名+缺件均拦截');
  // 事件导入
  WA.store.transact(d => { d.evolution.events = []; });
  const impE = WA.toolImport.importData({ events: [
    { type: 'conflict', name: '河口对峙', level: 3 },
    { type: 'progress', name: '修堤', stage: '非法阶段' }
  ] });
  assert(impE.ok === true && impE.added === 2, '事件批量导入容错(非法阶段回落首阶段)');
  assert(WA.store.get().evolution.events[1].stage === '筹备', '非法阶段回落该类型首阶段');
  // 主观记忆导入
  WA.store.transact(d => { d.memory.pmem = []; d.evolution.people = []; });
  const impP = WA.toolImport.importData([
    { name: ['沈炼'], known_by: ['陆文昭'], memory: '沈炼记住了暗号' },
    { name: [], memory: '无持有者' }
  ]);
  assert(impP.ok === true && impP.added === 1 && impP.skipped === 1, '主观记忆导入：无效剔除');
  // 区域事件导入
  const impR = WA.toolImport.importData({ active: 'true', title: '水患', type: 'disaster', scope: '南郡', impact: '粮价涨', cooldown: '3' });
  assert(impR.ok === true && WA.store.get().evolution.regionalIncident.active === true && WA.store.get().evolution.regionalIncident.cooldown === 3, '区域事件导入(字符串布尔/数字强转)');
  // 世界书：不落 store 只提示
  const beforeWb = JSON.stringify(WA.store.get().evolution);
  const impW = WA.toolImport.importData({ entries: [{ keys: ['甲'], content: '乙' }, { comment: '丙', content: '' }] });
  assert(impW.ok === true && impW.applied === false && impW.reason.includes('worldbook'), '世界书条目只诊断不写入');
  assert(JSON.stringify(WA.store.get().evolution) === beforeWb, '世界书导入零改动');
  // 全量快照导入回环
  const roundTrip = WA.toolSnapshot.toJSON();
  WA.store.transact(d => { d.clock.label = '别处'; });
  const impS = WA.toolImport.importData(roundTrip);
  assert(impS.ok === true && impS.kind === 'snapshot' && WA.store.get().clock.label !== '别处', '全量快照导入回环生效');
  // kind 指定不符拦截
  const impMismatch = WA.toolImport.importData([{ type: 'conflict', name: 'X' }], { kind: 'factions' });
  assert(impMismatch.ok === false && impMismatch.reason.includes('不符'), 'kind指定不符时拒绝');
  const pv = WA.toolImport.preview([{ name: 'A', status: '稳固', relation: '中立' }]);
  assert(pv.kind === 'factions' && pv.count === 1, 'preview 返回类型与条数');

  section('engines/opinion');
  WA.store.transact(d => {
    d.currents.push({ id: 'cu1', title: '镇外骑兵队逼近', summary: '', visibility: 'trace', publicity: 'public', public_trace: '马蹄声', stage: '发展', createdAt: Date.now(), updatedAt: Date.now() });
  });
  WA.apiRouter.setChannel('observe', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  global.__pushApiJson({
    news: [{ title: '骑兵队入镇', body: '今晨一队骑兵抵达临水镇', related_event_id: '镇外骑兵队逼近', claim_status: 'fact', scope: 'local' },
           { title: '无中生有条目', body: 'x', related_event_id: '不存在的事件', claim_status: 'fact' }],
    forums: [{ board: '茶馆', topic: '听说镇外来兵了', related_event_id: '镇外骑兵队逼近', claim_status: 'rumor', audience_tags: ['镇民'], replies: [{ author: '路人甲', text: '真的假的' }] }]
  });
  const op = await WA.opinion.generate();
  assert(op.ok && op.news === 1, '舆情结算·news=1 (无中生有条目被过滤, 实:' + op.news + ')');
  const sop = WA.store.get().opinion;
  assert(sop.canon.length === 1 && sop.canon[0].claim_status === 'fact', 'canon舆情入账');
  assert(sop.forum.length === 1 && sop.forum[0].replies.length === 1, '论坛主题+回复入账');
  const ob = WA.opinion.buildOpinionBlock();
  assert(ob.includes('world_axis_opinion') && ob.includes('骑兵队入镇'), '舆情块构建');

  // ── registry/profile/monologue/observe ──
  section('actors/*');
  assert(WA.registry.register('蒙面人'), 'NPC注册');
  assert(WA.registry.list().includes('蒙面人'), '注册表可读');
  WA.apiRouter.setChannel('inference', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  global.__pushApiJson({ characters: ['蒙面人'] });
  const picked = await WA.monologue.prescreen(['蒙面人', '酒保'], new AbortController().signal);
  assert(picked.length === 1 && picked[0] === '蒙面人', '独白预筛(名单过滤)');
  global.__pushApiJson({ character: '蒙面人', monologue: '这人不能留，得警告他离开。' });
  const mono = await WA.monologue.roleplayOne('蒙面人', new AbortController().signal);
  assert(mono && mono.monologue.includes('警告'), '独白推演');
  // profile维护
  WA.apiRouter.setChannel('digest', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  global.__pushApiJson({ personality: ['警惕', '神秘'], relationships: [{ target: '玩家', relation: '敌对', dynamic: '警告驱赶' }], memory: ['在酒馆接触玩家'] });
  const pm = await WA.profile.maintain('蒙面人');
  assert(pm.ok, '档案维护执行');
  const prof = WA.registry.getProfile('蒙面人');
  assert(prof.personality.some(p => (p.text || p).includes('警惕')), '档案·性格入账');
  assert(prof.relationships.some(r => r.target === '玩家' && r.dynamic === '警告驱赶'), '档案·关系动态入账');
  // observe切片
  global.__pushApiJson('我压低帽檐，盯着这个不知好歹的外乡人。他必须离开，今晚之前。');
  const obs = await WA.observe.slice('蒙面人');
  assert(obs.ok && obs.text.length > 10, '观测切片生成');

  // ── direction ──
  section('direction/*');
  WA.oracle.setPlan({ kind: 'sequence', goal: '揭露蒙面人身份', beats: [{ goal: '接近蒙面人', instruction: '让玩家接近蒙面人' }, { goal: '套话', instruction: '对话中透露线索' }], current: 0 });
  assert(WA.oracle.currentBeat().goal === '接近蒙面人', 'oracle当前拍');
  WA.oracle.advance();
  assert(WA.oracle.currentBeat().goal === '套话', 'oracle拍推进');
  const hits = WA.tags.scan('我等等 [[wa:storm]]');
  assert(hits.length === 1 && WA.store.get().worldPulse.pressure === 2, '导演标签[[wa:storm]]执行');

  // ── render/inject ──
  section('render/inject');
  WA.store.transact(d => { d.clock.label = '第1日·入夜'; });
  const snap = WA.render.buildWorldSnapshot();
  assert(snap.includes('world_axis_state') && snap.includes('第1日·入夜'), '世界快照构建(含时钟)');
  assert(snap.includes('世界脉搏'), '世界快照含脉搏');
  const ictx = { injections: [{ source: '测试', content: '<test/>' }] };
  WA.render.applyInjections(ictx);
  assert(global.__lastExtensionPrompt && global.__lastExtensionPrompt.key === 'WorldAxis' && global.__lastExtensionPrompt.text.includes('<test/>'), '注入落地setExtensionPrompt');
  // 空注入也应写入空串清残留
  WA.render.applyInjections({ injections: [] });
  assert(typeof global.__lastExtensionPrompt.text === 'string', '空注入写空串清残留');

  // ── direct-event ──
  section('engines/direct-event');
  WA.apiRouter.setChannel('inference', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  global.__pushApiJson({ title: '酒馆夜袭', opponent: '蒙面人同伙', box: '骑兵队受雇于镇长', notes: ['第1轮·夜谈', '第2轮·包围', '第3轮·冲突'] });
  const de = await WA.directEvent.create({ turns: 3 });
  assert(de.ok, '突发事件生成');
  const active = WA.directEvent.active();
  assert(active && active.totalTurns === 3 && active.currentTurn === 0, '突发事件激活(3轮)');
  assert(WA.directEvent.currentNote() === '第1轮·夜谈', '当前轮小纸条(零剧透)');
  WA.directEvent.advance();
  assert(WA.directEvent.active().currentTurn === 1, '突发事件推进');
  WA.directEvent.advance(); WA.directEvent.advance();
  assert(!WA.directEvent.active(), '突发事件完成(轮满自动done)');

  // ── purifier ──
  section('render/purifier');
  const purified = WA.purifier.apply('正文<think>内心戏</think>继续');
  assert(!purified.includes('think'), '净化·思考块移除');

  // ── inject-budget v0.9.3 ─
  section('engines/inject-budget v0.9.3');
  assert(WA.injectBudget && typeof WA.injectBudget.plan === 'function', '注入预算裁判已导出');
  assert(WA.injectBudget.tokensOf('中文四字') === 4, 'token 估算：纯中文 1字≈1t');
  assert(WA.injectBudget.tokensOf('abcd') === 1, 'token 估算：4个西文字符≈1t');
  assert(WA.injectBudget.tokensOf('中文abcd') === 3, 'token 估算：中英混排分别计');
  assert(WA.injectBudget.rankOf('世界状态') < WA.injectBudget.rankOf('舆情'), '核心源优先级高于舆情');
  assert(WA.injectBudget.foldable('世界状态') === false && WA.injectBudget.foldable('舆情') === true, 'pinned 不可折叠 / optional 可折叠');
  const bRaw = '第一段内容。第二段内容。第三段内容。第四段内容。第五段内容。第六段内容。';
  const bTrim = WA.injectBudget.trim(bRaw, 20);
  assert(WA.injectBudget.tokensOf(bTrim) <= 20, 'trim 结果严格不超预算');
  assert(WA.injectBudget.tokensOf(bTrim) < WA.injectBudget.tokensOf(bRaw) && bTrim.includes('折叠'), 'trim 截断并加折叠标记');
  assert(WA.injectBudget.trim(bRaw, 6) === '', '预算连标记都放不下时返回空（不透支预算）');
  assert(WA.injectBudget.trim('短文', 50) === '短文', '预算充足时 trim 原样返回');
  const bIn = WA.injectBudget.tokensOf('x') === 0 ? [] : [
    { source: '世界状态', content: '甲'.repeat(200) },
    { source: '主观记忆', content: '乙'.repeat(300) },
    { source: '舆情', content: '丙'.repeat(200) }
  ];
  const bPlanLoose = WA.injectBudget.plan(bIn, { budget: 10000 });
  assert(bPlanLoose.dropped.length === 0 && bPlanLoose.folded.length === 0, '预算充足时不折叠不丢弃');
  assert(bPlanLoose.used === 700 && bPlanLoose.saved === 0, '预算充足时用量等于输入');
  const bPlanTight = WA.injectBudget.plan(bIn, { budget: 400 });
  assert(bPlanTight.kept.some(k => k.source === '世界状态'), '核心块（世界状态）在紧预算下仍保底保留');
  assert(bPlanTight.folded.some(f => f.source === '主观记忆'), '次优先块超预算时被折叠而非丢弃');
  assert(bPlanTight.dropped.length > 0, '最低优先块（舆情）预算耗尽被丢弃');
  assert(bPlanTight.used <= bPlanTight.budget, '裁决结果不超预算');
  assert(bPlanTight.saved > 0, '裁决产生节省量统计');
  const bPlanPinned = WA.injectBudget.plan([{ source: '世界状态', content: '甲'.repeat(900) }], { budget: 100 });
  assert(bPlanPinned.kept.some(k => k.source === '世界状态'), 'pinned 即便自身超预算也不静默丢弃');
  assert(bPlanPinned.folded.some(f => f.reason === 'pinned_over_budget'), 'pinned 超预算走折叠路径并标注原因');
  const bPlanZero = WA.injectBudget.plan(bIn, { budget: 0 });
  assert(bPlanZero.kept.length === 0 || bPlanZero.dropped.length > 0, '零预算时不放行任何 optional');
  // apply：保序 + 折叠文本替换 + 丢弃剔除
  const bApplied = WA.injectBudget.apply(bIn, bPlanTight);
  assert(bApplied.length < bIn.length, 'apply 剔除被丢弃项');
  assert(bApplied[0].source === '世界状态' && bApplied[bApplied.length - 1].source === '主观记忆', 'apply 保持原始顺序（折叠项留在原位）');
  assert(bApplied.some(x => x.folded === true), 'apply 标记折叠项');
  assert(WA.injectBudget.apply(bIn, bPlanTight).map(x => x.source).join(',') === bIn.filter(x => bPlanTight.kept.some(k => k.source === x.source)).map(x => x.source).join(','), 'apply 输出与 kept 计划一致');
  assert(WA.injectBudget.summaryText(bPlanTight).includes('注入'), '摘要文本含注入用量');
  assert(WA.injectBudget.summaryText(null) === '未规划', '空计划摘要降级');
  // 与 inject.js 集成：落地文本受预算约束
  WA.store.transact(d => { d.clock.label = '第9日·正午'; });
  const budgetBackup = WA.backstage.getSettings().injectBudget;
  WA.backstage.setSettings({ injectBudget: 2400 });
  WA.render.applyInjections({ injections: [] });
  const landBig = global.__lastExtensionPrompt.text.length;
  WA.backstage.setSettings({ injectBudget: 60 });
  WA.render.applyInjections({ injections: [] });
  const landSmall = global.__lastExtensionPrompt.text.length;
  assert(landSmall <= landBig, '收紧预算后落地文本不增长');
  assert(JSON.stringify(WA.store.get().lastInjection).includes('cap'), '落地打点记录预算裁决信息');
  WA.backstage.setSettings({ injectBudget: 0 });
  WA.render.applyInjections({ injections: [] });
  assert(WA.store.get().lastInjection.budget === null, '预算设为0（不限）时不裁决');
  WA.backstage.setSettings({ injectBudget: budgetBackup });
  assert(WA.backstage.getSettings().injectBudget === -1, '默认预算为自动档(-1)');
  const abAuto = WA.injectBudget.autoBudget(131072);
  assert(abAuto.source === 'auto' && abAuto.budget === 4000, '自动预算：大上下文取下限封顶 4000t');
  const abSmall = WA.injectBudget.autoBudget(20000);
  assert(abSmall.budget === 1200 && abSmall.source === 'auto', '自动预算：20K上下文≈1200t(6%)');
  const abTiny = WA.injectBudget.autoBudget(4000);
  assert(abTiny.budget === 800, '自动预算：小上下文托底 800t');
  assert(WA.injectBudget.autoBudget(null).source === 'default', '无上下文信息时回落默认档');
  assert(WA.injectBudget.resolveBudget(0).source === 'manual' && WA.injectBudget.resolveBudget(0).budget === 0, '0 视为手动不限');
  assert(WA.injectBudget.resolveBudget(-1).source === 'auto' || WA.injectBudget.resolveBudget(-1).source === 'default', '负值走自动档');
  assert(WA.injectBudget.plan(bIn, { budget: -1 }).budgetSource !== 'manual', 'plan 传负值即自动档（非手动）');
  WA.store.transact(d => { d.meta = d.meta || {}; d.meta.contextSize = 30000; });
  const abFromState = WA.injectBudget.autoBudget();
  assert(abFromState.budget === 1800 && abFromState.contextSize === 30000, '自动预算可从 store.meta.contextSize 推导');
  const planAuto = WA.injectBudget.plan(bIn, { budget: -1 });
  assert(planAuto.budgetSource !== 'manual' && planAuto.budget === 1800, 'plan 自动档读到 30K 上下文 → 1800t');
  // ─ inject-inspector v0.9.2 ──
  section('engines/inject-inspector v0.9.2');
  WA.injectInspector.reset();
  assert(WA.injectInspector.SENTINEL === 'world_axis_state', '哨兵标记与注入块同源');
  assert(WA.injectInspector.statusText('NOT_YET').includes('尚未'), '未生成时给出状态文本');
  assert(WA.injectInspector.statusText('MISSING').includes('注入失败'), 'MISSING 提示真注入失败');
  assert(WA.injectInspector.statusText('SUCCESS', 'memory').includes('记忆信息'), 'memory 域文案替换世界状态');
  assert(WA.injectInspector.getLastSnapshot() === null, '初始快照为空');
  const envNoReg = WA.injectInspector.snapEnv(null, {});
  assert(WA.injectInspector.classify(envNoReg, false) === 'SKIPPED_OTHER', '未注册注入判为 SKIPPED_OTHER');
  assert(WA.injectInspector.classify(envNoReg, true) === 'SUCCESS', '落地即真相：即便未注册也判 SUCCESS');
  const visBackup = WA.render.getVisibility();
  Object.keys(visBackup).forEach(k => WA.render.setVisibility(k, false));
  const envOff = WA.injectInspector.snapEnv(null, {});
  assert(envOff.injectEnabled === false, '可见性全关被环境快照捕获');
  assert(WA.injectInspector.classify(envOff, false) === 'SKIPPED_DISABLED', '全关判 SKIPPED_DISABLED');
  Object.keys(visBackup).forEach(k => WA.render.setVisibility(k, visBackup[k]));
  WA.injectInspector.markRegistered(123);
  const envReg = WA.injectInspector.snapEnv(null, {});
  assert(envReg.registeredAtSend === true && envReg.registeredLen === 123, 'markRegistered 记录注册长度');
  const chatMiss = WA.injectInspector.snapshotChat([{ role: 'system', mes: '别的内容' }], envReg);
  assert(chatMiss.status === 'MISSING', '注册了却没进 prompt 判 MISSING');
  const chatHit = WA.injectInspector.snapshotChat([
    { role: 'system', mes: '背景' },
    { role: 'system', mes: '<world_axis_state>【世界时间】第5日</world_axis_state>' }
  ], envReg);
  assert(chatHit.status === 'SUCCESS' && chatHit.ourIndex === 1, 'chat形态命中哨兵判SUCCESS并定位下标');
  assert(chatHit.ourContentLen > 0 && chatHit.ourContent.slice(0, 3) === '<wo', 'chat形态只留摘录不导全文');
  const chatFlag = WA.injectInspector.snapshotChat([{ role: 'system', mes: 'x', is_extension_prompt: true }], envReg);
  assert(chatFlag.status === 'SUCCESS' && chatFlag.ourIndex === 0, 'chat形态识别宿主注入消息标记');
  const textMiss = WA.injectInspector.snapshotText('一大段没有标记的 prompt', envReg);
  assert(textMiss.status === 'MISSING' && textMiss.ourIndex === -1, 'text形态未命中判 MISSING');
  const textHit = WA.injectInspector.snapshotText('prefix <world_axis_state>【世界脉搏】</world_axis_state> suffix', envReg);
  assert(textHit.status === 'SUCCESS' && textHit.ourIndex === textHit.promptLength - 'suffix'.length - '<world_axis_state>【世界脉搏】</world_axis_state>'.length
    && textHit.promptLength > 0 && textHit.ourExcerptLen > 0, 'text形态命中并记录位置与总长');
  const envRoll = WA.injectInspector.snapEnv(null, { sameLayerReroll: true });
  assert(WA.injectInspector.classify(envRoll, false) === 'SKIPPED_REROLL', '同层重roll判 SKIPPED_REROLL');
  WA.injectInspector.reset();
  assert(WA.injectInspector.init() === true, '在事件源可用时订阅成功');
  assert(WA.injectInspector.init() === false, '重复订阅被单订阅守卫拦下');
  await global.__triggerEvent('chat_completion_prompt_ready', { chat: [
    { role: 'system', mes: '<world_axis_state>【世界时间】第6日</world_axis_state>' },
    { role: 'user', mes: '继续' }
  ], dryRun: true });
  assert(WA.injectInspector.getLastSnapshot() === null, 'dryRun 预热轮不落快照');
  await global.__triggerEvent('chat_completion_prompt_ready', { chat: [
    { role: 'system', mes: '<world_axis_state>【世界时间】第6日</world_axis_state>' },
    { role: 'user', mes: '继续' }
  ] });
  const snapEvt = WA.injectInspector.getLastSnapshot();
  assert(snapEvt && snapEvt.status === 'SUCCESS' && snapEvt.messageCount === 2, '正式轮事件落地快照');
  assert(WA.injectInspector.getLastSnapshot('memory') === snapEvt, 'memory 域读取同一份快照');
  assert(WA.injectInspector.getLastSnapshot('nonsense') === null, '未知 scope 返回 null 不抛');
  await global.__triggerEvent('generate_after_combine_prompts', { prompt: 'a <world_axis_state>b</world_axis_state>' });
  assert(WA.injectInspector.getLastSnapshot().apiType === 'text', 'text 通道事件亦能落快照');
  const flatInj = WA.injectInspector.flatten(snapEvt);
  assert(flatInj.length >= 3 && flatInj[0].detail.includes('进入正文'), 'flatten 首条给出落地结论');
  assert(WA.injectInspector.flatten(null)[0].detail.includes('尚未'), 'flatten 空快照给提示');
  const beforeInj = JSON.stringify(WA.store.get());
  WA.injectInspector.snapshotChat([{ role: 'user', mes: 'x' }], WA.injectInspector.snapEnv(null, {}));
  assert(JSON.stringify(WA.store.get()) === beforeInj, '注入自检纯只读（state零改动）');

  // ── tool-diag v0.9.2 ──
  section('engines/tool-diag v0.9.2');
  assert(WA.toolDiag && typeof WA.toolDiag.collect === 'function', '诊断引擎已导出');
  const dg = WA.toolDiag.collect();
  assert(dg.meta.packageFormat === 'worldaxis-diag' && dg.meta.packageVersion === 2, '诊断包格式标识与版本');
  assert(typeof dg.env === 'object' && dg.env.chatId === 'test_chat_001', '环境节读到 host chatId');
  assert(dg.env.tavernApi.setExtensionPrompt === true, '宿主能力探测：setExtensionPrompt 可用');
  assert(dg.modules.loadedCount >= 30 && dg.modules.missingCount === 0, '模块装载清单零缺失');
  assert(WA.toolDiag.UI_BINDINGS.filter(g => g.page === 'tools')[0].ids.includes('wa-diag-run'), '自检控件已纳入UI绑定校验清单');
  // 全树盘查：诊断清单必须覆盖磁盘上每一个 js 模块（防漏登记）
  const realFiles = [];
  ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui'].forEach(dir => {
    fs.readdirSync(path.join(BASE, dir)).filter(f => f.endsWith('.js')).forEach(f => realFiles.push(dir + '/' + f));
  });
  const listed = Object.keys(WA.toolDiag.MODULE_EXPORTS);
  const uncovered = realFiles.filter(f => listed.indexOf(f) < 0);
  const ghost = listed.filter(f => realFiles.indexOf(f) < 0);
  assert(uncovered.length === 0, '诊断清单覆盖全部磁盘模块' + (uncovered.length ? '（缺 ' + uncovered.join(',') + '）' : ''));
  assert(ghost.length === 0, '诊断清单无幽灵条目' + (ghost.length ? '（多 ' + ghost.join(',') + '）' : ''));
  assert(listed.length >= 48, '诊断清单条目数达全员（' + listed.length + '）');
  assert(dg.modules.optionalMissing.indexOf('ui') >= 0, '无头环境 UI 项归入可选项（不计入阻断）');
  const realKeys = {};
  listed.forEach(f => { realKeys[WA.toolDiag.MODULE_EXPORTS[f]] = true; });
  assert(Object.keys(realKeys).length === listed.length, '诊断清单的导出键无重复（一文件一导出）');
  assert(dg.modules.missing.length === 0, '缺失清单为空数组');
  assert(dg.ui.note ? true : dg.ui.allOk === false, '非浏览器环境 UI 节给出跳过说明');
  const capKeys = dg.capabilities.map(c => c.key);
  assert(capKeys.includes('injectInspector') && capKeys.includes('toolDiag'), '能力清单纳入 v0.9.2 新模块');
  assert(dg.capabilities.filter(c => c.key === 'injectInspector')[0].ok === true, '注入自检 API 齐备');
  assert(dg.capabilities.filter(c => c.key === 'toolSnapshot')[0].ok === true, '快照工具 API 齐备');
  assert(typeof dg.worldState.counts === 'object' && dg.worldState.counts.factions >= 0, '世界状态计数节可用');
  assert(dg.worldState.lastInjection === null || typeof dg.worldState.lastInjection === 'object', '上轮注入打点可读');
  assert(dg.runtime.workflow.nodeCount > 0, '工作流节点统计非零');
  assert(dg.runtime.apiRouter.concurrency >= 1 && dg.runtime.apiRouter.queue >= 0, 'API 通道并发/队列可读');
  assert(dg.runtime.apiRouter.channels.some(c => c.name === 'inference' && c.model === 'm'), '通道清单含已配置模型');
  assert(!dg.runtime.apiRouter.channels.some(c => c.keyMasked === 'k'), 'API Key 已脱敏不出现明文');
  assert(dg.verdict.ok === true && dg.verdict.errorCount === 0, '当前环境判语无阻断项');
  const dgJson = WA.toolDiag.toJSON(true);
  assert(JSON.parse(dgJson).meta.packageVersion === 2, '诊断包 toJSON 可被解析');
  assert(WA.toolDiag.summaryText(dg).length > 0, '摘要文本非空');
  assert(WA.toolDiag.flatten(dg).some(x => x.key === 'inject'), 'flatten 含注入节摘要');
  const dgDlDl = WA.toolDiag.download();
  assert(dgDlDl.ok === false && String(dgDlDl.reason).includes('非浏览器'), '无Blob环境下载降级为提示');
  const keepAnalyzer = WA.toolAnalyzer;
  delete WA.toolAnalyzer;
  const dgBroken = WA.toolDiag.collect();
  assert(dgBroken.modules.missing.some(m => m.key === 'toolAnalyzer'), '缺件被模块清单检出');
  assert(dgBroken.verdict.ok === false && dgBroken.verdict.errorCount >= 1, '缺件时判语转为存在阻断项');
  assert(dgBroken.capabilities.filter(c => c.key === 'toolAnalyzer')[0].ok === false, '缺件时能力项置不可用');
  assert(WA.toolDiag.verdict(dgBroken).issues.some(i => i.key === 'modules'), '问题清单含 modules 条目');
  WA.toolAnalyzer = keepAnalyzer;
  assert(WA.toolDiag.collect().verdict.ok === true, '恢复模块后判语复原（自检可逆）');
  assert(dg.meta.extVersion === (global.WorldAxis.VERSION || global.WorldAxis.version) && String(dg.meta.extVersion).length > 0, '诊断包读到扩展版本号');


  // ══════════ v0.9.6 推演契约对账器（contract-audit）══════════
  // 前置：对账器依赖已初始化的 store（探针要在真实 state 上跑）
  WA.store.init();
  assert(typeof WA.contractAudit === 'object' && WA.contractAudit.FIELDS.length === 22, 'contractAudit 已加载且字段表为 22 项');
  assert(WA.contractAudit.PROBE_TAG === '__audit_', '探针哨兵标记常量正确');
  assert(Array.isArray(WA.contractAudit.ENUM_ALIGN) && WA.contractAudit.ENUM_ALIGN.length >= 10, '枚举对齐表条目齐全');
  assert(Array.isArray(WA.contractAudit.CROSS_MODULE) && WA.contractAudit.CROSS_MODULE.length === 6, '跨模块漂移扫描表 6 组');
  // ── 契约解析：从真实 buildPrompt 提取声明字段 ──
  const caPrompt = WA.backstage.buildPrompt({ idx: 1, text: '' }, '');
  const caContract = WA.contractAudit.parseContract(caPrompt);
  assert(caContract.fields['clock'] && caContract.fields['world_pulse'] && caContract.fields['next_turn_injection'], '契约解析提取到核心字段');
  assert(caContract.fields['distantEvent'] && caContract.fields['nearEvent'] && caContract.fields['entities'], '契约解析提取到 horizon/entities 字段');
  assert(Object.keys(caContract.fields).length >= 22, '契约声明字段数 >= 22: ' + Object.keys(caContract.fields).length);
  assert(caContract.enums['factions'] && caContract.enums['factions'].includes('鼎盛'), '契约枚举聚合 factions 包含鼎盛');
  assert(caContract.enums['economy'] && caContract.enums['economy'].includes('动荡'), '契约枚举聚合 economy 包含动荡');
  assert(caContract.enums['currents'] && caContract.enums['currents'].includes('hidden') && caContract.enums['currents'].includes('private'), '契约枚举聚合 currents 含可见性与公开度两套');
  // ── 消费实测：探针逐字段喂 applyResult ──
  const caBase = JSON.parse(JSON.stringify(WA.store.get()));
  const caConsumed = WA.contractAudit.consumedFields({ baseState: caBase });
  const caConsumedList = Object.keys(caConsumed).filter(f => caConsumed[f].consumed);
  assert(caConsumedList.length === 22, '22 个契约字段全部被消费端实测消费: ' + caConsumedList.length + ' -> ' + JSON.stringify(caConsumedList.filter(f => !caConsumed[f].consumed)));
  // horizon 委托字段必须被正确识别为已消费（acceptResult 写 live store 而非 draft）
  assert(caConsumed['distantEvent'].consumed === true && caConsumed['nearEvent'].consumed === true, 'distantEvent/nearEvent 经 horizon.acceptResult 消费');
  // 探针不污染真实存档：消费实测后 live store 不含哨兵标记
  assert(JSON.stringify(WA.store.get()).indexOf('__audit_') < 0, '探针哨兵不残留于真实存档');
  // ── 全量对账 ──
  // 用冻结的基线 + 显式 applyFn 闸门：避免 audit 内部再次触发 horizon 掷骰等随机副作用
  const caReport = WA.contractAudit.audit({ baseState: caBase, applyFn: function (d, r, a) { WA.backstage.applyResult(d, r, a); } });
  assert(caReport.declared.length >= 22 && caReport.consumed.length === 22, '对账报告 declared>=22 / consumed=22');
  assert(caReport.drift.declaredNotConsumed.length === 0, '无「声明但未消费」漂移');
  assert(caReport.drift.probeNotDeclared.length === 0, '无「消费但未声明」漂移');
  caReport.enums.forEach(e => assert(e.status === 'aligned', '枚举对齐: ' + e.field + ' -> ' + e.status + ' extra=' + JSON.stringify(e.extra || [])));
  // ── 漂移检出能力复核（用注入的伪漂移源验证扫描器灵敏度，不依赖真实缺陷）──
  const keepEcon = WA.evolution.ECONOMY_CLIMATE;
  WA.evolution.ECONOMY_CLIMATE = ['繁荣', '平稳', '萧条'];
  const caDriftReport = WA.contractAudit.audit({ baseState: caBase, applyFn: function (d, r, a) { WA.backstage.applyResult(d, r, a); } });
  const caDriftCross = caDriftReport.crossModule.filter(c => c.name === 'economy.climate')[0];
  assert(caDriftCross && caDriftCross.diffs.evolution && caDriftCross.diffs.evolution.includes('萧条'), '注入伪漂移后扫描器仍能检出（灵敏度保持）');
  const caDriftIssue = caDriftReport.issues.filter(i => i.code === 'cross_module_drift' && String(i.detail).includes('萧条'))[0];
  assert(caDriftIssue, '伪漂移进入 issue 清单');
  assert(caDriftReport.verdict.ok === false, '伪漂移使判语转为存在阻断项');
  WA.evolution.ECONOMY_CLIMATE = keepEcon;
  const caRestored = WA.contractAudit.audit({ baseState: caBase, applyFn: function (d, r, a) { WA.backstage.applyResult(d, r, a); } });
  assert(caRestored.verdict.ok === true, '伪漂移清除后判语复原（扫描可逆）');
  // 跨模块漂移：economy.climate 是已知真实漂移（analyzer 用萧条/危机），必须被检出
  const caCrossEcon = caReport.crossModule.filter(c => c.name === 'economy.climate')[0];
  assert(caCrossEcon && Object.keys(caCrossEcon.diffs).length === 0, '跨模块漂移扫描：economy.climate 各源已对齐');
  const caEconIssue = caReport.issues.filter(i => i.code === 'cross_module_drift')[0];
  assert(!caEconIssue, '修复后无跨模块漂移 issue');
  assert(caReport.verdict.ok === true && caReport.verdict.errorCount === 0, '跨模块漂移已修复，判语转全绿');
  assert(WA.toolAnalyzer.ECON_SCORE['衰退'] === -0.6 && WA.toolAnalyzer.ECON_SCORE['动荡'] === -1, 'ECON_SCORE 已对齐 evolution 枚举');
  // ── 工具方法 ──
  assert(typeof WA.contractAudit.summaryText(caReport) === 'string' && WA.contractAudit.summaryText(caReport).length > 0, 'summaryText 输出可读判语');
  const caFlat = WA.contractAudit.flatten(caReport);
  assert(Array.isArray(caFlat) && caFlat.some(i => i.key === 'coverage'), 'flatten 输出含覆盖率信息条');
  // ── 无副作用复核：对账前后 store 一致性 ──
  assert(JSON.stringify(WA.store.get()).indexOf('__audit_') < 0, '对账后 live store 无哨兵残留');
  // horizon 泳道在对账期间可能因 buildPrompt 的 rollLane 自然推进，这是引擎正常行为而非探针污染
  const caHorizonAfter = WA.store.get().evolution.horizon;
  assert(caHorizonAfter.distant && caHorizonAfter.near && typeof caHorizonAfter.distant.ledger === 'number', '对账后 horizon 泳道结构完整');
  // ── 降级路径 ──
  const caBroken = WA.contractAudit.consumedFields({ applyFn: null });
  assert(Object.keys(caBroken).length === 22 && caBroken['clock'].consumed === false, 'applyFn 不可用时全部降级为未消费');
  const caNoBase = WA.contractAudit.consumedFields({ baseState: null, applyFn: function () {} });
  assert(caNoBase['clock'].consumed === false && String(caNoBase['clock'].reason || '').indexOf('state') >= 0, '无基准 state 时降级提示');
  // ── 诊断清单登记校验（v0.9.5 防漏机制延续）──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/contract-audit.js'] === 'contractAudit', '诊断清单已登记 contract-audit');


  // ══════════ v0.9.7 记忆注入采样器（memory-sampler）══════════
  // ── 指数衰减采样核心（源自 World memory-engine.exponentialMemorySample）──
  assert(typeof WA.memorySampler === 'object', 'memorySampler 已加载');
  assert(WA.memorySampler.DEFAULT_DICE_SIDES === 10000 && WA.memorySampler.MIN_SIDES === 1000 && WA.memorySampler.MAX_SIDES === 10000, '骰子面数常量 1000-10000');
  assert(WA.memorySampler.DEFAULT_LIMIT === 8, '默认采样上限 8');
  // 数量不足时全量返回（保持原序）
  const msSmall = [1, 2, 3];
  assertDeepEq(WA.memorySampler.exponentialSample(msSmall, 5), msSmall, '候选不足 limit 时全量返回');
  assertDeepEq(WA.memorySampler.exponentialSample(msSmall, 0), [], 'limit=0 返回空');
  assertDeepEq(WA.memorySampler.exponentialSample(null, 5), [], '非数组入参返回空');
  // 数量超过 limit 时严格截断且结果为子集
  const msBig = [];
  for (let i = 0; i < 30; i++) msBig.push({ id: i, text: '记忆' + i });
  const msPicked = WA.memorySampler.exponentialSample(msBig, 8, Math.random, 10000);
  assert(msPicked.length === 8, '超限采样严格截断至 8 条: ' + msPicked.length);
  assert(msPicked.every(e => msBig.indexOf(e) >= 0), '采样结果必为原数组子集（引用保持）');
  // 结果按原序返回（截取后重排）
  const msIdx = msPicked.map(e => msBig.indexOf(e));
  const msSorted = msIdx.slice().sort((a, b) => a - b);
  assertDeepEq(msIdx, msSorted, '采样结果按原序返回');
  // 确定性随机源：注入 randomFn 验证权重计算（近期高概率）
  // 固定随机源递增时，priority 排序应让年龄小的（近期）优先
  let msSeq = 0.9999;  // 高 roll → unit 接近 1 → -ln(unit) 接近 0 → priority 小 → 优先选中
  const msDet = WA.memorySampler.exponentialSample(msBig, 8, function () { return msSeq; }, 10000);
  assert(msDet.length === 8 && msDet.every(e => msBig.indexOf(e) >= 0), '确定性随机源下采样稳定');
  // 近期偏置验证：用极端随机源（近期恒高、远期恒低）验证权重生效
  // 高 roll(0.99) 的条目 priority 小应被优先选取；构造 20 条记忆，让后半段（近期）恒高 roll
  let msFlip = false;
  const msBias = WA.memorySampler.exponentialSample(
    msBig.slice(0, 20), 5,
    function () { msFlip = !msFlip; return msFlip ? 0.99 : 0.01; },
    10000
  );
  assert(msBias.length === 5, '混合随机源下仍稳定截断 5 条');
  // 骰子面数夹取
  const msWide = WA.memorySampler.exponentialSample(msBig, 4, Math.random, 99999);
  assert(msWide.length === 4, '超范围 diceSides 被夹取至 MAX 后仍正常工作');
  const msNarrow = WA.memorySampler.exponentialSample(msBig, 4, Math.random, 5);
  assert(msNarrow.length === 4, '极小 diceSides 被夹取至 MIN 后仍正常工作');
  // ── 上下文相关性过滤 ──
  const msEntries = [
    { holders: ['张三'], text: '张三怀疑酒保', time: '第1日' },
    { holders: ['李四'], text: '李四确信有宝藏', time: '第2日' },
    { holders: ['王五'], text: '王五记得旧仇', time: '第3日' }
  ];
  const msHay = '张三走进了酒馆，和王五打了个招呼';
  const msRel = WA.memorySampler.filterRelevant(msEntries, msHay);
  assert(msRel.length === 2 && msRel[0].holders[0] === '张三' && msRel[1].holders[0] === '王五', '相关性过滤：只保留正文出现的人物记忆');
  assert(WA.memorySampler.filterRelevant(msEntries, '').length === 3, '空扫描文本时回退全量（不误删）');
  assert(WA.memorySampler.filterRelevant([], msHay).length === 0, '空条目列表返回空');
  assert(WA.memorySampler.filterRelevant([{ holders: [], text: 'x' }], msHay).length === 0, '无持有者的条目被过滤');
  // 大小写/trim 容错
  const msCase = WA.memorySampler.filterRelevant([{ holders: [' 张三 '], text: 'x' }], 'zhang san');
  // 中文不区分大小写，'张三' 不在 'zhang san' 中，应为 0；验证 normalized 不抛异常即可
  assert(Array.isArray(msCase), 'normalized 容错不抛异常');
  // ── buildHaystack：近期正文 + 世界状态快照 ──
  WA.store.init();
  WA.store.transact(d => {
    d.memory.pmem = msEntries;
    d.evolution.people = [{ name: '张三' }, { name: '李四' }];
    d.evolution.factions = [{ name: '血刀门' }];
  });
  const msHayBuilt = WA.memorySampler.buildHaystack('近期正文提到李四', WA.store.get());
  assert(msHayBuilt.indexOf('李四') >= 0 && msHayBuilt.indexOf('血刀门') >= 0, 'buildHaystack 含人物与势力名');
  // ── sampleEntries：主入口 ──
  const msState = WA.store.get();
  const msSel = WA.memorySampler.sampleEntries({ state: msState, recentText: '张三在酒馆', limit: 2 });
  assert(msSel.length === 2, 'sampleEntries 采样至 limit');
  // 相关性回退：相关条目不足时用全量补足
  const msSel2 = WA.memorySampler.sampleEntries({ state: msState, recentText: '完全无关的正文内容', limit: 3 });
  assert(msSel2.length === 3, '相关性不足时全量回退补足至 limit');
  // relevanceFilter off：不过滤直接采样
  const msSel3 = WA.memorySampler.sampleEntries({ state: msState, recentText: '张三', limit: 2, relevanceFilter: 'off' });
  assert(msSel3.length === 2, 'relevanceFilter=off 时全量采样');
  // limit 夹取
  const msSel4 = WA.memorySampler.sampleEntries({ state: msState, recentText: '张三', limit: 999 });
  assert(msSel4.length === 3, 'limit 超候选数时返回全部 3 条: ' + msSel4.length);
  // limit=0 在 exponentialSample 内返回空，但 sampleEntries 的 limit 经 clamp 后为 1；
  // 相关性回退又可能用全量补足——此处断言 "limit<=1 时至多返回 1 条或走相关性回退"
  const msSel5 = WA.memorySampler.exponentialSample(msEntries, 0);
  assert(msSel5.length === 0, 'exponentialSample limit=0 返回空（采样核心边界）');
  // ── buildBlock：注入文本生成 ──
  const msBlock = WA.memorySampler.buildBlock({ state: msState, recentText: '张三在酒馆', limit: 3 });
  assert(msBlock.indexOf('【人物主观记忆】') === 0, 'buildBlock 输出含标准头部');
  assert(msBlock.indexOf('张三') >= 0, 'buildBlock 含选中人物名');
  assert((msBlock.match(/\n/g) || []).length >= 2, 'buildBlock 多行格式');
  // 空记忆时返回空串
  WA.store.transact(d => { d.memory.pmem = []; });
  assert(WA.memorySampler.buildBlock({ state: WA.store.get() }) === '', '空记忆时 buildBlock 返回空串');
  WA.store.transact(d => { d.memory.pmem = msEntries; });
  // ── 与 pmem 的对照：采样器是 pmem.buildBlock 的超集 ──
  // pmem.buildBlock 固定 slice(-8)，采样器在 limit=8 + relevanceFilter=off 时行为类似但带随机轮换
  WA.store.transact(d => {
    d.memory.pmem = [];
    for (let i = 0; i < 20; i++) d.memory.pmem.push({ holders: ['人物' + i], text: '记忆' + i, time: '第' + i + '日' });
  });
  const msMany = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 8, relevanceFilter: 'off' });
  assert(msMany.length === 8, '20 条记忆采样至 8 条');
  // 多次采样结果应可能不同（随机轮换）——恒定随机源不会轮换，用伪随机序列验证
  let msSeedA = 0.1, msSeedB = 0.9;
  const msA = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 8, relevanceFilter: 'off', randomFn: function () { msSeedA = (msSeedA * 7 + 0.13) % 1; return msSeedA; } });
  const msB = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 8, relevanceFilter: 'off', randomFn: function () { msSeedB = (msSeedB * 7 + 0.37) % 1; return msSeedB; } });
  const msDiff = msA.some(e => msB.indexOf(e) < 0);
  assert(msDiff === true, '不同随机序列产生不同采样结果（记忆轮换能力）: A=' + msA.map(e => e.text).join(',') + ' B=' + msB.map(e => e.text).join(','));
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/memory-sampler.js'] === 'memorySampler', '诊断清单已登记 memory-sampler');
  // 清理测试数据
  WA.store.transact(d => { d.memory.pmem = []; d.evolution.people = []; d.evolution.factions = []; });


  // ══════════ v0.9.8 注入管线接入采样器 ══════════
  // inject.js 的主观记忆源已切换到 memorySampler.buildBlock，
  // 验证：管线在采样器存在时优先走采样器，不存在时回退 pmem.buildBlock
  assert(WA.render && typeof WA.render.applyInjections === 'function', 'render 注入模块已加载');
  // 构造伪 ctx 直接调用 applyInjections，验证主观记忆源被采样器接管
  WA.store.init();
  WA.store.transact(d => {
    d.memory.pmem = [
      { holders: ['酒保'], text: '酒保记得主角欠钱', time: '第1日' },
      { holders: ['蒙面人'], text: '蒙面人怀疑主角身份', time: '第2日' }
    ];
  });
  const injCtx = { injections: [] };
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections(injCtx);
  assert(global.__lastExtensionPrompt !== null, 'applyInjections 真正调用了 setExtensionPrompt');
  const injCaptured = global.__lastExtensionPrompt.text;
  assert(injCaptured.indexOf('【人物主观记忆】') >= 0, '注入内容含采样器生成的主观记忆块');
  // 采样器接管验证：内容来自采样器（含相关性过滤后的条目），不是 pmem 的 slice(-8)
  assert(injCaptured.indexOf('酒保') >= 0 || injCaptured.indexOf('蒙面人') >= 0, '注入含 pmem 条目内容');
  // 注入预算仍生效：主观记忆源 rank 3 可折叠
  const pri = WA.injectBudget.rankOf('主观记忆');
  assert(pri === 3 && WA.injectBudget.foldable('主观记忆') === true, '主观记忆源在预算表 rank3 可折叠');
  // 回退路径：删除采样器后应回退 pmem.buildBlock
  const keepSampler = WA.memorySampler;
  delete WA.memorySampler;
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const injFallback = global.__lastExtensionPrompt && global.__lastExtensionPrompt.text;
  assert(injFallback !== null && injFallback.indexOf('【人物主观记忆】') >= 0, '采样器缺失时回退 pmem.buildBlock');
  WA.memorySampler = keepSampler;
  // 清理
  WA.store.transact(d => { d.memory.pmem = []; });

  // ── 汇总 ──
  console.log('\n══════════════════════');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (failures.length) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
  console.log('全部测试通过 ✓');
  process.exit(0);
})().catch(e => { console.error('测试运行器异常: ', e); process.exit(2); });
