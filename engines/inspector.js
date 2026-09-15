/**
 * WorldAxis engines/inspector.js (v0.8)
 * 注入自检查看器（纯只读）
 * 缝合来源：DlSNlGHT World —— world-engine-inject-inspector.js
 *
 * 铁律：
 *  - 纯只读：只读事件 eventData、extensionPrompts；不写存储、不改注入逻辑
 *  - 绝不 mutate eventData
 *  - 整个handler try/catch包死，绝不影响生成
 *  - 只留最后一份快照，内存有界
 *
 * 状态机：✅SUCCESS / ❌MISSING(注册了却没进正文=真bug) / ⏸SKIPPED(按设计跳过) / NOT_YET
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  const INJECTION_NAME = 'WorldAxis';
  // 哨兵：buildWorldSnapshot 输出以 <world_axis_state> 开头，无宏不被 substituteParams 改写
  const SENTINEL = '<world_axis_state>';

  const EV_TEXT = 'generate_after_combine_prompts';
  const EV_CHAT = 'chat_completion_prompt_ready';

  let _subscribed = false;
  let _last = null;

  function getCtx() {
    try { return (mainWin.SillyTavern && mainWin.SillyTavern.getContext) ? mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }

  function snapEnv(ctx) {
    let injectEnabled = true, registeredAtSend = false;
    try {
      const vis = WA.render && WA.render.getVisibility ? WA.render.getVisibility() : {};
      injectEnabled = Object.values(vis).some(Boolean);
    } catch (e) {}
    try {
      const ep = ctx && ctx.extensionPrompts;
      const entry = ep && ep[INJECTION_NAME];
      registeredAtSend = !!(entry && entry.value && String(entry.value).length);
    } catch (e) {}
    return { injectEnabled, registeredAtSend };
  }

  // 对话补全：从真·最终chat数组采role分好的链（只留长度与哨兵命中，不持有live引用）
  function snapChat(chat, env) {
    const messages = [];
    let landed = false, ourIndex = -1, ourLength = 0;
    for (let i = 0; i < chat.length; i++) {
      const m = chat[i] || {};
      const content = (m.content != null) ? String(m.content) : '';
      const isOurs = content.indexOf(SENTINEL) >= 0;
      messages.push({ role: m.role || '?', length: content.length, isOurs });
      if (isOurs && !landed) { landed = true; ourIndex = i; ourLength = content.length; }
    }
    return {
      apiType: 'chat', ts: Date.now(),
      injectEnabled: env.injectEnabled, registeredAtSend: env.registeredAtSend,
      landed, messageCount: messages.length, messages, ourIndex, ourLength,
      status: deriveStatus(env, landed)
    };
  }

  // 文本补全：prompt已flatten成单串，存长度+哨兵命中+摘录
  function snapText(prompt, env) {
    const text = String(prompt || '');
    const idx = text.indexOf(SENTINEL);
    const landed = idx >= 0;
    let excerpt = '';
    if (landed) {
      const a = Math.max(0, idx - 40);
      const b = Math.min(text.length, idx + 300);
      excerpt = (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '');
    }
    return {
      apiType: 'text', ts: Date.now(),
      injectEnabled: env.injectEnabled, registeredAtSend: env.registeredAtSend,
      landed, promptLength: text.length, ourExcerpt: excerpt,
      status: deriveStatus(env, landed)
    };
  }

  function deriveStatus(env, landed) {
    if (!env.injectEnabled) return 'SKIPPED_DISABLED';
    if (!env.registeredAtSend) return 'SKIPPED_OTHER';
    return landed ? 'SUCCESS' : 'MISSING';
  }

  function onChatPromptReady(eventData) {
    try {
      if (!eventData || eventData.dryRun) return;
      if (!Array.isArray(eventData.chat)) return;
      _last = snapChat(eventData.chat, snapEnv(getCtx()));
    } catch (e) { /* 只读自检绝不影响生成 */ }
  }

  function onTextPromptReady(eventData) {
    try {
      if (!eventData || eventData.dryRun) return;
      if (typeof eventData.prompt !== 'string') return;
      _last = snapText(eventData.prompt, snapEnv(getCtx()));
    } catch (e) {}
  }

  function init() {
    if (_subscribed) return;
    try {
      const ctx = getCtx();
      if (!ctx || !ctx.eventSource || typeof ctx.eventSource.on !== 'function') return;
      const et = ctx.event_types || {};
      ctx.eventSource.on(et.CHAT_COMPLETION_PROMPT_READY || EV_CHAT, onChatPromptReady);
      ctx.eventSource.on(et.GENERATE_AFTER_COMBINE_PROMPTS || EV_TEXT, onTextPromptReady);
      _subscribed = true;
      WA.log('info', '注入自检查看器就绪（只读订阅prompt-ready事件）');
    } catch (e) {
      WA.log('warn', '注入自检订阅失败（非致命）: ' + (e && e.message));
    }
  }

  function getLastSnapshot() { return _last; }

  const STATUS_TEXT = {
    NOT_YET: '尚未生成，暂无注入记录',
    SKIPPED_DISABLED: '本轮未注入：所有注入源均已关闭',
    SKIPPED_OTHER: '本轮未注入：尚未触发推演或无世界状态',
    SUCCESS: '✅ 本轮世界状态已进入正文',
    MISSING: '❌ 已注册却没进最终prompt——真正的注入失败（疑被其它扩展清除/深度越界）'
  };
  function statusText(status) { return STATUS_TEXT[status] || STATUS_TEXT.NOT_YET; }

  WA.inspector = { init, getLastSnapshot, statusText, SENTINEL };
})();