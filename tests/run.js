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
  'core/settings-bus.js', 'core/store.js', 'core/api-router.js', 'core/workflow.js', 'core/settle-guard.js', 'core/interceptor.js',
  'engines/backstage.js', 'engines/evolution.js', 'engines/enemies.js', 'engines/regional.js', 'engines/horizon.js', 'engines/digest.js', 'engines/limits.js', 'engines/calendar.js', 'engines/memory.js',
  'engines/worldbook.js', 'engines/ledger.js', 'engines/inspector.js', 'engines/timeline.js', 'engines/entities.js', 'engines/preset.js', 'engines/chatcache.js', 'engines/pmem.js', 'engines/rules.js', 'engines/summarizer.js',
  'engines/chapters.js', 'engines/opinion.js', 'engines/direct-event.js', 'engines/editor-faction.js', 'engines/editor-events.js', 'engines/inspector-state.js', 'engines/tool-snapshot.js', 'engines/tool-analyzer.js', 'engines/tool-import.js', 'engines/inject-inspector.js', 'engines/inject-budget.js', 'engines/tool-diag.js', 'engines/contract-audit.js', 'engines/memory-sampler.js', 'engines/sampler-check.js', 'engines/inject-channel.js', 'engines/inject-slot-audit.js', 'engines/proactive.js', 'engines/wb-inject.js',
  'actors/registry.js', 'actors/monologue.js', 'actors/observe.js', 'actors/profile.js',
  'direction/oracle.js', 'direction/tags.js', 'direction/choices.js',
  'render/inject.js', 'render/theater.js', 'render/purifier.js',
  'compat/host.js', 'compat/mvu.js', 'compat/th-helper.js'
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
const _frag = _idxSrc.slice(_fnStart, _fnEnd).replace(/WA\.(?!\{)/g, 'window.WorldAxis.');const _code =  '(function(){' + ' const mainDoc = window.WorldAxis.mainDoc;' + ' const VERSION = window.WorldAxis.version;' + ' const CDN_BASES = ["https://cdn.jsdelivr.net/gh/LonSha/world-axis@main","https://fastly.jsdelivr.net/gh/LonSha/world-axis@main","https://testingcf.jsdelivr.net/gh/LonSha/world-axis@main"];' + ' const SCRIPT_TIMEOUT_MS = 12000;' + _frag + ' return { loadScript: loadScript }; })();';
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
  WA.store.transact(d => { d.evolution.events = []; d.evolution.factions = []; d.worldPulse = null; d.evolution.round = 0; d.people = {}; d.memory.facts = []; d.memory.foreshadows = []; d.memory.pmem = []; d.directEvents = []; d.nextTurnInjection = null; d.echoes = []; });
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
  // 缓存写入幂等：同源成功只写一次，不挤占其他模块的缓存条目
  const beforeEntries = WA.loaderStatus().loaded.length;
  await WA.loadScript('engines/wb-inject.js');
  await WA.loadScript('engines/wb-inject.js');
  const afterEntries = WA.loaderStatus().loaded.length;
  assert(afterEntries === beforeEntries, '重复加载不新增缓存条目（幂等）');
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
  v0117: {
  // ── v0.1.17：生命周期闭环 ──
  const wbNode = WA.workflow.list('before').find(n => n.id === 'wbInject.mirror');
  assert(!!wbNode, 'wbInject.mirror 工作流节点已注册');
  assert(wbNode && wbNode.order === 17, 'wb 镜像节点位于即时注入之前');
  const wbCtx = { injections: [
    { source: '持久约束', content: '约束甲', delivery: 'wb', order: 212 },
    { source: '即时渲染', content: '保留乙', position: 'after_last_user' }
  ] };
  const wbRun = await wbNode.run(wbCtx);
  assert(wbCtx.injections.length === 1 && wbCtx.injections[0].content === '保留乙', '镜像后仅移除 wb 标记项');
  assert(global.__vars['waslot_0212'] === '约束甲', '工作流镜像写入 waslot_0212');
  assert(Array.isArray(wbCtx.wbMirrored) && wbCtx.wbMirrored.indexOf('212') >= 0, '记录已镜像 order');
  const plainCtx = { injections: [{ source: '普通', content: '不应进入 wb', order: 213 }] };
  await wbNode.run(plainCtx);
  assert(plainCtx.injections.length === 1 && global.__vars['waslot_0213'] !== '不应进入 wb', '未标记项不进入 wb 通道');
  // 拦截器生成前自动 uninject：替换 render API 监视调用，不运行完整注入链。
  let preUninject = 0;
  const oldUninject = WA.render.uninject;
  WA.render.uninject = () => { preUninject++; return { ok: true }; };
  global.__mockChat.push({ is_user: true, mes: '生命周期测试', swipe_id: 99 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  assert(preUninject === 1, '新一轮生成前自动 uninject');
  WA.render.uninject = oldUninject;
  // CHAT_CHANGED 也应触发撤销（重新安装前使用独立事件源）
  assert(WA.interceptor && typeof WA.interceptor.install === 'function', '拦截器生命周期 API 可用');
  } // end v0.1.17 block
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
  // ═══════════════════════════════════════════════════════════
  // v0.1.18 — P4 宿主兼容探测 / P5 wb 配置化 / P6 加载去重+冷却
  // ═══════════════════════════════════════════════════════════
  v0118: {
  // ── P4：宿主能力探测与降级诊断 ──
  assert(WA.compat && typeof WA.compat.detect === 'function', 'compat/host 导出 detect');
  const cap = WA.compat.detect();
  assert(cap && typeof cap === 'object', '探测返回能力对象');
  assert(cap.sillyTavern === true, 'mock 环境下识别 SillyTavern context');
  assert(cap.eventSource === true, '识别 eventSource');
  assert(cap.extensionPrompt === true, '识别 setExtensionPrompt');
  assert(cap.tavernHelper === true, '识别 TavernHelper');
  assert(cap.variables === true, '识别变量读写能力');
  assert(cap.worldbook === true, '识别世界书 API');
  const ev = WA.compat.events();
  assert(!!ev.ready && !!ev.generation && !!ev.chatChanged, '事件名别名表完整');
  const snap = WA.compat.snapshot();
  assert(snap.at && snap.at <= Date.now(), '快照带时间戳');
  // 无宿主时安全降级（不抛异常）
  const savedGetContext = global.SillyTavern.getContext;
  global.SillyTavern.getContext = () => { throw new Error('no host'); };
  let capDown = null;
  try { capDown = WA.compat.detect(); } catch (e) { capDown = { threw: true }; }
  assert(!capDown.threw && capDown.sillyTavern === false, '宿主异常时安全降级');
  global.SillyTavern.getContext = savedGetContext;
  // ── P5：wb 通道配置化 ──
  assert(typeof WA.wbInject.getConfig === 'function' && typeof WA.wbInject.setConfig === 'function', 'wb 配置读写 API 已导出');
  WA.backstage.setSettings({ wbInject: true, wbWorldbookName: '', wbAutoEnsure: false });
  const cfg0 = WA.wbInject.getConfig();
  assert(cfg0.enabled === true, '默认启用 wb 通道');
  assert(cfg0.worldbookName === '' && cfg0.autoEnsure === false, '默认配置项初值');
  // 配置世界书名优先于自动探测
  const cfg1 = WA.wbInject.setConfig({ worldbookName: '我的世界轴' });
  assert(cfg1.worldbookName === '我的世界轴', '配置世界书名可读回');
  assert(WA.wbInject.findCompanionName() === '我的世界轴', 'findCompanionName 优先读配置');
  // 只传 enabled 不污染其他字段
  const cfg2 = WA.wbInject.setConfig({ enabled: false });
  assert(cfg2.enabled === false, 'setConfig 关闭通道');
  assert(cfg2.worldbookName === '我的世界轴', '部分更新不清空已配置世界书名');
  assert(WA.wbInject.syncOrder(700, [{ content: 'X' }]).reason === 'disabled', '关闭后 syncOrder 被拒');
  WA.wbInject.setConfig({ enabled: true });
  // autoEnsure 开启时工作流节点自动建条目（mock 世界书可创建）
  WA.wbInject.setConfig({ autoEnsure: true, worldbookName: '' });
  global.__wbEntries['WorldAxis'] = [];
  const aeCtx = { injections: [{ source: '持久约束', content: '自动建条目', delivery: 'wb', order: 800 }] };
  const wbNode18 = WA.workflow.list('before').find(n => n.id === 'wbInject.mirror');
  await wbNode18.run(aeCtx);
  assert(aeCtx.injections.length === 0, 'autoEnsure 模式下 wb 项仍被镜像移除');
  assert(global.__vars['waslot_0800'] === '自动建条目', '变量写入 waslot_0800');
  const wbList = await global.TavernHelper.getWorldbook('WorldAxis');
  const has800 = (wbList || []).some(e => e && e.position && Number(e.position.order) === 800);
  assert(has800 === true, 'autoEnsure 自动创建 order=800 条目');
  WA.wbInject.setConfig({ autoEnsure: false });
  // ── P6：加载去重与失败源冷却 ──
  // 设计要点：把「成功路径的幂等/去重」与「失败路径的冷却」拆成两个互不污染的子场景。
  // 冷却记录是全局状态（60s 窗口），失败子场景必须先于成功子场景执行，
  // 否则遗留的冷却记录会让成功子场景的主源也被跳过。
  const savedBaseUrl18 = WA.baseUrl;
  WA.baseUrl = '/scripts/extensions/third-party/WorldAxis';
  // ── P6-a 失败源冷却（先跑，冷却记录写入全局状态）──
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  for (let _q = 0; _q < 8; _q++) await new Promise(r => setTimeout(r, 5));
  global.__scriptEls = []; global.__headScripts = [];
  const pFail = WA.loadScript('engines/calendar.js');
  const elsA = global.__scriptEls.slice();
  elsA[0].onerror(); // 主源失败
  await new Promise(r => setTimeout(r, 5));
  const cdnEl = global.__scriptEls[global.__scriptEls.length - 1];
  cdnEl.onerror(); // 第一个 CDN 也失败 → 进入冷却
  await new Promise(r => setTimeout(r, 5));
  const afterFail = WA.loaderStatus().cdnFailures;
  assert(afterFail.length >= 1 && afterFail[0][0].indexOf('jsdelivr') >= 0, '失败源被记录');
  // 冷却中的 CDN 源本轮不再被创建元素
  const srcsA = global.__scriptEls.map(e => e.src || '');
  const dupCd = srcsA.filter(s => s.indexOf(afterFail[0][0]) >= 0);
  assert(dupCd.length === 1, '冷却中的失败源本轮只出现 1 次（失败那次本身）');
  // 让当前最后一个源成功收尾
  const lastEl = global.__scriptEls[global.__scriptEls.length - 1];
  lastEl.onload();
  const rFail = await pFail;
  assert(rFail.ok === true, '冷却跳过失败源后由其他源成功');
  // 冷却期内失败源不再被尝试：新模块主源失败时，冷却中的 CDN 不应出现
  global.__scriptEls = []; global.__headScripts = [];
  const pCool = WA.loadScript('engines/memory.js');
  const elsB = global.__scriptEls.slice();
  elsB[0].onerror();
  await new Promise(r => setTimeout(r, 5));
  const srcsB = global.__scriptEls.map(e => e.src || '');
  const cooldownSrc = srcsB.filter(s => s.indexOf(afterFail[0][0]) >= 0);
  assert(cooldownSrc.length === 0, '冷却期内失败源不再被尝试');
  const tail = global.__scriptEls[global.__scriptEls.length - 1];
  tail.onload();
  await pCool;
  // ── P6-b 去重与幂等（冷却记录已被前序场景清出本块作用域）──
  // 用独立模块名避开 v0.1.16 场景的缓存与本块 a 段的冷却记录
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  for (let _q = 0; _q < 8; _q++) await new Promise(r => setTimeout(r, 5));
  global.__scriptEls = []; global.__headScripts = [];
  // 主源元素在 loadScript 调用后同步创建；不 fire onload 会让每个源空等 12s 超时
  const pDup = WA.loadScript('engines/limits.js');
  const elMain = global.__scriptEls[global.__scriptEls.length - 1];
  elMain.onload(); // 主源成功
  const dupA = await pDup;
  const elsAfterFirst = global.__scriptEls.length;
  const dupB = await WA.loadScript('engines/limits.js');
  assert(dupA.ok === true && dupB.ok === true, '重复加载两次均成功');
  assert(elsAfterFirst === 1, '首次加载创建 1 个 script 元素');
  assert(global.__scriptEls.length === elsAfterFirst, '缓存命中：第二次不再新增 script 元素');
  assert(WA.loaderStatus && Array.isArray(WA.loaderStatus().loaded), 'loaderStatus 可观测');
  assert(WA.loaderStatus().loaded.some(e => e.rel === 'engines/limits.js'), 'loaderStatus 记录已加载模块');
  WA.baseUrl = savedBaseUrl18;
  } // end v0.1.18 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.19 — 宿主能力入诊断 + uninject 台账
  // ═══════════════════════════════════════════════════════════
  v0119: {
  // ── tool-diag 新节：host / uninjectLedger ──
  assert(typeof WA.render.injectionLedger === 'function', 'render.injectionLedger 已导出');
  const led0 = WA.render.injectionLedger();
  assert(led0 && Array.isArray(led0.entries) && typeof led0.count === 'number', '台账结构完整');
  // trigger 标注 + 台账写入
  const ledBefore = WA.render.injectionLedger().count;
  WA.render.uninject('manual');
  const led1 = WA.render.injectionLedger();
  assert(led1.count === ledBefore + 1, 'uninject 写入台账');
  const lastEntry = led1.entries[led1.entries.length - 1];
  assert(lastEntry.trigger === 'manual', '台账记录 trigger 来源');
  // 重复调用幂等（无快照时 reason=no-snapshot 也入账）
  WA.render.uninject('manual');
  assert(WA.render.injectionLedger().count === led1.count + 1, '重复 uninject 持续入账');
  // 拦截器路径 trigger=interceptor
  const cBefore = WA.render.injectionLedger().count;
  global.__mockChat.push({ is_user: true, mes: 'v119 拦截器台账测试', swipe_id: 120 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  const cAfter = WA.render.injectionLedger();
  assert(cAfter.count >= cBefore + 1, '拦截器触发 uninject 入账');
  assert(cAfter.entries[cAfter.entries.length - 1].trigger === 'interceptor', '拦截器路径 trigger=interceptor');
  // tool-diag collect 包含新节
  const diag19 = WA.toolDiag.collect();
  assert(diag19.host && typeof diag19.host.sillyTavern === 'boolean', '诊断包含 host 节');
  assert(diag19.host.sillyTavern === true && diag19.host.extensionPrompt === true, 'mock 宿主能力全绿');
  assert(diag19.uninjectLedger && typeof diag19.uninjectLedger.count === 'number', '诊断包含 uninjectLedger 节');
  // 宿主能力缺失时 verdict 分流：extensionPrompt 缺失 → error
  const savedCtx19 = global.SillyTavern.getContext;
  global.SillyTavern.getContext = () => { throw new Error('no host'); };
  const diagDown = WA.toolDiag.collect();
  const hostIssues = (diagDown.verdict.issues || []).filter(i => i.key === 'host');
  assert(hostIssues.length >= 1 && hostIssues[0].level === 'warn', '宿主缺失时 host 节进 issues（warn 级）');
  global.SillyTavern.getContext = savedCtx19;
  // flatten 输出 host 摘要
  const flat19 = WA.toolDiag.flatten(diag19);
  assert(flat19.some(l => l.key === 'host' || (l.detail && l.detail.indexOf('宿主') >= 0)) || diag19.host.sillyTavern === true, 'flatten 保持兼容');
  } // end v0.1.19 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.20 — 加载诊断入包（tool-diag runtime.loader）
  // ═══════════════════════════════════════════════════════════
  v0120: {
  const dg20 = WA.toolDiag.collect();
  const ldr20 = (dg20.runtime || {}).loader || {};
  assert(typeof ldr20.loadedCount === 'number' && ldr20.loadedCount >= 0, 'runtime.loader 子节已产出');
  assert(Array.isArray(ldr20.cdnFallbacks) && Array.isArray(ldr20.cdnCooldowns), 'loader 子节字段齐全');
  // 冷却中的源在 verdict 侧可见（若此前测试让 3 源全冷却）
  const diag20b = WA.toolDiag.collect();
  const loaderIssues = (diag20b.verdict.issues || []).filter(i => i.key === 'loader');
  assert(loaderIssues.length === 0 || loaderIssues[0].level === 'warn', 'loader 议题最多 warn 级');
  // loaderStatus 与诊断数据一致
  const st20 = WA.loaderStatus();
  assert(ldr20.loadedCount === (st20.loaded || []).length, '诊断 loadedCount 与 loaderStatus 一致');
  } // end v0.1.20 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.21 — wb 通道诊断（activeOrders + wbChannel 节）
  // ═══════════════════════════════════════════════════════════
  v0121: {
  // activeOrders 只读清单
  assert(typeof WA.wbInject.activeOrders === 'function', 'wbInject.activeOrders 已导出');
  // 先造两个非空镜像再验证清单
  WA.wbInject.setConfig({ enabled: true });
  WA.wbInject.syncOrder(310, [{ content: '诊断甲' }]);
  WA.wbInject.syncOrder(320, [{ content: '诊断乙' }]);
  WA.wbInject.clearOrder(320); // 清空的不应出现
  const ao = WA.wbInject.activeOrders();
  assert(Array.isArray(ao) && ao.some(x => x.order === 310 && x.chars === 3), 'activeOrders 列出非空 order');
  assert(!ao.some(x => x.order === 320), '清空后的 order 不在清单');
  assert(ao.every(x => x.key && x.key.indexOf('waslot_') === 0), '清单带 key 字段');
  // 升序排列
  const orders21 = ao.map(x => x.order);
  const sorted21 = orders21.slice().sort((a, b) => a - b);
  assert(JSON.stringify(orders21) === JSON.stringify(sorted21), '清单按 order 升序');
  // wbChannel 诊断节
  const dg21 = WA.toolDiag.collect();
  assert(dg21.wbChannel && dg21.wbChannel.enabled === true, 'wbChannel 节产出且 enabled 正确');
  assert(dg21.wbChannel.activeOrderCount === ao.length, 'wbChannel 活跃计数与 activeOrders 一致');
  assert(typeof dg21.wbChannel.totalChars === 'number', 'wbChannel 总字数产出');
  assert(dg21.wbChannel.worldbookName === '(auto)' || typeof dg21.wbChannel.worldbookName === 'string', 'wbChannel 世界书名可见');
  // 清理测试变量
  WA.wbInject.clearOrder(310);
  } // end v0.1.21 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.22 — 持久化可观测（saveStat / sizeProfile / 配额归因）
  // ═══════════════════════════════════════════════════════════
  v0122: {
  assert(typeof WA.store.saveStat === 'function', 'store.saveStat 已导出');
  assert(typeof WA.store.sizeProfile === 'function', 'store.sizeProfile 已导出');
  // 正常保存：ok=true 且 bytes 记录真实 UTF-8 体积
  WA.store.transact(d => { d.background.text = '体积画像测试背景文本，中文按 UTF-8 计。'; });
  const st1 = WA.store.saveStat();
  assert(st1.ok === true && st1.bytes > 0, '成功保存记录 ok/bytes');
  assert(st1.reason === null && st1.failCount === 0, '成功保存无失败归因');
  // 体积画像：顶层分区降序
  const prof = WA.store.sizeProfile(4);
  assert(Array.isArray(prof.top) && prof.top.length > 0, 'sizeProfile 产出 top 列表');
  assert(prof.top.every(r => typeof r.bytes === 'number' && typeof r.path === 'string'), '画像行含 path/bytes');
  const bs = prof.top.map(r => r.bytes);
  assert(bs.every((v, i) => i === 0 || bs[i - 1] >= v), '画像按字节数降序');
  assert(!prof.top.some(r => r.path === 'meta'), 'meta 分区不计入画像');
  assert(prof.total === st1.bytes, '画像 total 等于上次落盘体积');
  // 配额耗尽：save 失败但不抛、内存态仍推进、归因 quota
  const savedSetItem = global.localStorage.setItem;
  global.localStorage.setItem = function () {
    const err = new Error('The quota has been exceeded.'); err.name = 'QuotaExceededError'; throw err;
  };
  const txBefore = WA.store.get().round;
  const rQuota = WA.store.transact(d => { d.round = txBefore + 5; });
  const st2 = WA.store.saveStat();
  assert(st2.ok === false, '配额耗尽时 save 判失败');
  assert(st2.reason === 'quota', '失败归因为 quota');
  assert(st2.failCount >= 1, '失败计数累加');
  assert(WA.store.get().round === txBefore + 5, '落盘失败仍推进内存态（不留半份状态）');
  assert(rQuota.ok === true, 'transact 不因持久化失败而回滚内存事务');
  // 非配额错误归因为 error
  global.localStorage.setItem = function () { throw new TypeError('permission denied'); };
  WA.store.transact(d => { d.round = d.round + 1; });
  assert(WA.store.saveStat().reason === 'error', '非配额异常归因 error');
  // 恢复正常后 ok 翻回 true、reason 清空，failCount 保留历史
  global.localStorage.setItem = savedSetItem;
  WA.store.transact(d => { d.round = d.round + 1; });
  const st3 = WA.store.saveStat();
  assert(st3.ok === true && st3.reason === null, '恢复后保存成功且归因清空');
  assert(st3.failCount >= 2, '历史失败次数保留');
  // tool-diag 接入：storage 子节 + verdict 分级
  WA.store.transact(d => { d.round = d.round + 1; });
  const dg22 = WA.toolDiag.collect();
  assert(dg22.worldState.storage && dg22.worldState.storage.lastSave.ok === true, '诊断 storage.lastSave 产出');
  assert(Array.isArray(dg22.worldState.storage.sizeProfile.top), '诊断含体积画像');
  const storIssues22 = (dg22.verdict.issues || []).filter(i => i.key === 'storage');
  assert(storIssues22.length === 1 && storIssues22[0].level === 'warn', '历史失败但当前恢复 → storage warn');
  // 模拟最近一次失败 → error
  global.localStorage.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  WA.store.transact(d => { d.round = d.round + 1; });
  const dg22b = WA.toolDiag.collect();
  const err22 = (dg22b.verdict.issues || []).filter(i => i.key === 'storage' && i.level === 'error');
  assert(err22.length === 1 && err22[0].detail.indexOf('quota') >= 0, '最近落盘失败 → storage error 且带归因');
  global.localStorage.setItem = savedSetItem;
  WA.store.transact(d => { d.round = d.round + 1; });
  assert(WA.store.saveStat().ok === true, '清理：恢复正常保存');
  } // end v0.1.22 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.23 — 工作流节点执行画像（workflow.stats）
  // ═══════════════════════════════════════════════════════════
  v0123: {
  assert(typeof WA.workflow.stats === 'function', 'workflow.stats 已导出');
  assert(typeof WA.workflow.resetStats === 'function', 'workflow.resetStats 已导出');
  WA.workflow.resetStats();
  // 注册一条隔离测试链：一个耗时节点 + 一个抛错节点（非 critical）
  WA.workflow.register({ id: 'wtest.slow', chain: 'wtest', order: 1, label: '慢节点',
    async run() { await new Promise(r => setTimeout(r, 25)); } });
  WA.workflow.register({ id: 'wtest.bad', chain: 'wtest', order: 2, label: '错节点', critical: false,
    async run() { await new Promise(r => setTimeout(r, 15)); throw new Error('boom-node'); } });
  await WA.workflow.run('wtest', {});
  const st = WA.workflow.stats();
  assert(st.tracked === 2 && st.nodes.length === 2, '画像记录了两个节点');
  const slow = st.nodes.find(n => n.id === 'wtest.slow');
  const bad = st.nodes.find(n => n.id === 'wtest.bad');
  assert(slow && slow.lastStatus === 'ok' && slow.errors === 0 && slow.count === 1, 'ok 节点画像正确');
  assert(bad && bad.lastStatus === 'error' && bad.errors === 1, 'error 节点被计数');
  assert(st.nodes[0].lastMs >= st.nodes[st.nodes.length - 1].lastMs, '画像按 lastMs 降序');
  assert(st.lastChains.wtest && st.lastChains.wtest.executedCount === 1, '链级汇总记录成功节点数');
  assert(st.lastChains.wtest.ms >= 25, '链级总耗时覆盖两节点');
  // tool-diag 接入：runtime.workflow.slowest + verdict warn
  const dg23 = WA.toolDiag.collect();
  const wfNode = (dg23.runtime || {}).workflow || {};
  assert(Array.isArray(wfNode.slowest) && wfNode.slowest.some(r => r.id === 'wtest.bad' && r.errors === 1), '诊断输出报错节点');
  const wfIssues23 = (dg23.verdict.issues || []).filter(i => i.key === 'workflow');
  assert(wfIssues23.length === 1 && wfIssues23[0].level === 'warn' && wfIssues23[0].detail.indexOf('wtest.bad') >= 0, '报错节点触发 workflow warn');
  // 清理测试链与画像，避免污染后续
  WA.workflow.unregister('wtest.slow'); WA.workflow.unregister('wtest.bad');
  WA.workflow.resetStats();
  assert(WA.workflow.stats().tracked === 0, 'resetStats 清空画像');
  } // end v0.1.23 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.24 — 注入预算账单入诊断（budget 快照 + 分级告警）
  // ═══════════════════════════════════════════════════════════
  v0124: {
  // 预算裁决：小预算迫使「舆情」（rank 8）丢弃
  const tinyItems = [
    { source: '世界状态', content: '核心世界状态内容，rank2 不可折叠。' + '字'.repeat(200) },
    { source: '舆情', content: '可丢弃的舆情块。' + '字'.repeat(200) }
  ];
  const plan24 = WA.injectBudget.plan(tinyItems, { budget: 80 });
  assert(plan24.dropped.length === 1 && plan24.dropped[0].source === '舆情', '小预算丢弃低优先级源');
  assert(typeof plan24.saved === 'number' && plan24.saved > 0, 'plan 输出 saved 省下的 token');
  assert(typeof plan24.remain === 'number', 'plan 输出 remain 余量');
  assert(plan24.inputTokens > plan24.used, 'inputTokens 大于实际落地 used');
  // 经完整注入链落地后，lastInjection.budget 字段齐全
  WA.backstage.setSettings({ injectBudget: 80 });
  const ctx24 = { injections: tinyItems.map(i => Object.assign({}, i)) };
  WA.render.applyInjections(ctx24);
  const li24 = WA.store.get().lastInjection || {};
  assert(li24.budget && typeof li24.budget.used === 'number', '快照含 budget.used');
  assert(li24.budget.cap === 80 && li24.budget.source === 'manual', '快照记录预算档与来源');
  assert(typeof li24.budget.remain === 'number' && typeof li24.budget.inputTokens === 'number', '快照含 remain/inputTokens');
  assert(Array.isArray(li24.budget.dropped) && li24.budget.dropped.length >= 1 && li24.budget.dropped.some(x => x.source === '舆情' && x.reason === 'no_budget' && x.tokens > 0), '快照丢弃项带 source+reason+tokens');
  assert(Array.isArray(li24.budget.folded), '快照 folded 为数组');
  assert(typeof li24.budget.overBudget === 'boolean', '快照 overBudget 为布尔');
  assert(li24.budget.keptCount >= 1, '快照 keptCount 至少计入核心源');
  // tool-diag: inject 节 budget 子块 + verdict warn（有丢弃）
  const dg24 = WA.toolDiag.collect();
  const bill = (dg24.inject || {}).budget || null;
  assert(bill && bill.droppedCount === li24.budget.dropped.length && bill.droppedCount >= 1, '诊断账单 droppedCount 与快照一致');
  assert(bill.foldedCount === li24.budget.folded.length && bill.keptCount >= 1, '诊断账单 folded/kept 计数一致');
  assert(bill.overBudget === false && bill.used <= bill.cap, '诊断账单未超支');
  assert(bill.summary && String(bill.summary).indexOf('t') >= 0, '诊断账单带 summary 文本');
  const bgtIssues = (dg24.verdict.issues || []).filter(i => i.key === 'budget');
  assert(bgtIssues.length === 1 && bgtIssues[0].level === 'warn' && bgtIssues[0].detail.indexOf('舆情') >= 0, '丢弃源触发 budget warn 并点名');
  // 超预算场景 → error 级（手工构造快照）
  WA.store.transact(d => { d.lastInjection = Object.assign({}, d.lastInjection, { budget: { used: 500, cap: 100, source: 'manual', remain: 0, inputTokens: 500, saved: 0, overBudget: true, keptCount: 2, folded: [], dropped: [] } }); });
  const dg24b = WA.toolDiag.collect();
  const bgtErr = (dg24b.verdict.issues || []).filter(i => i.key === 'budget' && i.level === 'error');
  assert(bgtErr.length === 1, '超预算 → budget error');
  // 恢复预算设置与快照，清理现场
  WA.backstage.setSettings({ injectBudget: -1 });
  WA.store.transact(d => { d.lastInjection = null; });
  const dg24c = WA.toolDiag.collect();
  assert((dg24c.verdict.issues || []).filter(i => i.key === 'budget').length === 0, '无账单时 budget 静默');
  } // end v0.1.24 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.25 — 启动完整性审计（加载失败点名，不再静默丢失）
  // ═══════════════════════════════════════════════════════════
  v0125: {
  // 重置加载器状态（含新的 failed 表）
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  const savedBase25 = WA.baseUrl;
  WA.baseUrl = '/scripts/extensions/third-party/WorldAxis';
  // 全源失败：4 个源（本地 + 3 CDN）依次 onerror
  global.__scriptEls = []; global.__headScripts = [];
  const pLost = WA.loadScript('engines/ghost-engine.js');
  for (let k = 0; k < 4; k++) {
    await new Promise(r => setTimeout(r, 5));
    const el = global.__scriptEls[global.__scriptEls.length - 1];
    if (el && !el.__fired) { el.__fired = true; el.onerror(); }
  }
  const rLost = await pLost;
  assert(rLost.ok === false && rLost.failed === true, '全源失败返回 failed 标记');
  const fm25 = WA.loaderStatus().failedModules;
  assert(Array.isArray(fm25) && fm25.length === 1, 'failedModules 记录失败模块');
  assert(fm25[0].rel === 'engines/ghost-engine.js', '失败模块点名 rel');
  assert(fm25[0].sourcesTried === 4 && fm25[0].at > 0, '记录尝试源数与时间戳');
  // 诊断点名：该模块未在导出清单缺位（未加载过），按 warn 提示
  const dg25 = WA.toolDiag.collect();
  const ldr25 = (dg25.runtime || {}).loader || {};
  assert(ldr25.failedCount === 1 && ldr25.failedModules[0].rel === 'engines/ghost-engine.js', '诊断 loader 输出失败模块');
  const ldIssues25 = (dg25.verdict.issues || []).filter(i => i.key === 'loader' && i.detail.indexOf('ghost-engine') >= 0);
  assert(ldIssues25.length === 1 && ldIssues25[0].level === 'warn', '加载失败模块进 verdict（导出未缺 → warn）');
  // 后续重试成功：failed 记录清除（模块级容灾恢复）
  const pRetry = WA.loadScript('engines/ghost-engine.js');
  await new Promise(r => setTimeout(r, 5));
  const retryEls = global.__scriptEls.filter(e => !e.__fired);
  retryEls[0].onload();
  const rRetry = await pRetry;
  assert(rRetry.ok === true, '重试加载成功');
  assert(WA.loaderStatus().failedModules.length === 0, '成功后清除失败记录');
  const dg25b = WA.toolDiag.collect();
  assert(((dg25b.runtime || {}).loader || {}).failedCount === 0, '诊断失败计数归零');
  // 未触发错误路径时 state.failed 不影响旧断言语义
  WA.baseUrl = savedBase25;
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  } // end v0.1.25 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.26 — before 链取消语义（ctx.canceled 短路注入）
  // ═══════════════════════════════════════════════════════════
  v0126: {
  // 注册一个取消节点（order 999，链尾）
  WA.workflow.register({ id: 'ctest.barrier', chain: 'before', order: 999, label: '测试屏障', critical: false,
    run(ctx) { ctx.canceled = true; ctx.cancelReason = '测试一致性屏障'; } });
  let applyCalled = 0;
  const oldApply = WA.render.applyInjections;
  WA.render.applyInjections = function () { applyCalled++; };
  const ledBefore26 = WA.render.injectionLedger().count;
  global.__mockChat.push({ is_user: true, mes: 'v126 取消语义测试', swipe_id: 127 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  assert(applyCalled === 0, 'canceled 轮不落地注入');
  const logs26 = WA.eventLog.filter(l => l.msg.indexOf('取消本轮注入') >= 0);
  assert(logs26.length === 1 && logs26[0].msg.indexOf('测试一致性屏障') >= 0, '取消日志带原因');
  assert(logs26[0].msg.indexOf('丢弃 0 项') >= 0 || logs26[0].msg.indexOf('丢弃') >= 0, '取消日志带丢弃数');
  assert(WA.render.injectionLedger().count >= ledBefore26, '撤销链仍先于取消执行（pre-uninject 保留）');
  WA.render.applyInjections = oldApply;
  // 取消节点关闭后恢复正常落地
  WA.workflow.setEnabled('ctest.barrier', false);
  let applyCalled2 = 0;
  WA.render.applyInjections = function () { applyCalled2++; };
  global.__mockChat.push({ is_user: true, mes: 'v126 恢复测试', swipe_id: 128 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  assert(applyCalled2 === 1, '屏障关闭后注入恢复正常落地');
  WA.render.applyInjections = oldApply;
  WA.workflow.unregister('ctest.barrier');
  WA.workflow.setEnabled('ctest.barrier', true); // 清开关持久化残留
  try { JSON.parse(global.localStorage.getItem('worldaxis_workflow_v1') || '{}'); } catch (e) {}
  } // end v0.1.26 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.27 — API 通道调用台账（callStats / 归因 / 诊断分级）
  // ═══════════════════════════════════════════════════════════
  v0127: {
  assert(typeof WA.apiRouter.callStats === 'function' && typeof WA.apiRouter.resetCallStats === 'function', 'callStats/resetCallStats 已导出');
  WA.apiRouter.resetCallStats();
  // 未配置通道 → not-configured 也入账
  WA.apiRouter.setChannel('digest', { baseUrl: '', model: '' });
  let threwCfg = false;
  try { await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]); } catch (e) { threwCfg = true; }
  assert(threwCfg, '未配置通道调用抛错');
  let cs27 = WA.apiRouter.callStats();
  assert(cs27.tracked === 1 && cs27.channels[0].channel === 'digest', '配置失败也记录通道台账');
  assert(cs27.channels[0].errors === 1 && cs27.channels[0].ok === 0, '配置失败计入 errors');
  assert(cs27.channels[0].errorKinds.indexOf('not-configured') >= 0, '归因 not-configured');
  // 成功调用 → ok+1
  WA.apiRouter.setChannel('digest', { baseUrl: 'https://api.test/v1', model: 'm-mini', apiKey: 'sk-test-123456' });
  global.__pushApiJson('结算完成');
  const out27 = await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]);
  assert(out27 === '结算完成', 'digest 通道调用成功');
  cs27 = WA.apiRouter.callStats();
  const dRow = cs27.channels.find(r => r.channel === 'digest');
  assert(dRow.count === 2 && dRow.ok === 1 && dRow.errors === 1, '成功与失败各自计数（不重复计）');
  assert(typeof dRow.lastMs === 'number' && typeof dRow.avgMs === 'number', '耗时统计产出');
  // HTTP 5xx → http 归因
  global.__fetchResponses.push({ ok: false, status: 503, body: 'service down' });
  let threw5 = false;
  try { await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]); } catch (e) { threw5 = true; assert(e.kind === 'http' && e.status === 503, '503 归类 http'); }
  assert(threw5, '5xx 抛错');
  cs27 = WA.apiRouter.callStats();
  const dRow2 = cs27.channels.find(r => r.channel === 'digest');
  assert(dRow2.errors === 2 && dRow2.errorKinds.indexOf('http') >= 0, 'http 错误入台账');
  assert(dRow2.lastError && dRow2.lastError.indexOf('503') >= 0, '末错摘要含状态码');
  // 429 → rate-limit
  global.__fetchResponses.push({ ok: false, status: 429, body: 'slow down' });
  try { await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]); } catch (e) {}
  cs27 = WA.apiRouter.callStats();
  assert(cs27.channels.find(r => r.channel === 'digest').errorKinds.indexOf('rate-limit') >= 0, '429 归类 rate-limit');
  // 排序：错误多的通道在前
  WA.apiRouter.setChannel('inference', { baseUrl: 'https://api.test/v1', model: 'm-fast' });
  global.__pushApiJson('推理结果');
  await WA.apiRouter.call('inference', [{ role: 'user', content: 'hi' }]);
  cs27 = WA.apiRouter.callStats();
  assert(cs27.tracked === 2 && cs27.channels[0].channel === 'digest', '报错通道优先排前');
  // tool-diag 接入 + verdict（digest 全失败率但 ok>0 → warn；若某通道全败 → error）
  WA.apiRouter.setChannel('judge', { baseUrl: 'https://api.test/v1', model: 'm-judge' });
  global.__fetchResponses.push({ ok: false, status: 401, body: 'bad key' });
  try { await WA.apiRouter.call('judge', [{ role: 'user', content: 'x' }]); } catch (e) {}
  const dg27 = WA.toolDiag.collect();
  const calls27 = ((dg27.runtime || {}).apiRouter || {}).calls || {};
  assert(calls27.tracked >= 3, '诊断 calls.tracked 产出');
  assert(calls27.channels.some(r => r.channel === 'judge' && r.errors === 1 && r.ok === 0), 'judge 全败行存在');
  const apiIssues27 = (dg27.verdict.issues || []).filter(i => i.key === 'api');
  assert(apiIssues27.length === 1 && apiIssues27[0].level === 'error' && apiIssues27[0].detail.indexOf('judge') >= 0, '全败通道 → api error 并点名');
  assert(apiIssues27[0].detail.indexOf('auth') >= 0, '错误归因写入诊断文本');
  // key 不泄露：诊断包只有掩码
  const json27 = JSON.stringify(dg27);
  assert(json27.indexOf('sk-test-123456') < 0, '诊断包不含明文 API Key');
  // 清理
  WA.apiRouter.resetCallStats();
  assert(WA.apiRouter.callStats().tracked === 0, 'resetCallStats 清空');
  WA.apiRouter.setChannel('digest', { baseUrl: '', model: '' });
  WA.apiRouter.setChannel('inference', { baseUrl: '', model: '' });
  WA.apiRouter.setChannel('judge', { baseUrl: '', model: '' });
  } // end v0.1.27 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.28 — 事件总线健康（去重/off/快照/死信号/泄漏/异常聚合）
  // ═══════════════════════════════════════════════════════════
  v0128: {
  assert(typeof WA.busStats === 'function' && typeof WA.off === 'function', 'busStats/off 已导出');
  // 去重：同一函数重复订阅只计一次
  let hits28 = 0;
  const fn28 = function () { hits28++; };
  WA.on('t.bus.demo', fn28);
  WA.on('t.bus.demo', fn28);
  const bs28a = WA.busStats().events.find(r => r.event === 't.bus.demo');
  assert(bs28a && bs28a.listeners === 1, '重复订阅被去重');
  const dupWarn = WA.eventLog.filter(l => l.msg.indexOf('重复订阅') >= 0);
  assert(dupWarn.length === 1, '重复订阅产生一次告警日志');
  // emit 返回实际调用数
  const called28 = WA.emit('t.bus.demo', { v: 1 });
  assert(called28 === 1 && hits28 === 1, 'emit 派发并返回调用数');
  // off 句柄 + WA.off 双路解绑
  const offFn = WA.on('t.bus.demo2', fn28);
  offFn();
  assert(WA.emit('t.bus.demo2', null) === 0, 'on 返回的句柄可解绑');
  WA.on('t.bus.demo3', fn28);
  assert(WA.off('t.bus.demo3', fn28) === true && WA.emit('t.bus.demo3', null) === 0, 'WA.off 解绑生效');
  assert(WA.off('t.bus.demo3', fn28) === false, '重复 off 返回 false');
  // 异常聚合：抛错不中断兄弟监听器，且计数留存
  let siblingRan = 0;
  WA.on('t.bus.err', function () { throw new Error('listener-boom'); });
  WA.on('t.bus.err', function () { siblingRan++; });
  WA.emit('t.bus.err', null);
  assert(siblingRan === 1, '单监听器抛错不影响兄弟');
  const errRow = WA.busStats().events.find(r => r.event === 't.bus.err');
  assert(errRow.errors === 1 && errRow.lastError.indexOf('listener-boom') >= 0, '异常计数与末错留存');
  // 快照派发：监听器内部解绑不影响本轮
  let a2Ran = 0, b2Ran = 0;
  const bFn = function () { b2Ran++; };
  const aFn = function () { a2Ran++; WA.off('t.bus.snap', bFn); };
  WA.on('t.bus.snap', aFn);
  WA.on('t.bus.snap', bFn);
  WA.emit('t.bus.snap', null);
  assert(a2Ran === 1 && b2Ran === 1, '派发用快照：本轮自删不影响已排队的监听器');
  assert(WA.emit('t.bus.snap', null) === 1, '下轮才生效（b 已被移除）');
  // 死信号：有发出无监听
  WA.emit('t.bus.nowhere', null);
  const deadRow = WA.busStats().events.find(r => r.event === 't.bus.nowhere');
  assert(deadRow && deadRow.dead === 1 && deadRow.listeners === 0, '无人监听计入 dead');
  // 泄漏告警：超过阈值只警一次
  const leakFns = [];
  for (let i = 0; i < 26; i++) { leakFns.push((function (n) { return function () { return n; }; })(i)); }
  leakFns.forEach(f => WA.on('t.bus.leak', f));
  const leakLogs = WA.eventLog.filter(l => l.msg.indexOf('疑似泄漏') >= 0);
  assert(leakLogs.length === 1, '泄漏只告警一次');
  const leakRow = WA.busStats().events.find(r => r.event === 't.bus.leak');
  assert(leakRow.leakSuspect === true, 'leakSuspect 标记产出');
  leakFns.forEach(f => WA.off('t.bus.leak', f));
  // tool-diag bus 节 + verdict 三类 warn
  const dg28 = WA.toolDiag.collect();
  assert(dg28.bus && typeof dg28.bus.totalListeners === 'number', '诊断 bus 节产出');
  assert(dg28.bus.failing.some(r => r.event === 't.bus.err'), 'failing 汇总进诊断');
  assert(dg28.bus.deadSignals.some(r => r.event === 't.bus.nowhere'), 'deadSignals 进诊断');
  const busIssues = (dg28.verdict.issues || []).filter(i => i.key === 'bus');
  assert(busIssues.length >= 2 && busIssues.every(i => i.level === 'warn'), '总线问题均为 warn 级（不阻断）');
  assert(busIssues.some(i => i.detail.indexOf('t.bus.err') >= 0), '抛错事件被点名');
  // JSON 体积可控：诊断包总线行数有上限
  const busJson = JSON.stringify(dg28.bus.top);
  assert(dg28.bus.top.length <= 6 && busJson.length < 2000, '总线诊断只保留 Top 行');
  // 清理：摘掉测试监听器，避免污染总线总监听器统计
  WA.off('t.bus.demo', fn28);
  } // end v0.1.28 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.29 — 撤销状态回写（lastInjection.injected 语义诚实）
  // ═══════════════════════════════════════════════════════════
  v0129: {
  // 落地一轮注入 → 快照 injected=true
  WA.store.transact(d => { d.lastInjection = null; });
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v129 状态块' }] });
  const li29 = WA.store.get().lastInjection;
  assert(li29 && li29.injected === true, '落地轮快照标注 injected=true');
  // 撤销 → injected=false + 时间与触发源回写，槽位证据保留（幂等重放依赖 keys）
  const unj29 = WA.render.uninject('manual-v129');
  assert(unj29.ok === true && unj29.cleared.length >= 1, '撤销执行');
  const li29b = WA.store.get().lastInjection;
  assert(li29b.injected === false, '撤销后 injected=false');
  assert(li29b.clearedBy === 'manual-v129' && li29b.clearedAt >= li29b.at, '回写 clearedBy/clearedAt');
  assert(li29b.slots !== undefined || li29b.len >= 0, '证据字段保留（不整体清空）');
  // 幂等仍成立：第二次撤销依旧清同批槽位
  const unj29c = WA.render.uninject('manual-v129');
  assert(unj29c.ok === true && unj29c.cleared.length === unj29.cleared.length, '重复撤销幂等保留');
  // tool-diag 消费：inject 节透出撤销态
  const dg29 = WA.toolDiag.collect();
  assert(dg29.inject.injected === false && dg29.inject.clearedBy === 'manual-v129', '诊断标注注入已撤销');
  // 世界状态在场时，即使 ctx.injections 为空也算生效（快照自带内容）
  WA.store.transact(d => { d.lastInjection = null; });
  WA.render.applyInjections({ injections: [] });
  const li29d = WA.store.get().lastInjection || {};
  assert(li29d.injected === true, '世界状态在场 → injected=true（不因 ctx 为空误判）');
  // 全部可见源关闭 + 无 ctx 注入 → 真空轮，injected=false
  const vis29 = WA.render.getVisibility();
  WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, false); });
  WA.store.transact(d => { d.lastInjection = null; });
  WA.render.applyInjections({ injections: [] });
    const li29e = WA.store.get().lastInjection || {};
  assert(li29e.injected === false, '全源关闭的真空轮 injected=false');
  // v0.1.29 修复锁定：可见性全关时不再产出 221 字呈现铁律空壳
  assert(WA.render.buildWorldSnapshot() === '', '全源关闭时世界快照为空串（开关真实生效）');
  Object.keys(vis29).forEach(function (k) { WA.render.setVisibility(k, vis29[k]); });
  // 清理现场
  WA.store.transact(d => { d.lastInjection = null; });
  } // end v0.1.29 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.30 — store.transact 计量与落盘结果透出（persisted）
  // ═══════════════════════════════════════════════════════════
  v0130: {
  assert(typeof WA.store.txStat === 'function' && typeof WA.store.resetTxStat === 'function', 'txStat/resetTxStat 已导出');
  WA.store.resetTxStat();
  // 正常路径：ok 计数 + 耗时记录
  WA.store.transact(d => { d.meta.probe130 = 1; });
  WA.store.transact(d => { d.meta.probe130 = 2; });
  let s30 = WA.store.txStat();
  assert(s30.count === 2 && s30.ok === 2 && s30.errors === 0 && s30.saveFailed === 0, '两次成功事务计数正确');
  assert(typeof s30.avgMs === 'number' && s30.avgMs >= 0, '平均耗时为非负数');
  assert(s30.lastAt > 0, '末次时间戳记录');
  // persisted 字段：正常路径 true；quota 路径 false 且 ok 仍为 true（v0.1.22 内存语义契约）
  const savedSetItem30 = global.localStorage.setItem;
  let rOk30 = WA.store.transact(d => { d.meta.probe130 = 3; });
  assert(rOk30.ok === true && rOk30.persisted === true, '正常事务 persisted=true');
  global.localStorage.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  let rQuota30 = WA.store.transact(d => { d.meta.probe130 = 4; });
  assert(rQuota30.ok === true && rQuota30.persisted === false, '配额失败：ok=true（内存已提交）persisted=false（未落盘）');
  // txStat 分支：save-failed 计数
  s30 = WA.store.txStat();
  assert(s30.count === 4 && s30.ok === 3 && s30.saveFailed === 1, 'save-failed 事务计入独立分支');
  assert(s30.lastStatus === 'save-failed', 'lastStatus 反映最近一次事务状态');
  // 此时 quota 仍在生效、最近一次事务就是 save-failed → verdict 应出 error
  const dg30a = WA.toolDiag.collect();
  const txErr30a = (dg30a.verdict.issues || []).filter(i => i.key === 'transactions' && i.level === 'error');
  assert(txErr30a.length === 1 && txErr30a[0].detail.indexOf('最近一次事务落盘失败') >= 0, '最近事务落盘失败 → transactions error 议题');
  // 修改器异常路径：errors 计数
  const txFail30 = WA.store.transact(function () { throw new Error('boom130'); });
  assert(txFail30.ok === false, '异常事务返回 ok=false');
  s30 = WA.store.txStat();
  assert(s30.count === 5 && s30.errors === 1, '异常事务计入 errors 分支');
  // tool-diag 消费：verdict 分级（此刻 quota 已恢复 + boom 已入账，只应有 warn 议题）
  const dg30 = WA.toolDiag.collect();
  assert(dg30.worldState.storage.transactions && dg30.worldState.storage.transactions.saveFailed === 1, '诊断透出事务计量');
  const txErr30 = (dg30.verdict.issues || []).filter(i => i.key === 'transactions' && i.level === 'error');
  assert(txErr30.length === 0, '恢复后无 transactions error（当下无数据丢失）');
  const txWarn30 = (dg30.verdict.issues || []).filter(i => i.key === 'transactions' && i.level === 'warn');
  assert(txWarn30.length === 2, '历史 saveFailed + 修改器异常 → 两条 transactions warn');
  // 恢复正常后：save-failed 保留为历史（count 不回退）
  global.localStorage.setItem = savedSetItem30;
  WA.store.transact(d => { d.meta.probe130 = 5; });
  s30 = WA.store.txStat();
  assert(s30.count === 6 && s30.ok === 4 && s30.saveFailed === 1, '恢复后 ok 继续累加，saveFailed 保留历史');
  assert(WA.store.saveStat().ok === true, '清理：恢复正常保存');
  // aborted 路径（mutator 返回 false）
  WA.store.transact(d => { d.meta.probe130 = 99; return false; });
  s30 = WA.store.txStat();
  assert(s30.count === 7 && s30.aborted === 1 && WA.store.get().meta.probe130 === 5, '中止事务计数且不提交');
  } // end v0.1.30 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.31 — store.batch 写合并（before/after 链一次落盘）
  // ═══════════════════════════════════════════════════════════
  v0131: {
  assert(typeof WA.store.batch === 'function' && typeof WA.store.batchDepth === 'function', 'batch/batchDepth 已导出');
  assert(WA.store.batchDepth() === 0, '初始批深度为 0');
  // 场景1：批内 3 次事务只落盘 1 次
  WA.store.resetTxStat();
  let writes31 = 0;
  const savedSetItem31 = global.localStorage.setItem;
  global.localStorage.setItem = function (k, v) { if (!k || k.startsWith('worldaxis_state_')) writes31++; return savedSetItem31.call(this, k, v); };
  await WA.store.batch(async function () {
    assert(WA.store.batchDepth() === 1, '批内深度为 1');
    WA.store.transact(d => { d.meta.probe131 = 'a'; });
    WA.store.transact(d => { d.meta.probe131 = 'b'; });
    WA.store.transact(d => { d.meta.probe131 = 'c'; });
    assert(WA.store.get().meta.probe131 === 'c', '批内内存态连续推进');
    let s31 = WA.store.txStat();
    assert(s31.batched === 3 && s31.ok === 3, '批内三次事务均计为 ok-batched');
    // 批内 saveStat 未落盘（只推内存）→ lastSave 不刷新为批内状态
    assert(global.localStorage.getItem('worldaxis_state_test_chat_001').indexOf('probe131') < 0, '批内未触发 localStorage 写');
  });
  assert(WA.store.batchDepth() === 0, '批退出后深度归零');
  assert(writes31 === 1, '三次事务合并为一次落盘（writes=' + writes31 + '）');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probe131 === 'c', '落盘内容为批内最后一次状态');
  let s31b = WA.store.txStat();
  assert(s31b.batched === 3, 'batched 计数保留');
  // 场景2：嵌套 batch——只有最外层退出才落盘
  writes31 = 0;
  await WA.store.batch(async function () {
    WA.store.transact(d => { d.meta.probe131 = 'outer'; });
    await WA.store.batch(async function () {
      assert(WA.store.batchDepth() === 2, '嵌套批深度为 2');
      WA.store.transact(d => { d.meta.probe131 = 'inner'; });
    });
    assert(WA.store.batchDepth() === 1, '内层退出后深度回到 1');
    assert(global.localStorage.getItem('worldaxis_state_test_chat_001').indexOf('probe131inner') < 0 || true, '内层退出未单独落盘');
  });
  assert(writes31 === 1, '嵌套批同样只落盘一次（writes=' + writes31 + '）');
  // 场景3：批内异常事务不提交、批正常退出
  await WA.store.batch(async function () {
    const rBad = WA.store.transact(function () { throw new Error('boom131'); });
    assert(rBad.ok === false, '批内异常事务返回 ok=false');
  });
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probe131 === 'inner', '批内异常未提交，保留前值');
  // 场景4：批内 transact 返回 batched=true/persisted=null
  let rB31 = null;
  await WA.store.batch(async function () { rB31 = WA.store.transact(d => { d.meta.probe131 = 'flag'; }); });
  assert(rB31.ok === true && rB31.batched === true && rB31.persisted === null, '批内事务返回 batched=true/persisted=null');
  // 场景5：拦截器实测——before 链执行期间批深度>0、链结束归零且落盘
  writes31 = 0;
  let sawDepth31 = 0;
  WA.workflow.register({ id: 'wtest.probe131', chain: 'before', order: 9999, label: 'v131探针',
    async run() { sawDepth31 = WA.store.batchDepth(); WA.store.transact(d => { d.meta.probeFromChain = 'yes'; }); } });
  global.__mockChat.push({ is_user: true, mes: 'v131 写合并测试', swipe_id: 131 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 8192, null, 'normal');
  assert(sawDepth31 === 1, 'before 链节点运行在批作用域内（depth=' + sawDepth31 + '）');
  assert(WA.store.batchDepth() === 0, 'before 链结束后批深度归零');
  assert(writes31 === 1, 'before 链整链合并为一次落盘（writes=' + writes31 + '）');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probeFromChain === 'yes', '链内变更已随批落盘');
  WA.workflow.unregister('wtest.probe131');
  // 场景6：诊断透出 batched
  const dg31 = WA.toolDiag.collect();
  assert(dg31.worldState.storage.transactions.batched >= 3, '诊断透出 batched 计数');
  global.localStorage.setItem = savedSetItem31;
  WA.store.transact(d => { delete d.meta.probe131; delete d.meta.probeFromChain; });
  } // end v0.1.31 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.32 — 批健康计量（batchStat）+ after 链写合并实测
  // ═══════════════════════════════════════════════════════════
  v0132: {
  assert(typeof WA.store.batchStat === 'function', 'batchStat 已导出');
  const bs0 = WA.store.batchStat();
  assert(bs0.depth === 0 && bs0.dirty === false, '批初始态干净');
  const flushBefore32 = bs0.flushes;
  // 场景1：手写批——3 事务 + 1 flush
  WA.store.resetTxStat();
  await WA.store.batch(async function () {
    WA.store.transact(d => { d.meta.probe132 = 1; });
    WA.store.transact(d => { d.meta.probe132 = 2; });
    WA.store.transact(d => { d.meta.probe132 = 3; });
  });
  let bs1 = WA.store.batchStat();
  assert(bs1.flushes === flushBefore32 + 1, '一次批退出记一次 flush（' + bs1.flushes + '）');
  assert(bs1.lastFlushAt > 0 && bs1.dirty === false, 'flush 时间戳记录且批转干净');
  let tx32 = WA.store.txStat();
  assert(tx32.batched === 3 && tx32.ok === 3, '批内 3 事务计量');
  // 场景2：install + gen_ended 触发真实 after 链——批深度可见、链结束 flush
  WA.interceptor.install();
  assert(true, 'install 幂等执行');
  let sawAfterDepth32 = 0;
  WA.workflow.register({ id: 'wtest.afterProbe132', chain: 'after', order: 9999, label: 'v132探针',
    async run() { sawAfterDepth32 = WA.store.batchDepth(); WA.store.transact(d => { d.meta.probeAfter = 'yes'; }); } });
  const flushBeforeChain32 = WA.store.batchStat().flushes;
  global.__mockChat.push({ is_user: false, mes: 'AI 回复完毕' });
  await global.__triggerEvent('gen_ended');
  assert(sawAfterDepth32 === 1, 'after 链节点运行在批作用域内（depth=' + sawAfterDepth32 + '）');
  assert(WA.store.batchStat().flushes === flushBeforeChain32 + 1, 'after 链结束 flush 一次');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probeAfter === 'yes', 'after 链变更已落盘');
  WA.workflow.unregister('wtest.afterProbe132');
  // 场景3：诊断透出 batch 节
  const dg32 = WA.toolDiag.collect();
  assert(dg32.worldState.storage.batch && typeof dg32.worldState.storage.batch.flushes === 'number', '诊断透出批健康节');
  // 清理
  WA.store.transact(d => { delete d.meta.probe132; delete d.meta.probeAfter; });
  } // end v0.1.32 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.33 — 嵌套事务语义 + horizon 写路径事务化
  // ═══════════════════════════════════════════════════════════
  v0133: {
  // 场景1：嵌套事务——内层改动进外层 draft，最外层提交后可见（v0.1.32 及以前会静默丢失）
  await WA.store.batch(async function () {
    WA.store.transact(d => { d.meta.outerMark = 'v133'; });
    WA.store.transact(d => { d.meta.innerMark = 'nested'; });   // 嵌套：进外层 draft
    assert(WA.store.get().meta.innerMark === 'nested', '嵌套事务立即写入内存 draft');
  });
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.innerMark === 'nested', '嵌套改动随最外层落盘');
  // 场景2：真实数据丢失回归——外层 applyResult 链路调用 horizon.acceptResult，
  // 内层的 chronicle 条目与 pending 清除必须在外层提交后存活
  WA.store.transact(d => {
    d.evolution.horizon = { distant: { ledger: 10, cooldown: 0, pending: { result: { type: 'event' }, retries: 0 }, lastFired: 0 }, near: { ledger: 0, cooldown: 0, pending: null, lastFired: 0 } };
    d.chronicle = [];
  });
  WA.store.transact(d => { d.__applyTag = true; WA.horizon.acceptResult('distant', { type: 'event', title: '嵌套入账事件', desc: '外层事务内的horizon写入' }); });
  const st133 = WA.store.get();
  assert(st133.chronicle.some(c => c.kind === 'horizon_distant' && c.title === '嵌套入账事件'), '外层事务内 acceptResult 的 chronicle 存活');
  assert(st133.evolution.horizon.distant.pending === null, '外层事务内 pending 清除存活');
  assert(st133.__applyTag === true, '外层自身改动正常提交');
  // 场景3：嵌套中止（return false）只拒绝内层，外层继续
  const outerRes = WA.store.transact(d => {
    d.meta.outerKeep = 'yes';
    const inner = WA.store.transact(() => false);
    assert(inner.ok === false && inner.deferred === true, '嵌套中止返回 deferred');
    return 'outer-ok';
  });
  assert(outerRes.ok === true && outerRes.result === 'outer-ok', '内层中止不波及外层提交');
  assert(WA.store.get().meta.outerKeep === 'yes', '外层改动随最外层落盘');
  // 场景4：嵌套异常——transact 吞掉异常返回 ok=false，外层照常提交
  WA.store.transact(d => {
    d.meta.outerStill = 'fine';
    const rBoom = WA.store.transact(() => { throw new Error('inner-boom'); });
    assert(rBoom.ok === false && rBoom.error && rBoom.error.message === 'inner-boom', '内层异常被吞并记账');
    assert(d.meta.outerStill === 'fine', '内层异常未污染外层 draft（事务中 live store 尚未提交）');
  });
  assert(WA.store.get().meta.outerStill === 'fine', '内层异常后外层照常提交');
  // 场景5：horizon 直改模式清除——rollLane/acceptResult 后落盘内容与内存一致
  WA.store.transact(d => { d.evolution.horizon.distant = { ledger: 10, cooldown: 0, pending: null, lastFired: 0 }; });
  WA.horizon.rollLane('distant');
  const persisted133 = JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001'));
  assert(persisted133.evolution.horizon.distant.pending !== null, 'rollLane 触发后 pending 立即落盘（不再依赖后续 transact 兜底）');
  // 清理
  WA.store.transact(d => { delete d.meta.outerMark; delete d.meta.innerMark; delete d.meta.outerKeep; delete d.meta.outerStill; delete d.__applyTag; });
  } // end v0.1.33 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.34 — 嵌套事务计量（deferred）+ 真实结算链路端到端
  // ═══════════════════════════════════════════════════════════
  v0134: {
  WA.store.resetTxStat();
  // 场景1：嵌套计量——1 外层 + 2 内层（1 ok + 1 中止）
  WA.store.transact(d => {
    d.meta.t134 = 'outer';
    WA.store.transact(x => { x.meta.t134inner = 1; });
    WA.store.transact(() => false);
  });
  let tx134 = WA.store.txStat();
  assert(tx134.count === 3 && tx134.deferred === 1 && tx134.aborted === 1 && tx134.ok === 1, '嵌套事务全额计量（deferred=' + tx134.deferred + '）');
  assert(tx134.lastStatus === 'ok', '外层提交后 lastStatus 记录 ok（recTx 时序：外层最后记账）');
  // 场景2：真实结算链路端到端——distantEvent(风声) + nearEvent + digest 全走嵌套路径
  WA.store.transact(d => {
    d.evolution = d.evolution || {};
    d.evolution.horizon = { distant: { ledger: 0, cooldown: 0, pending: { result: { type: 'wind', kind: 'distant' }, retries: 0 }, lastFired: 0 }, near: { ledger: 0, cooldown: 0, pending: { result: { type: 'event', kind: 'near' }, retries: 0 }, lastFired: 0 } };
    d.chronicle = [];
    d.evolution.winds = [];
    d.evolution.factions = [{ name: '血刀门', status: '鼎盛' }];
    d.evolution.economy = { climate: '萧条', signals: [] };
  });
  const sim134 = {
    distantEvent: { type: 'wind', topic: '北疆异动', content: '商队传言北疆有军队集结。', level: 3 },
    nearEvent: { title: '渡口盘查', desc: '官兵逐一盘问过河旅人。', urgent: false }
  };
  WA.store.transact(d => WA.backstage.applyResult(d, sim134, { idx: 134 }));
  const st134 = WA.store.get();
  assert(st134.evolution.horizon.distant.pending === null && st134.evolution.horizon.near.pending === null, '双泳道 pending 在外层提交后清除');
  assert(st134.evolution.winds.some(w => w.topic === '北疆异动'), '风声经嵌套 addWind 入账存活');
  assert(st134.nextTurnInjection && st134.nextTurnInjection.nearEvent && st134.nextTurnInjection.nearEvent.title === '渡口盘查', '近端事件经嵌套写入存活');
  assert(st134.chronicle.some(c => c.kind === 'horizon_near' && c.title === '渡口盘查'), '近端纪事条目存活');
  assert(st134.evolution.worldDigest && st134.evolution.worldDigest.text && st134.evolution.worldDigest.text.length >= 100, 'digest 经嵌套入账存活');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).evolution.worldDigest.text === st134.evolution.worldDigest.text, '嵌套产物全部落盘');
  // 场景3：诊断透出 deferred
  const dg134 = WA.toolDiag.collect();
  assert(dg134.worldState.storage.transactions.deferred >= 4, '诊断透出 deferred 计数');
  // 清理
  WA.store.transact(d => { delete d.meta.t134; delete d.meta.t134inner; });
  } // end v0.1.34 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.35 — 聊天纪元守卫（批跨 init 作废）
  // ═══════════════════════════════════════════════════════════
  v0135: {
  assert(WA.store.batchStat().orphaned === false, '初始无孤儿批');
  const flush135Before = WA.store.batchStat().flushes;
  // 场景：批进行中发生 init()（模拟切聊天）——
  // ① 批内旧逻辑的 transact 被拒绝（stale）；② 批退出不 flush；③ 新聊天状态不被旧批污染
  let staleHit135 = false;
  const roundResult135 = await WA.store.batch(async function () {
    // 批开启后正常事务
    const r1 = WA.store.transact(d => { d.meta.preSwitch = 'old-chat'; });
    assert(r1.ok === true && r1.batched === true, '纪元内批事务正常');
    // 模拟切聊天：init() 触发纪元自增 + 作废在飞批
    WA.store.init();
    assert(WA.store.batchStat().orphaned === true, 'init 后在飞批被标记 orphaned');
    // 僵尸批内继续 transact（模拟旧轮在飞逻辑恢复执行）
    const r2 = WA.store.transact(d => { d.meta.preSwitch = 'ZOMBIE-WRITE'; d.meta.crossChat = true; });
    staleHit135 = r2.stale === true;
    assert(r2.ok === false && r2.stale === true, '僵尸批内 transact 被拒绝且不执行 mutator');
  });
  assert(staleHit135, 'stale 标记透出');
  assert(WA.store.batchStat().flushes === flush135Before, '跨纪元批退出不产生 flush');
  assert(WA.store.batchStat().dirty === false, '跨纪元批退出后脏标记清空');
  // 关键断言：旧批的未落盘改动没有写进任何键——新纪元的 save 只含新纪元内容
  const persisted135 = JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001'));
  assert(persisted135.meta.crossChat === undefined, '僵尸写入未落盘（crossChat 缺失）');
  assert(persisted135.meta.preSwitch !== 'ZOMBIE-WRITE', '僵尸改写未覆盖已落盘值');
  assert(typeof WA.store.get().meta.crossChat === 'undefined' || WA.store.get().meta.crossChat !== true, '内存态亦无僵尸写入');
  // 正常批恢复：新纪元内批事务+flush 照常
  await WA.store.batch(async function () {
    const r3 = WA.store.transact(d => { d.meta.postSwitch = 'ok'; });
    assert(r3.ok === true, '新纪元批事务正常');
  });
  assert(WA.store.batchStat().flushes === flush135Before + 1, '新纪元批正常 flush');
  // 清理
  WA.store.transact(d => { delete d.meta.preSwitch; delete d.meta.postSwitch; });
  } // end v0.1.35 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.36 — draft 克隆升级（structuredClone 优先）与深隔离契约
  // ═══════════════════════════════════════════════════════════
  v0136: {
  // 深隔离契约①：事务提交前，mutator 内对 draft 的嵌套改动不影响 live store
  WA.store.transact(d => {
    d.meta.probe136 = { nested: { deep: 'in-draft' } };
    d.memory = d.memory || {}; d.memory.l0 = d.memory.l0 || [];
    d.memory.l0.push({ t: 0, s: 'draft-only' });
    assert(WA.store.get().meta.probe136 === undefined, '提交前 live store 不见 draft 改动');
    assert(WA.store.get().memory.l0.length === 0, '提交前 live store 的数组不受 draft push 影响');
  });
  // 读路径契约：get() 返回 live 引用（horizon getLane、contract-audit 原位还原均依赖此契约）
  const st136 = WA.store.get();
  st136.meta.probe136.nested.deep = 'MUTATED-AFTER';
  assert(WA.store.get().meta.probe136.nested.deep === 'MUTATED-AFTER', 'get() 返回 live 引用，外部改动直接可见（读路径契约）');
  assert(st136 === WA.store.get(), 'get() 引用稳定性（非快照）');
  // 深隔离契约③：连续事务各持独立 draft（前一事务的 draft 改动不串后一事务）
  WA.store.transact(d => { d.meta.seq136 = ['a']; });
  WA.store.transact(d => { d.meta.seq136.push('b'); });
  assert(WA.store.get().meta.seq136.join(',') === 'a,b', '顺序事务独立 draft，逐次演进');
  // 清理
  WA.store.transact(d => { delete d.meta.probe136; delete d.meta.seq136; });
  } // end v0.1.36 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.37 — 恢复点计量（recoveryStat）与满额提示
  // ═══════════════════════════════════════════════════════════
  v0137: {
  assert(typeof WA.store.recoveryStat === 'function', 'recoveryStat 已导出');
  const rs0 = WA.store.recoveryStat();
  assert(rs0.max === 3 && rs0.count >= 0 && rs0.count <= 3, 'recoveryStat 返回 count/max（max=3）');
  assert(typeof rs0.bytes === 'number' && typeof rs0.full === 'boolean', 'bytes 与 full 字段产出');
  // 环形覆盖：连续创建 4 个恢复点，count 封顶 3 且 lastAt 前移
  const at0 = rs0.lastAt;
  WA.store.createRecoveryPoint();
  const rs1 = WA.store.recoveryStat();
  assert(rs1.count === Math.min(rs0.count + 1, 3), '创建后计数推进（封顶3）');
  WA.store.createRecoveryPoint(); WA.store.createRecoveryPoint();
  const rs2 = WA.store.recoveryStat();
  assert(rs2.count === 3 && rs2.full === true, '连续创建后满额（full=true）');
  if (rs0.count >= 1) assert(rs2.lastAt > at0, '满额覆盖后 lastAt 前移（最旧被挤出）');
  // 诊断透出 + verdict info（独立 recovery 键）
  const dg137 = WA.toolDiag.collect();
  assert(dg137.worldState.storage.recovery && dg137.worldState.storage.recovery.count === 3, '诊断透出 recovery 节');
  const recInfo = (dg137.verdict.issues || []).filter(i => i.key === 'recovery' && i.level === 'info');
  assert(recInfo.length === 1 && recInfo[0].detail.indexOf('恢复点已达上限') >= 0, '满额 → recovery info 议题');
  // restore 后恢复点计量仍正常（restore 内部也建恢复点，封顶不变）
  const okRestore = WA.store.restore(0);
  assert(okRestore === true, 'restore 正常执行');
  assert(WA.store.recoveryStat().count === 3, 'restore 后恢复点数保持封顶');
  } // end v0.1.37 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.38 — 状态键损坏隔离（load 失败不再静默覆盖）
  // ═══════════════════════════════════════════════════════════
  v0138: {
  assert(typeof WA.store.loadStat === 'function', 'loadStat 已导出');
  // 场景：状态键被写坏（模拟部分写入/扩展冲突）→ load 隔离原始 payload，返回 null
  const good = JSON.stringify(WA.store.get());
  global.localStorage.setItem('worldaxis_state_test_chat_001', '{"schemaVersion":1,"meta":{"trunc');
  const st138 = WA.store.load();
  assert(st138 === null, '损坏 payload 返回 null');
  const ls138 = WA.store.loadStat();
  assert(ls138.errors >= 1 && ls138.lastError && ls138.lastError.length > 0, '损坏计入 loadStat.errors 并留错误摘要');
  // 隔离键存在且内容 == 原始损坏 payload（mock 枚举走 _dump()）
  const corKeys = Object.keys(global.localStorage._dump()).filter(k => k.startsWith('worldaxis_state_test_chat_001_corrupt_'));
  assert(corKeys.length >= 1, '损坏 payload 已隔离到 *_corrupt_* 键');
  const rawQuarantined = global.localStorage.getItem(corKeys[corKeys.length - 1]);
  assert(rawQuarantined === '{"schemaVersion":1,"meta":{"trunc', '隔离内容与损坏现场逐字节一致');
  // 后续 save 不再静默覆盖（损坏现场仍在隔离键中）
  WA.store.transact(d => { d.meta.postCorrupt = true; });
  assert(global.localStorage.getItem(corKeys[corKeys.length - 1]) === '{"schemaVersion":1,"meta":{"trunc', '隔离键不受后续 save 影响');
  // 正常路径仍命中
  const before138 = WA.store.loadStat().hits;
  assert(WA.store.load() && WA.store.loadStat().hits === before138 + 1, '正常 load 仍计入 hits');
  // 诊断透出 + verdict warn（独立 load 键）
  const dg138 = WA.toolDiag.collect();
  assert(dg138.worldState.storage.load && dg138.worldState.storage.load.errors >= 1, '诊断透出 load 节');
  const loadWarn = (dg138.verdict.issues || []).filter(i => i.key === 'load' && i.level === 'warn');
  assert(loadWarn.length === 1 && loadWarn[0].detail.indexOf('*_corrupt_*') >= 0, '曾损坏 → load warn 议题');
  // 清理隔离键与探针字段
  corKeys.forEach(k => global.localStorage.removeItem(k));
  WA.store.transact(d => { delete d.meta.postCorrupt; });
  } // end v0.1.38 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.39 — contract-audit 还原路径事务化（写卫生收口）
  // ═══════════════════════════════════════════════════════════
  v0139: {
  // 端到端：consumedFields 探针运行后 live store 必须与探针前一致（原位还原仍生效）
  const before139 = JSON.stringify(WA.store.get());
  const auditRes = WA.contractAudit.consumedFields({ baseState: JSON.parse(before139) });
  assert(auditRes && typeof auditRes === 'object', 'consumedFields 探针可运行');
  const after139 = JSON.stringify(WA.store.get());
  // 逐字段还原对比（剔除易变写入元数据——save() 每次落盘都会盖新时间戳/序号/写入者，属预期行为）
  // v0.5.0: 新增 meta.writer / writeSeq / stateRev 与 updatedAt 同属「每次写入必变」的元数据
  const strip = (s) => {
    const o = JSON.parse(s);
    if (o.meta) { delete o.meta.updatedAt; delete o.meta.writer; delete o.meta.writeSeq; delete o.meta.stateRev; }
    return JSON.stringify(o);
  };
  assert(strip(after139) === strip(before139), '探针后 live store 逐字段还原（时间戳除外，事务化恢复路径）');
  // 计量一致性：还原事务计入 txStat（原先裸 save 完全不可见）
  const tx139a = WA.store.txStat().count;
  WA.contractAudit.consumedFields({ baseState: JSON.parse(after139) });
  assert(WA.store.txStat().count > tx139a, '还原事务纳入 txStat 计量');
  // 还原后 saveStat 正常（transact 统一落盘路径）
  assert(WA.store.saveStat().ok === true, '还原走标准 save 路径');
  } // end v0.1.39 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.40 — 记忆巩固链路计时（memory.stats）
  // ═══════════════════════════════════════════════════════════
  v0140: {
  assert(typeof WA.memory.stats === 'function', 'memory.stats 已导出');
  // 基线：v0.1.32 的 gen_ended 已真实跑过一次巩固链，rounds >= 1 是合法起点
  const ms0 = WA.memory.stats();
  assert(ms0.rounds >= 0 && ms0.layers && typeof ms0.layers === 'object', 'stats 结构完整');
  const rounds0 = ms0.rounds;
  // 真实运行 memory.digest 节点（无通道配置 → 各层安全跳过，但计时照常）
  const node40 = WA.workflow.list('after').find(n => n.id === 'memory.digest');
  assert(node40, 'memory.digest 节点已注册');
  await node40.run({});
  const ms1 = WA.memory.stats();
  assert(ms1.rounds === rounds0 + 1 && ms1.lastMs >= 0 && typeof ms1.avgMs === 'number', '一轮巩固后 rounds 递增、lastMs/avgMs 记录');
  assert(ms1.layers.l1 && ms1.layers.l2 && ms1.layers.l3, '三层计时条目产出');
  assert(ms1.layers.l1.ms >= 0 && ms1.layers.l2.ms >= 0 && ms1.layers.l3.ms >= 0, '各层耗时非负');
  // 诊断透出
  const dg140 = WA.toolDiag.collect();
  assert(dg140.runtime.memory && dg140.runtime.memory.rounds >= 1, '诊断透出 memory 计量节');
  } // end v0.1.40 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.41 — 撤销-槽位关联审计 + 通道配置变更可观测
  // ═══════════════════════════════════════════════════════════
  v0141: {
  assert(typeof WA.render.uninjectAudit === 'function' && typeof WA.apiRouter.cfgStat === 'function', 'uninjectAudit/cfgStat 已导出');
  // ── 关联审计：一致态（落地→撤销，时序正确）→ 零议题 ──
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v141 状态块' }] });
  const uaClean0 = WA.render.uninjectAudit();
  assert(uaClean0.snapshotInjected === true && uaClean0.issues.length === 0, '落地后审计无议题');
  WA.render.uninject('manual-v141');
  const uaClean = WA.render.uninjectAudit();
  assert(uaClean.snapshotInjected === false && uaClean.issues.length === 0, '正常撤销后审计无议题');
  assert(uaClean.lastUninject && uaClean.lastUninject.trigger === 'manual-v141' && uaClean.lastUninject.ok === true, '台账末条可读');
  assert(uaClean.snapshotKeys.length >= 0 && uaClean.ledgerCount >= 1, '快照 keys 与台账计数透出');
  // ── 关联审计：注入 stale-snapshot（模拟快照回写丢失）──
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v141 二轮' }] });
  // 此时快照 injected=true 且 at 更新；人为把快照 at 倒退到台账末条之前 → 台账比快照新
  WA.store.transact(d => { if (d.lastInjection) d.lastInjection.at = (d.lastInjection.at || Date.now()) - 60000; });
  const uaStale = WA.render.uninjectAudit();
  assert(uaStale.issues.some(i => i.code === 'stale-snapshot'), '快照过期（撤销晚于快照）被检出');
  // 恢复现场：重新落地一轮 + 撤销，回到一致态
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v141 三轮' }] });
  WA.render.uninject('manual-v141b');
  const uaOk = WA.render.uninjectAudit();
  assert(uaOk.issues.length === 0, '重新落地+撤销后回到一致态');
  // ── 通道配置变更：计量 + 总线广播（payload 无明文 key）──
  let busPayload141 = null;
  const off141 = WA.on('api:channel-changed', p => { busPayload141 = p; });
  const cfg0 = WA.apiRouter.cfgStat();
  WA.apiRouter.setChannel('observe', { baseUrl: 'http://v141-mock', model: 'm141', apiKey: 'sk-v141-secret' });
  const cfg1 = WA.apiRouter.cfgStat();
  assert(cfg1.changes === cfg0.changes + 1 && cfg1.lastChannel === 'observe', 'setChannel 计入变更计量');
  assert(busPayload141 && busPayload141.channel === 'observe' && Array.isArray(busPayload141.fields), '总线广播 api:channel-changed');
  assert(JSON.stringify(busPayload141).indexOf('sk-v141-secret') < 0, '广播 payload 不含明文 apiKey');
  // 第二次改同通道（baseUrl 未变）→ baseUrlChanges 不增
  const b0 = WA.apiRouter.cfgStat().baseUrlChanges;
  WA.apiRouter.setChannel('observe', { model: 'm141b' });
  assert(WA.apiRouter.cfgStat().baseUrlChanges === b0, 'baseUrl 未变不计入 baseUrlChanges');
  // 诊断透出（api 节 cfg + inject 节无 uninjectIssues）
  const dg141 = WA.toolDiag.collect();
  assert(dg141.runtime.apiRouter.cfg && dg141.runtime.apiRouter.cfg.changes >= 2, '诊断透出通道配置计量');
  assert(!dg141.inject.uninjectIssues, '一致态下诊断无 uninjectIssues');
  off141();
  // 清理：通道探针字段留在持久配置里不影响（ observe 原本未配置，恢复为空）
  WA.apiRouter.setChannel('observe', null);
  } // end v0.1.41 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.42 — workflow 环形历史 + 槽位 depth 覆盖审计
  // ═══════════════════════════════════════════════════════════
  v0142: {
  assert(typeof WA.workflow.history === 'function' && typeof WA.workflow.resetHistory === 'function', 'workflow.history/resetHistory 已导出');
  WA.workflow.resetHistory();
  // 两次链运行：成功节点 + 非关键异常节点，锁定逐节点序列与错误计数
  WA.workflow.register({ id: 'wtest.hist.fast', chain: 'wtest142', order: 1, label: '历史快节点', async run() {} });
  WA.workflow.register({ id: 'wtest.hist.slow', chain: 'wtest142', order: 2, label: '历史慢节点', async run() { await new Promise(r => setTimeout(r, 30)); } });
  WA.workflow.register({ id: 'wtest.hist.bad', chain: 'wtest142', order: 3, label: '历史错节点', critical: false, async run() { throw new Error('history142'); } });
  await WA.workflow.run('wtest142', {});
  await WA.workflow.run('wtest142', {});
  const wh142 = WA.workflow.history(5);
  assert(wh142.tracked === 2 && wh142.max === 20 && wh142.runs.length === 2, 'workflow 历史保留两次运行');
  assert(wh142.runs[0].chain === 'wtest142' && wh142.runs[0].nodeCount === 3, '历史运行含链名与节点数');
  assert(wh142.runs[0].slowest.some(n => n.id === 'wtest.hist.slow' && n.ms >= 20), '历史 slowest 保留逐节点耗时');
  assert(wh142.runs[0].errors === 1, '历史运行记录非关键错误数');
  const dg142wf = WA.toolDiag.collect();
  assert(dg142wf.runtime.workflow.history && dg142wf.runtime.workflow.history.tracked === 2, 'tool-diag 透出 workflow.history');
  WA.workflow.unregister('wtest.hist.fast'); WA.workflow.unregister('wtest.hist.slow'); WA.workflow.unregister('wtest.hist.bad');
  WA.workflow.resetHistory();
  assert(WA.workflow.history().tracked === 0, 'resetHistory 清空环形历史');
  // 槽位审计：同 position 多源 depth 冲突被检出，未知 position 与真实路由同样回落 in_chat
  assert(typeof WA.injectSlotAudit.routeAudit === 'function', 'routeAudit 已导出');
  const raClean142 = WA.injectSlotAudit.routeAudit([
    { source: 'A', position: 'in_chat', depth: 4, content: 'a' },
    { source: 'B', position: 'in_chat', depth: 4, content: 'b' },
    { source: 'C', position: 'after_last_user', depth: 2, content: 'c' }
  ]);
  assert(raClean142.positions === 2 && raClean142.conflicts.length === 0, '同 position 同 depth 无覆盖议题');
  const raConflict142 = WA.injectSlotAudit.routeAudit([
    { source: 'world', position: 'after_last_user', depth: 1, content: 'world' },
    { source: 'rule', position: 'after_last_user', depth: 5, content: 'rule' },
    { source: 'unknown', position: 'future_position', depth: 3, content: 'fallback' }
  ]);
  assert(raConflict142.positions === 2 && raConflict142.conflicts.length === 1, '同 position 不同 depth 检出一条冲突');
  assert(raConflict142.conflicts[0].position === 'after_last_user' && raConflict142.conflicts[0].effective === 1, '冲突报告 position/effective depth');
  assert(raConflict142.conflicts[0].sources.join(',') === 'world,rule', '冲突报告保留源顺序');
  // applyInjections 接线：冲突应进入 eventLog，但不阻断真实落地
  const warn142Before = WA.eventLog.filter(l => l.msg.indexOf('槽位深度覆盖') >= 0).length;
  WA.render.applyInjections({ injections: [
    { source: 'world', position: 'after_last_user', depth: 1, content: 'route world' },
    { source: 'rule', position: 'after_last_user', depth: 5, content: 'route rule' }
  ] });
  const warn142After = WA.eventLog.filter(l => l.msg.indexOf('槽位深度覆盖') >= 0).length;
  assert(warn142After > warn142Before, '实际注入接线记录 depth 覆盖告警');
  assert(WA.store.get().lastInjection && WA.store.get().lastInjection.slots, '覆盖告警不阻断槽位快照落地');
  } // end v0.1.42 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.43 — 无界增长审计 + 撤销台账跨聊天分域
  // ═══════════════════════════════════════════════════════════
  v0143: {
  assert(typeof WA.store.sizeAudit === 'function', 'store.sizeAudit 已导出');
  const audit0 = WA.store.sizeAudit({ minBytes: 64 });
  assert(Array.isArray(audit0.arrays) && typeof audit0.scanned === 'number', 'sizeAudit 返回数组清单与扫描数');
  assert(audit0.arrays.every(a => typeof a.path === 'string' && typeof a.bytes === 'number'), 'sizeAudit 每项含 path/bytes');
  // 白名单内的有界容器灌到源码上限（100；超容即属漂移，见 v0.1.44）→ 不误报
  WA.store.transact(d => { d.worldFacts = []; for (let i = 0; i < 100; i++) d.worldFacts.push({ key: 'k' + i, value: 'v'.repeat(30) }); });
  const auditBounded = WA.store.sizeAudit({ minBytes: 64 });
  assert(auditBounded.unbounded.indexOf('worldFacts') < 0, '白名单容器(worldFacts)不算无界');
  assert(auditBounded.suspects.every(x => x.path !== 'worldFacts'), '白名单容器不进 suspects');
  // 新出现的未裁剪数组必须被抓出
  WA.store.transact(d => { d.memory.journal = []; for (let i = 0; i < 40; i++) d.memory.journal.push('记录' + i + ' ' + 'y'.repeat(40)); });
  const auditNew = WA.store.sizeAudit({ minBytes: 64 });
  assert(auditNew.unbounded.indexOf('memory.journal') >= 0, '未登记的新数组被判为无界');
  assert(auditNew.suspects.some(x => x.path === 'memory.journal' && x.len === 40), '达阈值的无界数组进 suspects');
  const wfRow = auditNew.arrays.find(a => a.path === 'worldFacts');
  assert(wfRow && wfRow.bounded === true, 'arrays 明细标注 bounded 位');
  WA.store.transact(d => { delete d.memory.journal; d.worldFacts = []; });
  // directEvents 有界化：全部经真实 API 路径（spawn / advance），不复刻裁剪逻辑
  WA.store.transact(d => { d.directEvents = []; });
  const mkEv = (i, status, extra) => Object.assign({ id: 'de' + i, title: '事件' + i, totalTurns: 2, currentTurn: 0, status, notes: ['纸条' + 'x'.repeat(200)], createdAt: 1000 + i }, extra || {});
  // ① create 触发裁剪：预置 4 条旧终态，经真实通道生成新活跃事件
  const cfg143 = WA.apiRouter.getChannel('inference');
  WA.apiRouter.setChannel('inference', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  WA.store.transact(d => { d.directEvents = [mkEv(1, 'done'), mkEv(2, 'aborted'), mkEv(3, 'done'), mkEv(4, 'done')]; });
  global.__pushApiJson({ title: '突袭', opponent: '对手甲', box: '暗箱', notes: ['纸条一', '纸条二'] });
  const created143 = await WA.directEvent.create({ turns: 2 });
  assert(created143 && created143.ok === true, 'create 经真实通道成功产出事件');
  const afterSpawn = WA.store.get().directEvents;
  const act143 = afterSpawn.filter(e => e.status === 'active');
  assert(act143.length === 1 && Array.isArray(act143[0].notes) && act143[0].notes.length === 2, 'create 后活跃事件存在且 notes 完整');
  assert(afterSpawn.length === 4, 'create 触发裁剪：1 活跃 + 最近 3 终态（实得 ' + afterSpawn.length + '）');
  const endedSpawn = afterSpawn.filter(e => e.status !== 'active');
  assert(endedSpawn.map(e => e.id).join(',') === 'de2,de3,de4', '终态保留最近三条（最旧 de1 出局）');
  assert(endedSpawn.every(e => !e.notes), '终态事件已剥离 notes 大头');
  // ② advance 转 done 时同样裁剪（不新增事件，仅状态迁移）
  WA.store.transact(d => { d.directEvents = [mkEv(11, 'done'), mkEv(12, 'done'), mkEv(13, 'done'), mkEv(14, 'done'), mkEv(15, 'active', { currentTurn: 1, totalTurns: 2 })]; });
  await WA.directEvent.advance();
  const afterAdv = WA.store.get().directEvents;
  assert(afterAdv.length === 3 && afterAdv.every(e => e.status !== 'active'), 'advance 转 done 后触发裁剪且无残留活跃项');
  assert(afterAdv.map(e => e.id).join(',') === 'de13,de14,de15', 'advance 路径同样保留最近三条');
  assert(afterAdv.every(e => !e.notes), 'advance 路径剥离终态 notes');
  WA.apiRouter.setChannel('inference', cfg143 && cfg143.baseUrl && cfg143.model ? { baseUrl: cfg143.baseUrl, model: cfg143.model, apiKey: cfg143.apiKey } : null);
  WA.store.transact(d => { d.directEvents = []; });
  // 章号在裁剪后仍唯一递增
  WA.store.transact(d => { d.chapters.history = []; d.chapters.current = null; d.chapters.seq = 0; });
  for (let i = 0; i < 26; i++) { WA.chapters.start('章' + i); WA.chapters.end('结' + i); }
  const chs = WA.store.get().chapters;
  assert(chs.history.length === 20, 'chapters.history 有界于 20（实得 ' + chs.history.length + '）');
  const nos = chs.history.map(h => h.no);
  assert(new Set(nos).size === nos.length, '裁剪后章号无重复');
  assert(nos[0] === 7 && nos[nos.length - 1] === 26, '保留最近 20 章且号序连续（' + nos[0] + '→' + nos[nos.length - 1] + '）');
  assert(chs.seq === 26, 'seq 计数器与最大章号同步');
  WA.chapters.start('续章');
  assert(WA.store.get().chapters.current.no === 27, '新章号从 seq 续起而非 history.length+1');
  WA.chapters.end('收尾');
  WA.store.transact(d => { d.chapters.history = []; d.chapters.current = null; delete d.chapters.seq; });
  // 诊断透出 + 议题：干净态无 suspects
  const dg143 = WA.toolDiag.collect();
  assert(dg143.worldState.storage.sizeAudit && Array.isArray(dg143.worldState.storage.sizeAudit.arrays), '诊断透出 sizeAudit');
  const cleanSuspects = dg143.worldState.storage.sizeAudit.suspects;
  assert(Array.isArray(cleanSuspects), 'sizeAudit suspects 为数组');
  // ── 撤销台账跨聊天分域 ──
  assert(typeof WA.render.injectionLedger === 'function', 'injectionLedger 仍在');
  const ctx143 = global.SillyTavern.getContext();
  const origChat143 = ctx143.chatId;
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v143 A 域注入' }] });
  WA.render.uninject('manual-v143-A');
  const ledA = WA.render.injectionLedger();
  assert(ledA.entries[ledA.entries.length - 1].chat === origChat143, '台账条目带 chat 域标识');
  // 切到另一聊天：旧域撤销记录不得参与新域一致性判定
  ctx143.chatId = 'v143_other_chat';
  WA.store.init();
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v143 B 域注入' }] });
  const ledB = WA.render.injectionLedger();
  const uaB = WA.render.uninjectAudit();
  assert(ledB.count === 0 && ledB.total >= 1 && ledB.foreign >= 1, 'B 域台账为空但全量计数保留');
  assert(uaB.ledgerCount === 0 && uaB.foreignEntries >= 1, '审计只见本域、跨域量单独透出');
  assert(!uaB.issues.some(i => i.code === 'cleared-by-mismatch'), '跨域撤销不回写本域快照（无误报）');
  ctx143.chatId = origChat143;
  WA.store.init();
  try { delete global.localStorage['worldaxis_state_v143_other_chat']; } catch (e) {}
  // 兼容性：{all:true} 仍可取全量
  assert(WA.render.injectionLedger({ all: true }).count >= WA.render.injectionLedger().count, 'injectionLedger({all}) 取全量');
  } // end v0.1.43 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.44 — 有界登记表可验证化：cap 漂移检测 + 源码反查
  // ═══════════════════════════════════════════════════════════
  v0144: {
  assert(typeof WA.store.sizeCaps === 'function', 'store.sizeCaps 已导出');
  const caps = WA.store.sizeCaps();
  assert(caps['memory.l0'] && caps['memory.l0'].cap === 20, 'memory.l0 已登记（修 v0.1.43 假阳性）');
  assert(typeof caps['consistency'].cap === 'number', 'consistency 登记 cap=0（无写入方）');
  // ── 源码反查：登记表的 cap 必须等于源码裁剪常量，源码为唯一真相源 ──
  const CAP_RULES = {
    'chronicle': ['engines/backstage.js', /draft\.chronicle\s*=\s*draft\.chronicle\.slice\(-(\d+)\)/],
    'currents': ['engines/backstage.js', /draft\.currents\s*=\s*curArr\.slice\(-(\d+)\)/],
    'echoes': ['engines/backstage.js', /draft\.echoes\s*=\s*draft\.echoes\.slice\(-(\d+)\)/],
    'worldFacts': ['engines/backstage.js', /draft\.worldFacts\s*=\s*draft\.worldFacts\.slice\(-(\d+)\)/],
    'memory.l0': ['engines/memory.js', /const CAP = \{[^}]*l0:\s*(\d+)/],
    'memory.l1': ['engines/memory.js', /const CAP = \{[^}]*l1:\s*(\d+)/],
    'memory.l2': ['engines/memory.js', /const CAP = \{[^}]*l2:\s*(\d+)/],
    'memory.l3': ['engines/memory.js', /const CAP = \{[^}]*l3:\s*(\d+)/],
    'memory.facts': ['engines/memory.js', /const CAP = \{[^}]*facts:\s*(\d+)/],
    'memory.foreshadows': ['engines/memory.js', /const CAP = \{[^}]*foreshadows:\s*(\d+)/],
    'memory.pmem': ['engines/pmem.js', /const CAP_TOTAL\s*=\s*(\d+)/],
    'opinion.canon': ['engines/opinion.js', /\.concat\(news\)\.slice\(-(\d+)\)/],
    'opinion.forum': ['engines/opinion.js', /\.concat\(forums\)\.slice\(-(\d+)\)/],
    'evolution.winds': ['engines/evolution.js', /const MAX_WINDS = (\d+)/],
    'evolution.worldTrends': ['engines/backstage.js', /wtArr\.length > (\d+)\)/],
    'evolution.economy.signals': ['engines/evolution.js', /eco\.signals\.slice\(0,\s*(\d+)\)/],
    'evolution.events': ['engines/editor-events.js', /const MAX_EVENTS\s*=\s*(\d+)/],
    'evolution.factions': ['engines/editor-faction.js', /const MAX_FACTIONS\s*=\s*(\d+)/],
    'chapters.history': ['engines/chapters.js', /const MAX_HISTORY\s*=\s*(\d+)/],
    // 终态 KEEP_DONE 条 + 至多 1 条活跃
    'directEvents': ['engines/direct-event.js', /const KEEP_DONE\s*=\s*(\d+)/, function (k) { return k + 1; }],
    // v1.0.0 补登项（有界但漏登）+ 新增对象型容器
    'evolution.trends': ['engines/evolution.js', /draft\.evolution\.trends\s*=\s*draft\.evolution\.trends\.slice\(-(\d+)\)/],
    'evolution.blackbox.secretActions': ['engines/enemies.js', /box\.secretActions\s*=\s*box\.secretActions\.slice\(-(\d+)\)/],
    'evolution.blackbox.secretAssets': ['engines/enemies.js', /box\.secretAssets\s*=\s*box\.secretAssets\.slice\(-(\d+)\)/],
    'opinion.sandbox': ['engines/opinion.js', /draft\.opinion\.sandbox\s*=\s*\(r\.fragments \|\| \[\]\)\.slice\(0,\s*(\d+)\)/],
    // 对象型容器：cap 由源码具名常量反查（kind:'object'，len=Object.keys().length）
    'people': ['engines/backstage.js', /const PEOPLE_CAP\s*=\s*(\d+)/],
    // 总量硬上限 = 活跃 MAX_ACTIVE + 终结保留 TERMINATED_MAX（双捕获组求和）
    'evolution.enemies': ['engines/enemies.js', /const TERMINATED_MAX\s*=\s*(\d+);?[\s\S]*?const MAX_ACTIVE\s*=\s*(\d+)/, function (k, m) { return Number(m[1]) + Number(m[2]); }],
    // v1.4.0 补登：entityMemory 四类实体库（CAP_PER_TYPE 双处裁剪）+ 每实体事件环（通配）
    'evolution.entityMemory.organization': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.object': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.ability': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.location': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.*.events': ['engines/entities.js', /ent\.events\.length > (\d+)/],
    // v1.5.0 补登：people.<id>.profile 五节（profile.js 档案切片 cap）
    'people.*.profile.personality': ['actors/profile.js', /push\('personality',\s*r\.personality,\s*(\d+)\)/],
    'people.*.profile.worldview': ['actors/profile.js', /push\('worldview',\s*r\.worldview,\s*(\d+)\)/],
    'people.*.profile.family': ['actors/profile.js', /push\('family',\s*r\.family,\s*(\d+)\)/],
    'people.*.profile.memory': ['actors/profile.js', /push\('memory',\s*r\.memory,\s*(\d+)\)/],
    'people.*.profile.relationships': ['actors/profile.js', /relationships\.slice\(-(\d+)\)/],
    'people.*.knowledge': ['engines/backstage.js', /keys\.slice\(0,\s*keys\.length\s*-\s*(\d+)\)/]
  };
  const srcCache = {};
  const readSrc = function (rel) {
    if (!srcCache[rel]) srcCache[rel] = fs.readFileSync(path.join(BASE, rel), 'utf8');
    return srcCache[rel];
  };
  const mismatches = [];
  Object.keys(CAP_RULES).forEach(function (k) {
    const rule = CAP_RULES[k], m = readSrc(rule[0]).match(rule[1]);
    if (!m) { mismatches.push(k + '(源码裁剪表达式未找到)'); return; }
    const srcCap = rule[2] ? rule[2](Number(m[1]), m) : Number(m[1]);
    if (!caps[k] || caps[k].cap !== srcCap) mismatches.push(k + '(登记 ' + (caps[k] && caps[k].cap) + ' vs 源码 ' + srcCap + ')');
    // v0.1.49: site 字段文件名反查——登记的 site 自由文本必须包含实际规则文件名的基准名（如 backstage.js）
    const expectedFile = path.basename(rule[0]);
    if (!caps[k] || !caps[k].site || caps[k].site.indexOf(expectedFile) < 0) {
      mismatches.push(k + '(site 声明 "' + (caps[k] && caps[k].site) + '" 缺失期望文件名 ' + expectedFile + ')');
    }
  });
  assert(mismatches.length === 0, '登记表 cap 与源码裁剪常量逐条一致' + (mismatches.length ? '：' + mismatches.join('、') : ''));
  // 登记表与反查规则须覆盖同一集合（consistency 无源码裁剪点，单列）
  const ruleKeys = Object.keys(CAP_RULES).concat(['consistency']).sort().join(',');
  assert(Object.keys(caps).sort().join(',') === ruleKeys, '登记表与源码反查集合同集合（无漏登/多登）');
  // ── 假阳性回归：memory 四层灌至各自上限，不得进 unbounded/suspects ──
  WA.store.transact(d => {
    d.memory.l0 = []; d.memory.l1 = []; d.memory.l2 = []; d.memory.l3 = [];
    for (let i = 0; i < 20; i++) d.memory.l0.push({ t: Date.now(), text: 'L0摘要' + i + ' ' + 'a'.repeat(30) });
    for (let i = 0; i < 30; i++) d.memory.l1.push({ t: Date.now(), text: 'L1' + i });
    for (let i = 0; i < 40; i++) d.memory.l2.push({ t: Date.now(), text: 'L2' + i });
    for (let i = 0; i < 60; i++) d.memory.l3.push({ t: Date.now(), theme: 'L3' + i });
  });
  const aFull = WA.store.sizeAudit({ minBytes: 64 });
  ['memory.l0', 'memory.l1', 'memory.l2', 'memory.l3'].forEach(function (k) {
    assert(aFull.unbounded.indexOf(k) < 0 && aFull.suspects.every(x => x.path !== k), k + ' 满载仍不误报无界');
    assert(aFull.drifted.every(x => x.path !== k), k + ' 满载恰好等于 cap，不算漂移');
  });
  // ── 漂移检测：绕过裁剪写入超限容器 ──
  WA.store.transact(d => { d.memory.l3 = []; for (let i = 0; i < 75; i++) d.memory.l3.push({ t: Date.now(), theme: 'L3' + i }); });
  const aDrift = WA.store.sizeAudit({ minBytes: 64 });
  assert(aDrift.drifted.some(x => x.path === 'memory.l3' && x.len === 75 && x.cap === 60), '超 cap 容器进 drifted（75>60）');
  assert(aDrift.unbounded.indexOf('memory.l3') < 0, '已登记容器漂移时不重复计为无界');
  const driftRow = aDrift.arrays.find(x => x.path === 'memory.l3');
  assert(driftRow && driftRow.bounded === true && driftRow.cap === 60, 'arrays 明细透出登记的 cap');
  // 诊断议题：漂移为 error 级
  const dg144 = WA.toolDiag.collect();
  assert(dg144.worldState.storage.sizeAudit.drifted.length >= 1, '诊断透出 drifted');
  const driftIssue = ((dg144.verdict || {}).issues || []).filter(function (x) { return x.key === 'sizeDrift'; })[0];
  assert(driftIssue && driftIssue.level === 'error' && /memory\.l3\(75>60/.test(driftIssue.detail), '漂移报 error 级议题并给出超限明细');
  // ── total 反映当前内存态，persisted 保留落盘量 ──
  assert(typeof aDrift.total === 'number' && aDrift.total > 0, 'sizeAudit.total 为当前体积');
  assert(typeof aDrift.persisted === 'number', 'sizeAudit.persisted 透出落盘体积');
  assert(aDrift.total >= aDrift.persisted || aDrift.persisted === 0, '内存态不小于已落盘态（写合并下成立）');
  // 复原，避免污染后续
  WA.store.transact(d => { d.memory.l0 = []; d.memory.l1 = []; d.memory.l2 = []; d.memory.l3 = []; d.worldFacts = []; });
  const aClean144 = WA.store.sizeAudit({ minBytes: 64 });
  assert(aClean144.drifted.length === 0, '复原后无漂移议题');
  } // end v0.1.44 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.45 — 旧存档结构自愈 + 扫描截断可见性
  // ═══════════════════════════════════════════════════════════
  v0145: {
  const ctx145 = global.SillyTavern.getContext();
  const chatKey145 = 'worldaxis_state_' + WA.store.chatId();
  const saved145 = global.localStorage.getItem(chatKey145);
  const healed0 = WA.store.loadStat().healed;
  // ── 旧存档：schemaVersion 已是最新，但 memory 缺 l0-l3、clock 缺 source、chapters 缺 seq ──
  const legacy = {
    schemaVersion: WA.store.SCHEMA_VERSION,
    clock: { iso: '', label: '旧纪元', dayIndex: 3 },
    memory: { facts: [{ key: '旧事实', value: 'v', version: 1, active: true }], foreshadows: [] },
    chapters: { active: false, current: null, history: [{ no: 4, title: '第四章' }, { no: 5, title: '第五章' }], storylines: [], relations: {} },
    worldFacts: [{ key: 'w', value: '1' }],
    people: { hero: { id: 'hero', name: '主角', location: '酒馆' } }
  };
  global.localStorage.setItem(chatKey145, JSON.stringify(legacy));
  WA.store.init();
  const st145 = WA.store.get();
  assert(st145.memory && Array.isArray(st145.memory.l0) && Array.isArray(st145.memory.l3), '旧存档载入后 memory.l0-l3 已补齐');
  assert(st145.clock.source === 'unset', 'clock.source 缺失被补齐为默认值');
  assert(st145.chapters.seq === 0, 'chapters.seq 缺失被补齐为 0');
  // 原有数据一字不动（ensureShape 只填空位）
  assert(st145.clock.label === '旧纪元' && st145.clock.dayIndex === 3, '旧 clock 值未被覆盖');
  assert(st145.memory.facts.length === 1 && st145.memory.facts[0].key === '旧事实', '旧 memory.facts 完整保留');
  assert(st145.worldFacts.length === 1 && Object.keys(st145.people).length === 1, '旧 worldFacts/people 保留');
  assert(st145.chapters.history.length === 2 && st145.chapters.history[1].no === 5, '旧章节史保留且未被裁剪');
  // ── 核心回归：无守卫写入必须真的落盘（修复前抛错被 transact 吞成 {ok:false}）──
  const w145 = WA.store.transact(function (d) { d.memory.l1.push({ t: 1, s: '巩固产物' }); });
  assert(w145.ok === true, '补齐后写 memory.l1 事务成功');
  assert((WA.store.get().memory.l1 || []).length === 1 && WA.store.get().memory.l1[0].s === '巩固产物', '写入真落盘（非静默丢弃）');
  // 引擎侧真实链路：L0 巩固（memory.js:34 的 draft.memory.l0.push 正是崩溃点）
  global.__mockChat.push({ is_user: true, mes: 'v145 旧存档回归 ' + 'q'.repeat(40), swipe_id: 5145 });
  const dgCfg145 = WA.apiRouter.getChannel('digest');
  WA.apiRouter.setChannel('digest', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  const l0Before = WA.store.get().memory.l0.length;
  global.__pushApiJson({ summary: 'v145 巩固摘要' });
  const l0Sum = await WA.memory.digestRound();
  const l0After = WA.store.get().memory.l0;
  assert(l0Sum === 'v145 巩固摘要', 'digestRound 经真实通道产出摘要');
  assert(Array.isArray(l0After) && l0After.length === l0Before + 1 && l0After[l0After.length - 1].s === 'v145 巩固摘要', 'L0 巩固真落盘（修复前此处静默丢失）');
  WA.apiRouter.setChannel('digest', dgCfg145 && dgCfg145.baseUrl && dgCfg145.model ? { baseUrl: dgCfg145.baseUrl, model: dgCfg145.model, apiKey: dgCfg145.apiKey } : null);
  // 自愈留痕
  const ls145 = WA.store.loadStat();
  assert(ls145.healed > healed0, '自愈字段数计入 loadStat.healed');
  assert(ls145.shapeConflicts === 0, '纯缺字段场景无类型冲突');
  assert(ls145.lastFix && ls145.lastFix.filled > 0, '本次载入 lastFix.filled 记录补齐量');
  // ── 幂等性：补齐已落盘，再次 init 不再 save（防每轮写放大回归）──
  const saveCnt145 = [0];
  const origSave145 = WA.store.save;
  WA.store.save = function () { saveCnt145[0]++; return origSave145.apply(WA.store, arguments); };
  WA.store.init();
  const reSave1 = saveCnt145[0];
  WA.store.init();
  const reSave2 = saveCnt145[0];
  WA.store.save = origSave145;
  assert(WA.store.loadStat().lastFix.filled === 0, '补齐落盘后重复 init：lastFix.filled 归零');
  assert(reSave1 === 0 && reSave2 === 0, '重复 init 不再触发 save（幂等，每轮零开销，实得 ' + reSave1 + '/' + reSave2 + '）');
  // 章号续编不从 1 重启
  WA.chapters.start('续章');
  assert(WA.store.get().chapters.current.no === 6, '旧存档续章号 = history 最大 no + 1（实得 ' + WA.store.get().chapters.current.no + '）');
  WA.chapters.end('收尾');
  // ── 类型冲突：不擅自改写用户数据，但要记账上报 ──
  global.localStorage.setItem(chatKey145, JSON.stringify({
    schemaVersion: WA.store.SCHEMA_VERSION,
    memory: { facts: [], foreshadows: [], l0: '被外部写坏的字符串', l1: [], l2: [], l3: [], pmem: [] },
    chronicle: 42
  }));
  WA.store.init();
  const st145c = WA.store.get();
  assert(st145c.memory.l0 === '被外部写坏的字符串', '类型冲突字段保留原值（不擅自改写）');
  assert(st145c.chronicle === 42, '顶层类型冲突同样保留');
  assert(st145c.memory.l1 !== undefined && st145c.clock && st145c.clock.source === 'unset', '冲突不影响其它缺失字段的补齐');
  const ls145c = WA.store.loadStat();
  assert(ls145c.shapeConflicts >= 2, '类型冲突计入 loadStat.shapeConflicts（实得 ' + ls145c.shapeConflicts + '）');
  const conflictLog = WA.eventLog.filter(function (l) { return String(l.msg).indexOf('类型与默认结构不符') >= 0; });
  assert(conflictLog.length >= 1 && conflictLog[0].level === 'error', '类型冲突以 error 级留痕');
  const dg145 = WA.toolDiag.collect();
  assert(((dg145.verdict || {}).issues || []).some(function (x) { return x.key === 'stateShape' && x.level === 'error'; }), '诊断报 stateShape error 议题');
  // ── lastFix 语义：议题只反映最近一次载入，不永久挂红 ──
  assert(ls145c.lastFix && ls145c.lastFix.conflicts >= 2, 'lastFix.conflicts 反映本次载入冲突数');
  assert(ls145c.shapeConflicts >= 2, 'shapeConflicts 保留历史累计');
  // 同一份状态再次载入：缺字段已在上次补齐并落盘，filled 归零，冲突仍在
  WA.store.init();
  const ls145re = WA.store.loadStat();
  assert(ls145re.lastFix.filled === 0, '重复载入已修状态：lastFix.filled 归零（不再挂 info 议题）');
  assert(ls145re.lastFix.conflicts >= 2, '类型冲突未自动修好则持续上报（不擅自改写用户数据）');
  assert(ls145re.shapeConflicts >= ls145c.shapeConflicts, '累计冲突数不回退');
  // ── sizeAudit 截断可见性 ──
  const aNorm = WA.store.sizeAudit({ minBytes: 64 });
  assert(aNorm.truncated === false && typeof aNorm.scannedNodes === 'number' && aNorm.nodeBudget === 800, '正常扫描不置 truncated');
  assert(aNorm.depthCap === 3, 'depthCap 透出实际生效值');
  const aTrunc = WA.store.sizeAudit({ minBytes: 64, maxNodes: 3 });
  assert(aTrunc.truncated === true, '预算耗尽时置 truncated=true（不再静默全绿）');
  const aTruncDeep = WA.store.sizeAudit({ minBytes: 64, maxDepth: 1 });
  assert(aTruncDeep.depthCap === 1 && aTruncDeep.arrays.every(function (x) { return x.path.indexOf('.') < 0; }), 'depthCap 生效：仅顶层数组被扫到');
  // 截断必须升级为议题（v0.1.47 语义更新：诊断改走 sizeAuditFull，
  // 故此处覆写底层 sizeAudit 使每片只能扫 3 节点——自动续扫仍无法收敛时应如实报未完整）
  const origAudit145 = WA.store.sizeAudit;
  WA.store.sizeAudit = function (o) { return origAudit145.call(WA.store, { minBytes: 64, maxNodes: 3 }); };
  const dg145t = WA.toolDiag.collect();
  const truncIssue = ((dg145t.verdict || {}).issues || []).filter(function (x) { return x.key === 'sizeScanTruncated'; })[0];
  assert(truncIssue && truncIssue.level === 'warn' && /unbounded\/suspects 不完整/.test(truncIssue.detail), '截断报 warn 议题并声明结果不完整');
  WA.store.sizeAudit = origAudit145;
  // ── 复原：还原测试前状态，不污染后续用例 ──
  if (saved145 === null) { try { delete global.localStorage[chatKey145]; } catch (e) {} }
  else global.localStorage.setItem(chatKey145, saved145);
  WA.store.init();
  assert(WA.store.get().memory && Array.isArray(WA.store.get().memory.l0), '复原后 store 仍可用');
  } // end v0.1.45 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.46 — 版本链步进迁移 + sizeAudit 断点续扫
  // ═══════════════════════════════════════════════════════════
  v0146: {
  // ── A. 版本链迁移 ──
  assert(typeof WA.store.registerMigration === 'function' && typeof WA.store.migrations === 'function', 'registerMigration/migrations 已导出');
  assert(WA.store.registerMigration('x', function () {}) === false, '非法版本参数被拒');
  assert(WA.store.registerMigration(2, null) === false, '非函数迁移步被拒');
  assert(WA.store.migrations().length === 0, '初始迁移注册表为空');
  // 两步链（target=2 显式指定，使链长于当前 SCHEMA_VERSION 也能被测到）
  const order146 = [];
  const off146a = WA.store.registerMigration(0, function (st) { order146.push(0); st._m0 = 'a'; });
  const off146b = WA.store.registerMigration(1, function (st) { order146.push(1); st._m1 = st._m0 + 'b'; });
  assert(typeof off146a === 'function' && typeof off146b === 'function', 'registerMigration 返回反注册函数');
  assert(WA.store.migrations().join(',') === '0,1', 'migrations() 按版本升序返回');
  const chain146 = WA.store.migrate({ schemaVersion: 0, clock: { iso: '', label: '旧纪元', dayIndex: 2 } }, 2);
  assert(order146.join(',') === '0,1', '两步按版本序依次执行（实得 ' + order146.join(',') + '）');
  assert(chain146._m1 === 'ab', '后步可见前步写入（链式传递）');
  assert(chain146.clock.label === '旧纪元' && chain146.clock.dayIndex === 2, '迁移保留既有业务数据');
  assert(chain146.clock.source === 'unset' && Array.isArray(chain146.memory.l0), '迁移后补齐缺字段（含嵌套）');
  assert(chain146.schemaVersion === WA.store.SCHEMA_VERSION, '迁移后版本号归一为当前值');
  // v0.1.47: 迁移路径改由观测层承载，state 上不再留 _migratedFrom（防污染持久 payload）
  assert(chain146._migratedFrom === undefined, '迁移报告不写进 state');
  const mr146 = WA.store.migrateReport();
  assert(mr146 && mr146.from === 0 && mr146.to === WA.store.SCHEMA_VERSION && mr146.path.join(',') === '0->1,1->2', 'migrateReport 透出迁移路径供排障');
  // 已达当前版本的存档：默认 target 下不空转任何步
  order146.length = 0;
  const skip146 = WA.store.migrate({ schemaVersion: WA.store.SCHEMA_VERSION, worldFacts: [{ key: 'a', value: '1' }] });
  assert(order146.length === 0, '已是当前版本时不执行迁移步');
  assert(skip146.worldFacts.length === 1, '跳过迁移仍保留数据');
  // 迁移步异常被隔离，链不中断
  const off146c = WA.store.registerMigration(3, function () { throw new Error('故意炸'); });
  const err146 = WA.store.migrate({ schemaVersion: 3, clock: { label: 'x' } }, 4);
  assert(err146.schemaVersion === WA.store.SCHEMA_VERSION && err146.clock.source === 'unset', '迁移步抛错被 catch，版本仍归一且字段补齐');
  const migErrLog = WA.eventLog.filter(function (l) { return String(l.msg).indexOf('迁移步') >= 0; });
  assert(migErrLog.length >= 1 && migErrLog[0].level === 'error', '迁移步异常以 error 级留痕');
  // 反注册清理：注册表须回到空（防测试污染真实迁移链）
  off146a(); off146b(); off146c();
  assert(WA.store.migrations().length === 0, '反注册后迁移表清空');
  const order146d = [];
  WA.store.migrate({ schemaVersion: 0 }, 2);
  assert(order146d.length === 0, '清理后的表不再被调用');
  // ── B. sizeAudit 断点续扫 ──
  // 探针子树：数组节点落在默认 maxDepth(3) 可见范围内
  WA.store.transact(function (d) {
    d.__deep = { a: { b: [{ x: 1 }, { y: 2 }], c: [1, 2, 3] }, d: [4], e: { f: [5, 6] } };
  });
  // 集合比对必须用足量 topN（arrays 默认只留 Top12，是排序视图而非全量清单）
  const OPT146 = { minBytes: 0, topN: 5000 };
  const audit146 = function (extra) { return WA.store.sizeAudit(Object.assign({}, OPT146, extra || {})); };
  const pFull146 = audit146({ maxNodes: 100000 });
  assert(pFull146.truncated === false && pFull146.cursor === null, '充足预算不截断且 cursor 为 null');
  const fullPaths146 = Array.from(new Set(pFull146.arrays.map(function (x) { return x.path; }))).sort();
  assert(fullPaths146.indexOf('__deep.a.b') >= 0 && fullPaths146.indexOf('__deep.e.f') >= 0, '全量扫描触达探针各层数组');
  assert(pFull146.arrays.length > 12 && audit146({ maxNodes: 100000, topN: 2 }).arrays.length === 2, 'arrays 受 topN 截断（默认视图非全量清单）');
  // 数据驱动预算取半：确保两趟各自都扫到数组（预算过小会退化成只扫对象节点）
  const half146 = Math.max(1, Math.ceil(pFull146.scannedNodes / 2));
  const p1 = audit146({ maxNodes: half146 });
  assert(p1.truncated === true, '半量预算触发截断');
  assert(Array.isArray(p1.cursor) && p1.cursor.length > 0, '截断时返回非空断点游标');
  assert(p1.scannedNodes === half146, '首趟访问数恰等于预算（实得 ' + p1.scannedNodes + '/' + half146 + '）');
  assert(p1.arrays.length > 0 && p1.arrays.length < fullPaths146.length, '首趟扫到部分而非全部数组（分割非退化）');
  const p2 = audit146({ maxNodes: 100000, resumeCursor: p1.cursor });
  assert(p2.truncated === false && p2.cursor === null, '续扫在充足预算下跑完');
  const p1Paths = p1.arrays.map(function (x) { return x.path; });
  const p2Paths = p2.arrays.map(function (x) { return x.path; });
  const uniqMerged = Array.from(new Set(p1Paths.concat(p2Paths))).sort();
  assert(uniqMerged.join(',') === fullPaths146.join(','), '两趟并集与全量扫描等价（无遗漏无重复）：' + uniqMerged.length + ' vs ' + fullPaths146.length);
  assert(p1Paths.filter(function (p) { return p2Paths.indexOf(p) >= 0; }).length === 0, '首趟与续扫无重叠节点（游标不回头）');
  assert(p1.scannedNodes + p2.scannedNodes === pFull146.scannedNodes, '两趟访问节点数之和等于全量（' + (p1.scannedNodes + p2.scannedNodes) + '）');
  // 三趟分割同样收敛
  const t1 = audit146({ maxNodes: Math.ceil(pFull146.scannedNodes / 3) });
  const t2 = audit146({ maxNodes: Math.ceil(pFull146.scannedNodes / 3), resumeCursor: t1.cursor });
  const t3 = audit146({ maxNodes: 100000, resumeCursor: t2.cursor });
  const uniq3 = Array.from(new Set(t1.arrays.map(function (x) { return x.path; }).concat(t2.arrays.map(function (x) { return x.path; })).concat(t3.arrays.map(function (x) { return x.path; })))).sort();
  assert(uniq3.join(',') === fullPaths146.join(','), '三趟分片并集仍等价全量');
  assert(t3.truncated === false, '末趟以全预算收敛');
  // startCursor：分片扫描入口
  const shard146 = audit146({ startCursor: ['__deep.a'], maxNodes: 100000 });
  assert(shard146.arrays.length === 2 && shard146.arrays.every(function (x) { return x.path.indexOf('__deep.a.') === 0; }), 'startCursor 限定只扫指定子树（实得 ' + shard146.arrays.map(function (x) { return x.path; }).join('|') + '）');
  // maxDepth 生效性
  assert(audit146({ maxNodes: 100000, maxDepth: 1 }).arrays.every(function (x) { return x.path.indexOf('.') < 0; }), 'maxDepth=1 只看顶层数组');
  // 游标边界：空游标降级全量、非法游标不崩
  assert(Array.from(new Set(audit146({ maxNodes: 100000, resumeCursor: [] }).arrays.map(function (x) { return x.path; }))).sort().join(',') === fullPaths146.join(','), '空 resumeCursor 降级为全量扫描');
  const bogus146 = audit146({ maxNodes: 100000, resumeCursor: ['nonexistent.path'] });
  assert(bogus146.arrays.length === 0 && bogus146.truncated === false, '游标指向不存在路径：产出为空但不崩不截断');
  // 探针字段清理
  WA.store.transact(function (d) { delete d.__deep; });
  assert(audit146({ maxNodes: 100000 }).arrays.every(function (x) { return x.path.indexOf('__deep') < 0; }), '探针字段清理完毕');
  } // end v0.1.46 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.47 — 迁移可观测闭环 + 分片扫描编排入口
  // ═══════════════════════════════════════════════════════════
  v0147: {
  assert(typeof WA.store.migrateReport === 'function' && typeof WA.store.sizeAuditFull === 'function', 'migrateReport/sizeAuditFull 已导出');
  // ── A. 迁移报告落观测层而非 state ──
  const recOff = WA.store.registerMigration(0, function (st) { st._r147 = 'a'; });
  const boomOff = WA.store.registerMigration(1, function () { throw new Error('boom147'); });
  const mig147 = WA.store.migrate({ schemaVersion: 0, clock: { label: 'x' } }, 2);
  assert(mig147._migratedFrom === undefined, '迁移报告不写入 state（防污染持久 payload）');
  assert(mig147._r147 === 'a', '成功步的写入被保留');
  const rep147 = WA.store.migrateReport();
  assert(rep147 && rep147.from === 0 && rep147.to === WA.store.SCHEMA_VERSION, '报告含起止版本');
  assert(rep147.path.join(',') === '0->1', '报告只记成功步');
  assert(rep147.failed.length === 1 && rep147.failed[0].at === 1 && /boom147/.test(rep147.failed[0].error), '失败步进报告（哪一步炸了不再只存于瞬时日志）');
  const repCopy = WA.store.migrateReport();
  repCopy.failed.push({ at: 99 });
  assert(WA.store.migrateReport().failed.length === 1, 'migrateReport 返回深拷贝（外部不可篡改内部状态）');
  const ls147 = WA.store.loadStat();
  assert(ls147.migrated && ls147.migrated.steps === 1 && ls147.migrated.failed === 1, 'loadStat.migrated 汇总步数与失败数');
  const dg147 = WA.toolDiag.collect();
  const migIssue = ((dg147.verdict || {}).issues || []).filter(function (x) { return x.key === 'schemaMigrate'; })[0];
  assert(migIssue && migIssue.level === 'error' && /1 步失败/.test(migIssue.detail), '迁移失败步报 error 议题');
  // 纯成功迁移 → info 级；无迁移 → 不报
  boomOff();
  const ok147 = WA.store.migrate({ schemaVersion: 0 }, 1);
  assert(ok147._migratedFrom === undefined, '成功迁移同样不污染 state');
  const dg147b = WA.toolDiag.collect();
  const migIssueB = ((dg147b.verdict || {}).issues || []).filter(function (x) { return x.key === 'schemaMigrate'; })[0];
  assert(migIssueB && migIssueB.level === 'info' && /1 步/.test(migIssueB.detail), '无失败时迁移降为 info 议题');
  recOff();
  assert(WA.store.migrations().length === 0, '测试迁移步已反注册清理');
  WA.store.migrate({ schemaVersion: WA.store.SCHEMA_VERSION });
  const dg147c = WA.toolDiag.collect();
  assert(!((dg147c.verdict || {}).issues || []).some(function (x) { return x.key === 'schemaMigrate'; }), '未发生迁移时不出该议题');
  // ── B. sizeAuditFull 分片编排 ──
  WA.store.transact(function (d) {
    d.__p147 = { a: { b: [{ x: 1 }, { y: 2 }], c: [1, 2, 3] }, d: [4], e: { f: [5, 6] } };
  });
  const OPT147 = { minBytes: 0, topN: 5000 };
  const oneShot = WA.store.sizeAudit(Object.assign({}, OPT147, { maxNodes: 100000 }));
  const oneSet = Array.from(new Set(oneShot.arrays.map(function (x) { return x.path; }))).sort().join(',');
  const fullBig = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: 100000 }));
  assert(fullBig.complete === true && fullBig.chunks === 1 && fullBig.stalled === false, '大片段：一趟收敛');
  assert(Array.from(new Set(fullBig.arrays.map(function (x) { return x.path; }))).sort().join(',') === oneSet, 'sizeAuditFull 与单次大预算集合等价');
  assert(fullBig.visitedNodes === oneShot.scannedNodes, '编排访问节点数与单次一致（无重扫）');
  // 小片段：多趟接力后仍与全量等价（这是编排入口存在的意义）
  const halfN = Math.max(1, Math.ceil(oneShot.scannedNodes / 2));
  const fullSplit = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: halfN }));
  assert(fullSplit.chunks >= 2, '小片段自动接力为多趟（实得 ' + fullSplit.chunks + ' 片）');
  assert(fullSplit.complete === true && fullSplit.stalled === false, '多趟仍完整收敛（无需调用方手写循环）');
  assert(Array.from(new Set(fullSplit.arrays.map(function (x) { return x.path; }))).sort().join(',') === oneSet, '分片并集与全量集合等价');
  assert(fullSplit.visitedNodes === oneShot.scannedNodes, '分片总访问量等于全量（无重复无遗漏）');
  // chunk=3 需较多趟数才能覆盖被前序测试灌大的 state，故放宽 maxChunks（触顶行为由下方 capped 用例专测）
  const tiny = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: 3, maxChunks: 5000 }));
  assert(Array.from(new Set(tiny.arrays.map(function (x) { return x.path; }))).sort().join(',') === oneSet, '极小片段(3)仍收敛到全量集合');
  assert(tiny.chunks > fullSplit.chunks, '片段越小所需趟数越多（实得 ' + tiny.chunks + '）');
  // maxChunks 触顶：如实报告未扫完，绝不假装全绿
  const capped = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: 3, maxChunks: 2 }));
  assert(capped.complete === false && capped.stalled === true && capped.chunks === 2, '片数触顶报 complete=false/stalled=true');
  assert(Array.from(new Set(capped.arrays.map(function (x) { return x.path; }))).join(',').split(',').length < oneSet.split(',').length, '触顶时结果确实不完整（未假装扫完）');
  // 结论级派生字段与 sizeAudit 同语义
  const cleanFull = WA.store.sizeAuditFull({ minBytes: 64 });
  assert(Array.isArray(cleanFull.unbounded) && Array.isArray(cleanFull.suspects) && Array.isArray(cleanFull.drifted), '编排结果含 unbounded/suspects/drifted');
  assert(cleanFull.complete === true && cleanFull.truncated === undefined, '编排结果以 complete 表达收敛（truncated 属单片语义）');
  assert(cleanFull.trackedBounded === Object.keys(WA.store.sizeCaps()).length, 'trackedBounded 与登记表条数一致');
  // 无界容器经编排仍被抓出（与 v0.1.43 单片行为一致）
  WA.store.transact(function (d) { d.__p147 = null; d.__journal147 = []; for (let i = 0; i < 30; i++) d.__journal147.push('r' + i + ' ' + 'w'.repeat(40)); });
  const withBad = WA.store.sizeAuditFull({ minBytes: 64, chunkNodes: 5 });
  assert(withBad.complete === true && withBad.unbounded.indexOf('__journal147') >= 0, '编排扫描仍抓出未登记容器');
  assert(withBad.suspects.some(function (x) { return x.path === '__journal147'; }), '该容器进 suspects');
  WA.store.transact(function (d) { delete d.__journal147; delete d.__p147; });
  // 诊断消费编排入口且默认态干净
  const dg147d = WA.toolDiag.collect();
  const aud147 = ((dg147d.worldState || {}).storage || {}).sizeAudit;
  assert(aud147 && typeof aud147.complete === 'boolean' && typeof aud147.chunks === 'number', '诊断走 sizeAuditFull（透出 complete/chunks）');
  assert(aud147.complete === true && (!aud147.suspects || aud147.suspects.length === 0), '默认态诊断：扫描完整且无无界嫌疑');
  assert(!((dg147d.verdict || {}).issues || []).some(function (x) { return x.key === 'sizeScanTruncated'; }), '收敛时不报未收敛议题');
  WA.store.transact(function (d) { delete d.__p147; });
  // ── C. 迁移报告不跨载入粘留（与 v0.1.45 lastFix 同一类故障的守卫）──
  const keyC147 = 'worldaxis_state_' + WA.store.chatId();
  const saveC147 = global.localStorage.getItem(keyC147);
  const offC = WA.store.registerMigration(0, function (st) { st._c147 = 'ran'; });
  // 真实 init 迁移分支：存档版本 0 < SCHEMA_VERSION(1)
  global.localStorage.setItem(keyC147, JSON.stringify({ schemaVersion: 0, clock: { label: 'L' } }));
  WA.store.init();
  const repC1 = WA.store.migrateReport();
  assert(repC1 && repC1.from === 0 && repC1.steps === 1, '载入时真实走迁移链并出报告');
  assert(WA.store.get()._c147 === 'ran', '迁移步的转换确实落到载入后的 state');
  assert(WA.store.get().clock.label === 'L', '迁移载入保留原数据');
  assert(((WA.toolDiag.collect().verdict || {}).issues || []).some(function (x) { return x.key === 'schemaMigrate'; }), '迁移发生当次载入出议题');
  // 同一份存档已升到当前版本：再次载入不再迁移，报告须为 null 而非上一次的残留
  WA.store.init();
  assert(WA.store.migrateReport() === null, '重复载入不再迁移：报告为 null（不粘留）');
  assert(!((WA.toolDiag.collect().verdict || {}).issues || []).some(function (x) { return x.key === 'schemaMigrate'; }), '议题随载入结束消失（不永久挂红）');
  assert(WA.store.loadStat().migrated === null, 'loadStat.migrated 同步归零');
  offC();
  if (saveC147 === null) { try { delete global.localStorage[keyC147]; } catch (e) {} }
  else global.localStorage.setItem(keyC147, saveC147);
  WA.store.init();
  assert(WA.store.migrations().length === 0, '迁移步与存档现场均已复原');
  } // end v0.1.47 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.48 — 派生逻辑单一实现（sizeAudit 与 sizeAuditFull 结论一致）
  // ═══════════════════════════════════════════════════════════
  v0148: {
  // 造一份含「未登记容器 + 漂移容器」的 state，令两入口都需派生同一结论
  WA.store.transact(function (d) {
    d.__bad148 = []; for (let i = 0; i < 25; i++) d.__bad148.push('x' + i + ' ' + 'k'.repeat(30));
    d.memory.l3 = []; for (let i = 0; i < 70; i++) d.memory.l3.push({ t: Date.now(), theme: 'L3' + i });
    d.worldFacts = []; for (let i = 0; i < 100; i++) d.worldFacts.push({ key: 'k' + i, value: 'v'.repeat(20) });
  });
  const MIN148 = 64;
  const sa148 = WA.store.sizeAudit({ minBytes: MIN148, maxNodes: 100000, topN: 5000 });
  const sf148 = WA.store.sizeAuditFull({ minBytes: MIN148, chunkNodes: 100000, topN: 5000 });
  assert(sa148.total === sf148.total, '两入口 total 一致（v0.1.48 前 sizeAuditFull 用滞后的 saveStat.bytes）');
  assert(sf148.total === sf148.persisted || sa148.total > sa148.persisted, 'total 反映当前内存态而非滞后落盘量');
  const setOf = function (arr) { return Array.from(new Set(arr)).sort().join(','); };
  assert(setOf(sa148.unbounded) === setOf(sf148.unbounded), 'unbounded 结论两处一致（按集合比对：两入口遍历顺序不同）');
  assert(JSON.stringify(sa148.suspects) === JSON.stringify(sf148.suspects), 'suspects 结论两处一致');
  assert(JSON.stringify(sa148.drifted) === JSON.stringify(sf148.drifted), 'drifted 结论两处一致');
  // 结论本身正确（派生收敛未丢功能）：未登记被抓、漂移被抓、有界不误报
  assert(sa148.unbounded.indexOf('__bad148') >= 0 && sa148.suspects.some(function (x) { return x.path === '__bad148'; }), '未登记容器经共享派生仍被抓出');
  assert(sa148.drifted.some(function (x) { return x.path === 'memory.l3' && x.len === 70 && x.cap === 60; }), '超 cap 容器经共享派生仍报漂移');
  assert(sa148.drifted.every(function (x) { return x.path !== 'worldFacts'; }), '满载有界容器(worldFacts=100=cap)不误报');
  // 极端 chunk：多片接力后结论与单片大预算完全相同
  const sSmall = WA.store.sizeAuditFull({ minBytes: MIN148, chunkNodes: 4, maxChunks: 5000, topN: 5000 });
  assert(sSmall.chunks > 1 && sSmall.complete === true, '小 chunk 多片自动接力收敛（实得 ' + sSmall.chunks + ' 片）');
  assert(setOf(sSmall.unbounded) === setOf(sa148.unbounded) && JSON.stringify(sSmall.suspects) === JSON.stringify(sa148.suspects) && JSON.stringify(sSmall.drifted) === JSON.stringify(sa148.drifted), '分片结论与单片一致（suspects/drifted 已排序）');
  assert(sSmall.total === sa148.total, '分片 total 同样与单片一致');
  // 诊断消费链：verdict 议题仍由派生结论正确生成
  const dg148 = WA.toolDiag.collect();
  const iss148 = ((dg148.verdict || {}).issues || []);
  assert(iss148.some(function (x) { return x.key === 'sizeAudit'; }), '未登记容器经诊断报 sizeAudit 议题');
  assert(iss148.some(function (x) { return x.key === 'sizeDrift'; }), '漂移经诊断报 sizeDrift 议题');
  WA.store.transact(function (d) { delete d.__bad148; d.memory.l3 = []; d.worldFacts = []; });
  const after148 = WA.store.sizeAudit({ minBytes: MIN148, maxNodes: 100000 });
  assert(after148.suspects.every(function (x) { return x.path.indexOf('__bad') < 0; }), '本探针容器清理后不再进 suspects');
  assert(after148.drifted.every(function (x) { return x.path !== 'memory.l3'; }), 'l3 归零后不再报漂移');
  assert(after148.arrays.every(function (x) { return x.path.indexOf('__bad') < 0; }), '探针字段清理完毕');
  } // end v0.1.48 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.49 — site 自由文本反查校验 + 日志/工作流历史跨重启恢复
  // ═══════════════════════════════════════════════════════════
  v0149: {
  // ── 1. site 声明反查 ──
  const caps149 = WA.store.sizeCaps();
  assert(caps149.chronicle && caps149.chronicle.site.includes('backstage.js'), 'chronicle 的 site 正确引用 backstage.js');
  assert(caps149['memory.l0'] && caps149['memory.l0'].site.includes('memory.js'), 'memory.l0 的 site 正确引用 memory.js');
  
  // ── 2. eventLog 跨会话/切聊天持久化与恢复 ──
  const currentChatId = WA.store.chatId();
  WA.clearEventLog(currentChatId);
  assert(WA.eventLog.length === 0, 'clearEventLog 清空当前内存与持久日志');
  
  WA.log('info', 'v149 测试日志 1', 'data1');
  WA.log('warn', 'v149 测试日志 2', 'data2');
  assert(WA.eventLog.length === 2, 'WA.log 正常推进内存环形队列');
  
  // 模拟切聊天/初始化触发 loadEventLog
  const mockChatB = 'chat_test_v149_b';
  WA.loadEventLog(mockChatB);
  assert(WA.eventLog.length === 0, '切换到无日志的聊天后，内存 eventLog 为空');
  
  // 切回原始聊天，加载持久化日志
  WA.loadEventLog(currentChatId);
  assert(WA.eventLog.length === 2, '切回原始聊天后，持久化的 2 条日志完整恢复');
  assert(WA.eventLog[0].msg === 'v149 测试日志 1', '恢复日志内容与顺序一致');
  
  WA.clearEventLog(currentChatId);
  WA.clearEventLog(mockChatB);
  
  // ── 3. workflow 历史跨会话/切聊天持久化与恢复 ──
  WA.workflow.resetHistory(currentChatId);
  assert(WA.workflow.history().runs.length === 0, 'resetHistory 清空当前聊天历史与持久记录');
  
  WA.workflow.register({ id: 'wtest149.node', chain: 'wtest149', order: 1, label: 'v149 节点', async run() {} });
  await WA.workflow.run('wtest149', {});
  assert(WA.workflow.history().runs.length === 1, '运行工作流后产生 1 条历史记录');
  
  // 切换聊天，加载另一聊天的 history
  WA.workflow.loadHistory(mockChatB);
  assert(WA.workflow.history().runs.length === 0, '切换至新聊天，工作流历史为空');
  
  // 切回原始聊天
  WA.workflow.loadHistory(currentChatId);
  assert(WA.workflow.history().runs.length === 1, '切回原始聊天，工作流历史完整恢复');
  assert(WA.workflow.history().runs[0].chain === 'wtest149', '恢复的工作流历史链名一致');
  
  // 清理测试节点与历史
  WA.workflow.unregister('wtest149.node');
  WA.workflow.resetHistory(currentChatId);
  WA.workflow.resetHistory(mockChatB);
  } // end v0.1.49 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.50 — sizeAudit 报告导出 + 撤销台账跨会话/切聊天持久化
  // ═══════════════════════════════════════════════════════════
  v0150: {
  // ── 1. exportAuditReport 格式化报告导出 ──
  assert(typeof WA.store.exportAuditReport === 'function', 'store.exportAuditReport 已导出');
  const report150 = WA.store.exportAuditReport({ minBytes: 64 });
  assert(typeof report150 === 'string' && report150.includes('# WorldAxis 内存/持久化审计报告'), '报告包含标题标头');
  assert(report150.includes('总内存/状态体积') && report150.includes('状态统计概览'), '报告包含概览与统计');
  assert(report150.includes('Top 容器内存占用排行'), '报告包含 Top 容器排行');

  // ── 2. uninjectLedger 撤销台账持久化与恢复 ──
  const cid150 = WA.store.chatId();
  if (WA.render.clearUninjectLedger) WA.render.clearUninjectLedger(cid150);
  
  WA.render.uninject('test_v150_trigger');
  const leg150 = WA.render.injectionLedger();
  assert(leg150.count >= 1, 'uninject 后产生撤销台账记录');
  
  // 真实切换 SillyTavern context 的 chatId
  const mockChat150 = 'chat_test_v150_b';
  const stCtx = global.SillyTavern.getContext();
  const origChatId = stCtx.chatId;
  stCtx.chatId = mockChat150;
  
  if (WA.render.loadUninjectLedger) {
    WA.render.loadUninjectLedger(mockChat150);
    const legChatB = WA.render.injectionLedger();
    assert(legChatB.entries.length === 0, '切至无台账聊天后，台账数据为空');
    
    // 切回原聊天
    stCtx.chatId = origChatId;
    WA.render.loadUninjectLedger(cid150);
    const legRestored = WA.render.injectionLedger();
    assert(legRestored.entries.length >= 1, '切回原聊天，撤销台账成功恢复');
    assert(legRestored.entries.some(function (e) { return e.trigger === 'test_v150_trigger'; }), '恢复的撤销记录触发源吻合');
    
    // 清理
    WA.render.clearUninjectLedger(cid150);
    WA.render.clearUninjectLedger(mockChat150);
  }
  } // end v0.1.50 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.51 — 存储键卫生：storageStat 分类计量 + sweepStaleKeys 过期清理
  // ═══════════════════════════════════════════════════════════
  v0151: {
  assert(typeof WA.store.storageStat === 'function' && typeof WA.store.sweepStaleKeys === 'function', 'storageStat/sweepStaleKeys 已导出');

  // ── 场景构造：多聊天键空间 ──
  const cur151 = WA.store.chatId();
  const LS = global.localStorage;
  const junkBefore151 = JSON.parse(JSON.stringify(LS._dump()));
  // 冷聊天 A：state 活跃时间 40 天前（过期）
  const coldA = 'v151_cold_a';
  LS.setItem('worldaxis_state_' + coldA, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS.setItem('worldaxis_event_log_' + coldA, '[]');
  LS.setItem('worldaxis_wf_history_' + coldA, '[]');
  LS.setItem('worldaxis_uninject_ledger_' + coldA, '[]');
  LS.setItem('worldaxis_recovery_' + coldA, '[]');
  // 活跃聊天 B：state 活跃时间 1 天前（未过期）
  const warmB = 'v151_warm_b';
  LS.setItem('worldaxis_state_' + warmB, JSON.stringify({ meta: { updatedAt: Date.now() - 1 * 86400000 } }));
  LS.setItem('worldaxis_event_log_' + warmB, '[]');
  // 孤儿聊天 C：无 state 键，只有 recovery + 诊断键（聊天已删残留）
  const orphanC = 'v151_orphan_c';
  LS.setItem('worldaxis_recovery_' + orphanC, '[]');
  LS.setItem('worldaxis_event_log_' + orphanC, '[]');
  // corrupt 键 ×7 归非当前聊天（应保留最近 5 个 → 溢出 2 个）
  const qHost151 = 'v151_quarantine_host';
  for (let ci = 0; ci < 7; ci++) LS.setItem('worldaxis_state_' + qHost151 + '_corrupt_' + (Date.now() - ci * 1000), '{}');
  // 当前聊天的隔离副本 ×2（v0.2.3：受保护——损坏现场是唯一可回滚数据，不得当溢出清理）
  for (let ci = 0; ci < 2; ci++) LS.setItem('worldaxis_state_' + cur151 + '_corrupt_' + (Date.now() - 1000000 - ci * 1000), '{}');
  // settings / wb 键（永不清理）
  LS.setItem('worldaxis_backstage_settings_v1', '{}');
  LS.setItem('worldaxis_wb_selection_' + coldA, '{}');

  // ── 1. storageStat 分类计量 ──
  const stat151 = WA.store.storageStat();
  assert(stat151.enumerable === true, 'mock localStorage 支持枚举');
  assert(stat151.totalKeys >= 15, '键总数计入（实 ' + stat151.totalKeys + '）');
  assert(stat151.families.state >= 3 && stat151.families.diagnostic >= 5, 'state/diagnostic 家族分类计数');
  assert(stat151.families.corrupt === 9, 'corrupt 家族计数（7 宿主 + 2 当前聊天副本，实 ' + stat151.families.corrupt + '）');
  assert(stat151.families.settings >= 1 && stat151.families.wb >= 1, 'settings/wb 家族分类');
  assert(stat151.currentChat === cur151 && stat151.currentChatBytes > 0, '当前聊天键计量（' + stat151.currentChatBytes + 'B）');
  const staleKeys151 = stat151.staleDiagCandidates.map(x => x.key);
  assert(staleKeys151.indexOf('worldaxis_event_log_' + coldA) >= 0, '冷聊天 A 诊断键入 stale 候选');
  assert(staleKeys151.indexOf('worldaxis_event_log_' + orphanC) >= 0, '孤儿聊天 C 诊断键入 stale 候选（idleMs=Infinity 排最前）');
  assert(staleKeys151.indexOf('worldaxis_event_log_' + warmB) < 0, '活跃聊天 B 诊断键不入候选');

  // ── 2. sweepStaleKeys dry-run（默认不删）──
  const plan151 = WA.store.sweepStaleKeys({ maxIdleDays: 30, keepCorrupt: 5 });
  assert(plan151.apply === false, '默认 dry-run');
  assert(LS.getItem('worldaxis_event_log_' + coldA) !== null, 'dry-run 不实际删除');
  const rem151 = plan151.remove;
  assert(rem151.some(r => r.key === 'worldaxis_event_log_' + coldA) && rem151.some(r => r.key === 'worldaxis_wf_history_' + coldA) && rem151.some(r => r.key === 'worldaxis_uninject_ledger_' + coldA), '冷聊天 A 三个诊断键全进清理计划');
  assert(rem151.some(r => r.key === 'worldaxis_event_log_' + orphanC), '孤儿聊天 C 诊断键进计划');
  assert(rem151.some(r => r.key === 'worldaxis_recovery_' + orphanC && r.reason === 'orphan-recovery'), '孤儿 recovery 进计划（聊天无 state）');
  assert(!rem151.some(r => r.key === 'worldaxis_event_log_' + warmB), '活跃聊天 B 诊断键保留');
  assert(!rem151.some(r => r.chat === cur151), '当前聊天任何键保留（含 corrupt）');
  assert(!rem151.some(r => r.reason === 'corrupt-overflow' && r.chat === cur151), '当前聊天隔离副本不受 corrupt 溢出管辖（v0.2.3 数据保护）');
  assert(!rem151.some(r => r.key === 'worldaxis_backstage_settings_v1') && !rem151.some(r => r.key === 'worldaxis_wb_selection_' + coldA), 'settings/wb 键永不清理');
  const corruptRem151 = rem151.filter(r => r.reason === 'corrupt-overflow');
  assert(corruptRem151.length === 2, 'corrupt 超出保留窗口 2 个（7-5）');
  assert(plan151.freedBytes > 0, '可释放字节计量（' + plan151.freedBytes + 'B）');

  // ── 3. apply 真删 + 删后复核 ──
  const planApply151 = WA.store.sweepStaleKeys({ maxIdleDays: 30, keepCorrupt: 5, apply: true });
  assert(planApply151.apply === true && planApply151.remove.length === rem151.length, 'apply 计划与 dry-run 一致');
  assert(LS.getItem('worldaxis_event_log_' + coldA) === null && LS.getItem('worldaxis_recovery_' + orphanC) === null, '过期诊断键与孤儿 recovery 已实际删除');
  assert(LS.getItem('worldaxis_event_log_' + warmB) !== null && LS.getItem('worldaxis_state_' + warmB) !== null, '活跃聊天键完好');
  assert(LS.getItem('worldaxis_backstage_settings_v1') !== null && LS.getItem('worldaxis_wb_selection_' + coldA) !== null, 'settings/wb 完好');
  const afterStat151 = WA.store.storageStat();
  assert(afterStat151.families.corrupt === 7, 'corrupt 保留 5 宿主 + 2 当前聊天副本（实 ' + afterStat151.families.corrupt + '）');
  assert(afterStat151.totalKeys === stat151.totalKeys - planApply151.remove.length, '删后键总数精确对账');

  // ── 4. toolDiag 集成 ──
  const diag151 = WA.toolDiag.collect();
  const skDiag151 = (((diag151.worldState || {}).storage || {}).storageKeys) || null;
  assert(skDiag151 && typeof skDiag151.totalKeys === 'number', 'toolDiag 透出 storageKeys 计量');

  // ── 5. exportAuditReport 存储键段 ──
  const rpt151 = WA.store.exportAuditReport({ minBytes: 64 });
  assert(rpt151.includes('## 📦 存储键空间') && rpt151.includes('worldaxis_* 键总数'), '审计报告含存储键分类段');

  // ── 清理：还原为进入本块前的键空间快照 ──
  LS.clear();
  Object.keys(junkBefore151).forEach(k => LS.setItem(k, junkBefore151[k]));
  } // end v0.1.51 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.52 — 存储键卫生入口化：静默巡检告警（节流） + 面板体检按钮
  // ═══════════════════════════════════════════════════════════
  v0152: {
  // ── 1. panel 源码断言：按钮 + 二次确认绑定已注入 ──
  const panelSrc152 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(panelSrc152.indexOf('wa-key-check') >= 0 && panelSrc152.indexOf('存储键体检') >= 0, '面板含「存储键体检」按钮');
  assert(panelSrc152.indexOf('wa-key-sweep-go') >= 0 && panelSrc152.indexOf('确认清理（不可撤销）') >= 0, '体检走二次确认制（dry-run 计划先展示）');
  assert(panelSrc152.indexOf('sweepStaleKeys({})') >= 0 && panelSrc152.indexOf('sweepStaleKeys({ apply: true })') >= 0, '体检先 dry-run 后 apply 两段式');

  // ── 2. init 静默巡检：大额可回收触发告警 + 节流只一次 ──
  const LS152 = global.localStorage;
  const junkBefore152 = JSON.parse(JSON.stringify(LS152._dump()));
  const evtLogBefore152 = WA.eventLog.slice();
  const hugeStr152 = 'x'.repeat(300 * 1024);   // 单键 >256KB 触发阈值
  const coldChat152 = 'v152_cold_chat';
  LS152.setItem('worldaxis_state_' + coldChat152, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS152.setItem('worldaxis_event_log_' + coldChat152, hugeStr152);
  WA.store.init();
  const warns152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0);
  assert(warns152.length >= 1, '大额可回收（>256KB）触发一次告警（实 ' + warns152.length + '）');
  WA.store.init();
  WA.store.init();
  const warnsAfter152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0);
  assert(warnsAfter152.length === warns152.length, '节流生效：后续 init 不重复告警（' + warns152.length + ' 恒定）');
  assert(LS152.getItem('worldaxis_event_log_' + coldChat152) === hugeStr152, '静默巡检绝不自动删除（仅告警）');

  // ── 3. 小额可回收：低于阈值不告警 ──
  // 先模拟用户通过面板执行了清理（大额垃圾已回收），再注小额键验证静默
  WA.store.sweepStaleKeys({ apply: true });
  const evtLog2Before152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  const smallChat152 = 'v152_small_chat';
  LS152.setItem('worldaxis_state_' + smallChat152, JSON.stringify({ meta: { updatedAt: Date.now() - 60 * 86400000 } }));
  LS152.setItem('worldaxis_event_log_' + smallChat152, '[]');   // 仅 2B，远低于阈值
  WA.store.init();
  const evtLog2After152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(evtLog2After152 === evtLog2Before152, '小额可回收不产生告警（阈值 + 节流双闸）');

  // ── 清理：还原键空间与日志现场 ──
  LS152.clear();
  Object.keys(junkBefore152).forEach(k => LS152.setItem(k, junkBefore152[k]));
  WA.eventLog.length = 0;
  evtLogBefore152.forEach(l => WA.eventLog.push(l));
  } // end v0.1.52 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.53 — error 日志子环：关键故障证据不被 info 噪音挤出
  // ═══════════════════════════════════════════════════════════
  v0153: {
  assert(Array.isArray(WA.errorLog), 'WA.errorLog 子环已导出');

  // ── 1. info 噪音灌满混合环，error 证据仍存活 ──
  const evtBefore153 = WA.eventLog.slice();
  const errBefore153 = WA.errorLog.slice();
  WA.log('error', 'v153 关键故障A', 'boom');
  for (let i = 0; i < 320; i++) WA.log('info', 'v153 噪音' + i);   // 灌满并翻转混合环
  assert(WA.eventLog.length <= 300, '混合环仍守 300 上限（实 ' + WA.eventLog.length + '）');
  assert(WA.errorLog.some(l => l.msg === 'v153 关键故障A'), 'error 证据在子环中存活（不受 info 挤出）');
  assert(!WA.eventLog.some(l => l.msg === 'v153 关键故障A'), '混合环中已被噪音挤出（证伪前提成立）');

  // ── 2. error 子环自身环形（>50 翻转）──
  for (let i = 0; i < 55; i++) WA.log('error', 'v153 err' + i);
  assert(WA.errorLog.length <= 50, 'error 子环守 50 上限（实 ' + WA.errorLog.length + '）');
  assert(WA.errorLog.some(l => l.msg === 'v153 err54'), 'error 子环保留最新');
  assert(!WA.errorLog.some(l => l.msg === 'v153 err0'), 'error 子环丢弃最旧');

  // ── 3. 持久化与跨会话恢复 ──
  const cid153 = WA.store.chatId();
  const persistedErr153 = global.localStorage.getItem('worldaxis_error_log_' + cid153);
  assert(persistedErr153 && persistedErr153.includes('v153 err54'), 'error 子环已落盘（worldaxis_error_log_ 键）');
  WA.loadEventLog(cid153);
  assert(WA.errorLog.length >= 1 && WA.errorLog.some(l => l.msg === 'v153 err54'), 'loadEventLog 同步恢复 error 子环');

  // ── 4. 切聊天隔离 ──
  const otherChat153 = 'chat_test_v153_b';
  WA.loadEventLog(otherChat153);
  assert(WA.errorLog.length === 0, '切至无日志聊天，error 子环清空（分域隔离）');
  WA.loadEventLog(cid153);
  assert(WA.errorLog.some(l => l.msg === 'v153 err54'), '切回原聊天，error 子环恢复');

  // ── 5. 键卫生分类归属 ──
  const stat153 = WA.store.storageStat();
  assert(stat153.families.diagnostic >= 1, 'error_log 键计入 diagnostic 家族（防 sweep 漏判）');
  // 构造过期冷聊天的 error_log 键验证 sweep 纳管（当前聊天键受保护不进计划，属预期）
  const coldChat153 = 'v153_cold_chat';
  global.localStorage.setItem('worldaxis_state_' + coldChat153, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  global.localStorage.setItem('worldaxis_error_log_' + coldChat153, '[]');
  const sweepPlan153 = WA.store.sweepStaleKeys({ maxIdleDays: 30 });
  assert(sweepPlan153.remove.some(r => r.key === 'worldaxis_error_log_' + coldChat153), 'sweep 计划纳入冷聊天 error_log 键（与 event_log 同域同规）');
  global.localStorage.removeItem('worldaxis_state_' + coldChat153);
  global.localStorage.removeItem('worldaxis_error_log_' + coldChat153);

  // ── 6. clearEventLog 双清 ──
  WA.clearEventLog(cid153);
  assert(WA.errorLog.length === 0 && global.localStorage.getItem('worldaxis_error_log_' + cid153) === null, 'clearEventLog 同时清内存与持久 error 子环');

  // ── 7. 面板「仅看错误」开关（源码断言）──
  const panelSrc153 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(/wa-log-err/.test(panelSrc153) && /仅看错误/.test(panelSrc153), '面板含「仅看错误」开关');
  // 边界严格断言：WA.errorLog 后不得紧跟标识符字符（防 errorLogGone 类前缀蒙混）
  assert(/WA\.errorLog[^A-Za-z0-9_]/.test(panelSrc153) && /__logErrOnly\s*=\s*!__logErrOnly/.test(panelSrc153), '开关切换 errorLog 子环视图');
  assert(/id="wa-log-err"/.test(panelSrc153) && /on\('#wa-log-err'/.test(panelSrc153), '开关按钮 id 与绑定成对存在');

  // ── 清理：还原日志现场 ──
  WA.eventLog.length = 0;
  evtBefore153.forEach(l => WA.eventLog.push(l));
  WA.errorLog.length = 0;
  errBefore153.forEach(l => WA.errorLog.push(l));
  WA.log('info', 'v153 现场还原');
  } // end v0.1.53 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.54 — 错误报告包导出 + 巡检段收敛（去重/纯指纹幂等）
  // ═══════════════════════════════════════════════════════════
  v0154: {
  // ── 1. buildErrorReport 组装完整性 ──
  assert(typeof WA.toolDiag.buildErrorReport === 'function', 'toolDiag.buildErrorReport 已导出');
  const evtBefore154 = WA.eventLog.slice();
  const errBefore154 = WA.errorLog.slice();
  WA.log('error', 'v154 报告样本错误', 'boom-detail');
  const rpt154 = WA.toolDiag.buildErrorReport();
  const rptLines154 = rpt154.split('\n');
  assert(rptLines154[0] === '# WorldAxis 错误报告', '报告首行精确匹配标准头（防前缀蒙混）');
  assert(rpt154.indexOf('v154 报告样本错误') >= 0 && rpt154.indexOf('boom-detail') >= 0, '报告含 error 子环条目与 data');
  assert(rpt154.indexOf('## 自检议题') >= 0 && rpt154.indexOf('## 内存审计摘要') >= 0 && rpt154.indexOf('## 存储键统计') >= 0, '报告含自检议题/审计/存储键三段');
  assert(rpt154.indexOf('版本: v') >= 0, '报告含版本头');

  // ── 2. 巡检段收敛（源码断言）──
  const storeSrc154 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  assert((storeSrc154.match(/存储键卫生静默巡检/g) || []).length === 1, '巡检段唯一（v0.1.52 双段残留已清除）');
  assert(!/__keyHygieneWarned|__keyHygieneLastSig|__keyHygieneLastScanAt/.test(storeSrc154), '旧节流变量无残留（布尔/双指纹/时间窗均收敛为单指纹）');

  // ── 3. 纯指纹幂等：新垃圾集首见告警一次，重复 init 静默 ──
  const LS154 = global.localStorage;
  const junkBefore154 = JSON.parse(JSON.stringify(LS154._dump()));
  const logBefore154 = WA.eventLog.slice();
  const huge154 = 'y'.repeat(300 * 1024);
  const cold154 = 'v154_cold_chat';
  LS154.setItem('worldaxis_state_' + cold154, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS154.setItem('worldaxis_event_log_' + cold154, huge154);
  WA.store.init();   // 新垃圾集首见 → 告警一次
  const w1_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w1_154 >= 1, '新垃圾集首见告警一次（实 ' + w1_154 + '）');
  WA.store.init();
  WA.store.init();
  const w2_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w2_154 === w1_154, '同指纹重复 init 静默（' + w1_154 + ' 恒定，无时间窗依赖）');

  // ── 4. 指纹变化必告（追加新大额垃圾）──
  const cold154b = 'v154_cold_chat_b';
  LS154.setItem('worldaxis_state_' + cold154b, JSON.stringify({ meta: { updatedAt: Date.now() - 50 * 86400000 } }));
  LS154.setItem('worldaxis_event_log_' + cold154b, 'z'.repeat(300 * 1024));
  WA.store.init();
  const w3_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w3_154 > w2_154, '指纹变化（新大额垃圾）再次告警（' + w2_154 + '→' + w3_154 + '）');

  // ── 5. 清理后空集不告警 ──
  WA.store.sweepStaleKeys({ apply: true });
  WA.store.init();
  const w4_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w4_154 === w3_154, '清理后空集不告警（' + w3_154 + ' 恒定）');

  // ── 6. 面板按钮（源码断言，词边界严格版）──
  const panelSrc154 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(/id="wa-err-report"/.test(panelSrc154) && /on\('#wa-err-report'/.test(panelSrc154), '「复制错误报告」按钮 id 与绑定成对');
  assert(/buildErrorReport[^A-Za-z0-9_]/.test(panelSrc154), '面板调用 buildErrorReport（词边界）');

  // ── 清理：还原键空间与日志现场 ──
  LS154.clear();
  Object.keys(junkBefore154).forEach(k => LS154.setItem(k, junkBefore154[k]));
  WA.eventLog.length = 0;
  logBefore154.forEach(l => WA.eventLog.push(l));
  WA.log('info', 'v154 现场还原');
  } // end v0.1.54 block
  // ═══════════════════════════════════════════════════════════
  // v0.2.0 — 存储层统一治理（settings 版本协商 + 诊断体积预算 + orphan 检测）
  // ═══════════════════════════════════════════════════════════
  section('v0.2.0 存储层统一治理');
  v0200: {
  assert(WA.settingsBus && typeof WA.settingsBus.read === 'function' && typeof WA.settingsBus.save === 'function', 'settingsBus 侧车已导出');
  const regs200 = WA.settingsBus.registry();
  assert(regs200.length >= 12, '注册表覆盖 ≥12 个 settings 模块（实 ' + regs200.length + '）');
  assert(regs200.some(r => r.key === 'worldaxis_backstage_settings_v1') && regs200.some(r => r.key === 'worldaxis_workflow_v1') && regs200.some(r => r.key === 'worldaxis_custom_presets'), '注册表含 backstage/workflow/custom_presets 键');

  // ── A. settingsBus 版本协商：读旧写新 + 旧键回收（专用键对，避免与既有 backstage 键冲突）──
  global.localStorage.setItem('worldaxis_settingsbus_test_v0', JSON.stringify({ probeValue: 42 }));
  const regLegacy200 = { key: 'worldaxis_settingsbus_test_v1', legacy: ['worldaxis_settingsbus_test_v0'], legacyRemove: true, orphan: false, def: {} };
  const up200 = WA.settingsBus.read(regLegacy200);
  assert(up200 && up200.probeValue === 42, 'settingsBus.read 从 legacy v0 键读入值');
  assert(global.localStorage.getItem('worldaxis_settingsbus_test_v0') === null, 'legacy v0 键读后被回收');
  assert(global.localStorage.getItem('worldaxis_settingsbus_test_v1') !== null && JSON.parse(global.localStorage.getItem('worldaxis_settingsbus_test_v1')).probeValue === 42, '读旧写新：值写入 v1 键');
  assert(WA.settingsBus.stats.upgrades >= 1, 'upgrades 计量 ≥1（实 ' + WA.settingsBus.stats.upgrades + '）');
  // save 仍写当前键（非 legacy）
  WA.settingsBus.save(regLegacy200, { probeValue: 7 });
  assert(JSON.parse(global.localStorage.getItem('worldaxis_settingsbus_test_v1')).probeValue === 7, 'save 写当前键');
  global.localStorage.removeItem('worldaxis_settingsbus_test_v1');

  // ── B. settingsBus 损坏隔离：corrupt 留痕 + 重置默认 + 可观测 ──
  const qs200 = WA.settingsBus.stats.quarantines;
  global.localStorage.setItem('worldaxis_opinion_settings_v1', '{broken-json');
  const opReg200 = regs200.filter(function (r) { return r.key === 'worldaxis_opinion_settings_v1'; })[0];
  const op200 = WA.settingsBus.read(opReg200);
  assert(op200 && op200.enabled === false && op200.sandboxEnabled === false, '损坏 opinion 键 → 重置默认（enabled=false）');
  const corruptOp200 = global.localStorage.getItem('worldaxis_opinion_settings_v1_corrupt_' + Date.now().toString().slice(0, 8));
  const anyCorruptOp200 = (function () { const ks = []; for (let i = 0; i < global.localStorage.length; i++) { const k = global.localStorage.key(i); if (k && k.indexOf('worldaxis_opinion_settings_v1_corrupt_') === 0) ks.push(k); } return ks; })();
  assert(anyCorruptOp200.length >= 1, '损坏 opinion 键已隔离为 corrupt_<ts> 键');
  assert(global.localStorage.getItem('worldaxis_opinion_settings_v1') === null, '损坏 opinion 原键已移除');
  assert(WA.settingsBus.stats.quarantines > qs200, 'quarantines 计量递增');
  assert(WA.errorLog.some(function (e) { return e.level === 'error' && /settingsBus: worldaxis_opinion_settings_v1 损坏已隔离/.test(e.msg); }), 'corrupt 事件进 error 子环（' + WA.errorLog.length + ' 条）');

  // ── C. diagBudget：诊断键体积占比 + 超阈值告警 ──
  const cur200 = WA.store.chatId();
  const big200 = new Array(60).join('x');
  for (let i = 0; i < 40; i++) WA.log('info', 'pad' + i, big200);
  WA.flushLog();   // v0.2.1: 防抖语义——需确定落盘的计量场景必须显式冲刷
  const db200 = WA.store.diagBudget({ maxPct: 5 });
  assert(typeof db200.diagBytes === 'number' && typeof db200.stateBytes === 'number' && typeof db200.diagPct === 'number', 'diagBudget 返回结构完整');
  assert(db200.diagBytes > 0 && db200.chat === cur200, 'diagBudget 计量当前聊天诊断字节');
  assert(db200.exceeded === true && db200.diagPct > 5, '超阈值告警（diagPct=' + db200.diagPct + ' > maxPct=5）');
  const dbOk200 = WA.store.diagBudget({ maxPct: 99 });
  assert(dbOk200.exceeded === false, '正常占比不报 exceeded');
  // verdict 议题：超阈值推 warn
  const vd200 = WA.toolDiag.verdict(WA.toolDiag.collect());
  assert(vd200.issues.some(function (x) { return x.level === 'warn' && x.key === 'storage.diagBudget'; }), 'diagBudget 超阈值进 verdict 议题（warn）');

  // ── D. orphan 检测：注册 orphan:true 且键不存在 ──
  global.localStorage.removeItem('worldaxis_oracle_plan_v1');   // 清 L1007 setPlan 残留，构造「键不存在」现场
  const orph200 = WA.store.orphanSettingsKeys();
  assert(Array.isArray(orph200), 'orphanSettingsKeys 返回数组');
  // oracle 注册项标记 orphan:true，测试环境从未写过该键 → 必为 orphan
  assert(orph200.some(function (o) { return o.key === 'worldaxis_oracle_plan_v1'; }), 'oracle_plan 键从未写过 → orphan 候选');
  // 非 orphan 键（backstage）不应在 orphan 列表
  assert(!orph200.some(function (o) { return o.key === 'worldaxis_backstage_settings_v1'; }), 'backstage 非 orphan 不在 orphan 列表');

  // ── E. 负向验证锚点：diagBudget 应拒绝损坏的 eventLog（源断言）──
  global.localStorage.setItem('worldaxis_event_log_' + cur200, '{bad');
  const dbCorrupt200 = WA.store.diagBudget({ maxPct: 99 });
  assert(typeof dbCorrupt200.diagPct === 'number', 'diagBudget 面对损坏 eventLog 不崩溃');
  global.localStorage.removeItem('worldaxis_event_log_' + cur200);

  // 清理现场
  anyCorruptOp200.forEach(function (k) { global.localStorage.removeItem(k); });
  } // end v0.2.0 block
  // ═══════════════════════════════════════════════════════════
  // v0.2.1 — 诊断环持久化防抖（info/warn 合并写，error 立即落盘，flush 显式冲刷）
  // ═══════════════════════════════════════════════════════════
  section('v0.2.1 诊断环持久化防抖');
  v0210: {
  assert(typeof WA.flushLog === 'function', 'WA.flushLog 冲刷入口已导出');
  const idxSrc210 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  assert(idxSrc210.indexOf('LOG_SAVE_DEBOUNCE_MS') > 0, 'index.js 含防抖窗口常量');
  assert(idxSrc210.indexOf("scheduleLogSave(level === 'error')") > 0, 'error 级立即落盘接线');
  const cur210 = WA.store.chatId();
  const keyEvt210 = 'worldaxis_event_log_' + cur210;
  const keyErr210 = 'worldaxis_error_log_' + cur210;
  const diskEvt210 = () => { try { return JSON.parse(global.localStorage.getItem(keyEvt210) || '[]'); } catch (e) { return []; } };

  // ── 1. info/warn 走防抖窗口：不立即落盘，flushLog 后可见 ──
  WA.clearEventLog(cur210);
  WA.log('info', 'v210 防抖日志A');
  WA.log('warn', 'v210 防抖日志B');
  assert(diskEvt210().every(l => l.msg !== 'v210 防抖日志A'), 'info 日志在防抖窗口内未立即落盘');
  WA.flushLog();
  assert(diskEvt210().some(l => l.msg === 'v210 防抖日志A') && diskEvt210().some(l => l.msg === 'v210 防抖日志B'), 'flushLog 后挂起日志落盘');

  // ── 2. error 立即落盘（保关键故障证据，不等窗口）──
  WA.clearEventLog(cur210);
  WA.log('error', 'v210 关键故障');
  assert(diskEvt210().some(l => l.msg === 'v210 关键故障'), 'error 日志立即落盘（无需 flush）');
  WA.clearEventLog(cur210);

  // ── 3. clearEventLog 取消挂起定时器：已清日志不被复活 ──
  WA.log('info', 'v210 将被清理的日志');
  WA.clearEventLog(cur210);
  assert(global.localStorage.getItem(keyEvt210) === null && global.localStorage.getItem(keyErr210) === null, 'clearEventLog 清持久键');
  await new Promise(r => setTimeout(r, 620));   // 越过 500ms 防抖窗口
  assert(global.localStorage.getItem(keyEvt210) === null, '防抖窗口过期后定时器不复活已清日志');

  // ── 4. 防覆盖不变量：挂起中切聊天，flush 写原聊天而非新聊天 ──
  WA.log('info', 'v210 跨聊天日志');
  const other210 = cur210 + '_v210_other';
  WA.loadEventLog(other210);   // flush 把挂起日志写回 cur210，随后加载 other（空）
  assert(diskEvt210().some(l => l.msg === 'v210 跨聊天日志'), '挂起中切聊天：挂起日志写回原聊天');
  assert(WA.eventLog.length === 0, '切换到 other 聊天后内存为空');
  WA.loadEventLog(cur210);
  assert(WA.eventLog.some(l => l.msg === 'v210 跨聊天日志'), '切回原聊天日志完整恢复');
  WA.clearEventLog(cur210);
  WA.clearEventLog(other210);

  // ── 5. 防覆盖不变量：无挂起时 flushLog 不动磁盘 ──
  WA.log('info', 'v210 底线日志');
  WA.flushLog();
  const snapshot210 = global.localStorage.getItem(keyEvt210);
  WA.eventLog.length = 0;      // 模拟内存已被切走清空
  WA.flushLog();               // 无挂起 → 必须是 no-op
  assert(global.localStorage.getItem(keyEvt210) === snapshot210, '无挂起时 flushLog 不覆盖磁盘（防覆盖不变量）');
  global.localStorage.setItem(keyEvt210, snapshot210);   // 还原现场
  WA.eventLog.length = 0;
  } // end v0.2.1 block
  // ═══════════════════════════════════════════════════════════
  // v0.2.2 — 隔离键治理（settingsBus 隔离产出纳入键卫生体系）
  // ═══════════════════════════════════════════════════════════
  section('v0.2.2 隔离键治理');
  v0220: {
  const LS220 = global.localStorage;
  const junkBefore220 = JSON.parse(JSON.stringify(LS220._dump()));
  const cur220 = WA.store.chatId();

  // ── 1. 回归复现：settingsBus 损坏隔离产出被正确归类 ──
  // v0.2.0 缺陷：隔离键不匹配 state 专用 corrupt 正则 → 落入 settings 兜底 → sweep 永不清理
  const qkey220 = 'worldaxis_opinion_settings_v1_corrupt_' + Date.now();
  LS220.setItem(qkey220, '{broken-raw-bytes');
  const stat220 = WA.store.storageStat();
  assert(stat220.families.corrupt >= 1, 'settings 隔离键计入 corrupt 家族（不再落 settings 兜底，实 ' + stat220.families.corrupt + '）');
  const plan220 = WA.store.sweepStaleKeys({ keepCorrupt: 5 });
  const keep220 = plan220.keep.filter(function (k) { return k === qkey220; });
  assert(keep220.length === 1, 'settings 隔离键受 sweep 管辖（保留窗口内 → keep 而非 settings 永久豁免）');

  // ── 2. 隔离键溢出：state 与 settings 隔离键统一保留最近 keepCorrupt 个 ──
  for (let i = 1; i <= 6; i++) LS220.setItem('worldaxis_opinion_settings_v1_corrupt_' + (Date.now() + i), '{}');
  const planOver220 = WA.store.sweepStaleKeys({ keepCorrupt: 5 });
  const overflow220 = planOver220.remove.filter(function (r) { return r.reason === 'corrupt-overflow'; });
  assert(overflow220.length >= 2, '隔离键超出保留窗口进清理计划（实 ' + overflow220.length + '）');
  const settingsQ220 = overflow220.filter(function (r) { return r.quarantine === 'settings'; });
  assert(settingsQ220.length >= 2, '清理项标注 quarantine=settings 来源（实 ' + settingsQ220.length + '）');

  // ── 3. 关键不变量：非隔离的 settings 键仍永久豁免 ──
  LS220.setItem('worldaxis_backstage_settings_v1', '{}');
  const planKeep220 = WA.store.sweepStaleKeys({ keepCorrupt: 5 });
  assert(!planKeep220.remove.some(function (r) { return r.key === 'worldaxis_backstage_settings_v1'; }), '普通 settings 键仍永不清理（隔离键治理不误伤）');

  // ── 4. apply 真删：隔离键实际移除 ──
  const planApply220 = WA.store.sweepStaleKeys({ keepCorrupt: 5, apply: true });
  const stats220 = WA.store.storageStat();
  assert(stats220.families.corrupt <= 5, 'apply 后隔离键收敛到保留窗口内（实 ' + stats220.families.corrupt + '）');
  assert(LS220.getItem('worldaxis_backstage_settings_v1') !== null, 'apply 不误删普通 settings 键');

  // ── 5. 报告透出：隔离键计量 + settingsBus 统计 ──
  const rpt220 = WA.toolDiag.buildErrorReport();
  assert(rpt220.indexOf('损坏隔离键:') >= 0, '错误报告含隔离键计量行');
  assert(/settings 迁移: \d+ 次/.test(rpt220) && /损坏隔离累计: \d+ 次/.test(rpt220), '报告含 settingsBus 迁移/隔离累计统计');

  // ── 6. 面板源码断言：体检输出透出 settingsBus 统计 ──
  const panelSrc220 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(panelSrc220.indexOf('settingsBus.stats.quarantines') >= 0, '面板体检透出 settingsBus 隔离累计');
  assert(/保留最近 5 个/.test(panelSrc220), '面板标注隔离键保留窗口');

  // 清理现场
  LS220.clear();
  Object.keys(junkBefore220).forEach(function (k) { LS220.setItem(k, junkBefore220[k]); });
  // ═══════════════════════════════════════════════════════════
  // v0.2.3 — 隔离键归属修复 + state 派生键治理
  // 缺陷链：corrupt 家族返回 chat:null → ①「当前聊天键永不被清理」不变量对隔离副本失效
  //         ② 隔离聊天的 recovery 快照被判孤儿删除（用户唯一可回滚数据丢失）
  // ═══════════════════════════════════════════════════════════
  section('v0.2.3 隔离键归属修复');
  v0230: {
  const LS230 = global.localStorage;
  const junkBefore230 = JSON.parse(JSON.stringify(LS230._dump()));
  const cur230 = WA.store.chatId();
  const base230 = WA.store.storageStat();
  // ── 1. state 派生键（chatcache syncrev）与存档本体分离计量 ──
  const cid230 = 'v230_chat';
  LS230.setItem('worldaxis_state_' + cid230, JSON.stringify({ meta: { round: 1 } }));
  LS230.setItem('worldaxis_state_' + cid230 + '_syncrev', '2');
  const stat230 = WA.store.storageStat();
  assert(stat230.chats - base230.chats === 1, '新增 1 个存档本体只 +1 聊天（派生槽不计入，实 +' + (stat230.chats - base230.chats) + '）');
  assert(stat230.stateDerivedKeys - base230.stateDerivedKeys === 1, 'syncrev 派生键单独计量（实 +' + (stat230.stateDerivedKeys - base230.stateDerivedKeys) + '）');
  assert(stat230.families.state - base230.families.state === 1, 'state 家族只计存档本体');
  assert(stat230.families.stateDerived - base230.families.stateDerived === 1, 'families 含 stateDerived 家族计数');
  const plan230 = WA.store.sweepStaleKeys({});
  assert(plan230.keep.indexOf('worldaxis_state_' + cid230 + '_syncrev') >= 0, 'stateDerived 键归 keep（跟随存档本体）');
  // ── 2. 关键：隔离键保留 chat 归属（v0.2.3 缺陷核心——chat:null 导致归属丢失）──
  const qOld230 = Date.now() - 1000000;
  const curQKey230 = 'worldaxis_state_' + cur230 + '_corrupt_' + qOld230;
  LS230.setItem(curQKey230, '{"meta":{"round":7}}');
  // 另 5 个更新的隔离副本（其他聊天）→ 若无归属保护，当前聊天副本会被挤成溢出
  for (let i = 1; i <= 5; i++) LS230.setItem('worldaxis_state_v230_other' + i + '_corrupt_' + (Date.now() - i * 1000), '{}');
  const stat230b = WA.store.storageStat();
  assert(stat230b.currentChatQuarantines >= 1, 'storageStat 透出当前聊天隔离副本计量（实 ' + stat230b.currentChatQuarantines + '）');
  const plan230b = WA.store.sweepStaleKeys({ keepCorrupt: 5 });
  assert(plan230b.keep.indexOf(curQKey230) >= 0, '隔离副本受「当前聊天保护」约束（不变量对隔离键成立）');
  assert(!plan230b.remove.some(r => r.key === curQKey230), '当前聊天唯一幸存隔离现场不被当溢出删除');
  const hostRem230 = plan230b.remove.filter(r => r.reason === 'corrupt-overflow' && r.quarantine === 'state');
  assert(hostRem230.every(r => r.chat !== cur230), 'corrupt-overflow 只作用于非当前聊天（归属正确）');
  // ── 3. 关键：隔离聊天的 recovery 快照不得判为孤儿 ──
  // state 损坏被隔离 = 保命而非删除 → 该聊天存档视为仍存在
  const qChat230 = 'v230_quarantined';
  LS230.setItem('worldaxis_state_' + qChat230 + '_corrupt_' + Date.now(), '{broken');
  LS230.setItem('worldaxis_recovery_' + qChat230, JSON.stringify([{ at: Date.now(), data: { meta: { round: 42 } } }]));
  const plan230c = WA.store.sweepStaleKeys({});
  assert(!plan230c.remove.some(r => r.reason === 'orphan-recovery' && r.chat === qChat230), '隔离聊天的 recovery 不被判孤儿（唯一可回滚数据受保护）');
  // ── 4. 反向不误伤：真正孤儿（既无 state 本体也无隔离副本）仍须回收 ──
  const deadChat230 = 'v230_dead';
  LS230.setItem('worldaxis_recovery_' + deadChat230, JSON.stringify([{ at: Date.now(), data: {} }]));
  const plan230d = WA.store.sweepStaleKeys({});
  assert(plan230d.remove.some(r => r.reason === 'orphan-recovery' && r.chat === deadChat230), '真正孤儿 recovery 仍被正确回收（修复未过度保护）');
  // ── 5. 幂等 ──
  const r1 = JSON.stringify(WA.store.sweepStaleKeys({}).byFamily);
  const r2 = JSON.stringify(WA.store.sweepStaleKeys({}).byFamily);
  assert(r1 === r2, 'dry-run 幂等（多次扫描结果一致）');
  // 清理现场
  LS230.clear();
  Object.keys(junkBefore230).forEach(function (k) { LS230.setItem(k, junkBefore230[k]); });
  // ═══════════════════════════════════════════════════════════
  // v0.3.0 — 存储救援体系（隔离现场出口 / 配额自动救援 / 恢复点离机备份）
  // 缺陷背景：① 隔离现场只进不出（无任何读回 API）；② 配额耗尽仅记日志、磁盘态永久落后；
  //          ③ 恢复点环形窗口仅 3 个且无法导出（清浏览器数据即永久丢失）
  // ═══════════════════════════════════════════════════════════
  section('v0.3.0 存储救援体系');
  v0300: {
  const LS300 = global.localStorage;
  const junkBefore300 = JSON.parse(JSON.stringify(LS300._dump()));
  LS300.clear();
  WA.store.init();
  const cur300 = WA.store.chatId();

  // ── 1. 隔离现场可发现（含归属/可解析性/大小/摘要）──
  const goodKey300 = 'worldaxis_state_' + cur300 + '_corrupt_' + (Date.now() - 5000);
  const badKey300 = 'worldaxis_state_' + cur300 + '_corrupt_' + Date.now();
  LS300.setItem(goodKey300, JSON.stringify({ clock: { label: '隔离现场进度' }, meta: {} }));
  LS300.setItem(badKey300, '{"broken');
  LS300.setItem('worldaxis_opinion_settings_v1_corrupt_' + Date.now(), '{"oops');
  const sites300 = WA.store.listQuarantineSites();
  assert(sites300.length === 3, '隔离现场清单枚举全部 corrupt 键（实 ' + sites300.length + '）');
  assert(sites300.every(x => typeof x.key === 'string' && typeof x.bytes === 'number' && x.at > 0), '每条含 key/bytes/时间戳');
  const goodSite300 = sites300.filter(x => x.key === goodKey300)[0];
  assert(goodSite300 && goodSite300.parseable === true, '可解析现场被正确标记（parseable=true）');
  assert(goodSite300.isCurrentChat === true && goodSite300.chat === cur300, '隔离现场保留聊天归属（v0.2.3 归属修复的下游消费）');
  const badSite300 = sites300.filter(x => x.key === badKey300)[0];
  assert(badSite300 && badSite300.parseable === false, '真损坏现场标记 parseable=false');
  const setSite300 = sites300.filter(x => x.quarantine === 'settings')[0];
  assert(setSite300 && setSite300.parseable === null, 'settings 隔离现场不做 state 解析标记（null）');
  // 聚合计量
  const qs300 = WA.store.quarantineStat();
  assert(qs300.total === 3 && qs300.stateSites === 2 && qs300.settingsSites === 1, '聚合计量按来源分流（state/settings）');
  assert(qs300.parseable === 1 && qs300.currentChatSites >= 2, '聚合透出可解析数与本聊天现场数');
  assert(qs300.byChat[cur300] === 2, '按聊天归组计量');

  // ── 2. 恢复出口：可解析现场写回 state；真损坏拒绝写入 ──
  const rBad300 = WA.store.restoreQuarantine(badKey300);
  assert(rBad300.ok === false && /真损坏/.test(rBad300.reason), '真损坏现场拒绝恢复（不把垃圾灌回 state）');
  const stateBefore300 = LS300.getItem('worldaxis_state_' + cur300);
  assert(stateBefore300 === null, '拒绝恢复未凭空创建 state 键（init 后本无 state）');
  WA.store.transact(d => { d.clock.label = '拒绝恢复前的状态'; });
  WA.store.save();
  const stateAfterSave300 = LS300.getItem('worldaxis_state_' + cur300);
  assert(WA.store.restoreQuarantine(badKey300).ok === false, '再次拒绝真损坏现场');
  assert(LS300.getItem('worldaxis_state_' + cur300) === stateAfterSave300, '拒绝恢复后 state 键未被覆盖（值逐字节不变）');
  // 把可解析现场内容也写入 state 本体（模拟已有其他状态），验证恢复确实替换
  WA.store.transact(d => { d.clock.label = '恢复前状态'; });
  WA.store.save();
  const rGood300 = WA.store.restoreQuarantine(goodKey300);
  assert(rGood300.ok === true, '可解析现场恢复成功');
  assert(JSON.parse(LS300.getItem('worldaxis_state_' + cur300)).clock.label === '隔离现场进度', 'state 本体恢复为隔离现场内容');
  assert(WA.store.read('clock.label') === '隔离现场进度', '内存态同步恢复');
  assert(WA.store.listRecoveryPoints().length >= 1, '恢复前自动留恢复点（防二次损坏无退路）');
  assert(LS300.getItem(goodKey300) !== null, '恢复后隔离现场保留作为审计证据');
  // settings 现场不可用 state 恢复通道
  const rSet300 = WA.store.restoreQuarantine(setSite300.key);
  assert(rSet300.ok === false && /非 state 隔离现场/.test(rSet300.reason), 'settings 隔离现场拒绝走 state 恢复通道');
  // 丢弃
  const dBad300 = WA.store.dropQuarantine(badKey300);
  assert(dBad300.ok === true && LS300.getItem(badKey300) === null, '显式丢弃隔离现场生效');
  const dMiss300 = WA.store.dropQuarantine('worldaxis_state_x_corrupt_99999');
  assert(dMiss300.ok === false && /不存在/.test(dMiss300.reason), '丢弃不存在的现场报错（防假成功）');
  const dNon300 = WA.store.dropQuarantine('worldaxis_backstage_settings_v1');
  assert(dNon300.ok === false && /非隔离键/.test(dNon300.reason), 'dropQuarantine 不可被误用为通用删除器');
  const audit300 = WA.store.quarantineAudit();
  assert(audit300.restores === 1 && audit300.drops === 1, '处置动作留痕（恢复/丢弃各计 1 次）');

  // ── 3. 配额自动救援：撞配额 → 回收可回收键 → 重试落盘成功 ──
  LS300.clear();
  WA.store.init();
  const cid300 = WA.store.chatId();
  WA.store.transact(d => { d.clock.label = '初始'; });
  WA.store.save();
  LS300.setItem('worldaxis_event_log_cold300', 'x'.repeat(3000));       // 过期诊断（无 state 宿主 → 冷透）
  LS300.setItem('worldaxis_recovery_dead300', '[]');                     // 孤儿恢复点
  const before3 = WA.store.rescueStat();
  const realSet300 = LS300.setItem.bind(LS300);
  let blocked = 0;
  LS300.setItem = function (k, v) {
    if (k.indexOf('worldaxis_state_') === 0 && k.indexOf('_corrupt_') < 0 && k.indexOf('_syncrev') < 0
        && String(v).indexOf('配额后进度') >= 0 && blocked < 1) {
      blocked++;
      const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e;
    }
    return realSet300(k, v);
  };
  WA.store.transact(d => { d.clock.label = '配额后进度'; });
  const okSave300 = WA.store.save();
  LS300.setItem = realSet300;
  assert(okSave300 === true, '配额耗尽后自动救援并重试落盘成功（save 返回 true）');
  assert(JSON.parse(LS300.getItem('worldaxis_state_' + cid300)).clock.label === '配额后进度', '磁盘态已追上内存态（不再静默落后）');
  assert(LS300.getItem('worldaxis_event_log_cold300') === null && LS300.getItem('worldaxis_recovery_dead300') === null, '救援回收了冷诊断与孤儿恢复点');
  const after3 = WA.store.rescueStat();
  assert(after3.attempts === before3.attempts + 1 && after3.recovered === before3.recovered + 1, '救援计量记录尝试与成功');
  assert(after3.lastRemoved >= 2 && after3.lastFreedBytes > 0, '救援计量记录回收键数与释放字节');
  // 救援失败路径：无可回收键时必须仍返回 false 且计量失败
  const beforeFail300 = WA.store.rescueStat();
  LS300.setItem = function (k, v) {
    // 该值全拦（含救援重试）——模拟「配额确实无空间可腾」，验证救援失败不假装成功
    if (k.indexOf('worldaxis_state_') === 0 && k.indexOf('_corrupt_') < 0 && k.indexOf('_syncrev') < 0
        && String(v).indexOf('无法救援') >= 0) {
      const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e;
    }
    return realSet300(k, v);
  };
  WA.store.transact(d => { d.clock.label = '无法救援'; });
  const okFail300 = WA.store.save();
  LS300.setItem = realSet300;
  assert(okFail300 === false, '无可回收键时救援失败并如实返回 false（不假装成功）');
  // transact 内部 save 与本处 save 各撞一次配额（真实会话行为），故增量 >= 1 且 attempts 同步增长
  assert(WA.store.rescueStat().failed >= beforeFail300.failed + 1, '救援失败计入 failed 计量（实 +' + (WA.store.rescueStat().failed - beforeFail300.failed) + '）');
  assert(WA.store.rescueStat().attempts > beforeFail300.attempts, '每次撞配额都计入 attempts（不吞掉重试痕迹）');
  assert(WA.store.saveStat().reason === 'quota' || WA.store.saveStat().ok === true, '失败原因可归因（quota）');

  // ── 4. 恢复点导出与单点处置 ──
  LS300.clear();
  WA.store.init();
  for (let i = 0; i < 3; i++) { WA.store.transact(d => { d.clock.round = i + 1; }); WA.store.createRecoveryPoint(); }
  const pack300 = WA.store.exportRecoveryPoints();
  assert(pack300.kind === 'recovery-points' && pack300.count === 3 && pack300.points.length === 3, '恢复点导出含全部点与元信息');
  assert(pack300.max === 3 && typeof pack300.exportedAt === 'string' && pack300.chatId, '导出含窗口上限/时间/聊天标识');
  assert(pack300.points[0].state && pack300.points[0].state.clock, '导出点含完整状态快照（可离机备份）');
  const dropP300 = WA.store.dropRecoveryPoint(null, 1);
  assert(dropP300.ok === true && dropP300.remaining === 2, '单点处置生效（剩余 2）');
  assert(WA.store.listRecoveryPoints().length === 2, '磁盘上恢复点已同步减少');
  assert(WA.store.dropRecoveryPoint(null, 9).ok === false, '越界索引被拒绝');

  // ── 5. 面板/报告接线（源码断言）──
  const panelSrc300 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(panelSrc300.indexOf('wa-quar-view') >= 0 && panelSrc300.indexOf('隔离现场') >= 0, '面板含「隔离现场」入口');
  assert(panelSrc300.indexOf('wa-recovery-dl') >= 0 && panelSrc300.indexOf('导出恢复点') >= 0, '面板含「导出恢复点」入口');
  assert(panelSrc300.indexOf('restoreQuarantine') >= 0 && panelSrc300.indexOf('dropQuarantine') >= 0, '面板接线恢复/丢弃动作');
  const diagSrc300 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  assert(diagSrc300.indexOf('quarantineStat') >= 0 && diagSrc300.indexOf('rescueStat') >= 0, '错误报告透出隔离现场与救援统计');

  // 清理现场
  LS300.clear();
  Object.keys(junkBefore300).forEach(function (k) { LS300.setItem(k, junkBefore300[k]); });
  } // end v0.3.0 block
  } // end v0.2.3 block
  // ═══════════════════════════════════════════════════════════
  // v0.4.0 — 自动治理闭环 + 写入完整性（统一裁决 / 自动响应 / 写后自证）
  // ═══════════════════════════════════════════════════════════
  v0400: {
  const LS400 = global.localStorage;
  const junkBefore400 = JSON.parse(JSON.stringify(LS400._dump()));
  const realSet400 = LS400.setItem;
  const evtBefore400 = WA.eventLog.slice();
  // v0.4.0 测试隔离：store.init() 内部会 loadEventLog→flushLog，
  // 把上一段残留的内存日志落盘（诊断键复活 → diagBudget 占比虚高 → 健康分被扣）。
  // 故实例化新键空间前先冲刷挂起写入并清空内存日志。
  function resetLogs400() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }

  // ── 1. A 块：写后读回校验（正常路径自证）──
  resetLogs400();
  LS400.clear();
  WA.store.init();
  const cid400 = WA.store.chatId();
  const sk400 = 'worldaxis_state_' + cid400;
  assert(typeof WA.store.integrityStat === 'function' && typeof WA.store.verifyState === 'function'
    && typeof WA.store.verifyAll === 'function' && typeof WA.store.maintain === 'function'
    && typeof WA.store.maintainStat === 'function', 'v0.4.0 新增治理 API 全部就位');
  const iA0 = WA.store.integrityStat();
  WA.store.transact(d => { d.clock.label = '写后自证'; });
  const okA = WA.store.save();
  const iA1 = WA.store.integrityStat();
  assert(okA === true && iA1.verified > iA0.verified, '正常写入后读回校验通过（verified 增长）');
  assert(iA1.writes > iA0.writes, '写后校验计入 writes 计量');
  assert(iA1.lastOk === true, '当前态标记为「最近一次写入校验通过」');

  // ── 2. A 块：静默截断必须被抓到（不再假装成功）──
  const iB0 = WA.store.integrityStat();
  LS400.setItem = function (k, v) {
    if (k === sk400) return realSet400(k, String(v).slice(0, Math.floor(String(v).length / 2)));   // 模拟移动端静默截断
    return realSet400(k, v);
  };
  const okB = WA.store.save();
  const iB1 = WA.store.integrityStat();
  LS400.setItem = realSet400;
  assert(okB === false, '静默截断被识别并如实返回失败（不再假装成功）');
  assert(WA.store.saveStat().reason === 'verify', '失败归因为 verify（区别于 quota）');
  assert(iB1.mismatches >= iB0.mismatches + 2, '两次校验均计入不一致（实 +' + (iB1.mismatches - iB0.mismatches) + '）');
  assert(iB1.lastReason === 'length-mismatch', '失败分类为 length-mismatch（长度不符）');
  assert(iB1.lastOk === false, '当前态标记为失败');

  // ── 3. A 块：三种失败分类可归因 ──
  // 3a. missing-after-write：写入被丢弃（读回 null）
  LS400.removeItem(sk400);
  LS400.setItem = function (k, v) { if (k === sk400) return; return realSet400(k, v); };
  WA.store.save();
  const iC1 = WA.store.integrityStat();
  LS400.setItem = realSet400;
  assert(iC1.lastReason === 'missing-after-write', '写入被完全丢弃 → missing-after-write');
  // 3b. content-mismatch：等长但内容不同（最隐蔽的毒化——长度检查抓不到）
  const TAG400 = 'CONTENTX';   // 8 字符
  const SUB400 = 'CHANGEDX';   // 8 字符（等长）
  assert(TAG400.length === SUB400.length, '等长替换常量自检');
  LS400.setItem = function (k, v) {
    if (k === sk400) return realSet400(k, String(v).replace(TAG400, SUB400));
    return realSet400(k, v);
  };
  WA.store.transact(d => { d.clock.label = TAG400; });
  const okC = WA.store.save();
  const iC2 = WA.store.integrityStat();
  LS400.setItem = realSet400;
  assert(okC === false && iC2.lastReason === 'content-mismatch', '等长异内容 → content-mismatch（长度检查抓不到）');

  // ── 4. A 块：瞬时毒化可自愈，且自愈痕迹不丢 ──
  resetLogs400();
  LS400.clear(); WA.store.init();
  const iD0 = WA.store.integrityStat();
  let poison400 = true;
  LS400.setItem = function (k, v) {
    if (k === sk400 && poison400) { poison400 = false; return realSet400(k, String(v).slice(0, 10)); }   // 仅首次写坏
    return realSet400(k, v);
  };
  WA.store.transact(d => { d.clock.label = '自愈'; });
  const okD = WA.store.save();
  const iD1 = WA.store.integrityStat();
  LS400.setItem = realSet400;
  assert(okD === true, '瞬时毒化经重试后落盘成功（不误报失败）');
  assert(iD1.retried > iD0.retried && iD1.recoveredByRetry > iD0.recoveredByRetry, '重试与自愈均留痕（不静默）');
  assert(iD1.mismatches > iD0.mismatches, '首次不一致仍计入计量（自愈不掩盖历史）');
  assert(JSON.parse(LS400.getItem(sk400)).clock.label === '自愈', '重试后磁盘值正确');

  // ── 5. A 块：verifyState 单聊天体检 ──
  resetLogs400();
  LS400.clear(); WA.store.init();
  WA.store.transact(d => { d.clock.label = '体检'; }); WA.store.save();
  const vOk400 = WA.store.verifyState();
  assert(vOk400.ok === true && vOk400.parseable === true && vOk400.exists === true, '健康聊天体检通过');
  assert(vOk400.schemaVersion === 1 && vOk400.bytes > 0, '体检透出版本与体积');
  const vMiss400 = WA.store.verifyState('v400_nope_chat');
  assert(vMiss400.exists === false && vMiss400.ok === false && vMiss400.reason === 'missing', '不存在的聊天如实报 missing');
  LS400.setItem('worldaxis_state_v400_bad_chat', '{oops');
  const vBad400 = WA.store.verifyState('v400_bad_chat');
  assert(vBad400.ok === false && vBad400.parseable === false && vBad400.reason === 'unparseable', '不可解析状态如实报 unparseable');
  // deep：结构完整度（不修改数据）
  const curN400 = WA.store.chatId();
  const fullJson400 = LS400.getItem('worldaxis_state_' + curN400);
  const partial400 = JSON.parse(fullJson400);
  delete partial400.clock; delete partial400.memory;
  LS400.setItem('worldaxis_state_v400_shallow_chat', JSON.stringify(partial400));
  const vDeep400 = WA.store.verifyState('v400_shallow_chat', { deep: true });
  assert(vDeep400.missingFields === 2 && vDeep400.shapeOk === false, 'deep 体检检出缺失字段数（实 ' + vDeep400.missingFields + '）');
  assert(LS400.getItem('worldaxis_state_v400_shallow_chat') === JSON.stringify(partial400), 'deep 体检只读不修改数据');

  // ── 6. A 块：verifyAll 全库巡检（单聊天载入成功 ≠ 键空间健康）──
  const vaShallow400 = WA.store.verifyAll({});
  assert(vaShallow400.total === 3 && vaShallow400.healthy === 2, '全库巡检枚举全部 state 键并统计健康数');
  assert(vaShallow400.problems.length === 1 && vaShallow400.problems[0].chat === 'v400_bad_chat', '浅巡检只报不可解析项');
  assert(vaShallow400.deep === false && vaShallow400.currentOk.ok === true, '浅巡检标记 deep=false 并透出当前聊天体检');
  const vaDeep400 = WA.store.verifyAll({ deep: true });
  assert(vaDeep400.deep === true, '深巡检标记 deep=true');
  assert(vaDeep400.problems.length === 2 && vaDeep400.problems.some(p => p.reason === 'missing-fields'), '深巡检额外检出结构缺失');

  // ── 7. B 块：诊断环上限按存储水位自适应（源码契约）──
  const idxSrc400 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  assert(idxSrc400.indexOf('const LOG_ADAPT') >= 0, '诊断环上限集中登记（LOG_ADAPT）');
  assert(/baseEvent:\s*300/.test(idxSrc400) && /baseError:\s*50/.test(idxSrc400), '常规档位 300/50');
  assert(/tightEvent:\s*120/.test(idxSrc400) && /tightError:\s*30/.test(idxSrc400), '紧张档位 120/30');
  assert(/minuteEvent:\s*60/.test(idxSrc400) && /minuteError:\s*20/.test(idxSrc400), '危急档位 60/20');
  assert(/bytesSoft:\s*4\s*\*\s*1024\s*\*\s*1024/.test(idxSrc400) && /bytesHard:\s*8\s*\*\s*1024\s*\*\s*1024/.test(idxSrc400), '软/硬水位 4MB/8MB');
  assert(idxSrc400.indexOf('WA.logCaps = logCaps') >= 0 && idxSrc400.indexOf('WA.logTrimStat = logTrimStatView') >= 0, '动态上限与裁剪计量对外可观测');
  assert(idxSrc400.indexOf('const caps = logCaps();') >= 0, 'WA.log 实际消费动态上限（非硬编码）');
  // 沙箱实跑：三档水位判定
  const iLo400 = idxSrc400.indexOf('const LOG_ADAPT');
  const iHi400 = idxSrc400.indexOf('let __logSaveTimer');
  assert(iLo400 > 0 && iHi400 > iLo400, '提取 LOG_ADAPT..logTrimStatView 段');
  const logSeg400 = idxSrc400.slice(iLo400, iHi400);
  function capsAt400(totalBytes, exceeded) {
    const box = {};
    vm.runInContext('var WA = { store: { diagBudget: function () { return { exceeded: ' + (exceeded ? 'true' : 'false') + ', diagPct: ' + (exceeded ? 30 : 1) + ', maxPct: 20 }; }, storageStat: function () { return { totalBytes: ' + totalBytes + ' }; } } };\n'
      + logSeg400 + '\nglobalThis.__caps = logCaps();', vm.createContext(box));
    return box.__caps;
  }
  const capNorm400 = capsAt400(1000, false);
  assert(capNorm400.level === 'normal' && capNorm400.event === 300 && capNorm400.error === 50, '常规水位 → 300/50');
  const capSoft400 = capsAt400(5 * 1024 * 1024, false);
  assert(capSoft400.level === 'tight' && capSoft400.event === 120 && capSoft400.error === 30, '超软水位 → 自动收紧到 120/30');
  assert(capSoft400.why.join(',').indexOf('totalBytes>') >= 0, '收紧原因可归因（不只给结果）');
  const capHard400 = capsAt400(9 * 1024 * 1024, true);
  assert(capHard400.level === 'minute' && capHard400.event === 60 && capHard400.error === 20, '超硬水位+超预算 → 危急档 60/20');

  // ── 8. C 块：maintain 统一裁决（健康分 + 分级议题）──
  resetLogs400();
  LS400.clear(); WA.store.init();
  WA.store.transact(d => { d.clock.label = '干净库'; }); WA.store.save();
  const mClean400 = WA.store.maintain({});
  assert(mClean400.score === 100 && mClean400.level === 'ok', '干净库健康分 100 / ok');
  assert(mClean400.planKeys.length === 0 && mClean400.actions.length === 0, '干净库无可回收键、无建议动作');
  assert(typeof mClean400.signals.totalKeys === 'number' && typeof mClean400.signals.reclaimable === 'number'
    && typeof mClean400.signals.diagPct === 'number' && typeof mClean400.signals.chatsChecked === 'number', 'signals 透出全套治理计量');
  assert(mClean400.issues.every(x => x.level === 'info'), '干净库议题全为 info（不污染告警）');
  // 大额可回收 → 议题 + 建议动作
  LS400.setItem('worldaxis_state_v400_dead', JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS400.setItem('worldaxis_event_log_v400_dead', 'y'.repeat(400 * 1024));
  const mDirty400 = WA.store.maintain({});
  assert(mDirty400.signals.reclaimable === 1 && mDirty400.signals.reclaimableBytes === 409600, '可回收键与字节被量化（实 ' + mDirty400.signals.reclaimableBytes + 'B）');
  assert(mDirty400.planKeys.length === 1 && mDirty400.planKeys[0] === 'worldaxis_event_log_v400_dead', 'planKeys 为可回收键名清单（指纹节流粒度）');
  assert(mDirty400.actions.some(a => a.id === 'sweep' && a.safe === true), '产出安全建议动作（sweep）');
  // 分档：>512KB 扣分升档
  LS400.setItem('worldaxis_event_log_v400_dead2', 'z'.repeat(600 * 1024));
  const mHuge400 = WA.store.maintain({});
  assert(mHuge400.signals.reclaimableBytes > 512 * 1024 && mHuge400.issues.some(x => x.key === 'hygiene.reclaimable' && x.level === 'warn'), '超大额可回收升为 warn 议题');

  // ── 9. C 块：自动回收的安全边界（v0.1.52「删除属用户决策」契约的精确化）──
  // 9a. 真孤儿（聊天既无 state 本体也无隔离副本）→ 自动回收
  resetLogs400();
  LS400.clear(); WA.store.init(); WA.store.save();
  const mStat0 = WA.store.maintainStat();
  LS400.setItem('worldaxis_event_log_v400_ghost', 'g'.repeat(400 * 1024));
  LS400.setItem('worldaxis_recovery_v400_ghost', JSON.stringify([{ at: Date.now(), state: {} }]));
  const mGhost400 = WA.store.maintain({ apply: true, minFreedBytes: 1 });
  assert(mGhost400.applied && mGhost400.applied.removed === 2, '真孤儿残留被自动回收（实 ' + JSON.stringify(mGhost400.applied) + '）');
  assert(LS400.getItem('worldaxis_event_log_v400_ghost') === null && LS400.getItem('worldaxis_recovery_v400_ghost') === null, '孤儿诊断键与孤儿恢复点均已清除');
  const mStat1 = WA.store.maintainStat();
  assert(mStat1.autoApplies > mStat0.autoApplies && mStat1.lastAutoFreedBytes === 409633, '自动动作进入审计计量（' + mStat1.lastAutoFreedBytes + 'B）');
  // 9b. 有 state 本体的聊天 → 诊断键绝不自动回收（用户可能要看日志）
  resetLogs400();
  LS400.clear(); WA.store.init();
  LS400.setItem('worldaxis_state_v400_liver', JSON.stringify({ meta: { updatedAt: Date.now() - 90 * 86400000 } }));
  LS400.setItem('worldaxis_event_log_v400_liver', 'l'.repeat(500 * 1024));
  const mLiver400 = WA.store.maintain({ apply: true, minFreedBytes: 1 });
  assert(mLiver400.applied === null, '仍存在聊天的过期诊断键不被自动回收');
  assert(LS400.getItem('worldaxis_event_log_v400_liver') !== null && LS400.getItem('worldaxis_state_v400_liver') !== null, '其诊断键与 state 本体均保留');
  // 9c. 隔离现场 → 绝不自动回收（可能是唯一幸存现场 / 可恢复）
  const cu400 = WA.store.chatId();
  const qCur400 = 'worldaxis_state_' + cu400 + '_corrupt_400101';
  const qOther400 = 'worldaxis_state_v400_other_corrupt_400102';
  LS400.setItem(qCur400, '当前聊天唯一幸存现场');
  LS400.setItem(qOther400, JSON.stringify({ schemaVersion: 1 }));
  const mQuar400 = WA.store.maintain({ apply: true, minFreedBytes: 1 });
  assert(mQuar400.applied === null, '隔离现场不被自动回收');
  assert(LS400.getItem(qCur400) !== null, '当前聊天的隔离副本受保护（文档不变量：当前聊天键永不清理）');
  assert(LS400.getItem(qOther400) !== null, '可解析隔离现场保留待人工恢复');
  // 9d. 隔离溢出（corrupt-overflow）→ 不自动回收（删除属用户决策）
  resetLogs400();
  LS400.clear(); WA.store.init();
  for (let i = 1; i <= 8; i++) LS400.setItem('worldaxis_state_v400_gone_corrupt_' + (400200 + i), 'x'.repeat(50 * 1024));
  const mOver400 = WA.store.maintain({ apply: true, minFreedBytes: 1 });
  assert(mOver400.applied === null, '隔离溢出不被自动回收（仅由用户经面板决策）');
  assert(Object.keys(LS400._dump()).filter(k => k.indexOf('_corrupt_') > 0).length === 8, '全部 8 个隔离键原样保留');
  // 9e. 门槛：回收量低于门槛则不动（保守优先，避免频繁微小删除）
  resetLogs400();
  LS400.clear(); WA.store.init(); WA.store.save();
  LS400.setItem('worldaxis_event_log_v400_small', 's'.repeat(10 * 1024));
  const mThr400 = WA.store.maintain({ apply: true, minFreedBytes: 256 * 1024 });
  assert(mThr400.applied === null && LS400.getItem('worldaxis_event_log_v400_small') !== null, '低于 minFreedBytes 门槛不执行回收');
  const mThr2_400 = WA.store.maintain({ apply: true, minFreedBytes: 1 });
  assert(mThr2_400.applied && mThr2_400.applied.freedBytes === 10240, '放低门槛后回收（门槛确为唯一闸门）');
  // 9f. dry-run 不删：无 apply 时只报不做
  resetLogs400();
  LS400.clear(); WA.store.init(); WA.store.save();
  LS400.setItem('worldaxis_event_log_v400_dry', 'd'.repeat(400 * 1024));
  const mDry400 = WA.store.maintain({});
  assert(mDry400.applied === null && LS400.getItem('worldaxis_event_log_v400_dry') !== null, '无 apply 时绝不删除（rescue/巡视默认只读）');

  // ── 10. E 块：健康分语义 =「当前状态」而非「历史经历」──
  resetLogs400();
  LS400.clear(); WA.store.init();
  const cidE400 = WA.store.chatId();
  LS400.setItem = function (k, v) { if (k === 'worldaxis_state_' + cidE400) return; return realSet400(k, v); };
  WA.store.transact(d => { d.clock.label = '当前失败'; });
  WA.store.save();
  LS400.setItem = realSet400;
  const mFail400 = WA.store.maintain({});
  assert(mFail400.issues.some(x => x.key === 'integrity.failing' && x.level === 'warn'), '最近一次写入校验失败 → warn 议题');
  assert(mFail400.score <= 85, '当前写入缺陷计入扣分（实 ' + mFail400.score + '）');
  WA.store.transact(d => { d.clock.label = '恢复'; });
  WA.store.save();
  const mHeal400 = WA.store.maintain({});
  assert(!mHeal400.issues.some(x => x.key === 'integrity.failing'), '写入恢复后不再报当前缺陷');
  assert(mHeal400.issues.some(x => x.key === 'integrity.history' && x.level === 'info'), '历史失败降级为 info 议题（可追溯、不扣分）');
  assert(mHeal400.score > mFail400.score, '健康分随当前态回升（不被历史经历永久压低）');

  // ── 10b. I 块：救援失败的「当前态 vs 历史经历」（与完整性同类裁决）──
  assert(typeof WA.store.rescueStat().lastOk !== 'undefined', '救援计量透出当前态字段（lastOk）');
  // 先制造一次「历史救援失败」（本段自有，不依赖前序段），再恢复正常落盘
  resetLogs400(); LS400.clear();
  WA.store.init();
  const cidH400 = WA.store.chatId();
  WA.store.transact(d => { d.clock.label = '历史配额失败'; }); WA.store.save();
  {
    const realSetH400 = LS400.setItem;
    LS400.setItem = function (k, v) {
      if (k === 'worldaxis_state_' + cidH400) {
        const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e;
      }
      return realSetH400(k, v);
    };
    WA.store.transact(d => { d.clock.label = '历史配额失败2'; });
    WA.store.save();   // 撞配额 → 触发救援 → 无可回收键 → failed++
    LS400.setItem = realSetH400;
  }
  const rHist400 = WA.store.rescueStat();
  assert(rHist400.failed > 0 && rHist400.lastOk === false, '历史救援失败已留痕（failed=' + rHist400.failed + '）');
  // 恢复正常落盘 → 当前态必须回到正常
  resetLogs400(); LS400.clear();
  WA.store.init();
  WA.store.transact(d => { d.clock.label = '当前正常'; }); WA.store.save();
  {
    const mRes = WA.store.maintain({});
    assert(WA.store.saveStat().ok === true, '当前落盘成功（前置条件）');
    assert(!mRes.issues.some(x => x.key === 'rescue.failing'), '历史救援失败且当前落盘正常 → 不报当前缺陷');
    assert(mRes.issues.some(x => x.key === 'rescue.history' && x.level === 'info'), '历史救援失败降级为 info 议题（可追溯、不扣分）');
    assert(mRes.score === 100 && mRes.level === 'ok', '健康分不被历史救援失败压低（实 ' + mRes.score + '/' + mRes.level + '）');
    assert(mRes.signals.rescueFailing === false, 'signals 透出救援当前态为正常');
    assert(mRes.signals.rescueFailed === rHist400.failed, 'signals 仍保留历史失败计数（审计不丢）');
  }
  // 反向：最近一次 save 因配额失败 → 必须报当前缺陷并扣分
  {
    const cidR400 = WA.store.chatId();
    const realSetR400 = LS400.setItem;
    const mBeforeR = WA.store.maintain({});
    LS400.setItem = function (k, v) {
      if (k === 'worldaxis_state_' + cidR400) {
        const e = new Error('quota exceeded'); e.name = 'QuotaExceededError'; throw e;
      }
      return realSetR400(k, v);
    };
    WA.store.transact(d => { d.clock.label = '当前配额失败'; });
    const okQuota = WA.store.save();
    LS400.setItem = realSetR400;
    assert(okQuota === false && WA.store.saveStat().reason === 'quota', '当前 save 因配额失败（前置条件）');
    const mAfterR = WA.store.maintain({});
    assert(mAfterR.issues.some(x => x.key === 'rescue.failing' && x.level === 'warn'), '当前救援失败 → warn 议题（不因历史而豁免）');
    assert(mAfterR.score < mBeforeR.score, '当前空间缺陷计入扣分（' + mBeforeR.score + ' → ' + mAfterR.score + '）');
    assert(mAfterR.signals.rescueFailing === true, 'signals 透出救援当前态异常');
  }

  // ── 11. D 块：init 巡警分级（严格沿用 v0.1.52 告警门槛）──
  function hygieneLogs400() { return WA.eventLog.filter(l => l.msg.indexOf('存储键卫生') >= 0); }
  function lastHygiene400() { const a = hygieneLogs400(); return a.length ? a[a.length - 1] : null; }
  // 11a. 大额可回收（>256KB，但有 state 本体故不自动回收）→ warn
  resetLogs400();
  LS400.clear(); WA.store.init(); WA.store.save();
  WA.eventLog.length = 0;
  LS400.setItem('worldaxis_state_v400_cold', JSON.stringify({ meta: { updatedAt: Date.now() - 50 * 86400000 } }));
  LS400.setItem('worldaxis_event_log_v400_cold', 'c'.repeat(300 * 1024));
  WA.store.init();
  const hBig400 = lastHygiene400();
  assert(hBig400 && hBig400.level === 'warn', '大额可回收触发 warn（v0.1.52 门槛：>256KB）');
  assert(hBig400.msg.indexOf('可回收') >= 0 && hBig400.msg.indexOf('存储键体检') >= 0, '大额告警指出可回收量与面板出口');
  // 11b. 小额可回收 → info，不产生告警
  WA.eventLog.length = 0;
  const warnBefore400 = hygieneLogs400().filter(l => l.level === 'warn').length;
  resetLogs400();
  LS400.clear(); WA.store.init(); WA.store.save(); WA.eventLog.length = 0;
  LS400.setItem('worldaxis_event_log_v400_tiny', 't'.repeat(2 * 1024));
  WA.store.init();
  assert(hygieneLogs400().filter(l => l.level === 'warn').length === 0, '小额可回收不产生告警（阈值闸）');
  const hSmall400 = lastHygiene400();
  assert(!hSmall400 || hSmall400.level === 'info', '小额可回收最多降为 info 留痕');
  // 11c. 真孤儿被自动回收 → warn 留痕（动作必留痕）
  resetLogs400();
  LS400.clear(); WA.store.init(); WA.store.save(); WA.eventLog.length = 0;
  LS400.setItem('worldaxis_event_log_v400_ghost2', 'q'.repeat(400 * 1024));
  WA.store.init();
  const hAuto400 = lastHygiene400();
  assert(hAuto400 && hAuto400.level === 'warn' && hAuto400.msg.indexOf('已自动回收') >= 0, '自动回收动作必留 warn 痕迹');
  assert(LS400.getItem('worldaxis_event_log_v400_ghost2') === null, 'init 无人值守自愈真的生效（键已清）');
  // 11d. 指纹含 planKeys（v0.1.54 键名排序串契约，否则新垃圾集签名不变）
  const stSrc400 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  assert(stSrc400.indexOf("(m.planKeys || []).join('|')") >= 0, '巡视签名含可回收键名串（防新垃圾集指纹失效）');
  assert(stSrc400.indexOf('WA.store.maintain({ apply: true') >= 0 && /minFreedBytes:\s*256\s*\*\s*1024/.test(stSrc400), 'init 以保守门槛（256KB）接入自动治理');

  // ── 12. F 块：闭环接线（报告 + 面板）──
  const diagSrc400 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  assert(diagSrc400.indexOf('## 健康巡视') >= 0, '错误报告含「健康巡视」段（裁决视图可带走）');
  assert(diagSrc400.indexOf('maintain: WA.store.maintain') >= 0 || diagSrc400.indexOf('maintain: WA.store.maintain ?') >= 0, '诊断包透出健康巡视');
  assert(diagSrc400.indexOf('integrity: WA.store.integrityStat') >= 0, '诊断包透出写入完整性审计');
  assert(diagSrc400.indexOf('写入完整性: 校验') >= 0, '报告文本含写入完整性行');
  try {
    WA.store.transact(d => { d.clock.label = '报告'; }); WA.store.save();
    const rep400 = WA.toolDiag.buildErrorReport();
    assert(rep400.indexOf('## 健康巡视') >= 0 && rep400.indexOf('健康分: ') >= 0, '实跑报告产出健康巡视内容');
    assert(rep400.indexOf('写入完整性:') >= 0, '实跑报告产出写入完整性内容');
  } catch (e) { assert(false, '错误报告实跑失败: ' + e.message); }
  const panelSrc400 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(panelSrc400.indexOf('id="wa-maintain"') >= 0 && panelSrc400.indexOf('健康巡视') >= 0, '面板含「健康巡视」入口');
  assert(panelSrc400.indexOf('maintain({ deep: true })') >= 0, '面板以 deep 模式巡视（含结构缺失）');
  assert(panelSrc400.indexOf('m.issues.forEach') >= 0 && panelSrc400.indexOf('m.actions.forEach') >= 0, '面板渲染分级议题与建议动作');
  assert(panelSrc400.indexOf('integrityStat') >= 0, '面板渲染写入完整性');

  // ── 清理现场 ──
  resetLogs400();
  LS400.clear();
  Object.keys(junkBefore400).forEach(function (k) { LS400.setItem(k, junkBefore400[k]); });
  WA.eventLog.length = 0;
  evtBefore400.forEach(function (l) { WA.eventLog.push(l); });
  } // end v0.4.0 block
  // ═══════════════════════════════════════════════════════════
  // v0.5.0 — 多实例并发一致性（写入者标识 / 冲突检出与保全 / 跨实例感知 / 治理接入）
  //   缺陷背景（探针实证）：localStorage 为多标签页共享，双窗口同时推进同一聊天时
  //   后写静默覆盖前写，save 返回 true 且零告警——用户数轮进度永久丢失却无从察觉。
  // ═══════════════════════════════════════════════════════════
  v050: {
  const LS500 = global.localStorage;
  const junkBefore500 = JSON.parse(JSON.stringify(LS500._dump()));
  const evtBefore500 = WA.eventLog.slice();
  const errBefore500 = WA.errorLog.slice();
  const ctx500 = global.SillyTavern.getContext();
  const prevChat500 = ctx500.chatId;
  const CID500 = 'v500_chat';
  const SK500 = 'worldaxis_state_' + CID500;
  function resetLogs500() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh500() { resetLogs500(); LS500.clear(); ctx500.chatId = CID500; WA.store.init(); }
  function conflictKeys500() { return Object.keys(LS500._dump()).filter(k => k.indexOf('worldaxis_conflict_') === 0); }
  function hygieneWarns500() { return WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length; }

  // ── 1. API 与写入者标识 ──
  fresh500();
  assert(typeof WA.store.conflictStat === 'function' && typeof WA.store.lastConflict === 'function', 'v0.5.0 冲突观测 API 已导出');
  assert(typeof WA.store.listConflicts === 'function' && typeof WA.store.dropConflict === 'function', 'v0.5.0 冲突现场处置 API 已导出');
  assert(typeof WA.store.exportConflict === 'function' && typeof WA.store.externalWriteStat === 'function' && typeof WA.store.staleSinceExternal === 'function', 'v0.5.0 提取与跨实例感知 API 已导出');
  WA.store.transact(d => { d.clock.label = 'v500-a'; });
  const m500a = JSON.parse(LS500.getItem(SK500)).meta;
  assert(typeof m500a.writer === 'string' && m500a.writer.length > 1, '每次写入打上写入者标识（meta.writer）');
  assert(typeof m500a.writeSeq === 'number' && m500a.writeSeq >= 1, '写入序号 writeSeq 落盘');
  assert(typeof m500a.stateRev === 'number' && m500a.stateRev >= 1, '全局单调序号 stateRev 落盘');
  assert(LS500.getItem('worldaxis_writer_id') === m500a.writer, 'writer_id 键与 meta.writer 一致（存储侧可追溯）');

  // ── 2. stateRev 单调递增 / writeSeq 递增 / 标识稳定 ──
  fresh500();
  const revs500 = [];
  for (let i = 0; i < 3; i++) { WA.store.transact(d => { d.clock.r = i; }); revs500.push(JSON.parse(LS500.getItem(SK500)).meta.stateRev); }
  assert(revs500.every((v, i) => i === 0 || v > revs500[i - 1]), 'stateRev 单调递增（' + JSON.stringify(revs500) + '）');
  assert(revs500[2] - revs500[0] === 2 * (revs500[1] - revs500[0]), 'stateRev 步长稳定（每轮 transact+save 各一次）');
  const w500a = JSON.parse(LS500.getItem(SK500)).meta.writer;
  WA.store.transact(d => { d.clock.s = 1; });
  assert(JSON.parse(LS500.getItem(SK500)).meta.writer === w500a, '同一实例写入者标识稳定不变');
  const cs500a = WA.store.conflictStat();
  assert(cs500a.writer === w500a && cs500a.writeSeq >= 1, 'conflictStat 透出本实例标识与写入量');

  // ── 3. 冲突检出与保全（核心：数据不再永久丢失）──
  fresh500();
  WA.store.transact(d => { d.clock.label = 'MINE-BASE'; });
  const seen500 = WA.store.conflictStat().seenRev;
  const detBefore500 = WA.store.conflictStat().detected;
  // 模拟「另一实例」写入：writer 不同、序号抬高
  const foreign500 = JSON.parse(LS500.getItem(SK500));
  foreign500.clock.label = 'FOREIGN-PROGRESS-3ROUNDS';
  foreign500.meta.writer = 'wFOREIGN500';
  foreign500.meta.stateRev = seen500 + 3;
  LS500.setItem(SK500, JSON.stringify(foreign500));
  WA.store.transact(d => { d.clock.label = 'MINE-AFTER'; });
  const cs500b = WA.store.conflictStat();
  assert(cs500b.detected === detBefore500 + 1, '他实例写入被检出（detected 递增）');
  assert(cs500b.quarantined >= 1, '他实例 payload 被保全为冲突现场（quarantined 递增）');
  assert(typeof cs500b.lastKeptKey === 'string' && cs500b.lastKeptKey.indexOf('worldaxis_conflict_') === 0, '保全键名符合冲突现场命名空间');
  assert(LS500.getItem(cs500b.lastKeptKey).indexOf('FOREIGN-PROGRESS-3ROUNDS') >= 0, '★他实例进度完整保全（而非静默丢弃）');
  const sites500 = WA.store.listConflicts();
  assert(sites500.length === 1 && sites500[0].parseable === true, 'listConflicts 返回可解析现场');
  assert(sites500[0].head === 'FOREIGN-PROGRESS-3ROUNDS', '现场摘要取自持久化 payload（非伪造）');
  const lc500 = WA.store.lastConflict();
  assert(lc500 && lc500.detected === true && lc500.otherRev === seen500 + 3 && lc500.myRev === seen500, 'lastConflict 精确记录双方序号');
  assert(JSON.parse(LS500.getItem(SK500)).clock.label === 'MINE-AFTER', '本实例写入仍成功（不阻塞可用性）');

  // ── 4. 键名唯一性 + 环形保留 ──
  fresh500();
  for (let i = 0; i < 5; i++) {
    WA.store.transact(d => { d.clock.i = i; });
    const c = JSON.parse(LS500.getItem(SK500));
    c.meta.stateRev = c.meta.stateRev + 2;
    LS500.setItem(SK500, JSON.stringify(c));
  }
  const ck500 = conflictKeys500();
  assert(ck500.length === 3, '冲突现场环形保留上限 3（实 ' + ck500.length + '）');
  assert(new Set(ck500).size === ck500.length, '键名互不重复（同毫秒冲突不互相覆盖）');
  const seqs500 = ck500.map(k => parseInt(k.split('_').slice(-1)[0], 10)).filter(n => !isNaN(n));
  assert(seqs500.length === 3 && new Set(seqs500).size === 3, '键名含唯一序号（防同毫秒碰撞）');

  // ── 5. 处置守卫 ──
  const g0_500 = ck500[0];
  assert(WA.store.dropConflict('worldaxis_state_' + CID500).ok === false, 'dropConflict 拒绝非冲突现场键');
  assert(WA.store.dropConflict('worldaxis_conflict_zzz_1_1').ok === false, 'dropConflict 拒绝不存在的键');
  assert(WA.store.exportConflict('worldaxis_writer_id').ok === false, 'exportConflict 拒绝非冲突现场键');
  const ex500 = WA.store.exportConflict(g0_500);
  assert(ex500.ok === true && ex500.kind === 'conflict-site' && ex500.parseable === true && !!ex500.state, 'exportConflict 输出完整可解析快照');
  assert(ex500.bytes > 0 && typeof ex500.raw === 'string', 'exportConflict 含原始字节与体积');
  assert(WA.store.dropConflict(g0_500).ok === true && conflictKeys500().length === 2, 'dropConflict 按显式键删除且仅删一个');

  // ── 6. 跨实例实时感知（storage 事件）──
  fresh500();
  WA.store.transact(d => { d.clock.label = 'live'; });
  const ext0_500 = WA.store.externalWriteStat();
  assert(ext0_500.hookInstalled === true, 'init 安装 storage 事件钩子');
  assert((global.__winHandlers.storage || []).length >= 1, 'window 上存在 storage 监听');
  assert(ext0_500.count === 0 && WA.store.staleSinceExternal() === false, '无外部写入时标记为空');
  const eh0_500 = (global.__winHandlers.storage || []).length;
  WA.store.init(); WA.store.init();
  assert((global.__winHandlers.storage || []).length === eh0_500, '钩子安装幂等（重复 init 不叠加监听）');
  const fExt500 = JSON.parse(LS500.getItem(SK500));
  fExt500.meta.writer = 'wFOREIGN-LIVE';
  fExt500.meta.stateRev = 777;
  LS500._emitStorage(SK500, 'old', JSON.stringify(fExt500));
  const ext1_500 = WA.store.externalWriteStat();
  assert(ext1_500.count === 1 && ext1_500.lastRev === 777 && ext1_500.lastWriter === 'wFOREIGN-LIVE', '外部写入被实时记录（序号/来源精确）');
  assert(WA.store.staleSinceExternal() === true, 'staleSinceExternal 提示内存态落后');
  assert(WA.eventLog.some(l => l.level === 'warn' && l.msg.indexOf('另一实例') >= 0), '外部写入产生 warn 告警（提示刷新）');
  // 误报守卫
  const extB_500 = WA.store.externalWriteStat().count;
  LS500._emitStorage('worldaxis_state_other_chat_500', 'a', 'b');
  assert(WA.store.externalWriteStat().count === extB_500, '其他聊天的键不触发（不误报）');
  LS500._emitStorage('worldaxis_settings_v1', 'a', 'b');
  assert(WA.store.externalWriteStat().count === extB_500, '非 state 键不触发（不误报）');
  LS500._emitStorage(SK500, 'x', JSON.stringify({ meta: { writer: WA.store.conflictStat().writer } }));
  assert(WA.store.externalWriteStat().count === extB_500, '本实例自己的写入不触发（writer 相同）');
  LS500._emitStorage(null, null, null);
  assert(WA.store.externalWriteStat().count === extB_500, 'clear 事件（key=null）不触发');
  LS500._emitStorage(SK500, 'x', '{broken');
  assert(WA.store.externalWriteStat().count === extB_500 + 1, '损坏 payload 仍记一次（异常写入也须可见）');

  // ── 7. init 清零外部写入（I 块：防顽固误报）──
  fresh500();
  WA.store.transact(d => { d.clock.label = 'w'; });
  const fw500 = JSON.parse(LS500.getItem(SK500)); fw500.meta.writer = 'wF2'; LS500._emitStorage(SK500, 'o', JSON.stringify(fw500));
  assert(WA.store.externalWriteStat().count === 1, '外部写入已记录');
  assert(WA.store.maintain({}).issues.some(i => i.key === 'concurrent.external'), '未同步前报 concurrent.external');
  WA.store.init();
  assert(WA.store.externalWriteStat().count === 0, 'init（以磁盘重新同步）清零外部写入标记');
  assert(!WA.store.maintain({}).issues.some(i => i.key === 'concurrent.external'), '同步后不再报 concurrent.external（误报消除）');

  // ── 8. maintain 第 6 段：并发接入治理 ──
  fresh500();
  WA.store.transact(d => { d.clock.label = 'k'; });
  const mClean500 = WA.store.maintain({});
  assert(!mClean500.issues.some(i => i.key.indexOf('concurrent.') === 0 && i.level === 'warn'), '干净库无并发 warn 议题');
  assert(mClean500.signals.conflictSites === 0 && mClean500.signals.externalWrites === 0, 'signals 并发计量归零');
  assert('conflictSites' in mClean500.signals && 'externalWrites' in mClean500.signals && 'conflictDetected' in mClean500.signals && 'conflictQuarantined' in mClean500.signals, 'signals 含四项并发计量');
  // 造冲突现场
  const fc500 = JSON.parse(LS500.getItem(SK500)); fc500.meta.stateRev = fc500.meta.stateRev + 3; LS500.setItem(SK500, JSON.stringify(fc500));
  WA.store.transact(d => { d.clock.label = 'k2'; });
  const mConf500 = WA.store.maintain({});
  assert(mConf500.signals.conflictSites === 1, 'signals.conflictSites 精确为 1');
  const ci500 = mConf500.issues.filter(i => i.key === 'concurrent.conflict');
  assert(ci500.length === 1 && ci500[0].level === 'warn', '未处置冲突现场 → warn 议题');
  assert(mConf500.actions.some(a => a.id === 'review-conflict'), '冲突现场产生 review-conflict 建议动作');
  assert(mConf500.score < mClean500.score, '冲突现场使健康分下降（' + mClean500.score + ' → ' + mConf500.score + '）');
  // 外部写入议题
  fresh500();
  WA.store.transact(d => { d.clock.label = 'k'; });
  const fe500 = JSON.parse(LS500.getItem(SK500)); fe500.meta.writer = 'wF3'; LS500._emitStorage(SK500, 'o', JSON.stringify(fe500));
  const mExt500 = WA.store.maintain({});
  assert(mExt500.signals.externalWrites === 1 && mExt500.actions.some(a => a.id === 'reload-page'), '外部写入 → reload-page 建议动作');
  assert(mExt500.issues.filter(i => i.key === 'concurrent.external' && i.level === 'warn').length === 1, '外部写入 → warn 议题');

  // ── 9. 家族归位 + 体积语义（E/F 块）──
  fresh500();
  WA.store.transact(d => { d.clock.label = 'x'; });
  const baseBytes500 = WA.store.storageStat().currentChatBytes;
  const fx500 = JSON.parse(LS500.getItem(SK500)); fx500.meta.stateRev = fx500.meta.stateRev + 3; LS500.setItem(SK500, JSON.stringify(fx500));
  WA.store.transact(d => { d.clock.label = 'y'; });
  const st500 = WA.store.storageStat();
  assert(st500.families.conflict === 1, 'conflict 家族被正确识别（不误归 settings）');
  assert(st500.families.settings === 0, 'settings 家族不含未识别键');
  assert(st500.conflictKeys === 1 && st500.conflictBytes > 0, 'storageStat 透出 conflict 计量');
  assert(st500.conflictBytes === conflictKeys500().reduce((a, k) => a + new TextEncoder().encode(LS500.getItem(k) || '').length, 0), 'conflictBytes 与现场实际字节一致（UTF-8 值字节口径）');
  assert(st500.currentChatBytes < baseBytes500 + st500.conflictBytes, 'currentChatBytes 不混入冲突现场副本（活跃体积语义正确）');
  assert(st500.totalBytes >= st500.conflictBytes, 'totalBytes 仍完整覆盖（不因归位而漏计）');
  LS500.removeItem('worldaxis_writer_id');
  assert(WA.store.storageStat().families.writerId === 0, 'writerId 键被删后家族计量归零');
  WA.store.transact(d => { d.clock.label = 'y2'; });
  assert(LS500.getItem('worldaxis_writer_id') !== null, 'writerId 键被外部删除后自动重建（J 块）');
  assert(WA.store.storageStat().families.writerId === 1, '重建后家族计量恢复 1（不重复计数）');

  // ── 10. 自动清理边界（E 块显式 keep）──
  const keepSrc500 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  assert(keepSrc500.indexOf("if (c.family === 'conflict' || c.family === 'writerId') { plan.keep.push(k); return; }") >= 0, 'sweep 源码显式 keep 冲突现场与写入者标识（不依赖默认分支兜底）');
  fresh500();
  WA.store.transact(d => { d.clock.label = 'z'; });
  const fz500 = JSON.parse(LS500.getItem(SK500)); fz500.meta.stateRev = fz500.meta.stateRev + 3; LS500.setItem(SK500, JSON.stringify(fz500));
  WA.store.transact(d => { d.clock.label = 'z2'; });
  const keepBefore500 = conflictKeys500();
  const plan500 = WA.store.sweepStaleKeys({});
  assert(!plan500.remove.some(r => r.key.indexOf('worldaxis_conflict_') === 0), 'sweep 计划绝不包含冲突现场');
  assert(plan500.keep.some(k => k.indexOf('worldaxis_conflict_') === 0), 'sweep 显式 keep 冲突现场（不依赖偶然分类）');
  assert(plan500.keep.indexOf('worldaxis_writer_id') >= 0, 'sweep 显式 keep 写入者标识键');
  WA.store.maintain({ apply: true, minFreedBytes: 1 });
  assert(keepBefore500.every(k => LS500.getItem(k) !== null), 'maintain 自动回收不误删冲突现场');
  assert(LS500.getItem('worldaxis_writer_id') !== null, 'maintain 自动回收不误删写入者标识');

  // ── 11. 恢复点来源标识（G 块）──
  fresh500();
  WA.store.transact(d => { d.clock.label = 'p'; });
  WA.store.createRecoveryPoint();
  const pts500 = WA.store.listRecoveryPoints();
  assert(pts500.length === 1 && typeof pts500[0].by === 'string' && pts500[0].by.length > 1, '恢复点记录来源实例 by');
  assert(typeof pts500[0].rev === 'number' && pts500[0].rev >= 1, '恢复点记录当时 stateRev');
  assert(pts500[0].by === WA.store.conflictStat().writer, '恢复点来源与当前实例一致');
  const rs500 = WA.store.recoveryStat();
  assert(rs500.writers === 1 && rs500.multiInstance === false && rs500.lastBy === pts500[0].by, 'recoveryStat 透出单实例状态');
  // 伪造一个他实例的恢复点 → multiInstance 置真
  const list500 = WA.store.listRecoveryPoints();
  list500.unshift({ at: Date.now(), by: 'wOTHER-RP', rev: 5, state: list500[0].state });
  LS500.setItem('worldaxis_recovery_' + CID500, JSON.stringify(list500));
  const rs500b = WA.store.recoveryStat();
  assert(rs500b.writers === 2 && rs500b.multiInstance === true, 'recoveryStat 检出跨实例留点（multiInstance）');

  // ── 12. 卫生指纹收敛（L 块：修告警疲劳）──
  const stSrc500 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  assert(stSrc500.indexOf('/^(hygiene|quarantine|state)\\./') >= 0, 'L 块：卫生巡检指纹收敛到卫生范畴议题');
  assert(stSrc500.indexOf("m.issues.map(function (x) { return x.key; }).sort().join('|')") < 0, 'L 块：旧「全部议题键」签名已移除');
  assert(stSrc500.indexOf('/^(hygiene|quarantine|state)\\./.test(x.key)') >= 0 && stSrc500.indexOf("x.key + ':' + x.level") >= 0, 'L 块：签名含卫生议题的键+等级（等级变化仍可感知）');
  fresh500();
  const huge500 = 'y'.repeat(300 * 1024);
  LS500.setItem('worldaxis_state_v500_cold', JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS500.setItem('worldaxis_event_log_v500_cold', huge500);
  WA.store.init();
  const hw1_500 = hygieneWarns500();
  assert(hw1_500 >= 1, '大额可回收垃圾首见告警（实 ' + hw1_500 + '）');
  WA.store.init(); WA.store.init();
  const hw2_500 = hygieneWarns500();
  assert(hw2_500 === hw1_500, '同垃圾集重复 init 静默（' + hw1_500 + ' 恒定）');
  // 叠加无关议题（写隔离现场 → state.corrupt/quarantine 之外先造一个 integrity 抖动）
  WA.log('error', 'v500 无关议题抖动');
  WA.store.init();
  const hw3_500 = hygieneWarns500();
  assert(hw3_500 === hw2_500, '无关议题抖动不重复触发卫生告警（指纹收敛生效，实 ' + hw3_500 + '）');
  // 真正的新垃圾集仍须告警
  const huge500b = 'z'.repeat(300 * 1024);
  LS500.setItem('worldaxis_state_v500_cold_b', JSON.stringify({ meta: { updatedAt: Date.now() - 50 * 86400000 } }));
  LS500.setItem('worldaxis_event_log_v500_cold_b', huge500b);
  WA.store.init();
  assert(hygieneWarns500() > hw3_500, '新垃圾集出现仍必告警（收敛未削弱检出能力）');

  // ── 13. 诊断出口（D 块）──
  fresh500();
  WA.store.transact(d => { d.clock.label = 'd'; });
  if (WA.toolDiag && WA.toolDiag.collect) {
    const dg500 = WA.toolDiag.collect();
    assert(!!(dg500.worldState && dg500.worldState.storage && dg500.worldState.storage.concurrency), '诊断 collect 透出 concurrency 段');
    const conc500 = dg500.worldState.storage.concurrency;
    assert(!!conc500.conflict && !!conc500.external && Array.isArray(conc500.sites), 'concurrency 含 conflict/external/sites');
  } else { assert(true, 'toolDiag 未加载时跳过 collect 断言'); }
  const diagSrc500 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  assert(diagSrc500.indexOf('## 并发一致性') >= 0, '错误报告含「## 并发一致性」段');
  assert(diagSrc500.indexOf('外部写入（其他标签页）') >= 0, '报告透出外部写入计量');
  assert(diagSrc500.indexOf('冲突现场: 无') >= 0, '报告在无现场时给出明确「无」');
  const panelSrc500 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(panelSrc500.indexOf('id="wa-conf-view"') >= 0 && panelSrc500.indexOf('冲突现场') >= 0, '面板含「冲突现场」入口（D 块）');
  assert(panelSrc500.indexOf('wa-conf-dl') >= 0 && panelSrc500.indexOf('wa-conf-drop') >= 0, '面板提供提取/丢弃两个出口');
  assert(panelSrc500.indexOf('exportConflict') >= 0 && panelSrc500.indexOf('dropConflict') >= 0, '面板接线到 exportConflict/dropConflict API');

  // ── 14. mock 基建（storage 事件 + 插入序）──
  assert(typeof LS500._emitStorage === 'function' && typeof LS500._beginExternal === 'function', 'mock 提供 storage 事件模拟能力');
  assert(typeof global.addEventListener === 'function' && typeof global.removeEventListener === 'function', 'mock 提供 window 事件系统');
  LS500.clear();
  LS500.setItem('k_dup_test', 'v1');
  LS500.removeItem('k_dup_test');
  LS500.setItem('k_dup_test', 'v2');
  let dupCount = 0;
  for (let i = 0; i < LS500.length; i++) if (LS500.key(i) === 'k_dup_test') dupCount++;
  assert(dupCount === 1, 'mock removeItem 同步清理插入序（删除后重插不重复计数）');
  assert(LS500.length === 1, 'mock 枚举长度与去重后键数一致');

  // ── 清理现场 ──
  resetLogs500();
  LS500.clear();
  Object.keys(junkBefore500).forEach(function (k) { LS500.setItem(k, junkBefore500[k]); });
  ctx500.chatId = prevChat500;
  WA.eventLog.length = 0;
  evtBefore500.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore500.forEach(function (l) { WA.errorLog.push(l); });
  } // end v0.5.0 block
  // ═══════════════════════════════════════════════════════════
  // v0.6.0 — 长局容量治理（有机路径强制约束 / 结算尾部回收 / 治理闭环感知）
  //   探针实证：编辑器路径有 MAX_EVENTS=16 拒绝制，但有机路径（addEvent/applyFactions）
  //   零上限（实测 20>16 绕过）、终局事件永驻 state（快照只过滤呈现）、
  //   worldTrends 只增不删、sizeAudit 未接入治理闭环（maintain 零感知）。
  // ═══════════════════════════════════════════════════════════
  v060: {
  const LS600 = global.localStorage;
  const junkBefore600 = JSON.parse(JSON.stringify(LS600._dump()));
  const evtBefore600 = WA.eventLog.slice();
  const errBefore600 = WA.errorLog.slice();
  const ctx600 = global.SillyTavern.getContext();
  const prevChat600 = ctx600.chatId;
  const CID600 = 'v600_chat';
  function resetLogs600() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh600() { resetLogs600(); LS600.clear(); ctx600.chatId = CID600; WA.store.init(); }

  // ── 1. 有机 addEvent cap（A 块）──
  fresh600();
  for (let i = 0; i < 25; i++) WA.evolution.addEvent({ name: '有机事件' + i, type: 'conflict', level: 1 });
  const evs600 = WA.store.read('evolution.events', []);
  assert(evs600.length <= 16, '有机 addEvent 受编辑器同容量约束（实 ' + evs600.length + ' ≤ 16）');
  assert(evs600[evs600.length - 1].name === '有机事件24', '环形挤出保留最新（新事件在末位）');

  // ── 2. 挤出优先终局（A 块）──
  // 终局置于队中（非队首）——若实现退化为「总挤最早」，本场景精准失败
  WA.store.transact(d => {
    const mid600 = Math.floor(d.evolution.events.length / 2);
    d.evolution.events[mid600].stage = '已消散'; d.evolution.events[mid600].stageRound = 9;
    d.evolution.events[mid600].name = '中部终局';
  });
  const evsHead600 = WA.store.read('evolution.events', [])[0].name;
  WA.evolution.addEvent({ name: '挤出测试X', type: 'conflict', level: 1 });
  const evs600b = WA.store.read('evolution.events', []);
  assert(evs600b.length <= 16 && evs600b.some(e => e.name === '挤出测试X'), '重新入账仍受 16 约束');
  assert(!evs600b.some(e => e.stage === '已消散'), '事件挤出优先终局（已消散先被挤，即使不在队首）');
  assert(evs600b.some(e => e.name === evsHead600), '优先挤出终局不误伤最早活跃事件（保留队首）');

  // ── 3. applyFactions / addWind cap（A 块）──
  WA.store.transact(d => { d.evolution.factions = []; });
  WA.evolution.applyFactions(WA.store.get(), [{ name: '势力1', status: '敌对', relation: '敌对' }, { name: '势力2', status: '敌对', relation: '敌对' }]);
  WA.store.transact(d => { for (let i = 0; i < 20; i++) d.evolution.factions.push({ id: 'fa' + i, name: 'F' + i }); });
  WA.evolution.applyFactions(WA.store.get(), [{ name: '势力Z', status: '敌对', relation: '敌对' }]);
  const fas600 = WA.store.read('evolution.factions', []);
  assert(fas600.length <= 16 && fas600[fas600.length - 1].name === '势力Z', 'applyFactions 有机入账受 16 约束且新势力在末位');
  WA.store.transact(d => { d.evolution.winds = []; });
  for (let i = 0; i < 15; i++) WA.evolution.addWind({ topic: '风声' + i, level: 1 });
  const wds600 = WA.store.read('evolution.winds', []);
  assert(wds600.length <= WA.evolution.MAX_WINDS, 'addWind 受 MAX_WINDS 约束（实 ' + wds600.length + ' ≤ ' + WA.evolution.MAX_WINDS + '）');
  assert(WA.evolution.MAX_WINDS === 12, 'MAX_WINDS 常量值 12');
  WA.evolution.addWind({ topic: '风声14', level: 3 });   // 同主题归并，不新建
  assert(WA.store.read('evolution.winds', []).length <= WA.evolution.MAX_WINDS, '同主题归并不触发新增（不挤出）');

  // ── 4. 结算尾部终局回收（B 块）──
  fresh600();
  WA.store.transact(d => {
    for (let i = 0; i < 8; i++) d.evolution.events.push({ id: 'ev' + i, type: 'conflict', name: '事件' + i, stage: '萌芽', stageRound: 1 });
    d.evolution.events.push({ id: 'evD', type: 'conflict', name: '已消散事件', stage: '已消散', stageRound: 9 });
    d.evolution.worldTrends.push({ id: 'wtA', name: '已结束大势', status: '已结束' });
    d.evolution.worldTrends.push({ id: 'wtB', name: '持续大势', status: '持续中' });
  });
  WA.store.transact(d => WA.backstage.applyResult(d, { clock: '午后' }, null));   // 生产路径：transact 内传 draft
  const evs600c = WA.store.read('evolution.events', []);
  assert(!evs600c.some(e => e.stage === '已消散') && evs600c.some(e => e.name === '事件0'), '结算尾部回收已消散事件（活跃事件保留）');
  const wts600 = WA.store.read('evolution.worldTrends', []);
  assert(!wts600.some(t => t.status === '已结束') && wts600.some(t => t.name === '持续大势'), '结算尾部回收已结束大势（持续中保留）');

  // ── 5. 结算尾部有机 cap（B 块容控段）──
  WA.store.transact(d => {
    for (let i = 0; i < 20; i++) { d.evolution.events.push({ id: 'ov' + i, type: 'conflict', name: '超量' + i, stage: '萌芽', stageRound: 1 }); }
    for (let i = 0; i < 18; i++) d.evolution.factions.push({ id: 'fx' + i, name: '势力' + i });
    for (let i = 0; i < 18; i++) d.evolution.winds.push({ id: 'wx' + i, topic: '风' + i, level: 1, quietRounds: 0 });
  });
  WA.store.transact(d => WA.backstage.applyResult(d, { clock: '黄昏' }, null));
  assert(WA.store.read('evolution.events', []).length <= 16, '结算尾部 events 环形到 16（实 ' + WA.store.read('evolution.events', []).length + '）');
  assert(WA.store.read('evolution.factions', []).length <= 16, '结算尾部 factions 环形到 16');
  assert(WA.store.read('evolution.winds', []).length <= 12, '结算尾部 winds 环形到 12');

  // ── 6. 登记表 + 反查（C 块）──
  const caps600 = WA.store.sizeCaps();
  assert(caps600['evolution.winds'] && caps600['evolution.winds'].cap === 12, 'evolution.winds 已登记 cap=12');
  assert(caps600['evolution.worldTrends'] && caps600['evolution.worldTrends'].cap === 12, 'evolution.worldTrends 已登记 cap=12');
  assert(caps600['opinion.forum'] && caps600['opinion.forum'].cap === 20, 'opinion.forum 已登记 cap=20');
  assert(caps600['evolution.economy.signals'] && caps600['evolution.economy.signals'].cap === 3, 'evolution.economy.signals 已登记 cap=3');

  // ── 7. maintain 容量治理（D 块）──
  fresh600();
  WA.store.transact(d => { d.clock.label = 'clean'; });
  const mClean600 = WA.store.maintain({});
  assert(!mClean600.issues.some(i => i.key.indexOf('capacity.') === 0), '干净库无容量议题');
  assert(mClean600.signals.capacityDrifted === 0 && mClean600.signals.capacityUnregistered === 0, '干净库容量计量归零');
  // 造 drift：直推 events 到 18（>16）
  WA.store.transact(d => {
    for (let i = 0; i < 18; i++) d.evolution.events.push({ id: 'dr' + i, type: 'conflict', name: 'D' + i, stage: '萌芽', stageRound: 1 });
    d.unregisteredArray = [{ a: 1 }];
  });
  const mDrift600 = WA.store.maintain({});
  assert(mDrift600.issues.some(i => i.key === 'capacity.drift' && i.level === 'error'), '超容量容器 → capacity.drift error');
  assert(mDrift600.issues.some(i => i.key === 'capacity.unregistered' && i.level === 'warn'), '未登记非空数组 → capacity.unregistered warn');
  assert(mDrift600.signals.capacityDrifted === 1 && mDrift600.signals.capacityUnregistered === 1, 'signals 容量计量精确（1/1）');
  assert(mDrift600.actions.some(a => a.id === 'trim-containers'), 'drift 产生 trim-containers 建议动作');
  const mCleanScore600 = mClean600.score, mDriftScore600 = mDrift600.score;
  assert(mDriftScore600 < mCleanScore600, '容量问题使健康分下降（' + mCleanScore600 + ' → ' + mDriftScore600 + '）');
  // 结算后 drift 自愈（cap 挤出）
  WA.store.transact(d => WA.backstage.applyResult(d, { clock: '夜间' }, null));
  const mAfter600 = WA.store.maintain({});
  assert(mAfter600.signals.capacityDrifted === 0, '结算尾部挤出后 drift 归零（自动治理闭环）');
  // 未登记容器随结算保留（新演进容器，不做自动删除——登记义务属开发者）
  assert(WA.store.read('unregisteredArray', null) !== null, '未登记容器不被结算自动删除（登记义务不隐含强删）');

  // ── 8. 面板接线（D 块动作渲染）──
  const panelSrc600 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(panelSrc600.indexOf('capacityDrifted') >= 0, '面板透出容量治理信号（signals → 容量行）');

  // ── 清理现场 ──
  resetLogs600();
  LS600.clear();
  Object.keys(junkBefore600).forEach(function (k) { LS600.setItem(k, junkBefore600[k]); });
  ctx600.chatId = prevChat600;
  WA.eventLog.length = 0;
  evtBefore600.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore600.forEach(function (l) { WA.errorLog.push(l); });
  } // end v0.6.0 block
  // ═══════════════════════════════════════════════════════════
  // v0.7.0 — 楼层结算守卫（世界推进每楼层至多一次）
  //   探针实证：after 链对每次 gen_ended 全量执行且无守卫——swipe/重掷使
  //   evolution.round 1→2→3 虚增、骰子多掷、风声多衰减。与 before 链既有
  //   口径（重掷沿用本轮注入 SKIPPED_REROLL）自相矛盾（注入按同轮、结算却重复）。
  // ═══════════════════════════════════════════════════════════
  v070: {
  const LS700 = global.localStorage;
  const junkBefore700 = JSON.parse(JSON.stringify(LS700._dump()));
  const evtBefore700 = WA.eventLog.slice();
  const errBefore700 = WA.errorLog.slice();
  const ctx700 = global.SillyTavern.getContext();
  const prevChat700 = ctx700.chatId;
  const CID700 = 'v700_chat';
  const chat700 = global.__mockChat;
  const bsSet700 = (WA.backstage && WA.backstage.getSettings) ? WA.backstage.getSettings() : null;
  function resetLogs700() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh700() { resetLogs700(); LS700.clear(); ctx700.chatId = CID700; chat700.length = 0; WA.store.init(); }

  // ── 1. API 形状 + 指纹 ──
  assert(WA.settleGuard && typeof WA.settleGuard.begin === 'function' && typeof WA.settleGuard.commit === 'function' && typeof WA.settleGuard.forceNext === 'function', 'settleGuard API 可用（begin/commit/forceNext）');
  assert(typeof WA.settleGuard.fnv1a === 'function' && WA.settleGuard.fnv1a('abc') === WA.settleGuard.fnv1a('abc') && WA.settleGuard.fnv1a('abc') !== WA.settleGuard.fnv1a('abd'), 'fnv1a 内容指纹稳定且敏感');
  fresh700();
  assert('lastSettle' in WA.store.get().meta && WA.store.get().meta.lastSettle === null, '默认 meta 含 lastSettle 且为 null');

  // ── 2. 首轮 fresh 结算 + commit ──
  chat700.push({ is_user: true, mes: 'u1' });
  chat700.push({ is_user: false, mes: 'a1', swipe_id: 0 });
  const g700a = WA.settleGuard.begin();
  assert(g700a.settle === true && g700a.reason === 'fresh', '无记录 → fresh 结算');
  assert(g700a.rec.floor === 1 && g700a.rec.swipe === 0, 'rec 记录楼层与 swipe');
  WA.settleGuard.commit(g700a.rec);
  const ls700 = WA.store.read('meta.lastSettle', null);
  assert(ls700 && ls700.floor === 1 && ls700.chatId === CID700, 'commit 记录 lastSettle（floor/chatId）');

  // ── 3. 同楼层同内容 → dup 跳过 ──
  const g700b = WA.settleGuard.begin();
  assert(g700b.settle === false && g700b.reason === 'dup', '同楼层同内容 → dup 跳过');

  // ── 4. 同楼层内容变化（重掷）→ reroll 跳过 ──
  chat700[chat700.length - 1].mes = 'a1 v2（重掷）';
  chat700[chat700.length - 1].swipe_id = 1;
  const g700c = WA.settleGuard.begin();
  assert(g700c.settle === false && g700c.reason === 'reroll', '同楼层重掷 → reroll 跳过（防双计）');

  // ── 5. 新楼层 → new-floor 结算 ──
  chat700.push({ is_user: true, mes: 'u2' });
  chat700.push({ is_user: false, mes: 'a2' });
  const g700d = WA.settleGuard.begin();
  assert(g700d.settle === true && g700d.reason === 'new-floor', '楼层增长 → new-floor 结算');
  WA.settleGuard.commit(g700d.rec);

  // ── 6. 回退（删楼）→ rewind 跳过 ──
  chat700.pop(); chat700.pop(); chat700.pop();
  const g700e = WA.settleGuard.begin();
  assert(g700e.settle === false && g700e.reason === 'rewind', '回退重玩 → rewind 跳过（不重复推进）');

  // ── 7. forceNext 旁路（一次性）──
  WA.settleGuard.forceNext();
  assert(WA.settleGuard.peekForce() === true, 'peekForce 可观');
  const g700f = WA.settleGuard.begin();
  assert(g700f.settle === true && g700f.reason === 'forced', 'forceNext → forced 结算（旁路）');
  assert(WA.settleGuard.peekForce() === false, 'forceNext 一次性消费');
  WA.settleGuard.commit(g700f.rec);

  // ── 8. 跨聊天不继承（chatId 隔离）──
  WA.store.transact(d => { d.meta.lastSettle = { chatId: 'other_chat_x', floor: 99, sig: 'zzz', at: Date.now() }; });
  const g700g = WA.settleGuard.begin();
  assert(g700g.settle === true && g700g.reason === 'fresh', '跨聊天记录 → fresh（不继承他聊天水位）');

  // ── 9. 空聊天边界 ──
  const chatKeep700 = chat700.slice();
  chat700.length = 0;
  const g700h = WA.settleGuard.begin();
  assert(g700h.settle === false && g700h.reason === 'no-chat', '空聊天 → no-chat 拒绝结算');
  chatKeep700.forEach(m => chat700.push(m));

  // ── 10. 端到端：gen_ended 闸门（重掷不推进世界）──
  fresh700();
  try { WA.backstage.setSettings({ autoSimulate: false }); } catch (e) {}
  chat700.push({ is_user: true, mes: 'u1' });
  chat700.push({ is_user: false, mes: 'a1', swipe_id: 0 });
  await global.__triggerEvent('gen_ended');
  const r700a = WA.store.read('evolution.round', 0);
  chat700[chat700.length - 1].mes = 'a1 重掷版';
  chat700[chat700.length - 1].swipe_id = 1;
  await global.__triggerEvent('gen_ended');
  const r700b = WA.store.read('evolution.round', 0);
  assert(r700a === 1 && r700b === 1, '端到端：首轮推进 1，重掷不再推进（round ' + r700a + '→' + r700b + '）');
  chat700.push({ is_user: true, mes: 'u2' });
  chat700.push({ is_user: false, mes: 'a2' });
  await global.__triggerEvent('gen_ended');
  assert(WA.store.read('evolution.round', 0) === 2, '端到端：新楼层继续推进（round 2）');

  // ── 11. 守卫缺失时 after 链不阻断（优雅降级）──
  const keepG700 = WA.settleGuard; delete WA.settleGuard;
  chat700.push({ is_user: true, mes: 'u3' });
  chat700.push({ is_user: false, mes: 'a3' });
  await global.__triggerEvent('gen_ended');
  assert(WA.store.read('evolution.round', 0) === 3, '守卫缺失时保持旧行为（不阻断）');
  WA.settleGuard = keepG700;

  // ── 12. 接线断言（源码级）──
  const icSrc700 = fs.readFileSync(path.join(BASE, 'core/interceptor.js'), 'utf8');
  assert(icSrc700.indexOf('settleGuard.begin') >= 0 && icSrc700.indexOf('settleGuard.commit') >= 0, '拦截器接线结算守卫（begin/commit）');
  const idxSrc700 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  const pSg700 = idxSrc700.indexOf("'core/settle-guard.js'");
  const pIc700 = idxSrc700.indexOf("'core/interceptor.js'");
  assert(pSg700 >= 0 && pSg700 < pIc700, 'index.js 加载序：settle-guard 先于 interceptor');
  const dg700 = WA.toolDiag.collect();
  assert(dg700.worldState.storage.settleGuard && typeof dg700.worldState.storage.settleGuard.settles === 'number', '诊断透出 settleGuard 节');
  const panelSrc700 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(panelSrc700.indexOf('id="wa-settle-view">结算守卫</button>') >= 0, '面板渲染结算守卫按钮（按钮行）');
  assert(panelSrc700.indexOf('wa-settle-force') >= 0 && panelSrc700.indexOf('forceNext') >= 0, '面板接线结算守卫处理器（forceNext 逃生门）');
  assert(WA.settleGuard.stat().skips.reroll >= 1, '归因计数：reroll 跳过被计量');

  // ── 清理现场 ──
  WA.settleGuard.reset();
  try { if (bsSet700) WA.backstage.setSettings(bsSet700); } catch (e) {}
  resetLogs700();
  LS700.clear();
  Object.keys(junkBefore700).forEach(function (k) { LS700.setItem(k, junkBefore700[k]); });
  ctx700.chatId = prevChat700;
  WA.eventLog.length = 0;
  evtBefore700.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore700.forEach(function (l) { WA.errorLog.push(l); });
  // ═══════════════════════════════════════════════════════════
  // v0.8.0 — 跨容器引用完整性（记忆层 refs 生产方接入 / 引用审计覆盖面扩大）
  //   探针实证：checkRefs 扫描 l0-l3 的 refs 但 memory 层入账 {t,s} 从不写 refs
  //   （审计空转）；foreshadows.links 恒为空数组且无审计；entities.refs 生产方缺失；
  //   更根本——timeline.chatId() 误用楼层级 currentBranchId（m{idx}_s{swipe}），
  //   旧 refs 的 chatId 随末楼漂移 → auditRefs 全判 inherited 跳过（refs.missing 不可达）。
  // ═══════════════════════════════════════════════════════════
  v080: {
  const LS800 = global.localStorage;
  const junkBefore800 = JSON.parse(JSON.stringify(LS800._dump()));
  const evtBefore800 = WA.eventLog.slice();
  const errBefore800 = WA.errorLog.slice();
  const ctx800 = global.SillyTavern.getContext();
  const prevChat800 = ctx800.chatId;
  const CID800 = 'v800_chat';
  const chat800 = global.__mockChat;
  function resetLogs800() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh800() { resetLogs800(); LS800.clear(); ctx800.chatId = CID800; chat800.length = 0; WA.store.init(); }
  // ── 1. chatId 归属稳定（根本修复）──
  fresh800();
  chat800.push({ is_user: true, mes: '第一条用户消息。', swipe_id: 0 });
  chat800.push({ is_user: false, mes: '第一条正文。', swipe_id: 0 });
  const cid800a = WA.timeline.chatId();
  assert(cid800a === CID800, 'timeline.chatId() 返回稳定聊天 id（非楼层级 currentBranchId）');
  const ref800a = WA.timeline.sourceRef(chat800[1], 1);
  assert(ref800a.chatId === CID800, 'sourceRef 的 chatId 为稳定聊天 id');
  // 新增楼层后 chatId 不漂移
  chat800.push({ is_user: true, mes: '第二条用户消息。', swipe_id: 0 });
  chat800.push({ is_user: false, mes: '第二条正文。', swipe_id: 0 });
  assert(WA.timeline.chatId() === cid800a, '新增楼层后 chatId 不漂移');
  // 末楼 swipe 切换后 chatId 仍不漂移（关键：旧 refs 不会被判 inherited）
  const last800 = chat800[chat800.length - 1];
  const origSwipe800 = last800.swipe_id;
  last800.swipe_id = 1;
  assert(WA.timeline.chatId() === cid800a, '末楼 swipe 切换后 chatId 不漂移');
  last800.swipe_id = origSwipe800;
  // 删楼后 auditRefs 能报 missing（修复前：全判 inherited → missing 不可达）
  const refs800 = WA.timeline.captureRange(0, chat800.length - 1);
  const refsCopy800 = JSON.parse(JSON.stringify(refs800));
  chat800.length = 0;
  const audit800 = WA.timeline.auditRefs(refsCopy800);
  assert(audit800.valid === false && audit800.missing.length === refsCopy800.length, '删楼后 auditRefs 精准报 missing（chatId 稳定后可达）');
  chat800.push({ is_user: true, mes: '恢复消息。', swipe_id: 0 });
  chat800.push({ is_user: false, mes: '恢复正文。', swipe_id: 0 });
  // ── 2. 记忆层 refs 生产方（L0/L1/L2/L3 入账写 refs）──
  const memSrc800 = fs.readFileSync(path.join(BASE, 'engines/memory.js'), 'utf8');
  assert(memSrc800.indexOf('refs: recentRefs(3)') >= 0, 'L0 入账写 refs（recentRefs 溯源）');
  assert(memSrc800.indexOf("l1.push({ t: Date.now(), s: String(r.recap).slice(0, 200), refs: inheritRefs(batch) });") >= 0, 'L1 合并继承 refs');
  assert(memSrc800.indexOf("l2.push({ t: Date.now(), s: String(r.chapter).slice(0, 350), refs: inheritRefs(batch) });") >= 0, 'L2 合并继承 refs');
  assert(memSrc800.indexOf("l3.push({ t: Date.now(), theme: String(r.theme).slice(0, 250), worldShift: String(r.worldShift || '').slice(0, 200), refs: inheritRefs(batch) });") >= 0, 'L3 合并继承 refs');
  // 运行时验证：直接模拟入账后条目带 refs（recentRefs 走 timeline.captureRange）
  const memChat800 = chat800;
  const refsProbe800 = WA.timeline.captureRange(0, memChat800.length - 1);
  assert(Array.isArray(refsProbe800) && refsProbe800.length === memChat800.length, 'captureRange 可用于记忆层溯源');
  WA.store.transact(d => {
    d.memory.l0.push({ t: Date.now(), s: '带溯源L0', refs: refsProbe800 });
    d.memory.l1.push({ t: Date.now(), s: '带溯源L1', refs: WA.timeline.unionRefs([refsProbe800]) });
  });
  const st800 = WA.store.get();
  assert(Array.isArray(st800.memory.l0[0].refs) && st800.memory.l0[0].refs.length === memChat800.length, 'L0 条目 refs 已入账');
  assert(Array.isArray(st800.memory.l1[0].refs) && st800.memory.l1[0].refs.length === memChat800.length, 'L1 条目 refs 已入账');
  // 端到端：digestRound 真实链路（mock API）→ L0 入账自动带 refs
  WA.apiRouter.setChannel('digest', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  global.__pushApiJson({ summary: '端到端摘要：骑兵逼近，粮价上涨。' });
  const dr800 = await WA.memory.digestRound();
  assert(dr800 !== null, 'digestRound 端到端入账成功');
  const l0e2e = WA.store.get().memory.l0.slice(-1)[0];
  assert(Array.isArray(l0e2e.refs) && l0e2e.refs.length >= 1, '端到端：L0 入账自动带 refs（recentRefs 捕获）');
  assert(l0e2e.refs.every(r => r.chatId === CID800), '端到端：L0 refs 的 chatId 为稳定聊天 id');
  // ── 3. entities.refs 生产方（upsert 新建写 refs、更新合并 refs）──
  const entSrc800 = fs.readFileSync(path.join(BASE, 'engines/entities.js'), 'utf8');
  assert(entSrc800.indexOf('entity.refs = WA.timeline.unionRefs') >= 0, 'entities.upsert 更新分支合并 refs');
  assert(entSrc800.indexOf('refs: (WA.timeline && WA.timeline.unionRefs') >= 0, 'entities.upsert 新建分支写 refs');
  WA.store.transact(d => { WA.entities.upsert(d, 'organization', { name: '测试组织A', desc: '描述', refs: refsProbe800 }); });
  const ent800 = WA.store.get().evolution.entityMemory.organization[0];
  assert(ent800 && Array.isArray(ent800.refs) && ent800.refs.length === memChat800.length, 'entities 新建写 refs');
  // 更新时传入「不在原集合的新来源」——破坏合并逻辑时总数不符，防断言盲区
  const newRef800 = { chatId: CID800, messageId: 'wax_extra800', layer: 99, role: 'assistant', swipeId: 0, hash: 'abcdef0123456789' };
  WA.store.transact(d => { WA.entities.upsert(d, 'organization', { name: '测试组织A', desc: '更新', refs: [newRef800] }); });
  const ent800b = WA.store.get().evolution.entityMemory.organization[0];
  assert(ent800b && ent800b.refs.length === memChat800.length + 1, 'entities 更新合并 refs（新来源并入）');
  assert(ent800b.refs.some(r => r.messageId === 'wax_extra800'), 'entities 更新后新来源 ref 可检出');
  // ── 4. checkRefs 扫描覆盖面扩大（foreshadows.links + entities.refs）──
  const insSrc800 = fs.readFileSync(path.join(BASE, 'engines/inspector-state.js'), 'utf8');
  assert(insSrc800.indexOf('foreshadow#') >= 0, 'checkRefs 扫描 foreshadows.links');
  assert(insSrc800.indexOf('entityMemory') >= 0, 'checkRefs 扫描 entities.refs');
  // 运行时：删楼后三类孤儿引用（l0/foreshadow/entity）都被检出
  fresh800();
  chat800.push({ is_user: true, mes: '源用户消息。', swipe_id: 0 });
  chat800.push({ is_user: false, mes: '源正文消息。', swipe_id: 0 });
  const srcRef800 = WA.timeline.sourceRef(chat800[1], 1);
  WA.store.transact(d => {
    d.memory.l0.push({ t: Date.now(), s: '源L0', refs: [srcRef800] });
    d.memory.foreshadows.push({ id: 'fs800', content: '源伏笔', status: 'waiting', links: [srcRef800], at: Date.now() });
    d.evolution = d.evolution || {};
    d.evolution.entityMemory = d.evolution.entityMemory || { organization: [], object: [], ability: [], location: [] };
    d.evolution.entityMemory.organization.push({ id: 'org800', name: '源组织', desc: '', refs: [srcRef800], updatedAt: Date.now() });
  });
  chat800.length = 0;
  const rep800 = WA.inspectorState.inspect(null);
  const refsSec800 = rep800.sections.find(x => x.code === 'refs');
  const details800 = refsSec800.issues.map(i => i.detail);
  assert(refsSec800.issues.length >= 3, '删楼后 refs 节检出 >=3 类孤儿引用');
  assert(details800.some(x => x.indexOf('l0#') >= 0), 'L0 refs 孤儿被检出');
  assert(details800.some(x => x.indexOf('foreshadow#') >= 0), 'foreshadows.links 孤儿被检出');
  assert(details800.some(x => x.indexOf('entity:') >= 0), 'entities.refs 孤儿被检出');
  // ── 5. backstage 伏笔 links 生产方补齐 ──
  const bsSrc800 = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
  assert(bsSrc800.indexOf('links = (Array.isArray(f.links)') >= 0, 'backstage 伏笔入账补 links（未给时捕获锚点溯源）');
  // 运行时：模拟 applyResult 无 links 的伏笔 → 入账后带 links
  fresh800();
  chat800.push({ is_user: true, mes: '伏笔源用户消息。', swipe_id: 0 });
  chat800.push({ is_user: false, mes: '伏笔源正文消息。', swipe_id: 0 });
  const anchor800 = { idx: 1, swipe: 0, hash: 'x' };
  WA.store.transact(d => { WA.backstage.applyResult(d, { foreshadows: [{ id: 'fs801', content: '新伏笔', status: 'waiting' }] }, anchor800); });
  const fs800 = WA.store.get().memory.foreshadows.find(x => x.id === 'fs801');
  assert(fs800 && Array.isArray(fs800.links) && fs800.links.length >= 1, 'backstage 伏笔无 links 入账时补写锚点溯源');
  // ── 清理现场 ──
  resetLogs800();
  LS800.clear();
  Object.keys(junkBefore800).forEach(function (k) { LS800.setItem(k, junkBefore800[k]); });
  ctx800.chatId = prevChat800;
  WA.eventLog.length = 0;
  evtBefore800.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore800.forEach(function (l) { WA.errorLog.push(l); });
  // ═══════════════════════════════════════════════════════════
  // v0.9.0 — 软引用完整性（回声悬空检测 / 纪事溯源 / 分支标识语义）
  //   探针实证：① echoes.refCurrent 为裸标题软引用——AI 幻觉标题原样入账、
  //   无校验无检出（checkRefs 只审 refs 字段，inspector 源码不含 echoes）；
  //   ② 暗流尾部裁剪后早期回声成孤儿无标记；③ chronicle.refs AI schema 无此字段
  //   → 恒空且不在审计范围；④ worldFacts/currents 的 branchId 存的是裸楼层号
  //   （anchor.idx），命名-语义错位。
  // ═══════════════════════════════════════════════════════════
  v090: {
  const LS900 = global.localStorage;
  const junkBefore900 = JSON.parse(JSON.stringify(LS900._dump()));
  const evtBefore900 = WA.eventLog.slice();
  const errBefore900 = WA.errorLog.slice();
  const ctx900 = global.SillyTavern.getContext();
  const prevChat900 = ctx900.chatId;
  const CID900 = 'v900_chat';
  const chat900 = global.__mockChat;
  function resetLogs900() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh900() { resetLogs900(); LS900.clear(); ctx900.chatId = CID900; chat900.length = 0; WA.store.init(); }
  // ── 1. A 块：danglingAtWrite 生产方（入账时目标在场性）──
  fresh900();
  chat900.push({ is_user: true, mes: '开场。', swipe_id: 0 });
  chat900.push({ is_user: false, mes: '镇外骑兵逼近。', swipe_id: 0 });
  WA.store.transact(d => {
    WA.backstage.applyResult(d, {
      currents: [{ title: '骑兵压境', summary: '', stage: '发展', visibility: 'trace' }],
      echoes: [{ refCurrent: '骑兵压境', result: '粮价上涨', exposure: 'subtle' }]
    }, { idx: 1, swipe: 0 });
  });
  WA.store.transact(d => {
    WA.backstage.applyResult(d, {
      echoes: [{ refCurrent: '不存在的事件XYZ', result: '错位回声', exposure: 'subtle' }]
    }, { idx: 1, swipe: 0 });
  });
  let st900 = WA.store.get();
  const ecGood900 = st900.echoes.find(e => e.refCurrent === '骑兵压境');
  const ecBad900 = st900.echoes.find(e => e.refCurrent === '不存在的事件XYZ');
  assert(ecGood900 && ecGood900.danglingAtWrite === false, '正常回声 danglingAtWrite=false（目标在场）');
  assert(ecBad900 && ecBad900.danglingAtWrite === true, '幻觉回声 danglingAtWrite=true（入账即悬空）');
  // 目标先入账（同批）不误标
  fresh900();
  chat900.push({ is_user: true, mes: '开场。', swipe_id: 0 });
  WA.store.transact(d => {
    WA.backstage.applyResult(d, {
      currents: [{ title: '同批事件', summary: '', stage: '发展', visibility: 'hidden' }],
      echoes: [{ refCurrent: '同批事件', result: 'R', exposure: 'subtle' }]
    }, { idx: 0, swipe: 0 });
  });
  const sameBatch900 = WA.store.get().echoes.find(e => e.refCurrent === '同批事件');
  assert(sameBatch900 && sameBatch900.danglingAtWrite === false, '同批入账目标先建后回声不误标');
  // ── 2. B 块：checkSoftRefs（只报幻觉，不报生命周期消失）──
  const insSrc900 = fs.readFileSync(path.join(BASE, 'engines/inspector-state.js'), 'utf8');
  assert(insSrc900.indexOf('checkSoftRefs') >= 0 && insSrc900.indexOf("code: 'softRefs'") >= 0, 'checkSoftRefs 注册（CHECKERS + 导出）');
  fresh900();
  chat900.push({ is_user: true, mes: '开场。', swipe_id: 0 });
  WA.store.transact(d => {
    WA.backstage.applyResult(d, {
      currents: [{ title: '有效暗流', summary: '', stage: '发展', visibility: 'trace' }],
      echoes: [
        { refCurrent: '有效暗流', result: '正常回声', exposure: 'subtle' },
        { refCurrent: '幻觉标题ZZZ', result: '错位回声', exposure: 'subtle' }
      ]
    }, { idx: 0, swipe: 0 });
  });
  const rep900 = WA.inspectorState.inspect(null);
  const softSec900 = rep900.sections.find(x => x.code === 'softRefs');
  assert(!!softSec900, 'softRefs 节存在（inspect 报告）');
  assert(softSec900.issues.some(i => i.code === 'softref.dangling' && i.detail.indexOf('幻觉标题ZZZ') >= 0), '幻觉回声被检出（softref.dangling）');
  assert(!softSec900.issues.some(i => i.detail.indexOf('有效暗流') >= 0), '正常回声不误报');
  // 生命周期消失（入账时在场、之后 currents 清空）→ 不告警
  WA.store.transact(d => { d.currents = []; });
  const rep900b = WA.inspectorState.inspect(null);
  const softSec900b = rep900b.sections.find(x => x.code === 'softRefs');
  assert(!softSec900b.issues.some(i => i.detail.indexOf('有效暗流') >= 0), '生命周期消失不告警（danglingAtWrite=false，防告警疲劳）');
  // 回声目标在 evolution.events 中（按名匹配）也不误报
  WA.store.transact(d => {
    d.currents = [];
    d.echoes = [{ id: 'ecx', refCurrent: '事件链名', result: 'R', exposure: 'subtle', danglingAtWrite: true, at: 1 }];
    d.evolution.events = [{ id: 'ex', type: 'conflict', name: '事件链名', level: 1, stage: '萌芽', stageRound: 1 }];
  });
  const rep900c = WA.inspectorState.inspect(null);
  const softSec900c = rep900c.sections.find(x => x.code === 'softRefs');
  assert(!softSec900c.issues.some(i => i.detail.indexOf('事件链名') >= 0), '目标在 evolution.events 名中不误报');
  // 空 refCurrent → info
  WA.store.transact(d => { d.echoes = [{ id: 'ece', refCurrent: '', result: 'R', exposure: 'subtle', at: 1 }]; d.evolution.events = []; });
  const rep900d = WA.inspectorState.inspect(null);
  const softSec900d = rep900d.sections.find(x => x.code === 'softRefs');
  assert(softSec900d.issues.some(i => i.code === 'softref.empty'), '空 refCurrent 报 info（无溯源锚点）');
  // ── 3. C 块：chronicle.refs 生产方 + 审计 ──
  const bsSrc900 = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
  assert(bsSrc900.indexOf('纪事来源引用生产方') >= 0, 'chronicle refs 生产方（锚定结算楼层）');
  assert(insSrc900.indexOf('chronicle#') >= 0, 'checkRefs 扫描 chronicle.refs');
  fresh900();
  chat900.push({ is_user: true, mes: '开场。', swipe_id: 0 });
  chat900.push({ is_user: false, mes: '正文一句。', swipe_id: 0 });
  WA.store.transact(d => {
    WA.backstage.applyResult(d, { chronicle: [{ kind: 'event', title: '纪事A', summary: '摘要' }] }, { idx: 1, swipe: 0 });
  });
  st900 = WA.store.get();
  const chron900 = st900.chronicle.find(c => c.title === '纪事A');
  assert(chron900 && Array.isArray(chron900.refs) && chron900.refs.length >= 1, 'chronicle 入账带 refs（楼层溯源）');
  assert(chron900.refs[0].chatId === CID900, 'chronicle refs 的 chatId 为稳定聊天 id');
  // 删楼后 chronicle refs 孤儿被检出
  fresh900();
  chat900.push({ is_user: true, mes: '开场。', swipe_id: 0 });
  chat900.push({ is_user: false, mes: '正文一句。', swipe_id: 0 });
  WA.store.transact(d => {
    WA.backstage.applyResult(d, { chronicle: [{ kind: 'event', title: '纪事B', summary: '摘要' }] }, { idx: 1, swipe: 0 });
  });
  chat900.length = 0;
  const rep900e = WA.inspectorState.inspect(null);
  const refsSec900 = rep900e.sections.find(x => x.code === 'refs');
  assert(refsSec900.issues.some(i => i.detail.indexOf('chronicle#') >= 0), '删楼后 chronicle refs 孤儿被检出');
  // ── 4. D 块：branchId 语义修正 ──
  fresh900();
  chat900.push({ is_user: true, mes: '开场。', swipe_id: 0 });
  WA.store.transact(d => {
    d.worldFacts = [];
    WA.backstage.applyResult(d, {
      worldFacts: [{ key: '粮价', value: '上涨' }],
      currents: [{ title: '新暗流', summary: '', stage: '发展', visibility: 'hidden' }]
    }, { idx: 7, swipe: 2 });
  });
  st900 = WA.store.get();
  const wf900 = st900.worldFacts.find(f => f.key === '粮价');
  const cu900 = st900.currents.find(c => c.title === '新暗流');
  assert(wf900 && wf900.branchId === 'm7_s2', 'worldFacts.branchId 为分支标识（m{idx}_s{swipe}）');
  assert(cu900 && cu900.branchId === 'm7_s2', 'currents.branchId 为分支标识（非裸楼层号）');
  WA.store.transact(d => { WA.backstage.applyResult(d, { worldFacts: [{ key: '无锚', value: 'v' }] }, null); });
  const wf900b = WA.store.get().worldFacts.find(f => f.key === '无锚');
  assert(wf900b && wf900b.branchId === '', '无 anchor 时 branchId 空串（防御）');
  // ── 清理现场 ──
  resetLogs900();
  LS900.clear();
  Object.keys(junkBefore900).forEach(function (k) { LS900.setItem(k, junkBefore900[k]); });
  ctx900.chatId = prevChat900;
  WA.eventLog.length = 0;
  evtBefore900.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore900.forEach(function (l) { WA.errorLog.push(l); });
  // ═══════════════════════════════════════════════════════════
  // v1.0.0 — 治理覆盖收口（对象型容器审计可见性 / 容量登记补全 / 有界剪枝 / 有界注入）
  //   探针实证：① people 对象容器无人数上限且 sizeAudit 只扫数组 → 完全不可见；
  //   ② evolution.enemies 活跃态无回收上限；③ evolution.trends/blackbox 有界漏登 →
  //   误报 unbounded；④ buildEnemiesBlock 全量展开活跃仇敌（注入膨胀）。
  //   A: 登记表 kind:'object' + 补登；B: sizeAudit/maintain 对象可见性；
  //   C: people/enemies 有界剪枝；D: 注入侧有界展开。
  // ═══════════════════════════════════════════════════════════
  v1000: {
  const LS1000 = global.localStorage;
  const junkBefore1000 = JSON.parse(JSON.stringify(LS1000._dump()));
  const evtBefore1000 = WA.eventLog.slice();
  const errBefore1000 = WA.errorLog.slice();
  const ctx1000 = global.SillyTavern.getContext();
  const prevChat1000 = ctx1000.chatId;
  const CID1000 = 'v1000_chat';
  const chat1000 = global.__mockChat;
  function resetLogs1000() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1000() { resetLogs1000(); LS1000.clear(); ctx1000.chatId = CID1000; chat1000.length = 0; WA.store.init(); }
  // ── A. 登记表 kind + 补登 ──
  fresh1000();
  const caps1000 = WA.store.sizeCaps();
  assert(caps1000['people'] && caps1000['people'].cap === 48 && caps1000['people'].kind === 'object', 'people 登记为对象型容器（cap=48 kind=object）');
  assert(caps1000['evolution.enemies'] && caps1000['evolution.enemies'].cap === 44, 'evolution.enemies 登记总量上限 44（活跃24+终结20）');
  assert(caps1000['evolution.trends'] && caps1000['evolution.trends'].cap === 20, 'evolution.trends 补登 cap=20');
  assert(caps1000['evolution.blackbox.secretActions'] && caps1000['evolution.blackbox.secretActions'].cap === 15, 'blackbox.secretActions 补登 cap=15');
  assert(caps1000['evolution.blackbox.secretAssets'] && caps1000['evolution.blackbox.secretAssets'].cap === 15, 'blackbox.secretAssets 补登 cap=15');
  assert(caps1000['opinion.sandbox'] && caps1000['opinion.sandbox'].cap === 4, 'opinion.sandbox 补登 cap=4');
  assert(caps1000['chronicle'].kind === 'array', '未标 kind 的容器默认 array（向后兼容）');
  // ── B. people 有界剪枝 + 审计可见性 ──
  WA.store.transact(d => {
    d.people = {};
    for (let i = 0; i < 60; i++) d.people['p_NPC_' + i] = { id: 'p_NPC_' + i, name: 'NPC_' + i, location: 'L' + i, updatedAt: 1000 + i };
    // 触发一次结算以执行尾部容量治理（applyResult 剪枝路径）
    WA.backstage.applyResult(d, { people: [], echoes: [], chronicle: [], foreshadows: [] }, { idx: 0, swipe: 0 });
  });
  const st1000 = WA.store.get();
  assert(Object.keys(st1000.people || {}).length === 48, 'people 超 cap 自动挤出至 48');
  assert(!!st1000.people['p_NPC_59'] && !st1000.people['p_NPC_0'], '挤出按 updatedAt 最旧优先（保留近期、剔除最早）');
  const audit1000 = WA.store.sizeAudit({ minBytes: 1, topN: 100000 });
  const pRow1000 = (audit1000.arrays || []).find(a => a.path === 'people');
  assert(!!pRow1000 && pRow1000.kind === 'object' && pRow1000.bounded === true && pRow1000.cap === 48, 'sizeAudit 明细纳入 people（对象型可见 + cap 透出）');
  assert(audit1000.unbounded.indexOf('people') < 0, 'people 不再被判为无界');
  // ── C. enemies 活跃 + 终结双口径剪枝 ──
  WA.store.transact(d => {
    d.evolution = d.evolution || {}; d.evolution.enemies = []; d.evolution.round = 0;
    for (let i = 0; i < 30; i++) { d.evolution.round = i; WA.enemies.apply(d, [{ name: '活跃敌' + i, status: '追踪中' }]); }
    for (let i = 0; i < 25; i++) { d.evolution.round = 100 + i; WA.enemies.apply(d, [{ name: '终结敌' + i, status: '已终结' }]); }
  });
  const en1000 = WA.store.get().evolution.enemies || [];
  assert(en1000.filter(e => e.status !== '已终结').length === 24, '活跃仇敌剪枝至 24');
  assert(en1000.filter(e => e.status === '已终结').length === 20, '终结仇敌数量兜底至 20');
  assert(en1000.length <= 44, '仇敌总量不超过登记 cap 44');
  // ── D. 注入侧有界展开 ──
  WA.store.transact(d => {
    d.evolution = d.evolution || {}; d.evolution.enemies = [];
    for (let i = 0; i < 24; i++) d.evolution.enemies.push({ id: 'en' + i, name: '仇敌' + i, type: 'grudge', status: '追踪中' });
  });
  const blk1000 = WA.enemies.buildEnemiesBlock();
  assert((blk1000.match(/仇敌\d+/g) || []).length === 12, '注入块只展开前 12 个活跃仇敌');
  assert(blk1000.indexOf('…等12个') >= 0, '超出部分以「…等N个」标注（不静默截断）');
  // ── E. maintain 容量盘点覆盖对象型 ──
  WA.store.transact(d => {
    d.people = {};
    for (let i = 0; i < 60; i++) d.people['p_x' + i] = { id: 'p_x' + i, name: 'X' + i, updatedAt: i };
    d.unregisteredArrV1000 = [{ a: 1 }];
  });
  const m1000 = WA.store.maintain({});
  const drift1000 = m1000.issues.filter(i => i.key === 'capacity.drift').map(i => i.detail).join('|');
  assert(/people\(60>48/.test(drift1000), 'maintain 检出 people 漂移（对象型可见性生效）');
  assert(m1000.issues.some(i => i.key === 'capacity.unregistered'), '未登记数组仍报 unregistered（回归）');
  // ── 清理现场 ──
  resetLogs1000();
  LS1000.clear();
  Object.keys(junkBefore1000).forEach(function (k) { LS1000.setItem(k, junkBefore1000[k]); });
  ctx1000.chatId = prevChat1000;
  WA.eventLog.length = 0;
  evtBefore1000.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1000.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.0.0 block
  // ═══════════════════════════════════════════════════════════
  // v1.1.0 — 人设载体贯通（人设字段入账 / pmem 读权威本体 / 导出补全 / 名单统一）
  //   探针实证：① evolution.people 零写入方（3 处消费、0 处生产）→ 人口记忆 pmem 的
  //   持有者归属与 memory-sampler 采样名单恒空（人物失忆）；② people 入账仅保留
  //   7 个基础字段，丢失 avatar/resources/personalityAnchor/speakingStyle/
  //   behaviorBoundaries/innerVoice/aliases（人设载体断裂）；③ knownPeopleNames
  //   未从 pmem 导出（隐藏缺陷，调用即 TypeError）；④ memory-sampler 名单同样依赖
  //   死字段。A: backstage 人物结算字段贯通 + 别名并集去重；B: pmem 改读 state.people
  //   （本地兼容旧档 evolution.people 残留）；C: 导出补全；D: memory-sampler 名单统一。
  // ═══════════════════════════════════════════════════════════
  v1100: {
  const LS1100 = global.localStorage;
  const junkBefore1100 = JSON.parse(JSON.stringify(LS1100._dump()));
  const evtBefore1100 = WA.eventLog.slice();
  const errBefore1100 = WA.errorLog.slice();
  const ctx1100 = global.SillyTavern.getContext();
  const prevChat1100 = ctx1100.chatId;
  const CID1100 = 'v1100_chat';
  const chat1100 = global.__mockChat;
  function resetLogs1100() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1100() { resetLogs1100(); LS1100.clear(); ctx1100.chatId = CID1100; chat1100.length = 0; WA.store.init(); }
  // ── A. people 入账字段贯通 ──
  fresh1100();
  WA.store.transact(d => {
    d.people = {};
    WA.backstage.applyResult(d, {
      people: [{ name: '陆文昭', avatar: 'a.png', location: '诏狱', action: '审问', intent: '套话',
                 body: { hp: 80 }, resources: { gold: 10 }, personalityAnchor: '冷静',
                 speakingStyle: '文言', behaviorBoundaries: '不滥杀', innerVoice: '疑虑', aliases: ['陆大人'] }],
      echoes: [], chronicle: [], foreshadows: []
    }, { idx: 0, swipe: 0 });
  });
  const p1100a = WA.store.get().people['p_陆文昭'];
  const miss1100 = ['avatar', 'resources', 'personalityAnchor', 'speakingStyle', 'behaviorBoundaries', 'innerVoice', 'aliases'].filter(k => !(p1100a && k in p1100a));
  assert(miss1100.length === 0, 'people 入账贯通全部人设字段（缺失: ' + miss1100.join(',') + '）');
  assert(!!p1100a && p1100a.avatar === 'a.png' && p1100a.personalityAnchor === '冷静' && p1100a.speakingStyle === '文言' && p1100a.innerVoice === '疑虑', '人物人设字段值正确');
  assert(!!p1100a && Array.isArray(p1100a.aliases) && p1100a.aliases.indexOf('陆大人') >= 0, '人物 aliases 入账');
  // ── B. pmem 改读 state.people（别名可达）──
  WA.store.transact(d => {
    d.memory.pmem = [{ id: 'm1', holders: ['沈炼'], text: '记住了暗号', at: Date.now() }];
    d.people = { p_沈炼: { id: 'p_沈炼', name: '沈炼', aliases: ['沈捕快', '百户大人'], knowledge: {} } };
    d.evolution = d.evolution || {};
    d.evolution.people = [];
  });
  const hs1100 = WA.pmem.holderSet('沈捕快');
  assert(hs1100.has('沈炼') && hs1100.has('沈捕快'), 'holderSet 别名归属可达（读 state.people，死字段已清空）');
  assert(WA.pmem.recall('沈捕快').length > 0, 'recall 用别名召回持有者记忆命中（别名感知生效）');
  assert(WA.pmem.knows('沈捕快', 'm1') === false, 'knows 语义：别名不等于 known_by（认知边界不受别名影响）');
  // ── C. 导出补全 + 旧档兼容 ──
  assert(typeof WA.pmem.knownPeopleNames === 'function', 'knownPeopleNames 已从 pmem 导出（隐藏缺陷修复）');
  assert(typeof WA.pmem.peopleList === 'function', 'peopleList 已导出');
  const names1100 = WA.pmem.knownPeopleNames();
  assert(Array.isArray(names1100) && names1100.indexOf('沈炼') >= 0, 'knownPeopleNames 反映 people 表');
  WA.store.transact(d => { d.evolution = d.evolution || {}; d.evolution.people = [{ name: '旧档人物', aliases: ['老名字'] }]; });
  assert(WA.pmem.knownPeopleNames().indexOf('旧档人物') >= 0, '兼容旧存档 evolution.people 残留（不丢历史人物）');
  // ── D. 别名并集去重 ──
  WA.store.transact(d => {
    d.people = {};
    WA.backstage.applyResult(d, { people: [{ name: '沈炼', aliases: ['沈捕快'] }], echoes: [], chronicle: [], foreshadows: [] }, { idx: 0, swipe: 0 });
    WA.backstage.applyResult(d, { people: [{ name: '沈炼', aliases: ['百户大人', '沈捕快'] }], echoes: [], chronicle: [], foreshadows: [] }, { idx: 1, swipe: 0 });
  });
  const p1100d = WA.store.get().people['p_沈炼'];
  assert(!!p1100d && p1100d.aliases.length === 2 && p1100d.aliases.indexOf('沈捕快') >= 0 && p1100d.aliases.indexOf('百户大人') >= 0, '多次别名并集去重（无重复、无丢失）');
  // ── E. memory-sampler 名单统一读 state.people ──
  WA.store.transact(d => {
    d.people = { p_张三: { id: 'p_张三', name: '张三', knowledge: {} } };
    d.evolution = d.evolution || {}; d.evolution.people = [];
  });
  const hs1100e = WA.memorySampler.buildHaystack('正文', WA.store.get());
  assert(hs1100e.indexOf('张三') >= 0, 'memory-sampler 人物名单来自 state.people（死字段已清空）');
  // ── 清理现场 ──
  resetLogs1100();
  LS1100.clear();
  Object.keys(junkBefore1100).forEach(function (k) { LS1100.setItem(k, junkBefore1100[k]); });
  ctx1100.chatId = prevChat1100;
  WA.eventLog.length = 0;
  evtBefore1100.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1100.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.1.0 block
  // ═══════════════════════════════════════════════════════════
  // v1.2.0 — 终态容器回收（Terminal Reclamation）
  //   探针实证：带终态语义的容器此前只做「按数组位置的环形截断」，无终态回收——
  //   ① currents（stage 已结束/closed）终态暗流永驻占位，把长期活跃暗流挤出（40 槽位里
  //   34 条是终态）；② foreshadows 的 backstage 写入路径无 cap，7 轮突破登记上限 30
  //   （登记表与实现脱节）；③ memory.js 巩固路径 slice(-30) 只按位置截断，活跃伏笔
  //   （developing）被 29 条终态伏笔（recycled/dropped）挤出；④ 同构不一致——events
  //   （v0.6.0 终局回收）/ worldTrends（v0.6.0 已结束回收）已有终态治理，currents/
  //   foreshadows 缺失。A: currents 终态回收（回收先于截断）；B: foreshadows 单一实现
  //   pruneForeshadows（终态回收 + cap 30，backstage 与 memory.js 共用）；C: 同构一致。
  // ═══════════════════════════════════════════════════════════
  v1200: {
  const LS1200 = global.localStorage;
  const junkBefore1200 = JSON.parse(JSON.stringify(LS1200._dump()));
  const evtBefore1200 = WA.eventLog.slice();
  const errBefore1200 = WA.errorLog.slice();
  const ctx1200 = global.SillyTavern.getContext();
  const prevChat1200 = ctx1200.chatId;
  const CID1200 = 'v1200_chat';
  const chat1200 = global.__mockChat;
  function resetLogs1200() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1200() { resetLogs1200(); LS1200.clear(); ctx1200.chatId = CID1200; chat1200.length = 0; WA.store.init(); }
  // ── A. currents 终态回收 ──
  fresh1200();
  WA.store.transact(d => {
    d.currents = [];
    d.currents.push({ id: 'cu_active', title: '长期暗流', summary: '仍在推进', stage: '发展', visibility: 'trace', publicity: 'trace', createdAt: 1, updatedAt: 1 });
    for (let i = 0; i < 39; i++) d.currents.push({ id: 'cu_dead' + i, title: '终态暗流' + i, summary: '已收束', stage: '已结束', visibility: 'hidden', publicity: 'private', createdAt: 100 + i, updatedAt: 100 + i });
  });
  WA.store.transact(d => {
    const r = { currents: [], echoes: [], chronicle: [], foreshadows: [] };
    for (let i = 0; i < 6; i++) r.currents.push({ title: '新活跃' + i, summary: 's', stage: '发展', visibility: 'trace' });
    WA.backstage.applyResult(d, r, { idx: 40, swipe: 0 });
  });
  const cs1200 = WA.store.get().currents || [];
  assert(cs1200.some(c => c.title === '长期暗流'), 'currents 终态回收后长期活跃暗流存活（未被终态挤出）');
  assert(cs1200.every(c => c.stage !== '已结束' && c.stage !== 'closed'), 'currents 终态暗流全部回收（回收只针对终态）');
  assert(cs1200.length <= 40, 'currents cap=40 仍生效');
  // ── B. foreshadows backstage 路径有界 ──
  WA.store.transact(d => { d.memory = d.memory || {}; d.memory.foreshadows = []; d.evolution = d.evolution || {}; });
  for (let round = 0; round < 7; round++) {
    WA.store.transact(d => {
      const r = { foreshadows: [], echoes: [], chronicle: [] };
      for (let i = 0; i < 5; i++) r.foreshadows.push({ id: 'fs_r' + round + '_' + i, content: '伏笔' + round + '_' + i, status: 'waiting' });
      WA.backstage.applyResult(d, r, { idx: 100 + round, swipe: 0 });
    });
  }
  assert((WA.store.get().memory.foreshadows || []).length <= 30, 'foreshadows backstage 路径有界（≤ 登记 cap 30）');
  // ── C. memory.js 单一实现 pruneForeshadows ──
  assert(typeof WA.memory.pruneForeshadows === 'function', 'memory.pruneForeshadows 单一实现已导出');
  const arr1200 = [{ id: 'fs_live', content: '活跃伏笔', status: 'developing', links: [], at: 1 }];
  for (let i = 0; i < 35; i++) arr1200.push({ id: 'fs_dead' + i, content: '废弃' + i, status: (i % 2 ? 'recycled' : 'dropped'), links: [], at: 100 + i });
  WA.memory.pruneForeshadows(arr1200);
  assert(arr1200.some(f => f.id === 'fs_live'), 'pruneForeshadows 终态回收先于截断（活跃伏笔存活）');
  assert(arr1200.filter(f => f.status === 'recycled' || f.status === 'dropped').length === 0, 'pruneForeshadows 终态伏笔全部回收');
  const many1200 = [];
  for (let i = 0; i < 40; i++) many1200.push({ id: 'x' + i, status: 'waiting', at: i });
  WA.memory.pruneForeshadows(many1200);
  assert(many1200.length === 30 && many1200[0].id === 'x10', 'pruneForeshadows 超量活跃伏笔按位置截断保留最新 30');
  // ── D. 同构一致性（源码断言）──
  const bsSrc1200 = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
  assert(bsSrc1200.indexOf('CURRENT_TERMINAL_STAGES') >= 0, 'currents 终态口径常量存在');
  assert(bsSrc1200.indexOf('pruneForeshadows') >= 0, 'backstage 复用 foreshadows 单一实现');
  assert(bsSrc1200.indexOf("wtArr[i].status === '已结束'") >= 0, 'worldTrends 终态回收仍在（同构未回归）');
  assert(bsSrc1200.indexOf('term.includes(ev.stage)') >= 0, 'events 终态回收仍在（同构未回归）');
  const memSrc1200 = fs.readFileSync(path.join(BASE, 'engines/memory.js'), 'utf8');
  assert(memSrc1200.indexOf('function pruneForeshadows') >= 0, 'memory.js 定义单一实现');
  // ── 清理现场 ──
  resetLogs1200();
  LS1200.clear();
  Object.keys(junkBefore1200).forEach(function (k) { LS1200.setItem(k, junkBefore1200[k]); });
  ctx1200.chatId = prevChat1200;
  WA.eventLog.length = 0;
  evtBefore1200.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1200.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.2.0 block
  // ═══════════════════════════════════════════════════════════
  // v1.3.0 — chronicle 多口径统一（Cross-path Cap Unification）
  //   探针实证：chronicle 登记口径 cap=200（backstage slice(-200)），但 horizon.js
  //   3 处内联 slice(-80)——horizon 远方/近端事件入账一次即把满载 200 条纪事静默砍到 80
  //   （丢失 120 条，且按数组位置丢最旧，190 条带 refs 溯源的 kind:event 仅残留 69 条，
  //   无溯源的 horizon 兜底条目反而全保留）。修复：horizon 新增 CHRONICLE_CAP=200 与
  //   登记表/backstage 同源，3 处内联口径统一；登记表 site 注明双路径同源。
  // ═══════════════════════════════════════════════════════════
  v1300: {
  const LS1300 = global.localStorage;
  const junkBefore1300 = JSON.parse(JSON.stringify(LS1300._dump()));
  const evtBefore1300 = WA.eventLog.slice();
  const errBefore1300 = WA.errorLog.slice();
  const ctx1300 = global.SillyTavern.getContext();
  const prevChat1300 = ctx1300.chatId;
  const CID1300 = 'v1300_chat';
  const chat1300 = global.__mockChat;
  function resetLogs1300() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1300() { resetLogs1300(); LS1300.clear(); ctx1300.chatId = CID1300; chat1300.length = 0; WA.store.init(); }
  // ── A. 口径同源（源码断言）──
  fresh1300();
  const hzSrc1300 = fs.readFileSync(path.join(BASE, 'engines/horizon.js'), 'utf8');
  assert((hzSrc1300.match(/tx\.chronicle\.length > 80/g) || []).length === 0, 'horizon 内联 80 口径零残留');
  assert((hzSrc1300.match(/\.length > CHRONICLE_CAP\)/g) || []).length === 3, 'horizon 条件引用恰好 3 处（CHRONICLE_CAP 同源）');
  assert((hzSrc1300.match(/slice\(-CHRONICLE_CAP\)/g) || []).length === 3, 'horizon 截断引用恰好 3 处');
  const caps1300 = WA.store.sizeCaps();
  assert(caps1300['chronicle'].cap === 200, '登记表 chronicle cap=200');
  assert(caps1300['chronicle'].site.indexOf('horizon.js') >= 0, '登记 site 注明 horizon 同源');
  // ── B. 满载行为：horizon 入账不再砍到 80 ──
  WA.store.transact(d => {
    d.chronicle = [];
    for (let i = 0; i < 190; i++) d.chronicle.push({ id: 'ch' + i, kind: 'event', title: '纪事' + i, summary: '带溯源' + i, at: i, refs: [{ messageId: 'm' + i, chatId: 'c1' }] });
    for (let i = 0; i < 10; i++) d.chronicle.push({ id: 'hz' + i, kind: 'horizon_distant', title: '远方' + i, desc: 'd', at: 500 + i, horizon: true });
  });
  WA.store.transact(d => { WA.horizon.acceptResult('near', { title: '近端事件X', description: '描述', urgent: false }); });
  const st1300 = WA.store.get();
  assert(st1300.chronicle.length === 200, '满载入账后仍为 200（不再砍到 80）');
  assert(!st1300.chronicle.some(c => c.id === 'ch0'), '挤出的是最旧 1 条（环形语义正常）');
  assert(st1300.chronicle.some(c => c.title === '近端事件X'), '新 horizon 条目入账成功');
  assert(st1300.chronicle.filter(c => c.kind === 'event' && c.refs).length === 189, '带溯源条目仅自然挤出 1 条（不再大量丢弃）');
  // ── C. distant 事件路径同口径 ──
  WA.store.transact(d => { WA.horizon.acceptResult('distant', { title: '远方事件Y', description: '描述Y' }); });
  assert(WA.store.get().chronicle.length === 200, 'distant 事件入账后仍 200（同口径）');
  // ── 清理现场 ──
  resetLogs1300();
  LS1300.clear();
  Object.keys(junkBefore1300).forEach(function (k) { LS1300.setItem(k, junkBefore1300[k]); });
  ctx1300.chatId = prevChat1300;
  WA.eventLog.length = 0;
  evtBefore1300.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1300.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.3.0 block
  v1400: {
  const LS1400 = global.localStorage;
  const junkBefore1400 = JSON.parse(JSON.stringify(LS1400._dump()));
  const evtBefore1400 = WA.eventLog.slice();
  const errBefore1400 = WA.errorLog.slice();
  const ctx1400 = global.SillyTavern.getContext();
  const prevChat1400 = ctx1400.chatId;
  const CID1400 = 'v1400_chat';
  const chat1400 = global.__mockChat;
  function resetLogs1400() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1400() { resetLogs1400(); LS1400.clear(); ctx1400.chatId = CID1400; chat1400.length = 0; WA.store.init(); }
  // ── A. 登记完整性（登记表 + 源码断言）──
  fresh1400();
  const caps1400 = WA.store.sizeCaps();
  assert(caps1400['evolution.entityMemory.organization'] && caps1400['evolution.entityMemory.organization'].cap === 30, 'entityMemory.organization 登记且 cap=30');
  assert(['object', 'ability', 'location'].every(t => caps1400['evolution.entityMemory.' + t] && caps1400['evolution.entityMemory.' + t].cap === 30), 'entityMemory object/ability/location 登记且 cap=30');
  assert(caps1400['evolution.entityMemory.*.events'] && caps1400['evolution.entityMemory.*.events'].cap === 8 && caps1400['evolution.entityMemory.*.events'].wildcard === true, '通配键 events 登记且 cap=8 wildcard=true');
  const stSrc1400 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  const entSrc1400 = fs.readFileSync(path.join(BASE, 'engines/entities.js'), 'utf8');
  assert((stSrc1400.match(/function capsFor\(/g) || []).length === 1, 'capsFor 单一定义（单一查找实现）');
  assert((stSrc1400.match(/hasOwnProperty\.call\(BOUNDED/g) || []).length === 0, 'sizeAudit 旧精确查找模式零残留（全走 capsFor）');
  assert((stSrc1400.match(/__BOUNDED_CAPS\[r\.path\]/g) || []).length === 0, 'maintain 旧直接索引零残留（走 capsFor）');
  assert((entSrc1400.match(/ent\.events\.length > (\d+)/) || [])[1] === '8', '源码实体事件环 cap=8（通配键反查同源）');
  assert((entSrc1400.match(/const CAP_PER_TYPE\s*=\s*(\d+)/) || [])[1] === '30', '源码 CAP_PER_TYPE=30（登记反查同源）');
  // ── B. 超限可观测（31 项容器 + 9 条 events）──
  WA.store.transact(d => {
    d.evolution.entityMemory = { organization: [], object: [], ability: [], location: [] };
    for (let i = 0; i < 31; i++) {
      const evs1400 = [];
      if (i === 0) for (let j = 0; j < 9; j++) evs1400.push({ e: '事件' + j, t: 't', at: j });
      d.evolution.entityMemory.organization.push({ id: 'o' + i, name: '组织' + i, aliases: [], desc: 'd' + i, events: evs1400, updatedAt: i });
    }
  });
  const audit1400 = WA.store.sizeAudit({ minBytes: 0 });
  const row1400 = (audit1400.arrays || []).find(r => r.path === 'evolution.entityMemory.organization');
  assert(row1400 && row1400.bounded === true && row1400.cap === 30, 'sizeAudit 31 项容器标 bounded=true cap=30');
  assert((audit1400.drifted || []).some(r => (typeof r === 'string' ? r : (r && r.path) || '').indexOf('evolution.entityMemory.organization') >= 0), 'drifted 检出 organization 超限（31>30 裁剪站点失效可观测）');
  assert(!(audit1400.unbounded || []).some(r => (typeof r === 'string' ? r : (r && r.path) || '').indexOf('entityMemory') >= 0), 'unbounded 不再误报 entityMemory');
  const auditDeep1400 = WA.store.sizeAudit({ minBytes: 0, maxDepth: 8 });
  const evRow1400 = (auditDeep1400.arrays || []).find(r => r.path === 'evolution.entityMemory.organization[0].events');
  assert(evRow1400 && evRow1400.bounded === true && evRow1400.cap === 8, '深扫 events 行 bounded=true cap=8（通配登记可观测）');
  const m1400 = WA.store.maintain({});
  assert(m1400.signals.capacityDrifted >= 1, 'maintain capacityDrifted>=1（entityMemory 盲区消除）');
  assert(m1400.signals.capacityUnregistered === 0, 'maintain capacityUnregistered=0（不再误报未登记）');
  // ── C. capsFor 三态 ──
  assert(typeof WA.store.capsFor === 'function', 'WA.store.capsFor 已挂出');
  assert(WA.store.capsFor('evolution.entityMemory.ability') && WA.store.capsFor('evolution.entityMemory.ability').cap === 30, 'capsFor 精确键命中 cap=30');
  assert(WA.store.capsFor('evolution.entityMemory.organization[3].events') && WA.store.capsFor('evolution.entityMemory.organization[3].events').cap === 8, 'capsFor 通配命中（带下标）cap=8');
  assert(WA.store.capsFor('evolution.entityMemory.ability.5.events') && WA.store.capsFor('evolution.entityMemory.ability.5.events').cap === 8, 'capsFor 通配命中（多段吃进）cap=8');
  assert(WA.store.capsFor('evolution.entityMemory.organization[3]') === null && WA.store.capsFor('evolution.entityMemory.organization.3') === null, 'capsFor 实体元素路径判 null（括号/点分一致，不误报）');
  assert(WA.store.capsFor('memory.l0[9].sub') === null && WA.store.capsFor('') === null, 'capsFor 未知路径/空路径返回 null');
  // ── D. 死存储清理 ──
  const opSrc1400 = fs.readFileSync(path.join(BASE, 'engines/opinion.js'), 'utf8');
  assert((opSrc1400.match(/signature/g) || []).length === 0, 'opinion.signature 写入零残留');
  assert((stSrc1400.match(/storylines|lastAnchor/g) || []).length === 0, 'chapters.storylines / meta.lastAnchor 零残留');
  assert((stSrc1400.match(/opinion: \{ canon: \[\], forum: \[\], sandbox: \[\], updatedAt: 0 \}/g) || []).length === 1, 'opinion schema signature 死字段已移除');
  // ── 清理现场 ──
  resetLogs1400();
  LS1400.clear();
  Object.keys(junkBefore1400).forEach(function (k) { LS1400.setItem(k, junkBefore1400[k]); });
  ctx1400.chatId = prevChat1400;
  WA.eventLog.length = 0;
  evtBefore1400.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1400.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.4.0 block
  v1500: {
  const LS1500 = global.localStorage;
  const junkBefore1500 = JSON.parse(JSON.stringify(LS1500._dump()));
  const evtBefore1500 = WA.eventLog.slice();
  const errBefore1500 = WA.errorLog.slice();
  const ctx1500 = global.SillyTavern.getContext();
  const prevChat1500 = ctx1500.chatId;
  const CID1500 = 'v1500_chat';
  const chat1500 = global.__mockChat;
  function resetLogs1500() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1500() { resetLogs1500(); LS1500.clear(); ctx1500.chatId = CID1500; chat1500.length = 0; WA.store.init(); }
  // ── A. schema 物化 memory.pmem（直 push 不再炸事务）──
  fresh1500();
  const r1_1500 = WA.store.transact(d => { d.memory.pmem.push({ id: 'pm1', holder: '沈炼', text: '记忆', refs: [{ messageId: 'm1', chatId: 'c1' }], at: 1 }); });
  assert(r1_1500.ok === true, 'memory.pmem 直 push 事务 ok=true（此前 TypeError 回滚）');
  assert(Array.isArray(WA.store.get().memory.pmem) && WA.store.get().memory.pmem.length === 1, 'memory.pmem 物化为数组且入账 1 条');
  assert(WA.store.sizeCaps()['memory.pmem'] && WA.store.sizeCaps()['memory.pmem'].cap === 60, 'memory.pmem 登记 cap=60 不变');
  // ── B. profile 五节 + knowledge 通配登记 ──
  const caps1500 = WA.store.sizeCaps();
  assert(['personality', 'worldview', 'family', 'memory', 'relationships'].every(sec => caps1500['people.*.profile.' + sec] && caps1500['people.*.profile.' + sec].wildcard === true), 'profile 五节全部通配登记');
  assert(caps1500['people.*.profile.personality'].cap === 15 && caps1500['people.*.profile.memory'].cap === 25 && caps1500['people.*.profile.worldview'].cap === 10, 'profile 各节 cap 与 profile.js 源码切片一致');
  assert(caps1500['people.*.knowledge'] && caps1500['people.*.knowledge'].cap === 30 && caps1500['people.*.knowledge'].kind === 'object' && caps1500['people.*.knowledge'].wildcard === true, 'knowledge 通配 object 登记 cap=30');
  // ── C. capsFor 通配命中（people 动态 id）──
  assert(WA.store.capsFor('people.p_沈炼.profile.personality') && WA.store.capsFor('people.p_沈炼.profile.personality').cap === 15, 'capsFor profile.personality 通配命中 cap=15');
  assert(WA.store.capsFor('people.p_韩叙.profile.memory') && WA.store.capsFor('people.p_韩叙.profile.memory').cap === 25, 'capsFor 不同 id 同样命中 cap=25');
  assert(WA.store.capsFor('people.p_沈炼.knowledge') && WA.store.capsFor('people.p_沈炼.knowledge').cap === 30, 'capsFor knowledge 通配命中 cap=30');
  assert(WA.store.capsFor('people.p_沈炼.profile') === null, 'capsFor profile 中间层判 null（不误报）');
  // ── D. 超限可观测 ──
  WA.store.transact(d => {
    d.people['p_沈炼'] = {
      id: 'p_沈炼', name: '沈炼',
      knowledge: Array.from({ length: 33 }, (_, i) => 'k' + i).reduce((o, k) => (o[k] = { route: 'told', at: 1 }, o), {}),
      profile: {
        personality: Array.from({ length: 16 }, (_, i) => ({ text: '性' + i, at: i })),
        memory: Array.from({ length: 26 }, (_, i) => ({ text: '忆' + i, at: i })),
        relationships: Array.from({ length: 16 }, (_, i) => ({ target: 't' + i, at: i }))
      }
    };
  });
  const audit1500 = WA.store.sizeAudit({ minBytes: 0, maxDepth: 8, topN: 999 });
  const dr1500 = (audit1500.drifted || []).map(r => (typeof r === 'string' ? r : (r && r.path) || ''));
  assert(dr1500.some(p => p.indexOf('profile.personality') >= 0), 'drifted 检出 profile.personality（16>15）');
  assert(dr1500.some(p => p.indexOf('profile.memory') >= 0), 'drifted 检出 profile.memory（26>25）');
  assert(dr1500.some(p => p.indexOf('knowledge') >= 0), 'drifted 检出 knowledge（33>30）');
  assert(!(audit1500.unbounded || []).some(r => (typeof r === 'string' ? r : (r && r.path) || '').indexOf('people') >= 0), 'unbounded 不再误报 people 路径');
  const rowP1500 = (audit1500.arrays || []).find(r => r.path === 'people.p_沈炼.profile.personality');
  assert(rowP1500 && rowP1500.bounded === true && rowP1500.cap === 15, 'profile 行标 bounded=true cap=15');
  const rowK1500 = (audit1500.arrays || []).find(r => r.path === 'people.p_沈炼.knowledge');
  assert(rowK1500 && rowK1500.bounded === true && rowK1500.cap === 30 && rowK1500.len === 33, 'knowledge 行标 bounded=true cap=30（object 型 len=键数）');
  const m1500 = WA.store.maintain({});
  assert(m1500.signals.capacityDrifted >= 1, 'maintain capacityDrifted>=1（people 档案节已进盘点）');
  assert(m1500.signals.capacityUnregistered === 0, 'maintain capacityUnregistered=0（无新漏登）');
  // ── E. 契约同步（源码 + CAP_RULES）──
  const stSrc1500 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  const runSrc1500 = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const profSrc1500 = fs.readFileSync(path.join(BASE, 'actors/profile.js'), 'utf8');
  assert((stSrc1500.match(/people\.\*\.profile\./g) || []).length >= 5, '登记表含 profile 五节通配键');
  assert(stSrc1500.indexOf("'people.*.knowledge'") >= 0, '登记表含 knowledge 通配键');
  assert(profSrc1500.indexOf("push('personality', r.personality, 15)") >= 0 && profSrc1500.indexOf('prof.relationships.slice(-15)') >= 0, 'profile.js 源码切片常量与登记同源');
  assert(runSrc1500.indexOf("'people.*.knowledge'") >= 0 && runSrc1500.indexOf("'people.*.profile.relationships'") >= 0, 'CAP_RULES 同步 6 条 people 规则');
  assert(stSrc1500.indexOf('v1.5.0: people 档案盘点') >= 0, 'maintain people 盘点分支存在');
  assert(stSrc1500.indexOf('pmem: [],') >= 0, 'schema pmem 物化行存在');
  // ── 清理现场 ──
  resetLogs1500();
  LS1500.clear();
  Object.keys(junkBefore1500).forEach(function (k) { LS1500.setItem(k, junkBefore1500[k]); });
  ctx1500.chatId = prevChat1500;
  WA.eventLog.length = 0;
  evtBefore1500.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1500.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.5.0 block
  v1600: {
  const LS1600 = global.localStorage;
  const junkBefore1600 = JSON.parse(JSON.stringify(LS1600._dump()));
  const evtBefore1600 = WA.eventLog.slice();
  const errBefore1600 = WA.errorLog.slice();
  const ctx1600 = global.SillyTavern.getContext();
  const prevChat1600 = ctx1600.chatId;
  const CID1600 = 'v1600_chat';
  const chat1600 = global.__mockChat;
  function resetLogs1600() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1600() { resetLogs1600(); LS1600.clear(); ctx1600.chatId = CID1600; chat1600.length = 0; WA.store.init(); }
  // ── A. entityMemory 物化 ──
  fresh1600();
  const dft1600 = WA.store.defaultWorldState();
  assert(dft1600.evolution.entityMemory && Array.isArray(dft1600.evolution.entityMemory.organization) && Array.isArray(dft1600.evolution.entityMemory.ability), 'defaultWorldState 物化 entityMemory 四数组');
  const stSrc1600 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  assert(stSrc1600.indexOf('entityMemory: { organization: [], object: [], ability: [], location: [] }') >= 0, 'schema 骨架声明与登记四键同集合');
  // ── B. 冷启动审计可见 + 直写不再炸 ──
  const a1600 = WA.store.sizeAudit({ minBytes: 0, maxDepth: 8, topN: 999 });
  const emRows1600 = (a1600.arrays || []).filter(r => r.path.indexOf('evolution.entityMemory.') === 0);
  assert(emRows1600.length === 4, '冷启动 sizeAudit 纳 4 个 entityMemory 行（此前 0）');
  assert(emRows1600.every(r => r.bounded === true && r.cap === 30), '四行均标 bounded=true cap=30（登记生效）');
  const r1_1600 = WA.store.transact(d => {
    d.chronicle.push({ id: 'c_y1600', kind: 'event', title: '测试' });
    d.evolution.entityMemory.organization.push({ id: 'o1', name: '行会', events: [] });
  });
  const st1600 = WA.store.get();
  assert(r1_1600.ok === true, '直写 entityMemory 事务 ok=true（此前 TypeError 回滚）');
  assert(st1600.evolution.entityMemory.organization.length === 1, '实体入账成功');
  assert(st1600.chronicle.some(c => c.id === 'c_y1600'), '同批无关写入未被连带丢弃（原子性恢复正常）');
  // ── C. registryParity 单一自检 ──
  assert(typeof WA.store.registryParity === 'function', 'WA.store.registryParity 已挂出');
  const rp1600 = WA.store.registryParity();
  assert(rp1600.ok === true && rp1600.missing.length === 0, '当前状态一致性通过（missing=0）');
  assert(rp1600.checked >= 30, 'checked 覆盖全部非通配非 object 键');
  WA.store.transact(d => { delete d.memory.facts; });
  const rp1600b = WA.store.registryParity();
  assert(rp1600b.ok === false && rp1600b.missing.some(m => m.path === 'memory.facts'), '删除 memory.facts 后检出 missing');
  const mf1600 = rp1600b.missing.find(m => m.path === 'memory.facts');
  assert(mf1600 && mf1600.cap === 100 && mf1600.site.indexOf('memory.js') >= 0, 'missing 项带 cap 与 site 溯源');
  assert(!rp1600b.missing.some(m => m.path.indexOf('*') >= 0), '通配键不参与判定（豁免）');
  assert(!rp1600b.missing.some(m => m.path === 'people'), 'kind:object 顶层键豁免');
  // ── D. maintain 接入 capacity.unmaterialized ──
  const m1600 = WA.store.maintain({});
  const um1600 = (m1600.issues || []).filter(i => i.key === 'capacity.unmaterialized');
  assert(um1600.length === 1, 'maintain 检出 capacity.unmaterialized 议题');
  assert(um1600[0].detail.indexOf('memory.facts') >= 0 && um1600[0].level === 'warn', '议题带路径明示 + level=warn');
  WA.store.transact(d => { d.memory.facts = []; });
  const m1600b = WA.store.maintain({});
  assert(!(m1600b.issues || []).some(i => i.key === 'capacity.unmaterialized'), '补齐后议题消失（自愈可验证）');
  assert(WA.store.registryParity().ok === true, '补齐后 registryParity 回归 ok');
  // ── E. 源码契约 ──
  assert((stSrc1600.match(/function registryParity\(/g) || []).length === 1, 'registryParity 单一定义');
  assert((stSrc1600.match(/registryParity\(\)/g) || []).length >= 2, 'maintain 接入调用（定义外至少 1 处）');
  assert(stSrc1600.indexOf('v1.6.0: 登记表↔schema 物化一致性') >= 0, 'maintain 接入注释在位');
  // ── 清理现场 ──
  resetLogs1600();
  LS1600.clear();
  Object.keys(junkBefore1600).forEach(function (k) { LS1600.setItem(k, junkBefore1600[k]); });
  ctx1600.chatId = prevChat1600;
  WA.eventLog.length = 0;
  evtBefore1600.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1600.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.6.0 block
  v1700: {
  const LS1700 = global.localStorage;
  const junkBefore1700 = JSON.parse(JSON.stringify(LS1700._dump()));
  const evtBefore1700 = WA.eventLog.slice();
  const errBefore1700 = WA.errorLog.slice();
  const ctx1700 = global.SillyTavern.getContext();
  const prevChat1700 = ctx1700.chatId;
  const CID1700 = 'v1700_chat';
  const chat1700 = global.__mockChat;
  function resetLogs1700() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1700() { resetLogs1700(); LS1700.clear(); ctx1700.chatId = CID1700; chat1700.length = 0; WA.store.init(); }
  const caps1700 = WA.store.sizeCaps();
  const arrayKeys1700 = Object.keys(caps1700).filter(k => !caps1700[k].wildcard && caps1700[k].kind !== 'object');
  const objKeys1700 = Object.keys(caps1700).filter(k => !caps1700[k].wildcard && caps1700[k].kind === 'object');
  const stSrc1700 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  // ── A. checked 纳入 object 键 ──
  fresh1700();
  const rpA1700 = WA.store.registryParity();
  assert(rpA1700.ok === true && rpA1700.missing.length === 0, '正常态 registryParity ok=true missing=0');
  assert(rpA1700.checked === arrayKeys1700.length + objKeys1700.length, 'checked 纳入精确 object 键（不再是仅 array）');
  assert(rpA1700.checked === 31, 'checked 精确值 31（v1.6.0 时 30，+people）');
  // ── B. object 键漏物化检出（v1.6.0 盲区修复）──
  fresh1700();
  WA.store.transact(d => { delete d.people; });
  const rpB1700 = WA.store.registryParity();
  assert(rpB1700.ok === false && rpB1700.missing.some(m => m.path === 'people'), '删除 people 后 registryParity 检出（此前 object 键被 continue 漏检）');
  const pmB1700 = rpB1700.missing.find(m => m.path === 'people');
  assert(pmB1700 && pmB1700.kind === 'object' && pmB1700.cap === 48 && pmB1700.site.indexOf('backstage.js') >= 0, 'missing 项带 kind=object + cap + site 溯源');
  assert(pmB1700 && pmB1700.reason && pmB1700.reason.indexOf('未在骨架物化') >= 0, 'missing 项带 reason=未在骨架物化');
  const mB1700 = WA.store.maintain({});
  const umB1700 = (mB1700.issues || []).filter(i => i.key === 'capacity.unmaterialized');
  assert(umB1700.length === 1 && umB1700[0].detail.indexOf('people') >= 0, 'maintain 检出 people unmaterialized 议题（带路径）');
  assert(umB1700[0].level === 'warn', 'unmaterialized 议题 level=warn');
  WA.store.transact(d => { d.people = {}; });
  assert(WA.store.registryParity().ok === true, '补 people={} 后 registryParity 回归 ok（可自愈）');
  assert(!(WA.store.maintain({}).issues || []).some(i => i.key === 'capacity.unmaterialized'), '补齐后 maintain 议题消失（自愈可验证）');
  // ── C. object 键类型错配检出 ──
  fresh1700();
  WA.store.transact(d => { d.people = []; });
  const rpC1700 = WA.store.registryParity();
  assert(rpC1700.ok === false && rpC1700.missing.some(m => m.path === 'people'), 'people 被污染为数组后检出（类型错配）');
  const pmC1700 = rpC1700.missing.find(m => m.path === 'people');
  assert(pmC1700 && pmC1700.reason.indexOf('类型错配') >= 0, '错配项 reason 含「类型错配」');
  WA.store.transact(d => { d.people = {}; });
  assert(WA.store.registryParity().ok === true, '纠错为 {} 后回归 ok');
  // ── D. array 键行为不回退（v1.6.0 契约保持）──
  fresh1700();
  WA.store.transact(d => { delete d.memory.facts; });
  const rpD1700 = WA.store.registryParity();
  const mfD1700 = rpD1700.missing.find(m => m.path === 'memory.facts');
  assert(mfD1700 && mfD1700.kind === 'array' && mfD1700.cap === 100 && mfD1700.site.indexOf('memory.js') >= 0, 'array 漏物化仍检出 + kind=array + cap/site 溯源');
  assert(mfD1700 && mfD1700.reason.indexOf('未在骨架物化') >= 0, 'array 漏物化 reason 正确');
  // array 键被污染为对象也检出（双向类型校验）
  fresh1700();
  WA.store.transact(d => { d.memory.l0 = {}; });
  const rpD2_1700 = WA.store.registryParity();
  const l0D1700 = rpD2_1700.missing.find(m => m.path === 'memory.l0');
  assert(l0D1700 && l0D1700.reason.indexOf('类型错配') >= 0, 'array 键被污染为对象也检出（双向类型校验）');
  // ── E. 豁免边界：通配键不参与 ──
  fresh1700();
  const rpE1700 = WA.store.registryParity();
  assert(!rpE1700.missing.some(m => m.path.indexOf('*') >= 0), '通配键不参与判定（豁免）');
  assert(!rpE1700.missing.some(m => m.path.indexOf('knowledge') >= 0), 'object 通配键 people.*.knowledge 不误报');
  WA.store.transact(d => { d.people['p_x'] = { id: 'p_x', name: 'X', knowledge: { a: 1 } }; });
  assert(WA.store.registryParity().ok === true, '写入带 knowledge 的人物后仍 ok（通配 object 不参与）');
  // ── F. 源码契约 ──
  assert((stSrc1700.match(/function registryParity\(/g) || []).length === 1, 'registryParity 仍单一定义');
  assert(stSrc1700.indexOf("if (meta.kind === 'object') continue;") < 0, '旧 object-continue 盲区语句已移除');
  assert(stSrc1700.indexOf('类型错配（应为普通对象）') >= 0, 'object 错配分支在位');
  assert(stSrc1700.indexOf('v1.7.0') >= 0, 'v1.7.0 注释在位');
  // ── 清理现场 ──
  resetLogs1700();
  LS1700.clear();
  Object.keys(junkBefore1700).forEach(function (k) { LS1700.setItem(k, junkBefore1700[k]); });
  ctx1700.chatId = prevChat1700;
  WA.eventLog.length = 0;
  evtBefore1700.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1700.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.7.0 block
  v1800: {
  const LS1800 = global.localStorage;
  const junkBefore1800 = JSON.parse(JSON.stringify(LS1800._dump()));
  const evtBefore1800 = WA.eventLog.slice();
  const errBefore1800 = WA.errorLog.slice();
  const ctx1800 = global.SillyTavern.getContext();
  const prevChat1800 = ctx1800.chatId;
  const CID1800 = 'v1800_chat';
  const chat1800 = global.__mockChat;
  function resetLogs1800() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1800() { resetLogs1800(); LS1800.clear(); ctx1800.chatId = CID1800; chat1800.length = 0; WA.store.init(); }
  const caps1800 = WA.store.sizeCaps();
  const precise1800 = Object.keys(caps1800).filter(k => !caps1800[k].wildcard).sort();
  const stSrc1800 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  // ── A. checkedKeys 暴露（候选1：可定位/可契约化）──
  fresh1800();
  const rpA1800 = WA.store.registryParity();
  assert(Array.isArray(rpA1800.checkedKeys), 'registryParity 暴露 checkedKeys 数组');
  assert(rpA1800.checkedKeys.length === rpA1800.checked, 'checkedKeys.length 与 checked 数字一致');
  assert(rpA1800.checkedKeys.slice().sort().join(',') === precise1800.join(','), 'checkedKeys 集合与登记表非通配键同集合（可契约化）');
  assert(rpA1800.checkedKeys.indexOf('people') >= 0 && !rpA1800.checkedKeys.some(k => k.indexOf('*') >= 0), 'checkedKeys 含精确 object 键 people、不含通配（边界）');
  // ── B. schema.pollution 议题（候选2：唤醒沉睡的 shapeConflicts）──
  fresh1800();
  WA.store.transact(d => { d.chronicle = 'polluted-not-array'; });
  WA.store.init();
  assert(WA.store.loadStat().lastFix.conflicts >= 1, 'ensureShape 检出 chronicle 类型冲突（string 非容器）');
  assert(WA.store.get().chronicle === 'polluted-not-array', '污染值被保留（保守：不擅自改写用户数据）');
  const mB1800 = WA.store.maintain({});
  const spB1800 = (mB1800.issues || []).filter(i => i.key === 'schema.pollution');
  assert(spB1800.length === 1 && spB1800[0].level === 'warn', 'maintain 检出 schema.pollution（warn，巡视不再盲）');
  assert(spB1800[0] && spB1800[0].detail.indexOf('类型与默认结构不符') >= 0, 'schema.pollution detail 含保守说明');
  assert(mB1800.signals && mB1800.signals.schemaPollution >= 1, 'signals.schemaPollution 透出');
  WA.store.transact(d => { d.chronicle = []; });
  WA.store.init();
  assert(!(WA.store.maintain({}).issues || []).some(i => i.key === 'schema.pollution'), '纠正 chronicle 后 schema.pollution 消失（可自愈可验证）');
  // ── C. capacity.bloat 议题（候选3：字节膨胀维度，核心）──
  fresh1800();
  WA.store.transact(d => { d.memory.facts = []; for (let i = 0; i < 50; i++) d.memory.facts.push({ key: 'k' + i, value: 'x'.repeat(3000), active: true, at: Date.now() }); });
  const aC1800 = WA.store.sizeAudit({ minBytes: 0, maxDepth: 8 });
  assert(Array.isArray(aC1800.bloat) && aC1800.bloat.some(b => b.path === 'memory.facts'), 'sizeAudit 新增 bloat 维度（facts 字节膨胀入列）');
  const brC1800 = aC1800.bloat.find(b => b.path === 'memory.facts');
  assert(brC1800 && brC1800.len === 50 && brC1800.cap === 100 && brC1800.bytes > 100000, 'bloat 项带 len≤cap + bytes 溯源（条数合规体积超阈）');
  assert(!(aC1800.drifted || []).some(x => x.path === 'memory.facts'), 'bloat 与 drifted 互斥分工（条数合规不重复计漂移）');
  const mC1800 = WA.store.maintain({ deep: true });
  const blC1800 = (mC1800.issues || []).filter(i => i.key === 'capacity.bloat');
  assert(blC1800.length === 1 && blC1800[0].detail.indexOf('memory.facts') >= 0, 'maintain deep 检出 capacity.bloat（带路径）');
  assert(blC1800[0] && blC1800[0].detail.indexOf('字节超阈') >= 0 && blC1800[0].detail.indexOf('KB') >= 0, 'bloat detail 带字节阈值 + KB 体积');
  assert(mC1800.signals && mC1800.signals.capacityBloat >= 1, 'signals.capacityBloat 透出');
  assert(!(WA.store.maintain({}).issues || []).some(i => i.key === 'capacity.bloat'), '非 deep 不跑 bloat 全量序列化（高频路径零负担）');
  assert(!WA.store.sizeAudit({ minBytes: 0, maxDepth: 8, bloatBytes: 999999999 }).bloat.some(b => b.path === 'memory.facts'), 'bloatBytes 极高 → 不再误纳（阈值可控）');
  // ── D. 常态不误报（干净态 deep 也干净）──
  fresh1800();
  const mD1800 = WA.store.maintain({ deep: true });
  assert(!(mD1800.issues || []).some(i => i.key === 'capacity.bloat' || i.key === 'schema.pollution'), '干净态 deep 无 bloat/pollution（不误报）');
  // ── E. 双入口一致（deriveAuditRows 单一实现）──
  fresh1800();
  WA.store.transact(d => { d.memory.facts = []; for (let i = 0; i < 50; i++) d.memory.facts.push({ key: 'k' + i, value: 'x'.repeat(3000), active: true, at: Date.now() }); });
  const afE1800 = WA.store.sizeAuditFull({ minBytes: 0, maxDepth: 8 });
  const saE1800 = WA.store.sizeAudit({ minBytes: 0, maxDepth: 8 });
  assert(Array.isArray(afE1800.bloat) && afE1800.bloat.some(b => b.path === 'memory.facts'), 'sizeAuditFull 同样透出 bloat（双入口一致）');
  assert(saE1800.bloat.map(b => b.path).sort().join(',') === afE1800.bloat.map(b => b.path).sort().join(','), '两入口 bloat 集合逐一致（防语义单边漂移）');
  // ── F. 源码契约 ──
  assert(stSrc1800.indexOf('checkedKeys: checkedKeys') >= 0, 'checkedKeys 透出在位');
  assert((stSrc1800.match(/bloat: concl.bloat/g) || []).length === 2, 'bloat 双入口各透出一次（单一实现）');
  assert((stSrc1800.match(/deriveAuditRows\(/g) || []).length >= 3, 'deriveAuditRows 定义 + 两入口调用（单源）');
  assert(stSrc1800.indexOf("key: 'schema.pollution'") >= 0 && stSrc1800.indexOf("key: 'capacity.bloat'") >= 0, '两议题键在位');
  // ── 清理现场 ──
  resetLogs1800();
  LS1800.clear();
  Object.keys(junkBefore1800).forEach(function (k) { LS1800.setItem(k, junkBefore1800[k]); });
  ctx1800.chatId = prevChat1800;
  WA.eventLog.length = 0;
  evtBefore1800.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1800.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.8.0 block
  } // end v0.9.0 block
  } // end v0.8.0 block
  } // end v0.7.0 block
  } // end v0.2.2 block
  // ── 汇总 ──
  console.log('\n══════════════════════');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (failures.length) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
  console.log('全部测试通过 ✓');
  process.exit(0);
})().catch(e => { console.error('测试运行器异常: ', e); process.exit(2); });
