/**
 * WorldAxis engines/ephemeral-scrub.js (v2.251.0) — 注入块的历史洗除（阅后即焚）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   `one-shot-mod.js` 做到了「只这一轮」的**发**与**销**（`dose` / `buildBlock` / `consume`），
 *   但它销的是**自己那份队列**，销不掉已经进了聊天历史的那段文本。
 *   现仓对「历史里的注入要不要洗」全库零处理——`ephemeral` / `阅后即焚` / `洗除` 零命中。
 *
 *   后果是一条被反复验证的退化链（源头作者写得比这更早）：注入留在历史里，下一轮被原样
 *   喂回，几轮之后 ①同一段记忆/规则逐轮堆积成噪声；②模型把「上一轮的提示」当成
 *   「一直有效的设定」；③上下文被旧注入撑大。**本仓的 one-shot-mod 只治了①②的一半，
 *   因为它的队列一清空，历史里那一段还在。**
 *
 * ── 机制（按原文删，删完记账）────────────────────────────────────
 *   `register(text, opt)` 把「本轮拼进去的注入原文」登记进短期台账（有容量上限、去重）；
 *   `scrub(historyText)` 在历史落盘之后把这些原文从文本里删掉，返回
 *   `{ ok, text, removed, missing, overMatch }`。
 *   两条判据让「洗过了」不等于「洗对了」：
 *     · `missing`：登记了但历史里找不到 ⇒ 没洗掉，如实报（不装作洗过）；
 *     · `overMatch`：同一段原文在历史里出现多于一次 ⇒ 有误删风险，照删但报数。
 *   删完顺手规整空白（连续 3+ 换行压成 2、去行尾空白）。
 *
 * ── 缝合来源与许可 ──────────────────────────────────────────────
 *   来源：ceshihaox-dotcom/pilulier `docs/burn-after-reading.md`。原文是**文档**（参考实现
 *   未随仓发布），核心做法一句话：「注入块照常拼进本轮；这一轮结束后，从持久化的会话历史
 *   里按原文把这些块删掉」。许可允许搬；此处按宿主重写为纯文本函数，并把它自陈的两个
 *   边界（原文重叠会误删、空白会被改动）**升级成机器可读的读数**（`overMatch` / `whitespaceChanged`）。
 *
 * ── 边界（全是否定式）──────────────────────────────────────────
 *   ① 总开关默认关闭。关闭时 `scrub()` 原样返回并标 `skipped`（不静默当洗完）。
 *   ② **只删登记过的原文**，不按正则猜（正则猜必然误伤正文）。
 *   ③ 台账有硬上限 `maxEntries`，满了挤最旧并记 `evicted`——**不用 LRU 伪装成「都记得」**。
 *   ④ 空原文不登记（否则 `indexOf('')===0` 会命中每处）。
 *   ⑤ `scrub` **幂等**：洗过的文本再洗一次 `removed` 为 0（不会越洗越短）。
 *   ⑥ 本模块不碰 store：台账在内存（它天生是短期的，跨会话无意义）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_ephemeralscrub_settings_v1';
  const DEF = { enabled: false, maxEntries: 24, minLen: 6, tidyBlanks: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'ephemeralScrub', bounds: { maxEntries: [4, 128], minLen: [1, 200] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { registered: 0, scrubs: 0, removedTotal: 0, missingTotal: 0, overMatchTotal: 0, evicted: 0, badType: 0 };
  let ledger = [];
  function register(text, opt) {
    const cfg = settings();
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t) return { ok: false, reason: 'empty' };
    if (t.length < cfg.minLen) return { ok: false, reason: 'too-small', len: t.length };
    const tag = opt && opt.tag ? String(opt.tag).slice(0, 40) : '';
    if (ledger.some(function (x) { return x.text === t; })) return { ok: true, already: true };
    ledger.push({ text: t, tag: tag });
    stat.registered++;
    while (ledger.length > cfg.maxEntries) { ledger.shift(); stat.evicted++; }
    return { ok: true, already: false, size: ledger.length };
  }
  function tidy(s) {
    return s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
  }
  function scrub(historyText) {
    const cfg = settings();
    if (typeof historyText !== 'string') { stat.badType++; return { ok: false, reason: 'bad-type' }; }
    if (!cfg.enabled) return { ok: true, skipped: true, text: historyText, removed: 0, missing: 0, overMatch: 0 };
    stat.scrubs++;
    let out = historyText;
    let removed = 0;
    let missing = 0;
    let overMatch = 0;
    ledger.forEach(function (row) {
      const parts = out.split(row.text);
      const hits = parts.length - 1;
      if (hits <= 0) { missing++; return; }
      if (hits > 1) overMatch += hits - 1;
      out = parts.join('');
      removed++;
    });
    const before = out;
    if (cfg.tidyBlanks) out = tidy(out);
    out = out.replace(/^\n+/, '').replace(/\n+$/, '');
    stat.removedTotal += removed;
    stat.missingTotal += missing;
    stat.overMatchTotal += overMatch;
    return { ok: true, text: out, removed: removed, missing: missing, overMatch: overMatch, whitespaceChanged: before !== out };
  }
  function clear() { const n = ledger.length; ledger = []; return { ok: true, cleared: n }; }
  function view() { return { enabled: settings().enabled, size: ledger.length, tags: ledger.map(function (x) { return x.tag || '(untagged)'; }) }; }
  function statOf() { return Object.assign({}, stat); }
  WA.ephemeralScrub = { register: register, scrub: scrub, clear: clear, view: view, settings: settings, saveSettings: saveSettings, stat: statOf, REG: __REG, DEF: DEF };
})();
