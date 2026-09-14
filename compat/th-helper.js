/** WorldAxis compat/th-helper.js — 酒馆助手（TavernHelper）桥接 骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.th = {
    available() { return !!WA.mainWin.TavernHelper; },
    helper() { return WA.mainWin.TavernHelper || null; }
  };
})();
