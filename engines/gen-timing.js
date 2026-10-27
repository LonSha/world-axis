/**
 * WorldAxis engines/gen-timing.js (v2.250.0) — GT-1 主动时机决策（渴望累积 / 状态推断 / 信息增益）
 *
 * ── 它治什么（缺口，先用实测说清）──────────────────────────────────
 *   本仓的主动行为只有 `engines/proactive.js` 一条：词表 + 字数 + **固定冷却轮数**。
 *   全库 `poisson` / `bayes` / `infoGain` / `quiet hours` **零命中**。于是主动搭话的
 *   时机是确定性规则，具体有三处失真：
 *     · **不看钟**：凌晨三点和下午三点同样触发，深更半夜也会来拽你；
 *     · **不看 user 在干什么**：你在连续输出长段，它照样判「枯竭」；
 *     · **不看有没有话说**：渴望与「值得说什么」完全脱钩，久别重逢和刚聊完一样冷淡。
 *   `proactive.js` 保留不动（它在治「对话语义枯竭」，是**内容面**）；本模块治**时机面**，
 *   两者正交：本模块给闸，proactive 给话。闸不开时 proactive 不拉。
 *
 * ── 三阶段（各阶段只回答一个问题，不越界替下一阶段作答）──────────
 *   ① 时机（Poisson 骰）：`tick()` 按衰减指数掷一次——「像突然想起来」而不是「到点了」。
 *      命中后渴望回落，未命中渴望累积（`growthFactor`）。这是渴望本身，被量化与记账。
 *   ② 价值（信息增益）：命中之后还要问「值不值得说」。静默越久增益越高，`minInfoGain`
 *      以下判 `low-info` 不发——避免「在吗」式空话。
 *   ③ 状态（贝叶斯后验）：由现场观测（回复时延 / 回复长度 / 静默时长）更新 user 的隐藏
 *      状态后验（chatting / idle / busy / asleep / away / needsCare），每状态带发送效用；
 *      效用低于阈判 `low-utility` 不发。**只推断，不臆造**：无观测时用先验。
 *
 * ── 硬闸（先于一切软判，命中即返回，不再往下算）──────────────────
 *   · `disabled`        总开关默认关闭；
 *   · `quiet-hours`     安静时段（可跨零点）内一律不发（默认 00:00–08:00）；
 *   · `min-interval`    距上次发送不足最小间隔（小时）一律不发，防连发。
 *
 * ── 六条否定式边界（全是「换个写法就会撒谎」的那种）──────────────
 *   ① 总开关默认关闭。关闭时 `tick()` 返回 `shouldSend:false, reason:'disabled'`，不掷骰。
 *   ② **只有三闸全过才发**。任一闸未过都如实带 reason 返回，不把「没发」说成「发了」。
 *   ③ 贝叶斯后验**必须归一化**。观测全空 ⇒ 用先验，不得留下和为 0 的空分布（`bad-posterior`）。
 *   ④ 效用**由后验加权**，不得只读单一状态；被判 `asleep` 时睡意权重压倒一切（0 效用）。
 *   ⑤ 渴望命中有界（`maxProbability` 封顶），且命中后**回落**——只涨不落就不是渴望，是计时器。
 *   ⑥ 安静时段可跨零点（start > end 表示跨夜）；不可跨零点的实现会在 23:00 静默失效。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_gen_timing_settings_v1';
  const DEF = {
    enabled: false,                  // 总开关默认关闭（与仓内其余引擎同规）
    lambdaRate: 0.15,                // 基础渴望率（每 tick 命中的基准密度）
    growthFactor: 0.08,              // 未命中时渴望的累积系数
    maxProbability: 0.95,            // 渴望封顶
    checkIntervalMinutes: 30,        // 一次「想」的间隔（分钟）
    minIntervalHours: 1.0,           // 反连发最小间隔（小时）
    minInfoGain: 0.35,               // 信息增益下限（低于不发）
    utilityThreshold: 0.5,           // 发送效用水位（低于不发）
    quietStart: '00:00',             // 安静时段起（含）
    quietEnd: '08:00',               // 安静时段止（不含）
    normalSendProbability: 0.7,      // 静默半径内的衰减参考（仅供读数）
    maxLedger: 40                    // 决策台账环
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'genTiming', bounds: { maxLedger: [8, 120] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    if (WA.settingsBus && WA.settingsBus.normalize) return WA.settingsBus.normalize(__REG, merged);
    return merged;
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (!WA.settingsBus || !WA.settingsBus.saveOrThrow) return { ok: false, reason: 'no-bus' };
    try { return { ok: true, settings: WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)) }; }
    catch (e) { return { ok: false, reason: 'save-failed', detail: e && e.message }; }
  }

  // user 隐藏状态：先验 + 发送效用。效用即「此刻打扰他，值多少」。
  const STATES = ['chatting', 'idle', 'busy', 'asleep', 'away', 'needsCare'];
  const PRIOR = { chatting: 0.10, idle: 0.30, busy: 0.25, asleep: 0.20, away: 0.10, needsCare: 0.05 };
  const UTILITY = { chatting: 0.2, idle: 0.7, busy: 0.1, asleep: 0.0, away: 0.3, needsCare: 0.9 };
  const STATE_CN = { chatting: '聊天中', idle: '闲逛', busy: '忙碌', asleep: '睡觉', away: '离开', needsCare: '需要关心' };

  const stat = {
    ticks: 0, hits: 0, sent: 0,
    blockedDisabled: 0, blockedQuiet: 0, blockedInterval: 0,
    blockedLowInfo: 0, blockedLowUtility: 0,
    lastReason: '', faults: {}
  };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : String(v || '').trim().slice(0, max || 40); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }

  /** 渴望载体：{ p, lastTickAt, lastSentAt, ledger[] } */
  function box(root) {
    const r = root || state();
    const b = r.genTiming;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { p: null, lastTickAt: 0, lastSentAt: 0, ledger: [] };
    return b;
  }

  /** 'HH:MM' → 自零点的分钟数；非法返回 null（不拿 0 冒充午夜） */
  function minuteOf(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (!isFinite(h) || !isFinite(mi) || h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /**
   * 安静时段判定。start > end 视为**跨零点**（23:00–07:00）。
   * 边界取左闭右开（start 含、end 不含）——「08:00 整」算醒着。
   */
  function inQuiet(atMs, cfg) {
    const a = minuteOf(cfg.quietStart), b = minuteOf(cfg.quietEnd);
    if (a === null || b === null || a === b) return false;
    const d = new Date(typeof atMs === 'number' ? atMs : clockWall());
    const cur = d.getHours() * 60 + d.getMinutes();
    if (a < b) return cur >= a && cur < b;
    return cur >= a || cur < b;      // 跨零点
  }

  /** 观测归一化：非法/缺失一律 null（缺失不猜） */
  function obs(v, lo, hi) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!isFinite(n)) return null;
    return Math.max(lo, Math.min(hi, n));
  }

  /**
   * 贝叶斯后验：P(s|e) ∝ P(e|s) P(s)。
   * 观测口径（三个都不给就退回先验，不臆造）：
   *   · replyGapMin —— 距他上一条回复的分钟数（越久越可能不在/在忙/睡着）
   *   · replyLen    —— 上一条回复长度（越短越可能敷衍或分神）
   *   · hour        —— 现场钟点（深夜抬 asleep）
   * 似然表是**定性**的（相对倍率），只求排序正确，不冒充统计拟合。
   */
  function posterior(o) {
    const like = {};
    STATES.forEach(function (s) { like[s] = 1; });
    const gap = obs(o && o.replyGapMin, 0, 2880);
    const len = obs(o && o.replyLen, 0, 4000);
    const hour = obs(o && o.hour, 0, 23);

    if (gap !== null) {
      if (gap < 3) { like.chatting *= 8; like.idle *= 2; like.busy *= 0.4; like.asleep *= 0.2; }
      else if (gap < 30) { like.idle *= 3; like.chatting *= 1.5; }
      else if (gap < 180) { like.busy *= 3; like.away *= 2.5; like.chatting *= 0.3; }
      else { like.away *= 5; like.asleep *= 2.5; like.busy *= 2; like.chatting *= 0.1; }
    }
    if (len !== null) {
      if (len <= 3) { like.chatting *= 0.4; like.busy *= 2.5; like.idle *= 1.8; }
      else if (len >= 200) { like.chatting *= 2.5; like.idle *= 1.2; }
    }
    if (hour !== null) {
      if (hour >= 0 && hour < 6) { like.asleep *= 6; like.away *= 1.5; like.chatting *= 0.2; }
      else if (hour >= 9 && hour < 18) { like.busy *= 1.8; like.asleep *= 0.3; }
      else if (hour >= 22) { like.asleep *= 2.5; }
    }

    let sum = 0;
    const post = {};
    STATES.forEach(function (s) { post[s] = PRIOR[s] * like[s]; sum += post[s]; });
    if (!(sum > 0) || !isFinite(sum)) { noteFault('bad-posterior'); return Object.assign({}, PRIOR); }
    STATES.forEach(function (s) { post[s] = post[s] / sum; });
    return post;
  }

  /** 由后验求发送效用（后验加权）。asleep 权重过半时直接压到 0（睡觉就别叫）。 */
  function utilityOf(post) {
    let u = 0;
    STATES.forEach(function (s) { u += (post[s] || 0) * UTILITY[s]; });
    if ((post.asleep || 0) >= 0.5) u = 0;
    return Math.max(0, Math.min(1, u));
  }

  /**
   * 信息增益：熵（不确定性）× 化解潜力（越久没说，化解越多）。
   * 口径是定性的：silenceHours 越大越有话说，但封顶 1。
   */
  function infoGain(post, silenceHours) {
    let h = 0;
    STATES.forEach(function (s) { const p = post[s] || 0; if (p > 0) h -= p * Math.log(p); });
    const maxH = Math.log(STATES.length);
    const ent = maxH > 0 ? h / maxH : 0;
    const sh = obs(silenceHours, 0, 240) || 0;
    const resolve = Math.min(1, sh / 8);
    return Math.max(0, Math.min(1, ent * 0.6 + resolve * 0.4));
  }

  /** 决策台账（环形，走挤出侧单一出口） */
  function ledgerPush(draft, row) {
    const b = draft.genTiming && typeof draft.genTiming === 'object' && !Array.isArray(draft.genTiming)
      ? draft.genTiming : { p: null, lastTickAt: 0, lastSentAt: 0, ledger: [] };
    b.ledger = Array.isArray(b.ledger) ? b.ledger : [];
    b.ledger.push(row);
    // per-call 站点：上限 = 设置项 maxLedger。漏传即 bad-cap 归因（不猜上限）。
    if (WA.evict) WA.evict.array(b.ledger, 'genTiming.ledger', settings().maxLedger);
    else if (b.ledger.length > settings().maxLedger) b.ledger.splice(0, b.ledger.length - settings().maxLedger);
    draft.genTiming = b;
  }

  /**
   * 走一次决策。返回：
   *   { ok, shouldSend, reason, probability, ticked, posterior, utility, infoGain }
   * `shouldSend:true` 时调用方才真正发（本模块不发消息、不写正文）。
   */
  function tick(input) {
    stat.ticks++;
    const cfg = settings();
    const at = clockWall();
    const out = { ok: true, shouldSend: false, reason: '', probability: 0, ticked: false, posterior: null, utility: 0, infoGain: 0 };

    // ── 硬闸 ① 总开关 ──
    if (!cfg.enabled) { stat.blockedDisabled++; stat.lastReason = 'disabled'; out.reason = 'disabled'; return out; }
    // ── 硬闸 ② 安静时段 ──
    if (inQuiet(at, cfg)) {
      stat.blockedQuiet++; stat.lastReason = 'quiet-hours'; out.reason = 'quiet-hours';
      out.posterior = posterior(Object.assign({ hour: new Date(at).getHours() }, input || {}));
      out.utility = utilityOf(out.posterior);
      return out;
    }
    // ── 硬闸 ③ 反连发 ──
    const b0 = box();
    const sinceSendH = b0.lastSentAt ? (at - b0.lastSentAt) / 3600000 : Infinity;
    if (sinceSendH < cfg.minIntervalHours) {
      stat.blockedInterval++; stat.lastReason = 'min-interval'; out.reason = 'min-interval';
      return out;
    }

    // ── 阶段① 泊松骰：p = 1 - e^(-λt)，命中回落、未命中累积 ──
    const dt = cfg.checkIntervalMinutes / 60;
    const lam = Math.max(0.0001, cfg.lambdaRate);
    // v2.250.0（死键接线）：normalSendProbability 此前被注释成「仅供读数」，实际零消费。
    //   它是「静默半径内正常发一条的基准概率」，与泊松底率是同一件事的粗粒度口径 ——
    //   把它折进底率：底率 = 泊松命中 × 基准概率。拧小它就该更克制，而不是没反应。
    const sendBase = (typeof cfg.normalSendProbability === 'number' && isFinite(cfg.normalSendProbability))
      ? Math.max(0, Math.min(1, cfg.normalSendProbability)) : 0.7;
    const base = (1 - Math.exp(-lam * dt)) * sendBase;
    const carried = (typeof b0.p === 'number' && isFinite(b0.p)) ? b0.p : base;
    const prob = Math.min(cfg.maxProbability, carried + (carried >= base ? cfg.growthFactor : 0));
    out.probability = prob;

    const input2 = input || {};
    const post = posterior(input2);
    const util = utilityOf(post);
    const gain = infoGain(post, (b0.lastSentAt ? (at - b0.lastSentAt) / 3600000 : (isFinite(sinceSendH) ? sinceSendH : 24)));
    out.posterior = post; out.utility = util; out.infoGain = gain;

    // 掷骰。调用方给了 roll（0..1）就用它——测试可确定；否则走 rand 决策流。
    const roll = (typeof input2.roll === 'number' && isFinite(input2.roll))
      ? Math.max(0, Math.min(0.999999, input2.roll))
      : (WA.rand && typeof WA.rand.next === 'function' ? WA.rand.next('genTiming') : 0.5);
    const hit = roll < prob;
    out.ticked = hit;

    let reason = '';
    if (!hit) reason = 'miss';
    else if (util < cfg.utilityThreshold) { reason = 'low-utility'; stat.blockedLowUtility++; }
    else if (gain < cfg.minInfoGain) { reason = 'low-info'; stat.blockedLowInfo++; }

    out.reason = reason;
    out.shouldSend = (reason === '');
    if (hit) stat.hits++;
    if (out.shouldSend) stat.sent++;
    stat.lastReason = out.shouldSend ? 'send' : reason;

    // 落账：命中后回落至 base，未命中累积；发出的一并更新 lastSentAt
    try {
      WA.store.transact(function (draft) {
        draft.genTiming = draft.genTiming && typeof draft.genTiming === 'object' && !Array.isArray(draft.genTiming)
          ? draft.genTiming : { p: null, lastTickAt: 0, lastSentAt: 0, ledger: [] };
        draft.genTiming.p = hit ? base : prob;
        draft.genTiming.lastTickAt = clockNow('genTiming:tick');
        if (out.shouldSend) draft.genTiming.lastSentAt = clockNow('genTiming:send');
        ledgerPush(draft, {
          at: clockWall(), hit: hit, send: out.shouldSend, reason: out.shouldSend ? 'sent' : reason,
          p: Math.round(prob * 1000) / 1000,
          state: STATES.reduce(function (best, s) { return (post[s] > (post[best] || 0)) ? s : best; }, 'idle')
        });
      }, 'genTiming:tick');
    } catch (e) { noteFault('store-unavailable'); out.ok = false; out.reason = 'store-unavailable'; }

    return out;
  }

  /** 人工记一次发送（外部真发了之后回执，用来重置反连发与渴望） */
  function ackSent() {
    const at = clockNow('genTiming:ack');
    try {
      WA.store.transact(function (draft) {
        draft.genTiming = draft.genTiming && typeof draft.genTiming === 'object' && !Array.isArray(draft.genTiming)
          ? draft.genTiming : { p: null, lastTickAt: 0, lastSentAt: 0, ledger: [] };
        draft.genTiming.lastSentAt = at;
        draft.genTiming.p = 1 - Math.exp(-Math.max(0.0001, settings().lambdaRate) * (settings().checkIntervalMinutes / 60));
      }, 'genTiming:ack');
      return { ok: true };
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
  }

  /** 只读读数：当前渴望、后验、最近台账（诊断/面板消费） */
  function read() {
    const b = box();
    const cfg = settings();
    const at = clockWall();
    const post = posterior({ hour: new Date(at).getHours() });
    return {
      enabled: cfg.enabled,
      probability: typeof b.p === 'number' ? b.p : null,
      lastTickAt: b.lastTickAt || 0,
      lastSentAt: b.lastSentAt || 0,
      quietNow: inQuiet(at, cfg),
      posterior: post,
      utility: utilityOf(post),
      topState: STATES.reduce(function (best, s) { return (post[s] > (post[best] || 0)) ? s : best; }, 'idle'),
      ledger: Array.isArray(b.ledger) ? b.ledger.slice(-8) : []
    };
  }

  /** 注入块：把「现在该不该主动找他」摊给模型看（守法有据，不凭空发） */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = read();
    const lines = [];
    lines.push('[主动时机的物理量]');
    lines.push('渴望（被想起的程度）：' + (r.probability === null ? '尚未起算' : (Math.round(r.probability * 100) + '%')));
    lines.push('推断他此刻在：' + (STATE_CN[r.topState] || r.topState) + '（打扰效用 ' + r.utility.toFixed(2) + '）');
    lines.push('安静时段：' + cfg.quietStart + '–' + cfg.quietEnd + (r.quietNow ? '（**现在就在安静时段内**）' : '（现在可以发）'));
    lines.push('口径：主动开口要像忽然想起来，不是到点打卡；安静时段与「他明显在忙/在睡」时克制，久别与不确定时才值得问一句。');
    return lines.join('\n') + '\n';
  }

  WA.genTiming = {
    getSettings: settings,
    setSettings: function (patch) { const r = saveSettings(patch); return r.ok ? r.settings : r; },
    tick: tick, ackSent: ackSent, read: read, buildBlock: buildBlock,
    inQuiet: function (atMs) { return inQuiet(atMs, settings()); },
    posterior: posterior, utilityOf: utilityOf, infoGain: infoGain,
    STATES: STATES.slice(), STATE_CN: Object.assign({}, STATE_CN),
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/gen-timing.js', { kind: 'engine', ver: '2.250.0' });
  if (WA.log) WA.log('info', 'engines/gen-timing 已加载（2.250.0）');
})();
