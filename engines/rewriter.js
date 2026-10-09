/**
 * WorldAxis engines/rewriter.js (v2.129.0) — AI 改写命中内容（缝 A2）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   输出净化（`render/purifier.js`）是**规则净化**：一条 `find` 正则、一段 `replace`，
 *   命中即替换。它能治的只有「规则写得出来的东西」。而实际失效的那一类恰恰写不出规则：
 *     · 「这段抒情太腻」——不是某个词的问题，是整段的密度问题；
 *     · 「这里不该出现第二人称」——逐句看都对，整体看不对；
 *     · 「把这段改得冷一点」——没有任何一个正则会表达「冷」。
 *   本仓到 v2.128.0 为止，对这类内容的唯一手段是**让用户手动改**，
 *   而手动改完的正文不会回到世界结算链路，等于改了个副本。
 *
 *   缝合来源：The-Veridis-Lion / Veridis-Rewrite —— 它把「命中」与「怎么处置这次命中」
 *   分成两件事：规则负责**发现**，AI 通道负责**改写**。原文接通了 API 端口做关键词过滤后的
 *   二次处理；本模块把那一步落成一条独立通道。
 *
 * ── 本模块只做两件事，每件一个硬条件 ─────────────────────────
 *   ① `rewrite(text, {instruction})` —— 走 `apiRouter` 的 **`rewrite` 通道**改写一段文本。
 *      `instruction`（要改成什么样）是**必填**：没有它就只是「随便改改」，
 *      那会把原文改坏而不是改对（本仓拒绝无指令的自由改写）。
 *   ② `stat()` —— 把「改写了几次 / 失败几次 / 为什么失败」摊开。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时**原样返回原文**（`ok:false, reason:'disabled', text:src`），
 *     绝不返回空串 —— 调用方拿到空串会把整条回复写没。
 *   2 任何失败路径都返回 `text: 原文`。**改写失败不静默丢段**（与 purifier 的
 *     空结果守卫同一条纪律：宁可没改，不可改没）。
 *   3 `instruction` 缺失或空 ⇒ `missing-fields`，不发起请求（省一次 API 调用）。
 *   4 通道未配置 ⇒ `apiRouter.call` 自己抛 `not-configured`，本模块归因为 `api-fail`，
 *     不改写、不重试、不回落别的通道（回落会让「改写」悄悄变成「推演」）。
 *   5 模型返回空 ⇒ `empty-response`，同样返回原文（空回复按失败处理，不写进正文）。
 *   6 不做长度阈值判断：本模块不替用户决定「多长该改」（那是调用方的策略，不是引擎的）。
 *   7 不碰世界状态：本模块不写 store、不进存档，是对**文本**的一次加工，不是一次结算。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_rewriter_settings_v1';
  const CHANNEL = 'rewrite';
  const DEF = { enabled: false, temperature: 40, maxTokens: 1200, timeoutMs: 30000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'rewriter',
    bounds: { temperature: [0, 100], maxTokens: [128, 8000], timeoutMs: [5000, 120000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { runs: 0, changed: 0, unchanged: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 300) : String(v == null ? '' : v).slice(0, max || 300); }

  /**
   * 改写一段文本。
   * @param text 待改写正文（纯文本）
   * @param opts {instruction} 要改成什么样（必填）
   * @returns {ok, text, before?, reason?, detail?} —— **text 恒为可直接使用的正文**：
   *          成功是改写结果，任何失败都是原文（绝不空串）。
   */
  async function rewrite(text, opts) {
    const o = opts || {};
    const src = (typeof text === 'string') ? text : '';
    if (!src) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', text: '' }; }
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', text: src }; }
    const instruction = clean(o.instruction, 300);
    if (!instruction) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: 'instruction 必填', text: src }; }
    if (!WA.apiRouter || typeof WA.apiRouter.call !== 'function') { noteFault('no-channel'); return { ok: false, reason: 'no-channel', text: src }; }
    const cfg = settings();
    let out = '';
    try {
      out = await WA.apiRouter.call(CHANNEL, [
        { role: 'system', content: '你是文本改写器。只输出改写后的正文本身：不要解释、不要前言、不要后记、不要代码块。' },
        { role: 'user', content: '改写要求：' + instruction + '\n\n--- 待改写正文 ---\n' + src }
      ], { temperature: cfg.temperature / 100, maxTokens: cfg.maxTokens, timeoutMs: cfg.timeoutMs });
    } catch (e) {
      noteFault('api-fail');
      return { ok: false, reason: 'api-fail', detail: (e && e.message) || '', text: src };
    }
    stat.runs++;
    const next = (typeof out === 'string') ? out.trim() : '';
    if (!next) { noteFault('empty-response'); return { ok: false, reason: 'empty-response', text: src }; }
    if (next === src) { stat.unchanged++; stat.lastReason = 'unchanged'; return { ok: true, unchanged: true, text: src, before: src }; }
    stat.changed++; stat.lastReason = 'changed';
    return { ok: true, text: next, before: src };
  }

  WA.rewriter = {
    CHANNEL: CHANNEL,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    rewrite: rewrite,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/rewriter.js', { kind: 'engine', ver: '2.129.0' });
})();
