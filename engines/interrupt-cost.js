/**
 * WorldAxis engines/interrupt-cost.js (v2.524.0) — EXV29-08 抢话与打断
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场 19 个文件提到"抢话/打断"，但**都是描述性字段**：没有人记过
 *   "他打断过谁、打断了几次、对方记不记这笔"。于是抢话在正文里是免费的——
 *   抢一百次也没有代价，被打断的人下一轮照样温和。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `cut({by, to, weight})` 记一次打断，并按权重结算三笔**代价**：
 *   对方记恨（`resent`）、话题跑偏（`drift`，权重越高跑得越偏）、
 *   抢话者权威受损（`authority`，当众抢比自己地位高的人扣得更多）。
 *   `state({who})` 把三笔账摊开给叙事层；`forgive()` 让时间冲淡（不是清零）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不打断不产生代价：没调用过 `cut` 的人 `state()` 三笔全 0（负控制）。
 *   ② 代价必可归因：`cut` 回执带 `because`（哪一次、抢了谁、权重多少）。
 *   ③ 记恨不会自己消失：`forgive()` 只减一半且留 `echo`（旧账还在，冲不干净）。
 *   ④ 有界：最多记 24 组"谁抢谁"，每组留最近 8 笔；超出按最旧挤出。
 *   ⑤ 不写台词：本模块只结算代价，不生成对峙内容。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'interruptCost';
  const CAP = 24;
  const ROW_CAP = 8;
  const MAX_W = 3;
  const stat = { cuts: 0, forgiven: 0, badInput: 0, blocked: 0 };
  let shadow = null;

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function readAll() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const m = all[STORE_KEY];
      if (m && typeof m === 'object' && !Array.isArray(m)) return m;
      return shadow || {};
    } catch (e) { return shadow || {}; }
  }
  function writeAll(m) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = m; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'interrupt:cost');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 24);
  }
  function nowAt() {
    try { return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('interruptCost') : Date.now(); }
    catch (e) { return Date.now(); }
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= CAP) return m;
    ks.sort(function (a, b) { return ((m[a].at || 0) - (m[b].at || 0)); });
    ks.slice(0, ks.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }
  function keyof(a, b) { return String(a) + '\u0000' + String(b); }

  /** 记一次打断。`weight` 1..3（1=插一句，3=当众压话）。`status` 抢话者相对对方的地位差。 */
  function cut(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const by = clean(src.by, 24);
    const to = clean(src.to, 24);
    const missing = [];
    if (!by) missing.push('by');
    if (!to) missing.push('to');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    if (by === to) return refuse('bad-target', { why: '抢自己不算抢话' });
    const w = Math.max(1, Math.min(MAX_W, Math.floor(Number(src.weight) || 1)));
    const gap = Math.max(-3, Math.min(3, Math.floor(Number(src.statusGap) || 0)));   // >0 = 抢比自己高的
    const m = readAll();
    const k = keyof(by, to);
    const row = m[k] || { by: by, to: to, resent: 0, drift: 0, authority: 0, cuts: 0, rows: [], at: 0 };
    row.cuts += 1;
    row.resent += w;                                   // 对方记恨：权重就是记恨量
    row.drift += Math.min(3, w);                        // 话题跑偏：一次最多偏 3
    row.authority -= (gap > 0 ? gap + 1 : 1);           // 抢高位的更伤权威
    row.rows.push({ at: nowAt(), weight: w, statusGap: gap });
    while (row.rows.length > ROW_CAP) row.rows.shift();
    row.at = nowAt();
    m[k] = row;
    writeAll(capIt(m));
    stat.cuts++;
    return {
      ok: true, reason: 'ok', by: by, to: to, weight: w, statusGap: gap,
      resent: row.resent, drift: row.drift, authority: row.authority, cuts: row.cuts,
      because: by + ' 第 ' + row.cuts + ' 次抢 ' + to + ' 的话（权重 ' + w + (gap > 0 ? '，还是当众压上位' : '') + '）',
      note: row.cuts >= 3 ? ('打断已经三次以上：' + to + ' 记着这笔，下一轮态度会有据可查')
        : '记一笔：对方记恨 +' + w + '，权威 ' + (row.authority)
    };
  }

  function state(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24);
    if (!who) return refuse('missing-fields', { missing: ['who'] });
    const m = readAll();
    const asCutter = [];
    const asCut = [];
    Object.keys(m).forEach(function (k) {
      const r = m[k];
      if (r.by === who) asCutter.push({ to: r.to, cuts: r.cuts, authority: r.authority, drift: r.drift });
      if (r.to === who) asCut.push({ by: r.by, cuts: r.cuts, resent: r.resent });
    });
    if (!asCutter.length && !asCut.length) {
      return { ok: true, reason: 'ok', who: who, resent: 0, drift: 0, authority: 0, cuts: 0,
        note: '他没抢过话，也没被抢过：三笔账都是 0（不打断不产生代价）' };
    }
    const resent = asCut.reduce(function (n, r) { return n + r.resent; }, 0);
    const drift = asCutter.reduce(function (n, r) { return n + r.drift; }, 0);
    const authority = asCutter.reduce(function (n, r) { return n + r.authority; }, 0);
    const cuts = asCutter.reduce(function (n, r) { return n + r.cuts; }, 0);
    return { ok: true, reason: 'ok', who: who, resent: resent, drift: drift, authority: authority,
      cuts: cuts, asCutter: asCutter, asCut: asCut,
      note: cuts ? ('抢过 ' + cuts + ' 次话；权威 ' + authority + '，话题跑了 ' + drift)
        : ('被抢了 ' + asCut.length + ' 人次的账，记恨 ' + resent) };
  }

  /** 时间冲淡：只减一半，且留 echo（旧账冲不干净）。 */
  function forgive(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const by = clean(src.by, 24);
    const to = clean(src.to, 24);
    if (!by || !to) return refuse('missing-fields', { missing: [!by ? 'by' : null, !to ? 'to' : null].filter(Boolean) });
    const m = readAll();
    const k = keyof(by, to);
    const row = m[k];
    if (!row) return { ok: false, reason: 'not-happened', by: by, to: to, note: '这两人之间没有打断的账' };
    const before = { resent: row.resent, drift: row.drift, authority: row.authority };
    row.resent = Math.floor(row.resent / 2);
    row.drift = Math.floor(row.drift / 2);
    row.authority = Math.ceil(row.authority / 2);
    row.echo = { resent: row.resent, at: nowAt() };
    writeAll(capIt(m));
    stat.forgiven++;
    return { ok: true, reason: 'ok', by: by, to: to, before: before,
      after: { resent: row.resent, drift: row.drift, authority: row.authority },
      note: '只减一半：' + to + ' 不再提，但这笔他不会忘（echo ' + row.resent + '）' };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const m = readAll();
    const ks = Object.keys(m);
    if (!ks.length) return '';
    const hot = ks.map(function (k) { return m[k]; })
      .filter(function (r) { return r.cuts >= 3 && r.resent >= 5; })
      .sort(function (a, b) { return b.resent - a.resent; })[0];
    if (!hot) return '';
    return '【抢话】' + hot.by + ' 已经打断 ' + hot.to + ' ' + hot.cuts + ' 次（记恨 ' + hot.resent + '）：这层梁子还在。';
  }

  WA.interruptCost = {
    CAP: CAP, ROW_CAP: ROW_CAP, MAX_WEIGHT: MAX_W,
    cut: cut, state: state, forgive: forgive, buildBlock: buildBlock, stat: statOf
  };
})();