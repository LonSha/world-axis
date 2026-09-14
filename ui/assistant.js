/** WorldAxis ui/assistant.js — 自助管家（缝合 世界背面玲七：状态汇报/答疑/代办）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.assistant = {
    /** 本地汇报（不调模型）：世界总览 */
    summary() {
      const s = WA.store.get();
      return {
        clock: s.clock.label || '未设定',
        people: Object.keys(s.people).length,
        currents: s.currents.length,
        facts: s.memory.facts.filter(f => f.active).length,
        round: s.evolution.round,
        running: WA.backstage.isRunning(),
        queue: WA.apiRouter.queueLength()
      };
    }
  };
})();
