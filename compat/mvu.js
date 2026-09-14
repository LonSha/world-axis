/** WorldAxis compat/mvu.js — MVU变量框架兼容（addon-mvu协议）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.mvu = {
    available() { return !!(WA.mainWin.Mvu || (WA.mainWin.TavernHelper && WA.mainWin.TavernHelper.getVariables)); },
    read() { try { const th = WA.mainWin.TavernHelper; return th && th.getVariables ? th.getVariables({ type: 'message' }) : null; } catch (e) { return null; } }
  };
})();
