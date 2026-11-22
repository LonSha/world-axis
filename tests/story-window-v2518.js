// WorldAxis story-window v2.518.0 focused regression
'use strict';
const assert = require('assert');

function fresh(seed) {
  let data = {
    storyWindow: { windows: [], pending: null },
    livingWorld: { livingTraces: [], npcMovements: [] },
    world: { messages: [], journeys: [] },
    acts: { rows: [], res: [] },
    foreshadows: [], rumor: { chains: [] },
    investigation: { clues: [], evidence: [] },
    elsewhere: { rows: [] },
    people: {}
  };
  if (seed) data = Object.assign(data, seed);
  const WA = {
    clock: { now: () => 1700000000000 },
    store: {
      get: () => data,
      chatId: () => 'test-chat',
      transact: (fn) => { const draft = JSON.parse(JSON.stringify(data)); fn(draft); data = draft; return { ok: true }; }
    },
    settingsBus: {
      read: () => ({}),
      normalize: (_r, v) => v,
      saveOrThrow: (_r, v) => v
    },
    registerModule: () => {},
    __settingsRegs: []
  };
  global.window = { WorldAxis: WA };
  delete require.cache[require.resolve('../engines/story-window.js')];
  require('../engines/story-window.js');
  return { WA, get data() { return data; } };
}

