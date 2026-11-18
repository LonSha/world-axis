/**
 * WorldAxis engines/quiet-round.js (v2.524.0) — EXV29-11 冷场是合法结果
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场读数：`冷场|silenceRound` **0 命中**。也就是说全仓**没有"没人接话"这个状态**：
 *   每一轮必须有人说话，于是 AI 只好硬凑——问一句答一句、明明无话可说也要抖个机灵。
 *   真实的一屋子人，更多时候是**没人接话**，而且没人接话是有原因的。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `judge({who, willing, goal, topic})` 判这一轮**能不能不接话**：
 *   没有可谈的（`no-goal`）/ 不愿谈（`unwilling`）/ 就是安静（`quiet`）。
 *   回 `quiet:true` 与 `reason`，并累计 `streak`（连续冷场轮数）。
 *   **本模块永不产出台词**：`produced` 恒为 0——冷场不进产出。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 冷场不报错：连续 3 轮 `quiet` 仍然 `ok:true`（负控制：把第 3 轮判成 `ok:false` 必红）。
 *   ② 冷场不进产出：`produced` 必须恒 0，且 `shouldForce()` 必须恒 `false`（不许硬凑）。
 *   ③ 原因必给：`quiet:true` 一定带 `reason`（`no-goal` / `unwilling` / `quiet`）。
 *   ④ 有人愿意说就不许判冷场：`willing:true` 且 `goal` 非空 ⇒ `quiet:false`（负控制）。
 *   ⑤ 有界：`quietRound.hist` 最近 12 轮。
 *   ⑥ 只表态不写戏：本模块**不生成任何字句**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'quietRound';
  const HIST_CAP = 12;
  const REASONS = ['no-goal', 'unwilling', 'quiet'];
  const CN = { 'no-goal': '没什么可谈的', unwilling: '不愿谈', quiet: '就是想安静一会儿' };
  const stat = { judged: 0, quiet: 0, badInput: 0, longest: 0 };
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
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'quiet:round');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 32);
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('quietRound'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }

  /**
   * 判一轮：`{who, willing, goal, topic}`。
   * `quiet:true` ⇒ 这一轮可以不接话；`reason` 说明为什么。
   */
  function judge(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24) || '在场的人';
    const goal = clean(src.goal, 48);
    const willing = src.willing === true;
    if (willing && !goal) return refuse('missing-fields', { missing: ['goal'], why: '愿意说却没说得出要谈什么：这条不算冷场，算没说清' });
    const m = readAll();
    const hist = Array.isArray(m.hist) ? m.hist : [];
    stat.judged++;
    if (willing && goal) {
      hist.push('speak');
      while (hist.length > HIST_CAP) hist.shift();
      m.hist = hist; m.at = nowAt();
      writeAll(m);
      return { ok: true, reason: 'ok', quiet: false, who: who, produced: 1,
        streak: 0, note: '有人说、也有话可谈：这一轮不冷场' };
    }
    const why = !goal ? 'no-goal' : (!willing ? 'unwilling' : 'quiet');
    const reason = REASONS.indexOf(why) >= 0 ? why : 'quiet';
    hist.push('quiet:' + reason);
    while (hist.length > HIST_CAP) hist.shift();
    m.hist = hist; m.at = nowAt();
    writeAll(m);
    stat.quiet++;
    let streak = 0;
    for (let i = hist.length - 1; i >= 0 && hist[i].indexOf('quiet:') === 0; i--) streak++;
    if (streak > stat.longest) stat.longest = streak;
    return {
      ok: true, reason: 'ok', quiet: true, silentReason: reason, silentReasonCN: CN[reason],
      who: who, produced: 0, streak: streak,
      note: '这一轮没人接话——' + CN[reason] + '（连续第 ' + streak + ' 轮；不硬凑台词）'
    };
  }

  /** 永远 false：冷场不许被"强制打破"。留这个口是为了让调用方能明确读到"没有强制"。 */
  function shouldForce() { return false; }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const m = readAll();
    const hist = Array.isArray(m.hist) ? m.hist : [];
    let streak = 0;
    for (let i = hist.length - 1; i >= 0 && hist[i].indexOf('quiet:') === 0; i--) streak++;
    if (streak < 2) return '';
    const why = hist[hist.length - 1].replace('quiet:', '');
    return '【安静】已经连着 ' + streak + ' 轮没人接话（' + (CN[why] || why) + '）：这不是故障，别硬凑一句。';
  }

  WA.quietRound = {
    HIST_CAP: HIST_CAP, REASONS: REASONS.slice(), CN: Object.assign({}, CN),
    judge: judge, shouldForce: shouldForce, buildBlock: buildBlock, stat: statOf
  };
})();