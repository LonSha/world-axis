/** WorldAxis render/theater.js (v0.2) — 番外小剧场（缝合 st-theater + titania-theater） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.2.0: 剧场产出观测——此前 generate 的产物只能留在面板里，
  //   wrap() 定义了却零调用，产物到不了正文（功能在输出边界断掉）。
  const __thStat = { generated: 0, failed: 0, wrapped: 0, sent: 0, sendFailed: 0, lastReason: null, lastAt: 0 };

  WA.theater = {
    /** 生成一段番外小剧场（独立、不影响正文） */
    async generate(instruction, opts) {
      opts = opts || {};
      try {
        const cfg = WA.apiRouter.getChannel('inference');
        if (!cfg.baseUrl || !cfg.model) return { ok: false, reason: '推演通道未配置' };
        const s = WA.store.get();
        const people = Object.values(s.people).slice(0, 6).map(p => p.name + '(' + (p.location || '?') + ')').join('、');
        const sys = '你是小剧场编剧。基于指令与世界状态，写一段独立番外（' + (opts.length || '中篇500-800字') + '）。不影响正文正史，轻松/日常/幕后风格均可。可直接输出文本。';
        const user = '【剧场指令】' + (instruction || '生成一段日常番外') + (people ? '\n【可用人物】' + people : '') + (s.clock.label ? '\n【世界时间】' + s.clock.label : '');
        const text = await WA.apiRouter.call('inference', [{ role: 'system', content: sys }, { role: 'user', content: user }], { maxTokens: opts.maxTokens || 2500, temperature: 0.9 });
        __thStat.generated++; __thStat.lastAt = Date.now();
        return { ok: true, text: String(text || '').trim() };
      } catch (e) {
        __thStat.failed++; __thStat.lastReason = 'generate-fail:' + ((e && e.message) || e); __thStat.lastAt = Date.now();
        return { ok: false, error: e };
      }
    },
    /** 把剧场文本渲染为可插入正文的块（作为番外折叠） */
    wrap(title, text) {
      __thStat.wrapped++; __thStat.lastAt = Date.now();
      return '<details class="wa-theater"><summary>🎭 ' + (title || '番外小剧场') + '</summary>\n\n' + text + '\n\n</details>';
    },
    /**
     * v2.2.0: 把剧场产物送进输入框（此前 wrap 零调用 = 产物送不出去，功能死路）。
     *   包装成折叠块 → 写入 ST 输入框 → 派发 input 事件让宿主感知（字数统计/按钮态）。
     *   输入框不可达时明确归因（不静默失败），调用方仍可用返回的 text 自行复制。
     */
    send(text, opts) {
      const o = opts || {};
      const body = String(text == null ? '' : text).trim();
      if (!body) { __thStat.sendFailed++; __thStat.lastReason = 'empty-text'; return { ok: false, reason: 'empty-text' }; }
      const block = this.wrap(o.title, body);
      const doc = (WA.mainDoc || (WA.mainWin && WA.mainWin.document) || (typeof document !== 'undefined' ? document : null));
      let el = null;
      try { el = doc && doc.getElementById ? doc.getElementById('send_textarea') : null; } catch (e) { el = null; }
      if (!el) {
        __thStat.sendFailed++; __thStat.lastReason = 'no-input-el'; __thStat.lastAt = Date.now();
        return { ok: false, reason: 'no-input-el', text: block };
      }
      try {
        el.value = (o.append !== false && el.value ? el.value + '\n' : '') + block;
        // 告知宿主输入框已变（字数统计/发送按钮态依赖该事件）
        try {
          const Win = WA.mainWin || (typeof window !== 'undefined' ? window : null);
          if (Win && typeof Win.Event === 'function') el.dispatchEvent(new Win.Event('input', { bubbles: true }));
          else if (typeof Event === 'function') el.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e2) {}
        __thStat.sent++; __thStat.lastAt = Date.now();
        return { ok: true, text: block, length: block.length };
      } catch (e) {
        __thStat.sendFailed++; __thStat.lastReason = 'write-fail:' + ((e && e.message) || e); __thStat.lastAt = Date.now();
        return { ok: false, reason: 'write-fail', text: block };
      }
    },
    /** v2.2.0: 剧场产出只读观测（面板留痕 + 巡视消费） */
    stat() {
      return { generated: __thStat.generated, failed: __thStat.failed, wrapped: __thStat.wrapped,
        sent: __thStat.sent, sendFailed: __thStat.sendFailed, lastReason: __thStat.lastReason, lastAt: __thStat.lastAt };
    }
  };
})();