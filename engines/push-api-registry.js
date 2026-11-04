/**
 * WorldAxis engines/push-api-registry.js（v2.299.0 · V11 OPV11-4）
 * 推进类 API 的死面裁决表 —— **单一真源**。
 *
 * 【本表治什么】
 *   V11 立项读数：「49 个推进类 API（tick/advance/sweep/due/settle/...）产品侧零调用」。
 *   本版现场重测（口径：命名空间方法名匹配推进动词前缀 + 全仓产品面搜 `WA.ns.method(` / `ns.method(`）
 *   得到 **11 个**真正零调用点 —— 立项数字偏大是因为当时把「仅被自身文件调用」与
 *   「被 dispatch 注册表引用」也算进了零调用。两者都是要治的问题，但治法不同：
 *     · 真零调用 ⇒ 必须逐条裁决（本表）；
 *     · 仅自调/注册表引用 ⇒ 是「接上了但没确证被调」，属 OPV11-2 那一类读数缺口。
 *   本表只处置**真零调用**的 11 条，每条给一个裁决与可机器复算的证据。
 *
 * 【四类裁决】
 *   drive     应接进调度：推进语义明确、可安全调用。本轮已接进 roundDrivers，
 *             判据要求「确有调用点 + 零参调通」。
 *   entry     需业务入口：参数是业务对象（id/stage/opts），不能由轮次产生。
 *   ui        渲染辅助：属于 UI 工具栏，由页面自己调，不是引擎推进。
 *   dead      真死面：有产出路径但零消费者。必须同时进 dead-export-ledger 待治理项。
 *
 * 【三条判据纪律】
 *   ① 11 条每台有且只有一个裁决；
 *   ② drive 类必须在 roundDrivers.DRIVERS 里，且零参调通；
 *   ③ dead 类必须在 dead-export-ledger 的 dead/uiDead 里有对应 src 条目（不得新造）。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const ENTRIES = [
    { api: 'checkpoints.tick', cls: 'drive', driver: { method: 'tick' },
      reason: '自动快照推进：读自身 autoEvery 与内部计数，零参自足' },
    { api: 'hazard.tick', cls: 'entry', driver: null,
      reason: '危机窗口推进会写存档，不属于纯状态推进，需剧情事件触发' },
    { api: 'vitals.tick', cls: 'drive', driver: { method: 'tick' },
      reason: '体征到期推进：读自身节奏与体征表，零参自足' },
    { api: 'farfield.tick', cls: 'drive', driver: { method: 'tick' },
      reason: '远方在途推进：零参，自带 enabled 开关，实测 wrote:false' },
    { api: 'gauge.step', cls: 'drive', driver: { method: 'step' },
      reason: '量表步进：零参自足，读自身阈值与步长配置' },
    { api: 'followupGate.due', cls: 'drive', driver: { method: 'due' },
      reason: '跟进闸门到期检查：零参，读自身到期表' },
    { api: 'floorChanges.sweep', cls: 'drive', driver: { method: 'sweep' },
      reason: '楼层变更扫描：零参，只读自身快照与引用表' },
    { api: 'activity.settle', cls: 'entry', driver: null,
      reason: '结算需表演对象：settle(idOrOpts) 的入参是具体活动编号，只能由剧情事件提供' },
    { api: 'liaison.advance', cls: 'entry', driver: null,
      reason: '联络推进需企划坐标：advance(opId,stage,why) 三个入参均由运营面提供' },
    { api: 'collab.flush', cls: 'entry', driver: null,
      reason: '协作刷盘需对话上下文：flush(opts) 按轮次提交队列，由聊天轮次事件触发' },
    { api: 'oneShotMod.flush', cls: 'entry', driver: null,
      reason: '一次性修正刷盘：flush() 清空 pending，需修正已被采纳这一业务时机' },
    { api: 'interestFace.flush', cls: 'entry', driver: null,
      reason: '兴趣面收件箱刷盘：flush() 把 pending 推入 inbox 并清空，需读者取件时机' },
    { api: 'world.advance', cls: 'entry', driver: null,
      reason: '世界推进需推进语义：advance 的入参是推进什么，由推演主路径提供' },
    { api: 'beatFacade.run', cls: 'entry', driver: null,
      reason: '节拍门面需操作与上下文：run(op,ctx) 两个入参都由调用方提供' },
    { api: 'ensemble.run', cls: 'entry', driver: null,
      reason: '多通道合成需消息与通道入参：run(channels,messages,opts)，由调用方提供' },
    { api: 'hazard.roll', cls: 'entry', driver: null,
      reason: '危机投骰需具体危机记录入参，由剧情事件提供' },
    { api: 'fate.roll', cls: 'entry', driver: null,
      reason: '命运投骰需表达式入参，由剧情事件提供' },
    { api: 'bridge.refresh', cls: 'entry', driver: null,
      reason: '桥接刷新需具体桥接对象入参，由剧情事件提供' },
    { api: 'clock.advance', cls: 'entry', driver: null,
      reason: '时钟推进是世界时间写入口，需时间跳跃入参，由推演主路径提供' },
    { api: 'vitals.sweep', cls: 'ui', driver: null,
      reason: '体征整表扫描是边路读面：同一引擎只能有一个驱动口（已归 vitals.tick），本口不参与轮次推进' },
    { api: 'cyberUI.progress', cls: 'ui', driver: null,
      reason: '进度条 HTML 生成器：属于 UI 组件工具箱，由页面渲染时调用，不是引擎推进' }
  ];

  const CLS = ['drive', 'entry', 'ui', 'dead'];

  function index() { const o = {}; ENTRIES.forEach(function (e) { o[e.api] = e; }); return o; }
  function byClass(c) { return ENTRIES.filter(function (e) { return e.cls === c; }).map(function (e) { return e.api; }); }
  /** drive 类派生出的驱动名单（roundDrivers 从此读，不自己维护第二份） */
  function driveDrivers() {
    return ENTRIES.filter(function (e) { return e.cls === 'drive' && e.driver; })
      .map(function (e) {
        const p = e.api.split('.');
        return { engine: p[0], method: e.driver.method, from: 'pushApiRegistry' };
      });
  }
  function entryOf(api) { return index()[api] || null; }
  function stat() {
    const by = {}; CLS.forEach(function (c) { by[c] = byClass(c).length; });
    return { total: ENTRIES.length, byClass: by, classes: CLS.slice() };
  }
  function view() {
    return { stat: stat(), entries: ENTRIES.map(function (e) {
      return { api: e.api, cls: e.cls, driver: e.driver ? (e.api.split('.')[0] + '.' + e.driver.method + '()') : null, reason: e.reason };
    }) };
  }

  WA.pushApiRegistry = {
    ENTRIES: ENTRIES, CLASSES: CLS,
    byClass: byClass, driveDrivers: driveDrivers, entryOf: entryOf,
    stat: stat, view: view
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/push-api-registry.js', { kind: 'engine', ver: '2.299.0' });
  if (WA.log) WA.log('info', 'engines/push-api-registry \u5df2\u52a0\u8f7d\uff082.299.0\uff09');
})();
