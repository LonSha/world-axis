/**
 * WorldAxis engines/identity-match.js (v2.251.0) — 认人：分数排序 + 判不清带
 *
 * ── 它治什么（缺口，开工前先看场）────────────────────────────────
 *   本仓 `actors/registry.js` 只回答「谁是谁」（命名空间/别名/建档来源），
 *   是**已认出来之后**的登记。**「怎么认」这一层是空的**：
 *   `分不清` / `认错人` / `辨认` 在 engines 里逐条读完全是拿来说别的事的
 *   （分不清「你跳拍了」与「读不出来」之类）。
 *
 *   缺口后果很具体：正文里「门口那个像他的人」一出现，模型只能凭字面拍一个名字。
 *   双胞胎、易容、同名、背影这种场合**永远会被判成「就是他」**——因为没有任何一层会说
 *   「其实分不清」。认错一次，后面的关系、称呼、记忆全跟着错。
 *
 * ── 机制（排序 + 一条带 + 动态门槛）────────────────────────────
 *   `match(candidates, opt)`：
 *     · 按分数降序；冠军低于 `floor` ⇒ `unknown`（谁都不像）；
 *     · 冠军减亚军 < `margin` ⇒ `ambiguous`（**两个都说得通，不许挑一个**）；
 *     否则 `matched`。
 *   `calibrate(scores)` 从真实分布算门槛：取低分位 `genuineFloor`，
 *   `floor = clamp(genuineFloor - floorGap)`、`margin = clamp(0.9 - ... 口径见代码)`——
 *   门槛跟着总体走，不是写死一个 0.6。
 *
 * ── 缝合来源与许可 ──────────────────────────────────────────────
 *   来源：akinia0315/voice-familiarity，`profile_math.py:110-114`（`genuine_floor = p10`；
 *   `likely_threshold = clamp(genuine_floor - 0.12)`；`matched_threshold = max(likely + 0.08, min(0.90, floor - 0.035))`）
 *   与 `service.py:163-181`（`winner - runner_up < ambiguity_margin` ⇒ AMBIGUOUS）。
 *   Apache-2.0，允许搬代码；此处剥掉向量/声纹，留下**纯数值判据**（本仓的相似度可能来自
 *   任何地方：名字字形、描述重合、记忆命中，本模块不认来源）。
 *   `ambiguity_margin` 原文取 0.035 且 CLI 夹在 [0, 0.20]——本仓按同名口径进 bounds。
 *
 * ── 边界（全是否定式）──────────────────────────────────────────
 *   ① 总开关默认关闭。关闭时一律 `matched` 取冠军（`skipped:true`），
 *      不静默按「分不清」拦人——默认不改既有行为。
 *   ② **不改名册**：本模块不写 store，认完之后要不要建档由 registry 做。
 *   ③ 候选里 `score` 非有限数的整体剔除并记 `dropped`，不按 0 分处理（0 与「没分」不同）。
 *   ④ `unknown` 与 `ambiguous` **分列**：一个「谁都不像」、一个「两个都像」，
 *      处置相反（前者继续找，后者去追问或看更细的证据）。
 *   ⑤ 冠军唯一且达标时，`ambiguous` 不因「亚军也很像」而无限拖延：`hardGapRatio`
 *      给一条相对硬线（冠军比亚军高出其自身分数的这个比例以上就不算分不清）。
 *   ⑥ `margin` 可被 `opt.margin` 覆盖（同一场景里远近亲疏要求不同），但也受 bounds 约束。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_identitymatch_settings_v1';
  const DEF = { enabled: false, floor: 0.6, margin: 0.035, floorGap: 0.12, hardGapRatio: 0.25, maxCandidates: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'identityMatch',
    bounds: { floor: [10, 95], margin: [0, 20], floorGap: [2, 40], hardGapRatio: [5, 60], maxCandidates: [2, 32] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const m = WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
    // 百分比整数 ↔ 0..1 刻度
    if (m.floor > 1) m.floor = m.floor / 100;
    if (m.margin > 1) m.margin = m.margin / 100;
    if (m.floorGap > 1) m.floorGap = m.floorGap / 100;
    if (m.hardGapRatio > 1) m.hardGapRatio = m.hardGapRatio / 100;
    return m;
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { matches: 0, matched: 0, ambiguous: 0, unknown: 0, dropped: 0, calibrated: 0 };
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function pct(scores, p) {
    const a = scores.slice().sort(function (x, y) { return x - y; });
    if (!a.length) return 0;
    const i = Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))));
    return a[i];
  }
  /**
   * 从总体分数分布校准两道门槛（低分位驱动，不写死）。
   * @param {number[]} scores 一批已知「确实是他」的相似度
   */
  function calibrate(scores) {
    const cfg = settings();
    const list = (Array.isArray(scores) ? scores : []).map(Number).filter(function (n) { return Number.isFinite(n); });
    if (list.length < 3) return { ok: false, reason: 'too-few', need: 3, have: list.length };
    stat.calibrated++;
    const genuineFloor = pct(list, 0.10);
    // 门槛跟总体走：地板由真实低分位下拉（floorGap 与原文 0.12 同义），
    // 分不清带用原文的 0.035（CLI 把它夹在 [0, 0.20]，故此处亦夹）。
    const floor = Math.max(0.05, clamp01(genuineFloor - cfg.floorGap));
    const margin = clamp01(cfg.margin);
    return { ok: true, floor: floor, margin: margin, genuineFloor: genuineFloor, sample: list.length };
  }
  /**
   * 认人。
   * @param {Array<{who:string, score:number}>} candidates
   * @param {{margin?:number, floor?:number}} [opt]
   */
  function match(candidates, opt) {
    const cfg = settings();
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return { ok: false, reason: 'no-candidates' };
    if (!cfg.enabled) { stat.matches++; stat.matched++; return { ok: true, status: 'matched', skipped: true, who: (list[0] || {}).who || '' }; }
    stat.matches++;
    const kept = [];
    for (let i = 0; i < list.length && kept.length < cfg.maxCandidates; i++) {
      const c = list[i] || {};
      const s = Number(c.score);
      if (!c.who || !Number.isFinite(s)) { stat.dropped++; continue; }
      kept.push({ who: String(c.who).slice(0, 60), score: s });
    }
    if (!kept.length) { stat.dropped++; return { ok: false, reason: 'nothing-scored' }; }
    kept.sort(function (a, b) { return b.score - a.score; });
    const o = opt || {};
    const floor = Number.isFinite(Number(o.floor)) ? Number(o.floor) : cfg.floor;
    const margin = Number.isFinite(Number(o.margin)) ? Number(o.margin) : cfg.margin;
    const top = kept[0];
    if (top.score < floor) {
      stat.unknown++;
      return { ok: true, status: 'unknown', who: '', top: top, floor: floor, reason: 'below-floor' };
    }
    const second = kept[1] || null;
    if (second) {
      const gap = top.score - second.score;
      const hard = top.score * cfg.hardGapRatio;
      if (gap < margin && gap < hard) {
        stat.ambiguous++;
        return { ok: true, status: 'ambiguous', who: '', top: top, second: second, gap: gap, margin: margin, reason: 'two-too-close' };
      }
      stat.matched++;
      return { ok: true, status: 'matched', who: top.who, top: top, second: second, gap: gap, margin: margin };
    }
    stat.matched++;
    return { ok: true, status: 'matched', who: top.who, top: top, second: null };
  }
  function statOf() { return Object.assign({}, stat); }
  WA.identityMatch = { match: match, calibrate: calibrate, settings: settings, saveSettings: saveSettings, stat: statOf, REG: __REG, DEF: DEF };
})();
