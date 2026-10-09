/**
 * WorldAxis engines/polish.js (v2.130.0) — 输入润色（缝 D4）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   用户的输入往往只是几个词（“去码头看看”），而模型需要的是**可演的场景**。
 *   本仓的输入侧只有一个 `inputGuard`（做**约束**：长度、类型、白名单），
 *   零处能做**润色**：把一句话展开成三种不同走向的开局，用户再挑一个发出去。
 *   用户目前的做法是自己反复手打。
 *
 *   缝合来源：choice —— 原文口径是「把用户输入改写为多个版本供选，选中后才进主链」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `variants(text, opts)` —— 走 `apiRouter` 的 `rewrite` 通道把原文改成 N 个版本；
 *   ② `pick(list, i)` —— 从结果里取第 i 个（越界如实报 `not-found`，不默默取第一个）；
 *   ③ `stat()` —— 记几个数（请求几次、产出几版）。
 *
 *   ① 的结果**不进任何主链**：本模块不改世界状态、不写存档，产出的只是候选文本，
 *   由调用方（用户点的那个按钮）决定要不要拿去当输入。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时**原样返回原文**作为可选内容（`ok:false, reason:'disabled'`），
 *      绝不返回空数组——空数组会让用户的输入消失。
 *   2 任何失败路径都返回原文：润色失败不静默丢输入（同 rewriter 的纪律：
 *      宁可没润，不可润没）。
 *   3 `count` 是**有限的**（2–5，默认 3）：给一堆版反而选不了；越界夹回，
 *      并如实报 `clamped:true`（静默夹取会让面板显示与实际不符）。
 *   4 只走 `rewrite` 通道，**不回落别的通道**：回落会让“润色”悄悄变成“推演正文”。
 *   5 解析按**分隔标记**上行行拆；模型没给足 N 版就**如实报实际版数**
 *      （不复制原文凑数）。
 *   6 空文本/非字符串入参一律拒收（`empty-text` / `bad-type`）。
 *   7 不写 store、不进 `SOURCES`、不产 `buildBlock`：它管的是**用户输入**，
 *      不是“本轮该让模型看到的世界状态”。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_polish_settings_v1';
  const CHANNEL = 'rewrite';
  const DEF = { enabled: false, count: 3, temperature: 70, maxTokens: 800, timeoutMs: 30000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'polish',
    bounds: { count: [2, 5], temperature: [0, 100], maxTokens: [128, 4000], timeoutMs: [5000, 120000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { runs: 0, produced: 0, failed: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  const SPLIT = /^\s*(?:[-*•]|\d+[.、)）]|【?\u7248?\u672c\s*\d+】?)\s*/;
  function split(text, want) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const lines = raw.split(/\n+/);
    const out = [];
    let buf = [];
    lines.forEach(function (l) {
      if (SPLIT.test(l) && buf.length) { out.push(buf.join('\n').trim()); buf = []; }
      buf.push(l.replace(SPLIT, '').trim());
    });
    if (buf.length) out.push(buf.join('\n').trim());
    const clean = out.filter(function (s) { return s; });
    return clean.length ? clean.slice(0, want) : [];
  }

  /**
   * 把用户输入润色成多版。
   * @param {string} text 用户原始输入
   * @param {{count?:number, instruction?:string}} [opts]
   * @returns {ok, variants:[], original, count, clamped?}
   */
  async function variants(text, opts) {
    const o = opts || {};
    const src = (typeof text === 'string') ? text : '';
    if (!src.trim()) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', variants: [], original: src }; }
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', variants: [src], original: src, disabled: true }; }
    let want = Number(o.count);
    let clamped = false;
    if (!isFinite(want)) want = cfg.count;
    if (want < 2) { want = 2; clamped = true; }
    if (want > 5) { want = 5; clamped = true; }
    if (!WA.apiRouter || typeof WA.apiRouter.call !== 'function') { noteFault('no-channel'); return { ok: false, reason: 'no-channel', variants: [src], original: src }; }
    const extra = (typeof o.instruction === 'string' && o.instruction) ? ('\n额外要求：' + o.instruction) : '';
    let out = '';
    try {
      out = await WA.apiRouter.call(CHANNEL, [
        { role: 'system', content: '你是叙事输入润色器。把用户的一句话展开成可直接发出的剧情开场。每一版独占一行，以「1. 」开头编号，不要解释、不要前后语、不要代码块。' },
        { role: 'user', content: '写 ' + want + ' 个不同走向的版本。' + extra + '\n\n--- 用户输入 ---\n' + src }
      ], { temperature: cfg.temperature / 100, maxTokens: cfg.maxTokens, timeoutMs: cfg.timeoutMs });
    } catch (e) {
      noteFault('api-fail'); stat.failed++;
      return { ok: false, reason: 'api-fail', detail: (e && e.message) || '', variants: [src], original: src };
    }
    stat.runs++;
    const list = split(out, want);
    if (!list.length) { noteFault('empty-response'); stat.failed++; return { ok: false, reason: 'empty-response', variants: [src], original: src }; }
    stat.produced += list.length; stat.lastReason = 'produced';
    return { ok: true, variants: list, original: src, count: list.length, asked: want, clamped: clamped };
  }

  /** 取第 i 版（1 起）。越界如实报 not-found，不默默取第一版。 */
  function pick(list, i) {
    if (!Array.isArray(list)) { noteFault('bad-type'); return { ok: false, reason: 'bad-type' }; }
    const n = Number(i);
    if (!isFinite(n) || n < 1 || n > list.length) { noteFault('not-found'); return { ok: false, reason: 'not-found', size: list.length, want: i }; }
    return { ok: true, index: n, text: String(list[n - 1]) };
  }

  WA.polish = {
    CHANNEL: CHANNEL,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    variants: variants, pick: pick, split: split,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/polish.js', { kind: 'engine', ver: '2.130.0' });
})();
