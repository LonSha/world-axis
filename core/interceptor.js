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
    try { if (WA.render && WA.render.uninject) WA.render.uninject('interceptor'); } catch (e) { WA.log('warn', 'pre-uninject failed', e); }
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
    // v0.1.26: 取消短路——before 链节点（如一致性屏障）置 canceled 后，
    // 丢弃本轮全部注入并留日志；生成继续，只是世界状态不进 prompt
    if (ctx.canceled) {
      WA.log('warn', 'before链取消本轮注入：' + (ctx.cancelReason || '未注明原因') + '（丢弃 ' + ctx.injections.length + ' 项）');
      ctx.injections = [];
      try { if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(0); } catch (e) {}
      return;
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
            try { if (WA.render && WA.render.uninject) WA.render.uninject('chat-changed'); } catch (e) { WA.log('warn', 'chat uninject failed', e); }
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
  // v0.1.28: 总线健康——异常聚合计数、监听器去重与泄漏告警、emit 快照防自增删破坏
  const listeners = {};
  const LEAK_THRESHOLD = 24;
  const busStat = {}; // evt -> {emits, errors, lastError, leakedWarned}
  function stat(evt) { return busStat[evt] || (busStat[evt] = { emits: 0, dead: 0, errors: 0, lastError: null, lastAt: 0, leakedWarned: false }); }
  WA.on = (evt, fn) => {
    if (!evt || typeof fn !== 'function') return function () {};
    const arr = listeners[evt] || (listeners[evt] = []);
    if (arr.indexOf(fn) >= 0) { WA.log('warn', '事件重复订阅已忽略: ' + evt); return function () {}; }
    arr.push(fn);
    const st = stat(evt);
    if (arr.length > LEAK_THRESHOLD && !st.leakedWarned) {
      st.leakedWarned = true;
      WA.log('warn', '事件监听器疑似泄漏: ' + evt + ' 已有 ' + arr.length + ' 个监听器（检查是否有每轮注册未解绑）');
    }
    return function off() {
      try { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1); } catch (e) {}
    };
  };
  WA.off = (evt, fn) => {
    const arr = listeners[evt];
    if (!arr) return false;
    const i = arr.indexOf(fn);
    if (i < 0) return false;
    arr.splice(i, 1);
    return true;
  };
  WA.emit = (evt, data) => {
    const st = stat(evt);
    st.emits++;
    const arr = listeners[evt];
    if (!arr || !arr.length) { st.dead++; return 0; }   // v0.1.28: 无人监听 = 死信号
    let called = 0;
    arr.slice().forEach(fn => {   // 快照：监听器内部 on/off 不影响本轮派发
      try { fn(data); called++; }
      catch (e) {
        st.errors++; st.lastAt = Date.now();
        st.lastError = String((e && (e.message || e)) || e).slice(0, 180);
        WA.log('warn', '事件监听异常 ' + evt, e);
      }
    });
    return called;
  };
  WA.busStats = function (topN) {
    const rows = Object.keys(busStat).map(function (evt) {
      const st = busStat[evt];
      return { event: evt, listeners: (listeners[evt] || []).length, emits: st.emits, dead: st.dead || 0, errors: st.errors, lastError: st.lastError, lastAt: st.lastAt, leakSuspect: (listeners[evt] || []).length > LEAK_THRESHOLD };
    });
    rows.sort(function (a, b) { return (b.errors - a.errors) || (b.listeners - a.listeners); });
    const n = topN && topN > 0 ? topN : 12;
    return { events: rows.slice(0, n), tracked: rows.length, totalListeners: Object.keys(listeners).reduce(function (s, k) { return s + listeners[k].length; }, 0) };
  };
  WA.LEAK_THRESHOLD = LEAK_THRESHOLD;
})();
