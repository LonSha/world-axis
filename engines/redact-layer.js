/**
 * WorldAxis engines/redact-layer.js (v2.230.0) — 脱敏层
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `tool-diag` 有「调试快照」，`perspective-lock` 有「视角口径」，
 *   但**「哪些字段不能出网」没有一层闸**：现场实测 `脱敏` / `redact` / `REDACTED`
 *   在 engines|core|actors|direction|render|ui **只在 tool-diag 提到过 redact 字样**，
 *   没有任何实现面。
 *   后果：把设置 / 单据 / 诊断导出来分享或贴到对话里时，**密钥、header、口令
 *   原样出去**——一处泄漏比功能少一个严重得多。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 Youzini-afk/ST-Evolution 的 src/runtime/redaction.ts：
 *     · **按路径判密**：密钥不是"看起来像"，而是**在确定的路径上**
 *       （`api_key` / `headers_json` / `custom_include_headers` / `proxy_password` /
 *       `authorization` / `custom_api.key`）；
 *     · **header 行级脱敏**：`Name: value` 只保留 `Name:`，值一律换成占位符；
 *       连"没有冒号的行"也整行换成占位符（不原样透出）；
 *     · **字符串兜底再筛一遍**：非密路径的值也走 `redactSensitiveText`
 *       （长 token / Bearer / 常见密钥前缀）；
 *     · **占位符是常量**：`[REDACTED]`，不因来源不同而不同（可断言）。
 *   本模块只取其中**可判定的那一层**（路径判密 / 行级脱敏 / 兜底正则 / 常量占位符）；
 *   真正的导出动作由调用方做，本模块只**返回脱敏后的副本**（不改原件）。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · tool-diag —— 「诊断读到什么」，本模块不改它；
 *   · perspective-lock —— 「谁能知道什么」，本模块不碰认知；
 *   · 本模块 —— **路径判密 + 行级脱敏 + 兜底正则 + 不可逆**（纯函数，零直写）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `redact` 一律 `disabled`（**不静默放行**）。
 *   ② **不改原件**：只返回副本，原对象逐字段比对不变（`mutated:false`）。
 *   ③ **深度有上限**：超过 `maxDepth` 的层**不再下探**，整块替换为占位符
 *      （防深嵌套绕过；宁多脱不可漏脱）。
 *   ④ **环引用不崩**：自引用对象也能返回（已访问集拦截），**不是抛错也不是死循环**。
 *   ⑤ **占位符恒定**：所有脱敏结果一律 `[REDACTED]`，不做"部分打码"。
 *   ⑥ **空值不换成占位符**：空串/空数组**不算秘密**，保持原样（不制造假阳性）。
 *   ⑦ **兜底也脱**：非密路径的字符串仍走敏感串正则（Bearer / 长 token /
 *      私钥块 / 常见前缀），命中即换占位符并计数。
 *   ⑧ 不落盘、不跨会话、不记原文（**只记命中计数与路径名，绝不记值**）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_redact_layer_settings_v1';
  const DEF = { enabled: false, maxDepth: 8, maxString: 20000, placeholder: '[REDACTED]' };
  const __REG = { key: LS_KEY, def: DEF, module: 'redactLayer',
    bounds: { maxDepth: [1, 32], maxString: [100, 400000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const SECRET_LAST = ['api_key', 'apikey', 'headers_json', 'custom_include_headers',
    'proxy_password', 'authorization', 'password', 'passwd', 'secret', 'token',
    'access_token', 'refresh_token', 'private_key', 'cookie'];
  const HEADER_PATH = 'custom_include_headers';
  const KEYPAIR_PREV = 'custom_api';
  const KEYPAIR_LAST = 'key';
  const SENSITIVE_RE = [
    /Bearer\s+[A-Za-z0-9._-]{12,}/g,
    /(?:sk|ghp|gho|ghs|xox[baprs]|AKIA|AIza)[-_A-Za-z0-9]{12,}/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    /[A-Za-z0-9+/]{40,}={0,2}/g,
  ];
  const SENSITIVE_LABEL = ['bearer', 'key-prefix', 'private-key', 'long-blob'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { calls: 0, secrets: 0, headers: 0, fallback: 0, depthCut: 0, cycles: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  function isSecretPath(path) {
    const last = lower(path[path.length - 1]);
    const prev = lower(path[path.length - 2]);
    if (SECRET_LAST.indexOf(last) >= 0) return true;
    if (last === KEYPAIR_LAST && prev === KEYPAIR_PREV) return true;
    return false;
  }
  function redactHeaderLines(value, ph, hits) {
    const lines = String(value == null ? '' : value).split(/\r?\n/);
    return lines.map(function (line) {
      const trimmed = line.trim();
      if (!trimmed) return '';
      const i = trimmed.indexOf(':');
      if (i < 0) { hits.headers++; return ph; }
      const name = trimmed.slice(0, i).trim();
      hits.headers++;
      return name + ': ' + ph;
    }).join('\n').trim();
  }
  function redactSensitiveText(value, ph, hits) {
    let out = String(value == null ? '' : value);
    SENSITIVE_RE.forEach(function (re) {
      out = out.replace(re, function () { hits.fallback++; return ph; });
    });
    return out;
  }
  /** 深度受限 + 环安全的深拷贝脱敏（不改原件）。 */
  function redact(input, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const ph = cleanPlaceholder(cfg);
    const o = opts || {};
    const maxDepth = Number.isFinite(Number(o.maxDepth)) ? Math.floor(Number(o.maxDepth)) : cfg.maxDepth;
    const seen = [];   // 已访问对象（环拦截）
    const hits = { secrets: 0, headers: 0, fallback: 0, depthCut: 0, cycles: 0 };
    const paths = [];
    function walk(node, path, depth) {
      const last = lower(path[path.length - 1]);
      if (node == null) return node;
      const t = typeof node;
      if (t === 'string') {
        if (last === HEADER_PATH || (path.indexOf(HEADER_PATH) >= 0 && depth > 0 && last === HEADER_PATH)) {
          return redactHeaderLines(node, ph, hits);
        }
        if (isSecretPath(path)) {
          if (!node.trim()) return node;   // ⑥ 空值不算秘密
          hits.secrets++; paths.push(path.join('.')); return ph;
        }
        const s = node.length > cfg.maxString ? node.slice(0, cfg.maxString) : node;
        return redactSensitiveText(s, ph, hits);
      }
      if (t === 'number' || t === 'boolean' || t === 'bigint') {
        if (isSecretPath(path)) { hits.secrets++; paths.push(path.join('.')); return ph; }
        return node;
      }
      if (t === 'function' || t === 'symbol') return undefined;
      if (t === 'object') {
        if (depth >= maxDepth) { hits.depthCut++; paths.push(path.join('.') + '/*depth*'); return ph; }
        if (seen.indexOf(node) >= 0) { hits.cycles++; return ph; }
        seen.push(node);
        if (Array.isArray(node)) {
          const arr = node.map(function (v, i) { return walk(v, path.concat(String(i)), depth + 1); });
          if (isSecretPath(path)) { hits.secrets++; paths.push(path.join('.')); return ph; }
          return arr;
        }
        if (isSecretPath(path)) { hits.secrets++; paths.push(path.join('.')); return ph; }
        const out = {};
        Object.keys(node).forEach(function (k) {
          const v = node[k];
          if (v === undefined) return;
          out[k] = walk(v, path.concat(k), depth + 1);
        });
        return out;
      }
      return node;
    }
    const copy = walk(input, [], 0);
    stat.calls++; stat.secrets += hits.secrets; stat.headers += hits.headers;
    stat.fallback += hits.fallback; stat.depthCut += hits.depthCut; stat.cycles += hits.cycles;
    return { ok: true, reason: 'ok', value: copy, placeholder: ph,
      hits: { secrets: hits.secrets, headers: hits.headers, fallback: hits.fallback, depthCut: hits.depthCut, cycles: hits.cycles },
      hitPaths: paths.slice(0, 40), total: hits.secrets + hits.headers + hits.fallback,
      mutated: false, maxDepth: maxDepth, note: '返回副本，原件不变；只记路径不记值' };
  }
  function cleanPlaceholder(cfg) {
    const p = String(cfg.placeholder || '[REDACTED]').slice(0, 24);
    return p || '[REDACTED]';
  }
  /** 单串快判（不建副本）：只报命中数，不给脱敏结果。 */
  function probe(text) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const hits = { secrets: 0, headers: 0, fallback: 0, depthCut: 0, cycles: 0 };
    const s = String(text == null ? '' : text).slice(0, cfg.maxString);
    redactSensitiveText(s, cleanPlaceholder(cfg), hits);
    return { ok: true, reason: hits.fallback ? 'hit' : 'clean', fallback: hits.fallback, total: hits.fallback };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, placeholder: cleanPlaceholder(cfg), maxDepth: cfg.maxDepth, maxString: cfg.maxString,
      secretKeys: SECRET_LAST.slice(), headerPath: HEADER_PATH, keyPair: KEYPAIR_PREV + '.' + KEYPAIR_LAST,
      patterns: SENSITIVE_LABEL.slice(),
      semantics: '按路径判密 / header 行级脱敏 / 兜底正则 / 不改原件 / 深嵌套与环安全' };
  }
  function resetStat() {
    stat.calls = 0; stat.secrets = 0; stat.headers = 0; stat.fallback = 0; stat.depthCut = 0; stat.cycles = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.redactLayer = {
    getSettings: settings, setSettings: saveSettings, view: view,
    redact: redact, probe: probe, isSecretPath: isSecretPath,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    SECRET_LAST: SECRET_LAST, HEADER_PATH: HEADER_PATH,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/redact-layer.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'redactLayer 已加载（2.230.0）');
})();