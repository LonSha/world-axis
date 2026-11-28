/**
 * WorldAxis engines/letter-post.js (v2.524.0) — EXV28-32
 *   信：会迟到、会丢、会被截、收到之后能回
 *
 * ── 它治的病 ─────────────────────────────────────────────────────────
 *   此前「托人带句话」在推演里只有一种结局：**立刻知道**。
 *   于是距离不重要、路上不重要、半路被谁看见也不重要 —— 而这恰恰是
 *   古旧世界里信息最真实的样子：它会晚、会丢、会落到不该落的人手里。
 *
 * ── 三条硬纪律 ───────────────────────────────────────────────────────
 *   ① 发信只写「在途」：到达轮次由距离算出，写进存档；不假装已送到。
 *   ② 判送到必须给裁决（`arrived` / `lost` / `intercepted`）：**不掷骰**，
 *      丢与被截都是调用方给的剧情事实；到早了就 `too-early`。
 *   ③ 回信只对「已收到」成立：没收到就 `not-received`，不凭空回。
 *
 * ── 落点 ─────────────────────────────────────────────────────────────
 *   复用 `chronicle`（`kind:'letter'`），与 trace/interlude/hearsay 同容器不同 kind。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_letter_settings_v1';
  const DEF = { enabled: true, maxOpen: 6, defaultDelay: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'letterPost',
    bounds: { maxOpen: [1, 20], defaultDelay: [1, 20] } };
  const stat = { sent: 0, delivered: 0, lost: 0, replied: 0, refused: 0, lastReason: '' };
  const VERDICTS = ['arrived', 'lost', 'intercepted'];
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('letterPost'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function rows() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return Array.isArray(d.chronicle) ? d.chronicle : [];
  }
  function all() { return rows().filter(function (x) { return x && x.kind === 'letter'; }); }
  function find(id) { return all().filter(function (x) { return x.id === id; })[0] || null; }

  function send(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const from = clean(s.from || s.who, 40);
    const to = clean(s.to, 40);
    const content = clean(s.content || s.what, 140);
    if (!from) { stat.refused++; stat.lastReason = 'missing-from'; return { ok: false, reason: 'missing-from' }; }
    if (!to) { stat.refused++; stat.lastReason = 'missing-to'; return { ok: false, reason: 'missing-to' }; }
    if (!content) { stat.refused++; stat.lastReason = 'missing-content'; return { ok: false, reason: 'missing-content' }; }
    const delay = Number.isFinite(s.delay) ? Math.max(1, Math.min(60, Number(s.delay))) : cfg.defaultDelay;
    const open = all().filter(function (x) { return !x.verdict; });
    if (open.length >= cfg.maxOpen) { stat.refused++; stat.lastReason = 'too-many-open'; return { ok: false, reason: 'too-many-open', open: open.length }; }
    const r = round();
    const row = { id: 'lt_' + r + '_' + (stat.sent + 1), kind: 'letter', from: from, to: to,
      content: content, sentRound: r, arriveRound: r + delay, at: now(), verdict: '', repliedAt: 0 };
    let tx;
    try {
      if (WA.store && WA.store.transact) {
        tx = WA.store.transact(function (d) {
          d.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];
          let n = stat.sent + 1;
          while (d.chronicle.some(function (x) { return x && x.id === row.id; })) row.id = 'lt_' + r + '_' + (++n);
          d.chronicle.push(row);
          return true;
        }, 'letter:send');
      }
    } catch (e) { tx = null; }
    if (!tx || !tx.ok) return { ok: false, reason: 'write-failed' };
    stat.sent++;
    return { ok: true, reason: 'sent', id: row.id, arriveRound: row.arriveRound, deferred: !!tx.deferred, persisted: tx.persisted,
      note: '信在路上：' + delay + ' 轮后才可能到手' };
  }

  /** 判送到：裁决由调用方给（不掷骰）；没到就 too-early。 */
  function deliver(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = clean(s.id, 40);
    if (!id) return { ok: false, reason: 'missing-id' };
    const it = find(id);
    if (!it) return { ok: false, reason: 'letter-missing' };
    // v2.529.0：原来这里复用 'already-arrived' —— 与 freight.arrive 的死码撞名
    //   （freight 那条已被 v2780 死表登记为**不可达**：要 prior dispatch + arrive 才走到，
    //   而该组合在真产品面里跑不出来）。同一个码名不能既可达又不可达（v2780 [B] 死表与
    //   见证表不相交当场报出来），故本引擎改用自有码名：说的是「这封信已经判过送到没送到了」，
    //   与「货已到站」区分开。
    if (it.verdict) { stat.refused++; stat.lastReason = 'already-judged'; return { ok: false, reason: 'already-judged', verdict: it.verdict }; }
    const r = Number.isFinite(s.atRound) ? Number(s.atRound) : round();
    if (r < it.arriveRound) {
      stat.refused++; stat.lastReason = 'too-early';
      return { ok: false, reason: 'too-early', arriveRound: it.arriveRound, atRound: r };
    }
    const v = VERDICTS.indexOf(String(s.verdict || '')) >= 0 ? String(s.verdict) : 'arrived';
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          (Array.isArray(d.chronicle) ? d.chronicle : []).forEach(function (x) {
            if (x && x.kind === 'letter' && x.id === id) {
              x.verdict = v; x.verdictRound = r; x.verdictAt = now();
              x.interceptedBy = v === 'intercepted' ? clean(s.by, 40) : ''; ok = true;
            }
          });
          return true;
        }, 'letter:deliver');
      }
    } catch (e) { ok = false; }
    if (!ok) return { ok: false, reason: 'write-failed' };
    if (v === 'arrived') stat.delivered++;
    else if (v === 'lost') stat.lost++;
    return { ok: true, reason: v, id: id,
      text: v === 'arrived' ? it.to + '收到了这封信'
        : (v === 'lost' ? '这封信没有送到：路上丢了' : '这封信落在了别人手里') };
  }

  /** 回信：只对「已收到」成立。 */
  function reply(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = clean(s.id, 40);
    const text = clean(s.text || s.content, 140);
    if (!id) return { ok: false, reason: 'missing-id' };
    if (!text) { stat.refused++; stat.lastReason = 'missing-text'; return { ok: false, reason: 'missing-text' }; }
    const it = find(id);
    if (!it) return { ok: false, reason: 'letter-missing' };
    if (it.verdict !== 'arrived') {
      stat.refused++; stat.lastReason = 'not-received';
      return { ok: false, reason: 'not-received', verdict: it.verdict || 'in-transit' };
    }
    if (it.repliedAt) { stat.refused++; stat.lastReason = 'already-replied'; return { ok: false, reason: 'already-replied' }; }
    let ok = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          (Array.isArray(d.chronicle) ? d.chronicle : []).forEach(function (x) {
            if (x && x.kind === 'letter' && x.id === id) { x.repliedAt = now(); x.replyText = text; ok = true; }
          });
          return true;
        }, 'letter:reply');
      }
    } catch (e) { ok = false; }
    if (!ok) return { ok: false, reason: 'write-failed' };
    stat.replied++;
    return { ok: true, reason: 'replied', id: id };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = round();
    const lines = [];
    all().filter(function (x) { return !x.verdict; }).slice(-3).forEach(function (x) {
      const left = Math.max(0, (x.arriveRound || r) - r);
      lines.push('- 一封给' + clean(x.to, 16) + '的信在路上（还要 ' + left + ' 轮才可能到）');
    });
    all().filter(function (x) { return x.verdict === 'intercepted'; }).slice(-2).forEach(function (x) {
      lines.push('- 有人拆过一封给' + clean(x.to, 16) + '的信（' + clean(x.interceptedBy, 16) + '）');
    });
    return lines.length ? '[信]\n' + lines.join('\n') : '';
  }
  function view() {
    const list = all();
    return { enabled: settings().enabled, total: list.length,
      inTransit: list.filter(function (x) { return !x.verdict; }).length,
      lost: list.filter(function (x) { return x.verdict === 'lost'; }).length,
      intercepted: list.filter(function (x) { return x.verdict === 'intercepted'; }).length,
      stat: stat, block: buildBlock() };
  }

  WA.letterPost = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    send: send, deliver: deliver, reply: reply, view: view, buildBlock: buildBlock,
    VERDICTS: VERDICTS.slice(),
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/letter-post.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/letter-post 已加载（' + VERSION + '）');
})();