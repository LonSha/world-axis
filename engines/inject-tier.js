/**
 * WorldAxis engines/inject-tier.js — 叙事脊柱 L2「注入分档」影子模式（v2.542.3）
 *
 * 【它治的病】L1 让轮最前面有了「本幕」，但后面的 165 个源仍然平权：正文模型收到
 *   一份并列清单，与这一场戏有关的人和事，被埋在世界状态、编年史、舆情里。
 *   本模块给每个 item 打一档 tier，**答「谁和这场戏有关」**，不改别的层的判断。
 *
 * 【v2.588.0：apply 已落地，但**两道开关都默认关着**】
 *   此前 mode 只有 shadow 一种有效值（填 apply 报 apply-not-implemented）。本版把它补上了：
 *     · 落地口是 **tierUp(items)**（独立于 observe）：enabled:false 或 mode:shadow 两种默认下
 *       都**原样返回同一个数组**（同一引用，零行为变化）；
 *     · 只有显式开 enabled:true + mode:apply 才裁，且**只裁 off 档**；
 *       focus 与 backdrop 一律保留（折叠 backdrop 要改写正文，是另一个能力，不混进来）；
 *     · 每一次裁掉的源都进 stat().lastDropped（可核可复算）；
 *     · observe() 仍是**只读**口：拿到 mode:apply 仍报 apply-not-implemented ——
 *       那句话现在仍是真的（observe 确实不改任何东西，落地不是它的职责）。
 *
 * 【历史：本批只出影子读数，不改正文（这是纪律，不是偷懒）】
 *   与 v2.524.0 的 injectDelta 同规：先有读数再改行为。所以
 *     · mode 只有 `shadow` 一种有效值；填 `apply` 会被明确拒绝（reason:'apply-not-implemented'），
 *       不假装已经能改注入结果；
 *     · observe() **绝不修改** 传入的 items、也不碰 finalItems —— 它只返回一份报告；
 *     · 「省了多少」是**字节账**（off 档的字符数），「误伤多少」本模块**算不出**：
 *       误伤要人对正文判读，机器自证只会自我背书。这一条写进报告字段 `misjudge: 'unmeasurable'`。
 *
 * 【三档的判定只用字符串交集，不调模型】
 *   focus    —— 命中本幕实体（在场的人 / 当前地点 / 本幕的 who 与 target / callback 文本），
 *               或 source 在 PRIORITY 里 rank ≤ 2（pinned 底座）。底座**永不**判背景：
 *               世界状态被折叠会让模型连基本事实都读不到，那不是分档，是失明。
 *   off      —— 与场景零交集，且**本模块自己观测到**该源内容连续 offRounds 轮未变。
 *               首次见到某源一律视为「刚变」（不判 off）—— 观测不足就不结论，与 L1 的 skipped 同规。
 *   backdrop —— 其余（与场景无交集的世界背景）。
 *
 * 【轮的来源】round 由 WA.evolution.roundOf(store) 取，取不到退回 0；0 轮时不做 off 判定
 *   （轮次不可用 ⇒ 推不出「距上次变化几轮」⇒ 不猜）。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const VERSION = '2.588.0';
  const LS_KEY = 'worldaxis_inject_tier_settings_v1';
  const DEF = { enabled: false, mode: 'shadow', offRounds: 3, minEntityLen: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'injectTier' };
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const __stat = {
    observes: 0, lastAt: 0, lastRound: 0,
    counts: { focus: 0, backdrop: 0, off: 0 }, rows: 0,
    savedChars: 0, totalChars: 0, applyRefused: 0, faults: {},
    // v2.588.0：落地面的读数（影子面不碰这几个字段）
    tiered: 0, droppedRows: 0, droppedChars: 0, lastDropped: []
  };
  // 纯内存观测：source → { hash, round, seen }。不写 store（本模块零写入）。
  const __seen = Object.create(null);

  function fault(face, e) { __stat.faults[face] = String((e && e.message) || e).slice(0, 120); }
  // G20 口径：唯一墙钟读取点。守卫 fallback 必须与本行共现（同一行有 WA.clock. 才算「守卫」），
  //   写成多行会让它被归为裸调。
  function clockNow(site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } }
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { fault('settings', e); return Object.assign({}, DEF); }
  }
  function storeState() { try { return (WA.store && WA.store.get && WA.store.get()) || {}; } catch (e) { fault('store', e); return {}; } }
  function roundOf(s) {
    try { if (WA.evolution && typeof WA.evolution.roundOf === 'function') return WA.evolution.roundOf(s) || 0; } catch (e) { fault('round', e); }
    try { if (s && s.evolution && typeof s.evolution.round === 'number') return s.evolution.round; } catch (e) {}
    return 0;
  }
  /** 内容指纹：只用于「这条源变了没有」，不参与任何产品判定。 */
  function fingerprint(text) {
    const str = String(text || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h.toString(36) + ':' + str.length;
  }

  /**
   * 本幕实体表：只取**真字段**，取不到就少一条，不补。
   *   在场的人 ← sceneNarrative.currentScene().present[]
   *   当前地点 ← currentScene().place / .location
   *   本幕 who / target ← sceneIntent.compose()（关闭时它返回 ok:false，此时只有场景实体）
   *   callback 文本 ← sceneIntent.compose().callback.text
   */
  function entityList(skipped) {
    const out = [];
    const push = function (v) {
      const t = String(v == null ? '' : v).trim();
      if (t.length >= DEF.minEntityLen && out.indexOf(t) < 0) out.push(t);
    };
    let sc = null;
    try { sc = (WA.sceneNarrative && typeof WA.sceneNarrative.currentScene === 'function') ? WA.sceneNarrative.currentScene() : null; }
    catch (e) { fault('scene', e); }
    if (!sc) { skipped.push({ face: 'sceneNarrative', reason: 'absent' }); }
    else {
      (Array.isArray(sc.present) ? sc.present : []).forEach(push);
      push(sc.place); push(sc.location);
      if (!sc.place && !sc.location && !(sc.present || []).length) skipped.push({ face: 'sceneNarrative', reason: 'empty-scene' });
    }
    let si = null;
    try { si = (WA.sceneIntent && typeof WA.sceneIntent.compose === 'function') ? WA.sceneIntent.compose({}) : null; }
    catch (e) { fault('sceneIntent', e); }
    if (!si || !si.ok) { skipped.push({ face: 'sceneIntent', reason: (si && si.reason) || 'not-ok' }); }
    else {
      if (si.item) { push(si.item.who); push(si.change && si.change.target); }
      if (si.callback) push(si.callback.text);
    }
    return out;
  }

  function rankOf(source) {
    try {
      const T = WA.injectBudgetTables;
      if (!T || !T.PRIORITY) return null;
      const row = T.PRIORITY[source];
      return row && typeof row.rank === 'number' ? row.rank : null;
    } catch (e) { fault('priority', e); return null; }
  }

  /** 单条判档：命中 → focus；否则看「观测到的静止轮数」→ off / backdrop。 */
  function classifyOne(item, ents, round, cfg) {
    const source = (item && item.source) || '未命名';
    const content = String((item && item.content) || '');
    const hit = [];
    for (const e of ents) { if (content.indexOf(e) >= 0) hit.push(e); }
    if (hit.length) return { source: source, tier: 'focus', why: '命中实体 ' + hit.slice(0, 3).join('/'), hit: hit.length };
    const rank = rankOf(source);
    if (rank != null && rank <= 2) return { source: source, tier: 'focus', why: 'PRIORITY rank=' + rank + '（pinned 底座不判背景）', hit: 0 };
    // 观测：内容指纹与本模块上一次看到的不同 ⇒ 这一轮刚变过
    const fp = fingerprint(content);
    const prev = __seen[source];
    let stillRounds = 0;
    let why = '';
    if (!prev) {
      __seen[source] = { hash: fp, round: round };
      why = '首次观测（视为刚变，不判 off）';
    } else if (prev.hash !== fp) {
      prev.hash = fp; prev.round = round;
      why = '本轮有变化（不判 off）';
    } else if (round > 0 && prev.round > 0 && round - prev.round >= cfg.offRounds) {
      stillRounds = round - prev.round;
      why = '与场景零交集，且已 ' + stillRounds + ' 轮未变（阈值 ' + cfg.offRounds + '）';
    } else {
      why = round > 0 ? '与场景零交集，但只静止 ' + Math.max(0, round - prev.round) + ' 轮（未到阈值）' : '轮次不可用（不做 off 判定）';
    }
    return { source: source, tier: stillRounds ? 'off' : 'backdrop', why: why, hit: 0, still: stillRounds };
  }

  /**
   * observe(items, opt) — 影子读数。**只读**。
   * 返回 { ok, shadow:true, round, counts, rows, savedChars, totalChars, savedShare, misjudge, skipped }
   */
  function observe(items, opt) {
    const cfg = settings();
    const skipped = [];
    if (!cfg.enabled) return { ok: false, reason: 'disabled', shadow: true, skipped: skipped };
    if (String(cfg.mode) !== 'shadow') {
      __stat.applyRefused += 1;
      return { ok: false, reason: 'apply-not-implemented', mode: String(cfg.mode), shadow: true, skipped: skipped };
    }
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return { ok: false, reason: 'no-items', shadow: true, skipped: skipped };
    const s = storeState();
    const round = roundOf(s);
    const ents = entityList(skipped);
    const counts = { focus: 0, backdrop: 0, off: 0 };
    const rows = [];
    let savedChars = 0;
    let totalChars = 0;
    for (const it of list) {
      const r = classifyOne(it, ents, round, cfg);
      counts[r.tier] += 1;
      rows.push(r);
      const len = String((it && it.content) || '').length;
      totalChars += len;
      if (r.tier === 'off') savedChars += len;
    }
    __stat.observes += 1; __stat.lastAt = clockNow('inject-tier.observe'); __stat.lastRound = round;
    __stat.counts = counts; __stat.rows = rows.length;
    __stat.savedChars = savedChars; __stat.totalChars = totalChars;
    if (cfg.mode === 'shadow' && !ents.length) skipped.push({ face: 'entities', reason: 'none' });
    return {
      ok: true, shadow: true, round: round, mode: 'shadow',
      counts: counts, rows: rows,
      savedChars: savedChars, totalChars: totalChars,
      savedShare: totalChars ? Math.round((savedChars / totalChars) * 1000) / 10 : 0,
      // 机器算不出「误伤」：那要人对正文判读。写死成不可测，别让读数看起来比它知道的更多。
      misjudge: 'unmeasurable',
      entities: ents.length,
      skipped: skipped
    };
  }

  /**
   * tierUp(items) — 落地面（v2.588.0 / L2-apply）。**默认零行为变化**。
   *   ① enabled:false（默认）⇒ 原数组原样返回（同一引用）；
   *   ② mode:shadow（默认）⇒ 同样原样返回 —— 影子就是影子；
   *   ③ 只有 enabled && mode===apply 才裁，且**只裁 off 档**：focus / backdrop 一律保留；
   *   ④ 不改传入数组：返回新数组，元素仍是原引用（调用方可逐条对比）；
   *   ⑤ 一条没裁时也返回原数组（不做无意义拷贝，也不让上游误以为换了一批）；
   *   ⑥ 裁掉的每一条进 __stat.lastDropped（源名 / 理由 / 静止轮数 / 字数）。
   * @param {Array} items 预算裁决后的注入项
   * @returns {Array} 原数组（未启用）或裁剪后的新数组
   */
  function tierUp(items) {
    const list = Array.isArray(items) ? items : [];
    const cfg = settings();
    if (!cfg.enabled) return list;                    // ①
    if (String(cfg.mode) !== 'apply') return list;    // ②
    if (!list.length) return list;
    const skipped = [];
    const s = storeState();
    const round = roundOf(s);
    const ents = entityList(skipped);
    const kept = [];
    const dropped = [];
    for (const it of list) {
      const r = classifyOne(it, ents, round, cfg);
      if (r.tier === 'off') {
        dropped.push({ source: r.source, why: r.why, still: r.still,
          chars: String((it && it.content) || '').length });
      } else kept.push(it);
    }
    if (!dropped.length) return list;                 // ⑤
    __stat.tiered += 1;
    __stat.droppedRows += dropped.length;
    __stat.droppedChars += dropped.reduce(function (a, x) { return a + x.chars; }, 0);
    __stat.lastDropped = dropped.slice();
    __stat.lastAt = clockNow('inject-tier.tierUp'); __stat.lastRound = round;
    return kept;                                      // ④
  }

  function summaryText(rep) {
    if (!rep || !rep.ok) return '分档影子：' + ((rep && rep.reason) || '无读数');
    return '分档影子：focus ' + rep.counts.focus + ' / backdrop ' + rep.counts.backdrop
      + ' / off ' + rep.counts.off + '｜若启用可省 ' + rep.savedChars + ' 字（占 ' + rep.savedShare + '%）'
      + '｜实体 ' + rep.entities + ' 个｜误伤不可测';
  }

  WA.injectTier = {
    VERSION: VERSION,
    observe: observe,
    tierUp: tierUp,
    classify: function (item, opt) {
      const cfg = settings();
      const s = storeState();
      const skipped = [];
      return classifyOne(item, entityList(skipped), roundOf(s) || ((opt && opt.round) || 0), cfg);
    },
    summaryText: summaryText,
    getSettings: function () { return settings(); },
    setSettings: function (patch) {
      if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
      try {
        const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
        WA.settingsBus.saveOrThrow(__REG, next);
        return { ok: true, settings: settings() };
      } catch (e) { return { ok: false, reason: 'save-failed', error: String((e && e.message) || e) }; }
    },
    stat: function () {
      return Object.assign({}, __stat, {
        counts: Object.assign({}, __stat.counts),
        lastDropped: __stat.lastDropped.slice(),
        faults: Object.assign({}, __stat.faults),
        tracked: Object.keys(__seen).length
      });
    },
    // 测试用：清掉内存观测（不影响产品行为，只在同一进程内复位）。
    __reset: function () { for (const k of Object.keys(__seen)) delete __seen[k]; __stat.tiered = 0; __stat.droppedRows = 0; __stat.droppedChars = 0; __stat.lastDropped = []; return true; }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/inject-tier.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/inject-tier 已加载（' + VERSION + '）');
})();
