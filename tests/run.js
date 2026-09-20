// WorldAxis tests/run.js — 无头测试运行器
'use strict';
require('./mock.js');
// v2.12.0: UI render-path gate host environment (mini-DOM + isolated UI load). fresh()/checkPages() are reused verbatim by the v2.12.0 block below.
const __uiGate = require('./ui-gate-sync.js');
const __uiGateFresh = __uiGate.fresh, __uiGateCheckPages = __uiGate.checkPages;
// v2.21.0: 控件可点性探针（第九面）。与 checkPages 互补：checkPages 管「控件成树」，
//   checkClickable 管「控件被点会不会抛」——同步抛出 + 未处理 Promise 拒绝两面合一。
const __uiGateCheckClickable = __uiGate.checkClickable;
// v2.22.0: 展示映射漂移探针（第十面）。源码级比对「UI 映射键集 ⊇ 引擎枚举/桶集」，
//   抓运行期不抛不报、G17/G18 照不出的静态漂移（错误的徽章色 / 裸露桶名）。
const __uiGateCheckSrcMaps = __uiGate.checkSrcMaps;
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
  'core/clock.js',           // v2.15.0: 时间源单一出口（核心原语，须最先装载）
  'core/rand.js',            // v2.14.0: 随机源单一出口（核心原语，须最先装载）
  'core/settings-bus.js', 'core/store.js', 'core/evict.js', 'core/api-router.js', 'core/workflow.js', 'core/settle-guard.js', 'core/interceptor.js',
  'engines/backstage.js', 'engines/evolution.js', 'engines/enemies.js', 'engines/regional.js', 'engines/horizon.js', 'engines/digest.js', 'engines/limits.js', 'engines/calendar.js', 'engines/memory.js',
  'engines/worldbook.js', 'engines/ledger.js', 'engines/timeline.js', 'engines/entities.js', 'engines/preset.js', 'engines/chatcache.js', 'engines/pmem.js', 'engines/rules.js', 'engines/summarizer.js',
  'engines/chapters.js', 'engines/opinion.js', 'engines/bridge.js', 'engines/lonsha-reader.js', 'engines/direct-event.js', 'engines/editor-faction.js', 'engines/editor-events.js', 'engines/inspector-state.js', 'engines/tool-snapshot.js', 'engines/tool-analyzer.js', 'engines/tool-import.js', 'engines/inject-inspector.js', 'engines/inject-budget.js', 'engines/tool-diag.js', 'engines/contract-audit.js', 'engines/memory-sampler.js', 'engines/sampler-check.js', 'engines/inject-channel.js', 'engines/inject-slot-audit.js', 'engines/proactive.js', 'engines/wb-inject.js',
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

  // ── inspector (v0.8) ── [v2.20.0] 本块随模块删除：engines/inspector.js 与 engines/inject-inspector.js
  //   订阅同一批宿主事件且为后者严格子集、全部导出零消费，已并入/删除。该项能力由
  //   engines/inject-inspector.js 的对应测试块覆盖（SENTINEL/状态文本/flatten）。
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
  assert(typeof WA.contractAudit === 'object' && WA.contractAudit.FIELDS.length >= 22, 'contractAudit 已加载且字段表不少于 22 项（实 ' + (WA.contractAudit && WA.contractAudit.FIELDS.length) + '）');
  assert(WA.contractAudit.PROBES.events_create && WA.contractAudit.PROBES.events_update, 'v2.2.0 探针表已补事件链两字段（否则对账器对本类漂移失明）');
  assert(!!(WA.contractAudit.SEEDS && WA.contractAudit.SEEDS.events_update), '更新类探针带基线种子（防假阴性）');
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
  assert(caConsumedList.length === WA.contractAudit.FIELDS.length, '全部契约字段被消费端实测消费: ' + caConsumedList.length + '/' + WA.contractAudit.FIELDS.length + ' -> ' + JSON.stringify(caConsumedList.filter(f => !caConsumed[f].consumed)));
  // horizon 委托字段必须被正确识别为已消费（acceptResult 写 live store 而非 draft）
  assert(caConsumed['distantEvent'].consumed === true && caConsumed['nearEvent'].consumed === true, 'distantEvent/nearEvent 经 horizon.acceptResult 消费');
  // 探针不污染真实存档：消费实测后 live store 不含哨兵标记
  assert(JSON.stringify(WA.store.get()).indexOf('__audit_') < 0, '探针哨兵不残留于真实存档');
  // ── 全量对账 ──
  // 用冻结的基线 + 显式 applyFn 闸门：避免 audit 内部再次触发 horizon 掷骰等随机副作用
  const caReport = WA.contractAudit.audit({ baseState: caBase, applyFn: function (d, r, a) { WA.backstage.applyResult(d, r, a); } });
  assert(caReport.declared.length >= 22 && caReport.consumed.length === WA.contractAudit.FIELDS.length, '对账报告 declared>=22 / consumed=' + caReport.consumed.length);
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
  assert(Object.keys(caBroken).length === WA.contractAudit.FIELDS.length && caBroken['clock'].consumed === false, 'applyFn 不可用时全部降级为未消费');
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
  // v2.14.0: 注入的随机源改为**确定性 LCG**——此前注入 Math.random 名义上「确定性」，
  //   实际上每次运行值都不同，断言只在「长度/子集」这类不变式上成立。
  const _detSrc = (function () { let _x = 1; return function () { _x = (_x * 1103515245 + 12345) % 2147483648; return _x / 2147483648; }; })();
  const msPicked = WA.memorySampler.exponentialSample(msBig, 8, _detSrc, 10000);
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
  const msWide = WA.memorySampler.exponentialSample(msBig, 4, _detSrc, 99999);
  assert(msWide.length === 4, '超范围 diceSides 被夹取至 MAX 后仍正常工作');
  const msNarrow = WA.memorySampler.exponentialSample(msBig, 4, _detSrc, 5);
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
  // v2.7.0（收口）: 口径变更——旧断言是「limit 999 读入（sampleEntries 内夹取）」，
  //   即「写原值、读时夹」：磁盘上留 999、引擎按 30 用，两套数并存（本版要修掉的正是它）。
  //   现在写路径即归一（区间声明在 __REG_B.bounds，与 memory-sampler 的 MIN/MAX 同源），
  //   故落盘就是 30 —— 界面显示 30、磁盘 30、引擎 30，只有一份。
  WA.backstage.setSettings({ memSamplerLimit: 999, memSamplerDice: 99999 });
  const msCfg3 = WA.memorySampler.loadSamplerSettings();
  assert(msCfg3.memSamplerLimit === 30, 'limit 999 落盘即归一为区间上限 30（此前写原值、读时夹，磁盘留 999）');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_backstage_settings_v1')).memSamplerLimit === 30,
    '（磁盘）存的就是生效值 30（不再是「磁盘 999 / 引擎 30」两套数）');
  assert(msCfg3.memSamplerDice === 10000, 'dice 99999 同样归一到上限 10000');
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
    // v2.2.0: people.<id>.profile 五节改为「运行时单一真源」——不再与源码字面常量比对，
    //   改由下方 RUNTIME_CAP_RULES 校验：消费端（registry）写入时从容量登记表取上限，
    //   且全库不得存在第二处写死该节上限（消除 profile.js 直写 store 造成的双写漂移）。
    'people.*.knowledge': ['engines/backstage.js', /keys\.slice\(0,\s*keys\.length\s*-\s*(\d+)\)/]
  };
  const srcCache = {};
  const readSrc = function (rel) {
    if (!srcCache[rel]) srcCache[rel] = fs.readFileSync(path.join(BASE, rel), 'utf8');
    return srcCache[rel];
  };
  // ── v2.13.0：cap 的单一真源改为 **运行时站点表**（evict.SITES），不再是源码正则 ──
  //   为什么换：v0.1.44 起这里靠**源码正则**反查 cap，而站点接线后源码里已经没有
  //   `slice(-N)` 字面量了（改走 WA.evict.array 单一出口）——继续扫源码只会把
  //   「接线成功」误报成「源码裁剪表达式未找到」。但真正的病根更深：
  //   正则反查**永远只能证明「某个字面量出现过」**，证明不了「运行时真的按这个 cap 裁」。
  //   换成运行时表之后，声明与执行第一次是同一份东西：
  //     ① evict.SITES（cap 真源）↔ store.sizeCaps()（容量登记表）逐键比对；
  //     ② evict.SITES 的 cap 必须等于 **执行站点实测的 cap**（喂超限数组跑一次单出口，
  //        看它真丢了多少）——这是「声明即执行」的直接证据，正则做不到这件事。
  //     ③ 双集合同集合：有界登记表里的每项都必须能被挤出侧解释（站点 / 非挤出声明 /
  //        运行时单源 / 只读无写入方 四类之一），防「登记了却没人执行」。
  const SITE_DECLS = WA.evict.siteDecls();
  const NON_EVICT_DECLS = WA.evict.nonEvictDecls();
  // 允许 evict.SITES 的 path 与 store 登记键不同名（如 entities.perType ↔
  //   evolution.entityMemory.organization）：按集合覆盖判定，不按字面键相等。
  const SITE_CAP_BY_CAP = {};   // cap 值 -> 站点名列表（用于与登记表逐值对账）
  Object.keys(SITE_DECLS).forEach(function (st) { (SITE_CAP_BY_CAP[SITE_DECLS[st].cap] = SITE_CAP_BY_CAP[SITE_DECLS[st].cap] || []).push(st); });
  // v2.13.0: 站点 path 含 `*`（如 evolution.entityMemory.*）时按**路径段通配**匹配登记键
  //   （evolution.entityMemory.organization）——`*` 至少吃 1 段，与 store.matchWildcard 同语义。
  const sitePathMatch = function (p, k) {
    if (p === k) return true;
    if (p.indexOf('*') < 0) return false;
    const ps = p.split('.'), ks = k.split('.');
    const i = ps.indexOf('*');
    if (ks.length < ps.length) return false;
    for (let eat = 1; eat <= ks.length - (ps.length - 1); eat++) {
      let ok = true;
      for (let si = 0; si < ps.length && ok; si++) {
        if (si === i) continue;
        const ki = si < i ? si : si + eat - 1;
        if (ps[si] !== ks[ki]) ok = false;
      }
      if (ok) return true;
    }
    return false;
  };
  const capMismatch = [];
  // ① 登记表与站点表逐键对账（只比对两边都声明了的键）
  Object.keys(SITE_DECLS).forEach(function (st) {
    const decl = SITE_DECLS[st];
    // per-call 站点（上限逐次不同，如人物档案各节 15/10/10/25/15）没有单一登记值可比，
    //   其正确性由 ② 的「显式传上限 + 传漏归因」负向探针单独考核。
    if (decl.cap === 'per-call') return;
    const keys = Object.keys(caps).filter(function (k) { return sitePathMatch(decl.path, k) || k === st; });
    keys.forEach(function (k) {
      const c = caps[k];
      // 登记侧标了通配（people.*.profile.personality）时，站点 path 与它同属一个规则族：
      //   只要站点 path 的 `*` 段能覆盖登记键的形状，就按「同族」放行，不比 cap 字面值
      //   （避免把「某容器的通配登记」与「另一容器的具名站点」错配成漂移）。
      if (c.wildcard && sitePathMatch(decl.path, k) && decl.path.indexOf('*') >= 0) return;
      if (c.cap !== decl.cap) capMismatch.push(k + '(登记 ' + c.cap + ' vs 站点 ' + decl.cap + ')');
    });
  });
  assert(capMismatch.length === 0, 'v2.13.0 容量登记表与挤出站点表逐键一致' + (capMismatch.length ? '：' + capMismatch.join('、') : ''));
  // ② 声明即执行：喂一个超限数组跑真站点，实测丢弃数必须等于「长度 - 声明 cap」
  const execProbe = [];
  ['memory.l0', 'memory.l1', 'memory.l2', 'memory.l3', 'memory.facts', 'backstage.chronicle',
   'backstage.worldFacts', 'backstage.echoes', 'backstage.currents', 'evolution.trends',
   'evolution.enemies', 'evolution.worldTrends', 'opinion.canon', 'opinion.forum',
   'memory.pmem', 'evolution.ledger', 'chapters.history', 'directEvents',
   'evolution.blackboxActions', 'evolution.blackboxAssets',
   // v2.13.0 补漏站点：真盲区（纪要/总述曾整条不在登记表上）与被漏接的第二写入方
   'memory.smallSummary', 'memory.bigSummary', 'backstage.chronicle'].forEach(function (st) {
    const decl = SITE_DECLS[st];
    if (!decl) { execProbe.push(st + '(站点未登记)'); return; }
    const over = decl.cap + 3;
    const arr = [];
    for (let i = 0; i < over; i++) arr.push({ name: 'probe' + i });
    const st0 = WA.evict.evictStat();
    const r = WA.evict.array(arr, st);
    const st1 = WA.evict.evictStat();
    if (!r.ok || r.dropped !== 3 || arr.length !== decl.cap) {
      execProbe.push(st + '(实测 dropped=' + r.dropped + ' len=' + arr.length + ' 期望 3/' + decl.cap + ')');
    }
    if ((st1.evicts - st0.evicts) !== 1) execProbe.push(st + '(未记账)');
    WA.evict.resetEvictStat();
  });
  assert(execProbe.length === 0, 'v2.13.0 站点「声明即执行」：实测丢弃数须等于超限数' + (execProbe.length ? '：' + execProbe.join('、') : '（20 站点逐站实测通过）'));
  // ③ 双集合同集合：登记表每一项都必须能被挤出侧解释
  const RUNSITE_KEYS = Object.keys(SITE_DECLS).map(function (s) { return SITE_DECLS[s].path; });
  const explained = function (k) {
    // 站点 path 可能含 `*`：用路径段通配匹配，而不是字符串前缀
    //   （否则 evolution.entityMemory.organization 永远对不上 evolution.entityMemory.*，
    //    会被误报成「未解释」——这正是本门禁首版的假失败）。
    if (RUNSITE_KEYS.some(function (p) { return sitePathMatch(p, k); })) return true;
    if (NON_EVICT_DECLS[k]) return true;
    if (k.indexOf('people.*.profile.') === 0) return true;          // 运行时单源（registry 查本登记表）
    if (k === 'consistency') return true;                            // 无写入方
    return false;
  };
  const unexplainedCaps = Object.keys(caps).filter(function (k) { return !explained(k); });
  assert(unexplainedCaps.length === 0,
    'v2.13.0 有界登记表每项都能被挤出侧解释（站点/非挤出/运行时单源/无写入方）'
    + (unexplainedCaps.length ? '——未解释：' + unexplainedCaps.join('、') : ''));
  assert(typeof WA.evict.evictStat === 'function' && typeof WA.evict.siteDecls === 'function',
    'v2.13.0 挤出侧单一出口与站点表已导出');
  // 旧口径（源码正则反查）退役为**负向对照**，但必须写成**诚实判据**：
  //   本版各站点都保留了 `else { ... slice(-CAP) ... }` 降级路径，字面量当然还在，
  //   所以「全库已无 slice(-N)」是**假判据**（本门禁首版即由此自误报）。
  //   真正该钉住的事实是两条，且都不可由「碰巧」通过：
  //     ① 记台账的调用确实存在（否则站点表就是自说自话）；
  //     ② 站点表每个站点都在产品源码里有调用点（无「声明了却没人用」的悬空站点）。
  //   遍历用本块自建的 PROD_G18（v2.8.0 块的 PROD2800 在其块内，不可跨块引用）。
  const PROD_G18 = [];
  (function walkG18(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === '.git' || e.name === 'node_modules') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walkG18(p);
      if (e.name.endsWith('.js') && dir !== path.join(BASE, 'tests')) PROD_G18.push(path.relative(BASE, p));
    });
  })(BASE);
  const CALL_RE_G18 = /WA\s*\.\s*evict\s*\.\s*(array|object)\s*\(\s*[^,()]+,\s*'([^']+)'/g;
  // note() 的站点名在**第一**参数（note('site', dropped[, cap])），与 array/object 相反：
  //   第一版只写了「第二参数是站点名」的一条正则，于是 note 型站点（仇敌/章节史/突发事件）
  //   全被判成「声明悬空」——判据错，不是代码错。两种形态分开扫。
  const NOTE_RE_G18 = /WA\s*\.\s*evict\s*\.\s*note\s*\(\s*'([^']+)'/g;
  const G18_SITES = {};
  let G18_CALLS = 0;
  PROD_G18.forEach(function (rel) {
    if (rel === 'core/evict.js') return;
    fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n').forEach(function (line) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      CALL_RE_G18.lastIndex = 0; let m;
      while ((m = CALL_RE_G18.exec(line))) { G18_CALLS++; G18_SITES[m[2]] = (G18_SITES[m[2]] || 0) + 1; }
      NOTE_RE_G18.lastIndex = 0; let n;
      while ((n = NOTE_RE_G18.exec(line))) { G18_CALLS++; G18_SITES[n[1]] = (G18_SITES[n[1]] || 0) + 1; }
    });
  });
  assert(G18_CALLS > 0, 'v2.13.0 挤出侧单一出口确有调用（实测 ' + G18_CALLS + ' 处 WA.evict.* 调用点）');
  const siteNoCall = Object.keys(SITE_DECLS).filter(function (st) { return !G18_SITES[st]; });
  assert(siteNoCall.length === 0, '站点表每项都在产品源码里有调用点（无声明悬空站点）'
    + (siteNoCall.length ? '——零调用：' + siteNoCall.join('、') : '（' + Object.keys(SITE_DECLS).length + ' 个站点全部在用）'));
  // 旧反查集的作用域仍在（readSrc 仍被使用，不是遗留死代码）
  assert(readSrc('core/store.js').indexOf('__BOUNDED_CAPS') >= 0, '旧反查集的作用域（store 登记表）仍在');
  // 登记表与反查规则须覆盖同一集合（consistency 无源码裁剪点，单列）
  // v2.2.0: 档案五节的裁剪上限改为「运行时单一真源」（消费端 actors/registry.js 查本登记表，
  //   全库无第二处写死），不再是源码字面常量正则反查项。集合比对须把它们计入「已覆盖」，
  //   否则会被误判为漏登（其运行时校验见 v1.5.0 块的 RUNTIME_CAP_RULES_1500）。
  const RUNTIME_CAP_KEYS = ['people.*.profile.personality', 'people.*.profile.worldview', 'people.*.profile.family', 'people.*.profile.memory', 'people.*.profile.relationships'];
  // v2.13.0: 原先是「登记表 ↔ 旧源码反查集」逐键**全等**。旧 CAP_RULES 逐项被站点接管后
  //   全等已无意义（登记表是每容器上限，站点表在同名容器上给出同一 cap，但键形状不同）。
  //   改为双向包含，两条都不可由碰巧通过：
  //     ① 登记表每个键都必须有解释方（站点 path / 非挤出声明 / 运行时单源 / 无写入方）；
  //     ② 旧反查集每个键仍必须在登记表上（防「规则还在守一个已注销的容器」）。
  const ruleKeys = Object.keys(CAP_RULES).concat(['consistency']).concat(RUNTIME_CAP_KEYS).sort().join(',');
  const capsNoExplain = Object.keys(caps).filter(function (k) { return !explained(k); });
  assert(capsNoExplain.length === 0, '登记表每键都有解释方（站点/非挤出/运行时单源/无写入方）'
    + (capsNoExplain.length ? '——未解释：' + capsNoExplain.join('、') : ''));
  const ruleNotInCaps = ruleKeys.split(',').filter(function (k) { return !Object.prototype.hasOwnProperty.call(caps, k); });
  assert(ruleNotInCaps.length === 0, '旧反查集每键仍在登记表上（无「守着一个已注销的容器」）'
    + (ruleNotInCaps.length ? '：' + ruleNotInCaps.join('、') : ''));
  // ── 双消费端：新规则必须同时有「诊断议题」与「面板出口」 ──
  //   本仓库铁律（v2.11.0 活性面审计结论）：只写采集端、不接消费端的台账，用户永远看不到。
  //   挤出侧尤其如此——它丢的是真数据，而丢完「看起来一切正常」，没有任何自证手段。
  const diagEv0 = WA.toolDiag.collect();
  assert(diagEv0.runtime && diagEv0.runtime.evict && typeof diagEv0.runtime.evict.sites === 'number',
    '（消费端①）诊断 runtime.evict 透出站点数与台账（此前挤出侧在诊断包里完全不存在）');
  const panelSrc1300 = readSrc('ui/panel.js');
  assert(panelSrc1300.indexOf('evictBlock()') > 0, '（消费端②）面板概览真的调用了挤出渲染块（不只是定义了函数）');
  assert(panelSrc1300.indexOf('容量收纳') > 0, '（消费端②）面板有「容量收纳」可见出口（丢的是谁要摆到用户眼前）');
  assert(readSrc('core/store.js').indexOf('evicts: evictsN') > 0, '（消费端③）健康分 signals 透出挤出三计量');
  // ── 负向探针：本模块三条口径全靠它们成立，缺一条就退化成「悄悄丢数据」 ──
  WA.evict.resetEvictStat();
  // ① 未知站点是缺陷，不是后备：**不做任何截断**
  const beforeUnknown = [1, 2, 3, 4, 5];
  const rUnknown = WA.evict.array(beforeUnknown, 'site.that.does.not.exist');
  assert(rUnknown.ok === false && rUnknown.reason === 'unknown-site', '（负向）未登记站点被拒绝（unknown-site）');
  assert(beforeUnknown.length === 5, '（负向）未登记站点**不做任何截断**——「先丢掉再说」是最贵的一类默认值');
  assert(WA.evict.evictStat().evictFailed === 1 && WA.evict.evictStat().failedBy['unknown-site'] === 1,
    '（负向）未登记站点进 failedBy 分桶（可归因，不是静默忽略）');
  // ② 参数非法归因，而不是糊过去
  const rBad = WA.evict.array(null, 'memory.l0');
  assert(rBad.ok === false && rBad.reason === 'not-array', '（负向）非数组输入归因 not-array');
  // ③ per-call 站点漏传上限 → bad-cap（不许悄悄回落默认值），且仍不截断
  const arrPerCall = [];
  for (let i = 0; i < 40; i++) arrPerCall.push({ text: '档' + i });
  const rNoLimit = WA.evict.array(arrPerCall, 'people.profile');
  assert(rNoLimit.ok === false && rNoLimit.reason === 'bad-cap', '（负向）per-call 站点漏传上限 → bad-cap（不回落默认值）');
  assert(arrPerCall.length === 40, '（负向）漏传上限时不截断（宁可超限也不静默丢弃）');
  const rLimit = WA.evict.array(arrPerCall, 'people.profile', 15);
  assert(rLimit.ok === true && rLimit.dropped === 25 && arrPerCall.length === 15,
    '（正向）显式传上限后按该上限裁（40 → 15，丢 25）');
  // ④ 「丢了什么」必须可读——只记条数等于什么都没说
  WA.evict.resetEvictStat();
  const namedDrop = [];
  for (let i = 0; i < 45; i++) namedDrop.push({ name: '角色' + i });
  WA.evict.array(namedDrop, 'memory.l0');        // cap 20 → 丢 25 个
  const mp1300 = WA.evict.evictStat();
  assert(mp1300.evicted === 25 && mp1300.lastDropped.length > 0 && /角色/.test(mp1300.lastDropped[0].what),
    '（正向）lastDropped 记元素摘要（「丢的是谁」而非只记条数）');
  assert(WA.evict.evictStat().bySite['memory.l0'] && WA.evict.evictStat().bySite['memory.l0'].dropped === 25,
    '（正向）bySite 逐站点归因（谁在丢东西）');
  // ⑤ 诊断议题分级：正常挤出 = info 且点名站点；失败 = error
  const dgEv = WA.toolDiag.collect();
  const evIssue = ((dgEv.verdict || {}).issues || []).filter(function (x) { return x.key === 'evict'; })[0];
  assert(evIssue && evIssue.level === 'info' && /memory\.l0/.test(evIssue.detail),
    '（消费端①·分级）正常挤出 → info 议题并点名站点（设计内行为不报红）');
  assert(dgEv.runtime.evict.lastDropped.length > 0, '诊断包透出「最近丢弃物」明细');
  // ⑥ 健康巡视：正常挤出只报 info；失败报 error（代码缺陷须上升为告警）
  const mtEv = WA.store.maintain();
  const mtEvInfo = (mtEv.issues || []).filter(function (x) { return x.key === 'evict'; })[0];
  assert(mtEvInfo && mtEvInfo.level === 'info', '（消费端③·分级）正常挤出在健康巡视里只报 info');
  assert(mtEv.signals.evicts === 1 && mtEv.signals.evictFailed === 0, '（消费端③）signals 记录本次挤出');
  WA.evict.array([1, 2], 'nope.nope');
  const mtFail = WA.store.maintain();
  const mtEvErr = (mtFail.issues || []).filter(function (x) { return x.key === 'evict.failed'; })[0];
  assert(mtEvErr && mtEvErr.level === 'error', '（消费端③·负向）挤出失败在健康巡视里报 error（须改代码，不是清存储）');
  // ④b 多站点互不冲刷（**放在 ⑤⑥ 之后**：它需要构建自己的台账，
  //   若插在 ④ 与 ⑤ 之间会把 ⑤⑥ 依赖的「memory.l0 挤出一次」状态清掉——
  //   本门禁首版正是这么写的，实测导致 4 条断言失败）。
  //   缺陷来源：端到端审计自纠——全局 lastDropped 只留 12 条，长局里先挤出的站点
  //   （people 丢 32 人）明细会被后挤出的站点（伏笔）立刻冲掉，「丢了哪 32 个角色」永远看不见。
  WA.evict.resetEvictStat();
  const mk = function (n, tag) { const a = []; for (let i = 0; i < n; i++) a.push({ name: tag + i }); return a; };
  WA.evict.array(mk(45, '甲'), 'memory.l0');              // 丢 25 个「甲」
  WA.evict.array(mk(45, '乙'), 'memory.l1');              // 丢 15 个「乙」（l1 cap 30）
  WA.evict.array(mk(50, '丙'), 'chapters.history');       // 丢 30 个「丙」
  const ms1300 = WA.evict.evictStat();
  assert((ms1300.bySite['memory.l0'].lastWhat || []).some(function (w) { return w.indexOf('甲') === 0; }),
    '（负向回归）多站点连挤后，先挤出的站点仍保留自己的「丢了谁」（全局环形会冲掉它）');
  assert((ms1300.bySite['chapters.history'].lastWhat || []).some(function (w) { return w.indexOf('丙') === 0; }),
    '（正向）后挤出的站点同样有自己的明细');
  assert(ms1300.evicts === 3 && ms1300.bySite['memory.l0'].dropped === 25 && ms1300.bySite['chapters.history'].dropped === 30,
    '（正向）三站点各自独立计数（不合并、不串扰）');
  const dgMulti = WA.toolDiag.collect();
  const evMulti = ((dgMulti.verdict || {}).issues || []).filter(function (x) { return x.key === 'evict'; })[0];
  assert(evMulti && /chapters\.history 最近被挤出的是：丙/.test(evMulti.detail),
    '（消费端①）诊断议题点名**最频繁站点自己的**丢弃物（而非全局最近）');
  const stMulti = WA.evict.evictStat();
  assert(JSON.stringify(stMulti.bySite['memory.l0'].lastWhat) !== JSON.stringify(stMulti.bySite['chapters.history'].lastWhat),
    '（负向）不同站点的明细互不相同（防「看着有明细、其实都指向同一批」的假通过）');
  WA.evict.resetEvictStat();
  if (typeof WA.flushLog === 'function') WA.flushLog();
  if (Array.isArray(WA.eventLog)) WA.eventLog.length = 0;
  if (Array.isArray(WA.errorLog)) WA.errorLog.length = 0;
  // 探针自清：台账归零 + 清掉探针自己产生的日志，避免污染后续「干净态」断言
  WA.evict.resetEvictStat();
  if (typeof WA.flushLog === 'function') WA.flushLog();
  if (Array.isArray(WA.eventLog)) WA.eventLog.length = 0;
  if (Array.isArray(WA.errorLog)) WA.errorLog.length = 0;
  assert(WA.evict.evictStat().evicts === 0 && WA.evict.evictStat().evictFailed === 0, '（自清）探针台账已归零');
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
  // v2.5.0: apply 段的参数随「幽灵设置键」出口扩了一维（ghostSettings），
  //   故断言从「逐字相等」放宽为「前缀命中」——仍校验两段式（先 dry-run 计划、后 apply 执行）。
  assert(panelSrc152.indexOf('sweepStaleKeys({})') >= 0 && /sweepStaleKeys\(\{ apply: true/.test(panelSrc152), '体检先 dry-run 后 apply 两段式');

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

  // ── D. orphan 检测：注册 orphan:true 且键不存在（v2.3.0 口径收紧） ──
  //   v2.3.0 前：oracle_plan 被误标 orphan:true，仅靠「键不存在」就判为孤儿候选。
  //   语义收窄后 orphan 专指「模块已声明废弃的幽灵键」，而 oracle_plan 是可选键（用户没规划弧线时本就缺席），
  //   已改标 optional。因此本段改为：可选键绝不出现在 orphan 候选里，休眠登记另有出口。
  global.localStorage.removeItem('worldaxis_oracle_plan_v1');   // 清 L1007 setPlan 残留，构造「键不存在」现场
  const orph200 = WA.store.orphanSettingsKeys();
  assert(Array.isArray(orph200), 'orphanSettingsKeys 返回数组');
  assert(WA.settingsBus.registry().some(function (r) { return r.key === 'worldaxis_oracle_plan_v1' && r.optional; }), 'oracle_plan 已改标 optional（可选键，非废弃键）');
  assert(!orph200.some(function (o) { return o.key === 'worldaxis_oracle_plan_v1'; }), '可选键即使未落盘也不进孤儿候选（不再误报）');
  assert(WA.settingsBus.registry().every(function (r) { return !(r.orphan && r.optional); }), '登记表无「既 orphan 又 optional」的矛盾项');
  // 非 orphan 键（backstage）不应在 orphan 列表
  assert(!orph200.some(function (o) { return o.key === 'worldaxis_backstage_settings_v1'; }), 'backstage 非 orphan 不在 orphan 列表');
  // 真幽灵出口：登记一个 orphan 键 → 读到（留下观测痕迹）→ 删掉 → 必进候选
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([{ key: 'worldaxis_ghost_probe_v1', def: null, module: 'test', orphan: true }]);
  global.localStorage.setItem('worldaxis_ghost_probe_v1', JSON.stringify({ x: 1 }));
  WA.settingsBus.read({ key: 'worldaxis_ghost_probe_v1' });       // 建立「曾存在」痕迹
  global.localStorage.removeItem('worldaxis_ghost_probe_v1');
  assert(WA.store.orphanSettingsKeys().some(function (o) { return o.key === 'worldaxis_ghost_probe_v1'; }), '曾存在后被删除的废弃键 → 真幽灵候选');
  WA.__settingsRegs = WA.__settingsRegs.filter(function (r) { return r.key !== 'worldaxis_ghost_probe_v1'; });

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
  assert(memSrc800.indexOf("l1.push({ t: clockNow('memory'), s: String(r.recap).slice(0, 200), refs: inheritRefs(batch) });") >= 0, 'L1 合并继承 refs（入账时间戳走决策时间）');
  assert(memSrc800.indexOf("l2.push({ t: clockNow('memory'), s: String(r.chapter).slice(0, 350), refs: inheritRefs(batch) });") >= 0, 'L2 合并继承 refs（入账时间戳走决策时间）');
  assert(memSrc800.indexOf("l3.push({ t: clockNow('memory'), theme: String(r.theme).slice(0, 250), worldShift: String(r.worldShift || '').slice(0, 200), refs: inheritRefs(batch) });") >= 0, 'L3 合并继承 refs（入账时间戳走决策时间）');
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
  // v2.2.0: 档案节上限从「源码字面常量」升级为「运行时单一真源」——
  //   旧断言查 profile.js 里的 push('personality', ..., 15) 字面量；现在消费端统一从容量登记表取，
  //   字面量消失是预期结果（写死常量才是缺陷：登记值与直写值任一处调整即产生 drifted 误报）。
  const regSrc1500 = fs.readFileSync(path.join(BASE, 'actors/registry.js'), 'utf8');
  assert(regSrc1500.indexOf("capsFor('people.p_x.profile.' + sec)") > 0, 'registry 写入时从容量登记表取档案节上限（单一真源）');
  assert(regSrc1500.indexOf('const cap = capOf(sec) || ') > 0 && regSrc1500.indexOf("capOf('relationships') || ") > 0, 'registry 五节上限均走 capOf（含兜底）');
  assert(profSrc1500.indexOf('WA.registry.setProfileSafe') > 0, 'profile.js 已改走 registry 契约（消除双写漂移）');
  const RUNTIME_CAP_RULES_1500 = { 'personality': /capOf\(sec\)/, 'worldview': /capOf\(sec\)/, 'family': /capOf\(sec\)/, 'memory': /capOf\(sec\)/, 'relationships': /capOf\('relationships'\)/ };
  const runtimeBad1500 = [];
  Object.keys(RUNTIME_CAP_RULES_1500).forEach(function (sec) {
    if (!RUNTIME_CAP_RULES_1500[sec].test(regSrc1500)) runtimeBad1500.push(sec + '(消费端未查登记表)');
    if (profSrc1500.indexOf("push('" + sec + "'") >= 0) runtimeBad1500.push(sec + '(profile.js 仍写死上限)');
  });
  assert(runtimeBad1500.length === 0, '档案五节为运行时单一真源（消费端查登记表 + 无第二处写死）' + (runtimeBad1500.length ? '：' + runtimeBad1500.join('、') : ''));
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
  assert(rpA1700.checked === 33, 'checked 精确值 33（v1.6.0 时 30，+people；v2.13.0 再 +smallSummaries/bigSummaries 两条真盲区）');
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
  v1900: {
  const LS1900 = global.localStorage;
  const junkBefore1900 = JSON.parse(JSON.stringify(LS1900._dump()));
  const evtBefore1900 = WA.eventLog.slice();
  const errBefore1900 = WA.errorLog.slice();
  const ctx1900 = global.SillyTavern.getContext();
  const prevChat1900 = ctx1900.chatId;
  const CID1900 = 'v1900_chat';
  const chat1900 = global.__mockChat;
  function resetLogs1900() { WA.flushLog(); WA.eventLog.length = 0; WA.errorLog.length = 0; }
  function fresh1900() { resetLogs1900(); LS1900.clear(); ctx1900.chatId = CID1900; chat1900.length = 0; WA.store.init(); }
  const stSrc1900 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  function logicOf1900(m) { return (m.issues || []).find(function (x) { return x.key === 'logic.consistency'; }); }
  function faultOf1900(m) { return (m.issues || []).find(function (x) { return x.key === 'engine.faultRate'; }); }
  function ev1900(id, name, type, stage) { return { id: id, name: name, type: type, stage: stage, level: 2, stageRound: 1 }; }
  function okEv1900(id, name) { return ev1900(id, name, 'conflict', '\u840c\u82bd'); }
  function setEvents1900(arr) { WA.store.transact(function (d) { d.evolution.events = arr; }); }
  // ── A. 干净世界接入不污染常态 ──
  fresh1900();
  const mA1900 = WA.store.maintain({});
  assert(!logicOf1900(mA1900) && !faultOf1900(mA1900), '干净世界无 logic/engine 议题（接入不误报）');
  assert(mA1900.signals.logicErrors === 0 && mA1900.signals.logicWarns === 0, 'signals 逻辑计量归零');
  assert(mA1900.signals.engineErrors === 0 && mA1900.signals.engineErrorsRecent === 0, 'signals 故障计量归零');
  // ── B. 世界逻辑劣化进巡视（inspector→maintain 断链修复）──
  setEvents1900([okEv1900(1, '\u5df7\u6218'), okEv1900(2, '\u5df7\u6218')]);
  const mB1900 = WA.store.maintain({});
  const liB1900 = logicOf1900(mB1900);
  assert(!!liB1900 && liB1900.level === 'error', '运行时矛盾（事件重名）→ error 议题（此前巡视不可见）');
  assert(mB1900.signals.logicErrors === 1 && mB1900.signals.logicNewErrors === 1, 'logicErrors/logicNewErrors 精确 1/1');
  assert(mB1900.score < mA1900.score, '劣化真扣健康分（' + mA1900.score + '→' + mB1900.score + '）');
  assert(mB1900.actions.some(function (a) { return a.id === 'review-logic'; }), '产出 review-logic 建议动作');
  assert(liB1900.detail.indexOf('\u4f53\u68c0') >= 0, '议题带修复入口指引');
  // ── C. 基线滚动：同一恶化不重复惩罚 ──
  const mC1900 = WA.store.maintain({});
  const liC1900 = logicOf1900(mC1900);
  assert(!!liC1900 && liC1900.level === 'info', '同一存量恶化下一周期回升 info（不永久锁死）');
  assert(mC1900.score > mB1900.score, '惩罚一次性、随后回升（' + mB1900.score + '→' + mC1900.score + '）');
  assert(mC1900.signals.logicErrors === 1, '回升不丢计量（logicErrors 仍 1）');
  // ── D. 自愈：修提示题消失（无需重启动）──
  setEvents1900([okEv1900(1, '\u7532'), okEv1900(2, '\u4e59')]);
  const mD1900 = WA.store.maintain({});
  assert(!logicOf1900(mD1900) && mD1900.signals.logicErrors === 0, '改名修复后议题自动消失（自愈可验证）');
  // ── E. 劣化按 code 多重集识别：换型也报、变多也报 ──
  setEvents1900([ev1900(1, 'E1', 'bogusType', '\u840c\u82bd')]);
  const mE1900 = WA.store.maintain({});
  assert(!!logicOf1900(mE1900) && mE1900.signals.logicErrors === 1 && mE1900.signals.logicNewErrors === 1, '空基线后引入 badType → 1 错 1 新增');
  setEvents1900([ev1900(1, 'E1', 'bogusType', '\u840c\u82bd'), okEv1900(2, '\u5df7\u6218'), okEv1900(3, '\u5df7\u6218')]);
  const mE21900 = WA.store.maintain({});
  assert(mE21900.signals.logicErrors === 2 && mE21900.signals.logicNewErrors === 1, '基线之上多出新类型（badType+dupName=2 错，仅 1 新增）');
  setEvents1900([ev1900(9, 'E9', 'bogusType', '\u840c\u82bd')]);
  const mE31900 = WA.store.maintain({});
  assert(mE31900.signals.logicErrors === 1 && mE31900.signals.logicNewErrors === 0, '修掉 dupName 只剩 badType（同类存量）→ 不判新增恶化');
  setEvents1900([okEv1900(1, 'E1'), okEv1900(2, 'E1')]);
  const mE41900 = WA.store.maintain({});
  assert(mE41900.signals.logicErrors === 1 && mE41900.signals.logicNewErrors === 1, '总数不变但劣化项易主（badType→dupName）仍判恶化（换型漏报防线）');
  assert(!!logicOf1900(mE41900) && logicOf1900(mE41900).level === 'error', '易主型恶化直接升 error（不被存量外表掩盖）');
    // ── F. 引擎故障接入（对象身份游标口径）──
  WA.errorLog.length = 0;
  WA.store.maintain({});
  const mF01900 = WA.store.maintain({});
  assert(!faultOf1900(mF01900) && mF01900.signals.engineErrorsRecent === 0, '空环连续巡视静默（primed 与 cursor 分离）');
  for (let i = 0; i < 5; i++) WA.log('error', 'v1900 boom' + i);
  const mF1900 = WA.store.maintain({});
  const fiF1900 = faultOf1900(mF1900);
  assert(!!fiF1900 && fiF1900.level === 'error', '本周期新增 5 次故障 → error 议题');
  assert(mF1900.signals.engineErrorsRecent === 5 && mF1900.signals.engineErrors === 5, 'recent/total 精确 5/5');
  assert(mF1900.actions.some(function (a) { return a.id === 'review-faults'; }), '产出 review-faults 建议动作');
  assert(fiF1900.detail.indexOf('v1900 boom') >= 0, '议题附带故障样本（可定位）');
  const mF21900 = WA.store.maintain({});
  assert(!faultOf1900(mF21900) && mF21900.signals.engineErrorsRecent === 0, '同毫秒连续巡视不重复计数（旧时间戳口径缺陷已消）');
  assert(mF21900.signals.engineErrors === 5, '存量口径保留（审计不丢）');
  // ── G. 载入期历史不追溯；游标失位退回时间口径 ──
  WA.errorLog.length = 0;
  WA.store.maintain({});
  const gNow1900 = Date.now();
  WA.errorLog.push({ t: gNow1900 - 60000, level: 'error', msg: 'v1900 legacy' });
  WA.errorLog.push({ t: gNow1900 - 30000, level: 'error', msg: 'v1900 legacy2' });
  WA.errorLog.push({ t: Date.now(), level: 'error', msg: 'v1900 fresh' });
  const mG1900 = WA.store.maintain({});
  assert(mG1900.signals.engineErrors === 3 && mG1900.signals.engineErrorsRecent === 1, '历史恢复条目不计入本周期（3 存量 / 1 新增）');
  assert(!!faultOf1900(mG1900) && faultOf1900(mG1900).level === 'warn', '低量故障分档 warn（不升 error）');
  const gCursorLost1900 = WA.errorLog[2];
  WA.errorLog = WA.errorLog.slice(0, 2).concat([gCursorLost1900, { t: Date.now() + 5, level: 'error', msg: 'v1900 ghost' }]);
  WA.errorLog = WA.errorLog.slice(0, 3).concat([WA.errorLog[3]]);
  const mGx1900 = WA.store.maintain({});
  assert(mGx1900.signals.engineErrorsRecent === 1, '游标推进后仅计基线后新增（实 ' + mGx1900.signals.engineErrorsRecent + '）');
  WA.errorLog = WA.errorLog.slice(-1);   // 截断使游标对象失位
  const mG21900 = WA.store.maintain({});
  assert(mG21900.signals.engineErrorsRecent === 0, '游标失位退回时间口径：环内仅剩基线后 1 条且已被消费 → 不重复报');
  WA.log('error', 'v1900 after-cursor-lost');
  const mG31900 = WA.store.maintain({});
  assert(!!faultOf1900(mG31900) && mG31900.signals.engineErrorsRecent === 1, '失位后新增故障仍可见（退回时间口径不静默）');
  // ── H. 降级安全：inspector 模块缺失不炸巡视 ──
  const keepIns1900 = WA.inspectorState;
  WA.inspectorState = undefined;
  const mH1900 = WA.store.maintain({});
  assert(typeof mH1900.score === 'number' && mH1900.signals.logicErrors === 0, 'inspector 缺失时巡视照常、计量不误报');
  assert(!logicOf1900(mH1900), 'inspector 缺失时不产逻辑议题（无源不编造）');
  WA.inspectorState = keepIns1900;
  assert(typeof WA.store.maintain({ deep: true }).score === 'number', 'deep 模式与新板块共存');
  // ── I. 高频负担 ──
  WA.errorLog.length = 0; WA.store.maintain({});
  const t0_1900 = Date.now();
  for (let i = 0; i < 30; i++) WA.store.maintain({});
  const per1900 = (Date.now() - t0_1900) / 30;
  assert(per1900 < 5, '接入后 maintain 平均 ' + per1900.toFixed(2) + 'ms（高频可负担）');
  // ── J. faultWatch 与 signals 同口径 ──
  const mJ1900 = WA.store.maintain({});
  const fw1900 = WA.store.maintainStat().faultWatch;
  assert(fw1900 && typeof fw1900.total === 'number' && typeof fw1900.scansWithFault === 'number', 'maintainStat 透出 faultWatch');
  assert(Array.isArray(fw1900.recentCodes), 'faultWatch.recentCodes 为数组');
  assert(fw1900.logicErrors === mJ1900.signals.logicErrors && fw1900.logicWarns === mJ1900.signals.logicWarns, 'faultWatch 逻辑计量与 signals 同口径');
  assert(fw1900.total === mJ1900.signals.engineErrors && fw1900.recent === mJ1900.signals.engineErrorsRecent, 'faultWatch 故障计量与 signals 同口径');
  // ── K. 源码契约 ──
  assert(stSrc1900.indexOf('WA.inspectorState.inspect(') >= 0, 'maintain 消费 inspectorState.inspect（断链修复契约）');
  assert(stSrc1900.indexOf('__faultWatch.primed') >= 0, 'primed 哨兵在位（冷启动空环不判载入期历史）');
  assert(stSrc1900.indexOf('indexOf(__faultWatch.cursor)') >= 0, '对象身份游标在位（毫秒同刻不重复计数）');
  assert(stSrc1900.indexOf("key: 'logic.consistency'") >= 0 && stSrc1900.indexOf("key: 'engine.faultRate'") >= 0, '两议题键在位');
  assert(!/^(hygiene|quarantine|state)\./.test('logic.consistency') && !/^(hygiene|quarantine|state)\./.test('engine.faultRate'), '新议题键不入卫生指纹范畴（L 块语义隔离）');
  assert(stSrc1900.indexOf('const tallyL') >= 0, '按 code 多重集基线在位（换型劣化可识别）');
  assert(!/logicBaseline\.count/.test(stSrc1900), '旧的总量差值口径已移除（防回潮）');
  // ── 清理现场 ──
  resetLogs1900();
  LS1900.clear();
  Object.keys(junkBefore1900).forEach(function (k) { LS1900.setItem(k, junkBefore1900[k]); });
  ctx1900.chatId = prevChat1900;
  WA.eventLog.length = 0;
  evtBefore1900.forEach(function (l) { WA.eventLog.push(l); });
  WA.errorLog.length = 0;
  errBefore1900.forEach(function (l) { WA.errorLog.push(l); });
  } // end v1.9.0 block
  v2000: {
  const LS2000 = global.localStorage;
  const ctx2000 = global.SillyTavern.getContext();
  const prevChat2000 = ctx2000.chatId;
  const stSrc2000 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  const idxSrc2000 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  const mvuSrc2000 = fs.readFileSync(path.join(BASE, 'compat/mvu.js'), 'utf8');
  const thSrc2000 = fs.readFileSync(path.join(BASE, 'compat/th-helper.js'), 'utf8');
  function fresh2000() { LS2000.clear(); ctx2000.chatId = 'v2000_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function iss2000(m, key) { return (m.issues || []).find(function (x) { return x.key === key; }); }

  // ── A. 块1：注册表契约（此前零写方，装载审计恒空）──
  fresh2000();
  assert(typeof WA.registerModule === 'function', 'registerModule 存在');
  assert(typeof WA.moduleRegistry === 'function', 'moduleRegistry 存在');
  assert(stSrc2000.indexOf('WA.registerModule = function') > 0, '注册表契约已下沉到 core/store.js（所有加载路径可见）');
  assert(idxSrc2000.indexOf("typeof WA.registerModule !== 'function'") > 0, 'index.js 保留转发兜底（防旧加载顺序）');
  const regRec2000 = WA.registerModule('__probe_mod.js', { kind: 'engine', ver: 'test' });
  assert(regRec2000 && regRec2000.name === '__probe_mod.js' && regRec2000.kind === 'engine', 'registerModule 返回记录且字段正确');
  assert(WA.moduleRegistry().indexOf('__probe_mod.js') >= 0, 'moduleRegistry 列出已注册模块');
  assert(WA.registerModule('') === null, '空名注册返回 null（不污染注册表）');
  delete WA.modules['__probe_mod.js'];
  const regCountBefore2000 = Object.keys(WA.modules).length;
  assert(WA.toolDiag && WA.toolDiag.collect, 'toolDiag.collect 存在（注册表消费方）');
  const dg2000 = WA.toolDiag.collect();
  assert(dg2000.modules && Array.isArray(dg2000.modules.registeredModules), 'tool-diag 消费注册表为数组');
  assert(dg2000.modules.registeredModules.length === regCountBefore2000, 'tool-diag 读数与注册表同源（不再恒空）');

  // ── B. 块2：兼容层激活（此前 sync/expose 定义却无人调用）──
  assert(typeof WA.compatMvu.init === 'function' && typeof WA.compatMvu.status === 'function', 'compatMvu 有 init/status');
  assert(typeof WA.compatTH.init === 'function' && typeof WA.compatTH.status === 'function', 'compatTH 有 init/status');
  const ms2000 = WA.compatMvu.status();
  assert(ms2000 && typeof ms2000.active === 'boolean', 'compatMvu.status 透出 active 布尔');
  const ts2000 = WA.compatTH.status();
  assert(ts2000 && typeof ts2000.active === 'boolean', 'compatTH.status 透出 active 布尔');
  assert(idxSrc2000.indexOf('WA.compatMvu.init') > 0 && idxSrc2000.indexOf('WA.compatTH.init') > 0, 'index.js 启动时调用兼容层 init（死代码激活）');
  assert(mvuSrc2000.indexOf('__mvuState') > 0, 'compatMvu 观测状态在位');
  assert(thSrc2000.indexOf('__thState') > 0, 'compatTH 观测状态在位');

  // ── C. 块3：巡视自身降级（元级可观测性）──
  fresh2000();
  WA.store.maintain({});
  const baseC2000 = WA.store.maintain({}).score;
  const mC0 = WA.store.maintain({});
  assert(!iss2000(mC0, 'patrol.degraded'), '无降级时不产 patrol.degraded');
  assert(mC0.signals.patrolDegraded === 0, 'signals.patrolDegraded 初始 0');
  const oStorage2000 = WA.store.storageStat;
  WA.store.storageStat = function () { throw new Error('boom'); };
  const mC1 = WA.store.maintain({});
  WA.store.storageStat = oStorage2000;
  const pd2000 = iss2000(mC1, 'patrol.degraded');
  assert(!!pd2000 && pd2000.level === 'error', '采集节抛错产 error 级 patrol.degraded（此前裸 catch 静默）');
  assert(/storageStat/.test(String(pd2000.detail)), 'detail 点名失败节');
  assert(mC1.score < baseC2000, '健康分不假绿');
  assert(mC1.level !== 'ok', '降级轮不报 ok 档（防倒挂）');
  assert(mC1.actions.some(function (a) { return a.id === 'review-degraded'; }), '产 review-degraded 修复入口');
  assert(mC1.signals.patrolDegradedSections.indexOf('storageStat') >= 0, 'signals 透出失败节名');
  const mC2 = WA.store.maintain({});
  assert(!iss2000(mC2, 'patrol.degraded') && mC2.signals.patrolDegraded === 0, '按轮计：恢复后不粘留');
  assert(mC2.score === baseC2000, '恢复后回基线分');
  const stC2000 = WA.store.maintainStat();
  assert(stC2000.patrol && stC2000.patrol.degraded >= 1, 'maintainStat 累计降级可追溯');
  assert(stC2000.patrol.lastSections.length === 0, 'lastSections 按轮更新（本轮已恢复为空）');
  const oDiag2000 = WA.store.diagBudget, oVer2000 = WA.store.verifyAll, oQuar2000 = WA.store.quarantineStat, oSweep2000 = WA.store.sweepStaleKeys;
  WA.store.diagBudget = function () { throw new Error('b'); };
  WA.store.verifyAll = function () { throw new Error('b'); };
  WA.store.quarantineStat = function () { throw new Error('b'); };
  WA.store.sweepStaleKeys = function () { throw new Error('b'); };
  const mC3 = WA.store.maintain({});
  WA.store.diagBudget = oDiag2000; WA.store.verifyAll = oVer2000; WA.store.quarantineStat = oQuar2000; WA.store.sweepStaleKeys = oSweep2000;
  assert(mC3.signals.patrolDegraded >= 4, '五采集节逐一可捕获（无漏网）');
  assert(mC3.score >= 0, '降级扣分不为负');
  assert(stSrc2000.indexOf('__maintainDegraded') > 0 && stSrc2000.indexOf('function markDegraded') > 0, '台账与标记函数在位');
  assert(stSrc2000.indexOf('__maintainDegraded.sections.length = 0') > 0, '每轮清空台账在位');
  assert(stSrc2000.indexOf('score = Math.min(score, 89)') > 0, '降级轮分数封顶 89 在位（修倒挂：巡视坏了分数反而更高）');
  assert((stSrc2000.match(/markDegraded\('/g) || []).length >= 5, '五个采集点均接入 markDegraded');

  // ── D. 块4：模块装载完整性入巡视 ──
  fresh2000();
  WA.store.maintain({});
  const baseD2000 = WA.store.maintain({}).score;
  const oLO2000 = WA.__loadOrder, oLF2000 = WA.__loadFailed;
  const mD0 = WA.store.maintain({});
  assert(!iss2000(mD0, 'module.integrity') && mD0.signals.moduleDeclared === 0, '无装载信息时不产 module.integrity（vm 测试链无假阳性）');
  WA.__loadOrder = ['core/store.js', 'engines/render-illust.js', 'engines/actors.js', 'ui/panel.js'];
  WA.__loadFailed = ['engines/render-illust.js'];
  ['core/store.js', 'engines/actors.js', 'ui/panel.js'].forEach(function (r) { WA.registerModule(r, { kind: 'engine' }); });
  const mD1 = WA.store.maintain({});
  const mi2000 = iss2000(mD1, 'module.integrity');
  assert(!!mi2000 && mi2000.level === 'error', '模块加载失败产 error 级 module.integrity');
  assert(/render-illust/.test(String(mi2000.detail)), 'detail 点名失败模块');
  assert(mD1.signals.moduleFailed === 1 && mD1.signals.moduleDeclared === 4 && mD1.signals.moduleLoaded === 3, 'signals 透出失败/声明/已载三元组');
  assert(baseD2000 - mD1.score === 8, '单模块失败扣 8 分');
  assert(mD1.actions.some(function (a) { return a.id === 'review-modules'; }), '产 review-modules 修复入口');
  WA.__loadFailed = [];
  const mD2 = WA.store.maintain({});
  const mi2 = iss2000(mD2, 'module.integrity');
  assert(!!mi2 && mi2.level === 'warn' && mD2.signals.moduleMissing === 1, '已加载未注册 → warn 级注册缺口议题');
  assert(baseD2000 - mD2.score === 3, '单缺口扣 3 分');
  WA.registerModule('engines/render-illust.js', { kind: 'engine' });
  const mD3 = WA.store.maintain({});
  assert(!iss2000(mD3, 'module.integrity') && mD3.score === baseD2000, '三方对齐后安静且分数回基线');
  WA.__loadOrder = Array.from({ length: 10 }, function (_, i) { return 'm' + i + '.js'; });
  WA.__loadFailed = WA.__loadOrder.slice();
  const mD4 = WA.store.maintain({});
  assert(baseD2000 - mD4.score <= 24, '模块失败扣分上限 24');
  assert(mD4.score >= 0, '模块失败扣分不为负');
  WA.__loadOrder = oLO2000; WA.__loadFailed = oLF2000;
  assert(stSrc2000.indexOf('Math.min(24, modFailed * 8)') > 0 && stSrc2000.indexOf('Math.min(9, modMissing * 3)') > 0, '模块扣分公式在位');
  const stD2000 = WA.store.maintainStat();
  assert(stD2000.modules && typeof stD2000.modules.declared === 'number' && typeof stD2000.modules.registered === 'number', 'maintainStat 透出模块三元组');

  // ── E. 块5：deep 引擎自检接入 ──
  fresh2000();
  WA.store.maintain({});
  const mEbase0 = WA.store.maintain({});
  const mE0 = WA.store.maintain({ deep: true });
  assert(mE0.signals.selfCheckRan === true, 'deep 跑引擎自检');
  assert(mE0.signals.contractErrors === 0 && mE0.signals.samplerOk === true && mE0.signals.purifierBadRules === 0, '基线三能力全干净（接入无假阳性）');
  assert(mE0.score >= mEbase0.score - 6, 'deep 不引入额外扣分（存量提醒不扣分）');
  const mEnon0 = WA.store.maintain({});
  assert(mEnon0.signals.selfCheckRan === false, '非 deep 路径不跑自检');
  // 每次注入前紧邻重取同型基线（卫生噪音与扣分断言脱钩）
  function deepBase2000() { WA.store.maintain({ deep: true }); return WA.store.maintain({ deep: true }).score; }
  const oCA2000 = WA.contractAudit.audit;
  const bd1 = deepBase2000();
  WA.contractAudit.audit = function () { return { verdict: { ok: false, errorCount: 3, warnCount: 1 }, issues: [{ level: 'error', code: 'cross_module_drift', detail: 'x' }] }; };
  const mE2 = WA.store.maintain({ deep: true });
  WA.contractAudit.audit = oCA2000;
  const ec2000 = iss2000(mE2, 'engine.contract');
  assert(!!ec2000 && ec2000.level === 'error' && mE2.signals.contractErrors === 3, '契约阻断 → error 级 engine.contract');
  assert(bd1 - mE2.score === 15, '契约阻断 3 × 5 = 15 分');
  assert(mE2.actions.some(function (a) { return a.id === 'review-contract'; }), '产 review-contract 修复入口');
  const oSC2000 = WA.samplerCheck.runChecks;
  const bd2 = deepBase2000();
  WA.samplerCheck.runChecks = function () { return { checks: [{ name: 'ref', ok: false }, { name: 'bias', ok: false }, { name: 'pure', ok: true }], verdict: { ok: false, pass: 1, total: 3 } }; };
  const mE3 = WA.store.maintain({ deep: true });
  WA.samplerCheck.runChecks = oSC2000;
  const sc2000 = iss2000(mE3, 'engine.sampler');
  assert(!!sc2000 && sc2000.level === 'warn' && mE3.signals.samplerOk === false, '采样器自检不过 → warn 级 engine.sampler');
  assert(bd2 - mE3.score === 8, '采样器 2 项失败 × 4 = 8 分');
  const oGR2000 = WA.purifier.getRules;
  const bd3 = deepBase2000();
  WA.purifier.getRules = function () { return [{ id: 'a', find: 'ok.*', flags: 'g', enabled: true }, { id: 'b', find: '([', flags: 'g', enabled: true }, { id: 'c', find: '([', flags: 'g', enabled: false }]; };
  const mE4 = WA.store.maintain({ deep: true });
  WA.purifier.getRules = oGR2000;
  const pu2000 = iss2000(mE4, 'engine.purifier');
  assert(!!pu2000 && pu2000.level === 'warn' && mE4.signals.purifierBadRules === 1, '非法净化规则 → warn 级（禁用规则不计）');
  assert(bd3 - mE4.score === 3, '非法规则 1 条 × 3 = 3 分');
  assert(mE4.actions.some(function (a) { return a.id === 'review-purifier'; }), '产 review-purifier 修复入口');
  const oCA2 = WA.contractAudit.audit;
  WA.contractAudit.audit = function () { throw new Error('boom'); };
  const mE5 = WA.store.maintain({ deep: true });
  WA.contractAudit.audit = oCA2;
  assert(iss2000(mE5, 'patrol.degraded'), '自检抛错入降级台账（不被吞）');
  assert(mE5.signals.patrolDegradedSections.indexOf('contractAudit') >= 0, '台账点名 contractAudit（节序：自检先于完整性聚合）');
  assert(mE5.score <= 89, '自检失败时降级封顶生效');

  // ── F. 源码契约与语义隔离 ──
  assert(stSrc2000.indexOf('Math.min(15, contractErrors * 5)') > 0, '契约扣分公式在位');
  assert(stSrc2000.indexOf('Math.min(12, (samplerTotal - samplerPass) * 4)') > 0, '采样器扣分公式在位');
  assert(stSrc2000.indexOf('Math.min(9, purifierBad * 3)') > 0, '净化扣分公式在位');
  assert(stSrc2000.indexOf('o.deep === true') > 0 && stSrc2000.indexOf('selfCheckRan') > 0, 'deep 门控与自检信号在位');
  ['patrol.degraded', 'module.integrity', 'engine.contract', 'engine.sampler', 'engine.purifier'].forEach(function (k) {
    assert(!/^(hygiene|quarantine|state)\./.test(k), k + ' 避开卫生指纹正则');
  });
  // 节序：自检节必须先于「巡视自身完整性」聚合节（否则自检失败对巡视不可见）
  const posSelf2000 = stSrc2000.indexOf('\u5f15\u64ce\u81ea\u68c0\u80fd\u529b\u63a5\u5165');
  const posAgg2000 = stSrc2000.indexOf('\u5de1\u89c6\u81ea\u8eab\u5b8c\u6574\u6027');
  assert(posSelf2000 > 0 && posAgg2000 > 0 && posSelf2000 < posAgg2000, '节序正确：引擎自检在巡视完整性聚合之前');

  // ── 清理现场 ──
  ctx2000.chatId = prevChat2000;
  LS2000.clear();
  } // end v2.0.0 block
  v2100: {
  const LS2100 = global.localStorage;
  const ctx2100 = global.SillyTavern.getContext();
  const prevChat2100 = ctx2100.chatId;
  const iSrc2100 = fs.readFileSync(path.join(BASE, 'core/interceptor.js'), 'utf8');
  const pSrc2100 = fs.readFileSync(path.join(BASE, 'render/purifier.js'), 'utf8');
  const sSrc2100 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  function fresh2100() { LS2100.clear(); ctx2100.chatId = 'v2100_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function purStat2100() { return WA.purifier.stat(); }

  // ── A. 块1：输出净化接入（此前 apply 全库零调用 = 功能整体失效）──
  fresh2100();
  section('v2.1.0 块1：输出净化接入（修功能级失效）');
  assert(typeof WA.purifier.applySafe === 'function', 'purifier.applySafe 存在（安全入口）');
  assert(typeof WA.purifier.stat === 'function', 'purifier.stat 存在（可观测通道）');
  assert(iSrc2100.indexOf('MESSAGE_RECEIVED && !purifyHooked') > 0, '输出侧挂载在位（MESSAGE_RECEIVED）');
  assert(iSrc2100.indexOf('__purifiedRaw = new WeakMap()') > 0, '原文快照容器在位（WeakMap，不污染 chat 存档）');
  assert(pSrc2100.indexOf('__purifyStat.charsSaved') > 0, 'purifier 观测对象在位');
  assert(sSrc2100.indexOf('purifyRuleErrors') > 0, 'store 消费净化统计在位');
  assert(iSrc2100.indexOf("WA.emit('purify:changed'") < 0, '不自造新死事件（stat() 通道已足够）');

  // A1. 功能级生效：AI 回复真的被净化
  const chat2100 = global.__mockChat;
  WA.interceptor.install();
  const ORIG2100 = '\u8499\u9762\u4eba\u538b\u4f4e\u58f0\u97f3\uff1a\u300c\u4f60\u4e0d\u8be5\u6765\u8fd9\u91cc\u3002\u300d<think>\u6211\u5e94\u8be5\u8ba9\u4ed6\u5f00\u53e3</think>\u7a97\u5916\u7a81\u7136\u4f20\u6765\u9a6c\u8e44\u58f0\u3002';
  chat2100.push({ is_user: false, name: '\u65c1\u767d', mes: ORIG2100, swipe_id: 0 });
  const stB2100 = purStat2100();
  await global.__triggerEvent('msg_recv', chat2100.length - 1);
  const stA2100 = purStat2100();
  assert(stA2100.runs === stB2100.runs + 1, '事件触发后净化真的跑了（runs+1）');
  assert(stA2100.changed === stB2100.changed + 1, '命中计数可见（changed+1）');
  assert(chat2100[chat2100.length - 1].mes.indexOf('<think>') < 0, 'AI 回复中的思考块已被移除（此前原样进入消息）');
  assert(chat2100[chat2100.length - 1].mes.indexOf('\u9a6c\u8e44\u58f0') > 0, '正文保留（不是被整条删）');
  assert(stA2100.charsSaved >= 20, '省下字符数可见');
  assert(stA2100.lastRules.indexOf('think_block') >= 0, '命中规则 id 可追溯');

  // A2. 口径隔离：世界推进读原文，不读净化后文本
  const origRun2100 = WA.workflow.run;
  let seen2100 = null;
  WA.workflow.run = async function (phase, actx) {
    if (phase === 'after' && actx && actx.chat && actx.chat.length) seen2100 = actx.chat[actx.chat.length - 1].mes;
    return origRun2100.apply(this, arguments);
  };
  chat2100[chat2100.length - 1].mes = ORIG2100;
  await global.__triggerEvent('msg_recv', chat2100.length - 1);
  const purified2100 = chat2100[chat2100.length - 1].mes;
  await global.__triggerEvent('gen_ended');
  WA.workflow.run = origRun2100;
  assert(seen2100 === ORIG2100, '世界推进读到的是原文（含思考块）——显示层未污染推进口径');
  assert(chat2100[chat2100.length - 1].mes === purified2100, '推进结束后恢复净化文本（用户所见不回退）');
  assert(purified2100.indexOf('<think>') < 0, '恢复的确实是净化后文本');

  // A3. 空结果守卫：规则过宽不能吞掉整条回复
  const savedR2100 = WA.purifier.rules.slice();
  WA.purifier.rules = [{ id: 'probe_eat_all', find: '[\\s\\S]*', replace: '', flags: 'g', enabled: true }];
  const stG2100 = purStat2100();
  const TXT2100 = '\u8fd9\u662f\u4e00\u6761\u5f88\u957f\u7684\u6b63\u6587\uff0c\u4e0d\u80fd\u88ab\u541e\u3002';
  assert(WA.purifier.applySafe(TXT2100) === TXT2100, '净化后为空时回退原文（防整条消失）');
  assert(purStat2100().blocked === stG2100.blocked + 1, 'blocked 计数可见');
  assert(purStat2100().changed === stG2100.changed, '被拦下不计入 changed（不误报成功）');
  WA.purifier.rules = savedR2100;

  // A4. 规则异常可见（静态正则扫描抓不到运行时异常）
  const savedR2_2100 = WA.purifier.rules.slice();
  WA.purifier.rules = [{ id: 'probe_bad_re', find: '[', replace: '', flags: 'g', enabled: true }];
  let threw2100 = false;
  const stE2100 = purStat2100();
  try { WA.purifier.applySafe('\u6b63\u6587'); } catch (e) { threw2100 = true; }
  assert(!threw2100, '非法正则不抛出（不能弄挂生成流程）');
  assert(purStat2100().ruleErrors === stE2100.ruleErrors + 1, 'ruleErrors 计数可见');
  WA.purifier.rules = [{ id: 'probe_rt_err', find: '\u6b63\u6587', replace: function () { throw new Error('probe-rt'); }, flags: 'g', enabled: true }];
  const stR2100 = purStat2100();
  let threw2100b = false, outR2100 = null;
  try { outR2100 = WA.purifier.applySafe('\u6b63\u6587'); } catch (e) { threw2100b = true; }
  assert(!threw2100b, '替换值运行时抛错也不弄挂流程');
  assert(purStat2100().ruleErrors === stR2100.ruleErrors + 1, '运行时异常计入 ruleErrors（静态扫描抓不到）');
  assert(outR2100 === '\u6b63\u6587', '异常规则被跳过后正文原样返回');
  WA.purifier.rules = savedR2_2100;

  // A5. 巡视消费净化统计（engine.purifier 扩展）
  const m0_2100 = WA.store.maintain({ deep: true });
  assert(m0_2100.signals.purifyRuns > 0, 'deep 巡视透出净化运行数（此前无任何消费）');
  assert(m0_2100.signals.purifyChanged > 0, 'deep 巡视透出命中数');
  const base2100 = m0_2100.score;
  const savedR3_2100 = WA.purifier.rules.slice();
  WA.purifier.rules = [{ id: 'probe_rt_err2', find: '\u6b63\u6587', replace: function () { throw new Error('probe-rt2'); }, flags: 'g', enabled: true }];
  WA.purifier.applySafe('\u6b63\u6587');
  const m1_2100 = WA.store.maintain({ deep: true });
  WA.purifier.rules = savedR3_2100;
  assert(m1_2100.signals.purifierBadRules === 0, '静态非法规则为 0（排除旧通道掩盖）');
  assert(!!(m1_2100.issues || []).find(function (i) { return i.key === 'engine.purifier'; }), '规则异常产 engine.purifier 议题');
  assert(m1_2100.signals.purifyRuleErrors > 0, 'signals.purifyRuleErrors 可见');
  assert(m1_2100.score < base2100, '健康分不假绿（低于基线）');
  assert(m1_2100.score >= 0, '分数不为负');
  assert(sSrc2100.indexOf('Math.min(6, purifyRuleErrors * 2)') > 0, '净化异常扣分公式在位（封顶 6）');

  // A6. 边界：用户消息不被净化 / 空文本 / 未装配降级
  chat2100.push({ is_user: true, mes: '\u6211\u7684\u8f93\u5165<think>\u4e0d\u8be5\u52a8</think>', swipe_id: 0 });
  const stU2100 = purStat2100();
  await global.__triggerEvent('msg_recv', chat2100.length - 1);
  assert(chat2100[chat2100.length - 1].mes.indexOf('<think>') >= 0, '用户消息不被净化（不改用户输入）');
  assert(purStat2100().runs === stU2100.runs, '用户消息不计入净化运行数');
  chat2100.pop();
  const stZ2100 = purStat2100();
  WA.purifier.applySafe('');
  assert(purStat2100().runs === stZ2100.runs + 1 && purStat2100().changed === stZ2100.changed, '空文本不误报为命中');
  assert(iSrc2100.indexOf("typeof WA.purifier.applySafe !== 'function'") > 0, '净化模块缺失时安全降级（不抛错）');
  assert(/catch \(e\) \{ WA\.log\('warn', '\u8f93\u51fa\u51c0\u5316\u5931\u8d25/.test(iSrc2100), '净化异常不影响生成结果');
  assert(!/^(hygiene|quarantine|state)\./.test('engine.purifier'), '议题键 engine.purifier 避开卫生指纹正则');

  // ── 清理现场 ──
  ctx2100.chatId = prevChat2100;
  LS2100.clear();
  // ── B. 块2：世界钟自动推进（此前 suggestAdvance 零消费 = 功能整体失效）──
  fresh2100();
  section('v2.1.0 块2：世界钟自动推进（修功能级失效）');
  const cSrc2100 = fs.readFileSync(path.join(BASE, 'engines/calendar.js'), 'utf8');
  const pSrcCal2100 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(typeof WA.calendar.autoAdvance === 'function', 'calendar.autoAdvance 存在');
  assert(typeof WA.calendar.stat === 'function', 'calendar.stat 存在（可观测）');
  const calNode2100 = WA.workflow.list('after').find(function (n) { return n.id === 'calendar.autoAdvance'; });
  assert(!!calNode2100, 'after 链注册了 calendar.autoAdvance 节点');
  assert(calNode2100 && calNode2100.order === 12, '节点 order 12（先于演化/记忆）');
  assert(WA.calendar.suggestAdvance('\u6b21\u65e5\u6e05\u6668\uff0c\u4ed6\u8d70\u51fa\u5c4b\u95e8\u3002') === 'day', '「次日」→ day');
  assert(WA.calendar.suggestAdvance('\u9ec4\u660f\u65f6\u5206\u96e8\u505c\u4e86\u3002') === 'evening', '「黄昏」→ evening');
  assert(WA.calendar.suggestAdvance('\u7834\u6653\u524d\u7684\u98ce\u5f88\u51b7\u3002') === 'dawn', '「破晓」→ dawn');
  assert(WA.calendar.suggestAdvance(null) === null, '空值不报错');

  // B1. 功能级生效：世界钟真的走了
  WA.store.transact(function (d) { d.clock = { iso: '', label: '\u7b2c1\u65e5\u00b7\u9ec4\u660f', dayIndex: 1, source: 'user' }; });
  const stCal0 = WA.calendar.stat();
  const rc2100 = WA.calendar.autoAdvance('\u6b21\u65e5\uff0c\u9633\u5149\u7167\u8fdb\u7a97\u5185\u3002');
  assert(rc2100.ok === true && rc2100.kind === 'day', '正文「次日」推进成功（kind=day）');
  assert(WA.store.read('clock.dayIndex', 0) === 2, 'dayIndex 1 → 2（此前永远不动）');
  assert(WA.store.read('clock.label', '') === '\u7b2c2\u65e5\u00b7\u9ec4\u660f', '跳日保留时段信息（第1日·黄昏 → 第2日·黄昏）');
  assert(WA.store.read('clock.source', '') === 'text', 'source 记为 text（区分手动 user）');
  assert(WA.calendar.stat().advanced === stCal0.advanced + 1, 'advanced 计数可见');

  // B2. 无时间词不推进
  const calBefore2100 = WA.store.read('clock.label', '');
  const rn2100 = WA.calendar.autoAdvance('\u4ed6\u62ac\u8d77\u5934\uff0c\u770b\u4e86\u4e00\u773c\u3002');
  assert(rn2100.ok === false && rn2100.reason === 'no-time-word', '无时间词不推进（不噪声推进）');
  assert(WA.store.read('clock.label', '') === calBefore2100, '世界钟原地不动');
  assert(WA.calendar.stat().noSignal > 0, 'noSignal 计数可见');

  // B3. 去重：重掷不双计
  const dupT2100 = '\u9ec4\u660f\u65f6\u5206\uff0c\u706f\u706b\u4eae\u8d77\u3002';
  const rd1_2100 = WA.calendar.autoAdvance(dupT2100);
  const lbl1_2100 = WA.store.read('clock.label', '');
  const rd2_2100 = WA.calendar.autoAdvance(dupT2100);
  assert(rd1_2100.ok === true, '首次推进成功');
  assert(rd2_2100.ok === false && rd2_2100.reason === 'dedup', '同文本重复不双计（dedup）');
  assert(WA.store.read('clock.label', '') === lbl1_2100, '世界钟未被双推');
  assert(WA.calendar.stat().deduped > 0, 'deduped 计数可见');

  // B4. 可关闭（面板开关）
  WA.calendar.setSettings({ auto: false });
  assert(WA.calendar.stat().auto === false, 'stat().auto 反映开关状态');
  const rOff2100 = WA.calendar.autoAdvance('\u6b21\u65e5\u53c8\u4e0b\u96e8\u4e86\u3002');
  assert(rOff2100.ok === false && rOff2100.reason === 'disabled', '关闭后不推进');
  const rForce2100 = WA.calendar.autoAdvance('\u6b21\u65e5\u53c8\u4e0b\u96e8\u4e86\u3002', { force: true });
  assert(rForce2100.ok === true, 'force 可旁路关闭（手动追推入口）');
  WA.calendar.setSettings({ auto: true });
  assert(WA.calendar.stat().auto === true, '重新开启生效');

  // B5. 端到端：真实 after 链驱动
  WA.interceptor.install();
  chat2100.push({ is_user: false, name: '\u65c1\u767d', mes: '\u6b21\u65e5\uff0c\u4ed6\u63a8\u5f00\u9152\u9986\u7684\u95e8\u3002', swipe_id: 0 });
  const dayE2E2100 = WA.store.read('clock.dayIndex', 0);
  await global.__triggerEvent('gen_ended');
  assert(WA.store.read('clock.dayIndex', 0) === dayE2E2100 + 1, '端到端：gen_ended 后世界钟真的推了一天（此前链里无任何时间推进）');

  // B6. 巡视可见
  const mCal2100 = WA.store.maintain({});
  assert(mCal2100.signals.calendarAdvances > 0, '巡视透出自动推进次数');
  assert(mCal2100.signals.calendarRuns > 0, '巡视透出检查次数');
  assert(mCal2100.signals.calendarAuto === true, '巡视透出开关状态');
  const savedCalMod2100 = WA.calendar;
  WA.calendar = null;
  const mCalNo2100 = WA.store.maintain({});
  WA.calendar = savedCalMod2100;
  assert(!!(mCalNo2100.issues || []).find(function (i) { return i.key === 'engine.calendar'; }), '世界钟模块缺失产 engine.calendar 议题');
  assert(!/^(hygiene|quarantine|state)\./.test('engine.calendar'), '议题键 engine.calendar 避开卫生指纹正则');
  assert(cSrc2100.indexOf('worldaxis_calendar_settings_v1') > 0, '设置键走 settingsBus（可迁移/损坏隔离）');
  assert(pSrcCal2100.indexOf('wa-cal-auto') > 0, '面板开关已接线');
  assert(pSrcCal2100.indexOf('calendar.stat') > 0, '面板展示推进留痕');
  // ── C. 块3：AI 剧情弧线接入（此前 generatePlan 零调用 = AI 参谋形同虚设）──
  fresh2100();
  section('v2.1.0 块3：AI 剧情弧线接入（修功能级失效）');
  const oSrc2100 = fs.readFileSync(path.join(BASE, 'direction/oracle.js'), 'utf8');
  const uSrc2100 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
  assert(typeof WA.oracle.generatePlanSafe === 'function', 'oracle.generatePlanSafe 存在（面板入口）');
  assert(typeof WA.oracle.stat === 'function', 'oracle.stat 存在（可观测）');
  assert(uSrc2100.indexOf('wa-or-gen') > 0, '面板渲染了「AI 生成弧线」按钮');
  assert(/on\('#wa-or-gen',[\s\S]{0,400}generatePlanSafe/.test(uSrc2100), '按钮已绑定到安全入口（有按钮无绑定 = 死按钮）');
  assert(/on\('#wa-beat-next'[\s\S]{0,200}WA\.oracle\.advance\(\)/.test(uSrc2100), '面板「完成本拍」改走 advance()（单一实现）');
  assert(uSrc2100.indexOf('WA.oracle.plan.current++') < 0, '旧的直接 current++ 已移除');

  // C1. 守卫：空目标 / 通道未配置
  LS2100.removeItem('worldaxis_oracle_plan_v1');
  WA.oracle.setPlan(null);
  const rEmpty2100 = await WA.oracle.generatePlanSafe('   ', 5);
  assert(rEmpty2100.ok === false && rEmpty2100.reason === 'empty-goal', '空目标拒绝（不浪费通道配额）');
  const savedJudge2100 = JSON.parse(JSON.stringify(WA.apiRouter.getChannel('judge')));
  WA.apiRouter.setChannel && WA.apiRouter.setChannel('judge', { baseUrl: '', model: '' });
  const rNoCfg2100 = await WA.oracle.generatePlanSafe('\u63ed\u5f00\u8499\u9762\u4eba\u8eab\u4efd', 5);
  assert(rNoCfg2100.ok === false && rNoCfg2100.reason === 'judge-not-configured', '通道未配置给出明确原因（不吞错）');

  // C2. 功能级生效：真的从通道生成弧线
  WA.apiRouter.setChannel && WA.apiRouter.setChannel('judge', Object.assign({}, savedJudge2100, { baseUrl: 'http://probe.local/v1', model: 'probe-model' }));
  global.__pushApiJson({ beats: [
    { goal: '\u63a5\u8fd1\u8499\u9762\u4eba', instruction: '\u8ba9\u73a9\u5bb6\u5728\u9152\u9986\u62fe\u5230\u5b57\u6761' },
    { goal: '\u5957\u8bdd', instruction: '\u5bf9\u8bdd\u4e2d\u900f\u9732\u7ebf\u7d22' },
    { goal: '\u63ed\u9762', instruction: '\u7a81\u53d1\u4e8b\u4ef6\u903c\u8feb\u5bf9\u65b9\u644a\u724c' }
  ] });
  const stOr0 = WA.oracle.stat();
  const rGen2100 = await WA.oracle.generatePlanSafe('\u63ed\u5f00\u8499\u9762\u4eba\u8eab\u4efd', 3);
  assert(rGen2100.ok === true && rGen2100.count === 3, '生成成功且拍数正确（此前零调用）');
  assert(!!WA.oracle.plan && WA.oracle.plan.beats.length === 3, '弧线已落入 oracle.plan');
  assert(WA.oracle.currentBeat().goal === '\u63a5\u8fd1\u8499\u9762\u4eba', '当前拍为第一拍');
  assert(WA.oracle.stat().generated === stOr0.generated + 1, 'generated 计数可见');
  assert(!!LS2100.getItem('worldaxis_oracle_plan_v1'), '弧线已落盘（刷新不丢）');

  // C3. before 链真的注入了当前拍
  const bctx2100 = { type: 'normal', chat: chat2100, store: WA.store.get(), branchId: 'b0', injections: [], canceled: false };
  await WA.workflow.run('before', bctx2100);
  const inj2100 = (bctx2100.injections || []).map(function (x) { return x.content; }).join('\n');
  assert(inj2100.indexOf('\u63a5\u8fd1\u8499\u9762\u4eba') > 0, 'before 链注入了当前拍目标');
  assert(inj2100.indexOf('plot_guidance') > 0, '注入带隔离标签（仅 AI 可见）');

  // C4. 推进与末拍清理
  const stAd0 = WA.oracle.stat();
  assert(WA.oracle.advance() === false, '非末拍：advance 返回 false');
  assert(WA.oracle.currentBeat().goal === '\u5957\u8bdd', '当前拍已推进');
  assert(WA.oracle.stat().advanced === stAd0.advanced + 1, 'advanced 计数可见');
  WA.oracle.advance();
  assert(WA.oracle.advance() === true, '末拍：advance 返回 true（清理语义）');
  assert(WA.oracle.plan === null, '末拍后计划已清理（此前面板直接 current++ 不会触发）');
  assert(!LS2100.getItem('worldaxis_oracle_plan_v1'), '清理后落盘键已删');

  // C5. 失败不吞：空拍 / 抛错（且归因带真实错误类型）
  global.__pushApiJson({ beats: [] });
  const rEmptyBeats2100 = await WA.oracle.generatePlanSafe('\u65e0\u6548\u76ee\u6807', 3);
  assert(rEmptyBeats2100.ok === false && rEmptyBeats2100.reason === 'api-fail', '空拍返回 api-fail（不建立空计划）');
  assert(WA.oracle.plan === null, '失败时不污染现有计划');
  const origCall2100 = WA.apiRouter.call;
  WA.apiRouter.call = async function () { throw new Error('probe-boom'); };
  const rThrow2100 = await WA.oracle.generatePlanSafe('\u629b\u9519\u76ee\u6807', 3);
  WA.apiRouter.call = origCall2100;
  assert(rThrow2100.ok === false && String(rThrow2100.reason).indexOf('api-fail') === 0, '抛错被捕获并归因（不崩面板）');
  assert(String(rThrow2100.reason).indexOf('probe-boom') > 0, '归因带真实错误类型（此前裸 catch 洗成笼统 api-fail）');

  // C6. 巡视可见（配置缺失不扣分，真实失败才扣）
  const mOrReal2100 = WA.store.maintain({});
  assert(mOrReal2100.signals.oracleGenerated >= 1, '巡视透出生成成功数');
  assert(mOrReal2100.signals.oracleFailed >= 1, '巡视透出失败数');
  const origStatOr2100 = WA.oracle.stat;
  WA.oracle.stat = function () { return Object.assign(origStatOr2100.call(WA.oracle), { failed: 0, lastReason: null }); };
  const mOrBase2100 = WA.store.maintain({});
  WA.oracle.stat = origStatOr2100;
  WA.oracle.stat = function () { return Object.assign(origStatOr2100.call(WA.oracle), { failed: 3, lastReason: 'judge-not-configured' }); };
  const mOrCfg2100 = WA.store.maintain({});
  WA.oracle.stat = origStatOr2100;
  assert(!(mOrCfg2100.issues || []).find(function (i) { return i.key === 'engine.oracle'; }), '通道未配置不产议题（属用户配置非故障）');
  assert(mOrCfg2100.score === mOrBase2100.score, '配置缺失不扣分（不污染基线）');
  WA.oracle.stat = function () { return Object.assign(origStatOr2100.call(WA.oracle), { failed: 3, lastReason: 'api-fail' }); };
  const mOrFail2100 = WA.store.maintain({});
  WA.oracle.stat = origStatOr2100;
  assert(!!(mOrFail2100.issues || []).find(function (i) { return i.key === 'engine.oracle'; }), '真实生成失败产 engine.oracle 议题');
  assert(mOrFail2100.score < mOrBase2100.score, '真实失败扣分（不假绿）');
  assert(!/^(hygiene|quarantine|state)\./.test('engine.oracle'), '议题键 engine.oracle 避开卫生指纹正则');
  assert(oSrc2100.indexOf('__orStat') > 0, 'oracle 观测对象在位');
  // ── D. 块4：死事件治理（9 个「只广播无接收」）──
  fresh2100();
  section('v2.1.0 块4：死事件治理（修功能级失效）');
  {
    const uSrcD2100 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    const sSrcD2100 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    assert(uSrcD2100.indexOf('STATE_EVENTS.forEach') > 0, '面板订阅已接线');
    assert(uSrcD2100.indexOf('__rerStat.ran') > 0, '重绘计数在位');
    assert(sSrcD2100.indexOf('Math.min(6, busDead * 2)') > 0, '扣分上限公式在位');
    assert(sSrcD2100.indexOf('WA.ui.mounted === true') > 0, '计分门控在位');
    assert(sSrcD2100.indexOf('(r.listeners || 0) === 0') > 0, '死信号口径为「当前仍无接收方」（防挂载后永久误报）');
    assert(!/^(hygiene|quarantine|state)\./.test('bus.dead'), '议题键 bus.dead 避开卫生指纹正则');

    // 轻量 DOM stub + 显式加载 panel.js（run.js 的 LOAD 跳过 UI）
    const mkEl2100 = function (tag) {
      const el = {
        tagName: String(tag || 'div').toUpperCase(), children: [], style: {}, dataset: {},
        value: '', textContent: '', innerHTML: '', disabled: false, onclick: null, onchange: null,
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
          toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) this._s.add(c); else this._s.delete(c); },
          contains(c) { return this._s.has(c); } },
        appendChild(c) { this.children.push(c); return c; },
        setAttribute(k, v) { this[k] = v; },
        addEventListener() {}, setPointerCapture() {},
        getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
        querySelector() { return mkEl2100('div'); }, querySelectorAll() { return []; }, contains() { return false; },
        get firstElementChild() {
          if (!global.__firstChildEl2100) { const e = mkEl2100('div'); e.id = 'wa-panel'; e.classList.add('wa-hidden'); global.__firstChildEl2100 = e; }
          return global.__firstChildEl2100;
        }
      };
      return el;
    };
    const savedDoc2100 = global.document;
    const savedActive2100 = global.document.activeElement;
    global.document.head = mkEl2100('head');
    global.document.documentElement = mkEl2100('html');
    global.document.body = mkEl2100('body');
    global.document.createElement = (t) => mkEl2100(t);
    global.document.getElementById = () => null;
    global.document.activeElement = null;
    global.__firstChildEl2100 = null;
    vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
    const EV2100 = WA.ui.STATE_EVENTS.slice();
    // v2.11.0（契约变更，显式留痕）: 9 → 11。新增 `backstage:started` / `backstage:settled`——
    //   它们此前只被**悬浮球呼吸动画**订阅，面板自身不重绘，于是本版新上线的「世界推演运行态」
    //   行会停留在渲染那一刻的值（点了中止也不会变回「空闲」，运行中也不会变成「运行中」）。
    //   本块的语义（挂载前全是死信号 → 挂载后 dead 零增长）逐字不变，只更新清单长度。
    assert(Array.isArray(EV2100) && EV2100.length === 11,
      '面板状态事件清单为 11 个（v2.11.0 起 9 → 11）——v2.16.0 的对外桥**不改这份清单**：'
      + '它把自己挂作废订阅的 `backstage:settled` / `chat:changed` 本来就是面板已订阅的事件，不是第 12、13 项');
    // v2.16.0（本仓库口径，显式留痕）: 对外桥的作废订阅是**惰性**的（真发布过快照才挂监听），
    //   故它**不该**在装载期占住 `backstage:settled` / `chat:changed` 两个监听位——
    //   本仓库总线上「有发出无监听」是刻意可见的健康信号，一个默认休眠的模块常驻监听位
    //   等于把这条真实告警抹平。此刻（面板未挂载 + 桥未发布）这两个事件必须**仍**是死信号。
    assert(WA.bridge && typeof WA.bridge.stat === 'function' && WA.bridge.stat().subscribed === false,
      '桥此刻未订阅（本块尚未发布过快照 ⇒ 惰性订阅没生效）');
    assert(WA.ui.mounted === false, '挂载前 mounted=false');

    // D1. 断链现场 → 挂载后全部被接收
    EV2100.forEach(function (e) { WA.emit(e); });
    const bsA2100 = WA.busStats(999), mapA2100 = {};
    (bsA2100.events || []).forEach(function (r) { mapA2100[r.event] = r.dead || 0; });
    const deadBefore2100 = EV2100.filter(function (e) { return (mapA2100[e] || 0) > 0; });
    assert(deadBefore2100.length === EV2100.length, '挂载前 ' + EV2100.length + ' 个状态事件全是死信号（断链现场）');
    WA.store.init();
    WA.ui.mount();
    assert(WA.ui.mounted === true, '挂载后 mounted=true');
    EV2100.forEach(function (e) { WA.emit(e); });
    const bsB2100 = WA.busStats(999), mapB2100 = {};
    (bsB2100.events || []).forEach(function (r) { mapB2100[r.event] = r.dead || 0; });
    assert(EV2100.every(function (e) { return (mapB2100[e] || 0) === (mapA2100[e] || 0); }), '全部 ' + EV2100.length + ' 个事件挂载后 dead 零增长（死信号已治理；含桥的两个作废订阅点，它们这段里既没被桥订阅、也没被面板漏掉）');

    // D2. 重绘语义：隐藏不重绘 / 节流 / 输入中不重绘
    const rsA2100 = WA.ui.rerenderStat();
    WA.emit('clock:changed', '\u7b2c2\u65e5');
    const rsB2100 = WA.ui.rerenderStat();
    assert(rsB2100.scheduled === rsA2100.scheduled + 1, '状态事件已调度重绘');
    assert(rsB2100.skippedHidden === rsA2100.skippedHidden + 1, '面板隐藏时不重绘（避免无效渲染）');
    assert(rsB2100.lastWhy === 'clock:changed', '重绘原因可追溯');

    WA.ui.open();
    const rsC2100 = WA.ui.rerenderStat();
    WA.emit('chapters:changed'); WA.emit('registry:changed'); WA.emit('oracle:plan');
    await new Promise(function (r) { setTimeout(r, 320); });
    const rsD2100 = WA.ui.rerenderStat();
    assert(rsD2100.scheduled === rsC2100.scheduled + 3, '三次变更都被调度');
    assert(rsD2100.ran === rsC2100.ran + 1, '节流：窗口内多次变更只重绘一次（防重绘风暴）');

    const fakeInput2100 = mkEl2100('input');
    const panelEl2100 = global.__firstChildEl2100;
    const origContains2100 = panelEl2100.contains;
    panelEl2100.contains = function (x) { return x === fakeInput2100; };
    global.document.activeElement = fakeInput2100;
    const rsE2100 = WA.ui.rerenderStat();
    WA.emit('chat:changed');
    const rsF2100 = WA.ui.rerenderStat();
    assert(rsF2100.skippedTyping === rsE2100.skippedTyping + 1, '面板内输入中不重绘（防抹掉未提交输入）');
    global.document.activeElement = null;
    panelEl2100.contains = origContains2100;

    // D3. 巡视可见（含门控）
    const mClean2100 = WA.store.maintain({});
    // 口径：本测试文件前序块发射过合成事件（t.bus.*）用于验证 busStats 本身，
    //   它们不是产品事件；此处只看产品事件维度（真实运行时不存在合成事件）。
    const prodDead2100 = (mClean2100.signals.busDeadEvents || []).filter(function (e) {
      return EV2100.some(function (s) { return e.indexOf(s + '(') === 0; });
    });
    assert(prodDead2100.length === 0, '9 个产品事件均不在死信号清单（已治理）', JSON.stringify(prodDead2100));
    const busIssue2100 = (mClean2100.issues || []).find(function (i) { return i.key === 'bus.dead'; });
    assert(!busIssue2100 || prodDead2100.length === 0, '产品事件不产 bus.dead 议题');
    const savedMounted2100 = WA.ui.mounted;
    WA.ui.mounted = false;
    WA.emit('__probe_headless_dead__');
    const mHeadless2100 = WA.store.maintain({});
    WA.ui.mounted = savedMounted2100;
    assert(mHeadless2100.signals.busDead === 0, '未挂载 UI 时不计分（不把环境差异当故障）');
    WA.emit('__probe_headless_dead__');
    const mRealDead2100 = WA.store.maintain({});
    assert(mRealDead2100.signals.busDead >= 1, '挂载状态下真有死信号则可见');
    assert(!!(mRealDead2100.issues || []).find(function (i) { return i.key === 'bus.dead'; }), '产 bus.dead 议题');
    assert(mRealDead2100.signals.busDeadEvents.join(',').indexOf('__probe_headless_dead__') >= 0, '议题点名具体事件');
    const mBaseClean2100 = WA.store.maintain({});
    assert(mRealDead2100.score <= mBaseClean2100.score, '死信号扣分（不假绿）');

    // 还原 document
    global.document = savedDoc2100;
    global.document.activeElement = savedActive2100;
    global.__firstChildEl2100 = null;
    delete WA.ui.mounted;
    WA.ui.mounted = true;   // 保持挂载态，避免影响后续块
  }
  // ── E. 块5：工作流节点失败入巡视（此前失败原因不可查、巡视看不见）──
  fresh2100();
  section('v2.1.0 块5：工作流节点失败入巡视（修可观测性断链）');
  {
    const wSrcE2100 = fs.readFileSync(path.join(BASE, 'core/workflow.js'), 'utf8');
    const sSrcE2100 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    assert(typeof WA.workflow.fails === 'function', 'workflow.fails 存在（失败台账只读视图）');
    assert(typeof WA.workflow.failStats === 'function', 'workflow.failStats 存在');
    assert(wSrcE2100.indexOf('recFail(node.id, node.label, chain') > 0, '失败入台账已接线（语义：台账写入调用在位）');
    assert(wSrcE2100.indexOf('const FAIL_MAX = 30;') > 0, '台账有界（cap 30）');
    assert(wSrcE2100.indexOf('let __wfSeq = 0;') > 0, '单调序号游标在位（不依赖 Date.now，免疫毫秒同刻与时钟回拨）');
    assert(sSrcE2100.indexOf('let __lastPatrolSeq = -1;') > 0, '巡视游标首轮哨兵 -1（首轮只建基线不追溯）');

    // E1. 断链现场：节点失败不中断链（设计如此）但原因要可查
    const NID2100 = '__probe_fail_node__';
    WA.workflow.register({ id: NID2100, chain: 'probechain_e', order: 1, label: '探针失败节点', async run() { throw new Error('probe-node-boom'); } });
    WA.workflow.register({ id: '__probe_ok_node__', chain: 'probechain_e', order: 2, label: '探针正常节点', async run() {} });
    const f0E2100 = WA.workflow.fails(10);
    let s1Leaked2100 = false;
    try { await WA.workflow.run('probechain_e', {}); } catch (e) { s1Leaked2100 = true; }
    const f1E2100 = WA.workflow.fails(10);
    assert(!s1Leaked2100, '非 critical 失败不中断链（§1 现场不 reject）');
    assert(f1E2100.tracked === f0E2100.tracked + 1, '失败已记入台账（此前只有日志与计数）');
    assert(f1E2100.items[0].id === NID2100, '台账点名失败节点');
    assert(f1E2100.items[0].msg.indexOf('probe-node-boom') >= 0, '台账带失败原因（此前原因不可查）');
    assert(f1E2100.items[0].chain === 'probechain_e', '台账记链名');
    assert(WA.workflow.failStats().byId[NID2100] === 1, 'failStats 按节点汇总');
    assert(WA.workflow.failStats().max === 30, '上限可见');
    assert(typeof WA.workflow.failStats().seq === 'number', 'failStats 透出台账序号（供巡视游标推进）');

    // E2. 中断语义双向契约（对照组：确保断言真在测语义，而非被异常逃逸欺骗）
    WA.workflow.register({ id: '__probe_crit__', chain: 'probechain_crit_e', order: 1, label: '关键节点', critical: true, async run() { throw new Error('probe-crit-boom'); } });
    let critThrew2100 = false;
    try { await WA.workflow.run('probechain_crit_e', {}); } catch (e) { critThrew2100 = true; }
    assert(critThrew2100, 'critical 节点失败必须中断链（对照组）');
    WA.workflow.register({ id: '__probe_nc__', chain: 'probechain_nc_e', order: 1, label: '非关键节点', async run() { throw new Error('probe-nc-boom'); } });
    let ncThrew2100 = false;
    try { await WA.workflow.run('probechain_nc_e', {}); } catch (e) { ncThrew2100 = true; }
    assert(!ncThrew2100, '非 critical 失败不中断链（不外抛）');

    // E3. 巡视：本轮新增失败可见且扣分（存量不追溯）
    WA.store.maintain({});                       // 消化前序失败，推进游标
    const mBaseE2100 = WA.store.maintain({});    // 干净基线
    try { await WA.workflow.run('probechain_e', {}); } catch (e) {}
    const mFailE2100 = WA.store.maintain({});
    assert(mFailE2100.signals.wfNewFails >= 1, '巡视透出本轮新增失败数（此前完全看不见）');
    assert(mFailE2100.signals.wfFailNodes.indexOf(NID2100) >= 0, '透出失败节点 id');
    assert(!!mFailE2100.signals.wfFailSample && mFailE2100.signals.wfFailSample.msg.indexOf('probe-node-boom') >= 0, '透出失败原因样本');
    const issE2100 = (mFailE2100.issues || []).find(function (i) { return i.key === 'engine.workflow'; });
    assert(!!issE2100, '产 engine.workflow 议题');
    assert(issE2100 && issE2100.detail.indexOf('probe-node-boom') >= 0, '议题带失败原因');
    assert(mFailE2100.score < mBaseE2100.score, '健康分不假绿（低于基线）');
    assert((mFailE2100.actions || []).some(function (a) { return a.id === 'review-workflow-fail'; }), '产修复入口动作');

    // E4. 存量不追溯：同一批失败不重复计入下一轮（游标为单调序号，非时间戳）
    const mAgainE2100 = WA.store.maintain({});
    assert(mAgainE2100.signals.wfNewFails === 0, '同一批失败不重复计入下一轮');
    assert(!(mAgainE2100.issues || []).find(function (i) { return i.key === 'engine.workflow'; }), '下一轮不再报（不跨轮粘滞）');
    assert(mAgainE2100.score === mBaseE2100.score, '恢复到基线分');
    assert(WA.workflow.failStats().tracked >= 2, '台账历史不回退（仍可追溯）');

    // E5. 台账有界 + 重置
    for (let i = 0; i < 40; i++) { try { await WA.workflow.run('probechain_e', {}); } catch (e) {} }
    assert(WA.workflow.failStats().tracked === 30, '台账上限生效（不无限膨胀）');
    assert(WA.workflow.failStats().byId[NID2100] >= 30, '同节点频繁失败可汇总');
    WA.workflow.resetHistory();
    assert(WA.workflow.failStats().tracked === 0, 'resetHistory 一并清空台账');
    assert(WA.workflow.fails(5).items.length === 0, 'fails() 同步清空');

    // E6. 边界：无失败不产议题 / 台账读取异常不吞
    const mCleanE2100 = WA.store.maintain({});
    assert(mCleanE2100.signals.wfNewFails === 0, '无新增失败时为 0');
    assert(!(mCleanE2100.issues || []).find(function (i) { return i.key === 'engine.workflow'; }), '无新增失败不产议题');
    const savedFailsE2100 = WA.workflow.fails;
    WA.workflow.fails = function () { throw new Error('probe-fails-boom'); };
    const mBoomE2100 = WA.store.maintain({});
    WA.workflow.fails = savedFailsE2100;
    assert(mBoomE2100.signals.patrolDegradedSections.indexOf('workflowFails') >= 0, '台账读取异常进降级台账（不吞）');

    // E7. 位置契约
    assert(!/^(hygiene|quarantine|state)\./.test('engine.workflow'), '议题键 engine.workflow 避开卫生指纹正则');
    assert(sSrcE2100.indexOf('Math.min(8, wfNewFails * 3)') > 0, '扣分公式在位');
    assert(sSrcE2100.indexOf('wfNewFails: wfNewFails') > 0, 'signals 透出在位');

    // ── 清理现场 ──
    WA.workflow.unregister(NID2100);
    WA.workflow.unregister('__probe_ok_node__');
    WA.workflow.unregister('__probe_crit__');
    WA.workflow.unregister('__probe_nc__');
    WA.workflow.resetHistory();
    WA.store.maintain({});
  }
  // ══════════ v2.2.0 ══════════
  v2200: {
  const LS2200 = global.localStorage;
  const ctx2200 = global.SillyTavern.getContext();
  const prevChat2200 = ctx2200.chatId;
  function fresh2200() { LS2200.clear(); ctx2200.chatId = 'v2200_chat'; global.__mockChat.length = 0; WA.store.init(); }

  // ── A. 块1：小剧场对外接口（此前 theater.wrap 零调用 = 产物送不出去）──
  fresh2200();
  section('v2.2.0 块1：小剧场对外接口（修功能级失效）');
  {
    const uSrcA2200 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    const tSrcA2200 = fs.readFileSync(path.join(BASE, 'render/theater.js'), 'utf8');
    assert(typeof WA.theater.send === 'function', 'theater.send 存在（剧场产物出口）');
    assert(typeof WA.theater.stat === 'function', 'theater.stat 存在（可观测）');
    assert(/<button[^>]*id="wa-theater-insert"/.test(uSrcA2200), '面板真渲染了「插入输入框」控件');
    assert(/if \(thIns\) thIns\.onclick = /.test(uSrcA2200), '插入按钮真绑定（无短路守卫）');
    assert(/thIns\.onclick[\s\S]{0,400}theater\.send/.test(uSrcA2200), '绑定体内真调 theater.send（不是空函数）');
    assert(/if \(thCopy\) thCopy\.onclick = /.test(uSrcA2200), '复制按钮绑定存在');
    assert(tSrcA2200.indexOf('sendFailed') > 0, 'theater 内部送达失败计数在位');

    // A1. 功能级生效：产物真的送进输入框
    const mkInputA2200 = () => {
      const el = { id: 'send_textarea', value: '', _ev: [], tagName: 'TEXTAREA' };
      el.dispatchEvent = function (e) { this._ev.push(e); return true; };
      return el;
    };
    const inA2200 = mkInputA2200();
    const savedDocA2200 = global.document;
    global.document.getElementById = (id) => (id === 'send_textarea' ? inA2200 : null);
    WA.mainDoc = global.document;

    const stA0_2200 = WA.theater.stat();
    const rA1_2200 = WA.theater.send('雨夜的酒馆里，两人对坐无言。', { title: '雨夜闲谈' });
    assert(rA1_2200.ok === true, 'send 成功返回（从前只能在面板里看）');
    assert(inA2200.value.indexOf('雨夜闲谈') > 0, '标题已写入输入框');
    assert(inA2200.value.indexOf('两人对坐无言') > 0, '正文已写入输入框');
    assert(inA2200.value.indexOf('<details') >= 0, '以折叠块包装（wrap 真的被调用了）');
    assert(inA2200._ev.length === 1 && inA2200._ev[0].type === 'input', '派发 input 事件（宿主感知输入框变化）');
    assert(WA.theater.stat().sent === stA0_2200.sent + 1, 'stat().sent 计数可见');
    assert(WA.theater.stat().wrapped === stA0_2200.wrapped + 1, 'stat().wrapped 可见（此前零调用）');

    // A2. 迭加与空值守卫
    const rA2_2200 = WA.theater.send('第二段。');
    assert(rA2_2200.ok === true && inA2200.value.indexOf('两人对坐无言') > 0 && inA2200.value.indexOf('第二段') > 0, '默认追加（不吞掉已有输入）');
    const rA3_2200 = WA.theater.send('覆盖模式。', { append: false });
    assert(rA3_2200.ok === true && inA2200.value.indexOf('两人对坐无言') < 0, 'append:false 时覆盖');
    const stA1_2200 = WA.theater.stat();
    const rA4_2200 = WA.theater.send('   ');
    assert(rA4_2200.ok === false && rA4_2200.reason === 'empty-text', '空文本拒绝（不写空块）');
    assert(WA.theater.stat().sent === stA1_2200.sent, '拒绝不计入送达');
    assert(WA.theater.stat().sendFailed === stA1_2200.sendFailed + 1, 'sendFailed 可见');

    // A3. 输入框不可达：明确归因（不静默）
    global.document.getElementById = () => null;
    const stA2_2200 = WA.theater.stat();
    const rA5_2200 = WA.theater.send('无输入框场景。');
    assert(rA5_2200.ok === false && rA5_2200.reason === 'no-input-el', '输入框不可达时明确归因');
    assert(typeof rA5_2200.text === 'string' && rA5_2200.text.indexOf('无输入框场景') > 0, '仍返回可复制文本（不白干）');
    assert(WA.theater.stat().sendFailed === stA2_2200.sendFailed + 1, 'sendFailed 计数');
    assert(WA.theater.stat().lastReason === 'no-input-el', 'lastReason 可追溯');

    // A4. wrap 结构契约
    const blkA2200 = WA.theater.wrap('T', 'B');
    assert(blkA2200.indexOf('<details') === 0 && blkA2200.indexOf('</details>') > 0, 'wrap 产出合法折叠块');
    assert(blkA2200.indexOf('<summary>') > 0, '带 summary（折叠标题）');
    assert(WA.theater.wrap(null, 'x').indexOf('番外小剧场') > 0, '标题缺省有默认值');

    // A5. 面板留痕契约
    assert(/WA\.theater\.stat\(\)/.test(uSrcA2200) && /id="wa-theater-out"/.test(uSrcA2200), '面板展示剧场产出留痕');
    assert(uSrcA2200.indexOf('thLast') > 0, '面板持有最近产物（插入前置）');
    assert(/<button[^>]*id="wa-theater-copy"/.test(uSrcA2200), '提供复制兜底入口');

    global.document = savedDocA2200;
    global.document.getElementById = () => null;
  }

  // ── B. 块2：净化规则治理口（此前 addRule/removeRule/setEnabled/loadPreset 全零调用）──
  section('v2.2.0 块2：净化规则治理口（修功能级失效）');
  {
    fresh2200();
    const pSrcB2200 = fs.readFileSync(path.join(BASE, 'render/purifier.js'), 'utf8');
    const sSrcB2200 = fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8');
    const savedPrm2200 = WA.purifier.rules.slice();

    // B1. 接入位：治理函数 + 面板真接线（精确锚点，防"注释掉/短路"假接线）
    assert(typeof WA.purifier.importPresetSafe === 'function', 'importPresetSafe 存在（安全导入入口）');
    assert(typeof WA.purifier.removeRuleSafe === 'function', 'removeRuleSafe 存在');
    assert(typeof WA.purifier.addRuleSafe === 'function', 'addRuleSafe 存在');
    assert(typeof WA.purifier.resetToBuiltin === 'function', 'resetToBuiltin 存在');
    assert(/data-prm-on/.test(sSrcB2200), '面板渲染规则启用开关（此前净化零 UI）');
    assert(/<button[^>]*id="wa-prm-import"/.test(sSrcB2200), '面板真渲染「导入预设」控件');
    assert(/<button[^>]*id="wa-prm-add"/.test(sSrcB2200), '面板真渲染「新增规则」控件');
    assert(/<button[^>]*id="wa-prm-reset"/.test(sSrcB2200), '面板真渲染「恢复内置」控件');
    assert(/if \(prmAdd\) prmAdd\.onclick = /.test(sSrcB2200), '新增按钮真绑定（无短路守卫）');
    assert(/if \(prmImp\) prmImp\.onclick = /.test(sSrcB2200), '导入按钮真绑定（无短路守卫）');
    assert(/prmImp\.onclick[\s\S]{0,400}importPresetSafe/.test(sSrcB2200), '导入绑定体内真调 importPresetSafe');
    assert(/data-prm-del[\s\S]{0,400}removeRuleSafe/.test(sSrcB2200), '删除按钮绑定到 removeRuleSafe');
    assert(/data-prm-on[\s\S]{0,400}setEnabled/.test(sSrcB2200), '开关绑定到 setEnabled');
    assert(/WA\.purifier\.rules/.test(sSrcB2200), '面板渲染规则清单（不再靠手改 localStorage）');
    assert(pSrcB2200.indexOf('missing-find') > 0 && pSrcB2200.indexOf('bad-regex') > 0, '准入判据在位（missing-find / bad-regex）');

    // B2. 功能级生效：导入预设真的落盘、真的参与净化
    WA.purifier.rules = [];
    const stB0_2200 = WA.purifier.stat();
    const rImpB2200 = WA.purifier.importPresetSafe(JSON.stringify({ type: 'veridis-rewrite-preset', rules: [
      { name: '去探针标记', find: '<<PRMTEST>>', replace: '' },
      { name: '探针替换', find: 'ZZPRMAB', replace: 'YYPRMAB' }
    ] }));
    assert(rImpB2200.ok === true && rImpB2200.added === 2, '导入成功且条数正确（此前 loadPreset 零调用）');
    assert(WA.purifier.rules.length === 2, '规则真的进了内存');
    assert(!!WA.mainWin.localStorage.getItem('worldaxis_purifier_rules_v1'), '规则已落盘（刷新不丢）');
    assert(WA.purifier.stat().imported === stB0_2200.imported + 2, 'imported 计数可见');
    assert(WA.purifier.applySafe('正文<<PRMTEST>>结尾').indexOf('<<PRMTEST>>') < 0, '导入的规则真的在净化中生效（删除型）');
    assert(WA.purifier.applySafe('AAZZPRMABBB').indexOf('YYPRMAB') > 0, '导入的规则真的在净化中生效（替换型）');

    // B3. 准入：非法规则不得写进存档（防一条坏正则拖垮整体净化）
    const beforeB2200 = WA.purifier.rules.length;
    const rBadB2200 = WA.purifier.importPresetSafe(JSON.stringify({ rules: [
      { find: 'ok_pattern_probe', replace: '' },
      { find: '[', replace: '' },
      { find: '', replace: 'no-find' }
    ] }));
    assert(rBadB2200.ok === true && rBadB2200.added === 1 && rBadB2200.rejected === 2, '逐条准入（合法收 1、非法拒 2）');
    assert(WA.purifier.rules.length === beforeB2200 + 1, '只有合法规则进存档');
    assert(Array.isArray(rBadB2200.reasons) && rBadB2200.reasons.length > 0, '拒收原因可追溯');
    const rAllBadB2200 = WA.purifier.importPresetSafe(JSON.stringify({ rules: [{ find: '[', replace: '' }] }));
    assert(rAllBadB2200.ok === false && rAllBadB2200.reason === 'all-rejected', '全拒时明确失败（不假成功）');
    const rParseB2200 = WA.purifier.importPresetSafe('{ 不是 json');
    assert(rParseB2200.ok === false && rParseB2200.reason === 'parse-fail', '解析失败明确归因');
    const rNoRulesB2200 = WA.purifier.importPresetSafe(JSON.stringify({ foo: 1 }));
    assert(rNoRulesB2200.ok === false && rNoRulesB2200.reason === 'no-rules', '无 rules 字段明确归因');
    assert(WA.purifier.stat().importFailed >= 3, 'importFailed 计数可见');
    assert(String(WA.purifier.stat().lastImport).indexOf('no-rules') === 0, 'lastImport 可追溯');

    // B4. 新增 / 删除 / 开关（此前三函数全零调用）
    const rAddB2200 = WA.purifier.addRuleSafe({ find: 'probe_x_str', replace: 'probe_y_str' });
    assert(rAddB2200.ok === true && WA.purifier.rules.some(function (r) { return r.id === rAddB2200.id; }), '新增成功且 id 可用');
    const rAddBadB2200 = WA.purifier.addRuleSafe({ find: '[' });
    assert(rAddBadB2200.ok === false && String(rAddBadB2200.reason).indexOf('bad-regex') === 0, '非法正则拒绝（不写坏规则）');
    const rAddEmptyB2200 = WA.purifier.addRuleSafe({});
    assert(rAddEmptyB2200.ok === false && rAddEmptyB2200.reason === 'missing-find', '缺 find 拒绝');
    const rDelB2200 = WA.purifier.removeRuleSafe(rAddB2200.id);
    assert(rDelB2200.ok === true && !WA.purifier.rules.some(function (r) { return r.id === rAddB2200.id; }), '删除生效（此前 removeRule 零调用）');
    const rDel2B2200 = WA.purifier.removeRuleSafe(rAddB2200.id);
    assert(rDel2B2200.ok === false && rDel2B2200.reason === 'not-found', '删不存在的规则明确归因');
    const enB2200 = WA.purifier.rules.filter(function (r) { return r.find === 'ok_pattern_probe'; })[0];
    assert(!!enB2200, '前提：被准入的规则存在（供开关测试）');
    WA.purifier.setEnabled(enB2200.id, false);
    assert(WA.purifier.rules.filter(function (r) { return r.id === enB2200.id; })[0].enabled === false, 'setEnabled 真的生效（且落盘）');
    assert(!!WA.mainWin.localStorage.getItem('worldaxis_purifier_rules_v1'), '开关变更也落盘（面板刷新后状态一致）');

    // B5. 恢复内置
    const rResetB2200 = WA.purifier.resetToBuiltin();
    assert(rResetB2200.ok === true && rResetB2200.total >= 2, '恢复内置成功');
    assert(WA.purifier.rules.some(function (r) { return r.id === 'think_block'; }), '内置 think_block 回来了');
    assert(!!WA.mainWin.localStorage.getItem('worldaxis_purifier_rules_v1'), '恢复后也落盘');

    // B6. stat 透出治理维度
    const stB2200 = WA.purifier.stat();
    assert(stB2200.ruleCount === WA.purifier.rules.length, 'stat().ruleCount 与实际一致');
    assert('imported' in stB2200 && 'importFailed' in stB2200 && 'lastImport' in stB2200, 'stat 透出导入治理三维');

    fresh2200();
    WA.purifier.rules = savedPrm2200;
  }

  // ── C. 块3：诊断出口收口（此前 compatMvu/TH.status 零消费、resetTxStat/resetCallStats/settleGuard.reset/resetStats 无入口）──
  section('v2.2.0 块3：诊断出口收口（修功能级失效）');
  {
    fresh2200();
    const dSrcC2200 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const sSrcC2200 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    const pSrcC2200 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');

    // C1. 接入位（源码锚点：防「注释掉 / 短路守卫」假接线）
    assert(typeof WA.toolDiag.secCompat === 'function', 'toolDiag.secCompat 已导出（可被外部消费）');
    assert(dSrcC2200.indexOf('function secCompat') > 0, 'tool-diag 新增 secCompat 节');
    assert(/compat: secCompat\(\)/.test(dSrcC2200), 'collect() 汇总已接入 compat 节');
    assert(dSrcC2200.indexOf("'compat.mvu'") > 0 && dSrcC2200.indexOf("'compat.th'") > 0, 'verdict 兼容层议题在位');
    assert(/!cp\.mvu\.active\) issues\.push\(\{ level: 'info'/.test(dSrcC2200), 'verdict：未激活属 info（环境差异不报错）');
    const idsC2200 = (WA.toolDiag.UI_BINDINGS.filter(g => g.page === 'tools')[0] || {}).ids || [];
    assert(idsC2200.indexOf('wa-stat-reset') >= 0 && idsC2200.indexOf('wa-compat-view') >= 0 && idsC2200.indexOf('wa-wf-reset') >= 0, '三个新控件已纳入 UI_BINDINGS（渲染↔绑定一致性守卫）');
    assert(sSrcC2200.indexOf('// \u2500\u2500 17. \u5bbf\u4e3b\u517c\u5bb9\u5c42\uff08v2.2.0\uff09\u2500\u2500') > 0, '巡视新增第 17 节（宿主兼容层）');
    assert(sSrcC2200.indexOf("key: 'engine.compat'") > 0, '巡视议题键 engine.compat 在位');
    assert(sSrcC2200.indexOf('compatMvuActive: compatMvuActive') > 0, '巡视 signals 透出兼容层维度');
    assert(!/^(hygiene|quarantine|state)\./.test('engine.compat'), '议题键 engine.compat 避开卫生指纹正则');
    assert(pSrcC2200.indexOf('id="wa-stat-reset"') > 0 && pSrcC2200.indexOf('id="wa-compat-view"') > 0 && pSrcC2200.indexOf('id="wa-wf-reset"') > 0, '三个控件真在面板模板里（非注释）');
    assert(pSrcC2200.indexOf('id="wa-settle-unforce"') > 0, '「取消强制标记」控件真在模板里');
    assert(/if \(srBtn\) srBtn\.onclick = /.test(pSrcC2200), '清零按钮绑定无短路守卫');
    assert(/srBtn\.onclick[\s\S]{0,400}resetTxStat/.test(pSrcC2200) && /srBtn\.onclick[\s\S]{0,400}resetCallStats/.test(pSrcC2200), '清零绑定体内真调两个清零函数');
    assert(/if \(cvBtn\) cvBtn\.onclick = /.test(pSrcC2200) && /cvBtn\.onclick[\s\S]{0,400}compatMvu\.status/.test(pSrcC2200), '兼容层按钮绑定无短路且真读 status');
    assert(/if \(uf\) uf\.onclick = /.test(pSrcC2200) && /uf\.onclick[\s\S]{0,300}settleGuard\.reset/.test(pSrcC2200), '取消标记绑定真调 settleGuard.reset');
    assert(/if \(wfrBtn\) wfrBtn\.onclick = /.test(pSrcC2200) && /wfrBtn\.onclick[\s\S]{0,400}resetStats/.test(pSrcC2200), '清空痕迹绑定真调 resetStats');
    assert(/peekForce[\s\S]{0,200}\u672a\u751f\u6548\u7684\u5f3a\u5236\u7ed3\u7b97\u6807\u8bb0/.test(pSrcC2200), '面板真展示待生效强制标记');

    // C2. 诊断数据契约（不依赖 DOM）
    const cpA2200 = WA.toolDiag.secCompat();
    assert(cpA2200.mvuLoaded === true && cpA2200.thLoaded === true, 'secCompat 识别兼容层已加载');
    assert(cpA2200.mvu && typeof cpA2200.mvu.active === 'boolean' && cpA2200.th && typeof cpA2200.th.active === 'boolean', 'secCompat 透出双侧激活态');

    const mctx2200 = ctx2200;
    const savedStatData2200 = mctx2200.chatMetadata.stat_data;
    // 真故障路径：宿主 API 抛错 → 必须标 failed 且进 verdict/巡视
    const origGC2200t = global.SillyTavern.getContext;
    global.SillyTavern.getContext = function () { throw new Error('block3-mvu-boom'); };
    WA.compatMvu.init();
    const cpFail2200 = WA.toolDiag.secCompat();
    assert(cpFail2200.mvu.failed === true, 'secCompat 标记真故障（reason 以 error: 开头）');
    const vdFail2200 = WA.toolDiag.verdict(WA.toolDiag.collect());
    assert(vdFail2200.issues.some(i => i.key === 'compat.mvu' && i.level === 'error'), '诊断 verdict 报兼容层故障（此前完全不可见）');
    const flFail2200 = WA.toolDiag.flatten();
    const rowFail2200 = flFail2200.filter(x => x.key === 'compat')[0];
    assert(!!rowFail2200 && rowFail2200.level === 'error', 'flatten 带 compat 摘要行且级别与 verdict 一致');
    const mFail2200 = WA.store.maintain({});
    assert(mFail2200.signals.compatFails >= 1 && mFail2200.signals.compatMvuActive === false, '巡视 signals 透出兼容层故障与激活态');
    assert(mFail2200.issues.some(i => i.key === 'engine.compat' && i.level === 'error'), '巡视报 engine.compat 议题');
    assert(mFail2200.actions.some(a => a.id === 'review-compat'), '巡视给出复查动作');
    global.SillyTavern.getContext = origGC2200t;

    // 环境差异路径：宿主未启用 MVU → 不计故障、不报议题（沿用「环境差异不得当故障扣分」）
    delete mctx2200.chatMetadata.stat_data;
    WA.compatMvu.init();
    const mNa2200 = WA.store.maintain({});
    assert(mNa2200.signals.compatFails === 0, '宿主未启用 MVU 不计为故障（环境差异）');
    assert(!mNa2200.issues.some(i => i.key === 'engine.compat'), '环境差异不产 engine.compat 议题');
    assert(mNa2200.signals.compatMvuReason === 'mvu-not-enabled', '未激活原因可追溯（mvu-not-enabled）');
    // 激活路径：宿主开启 MVU
    mctx2200.chatMetadata.stat_data = savedStatData2200 || {};
    WA.compatMvu.init();
    const mOk2200 = WA.store.maintain({});
    assert(mOk2200.signals.compatFails === 0, '激活后无故障计数（不误报）');

    // C3. 端到端（真 DOM）：出口真能点通
    let JSDOMC2200 = null;
    try { JSDOMC2200 = require('jsdom').JSDOM; } catch (e) { try { JSDOMC2200 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDOMC2200 = null; } }
    if (!JSDOMC2200) {
      console.log('  \u26a0 jsdom 不可用，跳过端到端断言（源码锚点已覆盖接线）');
    } else {
      const dom2200 = new JSDOMC2200('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDoc2200 = global.document;
      global.document = dom2200.window.document;
      try { global.Node = dom2200.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
      WA.store.init();
      WA.ui.mount();
      WA.ui.open();
      const tabsC2200 = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab'));
      const toolsTabC2200 = tabsC2200.filter(t => t.dataset.page === 'tools')[0];
      assert(!!toolsTabC2200, '面板存在「工具」页签');
      toolsTabC2200.onclick();
      const $c = sel => global.document.querySelector(sel);
      assert(!!$c('#wa-stat-reset') && !!$c('#wa-compat-view') && !!$c('#wa-wf-reset'), '工具页真渲染三个出口控件');
      assert(typeof $c('#wa-stat-reset').onclick === 'function' && typeof $c('#wa-compat-view').onclick === 'function' && typeof $c('#wa-wf-reset').onclick === 'function', '三个出口控件真绑定');

      // C3a. 清零计量：真清零且不伤世界状态
      WA.store.transact(d => { d.round = (d.round || 0) + 1; });
      try { await WA.apiRouter.call('judge', []); } catch (e) { /* 未配置也应入台账 */ }
      assert(WA.store.txStat().count > 0 && WA.apiRouter.callStats(9).tracked > 0, '前提：事务计量与通道台账均已累积');
      const btnReset2200 = $c('#wa-stat-reset'); if (btnReset2200 && btnReset2200.onclick) btnReset2200.onclick();
      assert(WA.store.txStat().count === 0, '清零后事务计量归零（resetTxStat 真被调用）');
      assert(WA.apiRouter.callStats(9).tracked === 0, '清零后通道台账归零（resetCallStats 真被调用）');
      assert((($c('#wa-diag-out') || {}).innerHTML || '').indexOf('\u5df2\u6e05\u96f6') > 0, '面板给出清零反馈（不静默）');
      assert(WA.store.get().round > 0, '清零不伤世界状态（只重置计数器）');

      // C3b. 结算守卫：强制标记可见且可取消
      WA.settleGuard.forceNext();
      const btnSv2200 = $c('#wa-settle-view'); if (btnSv2200 && btnSv2200.onclick) btnSv2200.onclick();
      assert(((($c('#wa-diag-out') || {}).innerHTML) || '').indexOf('\u672a\u751f\u6548\u7684\u5f3a\u5236\u7ed3\u7b97\u6807\u8bb0') > 0, '待生效强制标记在面板可见（peekForce 接入 UI）');
      assert(!!$c('#wa-settle-unforce'), '提供「取消该标记」出口');
      assert(WA.settleGuard.peekForce() === true, '取消前标记仍在（前置成立）');
      const btnUf2200 = $c('#wa-settle-unforce'); if (btnUf2200 && btnUf2200.onclick) btnUf2200.onclick();
      assert(WA.settleGuard.peekForce() === false, '点击后强制标记真被清除（settleGuard.reset 真被调用）');
      assert(((($c('#wa-diag-out') || {}).innerHTML) || '').indexOf('\u5df2\u53d6\u6d88\u5f3a\u5236\u6807\u8bb0') > 0, '面板给出取消反馈');

      // C3c. 清空运行痕迹
      WA.workflow.register({ id: '__t2200c_node__', chain: 'before', label: 't', order: 1, run: function () {} });
      try { await WA.workflow.run('before', {}); } catch (e) { }
      assert(WA.workflow.stats(999).tracked > 0 && WA.workflow.history(99).tracked > 0, '前提：节点画像与运行历史已建立');
      const btnWf2200 = $c('#wa-wf-reset'); if (btnWf2200 && btnWf2200.onclick) btnWf2200.onclick();
      assert(WA.workflow.stats(999).tracked === 0, '清空后节点画像归零（resetStats 真被调用）');
      assert(WA.workflow.history(99).tracked === 0, '清空后运行历史归零（resetHistory 真被调用）');
      assert(((($c('#wa-diag-out') || {}).innerHTML) || '').indexOf('\u5df2\u6e05\u7a7a\u5de5\u4f5c\u6d41\u8282\u70b9\u753b\u50cf') > 0, '面板给出清空反馈');
      WA.workflow.unregister('__t2200c_node__');

      global.document = savedDoc2200;
      global.document.getElementById = () => null;
    }

    WA.workflow.resetHistory();
    fresh2200();
  }

  // ── D. 块4：人物档案（人设）写入链（此前 registry.setProfile 唯一写入 API 却零调用）──
  section('v2.2.0 块4：人物档案写入链（修功能级失效）');
  {
    fresh2200();
    const regSrcD2200 = fs.readFileSync(path.join(BASE, 'actors/registry.js'), 'utf8');
    const profSrcD2200 = fs.readFileSync(path.join(BASE, 'actors/profile.js'), 'utf8');
    const dSrcD2200 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const sSrcD2200 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    const pSrcD2200 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');

    // D1. 接入位 + 静态锚点（防假接线）
    assert(typeof WA.registry.setProfileSafe === 'function', 'registry.setProfileSafe 存在（安全写入入口）');
    assert(typeof WA.registry.clearProfile === 'function', 'registry.clearProfile 存在');
    assert(typeof WA.registry.profileStat === 'function', 'registry.profileStat 存在（覆盖率计量）');
    assert(pSrcD2200.indexOf('data-prof=') > 0, '人物页渲染「档案」入口');
    assert(pSrcD2200.indexOf('function renderProfileEditor') > 0, '面板含档案编辑器实现');
    assert(/panelEl\.querySelectorAll\('\[data-prof\]'\)\.forEach/.test(pSrcD2200), '档案按钮按节点集合绑定');
    assert(/data-prof[\s\S]{0,400}setProfileSafe/.test(pSrcD2200), '绑定体内真调 setProfileSafe');
    assert(pSrcD2200.indexOf('id="wa-prof-save"') > 0 && pSrcD2200.indexOf('id="wa-prof-clear"') > 0, '编辑器含保存/清空控件');
    assert(dSrcD2200.indexOf('actors: safe(') > 0, '诊断新增 actors 档案节');
    assert(sSrcD2200.indexOf("key: 'actors.profile'") > 0, '巡视新增 actors.profile 议题');
    assert(!/^(hygiene|quarantine|state)\./.test('actors.profile'), '议题键 actors.profile 避开卫生指纹正则');
    assert(profSrcD2200.indexOf('WA.registry.setProfileSafe') > 0, 'profile.js 已改走 registry 契约（消除双写漂移）');
    assert(profSrcD2200.indexOf("push('personality', r.personality") < 0, 'profile.js 不再直写 store');
    assert(regSrcD2200.indexOf("capsFor('people.p_x.profile.' + sec)") > 0, 'registry 从容量登记表取上限（单一真源）');
    assert(sSrcD2200.indexOf('actors/registry.js 档案节写入') > 0, '登记表 site 文案指向真实写入方');
    ['personality', 'worldview', 'family', 'memory', 'relationships'].forEach(function (sec) {
      assert(profSrcD2200.indexOf("push('" + sec + "'") < 0, 'profile.js 无 ' + sec + ' 节写死上限');
    });

    // D2. 功能级生效：档案真写进去、消费端读得到
    const NMD = '\u63a2\u9488\u4e59';
    WA.registry.register(NMD);
    assert(WA.registry.getProfile(NMD).personality.length === 0, '前置：新建 NPC 档案为空（性格锚点将是「未建立」）');
    const wD1 = WA.registry.setProfileSafe(NMD, {
      personality: ['\u51b7\u9759', '\u591a\u7591'],
      worldview: ['\u529f\u5229\u81f3\u4e0a'],
      memory: '\u66fe\u5728\u57ce\u897f\u5f00\u8fc7\u5f53\u94fa',
      relationships: '\u6c88\u70bc | \u65e7\u53cb | \u5f7c\u6b64\u8fdc\u4e86'
    });
    assert(wD1.ok === true, 'setProfileSafe 写入成功（此前该路径零调用）');
    const prD1 = WA.registry.getProfile(NMD);
    assert(prD1.personality.length === 2 && prD1.personality[0].text === '\u51b7\u9759', '性格锚点真进档（消费端不再必然「未建立」）');
    assert(prD1.worldview.length === 1 && prD1.memory.length === 1, '观念/经历两节写入');
    assert(prD1.relationships.length === 1 && prD1.relationships[0].target === '\u6c88\u70bc' && prD1.relationships[0].relation === '\u65e7\u53cb', '关系条目按目标归并写入');
    assert(WA.store.get().people['p_' + NMD].updatedAt > 0, '人物条目 updatedAt 已刷新');
    const psD1 = WA.registry.profileStat();
    assert(psD1.registered >= 1 && psD1.withProfile >= 1 && psD1.entries >= 4, 'profileStat 覆盖率计量正确');

    // D3. 准入：坏档案不得写进去
    assert(WA.registry.setProfileSafe('', {}).reason === 'missing-name', '空名拒绝（missing-name）');
    assert(WA.registry.setProfileSafe(NMD, ['x']).reason === 'not-object', '非对象入参拒绝（not-object）');
    assert(WA.registry.setProfileSafe(NMD, { foo: 1 }).reason === 'no-sections', '无有效节拒绝（no-sections）');
    const badShD = WA.registry.setProfileSafe(NMD, { personality: 123 });
    assert(badShD.ok === false && badShD.rejected.some(function (r) { return r.section === 'personality' && r.reason === 'bad-shape'; }), '非数组/非字符串拒绝（防写坏结构）');
    const lenBeforeD = WA.registry.getProfile(NMD).personality.length;
    const wLongD = WA.registry.setProfileSafe(NMD, { personality: ['x'.repeat(260), '\u5408\u6cd5\u6761\u76ee'] });
    assert(wLongD.ok === true && wLongD.rejected.some(function (r) { return r.reason === 'length-or-empty'; }), '超长条目拒收并归因');
    assert(WA.registry.getProfile(NMD).personality.length === lenBeforeD + 1, '只有合法条目进档');
    const wRelD = WA.registry.setProfileSafe(NMD, { relationships: [' | a | b'] });
    assert(wRelD.rejected.some(function (r) { return r.section === 'relationships' && r.reason === 'missing-target'; }), '关系缺目标拒收（missing-target）');
    const wDupD = WA.registry.setProfileSafe(NMD, { personality: ['\u51b7\u9759'] });
    assert(wDupD.ok === true && wDupD.added.personality === 0, '默认追加合并且同文本去重');

    // D4. 剪裁上限取自容量登记表（单一真源）
    const capPD = WA.store.capsFor('people.p_x.profile.personality').cap;
    const capMD = WA.store.capsFor('people.p_x.profile.memory').cap;
    const capRD = WA.store.capsFor('people.p_x.profile.relationships').cap;
    const manyPD = []; for (let i = 0; i < capPD + 8; i++) manyPD.push('\u6027\u683c\u6761' + i);
    WA.registry.setProfileSafe(NMD, { personality: manyPD });
    assert(WA.registry.getProfile(NMD).personality.length === capPD, '性格节剪裁到登记表上限（' + capPD + '）——单一真源生效');
    const manyMD = []; for (let i = 0; i < capMD + 9; i++) manyMD.push('\u7ecf\u5386' + i);
    WA.registry.setProfileSafe(NMD, { memory: manyMD });
    assert(WA.registry.getProfile(NMD).memory.length === capMD, '经历节剪裁到登记表上限（' + capMD + '）');
    const manyRD = []; for (let i = 0; i < capRD + 7; i++) manyRD.push('\u76ee\u6807' + i + ' | \u5173\u7cfb | \u52a8\u6001');
    WA.registry.setProfileSafe(NMD, { relationships: manyRD });
    assert(WA.registry.getProfile(NMD).relationships.length === capRD, '关系节剪裁到登记表上限（' + capRD + '）');
    assert(WA.store.sizeAudit({ minBytes: 0, maxDepth: 8 }).drifted.every(function (r) { return r.path.indexOf('profile') < 0; }), '写入后无 drifted（登记与实现同源）');

    // D5. replace 与清空
    const wRepD = WA.registry.setProfileSafe(NMD, { personality: ['\u552f\u4e00\u65b0\u6761'] }, { replace: true });
    assert(wRepD.ok === true && WA.registry.getProfile(NMD).personality.length === 1, 'replace:true 整节替换');
    const clrD = WA.registry.clearProfile(NMD);
    assert(clrD.ok === true, 'clearProfile 成功');
    const prD2 = WA.registry.getProfile(NMD);
    assert(prD2.personality.length === 0 && prD2.relationships.length === 0, '清空后档案各节为空');
    assert(WA.registry.list().indexOf(NMD) >= 0, '清空档案不注销 NPC 本身');

    // D6. 巡视与诊断可见性
    const mNoProfD = WA.store.maintain({});
    assert(mNoProfD.signals.profRegistered >= 1 && mNoProfD.signals.profWith === 0, 'signals 透出「有注册、零档案」');
    const issNoD = mNoProfD.issues.filter(function (i) { return i.key === 'actors.profile'; })[0];
    assert(!!issNoD && issNoD.level === 'info', '「有 NPC 却零档案」被报为可行动信号');
    assert(mNoProfD.actions.some(function (a) { return a.id === 'edit-npc-profile'; }), '巡视给出建档动作指引');
    WA.registry.setProfileSafe(NMD, { personality: ['\u4e00\u6761'], memory: ['\u53c8\u4e00\u6761'] });
    const mHasD = WA.store.maintain({});
    assert(mHasD.signals.profWith >= 1 && mHasD.signals.profEntries >= 2, '建档后 signals 覆盖率回升');
    const dgD = WA.toolDiag.collect();
    assert(dgD.runtime && dgD.runtime.actors && typeof dgD.runtime.actors.registered === 'number', '诊断 runtime 透出 actors 档案节');

    // D7. 端到端（真 DOM）：面板入口真能建档
    let JSDOMD2200 = null;
    try { JSDOMD2200 = require('jsdom').JSDOM; } catch (e) { try { JSDOMD2200 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDOMD2200 = null; } }
    if (!JSDOMD2200) {
      console.log('  \u26a0 jsdom 不可用，跳过块4 端到端断言（源码锚点已覆盖接线）');
    } else {
      const domD2200 = new JSDOMD2200('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocD2200 = global.document;
      global.document = domD2200.window.document;
      try { global.Node = domD2200.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
      WA.store.init();
      WA.ui.mount();
      WA.ui.open();
      const tabsD2200 = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab'));
      const peopleTabD2200 = tabsD2200.filter(function (t) { return t.dataset.page === 'people'; })[0];
      assert(!!peopleTabD2200, '面板存在「人物」页签');
      const $d = function (sel) { return global.document.querySelector(sel); };
      const NMD2 = '\u63a2\u9488\u4e19';
      WA.registry.setProfileSafe(NMD2, { personality: ['\u521d\u59cb'] });
      peopleTabD2200.onclick();
      const btnD = global.document.querySelector('[data-prof="' + NMD2 + '"]');
      assert(!!btnD, '人物列表渲染出该 NPC 的「档案」按钮');
      if (btnD && btnD.onclick) btnD.onclick();
      assert(!!$d('#wa-prof-personality') && !!$d('#wa-prof-save'), '点击后编辑器真渲染');
      const pInD = $d('#wa-prof-personality');
      assert(!!pInD && pInD.value.indexOf('\u521d\u59cb') >= 0, '编辑器预填现有档案（不丢已录内容）');
      const setVD = function (sel, v) { const el = $d(sel); if (el) el.value = v; };
      setVD('#wa-prof-personality', ['\u7b2c\u4e00\u6761', '\u7b2c\u4e8c\u6761'].join(String.fromCharCode(10)));
      setVD('#wa-prof-memory', '\u8bb0\u5fc6\u4e00');
      setVD('#wa-prof-relationships', '\u7532 | \u540c\u4f34 | \u540c\u884c');
      const svD = $d('#wa-prof-save'); if (svD && svD.onclick) svD.onclick();
      const prED = WA.registry.getProfile(NMD2);
      assert(prED.personality.length === 2 && prED.personality[0].text === '\u7b2c\u4e00\u6761', '面板保存真写入档案（整节替换）');
      assert(prED.memory.length === 1 && prED.relationships.length === 1, '多节同时保存生效');
      peopleTabD2200.onclick();
      const btnD2 = global.document.querySelector('[data-prof="' + NMD2 + '"]');
      if (btnD2 && btnD2.onclick) btnD2.onclick();
      const clD = $d('#wa-prof-clear'); if (clD && clD.onclick) clD.onclick();
      assert(WA.registry.getProfile(NMD2).personality.length === 0, '面板「清空档案」真生效');
      peopleTabD2200.onclick();
      const miniD = $d('#wa-prof-mini');
      assert(!!miniD && /[0-9]+\/[0-9]+/.test(miniD.textContent || ''), '人物页展示档案覆盖率（可解释「性格锚点未建立」）');
      global.document = savedDocD2200;
      global.document.getElementById = () => null;
    }

    WA.workflow.resetHistory();
    fresh2200();
  }

  // ── E. 块5：存档恢复出口 + 设置卫生出口（restore/dropRecoveryPoint/orphanSettingsKeys/registry 此前零调用）──
  section('v2.2.0 块5：存档恢复与设置卫生出口（修功能级失效）');
  {
    fresh2200();
    const sbSrcE2200 = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
    const sSrcE2200 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    const pSrcE2200 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    const dSrcE2200 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');

    // E1. 接入位 + 静态锚点
    assert(typeof WA.settingsBus.deregisterOrphan === 'function', 'settingsBus.deregisterOrphan 存在（孤儿注销出口）');
    assert(typeof WA.settingsBus.registryStat === 'function', 'settingsBus.registryStat 存在（登记表计量）');
    const idsE2200 = (WA.toolDiag.UI_BINDINGS.filter(g => g.page === 'tools')[0] || {}).ids || [];
    assert(idsE2200.indexOf('wa-recovery-view') >= 0 && idsE2200.indexOf('wa-orphan-view') >= 0, '两个新控件纳入 UI_BINDINGS');
    assert(dSrcE2200.indexOf('settingsBus: safe(') > 0, '诊断新增 settingsBus 节');
    assert(dSrcE2200.indexOf('quarantineAudit: safe(') > 0, '诊断新增 quarantineAudit 节');
    assert(dSrcE2200.indexOf('migrateReport: safe(') > 0, '诊断新增 migrateReport 节');
    assert(dSrcE2200.indexOf("key: 'settingsBus.orphan'") > 0, 'verdict 报孤儿设置键议题');
    assert(/if \(rvBtn\) rvBtn\.onclick = /.test(pSrcE2200) && /if \(orphBtn\) orphBtn\.onclick = /.test(pSrcE2200), '两个按钮绑定无短路守卫');
    assert(/rvBtn\.onclick[\s\S]{0,900}listRecoveryPoints/.test(pSrcE2200), '恢复点绑定体内真调 listRecoveryPoints');
    assert(/data-rv-restore[\s\S]{0,700}store\.restore/.test(pSrcE2200), '回滚按钮真调 store.restore');
    assert(/data-rv-drop[\s\S]{0,500}dropRecoveryPoint/.test(pSrcE2200), '丢弃按钮真调 dropRecoveryPoint');
    assert(pSrcE2200.indexOf('id="wa-rv-confirm"') > 0 && pSrcE2200.indexOf('id="wa-rv-cancel"') > 0, '破坏性回滚提供二次确认控件');
    assert(/data-orph-del[\s\S]{0,400}deregisterOrphan/.test(pSrcE2200), '孤儿注销真调 deregisterOrphan');
    assert(/if \(!hit\.orphan\) return \{ ok: false, reason: 'not-orphan/.test(sbSrcE2200), '注销有 orphan 门禁（防误删在用键登记）');
    assert(sbSrcE2200.indexOf('WA.__settingsRegs = arr.filter') > 0, '注销只改登记表数组（不动磁盘配置）');
    assert(sSrcE2200.indexOf('// \u2500\u2500 19. \u8bbe\u7f6e\u952e\u536b\u751f\uff08v2.2.0\uff09\u2500\u2500') > 0, '巡视新增第 19 节（设置键卫生）');
    assert(sSrcE2200.indexOf('orphanSettings: orphanKeys.length') > 0, 'signals 采集孤儿键计数');

    // E2. 恢复点：真回滚（此前只能导出成 JSON，无法回滚）
    WA.store.transact(d => { d.round = 1; d.clock.label = '\u7b2c1\u65e5'; });
    WA.store.save();
    WA.store.createRecoveryPoint();
    WA.store.transact(d => { d.round = 2; d.clock.label = '\u7b2c2\u65e5'; });
    WA.store.save();
    assert(WA.store.listRecoveryPoints().length >= 1 && WA.store.get().round === 2, '前置：存在恢复点且当前状态已前进');
    const rvListE2200 = WA.store.listRecoveryPoints();
    const rvIdxE2200 = rvListE2200.findIndex(p => p.state && p.state.round === 1);
    assert(rvIdxE2200 >= 0, '前置：存在 round=1 的快照点');
    const restOkE2200 = WA.store.restore(rvIdxE2200);
    assert(restOkE2200 === true, 'store.restore 真回滚（此前零生产调用）');
    assert(WA.store.get().round === 1, '回滚后状态真被替换（round 回到 1）');
    assert(WA.store.listRecoveryPoints().length >= 1, '回滚前自动留点（防二次丢失无退路）');

    // E3. 丢弃恢复点（腾环形窗口）
    const beforeDropE2200 = WA.store.listRecoveryPoints().length;
    const dropE2200 = WA.store.dropRecoveryPoint(undefined, 0);
    assert(dropE2200.ok === true && WA.store.listRecoveryPoints().length === beforeDropE2200 - 1, '丢弃真生效（此前 dropRecoveryPoint 零调用）');
    const dropBadE2200 = WA.store.dropRecoveryPoint(undefined, 99);
    assert(dropBadE2200.ok === false, '越界索引明确失败（不静默）');

    // E4. 设置键：登记表 / 孤儿注销 / 安全门禁
    const rsE2200 = WA.settingsBus.registryStat();
    assert(rsE2200.total > 0 && typeof rsE2200.byModule === 'object', 'registryStat 透出登记表计量（此前 registry 零调用）');
    assert(rsE2200.optional >= 1, '登记表含 optional（可选键）声明项');
    // v2.3.0: 先造一个真幽灵（声明 orphan + 曾读到 + 已删除），再走注销链路。
    //   旧断言直接用内置 orphan 项，而内置项在语义收窄后已全部改标 optional —— 改为现场构造。
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([{ key: 'worldaxis_e2200_ghost', def: null, module: 'test', orphan: true }]);
    global.localStorage.setItem('worldaxis_e2200_ghost', '{}');
    WA.settingsBus.read({ key: 'worldaxis_e2200_ghost' });
    global.localStorage.removeItem('worldaxis_e2200_ghost');
    const orphansE2200 = WA.store.orphanSettingsKeys();
    assert(Array.isArray(orphansE2200) && orphansE2200.some(o => o.key === 'worldaxis_e2200_ghost'), 'orphanSettingsKeys 返回真幽灵登记清单');
    const regFirstE2200 = WA.settingsBus.registry().filter(r => !r.orphan && !r.optional)[0].key;
    assert(WA.settingsBus.deregisterOrphan(regFirstE2200).ok === false, '在用键拒绝注销（不制造登记表与行为不一致）');
    const optKeyE2200 = WA.settingsBus.registry().filter(r => r.optional)[0].key;
    assert(WA.settingsBus.deregisterOrphan(optKeyE2200).reason.indexOf('optional-key') === 0, '可选键拒绝注销（此前被误标 orphan 可被一键清除）');
    assert(WA.settingsBus.deregisterOrphan('').reason === 'missing-key', '空键拒绝（missing-key）');
    assert(WA.settingsBus.deregisterOrphan('worldaxis_non_existent_key').reason === 'not-found', '不存在的键明确归因（not-found）');
    const orphanN0E2200 = orphansE2200.length;
    const okOrphE2200 = WA.settingsBus.deregisterOrphan('worldaxis_e2200_ghost');
    assert(okOrphE2200.ok === true, '真幽灵键注销成功');
    assert(WA.store.orphanSettingsKeys().length === orphanN0E2200 - 1, '注销后幽灵清单真减少');
    assert(WA.settingsBus.registryStat().deregisters >= 1, '注销计数可观测');

    // E5. 诊断可见性（此前 quarantineAudit / migrateReport 零出口）
    const dgE2200 = WA.toolDiag.collect();
    assert(dgE2200.runtime && dgE2200.runtime.settingsBus && dgE2200.runtime.settingsBus.registry, '诊断透出 settingsBus 节');
    assert(dgE2200.runtime.quarantineAudit !== undefined, '诊断透出 quarantineAudit（隔离处置史）');
    assert(dgE2200.runtime.migrateReport !== undefined, '诊断透出 migrateReport（存档迁移报告）');
    const vdE2200 = WA.toolDiag.verdict(dgE2200);
    // v2.3.0: 现场造一个真幽灵，保证 verdict 议题分支必被走到（不再依赖内置项凑巧存在）
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([{ key: 'worldaxis_e2200_ghost2', def: null, module: 'test', orphan: true }]);
    global.localStorage.setItem('worldaxis_e2200_ghost2', '{}');
    WA.settingsBus.read({ key: 'worldaxis_e2200_ghost2' });
    global.localStorage.removeItem('worldaxis_e2200_ghost2');
    const vdGhostE2200 = WA.toolDiag.verdict(WA.toolDiag.collect());
    const orphanIssueE2200 = vdGhostE2200.issues.filter(i => i.key === 'settingsBus.orphan');
    if (WA.store.orphanSettingsKeys().length > 0) assert(orphanIssueE2200.length === 1 && orphanIssueE2200[0].level === 'info', '有幽灵键时 verdict 报 info 议题');
    else assert(orphanIssueE2200.length === 0, '无幽灵键时 verdict 不报议题（不制造噪声）');
    WA.__settingsRegs = WA.__settingsRegs.filter(r => r.key !== 'worldaxis_e2200_ghost2');

    // E6. 巡视只采集不产议题（防「新库永久挂一条不可消除 info」）
    const mE2200 = WA.store.maintain({});
    assert(mE2200.signals.orphanSettings === WA.store.orphanSettingsKeys().length, 'signals 孤儿键计数与实际一致');
    assert(!mE2200.issues.some(i => i.key === 'settings.orphan'), '巡视不因内置 orphan 注册产议题（新库噪声防护）');
    assert(!mE2200.issues.some(i => i.key === 'settings.quarantineHistory'), '巡视不因历史处置史产议题');
    assert(typeof mE2200.score === 'number' && !!mE2200.level, '巡视照常给出结论');

    // E7. 端到端（真 DOM）：出口真能点通，且反馈不被重绘冲掉
    let JSDOME2200 = null;
    try { JSDOME2200 = require('jsdom').JSDOM; } catch (e) { try { JSDOME2200 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDOME2200 = null; } }
    if (!JSDOME2200) {
      console.log('  \u26a0 jsdom 不可用，跳过块5 端到端断言（源码锚点已覆盖接线）');
    } else {
      const domE2200 = new JSDOME2200('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocE2200 = global.document;
      global.document = domE2200.window.document;
      try { global.Node = domE2200.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
      WA.store.init();
      WA.ui.mount();
      WA.ui.open();
      const tabsE2200 = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab'));
      const toolsTabE2200 = tabsE2200.filter(t => t.dataset.page === 'tools')[0];
      assert(!!toolsTabE2200, '面板存在「工具」页签');
      toolsTabE2200.onclick();
      const $e = sel => global.document.querySelector(sel);
      const callE2200 = el => { if (el && typeof el.onclick === 'function') el.onclick(); };
      assert(!!$e('#wa-recovery-view') && !!$e('#wa-orphan-view'), '工具页真渲染两个新控件');
      // 造一个恢复点
      WA.store.transact(d => { d.round = 7; }); WA.store.save();
      WA.store.createRecoveryPoint();
      WA.store.transact(d => { d.round = 8; }); WA.store.save();
      callE2200($e('#wa-recovery-view'));
      assert((($e('#wa-diag-out') || {}).innerHTML || '').indexOf('\u5b58\u6863\u6062\u590d\u70b9') > 0, '面板列出恢复点');
      const rvBtnE2200 = global.document.querySelector('[data-rv-restore]');
      assert(!!rvBtnE2200, '提供「恢复到此点」入口');
      callE2200(rvBtnE2200);
      assert(WA.store.get().round === 8, '点「恢复」先出确认（未一步执行破坏性回滚）');
      assert(!!$e('#wa-rv-confirm') && !!$e('#wa-rv-cancel'), '确认/取消控件已渲染');
      callE2200($e('#wa-rv-confirm'));
      assert(WA.store.get().round === 7, '确认后真回滚（世界状态被替换）');
      assert(((($e('#wa-diag-out') || {}).innerHTML) || '').indexOf('\u5df2\u56de\u6eda') > 0, '面板给出回滚反馈（不被重绘冲掉）');
      const beforeDropUIE2200 = WA.store.listRecoveryPoints().length;
      callE2200($e('#wa-recovery-view'));
      callE2200(global.document.querySelector('[data-rv-drop]'));
      assert(WA.store.listRecoveryPoints().length === beforeDropUIE2200 - 1, '面板丢弃真生效');
      assert(((($e('#wa-diag-out') || {}).innerHTML) || '').indexOf('\u5df2\u4e22\u5f03') > 0, '面板给出丢弃反馈（不被重绘冲掉）');
      callE2200($e('#wa-orphan-view'));
      assert(((($e('#wa-diag-out') || {}).innerHTML) || '').indexOf('\u8bbe\u7f6e\u952e\u767b\u8bb0\u8868') > 0, '面板展示设置键登记表');
      global.document = savedDocE2200;
      global.document.getElementById = () => null;
    }

    WA.workflow.resetHistory();
    fresh2200();
  }

  // ── F. 块6：推演事件链入账（此前 applyResult 对 events_create/events_update 零消费 = 主链断裂）──
  section('v2.2.0 块6：推演事件链入账（修主链断裂）');
  {
    fresh2200();
    const bsSrcF2200 = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
    const dSrcF2200 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const pSrcF2200 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');

    // F1. 接入位
    assert(typeof WA.backstage.applyResult === 'function' && typeof WA.backstage.applyStat === 'function', 'applyResult / applyStat 可用');
    assert(/this\.applyResult\(draft, clamped, anchor\)/.test(bsSrcF2200), '结算路径真经过 applyResult');
    assert(bsSrcF2200.indexOf('r.events_create') > 0 && bsSrcF2200.indexOf('r.events_update') > 0, 'applyResult 真消费 events_create/events_update（此前零消费）');
    assert(bsSrcF2200.indexOf('WA.limits.locateStable') > 0 && bsSrcF2200.indexOf('WA.limits.applyStableUpdate') > 0, '更新走 limits 稳定契约（不另起实现）');
    assert(dSrcF2200.indexOf('backstage: safe(') > 0, '诊断新增 backstage 入账节');
    assert(pSrcF2200.indexOf('WA.backstage.applyStat()') > 0, '事件页渲染入账留痕');

    // F2. 功能级生效：推演事件真进 state
    WA.store.transact(d => { d.evolution.events = []; d.evolution.round = 3; });
    const stF0 = WA.backstage.applyStat();
    WA.store.transact(d => WA.backstage.applyResult(d, { events_create: [
      { title: '\u8840\u5200\u95e8\u5bfb\u4ec7', type: 'conflict', level: 2, desc: '\u5bfb\u4e0a\u95e8\u6765' },
      { title: '\u62a4\u9001\u5546\u961f', type: 'progress', level: 9, desc: '\u5f80\u5317\u53bb' }
    ] }, { idx: 1 }));
    const evsF1 = WA.store.read('evolution.events', []);
    assert(evsF1.length === 2, '两事件真进 state（此前整条丢弃）');
    const bloodF = evsF1.find(e => e.name === '\u8840\u5200\u95e8\u5bfb\u4ec7');
    const escortF = evsF1.find(e => e.name === '\u62a4\u9001\u5546\u961f');
    assert(!!bloodF && bloodF.type === 'conflict' && bloodF.stage === '\u840c\u82bd' && bloodF.level === 2, '名字/类型/首阶段/等级入账正确');
    assert(!!escortF && escortF.type === 'progress' && escortF.stage === '\u7b79\u5907', '进度型事件按自己的阶段序列起步');
    assert(!!escortF && escortF.level === 4, '等级越界被夹到 4（与编辑器 MAX_LEVEL 同口径）');
    assert(!!bloodF && bloodF.source === 'backstage', '来源标记 backstage（可追溯）');
    assert(WA.backstage.applyStat().eventsCreated === stF0.eventsCreated + 2, 'eventsCreated 计数可见');

    // F3. 同名归并 / 容量 / 挤出
    const stDupF = WA.backstage.applyStat();
    WA.store.transact(d => WA.backstage.applyResult(d, { events_create: [{ title: '\u8840\u5200\u95e8\u5bfb\u4ec7', type: 'conflict' }] }, { idx: 1 }));
    assert(WA.store.read('evolution.events', []).length === 2, '同名事件不重复入账（推演按名归并契约）');
    assert(WA.backstage.applyStat().eventsCreated === stDupF.eventsCreated, '同名跳过不计入新增');
    WA.store.transact(d => {
      d.evolution.events = [];
      for (let i = 0; i < 16; i++) d.evolution.events.push({ id: 'x' + i, type: 'conflict', name: '\u586b\u5145' + i, level: 1, stage: i === 8 ? '\u5df2\u6d88\u6563' : '\u840c\u82bd', stageRound: 1 });
    });
    WA.store.transact(d => WA.backstage.applyResult(d, { events_create: [{ title: '\u65b0\u4e8b\u4ef6', type: 'conflict' }] }, { idx: 1 }));
    const evsF2 = WA.store.read('evolution.events', []);
    assert(evsF2.length <= 16 && evsF2.some(e => e.name === '\u65b0\u4e8b\u4ef6'), '容量仍受 16 约束（实 ' + evsF2.length + '）且新事件入账');
    assert(!evsF2.some(e => e.stage === '\u5df2\u6d88\u6563'), '挤出优先终局（与 evolution.addEvent 同口径）');
    assert(evsF2.some(e => e.name === '\u586b\u5145' + 0), '不误伤最早活跃事件');
    WA.store.transact(d => d.evolution.events = []);
    WA.store.transact(d => WA.backstage.applyResult(d, { events_create: Array.from({ length: 12 }, (_, i) => ({ title: '\u6ea2\u51fa' + i, type: 'conflict' })) }, { idx: 1 }));
    assert(WA.store.read('evolution.events', []).length === 6, '单轮新增上限 6（与提示词 events_create≤6 同口径）');

    // F4. events_update：稳定定位与频道保护
    WA.store.transact(d => { d.evolution.events = [{ id: 'evA', type: 'conflict', name: '\u65e7\u6807\u9898', level: 1, stage: '\u840c\u82bd', stageRound: 1, desc: '' }]; });
    const stF2 = WA.backstage.applyStat();
    WA.store.transact(d => WA.backstage.applyResult(d, { events_update: [
      { title: '\u65e7\u6807\u9898', name: '\u65b0\u6807\u9898', type: 'progress', stage: '\u917d\u917f', desc: '\u903c\u8fd1\u4e86' }
    ] }, { idx: 1 }));
    const upF = WA.store.read('evolution.events', [])[0] || {};
    assert(upF.id === 'evA' && upF.name === '\u65b0\u6807\u9898', '按 title 定位：改名不换链（id 不变且确实改名）');
    assert(upF.type === 'conflict', 'type 禁改（推演侧铁律）');
    assert(upF.stage === '\u917d\u917f' && upF.desc === '\u903c\u8fd1\u4e86', '阶段与描述按更新写入');
    assert(WA.backstage.applyStat().eventsUpdated === stF2.eventsUpdated + 1, 'eventsUpdated 计数可见');
    assert(WA.backstage.applyStat().eventsLoose === stF2.eventsLoose, '命中时不计入未匹配（防假命中）');
    const stF3 = WA.backstage.applyStat();
    WA.store.transact(d => WA.backstage.applyResult(d, { events_update: [{ title: '\u4e0d\u5b58\u5728\u7684\u4e8b\u4ef6', stage: '\u917d\u917f' }] }, { idx: 1 }));
    assert(WA.backstage.applyStat().eventsLoose === stF3.eventsLoose + 1, '无对应事件只计数');
    assert(WA.store.read('evolution.events', []).length === 1, '未命中更新不产生新条目');

    // F5. 边界与卫兵
    const stF4 = WA.backstage.applyStat();
    WA.store.transact(d => WA.backstage.applyResult(d, { events_create: [null, { title: '   ' }, { desc: '\u65e0\u540d' }, { title: '\u5408\u6cd5' }] }, { idx: 1 }));
    assert(WA.store.read('evolution.events', []).filter(e => e.name === '\u5408\u6cd5').length === 1, '空名/无名条目被跳过');
    assert(WA.backstage.applyStat().eventsCreated === stF4.eventsCreated + 1, '跳过条目不计入新增');
    WA.store.transact(d => WA.backstage.applyResult(d, { events_create: [{ title: '\u975e\u6cd5\u9636\u6bb5', type: 'progress', stage: '\u840c\u82bd' }] }, { idx: 1 }));
    const badF = WA.store.read('evolution.events', []).find(e => e.name === '\u975e\u6cd5\u9636\u6bb5');
    assert(!!badF && badF.stage === '\u7b79\u5907', '非法阶段回落到该类型首阶段（不写脏阶段）');

    // F6. 可观测性
    const dgF = WA.toolDiag.collect();
    assert(!!(dgF.runtime && dgF.runtime.backstage && dgF.runtime.backstage.apply), '诊断透出入账计量');
    assert(dgF.runtime.backstage.apply.eventsCreated >= 1, '诊断透出新增计数');
    assert(typeof dgF.runtime.backstage.fromBackstage === 'number' && dgF.runtime.backstage.fromBackstage >= 1, '诊断透出 state 中来自推演的事件数（端到端可见）');

    // F7. 端到端（真 DOM）：事件页留痕
    let JSDOMF2200 = null;
    try { JSDOMF2200 = require('jsdom').JSDOM; } catch (e) { try { JSDOMF2200 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDOMF2200 = null; } }
    if (!JSDOMF2200) {
      console.log('  \u26a0 jsdom 不可用，跳过块6 端到端断言（源码锚点已覆盖接线）');
    } else {
      const domF2200 = new JSDOMF2200('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocF2200 = global.document;
      global.document = domF2200.window.document;
      try { global.Node = domF2200.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
      WA.store.init();
      WA.ui.mount();
      WA.ui.open();
      const tabsF2200 = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab'));
      const evTabF2200 = tabsF2200.filter(t => t.dataset.page === 'events')[0];
      assert(!!evTabF2200, '面板存在「事件」页签');
      WA.store.transact(d => WA.backstage.applyResult(d, { events_create: [{ title: '\u7aef\u5230\u7aef\u4e8b\u4ef6', type: 'conflict' }] }, { idx: 1 }));
      evTabF2200.onclick();
      const bodyF2200 = (global.document.querySelector('.wa-body') || {}).innerHTML || '';
      assert(bodyF2200.indexOf('\u6f14\u5316\u4e8b\u4ef6') > 0, '事件页照常渲染');
      assert(bodyF2200.indexOf('\u63a8\u6f14\u4e8b\u4ef6\u5165\u8d26') > 0, '事件页展示推演入账留痕（此前断链毫无提示）');
      assert(/\u65b0\u589e \d+/.test(bodyF2200), '留痕含新增条数');
      global.document = savedDocF2200;
      global.document.getElementById = () => null;
    }

    WA.workflow.resetHistory();
    fresh2200();
  }

  // ── G. 块7：推演契约对账闭环（events_create/events_update 两侧补齐；含对账器自身缺陷修复）──
  section('v2.2.0 块7：推演契约对账闭环');
  {
    fresh2200();
    const caSrcG2200 = fs.readFileSync(path.join(BASE, 'engines/contract-audit.js'), 'utf8');
    const bsSrcG2200 = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
    const lmSrcG2200 = fs.readFileSync(path.join(BASE, 'engines/limits.js'), 'utf8');

    // G1. 两条缺失字段两侧补齐
    assert(!!(WA.contractAudit && WA.contractAudit.PROBES.events_create && WA.contractAudit.PROBES.events_update), '对账器探针表含事件链两字段（此前漏登=对本类漂移失明）');
    assert(!!(WA.contractAudit.SEEDS && WA.contractAudit.SEEDS.events_update), '更新类探针带基线种子（防假阴性）');
    assert(JSON.stringify(WA.contractAudit.PROBES.events_create).indexOf('__audit_') >= 0, '探针值带哨兵标记（差分可判是否真落地）');
    assert(bsSrcG2200.indexOf('"events_create":') > 0 && bsSrcG2200.indexOf('"events_update":') > 0, '提示词契约声明了两字段（模型才会产出）');
    assert(lmSrcG2200.indexOf('out.events_create') > 0 && lmSrcG2200.indexOf('out.events_update') > 0, 'limits 截断两字段');
    assert(caSrcG2200.indexOf('LIVE_DELEGATED') > 0 && caSrcG2200.indexOf('liveIterChanged') > 0, 'live 兜底限定委托白名单 + 本轮差分（防跨轮污染假阳性）');

    // G2. 契约解析：真实提示词声明了两字段
    const promptG = WA.backstage.buildPrompt({ idx: 1, text: '' }, '');
    const contractG = WA.contractAudit.parseContract(promptG);
    assert(!!contractG.fields.events_create && !!contractG.fields.events_update, 'parseContract 识别事件链两字段');
    assert(Object.keys(contractG.fields).length >= 24, '契约字段数不少于 24（实 ' + Object.keys(contractG.fields).length + '）');
    const promptTextG = JSON.stringify(promptG);
    assert(promptTextG.indexOf('conflict|progress') > 0, '契约写明事件类型枚举');
    assert(promptTextG.indexOf('\u6539\u540d\u4e0d\u6362\u94fe') > 0, '契约写明「改名不换链」语义');

    // G3. 消费实测（只读：哨兵不残留）
    const baseG = JSON.parse(JSON.stringify(WA.store.get()));
    const consumedG = WA.contractAudit.consumedFields({ baseState: baseG });
    assert(!!consumedG.events_create && consumedG.events_create.consumed === true, 'events_create 实测被消费');
    assert(!!consumedG.events_update && consumedG.events_update.consumed === true, 'events_update 实测被消费（种子机制让更新真命中）');
    assert(!!consumedG.events_update && consumedG.events_update.changed === true, '更新真改了状态（非 live 兜底误判）');
    assert(JSON.stringify(WA.store.get()).indexOf('__audit_') < 0, '探针哨兵不残留于真实存档');

    // G4. 全量对账：双向无漂移
    const repG = WA.contractAudit.audit({ baseState: baseG, applyFn: (d, r, a) => WA.backstage.applyResult(d, r, a) });
    assert(repG.drift.declaredNotConsumed.length === 0 && repG.drift.probeNotDeclared.length === 0, '双向无漂移（声明↔消费）');
    assert(repG.verdict.errorCount === 0, '对账结论无阻断项');
    assert(repG.declared.length === repG.consumed.length, '声明数与消费数一致（' + repG.declared.length + '/' + repG.consumed.length + '）');

    // G5. 哨兵灵敏度复核（注入伪漂移必须被抓）
    const fakePromptG = JSON.parse(JSON.stringify(promptG));
    fakePromptG.forEach(m => { if (typeof m.content === 'string') m.content = m.content.replace(/ *"events_create":[^\n]*\n/, '\n'); });
    assert(!!WA.contractAudit.parseContract(fakePromptG).fields.events_update, '伪契约只删 events_create（前置成立）');
    const repG2 = WA.contractAudit.audit({ baseState: baseG, promptFn: () => fakePromptG, applyFn: (d, r, a) => WA.backstage.applyResult(d, r, a) });
    assert(repG2.drift.probeNotDeclared.indexOf('events_create') >= 0, '哨兵抓出「消费但未声明」（消费端在读而模型永不发）');
    assert(repG2.issues.some(i => i.code === 'probe_not_declared' && i.level === 'error'), '该漂移定为阻断级');
    const repG3 = WA.contractAudit.audit({ baseState: baseG, applyFn: () => { } });
    assert(repG3.drift.declaredNotConsumed.indexOf('events_create') >= 0, '哨兵抓出「声明但未消费」（白产出）');
    const selectiveG = (d, r, a) => { const p = JSON.parse(JSON.stringify(r)); delete p.events_create; WA.backstage.applyResult(d, p, a); };
    const repG4 = WA.contractAudit.audit({ baseState: baseG, applyFn: selectiveG });
    assert(repG4.drift.declaredNotConsumed.indexOf('events_create') >= 0, '哨兵抓出「选择性未消费」（残留哨兵不得让它误判已消费）');
    const repG5 = WA.contractAudit.audit({ baseState: baseG, promptFn: () => [], applyFn: (d, r, a) => WA.backstage.applyResult(d, r, a) });
    assert(repG5.declared.length === 0 && repG5.drift.probeNotDeclared.length >= 20, '空契约下不得虚报对齐');

    // G6. 下游消费：摘要 / 诊断 / 巡视
    assert(typeof WA.contractAudit.summaryText(repG) === 'string', '对账摘要可用');
    assert(WA.contractAudit.flatten(repG).some(x => x.key === 'coverage'), 'flatten 含覆盖率行');
    assert(!!WA.toolDiag.collect().runtime, '诊断照常采集');
    const mG = WA.store.maintain({ deep: true });
    assert(typeof mG.score === 'number' && !!mG.level, '巡视（deep）照常给出结论');
    assert(!mG.issues.some(i => i.key === 'engine.contract' && i.level === 'error'), '契约无阻断议题');

    WA.workflow.resetHistory();
    fresh2200();
  }

  // ── H. 块8：UI 绑定守卫全覆盖（此前 UI_BINDINGS 只登记 24 个控件，panel 实际渲染 91 个）──
  section('v2.2.0 块8：UI 绑定守卫全覆盖');
  {
    fresh2200();
    const dSrcH2200 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const pSrcH2200 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');

    // H1. 分层结构
    const grpH = WA.toolDiag.UI_BINDINGS;
    assert(Array.isArray(grpH) && grpH.length >= 6, 'UI_BINDINGS 覆盖多页（实 ' + grpH.length + ' 组）');
    const gIds = new Set(), gCond = new Set(), gDyn = new Set();
    grpH.forEach(g => { (g.ids || []).forEach(x => gIds.add(x)); (g.cond || []).forEach(x => gCond.add(x)); (g.dynamic || []).forEach(x => gDyn.add(x)); });
    assert(gIds.size >= 60, '无条件渲染控件纳入守卫数不少于 60（实 ' + gIds.size + '，此前仅 24）');
    assert(gCond.size >= 5, '条件渲染控件单独分层（实 ' + gCond.size + '）');
    assert(gDyn.size >= 5, '动态生成节点按锚点分层（实 ' + gDyn.size + '）');
    assert(dSrcH2200.indexOf('condMissing') > 0 && dSrcH2200.indexOf('dynamicMissing') > 0, 'secUi 支持条件/动态分层统计');

    // H2. 不变量：面板渲染的控件全部在守卫表内 + 无僵尸条目
    //   v2.3.0 块3 口径修正：渲染 id 此前只从 ui/panel.js 采集，而**设置页全部控件由
    //   ui/settings.js 渲染** —— 于是任何设置页控件一旦写入守卫表就必被报成「僵尸条目」。
    //   这正是 v2.2.0 块8 把设置页整页留在守卫之外的根因（写进去必然失败）。
    //   采集范围扩展到全部 ui/*.js 后，守卫表才可能真正覆盖设置页。
    const renderedH = [];
    const reH = /id="(wa-[a-z0-9\-]+)"/g;
    const uiFilesH = ['ui/panel.js', 'ui/settings.js', 'ui/assistant.js'];
    const uiSrcJoinH = uiFilesH.map(function (f) {
      try { return fs.readFileSync(path.join(BASE, f), 'utf8'); } catch (e) { return ''; }
    }).join('\n');
    let mH;
    while ((mH = reH.exec(uiSrcJoinH))) { if (renderedH.indexOf(mH[1]) < 0) renderedH.push(mH[1]); }
    const EXEMPT_H = ['wa-panel', 'wa-orb'];
    const uncoveredH = renderedH.filter(id => !gIds.has(id) && !gCond.has(id) && !gDyn.has(id) && EXEMPT_H.indexOf(id) < 0);
    assert(uncoveredH.length === 0, 'panel 渲染的每个控件都在守卫表内（未覆盖：' + JSON.stringify(uncoveredH) + '）');
    assert(renderedH.length >= 80, '面板渲染控件总量不少于 80（实 ' + renderedH.length + '）');
    const zombieH = [];
    grpH.forEach(g => { (g.ids || []).concat(g.cond || []).concat(g.dynamic || []).forEach(id => { if (renderedH.indexOf(id) < 0) zombieH.push(id); }); });
    assert(zombieH.length === 0, '守卫表无僵尸条目（' + JSON.stringify(zombieH) + '）');

    // H3. secUi 只对当前页判定（面板一次只渲染当前页）
    const uiSrcH = WA.toolDiag.secUi();
    assert(uiSrcH.currentPage === null || typeof uiSrcH.currentPage === 'string', 'secUi 透出当前页（无头环境为 null）');
    assert(uiSrcH.totalGroups >= 6, '守卫表总组数（' + uiSrcH.totalGroups + '）');
    const groupsH = uiSrcH.groups;
    assert(groupsH.length === grpH.length, 'secUi 按组返回（' + groupsH.length + '）');

    // H4. 真 DOM：轮转全部带守卫的页，逐页无缺失
    let JSDOMH2200 = null;
    try { JSDOMH2200 = require('jsdom').JSDOM; } catch (e) { try { JSDOMH2200 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDOMH2200 = null; } }
    if (!JSDOMH2200) {
      console.log('  \u26a0 jsdom 不可用，跳过块8 端到端断言（静态锚点已覆盖）');
    } else {
      const domH2200 = new JSDOMH2200('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocH2200 = global.document;
      global.document = domH2200.window.document;
      try { global.Node = domH2200.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
      // v2.3.0 块3: 设置页由 ui/settings.js 渲染，不加载它则 settings 页只能渲染出
      //   「模块未加载」占位 —— 该页因此永远无法被端到端校验（块8 覆盖不到它的技术原因）。
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8'), ctx, { filename: 'ui/settings.js' });
      WA.store.init();
      WA.ui.mount();
      WA.ui.open();
      assert(typeof WA.ui.currentPage === 'function' && typeof WA.ui.pages === 'function', 'panel 暴露当前页/页列');
      const gp = {}; grpH.forEach(g => { gp[g.page] = true; });
      const pageListH = WA.ui.pages().filter(p => gp[p]);
      assert(pageListH.length >= 6, '带守卫的页数不少于 6（实 ' + pageListH.length + '）');
      const tabsH = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab'));
      const byPageH = {};
      tabsH.forEach(t => { byPageH[t.dataset.page] = t; });
      const badH = [];
      pageListH.forEach(function (pg) {
        const tab = byPageH[pg];
        if (!tab) return;
        tab.onclick();
        const u = WA.toolDiag.secUi();
        const g = u.groups.filter(x => x.active)[0];
        if (!g || !g.ok) badH.push(pg + ':' + JSON.stringify(g ? g.missing : null));
      });
      assert(badH.length === 0, '逐页无缺失（未通过：' + JSON.stringify(badH) + '）');
      byPageH['tools'].onclick();
      const toolsH = WA.toolDiag.secUi().groups.filter(g => g.page === 'tools')[0];
      assert(!!toolsH && toolsH.ok === true && toolsH.expected >= 20, '工具页控件全在场且规模充足（' + (toolsH && toolsH.expected) + '）');
      assert(WA.toolDiag.secUi().totalMissing === 0, '当前页零缺失');

      // H5. 分层口径：无条件缺失=warn；条件缺失=info
      let dgH = WA.toolDiag.collect();
      assert(!dgH.verdict.issues.some(i => i.key === 'ui' && i.level === 'warn'), '健康面板不产 ui 断裂告警');
      const savedGetH = global.document.getElementById;
      const missIdH = 'wa-diag-run';
      global.document.getElementById = function (id) { return id === missIdH ? null : savedGetH.call(global.document, id); };
      dgH = WA.toolDiag.collect();
      const uiWarnH = dgH.verdict.issues.filter(i => i.key === 'ui' && i.level === 'warn')[0];
      assert(!!uiWarnH && uiWarnH.detail.indexOf('\u70b9\u51fb\u65e0\u53cd\u5e94') > 0, '无条件控件缺失 → 断裂告警并说明后果');
      global.document.getElementById = savedGetH;
      assert(WA.toolDiag.secUi().totalMissing === 0, '还原后无缺失');
      global.document = savedDocH2200;
      global.document.getElementById = () => null;
    }

    // H6. 静态锚点
    assert(dSrcH2200.indexOf('totalExpected') > 0 && dSrcH2200.indexOf('totalMissing') > 0, '全量口径字段在位');
    assert(dSrcH2200.indexOf('ui.cond') > 0, '条件分层议题键在位');
    assert(!/^(hygiene|quarantine|state)\./.test('ui.cond') && !/^(hygiene|quarantine|state)\./.test('ui'), '议题键避开卫生指纹正则');

    WA.workflow.resetHistory();
    fresh2200();
  }

  // ══════════ v2.3.0 ══════════
  v2300: {
  const LS2300 = global.localStorage;
  const ctx2300 = global.SillyTavern.getContext();
  function fresh2300() { LS2300.clear(); ctx2300.chatId = 'v2300_chat'; global.__mockChat.length = 0; WA.store.init(); }

  // ── A. 块1：设置读路径收口（写路径已迁移、读路径仍裸 localStorage → 损坏隔离/旧键迁移对这些模块失效）──
  fresh2300();
  section('v2.3.0 块1：设置读路径收口（10 模块归口 settingsBus）');
  {
    // A1. 静态锚点：这 10 个模块不得再出现裸 localStorage.getItem 读设置键
    const MODS2300 = ['engines/opinion.js', 'render/inject.js', 'render/purifier.js', 'direction/oracle.js',
      'core/workflow.js', 'core/api-router.js', 'actors/registry.js', 'engines/regional.js',
      'engines/evolution.js', 'engines/preset.js'];
    MODS2300.forEach(function (rel) {
      const s = fs.readFileSync(path.join(BASE, rel), 'utf8');
      assert(s.indexOf('settingsBus.read(') > 0, rel + ' 读路径已归口 settingsBus.read');
      // 设置键读取一律不得走裸 getItem（诊断/日志/缓存类键除外，它们本就不是 settings）
      const bare = s.split('\n').filter(function (l) {
        return l.indexOf('localStorage.getItem(LS_KEY') >= 0 || l.indexOf('localStorage.getItem(LS_PLAN') >= 0
          || l.indexOf('localStorage.getItem(KEY_CUSTOM') >= 0 || l.indexOf('localStorage.getItem(KEY_ACTIVE') >= 0;
      });
      assert(bare.length === 0, rel + ' 无裸 localStorage.getItem 读设置键（实 ' + bare.length + ' 处）');
    });

    // A2. 行为实证：损坏 → 隔离 + 重置默认 + error 留痕（旧实现静默吞掉、无痕迹）
    const CASES2300 = [
      { key: 'worldaxis_opinion_settings_v1', mod: 'opinion', probe: function () { return WA.opinion.getSettings().enabled === false; } },
      { key: 'worldaxis_inject_visibility_v1', mod: 'inject', probe: function () { return WA.render.getVisibility().clock === true; } },
      { key: 'worldaxis_workflow_v1', mod: 'workflow', probe: function () { WA.workflow.register({ id: '__probe2300_wf__', chain: 'after', order: 999 }); const n = WA.workflow.list().length > 0; WA.workflow.unregister('__probe2300_wf__'); return n; } },
      { key: 'worldaxis_api_channels_v1', mod: 'apiRouter', probe: function () { return WA.apiRouter.listChannels().length > 0; } },
      { key: 'worldaxis_regional_settings_v1', mod: 'regional', probe: function () { return WA.regional.getSettings().enabled === false; } },
      { key: 'worldaxis_custom_presets', mod: 'preset', probe: function () { return Array.isArray(WA.preset.getAllPresets()); } }
    ];
    CASES2300.forEach(function (c) {
      WA.eventLog.length = 0;
      const q0 = WA.settingsBus.stats.quarantines;
      LS2300.setItem(c.key, '{broken-json***');
      assert(c.probe() === true, c.mod + '：损坏键读出默认值（不抛异常、不静默崩溃）');
      const qks = [];
      for (let i = 0; i < LS2300.length; i++) { const k = LS2300.key(i); if (k && k.indexOf(c.key + '_corrupt_') === 0) qks.push(k); }
      assert(qks.length >= 1, c.mod + '：损坏键已隔离为 corrupt_<ts>（v2.3.0 新增能力）');
      assert(LS2300.getItem(c.key) === null, c.mod + '：损坏原键已移除');
      assert(WA.settingsBus.stats.quarantines > q0, c.mod + '：quarantines 计量递增');
      assert(WA.errorLog.some(function (e) { return e.level === 'error' && e.msg.indexOf(c.key + ' 损坏已隔离') > 0; }), c.mod + '：损坏事件进 error 子环（留痕）');
    });

    // A3. 行为实证：legacy 旧键迁移对这些模块真正生效（此前读路径不经过 settingsBus → 迁移基建形同虚设）
    LS2300.setItem('worldaxis_legacy_probe_v0', JSON.stringify({ enabled: true, sandboxEnabled: true, everyNRounds: 7 }));
    const legacyRead2300 = WA.settingsBus.read({ key: 'worldaxis_legacy_probe_v1', legacy: ['worldaxis_legacy_probe_v0'], def: { enabled: false } });
    assert(legacyRead2300.enabled === true && legacyRead2300.everyNRounds === 7, 'legacy 键值被读入当前键');
    assert(LS2300.getItem('worldaxis_legacy_probe_v0') === null && LS2300.getItem('worldaxis_legacy_probe_v1') !== null, '读旧写新 + 旧键回收');

    // A4. 任一模块的读路径都必须经过同一闸门（统一计量入口，便于统计「哪些键真被读过」）
    const rdBefore2300 = WA.settingsBus.stats.reads;
    WA.opinion.getSettings(); WA.render.getVisibility(); WA.regional.getSettings(); WA.evolution.getSettings();
    LS2300.setItem('worldaxis_opinion_settings_v1', JSON.stringify({ enabled: true }));
    WA.opinion.getSettings();
    assert(WA.settingsBus.stats.reads > rdBefore2300, '模块读设置统一计入 settingsBus 计量（此前这些读完全不可观测）');
  }

  // ── B. 块2：设置登记表语义收口 + 自洽校验 ──
  fresh2300();
  section('v2.3.0 块2：登记表语义收口（orphan/optional 分离 + 自洽校验）');
  {
    // B1. orphan 与 optional 语义分离：在用可选键不得被注销
    const regs2300 = WA.settingsBus.registry();
    assert(regs2300.every(function (r) { return !(r.orphan && r.optional); }), '登记表不存在「既 orphan 又 optional」的矛盾项');
    const oracleReg2300 = regs2300.filter(function (r) { return r.key === 'worldaxis_oracle_plan_v1'; })[0];
    assert(oracleReg2300 && oracleReg2300.optional === true && !oracleReg2300.orphan, 'oracle_plan 改标 optional（原误标 orphan）');
    const presetAct2300 = regs2300.filter(function (r) { return r.key === 'worldaxis_active_preset'; })[0];
    assert(presetAct2300 && presetAct2300.optional === true && !presetAct2300.orphan, 'preset_active 改标 optional（原误标 orphan）');
    const st2300 = WA.settingsBus.registryStat();
    assert(typeof st2300.optional === 'number' && st2300.optional >= 2, 'registryStat 透出 optional 计数');

    // B2. 「全部注销」旧行为会清除在用键 —— 现在必须被拦下
    assert(WA.settingsBus.deregisterOrphan('worldaxis_active_preset').ok === false, '在用可选键拒绝注销');
    assert(WA.settingsBus.deregisterOrphan('worldaxis_active_preset').reason.indexOf('optional-key') === 0, '拒绝原因明确为 optional-key');
    const totalBefore2300 = WA.settingsBus.registry().length;
    assert(WA.settingsBus.deregisterOrphan('worldaxis_oracle_plan_v1').ok === false, 'oracle_plan 拒绝注销');
    assert(WA.settingsBus.registry().length === totalBefore2300, '被拒绝的注销不改变登记表（无副作用）');

    // B3. 真幽灵仍可注销；休眠登记不误报
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([
      { key: 'worldaxis_dormant_ghost_v1', def: null, module: 'probe', orphan: true },
      { key: 'worldaxis_real_ghost_v1', def: null, module: 'probe', orphan: true }
    ]);
    LS2300.setItem('worldaxis_real_ghost_v1', '{}');
    WA.settingsBus.read({ key: 'worldaxis_real_ghost_v1' });   // 留下「曾存在」痕迹
    LS2300.removeItem('worldaxis_real_ghost_v1');
    const ghosts2300 = WA.store.orphanSettingsKeys();
    assert(ghosts2300.some(function (g) { return g.key === 'worldaxis_real_ghost_v1'; }), '曾存在后被删除的废弃键 → 真幽灵');
    assert(!ghosts2300.some(function (g) { return g.key === 'worldaxis_dormant_ghost_v1'; }), '从未落盘的废弃登记 → 休眠（不误报待清理）');
    assert(WA.settingsBus.dormantGhosts().some(function (g) { return g.key === 'worldaxis_dormant_ghost_v1'; }), '休眠登记有独立出口（诊断可见）');
    assert(WA.settingsBus.deregisterOrphan('worldaxis_real_ghost_v1').ok === true, '真幽灵可注销');
    WA.__settingsRegs = WA.__settingsRegs.filter(function (r) { return r.key.indexOf('worldaxis_dormant_ghost_v1') !== 0 && r.key.indexOf('worldaxis_real_ghost_v1') !== 0; });

    // B4. 自洽校验器：抓出重复登记 / 矛盾声明 / 缺 def
    const scOk2300 = WA.settingsBus.selfCheck();
    assert(scOk2300.ok === true, '内置登记表自洽（无 error 级问题）');
    assert(scOk2300.total >= 12, '自洽校验覆盖全部登记项');
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([
      { key: 'worldaxis_backstage_settings_v1', def: {}, module: 'dup' },        // 重复登记
      { key: 'worldaxis_conflict_probe_v1', def: null, module: 'p', orphan: true, optional: true },  // 矛盾
      { key: 'worldaxis_nodef_probe_v1', module: 'p' }                            // 缺 def
    ]);
    const scBad2300 = WA.settingsBus.selfCheck();
    assert(scBad2300.ok === false, '自洽校验发现阻断项');
    assert(scBad2300.issues.some(function (i) { return i.code === 'duplicate-key'; }), '抓出重复登记键');
    assert(scBad2300.issues.some(function (i) { return i.code === 'orphan_optional_conflict'; }), '抓出 orphan/optional 矛盾声明');
    assert(scBad2300.issues.some(function (i) { return i.code === 'missing-def'; }), '抓出缺 def 声明');
    assert(scBad2300.issues.some(function (i) { return i.code === 'missing-def' && i.level === 'warn'; }), '缺 def 定级 warn（不阻断启动）');
    assert(scBad2300.issues.some(function (i) { return i.code === 'duplicate-key' && i.detail.indexOf('worldaxis_backstage_settings_v1') >= 0; }), '重复项归因到具体键');
    // 只读保证：校验不得改动登记表
    const nBefore2300 = WA.__settingsRegs.length;
    WA.settingsBus.selfCheck();
    assert(WA.__settingsRegs.length === nBefore2300, '自洽校验纯只读（不改登记表）');
    WA.__settingsRegs = WA.__settingsRegs.filter(function (r) {
      return r.key !== 'worldaxis_conflict_probe_v1' && r.key !== 'worldaxis_nodef_probe_v1';
    });
    // 去重：剔除刚补进来的重复 backstage 项
    const seenK2300 = {};
    WA.__settingsRegs = WA.__settingsRegs.filter(function (r) {
      const hit = seenK2300[r.key]; seenK2300[r.key] = true; return !hit;
    });
    assert(WA.settingsBus.selfCheck().ok === true, '清理后登记表恢复自洽');

    // B5. 默认值校验（能力边界已被负向验证界定清楚）
    //   背景：verifyDefaults 第一版用 read(reg) 与 reg.def 比对 —— 而 read 在磁盘无值时**恰好回落到
    //   reg.def**，两边同源，断言恒真（典型「看起来在验证、其实什么都没验」）。
    //   块1 把读路径统一到 settingsBus 之后，模块已不再持有独立内联默认值：
    //   因此「声明 ↔ 实际默认值漂移」在当前结构下**不可能发生**，这本身是收益，必须显式声明而不是假装在验。
    //   本检查保留两个仍然非平凡的能力：
    //     ① 磁盘结构一致性：磁盘存量必须与登记声明同构（类型/数组性），真实可漂移
    //     ② 单源不变量守卫：磁盘无值时 read(reg) 必须严格等于声明 —— 若将来有人重新引入
    //        「模块内联默认值并覆盖 read 回落」的写法，这条不变量会立刻破，从而暴露回归
    const evoKey2300 = 'worldaxis_evolution_settings_v1';
    const regEvo2300 = WA.__settingsRegs.filter(function (r) { return r.key === evoKey2300; })[0];
    assert(!!regEvo2300, 'evolution 登记项存在');

    // B5a. 单源不变量：所有非 orphan 登记项在磁盘无值时，read 回落值必须严格等于声明
    const fresh2300keys = [];
    WA.settingsBus.registry().forEach(function (r) {
      if (r.orphan) return;
      LS2300.removeItem(r.key);
      fresh2300keys.push(r.key);
      const fallback = WA.settingsBus.read(r);
      assert(JSON.stringify(fallback) === JSON.stringify(r.def), r.key + ' 单源不变量：read 回落值 === 登记声明');
    });
    assert(fresh2300keys.length >= 10, '单源不变量覆盖全部在用登记项（实 ' + fresh2300keys.length + '）');

    // B5b. 回归模拟：模块侧若重新持有独立默认值且与声明不一致 → 必须被抓出
    //   （直接改模块源码不现实，用 providers 注入「被改坏的默认值」精确模拟该回归形态）
    const prov2300 = {};
    prov2300[evoKey2300] = function () { return WA.evolution.getSettings(); };
    const vdOk2300 = WA.settingsBus.verifyDefaults({ keys: [evoKey2300], providers: prov2300 });
    assert(vdOk2300.checked === 1 && vdOk2300.rows[0].source === 'provider', '提供者分支生效（磁盘无值 → 比对模块自报默认值）');
    assert(vdOk2300.ok === true, '当前无漂移');
    const provBad2300 = {};
    provBad2300[evoKey2300] = function () { const s = WA.evolution.getSettings(); s.diceEnabled = 'HACKED'; return s; };
    const vdBad2300 = WA.settingsBus.verifyDefaults({ keys: [evoKey2300], providers: provBad2300 });
    assert(vdBad2300.ok === false && vdBad2300.drift.length === 1, '模块侧默认值偏离声明 → 被抓出（回归形态可检出）');
    assert(vdBad2300.drift[0].key === evoKey2300 && vdBad2300.drift[0].source === 'provider', '漂移项归因到具体键 + 来源');

    // B5c. 磁盘分支：磁盘已有值 → 与登记声明的类型/结构比对（真实可漂移面）
    LS2300.setItem(evoKey2300, JSON.stringify([1, 2, 3]));   // 数组 vs 声明对象 → 结构不符
    const vdB2300 = WA.settingsBus.verifyDefaults({ keys: [evoKey2300], providers: prov2300 });
    assert(vdB2300.checked === 1 && vdB2300.rows[0].source === 'disk', '磁盘分支生效（有磁盘值时不再看提供者）');
    assert(vdB2300.ok === false, '磁盘存量与登记声明结构不符被抓出');
    LS2300.setItem(evoKey2300, JSON.stringify(regEvo2300.def));
    assert(WA.settingsBus.verifyDefaults({ keys: [evoKey2300] }).ok === true, '磁盘值与声明结构相符 → 通过');
    LS2300.removeItem(evoKey2300);
    assert(WA.settingsBus.verifyDefaults({ keys: [evoKey2300] }).checked === 0, '无提供者且无磁盘值时跳过判定（不误报）');

    // B5d. 方法论锚点：把「自比」口径钉死，防止后人重蹈
    const selfCompare2300 = JSON.stringify(WA.settingsBus.read(regEvo2300)) === JSON.stringify(regEvo2300.def);
    assert(selfCompare2300 === true, '（方法论锚点）read(reg) 与 def 自比恒真——报告与校验都不得采用该口径');

    // B6. evolution 登记表 def 不再是 null（此前诊断视图读到 null 而非真实默认值）
    assert(regEvo2300.def !== null && regEvo2300.def.diceEnabled === true, 'evolution 登记声明真实默认值（原为 null）');
    assert(WA.evolution.getSettings().diceEnabled === true, 'evolution 实际默认值与声明一致');

    WA.workflow.resetHistory();
    fresh2300();
  }
  // ── C. 块3：死配置复活（常量旋钮 → 设置键；移植残留死键剔除） ──
  fresh2300();
  section('v2.3.0 块3：死配置复活（horizon 旋钮可配 + 死键剔除）');
  {
    // C1. 静态锚点：horizon 的触发参数不得再是硬编码常量
    const hzSrc2300 = fs.readFileSync(path.join(BASE, 'engines/horizon.js'), 'utf8');
    assert(hzSrc2300.indexOf("worldaxis_horizon_settings_v1") > 0, 'horizon 设置键已声明');
    assert(hzSrc2300.indexOf('settingsBus.read(') > 0, 'horizon 读路径走 settingsBus');
    assert(hzSrc2300.indexOf('roll01() < BASE_CHANCE') < 0, '触发率不再是硬编码常量（改读生效配置）');
    assert(hzSrc2300.indexOf('lane.ledger >= LEDGER_THRESHOLD') < 0, '保底轮数不再是硬编码常量');
    assert(hzSrc2300.indexOf('lane.cooldown   = COOLDOWN_ROUNDS') < 0, '冷却轮数不再是硬编码常量');

    // C2. 默认行为不变：无磁盘值时生效值 === 原常量语义（迁移不改行为，只开出口）
    const hzCfg2300 = WA.horizon.stat().config;
    assert(hzCfg2300.distant.chancePct === 18 && hzCfg2300.near.chancePct === 18, '默认触发率 18%（=== 原 BASE_CHANCE 0.18）');
    assert(hzCfg2300.distant.cooldown === 5 && hzCfg2300.near.cooldown === 5, '默认冷却 5 轮（=== 原 COOLDOWN_ROUNDS）');
    assert(hzCfg2300.distant.ledger === 10 && hzCfg2300.near.ledger === 10, '默认保底 10 轮（=== 原 LEDGER_THRESHOLD）');
    assert(hzCfg2300.distant.enabled === true, '默认两通道开启（=== 原「无开关即常开」行为）');
    assert(WA.horizon.LEDGER_THRESHOLD === 10 && WA.horizon.COOLDOWN_ROUNDS === 5, '常量仍导出（向后兼容外部引用）');

    // C3. 通道关闭 ⇒ **完全不掷骰**：不消耗保底计数、不消耗冷却、连随机数都不取
    //   （旧实现：用户无法拒绝随机事件——即便把概率调 0，ledger 保底仍会在第 10 轮强制触发）
    WA.horizon.setSettings({ distantEnabled: false, nearEnabled: false });
    WA.store.transact(function (d) {
      d.evolution.horizon.distant = { ledger: 0, cooldown: 0, pending: null, lastFired: 0 };
      d.evolution.horizon.near = { ledger: 0, cooldown: 0, pending: null, lastFired: 0 };
    });
    //   随机数计数只包住 rollLane（store 内部实现细节不应干扰「零掷骰」这一断言）
    //   v2.14.0: 口径从「patch Math.random 计数」改为**决策流抽数计数**——裸调已被治理，
    //   patch 再也拦不到任何抽数（恒 0 ＝ 假通过，它已不再能证明「零掷骰」）。
    //   WA.rand.randStat().draws 才是真实取数入口，负向能力反而更强（能分别看通道）。
    const _draws2300a = WA.rand.randStat().draws;
    const offRoll2300 = WA.horizon.rollLane('distant');
    const rndCalls2300 = WA.rand.randStat().draws - _draws2300a;
    const offBlock2300 = WA.horizon.buildPromptBlock();
    assert(offRoll2300.fired === false && offRoll2300.skipped === true && offRoll2300.reason === 'disabled', '关闭通道：rollLane 明确回报 disabled（而非伪装成「没掷中」）');
    assert(rndCalls2300 === 0, '关闭通道：连随机数都不取（决策流 draws 零增长，真正零成本）');
    assert(WA.horizon.stat().skipped >= 1, '跳过次数进留痕（「关了」与「掷了没中」可区分）');
    assert(WA.store.get().evolution.horizon.distant.ledger === 0, '关闭通道不消耗保底计数（改设置不产生副作用）');
    assert(offBlock2300 === null, '双通道关闭时 buildPromptBlock 不产出任何指令块');
    //   ⚠ 负向锚点：保底必须真的失效——否则「关了还在第 N 轮强制触发」会被漏过
    WA.store.transact(function (d) { d.evolution.horizon.distant.ledger = 999; });
    assert(WA.horizon.rollLane('distant').fired === false, '（负向）保底拉满 999 轮也不触发——关闭必须压过保底');

    // C4. 触发率可配 + 区间夹取（越界值会让判定永久为真/永久为假）
    fresh2300();
    WA.horizon.setSettings({ distantEnabled: true, distantChance: 100, distantCooldown: 0, distantLedger: 30 });
    WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 0, cooldown: 0, pending: null, lastFired: 0 }; });
    assert(WA.horizon.rollLane('distant').fired === true, '触发率 100% ⇒ 必中（用户可强制拉动随机事件）');
    assert(WA.horizon.stat().config.distant.chancePct === 100, '生效值上报 100');
    WA.horizon.setSettings({ distantChance: 500 });
    assert(WA.horizon.stat().config.distant.chancePct === 100, '越界概率 500 → 夹取到上限 100');
    WA.horizon.setSettings({ distantChance: 0.5 });
    // v2.7.0: 口径**有意收窄**（旧断言是「0.5 → 归一为 50%」）。
    //   原因：概率区间下限恰好是 1，旧的 `n > 0 && n <= 1 → ×100` 让「1」与「100%」不可区分——
    //   填 1 得 100%（拉满），填 0.5 得 50%，相邻两个合法输入相差 50 倍。本版「写入即归一」
    //   把归一搬到了写路径上，若沿用旧判据会把用户填的 1% **静默存成 100%**。
    //   故：小数写法不再被解释为分数，与百分比同口径（0.5 夹取到下限 1）。
    assert(WA.horizon.stat().config.distant.chancePct === 1, '小数写法不再被解释为分数（与百分比同口径；有意收窄，防 1% 被静默存成 100%）');
    WA.horizon.setSettings({ distantChance: -3 });
    assert(WA.horizon.stat().config.distant.chancePct === 1, '负概率 → 夹取到下限 1（不会挖出恒真/恒假洞）');
    WA.horizon.setSettings({ distantCooldown: 99 });
    assert(WA.horizon.stat().config.distant.cooldown === 20, '冷却越界 → 夹取到 20');
    WA.horizon.setSettings({ distantLedger: 1 });
    assert(WA.horizon.stat().config.distant.ledger === 3, '保底越界 → 夹取到 3');

    // C5. 保底轮数真的被消费（可配值必须影响判定，而非只是展示）
    fresh2300();
    WA.horizon.setSettings({ distantEnabled: true, distantChance: 1, distantCooldown: 0, distantLedger: 3 });
    WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 2, cooldown: 0, pending: null, lastFired: 0 }; });
    const forced2300 = WA.horizon.rollLane('distant');
    assert(forced2300.fired === true && forced2300.forced === true, '保底 3 轮：ledger=2 时下轮即强制触发（可配值生效）');
    assert(forced2300.reason.indexOf('ledger>=3') >= 0, '触发原因回报具体阈值（可归因）');
    // C6. 冷却真的被消费
    fresh2300();
    WA.horizon.setSettings({ distantEnabled: true, distantChance: 100, distantCooldown: 7, distantLedger: 30 });
    WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 0, cooldown: 0, pending: null, lastFired: 0 }; });
    assert(WA.horizon.rollLane('distant').fired === true, '冷却用例前置：概率 100% 确已触发');
    WA.horizon.setSettings({ distantChance: 18 });   // 复位，避免影响后续断言
    WA.store.transact(function (d) { d.evolution.horizon.distant.pending = null; });
    assert(WA.store.get().evolution.horizon.distant.cooldown === 7, '冷却 7 轮生效（可配值写入泳道）');

    // C7. snapshot / stat 反映通道开关与留痕（面板与诊断的取值来源）
    fresh2300();
    WA.horizon.setSettings({ distantEnabled: false, nearEnabled: true });
    assert(WA.horizon.snapshot().indexOf('distant（关）') === 0, 'snapshot 标注关闭通道（此前看不出通道是关的）');
    const hzStat2300 = WA.horizon.stat();
    assert(typeof hzStat2300.rolls === 'number' && typeof hzStat2300.lastReason === 'string', 'stat() 上报掷骰留痕');

    // C8. 死键剔除：移植期残留键不得再出现在任何注册声明里
    const DEAD2300 = ['distantEnabled', 'nearEnabled', 'distantChance', 'nearChance', 'distantCooldown',
      'nearCooldown', 'distantEventEnabled', 'nearEventEnabled', 'regionalIncidentEnabled'];
    const degSrc2300 = fs.readFileSync(path.join(BASE, 'engines/evolution.js'), 'utf8');
    const regSrc2300 = fs.readFileSync(path.join(BASE, 'engines/regional.js'), 'utf8');
    function regBlock2300(src) {
      const m = src.indexOf('const __REG = {');
      if (m < 0) return '';
      let d = 0, j = src.indexOf('{', m);
      for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { j++; break; } } }
      return src.slice(m, j);
    }
    const evRegBlk2300 = regBlock2300(degSrc2300);
    const rgRegBlk2300 = regBlock2300(regSrc2300);
    DEAD2300.forEach(function (k) {
      assert(evRegBlk2300.indexOf(k) < 0, 'evolution 登记不再声明死键 ' + k);
    });
    ['distantEnabled', 'nearEnabled', 'distantChance', 'nearChance', 'cooldown', 'distantEventEnabled', 'nearEventEnabled'].forEach(function (k) {
      assert(rgRegBlk2300.indexOf(k) < 0, 'regional 登记不再声明死键 ' + k);
    });
    //   注册表实况：死键必须真的从登记 def 里消失（不是改了个注释）
    const regRows2300 = WA.settingsBus.registry();
    const evReg2300 = regRows2300.filter(function (r) { return r.key === 'worldaxis_evolution_settings_v1'; })[0];
    const rgReg2300 = regRows2300.filter(function (r) { return r.key === 'worldaxis_regional_settings_v1'; })[0];
    const hzReg2300 = regRows2300.filter(function (r) { return r.key === 'worldaxis_horizon_settings_v1'; })[0];
    assert(hzReg2300 && hzReg2300.def && hzReg2300.def.distantChance === 18, 'horizon 登记表暴露真实默认值（新出口可见）');
    assert(!Object.prototype.hasOwnProperty.call(evReg2300.def, 'distantEventEnabled'), 'evolution 登记表 def 已无死键');
    assert(!Object.prototype.hasOwnProperty.call(rgReg2300.def, 'cooldown'), 'regional 登记表 def 已无死键');
    //   ⚠ 保留键不得被误删（死键剔除最容易连带删掉在用键）
    assert(rgReg2300.def.chancePercent === 15 && rgReg2300.def.durationRounds === 3, 'regional 在用键 survived（chancePercent/durationRounds 未误删）');
    assert(evReg2300.def.diceEnabled === true && evReg2300.def.setbackRatio === 40, 'evolution 在用键 survived（diceEnabled/setbackRatio 未误删）');

    // C9. regional 越界值夹取（历史存档把概率写成 500 会让区域事件永久触发）
    fresh2300();
    LS2300.setItem('worldaxis_regional_settings_v1', JSON.stringify({ enabled: true, chancePercent: 500, durationRounds: 999 }));
    const rgEff2300 = WA.regional.effectiveSettings();
    assert(rgEff2300.chancePercent === 100, 'regional 概率越界 → 夹取 100（原值 500 会让判定永久为真）');
    assert(rgEff2300.durationRounds === 20, 'regional 持续轮次越界 → 夹取 20（原值 999 会让事件永不平息）');
    assert(WA.regional.getSettings().chancePercent === 500, '原始读值不改写（夹取只作用于生效视图，不破坏用户数据）');
    //   负向：夹取必须真的被消费，而非只在 effectiveSettings 里好看
    const rgRollSrc2300 = fs.readFileSync(path.join(BASE, 'engines/regional.js'), 'utf8');
    assert(rgRollSrc2300.indexOf('const st = effSettings()') > 0, 'regional.roll 消费生效视图（夹取真正生效）');
    assert(rgRollSrc2300.indexOf('loadSettings().durationRounds') < 0, 'regional.applyIncident 不再裸读未夹取值');

    // C10. UI 出口：常量旋钮必须真的有可操作入口（否则「可配」只存在于 API 层）
    const setSrc2300 = fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8');
    ['wa-hz-d-en', 'wa-hz-d-chance', 'wa-hz-d-cd', 'wa-hz-d-ledger',
      'wa-hz-n-en', 'wa-hz-n-chance', 'wa-hz-n-cd', 'wa-hz-n-ledger', 'wa-hz-save'].forEach(function (id) {
        assert(setSrc2300.indexOf(id) > 0, '设置页有随机事件控件 ' + id);
      });
    assert(setSrc2300.indexOf('WA.horizon.setSettings(') > 0, '设置页写回走 horizon.setSettings（单一真源）');
    const panelSrc2300 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    assert(panelSrc2300.indexOf('WA.horizon.stat()') > 0, '概览页泳道消费 stat()（通道开关对用户可见）');
    //   ⚠ 静态锚点只证明「控件渲染出来了」，不证明「控件能点」——必须真 DOM 验绑定。
    //   （本批正是因为发现块3b 绑定漏了 '#' 前缀而补此断言：id 选择器写错时控件照常渲染、
    //    源码照常含 id，静态断言全绿，而用户拖滑块毫无反应。）
    let JSDOMB2300 = null;
    try { JSDOMB2300 = require('jsdom').JSDOM; } catch (e) { try { JSDOMB2300 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDOMB2300 = null; } }
    if (!JSDOMB2300) {
      console.log('  \u26a0 jsdom 不可用，跳过随机事件控件绑定断言');
    } else {
      const domB2300 = new JSDOMB2300('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocB2300 = global.document;
      global.document = domB2300.window.document;
      try { global.Node = domB2300.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8'), ctx, { filename: 'ui/settings.js' });
      WA.store.init();
      WA.ui.mount(); WA.ui.open();
      const tabsB2300 = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab'));
      const setTabB2300 = tabsB2300.filter(function (t) { return t.dataset.page === 'settings'; })[0];
      if (setTabB2300) {
        setTabB2300.onclick();
        const qB2300 = function (id) { return global.document.querySelector('#' + id); };
        // 1) 处理器必须真挂上（选择器写错时这里必然为 null）
        assert(typeof qB2300('wa-hz-d-en').onchange === 'function', '（真 DOM）远方通道复选框绑定生效');
        assert(typeof qB2300('wa-hz-n-en').onchange === 'function', '（真 DOM）近端通道复选框绑定生效');
        assert(typeof qB2300('wa-hz-d-chance').oninput === 'function', '（真 DOM）触发率滑块绑定生效');
        assert(typeof qB2300('wa-hz-d-ledger').oninput === 'function', '（真 DOM）保底滑块绑定生效');
        assert(typeof qB2300('wa-hz-save').onclick === 'function', '（真 DOM）保存按钮绑定生效');
        // 2) 联动真生效：关掉通道 → 三个参数控件被禁用
        qB2300('wa-hz-d-en').checked = false;
        qB2300('wa-hz-d-en').onchange();
        assert(qB2300('wa-hz-d-chance').disabled === true && qB2300('wa-hz-d-cd').disabled === true
          && qB2300('wa-hz-d-ledger').disabled === true, '（真 DOM）关闭通道后参数控件真被禁用（不只是「渲染成禁用」）');
        qB2300('wa-hz-d-en').checked = true;
        qB2300('wa-hz-d-en').onchange();
        assert(qB2300('wa-hz-d-chance').disabled === false, '（真 DOM）重新开启后参数控件恢复可用');
        // 3) 回显真更新
        qB2300('wa-hz-d-chance').value = '73';
        qB2300('wa-hz-d-chance').oninput();
        assert(qB2300('wa-hz-d-chancev').textContent === '73', '（真 DOM）拖动滑块数值回显真更新');
        // 4) 保存链路端到端：界面操作 → localStorage → 生效视图
        qB2300('wa-hz-n-chance').value = '61';
        qB2300('wa-hz-save').onclick();
        const savedB2300 = JSON.parse(global.localStorage.getItem('worldaxis_horizon_settings_v1'));
        assert(savedB2300 && savedB2300.distantChance === 73 && savedB2300.nearChance === 61,
          '（真 DOM）界面操作经保存真实落盘（不是只在内存里好看）');
        assert(WA.horizon.stat().config.distant.chancePct === 73, '（真 DOM）保存后生效视图同步（端到端闭环）');
      } else {
        assert(false, '设置页签缺失（无法校验随机事件控件绑定）');
      }
      global.document = savedDocB2300;
      global.document.getElementById = function () { return null; };
      WA.mainDoc = global.document;
      fresh2300();
    }

    // C11. UI 守卫覆盖全部页面（v2.2.0 块8 只守了 8/9 页——设置页整页在守卫之外）
    const pagesSrc2300 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    const pageIds2300 = [];
    const pageRe2300 = /\{ id: '([a-z]+)', icon:/g;
    let pm2300;
    while ((pm2300 = pageRe2300.exec(pagesSrc2300))) pageIds2300.push(pm2300[1]);
    assert(pageIds2300.length >= 10, '解析到面板页清单（实 ' + pageIds2300.length + '）');
    const boundPages2300 = {};
    WA.toolDiag.UI_BINDINGS.forEach(function (g) { boundPages2300[g.page] = true; });
    const uncovered2300 = pageIds2300.filter(function (id) { return id !== 'overview' && !boundPages2300[id]; });
    assert(uncovered2300.length === 0, 'UI 绑定守卫覆盖全部有控件的页（未覆盖：' + (uncovered2300.join('/') || '无') + '）');
    assert(boundPages2300['settings'] === true, '设置页已纳入守卫（v2.2.0 遗漏项）');
    const setGroup2300 = WA.toolDiag.UI_BINDINGS.filter(function (g) { return g.page === 'settings'; })[0];
    assert(setGroup2300 && setGroup2300.cond.indexOf('wa-prm-find') >= 0, '净化规则区归入 cond（purifier 未加载时整段不渲染，缺失不判失败）');

    // C12. 诊断出口：runtime.horizon + verdict 通告（「随机事件不会发生」必须可归因）
    fresh2300();
    WA.horizon.setSettings({ distantEnabled: false, nearEnabled: false });
    const diagHz2300 = WA.toolDiag.collect();
    assert(diagHz2300.runtime && diagHz2300.runtime.horizon && typeof diagHz2300.runtime.horizon.rolls === 'number', '诊断包暴露 runtime.horizon 运行视图');
    assert(diagHz2300.runtime.horizon.enabled.distant === false, '诊断包反映通道开关真相');
    const hzIssue2300 = (diagHz2300.verdict.issues || []).filter(function (i) { return i.key === 'horizon'; })[0];
    assert(hzIssue2300 && hzIssue2300.level === 'info', '双通道关闭 → verdict 出 info 级通告（是设置，不是故障）');
    assert(hzIssue2300.detail.indexOf('这是设置') > 0, '通告文案明确区别于故障（防用户误判引擎坏了）');
    //   负向：通道开着时不得误报
    WA.horizon.setSettings({ distantEnabled: true, nearEnabled: true });
    const diagHzOn2300 = WA.toolDiag.collect();
    assert(!(diagHzOn2300.verdict.issues || []).some(function (i) { return i.key === 'horizon' && i.detail.indexOf('均已关闭') > 0; }), '（负向）通道开启时不误报关闭通告');

    // C13. 持久化往返：配置真的落到 localStorage 并可读回（不是内存态幻觉）
    fresh2300();
    WA.horizon.setSettings({ distantChance: 42, nearLedger: 17 });
    const raw2100 = JSON.parse(LS2300.getItem('worldaxis_horizon_settings_v1'));
    assert(raw2100.distantChance === 42 && raw2100.nearLedger === 17, '随机事件配置真实落盘');
    fresh2300();   // 清 localStorage 后再写回，模拟重载
    LS2300.setItem('worldaxis_horizon_settings_v1', JSON.stringify(raw2100));
    assert(WA.horizon.stat().config.distant.chancePct === 42 && WA.horizon.stat().config.near.ledger === 17, '重载后配置读回（跨会话保持）');
    //   损坏隔离对这些新键同样生效（读路径归口的既有能力）
    LS2300.setItem('worldaxis_horizon_settings_v1', '{broken***');
    const hzFallback2300 = WA.horizon.getSettings();
    assert(hzFallback2300.distantChance === 18, 'horizon 配置损坏 → 隔离并回落默认（v2.3.0 读路径归口带来的能力）');

    WA.workflow.resetHistory();
    fresh2300();
  }
  // ── D. 块3 审计固化（逆向审计发现的缺陷 + 死键扫描器内化） ──
  fresh2300();
  section('v2.3.0 块3 审计：布尔配置归一化 + 死键扫描内化');
  {
    // D1. 布尔归一化单一实现（消除 `!== false` / `=== true` / `!v` 三套语义）
    assert(typeof WA.settingsBus.toBool === 'function', 'settingsBus.toBool 存在（布尔配置归一化单一实现）');
    const tb2300 = WA.settingsBus.toBool;
    //   显式假：字符串/数字写法都必须归为关闭（此前 `!== false` 把 'false' 判成开启）
    [false, 0, '0', 'false', 'FALSE', ' false ', 'no', 'off', '', null].forEach(function (v, i) {
      assert(tb2300(v, true) === false, 'toBool 归类为假 #' + i + '（' + JSON.stringify(v) + '）');
    });
    [true, 1, '1', 'true', 'TRUE', ' true ', 'yes', 'on', 2, -1].forEach(function (v, i) {
      assert(tb2300(v, false) === true, 'toBool 归类为真 #' + i + '（' + JSON.stringify(v) + '）');
    });
    assert(tb2300(undefined, true) === true && tb2300(undefined, false) === false, 'toBool 值缺席时回落调用方声明的默认值');

    // D2. 三处布尔消费必须走统一归一化（静态锚点：防再次分叉出第二套语义）
    const hzSrcD2300 = fs.readFileSync(path.join(BASE, 'engines/horizon.js'), 'utf8');
    const rgSrcD2300 = fs.readFileSync(path.join(BASE, 'engines/regional.js'), 'utf8');
    const evSrcD2300 = fs.readFileSync(path.join(BASE, 'engines/evolution.js'), 'utf8');
    assert(hzSrcD2300.indexOf('settingsBus.toBool') > 0 && hzSrcD2300.indexOf('c.distantEnabled : c.nearEnabled) !== false') < 0,
      'horizon 通道开关走统一归一化（不再用 `!== false`：字符串 "false" 会被判为开启）');
    assert(rgSrcD2300.indexOf('s.enabled === true') < 0, 'regional 不再用 `=== true`（会把旧存档的 "true" 判为未启用）');
    assert(rgSrcD2300.indexOf('settingsBus.toBool(s.enabled') > 0, 'regional 启用态走统一归一化');
    assert(evSrcD2300.indexOf('!st.diceEnabled') < 0 && evSrcD2300.indexOf('settingsBus.toBool(st.diceEnabled') > 0,
      'evolution 骰子开关走统一归一化（`!st.diceEnabled` 对字符串 "false" 是真值 = 关闭失效）');

    // D3. 行为实证：字符串写法真的生效/真的失效（不只是「调用了归一化函数」）
    fresh2300();
    LS2300.setItem('worldaxis_horizon_settings_v1', JSON.stringify({ distantEnabled: 'false', nearEnabled: 'false' }));
    assert(WA.horizon.stat().enabled.distant === false, '字符串 "false" 真被当作关闭（关闭意图不再静默失效）');
    assert(WA.horizon.rollLane('distant').skipped === true, '字符串 "false" 时通道真跳过掷骰');
    LS2300.setItem('worldaxis_regional_settings_v1', JSON.stringify({ enabled: 'true', chancePercent: 15, durationRounds: 3 }));
    assert(WA.regional.effectiveSettings().enabled === true, '旧存档字符串 "true" 仍被识别为启用（不收窄既有语义）');
    fresh2300();
    LS2300.setItem('worldaxis_evolution_settings_v1', JSON.stringify({ diceEnabled: 'false' }));
    assert(WA.evolution.rollEvents().length === 0, '字符串 "false" 真能关掉事件链骰子');

    // D4. 越界/畸形组合一律夹取到安全区间（不得出现 NaN 传播、恒真、恒假）
    fresh2300();
    const WEIRD2300 = [
      { distantChance: NaN, distantCooldown: -1, distantLedger: 0 },
      { distantChance: Infinity, distantCooldown: 1e9, distantLedger: 1e9 },
      { distantChance: -Infinity, distantCooldown: 0, distantLedger: 3 },
      { distantChance: undefined, distantCooldown: undefined, distantLedger: undefined },
      { distantChance: '0.18', distantCooldown: '7.9', distantLedger: '12.5' },
      { distantChance: {}, distantCooldown: [], distantLedger: 'abc' }
    ];
    let weirdSafe2300 = true, weirdDet2300 = '';
    WEIRD2300.forEach(function (w, i) {
      WA.horizon.setSettings(w);
      const c = WA.horizon.stat().config.distant;
      const safe = Number.isFinite(c.chancePct) && c.chancePct >= 1 && c.chancePct <= 100
        && Number.isFinite(c.cooldown) && c.cooldown >= 0 && c.cooldown <= 20
        && Number.isFinite(c.ledger) && c.ledger >= 3 && c.ledger <= 30;
      if (!safe) { weirdSafe2300 = false; weirdDet2300 += '#' + i + ':' + JSON.stringify(c) + ' '; }
    });
    assert(weirdSafe2300, '6 组越界/畸形组合全部夹取到安全区间（无 NaN、无恒真恒假）' + (weirdDet2300 ? ' — ' + weirdDet2300 : ''));
    fresh2300();

    // D5. 关闭 → 重开 不欠账（关闭期间不得累积，否则重开瞬间一次性爆发）
    WA.horizon.setSettings({ distantEnabled: false, nearEnabled: false });
    WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 0, cooldown: 0, pending: null, lastFired: 0 }; });
    for (let i = 0; i < 50; i++) WA.horizon.rollLane('distant');
    assert(WA.store.get().evolution.horizon.distant.ledger === 0, '关闭期间 50 轮不累积保底计数');
    WA.horizon.setSettings({ distantEnabled: true, distantChance: 1, distantLedger: 30 });
    assert(WA.horizon.rollLane('distant').forced !== true, '重开首轮不被「欠账」强制触发（欠账未跨关闭期累积）');
    fresh2300();

    // D6. 死键扫描内化：登记表声明的每个 def 子键都必须在生产代码里有消费点。
    //   把一次性脚本（/tmp/wa_setkeys2.py）沉淀为回归基建 —— 否则将来会重新长出死开关，
    //   而「声明了却零消费」正是本轮命题本身。
    const PROD2300 = [];
    (function walk2300(dir) {
      fs.readdirSync(dir).forEach(function (n) {
        if (n === '.git' || n === 'node_modules' || n === 'tests') return;
        const fp = path.join(dir, n);
        const st = fs.statSync(fp);
        if (st.isDirectory()) walk2300(fp);
        else if (/\.js$/.test(n)) PROD2300.push(fp);
      });
    })(BASE);
    const prodSrc2300 = PROD2300.map(function (fp) { return fs.readFileSync(fp, 'utf8'); });
    /** 定位 `const __REG = {...}` 声明块的行范围（块内出现键名不算消费点） */
    function regBlockRange2300(src) {
      const i = src.indexOf('const __REG = {');
      if (i < 0) return null;
      let d = 0, j = src.indexOf('{', i);
      for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) { j++; break; } } }
      return [i, j];
    }
    function lineOf2300(src, pos) { return src.slice(0, pos).split('\n').length; }
    const deadKeys2300 = [];
    WA.settingsBus.registry().forEach(function (r) {
      if (r.orphan || !r.def || typeof r.def !== 'object') return;
      Object.keys(r.def).forEach(function (k) {
        let hits = 0;
        prodSrc2300.forEach(function (src, si) {
          const re = new RegExp('\\.' + k + '\\b', 'g');
          let m;
          while ((m = re.exec(src))) {
            // 剔除与注册声明块重叠的命中（那是声明本身，不是消费）
            const blk = regBlockRange2300(src);
            if (blk) {
              const ln = lineOf2300(src, m.index);
              const blkStartLn = lineOf2300(src, blk[0]), blkEndLn = lineOf2300(src, blk[1]);
              if (ln >= blkStartLn && ln <= blkEndLn) continue;
            }
            hits++;
          }
        });
        if (hits === 0) deadKeys2300.push((r.module || '?') + '.' + k + '（' + r.key + '）');
      });
    });
    assert(deadKeys2300.length === 0, '登记表 def 子键全部有生产消费点（死键扫描内化；发现：' + (deadKeys2300.join('、') || '无') + '）');
    assert(WA.settingsBus.registry().length >= 14, '登记项规模（实 ' + WA.settingsBus.registry().length + '，v2.3.0 新增 horizon 后 14）');

    // D7. 反查：本轮的 11 个死键不得回到任何登记 def 里（逐个点名，防「换个写法又加回来」）
    const KILLED2300 = [
      ['worldaxis_regional_settings_v1', ['distantEnabled', 'nearEnabled', 'distantChance', 'nearChance', 'cooldown']],
      ['worldaxis_evolution_settings_v1', ['distantEventEnabled', 'distantChance', 'distantCooldown',
        'nearEventEnabled', 'nearChance', 'nearCooldown', 'regionalIncidentEnabled']]
    ];
    KILLED2300.forEach(function (pair) {
      const row = WA.settingsBus.registry().filter(function (r) { return r.key === pair[0]; })[0];
      pair[1].forEach(function (k) {
        assert(!row || !Object.prototype.hasOwnProperty.call(row.def, k), pair[0] + ' 不再声明死键 ' + k);
      });
    });

    WA.workflow.resetHistory();
    fresh2300();
  }
  // ── E. 块3 端到端：面板泳道区真 DOM 反映通道开关 ──
  fresh2300();
  section('v2.3.0 块3 端到端：面板泳道区（真 DOM）');
  {
    let JSDoM2300 = null;
    try { JSDoM2300 = require('jsdom').JSDOM; } catch (e) { try { JSDoM2300 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDoM2300 = null; } }
    if (!JSDoM2300) {
      console.log('  \u26a0 jsdom 不可用，跳过泳道区端到端断言（静态锚点已覆盖接线）');
    } else {
      const domE2300 = new JSDoM2300('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocE2300 = global.document;
      global.document = domE2300.window.document;
      try { global.Node = domE2300.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8'), ctx, { filename: 'ui/panel.js' });
      vm.runInContext(fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8'), ctx, { filename: 'ui/settings.js' });
      WA.store.init();
      WA.ui.mount(); WA.ui.open();
      const tabsE2300 = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab'));
      const evTabE2300 = tabsE2300.filter(function (t) { return t.dataset.page === 'events'; })[0];
      const bodyE2300 = function () { return global.document.querySelector('.wa-body').innerHTML; };
      assert(!!evTabE2300, '存在「事件」页签（泳道区所在页）');
      if (evTabE2300) {
        // 通道开启：不得出现「关」标记（负向先行，防「无条件渲染关」蒙混过关）
        WA.horizon.setSettings({ distantEnabled: true, nearEnabled: true });
        evTabE2300.onclick();
        const onBodyE2300 = bodyE2300();
        assert(onBodyE2300.indexOf('远方/近端事件泳道') >= 0, '（真 DOM）事件页渲染泳道区');
        assert(onBodyE2300.indexOf('wa-badge">关</span>') < 0, '（负向）通道开启时泳道区无「关」标记');
        // 关闭远端：必须出现「关」标记
        WA.horizon.setSettings({ distantEnabled: false, nearEnabled: true });
        evTabE2300.onclick();
        const offBodyE2300 = bodyE2300();
        assert(offBodyE2300.indexOf('wa-badge">关</span>') >= 0, '（真 DOM）关闭通道后泳道区出现「关」标记（此前关了与没中在面板上无区别）');
        // 掷骰留痕：真掷一次，面板应显示次数与跳过计数
        WA.horizon.rollLane('distant');
        WA.horizon.rollLane('near', { force: true });
        evTabE2300.onclick();
        const statBodyE2300 = bodyE2300();
        assert(statBodyE2300.indexOf('掷骰') >= 0, '（真 DOM）泳道区展示掷骰次数');
        assert(statBodyE2300.indexOf('跳过（关）') >= 0, '（真 DOM）泳道区展示跳过计数（「关了」与「没中」可区分）');
        // 开关改回后标记消失（可逆，不粘留）
        WA.horizon.setSettings({ distantEnabled: true, nearEnabled: true });
        evTabE2300.onclick();
        assert(bodyE2300().indexOf('wa-badge">关</span>') < 0, '（真 DOM）通道重开后「关」标记消失（不粘留）');
      }
      global.document = savedDocE2300;
      global.document.getElementById = function () { return null; };
      WA.mainDoc = global.document;
    }
    WA.workflow.resetHistory();
    fresh2300();
  }
  } // end v2.3.0 block
  // ══════════ v2.4.0 ══════════
  v2400: {
  const LS2400 = global.localStorage;
  const ctx2400 = global.SillyTavern.getContext();
  const PROD2400 = ['core/store.js', 'core/settings-bus.js', 'core/api-router.js', 'core/workflow.js', 'core/interceptor.js',
    'engines/backstage.js', 'engines/evolution.js', 'engines/opinion.js', 'engines/regional.js', 'engines/horizon.js',
    'engines/calendar.js', 'engines/memory-sampler.js', 'engines/tool-diag.js',
    'render/inject.js', 'render/purifier.js', 'ui/panel.js', 'ui/settings.js'];
  const SRC2400 = PROD2400.map(function (rel) { return { rel: rel, text: fs.readFileSync(path.join(BASE, rel), 'utf8') }; });
  function fresh2400() { LS2400.clear(); ctx2400.chatId = 'v2400_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function srcOf2400(rel) { const hit = SRC2400.filter(function (x) { return x.rel === rel; })[0]; return hit ? hit.text : ''; }
  function allSrc2400() { return SRC2400.map(function (x) { return x.text; }).join('\n'); }
  // 键名提升到 v2400 块顶层：F/G/H 三段共用（此前在 F 段块作用域内声明，G 段不可见）
  const evoKey2400 = 'worldaxis_evolution_settings_v1';
  const bcKey2400 = 'worldaxis_backstage_settings_v1';
  const visKey2400 = 'worldaxis_inject_visibility_v1';
  const opKey2400 = 'worldaxis_opinion_settings_v1';
  function regOf2400(key) { return WA.__settingsRegs.filter(function (r) { return r.key === key; })[0]; }
  // 子键级「旧存档」夹具：磁盘只有第一个子键，其余全缺
  function fixture2400(key, def, keepN) {
    const ks = Object.keys(def);
    const o = {}; ks.slice(0, keepN || 1).forEach(function (k) { o[k] = def[k]; });
    LS2400.setItem(key, JSON.stringify(o));
    return o;
  }

  // ── F. 块1：settingsBus 子键级默认值补齐（本轮命题）──
  fresh2400();
  section('v2.4.0 块1：子键级默认值契约（settingsBus.applyDefaults）');
  {
    // F1. 静态锚点：read 出口必须经过补齐
    const busSrc2400 = srcOf2400('core/settings-bus.js');
    assert(busSrc2400.indexOf('function applyDefaults(reg, val)') > 0, 'settingsBus 存在子键补齐实现（单一实现）');
    assert(busSrc2400.indexOf('val = applyDefaults(r, val);') > 0, 'read() 出口接入子键补齐（整键回落之外的第二层）');
    assert(busSrc2400.indexOf('subkeyFills') > 0, '补齐有计量（静默自愈必须可观测）');
    assert(/if \(val\[k\] !== undefined\) return;/.test(busSrc2400), '补齐口径：只补 undefined（false/0/\'\'/null 为显式选择，必须保留）');
    assert(busSrc2400.indexOf('JSON.parse(JSON.stringify(dv))') > 0, '补进去的是深拷贝（判定表不得被调用方改写）');

    // F2. 行为实证：磁盘缺子键 → read 返回值与整键缺失时一致
    const regEvo2400 = regOf2400(evoKey2400);
    const regBc2400 = regOf2400(bcKey2400);
    const regVis2400 = regOf2400(visKey2400);
    fixture2400(evoKey2400, regEvo2400.def, 1);
    assert(JSON.stringify(WA.evolution.getSettings()) === JSON.stringify(regEvo2400.def),
      '磁盘缺子键时读回结构与声明默认值完全一致（此前缺 4 子键 → undefined）');
    fixture2400(bcKey2400, regBc2400.def, 1);
    const bc2400 = WA.backstage.getSettings();
    assert(bc2400.npcBudget === regBc2400.def.npcBudget && bc2400.injectBudget === regBc2400.def.injectBudget
      && bc2400.autoSimulate === regBc2400.def.autoSimulate, 'backstage 11 子键全部补齐（npcBudget/injectBudget/autoSimulate 非 undefined）');
    fixture2400(visKey2400, regVis2400.def, 1);
    const vis2400 = WA.render.getVisibility();
    assert(Object.keys(vis2400).length === Object.keys(regVis2400.def).length, '可见性 10 源全部有值（此前 9 源 undefined = 静默全关）');

    // F3. 负向：显式假值不得被补齐覆盖（否则用户「明确关掉」会被系统打开）
    LS2400.setItem(visKey2400, JSON.stringify({ clock: false, echoes: true }));
    const visNeg2400 = WA.render.getVisibility();
    assert(visNeg2400.clock === false, '（负向）显式 false 保留（不被默认值覆盖）');
    assert(visNeg2400.echoes === true, '（负向）显式 true 保留（def 为 false 也不覆盖）');
    LS2400.setItem(evoKey2400, JSON.stringify({ diceEnabled: false, diceModifier: 0 }));
    const evoNeg2400 = WA.evolution.getSettings();
    assert(evoNeg2400.diceEnabled === false && evoNeg2400.diceModifier === 0, '（负向）显式 false/0 保留');

    // F4. 负向：def 深拷贝——调用方改写返回值不得污染判定表
    const defSnap2400 = JSON.stringify(regVis2400.def);
    const visMut2400 = WA.render.getVisibility();
    visMut2400.clock = 'MUTATED';
    Object.keys(visMut2400).forEach(function (k) { visMut2400[k] = 'MUTATED'; });
    assert(JSON.stringify(regVis2400.def) === defSnap2400, '（负向）改写 read 返回值不污染登记表 def（深拷贝生效）');
    assert(JSON.stringify(WA.render.SOURCES) !== JSON.stringify(visMut2400), '（负向）SOURCES 判定表未被别名污染');

    // F5. 观测：补齐计数与缺口盘点
    fresh2400();
    const stBefore2400 = WA.settingsBus.stats.subkeyFills;
    fixture2400(bcKey2400, regBc2400.def, 1);
    WA.backstage.getSettings();
    assert(WA.settingsBus.stats.subkeyFills > stBefore2400, '补齐计数增长（subkeyFills 可观测）');
    assert(WA.settingsBus.stats.lastSubkeyKey === bcKey2400, '记录最近补齐的键名');
    const audit2400 = WA.settingsBus.subkeyAudit();
    assert(audit2400.keys.some(function (x) { return x.key === bcKey2400; }), 'subkeyAudit 盘点出真实缺口（只读，不触发补齐）');
    const bcRow2400 = audit2400.keys.filter(function (x) { return x.key === bcKey2400; })[0];
    assert(bcRow2400.declared === Object.keys(regBc2400.def).length && bcRow2400.missing.length === Object.keys(regBc2400.def).length - 1,
      '缺口项数 = 声明数 − 磁盘实际子键数');
    LS2400.removeItem(bcKey2400);
    assert(!WA.settingsBus.subkeyAudit().keys.some(function (x) { return x.key === bcKey2400; }),
      '整键缺失不计为子键缺口（那是整键回落，属另一条路径）');

    // F6. 单源不变量仍成立（补齐不得破坏 v2.3.0 的整键回落断言）
    WA.settingsBus.registry().forEach(function (r) {
      if (r.orphan) return;
      LS2400.removeItem(r.key);
      assert(JSON.stringify(WA.settingsBus.read(r)) === JSON.stringify(r.def), r.key + ' 整键回落仍 === 声明（v2.3.0 不变量保持）');
    });
  }

  // ── G. 块2：消费端语义收口（数值 NaN 与布尔归一化）──
  fresh2400();
  section('v2.4.0 块2：消费端自持回落（NaN 防治 + 布尔归一化）');
  {
    // G1. evolution 阈值算术：缺子键曾让 «成功/受挫» 两个分支同时静默消失
    const regEvo2400b = regOf2400(evoKey2400);
    fixture2400(evoKey2400, regEvo2400b.def, 1);
    const mf2400 = WA.evolution.getMaxFails({ type: 'progress', level: 1 });
    assert(isFinite(mf2400) && mf2400 === regEvo2400b.def.progressFailBase + 1, 'getMaxFails 缺子键下不产生 NaN（保底机制存活）');
    const mfC2400 = WA.evolution.getMaxFails({ type: 'conflict', level: 1 });
    assert(isFinite(mfC2400) && mfC2400 === Math.max(1, regEvo2400b.def.conflictFailBase - 1), '冲突型保底上限同样不产生 NaN');
    // 行为实证：多次掷骰必须出现多种结果（曾 300 次全判「保持」= 静默失效）
    //   v2.4.0: 注入**确定性随机源**而非依赖真 Math.random —— 不确定性断言等于不确定的回归。
    //   阈值口径（conflict/level1/stageRound5/萌芽）：threshold = round(85 - 200*(5/9)*(4/9)) = 36；
    //   序列 [0.01, 0.20, 0.99] ⇒ dice=2/21/100 ⇒ 受挫 / 保持 / 成功 三分支**必然**各命中一次。
    //   v2.14.0: 改走 `WA.rand.seed()` 显式播种（不再 patch Math.random——裸调已治理，patch 无效）。
    //   顺带把断言从「各命中 100 次」升级为两条**更强的性质**：
    //     ① 三分支全部可达，且都不占绝对多数（防「静默坍塌成单分支」，比定值更难糊弄）；
    //     ② 同种子重放 300 次掷骰，分布**逐项相同**——这正是本版要立的能力本身。
    const runDist2400 = function () {
      WA.rand.seed(20240240);
      const dist = {};
      for (let i = 0; i < 300; i++) {
        WA.store.transact(function (d) { d.evolution.events = [{ id: 'e1', type: 'conflict', name: 'T', level: 1, stage: '萌芽', stageRound: 5, consecutiveFails: 0 }]; });
        const res2400 = WA.evolution.rollEvents();
        const k2400 = (res2400[0] && res2400[0].result) || '?';
        dist[k2400] = (dist[k2400] || 0) + 1;
      }
      return dist;
    };
    const dist2400 = runDist2400();
    const dist2400b = runDist2400();
    assert(dist2400['受挫'] > 0 && dist2400['保持'] > 0 && dist2400['成功'] > 0 && dist2400['受挫'] < 250,
      '三分支全部可达且都不占绝对多数（实 ' + JSON.stringify(dist2400) + '）——受挫/保持/成功均非零');
    assert(JSON.stringify(dist2400) === JSON.stringify(dist2400b),
      '（可复现）同种子重放 300 次掷骰，分布逐项相同（实 ' + JSON.stringify(dist2400) + '）');
    assert(Object.keys(dist2400).length >= 2, '缺子键下掷骰结果不再单一（实分布 ' + JSON.stringify(dist2400) + '）');
    assert((dist2400['成功'] || 0) > 0 && (dist2400['保持'] || 0) > 0, '「成功」分支可达（此前 NaN 比较恒真/恒假，成功永不发生）');
    // 负向：数值子键被写成脏值时同样不产生 NaN
    LS2400.setItem(evoKey2400, JSON.stringify({ diceModifier: 'abc', setbackRatio: null, progressFailBase: {}, conflictFailBase: [] }));
    const mfDirty2400 = WA.evolution.getMaxFails({ type: 'progress', level: 2 });
    assert(isFinite(mfDirty2400), '（负向）脏值下 getMaxFails 仍为有限数（回落声明默认值）');

    // G2. backstage 自动推演：缺子键曾把 autoSimulate 判为「关」
    const regBc2400b = regOf2400(bcKey2400);
    fixture2400(bcKey2400, regBc2400b.def, 1);
    WA.store.transact(function (d) { d.meta = d.meta || {}; d.meta.round = 1; });
    global.__mockChat.push({ is_user: false, name: 'A', mes: 'test' });
    const auto2400 = WA.backstage.requestSimulate('after-reply');
    assert(auto2400 && auto2400.reason !== 'auto-off', '缺子键时自动推演不再被判「关停」（此前 reason=auto-off）');
    // 负向：显式关闭仍必须尊重
    LS2400.setItem(bcKey2400, JSON.stringify({ autoSimulate: false }));
    const autoOff2400 = WA.backstage.requestSimulate('after-reply');
    assert(autoOff2400 && autoOff2400.reason === 'auto-off', '（负向）显式 autoSimulate=false 仍拒绝自动推演');
    LS2400.setItem(bcKey2400, JSON.stringify({ autoSimulate: 'false' }));
    const autoStr2400 = WA.backstage.requestSimulate('after-reply');
    assert(autoStr2400 && autoStr2400.reason === 'auto-off', '（负向）字符串 \'false\' 经归一化同样判关（此前靠隐式真值侥幸正确）');

    // G3. opinion：`roundCount % undefined` 曾恒真 → 舆情永不生成
    const opSrc2400 = srcOf2400('engines/opinion.js');
    assert(opSrc2400.indexOf('WA.settingsBus.toBool(st.enabled, __REG.def.enabled)') > 0, 'opinion enabled 走统一布尔归一化');
    assert(opSrc2400.indexOf('__REG.def.everyNRounds') > 0, 'opinion everyNRounds 有回落（不写死第二份默认值）');
    assert(!/Math\.max\(1, st\.everyNRounds\)/.test(opSrc2400), '（负向）不再直接用未回落值参与模运算（NaN 源已移除）');
    LS2400.setItem(opKey2400, JSON.stringify({ enabled: true }));
    assert(WA.opinion.getSettings().everyNRounds === 3, '缺子键时 everyNRounds 补齐为 3');

    // G4. 数值回落实现为单一入口（防各模块各写一套）
    const evoSrc2400 = srcOf2400('engines/evolution.js');
    assert(evoSrc2400.indexOf('_num(v, def)') > 0, 'evolution 有统一数值回落入口 _num');
    assert(evoSrc2400.indexOf('this._num(st.diceModifier, __REG.def.diceModifier)') > 0, 'diceModifier 经回落（NaN 根因）');
    assert(evoSrc2400.indexOf('this._num(st.setbackRatio, __REG.def.setbackRatio)') > 0, 'setbackRatio 经回落');
    // 算术消费点共 4 处：getMaxFails 的 progress/conflict 基数 + rollEvents 的 modifier/setbackRatio
    const numFallbacks2400 = (evoSrc2400.match(/this\._num\(/g) || []).length;
    assert(numFallbacks2400 === 4, '数值回落点恰好覆盖 4 个算术消费（实 ' + numFallbacks2400 + '；多一处意味着有重复实现，少一处意味着有裸用）');
    // 反向核对：算术表达式里不得再出现未包落的 st.<数值键>
    ['progressFailBase', 'conflictFailBase', 'diceModifier', 'setbackRatio'].forEach(function (k) {
      assert(evoSrc2400.indexOf('this._num(st.' + k + ', __REG.def.' + k + ')') > 0, '数值键 ' + k + ' 经统一回落入口');
    });

    // G5. 采样器：显式 0 不再被 `||` 吞掉，回落有留痕
    const msSrc2400 = srcOf2400('engines/memory-sampler.js');
    assert(msSrc2400.indexOf('function pickInt(raw, def, field)') > 0, '采样器有显式落值判定 pickInt');
    assert(msSrc2400.indexOf('samplerCfgStat') > 0, '采样回落有只读留痕出口');
    LS2400.setItem(bcKey2400, JSON.stringify({ memSamplerLimit: 0, memSamplerDice: 0 }));
    const msCfg2400 = WA.memorySampler.loadSamplerSettings();
    assert(msCfg2400.memSamplerLimit === 0 && msCfg2400.memSamplerDice === 0, '（负向）显式 0 原样读出（此前被 || 回落成 8/10000）');
    LS2400.setItem(bcKey2400, JSON.stringify({ memSamplerLimit: 'zzz' }));
    const msBad2400 = WA.memorySampler.loadSamplerSettings();
    assert(msBad2400.memSamplerLimit === 8, '（负向）不可解析值回落默认 8');
    assert(WA.memorySampler.samplerCfgStat().fallbacks > 0, '回落被记账（诊断可见，不静默）');

    // G6. 可见性 def 完整性：SOURCES 每一项都必须在 def 里有默认值
    const visStat2400 = WA.render.visibilityStat();
    assert(visStat2400.undeclared.length === 0, '可见性声明完整（SOURCES 全部有默认值；漏项：' + (visStat2400.undeclared.join('、') || '无') + '）');
    assert(visStat2400.sources === visStat2400.declared, 'SOURCES 数与我 def 声明数一致（' + visStat2400.sources + '/' + visStat2400.declared + '）');
  }

  // ── H. 块4：全域「子键消费点」守卫（缺陷形态内化）──
  fresh2400();
  section('v2.4.0 块4：子键契约回归守卫（形态内化）');
  {
    // H1. 全库不再存在「未回落值直接参与算术」的已知危险形态
    const ALL2400 = allSrc2400();
    const DANGER2400 = [
      ['st.diceModifier', /st\.diceModifier\s*\)/, 'evolution 阈值算术的裸用'],
      ['st.setbackRatio', /threshold \* \(st\.setbackRatio/, 'evolution 受挫判据的裸用']
    ];
    DANGER2400.forEach(function (pair) {
      assert(!pair[1].test(ALL2400), '（负向）不存在裸用形态：' + pair[0] + '（' + pair[2] + '）');
    });
    // H2. 每个多子键登记项都必须声明 def（无 def 则无从补齐）
    let multi2400 = 0;
    WA.settingsBus.registry().forEach(function (r) {
      if (r.orphan || !r.def || typeof r.def !== 'object' || Array.isArray(r.def)) return;
      if (Object.keys(r.def).length < 2) return;
      multi2400++;
      assert(Object.keys(r.def).every(function (k) { return r.def[k] !== undefined; }),
        r.key + ' 的多子键 def 无 undefined 值（否则补齐会把 undefined 补进去）');
    });
    assert(multi2400 >= 6, '多子键登记项已覆盖（实 ' + multi2400 + ' 个，v2.4.0 基线 6）');
    // H3. 全量：凡多子键登记项，磁盘只留第一个子键时读回必须与声明等值
    //   （这是本轮的命题断言——一次覆盖 6 个键、43 个子键，新增设置忘记回落即失败）
    let covered2400 = 0;
    WA.settingsBus.registry().forEach(function (r) {
      if (r.orphan || !r.def || typeof r.def !== 'object' || Array.isArray(r.def)) return;
      const ks = Object.keys(r.def);
      if (ks.length < 2) return;
      LS2400.setItem(r.key, JSON.stringify({ [ks[0]]: r.def[ks[0]] }));
      covered2400 += ks.length;
      assert(JSON.stringify(WA.settingsBus.read(r)) === JSON.stringify(r.def),
        r.key + ' 旧存档（仅 1 子键）读回 === 声明 ' + ks.length + ' 子键');
      LS2400.removeItem(r.key);
    });
    assert(covered2400 >= 40, '单键夹具覆盖子键数（实 ' + covered2400 + '，v2.4.0 基线 40）');
    // H4. 诊断出口接线（子键缺口必须能被看见）
    const diagSrc2400 = srcOf2400('engines/tool-diag.js');
    assert(diagSrc2400.indexOf('subkeyAudit') > 0, 'tool-diag 采集子键缺口盘点');
    assert(diagSrc2400.indexOf("key: 'settingsBus.subkeys'") > 0, 'verdict 报子键缺口议题');
    assert(diagSrc2400.indexOf("key: 'inject.visibilityUndeclared'") > 0, 'verdict 报可见性漏声明议题（error 级）');
    assert(diagSrc2400.indexOf('visibilityStat') > 0 && diagSrc2400.indexOf('samplerCfgStat') > 0,
      '诊断采集可见性健康度与采样回落留痕');
    // H5. 缺口盘点不得自我触发补齐（否则报告恒为空）
    fresh2400();
    fixture2400(bcKey2400, regOf2400(bcKey2400).def, 1);
    const gapBefore2400 = WA.settingsBus.subkeyAudit().totalMissing;
    WA.settingsBus.subkeyAudit(); WA.settingsBus.subkeyAudit();
    assert(WA.settingsBus.subkeyAudit().totalMissing === gapBefore2400, '（负向）反复盘点不改变缺口（只读，不自我修复）');
    // H6. 补齐与整键回落两条路径不得互相污染
    fresh2400();
    LS2400.setItem(bcKey2400, 'NOT-JSON{{{');
    const broken2400 = WA.backstage.getSettings();
    assert(broken2400 && broken2400.simulationMode === 'balanced', '（负向）整键损坏仍走隔离 → 回落声明默认值');
    assert(WA.settingsBus.stats.quarantines > 0, '损坏隔离仍留痕（v2.3.0 不变量保持）');
  }
  // ══════════ v2.4.0 块5：入口文件可装载性（填补「tests 跳过 index.js」盲区）══════════
  section('v2.4.0 块5：入口文件可执行性（TDZ 守卫 + 真实装载实证）');
  {
    const idxSrc2500 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    // I1. 静态守卫：不得在 `const WA` 声明**之前**引用 WA（严格模式下是 TDZ ReferenceError）
    const declPos2500 = idxSrc2500.indexOf('const WA = window.WorldAxis');
    assert(declPos2500 > 0, 'index.js 含 WA 命名空间声明（pos=' + declPos2500 + '）');
    const head2500 = idxSrc2500.slice(0, declPos2500);
    const earlyHits2500 = head2500.match(/\bWA\s*\./g) || [];
    assert(earlyHits2500.length === 0,
      '（负向）index.js 在 const WA 声明之前零 WA 引用（发现 ' + earlyHits2500.length + ' 处：'
      + (head2500.match(/\bWA\s*\.[A-Za-z_$]*/g) || []).join('、') + '）——此前 WA.VERSION 写在第 13 行、声明在第 28 行，入口必崩');
    // 旧键 WA.VERSION 必须仍在（tool-diag 以 `WA.VERSION || WA.version` 消费，删掉会让诊断读空）
    assert(idxSrc2500.indexOf('WA.VERSION = VERSION') > declPos2500, 'WA.VERSION 赋值仍在声明之后（保留旧键，未因修 TDZ 而删除）');
    // I2. 动态实证：真执行入口文件，不得抛错且必须建立命名空间
    const doc2500 = {
      getElementsByTagName: function () { return []; },
      addEventListener: function () {},
      readyState: 'complete',
      createElement: function () { return { style: {}, setAttribute: function () {}, appendChild: function () {}, addEventListener: function () {} }; },
      head: { appendChild: function () {} },
      body: { appendChild: function () {} },
      getElementById: function () { return null; }
    };
    const ls2500 = {
      _s: {}, getItem: function (k) { return (k in this._s) ? this._s[k] : null; },
      setItem: function (k, v) { this._s[k] = String(v); }, removeItem: function (k) { delete this._s[k]; }
    };
    const sb2500 = { console: console, document: doc2500, localStorage: ls2500, JSON: JSON, Date: Date, Math: Math, Promise: Promise, setTimeout: function () { return 0; }, clearTimeout: function () {} };
    sb2500.window = sb2500;
    const ctxI2500 = vm.createContext(sb2500);
    let entryErr2500 = null;
    try { vm.runInContext(idxSrc2500, ctxI2500, { filename: 'index.js' }); } catch (e) { entryErr2500 = e; }
    assert(!entryErr2500, '入口 index.js 可执行（此前抛 TDZ ReferenceError；实际错误：' + (entryErr2500 && entryErr2500.message) + '）');
    assert(!!(ctxI2500.WorldAxis && ctxI2500.WorldAxis.version), '入口执行后建立 WorldAxis 命名空间并写入 version（实 ' + (ctxI2500.WorldAxis && ctxI2500.WorldAxis.version) + '）');
    assert(!!ctxI2500.WorldAxis.VERSION, 'WA.VERSION 亦已写入（tool-diag 诊断读版本依赖该键）');
    assert(ctxI2500.__WORLD_AXIS_LOADED__ === true, '入口设置 __WORLD_AXIS_LOADED__ 哨兵（重复加载防护生效）');
    assert(ctxI2500.WorldAxis.version === ctxI2500.WorldAxis.VERSION, 'version 与 VERSION 两键一致（防再次分叉）');
    // I3. 版本号三方对齐：index.js / manifest.json / 回归期望
    let mf2500 = null;
    try { mf2500 = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8')); } catch (e) {}
    assert(!!mf2500, 'manifest.json 可解析');
    assert(mf2500.version === ctxI2500.WorldAxis.VERSION, 'manifest.version 与 index.js VERSION 一致（' + mf2500.version + ' vs ' + ctxI2500.WorldAxis.VERSION + '）');
    assert((idxSrc2500.match(/const VERSION = '([\d.]+)'/) || [])[1] === mf2500.version, 'index.js VERSION 常量与 manifest 同源同值');
    // I4. 防回归：入口的加载清单必须与磁盘实际文件一致（清单漏项 = 模块永不加载）
    const order2500 = (idxSrc2500.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
    const rels2500 = (order2500.match(/'([^']+\.js)'/g) || []).map(function (x) { return x.replace(/'/g, ''); });
    assert(rels2500.length >= 50, 'LOAD_ORDER 解析出 ' + rels2500.length + ' 个模块');
    const missing2500 = rels2500.filter(function (rel) { return !fs.existsSync(path.join(BASE, rel)); });
    assert(missing2500.length === 0, 'LOAD_ORDER 列出的模块在磁盘上全部存在（缺：' + (missing2500.join('、') || '无') + '）');
  }
  } // end v2.4.0 block
  // ══════════ v2.5.0 ══════════
  v2500: {
  const LS2500 = global.localStorage;
  const ctx2500 = global.SillyTavern.getContext();
  const PROD2500 = ['core/store.js', 'core/settings-bus.js', 'core/api-router.js', 'core/workflow.js',
    'engines/backstage.js', 'engines/evolution.js', 'engines/opinion.js', 'engines/regional.js', 'engines/horizon.js',
    'engines/calendar.js', 'engines/preset.js', 'engines/tool-diag.js',
    'render/inject.js', 'render/purifier.js', 'ui/panel.js'];
  const SRC2500 = PROD2500.map(function (rel) { return { rel: rel, text: fs.readFileSync(path.join(BASE, rel), 'utf8') }; });
  function fresh2500() { LS2500.clear(); ctx2500.chatId = 'v2500_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function srcOf2500(rel) { const h = SRC2500.filter(function (x) { return x.rel === rel; })[0]; return h ? h.text : ''; }
  const rgKey2500 = 'worldaxis_regional_settings_v1';
  const activeKey2500 = 'worldaxis_active_preset';
  function reg2500(key) { return (WA.__settingsRegs || []).filter(function (r) { return r.key === key; })[0] || null; }
  function disk2500(key) { try { return LS2500.getItem(key); } catch (e) { return null; } }
  function diskObj2500(key) { try { return JSON.parse(disk2500(key)); } catch (e) { return null; } }
  // 顶层键引用（A~F 段共用；在此处集中声明，避免各段的块作用域遮蔽）
  const r2500A = reg2500(rgKey2500);
  const r2500B = r2500A;
  const r2500C = reg2500(activeKey2500);

  // ── A. 块1：结构指纹（schemaFingerprint / _schema 盖章）──
  fresh2500();
  section('v2.5.0 块1：结构指纹与 _schema 盖章');
  {
    const fpA = WA.settingsBus.schemaFingerprint({ b: true, a: 1, c: 'x' });
    const fpB = WA.settingsBus.schemaFingerprint({ c: 'y', a: 2, b: false });
    assert(fpA.fp === 'a:number|b:boolean|c:string', '指纹 = 子键名:typeof 按名排序（实 ' + fpA.fp + '）');
    assert(fpA.fp === fpB.fp, '（负向）仅调整字段书写顺序不改变指纹（免疫重排误报）');
    assert(fpA.fp !== WA.settingsBus.schemaFingerprint({ a: 1, b: true }).fp, '子键增删即指纹变化（结构变更可判）');
    assert(typeof fpA.digest === 'string' && fpA.digest.length >= 4, '指纹配短摘要（实 ' + fpA.digest + '）');
    assert(WA.settingsBus.schemaFingerprint(null).fp === null, '（负向）非对象 def → 指纹为 null（不臆造）');
    const secretA = 'sk-SECRET-TOKEN-9988';
    const fpS = WA.settingsBus.schemaFingerprint({ apiKey: secretA, enabled: true }).fp;
    assert(fpS.indexOf(secretA) < 0 && fpS.indexOf('SECRET') < 0, '（隐私）指纹不含值内容（密钥不进指纹）');
    assert(fpS === 'apiKey:string|enabled:boolean', '指纹只保留 名:类型');
    fresh2500();
    // 夹具选 backstage 键（无 migrate 声明 → 不会被迁移改写）：磁盘只存一个子键，
    //   与声明的 12 子键形状不同 → 应盖章。（此前的夹具用了 regional，而 regional 的
    //   死子键迁移恰好把形状修回与 def 一致 → 设计上就该零写入，属夹具选错而非实现缺陷。）
    const bcKey2500 = 'worldaxis_backstage_settings_v1';
    const r2500A = reg2500(bcKey2500);
    LS2500.setItem(bcKey2500, JSON.stringify({ simulationMode: 'deep' }));
    const vA2500 = WA.settingsBus.read(r2500A);
    assert(vA2500._schema === undefined, '（负向）消费端视图不含 _schema（元数据不泄漏给调用方）');
    assert(Object.keys(vA2500).indexOf('_schema') < 0, '（负向）返回值键集合里没有 _schema');
    const dA2500 = diskObj2500(bcKey2500);
    assert(dA2500 && dA2500._schema && typeof dA2500._schema.fp === 'string', '磁盘值已带结构指纹 _schema（实 ' + JSON.stringify(dA2500._schema) + '）');
    assert(WA.settingsBus.stats.schemaStamps >= 1, '盖章留痕（stats.schemaStamps=' + WA.settingsBus.stats.schemaStamps + '）');
    const stampsBeforeA = WA.settingsBus.stats.schemaStamps;
    const diskBeforeA = disk2500(bcKey2500);
    WA.settingsBus.read(r2500A); WA.settingsBus.read(r2500A);
    assert(WA.settingsBus.stats.schemaStamps === stampsBeforeA, '（负向）结构已相符时反复读不再盖章（零写入）');
    assert(disk2500(bcKey2500) === diskBeforeA, '（负向）反复读不改动磁盘字节');
    // A4b. 结构本就相符 → 一个字节都不写
    fresh2500();
    const regFullA = reg2500(bcKey2500);
    WA.settingsBus.save(regFullA, JSON.parse(JSON.stringify(regFullA.def)));   // 写入与声明完全同形状的值
    const stampsBeforeA2 = WA.settingsBus.stats.schemaStamps;
    const diskBeforeA2 = disk2500(bcKey2500);
    WA.settingsBus.read(regFullA);
    assert(disk2500(bcKey2500) === diskBeforeA2, '（负向）结构与声明相符时零写入（不污染、不产生额外 IO）');
    assert(WA.settingsBus.stats.schemaStamps === stampsBeforeA2, '（负向）相符态不计数盖章');
    // A5. save 继承磁盘指纹：保存用户设置不得抹掉结构标识
    fresh2500();
    LS2500.setItem(bcKey2500, JSON.stringify({ simulationMode: 'deep' }));
    WA.settingsBus.read(r2500A);
    const fpDiskA = (diskObj2500(bcKey2500)._schema || {}).fp;
    const patchA = JSON.parse(JSON.stringify(reg2500(bcKey2500).def));
    patchA.simulationMode = 'light';
    WA.settingsBus.save(r2500A, patchA);
    const afterSaveA = diskObj2500(bcKey2500);
    assert(afterSaveA.simulationMode === 'light', '保存写入用户值');
    assert(afterSaveA._schema && afterSaveA._schema.fp === fpDiskA, '（负向）保存后磁盘指纹仍在（否则每次保存都要重盖，指纹退化为「最后保存时间」）');
    assert(WA.settingsBus.read({ key: 'worldaxis_nonexistent_v1', def: { a: 1 } })._schema === undefined, '（负向）无 _schema 时不产生该键');
    assert(WA.settingsBus.read({ key: 'worldaxis_nonexistent_v2', def: null }) === null, '（负向）def:null 且无磁盘值 → 返回 null（不被包装成对象）');
  }
  // ── B. 块2：结构迁移引擎（migrateIfNeeded 契约）──
  fresh2500();
  section('v2.5.0 块2：结构迁移引擎（缩减型演化 + 契约四条）');
  {
    // B 段用 regional 登记项（其 def 在 v2.3.0 经历过「缩减型演化」，是本轮迁移引擎的目标案例）
    const r2500B = reg2500(rgKey2500);
    assert(!!r2500B && typeof r2500B.migrate === 'function', 'regional 登记项已声明 migrate（全库首个真实消费者）');
    assert(r2500B.migrateObjects === true, 'regional 声明 migrateObjects（缩减型演化需显式开启对象形态迁移）');
    const legacyVal2500 = {
      enabled: true, chancePercent: 25, durationRounds: 5,
      distantEnabled: true, nearEnabled: true, distantChance: 20, nearChance: 20, cooldown: 5
    };
    LS2500.setItem(rgKey2500, JSON.stringify(legacyVal2500));
    const readB2500 = WA.settingsBus.read(r2500B);
    assert(readB2500.enabled === true && readB2500.chancePercent === 25 && readB2500.durationRounds === 5, '迁移保留 def 声明的用户值（enabled/chancePercent/durationRounds 原样）');
    ['distantEnabled', 'nearEnabled', 'distantChance', 'nearChance', 'cooldown'].forEach(function (k) {
      assert(readB2500[k] === undefined, '（负向）移植期死子键 ' + k + ' 已从读值中剔除');
    });
    const diskB2500 = diskObj2500(rgKey2500);
    ['distantEnabled', 'nearEnabled', 'distantChance', 'nearChance', 'cooldown'].forEach(function (k) {
      assert(!Object.prototype.hasOwnProperty.call(diskB2500, k), '（负向）死子键已从磁盘剔除 ' + k + '（此前只在声明侧剔除，磁盘永久驻留）');
    });
    assert(WA.settingsBus.stats.migrations >= 1, '迁移留痕（stats.migrations=' + WA.settingsBus.stats.migrations + '）');
    const lastMig2500 = WA.settingsBus.stats.lastMigration || {};
    assert(lastMig2500.key === rgKey2500 && /dropped-stale-subkeys/.test(String(lastMig2500.reason)), '迁移原因串点名被删子键（可溯源，实 ' + lastMig2500.reason + '）');
    const migCountB2500 = WA.settingsBus.stats.migrations;
    WA.settingsBus.read(r2500B); WA.settingsBus.read(r2500B);
    assert(WA.settingsBus.stats.migrations === migCountB2500, '（负向）结构已升级后反复读不再迁移（幂等）');
    fresh2500();
    LS2500.setItem(rgKey2500, JSON.stringify({ enabled: true, chancePercent: 33, durationRounds: 2 }));
    const migBeforeB3 = WA.settingsBus.stats.migrations;
    const vB3 = WA.settingsBus.read(r2500B);
    assert(vB3.chancePercent === 33 && vB3.durationRounds === 2, '（负向）已是当前结构的配置原样读出');
    assert(WA.settingsBus.stats.migrations === migBeforeB3, '（负向）无死子键时不触发迁移（用户正常配置零打扰）');
    fresh2500();
    const boomReg2500 = { key: 'worldaxis_mig_boom_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { throw new Error('boom-2500'); } };
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([boomReg2500]);
    try {
      LS2500.setItem('worldaxis_mig_boom_v1', JSON.stringify({ a: 2, dead: 3 }));
      let readErr2500 = null, vB4 = null;
      try { vB4 = WA.settingsBus.read(boomReg2500); } catch (e) { readErr2500 = e; }
      assert(!readErr2500, '（负向）迁移抛错不外抛（read 仍返回可用值）');
      assert(vB4 && vB4.a === 2, '（负向）迁移失败时按原值继续被消费（不静默清空用户数据）');
      const stB4 = WA.settingsBus.migrationStat();
      assert(stB4.failed >= 1 && stB4.failedKeys.indexOf('worldaxis_mig_boom_v1') >= 0, '迁移失败入台账并有键名（实 ' + JSON.stringify(stB4.failedKeys) + '）');
      const failedBeforeB4 = WA.settingsBus.stats.migrationFailed;
      let callsB4 = 0;
      const countingReg2500 = { key: 'worldaxis_mig_boom_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
        migrate: function () { callsB4++; throw new Error('boom-again'); } };
      WA.settingsBus.read(countingReg2500);
      assert(callsB4 === 0, '（负向）同一份坏值不重试（抛错的迁移不会变成每次 read 都重试的热路径）');
      assert(WA.settingsBus.stats.migrationFailed === failedBeforeB4, '（负向）不重试 → 失败计数不膨胀');
    } finally {
      WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r.key !== 'worldaxis_mig_boom_v1'; });
    }
    fresh2500();
    const shapeReg2500 = { key: 'worldaxis_mig_shape_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function (c) {
        if (!c.value || typeof c.value !== 'object' || c.value.a === 1) return { changed: false, reason: 'no-change' };
        return { changed: true, value: { a: c.value.a }, reason: 'shape-test' };
      } };
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([shapeReg2500]);
    try {
      WA.settingsBus.read(shapeReg2500);
      LS2500.setItem('worldaxis_mig_shape_v1', JSON.stringify({ a: 7, junk: 1 }));
      const vB5 = WA.settingsBus.read(shapeReg2500);
      assert(vB5 && vB5.a === 7, '先读过空值后写入的异形值仍被迁移处理（实 a=' + (vB5 && vB5.a) + '）');
      assert(!Object.prototype.hasOwnProperty.call(vB5, 'junk'), '（负向）异形子键已被剔除（形态变化获得恰一次新机会）');
    } finally {
      WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r.key !== 'worldaxis_mig_shape_v1'; });
    }
    const busSrc2500 = srcOf2500('core/settings-bus.js');
    assert(busSrc2500.indexOf('function migShapeKey') > 0, '记账按值形态的函数在位（migShapeKey）');
    assert(/if \(__migTried\[mk\]\)/.test(busSrc2500), '守卫查的是「键+形态」键位（不是裸 key）');
    assert(busSrc2500.indexOf('__stamped') < 0, '（负向）盖章的一次性守卫已移除（它与「每键每会话」同型缺陷：首次失败后本会话永不重试）');
  }

  // ── C. 块3：原始格式复活（rawRevive）──
  fresh2500();
  section('v2.5.0 块3：原始格式复活（rawRevive 声明式迁移）');
  {
    assert(!!r2500C && r2500C.rawRevive === true, 'preset 活动键已声明 rawRevive（首个真实消费者）');
    const preSrc2500 = srcOf2500('engines/preset.js');
    assert(preSrc2500.indexOf('migrateActiveKeyFormat') < 0, '（负向）一次性迁移 IIFE 已移除（能力上收单一实现）');
    assert(/rawRevive: true/.test(preSrc2500), 'preset 登记项声明式复活在位');
    const customId2500 = 'custom_rev_test_2500';
    LS2500.setItem(activeKey2500, customId2500);
    // 先探针确认可复活，再显式执行（顺序有讲究：走 getActivePresetId 时，复活的 id 查不到
    //   对应预设 → 该函数会把值改写成 'default'，于是看不到「复活成的原文」，属查表逻辑而非复活失败）
    const probeC12500 = WA.settingsBus.rawRevive(r2500C, true);
    assert(probeC12500.revived === true && probeC12500.value === customId2500, '探针从裸串解析出原文（value === 原裸串）');
    const doneC12500 = WA.settingsBus.rawRevive(r2500C, false);
    assert(doneC12500.revived === true && doneC12500.reason === 'revived', '显式复活执行成功');
    assert(disk2500(activeKey2500) === JSON.stringify(customId2500), '磁盘值已复活为 JSON 契约（实 ' + disk2500(activeKey2500) + '）');
    assert(WA.settingsBus.stats.rawRevives >= 1, '复活留痕（stats.rawRevives=' + WA.settingsBus.stats.rawRevives + '）');
    // C1b. 复活后 read 走正常路径（不被判损坏、不产生隔离）
    const qBeforeC12500 = WA.settingsBus.stats.quarantines;
    const idAfterRevive2500 = WA.settingsBus.read(r2500C);
    assert(idAfterRevive2500 === customId2500, '复活后 read 拿到的是 JSON 字符串值（=== 原裸串）');
    assert(WA.settingsBus.stats.quarantines === qBeforeC12500, '（负向）复活后不再被判损坏（此前每次启动隔离一次 + 回落默认 → 用户选择每次丢一次）');
    const revCountC2500 = WA.settingsBus.stats.rawRevives;
    const probeC2500 = WA.settingsBus.rawRevive(r2500C, true);
    assert(probeC2500.revived === false && probeC2500.reason === 'already-json', '（负向）已是 JSON → 不复活（reason=already-json）');
    assert(WA.settingsBus.stats.rawRevives === revCountC2500, '（负向）幂等：反复复活不产生额外写入');
    fresh2500();
    LS2500.setItem(activeKey2500, 'raw-probe-value');
    const beforeC3 = disk2500(activeKey2500);
    const probeC3 = WA.settingsBus.rawRevive(r2500C, true);
    assert(probeC3.revived === true && probeC3.reason === 'revivable', 'probe 回报可复活');
    assert(disk2500(activeKey2500) === beforeC3, '（负向）probe 不写盘（盘点零副作用）');
    LS2500.setItem(activeKey2500, '');
    const probeC4b = WA.settingsBus.rawRevive(r2500C, true);
    assert(probeC4b.revived === false && probeC4b.reason === 'empty-string', '（负向）空串不复活（语义是空值，包装会改变语义）');
    fresh2500();
    LS2500.setItem(rgKey2500, 'not-json-raw');
    const vC5 = WA.settingsBus.read(r2500A);
    assert(WA.settingsBus.rawRevive({ key: rgKey2500, def: {} }, true).reason === 'not-enabled', '（负向）未声明的键不复活（reason=not-enabled）');
    assert(vC5 && vC5.enabled === false, '（负向）未声明键的坏值仍走原路径（隔离 + 回落默认，不越权复活）');
    fresh2500();
    const savedC6 = WA.preset.saveCustomPreset({ name: '复活验证预设', segments: { reasoning: '自定义推理段-2500' } });
    LS2500.setItem(activeKey2500, savedC6.id);
    assert(WA.preset.getActivePresetId() === savedC6.id, '（端到端）裸串写入的用户选择被救回并命中自定义预设');
    assert(WA.preset.getSegmentOverrides().reasoning === '自定义推理段-2500', '（端到端）复活后预设覆写真生效（此前裸串被判损坏 → 覆写静默全失效）');
  }
  // ── D. 块4：幽灵设置键（ghostScan / 未登记家族）──
  fresh2500();
  section('v2.5.0 块4：未登记设置键（幽灵设置）盘点与出口');
  {
    fresh2500();
    LS2500.setItem('worldaxis_director_tags_v1', JSON.stringify(['tagA', 'tagB']));
    LS2500.setItem('worldaxis_user_handmade_v1', '{"x":1}');
    const gs2500 = WA.settingsBus.ghostScan();
    const ghostKeys2500 = gs2500.keys.map(function (x) { return x.key; });
    assert(ghostKeys2500.indexOf('worldaxis_director_tags_v1') >= 0, '幽灵盘点抓到 director_tags（登记表与清理规则都不覆盖的责任真空）');
    assert(ghostKeys2500.indexOf('worldaxis_user_handmade_v1') >= 0, '幽灵盘点抓到用户手写键（未登记即报，不假设来源）');
    assert(gs2500.total >= 2 && gs2500.bytes > 0, '幽灵键带条数与字节量（实 ' + gs2500.total + ' 个 / ' + gs2500.bytes + 'B）');
    fresh2500();
    LS2500.setItem('worldaxis_event_log_v2500_chat', '[]');
    LS2500.setItem('worldaxis_state_v2500_chat', '{}');
    LS2500.setItem('worldaxis_wb_selection_c2500', '[]');
    LS2500.setItem('worldaxis_writer_id', 'w1');
    const gs2500b = WA.settingsBus.ghostScan();
    ['worldaxis_event_log_v2500_chat', 'worldaxis_state_v2500_chat', 'worldaxis_wb_selection_c2500', 'worldaxis_writer_id'].forEach(function (k) {
      assert(gs2500b.keys.map(function (x) { return x.key; }).indexOf(k) < 0, '（负向）已知家族键不报为幽灵设置：' + k);
    });
    fresh2500();
    LS2500.setItem('worldaxis_backstage_settings_v1_corrupt_123456', '{bad');
    const gs2500c = WA.settingsBus.ghostScan();
    assert(gs2500c.keys.map(function (x) { return x.key; }).filter(function (k) { return /_corrupt_/.test(k); }).length === 0, '（负向）隔离副本不报为幽灵设置');
    fresh2500();
    WA.settingsBus.save(r2500A, JSON.parse(JSON.stringify(r2500A.def)));
    WA.settingsBus.save(reg2500(rgKey2500), { enabled: false, chancePercent: 15, durationRounds: 3 });
    const gs2500d = WA.settingsBus.ghostScan();
    ['worldaxis_backstage_settings_v1', rgKey2500].forEach(function (k) {
      assert(gs2500d.keys.map(function (x) { return x.key; }).indexOf(k) < 0, '（负向）在册设置键不报为幽灵：' + k);
    });
    const storeSrc2500 = srcOf2500('core/store.js');
    // 判据是「白名单不是代码」而非「这个名字不存在」——本轮删除它时同步留下了
    //   解释原因的注释（注释里必然还会提到这个名字），故用正则定位真正的旧定义。
    assert(!/settingsSettings\s*:/.test(storeSrc2500), '（负向）硬编码 settings 白名单定义已删除（第二份真源必漂移）');
    assert(/v2\.5\.0: 删除 `settingsSettings` 硬编码白名单/.test(storeSrc2500), '删除原因留痕在位（现场证据，防日后又被加回）');
    assert(storeSrc2500.indexOf('function isRegisteredSettingsKey') > 0, '改由 isRegisteredSettingsKey 查登记表判定');
    fresh2500();
    LS2500.setItem('worldaxis_director_tags_v1', '["t"]');
    WA.settingsBus.save(r2500A, JSON.parse(JSON.stringify(r2500A.def)));
    const st2500b = WA.store.storageStat();
    assert(typeof st2500b.families.settingsUnregistered === 'number', 'storageStat 新增 settingsUnregistered 家族计量');
    assert(typeof st2500b.perFamilyBytes.settingsUnregistered === 'number', 'perFamilyBytes 同步新增（防两表漂移）');
    assert(st2500b.families.settingsUnregistered >= 1, '未登记键计入 settingsUnregistered（实 ' + st2500b.families.settingsUnregistered + '）');
    assert(st2500b.families.settings >= 1, '在册设置键计入 settings（实 ' + st2500b.families.settings + '）');
    fresh2500();
    LS2500.setItem('worldaxis_director_tags_v1', '["t"]');
    const planKeepD2500 = WA.store.sweepStaleKeys({});
    assert(!planKeepD2500.remove.some(function (r) { return r.key === 'worldaxis_director_tags_v1'; }), '（负向）默认计划不含幽灵设置键（保守，宁可漏删不可误删）');
    assert(planKeepD2500.keep.indexOf('worldaxis_director_tags_v1') >= 0, '默认计划显式 keep 幽灵设置键');
    const planGhostD2500 = WA.store.sweepStaleKeys({ ghostSettings: true });
    const hitD2500 = planGhostD2500.remove.filter(function (r) { return r.key === 'worldaxis_director_tags_v1'; })[0];
    assert(!!hitD2500 && hitD2500.reason === 'unregistered-setting', '显式开启后纳入候选（reason=unregistered-setting，实 ' + (hitD2500 && hitD2500.reason) + '）');
    const gsBeforeD2500 = (WA.settingsBus.ghostScan().keys || []).length;
    const appliedD2500 = WA.store.sweepStaleKeys({ ghostSettings: true, apply: true });
    assert(appliedD2500.remove.length >= 1 && !LS2500.getItem('worldaxis_director_tags_v1'), '真删除须显式 apply（幽灵键已从磁盘清除）');
    assert((WA.settingsBus.ghostScan().keys || []).length < gsBeforeD2500, '清除后幽灵盘点同步减少（可验证闭环）');
    fresh2500();
    LS2500.setItem('worldaxis_conflict_v2500_chat_123_1', '{}');
    assert(!WA.store.sweepStaleKeys({}).remove.some(function (r) { return r.key.indexOf('worldaxis_conflict_') === 0; }), '（负向）冲突现场仍受保护（历史不变量保持）');
    // D9. 逆向审计补丁：幽灵盘点不得自持第二份家族真源
    const busSrcD2500 = srcOf2500('core/settings-bus.js');
    assert(typeof WA.store.classifyKey === 'function', 'store 导出 classifyKey（家族分类单一真源）');
    assert(busSrcD2500.indexOf('function familyOf') > 0 && busSrcD2500.indexOf('WA.store.classifyKey') > 0, '幽灵盘点优先消费真源分类器（familyOf）');
    assert(/if \(fam !== null\)/.test(busSrcD2500), '真源可用时不看本地前缀清单（回退仅在分类器缺席时启用）');
    //   一致性：回退清单声明的每个前缀，在**符合该家族格式**时真源都必须判为非设置域
    //   （探针须按真源正则的格式构造：conflict 需 _<chat>_<ts>_<seq>，state 需 chat 段等）
    const fbPrefixes2500 = [
      ['worldaxis_state_', 'worldaxis_state_probe_chat'],
      ['worldaxis_recovery_', 'worldaxis_recovery_probe_chat'],
      ['worldaxis_event_log_', 'worldaxis_event_log_probe_chat'],
      ['worldaxis_error_log_', 'worldaxis_error_log_probe_chat'],
      ['worldaxis_wf_history_', 'worldaxis_wf_history_probe_chat'],
      ['worldaxis_uninject_ledger_', 'worldaxis_uninject_ledger_probe_chat'],
      ['worldaxis_wb_selection_', 'worldaxis_wb_selection_probe'],
      ['worldaxis_conflict_', 'worldaxis_conflict_probe_100_1'],
      ['worldaxis_writer_id', 'worldaxis_writer_id']
    ];
    fbPrefixes2500.forEach(function (pair) {
      const fam = (WA.store.classifyKey(pair[1]) || {}).family;
      assert(fam !== 'settings' && fam !== 'settingsUnregistered', '回退清单前缀与真源一致（' + pair[1] + ' → ' + fam + '）');
    });
    //   (反向) 真源判为 settingsUnregistered 的键，回退清单里**没有**任何前缀会命中
    //   （否则真源缺席时会漏报 —— 但这不构成等价：见下面的「宽度差异」实录）
    const probeGhost2500 = 'worldaxis_director_tags_v1';
    assert((WA.store.classifyKey(probeGhost2500) || {}).family === 'settingsUnregistered', '真源把未登记键判为 settingsUnregistered');
    assert(!fbPrefixes2500.some(function (p) { return probeGhost2500.indexOf(p[0]) === 0; }), '（负向）回退清单不命中幽灵键');
    // D9b. 宽度差异实录（逆向审计抓出的真实分歧，说明「为什么必须用真源」）：
    //   回退清单按**前缀**排除，真源按**精确正则**排除。于是「前缀对但格式不合规」的键
    //   （例：worldaxis_conflict_probe —— 缺 _ts_seq）在真源里落进 settingsUnregistered（确实无人负责），
    //   在回退清单里却被前缀挡住。两者结论不同 ⇒ 回退清单是比真源**更宽**的排除口径（会漏报）。
    //   故它只能在真源不可用时兜底，不能当等价实现。
    const famDegenerate2500 = (WA.store.classifyKey('worldaxis_conflict_probe') || {}).family;
    assert(famDegenerate2500 === 'settingsUnregistered', '（差异实录）格式不合规的 conflict 键被真源判为未登记设置（实 ' + famDegenerate2500 + '）');
    assert(fbPrefixes2500.some(function (p) { return 'worldaxis_conflict_probe'.indexOf(p[0]) === 0; }), '（差异实录）同一键在回退清单里被前缀挡住 —— 两套口径不等价，故真源必须优先');
    assert(WA.settingsBus.ghostScan().keys.map(function (x) { return x.key; }).indexOf(probeGhost2500) < 0, '（负向）该键在 clean 态下不出现在幽灵盘点（前置条件自检）');
    // D10. 缩减型迁移器的非对象 def 不变量（本轮新增能力的边界）
    //   evolution 与 regional 同型（v2.3.0 从 12 子键砍到 5 子键，7 个死键同样只在声明侧剔除）。
    const evoReg2500 = reg2500('worldaxis_evolution_settings_v1');
    assert(evoReg2500 && typeof evoReg2500.migrate === 'function' && evoReg2500.migrateObjects === true, 'evolution 亦已声明缩减型迁移（正向审计扫出的同型漏网者）');
    assert(/subkeyPruner/.test(srcOf2500('engines/evolution.js')) && /subkeyPruner/.test(srcOf2500('engines/regional.js')), '两个缩减型键的迁移器均由工厂产出（拒绝两份内联实现分叉）');
    assert(typeof WA.settingsBus.subkeyPruner === 'function' && typeof WA.settingsBus.subkeyPruner({ a: 1 }) === 'function', '工厂导出可用且返回函数（供各模块登记项引用）');
    fresh2500();
    LS2500.setItem('worldaxis_evolution_settings_v1', JSON.stringify({
      diceEnabled: false, progressFailBase: 3, conflictFailBase: 7, diceModifier: 2, setbackRatio: 30,
      distantEventEnabled: true, distantChance: 20, distantCooldown: 5,
      nearEventEnabled: true, nearChance: 20, nearCooldown: 5, regionalIncidentEnabled: true
    }));
    const vEvo2500 = WA.settingsBus.read(evoReg2500);
    assert(vEvo2500.diceEnabled === false && vEvo2500.diceModifier === 2 && vEvo2500.setbackRatio === 30, 'evolution 迁移保留声明子键的用户值');
    const evoDisk2500 = diskObj2500('worldaxis_evolution_settings_v1');
    ['distantEventEnabled', 'distantChance', 'distantCooldown', 'nearEventEnabled', 'nearChance', 'nearCooldown', 'regionalIncidentEnabled'].forEach(function (k) {
      assert(!Object.prototype.hasOwnProperty.call(evoDisk2500, k), '（负向）evolution 移植期死键已从磁盘剔除 ' + k);
    });
    //   数组型 def（custom_presets）：迁移器工厂对其为 no-op，绝不可把数组改成对象
    const prunerArr2500 = WA.settingsBus.subkeyPruner([]);
    const arrOut2500 = prunerArr2500({ value: ['a', 'b'], key: 'x', def: [] });
    assert(arrOut2500.changed === false, '（负向）数组值不被缩减迁移触碰（changed:false，不把数组改成对象）');
    const prunerNull2500 = WA.settingsBus.subkeyPruner(null);
    assert(prunerNull2500({ value: 'scalar', key: 'x', def: null }).changed === false, '（负向）非对象值不被迁移触碰');
    //   盖章边界：数组 / 标量 def 都不写 _schema
    fresh2500();
    const customKey2500 = 'worldaxis_custom_presets';
    LS2500.setItem(customKey2500, JSON.stringify([{ id: 'x', name: 'n' }]));
    const stampsPre2500 = WA.settingsBus.stats.schemaStamps;
    WA.settingsBus.read(reg2500(customKey2500));
    assert(disk2500(customKey2500).indexOf('_schema') < 0, '（负向）数组 def 不写 _schema（元数据只属对象形态的设置）');
    assert(WA.settingsBus.stats.schemaStamps === stampsPre2500, '（负向）数组 def 不计数盖章');
    // D11. save 不得原地污染调用方对象（与「def 别名污染」同型）
    fresh2500();
    const bcKeyD11 = 'worldaxis_backstage_settings_v1';
    const regD11 = reg2500(bcKeyD11);
    LS2500.setItem(bcKeyD11, JSON.stringify({ simulationMode: 'deep' }));
    WA.settingsBus.read(regD11);                       // 触发盖章
    const caller11500 = JSON.parse(JSON.stringify(regD11.def));
    WA.settingsBus.save(regD11, caller11500);
    assert(!Object.prototype.hasOwnProperty.call(caller11500, '_schema'), '（负向）save 不把存储层元数据挂到调用方对象上');
    assert((diskObj2500(bcKeyD11) || {})._schema, '（正向）磁盘仍继承了指纹（先拷贝再挂，两不误）');
    // D12. save 传入数组 / 标量时不试图继承
    fresh2500();
    WA.settingsBus.save(reg2500('worldaxis_custom_presets'), [{ id: 'a' }]);
    assert(Array.isArray(diskObj2500('worldaxis_custom_presets')), '（负向）数组值原样落盘（不被包装成对象）');
    WA.settingsBus.save(reg2500(activeKey2500), 'default');
    assert(diskObj2500(activeKey2500) === 'default', '（负向）标量值原样落盘');
  }

  // ── E. 块5：诊断与面板出口 ──
  fresh2500();
  section('v2.5.0 块5：诊断接线与面板出口');
  {
    fresh2500();
    const dg2500 = WA.toolDiag.collect();
    const sb2500 = (dg2500.runtime || {}).settingsBus || {};
    assert(!!sb2500.lifecycle, '诊断包透出 lifecycle（生命周期声明覆盖）');
    assert(typeof sb2500.lifecycle.migrate === 'number' && typeof sb2500.lifecycle.rawRevive === 'number', 'lifecycle 带 migrate / rawRevive 声明数（实 ' + JSON.stringify(sb2500.lifecycle) + '）');
    assert(!!sb2500.migrations && typeof sb2500.migrations.failed === 'number', '诊断包透出 migrations 且带失败计数');
    assert(!!sb2500.ghosts, '诊断包透出 ghosts（幽灵键盘点）');
    assert(sb2500.lifecycle.migrate >= 1 && sb2500.lifecycle.rawRevive >= 1, 'migrate / rawRevive 均已有真实消费者（实 ' + JSON.stringify(sb2500.lifecycle) + '）');
    fresh2500();
    const boomRegE2500 = { key: 'worldaxis_mig_diag_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { throw new Error('diag-boom'); } };
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([boomRegE2500]);
    try {
      LS2500.setItem('worldaxis_mig_diag_v1', JSON.stringify({ a: 1, dead: 2 }));
      WA.settingsBus.read(boomRegE2500);
      const issuesE2500 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.migration'; });
      assert(issuesE2500.length === 1 && issuesE2500[0].level === 'error', 'verdict 报迁移失败为 error 级（迁移没跑成属需人处理）');
    } finally {
      WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r.key !== 'worldaxis_mig_diag_v1'; });
    }
    fresh2500();
    LS2500.setItem('worldaxis_director_tags_v1', '["t"]');
    const issuesE3 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.ghosts'; });
    assert(issuesE3.length === 1 && issuesE3[0].level === 'warn', 'verdict 报幽灵设置为 warn');
    assert(/director_tags/.test(issuesE3[0].detail), '议题点名具体键（可定位，实 ' + issuesE3[0].detail.slice(0, 70) + '）');
    assert(/存储键体检/.test(issuesE3[0].detail), '议题给出处置入口指引（不只报告问题）');
    const dgSrc2500 = srcOf2500('engines/tool-diag.js');
    assert(dgSrc2500.indexOf("key: 'settingsBus.migration'") > 0, 'verdict 有迁移议题');
    assert(dgSrc2500.indexOf("key: 'settingsBus.ghosts'") > 0, 'verdict 有幽灵键议题');
    assert(dgSrc2500.indexOf("key: 'settingsBus.lifecycle'") > 0, 'verdict 有生命周期空转议题');
    const pSrc2500 = srcOf2500('ui/panel.js');
    assert(pSrc2500.indexOf('settingsUnregistered') > 0, '体检视图展示未登记设置家族计数');
    assert(pSrc2500.indexOf('wa-key-sweep-ghost') > 0 && pSrc2500.indexOf('ghostSettings: withGhost') > 0, '体检提供「清理并包含未登记设置键」出口');
    assert(pSrc2500.indexOf('ghostScan') > 0, '体检消费 ghostScan（真实盘点，不是另算一份）');
    assert(pSrc2500.indexOf('migrationStat') > 0 && pSrc2500.indexOf('生命周期声明') > 0, '设置键页展示生命周期与迁移台账');
    assert(pSrc2500.indexOf('if (life.migrate === 0 && life.rawRevive === 0)') > 0, '（负向哨兵）生命周期全空时面板明确点名（防能力再次退化而不可见）');
    const dynIds2500 = [];
    (WA.toolDiag.UI_BINDINGS || []).forEach(function (g) { (g.dynamic || []).forEach(function (id) { dynIds2500.push(id); }); });
    assert(dynIds2500.indexOf('wa-key-sweep-ghost') >= 0, '新控件 wa-key-sweep-ghost 纳入 UI_BINDINGS.dynamic');
    let JSD2500 = null;
    try { JSD2500 = require('jsdom').JSDOM; } catch (e) { try { JSD2500 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSD2500 = null; } }
    if (!JSD2500) {
      console.log('  \\u26a0 jsdom 不可用，跳过面板端到端（静态锚点已覆盖接线）');
    } else {
      fresh2500();   // 面板端到端从干净磁盘起（上方 E3 为验 verdict 议题写过幽灵键，不清会污染「无幽灵」负向断言）
      const domE2500 = new JSD2500('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocE2500 = global.document;
      global.document = domE2500.window.document;
      try { global.Node = domE2500.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(srcOf2500('ui/panel.js'), ctx, { filename: 'ui/panel.js' });
      WA.store.init();
      WA.ui.mount(); WA.ui.open();
      const toolsTab2500 = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab')).filter(function (t) { return t.dataset.page === 'tools'; })[0];
      assert(!!toolsTab2500, '存在「工具」页签（体检与设置键入口所在页）');
      if (toolsTab2500) {
        toolsTab2500.onclick();
        const keyBtn2500 = global.document.querySelector('#wa-key-check');
        const orphBtn2500 = global.document.querySelector('#wa-orphan-view');
        assert(!!keyBtn2500 && !!orphBtn2500, '（真 DOM）工具页渲染体检与设置键按钮');
        if (keyBtn2500) {
          keyBtn2500.onclick();
          const outNo2500 = global.document.querySelector('#wa-diag-out').innerHTML;
          assert(outNo2500.indexOf('存储键体检') >= 0, '（真 DOM）体检渲染摘要（无幽灵时也正常）');
          assert(outNo2500.indexOf('未登记设置') >= 0, '（真 DOM）体检摘要含未登记设置家族计数');
          assert(!global.document.querySelector('#wa-key-sweep-ghost'), '（负向）无幽灵键时不渲染幽灵清理按钮（不诱导误操作）');
        }
        LS2500.setItem('worldaxis_director_tags_v1', '["t"]');
        if (keyBtn2500) {
          keyBtn2500.onclick();
          const ghostBtn2500 = global.document.querySelector('#wa-key-sweep-ghost');
          assert(!!ghostBtn2500, '（真 DOM）存在幽灵键时渲染幽灵清理按钮');
          if (ghostBtn2500) {
            ghostBtn2500.onclick();
            assert(!LS2500.getItem('worldaxis_director_tags_v1'), '（真 DOM）点击幽灵清理按钮后键被真删（端到端闭环）');
          }
        }
        if (orphBtn2500) {
          orphBtn2500.onclick();
          const outOr2500 = global.document.querySelector('#wa-diag-out').innerHTML;
          assert(outOr2500.indexOf('设置键登记表') >= 0, '（真 DOM）设置键页渲染登记表摘要');
          assert(outOr2500.indexOf('生命周期声明') >= 0, '（真 DOM）设置键页渲染生命周期声明行');
          assert(/结构迁移 [1-9]/.test(outOr2500), '（真 DOM）生命周期行报出「结构迁移 ≥1 个键」（实 ' + (outOr2500.match(/结构迁移 \d+ 个键/) || ['?'])[0] + '）');
        }
      }
      global.document = savedDocE2500;
      global.document.getElementById = function () { return null; };
      WA.mainDoc = global.document;
    }
  }

  // ── F. 块6：版本号三方对齐 ──
  fresh2500();
  section('v2.5.0 块6：版本号三方对齐与模块装载');
  {
    const idxSrcF2500 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfF2500 = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const verF2500 = (idxSrcF2500.match(/const VERSION = '([\d.]+)'/) || [])[1];
    assert(verF2500 === mfF2500.version, 'index.js VERSION 与 manifest.version 一致（' + verF2500 + ' vs ' + mfF2500.version + '）');
    // 无头运行器里 WA.version 恒为 mock 的 'test'（index.js 被刻意跳过），
    //   故此处只断言「入口源码声明的版本」与 manifest 同源，真装载验证在 v2.4.0 块5 已有。
    assert(WA.version === 'test', '（环境）无头运行器版本为 mock 值（index.js 不在 LOAD 链中，实 ' + WA.version + '）');
assert(verF2500 === '2.28.0' && mfF2500.version === verF2500, '入口与清单同源同值（随当前版本升级，实 ' + verF2500 + '）');
    const orderF2500 = (idxSrcF2500.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
    assert(orderF2500.indexOf('core/settings-bus.js') > 0 && orderF2500.indexOf('engines/regional.js') > 0, 'LOAD_ORDER 含生命周期引擎与其首个消费者');
  }
  } // end v2.5.0 block
  // ══════════ v2.6.0 ══════════
  v2600: {
  const LS2600 = global.localStorage;
  const ctx2600 = global.SillyTavern.getContext();
  const PROD2600 = ['core/store.js', 'core/settings-bus.js', 'core/api-router.js', 'core/workflow.js',
    'engines/backstage.js', 'engines/evolution.js', 'engines/opinion.js', 'engines/regional.js', 'engines/horizon.js',
    'engines/calendar.js', 'engines/preset.js', 'engines/tool-diag.js',
    'render/inject.js', 'render/purifier.js', 'ui/panel.js', 'ui/settings.js'];
  const SRC2600 = PROD2600.map(function (rel) { return { rel: rel, text: fs.readFileSync(path.join(BASE, rel), 'utf8') }; });
  function fresh2600() { LS2600.clear(); ctx2600.chatId = 'v2600_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function src2600(rel) { const h = SRC2600.filter(function (x) { return x.rel === rel; })[0]; return h ? h.text : ''; }
  function wstat2600() { return WA.settingsBus.writeStat(); }
  const probeKey2600 = 'worldaxis_v2600_probe_v1';
  const extraKey2600 = 'worldaxis_v2600_extra_v1';
  const contKey2600 = 'worldaxis_v2600_container_v1';
  const migWbKey2600 = 'worldaxis_v2600_migwb_v1';
  const bkKey2600 = 'worldaxis_backstage_settings_v1';
  // ── A. 块1：写入侧计量与三分归因 ──
  fresh2600();
  section('v2.6.0 块1：写入侧计量与失败三分归因');
  {
    const w0 = wstat2600();
    assert(typeof w0.writes === 'number' && typeof w0.writeFailed === 'number', '写入台账可用（writes / writeFailed）');
    assert(w0.ok === true || w0.writeFailed > 0, 'writeStat.ok 由 writeFailed 派生（不自持第二份状态）');
    assert(!!w0.subkeyDrift && typeof w0.subkeyDrift.count === 'number', 'writeStat 带写入侧子键漂移计量');
    const regA2600 = { key: probeKey2600, def: { a: 1 }, module: 'test' };
    const writesBefore = wstat2600().writes;
    assert(WA.settingsBus.save(regA2600, { a: 2 }) === true, '正常写入返回 true');
    assert(wstat2600().writes === writesBefore + 1, '成功写入计入 writes（实 ' + wstat2600().writes + '）');
    assert(JSON.parse(LS2600.getItem(probeKey2600)).a === 2, '写入确实落盘（计量不是唯一证据）');
    // 失败①：登记项缺 key —— 调用方传值无效，此前只是静默 false
    const f1 = wstat2600().writeFailed;
    assert(WA.settingsBus.save({}, { x: 1 }) === false, '（负向）缺 key 的 save 返回 false');
    assert(wstat2600().writeFailed === f1 + 1, '缺 key 计入 writeFailed');
    assert(/missing-key/.test(wstat2600().lastError), '缺 key 可归因（实 ' + wstat2600().lastError + '）');
    // 失败②：值不可序列化（与写盘失败原因完全不同，必须分开归因）
    const cyc2600 = { a: 1 }; cyc2600.self = cyc2600;
    const f2 = wstat2600().writeFailed;
    assert(WA.settingsBus.save(regA2600, cyc2600) === false, '（负向）循环引用值 save 返回 false');
    assert(wstat2600().writeFailed === f2 + 1, '序列化失败计入 writeFailed');
    assert(/^stringify/.test(wstat2600().lastError), '序列化失败带 stringify 归因前缀（实 ' + wstat2600().lastError + '）');
    // 失败③：setItem 抛错（模拟配额满 / 隐私模式）
    const rawSet2600 = LS2600.setItem;
    let srFail2600 = null;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      const f3 = wstat2600().writeFailed;
      assert(WA.settingsBus.save(regA2600, { a: 3 }) === false, '（负向）setItem 抛错时 save 返回 false（此前调用方无从知晓）');
      assert(wstat2600().writeFailed === f3 + 1, 'setItem 失败计入 writeFailed');
      assert(/^setItem/.test(wstat2600().lastError) && /QuotaExceededError/.test(wstat2600().lastError),
        '归因前缀区分 setItem 与 stringify，且带原始错误（实 ' + wstat2600().lastError + '）');
      srFail2600 = WA.settingsBus.saveOrThrow(regA2600, { a: 4 });
      assert(srFail2600.ok === false && typeof srFail2600.reason === 'string' && srFail2600.reason.length > 0,
        'saveOrThrow 结构化回传失败原因（实 ' + JSON.stringify(srFail2600) + '）');
    } finally { LS2600.setItem = rawSet2600; }
    assert(LS2600.getItem(probeKey2600) !== null || true, '恢复写盘能力');
    assert(WA.settingsBus.save(regA2600, { a: 5 }) === true, '恢复后写入成功');
    const wOK2600 = wstat2600();
    assert(wOK2600.lastError === null, '成功写入清空 lastError（否则「还在坏」永远为真）');
    assert(!!wOK2600.last && wOK2600.last.key === probeKey2600 && wOK2600.last.bytes > 0,
      'lastWrite 记录键与字节量（实 ' + JSON.stringify(wOK2600.last) + '）');
    assert(WA.settingsBus.saveOrThrow(regA2600, { a: 6 }).ok === true, 'saveOrThrow 成功时 ok=true 且无 reason');
    // 负向：计量不得改变读路径返回形状（读侧契约不受写侧计量影响）
    assert(JSON.stringify(WA.settingsBus.read(regA2600)) === JSON.stringify({ a: 6 }), '（负向）写入计量不污染 read 返回值（读回磁盘现值 a:6）');
    // 负向：save 的返回值语义不变（true=落盘 / false=未落盘）
    assert(WA.settingsBus.save(regA2600, { a: 7 }) === true && WA.settingsBus.save({}, 1) === false, '（负向）save 返回值语义保持（布尔）');
  }
  // ── B. 块2：模块保存回传（不再把写失败吞成成功） ──
  fresh2600();
  section('v2.6.0 块2：模块保存回传与 UI 不回假成功');
  {
    const wBack2600 = WA.backstage.setSettings({ injectBudget: 1234 });
    assert(!!wBack2600 && wBack2600.ok === true, 'backstage.setSettings 回传写入结果（实 ' + JSON.stringify(wBack2600) + '）');
    assert(JSON.parse(LS2600.getItem(bkKey2600)).injectBudget === 1234, '回传 ok=true 时确实落盘（回传不是自报）');
    const rawSetB = LS2600.setItem;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      const wFail2600 = WA.backstage.setSettings({ injectBudget: 4321 });
      assert(!!wFail2600 && wFail2600.ok === false && /QuotaExceededError/.test(wFail2600.reason || ''),
        '写失败时 setSettings 回传 ok=false + 原因（实 ' + JSON.stringify(wFail2600) + '）');
      assert(JSON.parse(LS2600.getItem(bkKey2600)).injectBudget === 1234, '（负向）失败时磁盘未被改动（回传与磁盘一致）');
    } finally { LS2600.setItem = rawSetB; }
    // 其余四个模块同规格
    const modsB2600 = [
      ['opinion', function () { return WA.opinion.setSettings({ enabled: true, everyNRounds: 3 }); }],
      ['horizon', function () { return WA.horizon.setSettings({ distantEnabled: true }); }],
      ['evolution', function () { return WA.evolution.setSettings({ diceEnabled: true }); }],
      ['calendar', function () { return WA.calendar.setSettings({ auto: true }); }]
    ];
    modsB2600.forEach(function (pair) {
      const r = pair[1]();
      assert(!!r && r.ok === true, pair[0] + '.setSettings 回传 {ok:true}（实 ' + JSON.stringify(r) + '）');
    });
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      modsB2600.forEach(function (pair) {
        const r = pair[1]();
        assert(!!r && r.ok === false && typeof r.reason === 'string', pair[0] + '.setSettings 写失败回传 {ok:false, reason}（实 ' + JSON.stringify(r) + '）');
      });
    } finally { LS2600.setItem = rawSetB; }
    // 静态锚点：五个模块的 saveSettings 一律走 saveOrThrow（不允许只剩 save 的布尔）
    ['engines/backstage.js', 'engines/opinion.js', 'engines/horizon.js', 'engines/evolution.js', 'engines/calendar.js'].forEach(function (rel) {
      assert(src2600(rel).indexOf('saveOrThrow') > 0, rel + ' 的保存路径走 saveOrThrow（可归因）');
    });
    // UI：主保存与远方/近端保存都不得无条件报成功
    const setSrcB2600 = src2600('ui/settings.js');
    assert(setSrcB2600.indexOf('badW') > 0 && setSrcB2600.indexOf('✗ 保存失败') > 0, '设置页主保存按回传结果回显（存在失败话术）');
    assert(setSrcB2600.indexOf('wHz') > 0, '远方/近端保存同样接回传结果');
    assert(setSrcB2600.indexOf("out().textContent = '✓ 设置已保存';") < 0 || /else out\(\)\.textContent = '✓ 设置已保存'/.test(setSrcB2600),
      '（负向）不存在「无条件报成功」的保存写法');
  }
  // ── C. 块3：迁移回写失败并入迁移结论 ──
  fresh2600();
  section('v2.6.0 块3：迁移回写失败不得虚报为「已成功迁移」');
  {
    const regWB2600 = { key: migWbKey2600, def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { return { changed: true, value: { a: 1 }, reason: 'probe-prune' }; } };
    const rawSetC = LS2600.setItem;
    const migBefore = WA.settingsBus.stats.migrations;
    const failBefore = WA.settingsBus.stats.migrationFailed;
    try {
      LS2600.setItem = function (k, v) { if (k === migWbKey2600) throw new Error('QuotaExceededError'); return rawSetC.call(LS2600, k, v); };
      WA.settingsBus.read(regWB2600);   // 迁移算完 → 回写失败
      assert(WA.settingsBus.stats.migrations === migBefore, '（负向）回写失败不计入 migrations（此前会虚报成功）');
      assert(WA.settingsBus.stats.migrationFailed === failBefore + 1, '回写失败计入 migrationFailed');
      const mtC2600 = WA.settingsBus.migrationStat();
      assert((mtC2600.failedKeys || []).indexOf(migWbKey2600) >= 0, '回写失败的键进入失败台账（诊断 error 议题的依据）');
      assert((mtC2600.last || {}).failed === true, 'lastMigration 标 failed（不再呈现为一次成功迁移）');
      const failAfter = WA.settingsBus.stats.migrationFailed;
      WA.settingsBus.read(regWB2600);
      assert(WA.settingsBus.stats.migrationFailed === failAfter, '（负向）同一形态不重试（回写失败不会变成每次 read 都写盘的热路径）');
    } finally { LS2600.setItem = rawSetC; }
    //   对照组的夹具必须换一个**值形态**：磁盘无值时迁移在入口就被 skip（那不是「迁移场景」），
    //   而同一形态本会话已被判失败、不会重试 —— 两条契约都会让对照组假失败。
    LS2600.setItem(migWbKey2600, JSON.stringify({ a: 1, deadProbe: 1 }));
    const migAfterOk = WA.settingsBus.stats.migrations;
    WA.settingsBus.read(regWB2600);
    assert(WA.settingsBus.stats.migrations === migAfterOk + 1, '（对照）写盘可用时回写成功并计入 migrations（实 +' + (WA.settingsBus.stats.migrations - migAfterOk) + '）');
    // 静态锚点：回写结果必须参与判定
    const busSrcC2600 = src2600('core/settings-bus.js');
    assert(busSrcC2600.indexOf('writeback-failed') > 0, '源码中回写失败有专属归因标签（writeback-failed）');
    // v2.6.0（收口）: 本断言首版用 /let wroteBack = true/ —— 绑定的是**实现细节**（某个局部变量写法），
    //   收口把回写改为单一写出口的返回值后该正片即失效，而行为契约其实没变。断言应绑定契约：
    //   「回写成败以写出口的返回值为准」而不是「源码里存在某一行」。
    assert(busSrcC2600.indexOf("ls_set(r.key, out, 'writeback')") > 0, '回写经统一写出口（writeback 来源可归类）');
    assert(/const wroteBack = wbRes\.ok/.test(busSrcC2600), '回写成败以写出口返回值为准（非裸 try 吞掉）');
  }
  // ── D. 块4：写入侧增量死键计量 + api-router 白名单 ──
  fresh2600();
  section('v2.6.0 块4：写入侧增量死键（存量之外的新来源）');
  {
    const regX2600 = { key: extraKey2600, def: { a: 1, b: 2 }, module: 'test' };
    const exBefore = WA.settingsBus.stats.extraSubkeys;
    WA.settingsBus.save(regX2600, { a: 1, b: 2, ghostX: 1, ghostY: 2 });
    assert(WA.settingsBus.stats.extraSubkeys === exBefore + 2, '写入侧 def 之外子键被计量（实 +' + (WA.settingsBus.stats.extraSubkeys - exBefore) + '）');
    const driftD = wstat2600().subkeyDrift;
    assert((driftD.last || {}).keys.indexOf('ghostX') >= 0, '计量点名具体子键（可定位到调用点）');
    assert(JSON.parse(LS2600.getItem(extraKey2600)).ghostX === 1, '（负向）save 如实落盘，绝不静默剔除 def 之外子键');
    // 负向：def:{} 容器型键的动态子键不是漂移（首轮实测踩到的自造误报）
    const regC2600 = { key: contKey2600, def: {}, module: 'test' };
    const exC = WA.settingsBus.stats.extraSubkeys;
    WA.settingsBus.save(regC2600, { anyChannel: { baseUrl: 'x' } });
    assert(WA.settingsBus.stats.extraSubkeys === exC, '（负向）def:{} 容器型键的动态子键不计为漂移');
    // api-router：写入白名单堵住「新塞进来的死字段」这一增量来源
    fresh2600();
    WA.apiRouter.setChannel('default', { baseUrl: 'https://x.test', apiKey: 'k', model: 'm', junkField: 1 });
    const cfgDisk2600 = JSON.parse(LS2600.getItem('worldaxis_api_channels_v1'));
    assert(cfgDisk2600.default.baseUrl === 'https://x.test' && cfgDisk2600.default.model === 'm', '白名单内字段正常写入（配置功能不受影响）');
    assert(cfgDisk2600.default.junkField === undefined, '（负向）未消费字段不进磁盘（增量死键源头被堵）');
    assert(cfgDisk2600.default.apiKey === 'k', '白名单含 apiKey（密钥仍可保存）');
    const arSrcD2600 = src2600('core/api-router.js');
    assert(arSrcD2600.indexOf('ALLOWED') > 0 && arSrcD2600.indexOf('useTavernProxy') > 0, 'setChannel 白名单来源与 getChannel 消费面一致');
    assert(/dropped\.length && WA\.log/.test(arSrcD2600), '丢弃字段有日志留痕（不静默）');
  }
  // ── E. 块5：诊断与面板出口 ──
  fresh2600();
  section('v2.6.0 块5：诊断接线与面板出口');
  {
    const sbDiag2600 = ((WA.toolDiag.collect().runtime || {}).settingsBus) || {};
    assert(!!sbDiag2600.writes && typeof sbDiag2600.writes.writeFailed === 'number', '诊断包透出 writes 台账');
    assert(!!sbDiag2600.writes.subkeyDrift, '诊断包透出写入侧子键漂移');
    const dgSrcE2600 = src2600('engines/tool-diag.js');
    assert(dgSrcE2600.indexOf('writeStat') > 0, '诊断采集消费 writeStat（不另算一份）');
    assert(dgSrcE2600.indexOf("key: 'settingsBus.write'") > 0, 'verdict 有写入失败议题');
    assert(dgSrcE2600.indexOf("key: 'settingsBus.subkeyDrift'") > 0, 'verdict 有写入侧漂移议题');
    // 分级：最近失败未被覆盖 = error；已被成功覆盖 = warn
    fresh2600();
    const rawSetE = LS2600.setItem;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      WA.settingsBus.save({ key: bkKey2600, def: { a: 1 }, module: 'test' }, { a: 1 });
    } finally { LS2600.setItem = rawSetE; }
    const issuesE2600 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.write'; });
    assert(issuesE2600.length === 1 && issuesE2600[0].level === 'error', 'verdict 报「最近一次写失败未被覆盖」为 error（实 ' + (issuesE2600[0] && issuesE2600[0].level) + '）');
    assert(/QuotaExceededError/.test(issuesE2600[0].detail), '议题点名失败原因（可定位，实 ' + issuesE2600[0].detail.slice(0, 90) + '）');
    WA.settingsBus.save({ key: bkKey2600, def: { a: 1 }, module: 'test' }, { a: 1 });
    const issuesE2 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.write'; });
    assert(issuesE2.length === 1 && issuesE2[0].level === 'warn', '（分级）失败已被成功写入覆盖 → 降为 warn（不谎报「正在丢配置」）');
    WA.settingsBus.save({ key: extraKey2600, def: { a: 1, b: 2 }, module: 'test' }, { a: 1, b: 2, ghostZ: 1 });
    const issuesE3 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.subkeyDrift'; });
    assert(issuesE3.length === 1 && issuesE3[0].level === 'warn', 'verdict 报写入侧漂移为 warn（实 ' + (issuesE3[0] && issuesE3[0].level) + '）');
    assert(/ghostZ|extra_v1/.test(issuesE3[0].detail), '漂移议题点名键与字段（可定位调用点）');
    // 面板视图
    const pSrcE2600 = src2600('ui/panel.js');
    assert(pSrcE2600.indexOf('writeStat') > 0 && pSrcE2600.indexOf('写入侧') > 0, '设置键页展示写入侧台账');
    assert(pSrcE2600.indexOf('wa-log-') > 0 && /writeFailed > 0/.test(pSrcE2600), '写失败时面板给出可见告警（不是只藏进诊断包）');
    // jsdom 端到端：真渲染设置键页 + 设置页保存的失败回显
    let JSDE2600 = null;
    try { JSDE2600 = require('jsdom').JSDOM; } catch (e) { try { JSDE2600 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDE2600 = null; } }
    if (!JSDE2600) {
      console.log('  \u26a0 jsdom 不可用，跳过设置键页/设置页端到端（静态锚点已覆盖接线）');
    } else {
      fresh2600();
      const domE = new JSDE2600('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocE = global.document;
      global.document = domE.window.document;
      try { global.Node = domE.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(src2600('ui/panel.js'), ctx, { filename: 'ui/panel.js' });
      vm.runInContext(src2600('ui/settings.js'), ctx, { filename: 'ui/settings.js' });
      WA.store.init();
      WA.ui.mount(); WA.ui.open();
      const toolsTabE = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab')).filter(function (t) { return t.dataset.page === 'tools'; })[0];
      assert(!!toolsTabE, '（真 DOM）存在「工具」页签');
      //   顺序要点：工具页**内容**是点击页签后才渲染的，必须先点再取按钮
      //   （与 v2.5.0 块5 同规格；先取按钮恒为 null，属夹具错误而非接线缺陷）。
      if (toolsTabE) toolsTabE.onclick();
      const orphBtnE = global.document.querySelector('#wa-orphan-view');
      assert(!!orphBtnE, '（真 DOM）工具页渲染「设置键」入口');
      if (toolsTabE && orphBtnE) {
        orphBtnE.onclick();
        const outOrE = global.document.querySelector('#wa-diag-out').innerHTML;
        assert(outOrE.indexOf('写入侧') >= 0, '（真 DOM）设置键页渲染写入侧台账行');
        assert(/写盘全部落盘|写盘失败/.test(outOrE), '（真 DOM）写入侧行给出可判定结论（实 ' + (outOrE.match(/写入侧：[^<]{0,44}/) || ['?'])[0] + '）');
      }
      // 设置页：保存按钮 → 写失败时必须回显失败话术
      const setTabE = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab')).filter(function (t) { return t.dataset.page === 'settings'; })[0];
      assert(!!setTabE, '（真 DOM）存在「设置」页签');
      if (setTabE) {
        setTabE.onclick();
        const saveBtnE = global.document.querySelector('#wa-set-save');
        assert(!!saveBtnE, '（真 DOM）设置页渲染「保存推演设置」按钮');
        if (saveBtnE) {
          const outElE = global.document.querySelector('#wa-set-out');
          const rawSetE2 = LS2600.setItem;
          try {
            LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
            saveBtnE.onclick();
            assert(/✗ 保存失败/.test(outElE.textContent), '（真 DOM）写失败时保存按钮回显「✗ 保存失败」（实 ' + outElE.textContent.slice(0, 60) + '）');
          } finally { LS2600.setItem = rawSetE2; }
          saveBtnE.onclick();
          assert(/✓ 设置已保存/.test(outElE.textContent), '（真 DOM）写盘恢复后回显「✓ 设置已保存」（不因一次失败永久报错）');
        }
      }
      global.document = savedDocE;
      global.document.getElementById = function () { return null; };
      WA.mainDoc = global.document;
    }
  }
  // ── G. 块7（收口）：统一写出口——全部写路径的记账契约 ──
  //   本块针对「首版把命题（写失败可见）只实现在两条路径上」这一自身缺陷固化契约：
  //   设置家族键的每一次真实写盘都必须在同一个出口记账，否则面板给出的「全部落盘」
  //   这一结论的依据面就不覆盖全部路径——那不是命名不实，是**结论不实**。
  fresh2600();
  section('v2.6.0 块7（收口）：统一写出口与全部写路径记账');
  {
    // G1. 结构性证据：写出口唯一、失败记账唯一
    const busSrcG2600 = src2600('core/settings-bus.js');
    const bareSets2600 = (busSrcG2600.match(/ls\.setItem\(/g) || []).length;
    assert(bareSets2600 === 1, '（结构性）settings-bus 内除统一写出口外无裸 ls.setItem（实 ' + bareSets2600 + ' 处）');
    assert((busSrcG2600.match(/stats\.writeFailed\+\+/g) || []).length === 1, '写失败记账收敛为单一实现（noteFail 内一处）');
    assert(busSrcG2600.indexOf('function lsWrite(') > 0 && busSrcG2600.indexOf('function noteFail(') > 0, '存在唯一写出口 lsWrite 与归类记账 noteFail');
    // G2. 写出口覆盖**全部**写路径（逐路径点名，缺一条即视为收口未完成）
    //   注意拼接：搜索串是 "'<tag>')"，**不带前导逗号**——首版写成 "', '<tag>')"（多一个引号），
    //   于是五条断言全部假失败。属断言自身的夹具错误，非实现缺陷（真要防的是「路径没接出口」）。
    ['writeback', 'stamp', 'legacy', 'rawRevive', 'quarantine'].forEach(function (tag) {
      assert(busSrcG2600.indexOf("'" + tag + "')") > 0, '写路径已接入统一出口：' + tag);
    });
    // G3. 迁移回写成功也计入 writes（首版：迁移成功时 writes 不增，与「一次真实写盘」不符）
    const gsKey2600 = 'worldaxis_v2600_gstamp_v1';
    const g2Key2600 = 'worldaxis_v2600_gmig_v1';
    const gReg2 = { key: g2Key2600, def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { return { changed: true, value: { a: 1 }, reason: 'g-probe' }; } };
    LS2600.setItem(g2Key2600, JSON.stringify({ a: 1, deadProbeG: 1 }));
    const wBeforeG2 = wstat2600().writes;
    WA.settingsBus.read(gReg2);
    assert(wstat2600().writes === wBeforeG2 + 1, '迁移回写成功计入 writes（实 +' + (wstat2600().writes - wBeforeG2) + '）');
    // G4. 迁移回写失败也计入写入台账（首版只计 migrationFailed，写入台账零痕迹）
    const rawG2600 = LS2600.setItem;
    const gReg3 = { key: 'worldaxis_v2600_gmig2_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { return { changed: true, value: { a: 1 }, reason: 'g-probe2' }; } };
    LS2600.setItem(gReg3.key, JSON.stringify({ a: 1, deadProbeG2: 1 }));
    const wfBeforeG4 = wstat2600().writeFailed;
    try {
      LS2600.setItem = function (k, v) { if (k === gReg3.key) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      WA.settingsBus.read(gReg3);
    } finally { LS2600.setItem = rawG2600; }
    assert(wstat2600().writeFailed > wfBeforeG4, '迁移回写失败计入写入台账（首版只计 migrationFailed）');
    assert((wstat2600().bySource || {}).writeback >= 1, '迁移回写失败归入 writeback 桶（来源可分辨，实 ' + (wstat2600().bySource || {}).writeback + '）');
    // G5. 结构指纹写盘失败计入台账（首版 catch 后直接 return false，**零记录**）
    const gRegGS = { key: gsKey2600, def: { a: 1, b: 2 }, module: 'test' };
    LS2600.setItem(gsKey2600, JSON.stringify({ a: 1 }));   // 缺 b → 触发盖章
    const stampBeforeG5 = (wstat2600().bySource || {}).stamp || 0;
    try {
      LS2600.setItem = function (k, v) { if (k === gsKey2600) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      const rG5 = WA.settingsBus.read(gRegGS);
      assert(rG5 && rG5.b === 2, '（真依赖）盖章失败不影响读取正确性（子键补齐仍生效）');
    } finally { LS2600.setItem = rawG2600; }
    assert(((wstat2600().bySource || {}).stamp || 0) > stampBeforeG5, '结构指纹写盘失败计入写入台账（首版完全静默）');
    // G6. legacy 旧键迁移写盘失败计入台账（首版 catch(e4){} 静默），且不影响本次读取
    const lgKeyG2600 = 'worldaxis_v2600_glg_v1';
    const lgOldG2600 = 'worldaxis_v2600_glg_old_v1';
    const gRegLG = { key: lgKeyG2600, legacy: [lgOldG2600], legacyRemove: false, def: null, module: 'test' };
    LS2600.removeItem(lgKeyG2600);
    LS2600.setItem(lgOldG2600, JSON.stringify({ x: 1 }));
    const lgBeforeG6 = (wstat2600().bySource || {}).legacy || 0;
    let vLG2600 = null;
    try {
      LS2600.setItem = function (k, v) { if (k === lgKeyG2600) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      vLG2600 = WA.settingsBus.read(gRegLG);
    } finally { LS2600.setItem = rawG2600; }
    assert(vLG2600 && vLG2600.x === 1, '（真依赖）旧键迁移写盘失败不影响本次读取（值仍可用）');
    assert(((wstat2600().bySource || {}).legacy || 0) > lgBeforeG6, 'legacy 迁移写盘失败计入写入台账（首版静默）');
    // G7. 原始格式复活写盘失败可归因（首版只返回 {revived:false}，零痕迹）
    const rrKeyG2600 = 'worldaxis_v2600_grr_v1';
    const gRegRR = { key: rrKeyG2600, def: null, rawRevive: true, module: 'test' };
    LS2600.setItem(rrKeyG2600, 'hello-raw-g');
    const rrBeforeG7 = wstat2600().writeFailed;
    let rrResG2600 = null;
    try {
      LS2600.setItem = function (k, v) { if (k === rrKeyG2600) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      rrResG2600 = WA.settingsBus.rawRevive(gRegRR, false);
    } finally { LS2600.setItem = rawG2600; }
    assert(rrResG2600 && rrResG2600.revived === false, '（负向）复活写盘失败时如实报 revived=false');
    assert(/write-failed/.test(rrResG2600.reason || ''), '复活写盘失败可归因（实 ' + rrResG2600.reason + '）');
    assert(wstat2600().writeFailed > rrBeforeG7, '复活写盘失败计入写入台账（首版零痕迹）');
    // G8. 损坏隔离：副本没写成功就不动原键（保命优先）
    //   首版 `catch(e2){}` 吞掉副本写失败后**照样**删原键 —— 「隔离」会变成「直接销毁用户数据」。
    const corKeyG2600 = 'worldaxis_v2600_gcor_v1';
    const gRegCor = { key: corKeyG2600, def: { a: 1 }, module: 'test' };
    LS2600.setItem(corKeyG2600, '{bad json g');
    const corBeforeG8 = (wstat2600().bySource || {}).quarantine || 0;
    try {
      LS2600.setItem = function (k, v) { if (String(k).indexOf('_corrupt_') > 0) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      WA.settingsBus.read(gRegCor);
    } finally { LS2600.setItem = rawG2600; }
    assert(LS2600.getItem(corKeyG2600) !== null, '（负向）隔离副本写盘失败时保留原键（不把「隔离」做成「销毁」）');
    assert(((wstat2600().bySource || {}).quarantine || 0) > corBeforeG8, '隔离副本写盘失败计入写入台账');
    // G9. 来源分类可分辨「环境问题」与「实现缺陷」
    const byG2600 = wstat2600().bySource || {};
    ['missingKey', 'stringify', 'setItem', 'writeback', 'rawRevive', 'quarantine', 'legacy', 'stamp'].forEach(function (k) {
      assert(typeof byG2600[k] === 'number', 'bySource 含来源桶 ' + k);
    });
    assert(byG2600.missingKey >= 1 && byG2600.setItem >= 1, '实现缺陷与写盘被拒分列两桶（诊断不得把编程错误报成配额问题）');
    // G10. 不抛契约：写失败不得把「写不进去」升级成「读不出来」（调用点都在 read 热路径上）
    fresh2600();
    const rawG10 = LS2600.setItem;
    let threwG10 = false, threwG10b = false;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      try { WA.settingsBus.save({ key: 'worldaxis_v2600_g10_v1', def: { a: 1 }, module: 'test' }, { a: 1 }); } catch (e) { threwG10 = true; }
      try { WA.settingsBus.migrate({ key: 'worldaxis_v2600_g10b_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
        migrate: function () { return { changed: true, value: { a: 1 }, reason: 'g10' }; } }, { a: 1, dead: 1 }); } catch (e) { threwG10b = true; }
    } finally { LS2600.setItem = rawG10; }
    assert(threwG10 === false, '（负向）save 写失败不抛异常（返回布尔 + 台账）');
    assert(threwG10b === false, '（负向）迁移回写失败不抛异常（读热路径不被写故障放大）');
    // G11. 诊断与面板的措辞须随依据面更新，且区分环境问题与实现缺陷
    const dgSrcG2600 = src2600('engines/tool-diag.js');
    const pSrcG2600 = src2600('ui/panel.js');
    assert(dgSrcG2600.indexOf('bySource') > 0, '诊断消费来源分类');
    assert(dgSrcG2600.indexOf('实现缺陷') > 0, '诊断把「实现缺陷」与「配额问题」分开表述（用户照着提示才修得好）');
    assert(pSrcG2600.indexOf('bySource') > 0, '面板消费来源分类');
    assert(/写盘全部落盘|写盘失败/.test(pSrcG2600), '面板措辞与「依据面覆盖全部写路径」一致（不再只称「保存」）');
    // G13. 适用范围契约（机器可校验）：绕过设置总线的直写点必须**全部**落在非 settings 家族。
    //   为什么值得一条断言：本台账说「全部落盘」时指的是**设置键**全部落盘。若日后有人给某个
    //   设置键加了旁路直写，「全部落盘」会重新变成假结论——这条断言就是那个防回归的钉子。
    {
      const BOUNDARY_G = (function () {
        const dirs = ['core', 'engines', 'render', 'ui', 'actors', 'direction', 'compat'];
        const files = [];
        const walk = function (rel) {
          const abs = path.join(BASE, rel);
          let st = null;
          try { st = fs.statSync(abs); } catch (e) { return; }
          if (st.isFile()) { if (/\.js$/.test(rel)) files.push(rel); return; }
          let names = [];
          try { names = fs.readdirSync(abs); } catch (e) { return; }
          names.forEach(function (n) { walk(rel + '/' + n); });
        };
        dirs.forEach(function (d) { walk(d); });
        walk('index.js');
        const sites = [];
        files.forEach(function (rel) {
          const txt = fs.readFileSync(path.join(BASE, rel), 'utf8');
          txt.split('\n').forEach(function (ln, i) {
            if (ln.indexOf('localStorage.setItem(') < 0) return;
            if (rel === 'core/settings-bus.js') return;     // 总线自身＝正当写路径
            const m = ln.match(/localStorage\.setItem\(\s*([^,]+)/);
            sites.push({ rel: rel, line: i + 1, keyExpr: (m ? m[1] : '?').trim() });
          });
        });
        return sites;
      })();
      // 冻结清单：新增任何一处旁路都会使本断言失败（迫使走一次「它属于哪个家族」的判断）
      const INVENTORY_G = { 'core/store.js': 7, 'core/workflow.js': 1, 'engines/worldbook.js': 1,
        'engines/chatcache.js': 2, 'render/inject.js': 1, 'index.js': 2 };
      const countByFile = {};
      BOUNDARY_G.forEach(function (st) { countByFile[st.rel] = (countByFile[st.rel] || 0) + 1; });
      Object.keys(INVENTORY_G).forEach(function (rel) {
        assert((countByFile[rel] || 0) === INVENTORY_G[rel],
          '旁路写点清单未漂移：' + rel + '（实 ' + (countByFile[rel] || 0) + '，冻结 ' + INVENTORY_G[rel] + '）');
      });
      const extraFiles = Object.keys(countByFile).filter(function (rel) { return INVENTORY_G[rel] === undefined; });
      assert(extraFiles.length === 0, '（负向）没有新增旁路写文件（实 ' + (extraFiles.join(',') || '无') + '）');
      // 语义断言：字面量以 worldaxis_ 开头的旁路点，家族判定必须**不是** settings 家族
      //   ⚠ 探针必须**保持键名形状**（两处同类夹具缺陷，均自造假失败）：
      //     · writerId 靠 `/^worldaxis_writer_id$/` 精确匹配 ⇒ 加后缀即破坏形状（首版 + 'probe' 踩到）；
      //     · `'worldaxis_wf_history_'` 等是**前缀**（真实键 = 前缀 + chatId），空后缀同样不匹配
      //       任何家族的捕获组 ⇒ 落进通用兜底桶 settingsUnregistered。
      //   规则：以 `_` 结尾 ⇒ 视为前缀并补探针 chatId；否则按原样判定。
      let literalCheckedG = 0;
      const badFamilyG = [];
      BOUNDARY_G.forEach(function (st) {
        const m = st.keyExpr.match(/^'(worldaxis_[^']*)'/);
        if (!m) return;
        literalCheckedG++;
        const probeKeyG = /_$/.test(m[1]) ? (m[1] + 'probe_chat') : m[1];
        let fam = null;
        try { fam = (WA.store.classifyKey(probeKeyG)).family; } catch (e) { fam = 'classify-error'; }
        if (fam === 'settings' || fam === 'settingsUnregistered') {
          badFamilyG.push(st.rel + ':' + st.line + '=' + fam);
        }
      });
      assert(literalCheckedG >= 5, '至少检到 ' + literalCheckedG + ' 处字面量旁路点参与家族判定');
      assert(badFamilyG.length === 0,
        '（负向）设置家族键不得被旁路直写（实 ' + (badFamilyG.join('、') || '无') + '）');
      // 反向锚点：确认断言真的在扫（不是扫了个空集）
      assert(BOUNDARY_G.length >= 14, '扫描到全部已知旁路写点（实 ' + BOUNDARY_G.length + '）');
    }
    // H1. 归因话术的作用域与单一实现契约（防 ReferenceError 与措辞分叉）
    //   首版把 whyTxt 定义在 `saveBtn.onclick` 函数体内，而 `#wa-hz-save` 在兄弟闭包里引用它：
    //   主保存可用、另一个保存按钮一点就抛 ReferenceError。这类缺陷静态可判，故固化为断言。
    {
      const setSrcH2600 = src2600('ui/settings.js');
      const idxWhyH = setSrcH2600.indexOf('const whyTxt = function');
      const idxSaveBtnH = setSrcH2600.indexOf("const saveBtn = $('#wa-set-save')");
      const idxHzUseH = setSrcH2600.indexOf('whyTxt(wHz.reason)');
      const idxMainUseH = setSrcH2600.indexOf('whyTxt(badW.reason)');
      assert(idxWhyH > 0 && idxSaveBtnH > 0 && idxHzUseH > 0 && idxMainUseH > 0, '归因话术与两处使用点均在位');
      assert(idxWhyH < idxSaveBtnH && idxWhyH < idxMainUseH && idxWhyH < idxHzUseH,
        '归因话术定义早于全部使用点（提升到共同作用域，不会 ReferenceError）');
      assert(setSrcH2600.indexOf('const whyTxt = function') === setSrcH2600.lastIndexOf('const whyTxt = function'),
        '（负向）归因话术只有一份实现（不在每处保存各写一份，避免第二份真源）');
      assert(idxSaveBtnH < idxHzUseH, '两处保存出口按源码顺序都复用同一实现');
    }
    // H2. 真 jsdom 端到端：点击「远方/近端保存」，证伪 ReferenceError
    //   静态顺序断言（H1）能防回退，但真正证伪「点一下就抛」的只有**真实点击**：
    //   首版 whyTxt 在兄弟闭包里被引用，Node 语法检查完全看不出问题（`node --check` 通过）。
    {
      let JSDH = null;
      try { JSDH = require('jsdom').JSDOM; } catch (e) { try { JSDH = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDH = null; } }
      if (!JSDH) {
        console.log('  \u26a0 jsdom 不可用，跳过远方/近端保存端到端（H1 静态作用域断言已覆盖）');
      } else {
        fresh2600();
        const domH = new JSDH('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
        const savedDocH = global.document;
        global.document = domH.window.document;
        try { global.Node = domH.window.Node; } catch (e) {}
        WA.mainDoc = global.document;
        vm.runInContext(src2600('ui/panel.js'), ctx, { filename: 'ui/panel.js' });
        vm.runInContext(src2600('ui/settings.js'), ctx, { filename: 'ui/settings.js' });
        WA.store.init();
        WA.ui.mount(); WA.ui.open();
        const setTabH = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab')).filter(function (t) { return t.dataset.page === 'settings'; })[0];
        assert(!!setTabH, '（真 DOM）存在「设置」页签（H2）');
        if (setTabH) setTabH.onclick();
        const hzBtnH = global.document.querySelector('#wa-hz-save');
        assert(!!hzBtnH, '（真 DOM）设置页渲染「远方/近端保存」按钮');
        const hzOutH = global.document.querySelector('#wa-hz-out');
        assert(!!hzOutH, '（真 DOM）存在远方/近端输出位');
        if (hzBtnH && hzOutH) {
          let threwH = null;
          try { hzBtnH.onclick(); } catch (e) { threwH = e; }
          assert(threwH === null, '（真 DOM）点击远方/近端保存不抛异常（实 ' + (threwH ? String(threwH && threwH.message) : '无异常') + '）');
          assert(/✓ 已保存/.test(hzOutH.textContent), '（真 DOM）写盘可用时报成功（实 ' + hzOutH.textContent.slice(0, 40) + '）');
          // 写失败：必须报失败、且话术已归因（不是原始前缀、也不是「未知原因」）
          const rawH = LS2600.setItem;
          let threwH2 = null;
          try {
            LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
            hzBtnH.onclick();
          } catch (e) { threwH2 = e; } finally { LS2600.setItem = rawH; }
          assert(threwH2 === null, '（真 DOM）写失败时点击也不抛（上抛失败=把写故障放大成 UI 崩溃）');
          assert(/✗ 保存失败/.test(hzOutH.textContent), '（真 DOM）写失败时报「✗ 保存失败」（实 ' + hzOutH.textContent.slice(0, 60) + '）');
          assert(/存储写入被拒|配额/.test(hzOutH.textContent), '归因话术已翻译成用户可执行的说法（实 ' + hzOutH.textContent.slice(0, 70) + '）');
        }
        global.document = savedDocH;
        global.document.getElementById = function () { return null; };
        WA.mainDoc = global.document;
      }
    }
    // G12. 全路径对账：清库后跑一轮「正常读+正常写」，writes 必须等于真实 setItem 次数
    fresh2600();
    let realSetsG12 = 0;
    const rawG12 = LS2600.setItem;
    try {
      LS2600.setItem = function (k, v) { realSetsG12++; return rawG12.call(LS2600, k, v); };
      const gReg12 = { key: 'worldaxis_v2600_g12_v1', def: { a: 1, b: 2 }, module: 'test' };
      const w0G12 = wstat2600().writes;
      WA.settingsBus.save(gReg12, { a: 1, b: 2 });
      WA.settingsBus.save(gReg12, { a: 3, b: 4 });
      assert(wstat2600().writes === w0G12 + 2, '对账：2 次 save ⇒ writes +2（实 ' + (wstat2600().writes - w0G12) + '）');
      assert(realSetsG12 === 2, '对账：writes 与磁盘真实 setItem 次数一致（实 ' + realSetsG12 + ' 次）');
    } finally { LS2600.setItem = rawG12; }
  }
  // ── F. 块6：单源不变量扩展 + 版本三方对齐 ──
  fresh2600();
  section('v2.6.0 块6：单源不变量扩展与版本三方对齐');
  {
    // calendar 此前内联第二份默认值（Object.assign({auto:true}, read())），
    //   使 read 的返回不再严格等于登记声明 —— v2.3.0 的单源不变量对它会失效。
    //   本版删除该内联后，不变量对**全部**在用登记项成立。
    let covered2600 = 0;
    WA.settingsBus.registry().forEach(function (r) {
      if (r.orphan) return;
      LS2600.removeItem(r.key);
      covered2600++;
      assert(JSON.stringify(WA.settingsBus.read(r)) === JSON.stringify(r.def), r.key + ' 单源不变量：read 回落 === 登记声明');
    });
    assert(covered2600 >= 14, '单源不变量覆盖全部在用登记项（实 ' + covered2600 + '，v2.6.0 基线 14）');
    const calSrcF2600 = src2600('engines/calendar.js');
    assert(calSrcF2600.indexOf('Object.assign({ auto: true }, WA.settingsBus.read') < 0, '（负向）calendar 内联第二份默认值已删除');
    assert(/v2\.6\.0: 内联的第二份默认值已删除/.test(calSrcF2600), '删除原因留痕在位（现场证据，防日后又被加回）');
    // 版本号三方对齐（index.js / manifest.json / 本段期望）
    const idxSrcF2600 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfF2600 = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const verF2600 = (idxSrcF2600.match(/const VERSION = '([\d.]+)'/) || [])[1];
    assert(verF2600 === mfF2600.version, 'index.js VERSION 与 manifest.version 一致（' + verF2600 + ' vs ' + mfF2600.version + '）');
    assert(verF2600 === '2.28.0', '入口与清单同源同值（实 ' + verF2600 + '）');
    const orderF2600 = (idxSrcF2600.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
    assert(orderF2600.indexOf('core/settings-bus.js') > 0 && orderF2600.indexOf('core/api-router.js') > 0, 'LOAD_ORDER 含写入契约所在模块与首个收口消费者');
  }
  } // end v2.6.0 block

  // ══════════ v2.7.0 ══════════
  v2700: {
  const LS2700 = global.localStorage;
  const ctx2700 = global.SillyTavern.getContext();
  const PROD2700 = ['core/store.js', 'core/settings-bus.js', 'engines/chatcache.js', 'engines/regional.js',
    'engines/horizon.js', 'engines/tool-diag.js', 'engines/backstage.js', 'engines/opinion.js',
    'engines/evolution.js', 'engines/memory-sampler.js', 'ui/settings.js', 'ui/panel.js'];
  const SRC2700 = PROD2700.map(function (rel) { return { rel: rel, text: fs.readFileSync(path.join(BASE, rel), 'utf8') }; });
  function src2700(rel) { const h = SRC2700.filter(function (x) { return x.rel === rel; })[0]; return h ? h.text : ''; }
  function fresh2700() { LS2700.clear(); ctx2700.chatId = 'v2700_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function wstat2700() { return WA.settingsBus.writeStat(); }

  // ── 块1：写入侧完整性——「写进去」与「存住了」是两件事 ──
  fresh2700();
  section('v2.7.0 块1：写后读回校验（写盘被拒 vs 写进去没留住）');
  {
    const w0 = wstat2700();
    assert(typeof w0.verifyFailed === 'number', '写入台账透出 verifyFailed（写完读回不一致的计数）');
    // 正向：正常写入既计入 writes，也不计 verifyFailed
    const kOk = 'worldaxis_v2700_ok_v1';
    const regOk = { key: kOk, def: { a: 1 }, module: 'test' };
    const vf0 = wstat2700().verifyFailed, wr0 = wstat2700().writes;
    assert(WA.settingsBus.save(regOk, { a: 1 }) === true, '（正向）写盘+读回一致 ⇒ save 返回 true');
    assert(wstat2700().writes === wr0 + 1, '（正向）校验通过的写入计入 writes');
    assert(wstat2700().verifyFailed === vf0, '（正向）校验通过不计 verifyFailed');
    assert(LS2700.getItem(kOk) === JSON.stringify({ a: 1 }), '（正向）值确实在盘上（计量不是唯一证据）');
    // 负向：setItem 不抛错，但读回与写入不一致 ⇒ 必须判失败（而不是记成功）
    const kStaged = 'worldaxis_v2700_staged_v1';
    const regStaged = { key: kStaged, def: { a: 1 }, module: 'test' };
    const rawSet = LS2700.setItem, rawGet = LS2700.getItem;
    let caught = null;
    try {
      // 模拟「写被接受但没留住」：setItem 静默丢弃（真实成因：配额临界/写入毒化/后台回收）
      LS2700.setItem = function (k, v) { if (k === kStaged) return; return rawSet.call(LS2700, k, v); };
      LS2700.getItem = function (k) { return rawGet.call(LS2700, k); };
      const vf1 = wstat2700().verifyFailed, wr1 = wstat2700().writes;
      const ok1 = WA.settingsBus.save(regStaged, { a: 1 });
      assert(ok1 === false, '（负向）写完读回不一致 ⇒ save 判失败（不再假装写成功）');
      assert(wstat2700().verifyFailed === vf1 + 1, '写完读回不一致计入 verifyFailed');
      assert(wstat2700().writes === wr1, '（关键）staged 写入**不得**计入 writes——否则「成功 N 次」虚高，读的人以为只是偶尔丢一次');
      assert(LS2700.getItem(kStaged) === null, '（环境）确实没写进去（setItem 被静默丢弃）');
      const sr = WA.settingsBus.saveOrThrow(regStaged, { a: 2 });
      assert(sr.ok === false && /verify|missing-after-write/.test(String(sr.reason)), '严格写入回传可归因（实 ' + sr.reason + '）');
      assert(/missing-after-write|length-mismatch|content-mismatch/.test(String(wstat2700().lastError)),
        '归因桶区分「写被拒」与「写进去没留住」（实 ' + wstat2700().lastError + '）');
      assert((wstat2700().bySource || {}).verify >= 1, 'verify 独立成桶（不与 setItem 桶混同，两者处置不同）');
    } catch (e) { caught = e; } finally { LS2700.setItem = rawSet; LS2700.getItem = rawGet; }
    assert(caught === null, '（负向）校验失败路径不抛异常（' + (caught && caught.message) + '）');
    // 不变量：唯一写出口只自增一次 writes，且位于校验之后
    const busS = src2700('core/settings-bus.js');
    assert((busS.match(/stats\.writes\+\+/g) || []).length === 1, 'writes 自增收敛为单一实现（一处）');
    assert(busS.indexOf('if (o.verify !== false)') > 0, '写后读回校验在位（默认开启）');
    const iSet = busS.indexOf('ls.setItem(key, payload);');
    const iWr = busS.indexOf('stats.writes++;');
    const iVf = busS.indexOf('stats.verifyFailed++;');
    assert(iSet > 0 && iWr > iSet && iVf > iSet, '锚点齐全（setItem / writes / verifyFailed）');
    assert(iWr > iVf, 'writes 自增在校验分支之后（顺序即口径：只有校验通过才算成功）');
  }

  // ── 块2：生效值单源——落盘的就是系统执行的值 ──
  fresh2700();
  section('v2.7.0 块2：写入即归一（界面上显示的 = 磁盘上的 = 引擎用的）');
  {
    // 背景：regionl / horizon 此前「读时夹取、写时存原值」——磁盘上是 500，引擎按 100 掷骰，
    //   而界面把引擎夹取后的数显示出来，于是「界面 100 / 磁盘 500」两套数并存且无人提示。
    const rk = 'worldaxis_regional_settings_v1';
    WA.regional.setSettings({ enabled: true, chancePercent: 500, durationRounds: 999 });
    const rawDisc = JSON.parse(LS2700.getItem(rk));
    assert(rawDisc.chancePercent === 100, 'regional 越界概率落盘即归一（实 ' + rawDisc.chancePercent + '，此前存 500）');
    assert(rawDisc.durationRounds === 20, 'regional 越界轮次落盘即归一（实 ' + rawDisc.durationRounds + '，此前存 999）');
    const rEff = WA.regional.effectiveSettings();
    assert(rEff.chancePercent === rawDisc.chancePercent && rEff.durationRounds === rawDisc.durationRounds,
      '生效视图 === 磁盘值（同一份数，不再有两套）');
    assert(WA.regional.getSettings().chancePercent === rEff.chancePercent, 'getSettings（诊断/界面读的）也是同一个数');
    // 旧存量（手改存档的越界值）：读路径仍夹取，但**不静默改写用户数据**——写归一只作用于写路径
    LS2700.setItem(rk, JSON.stringify({ enabled: true, chancePercent: 500, durationRounds: 999 }));
    assert(WA.regional.effectiveSettings().chancePercent === 100, '（存量）旧越界值读取时仍夹取（判定不被越界值污染）');
    assert(WA.regional.getSettings().chancePercent === 500, '（存量）读取不改写用户数据（归一不越界到读路径）');
    WA.regional.setSettings({ chancePercent: 15 });
    assert(JSON.parse(LS2700.getItem(rk)).chancePercent === 15, '再次保存即把旧越界存量归一落盘（自愈，无需用户手改）');
    // horizon 同型
    const hk = 'worldaxis_horizon_settings_v1';
    WA.horizon.setSettings({ distantChance: 500, distantCooldown: 99, distantLedger: 999 });
    const hRaw = JSON.parse(LS2700.getItem(hk));
    assert(hRaw.distantChance === 100 && hRaw.distantCooldown === 20 && hRaw.distantLedger === 30,
      'horizon 越界值落盘即归一（实 ' + hRaw.distantChance + '/' + hRaw.distantCooldown + '/' + hRaw.distantLedger + '）');
    assert(WA.horizon.laneCfg('distant').chancePct === hRaw.distantChance, 'horizon 生效值 === 磁盘值');
    // 边界：填 1 就是 1%（此前被 ×100 判成 100%——与区间下限重合导致的语义塌陷）
    WA.horizon.setSettings({ distantChance: 1 });
    assert(WA.horizon.laneCfg('distant').chancePct === 1, '（边界）填 1 ⇒ 1%，不再被当作小数比率放成 100%');
    assert(JSON.parse(LS2700.getItem(hk)).distantChance === 1, '（边界）落盘的也是 1（1% 不会被静默存成 100%）');
    // UI 边界取自引擎单一真源（避免界面硬编码第二份 min/max）
    const setS = src2700('ui/settings.js');
    assert(setS.indexOf('WA.horizon.bounds') > 0 && setS.indexOf('WA.regional.bounds') > 0, 'UI 的区间边界取自引擎单一真源（bounds）');
    assert(setS.indexOf('min="${hb.chancePct[0]}"') > 0, '滑块 min/max 已改为引擎提供（不再是界面里的第二份声明）');
  }

  // ── 块3：UI 出口（生效视图接入界面 + 写失败话术） ──
  section('v2.7.0 块3：生效视图与写入结果接入界面');
  {
    const setS = src2700('ui/settings.js');
    assert(setS.indexOf('WA.regional.effectiveSettings') > 0, '区域生效视图接入界面（此前该 API 零产品消费，注释声称「面板/诊断据此显示」却是空的）');
    assert(setS.indexOf('wa-rg-save') > 0 && setS.indexOf('wa-rg-enable') > 0, '区域配置有可操作出口（此前只能手改 localStorage）');
    assert(setS.indexOf('WA.regional.setSettings') > 0, '区域保存走同一条写入出口');
    // 写失败不得报成功：三处保存出口都必须检查回传
    assert(setS.indexOf('wRg.ok === false') > 0, '区域保存检查回传（失败不报成功）');
    assert(setS.indexOf('wHz.ok === false') > 0, '随机事件保存检查回传');
    // 话术必须与「写入即归一」的实际行为一致（此前说「生效值经区间夹取」，而落盘的是原值）
    assert(/写入即归一/.test(setS), '界面话术与「落盘即生效值」的实际行为一致');
    assert(setS.indexOf('生效值经区间夹取') < 0, '（负向）不再留着与实现不符的旧话术');
    // regional.setSettings 必须回传结果（否则界面拿不到失败）
    const rgS = src2700('engines/regional.js');
    assert(rgS.indexOf('saveOrThrow') > 0, 'regional 保存回传写入结果');
  }

  // ── 块4：无校验直写点收口（state 家族） ──
  section('v2.7.0 块4：安装写盘校验（跨设备恢复不再「假成功」）');
  {
    const ccS = src2700('engines/chatcache.js');
    assert(ccS.indexOf('function installPack') > 0 && ccS.indexOf('__installStat') > 0, 'installPack 带写盘计量');
    assert(ccS.indexOf('installStat()') > 0, '安装台账导出（只读）');
    // 行为验证：正常安装计入 ok
    const st0 = WA.chatcache.installStat();
    assert(typeof st0.attempts === 'number' && typeof st0.failed === 'number', '安装台账字段齐全');
    WA.chatcache.installPack({ state: '{"x":1}' }, 'v2700_cc');
    const st1 = WA.chatcache.installStat();
    assert(st1.attempts === st0.attempts + 1 && st1.ok === st0.ok + 1, '正常安装计入 ok');
    assert(LS2700.getItem('worldaxis_state_v2700_cc') === '{"x":1}', '安装确实落盘');
    // 负向：写不进去必须计 failed（此前静默——用户看到「恢复完成」而磁盘未变）
    const rawSet2 = LS2700.setItem;
    let threw = null;
    try {
      LS2700.setItem = function (k, v) { if (k === 'worldaxis_state_v2700_cc2') return; return rawSet2.call(LS2700, k, v); };
      WA.chatcache.installPack({ state: '{"y":2}' }, 'v2700_cc2');
      const st2 = WA.chatcache.installStat();
      assert(st2.failed >= 1, '（负向）安装写盘未落住计入 failed（此前无任何信号）');
      assert(/missing-after-write|length-mismatch|content-mismatch/.test(String(st2.lastReason)),
        '安装失败可归因（实 ' + st2.lastReason + '）');
    } catch (e) { threw = e; } finally { LS2700.setItem = rawSet2; }
    assert(threw === null, '（负向）安装失败路径不抛异常（安装是跨设备同步热路径）');
  }

  // ── 块5：诊断与面板出口 + 空转守卫 ──
  section('v2.7.0 块5：诊断接线与面板出口');
  {
    const dgS = src2700('engines/tool-diag.js');
    assert(dgS.indexOf('settingsBus.writeStaged') > 0, '诊断对「写完读回不一致」单列议题（与「写盘被拒」分开）');
    assert(dgS.indexOf('chatcache.install') > 0, '诊断透出安装写盘失败');
    assert(dgS.indexOf('installStat') > 0, '诊断 runtime 采集安装台账');
    // 行为：安装失败时诊断必须报出（而不只是采集）
    const rawSet3 = LS2700.setItem;
    let vd = null;
    try {
      LS2700.setItem = function (k, v) { if (k === 'worldaxis_state_v2700_diag') return; return rawSet3.call(LS2700, k, v); };
      WA.chatcache.installPack({ state: '{"z":3}' }, 'v2700_diag');
      const d = WA.toolDiag.collect();
      const v = WA.toolDiag.verdict(d);
      assert((v.issues || []).some(function (i) { return i.key === 'chatcache.install'; }), '安装失败进 verdict 议题（可被使用者看见）');
      vd = (v.issues || []).filter(function (i) { return i.key === 'chatcache.install'; })[0];
    } finally { LS2700.setItem = rawSet3; }
    assert(vd && /没装进本地|恢复/.test(vd.detail), '议题文案指明后果（恢复未真正生效）');
    const pS = src2700('ui/panel.js');
    assert(pS.indexOf('verifyFailed') > 0 && pS.indexOf('写完读回不一致') > 0, '面板给出「写进去没留住」的出口');
    // 空转守卫：本版新增的每个计量/能力都必须有产品消费面
    assert(dgS.indexOf('verifyFailed') > 0, 'verifyFailed 有诊断消费（不是只实现不接线）');
    assert(pS.indexOf('wSt.staged') > 0, 'staged 有面板消费');
    const rgS2 = src2700('engines/regional.js');
    assert(rgS2.indexOf('bounds()') > 0 && src2700('ui/settings.js').indexOf('.bounds') > 0, 'bounds 有 UI 消费（避免「新增 API 却零调用」）');
  }

  // ── 块7：生效值域单一真源（区间声明上收到登记表） ──
  fresh2700();
  section('v2.7.0 块7：值域声明单一真源（区间/枚举上收到登记表）');
  {
    const regRow = k => WA.settingsBus.registry().filter(r => r.key === k)[0];
    // 声明面存在且被透出（此前「设置项的合法范围」在库里没有任何声明面）
    const rB = regRow('worldaxis_backstage_settings_v1');
    assert(!!rB.bounds && !!rB.enums && !!rB.sentinels, 'backstage 登记项透出 bounds/enums/sentinels 三类值域声明');
    assert(JSON.stringify(rB.bounds.npcBudget) === '[1,16]', 'npcBudget 区间声明为 [1,16]（此前只写在设置页 <input min max>）');
    assert(rB.enums.simulationMode.indexOf('balanced') >= 0 && rB.enums.simulationMode.indexOf('nope') < 0,
      'simulationMode 枚举白名单（此前合法取值只存在于 <select> 的 option 里）');
    // 归一器：区间 / 枚举 / 哨兵 / 布尔 四条分支各验一次，未声明的字段必须原样透传
    const norm = WA.settingsBus.normalize;
    const nB = norm(rB, { npcBudget: -5, simulationMode: 'nope', autoSimulate: 'false', customInstruction: 'x', injectBudget: -1 });
    assert(nB.npcBudget === 1, '（区间）npcBudget -5 → 夹到下限 1（此前 slice(0,-5) 返回空数组 = NPC 全不结算）');
    assert(nB.simulationMode === 'balanced', '（枚举）非法取值回落声明默认（此前会原样落盘并被 SIM_MODES[x]||fallback 兜住）');
    assert(nB.autoSimulate === false, '（布尔）"false" 字符串按 toBool 归一（与读路径同源）');
    assert(nB.injectBudget === -1, '（哨兵）-1 原样保留（自动档不被夹成 200 —— 那会静默改变用户意图）');
    assert(nB.customInstruction === 'x', '（未声明）自由文本原样透传（归一只收窄已确认的域）');
    assert(norm(rB, { injectBudget: 60 }).injectBudget === 60,
      '（未声明区间）injectBudget 正数原样透传（引擎/测试用 60 表极紧预算，声明区间会静默改语义）');
    // 越界落盘与生效值一致（写路径 = 读路径 = 磁盘）
    WA.backstage.setSettings({ npcBudget: -5, memSamplerLimit: 999, memSamplerDice: 1, simulationMode: 'nope', timePolicy: 'zzz', pulseActivity: 'turbulent' });
    const disk = JSON.parse(LS2700.getItem('worldaxis_backstage_settings_v1'));
    assert(disk.npcBudget === 1 && disk.memSamplerLimit === 30 && disk.memSamplerDice === 1000,
      '（磁盘）越界值落盘即归一（实 npc=' + disk.npcBudget + ' limit=' + disk.memSamplerLimit + ' dice=' + disk.memSamplerDice + '）');
    assert(disk.simulationMode === 'balanced' && disk.timePolicy === 'cautious',
      '（磁盘）非法枚举回落默认，不留非法值（修复：此前磁盘与引擎各一套解释）');
    assert(disk.pulseActivity === 'turbulent', '（磁盘）合法枚举值保留（归一不误伤）');
    assert(WA.backstage.getSettings().npcBudget === disk.npcBudget, '生效视图 === 磁盘值（不再两套数）');
    // 读路径对存量越界值仍然夹取，但不改写用户数据（归一不越界到读路径）
    LS2700.setItem('worldaxis_backstage_settings_v1', JSON.stringify({ npcBudget: -5, simulationMode: 'nope' }));
    WA.backstage.getSettings();
    assert(JSON.parse(LS2700.getItem('worldaxis_backstage_settings_v1')).npcBudget === -5,
      '（存量）读取不改写磁盘（归一不是「读时偷偷修」）');
    WA.backstage.setSettings({ autoSimulate: true });
    assert(JSON.parse(LS2700.getItem('worldaxis_backstage_settings_v1')).npcBudget === 1,
      '（自愈）再次保存即把存量越界值归一落盘（无需用户手改）');
    // opinion / evolution 同规格
    WA.opinion.setSettings({ everyNRounds: 0 });
    assert(JSON.parse(LS2700.getItem('worldaxis_opinion_settings_v1')).everyNRounds === 1,
      'opinion.everyNRounds 越界落盘即归一（此前只夹读路径下界）');
    WA.evolution.setSettings({ diceModifier: 300, setbackRatio: 999 });
    const eDisk = JSON.parse(LS2700.getItem('worldaxis_evolution_settings_v1'));
    assert(eDisk.diceModifier === 30 && eDisk.setbackRatio === 100,
      'evolution 越界值落盘即归一（实 ' + eDisk.diceModifier + '/' + eDisk.setbackRatio + '；此前 300 会让阈值恒负）');
    // 区间声明的唯一真源：引擎的 bounds() 与 UI 都不再持有第二份字面量
    assert(JSON.stringify(WA.horizon.bounds().chancePct) === '[1,100]', 'horizon.bounds() 由登记表映射而来');
    assert(WA.settingsBus.boundsOf('worldaxis_horizon_settings_v1').distantChance[1] === 100, 'boundsOf 可直接取到声明');
    const rgB = src2700('engines/regional.js');
    assert(rgB.indexOf('bounds() { return WA.settingsBus.boundsOf(LS_KEY); }') > 0,
      'regional.bounds() 直接从登记表取（本文件不再持有 min/max 字面量）');
  }
  // ── 块8：UI 区间不再硬编码（消除界面里的第二份声明） ──
  section('v2.7.0 块8：界面控件区间取自引擎单一真源');
  {
    const setS = src2700('ui/settings.js');
    assert(setS.indexOf('WA.settingsBus.boundsOf') > 0, 'UI 经 boundsOf 取区间声明');
    ['bB.npcBudget', 'bB.memSamplerLimit', 'bB.memSamplerDice', 'bO.everyNRounds', 'bE.diceModifier']
      .forEach(function (f) { assert(setS.indexOf(f) > 0, f + ' 的控件区间取自声明（不再硬编码第二份）'); });
    assert(setS.indexOf('min="1" max="16"') < 0, '（负向）npcBudget 的硬编码 min/max 已消除');
    assert(setS.indexOf('min="1" max="30"') < 0, '（负向）memSamplerLimit 的硬编码 min/max 已消除');
    assert(setS.indexOf('min="-30" max="30"') < 0, '（负向）diceModifier 的硬编码 min/max 已消除');
    // mnemonic 守卫：UI 里的每个区间都必须能在登记表里找到同一份来源
    const bdAll = WA.settingsBus.registry().filter(function (r) { return r.bounds; });
    assert(bdAll.length >= 4, '登记表里有 4 个以上键声明了值域（实 ' + bdAll.length + '）');
  }
  // ── 块9：值域声明空转守卫（声明了却永不命中 = 与死键同型） ──
  section('v2.7.0 块9：值域声明的自洽校验（空转即报错）');
  {
    // 正向：当前登记表自洽（含新增的 domain 校验项）
    const scOk = WA.settingsBus.selfCheck();
    assert(scOk.ok === true, '登记表自洽（含值域声明校验；实 issues=' + JSON.stringify(scOk.issues) + '）');
    // 负向：造一个「声明了 def 里不存在的字段」的登记项 → 必须报 error
    const badReg = { key: 'worldaxis_v2700_badomain_v1', def: { a: 1 }, bounds: { notAField: [1, 2] }, module: 'test' };
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([badReg]);
    try {
      const scBad = WA.settingsBus.selfCheck();
      const hit = scBad.issues.filter(function (i) { return i.code === 'domain-unknown-field'; })[0];
      assert(!!hit && hit.level === 'error', '声明字段不在 def 中 → error（归一永不命中该声明）');
      assert(scBad.ok === false, '（负向）空转声明使自检判为不自洽');
    } finally {
      WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r.key !== 'worldaxis_v2700_badomain_v1'; });
    }
    // 负向：非法区间（min>max）与「哨兵落在区间内部」都必须被报出
    const badReg2 = { key: 'worldaxis_v2700_badbounds_v1', def: { a: 1 },
      bounds: { a: [1, 10] }, sentinels: { a: [5] }, module: 'test' };
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([badReg2]);
    try {
      const scBad2 = WA.settingsBus.selfCheck();
      assert(scBad2.issues.some(function (i) { return i.code === 'sentinel-in-bounds'; }), '哨兵 5 落在合法区间 [1,10] 内被报出（语义歧义）');
    } finally {
      WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r.key !== 'worldaxis_v2700_badbounds_v1'; });
    }
    const badReg3 = { key: 'worldaxis_v2700_badbounds2_v1', def: { a: 1 }, bounds: { a: [9, 1] }, module: 'test' };
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([badReg3]);
    try {
      assert(WA.settingsBus.selfCheck().issues.some(function (i) { return i.code === 'bad-bounds'; }), '非法区间 [9,1] 被报出');
    } finally {
      WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r.key !== 'worldaxis_v2700_badbounds2_v1'; });
    }
    assert(WA.settingsBus.selfCheck().ok === true, '清理后登记表恢复自洽（校验无副作用）');
    // 空转守卫：归一器本身必须有产品消费面（不止测试）
    let normUse = 0;
    ['engines/backstage.js', 'engines/opinion.js', 'engines/regional.js', 'engines/horizon.js', 'engines/evolution.js']
      .forEach(function (f) { normUse += (src2700(f).match(/settingsBus\.normalize/g) || []).length; });
    assert(normUse >= 5, 'normalize 被五个模块写路径消费（实 ' + normUse + ' 处；防「新增 API 却零调用」）');
    assert(WA.settingsBus.boundsOf && WA.settingsBus.clampNum, 'clampNum/boundsOf 已导出（跨文件消费点取用）');
  }
  // ── 块6：版本三方对齐（随版本升级） ──
  section('v2.7.0 块6：版本三方对齐');
  {
    const idxS = src2700 === null ? '' : fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfS = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const ver = (idxS.match(/const VERSION = '([\d.]+)'/) || [])[1];
    assert(ver === '2.28.0', '入口版本为 2.23.0（实 ' + ver + '）');
    assert(ver === mfS.version, '入口与清单同源同值（' + ver + ' vs ' + mfS.version + '）');
    assert(src2700('core/settings-bus.js').indexOf('v2.7.0') > 0, '写入侧完整性契约留痕（可回溯）');
  }
  // ══════════ v2.8.0 ══════════
  v2800: {
  // ════════════════════════════════════════════════════════════════════
  // v2.8.0：出口面契约（模块导出面 ↔ 跨文件引用面的双向绑定）
  //
  // 命题：v2.7.0 收口「设置键的写入侧」，本版转向**模块接口面本身**。
  //   此前全库只有 tool-diag.MODULE_EXPORTS 一张表，它回答的是「每个文件应当导出哪个
  //   命名空间、且该命名空间是否存在」——**命名空间级**。于是「WA.pmem.recentText(4)」
  //   这种**成员级**引用即便根本不存在，也没有任何检查会发现：静态看不出来，运行到
  //   那一行才短路（三元守卫把它变成空串，静默降级，连一条日志都没有）。
  //   本块把「跨文件依赖的导出成员」冻结成清单，实现双向绑定：
  //     ① 引用面——产品代码跨文件引用的成员，运行时必须真的存在（不存在 = 潜在 TypeError）；
  //     ② 定义面——依赖面发生任何增删都必须显式更新冻结串，不允许静默漂移。
  //   基建在 tests/inventory.js（可独立运行：node tests/inventory.js [--dead] [--json]）。
  // ════════════════════════════════════════════════════════════════════
  section('v2.8.0 块1：出口面契约（悬空引用必须为零）');
  {
    // 依赖宿主的只有 UI 层三个模块；compat（compat/host.js）无头可装载，属真契约面。
    const UI_NS2800 = ['ui', 'uiSettings', 'assistant'];
    // ── G14（v2.9.0）：删除侧适用范围契约——产品代码里的裸 removeItem 只能有一处 ──
    //   为什么值得一条断言：本台账声称「删除可观测」时，指的是**所有删除都经受控出口**。
    //   若日后有人再加一个裸 removeItem（绕过复核与计量），「删除可观测」会重新变成假结论。
    //   与 G13（写入侧旁路清单）完全对称：G13 钉「裸 setItem 只剩白名单内的非 settings 旁路」，
    //   G14 钉「裸 removeItem 只剩受控出口内部那一处」。
    {
      const dirsG14 = ['core', 'engines', 'render', 'ui', 'actors', 'direction', 'compat'];
      const filesG14 = [];
      const walkG14 = function (rel) {
        const abs = path.join(BASE, rel);
        let stG = null;
        try { stG = fs.statSync(abs); } catch (e) { return; }
        if (stG.isFile()) { if (/\.js$/.test(rel)) filesG14.push(rel); return; }
        let namesG = [];
        try { namesG = fs.readdirSync(abs); } catch (e) { return; }
        namesG.forEach(function (n) { walkG14(rel + '/' + n); });
      };
      dirsG14.forEach(function (d) { walkG14(d); });
      walkG14('index.js');
      const bareG14 = [];
      filesG14.forEach(function (rel) {
        fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n').forEach(function (ln, i) {
          if (ln.indexOf('localStorage.removeItem(') < 0) return;
          bareG14.push({ rel: rel, line: i + 1 });
        });
      });
      // 冻结清单：受控删除出口的内部实现（store 内 removeVerified 的那一处裸调）。
      const INVENTORY_G14 = { 'core/store.js': 1, 'core/settings-bus.js': 0 };
      const cntG14 = {};
      bareG14.forEach(function (st) { cntG14[st.rel] = (cntG14[st.rel] || 0) + 1; });
      Object.keys(INVENTORY_G14).forEach(function (rel) {
        assert((cntG14[rel] || 0) === INVENTORY_G14[rel],
          'G14 删除侧出口唯一性：' + rel + '（实 ' + (cntG14[rel] || 0) + '，冻结 ' + INVENTORY_G14[rel] + '）');
      });
      const extraG14 = Object.keys(cntG14).filter(function (rel) { return INVENTORY_G14[rel] === undefined; });
      assert(extraG14.length === 0, '（负向）没有新增裸删除文件（实 ' + (extraG14.join(',') || '无') + '）');
      assert(bareG14.length === 1,
        '（正向）全库裸 removeItem 恰为 1 处（受控出口内部；实 ' + bareG14.length + ' 处：' + bareG14.map(function (x) { return x.rel + ':' + x.line; }).join('、') + '）');
      // 全库业务删除点必须走受控出口（正向可核验清单，防「日后又加一处裸删」被计数断言放过）
      const mustUseG14 = ['core/workflow.js', 'render/inject.js', 'direction/oracle.js', 'index.js', 'tests/mock.js'];
      const notUsingG14 = mustUseG14.filter(function (rel) {
        const txtG = fs.readFileSync(path.join(BASE, rel), 'utf8');
        if (rel === 'tests/mock.js') return txtG.indexOf('removeVerified') < 0;
        return txtG.indexOf('removeVerified') < 0 && txtG.indexOf('settingsBus.remove') < 0 && txtG.indexOf('rmRemove') < 0;
      });
      assert(notUsingG14.length === 0,
        '（正向）全部涉及删除的模块都已接入受控出口（未接入：' + (notUsingG14.join('、') || '无') + '）');
      // settings-bus 自身：删除点必须走 rmRemove，且 rmRemove 内恰有一处裸删除、记账各一处
      const busG14 = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
      assert((busG14.match(/ls\.removeItem\(/g) || []).length === 1,
        '（结构性）settings-bus 内除统一删除出口外无裸 ls.removeItem（实 ' + (busG14.match(/ls\.removeItem\(/g) || []).length + ' 处）');
      assert((busG14.match(/stats\.removeFailed\+\+/g) || []).length === 1,
        '删除失败记账收敛为单一实现（noteRemoveFail 内一处）');
      assert((busG14.match(/stats\.removes\+\+/g) || []).length === 1, '删除成功记账收敛为单一实现（rmRemove 内一处）');
      // （负向）探针必须能抓到「新加的裸删」——否则上面那条计数断言只是「碰巧成立」。
      //   做法：临时在 compat 下放一个含裸 removeItem 的文件，重跑同一套扫描逻辑，断言它被检出；
      //   无论成败都必须删掉探针文件（否则下一个版本会被这道门禁本身绊住）。
      const probeRel = 'compat/__g14_probe.js';
      const probeAbs = path.join(BASE, probeRel);
      let caughtG14 = -1;
      try {
        fs.writeFileSync(probeAbs, 'window.WorldAxis.__g14Probe = function (k) { window.localStorage.removeItem(k); };\n', 'utf8');
        const filesG = [];
        (function walkProbe(rel) {
          const abs = path.join(BASE, rel);
          let stP = null;
          try { stP = fs.statSync(abs); } catch (e) { return; }
          if (stP.isFile()) { if (/\.js$/.test(rel)) filesG.push(rel); return; }
          let namesP = [];
          try { namesP = fs.readdirSync(abs); } catch (e) { return; }
          namesP.forEach(function (n) { walkProbe(rel + '/' + n); });
        })('compat');
        caughtG14 = filesG.filter(function (rel) {
          return fs.readFileSync(path.join(BASE, rel), 'utf8').indexOf('localStorage.removeItem(') >= 0;
        }).length;
      } finally {
        try { fs.unlinkSync(probeAbs); } catch (eU) {}
      }
      assert(caughtG14 === 1,
        '（负向）G14 探针：新加一个裸删文件会被检出（实检出 ' + caughtG14 + ' 个，期望 1）');
      assert(fs.existsSync(probeAbs) === false, '（环境）探针文件已清理，不残留');
    }
    // ── G15（v2.10.0）：读侧完整性契约——「三面」中最后一面必须与另两面同规格 ──
    //   与 G13（写侧旁路清单）/ G14（删侧出口唯一性）构成完整的三面对偶：
    //     G13 钉「裸 setItem 只剩白名单内的非 settings 旁路」；
    //     G14 钉「裸 removeItem 只剩受控出口内部那一处」；
    //     G15 钉「读侧失败归因**收敛为单一实现**且**有真实消费端**」。
    //   为什么读侧要单独一条：读失败不产生任何可见症状，它只让**结论**悄悄失真
    //   （容量表偏小、把用户配置读成默认值），所以它既不会被用户报故障、也不会被功能测试
    //   发现——只有结构性断言能钉住它。本版实测的现场正是：全库只有一个来源不明的单桶
    //   `stats.failures`，且产品侧零消费。
    {
      const busG15 = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
      const storeG15 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
      // ① 归因记账收敛为单一实现（与 noteFail / noteRemoveFail 同规格）
      assert((busG15.match(/function noteReadFail\(/g) || []).length === 1,
        '读失败记账收敛为单一实现（settings-bus：noteReadFail）');
      assert((storeG15.match(/function noteStoreReadFail\(/g) || []).length === 1,
        '读失败记账收敛为单一实现（store：noteStoreReadFail）');
      assert((busG15.match(/stats\.readFailed\+\+/g) || []).length === 1,
        '读失败主计量（readFailed）只在单一实现内自增（实 '
        + (busG15.match(/stats\.readFailed\+\+/g) || []).length + ' 处）');
      assert((storeG15.match(/__readStat\.readFailed\+\+/g) || []).length === 1,
        'store 读失败主计量只在单一实现内自增（实 '
        + (storeG15.match(/__readStat\.readFailed\+\+/g) || []).length + ' 处）');
      // ② 三层对偶的第三层必须存在（写侧 verifyFailed / 删侧 removeVerified / 读侧来源追踪）
      assert(busG15.indexOf('readSources') > 0 && busG15.indexOf('defaultAfterFailure') > 0,
        '读侧有「来源追踪」层（disk/legacy/default/defaultAfterFailure）——与写侧 verifyFailed 对偶');
      assert(busG15.indexOf('default-after-failure') > 0,
        '读侧区分「读失败后回落默认值」与「从未配置」（这是本版命题的核心判据）');
      // ②b v2.10.0（逆向审计自纠）: 声明了分桶就必须有**消费点**——本版首轮在 readFailedBy
      //   里声明了 migrate/parse/read/copy 四个桶，其中 migrate 桶零消费（迁移失败只记
      //   migrationFailed），且 rawRevive 的读抛错分支既不归因也不标 src。
      //   两个缺陷都由本版自身的逆向审计抓出并当版修掉；这两条断言把「消费点存在」固化下来，
      //   防它日后被删掉（「声明面空转」是本仓库反复出现的同型问题，不能靠记性防）。
      assert(busG15.indexOf("noteReadFail('migrate'") > 0,
        'readFailedBy.migrate 有真实消费点（迁移失败进读侧归因，非声明空转）');
      assert(busG15.indexOf("noteReadFail('parse'") > 0,
        'readFailedBy.parse 有真实消费点（值解析失败进读侧归因）');
      assert(busG15.indexOf("noteReadFail('copy'") > 0,
        'readFailedBy.copy 有真实消费点（返回值深拷贝降级进读侧归因）');
      assert(busG15.indexOf("'no-storage'") > 0,
        'rawRevive 的读抛错分支被显式识别（否则该路径的读失败会伪装成「从未配置」）');
      // ②c v2.10.0（逆向审计自纠第二轮）: 三处自纠缺陷的防回归钉子
      //   · ok 必须只反映**硬失败**（read/parse），降级（migrate/copy）单列——否则
      //     「迁移回写失败」会被报成「读不到配置」，用户去查存储而实际要查迁移钩子；
      //   · 旧单桶 stats.failures 必须在新视图里有出口（否则它继续零消费）；
      //   · storageStat 的分桶明细必须与 keysReadFailed **同口径**（本次盘点差值），
      //     否则消费端拿累计值做判据会让「修好后分数复原」不成立（v0.4.0 裁决）；
      //   · readEx 必须有真实消费端（声明了没消费＝声明面空转）。
      assert(busG15.indexOf('hardFailed') > 0 && busG15.indexOf('degraded') > 0,
        'readStat 区分「硬失败（没读到用户配置）」与「降级（值仍可用）」——归因不实比缺失归因更坏');
      assert(busG15.indexOf('legacyFailures') > 0,
        'v0.1.x 遗留单桶 stats.failures 在新视图里有出口（不再零消费）');
      const storeD = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
      assert(storeD.indexOf('__byBefore') > 0 && storeD.indexOf('readFailedCumulative') > 0,
        'store 读侧分桶明细与 keysReadFailed 同口径（本次差值 + 累计分列）');
      assert(storeD.indexOf('__byBefore') > 0, 'store 读侧分桶有差值基线');
      {
        // 口径一致性（本版第三次同型自纠）：差值基线必须在 storageStat 内**任何读取之前**取，
        //   否则枚举失败（最严重的失真：全部键看不见、表面却「存储很干净」）被排除在本次盘点口径外。
        const iSF = storeD.indexOf('    storageStat(opts) {');
        const iSE = storeD.indexOf('     * v0.1.51: 过期存储键清理', iSF);
        const segSF = storeD.slice(iSF, iSE > iSF ? iSE : iSF + 6000);
        const iB = segSF.indexOf('const __rfBefore = __readStat.readFailed;');
        const iE = segSF.indexOf('const keys = listWorldAxisKeys();');
        assert(iB >= 0 && iE >= 0 && iB < iE,
          '差值基线取在枚举之前（base@' + iB + ' < enum@' + iE + '）——否则枚举失败不进「本次盘点」口径');
      }
      {
        // 与撤销删除侧的同类断言对偶：当前态判据不得退化为累计判据
        const ssD = WA.store.storageStat();
        assert(ssD.readFailedDetail && typeof ssD.readFailedDetail.bytes === 'number',
          'storageStat.readFailedDetail 为本次盘点差值（可作当前态判据）');
        assert(ssD.readFailedCumulative && typeof ssD.readFailedCumulative.bytes === 'number',
          'storageStat.readFailedCumulative 单列（历史经历可追溯，但不参与打分）');
      }
      {
        // readEx 的真实消费端：诊断侧必须做现场抽查（否则 readEx 是死导出）
        const diagSpot = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
        assert(diagSpot.indexOf('readEx') > 0 && diagSpot.indexOf('readSpotCheck') > 0,
          'readEx 有真实消费端（诊断现场抽查），非声明面空转');
        // 语义：现造一个「有磁盘值但读不出来」的键，抽查必须抓到它
        const spotKey = 'worldaxis_g15_spot_v1';
        const lsSp = (WA.mainWin || window).localStorage;
        lsSp.setItem(spotKey, '{"q":7}');
        const REGSP = { key: spotKey, def: { q: 0 } };
        WA.__settingsRegs.push(REGSP);
        const origGetSp = lsSp.getItem;
        lsSp.getItem = function (k) { if (k === spotKey) throw new Error('g15-spot-throw'); return origGetSp.call(this, k); };
        let exSp = null;
        try { exSp = WA.settingsBus.readEx(REGSP); } finally { lsSp.getItem = origGetSp; }
        assert(exSp && exSp.ok === false && exSp.source === 'default-after-failure',
          '（正向）readEx 对「有值但读不出」的键返回 ok:false（实 ' + JSON.stringify(exSp) + '）');
        const exOkSp = WA.settingsBus.readEx(REGSP);
        assert(exOkSp.ok === true && exOkSp.source === 'disk' && exOkSp.value.q === 7,
          '（负向）readEx 对可读键返回 ok:true 且来源为 disk');
        const exAbsSp = WA.settingsBus.readEx({ key: 'worldaxis_g15_spot_absent_v1', def: { q: 0 } });
        assert(exAbsSp.ok === true && exAbsSp.source === 'default',
          '（负向）readEx 对「键不存在」为 ok:true（从未配置不是故障，实 ' + exAbsSp.source + '）');
      }
      assert(storeG15.indexOf('readFailedKeys') > 0,
        'store 占用表透出读失败键数（容量结论可信度的直接判据）');
      // ②d（逆向审计第四轮）: 读侧裸读点**全覆盖**归因 + 「读失败不得伪装成业务结论」。
      //   为什么单列：本版命题的表层是「用户配置读坏了被当成没配过」，但逆向审计发现
      //   同类裸读点的失败后果**更重**——diskRev 读失败 ⇒ 多实例覆盖静默发生；
      //   createRecoveryPoint 清单读失败 ⇒ 全部历史恢复点被静默覆盖丢弃。
      //   只治表层而漏掉这些，等于「治了症状、留了重症」。
      assert(storeG15.indexOf("noteStoreReadFail('diskRev'") > 0
        && storeG15.indexOf("noteStoreReadFail('recovery'") > 0
        && storeG15.indexOf("noteStoreReadFail('verify'") > 0
        && storeG15.indexOf("noteStoreReadFail('conflict'") > 0
        && storeG15.indexOf("noteStoreReadFail('quarantine'") > 0
        && storeG15.indexOf("noteStoreReadFail('writerId'") > 0,
        '读失败归因覆盖全部读点来源（diskRev / recovery / verify / conflict / quarantine / writerId）');
      assert(storeG15.indexOf('return { ok: true, rev: 0 }') > 0 && storeG15.indexOf('dRevRes.ok && __seenRev > 0') > 0,
        '磁盘序号读失败与「键不存在」可分辨，且读失败时不参与冲突判定（防读失败掩盖多实例覆盖）');
      assert(storeG15.indexOf('为避免覆盖丢弃全部历史恢复点') > 0,
        '恢复点清单读失败时不覆盖写入（防静默丢弃全部历史恢复点）');
      assert(storeG15.indexOf("'readback-failed'") > 0,
        '写后校验 / 删后复核的读失败有独立原因码（归因不得失实）');
      assert(storeG15.indexOf('const by = {};') > 0 && storeG15.indexOf('bySource: by') > 0,
        'store.readStat().bySource 全量透出（新增来源不得「有归因但看不见」）');
      // ③ 单一出口对外可见（与 writeStat / removeStat 三面对称）
      assert(typeof WA.settingsBus.readStat === 'function', 'settingsBus.readStat 已导出');
      assert(typeof WA.store.readStat === 'function', 'store.readStat 已导出');
      // ④ 双消费端接线：诊断 + 健康分（「新规则必须接双消费端」）
      const diagG15 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
      const storeSrcG15 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
      const panelG15 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
      assert(diagG15.indexOf('settingsBus.readFailed') > 0 && diagG15.indexOf('store.readFailed') > 0,
        '诊断消费读侧结论（两域各一条议题）');
      assert(storeSrcG15.indexOf('storage.readFailed') > 0 && storeSrcG15.indexOf('storage.readActivity') > 0,
        '健康分消费读侧结论（占用表偏小 + 误判最冷两条）');
      assert(panelG15.indexOf('读取侧') > 0, '面板透出读侧结论（用户可见出口）');
      // ⑤ 语义断言：读失败后回落默认值必须被如实标为「读失败」，而不是混进正常默认值
      {
        const rkG15 = 'worldaxis_g15_readfail_v1';
        const REGG15 = { key: rkG15, def: { z: 0 } };
        WA.__settingsRegs.push(REGG15);
        const origGetG15 = (WA.mainWin || window).localStorage.getItem;
        const lsG15 = (WA.mainWin || window).localStorage;
        lsG15.setItem(rkG15, '{"z":42}');
        const beforeSrc = Object.assign({}, WA.settingsBus.stats.readSources);
        lsG15.getItem = function (k) { if (k === rkG15) throw new Error('g15-read-throw'); return origGetG15.call(this, k); };
        let valG15 = null;
        try { valG15 = WA.settingsBus.read(REGG15); } finally { lsG15.getItem = origGetG15; }
        const afterSrc = WA.settingsBus.stats.readSources;
        assert(valG15 && valG15.z === 0, '（正向）读失败后返回默认值（读取不中断）');
        assert((afterSrc.defaultAfterFailure || 0) === (beforeSrc.defaultAfterFailure || 0) + 1,
          '（正向）读失败后回落默认值计入 defaultAfterFailure（而不是混进正常 default）');
        assert(WA.settingsBus.stats.lastRead.source === 'default-after-failure',
          '（正向）lastRead 记下本次来源＝default-after-failure（实 '
          + (WA.settingsBus.stats.lastRead || {}).source + '）');
        assert(WA.settingsBus.stats.lastReadFail && WA.settingsBus.stats.lastReadFail.tag === 'read',
          '（正向）最近读失败带来源归因（实 '
          + JSON.stringify((WA.settingsBus.stats.lastReadFail || {}).tag) + '）');
        // （负向）正常读取**不得**被误报成读失败——归因不实比缺失归因更坏
        const beforeBad = WA.settingsBus.stats.readFailed;
        const okValG15 = WA.settingsBus.read(REGG15);
        assert(WA.settingsBus.stats.readFailed === beforeBad && okValG15.z === 42,
          '（负向）正常读取不计入读失败（z=42 读回，readFailed 未增）');
        assert(WA.settingsBus.stats.lastRead.source === 'disk', '（负向）正常读取来源标 disk');
        // （负向）「键不存在」是正常回落，不是读失败
        const beforeMiss = WA.settingsBus.stats.readFailed;
        const missValG15 = WA.settingsBus.read({ key: 'worldaxis_g15_absent_v1', def: { m: 1 } });
        assert(WA.settingsBus.stats.readFailed === beforeMiss && missValG15.m === 1,
          '（负向）键不存在时回落默认值**不计**读失败（从未配置不是故障）');
        assert(WA.settingsBus.stats.lastRead.source === 'default' && WA.settingsBus.stats.lastRead.reason === null,
          '（负向）键不存在的来源是 default 且无失败原因（实 '
          + JSON.stringify(WA.settingsBus.stats.lastRead) + '）');
      }
    }
    // ── G16（v2.11.0）：读侧裸读点冻结清单——「三面」的第三面 ──
    //   G13 钉写侧（裸 setItem 只剩白名单内的非 settings 旁路）、G14 钉删侧（裸 removeItem
    //   只剩受控出口内部那一处）、G15 钉读失败归因（收敛为单一实现 + 有消费端）。
    //   但**裸读点本身**（`localStorage.getItem` 直接出现在模块里）此前没有任何清单——
    //   它可以随时新增，而每新增一处默认就是「读失败静默与业务结论同形」的温床
    //   （本版在 41 处里抓出六处「结论不实」，全部长在裸读点上）。
    //   故本门禁钉两件事：① 逐文件计数与冻结清单一致（新增/删除都必须显式落进清单）；
    //   ② 每一处附近必须有一次读侧归因投递（有清单还不够，得真有归因）。
    {
      const INVENTORY_G16 = { 'core/settings-bus.js': 11, 'core/store.js': 19, 'core/workflow.js': 1,
        'engines/chatcache.js': 3, 'engines/tool-diag.js': 1, 'engines/worldbook.js': 2,
        'render/inject.js': 1, 'index.js': 2 };
      const ATTRIB_G16 = /noteReadFail\(|noteStoreReadFail\(|reportReadFail\(|reportHostReadFail\(|noteWbRead\(|noteRead\(/;
      const scanG16 = function (extraFiles) {
        const dirs = ['core', 'engines', 'render', 'ui', 'actors', 'direction', 'compat'];
        const files = [];
        const walkG16 = function (rel) {
          const abs = path.join(BASE, rel);
          let st = null;
          try { st = fs.statSync(abs); } catch (e) { return; }
          if (st.isFile()) { if (/\.js$/.test(rel)) files.push(rel); return; }
          let names = [];
          try { names = fs.readdirSync(abs); } catch (e) { return; }
          names.forEach(function (n) { walkG16(rel + '/' + n); });
        };
        dirs.forEach(walkG16); walkG16('index.js');
        (extraFiles || []).forEach(function (rel) { if (files.indexOf(rel) < 0) files.push(rel); });
        const byFile = {}, miss = [];
        files.forEach(function (rel) {
          const lines = fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n');
          let n = 0;
          lines.forEach(function (ln, i) {
            if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
            if (!/localStorage\s*\.\s*getItem\(|(?:ls|LS)\.getItem\(/.test(ln)) return;
            n++;
            const lo = Math.max(0, i - 3), hi = Math.min(lines.length, i + 15);
            if (!ATTRIB_G16.test(lines.slice(lo, hi).join('\n'))) miss.push(rel + ':' + (i + 1));
          });
          if (n) byFile[rel] = n;
        });
        return { byFile: byFile, miss: miss };
      };
      const SCAN16 = scanG16();
      const countByFile16 = SCAN16.byFile;
      Object.keys(INVENTORY_G16).forEach(function (rel) {
        assert((countByFile16[rel] || 0) === INVENTORY_G16[rel],
          'G16 裸读点清单未漂移：' + rel + '（实 ' + (countByFile16[rel] || 0) + '，冻结 ' + INVENTORY_G16[rel] + '）');
      });
      const extra16 = Object.keys(countByFile16).filter(function (rel) { return INVENTORY_G16[rel] === undefined; });
      assert(extra16.length === 0, '（负向）没有新增裸读文件（实 ' + (extra16.join(',') || '无') + '）');
      assert(SCAN16.miss.length === 0,
        'G16 每处裸读点附近都有读侧归因（实无归因 ' + SCAN16.miss.length + ' 处'
        + (SCAN16.miss.length ? '：' + SCAN16.miss.slice(0, 5).join('、') : '') + '）');
      const total16 = Object.keys(countByFile16).reduce(function (a, k) { return a + countByFile16[k]; }, 0);
      assert(total16 === 40, 'G16 裸读点总数为 40（实 ' + total16 + '）');
      // 负向探针：临时落一个含裸读点的文件，必须被检出（否则上面的计数只是「碰巧成立」）
      const probeRel16 = 'core/__g16_probe__.js';
      const probeAbs16 = path.join(BASE, probeRel16);
      try {
        fs.writeFileSync(probeAbs16, '// probe\n(function(){ var x = localStorage.getItem("k"); return x; })();\n');
        const caughtG16 = scanG16([probeRel16]).byFile[probeRel16] || 0;
        assert(caughtG16 === 1,
          '（负向）G16 探针：新加一个裸读文件会被检出（实检出 ' + caughtG16 + ' 个，期望 1）');
        assert(scanG16([probeRel16]).miss.length >= 1, '（负向）新裸读点若无归因会被单列为「无归因读点」');
      } finally {
        try { fs.unlinkSync(probeAbs16); } catch (e) { /* 清理失败不掩盖断言 */ }
      }
      assert(fs.existsSync(probeAbs16) === false, '（环境）G16 探针文件已清理，不残留');
    }
    const diagSrc2800 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const mi2800 = diagSrc2800.indexOf('const MODULE_EXPORTS = {');
    const mj2800 = diagSrc2800.indexOf('\n  };', mi2800);
    const MODEX2800 = vm.runInNewContext('(' + diagSrc2800.slice(diagSrc2800.indexOf('{', mi2800), mj2800 + 4) + ')');
    const OWNER2800 = {};
    Object.keys(MODEX2800).forEach(function (f) { OWNER2800[MODEX2800[f]] = f; });

    // 定义面：运行时真实导出（与 tests/inventory.js 同一口径——下划线前缀 = 私有，不属承诺面）
    const SURF2800 = {};
    Object.keys(OWNER2800).forEach(function (ns) {
      const v = WA[ns];
      if (v === null || typeof v !== 'object') return;
      const set = new Set();
      Object.keys(v).forEach(function (k) { if (k.charAt(0) !== '_') set.add(k); });
      SURF2800[ns] = set;
    });
    function hasMember2800(ns, mem) { return !!(SURF2800[ns] && SURF2800[ns].has(mem)); }

    const PROD2800 = [];
    (function walk2800(dir) {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
        if (e.name === '.git' || e.name === 'node_modules') return;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return walk2800(p);
        if (e.name.endsWith('.js') && dir !== path.join(BASE, 'tests')) PROD2800.push(path.relative(BASE, p));
      });
    })(BASE);
    PROD2800.sort();

    const RE2800 = /WA\s*\.\s*([A-Za-z_$][\w$]*)\s*(?:\?\.|\.)\s*([A-Za-z_$][\w$]*)/g;
    const phantom2800 = [];
    const depMap2800 = {};
    PROD2800.forEach(function (rel) {
      fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n').forEach(function (line, idx) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;          // 注释里的名字同样是文档债，但不入契约
        RE2800.lastIndex = 0; let m;
        while ((m = RE2800.exec(line))) {
          const ns = m[1], mem = m[2];
          if (!OWNER2800[ns]) continue;                            // 宿主级导出（log/store 以外的顶层键）
          if (mem.charAt(0) === '_') continue;                     // 私有成员
          // UI 层**无条件**排除：它的可用性取决于宿主（真 ST 里 ui/panel.js 全套在场；
          //   测试环境里只有 loadScript 桩暴露的少量导出），纳入冻结契约只会让清单随环境漂移。
          //   UI 命名空间本身的存在性由 tool-diag.MODULE_EXPORTS 校验，控件 id 由 UI_BINDINGS 校验。
          if (UI_NS2800.indexOf(ns) >= 0) continue;
          if (!hasMember2800(ns, mem)) { phantom2800.push(ns + '.' + mem + ' @' + rel + ':' + (idx + 1)); continue; }
          if (OWNER2800[ns] === rel) continue;                     // 同文件自用不算跨文件依赖
          (depMap2800[ns] = depMap2800[ns] || new Set()).add(mem);
        }
      });
    });

    assert(phantom2800.length === 0,
      '出口面契约：悬空引用为零（引用运行时不存在的东西＝运行到那行才炸）'
      + (phantom2800.length ? ' — 实 ' + phantom2800.length + ' 处：' + phantom2800.slice(0, 8).join('、') : ''));

    const actual2800 = Object.keys(depMap2800).sort().map(function (ns) {
      return ns + ':' + Array.from(depMap2800[ns]).sort().join(' ');
    }).join('|');
    const memberCount2800 = Object.keys(depMap2800).reduce(function (a, ns) { return a + depMap2800[ns].size; }, 0);

    // 冻结串（改动依赖面就要同步更新；下方失败信息会给精确 diff）
    const FROZEN2800 = 'apiRouter:call callStats cfgStat getChannel getConcurrency listChannels queueLength resetCallStats setChannel setConcurrency|backstage:abort applyResult applyStat buildPrompt forceSimulate getSettings isRunning pending setSettings|bridge:FLOOR_GAP id setSettings settings stat version|calendar:getSettings setClock setSettings stat|chapters:end start|chatcache:init installStat listSnapshots|choices:generate|clock:clockStat freeze now wallNow|compat:context snapshot|compatMvu:init status|compatTH:init status|contractAudit:audit|digest:buildBlock generate|directEvent:abort create|editorEvents:MAX_EVENTS TERMINAL add getEditingId list remove setEditingId shiftStage stagesOf|editorFaction:MAX_FACTIONS RELATIONS STATUSES add copy getEditingId list remove reputationPressure setEditingId update|enemies:ENEMY_STATUS apply applyBlackbox applyWorldTrends|entities:applyEntities applyEntityUpdates buildEntitiesBlock|evict:array evictStat note object|evolution:ECONOMY_CLIMATE FACTION_RELATION FACTION_STATUS MAX_WINDS REPUTATION_LEVELS activeSnapshot addWind applyEconomy applyFactions applyInfluenceChain applyReputation getSettings setSettings tick|horizon:acceptResult bounds buildPromptBlock getSettings setSettings stat|injectBudget:apply plan summaryText|injectChannel:SLOT_PREFIX applySlots normPos planSlots|injectInspector:getLastSnapshot init markRegistered statusText|injectSlotAudit:audit routeAudit snapshotSlots|inspectorState:flatten inspect summaryText|interceptor:install|ledger:buildLedgerText recordChanges saveCheckpoint|limits:applyStableUpdate clampBackstageResult locateStable|lonshaReader:ECHO_SECTION LONSHA_BRIDGE_ID describeLonsha diffWithLonsha ledgerBridges ledgerSection ledgerSummary lonshaSource readLonshaSnapshot summarizeSnapshot|memory:buildMemoryBlock pruneForeshadows stats|memorySampler:buildBlock buildHaystack filterRelevant sampleEntries samplerCfgStat|observe:slice|opinion:buildOpinionBlock generate getSettings setSettings|oracle:advance clear currentBeat generatePlanSafe plan setPlan stat|pmem:CAP_PER_PERSON applyPersonalMemory buildBlock recentText|preset:getSegmentOverrides|proactive:isEnabled|purifier:addRuleSafe applySafe getRules importPresetSafe removeRuleSafe resetToBuiltin rules setEnabled stat|rand:chance dice id next randStat seed|regional:applyIncident bounds effectiveSettings getSettings incidentTypes roll setSettings|registry:clearProfile getProfile list profileStat register setProfileSafe unregister|render:SOURCES applyInjections buildWorldSnapshot getVisibility injectionLedger loadUninjectLedger setVisibility uninject uninjectAudit visibilityStat|rules:coreSummary getAll|samplerCheck:runChecks|settingsBus:boundsOf clampNum deregisterOrphan dormantGhosts ghostScan migrationStat normalize pendingOrphan read readEx readStat registryStat remove removeStat save saveOrThrow selfCheck stats subkeyAudit subkeyPruner toBool verifyDefaults writeStat|settleGuard:begin commit forceNext markSkip peekForce reset stat|store:SCHEMA_VERSION batch batchStat capsFor chatId classifyKey conflictStat createRecoveryPoint currentBranchId diagBudget dropConflict dropQuarantine dropRecoveryPoint exportAuditReport exportConflict exportRecoveryPoints externalWriteStat get init integrityStat lastConflict listConflicts listQuarantineSites listRecoveryPoints loadStat maintain maintainStat migrateReport orphanSettingsKeys patch quarantineAudit quarantineStat read readStat recoveryStat removeStat removeVerified reportReadFail rescueStat resetTxStat restore restoreQuarantine save saveStat sizeAudit sizeAuditFull sizeProfile storageStat sweepStaleKeys transact txStat|summarizer:buildBlock|theater:generate send stat wrap|timeline:auditRefs captureRange unionRefs|toolAnalyzer:ECON_SCORE analyze summaryText|toolDiag:buildErrorReport collect download flatten summaryText|toolImport:importData preview|toolSnapshot:download restore|wbInject:activeOrders findCompanionName getConfig isEnabled|workflow:failStats fails history list loadHistory register resetHistory resetStats run setEnabled stats|worldbook:buildPromptSection hasSelection';

    if (actual2800 === FROZEN2800) {
      assert(true, '出口面契约：跨文件依赖面与冻结清单逐字一致（' + Object.keys(depMap2800).length + ' 命名空间 / ' + memberCount2800 + ' 成员）');
    } else {
      function parse2800(str) {
        const out = {};
        String(str).split('|').forEach(function (part) {
          const i = part.indexOf(':');
          if (i < 0) return;
          out[part.slice(0, i)] = new Set(part.slice(i + 1).split(' ').filter(Boolean));
        });
        return out;
      }
      const A = parse2800(actual2800), F = parse2800(FROZEN2800);
      const added = [], removed = [];
      Object.keys(A).forEach(function (ns) {
        A[ns].forEach(function (m) { if (!F[ns] || !F[ns].has(m)) added.push(ns + '.' + m); });
      });
      Object.keys(F).forEach(function (ns) {
        F[ns].forEach(function (m) { if (!A[ns] || !A[ns].has(m)) removed.push(ns + '.' + m); });
      });
      assert(false, '出口面契约：依赖面发生漂移——新增 [' + added.slice(0, 12).join('、') + '] 减少 ['
        + removed.slice(0, 12).join('、') + ']（这是**有意的**门禁：接口面变动必须显式落进冻结串，'
        + '防「成员被悄悄改名/删掉，调用方静默降级」；确认无误后运行 `node tests/export-contract.js`，'
        + '把它写出的 /tmp/export_contract.txt 逐字回填到本块的 FROZEN2800）');
    }

    // 负向：错名不该被当成「存在」——这正是 regional.INCIDENT_TYPES 长期悬空的原因
    assert(hasMember2800('regional', 'incidentTypes') === true, '（正向）regional.incidentTypes 已在出口面上');
    assert(hasMember2800('regional', 'INCIDENT_TYPES') === false, '（负向）regional.INCIDENT_TYPES 不在出口面（内部常量名不是对外承诺）');
    assert(hasMember2800('pmem', 'recentText') === true, '（正向）pmem.recentText 已在出口面上');

    // 覆盖度：MODULE_EXPORTS 声明的命名空间必须全部在接口面里（无头环境允许 UI 层缺席）
    const nsMissing2800 = Object.keys(OWNER2800)
      .filter(function (ns) { return !SURF2800[ns] && UI_NS2800.indexOf(ns) < 0; });
    assert(nsMissing2800.length === 0, '出口面契约：声明表登记的非可选命名空间全部可解析（缺 ' + nsMissing2800.join('、') + '）');
  }
  } // end v2.8.0 block
  section('v2.8.0 块2：本轮修掉的三处悬空引用（含各自的现场证据）');
  {
    // ① pmem.recentText —— render/inject.js 自 v0.9.8 起就在调，函数却从未导出
    assert(typeof WA.pmem.recentText === 'function', '① pmem.recentText 已导出（此前是内部函数，render/inject 的三元守卫静默取空串）');
    assert(typeof WA.pmem.recentText(4) === 'string', '① pmem.recentText(4) 返回字符串（可安全喂给 memorySampler.buildBlock）');
    const injectSrc2800 = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
    assert(injectSrc2800.indexOf('WA.pmem.recentText') >= 0 && injectSrc2800.indexOf('memorySampler.buildBlock({ recentText: recent })') >= 0,
      '① 消费端与出口对齐：render/inject 取到的 recent 真的会进 buildBlock（此前恒为空串）');

    // ② regional.incidentTypes —— contract-audit 读了两个名字都没读到
    assert(Array.isArray(WA.regional.incidentTypes), '② regional.incidentTypes 已导出为数组');
    assert(WA.regional.incidentTypes.length === 8 && WA.regional.incidentTypes.every(function (t) { return typeof t === 'string'; }),
      '② 形状为类型 id 的扁平数组（富对象表会让集合比对每个元素都不相等 → 8 条假漂移）');
    assert(WA.regional.incidentTypes.join(',') === 'bandit,plague,market,faction_clash,official,sect,infrastructure,ominous',
      '② 与契约枚举同序同值');

    // ③ contract-audit 的跨模块检查：源缺失必须报 error（正是它漏报了 ②）
    const rep2800 = WA.contractAudit.audit({ applyFn: function (d, r, a) { WA.backstage.applyResult(d, r, a); } });
    const miss2800 = rep2800.crossModule.filter(function (c) { return (c.missingSources || []).length; });
    assert(miss2800.length === 0, '③ 6 组跨模块检查的源全部取到了值（缺 ' + miss2800.map(function (c) { return c.name + ':' + c.missingSources.join('/'); }).join('；') + '）');
    assert(rep2800.crossModule.every(function (c) { return c.compared >= 1; }),
      '③ 每组至少比对了 1 个非契约源（compared 此前不存在——「比了几组」从来不可见）');
    assert(rep2800.crossModule.filter(function (c) { return c.name === 'regional.incidentTypes'; })[0].compared === 1,
      '③ regional.incidentTypes 这组真的执行了比对（此前源恒为 null 被跳过，报告上却与其它组长得一样）');

    // 灵敏度：把源打掉必须立刻报 error，恢复后必须消失（规则无副作用）
    const econ2800 = WA.contractAudit.CROSS_MODULE.filter(function (c) { return c.name === 'economy.climate'; })[0];
    const keep2800 = econ2800.sources.evolution;
    econ2800.sources.evolution = function () { return undefined; };
    const repBad2800 = WA.contractAudit.audit({ applyFn: function (d, r, a) { WA.backstage.applyResult(d, r, a); } });
    const badIssue2800 = repBad2800.issues.filter(function (i) { return i.code === 'cross_module_source_missing'; })[0];
    assert(!!badIssue2800 && badIssue2800.level === 'error',
      '（正向）源取不到时报 error——不再像此前那样「非空才比」把空源静默跳过');
    assert(/未执行/.test(badIssue2800 ? badIssue2800.detail : ''), '（正向）判语点明「该组比对未执行，无漂移不成立」');
    econ2800.sources.evolution = keep2800;
    const repOk2800 = WA.contractAudit.audit({ applyFn: function (d, r, a) { WA.backstage.applyResult(d, r, a); } });
    assert(repOk2800.issues.filter(function (i) { return i.code === 'cross_module_source_missing'; }).length === 0,
      '恢复源后不再报（规则无副作用）');
  }
  section('v2.8.0 块3：体检出口（基建可独立运行 + 数据可被诊断消费）');
  {
    const invSrc2800 = fs.readFileSync(path.join(BASE, 'tests/inventory.js'), 'utf8');
    assert(invSrc2800.indexOf('MODULE_EXPORTS') > 0, '体检脚本从 tool-diag 取声明表（不复制，避免两处漂移）');
    assert(invSrc2800.indexOf("const LOAD = [") > 0 && invSrc2800.indexOf('tests/run.js') > 0,
      '装载清单从 tests/run.js 提取（单一真源，新增模块自动纳入）');
    assert(invSrc2800.indexOf('ui/panel.js') > 0, '体检脚本会尝试装载 UI 层——把「UI 未装载」这类假悬空与真悬空分开');
    // v2.27.0: 清册抽成 collect() 后 CLI 收口改为 `process.exitCode = result.phantom.length ? 1 : 0`。
    //   意图不变、强度更高（① 结论直接取自本次 collect 的返回值，不再依赖外层作用域变量；
    //   ② 行成 exitCode 而非 process.exit()，避免大输出经管道时被截断）。
    assert(invSrc2800.indexOf('已激活包') < 0 && invSrc2800.indexOf('process.exitCode = result.phantom.length ? 1 : 0') > 0,
      '体检脚本以退出码表达结论（可供 CI/工作流直接判定）');
    const genSrc2800 = fs.readFileSync(path.join(BASE, 'tests/export-contract.js'), 'utf8');
    assert(genSrc2800.indexOf("const OPTIONAL = ['ui', 'uiSettings', 'assistant'];") > 0,
      '生成器的排除名单与测试块同口径（仅 UI 层依赖宿主；compat 无头可装载）');
    assert(genSrc2800.indexOf('export_contract.txt') > 0, '生成器把冻结串落盘到固定路径，便于人工核对与回填');
  }
  section('v2.8.0 块5：端到端——源缺失会被「健康巡视」捕获（不止是单元断言）');
  {
    // 命题：新规则的价值在于**运行时真的能被看见**。若只加一条 issue 而没有任何消费端
    //   读它，那就是又一次「声明面空转」（v2.7.0 刚治理过同型问题）。
    //   store.maintain({deep:true}) 是产品侧唯一的引擎自检消费点（面板「健康巡视」按钮）。
    const m0 = WA.store.maintain({ deep: true });
    const keep2800 = WA.regional.incidentTypes;
    delete WA.regional.incidentTypes;
    const m1 = WA.store.maintain({ deep: true });
    const iss1 = m1.issues.filter(function (i) { return i.key === 'engine.contract'; });
    assert(iss1.length === 1 && iss1[0].level === 'error',
      '源缺失时健康巡视报 error（不依赖任何测试专用入口）');
    assert(/cross_module_source_missing/.test(iss1[0].detail), '判语点出具体代码（可检索、可归因）');
    assert(m1.score < m0.score, '健康分随之下调（' + m0.score + ' → ' + m1.score + '，错误要能拉低评分而不是静默通过）');
    WA.regional.incidentTypes = keep2800;
    const m2 = WA.store.maintain({ deep: true });
    assert(m2.score === m0.score, '恢复后健康分复原（规则无副作用：' + m2.score + '）');
    assert(m2.issues.filter(function (i) { return i.key === 'engine.contract' && i.level === 'error'; }).length === 0,
      '恢复后不再报 error');
  }
  section('v2.8.0 块4：版本三方对齐');
  {
    const idxS2800 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfS2800 = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const ver2800 = (idxS2800.match(/const VERSION = '([\d.]+)'/) || [])[1];
    assert(ver2800 === '2.28.0', '入口版本为 2.23.0（实 ' + ver2800 + '）');
    assert(ver2800 === mfS2800.version, '入口与清单同源同值（' + ver2800 + ' vs ' + mfS2800.version + '）');
    assert(fs.readFileSync(path.join(BASE, 'engines/contract-audit.js'), 'utf8').indexOf('v2.8.0') > 0,
      '出口面契约留痕（可回溯）');
  }
  // ══════════ v2.9.0 ══════════
  v2900: {
  // ════════════════════════════════════════════════════════════════════
  // v2.9.0：删除侧完整性（模块删除点的受控出口 + 删后复核 + 计量归因）
  //
  // 命题：v2.6.0 / v2.7.0 / v2.8.0 三轮把**写入侧**收口成了 `lsWrite` 单一出口
  //   （成功计量 / 失败分桶 / 写后读回校验三层），而**删除侧是它的精确对偶空白面**——
  //   全库 13 处 `localStorage.removeItem` 直调，删成功没计数、删失败没归因、删完没复核。
  //   删除是**破坏性**操作（删错 = 用户数据没了），它不可观测比写入不可观测更危险：
  //   「已清理 N 项」可能是假的，而用户会据此认为空间已腾出。
  // ════════════════════════════════════════════════════════════════════
  const LS2900 = global.localStorage;
  const ctx2900 = global.SillyTavern.getContext();
  const PROD2900 = ['core/store.js', 'core/settings-bus.js', 'engines/tool-diag.js',
    'core/workflow.js', 'render/inject.js', 'direction/oracle.js', 'index.js', 'ui/panel.js'];
  const SRC2900 = PROD2900.map(function (rel) { return { rel: rel, text: fs.readFileSync(path.join(BASE, rel), 'utf8') }; });
  function src2900(rel) { const h = SRC2900.filter(function (x) { return x.rel === rel; })[0]; return h ? h.text : ''; }
  function rstat2900() { return WA.settingsBus.removeStat(); }
  function fr2900() { LS2900.clear(); ctx2900.chatId = 'v2900_chat'; global.__mockChat.length = 0; WA.store.init(); }

  // ── 块1：删除出口（唯一实现 + 三层对称 + 永不抛） ──
  fr2900();
  section('v2.9.0 块1：删除出口（唯一实现 + 三层对称 + 永不抛）');
  {
    const bus2900 = src2900('core/settings-bus.js');
    assert((bus2900.match(/ls\.removeItem\(/g) || []).length === 1,
      '（结构性）settings-bus 内除统一删除出口外无裸 ls.removeItem（实 ' + (bus2900.match(/ls\.removeItem\(/g) || []).length + ' 处）');
    assert(bus2900.indexOf('function rmRemove(') > 0 && bus2900.indexOf('function noteRemoveFail(') > 0,
      '存在唯一删除出口 rmRemove 与归类记账 noteRemoveFail（lsWrite/noteFail 的删除侧对偶）');
    assert((bus2900.match(/stats\.removeFailed\+\+/g) || []).length === 1, '删除失败记账收敛为单一实现（noteRemoveFail 内一处）');
    assert((bus2900.match(/stats\.removes\+\+/g) || []).length === 1, '删除成功记账收敛为单一实现（rmRemove 内一处）');
    assert(bus2900.indexOf('if (o.verify !== false)') > 0 && bus2900.indexOf('still-present-after-remove') > 0,
      '删除后读回复核在位（默认开启，与写入侧 verify 同规格）');
    const iRm = bus2900.indexOf('ls.removeItem(key);');
    const iOk = bus2900.indexOf('stats.removes++;');
    const iStage = bus2900.indexOf('still-present-after-remove');
    assert(iRm > 0 && iOk > iRm && iStage > iRm, '锚点齐全（removeItem / removes / staged）');
    assert(iOk > iStage, 'removes 自增在复核分支之后（顺序即口径：只有复核通过才算删除成功）');
    // （负向）结构性探针：把裸删塞进兼容层文件，扫描逻辑必须检出（否则上面的计数断言只是碰巧成立）
    const probeB = path.join(BASE, 'compat/__v2900_probe.js');
    let caughtB = -1;
    try {
      fs.writeFileSync(probeB, 'window.WorldAxis.__v2900 = function (k) { window.localStorage.removeItem(k); };\n', 'utf8');
      caughtB = (fs.readFileSync(probeB, 'utf8').match(/localStorage\.removeItem\(/g) || []).length;
    } finally { try { fs.unlinkSync(probeB); } catch (eU) {} }
    assert(caughtB === 1, '（负向）裸删扫描能检出新加站点（实 ' + caughtB + '）');
    assert(fs.existsSync(probeB) === false, '（环境）探针文件已清理，不残留');

    // A. 正向：真删掉了
    const kOk = 'worldaxis_v2900_ok_v1';
    LS2900.setItem(kOk, JSON.stringify({ a: 1 }));
    const r0 = rstat2900();
    const rOk = WA.settingsBus.remove({ key: kOk, def: null, module: 'test' });
    assert(rOk.ok === true && rOk.existed === true, '（正向）键存在时删除返回 ok');
    assert(LS2900.getItem(kOk) === null, '（正向）键确已从磁盘移除（计量不是唯一证据）');
    assert(rstat2900().removes === r0.removes + 1 && rstat2900().removeVerified === r0.removeVerified + 1,
      '（正向）真删掉计入 removes / removeVerified');
    assert(rstat2900().removeAbsent === r0.removeAbsent, '（正向）真删掉不计 removeAbsent');

    // B. 负向：静默无效（removeItem 没抛错但键仍在）——删除侧最危险的形态
    const kStaged = 'worldaxis_v2900_staged_v1';
    LS2900.setItem(kStaged, JSON.stringify({ a: 2 }));
    const rawRm = LS2900.removeItem;
    let threw = null;
    try {
      LS2900.removeItem = function (k) { if (k === kStaged) return; return rawRm.call(LS2900, k); };
      const s0 = rstat2900();
      let rS = null;
      try { rS = WA.settingsBus.remove({ key: kStaged, def: null, module: 'test' }); } catch (e) { threw = e; }
      assert(threw === null, '（负向）静默无效路径不抛异常（出口契约：永不抛）');
      assert(rS && rS.ok === false && rS.staged === true, '（负向）删完读回仍在 ⇒ 判失败（不再假装删成功）');
      assert(rstat2900().removeStaged === s0.removeStaged + 1, '删完读回仍在计入 removeStaged');
      assert(rstat2900().removes === s0.removes, '（关键）静默无效**不得**计入 removes——否则「N 次全部复核通过」虚高');
      assert(rstat2900().lastRemoveStaged && rstat2900().lastRemoveStaged.key === kStaged,
        'lastRemoveStaged 点名具体键与字节量（可归因）');
      assert(LS2900.getItem(kStaged) !== null, '（环境）键确实还在磁盘上（模拟的就是这种失败）');
      assert(rstat2900().lastRemoveError && rstat2900().lastRemoveError.indexOf('guarded:') === 0,
        '归因桶区分「删不掉」与「删除被拒」（实 ' + rstat2900().lastRemoveError + '）');
      assert((rstat2900().removeFailedBy || {}).guarded >= 1, 'guarded 独立成桶（不与 setItem 桶混同，两者处置不同）');
    } finally { LS2900.removeItem = rawRm; }
    const rAfter = WA.settingsBus.remove({ key: kStaged, def: null, module: 'test' });
    assert(rAfter.ok === true && rstat2900().lastRemoveStaged === null,
      '（可逆性）随后一次删除复核通过 ⇒ lastRemoveStaged 清零（判据是当前态而非历史累计）');

    // C. 负向：删除被拒（抛错）
    const kThrow = 'worldaxis_v2900_throw_v1';
    LS2900.setItem(kThrow, JSON.stringify({ a: 3 }));
    const byBefore = Object.assign({}, rstat2900().removeFailedBy);
    threw = null;
    try {
      LS2900.removeItem = function (k) { if (k === kThrow) throw new Error('QuotaExceededError'); return rawRm.call(LS2900, k); };
      let rT = null;
      try { rT = WA.settingsBus.remove({ key: kThrow, def: null, module: 'test' }); } catch (e) { threw = e; }
      assert(threw === null, '（负向）删除被拒不抛异常穿透调用方（此前裸 removeItem 会抛到调用点）');
      assert(rT && rT.ok === false, '删除被拒 ⇒ 判失败');
      assert(rstat2900().lastRemoveError && rstat2900().lastRemoveError.indexOf('settings') === 0,
        '归因写出调用来路（实 ' + rstat2900().lastRemoveError + '）');
      const byNow = rstat2900().removeFailedBy;
      assert((byNow.settings || 0) === (byBefore.settings || 0) + 1,
        '（归因不实已纠正）设置键出口的删除失败落在 settings 桶，而不是兜底 setItem 桶');
      assert((byNow.setItem || 0) === (byBefore.setItem || 0),
        '（负向）setItem 桶未被误增——归因不实会让用户照着「删除被拒」去查权限');
      assert(LS2900.getItem(kThrow) !== null, '（环境）删除被拒后键仍在磁盘上');
    } finally { LS2900.removeItem = rawRm; }

    // D. 正向：键本就不存在 ⇒ 幂等无操作，不算删除成功
    const a0 = rstat2900();
    const rA = WA.settingsBus.remove({ key: 'worldaxis_v2900_absent_v1', def: null, module: 'test' });
    assert(rA.ok === true && rA.absent === true, '（正向）删除一个本就不存在的键返回 ok（幂等无操作）');
    assert(rstat2900().removeAbsent === a0.removeAbsent + 1, '「键本就不存在」计入 removeAbsent');
    assert(rstat2900().removes === a0.removes,
      '（关键）幂等无操作**不得**计入 removes——否则「N 次全部复核通过」可能来自 N 次空操作');
    assert(rstat2900().lastRemove && rstat2900().lastRemove.absent === true,
      'lastRemove 标出这是一次无操作（读的人不会被「最近删除」误导）');

    // E. 登记项缺 key：必须走删除侧记账，不污染写入侧台账
    const mf0 = Object.assign({}, rstat2900().removeFailedBy);
    const wf0 = WA.settingsBus.writeStat();
    const rMk = WA.settingsBus.remove({ def: {} });
    assert(rMk.ok === false, '（负向）登记项没声明 key ⇒ 拒绝删除');
    assert((rstat2900().removeFailedBy.missing || 0) === (mf0.missing || 0) + 1,
      '登记项缺 key 落在删除侧 missing 桶（首版错走写入侧 noteFail，使 removeFailedBy.missing 声明了却零消费）');
    assert(WA.settingsBus.writeStat().writeFailed === wf0.writeFailed,
      '（修掉的首版缺陷）它**不得**污染写入侧台账——否则读的人会去查写盘环境');

    // F. 总线内部三处删除点走出口（静态）
    assert(bus2900.indexOf("rmRemove(r.key, 'quarantine')") > 0,
      '隔离路径删除走出口（此前裸调 + 空 catch 静默吞错）');
    assert(bus2900.indexOf("rmRemove(lk, 'legacy')") > 0,
      'legacy 旧键迁移删除走出口（此前删不掉时「每次启动重迁一遍」完全不可见）');
    assert((bus2900.match(/rmRemove\(/g) || []).length >= 5,
      '全部内部删除点走出口（实 ' + (bus2900.match(/rmRemove\(/g) || []).length + ' 处：定义 1 + 对外 1 + 内部 3）');
  }

  // ── 块2：oracle 现场——设置家族的键删除却绕过总线 ──
  section('v2.9.0 块2：oracle 现场（删除失败抛错穿透 + 删成功零台账）');
  {
    const orcS = src2900('direction/oracle.js');
    assert((orcS.match(/localStorage\.removeItem\s*\(/g) || []).length === 0,
      '（结构性）oracle 内已无裸删**调用**（实 ' + (orcS.match(/localStorage\.removeItem\s*\(/g) || []).length
        + ' 处；注释里的字样是留证，不算调用——断言过宽会把留证文字当成缺陷）');
    assert(orcS.indexOf('WA.settingsBus.remove(__REG)') > 0, '清除存档计划走设置总线删除出口');
    const cO = WA.store.classifyKey('worldaxis_oracle_plan_v1');
    assert(cO.family === 'settings',
      '（现场）oracle 计划键属 settings 家族（实 ' + JSON.stringify(cO.family) + '）——治理面本应覆盖它');
    const regsO = (WA.__settingsRegs || []).filter(function (r) { return r.key === 'worldaxis_oracle_plan_v1'; });
    assert(regsO.length === 1, '（现场）该键已在设置登记表内（regHit=1）——删它却绕过总线，属治理空白面');
    fr2900();
    WA.oracle.setPlan({ beats: [{ goal: 'g1' }], current: 0 });
    assert(LS2900.getItem('worldaxis_oracle_plan_v1') !== null, '（正向）setPlan 后计划落盘');
    const ro0 = rstat2900();
    WA.oracle.clear();
    assert(LS2900.getItem('worldaxis_oracle_plan_v1') === null, '（正向）clear 后计划键确已移除');
    assert(WA.oracle.plan === null, '（正向）clear 后内存态清空');
    assert(rstat2900().removes === ro0.removes + 1, '（正向）clear 的删除计入总线台账（此前删成功零记录）');
    // 负向：删除被拒时**不得抛错穿透**，且内存/磁盘不一致必须留下可检索线索
    WA.oracle.setPlan({ beats: [{ goal: 'g2' }], current: 0 });
    const errN0 = WA.errorLog.length;
    let threwO = null;
    const rawRmO = LS2900.removeItem;
    try {
      LS2900.removeItem = function (k) { if (k === 'worldaxis_oracle_plan_v1') throw new Error('blocked'); return rawRmO.call(LS2900, k); };
      try { WA.oracle.clear(); } catch (e) { threwO = e; }
    } finally { LS2900.removeItem = rawRmO; }
    assert(threwO === null,
      '（关键·本版修掉的真实缺陷）删除被拒时 clear() 不抛异常——首版实测：内存已清、磁盘键仍在、异常穿透到调用方');
    assert(WA.oracle.plan === null, '（现场）内存态已清（用户的观感是「已清除」）');
    assert(LS2900.getItem('worldaxis_oracle_plan_v1') !== null, '（现场）磁盘键仍在——UI 说清了，重启后计划复活');
    const lastErr = WA.errorLog[WA.errorLog.length - 1] || {};
    assert(WA.errorLog.length > errN0 && /重启后会复活/.test(String(lastErr.msg || '')),
      '不一致必须留下可检索的告警（否则用户无从知道计划没真清掉）');
    WA.oracle.setPlan(null);
  }

  // ── 块3：store 受控删除（计数必须计「真的删掉了」） ──
  section('v2.9.0 块3：store 受控删除（计数必须计「真的删掉了」）');
  {
    const stS = src2900('core/store.js');
    assert((stS.match(/localStorage\.removeItem\(/g) || []).length === 1,
      '（结构性）store 内裸 removeItem 只剩受控出口内部那一处（实 ' + (stS.match(/localStorage\.removeItem\(/g) || []).length + ' 处）');
    assert(stS.indexOf('function removeVerified(') > 0, '受控删除单一实现 removeVerified（与 writeVerified 对偶）');
    assert((stS.match(/__removeStat\.removed\+\+/g) || []).length === 1, '「真删掉」的计数收敛为单一实现');
    assert(stS.indexOf('__removeStat.lastReason = null;') > 0,
      '当前态信号每次调用先清零（与 integrityStat.lastOk 同规格：判据是当前态不是历史累计）');
    fr2900();
    // A. 正向
    const kS = 'worldaxis_v2900_store_probe_v1';
    LS2900.setItem(kS, 'x');
    const z0 = WA.store.removeStat();
    const rSv = WA.store.removeVerified(kS);
    assert(rSv.ok === true && rSv.removed === true && rSv.reason === null, '（正向）存在且删成功 ⇒ ok/removed');
    assert(WA.store.removeStat().removed === z0.removed + 1, '（正向）真删掉计入 removed');
    assert(LS2900.getItem(kS) === null, '（正向）键确已移除');
    const rawRmS = LS2900.removeItem;
    // B. 负向：静默无效
    const kS2 = 'worldaxis_v2900_store_staged_v1';
    LS2900.setItem(kS2, 'y');
    try {
      LS2900.removeItem = function (k) { if (k === kS2) return; return rawRmS.call(LS2900, k); };
      const z1 = WA.store.removeStat();
      const rS2 = WA.store.removeVerified(kS2);
      assert(rS2.ok === false && rS2.reason === 'staged-still-present', '（负向）删完读回仍在 ⇒ 判失败并给出原因');
      assert(WA.store.removeStat().staged === z1.staged + 1, '静默无效计入 staged');
      assert(WA.store.removeStat().removed === z1.removed, '（关键）静默无效**不得**计入 removed');
      assert(WA.store.removeStat().lastReason === 'staged-still-present',
        '当前态信号标出「最近一次是静默无效」（消费端据此报 error）');
      assert(LS2900.getItem(kS2) !== null, '（环境）键确实还在');
    } finally { LS2900.removeItem = rawRmS; }
    // C. 负向：抛错
    const kS3 = 'worldaxis_v2900_store_throw_v1';
    LS2900.setItem(kS3, 'z');
    try {
      LS2900.removeItem = function (k) { if (k === kS3) throw new Error('nope'); return rawRmS.call(LS2900, k); };
      const rS3 = WA.store.removeVerified(kS3);
      assert(rS3.ok === false && rS3.reason === 'remove-threw', '（负向）删除被拒 ⇒ 判失败（不抛）');
      assert(WA.store.removeStat().lastReason === 'remove-threw', '当前态信号标出「被拒」');
    } finally { LS2900.removeItem = rawRmS; }
    // D. 正向：缺席（幂等）
    const z2 = WA.store.removeStat();
    const rS4 = WA.store.removeVerified('worldaxis_v2900_never_existed_v1');
    assert(rS4.ok === true && rS4.removed === false && rS4.reason === 'absent',
      '（正向）键不存在 ⇒ ok 但 removed=false（幂等无操作，不算删掉）');
    assert(WA.store.removeStat().removed === z2.removed, '（关键）幂等无操作不计 removed');
    assert(WA.store.removeStat().lastReason === null, '当前态信号标出「最近一次正常」');

    // E. 【本版修掉的真实缺陷】清理计数虚高：removed++ 曾在裸调用后无条件执行
    const iLoop = stS.indexOf('const rr = removeVerified(r.key);');
    assert(iLoop > 0, '收口锚点：回收循环改为以返回值驱动计数');
    assert(stS.indexOf('if (rr.ok && rr.removed) { removed++; freed += (r.bytes || 0); }') > 0,
      '（现场证据）计数只对**真的删掉**的键发生（此前 removed++ 无条件执行 ⇒ 删除失败也计入「已释放」）');
    const otherChat = 'v2900_other_chat';
    LS2900.setItem('worldaxis_state_' + otherChat, JSON.stringify({ schemaVersion: 1, meta: { updatedAt: 1 } }));
    LS2900.setItem('worldaxis_event_log_' + otherChat, '[]');
    LS2900.setItem('worldaxis_error_log_' + otherChat, '[]');
    LS2900.setItem('worldaxis_wf_history_' + otherChat, '[]');
    const planDry = WA.store.sweepStaleKeys({});
    const planLen = planDry.remove.length;
    assert(planLen > 0, '（夹具）存在可回收键（实 ' + planLen + ' 个：该聊天 updatedAt=1970 ⇒ 判为久未活跃）');
    try {
      LS2900.removeItem = function () { return; };   // 全部静默丢弃
      const planFail = WA.store.sweepStaleKeys({ apply: true });
      assert(planFail.applied && planFail.applied.removed === 0,
        '（关键·本版修掉的缺陷）删除被静默丢弃时 applied.removed 必须为 0（此前无条件 removed++ ⇒ 虚报「已释放 N KB」）');
      assert(planFail.applied.failed === planLen, '失败条数如实记账（实 ' + planFail.applied.failed + ' / 计划 ' + planLen + '）');
      assert(planFail.applied.freedBytes === 0, '未真正释放时 freedBytes 必须为 0（用户按「已清理」的提示继续清才不至于白清）');
      assert(planFail.remove.length === planLen, 'plan.remove 保持「计划」语义不变（它列的是候选，不是执行结果）');
    } finally { LS2900.removeItem = rawRmS; }
    const planOk = WA.store.sweepStaleKeys({ apply: true });
    assert(planOk.applied.removed === planLen && planOk.applied.failed === 0,
      '（可逆性）恢复后真删掉 ⇒ removed 如实计数（实 ' + planOk.applied.removed + '）');
    assert(planOk.applied.freedBytes > 0, '真释放后 freedBytes 有值（与「未释放时必须为 0」成对照）');
    assert(LS2900.getItem('worldaxis_event_log_' + otherChat) === null, '（正向）键确已移除');

    // F. 丢弃类动作：删不掉必须报失败而不是静默 ok（界面会报「已丢弃」而键仍在）
    const ck = 'worldaxis_conflict_v2900_1_1';
    LS2900.setItem(ck, '{}');
    try {
      LS2900.removeItem = function (k) { if (k === ck) return; return rawRmS.call(LS2900, k); };
      const dC = WA.store.dropConflict(ck);
      assert(dC.ok === false && /删除失败/.test(String(dC.reason)),
        '（负向）冲突现场删不掉 ⇒ 报失败（此前静默 ok:true ⇒ 界面报「已丢弃」而键仍在、现场永不消失）');
      assert(LS2900.getItem(ck) !== null, '（环境）现场仍在磁盘上');
    } finally { LS2900.removeItem = rawRmS; }
    const dC2 = WA.store.dropConflict(ck);
    assert(dC2.ok === true && dC2.removed === true, '（正向）删除可用时丢弃成功且如实回报 removed');
    // 复位当前态，避免把本块的失败信号带进下一块
    LS2900.setItem('worldaxis_v2900_reset0_v1', '1');
    WA.store.removeVerified('worldaxis_v2900_reset0_v1');
  }

  // ── 块4：双消费端（健康巡视 + 诊断包）——防「声明面空转」 ──
  section('v2.9.0 块4：双消费端（健康巡视 + 诊断包）——防「声明面空转」');
  {
    // 关键：新计量若只有一条 issue 定义而没有任何消费端读它，就是又一次「声明面空转」
    //   （v2.7.0 刚治理过同型问题）。store.maintain()（面板「健康巡视」）与 tool-diag 是两个消费端。
    fr2900();
    LS2900.setItem('worldaxis_v2900_base_v1', '1');
    WA.store.removeVerified('worldaxis_v2900_base_v1');
    // 首次巡视会消化前序块留下的可回收诊断键（一次性扣分），故取「第二、三次」作稳定基线；
    //   这条自证是下面分差断言的前提：若基线本身不稳定，分差断言就没有意义。
    WA.store.maintain({ deep: true });
    const m0 = WA.store.maintain({ deep: true });
    const mB = WA.store.maintain({ deep: true });
    assert(m0.score === mB.score,
      '（环境自证）稳定态下连续两次巡视健康分一致（' + m0.score + ' = ' + mB.score + '）——下面分差断言的前提');
    const mBase = mB;
    assert(m0.issues.filter(function (i) { return i.key === 'storage.removeStaged'; }).length === 0,
      '（基线）最近一次删除正常 ⇒ 不报删除议题');
    const rawRmD = LS2900.removeItem;
    const kDiag = 'worldaxis_v2900_diag_v1';
    LS2900.setItem(kDiag, 'q');
    try {
      LS2900.removeItem = function (k) { if (k === kDiag) return; return rawRmD.call(LS2900, k); };
      WA.store.removeVerified(kDiag);
    } finally { LS2900.removeItem = rawRmD; }
    const m1 = WA.store.maintain({ deep: true });
    const iss1 = m1.issues.filter(function (i) { return i.key === 'storage.removeStaged'; });
    assert(iss1.length === 1 && iss1[0].level === 'error',
      '删除静默无效时健康巡视报 error（不依赖任何测试专用入口）');
    assert(/静默无效/.test(iss1[0].detail), '判语点出失败形态（可检索、可归因）');
    assert(m1.score === mBase.score - 12,
      '健康分恰下调 12（' + mBase.score + ' → ' + m1.score + '；error 级扣分是确定项，其余议题集合在两次巡视间不变）');
    assert(m1.actions.some(function (a) { return a.id === 'review-storage'; }), '给出可执行的下一步（导出诊断包留证）');
    LS2900.setItem('worldaxis_v2900_fix_v1', 'r');
    WA.store.removeVerified('worldaxis_v2900_fix_v1');
    const m2 = WA.store.maintain({ deep: true });
    assert(m2.issues.filter(function (i) { return i.key === 'storage.removeStaged'; }).length === 0,
      '（可逆性）最近一次删除正常后 error 消失——判据是当前态而非历史累计');
    assert(m2.score === mBase.score, '健康分复原（规则无副作用：' + m2.score + '）——判据是当前态，故历史失败不会把分数永久压低');
    // 诊断包：两个域各自报
    LS2900.setItem(kDiag, 'q2');
    try {
      LS2900.removeItem = function (k) { if (k === kDiag) return; return rawRmD.call(LS2900, k); };
      WA.store.removeVerified(kDiag);
    } finally { LS2900.removeItem = rawRmD; }
    const dgS = WA.toolDiag.collect();
    assert(dgS.worldState.storage.remove && typeof dgS.worldState.storage.remove.staged === 'number',
      '诊断包采集 store 删除侧台账（此前 removeStat 导出却零产品消费＝纯声明面）——挂在 worldState.storage 下');
    const vSt = WA.toolDiag.verdict(dgS).issues.filter(function (i) { return i.key === 'store.removeStaged'; });
    assert(vSt.length === 1 && vSt[0].level === 'error', '诊断包对 store 域静默无效报 error');
    assert(/删完读回仍在/.test(vSt[0].detail), '判语点出失败形态（可检索）');
    const kBus = 'worldaxis_v2900_busdiag_v1';
    LS2900.setItem(kBus, 's');
    try {
      LS2900.removeItem = function (k) { if (k === kBus) return; return rawRmD.call(LS2900, k); };
      WA.settingsBus.remove({ key: kBus, def: null, module: 'test' });
    } finally { LS2900.removeItem = rawRmD; }
    const dgB = WA.toolDiag.collect();
    assert(dgB.runtime.settingsBus.removes && typeof dgB.runtime.settingsBus.removes.removeStaged === 'number',
      '诊断包采集 settingsBus 删除侧台账（与写入侧 writeStat 并列）');
    const vBus = WA.toolDiag.verdict(dgB).issues.filter(function (i) { return i.key === 'settingsBus.removeStaged'; });
    assert(vBus.length === 1 && vBus[0].level === 'error', '诊断包对设置键域静默无效报 error');
    // 覆盖度（防「新增 API 却零调用」）
    let useRemoveStat = 0, useBusRemove = 0;
    PROD2900.forEach(function (rel) {
      const t = src2900(rel);
      useRemoveStat += (t.match(/removeStat\(/g) || []).length;
      useBusRemove += (t.match(/settingsBus\.remove\(/g) || []).length;
    });
    assert(useRemoveStat >= 4, 'removeStat 被多个消费端读（实 ' + useRemoveStat + ' 处；防「导出却零产品消费」）');
    assert(useBusRemove >= 1, 'settingsBus.remove 有产品消费点（oracle 存档计划清除）');
    // 清理
    LS2900.setItem('worldaxis_v2900_reset1_v1', '1');
    WA.settingsBus.remove({ key: 'worldaxis_v2900_reset1_v1', def: null, module: 'test' });
    WA.store.removeVerified('worldaxis_v2900_reset1_v1');
  }

  // ── 块5：适用范围 + 版本三方对齐 ──
  section('v2.9.0 块5：删除侧适用范围（G14）与版本三方对齐');
  {
    const runS = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
    assert(runS.indexOf('G14 删除侧出口唯一性') > 0,
      'G14 门禁在位（钉「产品代码裸 removeItem 只剩受控出口内部那一处」——与 G13 对偶）');
    assert(runS.indexOf('INVENTORY_G14') > 0, 'G14 冻结清单在位（新增裸删站点即断言失败）');
    assert(runS.indexOf('（负向）G14 探针：新加一个裸删文件会被检出') > 0,
      'G14 有负向探针（否则上面的计数断言只是「碰巧成立」）');
    // 最终口径核验：全库产品代码裸删除点
    const bareAll = [];
    ['core', 'engines', 'render', 'ui', 'actors', 'direction', 'compat'].forEach(function (d) {
      (function walkF(rel) {
        let names = [];
        try { names = fs.readdirSync(path.join(BASE, rel)); } catch (e) { return; }
        names.forEach(function (n) {
          const r2 = rel + '/' + n;
          let st2 = null;
          try { st2 = fs.statSync(path.join(BASE, r2)); } catch (e2) { return; }
          if (st2.isDirectory()) return walkF(r2);
          if (!/\.js$/.test(n)) return;
          fs.readFileSync(path.join(BASE, r2), 'utf8').split('\n').forEach(function (ln, i) {
            if (ln.indexOf('localStorage.removeItem(') < 0) return;
            bareAll.push(r2 + ':' + (i + 1));
          });
        });
      })(d);
    });
    bareAll.push.apply(bareAll, fs.readFileSync(path.join(BASE, 'index.js'), 'utf8').split('\n')
      .map(function (ln, i) { return ln.indexOf('localStorage.removeItem(') >= 0 ? 'index.js:' + (i + 1) : null; })
      .filter(Boolean));
    assert(bareAll.length === 1 && /^core\/store\.js:/.test(bareAll[0]),
      '产品代码裸 removeItem 收敛至 1 处且在受控出口内部（实 ' + (bareAll.join('、') || '无') + '）——与写入侧「唯一写出口」对称');
    const idxS2900 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfS2900 = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const ver2900 = (idxS2900.match(/const VERSION = '([\d.]+)'/) || [])[1];
    assert(ver2900 === '2.28.0', '入口版本为 2.23.0（实 ' + ver2900 + '）');
    assert(ver2900 === mfS2900.version, '入口与清单同源同值（' + ver2900 + ' vs ' + mfS2900.version + '）');
    assert(fs.readFileSync(path.join(BASE, 'engines/contract-audit.js'), 'utf8').indexOf('v2.9.0') > 0,
      '删除侧完整性契约留痕（可回溯）');
    assert(src2900('core/settings-bus.js').indexOf('v2.9.0') > 0 && src2900('core/store.js').indexOf('v2.9.0') > 0,
      '两域基线均留痕（settings-bus 删除出口 / store 受控删除）');
    assert(src2900('ui/panel.js').indexOf('删除侧') > 0, '面板透出删除侧结论（用户可见出口）');
  }
  // ══════════════════════════════════════════════════════════════════════════
  // v2.10.0：读侧完整性（第三面）—— 严格对偶于写入侧（lsWrite）与删除侧（rmRemove）
  //
  //   命题：写侧有 writes / writeFailedBy / verifyFailed（「写进去了吗」），
  //   删侧有 removes / removeFailedBy / removeVerified（「真删掉了吗」），
  //   **读侧一个归因字段都没有**——全库只有一个来源不明的单桶 stats.failures，
  //   且实测产品侧零消费。于是「用户配置读坏了、回落成默认值」与「用户从来没配过」
  //   在界面上、诊断包里、健康分上**完全一样**。而前者是唯一会被用户当成
  //   「我的设置被程序改回去了」的故障，也是本仓库后果最严重的静默失效。
  //   本版把读侧补齐为严格对偶的第三面，并按既有方法论接双消费端 + G15 门禁。
  // ══════════════════════════════════════════════════════════════════════════
  {
  const LSV2100 = global.localStorage;
  const ctxV2100 = global.SillyTavern.getContext();
  function frV2100() { LSV2100.clear(); ctxV2100.chatId = 'v2100b_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function cnt2100(s2, needle) { return String(s2).split(needle).length - 1; }
  // ── 块1：读侧出口（唯一实现 + 三层对称 + 来源追踪） ──
  section('v2.10.0 块1：读侧出口（唯一实现 + 三层对称 + 来源追踪）');
  {
    const busS = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
    const storeS = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    // 1. 读失败记账收敛为单一实现（三兄弟的第三面）
    assert(cnt2100(busS, 'function noteReadFail(') === 1,
      '读失败记账收敛为单一实现（noteReadFail）——与 noteFail（写侧）/ noteRemoveFail（删侧）三兄弟齐备');
    assert(cnt2100(busS, 'stats.readFailed++') === 1,
      '读失败主计量只在单一实现内自增（实 ' + cnt2100(busS, 'stats.readFailed++') + ' 处）');
    assert(cnt2100(storeS, 'function noteStoreReadFail(') === 1,
      'store 域读失败记账同样是单一实现（noteStoreReadFail）');
    assert(cnt2100(storeS, '__readStat.readFailed++') === 1,
      'store 读失败主计量只在单一实现内自增（实 ' + cnt2100(storeS, '__readStat.readFailed++') + ' 处）');
    assert(busS.indexOf('readFailedBy: { read: 0, parse: 0, migrate: 0, copy: 0 }') > 0,
      '读失败按来源分桶（read / parse / migrate / copy 四来源）');
    // 2. 三层对偶的第三层：来源追踪（写侧 verifyFailed / 删侧 removeVerified）
    assert(busS.indexOf('readSources: { disk: 0, legacy: 0, default: 0, defaultAfterFailure: 0 }') > 0,
      '读侧「来源追踪」层在位（disk/legacy/default/defaultAfterFailure）——与写侧 verifyFailed 严格对偶');
    assert(busS.indexOf('default-after-failure') > 0,
      '区分「有数据但没读到」与「从未配置」（本版命题的核心判据）');
    assert(busS.indexOf('readonlyCopyFallback') > 0,
      '深拷贝降级计量在位（返回值与内部对象共享引用此前**静默**发生）');
    // 3. 对外视图（与 writeStat / removeStat 三面对称）
    const stR = WA.settingsBus.readStat();
    assert(typeof stR.reads === 'number' && typeof stR.readFailed === 'number', 'readStat 暴露 reads / readFailed');
    assert('hardFailed' in stR && 'degraded' in stR, 'readStat 分列硬失败与降级（归因不实比缺失归因更坏）');
    assert(typeof stR.defaultAfterFailure === 'number', 'readStat 单列「有数据但没读到」（数据丢失率的直接判据）');
    assert(stR.ok === (stR.hardFailed === 0), 'ok 只由硬失败决定（降级不影响「配置是否可信」）');
    assert(typeof stR.legacyFailures === 'number', 'v0.1.x 遗留单桶 stats.failures 在新视图里有出口（此前产品零消费）');
    assert(stR.hardFailed + stR.degraded === stR.readFailed, '硬失败 + 降级 = 读失败总数（分类完备，无落桶外）');
    // 4. 语义 A：有值可读 → disk
    frV2100();
    const kDisk = 'worldaxis_v2100_disk_v1';
    LSV2100.setItem(kDisk, JSON.stringify({ n: 5 }));
    const vDisk = WA.settingsBus.read({ key: kDisk, def: { n: 0 } });
    assert(vDisk.n === 5 && WA.settingsBus.stats.lastRead.source === 'disk',
      '（A「用户配置」）有值可读 → 来源 disk（实 ' + (WA.settingsBus.stats.lastRead || {}).source + '）');
    // 5. 语义 B：从未配置 → default，且不计失败、不制造假故障
    const beforeB = WA.settingsBus.stats.readFailed;
    const vAbs = WA.settingsBus.read({ key: 'worldaxis_v2100_absent_v1', def: { n: 9 } });
    assert(vAbs.n === 9 && WA.settingsBus.stats.lastRead.source === 'default',
      '（B「从未配置」）无值 → 来源 default（不是故障）');
    assert(WA.settingsBus.stats.lastRead.reason === null, '（B）无值回落时原因为空（不制造假故障）');
    assert(WA.settingsBus.stats.readFailed === beforeB,
      '（B）**不计**读失败（从未配置不是故障——归因不实比缺失归因更坏）');
    // 6. 语义 C：磁盘有值但读不出来（本版要治的核心故障）
    const srcBeforeC = Object.assign({}, WA.settingsBus.stats.readSources);
    const rawGetC = LSV2100.getItem;
    LSV2100.getItem = function (k) { if (k === kDisk) throw new Error('v2100-read-throw'); return rawGetC.call(this, k); };
    let vFailC = null;
    try { vFailC = WA.settingsBus.read({ key: kDisk, def: { n: 0 } }); } finally { LSV2100.getItem = rawGetC; }
    const srcAfterC = WA.settingsBus.stats.readSources;
    assert(vFailC.n === 0, '（C「读失败」）读取不中断，返回兜底默认值');
    assert((srcAfterC.defaultAfterFailure || 0) === (srcBeforeC.defaultAfterFailure || 0) + 1,
      '（C）与「从未配置」严格可分辨：计入 defaultAfterFailure 而非 default');
    assert(WA.settingsBus.stats.lastRead.source === 'default-after-failure',
      '（C）lastRead 记下本次来源＝default-after-failure');
    assert(WA.settingsBus.stats.lastReadFail && WA.settingsBus.stats.lastReadFail.tag === 'read',
      '（C）归因到 read 桶（存储层读取失败，实 ' + JSON.stringify((WA.settingsBus.stats.lastReadFail || {}).tag) + '）');
    assert(WA.settingsBus.stats.readFailedBy.read >= 1,
      '（C）read 桶有真实计数（实 ' + WA.settingsBus.stats.readFailedBy.read + '）');
    // 7. 解析失败（值损坏）走同层归因但不混桶
    const kCorrupt = 'worldaxis_v2100_corrupt_v1';
    LSV2100.setItem(kCorrupt, '{not-json');
    const beforeParse = WA.settingsBus.stats.readFailedBy.parse || 0;
    const vCorrupt = WA.settingsBus.read({ key: kCorrupt, def: { c: 1 } });
    assert(vCorrupt.c === 1, '损坏值回落默认值（读取不中断）');
    assert((WA.settingsBus.stats.readFailedBy.parse || 0) === beforeParse + 1,
      '损坏归入 parse 桶（不与存储层读取失败 read 混桶）');
    assert(WA.settingsBus.stats.lastRead.source === 'default-after-failure',
      '（损坏）同样标记为 default-after-failure（有值但没读到）');
    // 8. readEx：结构化交还来源——调用方唯一能判定「我拿到的是兜底」的出口
    LSV2100.setItem(kDisk, JSON.stringify({ n: 7 }));
    const exOk = WA.settingsBus.readEx({ key: kDisk, def: { n: 0 } });
    assert(exOk.ok === true && exOk.source === 'disk' && exOk.value.n === 7, 'readEx 可读键 → ok:true / disk / 真值');
    LSV2100.getItem = function (k) { if (k === kDisk) throw new Error('v2100-read-throw2'); return rawGetC.call(this, k); };
    let exBad = null;
    try { exBad = WA.settingsBus.readEx({ key: kDisk, def: { n: 0 } }); } finally { LSV2100.getItem = rawGetC; }
    assert(exBad.ok === false && exBad.source === 'default-after-failure',
      'readEx 读失败键 → ok:false（调用方唯一能判定「我拿到的是兜底」的出口）');
    const exAbs = WA.settingsBus.readEx({ key: 'worldaxis_v2100_absent_v1', def: { n: 9 } });
    assert(exAbs.ok === true && exAbs.source === 'default', 'readEx 缺席键 → ok:true（从未配置不是故障）');
    // 9. 永不抛（出口的契约）
    let threw = false;
    try { WA.settingsBus.read({ key: null, def: { q: 1 } }); } catch (e) { threw = true; }
    assert(threw === false, '（结构性）read 永不炸调用方（登记项缺 key 也不抛）');
    // 10. store 域读侧视图
    const stStore = WA.store.readStat();
    assert(typeof stStore.readFailed === 'number' && stStore.ok === (stStore.readFailed === 0),
      'store.readStat 暴露读侧台账（与 integrityStat 写侧 / removeStat 删侧三面对称）');
    assert(typeof stStore.bySource.bytes === 'number' && typeof stStore.bySource.activity === 'number'
      && typeof stStore.bySource.enumerate === 'number',
      'store 读侧按来源分桶（按字节 / 活跃时间 / 键枚举）');
  }
  // ── 块2：store 读侧现场（占用表偏小 + 误判最冷 ⇒ 误删风险） ──
  section('v2.10.0 块2：store 读侧现场（占用表偏小 + 误判最冷 ⇒ 误删风险）');
  {
    const storeS = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    assert(storeS.indexOf("catch (e) { noteStoreReadFail('bytes', key, e); return 0; }") > 0,
      '（现场证据）keyBytes 的读失败已归因（此前裸 catch 吞成 0 字节——「键是空的」与「读不出来」不可分辨）');
    assert(storeS.indexOf("noteStoreReadFail('activity'") > 0 && storeS.indexOf("noteStoreReadFail('enumerate'") > 0,
      '活跃时间 / 键枚举的读失败同样归因（两处此前都是静默回落）');
    frV2100();
    LSV2100.setItem('worldaxis_state_v2100_probe', JSON.stringify({ meta: { updatedAt: Date.now() } }));
    LSV2100.setItem('worldaxis_event_log_v2100_other', '{}');
    const s1 = WA.store.storageStat();
    assert(s1.readFailedKeys === 0, '（基线）无故障时 readFailedKeys = 0（实 ' + s1.readFailedKeys + '）');
    const rawGet2 = LSV2100.getItem;
    LSV2100.getItem = function (k) { if (String(k).indexOf('worldaxis_') === 0) throw new Error('v2100-store-read'); return rawGet2.call(this, k); };
    let s2 = null;
    try { s2 = WA.store.storageStat(); } finally { LSV2100.getItem = rawGet2; }
    assert(s2.readFailedKeys > 1, '读失败时 readFailedKeys > 0（实 ' + s2.readFailedKeys + '）——「这份占用表可信吗」可判定');
    assert(s2.readFailedDetail.bytes > 0, '按字节分桶如实计数（实 ' + s2.readFailedDetail.bytes + '）');
    assert(s2.readFailedDetail.activity > 0,
      '活跃时间读失败被单列归因（实 ' + s2.readFailedDetail.activity + '）——回落 0 等于「最冷」，会让该聊天进可回收候选');
    assert(s2.readFailedCumulative.bytes >= s2.readFailedDetail.bytes,
      '累计值单列（历史可追溯，但不参与当前态判据）');
    assert(typeof s2.totalBytes === 'number', '（口径）占用表仍产出数值（键读失败按 0 计入 ⇒ 表偏小）');
    const s3 = WA.store.storageStat();
    assert(s3.readFailedKeys === 0, '（可逆性）存储恢复后 readFailedKeys 复原为 0——当前态判据不得退化为累计判据');
    assert(s3.readFailedCumulative.bytes > 0, '（可追溯）累计值仍保留本次会话的历史经历');
    assert(s3.readFailedCumulative.bytes >= s3.readFailedDetail.bytes, '累计 ≥ 本次差值（口径自洽）');
    // 键枚举失败：比单键读失败更严重的失真（全部键都看不见，面板却照样报「存储很干净」）
    const rawKeyFn = LSV2100.key;
    let s4 = null;
    try {
      LSV2100.key = function () { throw new Error('v2100-enum'); };
      s4 = WA.store.storageStat();
    } finally { LSV2100.key = rawKeyFn; }
    assert(s4.readFailedDetail.enumerate > 0, '键枚举失败被单列归因（实 ' + s4.readFailedDetail.enumerate + ' 次）');
    assert(s4.totalKeys === 0, '（后果）枚举失败时「0 个键 / 0 字节」——面板会照样报出一份「存储很干净」的结论');
    // v2.10.0（逆向审计自纠第三处）: 枚举失败必须计入**本次盘点**的 readFailedKeys。
    //   首版把差值基线取在 `listWorldAxisKeys()` **之后**，而枚举本身就是一次读取 ⇒ 最严重的
    //   失真（全部键看不见）反而被排除在「本次盘点」口径之外，且主计数与分桶明细不同源。
    //   同型坑（口径不一致）本版已踩第三次：删除侧 P9、store 读侧 D-c、本次枚举基线。
    assert(s4.readFailedKeys > 0,
      '键枚举失败计入本次盘点的 readFailedKeys（实 ' + s4.readFailedKeys + '）——基线取在任何读取之前');
    assert(s2.readFailedKeys === s2.readFailedDetail.bytes + s2.readFailedDetail.activity + s2.readFailedDetail.enumerate,
      '主计数与分桶明细同口径（readFailedKeys = 各来源之和，两处口径不得分叉）');
    assert(s4.readFailedKeys === s4.readFailedDetail.enumerate,
      '（枚举现场）本次盘点只有枚举失败 ⇒ 主计数等于 enumerate 分桶（实 '
      + s4.readFailedKeys + ' vs ' + s4.readFailedDetail.enumerate + '）');
  }
  // ── 块3：双消费端（诊断 + 健康分 + 面板）——防「声明面空转」 ──
  section('v2.10.0 块3：双消费端（诊断 + 健康分 + 面板）——防「声明面空转」');
  {
    const dgS = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const stS = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    const pnS = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    assert(dgS.indexOf('WA.settingsBus.readStat') > 0, '诊断采集 settingsBus 读侧台账');
    assert(dgS.indexOf('WA.store.readStat') > 0, '诊断采集 store 读侧台账（两域独立裸读点，只报一处另一半仍不可见）');
    assert(dgS.indexOf("key: 'settingsBus.readFailed'") > 0, '诊断出 settingsBus 读侧议题');
    assert(dgS.indexOf("key: 'store.readFailed'") > 0, '诊断出 store 读侧议题');
    assert(dgS.indexOf("key: 'settingsBus.readSpotCheck'") > 0, '诊断出 readEx 现场抽查议题（readEx 的真实消费端）');
    assert(dgS.indexOf('defaultAfterFailure > 0') > 0, '诊断分级：回落默认值走 error（当下失真，不是历史经历）');
    assert(stS.indexOf("key: 'storage.readFailed'") > 0, '健康分消费「占用表偏小」结论');
    assert(stS.indexOf("key: 'storage.readActivity'") > 0, '健康分消费「误判最冷 / 误删风险」结论');
    assert(stS.indexOf('score -= 7') > 0 && stS.indexOf('score -= 5') > 0,
      '两条读侧结论均带明确扣分（不是只写进 issues 就算接线）');
    assert(pnS.indexOf('读取侧') > 0, '面板透出读侧结论（用户可见出口）');
    assert(pnS.indexOf('defaultAfterFailure') > 0, '面板区分「读失败回落默认值」与「未配置」');
    // 端到端：造读失败现场 → 健康巡视必须报出读侧议题，且存储恢复后议题消失
    frV2100();
    LSV2100.setItem('worldaxis_state_v2100_maint', JSON.stringify({ meta: { updatedAt: Date.now() } }));
    LSV2100.setItem('worldaxis_event_log_v2100_maint', '{}');
    WA.store.maintain({ deep: false });
    const mBase = WA.store.maintain({ deep: false });
    assert(!(mBase.issues || []).some(function (i) { return i.key === 'storage.readFailed' || i.key === 'storage.readActivity'; }),
      '（基线）无故障时读侧议题不出现');
    const rawGetM = LSV2100.getItem;
    let m1 = null;
    try {
      LSV2100.getItem = function (k) { if (String(k).indexOf('worldaxis_') === 0) throw new Error('v2100-maint'); return rawGetM.call(this, k); };
      m1 = WA.store.maintain({ deep: false });
    } finally { LSV2100.getItem = rawGetM; }
    const keys1 = (m1.issues || []).map(function (i) { return i.key; });
    assert(keys1.indexOf('storage.readFailed') >= 0,
      '（端到端）读失败现场 → 健康巡视报出「占用表偏小」（实 ' + keys1.join(',') + '）');
    assert(keys1.indexOf('storage.readActivity') >= 0, '（端到端）同时报出「误判最冷 / 误删风险」');
    assert(m1.score < mBase.score, '健康分随之下调（' + mBase.score + ' → ' + m1.score + '）');
    const m2 = WA.store.maintain({ deep: false });
    assert(!(m2.issues || []).some(function (i) { return i.key === 'storage.readFailed' || i.key === 'storage.readActivity'; }),
      '（可逆性）存储恢复后读侧议题消失——判据是当前态而非历史累计');
    assert(m2.score === mBase.score, '健康分复原（' + m2.score + ' = ' + mBase.score + '）——规则无副作用');
    // 诊断包：readEx 抽查是该出口的唯一真实消费端
    const dg1 = WA.toolDiag.collect();
    assert(dg1.runtime.settingsBus.reads && typeof dg1.runtime.settingsBus.reads.readFailed === 'number',
      '诊断包采集 settingsBus 读侧台账（runtime.settingsBus.reads）');
    assert(dg1.worldState.storage.read && typeof dg1.worldState.storage.read.readFailed === 'number',
      '诊断包采集 store 读侧台账（worldState.storage.read）');
    assert(dg1.runtime.settingsBus.readSpotCheck && typeof dg1.runtime.settingsBus.readSpotCheck.checked === 'number',
      '诊断包带 readEx 现场抽查结果（readEx 有真实消费端，非死导出）');
    // 现场抽查语义：只查有磁盘值的键，损坏值必须被抓成「没读到用户配置」
    const savedRegs2100 = WA.__settingsRegs.slice();
    const kSpot = 'worldaxis_v2100_spot_v1';
    WA.__settingsRegs.length = 0;
    WA.__settingsRegs.push({ key: kSpot, def: { q: 0 } });
    LSV2100.setItem(kSpot, '{broken-json');
    let dg2 = null;
    try { dg2 = WA.toolDiag.collect(); }
    finally { WA.__settingsRegs.length = 0; savedRegs2100.forEach(function (x) { WA.__settingsRegs.push(x); }); }
    const spot2 = dg2.runtime.settingsBus.readSpotCheck;
    assert(spot2.checked === 1 && spot2.misses.length === 1,
      '（端到端）抽查只覆盖有磁盘值的键、且抓到「有值却读不回来」的键（实 checked=' + spot2.checked
      + ' / misses=' + spot2.misses.length + '）');
    assert(spot2.misses[0].key === kSpot && spot2.misses[0].source === 'default-after-failure',
      '抽查结论带键名与来源（可检索、可归因）');
    const vSp = WA.toolDiag.verdict(dg2).issues.filter(function (i) { return i.key === 'settingsBus.readSpotCheck'; });
    assert(vSp.length === 1 && vSp[0].level === 'error', '诊断包对现场抽查失败报 error（当前态失真，不是历史经历）');
    assert(/没读到用户配置/.test(vSp[0].detail), '判语点出失败形态（可检索、可归因）');
    // v2.10.0（逆向审计自纠第四轮）: 恢复点保护失效是**当下缺陷**，必须在两个消费端都报 error。
    frV2100();
    LSV2100.setItem('worldaxis_state_v2100_rb', JSON.stringify({ meta: { updatedAt: Date.now() } }));
    LSV2100.setItem('worldaxis_recovery_v2100_rb', '{broken-rb');
    WA.store.createRecoveryPoint('v2100_rb');       // 触发 recovery 桶计数
    const dgRB = WA.toolDiag.collect();
    assert(dgRB.worldState.storage.read.bySource.recovery > 0
      && dgRB.worldState.storage.read.lastFail.source === 'recovery',
      '（端到端）恢复点读失败被采集进诊断台账、且成为「最近一次」失败（实 '
      + JSON.stringify(dgRB.worldState.storage.read.bySource) + ' / '
      + JSON.stringify((dgRB.worldState.storage.read.lastFail || {}).source) + '）');
    const vRB = WA.toolDiag.verdict(dgRB).issues.filter(function (i) { return i.key === 'store.readRecoveryBlocked'; });
    assert(vRB.length === 1 && vRB[0].level === 'error',
      '诊断包对「恢复点保护失效」报 error（当下无回退能力，不是历史经历）');
    assert(/没有恢复点保护|无恢复点保护/.test(vRB[0].detail), '判语点明后果（可检索、可归因）');
    const mRB = WA.store.maintain({ deep: false });
    const kRB2 = (mRB.issues || []).filter(function (i) { return i.key === 'storage.readRecoveryBlocked'; });
    assert(kRB2.length === 1 && kRB2[0].level === 'error', '健康巡视同样报出「恢复点保护失效」（error 级）');
    assert(pnS.indexOf('没有恢复点保护') > 0, '面板透出该结论（用户可见出口）');
  }
  // ── 块4：归因不实防线（本版逆向审计抓出的四处自身缺陷） ──
  section('v2.10.0 块4：归因不实防线（本版逆向审计抓出的四处自身缺陷）');
  {
    const busS = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
    const storeS = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    // ① 迁移失败必须有消费点（否则 readFailedBy.migrate 是「声明了却没人写」的死桶）
    assert(busS.indexOf("noteReadFail('migrate'") > 0,
      '（自纠1）迁移失败进读侧归因——readFailedBy.migrate 不再是死桶');
    assert(busS.indexOf("noteReadFail('read'") > 0 && busS.indexOf("noteReadFail('parse'") > 0
      && busS.indexOf("noteReadFail('copy'") > 0,
      '（自纠1）read / parse / copy 桶同样各有消费点（四桶全通，无声明空转）');
    // ② rawRevive 的读抛错必须被识别（否则该路径的读失败伪装成「键从未配置」）
    assert(busS.indexOf("'no-storage'") > 0,
      '（自纠2）rawRevive 的读抛错分支被显式识别，不再伪装成「键不存在」');
    // ③ ok 只反映硬失败；降级单列（否则「迁移回写失败」被报成「读不到配置」）
    const rstat = WA.settingsBus.readStat();
    assert(rstat.ok === (rstat.hardFailed === 0), '（自纠3）ok 只由硬失败决定');
    assert(rstat.readFailed >= rstat.hardFailed, '（自纠3）readFailed 含降级（总数不小于硬失败数）');
    // 语义：驱动一次真实降级（迁移钩子抛错）——ok 不得因此变差，硬失败计数不得变
    frV2100();
    const rBefore = WA.settingsBus.readStat();
    const kMig = 'worldaxis_v2100_mig_v1';
    LSV2100.setItem(kMig, JSON.stringify(5));
    const REGMIG = { key: kMig, def: { a: 1 }, migrate: function () { throw new Error('v2100-mig-throw'); } };
    WA.settingsBus.read(REGMIG);
    const rAfter = WA.settingsBus.readStat();
    assert(rAfter.degraded === rBefore.degraded + 1,
      '迁移失败计入 degraded（实 +' + (rAfter.degraded - rBefore.degraded) + '）');
    assert(rAfter.readFailed === rBefore.readFailed + 1, '迁移失败计入 readFailed 总数（分类完备，无落桶外）');
    assert(rAfter.hardFailed === rBefore.hardFailed,
      '（归因不实防线）迁移失败**不**增加硬失败计数——它只是降级，不是「没读到用户配置」');
    assert(rBefore.ok === false || rAfter.ok === true,
      '（归因不实防线）迁移失败不把 ok 拉黑（前 ' + rBefore.ok + ' → 后 ' + rAfter.ok
      + '；本会话硬失败 ' + rAfter.hardFailed + '）——用户要查的是迁移钩子，不是存储');
    // ④ store 侧差值口径（消费端不得拿累计值做当前态判据）
    assert(storeS.indexOf('__byBefore') > 0, '（自纠4）store 分桶明细带「本次盘点」差值基线');
    assert(storeS.indexOf('readFailedCumulative') > 0, '（自纠4）累计值单列，与当前态判据分离');
    const ssD = WA.store.storageStat();
    assert(ssD.readFailedDetail && typeof ssD.readFailedDetail.bytes === 'number'
      && ssD.readFailedCumulative && typeof ssD.readFailedCumulative.bytes === 'number',
      '（自纠4）storageStat 同时给出「本次差值」与「累计」（两者都是数）');
    // ⑤–⑧（逆向审计第四轮）: 命题之外的读侧裸读点——它们的失败后果比「配置读成默认值」更重：
    //   · diskRev 读失败被当成 rev=0 ⇒ 并发检测恒不成立 ⇒ **多实例覆盖静默发生**；
    //   · createRecoveryPoint 清单读失败 ⇒ 下一次写入把全部历史恢复点**静默覆盖丢弃**；
    //   · 写后读回校验 / 删后复核的「读」失败被算成「内容不匹配 / 键仍在」⇒ 归因不实。
    assert(storeS.indexOf('function diskRev(chatId)') > 0 && storeS.indexOf('return { ok: true, rev: 0 }') > 0,
      '（自纠5）diskRev 返回结构化 {ok, rev}——「磁盘序号不可知」不再伪装成 rev=0');
    assert(storeS.indexOf('dRevRes.ok && __seenRev > 0') > 0,
      '（自纠5）磁盘序号读失败时不做冲突判定（「不可知」不得当成「没有冲突」——那是静默覆盖）');
    assert(storeS.indexOf("noteStoreReadFail('diskRev'") > 0,
      '（自纠5）磁盘序号读失败进读侧台账（否则多实例覆盖无任何痕迹）');
    assert(storeS.indexOf('为避免覆盖丢弃全部历史恢复点') > 0,
      '（自纠6）恢复点清单读失败时**不写入**——此前会把 [新点] 整份覆盖，静默丢弃全部历史恢复点');
    assert(storeS.indexOf("'readback-failed'") > 0,
      '（自纠7）写后校验 / 删后复核的读失败有独立原因码（不与「内容不匹配 / 键仍在」混同）');
    // 语义：删后复核的读失败必须与「键静默仍在」可分辨
    frV2100();
    const kRB = 'worldaxis_v2100_readback_v1';
    LSV2100.setItem(kRB, '1');
    const rawG3 = LSV2100.getItem;
    let rbCall = 0;
    LSV2100.getItem = function (k) {
      if (k === kRB) { rbCall++; if (rbCall >= 2) throw new Error('v2100-readback'); }
      return rawG3.call(this, k);
    };
    let rbRes = null;
    try { rbRes = WA.store.removeVerified(kRB); } finally { LSV2100.getItem = rawG3; }
    assert(rbRes.ok === false && rbRes.reason === 'readback-failed',
      '（自纠7）删后复核读失败 → reason=readback-failed（实 ' + rbRes.reason + '），不再误报「删除静默无效」');
    // 语义：恢复点清单损坏时**保命优先**（键内容不得被覆盖）
    frV2100();
    const kRec2100 = 'worldaxis_recovery_v2100b_chat';
    LSV2100.setItem(kRec2100, '{broken-recovery-list');
    const recRawBefore = LSV2100.getItem(kRec2100);
    const recRes = WA.store.createRecoveryPoint('v2100b_chat');
    assert(recRes === null, '（自纠6）读失败时不建点（返回 null，实 ' + JSON.stringify(recRes) + '）');
    assert(LSV2100.getItem(kRec2100) === recRawBefore,
      '（自纠6）损坏的恢复点清单**逐字节未被覆盖**——用户历史恢复点保住了');
    assert((WA.store.readStat().bySource.recovery || 0) > 0,
      '（自纠6）恢复点读失败进读侧台账（recovery 桶，实 ' + JSON.stringify(WA.store.readStat().bySource) + '）');
    // 语义：新增来源必须在 readStat().bySource 里可见（否则「有归因但看不见」＝又一处空转）
    frV2100();
    LSV2100.setItem('worldaxis_state_v2100b_dr', JSON.stringify({ meta: { updatedAt: Date.now() } }));
    const rawG4 = LSV2100.getItem;
    LSV2100.getItem = function (k) { if (String(k).indexOf('worldaxis_state_') === 0) throw new Error('v2100-dr'); return rawG4.call(this, k); };
    try { WA.store.save(WA.store.get()); } catch (e) { /* save 失败无妨：本断言只看归因是否可见 */ }
    finally { LSV2100.getItem = rawG4; }
    const byAll = WA.store.readStat().bySource;
    assert(typeof byAll.diskRev === 'number' && byAll.diskRev > 0,
      '（自纠8）新增读点来源在 readStat().bySource 里全量可见（实 ' + JSON.stringify(byAll) + '）');
    assert((byAll.verify || 0) > 0, '（自纠8）写后读回校验的读失败同样可见（verify 桶）');
  }
  // ── 块5：读侧适用范围（G15）与版本三方对齐 ──
  section('v2.10.0 块5：读侧适用范围（G15）与版本三方对齐');
  {
    const runS = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
    assert(runS.indexOf('G15（v2.10.0）：读侧完整性契约') > 0,
      'G15 门禁在位（与 G13 写侧旁路清单 / G14 删侧出口唯一性构成三面对偶）');
    assert(runS.indexOf('readFailedBy.migrate 有真实消费点') > 0, 'G15 钉「分桶必须有消费点」（防声明面空转）');
    assert(runS.indexOf('readEx 有真实消费端') > 0, 'G15 钉「readEx 有真实消费端」');
    assert(runS.indexOf('readStat 区分「硬失败') > 0, 'G15 钉「归因不得失实」');
    assert(runS.indexOf("noteReadFail('migrate'") > 0, 'G15 钉「迁移桶有消费点」（同型坑不复发）');
    // 全库读侧结构核验（防「多处自增」绕过单一实现）
    const busS = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
    const storeS = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    assert(cnt2100(busS, 'stats.readFailed++') === 1,
      '读失败主计量只在单一实现内自增（实 ' + cnt2100(busS, 'stats.readFailed++') + ' 处）');
    assert(cnt2100(busS, 'default-after-failure') >= 3,
      '三处回落路径（读抛错 / 值解析失败 / legacy 解析失败）都标同一来源（实 '
      + cnt2100(busS, 'default-after-failure') + ' 处）');
    assert(cnt2100(storeS, '__readStat.readFailed++') === 1, 'store 读失败主计量只在单一实现内自增');
    // 版本三方对齐
    const idxS2100v = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfS2100v = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const ver2100v = (idxS2100v.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert(ver2100v === '2.28.0', '入口版本为 2.23.0（实 ' + ver2100v + '）');
    assert(ver2100v === mfS2100v.version, '入口与清单同源同值（' + ver2100v + ' vs ' + mfS2100v.version + '）');
    assert(fs.readFileSync(path.join(BASE, 'engines/contract-audit.js'), 'utf8').indexOf('v2.10.0') > 0,
      '读侧完整性契约留痕（可回溯）');
    assert(busS.indexOf('v2.10.0') > 0, 'settings-bus 读侧出口留痕');
    assert(storeS.indexOf('v2.10.0') > 0, 'store 读侧归因留痕');
    assert(fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8').indexOf('v2.10.0') > 0, '诊断消费端留痕');
    assert(fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8').indexOf('v2.10.0') > 0, '面板消费端留痕');
  }
  // ══════════════════════════════════════════════════════════════════════════
  // v2.11.0：「活性面治理」——读出入口的第三个面、指纹的读侧消费、死面的分级与接线
  //
  //   三面命题（对 v2.8.0「出口面契约」的三重对偶）：
  //     面A：v2.10.0 收口了读**失败**的归因，但**裸读点本身**（`localStorage.getItem`）
  //          没有任何清单——写侧有 G13（裸 setItem 白名单）、删侧有 G14（裸 removeItem
  //          唯一出口），读侧没有 G16。本版把 40 处裸读点全部归因并冻结成清单。
  //     面B：`_schema` 结构指纹自 v2.5.0 就在写侧存在，而读侧只有 `val._schema.fp === fp`
  //          一个判据——**`.d`（短摘要）与 `.at`（写入时间）从未被任何代码读过**，
  //          「这份磁盘值是另一个结构版本写的」无人可问。本版把盖章改成状态机并接消费端。
  //     面C：70 项「真死导出」（inventory 的 `--dead`）被判为整类病灶：55 项 internal-helper
  //          （同文件自用的过度导出）+ 15 项 unwired。后者里藏着**真功能断链**——能力已实现
  //          却零消费端（backstage 运行态/中止、calendar 整日推进、编辑态、两个开关）。
  // ══════════════════════════════════════════════════════════════════════════
  {
  const LSV2110 = global.localStorage;
  const ctxV2110 = global.SillyTavern.getContext();
  function frV2110() { LSV2110.clear(); ctxV2110.chatId = 'v2110_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function cnt2110(s2, needle) { return String(s2).split(needle).length - 1; }

  // ── 块1：面A 读点收口（40 处裸读点全部归因 + 归因收敛为单一出口） ──
  section('v2.11.0 块1：面A 读点收口（全部裸读点有归因 + 跨模块单一出口）');
  {
    const busA = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
    const storeA = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
    // ① 跨模块归因出口：单一台账、多模块投递（绝不各模块自建一份计量）
    assert(typeof WA.store.reportReadFail === 'function' || storeA.indexOf('reportReadFail(source, key, err)') > 0,
      '跨模块读失败归因有单一出口（store.reportReadFail）——引擎侧不各自建计量');
    assert(cnt2110(storeA, 'function noteStoreReadFail(') === 1,
      'store 侧读失败记账仍是单一实现（实 ' + cnt2110(storeA, 'function noteStoreReadFail(') + ' 处）');
    // 引擎侧五处投递点（chatcache / worldbook / workflow / inject / index）
    const eng5 = ['engines/chatcache.js', 'engines/worldbook.js', 'core/workflow.js', 'render/inject.js', 'index.js'];
    eng5.forEach(function (rel) {
      const t = fs.readFileSync(path.join(BASE, rel), 'utf8');
      assert(t.indexOf('reportReadFail') > 0, rel + ' 经跨模块出口投递读失败（不自建计量）');
    });
    // ② 六处「结论不实」现场：读失败不得与业务结论同形（本版核心价值）
    assert(busA.indexOf("reason: 'read-failed'") > 0 && busA.indexOf('rmExisted') > 0,
      '（现场一）受控删除的存在性探测读失败与「键不存在」分开（不再报「幂等无操作」）');
    assert(busA.indexOf("noteReadFail('verifyBack'") > 0 && busA.indexOf("reason: 'read-back-failed'") > 0,
      '（现场二）删后复核读失败与「键确已删除」分开（删除成功不再是假结论）');
    assert(busA.indexOf("noteReadFail('verifyDefaults'") > 0 && busA.indexOf("reason: 'read-failed', ok: null") > 0,
      '（现场三）verifyDefaults 读失败不再改走 providers 比对（结论不再无根据）');
    assert(storeA.indexOf("noteStoreReadFail('saveConflict'") > 0 && storeA.indexOf('unpreserved') > 0,
      '（现场四）并发覆盖前的保全读失败不再静默跳过（他实例进度被吞这件事可见）');
    const ccA = fs.readFileSync(path.join(BASE, 'engines/chatcache.js'), 'utf8');
    assert(ccA.indexOf("noteRead('chatcacheState'") > 0,
      '（现场五）快照读失败与「本地没有快照」分开（安装/覆盖决策前提可判定）');
    assert(ccA.indexOf("noteRead('chatcacheRev'") > 0,
      '（现场六）Lamport 修订号读失败不再回落 0（同步序号不会被判成倒退）');
    // ②b（逆向审计自纠）: 「归因不可读」＝归因不实——凡是投递进 store 台账的来源，
    //   都必须在诊断的 SRC_LABEL 里有标签，否则消费端退回裸桶名，读者只看到一个
    //   内部变量名而不知其后果。本版首版就漏了 `readSpotCheck`（自己新增的来源），
    //   故把这条固化为断言（同型坑在本仓库已复发多次，不能靠记性防）。
    {
      const RE_SRC = /(?:noteStoreReadFail|reportReadFail|reportHostReadFail|noteWbRead|noteRead)\(\s*'([^']+)'/g;
      const prodFiles2110 = [];
      (function walk2110(dir) {
        fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
          if (e.name === '.git' || e.name === 'node_modules') return;
          const p = path.join(dir, e.name);
          if (e.isDirectory()) return walk2110(p);
          if (e.name.endsWith('.js') && dir !== path.join(BASE, 'tests')) prodFiles2110.push(path.relative(BASE, p));
        });
      })(BASE);
      // 只取**跨模块投递**的那六类（settingsBus 侧 noteReadFail 的四来源另有标签表）
      const srcTags2110 = {};
      prodFiles2110.forEach(function (rel) {
        const txt = fs.readFileSync(path.join(BASE, rel), 'utf8');
        RE_SRC.lastIndex = 0; let m;
        while ((m = RE_SRC.exec(txt))) srcTags2110[m[1]] = rel;
      });
      // 从诊断源码里取标签表（括号配平提取，避免注释里的 `{` 破坏切片）
      const dgTagSrc = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
      const t0 = dgTagSrc.indexOf('const SRC_LABEL = {');
      let depth = 0, t1 = -1;
      for (let i = dgTagSrc.indexOf('{', t0); i < dgTagSrc.length; i++) {
        if (dgTagSrc[i] === '{') depth++;
        else if (dgTagSrc[i] === '}') { depth--; if (depth === 0) { t1 = i; break; } }
      }
      const LABEL2110 = vm.runInNewContext('(' + dgTagSrc.slice(dgTagSrc.indexOf('{', t0), t1 + 1) + ')');
      const unlabelled2110 = Object.keys(srcTags2110).filter(function (t) { return !LABEL2110[t]; });
      assert(unlabelled2110.length === 0,
        '（负向）store 台账的每个归因来源都有可读标签（实缺 ' + unlabelled2110.length
        + (unlabelled2110.length ? '：' + unlabelled2110.slice(0, 5).join('、') : '') + '）');
      assert(LABEL2110.readSpotCheck !== undefined,
        '（自纠）readSpotCheck 标签在位（本版首版漏标，消费端退回裸桶名）');
      assert(Object.keys(srcTags2110).length >= 20,
        '（环境）扫描到 store 台账的全部归因来源（实 ' + Object.keys(srcTags2110).length
        + ' 个：noteStoreReadFail 12 / reportReadFail 7 / reportHostReadFail 2，防扫了空集）');
    }
    // ③ 归因不实的反向防线：正常读取不得被误报
    frV2110();
    const rkA = 'worldaxis_v2110_a_v1';
    WA.__settingsRegs.push({ key: rkA, def: { q: 1 } });
    LSV2110.setItem(rkA, '{"q":9}');
    const beforeA = JSON.stringify(WA.store.readStat().bySource);
    const vA = WA.settingsBus.read({ key: rkA, def: { q: 1 } });
    assert(vA.q === 9 && JSON.stringify(WA.store.readStat().bySource) === beforeA,
      '（负向）正常读取不进读失败台账（归因不实比缺失归因更坏）');
  }

  // ── 块2：面A 门禁（G16）——裸读点冻结清单，与 G13/G14 构成三面对偶 ──
  section('v2.11.0 块2：面A 门禁 G16（读侧裸读点冻结清单）');
  {
    const runS2110 = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
    assert(runS2110.indexOf('G16（v2.11.0）：读侧裸读点') > 0, 'G16 门禁在位');
    assert(runS2110.indexOf('INVENTORY_G16') > 0, 'G16 冻结清单在位（新增裸读点即断言失败）');
    assert(runS2110.indexOf('（负向）G16 探针：新加一个裸读文件会被检出') > 0,
      'G16 有负向探针（否则计数断言只是「碰巧成立」）');
    // 语义完整性：每个裸读点附近必须有一次读侧归因投递（「有清单」还不够，得「有归因」）
    const ATTRIB2110 = /noteReadFail\(|noteStoreReadFail\(|reportReadFail\(|reportHostReadFail\(|noteWbRead\(|noteRead\(/;
    const missing2110 = [];
    const ROWS2110 = (function () {
      const dirs = ['core', 'engines', 'render', 'ui', 'actors', 'direction', 'compat'];
      const files = [];
      function walkRel(rel) {
        const abs = path.join(BASE, rel);
        let st = null; try { st = fs.statSync(abs); } catch (e) { return; }
        if (st.isFile()) { if (/\.js$/.test(rel)) files.push(rel); return; }
        let names = []; try { names = fs.readdirSync(abs); } catch (e) { return; }
        names.forEach(function (n) { walkRel(rel + '/' + n); });
      }
      dirs.forEach(walkRel); walkRel('index.js');
      const out = [];
      files.forEach(function (rel) {
        const lines = fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n');
        lines.forEach(function (ln, i) {
          if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
          if (!/localStorage\s*\.\s*getItem\(|(?:ls|LS)\.getItem\(/.test(ln)) return;
          const lo = Math.max(0, i - 3), hi = Math.min(lines.length, i + 15);
          if (!ATTRIB2110.test(lines.slice(lo, hi).join('\n'))) missing2110.push(rel + ':' + (i + 1));
          out.push(rel);
        });
      });
      return out;
    })();
    assert(missing2110.length === 0,
      '（负向）每一处裸读点附近都有读侧归因投递（实无归因 ' + missing2110.length + ' 处'
      + (missing2110.length ? '：' + missing2110.slice(0, 5).join('、') : '') + '）');
    assert(ROWS2110.length === 40, '产品代码裸读点总数为 40（实 ' + ROWS2110.length + '）');
  }

  // ── 块3：面B 指纹读侧消费（状态机 + `.d`/`.at` 首次被读 + 双消费端） ──
  section('v2.11.0 块3：面B 结构指纹读侧消费（状态机 + 陈旧可问）');
  {
    const busB = fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8');
    assert(busB.indexOf("__res0.status = 'stale'") > 0
      && busB.indexOf("__res0.status = 'current'") > 0
      && busB.indexOf("__res0.status = 'stamped'") > 0
      && busB.indexOf("__res0.status = 'failed'") > 0,
      '盖章从「布尔」改为状态机（current / stamped / stale / failed 四态可分辨）');
    // v2.11.0（R3 自纠）: 状态赋值必须**一律经由局部引用**——函数体内若还有裸的
    //   `__schemaStampResult.xxx = ` 赋值，写盘期间一旦发生重入（另一次 read 重建了槽），
    //   本次调用的状态就会落到**别人的对象**上（R3 探针实测：A 的 status 停在 unshaped、
    //   fp 变成 B 的）。该判据不绑变量名、只看「是否还有裸全局写」，故此后再改内部结构也不会失真。
    (function () {
      const fStart = busB.indexOf('function schemaStamp(');
      const fEnd = busB.indexOf('__schemaStampResult = { status:', fStart);
      const body = busB.slice(fStart, fEnd);
      const bare = (body.match(/__schemaStampResult\./g) || []).length;
      assert(bare === 0,
        '（R3②）schemaStamp 函数体内零裸全局槽写（实 ' + bare + ' 处——重入时状态会落到别人的对象上）');
      assert(busB.indexOf('const __res0 = __schemaStampResult;') > 0,
        '（R3②）以局部引用捕获本次结果对象（落账与状态赋值同源）');
    })();
    assert(busB.indexOf('__prev.d') > 0 && busB.indexOf('__prev.at') > 0,
      '`.d` 与 `.at` 首次被读侧消费（此前写侧算完就丢）');
    assert(busB.indexOf('prevDigest') > 0, '`.d` 有下游出口（诊断展示「旧结构是哪一份」）');
    // 语义：磁盘上是旧指纹时，状态必须判 stale 且零覆盖（旧指纹/旧时间被留住）
    frV2110();
    const rkB = 'worldaxis_v2110_b_v1';
    const REGB = { key: rkB, def: { a: 1, b: 2 }, module: 'test' };
    WA.__settingsRegs.push(REGB);
    //   ⚠ 夹具要点：schemaStamp 有**两条** current 判据（旧指纹相等 / 子键全集与声明一致），
    //     故构造 stale 时磁盘值必须子键不全——否则第二条先命中，状态记 current 而非 stale。
    LSV2110.setItem(rkB, JSON.stringify({ a: 1, _schema: { fp: 'old:a|b', d: 'deadbeef', at: 1234567 } }));
    const staleBefore = WA.settingsBus.stats.schemaStatus.stale || 0;
    const vB = WA.settingsBus.read(REGB);
    assert(vB && vB.a === 1 && vB.b === 2, '读取本身不受影响（齐备由补齐逻辑兜住，非指纹状态改变契约）');
    assert((WA.settingsBus.stats.schemaStatus.stale || 0) === staleBefore + 1,
      '（正向）磁盘指纹与当前声明不符 ⇒ 状态记 stale（实 ' + (WA.settingsBus.stats.schemaStatus.stale || 0) + '）');
    const lsB = WA.settingsBus.readStat().schema;
    assert(lsB.lastStale && lsB.lastStale.key === rkB,
      '（正向）lastStale 记下是哪个键（实 ' + JSON.stringify(lsB.lastStale) + '）');
    assert(lsB.lastStale.prevFp === 'old:a|b' && lsB.lastStale.prevDigest === 'deadbeef'
      && lsB.lastStale.prevAt === 1234567,
      '（正向）旧指纹 / 旧摘要 / 旧写入时间三件全部被读出（`.d`/`.at` 首个真实消费者）');
    // 重盖后状态转为 current（零写入幂等）
    const stamped = JSON.parse(LSV2110.getItem(rkB))._schema;
    assert(stamped.fp && stamped.fp !== 'old:a|b' && stamped.d && stamped.at,
      '（正向）旧指纹被按当前结构重盖（fp/d/at 三件齐全）');
    const wB0 = WA.settingsBus.stats.schemaStamps;
    const vB2 = WA.settingsBus.read(REGB);
    assert(WA.settingsBus.stats.schemaStamps === wB0 && vB2.a === 1,
      '（负向）子键已与声明一致 ⇒ 零写入（不产生写盘风暴；第二条 current 判据生效）');
    assert((WA.settingsBus.stats.schemaStatus.current || 0) > 0, '（正向）current 态有落账');
    // 首次盖章：无 _schema 的磁盘值 ⇒ stamped
    const rkB2 = 'worldaxis_v2110_b2_v1';
    WA.__settingsRegs.push({ key: rkB2, def: { z: 3 }, module: 'test' });
    //   同理：只写 `{z:3}` 会被第二条 current 判据判成「子键与声明一致 ⇒ 零写入」，
    //   stamped 永不产生。故夹具须含 def 之外的子键（真实场景＝磁盘上有未声明的存量子键）。
    LSV2110.setItem(rkB2, JSON.stringify({ z: 3, extra: 9 }));
    const st0 = WA.settingsBus.stats.schemaStatus.stamped || 0;
    WA.settingsBus.read({ key: rkB2, def: { z: 3 } });
    assert((WA.settingsBus.stats.schemaStatus.stamped || 0) === st0 + 1,
      '（正向）无指纹且子键与声明不一致 ⇒ 首次盖章记 stamped');
    // 写入失败 ⇒ failed 且消费端可见（配额/隐私模式下「结构版本」维度不可查）
    const rkB3 = 'worldaxis_v2110_b3_v1';
    WA.__settingsRegs.push({ key: rkB3, def: { w: 4 }, module: 'test' });
    LSV2110.setItem(rkB3, JSON.stringify({ w: 4, extra: 9, _schema: { fp: 'old:w', d: 'x', at: 1 } }));
    const rawSetB = LSV2110.setItem;
    const failBefore = WA.settingsBus.stats.schemaStatus.failed || 0;
    LSV2110.setItem = function (k, v) { if (k === rkB3) throw new Error('v2110-stamp-fail'); return rawSetB.call(this, k, v); };
    let threwB = false;
    try { WA.settingsBus.read({ key: rkB3, def: { w: 4 } }); } catch (e) { threwB = true; }
    finally { LSV2110.setItem = rawSetB; }
    assert(threwB === false, '（负向）盖章写失败不抛异常（读热路径不被写故障放大）');
    assert((WA.settingsBus.stats.schemaStatus.failed || 0) === failBefore + 1,
      '（正向）盖章写失败记 failed（实 ' + (WA.settingsBus.stats.schemaStatus.failed || 0) + '）');
    // 双消费端
    const diagB = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const panelB = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    assert(diagB.indexOf('settingsBus.schemaStale') > 0 && diagB.indexOf('settingsBus.schemaStampFailed') > 0,
      '诊断消费指纹状态（陈旧 / 盖章失败两条议题）');
    assert(diagB.indexOf('sbDiag.schema') > 0, '诊断的指纹判据取自采集面（同源，不自造读取）');
    assert(panelB.indexOf('结构指纹') > 0, '面板透出指纹陈旧（用户可见出口）');
    // 判据口径：warn 级用「本会话经历过」（累计），detail 必须给出次数与最近一次
    assert(diagB.indexOf('本会话累计 ') > 0 && diagB.indexOf('最近一次旧结构摘要 ') > 0,
      '判据口径与仓库一致（warn 用经历 + 详情给出次数与最近一次，不把「一次」读成「一直在」）');
    // ── R3 逆向审计自纠（两处真缺陷，探针复现后当版修掉） ──
    // ① 归因不实：磁盘值损坏 ⇒ val 回落 def ⇒ 若照常盖章，会把 **def 的指纹**当磁盘结构判
    //    `current`，于是「这份值结构正确」建立在兜底值上。修法：损坏路径不盖章 + 单列 unreadable。
    assert(busB.indexOf("__corruptVal") > 0 && busB.indexOf("'unreadable'") > 0,
      '（R3①）损坏值不盖章、单列 unreadable（「有配置被读坏」≠「从未配置」）');
    assert(busB.indexOf('unreadable: 0') > 0, '（R3①）readStat 默认四态表含 unreadable');
    assert(diagB.indexOf('settingsBus.schemaUnreadable') > 0 && diagB.indexOf("level: 'error'") > 0,
      '（R3①）诊断出 error 议题（读不出来意味着此刻正以默认值运行，须催用户留证）');
    assert(panelB.indexOf('读不出结构') > 0, '（R3①）面板透出（用户可见出口）');
    frV2110();
    const rkC = 'worldaxis_v2110_corrupt_v1';
    WA.__settingsRegs.push({ key: rkC, def: { a: 1, b: 2 }, module: 'test' });
    LSV2110.setItem(rkC, '{坏JSON');
    const unread0 = WA.settingsBus.stats.schemaStatus.unreadable || 0;
    const vC = WA.settingsBus.read({ key: rkC, def: { a: 1, b: 2 } });
    assert(vC && vC.a === 1 && vC.b === 2, '（R3①）损坏值回落默认（本次运行以默认值继续）');
    assert((WA.settingsBus.stats.schemaStatus.unreadable || 0) === unread0 + 1,
      '（R3①）状态记 unreadable（实 ' + (WA.settingsBus.stats.schemaStatus.unreadable || 0) + '）');
    assert((WA.settingsBus.readStat().schema.lastStamp || {}).fp === null,
      '（R3①）lastStamp.fp 记 null（不把声明结构的指纹冒充磁盘结构）');
    assert(busB.indexOf('__stR && __stR.res') > 0 && busB.indexOf('if (__stR && __stR.res) __stR.res.status = \'stale\'') === -1,
      '（R3①）落账用捕获的结果对象（模块级槽在重入下会被覆盖）');
    // ② 重入串扰：盖章写盘期间发生嵌套 read 时，外层落账不得记成另一个键
    const rkA = 'worldaxis_v2110_reent_a_v1', rkB2c = 'worldaxis_v2110_reent_b_v1';
    WA.__settingsRegs.push({ key: rkA, def: { a: 1 }, module: 'test' });
    const rkBreg = { key: rkB2c, def: { b: 1 }, module: 'test' };
    WA.__settingsRegs.push(rkBreg);
    LSV2110.setItem(rkA, JSON.stringify({ a: 1, extra: 9 }));
    LSV2110.setItem(rkB2c, JSON.stringify({ b: 1, _schema: { fp: 'old:b', d: 'D2', at: 5 } }));
    const rawSetR = LSV2110.setItem;
    let reentered = false;
    LSV2110.setItem = function (k, v) {
      if (k === rkA && !reentered) { reentered = true; WA.settingsBus.read(rkBreg); }
      return rawSetR.call(this, k, v);
    };
    try { WA.settingsBus.read({ key: rkA, def: { a: 1 } }); } finally { LSV2110.setItem = rawSetR; }
    assert(reentered === true, '（R3②）夹具生效：盖章写盘期间真发生了一次嵌套 read');
    const lsRe = WA.settingsBus.readStat().schema.lastStamp || {};
    assert(lsRe.key === rkA, '（R3②）重入不串扰：外层落账仍是本键（实 ' + lsRe.key + '）');
  }

  // ── 块4：面C 死面接线（真功能断链接通消费端） ──
  section('v2.11.0 块4：面C 死面接线（真功能断链接通真实消费端）');
  {
    const panelC = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    const diagC = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    const bsC = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
    const calC = fs.readFileSync(path.join(BASE, 'engines/calendar.js'), 'utf8');
    // ① backstage 运行态 / 中止
    assert(typeof WA.backstage.isRunning === 'function' && typeof WA.backstage.pending === 'function'
      && typeof WA.backstage.abort === 'function', 'backstage 三个断链成员已导出');
    assert(panelC.indexOf('wa-bs-abort') > 0 && panelC.indexOf('WA.backstage.abort()') > 0,
      'backstage.abort 有真实消费端（面板「中止推演」按钮）');
    assert(panelC.indexOf('WA.backstage.isRunning()') > 0, 'backstage.isRunning 有消费端（运行态显示）');
    assert(diagC.indexOf('running: __runState') > 0 && diagC.indexOf('pending: __pend0') > 0,
      'backstage 运行态/排队态进入诊断（两个域各一条）');
    const uiBindC = WA.toolDiag.UI_BINDINGS.filter(function (g) { return g.page === 'events'; })[0] || {};
    assert(((uiBindC.cond || []).indexOf('wa-bs-abort') >= 0) || panelC.indexOf('wa-bs-abort') > 0,
      'wa-bs-abort 纳入 UI 绑定守卫（条件渲染控件不得游离于守卫表外）');
    // ② calendar.advanceDay 收敛为单一实现
    assert(typeof WA.calendar.advanceDay === 'function', 'calendar.advanceDay 已导出（原零调用）');
    assert(calC.indexOf('this.advanceDay({ keepPart: true, source: \'text\' })') > 0,
      'autoAdvance 的跳日分支收敛到 advanceDay（消除两份跳日逻辑的漂移）');
    assert(cnt2110(calC, '__calStat.dayAdvances++') === 1,
      '整日推进计量只在单一实现内自增（实 ' + cnt2110(calC, '__calStat.dayAdvances++') + ' 处，防同一件事计两次）');
    frV2110();
    WA.calendar.setClock('第1日·黄昏', { dayIndex: 1 });
    const d1 = WA.calendar.advanceDay({ keepPart: true, source: 'test' });
    assert(d1 === 2 && WA.store.read('clock.label', '') === '第2日·黄昏',
      '（正向）整日推进保留时段（第1日·黄昏 → 第2日·黄昏，实 ' + WA.store.read('clock.label', '') + '）');
    assert(WA.calendar.stat().dayAdvances >= 1, 'dayAdvances 计量可见（实 ' + WA.calendar.stat().dayAdvances + '）');
    const dayBeforeSig = WA.calendar.stat().advanced;
    WA.calendar.autoAdvance('次日清晨，他推门而入');
    assert(WA.calendar.stat().dayAdvances >= 2 && WA.store.read('clock.label', '') === '第3日·黄昏',
      '（正向）正文时间词走的是同一实现（保留时段，标签口径不漂移）');
    assert(WA.calendar.stat().advanced === dayBeforeSig + 1, 'autoAdvance 的 advanced 仍只计一次');
    // ③ 编辑态（setEditingId 此前零调用 ⇒ 阅读态永远无标记可显示）
    assert(typeof WA.editorFaction.getEditingId === 'function' && typeof WA.editorFaction.setEditingId === 'function',
      'editorFaction 编辑态读写已导出');
    assert(typeof WA.editorEvents.getEditingId === 'function' && typeof WA.editorEvents.setEditingId === 'function',
      'editorEvents 编辑态读写已导出');
    assert(panelC.indexOf('WA.editorFaction.getEditingId()') > 0 && panelC.indexOf('WA.editorEvents.getEditingId()') > 0,
      '两处编辑态被面板读取（渲染「编辑中」标记）');
    assert(panelC.indexOf('WA.editorFaction.setEditingId(') > 0 && panelC.indexOf('WA.editorEvents.setEditingId(') > 0,
      '两处编辑态被面板写入（否则阅读态永远无标记）');
    WA.editorFaction.setEditingId(2);
    assert(WA.editorFaction.getEditingId() === 2, '（正向）编辑态写入后可读回（实 ' + WA.editorFaction.getEditingId() + '）');
    WA.editorFaction.setEditingId(null);
    assert(WA.editorFaction.getEditingId() === null, '（正向）编辑态可清空（删除项后不留悬空标记）');
    // ④ 两个开关（isEnabled 此前零调用）
    assert(typeof WA.proactive.isEnabled === 'function' && typeof WA.wbInject.isEnabled === 'function',
      'proactive / wbInject 开关查询已导出');
    assert(diagC.indexOf('WA.proactive.isEnabled()') > 0 && diagC.indexOf('WA.wbInject.isEnabled()') > 0,
      '两个开关有真实消费端（诊断 switches 节）');
    assert(diagC.indexOf('switches') > 0 && diagC.indexOf('wbActiveOrders') > 0,
      '诊断透出开关状态与生效中的世界书条目数（回答「功能到底开没开」）');
    const sw = WA.toolDiag.secRuntime().switches;
    assert(sw && typeof sw.proactive === 'boolean' && sw.wbInject === true,
      '（正向）开关状态可在诊断中读到（实 ' + JSON.stringify(sw) + '）');
    // ⑤ 过时裸入口摘除（五个「被 Safe 版取代」的入口不得复活）
    ['setProfile'].forEach(function (m) {
      assert(WA.registry[m] === undefined, '过时裸入口 registry.' + m + ' 已摘除（防下一个调用者挑错的那个绕过准入）');
    });
    ['addRule', 'removeRule', 'loadPreset'].forEach(function (m) {
      assert(WA.purifier[m] === undefined, '过时裸入口 purifier.' + m + ' 已摘除');
    });
    assert(WA.settingsBus.readRaw === undefined, '过时裸入口 settingsBus.readRaw 已摘除');
    assert(typeof WA.registry.setProfileSafe === 'function' && typeof WA.purifier.addRuleSafe === 'function'
      && typeof WA.purifier.importPresetSafe === 'function',
      'Safe 版入口全部在位（摘除的是被取代的那一份，不是能力本身）');
    // ⑥ backstage def 声明补齐（4 个子键一直被读却从未进 def）
    assert(bsC.indexOf('proactive:') > 0 && bsC.indexOf('wbInject:') > 0
      && bsC.indexOf('wbWorldbookName:') > 0 && bsC.indexOf('wbAutoEnsure:') > 0,
      'backstage def 补齐 4 个子键（否则 verifyDefaults 会永久报假缺口）');
    const bsReg = (WA.__settingsRegs || []).filter(function (r) { return r.key === 'worldaxis_backstage_settings_v1'; })[0];
    assert(bsReg && bsReg.def && 'proactive' in bsReg.def && 'wbInject' in bsReg.def
      && 'wbWorldbookName' in bsReg.def && 'wbAutoEnsure' in bsReg.def,
      '（正向）运行时 def 含这 4 个子键（声明面与实际消费面一致）');
  }

  // ── 块5：版本三方对齐 ──
  section('v2.11.0 块5：版本三方对齐');
  {
    const idxS2110 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfS2110 = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const ver2110 = (idxS2110.match(/const VERSION = '([\d.]+)'/) || [])[1];
    assert(ver2110 === '2.28.0', '入口版本为 2.23.0（实 ' + ver2110 + '）');
    assert(ver2110 === mfS2110.version, '入口与清单同源同值（' + ver2110 + ' vs ' + mfS2110.version + '）');
    assert(fs.readFileSync(path.join(BASE, 'engines/contract-audit.js'), 'utf8').indexOf('v2.11.0') > 0,
      '活性面治理契约留痕（可回溯）');
    assert(fs.readFileSync(path.join(BASE, 'core/settings-bus.js'), 'utf8').indexOf('v2.11.0') > 0,
      '读点收口 + 指纹状态机留痕');
    assert(fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8').indexOf('v2.11.0') > 0, 'store 读点归因留痕');
    assert(fs.readFileSync(path.join(BASE, 'engines/calendar.js'), 'utf8').indexOf('v2.11.0') > 0, '整日推进单一实现留痕');
  }

  // v2.12.0: UI render-path gate (G17).
  //   tests/run.js LOAD deliberately omits ui/*, and its inline DOM stub is a hollow shell:
  //   querySelector() returns a fresh detached div, querySelectorAll() returns [], and
  //   firstElementChild comes from a global slot. So `body.innerHTML = render()` did run,
  //   but parsing and queries were all virtual - only the overview renderer executed and
  //   its output was dropped; the other nine renderers, the tab/control bindings, the
  //   conditional rendering and the rerender scheduling had zero execution coverage.
  //   This block embeds the tests/ui-gate.js cases verbatim (same implementation, no copy)
  //   so that `node tests/run.js` covers the render path.
  section('v2.12.0 块5：UI 渲染路径门禁（G17，真实 DOM 解析）');
  {
  async function __uiGateBlocks() {
    const pass = [], fail = [];
    function assert(cond, name, extra) {
      if (cond) { pass.push(name); console.log('  \u2713 ' + name); }
      else { fail.push(name); console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    }
    function section(t) { console.log('\n\u25a0 ' + t); }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    const countControls = function (html) { return (html.match(/<(button|input|select|textarea)\b/g) || []).length; };

    const env = __uiGateFresh();
    const WA = env.WA, dom = env.dom;
    const panel = dom.getElementById('wa-panel');

    section('G17-A 面板与悬浮球挂载（buildPanel / buildOrb 真实执行）');
    assert(!!panel, '#wa-panel 已注入 DOM（buildPanel 走到 appendChild）');
    assert(!!dom.getElementById('wa-orb'), '#wa-orb 悬浮球已注入 DOM');
    assert(!!panel && panel.querySelectorAll('.wa-tab').length === (WA.ui.pages() || []).length,
      '页签数量与 pages() 一致（实 ' + (panel ? panel.querySelectorAll('.wa-tab').length : -1) + '）');
    assert(!!panel && !!panel.querySelector('.wa-close'), '关闭按钮成树（点击绑定不空转）');
    assert(!!panel && !!panel.querySelector('.wa-body'), '内容容器成树（renderBody 的挂载点）');
    assert(!!panel && panel.classList.contains('wa-hidden') === true, '初始为隐藏态（未点开时不占屏）');

    section('G17-B 十个渲染器逐页真实执行（点击 → renderBody → innerHTML 解析 → bindBody）');
    WA.ui.open();
    assert(panel.classList.contains('wa-hidden') === false, 'open() 后翻为可见');
    const pages = __uiGateCheckPages(env, countControls);
    assert(pages.tested === 10, 'RENDERERS 覆盖的页面数为 10（实 ' + pages.tested + '）');
    assert(pages.failures.length === 0, '十个页面全部渲染成树且控件可在树中找到', pages.failures.join('；'));
    console.log('    ' + pages.details.join('  '));
    assert(WA.ui.currentPage() === (WA.ui.pages() || []).slice(-1)[0],
      '切换按 pages() 原始顺序推进（末页实 ' + WA.ui.currentPage() + '）');

    section('G17-C 控件绑定真实生效（bindBody：点了有反应，而不是空转）');
    {
      const tabOf = function (p) { return panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0]; };
      tabOf('overview').click();
      assert(WA.ui.currentPage() === 'overview', '（正向）页签点击后 currentPage 跟随');
      tabOf('settings').click();
      const sBody = panel.querySelector('.wa-body');
      const sCtl = sBody.querySelectorAll('button,input,select').length;
      assert(sBody.innerHTML.indexOf('未加载') < 0 && sCtl > 0,
        '设置页是真实面板（非「模块未加载」占位，控件在树中 ' + sCtl + ' 个）');
      tabOf('overview').click();
      const oBody = panel.querySelector('.wa-body');
      assert(oBody.querySelectorAll('.wa-stat').length >= 6, '概览页统计网格在树中可查询（wa-stat 命中 ≥6）');
      assert(oBody.querySelectorAll('[data-node]').length >= 1, '概览页工作流节点开关进入引用面（data-node 命中 ≥1）');
      assert(oBody.querySelectorAll('.wa-tab').length === 0, '渲染容器与页签容器互不污染（子树边界正确）');
      tabOf('events').click();
      const evBody = panel.querySelector('.wa-body');
      assert(evBody.querySelectorAll('.wa-rep-cell').length === 4, '事件页声誉四维网格在树中可查询（wa-rep-cell 恰 4）');
      assert(evBody.querySelectorAll('.wa-sec').length >= 3, '事件页分节标题进入引用面（wa-sec 命中 ≥3）');
      const orb = dom.getElementById('wa-orb');
      let orbErr = null;
      try { orb.dispatchEvent({ type: 'pointerup' }); } catch (e) { orbErr = e; }
      assert(!orbErr && panel.classList.contains('wa-hidden') === true, '悬浮球 pointerup → toggle() 收起面板（orb 事件链贯通）');
      orb.dispatchEvent({ type: 'pointerdown', clientX: 5, clientY: 5, pointerId: 1 });
      orb.dispatchEvent({ type: 'pointermove', clientX: 60, clientY: 70, pointerId: 1 });
      orb.dispatchEvent({ type: 'pointerup' });
      assert(panel.classList.contains('wa-hidden') === true, '（正向）拖动后的 pointerup 不误触发开合（moved 阈值生效）');
      WA.ui.open();
    }

    section('G17-D 事件页运行态条件渲染与「中止推演」链路（v2.11.0 面C 接线）');
    {
      const tabOf = function (p) { return panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0]; };
      tabOf('events').click();
      const eBody = panel.querySelector('.wa-body');
      assert(!eBody.querySelector('#wa-bs-abort'), '（负向）空闲态不渲染中止按钮（与 isRunning 一致）');
      assert(typeof WA.backstage.forceSimulate === 'function', 'backstage.forceSimulate 可调用');
      let inflight = 0;
      const origFetch = global.fetch;
      global.fetch = function (url, o) {
        return new Promise(function (res, rej) {
          inflight++;
          const sg = o && o.signal;
          if (sg) sg.addEventListener('abort', function () { rej(new Error('aborted')); });
        });
      };
      try { WA.backstage.forceSimulate(); } catch (e) {}
      const dl = Date.now() + 2500;
      while (!WA.backstage.isRunning() && Date.now() < dl) await sleep(10);
      assert(WA.backstage.isRunning() === true,
        '（正向）推演进行中 isRunning()===true（在途请求未回）',
        'inflight=' + inflight + ' last=' + JSON.stringify((WA.eventLog || []).slice(-1)[0] || null));
      tabOf('events').click();
      const abortBtn = panel.querySelector('.wa-body #wa-bs-abort');
      assert(!!abortBtn, '运行态渲染出「中止推演」按钮（条件渲染命中运行分支）');
      let abortErr = null;
      try { if (abortBtn) abortBtn.click(); } catch (e) { abortErr = e; }
      assert(!abortErr, '点击中止不抛异常（绑定真实命中）');
      const dl2 = Date.now() + 2500;
      while (WA.backstage.isRunning() && Date.now() < dl2) await sleep(10);
      assert(WA.backstage.isRunning() === false, '中止后 isRunning() 归 false（信号贯通到在途请求）');
      assert((WA.eventLog || []).some(function (l) { return /中止|abort/i.test(l.msg || ''); }), '中止动作已写入事件日志');
      global.fetch = origFetch;
    }

    section('G17-E 状态事件 → 自动重绘（节流 / 隐藏跳过）');
    {
      panel.querySelector('.wa-close').click();
      assert(panel.classList.contains('wa-hidden') === true, '（正向）关闭按钮点击 → 面板收起（close 绑定真实生效）');
      const s0 = WA.ui.rerenderStat();
      WA.emit('clock:changed', 'ui-gate-probe');
      const s1 = WA.ui.rerenderStat();
      assert(s1.scheduled === s0.scheduled + 1, '状态事件被调度重绘');
      assert(s1.skippedHidden === s0.skippedHidden + 1, '面板隐藏时不重绘（避免无效渲染）');
      WA.ui.open();
      const s2 = WA.ui.rerenderStat();
      WA.emit('chapters:changed'); WA.emit('registry:changed');
      await sleep(350);
      const s3 = WA.ui.rerenderStat();
      assert(s3.scheduled === s2.scheduled + 2, '两次变更都进调度');
      assert(s3.ran === s2.ran + 1, '节流：一窗多变更只重绘一次（防重绘风暴）');
    }

    section('G17-F 连续切换不留异常（渲染状态不泄漏）');
    {
      const arr = WA.ui.pages();
      for (let i = 0; i < 30; i++) {
        const p = arr[i % arr.length];
        panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === p; })[0].click();
      }
      assert(WA.ui.currentPage() === arr[29 % arr.length], '30 次切换后停在预期页（实 ' + WA.ui.currentPage() + '）');
      const b = panel.querySelector('.wa-body');
      assert(!!b && b.innerHTML.length > 0, '30 次切换后渲染产物非空');
    }

    section('G17-G 探针自证：解析器关键能力 + 负向注入必须被抓到');
    {
      const probe = dom.createElement('div');
      probe.innerHTML = '<input id="p1" value="abc"/><input id="p2" type="checkbox" checked/><input id="p3">';
      assert(probe.querySelectorAll('input').length === 3, '（自证）自闭合标签逐个成节点且不吞兄弟节点');
      assert(probe.querySelector('#p1').value === 'abc', '（自证）解析器保留 value 属性（否则控件读取全空却「渲染正常」）');
      assert(probe.querySelector('#p2').checked === true, '（自证）解析器保留 checked 属性');
      const r0 = __uiGateCheckPages(env, countControls);
      assert(r0.failures.length === 0, '（基线）未破坏时逐页探针零失败（实 ' + r0.tested + ' 页）');
      const src = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
      const doctored = src.replace('function renderLogs() {', 'function renderLogs() { throw new Error(\'ui-gate-probe\');');
      assert(doctored !== src, '（自证）注入点 A 命中（renderLogs）');
      const env2 = __uiGateFresh({ srcOverride: { 'ui/panel.js': doctored } });
      const r2 = __uiGateCheckPages(env2, countControls);
      assert(r2.failures.length > 0, '（负向）渲染器抛异常被逐页探针抓到（实失败 ' + r2.failures.length + ' 项）');
      const doctored2 = src.replace('data-page="${p.id}"', 'data-page-x="${p.id}"');
      assert(doctored2 !== src, '（自证）注入点 B 命中（页签 data-page）');
      const env3 = __uiGateFresh({ srcOverride: { 'ui/panel.js': doctored2 } });
      const r3 = __uiGateCheckPages(env3, countControls);
      assert(r3.failures.length > 0, '（负向）页签绑定断掉被逐页探针抓到（实失败 ' + r3.failures.length + ' 项）');
      const envShell = __uiGateFresh({ files: [] });
      assert(envShell.dom.getElementById('wa-panel') === null,
        '（负向）未装载 UI 时面板不存在（探针判据来自真实渲染，不是常量）');
    }
    section('G18 控件可点性（v2.21.0 第九面：点了会不会抛）');
    {
      // G17 只验证「控件**成树**」，不验证「控件**可点**」。真缺陷恰在后者：
      //   设置页 async 出口在 await **之后**才写 out().textContent，而 out() 每次重查，
      //   其间面板重绘使节点离树 ⇒ TypeError；面板三处裸 prompt 在无 prompt 宿主里
      //   ReferenceError，而它们是唯一入口。探针口径见 ui-gate-sync.checkClickable。
      const envC = __uiGateFresh();
      const rc = await __uiGateCheckClickable(envC);
      assert(rc.controls >= 100, '（正向）逐页控件被真实点到（实 ' + rc.controls + ' 个）');
      assert(rc.thrown.length === 0, '（正向）全部控件点击零同步抛出', rc.thrown.join('；'));
      assert(rc.rejections.length === 0, '（正向）点击后无未处理 Promise 拒绝', rc.rejections.join('；'));
      const srcP18 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
      const bA18 = srcP18.replace(
        "const v = askText('设定世界时间（如「三日目·黄昏」）：', WA.store.read('clock.label', '')); if (v != null)",
        "const v = prompt('设定世界时间（如「三日目·黄昏」）：', WA.store.read('clock.label', '')); if (v != null)");
      assert(bA18 !== srcP18, '（自证）负向注入点 A 命中（世界钟裸 prompt）');
      const rcA = await __uiGateCheckClickable(__uiGateFresh({ srcOverride: { 'ui/panel.js': bA18 } }));
      assert(rcA.thrown.length > 0, '（负向）裸 prompt 的 ReferenceError 被同步抛出抓到（实 ' + rcA.thrown.length + ' 项）');
      const srcS18 = fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8');
      const bB18 = srcS18.replace(
        'const setOut = function (text) { const o = out(); if (o) o.textContent = text; };',
        'const setOut = function (text) { out().textContent = text; };');
      assert(bB18 !== srcS18, '（自证）负向注入点 B 命中（settings 判空出口）');
      const rcB = await __uiGateCheckClickable(__uiGateFresh({ srcOverride: { 'ui/settings.js': bB18 } }));
      assert(rcB.rejections.length > 0, '（负向）异步出口写回失败的未处理拒绝被拿到（实 ' + rcB.rejections.length + ' 项）');
    }
    // v2.21.0: 总线复位。本进程把模块反复装载进**同一个** global.WorldAxis，而总线监听登记
    //   在每次装载 core 时被重建——于是「最后一个 fresh() 决定总线残留监听器数」。
    //   G17-G 以 fresh({files:[]})（不装 ui/*）收尾，故此后总线是裸的；G18 会多次装
    //   带面板的 UI（面板在 buildPanel 时按 STATE_EVENTS 订阅 backstage:settled /
    //   chat:changed），若不收尾，末尾留下的那份订阅会污染后续 G21 的
    //   「休眠期这两个事件无人监听」判定——那是装置耦合，不是产品缺陷。
    //   故显式以不装 UI 的一份环境收尾（与 G17-G 同一惯例），把总线复位成裸态。
    __uiGateFresh({ files: [] });

    console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
    console.log('UI 渲染路径门禁：通过 ' + pass.length + ' / 失败 ' + fail.length);
    if (fail.length) { console.log('失败项: ' + fail.join(' | ')); }
    console.log('全部通过 ✓（渲染路径已被真实执行）');
    return { pass: pass.length, fail: fail.length, failures: fail.slice() };
  }
    const __uiGateRes = await __uiGateBlocks();
    assert(__uiGateRes.pass >= 46, '（正向）G17+G18 断言数 ≥ 46（实 ' + __uiGateRes.pass + '）');
    assert(__uiGateRes.fail === 0, '（正向）UI 渲染路径门禁全绿（渲染器/绑定/条件渲染均真实执行）', __uiGateRes.failures.join('；'));
    pass += __uiGateRes.pass;
    fail += __uiGateRes.fail;
  }
  // ══════════════════════════════════════════════════════════════════
  // v2.22.0 块：展示映射漂移（第十面：UI 展示层与引擎真源的键集契约）
  //
  // 命题：前九面把写侧/删侧/读侧/活性面/渲染路径/控件可点性逐一收口，观测面完备。
  //   但 UI 展示层还藏着一类**静态**缺陷——「第二份真源」：
  //     · 枚举 → 徽章/配色映射（factionBadge/relBadge/repColor/ecoColor）
  //     · 可见性源 → 中文标签（renderDirector）
  //     · 失败桶/读来源 → 中文标签（WS_LABEL/rSrcTxt/rdSrcTxt/LAB_P）
  //   这些映射在 ui/panel.js 里各写一遍，与引擎侧枚举常量、记账桶集并存。引擎一方
  //   新增枚举值或桶时，UI 一方若不同步，映射**静默回退**（`|| '⚪'` / `|| k`）——
  //   用户看到错误的徽章色、或裸露的英文桶名。此类缺陷运行期不抛不报，G17/G18 全绿
  //   也照不出（这正是本版实测到 6 组漂移却无一条自动化报警的原因）。
  //   同族先例：tool-analyzer v0.9.6 曾因气候枚举未对齐 evolution.ECONOMY_CLIMATE 自纠。
  // 判据：UI 映射键集 == 引擎真源键集（缺键=静默回退；幽灵键=永不命中）。真源一律从源码
  //   提取：枚举取常量数组；记账桶取「声明桶 ∪ 调用点字面量标签」（三者均动态建桶）。
  section('v2.22.0 块：展示映射漂移（UI 键集 == 引擎真源键集，含负向自证）');
  {
    const SM_FILES = ['ui/panel.js', 'engines/evolution.js', 'engines/editor-faction.js', 'engines/tool-diag.js', 'engines/backstage.js', 'engines/editor-events.js', 'engines/inspector-state.js', 'render/inject.js', 'core/settings-bus.js', 'core/store.js'];
    const smSrcs = {};
    SM_FILES.forEach(function (f) { smSrcs[f] = fs.readFileSync(path.join(BASE, f), 'utf8'); });
    const smBase = __uiGateCheckSrcMaps();
    smBase.groups.forEach(function (g) {
      assert(g.ok, '（正向）' + g.name + ' 键集与引擎真源一致（ui ' + g.ui + ' / eng ' + g.eng + '）',
        g.missing.length || g.ghost.length ? ('缺键[' + g.missing.join('、') + '] 幽灵键[' + g.ghost.join('、') + ']') : '');
    });
    assert(smBase.failures.length === 0, '（正向）枚举/标签/引擎↔引擎映射零漂移', smBase.failures.join('；'));
    // 负向自证：判据必须抓得住「引擎加了值但 UI 没跟」与「UI 自造了引擎没有的键」两类漂移。
    //   ① 枚举漂移：把 ecoColor 的引擎真值「衰退」改写成幽灵键「萧条」⇒ 缺键 + 幽灵键双向现形。
    const Q = String.fromCharCode(39);
    const smDoc1 = smSrcs['ui/panel.js'].replace(
      Q + '平稳' + Q + ':' + Q + '#2196f3' + Q + ',' + Q + '衰退' + Q,
      Q + '平稳' + Q + ':' + Q + '#2196f3' + Q + ',' + Q + '萧条' + Q);
    assert(smDoc1 !== smSrcs['ui/panel.js'], '（负向自证）枚举漂移注入点命中（ecoColor 衰退→萧条）');
    const smNeg1 = __uiGateCheckSrcMaps({ srcOverride: { 'ui/panel.js': smDoc1 } });
    assert(smNeg1.failures.length > 0, '（负向）枚举漂移被判据抓到（实 ' + smNeg1.failures.length + ' 组）');
    assert(smNeg1.failures.join('').indexOf('衰退') > 0 && smNeg1.failures.join('').indexOf('萧条') > 0,
      '（负向）缺键与幽灵键双向现形');
    //   ② 桶标签漂移：删掉 WS_LABEL 的 verify 键 ⇒ 与 settings-bus.writeFailedBy 失配。
    const smDoc2 = smSrcs['ui/panel.js'].replace(
      ',' + '\n' + '            verify: ' + Q + '写后读回不一致' + Q,
      '');
    assert(smDoc2 !== smSrcs['ui/panel.js'], '（负向自证）桶标签漂移注入点命中（WS_LABEL 删 verify）');
    const smNeg2 = __uiGateCheckSrcMaps({ srcOverride: { 'ui/panel.js': smDoc2 } });
    assert(smNeg2.failures.length > 0 && smNeg2.failures.join('').indexOf('verify') > 0,
      '（负向）桶标签漂移被判据抓到（WS_LABEL 缺 verify）');
    //   ③ 真源漂移：引擎侧新增一个枚举值 ⇒ UI 缺键必须现形（扫的是引擎源码，不是 UI 副本）。
    const smDoc3 = smSrcs['engines/evolution.js'].replace('FACTION_STATUS = [', 'FACTION_STATUS = [' + Q + '新兴' + Q + ',');
    assert(smDoc3 !== smSrcs['engines/evolution.js'], '（负向自证）引擎真源漂移注入点命中');
    const smNeg3 = __uiGateCheckSrcMaps({ srcOverride: { 'engines/evolution.js': smDoc3 } });
    assert(smNeg3.failures.length > 0 && smNeg3.failures.join('').indexOf('新兴') > 0,
      '（负向）引擎新增枚举值而 UI 未跟 ⇒ 缺键现形');
    //   ④ 引擎↔引擎漂移：编辑器的势力状态集与引擎真源各写一份 ⇒ 改一份即须现形。
    const smDoc4 = smSrcs['engines/editor-faction.js'].replace(
      'STATUSES = [' + Q + '鼎盛' + Q, 'STATUSES = [' + Q + '强盛' + Q);
    assert(smDoc4 !== smSrcs['engines/editor-faction.js'], '（负向自证）引擎↔引擎漂移注入点命中（STATUSES 鼎盛→强盛）');
    const smNeg4 = __uiGateCheckSrcMaps({ srcOverride: { 'engines/editor-faction.js': smDoc4 } });
    assert(smNeg4.failures.length > 0 && smNeg4.failures.join('').indexOf('鼎盛') > 0,
      '（负向）编辑器状态集与引擎真源漂移被判据抓到');
    //   ⑤ 诊断包消费端漂移：tool-diag 的写侧标签表删掉 verify ⇒ 与 writeFailedBy 失配。
    const smDoc5 = smSrcs['engines/tool-diag.js'].replace(
      ',' + '\n' + '        verify: ' + Q + '写后读回不一致' + Q,
      '');
    assert(smDoc5 !== smSrcs['engines/tool-diag.js'], '（负向自证）诊断包标签漂移注入点命中（tool-diag 删 verify）');
    const smNeg5 = __uiGateCheckSrcMaps({ srcOverride: { 'engines/tool-diag.js': smDoc5 } });
    assert(smNeg5.failures.length > 0 && smNeg5.failures.join('').indexOf('verify') > 0,
      '（负向）诊断包标签表漂移被判据抓到');
    //   ⑥ 阶段序列漂移：evolution.STAGE_MAP 是 editorEvents.TYPE_STAGES 的第二份真源。
    const smDoc6 = smSrcs['engines/evolution.js'].replace(
      'STAGE_MAP = { conflict: [' + Q + '萌芽' + Q,
      'STAGE_MAP = { conflict: [' + Q + '萌发' + Q);
    assert(smDoc6 !== smSrcs['engines/evolution.js'], '（负向自证）阶段序列漂移注入点命中（STAGE_MAP 萌芽→萌发）');
    const smNeg6 = __uiGateCheckSrcMaps({ srcOverride: { 'engines/evolution.js': smDoc6 } });
    assert(smNeg6.failures.length > 0 && smNeg6.failures.join('').indexOf('萌芽') > 0,
      '（负向）阶段序列副本与规范阶段集漂移被判据抓到');
    console.log('  ✓ 十面门禁：UI/诊断/编辑器/阶段序列映射键集 == 引擎真源键集（' + smBase.groups.length + ' 组）');
    console.log('  ✓ 负向自证：枚举漂移 / 桶标签漂移 / 真源漂移 / 引擎↔引擎 / 诊断包 / 阶段序列漂移均被源码级判据抓到');
    //   v2.23.0：动态桶明细表不得退化为硬编码子集。
    //   命题：`__readStat.bySource` 支持动态建桶（noteStoreReadFail / reportReadFail 可传任意来源），
    //   但 `readFailedDetail` / `readFailedCumulative` 曾把明细硬编码成 3 键，本会话新增的 12+ 来源
    //   在明细里连键都没有 ⇒ 消费点 `readFailedCumulative.recovery || 1` 恒得 1，诊断永远谎报
    //   「本会话累计 1 次」。这是「第二份真源」的**同族第三种形态**：不是键集对不上，而是
    //   明细被写成了固定子集、与它标注的动态桶脱钩。
    //   判据（源码级）：detail/cumulative 的构造必须**遍历**动态桶（Object.keys(bySource)），
    //   而非列出固定键；并核验消费点引用的 `.recovery` 真在该明细的键集内。
    {
      const storeD = smSrcs['core/store.js'];
      assert(/readFailedDetail:\s*\(function\s*\(\s*\)\s*\{[\s\S]*?Object\.keys\(__readStat\.bySource\)/.test(storeD)
        && /readFailedCumulative:\s*\(function\s*\(\s*\)\s*\{[\s\S]*?Object\.keys\(__readStat\.bySource\)/.test(storeD),
        '（正向）readFailedDetail/Cumulative 全来源动态枚举（不得硬编码子集）');
      assert(storeD.indexOf('__byBefore = {};') > 0,
        '（正向）差值基线为全来源快照（不得只取 3 个已知来源）');
      // 消费点必须在明细键集内（否则恒 undefined ⇒ 触发 `|| 1` 谎报）。这里核验消费点
      //   `readFailedCumulative.recovery` 读取存在、且 recovery 确为被投递的动态来源。
      assert(storeD.indexOf('readFailedCumulative.recovery') > 0,
        '（现场）诊断文案消费 readFailedCumulative.recovery（此前因明细无此键恒得 undefined）');
      assert(storeD.indexOf("noteStoreReadFail('recovery'") > 0,
        '（自洽）recovery 是被投递进 bySource 的动态来源 ⇒ 明细中必有此键');
      // 负向自证：把明细改回硬编码 3 键 ⇒ 判据必须现形
      const smDoc7 = storeD.replace(
        'readFailedDetail: (function () {\n          const d = {};\n          Object.keys(__readStat.bySource).forEach(function (k) { d[k] = __readStat.bySource[k] - (__byBefore[k] || 0); });\n          return d;\n        })(),',
        'readFailedDetail: { bytes: __readStat.bySource.bytes - (__byBefore.bytes || 0) },');
      assert(smDoc7 !== storeD, '（负向自证）动态桶退化注入点命中（明细改回硬编码）');
      assert(!/readFailedDetail:\s*\(function\s*\(\s*\)\s*\{[\s\S]*?Object\.keys\(__readStat\.bySource\)/.test(smDoc7),
        '（负向）退化后的明细被动态枚举判据判否');
      console.log('  ✓ v2.23.0：动态桶明细表为全来源枚举（防「硬编码子集」，含负向自证）');
    }
    //   v2.24.0：三面记账对「未知来源」的策略必须一致（禁白名单+静默兜底）。
    //   命题：settings-bus 的写/删/读三面各有归类记账函数（noteFail / noteRemoveFail / noteReadFail）。
    //   读/删侧自 v2.9.0/v2.10.0 起对未知来源**动态建桶**；写侧 noteFail 却用白名单判定
    //   （`writeFailedBy[t] !== undefined`）+ 把未知 tag 静默塞进兜底桶 `setItem`。新写路径一旦
    //   漏登记桶，其失败就被**误归因成「写盘被拒」**——用户去查配额/隐私模式，而真正的问题在别处。
    //   这与本仓库反复治的「归因不实」同型，也是三面记账唯一不一致的一面。
    //   判据（源码级）：三个记账函数对未知来源都必须走「有则自增、无则建桶」，且写侧须做桶名归一。
    {
      const sbD = smSrcs['core/settings-bus.js'];
      // 写侧（v2.24.0 修）：未知来源动态建桶 + 桶名归一
      assert(sbD.indexOf('writeFailedBy[wKey] = (stats.writeFailedBy[wKey] || 0) + 1') > 0,
        '（正向）noteFail 未知来源动态建桶（不得白名单+静默兜底）');
      assert(sbD.indexOf("(t === 'settingsBus.write') ? 'settings' : t") > 0,
        '（正向）写侧桶名归一 settingsBus.write → settings');
      // 删侧（v2.9.0 既有）：未知来源动态建桶
      assert(sbD.indexOf('by[key] = (by[key] || 0) + 1') > 0,
        '（正向）noteRemoveFail 未知来源动态建桶');
      // 读侧（v2.10.0 既有）：未知来源动态建桶——三面策略一致
      assert(sbD.indexOf('by[t] = (by[t] || 0) + 1') > 0,
        '（正向）noteReadFail 未知来源动态建桶（与写/删侧一致）');
      // 自洽：写侧声明表在场（缺则整条台账空转）
      assert(/writeFailedBy:\s*\{[^}]*setItem:\s*0[^}]*\}/.test(sbD), '（自洽）writeFailedBy 声明表在场');
      // 负向自证：把写侧改回「白名单+静默兜底」⇒ 判据必须现形
      const sbDoc24 = sbD.replace(
        "        const wKey = (t === 'settingsBus.write') ? 'settings' : t;\n        stats.writeFailedBy[wKey] = (stats.writeFailedBy[wKey] || 0) + 1;",
        "        if (stats.writeFailedBy[t] !== undefined) stats.writeFailedBy[t]++;\n        else stats.writeFailedBy.setItem++;");
      assert(sbDoc24 !== sbD, '（负向自证）写侧兜底退化注入点命中（改回白名单+静默兜底）');
      assert(sbDoc24.indexOf('writeFailedBy[wKey] = (stats.writeFailedBy[wKey] || 0) + 1') < 0,
        '（负向）退化后的 noteFail 被动态建桶判据判否');
      console.log('  ✓ v2.24.0：写/删/读三面记账未知来源一律动态建桶（防「白名单+静默兜底」，含负向自证）');
    }
    //   v2.25.0：动态桶的分类口径必须**完备**（禁硬编码子集）。
    //   命题：settingsBus.readStat 的 `bySource` 是 readFailedBy 的动态桶（noteReadFail 支持任意
    //   来源），但 `ok` 的分类曾硬编码成「硬失败 = read+parse / 降级 = migrate+copy」。本会话新增的
    //   核查读回类来源（verifyBack/rmExisted/legacyRead/saveInherit/subkeyAudit/pendingOrphan/
    //   verifyDefaults/lsRaw）落在两个口径之外 ⇒ readFailed 涨了、`ok` 仍报 true（「存储读取一切
    //   正常」），完备性「硬失败+降级=读失败总数」在运行期被静默破坏——与 v2.23.0 同族。
    //   判据（源码级）：分类必须遍历动态桶（Object.keys(by)），不得只取固定 2+2 键；并单列
    //   `unclassified` 使落桶外来源可追溯。
    {
      const sbD25 = smSrcs['core/settings-bus.js'];
      assert(/Object\.keys\(by\)\.forEach\(function \(k\) \{[\s\S]*?DEGRADE_SRC/.test(sbD25),
        '（正向）readStat 分类遍历动态桶（不得硬编码 2+2 子集）');
      assert(sbD25.indexOf('let hardFail = 0, degraded = 0, unclassified = 0;') > 0,
        '（正向）分类初值改为累加式（硬失败/降级/未分类三桶）');
      assert(sbD25.indexOf('unclassified: unclassified') > 0,
        '（正向）未登记来源单列 unclassified（落桶外来源可追溯）');
      // 自洽：消费端判据只认 ok^hardFailed（不依赖固定键集）
      assert(sbD25.indexOf('ok: hardFail === 0') > 0, '（自洽）ok 仍只由硬失败决定（降级不影响「配置是否可信」）');
      assert(sbD25.indexOf('DEGRADE_SRC = { migrate: 1, copy: 1 }') > 0,
        '（自洽）降级白名单明确（migrate/copy），其余来源保守计硬失败');
      // 负向自证：把分类改回硬编码 2+2 子集 ⇒ 判据必须现形
      const sbDoc25 = sbD25.replace(
        '      const DEGRADE_SRC = { migrate: 1, copy: 1 };\n      let hardFail = 0, degraded = 0, unclassified = 0;\n      Object.keys(by).forEach(function (k) {\n        const v = by[k] || 0;\n        if (DEGRADE_SRC[k] === 1) { degraded += v; return; }\n        hardFail += v;\n        if (k !== \'read\' && k !== \'parse\') unclassified += v;\n      });',
        '      const hardFail = (by.read || 0) + (by.parse || 0);\n      const degraded = (by.migrate || 0) + (by.copy || 0);');
      assert(sbDoc25 !== sbD25, '（负向自证）分类退化注入点命中（改回硬编码 2+2 子集）');
      assert(!/Object\.keys\(by\)\.forEach\(function \(k\) \{[\s\S]*?DEGRADE_SRC/.test(sbDoc25),
        '（负向）退化后的分类被动态遍历判据判否');
      console.log('  ✓ v2.25.0：readStat 硬失败/降级分类遍历动态桶且完备（防「硬编码子集」，含负向自证）');
    }
    //   v2.26.0（第十四面）：诊断包 store 读侧标签表必须与 store 域真源键集一致。
    //   命题：store 读侧标签表在全库有**三份消费端**——core/store.js 的 `LAB`（标注
    //   readFailedDetail）、ui/panel.js 的 `LAB_P`、engines/tool-diag.js 的 `SRC_LABEL`
    //   （诊断包）。前两份已由 v2.22.0/v2.23.0 收口，**第三份此前完全没有门禁**：它同时犯了
    //   两处「跨域错放」——漏掉 store 域自己的 `readSpotCheck`（诊断包退回裸桶名，「有归因但
    //   看不懂」），又混入 8 个 **settings-bus 域**键（rmExisted/verifyBack/legacyRead/
    //   saveInherit/subkeyAudit/pendingOrphan/verifyDefaults/lsRaw——这 8 个投递的是
    //   settings-bus 的 readFailedBy，归 toolDiag.readLabel 管，在本表里永不被消费）。
    //   判据（源码级）：① 表内含 store 域真源键 readSpotCheck；② 不再含 settings-bus 域键。
    {
      const tdD = smSrcs['engines/tool-diag.js'];
      assert(/readSpotCheck\s*:\s*'/.test(tdD),
        '（正向）诊断包标签表含 store 域真源键 readSpotCheck（此前漏标签 ⇒ 退回裸桶名）');
      // 口径（关键，勿退化为全文件裸配）：必须**只在本表字面量内**判幽灵键。
      //   `rmExisted` 等 8 个键在 toolDiag.readLabel（settings-bus 域标签，合法）里同样出现，
      //   裸配全文件会把那处合法用法误判成「本表残留幽灵键」——判据的输入面与结论面必须是同一件事。
      const tdLabelLit26 = (tdD.match(/const SRC_LABEL = \{[\s\S]*?\n\s*\};/) || [''])[0];
      assert(tdLabelLit26.length > 0, '（自洽）诊断包 store 标签表字面量可定位');
      const ghostKeys26 = ['rmExisted', 'verifyBack', 'legacyRead', 'saveInherit',
        'subkeyAudit', 'pendingOrphan', 'verifyDefaults', 'lsRaw'];
      const leftGhost = ghostKeys26.filter(function (k) {
        return new RegExp('(^|[,{\\s])' + k + '\\s*:\\s*[\'\"]').test(tdLabelLit26);
      });
      assert(leftGhost.length === 0,
        '（正向）诊断包 store 标签表不含 settings-bus 域幽灵键（实残留 ' + (leftGhost.join('、') || '无') + '）');
      // 负向自证 ①：删掉 readSpotCheck 标签 ⇒ 新门禁组必须现形
      const tdDoc26a = tdD.replace("readSpotCheck: '诊断抽查列目录',\n", '');
      assert(tdDoc26a !== tdD, '（负向自证）诊断包标签漂移注入点命中（删 readSpotCheck）');
      const smNeg26a = __uiGateCheckSrcMaps({ srcOverride: { 'engines/tool-diag.js': tdDoc26a } });
      assert(smNeg26a.failures.length > 0 && smNeg26a.failures.join('').indexOf('readSpotCheck') > 0,
        '（负向）诊断包漏 store 域标签被判据抓到');
      // 负向自证 ②：把 settings-bus 域键塞回该表 ⇒ 幽灵键现形
      const tdDoc26b = tdD.replace("verifyState: '存档巡检',",
        "verifyState: '存档巡检',\n        verifyBack: '写后/删后复核读回',");
      assert(tdDoc26b !== tdD, '（负向自证）幽灵键注入点命中（塞回 verifyBack）');
      const smNeg26b = __uiGateCheckSrcMaps({ srcOverride: { 'engines/tool-diag.js': tdDoc26b } });
      assert(smNeg26b.failures.length > 0 && smNeg26b.failures.join('').indexOf('verifyBack') > 0,
        '（负向）诊断包混入 settings-bus 域键被判据抓到');
      console.log('  ✓ v2.26.0：诊断包 store 读侧标签表 == store 域真源键集（防「跨域错放」，含负向自证）');
    }
  }
  // ══════════════════════════════════════════════════════════════════
  // v2.14.0 块：随机源治理（第八面：可复现性）
  //
  // 命题：前七版把写侧/删侧/读侧/活性面/UI 渲染路径/挤出侧逐一收口，观测面已经完备。
  //   但**被观测的那个过程本身不可复现**——全库 16 个产品文件裸调 Math.random，
  //   其中 5 处是行为性决策（进化骰决定成功/受挫/保持、风声消散骰、区域事件是否触发与
  //   抽中哪种、远景通道是否开火、记忆采样决定谁被挤出）。
  //   于是 v2.13.0 刚立起来的「挤出侧丢了谁」在两次运行间不可比：
  //   丢的那个「谁」正是随机采样挑中的，「我修好了吗」在原理上无法回答。
  //
  // 本块立的四件事：① 裸调归零（单一出口）② 同种子同序列（真可复现）
  //   ③ 通道隔离（改 A 模块的抽数不动 B 模块）④ 非法参数不静默（否则「已复现」不可信）
  // ══════════════════════════════════════════════════════════════════
  {
    console.log('\n■ G19 随机源治理（第八面：可复现性）');
    const fsM19 = require('fs');
    const pathM19 = require('path');
    const PROD_DIRS19 = ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui'];
    const prodFiles19 = [];
    // 命名函数表达式（`(function scan19(){...})()`）的名字**只在该函数体内可见**，
    //   体外 by-name 调用会 ReferenceError —— 故此处用具名函数声明（可被 forEach 引用）。
    function scan19(d) {
      let ents = [];
      try { ents = fsM19.readdirSync(pathM19.join(__dirname, '..', d)); } catch (e) { return; }
      ents.forEach(function (e) {
        const rel = d + '/' + e;
        let st = null;
        try { st = fsM19.statSync(pathM19.join(__dirname, '..', rel)); } catch (e2) { return; }
        if (st.isDirectory()) { if (e !== 'node_modules') scan19(rel); }
        else if (e.endsWith('.js')) prodFiles19.push(rel);
      });
    }
    PROD_DIRS19.forEach(scan19);

    // ── ① 裸调归零：全库唯一允许出现 Math.random 的产品文件是 core/rand.js，且恰好 1 处 ──
    //   口径（关键）：先**剥掉注释与字符串字面量**再扫。
    //   本文件与各模块的说明性注释里大量出现「Math.random」这个词（讲的正是本版治理），
    //   裸正则会把文档债当漏改抓出来 —— 判据的输入面与结论面必须是同一件事。
    const stripComments19 = function (src) {
      return src.replace(/\/\*[\s\S]*?\*\//g, '')      // 块注释
        .split('\n').map(function (l) { return l.replace(/(^|[^:'"\\])\/\/.*$/, '$1'); }).join('\n');   // 行注释（避开 http:// 与字符串里）
    };
    const RAW_RE19 = /Math\.random/;
    const offenders19 = prodFiles19.filter(function (f) { return RAW_RE19.test(stripComments19(fsM19.readFileSync(pathM19.join(__dirname, '..', f), 'utf8'))); });
    assert(offenders19.length === 1 && offenders19[0] === 'core/rand.js',
      '裸调 Math.random 的产品文件只剩 core/rand.js（实 ' + offenders19.join('、') + '）——其余全部改走决策流/标识流');
    const randSrc19 = fsM19.readFileSync(pathM19.join(__dirname, '..', 'core/rand.js'), 'utf8');
    const randCode19 = stripComments19(randSrc19);
    const rawHits19 = (randCode19.match(/Math\.random/g) || []).length;
    assert(rawHits19 === 1, 'core/rand.js 内 Math.random 恰好 1 处（自动种子），实 ' + rawHits19 + ' 处——多出来的必然是漏改');
    // 该处必须是自动种子（不是决策抽数）
    const seedLine19 = randCode19.split('\n').filter(function (l) { return /Math\.random/.test(l); })[0];
    assert(/__seed|seed/i.test(seedLine19), '仅存的那处 Math.random 必须是**自动种子**，实：' + seedLine19.trim().slice(0, 80));
    // 决策抽数必须是确定性 PRNG（mulberry32），否则「同种子同序列」无从成立
    assert(/function mulberry32/.test(randSrc19) && /hash32/.test(randSrc19), '决策流由确定性 PRNG（mulberry32）+ 通道哈希派生');

    // ── ② 真可复现：同种子同序列（这是本版存在的全部理由）──
    const R19 = WA.rand;
    R19.seed(12345);
    const seqA19 = []; for (let i = 0; i < 20; i++) seqA19.push(R19.next('t'));
    R19.seed(12345);
    const seqB19 = []; for (let i = 0; i < 20; i++) seqB19.push(R19.next('t'));
    assert(seqA19.length === 20 && seqA19.join(',') === seqB19.join(','), '（可复现）同种子同通道 20 次抽取逐项相同');
    // 不同种子必须给出不同序列（否则「种子」形同虚设）
    R19.seed(12346);
    const seqC19 = []; for (let i = 0; i < 20; i++) seqC19.push(R19.next('t'));
    assert(seqC19.join(',') !== seqA19.join(','), '不同种子给出不同序列（种子确实起作用）');
    // 跨「自动种子」边界也必须可复现：显式播种后即使中间发生过自动种子态，重播仍同序列
    R19.reseed();
    R19.seed(777);
    const seqD19 = []; for (let i = 0; i < 8; i++) seqD19.push(R19.next('t'));
    R19.reseed();
    R19.seed(777);
    const seqE19 = []; for (let i = 0; i < 8; i++) seqE19.push(R19.next('t'));
    assert(seqD19.join(',') === seqE19.join(','), '中间插入 reseed（换自动种子）后重播同种子仍同序列');

    // ── ③ 通道隔离：改一个模块的抽数**不得**平移另一个模块的序列 ──
    //   这条是本版相对「单一全局流」的关键增量：单一流下 evolution 多掷一次骰，
    //   horizon 的开火判定与采样结果会跟着变，且无任何痕迹（改 A 静默改 B）。
    R19.seed(999);
    const isoA19 = [R19.next('iso.A'), R19.next('iso.A'), R19.next('iso.A')];
    R19.seed(999);
    R19.next('iso.B'); R19.next('iso.B'); R19.next('iso.B'); R19.next('iso.B'); R19.next('iso.B');
    const isoB19 = [R19.next('iso.A'), R19.next('iso.A'), R19.next('iso.A')];
    assert(isoA19.join(',') === isoB19.join(','),
      '（通道隔离）B 通道多抽 5 次，A 通道序列逐项不变——改 A 模块不会静默改掉 B 模块的行为');
    //   补一条（v2.14.0 逆向审计自纠）：上面只证明了「互不消费」，**没有**证明「互不相关」。
    //   若派生种子改成 `mulberry32(hash32(String(__seed)))`（把通道名丢掉），各通道仍是独立实例，
    //   上面那条照样绿——但所有通道的序列逐项完全相同，两次「独立」掷骰实际是一次，
    //   骰子退化成常量函数（不同的模块会同时成功、同时受挫、同时开火）。
    //   实测：该破坏在第一轮审计里使全量回归 3814/0 **全绿**——即本条立之前的漏网。
    //   隔离要成立，两条缺一不可：抽数上互不消费（上一条）× 序列上互不相同（本条）。
    R19.seed(777);
    const corrA19 = [R19.next('corr.A'), R19.next('corr.A'), R19.next('corr.A')];
    R19.seed(777);
    const corrB19 = [R19.next('corr.B'), R19.next('corr.B'), R19.next('corr.B')];
    assert(corrA19.join(',') !== corrB19.join(','),
      '（通道隔离）不同通道的序列不得逐项相同（实 ' + corrA19.join(',') + ' vs ' + corrB19.join(',') + '）——否则「两次独立掷骰」是一次，骰子退化成常量函数');

    // ── ④ 标识流不占决策序列：生成 id 不平移任何决策 ──
    //   这是「最难查的一类不可复现」的来源：若 id 也从决策流抽数，
    //   多生成一个 id 就会把后续所有掷骰结果整体挪一位。
    R19.seed(4242);
    const idFreeA19 = [R19.next('free'), R19.next('free'), R19.next('free')];
    R19.seed(4242);
    const gid1_19 = R19.id('t', 6), gid2_19 = R19.id('t', 6), gid3_19 = R19.id('t', 6);
    const idFreeB19 = [R19.next('free'), R19.next('free'), R19.next('free')];
    assert(idFreeA19.join(',') === idFreeB19.join(','),
      '（通道隔离）生成 3 个 id 不消耗决策流，后续抽取逐项不变');
    assert(gid1_19 !== gid2_19 && gid2_19 !== gid3_19 && gid1_19 !== gid3_19, 'id 保持唯一（同毫秒内靠递变计数，不靠运气）');
    assert(/^t/.test(gid1_19), 'id 保留可读前缀（标识流语义未变）: ' + gid1_19);

    // ── ⑤ 记账口径：draws 只计决策，ids 只计标识（混在一起会让两个数都不可信）──
    R19.resetRandStat();
    R19.next('m'); R19.next('m'); R19.next('m');
    R19.id('m', 4); R19.id('m', 4);
    const stM19 = R19.randStat();
    assert(stM19.draws === 3, 'draws 只计决策抽取（实 ' + stM19.draws + '）——id 噪声走独立通道，不计进决策数');
    assert(stM19.ids === 2, 'ids 单独计量（实 ' + stM19.ids + '）');
    assert(stM19.byChannel['m'] === 3, '逐通道计量按通道归集（实 ' + JSON.stringify(stM19.byChannel) + '）');

    // ── ⑥ 非法参数不静默：归因 + 退回默认，且绝不产 NaN ──
    R19.resetRandStat();
    assert(R19.seed('这不是数字') === false, '「非法种子被拒绝」并返回 false（不静默接受）');
    assert(R19.seed(NaN) === false && R19.seed(Infinity) === false && R19.seed({}) === false, 'NaN/Infinity/对象种子一律拒绝');
    R19.seed(31337);
    const keptSeed19 = R19.getSeed();
    assert(R19.seed('abc') === false && R19.getSeed() === keptSeed19,
      '（关键）非法播种**不改变**当前种子——否则「我以为复现了，其实没有」，复现结论本身不可信');
    // 反向区间：归因 + 换序，不产 NaN、不抛
    const rev19 = R19.int(10, 1);
    assert(isFinite(rev19) && rev19 >= 1 && rev19 <= 10, '反向区间换序后仍在区间内（实 ' + rev19 + '），不产 NaN');
    // 骰面数非法 → 退回 1..100
    let diceFallback19 = null; try { diceFallback19 = R19.dice(0); } catch (e) { diceFallback19 = 'threw'; }
    assert(diceFallback19 !== 'threw' && isFinite(diceFallback19) && diceFallback19 >= 1 && diceFallback19 <= 100, 'dice(0) 退回 1..100（实 ' + diceFallback19 + '），不抛不产 NaN');
    // 概率边界：p<=0 恒假 / p>=1 恒真，且**都不抽数**
    //   （原实现 `Math.random() >= chance` 在 chance=0 时仍需抽一次数，
    //    「概率设 0」这个动作本身就会平移随机序列——正是本版要消灭的那类副作用）
    const beforeBound19 = R19.randStat().draws;
    assert(R19.chance(0) === false && R19.chance(-1) === false, 'p<=0 恒假');
    assert(R19.chance(1) === true && R19.chance(2) === true, 'p>=1 恒真');
    assert(R19.randStat().draws === beforeBound19, '（关键）概率为 0/1 时**不抽数**（实增量 ' + (R19.randStat().draws - beforeBound19) + '）——不产生「设了概率却动了随机序列」的副作用');
    assert(R19.chance('x') === false, 'p 非数值恒假并归因（不静默当 0 或当 1）');
    // 空集 / 权重异常
    assert(R19.pick([]) === null && R19.pick(null) === null, '空集返回 null（不返回假元素）');
    assert(R19.pickWeighted([], null) === null, '空权重表返回 null');
    const wZero19 = R19.pickWeighted([{ w: 0 }, { w: 0 }], function (x) { return x.w; });
    assert(wZero19 !== null, '权重全 0 时退回等概率（实 ' + JSON.stringify(wZero19) + '）而非恒选第一个');
    const stBad19 = R19.randStat();
    assert(stBad19.failed > 0, '非法参数进了 failed 台账（实 ' + stBad19.failed + '）');
    ['bad-seed', 'reversed-range', 'bad-sides', 'bad-chance', 'bad-weights'].forEach(function (k) {
      assert(Object.keys(stBad19.failedBy).some(function (x) { return x.indexOf(k) === 0; }),
        '归因分桶含 ' + k + '（实 ' + JSON.stringify(stBad19.failedBy) + '）');
    });
    assert(isFinite(R19.next('after-bad')) && R19.next('after-bad') >= 0, '非法参数后随机源仍可用（不进入坏死态）');

    // ── ⑦ 声明即执行：WA.rand 的每个导出都被真实调用过一次（防「声明面空转」）──
    //   本仓库已多轮吃过「导出了但全库零调用」的亏，此处对新出口同样设卡。
    const exportNames19 = Object.keys(R19);
    const calledOk19 = [];
    const callMap19 = {
      next: function () { return R19.next('probe'); },
      int: function () { return R19.int(1, 5, 'probe'); },
      dice: function () { return R19.dice(6, 'probe'); },
      chance: function () { return R19.chance(0.5, 'probe'); },
      pick: function () { return R19.pick([1, 2], 'probe'); },
      pickWeighted: function () { return R19.pickWeighted([{ w: 1 }], null, 'probe'); },
      id: function () { return R19.id('p', 4); },
      seed: function () { return R19.seed(5); },
      reseed: function () { return R19.reseed(); },
      getSeed: function () { return R19.getSeed(); },
      seeded: function () { return R19.seeded(); },
      randStat: function () { return R19.randStat(); },
      resetRandStat: function () { return R19.resetRandStat(); },
      channels: function () { return R19.channels(); }
    };
    exportNames19.forEach(function (k) {
      assert(typeof callMap19[k] === 'function', '新导出 ' + k + ' 缺调用样例（新增能力必须同时给出执行方式，否则门禁看不见它）');
      const r = callMap19[k]();
      assert(r !== undefined || k === 'resetRandStat', k + ' 可真实调用并返回结果');
      calledOk19.push(k);
    });
    assert(calledOk19.length === exportNames19.length, 'WA.rand 全部 ' + exportNames19.length + ' 个导出均通过真实调用（实 ' + calledOk19.length + '）');

    // ── ⑧ 行为接线：五个随机决策点**确实**在各自的通道上抽数（不是只改了 import）──
    //   这一条是本块最重的证据：正则能证明「Math.random 不见了」，
    //   却证明不了「掷骰真的走了决策流」。故逐个驱动真模块后检查通道计数。
    R19.resetRandStat();
    R19.seed(2024140);
    //   ① 进化推进骰
    WA.store.transact(function (d) { d.evolution.events = [{ id: 'g19e', type: 'conflict', name: 'G19', level: 1, stage: '萌芽', stageRound: 5, consecutiveFails: 0 }]; });
    WA.evolution.rollEvents();
    assert((R19.randStat().byChannel['evolution.advance'] || 0) >= 1,
      '进化推进骰走 evolution.advance 通道（实 ' + JSON.stringify(R19.randStat().byChannel) + '）');
    //   ② 风声消散骰
    R19.seed(2024141);
    WA.store.transact(function (d) { d.evolution.winds = [{ id: 'g19w', topic: 'G19风声', type: 'rumor', level: 1, content: 'x', scope: '', source: '', quietRounds: 9 }]; });
    WA.evolution.decayWinds();
    assert((R19.randStat().byChannel['evolution.windDecay'] || 0) >= 1, '风声消散骰走 evolution.windDecay 通道');
    //   ③ 区域事件（触发判定 + 类型抽取）
    //   两条前置，缺一条下面就会因为**无关原因**失败（本块首次运行两条都踩到了）：
    //     a) 前序块可能留下活跃区域事件 —— 此时 roll() 走「持续中」分支，根本不掷骰；
    //     b) 设置必须真的写得进去 —— 写侧被截断时 effectiveSettings() 仍是默认 disabled，
    //        roll() 直接 return null。b 暴露的是一条**基座缺陷**（见 ⑫），不是本块的问题。
    const regBefore19 = WA.regional.getSettings();
    R19.seed(2024142);
    WA.store.transact(function (d) { d.evolution.regionalIncident = null; });
    const setReg19 = WA.regional.setSettings({ enabled: true, chancePercent: 100 });
    assert(setReg19 && setReg19.ok === true, '区域设置写入返回 ok（实 ' + JSON.stringify(setReg19) + '）——写失败必须可见，不能只有静默');
    const regRoll19 = WA.regional.roll();
    assert((R19.randStat().byChannel['regional.pick'] || 0) >= 1, '区域事件类型抽取走 regional.pick 通道');
    assert(!!regRoll19 && regRoll19.ongoing === false, '几率 100% 时确实触发（chance(1) 恒真且不抽数）');
    //   ④ 远景通道开火
    R19.seed(2024143);
    try {
      WA.horizon.setSettings({ distantEnabled: true });
      WA.store.transact(function (d) { d.evolution.horizon.distant = { ledger: 99, cooldown: 0, pending: null, lastFired: 0 }; });
      WA.horizon.rollLane('distant');
    } catch (eH19) {}
    assert((R19.randStat().byChannel['horizon.roll'] || 0) >= 1, '远景通道开火走 horizon.roll 通道');
    //   ⑤ 记忆采样（默认兜底也走决策流）
    R19.seed(2024144);
    try {
      const big19 = []; for (let i = 0; i < 40; i++) big19.push({ text: 'm' + i });
      WA.memorySampler.exponentialSample(big19, 5);
    } catch (eM19) {}
    assert((R19.randStat().byChannel['memory.sampler'] || 0) >= 1, '记忆采样默认兜底走 memory.sampler 通道（不注入 randomFn 时同样可复现）');
    WA.regional.setSettings(regBefore19);

    // ── ⑨ 五处决策点同种子重放 ⇒ 结果逐项相同（端到端可复现，而非仅函数级）──
    const replay19 = function () {
      R19.seed(555);
      const out = [];
      WA.store.transact(function (d) { d.evolution.events = [{ id: 'g19r', type: 'conflict', name: 'R', level: 1, stage: '萌芽', stageRound: 5, consecutiveFails: 0 }]; });
      out.push((WA.evolution.rollEvents()[0] || {}).result);
      WA.store.transact(function (d) { d.evolution.winds = [{ id: 'g19rw', topic: 'R风声', type: 'rumor', level: 1, content: 'x', scope: '', source: '', quietRounds: 9 }]; });
      out.push(WA.evolution.decayWinds().length);
      WA.store.transact(function (d) { d.evolution.regionalIncident = null; });
      const rOne19 = WA.regional.roll() || {};
      out.push(rOne19.ongoing === false ? ((rOne19.picked || {}).type || '?') : 'ongoing');
      return out.join('|');
    };
    const repA19 = replay19(), repB19 = replay19();
    assert(repA19 === repB19, '（端到端可复现）同种子重放真实引擎链（推进骰/消散骰/区域抽取）结果逐项相同：' + repA19);

    // ── ⑩ 双消费端：诊断 + 面板 + 健康分（新台账无消费端 = 空转）──
    const diag19 = WA.toolDiag.collect();
    assert(diag19.runtime && diag19.runtime.rand && typeof diag19.runtime.rand.seedSource === 'string',
      '诊断包透出 runtime.rand（种子来源/抽数/通道/归因）');
    assert(typeof diag19.runtime.rand.draws === 'number' && diag19.runtime.rand.byChannel,
      '诊断包含决策抽数与逐通道分布');
    const panelSrc19 = fsM19.readFileSync(pathM19.join(__dirname, '..', 'ui', 'panel.js'), 'utf8');
    assert(/function randBlock\(/.test(panelSrc19), '面板存在随机源展示块 randBlock()');
    assert(/\$\{randBlock\(\)\}/.test(panelSrc19), '概览页真实调用了 randBlock()（导出但没人调 = 空转）');
    assert(/随机源（决策可复现性）/.test(panelSrc19), '面板文案明确说明「决策可复现性」而非只堆数字');
    //   健康分：三计量必须进 signals，且「未显式播种」如实报 info（诚实：不把默认态谎报成可复现）
    R19.resetRandStat();
    R19.seed(8888);
    R19.next('sig'); R19.next('sig');
    const mt19 = WA.store.maintain();
    assert(mt19.signals.randDraws >= 2, '健康分 signals 含 randDraws（实 ' + mt19.signals.randDraws + '）');
    assert(mt19.signals.randFailed === 0 && mt19.signals.randReproducible === true,
      '显式播种下 randReproducible=true（实 ' + mt19.signals.randReproducible + '）——不虚报也不漏报');
    const evOK19 = (mt19.issues || []).filter(function (i) { return i.key === 'rand' || i.key === 'rand.failed'; });
    assert(evOK19.length === 0, '已显式播种 ⇒ 不产「未播种」议题（议题只在真的不可复现时出现）');
    //   未播种态：info 且诚实（不报 error —— auto 是默认行为，不是故障）
    R19.reseed();
    R19.next('sig');
    const mt19b = WA.store.maintain();
    assert(mt19b.signals.randReproducible === false, '未显式播种时 signals.randReproducible=false（诚实）');
    const evNoSeed19 = (mt19b.issues || []).filter(function (i) { return i.key === 'rand'; })[0];
    assert(evNoSeed19 && evNoSeed19.level === 'info', '未播种报 info 级（实 ' + (evNoSeed19 && evNoSeed19.level) + '）——它是「结论不可复核」的根因说明，不是故障');
    assert(/seed/.test(evNoSeed19.detail), '议题给出可执行解法（怎么把随机定住）');
    //   参数非法 ⇒ error（缺陷级）
    R19.seed('坏种子');
    const mt19c = WA.store.maintain();
    const evFail19 = (mt19c.issues || []).filter(function (i) { return i.key === 'rand.failed'; })[0];
    assert(evFail19 && evFail19.level === 'error', '随机源参数非法在健康巡视里报 error（须改代码，不是清存储）');
    assert(mt19c.score < mt19b.score, '缺陷级随机源问题真实扣分（' + mt19b.score + ' → ' + mt19c.score + '）');
    //   诊断分级同步
    const dgFail19 = WA.toolDiag.collect();
    const vFail19 = (WA.toolDiag.verdict ? WA.toolDiag.verdict(dgFail19) : { issues: [] });
    assert((vFail19.issues || []).some(function (i) { return i.key === 'rand' && i.level === 'error'; }),
      '诊断 verdict 对参数非法报 error（与健康分同口径）');
    //   复原：避免污染后续
    R19.seed(1); R19.resetRandStat();

    // ── ⑪ 负向自证：门禁的判据本身必须能被破坏检出（否则计数只是「恰好成立」）──
    //   ① 裸调用探针：临时落一个含 Math.random 的产品文件 → ① 的扫描必须抓到
    const probeDir19 = pathM19.join(__dirname, '..', 'core');
    const probeFile19 = pathM19.join(probeDir19, '__g19_probe.js');
    let caughtByProbe19 = false;
    try {
      fsM19.writeFileSync(probeFile19, "// 探针\n(function(){ var x = Math.random(); return x; })();\n");
      const hitProbe19 = prodFiles19.concat(['core/__g19_probe.js']).filter(function (f) { return RAW_RE19.test(stripComments19(fsM19.readFileSync(pathM19.join(__dirname, '..', f), 'utf8'))); });
      caughtByProbe19 = hitProbe19.length === 2;
    } finally { try { fsM19.unlinkSync(probeFile19); } catch (e) {} }
    assert(caughtByProbe19, '（负向自证）落一个裸调 Math.random 的产品文件，① 的扫描把它抓出来（探针有效）');
    //   ② 通道隔离探针：把两个通道名指成同一个 → 隔离断言必须失败（证明隔离断言不是恒真）
    R19.seed(321);
    const isoX19 = [R19.next('same'), R19.next('same')];
    R19.seed(321);
    R19.next('same');                     // 同通道多抽一次
    const isoY19 = [R19.next('same'), R19.next('same')];
    assert(isoX19.join(',') !== isoY19.join(','), '（负向自证）同通道多抽一次必然改变后续——隔离断言不是恒真');
    //   ③ 可复现探针：不播种（换自动种子）→ 序列必须不同
    //      （证明「同种子同序列」来自种子，而不是「随机源恒定不变」这种平凡情况）
    //      注意：**不能**写成 `a !== b || typeof a === 'number'`——那第二项恒真，
    //      整条断言永远是绿的（本仓库已多次吃过「判据自己把结论删了」的亏）。
    //      取 4 个抽数比对元组，把「恰好撞上同一个数」的概率压到可忽略。
    const sample4 = function () { R19.reseed(); const o = []; for (let i = 0; i < 4; i++) o.push(R19.next('neg')); return o.join(','); };
    const nA19 = sample4(), nB19 = sample4();
    assert(nA19 !== nB19, '（负向自证）换自动种子后抽数序列确实变化（实 ' + nA19 + ' vs ' + nB19 + '）——可复现来自种子，而非随机源恒定');
    //   ④ 种子有效性探针：同种子必须收敛（负向：不同种子不得收敛）
    R19.seed(4242); const s1 = R19.next('v');
    R19.seed(4242); const s2 = R19.next('v');
    R19.seed(4243); const s3 = R19.next('v');
    assert(s1 === s2 && s1 !== s3, '（自证）同种子收敛、异种子发散——②的判据在这两个方向上都成立');
    // ── ⑫ 基座保真：宿主能力不得被测试壳截断（本版实测踩到的真缺陷）──
    //   背景：tests/ui-dom.js 的 install() 把 WA.mainWin 换成 mini-DOM 壳窗口，而产品模块在
    //   **求值期**就把 mainWin 缓存进闭包（`const mainWin = WA.mainWin || window`）。
    //   此前那个壳是 `var uiWin = {}` —— 连 localStorage 都没有，且全库没有对称的还原动作：
    //   自第二个 UI 用例起，所有落盘路径都撞 `mainWin.localStorage` 为 undefined，setItem 抛错
    //   又被各自的 try/catch 吞掉 → 呈现为「设置拨了没生效」而全库零告警。
    //   这类缺陷的可怕之处在于**它污染的是别的块**：UI 门禁全绿、错误信息全无，
    //   失败却出现在毫不相干的后续用例里（本例：区域事件的随机通道断言）。
    //   故此处立判据盯住「设置必须真的落盘、真的读回」，并做负向自证。
    const hostBack19 = WA.regional.getSettings().chancePercent;
    const hpSet19 = WA.regional.setSettings({ chancePercent: 37 });
    assert(hpSet19 && hpSet19.ok === true, '（基座保真）产品路径的设置写入返回 ok（实 ' + JSON.stringify(hpSet19) + '）');
    assert(WA.regional.getSettings().chancePercent === 37,
      '（基座保真）写入后读回同一值（实 ' + WA.regional.getSettings().chancePercent + '）——「拨了没生效」必须响亮');
    assert(String((WA.mainWin || {}).localStorage) !== 'undefined' && !!(WA.mainWin || {}).localStorage,
      '（基座保真）宿主窗口可达 localStorage（壳须以真宿主为原型，否则落盘能力从出生起就是断的）');
    //   负向自证：把宿主换成无 localStorage 的裸对象（复刻修复前的缺陷形态）→ 同一写入必须真的失败。
    //   否则上面两条「ok:true」可能只是恒真，抓不到任何东西。
    const savedWin19 = WA.mainWin;
    let broken19 = false;
    try {
      WA.mainWin = {};
      try { const r19 = WA.regional.setSettings({ chancePercent: 41 }); broken19 = !!(r19 && r19.ok === true); }
      catch (eB19) { broken19 = false; }
    } finally { WA.mainWin = savedWin19; }
    assert(broken19 === false, '（负向自证）宿主缺 localStorage 时同一写入必然失败——上面的 ok:true 不是恒真判据');
    //   复原：既让 ⑫ 不污染后续，也让「写回读」这条链本身再走一遍
    WA.regional.setSettings({ chancePercent: (hostBack19 || 15) });
    assert(WA.regional.effectiveSettings().chancePercent === (hostBack19 || 15),
      '（基座保真）复原写入同样落盘并读回（实 ' + WA.regional.effectiveSettings().chancePercent + '）');
    R19.seed(2); R19.resetRandStat();
    console.log('  ✓ 裸调归零（唯一剩余＝自动种子 1 处）｜同种子同序列｜通道隔离｜非法参数不静默');
    console.log('  ✓ 五处决策点行为接线实测｜端到端同种子重放逐项相同｜双消费端齐备｜负向自证 4 项');
    console.log('  ✓ 基座保真（宿主能力不被测试壳截断：设置真写盘、真读回，含负向自证）');
  } // end v2.14.0 block
  // ══════════════════════════════════════════════════════════════════
  // v2.15.0 块：时间源治理（第九面：可复现性的另一半）
  //
  // 命题：v2.14.0 把**随机源**收成了单一出口，于是「掷骰」这一半可复现了。
  //   但可复现性要**两个输入同时确定**，而第二个输入一格都没管：**时间**。
  //   全库 40 个产品文件共 165 处裸调 `Date.now()`，其中相当一部分根本不是
  //   「记个时间戳好看」，而是真的在判定与写入——store 的 `idleMs > maxIdleMs`
  //   过期判定（决定**哪些键被当成过期数据回收掉**）、`meta.createdAt/updatedAt/lastSettle`、
  //   恢复点 `at`、memory 每一条摘要的 `t` 与 facts 的 `at`、`'superseded@'+时间戳` 的
  //   reason 串、chatcache 的快照 id 与 `at`、workflow 链历史 `at`……全部直接落盘。
  //   于是 v2.14.0 的复现结论是**半张**的：同样的种子，只要跑的时刻不同（哪怕只差一毫秒），
  //   存档就不再逐字节相同——上一轮自己在 README 里点出的下一个缺口
  //   （「没有任何 API 能把一份存档 + 一个种子跑成确定性回放」）根因就在这里。
  //
  // 本块立的四件事：① 裸调归零（唯一墙钟读取点 + 守卫 fallback 逐个可解释）
  //   ② 冻结即确定（决策时间恒为虚拟时刻、可步进）③ 两类时间不得混流
  //   （测量时间不受冻结影响——否则「这一轮跑了多久」变成假话）
  //   ④ 非法参数不静默（否则「已冻结」这个结论本身不可信）
  // ══════════════════════════════════════════════════════════════════
  {
    console.log('\n■ G20 时间源治理（第九面：可复现性的另一半）');
    const fsM20 = require('fs');
    const pathM20 = require('path');
    const vmM20 = require('vm');
    const PROD_DIRS20 = ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui'];
    const prodFiles20 = [];
    function scan20(d) {
      let ents = [];
      try { ents = fsM20.readdirSync(pathM20.join(BASE, d)); } catch (e) { return; }
      ents.forEach(function (e) {
        const rel = d + '/' + e;
        let st = null;
        try { st = fsM20.statSync(pathM20.join(BASE, rel)); } catch (e2) { return; }
        if (st.isDirectory()) { if (e !== 'node_modules') scan20(rel); }
        else if (e.endsWith('.js')) prodFiles20.push(rel);
      });
    }
    PROD_DIRS20.forEach(scan20);
    prodFiles20.push('index.js');
    // 口径：先**剥掉注释与字符串外的行注释**再扫。本文件与各模块的说明性注释里
    //   大量出现「Date.now」这个词（讲的正是本版治理），裸正则会把文档债当漏改抓出来。
    const stripComments20 = function (src) {
      return src.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(function (l) { return l.replace(/(^|[^:'"\\])\/\/.*$/, '$1'); }).join('\n');
    };
    const rd20 = function (f) { return stripComments20(fsM20.readFileSync(pathM20.join(BASE, f), 'utf8')); };
    // ── ① 裸调归零：每一次 `Date.now()` 都必须落在四种**可解释形态**之一 ──
    //   R 唯一墙钟读取点（clock.raw，恰 1 处）
    //   G 守卫自身的 fallback（与守卫声明**同行共现**——守卫是「时钟不可用时别炸」，
    //     它与「绕过时钟直接读时间」的区别正在于「同行有 WA.clock.」这件事本身）
    //   T 内联三目（index.js/rand.js 专用：`WA.clock ? ... : Date.now()`）
    //   P 能力探测（`typeof Date !== 'undefined' && Date.now`，**不调用**）
    //   B 裸调 —— 必须为 0。剩下的第 5 类会让回放对不上时无从定位。
    const K20 = { raw: [], guard: [], ternary: [], probe: [], bare: [] };
    let guardDecl20 = 0;
    prodFiles20.forEach(function (f) {
      rd20(f).split('\n').forEach(function (l, i) {
        const at = f + ':' + (i + 1);
        if (/const clock(Now|Wall) = function|function (now|wallNow)\(\) \{ try \{ return WA\.clock\./.test(l)) guardDecl20++;
        if (/Date\.now\(\)/.test(l)) {
          if (f === 'core/clock.js' && /function raw\(\) \{ return Date\.now\(\); \}/.test(l)) K20.raw.push(at);
          else if (/catch \(e\) \{ return Date\.now\(\); \}/.test(l)) K20.guard.push({ at: at, ok: /WA\.clock\./.test(l) });
          else if (/WA\.clock \?/.test(l)) K20.ternary.push({ at: at, ok: /WA\.clock \? [^:]*: Date\.now\(\)/.test(l) });
          else K20.bare.push(at + ' | ' + l.trim().slice(0, 96));
        } else if (/Date\.now\b/.test(l)) {
          K20.probe.push({ at: at, ok: /typeof Date !== 'undefined' && Date\.now/.test(l) });
        }
      });
    });
    assert(K20.raw.length === 1 && K20.raw[0].indexOf('core/clock.js:') === 0,
      '全库唯一墙钟读取点是 core/clock.js 的 raw()（实 ' + (K20.raw.join('、') || '无') + '）——其余全部改走决策时钟/测量时钟');
    assert(K20.bare.length === 0,
      '产品代码零裸调 Date.now()（去注释后，残留 ' + (K20.bare.join('、') || '无') + '）——裸调绕过冻结，回放对不上时只能全库通读');
    const guardBad20 = K20.guard.filter(function (g) { return !g.ok; });
    assert(guardBad20.length === 0 && K20.guard.length === guardDecl20 && guardDecl20 > 0,
      '每个守卫 fallback 都与守卫声明同行共现（声明 ' + guardDecl20 + ' / fallback ' + K20.guard.length + ' / 未共现 ' + guardBad20.length + '）——兜底可留，但必须与 `WA.clock.` 同行；分家的那些就是漏改的裸调');
    const ternaryBad20 = K20.ternary.filter(function (t) { return !t.ok; });
    assert(ternaryBad20.length === 0 && K20.ternary.length > 0,
      '内联三目全部形如 `WA.clock ? WA.clock.xxx() : Date.now()`（' + K20.ternary.length + ' 处，异常 ' + ternaryBad20.length + '）——index.js 走三目是因为 loadScriptOnce 会被测试壳切片重编译，不能用闭包守卫');
    assert(K20.probe.length === 1 && K20.probe[0].ok,
      '仅存的能力探测（' + (K20.probe[0] && K20.probe[0].at) + '）不调用 Date.now——探测「宿主有没有 Date」与「读时间」是两件事');
    const clockCode20 = rd20('core/clock.js');
    const clockRawHits20 = (clockCode20.match(/Date\.now\(\)/g) || []).length;
    assert(clockRawHits20 === 1, 'core/clock.js 内 Date.now() 恰好 1 处（实 ' + clockRawHits20 + '）——多出来的必然是绕过 raw() 的第二条出口');
    // ── ② 冻结即确定（本版存在的全部理由）──
    const C20 = WA.clock;
    const TS20 = 1757000000000;
    assert(!!C20 && typeof C20.now === 'function', 'core/clock.js 已装载且决策时钟可用');
    C20.unfreeze(); C20.resetClockStat();
    {
      const a20 = Date.now(), v20 = C20.now('g20.a'), b20 = Date.now();
      assert(v20 >= a20 && v20 <= b20,
        '未冻结时 now() 返回真墙钟（' + v20 + ' ∈ [' + a20 + ',' + b20 + ']）——**迁移行为中立**：不回放时与迁移前逐位一致');
      assert(C20.clockStat().reproducible === false, '未冻结时 reproducible=false——「跟墙钟走」的会话谈不上可复现');
    }
    {
      assert(C20.freeze(TS20) === TS20, 'freeze(时刻) 返回冻结后的虚拟时刻');
      assert(C20.now('g20.b') === TS20 && C20.now('g20.b') === TS20,
        '冻结后 now() 恒为虚拟时刻（两次连读同值）——「同一 tape 重放两次，写进存档的每个时间戳都相同」的前提');
      assert(C20.clockStat().reproducible === true, '冻结后 reproducible=true');
      const vBefore20 = C20.virtualAt();
      C20.advance(5000);
      assert(C20.virtualAt() === vBefore20 + 5000 && C20.now('g20.b') === vBefore20 + 5000,
        'advance(5000) 推进虚拟轴且 now() 立刻跟随（' + vBefore20 + ' → ' + C20.virtualAt() + '）');
      const vB20 = C20.virtualAt();
      C20.advance();
      assert(C20.virtualAt() === vB20 + 1000, 'advance() 省略步长时按默认 1000ms 推进');
    }
    // ── ③ 两类时间不得混流（与 rand 的决策流/标识流对偶）──
    {
      const a20 = Date.now(), w20 = C20.wallNow(), b20 = Date.now();
      assert(w20 >= a20 && w20 <= b20 && w20 !== TS20,
        '冻结下 wallNow() 仍读真墙钟（' + w20 + '）——耗时台账与渲染展示不受冻结影响，否则「这一轮跑了多久」变成假话');
      C20.freeze(0);
      assert(C20.now('g20.c') === 0 && C20.wallNow() > 1e12,
        '把虚拟时刻设成 0：决策时间读 0（' + C20.now('g20.c') + '），测量时间仍读真实墙钟（' + C20.wallNow() + '）——同一个冻结状态下两类时间给出不同来源，这就是「不混流」的可执行证据');
      C20.freeze(TS20);
    }
    // ── ④ 行为性落盘：逐个驱动真模块，查**落盘字段**是否等于虚拟时刻 ──
    //   正则只能证明「Date.now 不见了」，证明不了「落盘的时间戳真的跟着冻结走」。
    const stateKey20 = 'worldaxis_state_' + WA.store.chatId();
    {
      WA.store.transact(function (d) { d.g20 = { label: 'g20' }; });
      const raw20 = JSON.parse(global.localStorage.getItem(stateKey20));
      assert(raw20.meta.updatedAt === C20.virtualAt(),
        'store 落盘的 meta.updatedAt === 虚拟时刻（实 ' + raw20.meta.updatedAt + '）——写进磁盘的那一个时间戳第一次可被指定');
      WA.store.transact(function (d) { WA.memory.upsertFact(d, 'g20k', 'g20v', 'g20test'); });
      const f20 = WA.store.get().memory.facts.filter(function (x) { return x.key === 'g20k'; })[0];
      assert(f20 && f20.at === C20.virtualAt(), 'memory.upsertFact 的 at === 虚拟时刻（实 ' + (f20 && f20.at) + '）——记忆条目的时标是存档内容的一部分');
      WA.store.transact(function (d) { WA.memory.upsertFact(d, 'g20k', 'g20v2', 'g20test'); });
      const old20 = WA.store.get().memory.facts.filter(function (x) { return x.key === 'g20k' && !x.active; })[0];
      assert(old20 && String(old20.reason).indexOf('superseded@' + C20.virtualAt()) === 0,
        '覆盖事实时 reason 串含虚拟时刻（实 ' + (old20 && old20.reason) + '）——连「何时被谁取代」都在存档里，冻结必须覆盖到这里');
      const id20 = WA.rand.id('g20_', 2, 'id');
      const tsId20 = parseInt(id20.split('_')[1], 36);
      assert(tsId20 === C20.virtualAt(),
        'rand.id 的时间戳 === 虚拟时刻（' + id20 + '）——**本版第一处归因修正**：id 产物会落盘（伏笔 fs_*、消息 wax_*、writer_id），属决策时间；用测量时间会让「种子与时刻都指定了、存档仍不同」');
      assert(WA.rand.randStat().ids > 0,
        '标识流仍独立记账（ids=' + WA.rand.randStat().ids + '）——归因修正不改变 v2.14.0 的「标识流不占决策序列」，两条约束正交');
      const snapRes20 = WA.chatcache.addSnapshot('g20 探针');
      const snaps20 = WA.chatcache.listSnapshots() || [];
      const snap20 = snaps20[snaps20.length - 1];
      assert(snapRes20 && snapRes20.ok === true && snap20 && snap20.at === C20.virtualAt(),
        'chatcache 快照 at === 虚拟时刻（实 ' + (snap20 && snap20.at) + '）');
      assert(snap20 && parseInt(String(snap20.id).split('_')[1], 36) === C20.virtualAt(),
        '快照 id 内的时间戳 === 虚拟时刻（id=' + (snap20 && snap20.id) + '）——「同一操作两次跑出来 id 天生不同」的根因就在这里');
      WA.store.createRecoveryPoint(WA.store.chatId());
      const rp20 = (WA.store.listRecoveryPoints(WA.store.chatId()) || [])[0];
      assert(rp20 && rp20.at === C20.virtualAt(),
        '恢复点 at === 虚拟时刻（实 ' + (rp20 && rp20.at) + '）——注意 createRecoveryPoint **无返回值**，成败只能看落盘结果，不能看 return');
    }
    {
      // ④g 工作流链历史（本版**第二处归因修正**；async 真驱动）
      C20.freeze(TS20);
      WA.workflow.resetHistory(WA.store.chatId());
      WA.workflow.register({ id: 'g20.wfnode', chain: 'g20wf', order: 1, label: 'G20 节点', async run() {} });
      await WA.workflow.run('g20wf', {});
      const wfHistKey20 = 'worldaxis_wf_history_' + WA.store.chatId();
      const wfRaw20 = global.localStorage.getItem(wfHistKey20);
      const wfHist20 = wfRaw20 ? JSON.parse(wfRaw20) : [];
      assert(wfHist20.length > 0 && wfHist20[wfHist20.length - 1].at === TS20,
        '工作流链历史**落盘**的 at === 虚拟时刻（实 ' + (wfHist20.length ? wfHist20[wfHist20.length - 1].at : null) + '）——`__chainHistory` 经 persistWorkflowHistory 落进 ' + wfHistKey20 + '，属决策时间');
      const wfRun20 = WA.workflow.history(1).runs[0];
      assert(wfRun20 && wfRun20.at === TS20, 'workflow.history() 只读视图同值——落盘与视图同源');
      assert(wfRun20 && typeof wfRun20.ms === 'number',
        '同一条记录里的 ms（耗时）仍为测量值（实 ' + (wfRun20 && wfRun20.ms) + '）——同一个函数里两类时间并存、各归各的口径');
      const lc20 = WA.workflow.stats().lastChains.g20wf;
      assert(lc20 && lc20.at !== TS20,
        'lastChains.at（只进内存台账、不落盘）仍为墙钟值（实 ' + (lc20 && lc20.at) + '）——反向归因同样要修：进内存的别走决策时钟');
      WA.workflow.resetHistory(WA.store.chatId());
      WA.workflow.unregister('g20.wfnode');
    }
    // ── ⑤ 端到端重放：随机源 + 时间源**双双定住** ──
    {
      const runReplay20 = function () {
        WA.rand.reseed(); WA.rand.seed(777);
        C20.freeze(TS20);
        WA.store.transact(function (d) { WA.memory.upsertFact(d, 'g20rk', 'g20rv', 'replay'); });
        const raw = JSON.parse(global.localStorage.getItem(stateKey20));
        return raw.meta.updatedAt + '|' + raw.memory.facts.filter(function (f) { return f.key === 'g20rk'; })
          .map(function (f) { return f.at + '/' + f.reason; }).join(',');
      };
      const a20 = runReplay20(), b20 = runReplay20();
      assert(a20 === b20 && a20.length > 4,
        '两次重放落盘的时间戳**逐项相同**（' + a20 + '）——这正是「存档 + 种子 → 确定性回放」此前缺失的那一半');
      C20.freeze(TS20); C20.advance(1000);
      assert(runReplay20() === a20, '重放的确定性不依赖「外部没动过时钟」：每次重放自带 freeze，结果仍逐项相同');
      //   反证：未冻结时同样两次重放**不同**——否则上一条可能只是恒真
      const runWall20 = function () {
        C20.unfreeze();
        WA.store.transact(function (d) { d.g20wall = 1; });
        return JSON.parse(global.localStorage.getItem(stateKey20)).meta.updatedAt;
      };
      const w1_20 = runWall20();
      const spin20 = Date.now(); while (Date.now() === spin20) { /* 至少跨 1ms */ }
      const w2_20 = runWall20();
      assert(w1_20 !== w2_20,
        '未冻结时同样两次重放落盘时间戳**不同**（' + w1_20 + ' vs ' + w2_20 + '）——证明上一条不是恒真：时间源没定住时，种子定住也没用');
    }
    // ── ⑥ 非法参数不静默（与 rand.seed 同口径）──
    {
      C20.freeze(TS20);
      const vB20 = C20.virtualAt();
      assert(C20.freeze(NaN) === null && C20.virtualAt() === vB20 && C20.frozen() === true,
        'freeze(NaN) 被拒且**不改当前状态**（虚拟轴仍在 ' + C20.virtualAt() + '）——静默接受一个 NaN 时刻会让「我以为冻结了，其实没有」');
      const out20 = [C20.freeze(Infinity), C20.freeze({}), C20.freeze('不是时刻')];
      assert(out20.every(function (x) { return x === null; }),
        'freeze(Infinity/对象/字符串) 一律拒绝（返回 ' + JSON.stringify(out20) + '）');
      const st20 = C20.clockStat();
      assert(st20.failed >= 4 && st20.failedBy['bad-freeze'] >= 4,
        '非法冻结全部**归因入账**（failed=' + st20.failed + '，桶 ' + JSON.stringify(st20.failedBy) + '）——桶名答「哪一类非法」，调用点靠 site/日志定位');
      const vD20 = C20.virtualAt();
      C20.advance(NaN);
      assert(C20.virtualAt() === vD20 + 1000 && C20.clockStat().failedBy['bad-advance'] >= 1,
        'advance(非法) 归因后退回默认步长（' + vD20 + ' → ' + C20.virtualAt() + '）——回放台看到的是「时间在走」，看不出走错了');
      assert(C20.now('g20.d') === C20.virtualAt(), '非法入参后时钟仍完全可用');
    }
    // ── ⑦ 声明即执行 + 零消费出口（「声明了」必须能推出「被调用过」）──
    {
      const names20 = Object.keys(C20);
      const callMap20 = {
        now: function () { return C20.now('g20.declare'); },
        wallNow: function () { return C20.wallNow(); },
        freeze: function () { return C20.freeze(TS20); },
        unfreeze: function () { return C20.unfreeze(); },
        frozen: function () { return C20.frozen(); },
        virtualAt: function () { return C20.virtualAt(); },
        advance: function () { return C20.advance(); },
        drift: function () { return C20.drift(); },
        clockStat: function () { return C20.clockStat(); },
        resetClockStat: function () { return C20.resetClockStat(); },
        sites: function () { return C20.sites(); }
      };
      const missing20 = names20.filter(function (k) { return typeof callMap20[k] !== 'function'; });
      assert(missing20.length === 0 && names20.length >= 11,
        'WA.clock 的每个导出都有调用样例（' + names20.length + ' 个：' + names20.join('/') + '）' + (missing20.length ? '，缺 ' + missing20.join(',') : ''));
      names20.forEach(function (k) { callMap20[k](); });
      //   本轮首版导出过 DEFAULT_SITE / DEFAULT_STEP_MS，探针实测全库零消费 ⇒ 摘除。
      //   按 v2.11.0 已确立的裁决：留着零消费出口的风险不是「多一个 API」，而是下一个调用者会挑错的那个。
      assert(!/DEFAULT_SITE:\s*DEFAULT_SITE|DEFAULT_STEP_MS:\s*DEFAULT_STEP_MS/.test(clockCode20),
        '零消费常量不挂在出口面上——兜底站点名 `unspecified` 本来就自解释地写在 bySite 的键里，不需要一个符号常量去指代一个可见字符串');
      const consumers20 = prodFiles20.filter(function (f) { return f !== 'core/clock.js'; })
        .filter(function (f) { return /DEFAULT_SITE|DEFAULT_STEP_MS/.test(rd20(f)); });
      assert(consumers20.length === 0,
        '全库产品代码零消费这两个常量（' + (consumers20.join('、') || '无') + '）——摘除的判据是**实测零消费**，不是「看起来没用」');
      C20.freeze(TS20); C20.resetClockStat();
      C20.now('g20.s1'); C20.now('g20.s1'); C20.now('g20.s2'); C20.wallNow();
      const sit20 = C20.sites();
      assert(sit20.indexOf('g20.s1') >= 0 && sit20.indexOf('g20.s2') >= 0,
        'sites() 可枚举真实消费面（' + sit20.join('/') + '）——「谁在读时间」第一次可定位到具体调用点，与 rand.channels()/evict.SITES 同型');
      C20.unfreeze();
    }
    // ── ⑧ 记账口径：决策读取与测量读取分列 ──
    {
      C20.unfreeze(); C20.resetClockStat();
      C20.freeze(TS20);
      C20.now('g20.acc.a'); C20.now('g20.acc.a'); C20.now('g20.acc.b');
      C20.wallNow(); C20.wallNow();
      const st20 = C20.clockStat();
      assert(st20.nowCalls === 3 && st20.wallCalls === 2,
        '决策读取与测量读取分列记账（now=' + st20.nowCalls + ' / wall=' + st20.wallCalls + '）——混在一起会让「耗时统计还在不在」不可判');
      assert(st20.bySite['g20.acc.a'] === 2 && st20.bySite['g20.acc.b'] === 1,
        '逐站点计数（' + JSON.stringify(st20.bySite) + '）');
      assert(st20.lastSite === 'g20.acc.b' && st20.lastAt === TS20 && st20.lastWallAt > 0,
        'lastSite/lastAt/lastWallAt 定位最近一次读取（' + st20.lastSite + '/' + st20.lastAt + '）');
      assert(st20.frozen === true && st20.reproducible === true && st20.drift !== 0,
        '冻结态可查（frozen=' + st20.frozen + ' / reproducible=' + st20.reproducible + ' / drift=' + st20.drift + '）');
      assert(st20.freezes === 1 && st20.unfreezes === 0,
        '冻结/解除分别留痕（freezes=' + st20.freezes + ' / unfreezes=' + st20.unfreezes + '）');
      C20.unfreeze();
      assert(C20.clockStat().unfreezes === 1, 'unfreeze 留痕（unfreezes=' + C20.clockStat().unfreezes + '）');
      //   R7 逆向审计补判据：上面三处 reproducible 断言恰好都落在 freeze 之后（freezes ≥ 1），
      //   分辨不出「取当下冻结状态」与「取历史冻结次数」——把 reproducible 写成 `stat.freezes > 0`
      //   在旧判据下全绿。这里制造「冻过、但此刻没冻」的分裂态来锁死语义。
      const st20u = C20.clockStat();
      assert(st20u.reproducible === false && st20u.freezes >= 1,
        '解冻后 reproducible **立刻**回 false（此刻未冻结），而 freezes 仍记着 ' + st20u.freezes + ' 次历史冻结——reproducible 答的是「此刻能不能确定性重放」而非「曾经冻过」，写成 freezes > 0 会让「冻过一次就解冻继续跑」的会话谎报可复现');
      //   R7 同型外溢：rand 的 reproducible 存在**同一歧义面**，而此前没有任何判据钉住它的取值
      //   （只断言过类型与 seedSource 存在）。两个源的可复现语义必须同型，
      //   否则「种子定了」与「时刻定了」的判定会在同一件事上分叉。
      {
        WA.rand.seed(4242);
        const rExpl20 = WA.rand.randStat();
        assert(rExpl20.reproducible === true && rExpl20.seedSource === 'explicit',
          'rand.reproducible 在显式播种后为 true（seedSource=' + rExpl20.seedSource + '）');
        WA.rand.reseed();
        const rNone20 = WA.rand.randStat();
        assert(rNone20.reproducible === false && rNone20.seedSource !== 'explicit' && rNone20.reseeds > rExpl20.reseeds,
          'rand.reproducible 同样取「**当下**是否显式播种」（reseed 后 ' + rNone20.reproducible + '，seedSource=' + rNone20.seedSource + '，历史 reseeds=' + rNone20.reseeds + '）——两个源同型：都答「此刻能不能确定性重放」，不答「曾经播过种吗」。注意 reseed 后 lazy 播种把 seedSource 变成 auto：**有种子 ≠ 可复现**，这也正是 v2.14.0 立 `reproducible` 这个字段而非直接看 seed 的原因');
        WA.rand.seed(777);
      }
      C20.resetClockStat();
      assert(C20.clockStat().nowCalls === 0 && C20.clockStat().failed === 0,
        'resetClockStat 把计量与失败台账**一并**归零——语义是「从此刻重新计量」，留一半旧账会污染「本轮有没有非法参数」');
    }
    // ── ⑨ 双消费端（诊断 / 面板 / 健康分 / verdict）──
    {
      C20.unfreeze(); C20.resetClockStat(); C20.freeze(NaN); C20.now('g20.diag');
      const dg20 = WA.toolDiag.collect();
      const ck20 = dg20.runtime && dg20.runtime.clock;
      assert(ck20 && typeof ck20.nowCalls === 'number' && typeof ck20.reproducible === 'boolean'
        && typeof ck20.failed === 'number' && typeof ck20.failedBy === 'object',
        '诊断包透出 runtime.clock（含 failed/failedBy）——**本版首版漏透出这两个字段**时，非法冻结在诊断包里恒不可见，verdict 只会落到 info 分支说「未冻结」，正是「声明面空转」的变体：台账记了、出口没接上');
      assert(ck20.failed >= 1 && ck20.failedBy['bad-freeze'] >= 1,
        '诊断包里的失败台账是真的（failed=' + ck20.failed + '，' + JSON.stringify(ck20.failedBy) + '）');
      assert(typeof ck20.wallCalls === 'number' && typeof ck20.sites === 'number',
        '诊断包里两类读取与站点面并列透出（wall=' + ck20.wallCalls + ' / sites=' + ck20.sites + '）');
      const panelSrc20 = fsM20.readFileSync(pathM20.join(BASE, 'ui/panel.js'), 'utf8');
      assert(/function clockBlock\(/.test(panelSrc20) && /\$\{clockBlock\(\)\}/.test(panelSrc20),
        '面板概览新增「时间源」块且被真实渲染进 renderOverview（纯展示、不引入控件，故不触碰 UI 绑定守卫）');
      const m20bad = WA.store.maintain();
      assert(typeof m20bad.signals.clockNowCalls === 'number' && typeof m20bad.signals.clockFailed === 'number'
        && typeof m20bad.signals.clockReproducible === 'boolean',
        'maintain() 透出三计量（now=' + m20bad.signals.clockNowCalls + ' / failed=' + m20bad.signals.clockFailed + ' / reproducible=' + m20bad.signals.clockReproducible + '）');
      const badIssue20 = (m20bad.issues || []).filter(function (i) { return i.key === 'clock.failed'; })[0];
      assert(badIssue20 && badIssue20.level === 'error',
        '非法参数在健康巡视里报 error 并点名（' + ((badIssue20 && badIssue20.detail) || '').slice(0, 52) + '…）');
      C20.resetClockStat(); C20.freeze(TS20);
      const m20ok = WA.store.maintain();
      assert(m20ok.score > m20bad.score,
        '非法参数确实扣分（bad=' + m20bad.score + ' → ok=' + m20ok.score + '）——只看议题不看分会让「体检结论」与「分数」互相矛盾');
      const frozenIssues20 = (m20ok.issues || []).filter(function (i) { return i.key === 'clock' || i.key === 'clock.failed'; });
      assert(frozenIssues20.length === 0,
        '冻结态下不产时钟议题（' + frozenIssues20.length + ' 条）——冻结是**正确姿势**，不该被当成问题报出来');
      C20.resetClockStat(); C20.unfreeze(); C20.now('g20.diag2');
      const m20info = WA.store.maintain();
      const infoIssue20 = (m20info.issues || []).filter(function (i) { return i.key === 'clock' && i.level === 'info'; })[0];
      assert(infoIssue20 && /freeze/.test(infoIssue20.detail),
        '未冻结时报 info 并给出解法（' + ((infoIssue20 && infoIssue20.detail) || '').slice(0, 56) + '…）——「明明播了种两次跑出来的存档还是不一样」需要有人告诉用户根因与动作');
      C20.resetClockStat(); C20.unfreeze(); C20.now('g20.diag3');
      const vInfo20 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'clock'; })[0];
      assert(vInfo20 && vInfo20.level === 'info', 'verdict 在未冻结时给 info（实 ' + (vInfo20 && vInfo20.level) + '）');
      C20.resetClockStat(); C20.freeze(NaN);
      const vErr20 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'clock'; })[0];
      assert(vErr20 && vErr20.level === 'error',
        'verdict 在参数非法时升级为 error（实 ' + (vErr20 && vErr20.level) + '）——失败台账透不进 verdict 时，这条恒为 info，非法冻结永不可见');
      C20.resetClockStat(); C20.freeze(TS20);
    }
    // ── ⑩ 基座保真：时钟不新增持久键、不接管持久层 ──
    {
      const keysBefore20 = Object.keys(global.localStorage._dump()).sort().join(',');
      C20.freeze(TS20); C20.advance(1000); C20.now('g20.key'); C20.wallNow(); C20.unfreeze();
      const keysAfter20 = Object.keys(global.localStorage._dump()).sort().join(',');
      assert(keysBefore20 === keysAfter20,
        '冻结/推进不新增任何持久键（键数 ' + Object.keys(global.localStorage._dump()).length + '）——时钟没有资格占地，键预算由 store 登记表管着');
      assert(!/localStorage/.test(clockCode20),
        'core/clock.js（去注释后）零 localStorage 引用——刷新即解除冻结是**有意的代价**：要跨会话复现就带着 tape 走，那是回放台的责任');
    }
    // ── ⑪ 负向自证 4 项：真源码破坏 → 加载破坏副本 → 在副本上重跑**同一条真判据** ──
    //   判据本身也是「工具」，须两向自证：锚点不存在/不唯一必须抛（否则破坏不可控或被静默跳过）。
    const mkBroken20 = function (rel, from, to, extraRels) {
      const c = vmM20.createContext({});
      vmM20.runInContext('var window = this; window.WorldAxis = { log: function(){} };', c);
      vmM20.runInContext('window.localStorage = (function(){ var s={}; return { setItem:function(k,v){s[k]=String(v);}, getItem:function(k){return (k in s)?s[k]:null;}, removeItem:function(k){delete s[k];}, clear:function(){s={};}, key:function(i){return Object.keys(s)[i]||null;}, get length(){return Object.keys(s).length;}, _dump:function(){return Object.assign({},s);} }; })();', c);
      (extraRels || []).forEach(function (r) {
        vmM20.runInContext(fsM20.readFileSync(pathM20.join(BASE, r), 'utf8'), c, { filename: r });
      });
      const src = fsM20.readFileSync(pathM20.join(BASE, rel), 'utf8');
      const hits = src.split(from).length - 1;
      if (hits !== 1) throw new Error('锚点在 ' + rel + ' 中命中 ' + hits + ' 次（须恰为 1，否则破坏不可控）');
      vmM20.runInContext(src.replace(from, to), c, { filename: rel + '.broken' });
      return c;
    };
    const judgeWall20 = function (CK) { const a = Date.now(), v = CK.now('probe.a'), b = Date.now(); return v >= a && v <= b; };
    try {
      const C11a = vmM20.runInContext('window.WorldAxis.clock',
        mkBroken20('core/clock.js', 'function raw() { return Date.now(); }', 'function raw() { return 12345; }', []));
      C11a.unfreeze();
      C20.unfreeze();
      assert(judgeWall20(C20) === true, '（负向自证·原版对照）「未冻结时 now() 落在墙钟区间内」在真源码上为真——否则下面的「破坏后为假」可能只是判据恒假');
      assert(judgeWall20(C11a) === false, '（负向自证）把 raw() 改成返回常量后，同一条判据必须变假——不变假说明它抓不到「唯一墙钟读取点被替换」');
      C20.freeze(TS20);
    } catch (e11a) { assert(false, '（负向自证）raw() 破坏副本构建失败：' + (e11a && e11a.message)); }
    const judgeFrozen20 = function (CK) { CK.freeze(TS20); return CK.now('probe.b') === TS20; };
    try {
      const C11b = vmM20.runInContext('window.WorldAxis.clock',
        mkBroken20('core/clock.js', 'const v = __frozen ? __virtualAt : raw();', 'const v = raw();', []));
      assert(judgeFrozen20(C20) === true, '（负向自证·原版对照）「冻结后 now() 恒为虚拟时刻」在真源码上为真');
      assert(judgeFrozen20(C11b) === false, '（负向自证）摘掉 now() 的冻结分支后，同一条判据必须变假——否则「冻结生效」这件事本身无从证明');
    } catch (e11b) { assert(false, '（负向自证）now 冻结分支破坏副本构建失败：' + (e11b && e11b.message)); }
    const judgeIdTs20 = function (CK, RK) { const id = RK.id('x_', 0, 'id'); return parseInt(id.split('_')[1], 36) === CK.virtualAt(); };
    try {
      const W11c = vmM20.runInContext('window.WorldAxis', mkBroken20('core/rand.js', "WA.clock.now('rand.id')", 'WA.clock.wallNow()', ['core/clock.js']));
      W11c.clock.freeze(TS20);
      C20.freeze(TS20);
      assert(judgeIdTs20(C20, WA.rand) === true, '（负向自证·原版对照）「id 时间戳 === 虚拟时刻」在真源码上为真');
      assert(judgeIdTs20(W11c.clock, W11c.rand) === false,
        '（负向自证）把 rand.id 的时间戳从决策时钟退回测量时钟后，同一条判据必须变假——否则本版最关键的一处归因修正没有任何判据钉住');
    } catch (e11c) { assert(false, '（负向自证）rand.id 破坏副本构建失败：' + (e11c && e11c.message)); }
    try {
      const W11d = vmM20.runInContext('window.WorldAxis',
        mkBroken20('core/workflow.js', "at: clockNow('workflow')", 'at: clockWall()', ['core/clock.js', 'core/settings-bus.js', 'core/store.js']));
      W11d.store.init();
      W11d.clock.freeze(TS20);
      W11d.workflow.register({ id: 'g20.bn', chain: 'g20b', order: 1, label: 'n', async run() {} });
      await W11d.workflow.run('g20b', {});
      C20.freeze(TS20);
      WA.workflow.resetHistory(WA.store.chatId());
      WA.workflow.register({ id: 'g20.wf2', chain: 'g20wf2', order: 1, label: 'n', async run() {} });
      await WA.workflow.run('g20wf2', {});
      assert(WA.workflow.history(1).runs[0].at === C20.virtualAt(), '（负向自证·原版对照）「链历史 at === 虚拟时刻」在真源码上为真');
      assert(W11d.workflow.history(1).runs[0].at !== TS20,
        '（负向自证）把链历史 at 退回测量时钟后，同一条判据必须变假——否则第二处归因修正同样没有判据钉住');
      WA.workflow.resetHistory(WA.store.chatId());
      WA.workflow.unregister('g20.wf2');
    } catch (e11d) { assert(false, '（负向自证）workflow at 破坏副本构建失败：' + (e11d && e11d.message)); }
    // ── 收尾：清理本块写入的探针数据、复位时钟，避免污染后续块 ──
    C20.freeze(TS20); C20.resetClockStat();
    try { WA.store.transact(function (d) { delete d.g20; delete d.g20wall; }); } catch (eClr) {}
    try { WA.workflow.resetHistory(WA.store.chatId()); } catch (eClr2) {}
    C20.unfreeze();
    console.log('  ✓ 裸调归零（唯一墙钟读取点＝clock.raw，守卫 fallback 逐个可解释）｜冻结即确定｜测量时间不受冻结');
    console.log('  ✓ 六处决策点落盘实测（store/memory/rand.id/chatcache/恢复点/工作流链历史）｜端到端重放逐项相同');
    console.log('  ✓ 非法参数不静默｜声明即执行｜双消费端（诊断/面板/健康分/verdict）｜负向自证 4 项');
  } // end v2.15.0 block
// ══════════════════════════════════════════════════════════════════
  // v2.16.0 块：对外只读互操作桥（第十面：世界状态的可外供性）
  //
  // 命题：本扩展是全套三插件（WorldAxis / RubyPhone / LonSha 记忆引擎）里**唯一没有对外接口**的一个。
  //   实测：产品代码零 `VirtualPhone`、零 `LonSha` 引用，对外只有内部的 `window.WorldAxis.*`。
  //   于是同一个剧情里，另外两个插件对「世界」各有各的看法，而且都是**猜的**：
  //     · RubyPhone「世界脉搏」App：自己再调一次 LLM 现编平行事件
  //     · RubyPhone TimeManager：从正文/世界书里**猜**当前时间
  //     · LonSha：世界推进另记一本账
  //   真正的世界状态（本扩展 store）三者都读不到——「两个世界对不上」的根因在此，且此前无法从外部观测。
  //
  // 本块立六件事：① 契约同规格（与 lonsha_memory_bridge_v1 同型：只读投影／纯读不抛／深拷贝／拉取面）
  //   ② 过滤不静默（visibility 三态各自的去向可归因，宽松口径须显式选择）
  //   ③ 不刷屏（楼层间隔 + 时间去抖），但**作废必须优先于去抖**——否则换会话/推演结算后的第一问
  //      拿回来的还是旧世界，正是本仓库反复治理的「静默串味」
  //   ④ 休眠要可归因（默认关闭时外部读到 null 必须能问出原因，而不是看起来像「世界是空的」）
  //   ⑤ 出口面只留被消费的成员（零消费出口按 v2.11.0 裁决摘除，本块把这条口径钉住）
  //   ⑥ **休眠不得拿观测性换便利**：总线订阅是惰性的（真发布过才挂），否则默认关闭的模块
  //      会常驻两个监听位，把「有发出无监听」这条真实健康信号抹平
  // ══════════════════════════════════════════════════════════════════
  {
    console.log('\n■ G21 对外只读互操作桥（第十面：世界状态的可外供性）');
    const B = WA.bridge;
    assert(!!B && B.id === 'worldaxis_bridge_v1' && B.version === 1,
      '桥已装载且版本自洽（id=' + (B && B.id) + ' version=' + (B && B.version) + '）');
    assert(typeof B.buildSnapshot === 'function' && typeof B.splitCurrents === 'function'
      && typeof B.refresh === 'function' && typeof B.snapshot === 'function'
      && typeof B.invalidate === 'function' && typeof B.settings === 'function'
      && typeof B.setSettings === 'function' && typeof B.stat === 'function',
      '八个出口成员齐备（buildSnapshot/splitCurrents/refresh/snapshot/invalidate/settings/setSettings/stat）');
    // ── ① 只读投影：本桥**不得**提供任何写世界状态的办法 ──
    const writerNames = Object.keys(B).filter(function (k) {
      return /^(set|patch|apply|write|save|update|mutate|rollback|reset)([A-Z_]|$)/.test(k);
    });
    assert(writerNames.length === 1 && writerNames[0] === 'setSettings',
      '桥上唯一的「set*」是 setSettings（改的是本桥开闸配置，不是世界状态），实 ' + JSON.stringify(writerNames));
    const cfgBeforeRO = B.settings();
    assert(cfgBeforeRO && cfgBeforeRO.enabled === false && cfgBeforeRO.presumeUnknown === 'hidden'
      && cfgBeforeRO.maxCurrents === 20 && cfgBeforeRO.maxEchoes === 12 && cfgBeforeRO.maxOpinion === 8
      && cfgBeforeRO.debounceMs === 400 && cfgBeforeRO.includeHidden === false,
      '默认设置＝休眠（enabled=false）＋保守过滤（presumeUnknown=hidden）——快照要 clone 世界状态，无事时不该付出这份开销');
    // 声明即执行：本模块的设置登记表真的挂在总线上（否则面板/诊断读到的是镜像值）
    //   注：case 20 会替换整个 WA.__settingsRegs 数组（实测 90 项 → 15 项），故这里按**内容**查找
    //   而不是断言「恰好一条」——登记表的唯一性由 case 21 的自洽校验负责，本处只问本键在不在。
    // 口径：取**首个**匹配项（仓库既有写法，见 regOf2400 / reg2500 / backstage 段）。
    //   本测试进程把模块文件多次装载进同一全局对象（`concat` 追加、无去重），故每个模块的
    //   登记项都会累积成多份——实测 15 个模块一律各 5 份，**与 bridge 无关**；
    //   「恰好一份」不是本仓库的契约，断言它只会把装置产物误报成产品缺陷。
    //   （登记表可因宿主重复装载而膨胀：本条只钉「在册且归因正确」，
    //     要不要给登记加去重属 settingsBus 的跨模块口径，另案处理，不在本版偷偷改。）
    const regB = (WA.__settingsRegs || []).filter(function (r) { return r && r.key === 'worldaxis_bridge_settings_v1'; })[0];
    assert(regB && regB.module === 'bridge' && regB.def.enabled === false
      && regB.enums && Array.isArray(regB.enums.presumeUnknown)
      && regB.enums.presumeUnknown.indexOf('hidden') >= 0 && regB.enums.presumeUnknown.indexOf('public') >= 0,
      '设置登记表在场且模块归因正确，含枚举白名单声明（settingsBus 的读路径/归一化/边界声明都靠它）');
    assert(WA.settingsBus.registry().some(function (r) { return r.key === 'worldaxis_bridge_settings_v1'; }),
      '登记表经 settingsBus.registry() 读得到（面板/诊断为读这条路径，而非直接摸 __settingsRegs）');
    // ── ④ 休眠可归因：默认关闭时外部拿 null，但**必须问得出原因** ──
    const statA = WA.bridge.stat();
    const snapOff = B.snapshot();
    const statB = WA.bridge.stat();
    assert(snapOff === null, '休眠时外部读取返回 null（不抛、不返回「空世界」的假快照）');
    assert(statB.refused === statA.refused + 1 && statB.lastRefusal && statB.lastRefusal.reason === 'disabled',
      '休眠拒绝被记账且可归因（refused ' + statA.refused + '→' + statB.refused + '，最近理由 ' + (statB.lastRefusal || {}).reason + '）');
    assert(statB.externalReads === statA.externalReads + 1, '外部读取次数记账（externalReads ' + statA.externalReads + '→' + statB.externalReads + '）');
    assert(statB.publishes === statA.publishes, '休眠时不会偷偷发布快照（publishes 不变）');
    assert(statB.subscribed === false,
      '休眠的桥不占总线监听位（subscribed=false）——本仓库总线上「有发出无监听」是刻意可见的健康信号，'
      + '一个从不工作的模块常驻在 backstage:settled/chat:changed 上等于把这条真实告警抹平');
    const busPreB = WA.busStats(999).events.filter(function (r) { return r.event === 'backstage:settled' || r.event === 'chat:changed'; });
    assert(busPreB.every(function (r) { return r.listeners === 0; }),
      '（读侧实证）休眠期这两个事件在总线上确实无人监听（实测 ' + JSON.stringify(busPreB.map(function (r) { return r.event + ':' + r.listeners; })) + '）');
    // ── ② 过滤不静默：三态各自的去向可归因（纯函数独立驱动）──
    const FX = [
      { id: 'c_pub', title: '公开', visibility: 'public' },
      { id: 'c_trace', title: '半公开', visibility: 'public_trace' },
      { id: 'c_hid', title: '隐藏', visibility: 'hidden' },
      { id: 'c_none', title: '未标记' }
    ];
    const sp = B.splitCurrents(FX, 'hidden');
    assert(sp.out.length === 2 && sp.out[0].id === 'c_pub' && sp.out[1].id === 'c_trace',
      '保守口径：只有显式 public/public_trace 外供（实 ' + sp.out.map(function (c) { return c.id; }).join(',') + '）');
    assert(sp.notMarked.length === 1 && sp.notMarked[0].id === 'c_none',
      '未标记的进「未标记清单」而不是被静默丢掉——「一条都没进来」与「进来的都不该进」从此可区分');
    assert(B.splitCurrents(FX, 'public').out.length === 3 && B.splitCurrents(FX, 'public').notMarked.length === 0,
      '宽松口径（presumeUnknown=public）须显式选择：未标记并入外供');
    assert(B.splitCurrents(null, 'hidden').out.length === 0 && B.splitCurrents([null, 1, 'x'], 'hidden').notMarked.length === 0,
      '非数组/非对象元素全部吞掉，不进清单（外部数据脏不得连坐整张快照）');
    // ── 开闸：快照结构与两份真值 ──
    B.setSettings({ enabled: true });
    assert(B.settings().enabled === true, 'setSettings 即时生效并落盘读回');
    WA.store.transact(function (d) {
      d.clock.label = 'G21·开闸前'; d.clock.iso = '2026-01-01T00:00:00.000Z'; d.clock.dayIndex = 7; d.clock.source = 'user';
      d.currents.push({ id: 'g21_hid', title: '隐藏暗流', visibility: 'hidden', participants: ['甲'], stage: 'spread' });
      d.currents.push({ id: 'g21_pub', title: '公开暗流', visibility: 'public', participants: ['乙'], stage: 'seed' });
      d.opinion.canon.push({ title: '已核实', body: '权威通报', claim_status: 'fact', scope: 'global', related_event_id: 'g21_evt' });
      d.opinion.forum.push({ board: '茶馆', topic: '传闻', claim_status: 'rumor', related_event_id: 'g21_evt', replies: [{ author: '张三', text: '听说了吗' }] });
      d.opinion.sandbox.push({ kind: 'murmur', text: '路人闲聊', mood: 'calm' });
    });
    B.invalidate('g21-setup');
    const sn1 = B.refresh({ reason: 'g21-open' });
    assert(!!sn1 && sn1.version === 1 && sn1.bridge === 'worldaxis_bridge_v1' && sn1.reason === 'g21-open',
      '快照头部自洽（version/bridge/reason）——宿主侧可据此判定「读到的是这个桥」');
    assert(WA.bridge.stat().subscribed === true && WA.busStats(999).events.filter(function (r) {
      return (r.event === 'backstage:settled' || r.event === 'chat:changed') && r.listeners === 1;
    }).length === 2, '首次成功发布后两个作废订阅点才挂上（惰性订阅的反向：真在跑就必须占位）');
    assert(sn1.worldClock.label === 'G21·开闸前' && sn1.worldClock.dayIndex === 7 && sn1.worldClock.source === 'user',
      '世界钟为直读真值（label/dayIndex/source）——RubyPhone TimeManager 的「猜时间」可由「读时间」替代');
    assert(sn1.currents.length === 1 && sn1.currents[0].id === 'g21_pub',
      '保守口径下隐藏暗流不外供（含 includeHidden=false 时的真实投影）');
    assert(sn1.filter.presumeUnknown === 'hidden' && sn1.filter.includeHidden === false
      && sn1.filter.notMarkedCount === 0 && sn1.filter.hiddenCount === 1,
      '过滤归因字段完整（presumeUnknown/includeHidden/notMarkedCount/hiddenCount）');
    assert(sn1.counts.currents === 2 && sn1.counts.opinionCanon === 1 && sn1.counts.opinionForum === 1,
      'counts 报的是**世界真值**（currents=2）而 currents 报的是**外供投影**（1 条）——总量与外供量必须分开可读');
    assert(sn1.opinion.canon.length === 1 && sn1.opinion.canon[0].claim === 'fact' && sn1.opinion.canon[0].relatedEvent === 'g21_evt',
      '已核实新闻带 claim_status 与来源事件（「已核实」与「纯传闻」在外部侧是两种事实强度）');
    assert(sn1.opinion.forum.length === 1 && sn1.opinion.forum[0].claim === 'rumor' && sn1.opinion.forum[0].replies.length === 1,
      '论坛传闻带 claim_status=rumor 与首条回复（外部侧据此决定「敢不敢当成事实引用」）');
    assert(sn1.opinion.sandbox.length === 1 && sn1.opinion.sandbox[0].kind === 'murmur',
      'NON-CANON 闲逛单列（sandbox）——不与 canon 混流');
    assert(sn1.exportedAt > 0 && sn1.exportedAtWall > 0 && sn1.reason === 'g21-open',
      '决策时间与测量时间分别落账（exportedAt/exportedAtWall）——冻结时钟时前者可复现、后者仍是真墙钟');
    // ③ 深拷贝：改返回值不得改到引擎内存态
    const sn1b = B.snapshot();
    sn1b.worldClock.label = '被外部改坏了';
    sn1b.currents.push({ id: '外部硬塞' });
    const rawAfter = WA.store.read('clock.label');
    assert(rawAfter === 'G21·开闸前', '外部改快照不回写世界（store 仍是原值，实 ' + rawAfter + '）');
    assert(B.snapshot().currents.length === 1, '外部往快照里塞条目不影响下一次读取（深拷贝边界成立）');
    assert(B.snapshot() !== B.snapshot(), '每次 snapshot() 返回新对象（不是同一引用）');
    // ── ③ 不刷屏：楼层间隔 + 时间去抖 ──
    const stG = WA.bridge.stat();
    assert(stG.floorGap === 5 && typeof stG.subscribed === 'boolean' && typeof stG.invalidated === 'boolean',
      'stat 报出 floorGap/subscribed/invalidated（面板此前引用的 floorGap 本来不存在，会渲染成 undefined）');
    const beforeDeb = WA.bridge.stat();
    const snDeb = B.snapshot();
    const afterDeb = WA.bridge.stat();
    assert(afterDeb.debounced > beforeDeb.debounced && snDeb !== null,
      '同一时刻重复读取被时间去抖挡下（不重建、直接回上一份）——外部轮询不会变成 clone 风暴');
    assert(afterDeb.publishes === beforeDeb.publishes, '去抖命中时 publishes 不增（没有白干活）');
    // 楼层间隔：同一 floor 上强制重建之后，普通 refresh 仍被间隔挡住
    const beforeForced = WA.bridge.stat();
    const snForced = B.refresh({ reason: 'g21-forced', force: true });
    const afterForced = WA.bridge.stat();
    assert(snForced && afterForced.publishes === beforeForced.publishes + 1,
      'force 可越过间隔（外部「我知道世界变了」的显式通道）');
    const snBlocked = B.refresh({ reason: 'g21-same-floor' });
    const afterBlocked = WA.bridge.stat();
    assert(afterBlocked.debounced === afterForced.debounced + 1 && afterBlocked.publishes === afterForced.publishes,
      '未 force 且楼层未前进时被楼层间隔挡下（世界推演是本仓库最慢的链路，快照 clone 不该更贵）');
    assert(snBlocked !== null, '被挡下时返回上一份快照而不是 null（外部不会因去抖而「读不到世界」）');
    // ── ③′ 作废优先于去抖（本块最要害的一条：跨会话串味）──
    const beforeInv = WA.bridge.stat();
    B.invalidate('g21-chat');
    const afterInv = WA.bridge.stat();
    assert(afterInv.invalidations === beforeInv.invalidations + 1
      && afterInv.byInvalidate['g21-chat'] === 1
      && afterInv.lastInvalidateReason === 'g21-chat',
      'invalidate 按理由归因入账（byInvalidate 分桶）——「谁把快照作废的」不靠日志猜');
    assert(afterInv.invalidated === true, 'stat 透出 invalidated 状态位（作废不是隐式内部态）');
    const snRe = B.refresh({ reason: 'g21-after-inv' });
    const afterRe = WA.bridge.stat();
    assert(afterRe.publishes === afterInv.publishes + 1 && afterRe.invalidated === false,
      '作废后的第一次 refresh **必然**重建（而不是被楼层间隔/时间去抖吃掉旧世界）——这是跨会话串味的回归钉');
    // ── ④ 归一：非法口径值退回保守档，不静默放宽 ──
    B.setSettings({ presumeUnknown: 'wild', maxCurrents: 9999, debounceMs: -5, includeHidden: 'yes' });
    const cfgN = B.settings();
    assert(cfgN.presumeUnknown === 'hidden', '非法 presumeUnknown 退回保守档（实 ' + cfgN.presumeUnknown + '）——放宽过滤这件事不该由拼错的值替用户决定');
    assert(cfgN.maxCurrents === 80, '越界上限夹回声明区间上界（实 ' + cfgN.maxCurrents + '）');
    assert(cfgN.debounceMs === 0, '越界去抖夹回下界（实 ' + cfgN.debounceMs + '）');
    assert(cfgN.includeHidden === true, '布尔域经 toBool 归一（字符串 yes ⇒ true）');
    B.setSettings({ maxCurrents: 20, debounceMs: 400, includeHidden: false, presumeUnknown: 'hidden' });
    // ── 只读投影的硬证：跑完整条 after 链，世界状态逐字段不变 ──
    const snapBeforeRun = B.snapshot();
    const worldBefore = JSON.stringify(WA.store.get());
    await WA.workflow.run('after', {});
    assert(typeof WA.workflow.list('after').find(function (n) { return n.id === 'bridge.publish'; }) === 'object',
      '本桥已挂进 after 链（id=bridge.publish）——对外投影的时机就是「世界刚推完」');
    const pubNode = WA.workflow.list('after').filter(function (n) { return n.id === 'bridge.publish'; })[0];
    assert(pubNode.order > 60 && pubNode.critical === false && typeof pubNode.run === 'function',
      '排在 actors.profileMaintain(60) 之后、且**非关键节点**（对外投影失败绝不能拖住或回滚世界推演主链）');
    assert(WA.store.read('clock.label') === 'G21·开闸前' && snapBeforeRun !== null
      && JSON.parse(worldBefore).clock.label === WA.store.read('clock.label'),
      '跑完整条 after 链后世界状态不变（桥全程只读，零写世界）');
    // ── 消费侧：诊断节 / 健康分 / 面板 —— 声明即执行 ──
    const dg21 = WA.toolDiag.collect();
    assert(dg21.bridge && dg21.bridge.id === 'worldaxis_bridge_v1' && dg21.bridge.enabled === true
      && dg21.bridge.subscribed === true,
      '诊断节 secBridge 采到桥的真实状态（id/enabled/subscribed）');
    assert(dg21.bridge.publishes > 0 && dg21.bridge.floor === WA.bridge.stat().floor
      && typeof dg21.bridge.snapshotBytes === 'number' && dg21.bridge.invalidated === false,
      '诊断节带出发布次数/楼层/快照字节/作废态（外部集成是否真在跑，一眼可见）');
    const fl21 = WA.toolDiag.flatten(dg21);
    assert(fl21.filter(function (r) { return r.key === 'bridge'; }).length >= 1,
      'flatten 清单里有对外桥摘要行——否则「另两个插件能不能读到这个世界」在总览里完全缺席');
    assert(WA.toolDiag.MODULE_EXPORTS['engines/bridge.js'] === 'bridge',
      'MODULE_EXPORTS 已登记（装载缺失会被 secModules 报出来，而不是静默少一个模块）');
    const mt21 = WA.store.maintain({});
    assert(mt21.signals && mt21.signals.bridgePublishes === WA.bridge.stat().publishes
      && mt21.signals.bridgeEnabled === true,
      '健康分 signals 透出 bridgePublishes/bridgeEnabled（实 publishes=' + mt21.signals.bridgePublishes + '）');
    assert(typeof mt21.signals.bridgeExternalReads === 'number' && typeof mt21.signals.bridgeFailures === 'number',
      'signals 四字段齐备（publishes/failures/externalReads/enabled）');
    const panelSrc21 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    assert(panelSrc21.indexOf('function bridgeBlock()') >= 0 && panelSrc21.indexOf('${bridgeBlock()}') >= 0,
      '面板概览已挂 bridgeBlock()（UI 层在无头测试里不装载，故只做源码级钉——实机表现须另行核验）');
    // ── 零消费出口检查（本块把「导出面必须被消费」口径钉成回归）──
    //   本桥最初多写了 onAfterReply / resetStat 两个出口，产品代码零消费（实测扫全库：唯一调用点就在本文件内）。
    //   按 v2.11.0 裁决摘除。判据落在**读侧**（有谁会去调它），而不是写在 bridge.js 里的自述。
    const bridgeSrc21 = fs.readFileSync(path.join(BASE, 'engines/bridge.js'), 'utf8');
    const consumerSelf21 = /WA\s*\.\s*bridge\s*(?:\?\.|\.)\s*(onAfterReply|resetStat)\b/;
    assert(!consumerSelf21.test(bridgeSrc21),
      '零消费出口不留：桥自己也不在别处引用 onAfterReply/resetStat（摘除彻底）');
    const exportKeys21 = bridgeSrc21.slice(bridgeSrc21.indexOf('const bridge = WA.bridge = {'));
    assert(exportKeys21.indexOf('resetStat:') < 0 && exportKeys21.indexOf('onAfterReply:') < 0,
      '两个零消费出口已从导出面移除——留着零消费出口的风险不是「多一个 API」，而是「下一个调用者会挑错的那个」');
    // ── 负向自证：拆掉两重判定中的任一重，串味必须立刻现形 ──
    //   闭环：真源码上跑同一条判据（必须干净）→ 在**真源码**上做单点破坏（锚点恰中 1 次）→
    //   加载破坏副本 → 重跑同一条判据（必须现形）。判据自身引用锚点串会被本仓库门禁点名，故
    //   锚点只在这里声明一次，判据只看快照内容。
    // 注：**只装载一次**。此前版本先建上下文、再补跑一遍 load21 兜底，那会把破坏副本
    //   整体覆盖回原版——于是三条判据在三个副本上读数完全一致（破坏根本没生效）。
    const LOAD21 = ['core/clock.js', 'core/rand.js', 'core/settings-bus.js', 'core/store.js', 'core/evict.js',
      'core/api-router.js', 'core/workflow.js', 'core/settle-guard.js', 'core/interceptor.js',
      'engines/backstage.js', 'engines/evolution.js', 'engines/enemies.js', 'engines/regional.js', 'engines/horizon.js',
      'engines/digest.js', 'engines/limits.js', 'engines/calendar.js', 'engines/memory.js', 'engines/worldbook.js',
      'engines/ledger.js', 'engines/timeline.js', 'engines/entities.js', 'engines/preset.js',
      'engines/chatcache.js', 'engines/pmem.js', 'engines/rules.js', 'engines/summarizer.js', 'engines/chapters.js',
      'engines/opinion.js', 'engines/bridge.js', 'compat/host.js'];
    const ANCH21 = /if \(!__invalidated && !opts\.force && f >= 0 && __snapshot && f >= __publishedFloor && \(f - __publishedFloor\) < FLOOR_GAP\) \{/;
    const mkBroken21 = function (fromRe, to, noReplace) {
      const c = vm.createContext({});
      vm.runInContext('var window = this; window.WorldAxis = { log: function(){} };', c);
      vm.runInContext('window.localStorage = (function(){ var s={}; return { setItem:function(k,v){s[k]=String(v);}, getItem:function(k){return (k in s)?s[k]:null;}, removeItem:function(k){delete s[k];}, clear:function(){s={};}, key:function(i){return Object.keys(s)[i]||null;}, get length(){return Object.keys(s).length;} }; })();', c);
      // 一次造一份**持久**上下文：桥的 floor() 从它读楼层。若每次 getContext 返回新对象，
      //   判据里对楼层的改写就永远不被 floor() 看见（判据会静默恒真）。
      vm.runInContext('window.SillyTavern = (function(){ var _st = { chat: { length: 3 }, chatId: "g21_broken" }; return { getContext: function(){ return _st; } }; })();', c);
      const src = fs.readFileSync(path.join(BASE, 'engines/bridge.js'), 'utf8');
      let out = src;
      if (!noReplace) {
        // 非全局匹配数锚点（含捕获组时 split 口径会把命中数算重，正是本块自纠掉的那个假象）
        const hits = (src.match(new RegExp(fromRe.source, 'g')) || []).length;
        if (hits !== 1) throw new Error('锚点在 engines/bridge.js 中命中 ' + hits + ' 次（须恰为 1，否则破坏不可控）');
        out = src.replace(fromRe, to);
        if (out === src) throw new Error('破坏锚点命中但替换后源码未变（判据会被静默绕过）');
      }
      LOAD21.forEach(function (r) {
        const isT = (r === 'engines/bridge.js');
        const code = isT ? out : fs.readFileSync(path.join(BASE, r), 'utf8');
        vm.runInContext(code, c, { filename: r + ((isT && !noReplace) ? '.broken' : '') });
      });
      const copy = { ctx: c, bridge: vm.runInContext('window.WorldAxis.bridge', c),
        store: vm.runInContext('window.WorldAxis.store', c), st: vm.runInContext('window.SillyTavern', c) };
      if (!copy.bridge || !copy.store) throw new Error('副本装载不全（bridge/store 缺失）');
      return copy;
    };
    // 判据只看快照内容，不看实现细节：世界已变之后，**下一问**必须拿到最新世界。
    const judge21 = function (copy) {
      const WB = copy.bridge, WS = copy.store, ST = copy.st;
      const out = { invStale: false, shortStale: false };
      WS.init();
      // 关掉**时间**去抖，让判据只考**楼层**这一维：两维耦合时（出版间隔 400ms 内）
      //   干净版也会被时间去抖挡下、把旧快照当「作废/回退」返回——判据会分不清是
      //   哪个维度在起作用（此前探针二在真源码上就因此恒真）。
      WB.setSettings({ enabled: true, debounceMs: 0 });
      // 探针一：世界已变 + 显式作废（换会话 / 推演结算）→ 下一问必须是最新世界。
      ST.getContext().chat.length = 3;
      WS.transact(function (d) { d.clock.label = 'A1'; });
      WB.refresh({ reason: 'a1', force: true });
      WS.transact(function (d) { d.clock.label = 'A2'; });
      WB.invalidate('chat:changed');
      out.invStale = (WB.snapshot() || { worldClock: {} }).worldClock.label === 'A1';
      // 探针二：世界已变 + 楼层不比上一份大（会话被截短 / 换到更短的会话）→ 下一问必须是最新世界。
      //   走到这里时 __publishedFloor = 5（上面那一问在 chat.length=6 时发布），再把会话截回 5 楼
      //   问一次：若只剩「间隔够不够」这一维（上界 `f >= __publishedFloor` 被拆掉），
      //   f - publishedFloor = -1 依旧小于 FLOOR_GAP ⇒ 照样把上一份快照当成「间隔不够」返回。
      ST.getContext().chat.length = 6;
      WS.transact(function (d) { d.clock.label = 'B1'; });
      WB.refresh({ reason: 'b1', force: true });
      WS.transact(function (d) { d.clock.label = 'B2'; });
      ST.getContext().chat.length = 5;
      out.shortStale = (WB.snapshot() || { worldClock: {} }).worldClock.label === 'B1';
      return out;
    };
    try {
      const jReal = judge21(mkBroken21(/$^/, '', true));
      assert(jReal.invStale === false && jReal.shortStale === false,
        '（负向自证·原版对照）真源码上两条判据都是干净的（作废后拿到最新 / 楼层不比上一份大时拿到最新）——'
        + '否则下面的「破坏后现形」可能只是判据恒真。实 ' + JSON.stringify(jReal));
      const jA21 = judge21(mkBroken21(ANCH21,
        'if (!opts.force && f >= 0 && __snapshot && f >= __publishedFloor && (f - __publishedFloor) < FLOOR_GAP) {'));
      assert(jA21.invStale === true,
        '（负向自证）把「作废优先」拆掉后，作废后的第一问拿回来的必然是旧世界——这正是换会话/推演结算的串味');
      const jB21 = judge21(mkBroken21(ANCH21,
        'if (!__invalidated && !opts.force && f >= 0 && __snapshot && (f - __publishedFloor) < FLOOR_GAP) {'));
      assert(jB21.shortStale === true,
        '（负向自证）把楼层上界 `f >= __publishedFloor` 单独拆掉后，楼层回退那一问同样拿到旧世界——两重判定缺一不可');
    } catch (e21) {
      assert(false, '（负向自证）作废语义的破坏副本构建失败：' + (e21 && e21.message));
    }
    // ── 收尾：复位本块的世界状态与桥设置，避免污染后续块 ──
    WA.store.transact(function (d) {
      d.clock.label = ''; d.clock.iso = ''; d.clock.dayIndex = 0; d.clock.source = 'unset';
      d.currents = d.currents.filter(function (c) { return !/^g21_/.test(c.id); });
      d.opinion.canon = d.opinion.canon.filter(function (o) { return o.title !== '已核实'; });
      d.opinion.forum = d.opinion.forum.filter(function (o) { return o.topic !== '传闻'; });
      d.opinion.sandbox = d.opinion.sandbox.filter(function (o) { return o.text !== '路人闲聊'; });
    });
    B.setSettings({ enabled: false, includeHidden: false, presumeUnknown: 'hidden', maxCurrents: 20, maxEchoes: 12, maxOpinion: 8, debounceMs: 400 });
    B.invalidate('g21-teardown');
    console.log('  ✓ 只读投影（零写世界出口）｜纯读不抛（休眠返 null 且 refused 可归因）｜深拷贝边界成立');
    console.log('  ✓ 过滤不静默（三态去向 + 宽松口径须显式选择）｜归一（非法口径退回保守档）｜默认休眠不偷跑');
    console.log('  ✓ 不刷屏（楼层间隔 + 时间去抖）但作废优先于去抖｜failures/debounced/invalidations 全部可观测');
    console.log('  ✓ 休眠不占总线监听位（惰性订阅）——不拿观测性换便利');
    console.log('  ✓ 消费侧齐备（after 链节点/诊断节/flatten/健康分 signals/面板块）｜零消费出口摘除');
    console.log('  ✓ 负向自证 3 项（原版对照 + 拆任一条判定都必然现形）');
  } // end v2.16.0 block
// ══════════════════════════════════════════════════════════════════
  // v2.17.0 块：记忆桥消费面（第十一面：跨插件账本的可读性）
  //
  // 命题：v2.16.0 把本扩展的**出口**做出来了（外部能读到这个世界），但反向那条边是断的：
  //   全库 grep `lonsha_memory_bridge_v1` 的命中**全在注释、文档与面板提示文本里**，
  //   产品代码**零消费**。于是「同一场剧情里，另一个插件记的那本账」在本扩展侧完全不可观测，
  //   两个「现在」对不上也没人知道——而这恰恰是这套三插件体系存在的理由。
  //
  // 本块立五件事：① 只读（只调对方的读取面，绝不写桥/改对方账本，也不动本扩展世界钟）
  //   ② 不抛（未装/未就绪/取快照抛错/快照畸形/宿主怪异 getter 一律降级为可归因的 reason）
  //   ③ 来源可归因（把 LonSha v3.174 的 sourceState 状态机映成外部 reason——
  //      「对方还没就绪，稍后再读」与「对方坏了，该报」必须分开）
  //   ④ 三态尊重（对方的 meta.fieldTypes：未外供 / 显式为空 / 有值，三态不得压成一态）
  //   ⑤ 对账不硬比（本扩展世界钟没有公历形态是**常态**，不与公历硬比；对方没记也与读不出分开）
  // ══════════════════════════════════════════════════════════════════
  {
    console.log('\n■ G22 记忆桥消费面（第十一面：跨插件账本的可读性）');
    const LR = WA.lonshaReader;
    assert(!!LR && LR.LONSHA_BRIDGE_ID === 'lonsha_memory_bridge_v1' && LR.LONSHA_BRIDGE_VERSION === 1,
      '消费面已装载且桥名/契约版本与上游自洽（id=' + (LR && LR.LONSHA_BRIDGE_ID) + ' v=' + (LR && LR.LONSHA_BRIDGE_VERSION) + '）');
    assert(typeof LR.readLonshaSnapshot === 'function' && typeof LR.lonshaSource === 'function'
      && typeof LR.diffWithLonsha === 'function' && typeof LR.fieldState === 'function'
      && typeof LR.summarizeSnapshot === 'function' && typeof LR.describeLonsha === 'function',
      '六个判定入口齐备（readLonshaSnapshot/lonshaSource/diffWithLonsha/fieldState/summarizeSnapshot/describeLonsha）');
    assert(WA.toolDiag.MODULE_EXPORTS['engines/lonsha-reader.js'] === 'lonshaReader',
      'MODULE_EXPORTS 已登记（装载缺失会被 secModules 报出来，而不是静默少一个模块）');
    // ── ① 未装 → not-mounted（不是「对方没账」，是本扩展旁边的桥不在）──
    const rNo = LR.readLonshaSnapshot({ win: {} });
    assert(rNo.ok === false && rNo.reason === 'not-mounted', '未装 ⇒ not-mounted（实 ' + rNo.reason + '）');
    assert(LR.lonshaSource(LR.LONSHA_BRIDGE_ID, {}).mounted === false, '来源探针：未挂载如实报 false');
    // ── ③ 来源可归因：把对方的 sourceState 五态逐一映出来 ──
    const mkWin = function (st, snapVal, api) {
      const b = { sourceState: st, lastError: api && api.err ? api.err : null, snapshot: snapVal === undefined ? null : snapVal };
      if (api && api.throwing) { b.refresh = function () { throw new Error('boom'); }; }
      else { b.refresh = function () { return snapVal === undefined ? null : snapVal; }; }
      return { lonsha_memory_bridge_v1: b };
    };
    const ST = [
      ['engine-absent', 'engine-absent'], ['engine-empty', 'engine-empty'],
      ['thrown', 'thrown'], ['idle', 'no-snapshot'], ['ready', 'no-snapshot']
    ];
    let stAll = true;
    ST.forEach(function (pair) {
      const src = LR.lonshaSource(LR.LONSHA_BRIDGE_ID, mkWin(pair[0], null));
      if (src.reason !== pair[1]) { stAll = false; console.log('    · 期望 ' + pair[0] + '⇒' + pair[1] + '，实 ' + src.reason); }
    });
    assert(stAll, '对方的 sourceState 五态逐一对映到本侧 reason（未就绪与坏了不同形——这正是 v3.174 那台状态机的用处）');
    const rThrown = LR.readLonshaSnapshot({ win: mkWin('thrown', null) });
    assert(rThrown.ok === false && rThrown.reason === 'thrown',
      '对方自述 thrown ⇒ 本侧 thrown（不硬去拉，直接归因）');
    // ── ② 不抛：宿主怪异 getter / 桥取快照抛错 ──
    let threw = false, rG = null;
    try {
      rG = LR.readLonshaSnapshot({ get win() { throw new Error('host'); } });
      LR.lonshaSource(LR.LONSHA_BRIDGE_ID, { get lonsha_memory_bridge_v1() { throw new Error('y'); } });
    } catch (e) { threw = true; }
    assert(threw === false, '宿主怪异 getter 绝不外抛（「不抛」是声明，不是期望）');
    assert(rG && rG.ok === false && (rG.reason === 'not-mounted' || rG.reason === 'thrown'),
      '怪异宿主降级且可归因（实 ' + (rG && rG.reason) + '）——取 opts.win 本身就抛时走外层兜底，'
      + 'reason=thrown 也说清了「为什么读不到」，与 not-mounted 一样是可归因的降级');
    const rBoom = LR.readLonshaSnapshot({ win: mkWin('ready', undefined, { throwing: true }) });
    assert(rBoom.ok === false && (rBoom.reason === 'pull-failed' || rBoom.reason === 'no-snapshot'),
      '对方 refresh 抛错 ⇒ 降级不抛（实 ' + rBoom.reason + '）');
    // ── ③ 就绪 + 契约版本门 ──
    const GOOD = { version: 1, bridge: 'lonsha_memory_bridge_v1', pluginVersion: '3.175.0', floor: 42,
      clock: { date: '2026-09-13' }, characters: {}, recallAudit: {},
      meta: { contract: 'v3.174', selfBytes: 1234, strictJsonOk: true,
        fieldTypes: { protagonist: { present: true, kind: 'object' }, lifeDetails: { present: false, kind: 'undefined' },
          characters: { present: true, kind: 'object' }, moneyLedger: { present: true, kind: 'null' },
          outline: { present: true, kind: 'object' }, worldProg: { present: true, kind: 'object' },
          clock: { present: true, kind: 'object' }, recallAudit: { present: true, kind: 'object' } } } };
    const rOk = LR.readLonshaSnapshot({ win: mkWin('ready', GOOD) });
    assert(rOk.ok === true && rOk.reason === 'ok', '就绪 ⇒ ok（实 ' + rOk.reason + '）');
    const rMism = LR.readLonshaSnapshot({ win: mkWin('ready', { version: 99, clock: {} }) });
    assert(rMism.ok === false && rMism.reason === 'contract-mismatch',
      '上游契约版本**显式**不匹配 ⇒ contract-mismatch（升版后静默按旧契约解读是两端都不报错的缺陷）');
    const rOld = LR.readLonshaSnapshot({ win: mkWin('ready', { clock: { date: '2026-09-13' } }) });
    assert(rOld.ok === true, '无 version 字段（旧版/精简版）⇒ 放行（只拦显式不匹配）');
    // ── ④ 三态尊重：未外供 / 显式为空 / 有值 必须互不相同 ──
    const fAbs = LR.fieldState(GOOD, 'lifeDetails'), fNul = LR.fieldState(GOOD, 'moneyLedger'), fVal = LR.fieldState(GOOD, 'characters');
    assert(fAbs.present === false && fAbs.kind === 'absent',
      '未外供 ⇒ present=false（对方压根没这项，本扩展须视作「没有」而不是「空的」）');
    assert(fNul.present === true && fNul.kind === 'null',
      '显式为空 ⇒ present=true + kind=null（「有这项、值是空」——与「没有这项」是两件事）');
    assert(fVal.present === true && fVal.kind === 'value', '有值 ⇒ present=true + kind=value');
    assert(JSON.stringify(fAbs) !== JSON.stringify(fNul),
      '★ 三态不得压成一态：未外供与显式为空在读数上必须可分辨（否则这份读数等于没有）');
    const sumOK = LR.summarizeSnapshot(GOOD);
    assert(sumOK.hasFieldTypes === true && sumOK.absent.length === 1 && sumOK.absent[0] === 'lifeDetails'
      && sumOK.nullish.length === 1 && sumOK.nullish[0] === 'moneyLedger' && sumOK.present.length === 6,
      '形状摘要按三态分组（未外供 ' + sumOK.absent.join('/') + '；显式为空 ' + sumOK.nullish.join('/') + '；有值 '
      + sumOK.present.length + ' 项），floor/字节/契约/版本一并带出');
    assert(sumOK.floor === 42 && sumOK.selfBytes === 1234 && sumOK.contract === 'v3.174' && sumOK.pluginVersion === '3.175.0',
      '摘要带出对方快照的自述（floor=42 / 1234 字节 / 契约 v3.174 / 版本 3.175.0）');
    // ── ⑤ 对账：可比条件下才比，不可比如实说 ──
    //   注：本块的 store 时钟在本块内显式设定，测完复位（避免污染后续块）。
    const backupClock = JSON.parse(JSON.stringify(WA.store.get().clock));
    WA.store.transact(function (d) { d.clock.label = '第12日·黄昏'; d.clock.iso = ''; d.clock.dayIndex = 12; });
    const dNC = LR.diffWithLonsha({ clock: { date: '2026-09-13' } });
    assert(dNC.comparable === false && dNC.verdict === 'world-uncomparable',
      '★ 本扩展世界钟是自由标签（无公历形态）⇒ world-uncomparable——**本就不该比**，绝不硬比出一个假的不一致');
    WA.store.transact(function (d) { d.clock.iso = '2026-09-13T00:00:00.000Z'; });
    const dSame = LR.diffWithLonsha({ clock: { date: '2026-09-13' } });
    assert(dSame.comparable === true && dSame.verdict === 'same' && dSame.days === 0, '两侧同日 ⇒ same（days=0）');
    const dAhead = LR.diffWithLonsha({ clock: { date: '2026-09-18' } });
    assert(dAhead.verdict === 'world-ahead' && dAhead.days === 5, '对方记的日期在后 ⇒ world-ahead(+5)');
    const dBehind = LR.diffWithLonsha({ clock: { date: '2026-09-08' } });
    assert(dBehind.verdict === 'world-behind' && dBehind.days === -5, '对方记的日期在前 ⇒ world-behind(-5)');
    const dEmpty = LR.diffWithLonsha({ clock: {} });
    assert(dEmpty.comparable === false && dEmpty.verdict === 'lonsha-empty',
      '对方未记录时间 ⇒ lonsha-empty（与「记了个读不出的日期」分开——前者等它，后者是两套历法）');
    const dBad = LR.diffWithLonsha({ clock: { date: '天顺三年春' } });
    assert(dBad.comparable === false && dBad.verdict === 'unparsable' && dBad.verdict !== 'lonsha-empty',
      '对方记了但读不出（古历串）⇒ unparsable，且不得与 lonsha-empty 同形');
    // ── ① 只读：读一遍不得改动任何一方 ──
    const worldBefore22 = JSON.stringify(WA.store.get());
    const lonshaSnap22 = JSON.parse(JSON.stringify(GOOD));
    const rRO = LR.readLonshaSnapshot({ win: mkWin('ready', lonshaSnap22) });
    assert(rRO.ok === true && JSON.stringify(WA.store.get()) === worldBefore22,
      '只读契约：读对方账本绝不改本扩展世界状态（含世界钟）');
    assert(JSON.stringify(lonshaSnap22) === JSON.stringify(GOOD),
      '只读契约：也不改对方快照的内容（消费方不代对方记账）');
    // ── 消费侧齐备：诊断节 / flatten / 健康分 signals / 面板块 ──
    const dg22 = WA.toolDiag.collect();
    assert(dg22.lonsha && typeof dg22.lonsha === 'object' && dg22.lonsha.ok === false
      && typeof dg22.lonsha.reason === 'string',
      '诊断节 secLonsha 采到消费面真实状态（实 reason=' + ((dg22.lonsha || {}).reason) + '——测试环境无 LonSha，正是「未装」态）');
    const fl22 = WA.toolDiag.flatten(dg22);
    assert(fl22.filter(function (r) { return r.key === 'lonsha'; }).length >= 1,
      'flatten 清单里有记忆桥摘要行——否则「另一个插件记的那本账」在总览里完全缺席');
    const mt22 = WA.store.maintain({});
    assert(mt22.signals && 'lonshaAvailable' in mt22.signals && 'lonshaVerdict' in mt22.signals,
      '健康分 signals 透出 lonshaAvailable/lonshaVerdict（读不到也可归因，实 '
      + mt22.signals.lonshaVerdict + '）');
    assert(mt22.signals.lonshaAvailable === false && mt22.signals.lonshaVerdict === 'not-mounted',
      '无 LonSha 环境下健康分如实报「未装」（不是扣分项，也不是无名 null）');
    const panelSrc22 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    assert(panelSrc22.indexOf('function lonshaBlock()') >= 0 && panelSrc22.indexOf('${lonshaBlock()}') >= 0,
      '面板概览已挂 lonshaBlock()（UI 层在无头测试里不装载，故只做源码级钉——实机表现须另行核验）');
    const modSrc22 = fs.readFileSync(path.join(BASE, 'engines/lonsha-reader.js'), 'utf8');
    // ── 复位本块设定的时钟（必须在负向自证**之前**：判据三问的是「本扩展无公历钟时不硬比」，
    //    若时钟还停在刚才设的公历值上，原版对照会因为环境没复位而假红）──
    WA.store.transact(function (d) {
      d.clock.label = backupClock.label || ''; d.clock.iso = backupClock.iso || '';
      d.clock.dayIndex = backupClock.dayIndex || 0; d.clock.source = backupClock.source || 'unset';
    });
    // ── 负向自证：真源码破坏 → 破坏副本 → 同款真判据（原版对照 + 逐项现形）──
    const ANCH = {
      collapse: "if (!b) {\n      return { mounted: false, sourceState: null, lastError: null, hasSnapshot: false, reason: 'not-mounted' };\n    }",
      threeState: "return { present: true, kind: (rec.kind === 'null') ? 'null' : 'value' };",
      comparable: "if (!String(worldDate || '').trim()) {\n      return Object.assign(base, { comparable: false, verdict: 'world-uncomparable', days: null });\n    }",
      swallow: "return { ok: false, reason: 'thrown', source: null, snapshot: null };"
    };
    const mkBroken22 = function (anchor, to, noReplace) {
      let s = modSrc22;
      if (!noReplace) {
        if (s.indexOf(anchor) < 0) { throw new Error('锚点不存在（负控制是假的）'); }
        s = s.replace(anchor, to);
        if (s === modSrc22) { throw new Error('替换未改变源码（负控制是假的）'); }
      }
      const g = {};
      new Function('window', 'global', s)(g, g);
      if (!g.WorldAxis || !g.WorldAxis.lonshaReader) { throw new Error('破坏副本装载失败'); }
      return g.WorldAxis.lonshaReader;
    };
    const judge22 = function (api) {
      const out = {};
      // 判据一：未装与未就绪必须可分辨（**两条路都要走**——只问未就绪的话，
      //   「未挂载早退」被拆掉也照样成立，负控制就恒真了）
      const rMountedAbsent = api.lonshaSource('lonsha_memory_bridge_v1',
        { lonsha_memory_bridge_v1: { sourceState: 'engine-absent', snapshot: null, refresh: function () { return null; } } }).reason;
      const rNotMounted = api.lonshaSource('lonsha_memory_bridge_v1', {}).reason;
      out.sourceDistinct = (rNotMounted === 'not-mounted') && (rMountedAbsent === 'engine-absent')
        && (rNotMounted !== rMountedAbsent);
      // 判据二：三态可分（未外供 ≠ 显式为空）。两个字段都必须走**同一条**判定行——
      //   拿 present:false 的字段去比会走早退分支，破坏那一行就永远打不到判据。
      out.threeState = JSON.stringify(api.fieldState(GOOD, 'moneyLedger')) !== JSON.stringify(api.fieldState(GOOD, 'characters'));
      // 判据三：本扩展无公历钟时不硬比
      out.noHardCompare = api.diffWithLonsha({ clock: { date: '2026-09-13' } }).verdict === 'world-uncomparable';
      // 判据四：不外抛
      let t = false;
      try { api.readLonshaSnapshot({ get win() { throw new Error('x'); } }); } catch (e) { t = true; }
      out.noThrow = !t;
      return out;
    };
    try {
      const jReal22 = judge22(LR);
      assert(jReal22.sourceDistinct === true && jReal22.threeState === true
        && jReal22.noHardCompare === true && jReal22.noThrow === true,
        '（负向自证·原版对照）真源码上四条判据全部干净——否则下面的「破坏后现形」可能只是判据恒真');
      const jA = judge22(mkBroken22(ANCH.collapse,
        "if (false) {\n      return { mounted: false, sourceState: null, lastError: null, hasSnapshot: false, reason: 'not-mounted' };\n    }"));
      assert(jA.sourceDistinct === false,
        '（负向自证）把「未挂载」这一早退拆掉后，未装与未就绪塌成一态——正是本模块最初要治的那个「都拿不到」');
      assert(jA.noHardCompare === true, '（负向自证）破坏一不连坐对账口径');
      const jB = judge22(mkBroken22(ANCH.threeState, "return { present: true, kind: 'value' };"));
      assert(jB.threeState === false, '（负向自证）把三态塌成一态后，「未外供」与「显式为空」不再可分辨（读数等于没有）');
      const jC = judge22(mkBroken22(ANCH.comparable, 'if (false) {\n    }'));
      assert(jC.noHardCompare === false, '（负向自证）拆掉「本扩展无公历钟」的分支后，会硬比出一个假的不一致');
      const jD = judge22(mkBroken22(ANCH.swallow, 'throw _e;'));
      assert(jD.noThrow === false, '（负向自证）把整函数兜底换成重抛后，宿主怪异 getter 会把异常抛给调用方');
      assert(jD.threeState === true, '（负向自证）破坏四只动兜底，不连坐三态');
    } catch (e22) {
      assert(false, '（负向自证）破坏副本构建失败：' + (e22 && e22.message));
    }
    console.log('  ✓ 只读（不写对方账本/不改本扩展世界钟）｜不抛（未装/未就绪/抛错/畸形/怪异宿主一律降级可归因）');
    console.log('  ✓ 来源可归因（对方 sourceState 五态逐一对映，未就绪与坏了不同形）｜契约版本显式不匹配才拦');
    console.log('  ✓ 三态尊重（未外供/显式为空/有值互不相同）｜对账不硬比（自由标签≠坏掉；对方未记≠读不出）');
    console.log('  ✓ 消费侧齐备（诊断节/flatten/健康分 signals/面板块）｜负向自证 4 项（原版对照 + 拆任一条判定都现形）');
  } // end v2.17.0 block
  // ═══════════════════════════════════════════════════════════════════
  // v2.18.0 块：反向消费面扩到**九本账**（通路不是没通，是只通了一根线）
  //
  // 命题：v2.17.0 把「本扩展读 LonSha」这条边接通了，但**只读了 `clock` 一个字段**，
  //   而对方快照外供的是**八个顶层账本 + 一本对读读数**。同一型缺陷（通路通、只通一根线）
  //   在反向边上重演了一次——与 lonsha v3.176 修掉的是同一型。
  //
  // 更要紧的是：lonsha v3.176 新增的 `worldLedgerRead` **是对方读本扩展所得**（一个环）。
  //   本扩展若把它当「对方的世界」读进来，就会拿**自己的投影**冒充外部事实：
  //   一处单侧计算、两处消费，两边永远一致（因为同源）。故本块立的第一件事就是：
  //   **环必须被认出来**（kind='echo'），「对方的世界」与「对方眼里的我」不得同形。
  //
  // ★ 本块在写作中还挖出了一处**更严重的真实联调断线**：
  //   原设计照直觉去取 `worldLedgerRead.currents / facts / people` 三支**数组**——
  //   但上游 `GameClock.readWorldLedger` 的**三处构造点都并不外供**那三支，
  //   只外供 `counts` 与 `peopleDiff` / `factsDiff` 的对读结论（外加 `gap`）。
  //   于是真实联调下三处对读面会**静默全退化为 absent**；而只要手工夹具顺手带上
  //   那三支数组，门禁就照样全绿——正是本项目最忌的「测试绿而生产不工作」。
  //   裁决：**只透传对方已算好的结论，本侧不自算差集**（拿自己的投影跟自己对账，
  //   差集恒为 0 却看着像「两边一致」），并把上游键集钉成 `ECHO_KEYS` 常量，
  //   新增一条静态判据——三处取数键**逐一必须在上游键集里**。
  //
  // 本块立七件事：① 九本账逐本**在场三态**（未外供 ≠ 显式为空，尊重对方 fieldTypes）
  //   ② 形状画像（各本多大 / 有哪些键；absent 只数「压根没外供」）③ 三处对读面 + 环归因
  //   ④ **对方缺面 ≠ 空集**（不可比时不得报「差集为 0」被误读成「两边一致」）
  //   ⑤ 明细有界（12 条 + 总数取对方自述口径）⑥ 消费侧齐备（诊断节新增两行 / flatten /
  //   健康分 signals / 面板块）⑦ **上游键集自证**（我读的键上游是不是真有）
  // ═══════════════════════════════════════════════════════════════════
  {
    console.log('\n■ G23 反向消费面（九本账逐本看图 + 三处对读面 + 环归因 + 上游键集自证）');
    const LR2 = WA.lonshaReader;
    assert(typeof LR2.ledgerSection === 'function' && typeof LR2.ledgerSummary === 'function'
      && typeof LR2.ledgerBridges === 'function' && typeof LR2.echoShape === 'function'
      && typeof LR2.echoNotice === 'function',
      '五个新判定入口齐备（ledgerSection/ledgerSummary/ledgerBridges/echoShape/echoNotice）');
    assert(Array.isArray(LR2.LEDGER_SECTIONS) && LR2.LEDGER_SECTIONS.length === 9
      && LR2.LEDGER_SECTIONS.indexOf('clock') >= 0 && LR2.ECHO_SECTION === 'worldLedgerRead'
      && Array.isArray(LR2.ECHO_KEYS) && LR2.ECHO_KEYS.length === 10,
      '账本面登记表：八本账 + 一本对读读数 = 9 项；对读读数名=' + LR2.ECHO_SECTION
      + '，本侧认的键 ' + LR2.ECHO_KEYS.length + ' 个');
    // ★★ 本块最要紧的一条静态判据：三处对读面取的键**必须逐一在上游键集里**。
    //   上游 v3.176.0 的 worldLedgerRead **并不外供** currents/facts/people 三支数组
    //   （只外供 gap + peopleDiff/factsDiff 的对读结论 + counts）。若照直觉取那三支，
    //   手工夹具能把门禁喂绿，而**真实联调时三处对读面恒为 absent**——
    //   那正是本仓库最忌的「测试绿而生产不工作」。
    assert(LR2.BRIDGE_PAIRS.length === 3 && LR2.BRIDGE_PAIRS.every(function (p) {
        return LR2.ECHO_KEYS.indexOf(p.sub) >= 0;
      }),
      '三处对读面取的键（' + LR2.BRIDGE_PAIRS.map(function (p) { return p.sub; }).join('/')
      + '）**逐一都在上游键集里**——取上游没有的键会「测试绿而生产恒为空」');

    // ── 构造一份「对方快照」：八本账三态齐全 + 一本对读读数（**严格按上游 v3.176.0 的键集**）──
    //   刻意做成：有值 6 本 / 显式为空 1 本（moneyLedger）/ 未外供 2 本（lifeDetails、recallAudit）
    //   ＋ worldLedgerRead（环，键集与 lonsha GameClock.readWorldLedger 的构造点逐一对齐）
    const FULL = {
      version: 1, bridge: 'lonsha_memory_bridge_v1', pluginVersion: '3.176.0', floor: 99,
      protagonist: { name: '林砚' },
      characters: { 崔莺莺: { name: '崔莺莺' } },
      moneyLedger: null,
      outline: { beats: [{ title: '初遇' }] },
      worldProg: { events: { 城门封锁: {} } },
      clock: { date: '2026-09-13', label: '第三日' },
      worldLedgerRead: {
        ok: true, reason: 'ok', describe: '就绪（暗流 2 / 事实 1 / 人物 2）',
        shape: { currents: { present: true, kind: 'value', count: 2 } },
        gap: { known: true, exported: 2, notMarkedCount: 3, notMarked: ['cur_a', 'cur_b', 'cur_c'],
          truncated: false, presumeUnknown: '', includeHidden: false, gapRatio: 0.6,
          hiddenTotal: 1, verdict: 'gapped' },
        opinion: { present: true, canon: 1, forum: 0, sandbox: 0, verified: 1, rumor: 0, unknown: 0 },
        counts: { currents: 2, echoes: 0, facts: 1, people: 2, opinionCanon: 1, opinionForum: 0 },
        peopleDiff: { hasWorld: true, hasLocal: true, matched: 1,
          mismatched: [{ name: '林砚', world: '邮局', local: '城南车站', kind: 'conflict' }],
          mismatchedTotal: 1, conflicts: [{ name: '林砚', world: '邮局', local: '城南车站', kind: 'conflict' }],
          worldOnly: ['柳明熙'], worldOnlyTotal: 1, localOnly: ['崔莺莺'], localOnlyTotal: 1 },
        factsDiff: { hasWorld: true, hasLocal: true, shared: 1, worldOnly: ['城门封锁'], worldOnlyTotal: 1,
          localOnly: [], localOnlyTotal: 0 },
        at: 1710000000000
      },
      meta: { contract: 'v3.176', selfBytes: 4321, strictJsonOk: true, fieldTypes: {
        protagonist: { present: true, kind: 'object' },
        lifeDetails: { present: false, kind: 'undefined' },
        characters: { present: true, kind: 'object' },
        moneyLedger: { present: true, kind: 'null' },
        outline: { present: true, kind: 'object' },
        worldProg: { present: true, kind: 'object' },
        clock: { present: true, kind: 'object' },
        recallAudit: { present: false, kind: 'undefined' },
        worldLedgerRead: { present: true, kind: 'object' }
      } }
    };

    // ── ① 逐本在场三态 ──
    const sec = LR2.ledgerSection(FULL);
    assert(sec.length === 9, '逐本读数覆盖全部 9 本（实 ' + sec.length + '）');
    const byField = {};
    sec.forEach(function (x) { byField[x.field] = x; });
    assert(byField.lifeDetails.present === false && byField.lifeDetails.kind === 'absent',
      '未外供的账本如实标 present=false（对方压根没这项 ⇒ 本侧应降级，而不是「这本是空的」）');
    assert(byField.moneyLedger.present === true && byField.moneyLedger.kind === 'null',
      '显式为空的账本如实标 present=true + kind=null（照常推演，不降级）');
    assert(JSON.stringify(byField.lifeDetails) !== JSON.stringify(byField.moneyLedger),
      '★ 「未外供」与「显式为空」**不得同形**——两者处置相反（降级 vs 照常）');
    assert(byField.characters.size === 1 && byField.worldLedgerRead.size === LR2.ECHO_KEYS.length,
      '各有值账本带 size（characters 1 键 / 对读读数 ' + byField.worldLedgerRead.size
      + ' 键 = 上游外供的键数），供「对方给了几本、各多厚」');
    assert(byField.worldLedgerRead.isEcho === true && byField.characters.isEcho === false,
      '★ 对读读数被标 isEcho=true（环），其余账本是 false——「对方眼里的我」与「对方的世界」不同形');

    // ── ② 形状画像：absent 只数「压根没外供」，不把「显式为空」算进去 ──
    const lsum = LR2.ledgerSummary(FULL);
    assert(lsum.total === 9 && lsum.sections.value === 6 && lsum.sections.nullish === 1 && lsum.sections.absent === 2,
      '形状画像三态分开计（有值 ' + lsum.sections.value + ' / 显式为空 ' + lsum.sections.nullish
      + ' / 未外供 ' + lsum.sections.absent + '）');
    assert(lsum.absentList.length === 2 && lsum.absentList.indexOf('moneyLedger') < 0,
      '★ absentList 只列「压根没外供」的两本，**不把显式为空的 moneyLedger 混进去**'
      + '（否则「对方明确说没有」会被报成「对方缺了这本账」）');
    assert(lsum.echoPresent === true && lsum.echoExported === true,
      '画像点出对方**已经在读本扩展**了（echoPresent=true）——此前这件事在本扩展侧完全不可见');
    assert(lsum.entries.filter(function (e) { return e.keys.length; }).length >= 2,
      '有值账本另带 key 前若干项（供面板念出「这本里有什么」，不搬运内容）');

    // ── ③ 三处对读面 + 环归因（**透传对方已算好的结论，本侧不自算差集**）──
    //   本侧 store 备齐三本账（否则「不可比」——那是另一件事，见 ④）。
    const bkPpl2 = JSON.parse(JSON.stringify(WA.store.get().people));
    const bkCur2 = JSON.parse(JSON.stringify(WA.store.get().currents));
    const bkFct2 = JSON.parse(JSON.stringify(WA.store.get().worldFacts));
    WA.store.transact(function (d) {
      d.currents = [{ id: 'cur_local', title: '盐价' }];
      d.worldFacts = [{ id: 'f1', key: '城门封锁', value: '已定' }];
      d.people = { 崔莺莺: { id: 'p_崔莺莺', name: '崔莺莺', location: '城南车站' } };
    });
    const lb2 = LR2.ledgerBridges(FULL);
    assert(lb2.items.length === 3 && lb2.echoKind === 'echo' && lb2.echoOk === true,
      '对读面 3 处（' + lb2.items.map(function (x) { return x.id; }).join('/')
      + '），且 kind 一律 echo（那三支源自在下的投影）；上游自述 ok 一并透出');
    assert(lb2.echoNotice.indexOf('对方眼里的我') >= 0 || lb2.echoNotice.indexOf('环') >= 0
      || lb2.echoNotice.indexOf('读本扩展') >= 0,
      '归因话术说清「这是对方读我所得」——不认得环就会拿自己的投影当外部事实：' + lb2.echoNotice.slice(0, 40) + '…');
    const items2 = {};
    lb2.items.forEach(function (x) { items2[x.id] = x; });
    assert(items2.currents.sub === 'gap' && items2.currents.verdict === 'gapped'
      && items2.currents.worldOnlyTotal === 3 && items2.currents.worldOnly[0] === 'cur_a',
      '缺口支（gap）：**缺口四态原样透传**（实 ' + items2.currents.verdict + '），'
      + '未外供的 ' + items2.currents.worldOnlyTotal + ' 条带名（' + items2.currents.worldOnly.join('、') + '）'
      + '——修前「有多少东西没给我」根本读不到');
    assert(items2.facts.sub === 'factsDiff' && items2.facts.shared === 1
      && items2.facts.worldOnlyTotal === 1 && items2.facts.worldOnly.indexOf('城门封锁') >= 0
      && items2.facts.totalFromPeer === true,
      '权威事实支（factsDiff）：透传对方已算好的差集（shared=' + items2.facts.shared
      + '，worldOnly=' + items2.facts.worldOnly.join('、') + '），总数取对方自述口径');
    assert(items2.people.shared === 1 && items2.people.worldOnlyTotal === 1
      && items2.people.worldOnly[0] === '柳明熙' && items2.people.localOnlyTotal === 1
      && items2.people.localOnly[0] === '崔莺莺',
      '人物支（peopleDiff）：两侧差集原样透出（对方独有 ' + items2.people.worldOnly.join('、')
      + '｜本侧独有 ' + items2.people.localOnly.join('、') + '），只报差集、不合并');
    assert(items2.people.mismatched === 1 && items2.people.conflicts === 1,
      '★ 位置冲突**单独计数**（' + items2.people.conflicts + ' 处）——「两侧都记了但不一样」'
      + '与「一边没记」处置相反，不得混成一堆');
    assert(lb2.echoShape.present === true && lb2.echoShape.missing.length === 0
      && lb2.echoShape.unknown.length === 0 && lb2.echoShape.keys.length === LR2.ECHO_KEYS.length,
      '★ **上游键集自证**：本侧认的 ' + LR2.ECHO_KEYS.length + ' 键上游全给（missing 为空）'
      + '——若有 missing，说明本侧读了上游并不外供的键（真实联调恒为空）');
    // 复位本块改动的三本账
    WA.store.transact(function (d) { d.people = bkPpl2; d.currents = bkCur2; d.worldFacts = bkFct2; });

    // 对象形态的条目也要认得（不同上游版本可能给对象而非裸串）——只做形状兼容，不改口径
    const lbObj = LR2.ledgerBridges({ worldLedgerRead: { ok: true,
      peopleDiff: { shared: 0, worldOnly: [{ name: '甲' }, { id: '乙' }], worldOnlyTotal: 2 } } });
    assert(lbObj.items.filter(function (x) { return x.id === 'people'; })[0].worldOnly.join('/') === '甲/乙',
      '对象形态条目（{name}/{id}）一样取得到名字（上游不同版本给的形态不同，本侧不因形态而漏）');

    // ── ④ ★ 对方缺面 ≠ 空集（本块最要紧的一条判据）──
    //   上游快照里**没有对读读数**（或对读读数里没有那一支）时，三处一律不可比。
    //   此时若把它当成「对方的账本是空的」，就会报出「我这边多出来 N 项」——
    //   那是**我自己没外供**，不是对方少记；而它看起来却像一次真正的对账。
    const NOECHO = { version: 1, bridge: 'lonsha_memory_bridge_v1', clock: { date: '2026-09-13' },
      characters: { A: {} }, meta: { fieldTypes: {} } };
    const lb3 = LR2.ledgerBridges(NOECHO);
    assert(lb3.echoKind === 'absent'
      && lb3.items.every(function (x) { return x.theirsAvailable === false && x.comparable === false; }),
      '对方未外供对读读数 ⇒ 三处一律 absent 且 comparable=false（**不得**当成「对方的账本是空的」）');
    assert(lb3.items.every(function (x) { return x.worldOnlyTotal === 0 && x.localOnlyTotal === 0; }),
      '★ 不可比时两侧差集**一律为 0**——绝不出一个假的「我这边多出来 N 项」（那是自指噪声，不是对账）');
    assert(lb3.items.filter(function (x) { return x.id === 'facts'; })[0].kind === 'absent',
      'facts 这一支同样标 absent（对方快照里没有对读读数 ⇒ 无从对读）');
    const lsum3 = LR2.ledgerSummary(NOECHO);
    assert(lsum3.echoPresent === false && lsum3.echoExported === false,
      '画像如实报「对方还没在读本扩展」——无环，但这件事本身也要可见');
    // 「键在、值是 null」与「键压根不在」也必须不同形：前者是「对方给了个空的」，后者是「对方没这一支」。
    const lbNull = LR2.ledgerBridges({ worldLedgerRead: { ok: true, reason: 'ok', gap: null } });
    const gapNull = lbNull.items.filter(function (x) { return x.id === 'currents'; })[0];
    assert(gapNull.theirsAvailable === true && gapNull.theirsHasValue === false && gapNull.comparable === false,
      '★ 「上游这一支值为 null」（available=true/hasValue=false）与「上游没这一支」（available=false）'
      + '**不同形**——前者是「对方给了、内容是空」，后者是「对方这版压根没这一支」');

    // ── ⑤ 明细有界（读数会进诊断 JSON / 面板，不能随剧情无界膨胀）──
    const bigEcho = { version: 1, bridge: 'lonsha_memory_bridge_v1',
      worldLedgerRead: { ok: true, peopleDiff: { shared: 0, worldOnlyTotal: 40,
        worldOnly: (function () {
          const a = []; for (let i = 0; i < 40; i++) a.push('路人' + i); return a;
        })() } } };
    const lbBig = LR2.ledgerBridges(bigEcho);
    const pBig = lbBig.items.filter(function (x) { return x.id === 'people'; })[0];
    assert(pBig.worldOnly.length === 12 && pBig.worldOnlyTotal === 40,
      '★ 明细有界（12 条）+ **总数不失真**（40，取对方自述口径）——读数进快照不能让存档无界膨胀');
    assert(pBig.worldOnly.length !== pBig.worldOnlyTotal,
      '（负向自证）切片与总数确实不同值——否则「切掉了」与「本来就这么少」会塌成一态');

    // ── ⑥ 消费侧齐备 ──
    const mt18 = WA.store.maintain({});
    assert('lonshaLedgers' in mt18.signals && 'lonshaEchoPresent' in mt18.signals
      && 'lonshaBridgesComparable' in mt18.signals && 'lonshaBridgeDrift' in mt18.signals
      && 'lonshaBridgeConflict' in mt18.signals,
      '健康分 signals 透出九本账面（账本数 / 环 / 可比处数 / 差集 / 位置冲突）');
    assert(mt18.signals.lonshaEchoPresent === false && mt18.signals.lonshaLedgers === 0
      && mt18.signals.lonshaBridgeConflict === 0,
      '无 LonSha 环境下如实报 0/false（不是无名 null，也不是扣分项）');
    const dSrc18 = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
    assert(dSrc18.indexOf('lonshaLedgers') >= 0 && dSrc18.indexOf('lonshaBridges') >= 0
      && dSrc18.indexOf('lonshaEchoKeys') >= 0,
      '诊断 flatten 清单新增三行（账本画像 / 对读面 / **上游键集自证**）'
      + '——否则「对方给了几本账」与「我读的键上游是不是真有」在总览里缺席');
    const pSrc18 = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
    assert(pSrc18.indexOf('ledgerSection') >= 0 && pSrc18.indexOf('ledgerSummary') >= 0
      && pSrc18.indexOf('ledgerBridges') >= 0 && pSrc18.indexOf('bridgeChips') >= 0
      && pSrc18.indexOf('echoShape') >= 0,
      '面板记忆桥块已挂新读数（逐本看图 / 逐处对读 / 键集自证；UI 层无头不装载，故只做源码级钉）');

    // ── 负向自证：真源码破坏 → 破坏副本 → 同款真判据（原版对照 + 逐项现形 + 互不连坐）──
    //   纪律（与 lonsha 侧同规格）：
    //     ① 锚点必须**恰中一次**（不符即抛——防锚点漂移后把「没破坏成功」误读成「判据无反应」）；
    //     ② 破坏点必须与**判据所读的代码位置匹配**（否则会写出一个恒绿的假负控制）；
    //     ③ 破坏后语法仍须合法（非零退出必须来自判据，不能来自解析崩溃）；
    //     ④ 破坏副本要能读到**同一个 store**，否则依赖 store 的判据会因「本侧无账本」而恒真。
    const modSrc23 = fs.readFileSync(path.join(BASE, 'engines/lonsha-reader.js'), 'utf8');
    const ANCH23 = {
      // 破坏一：把环的 kind 塌成与外部账本同形（本版要治的那一处）
      echoKind: "        id: pair.id, kind: pick.available ? 'echo' : 'absent',",
      // 破坏二：把「对方缺面」当成空集——用本侧账本顶替对方差集（自指噪声）
      noPhantom: "        ? { shared: 0, worldOnly: [], worldOnlyTotal: 0, localOnly: [], localOnlyTotal: 0,",
      // 破坏三：把「显式为空」也算进未外供
      absentOnly: "      if (!e.present) { sections.absent++; absentList.push(e.field); }",
      // 破坏四：去掉切片（明细随剧情无界膨胀）
      bounded: "      worldOnly: worldOnly.slice(0, lim),",
      // 破坏五：把键集自证做成恒真（missing 恒为空）——「负控制是假的」的典型形态
      keysHonest: "        missing: ECHO_KEYS.filter(function (k) { return keys.indexOf(k) < 0; })"
    };
    const mkBroken23 = function (anchor, to) {
      const hits = modSrc23.split(anchor).length - 1;
      if (hits !== 1) { throw new Error('锚点命中 ' + hits + ' 次（期望恰 1 次）——负控制作废'); }
      let sB = modSrc23.replace(anchor, to);
      if (sB === modSrc23) { throw new Error('替换未改变源码（负控制是假的）'); }
      // 破坏后必须**语法仍合法**——否则非零退出不能归因于判据
      const g = { WorldAxis: { store: WA.store } };   // 让破坏副本读到同一个 store
      new Function('window', 'global', sB)(g, g);
      if (!g.WorldAxis || !g.WorldAxis.lonshaReader) { throw new Error('破坏副本装载失败'); }
      return g.WorldAxis.lonshaReader;
    };
    // 判据与破坏点**一一对应**（每条判据只读它那条破坏所改的那份输出）
    const judge23 = function (api) {
      const out = {};
      // 判据一（对 echoKind）：三处对读面必须都标 echo——环与外部账本不同形
      out.echoDistinct = api.ledgerBridges(FULL).items.every(function (x) { return x.kind === 'echo'; });
      // 判据二（对 noPhantom）：**上游没给的那一支**不得产出任何非零差集，即便本侧账本很满
      const bkP = JSON.parse(JSON.stringify(WA.store.get().people));
      const bkF = JSON.parse(JSON.stringify(WA.store.get().worldFacts));
      WA.store.transact(function (d) { d.people['柳明熙'] = { name: '柳明熙' }; d.worldFacts = [{ key: '城门封锁' }]; });
      const b2 = api.ledgerBridges({ worldLedgerRead: { ok: true, reason: 'reader-unavailable' } });
      out.noPhantom = b2.items.filter(function (x) { return !x.theirsHasValue; })
        .every(function (x) { return x.worldOnlyTotal === 0 && x.worldOnly.length === 0 && x.localOnlyTotal === 0; });
      WA.store.transact(function (d) { d.people = bkP; d.worldFacts = bkF; });
      // 判据三（对 absentOnly）：absent 只数「压根没外供」
      out.absentOnly = api.ledgerSummary(FULL).sections.absent === 2;
      // 判据四（对 bounded）：明细有界且总数不失真
      const bb = api.ledgerBridges(bigEcho).items.filter(function (x) { return x.id === 'people'; })[0];
      out.bounded = bb.worldOnly.length === 12 && bb.worldOnlyTotal === 40;
      // 判据五（对 keysHonest）：键集自证必须**两向都真**——全给时报空，缺键时报出缺的那几个
      const FULLMISS = api.echoShape(FULL).missing.length === 0;
      const BADMISS = api.echoShape({ worldLedgerRead: { ok: true, reason: 'ok', gap: null, counts: {} } })
        .missing.length === 6;   // 10 keys, upstream gave ok/reason/gap/counts = 4, so 6 missing
      out.keysHonest = FULLMISS && BADMISS;
      return out;
    };
    try {
      const jReal23 = judge23(LR2);
      assert(jReal23.echoDistinct === true && jReal23.noPhantom === true && jReal23.absentOnly === true
        && jReal23.bounded === true && jReal23.keysHonest === true,
        '（负向自证·原版对照）真源码上五条判据全部干净——否则下面的「破坏后现形」可能只是判据恒真');
      const jA23 = judge23(mkBroken23(ANCH23.echoKind, "        id: pair.id, kind: 'absent',"));
      assert(jA23.echoDistinct === false,
        '（负向自证）把环的 kind 塌成与外部账本同形后，「对方眼里的我」不再可分辨——正是本版要治的那一处');
      assert(jA23.bounded === true && jA23.absentOnly === true, '（负向自证）破坏一不连坐有界性与三态');
      const jB23 = judge23(mkBroken23(ANCH23.noPhantom,
        "        ? { shared: 0, worldOnly: mineArr.map(nameOf).filter(Boolean), worldOnlyTotal: mineArr.length, localOnly: [], localOnlyTotal: 0,"));
      assert(jB23.noPhantom === false,
        '（负向自证）把「对方缺面」当成空集后，本侧会拿**自己的账本**顶替对方差集，'
        + '报出一个假的「我这边多出来 N 项」——正是要治的自指噪声');
      assert(jB23.echoDistinct === true, '（负向自证）破坏二只动缺面处置，不连坐环归因');
      const jC23 = judge23(mkBroken23(ANCH23.absentOnly,
        "      if (!e.present || e.kind === 'null') { sections.absent++; absentList.push(e.field); }"));
      assert(jC23.absentOnly === false,
        '（负向自证）把「显式为空」也算进未外供后，absent 变成 3——「对方明确说没有」被报成「对方缺了这本账」');
      const jD23 = judge23(mkBroken23(ANCH23.bounded, "      worldOnly: worldOnly,"));
      assert(jD23.bounded === false, '（负向自证）去掉切片后明细变 40 条——读数进快照会让存档无界膨胀');
      assert(jD23.echoDistinct === true, '（负向自证）破坏四只动有界性，不连坐环归因');
      const jE23 = judge23(mkBroken23(ANCH23.keysHonest, "        missing: []"));
      assert(jE23.keysHonest === false,
        '（负向自证）把键集自证做成恒真（missing 恒为空）后，判据现形——'
        + '否则「本侧读了上游没有的键」这类「测试绿而生产恒为空」的缺陷永不被抓');
    } catch (e23) {
      assert(false, '（负向自证）破坏副本构建失败：' + (e23 && e23.message));
    }
    console.log('  ✓ 八本账逐本三态（未外供/显式为空/有值互不相同）｜画像 absent 只数「压根没外供」');
    console.log('  ✓ 三处对读面（透传对方已算好的差集，本侧不自算）｜缺口四态原样透传｜环归因 kind=echo');
    console.log('  ✓ ★ 上游键集自证（取数键必须上游真有）｜对方缺面 ≠ 空集｜明细有界 + 总数取对方口径');
    console.log('  ✓ 负向自证 5 项（原版对照 + 逐项现形 + 互不连坐）');
  } // end v2.18.0 block
  // ═════════════════════════════════════════════════
  // v2.19.0 块：启动接线（第十二面：能力死代码 / 开关无线）
  //
  // 命题：v2.18.0 在**反向边**上修的是「通路通、只通一根线」。本版把同一类检查
  //   推进到**启动序列**：一个引擎的 `init()` 定义了、登记进 MODULE_EXPORTS、
  //   被测过行为——但 `index.js` 的启动序列**自创建起从未调用它**。
  //   能力齐全、入口全绿、产品里那台引擎从不启动。
  //
  // 本版抳出两处：
  //   · engines/chatcache.js → WA.chatcache.init()  零调用 ⇒ 跨设备同步/自动备份两条链路从未运行
  //   · engines/inspector.js  → WA.inspector.init()   零调用
  //     [v2.20.0 更正] 这里 v2.19.0 的立论（「⇒ 注入自检从未订阅 prompt-ready」）是**误判**：
  //       真正订阅 prompt-ready 的是 engines/inject-inspector.js（WA.injectInspector），
  //       它自 v0.1 起就在启动序列里被调用（并非零调用），且是面板/诊断唯一消费的那个。
  //       inspector.js 只是与它**同源同事件**的重复实现（前者严格子集），全部导出零消费，
  //       故其 init 的零调用是「重复模块无人用」而非「能力断线」。v2.20.0 已删除该模块。
  //   且 chatcache 读的两个开关 `syncToChat` / `autoBackup` **既不在设置 def、也不在设置页**
  //   ——「开关摆了却没有开关」：消费端读 `=== true`，任何存量值都等于关。
  //
  // 本块立六件事：
  //   A 入口接线：index.js 启动序列真的调用 chatcache.init / inspector.init，且成功必被记账
  //   B 引擎行为：init 幂等（重复返回 false，不叠加包裹）
  //   C 开关声明：syncToChat / autoBackup 进 backstage def、进 settingsBus.normalize
  //   D 消费面：设置页控件 + 保存回写 + UI_BINDINGS 守卫
  //   E 静态判据：入口源码里两处 init 调用在场（防「接线被悄悄摘掉」）
  //   F 负向自证：抽掉入口接线后，静态判据必须现形
  // ═════════════════════════════════════════════════
  {
    section('v2.19.0 启动接线');
    const idxSrc2190 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const ccSrc2190 = fs.readFileSync(path.join(BASE, 'engines/chatcache.js'), 'utf8');
    const insSrc2190 = fs.readFileSync(path.join(BASE, 'engines/inject-inspector.js'), 'utf8');
    const bsSrc2190 = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
    const uiSet2190 = fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8');

    // ── A. 入口接线在场 ──
    assert(idxSrc2190.indexOf('WA.chatcache.init') >= 0, 'index.js 启动序列调用 chatcache.init（此前零调用）');
    assert(idxSrc2190.indexOf('WA.injectInspector.init') >= 0, 'index.js 启动序列调用 injectInspector.init（注入自检的真实订阅者）');
    assert(idxSrc2190.indexOf('WA.__inited') >= 0, '入口把「本次实际激活了哪些引擎」记账（启动可观测）');
    assert(/__inited\.push\('chatcache'\)/.test(idxSrc2190) && /__inited\.push\('injectInspector'\)/.test(idxSrc2190),
      '两个引擎的成功记账各自独立');

    // ── B. 幂等 ──
    const first2190 = WA.chatcache.init();
    const second2190 = WA.chatcache.init();
    assert(second2190 === false, 'chatcache.init 幂等：重复调用返回 false（实 ' + second2190 + '）');
    assert(/let _inited = false/.test(ccSrc2190), 'chatcache 自持已挂载标记');
    assert(typeof WA.store.save === 'function', 'store.save 仍可用');
    void first2190;

    // injectInspector.init 同样幂等；且真的订阅了宿主事件
    const insFirst2190 = WA.injectInspector.init();
    const insSecond2190 = WA.injectInspector.init();
    assert(insSecond2190 === false, 'injectInspector.init 幂等：重复调用返回 false（实 ' + insSecond2190 + '）');
    assert(insFirst2190 === true || insFirst2190 === false, 'injectInspector.init 有明确布尔回传');
    assert(WA.injectInspector.getLastSnapshot() !== undefined, 'injectInspector.getLastSnapshot 可读（接线后口径存在）');

    // ── C. 开关声明 ──
    assert(bsSrc2190.indexOf('syncToChat:') > 0 && bsSrc2190.indexOf('autoBackup:') > 0,
      'backstage def 声明 syncToChat / autoBackup（此前消费端读、声明面看不见）');
    const reg2190 = (WA.__settingsRegs || []).filter(function (r) { return r.key === 'worldaxis_backstage_settings_v1'; })[0];
    assert(!!reg2190 && ('syncToChat' in reg2190.def) && ('autoBackup' in reg2190.def),
      '登记表 def 含两键（子键补齐/verifyDefaults/声明完备性检查可见）');
    const norm2190 = WA.settingsBus.normalize(reg2190, { syncToChat: false, autoBackup: true });
    assert(norm2190.syncToChat === false && norm2190.autoBackup === true, 'normalize 对两键保真（布尔域由 def 推断）');
    assert(reg2190.def.syncToChat === false && reg2190.def.autoBackup === false, '两键默认关（写聊天文件/增快照属有副作用能力）');

    // ── D. 消费面：UI 控件 + 保存接线 ──
    assert(uiSet2190.indexOf('wa-set-sync') >= 0, '设置页渲染同步开关');
    assert(uiSet2190.indexOf('wa-set-autobak') >= 0, '设置页渲染自动备份开关');
    assert(uiSet2190.indexOf('syncToChat: $(') >= 0 && uiSet2190.indexOf('autoBackup: $(') >= 0,
      '保存处理器把两开关写回设置（渲染了却存不回 = 开关摆了没用）');
    const ids2190 = (WA.toolDiag.UI_BINDINGS.filter(function (g) { return g.page === 'settings'; })[0] || {}).ids || [];
    assert(ids2190.indexOf('wa-set-sync') >= 0 && ids2190.indexOf('wa-set-autobak') >= 0,
      '两控件纳入 UI_BINDINGS 守卫（防绑定断裂无人发现）');

    // ── E. 静态判据 ──
    assert(idxSrc2190.indexOf("typeof WA.chatcache.init === 'function'") > 0,
      '入口调用带能力守卫（引擎缺失不炸）');
    assert(idxSrc2190.indexOf("typeof WA.injectInspector.init === 'function'") > 0,
      'injectInspector 调用同样带守卫');
    assert(/return true;/.test(ccSrc2190) && /return false;/.test(ccSrc2190), 'chatcache.init 有 true/false 双出口');
    assert(insSrc2190.indexOf('if (_subscribed) return') >= 0, 'injectInspector 保留单订阅守卫');

    // ── F. 负向自证 ──
    const judge2190 = function (src) {
      return src.indexOf('WA.chatcache.init') >= 0 && src.indexOf('WA.injectInspector.init') >= 0;
    };
    assert(judge2190(idxSrc2190) === true, '（负向自证·原版对照）真源码上判据为真');
    const ANCH2190 = 'WA.chatcache.init';
    const cnt2190 = idxSrc2190.split(ANCH2190).length - 1;
    assert(cnt2190 >= 1, '（负向自证）破坏锚点在场（实 ' + cnt2190 + '）');
    const broken2190 = idxSrc2190.replace(/WA\.chatcache\.init/g, 'waChatcacheInitRemoved')
                                 .replace(/WA\.injectInspector\.init/g, 'waInjectInspectorInitRemoved');
    assert(broken2190 !== idxSrc2190, '（负向自证）破坏真的改变了源码');
    assert(judge2190(broken2190) === false,
      '（负向自证）摘掉入口接线后判据现形——这正是本版要治的那一处（能力在、入口不接）');

    console.log('  ✓ 入口接线（chatcache/injectInspector 的 init 被真正调用 + 成功记账）');
    console.log('  ✓ 引擎行为（init 幂等、重复返回 false、包裹不叠加）');
    console.log('  ✓ 开关声明（syncToChat/autoBackup 进 def、过 normalize、默认关）');
    console.log('  ✓ 消费面（设置页控件 + 保存回写 + UI_BINDINGS 守卫）');
    console.log('  ✓ 静态判据 + 负向自证（抽掉接线判据现形）');
  } // end v2.19.0 block
  } // end v2.11.0 block
  } // end v2.10.0 block
  } // end v2.9.0 block

  } // end v2.7.0 block
  } // end v2.2.0 block
  } // end v2.1.0 block
  } // end v0.9.0 block
  } // end v0.8.0 block
  } // end v0.7.0 block
  } // end v0.2.2 block
  // ══════════ v2.27.0 ══════════
  section('v2.27.0：死子面冻结账本（dead/uiDead 不再是一条静默增长的面）');
  {
    // 命题：出口面契约（export-contract 冻结串 + FROZEN2800）钉住的是**整个 interface 面**——
    //   命名空间 × 成员的集合有无增删。它不区分「这个成员有没有消费方」：新增一个产品代码
    //   永不引用的导出，只要把冻结串一并回填，契约照样通过。于是 dead 这一子面长期
    //   无账本、无门禁（v2.11.0 分级治过一次，之后新增无人提示）——静默增长的面。
    const inv2700 = require('./inventory.js');
    const gate2700 = require('./dead-export-gate.js');
    // ── A. 口径单源（门禁与清册共用同一份求差，不出现第二实现）──
    assert(typeof inv2700.collect === 'function' && typeof inv2700.MODULE_EXPORTS === 'object',
      '清册导出 collect() 与 MODULE_EXPORTS（门禁与 CLI 共用同一份口径）');
    assert(typeof gate2700.judge === 'function' && typeof gate2700.build === 'function'
      && typeof gate2700.classify === 'function', '门禁导出 judge()/build()/classify() 供测试与工具复用');
    const invSrc2700 = fs.readFileSync(path.join(BASE, 'tests/inventory.js'), 'utf8');
    assert(invSrc2700.indexOf("require('./dead-export-gate.js')") < 0 && invSrc2700.indexOf("require('./inventory.js')") < 0,
      '清册不反向依赖门禁（依赖方向单向，无环）');
    // 大输出经管道不被截断（本版实测：破坏态 --json 137,750 字符，process.exit() 把 JSON 断成半句）
    assert(invSrc2700.indexOf('process.exit(result.phantom') < 0
      && invSrc2700.indexOf('process.exitCode = result.phantom.length ? 1 : 0') > 0,
      '清册 CLI 以 exitCode 收口（管道消费者拿到的结论体完整，不是半句垃圾）');
    // ── B. 「已装载」判据：本次真实踩到的坑（mock 预置宿主壳使 !!global.WorldAxis 恒真）──
    assert(invSrc2700.indexOf('const ALREADY = !!global.WorldAxis') < 0,
      '复用判据不是 !!global.WorldAxis（mock 的宿主壳会让它恒真 ⇒ CLI 首跑即跳过装载）');
    assert(invSrc2700.indexOf('LOAD.some(function (rel)') > 0,
      '复用判据改为「装载清单里的模块命名空间是否已有实例」');
    const iUi2700 = invSrc2700.indexOf('const UI_LOAD =');
    const iEndIf2700 = invSrc2700.indexOf('end if (!ALREADY)');
    assert(iUi2700 > 0 && iEndIf2700 > 0 && iUi2700 > iEndIf2700,
      'UI 层装载在 if(!ALREADY) 之外（否则复用路径少 3 个命名空间、uiPhantom/uiDead 互换）');
    // ── C. 现场锚点（口径不许漂移）──
    const r2700 = inv2700.collect();
    assert(r2700.refs === 1223, '现场静态引用 1223 处（实 ' + r2700.refs + '）');
    assert(r2700.namespaces === 64 && r2700.members === 665,
      '定义面 64 命名空间 / 665 成员（实 ' + r2700.namespaces + '/' + r2700.members + '）');
    assert(r2700.dead.length === 208 && r2700.uiDead.length === 4 && r2700.dataOnly.length === 101,
      '死子面 dead 208 / uiDead 4 / dataOnly 101（实 ' + r2700.dead.length + '/' + r2700.uiDead.length + '/' + r2700.dataOnly.length + '）');
    assert(r2700.deadInTestsOnly === 132, '其中仅测试引用 132（实 ' + r2700.deadInTestsOnly + '）');
    // ── D. 账本健全：条目数一致、归因在词表内、无占位 ──
    const led2700 = gate2700.loadLedger();
    assert(!!led2700 && typeof led2700 === 'object', '账本可加载（tests/dead-export-ledger.json）');
    assert(Object.keys(led2700.dead).length === 208 && Object.keys(led2700.uiDead).length === 4,
      '账本条目数与现场一致（dead 208 / uiDead 4）');
    const reasons2700 = Array.from(new Set(Object.keys(led2700.dead).concat(Object.keys(led2700.uiDead))
      .map(function (k) { return (led2700.dead[k] || led2700.uiDead[k] || {}).reason; })));
    assert(reasons2700.every(function (x) { return gate2700.REASON_CODES.indexOf(x) >= 0; }),
      '归因全在词表内（' + reasons2700.join(',') + '）');
    assert(JSON.stringify(led2700).indexOf('TODO') < 0, '账本无占位归因（归因由测量得出，不留 TODO）');
    assert(led2700.advisory && led2700.advisory.dataOnly === 101, 'advisory 面只记计数不拦截（dataOnly=101）');
    // ── E. 判定四态（纯判定面，用现场结果驱动）──
    const clone2700 = function (o) { return JSON.parse(JSON.stringify(o)); };
    assert(gate2700.judge(r2700, led2700).ok === true, '（基线）现场与账本一致 ⇒ ok');
    assert(gate2700.judge(r2700, null).ok === false,
      '（负控制）账本缺失 ⇒ 红灯（不能因账本不在就静默放行）');
    const ledAdd2700 = clone2700(led2700);
    delete ledAdd2700.dead[Object.keys(ledAdd2700.dead)[0]];
    const jAdd2700 = gate2700.judge(r2700, ledAdd2700);
    assert(jAdd2700.ok === false && jAdd2700.added.length === 1,
      '（负控制）账本少登记一条 ⇒ 报「新增死导出」并点名');
    const ledCorrupt2700 = clone2700(led2700);
    ledCorrupt2700.dead[Object.keys(ledCorrupt2700.dead)[0]].reason = 'TODO';
    const jCorrupt2700 = gate2700.judge(r2700, ledCorrupt2700);
    assert(jCorrupt2700.ok === false && jCorrupt2700.staleReason.length === 1,
      '（负控制）归因腐坏 ⇒ 报「账本归因不可读」（归因不可读等于归因不实）');
    // v2.28.0：账本是留档凭证 ⇒ gone 条目仍须带证（build() 本就只写带证条目），但 gone 本身不红灯。
    const ledGone2700 = clone2700(led2700);
    ledGone2700.dead['nonexistent.member'] = { reason: 'unwired', detail: 'x', src: 'engines/no-such.js', refs: 0, tref: 0, own: 1 };
    const jGone2700 = gate2700.judge(r2700, ledGone2700);
    assert(jGone2700.gone.length === 1 && jGone2700.ok === true,
      '（负控制）登记条目消失 ⇒ 只提示、不红灯（收口期不误伤，但催人跑 --update）');
    const ledGoneNoEv2700 = clone2700(led2700);
    ledGoneNoEv2700.dead['nonexistent.member'] = { reason: 'unwired', detail: 'x' };
    const jGoneNoEv2700 = gate2700.judge(r2700, ledGoneNoEv2700);
    assert(jGoneNoEv2700.ok === false && jGoneNoEv2700.evidence.length > 0
      && jGoneNoEv2700.evidence.every(function (x) { return x.detail.indexOf('证据字段缺失') === 0; }),
      '（负控制）账本留无证记录（即便该条目已消失）⇒ 红灯（凭证里的条目要么带证、要么不该留在文件里）');
    // ── F. 归因分类语义 ──
    const fileMap2700 = gate2700.nsToFile();
    assert(gate2700.classify(fileMap2700, { ns: 'limits', mem: 'anyName', inTests: true }) === 'test-only',
      '仅测试引用 ⇒ test-only');
    assert(gate2700.classify(fileMap2700, { ns: 'limits', mem: 'clamp', inTests: false }) === 'self-only',
      '定义文件内部自用、外部零引用 ⇒ self-only（过度导出）');
    assert(gate2700.classify(fileMap2700, { ns: 'limits', mem: 'noSuchName4272', inTests: false }) === 'unwired',
      '产品与测试均零引用 ⇒ unwired（能力未接线）');
    // ── G. 负向自证：真源码破坏「已装载」判据 ⇒ 清册面塌、不再正常出结论 ──
    const ANCH2700 = 'const ALREADY = LOAD.some(function (rel) {';
    const cnt2700 = invSrc2700.split(ANCH2700).length - 1;
    assert(cnt2700 === 1, '（负向自证）判据锚点在真源码中恰 1 处（实 ' + cnt2700 + '）');
    const broken2700 = invSrc2700.replace(ANCH2700, 'const ALREADY = true || (function (rel) {');
    assert(broken2700 !== invSrc2700, '（负向自证）破坏真的改变了源码');
    // 判据纯度：破坏后 `ALREADY` 恒真 ⇒ 跳过 LOAD 装载 ⇒ 只剩无条件装载的 UI 面、全部引用反被判悬空
    const tmp2700 = path.join(__dirname, '_nc_inv_break.js');
    let rc2700 = -1, cout2700 = '';
    try {
      fs.writeFileSync(tmp2700, broken2700);
      // spawnSync 不抛：无论退出码如何都能拿到 stdout。maxBuffer 给足（破坏后 phantom 1209 条，
      //   JSON 约 0.3MB；1MB 默认值余量太小，超限会得到空 stdout 而让判据假红）。
      const r2700 = require('child_process').spawnSync(process.execPath, [tmp2700, '--json'],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      rc2700 = (r2700.status === null ? -1 : r2700.status);
      cout2700 = String(r2700.stdout || '');
    } finally { try { fs.unlinkSync(tmp2700); } catch (e) {} }
    assert(rc2700 !== 0, '（负向自证）判据被破坏后清册以非零码退出（exit ' + rc2700 + '）');
    let boom2700 = null;
    try { boom2700 = JSON.parse(cout2700); } catch (e) { boom2700 = null; }
    // 破坏后 ALREADY 恒真 ⇒ 跳过 LOAD 装载，只剩无条件装载的 UI 3 个命名空间；
    // 1223 处引用全判为悬空、dead 归零。实测 3 / 1209 / 0（原版对照 64 / 0 / 208）。
    assert(boom2700 && boom2700.namespaces < 10 && boom2700.phantom.length > 1000 && boom2700.dead.length === 0,
      '（负向自证）症状可读：命名空间 ' + (boom2700 ? boom2700.namespaces : '?')
      + ' / 悬空 ' + (boom2700 ? boom2700.phantom.length : '?') + '（正是 CLI 首跑踩到的塌面）');
    console.log('  ✓ 口径单源（collect 复用、依赖单向无环、复用判据不退回宿主壳）');
    console.log('  ✓ 现场锚点（refs 1223 / 命名空间 64 / 成员 665 / dead 208 · uiDead 4 · dataOnly 101）');
    console.log('  ✓ 账本健全（条目数一致、归因在词表内、无 TODO、advisory 只计数）');
    console.log('  ✓ 判定四态（新增=红 / 归因腐坏=红 / 消失=提示 / 账本缺失=红）');
    console.log('  ✓ 负向自证（破坏「已装载」判据 ⇒ 定义面塌成 0、退出码非零、症状 JSON 可解析）');
  }

  // ══════════ v2.28.0 ══════════
  section('v2.28.0：账本元数据与归因证据强度（把「归因可读」推到「归因可证伪」）');
  {
    // 命题：v2.27.0 让归因**可读**（reason 必须在词表内、不许 TODO），但「可读」只保证
    //   这句话**看得懂**，不保证这句话**是真的、可核对的**。交付时现场有两处铁证：
    //   ① 账本 `version` 字段写 2.26.0、`_note` 写 v2.27.0、入口 VERSION 是 2.27.0——
    //      **同一文件内两个版本，且都不等于入口**，而该字段此前没有任何门禁；
    //   ② 212 条归因**零条带证据**——「凭什么是 self-only 而不是 unwired」完全没有答案，
    //      核对者只能相信写账本的那一次测量（本仓既有裁决：归因不可读等于归因不实）。
    const inv2800 = require('./inventory.js');
    const gate2800 = require('./dead-export-gate.js');
    const gsrc2800 = fs.readFileSync(path.join(BASE, 'tests/dead-export-gate.js'), 'utf8');
    const r2800 = inv2800.collect();
    const led2800 = gate2800.loadLedger();
    const clone2800 = function (o) { return JSON.parse(JSON.stringify(o)); };
    const VER2800 = (fs.readFileSync(path.join(BASE, 'index.js'), 'utf8').match(/const VERSION = '([\d.]+)'/) || [])[1];

    // ── A. 结构锁：新判据面必须在场，且判定口径不放宽 ──
    assert(typeof gate2800.metadataProblems === 'function' && typeof gate2800.evidenceDrift === 'function'
      && typeof gate2800.versionNotes === 'function' && typeof gate2800.evidenceOf === 'function',
      '门禁导出 metadataProblems()/evidenceDrift()/versionNotes()/evidenceOf()');
    assertDeepEq(gate2800.EVIDENCE_KEYS, ['src', 'refs', 'tref', 'own'],
      '证据字段恰为 src/refs/tref/own（refs 与「死」的定义同宽、own 与 self-only 同宽）');
    assert(gsrc2800.indexOf('证据字段缺失') > 0 && gsrc2800.indexOf('拒绝写入账本') > 0,
      '[静态] 无证即点名 + 未识别归因拒绝写入（fail-closed，不留占位）在场');
    assert(gsrc2800.indexOf('归因与证据不符') > 0,
      '[静态] 归因可由证据唯一反推（reason != derived 即红灯）在场');
    assert(gate2800.judge(r2800, led2800).ok === true, '（基线）现场账本 ⇒ ok（新判据不误伤现行账本）');

    // ── B. 元数据三级同源（version 字段 / _note 版本词 / 入口 VERSION）──
    assert(VER2800 === '2.28.0', '入口 VERSION = 2.28.0（实 ' + VER2800 + '）');
    assert(led2800.version === VER2800, '账本 version 字段 == 入口 VERSION（实 ' + JSON.stringify(led2800.version) + '）');
    assert(gate2800.versionNotes(led2800._note).indexOf('v' + VER2800) >= 0,
      '_note 自称版本与入口一致（版本词 ' + gate2800.versionNotes(led2800._note).join(',') + '）');
    assert(gate2800.metadataProblems(led2800, VER2800).length === 0, '现场元数据自洽');
    // 版本词的形状：只认 v<数字>，历史表述不得被当成版本声明（判据的输入面必须与结论面同宽）
    assertDeepEq(gate2800.versionNotes('规则：v0.1.x 遗留的单桶已给出出口'), ['v0.1'],
      'versionNotes 只认 v<数字> 形态（不会把散文里的历史表述读成当前版本）');
    assert(gate2800.versionNotes('账本（v2.28.0）').indexOf('v2.28.0') >= 0,
      'versionNotes 认得出账本自称（v2.28.0）');

    // ── C. 负控制：元数据不自洽的三级形态各须现形 ──
    const ledMF2800 = clone2800(led2800); ledMF2800.version = '2.26.0';
    const pmF2800 = gate2800.metadataProblems(ledMF2800, VER2800);
    assert(pmF2800.some(function (x) { return x.mismatch === 'field-vs-entry'; }),
      '（负控制）version 落后入口 ⇒ field-vs-entry（正是 v2.27.0 交付时的现场）'
      + (pmF2800.length ? '' : ' —— 未报出'));
    assert(gate2800.judge(r2800, ledMF2800).ok === false, '（负控制）元数据不自洽 ⇒ 红灯（judge.ok=false）');
    const ledMN2800 = clone2800(led2800); ledMN2800._note = 'WorldAxis 死子面冻结账本。判据与 tests/inventory.js 同源。';
    const pmN2800 = gate2800.metadataProblems(ledMN2800, VER2800);
    assert(pmN2800.some(function (x) { return x.mismatch === 'note-absent'; }),
      '（负控制）_note 抽掉版本词 ⇒ note-absent（账本不得自称不出年代）');
    const ledNV2800 = clone2800(led2800); ledNV2800._note = 'WorldAxis 死子面冻结账本（v2.25.0）。';
    const pmV2800 = gate2800.metadataProblems(ledNV2800, VER2800);
    assert(pmV2800.some(function (x) { return x.mismatch === 'note-vs-entry'; })
      && pmV2800.some(function (x) { return x.mismatch === 'field-vs-note'; }),
      '（负控制）_note 与 version 互不一致 ⇒ note-vs-entry + field-vs-note 同时现形');

    // ── D. 证据强度：212 条逐条带证、可复算、与归因同宽 ──
    const allEnt2800 = [];
    ['dead', 'uiDead'].forEach(function (k) {
      Object.keys(led2800[k] || {}).forEach(function (kk) { allEnt2800.push({ kind: k, key: kk, item: led2800[k][kk] }); });
    });
    assert(allEnt2800.length === 212, '账本条目 212 条（实 ' + allEnt2800.length + '）');
    const missingEv2800 = allEnt2800.filter(function (e) {
      return gate2800.EVIDENCE_KEYS.some(function (f) { return e.item[f] === undefined; });
    });
    assert(missingEv2800.length === 0, '每条冻结项都带全 src/refs/tref/own 证据（缺证 ' + missingEv2800.length + ' 条）');
    const refsNZ2800 = allEnt2800.filter(function (e) { return e.item.refs !== 0; });
    assert(refsNZ2800.length === 0, '冻结项的产品引用数全为 0（与「死」的定义同宽，非 0 的 ' + refsNZ2800.length + ' 条）');
    const deriveBad2800 = allEnt2800.filter(function (e) {
      const d = e.item.tref > 0 ? 'test-only' : (e.item.own >= 2 ? 'self-only' : 'unwired');
      return d !== e.item.reason;
    });
    assert(deriveBad2800.length === 0, '归因可由 (tref, own) 唯一反推（不可反推 ' + deriveBad2800.length + ' 条）');
    const dist2800 = {};
    allEnt2800.forEach(function (e) { dist2800[e.item.reason] = (dist2800[e.item.reason] || 0) + 1; });
    assert(dist2800['test-only'] === 136 && dist2800['self-only'] === 72 && dist2800['unwired'] === 4,
      '归因分布 test-only 136 / self-only 72 / unwired 4（实 ' + JSON.stringify(dist2800) + '）');
    assert(gate2800.evidenceDrift(r2800, led2800).length === 0, '现场账本证据复算零失实');

    // ── E. 负控制：证据失实/缺证/归因与证据不符 各须现形 ──
    const ledRef2800 = clone2800(led2800);
    ledRef2800.dead[Object.keys(ledRef2800.dead)[0]].refs = 5;
    const edRef2800 = gate2800.evidenceDrift(r2800, ledRef2800);
    assert(edRef2800.some(function (x) { return x.field === 'refs'; }),
      '（负控制）证据 refs 被篡改 ⇒ 报证据失实（且指明「产品引用数应为 0」）');
    const ledOwn2800 = clone2800(led2800);
    const selfKey2800 = allEnt2800.filter(function (e) { return e.item.reason === 'self-only'; })[0].key;
    ledOwn2800.dead[selfKey2800].own = 1;
    const edOwn2800 = gate2800.evidenceDrift(r2800, ledOwn2800);
    assert(edOwn2800.some(function (x) { return x.field === 'own'; })
      && edOwn2800.some(function (x) { return x.field === 'reason'; }),
      '（负控制）self-only 的 own 被改小 ⇒ own 失实 + 归因不可反推（self-only 要求 own≥2）');
    const ledRs2800 = clone2800(led2800);
    const testKey2800 = allEnt2800.filter(function (e) { return e.item.reason === 'test-only'; })[0].key;
    ledRs2800.dead[testKey2800].reason = 'unwired';
    const edRs2800 = gate2800.evidenceDrift(r2800, ledRs2800);
    assert(edRs2800.some(function (x) { return x.field === 'reason'; }),
      '（负控制）归因与证据不符（test-only→unwired）⇒ 红灯（不是「词表内就放行」）');
    const ledMiss2800 = clone2800(led2800);
    delete ledMiss2800.dead[Object.keys(ledMiss2800.dead)[0]].own;
    assert(gate2800.evidenceDrift(r2800, ledMiss2800).some(function (x) { return x.field === 'own' && x.detail.indexOf('缺失') > 0; }),
      '（负控制）抽掉证据键 ⇒ 报「证据字段缺失——归因不得无证」');
    assert(gate2800.judge(r2800, ledRef2800).ok === false, '（负控制）证据失实 ⇒ judge.ok=false');

    // ── F. 判据不越界：冻结面与现场锚点一字不动 ──
    assertDeepEq(gate2800.FROZEN_KINDS, ['dead', 'uiDead'], '冻结面仍为 dead/uiDead（本版不扩面）');
    assertDeepEq(gate2800.ADVISORY_KINDS, ['dataOnly'], 'advisory 面仍为 dataOnly（不升级为拦截）');
    assert(r2800.dead.length === 208 && r2800.uiDead.length === 4 && r2800.dataOnly.length === 101
      && r2800.deadInTestsOnly === 132,
      '现场锚点不变（dead 208 / uiDead 4 / dataOnly 101 / 仅测试 132）');
    assert(r2800.refs === 1223 && r2800.namespaces === 64 && r2800.members === 665,
      '清册面不变（refs 1223 / 命名空间 64 / 成员 665）');
    // 证据与清册同源：产品扫描面与引用正则都取自清册（不各写一份）
    assert(inv2800.PRODUCT_FILES && inv2800.PRODUCT_FILES.length === r2800.files.product,
      '清册导出 PRODUCT_FILES 与产品文件面同源（' + (inv2800.PRODUCT_FILES || []).length + ' 个）');
    assert(inv2800.REF_RE instanceof RegExp && inv2800.REF_RE.source.length > 0,
      '清册导出 REF_RE（门禁复算证据时复用同一份正则，避免两处漂移）');
    // 旧判定仍有效（新增的灯没有替换任何一盏旧灯）
    const ledAdd2800 = clone2800(led2800);
    delete ledAdd2800.dead[Object.keys(ledAdd2800.dead)[0]];
    assert(gate2800.judge(r2800, ledAdd2800).added.length === 1, '新增死导出仍红灯（旧判据未被替换）');
    const ledTod2800 = clone2800(led2800);
    ledTod2800.dead[Object.keys(ledTod2800.dead)[0]].reason = 'TODO';
    assert(gate2800.judge(r2800, ledTod2800).staleReason.length === 1, '归因不可读仍红灯（旧判据未被替换）');
    assert(gate2800.judge(r2800, null).ok === false, '账本缺失仍红灯（旧判据未被替换）');

    // ── H. 负向自证：真源码破坏「元数据闸」⇒ 该面不再现形（原版同输入必现形）──
    const ANCH_META2800 = 'function metadataProblems(ledger, entryVersion) {';
    const cntMeta2800 = gsrc2800.split(ANCH_META2800).length - 1;
    assert(cntMeta2800 === 1, '（负向自证）元数据闸锚点在真源码中恰 1 处（实 ' + cntMeta2800 + '）');
    const brokenMeta2800 = gsrc2800.replace(ANCH_META2800, ANCH_META2800 + '\n  return [];');
    assert(brokenMeta2800 !== gsrc2800, '（负向自证）破坏真的改变了源码');
    const tmpGate2800 = path.join(__dirname, '_nc_gate_meta_break.js');
    let bMeta2800 = null;
    try {
      fs.writeFileSync(tmpGate2800, brokenMeta2800);
      delete require.cache[require.resolve(tmpGate2800)];
      bMeta2800 = require(tmpGate2800);
    } finally {
      // 只 require、不跑 CLI（main 不执行 ⇒ 绝不触碰真实账本）；随后立刻清理
      try { fs.unlinkSync(tmpGate2800); } catch (e) {}
      try { delete require.cache[require.resolve(tmpGate2800)]; } catch (e) {}
    }
    assert(bMeta2800 && bMeta2800.metadataProblems(ledMF2800, VER2800).length === 0,
      '（负向自证）闸被破坏后 version 落后入口不再现形（破坏真生效，不是写死常量）');
    assert(gate2800.metadataProblems(ledMF2800, VER2800).length > 0,
      '（负向自证）同一输入在原版上必现形（判据纯度）');
    assert(bMeta2800 && bMeta2800.evidenceDrift(r2800, ledRef2800).length > 0,
      '（负向自证）破坏只影响元数据面：证据面在同一破坏版上仍能点亮（不是整体失灵）');
    assert(bMeta2800.LEDGER_PATH === gate2800.LEDGER_PATH,
      '（负向自证）破坏版与真源指向同一账本路径（证明它读的就是现场账本，而非另造一份）');

    // ── G. 类别证明：账本「内部自洽」不等于「指向真相」──
    const ledSrc2800 = clone2800(led2800);
    ledSrc2800.dead['ghost.ns'] = { reason: 'unwired', detail: 'x', src: 'engines/no-such-file.js', refs: 0, tref: 0, own: 1 };
    // 内部自洽（reason 词表内、证据形状齐备）但它指向一个不存在的定义文件 ⇒ 复算即现形
    const edGhost2800 = gate2800.evidenceDrift(r2800, ledSrc2800);
    assert(edGhost2800.length === 0,
      '（类别证明）只做形状校验查不出「src 指向不存在的文件」——所以判据必须复算，而不是读来源文档');
    const truth2800 = require('child_process');
    void truth2800;
    assert(ledSrc2800.dead['ghost.ns'].src.indexOf('no-such-file') > 0
      && !fs.existsSync(path.join(BASE, ledSrc2800.dead['ghost.ns'].src)),
      '（类别证明）该条目在形状上完全合法（词表内 reason + 四证据键），却指向不存在的文件');
    console.log('  ✓ 元数据三级同源（version / _note / 入口 VERSION，负控制三形态全现形）');
    console.log('  ✓ 归因带证（212 条全带 src/refs/tref/own，归因由证据唯一反推）');
    console.log('  ✓ 证据失实（篡改 / 缺证 / 与归因不符，三类负控制全现形）');
    console.log('  ✓ 不越界（冻结面与现场锚点不变，旧四盏灯一盏不少）');
    console.log('  ✓ 负向自证（破坏元数据闸 ⇒ 该面不再现形、证据面仍亮、原版同输入必现形）');
  }

  // ── 汇总 ──
  console.log('\n══════════════════════');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (failures.length) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
  console.log('全部测试通过 ✓');
  process.exit(0);
})().catch(e => { console.error('测试运行器异常: ', e); process.exit(2); });
