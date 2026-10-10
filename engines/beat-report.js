/**
 * WorldAxis engines/beat-report.js (v2.189.0) — 拍回报三档（缝 A1）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   本仓的编排面是**单向下发**的：`chapters` 开章、`campaign` 定阶段、`beat-mask` 遮未来拍、
 *   `rhythm-loop` 推相位 —— 全都在「往正文塞要求」。而**正文交回来的东西只有两种处置**：
 *   要么当没发生（继续推进），要么整章重排。
 *   实测：`缺铺垫` / `自裁量` 在 `engines|core` **零命中**；`打回` / `驳回` 只在
 *   `engines/world.js` 出现（是势力谈话的语义，无关）。
 *   后果正是上游 story-director 立项时那句话：**「演得出来，但缺一步因」与「根本立不住」
 *   在本仓长得一样** —— 前者只需补一句铺垫（零成本），后者才该打回重写。
 *   合成一个「不通过」之后，用户看到的是模型被反复重排，而真正缺的那一步因永远补不上。
 *
 *   缝合来源：SnowIII/story-director（MIT）`README §演不下去的时候：合理性审查` 与
 *   `model/design-rules.md` 的 `reviewAction` 三档。原文口径：
 *     · `调整`   —— 「有点对不上，但它自己能改（换场合 / 换个人触发 / 补一句来由 / 晚点发生，
 *                   **结果不变**）」⇒ **不重排、不花一次神谕**，只回一句「照你调整后的演，
 *                   但这一拍要达到的结果别丢」。
 *     · `缺铺垫` —— 「演得出来，但缺一步因」⇒ **把这一拍按住**，下一轮提醒它先补这一步。
 *     · `驳回`   —— 「真的立不住（要硬加设定 / 会让人物出戏 / 和已发生的事直接矛盾）」⇒
 *                   才走打回：**同一章累计 3 次**才去改篇章，且**同一章最多改一次**。
 *   上游把「前两档是给模型的自由裁量权」写成明文 —— 不到「打回重写」的地步就不打回，
 *   因为那是**零成本的**（不调用神谕）。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `report(rec)` —— 收一次回报，四值白名单里选一个，按档落账；
 *   ② `view()`      —— 当前「按住的那一拍 / 待补的因 / 本章打回计数」的可读面；
 *   ③ `buildBlock()`—— 只把**按住的那一拍**与**待补的因**交给正文（不是把审查意见书贴上去）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `report` 报 `disabled`、**不落账、不计数**。
 *   2 档位是**四值白名单**（`pass` / `adjust` / `setup` / `reject`）。表外任何值整次拒收
 *      （`bad-verdict`，带 `allowed`），**不做「宽容降级」** —— 降级会让「实在立不住」被
 *      静默折成「微调」，那正是本模块要治的病。
 *   3 **`adjust` 不得改这一拍的目的**。调整档必须给出 `purpose`（这一拍要达到的结果），
 *      且 `keeps !== false`；缺 `purpose` 报 `missing-purpose`，`keeps:false` 报
 *      `purpose-changed`。把「让乔治安退让」改成「乔治安根本没来」就不是微调 ——
 *      那是换了一拍，必须走 `reject`（本仓不许用微调档偷换目的）。
 *   4 **`setup` 必须给出缺的那一步因**（`need` 非空），否则报 `missing-need` 且**不按住** ——
 *      「缺铺垫」而不说缺什么，等于把一拍无限期悬起来。
 *   5 **`reject` 才计数**，且两次打回之间至少隔 `minGapRounds` 轮（不足报 `too-soon` 并带
 *      `wait`）—— 上游原话是「不会太频繁：两次打回重排之间至少隔几轮」。
 *   6 **计数按章累计、换章归零**：`chapterKey` 变化时 `strikes` / `redesigns` 一并归零。
 *      上游口径：「打回计数按章累计，不要求连续；换章就归零（重新生成本章也算新的一章）」。
 *   7 **同一章最多改一次**：`redesigns` 达上限后再报 `reject` 时**如实拒收**
 *      （`redesign-exhausted`），但仍**计数** —— 拒收的是「再去改篇章」，不是「这次不严重」。
 *   8 `pass` 档**清空**按住状态（按住与待补的因都必须被放掉），不累计任何计数。
 *   9 台账有界：`beatReport.log` 走 `evict` 单一出口（无挤出登记就是无限膨胀）。
 *  10 不写 store 之外的地方：回报账要跨轮延续，故进存档。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_beat_report_settings_v1';
  /** 四值白名单（表外一律拒收，绝不降级）。 */
  const VERDICTS = ['pass', 'adjust', 'setup', 'reject'];
  const DEF = { enabled: false, strikesPerChapter: 3, redesignPerChapter: 1, minGapRounds: 3, maxLog: 24 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'beatReport',
    bounds: {
      strikesPerChapter: [1, 9], redesignPerChapter: [0, 3],
      minGapRounds: [1, 12], maxLog: [4, 64]
    }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { reports: 0, adjusts: 0, setups: 0, rejects: 0, passes: 0, blocks: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }
  /**
   * 轮次严格判定。**刻意不用 `inputGuard.count`** —— 实测 `count('abc')===0`、`count(NaN)===0`、
   *   `count(Infinity)===0`：它把所有坏输入塌成 0，于是「轮次坏了」与「第 0 轮」在读数上同形
   *   （本仓最贵的那类默认值），而 `bad-round` 这个拒收码会因此**写得出、跑不到** ——
   *   那正是 tests/reject-code-gate.js 要抓的「存在但不可证」。
   *   口径同 rule-pack：「轮次不是有限数 ⇒ 拒收（NaN 不得被当成某一轮）」。
   */
  function roundOf(v) {
    if (v === undefined || v === null || v === '') {
      try {
        const s = (WA.store && WA.store.get && WA.store.get()) || null;
        if (WA.evolution && typeof WA.evolution.roundOf === 'function') {
          const n0 = WA.evolution.roundOf(s);
          return (typeof n0 === 'number' && isFinite(n0) && n0 >= 0) ? Math.floor(n0) : null;
        }
      } catch (e) { return null; }
      return null;
    }
    const n = (typeof v === 'number') ? v : Number(v);
    return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : null;
  }
  /** 给了没有（用于把「没给」与「给坏了」分成两个码 —— 它们的处置方向相反）。 */
  function notGiven(v) { return v === undefined || v === null || v === ''; }

  const EMPTY = { chapterKey: '', strikes: 0, redesigns: 0, lastRejectAt: -1, held: false, setupNeed: '', purpose: '', log: [] };
  function bucket(draft) {
    if (!draft.beatReport || typeof draft.beatReport !== 'object' || Array.isArray(draft.beatReport)) {
      draft.beatReport = { chapterKey: '', strikes: 0, redesigns: 0, lastRejectAt: -1, held: false, setupNeed: '', purpose: '', log: [] };
    }
    const b = draft.beatReport;
    if (typeof b.chapterKey !== 'string') b.chapterKey = '';
    if (typeof b.strikes !== 'number') b.strikes = 0;
    if (typeof b.redesigns !== 'number') b.redesigns = 0;
    if (typeof b.lastRejectAt !== 'number') b.lastRejectAt = -1;
    if (typeof b.held !== 'boolean') b.held = false;
    if (typeof b.setupNeed !== 'string') b.setupNeed = '';
    if (typeof b.purpose !== 'string') b.purpose = '';
    if (!Array.isArray(b.log)) b.log = [];
    return b;
  }
  function view() {
    const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {};
    const b = (s.beatReport && typeof s.beatReport === 'object') ? s.beatReport : EMPTY;
    return Object.assign({}, EMPTY, b, { log: (b.log || []).slice(-8) });
  }

  /**
   * 收一次拍回报。
   * @param {{verdict:string, chapterKey:string, purpose?:string, keeps?:boolean, need?:string, round?:number}} rec
   * @returns 逐档可判定的返回体（拒收一律带 reason，绝不静默成功）
   */
  function report(rec) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const r = rec || {};
    const verdict = clean(r.verdict, 16);
    if (VERDICTS.indexOf(verdict) < 0) {
      noteFault('bad-verdict');
      return { ok: false, reason: 'bad-verdict', allowed: VERDICTS.slice(), got: verdict };
    }
    const chapterKey = clean(r.chapterKey, 64);
    if (!chapterKey) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: 'chapterKey 必填（计数按章累计、换章归零）' }; }
    const purpose = clean(r.purpose, 240);
    const need = clean(r.need, 240);
    const round = (r.round === undefined || r.round === null) ? null : roundOf(r.round);

    // ── 拒收全部发生在**写盘之前**（半套落地会让「哪一档生效了」只能靠读列表猜）──
    if (verdict === 'adjust') {
      if (!purpose) { noteFault('missing-purpose'); return { ok: false, reason: 'missing-purpose', detail: '调整档必须给出这一拍要达到的结果（purpose）' }; }
      if (r.keeps === false) { noteFault('purpose-changed'); return { ok: false, reason: 'purpose-changed', detail: '调整档不得改变这一拍的目的；换了目的就走 reject' }; }
    }
    if (verdict === 'setup' && !need) {
      noteFault('missing-need');
      return { ok: false, reason: 'missing-need', detail: '缺铺垫必须指明缺的那一步因（need），否则不按住' };
    }
    if (verdict === 'reject' && round === null) {
      noteFault('missing-round');
      return { ok: false, reason: 'missing-round', detail: '驳回档要记账与间隔，必须给出决策轮号（round）' };
    }

    let out = null;
    const tx = (WA.store && WA.store.transact) ? WA.store.transact(function (draft) {
      const b = bucket(draft);
      // 换章归零（上游口径：换章就归零，重新生成本章也算新的一章）
      let reset = false;
      if (b.chapterKey !== chapterKey) { b.chapterKey = chapterKey; b.strikes = 0; b.redesigns = 0; b.lastRejectAt = -1; reset = true; }
      if (verdict === 'pass') {
        b.held = false; b.setupNeed = ''; b.purpose = '';
        b.log.push({ at: clockNow('beatReport'), verdict: verdict, chapter: chapterKey });
        out = { ok: true, verdict: verdict, chapterKey: chapterKey, reset: reset, held: false, strikes: b.strikes };
      } else if (verdict === 'adjust') {
        b.purpose = purpose;
        b.log.push({ at: clockNow('beatReport'), verdict: verdict, chapter: chapterKey, purpose: purpose });
        out = { ok: true, verdict: verdict, chapterKey: chapterKey, reset: reset, purpose: purpose, rerun: false, note: '按你调整后的演，但这一拍要达到的结果别丢' };
      } else if (verdict === 'setup') {
        b.held = true; b.setupNeed = need;
        b.log.push({ at: clockNow('beatReport'), verdict: verdict, chapter: chapterKey, need: need });
        out = { ok: true, verdict: verdict, chapterKey: chapterKey, reset: reset, held: true, need: need, note: '先补这一步，补完照常推进' };
      } else {
        // reject：间隔 → 计数 → 升级/上限
        const gap = (b.lastRejectAt >= 0 && round !== null) ? (round - b.lastRejectAt) : Infinity;
        if (isFinite(gap) && gap < cfg.minGapRounds) {
          out = { ok: false, reason: 'too-soon', wait: cfg.minGapRounds - gap, detail: '两次打回之间至少隔 ' + cfg.minGapRounds + ' 轮' };
          return false;   // 拒收**不落账**（间隔门未过时不得推进 lastRejectAt）→ 由外层择出 reason
        }
        b.strikes += 1;
        b.lastRejectAt = round;
        const escalate = b.strikes >= cfg.strikesPerChapter;
        let exhausted = false;
        if (escalate) {
          if (b.redesigns >= cfg.redesignPerChapter) exhausted = true;
          else b.redesigns += 1;
        }
        b.log.push({ at: clockNow('beatReport'), verdict: verdict, chapter: chapterKey, round: round, strikes: b.strikes, escalate: escalate, exhausted: exhausted });
        const tail = {
          verdict: verdict, chapterKey: chapterKey, reset: reset,
          strikes: b.strikes, escalate: escalate, redesigns: b.redesigns,
          exhausted: exhausted, maxStrikes: cfg.strikesPerChapter
        };
        // 边界 7：**达上限后如实拒收「再去改篇章」，但这次计数照落**。
        //   故这里是「提交 + 报拒收」——不是「回滚」：回滚会把这一笔 strikes 一起抹掉，
        //   于是「同一章被报了几次不合适」这个读数会永远停在上限那一次。
        //   ⚠ 写成**两条分支**而不是 `reason: exhausted ? 'x' : ''`：三元里的码**逃出拒收码扫描面**
        //   （tests/reject-code-gate.js 的 CODE_RE 只认内联字面量 `reason: 'x'`），
        //   而那正是「源码里存在、账本里看不见」的静默缺口 —— 本仓最贵的那类默认值。
        out = exhausted
          ? Object.assign({ ok: false, reason: 'redesign-exhausted' }, tail)
          : Object.assign({ ok: true, reason: '' }, tail);
      }
      if (WA.evict) WA.evict.array(b.log, 'beatReport.log', cfg.maxLog);
      return true;
    }, 'beatReport:report') : null;

    if (!out) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    // 拒收归因走同一出口（与各引擎同口径）：reason 为空即成功
    if (out.reason) noteFault(out.reason);
    if (out.verdict) {
      stat.reports++;
      if (out.verdict === 'pass') stat.passes++;
      else if (out.verdict === 'adjust') stat.adjusts++;
      else if (out.verdict === 'setup') stat.setups++;
      else stat.rejects++;      // exhausted 的那一次**也算一次驳回**（它确实被报了）
    }
    return out;
  }

  /** 只把「按住的那一拍」与「待补的因」交给正文 —— 不贴审查意见书（那是诊断面的事）。 */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const v = view();
    const lines = [];
    if (v.held && v.setupNeed) {
      lines.push('【这一拍先按住】当前拍**尚未落定**：缺的不是结论，是**那一步因**（' + v.setupNeed + '）。'
        + '本轮先把这一步补出来，补完照原计划推进 —— 不许跳过它直接给结果。');
    }
    if (v.purpose) {
      lines.push('【调整档的边界】你可以换场合、换人触发、补一句来由、让它晚点发生 —— 但**这一拍要达到的结果别丢**：' + v.purpose);
    }
    if (v.strikes > 0 && v.strikes < cfg.strikesPerChapter) {
      lines.push('【本章已被报不合适 ' + v.strikes + '/' + cfg.strikesPerChapter + ' 次】前两档是留给你的裁量权：'
        + '不到「实在立不住」（要硬加设定 / 会让人物出戏 / 和已发生的事直接矛盾）就不要报驳回。');
    }
    if (!lines.length) return '';
    stat.blocks++;
    return lines.join('\n') + '\n';
  }

  function diagnose() {
    const cfg = settings();
    const v = view();
    return {
      enabled: cfg.enabled,
      verdicts: VERDICTS.slice(),
      chapterKey: v.chapterKey,
      strikes: v.strikes, maxStrikes: cfg.strikesPerChapter,
      redesigns: v.redesigns, maxRedesigns: cfg.redesignPerChapter,
      minGapRounds: cfg.minGapRounds,
      held: v.held, setupNeed: v.setupNeed, purpose: v.purpose,
      recent: (v.log || []).slice(-5),
      // 「按住」与「待补的因」必须分开报：合成一个「有问题」之后用户答不出该补什么
      notes: [
        'adjust 档不消耗任何调用（上游口径：那是零成本的裁量权）',
        'setup 与 reject 绝不可合成一个「不通过」—— 前者要补因，后者才要重排',
        '换章归零：strikes 只在同一 chapterKey 内累计'
      ]
    };
  }

  WA.beatReport = {
    VERDICTS: VERDICTS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    report: report,
    view: view,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/beat-report.js', { kind: 'engine', ver: '2.189.0' });
})();