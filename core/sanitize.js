/**
 * WorldAxis core/sanitize.js (v2.111.0) — 输入消毒与转义单一真源（计划二 #69）
 *
 * ── 病灶（实测，不是引用）─────────────────────────────────
 *   本仓的面板拼 HTML 字符串，而转义实现不只一处、其中一处是坏的：
 *     · ui/panel.js 的 esc() 映射表里，引号那格把引号映射成了引号自己（恒等映射），
 *       与号与两个尖括号那三格是好的，而这一格让「引号加 onmouseover=」这类载荷原样通过，
 *       故属性上下文里的 esc() 等于没转义。
 *     · 同文件另有两处调用 escapeHtml(...)，而该函数全仓不存在（无定义、无导出、零引用）。
 *       两处都在 failed 大于 0 的真告警路径上：不报错时一切正常，一旦参数非法
 *       （正是最需要那条读数的时候）面板渲染抛 ReferenceError，整个板块沉掉。
 *   这就是本仓反复治的形态：错误路径上的代码从不在正常路径上被跑到。
 *
 * ── 三条设计边界（都是否定式）─────────────────────────────
 *   ① text 不负责安全，html 才负责：text() 只做「非字符串落空串」的归一（它服务的是
 *      textContent 赋值路径，那里本来就没有 HTML 解析）。把 text() 当消毒器用，
 *      会在未来某个 innerHTML 上变成一个沉默的洞。
 *   ② 本模块不做标签过滤、不做白名单。名字取「过一遍就安全」会承诺一件它做不到的事：
 *      传进来的正文本身就允许包含尖括号文本；唯一正确的做法是在落点（写 DOM 的那一刻）
 *      转义。名字不许比能力大。
 *   ③ 恒返回字符串：任何输入（undefined / null / 对象 / Symbol / 循环引用）都得到 string。
 *      「转义函数自己抛」等于把调用方推回「反正会炸就用裸拼」的老路。
 *
 * ── 与既有模块的分工 ───────────────────────────────────
 *   · input-guard / schema 管「这个值能不能进世界」（准入）；本模块管
 *     「这个值能不能进 HTML」（落点）。一个字符串可以同时是合法的世界文本与危险的 HTML。
 *
 * ── 实现口径：不用正则 ────────────────────────────────
 *   转义走码位循环而不是字符类正则。理由不是性能，而是「字符类里放引号」本身
 *   需要三层转义（JS 字符串，正则，宿主），而本仓已经在别处吃过一次「三层转义错一层」
 *   的亏（v2.110.0 的拼接补丁少一个字符）。码位表把「哪些字符要换」写成数字，
 *   于是这份清单可以被门禁逐项核对，也不存在「引号被吃掉」的写法。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const AMP = 38, LT = 60, GT = 62, QUOT = 34, APOS = 39;

  /** 码位到实体（这就是全部规则；不在表里的字符原样输出）。 */
  const ENT = {};
  ENT[AMP] = '&amp;';
  ENT[LT] = '&lt;';
  ENT[GT] = '&gt;';
  ENT[QUOT] = '&quot;';
  ENT[APOS] = '&#39;';

  /** 被转义的码位（升序；门禁按这个数组逐项验证，不看文档）。 */
  const ESCAPED = [APOS, QUOT, AMP, LT, GT].sort(function (a, b) { return a - b; });

  /** 归一：非字符串落空串（null 不是字符串 null；这是本仓 UI 层的既有习惯）。 */
  function text(s) {
    if (s === null || s === undefined) return '';
    if (typeof s === 'string') return s;
    if (typeof s === 'number' || typeof s === 'boolean') return String(s);
    return '';
  }

  /** HTML 转义（含引号）。恒返回 string；从不抛。 */
  function html(s) {
    const t = text(s);
    let out = '';
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      out += (ENT[c] !== undefined) ? ENT[c] : t.charAt(i);
    }
    return out;
  }

  /** 属性值专用：与 html 同一实现（分开导出是为了让调用点的意图可被静态看见）。 */
  function attr(s) { return html(s); }

  /** 这一串是否已经含有需要转义的字符（诊断用；不做幂等改写）。 */
  function needsEscape(s) {
    const t = text(s);
    for (let i = 0; i < t.length; i++) { if (ENT[t.charCodeAt(i)] !== undefined) return true; }
    return false;
  }

  /** 模板：只对 ${n} 插槽转义，模板自身的标签保留。n 只认 0/1/2。 */
  function tpl(template, a, b, c) {
    const t = text(template);
    const vals = [a, b, c];
    const re = /[$][{]([012])[}]/g;
    return t.replace(re, function (m, d) { return html(vals[Number(d)]); });
  }

  WA.sanitize = {
    text: text, html: html, attr: attr, tpl: tpl, needsEscape: needsEscape,
    ESCAPED: ESCAPED.slice(), CODES: { AMP: AMP, LT: LT, GT: GT, QUOT: QUOT, APOS: APOS }
  };
})();