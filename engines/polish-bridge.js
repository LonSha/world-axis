/**
 * WorldAxis engines/polish-bridge.js (v2.601.0) — 润色通道归位表（R276 / PLS-1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `engines/polish.js` 的通道名是 `'rewrite'`，它的边界 4 还专门写了一句话：
 *     「只走 `rewrite` 通道，**不回落别的通道**：回落会让“润色”悄悄变成“推演正文”。」
 *   而 `core/api-router.js` 的通道名单是
 *     ['default', 'inference', 'digest', 'judge', 'choices', 'observe']
 *   —— **`rewrite` 不在其中**。注意这份名单的语义：它是「设置面列哪几张卡片」，
 *   不是「router 接受哪些名字」。`getChannel(name)` 的实现是 `cfg[name] || cfg.default`，
 *   于是 `'rewrite'` 这一次调用**恒回落到 default**，拿的是 default 的地址、密钥与模型。
 *
 *   所以那条注释里写的边界，在实现层从来没有兑现过：polish 自己确实没写回落，
 *   是 router 替它回落了，且回落的正是「推演正文」用的那个 default。
 *   用户在设置面看到六张通道卡片，没有任何一处告诉过他「润色其实用的是 default」；
 *   而当他真想让润色用个便宜模型时，唯一的入口是改 default —— 那又同时改掉了推演。
 *
 *   本仓管这种「声明的意图与实际的走向不可分辨」叫同形不可分辨。BND-1（v2.600.0）
 *   治的是分层配置里「谁遮住了谁」，本表治的是通道里「我用的到底是谁」。
 *   同源病灶的两次发作：一次在作用域层，一次在通道层。
 *
 * ── 本模块只做四件事 ─────────────────────────────────────────
 *   ① `known()`  —— 通道名在不在名单里（**现读** `apiRouter.CHANNELS`，不抄副本）；
 *   ② `route()`  —— 实际落到哪一家的连接配置（own / fallback → default / empty-seg / none）；
 *   ③ `params()` —— 温度/上限/超时的三方对照：polish 发的、通道里存的、router 缺省的，
 *                    以及**每一项最终由谁决定**（这正是「参数自己的、连接别人的」的量化形态）；
 *   ④ `clamp()` + `faults()` —— 预算边界夹取口径与七个失败码的用户可见含义。
 *   `audit()` 把四件合成一个 verdict；`lineOf()` 给一行读数，`diagnose()` 给可粘贴的体检单。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **零跑**：绝不调 `variants()`。那个函数会真发一次 `apiRouter.call` ——
 *      一张体检表不该因为被打开就消耗用户的 token。`pick()` / `split()` 也不调：
 *      它们会走 `noteFault()` 改 `stat`，体检把「失败计数」改掉之后，读出来的就不是现场。
 *      专锁 A26/B10 钉这条：调用前后 `polish.stat()` 五计数与 faults 字典逐字相等。
 *   2 **零写**：不 `setSettings`、不 `setChannel`、不 `save` —— 只 `read`。
 *   3 **只报键名不报密钥**：`apiKey` 只出 `hasKey` 布尔；`baseUrl` 只出 `hasBaseUrl` 布尔
 *      （它可能是用户自建的内网地址）。`model` 照报 —— 「润色实际用哪个模型」是本表存在的
 *      唯一理由，不报它等于没答；且模型名不含密钥。
 *   4 名字每次**现读** `WA.polish.CHANNEL` 并与名单比对，既不在名单又不是 `rewrite` 时报
 *      `drift` 拒绝硬算：将来有人把通道名改掉，本表**不需要跟着改**（它会自己把 drift 报出来）。
 *   5 `off-list`（名字不在名单、router 在）与 `no-router`（router 或名单本身读不到）分开报：
 *      前者是配置形态，后者是装载缺失，处置完全不同。
 *   6 读数唯一出口：四个事实面只在这里合成，UI 面板与 tool-diag 都读这一处。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 勘察态的通道名。只用于「现读值与它不一致时报 drift」，不参与任何计算。 */
  const NAME = 'rewrite';
  /** why 五值：与 BND-1 同构（ok / 装载缺失 / 名单读不到 / 名单外 / 名字漂移）。 */
  const WHY = ['ok', 'module-missing', 'no-router', 'off-list', 'drift'];
  /** verdict 八值：why 之外再把「名单外」按落点细分成四态（fallback/own/empty/none）。 */
  const VERDICT = ['module-missing', 'no-router', 'drift',
    'channel-ok', 'channel-off-list-fallback', 'channel-off-list-own',
    'channel-off-list-empty', 'channel-off-list-none'];
  /** router `_callInner` 里三个参数的缺省值（现场口径，不是本表自造）。 */
  const ROUTER_DEF = { temperature: 0.8, maxTokens: 4000, timeoutMs: 120000 };

  /** 七个失败码 → 用户可见含义。表里没有的码会在 `faults().unregistered` 里冒出来。 */
  const FAULT_TEXT = {
    'empty-text': '空文本：不收，返回空数组（唯一不返回原文的失败 —— 没有原文可返）',
    'disabled': '总开关关着：原样返回原文，用户输入不消失',
    'no-channel': 'apiRouter 不在或缺 call：返回原文',
    'api-fail': '请求本身失败（含 not-configured / auth / rate-limit / timeout）：返回原文',
    'empty-response': '模型回了，但按分隔标记一版都解析不出：返回原文',
    'bad-type': 'pick 收到非数组：报 bad-type，不猜',
    'not-found': 'pick 越界：如实报 size 与 want，不默默取第一版'
  };

  const stat = { audits: 0, reads: 0, lastWhy: '', lastVerdict: '', lastModel: '', lastReadAt: 0 };

  function clockWall() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }
  function P() { return WA.polish || null; }
  function R() { return WA.apiRouter || null; }

  /** 通道名单：现读，不抄副本（apiRouter 改了名单，本表自动跟上）。 */
  function listOf() {
    const r = R();
    if (!r) return null;
    return Array.isArray(r.CHANNELS) ? r.CHANNELS.slice() : null;
  }

  /** polish 现读的通道名；引擎不在时退回勘察值（此时 why 已经是 module-missing）。 */
  function nameOf() {
    const p = P();
    return (p && typeof p.CHANNEL === 'string' && p.CHANNEL) ? p.CHANNEL : NAME;
  }

  /** 名字 + 名单 ⇒ why。三处（known / params / audit）共用这一个判据。 */
  function whyOf(name, list) {
    if (!list) return 'no-router';
    if (list.indexOf(name) >= 0) return 'ok';
    return (name === NAME) ? 'off-list' : 'drift';
  }

  /**
   * 从自注册清单里取某模块的登记项。
   * 不硬编码 localStorage 的 key —— 那是各模块的私有物，硬编码一份就是「两处真源」。
   * `WA.__settingsRegs` 是本仓既有的自注册清单（settingsBus 的各消费方 concat 进去）。
   */
  function regOf(mod) {
    const all = WA.__settingsRegs;
    if (!Array.isArray(all)) return null;
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      if (r && r.module === mod) return r;
    }
    return null;
  }

  /** 通道配置的**原始落盘**（apiRouter 登记项整份）。读不到报 null，不猜。 */
  function rawCfg() {
    const reg = regOf('apiRouter');
    if (!reg || !WA.settingsBus || typeof WA.settingsBus.read !== 'function') return null;
    let v = null;
    try { v = WA.settingsBus.read(reg); } catch (e) { return null; }
    return (v && typeof v === 'object') ? v : {};
  }

  function segOf(cfg, n) {
    const s = cfg && cfg[n];
    return (s && typeof s === 'object') ? s : null;
  }
  function segHasKeys(s) { return !!(s && Object.keys(s).length); }

  /** ① 通道名在不在名单里。 */
  function known() {
    stat.reads++;
    const name = nameOf();
    const list = listOf();
    const why = whyOf(name, list);
    return {
      ok: why === 'ok',
      why: P() ? why : 'module-missing',
      name: name,
      list: list || [],
      known: !!list && list.indexOf(name) >= 0
    };
  }

  /**
   * ② 实际落到哪一家。
   * `seg`（盘上有没有这一段）与 `via`（调用期会走哪条路）分开报 —— 因为
   * `cfg[name] || cfg.default` 是**真值**判定：空对象 `{}` 为真，会**截断**回落，
   * 于是「盘上有一段空配置」与「盘上什么都没」在读数上看起来都像「没配置」，
   * 实际后果完全相反（前者 not-configured，后者继承 default）。
   */
  function route() {
    stat.reads++;
    const name = nameOf();
    const out = {
      ok: false, why: 'module-missing', name: name, list: [], known: false,
      seg: 'absent', via: '', fallbackTo: '', model: '',
      hasBaseUrl: false, hasKey: false, useTavernProxy: false, sameAsDefault: false
    };
    const list = listOf();
    if (!P()) return out;
    if (!list) return Object.assign({}, out, { why: 'no-router' });

    const hit = list.indexOf(name) >= 0;
    const cfg = rawCfg();
    const own = segOf(cfg, name);
    const def = segOf(cfg, 'default');

    let seg, via;
    if (cfg === null) { seg = 'unknown'; via = 'unknown'; }
    else if (own) { seg = segHasKeys(own) ? 'own' : 'empty'; via = (seg === 'own') ? 'own' : 'empty-seg'; }
    else { seg = 'absent'; via = segHasKeys(def) ? 'fallback' : 'none'; }

    let eff = null;
    try { eff = R().getChannel(name); } catch (e) { eff = null; }
    let defEff = null;
    try { defEff = R().getChannel('default'); } catch (e) { defEff = null; }

    const model = eff ? (eff.model || '') : '';
    // 只在「真有一条来路」时才有资格说「与 default 同一份」：
    //   两层都是空的时候说「相同」是没意义的（那是两个都空，不是一份配置）。
    const routed = (via === 'fallback' || via === 'own');
    const same = !!(routed && eff && defEff
      && model === (defEff.model || '')
      && (eff.baseUrl || '') === (defEff.baseUrl || '')
      && (!!eff.apiKey === !!defEff.apiKey));

    return {
      ok: true,
      why: whyOf(name, list),
      name: name, list: list, known: hit,
      seg: seg, via: via, fallbackTo: (via === 'fallback') ? 'default' : '',
      model: model,
      hasBaseUrl: !!(eff && eff.baseUrl),
      hasKey: !!(eff && eff.apiKey),
      useTavernProxy: !!(eff && eff.useTavernProxy),
      sameAsDefault: same
    };
  }

  /**
   * ③ 参数归谁。六行、两个 by：
   *   by='polish'  —— polish 在 `call(.., opts)` 里设了这一项，**覆盖**通道里的值；
   *   by='channel' —— polish 一个字都没发，值全部来自通道（地址/密钥/模型三项）。
   * 三比三，这就是「参数是自己的，连接是别人的」的量化形态。
   */
  function params() {
    stat.reads++;
    const name = nameOf();
    const out = { ok: false, why: 'module-missing', name: name, rows: [], ownedByPolish: 0, ownedByChannel: 0, notes: [] };
    const p = P();
    if (!p) return out;
    const list = listOf();
    if (!list) return Object.assign({}, out, { why: 'no-router' });

    let s = null;
    try { s = p.getSettings(); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') return Object.assign({}, out, { why: 'no-router' });

    let ch = null;
    try { ch = R().getChannel(name); } catch (e) { ch = null; }

    const rows = [
      { key: 'temperature', emit: s.temperature / 100, chan: ch ? ch.temperature : null,
        router: ROUTER_DEF.temperature, rule: 'opts.temperature != null ? opts.temperature : cfg.temperature', by: 'polish' },
      { key: 'maxTokens', emit: s.maxTokens, chan: ch ? ch.maxTokens : null,
        router: ROUTER_DEF.maxTokens, rule: 'opts.maxTokens || cfg.maxTokens', by: 'polish' },
      { key: 'timeoutMs', emit: s.timeoutMs, chan: null,
        router: ROUTER_DEF.timeoutMs, rule: 'opts.timeoutMs || 120000（router 内写死）', by: 'polish' },
      { key: 'model', emit: null, chan: ch ? (ch.model || '') : '',
        router: '', rule: 'cfg.model —— polish 一个字都不发', by: 'channel' },
      { key: 'baseUrl', emit: null, chan: null,
        router: '', rule: 'cfg.baseUrl —— polish 不发（此处只报有没有）', by: 'channel', has: !!(ch && ch.baseUrl) },
      { key: 'apiKey', emit: null, chan: null,
        router: '', rule: 'cfg.apiKey —— polish 不发（此处只报有没有）', by: 'channel', has: !!(ch && ch.apiKey) }
    ];
    rows.forEach(function (r) { r.overridden = (r.by === 'polish' && r.chan !== null && r.chan !== undefined && r.emit !== r.chan); });

    return {
      ok: true,
      why: whyOf(name, list),
      name: name,
      rows: rows,
      ownedByPolish: rows.filter(function (r) { return r.by === 'polish'; }).length,
      ownedByChannel: rows.filter(function (r) { return r.by === 'channel'; }).length,
      notes: [
        '参数归 polish、连接归通道：温度/上限/超时三项 polish 全发，模型/地址/密钥三项 polish 一个字都不发。',
        'maxTokens 走 `||`：0 会被当成「没传」而静默改用通道值 —— 当前 bounds 下限 128，现场走不到；'
          + '但那条下限一旦放到 0，这一格就会静默失真。',
        'temperature 走 `!= null`：设成 0 仍然覆盖成功。与上一条正好相反 —— 同一份报文里两处判据不一致。'
      ]
    };
  }

  /**
   * ④a 预算边界。报**落盘值**与**生效值**的差，而不是自己再夹一遍 ——
   * 夹取的真源是 `settingsBus.normalize(reg)`（它读 `reg.bounds`），本表只做比对。
   */
  function clamp() {
    stat.reads++;
    const out = { ok: false, why: 'module-missing', rows: [], clampedCount: 0 };
    const p = P();
    if (!p) return out;
    const reg = regOf('polish');
    if (!reg || !WA.settingsBus) return Object.assign({}, out, { why: 'no-router' });

    const bounds = (reg.bounds && typeof reg.bounds === 'object') ? reg.bounds : {};
    const DEF = (reg.def && typeof reg.def === 'object') ? reg.def : {};
    let raw = null;
    try { raw = WA.settingsBus.read(reg); } catch (e) { raw = null; }
    let eff = null;
    try { eff = p.getSettings(); } catch (e) { eff = null; }
    if (!eff || typeof eff !== 'object') return Object.assign({}, out, { why: 'no-router' });

    const rows = Object.keys(bounds).map(function (k) {
      const b = Array.isArray(bounds[k]) ? bounds[k] : [];
      const rv = (raw && raw[k] !== undefined) ? raw[k] : DEF[k];
      const ev = eff[k];
      return { key: k, raw: rv, eff: ev, bound: [b[0], b[1]], clamped: rv !== ev };
    });
    return { ok: true, why: 'ok', rows: rows,
      clampedCount: rows.filter(function (r) { return r.clamped; }).length };
  }

  /**
   * ④b 七个失败码。`unregistered` 非空即表示 polish 新增了码而本表没跟上 ——
   * 本表自身也会过时，过时要能被读出来，不能靠人记得同步。
   */
  function faults() {
    stat.reads++;
    const out = { ok: false, why: 'module-missing', codes: [], runs: 0, produced: 0, failed: 0, blocked: 0, lastReason: '', unregistered: [] };
    const p = P();
    if (!p || typeof p.stat !== 'function') return out;
    let s = null;
    try { s = p.stat(); } catch (e) { s = null; }
    if (!s) return out;
    const seen = (s.faults && typeof s.faults === 'object') ? s.faults : {};
    const codes = Object.keys(seen).map(function (k) {
      return { code: k, n: seen[k], means: FAULT_TEXT[k] || '' };
    }).sort(function (a, b) { return b.n - a.n; });
    return {
      ok: true, why: 'ok', codes: codes,
      runs: s.runs || 0, produced: s.produced || 0, failed: s.failed || 0, blocked: s.blocked || 0,
      lastReason: s.lastReason || '',
      unregistered: codes.filter(function (c) { return !FAULT_TEXT[c.code]; }).map(function (c) { return c.code; })
    };
  }

  /** 一行读数。八种 verdict 各一句，句子里写清「所以用户会遇到什么」。 */
  function lineOf(a) {
    if (!a) return '';
    if (a.verdict === 'module-missing') return '润色引擎不在：WA.polish 未加载 —— 通道归位无从判断';
    if (a.verdict === 'no-router') return '路由不在：WA.apiRouter 或它的通道名单读不到 —— 润色会在调用期走 no-channel 并原样返回原文';
    if (a.verdict === 'drift') return '通道名与勘察不一致：现读「' + a.name + '」既不在名单、也不是 rewrite —— 本表拒绝硬算';
    const list = (a.list || []).join('/');
    const model = (a.route && a.route.model) || '（空）';
    if (a.verdict === 'channel-ok') return '润色通道「' + a.name + '」在名单内：独立配置，模型「' + model + '」';
    if (a.verdict === 'channel-off-list-fallback') {
      return '润色通道「' + a.name + '」不在名单（' + list + '）⇒ 实际落 default：模型「' + model
        + '」，与推演同一份 —— 参数（温度/上限/超时）是自己的，连接（地址/密钥/模型）是 default 的';
    }
    if (a.verdict === 'channel-off-list-own') {
      return '润色通道「' + a.name + '」不在名单，但盘上有一份独立配置：模型「' + model
        + '」—— 设置面不会显示这张卡片，改动只能手写盘，而本表能读到它';
    }
    if (a.verdict === 'channel-off-list-empty') {
      return '润色通道「' + a.name + '」在盘上是一段**空**配置：`cfg[name] || cfg.default` 走真值判定，'
        + '空对象为真 ⇒ 它**截断**了到 default 的回落 ⇒ 调用期报 not-configured，而界面上看不出任何异常';
    }
    return '润色通道「' + a.name + '」不在名单、盘上无独立配置、default 也没有内容 ⇒ 调用期报 not-configured';
  }

  /** 一段可粘贴的摘要。 */
  function summaryText(a) {
    if (!a) return '';
    return '通道归位：' + a.name + ' ｜ ' + a.verdict + ' ｜ 落点 ' + ((a.route && a.route.via) || '—')
      + ' ｜ 模型 ' + (((a.route && a.route.model) || '（空）'))
      + ' ｜ 同 default ' + (a.route && a.route.sameAsDefault ? '是' : '否')
      + ' ｜ 参数 ' + (a.params || []).length + ' 项（本模块 ' + (a.params || []).filter(function (r) { return r.by === 'polish'; }).length + '）'
      + ' ｜ 夹取 ' + (a.clampedCount || 0) + ' 项 ｜ 失败码 ' + (a.faults || []).length + ' 类'
      + ' ｜ 零跑零写';
  }

  /** 合成。`ok` 只在 `channel-ok` 时为真 —— 现状（名单外）就是 false，这是如实读数，不是异常。 */
  function audit(opts) {
    stat.audits++;
    const k = known();
    const dead = (k.why === 'module-missing' || k.why === 'no-router');
    const r = dead ? null : route();
    const pm = dead ? null : params();
    const cl = dead ? null : clamp();
    const ft = dead ? null : faults();

    let verdict = 'channel-off-list-none';
    if (k.why === 'module-missing') verdict = 'module-missing';
    else if (k.why === 'no-router') verdict = 'no-router';
    else if (k.why === 'drift') verdict = 'drift';
    else if (k.known) verdict = 'channel-ok';
    else if (r && r.via === 'fallback') verdict = 'channel-off-list-fallback';
    else if (r && r.via === 'own') verdict = 'channel-off-list-own';
    else if (r && r.via === 'empty-seg') verdict = 'channel-off-list-empty';

    const out = {
      ok: verdict === 'channel-ok',
      why: k.why,
      verdict: verdict,
      name: k.name,
      list: k.list,
      route: r,
      params: pm ? pm.rows : [],
      notes: pm ? pm.notes : [],
      clamp: cl ? cl.rows : [],
      clampedCount: cl ? cl.clampedCount : 0,
      faults: ft ? ft.codes : [],
      counters: ft ? { runs: ft.runs, produced: ft.produced, failed: ft.failed, blocked: ft.blocked, lastReason: ft.lastReason } : null,
      sameAsDefault: r ? r.sameAsDefault : false
    };
    out.line = lineOf(out);
    out.text = summaryText(out);
    stat.lastWhy = out.why;
    stat.lastVerdict = out.verdict;
    stat.lastModel = r ? r.model : '';
    stat.lastReadAt = clockWall();
    return out;
  }

  /** 体检单：行数、落点、参数、夹取、失败码各一段，便于整段贴进日志。 */
  function diagnose(opts) {
    const a = audit(opts);
    return {
      ok: a.ok, why: a.why, verdict: a.verdict, line: a.line, text: a.text,
      counts: {
        params: (a.params || []).length,
        clamp: (a.clamp || []).length,
        faults: (a.faults || []).length
      },
      route: a.route, params: a.params, clamp: a.clamp, faults: a.faults,
      counters: a.counters
    };
  }

  function statOut() {
    return {
      audits: stat.audits, reads: stat.reads,
      last: { why: stat.lastWhy, verdict: stat.lastVerdict, model: stat.lastModel, at: stat.lastReadAt },
      /** 平铺三格留给 tool-diag 同一个读口（`last` 是 BND-1 的形态，两处都认）。 */
      lastWhy: stat.lastWhy, lastVerdict: stat.lastVerdict, lastModel: stat.lastModel,
      lastReadAt: stat.lastReadAt
    };
  }

  WA.polishBridge = {
    NAME: NAME, WHY: WHY, VERDICT: VERDICT,
    known: known, route: route, params: params, clamp: clamp, faults: faults,
    audit: audit, lineOf: lineOf, summaryText: summaryText, diagnose: diagnose,
    stat: statOut,
    __reset: function () {
      stat.audits = 0; stat.reads = 0; stat.lastWhy = '';
      stat.lastVerdict = ''; stat.lastModel = ''; stat.lastReadAt = 0;
    },
    version: '2.601.0'
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/polish-bridge.js', { kind: 'engine', ver: '2.601.0' });
  }
})();
