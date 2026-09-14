/**
 * WorldAxis render/inject.js — 分源可见性注入（缝合 世界背面正文注入可见性控制）
 * ctx.injections 统一落地：世界时间/背景/人物/暗流/回声/记忆/舆情 各自可开关
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  const LS_KEY = 'worldaxis_inject_visibility_v1';

  const SOURCES = ['clock', 'background', 'people', 'currents', 'echoes', 'memory', 'opinion'];

  function loadVis() {
    const def = { clock: true, background: true, people: true, currents: true, echoes: false, memory: true, opinion: false };
    try { return Object.assign(def, JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}')); } catch (e) { return def; }
  }

  WA.render = {
    SOURCES,
    getVisibility() { return loadVis(); },
    setVisibility(k, on) { const v = loadVis(); v[k] = !!on; mainWin.localStorage.setItem(LS_KEY, JSON.stringify(v)); },

    /** 世界状态快照注入（before链节点） */
    buildWorldSnapshot() {
      const vis = loadVis(); const s = WA.store.get(); const parts = [];
      if (vis.clock && s.clock.label) parts.push('【世界时间】' + s.clock.label);
      if (vis.background && s.background.text) parts.push('【世界背景】' + s.background.text.slice(0, 500));
      if (vis.people) {
        const ps = Object.values(s.people).filter(p => p.location || p.action).slice(0, 8);
        if (ps.length) parts.push('【人物此刻】' + ps.map(p => p.name + '：' + (p.location || '?') + '，' + (p.action || '')).join('；'));
      }
      if (vis.currents) {
        const cs = s.currents.filter(c => c.visibility !== 'hidden').slice(0, 6);
        if (cs.length) parts.push('【可感知暗流】' + cs.map(c => c.visibility === 'trace' ? (c.public_trace || c.title + '（异常迹象）') : c.title).join('；'));
      }
      if (vis.memory) {
        const fs = s.memory.facts.filter(f => f.active).slice(-8);
        if (fs.length) parts.push('【长期事实】' + fs.map(f => f.key + '=' + f.value).join('；'));
      }
      if (vis.opinion && s.opinion.canon.length) parts.push('【世界舆情】' + s.opinion.canon.slice(-3).map(o => o.title || o).join('；'));
      return parts.length ? '<world_axis_state>\n' + parts.join('\n') + '\n</world_axis_state>' : '';
    },

    /** 把 ctx.injections 落地到SillyTavern（setExtensionPrompt） */
    applyInjections(ctx) {
      const c = (() => { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } })();
      if (!c || !c.setExtensionPrompt) { if (ctx.injections.length) WA.log('warn', '宿主无setExtensionPrompt，注入丢弃'); return; }
      // 世界快照节点（visibility控制）放最前
      const snap = this.buildWorldSnapshot();
      const items = [];
      if (snap) items.push({ source: '世界状态', content: snap });
      (ctx.injections || []).forEach(i => items.push(i));
      // 合并为一条注入（position: in-chat depth 0 = 最后用户消息之后）
      const combined = items.map(i => i.content).join('\n');
      try {
        c.setExtensionPrompt('WorldAxis', combined, 1, 0, false);
        WA.log('info', '注入落地：' + items.map(i => i.source).join(' + '));
      } catch (e) { WA.log('error', 'setExtensionPrompt失败', e); }
    }
  };
})();
