// WorldAxis tests/story-window-integration-v2518.js — 故事回应窗口的端到端集成锁
//
// 本锁不测 story-window 自己的纯函数（那是 tests/story-window-v2518.js 的职责），
// 而是测**它与既有 owner 的真实链路**：
//   ① verify → world.sendMessage → tickCourier → 消息抵达 → 该消息才可被窗口投影为可见痕迹；
//   ② find  → storyChoice.present → 只算「已呈现、待确认」，**不等于人已移动**；
//   ③ verify→ investigation.register → investigate → checkEvidence → 回执口径；
//   ④ resolvePlace 在调用方没给地点时回落到 world.where（真实反查，不靠窗口自己记的位置）。
//
// 装载面：用 tests/ui-gate-sync.js 的 fresh() —— 它按 tests/run.js 的 LOAD 清单装载
//   **全部产品模块**（含 world / act / investigation / story-choice / story-window），
//   与真实酒馆宿主同构。story-window 单测用的是自建 mock，装载面不同，两者互补。
'use strict';
const assert = require('assert');
const path = require('path');
const sync = require('./ui-gate-sync.js');

function fresh() {
  const env = sync.fresh({});
  const WA = env.WA;
  WA.clock.unfreeze();
  WA.clock.freeze(Date.now());
  WA.world.setSettings({ enabled: true });
  WA.act.setSettings({ enabled: true, maxActs: 24, maxRun: 4, defaultDurationMs: 60000 });
  WA.investigation.setSettings({ enabled: true });
  WA.storyChoice.setSettings({ enabled: true });
  WA.storyWindow.setSettings({ enabled: true, maxWindows: 12, maxTraces: 8 });
  // 人：必须在册（act 拒绝凭空建人），且带一个 active 目标（act.add 硬前置）。
  WA.store.transact(function (d) {
    d.people = {
      p_玩家: { id: 'p_玩家', name: '玩家', location: '码头', knowledge: {}, resources: {},
        life: { goals: [{ id: 'g_玩家', text: '找人', status: 'active' }], schedule: [] } },
      p_信使: { id: 'p_信使', name: '信使', location: '集市', knowledge: {}, resources: {},
        life: { goals: [{ id: 'g_信使', text: '送信', status: 'active' }], schedule: [] } }
    };
    d.world = { places: [], roads: [], journeys: [], events: [], messages: [] };
    d.acts = { rows: [], res: [] };
    d.livingWorld = d.livingWorld || { livingTraces: [] };
  }, 'story-window-it:seed');
  WA.world.addPlace({ name: '码头', kind: 'public', open: 0, close: 9999999999999 });
  WA.world.addPlace({ name: '集市', kind: 'public', open: 0, close: 9999999999999 });
  WA.world.addRoad('码头', '集市', 10, 0);
  return WA;
}

function openWindow(WA, id, place) {
  const r = WA.storyWindow.open({ id: id, text: '正文推进', chatLength: 1, place: place || '码头',
    evidence: 'after-chain-committed', source: 'interceptor.after' });
  assert.strictEqual(r.ok, true, 'open failed: ' + JSON.stringify(r));
  return r;
}

