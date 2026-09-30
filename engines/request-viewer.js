/**
 * WorldAxis engines/request-viewer.js (v2.129.0) — 请求报文预览器（缝 A9）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓有六个副 API 通道（`core/api-router.js` 的 CHANNELS），有通道调用台账
 *   （`callStats`：次数/耗时/错误分类），但**没有一处能回答「刚才到底发出去的是什么」**。
 *   `call` 把 `messages` 数组组装完成后直接交给 `fetch`，那串 JSON 一出进程就没了：
 *   出了「模型为什么不听话」，用户只能靠猜——猜系统指令写错了、猜世界书没注进去、
 *   猜破限被截断了，而三件都能用一眼看报文证伪。全仓 `requestView` / `报文预览` 零命中。
 *
 *   缝合来源：st-direct-event 的「提示词查看器 (Prompt Viewer)」——
 *   原文口径：「支持**离线预览**发往副 API 的全套请求报文（系统指令、破限、规则、
 *   世界书条目、上下文），支持按角色**分块折叠**与**全文搜索**」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `preview(channel, messages, opts)` —— 把「若现在发，会发什么」组出来（**不发**）；
 *   ② `capture(...)` / `list()` / `get(i)` / `text()` —— 最近若干份报文的环（供比对）；
 *   ③ `stat()` —— 记几个数（预览几次、落账几次、拒收几次）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **绝不发请求**：本模块一次都不调 `apiRouter.call` / `fetch`。它是「看」的出口，
 *      不是「发」的出口。复用 `apiRouter.getChannel` 只是为了**如实报出**模型与温度——
 *      连通道配置都不改（只读）。
 *   2 **apiKey 默认打码**（`sk-…abcd`）：报文的用途是给人看结构，不是给第三方看密钥。
 *      要真值必须显式 `{maskKey:false}`，且**打码是默认值**——默认值错了，泄露就是默认发生的。
 *      打码对象是报文本身，不是通道配置；`preview` 返回的头部里**从不含真 apiKey**。
 *   3 `messages` 必须是 `[{role, content}]` 形态的**副本**：本模块不持有调用方的数组引用
 *      （否则调用方下一轮往数组里 push，上一份「已捕获报文」会跟着变——那是伪造证据）。
 *   4 逐条消息按角色拆块（对齐 r06「按角色分块折叠」）：每块给 `role` / `chars` / `lines`
 *      / `head`（前 80 字）。全文另置 `text`，**不做截断**（预览截断过就没法查「是不是漏了
 *      某段规则」这个本模块唯一要答的问题）。
 *   5 报文只存**内存环**（上限 `maxKeep`），**不写世界状态、不写盘**：
 *      「刚才发了什么」是会话内的诊断事实，不是世界事实。写进 store 会污染存档，
 *      写进 localStorage 会把密钥副本留在磁盘上（见边界 2）。故本模块无 evict 站点、
 *      无 store 骨架键、无 `__BOUNDED_CAPS` 登记。
 *   6 开关默认关闭：关闭时 `capture` 报 `disabled`（**只读面不受限**——
 *      `preview` / `list` / `get` / `text` 照常可用：用户关掉开关不该连「看一眼」都被锁死）。
 *   7 空报文如实拒收（`empty-text`）；非数组 / 畸形消息条目整条跳过（不静默补 `''`）。
 *   8 `channel` 必须是 `apiRouter.CHANNELS` 里的具名通道（`bad-channel`）：
 *      自由字符串会让「这是哪个通道的报文」无从对账。
 *   9 **不进注入面**：报文预览不是「本轮该让模型看到的世界状态」——
 *      它的消费者是面板与用户，故本模块不产 `buildBlock`、不在 `SOURCES` 里占位。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_requestviewer_settings_v1';
  const DEF = { enabled: false, maxKeep: 8, maskKey: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'requestViewer', bounds: { maxKeep: [1, 32] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { previews: 0, captures: 0, drops: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 200) : String(v == null ? '' : v).slice(0, max || 200); }

  function channels() {
    const c = (WA.apiRouter && Array.isArray(WA.apiRouter.CHANNELS)) ? WA.apiRouter.CHANNELS : [];
    return c.slice();
  }
  function isChannel(name) { return channels().indexOf(name) >= 0; }

  /** 密钥打码：只留头 3 尾 4（`sk-…abcd`）；太短的整串变星号——短串露头尾等于全露。 */
  function maskKey(k) {
    const s = String(k == null ? '' : k);
    if (!s) return '';
    if (s.length <= 8) return '••••••••';
    return s.slice(0, 3) + '…' + s.slice(-4);
  }
  /** 描述一次调用的**头**（模型/温度/上限/端点），不含密钥真值。 */
  function headOf(channel, opts) {
    const o = opts || {};
    let cfg = {};
    try { cfg = (WA.apiRouter && typeof WA.apiRouter.getChannel === 'function') ? (WA.apiRouter.getChannel(channel) || {}) : {}; } catch (e) { cfg = {}; }
    const masked = !!settings().maskKey;
    return {
      channel: channel,
      baseUrl: cfg.baseUrl ? String(cfg.baseUrl).replace(/\/+$/, '') : '',
      model: cfg.model || '',
      apiKey: masked ? maskKey(cfg.apiKey) : String(cfg.apiKey || ''),
      masked: masked,
      temperature: o.temperature != null ? o.temperature : (cfg.temperature != null ? cfg.temperature : null),
      maxTokens: o.maxTokens != null ? o.maxTokens : (cfg.maxTokens != null ? cfg.maxTokens : null),
      json: !!o.json
    };
  }

  /** 逐条拆块（对齐 r06「按角色分块折叠」）：**不截断正文**，只额外给摘要量。 */
  function blocksOf(messages) {
    if (!Array.isArray(messages)) return [];
    const out = [];
    messages.forEach(function (m) {
      if (!m || typeof m !== 'object') return;                       // 畸形条目整条跳过，不补空串
      const role = clean(m.role, 24) || 'unknown';
      const raw = (m.content == null) ? '' : String(m.content);
      const head = raw.slice(0, 80);
      out.push({ role: role, chars: raw.length, lines: raw ? raw.split('\n').length : 0,
        head: head, content: raw });
    });
    return out;
  }
  function bodyOf(blocks) {
    return blocks.map(function (b) { return '<' + b.role + '>\n' + b.content; }).join('\n\n');
  }

  /**
   * 纯只读：把「若现在用 channel 发 messages，会发出去什么」组出来。**不发、不落账**。
   * 只读面**不读开关**（边界 6）。
   */
  function preview(channel, messages, opts) {
    const ch = clean(channel, 24);
    if (!ch) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: 'channel 必填' }; }
    if (!isChannel(ch)) { noteFault('bad-channel'); return { ok: false, reason: 'bad-channel', channel: ch, known: channels() }; }
    const blocks = blocksOf(messages);
    if (!blocks.length) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', channel: ch, detail: '报文为空' }; }
    const text = bodyOf(blocks);
    if (!text.trim()) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', channel: ch }; }
    stat.previews++;
    return { ok: true, head: headOf(ch, opts), blocks: blocks, text: text,
      chars: text.length, count: blocks.length };
  }

  /** 冻结成一份可留存快照（**深拷贝**：不持调用方数组引用，见边界 3）。 */
  function freeze(pv) {
    return { at: clockNow('requestViewer'), head: Object.assign({}, pv.head),
      blocks: pv.blocks.map(function (b) { return Object.assign({}, b); }),
      text: pv.text, chars: pv.chars, count: pv.count };
  }

  // 内存环（不写盘、不写 store）：`maxKeep` 截断在 capture 里手动做（不走 evict —— 无站点）。
  let ring = [];
  function capture(channel, messages, opts) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const pv = preview(channel, messages, opts);
    if (!pv.ok) return pv;
    const rec = freeze(pv);
    ring.push(rec);
    const cap = settings().maxKeep;
    while (ring.length > cap) { ring.shift(); stat.drops++; }
    stat.captures++; stat.lastReason = 'captured';
    return { ok: true, index: ring.length - 1, total: ring.length, at: rec.at, chars: rec.chars };
  }

  function list() {
    return ring.map(function (r, i) {
      return { index: i, at: r.at, channel: r.head.channel, model: r.head.model,
        count: r.count, chars: r.chars, firstRole: r.blocks.length ? r.blocks[0].role : null };
    });
  }
  function get(i) {
    const n = Number(i);
    if (!isFinite(n) || n < 0 || n >= ring.length) { noteFault('not-found'); return { ok: false, reason: 'not-found', index: i, total: ring.length }; }
    const r = ring[n | 0];
    return { ok: true, index: n | 0, at: r.at, head: Object.assign({}, r.head),
      blocks: r.blocks.map(function (b) { return Object.assign({}, b); }), text: r.text, chars: r.chars };
  }
  /** 全文（把环里每份报文接起来）——「全文搜索」面只需这一串。 */
  function text(i) {
    if (i === undefined || i === null || i === '') return ring.map(function (r) { return r.text; }).join('\n\n---\n\n');
    const g = get(i);
    return g.ok ? g.text : '';
  }
  function clear() { const n = ring.length; ring = []; return { ok: true, dropped: n }; }

  WA.requestViewer = {
    CHANNELS: function () { return channels(); },
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    preview: preview, capture: capture, list: list, get: get, text: text, clear: clear,
    size: function () { return ring.length; },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/request-viewer.js', { kind: 'engine', ver: '2.129.0' });
})();
