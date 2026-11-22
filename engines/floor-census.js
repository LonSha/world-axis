/**
 * WorldAxis engines/floor-census.js (v2.529.0) — 未发楼层普查（该发却没发的才是问题）
 *
 * 缝合来源：RedBird-Tools src/core/budget.ts（32 行，带 budget.test.ts）。
 *
 * 病：本仓做「提示词里到底带了哪些楼层」的读数时，只看**发了什么**。
 *   但真出问题时是反过来的：某楼明明该发、却不在请求里 —— 而这个信息**只能从缺口算**。
 *   更麻烦的是隐藏楼层（酒馆本来就不发，楼层上有幽灵图标）：把它算进「漏发」，
 *   读数就会天天报警，最后没人再看这条读数。
 *
 * 判据：
 *   ① 分界点 = 这次发出去的最小楼号；一楼都没发就用调用方给的 before（正在生成的那一楼 / 聊天长度）；
 *   ② 分界点之前的楼：隐藏着的归 hidden，没隐藏的归 other —— **第 0 楼（开场白）不进 other**，
 *      有的预设本来就不发开场白；
 *   ③ 一律用楼号（0 基），不吞不改；输出文本只写前三段并加「等」，避免一条读数上千字。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function toInts(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (let i = 0; i < list.length; i++) {
      const v = Number(list[i]);
      if (isFinite(v) && v >= 0) out.push(Math.floor(v));
    }
    return out;
  }

  /** 缺口普查。返回 {hidden, other, end}；end 是分界点（这个楼号之前的都算「该发」）。 */
  function unsentFloors(sent, hidden, before) {
    const s = toInts(sent);
    const h = {};
    const hl = toInts(hidden);
    for (let i = 0; i < hl.length; i++) h[hl[i]] = 1;
    let end;
    if (s.length) {
      end = s[0];
      for (let i = 1; i < s.length; i++) if (s[i] < end) end = s[i];
    } else {
      const b = Number(before);
      end = isFinite(b) && b > 0 ? Math.floor(b) : 0;
    }
    const out = { hidden: [], other: [] };
    for (let i = 0; i < end; i++) {
      if (h[i]) out.hidden.push(i);
      else if (i > 0) out.other.push(i);
    }
    out.end = end;
    return out;
  }

  /** [1,2,3,5,8,9] → 「第 1–3、5、8–9 楼」；段数超过 maxSeg 只写前几段并加「等」。 */
  function floorsText(floors, maxSeg) {
    const f = toInts(floors).slice().sort(function (a, b) { return a - b; });
    const cap = isFinite(maxSeg) && maxSeg > 0 ? Math.floor(maxSeg) : 3;
    const parts = [];
    for (let i = 0; i < f.length;) {
      let j = i;
      while (j + 1 < f.length && f[j + 1] === f[j] + 1) j++;
      parts.push(i === j ? String(f[i]) : (f[i] + '–' + f[j]));
      i = j + 1;
    }
    if (!parts.length) return '第 0 楼';
    return '第 ' + parts.slice(0, cap).join('、') + ' 楼' + (parts.length > cap ? '等' : '');
  }

  /** 一条可读的普查结论（给读数/面板直接用）。 */
  function brief(sent, hidden, before) {
    const r = unsentFloors(sent, hidden, before);
    const leaked = r.other;
    return {
      end: r.end,
      hidden: r.hidden.length,
      leaked: leaked.length,
      text: leaked.length
        ? floorsText(leaked) + ' 没隐藏却没发（要先查原因）'
        : ('第 ' + r.end + ' 楼之前没有漏发' + (r.hidden.length ? '（隐藏 ' + r.hidden.length + ' 楼，本来就不发）' : ''))
    };
  }

  WA.floorCensus = {
    unsentFloors: unsentFloors,
    floorsText: floorsText,
    brief: brief
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/floor-census.js', { kind: 'engine', ver: '2.529.0' });
})();