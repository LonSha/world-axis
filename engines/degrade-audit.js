/**
 * WorldAxis engines/degrade-audit.js (v2.517.0) — OPV26-6 降智行为面审计
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「模型是否被降低智力」有两重证据：
 *     ① **身份面**：回执里的模型名（modelReceipt / modelPin 已治）；
 *     ② **行为面**：同一个模型，吐字速度与输出长度的分布突然变差
 *        —— 这是服务端「同名但降配」（量化降级、上下文截断、并发挤压）
 *        唯一留得下的痕迹。
 *   第二重此前完全空白：grep 'degrade|降智|baselineTps' = 0 命中。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `baseline({channel})` 用**当前样本**建立基线（avgTps / avgCompletion /
 *   samples）→ `audit({channel})` 拿最近 N 笔与基线比：
 *   TPS 跌幅超阈值 ⇒ `tps-drop`；输出长度跌幅超阈值 ⇒ `token-drop`；
 *   同时读 modelReceipt.drifters() 看身份面是否已漂移 ⇒ `model-drift`。
 *   三档结论互不覆盖（身份漂了和行为变差是两件事，可以同时成立）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **样本不足不判**：基线样本数 < minSamples ⇒ 结论 `insufficient`，
 *      绝不返回 ok（拿两次调用判降智，是把噪声当证据）。
 *   ② 基线是快照：`baseline()` 显式建立，不会被后续喂账悄悄移动 ——
 *      基线自己漂了，就再也测不出漂移。
 *   ③ 只读消费：本模块不改 tokenBudget / modelReceipt 的任何状态（纯读它们）。
 *   ④ 拒收码只用 disabled / missing-channel / insufficient。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const wallNow = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_degrade_audit_settings_v1';
  const DEF = { enabled: true, tpsDropPct: 40, tokenDropPct: 35, recentN: 5, minSamples: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'degradeAudit',
    bounds: { tpsDropPct: [5, 95], tokenDropPct: [5, 95], recentN: [2, 50], minSamples: [3, 200] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))); }
  const stat = { baselines: 0, audits: 0, tpsDrops: 0, tokenDrops: 0, modelDrifts: 0, insufficient: 0, refused: 0, lastReason: '' };
  const BASE = {};   // channel -> {avgTps, avgCompletion, samples, at}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function rowsOf(channel) {
    const TB = WA.tokenBudget;
    if (!TB || typeof TB.view !== 'function') return [];
    const v = TB.view();
    if (!v || !v.ok) return [];
    //  tokenBudget.view 是聚合视图；回执账里有逐笔（含 tps），用它算均值更准
    const MR = WA.modelReceipt;
    if (MR && typeof MR.list === 'function') {
      const r = MR.list({ channel: channel, limit: 200 });
      if (r && r.ok && r.rows && r.rows.length) {
        return r.rows.map(function (x) { return { tps: x.tps, completionTokens: x.completionTokens }; })
          .filter(function (x) { return x.tps != null || x.completionTokens != null; });
      }
    }
    //  回执账没有该渠道时，退回 tokenBudget 的渠道聚合（无 tps，用 tokens 判）
    const ch = (v.channels || []).filter(function (c) { return c.channel === channel; })[0];
    if (!ch) return [];
    return [{ tps: null, completionTokens: ch.count > 0 ? ch.completionTokens / ch.count : null }];
  }
  function avgOf(rows, key) {
    const vals = rows.map(function (r) { return r[key]; }).filter(function (v) { return v != null && v > 0; });
    if (!vals.length) return null;
    return Math.round((vals.reduce(function (s, v) { return s + v; }, 0) / vals.length) * 100) / 100;
  }
  /** 建立基线快照（显式动作，不会被后续喂账移动）。 */
  function baseline(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel';
      return { ok: false, reason: 'missing-channel', hint: 'missing-channel：给哪个渠道建基线？' }; }
    const rows = rowsOf(channel);
    const avgTps = avgOf(rows, 'tps');
    const avgCompletion = avgOf(rows, 'completionTokens');
    if (rows.length < cfg.minSamples || (avgTps == null && avgCompletion == null)) {
      stat.insufficient++; stat.lastReason = 'insufficient';
      return { ok: false, reason: 'insufficient', channel: channel, samples: rows.length, need: cfg.minSamples,
        hint: 'insufficient：样本 ' + rows.length + '/' + cfg.minSamples + ' —— 拿两次调用判降智是把噪声当证据' };
    }
    BASE[channel] = { avgTps: avgTps, avgCompletion: avgCompletion, samples: rows.length, at: num(s.at) || wallNow() };
    stat.baselines++;
    return { ok: true, channel: channel, avgTps: avgTps, avgCompletion: avgCompletion, samples: rows.length };
  }
  /** 审计：最近 recentN 笔 vs 基线。三档结论互不覆盖。 */
  function audit(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const channel = str(s.channel);
    if (!channel) { stat.refused++; stat.lastReason = 'missing-channel'; return { ok: false, reason: 'missing-channel' }; }
    const base = BASE[channel];
    if (!base) {
      return { ok: false, reason: 'insufficient', channel: channel,
        hint: 'insufficient：这个渠道还没建基线 —— 先 baseline()，否则没有比较对象' };
    }
    const rows = rowsOf(channel).slice(0, cfg.recentN);
    if (!rows.length) {
      stat.insufficient++;
      return { ok: false, reason: 'insufficient', channel: channel,
        hint: 'insufficient：基线之后没有任何新样本，无法判断有没有变差' };
    }
    stat.audits++;
    const nowTps = avgOf(rows, 'tps');
    const nowCompletion = avgOf(rows, 'completionTokens');
    const pct = function (now, was) {
      if (now == null || was == null || was <= 0) return null;
      return Math.round(((now - was) / was) * 1000) / 10;   // 负=变差
    };
    const tpsPct = pct(nowTps, base.avgTps);
    const tokenPct = pct(nowCompletion, base.avgCompletion);
    const tpsDrop = tpsPct != null && tpsPct <= -cfg.tpsDropPct;
    const tokenDrop = tokenPct != null && tokenPct <= -cfg.tokenDropPct;
    // 身份面：回执模型漂移（读 modelReceipt.drifters 的跨引擎消费）
    let modelDrift = false;
    const MR = WA.modelReceipt;
    if (MR && typeof MR.drifters === 'function') {
      const d = MR.drifters();
      modelDrift = !!(d && d.ok && d.pairs && d.pairs.some(function (p) { return p.channel === channel; }));
    }
    if (tpsDrop) stat.tpsDrops++;
    if (tokenDrop) stat.tokenDrops++;
    if (modelDrift) stat.modelDrifts++;
    const verdicts = [];
    if (modelDrift) verdicts.push('model-drift');
    if (tpsDrop) verdicts.push('tps-drop');
    if (tokenDrop) verdicts.push('token-drop');
    const verdict = verdicts.length ? verdicts.join('+') : 'ok';
    return { ok: true, channel: channel, verdict: verdict, degraded: verdicts.length > 0,
      base: { avgTps: base.avgTps, avgCompletion: base.avgCompletion, samples: base.samples, at: base.at },
      now: { avgTps: nowTps, avgCompletion: nowCompletion, samples: rows.length },
      tpsPct: tpsPct, tokenPct: tokenPct, modelDrift: modelDrift,
      thresholds: { tpsDropPct: cfg.tpsDropPct, tokenDropPct: cfg.tokenDropPct },
      hint: verdicts.length
        ? ('行为/身份面变差：' + verdicts.join(' / ') + '（TPS ' + (tpsPct == null ? '无样本' : tpsPct + '%') + '，输出长度 ' + (tokenPct == null ? '无样本' : tokenPct + '%') + '）')
        : ('与基线一致（TPS ' + (tpsPct == null ? '无样本' : tpsPct + '%') + '，输出长度 ' + (tokenPct == null ? '无样本' : tokenPct + '%') + '）') };
  }
  function bases() {
    return { ok: true, count: Object.keys(BASE).length, channels: Object.keys(BASE).map(function (k) {
      return { channel: k, avgTps: BASE[k].avgTps, avgCompletion: BASE[k].avgCompletion, samples: BASE[k].samples, at: BASE[k].at };
    }) };
  }
  function statView() { return Object.assign({ baselines: Object.keys(BASE).length }, stat); }
  function reset() {
    Object.keys(BASE).forEach(function (k) { delete BASE[k]; });
    stat.baselines = 0; stat.audits = 0; stat.tpsDrops = 0; stat.tokenDrops = 0;
    stat.modelDrifts = 0; stat.insufficient = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.degradeAudit = {
    baseline: baseline, audit: audit, baselines: bases,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/degrade-audit.js', { kind: 'engine', ver: '2.517.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/degrade-audit 已加载（2.517.0）');
})();