/**
 * WorldAxis engines/scene-budget.js (v2.251.0) — 场景频次上限（注意预算）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   本仓「多久推进一次」全是**固定节奏**：`beat.js` / `tempo.js` / `rhythm-loop.js`
 *   按轮计，`offline-tick.js` 按离线时长一刀。**没有任何一处看「这一轮到底值不值得翻」。**
 *   现实中玩家盯着同一间屋子来回走、反复翻同一个抽屉时，世界照旧每轮推进一遍——
 *   该静的地方一声不吭（读者以为出事了），该动的地方没动够。
 *
 *   现场缺口实测：`降频` / `节流` 在 core 与 engines 命中 18 处，但**逐条读完全是
 *   「调用次数节流」（API 并发、注入预算、渲染帧），没有一处是「场景有没有真变化」。**
 *   注意预算这一层是空的。
 *
 *   （同名缺口在**采集侧**已被别的项目独立验证过：gaze 的 `gaze_local.py:717-770`
 *   对屏幕帧做 hamming 距离，静止 streak ≥3 就 `interval × (1.5+0.3n)` 封顶 120s，
 *   前台窗口一换立刻复位。本模块把同一形状搬到**叙事轮**上。）
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `note(signature)` 报「这一轮的场景指纹」，返回 `advance:true/false`：
 *   指纹没变 ⇒ 计数 streak、按倍率拉长间隔、到阈值判「不必翻」；
 *   指纹变了 或 外部事件打断 ⇒ 立刻复位到 1 倍。
 *   指纹由调用方给（**本模块不猜、不读正文**），所以「什么算变化」留在调用点。
 *
 * ── 缝合边界（否定式，每条都有判据咬）──────────────────────────────
 *   ① 总开关默认关闭。关闭时 `note()` 一律 `advance:true`，不参与计数
 *      （默认不替任何人把推进拖慢）。
 *   ② **只在「没变」上加长**，`streak < stallFrom` 一律 1 倍：静止两三轮不该被罚。
 *   ③ 倍率有硬顶（`maxFactor`）与硬底（1 倍），长局里不会越退越离谱。
 *   ④ `stallFrom` / `maxFactor` / `holdFrom` 全部走 settingsBus 注册并有 bounds，
 *      不散落魔数。
 *   ⑤ `reset()` 是显式打断口（换场、玩家主动开口、外部事件），复位到 streak 0，
 *      与「指纹变了」等价但**不消耗一次比对**。
 *   ⑥ **只给判据，不推世界**：返回 `advance` 之后翻不翻、翻什么，由 beat/tempo 决定；
 *      本模块不写 store 的任何剧情面。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_scenebudget_settings_v1';
  const DEF = { enabled: false, stallFrom: 3, maxFactor: 8, holdFrom: 6, stepFactor: 0.5, maxRows: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'sceneBudget',
    bounds: { stallFrom: [1, 12], maxFactor: [2, 30], holdFrom: [1, 24], stepFactor: [10, 100], maxRows: [4, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const m = WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
    if (m.stepFactor > 1) m.stepFactor = m.stepFactor / 100;
    if (m.holdFrom < m.stallFrom) m.holdFrom = m.stallFrom;
    return m;
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { notes: 0, stalls: 0, holds: 0, resets: 0, evicted: 0, badInput: 0, lastReason: '' };
  function rows() {
    const s = WA.store && WA.store.get ? WA.store.get() : {};
    const m = s && s.sceneBudget;
    return (m && typeof m === 'object') ? m : {};
  }
  function transact(fn, why) {
    if (!WA.store || !WA.store.transact) { try { fn(null); } catch (e) {} return false; }
    try { WA.store.transact(fn, 'sceneBudget:' + why); return true; } catch (e) { stat.lastReason = 'tx-failed'; return false; }
  }
  function sig(v) {
    if (v === null || v === undefined) return '';
    const t = String(v).replace(/\s+/g, ' ').trim();
    return t.length > 120 ? t.slice(0, 120) : t;
  }
  function factorOf(streak, cfg) {
    if (streak < cfg.stallFrom) return 1;
    const raw = 1 + (streak - cfg.stallFrom + 1) * cfg.stepFactor;
    return Math.min(cfg.maxFactor, Math.round(raw * 100) / 100);
  }
  /**
   * 报一轮场景指纹，返回本轮该不该推进。
   * @param {string} signature 场景指纹（同场景重复时应当相同）
   * @param {object} [opt] { key }：可选场景键，缺省按单一全局账
   * @returns {{ok:boolean, reason?:string, advance:boolean, streak:number, factor:number, held:boolean}}
   */
  function note(signature, opt) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', advance: true, streak: 0, factor: 1, held: false };
    const key = (opt && opt.key ? String(opt.key) : '_').slice(0, 40) || '_';
    const cur = sig(signature);
    if (!cur) { stat.badInput++; return { ok: false, reason: 'empty-signature', advance: true, streak: 0, factor: 1, held: false }; }
    stat.notes++;
    const all = rows();
    const prev = all[key] || { sig: '', streak: 0 };
    const same = prev.sig === cur;
    const streak = same ? (prev.streak || 0) + 1 : 0;
    const factor = factorOf(streak, cfg);
    const held = streak >= cfg.holdFrom;
    if (same) stat.stalls++; else stat.resets++;
    if (held) stat.holds++;
    transact(function (d) {
      if (!d) return true;
      d.sceneBudget = d.sceneBudget || {};
      d.sceneBudget[key] = { sig: cur, streak: streak, at: clockNow('sceneBudget.note') };
      const keys = Object.keys(d.sceneBudget);
      if (keys.length > cfg.maxRows) {
        keys.sort(function (a, b) { return (d.sceneBudget[a].at || 0) - (d.sceneBudget[b].at || 0); });
        while (keys.length > cfg.maxRows) { delete d.sceneBudget[keys.shift()]; stat.evicted++; }
      }
      return true;
    }, 'note');
    return { ok: true, advance: !held, streak: streak, factor: factor, held: held };
  }
  /** 显式打断：换场/玩家主动开口/外部事件。与「指纹变了」等价但不耗一次比对。 */
  function reset(opt) {
    const cfg = settings();
    const key = (opt && opt.key ? String(opt.key) : '_').slice(0, 40) || '_';
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    stat.resets++;
    transact(function (d) { if (d && d.sceneBudget) delete d.sceneBudget[key]; return true; }, 'reset');
    return { ok: true };
  }
  /** 只读快照。 */
  function view() {
    const cfg = settings();
    const all = rows();
    return {
      enabled: cfg.enabled, stallFrom: cfg.stallFrom, holdFrom: cfg.holdFrom, maxFactor: cfg.maxFactor,
      keys: Object.keys(all).length,
      rows: Object.keys(all).map(function (k) {
        const r = all[k] || {};
        return { key: k, streak: r.streak || 0, factor: factorOf(r.streak || 0, cfg), held: (r.streak || 0) >= cfg.holdFrom };
      })
    };
  }
  function statOf() { return Object.assign({}, stat); }
  WA.sceneBudget = { note: note, reset: reset, view: view, stat: statOf, settings: settings, saveSettings: saveSettings, REG: __REG, DEF: DEF };
})();
