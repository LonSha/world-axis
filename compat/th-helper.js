/** WorldAxis compat/th-helper.js — TavernHelper沙箱桥接 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  // v2.0.0: 激活状态观测（init 探测并暴露只读快照接口）
  const __thState = { active: false, exposedAt: 0, lastReason: 'not-initialized' };
  // 检测TH环境并向父窗口暴露世界状态只读接口
  WA.compatTH = {
    isTH() { try { return window.parent && window.parent !== window; } catch (e) { return false; } },
    /** v2.0.0: 激活——暴露只读快照接口（init 调用，幂等） */
    init() {
      try {
        this.expose();
        __thState.active = true; __thState.exposedAt = clockWall(); __thState.lastReason = 'exposed';
        return true;
      } catch (e) { __thState.active = false; __thState.lastReason = 'error:' + (e && e.message); WA.log('warn', 'TH 桥接暴露失败', e); return false; }
    },
    /** v2.0.0: 激活状态查询（供巡视/诊断消费） */
    status() { return { active: __thState.active, lastReason: __thState.lastReason, exposedAt: __thState.exposedAt, isTH: (function () { try { return this.isTH(); } catch (e) { return false; } }).call(this) }; },
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