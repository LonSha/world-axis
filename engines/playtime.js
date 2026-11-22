/**
 * WorldAxis engines/playtime.js (v2.156.0) — 时间来源与游玩生命周期（SP1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓有三个「时间」在各自流动，而没有任何一处能把它们的**界限**说清楚：
 *     · **真实时间**（墙钟）——玩家实际离开过多久；
 *     · **决策时间**（`core/clock.js` 的 `now(site)`）——冻结后可复现的推演时间；
 *     · **剧情时间**（`store.clock.label`，正文里写出的「第 3 日·清晨」）。
 *   三种时间此前**没有任何取用表**：谁该读哪一种、读到缺的时候该拒算还是该顶替，
 *   全靠调用者自行判断。现场后果有两类，都是静默的：
 *     ① **剧情跳日被当成真实离线**：模型的正文写「三日后」，而某些计时逻辑据此
 *        把「你离开了三天」当成事实——真实世界里玩家可能只隔了一次刷新；
 *     ② **真实离开被当成剧情推进**：玩家一周没来，回来时没有任何东西记得
 *        「上次有效活动是什么时候」——「不知道你走了多久」与「你走了零秒」
 *        在读数上长得一模一样（同 region 的 X3 纪律）。
 *   一句话：**没有一份每聊天的「真实活动基准」，也没有一张说清「哪种时间从哪取」的表。**
 *
 * ── 本模块落点（三件东西，一件都不多）────────────────────────
 *   · `sources()`   —— 时间取用表：四种时间各自的读法、用途、是否写盘，逐行写明。
 *   · `touch(opts)` —— 更新**当前聊天**的真实活动基准（节流；只写本模块自己的键）。
 *   · `lastActive()`—— 读回基准（**读取不改基准**：「先读取上一份有效活动基准再决定恢复」
 *                      是离线恢复编排（S1）的前置纪律，本模块提供「读」与「写」两个分开的口）。
 *   另有 `story()` —— 剧情时间读数：**缺失或歧义时报 `no-clock`，绝不拿真实时间顶替**。
 *
 * ── 与既有模块的分工（关键：不重叠、不替代）──────────────────
 *   · `core/clock.js`      —— 决策/测量两分的**原语**。本模块不重复实现它，
 *                             取用表里如实指向 `clock.now / clock.wallNow`。
 *   · `engines/storyclock.js` —— 正文锚点（SDC 标签）的对账面。本模块的 `story()`
 *                             读的是世界钟标签本身；两者的分工在取用表里写明。
 *   · `engines/offline-tick.js` —— 跨会话结算的**批次账与锚保护**。本模块只提供
 *                             「上次有效活动在什么时候」这一条输入；结算与否不归它管。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**开**：本模块**不写世界状态**（唯一的写动作是它自己的 localStorage 键），
 *     且**没有任何主动写入者**——没有调用方时零写入。「默认开」的成本因此是零；
 *     关闭它影响的是「被调用时是否拒收」（`disabled`）。
 *   2 **不进世界存档**：活动基准是**进程侧记忆**（同 life 的跨会话游标），
 *     不是世界事实。进 store 会让「导出/导入世界」连带搬走一份会过期的第二真源。
 *   3 **读取不改基准**：`lastActive()` 纯读；只有 `touch()` 会推进。恢复编排必须先读后写，
 *     否则刷新基准会把离线间隔抹掉（S1 的验收场景之一）。
 *   4 **剧情时间缺失即拒算**：`story()` 在世界钟未设定时返回 `no-clock`——
 *     「不猜日期」是硬条件（同 region「无距离不传播」）。
 *   5 **有界**：每聊天一条记录、总聊天数有上限（`maxChats`），挤出最旧者并计数。
 *   6 **读失败留痕**：本键读不出来时投 `store.reportReadFail`——
 *     「读不到」最坏的形态是被当成「没有基准」（与 chatcache / life 游标同一出口）。
 *
 * ── 键的归类（为什么单列一个家族）────────────────────────────
 *   本键 `worldaxis_playtime_v1` **不是设置**（不进 settings 家族）、
 *   也不是存档本体（不进 state 家族）。与 life 游标键（v2.132.0 的 `lifeTurn` 家族）
 *   同一裁决：单列是为了不让它污染既有计数面（`families.settingsUnregistered` 是
 *   面板与断言都读的读数，不得被新键悄悄加一）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.156.0: 时间源守卫与全仓同形（G20 只认这一种：守卫与 fallback 同行共现）。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_playtime_settings_v1';
  const DEF = {
    enabled: true,
    updateMinMs: 60000,   // 活动基准的最小更新间隔（有界频率：不是每轮都写盘）
    maxChats: 32          // 每聊天一条记录的总上限（环形挤出最旧）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'playtime',
    bounds: { updateMinMs: [1000, 3600000], maxChats: [1, 128] } };
  // 数据键：**不进 settings 登记表**（它不是设置，见头注「键的归类」）。
  const DATA_KEY = 'worldaxis_playtime_v1';
  const DATA_VER = 1;

  const stat = { touches: 0, throttled: 0, reads: 0, readFails: 0, writeFails: 0, pruned: 0,
    lastActiveAt: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.lastReason = reason; }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function win() { return WA.mainWin || (typeof window !== 'undefined' ? window : null); }
  function curChatId() {
    try { return WA.store && WA.store.chatId ? String(WA.store.chatId()) : 'wa_default'; } catch (e) { return 'wa_default'; }
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }

  /**
   * 读回点（全文件唯一一处 `getItem`）。
   *   读失败**不当作「没有基准」**——投 reportReadFail 让「存储故障」与「正常开局」
   *   在诊断面上可分（G16 冻结清单里的这一处由此新增）。
   *   解析失败（JSON 坏）同样归因，返回 null（当作无基准，但留痕）。
   */
  function readData() {
    const w = win(); if (!w || !w.localStorage) return null;
    let raw = null;
    try { raw = w.localStorage.getItem(DATA_KEY); }
    catch (eR) {
      stat.readFails++;
      try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('playtime', DATA_KEY, eR); } catch (e2) {}
      return null;
    }
    if (!raw) return null;
    try {
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object' || typeof d.chats !== 'object' || !d.chats) return null;
      return d;
    } catch (eP) {
      stat.readFails++;
      try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('playtime', DATA_KEY, eP); } catch (e3) {}
      return null;
    }
  }
  function writeData(d) {
    const w = win(); if (!w || !w.localStorage) return { ok: false, reason: 'no-localStorage' };
    try {
      w.localStorage.setItem(DATA_KEY, JSON.stringify(d));
      return { ok: true };
    } catch (e) { stat.writeFails++; return { ok: false, reason: 'write-failed' }; }
  }
  /** 有界：每聊天一条记录、总聊天数有上限。挤出最旧者（按 lastActiveAt 升序）。 */
  function prune(d, maxChats) {
    const ids = Object.keys(d.chats || {});
    if (ids.length <= maxChats) return;
    ids.sort(function (a, b) { return (d.chats[a].lastActiveAt || 0) - (d.chats[b].lastActiveAt || 0); });
    while (ids.length > maxChats) { delete d.chats[ids.shift()]; stat.pruned++; }
  }

  /**
   * 时间取用表 —— **四种时间的唯一说明面**。
   *   为什么必须是一张可读的表而不是散在注释里：调用者面对「该用哪个时间」时，
   *   此前只能通读 core/clock 与各模块头注；表把「读法 / 用途 / 是否写盘」一次说清，
   *   并且它就是本模块的存在理由（SP1 的拟交付物之一）。
   */
  function sources() {
    return [
      { name: 'wall', use: '测量时间：耗时统计 / 内存台账 / 渲染展示。不参与判定，不受冻结影响。',
        api: 'clock.wallNow()', writes: false },
      { name: 'decision', use: '决策时间：凡要写进存档或参与判定的时间读取。回放冻结的是这一条。',
        api: 'clock.now(site)', writes: false },
      { name: 'story', use: '剧情时间：正文世界钟标签（store.clock.label / dayIndex）。缺失或歧义时拒算——不以真实时间顶替。',
        api: 'playtime.story()', writes: false },
      { name: 'activity', use: '真实活动时间：每聊天「上次有效活动」基准。只写本模块自己的键，不进世界存档。',
        api: 'playtime.touch() / playtime.lastActive()', writes: true }
    ];
  }

  /**
   * 剧情时间读数。**缺失即拒算**（`no-clock`）：世界钟没设定时，这里不返回
   *   「大概是今天」这类猜测——「不猜日期」与 region「无距离不传播」同一口径。
   *   为什么不由本模块写世界钟：世界钟的写方是 calendar / 用户（`setClock`），
   *   本模块只读；两个写方会让「世界钟是谁定的」失去答案。
   */
  function story() {
    let label = '', dayIndex = null, src = '';
    try {
      const st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
      const c = (st && st.clock) || {};
      label = String(c.label || '').trim();
      dayIndex = (typeof c.dayIndex === 'number') ? c.dayIndex : null;
      src = String(c.source || '');
    } catch (e) { label = ''; }
    if (!label) {
      noteFault('no-clock');
      return { ok: false, reason: 'no-clock', note: '世界钟未设定：剧情时间缺失时拒算，不猜日期' };
    }
    return { ok: true, label: label, dayIndex: dayIndex, source: src };
  }

  /**
   * 更新当前聊天的真实活动基准。**节流**（`updateMinMs`）：有界频率，
   *   不是每次调用都写盘（本键的写成本要可预算）。
   *   `opts.force` 绕过节流（显式动作：面板「更新基准」按钮）。
   *   为什么写「基准」而不是「时长」：时长是派生量，基准是事实量——
   *   把「你离开了多久」存下来，下一次读数会把它当成第二真源（同 TURN_KEY 的裁决）。
   */
  function touch(opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const now = clockWall();
    const cid = curChatId();
    const d = readData() || { v: DATA_VER, chats: {} };
    if (!d.chats || typeof d.chats !== 'object') d.chats = {};
    const prev = d.chats[cid] || null;
    if (!o.force && prev && isFinite(prev.lastActiveAt) && (now - prev.lastActiveAt) < cfg.updateMinMs) {
      stat.throttled++;
      stat.lastReason = 'throttled';
      return { ok: true, updated: false, throttled: true, at: prev.lastActiveAt, chatId: cid };
    }
    const row = prev ? prev : { firstAt: now, updates: 0 };
    row.lastActiveAt = now;
    row.updates = (isFinite(row.updates) ? row.updates : 0) + 1;
    row.chatId = cid;
    d.chats[cid] = row;
    d.v = DATA_VER;
    prune(d, cfg.maxChats);
    const w = writeData(d);
    if (!w.ok) {
      stat.writeFails++;
      noteFault('write-failed');
      return { ok: false, reason: 'write-failed', chatId: cid };
    }
    stat.touches++;
    stat.lastActiveAt = now;
    stat.lastReason = 'touched';
    return { ok: true, updated: true, at: now, chatId: cid, updates: row.updates };
  }

  /**
   * 读回基准（**纯读**，不改任何数据）。
   *   `no-baseline` 是如实回答：「这个聊天从来没有过有效活动记录」——
   *   与「读存储失败」（readFails 计数 + reportReadFail）是两件事，分开报。
   */
  function lastActive(chatId) {
    stat.reads++;
    const cid = chatId ? clean(chatId, 96) : curChatId();
    const d = readData();
    const row = (d && d.chats) ? d.chats[cid] : null;
    if (!row || !isFinite(row.lastActiveAt)) {
      stat.lastReason = 'no-baseline';
      return { ok: false, reason: 'no-baseline', chatId: cid };
    }
    // ageMs 用**测量时间**：它是「距离上次活动的时长」这一展示量，不是判定输入
    //   （判定输入是 lastActiveAt 本身；调用方拿到它自己决定怎么算——见取用表）。
    return { ok: true, chatId: cid, at: row.lastActiveAt, ageMs: Math.max(0, clockWall() - row.lastActiveAt),
      updates: isFinite(row.updates) ? row.updates : 0, firstAt: isFinite(row.firstAt) ? row.firstAt : 0 };
  }

  function statOf() {
    const cfg = settings();
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      enabled: !!cfg.enabled,
      updateMinMs: cfg.updateMinMs, maxChats: cfg.maxChats,
      dataKey: DATA_KEY, dataVer: DATA_VER
    });
  }

  WA.playtime = {
    DATA_KEY: DATA_KEY,
    SOURCE_NAMES: ['wall', 'decision', 'story', 'activity'],
    getSettings: settings,
    setSettings: saveSettings,
    sources: sources,
    story: story,
    touch: touch,
    lastActive: lastActive,
    stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/playtime.js', { kind: 'engine', ver: '2.156.0' });
})();
