/**
 * WorldAxis core/undo.js (v2.30.0) — 参数编辑受控入口 + 撤销栈
 *
 * 为什么需要它（v2.30.0，P0-2）：
 *   本仓库的手动参数编辑此前只有「写」没有「退」：面板上一次误改（世界背景、势力状态、
 *   事件增删）直接落盘，环形恢复点窗口只有 3 个且按存档粒度滚动，一次后续保存就能把
 *   误改前的现场冲掉。用户没有任何「点一下就退回上一步」的入口。
 *
 * 机制来源（诚实交代）：story-world-v2/src/undo-stack.js（MIT 许可）的 createParamUndoStack
 *   按 WorldAxis 的 IIFE 形态重写，语义逐条对齐，差异如下：
 *     · 读写在运行时指向 WA.store（本仓唯一真源），不再注入 read/write；
 *     · 栈条目按 path 记（本仓编辑以 store 路径为粒度，不是整份世界快照）；
 *     · undo 的写回走 store.patch（受控写回 + 落盘 + 镜像一条龙），写回失败时
 *       **如实报错并保留栈顶**（状态没变 ⇒ 栈也不该变；参考仓 leg46 的「写回失败必须
 *       pop」针对的是 edit 先入栈后写回的场景，与 undo 写回不是同一回事，此处注释即裁决）。
 *
 * 两条从参考仓继承的硬纪律（都有判据钉住，见 tests/run.js v2.30.0 块）：
 *   ① **显式值优先**：pushValue 只接受调用方已经取好的「变更前那份」，绝不自己再读一次——
 *      写回可能已发生，再读只会读到改完之后的状态，撤销等于没撤（ref_sw2 leg41）。
 *   ② **同标签合并**：连续同类编辑（输入框逐次 input）只记最早那一步的 before，
 *      undo 一步退到编辑序列开始前（ref_sw2 v1 语义）。
 *
 * 分层：纯逻辑层 + 运行时指向 WA.store（零 DOM / 零 Node 内建，进 browser-compat 扫描面）。
 */
;
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LIMIT = 50;                 // 上限滑窗（丢最旧）
  const __stack = [];               // [{ path, value, label, chatId, at }]
  const __stat = { pushes: 0, merged: 0, undos: 0, undoFails: 0, lastUndoAt: 0, lastLabel: null, clearedByChat: 0 };
  let __undoing = false;            // undo 自己的写回不再入栈（否则撤销变两态乒乓）

  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  function notify() {
  }

  function currentChatId() {
    try { return WA.store && typeof WA.store.chatId === 'function' ? WA.store.chatId() : null; }
    catch (_) { return null; }
  }

  /**
   * 入栈一步「变更前状态」。**显式值优先**：value 必须是调用方写回发生之前取好的快照。
   * @param {string} label  操作名（同标签连续记合并）
   * @param {string} path   store 路径（undo 时按它 patch 回去）
   * @param {*}      before 变更前值（调用方已取好；深浅由调用方负责——数组请传副本）
   * @returns {boolean} 是否真正入栈（false = 合并掉了或参数不合法）
   */
  function pushValue(label, path, before) {
    const name = String(label || '编辑');
    const p = String(path || '');
    if (!p) return false;
    const top = __stack[__stack.length - 1];
    // 同标签合并：只保留最早那一步的 before（撤销一步 = 退回编辑序列开始前）
    if (top && top.label === name && top.path === p) { __stat.merged++; return false; }
    __stack.push({ path: p, value: before, label: name, chatId: currentChatId(), at: clockNow('undo.push') });
    if (__stack.length > LIMIT) __stack.shift();
    __stat.pushes++; __stat.lastLabel = name;
    notify();
    return true;
  }

  /** 撤销一步：弹栈顶、按 path patch 回去。写回失败 ⇒ 如实报错、**保留栈顶**（状态没变）。 */
  function undo() {
    const top = __stack[__stack.length - 1];
    if (!top) return { ok: false, reason: '没有可撤销的编辑' };
    // 跨聊天守卫：栈是按聊天纪的，换世界后旧栈整体失效（不拿 A 世界的 before 写 B 世界）
    if (top.chatId && currentChatId() && top.chatId !== currentChatId()) {
      __stack.length = 0; __stat.clearedByChat++; notify();
      return { ok: false, reason: '已切换聊天，旧撤销栈已清空' };
    }
    // 自屏蔽：撤销的写回本身就是一次 patch，绝不能又把自己的 before 压回栈（两态乒乓）
    __undoing = true;
    let r;
    try { r = WA.store.patch(top.path, top.value); }
    finally { __undoing = false; }
    if (!r || r.ok !== true) {
      __stat.undoFails++;
      // 保留栈顶：写回失败意味着世界没变，这条「变更」确实还发生过，撤销仍应可重试
      return { ok: false, reason: '撤销写回失败（世界未变，栈已保留）', error: r && r.error };
    }
    __stack.pop();
    __stat.undos++; __stat.lastUndoAt = clockNow('undo.undo');
    notify();
    return { ok: true, path: top.path, label: top.label };
  }

  /** store.patch 自动钩子：写回成功后记「变更前」；__undoing 自屏蔽防撤销乒乓。 */
  function capture(label, path, before) {
    if (__undoing) return false;
    return pushValue(label || '参数编辑', path, before);
  }

  /** 只看栈顶，不弹不写（调用方按「先 peek → 自己决定」的纪律用）。 */
  function peek() {
    const top = __stack[__stack.length - 1];
    return top ? { path: top.path, label: top.label, at: top.at } : null;
  }

  function stat() {
    return {
      count: __stack.length, limit: LIMIT,
      pushes: __stat.pushes, merged: __stat.merged,
      undos: __stat.undos, undoFails: __stat.undoFails,
      clearedByChat: __stat.clearedByChat,
      lastUndoAt: __stat.lastUndoAt, lastLabel: __stat.lastLabel
    };
  }

  function clear() { __stack.length = 0; notify(); }

  WA.undo = {
    pushValue: pushValue,   // 受控入口：显式值优先
    capture: capture,       // store.patch 自动钩子（写回成功后记变更前）
    undo: undo,
    peek: peek,
    stat: stat,
    clear: clear,
  };
})();
