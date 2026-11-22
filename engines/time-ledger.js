/**
 * WorldAxis engines/time-ledger.js (v2.528.0) — EXV28-25/27/28/29/30 三种时间的账
 * 读数：storyclock.discipline()（v2.129）已有但对账弱；offline-tick 批量追平；
 *      memory-age（v2.410）只管记忆条目，世界事实没有时效。
 * 机制：三栏对读（世界钟/正文/真实）+ 离线跳跃说明 + 节令 + 期限压迫 + 旧闻过期。
 * 边界：偏差只报不改正文；不阻止离线推进，只要求「跨了多久」说得清。
 *
 * v2.542.18（引擎互校③）：把「正文时间」这一栏接回**真锚点**。
 *   旧实现 read().rows 的「正文时间」取 `storyclock.discipline()` —— 那是**给模型的注桩指令**，
 *   不是正文里写着的时间；而 storyclock 的 parseStamp / readLatest / audit 在整条读面上一次没被
 *   调过（audit refs=0）。本批：read() → storyTime()+reconcile()；buildBlock() 也真正对账。
 *   三类「读不到」分开说：no-messages（算不出来）/ no-stamp（真没写）/ storyclock-disabled。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.542.18';
  const LS_KEY = 'worldaxis_time_ledger_settings_v1';
  const DEF = { enabled: true, devWarnRounds: 3, staleRounds: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'timeLedger',
    bounds: { devWarnRounds: [1, 20], staleRounds: [3, 60] } };
  const stat = { reads: 0, jumps: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 60) : ''; }
  function safe(fn, dflt) { try { const v = fn(); return v === undefined || v === null ? dflt : v; } catch (e) { return dflt; } }
  /** v2.529.0 世界钟标签的唯一真源：calendar.setClock 写的就是 store.clock.label（本引擎不自留副本）。 */
  function clockLabel() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return d && d.clock && typeof d.clock.label === 'string' ? d.clock.label : '';
  }
  /** v2.542.18：宿主楼层（唯一用途 = 正文锚点回读）。拿不到就返回 null，不伪造空数组。 */
  function hostChat() {
    try {
      const S = WA.mainWin && WA.mainWin.SillyTavern;
      const c = S && S.getContext ? S.getContext() : null;
      return c && Array.isArray(c.chat) ? c.chat : null;
    } catch (e) { return null; }
  }
  /**
   * v2.542.18：「正文时间」这个口径**唯一**的出口。
   *   上一版 read() 的「正文时间」栏取的是 `storyclock.discipline()` —— 那是注入给模型的
   *   **注桩指令**（「每楼正文必须在首部产出时间标签……」），不是正文里写着的时间。于是产品面
   *   这一栏永远显示一段操作手册，而 storyclock 早就算好的 parseStamp / readLatest / audit
   *   三件在整条读面上**一次都没被调用**（dead-export 账本里 audit refs=0 就是这条）。
   *   三种「读不到」分开说，绝不塌成一句 unknown：
   *     no-messages（拿不到楼层 = 算不出来）≠ no-stamp（扫过了，正文真没写标签）≠ 总开关关。
   */
  function storyTime(opts) {
    const s = opts && typeof opts === 'object' ? opts : {};
    const list = Array.isArray(s.messages) ? s.messages : hostChat();
    if (!list) return { known: false, reason: 'no-messages', why: '拿不到楼层（无头环境或宿主未就绪）——算不出来，不是「正文没写锚点」' };
    if (!(WA.storyclock && typeof WA.storyclock.readLatest === 'function')) return { known: false, reason: 'no-storyclock', why: 'storyclock 未装载' };
    let r = null;
    try { r = WA.storyclock.readLatest(list); } catch (e) { r = null; }
    if (r && r.ok) return { known: true, label: r.label, scanned: r.scanned, fromEnd: r.fromEnd, paired: !!r.paired };
    if (r && r.reason === 'disabled') return { known: false, reason: 'storyclock-disabled', why: 'storyclock 总开关关着（注桩没开，回读也不算）' };
    return { known: false, reason: 'no-stamp', scanned: (r && r.scanned) || 0,
      why: '扫了 ' + ((r && r.scanned) || 0) + ' 层，正文里一个时间标签都没有' };
  }
  /** v2.542.18：正文锚点 ⇄ 世界钟对账。比较只**委托** storyclock.audit，不另立第二份口径。 */
  function reconcile(opts, pre) {
    const st = (pre && typeof pre === 'object') ? pre : storyTime(opts);
    if (!st.known) return { known: false, reason: st.reason, why: st.why || '', scanned: st.scanned || 0 };
    const wl = safe(clockLabel, '');
    if (!wl) return { known: false, reason: 'no-calendar', label: st.label, why: '世界钟未设定——两个空值相等不构成证据' };
    let au = null;
    try { au = WA.storyclock.audit(st.label); } catch (e) { au = null; }
    if (!au || au.ok !== true) return { known: false, reason: (au && au.reason) || 'audit-failed', label: st.label, clock: wl };
    return { known: true, same: au.same === true, drift: au.same !== true, label: st.label, clock: wl };
  }
  /** 三栏：世界钟 / 正文时间 / 真实活动。 */
  function read(opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled', rows: [] };
    const world = safe(function () { return WA.clock && WA.clock.now ? String(WA.clock.now('timeLedger')) : ''; }, '');
    const worldLabel = safe(clockLabel, '');
    const st = storyTime(opts);
    const rc = reconcile(opts, st);
    const real = safe(function () { return WA.playtime && WA.playtime.lastActive ? Number(WA.playtime.lastActive()) : 0; }, 0);
    stat.reads++;
    return { ok: true, rows: [
      { name: '世界钟', value: worldLabel || world || 'unknown', why: worldLabel ? '' : (world ? '' : 'calendar 没设过标签') },
      { name: '正文时间', value: st.known ? st.label : 'unknown', why: st.known ? '' : (st.why || st.reason) },
      { name: '真实活动', value: real ? new Date(real).toISOString() : 'unknown', why: real ? '' : 'playtime 无记录' }
    ], story: st, reconcile: rc,
      hints: safe(function () { return WA.storyclock && WA.storyclock.discipline ? String(WA.storyclock.discipline()) : ''; }, ''),
      round: round() };
  }
  /** 离线跳跃说明：跨了多久、发生几件事、你错过了什么。 */
  function jump(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const rounds = Number.isFinite(s.rounds) ? Math.max(0, Number(s.rounds)) : 0;
    const events = Number.isFinite(s.events) ? Math.max(0, Number(s.events)) : 0;
    const missed = Array.isArray(s.missed) ? s.missed.map(function (x) { return clean(x, 50); }).filter(Boolean) : [];
    if (!rounds) { stat.refused++; stat.lastReason = 'missing-rounds'; return { ok: false, reason: 'missing-rounds' }; }
    stat.jumps++;
    return { ok: true, reason: 'jump-noted', rounds: rounds, events: events,
      text: '你离开了约 ' + rounds + ' 轮，这期间世界走了 ' + events + ' 件事'
        + (missed.length ? '；错过了：' + missed.slice(0, 3).join('、') : '') };
  }
  /** 节令：世界钟标签是唯一真源（calendar.setClock 写的 store.clock.label 就含「第N日·时段」）。 */
  function season() {
    const label = safe(clockLabel, '');
    // v2.529.0: 此处曾读 `chrono.phase()`——chrono 没有 phase（它的 layer() 是变更层，不是时段）。
    //   时段本来就在 label 的「·」后缀里，另造一个 phase 只会多出第二份口径，故不造。
    if (!label) return { ok: true, known: false, reason: 'no-calendar' };
    return { ok: true, known: true, label: label };
  }
  /** 期限压迫：agenda.upcoming 里最近的一条。 */
  function deadline() {
    const rows = safe(function () { return WA.agenda && WA.agenda.upcoming ? WA.agenda.upcoming({ limit: 6 }) : null; }, null);
    const list = rows && Array.isArray(rows.items) ? rows.items : (Array.isArray(rows) ? rows : []);
    const near = list.filter(function (x) { return x && Number.isFinite(x.inRounds) && x.inRounds <= 2; });
    return { ok: true, near: near, all: list.length,
      reason: near.length ? 'pressure' : (list.length ? 'later' : 'nothing') };
  }
  /** 旧闻过期：worldFacts 里超过阈值的条目不再进正文。 */
  function stale(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const limit = Number.isFinite(s.staleRounds) ? Number(s.staleRounds) : cfg.staleRounds;
    const r = round();
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const facts = Array.isArray(d.worldFacts) ? d.worldFacts : [];
    const old = facts.filter(function (f) { return f && Number.isFinite(f.round) && (r - f.round) > limit; });
    return { ok: true, staleCount: old.length, total: facts.length, limit: limit,
      items: old.slice(-3).map(function (f) { return clean(f.key, 30) + '：' + clean(f.value, 40); }) };
  }
  function deviation(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    // v2.529.0: 此处曾读 `storyclock.roundOf()` —— 该成员不存在（storyclock 只给「第N日·时段」
    //   这种绝对坐标，readLatest/parseStamp，**不给轮次映射**），于是本函数永远走「判不了」分支。
    //   轮与日单位不同，不臆造换算：改由调用方显式传 spec.storyRound，没传就如实说判不了。
    const storyRound = Number.isFinite(s.storyRound) ? Number(s.storyRound) : NaN;
    const r = round();
    if (!Number.isFinite(storyRound)) return { ok: true, known: false, reason: 'no-story-round' };
    const dev = Math.abs(r - storyRound);
    return { ok: true, known: true, deviation: dev, warn: dev > cfg.devWarnRounds,
      reason: dev > cfg.devWarnRounds ? 'drift' : 'in-sync' };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const dv = deviation();
    const dl = deadline();
    const lines = [];
    if (dv.ok && dv.known && dv.warn) lines.push('- 正文时间与世界钟差了 ' + dv.deviation + ' 轮（别把日子写飞）');
    // v2.542.18：正文锚点 ⇄ 世界钟**真**对账。此前本块只有 deviation()，而它必须由调用方传
    //   spec.storyRound —— buildBlock() 从不传，于是「差了几轮」那句在整条注入链上**从未可能触发**
    //   （恒 no-story-round）。改由 storyclock 的真锚点直接对账；读不到就不编。
    const rc = reconcile();
    if (rc.known && rc.drift) {
      lines.push('- 正文时间锚点写着「' + clean(rc.label, 24) + '」，世界钟是「' + clean(rc.clock, 24)
        + '」—— 两处不一致，先把日子对齐再往下写');
    } else if (!rc.known && rc.reason === 'no-stamp') {
      lines.push('- 正文里还没有时间标签（扫了 ' + (rc.scanned || 0) + ' 层）：这一楼再写下去就没有绝对时间坐标了'
        + '，不要用「次日／三天后」代替');
    }
    (dl.near || []).slice(0, 2).forEach(function (x) {
      lines.push('- 快到期限：' + clean(x.title || x.name, 40) + '（还 ' + x.inRounds + ' 轮）');
    });
    return lines.length ? '[时间与期限]\n' + lines.join('\n') : '';
  }
  WA.timeLedger = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    read: read, jump: jump, season: season, deadline: deadline, stale: stale, deviation: deviation,
    buildBlock: buildBlock, stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/time-ledger.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/time-ledger 已加载（' + VERSION + '）');
})();