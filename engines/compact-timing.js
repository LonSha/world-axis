/**
 * WorldAxis engines/compact-timing.js (v2.251.0) — 折叠时机（缓存冷热判据）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   本仓对上下文压缩只回答过「压多少」：`inject-budget.js` 分配注入预算，
 *   `deep-clean.js` 清可清项，`length-policy.js` 定长度口径。
 *   **没有一处回答「什么时候压」**——`缓存热` / `promptCache` / `cacheTTL`
 *   在 engines|core 全库零命中（实测 0 命中）。
 *
 *   后果不是「压不动」，是**压得亏**：每次折叠都会改注入前缀，让宿主侧的前缀缓存
 *   整段作废。缓存还热的时候折，省下的读量要几十轮才回本；缓存已经冷了才折，
 *   反正要重写、写得更少。**同一个动作在两种时机下是赚和亏的区别，而现仓不区分。**
 *
 * ── 机制（纯函数，只答折不折）────────────────────────────────────
 *   `plan({ foldTokens, tailTokens, lastReplyMs, ttlMs, historyBudget, nowMs })` 返回
 *   `action`：
 *     · `none`  —— 不够折（可折叠未达触发线）
 *     · `hold`  —— 够了，但缓存热着，先等
 *     · `fold`  —— 够且该折（缓存已冷 / 从没回过 / 撞硬线 / 快撑满窗口）
 *   两条硬线让 `hold` 不能无限等：可折叠达 `warmHoldMaxTokens`，或原文占历史预算达
 *   `warmHoldBudgetRatio`——再等下去就要静默截断，那是不带摘要的失忆，比赔一次缓存更贵。
 *
 * ── 缝合来源与许可 ──────────────────────────────────────────────
 *   来源：KardKuro/GranCyan-open `js/05-continuity-compaction.js:37-78` 的
 *   `continuityPlan`（作者附了实测成本账：折 8k 省 0.1×8k，换 ~2× 重写，七十轮才回本）。
 *   许可允许搬代码；此处按其口径重写为**与宿主无关的纯函数**（原实现耦合消息数组
 *   与模型 id，本仓只接数字，取值留在调用点）。
 *
 * ── 与本仓既有模块的分工（不重叠）────────────────────────────────
 *   · `inject-budget.js` —— 装多少（预算分配）；
 *   · `length-policy.js` —— 算多长算超（长度口径）；
 *   · 本模块 —— **什么时候动手**（时机判据）。三者互不读写。
 *
 * ── 边界（全是否定式）───────────────────────────────────────────
 *   ① 总开关默认关闭。关闭时一律 `disabled`，调用方按原节奏走。
 *   ② **不看正文、不自己折**：只返回 action，折叠由调用方执行。
 *   ③ 参数非法不静默：`bad-fold` / `bad-tail` / 非有限数一律如实报，不猜默认值。
 *   ④ `hold` **必须有理由字段**（`reason` 必填于 hold/fold 两态），不许「反正就是先不折」。
 *   ⑤ ttl 走 settingsBus 注册并有 bounds；硬线两条同理，不散落魔数。
 *   ⑥ 只认调用方给的 `lastReplyMs`：**多个模型共用一个判据会互相误热**，所以
 *      谁的缓存热由调用方指定，本模块不认模型身份。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_compacttiming_settings_v1';
  const DEF = { enabled: false, ttlMs: 300000, foldableTrigger: 8000, warmHoldMaxTokens: 40000, warmHoldBudgetRatio: 80, minMessages: 10, tailTokens: 5000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'compactTiming',
    bounds: { ttlMs: [30000, 7200000], foldableTrigger: [500, 200000], warmHoldMaxTokens: [1000, 400000], warmHoldBudgetRatio: [10, 100], minMessages: [2, 100], tailTokens: [200, 60000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const m = WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
    if (m.warmHoldBudgetRatio > 1) m.warmHoldBudgetRatio = m.warmHoldBudgetRatio / 100;
    return m;
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { plans: 0, folds: 0, holds: 0, nones: 0, bad: 0, lastReason: '' };
  function clampNum(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }
  /**
   * 判这一次折不折。纯函数，不碰 store、不碰网络。
   * @param {{foldTokens:number, tailTokens:number, lastReplyMs?:number, historyBudget?:number, nowMs?:number, messages?:number}} q
   */
  function plan(q) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, action: 'disabled', reason: '总开关关闭' };
    const o = q || {};
    const foldTokens = Number(o.foldTokens);
    const tailTokens = Number(o.tailTokens);
    if (!Number.isFinite(foldTokens) || foldTokens < 0) { stat.bad++; return { ok: false, action: 'bad-fold' }; }
    if (!Number.isFinite(tailTokens) || tailTokens < 0) { stat.bad++; return { ok: false, action: 'bad-tail' }; }
    stat.plans++;
    const msgs = Number.isFinite(Number(o.messages)) ? Number(o.messages) : Infinity;
    if (foldTokens < cfg.foldableTrigger || msgs < cfg.minMessages) {
      stat.nones++;
      return { ok: true, action: 'none', reason: '可折叠尚未达触发线', foldTokens: foldTokens, tailTokens: tailTokens };
    }
    const now = Number.isFinite(Number(o.nowMs)) ? Number(o.nowMs) : clockNow('compactTiming.plan');
    const last = Number(o.lastReplyMs);
    const age = Number.isFinite(last) && last > 0 ? now - last : Infinity;
    if (!Number.isFinite(age) || age >= cfg.ttlMs) {
      stat.folds++;
      const why = Number.isFinite(age) ? '缓存已冷（距上次回复 ' + Math.round(age / 60000) + ' 分钟）' : '从没有过上次回复';
      stat.lastReason = why;
      return { ok: true, action: 'fold', reason: why, foldTokens: foldTokens, tailTokens: tailTokens };
    }
    if (foldTokens >= cfg.warmHoldMaxTokens) {
      stat.folds++;
      const why = '缓存热着但可折叠已达硬线 ~' + foldTokens;
      stat.lastReason = why;
      return { ok: true, action: 'fold', reason: why, foldTokens: foldTokens, tailTokens: tailTokens };
    }
    const budget = Number(o.historyBudget);
    if (Number.isFinite(budget) && budget > 0 && (foldTokens + tailTokens) > budget * cfg.warmHoldBudgetRatio) {
      stat.folds++;
      const why = '缓存热着但原文 ~' + (foldTokens + tailTokens) + ' 快撑满窗口（历史可用 ' + Math.round(budget) + '）';
      stat.lastReason = why;
      return { ok: true, action: 'fold', reason: why, foldTokens: foldTokens, tailTokens: tailTokens };
    }
    stat.holds++;
    const held = '缓存还热（距上次回复 ' + Math.round(age / 60000) + ' 分钟 < ' + Math.round(cfg.ttlMs / 60000) + '），可折叠 ~' + foldTokens + ' 先不折';
    stat.lastReason = held;
    return { ok: true, action: 'hold', reason: held, foldTokens: foldTokens, tailTokens: tailTokens };
  }
  function statOf() { return Object.assign({}, stat); }
  WA.compactTiming = { plan: plan, settings: settings, saveSettings: saveSettings, stat: statOf, REG: __REG, DEF: DEF };
})();
