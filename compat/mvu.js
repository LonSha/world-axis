/** WorldAxis compat/mvu.js — MVU变量框架兼容（缝合 addon-mvu） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // 把世界状态映射为MVU stat_data（若宿主启用MVU则写入）
  WA.compatMvu = {
    sync() {
      try {
        const ctx = WA.mainWin.SillyTavern.getContext();
        if (!ctx || !ctx.chatMetadata) return false;
        const meta = ctx.chatMetadata;
        if (!meta.stat_data) return false; // 未启用MVU
        const s = WA.store.get();
        meta.stat_data.world_clock = s.clock.label;
        meta.stat_data.world_pulse = s.worldPulse ? s.worldPulse.pressure : 0;
        meta.stat_data.world_people = Object.values(s.people).map(p => ({ name: p.name, loc: p.location }));
        return true;
      } catch (e) { return false; }
    }
  };
})();