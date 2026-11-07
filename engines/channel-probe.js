/**
 * WorldAxis engines/channel-probe.js (v2.326.0) — 坏 token 身份探针 / 渠道可验性账本
 * 缝合自「卢克之光 V0.5 / Anti-Route 8.31」的 8_probe.js + 5_route.js + 13_stats.js。
 *
 * ── 它治什么（缺口，先说不重复）─────────────────────────────────
 *   WorldAxis 的复杂推演吃高阶模型的长链推理。玩家常用第三方中转/聚合 API，被偷偷换成
 *   小模型后表现为「推演突然变蠢」，用户却以为是 WorldAxis 的 bug。core/api-router.js
 *   只记「请求发了什么模型名」（requestViewer），**名字是请求标签，不是身份证据**——
 *   渠道不读 model 字段时名字永远对得上，等于没有校验。
 *
 * ── 与既有模块的分工（逐条否定式）──────────────────────────────
 *   · core/api-router —— 唯一真发请求的口。本模块**不 hook fetch、不 monkey-patch、
 *     不自己发探测请求**；只产出「一份可交给 apiRouter 的探针 messages」，由调用方决定发不发。
 *   · request-viewer / driver-ledger —— 报文与调用账真源。本模块不写它们的账。
 *   · health-preflight —— 全站体检真源。本模块只答「这个渠道像不像目标模型」这一件事。
 *
 * ── 四条边界（全是否定式）──────────────────────────────────────
 *   ① 非对称结论：抄错 ⇒ 大概率不是目标高阶模型；抄对 ⇒ **不能证明身份**，只说「不像便宜替身」。
 *   ② 不发请求：buildProbe() 只返回 body；没有 fetch、没有 XMLHttpRequest、没有定时器。
 *   ③ 不写 chat：探针是独立小请求，结果不进世界、不进正文、不进 store。
 *   ④ 不外带 key：导出文本与账本里默认不含 apiKey，渠名按 base 归并（换 key 不分家）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_channel_probe_settings_v1';
  const DEF = { enabled: false, itemsPerProbe: 8, passLine: 0.75, maxLedger: 40 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'channelProbe',
    enums: {}, bounds: { itemsPerProbe: [4, 12], passLine: [0.1, 1], maxLedger: [5, 200] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const LEDGER_KEY = 'worldaxis_channel_probe_ledger_v1';
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  /* 冷门/长哈希/驼峰混合 token：高阶模型抄得准，便宜小模型易漏位、易补形 */
  const ITEMS = [
    'StarSrvGroupBody', 'intFragmentation', 'Kv7Qm2Lz9RxT', 'b3f9c1e7a2d84b06',
    'NlPz4Wq8Jh2V', 'FragmentationCacheXn3', 'SrvGroupKernelBody', 'Qz9Lm4Tb7Wn2',
    '7fa2c9e1d3b84605', 'Hn5Kp3Xs8Qv1', 'ThreadLocalFragmentation', 'Xz6Wq9Lm3Rt7'
  ];

  function getSettings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function setSettings(patch) {
    if (!WA.settingsBus) return Object.assign({}, getSettings(), patch || {});
    return WA.settingsBus.saveOrThrow(__REG,
      WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})));
  }
  function clean(v, cap) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').slice(0, cap || 200); }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = (h * 16777619) >>> 0; }
    return String(h);
  }
  /** 渠名按 base 归并：同一个反代换 key 不该分家；key 本身永不入账 */
  function channelKey(base) {
    const b = clean(base, 200).replace(/\/+$/, '').replace(/^https?:\/\//i, '');
    return b ? hashStr(b).slice(0, 10) : 'local';
  }

  const _st = { built: 0, judged: 0, weak: 0, inconclusive: 0, faults: 0, lastReason: '', lastAt: 0, used: [] };
  function note(k) { _st[k] = (_st[k] || 0) + 1; _st.lastAt = clockWall(); }

  /** 轮换：优先没跑过的；不够时从已跑过的里补齐，绝不整批重置（否则连续两批会一模一样） */
  function pickItems() {
    const cfg = getSettings();
    const n = Math.max(4, Math.min(ITEMS.length, Math.floor(Number(cfg.itemsPerProbe) || 8)));
    let pool = ITEMS.filter(function (x) { return _st.used.indexOf(x) < 0; });
    if (pool.length < n) {
      const rest = ITEMS.filter(function (x) { return pool.indexOf(x) < 0; });
      pool = pool.concat(rest).slice(0, n);
    }
    const out = pool.slice(0, n);
    _st.used = out.slice();   // 只记这一批：下一轮优先避开它们，形成滚动窗口
    return out;
  }
  /**
   * 只产探针请求体，**绝不发**。调用方（面板/诊断）拿去交给 apiRouter.call 是它自己的决定。
   * @returns {{ok:boolean, reason?:string, items?:string[], messages?:Array, instruction?:string}}
   */
  function buildProbe() {
    try {
      if (!getSettings().enabled) return { ok: false, reason: 'probe-disabled' };
      const items = pickItems();
      const lines = items.map(function (x, i) { return (i + 1) + ') ' + x; }).join('\n');
      const instruction = '逐字抄回下面每一行，不加编号以外的内容、不解释、不改写、不补空行：\n' + lines;
      note('built');
      return { ok: true, items: items.slice(),
        messages: [{ role: 'user', content: instruction }],
        instruction: instruction,
        note: '只产 body；不发请求、不写 chat、不落世界' };
    } catch (e) {
      note('faults');
      return { ok: false, reason: 'probe-build-threw' };
    }
  }
  /**
   * 判定回包。逐字精确匹配才算抄对（不做模糊包含——那会把幻觉也算成通过）。
   * @param {{items:string[], text:string}} info
   */
  function judgeProbe(info) {
    const i = info || {};
    try {
      const items = Array.isArray(i.items) ? i.items : [];
      const text = String(i.text == null ? '' : i.text);
      if (!items.length) return { ok: false, reason: 'no-items' };
      if (!text.trim()) return { ok: false, reason: 'empty-reply' };
      let hit = 0;
      const misses = [];
      items.forEach(function (x) {
        // 允许行首编号/空白，但 token 本身必须逐字出现
        const re = new RegExp('(^|[^A-Za-z0-9])' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9])', 'm');
        if (re.test(text)) hit += 1; else misses.push(x);
      });
      const rate = hit / items.length;
      const line = Number(getSettings().passLine) || 0.75;
      const verdict = rate < line ? 'weak' : 'inconclusive'; // 抄对也**不证明**身份
      note('judged');
      if (verdict === 'weak') note('weak'); else note('inconclusive');
      return {
        ok: true, verdict: verdict, hit: hit, total: items.length, rate: rate, misses: misses,
        conclusion: verdict === 'weak'
          ? '大概率不是目标高阶模型（抄错率偏高）；换渠道或核对上游路由'
          : '不像便宜替身；但抄对不能证明模型身份，只作旁证',
        note: '非对称判据：抄错可证伪，抄对不可证实'
      };
    } catch (e) {
      note('faults');
      return { ok: false, reason: 'probe-judge-threw' };
    }
  }

  /* ── 渠道账本（只记有结论的轮次，不吃 key）── */
  function readLed() {
    try {
      const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(LEDGER_KEY) : null;
      const o = raw ? JSON.parse(raw) : {};
      return (o && typeof o === 'object') ? o : {};
    } catch (e) { return {}; }
  }
  function writeLed(o) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(LEDGER_KEY, JSON.stringify(o)); } catch (e) { /* 配额满不算失败 */ }
  }
  function ledgerRow(base) {
    const all = readLed();
    const r = all[channelKey(base)];
    const empty = { n: 0, weak: 0, inconclusive: 0, at: 0, base: clean(base, 120) };
    if (!r || typeof r !== 'object') return empty;
    return { n: Number(r.n) || 0, weak: Number(r.weak) || 0,
      inconclusive: Number(r.inconclusive) || 0, at: Number(r.at) || 0, base: clean(r.base || base, 120) };
  }
  /** 只有真的拿到判定结论才记账；「没跑」不进分母 */
  function record(base, verdict) {
    if (verdict !== 'weak' && verdict !== 'inconclusive') return { ok: false, reason: 'no-conclusion' };
    const all = readLed();
    const k = channelKey(base);
    const r = all[k] || { n: 0, weak: 0, inconclusive: 0, at: 0, base: clean(base, 120) };
    r.n = (Number(r.n) || 0) + 1;
    r[verdict] = (Number(r[verdict]) || 0) + 1;
    r.at = clockWall();
    r.base = clean(base, 120);
    all[k] = r;
    const keys = Object.keys(all);
    const cap = Math.floor(Number(getSettings().maxLedger) || 40);
    if (keys.length > cap) keys.sort(function (a, b) { return (all[a].at || 0) - (all[b].at || 0); })
      .slice(0, keys.length - cap).forEach(function (x) { delete all[x]; });
    writeLed(all);
    return { ok: true, row: ledgerRow(base) };
  }
  /** Wilson 下限：样本不足时不给「99% 可信」这种假精确 */
  function wilson(k, n) {
    if (!n) return { low: 0, high: 0, enough: false };
    const z = 1.96, p = k / n, z2 = z * z;
    const den = 1 + z2 / n;
    const mid = (p + z2 / (2 * n)) / den;
    const d = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n) / den;
    return { low: Math.max(0, mid - d), high: Math.min(1, mid + d), enough: n >= 8 };
  }
  function channelStat(base) {
    const r = ledgerRow(base);
    const w = wilson(r.weak, r.n);
    return { ok: true, base: r.base, n: r.n, weak: r.weak, inconclusive: r.inconclusive,
      weakRate: r.n ? r.weak / r.n : 0, interval: w,
      note: r.n < 8 ? '样本不足（n<8），只报原始计数，不给置信区间结论' : '被换倾向的 95% 区间' };
  }
  /** 机读码：Node 走 Buffer，浏览器走 TextEncoder+btoa；不依赖任何宿主全局之外的新包 */
  function b64(s) {
    try {
      if (typeof Buffer !== 'undefined' && Buffer.from) return Buffer.from(String(s), 'utf8').toString('base64');
      if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
        const bytes = new TextEncoder().encode(String(s));
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }
      return '';   // 两条都不可用就留空机读码，文本读数照常可读（不静默编造）
    } catch (e) { return ''; }
  }
  /** ≤1800 字可粘贴文本：含一行机读码，默认不含任何 key */
  function exportText(base) {
    const s = channelStat(base);
    const lines = [
      'WorldAxis 渠道探针读数 v2.326',
      '渠道：' + s.base,
      '有结论轮数 n=' + s.n + ' / 可疑 ' + s.weak + ' / 旁证 ' + s.inconclusive,
      s.interval.enough
        ? ('可疑率 95% 区间：' + (s.interval.low * 100).toFixed(1) + '% ~ ' + (s.interval.high * 100).toFixed(1) + '%')
        : '样本不足（n<8），不给区间结论',
      '边界：抄错可证伪，抄对不能证明模型身份；名字对得上一律不算证据。',
      'WA-PROBE:' + b64(JSON.stringify({ b: s.base, n: s.n, w: s.weak, i: s.inconclusive }))
    ];
    return lines.join('\n').slice(0, 1800);
  }
  function spark(vals) {
    const chars = '▁▂▃▄▅▆▇█';
    const arr = (vals || []).filter(function (v) { return typeof v === 'number' && isFinite(v); });
    if (!arr.length) return '';
    const min = Math.min.apply(null, arr), max = Math.max.apply(null, arr), span = max - min;
    return arr.map(function (v) {
      const k = span <= 0 ? 4 : Math.round((v - min) / span * 7);
      return chars.charAt(Math.max(0, Math.min(7, k)));
    }).join('');
  }
  function diagnose() {
    return { ok: true, enabled: getSettings().enabled, status: getSettings().enabled ? 'ready' : 'disabled',
      items: ITEMS.length, lastReason: _st.lastReason,
      note: '只产探针 body 与判定；不发请求、不写 chat、不落世界、账本不含 key' };
  }

  WA.channelProbe = {
    VERSION: '2.326.0', ITEMS: ITEMS.slice(),
    getSettings: getSettings, setSettings: setSettings,
    buildProbe: buildProbe, judgeProbe: judgeProbe,
    record: record, ledgerRow: ledgerRow, channelStat: channelStat,
    wilson: wilson, exportText: exportText, spark: spark,
    channelKey: channelKey, diagnose: diagnose,
    stat: function () { return Object.assign({}, _st, { used: _st.used.slice() }); },
    reset: function () {
      Object.keys(_st).forEach(function (k) { _st[k] = Array.isArray(_st[k]) ? [] : (typeof _st[k] === 'number' ? 0 : (typeof _st[k] === 'boolean' ? false : '')); });
      return { ok: true };
    }
  };
  if (WA.registerModule) WA.registerModule('engines/channel-probe.js', { kind: 'engine', ver: '2.326.0' });
})();