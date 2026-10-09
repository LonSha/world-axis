/* ============================================================
 * tests/browser/host-stub.mjs — SillyTavern 宿主契约桩（L4 真浏览器层）[L4]
 * ------------------------------------------------------------
 * 这一层补的是「无头回归**结构性够不着**」的那一格：
 *
 *   无头 tests/run.js 用的是自己搭的 vm 上下文（tests/mock.js）——它把
 *   `global.SillyTavern` 直接塞进 **Node 的 vm** 里。于是有一条边它天然验不到：
 *   **世界枢轴被宿主以 `<script src>` 方式装进真实 DOM 后，还能不能起来。**
 *   这条边上有三类只在真浏览器里成立的事实：
 *     · `WA.baseUrl` 是从 `document.getElementsByTagName('script')` 里那条含
 *       `WorldAxis/index.js` 的 src 上切出来的——vm 里没有真 script 标签，取不到；
 *     · 模块是 `loadScriptOnce()` 动态插 `<script>` 装载的（走真网络路径），
 *       而不是 `require`/`import`——装载失败是**静默 onerror**，vm 里不经过这条路；
 *     · `ui/panel.js` 的挂载要走真 DOM（createElement/innerHTML/querySelector）。
 *
 *   本桩因此**不仿真浏览器**（浏览器是真的），只仿真**宿主契约面**：它就是
 *   SillyTavern 侧扩展能看到的那个 `SillyTavern.getContext()` 及其配套全局。
 *
 * 桩面是从真源码**逐个消费点**读出来的（不是照抄某份文档）：
 *   SillyTavern.getContext()  → ctx.chat / chatId / chatMetadata / name / characterId /
 *                               groups / groupId / eventSource / eventTypes /
 *                               setExtensionPrompt / updateChatMetadata /
 *                               saveMetadataDebounced / saveMetadata / saveChat /
 *                               saveChatConditional / worldInfoSettings / characters /
 *                               maxContext / injections
 *   eventTypes 消费点          → APP_READY / MESSAGE_RECEIVED
 *   （其余事件名按 ST 既有取值补全，供 emit 驱动使用；未消费不等于可以缺席——
 *     缺了会让「按名订阅」的模块静默不订阅。）
 *
 * 与无头层的分工不变：两层结论**分报**，不互相顶替。本桩的读数在真排版/真网络/
 *   真 DOM 下取得；它**不**证明渲染像素或宿主动画行为。
 * ============================================================ */

/** SillyTavern 的事件名（取 ST 既有字符串值，供 emit 用）。 */
export const EVENT_TYPES = {
  APP_READY: 'app_ready',
  EXTRAS_CONNECTED: 'extras_connected',
  SETTINGS_LOADED: 'settings_loaded',
  SETTINGS_UPDATED: 'settings_updated',
  CHAT_CHANGED: 'chat_id_changed',
  CHAT_LOADED: 'chat_loaded',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_EDITED: 'message_edited',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_SWIPED: 'message_swiped',
  MESSAGE_UPDATED: 'message_updated',
  USER_MESSAGE_RENDERED: 'user_message_rendered',
  CHARACTER_MESSAGE_RENDERED: 'character_message_rendered',
  GENERATION_STARTED: 'generation_started',
  GENERATION_STOPPED: 'generation_stopped',
  GENERATION_ENDED: 'generation_ended',
  GENERATION_AFTER_COMMANDS: 'generation_after_commands',
  CHAT_COMPLETION_PROMPT_READY: 'chat_completion_prompt_ready',
  GENERATE_AFTER_COMBINE_PROMPTS: 'generate_after_combine_prompts',
  WORLDINFO_UPDATED: 'worldinfo_updated',
  WORLDINFO_SETTINGS_UPDATED: 'worldinfo_settings_updated',
  EXTENSIONS_LOADED: 'extensions_loaded',
};

/** 楼层工厂：ST 的 `chat[i]` 形态（只放本层真用得上的字段）。 */
export function makeFloor(opts = {}) {
  const isUser = !!opts.isUser;
  const isSystem = !!opts.isSystem;
  return {
    name: opts.name || (isUser ? 'User' : 'Character'),
    is_user: isUser,
    is_system: isSystem,
    mes: String(opts.mes == null ? '' : opts.mes),
    send_date: opts.sendDate || '2026-10-06 12:00:00',
    swipes: [String(opts.mes == null ? '' : opts.mes)],
    swipe_id: 0,
    swipe_info: [],
    extra: {},
  };
}

/**
 * 安装宿主桩。必须在**页面**里调用（它操作真的 window）。
 * @param {{chatId?:string, userName?:string, charName?:string, maxContext?:number,
 *          worldInfoSettings?:object}} [opts]
 */
