/**
 * WorldAxis engines/health-preflight.js (v2.247.0) — 全向系统健康与生成质量前置预检器
 *
 * 核心职责（缝合 SillyTavern-Self-Check 核心机制）：
 *   ① 结构化与技术标签泄露防御：拦截未闭合或裸露的系统级技术标签（如 <think>, [STATUS_BAR], {{char}} 宏等）；
 *   ② 陈词滥调与过度修饰（去八股扫描）：检测高频滥用的临床用语、网络八股与浮夸形容词；
 *   ③ 格式与标点畸变自愈：排查未成对引号、破折号乱码、多余连续空行与断句截断；
 *   ④ 空间与行为逻辑矛盾探针：核验同一角色在同轮次中的位置冲突与全知越权；
 *   ⑤ 生成前后双向挂载：为 interceptor 提供前置约束与后置过滤净化。
 */
(function () {
  'use strict';
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_health_preflight_settings_v1';
  const DEF = {
    enabled: true,
    blockTechnicalLeaks: true,
    cleanCliche: true,
    enforceBalancedQuotes: true,
    checkSpatialConflicts: true,
    maxIssuesKept: 50
  };

  const __REG = {
    key: LS_KEY, def: DEF, module: 'healthPreflight',
    bounds: { maxIssuesKept: [10, 200] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  let _localSettings = null;

  function settings() {
    if (_localSettings) return Object.assign({}, DEF, _localSettings);
    if (WA.settingsBus && WA.settingsBus.read) {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
        : Object.assign({}, DEF, raw || {});
    }
    return Object.assign({}, DEF);
  }

  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    _localSettings = merged;
    if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
      const normalized = WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, merged)
        : merged;
      return WA.settingsBus.saveOrThrow(__REG, normalized);
    }
    return merged;
  }

  // 1. 技术标签泄露模式（禁止暴露给最终阅读正文）
  const TECHNICAL_LEAK_PATTERNS = [
    { id: 'leaked-think', re: /<\/?think>/i, label: '思维链思考标签泄露' },
    { id: 'leaked-macro', re: /\{\{(?:char|user|system|model|original)\}\}/i, label: 'SillyTavern 未展开宏语法泄露' },
    { id: 'leaked-status-bar', re: /\[STATUS_BAR\]|\[STATE_BAR\]|<state_bar>/i, label: '状态栏底层协议标签泄露' },
    { id: 'leaked-eval', re: /\[EVAL_START\]|\[EVAL_END\]|\[MOTIVE_EVAL\]/i, label: '动机仲裁求值块标签泄露' },
    { id: 'leaked-mvu', re: /\[\[MVU_[A-Z0-9_]+\]\]/i, label: 'MVU 运行时内部变量标签泄露' }
  ];

  // 2. 经典陈词滥调与过度八股词库（去八股扫描基准）
  const CLICHE_PATTERNS = [
    { id: 'cliche-gasp', re: /倒吸了一?口(?:凉|冷)气/, fix: '微不可察地一顿', label: '倒吸凉气八股' },
    { id: 'cliche-time-freeze', re: /仿佛时间(?:在这一刻|顿时)?(?:凝固|停止)了/, fix: '四周陡然安静下来', label: '时间凝固陈词滥调' },
    { id: 'cliche-complex-eyes', re: /(?:深邃|漆黑|复杂)的(?:眼眸|双眸|眸子)中?(?:闪过|掠过)一(?:抹|丝|道)(?:复杂|难明|莫测)/, fix: '眼神微凝', label: '深邃眼眸复杂八股' },
    { id: 'cliche-clinical-pleasure', re: /(?:无法言喻|难以名状)的(?:快感|愉悦|电流|战栗)/, fix: '一阵战栗', label: '临床式快感描写' },
    { id: 'cliche-puppet-string', re: /仿佛断了线的风筝/, fix: '踉跄跌倒', label: '断线风筝俗套比喻' }
  ];

  const __stat = {
    totalScans: 0,
    leaksDetected: 0,
    clichesCleaned: 0,
    quoteIssuesFixed: 0,
    spatialConflictsFound: 0,
    recentIssues: []
  };

  function recordIssue(category, desc, snippet) {
    const cfg = settings();
    const issue = {
      category: String(category || 'general'),
      desc: String(desc || ''),
      snippet: String(snippet || '').slice(0, 100),
      timestamp: clockNow('healthPreflight')
    };
    __stat.recentIssues.push(issue);
    if (__stat.recentIssues.length > cfg.maxIssuesKept) {
      __stat.recentIssues.shift();
    }
  }

  /**
   * 核心检测与修复：对输出文本执行前置/后置健康体检
   * @param {string} rawText 待体检文本
   * @param {Object} [opts] 选项，如 { autoFix: true, activeCharacters: [] }
   * @returns {{ text: string, clean: boolean, issues: Array }}
   */
  function inspectAndSanitize(rawText, opts) {
    const cfg = settings();
    if (!cfg.enabled || typeof rawText !== 'string' || !rawText.trim()) {
      return { text: rawText || '', clean: true, issues: [] };
    }

    const options = Object.assign({ autoFix: true }, opts || {});
    let text = rawText;
    const issues = [];
    __stat.totalScans++;

    // 1. 检查技术标签泄露
    if (cfg.blockTechnicalLeaks) {
      TECHNICAL_LEAK_PATTERNS.forEach(function (rule) {
        if (rule.re.test(text)) {
          issues.push({ id: rule.id, label: rule.label, severity: 'critical' });
          __stat.leaksDetected++;
          recordIssue('technical-leak', rule.label, text.match(rule.re)[0]);
          if (options.autoFix) {
            text = text.replace(new RegExp(rule.re.source, rule.re.flags + (rule.re.flags.includes('g') ? '' : 'g')), '');
          }
        }
      });
    }

    // 2. 检查陈词滥调与八股词
    if (cfg.cleanCliche) {
      CLICHE_PATTERNS.forEach(function (rule) {
        if (rule.re.test(text)) {
          issues.push({ id: rule.id, label: rule.label, severity: 'warning' });
          __stat.clichesCleaned++;
          recordIssue('cliche', rule.label, text.match(rule.re)[0]);
          if (options.autoFix && rule.fix) {
            text = text.replace(new RegExp(rule.re.source, rule.re.flags + (rule.re.flags.includes('g') ? '' : 'g')), rule.fix);
          }
        }
      });
    }

    // 3. 引号成对平衡自愈
    if (cfg.enforceBalancedQuotes && options.autoFix) {
      // 检查中文引号「」与“”
      const openCorner = (text.match(/「/g) || []).length;
      const closeCorner = (text.match(/」/g) || []).length;
      if (openCorner > closeCorner) {
        text += '」'.repeat(openCorner - closeCorner);
        issues.push({ id: 'unbalanced-corner-quotes', label: '自动闭合未成对直角引号', severity: 'info' });
        __stat.quoteIssuesFixed++;
      }
      const openDouble = (text.match(/“/g) || []).length;
      const closeDouble = (text.match(/”/g) || []).length;
      if (openDouble > closeDouble) {
        text += '”'.repeat(openDouble - closeDouble);
        issues.push({ id: 'unbalanced-double-quotes', label: '自动闭合未成对双引号', severity: 'info' });
        __stat.quoteIssuesFixed++;
      }
    }

    // 4. 清理多余空行
    text = text.replace(/\n{3,}/g, '\n\n');

    return {
      text: text,
      clean: issues.length === 0,
      issues: issues
    };
  }

  /**
   * 空间常识与逻辑冲突检测
   * 防止同一角色在不同地点同时被断言存在（分身矛盾）
   */
  function checkSpatialConsistency(geoSight, activeEvents) {
    const cfg = settings();
    if (!cfg.enabled || !cfg.checkSpatialConflicts) return { ok: true, conflicts: [] };

    const conflicts = [];
    if (!geoSight || !Array.isArray(geoSight.characters)) return { ok: true, conflicts: [] };

    // 建立角色-地点映射
    const charLocMap = {};
    geoSight.characters.forEach(function (c) {
      if (!c || !c.name) return;
      const place = c.place || (c.coordinates ? `${c.coordinates.x},${c.coordinates.y}` : null);
      if (charLocMap[c.name] && charLocMap[c.name] !== place) {
        conflicts.push({
          character: c.name,
          firstPlace: charLocMap[c.name],
          conflictPlace: place,
          reason: '角色在同轮次空间感知中出现两处互斥位置（瞬移或分身矛盾）'
        });
        __stat.spatialConflictsFound++;
        recordIssue('spatial-conflict', '角色空间位置分裂', `${c.name}: ${charLocMap[c.name]} vs ${place}`);
      } else {
        charLocMap[c.name] = place;
      }
    });

    return {
      ok: conflicts.length === 0,
      conflicts: conflicts
    };
  }

  /**
   * 供 interceptor 注入的健康防御规则提示
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    return [
      '[写作与空间常识防线]',
      '1. 严禁输出 <think>、{{char}} 等任何未闭合的技术/系统标签。',
      '2. 去除陈词滥调：避免使用「倒吸一口凉气」「仿佛时间凝固」等俗套八股，以精准白描展现微动作。',
      '3. 空间严密：角色不得在无合理移动时间的前提下跨空间瞬间现身；保持在场人员因果连续。'
    ].join('\n') + '\n';
  }
  function stat() {
    return Object.assign({}, __stat, {
      recentIssues: __stat.recentIssues.slice()
    });
  }

  // ═══ v2.259.0（V6 OPV6-4）：首轮零内容的三重门槛自检 ═══════════════════
  /**
   * 【它治什么（现场实测立据，tools/v6probes/p_three_gates.js）】
   *   出厂态下 107 个注入源里，**三重门槛全通过的只有 6 个**：
   *     · 74 个源被 `mod-off` 卡住（它依赖的引擎总开关关着 —— 勾了可见性也无效）
   *     · 3 个源被 `vis-off` 卡住（用户自己关的）
   *     · 24 个源 `unavailable`（没有模块级开关，由 store 直供，不假装知道）
   *   而玩家看到的现象是「世界没内容」。他会去改世界设定、改提示词、换模型 ——
   *   改不动，因为**那 74 个源根本没被调用**。
   *   本仓既有判据（v2.91.0 O4 的 faceAudit）已经把三态摆在一起了，但它躺在
   *   `render.visibilityStat()` 里，是**诊断面语言**。本函数把它翻成「门槛 + 一句话 + 一个动作」。
   *
   * 【三条口径】
   *   ① **只用现场读数，不另立一份真源**：引擎门槛走 `capabilityTier.shapeOf`
   *      （「什么算引擎」的唯一判据，与题材面/档位面同一份），可见性门槛走
   *      `render.visibilityStat().faceAudit`（v2.91.0 已把两面真值摆在一起），
   *      预算门槛走 `injectBudget.plan()/resolveBudget()`。本模块不重算任何一条。
   *   ② **每个门槛给一条动作，且动作必须真的可执行**：`fix` 里写的名字是现场存在的
   *      写入口（`capabilityTier.applyTier` / `render.setVisibility` / `injectBudget.resolveBudget`）。
   *      给不出动作的门槛如实报 `fix: null` + `why` —— 编一个假按钮比不给更坏。
   *   ③ **缺件如实报缺席，不当通过**：诊断面不在场就报 `absent`，绝不在没读到的情况下
   *      说「这道门槛过了」。这是本仓「缺数据不得当成通过」的一贯口径。
   *
   * @param {Object} [opts] `{ sample: 5 }` 控制样例条数（默认 5，上限 20）
   * @returns {{ok, gates, passed, blocked, verdict, nextAction, at}}
   */
  const __yf = { key: '', snap: null, hist: [] };
  const __YF_HIST = 12;
  function yfRoundKey() {
    let round = null;
    try {
      const li = (WA.store && typeof WA.store.get === 'function') ? WA.store.get().lastInjection : null;
      if (li && typeof li.round === 'number') round = li.round;
    } catch (e) { round = null; }
    if (round === null) {
      try {
        if (WA.evolution && typeof WA.evolution.roundOf === 'function') round = WA.evolution.roundOf();
      } catch (e) { round = null; }
    }
    // 开关面指纹：只数「开着且有 buildBlock」的台数，不数总台数
    //   （总台数只随代码变，不随玩家操作变；开着的台数才是「这一测的输入」）。
    let onN = 0, total = 0;
    try {
      Object.keys(WA).forEach(function (k) {
        if (k === 'modules') return;
        const sh = WA.capabilityTier.shapeOf(k);
        if (!sh || !sh.hasBuild) return;
        total++;
        if (sh.on === true) onN++;
      });
    } catch (e) { onN = -1; }
    return { round: round, onN: onN, total: total };
  }
  /** 产出面读数（按轮缓存；返回 yieldAttrib 的裁剪视图 + 趋势）。 */
  function yieldFaceRead() {
    const rk = yfRoundKey();
    const key = String(rk.round) + '|' + rk.onN + '|' + rk.total;
    let cached = false;
    if (__yf.key === key && __yf.snap) {
      cached = true;
    } else {
      let ya = null, err = '';
      try { ya = yieldAttrib({ limit: 6 }); } catch (e) { err = String((e && e.message) || e).slice(0, 80); }
      if (!ya || !ya.ok) {
        __yf.key = key;
        __yf.snap = { ok: false, why: err || (ya && ya.error) || 'yieldAttrib 不可用',
          yield: null, total: rk.total, off: null, fault: null, noData: null, trend: 'unknown', trendWhy: 'no-reading' };
        __yf.hist = [];
        return { snap: __yf.snap, cached: false };
      }
      // 按轮去重写入历史：同一轮重测（开关变了）是**覆盖**，不是新增一轮。
      if (rk.round !== null) {
        // v2.282.0：本文件第 13 行就有时钟守卫 clockNow，这处却裸调 Date.now() ——
        //   越过了冻结（历史轮次的时间戳要能随回放重现），且撞 G20 的裸调归零判据。
        const row = { round: rk.round, yield: ya.yield, total: ya.total, at: clockNow('healthPreflight.yieldHist') };
        const idx = __yf.hist.map(function (x) { return x.round; }).indexOf(rk.round);
        if (idx >= 0) __yf.hist[idx] = row; else __yf.hist.push(row);
        if (__yf.hist.length > __YF_HIST) __yf.hist = __yf.hist.slice(-__YF_HIST);
      }
      __yf.key = key;
      __yf.snap = { ok: true, yield: ya.yield, total: ya.total, off: ya.off, fault: ya.fault,
        noData: ya.noData, line: ya.line };
    }
    // 趋势：取历史里**最新两轮**（按 round 排序，不按插入序 —— 回滚会让 round 倒退）。
    let trend = 'unknown', trendWhy = 'not-enough-rounds', prev = null;
    const h = __yf.hist.slice().sort(function (a, b) { return a.round - b.round; });
    if (h.length >= 2) {
      const cur = h[h.length - 1], pv = h[h.length - 2];
      prev = pv.yield;
      if (cur.yield > pv.yield) trend = 'growing';
      else if (cur.yield < pv.yield) trend = 'shrinking';
      else trend = 'flat';
      trendWhy = '';
    } else if (h.length === 1) {
      trendWhy = 'first-round';
    } else {
      trendWhy = 'no-round';
    }
    const snap = Object.assign({}, __yf.snap, { trend: trend, trendWhy: trendWhy, prev: prev,
      rounds: h.length, fromCache: cached });
    return { snap: snap, cached: cached };
  }

  function threeGates(opts) {
    const o = Object.assign({ sample: 5 }, opts || {});
    const sampleN = Math.max(0, Math.min(20, Number(o.sample) || 0));
    const gates = [];
    const mk = function (id, label, state, nums, why, fix) {
      return { id: id, label: label, state: state, nums: nums || {}, why: why || '', fix: fix || null };
    };

    // ── 门槛①：引擎 enabled（走 capabilityTier 的唯一判据面）──────────────
    //   ⚠ 字段名按现场取：view() 报的是 `mechanisms` / `running` / `dormant`（**没有** `total` / `off`）。
    //     实施期首版照计划文字写成 v.total / v.off ⇒ 读到 undefined，门槛①的数字全是空洞。
    if (WA.capabilityTier && typeof WA.capabilityTier.view === 'function') {
      try {
        const v = WA.capabilityTier.view();
        gates.push(mk('engine', '世界机制开关', v.running > 0 ? 'pass' : 'blocked',
          { running: v.running, mechanisms: v.mechanisms, dormant: v.dormant, tier: v.tier },
          v.running > 0 ? '' : '一个世界机制都没在跑：所有产出都会是空',
          v.running > 0 ? null : { do: 'applyTier', arg: 'standard', hint: '切到标准档（会逐个真开并回读复核）' }));
      } catch (e) {
        gates.push(mk('engine', '世界机制开关', 'absent', {}, 'capabilityTier.view 读取异常：' + e.message, null));
      }
    } else {
      gates.push(mk('engine', '世界机制开关', 'absent', {}, '能力档位模块未加载，读不到引擎面', null));
    }

    // ── 门槛②：注入源 visibility（走 render 的 faceAudit，不自己重算两面对账）──
    let faceRows = [];
    if (WA.render && typeof WA.render.visibilityStat === 'function') {
      try {
        const vs = WA.render.visibilityStat();
        faceRows = Array.isArray(vs.faceAudit) ? vs.faceAudit : [];
        const on = faceRows.filter(function (x) { return x.face === 'on'; });
        const modOff = faceRows.filter(function (x) { return x.face === 'mod-off'; });
        const visOff = faceRows.filter(function (x) { return x.face === 'vis-off'; });
        const unavail = faceRows.filter(function (x) { return x.face === 'unavailable'; });
        // 判据按**比例**分三档，不是「有源在跑就算过」。
        //   ⚠ 实施期首版写的是 `on.length > 0 ? 'pass' : 'blocked'` —— 出厂态 107 源里
        //     只有 6 个通，照样报 pass（`3 道门槛都通，可以开始推演`）。这正是本仓点名的
        //     「把部分成功折成全成功」：玩家读到「都通」就不会去开那 74 个被总开关挡住的源。
        //   故：≥半数 ⇒ pass；>0 但不足半数 ⇒ degraded（部分成功就是部分成功）；=0 ⇒ blocked。
        const ratio = faceRows.length ? on.length / faceRows.length : 0;
        const visState = on.length === 0 ? 'blocked' : (ratio >= 0.5 ? 'pass' : 'degraded');
        gates.push(mk('visibility', '注入源可见性', visState,
          { sources: faceRows.length, on: on.length, modOff: modOff.length, visOff: visOff.length,
            unavailable: unavail.length, onRatio: Math.round(ratio * 100) / 100,
            sample: modOff.slice(0, sampleN).map(function (x) { return x.key; }) },
          on.length === 0
            ? '没有一个注入源真正进入正文：全部被可见性或模块总开关挡住'
            : (visState === 'degraded'
              ? ('只有 ' + on.length + '/' + faceRows.length + ' 个源在出内容：另有 ' + modOff.length
                + ' 个被模块总开关挡住、' + unavail.length + ' 个无模块级开关')
              : ''),
          modOff.length > 0
            ? { do: 'enableModule', arg: modOff[0].key, hint: '开 ' + modOff[0].key + ' 对应的模块（另有 ' + (modOff.length - 1) + ' 个同因；或直接切档位一次性打开）' }
            : (visOff.length > 0 ? { do: 'setVisibility', arg: visOff[0].key, hint: '把 ' + visOff[0].key + ' 的可见性勾回来' } : null)));
      } catch (e) {
        gates.push(mk('visibility', '注入源可见性', 'absent', {}, 'render.visibilityStat 读取异常：' + e.message, null));
      }
    } else {
      gates.push(mk('visibility', '注入源可见性', 'absent', {}, '注入器未加载，读不到可见性面', null));
    }

    // ── 门槛③：预算档位（走 injectBudget 的现算，不另立预算实现）────────────
    if (WA.injectBudget && typeof WA.injectBudget.resolveBudget === 'function') {
      try {
        const b = WA.injectBudget.resolveBudget();
        let plan = null;
        try { plan = WA.injectBudget.plan ? WA.injectBudget.plan() : null; } catch (e2) { plan = null; }
        const spent = plan && typeof plan.used === 'number' ? plan.used : null;
        const dropped = plan && Array.isArray(plan.dropped) ? plan.dropped.length : null;
        // 预算这道门槛的判据：预算有没有**真的把内容挤掉**。
        //   预算小但没挤掉任何东西 = 不是问题（如实报 pass，不制造焦虑）；
        //   挤掉了 = blocked（这一次真的少了内容）。
        const squeezed = dropped !== null && dropped > 0;
        gates.push(mk('budget', '注入预算', squeezed ? 'blocked' : 'pass',
          { budget: b.budget, source: b.source, contextSize: b.contextSize, used: spent, dropped: dropped },
          squeezed ? ('预算挤掉了 ' + dropped + ' 个源：这一轮正文真的变少了') : '',
          squeezed
            ? { do: 'resolveBudget', arg: b.budget, hint: '调高预算或关掉几个源（当前 ' + b.budget + 't，用了 ' + spent + 't）' }
            : null));
      } catch (e) {
        gates.push(mk('budget', '注入预算', 'absent', {}, 'injectBudget 读取异常：' + e.message, null));
      }
    } else {
      gates.push(mk('budget', '注入预算', 'absent', {}, '预算裁判未加载，读不到预算面', null));
    }

    // ── 门槛⑤：产出面（v2.279.0 · V7 OPV7-3：「开关全开但产出为零 = 世界没有运转」）──
    //
    // 【它治什么】
    //   前三道门槛读的全是**开关面与注入面**（引擎开没开 / 源可见没可见 / 预算挤没挤）。
    //   它们能证明「该开的都开了」，却证明不了「开了之后世界真的说出了什么」。
    //   实测现场：full 档 100 台带 buildBlock 的引擎全开，其中只有 12 台真交出非空内容 ——
    //   而三道门槛照样全过、verdict 报 running。玩家读到「都通」，世界里 88 台机制一个字没说。
    //   本门槛把「产出」本身变成判据：**读内容，不读开关**。
    //
    // 【判据（逐字写进代码，因为它就是这一项的全部）】
    //   · `blocked`  —— 有引擎开着、`yield === 0` ⇒ **世界没有运转**。
    //   · `degraded` —— 产出比上一轮**变少**（shrinking）⇒ 世界在退。
    //   · `pass`     —— 有产出、且没在退。
    //   · `absent`   —— 量不出来（capabilityTier/store 缺席 ⇒ yieldAttrib 报 ok:false）。
    //   ⚠ **趋势判不了不进 unknown**：世界刚开局时只有一轮读数、无从比较，
    //     那是**正常**而不是缺陷。把它塞进 unverifiable 会让每一局新世界永久挂一条「判不了」，
    //     判据噪声化之后没人会再看它。故趋势单列 `trend:'unknown'` 报出，不影响 state。
    //
    // 【为什么必须按轮缓存，而不是每次调都重测】
    //   `yieldAttrib` 要真调每台引擎的 `buildBlock()` 才拿得到长度（那是唯一的产出真源）。
    //   而 `threeGates` 被面板每次渲染调两三次、被诊断面再调一次 —— 不缓存就等于
    //   同一个瞬间把 100 台引擎各 build 六七遍。
    //   **更要紧的是副作用**：`buildBlock` 并不都无副作用（worldDiary.build 会推进它自己的
    //   `builds` 计数、livingWorld 会走 autonomousTick）。诊断面把被测者的计量抬高，
    //   属于「观测污染被观测者」—— 本仓明确反对。
    //   故按「轮次坐标 + 开关面指纹」双键缓存：同一轮、同一开关配置 ⇒ 复用同一份快照；
    //   任一变化 ⇒ 重测（玩家刚打开引擎却仍读到旧空产出，是另一种假读数）。
    //
    // 【趋势的真源：轮次坐标，不是调用次数】
    //   轮次取 `store.lastInjection.round`，回落到 `evolution.roundOf()`。
    //   两者都读不到时**不编轮次**（记 null），趋势一律 unknown —— 拿调用次数当轮次
    //   会把「同一轮被看三次」读成「三轮产出一样」。历史按轮去重、最多记 12 轮。
    let yieldState = 'absent', yieldNums = {}, yieldWhy = '', yieldFix = null;
    try {
      const yr = yieldFaceRead();
      const y = yr.snap;
      yieldNums = {
        yield: y.yield, total: y.total, off: y.off, fault: y.fault, noData: y.noData,
        // 判据原文：开关全开但产出为零 = 世界没有运转。故 onAll 与 yield 必须并排可读。
        onAll: (y.total !== null && y.off === 0),
        trend: y.trend, trendWhy: y.trendWhy, prev: y.prev, rounds: y.rounds,
        // 缓存命中情况也要报：否则「怎么这么快」与「怎么没重测」在读数上同形
        cached: y.fromCache
      };
      if (!y.ok) {
        yieldState = 'absent';
        yieldWhy = '产出面量不出来：' + y.why;
      } else if (y.yield === 0 && y.total > 0) {
        // 唯一一条「世界没有运转」的硬判据：开着、却一台都没交出内容。
        yieldState = 'blocked';
        yieldWhy = y.total + ' 台带产出面的机制一台都没交出内容（开关开着、也没有构建异常）：'
          + '世界没有运转 —— 这不是「还没到时候」，是这一轮世界一个字都没说';
        yieldFix = null;   // 不给「按这个就好」：成因是「还没有事件被喂进来」，得从世界内容侧解决
      } else if (y.trend === 'shrinking') {
        yieldState = 'degraded';
        yieldWhy = '产出比上一轮变少（' + y.prev + ' → ' + y.yield + ' 台）：世界在退';
        yieldFix = null;
      } else {
        yieldState = 'pass';
      }
    } catch (e) {
      yieldState = 'absent';
      yieldWhy = '产出面读取异常：' + ((e && e.message) || e);
    }
    gates.push(mk('yield', '世界产出面', yieldState, yieldNums, yieldWhy, yieldFix));

    // ── 门槛④：机制驱动面（v2.278.0 · V7 OPV7-2：「有开关、没驱动者、永远空产」）──
    //
    // 【它治什么】
    //   OPV7-5 的 driverLedger 已经把「谁在什么时机驱动哪个引擎」做成了产品内读数，
    //   但它是一张**登记表**，不是一道**门槛** —— threeGates 照样只看开关/可见性/预算，
    //   于是「机制开着、却没有任何产品登记的驱动入口」这件事**不影响任何结论**：
    //   玩家把档位切到 full、三道门槛全过、读到「可以开始推演」，
    //   而其中一批机制即使开着也永远 `buildBlock() === ''`。
    //   本门槛把那件事摆到 verdict 上：**能从 running 降级为 dormant 的只有它**。
    //
    // 【为什么降级方向是 dormant 而不是 degraded】
    //   degraded 说的是「内容少了一部分」（玩家看得见，只是不够）。
    //   dormant 说的是另一件事：**世界看起来在运转，一部分机制其实从来没被喂过**。
    //   两者同时成立时先说前者（内容少更要紧），但绝不能把后者折进「健康」里。
    //
    // 【判不了怎么办：这是本门槛最关键的一条裁决】
    //   driverLedger 的调用面扫描有三种口径（static / prefetch / runtime）。
    //   浏览器与无头宿主拿不到 FS，只能退到 runtime（只能读导出函数的函数体），
    //   `scan.canConclude === false` —— 此时 L3a/L3b **恒为零**，不是因为「都有人驱动」，
    //   是因为**根本判不了**。
    //   若这时把它算成「没通过」，面板会对所有人永久报红（那是拿一个读不到的判据说世界坏了）；
    //   若算成「通过」，则是把「不知道」当「健康」—— 本仓反复付过价的那类假绿。
    //   故本门槛**单列第三个态**：`unknown`（判不了）+ 顶层 `unverifiable` 计数。
    //   它**不进 ok 判定**（ok 问的是「能判的门槛过没过」），但它**必须出现在读数与措辞里** ——
    //   判不了就大声说判不了，而不是默默当通过。
    //   与之相对，driverLedger 未加载是**缺件**（模块根本没装上），那要进 absent 桶、
    //   按口径③让 ok 为假 —— 两者不是一回事，判不了不等于缺席。
    //
    // 【名单截断的自我保护】
    //   `layerNames.L3a/L3b` 受 `maxList`（默认 200）截断。若名单长度小于计数，
    //   就不能用名单去数「开着的 L3」—— 那会把「被截掉的那部分」默认当成「没开着」。
    //   此时同样落 `unknown` 并写明 truncated，不给一个偏小的数冒充结论。
    let driveState = 'unknown', driveNums = {}, driveWhy = '', driveFix = null;
    if (!WA.driverLedger || typeof WA.driverLedger.view !== 'function') {
      driveState = 'absent';
      driveWhy = '驱动者登记表未加载：读不到「这台机制有没有人驱动」的调用面（缺件不是通过）';
    } else {
      try {
        const dv = WA.driverLedger.view();
        const cnts = (dv && dv.counts) || {};
        const L3a = ((dv && dv.layerNames && dv.layerNames.L3a) || []).slice();
        const L3b = ((dv && dv.layerNames && dv.layerNames.L3b) || []).slice();
        const declaredL3 = (Number(cnts.L3a) || 0) + (Number(cnts.L3b) || 0);
        const listedL3 = L3a.length + L3b.length;
        const truncated = listedL3 < declaredL3;
        const canConclude = !!(dv && dv.scan && dv.scan.canConclude === true);
        // 「开着的无驱动入口机制」：必须同时满足两条 —— 无驱动入口（L3）+ 开关真开着。
        //   只报 L3 不谈开关，会把出厂关着的机制也算成「世界在撒谎」，那是冤枉它。
        const silent = [];
        if (canConclude && !truncated) {
          L3a.concat(L3b).forEach(function (ns) {
            let on = false;
            try {
              const sh = (WA.capabilityTier && typeof WA.capabilityTier.shapeOf === 'function')
                ? WA.capabilityTier.shapeOf(ns) : null;
              on = !!(sh && sh.on === true);
            } catch (e) { on = false; }
            if (on) silent.push(ns);
          });
        }
        driveNums = {
          total: dv && dv.total, canConclude: canConclude, truncated: truncated,
          declaredL3: declaredL3, listedL3: listedL3,
          scanLevel: (dv && dv.scan && dv.scan.level) || 'none',
          undetermined: Number(cnts.undetermined) || 0,
          // 判不了时这两个数**给 null**，不给 0 —— 0 与「没测」在读数上必须可分
          silent: (canConclude && !truncated) ? silent.length : null,
          sample: silent.slice(0, sampleN)
        };
        if (!canConclude) {
          driveState = 'unknown';
          driveWhy = '本宿主读不全调用面（扫描口径 ' + driveNums.scanLevel
            + (dv && dv.scan && dv.scan.level === 'prefetch'
              ? '，源码预取 ' + (dv.scan.prefetched || 0) + '/' + (dv.scan.declared || 0)
              : '，只读得到导出函数体')
            + '）：' + driveNums.undetermined + ' 台机制判不了有没有驱动者 —— 「判不了」不等于「都有」';
        } else if (truncated) {
          driveState = 'unknown';
          driveWhy = 'L3 名单被 maxList 截断（列出 ' + listedL3 + ' / 实际 ' + declaredL3
            + '）：用截断名单数「开着的」会得到偏小的数，故如实报判不了';
        } else if (silent.length > 0) {
          driveState = 'degraded';
          driveWhy = '有 ' + silent.length + ' 台机制开关开着、却没有任何产品登记的驱动入口'
            + '（' + silent.slice(0, 3).join('、') + (silent.length > 3 ? ' 等' : '') + '）'
            + '：它们即使开着也永远交不出内容，而世界看上去在运转';
          driveFix = null;   // 编不出「点这个就好」—— 修法是接写入口或关掉它，不是按一个按钮
        } else {
          driveState = 'pass';
        }
      } catch (e) {
        driveState = 'absent';
        driveWhy = 'driverLedger.view 读取异常：' + ((e && e.message) || e);
      }
    }
    gates.push(mk('drive', '机制驱动面', driveState, driveNums, driveWhy, driveFix));

    const blocked = gates.filter(function (g) { return g.state === 'blocked'; });
    const degraded = gates.filter(function (g) { return g.state === 'degraded'; });
    const absent = gates.filter(function (g) { return g.state === 'absent'; });
    const passed = gates.filter(function (g) { return g.state === 'pass'; });
    // v2.278.0（V7 OPV7-2）：第四重门槛（drive）的 degraded 与前三道**必须分账**：
    //   · `degraded`       —— 内容只出来一部分（玩家看得见，只是不够）；
    //   · `degradedDrive`  —— 机制开着却没人喂（世界看着在转，一部分机制永不产出）。
    //   两件事都成立时先说前者（内容少更要紧）；**只有后者时 verdict 走 dormant**，
    //   而不是 partial —— 「少」与「空转」不是同一句话，压成一句就把后者洗白了。
    const degradedContent = degraded.filter(function (g) { return g.id !== 'drive'; });
    const degradedDrive = degraded.filter(function (g) { return g.id === 'drive'; });
    // 判不了（drive 的第三种态）：**不进 ok、不进 blocked/degraded/absent**，
    //   但必须作为独立读数出现在返回面上 —— 否则「判不了」在同一份数据里静默消失。
    const unverifiable = gates.filter(function (g) { return g.state === 'unknown'; });
    // 结论口径（四态，不折叠）：
    //   blocked  ⇒ 'empty-risk'（这一轮大概率零内容 —— 玩家最该看见的一档）
    //   degraded ⇒ 'partial'   （有内容，但远少于该有的量；部分成功就是部分成功）
    //   absent   ⇒ 'unknown'   （读不到，不假称健康）
    //   全 pass  ⇒ 'running'
    // 顺序即优先级，逐档都有理由：
    //   ① blocked           —— 内容被卡死了，最该先说；
    //   ② degradedContent   —— 内容只出来一部分（部分成功就是部分成功）；
    //   ③ absent            —— 有读数取不到；「不知道」压在「空转」之上：连门槛都缺，
    //                          说「世界在空转」是拿半份读数替全体下判断；
    //   ④ degradedDrive     —— 这里的全部意义所在：**四项都读得到、都没有内容问题，
    //                          但有一批机制开着却永远没人喂** ⇒ dormant（空转）。
    //                          它只能从「本来是 running」往下拉一档，不能覆盖上面三档。
    let verdict = 'running';
    if (blocked.length) verdict = 'empty-risk';
    else if (degradedContent.length) verdict = 'partial';
    else if (absent.length) verdict = 'unknown';
    else if (degradedDrive.length) verdict = 'dormant';
    // v2.279.0（V7 OPV7-3）：**没有 fix 的门槛也必须能说出下一步**。
    //   实测踩到：`yield` degraded（产出在退）时 `fix` 为 null（成因不是按钮能修的），
    //   于是 nextAction 落到最后的兜底句「有门槛只过了一部分，先修上面那条」——
    //   而「上面那条」就是它自己，读者被指回原地。这是**动作丢失**的一种：
    //   门槛说了「世界在退」，却没说该去干什么。
    //   故：没 fix 的门槛用它的 `why` 顶上去（why 里已经有成因），并且明说「不是按一个按钮能修的」。
    //   仍然不给假按钮 —— 「说出成因」与「给个按钮」是两件事，前者没有理由不做。
    const first = blocked[0] || degraded[0] || null;
    const nextAction = (function () {
      if (first && first.fix) return '先修「' + first.label + '」：' + first.fix.hint;
      if (verdict === 'running') return '能判的门槛都通，可以开始推演';
      if (verdict === 'dormant') {
        return '机制空转：' + degradedDrive[0].why + '（不是按一个按钮能修的，见诊断面驱动者台账）';
      }
      if (verdict === 'unknown') return '有读数取不到，无法判定（不是通过）';
      if (first) {
        return '「' + first.label + '」没过：' + (first.why || '（该门槛没给出原因，这是缺陷）')
          + '—— 这一项不是按一个按钮能修的，成因见上句。';
      }
      return '有门槛只过了一部分，先修上面那条';
    })();

    return {
      // ⚠ ok 必须把 absent 也算进去：`ok` 是「三道门槛都过了」这个整体判断，
      //   而「读不到」不是「过了」。实施期首版写成 `blocked===0 && degraded===0`，
      //   抽掉门槛②读口后 verdict 正确报了 unknown，ok 却仍是 true ——
      //   面板/诊断按 ok 走的任何分支都会把「不知道」当成「健康」。
      ok: blocked.length === 0 && degraded.length === 0 && absent.length === 0,
      gates: gates,
      passed: passed.length,
      blocked: blocked.length,
      degraded: degraded.length,
      degradedContent: degradedContent.length,
      degradedDrive: degradedDrive.length,
      absent: absent.length,
      // v2.278.0（V7 OPV7-2）：判不了的门槛数。它既不算过也不算不过，故不进 ok、
      //   不进 blocked/degraded/absent —— 但必需单独可读，否则“不知道”在同一份返回体里静默消失。
      unverifiable: unverifiable.length,
      unverifiableIds: unverifiable.map(function (g) { return g.id; }),
      verdict: verdict,
      nextAction: nextAction,
      // 三门槛全通的源数：这是「玩家实际能看到多少世界」的直接度量
      sourcePassing: faceRows.filter(function (x) { return x.face === 'on'; }).length,
      sourceTotal: faceRows.length,
      at: clockNow('healthPreflight.threeGates')
    };
  }
  /** 四重门槛的一行摘要（面板/诊断用；读不到就说读不到）
   *
   *  v2.278.0（V7 OPV7-2）补了两个分支，两个都不是装饰：
   *    · `dormant` —— 若不给它分支，它会落进最后的 else，念出「有 0 道门槛卡住了内容」。
   *      这比不报更坏：那是一个**看似有数、实际自相矛盾**的句子。
   *    · `unverifiable > 0` —— 判不了必须附在后面说。此前判据里 86 台未判定的机制
   *      在总结行里一个字都不提，读者只会看到「都通」。
   *  注：判不了**不影响 head 的结论**（ok 的口径不因它变化），只追加一句限定；
   *  这是刻意的：一句话只能有一个主结论，限定不能抢主结论的位置。
   */
  function threeGatesLine(opts) {
    let r = null;
    try { r = threeGates(opts); } catch (e) { return '体检读数不可用（' + e.message + '）'; }
    let head;
    //   「都通」只能用于真的都通：判不了的那道不该被这一句盖过去，故写「能判的都通」。
    if (r.verdict === 'running') head = '能判的门槛都通';
    //   ⚠ v2.279.0 改：原措辞写死「内容只出来一部分」，而内容面现有两类病因
    //     （可见性 degraded = 源只开了一半；产出面 degraded = 产出在退）。
    //     写死一句话会把「在退」描述成「只出来一部分」—— 两个不同病因被一句话盖住。
    //     改成点名是哪几道门槛，不解释成单一成因。
    else if (r.verdict === 'partial') head = '内容面有 ' + r.degradedContent + ' 道门槛没过：'
      + (r.gates || []).filter(function (g) { return g.state === 'degraded' && g.id !== 'drive'; })
        .map(function (g) { return g.label; }).join('、');
    else if (r.verdict === 'dormant') head = '机制在空转（' + r.degradedDrive + ' 道门槛指出：有机制开着却没人喂）';
    else if (r.verdict === 'unknown') head = '读数不全，无法判定';
    else head = '有 ' + r.blocked + ' 道门槛卡住了内容';
    const tailUnv = r.unverifiable > 0
      ? ('另有 ' + r.unverifiable + ' 项判不了（' + r.unverifiableIds.join('、') + '）：判不了不等于通过')
      : '';
    return head + '：注入源全通 ' + r.sourcePassing + '/' + r.sourceTotal + '；' + r.nextAction
      + (tailUnv ? '；' + tailUnv : '');
  }
  // ═══ v2.263.0（V6 OPV6-8）：首局体检结论 ═══════════════════════════════
  /**
   * 【它治什么（现场立据，tools/v6probes/p_first.js）】
   *   v2.259.0 的 threeGates 把三面真值摆成「门槛 + 一句话 + 一个动作」，v2.257.0 的
   *   capabilityAudit.summary 把机制面摆成一句人话，v2.260.0 的 render.visibilityDefault
   *   把缺省面摆成一句话 —— 三条**各自都对**，但玩家打开概览页看到的是三句并列的话，
   *   没有一句回答「所以这一局到底跑起来了没有」。
   *   本函数就是那一句：把三面读数压成**一个四态结论 + 一条下一步**。
   *
   * 【三条口径（与 capLine / healthLine / visLine 同规）】
   *   ① **措辞真源只有一份**：整句由本函数产出，面板不许自己拼（第二个措辞真源 = 漂移源）。
   *   ② **四态不折叠**：running / thin / blocked / unknown 各说各的。
   *      特别是 unknown 必须与 running 分开 ——「读不到」不是「健康」。这是本仓 v2.259.0
   *      用 ok 字段踩过的坑（verdict 报 unknown 而 ok 仍是 true，按 ok 走的分支全被骗）。
   *   ③ **玩家语言**：结论句与动作句里零技术词（不写注入源 / 引擎 / 门槛 / 预算）。
   *      诊断面语言留给 threeGatesLine —— 两句话给两个读者，不是同一句话抄两遍。
   *
   * @param {Object} [opts] `{ sample: 0 }` 透传给 threeGates
   * @returns {{state, line, next, nums, at}}
   */
  function firstRunView(opts) {
    const o = Object.assign({ sample: 0 }, opts || {});
    const nums = {
      mechanisms: 0, running: 0, dormantWorld: 0,
      sources: 0, sourcesOn: 0,
      blocked: 0, degraded: 0, absent: 0
    };
    let state = 'running';
    // ── 面一：机制开关（走 capabilityTier.view，与档位面/题材面同一份判据）──
    let mechOk = false;
    try {
      if (WA.capabilityTier && typeof WA.capabilityTier.view === 'function') {
        const v = WA.capabilityTier.view();
        nums.running = Number(v.running) || 0;
        nums.mechanisms = Number(v.mechanisms) || 0;
        // ⚠ 这里**不能**取 v.dormant：它含 `no-builder` 的项，而
        //   capabilityAudit.summary() 的 dormantWorld 排除了它们。同一个名字两套算法
        //   ⇒ 概览页说「还有 95 项可以开」、诊断页说另一个数。故走 dormantMechanisms()
        //   —— 它与 summary 的过滤式同源（reason !== 'no-builder'），不是另算一遍。
        nums.dormantWorld = (WA.capabilityAudit && typeof WA.capabilityAudit.dormantMechanisms === 'function')
          ? WA.capabilityAudit.dormantMechanisms().length
          : (Number(v.dormant) || 0);
        mechOk = true;
      }
    } catch (e) { mechOk = false; }
    // ── 面二：注入内容（走 threeGates，它已把可见性面的两面对账做完）──
    let g = null;
    try { g = threeGates({ sample: o.sample }); } catch (e) { g = null; }
    if (g) {
      nums.blocked = Number(g.blocked) || 0;
      nums.degraded = Number(g.degraded) || 0;
      nums.absent = Number(g.absent) || 0;
      nums.sources = Number(g.sourceTotal) || 0;
      nums.sourcesOn = Number(g.sourcePassing) || 0;
    }
    // ── 四态判定（顺序即优先级：读不到 > 卡死 > 太少 > 在跑）──
    //   ⚠ unknown 排在最前：三面里任一面读不到，后面三个结论都无从谈起。
    //     把它排在 blocked 之后会让「机制面缺席 + 预算面卡死」报成 blocked ——
    //     那是拿一半读数替全体下判断。
    if (!mechOk || !g || nums.absent > 0) state = 'unknown';
    else if (nums.blocked > 0) state = 'blocked';
    // ⚠ thin 只认 threeGates 的 degraded —— 门槛②已按「≥半数 pass / 不足半数 degraded」判过，
    //   这里再算一遍 sourcesOn/sources 就是同一条规则的第二份真源（两处阈值必然漂移）。
    else if (nums.degraded > 0) state = 'thin';
    else state = 'running';
    let line, next;
    if (state === 'running') {
      line = '本局世界正在运转：' + nums.running + ' 项机制在跑，' + nums.sourcesOn
        + ' 个源在出内容。';
      next = { do: 'openSettings',
        hint: '想让它更热闹，到「设置」页顶部切一个更高的档位（会一次性多开一批机制）。' };
    } else if (state === 'thin') {
      line = '本局世界在动，但只跑了 ' + nums.sourcesOn + ' 个源（共 ' + nums.sources
        + ' 个）：还有 ' + nums.dormantWorld + ' 项机制开档位后可用。';
      next = { do: 'applyTier', arg: 'standard',
        hint: '到「设置」页切到标准档，会把那批能开的一次性打开。' };
    } else if (state === 'blocked') {
      line = '本局世界这一轮大概率是空的：有 ' + nums.blocked + ' 处开关把内容全挡住了。';
      const bf = (g && g.gates || []).filter(function (x) { return x.state === 'blocked' && x.fix; })[0];
      next = bf ? { do: bf.fix.do, arg: bf.fix.arg, hint: bf.fix.hint }
        : { do: 'openSettings', hint: '到「设置」页把挡住的开关打开。' };
    } else {
      line = '这一局的世界状态读不到 —— 这不是「正常」，是有读数缺席。';
      next = { do: 'openDiagnostics',
        hint: '到「诊断」页看哪一块缺席了（缺件不会被当成通过）。' };
    }
    return { state: state, line: line, next: next, nums: nums, at: clockNow('healthPreflight.firstRunView') };
  }
  /** 首局结论的一行整句（结论 + 下一步；面板整行逐字取它，不自己拼） */
  function firstRunLine(opts) {
    let v = null;
    try { v = firstRunView(opts); } catch (e) { return '首局体检读数不可用（' + e.message + '）'; }
    return v.line + (v.next && v.next.hint ? v.next.hint : '');
  }

  // ═══ v2.276.0（V7 OPV7-7）：空产出归因 ═══════════════════════════════════
  /**
   * 【它治什么（现场立据，tools/v7probes/p_why_empty.js）】
   *   出厂态 19 个空产引擎的 `buildBlock()` 全返回空串、`stat()` 全零、`lastReason` 为空 ——
   *   **答不出是哪种空**。「还没有东西被放进来」与「有东西但构建不出来」在读数上完全同形：
   *   前者是正常（世界还没长出来），后者是缺陷（机制坏了没人知道）。
   *
   * 【判据只认硬证据（六版探针轮番证伪后的定版，见 OPV7-7 台账 8.5 节）】
   *   ① `fault`    —— `buildBlock()` **抛异常**。机制坏了，铁证。
   *   ② `yield`    —— 产出非空。
   *   ③ `off`      —— 开关关着（空产的原因就是它，不必再问有没有数据）。
   *   ④ `no-data`  —— 以上都不是：开着、没抛、也没内容。
   *
   *   ⚠ **stat 的计数一律不进判定，只作 signals 报出**。原因是实测出来的：
   *   想用「stat 里有非零计数 ⇒ 它写过数据 ⇒ 空产就是缺陷」推 `fault`，两种写法都误判 ——
   *     · 写入动词正表：注入 `{goals:3}` 时 `goals` 不在表里 ⇒ 判 no-data（漏判）；
   *     · 配置黑名单：空世界实测 `chrono` 的 `checked=1`（自检跑了几次）与
   *       `retrieval` 的 `maxRows=24`/`maxChars=6000`（窗口容量）/`calls`/`triggers`/`guards`
   *       （内部查询行为）全被算成写入 ⇒ 空世界凭空出现 2 个「缺陷」（假阳性）。
   *   **键名没有语义契约**，在其上做启发式就是猜；猜错的代价是把正常引擎挂进巡视名单，
   *   比不报更坏（玩家会去修一个没坏的东西）。
   *
   * 【原计划的三态要补一句实话】
   *   计划写的第三态是「fault（有数据、开着、仍空 ⇒ 真缺陷）」。实测证明它**无法自动判定**：
   *   要知道「有数据」得每台引擎自己声明「我的依据面在哪」，而全仓 100 台都没有这个声明，
   *   也不该为一个读数去改 100 个文件。故本版只交付能自证的部分，
   *   其余降级为 `suspicious` 嫌疑名单 —— **如实说「判不了」，不冒充结论**。
   *
   * 【suspicious：值得人看一眼、但不构成结论的那一组】
   *   条件：开着 + 空产 + 不抛 + 本轮被注入链**真实调用过**（`injectCost[key].n > 0`）
   *        + 容器里确实有记录（多挂载点扫到 > 0）。
   *   这是「有真实调用面证据却交不出内容」的最强嫌疑，但本模块判不了它是不是缺陷，
   *   所以单列报出，并写明 `why` 的四个条件各自读数。
   *
   * 【与 neighbors 的分工（三问都不合并）】
   *   · `threeGates`   —— 答「三面门槛过没过」（开关 / 可见性 / 预算）；
   *   · `firstRunView` —— 答「这一局到底跑起来了没有」（一个结论 + 一条动作）；
   *   · `yieldAttrib`  —— 答「**具体哪几台引擎**在空着、各自卡在哪一面」（逐引擎归因）。
   *   失效模式互不覆盖：门槛全过、首局在跑，照样可能有一批引擎永远空产。
   *
   * 【只读】
   *   不写世界、不改设置。产出面调一次 `buildBlock()` 取长度（归因必须知道出没出块），
   *   并把 len 一并报出供复核；其余全部读现成读数。
   *
   * @param {Object} [opts] `{ limit: 20 }` 各名单最多列几条（默认 20，上限 100）
   * @returns {{ok, total, yield, off, fault, noData, faults, offRows, suspicious, rows, line, at}}
   */
  function yieldAttrib(opts) {
    const o = Object.assign({ limit: 20 }, opts || {});
    const limit = Math.max(1, Math.min(100, Number(o.limit) || 20));

    // ── 辅助面（只报出，不判定）──────────────────────────────────────────
    //   配置/时间类键在这里的作用**仅限「别把窗口容量报成活动量」**，
    //   它们不参与任何状态判定 —— 故漏了某个键也只是数字难看，不会造成误判。
    const NOT_ACTIVITY = /(format|Free|Over|slots|Ms|Size|Limit|max|cap|capacity|Ratio|Depth|Budget|Sample|Window|threshold|enabled|available)$/i;
    const TS_KEY = /^(lastAt|lastTurn|at|since|firstAt|lastSeenAt|lastReplayAt|turnRestored|turnPersisted)$/i;
    function activityOf(stt) {
      let n = 0; const ks = [];
      Object.keys(stt || {}).forEach(function (k) {
        const v = stt[k];
        if (typeof v !== 'number' || !isFinite(v) || v < 0) return;
        if (TS_KEY.test(k) || NOT_ACTIVITY.test(k)) return;
        n += v; ks.push(k + '=' + v);
      });
      return { n: n, keys: ks };
    }
    //   递归数真实记录（数组取 length；对象的内部记录相加）。
    //   ⚠ 容器存在 ≠ 有数据：几乎所有引擎在 store 里都有一个空壳对象，
    //     「容器非空」恒真 ⇒ 不构成证据。故数「记录条数」而不是「键数」。
    function recordsOf(v, depth) {
      if (depth > 4) return 0;
      if (Array.isArray(v)) return v.length;
      if (v && typeof v === 'object') {
        let n = 0;
        Object.keys(v).forEach(function (k) { n += recordsOf(v[k], depth + 1); });
        return n;
      }
      return 0;
    }
    //   多挂载点：引擎的数据可能挂在 store[key] / people[*][key] / world[key] /
    //   evolution[key]。只数同名容器会误判 —— 实测 `life.addGoal` 成功后数据挂在
    //   `people[p_大师傅].life.goals`，而 `store.life` 是 undefined。
    function mountsOf(key, root) {
      const out = [];
      if (!root) return { mounts: out, total: 0 };
      if (root[key] !== undefined) out.push({ at: 'store.' + key, n: recordsOf(root[key], 0) });
      const ppl = root.people || {};
      let pplN = 0;
      Object.keys(ppl).forEach(function (id) {
        if (ppl[id] && ppl[id][key] !== undefined) pplN += recordsOf(ppl[id][key], 0);
      });
      if (pplN) out.push({ at: 'people[*].' + key, n: pplN });
      if (root.world && root.world[key] !== undefined) out.push({ at: 'world.' + key, n: recordsOf(root.world[key], 0) });
      if (root.evolution && root.evolution[key] !== undefined) out.push({ at: 'evolution.' + key, n: recordsOf(root.evolution[key], 0) });
      return { mounts: out, total: out.reduce(function (a, b) { return a + b.n; }, 0) };
    }

    const empty = { ok: false, total: 0, yield: 0, off: 0, fault: 0, noData: 0,
      faults: [], offRows: [], suspicious: [], rows: [], line: '', at: 0 };
    if (!WA.capabilityTier || typeof WA.capabilityTier.shapeOf !== 'function') {
      empty.error = 'capabilityTier 未加载：读不到「什么算引擎」的唯一判据面';
      empty.at = clockNow('healthPreflight.yieldAttrib');
      return empty;
    }
    if (!WA.store || typeof WA.store.get !== 'function') {
      empty.error = 'store 未加载：读不到数据面';
      empty.at = clockNow('healthPreflight.yieldAttrib');
      return empty;
    }
    const root = WA.store.get() || {};

    // ── 真实调用面（借 render 的现成读数，不另立计量）─────────────────────
    //   `injectCost[key].n` = 本轮该源被注入链调用几次；`engineFaults[key].count` = 抛了几次。
    //   这是**真实链路上**「有没有被跑、跑崩没跑崩」的唯一现场，比引擎自己的账更硬。
    let callFace = null, callFaceErr = null;
    try {
      if (WA.render && typeof WA.render.visibilityStat === 'function') {
        const vs = WA.render.visibilityStat();
        callFace = { cost: vs.injectCost || {}, faults: vs.engineFaults || {}, at: vs.lastAt || null };
      }
    } catch (e) { callFaceErr = String((e && e.message) || e).slice(0, 80); }

    const rows = [];
    Object.keys(WA).forEach(function (key) {
      let sh = null;
      try { sh = WA.capabilityTier.shapeOf(key); } catch (e) { sh = null; }
      if (!sh || !sh.hasBuild) return;
      if (Array.isArray(o.keys) && o.keys.indexOf(key) < 0) return;
      const m = WA[key];
      let len = -1, threw = null;
      try { len = String(m.buildBlock() || '').length; } catch (e) { threw = String((e && e.message) || e).slice(0, 80); }
      let stt = null;
      try { stt = (typeof m.stat === 'function') ? m.stat() : null; } catch (e2) { stt = null; }
      const act = activityOf(stt);
      const mo = mountsOf(key, root);
      let inSrc = false;
      try { inSrc = (WA.render.SOURCES || []).indexOf(key) >= 0; } catch (e3) { inSrc = false; }
      const injected = (inSrc && callFace && callFace.cost[key] !== undefined) ? callFace.cost[key].n : null;
      const callFaults = (inSrc && callFace && callFace.faults[key] !== undefined) ? callFace.faults[key].count : null;
      // ── 四态（三条硬证据，判据顺序即优先级）──
      let state;
      if (threw) state = 'fault';                    // ① 抛异常
      else if (len > 0) state = 'yield';             // ② 有产出
      else if (sh.on !== true) state = 'off';        // ③ 开关关着
      else state = 'no-data';                        // ④ 开着、没抛、也没内容
      rows.push({
        key: key, state: state, on: sh.on === true,
        len: len, threw: threw,
        signals: { records: mo.total, mounts: mo.mounts.filter(function (x) { return x.n > 0; }),
          activity: act.n, activityKeys: act.keys.slice(0, 6), injected: injected, callFaults: callFaults },
        lastReason: (stt && stt.lastReason) ? String(stt.lastReason).slice(0, 80) : ''
      });
    });

    const by = function (st) { return rows.filter(function (r) { return r.state === st; }); };
    const yields = by('yield'), offs = by('off'), faults = by('fault'), noData = by('no-data');
    // 嫌疑：开着 + 空产 + 不抛 + 真被调用过 + 容器里有记录
    const suspicious = noData.filter(function (r) {
      return r.on === true && (r.signals.injected !== null && r.signals.injected > 0) && r.signals.records > 0;
    });
    // 弱归因：容器里有记录但引擎既不出块也不认账 —— 只报，不下结论
    const weak = noData.filter(function (r) {
      return r.signals.records > 0 && suspicious.indexOf(r) < 0;
    });
    const line = '本轮有产出的引擎 ' + yields.length + '/' + rows.length
      + '：' + offs.length + ' 台开关关着、' + faults.length + ' 台构建抛异常（机制坏了）、'
      + noData.length + ' 台开着却没内容'
      + (suspicious.length ? ('；其中 ' + suspicious.length + ' 台有真实调用面却没交出内容（嫌疑，需人判）') : '')
      + (weak.length ? ('；另有 ' + weak.length + ' 台容器里有记录但从未被产出过（无法归因）') : '')
      + (callFaceErr ? ('；注：注入链调用面读取失败（' + callFaceErr + '），「被调用几次」一律记 null') : '')
      + '。';

    return {
      ok: true,
      total: rows.length,
      yield: yields.length, off: offs.length, fault: faults.length, noData: noData.length,
      // 巡视名单：只收「构建抛异常」——本模块唯一能自证的缺陷
      faults: faults.slice(0, limit).map(function (r) {
        return { key: r.key, why: 'buildBlock 抛异常：' + r.threw,
          records: r.signals.records, activity: r.signals.activity, injected: r.signals.injected,
          lastReason: r.lastReason };
      }),
      offRows: offs.slice(0, limit).map(function (r) {
        return { key: r.key, records: r.signals.records, activity: r.signals.activity,
          action: '打开它（开之前它必然空产，这不是缺陷）' };
      }),
      suspicious: suspicious.slice(0, limit).map(function (r) {
        return { key: r.key, why: '开着、被注入链调用 ' + r.signals.injected + ' 次、容器里有 '
            + r.signals.records + ' 条记录，却仍交不出内容',
          records: r.signals.records, mounts: r.signals.mounts,
          injected: r.signals.injected, callFaults: r.signals.callFaults,
          activity: r.signals.activity, verdict: 'unattributed（本模块判不了是不是缺陷）' };
      }),
      weakRows: weak.slice(0, limit).map(function (r) {
        return { key: r.key, records: r.signals.records, mounts: r.signals.mounts,
          injected: r.signals.injected, activity: r.signals.activity };
      }),
      rows: rows.slice(0, limit),
      callFace: callFace
        ? { available: true, at: callFace.at, sources: Object.keys(callFace.cost).length }
        : { available: false, error: callFaceErr || 'render 未加载' },
      line: line,
      at: clockNow('healthPreflight.yieldAttrib')
    };
  }
  /** 空产出归因的一行整句（诊断面整行取它，面板不自己拼措辞） */
  function yieldAttribLine(opts) {
    let r = null;
    try { r = yieldAttrib({ limit: 1 }); } catch (e) { return '归因读数不可用（' + e.message + '）'; }
    if (!r || !r.ok) return '归因读数不可用（' + ((r && r.error) || '未知') + '）';
    return r.line;
  }


  WA.healthPreflight = {
    inspectAndSanitize: inspectAndSanitize,
    checkSpatialConsistency: checkSpatialConsistency,
    buildBlock: buildBlock,
    getSettings: settings,
    setSettings: saveSettings,
    stat: stat,
    // v2.259.0（V6 OPV6-4）：三重门槛自检。两个口都接真消费方（否则就是过度导出）：
    //   · threeGates   —— tool-diag 的 secHealth 与概览页体检块读它（玩家可达）；
    //   · threeGatesLine —— 概览页摘要行整句逐字取它（面板不自己拼措辞）。
    threeGates: threeGates,
    threeGatesLine: threeGatesLine,
    // v2.263.0（V6 OPV6-8）：首局体检结论。两个口各接一个真消费方 ——
    //   · firstRunView —— tool-diag 的 secHealth 采集进诊断包；
    //   · firstRunLine —— 概览页结论块整行逐字取它（面板不自己拼措辞）。
    firstRunView: firstRunView,
    firstRunLine: firstRunLine,
    // v2.276.0（V7 OPV7-7）：空产出归因三态。两个口都接真消费方（否则就是过度导出）：
    //   · yieldAttrib     —— tool-diag 的 secYield 采集进诊断包（逐引擎归因）；
    //   · yieldAttribLine —— 同一节整行逐字取它（诊断面不自己拼措辞）。
    yieldAttrib: yieldAttrib,
    yieldAttribLine: yieldAttribLine,
    /**
     * OPV16-9: 全局拓扑死锁断路与自愈 (Deadlock Breaker & Cycle Disruption)
     */
    breakDeadlock: function (dependencyEdges) {
      const edges = Array.isArray(dependencyEdges) ? dependencyEdges : [];
      if (edges.length === 0) {
        return { ok: true, hasCycle: false, broken: false, message: 'Empty graph; no deadlock.' };
      }
      // 检测有向环 (A -> B, B -> C, C -> A)
      const graph = new Map();
      for (const e of edges) {
        if (!e.from || !e.to) continue;
        if (!graph.has(e.from)) graph.set(e.from, []);
        graph.get(e.from).push(e.to);
      }

      const visited = new Set();
      const recStack = new Set();
      let cycleFound = null;

      function dfs(node, path) {
        visited.add(node);
        recStack.add(node);
        const neighbors = graph.get(node) || [];
        for (const n of neighbors) {
          if (!visited.has(n)) {
            const found = dfs(n, path.concat([n]));
            if (found) return found;
          } else if (recStack.has(n)) {
            return path.concat([n]);
          }
        }
        recStack.delete(node);
        return null;
      }

      for (const k of graph.keys()) {
        if (!visited.has(k)) {
          cycleFound = dfs(k, [k]);
          if (cycleFound) break;
        }
      }

      if (!cycleFound) {
        return { ok: true, hasCycle: false, broken: false, message: 'Graph is acyclic; normal sequence.' };
      }

      // 强制挑选最后一个节点执行放弃让位（forced_yield）打破死锁
      const victim = cycleFound[cycleFound.length - 1];
      return {
        ok: true,
        hasCycle: true,
        broken: true,
        cyclePath: cycleFound,
        sacrificedNode: victim,
        actionTaken: 'forced_yield',
        message: `Cycle broken by forcing ${victim} to yield.`
      };
    }
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/health-preflight 已加载（2.247.0）');
  }
})();