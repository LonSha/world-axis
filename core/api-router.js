/**
 * WorldAxis core/api-router.js
 * 多通道独立API路由 + 并发限制 + 超时 + 取消
 * 缝合来源：世界背面 api.js/连接方案分流 + SoulLink 并发限制 + WNE 多API分流
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_api_channels_v1';

  // 通道：推演/摘要/裁判/选项/观测 可分别配置；未配置回落 default
  const CHANNELS = ['default', 'inference', 'digest', 'judge', 'choices', 'observe'];
  // v0.1.41: 通道配置变更计量（tool-diag 消费）
  const __cfgStat = { changes: 0, baseUrlChanges: 0, lastAt: 0, lastChannel: null };

  const __REG = { key: LS_KEY, def: {}, module: 'apiRouter' };
  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）——通道配置损坏此前静默全回落
  //   默认通道，用户填的 baseUrl/apiKey/model 无声丢失（且看不出是配置丢了还是没配）
  function loadCfg() { return WA.settingsBus.read(__REG); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function saveCfg(cfg) { WA.settingsBus.save(__REG, cfg); }

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

  // v0.1.27: 通道调用台账——成功/失败按归因分类计数 + 耗时（排查「推演为什么没跑」）
  const callLedger = new Map(); // channel -> {count, ok, errors, byKind, lastAt, lastMs, lastError, totalMs}
  function recCall(channel, ms, err) {
    try {
      const key = channel || 'default';
      const st = callLedger.get(key) || { count: 0, ok: 0, errors: 0, byKind: {}, lastAt: 0, lastMs: 0, totalMs: 0, lastError: null };
      st.count++; st.totalMs += ms; st.lastMs = ms; st.lastAt = clockWall();
      if (err) {
        st.errors++;
        const kind = (err && err.kind) || (String((err && err.message) || err).match(/timeout|abort/i) ? 'timeout' : 'unknown');
        st.byKind[kind] = (st.byKind[kind] || 0) + 1;
        st.lastError = String((err && err.message) || err).slice(0, 180);
      } else { st.ok++; }
      callLedger.set(key, st);
    } catch (e) { /* 台账失败不影响调用 */ }
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
      const prev = cfg[name] || null;
      // v2.6.0: 写入白名单——此前 `Object.assign({}, cfg[name] || {}, obj || {})` 原样接受任意额外字段，
      //   于是「通道配置」里会长出 getChannel() 根本不读的子键（实测：getChannel 只消费
      //   baseUrl / apiKey / model / temperature / maxTokens / useTavernProxy 六项）。
      //   这类死子键与 v2.5.0 修的老存档死键是同一现象的两个来源——迁移只治**存量**，
      //   每次保存都会把新塞进来的字段写回磁盘并永远留下。收敛口径：只保留被读取的字段，
      //   被丢弃的字段名进日志（不静默：用户/调用方若真需要新字段，应同步改 getChannel）。
      const ALLOWED = ['baseUrl', 'apiKey', 'model', 'temperature', 'maxTokens', 'useTavernProxy'];
      const picked = {};
      const dropped = [];
      Object.keys(obj || {}).forEach(function (k) { if (ALLOWED.indexOf(k) >= 0) picked[k] = obj[k]; else dropped.push(k); });
      if (dropped.length && WA.log) WA.log('warn', 'apiRouter: 通道[' + name + '] 丢弃未消费字段 ' + dropped.join('/') + '（getChannel 不读这些键）');
      cfg[name] = Object.assign({}, cfg[name] || {}, picked);
      saveCfg(cfg);
      // v0.1.41: 配置变更计量 + 总线广播（热切换可观测；payload 不含 apiKey）
      __cfgStat.changes++; __cfgStat.lastAt = clockWall(); __cfgStat.lastChannel = name;
      if (!prev || !prev.baseUrl || prev.baseUrl !== cfg[name].baseUrl) __cfgStat.baseUrlChanges++;
      if (WA.emit) try { WA.emit('api:channel-changed', { channel: name, fields: Object.keys(obj || {}), hadPrevious: !!prev }); } catch (e) {}
    },
    listChannels() { const cfg = loadCfg(); return CHANNELS.map(n => ({ name: n, cfg: cfg[n] || null, effective: this.getChannel(n) })); },
    /** v0.1.41: 配置变更计量只读视图 */
    cfgStat() { return { changes: __cfgStat.changes, baseUrlChanges: __cfgStat.baseUrlChanges, lastAt: __cfgStat.lastAt, lastChannel: __cfgStat.lastChannel }; },
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
      const t0 = clockWall();
      try {
        return await this._callInner(channel, messages, opts, t0);
      } catch (e) {
        // v0.1.27: 配置类失败（未配置 BaseURL/模型）也要入账
        if (!e || !e.__ledgered) recCall(channel, clockWall() - t0, e);
        throw e;
      }
    },
    async _callInner(channel, messages, opts, t0Call) {
      const cfg = this.getChannel(channel);
      if (!cfg.baseUrl) { const e = new Error('通道[' + channel + ']未配置Base URL'); e.kind = 'not-configured'; throw e; }
      if (!cfg.model) { const e = new Error('通道[' + channel + ']未配置模型'); e.kind = 'not-configured'; throw e; }

      await acquire();
      const ac = new AbortController();
      const outerSignal = opts.signal;
      if (outerSignal) {
        if (outerSignal.aborted) { release(); throw new DOMException('Aborted', 'AbortError'); }
        outerSignal.addEventListener('abort', () => ac.abort(), { once: true });
      }
      const timeoutMs = opts.timeoutMs || 120000;
      const timer = setTimeout(() => ac.abort(new Error('timeout')), timeoutMs);
      const t0 = clockWall();
      let callErr = null;
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
      } catch (e) {
        callErr = e;
        e.__ledgered = true;   // v0.1.27: 内层已入账，外层包装不重复计
        throw e;
      } finally {
        clearTimeout(timer);
        release();
        recCall(channel, clockWall() - t0, callErr);
      }
    },
    /** v0.1.27: 通道调用台账只读视图（tool-diag 消费） */
    callStats(topN) {
      const rows = [];
      callLedger.forEach(function (st, ch) {
        const kinds = Object.keys(st.byKind).map(function (k) { return k + ':' + st.byKind[k]; }).join('/');
        rows.push({ channel: ch, count: st.count, ok: st.ok, errors: st.errors, errorKinds: kinds || null, lastMs: st.lastMs, avgMs: Math.round(st.totalMs / Math.max(1, st.count)), lastAt: st.lastAt, lastError: st.lastError });
      });
      rows.sort(function (a, b) { return b.errors - a.errors || b.lastAt - a.lastAt; });
      const n = topN && topN > 0 ? topN : 8;
      return { channels: rows.slice(0, n), tracked: rows.length };
    },
    resetCallStats() { callLedger.clear(); },

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
