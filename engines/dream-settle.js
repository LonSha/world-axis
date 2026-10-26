/**
 * WorldAxis engines/dream-settle.js (v2.251.0) — 梦境结算的空稿闸与去现实标记
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   本仓已有 `engines/dream.js`，但它管的是「梦里的线怎么织、梦卷怎么封存」——
 *   七条白名单操作、卷上限、偏离登记。**一整个模块里没有一个字判断「这条梦是不是空的」。**
 *   现场实测：`空梦` / `不是现实` / `复述关键词` 在 engines 全库零命中。
 *
 *   两个后果都很具体：
 *   ① **空梦照样入卷**：模型把「意象围绕着雨与旧屋浮动」这种只罗列标签的模板句交上来，
 *      80 字的正文配上 200 字的卷内摘要配额（dream.js 边界 9：卷内只存摘要），
 *      等于一卷全是空话；
 *   ② **梦被当成现实写**：梦的正文进注入块后，模型下一轮就把它当既成事实推进
 *      （「你昨天去找过他了」）。现仓没有任何标记说「这是梦」。
 *
 * ── 机制（两道闸 + 一句标记）────────────────────────────────────
 *   `screen(text, opt)`：
 *     · 过短（有效字数 < `minChars`）⇒ `too-short`；
 *     · 命中复述模板（`TEMPLATE_PAT` + 调用方给的 `extraPatterns`）⇒ `template-only`；
 *     · 通过 ⇒ `ok:true`，并给出 `retryHint`（这是给调用方决定要不要重掷，不是自动重试：
 *       重试要重跑一次模型，那一步在注入链之外）。
 *   `stamp(text)` 给注入块补「这是梦不是现实事件」的定性句，且**幂等**（已带标记不重复贴）。
 *   `isStamped(text)` 供下游判。
 *
 * ── 缝合来源与许可 ──────────────────────────────────────────────
 *   来源：zyy0463/dreams `dreams.js:117-183`——`EMPTY_DREAM_RE`（`围绕…浮动|意象围绕`）
 *   + 正文 ≥80 字才收 + 失败原地重试两次 + `contextBlock` 附「这是梦不是现实事件」
 *   并只取 18 小时内最近 2 条。许可允许搬代码，此处重写为宿主无关纯函数并
 *   把阈值/复述正则参数化（原文写死 80 与单条正则）。
 *
 * ── 边界（全是否定式）──────────────────────────────────────────
 *   ① 总开关默认关闭。关闭时 `screen()` 一律 `ok:true` 但 `skipped:true`，
 *      不静默按「合格」算（调用方要能看出没筛过）。
 *   ② **不调模型、不重试**：只回答「这条能不能收」，重掷由调用方做。
 *   ③ 有效字数走 `wordBudget.count`（剥标签、中英分记）——**不在本模块另算一套**，
 *      否则同一段正文在两处会有两个字数。
 *   ④ 复述模板只判**整段性质**（首句复述 + 总长短），不判「写得不够好」：
 *      判不了的留在预设。
 *   ⑤ 非字符串入参拒收 `bad-type`，不当空串（那会让所有调用点都变 too-short）。
 *   ⑥ `stamp` 幂等且**不改正文语序**，只在尾部补一句；已带标记原样返回。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_dreamsettle_settings_v1';
  const DEF = { enabled: false, minChars: 80, stampMark: '（这是睡着时做的梦，不是现实事件。）' };
  const __REG = { key: LS_KEY, def: DEF, module: 'dreamSettle', bounds: { minChars: [10, 2000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { screened: 0, tooShort: 0, templateOnly: 0, passed: 0, stamped: 0, badType: 0 };
  const TEMPLATE_PAT = /(?:意象[\s\S]{0,12})?(?:围绕|环绕)[\s\S]{0,60}浮动/;
  function effLen(text) {
    if (WA.wordBudget && typeof WA.wordBudget.count === 'function') {
      const c = WA.wordBudget.count(text);
      // word-budget 的字段是 chars / cjk / words / total —— 不是 zh / latin。
      //   踩过：初版读 c.zh + c.latin，两个都恒 undefined ⇒ 字数恒 0 ⇒
      //   任何正文都被判 too-short，而门禁因为「码跑得出来」全绿（空转的活样本）。
      if (c && typeof c === 'object') {
        if (Number.isFinite(Number(c.total))) return Number(c.total);
        if (Number.isFinite(Number(c.chars))) return Number(c.chars);
      }
      if (Number.isFinite(Number(c))) return Number(c);
    }
    return String(text).replace(/\s+/g, '').length;
  }
  function screen(text, opt) {
    const cfg = settings();
    if (typeof text !== 'string') { stat.badType++; return { ok: false, reason: 'bad-type' }; }
    if (!cfg.enabled) return { ok: true, skipped: true, chars: effLen(text) };
    stat.screened++;
    const o = opt || {};
    const floor = Number.isFinite(Number(o.minChars)) && Number(o.minChars) > 0 ? Number(o.minChars) : cfg.minChars;
    const chars = effLen(text);
    if (chars < floor) {
      stat.tooShort++;
      return { ok: false, reason: 'too-short', chars: chars, floor: floor, retryHint: '正文不足 ' + floor + ' 字（实 ' + chars + '），重掷一次' };
    }
    const body = text.trim();
    const pats = Array.isArray(o.extraPatterns) ? o.extraPatterns.filter(function (x) { return x instanceof RegExp; }) : [];
    if (TEMPLATE_PAT.test(body) && chars < floor * 2.5) {
      stat.templateOnly++;
      return { ok: false, reason: 'template-only', chars: chars, retryHint: '首段只是复述关键词，没有展开，重掷一次' };
    }
    for (let i = 0; i < pats.length; i++) {
      if (pats[i].test(body)) { stat.templateOnly++; return { ok: false, reason: 'template-only', chars: chars, retryHint: '命中自定义复述模板 ' + pats[i] }; }
    }
    stat.passed++;
    return { ok: true, chars: chars };
  }
  function isStamped(text) {
    const mark = settings().stampMark;
    return typeof text === 'string' && !!mark && text.indexOf(mark) >= 0;
  }
  function stamp(text) {
    if (typeof text !== 'string') return { ok: false, reason: 'bad-type' };
    if (isStamped(text)) return { ok: true, already: true, text: text };
    const mark = settings().stampMark;
    if (!mark) return { ok: false, reason: 'no-mark' };
    stat.stamped++;
    return { ok: true, already: false, text: text.replace(/\s+$/, '') + '\n' + mark };
  }
  function statOf() { return Object.assign({}, stat); }
  WA.dreamSettle = { screen: screen, stamp: stamp, isStamped: isStamped, settings: settings, saveSettings: saveSettings, stat: statOf, REG: __REG, DEF: DEF };
})();
