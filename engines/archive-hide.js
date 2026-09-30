/**
 * WorldAxis engines/archive-hide.js (v2.130.0) — 自动隐藏归档楼层（缝 B1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   楼越聊越多，上下文里塞满早已归档的旧楼，而本仓的楼层管理只有「记忆覆盖」
 *   一条路：`engines/pmem.js` 把旧楼压成摘要，但**旧楼本身仍在上下文里**。
 *   用户想要的是「压过的那几楼就别再送进上下文了」，全库零实现。
 *
 *   缝合来源：world-backstage 2.5.8 —— 原文口径是「只隐藏**有逐楼记忆覆盖**的楼，
 *   保最近若干层可见；缺 L0 的保持可见；用户手动隐藏的不自动恢复」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `plan(floors, covered)` —— 算出「哪些楼该被隐藏」（**纯函数，不写状态**）；
 *   ② `shouldHide(msgIndex, ctx)` —— 单楼判定（同一条判据，供逐楼调用）；
 *   ③ `stat()` —— 记几个数（算了几次、藏了几层）。
 *
 *   三者共用**同一份判据**：`plan` 只是把 `shouldHide` 跑一遍。两份实现必然漂移，
 *   而漂移在这种“上下文裁剪”上表现为“层数对不上”，极难排查。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `plan` 返回空隐藏集——**关闭即恢复**：
 *      已经隐藏的楼在下一次裁剪时不再被隐藏（不做“关开关还能回收已隐藏的”）。
 *   2 **只隐藏有记忆覆盖的楼**：没有 L0 / 逐楼记忆覆盖的楼一律保持可见
 *      （藏了它就等于把这段经历从世界状态里删掉）。
 *   3 **保最近 N 层**（`keepRecent`，默认 5）：最近几层是当前对话的现场，
 *      无论有没有覆盖都不藏。
 *   4 手动隐藏是**另一回事**：本模块只管“自动隐藏”的集合，
 *      不去恢复用户手动 `/hide` 的楼，也不把自动隐藏的楼重新显示。
 *   5 `plan` 不写任何状态：它产出的是**一份建议集**，落手动作由调用方做
 *      （本模块不调用宿主的消息显示 API —— 那会让“预演”变成“已生效”）。
 *   6 楼层索引用**调用方给的坐标**，本模块不自己数楼（数错一层就会藏掉现场楼）。
 *   7 不产 `buildBlock`：被隐藏的楼不参与注入，本模块没有可注入的内容。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_archivehide_settings_v1';
  const DEF = { enabled: false, keepRecent: 5, minCovered: 1 };
  const __REG = { key: LS_KEY, def: DEF, module: 'archiveHide', bounds: { keepRecent: [0, 60], minCovered: [1, 20] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { plans: 0, hideable: 0, kept: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  /**
   * 单楼判定。**与 plan 共用同一判据**（边界「一体两用」）。
   * @param {number} msgIndex 楼层序号（0 起）
   * @param {{total:number, covered:boolean|number, manual?:boolean}} ctx
   * @returns {hide:boolean, why:string}
   */
  function shouldHide(msgIndex, ctx) {
    const cfg = settings();
    const c = ctx || {};
    const total = Number(c.total);
    const idx = Number(msgIndex);
    if (!cfg.enabled) return { hide: false, why: 'disabled' };
    if (!isFinite(total) || !isFinite(idx)) return { hide: false, why: 'bad-value' };
    if (c.manual === true) return { hide: false, why: 'manual' };                       // 手动隐藏归宿主管
    if (idx >= total - cfg.keepRecent) return { hide: false, why: 'recent' };            // 保最近 N 层
    const cov = (typeof c.covered === 'number') ? c.covered : (c.covered ? 1 : 0);
    if (cov < cfg.minCovered) return { hide: false, why: 'uncovered' };                  // 缺覆盖：保持可见
    return { hide: true, why: 'covered' };
  }

  /**
   * 批量出建议集。**纯函数**（边界 5）：不写 store、不碰宿主 API。
   * @param {Array} floors 形如 [{index, covered, manual}]，或直接给楼层数
   */
  function plan(floors) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', hide: [] }; }
    const list = Array.isArray(floors) ? floors : [];
    const total = list.length;
    const hide = [], keep = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i] || {};
      const idx = (typeof f.index === 'number') ? f.index : i;
      const r = shouldHide(idx, { total: total, covered: f.covered, manual: f.manual });
      (r.hide ? hide : keep).push({ index: idx, why: r.why });
    }
    stat.plans++; stat.hideable += hide.length; stat.kept += keep.length;
    stat.lastReason = hide.length ? 'planned' : 'nothing-to-hide';
    return { ok: true, hide: hide, keep: keep, total: total,
      note: '本结果只是建议集；真正隐藏楼层由调用方执行（本模块不碰宿主消息状态）' };
  }

  WA.archiveHide = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    plan: plan, shouldHide: shouldHide,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/archive-hide.js', { kind: 'engine', ver: '2.130.0' });
})();
