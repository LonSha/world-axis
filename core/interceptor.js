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
  let purifyHooked = false;   // v2.1.0: 输出净化挂载哨兵
  // v2.1.0: 净化原文快照（WeakMap：不写进 chat 存档，随消息对象回收）
  const __purifiedRaw = new WeakMap();

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
    lastRoundSig = sig;
    // v0.1.31: 写合并——整轮（撤销回写+contextSize记账+before链+注入落地）只推进内存，轮末统一落盘一次
    const runRound = async () => {
    try { if (WA.render && WA.render.uninject) WA.render.uninject('interceptor'); } catch (e) { WA.log('warn', 'pre-uninject failed', e); }
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
      try { if (WA.store && contextSize) WA.store.transact(d => { d.meta = d.meta || {}; d.meta.contextSize = contextSize; }); } catch (e) { /* 预算推导用，失败不影响推演 */ }
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
    }; // end runRound
    if (WA.store && WA.store.batch) await WA.store.batch(runRound); else await runRound();
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
            // v0.7.0: 楼层结算守卫——世界推进（round++/骰子/风声/推演）每楼层至多一次。
            // 重掷（swipe）/重复通知不再虚增世界时间（探针实证 round 1→2→3 虚增）。
            let settleRec = null, guardWhy = null;
            if (WA.settleGuard) {
              const g = WA.settleGuard.begin();
              if (!g.settle) {
                guardWhy = g.reason;
                WA.settleGuard.markSkip(guardWhy);
                WA.log('info', '楼层结算守卫：跳过本轮世界推进（' + guardWhy + '；forceNext 可强制）');
                // 保留 lastRoundSig 语义的一致性：after 链未执行不更新（下次同楼层仍跳过）
                return;
              }
              settleRec = g.rec;
            }
            // 重新构建与before链同源的ctx（含chat/branchId），供after链节点使用
            const c = getCtx();
            const chatArr = (c && c.chat) || [];
            // v2.1.0: 口径保护——本楼层若已被输出净化改写过 mes，世界推进期间临时还原原文
            //   （MESSAGE_RECEIVED 早于 GENERATION_ENDED 派发，不还原则推进读到净化文本）
            const tailMsg = chatArr.length ? chatArr[chatArr.length - 1] : null;
            const purifiedText = (tailMsg && __purifiedRaw.has(tailMsg)) ? tailMsg.mes : null;
            if (purifiedText != null) tailMsg.mes = __purifiedRaw.get(tailMsg);
            const actx = {
              args,
              type: 'after',
              chat: chatArr,
              store: WA.store ? WA.store.get() : null,
              branchId: WA.store ? WA.store.currentBranchId() : 'b0',
              injections: []
            };
            // v0.1.31: 写合并——after 链同样只推进内存，链结束统一落盘一次
            try {
              const runAfter = async () => {
                await WA.workflow.run('after', actx);
                // v0.7.0: 结算完成才记录楼层（批内提交，随批落盘；失败阻断则下轮重试）
                if (WA.settleGuard && settleRec) WA.settleGuard.commit(settleRec);
              };
              if (WA.store && WA.store.batch) await WA.store.batch(runAfter); else await runAfter();
            }
            catch (e) { WA.log('error', 'after链执行异常', e); }
            finally { if (purifiedText != null && tailMsg) tailMsg.mes = purifiedText; }   // v2.1.0: 恢复净化文本
          });
        }
        // v2.1.0: 输出侧净化——purifier.apply 此前全库零调用（功能整体失效）
        //   只改显示文本、不动世界结算口径：世界推进基于原文，净化仅影响用户所见。
        if (et.MESSAGE_RECEIVED && !purifyHooked) {
          purifyHooked = true;
          ctx.eventSource.on(et.MESSAGE_RECEIVED, () => {
            try {
              if (!WA.purifier || typeof WA.purifier.applySafe !== 'function') return;
              const c = getCtx();
              const chat = (c && c.chat) || [];
              const last = chat[chat.length - 1];
              if (!last || last.is_user || typeof last.mes !== 'string' || !last.mes) return;
              const out = WA.purifier.applySafe(last.mes);
              if (out !== last.mes) {
                __purifiedRaw.set(last, last.mes);   // 原文快照：世界推进仍基于原文
                last.mes = out;
                // 通知宿主重绘该楼层（ST 侧 API 存在才调用，缺失不报错）
                try { if (c && typeof c.updateMessageBlock === 'function') c.updateMessageBlock(chat.length - 1, last); } catch (e) { /* 宿主重绘非必需 */ }
              }
            } catch (e) { WA.log('warn', '输出净化失败（不影响生成结果）', e); }
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
