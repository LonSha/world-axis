/**
 * WorldAxis render/inject.js (v0.2) — 分源可见性注入
 * 接入 记忆块/舆情块/章节块 + 脉搏显示
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  const LS_KEY = 'worldaxis_inject_visibility_v1';

  const SOURCES = ['clock', 'background', 'people', 'currents', 'echoes', 'memory', 'opinion', 'pulse'];

  function loadVis() {
    const def = { clock: true, background: true, people: true, currents: true, echoes: false, memory: true, opinion: false, pulse: true };
    try { return Object.assign(def, JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return def; }
  }

  WA.render = {
    SOURCES,
    getVisibility() { return loadVis(); },
    setVisibility(k, on) { const v = loadVis(); v[k] = !!on; mainWin.localStorage.setItem(LS_KEY, JSON.stringify(v)); },

    buildWorldSnapshot() {
      const vis = loadVis(); const s = WA.store.get(); const parts = [];
      if (vis.clock && s.clock.label) parts.push('【世界时间】' + s.clock.label);
      if (vis.pulse && s.worldPulse) parts.push('【世界脉搏】压力' + s.worldPulse.pressure + '/3（' + s.worldPulse.trend + '）' + (s.worldPulse.note || ''));
      if (vis.background && s.background.text) parts.push('【世界背景】' + s.background.text.slice(0, 500));
      if (vis.people) {
        const ps = Object.values(s.people).filter(p => p.location || p.action).slice(0, 8);
        if (ps.length) parts.push('【人物此刻】' + ps.map(p => p.name + '：' + (p.location || '?') + '，' + (p.action || '')).join('；'));
      }
      if (vis.currents) {
        const cs = s.currents.filter(c => c.visibility !== 'hidden').slice(0, 6);
        if (cs.length) parts.push('【可感知暗流】' + cs.map(c => c.visibility === 'trace' ? (c.public_trace || c.title + '（异常迹象）') : c.title).join('；'));
      }
      return parts.length ? '<world_axis_state>\n' + parts.join('\n') + '\n</world_axis_state>' : '';
    },

    applyInjections(ctx) {
      const c = (() => { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } })();
      if (!c || !c.setExtensionPrompt) { if (ctx.injections.length) WA.log('warn', '宿主无setExtensionPrompt，注入丢弃'); return; }
      const vis = loadVis();
      const items = [];
      const snap = this.buildWorldSnapshot();
      if (snap) items.push({ source: '世界状态', content: snap });
      // 记忆块（visibility控制）
      if (vis.memory && WA.memory) { const mb = WA.memory.buildMemoryBlock(); if (mb) items.push({ source: '记忆', content: mb }); }
      // v0.8.2: 人物主观记忆块（认知与信息不对称）
      // v0.9.8: 采样器接管——指数衰减采样 + 上下文相关召回，替代 slice(-8) 无差别截取
      if (vis.memory && WA.memorySampler) {
        const recent = WA.pmem && WA.pmem.recentText ? WA.pmem.recentText(4) : '';
        const pb = WA.memorySampler.buildBlock({ recentText: recent });
        if (pb) items.push({ source: '主观记忆', content: pb });
      } else if (vis.memory && WA.pmem) { const pb = WA.pmem.buildBlock(); if (pb) items.push({ source: '主观记忆', content: pb }); }
      // v0.8.3: 双层叙事摘要块（优先总述回退纪要）
      if (vis.memory && WA.summarizer) { const sb = WA.summarizer.buildBlock(); if (sb) items.push({ source: '叙事摘要', content: sb }); }
      // 舆情块
      if (vis.opinion && WA.opinion) { const ob = WA.opinion.buildOpinionBlock(); if (ob) items.push({ source: '舆情', content: ob }); }
      // v0.8: 重大事件账本块
      if (WA.ledger) { const lb = WA.ledger.buildLedgerText(); if (lb) items.push({ source: '账本', content: '[重大事件账本]\n' + lb }); }
      // v0.7: world_digest块
      if (WA.digest) { const db = WA.digest.buildBlock(); if (db) items.push({ source: '世界推演', content: db }); }
      // v0.7: 近端事件一次性消费
      const st = WA.store.get();
      if (st && st.nextTurnInjection && st.nextTurnInjection.nearEvent) {
        const ne = st.nextTurnInjection.nearEvent;
        items.push({ source: '近端事件', content: `[突发事件] ${ne.title}${ne.urgent ? '（紧急）' : ''}：${ne.desc}` });
        // 一次性消费：清除
        WA.store.transact(d => { if (d.nextTurnInjection) delete d.nextTurnInjection.nearEvent; });
      }
      (ctx.injections || []).forEach(i => items.push(i));
      // v0.9.3: 注入预算裁决（pinned 保底 / optional 先折叠后丢弃；0=不限）
      let planInfo = null;
      let finalItems = items;
      try {
        const budget = (WA.backstage && WA.backstage.getSettings) ? WA.backstage.getSettings().injectBudget : null;
        if (WA.injectBudget && budget !== 0 && items.length) {
          planInfo = WA.injectBudget.plan(items, { budget: (budget == null ? -1 : budget) });
          finalItems = WA.injectBudget.apply(items, planInfo);
          if (planInfo.folded.length || planInfo.dropped.length) {
            WA.log('info', '注入预算裁决：' + WA.injectBudget.summaryText(planInfo)
              + '｜折叠 ' + planInfo.folded.map(f => f.source).join('/')
              + (planInfo.dropped.length ? '｜丢弃 ' + planInfo.dropped.map(d => d.source).join('/') : ''));
          }
        }
      } catch (e) { WA.log('warn', '预算裁决失败，回退全量注入', e); planInfo = null; finalItems = items; }
      const combined = finalItems.map(i => i.content).join('\n');
      try {
        // 即使为空也要写入空串，清掉上一轮残留注入（swipe/重答场景关键）
        c.setExtensionPrompt('WorldAxis', combined, 1, 0, false);
        if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(combined.length);
        try { WA.store.transact(d => { d.lastInjection = { at: Date.now(), len: combined.length, sources: finalItems.map(i => i.source), budget: planInfo ? { used: planInfo.used, cap: planInfo.budget, source: planInfo.budgetSource, folded: planInfo.folded.map(f => f.source), dropped: planInfo.dropped.map(x => x.source) } : null }; }); } catch (e) { /* 快照失败不影响注入 */ }
        if (combined) WA.log('info', '注入落地：' + finalItems.map(i => i.source).join(' + ') + '（' + combined.length + '字）');
      } catch (e) { WA.log('error', 'setExtensionPrompt失败', e); }
    }
  };
})();