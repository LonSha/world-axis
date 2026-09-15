// WorldAxis tests/mock.js — Node环境SillyTavern/localStorage模拟
'use strict';

// localStorage mock
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  _dump: () => ({ ...store })
};

// window/document 最小mock
global.window = global;
global.document = {
  createElement: () => ({ style: {}, classList: { add(){},remove(){},toggle(){} }, addEventListener(){}, setAttribute(){}, appendChild(){}, querySelector: () => null, querySelectorAll: () => [] }),
  getElementById: () => null,
  getElementsByTagName: () => [],
  addEventListener(){},
  head: { appendChild(){} },
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
WA.log = function (level, msg, data) {
  WA.eventLog.push({ t: Date.now(), level, msg, data });
  if (WA.eventLog.length > 300) WA.eventLog.splice(0, WA.eventLog.length - 300);
};
const __listeners = {};
WA.on = (evt, fn) => { (__listeners[evt] = __listeners[evt] || []).push(fn); };
WA.emit = (evt, data) => { (__listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) {} }); };
