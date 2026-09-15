/**
 * WorldAxis engines/inject-inspector.js (v0.9.2) — 注入自检（纯只读）
 * 缝合来源：DlSNlGHT World —— world-engine-inject-inspector.js
 *
 * 订阅宿主 prompt-ready 事件，抓「最终送往模型的内容」快照，判定本轮世界状态注入是否真落地：
 *   SUCCESS          确实进入最终 prompt（命中哨兵标记）
 *   MISSING          已注册却没进 prompt —— 真·注入失败（被其它扩展清掉/深度越界）
 *   SKIPPED_DISABLED 注入可见性全关（按设计跳过）
 *   SKIPPED_REROLL   同层重 roll（swipe/重答），按设计不二次注入
 *   SKIPPED_OTHER    本轮没注册注入（未推演 / 无世界状态）
 *   NOT_YET          本轮还没生成过
 *
 * 只读：不写 store、不改 prompt、异常一律吞掉（绝不影响生成）。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const mainWin = WA.mainWin || G;

  const SENTINEL = 'world_axis_state';
  const EV_CHAT = 'chat_completion_prompt_ready';
  const EV_TEXT = 'generate_after_combine_prompts';
  const MAX_EXCERPT = 400;
  const STATUS_TEXT = {
    NOT_YET: '尚未生成，暂无注入记录',
    SKIPPED_DISABLED: '本轮未注入：注入正文已关闭（可见性全关）',
    SKIPPED_REROLL: '本轮按设计未注入：同层重 roll（swipe/重新生成）',
    SKIPPED_OTHER: '本轮未注入：尚未触发推演或无世界状态',
    SUCCESS: '本轮世界状态已进入正文',
    SUCCESS_SLOTS_ONLY: '本轮主块未注册但剧情约束已通过独立槽位落地（v0.1.1 槽位路由）',
    MISSING: '已注册却没进最终 prompt —— 真注入失败（疑被其它扩展清除/深度越界）'
  };

  let _subscribed = false;
  let _last = null;
  let _lastMemory = null;
  let _registered = null;

  // v0.1.8: 统一 safe 语义——fn 返回 undefined 时也兜底（与 tool-diag/contract-audit 对齐）
  function safe(fn, fallback) { try { const v = fn(); if (v !== undefined) return v; } catch (e) {} return fallback === undefined ? null : fallback; }
  function textOf(m) {
    if (m == null) return '';
    if (typeof m === 'string') return m;
    return String(m.mes != null ? m.mes : (m.content != null ? m.content : ''));
  }
  function isOurs(m) {
    if (!m) return false;
    if (m.is_extension_prompt || m.isExtension || m.isExtensionPrompt) return true;
    return textOf(m).indexOf(SENTINEL) >= 0;
  }
  function getCtx() {
    return safe(function () {
      const S = mainWin.SillyTavern;
      return S && S.getContext ? S.getContext() : null;
    }, null);
  }

  /** inject.js 落地成功后打点：用于区分「没注册」与「注册了却丢了」 */
  function markRegistered(len) {
    _registered = { len: len | 0, at: safe(function () { return Date.now(); }, 0) };
  }

  function snapEnv(ctx, meta) {
    const vis = safe(function () { return WA.render && WA.render.getVisibility(); }, null) || {};
    const anyOn = Object.keys(vis).some(function (k) { return vis[k] === true; });
    const st = safe(function () { return WA.store && WA.store.get(); }, null);
    const snap = safe(function () { return WA.render && WA.render.buildWorldSnapshot && WA.render.buildWorldSnapshot(); }, '') || '';
    return {
      injectEnabled: anyOn,
      round: st && st.round != null ? st.round : null,
      hasState: !!st,
      snapshotChars: snap.length,
      registeredAtSend: !!_registered,
      registeredLen: _registered ? _registered.len : 0,
      sameLayerReroll: !!(meta && meta.sameLayerReroll),
      // v0.1.7: 补槽位落地信息——主块为空但槽位路由成功时，classify 不应误判为 SKIPPED_OTHER
      slotLanded: safe(function () {
        const li = WA.store && WA.store.get ? WA.store.get().lastInjection : null;
        return !!(li && li.slots && li.slots.applied > 0);
      }, false),
      slotCount: safe(function () {
        const li = WA.store && WA.store.get ? WA.store.get().lastInjection : null;
        return (li && li.slots) ? li.slots.applied : 0;
      }, 0),
      chatId: safe(function () { return WA.store && WA.store.chatId && WA.store.chatId(); }, null)
    };
  }

  /** 判定：落地即真相，压过一切推测 */
  function classify(env, landed) {
    if (landed) return 'SUCCESS';
    if (!env) return 'NOT_YET';
    if (!env.injectEnabled) return 'SKIPPED_DISABLED';
    if (env.sameLayerReroll) return 'SKIPPED_REROLL';
    if (!env.registeredAtSend) {
      // v0.1.7: 主块未注册但槽位路由成功——约束类注入已独立落地，不是 MISSING
      if (env.slotLanded) return 'SUCCESS_SLOTS_ONLY';
      return 'SKIPPED_OTHER';
    }
    return 'MISSING';
  }

  function snapshotChat(chat, env) {
    try {
      if (!Array.isArray(chat)) return null;
      const chain = chat.map(function (m) {
        return { role: (m && m.role) || 'user', length: textOf(m).length, isOurs: isOurs(m) };
      });
      let ourIndex = -1, ourContent = '';
      for (let i = 0; i < chat.length; i++) {
        if (isOurs(chat[i])) { ourIndex = i; ourContent = textOf(chat[i]); }
      }
      const landed = ourIndex >= 0;
      return {
        apiType: 'chat', ts: safe(function () { return Date.now(); }, 0),
        status: classify(env, landed), landed: landed,
        messageCount: chat.length, roleChain: chain,
        ourIndex: ourIndex, ourContent: ourContent.slice(0, MAX_EXCERPT), ourContentLen: ourContent.length,
        injectEnabled: env ? env.injectEnabled : null,
        registeredAtSend: env ? env.registeredAtSend : null,
        sameLayerReroll: env ? env.sameLayerReroll : null,
        round: env ? env.round : null
      };
    } catch (e) { return null; }
  }

  function snapshotText(prompt, env) {
    try {
      if (typeof prompt !== 'string') return null;
      const idx = prompt.indexOf(SENTINEL);
      const landed = idx >= 0;
      const excerpt = landed ? prompt.slice(Math.max(0, idx - 40), idx + MAX_EXCERPT) : '';
      return {
        apiType: 'text', ts: safe(function () { return Date.now(); }, 0),
        status: classify(env, landed), landed: landed,
        promptLength: prompt.length, ourIndex: idx,
        ourExcerpt: excerpt, ourExcerptLen: excerpt.length,
        injectEnabled: env ? env.injectEnabled : null,
        registeredAtSend: env ? env.registeredAtSend : null,
        sameLayerReroll: env ? env.sameLayerReroll : null,
        round: env ? env.round : null
      };
    } catch (e) { return null; }
  }

  function onChatReady(eventData) {
    safe(function () {
      if (!eventData || eventData.dryRun) return;
      if (!Array.isArray(eventData.chat)) return;
      const env = snapEnv(getCtx(), eventData);
      _last = snapshotChat(eventData.chat, env);
      _lastMemory = _last;
    });
  }
  function onTextReady(eventData) {
    safe(function () {
      if (!eventData || eventData.dryRun) return;
      if (typeof eventData.prompt !== 'string') return;
      const env = snapEnv(getCtx(), eventData);
      _last = snapshotText(eventData.prompt, env);
      _lastMemory = _last;
    });
  }

  function init() {
    if (_subscribed) return false;
    const ctx = getCtx();
    if (!ctx || !ctx.eventSource || typeof ctx.eventSource.on !== 'function') {
      if (WA.log) WA.log('warn', '注入自检：eventSource 不可用，跳过订阅');
      return false;
    }
    try {
      const et = ctx.eventTypes || ctx.event_types || {};
      ctx.eventSource.on(et.CHAT_COMPLETION_PROMPT_READY || EV_CHAT, onChatReady);
      ctx.eventSource.on(et.GENERATE_AFTER_COMBINE_PROMPTS || EV_TEXT, onTextReady);
      _subscribed = true;
      if (WA.log) WA.log('info', '注入自检就绪（只读订阅 prompt-ready）');
      return true;
    } catch (e) {
      if (WA.log) WA.log('warn', '注入自检订阅失败（非致命）', e);
      return false;
    }
  }

  // v0.1.10: 返回快照的独立副本——调用方对返回对象的修改不得污染内部状态
  //         （tool-diag 读快照后可能追加字段；memory/world 两份生命周期独立）
  function cloneSnap(snap) {
    if (!snap || typeof snap !== 'object') return snap;
    const out = {};
    Object.keys(snap).forEach(function (k) { out[k] = snap[k]; });
    return out;
  }
  function getLastSnapshot(scope) {
    if (scope === 'memory') return cloneSnap(_lastMemory);
    if (scope == null || scope === '' || scope === 'world') return cloneSnap(_last);
    return null;
  }
  function statusText(status, scope) {
    const t = STATUS_TEXT[status] || STATUS_TEXT.NOT_YET;
    return scope === 'memory'
      ? t.replace(/世界状态/g, '记忆信息').replace(/无世界状态/g, '无记忆信息')
      : t;
  }
  function flatten(snap) {
    if (!snap) return [{ level: 'info', key: 'status', detail: statusText('NOT_YET') }];
    const out = [{ level: snap.landed ? 'pass' : 'warn', key: 'status', detail: statusText(snap.status) }];
    out.push({ level: 'info', key: 'apiType', detail: snap.apiType + '（' + (snap.apiType === 'chat' ? snap.messageCount + ' 条消息' : snap.promptLength + ' 字符 prompt') + '）' });
    out.push({ level: 'info', key: 'ourIndex', detail: '命中位置 ' + snap.ourIndex + '，注入长度 ' + (snap.apiType === 'chat' ? snap.ourContentLen : snap.ourExcerptLen) });
    if (snap.status === 'MISSING') out.push({ level: 'error', key: 'miss', detail: '注入已注册但未出现在最终 prompt，检查其它扩展是否清空 prompt 或 depth 越界' });
    if (snap.status === 'SKIPPED_DISABLED') out.push({ level: 'warn', key: 'disabled', detail: '设置页注入可见性全部关闭，世界状态不会进正文' });
    if (snap.status === 'SKIPPED_REROLL') out.push({ level: 'info', key: 'reroll', detail: 'swipe/重答沿用了本轮已有注入，属预期行为' });
    if (snap.status === 'SUCCESS_SLOTS_ONLY') out.push({ level: 'pass', key: 'slotsOnly', detail: '剧情约束已由独立槽位落地（' + (snap.env ? snap.env.slotCount : 0) + ' 路），主世界状态块为空属预期' });
    return out;
  }
  function reset() { _last = null; _lastMemory = null; _registered = null; }

  WA.injectInspector = {
    SENTINEL, STATUS_TEXT,
    init, markRegistered, snapEnv, classify, snapshotChat, snapshotText,
    getLastSnapshot, statusText, flatten, reset, safe
  };
  if (WA.log) WA.log('info', '注入自检引擎已加载');
})();
