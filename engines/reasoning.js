/**
 * WorldAxis engines/reasoning.js (v2.130.0) — 思考开销与正文保底（缝 A4）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   推理模型（reasoning_effort / thinking）把预算花在**思考**上，而思考不计入
 *   正文。本仓的预算面（`engines/inject-budget.js`）只管**注入多少**，
 *   `maxTokens` 也只是一个上限——没有任何一处管「够不够留给正文」。
 *   于是用户看到的是「模型想了一大堆、正文区域是空的」，而全库无一处告警。
 *
 *   缝合来源：SoulLink v1.7.4 —— 原文口径是「思考预算单列，正文产出不足即重发，
 *   不允许一次空正文直接落地」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `directive()` —— 把「本轮该不该展开思考 / 思考到什么程度」写成一段给模型的约束；
 *   ② `buildBlock()` —— 把段约束送进注入链（受总开关与源开关两个闸）；
 *   ③ `checkBody(text)` —— 在正文落地**之前**问「这段够不够」，答 `empty-text` /
 *      `shortfall` / `null`（放行）。
 *
 *   ③ 是**闸门**不是**重试器**：本模块不替你重发请求，只回答「这段该不该落地」。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `directive()` 与 `buildBlock()` 都返回空串
 *      （零 token 占用），`checkBody` 一律放行（不因关开关而把正文丢掉）。
 *   2 `checkBody` 只数长度，**不评质量** —— 「短」不等于「差」，
 *      但「空」一定是没写完（两个阈值分开，不合并成一个）。
 *   3 判据阈值来自设置（`minBodyChars`），不写在函数里：不同的卡正文长度天然不同。
 *   4 非字符串入参一律拒收（`bad-type`），不把它当作空串（把 undefined 当空串
 *      会让所有调用点都变成“正文为空”）。
 *   5 本模块**不调 API**：思考开销的配置是设置面的事，重发是调用方的事。
 *   6 不写 store、不进存档：它产出的是**一段约束文本**，不是世界状态。
 *   7 不与 `inject-budget` 重复：那个算「注入多少 token」，本模块只答
 *      「正文该长什么样」。两块预算分开记，不合成一个数。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_reasoning_settings_v1';
  const EFFORTS = ['off', 'low', 'medium', 'high'];
  const DEF = { enabled: false, effort: 'low', minBodyChars: 120 };
  const __REG = { key: LS_KEY, def: DEF, module: 'reasoning', bounds: { minBodyChars: [0, 4000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
    if (EFFORTS.indexOf(merged.effort) < 0) merged.effort = DEF.effort;
    return merged;
  }
  function saveSettings(next) {
    const merged = Object.assign(settings(), next || {});
    if (EFFORTS.indexOf(merged.effort) < 0) delete merged.effort;
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { directives: 0, checks: 0, short: 0, empty: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  const LINE = {
    off:    '本轮**不要展开任何思考过程**，直接写出正文。',
    low:    '本轮思考从简：不必列推理步骤，只在心里过一遍就落笔。',
    medium: '本轮可以想，但思考长度不得超过正文的一半，全部结论必须写进正文。',
    high:   '本轮允许充分思考，但正文必须完整成篇——思考再长也不能占用正文的位置。'
  };

  /** 把「本轮思考该多克制」写成一段约束文本（关闭时返回空串）。 */
  function directive() {
    const cfg = settings();
    if (!cfg.enabled) { stat.blocked++; stat.lastReason = 'disabled'; return ''; }
    stat.directives++;
    stat.lastReason = 'issued';
    return '[思考开销] ' + (LINE[cfg.effort] || LINE.low)
      + ' 正文不得为空，也不得只有一句转场：写了多少思考就欠了多少正文。';
  }

  function buildBlock() { return directive(); }

  /**
   * 正文落地前的长度闸门。返回 `null` = 放行；非 null = 拒收体。
   * @param {string} text 模型产出的正文
   */
  function checkBody(text) {
    stat.checks++;
    if (text === undefined || text === null) { noteFault('empty-text'); stat.empty++; return { ok: false, reason: 'empty-text', detail: '正文缺失（很可能是思考吃光了预算）' }; }
    if (typeof text !== 'string') { noteFault('bad-type'); return { ok: false, reason: 'bad-type' }; }
    const cfg = settings();
    if (!cfg.enabled) return null;
    const body = text.replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!body) { stat.empty++; stat.lastReason = 'empty-text'; return { ok: false, reason: 'empty-text', detail: '正文剥去标签后为空', raw: text.length }; }
    if (body.length < cfg.minBodyChars) {
      stat.short++; stat.lastReason = 'shortfall';
      return { ok: false, reason: 'shortfall', chars: body.length, need: cfg.minBodyChars,
        detail: '正文只有 ' + body.length + ' 字（阈值 ' + cfg.minBodyChars + '）——建议重发一轮，不要直接落地' };
    }
    return null;
  }

  WA.reasoning = {
    EFFORTS: EFFORTS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    directive: directive, buildBlock: buildBlock, checkBody: checkBody,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/reasoning.js', { kind: 'engine', ver: '2.130.0' });
})();
