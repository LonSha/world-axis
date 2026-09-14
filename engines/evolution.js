/**
 * WorldAxis engines/evolution.js (v0.2.1)
 * 事件演化：冲突/进度阶段机 + 势力/风向/声誉/经济 + 阶段自动推进
 * 缝合来源：DlSNlGHT World world-engine-core/evolution
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const STAGE_MAP = { conflict: ['萌芽', '发酵', '逼近', '已爆发', '已消散'], progress: ['筹备', '执行', '关键', '已完成', '已失败'] };
  const TERMINAL = { conflict: ['已爆发', '已消散'], progress: ['已完成', '已失败'] };
  const IDLE_AUTO_ADVANCE = 4; // 停滞4轮自动推进
  const IDLE_ARCHIVE = 10;     // 停滞10轮归档入纪事

  const evolution = WA.evolution = {
    STAGE_MAP, TERMINAL,

    addEvent(ev) {
      return WA.store.transact(draft => {
        draft.evolution.events.push(Object.assign({
          id: 'ev' + Date.now() + Math.random().toString(36).slice(2, 6),
          type: 'conflict', title: '', stage: '萌芽', faction: '', stakes: '',
          createdRound: draft.evolution.round
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

    /** 回合结算（after链）：round+1，停滞自动推进/归档 */
    tick() {
      const archived = [];
      WA.store.transact(draft => {
        draft.evolution.round++;
        draft.evolution.events.forEach(e => {
          e.idle = (draft.evolution.round - (e.updatedRound || e.createdRound || 0));
          // 终态不处理
          if ((TERMINAL[e.type] || []).includes(e.stage)) return;
          // 停滞过长：归档入纪事并标记结束
          if (e.idle >= IDLE_ARCHIVE) {
            const order = STAGE_MAP[e.type] || STAGE_MAP.conflict;
            e.stage = order[order.length - 1];
            archived.push(e.title);
            draft.chronicle.push({ id: 'arc' + Date.now() + Math.random().toString(36).slice(2, 5), kind: 'evolution', title: '演化归档', summary: e.title + ' 因长期停滞自然消解', at: Date.now() });
          }
          // 中度停滞：自动推进一阶段
          else if (e.idle >= IDLE_AUTO_ADVANCE) {
            const order = STAGE_MAP[e.type] || STAGE_MAP.conflict;
            const i = order.indexOf(e.stage);
            if (i >= 0 && i < order.length - 2) { e.stage = order[i + 1]; e.updatedRound = draft.evolution.round; e.autoAdvanced = true; }
          }
        });
      });
      if (archived.length) WA.log('info', '演化归档：' + archived.join('、'));
    },

    /** 供backstage快照引用的活跃事件 */
    activeSnapshot() {
      const s = WA.store.get();
      return s.evolution.events.filter(e => !(TERMINAL[e.type] || []).includes(e.stage)).slice(0, 8)
        .map(e => ({ t: e.title, ty: e.type, st: e.stage, idle: e.idle || 0, fa: e.faction || '' }));
    }
  };

  WA.workflow.register({
    id: 'evolution.tick', chain: 'after', order: 30, label: '事件演化·回合计',
    async run() { WA.evolution.tick(); }
  });
})();
