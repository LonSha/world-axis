/** WorldAxis direction/tags.js — 导演标签注入器（缝合 TH-剧情推进 <request>分组标签）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  const LS_KEY = 'worldaxis_director_tags_v1';
  WA.tags = {
    getActive() { try { return JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; } },
    setActive(arr) { mainWin.localStorage.setItem(LS_KEY, JSON.stringify(arr || [])); }
  };
  WA.workflow.register({
    id: 'tags.request', chain: 'before', order: 60, label: '导演标签<request>',
    async run(ctx) {
      const act = WA.tags.getActive();
      if (!act.length) return;
      const body = act.map(t => '<request:' + (t.title || '导演') + '>' + t.content + '</request>').join('\n');
      ctx.injections.push({ source: '导演标签', position: 'after_last_user', depth: 0, content: body });
    }
  });
})();
