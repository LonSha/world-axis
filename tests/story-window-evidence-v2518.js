// WorldAxis story-window v2.518.0 evidence-surface focused regression (OP-7 / OP-8 / OP-9)
//
// 锁住三件事（每件都对应一条「读不到 ≠ 一切正常」的口径）：
//   ① 上游 owner 全部缺席时，三组证据面必须是 unknown，不是 clean/aligned。
//   ② 上游报出真实问题（截断/降智/漂移）时，原因必须逐条出现在读数与正文块里。
//   ③ 单个 owner 抛错时，其余 owner 的读数照常给出，故障记进 faults，不静默吞掉。
'use strict';
const assert = require('assert');

function baseState() {
  return {
    storyWindow: { windows: [], pending: null },
    livingWorld: { livingTraces: [], npcMovements: [] },
    world: { messages: [], journeys: [] },
    acts: { rows: [], res: [] },
    foreshadows: [], rumor: { chains: [] },
    investigation: { clues: [], evidence: [] },
    elsewhere: { rows: [] },
    people: {}
  };
}

function fresh(extra) {
  let data = baseState();
  if (extra) data = Object.assign(data, extra);
  const WA = {
    clock: { now: () => 1700000000000 },
    store: {
      get: () => data,
      chatId: () => 'test-chat',
      transact: (fn) => { const draft = JSON.parse(JSON.stringify(data)); fn(draft); data = draft; return { ok: true }; }
    },
    settingsBus: { read: () => ({}), normalize: (_r, v) => v, saveOrThrow: (_r, v) => v },
    registerModule: () => {},
    __settingsRegs: []
  };
  global.window = { WorldAxis: WA };
  delete require.cache[require.resolve('../engines/story-window.js')];
  require('../engines/story-window.js');
  return { WA, get data() { return data; } };
}

