/**
 * WorldAxis engines/finale.js (v2.524.0) — EXV29-13 终局条件 / EXV29-17 完结后定格
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场读数：`finale|谢幕|剧终` **0 命中**、`卷末|arcSettle` **0 命中**。
 *   于是故事**没有终局这个概念**：它只会一直往后写，直到模型自己腻了。
 *   玩家读到的"结束"永远是断在半句上的。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `check({mainlineOpen, debtsOpen, peopleLeft})` 用三个可数的量判"能不能收了"：
 *   主线未收 0 条、欠账未清 0 笔、在场的人 ≤1 ⇒ `ready:true`，并给一句"该收了"。
 *   `rateGate({newFacts})` 管**完结之后**：每轮新增事实 ≤ `AFTER_CAP` 条，世界不许再膨胀。
 *   **两条都不逼人**：`force` 恒为 `false`——它只报"可以收了"，收不收是玩家的事。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不满足不给假信号：任一条件没到 ⇒ `ready:false` 且 `because` 点名差什么。
 *   ② 永不逼：`force` 必须恒 `false`（负控制：改成 true 必红）。
 *   ③ 完结后限产：`afterFinale:true` 时 `newFacts>1` ⇒ `exceed:true`（读数不进产出）。
 *   ④ 没判过不冒充：没调用过 `check` 的 `state()` ⇒ `judged:false`（不拿空当"可以收了"）。
 *   ⑤ 有界：`finale` 单条记录（最近一次判定 + 最近 8 次收尾读数）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'finale';
  const AFTER_CAP = 1;
  const HIST_CAP = 8;
  const stat = { checked: 0, ready: 0, notReady: 0, gated: 0, badInput: 0 };
  let shadow = null;

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function readAll() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const m = all[STORE_KEY];
      return (m && typeof m === 'object' && !Array.isArray(m)) ? m : (shadow || {});
    } catch (e) { return shadow || {}; }
  }
  function writeAll(m) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = m; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'finale:check');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function num0(v) { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('finale'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }

  /**
   * 判"能不能收了"。三个量都数得清：主线几条没落、账几笔没清、还剩几个人要交代。
   */
  function check(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const main = num0(src.mainlineOpen);
    const debts = num0(src.debtsOpen);
    const left = num0(src.peopleLeft);
    const because = [];
    if (main) because.push('主线还开着 ' + main + ' 条');
    if (debts) because.push('账还有 ' + debts + ' 笔没清');
    if (left > 1) because.push('还有 ' + left + ' 个人没交代');
    const ready = (main === 0 && debts === 0 && left <= 1);
    const m = readAll();
    const hist = Array.isArray(m.hist) ? m.hist : [];
    hist.push({ at: nowAt(), ready: ready, main: main, debts: debts, left: left });
    while (hist.length > HIST_CAP) hist.shift();
    m.hist = hist;
    m.last = { at: nowAt(), ready: ready, main: main, debts: debts, left: left };
    writeAll(m);
    stat.checked++;
    if (ready) stat.ready++; else stat.notReady++;
    return {
      ok: true, reason: 'ok', ready: ready, because: because, force: false,
      line: ready ? '可以收了：主线都落了，账也清了，剩下的人一个个能交代完。'
        : ('还差：' + because.join('；') + '。'),
      note: '只报不逼：收不收由你定'
    };
  }

  /** 完结之后限产：`newFacts` 超过之后每轮上限 ⇒ `exceed:true`（读数，不拦）。 */
  function rateGate(o) {
    const src = (o && typeof o === 'object') ? o : {};
    if (src.afterFinale !== true) return { ok: true, reason: 'ok', afterFinale: false, cap: AFTER_CAP, exceed: false, note: '还没到完结：限产闸不生效' };
    const facts = num0(src.newFacts);
    const exceed = facts > AFTER_CAP;
    stat.gated++;
    return { ok: true, reason: 'ok', afterFinale: true, newFacts: facts, cap: AFTER_CAP, exceed: exceed,
      note: exceed ? ('完结之后这一轮要添 ' + facts + ' 条新事实：超了（只该做余波，每轮 ≤' + AFTER_CAP + '）')
        : '完结之后只做余波：产量在限内' };
  }

  function state() {
    const m = readAll();
    if (!m.last) return { ok: true, reason: 'ok', judged: false, note: '还没判过终局条件：不冒充"可以收了"' };
    return { ok: true, reason: 'ok', judged: true, last: Object.assign({}, m.last),
      hist: (Array.isArray(m.hist) ? m.hist.slice(-4) : []) };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const m = readAll();
    if (!m.last || !m.last.ready) return '';
    return '【该收了】主线落了、账清了：这个故事可以收尾了（你不收也行，但它已经能收了）。';
  }

  WA.finale = {
    AFTER_CAP: AFTER_CAP, HIST_CAP: HIST_CAP,
    check: check, rateGate: rateGate, state: state, buildBlock: buildBlock, stat: statOf
  };
})();