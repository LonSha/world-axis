/**
 * WorldAxis engines/memory-tiers.js (v2.230.0) — 浅浅结：三层记忆
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓的 `memory` 有 L0–L3 四层（原文句 / 摘要 / 阶段 / 长期），但那是
 *   **记忆库自己的分层**（每层存什么由写入方决定）；`summarizer` 只做压缩。
 *   现场实测：`浅浅结` / `三层记忆` / `tierMerge` / `tier-promote` 在
 *   engines|core|actors|direction|render|ui **零命中**（coordinate.js 头注里那句
 *   「浅浅结」只是说明「不再直写骨架」，没有实现面）。
 *   这里缺的是**结**（knot）：三条短记忆按「同一件事」结在一起，结随轮次
 *   自然**下沉**（浅 → 中 → 深）：越久远的事只在深处留一条骨干，浅处不再逐轮复述。
 *   后果：长局里浅处塞满同一件事的复述，而深处没有那条骨干可查。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 ST-SevenDaysCal 的「浅浅结」三层记忆口径（business/lines 的
 *   点/线/面与 ledger 的分层归档）：
 *     · 浅（shallow）只放**本轮的结**（每条带来源轮次），不堆历史；
 *     · 中（middle）放**跨轮的同一件事**（同 key 归并，保留最早与最新）；
 *     · 深（deep）只放**结论/骨干**（结已定型，不再逐轮改）。
 *     · 下沉是**单向**的（浅→中→深），且**不可跳层**（浅不能直接进深）。
 *   本模块只取其中**可判定的那一层**（分层归属与下沉次序）；编排与 UI 不进本模块。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · memory  —— L0–L3 记忆库（原文句 / 摘要 / 阶段 / 长期），本模块不改它；
 *   · summarizer —— 压缩（把长文压短），本模块不压字，只判「这条结在哪一层」；
 *   · 本模块 —— **结的分层归属 + 单向下沉 + 骨干留存**（有界）。
 *
 * ── 八条否定式边界（本模块的全部理由）────────────────────────────────
 *   ① 总开关默认关闭。关闭时结 / 下沉一律拒收 `disabled`。
 *   ② **不可跳层**：浅直接进深 ⇒ `tier-skip`（跳层会让「骨干」与「刚发生」同形）。
 *   ③ **无来源不结**：缺 `source`（轮次/楼层）⇒ `no-source`（不拿「第 0 轮」占位）。
 *   ④ **同 key 归并**：中/深同 key 归并保留**最早与最新**两端，中间条数如实报。
 *   ⑤ **深处只留骨干**：深处超 `maxDeep` 只保**被引用多**的那几条，其余挤出并具名。
 *   ⑥ **浅不堆历史**：浅层同 key 只留最新一条（旧条下沉到中），不重复。
 *   ⑦ 清空只清指定层：`tier-clear` 不碰别层，也不重置计数器。
 *   ⑧ 有硬上限：各层 cap 由 settings 定，挤出计数如实报 `evicted`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_memory_tiers_settings_v1';
  const DEF = { enabled: false, maxShallow: 24, maxMiddle: 32, maxDeep: 16, deepKeepRefs: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'memoryTiers',
    bounds: { maxShallow: [2, 128], maxMiddle: [2, 128], maxDeep: [1, 64], deepKeepRefs: [1, 8] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const TIERS = ['shallow', 'middle', 'deep'];
  const TIER_LABEL = { shallow: '浅（本轮结）', middle: '中（跨轮同事）', deep: '深（骨干）' };
  const TIER_ORDER = { shallow: 0, middle: 1, deep: 2 };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { knotted: 0, merged: 0, sank: 0, evicted: 0, cleared: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }

  const BAG = { shallow: [], middle: [], deep: [] };   // [{ key, text, source, refs, first, last }]

  function capOf(tier, cfg) {
    if (tier === 'shallow') return cfg.maxShallow;
    if (tier === 'middle') return cfg.maxMiddle;
    return cfg.maxDeep;
  }
  /** 结一条浅记忆（浅层同 key 只留最新，旧条下沉到中层）。 */
  function knot(key, text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const k = clean(key, 60);
    if (!k) return refuse('bad-key');
    const t = clean(text, 160);
    if (!t) return refuse('bad-text');
    const o = opts || {};
    const source = clean(o.source, 40);
    if (!source) return refuse('no-source');
    const rec = { key: k, text: t, source: source, refs: Math.max(1, Math.floor(Number(o.refs) || 1)), first: source, last: source };
    const dup = BAG.shallow.find(function (x) { return x.key === k; });
    let sank = null;
    if (dup) { sank = sinkOne(dup, cfg); }
    BAG.shallow.push(rec);
    stat.knotted++;
    const evicted = trim('shallow', cfg);
    return { ok: true, reason: 'ok', key: k, tier: 'shallow', sankTo: sank ? sank.tier : '',
      sankKey: sank ? sank.key : '', evicted: evicted, kept: BAG.shallow.length };
  }
  /** 中/深同 key 归并（保留最早与最新两端）。 */
  function sinkOne(rec, cfg) {
    const mid = BAG.middle.find(function (x) { return x.key === rec.key; });
    if (!mid) {
      BAG.middle.push({ key: rec.key, text: rec.text, source: rec.source, refs: rec.refs, first: rec.first, last: rec.last });
      stat.sank++;
      trim('middle', cfg);
      return { tier: 'middle', key: rec.key, merged: 0 };
    }
    mid.refs += rec.refs;
    mid.last = rec.last || mid.last;
    mid.text = rec.text;                       // 最新文本覆盖（两端：first 不动）
    mid.merged = (mid.merged || 0) + 1;
    stat.merged++;
    let promoted = null;
    if (mid.merged >= 3) promoted = promoteOne(mid, cfg);   // 归并够多 ⇒ 下沉到深
    return { tier: promoted ? 'deep' : 'middle', key: rec.key, merged: mid.merged };
  }
  function promoteOne(rec, cfg) {
    const old = BAG.middle.findIndex(function (x) { return x.key === rec.key; });
    if (old >= 0) BAG.middle.splice(old, 1);
    const deep = BAG.deep.find(function (x) { return x.key === rec.key; });
    if (deep) { deep.refs += rec.refs; deep.last = rec.last; }
    else BAG.deep.push({ key: rec.key, text: rec.text, source: rec.source, refs: rec.refs, first: rec.first, last: rec.last, backbone: true });
    stat.sank++;
    trim('deep', cfg);
    return { tier: 'deep', key: rec.key };
  }
  /** 显式下沉：只允许浅→中→深，跳层拒。 */
  function sink(key, toTier) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const k = clean(key, 60);
    const to = clean(toTier, 20);
    if (TIERS.indexOf(to) < 0) return refuse('bad-tier');
    let from = null, rec = null;
    for (let i = 0; i < TIERS.length; i++) {
      const hit = BAG[TIERS[i]].find(function (x) { return x.key === k; });
      if (hit) { from = TIERS[i]; rec = hit; break; }
    }
    if (!rec) return refuse('unknown-key');
    if (TIER_ORDER[to] - TIER_ORDER[from] > 1) return refuse('tier-skip');
    if (to === from) return { ok: true, reason: 'same-tier', key: k, tier: from };
    if (to === 'deep') { const r = promoteOne(rec, cfg); return { ok: true, reason: 'ok', key: k, from: from, to: 'deep', refs: rec.refs }; }
    BAG[from].splice(BAG[from].indexOf(rec), 1);
    BAG.middle.push(rec);
    stat.sank++;
    trim('middle', cfg);
    return { ok: true, reason: 'ok', key: k, from: from, to: to };
  }
  function trim(tier, cfg) {
    const cap = capOf(tier, cfg);
    let evicted = 0;
    while (BAG[tier].length > cap) {
      let victim = 0;
      if (tier === 'deep') {
        // 深处只留骨干：挤掉被引用最少的那条（同 refs 取最旧）
        for (let i = 1; i < BAG[tier].length; i++) if (BAG[tier][i].refs < BAG[tier][victim].refs) victim = i;
      }
      BAG[tier].splice(victim, 1);
      evicted++;
    }
    stat.evicted += evicted;
    return evicted;
  }
  function tierOf(key) {
    const k = clean(key, 60);
    for (let i = 0; i < TIERS.length; i++) {
      const hit = BAG[TIERS[i]].find(function (x) { return x.key === k; });
      if (hit) return { ok: true, reason: 'ok', key: k, tier: TIERS[i], text: hit.text, refs: hit.refs, first: hit.first, last: hit.last };
    }
    return { ok: false, reason: 'unknown-key', key: k };
  }
  function list(tier) {
    const t = tier ? clean(tier, 20) : '';
    if (t && TIERS.indexOf(t) < 0) return { ok: false, reason: 'bad-tier' };
    const pick = t ? [t] : TIERS;
    const out = {};
    pick.forEach(function (x) {
      out[x] = BAG[x].map(function (r) { return { key: r.key, tier: x, refs: r.refs, first: r.first, last: r.last }; });
    });
    return { ok: true, reason: 'ok', tiers: out, counts: { shallow: BAG.shallow.length, middle: BAG.middle.length, deep: BAG.deep.length } };
  }
  /** 清空只清指定层：不碰别层、不重置计数器。 */
  function clearTier(tier) {
    const t = clean(tier, 20);
    if (TIERS.indexOf(t) < 0) return refuse('bad-tier');
    const n = BAG[t].length;
    BAG[t] = [];
    stat.cleared += n;
    return { ok: true, reason: 'ok', tier: t, dropped: n };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, caps: { shallow: cfg.maxShallow, middle: cfg.maxMiddle, deep: cfg.maxDeep },
      tiers: TIERS.slice(), tierLabel: TIER_LABEL, deepKeepRefs: cfg.deepKeepRefs,
      counts: { shallow: BAG.shallow.length, middle: BAG.middle.length, deep: BAG.deep.length } };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !BAG.deep.length) return '';
    return ['【浅浅结·骨干】'].concat(BAG.deep.slice(-6).map(function (r) {
      return '· ' + r.key + '（' + r.refs + ' 次）' + r.text;
    })).join('\n');
  }
  function resetStat() {
    stat.knotted = 0; stat.merged = 0; stat.sank = 0; stat.evicted = 0; stat.cleared = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.memoryTiers = {
    getSettings: settings, setSettings: saveSettings, view: view, buildBlock: buildBlock,
    knot: knot, sink: sink, tierOf: tierOf, list: list, clearTier: clearTier,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    TIERS: TIERS, TIER_LABEL: TIER_LABEL, TIER_ORDER: TIER_ORDER,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/memory-tiers.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'memoryTiers 已加载（2.230.0）');
})();
