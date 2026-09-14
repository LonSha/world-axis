/** WorldAxis engines/calendar.js (v0.2) — 世界钟/日历推进（缝合 SevenDaysCal） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  WA.calendar = {
    /** 设定世界时间（自由标签或ISO） */
    setClock(label, opts) {
      opts = opts || {};
      WA.store.transact(d => {
        d.clock.label = label;
        d.clock.source = opts.source || 'user';
        d.clock.iso = opts.iso || d.clock.iso || '';
        if (opts.dayIndex != null) d.clock.dayIndex = opts.dayIndex;
      });
      WA.emit('clock:changed', label);
    },
    /** 推进一天 */
    advanceDay() {
      const s = WA.store.get();
      const next = (s.clock.dayIndex || 0) + 1;
      this.setClock('第' + next + '日', { source: 'engine', dayIndex: next });
    },
    /** 解析正文中的时间词并建议推进（骨架：只做常见模式） */
    suggestAdvance(text) {
      if (/次日|第二天|翌日|天亮/.test(text)) return 'day';
      if (/黄昏|傍晚|入夜|夜幕/.test(text)) return 'evening';
      if (/黎明|清晨|破晓/.test(text)) return 'dawn';
      return null;
    }
  };
})();