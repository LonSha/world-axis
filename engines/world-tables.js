/**
 * WorldAxis engines/world-tables.js (v2.529.0) — world 的封闭词表与设置登记表
 *
 * 原本长在 engines/world.js 里：场所种类 / 事件种类 / 用途种类 / 通行三层 / 封锁来源 / 道路通道 / 封锁等级（七张封闭词表）与 settings 登记表（__REG）。
 *
 * 为什么单独成文件（OPV29-11）：这些是**封闭集合与登记表**（改一个词要在一千多行引擎里翻，
 *   而它们恰恰是最需要「一眼看全」的东西）。搬家**不动语义**：引擎在求值期解构进来用，
 *   所有调用点一字未改；缺表当场抛错，不静默退化成空词表（空词表会让「不在表里就拒收」
 *   变成「什么都拒收」，或反过来「什么都不校验」—— 两种都是不崩的错）。
 *
 * 本文件零算法：无具名函数、无 fs / store，只有一个 IIFE 外壳挂表。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_world_settings_v1';
  const DEF = { enabled: true, maxPlaces: 8, maxEvents: 4, maxItems: 3, maxJourneys: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'world',
    bounds: { maxPlaces: [1, 24], maxEvents: [1, 12], maxItems: [1, 6] } };
  const PLACE_KINDS = ['home', 'work', 'market', 'public', 'wild', 'sacred'];
  const EVENT_KINDS = ['market', 'festival', 'court', 'rite', 'meeting'];
  // v2.117.0（B2 前半）：场所用途。**同一间屋子按用途分窗口** ——「商店营业 9-18」与
  //   「办公室值班 18-24」是两件事，合并成一个开闭就再也答不出「现在能不能去寄信」。
  //   用途标签是**封闭集合**：不在表里的用途拒收（bad-use）——自由文本用途会让
  //   「哪个用途的窗口管这一件事」永远没有答案。
  const USE_KINDS = ['business', 'duty', 'class', 'visit', 'meeting', 'custom'];
  // v2.93.0（X4）：通行三层。"人可到"与"物可到"与"消息可到"是三件事——
  //   合并成一个 reachable 就再也答不出「人过不去但信能过去」。
  //   通道语义：person 需道路（weather 封锁即不可）；goods 需承运（比 person 怕封路）；
  //   message 走消息面（不受封路影响，但受「完全静默」级别的封锁影响）。
  const CHANNELS = ['person', 'goods', 'message'];
  /**
   * v2.117.0（B2 后半）：**封锁是一等公民，不只有天气一种来源**。
   *   B2 原文：「天气、灾害和组织封锁向现有 world 通行层投递受影响的路段/窗口，
   *   先更新实际可达性再决定行动」。旧实现只有 `weather.effect(place)` 一条间接路径 ——
   *   灾害（hazard）与组织封锁没有任何投递入口，于是「这条路被部队封了」只能借天气编出来。
   *   投递项按**地点**生效、带 `until` 定时效：过了那个时刻自动失效，不需要谁来删。
   */
  const BLOCK_SOURCES = ['weather', 'hazard', 'org'];
  // 道路通行的三个方向之一：`road` 表示「这条路本身断了」（既不是人也不是货的问题）。
  const ROAD_CHANNELS = ['person', 'goods', 'message', 'road'];
  // 封锁等级：天气 → 该地通道是否尚可通行。**只由已登记的天气决定，不猜**。
  //   storm/snow 封路（person/goods 不可，message 可）；heat/fog 不封路（只减速）。
  const BLOCK_LEVEL = { storm: { person: false, goods: false, message: true },
    snow: { person: false, goods: false, message: true },
    heat: { person: true, goods: true, message: true },
    fog: { person: true, goods: true, message: true },
    rain: { person: true, goods: true, message: true },
    clear: { person: true, goods: true, message: true } };

  WA.worldTables = {
    LS_KEY: LS_KEY, DEF: DEF, __REG: __REG,
    PLACE_KINDS: PLACE_KINDS, EVENT_KINDS: EVENT_KINDS, USE_KINDS: USE_KINDS,
    CHANNELS: CHANNELS, BLOCK_SOURCES: BLOCK_SOURCES, ROAD_CHANNELS: ROAD_CHANNELS,
    BLOCK_LEVEL: BLOCK_LEVEL
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/world-tables.js', { kind: 'data', ver: '2.529.0' });
  }
})();
