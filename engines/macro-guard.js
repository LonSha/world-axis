/**
 * WorldAxis engines/macro-guard.js (v2.529.0) — 副作用宏守卫
 *
 * 缝合来源：RedBird-Tools src/core/macros.ts（7 行，SIDE_EFFECT_MACRO）。
 * 病：本仓现在**完全不处理** {{宏}}（全仓 `{{ setvar` / `substituteParams` 零命中），
 *   所以还没有这个病；但只要开始做「请求预览 / 提示词归因 / 重放」，就必须先立这道守卫：
 *   酒馆发请求时宏已经执行过一次，预览侧再替换一遍 = **执行第二次**
 *   （{{setvar}}=变量被改两次且写进聊天文件，{{random}}/{{roll}}=每次结果不同，读数就不成立）。
 * 判据：带副作用的宏，整段**不替换、原样保留**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // 会改东西或每次结果不同的宏：set/inc/dec/add(var|globalvar)、random/roll/pick
  const SIDE_EFFECT = /\{\{\s*(?:set|inc|dec|add)(?:global)?var\b|\{\{\s*(?:random|roll|pick)\b/i;

  function hasSideEffect(text) { return SIDE_EFFECT.test(String(text == null ? '' : text)); }

  /** 把文本里所有的 {{...}} 宏名抓出来（只报名字，不报值——值可能是变量内容）。 */
  function macros(text) {
    const out = [];
    const re = /\{\{\s*([A-Za-z_][\w.-]*)/g;
    const s = String(text == null ? '' : text);
    let m;
    while ((m = re.exec(s)) !== null) if (out.indexOf(m[1]) < 0) out.push(m[1]);
    return out;
  }

  /** 分类：这条文本里的宏哪些有副作用（有的整段不许替换）。 */
  function audit(text) {
    const names = macros(text);
    return {
      text: String(text == null ? '' : text),
      macroNames: names,
      sideEffect: hasSideEffect(text),
      substitutes: names.filter(function (n) {
        return !SIDE_EFFECT.test('{{' + n);
      }),
      keepsRaw: names.filter(function (n) { return SIDE_EFFECT.test('{{' + n); })
    };
  }

  /**
   * 安全替换：有副作用的段**整段跳过**，其余交给调用方的 subst 函数。
   * 分段而不是整条放弃：一条提示词里既有 {{random}} 又有 {{char}} 时，只冻结前者。
   */
  function safeSubstitute(text, subst) {
    const s = String(text == null ? '' : text);
    if (typeof subst !== 'function') return s;
    return s.replace(/\{\{[\s\S]{0,200}?\}\}/g, function (whole) {
      if (SIDE_EFFECT.test(whole)) return whole;   // 冻结：原样保留
      try { return String(subst(whole)); } catch (e) { return whole; }
    });
  }

  WA.macroGuard = { SIDE_EFFECT: SIDE_EFFECT, hasSideEffect: hasSideEffect, macros: macros, audit: audit, safeSubstitute: safeSubstitute };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/macro-guard.js', { kind: 'engine', ver: '2.529.0' });
})();