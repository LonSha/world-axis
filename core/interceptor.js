/**
 * WorldAxis core/interceptor.js
 * 唯一 generate_interceptor 入口 + 事件回退链路 + 去重守卫
 * 缝合来源：EW-Assistant 主拦截+GENERATION_AFTER_COMMANDS回退 + 世界背面发送前一致性屏障
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  let installed = false;
  let lastRoundSig = '';           // 去重：同一轮生成只跑一次before链
  let afterHooked = false;

  function getCtx() {
    try { return mainWin.SillyTavern && mainWin.SillyTavern.getContext ? mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }

  function roundSig() {
    const ctx = getCtx();
    const len = ctx && ctx.chat ? ctx.chat.length : 0;
    const last = len && ctx.chat[len - 1];
    // 去重签名：同一聊天长度+最后消息内容+swipe_id 视为同一轮（不含时间戳，否则永不命中）
    return len + ':' + (last && last.mes ? String(last.mes).length : 0) + ':' + (last && last.swipe_id != null ? last.swipe_id : 0);
  }

  // 主拦截：SillyTavern 在组装prompt前 await 此函数
  window.worldAxisGenerateInterceptor = async function (chat, contextSize, abort, type) {
    // quiet/impersonate 等旁路生成跳过，避免递归
    if (type && type !== 'normal' && type !== 'regenerate' && type !== 'swipe') return;
    const sig = roundSig();
    if (sig === lastRoundSig) { WA.log('info', '拦截器去重：本轮before链已执行'); return; }
    try { if (WA.render && WA.render.uninject) WA.render.uninject(); } catch (e) { WA.log('warn', 'pre-uninject failed', e); }
    lastRoundSig = sig;
    try { if (WA.store && contextSize) WA.store.transact(d => { d.meta = d.meta || {}; d.meta.contextSize = contextSize; }); } catch (e) { /* 预算推导用，失败不影响推演 */ }

    const ctx = {
      type: type || 'normal',
      chat,
      abort,
      store: WA.store ? WA.store.get() : null,
      branchId: WA.store ? WA.store.currentBranchId() : 'b0',
      injections: [],   // 各节点推入 {source, position, depth, content}
      canceled: false
    };
    try {
      await WA.workflow.run('before', ctx);
    } catch (e) {
      WA.log('error', 'before链关键失败，本轮沿用上一份已确认世界状态', e);
    }
    // 注入统一落地（render/inject 节点也可是链条之一；这里兜底处理injections数组）
    try { WA.render && WA.render.applyInjections && WA.render.applyInjections(ctx); } catch (e) { WA.log('error', '注入落地失败', e); }
  };

  const interceptor = WA.interceptor = {
    install() {
      if (installed) return;
      installed = true;
      const ctx = getCtx();
      if (ctx && ctx.eventSource && ctx.eventTypes) {
        // after_reply：AI回复完成后
        const et = ctx.eventTypes;
        const afterEvt = et.GENERATION_ENDED || et.MESSAGE_RECEIVED;
        if (afterEvt && !afterHooked) {
          afterHooked = true;
          ctx.eventSource.on(afterEvt, async (...args) => {
            // 重新构建与before链同源的ctx（含chat/branchId），供after链节点使用
            const c = getCtx();
            const actx = {
              args,
              type: 'after',
              chat: (c && c.chat) || [],
              store: WA.store ? WA.store.get() : null,
              branchId: WA.store ? WA.store.currentBranchId() : 'b0',
              injections: []
            };
            try { await WA.workflow.run('after', actx); }
            catch (e) { WA.log('error', 'after链执行异常', e); }
          });
        }
        // 切聊天：重载store + 旧异步失效
        if (et.CHAT_CHANGED) {
          ctx.eventSource.on(et.CHAT_CHANGED, () => {
            try { if (WA.render && WA.render.uninject) WA.render.uninject(); } catch (e) { WA.log('warn', 'chat uninject failed', e); }
            try { WA.store.init(); } catch (e) { WA.log('error', '切聊天重载store失败', e); }
            WA.emit && WA.emit('chat:changed');
          });
        }
        WA.log('info', '拦截器安装完成（事件源已挂接）');
      } else {
        WA.log('warn', '未检测到SillyTavern事件源，仅拦截器函数可用');
      }
    }
  };

  // 轻量事件总线（模块间解耦通信）
  const listeners = {};
  WA.on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  WA.emit = (evt, data) => { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { WA.log('warn', '事件监听异常 ' + evt, e); } }); };
})();