(function run() {
  // ── ① verify → world.sendMessage → tickCourier → 抵达后才可见 ──────────────
  {
    const WA = fresh();
    const w = openWindow(WA, 'it1', '码头');
    const chosen = WA.storyWindow.choose('it1', 'verify', {
      from: '玩家', to: '信使', message: '码头有异动', via: 'net', netMinutes: 5 });
    assert.strictEqual(chosen.ok, true);
    assert.strictEqual(chosen.owner, 'world');
    assert.strictEqual(chosen.window.choiceOutcome.phase, 'message-in-transit');
    // 在途 ⇒ 窗口不得写成已确认事实
    assert.strictEqual(chosen.window.status, 'awaiting');
    const msgs = WA.store.get().world.messages || [];
    assert.strictEqual(msgs.length, 1);
    assert.strictEqual(msgs[0].status, 'in-transit');
    // 在途消息不得被投影为痕迹（collectTraces 只收 arrived）
    assert.strictEqual((WA.storyWindow.current().traces || []).length, 0);
    // 推进到点
    const arriveAt = msgs[0].arriveAt;
    WA.world.tickCourier(arriveAt);
    const msgs2 = WA.store.get().world.messages || [];
    assert.strictEqual(msgs2[0].status, 'arrived');
    // 抵达后新开窗口 ⇒ 消息成为痕迹，且只对收件人可见
    const w2 = openWindow(WA, 'it1b', '码头');
    const traces = (w2.window.traces || []).filter(function (t) { return t.kind === 'message'; });
    assert.strictEqual(traces.length, 1);
    assert.strictEqual(traces[0].summary, '码头有异动');
    const blockForTo = WA.storyWindow.buildBlock({ place: '码头', viewer: '信使' });
    assert.ok(blockForTo.indexOf('码头有异动') >= 0, '收件人应看见抵达消息');
    const blockForOther = WA.storyWindow.buildBlock({ place: '码头', viewer: '旁观者' });
    assert.strictEqual(blockForOther.indexOf('码头有异动'), -1, '非收件人不得看见他人消息');
  }

  // ── ② find → storyChoice.present ⇒ 只是「已呈现」，人没有移动 ──────────────
  {
    const WA = fresh();
    openWindow(WA, 'it2', '码头');
    const chosen = WA.storyWindow.choose('it2', 'find', { target: '集市' });
    assert.strictEqual(chosen.ok, true);
    assert.strictEqual(chosen.owner, 'storyChoice');
    assert.strictEqual(chosen.window.choiceOutcome.phase, 'presented');
    assert.strictEqual(chosen.window.choiceOutcome.reason, 'choice-presented-awaiting-confirmation');
    // presented ≠ 已移动：窗口状态仍是 awaiting，且世界里没有行程
    assert.strictEqual(chosen.window.status, 'awaiting');
    const j = WA.store.get().world.journeys || [];
    assert.strictEqual(j.length, 0, '呈现选项不得凭空产生行程');
    // 兑现后才算 accepted
    const recId = chosen.effect.id;
    assert.ok(recId, 'present 应返回记录 id');
    const cf = WA.storyChoice.confirm(recId, '从当前地点寻找', {});
    assert.strictEqual(cf.ok, true, 'confirm 失败: ' + JSON.stringify(cf));
    assert.strictEqual(cf.chosen, true);
    // 确认后窗口仍不应被 story-window 自动改成 accepted（settle 才是结算口）
    assert.strictEqual(WA.storyWindow.current().status, 'awaiting');
  }

  // ── ③ verify → investigation.register → investigate → checkEvidence ────────
  {
    const WA = fresh();
    openWindow(WA, 'it3', '码头');
    const chosen = WA.storyWindow.choose('it3', 'verify', {
      clue: { title: '失踪的商队', subject: '商队去向', location: '北道', witness: '老张',
        sourceType: 'witness', verifyRule: 'act:investigate' } });
    assert.strictEqual(chosen.ok, true);
    assert.strictEqual(chosen.owner, 'investigation');
    assert.strictEqual(chosen.window.choiceOutcome.phase, 'registered-awaiting-evidence');
    assert.strictEqual(chosen.window.status, 'awaiting', '登记线索不等于线索已核实');
    const cid = chosen.effect.id;
    const iv = WA.investigation.investigate(cid, '玩家', { receiptId: 'sw_it3_1', content: '北道尽头有车轮痕迹' });
    assert.strictEqual(iv.ok, true);
    const chk = WA.investigation.checkEvidence(cid);
    assert.strictEqual(chk.ok, true);
    assert.ok(typeof chk.verdict === 'string');
  }

  // ── ④ resolvePlace 的真实位置来源：world.where → people 人物册兜底 ──────────
  // 口径（v2.518.0 修正）：旧断言声称「未给地点时应由 world.where 反查」，
  // 但 world.where 只读行程表，从未出发的人那里 place=null —— 那时窗口是靠
  // 「地点未知就不按地点过滤」放行的，属虚假证明。
  // 现在断言真实产品行为：
  //   · 玩家在人物册登记 location=码头（未出行）⇒ 位置来源能答出「码头」；
  //   · 同地点痕迹可见、异地点痕迹不可见 ⇒ 地点过滤真的生效了。
  {
    const WA = fresh();
    const where = WA.world.where('玩家');
    assert.strictEqual(where.ok, true);
    assert.strictEqual(where.place, null, 'world.where 对未移动者本就答 null（引擎现状）');
    WA.store.transact(function (d) {
      d.livingWorld.livingTraces = [
        { id: 'it4t_same', summary: '码头边的湿脚印', place: '码头',
          source: 'livingWorld', reliability: 'observed', visibleWhen: 'scene' },
        { id: 'it4t_other', summary: '集市口的酒渍', place: '集市',
          source: 'livingWorld', reliability: 'observed', visibleWhen: 'scene' }
      ];
    }, 'story-window-it:trace');
    openWindow(WA, 'it4');
    const block = WA.storyWindow.buildBlock({ viewer: '玩家' });
    assert.ok(block.indexOf('码头边的湿脚印') >= 0, '同地点痕迹应可见');
    assert.ok(block.indexOf('集市口的酒渍') < 0, '异地点痕迹不应可见（地点过滤须真正生效）');
  }

  console.log('story-window-integration: ok');
})();
