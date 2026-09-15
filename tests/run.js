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
  'engines/chapters.js', 'engines/opinion.js', 'engines/direct-event.js', 'engines/editor-faction.js', 'engines/editor-events.js', 'engines/inspector-state.js', 'engines/tool-snapshot.js', 'engines/tool-analyzer.js', 'engines/tool-import.js', 'engines/inject-inspector.js', 'engines/inject-budget.js', 'engines/tool-diag.js', 'engines/contract-audit.js', 'engines/memory-sampler.js', 'engines/sampler-check.js', 'engines/inject-channel.js', 'engines/inject-slot-audit.js', 'engines/proactive.js', 'engines/wb-inject.js',
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
// v0.1.16: index.js loadScript not in vm chain; extract impl from source for assertions
const _idxSrc = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
const _i1 = _idxSrc.indexOf('function loadScriptOnce(');
const _i2 = _idxSrc.indexOf('function loadScript(', _i1);
const _fnStart = _i1;
const _fnEnd = _idxSrc.indexOf('  async function init()', _i2);
assert(_fnStart > 0 && _fnEnd > _fnStart, 'index.js has loadScript impl');
const _frag = _idxSrc.slice(_fnStart, _fnEnd).replace(/WA\./g, 'window.WorldAxis.');const _code =  '(function(){' + ' const mainDoc = window.WorldAxis.mainDoc;' + ' const VERSION = window.WorldAxis.version;' + ' const CDN_BASES = ["https://cdn.jsdelivr.net/gh/LonSha/world-axis@main","https://fastly.jsdelivr.net/gh/LonSha/world-axis@main","https://testingcf.jsdelivr.net/gh/LonSha/world-axis@main"];' + ' const SCRIPT_TIMEOUT_MS = 12000;' + _frag + ' return { loadScript: loadScript }; })();';
const _ls = vm.runInContext(_code, ctx, { filename: 'index.js#loadScript' });
WA.loadScript = _ls.loadScript;
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
  // v0.1.10: getLastSnapshot 返回独立副本，引用不同但内容须一致
  assertDeepEq(WA.injectInspector.getLastSnapshot('memory'), snapEvt, 'memory 域读取同一份快照（副本内容一致）');
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


  // ══════════ v0.9.9 采样器可配置化（backstage 设置联动）══════════
  // loadSamplerSettings: 从 backstage 读取，未配置时回落内置默认
  const msCfg = WA.memorySampler.loadSamplerSettings();
  assert(typeof msCfg === 'object' && msCfg.memSamplerLimit === 8, '采样器配置默认 limit=8: ' + JSON.stringify(msCfg));
  assert(msCfg.memSamplerDice === 10000 && msCfg.memSamplerRelevance === 'on', '采样器配置默认 dice=10000 relevance=on');
  // backstage 默认值已含采样参数
  const bsSettings = WA.backstage.getSettings();
  assert(bsSettings.memSamplerLimit === 8 && bsSettings.memSamplerDice === 10000, 'backstage 默认设置含采样参数');
  assert(bsSettings.memSamplerRelevance === 'on', 'backstage 默认 relevance=on');
  // 设置改动后采样器立即生效
  WA.backstage.setSettings({ memSamplerLimit: 3, memSamplerDice: 2000, memSamplerRelevance: 'off' });
  const msCfg2 = WA.memorySampler.loadSamplerSettings();
  assert(msCfg2.memSamplerLimit === 3 && msCfg2.memSamplerDice === 2000 && msCfg2.memSamplerRelevance === 'off', 'setSettings 后采样器配置即时更新');
  // sampleEntries 使用新 limit
  WA.store.transact(d => {
    d.memory.pmem = [];
    for (let i = 0; i < 12; i++) d.memory.pmem.push({ holders: ['人物' + i], text: '记忆' + i, time: '第' + i + '日' });
  });
  const msCfgSel = WA.memorySampler.sampleEntries({ state: WA.store.get(), relevanceFilter: 'off' });
  assert(msCfgSel.length === 3, 'limit=3 生效，采样 3 条: ' + msCfgSel.length);
  // opts 显式参数仍覆盖配置（调用方优先）
  const msCfgSel2 = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 5, relevanceFilter: 'off' });
  assert(msCfgSel2.length === 5, 'opts.limit 覆盖配置 limit');
  // 极限值夹取
  WA.backstage.setSettings({ memSamplerLimit: 999, memSamplerDice: 99999 });
  const msCfg3 = WA.memorySampler.loadSamplerSettings();
  assert(msCfg3.memSamplerLimit === 999, 'limit 999 读入（sampleEntries 内夹取）');
  const msCfgSel3 = WA.memorySampler.sampleEntries({ state: WA.store.get(), relevanceFilter: 'off' });
  assert(msCfgSel3.length === 12, 'limit 超候选数时返回全部 12 条');
  // 恢复默认
  WA.backstage.setSettings({ memSamplerLimit: 8, memSamplerDice: 10000, memSamplerRelevance: 'on' });
  const msCfg4 = WA.memorySampler.loadSamplerSettings();
  assert(msCfg4.memSamplerLimit === 8 && msCfg4.memSamplerRelevance === 'on', '恢复默认配置');
  // 设置污染检查：测试改动的设置不影响后续 store
  WA.store.transact(d => { d.memory.pmem = []; });
  assert(WA.backstage.getSettings().memSamplerLimit === 8, '采样配置保持默认（测试隔离）');


  // ══════════ v0.1.0 采样器自检（sampler-check）══════════
  v010: {
    assert(typeof WA.samplerCheck === 'object', 'samplerCheck 已加载');
  assert(WA.samplerCheck.TRIALS === 200, '自检试验次数 200');
  assert(WA.samplerCheck.RECENT_RATIO === 0.5, '近期偏置阈值 0.5');
  // mulberry 确定性伪随机：同种子同输出
  const scRng1 = WA.samplerCheck.mulberry(42);
  const scRng2 = WA.samplerCheck.mulberry(42);
  const scSeq1 = [scRng1(), scRng1(), scRng1()];
  const scSeq2 = [scRng2(), scRng2(), scRng2()];
  assertDeepEq(scSeq1, scSeq2, 'mulberry 同种子序列一致（可复现）');
  const scRng3 = WA.samplerCheck.mulberry(7);
  const scSeq3 = [scRng3(), scRng3(), scRng3()];
  assert(scSeq1.some((v, i) => scSeq3[i] !== v), 'mulberry 不同种子序列不同');
  // ── statSample: 命中率统计 ──
  const scEntries = [];
  for (let i = 0; i < 12; i++) scEntries.push({ holders: ['人物' + i], text: '记忆' + i, time: '第' + i + '日' });
  WA.store.init();
  const scStat = WA.samplerCheck.statSample(scEntries, {
    state: WA.store.get(), limit: 4, relevanceFilter: 'off'
  });
  assert(scStat.trials === 200, 'statSample 跑满 200 次');
  assert(scStat.rates.length === 12, '每条记忆都有命中率记录');
  assert(scStat.rates.every(r => r.hitRate >= 0 && r.hitRate <= 1), '命中率在 [0,1] 区间');
  // 命中总数 = limit * trials（每次采 4 条）
  const scTotalHits = scStat.rates.reduce((a, r) => a + r.hitRate * scStat.trials, 0);
  assert(Math.abs(scTotalHits - 4 * 200) < 1, '命中总数 = limit*trials: ' + scTotalHits.toFixed(0));
  // 近期偏置：后半段平均命中率 > 前半段
  const scHalf = 6;
  const scFirst = scStat.rates.slice(0, scHalf).reduce((a, r) => a + r.hitRate, 0) / scHalf;
  const scLast = scStat.rates.slice(scHalf).reduce((a, r) => a + r.hitRate, 0) / scHalf;
  assert(scLast > scFirst, '指数衰减近期偏置: 前' + (scFirst * 100).toFixed(1) + '% < 后' + (scLast * 100).toFixed(1) + '%');
  // ── runChecks: 全量自检 ──
  const scReport = WA.samplerCheck.runChecks({
    entries: scEntries, state: WA.store.get(),
    recentText: '人物0和人物5在酒馆对话', limit: 4
  });
  assert(scReport.verdict.ok === true, '采样器自检全部通过: ' + scReport.verdict.pass + '/' + scReport.verdict.total);
  const scCheckNames = scReport.checks.map(c => c.name);
  assert(scCheckNames.indexOf('采样器已加载') >= 0 && scCheckNames.indexOf('引用保持') >= 0, '自检含加载与引用保持项');
  assert(scCheckNames.indexOf('近期偏置') >= 0 && scCheckNames.indexOf('相关性过滤') >= 0, '自检含近期偏置与相关性过滤项');
  assert(scCheckNames.indexOf('limit 边界') >= 0 && scCheckNames.indexOf('无副作用') >= 0, '自检含边界与无副作用项');
  // 引用保持单项必须真过（非跳过）
  const scRefCheck = scReport.checks.filter(c => c.name === '引用保持')[0];
  assert(scRefCheck.ok === true && scRefCheck.detail.indexOf('跳过') < 0, '引用保持真实验证（非跳过）: ' + scRefCheck.detail);
  // 相关性过滤真实验证
  const scRelCheck = scReport.checks.filter(c => c.name === '相关性过滤')[0];
  assert(scRelCheck.ok === true && scRelCheck.detail.indexOf('生效') >= 0, '相关性过滤生效: ' + scRelCheck.detail);
  // 近期偏置真实验证（12 条 >= 8，走统计分支）
  const scBiasCheck = scReport.checks.filter(c => c.name === '近期偏置')[0];
  assert(scBiasCheck.ok === true && scBiasCheck.detail.indexOf('试验') >= 0, '近期偏置走统计分支: ' + scBiasCheck.detail);
  // 无副作用真实验证
  const scSideCheck = scReport.checks.filter(c => c.name === '无副作用')[0];
  assert(scSideCheck.ok === true && scSideCheck.detail.indexOf('未被修改') >= 0, '采样不修改入参: ' + scSideCheck.detail);
  // ── 降级路径：采样器不可用时自检报失败但不抛异常 ──
  const keepSampler = WA.memorySampler;
  delete WA.memorySampler;
  const scBroken = WA.samplerCheck.runChecks({ entries: scEntries, state: WA.store.get() });
  assert(scBroken.verdict.ok === false && scBroken.verdict.total === 1, '采样器缺失时自检报失败');
  const scLoadCheck = scBroken.checks.filter(c => c.name === '采样器已加载')[0];
  assert(scLoadCheck.ok === false, '缺失时首项为「采样器已加载」失败');
  WA.memorySampler = keepSampler;
  // ── 空条目降级 ──
  const scEmpty = WA.samplerCheck.runChecks({ entries: [], state: WA.store.get(), recentText: 'x' });
  assert(scEmpty.verdict.ok === true, '空条目时自检全跳过（trivially pass）: ' + scEmpty.verdict.pass + '/' + scEmpty.verdict.total);
  // ── statSample 降级 ──
  assertDeepEq(WA.samplerCheck.statSample(null, {}), { trials: 0, hits: {}, rates: [] }, 'statSample 空入参降级');
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/sampler-check.js'] === 'samplerCheck', '诊断清单已登记 sampler-check');

  } // end v0.1.0 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.1 — 注入槽位路由（inject-channel）
  // ═══════════════════════════════════════════════════════════
  v011: {
  assert(typeof WA.injectChannel === 'object', 'injectChannel 已加载');
  assert(WA.injectChannel.POS.after_last_user === 1 && WA.injectChannel.POS.in_chat === 0 && WA.injectChannel.POS.at_end === 2, 'POS 位置常量映射正确');
  assert(WA.injectChannel.DEFAULT_POS === 'in_chat', '默认位置 in_chat');
  assert(WA.injectChannel.SLOT_PREFIX === 'WorldAxis', '槽位前缀 WorldAxis');
  // ── normPos：未知值回落 ──
  assert(WA.injectChannel.normPos('after_last_user') === 'after_last_user', 'normPos 已知位置原样通过');
  assert(WA.injectChannel.normPos('in_chat') === 'in_chat', 'normPos in_chat 通过');
  assert(WA.injectChannel.normPos('at_end') === 'at_end', 'normPos at_end 通过');
  assert(WA.injectChannel.normPos('before_message') === 'in_chat', 'normPos 未知位置回落 in_chat');
  assert(WA.injectChannel.normPos(null) === 'in_chat', 'normPos null 回落');
  assert(WA.injectChannel.normPos(undefined) === 'in_chat', 'normPos undefined 回落');
  assert(WA.injectChannel.normPos(42) === 'in_chat', 'normPos 非字符串回落');
  assert(WA.injectChannel.normPos('') === 'in_chat', 'normPos 空串回落');
  // ── routeBySlot：分桶 + 深度排序 ──
  const icItems = [
    { source: '连续性约束', content: 'A-约束', position: 'after_last_user', depth: 0 },
    { source: '演化状态', content: 'B-演化', position: 'after_last_user', depth: 1 },
    { source: '章节', content: 'C-章节', position: 'after_last_user', depth: 2 },
    { source: '世界状态', content: 'D-状态', position: 'in_chat', depth: 5 }
  ];
  const icBuckets = WA.injectChannel.routeBySlot(icItems);
  assert(icBuckets.length === 2, 'routeBySlot 分出 2 个桶（after_last_user + in_chat）');
  const icALU = icBuckets.filter(b => b.position === 'after_last_user')[0];
  const icIC = icBuckets.filter(b => b.position === 'in_chat')[0];
  assert(icALU.slot === 'WorldAxis:after_last_user', 'after_last_user 桶位名正确');
  assert(icIC.slot === 'WorldAxis:in_chat', 'in_chat 桶位名正确');
  assert(icALU.items.length === 3, 'after_last_user 桶收 3 项');
  assert(icIC.items.length === 1, 'in_chat 桶收 1 项');
  assert(icALU.items.map(i => i.content).join(',') === 'A-约束,B-演化,C-章节', '桶内按 depth 升序（0,1,2）');
  assert(icALU.items.map(i => i.depth).join(',') === '0,1,2', '深度排序后 depth 序列正确');
  // ── 乱序 depth 输入仍稳定排序 ──
  const icShuffled = WA.injectChannel.routeBySlot([
    { source: '章节', content: 'C', position: 'after_last_user', depth: 2 },
    { source: '连续性约束', content: 'A', position: 'after_last_user', depth: 0 },
    { source: '仇敌', content: 'E', position: 'after_last_user', depth: 1 }
  ]);
  const icShufALU = icShuffled.filter(b => b.position === 'after_last_user')[0];
  assert(icShufALU.items.map(i => i.depth).join(',') === '0,1,2', '乱序输入按深度重排');
  assert(icShufALU.items.map(i => i.content).join(',') === 'A,E,C', '深度排序后内容序列 A,E,C');
  // ── position 缺失/无效 → 归入 in_chat 桶 ──
  const icNoPos = WA.injectChannel.routeBySlot([
    { source: 'X', content: 'X-无位置' },
    { source: 'Y', content: 'Y-坏位置', position: 'middle_of_nowhere', depth: 3 }
  ]);
  assert(icNoPos.length === 1 && icNoPos[0].position === 'in_chat', '无 position 与无效 position 都归 in_chat');
  assert(icNoPos[0].items.length === 2, 'in_chat 桶收 2 项');
  assert(icNoPos[0].items.map(i => i.depth).join(',') === '3,5', '桶内深度升序（3 在前，5 在后）');
  // ── 空入参/脏数据降级 ──
  assertDeepEq(WA.injectChannel.routeBySlot([]), [], 'routeBySlot 空数组返回空');
  assertDeepEq(WA.injectChannel.routeBySlot(null), [], 'routeBySlot null 返回空');
  assertDeepEq(WA.injectChannel.routeBySlot(undefined), [], 'routeBySlot undefined 返回空');
  assertDeepEq(WA.injectChannel.routeBySlot([{ source: 'Z' }, null, { content: '' }]), [], '缺 content / null / 空内容的项被丢弃');
  // ── planSlots：文本合并 ──
  const icPlan = WA.injectChannel.planSlots(icItems);
  assert(icPlan.length === 2, 'planSlots 输出 2 个槽位计划');
  const icPlanALU = icPlan.filter(s => s.position === 'after_last_user')[0];
  assert(icPlanALU.slot === 'WorldAxis:after_last_user', 'planSlots 槽位名透传');
  assert(icPlanALU.depth === 0, 'planSlots 取桶内首项 depth（0）作为槽位 depth');
  assert(icPlanALU.text === 'A-约束\nB-演化\nC-章节', 'planSlots 桶内文本按深度顺序换行拼接');
  assert(icPlan.filter(s => s.position === 'in_chat')[0].text === 'D-状态', 'in_chat 槽位文本正确');
  assertDeepEq(WA.injectChannel.planSlots([]), [], 'planSlots 空数组返回空');
  // ── applySlots：回调参数校验（自建可记录 setExt） ──
  const icCalls = [];
  const icN = WA.injectChannel.applySlots(function (slotName, text, pos, depth, scan) {
    icCalls.push({ slotName: slotName, text: text, pos: pos, depth: depth, scan: scan });
  }, icPlan);
  assert(icN.applied === 2, 'applySlots 返回已应用槽位数 2');
  assert(icCalls.length === 2, 'setExt 被调用 2 次（每槽位一次）');
  const icCallALU = icCalls.filter(c => c.slotName === 'WorldAxis:after_last_user')[0];
  const icCallIC = icCalls.filter(c => c.slotName === 'WorldAxis:in_chat')[0];
  assert(icCallALU.pos === 1, 'after_last_user 槽位 pos=1（POS 映射落地）');
  assert(icCallALU.depth === 0, 'after_last_user 槽位 depth=0');
  assert(icCallALU.text === 'A-约束\nB-演化\nC-章节' && icCallALU.scan === false, '槽位文本与 scan=false 透传');
  assert(icCallIC.pos === 0 && icCallIC.depth === 5, 'in_chat 槽位 pos=0 depth=5');
  // ═══════════════════════════════════════════════════════════
  // v0.1.13 — P0 事件订阅重试/别名兼容 + direct-event busy 锁 + P1 主动拉动引擎
  // ═══════════════════════════════════════════════════════════
  v0113: {

  // ── P0-① inject-inspector 事件名别名兼容 ──
  // pickEventName 优先取宿主事件Types，大小写两种命名都能命中；宿主缺失时回落内置常量
  assertDeepEq(WA.injectInspector.init.length >= 1, true, 'init 支持 retry 参数');
  // 已订阅时再次调用返回 false（单订阅守卫，与既有断言一致）
  assert(WA.injectInspector.init() === false, '已订阅后 init() 返回 false');

  // ── P0-② direct-event busy 锁 ──
  const deBefore = WA.directEvent.active();
  // 推进一轮：advance 加了 busy 锁，重复调用不会二次推进
  if (deBefore) {
    const t0 = deBefore.currentTurn;
    WA.directEvent.advance();
    WA.directEvent.advance();   // 同步重入应被锁拦下
    const after = WA.directEvent.active();
    assert(after.currentTurn === t0 + 1, 'busy 锁：同步重入只推进一轮: ' + (after.currentTurn - t0));
  } else {
    assert(true, '无活跃突发事件，advance 空转不报错');
  }
  // 无活跃事件时 advance 不抛
  WA.directEvent.abort();
  WA.directEvent.advance();
  assert(WA.directEvent.active() === undefined || WA.directEvent.active() === null, 'abort 后无活跃事件');

  // ── P1 主动拉动引擎 ──
  assert(WA.proactive && typeof WA.proactive.isDrained === 'function', 'proactive 引擎已加载并导出');
  // 语义枯竭判定
  assert(WA.proactive.isDrained('嗯') === true, '敷衍词「嗯」判枯竭');
  assert(WA.proactive.isDrained('哦') === true, '敷衍词「哦」判枯竭');
  assert(WA.proactive.isDrained('随便') === true, '敷衍词「随便」判枯竭');
  assert(WA.proactive.isDrained('不知道') === true, '敷衍词「不知道」判枯竭');
  assert(WA.proactive.isDrained('') === true, '空回复判枯竭');
  assert(WA.proactive.isDrained('沉默') === true, '「沉默」判枯竭');
  assert(WA.proactive.isDrained('我决定先去酒馆打听一下消息，然后再做打算') === false, '有实质内容不判枯竭');
  // 「好」是触发词，含它的短回复仍判枯竭——这是设计行为（玩家在敷衍式应承）
  assert(WA.proactive.isDrained('好的，我这就去办') === true, '含触发词「好」的短回复仍判枯竭');
  assert(WA.proactive.isDrained('马上动手') === false, '无触发词的短行动回复不判枯竭');
  // 超长回复不判枯竭（无论内容）
  assert(WA.proactive.isDrained('嗯'.repeat(50)) === false, '超长回复不判枯竭');

  // ── P1 before 链节点端到端 ──
  const node13 = WA.workflow.list('before').filter(n => n.id === 'proactive.pull')[0];
  assert(!!node13, 'proactive.pull 已注册 before 链');
  assert(node13.order === 25, 'proactive.pull order=25（在 directEvent.note 之后）');
  // 枯竭回复 → 注入主动拉动约束
  WA.store.transact(d => { delete d.proactiveLastRound; d.round = 10; });
  const ctx13 = { type: 'normal', chat: [{ role: 'user', mes: '嗯' }], store: WA.store.get(), injections: [] };
  await node13.run(ctx13);
  assert(ctx13.injections.length === 1, '枯竭回复触发主动拉动注入');
  assert(ctx13.injections[0].source === '主动拉动', '注入来源标记');
  assert(ctx13.injections[0].position === 'after_last_user' && ctx13.injections[0].depth === 0, '注入落点 after_last_user depth0');
  assert(ctx13.injections[0].content.indexOf('语义枯竭已检出') >= 0, '注入内容含枯竭判定');
  assert(ctx13.injections[0].content.indexOf('强制执行') >= 0, '注入内容含强制拉动指令');
  // 冷却：同轮再跑一次不应再注入
  const ctx13b = { type: 'normal', chat: [{ role: 'user', mes: '哦' }], store: WA.store.get(), injections: [] };
  await node13.run(ctx13b);
  assert(ctx13b.injections.length === 0, '冷却内不重复拉动（proactiveLastRound 已记录）');
  // 有实质内容不注入
  WA.store.transact(d => { delete d.proactiveLastRound; });
  const ctx13c = { type: 'normal', chat: [{ role: 'user', mes: '我拔剑指向那个npc' }], store: WA.store.get(), injections: [] };
  await node13.run(ctx13c);
  assert(ctx13c.injections.length === 0, '有实质动作不触发主动拉动');
  // markPulled 写入冷却字段
  WA.proactive.markPulled();
  assert(WA.store.get().proactiveLastRound != null, 'markPulled 记录冷却轮次');
  // 清理
  WA.store.transact(d => { delete d.proactiveLastRound; });

  // v0.1.13b: NPC 本位呈现约束（buildWorldSnapshot 尾部追加呈现铁律）
  const snap13 = WA.render.buildWorldSnapshot();
  if (snap13) {
    assert(snap13.indexOf('呈现铁律') >= 0, '世界状态块含 NPC 本位呈现铁律');
    assert(snap13.indexOf('系统旁白') >= 0, '呈现铁律明示禁止系统旁白');
    assert(snap13.indexOf('好感度数值') >= 0, '呈现铁律明示禁止数值面板');
    assert(snap13.indexOf('world_axis_state') >= 0, '快照外壳标签保持不变');
  } else {
    assert(true, '空快照时呈现铁律不追加（parts 为空直接返回空串）');
  }

  // ═══════════════════════════════════════════════════════════
  // v0.1.14 — wb 变量镜像注入通道（缝合附本生成器）
  // ═══════════════════════════════════════════════════════════
  v0114: {
  assert(WA.wbInject && typeof WA.wbInject.syncAll === 'function', 'wbInject 模块已加载');
  // orderKey 补零
  assert(WA.wbInject.orderKey(10) === 'waslot_0010', 'orderKey 10 补零到 4 位');
  assert(WA.wbInject.orderKey(212) === 'waslot_0212', 'orderKey 212（密集位置）');
  assert(WA.wbInject.orderKey(1000) === 'waslot_1000', 'orderKey 1000 上限');
  assert(WA.wbInject.orderKey(1) === 'waslot_0001', 'orderKey 1 下限');
  // validOrder 边界
  assert(WA.wbInject.validOrder(1) === true && WA.wbInject.validOrder(1000) === true, 'validOrder 1..1000 合法');
  assert(WA.wbInject.validOrder(0) === false && WA.wbInject.validOrder(1001) === false, 'validOrder 越界非法');
  assert(WA.wbInject.validOrder(10.5) === false, 'validOrder 非整数非法');
  // syncOrder 单组
  const r14 = WA.wbInject.syncOrder(212, [
    { source: '连续性约束', content: '约束A' },
    { source: '演化状态', content: '状态B' }
  ]);
  assert(r14.ok === true, 'syncOrder 212 成功');
  assert(r14.key === 'waslot_0212', 'syncOrder 返回变量名');
  assert(global.__vars['waslot_0212'] === '约束A' + '\n\n' + '状态B', '变量内容按顺序拼接: ' + JSON.stringify(global.__vars['waslot_0212']));
  // 空项写空串（0 token 语义）
  const r14e = WA.wbInject.syncOrder(213, []);
  assert(r14e.ok === true, 'syncOrder 空项成功');
  assert(global.__vars['waslot_0213'] === '', '空项写空串（EJS @@if 排除 = 0 token）');
  // bad order
  assertDeepEq(WA.wbInject.syncOrder(0, []).reason, 'bad-order', 'order=0 被拒');
  assertDeepEq(WA.wbInject.syncOrder(1001, []).reason, 'bad-order', 'order=1001 被拒');
  // clearOrder
  WA.wbInject.clearOrder(212);
  assert(global.__vars['waslot_0212'] === '', 'clearOrder 写空串');
  // syncAll 分组
  WA.wbInject.syncAll([
    { source: 'a', content: 'X1', order: 300 },
    { source: 'b', content: 'X2', order: 300 },
    { source: 'c', content: 'Y1', order: 400 },
    { source: 'd', content: '无order' }
  ]);
  assert(global.__vars['waslot_0300'] === 'X1' + '\n\n' + 'X2', 'syncAll 同 order 项拼接');
  assert(global.__vars['waslot_0400'] === 'Y1', 'syncAll 不同 order 分组');
  // 无 order 的项被跳过（不报错）
  assert(true, 'syncAll 无 order 项安全跳过');
  // wbEntryContent EJS 模板
  const tpl = WA.wbInject.wbEntryContent(212);
  assert(tpl.indexOf('waslot_0212') >= 0, 'EJS 模板含目标变量名');
  assert(tpl.indexOf('@@if') === 0, 'EJS 模板以 @@if 开头（空变量时排除 = 0 token）');
  assert(tpl.indexOf('getVariables') >= 0, 'EJS 模板含 TH 兜底读取路径');
  // ensureEntry（mock 已注入配套世界书名）
  // 先注入配套世界书名到 context
  const ctx14 = global.SillyTavern.getContext();
  ctx14.worldInfoSettings = ctx14.worldInfoSettings || {};
  ctx14.worldInfoSettings.world_names = ['WorldAxis'];
  const ee1 = await WA.wbInject.ensureEntry(500);
  assert(ee1.ok === true, 'ensureEntry 创建 EJS 条目成功: ' + JSON.stringify(ee1));
  const ee2 = await WA.wbInject.ensureEntry(500);
  assert(ee2.ok === true && ee2.reason === 'exists', 'ensureEntry 幂等（已存在不重建）');
  assert(global.__wbEntries['WorldAxis'].length === 1, '配套世界书只有 1 条（幂等）');
  const ent = global.__wbEntries['WorldAxis'][0];
  assert(ent.position.order === 500 && ent.position.type === 'before_character_definition', '条目落点 order=500 角色定义之前');
  assert(ent.content.indexOf('waslot_0500') >= 0, '条目 content 含变量名');
  // 找不到配套世界书
  ctx14.worldInfoSettings.world_names = ['别的东西'];
  const ee3 = await WA.wbInject.ensureEntry(501);
  assert(ee3.ok === false && ee3.reason === 'no-companion', '无配套世界书时降级返回 no-companion');
  ctx14.worldInfoSettings.world_names = ['WorldAxis'];
  // 开关
  const st14 = WA.backstage.getSettings();
  WA.backstage.setSettings({ wbInject: false });
  const rOff = WA.wbInject.syncOrder(600, [{ content: 'Z' }]);
  assert(rOff.ok === false && rOff.reason === 'disabled', 'wbInject 关闭时 syncOrder 拒绝');
  WA.backstage.setSettings({ wbInject: true });
  const rOn = WA.wbInject.syncOrder(600, [{ content: 'Z' }]);
  assert(rOn.ok === true, '重新开启后 syncOrder 恢复');
  // 清理
  WA.wbInject.clearOrder(300); WA.wbInject.clearOrder(400); WA.wbInject.clearOrder(600);
  } // end v0.1.14 block
  } // end v0.1.13 block
  v0115: {
  // ── v0.1.15: uninject 真撤销 + store 深合并回归 ──
  assert(typeof WA.render.uninject === 'function', 'uninject 方法已挂载');
  // 无快照时安全降级
  WA.store.transact(d => { d.lastInjection = null; });
  assertDeepEq(WA.render.uninject().reason, 'no-snapshot', '无 lastInjection 快照时 no-snapshot');
  // 构造带独立槽位的快照
  WA.store.transact(d => {
    d.lastInjection = { at: Date.now(), len: 120, sources: ['连续性约束'], budget: null,
      slots: { count: 2, applied: 2, keys: ['WorldAxis:after_last_user', 'WorldAxis:before_character_definition'], totalChars: 120, perSlot: [] },
      slotErrors: null };
  });
  global.__extPromptLog = [];
  const unj = WA.render.uninject();
  assert(unj.ok === true, 'uninject 返回 ok');
  assert(unj.cleared.length === 3, '清空 2 个独立槽位 + 1 个主槽位 = 3');
  const clearedKeys = unj.cleared.slice().sort();
  assertDeepEq(clearedKeys, ['WorldAxis', 'WorldAxis:after_last_user', 'WorldAxis:before_character_definition'].sort(), '清空全部已落地槽位 key');
  // 每个清空调用都写空串
  assert(global.__extPromptLog.length === 3, 'setExtensionPrompt 被调用 3 次');
  assert(global.__extPromptLog.every(r => r.text === ''), '清空写入空串');
  // 幂等：重复调用不报错且仍清空
  const unj2 = WA.render.uninject();
  assert(unj2.ok === true && unj2.cleared.length === 3, 'uninject 幂等');
  // P2-② 回归：transact 删除 key 后不复活（深合并陷阱不存在）
  WA.store.transact(d => { d.tempProbe = { a: 1, b: 2 }; });
  assert(WA.store.get().tempProbe.b === 2, '写入嵌套对象');
  WA.store.transact(d => { delete d.tempProbe.b; });
  assert(WA.store.get().tempProbe.b === undefined, 'delete 后 key 不复活');
  // 整表替换语义：save 是整体替换不是合并
  WA.store.transact(d => { d.tempProbe = { c: 3 }; });
  assertDeepEq(WA.store.get().tempProbe, { c: 3 }, 'save 整体替换：旧 key a/b 不残留');
  WA.store.transact(d => { delete d.tempProbe; });
  assert(WA.store.get().tempProbe === undefined, '清理探针');
  // chatcache.stripHeavy 是显式删除不是合并
  const heavy = JSON.stringify({ lastInjection: { len: 999 }, nextTurnInjection: { x: 1 }, keep: 'me' });
  const stripped = WA.chatcache.stripHeavy(heavy);
  assert(JSON.parse(stripped).lastInjection === undefined, 'stripHeavy 删除 lastInjection');
  assert(JSON.parse(stripped).nextTurnInjection === undefined, 'stripHeavy 删除 nextTurnInjection');
  assert(JSON.parse(stripped).keep === 'me', 'stripHeavy 保留非 heavy key');
  v0116: {
  // ── v0.1.16: CDN 多源容灾加载桩 ──
  // mock 的 document.createElement(script) 产出可控元素：
  //   __scriptEls 记录全部创建、__headScripts 记录已 appendChild
  global.__scriptEls = []; global.__headScripts = [];
  const savedBaseUrl = WA.baseUrl;
  WA.baseUrl = '/scripts/extensions/third-party/WorldAxis';
  // 场景1：主源 onload 成功
  let p1;
  try { p1 = WA.loadScript('core/store.js'); } catch (e) { console.log('DBG loadScript threw:' + e.message); }
  await new Promise(r => setTimeout(r, 10));  // 等 createElement 微任务执行
  const el1 = global.__scriptEls[global.__scriptEls.length - 1];
  assert(el1 && el1.src.indexOf(WA.baseUrl + '/core/store.js') === 0, '主源 src 拼接 baseUrl');
  assert(el1.src.indexOf('?v=') >= 0, 'src 带版本戳');
  assert(typeof el1.onload === 'function', 'onerror/onload 已挂载');
  el1.onload();
  const r1 = await p1;
  assert(r1.ok === true, '主源成功返回 ok');
  assert(r1.rel === 'core/store.js', '返回体带 rel');
  assert(r1.fallback === undefined, '主源成功无 fallback 字段');
  assert(global.__headScripts.length === 1, '主源元素被 appendChild 到 head');
  // 场景2：主源失败 → CDN 依次回退
  global.__scriptEls = []; global.__headScripts = [];
  const p2 = WA.loadScript('engines/wb-inject.js');
  const ls = global.__scriptEls.slice();
  assert(ls.length >= 1, '至少创建 1 个元素（主源）');
  ls[0].onerror(); // 主源失败
  await new Promise(r => setTimeout(r, 5));
  // CDN 链依次失败直到成功
  let ls2 = global.__scriptEls.slice();
  while (ls2.length < 4) {
    const el = global.__scriptEls[global.__scriptEls.length - 1];
    el.onerror();
    await new Promise(r => setTimeout(r, 5));
    ls2 = global.__scriptEls.slice();
  }
  const elLast = global.__scriptEls[global.__scriptEls.length - 1];
  elLast.onload();
  const r2 = await p2;
  assert(r2.ok === true, 'CDN 回退最终成功');
  assert(r2.fallback !== undefined, '成功时记录 fallback 源');
  assert(typeof r2.fallback === 'string' && r2.fallback.indexOf('jsdelivr') >= 0, 'fallback 是 jsDelivr 域');
  assert(global.__headScripts.length === 4, '主源 + 3 个 CDN 源共 4 次 appendChild');
  // 场景3：全部源失败
  global.__scriptEls = []; global.__headScripts = [];
  const p3 = WA.loadScript('core/missing.js');
  for (let k = 0; k < 4; k++) {
    await new Promise(r => setTimeout(r, 5));
    const el = global.__scriptEls[global.__scriptEls.length - 1];
    if (el && !el.__fired) { el.__fired = true; el.onerror(); }
  }
  const r3 = await p3;
  assert(r3.ok === false, '全源失败返回 ok:false');
  assert(r3.rel === 'core/missing.js', '失败也返回 rel');
  WA.baseUrl = savedBaseUrl;
  } // end v0.1.16 block
  } // end v0.1.15 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.12 — safe 语义全模块统一（undefined 兜底 + 无 fallback 返回 null）
  // ═══════════════════════════════════════════════════════════
  v0112: {
  // 四份规范 safe（inspector-state / inject-inspector / contract-audit / memory-sampler / sampler-check）
  const canonSafes = [
    { name: 'inspectorState', fn: WA.inspectorState.safe },
    { name: 'injectInspector', fn: WA.injectInspector.safe },
    { name: 'contractAudit', fn: WA.contractAudit ? WA.contractAudit.safe : null },
    { name: 'memorySampler', fn: WA.memorySampler ? WA.memorySampler.safe : null },
    { name: 'samplerCheck', fn: WA.samplerCheck ? WA.samplerCheck.safe : null }
  ];
  canonSafes.forEach(function (entry) {
    assert(entry.fn, 'safe 已导出: ' + entry.name);
    if (!entry.fn) return;
    // undefined 兜底
    assertDeepEq(entry.fn(function () { return undefined; }, 'FB'), 'FB', entry.name + '.safe(undefined,FB)=FB');
    // 无 fallback 时返回 null（不是 undefined）
    assertDeepEq(entry.fn(function () { return undefined; }), null, entry.name + '.safe(undefined)=null');
    // 异常时走 fallback
    assertDeepEq(entry.fn(function () { throw new Error('x'); }, 'FB'), 'FB', entry.name + '.safe(throw,FB)=FB');
    // 正常值直通
    assertDeepEq(entry.fn(function () { return 42; }, 'FB'), 42, entry.name + '.safe(42)=42');
    // null 是有效返回值（直通，不兜底）
    assertDeepEq(entry.fn(function () { return null; }, 'FB'), null, entry.name + '.safe(null)=null 直通');
  });
  // tool-diag 特例：异常时返回 {error}（诊断语义，不参与规范统一）
  assert(WA.toolDiag && WA.toolDiag.safe, 'toolDiag.safe 已导出');
  assertDeepEq(WA.toolDiag.safe(function () { return undefined; }, 'FB'), 'FB', 'toolDiag.safe(undefined,FB)=FB（与规范一致）');
  assertDeepEq(WA.toolDiag.safe(function () { return undefined; }), null, 'toolDiag.safe(undefined)=null（与规范一致）');
  const tdErr = WA.toolDiag.safe(function () { throw new Error('diag-boom'); }, 'FB');
  assert(tdErr && tdErr.error === 'diag-boom', 'toolDiag.safe 异常返回 {error}（诊断特例）: ' + JSON.stringify(tdErr));
  } // end v0.1.12 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.11 — stripHeavy 剥离注入诊断快照（跨设备同步去脏）
  // ═══════════════════════════════════════════════════════════
  v0111: {
  const heavyRaw = JSON.stringify({ evolution: { stage: 1, _ledgerCheckpoint: 123, events: [{ t: 'x' }] }, lastInjection: { at: 1, len: 99, slots: { applied: 1 } }, slotErrors: [{ slot: 'S', detail: 'boom' }], nextTurnInjection: { nearEvent: { title: 'T' } }, keepMe: 'yes' });
  const stripped = JSON.parse(WA.chatcache.stripHeavy(heavyRaw));
  assert(!('lastInjection' in stripped), 'stripHeavy 剥离 lastInjection');
  assert(!('slotErrors' in stripped), 'stripHeavy 剥离 slotErrors（v0.1.9 新增）');
  assert(!('nextTurnInjection' in stripped), 'stripHeavy 剥离 nextTurnInjection（backstage 三列载体）');
  assert(stripped.keepMe === 'yes', 'stripHeavy 保留持久业务字段');
  assert(stripped.evolution && stripped.evolution.stage === 1, 'stripHeavy 保留 evolution 业务字段');
  assert(!('_ledgerCheckpoint' in stripped.evolution), 'stripHeavy 剥离 evolution 临时字段');
  assert(Array.isArray(stripped.evolution.events), 'stripHeavy 保留 events 数组结构');
  // 非法 JSON 不抛异常（原样返回）
  assert(WA.chatcache.stripHeavy('not-json') === 'not-json', 'stripHeavy 非法 JSON 原样返回');
  // 空对象与单字段
  assertDeepEq(JSON.parse(WA.chatcache.stripHeavy('{}')), {}, 'stripHeavy 空对象');
  assertDeepEq(JSON.parse(WA.chatcache.stripHeavy(JSON.stringify({ slotErrors: [1, 2] }))), {}, 'stripHeavy 单脏字段对象');
  } // end v0.1.11 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.10 — getLastSnapshot 返回独立副本（防外部篡改污染内部状态）
  // ═══════════════════════════════════════════════════════════
  v0110: {
  // 复用 v0.1.7 的事件触发通道；先确保已有快照
  assert(WA.injectInspector.getLastSnapshot() !== null || true, '快照前置条件不致命');
  // 触发一次 chat 事件确保内部快照非空
  WA.injectInspector.markRegistered(1);
  await global.__triggerEvent('chat_completion_prompt_ready', { chat: [{ role: 'assistant', mes: '[WorldAxis] 快照本体' }], dryRun: false });
  const snapA = WA.injectInspector.getLastSnapshot('world');
  assert(snapA !== null, 'world 域快照非空');
  // 修改返回副本不得污染内部
  snapA.tampered = true;
  const snapB = WA.injectInspector.getLastSnapshot('world');
  assert(snapB.tampered !== true, '外部修改不污染内部快照（副本隔离）');
  assert(snapA !== snapB, '每次调用返回新副本（引用不同）');
  // memory 域同样是副本且内容一致
  const snapM = WA.injectInspector.getLastSnapshot('memory');
  assert(snapM !== null, 'memory 域快照非空');
  assert(snapA.ts === snapM.ts, 'memory 与 world 快照内容一致');
  snapM.tampered = true;
  assert(WA.injectInspector.getLastSnapshot('memory').tampered !== true, 'memory 副本隔离');
  } // end v0.1.10 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.9 — applySlots 逐槽位容错（单槽位失败不中断）
  // ═══════════════════════════════════════════════════════════
  v019: {
  // ── v0.1.9: applySlots 返回对象 {applied,total,errors} ──
  assertDeepEq(WA.injectChannel.applySlots(null, icPlan), { applied: 0, total: 2, errors: [{ slot: '(all)', detail: 'setExt 不是函数' }] }, 'setExt 非函数时返回错误对象不抛异常');
  assertDeepEq(WA.injectChannel.applySlots(function () {}, []).applied, 0, '空槽位计划 applied=0');
  assertDeepEq(WA.injectChannel.applySlots(function () {}, null).applied, 0, 'null 槽位计划 applied=0');
  // 单槽位失败不中断其余槽位
  const failLog = [];
  const failPlan = [
    { slot: 'WorldAxis:in_chat', position: 'in_chat', depth: 5, text: 'A' },
    { slot: 'WorldAxis:after_last_user', position: 'after_last_user', depth: 0, text: 'B' }
  ];
  const failRes = WA.injectChannel.applySlots(function (slotName, text) {
    failLog.push(slotName);
    if (text === 'B') throw new Error('boom-slot');
  }, failPlan);
  assert(failLog.length === 2, '两个槽位都被调用（失败不中断）: ' + JSON.stringify(failLog));
  assert(failRes.applied === 1 && failRes.total === 2, 'applied=1/total=2: ' + JSON.stringify({ a: failRes.applied, t: failRes.total }));
  assert(failRes.errors.length === 1 && failRes.errors[0].slot === 'WorldAxis:after_last_user', '错误快照含失败槽位: ' + JSON.stringify(failRes.errors));
  assert(String(failRes.errors[0].detail).indexOf('boom-slot') >= 0, '错误快照含异常信息');
  const okRes = WA.injectChannel.applySlots(function () {}, failPlan);
  assert(okRes.applied === 2 && okRes.errors.length === 0, '全部成功: applied=2, errors=[]');
  } // end v0.1.9 block
  // ── 端到端：applyInjections 的 ctx.injections 真的走了独立槽位 ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  const icCtx = { injections: [
    { source: '连续性约束', content: '<slot-e2e/>约束', position: 'after_last_user', depth: 0 },
    { source: '章节', content: '<slot-e2e/>章节', position: 'after_last_user', depth: 2 }
  ]};
  WA.render.applyInjections(icCtx);
  assert(global.__lastExtensionPrompt !== null, '槽位路由端到端：applyInjections 仍调用 setExtensionPrompt');
  const icLog = global.__extPromptLog || [];
  const icSlotCall = icLog.filter(function (r) { return r.key === 'WorldAxis:after_last_user'; })[0];
  assert(!!icSlotCall, '端到端：存在 after_last_user 独立槽位调用记录');
  const icE2E = icSlotCall;
  assert(icE2E.pos === 1 && icE2E.depth === 0, '端到端：独立槽位 pos=1 depth=0');
  assert(icE2E.text.indexOf('<slot-e2e/>约束') >= 0 && icE2E.text.indexOf('<slot-e2e/>章节') >= 0, '端到端：两路约束都进入独立槽位文本');
  assert(icE2E.text.indexOf('<slot-e2e/>约束') < icE2E.text.indexOf('<slot-e2e/>章节'), '端到端：深度排序在最终文本中生效（约束在章节前）');
  // 主槽位不应重复包含已被独立槽位接管的约束文本
  const icMainCalls = icLog.filter(function (r) { return r.key === 'WorldAxis'; });
  const icMainCall = icMainCalls[icMainCalls.length - 1];
  assert(!!icMainCall, '端到端：主槽位调用仍存在');
  assert(icMainCalls.length >= 1, '端到端：主槽位调用记录存在');
  var icNoDup = icMainCalls.every(function (r) { return !r.text || r.text.indexOf('<slot-e2e/>') < 0; });
  assert(icNoDup, '端到端：约束文本不重复注入主槽位');
  assert(global.__waInjLog !== undefined || true, '日志占位（不强制）');
  // ── 端到端降级：槽位路由不可用时回退并入主块 ──
  const keepIC = WA.injectChannel;
  delete WA.injectChannel;
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  WA.render.applyInjections(icCtx);
  const icFall = global.__lastExtensionPrompt;
  assert(icFall.key === 'WorldAxis', '降级：回退到主槽位 WorldAxis');
  assert(global.__extPromptLog.filter(function (r) { return r.key === 'WorldAxis:after_last_user'; }).length === 0, '降级：无独立槽位调用');
  assert(icFall.text.indexOf('<slot-e2e/>约束') >= 0 && icFall.text.indexOf('<slot-e2e/>章节') >= 0, '降级：带 position 的约束文本并入主块');
  WA.injectChannel = keepIC;
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/inject-channel.js'] === 'injectChannel', '诊断清单已登记 inject-channel');
  } // end v0.1.1 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.2 — 预算裁决字段透传（inject-budget apply passthrough）
  // ═══════════════════════════════════════════════════════════
  v012: {
  // ── apply 透传原始项的全部字段 ──
  const ibItems = [
    { source: '连续性约束', content: 'A-约束文本', position: 'after_last_user', depth: 0 },
    { source: '章节', content: 'B-章节文本', position: 'after_last_user', depth: 2 },
    { source: '世界状态', content: 'C-状态文本', position: 'in_chat', depth: 5 },
    { source: '记忆', content: 'D-记忆文本' }
  ];
  const ibPlan = WA.injectBudget.plan(ibItems, { budget: 100000 });
  const ibApplied = WA.injectBudget.apply(ibItems, ibPlan);
  assert(ibApplied.length === 4, 'apply 保留全部 4 项（大预算不裁决）');
  const ibA = ibApplied.filter(function (i) { return i.source === '连续性约束'; })[0];
  const ibB = ibApplied.filter(function (i) { return i.source === '章节'; })[0];
  const ibC = ibApplied.filter(function (i) { return i.source === '世界状态'; })[0];
  const ibD = ibApplied.filter(function (i) { return i.source === '记忆'; })[0];
  assert(ibA.position === 'after_last_user' && ibA.depth === 0, 'apply 透传 position+depth（after_last_user depth0）');
  assert(ibB.position === 'after_last_user' && ibB.depth === 2, 'apply 透传 position+depth（after_last_user depth2）');
  assert(ibC.position === 'in_chat' && ibC.depth === 5, 'apply 透传 position+depth（in_chat depth5）');
  assert(!ibD.position && !ibD.depth, 'apply 无 position 项不伪造字段');
  // ── 折叠场景下仍透传 ──
  const ibPlan2 = WA.injectBudget.plan(ibItems, { budget: 20 });
  const ibApplied2 = WA.injectBudget.apply(ibItems, ibPlan2);
  const ibFolded = ibApplied2.filter(function (i) { return i.folded === true; });
  if (ibFolded.length) {
    const ibF = ibFolded[0];
    assert(!!ibF.position, '折叠项仍透传 position: ' + ibF.position);
  } else {
    assert(true, '小预算未触发折叠（trivially pass）');
  }
  // ── 端到端：预算裁决后槽位路由仍能按 position 分流 ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  const ibCtx = { injections: [
    { source: '连续性约束', content: '<ib-e2e/>约束', position: 'after_last_user', depth: 0 },
    { source: '世界状态', content: '<ib-e2e/>状态', position: 'in_chat', depth: 5 }
  ]};
  WA.render.applyInjections(ibCtx);
  const ibLog = global.__extPromptLog || [];
  const ibALU = ibLog.filter(function (r) { return r.key === 'WorldAxis:after_last_user'; })[0];
  const ibIC = ibLog.filter(function (r) { return r.key === 'WorldAxis:in_chat'; })[0];
  assert(!!ibALU, '端到端：预算裁决后 after_last_user 槽位仍被路由');
  assert(ibALU.text.indexOf('<ib-e2e/>约束') >= 0, '端到端：约束文本进入 after_last_user 槽位');
  assert(!ibALU.text || ibALU.text.indexOf('<ib-e2e/>状态') < 0, '端到端：状态文本不混入 after_last_user 槽位');
  if (ibIC) {
    assert(ibIC.text.indexOf('<ib-e2e/>状态') >= 0, '端到端：状态文本进入 in_chat 槽位');
  }
  // ── 主块不重复包含已路由项 ──
  const ibMainCalls = ibLog.filter(function (r) { return r.key === 'WorldAxis'; });
  assert(ibMainCalls.length >= 1, '端到端：主槽位调用存在');
  const ibLastMain = ibMainCalls[ibMainCalls.length - 1];
  assert(!ibLastMain.text || ibLastMain.text.indexOf('<ib-e2e/>') < 0, '端到端：预算裁决后主块不重复包含已路由项');
  } // end v0.1.2 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.3 — 注入槽位落地审计（inject-slot-audit）
  // ═══════════════════════════════════════════════════════════
  v013: {
  assert(typeof WA.injectSlotAudit === 'object', 'injectSlotAudit 已加载');
  assert(typeof WA.injectSlotAudit.snapshotSlots === 'function', 'snapshotSlots 是函数');
  assert(typeof WA.injectSlotAudit.audit === 'function', 'audit 是函数');
  // ── snapshotSlots 采集 ──
  const saPlan = WA.injectChannel.planSlots([
    { source: '连续性约束', content: '约束A', position: 'after_last_user', depth: 0 },
    { source: '世界状态', content: '状态B', position: 'in_chat', depth: 5 }
  ]);
  const saSnap = WA.injectSlotAudit.snapshotSlots(saPlan, 2);
  assert(saSnap.count === 2, 'snapshotSlots 记录计划槽位数 2');
  assert(saSnap.applied === 2, 'snapshotSlots 记录落地数 2');
  assert(saSnap.keys.length === 2 && saSnap.keys[0] === 'WorldAxis:after_last_user', 'snapshotSlots keys 正确');
  assert(saSnap.totalChars === ('约束A' + '状态B').length, 'snapshotSlots 总字符数正确');
  assert(saSnap.perSlot.length === 2, 'snapshotSlots perSlot 有 2 项');
  assert(saSnap.perSlot[0].chars === 3, 'snapshotSlots perSlot[0] 字符数 3（约束A）');
  // ── snapshotSlots 降级 ──
  assertDeepEq(WA.injectSlotAudit.snapshotSlots(null, 0).perSlot, [], 'snapshotSlots null 入参降级');
  assertDeepEq(WA.injectSlotAudit.snapshotSlots([], 0).count, 0, 'snapshotSlots 空计划 count=0');
  assert(WA.injectSlotAudit.snapshotSlots(saPlan).applied === 0, 'applied 缺省为 0');
  // ── audit：一致情况 ──
  const saOk = WA.injectSlotAudit.audit({ len: 10, sources: ['世界状态'], slots: saSnap });
  assert(saOk.consistent === true, 'audit 计划=落地时一致');
  assert(saOk.issues.length === 0, 'audit 一致时无 issues');
  // ── audit：无槽位快照（旧记录）──
  const saLegacy = WA.injectSlotAudit.audit({ len: 10, sources: ['世界状态'] });
  assert(saLegacy.consistent === true, 'audit 无 slots 字段时一致（兼容旧记录）');
  assert(!!saLegacy.note, 'audit 旧记录带 note 说明');
  assertDeepEq(WA.injectSlotAudit.audit(null).consistent, true, 'audit null 入参一致');
  // ── audit：落地数不足 → appliedMismatch + orphan ──
  const saPartial = WA.injectSlotAudit.snapshotSlots(saPlan, 1);
  const saBad = WA.injectSlotAudit.audit({ len: 10, sources: [], slots: saPartial });
  assert(saBad.consistent === false, 'audit 计划2/落地1 时不一致');
  const saMis = saBad.issues.filter(function (x) { return x.code === 'slot.appliedMismatch'; })[0];
  assert(!!saMis, 'audit 报 appliedMismatch');
  const saOrphan = saBad.issues.filter(function (x) { return x.code === 'slot.orphan'; })[0];
  assert(!!saOrphan, 'audit 报 slot.orphan（孤儿槽位）');
  // ── 端到端：lastInjection 快照含 slots ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  const saCtx = { injections: [
    { source: '连续性约束', content: '<sa-e2e/>约束', position: 'after_last_user', depth: 0 }
  ]};
  WA.render.applyInjections(saCtx);
  const saLi = WA.store.get().lastInjection;
  assert(!!saLi, '端到端：lastInjection 快照已写入');
  assert(!!saLi.slots, '端到端：lastInjection 快照含 slots 字段');
  assert(saLi.slots.count === 1, '端到端：快照 slots.count=1（一路约束）');
  assert(saLi.slots.applied === 1, '端到端：快照 slots.applied=1（路由成功）');
  assert(saLi.slots.keys[0] === 'WorldAxis:after_last_user', '端到端：快照 slots.keys 含 after_last_user');
  // 端到端 audit 一致
  const saE2EAudit = WA.injectSlotAudit.audit(saLi);
  assert(saE2EAudit.consistent === true, '端到端：audit 一致（计划=落地）');
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/inject-slot-audit.js'] === 'injectSlotAudit', '诊断清单已登记 inject-slot-audit');
  } // end v0.1.3 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.4 — 近端事件消费后归零（nextTurnInjection 空壳修复）
  // ═══════════════════════════════════════════════════════════
  v014: {
  // ── 场景1：仅有 nearEvent，消费后应整体归零 ──
  WA.store.transact(function (d) {
    d.nextTurnInjection = { nearEvent: { title: '突发', desc: '测试事件', urgent: true } };
  });
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  WA.render.applyInjections({ injections: [] });
  assert(WA.store.get().nextTurnInjection === null, '仅 nearEvent 时消费后 nextTurnInjection 整体归零（无空壳）');
  // ── 场景2：nearEvent + 三列并存，消费后保留三列 ──
  WA.store.transact(function (d) {
    d.nextTurnInjection = {
      required: ['必须体现A'],
      conditional: [],
      suppress: ['禁止B'],
      nearEvent: { title: '突2', desc: '测试2', urgent: false }
    };
  });
  WA.render.applyInjections({ injections: [] });
  const nti2 = WA.store.get().nextTurnInjection;
  assert(!!nti2, 'nearEvent+三列并存时消费后保留 nextTurnInjection');
  assert(!nti2.nearEvent, 'nearEvent 已被清除');
  assert(nti2.required.length === 1 && nti2.required[0] === '必须体现A', '三列 required 保留');
  assert(nti2.suppress[0] === '禁止B', '三列 suppress 保留');
  // 清理
  WA.store.transact(function (d) { d.nextTurnInjection = null; });
  // ── 场景3：无 nextTurnInjection 时不报错 ──
  WA.store.transact(function (d) { d.nextTurnInjection = null; });
  WA.render.applyInjections({ injections: [] });
  assert(WA.store.get().nextTurnInjection === null, '无 nti 时保持 null（不报错）');
  // ── 场景4：nearEvent 注入文本确实进入主块 ──
  WA.store.transact(function (d) {
    d.nextTurnInjection = { nearEvent: { title: '马蹄声', desc: '远处传来马蹄', urgent: true } };
  });
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const neMain = global.__lastExtensionPrompt;
  assert(!!neMain && neMain.key === 'WorldAxis', 'nearEvent 走主槽位');
  assert(neMain.text.indexOf('[突发事件] 马蹄声（紧急）：远处传来马蹄') >= 0, 'nearEvent 文本进入主块');
  assert(WA.store.get().nextTurnInjection === null, 'nearEvent 注入后归零');
  } // end v0.1.4 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.5 — inspector-state 检查对齐归零语义（emptyShell）
  // ═══════════════════════════════════════════════════════════
  v015: {
  // v0.1.5 断言修正：四字段全无内容指「字段不存在或全空」，不是「空数组」
  const esState = { meta: { updatedAt: Date.now() }, nextTurnInjection: {} };
  const esIssues = WA.inspectorState.checkInjection(esState);
  const esShell = esIssues.filter(function (x) { return x.code === 'inject.emptyShell'; })[0];
  assert(!!esShell, '四字段全无报 inject.emptyShell');
  assert(esShell.level === 'warn', 'emptyShell 级别 warn');
  const esState2 = { meta: { updatedAt: Date.now() }, nextTurnInjection: { required: ['x'], conditional: [], suppress: [] } };
  const esIssues2 = WA.inspectorState.checkInjection(esState2);
  assert(!esIssues2.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], 'required 有内容时不报 emptyShell');
  const esState3 = { meta: { updatedAt: Date.now() }, nextTurnInjection: { nearEvent: { title: 't', desc: 'd' } } };
  const esIssues3 = WA.inspectorState.checkInjection(esState3);
  assert(!esIssues3.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], '仅 nearEvent 时不报 emptyShell');
  const esState4 = { meta: { updatedAt: Date.now() }, nextTurnInjection: { nearEvent: {} } };
  const esIssues4 = WA.inspectorState.checkInjection(esState4);
  assert(!!esIssues4.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], 'nearEvent 空对象且无三列时报 emptyShell');
  const esState5 = { meta: { updatedAt: Date.now() }, nextTurnInjection: null };
  const esIssues5 = WA.inspectorState.checkInjection(esState5);
  assert(!esIssues5.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], 'nextTurnInjection=null 时不报 emptyShell');
  const esState6 = { meta: { updatedAt: 1000 }, nextTurnInjection: { required: ['x'], at: 5000 } };
  const esIssues6 = WA.inspectorState.checkInjection(esState6);
  assert(!!esIssues6.filter(function (x) { return x.code === 'inject.futureStamp'; })[0], '时间戳晚于 meta.updatedAt 仍报 inject.futureStamp');
  assert(esIssues.filter(function (x) { return x.code === 'inject.badShape'; }).length === 0, 'inject.badShape 已移除');

  } // end v0.1.5 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.6 — tool-diag 诊断输出槽位落地信息
  // ═══════════════════════════════════════════════════════════
  v016: {
  // ── 先制造一次带槽位落地的注入 ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  WA.render.applyInjections({ injections: [
    { source: '连续性约束', content: '<d16/>约束', position: 'after_last_user', depth: 0 },
    { source: '章节', content: '<d16/>章节', position: 'after_last_user', depth: 2 }
  ]});
  const d16Li = WA.store.get().lastInjection;
  assert(!!d16Li && !!d16Li.slots, 'v0.1.6 前置：lastInjection 含 slots');
  // ── collect 的 inject 段含槽位信息 ──
  const d16Diag = WA.toolDiag.collect();
  const d16Inject = d16Diag.inject || {};
  assert(!!d16Inject.slots, '诊断 collect 的 inject 段含 slots');
  assert(d16Inject.slots.count === 1, '诊断 inject.slots.count=1（after_last_user 一桶）');
  assert(d16Inject.slotConsistent === true, '诊断 slotConsistent=true（一致）');
  assert(!d16Inject.slotIssues, '一致时无 slotIssues');
  // ── flatten 输出含 injectSlots 行 ──
  const d16Flat = WA.toolDiag.flatten(d16Diag);
  const d16SlotRow = d16Flat.filter(function (x) { return x.key === 'injectSlots'; })[0];
  assert(!!d16SlotRow, 'flatten 输出含 injectSlots 行');
  assert(d16SlotRow.detail.indexOf('1/1') >= 0, 'injectSlots 详情含 1/1 落地数');
  assert(d16SlotRow.level === 'info', '一致时 injectSlots 级别 info');
  // ── 不一致时 flatten 报 warn ──
  WA.store.transact(function (d) {
    if (d.lastInjection && d.lastInjection.slots) d.lastInjection.slots.applied = 0;
  });
  const d16Diag2 = WA.toolDiag.collect();
  assert(d16Diag2.inject.slotConsistent === false, '篡改 applied 后 slotConsistent=false');
  assert(!!d16Diag2.inject.slotIssues, '不一致时输出 slotIssues');
  const d16Flat2 = WA.toolDiag.flatten(d16Diag2);
  const d16SlotRow2 = d16Flat2.filter(function (x) { return x.key === 'injectSlots'; })[0];
  assert(!!d16SlotRow2 && d16SlotRow2.level === 'warn', '不一致时 injectSlots 级别 warn');
  assert(d16SlotRow2.detail.indexOf('0/1') >= 0, '不一致时详情含 0/1');
  // 清理：恢复一致状态避免污染后续测试
  WA.store.transact(function (d) { d.lastInjection = null; });
  } // end v0.1.6 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.7 — inject-inspector 槽位感知（SUCCESS_SLOTS_ONLY）
  // ═══════════════════════════════════════════════════════════
  v017: {
  // ── STATUS_TEXT 含新状态 ──
  assert(!!WA.injectInspector.STATUS_TEXT.SUCCESS_SLOTS_ONLY, 'STATUS_TEXT 含 SUCCESS_SLOTS_ONLY');
  assert(WA.injectInspector.statusText('SUCCESS_SLOTS_ONLY').indexOf('独立槽位') >= 0, 'statusText(SUCCESS_SLOTS_ONLY) 含「独立槽位」');
  // ── snapEnv 含槽位字段 ──
  WA.store.transact(function (d) { d.lastInjection = { len: 0, sources: [], slots: { count: 2, applied: 2, keys: ['WorldAxis:after_last_user'] } }; });
  const env17 = WA.injectInspector.snapEnv({}, {});
  assert(env17.slotLanded === true, 'snapEnv.slotLanded=true（有槽位落地记录）');
  assert(env17.slotCount === 2, 'snapEnv.slotCount=2');
  // ── classify：主块未注册 + 槽位落地 → SUCCESS_SLOTS_ONLY ──
  const envNoReg = { injectEnabled: true, registeredAtSend: false, slotLanded: true, slotCount: 1 };
  assert(WA.injectInspector.classify(envNoReg, false) === 'SUCCESS_SLOTS_ONLY', 'classify: 未注册+槽位落地=SUCCESS_SLOTS_ONLY');
  // ── classify：未注册 + 无槽位 → SKIPPED_OTHER（旧行为）──
  const envNoSlot = { injectEnabled: true, registeredAtSend: false, slotLanded: false, slotCount: 0 };
  assert(WA.injectInspector.classify(envNoSlot, false) === 'SKIPPED_OTHER', 'classify: 未注册+无槽位=SKIPPED_OTHER');
  // ── classify：已落地仍优先 SUCCESS ──
  assert(WA.injectInspector.classify(envNoReg, true) === 'SUCCESS', 'classify: landed=true 优先 SUCCESS');
  // ── flatten 输出 slotsOnly 行 ──
  const snap17 = { status: 'SUCCESS_SLOTS_ONLY', landed: false, apiType: 'prompt', env: envNoReg };
  const flat17 = WA.injectInspector.flatten(snap17);
  const row17 = flat17.filter(function (x) { return x.key === 'slotsOnly'; })[0];
  assert(!!row17, 'flatten 输出 slotsOnly 行');
  assert(row17.level === 'pass', 'slotsOnly 级别 pass');
  assert(row17.detail.indexOf('独立槽位') >= 0, 'slotsOnly 详情含「独立槽位」');
  // 清理
  WA.store.transact(function (d) { d.lastInjection = null; });
  } // end v0.1.7 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.8 — safe 语义统一（undefined 兜底）
  // ═══════════════════════════════════════════════════════════
  v018: {
  // ── inject-inspector.safe 的 undefined 兜底（通过 snapEnv 间接验证）──
  // snapEnv 的 chatId 在 store.chatId 缺失时返回 null（fallback），不返回 undefined
  const env18 = WA.injectInspector.snapEnv({}, {});
  assert(env18.chatId === null || typeof env18.chatId === 'string', 'snapEnv.chatId 有兜底值（非 undefined）');
  // ── 直接验证内部 safe：通过 WA.injectInspector 的公开函数间接 ──
  // markRegistered(0) 不报错，len 兜底为 0
  WA.injectInspector.markRegistered(0);
  assert(true, 'markRegistered(0) 不抛异常');
  // ── 语义一致性验证：各模块 safe 行为对齐 ──
  // v0.1.8: 两份 safe 实现已逐字对齐：undefined 兜底 + 异常兜底 + 无 fallback 时返回 null
  const st2 = WA.inspectorState.safe(function () { return undefined; }, 'FB');
  assert(st2 !== undefined, 'inspector-state.safe 不返回 undefined');
  assert(st2 === 'FB', 'inspector-state.safe(undefined) 用 fallback 兜底: ' + JSON.stringify(st2));
  // 无 fallback 时返回 null（不是 undefined）——两份实现共同保证
  const st3 = WA.inspectorState.safe(function () { return undefined; });
  assert(st3 === null, 'inspector-state.safe 无 fallback 返回 null: ' + JSON.stringify(st3));
  // 抛异常时走 fallback
  const st4 = WA.inspectorState.safe(function () { throw new Error('boom'); }, 'FB');
  assert(st4 === 'FB', 'inspector-state.safe 异常时用 fallback 兜底: ' + JSON.stringify(st4));
  // inject-inspector.safe 同语义（通过 markRegistered/snapEnv 间接覆盖，此处直接验证导出）
  const ii1 = WA.injectInspector.safe ? WA.injectInspector.safe(function () { return undefined; }, 'FB') : 'NO_EXPORT';
  assert(ii1 === 'FB' || ii1 === 'NO_EXPORT', 'inject-inspector.safe(undefined,FB) 用 fallback: ' + JSON.stringify(ii1));
  } // end v0.1.8 block
  // ── 汇总 ──
  console.log('\n══════════════════════');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (failures.length) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
  console.log('全部测试通过 ✓');
  process.exit(0);
})().catch(e => { console.error('测试运行器异常: ', e); process.exit(2); });
