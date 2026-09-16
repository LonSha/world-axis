/**
 * WorldAxis core/settle-guard.js (v0.7.0)
 * 楼层结算守卫——after 链（世界推进）对每一楼层只结算一次。
 *
 * 缺陷背景（探针实证）：
 *   after 链（evolution.tick 的 round++/骰子/风声衰减、backstage 推演、directEvent 推进…）
 *   对每次 gen_ended 全量执行且无守卫——swipe/重掷使 evolution.round 1→2→3 虚增、
 *   骰子多掷、风声多衰减。与 before 链既有口径（重掷沿用本轮注入 SKIPPED_REROLL）自相矛盾。
 *
 * 语义（防双计优先）：
 *   floor = chat.length-1；sig = floor + swipe + mesLen + fnv1a(mes)。
 *   meta.lastSettle 记录最后已结算楼层。
 *     - 无记录 / 跨聊天 → settle（fresh）
 *     - floor > 已结算.floor → settle（new-floor）
 *     - floor === 已结算.floor → skip（dup=重复通知 / reroll=重掷，防同层双计）
 *     - floor <  已结算.floor → skip（rewind：回退重玩不重复推进；新路径内容
 *       会由下一次结算读取近期正文时自然吸收，不会永久丢失）
 *   forceNext() 手动旁路一次（用户删改后强制重结算）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  function getCtx() {
    try { return mainWin.SillyTavern && mainWin.SillyTavern.getContext ? mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }
  function fnv1a(str) {
    const s = String(str == null ? '' : str);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function floorInfo() {
    const ctx = getCtx();
    const chat = ctx && ctx.chat;
    if (!chat || !chat.length) return { ok: false };
    const idx = chat.length - 1;
    const m = chat[idx] || {};
    const mes = String(m.mes == null ? '' : m.mes);
    const swipe = Number(m.swipe_id) || 0;
    return { ok: true, floor: idx, swipe: swipe, mesLen: mes.length, hash: fnv1a(mes),
      sig: idx + '_s' + swipe + ':' + mes.length + ':' + fnv1a(mes) };
  }
  function lastRecord() {
    try { return (WA.store && WA.store.read) ? (WA.store.read('meta.lastSettle', null) || null) : null; }
    catch (e) { return null; }
  }
  function chatId() {
    try { return WA.store && WA.store.chatId ? WA.store.chatId() : 'wa_default'; }
    catch (e) { return 'wa_default'; }
  }

  let __force = false;                 // 手动旁路一次
  const __stat = { settles: 0, dup: 0, reroll: 0, rewind: 0, nochat: 0, forced: 0,
    lastReason: null, lastAt: 0, lastSkippedFloor: null };

  const guard = WA.settleGuard = {
    fnv1a: fnv1a,
    /** 判定本轮是否结算；返回 { settle, reason, rec }（rec 供 commit 记录） */
    begin() {
      const info = floorInfo();
      const rec = lastRecord();
      const cid = chatId();
      if (!info.ok) { __stat.nochat++; __stat.lastReason = 'no-chat'; __stat.lastAt = Date.now();
        return { settle: false, reason: 'no-chat', rec: null }; }
      let settle = false, reason = null;
      if (__force) { settle = true; reason = 'forced'; __force = false; __stat.forced++; }
      else if (!rec || rec.chatId !== cid) { settle = true; reason = 'fresh'; }
      else if (info.floor > rec.floor) { settle = true; reason = 'new-floor'; }
      else if (info.floor === rec.floor) {
        settle = false; reason = (rec.sig === info.sig) ? 'dup' : 'reroll';
      } else { settle = false; reason = 'rewind'; }   // info.floor < rec.floor
      if (!settle) { __stat[reason] = (__stat[reason] || 0) + 1; __stat.lastReason = reason; __stat.lastAt = Date.now(); __stat.lastSkippedFloor = info.floor; }
      return { settle: settle, reason: reason, rec: { chatId: cid, floor: info.floor, swipe: info.swipe, mesLen: info.mesLen, hash: info.hash, sig: info.sig } };
    },
    /** 结算完成：记录最后已结算楼层（在批内调用，随批落盘） */
    commit(rec) {
      if (!rec) return false;
      try {
        const tx = WA.store.transact(d => {
          d.meta = d.meta || {};
          d.meta.lastSettle = {
            chatId: rec.chatId, floor: rec.floor, swipe: rec.swipe, sig: rec.sig,
            round: (d.evolution && d.evolution.round) || 0, at: Date.now()
          };
        });
        if (tx && tx.ok) { __stat.settles++; __stat.lastReason = 'settled'; __stat.lastAt = Date.now(); return true; }
      } catch (e) { WA.log('warn', 'settleGuard.commit 失败（不阻断）', e); }
      return false;
    },
    /** 跳过留痕（interceptor 在 gate 拒绝后调用） */
    markSkip(reason) {
      __stat.lastReason = reason; __stat.lastAt = Date.now();
    },
    /** 手动旁路一次：下一次 begin 强制结算（用户删改消息后的 escape hatch） */
    forceNext() { __force = true; return true; },
    peekForce() { return __force; },
    reset() { __force = false; },
    stat() {
      const rec = lastRecord();
      return { settles: __stat.settles, skips: { dup: __stat.dup, reroll: __stat.reroll, rewind: __stat.rewind, nochat: __stat.nochat },
        forced: __stat.forced, lastReason: __stat.lastReason, lastAt: __stat.lastAt,
        lastSkippedFloor: __stat.lastSkippedFloor,
        lastSettle: rec ? { floor: rec.floor, swipe: rec.swipe, round: rec.round, chatId: rec.chatId, at: rec.at } : null };
    }
  };
  if (WA.log) WA.log('info', '楼层结算守卫已加载（after 链每楼层至多结算一次）');
})();