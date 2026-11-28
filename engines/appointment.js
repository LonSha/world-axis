/**
 * WorldAxis engines/appointment.js (v2.527.0) — EXV28-23 承诺、邀约与到场
 * 读数：`ls engines | grep -iE 'appoint|meet|arriv'` 空；longline.promise 有 dueAt、
 *      agenda.upcoming 有期限表、freight 有 eta —— **货会到，人不会到**。
 * 机制：约定（对方/地点/时间窗/期待）→ 到场 / 迟到 / 失约三种结果，各自留痕。
 * 边界：不替玩家答应约定；时间走 clock；失约不得静默抹平（留 trace）。
 * v2.562.0：注入面名额（3 条）此前按「对象键顺序 × 数组顺序」占位 —— 先登记的远期约
 *   会把「下一轮就要赴的约」和「已经过了轮次还没结算的约」全部挤掉（实测：4 条约期里
 *   r+3 的三条占满名额，r+1 那条一个字都进不来）。现在候选与名额分开：候选只按
 *   「未到 + 视野内」筛，名额按 from 升序取（同 from 按 to → place → id 可复算）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.527.0';
  const LS_KEY = 'worldaxis_appointment_settings_v1';
  const DEF = { enabled: true, maxPerActor: 8, lateGrace: 1 };
  const __REG = { key: LS_KEY, def: DEF, module: 'appointment', bounds: { maxPerActor: [1, 24], lateGrace: [0, 6] } };
  const RESULT = ['到场', '迟到', '失约', '未到'];
  // v2.562.0：注入面的两个硬上限。**刻意不进设置面** —— 它们决定「模型这一轮看得到哪几条约」，
  //   与 `maxPerActor`（每人存几条）是两件事；把准入面暴露成旋钮会让「约被隐藏」变成配置问题，
  //   而它本来就是判据问题。
  const BLOCK_QUOTA = 3;      // 注入面列几条
  const BLOCK_HORIZON = 3;    // 只提示「几轮内」的约
  const stat = { made: 0, kept: 0, late: 0, missed: 0, refused: 0, lastReason: '',
    // v2.562.0：注入面名额读数（覆盖式：最近一次 buildBlock 的选材现场）。
    //   `null` = 本进程从没构建过；`picked: 0` = 构建过但一条都没有 —— 两件事不许混。
    block: null };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function now() { try { return WA.clock.now('appointment'); } catch (e) { return Date.now(); } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 70) : ''; }
  function findActor(d, id) {
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    if (m[id]) return m[id];
    const ks = Object.keys(m);
    for (let i = 0; i < ks.length; i++) if (m[ks[i]] && m[ks[i]].name === id) return m[ks[i]];
    return null;
  }
  function list(a) { return a && Array.isArray(a.appointments) ? a.appointments : []; }
  function make(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who || s.id, 40);
    const withWhom = clean(s.withWhom || s.with, 40);
    const place = clean(s.place, 40);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, reason: 'missing-who' }; }
    if (!withWhom) { stat.refused++; stat.lastReason = 'missing-with'; return { ok: false, reason: 'missing-with' }; }
    if (!place) { stat.refused++; stat.lastReason = 'missing-place'; return { ok: false, reason: 'missing-place' }; }
    const r = round();
    const from = Number.isFinite(s.from) ? Number(s.from) : (r + 1);
    const to = Number.isFinite(s.to) ? Number(s.to) : (from + 2);
    const row = { id: 'ap_' + r + '_' + (stat.made + 1), who: who, withWhom: withWhom, place: place,
      from: from, to: to > from ? to : from, expect: clean(s.expect, 80),
      result: '未到', createdAt: now(), createdRound: r };
    const requestKey = clean(s.requestKey, 120);
    let entry = null, repeated = false, tx;
    try {
      if (WA.store && WA.store.transact) {
        tx = WA.store.transact(function (d) {
          d.actors = d.actors || {};
          const a = findActor(d, who) || (d.actors[who] = { id: who, conditions: [] });
          a.appointments = list(a);
          entry = requestKey && a.appointments.find(function (x) { return x && x.requestKey === requestKey; });
          if (entry) { repeated = true; return true; }
          // A reload resets stat.made; IDs used by settle() must still be unique across actors.
          const used = new Set();
          Object.keys(d.actors).forEach(function (k) { list(d.actors[k]).forEach(function (x) { if (x) used.add(x.id); }); });
          let n = stat.made + 1;
          while (used.has(row.id)) row.id = 'ap_' + r + '_' + (++n);
          if (requestKey) row.requestKey = requestKey;
          a.appointments.push(row);
          if (a.appointments.length > cfg.maxPerActor) a.appointments.shift();
          entry = row;
          return true;
        }, 'appointment:make');
      }
    } catch (e) { tx = null; }
    if (!tx || tx.ok !== true || !entry) return { ok: false, reason: 'write-failed' };
    if (!repeated) stat.made++;
    return { ok: true, reason: 'made', id: entry.id, window: [entry.from, entry.to], repeated: repeated,
      persisted: tx.persisted, deferred: !!tx.deferred };
  }
  /** 判结果：到场 / 迟到（宽限内）/ 失约（超过窗口）。 */
  function settle(spec) {
    const cfg = settings();
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || '').trim();
    const atRound = Number.isFinite(s.atRound) ? Number(s.atRound) : round();
    const shown = s.showUp !== false;
    let out = null, tx;
    try {
      if (WA.store && WA.store.transact) {
        tx = WA.store.transact(function (d) {
          const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
          Object.keys(m).forEach(function (k) {
            list(m[k]).forEach(function (x) {
              if (!out && x && x.id === id) {
                if (x.result !== '未到') { out = { ok: false, reason: 'already-settled' }; return; }
                if (!shown && atRound > x.to) { x.result = '失约'; }
                else if (!shown) { x.result = '未到'; return; }
                else if (atRound > x.to) { x.result = '失约'; }
                else if (atRound > x.from + cfg.lateGrace) { x.result = '迟到'; }
                else { x.result = '到场'; }
                x.atRound = atRound; x.at = now();
                out = { ok: true, reason: x.result, id: id, result: x.result };
              }
            });
          });
          return true;
        }, 'appointment:settle');
      }
    } catch (e) { tx = null; }
    if (!tx || tx.ok !== true) return { ok: false, reason: 'write-failed' };
    if (!out) return { ok: false, reason: 'entry-missing' };
    out.persisted = tx.persisted;
    out.deferred = !!tx.deferred;
    if (out.result === '到场') { stat.kept++; return out; }
    if (out.result === '迟到') { stat.late++; markTrace(id, '迟到'); return out; }
    if (out.result === '失约') { stat.missed++; markTrace(id, '失约'); return out; }
    return out;
  }
  function markTrace(id, what) {
    try {
      if (WA.tracePost && typeof WA.tracePost.post === 'function') {
        WA.tracePost.post({ what: '有人' + what + '了约定（' + id + '）', kind: '缺席', life: 8, source: 'appointment' });
      }
    } catch (e) { /* 留痕失败不伪造 */ }
  }
  // An explicit later conversation belongs to the settled appointment. Keep one receipt across reloads.
  function together(a, b) {
    if (!WA.world || !WA.world.where || !WA.world.getSettings().enabled) return false;
    const x = WA.world.where(a), y = WA.world.where(b);
    return !!(x.ok && y.ok && x.arrived && y.arrived && !x.inTransit && !y.inTransit && x.place && x.place === y.place);
  }
  function revisit(spec) {
    const s = spec || {}, turn = round(), who = clean(s.who, 40), line = clean(s.line, 160);
    if (!settings().enabled || !who || !line) return { ok: false };
    const current = view({ who: who });
    const row = current.ok && current.appointments.find(function (x) { return x && x.id === s.id; });
    if (!row || !Number.isFinite(row.atRound) || turn <= row.atRound || row.result === '未到') return { ok: false };
    if (row.reunion) return { ok: true, repeated: true };
    const pos = WA.world.where(row.withWhom);
    if (!together(row.withWhom, who)) return { ok: false };
    const tx = WA.store.transact(function (d) {
      const x = list(findActor(d, who)).find(function (v) { return v && v.id === row.id; });
      if (!x || x.result !== row.result || x.atRound !== row.atRound) return false;
      if (!x.reunion) x.reunion = { round: turn, place: pos.place, line: line, sealOffered: s.sealOffered === true };
      return true;
    }, 'appointment:revisit');
    return { ok: !!(tx && tx.ok), deferred: !!(tx && tx.deferred), persisted: tx && tx.persisted };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who || s.id, 40);
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const a = findActor(d, who);
    if (!a) return { ok: false, reason: 'actor-missing' };
    return { ok: true, id: who, appointments: list(a), open: list(a).filter(function (x) { return x.result === '未到'; }).length };
  }
  /**
   * v2.562.0：注入面名额的**唯一**分配判据。
   *
   *   旧写法把「筛候选」和「数名额」塞进同一个双重循环：
   *     `if (lines.length >= 3) return;` —— 名额一满，后面所有候选**连看都不看**。
   *   于是名额由**遍历顺序**决定：`Object.keys(actors)` 的注册顺序 × 每人 `appointments` 的
   *   追加顺序。先登记的远期约永久占位。
   *
   *   实测（/tmp/probe562.js）：
   *     · s1  同一个人 4 条：3 条 r+3、1 条 r+1 ⇒ 列出的是那三条 r+3，**下一轮要赴的约不见了**；
   *     · s2  两个人的同一局面 ⇒ 一样；
   *     · s5  `from = r-2`（**已经过了轮次**却仍是「未到」，最紧急的一类）⇒ 同样被挤掉；
   *     · s8  同 from 的 4 条 ⇒ 按数组顺序取前 3，换个插入顺序结论就变（不可复算）。
   *
   * 判据三条：
   *   ① 名额够就**原样返回**（顺序不变）—— 名额不是瓶颈时不该重排；
   *   ② 不够时按 `from` 升序：**最近要发生的先**，已经过轮的（from < r）排最前；
   *   ③ 同 from 按 `to` 升序 → 同 from/to 按 `place` 字典序 → 再按 `id` 字典序（可复算）。
   */
  function pickBlock(cand) {
    if (cand.length <= BLOCK_QUOTA) return cand.slice();
    const byWhen = function (a, b) {
      const d = (Number(a.row.from) || 0) - (Number(b.row.from) || 0);
      if (d !== 0) return d;
      const t = (Number(a.row.to) || 0) - (Number(b.row.to) || 0);
      if (t !== 0) return t;
      const p = String(a.row.place || ''), q = String(b.row.place || '');
      if (p !== q) return p < q ? -1 : 1;
      const x = String(a.row.id || ''), y = String(b.row.id || '');
      return x < y ? -1 : (x > y ? 1 : 0);
    };
    return cand.slice().sort(byWhen).slice(0, BLOCK_QUOTA);
  }
  function buildBlock(speaker) {
    const cfg = settings();
    if (!cfg.enabled) return '';
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    const r = round();
    // ① 收候选：只按「未到 + 视野内」筛，**不看名额**（名额一满就 return 正是旧写法的事故点）
    const cand = [];
    Object.keys(m).forEach(function (k) {
      const who = clean(m[k].name || k, 20);
      list(m[k]).forEach(function (x) {
        if (!x || x.result !== '未到') return;
        if (x.from - r > BLOCK_HORIZON) return;
        cand.push({ row: x, who: who });
      });
    });
    // ② 分名额（判据唯一正身）
    const picked = pickBlock(cand);
    stat.block = {
      candidates: cand.length, picked: picked.length,
      quota: BLOCK_QUOTA, horizon: BLOCK_HORIZON,
      // 已经到轮次（from <= r）却还没结算的条数 —— 这一栏答「有几条约已经该发生了」
      dueNow: cand.filter(function (c) { return (Number(c.row.from) || 0) <= r; }).length,
      mode: cand.length === 0 ? 'empty' : (cand.length <= BLOCK_QUOTA ? 'all-fit' : 'nearest-first')
    };
    const recent = [];
    Object.keys(m).forEach(function (k) {
      list(m[k]).forEach(function (x) {
        const v = x && x.reunion;
        if (!speaker || (speaker !== x?.who && speaker !== x?.withWhom)) return;
        if (!v || !v.line || !Number.isFinite(v.round) || v.round > r || r - v.round > 3) return;
        recent.push({ round: v.round, id: x.id, text: x.who + '与' + x.withWhom + '在' + v.place + '重逢时（只限当事人知道）：' + v.line });
      });
    });
    recent.sort(function (a, b) { return b.round - a.round || String(a.id).localeCompare(String(b.id)); });
    const memory = recent.length ? '[最近的会面]\n' + recent[0].text : '';
    if (!picked.length) return memory;
    const lines = picked.map(function (c) {
      const x = c.row;
      return '- ' + c.who + '与' + x.withWhom + '约在' + x.place
        + '（第 ' + x.from + '–' + x.to + ' 轮）' + (x.expect ? '：' + x.expect : '');
    });
    return '[还没结的约]\n' + lines.join('\n') + (memory ? '\n' + memory : '');
  }
  WA.appointment = {
    getSettings: settings, setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    RESULTS: RESULT.slice(), make: make, settle: settle, together: together, revisit: revisit, view: view, buildBlock: buildBlock,
    // v2.562.0：`stat` 的浅拷贝必须单独再拷 `block`（对象）—— 否则外部改返回值会污染下一次读数。
    stat: function () { return Object.assign({}, stat,
      { block: stat.block ? Object.assign({}, stat.block) : null }); }
  };
  if (WA.registerModule) WA.registerModule('engines/appointment.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/appointment 已加载（' + VERSION + '）');
})();