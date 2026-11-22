/**
 * WorldAxis engines/l3-registry.js（v2.299.0 · V11 OPV11-3）
 * L3 悬空引擎的四类分级登记表 —— **单一真源**。
 *
 * 【本表治什么】
 *   V7 OPV7-8 把 35 台从 full 档移除并标注「需手动录入数据」，V8 OPV8-4 只把其中 7 台
 *   接进了 roundDrivers。剩下 28 台**既不在驱动名单里，也没有任何地方写明「为什么不在」**。
 *   于是「这 28 台是真死面」与「这 28 台只是没人叫过」在读数上完全同形 —— V11 的同一族病。
 *
 * 【本表的四类口径】
 *   A zero-arg  零参可驱动：推进口不需要任何剧情判断（interval/due/gate 一类纯状态机），
 *               应收进 roundDrivers 由轮次循环每轮叫一声。
 *   B needs-input 需剧情入参：写口语义是「发生了一件事」（open/submit/train/declare…），
 *               必须由具体剧情事件提供入参。硬塞轮次等于替玩家做剧情判断。
 *   C decision   玩家决策面：写口是玩家意志的表达（lock/setGear/setTone…），
 *               只能从面板或写口台进入。
 *   D dead       真死面：无消费者且无产出路径 —— 必须同时是 dead-export-ledger 的既有项。
 *
 * 【五条硬纪律】
 *   ① 28 台每台**有且只有一个**分类（不许两处各写一份名单）；
 *   ② A 类必须真实出现在 roundDrivers.DRIVERS 里，且零参调通不抛；
 *   ③ B/C 类必须写清「需要什么入参 / 由谁提供」，空理由判红；
 *   ④ D 类必须是 dead-export-ledger 既有项，不得新造；
 *   ⑤ 本表与现场双向一致：现场多一台、表里少一台都判红（由 tests/v11-l3-registry.js 断言）。
 *
 * 【实测依据】2026-11-05 现场逐台零参调用（`/tmp/v11p3e.js` 系列，结论已固化，不依赖 /tmp 存活）：
 *   contest.advanceRound / fondness.advance / events.due / genTiming.tick / beatMask.advance /
 *   powerAnchor.round / tempo.check / genGate.gate / temporalLock.check / powerAnchor.check
 *   全部安全返回（{ok:false,reason:'disabled'} 一族或数值 0），**零抛异常、零存档改动**。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  /**
   * 28 台的逐台裁决。
   *   cls: 'zero-arg' | 'needs-input' | 'decision' | 'dead'
   *   driver: A 类必填 { method }（B/C/D 必须为 null）
   *   reason: 一句话说明「为什么是这一类」（B/C 类必须写清入参契约与提供方）
   */
  const ENTRIES = [
    // ── A 类：零参可驱动（本轮新增 3 台；原 7 台已在 DRIVERS 里，不属本表 28 台范围）──
    { engine: 'genTiming', cls: 'zero-arg', driver: { method: 'tick' },
      reason: '生成时机窗口推进：读自身 enabled 与时钟，零参自足（实测 {ok:true,shouldSend:false,reason:\'disabled\'}）' },
    { engine: 'beatMask', cls: 'zero-arg', driver: { method: 'advance' },
      reason: '节拍遮罩推进：纯状态机按轮次前移，不需要剧情入参（实测 {ok:false,reason:\'disabled\'}）' },
    { engine: 'temporalLock', cls: 'zero-arg', driver: { method: 'check' },
      reason: '时间锁到期检查：只读时钟与自身锁表，零参自足（实测 {ok:true,reason:\'disabled\'}）' },

    // ── B 类：需剧情入参 ──────────────────────────────────────────────────
    { engine: 'contest', cls: 'needs-input', driver: null,
      reason: '比拼需要「比什么、谁跟谁比」：open(contestSpec) 的入参只能来自剧情事件；advanceRound 单独调无意义' },
    { engine: 'ruling', cls: 'needs-input', driver: null,
      reason: '裁决需要案件与证据：open/submit/rule 全部要求案卷入参，由剧情事件提供' },
    { engine: 'fondness', cls: 'needs-input', driver: null,
      reason: '好感变动需要「谁对谁因何变动」：apply/propose 需 target+delta+reason，由剧情事件提供' },
    { engine: 'events', cls: 'needs-input', driver: null,
      reason: '事件排期需 schedule(at,title,...) 的剧情内容；due() 只读在途表，不产生新事实' },
    { engine: 'ladder', cls: 'needs-input', driver: null,
      reason: '天梯升降需「谁因何升/降」：define/escalate/deescalate 均需等级与理由入参' },
    { engine: 'karma', cls: 'needs-input', driver: null,
      reason: '因果记账需 record(actor,delta,cause) 的因果内容，由剧情事件提供' },
    { engine: 'beastBond', cls: 'needs-input', driver: null,
      reason: '兽契需 register/train/bond 的对象与行为入参' },
    { engine: 'rivalry', cls: 'needs-input', driver: null,
      reason: '对立关系需 declare(a,b,reason) 的双方与缘由' },
    { engine: 'enigma', cls: 'needs-input', driver: null,
      reason: '谜题需 mark(秘密内容) 的剧情素材' },
    { engine: 'masks', cls: 'needs-input', driver: null,
      reason: '假面需 setMask(who,mask) 的人格与对象入参' },
    { engine: 'parallelEvents', cls: 'needs-input', driver: null,
      reason: '场外事件需 add(place,headline) 的剧情内容' },
    { engine: 'warrant', cls: 'needs-input', driver: null,
      reason: '通缉需 report(target,crime) 的对象与罪名' },
    { engine: 'appearance', cls: 'needs-input', driver: null,
      reason: '出场需 register(who,where,when) 的到场证据' },
    { engine: 'sceneSlice', cls: 'needs-input', driver: null,
      reason: '场景切片需 resolveSegment(segments) 的分段内容' },
    { engine: 'lingqi', cls: 'needs-input', driver: null,
      reason: '灵契需 register/seed 的技能与来源入参' },
    { engine: 'powerAnchor', cls: 'needs-input', driver: null,
      reason: '力量锚需 anchor(name,level) 的对象入参；round()/check() 只读锚表不产生新事实' },
    { engine: 'memoryTiers', cls: 'needs-input', driver: null,
      reason: '记忆分层需 knot/sink(memId,tier) 的对象与层位入参' },
    { engine: 'genGate', cls: 'needs-input', driver: null,
      reason: '生成闸门需 gate(ctx) 的上下文判定；零参调只会得到 gated-off，属于「没人给它上下文」' },
    { engine: 'reasoning', cls: 'needs-input', driver: null,
      reason: '推理轨需 directive(text) 的指令内容；checkBody 需待检正文' },

    // ── C 类：玩家决策面 ──────────────────────────────────────────────────
    { engine: 'backstageTone', cls: 'decision', driver: null,
      reason: '叙事基调是玩家/作者的表达选择：setSettings 由设置面进入，不参与轮次推进' },
    { engine: 'userlock', cls: 'decision', driver: null,
      reason: '玩家锁定是玩家意志：lock/unlock 只能从写口台进入' },
    { engine: 'tempo', cls: 'decision', driver: null,
      reason: '节奏档位是玩家选择：setGear 由面板进入；check()/current() 只读' },
    { engine: 'storyTone', cls: 'decision', driver: null,
      reason: '文风基调是玩家/作者选择：set 由设置面进入' },
    { engine: 'temperament', cls: 'decision', driver: null,
      reason: '性情设定是作者定调：setTemperament 由设置面进入' },
    { engine: 'beatReport', cls: 'decision', driver: null,
      reason: '节拍报告是给玩家看的读面：report/view/diagnose 全是读口，无推进语义' }
  ];

  const CLS = ['zero-arg', 'needs-input', 'decision', 'dead'];

  function index() {
    const out = {};
    ENTRIES.forEach(function (e) { out[e.engine] = e; });
    return out;
  }
  /** 按类取名单（派生方唯一的取数口，禁止各处自己 filter 重写一份） */
  function byClass(cls) {
    return ENTRIES.filter(function (e) { return e.cls === cls; }).map(function (e) { return e.engine; });
  }
  /** A 类派生出的驱动名单（roundDrivers 从此读，不自己维护第二份） */
  function zeroArgDrivers() {
    return ENTRIES.filter(function (e) { return e.cls === 'zero-arg' && e.driver; })
      .map(function (e) { return { engine: e.engine, method: e.driver.method, from: 'l3Registry' }; });
  }
  function entryOf(engine) { return index()[engine] || null; }
  function stat() {
    const by = {};
    CLS.forEach(function (c) { by[c] = byClass(c).length; });
    return { total: ENTRIES.length, byClass: by, classes: CLS.slice() };
  }
  function view() {
    return {
      stat: stat(),
      entries: ENTRIES.map(function (e) {
        return { engine: e.engine, cls: e.cls, driver: e.driver ? (e.engine + '.' + e.driver.method + '()') : null, reason: e.reason };
      })
    };
  }

  WA.l3Registry = {
    ENTRIES: ENTRIES,
    CLASSES: CLS,
    byClass: byClass,
    zeroArgDrivers: zeroArgDrivers,
    entryOf: entryOf,
    stat: stat,
    view: view
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/l3-registry.js', { kind: 'engine', ver: '2.299.0' });
  if (WA.log) WA.log('info', 'engines/l3-registry 已加载（2.299.0）');
})();
