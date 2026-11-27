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
 *   本表只处置**真零调用**的那些 API，每条给一个裁决与可机器复算的证据。
 *   v2.382.0 表跟位：`floorChanges.sweep` / `world.advance` / `beatFacade.run` 已被
 *   `engines/action-desk.js` 的 ROUTES 分发表真实调用（`WA.ns.method(` 形态，非注释/字符串），
 *   按本表「真零调用」口径它们不该再占裁决位 ⇒ 出表（连带 `floorChanges.sweep` 退出 drive 派生）；
 *   `choiceBoard.refresh` 现场复算为零调用且未归 l3/基线 ⇒ 补入本表并裁决为 ui。
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
 *   v2.524.0 归口：21 条老引擎的推进口在覆盖率锁 C2 上被判「真零调用且未裁决」，
 *   本表逐台裁决（2 drive / 19 entry）——判据与四类语义均未改，只是把当时漏登的补齐。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  // v2.407.0 跟位：vitals.tick / gauge.step / oneShotMod.flush / vitals.sweep 已由
  //   actionDesk.ROUTES 登记为可执行动作（vitals.tick、vitals.sweep、gauge.step、
  //   oneShotMod.flush 四条路由），产品侧出现真实调用点 ⇒ 「真零调用」前提失效，
  //   四条裁决移除；它们的轮次/时机驱动由路由执行面承接（driver-ledger L2r）。
  const ENTRIES = [
    { api: 'checkpoints.tick', cls: 'drive', driver: { method: 'tick' },
      reason: '自动快照推进：读自身 autoEvery 与内部计数，零参自足' },
    { api: 'hazard.tick', cls: 'entry', driver: null,
      reason: '危机窗口推进会写存档，不属于纯状态推进，需剧情事件触发' },
    { api: 'farfield.tick', cls: 'drive', driver: { method: 'tick' },
      reason: '远方在途推进：零参，自带 enabled 开关，实测 wrote:false' },
    // v2.566.0 裁决过期：`followupGate.due` 已有**真产品调用点** ——
    //   engines/spotlight.js:202 的轻提静默闸每轮 `WA.followupGate.due({ item, idleMinutes, at })`。
    //   按本表自身纪律（「有产品调用点 ⇒ 裁决过期」），条目移除。
    { api: 'activity.settle', cls: 'entry', driver: null,
      reason: '结算需表演对象：settle(idOrOpts) 的入参是具体活动编号，只能由剧情事件提供' },
    { api: 'liaison.advance', cls: 'entry', driver: null,
      reason: '联络推进需企划坐标：advance(opId,stage,why) 三个入参均由运营面提供' },
    { api: 'collab.flush', cls: 'entry', driver: null,
      reason: '协作刷盘需对话上下文：flush(opts) 按轮次提交队列，由聊天轮次事件触发' },
    { api: 'interestFace.flush', cls: 'entry', driver: null,
      reason: '兴趣面收件箱刷盘：flush() 把 pending 推入 inbox 并清空，需读者取件时机' },
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
    // v2.611.0（R286 二号事 / R7 偿还）补登：`arcGuideBridge.advance` 一直是推进动词前缀的
    //   真零调用点（现场 42 vs 表 40）。为何不裁 drive：它确实零参可调，但零参时的语义是
    //   `cur + 1`——而本模块头注纪律 2 明写「不猜楼层，读不到就回空块」。轮次每轮替它 +1
    //   等于把「猜出来的在场」写回存档，比缺席更坏。故裁 entry：楼层只能由业务面给。
    { api: 'arcGuideBridge.advance', cls: 'entry', driver: null,
      reason: '手动楼层推进口：楼层真源是宿主聊天（chat.length-1），轮次替它自动 +1 就等于猜楼层——本模块七条纪律第 2 条明写不猜楼层，故只接受业务面/面板/测试给的具体楼层' },
    { api: 'cyberUI.progress', cls: 'ui', driver: null,
      reason: '进度条 HTML 生成器：属于 UI 组件工具箱，由页面渲染时调用，不是引擎推进' },
    { api: 'choiceBoard.refresh', cls: 'ui', driver: null,
      reason: '选项板重绘口：由页面在字体/布局变化后调用，不是引擎推进，故不进轮次' },
    // v2.611.0（R286 二号事 / R7 偿还）补登：`panelFacesPage.refresh` 同批现场多出一条。
    //   它其实是**页内自调**（ui/pages/faces-page.js 的 bind 处理器里 5 处 `refresh()`），
    //   本锁口径只认 `WA.ns.method(` / `ns.method(` 形态，因此自调不产生调用点 —— 这正是
    //   「真零调用」两类形态里「仅自调」那一类的判据盲区，故裁 ui 而不是 dead。
    { api: 'panelFacesPage.refresh', cls: 'ui', driver: null,
      reason: '人物卡页重绘口：由 panel.js 的 bind 处理器在换页/翻面/重载后自调（页内 5 处 refresh()），属 UI 渲染辅助，不是引擎推进' },
    // ── v2.524.0 归口：V11 覆盖率锁（tests/v11-push-api-coverage.js）的 C2 在收口轮次里
    //    复算出 21 条「真零调用且未裁决」——全是 v2.55～v2.517 之间落地的老引擎推进口，
    //    当时只做了「存在 + 自调」，没人接进任何调用面。逐台核过证据后按同一把尺子归口：
    //      ① cls='drive' 只给「零参调用不抛、且不改存档」的两台（longline.sweep /
    //         ecoAudit.sweep，实测 mutated=false）；
    //      ② 其余 19 台一律 'entry'：其中 world.tick / life.tick / opportunity.sweep /
    //         diplomacy.expire 零参虽不抛但**会写存档**（实测 mutated=true），按 A4「drive
    //         必须零参不改存档」不许进轮次；另外十几台的入参本身就是业务对象
    //         （人 / 项目 / 委托 / 组织 / 实验规格），轮次造不出来。
    //    为什么不硬接进 roundDrivers：那会把「世界怎么变」改成每轮自动发生，
    //    属剧情语义决策，不是归口轮次该顺手做的事。本批只把「零调用」这件事**显式化**，
    //    与 dead-export-ledger 的 self-only 归因不同源、也不互相顶替。
    { api: 'longline.sweep', cls: 'drive', driver: { method: 'sweep' },
      reason: '长线伏笔逾期扫描：零参安全且不写存档（实测 mutated=false），只读到期表' },
    { api: 'ecoAudit.sweep', cls: 'drive', driver: { method: 'sweep' },
      reason: '世界生态自洽审计：零参只读扫描，不写存档（实测 mutated=false），适合每轮跑' },
    { api: 'world.tick', cls: 'entry', driver: null,
      reason: '世界织体推进零参即可调但会写存档（实测 mutated=true），故需剧情事件提供推进时机，轮次不自作主张' },
    { api: 'life.tick', cls: 'entry', driver: null,
      reason: '人物生活推进零参即可调但会写存档（实测 mutated=true），日程事实需由剧情事件提供' },
    { api: 'opportunity.sweep', cls: 'entry', driver: null,
      reason: '机会形成扫描零参可调但会写存档（实测 mutated=true），机会何时成熟需由剧情节奏提供' },
    { api: 'diplomacy.expire', cls: 'entry', driver: null,
      reason: '外交到期清理零参可调但会写存档（实测 mutated=true），到期判定需与推演主路径同拍' },
    { api: 'parallelWorld.advance', cls: 'entry', driver: null,
      reason: '平行世界推进是异步口（返回 Promise），同步轮次循环无法消费其结果，需外部驱动' },
    { api: 'worldLab.advance', cls: 'entry', driver: null,
      reason: '隔离世界实验推进：零参会自造一次实验轮次（实测产出 adv_* 记录），故需调用方给出实验规格' },
    { api: 'training.progress', cls: 'entry', driver: null,
      reason: '训练进度需具体人物入参（progress(who)），由训练事件提供，轮次造不出人' },
    { api: 'survey.advance', cls: 'entry', driver: null,
      reason: '探索推进需侦察目标与选项（advance(opts)），未开侦察时直接拒（scout-closed）' },
    { api: 'oracle.advance', cls: 'entry', driver: null,
      reason: '占卜推进需已登记的占卜计划（零参调用直接抛 plan 未定义），由剧情事件铺好再推' },
    { api: 'collab.settle', cls: 'entry', driver: null,
      reason: '协作结算需任务编号（settle(taskId0,opts)），零参拒 bad-task，任务只能由协作面产生' },
    { api: 'mend.step', cls: 'entry', driver: null,
      reason: '关系修复推进需人物、事项与类型（step(person,id,kind,opts)），零参拒 bad-kind' },
    { api: 'economy.tick', cls: 'entry', driver: null,
      reason: '经济推进需时间戳与选项（tick(stamp,opts)），零参拒 missing-stamp，时间由时钟统一给' },
    { api: 'inst.settle', cls: 'entry', driver: null,
      reason: '组织制度结算需组织与分支编号（settle(orgId,brId,opts)），零参拒 missing-evidence' },
    { api: 'lifeline.advance', cls: 'entry', driver: null,
      reason: '生理照护推进需人物/病情/疗程四参（advance(person,condition,course,opts)），零参拒 missing-fields' },
    { api: 'commission.advance', cls: 'entry', driver: null,
      reason: '多阶段委托推进需委托编号与回执（advance(id,receiptId)），零参拒 not-found' },
    { api: 'commission.settle', cls: 'entry', driver: null,
      reason: '委托结算需委托编号（settle(id)），交付核验必须由委托面按号触发，零参拒 not-found' },
    { api: 'operations.settle', cls: 'entry', driver: null,
      reason: '组织项目运营结算需项目编号（settle(projId,opts)），零参拒 not-found' },
    { api: 'campaign.advance', cls: 'entry', driver: null,
      reason: '战役推进需在场场景（零参拒 no-scene），场景由剧情层开启后才轮得到推进' },
    { api: 'modelCatalog.refresh', cls: 'entry', driver: null,
      reason: '模型清单刷新是异步网络口（refresh(spec) 返回 Promise），由设置面按需拉取，不进轮次' },
    // ── v2.542.8 补裁决（5 条）：第三批全量回归 C2 照出来的既存欠账 ──────────────
    //   这 5 台在运行时存在推进类方法、产品面（engines/ core/ ui/ render/）逐文件搜
    //   `WA.<ns>.<m>(` / `<ns>.<m>(` 零命中、且不归 l3Registry 也不归 roundDrivers 基线。
    //   四台要业务对象（id/回执/地点），一台是读口（到期清单）——都不是 drive：
    //   零参要么直接拒（missing-id / missing-place），要么只返回空清单。故逐台按 entry 裁决。
    { api: 'offstageQueue.step', cls: 'entry', driver: null,
      reason: '场外回执写一步需人物与动作（step({id,action,verdict,evidence})），零参拒 missing-id；回执只能由推演结算面按人给' },
    { api: 'consequenceSchedule.due', cls: 'entry', driver: null,
      reason: '到期清单是读面（due({atRound})）：只返回 items、不推进状态，需调用方给出轮次坐标；正文面走 buildBlock（render/inject 的 vis 分支），本口不参与正文注入' },
    { api: 'consequenceSchedule.settle', cls: 'entry', driver: null,
      reason: '后果结算需后果编号与证据（settle({id,evidence})），零参拒 missing-id、无证据拒 no-evidence；编号只能由后果面产生' },
    { api: 'appointment.settle', cls: 'entry', driver: null,
      reason: '承诺债结算需人物编号（settle({id,atRound,showUp})），零参拒 missing-id；到场与否是剧情判定，轮次造不出' },
    { api: 'farAccount.tick', cls: 'entry', driver: null,
      reason: '别处在走推进需地点与事件（tick({place,what})），零参拒 missing-place；地点必须已在世界表里登记' }
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
