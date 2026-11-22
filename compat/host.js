/**
 * WorldAxis compat/host.js — 宿主能力探测与降级诊断
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const w = WA.mainWin || window;
  function context() { try { return w.SillyTavern && w.SillyTavern.getContext ? w.SillyTavern.getContext() : null; } catch (e) { return null; } }
  function detect() {
    const c = context();
    const th = (() => { try { return typeof TavernHelper !== 'undefined' ? TavernHelper : (w.TavernHelper || null); } catch (e) { return null; } })();
    const et = c && c.eventTypes || {};
    return {
      sillyTavern: !!c,
      eventSource: !!(c && c.eventSource && typeof c.eventSource.on === 'function'),
      appReady: !!(et.APP_READY || et.APP_READY_EVENT),
      generation: !!(et.GENERATION_STARTED || et.GENERATION_AFTER_COMMANDS || et.MESSAGE_RECEIVED || et.GENERATION_ENDED),
      chatChanged: !!et.CHAT_CHANGED,
      extensionPrompt: !!(c && typeof c.setExtensionPrompt === 'function'),
      tavernHelper: !!th,
      variables: !!(th && typeof th.getVariables === 'function' && (typeof th.replaceVariables === 'function' || typeof th.insertOrAssignVariables === 'function')),
      worldbook: !!(th && typeof th.getWorldbook === 'function' && typeof th.createWorldbookEntries === 'function')
    };
  }
  const compat = WA.compat = WA.compat || {};
  compat.context = context;
  compat.detect = detect;
  compat.events = function () { const c = context(); const e = c && c.eventTypes || {}; return { ready: e.APP_READY || e.APP_READY_EVENT, generation: e.GENERATION_STARTED || e.GENERATION_AFTER_COMMANDS || e.MESSAGE_RECEIVED || e.GENERATION_ENDED, chatChanged: e.CHAT_CHANGED || e.CHAT_CHANGED_EVENT }; };
  compat.snapshot = function () { const s = detect(); s.at = clockNow('compat'); return s; };
  compat.diagnose = function () { const s = compat.snapshot(); if (WA.log) WA.log('info', '宿主能力探测完成', s); return s; };
  if (WA.log) WA.log('info', '宿主兼容层已加载');
})();
