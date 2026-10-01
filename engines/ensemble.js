/**
 * WorldAxis engines/ensemble.js (v2.138.0) — 多模型并发推演与结果仲裁（E5）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的推演链路自 v0.1.x 起就是**单模型单次**：`core/api-router.js` 的六条通道
 *   （default / inference / digest / judge / choices / observe）能分别配置不同的
 *   baseUrl+model，但每一次调用只落在**一条**通道上，且没有任何一处回答
 *   「两个模型对同一个世界给出不同解读时，谁说了算」。
 *   实测过的三个具体后果：
 *     · `direction/oracle.js` 的候选、`engines/rehearse.js` 的试演、`engines/causal.js`
 *       的回放，全部各调一次通道 —— 同一个世界状态问两遍得到两个答案，**不记分歧**；
 *     · 模型返回不一致时，调用方只能看到「最后回来的那一个」（先到的被覆盖）；
 *     · 「哪个模型更稳」这件事在读数上不可答（没有一致性分数、没有分歧点、没有耗时对照）。
 *   一句话：**同一个问题问多个模型，然后呢 —— 没人裁。**
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `run(channels, messages, opts)` —— 把**同一次只读请求**分发给 N 条通道（真并发）；
 *   ② 三档仲裁：`first`（首个返回）/ `vote`（多数一致）/ `blend`（LLM 合并，
 *      **必须显式 `confirm:true`**）；
 *   ③ `stat()` —— 一致性分数 / 分歧点 / 各成员耗时（读数）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `run` 拒收 `disabled`，**一次通道调用都不发**
 *     （不是「发了但丢弃结果」——那会白花用户的 token）。
 *   2 **只用于只读推演**：本文件**零 `WA.store.transact` / 零 `WA.store.patch`**，
 *     源码级可核（专锁 N 面钉的就是这条）。它不写世界、不改存档、不动 stat 之外的任何状态。
 *   3 **分歧不自动合并**：三档里只有 `blend` 会合并，且必须 `confirm:true`；
 *     缺确认时报 `need-confirm` 并把 **N 份原文逐字带出**（不截断、不改写）。
 *     多数不一致（含全不同）时 `vote` 报 `conflict` 并**交回**调用方，不替它选。
 *   4 **仲裁失败回落单模型**：`blend` 的合并调用失败（超时/未配置/输出截断）⇒ **回落 `first`**，
 *     并在回执里 `fellback:true` + `fallbackReason` —— 回落必须可见，不许静默降级。
 *     若连 `first` 都拿不到（全部成员失败）⇒ 如实 `all-failed`，**不编一个答案**。
 *   5 **不自建模型表 / 不自建并发池**：通道与模型一律取自 `apiRouter.getChannel(name)`
 *     （单一真源），并发读数取自 `apiRouter.getConcurrency()`（本模块**不**再开一条队列，
 *     否则同一个进程里就有了两套并发上限）。
 *   6 **一致性判定不做语义推断**：只做「规范化后逐字相等」。规范化 = 折行、首尾去空白、
 *     连续空白折成一个。语义相似度/关键词命中**不算一致** —— 认不出不一致就报不一致，
 *     这正是本模块存在的理由（把「看着差不多」与「真的同一个答案」分开）。
 *   7 成员数受 `maxModels` 约束，超出部分**不进本次调用**（回执里点名被略过的通道），
 *     不静默截断。
 *   8 通道名去重：同一条通道给两次**只调一次**（回执里 `duplicates` 点名）——
 *     否则「两个模型一致」可以靠同一模型答两遍伪装出来。
 *
 * ── 拒收码口径（沿用 v2.135.0 先例）──────────────────────────
 *   本模块**不新造拒收码**：它报的每一种拒绝都是扫描面上已有的登记码 ——
 *   `disabled`（总开关关）/ `no-channel`（通道名单空）/ `bad-strategy`（档位不在封闭集合）/
 *   `bad-value`（消息面给空）/ `missing-key`（合并通道未配置）/ `module-absent`（apiRouter 缺席）/
 *   `empty-response`（合并器回了空答案）。这与 longline / foreshadow 的用词同族：
 *   同一件事（类型/状态/缺失）各立门户只会把账拆成两本，故一律复用。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_ensemble_settings_v1';
  const DEF = { enabled: false, strategy: 'first', maxModels: 3, blendChannel: 'judge', timeoutMs: 60000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'ensemble',
    bounds: { maxModels: [2, 6], timeoutMs: [5000, 300000] } };
  const STRATEGIES = ['first', 'vote', 'blend'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { runs: 0, members: 0, agreed: 0, conflicted: 0, blended: 0, fellback: 0,
    allFailed: 0, blocked: 0, duplicates: 0, lastReason: '', faults: {},
    lastConsistency: null, lastMs: 0, worstMs: 0, worstChannel: '' };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
    catch (e) { return String(v == null ? '' : v).slice(0, max || 80); }
  }

  /**
   * 规范化：只做**格式**层面的拉平（折行 / 首尾空白 / 连续空白折一个），
   *   **不动内容**。为什么不做「小写化 + 去标点」：那会让「甲」与「甲！」判成一致，
   *   而这正是本模块要分开的那一对（一个字与一句话不是同一个答案）。
   */
  function normalize(text) {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  }

  /** 通道名归一：字符串或 `{channel, model}` 均可；模型留空取该通道生效值。 */
  function memberOf(x) {
    if (x && typeof x === 'object') return { channel: clean(x.channel, 40), model: clean(x.model, 60) };
    return { channel: clean(x, 40), model: '' };
  }

  /**
   * 并发闸的**单一真源**：`apiRouter.getConcurrency()`。
   *   本模块不设自己的上限 —— 同一个进程里两套并发上限必然漂移（本仓点过多次的「第二套数」病）。
   */
  function concurrency() {
    const r = WA.apiRouter;
    if (!r || typeof r.getConcurrency !== 'function') return 0;
    try { return Number(r.getConcurrency()) || 0; } catch (e) { return 0; }
  }

  /**
   * 一致性：几份**规范化后逐字相等**的答案算一致。
   *   返回 `{ consistent, buckets, top, topN, conflict }`：
   *     · `buckets` 按文本分组（含 channel 名单，供调用方看见「谁跟谁一样」）；
   *     · `conflict` = 有 ≥2 个并列最高票的桶，或全不同。
   *   并列即冲突：2 票 vs 2 票**不许**按出现顺序抽一个当多数（那与随机等价）。
   */
  function agreementOf(members) {
    const okRows = members.filter(function (m) { return m && m.ok; });
    const buckets = [];
    okRows.forEach(function (m) {
      const key = normalize(m.text);
      const hit = buckets.filter(function (b) { return b.key === key; })[0];
      if (hit) { hit.channels.push(m.channel); return; }
      buckets.push({ key: key, channels: [m.channel], index: m.index });
    });
    buckets.sort(function (a, b) { return b.channels.length - a.channels.length || a.index - b.index; });
    const top = buckets.length ? buckets[0] : null;
    const topN = top ? top.channels.length : 0;
    const second = buckets.length > 1 ? buckets[1].channels.length : 0;
    // 全不同（每个桶各 1 票）也判冲突：那说明**没有**多数，而不是「第一个就是多数」。
    const conflict = !!top && (topN === second || (buckets.length === okRows.length && okRows.length > 1));
    const consistent = okRows.length > 1 && buckets.length === 1;
    return { consistent: consistent, buckets: buckets, top: top, topN: topN, conflict: conflict,
      answered: okRows.length };
  }

  /** 单成员调用：成功/失败都回一条**带耗时**的行，失败不抛（抛出去会让整轮失去其余成员的结果）。 */
  async function callMember(m, messages, opts) {
    const t0 = clockWall();
    const row = { channel: m.channel, model: m.model, ok: false, text: '', error: '', kind: '', ms: 0 };
    const r = WA.apiRouter;
    if (!r || typeof r.call !== 'function') {
      row.error = 'apiRouter 不可用'; row.kind = 'module-absent'; row.ms = clockWall() - t0;
      return row;
    }
    try {
      const text = await r.call(m.channel, messages, opts);
      row.ok = true; row.text = normalize(text);
    } catch (e) {
      row.error = String((e && e.message) || e).slice(0, 180);
      row.kind = (e && e.kind) || 'unknown';
    }
    row.ms = clockWall() - t0;
    return row;
  }

  /**
   * 主入口：把同一次请求分发给 N 条通道并按档位仲裁。
   *   @param channels 通道名单（字符串或 `{channel, model}`；重复的进去重并点名）
   *   @param messages OpenAI 兼容消息数组（**原样透传**，本模块不改写提示词）
   *   @param opts     `{strategy, json, timeoutMs, confirm, signal, blendChannel}`
   *   @returns 回执（**不抛异常**：全部失败也回 `all-failed`，让调用方能看见发生了什么）
   */
  async function run(channels, messages, opts) {
    const cfg = settings();
    const o = opts || {};
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const arr = Array.isArray(channels) ? channels : (channels ? [channels] : []);
    const wanted = arr.map(memberOf).filter(function (m) { return !!m.channel; });
    if (!wanted.length) { noteFault('no-channel'); return { ok: false, reason: 'no-channel' }; }
    const strategy = STRATEGIES.indexOf(clean(o.strategy, 12)) >= 0 ? clean(o.strategy, 12) : cfg.strategy;
    if (STRATEGIES.indexOf(strategy) < 0) { noteFault('bad-strategy'); return { ok: false, reason: 'bad-strategy', strategies: STRATEGIES.slice() }; }

    // 去重（同通道 + 同模型 = 同一次调用；同通道不同模型则是两个成员，合法）。
    const seen = {}, dup = [], uniq = [];
    wanted.forEach(function (m) {
      const k = m.channel + '@@' + (m.model || '(default)');
      if (seen[k]) { dup.push(m.channel); return; }
      seen[k] = true; uniq.push(m);
    });
    if (dup.length) stat.duplicates += dup.length;
    const cap = Math.max(2, cfg.maxModels);
    const over = Math.max(0, uniq.length - cap);
    const picked = uniq.slice(0, cap);
    const skipped = uniq.slice(cap).map(function (m) { return m.channel; });

    const msgArr = Array.isArray(messages) ? messages.slice() : [];
    if (!msgArr.length) { noteFault('bad-value'); return { ok: false, reason: 'bad-value' }; }
    const callOpts = { json: !!o.json, signal: o.signal, timeoutMs: Number(o.timeoutMs) || cfg.timeoutMs };

    const t0 = clockWall();
    const members = await Promise.all(picked.map(function (m) { return callMember(m, msgArr, callOpts); }));
    const totalMs = clockWall() - t0;
    members.forEach(function (m, i) { m.index = i; });

    const ag = agreementOf(members);
    const answers = function () {
      return ag.buckets.map(function (b) { return { text: b.key, channels: b.channels.slice(), votes: b.channels.length }; });
    };
    const out = { ok: true, strategy: strategy, count: picked.length, members: members,
      answered: ag.answered, failed: members.length - ag.answered,
      consistency: ag.answered > 1 ? (ag.topN / ag.answered) : null,
      conflict: ag.conflict, agreed: ag.consistent, chosen: null, chosenBy: strategy,
      fellback: false, fallbackReason: '', ms: totalMs,
      duplicates: dup.slice(), skipped: skipped, overMax: over };

    stat.runs++; stat.members += members.length;
    // 逐成员耗时记账（最慢通道是「换哪个模型更稳」的第一个读数）
    members.forEach(function (m) { if (m.ms > stat.worstMs) { stat.worstMs = m.ms; stat.worstChannel = m.channel; } });
    stat.lastMs = totalMs;
    stat.lastConsistency = out.consistency;

    if (!ag.answered) {
      // 全失败：不编答案，如实报 all-failed（并带每个成员的失败原因）。
      out.ok = false; out.reason = 'all-failed';
      out.detail = members.map(function (m) { return m.channel + ':' + m.kind; }).join(',');
      stat.allFailed++; stat.lastReason = 'all-failed';
      return out;
    }

    if (strategy === 'first') {
      out.chosen = members.filter(function (m) { return m.ok; })[0].text;
      out.chosenBy = 'first';
      out.fallbackReason = '';   // first 档无回落概念：它本来就是「不管分歧」
      stat.lastReason = ag.consistent ? 'agreed' : 'first-pick';
      if (ag.consistent) stat.agreed++; else stat.conflicted++;
      return out;
    }

    if (strategy === 'vote') {
      out.answers = answers();
      if (ag.conflict) {
        // 分歧**不替调用方选**：交回全部 N 份原文，由它决定。
        out.reason = 'conflict'; out.chosen = null;
        stat.conflicted++; stat.lastReason = 'conflict';
        return out;
      }
      out.chosen = ag.top.key; out.chosenBy = 'vote'; out.votes = ag.topN; out.voters = ag.top.channels.slice();
      stat.agreed++; stat.lastReason = 'voted';
      return out;
    }

    // blend：**必须显式确认**。缺确认即 need-confirm 并把 N 份原文逐字带出（不合并、不改写）。
    out.answers = answers();
    if (o.confirm !== true) {
      out.reason = 'need-confirm'; out.chosen = null;
      stat.lastReason = 'need-confirm';
      return out;
    }
    if (ag.consistent) {
      // 已经一致就**不调合并模型**：多一次调用不会让同一个答案变得更一致（白花 token）。
      out.chosen = ag.top.key; out.chosenBy = 'blend-consistent'; out.votes = ag.topN;
      stat.agreed++; stat.lastReason = 'blend-consistent';
      return out;
    }
    const br = await blend(ag, msgArr, cfg, o);
    if (br.ok) {
      out.chosen = br.text; out.chosenBy = 'blend'; out.blendChannel = br.channel;
      stat.blended++; stat.lastReason = 'blended';
      return out;
    }
    // 合并失败 ⇒ 回落 first（**可见**：fellback + 理由），绝不静默变成「多数」。
    out.chosen = members.filter(function (m) { return m.ok; })[0].text;
    out.chosenBy = 'first'; out.fellback = true; out.fallbackReason = br.reason || 'blend-failed';
    stat.fellback++; stat.conflicted++; stat.lastReason = 'blend-fallback';
    return out;
  }

  /**
   * LLM 合并：把 N 份答案连同**它们各自的通道标签**交给合并通道。
   *   为什么把标签也给它：否则「哪个说法出自哪个模型」在合并后丢失，事后无法复盘。
   *   合并提示词固定（不由调用方提供）—— 让合并器可复现，而不是每次实验换一段措辞。
   */
  async function blend(ag, msgArr, cfg, o) {
    const r = WA.apiRouter;
    const ch = clean(o.blendChannel, 40) || cfg.blendChannel || 'judge';
    if (!r || typeof r.call !== 'function') return { ok: false, reason: 'module-absent' };
    const gc = (typeof r.getChannel === 'function') ? r.getChannel(ch) : null;
    if (!gc || !gc.baseUrl || !gc.model) return { ok: false, reason: 'missing-key' };
    const parts = ag.buckets.map(function (b, i) {
      return '【答案 ' + (i + 1) + '｜来自 ' + b.channels.join('、') + '】' + String.fromCharCode(10) + b.key;
    });
    const sys = '你在合并同一问题的多份答案。规则：只输出**一个**合并后的答案；'
      + '若各答案实质冲突且无法共存，逐字保留分歧并明说「分歧未决」，不要编造一个折中版本；'
      + '不得引入任何一份答案里都没有的新事实。';
    const user = '原问题：' + JSON.stringify(msgArr).slice(0, 4000) + String.fromCharCode(10, 10)
      + '待合并的 ' + ag.buckets.length + ' 份答案：' + String.fromCharCode(10) + parts.join(String.fromCharCode(10, 10));
    try {
      const text = await r.call(ch, [{ role: 'system', content: sys }, { role: 'user', content: user }],
        { timeoutMs: Number(o.timeoutMs) || cfg.timeoutMs, signal: o.signal });
      const norm = normalize(text);
      if (!norm) return { ok: false, reason: 'empty-response' };
      return { ok: true, text: norm, channel: ch };
    } catch (e) {
      return { ok: false, reason: 'blend-error:' + String((e && e.kind) || (e && e.message) || e).slice(0, 60) };
    }
  }

  WA.ensemble = {
    STRATEGIES: STRATEGIES.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    normalize: normalize, agreementOf: agreementOf, concurrency: concurrency, run: run,
    stat: function () {
      return Object.assign({}, stat, { faults: Object.assign({}, stat.faults),
        strategy: settings().strategy, maxModels: settings().maxModels,
        concurrency: concurrency() });
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/ensemble.js', { kind: 'engine', ver: '2.138.0' });
})();