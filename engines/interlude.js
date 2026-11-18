/**
 * WorldAxis engines/interlude.js (v2.524.0) — EXV28-31
 *   插曲：镜头切走再切回 —— 那一段里发生的事，你不在场
 *
 * ── 它治的病 ─────────────────────────────────────────────────────────
 *   玩家退场之后，正文要么「什么都不写」，要么直接跳过去 —— 而用户要的是
 *   **镜头切走**：别人在别处过了一段。可一旦让模型写这一段，最容易出的错是
 *   **知识越界**：插曲里的人说出了他不可能知道的事（玩家的私话、密室里的对话、
 *   还没传到的消息）。本仓此前没有任何地方记着「这一段里的人知道哪些事」。
 *
 * ── 三条硬纪律 ───────────────────────────────────────────────────────
 *   ① 开戏先声明「这场里的人知道哪些事」（`knows`）：不声明就不许写第一句。
 *   ② 每句都要报它引用了哪些事实（`facts`）：有一条不在 `knows` 里就 `leak`，
 *      并**指出是哪一条**（防「反正模型说他知道」）。
 *   ③ 收戏必须给出「读者**不知道**什么」：不许把插曲里的隐情顺手变成玩家已知。
 *
 * ── 落点 ─────────────────────────────────────────────────────────────
 *   复用 `chronicle`（`kind:'interlude'`），与 trace-post / hearsay 同容器不同 kind。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_interlude_settings_v1';
  const DEF = { enabled: true, maxLines: 12, maxOpen: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'interlude',
    bounds: { maxLines: [2, 40], maxOpen: [1, 8] } };
  const stat = { opened: 0, lines: 0, closed: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('interlude'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function rows() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return Array.isArray(d.chronicle) ? d.chronicle : [];
  }
  function all() { return rows().filter(function (x) { return x && x.kind === 'interlude'; }); }
  function find(id) { return all().filter(function (x) { return x.id === id; })[0] || null; }

  function open(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const scene = clean(s.scene, 110);
    if (!scene) { stat.refused++; stat.lastReason = 'missing-scene'; return { ok: false, reason: 'missing-scene' }; }
    const who = Array.isArray(s.who) ? s.who.map(function (x) { return clean(x, 30); }).filter(Boolean).slice(0, 6) : [];
    const knows = Array.isArray(s.knows) ? s.knows.map(function (x) { return clean(x, 40); }).filter(Boolean).slice(0, 24) : [];
    if (!who.length) { stat.refused++; stat.lastReason = 'missing-cast'; return { ok: false, reason: 'missing-cast', note: '插曲里总得有人：谁在这一段里' }; }
    if (!knows.length) { stat.refused++; stat.lastReason = 'missing-knows'; return { ok: false, reason: 'missing-knows', note: '先声明这场里的人知道哪些事，否则第一句就可能越界' }; }
    const live = all().filter(function (x) { return !x.closedAt; });
    if (live.length >= cfg.maxOpen) { stat.refused++; stat.lastReason = 'too-many-open'; return { ok: false, reason: 'too-many-open', open: live.length }; }
    const row = { id: 'il_' + round() + '_' + (stat.opened + 1), kind: 'interlude', scene: scene,
      place: clean(s.place, 40), who: who, knows: knows, lines: [], openedRound: round(), at: now(), closedAt: 0 };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];
          d.chronicle.push(row);
          return true;
        }, 'interlude:open');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.opened++;
    return { ok: true, reason: wrote ? 'opened' : 'opened-no-store', id: row.id, who: who };
  }

  /** 写一句：句子里引用的事实必须在这场的 `knows` 里，否则越界。 */
  function line(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = clean(s.id, 40);
    const text = clean(s.text, 140);
    if (!id) return { ok: false, reason: 'missing-id' };
    if (!text) { stat.refused++; stat.lastReason = 'missing-text'; return { ok: false, reason: 'missing-text' }; }
    const it = find(id);
    if (!it) return { ok: false, reason: 'interlude-missing' };
    if (it.closedAt) { stat.refused++; stat.lastReason = 'already-closed'; return { ok: false, reason: 'already-closed' }; }
    if (it.lines.length >= cfg.maxLines) { stat.refused++; stat.lastReason = 'lines-full'; return { ok: false, reason: 'lines-full' }; }
    const facts = Array.isArray(s.facts) ? s.facts.map(function (x) { return clean(x, 40); }).filter(Boolean) : [];
    const bad = facts.filter(function (f) { return it.knows.indexOf(f) < 0; });
    if (bad.length) {
      stat.refused++; stat.lastReason = 'leak';
      return { ok: false, reason: 'leak', facts: bad,
        note: '这一句引用了这场里没人知道的事：要么删掉它，要么先把这条消息送到他们手上' };
    }
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          (Array.isArray(d.chronicle) ? d.chronicle : []).forEach(function (x) {
            if (x && x.kind === 'interlude' && x.id === id) { x.lines.push({ text: text, facts: facts, at: now() }); ok = true; }
          });
          return true;
        }, 'interlude:line');
      }
    } catch (e) { ok = false; }
    if (!ok) return { ok: false, reason: 'write-failed' };
    stat.lines++;
    return { ok: true, reason: 'lined', id: id, n: it.lines.length + 1 };
  }

  /** 收戏：切回来时必须说清「这一段里读者不知道什么」。 */
  function close(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = clean(s.id, 40);
    if (!id) return { ok: false, reason: 'missing-id' };
    const it = find(id);
    if (!it) return { ok: false, reason: 'interlude-missing' };
    if (it.closedAt) { stat.refused++; stat.lastReason = 'already-closed'; return { ok: false, reason: 'already-closed' }; }
    if (!it.lines.length) { stat.refused++; stat.lastReason = 'empty-interlude'; return { ok: false, reason: 'empty-interlude', note: '一句都没写的插曲不算发生过' }; }
    const hidden = it.lines.length;
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          (Array.isArray(d.chronicle) ? d.chronicle : []).forEach(function (x) {
            if (x && x.kind === 'interlude' && x.id === id) { x.closedAt = now(); x.closedRound = round(); ok = true; }
          });
          return true;
        }, 'interlude:close');
      }
    } catch (e) { ok = false; }
    if (!ok) return { ok: false, reason: 'write-failed' };
    stat.closed++;
    return { ok: true, reason: 'closed', id: id, lines: hidden,
      unknown: '你不在场：那 ' + hidden + ' 句里的事你都不知道，除非有人告诉你' };
  }

  /** 可读摘要（注入块）：只给最近一场收了的插曲的「你不知道」一条。 */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const done = all().filter(function (x) { return x.closedAt && x.lines.length; }).slice(-2);
    if (!done.length) return '';
    return '[镜头之外]\n' + done.map(function (x) {
      const who = (x.who || []).slice(0, 3).join('、');
      return '- ' + (x.place ? '在' + clean(x.place, 16) + '，' : '') + who + '过了 ' + x.lines.length + ' 个来回：'
        + clean((x.lines[x.lines.length - 1] || {}).text, 40) + '（这些你都不在场）';
    }).join('\n');
  }
  function view() {
    const list = all();
    return { enabled: settings().enabled, total: list.length,
      open: list.filter(function (x) { return !x.closedAt; }).length,
      lines: list.reduce(function (n, x) { return n + (x.lines || []).length; }, 0),
      stat: stat, block: buildBlock() };
  }

  WA.interlude = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    open: open, line: line, close: close, view: view, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/interlude.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/interlude 已加载（' + VERSION + '）');
})();