(function run() {
  const x = fresh();
  x.WA.store.transact(function (d) { d.livingWorld.livingTraces = [
    { id: 't1', trace: '门口留下湿脚印', place: '码头', source: 'livingWorld', reliability: 'observed', visibleWhen: 'scene' },
    { id: 't2', summary: '远处街巷传来铃声', place: '集市', source: 'livingWorld', reliability: 'unknown', visibleWhen: 'place:集市' },
    { id: 't3', summary: '未公开的异步推演结果', place: '码头', source: 'backstage', reliability: 'running', visibleWhen: 'unknown-rule' }
  ]; });
  const a = x.WA.storyWindow.open({ id: 'r1', text: '正文', chatLength: 3, place: '码头', evidence: 'after-chain-committed' });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(x.WA.storyWindow.open({ id: 'r1', text: '正文', chatLength: 3 }).duplicate, true);
  assert.strictEqual(x.data.storyWindow.windows.length, 1);
  const block = x.WA.storyWindow.buildBlock({ place: '码头', viewer: 'player' });
  assert.ok(block.indexOf('湿脚印') >= 0);
  assert.strictEqual(block.indexOf('街巷传来铃声'), -1);
  assert.strictEqual(block.indexOf('异步推演结果'), -1);
  assert.strictEqual(x.WA.storyWindow.settle('r1', { status: 'bad-status' }).reason, 'bad-status');
  const d = x.WA.storyWindow.choose('r1', 'defer');
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.window.status, 'deferred');
  assert.strictEqual(x.WA.storyWindow.choose('r1', 'find').reason, 'already-chosen');
  let duplicateWrites = 0;
  x.WA.world = { sendMessage: () => { duplicateWrites++; return { ok: true }; } };
  assert.strictEqual(x.WA.storyWindow.choose('r1', 'ask', { to: '同伴' }).reason, 'already-chosen');
  assert.strictEqual(duplicateWrites, 0, '重复选择不能先执行 owner 写入');
  // 非 defer 选择在 owner 仍等待确认时不应伪装成 intervening。
  const y = fresh();
  y.WA.store.transact(function (d) { d.livingWorld.livingTraces = [{ id: 't4', summary: '待核实痕迹', place: '码头', visibleWhen: 'scene' }]; });
  y.WA.storyWindow.open({ id: 'r2', place: '码头', evidence: 'after-chain-committed' });
  const pending = y.WA.storyWindow.choose('r2', 'verify', { note: '等待真实线索规格' });
  assert.strictEqual(pending.ok, false, '缺少 owner 输入不可锁死窗口');
  assert.strictEqual(pending.reason, 'awaiting-owner-input');
  assert.strictEqual(y.WA.storyWindow.current().choice, undefined);
  assert.strictEqual(x.WA.storyWindow.settle('r1', { status: 'settled', owner: 'storyWindow', evidence: 'deferred-choice-recorded' }).ok, true);
  assert.strictEqual(x.WA.storyWindow.current().status, 'settled');
  assert.strictEqual(x.WA.storyWindow.buildBlock({ place: '码头' }), '');
  assert.strictEqual(x.WA.storyWindow.settle('r1', { status: 'settled' }).reason, 'already-settled');
  assert.strictEqual(x.WA.storyWindow.choose('missing', 'verify').reason, 'window-missing');
  assert.strictEqual(x.WA.storyWindow.choose('r1', 'bad').reason, 'bad-choice');
  // diagnose 面：tool-diag 的 secStoryWindow 真调它，缺席就是「诊断段读空」。
  const dg = x.WA.storyWindow.diagnose();
  assert.strictEqual(dg.module, 'storyWindow');
  assert.strictEqual(dg.closedLoop, true);
  assert.strictEqual(dg.stat.windows, 1);
  assert.ok(dg.stat.phases && dg.stat.phases.deferred >= 1, '诊断面应报出 deferred 阶段计数');

  // ── 真实 owner 投影（EX-2/EX-3/EX-4/OP-2/OP-4）────────────────────────
  const z = fresh();
  z.WA.store.transact(function (d) {
    d.livingWorld.livingTraces = [{ id: 'tr1', trace: '码头的绳结还是温的', place: '码头', visibleWhen: 'scene' }];
    d.livingWorld.npcMovements = [{ name: '同伴', from: '客栈', to: '码头', reason: '追查', tick: 7 }];
    d.world.messages = [
      { id: 'm1', status: 'arrived', text: '北道有异', to: 'player', from: '老张', endedAt: 12 },
      { id: 'm2', status: 'in-transit', text: '尚未抵达', to: 'player', from: '某人' }
    ];
    d.world.journeys = [{ id: 'j1', person: '同伴', from: '客栈', to: '码头', status: 'in-transit', arriveAt: 99 }];
    d.acts.rows = [{ id: 'a1', person: '同伴', text: '追查商队', status: 'running', place: '北道' }];
    d.acts.res = [{ opId: 'o1', id: 'a1', person: 'player', kind: 'wait', status: 'done', result: '等到天亮', evidence: 'self', at: 5 }];
    d.foreshadows = [
      { id: 'f1', content: '北道的车辙', status: 'developing' },
      { id: 'f2', content: '尚未发现的线', status: 'waiting' }
    ];
    d.rumor.chains = [{ id: 'r1x', factValue: '商队没回来', note: '有人说商队没回来', layer: 'rumor', hops: [{ to: 'player', value: '商队没回来', layer: 'witness' }] }];
    d.investigation.clues = [
      { id: 'c1', title: '失踪的商队', status: 'collected', location: '北道', evidenceIds: ['ev1'] },
      { id: 'c2', title: '无处线索', status: 'discoverable', location: '' }
    ];
    d.investigation.evidence = [{ id: 'ev1', clueId: 'c1', person: 'player', status: 'collected' }];
    d.elsewhere.rows = [{ name: '同伴', place: '码头', doing: '守着货' }];
  });
  z.WA.storyWindow.open({ id: 'r3', place: '码头' });
  const zb = z.WA.storyWindow.buildBlock({ place: '码头', viewer: 'player' });
  assert.ok(zb.indexOf('绳结') >= 0, '空间痕迹应可见');
  assert.ok(zb.indexOf('同伴') >= 0, 'NPC 位移应可见');
  assert.ok(zb.indexOf('北道有异') >= 0, '已抵达消息应可见');
  assert.strictEqual(zb.indexOf('尚未抵达'), -1, '在途消息不得当成已抵达事实');
  assert.ok(zb.indexOf('商队没回来') >= 0, '传闻应可见但分层');
  assert.ok(zb.indexOf('尚未确认') >= 0, '传闻必须落在未确认分组');
  assert.ok(zb.indexOf('失踪的商队') >= 0, '已采集线索应可见');
  assert.strictEqual(zb.indexOf('无处线索'), -1, '无地点且未采集的线索不得进正文');
  assert.ok(zb.indexOf('等到天亮') >= 0, '行动回执应可见');
  assert.ok(zb.indexOf('北道的车辙') >= 0, '发展中伏笔应可见');
  assert.strictEqual(zb.indexOf('尚未发现的线'), -1, 'waiting 伏笔不得进正文');
  assert.ok(zb.indexOf('守着货') >= 0, '场外人物卡应可见');
  assert.ok(zb.indexOf('正在前往') >= 0 || zb.indexOf('已抵达') >= 0, '行程状态应可见');
  assert.strictEqual(zb.indexOf('追查商队'), -1, '远处进行中的私下行动不得泄露');

  assert.strictEqual(z.WA.storyWindow.buildBlock({ place: '集市', viewer: '陌生人' }).includes('商队没回来'), false, '未收到传闻的人不能读取别人的版本');
  assert.strictEqual(z.WA.storyWindow.buildBlock({ place: '集市', viewer: '陌生人' }).includes('等到天亮'), false, '他人行动回执不得全员共享');
  // 可见性规则三档：self / rumor / internal。
  const w = fresh();
  w.WA.store.transact(function (d) {
    d.livingWorld.livingTraces = [
      { id: 'v1', summary: '自见之物', place: '别处', visibleWhen: 'self' },
      { id: 'v2', summary: '传闻之物', place: '别处', visibleWhen: 'rumor' },
      { id: 'v3', summary: '内部账之物', place: '别处', visibleWhen: 'internal' }
    ];
  });
  w.WA.storyWindow.open({ id: 'r4', place: '码头' });
  const wb = w.WA.storyWindow.buildBlock({ place: '码头', viewer: 'player' });
  assert.ok(wb.indexOf('自见之物') >= 0, 'self 规则始终可见');
  assert.ok(wb.indexOf('传闻之物') >= 0, 'rumor 规则可见');
  assert.strictEqual(wb.indexOf('内部账之物'), -1, 'internal 规则不得进正文');

  // ── EX-9 新入口：询问 / 跟随 / 等待 ────────────────────────────────────
  const v = fresh();
  const sent = [];
  v.WA.world = {
    sendMessage: (from, to, opts) => { sent.push({ from: from, to: to, opts: opts }); return { ok: true, id: 'msg1', status: 'in-transit' }; },
    depart: (person, from, to, at) => { sent.push({ depart: [person, from, to, at] }); return { ok: true, id: 'j1', status: 'in-transit' }; }
  };
  v.WA.storyWindow.open({ id: 'r5', place: '码头' });
  const askRes = v.WA.storyWindow.choose('r5', 'ask', { to: '老张', topic: '北道' });
  assert.strictEqual(askRes.ok, true);
  assert.strictEqual(askRes.owner, 'world');
  assert.strictEqual(askRes.window.status, 'awaiting');
  assert.strictEqual(sent[0].opts.text.indexOf('北道') >= 0, true, 'ask 必须把问句交给 world.sendMessage');
  // 提问本身是玩家**发出**的，收件人是老张 ⇒ 它不作为「收到的消息」回到玩家视野。
  assert.strictEqual(sent[0].to, '老张');
  const followRes = v.WA.storyWindow.choose('r5', 'follow', { to: '码头', from: '客栈' });
  assert.strictEqual(followRes.ok, false);
  assert.strictEqual(followRes.reason, 'already-chosen', '同一窗口只能选一次');
  // follow 单独开一个窗口。
  v.WA.storyWindow.open({ id: 'r6', place: '码头' });
  const followRes2 = v.WA.storyWindow.choose('r6', 'follow', { to: '码头', from: '客栈' });
  assert.strictEqual(followRes2.ok, true);
  assert.deepStrictEqual(sent[1].depart, ['player', '客栈', '码头', undefined], 'follow 必须按 (person, from, to, at) 位置参数调用');
  assert.strictEqual(followRes2.window.choiceOutcome.phase, 'in-transit');
  v.WA.storyWindow.open({ id: 'r7', place: '码头' });
  assert.strictEqual(v.WA.storyWindow.choose('r7', 'wait', {}).ok, true);
  assert.strictEqual(v.WA.storyWindow.choose('r7', 'ask', {}).reason, 'already-chosen');
  assert.strictEqual(v.WA.storyWindow.choose('r7', 'nope', {}).reason, 'bad-choice');

  
  // ── EX-5 / EX-7 / OP-1：新投影块与可见性规则 ──────────────────────────────
  const n = fresh();
  n.WA.store.transact(function (d) {
    d.people = { p_玩家: { name: '玩家', location: '客栈' },
      p_老张: { name: '老张', location: '客栈' } };
    // ① 机会：有承受者才可见，且只对承受者可见。
    d.opportunity = { openings: [
      { id: 'op:rumor:1', key: 'r1', stage: 'formed', title: '码头缺人手', sourceLabel: '传闻',
        actors: ['玩家'], lastAt: 1 },
      { id: 'op:rumor:2', key: 'r2', stage: 'formed', title: '别人的机会', actors: ['老张'] },
      { id: 'op:rumor:3', key: 'r3', stage: 'lapsed', title: '已失效的机会', actors: ['玩家'] },
      { id: 'op:rumor:4', key: 'r4', stage: 'formed', title: '无人可接的机会', actors: [] }
    ] };
    // ② 悬案：玩家自己的推理台账。
    d.threads = [
      { id: 'th1', question: '商队去向', status: 'open', leads: [{ id: 'l1' }] },
      { id: 'th2', question: '谁在夜里出城', status: 'stalled', leads: [] },
      { id: 'th3', question: '已结的案', status: 'resolved', leads: [] }
    ];
    // ③ 人物计划：只投现场人物的「正在做/卡住」，无地点不投。
    d.plan = { plans: [
      { personId: 'p_老张', steps: [{ seq: 1, status: 'running', text: '收拾货担' }] },
      { personId: 'p_玩家', steps: [{ seq: 1, status: 'pending', text: '平静的待办' }] },
      { personId: 'p_无名', steps: [{ seq: 1, status: 'running', text: '不知在哪的人' }] }
    ] };
    // ④ 私人未了结：只投玩家自己的记恨与悬空托付。
    d.humanRealism = { actors: {}, grudges: [
      { id: 'g1', who: '玩家', target: '掌柜', kind: 'breach_trust', reason: '说好的价又变了', settled: false },
      { id: 'g2', who: '老张', target: '玩家', kind: 'humiliation', reason: '被当众数落', settled: false }
    ], log: [] };
    d.socialLegacy = { legacies: [
      { id: 'lg1', successor: '玩家', description: '照看北道那间铺子', acceptStatus: 'pending' },
      { id: 'lg2', successor: '玩家', description: '已接受的托付', acceptStatus: 'accepted' }
    ], witnesses: [], claims: [], groupMemories: {}, handovers: {} };
  });
  n.WA.storyWindow.open({ id: 'r8', place: '客栈', playerPlace: '客栈' });
  const nb = n.WA.storyWindow.buildBlock({ viewer: '玩家', player: '玩家' });
  assert.ok(nb.indexOf('码头缺人手') >= 0, 'EX-5：承受者本人应看到机会');
  assert.strictEqual(nb.indexOf('别人的机会'), -1, 'EX-5：非承受者不得看到机会');
  assert.strictEqual(nb.indexOf('已失效的机会'), -1, 'EX-5：已失效机会不得进正文');
  assert.strictEqual(nb.indexOf('无人可接的机会'), -1, 'EX-5：无承受者的机会不进正文');
  assert.ok(nb.indexOf('待查：商队去向（已有 1 条线索）') >= 0, 'EX-5：悬案应可见并报线索数');
  assert.ok(nb.indexOf('待查：谁在夜里出城（还没有线索） — 目前停滞') >= 0, 'EX-5：停滞悬案应照实报');
  assert.strictEqual(nb.indexOf('已结的案'), -1, 'EX-5：已结案不进正文');
  assert.ok(nb.indexOf('老张正在：收拾货担') >= 0, 'OP-1：现场人物进行中的一步应可见');
  assert.strictEqual(nb.indexOf('平静的待办'), -1, 'OP-1：平静待办不进正文');
  assert.strictEqual(nb.indexOf('不知在哪的人'), -1, 'OP-1：地点未知的人不投（不是到处都是）');
  assert.ok(nb.indexOf('你还没放下对掌柜的背信') >= 0, 'EX-7：自己的记恨应可见');
  assert.strictEqual(nb.indexOf('被当众数落'), -1, 'EX-7：别人的记恨不得进玩家视野');
  assert.ok(nb.indexOf('照看北道那间铺子') >= 0, 'EX-7：悬空的托付应可见');
  assert.strictEqual(nb.indexOf('已接受的托付'), -1, 'EX-7：已接受的托付不再提醒');
  // 同一窗口换人看：老张看得到自己的机会，看不到玩家的心事。
  const zb2 = n.WA.storyWindow.buildBlock({ viewer: '老张', player: '老张' });
  assert.ok(zb2.indexOf('别人的机会') >= 0, 'EX-5：换成承受者本人后机会可见');
  assert.strictEqual(zb2.indexOf('码头缺人手'), -1, 'EX-5：机会不对旁人可见');
  assert.strictEqual(zb2.indexOf('你还没放下对掌柜'), -1, 'EX-7：私人记恨按 personal 规则隔离');
  assert.ok(zb2.indexOf('被当众数落') >= 0, 'EX-7：本人自己的记恨可见（同一份数据，换视角即换结果）');

  // ── 介入尝试计数：owner 拒收不锁窗口，但留账，且不写 choice ───────────────
  const q = fresh();
  q.WA.storyWindow.open({ id: 'r9', place: '码头' });
  const refused = q.WA.storyWindow.choose('r9', 'find', { clueId: 'c9' });   // 无 target/from
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(refused.retryable, true, 'owner 拒收必须标记可重试');
  assert.strictEqual(q.WA.storyWindow.current().choice, undefined, '拒收不得写 choice');
  assert.strictEqual(q.WA.storyWindow.current().status, 'opened', '拒收不得改动窗口状态');
  assert.strictEqual(q.WA.storyWindow.diagnose().checks.attempts, 1, '拒收必须留下尝试计数');
  assert.strictEqual(q.WA.storyWindow.diagnose().checks.lastAttempt, 'place-unknown');
  // 补全后同一窗口可以再试（未锁死）。
  q.WA.world = { depart: (p, f, t, at) => ({ ok: true, id: 'j9', status: 'in-transit' }) };
  const retried = q.WA.storyWindow.choose('r9', 'find', { clueId: 'c9', player: 'player', target: '集市' });
  assert.strictEqual(retried.ok, true, '拒收之后必须能用同一窗口重试');
  assert.strictEqual(retried.window.choiceOutcome.phase, 'in-transit');
  assert.strictEqual(q.WA.storyWindow.diagnose().checks.attempts, 1, '成功那次不计入「未成立尝试」');

  // ── 投影容错：畸形数据不得清空整表（且 faults 在干净数据上为零，不虚报）─────
  const f2 = fresh();
  f2.WA.store.transact(function (d) {
    d.livingWorld.livingTraces = [{ id: 't9', summary: '门口的湿脚印', place: '码头', visibleWhen: 'scene' }];
    // 畸形：actors 不是数组、grudges 里混入非对象、threads 里 leads 是数字。
    //   ——这些形状在真实宿主里出现过（外部写入/UGC/旧版本残留），不得让整块投影炸掉。
    d.opportunity = { openings: [{ id: 'op:bad', stage: 'formed', title: '坏数据', actors: 'not-an-array' }] };
    d.humanRealism = { actors: {}, grudges: [5, null, { id: 'g9', who: 'player', target: '掌柜', kind: 'contempt' }], log: [] };
    d.threads = [{ id: 'th9', question: '畸形的悬案', status: 'open', leads: 3 }];
  });
  f2.WA.storyWindow.open({ id: 'r10', place: '码头' });
  const fb = f2.WA.storyWindow.buildBlock({ viewer: 'player', player: 'player' });
  assert.ok(fb.indexOf('门口的湿脚印') >= 0, '畸形数据不得清空整张痕迹表');
  assert.ok(fb.indexOf('待查：畸形的悬案（还没有线索）') >= 0, 'leads 非数组时必须按「没有线索」处理而不是抛错');
  // 干净数据上 faults 必须为 0：既不能漏报，也不能虚报。
  assert.strictEqual(f2.WA.storyWindow.diagnose().projection.faults, 0, '畸形被兜住时不应记故障（非抛错路径）');

  console.log('story-window: ok');
})();