/**
 * WorldAxis engines/floor-hide.js (v2.529.0) — 楼层双层隐藏（数据层 / 视觉层分开）
 *
 * 缝合来源：nekotools core/st_bridge.js::hideOldMessages(dataKeep, visualKeep)（952-1140 行）。
 * 病：本仓省 token 只能靠「注入预算」少发，但**楼层本身**没有「不发出去（数据层）」与
 *   「还看得见（视觉层）」这两个独立旋钮。于是「省 token」与「能回看」被迫二选一。
 * 边界：只算计划（哪些楼层该打哪种标记），不改 chat、不存盘。
 *   `waxHiddenByData` = 酒馆本来就不发；`waxHiddenByVisual` = 只在本机收起。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 从末尾往前数，第 keep+1 条「AI 楼层」的下标即切点（keep=0 表示切点在最后一条之后）。 */
  function cutoffIndexForKeep(chat, keep) {
    const list = Array.isArray(chat) ? chat : [];
    const k = Math.max(0, Number(keep) || 0);
    let seen = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (!m || m.is_user || m.is_system) continue;
      seen++;
      if (seen > k) return i + 1;   // 这一条要开始隐藏：切点就是它
    }
    return 0;
  }

  /**
   * @param {Array} chat
   * @param {{dataKeep?:number, visualKeep?:number}} opts
   *   数据层：保留最新 dataKeep 条 AI 楼层，其余标记「不发」；
   *   视觉层：保留最新 visualKeep 条可见，其余标记「收起」。
   *   visualKeep 必须 >= dataKeep（可见范围不能比发送范围更小，否则玩家看到的是空的）。
   */
  function plan(chat, opts) {
    const o = opts || {};
    const list = Array.isArray(chat) ? chat : [];
    const dataKeep = Math.max(0, Number(o.dataKeep) || 0);
    let visualKeep = Math.max(0, Number(o.visualKeep) || 0);
    const clamped = visualKeep < dataKeep;
    if (clamped) visualKeep = dataKeep;
    const dataCut = cutoffIndexForKeep(list, dataKeep);
    const visualCut = cutoffIndexForKeep(list, visualKeep);
    const rows = [];
    for (let i = 0; i < list.length; i++) {
      const dataHidden = i < dataCut;
      const visualHidden = i < visualCut;
      if (!dataHidden && !visualHidden) continue;
      rows.push({ i: i, dataHidden: dataHidden, visualHidden: visualHidden });
    }
    return {
      rows: rows, dataCut: dataCut, visualCut: visualCut,
      dataHidden: rows.filter(function (r) { return r.dataHidden; }).length,
      visualHidden: rows.filter(function (r) { return r.visualHidden && !r.dataHidden; }).length,
      clamped: clamped, floors: list.length
    };
  }

  /** 把计划写成补丁（调用方落地时用）：只动 extra 的两个标记位。 */
  function patches(planResult) {
    const p = planResult || {};
    return (p.rows || []).map(function (r) {
      return { i: r.i, data: !!r.dataHidden, visual: !!r.visualHidden };
    });
  }

  WA.floorHide = { cutoffIndexForKeep: cutoffIndexForKeep, plan: plan, patches: patches };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/floor-hide.js', { kind: 'engine', ver: '2.529.0' });
})();