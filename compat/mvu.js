/** WorldAxis compat/mvu.js — MVU变量框架兼容（缝合 addon-mvu） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  // v2.0.0: 激活状态观测——init 探测宿主是否启用 MVU，未启用则保持 inactive（不虚报）
  const __mvuState = { active: false, lastSyncAt: 0, syncCount: 0, lastReason: 'not-initialized' };
  let __mvuTimer = null;
  // 把世界状态映射为MVU stat_data（若宿主启用MVU则写入）
  WA.compatMvu = {
    /** v2.0.0: 探测宿主 MVU 能力并激活（init 调用，幂等） */
    init() {
      try {
        const ctx = WA.mainWin && WA.mainWin.SillyTavern && WA.mainWin.SillyTavern.getContext
          ? WA.mainWin.SillyTavern.getContext() : null;
        if (!ctx || !ctx.chatMetadata) { __mvuState.active = false; __mvuState.lastReason = 'no-chat-metadata'; return false; }
        if (!ctx.chatMetadata.stat_data) { __mvuState.active = false; __mvuState.lastReason = 'mvu-not-enabled'; return false; }
        __mvuState.active = true; __mvuState.lastReason = 'active';
        this.sync();
        // 订阅轮次事件做持续同步（宿主事件源可用时）
        try {
          if (ctx.eventSource && ctx.eventTypes && ctx.eventTypes.MESSAGE_RECEIVED) {
            ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, function () { try { WA.compatMvu.sync(); } catch (e) { WA.log('warn', 'MVU 同步失败', e); } });
          }
        } catch (e) { WA.log('warn', 'MVU 事件订阅失败', e); }
        WA.log('info', 'MVU 兼容层已激活（stat_data 存在）');
        return true;
      } catch (e) { __mvuState.active = false; __mvuState.lastReason = 'error:' + (e && e.message); return false; }
    },
    /** v2.0.0: 激活状态查询（供巡视/诊断消费） */
    status() { return { active: __mvuState.active, lastReason: __mvuState.lastReason, syncCount: __mvuState.syncCount, lastSyncAt: __mvuState.lastSyncAt }; },
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
        __mvuState.syncCount++; __mvuState.lastSyncAt = clockWall();
        return true;
      } catch (e) { WA.log('warn', 'MVU 同步异常', e); return false; }
    }
  };
})();