/**
 * WorldAxis core/settings-bus.js (v0.2.0) — settings 存储统一治理（迁移器侧车）。
 * 背景：12 个模块各自持有 worldaxis_*_settings_v1 等键，读写各自实现——
 *   裸 try/catch 静默吞掉 JSON 损坏（用户配置悄悄重置默认，无任何留痕），
 *   键名带 _v1 但没有 v2 迁移路径（未来改结构时旧键静默孤儿化）。
 * 原则：本侧车只做"读旧写新 + 损坏留痕/隔离 + 暴露 pending 键"的薄逻辑；
 *   具体 v1→v2 结构升级由各模块自己负责（未来新增 upgrade 钩子）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  function now() { try { return Date.now(); } catch (e) { return 0; } }
  const stats = { upgrades: 0, quarantines: 0, reads: 0, failures: 0 };
  /**
   * 读取 settings 键（旧版本协商 + 损坏隔离）。
   * reg: { key:'<当前键>', legacy:['<旧键>',...], legacyRemove:bool, orphan:bool, def:默认值 }
   *  - 当前键损坏 → quarantine + 返回 def + 记 error（附键名与原始前缀）
   *  - legacy 存在 → 读入为当前值 + 写当前键 + 默认删旧键；legacyRemove:false 保留旧键
   *  - 返回注册项的独立拷贝（防模块间意外共享状态）
   */
  WA.settingsBus = {
    stats: stats,
    read(reg) {
      const r = Object.assign({ legacy: [], legacyRemove: true, orphan: false, def: null }, reg || {});
      const ls = (WA.mainWin || window).localStorage;
      let raw = null, val = null, legacyHit = false;
      try {
        raw = ls.getItem(r.key);
        if (raw !== null && raw !== undefined) {
          stats.reads++;
          try { val = JSON.parse(raw); }
          catch (e) {
            // 当前键损坏：留痕 + 隔离（sweep 可归置）
            stats.quarantines++;
            const qk = r.key + '_corrupt_' + now();
            try { ls.setItem(qk, raw); } catch (e2) {}
            try { ls.removeItem(r.key); } catch (e3) {}
            if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 损坏已隔离 → ' + qk + '（重置默认）', String(raw).slice(0, 200));
            val = null;
          }
        }
        // 版本协商：当前无值 → 尝试 legacy 键
        if (val === null) {
          for (let i = 0; i < (r.legacy || []).length; i++) {
            const lk = r.legacy[i];
            let lraw = null;
            try { lraw = ls.getItem(lk); } catch (e) {}
            if (lraw === null || lraw === undefined) continue;
            legacyHit = true;
            try {
              val = JSON.parse(lraw);
              stats.upgrades++;
              if (WA.log) WA.log('warn', 'settingsBus: ' + lk + ' 迁移 → ' + r.key, null);
              try { ls.setItem(r.key, JSON.stringify(val)); } catch (e4) {}
              if (r.legacyRemove !== false) { try { ls.removeItem(lk); } catch (e5) {} }
            } catch (e) {
              // legacy 键也损坏：隔离留痕（防 v2 发布后误读老损坏格式）
              stats.quarantines++;
              const qk = lk + '_corrupt_' + now();
              try { ls.setItem(qk, lraw); } catch (e6) {}
              try { ls.removeItem(lk); } catch (e7) {}
              if (WA.log) WA.log('error', 'settingsBus: ' + lk + '（legacy）损坏已隔离 → ' + qk, String(lraw).slice(0, 200));
            }
            break;
          }
        }
      } catch (e) { stats.failures++; }
      if (val === null || val === undefined) val = r.def;
      try { return JSON.parse(JSON.stringify(val)); } catch (e) { return val; }
    },
    save(reg, value) {
      const r = Object.assign({ key: null, orphan: false }, reg || {});
      if (!r.key) return false;
      const ls = (WA.mainWin || window).localStorage;
      try { ls.setItem(r.key, JSON.stringify(value === undefined ? null : value)); return true; } catch (e) { return false; }
    },
    /** 注册表（只读拷贝）：{ key, legacy, legacyRemove, orphan, def, module } */
    registry() {
      return (WA.__settingsRegs || []).map(function (r) {
        return { key: r.key, legacy: (r.legacy || []).slice(), legacyRemove: !!r.legacyRemove, orphan: !!r.orphan, def: r.def, module: r.module };
      });
    },
    /** orphan 候选：标记 orphan:true 且键已不存在（已删/从未写）的注册项 */
    pendingOrphan() {
      const ls = (WA.mainWin || window).localStorage;
      return (WA.__settingsRegs || []).filter(function (r) {
        if (!r.orphan || !r.key) return false;
        try { return ls.getItem(r.key) === null; } catch (e) { return false; }
      }).map(function (r) { return { key: r.key, module: r.module }; });
    }
  };
})();