(function run() {
  // ── ① 上游全缺席：必须 unknown，不得假装正常 ─────────────────────────────
  {
    const x = fresh();
    x.WA.storyWindow.open({ id: 'r0', text: '正文', chatLength: 1, place: '码头' });
    const ev = x.WA.storyWindow.evidence();
    assert.strictEqual(ev.stability.verdict, 'unknown', 'no stability owners => unknown');
    assert.strictEqual(ev.health.verdict, 'unknown', 'no health owners => unknown');
    assert.strictEqual(ev.routing.verdict, 'unknown', 'no routing owners => unknown');
    assert.deepStrictEqual(ev.stability.reasons, []);
    assert.deepStrictEqual(ev.health.reasons, []);
    // 正文块不得因为「读不到」就加注记 —— 未知不加戏，也不删事实。
    const block = x.WA.storyWindow.buildBlock({ place: '码头', viewer: 'player' });
    assert.strictEqual(block.indexOf('中断或降智迹象'), -1, 'absent owners must not fabricate caveat');
  }

  // ── ② 上游都健康：verdict 转 clean/stable/aligned，且不加注记 ─────────────
  {
    const x = fresh();
    x.WA.reasoningStrip = { stat: () => ({ calls: 3, had: 0, held: 0, blocked: 0 }) };
    x.WA.replyGuard = { diagnose: () => ({ ok: true, status: 'ready' }) };
    x.WA.rejectRecovery = { stat: () => ({ asks: 4, unknown: 0 }) };
    x.WA.advanceIdem = { stat: () => ({ rounds: 2, dups: 0, aborts: 0 }) };
    x.WA.degradeAudit = { stat: () => ({ baselines: 1, tpsDrops: 0, tokenDrops: 0 }) };
    x.WA.modelReceipt = {
      drifters: () => ({ ok: true, clean: true, total: 0, pairs: [] }),
      stats: () => ({ ok: true, records: 3, channels: [{ channel: 'main', count: 3, lastRespModel: 'm-1', drifts: 0 }] })
    };
    x.WA.factContinuity = { stat: () => ({ faults: {} }) };
    x.WA.modelPin = { audit: () => ({ ok: true, pinned: 1, clean: true, drifters: [] }) };
    x.WA.callTimeline = { view: () => ({ ok: true, rounds: [{ roundId: 'rd1', criticalChannel: 'main', totalMs: 900, longestMs: 600 }] }) };
    x.WA.tokenBudget = { view: () => ({ ok: true, channels: [{ channel: 'main', p95Ms: 800, completionTokens: 500 }] }) };
    x.WA.storyWindow.open({ id: 'r1', text: '正文', chatLength: 2, place: '码头' });
    const ev = x.WA.storyWindow.evidence();
    assert.strictEqual(ev.stability.verdict, 'stable');
    assert.strictEqual(ev.health.verdict, 'clean');
    assert.strictEqual(ev.routing.verdict, 'aligned');
    // 路由组要真的读出「谁应答了」与「卡在哪一段」。
    assert.strictEqual(ev.routing.models[0].respModel, 'm-1');
    assert.strictEqual(ev.routing.critical.criticalChannel, 'main');
    assert.strictEqual(ev.routing.pinned.clean, true);
    const block = x.WA.storyWindow.buildBlock({ place: '码头', viewer: 'player' });
    assert.strictEqual(block.indexOf('中断或降智迹象'), -1, 'healthy owners must not add caveat');
  }

  // ── ③ 上游真有迹象：原因逐条出现在读数与正文块里 ─────────────────────────
  {
    const x = fresh();
    x.WA.reasoningStrip = { stat: () => ({ held: 2, blocked: 0 }) };
    x.WA.advanceIdem = { stat: () => ({ dups: 5, aborts: 1 }) };
    x.WA.degradeAudit = { stat: () => ({ tpsDrops: 1, tokenDrops: 2 }) };
    x.WA.modelReceipt = { drifters: () => ({ ok: true, total: 1, pairs: [{ channel: 'main' }] }) };
    x.WA.storyWindow.open({ id: 'r2', text: '正文', chatLength: 3, place: '码头' });
    const ev = x.WA.storyWindow.evidence();
    assert.strictEqual(ev.stability.verdict, 'unstable');
    assert.ok(ev.stability.reasons.join('|').indexOf('思维链尾部被扣住') >= 0);
    assert.ok(ev.stability.reasons.join('|').indexOf('推进被中止') >= 0);
    // dups 是「拦下来的重复推进」：说明幂等闸在工作，**不能算不稳**。
    assert.ok(ev.stability.sources.indexOf('advanceIdem.dupBlocked=5') >= 0, 'blocked duplicates are evidence of health');
    assert.strictEqual(ev.health.verdict, 'degraded');
    assert.ok(ev.health.reasons.join('|').indexOf('吐字速度比基线掉过') >= 0);
    assert.ok(ev.health.reasons.join('|').indexOf('请求/回执模型对不上') >= 0);
    const block = x.WA.storyWindow.buildBlock({ place: '码头', viewer: 'player' });
    assert.ok(block.indexOf('中断或降智迹象') >= 0, 'unstable/degraded must surface in prose block');
    assert.ok(block.indexOf('思维链尾部被扣住') >= 0);
    assert.ok(block.indexOf('吐字速度比基线掉过') >= 0);
    // 注记只加一句，且明确说「可能不完整」而不是宣称失败。
    assert.ok(block.indexOf('可能不完整') >= 0);
  }

  // ── ④ 单个 owner 抛错：其余照常，故障进 faults ───────────────────────────
  {
    const x = fresh();
    x.WA.reasoningStrip = { stat: () => { throw new Error('boom-strip'); } };
    x.WA.replyGuard = { diagnose: () => ({ ok: true, status: 'ready' }) };
    x.WA.storyWindow.open({ id: 'r3', text: '正文', chatLength: 4, place: '码头' });
    const ev = x.WA.storyWindow.evidence();
    // 抛错那一条进 faults，但同组其它 owner 仍被读到 —— 不是「一错全空」。
    assert.ok(ev.stability.faults.join('|').indexOf('reasoningStrip:boom-strip') >= 0);
    assert.ok(ev.stability.sources.indexOf('replyGuard') >= 0);
    assert.strictEqual(ev.stability.verdict, 'stable', 'remaining healthy owner keeps verdict honest');
    // 诊断面必须把 evidence 一起暴露出去（OP-7/8/9 的可读出口）。
    const d = x.WA.storyWindow.diagnose();
    assert.ok(d.evidence && d.evidence.stability && d.evidence.health && d.evidence.routing);
    assert.ok(d.evidence.stability.faults.length > 0);
  }

  // ── ⑤ 幂等自证位（OP-7）：同一 replyId 只应有一条窗口 ────────────────────
  {
    const x = fresh();
    x.WA.storyWindow.open({ id: 'r4', text: '正文', chatLength: 5, place: '码头' });
    x.WA.storyWindow.open({ id: 'r4', text: '正文', chatLength: 5, place: '码头' });
    assert.strictEqual(x.data.storyWindow.windows.length, 1, 'stable replyId must not create a second window');
    assert.strictEqual(x.WA.storyWindow.diagnose().checks.idempotent, true);
  }

  // ── ⑥ 畸形读数不炸：owner 返回非对象时如实降级 ──────────────────────────
  {
    const x = fresh();
    x.WA.reasoningStrip = { stat: () => null };
    x.WA.replyGuard = { diagnose: () => 'not-an-object' };
    x.WA.degradeAudit = { stat: () => 42 };
    x.WA.modelReceipt = { drifters: () => undefined, stats: () => null };
    x.WA.callTimeline = { view: () => ({ ok: true, rounds: 'not-an-array' }) };
    x.WA.storyWindow.open({ id: 'r5', text: '正文', chatLength: 6, place: '码头' });
    const ev = x.WA.storyWindow.evidence();
    // 不抛错就是底线；读数不因为畸形数据编造出原因。
    assert.deepStrictEqual(ev.stability.reasons, []);
    assert.deepStrictEqual(ev.health.reasons, []);
    assert.strictEqual(ev.routing.critical, null);
    assert.ok(x.WA.storyWindow.buildBlock({ place: '码头', viewer: 'player' }).length > 0);
  }

  console.log('story-window evidence v2.518.0 OK');
})();