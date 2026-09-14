/**
 * WorldAxis core/api-router.js
 * 多通道独立API路由 + 并发限制 + 超时 + 取消
 * 缝合来源：世界背面 api.js/连接方案分流 + SoulLink 并发限制 + WNE 多API分流
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  const LS_KEY = 'worldaxis_api_channels_v1';

  // 通道：推演/摘要/裁判/选项/观测 可分别配置；未配置回落 default
  const CHANNELS = ['default', 'inference', 'digest', 'judge', 'choices', 'observe'];

  function loadCfg() {
    try { return JSON.parse(mainWin.localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveCfg(cfg) { mainWin.localStorage.setItem(LS_KEY, JSON.stringify(cfg)); }

  // 并发限制（默认3，可改）
  let maxConcurrent = 3;
  let running = 0;
  const queue = [];
  function acquire() {
    return new Promise(resolve => {
      if (running < maxConcurrent) { running++; resolve(); }
      else queue.push(resolve);
    });
  }
  function release() {
    running = Math.max(0, running - 1);
    const next = queue.shift();
    if (next) { running++; next(); }
  }

  const router = WA.apiRouter = {
    CHANNELS,

    getChannel(name) {
      const cfg = loadCfg();
      const c = cfg[name] || cfg.default || {};
      return {
        baseUrl: (c.baseUrl || '').replace(/\/+$/, ''),
        apiKey: c.apiKey || '',
        model: c.model || '',
        temperature: c.temperature != null ? c.temperature : 0.8,
        maxTokens: c.maxTokens || 4000,
        useTavernProxy: !!c.useTavernProxy
      };
    },
    setChannel(name, obj) {
      const cfg = loadCfg();
      cfg[name] = Object.assign({}, cfg[name] || {}, obj || {});
      saveCfg(cfg);
    },
    listChannels() { const cfg = loadCfg(); return CHANNELS.map(n => ({ name: n, cfg: cfg[n] || null, effective: this.getChannel(n) })); },
    setConcurrency(n) { maxConcurrent = Math.max(1, Math.min(10, n | 0)); },
    getConcurrency() { return maxConcurrent; },
    queueLength() { return queue.length; },

    /**
     * 调用 OpenAI 兼容 chat/completions
     * @param channel 通道名
     * @param messages [{role,content}]
     * @param opts {temperature,maxTokens,signal,json:bool}
     */
    async call(channel, messages, opts) {
      opts = opts || {};
      const cfg = this.getChannel(channel);
      if (!cfg.baseUrl) throw new Error('通道[' + channel + ']未配置Base URL');
      if (!cfg.model) throw new Error('通道[' + channel + ']未配置模型');

      await acquire();
      const ac = new AbortController();
      const outerSignal = opts.signal;
      if (outerSignal) {
        if (outerSignal.aborted) { release(); throw new DOMException('Aborted', 'AbortError'); }
        outerSignal.addEventListener('abort', () => ac.abort(), { once: true });
      }
      const timeoutMs = opts.timeoutMs || 120000;
      const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);

      try {
        const url = cfg.baseUrl + '/chat/completions';
        const body = {
          model: cfg.model,
          messages,
          temperature: opts.temperature != null ? opts.temperature : cfg.temperature,
          max_tokens: opts.maxTokens || cfg.maxTokens,
          stream: false
        };
        WA.log('info', `API[${channel}] → ${cfg.model} (${messages.length}条消息)`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey },
          body: JSON.stringify(body),
          signal: ac.signal
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          const kind = res.status === 429 ? 'rate-limit' : (res.status === 401 || res.status === 403) ? 'auth' : 'http';
          const err = new Error(`API ${res.status} (${kind}): ` + txt.slice(0, 200));
          err.kind = kind; err.status = res.status;
          throw err;
        }
        const data = await res.json();
        const content = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
        const finish = data.choices && data.choices[0] ? data.choices[0].finish_reason : '';
        if (finish === 'length') { const e = new Error('输出截断(max_tokens)'); e.kind = 'output-limit'; e.partial = content; throw e; }
        if (opts.json) {
          const parsed = router.extractJson(content);
          if (!parsed) { const e = new Error('JSON解析失败'); e.kind = 'invalid-json'; e.raw = content; throw e; }
          return parsed;
        }
        return content;
      } finally {
        clearTimeout(timer);
        release();
      }
    },

    // 确定性JSON提取：去尾逗号、转义裸控制字符；截断不猜测补全
    extractJson(text) {
      if (!text) return null;
      let s = String(text).trim();
      const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) s = fence[1].trim();
      const first = s.search(/[{[]/);
      if (first < 0) return null;
      s = s.slice(first);
      // 找最后一个闭合
      const lastObj = s.lastIndexOf('}'), lastArr = s.lastIndexOf(']');
      const last = Math.max(lastObj, lastArr);
      if (last > 0) s = s.slice(0, last + 1);
      s = s.replace(/,\s*([}\]])/g, '$1'); // 尾逗号
      try { return JSON.parse(s); } catch (e) {}
      // 裸控制字符转义后重试
      try { return JSON.parse(s.replace(/[\u0000-\u001F]+/g, ' ')); } catch (e) { return null; }
    },

    async fetchModels(channel) {
      const cfg = this.getChannel(channel);
      if (!cfg.baseUrl) throw new Error('未配置Base URL');
      const res = await fetch(cfg.baseUrl + '/models', { headers: { 'Authorization': 'Bearer ' + cfg.apiKey } });
      if (!res.ok) throw new Error('拉取模型失败 ' + res.status);
      const data = await res.json();
      return (data.data || []).map(m => m.id).filter(Boolean);
    }
  };
})();
