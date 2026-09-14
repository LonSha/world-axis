/** WorldAxis direction/oracle.js — 剧情参谋/弧线/序列/落拍（缝合 story-oracle + outline）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.oracle = {
    plan: null, // {kind:'arc'|'sequence', beats:[], current:0}
    setPlan(p) { this.plan = p; },
    clear() { this.plan = null; },
    currentBeat() { return this.plan && this.plan.beats[this.plan.current] || null; }
  };
  // before链：注入当前拍引导
  WA.workflow.register({
    id: 'oracle.guide', chain: 'before', order: 50, label: '剧情引导·当前拍',
    async run(ctx) {
      const b = WA.oracle.currentBeat();
      if (!b) return;
      ctx.injections.push({ source: '剧情引导', position: 'after_last_user', depth: 1, content: '<plot_guidance>\n【剧情引导·仅你可见】' + (b.instruction || b.goal || '') + '\n</plot_guidance>' });
    }
  });
})();
