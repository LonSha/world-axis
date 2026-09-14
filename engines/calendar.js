/** WorldAxis engines/calendar.js — 时间线/日程/事件线（缝合 SevenDaysCal 点线面）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.calendar = {
    setClock(label, iso) { WA.store.patch('clock', { iso: iso || '', label: label || '', dayIndex: WA.store.read('clock.dayIndex', 0), source: 'user' }); },
    getClock() { return WA.store.read('clock', {}); },
    advanceDay() { const d = WA.store.read('clock.dayIndex', 0); WA.store.patch('clock.dayIndex', d + 1); }
  };
})();
