/**
 * WorldAxis engines/stream-gate.js (v2.529.0) — 流式标签闸门（流中剥离）
 *
 * 缝合来源：nekotools core/streamgate.js（98 行）+ core/hooks.js 的 SSE 改造（138-250 行）。
 *
 * 病：本仓的输出净化是**流后**的——core/interceptor.js 在 MESSAGE_RECEIVED 之后改 mes，
 *   为此养了两块补丁：`__purifiedRaw` 原文快照 + 世界推进期间「临时还原 / 再恢复」
 *   （因为推进必须读原文、显示必须是净化文本）。
 *   流式闸门的形态不同：标签在**流里就被吞掉**，原文留在 `captured` 里交给引擎，
 *   显示面从头到尾没出现过标签 ⇒ 不需要那两块来回还原的补丁，用户也看不到标签闪一下。
 *
 * 边界（全是否定式）：
 *   1 本模块**不装 fetch hook**（劫持全局 fetch 属 interceptor 的职责面，单独一层要单独评估）；
 *   2 不做标签内容解释（`ws_status` 之类怎么渲染由宿主决定）；
 *   3 未闭合标签超长时必须**安全释放**（把缓存原样吐出去），不许无声吞掉用户内容。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /**
   * @param {string[]} tags 要吞掉的标签名（不含尖括号）
   * @param {{maxHold?:number, render?:function}} opts
   *   maxHold：单块未闭合缓存的字符上限（默认 35000），超过即安全释放
   *   render：标签闭合时把内容转成替代文本（默认返回空串 = 纯吞掉）
   */
  function create(tags, opts) {
    const list = Array.isArray(tags) ? tags.slice() : [];
    const o = opts || {};
    const maxHold = Number(o.maxHold) || 35000;
    const render = (typeof o.render === 'function') ? o.render : function () { return ''; };
    const maxTagLen = list.reduce(function (m, t) { return Math.max(m, String(t).length); }, 0) + 2;
    const st = { buf: '', hold: null, holdLen: 0, captured: Object.create(null), released: 0, escaped: 0 };

    function feed(chunk) {
      st.buf += String(chunk == null ? '' : chunk);
      let out = '';
      for (;;) {
        if (st.hold) {
          const closer = '</' + st.hold + '>';
          const idx = st.buf.indexOf(closer);
          if (idx === -1) {
            // 还没闭合：把「可能是半个 closer」的尾巴留下，其余进缓存
            const keep = Math.min(st.buf.length, closer.length - 1);
            const take = st.buf.slice(0, st.buf.length - keep);
            st.captured[st.hold] = (st.captured[st.hold] || '') + take;
            st.holdLen += take.length;
            st.buf = st.buf.slice(st.buf.length - keep);
            if (st.holdLen > maxHold) {
              // 安全释放：把开标签 + 已缓存内容 + 剩余缓冲原样吐出去，绝不静默吞掉
              out += '<' + st.hold + '>' + (st.captured[st.hold] || '') + st.buf;
              delete st.captured[st.hold];
              st.buf = ''; st.hold = null; st.holdLen = 0;
              st.released++;
              continue;
            }
            return out;
          }
          st.captured[st.hold] = (st.captured[st.hold] || '') + st.buf.slice(0, idx);
          st.buf = st.buf.slice(idx + closer.length);
          const body = st.captured[st.hold];
          const replaced = render(st.hold, body);
          if (replaced) out += replaced;
          st.hold = null; st.holdLen = 0;
          continue;
        }
        let best = -1, hit = null;
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          const at = st.buf.indexOf('<' + t + '>');
          if (at !== -1 && (best === -1 || at < best)) { best = at; hit = t; }
        }
        if (best === -1) {
          if (!list.length) { out += st.buf; st.buf = ''; return out; }
          // 留下可能是半个开标签的尾巴
          const keep = Math.min(st.buf.length, maxTagLen);
          out += st.buf.slice(0, st.buf.length - keep);
          st.buf = st.buf.slice(st.buf.length - keep);
          return out;
        }
        out += st.buf.slice(0, best);
        st.buf = st.buf.slice(best + hit.length + 2);
        st.hold = hit;
        st.holdLen = 0;
      }
    }

    function flush() {
      if (st.hold) {
        const body = (st.captured[st.hold] || '') + st.buf;
        const replaced = render(st.hold, body);
        st.buf = ''; st.hold = null; st.holdLen = 0;
        st.escaped++;
        return replaced || '';
      }
      const rest = st.buf;
      st.buf = '';
      return rest;
    }

    function stat() {
      return {
        holding: st.hold, held: st.holdLen, buf: st.buf.length,
        capturedKeys: Object.keys(st.captured), released: st.released, escaped: st.escaped,
        tags: list.slice(), maxHold: maxHold
      };
    }

    return { feed: feed, flush: flush, stat: stat, captured: st.captured };
  }

  /**
   * 处理一行 SSE（OpenAI choices[0].delta.content / Gemini candidates[0].content.parts[].text）。
   * 返回改写后的整行；不懂的格式原样返回（绝不把不认识的行吃掉）。
   */
  function sseLine(line, gate) {
    const src = String(line == null ? '' : line);
    if (src.indexOf('data:') !== 0) return src;
    // 没有闸门 ⇒ 只解析不改写：返回原行。**不许崩** —— 崩在流式回调里会把整条流截断，
    // 而「闸门忘了传」这种接线错误必须表现为「标签没被剥离」，不能表现为「回复中断」。
    if (!gate || typeof gate.feed !== 'function') return src;
    const payload = src.slice(5).trim();
    if (!payload) return src;
    if (payload === '[DONE]') {
      const tail = gate.flush();
      if (!tail) return src;
      return 'data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: tail } }] }) + '\n\ndata: [DONE]';
    }
    let obj;
    try { obj = JSON.parse(payload); } catch (e) { return src; }
    let changed = false;
    const ch = obj && obj.choices && obj.choices[0];
    if (ch && ch.delta && typeof ch.delta.content === 'string') {
      const c = gate.feed(ch.delta.content);
      if (c !== ch.delta.content) { ch.delta.content = c; changed = true; }
    }
    if (ch && ch.message && typeof ch.message.content === 'string') {
      const c = gate.feed(ch.message.content);
      if (c !== ch.message.content) { ch.message.content = c; changed = true; }
    }
    const parts = obj && obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts;
    if (Array.isArray(parts)) {
      parts.forEach(function (p) {
        if (p && typeof p.text === 'string') {
          const c = gate.feed(p.text);
          if (c !== p.text) { p.text = c; changed = true; }
        }
      });
    }
    return changed ? 'data: ' + JSON.stringify(obj) : src;
  }

  WA.streamGate = { create: create, sseLine: sseLine };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/stream-gate.js', { kind: 'engine', ver: '2.529.0' });
})();