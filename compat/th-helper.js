/** WorldAxis compat/th-helper.js — TavernHelper沙箱桥接 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // 检测TH环境并向父窗口暴露世界状态只读接口
  WA.compatTH = {
    isTH() { try { return window.parent && window.parent !== window; } catch (e) { return false; } },
    expose() {
      // 供TH脚本/正则读取的世界状态快照
      WA.mainWin.WorldAxisSnapshot = function () {
        const s = WA.store.get();
        return {
          clock: s.clock.label,
          pulse: s.worldPulse || null,
          people: Object.values(s.people).map(p => ({ name: p.name, loc: p.location, act: p.action })),
          currents: s.currents.filter(c => c.visibility !== 'hidden').map(c => ({ t: c.title, v: c.visibility })),
          opinion: (s.opinion.canon || []).slice(-3).map(o => o.title)
        };
      };
      WA.log('info', 'TH桥接已暴露 WorldAxisSnapshot()');
    }
  };
})();