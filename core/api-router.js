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
        // v2.129.0（A9）：请求报文落账。此前“刚才到底发出去的是什么”全库答不出——
        //   报文一出进程就没了。这里在 **fetch 之前** 捕获一份（capture 自身带总开关，
        //   默认关闭时零开销、不落账）；预览器故障绝不能拖垓真调用 ⇒ try/catch 收住。
        try { if (WA.requestViewer && typeof WA.requestViewer.capture === 'function') WA.requestViewer.capture(channel, messages); } catch (e) { /* 预览器故障不阻断调用 */ }
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
        // v2.517.0（OPV26-2）：响应回执喂账。此前 data.model 与 data.usage 在这里被直接丢弃，
        //   「响应侧实际回了哪个模型 / 花了多少 token / 多快」全库答不出（V26 主计划既有事实②③）。
        //   与上方 requestViewer.capture 同纪律：观测面故障绝不拖垮真调用 ⇒ try/catch 收住。
        //   喂账点在 finish_reason 判定**之前**：即使随后抛 output-limit，这笔回执也已经入账。
        try {
          const __respModel = data && data.model ? String(data.model) : '';
          const __usage = data && data.usage ? data.usage : null;
          const __ms = clockWall() - t0;
          if (WA.modelReceipt && typeof WA.modelReceipt.record === 'function') {
            WA.modelReceipt.record({ channel, reqModel: cfg.model, respModel: __respModel, ms: __ms, usage: __usage, finish: (data.choices && data.choices[0] && data.choices[0].finish_reason) || '' });
          }
          if (WA.tokenBudget && typeof WA.tokenBudget.observe === 'function' && __usage) {
            WA.tokenBudget.observe({ channel, model: __respModel || cfg.model, ms: __ms, promptTokens: __usage.prompt_tokens, completionTokens: __usage.completion_tokens });
          }
        } catch (e) { /* 观测面故障不阻断调用 */ }
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

    // 确定性JSON修复阶梯（v2.410.0，机制重写）：
    //   出处声明——「候选阶梯 + 分阶段确定性修复」的机制思想缝合自 TavernOS HUD
    //   （github.com/alewwi/HUD，AGPL-3.0）hud-parser.js 的 JSON 修复函数族；
    //   本实现为独立重写：函数名、结构与表达式均未复制上游逐字代码，
    //   许可与出处登记见 docs/attribution.md。纪律沿本仓旧约：只做确定性修复、
    //   不猜测补全语义；全部修复为 O(n) 单趟扫描（HUD 记录过按冒号扫全尾 O(n²) 旧路的教训）。
    //   语义变化面：旧版两试全部保留（阶梯第 1 候选与第 9 候选逐字等价旧版两试），
    //   新增候选只会「多救回」原本解析失败的输入，不会改变原本成功输入的返回值。
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

      // 字符串态感知扫描：标出每个位置是否处于 "…" 字面量内、扫描到 EOF 时字符串是否仍开着
      const stringMap = function (src) {
        const inStr = new Array(src.length);
        let inString = false, esc = false;
        for (let i = 0; i < src.length; i++) {
          const code = src.charCodeAt(i);
          if (inString) {
            inStr[i] = true;
            if (esc) esc = false;
            else if (code === 0x5C) esc = true;       // 反斜杠
            else if (code === 0x22) inString = false; // 引号
          } else {
            inStr[i] = false;
            if (code === 0x22) { inString = true; inStr[i] = true; }
          }
        }
        return { inStr: inStr, open: inString, escTail: esc };
      };
      // 修复①：字符串字面量内的裸控制字符转义为合法转义序列（比旧版「整段换空格」更保真）
      const repairCtrl = function (src) {
        const m = stringMap(src);
        let out = '', changed = false;
        for (let i = 0; i < src.length; i++) {
          const code = src.charCodeAt(i);
          if (code < 0x20 && m.inStr[i]) {
            changed = true;
            const c = src[i];
            out += c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t'
              : c === '\b' ? '\\b' : c === '\f' ? '\\f'
              : '\\u' + code.toString(16).padStart(4, '0');
          } else out += src[i];
        }
        return changed ? out : null;
      };
      // 修复②：真开着的未闭合字符串补一个收尾引号（尾随反斜杠先转义自身，否则会吃掉新引号）
      const repairUnterminated = function (src) {
        const m = stringMap(src);
        if (!m.open) return null;
        return (m.escTail ? src + '\\' : src) + '"';
      };
      // 修复③：截断收尾——删尾孤 "key": 与尾逗号、按栈补齐 }/]（两遍；栈交叉判失败不硬凑）
      const repairTruncated = function (src) {
        let t = src;
        for (let pass = 0; pass < 2; pass++) {
          t = t.replace(/,\s*$/, '');
          t = t.replace(/"[^"\n]*"\s*:\s*$/, '');
          const m = stringMap(t);
          if (m.open) t = (m.escTail ? t + '\\' : t) + '"';
        }
        const m = stringMap(t);
        if (m.open) return null;
        const st = [];
        for (let i = 0; i < t.length; i++) {
          if (m.inStr[i]) continue;
          const c = t[i];
          if (c === '{') st.push('}');
          else if (c === '[') st.push(']');
          else if (c === '}' || c === ']') {
            if (!st.length || st[st.length - 1] !== c) return null;
            st.pop();
          }
        }
        while (st.length) t += st.pop();
        return t === src ? null : t;
      };
      // 修复④：常见 JSON 方言——单引号串转双引号、无引号裸键加引号（单趟，字面量态外；
      //   裸键匹配限长 256 防超长无键文本上的正则回溯开销）
      const repairDialect = function (src) {
        let out = '', i = 0, changed = false;
        const n = src.length;
        while (i < n) {
          const c = src[i];
          if (c === '"') {
            let j = i + 1;
            while (j < n) {
              if (src[j] === '\\') j += 2;
              else if (src[j] === '"') { j++; break; }
              else j++;
            }
            out += src.slice(i, Math.min(j, n)); i = Math.min(j, n);
          } else if (c === "'") {
            changed = true;
            let j = i + 1, buf = '';
            while (j < n) {
              if (src[j] === '\\' && j + 1 < n) {
                const nx = src[j + 1];
                buf += nx === "'" ? "'" : (nx === '"' ? '\\"' : '\\' + nx);
                j += 2;
              } else if (src[j] === "'") { j++; break; }
              else { buf += src[j] === '"' ? '\\"' : src[j]; j++; }
            }
            out += '"' + buf + '"'; i = j;
          } else if (c === '{' || c === ',') {
            out += c; i++;
            let k = i;
            while (k < n && (src[k] === ' ' || src[k] === '\t' || src[k] === '\n' || src[k] === '\r')) k++;
            const km = /^[A-Za-z_$][A-Za-z0-9_$-]*\s*:/.exec(src.slice(k, k + 256));
            if (km) {
              changed = true;
              out += src.slice(i, k) + '"' + km[0].slice(0, km[0].length - 1).replace(/\s+$/, '') + '":';
              i = k + km[0].length;
            }
          } else { out += c; i++; }
        }
        return changed ? out : null;
      };
      // 修复⑤：缺逗号——值结尾（} ] " 数字 true/false/null 尾）后紧跟值开头（{ [ " 裸词）处补 ,
      //   （键位后面跟着冒号不算值结尾：闭口引号预读下一字符区分键/值；开口引号视为
      //   新值起点参与补逗号判定——v2.410.0 专锁 A6a 实测逮住的盲区）
      const repairMissingComma = function (src) {
        const m = stringMap(src);
        const isWS = function (c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r'; };
        const valEnd = function (c) {
          return c === '}' || c === ']' || c === '"' || (c >= '0' && c <= '9') || c === 'e' || c === 'l';
        };
        const valStart = function (c) { return c === '{' || c === '[' || c === '"' || /[A-Za-z0-9_$-]/.test(c); };
        let out = '', lastSig = '', changed = false;
        const commaIfNeeded = function (nextC) {
          if (lastSig && lastSig !== ':' && lastSig !== '{' && lastSig !== '[' && lastSig !== ','
            && valEnd(lastSig) && valStart(nextC)) { out += ','; changed = true; }
        };
        for (let i = 0; i < src.length; i++) {
          const c = src[i];
          if (m.inStr[i]) {
            const isOpen = i === 0 || !m.inStr[i - 1];
            if (c === '"' && isOpen) {
              commaIfNeeded(c);                       // 开口引号 = 新值/新键的开始，先补逗号
              out += c;
              let k = i + 1;
              while (k < src.length) {
                if (src[k] === '\\') { k += 2; continue; }
                if (src[k] === '"') break;
                k++;
              }
              if (k < src.length) {
                out += src.slice(i + 1, k + 1);
                i = k;
                let q = i + 1;                        // 闭口引号：后随冒号是键，否则是值
                while (q < src.length && isWS(src[q])) q++;
                lastSig = src[q] === ':' ? ':' : '"';
              }
              continue;
            }
            out += c;
            continue;
          }
          if (isWS(c)) { out += c; continue; }
          commaIfNeeded(c);
          out += c; lastSig = c;
        }
        return changed ? out : null;
      };

      // 候选阶梯：惰性求值、破坏性递增；parse 成功即返回（对象/数组均可，本仓消费方有数组顶层面）
      const ladder = [
        function () { return s; },                                                     // 原样（= 旧版第一试）
        function () { return repairCtrl(s) || s; },                                     // 字符串内控制字符转义
        function () { return repairMissingComma(repairCtrl(s) || s); },                 // + 缺逗号补齐
        function () { return repairDialect(repairCtrl(s) || s); },                      // + 方言（单引号/裸键）
        function () { return repairUnterminated(repairCtrl(s) || s); },                 // + 未闭合字符串收口
        function () { return repairTruncated(repairCtrl(s) || s); },                    // + 截断收尾（栈补闭合）
        function () { const a = repairDialect(repairCtrl(s) || s); return a ? repairTruncated(a) : null; },
        function () { const a = repairMissingComma(repairCtrl(s) || s); return a ? repairTruncated(a) : null; },
        function () { return s.replace(/[\u0000-\u001F]+/g, ' '); }                     // 旧版第二试保底（逐字保留）
      ];
      for (let li = 0; li < ladder.length; li++) {
        let cand;
        try { cand = ladder[li](); } catch (e) { cand = null; }
        if (typeof cand !== 'string' || !cand) continue;
        try { return JSON.parse(cand); } catch (e) {}
      }
      return null;
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
