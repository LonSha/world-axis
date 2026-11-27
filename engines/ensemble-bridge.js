/**
 * WorldAxis engines/ensemble-bridge.js (v2.597.0) — 仲裁面体检（ENS-1）
 *
 * ── 它治什么（缺口）─────────────────────────────────────────
 *   `engines/ensemble.js`（306 行，v2.138.0）把“同一个问题问 N 个模型，然后呢 —— 没人裁”
 *   这件事答到了 306 行：三档仲裁（first / vote / blend）、一致性分数、分歧点、逐成员耗时，
 *   全都在 `stat()` 里算好了。可它**一次都没被产品面读过**（零读 ns 名单里它一直在）。
 *   两个直接后果：
 *     · 用户永远答不出“我这套通道稳不稳”——最后一次一致性多少、分歧几次、哪个通道最慢，全在内存里烂掉；
 *     · 更贵的那个：**“就绪”与“真配”被当成同一件事**。`apiRouter.getChannel(n)` 会 `cfg[n] || cfg.default`
 *       回退，于是未配的通道读出来的 baseUrl/model/key **全是 default 的**。拿两条这样的通道当两个成员去 vote，
 *       实际上是同一个模型答了两遍 —— 一致性 1.0，而这 1.0 是去重管不住的伪造（去重只看通道名 + 模型名）。
 *
 * ── 本模块只做三件事，每件一个硬条件 ────────────────────────
 *   ① `governance()` —— 治理面：开关 / 策略（对照封闭三值）/ maxModels / 合并通道；
 *   ② `channels()` —— 通道就绪度：逐条报 baseUrl / model / key 的**有无**，并单独指出“继承 default”的条目；
 *   ③ `audit()` / `lineOf()` —— 一行读数：能跑吗、上次一致性多少、何以致此。
 *
 * ── 边界（全是否定式）─────────────────────────────────────
 *   1 **一次模型调用都不发**。本文件不调也不引用 `ensemble.run` —— 诊断面不是入口：
 *     想跑就在推演链路里跑（那里有 signal / 超时 / 用户的钱）。本面只读它已经算完的账。
 *   2 **只报 key 有没有，不报 key**。明文 apiKey 从 `apiRouter.listChannels().effective` 取到后
 *     只在本地 bool 运算里用一次，**不进任何返回值、不进读数、不进诊断行**（专锁 D 面钉这条）。
 *   3 **不改设置**。零 `setSettings` / 零 `settingsBus.save` / 零 store 写口。要改请去设置页 ——
 *     本面只报“当前值”与“出厂默认值读不到就说读不到”。
 *   4 **未知策略不猜**。设置里的 strategy 不在三档封闭表里（旧存档 / 手改 / 两套表漂移）时
 *     报 `bad-strategy` 并**原样带回那个值** —— 静默回落 first 会让“我明明设了 vote”永远变成 first。
 *   5 **两套表必须对照**。本面自带一份 `STRATEGIES` 封闭表用于校验，同时和 `ensemble.STRATEGIES` 对照：
 *     不一致就报 `strategy-drift`，**不挑一个用**（同一件事两套数，就会有两个答案）。
 *   6 **读数只有一份**：`lineOf` 是唯一出口，`summaryText` 只是兜底包一层。
 *   7 **不另建一份计数**。`stat()` 只透传引擎的进程内计数 + 本面自己的调用次数。
 *     另攒一份必然与引擎漂移（本仓点过多次的“第二套数”病），所以不攒。
 *   8 **读不到就说读不到**：出厂默认值在 `DEF` 闭包里、不在导出面 ⇒ `defEnabled` 报 `null`，
 *     不从文件头注释里抄一个。v2.412.0 的“全开策略”把 `DEF.enabled` 改成了 true，
 *     而文件头第 1 条注释当时还写着“总开关默认关闭”—— 抄注释就抄出了一个反的答案。
 *     （v2.608.0 / R283 已把那只注释校正为“默认开启”。本桥“不抄注释”的口径因此更要守住：
 *     抄注释在那一刻是错的，抄对了只是一次巧合。）
 *
 * ── why 九值（封闭表）────────────────────────────────────────
 *   `ok` / `module-missing` / `settings-error` / `disabled` / `bad-strategy` / `strategy-drift` /
 *   `no-router` / `router-error` / `no-channel-ready` / `no-runs`。
 *   `no-runs` 与 `ok` 的差别不是措辞：前者是“能跑但一次没跑过”，一致性**没有读数**（不是 0）；
 *   后者是“跑过且读得到”。把两者合成一个“正常”会让“从没验证过”和“验证过且稳”长得一样。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.597.0';
  const STRATEGIES = ['first', 'vote', 'blend'];
  const WHY = ['ok', 'module-missing', 'settings-error', 'disabled', 'bad-strategy',
    'strategy-drift', 'no-router', 'router-error', 'no-channel-ready', 'no-runs'];

  let _stat = { reads: 0, views: 0, last: null };

  function clean(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
    catch (e) { return String(v == null ? '' : v).slice(0, max || 80); }
  }

  /** 引擎在场？（只做在场判定，**不**持有引用副本：引擎重装后要能读到新的） */
  function engine() {
    const E = WA.ensemble;
    return (E && typeof E === 'object') ? E : null;
  }

  /**
   * 引擎的进程内计数 —— **只透传**。
   *   深拷贝一层（faults 也要扣开）：调用方/页面拿到后随手改，不会污染引擎的账。
   */
  function engineStat() {
    const E = engine();
    if (!E || typeof E.stat !== 'function') return null;
    try {
      const s = E.stat();
      if (!s || typeof s !== 'object') return null;
      const out = Object.assign({}, s);
      out.faults = Object.assign({}, s.faults || {});
      return out;
    } catch (e) { return null; }
  }

  /**
   * 治理面。
   *   判定顺序固定：在场 → 可读 → 开着 → 策略认得 → 两套表对得上。
   *   为什么顺序不能乱：开关关着时谈策略认得没意义（用户看不到那一步的错），
   *   而“策略不认识”又比“两套表漂移”更近、更该先说（前者是值错，后者是表错）。
   */
  function governance() {
    const out = {
      ok: false, why: 'module-missing', enabled: false, strategy: '', strategyKnown: false,
      maxModels: 0, blendChannel: '', timeoutMs: 0, drift: null, defEnabled: null
    };
    const E = engine();
    if (!E || typeof E.getSettings !== 'function') return out;
    let s = null;
    try { s = E.getSettings(); } catch (e) { out.why = 'settings-error'; return out; }
    s = s || {};
    out.enabled = s.enabled === true;
    out.strategy = clean(s.strategy, 16);
    out.strategyKnown = STRATEGIES.indexOf(out.strategy) >= 0;
    out.maxModels = Number(s.maxModels) || 0;
    out.blendChannel = clean(s.blendChannel, 40);
    out.timeoutMs = Number(s.timeoutMs) || 0;
    // 两套表对照：引擎那份也可读时才算“有结论”，读不到就是 null（不猜）
    out.drift = Array.isArray(E.STRATEGIES) ? (E.STRATEGIES.join(',') === STRATEGIES.join(',')) : null;
    if (!out.enabled) { out.why = 'disabled'; return out; }
    if (!out.strategyKnown) { out.why = 'bad-strategy'; return out; }
    if (out.drift === false) { out.why = 'strategy-drift'; return out; }
    out.ok = true; out.why = 'ok';
    return out;
  }

  /**
   * 通道就绪度。这是本模块存在的主要理由。
   *   `ready`：baseUrl + model + key 三者都有（缺一个就真调不动）。
   *   `inherited`：**自身 cfg 没配 baseUrl/model，而 effective 有值** ⇒ getChannel 走到了 cfg.default 回退。
   *   为什么要单列：这类通道在“就绪数”里算一条，但它与 default 是同一个模型 —— 拿它投票会伪造一致。
   *   key 只在本地 bool 里用一次，**不出这函数**。
   */
  function channels() {
    const out = { ok: false, why: 'no-router', total: 0, ready: 0, own: 0, inherited: 0, dupRisk: false, rows: [] };
    const R = WA.apiRouter;
    if (!R || typeof R.listChannels !== 'function') return out;
    let list = null;
    try { list = R.listChannels(); } catch (e) { out.why = 'router-error'; return out; }
    if (!Array.isArray(list)) { out.why = 'router-error'; return out; }
    list.forEach(function (c) {
      const e = ((c && c.effective) || {});
      const cfg = ((c && c.cfg) || {});
      const hasBaseUrl = !!(e.baseUrl && String(e.baseUrl).trim());
      const hasModel = !!(e.model && String(e.model).trim());
      const hasKey = !!(e.apiKey && String(e.apiKey).trim());
      const selfBase = !!(cfg.baseUrl && String(cfg.baseUrl).trim());
      const selfModel = !!(cfg.model && String(cfg.model).trim());
      const inherited = !(selfBase && selfModel) && (hasBaseUrl || hasModel);
      out.rows.push({
        name: clean(c && c.name, 40), hasBaseUrl: hasBaseUrl, hasModel: hasModel, hasKey: hasKey,
        ready: !!(hasBaseUrl && hasModel && hasKey), inherited: inherited
      });
    });
    out.total = out.rows.length;
    out.ready = out.rows.filter(function (r) { return r.ready; }).length;
    out.inherited = out.rows.filter(function (r) { return r.ready && r.inherited; }).length;
    out.own = out.ready - out.inherited;
    // dupRisk：就绪成员里至少一条是继承来的，且总共有 ≥2 条 ⇒ 投票面可能拿同一个模型答两遍
    out.dupRisk = out.ready >= 2 && out.inherited >= 1;
    out.ok = out.ready > 0;
    out.why = out.ok ? 'ok' : 'no-channel-ready';
    return out;
  }

  /**
   * 体检：把治理面 + 通道面 + 引擎账合成一份结论。
   *   顺序不是审美：先说“在不在”（module-missing）、再说“关没关”（disabled）、再说“能不能跑”、
   *   最后才说“跑过没有”。反过来会拿一个“没跑过”盖住“根本没配通道”。
   */
  function audit(opts) {
    const g = governance();
    const ch = channels();
    const S = engineStat();
    const runs = S ? (Number(S.runs) || 0) : 0;
    const verdict = {
      enabled: g.enabled === true,
      strategy: g.strategy, strategyKnown: g.strategyKnown, drift: g.drift,
      channels: ch.total, ready: ch.ready, own: ch.own, inherited: ch.inherited, dupRisk: ch.dupRisk,
      runs: runs,
      consistency: (S && typeof S.lastConsistency === 'number') ? S.lastConsistency : null,
      worstChannel: S ? String(S.worstChannel || '') : '',
      worstMs: S ? (Number(S.worstMs) || 0) : 0,
      agree: S ? (Number(S.agreed) || 0) : 0,
      conflict: S ? (Number(S.conflicted) || 0) : 0,
      fellback: S ? (Number(S.fellback) || 0) : 0,
      allFailed: S ? (Number(S.allFailed) || 0) : 0,
      blocked: S ? (Number(S.blocked) || 0) : 0,
      lastReason: S ? String(S.lastReason || '') : '',
      // canRun 只看两个硬条件：开着 + 有一条真能调的通道。它**不**保证“跑得对”（那要看一致性）
      canRun: (g.enabled === true && ch.ready > 0),
      hasStat: !!S
    };
    let why = 'ok';
    if (!engine()) why = 'module-missing';
    else if (g.why === 'settings-error') why = 'settings-error';
    else if (g.enabled !== true) why = 'disabled';
    else if (!g.strategyKnown) why = 'bad-strategy';
    else if (g.drift === false) why = 'strategy-drift';
    else if (ch.why === 'no-router') why = 'no-router';
    else if (ch.why === 'router-error') why = 'router-error';
    else if (ch.ready === 0) why = 'no-channel-ready';
    else if (runs === 0) why = 'no-runs';
    _stat.reads++;
    _stat.last = { why: why, runs: runs, ready: ch.ready, own: ch.own, inherited: ch.inherited };
    return { ok: why === 'ok', version: VERSION, why: why, gov: g, ch: ch, verdict: verdict };
  }

  /** why 九值 → 一句人话。表外值如实回“未登记”，不编一个。 */
  function whyText(why) {
    const w = clean(why, 32);
    if (w === 'ok') return '可读';
    if (w === 'module-missing') return '引擎不在装载面';
    if (w === 'settings-error') return '设置面读不出来';
    if (w === 'disabled') return '总开关关着';
    if (w === 'bad-strategy') return '策略不在三档封闭表里';
    if (w === 'strategy-drift') return '本面封闭表与引擎自带表不一致';
    if (w === 'no-router') return 'apiRouter 不在装载面';
    if (w === 'router-error') return '列举通道抛错';
    if (w === 'no-channel-ready') return '没有一条通道同时有 baseUrl + model + key';
    if (w === 'no-runs') return '一次都没跑过';
    return '未登记：' + w;
  }

  /**
   * 读数**唯一出口**。
   *   分支顺序：不可用态（读不到）→ 不可用态（关着 / 值错 / 表错）→ 跑不起来 → 没跑过 → 有读数。
   *   `no-runs` 与 `ok` 必须长得不一样：前者不许写出“一致性 0”（那是把“没量过”写成“量出来是 0”）。
   */
  function lineOf(a) {
    const v = (a && a.verdict) || {};
    if (!a || a.why === 'module-missing') {
      return '仲裁面：引擎不在装载面 —— 策略、通道、一致性都读不到（不是 0，是没有）';
    }
    if (a.why === 'settings-error') return '仲裁面：设置面读出异常 —— 当前策略/开关无从判定，本读数不可用';
    if (a.why === 'disabled') {
      return '仲裁面：总开关关着 —— run 会直接拒收 disabled，一次通道调用都不发（不是发了丢结果，是不花这个钱）';
    }
    if (a.why === 'bad-strategy') {
      return '仲裁面：设置里的策略 ' + (a.gov.strategy || '（空）') + ' 不在三档封闭表（first/vote/blend）里 —— 不静默回落 first，如实报；这时 run 会拒收 bad-strategy';
    }
    if (a.why === 'strategy-drift') {
      return '仲裁面：本面封闭表与引擎自带 STRATEGIES 不一致 —— 同一件事两套数，先对齐再谈读数';
    }
    if (a.why === 'no-router') return '仲裁面：apiRouter 不在装载面 —— 通道就绪度无从读起';
    if (a.why === 'router-error') return '仲裁面：router 列举通道抛错 —— 本读数不可用';
    if (a.why === 'no-channel-ready') {
      return '仲裁面：共 ' + v.channels + ' 条通道，没有一条同时有 baseUrl + model + key —— 现在跑不起来';
    }
    const base = '仲裁面：共 ' + v.channels + ' 条通道 · 就绪 ' + v.ready + ' 条（真配 ' + v.own
      + ' 条 / 继承 default ' + v.inherited + ' 条） · 策略 ' + (v.strategy || '（空）')
      + ' · 上限 ' + (a.gov.maxModels || 0) + ' 路';
    const dup = v.inherited > 0
      ? '；注意：继承 default 的通道与 default 是同一个模型 —— 拿它们当两个成员投票等于同一模型答两遍，一致性会假高'
      : '';
    if (a.why === 'no-runs') {
      return base + dup + '；一次都没跑过 —— 一致性无读数（不是 0，是没有）';
    }
    const c = (v.consistency === null) ? '无（只有 1 份答案，比不出）' : String(v.consistency);
    return base + dup + ' · 上次一致性 ' + c + ' · 已同意 ' + v.agree + ' / 分歧 ' + v.conflict
      + (v.worstChannel ? ' · 最慢 ' + v.worstChannel + ' ' + v.worstMs + 'ms' : '')
      + ' · 最近结论 ' + (v.lastReason || '—');
  }

  function summaryText(a) {
    const l = lineOf(a || audit({}));
    return l || ('仲裁面：' + whyText(a && a.why));
  }

  /** 单通道视图（面板逐行用）。不认得的通道名不编一行，如实回 unknown-channel。 */
  function view(name) {
    const ch = channels();
    const nm = clean(name, 40);
    _stat.views++;
    let row = null;
    for (let i = 0; i < ch.rows.length; i++) { if (ch.rows[i].name === nm) { row = ch.rows[i]; break; } }
    if (!row) {
      return { ok: false, why: 'unknown-channel', name: nm, row: null,
        line: '通道 ' + (nm || '（空）') + ' 不在 ' + ch.total + ' 条通道表里' };
    }
    const miss = [];
    if (!row.hasBaseUrl) miss.push('baseUrl');
    if (!row.hasModel) miss.push('model');
    if (!row.hasKey) miss.push('key');
    const why2 = row.ready ? (row.inherited ? 'inherited' : 'ok') : 'not-ready';
    return { ok: row.ready, why: why2, name: nm, row: row,
      line: '通道 ' + row.name + '：' + (row.ready ? '就绪' : '未就绪')
        + (miss.length ? '（缺 ' + miss.join('/') + '）' : '')
        + (row.inherited ? ' · 继承 default（与 default 同一模型）' : '') };
  }

  /** 诊断：读数一行 + 治理一行 + 逐通道一行。逐项带数值，不带形容词。 */
  function diagnose() {
    const a = audit({});
    const out = [lineOf(a)];
    out.push('治理：enabled ' + (a.gov.enabled ? '开' : '关') + ' · 策略 ' + (a.gov.strategy || '（空）')
      + ' · 三档表对照 ' + (a.gov.drift === null ? '读不到引擎表' : (a.gov.drift ? '一致' : '不一致'))
      + ' · 上限 ' + (a.gov.maxModels || 0) + ' 路 · 合并通道 ' + (a.gov.blendChannel || '（空）')
      + ' · 超时 ' + (a.gov.timeoutMs || 0) + 'ms'
      + ' · 出厂默认值读不到（DEF 在闭包内，不在导出面）');
    a.ch.rows.forEach(function (r) {
      const miss = [];
      if (!r.hasBaseUrl) miss.push('baseUrl');
      if (!r.hasModel) miss.push('model');
      if (!r.hasKey) miss.push('key');
      out.push('通道 ' + r.name + '：' + (r.ready ? '就绪' : '未就绪')
        + (miss.length ? '（缺 ' + miss.join('/') + '）' : '')
        + (r.inherited ? ' · 继承 default' : ''));
    });
    return { ok: a.ok, why: a.why, lines: out, verdict: a.verdict };
  }

  /** 本面自己的账（不攒引擎那份）：读了几个次、单通道看了几次、最后一次体检的五个数。 */
  function stat() {
    const e = engineStat();
    return {
      version: VERSION, reads: _stat.reads, views: _stat.views,
      engine: e, last: _stat.last ? Object.assign({}, _stat.last) : null
    };
  }

  /** 只重置**本面**的账。引擎的进程内计数由它自己持有，不由这里清（清它 = 改别人的账）。 */
  function __reset() { _stat = { reads: 0, views: 0, last: null }; return true; }

  WA.ensembleBridge = {
    version: VERSION,
    STRATEGIES: STRATEGIES.slice(),
    WHY: WHY.slice(),
    governance: governance,
    channels: channels,
    view: view,
    audit: audit,
    lineOf: lineOf,
    summaryText: summaryText,
    diagnose: diagnose,
    whyText: whyText,
    stat: stat,
    __reset: __reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/ensemble-bridge.js', { kind: 'engine', ver: VERSION });
})();
