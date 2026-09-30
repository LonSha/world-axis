/**
 * WorldAxis engines/group-refuse.js (v2.130.0) — 群聊显式拒绝（缝 A3）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的整套世界推演都建在**单一主角线**上：`store.chatId` 是单聊天域、
 *   人物档案是单人沙盘、注入块第一人称面向单一角色。群聊里这些前提全不成立，
 *   而本仓到 v2.129.0 为止**没有任何一处检测群聊**：推演照跑、世界书写、
 *   注入照发——结果是一份按单主角口径结算的错账，且无一处告警。
 *
 *   缝合来源：ST-Evolution-World-Assistant —— 原文口径是「群聊下直接回复
 *   不支持并阻止写入，不做半支持的降级模拟」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `detect()` —— 卡宿主现场答「是不是群聊」（带依据：characters 数 / 群成员表）；
 *   ② `guard(op)` —— 在写路径**之前**问「这一步该不该做」，是群聊则一切写
 *      一律拒绝（`bad-channel`，并把命中依据带出）；
 *   ③ `stat()` —— 记几个数（检测几次、拦下几次）。
 *
 *   ② 是**闸门**不是**降级**：本模块不提供「群聊下只读」这类半支持模式
 *   （半支持等于把一份错账粉饰成看起来能用）。调用方拿不到第三种答案。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **检测不到不等于群聊**：宿主不可用 / 无 characters 时返回 `group:false`
 *      并带 `unknown` 标记——宁可不拦，不可把单聊误拦（误拦会把所有用户
 *      关在门外）。
 *   2 **不依赖单一字段**：群聊识别取「characters 里非当前角色的人数」与
 *      「group 成员表长度」两路，任一命中即判群聊；两路都不可用时归 unknown。
 *   3 本模块**不写任何状态**：不写 store、不写 localStorage、不产生状态容器、
 *      不进 `SOURCES`、无总开关（它是个**只读问路器**，没有可关的东西）。
 *   4 `guard` 只回答「该不该做」，**不帮调用方撤销已做的事**——
 *      调用顺序必须是「先 guard 后写」，反过来没有任何补救。
 *   5 拒收码复用既有 `bad-channel`：不新造 `group-chat` 这类码（同一件事
 *      两本账是本仓已付过学费的事）。
 *   6 不假装知道「多人轮次该怎么算」：本模块不做群聊适配，也不输出适配建议。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const stat = { checks: 0, groups: 0, unknowns: 0, refusals: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.lastReason = reason; }

  /** 拾取上下文（与 compat/host.js 同路：mainWin.SillyTavern.getContext）。 */
  function context() {
    try {
      const w = WA.mainWin || window;
      return (w.SillyTavern && w.SillyTavern.getContext) ? w.SillyTavern.getContext() : null;
    } catch (e) { return null; }
  }

  /**
   * 检测当前对话是不是群聊。
   * @returns {group, unknown, reasons:[], sizes:{}} —— `unknown:true` 表示宿主不可用，
   *          **不得**把它当作群聊（边界 1）。
   */
  function detect() {
    stat.checks++;
    const out = { group: false, unknown: false, reasons: [], sizes: {} };
    const ctx = context();
    if (!ctx) { out.unknown = true; stat.unknowns++; stat.lastReason = 'no-host'; return out; }
    let seen = false;
    try {
      const chars = ctx.characters;
      if (Array.isArray(chars) && chars.length) {
        seen = true;
        out.sizes.characters = chars.length;
        if (chars.length > 1) { out.group = true; out.reasons.push('characters:' + chars.length); }
      }
    } catch (e) {}
    try {
      const g = ctx.group || (ctx.groups && ctx.groups[ctx.groupId]) || null;
      const members = g && (g.members || g.memberIds);
      if (Array.isArray(members)) {
        seen = true;
        out.sizes.members = members.length;
        if (members.length > 1) { out.group = true; out.reasons.push('members:' + members.length); }
      }
    } catch (e) {}
    if (!seen) { out.unknown = true; stat.unknowns++; stat.lastReason = 'no-field'; return out; }
    if (out.group) { stat.groups++; stat.lastReason = 'group'; }
    else { stat.lastReason = 'solo'; }
    return out;
  }

  /**
   * 写前闸门。返回 `null` = 放行；非 null = 拒收体（调用方**必须**放弃这次写）。
   * @param {string} [op] 调用点名字（只进台账）
   */
  function guard(op) {
    const d = detect();
    if (!d.group) return null;
    stat.refusals++;
    return { ok: false, reason: 'bad-channel', channel: 'group',
      op: (op ? String(op).slice(0, 40) : null), because: d.reasons, sizes: d.sizes,
      detail: '本扩展只支持单主角对话；群聊下世界推演与写入一律不做（不做半支持的降级）' };
  }

  /** 就地判别（不拦路）：面板与诊断用。 */
  function isGroup() { return detect().group === true; }

  WA.groupGuard = {
    detect: detect, guard: guard, isGroup: isGroup,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/group-refuse.js', { kind: 'engine', ver: '2.130.0' });
})();
