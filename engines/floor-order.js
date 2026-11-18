/**
 * WorldAxis engines/floor-order.js (v2.524.0) — EXV29-07 发言秩序
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场读数：`抢话|打断` 命中 19 文件、`overhear|eavesdrop` 19 文件，但全在
 *   `ensemble` / `stage-presence` / `collab` / `spatial-acoustics` 各管一段——
 *   **没有任何一处能回答"这一轮该谁说"**。于是一个屋子三个人，谁先开口靠的是
 *   模型当下的手感：要么地位最高的永远抢在前面，要么谁最后出现谁说话。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   按四个可核的量算一个分：**地位**（status，0..3）×3 + **亲疏**（closeness，0..2）×2
 *   + **急迫**（urgency，0..2）×2 − **被打断史**（interrupted，次）。分高者先说，
 *   每人附一条**理由**（哪几项把他推到前面/压到后面）。同分按入手顺序，**不掷骰**。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 有理由：`rank()` 的每一项必须带 `why`（空串必红）——不许"反正排了"。
 *   ② 稳定：同一批入参排两次结果必须逐字相同（负控制：改成随机必红）。
 *   ③ 不抢镜：同一个人不得连续占前 two 位超过 `STREAK_CAP` 轮（超过即降一档，
 *      并把"该轮到别人了"写进理由）——这是把 EXV29-12 的公平压在这里的同一把尺。
 *   ④ 没输入不猜：`rank()` 空名单 ⇒ `empty:true`，不编人。
 *   ⑤ 有界：`floorOrder` 最多 24 人、发言史最近 16 轮（与 `__BOUNDED_CAPS` 对齐）。
 *   ⑥ 只排序不写台词：本模块**不进正文**，只回顺序与理由。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'floorOrder';
  const CAP = 24;
  const HIST_CAP = 16;
  const STREAK_CAP = 1;          // 连续占首位的最多轮数（1 = 不许连着两轮都他先说）
  const stat = { ranked: 0, empty: 0, badInput: 0, demoted: 0 };
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
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'floor:order');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 24);
  }
  function num(v, lo, hi, dflt) {
    const n = Number(v);
    if (!isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('floorOrder'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }
  function hist() {
    const m = readAll();
    return Array.isArray(m.hist) ? m.hist : [];
  }
  function firstStreak() {
    // 最近几轮"第一个开口的是谁"连续相同 → 返回 [who, 连了几轮]
    const h = hist();
    if (!h.length) return ['', 0];
    const who = h[h.length - 1];
    let n = 0;
    for (let i = h.length - 1; i >= 0 && h[i] === who; i--) n++;
    return [who, n];
  }

  /**
   * 排序：`people: [{who, status, closeness, urgency, interrupted}]`
   * 回 `order: [{who, score, why}]`。同分不掷骰，按入参顺序。
   */
  function rank(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const list = Array.isArray(src.people) ? src.people : [];
    if (!list.length) { stat.empty++; return { ok: true, reason: 'ok', empty: true, order: [], note: '没有在场者：不编人' }; }
    const rows = [];
    const seen = {};
    let dup = 0;
    list.forEach(function (p, i) {
      const who = clean((p && p.who), 24);
      if (!who) return;
      if (seen[who]) { dup++; return; }
      seen[who] = true;
      const status = num(p.status, 0, 3, 0);
      const closeness = num(p.closeness, 0, 2, 0);
      const urgency = num(p.urgency, 0, 2, 0);
      const interrupted = num(p.interrupted, 0, 9, 0);
      rows.push({ who: who, i: i, status: status, closeness: closeness, urgency: urgency, interrupted: interrupted,
        score: status * 3 + closeness * 2 + urgency * 2 - interrupted });
    });
    if (!rows.length) return refuse('missing-fields', { missing: ['who'], why: '在场者必须有人名' });
    rows.sort(function (a, b) { return (b.score - a.score) || (a.i - b.i); });
    // ③ 不抢镜：上一轮已是他先说，且这次还排第一 ⇒ 降一档（与第二换位）
    const fs = firstStreak();
    let demoted = '';
    if (fs[1] >= 1 && rows.length > 1 && rows[0].who === fs[0]) {
      const top = rows.shift();
      rows.splice(1, 0, top);
      demoted = top.who;
      stat.demoted++;
    }
    const order = rows.map(function (r, idx) {
      const bits = [];
      if (r.status) bits.push('地位 ' + r.status);
      if (r.closeness) bits.push('亲疏 ' + r.closeness);
      if (r.urgency) bits.push('急迫 ' + r.urgency);
      if (r.interrupted) bits.push('被打断过 ' + r.interrupted + ' 次');
      const why = (r.who === demoted)
        ? '上一轮已经是他先说，这次往后让一位（不许连着抢）'
        : (bits.length ? (bits.join('、') + ' ⇒ 合 ' + r.score) : ('没有加权项，按在场顺序排第 ' + (idx + 1)));
      return { who: r.who, score: r.score, why: why };
    });
    stat.ranked++;
    return { ok: true, reason: 'ok', empty: false, order: order, first: order[0].who,
      demoted: demoted || null, deduped: dup,
      note: '分高者先说；同分按在场顺序（不掷骰）' + (dup ? ('；重名 ' + dup + ' 人已合并') : '') };
  }

  /** 记一次"这一轮是谁先开口"（供 ③ 的公平尺用；有界 HIST_CAP）。 */
  function note(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24);
    if (!who) return refuse('missing-fields', { missing: ['who'] });
    const m = readAll();
    const h = Array.isArray(m.hist) ? m.hist : [];
    h.push(who);
    while (h.length > HIST_CAP) h.shift();
    m.hist = h;
    m.at = nowAt();
    writeAll(m);
    return { ok: true, reason: 'ok', who: who, streak: firstStreak() };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const fs = firstStreak();
    if (fs[1] < STREAK_CAP + 1) return '';
    return '【发言】已经连着 ' + fs[1] + ' 轮是 ' + fs[0] + ' 先开口：这一轮该轮到别人了。';
  }

  WA.floorOrder = {
    CAP: CAP, HIST_CAP: HIST_CAP, STREAK_CAP: STREAK_CAP,
    rank: rank, note: note, buildBlock: buildBlock, stat: statOf
  };
})();