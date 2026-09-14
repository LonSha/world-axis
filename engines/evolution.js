/**
 * WorldAxis engines/evolution.js
 * 事件演化：冲突/进度阶段机 + 势力/风向/声誉/经济
 * 缝合来源：DlSNlGHT World world-engine-core/evolution
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const STAGE_ORDER = { conflict: ['萌芽', '发酵', '逼近'], progress: ['筹备', '执行', '关键'] };
  const STAGE_MAP = { conflict: ['萌芽', '发酵', '逼近', '已爆发', '已消散'], progress: ['筹备', '执行', '关键', '已完成', '已失败'] };
  const TERMINAL = { conflict: ['已爆发', '已消散'], progress: ['已完成', '已失败'] };

  const evolution = WA.evolution = {
    STAGE_MAP, TERMINAL,

    addEvent(ev) {
      return WA.store.transact(draft => {
        draft.evolution.events.push(Object.assign({
          id: 'ev' + Date.now() + Math.random().toString(36).slice(2, 6),
          type: 'conflict', title: '', stage: '萌芽', createdRound: draft.evolution.round
        }, ev));
      });
    },

    advance(title, note) {
      return WA.store.transact(draft => {
        const ev = draft.evolution.events.find(e => e.title === title);
        if (!ev) return false;
        const order = STAGE_MAP[ev.type] || STAGE_MAP.conflict;
        const i = order.indexOf(ev.stage);
        if (i >= 0 && i < order.length - 1) { ev.stage = order[i + 1]; ev.note = note || ev.note; ev.updatedRound = draft.evolution.round; }
      });
    },

    terminalEvents() {
      const s = WA.store.get();
      return s.evolution.events.filter(e => (TERMINAL[e.type] || []).includes(e.stage));
    },

    /** 回合结算（after链）：round+1，长期未推进事件给轻量提示 */
    tick() {
      WA.store.transact(draft => {
        draft.evolution.round++;
        draft.evolution.events.forEach(e => {
          e.idle = (draft.evolution.round - (e.updatedRound || e.createdRound || 0));
        });
      });
    }
  };

  WA.workflow.register({
    id: 'evolution.tick', chain: 'after', order: 30, label: '事件演化·回合计',
    async run() { WA.evolution.tick(); }
  });
})();
