/**
 * WorldAxis engines/world-brief.js (v2.524.0) — EXV28-33/34/35/36
 *   世界简报：传闻拼图板 / 世界一句话 / 安静的权利 / 世界年表
 *
 * ── 它治的病 ─────────────────────────────────────────────────────
 *   现场四种「只有这套架构做得出、却一直没人做」的事：
 *     ① 碎片散了满仓（`hearsay-ledger` 的 shard 已能落盘），却没有一块**板**把
 *        「已有哪几块 / 缺哪块 / 能问谁」摆在一屏上 —— 玩家只能自己在正文里记；
 *     ② 世界到底怎么了，只有一堆**读数**（`simHealth` / 自转日志），没有一句人话；
 *     ③ 无事发生时系统不敢沉默：要么编一条事件，要么报错 —— 而「今天什么都没发生」
 *        本来就是一个合法结果；
 *     ④ `chronicle` 越滚越厚，却读不成**史**：谁在哪一年做了什么，查不到人。
 *
 * ── 四条硬纪律（每条都有判据咬）─────────────────────────────────
 *   ① 拼图板**不替玩家下结论**：缺块显式写成 `missing`，并点名「能问谁」；
 *      一块都没有时 `no-shards`（不是空板，是没有板）。
 *   ② 一句话必须**能对上读数**：句子里的每个数字都来自 `readings`，
 *      正文与读数同源；一条记录都没有时 `no-readings`（不许空话）。
 *   ③ 安静是**合法结果**：窗口内 0 条新增 ⇒ `quiet:true` + `ok-empty`，不报错、不编事；
 *      有新增则如实给 `added`（不把「有事」说成「没事」）。
 *   ④ 年表**只收已发生且追得到 owner 的条目**：`at` 在未来的 `not-happened`，
 *      没 owner 的 `no-owner`（宁可少一条，不许有一条来路不明）。
 *
 * ── 落点 ─────────────────────────────────────────────────────────
 *   复用 `chronicle`（`kind:'shard'` 由 hearsay 写、`kind:'almanac'` 由本模块写），
 *   与 trace / interlude / letter / hearsay 同容器不同 kind，不新增顶层存档键。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_worldbrief_settings_v1';
  const DEF = { enabled: true, maxRows: 8, quietRounds: 5, minShards: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldBrief',
    bounds: { maxRows: [2, 24], quietRounds: [1, 20], minShards: [1, 6] } };
  const stat = { boards: 0, lines: 0, quiets: 0, almanacs: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('worldBrief'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 90) : ''; }
  function rows() {
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    return Array.isArray(d.chronicle) ? d.chronicle : [];
  }
  function ofKind(k) { return rows().filter(function (x) { return x && x.kind === k; }); }
  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }

  /** EXV28-33：传闻拼图板 —— 缺哪块、能问谁，不替你下结论。 */
  function board(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const only = clean(s.topic, 60);
    const pieces = ofKind('shard').filter(function (x) { return !x.droppedAt; });
    if (!pieces.length) {
      stat.refused++; stat.lastReason = 'no-shards';
      return { ok: false, reason: 'no-shards', hint: '一块碎片都还没有 —— 先去打听，板子才有东西可摆' };
    }
    const topics = {};
    pieces.forEach(function (x) {
      if (only && x.topic !== only) return;
      const t = topics[x.topic] = topics[x.topic] || { topic: x.topic, dims: {}, texts: [], refuted: 0 };
      if (x.dim) t.dims[x.dim] = true;
      if (x.refutes) t.refuted++;
      if (x.text) t.texts.push(x.text);
    });
    if (only && !topics[only]) {
      stat.refused++; stat.lastReason = 'no-shards';
      return { ok: false, reason: 'no-shards', topic: only };
    }
    const askers = {};
    ofKind('hearsay').forEach(function (x) {
      if (!x || !x.topic) return;
      askers[x.topic] = askers[x.topic] || {};
      if (x.listener) askers[x.topic][x.listener] = true;
    });
    const keys = Object.keys(topics).slice(0, cfg.maxRows);
    _lastBoard = keys.map(function (k) {
      const t = topics[k];
      const have = Object.keys(t.dims);
      const need = Math.max(0, cfg.minShards - have.length);
      return { topic: t.topic, have: have, need: need,
        missing: need > 0 ? ('还差 ' + need + ' 块（已有：' + (have.join('、') || '无') + '）') : '',
        canAsk: Object.keys(askers[t.topic] || {}).slice(0, 4),
        refuted: t.refuted, verdict: need > 0 ? 'not-yet' : 'ready' };
    });
    stat.boards++;
    return { ok: true, reason: 'ok', rows: _lastBoard.slice(), count: _lastBoard.length,
      hint: '板子只摆碎片，不替你下结论：缺的那块要自己去问',
      conclude: _lastBoard.filter(function (x) { return x.verdict === 'ready'; }).map(function (x) { return x.topic; }) };
  }
  let _lastBoard = [];

  /** EXV28-34：世界一句话 —— 人话，且每个数字都对得上读数。 */
  function oneLine() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const all = rows();
    if (!all.length) {
      stat.refused++; stat.lastReason = 'no-readings';
      return { ok: false, reason: 'no-readings', hint: '世界还没有任何记录 —— 这句「近况」现在编出来就是假的' };
    }
    const letters = ofKind('letter');
    const shards = ofKind('shard').filter(function (x) { return !x.droppedAt; });
    const almanac = ofKind('almanac');
    const readings = {
      events: all.filter(function (x) { return x && x.kind !== 'shard'; }).length,
      lettersInTransit: letters.filter(function (x) { return !x.verdict; }).length,
      shards: shards.length,
      almanac: almanac.length,
      round: round()
    };
    const bits = [];
    bits.push('世界记下了 ' + readings.events + ' 件事');
    bits.push(readings.lettersInTransit > 0
      ? ('还有 ' + readings.lettersInTransit + ' 封信在路上')
      : '没有信在路上');
    bits.push(readings.shards > 0
      ? (readings.shards + ' 块碎片还没拼上')
      : '没有散着的碎片');
    const line = '最近（第 ' + readings.round + ' 轮）' + bits.join('，') + '。';
    // 自咬：句子里的数字必须都能在 readings 里找到 —— 对不上就是本函数自己说谎
    const nums = (line.match(/\d+/g) || []).map(Number);
    const ok = nums.every(function (n) {
      return n === readings.events || n === readings.lettersInTransit || n === readings.shards || n === readings.round;
    });
    if (!ok) {
      stat.refused++; stat.lastReason = 'no-readings';
      return { ok: false, reason: 'no-readings', hint: '读数与句子对不上（本模块拒绝输出对不上的近况）', readings: readings };
    }
    stat.lines++;
    return { ok: true, reason: 'ok', line: line, readings: readings };
  }

  /** EXV28-35：安静的权利 —— 窗口内 0 条新增是合法结果，不报错、不编事。 */
  function quiet(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const win = Number.isFinite(s.rounds) ? Math.max(1, Math.min(20, s.rounds | 0)) : cfg.quietRounds;
    const r = round();
    const since = r - win;
    const all = rows();
    const added = all.filter(function (x) { return x && Number.isFinite(x.round) && x.round > since; }).length;
    stat.quiets++;
    if (added === 0) {
      return { ok: true, reason: 'ok-empty', quiet: true, rounds: win, added: 0,
        line: '这 ' + win + ' 轮没有值得说的事。' };
    }
    return { ok: true, reason: 'ok', quiet: false, rounds: win, added: added,
      line: '这 ' + win + ' 轮里有 ' + added + ' 条新记录。' };
  }

  /** EXV28-36：世界年表 —— 谁在哪一年做了什么；未发生的、来路不明的都不进。 */
  function almanac(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const limit = Number.isFinite(s.limit) ? Math.max(1, Math.min(cfg.maxRows, s.limit | 0)) : cfg.maxRows;
    const stamp = Number.isFinite(s.at) ? s.at : now();
    const list = ofKind('almanac').slice().sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    const kept = [];
    let dropped = 0;
    list.forEach(function (x) {
      if (!x || !x.owner || !x.text) { dropped++; return; }
      if (Number.isFinite(x.at) && x.at > stamp) { dropped++; return; }
      kept.push({ year: Number.isFinite(x.year) ? x.year : 0, who: x.owner, what: x.text,
        at: Number.isFinite(x.at) ? x.at : 0 });
    });
    stat.almanacs++;
    const view = kept.slice(-limit);
    return { ok: true, reason: 'ok', rows: view, count: view.length, total: kept.length,
      dropped: dropped, capped: kept.length > view.length };
  }

  /** 往年表里添一条：只收已发生、且有 owner 的。 */
  function record(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const owner = clean(s.owner || s.who, 40);
    const text = clean(s.text || s.what, 140);
    if (!owner) {
      stat.refused++; stat.lastReason = 'no-owner';
      return { ok: false, reason: 'no-owner', hint: '年表不收来路不明的条目 —— 谁做的必须写清楚' };
    }
    if (!text) return refuse('missing-fields', { field: 'text' });
    const at = Number.isFinite(s.at) ? s.at : now();
    if (at > now()) {
      stat.refused++; stat.lastReason = 'not-happened';
      return { ok: false, reason: 'not-happened', at: at, now: now() };
    }
    const row = { id: 'al_' + round() + '_' + (stat.almanacs + 1), kind: 'almanac', owner: owner,
      text: text, year: Number.isFinite(s.year) ? s.year : 0, round: round(), at: at };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.chronicle = Array.isArray(d.chronicle) ? d.chronicle : [];
          d.chronicle.push(row);
          return true;
        }, 'brief:almanac');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    return { ok: true, reason: 'listed', id: row.id, wrote: wrote };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const lines = [];
    try { const l = oneLine(); if (l.ok) lines.push('- ' + l.line); } catch (e) { /* 不编 */ }
    try { const q = quiet(); if (q.ok) lines.push('- ' + q.line); } catch (e) { /* 不编 */ }
    return lines.length ? '[世界]\n' + lines.join('\n') : '';
  }
  function view() {
    return { enabled: settings().enabled, stat: Object.assign({}, stat),
      shards: ofKind('shard').length, almanac: ofKind('almanac').length, block: buildBlock() };
  }

  WA.worldBrief = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    board: board, oneLine: oneLine, quiet: quiet, almanac: almanac, record: record,
    buildBlock: buildBlock, view: view,
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/world-brief.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/world-brief 已加载（' + VERSION + '）');
})();
