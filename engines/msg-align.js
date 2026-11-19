/**
 * WorldAxis engines/msg-align.js (v2.529.0) — 最终 messages 与结构化消息列表对齐
 *
 * 缝合来源：RedBird-Tools src/core/align.ts（37 行，alignIdentifiers）。
 * 病：宿主（酒馆）的 prompt manager 有一份**带 identifier** 的结构化消息列表，
 *   而真正发出去的是另一份 chat-completion 数组；别的扩展可以往中间插消息，
 *   于是两份**长度不等、位置错开**。没有对齐，任何「这条消息是谁放进来的」都无从谈起。
 * 判据：同长按位对齐；不同长则贪心顺序匹配（只往前看 4 格），匹配不上留 undefined
 *   —— 宁可不认一条，也不许错配（错配会把「来源」判成假读数）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function textOf(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map(function (p) {
        if (typeof p === 'string') return p;
        return (p && typeof p === 'object' && 'text' in p) ? String(p.text == null ? '' : p.text) : '';
      }).join('\n');
    }
    return content == null ? '' : String(content);
  }

  /** 去标签/去宏/去空白/小写：宽松归一化，让「同一段文字被宏或 EJS 改过一点」也能认出来。 */
  function loose(text) {
    return String(text == null ? '' : text)
      .replace(/<[^>]{0,200}>/g, '')
      .replace(/\{\{[^}]{0,200}\}\}/g, '')
      .replace(/[\s\u3000]+/g, '')
      .toLowerCase();
  }

  /**
   * @param {Array} chat 实际发出去的 [{ role, content }]
   * @param {Array} structured 结构化列表 [{ identifier, content }]
   * @returns {Array<string|undefined>} 与 chat 等长
   */
  function align(chat, structured) {
    const a = Array.isArray(chat) ? chat : [];
    const b = Array.isArray(structured) ? structured : [];
    if (b.length === a.length) return b.map(function (s) { return s && s.identifier; });
    const norm = b.map(function (s) { return loose(textOf(s && s.content)).slice(0, 200); });
    const out = [];
    let j = 0;
    for (let i = 0; i < a.length; i++) {
      const target = loose(textOf(a[i] && a[i].content)).slice(0, 200);
      let found = -1;
      const stop = Math.min(norm.length, j + 4);
      for (let k = j; k < stop; k++) {
        if (norm[k] === target
          || (target.length > 20 && (norm[k].indexOf(target.slice(0, 40)) === 0 || target.indexOf(norm[k].slice(0, 40)) === 0))) {
          found = k;
          break;
        }
      }
      if (found >= 0) { out.push(b[found] && b[found].identifier); j = found + 1; }
      else out.push(undefined);   // 不许错配
    }
    return out;
  }

  /** 对齐质量读数：认得几条、几条空、位置是否单调。 */
  function stat(ids, chat) {
    const list = Array.isArray(ids) ? ids : [];
    const total = Array.isArray(chat) ? chat.length : list.length;
    const known = list.filter(function (x) { return typeof x === 'string' && x; }).length;
    return { total: total, known: known, unknown: list.length - known, coverage: total ? +(known / total).toFixed(3) : 0 };
  }

  WA.msgAlign = { align: align, loose: loose, textOf: textOf, stat: stat };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/msg-align.js', { kind: 'engine', ver: '2.529.0' });
})();