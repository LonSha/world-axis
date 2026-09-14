/** WorldAxis direction/oracle.js (v0.2) — 剧情参谋/弧线/序列/落拍（缝合 story-oracle + outline） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_PLAN = 'worldaxis_oracle_plan_v1';

  function loadPlan() {
    try { return JSON.parse(WA.mainWin.localStorage.getItem(LS_PLAN) || 'null'); } catch (e) { return null; }
  }
  function savePlan(p) { if (p) WA.mainWin.localStorage.setItem(LS_PLAN, JSON.stringify(p)); else WA.mainWin.localStorage.removeItem(LS_PLAN); }

  WA.oracle = {
    plan: loadPlan(),
    setPlan(p) { this.plan = p; savePlan(p); WA.emit('oracle:plan', p); },
    clear() { this.plan = null; savePlan(null); WA.emit('oracle:plan', null); },
    currentBeat() { return this.plan && this.plan.beats[this.plan.current] || null; },
    advance() {
      if (!this.plan) return false;
      this.plan.current++;
      if (this.plan.current >= this.plan.beats.length) { this.clear(); return true; }
      savePlan(this.plan);
      return false;
    },
    /** 用AI参谋生成一个多拍序列（基于剧情+目标） */
    async generatePlan(goal, beatCount) {
      const cfg = WA.apiRouter.getChannel('judge');
      if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: 'judge通道未配置' };
      const ctx = (() => { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } })();
      const chat = (ctx && ctx.chat) || [];
      const recent = chat.slice(-3).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 400)).join('\n');
      const n = beatCount || 5;
      const r = await WA.apiRouter.call('judge', [
        { role: 'system', content: '你是剧情参谋。基于当前剧情与用户的剧情目标，拆分为' + n + '个循序渐进的剧情节拍。每拍给出 goal(本拍目标≤30字) 与 instruction(给正文的隐形引导指令≤60字)。只输出JSON：{"beats":[{"goal":"...","instruction":"..."}]}' },
        { role: 'user', content: '【剧情目标】' + goal + '\n【近期剧情】\n' + (recent || '（开场）') }
      ], { json: true, maxTokens: 1200, temperature: 0.7 }).catch(() => null);
      if (!r || !r.beats || !r.beats.length) return { ok: false, reason: 'api-fail' };
      this.setPlan({ kind: 'sequence', goal, beats: r.beats.slice(0, n), current: 0, createdAt: Date.now() });
      return { ok: true, count: this.plan.beats.length };
    }
  };

  // before链：注入当前拍引导
  WA.workflow.register({
    id: 'oracle.guide', chain: 'before', order: 50, label: '剧情引导·当前拍',
    async run(ctx) {
      const b = WA.oracle.currentBeat();
      if (!b) return;
      const plan = WA.oracle.plan;
      ctx.injections.push({
        source: '剧情引导(' + (plan.current + 1) + '/' + plan.beats.length + ')',
        position: 'after_last_user', depth: 1,
        content: '<plot_guidance>\n【剧情引导·仅你可见·第' + (plan.current + 1) + '拍】目标：' + (b.goal || '') + '\n' + (b.instruction || '') + '\n</plot_guidance>'
      });
    }
  });
})();