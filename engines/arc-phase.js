/**
 * WorldAxis engines/arc-phase.js — 叙事脊柱 L3「弧线与核账」（v2.542.4）
 *
 * 【它治的病】L1 说出了「这一场要解决什么」，L2 备好了分档读数，但没人问
 *   「这一幕到底变了没有」，也没人管「现在在弧线的哪一段」。于是同一类戏可以连着演十轮，
 *   张力一直高位，谁也不收线 —— 剧情横向铺开，纵向不动（= 设计文档 D6 那条诊断）。
 *
 * 【本模块只做三件事】
 *   ① phase()  —— 按张力 / 走向给弧线段位：setup / rising / crisis / resolution（外加 holding）。
 *   ② settle() —— **懒核账**：把「上一条意图的 change」与本轮真实世界比对，判兑现 / 欠账。
 *   ③ debt     —— 欠账在下一次 compose 被提为本幕条目（why:'debt'），连续 abandonAfter 轮
 *                  不兑现就放弃并留痕（防死循环）。
 *
 * 【两处与设计文档不同，都是被现场事实逼的】
 *   ① **不订阅 `backstage:settled`**。文档 §6 要求订阅，但本仓对总线监听位有契约断言
 *      （tests/run.js 的「监听位数」成类锁：多占一位就是契约变更，须显式留痕）；
 *      `engines/world-briefing.js` 正是为避开它才选择不订阅。本模块同理：改成**懒核账** ——
 *      在下一次 compose 时比对上一轮的记录。语义等价（那次结算早就落库了），
 *      而且不占监听位、不引入「订阅了但从不触发」的假活跃。
 *   ② **不接 `arcGuide.plan()`**。文档 §6 最后一行要求把「在场的拍」当候选来源。
 *      v2.591.0 起这句话的前半截**已经过期**，本行跟着现场改：arcGuide.plan 现在**有**产品级
 *      调用方了 —— `engines/arc-guide-bridge.js` 把弧存在自己的桶里（`draft.arcGuideBridge`），
 *      并在 plan / view 两处真调 `WA.arcGuide.plan()`；所以「全仓没有产品级调用方」不再成立。
 *      本文件仍然不读它，但理由换了：arc-phase 判的是**相位**（本幕意图与上一轮承诺的兑现），
 *      与弧窗口不同源；两者都要「本幕该演哪几拍」，却一个按相位、一个按楼层窗口，
 *      合并会把两条不同判据混成一条。故这里**继续不接**，弧的在场由 bridge 那条路走。
 *
 * 【硬约束】
 *   · 默认关闭；关闭时 phase() 返回 ok:false、settle() 不写任何东西；
 *   · 唯一写入点是 `store.sceneIntent.records`（环形，cap 20，走 WA.evict.array，
 *     store.js 的容量表与 core/evict.js 的 SITES 两侧同名登记）；
 *   · 「兑现」只认**可数的真字段**：knowledge 键数、relations 的数值指纹、location/action/plan 指纹。
 *     读不到就返回 unknown（不当作兑现，也不当作欠账）—— 只有明确为 not-yet 才记欠账。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const VERSION = '2.542.4';
  const LS_KEY = 'worldaxis_arc_phase_settings_v1';
  const DEF = { enabled: false, windowRounds: 5, abandonAfter: 3, crisisScore: 75, setupScore: 35, fallback: 15 };
  const __REG = { key: LS_KEY, def: DEF, module: 'arcPhase' };
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // 站点名必须是**字面量**：evict 的站点扫描器按字面认调用点，写成常量时它读成「零调用」
  //   （v2.542.6 全量回归照出的「零调用：sceneIntent.records」正是这个）。容量声明仍在 store/evict 两侧。
  const CAP_RECORDS = 20;
  const __stat = { phases: 0, settles: 0, fulfilled: 0, debts: 0, abandoned: 0, lastPhase: '', lastAt: 0, faults: {} };
  // 弧线峰与章节锚点只存内存（重建会话即归零，与「章节开始时归零」同义）。
  let __peak = null;      // { score, round }
  let __chapter = null;   // 上一次看到的章节标识

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
  function chapterId(s) {
    try {
      const c = (WA.chapters && typeof WA.chapters.current === 'function') ? WA.chapters.current() : null;
      if (c) return String(c.id || c.title || c.name || JSON.stringify(c).slice(0, 40));
    } catch (e) { fault('chapter', e); }
    try { if (s && s.chapters && s.chapters.current) return String(s.chapters.current.id || s.chapters.current.title || ''); } catch (e) {}
    return '';
  }
  /** 章节一变，峰值归零（文档 §6：「章节开始时归零」）。 */
  function syncChapter(s) {
    const id = chapterId(s);
    if (id && id !== __chapter) { __chapter = id; __peak = null; return true; }
    if (id) __chapter = id;
    return false;
  }

  /**
   * phase() — 五值，其中 `holding` 是文档四值覆盖不到的区间（张力 35~75 且非上行非回落）。
   *   不硬塞进四值里：把「中间态」叫成 rising 或 setup 都会让下游规则做错决定。
   */
  function phase(opt) {
    const cfg = settings();
    const s = storeState();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', skipped: [] };
    const skipped = [];
    syncChapter(s);
    let t = null; let tr = null;
    try { t = (WA.plotGauge && typeof WA.plotGauge.tension === 'function') ? WA.plotGauge.tension({ push: false }) : null; }
    catch (e) { fault('tension', e); }
    if (!t || !t.ok) {
      skipped.push({ face: 'plotGauge', reason: (t && t.reason) || 'not-ok' });
      return { ok: false, reason: 'no-tension', skipped: skipped };
    }
    try { tr = (WA.plotGauge && typeof WA.plotGauge.trend === 'function') ? WA.plotGauge.trend() : null; }
    catch (e) { fault('trend', e); }
    if (!tr || !tr.ok) skipped.push({ face: 'plotGauge.trend', reason: (tr && tr.reason) || 'not-ok' });
    const round = roundOf(s);
    const score = Number(t.score) || 0;
    if (score >= cfg.crisisScore) __peak = { score: score, round: round };
    const rising = !!(tr && tr.ok && tr.direction === 'rising');
    let ph;
    if (score >= cfg.crisisScore) ph = 'crisis';
    else if (__peak && score <= __peak.score - cfg.fallback && !rising) ph = 'resolution';
    else if (rising) ph = 'rising';
    else if (score < cfg.setupScore) ph = 'setup';
    else ph = 'holding';
    __stat.phases += 1; __stat.lastPhase = ph; __stat.lastAt = clockNow('arc-phase.phase');
    return {
      ok: true, phase: ph, score: score, band: t.band || '',
      rising: rising, fellFromPeak: __peak ? (__peak.score - score) : null,
      round: round, chapter: __chapter || '', skipped: skipped
    };
  }

  /* ─────────── 核账：变化前的底数，必须在**写意图那一刻**取 ─────────── */
  function hashText(str) {
    const s = String(str || '');
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h.toString(36) + ':' + s.length;
  }
  function keysOf(o) { return (o && typeof o === 'object') ? Object.keys(o).length : 0; }
  function numSum(arr) {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      for (const k of Object.keys(r)) { if (typeof r[k] === 'number' && isFinite(r[k])) n += r[k]; }
    }
    return n;
  }
  /** 按轴取「可数的底数」；取不到返回 null（后续判 unknown，不记欠账）。 */
  function measure(s, change) {
    if (!change || !change.axis || !change.target) return null;
    const p = (s && s.people && s.people[change.target]) ? s.people[change.target] : null;
    if (!p) return null;
    if (change.axis === 'knowledge') return { kind: 'knowledge', value: keysOf(p.knowledge) };
    if (change.axis === 'relation') {
      const rel = p.profile && Array.isArray(p.profile.relations) ? p.profile.relations : null;
      if (!rel) return null;
      return { kind: 'relation', value: Math.round(numSum(rel) * 1000) / 1000 };
    }
    if (change.axis === 'situation') {
      const steps = (p.plan && Array.isArray(p.plan.steps)) ? p.plan.steps.length : 0;
      return { kind: 'situation', value: hashText(String(p.location || '') + '|' + String(p.action || '') + '|' + steps) };
    }
    return null;
  }

  /** 读环形记录（只读，不改）。 */
  function records(s) {
    const t = s && s.sceneIntent && Array.isArray(s.sceneIntent.records) ? s.sceneIntent.records : null;
    return t || [];
  }
  function lastRecord(s) { const r = records(s); return r.length ? r[r.length - 1] : null; }
  function debtOf(s) { return (s && s.sceneIntent && s.sceneIntent.debt) || null; }

  /**
   * settle(opt) — 与「上一条意图」对账。返回 { status: 'fulfilled'|'not-yet'|'unknown'|'none', ... }。
   * 只写：`sceneIntent.debt`（单槽，欠账或清空）。记录环形本身只在 record() 里写。
   */
  function settle(opt) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const s = storeState();
    const rec = lastRecord(s);
    if (!rec) return { ok: true, status: 'none', why: '还没有上一条意图' };
    const watch = rec.watch || null;
    if (!watch || watch.kind == null) return { ok: true, status: 'unknown', why: '上一条意图没有可数底数（不记欠账）' };
    const now = measure(s, { axis: watch.axis, target: watch.target });
    if (!now || now.kind !== watch.kind) return { ok: true, status: 'unknown', why: '目标字段已不可读（不记欠账）' };
    __stat.settles += 1;
    if (now.value !== watch.value) {
      __stat.fulfilled += 1;
      try { WA.store.transact(function (d) { if (d.sceneIntent) d.sceneIntent.debt = null; }); } catch (e) { fault('debt-clear', e); }
      return { ok: true, status: 'fulfilled', axis: watch.axis, target: watch.target, from: watch.value, to: now.value };
    }
    // 没兑现：欠账 +1 次；连续 abandonAfter 轮就放弃并留痕（防死循环）。
    const prevDebt = debtOf(s) || { attempts: 0 };
    const attempts = (Number(prevDebt.attempts) || 0) + 1;
    const giveUp = attempts >= cfg.abandonAfter;
    try {
      WA.store.transact(function (d) {
        d.sceneIntent = d.sceneIntent || { records: [], debt: null };
        d.sceneIntent.debt = giveUp ? null : { axis: watch.axis, target: watch.target, attempts: attempts, at: roundOf(d), why: 'not-settled' };
      });
    } catch (e) { fault('debt-write', e); }
    if (giveUp) {
      __stat.abandoned += 1;
      if (WA.log) WA.log('warn', '本幕欠账连续 ' + attempts + ' 轮未兑现，放弃（axis=' + watch.axis + ' target=' + watch.target + '）');
      return { ok: true, status: 'abandoned', axis: watch.axis, target: watch.target, attempts: attempts };
    }
    __stat.debts += 1;
    return { ok: true, status: 'not-yet', axis: watch.axis, target: watch.target, attempts: attempts };
  }

  /**
   * record(entry) — 写一条意图记录（唯一写入点）。环形 cap 20，走 evict。
   * entry: { round, change, callback, watch }
   */
  function record(entry) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    if (!entry || !entry.change) return { ok: false, reason: 'no-change' };
    let out = null;
    try {
      WA.store.transact(function (d) {
        d.sceneIntent = d.sceneIntent || {};
        if (!Array.isArray(d.sceneIntent.records)) d.sceneIntent.records = [];
        d.sceneIntent.records.push({
          round: Number(entry.round) || 0,
          change: { axis: entry.change.axis || '', target: String(entry.change.target || ''), why: String(entry.change.why || '').slice(0, 80) },
          callback: entry.callback ? { id: String(entry.callback.id || ''), text: String(entry.callback.text || '').slice(0, 40) } : null,
          watch: entry.watch ? { kind: entry.watch.kind, axis: entry.change.axis || '', target: String(entry.change.target || ''), value: entry.watch.value } : null,
          at: clockNow('arc-phase.record')
        });
        if (typeof WA.evict === 'object' && WA.evict && typeof WA.evict.array === 'function') {
          WA.evict.array(d.sceneIntent.records, 'sceneIntent.records', CAP_RECORDS);
        } else if (d.sceneIntent.records.length > CAP_RECORDS) {
          d.sceneIntent.records = d.sceneIntent.records.slice(-CAP_RECORDS);
        }
        out = d.sceneIntent.records.length;
      });
    } catch (e) { fault('record', e); return { ok: false, reason: 'write-failed', error: String((e && e.message) || e) }; }
    return { ok: true, size: out };
  }

  /** 供 L1 使用：当前欠账转成的候选条目（只读；L1 自己决定要不要用）。 */
  function debtItem() {
    const cfg = settings();
    if (!cfg.enabled) return null;
    const s = storeState();
    const d = debtOf(s);
    if (!d || !d.target) return null;
    return {
      kind: 'debt', who: String(d.target), what: '上一幕该变的事还没变',
      urgency: 'high', bucket: 'debt', why: 'debt:' + String(d.axis || '') + ' attempts=' + String(d.attempts || 0)
    };
  }

  WA.arcPhase = {
    VERSION: VERSION,
    phase: phase,
    settle: settle,
    record: record,
    debtItem: debtItem,
    /** 只读视图：记录 / 欠账 / 峰（诊断与 UI 用，不写）。 */
    view: function () {
      const s = storeState();
      return { records: records(s).slice(), debt: debtOf(s), peak: __peak ? { score: __peak.score, round: __peak.round } : null, chapter: __chapter || '' };
    },
    measure: function (change) { return measure(storeState(), change || {}); },
    getSettings: function () { return settings(); },
    setSettings: function (patch) {
      if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
      try {
        const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
        WA.settingsBus.saveOrThrow(__REG, next);
        return { ok: true, settings: settings() };
      } catch (e) { return { ok: false, reason: 'save-failed', error: String((e && e.message) || e) }; }
    },
    stat: function () { return Object.assign({}, __stat, { faults: Object.assign({}, __stat.faults) }); },
    // 测试用：清内存峰与章节锚点（不写 store）。
    __reset: function () { __peak = null; __chapter = null; return true; }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/arc-phase.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/arc-phase 已加载（' + VERSION + '）');
})();