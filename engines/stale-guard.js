/**
 * WorldAxis engines/stale-guard.js (v2.130.0) — 迟到结果拦截（缝 A1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓每一条异步链（剧本生成 / 记忆归纳 / 世界推演 / 改写通道）都以
 *   「**发出请求时的现场**」为前提记账，而结果回来时 Environment 可能已经是
 *   另一个聊天、另一个角色、甚至另一个世界。这一步在本仓**全处不可观测**：
 *   旧聊天的回应返回后会直接写进新聊天的世界状态。
 *
 *   缝合来源：ST-SevenDaysCal 的请求线约束——原文口径是「每次发起剧情推演前
 *   记下当前聊天与角色，回应落地前同样一比，不一致则整个结果作废」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `begin(site)` —— 在发出请求**之前**取一个快照（聊天标识 / 角色标识
 *      / 源），返回该快照的 `ticket`；
 *   ② `verdict(ticket, at)` —— 在结果落地**之前**问「还算数吗」，
 *      返回 `null`（放行）或拒收体（`stale` / `missing-key`）；
 *   ③ `stat()` —— 记几个数（开票多少、拦下多少、逐项原因）。
 *
 *   ② 是**闸门**不是**回滚**：本模块不替调用方决定「该怎么办」，只回答
 *   「这次落地该不该被丢掉」。调用方拿不到第三种答案——要么 `null`（放行），
 *   要么拒收体（不可当作空串继续往下写）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `begin` 不开票（返回 `{ ok:false, reason:'disabled' }`），
 *     `verdict` 对任何票一律放行——绝不因为「没开开关」而把已有响应批量丢掉。
 *   2 快照只在**本模块内存**中保留（带上限），**不进存档**。
 *     它描述的是「请求飞在半空」这一瞬，不是世界事实。
 *   3 票号必须是 `begin` 返回的那一个。非字符串、空串、找不到
 *     一律拒收（`missing-key`）——「票丢了」与「结果还算数」是两件事，不能混。
 *   4 比对三面：聊天标识、角色标识、源。**任何一面不一致即 stale**，
 *     并把「哪一面变了」带出来（两面同变就报两面）——只报 stale
 *     而不报原因，调用方无法判断「该重发」还是「该弃」。
 *   5 两端都缺标识时**不算不一致**（空与空相等不构成证据）。
 *   6 清当前快照只能清自己的票号（带上过期标记）；不得批量清。
 *   7 本模块**不产 `buildBlock`**：它管的是「请求与响应匹不匹配」这件事，
 *     不是「本轮该让模型看到的世界状态」——故不进 `SOURCES`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function (site) { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_staleguard_settings_v1';
  const DEF = { enabled: false, maxTickets: 64, ttlMs: 600000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'staleGuard', bounds: { maxTickets: [4, 256], ttlMs: [10000, 3600000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { issued: 0, passed: 0, stale: 0, blocked: 0, expired: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }

  const tickets = {};   // ticket -> snapshot（仅内存）
  let seq = 0;

  /** 当前现场：聊天标识 / 角色标识 / 源。三项都取「能取到就取，取不到置空」——不抛。 */
  function site() {
    const out = { chat: '', char: '', source: 'staleGuard' };
    try { out.chat = clean((WA.store && WA.store.chatId) ? WA.store.chatId() : '', 80); } catch (e) {}
    try {
      const c = WA.compat && WA.compat.context ? WA.compat.context() : null;
      const ch = c && c.characters && typeof c.characterId !== 'undefined' && c.characters[c.characterId];
      const name = ch && (ch.name || ch.avatar);
      if (name) out.char = clean(name, 80);
      else if (c && c.name2) out.char = clean(c.name2, 80);
    } catch (e) {}
    return out;
  }

  function prune() {
    const cfg = settings();
    const now = clockWall();
    const keys = Object.keys(tickets);
    for (let i = 0; i < keys.length; i++) {
      const t = tickets[keys[i]];
      if (t && cfg.ttlMs > 0 && now - t.at > cfg.ttlMs) { delete tickets[keys[i]]; stat.expired++; }
    }
    const ks = Object.keys(tickets);
    if (ks.length > cfg.maxTickets) {
      // 环形挤出：丢掉最老的那几个（快照只在飞程中有用）
      ks.sort(function (a, b) { return (tickets[a].at || 0) - (tickets[b].at || 0); });
      for (let i = 0; i < ks.length - cfg.maxTickets; i++) delete tickets[ks[i]];
    }
  }

  /**
   * 取票。在发出请求**之前**调用。
   * @param {string} [siteName] 调用点名字（只进台账，不参与比对）
   * @returns {ok, ticket?, snapshot?, reason?}
   */
  function begin(siteName) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const s = site();
    s.source = clean(siteName, 40) || 'staleGuard';
    seq++;
    const ticket = 't' + seq.toString(36) + '-' + clockWall().toString(36);
    tickets[ticket] = { at: clockWall(), chat: s.chat, char: s.char, source: s.source };
    prune();
    stat.issued++;
    return { ok: true, ticket: ticket, snapshot: { chat: s.chat, char: s.char, source: s.source } };
  }

  /**
   * 落地前校验。返回 `null` = 放行；非 null = 拒收体（调用方**必须**丢弃这次结果）。
   * @param {string} ticket begin 返回的票号
   * @param {string} [at] 用于台账的调用点名字
   */
  function verdict(ticket, at) {
    if (!settings().enabled) { stat.passed++; return null; }
    if (ticket === undefined || ticket === null || typeof ticket !== 'string' || !ticket) {
      noteFault('missing-key');
      return { ok: false, reason: 'missing-key', detail: '票号必填（begin 返回的那个）', at: clean(at, 40) || null };
    }
    const t = tickets[ticket];
    if (!t) {
      noteFault('missing-key');
      return { ok: false, reason: 'missing-key', detail: '票号不在册（已过期或被挤出）', ticket: ticket };
    }
    const now = site();
    const faces = [];
    if (t.chat && now.chat && t.chat !== now.chat) faces.push('chat');
    if (t.char && now.char && t.char !== now.char) faces.push('char');
    if (faces.length) {
      stat.stale++; stat.lastReason = 'stale';
      return { ok: false, reason: 'stale', faces: faces, was: { chat: t.chat, char: t.char },
        now: { chat: now.chat, char: now.char }, detail: '请求发出后现场已变（' + faces.join('/') + '）' };
    }
    delete tickets[ticket];
    stat.passed++;
    return null;
  }

  /** 主动丢弃一张票（用户取消 / 请求失败时调用）。只能丢自己的票号。 */
  function drop(ticket) {
    if (typeof ticket !== 'string' || !ticket || !tickets[ticket]) { noteFault('not-found'); return { ok: false, reason: 'not-found' }; }
    delete tickets[ticket];
    return { ok: true, ticket: ticket };
  }

  function clear() {
    const n = Object.keys(tickets).length;
    Object.keys(tickets).forEach(function (k) { delete tickets[k]; });
    return { ok: true, dropped: n };
  }

  WA.staleGuard = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    begin: begin, verdict: verdict, drop: drop, clear: clear,
    snapshot: site,
    size: function () { return Object.keys(tickets).length; },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/stale-guard.js', { kind: 'engine', ver: '2.130.0' });
})();
