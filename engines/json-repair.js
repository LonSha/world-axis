/**
 * WorldAxis engines/json-repair.js (v2.529.0) — 脆 JSON 的逐级修复
 *
 * 病：模型吐回来的结构化输出常常只差一点点：```json 围栏没脱、行尾多一个逗号、
 *   键没加引号、注释跟着一起吐出来。全库遇到这种就在 catch 里回一句「解析失败」，
 *   于是那一次结构化输出整体作废 —— 一份**差一个逗号**的输出和一份**胡写的**输出，
 *   在现在的代码里长得一模一样，谁也分不出该重试还是该丢弃。
 *
 * 本模块只做两件事：
 *   ① `parse(text)` —— 先原样 JSON.parse；不行就按阶梯逐级规范化，**每改一步记一条 fix**；
 *   ② `repair(text)` —— 只返回修好的字符串（不解析）。
 *
 * 边界（都是否定式）
 *   1 **先试原样**：合法 JSON 一个字符都不改（fixes 为空）—— 否则「修复」会把
 *      合法的转义序列改坏（比如 `"\\u0041"` 被当成未转义）。
 *   2 剥注释与尾逗号要**认字符串边界**：`{"url":"http://a//b"}` 里的 `//`、
 *      字符串里的逗号都不动（按字符扫描，认得引号与反斜杠转义）。
 *   3 单引号只在**该段确实由单引号包裹**时转；`"it's"` 这种已经是双引号串的不许被拆。
 *   4 修不好就说修不好：返回 `ok:false` 且 `value === undefined`，**不抛** ——
 *      抛出去调用方连原始文本都拿不到，就没法把它登记成「胡写」。
 *   5 纯字符串进出；装载期不读 WA 里任何别的模块（无装载期硬边）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  var VERSION = '2.529.0';

  function copyStr(s, i) {
    var out = s[i], j = i + 1;
    while (j < s.length) {
      var d = s[j];
      if (d === '\\') { out += d + (s[j + 1] === undefined ? '' : s[j + 1]); j += 2; continue; }
      out += d; j++;
      if (d === '"') break;
    }
    return [out, j];
  }

  function stripFence(s) {
    var m = /^\s*```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?```\s*$/.exec(s);
    if (!m) return { text: s, fixed: false };
    return { text: m[1], fixed: true };
  }

  function sliceCore(s) {
    var opens = [];
    var a = s.indexOf('{'), b = s.indexOf('[');
    if (a < 0 && b < 0) return { text: s, fixed: false };
    var start = (a < 0) ? b : (b < 0 ? a : Math.min(a, b));
    var c = s.lastIndexOf('}'), d = s.lastIndexOf(']');
    var end = Math.max(c, d);
    if (end <= start) return { text: s, fixed: false };
    var cut = s.slice(start, end + 1);
    return { text: cut, fixed: cut !== s };
  }

  function stripComments(s) {
    var out = '', i = 0, fixed = false, inStr = false, q = '';
    while (i < s.length) {
      var c = s[i];
      if (inStr) {
        if (c === '\\') { out += c + (s[i + 1] === undefined ? '' : s[i + 1]); i += 2; continue; }
        out += c; if (c === q) inStr = false; i++; continue;
      }
      if (c === '"' || c === "'") { inStr = true; q = c; out += c; i++; continue; }
      if (c === '/' && s[i + 1] === '/') {
        fixed = true;
        while (i < s.length && s[i] !== '\n') i++;
        continue;
      }
      if (c === '/' && s[i + 1] === '*') {
        fixed = true; i += 2;
        while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++;
        i += 2; continue;
      }
      out += c; i++;
    }
    return { text: out, fixed: fixed };
  }

  function dropTrailingCommas(s) {
    var out = '', i = 0, fixed = false, inStr = false, q = '';
    while (i < s.length) {
      var c = s[i];
      if (inStr) {
        if (c === '\\') { out += c + (s[i + 1] === undefined ? '' : s[i + 1]); i += 2; continue; }
        out += c; if (c === q) inStr = false; i++; continue;
      }
      if (c === '"' || c === "'") { inStr = true; q = c; out += c; i++; continue; }
      if (c === ',') {
        var j = i + 1;
        while (j < s.length && /\s/.test(s[j])) j++;
        if (s[j] === '}' || s[j] === ']') { fixed = true; i = j; continue; }
      }
      out += c; i++;
    }
    return { text: out, fixed: fixed };
  }

  function singleToDouble(s) {
    var out = '', i = 0, fixed = false;
    while (i < s.length) {
      var c = s[i];
      if (c === '"') { var r = copyStr(s, i); out += r[0]; i = r[1]; continue; }
      if (c !== "'") { out += c; i++; continue; }
      fixed = true; out += '"'; i++;
      while (i < s.length) {
        var d = s[i];
        if (d === '\\') {
          var e = s[i + 1];
          if (e === "'") { out += "'"; i += 2; continue; }
          out += d + (e === undefined ? '' : e); i += 2; continue;
        }
        if (d === '"') { out += '\\"'; i++; continue; }
        if (d === "'") { out += '"'; i++; break; }
        out += d; i++;
      }
    }
    return { text: out, fixed: fixed };
  }

  function quoteBareKeys(s) {
    var out = '', i = 0, fixed = false;
    while (i < s.length) {
      var c = s[i];
      if (c === '"') { var r = copyStr(s, i); out += r[0]; i = r[1]; continue; }
      if (c !== '{' && c !== ',') { out += c; i++; continue; }
      out += c; i++;
      var j = i, ws = '';
      while (j < s.length && /\s/.test(s[j])) { ws += s[j]; j++; }
      if (j >= s.length || s[j] === '"' || s[j] === '}' || s[j] === ']') { out += ws; i = j; continue; }
      var m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(s.slice(j));
      if (m) {
        var k = j + m[0].length, k2 = k;
        while (k2 < s.length && /\s/.test(s[k2])) k2++;
        if (s[k2] === ':') { out += ws + '"' + m[0] + '"'; fixed = true; i = k; continue; }
      }
      out += ws; i = j;
    }
    return { text: out, fixed: fixed };
  }

  var LADDER = [
    ['去 ``` 围栏', stripFence],
    ['取最外层括号', sliceCore],
    ['去注释', stripComments],
    ['去尾逗号', dropTrailingCommas],
    ['单引号转双引号', singleToDouble],
    ['裸键补引号', quoteBareKeys]
  ];

  function parse(text) {
    var src = (typeof text === 'string') ? text : String(text === null || text === undefined ? '' : text);
    try {
      return { ok: true, value: JSON.parse(src), fixes: [], text: src };
    } catch (e0) { /* 落阶梯 */ }
    var cur = src, fixes = [];
    for (var i = 0; i < LADDER.length; i++) {
      var step = LADDER[i];
      var r = step[1](cur);
      if (r.fixed) { cur = r.text; fixes.push(step[0]); }
      if (fixes.length) {
        try { return { ok: true, value: JSON.parse(cur), fixes: fixes, text: cur }; } catch (e1) { /* 继续 */ }
      }
    }
    return { ok: false, value: undefined, fixes: fixes, text: cur, reason: '修不了：仍不是合法 JSON' };
  }

  function repair(text) {
    var r = parse(text);
    return { ok: r.ok, text: r.text, fixes: r.fixes };
  }

  WA.jsonRepair = { version: VERSION, parse: parse, repair: repair, ladder: LADDER.length };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/json-repair.js', { kind: 'engine', ver: VERSION });
})();
