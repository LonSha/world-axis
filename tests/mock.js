// WorldAxis tests/mock.js — Node环境SillyTavern/localStorage模拟
'use strict';

// localStorage mock
// v0.1.51: 对齐浏览器标准枚举 API（length/key()）+ 键级 mtime 观测（storageStat 衰减判定测试用）
const store = {};
const storeMtime = {};   // key -> last setItem 时间戳
const KEY_ORDER = [];    // 插入顺序（模拟浏览器枚举序）
function ls_touch(k) {
  if (!(k in store)) KEY_ORDER.push(k);
  storeMtime[k] = Date.now();
}
global.localStorage = {
  get length() { return KEY_ORDER.filter(k => (k in store)).length; },
  key: i => KEY_ORDER.filter(k => (k in store))[i] || null,
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { ls_touch(k); store[k] = String(v); },
  removeItem: k => { delete store[k]; delete storeMtime[k]; },
  clear: () => { Object.keys(store).forEach(k => { delete store[k]; delete storeMtime[k]; }); KEY_ORDER.length = 0; },
  _dump: () => ({ ...store }),
  _mtimes: () => ({ ...storeMtime }),
  _setMtime: (k, t) => { if (k in store) storeMtime[k] = t; }
};

// window/document 最小mock
global.window = global;
global.__scriptEls = [];
global.__headScripts = [];
global.__headScriptsHolder = { name: '__head__' };
global.document = {
  createElement: (tag) => {
    if (tag === 'script') {
      const el = { tagName: 'SCRIPT', src: null, onload: null, onerror: null, parentNode: null,
        style: {}, classList: { add(){},remove(){},toggle(){} }, addEventListener(){}, setAttribute(){},
        appendChild(){}, querySelector: () => null, querySelectorAll: () => [] };
      Object.defineProperty(el, '__fired', { value: false, writable: true, enumerable: false });
      global.__scriptEls.push(el);
      return el;
    }
    return { style: {}, classList: { add(){},remove(){},toggle(){} }, addEventListener(){}, setAttribute(){}, appendChild(){}, querySelector: () => null, querySelectorAll: () => [] };
  },
  getElementById: () => null,
  getElementsByTagName: () => [],
  addEventListener(){},
  head: { appendChild(el){ if (el && el.tagName==='SCRIPT') { global.__headScripts.push(el); el.parentNode = global.__headScriptsHolder; } } },
  body: { appendChild(){} },
  readyState: 'complete'
};

// 聊天数据（测试可改）
const mockChat = [
  { is_user: true, mes: '我走进酒馆，四下张望。', swipe_id: 0 },
  { is_user: false, name: '旁白', mes: '酒保抬起头，烛火摇曳。角落里有个蒙面人正盯着你。', swipe_id: 0 },
  { is_user: true, mes: '我走向那个蒙面人。', swipe_id: 0 },
  { is_user: false, name: '旁白', mes: '蒙面人压低声音：「你不该来这里。」窗外突然传来马蹄声。', swipe_id: 0 }
];

// SillyTavern context mock
const eventHandlers = {};
const mockChatMetadata = {}; // 跨 getContext 调用持久（chatcache 依赖真实持久化）
const mockCtx = {};
global.SillyTavern = {
  getContext: () => mockCtx,
};
Object.assign(mockCtx, {
  chat: mockChat,
  chatId: 'test_chat_001',
  chatMetadata: mockChatMetadata,
  updateChatMetadata: (patch) => { Object.assign(mockChatMetadata, patch); },
  saveMetadataDebounced: () => {},
  eventSource: {
    on: (evt, fn) => { (eventHandlers[evt] = eventHandlers[evt] || []).push(fn); },
    emit: async (evt, ...args) => { for (const fn of (eventHandlers[evt] || [])) await fn(...args); }
  },
  eventTypes: { APP_READY: 'app_ready', GENERATION_ENDED: 'gen_ended', MESSAGE_RECEIVED: 'msg_recv', CHAT_CHANGED: 'chat_changed' },
  setExtensionPrompt: (key, text, pos, depth, scan) => {
    if (!global.__extPromptLog) global.__extPromptLog = [];
    const rec = { key: key, text: text, pos: pos, depth: depth, scan: scan };
    global.__extPromptLog.push(rec);
    global.__lastExtensionPrompt = rec;
  }
});
global.__triggerEvent = async (evt, ...args) => { for (const fn of (eventHandlers[evt] || [])) await fn(...args); };
global.__mockChat = mockChat;

// TavernHelper mock for wb-inject
const __vars = {};
const __wbEntries = {};
global.TavernHelper = {
  getVariables: function (o) { return Object.assign({}, __vars); },
  replaceVariables: function (all, o) { Object.keys(all).forEach(function (k) { __vars[k] = all[k]; }); return true; },
  insertOrAssignVariables: function (patch, o) { Object.keys(patch).forEach(function (k) { __vars[k] = patch[k]; }); return true; },
  deleteVariable: function (path, o) { delete __vars[path]; return true; },
  getWorldbook: async function (name) { return __wbEntries[name] || []; },
  createWorldbookEntries: async function (name, entries) { (__wbEntries[name] = __wbEntries[name] || []).push.apply(__wbEntries[name], entries); return entries; }
};
global.__vars = __vars;
global.__wbEntries = __wbEntries;