export function installHostStub(opts = {}) {
  const ledger = {
    /** 每一次 setExtensionPrompt 调用（这是「注入是否真落地」的真读面）。 */
    extensionPrompt: [],
    /** 每一次 saveChat / saveChatConditional / saveMetadata* 调用计数。 */
    saves: [],
    /** 每一次按名订阅（type → 次数）。 */
    listeners: {},
    /** 未知宿主 API 的**越权访问**（代理捕获）——「宿主没这个口」不许静默变 undefined。 */
    unknown: [],
  };

  const chat = [];
  let chatSeq = 0;
  const chatMetadata = { file_name: opts.chatId || 'l4_chat_001' };
  const handlers = {};   // type → [fn]
  const injections = [];

  const nextChatId = () => 'l4_chat_' + String(++chatSeq + 1).padStart(3, '0');

  const ctx = {
    name: opts.userName || 'User',
    characterId: 0,
    charName: opts.charName || 'Level4Char',
    chatId: chatMetadata.file_name,
    chat,
    chatMetadata,
    characters: [{ name: opts.charName || 'Level4Char', avatar: 'level4.png' }],
    groups: [],
    groupId: null,
    maxContext: Number(opts.maxContext || 8192),
    injections,
    worldInfoSettings: Object.assign({ world_info_depth: 2, world_info_budget: 25 }, opts.worldInfoSettings || {}),
    extensionSettings: {},
    eventTypes: EVENT_TYPES,
    eventSource: {
      on(type, fn) {
        if (typeof fn !== 'function') return;
        (handlers[type] = handlers[type] || []).push(fn);
        ledger.listeners[type] = (ledger.listeners[type] || 0) + 1;
      },
      off(type, fn) {
        const a = handlers[type];
        if (!a) return;
        const i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      },
      once(type, fn) {
        const wrap = (...args) => { this.off(type, wrap); return fn(...args); };
        this.on(type, wrap);
      },
      emit(type, data) {
        const a = (handlers[type] || []).slice();
        const out = [];
        for (const fn of a) {
          try { out.push(fn(data)); } catch (_e) { out.push(undefined); }
        }
        return out;
      },
    },
    /** 注入落地的唯一通道。ST 的真实签名是 (key, value, position, depth, scan)。 */
    setExtensionPrompt(key, value, position, depth, scan) {
      const rec = { key, value, position, depth, scan, at: injections.length };
      ledger.extensionPrompt.push(rec);
      // 与 ST 语义对齐：同 key 覆盖（ST 内部按 key 存在 Map 里）。
      const i = injections.findIndex((x) => x.key === key);
      if (i >= 0) injections[i] = rec; else injections.push(rec);
      return true;
    },
    updateChatMetadata(patch) {
      Object.assign(chatMetadata, patch || {});
      ledger.saves.push({ kind: 'updateChatMetadata', at: chatMetadata.file_name });
      return true;
    },
    saveMetadataDebounced() { ledger.saves.push({ kind: 'saveMetadataDebounced' }); },
    saveMetadata() { ledger.saves.push({ kind: 'saveMetadata' }); },
    saveChat() { ledger.saves.push({ kind: 'saveChat', floors: chat.length }); },
    saveChatConditional() { ledger.saves.push({ kind: 'saveChatConditional', floors: chat.length }); },
    reloadCurrentChat() { ledger.saves.push({ kind: 'reloadCurrentChat' }); },
    getRequestHeaders() { return {}; },
  };

  /* 越权访问探针：读到桩上不存在的键时**记账**而不是静默 undefined。
   *   为什么必须有：宿主 API 缺失的后果是「功能静默不生效」，而静默正是本仓
   *   反复吃亏的形态（判据在看到 undefined 时应当报红，而不是当假）。 */
  const known = new Set(Object.keys(ctx));
  const probe = new Proxy(ctx, {
    get(t, k) {
      if (typeof k === 'string' && !known.has(k) && !(k in t)) {
        ledger.unknown.push({ at: 'ctx.' + k });
      }
      return t[k];
    },
  });

  const host = { getContext: () => probe, libs: {} };

  const w = typeof window !== 'undefined' ? window : globalThis;
  w.SillyTavern = host;
  // 宿主全局：ST 在 window 上还挂了一部分（部分扩展直接读）。
  w.world_info = w.world_info || { entries: {} };
  w.name1 = ctx.name;

  const emit = (type, data) => {
    try {
      const ev = new CustomEvent('st-' + type, { detail: data });
      (w.document || document).dispatchEvent(ev);
    } catch (_e) { /* CustomEvent 不可用时忽略 */ }
    return ctx.eventSource.emit(type, data);
  };

  return {
    ctx: probe,
    rawCtx: ctx,
    ledger,
    host,
    emit,
    /** 真宿主在扩展装载完成后派发这个事件——世界枢轴的 init 正挂在它上面。 */
    appReady: () => emit(EVENT_TYPES.APP_READY, { chatId: ctx.chatId }),
    addUserFloor: (mes, o) => { chat.push(makeFloor(Object.assign({ mes, isUser: true }, o || {}))); return chat[chat.length - 1]; },
    addCharFloor: (mes, o) => { chat.push(makeFloor(Object.assign({ mes, isUser: false, name: ctx.charName }, o || {}))); return chat[chat.length - 1]; },
    /** 切聊天：ST 的语义是换 chatMetadata.file_name + 派发 CHAT_CHANGED。 */
    switchChat(id) {
      const nid = id || nextChatId();
      chatMetadata.file_name = nid;
      ctx.chatId = nid;
      emit(EVENT_TYPES.CHAT_CHANGED, { chatId: nid });
      return nid;
    },
    /** 末次注入的值（render/inject 落地后的真读面）。 */
    lastInjection(key) {
      const a = ledger.extensionPrompt.filter((x) => !key || x.key === key);
      return a.length ? a[a.length - 1] : null;
    },
    /** 全部注入文本拼接（判据常用：注入块里应当出现/不出现某串）。 */
    injectedText(key) {
      return ledger.extensionPrompt
        .filter((x) => !key || x.key === key)
        .map((x) => String(x.value == null ? '' : x.value))
        .join('\n');
    },
  };
}