// fetch mock（由测试注入响应）
global.__fetchResponses = [];
global.fetch = async (url, opts) => {
  const next = global.__fetchResponses.shift();
  if (!next) return { ok: true, status: 200, json: async () => ({ data: [] }), text: async () => '' };
  return {
    ok: next.ok !== false,
    status: next.status || 200,
    json: async () => next.body,
    text: async () => JSON.stringify(next.body)
  };
};
global.__pushApiJson = (content, opts) => {
  global.__fetchResponses.push({
    body: {
      choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) }, finish_reason: 'stop' }],
      ...(opts || {})
    }
  });
};

module.exports = { mockChat, eventHandlers };

// ── WorldAxis命名空间最小基建（index.js职责，测试环境复刻）──
const WA = global.WorldAxis = global.WorldAxis || {};
WA.version = 'test';
WA.mainWin = global;
WA.mainDoc = global.document;
WA.modules = {};
WA.eventLog = [];
WA.errorLog = [];   // v0.1.53: 与 index.js 对齐的 error 子环
const MOCK_ERROR_LOG_MAX = 50;
let __mockLogTimer = null;      // v0.2.1: 与 index.js 对齐的防抖落盘
let __mockLogChat = null;
const MOCK_LOG_DEBOUNCE_MS = 500;
function persistMockLog(chatId) {
  try {
    const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
    global.localStorage.setItem('worldaxis_event_log_' + cid, JSON.stringify(WA.eventLog.slice(-300)));
    global.localStorage.setItem('worldaxis_error_log_' + cid, JSON.stringify(WA.errorLog.slice(-MOCK_ERROR_LOG_MAX)));
  } catch (e) {}
}
function scheduleMockLogSave(immediate) {
  if (immediate) {
    const target = __mockLogChat || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
    if (__mockLogTimer) { clearTimeout(__mockLogTimer); __mockLogTimer = null; }
    persistMockLog(target); __mockLogChat = null;
    return;
  }
  if (!__mockLogChat) __mockLogChat = (WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default';
  if (__mockLogTimer) return;
  __mockLogTimer = setTimeout(function () {
    const target = __mockLogChat; __mockLogTimer = null; __mockLogChat = null;
    persistMockLog(target);
  }, MOCK_LOG_DEBOUNCE_MS);
}
WA.flushLog = function () {
  if (!__mockLogTimer) return;   // v0.2.1: 无挂起写入 = 全部已落盘，不得动磁盘（防覆盖）
  clearTimeout(__mockLogTimer); __mockLogTimer = null;
  const target = __mockLogChat || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
  __mockLogChat = null;
  persistMockLog(target);
};
WA.log = function (level, msg, data) {
  const entry = { t: Date.now(), level, msg, data };
  WA.eventLog.push(entry);
  if (WA.eventLog.length > 300) WA.eventLog.splice(0, WA.eventLog.length - 300);
  if (level === 'error') {
    WA.errorLog.push(entry);
    if (WA.errorLog.length > MOCK_ERROR_LOG_MAX) WA.errorLog.splice(0, WA.errorLog.length - MOCK_ERROR_LOG_MAX);
  }
  scheduleMockLogSave(level === 'error');   // v0.2.1: error 立即落盘；info/warn 走防抖窗口
};
WA.loadEventLog = function (chatId) {
  try {
    WA.flushLog();
    const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
    const raw = global.localStorage.getItem('worldaxis_event_log_' + cid);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) WA.eventLog = arr.slice(-300);
    } else {
      WA.eventLog = [];
    }
    const rawErr = global.localStorage.getItem('worldaxis_error_log_' + cid);
    if (rawErr) {
      const arrErr = JSON.parse(rawErr);
      if (Array.isArray(arrErr)) WA.errorLog = arrErr.slice(-MOCK_ERROR_LOG_MAX);
    } else {
      WA.errorLog = [];
    }
  } catch (e) {}
};
WA.clearEventLog = function (chatId) {
  WA.eventLog = [];
  WA.errorLog = [];
  // v0.2.1: 取消挂起的防抖写入，防止已清空日志被定时器复活写回
  if (__mockLogTimer) { clearTimeout(__mockLogTimer); __mockLogTimer = null; }
  __mockLogChat = null;
  try {
    const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
    global.localStorage.removeItem('worldaxis_event_log_' + cid);
    global.localStorage.removeItem('worldaxis_error_log_' + cid);
  } catch (e) {}
};
const __listeners = {};
WA.on = (evt, fn) => { (__listeners[evt] = __listeners[evt] || []).push(fn); };
WA.emit = (evt, data) => { (__listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) {} }); };
