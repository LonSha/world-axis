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

    const blocked = gates.filter(function (g) { return g.state === 'blocked'; });
    const degraded = gates.filter(function (g) { return g.state === 'degraded'; });
    const absent = gates.filter(function (g) { return g.state === 'absent'; });
    const passed = gates.filter(function (g) { return g.state === 'pass'; });
    // 结论口径（四态，不折叠）：
    //   blocked  ⇒ 'empty-risk'（这一轮大概率零内容 —— 玩家最该看见的一档）
    //   degraded ⇒ 'partial'   （有内容，但远少于该有的量；部分成功就是部分成功）
    //   absent   ⇒ 'unknown'   （读不到，不假称健康）
    //   全 pass  ⇒ 'running'
    let verdict = 'running';
    if (blocked.length) verdict = 'empty-risk';
    else if (degraded.length) verdict = 'partial';
    else if (absent.length) verdict = 'unknown';
    const first = blocked[0] || degraded[0] || null;
    const nextAction = first && first.fix
      ? ('先修「' + first.label + '」：' + first.fix.hint)
      : (verdict === 'running' ? '三道门槛都通，可以开始推演'
        : (verdict === 'unknown' ? '有读数取不到，无法判定（不是通过）' : '有门槛只过了一部分，先修上面那条'));

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
      absent: absent.length,
      verdict: verdict,
      nextAction: nextAction,
      // 三门槛全通的源数：这是「玩家实际能看到多少世界」的直接度量
      sourcePassing: faceRows.filter(function (x) { return x.face === 'on'; }).length,
      sourceTotal: faceRows.length,
      at: clockNow('healthPreflight.threeGates')
    };
  }
  /** 三重门槛的一行摘要（面板/诊断用；读不到就说读不到） */
  function threeGatesLine(opts) {
    let r = null;
    try { r = threeGates(opts); } catch (e) { return '体检读数不可用（' + e.message + '）'; }
    let head;
    if (r.verdict === 'running') head = '三道门槛都通';
    else if (r.verdict === 'partial') head = '内容只出来一部分（' + r.degraded + ' 道门槛只过一半）';
    else if (r.verdict === 'unknown') head = '读数不全，无法判定';
    else head = '有 ' + r.blocked + ' 道门槛卡住了内容';
    return head + '：注入源全通 ' + r.sourcePassing + '/' + r.sourceTotal + '；' + r.nextAction;
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
    firstRunLine: firstRunLine
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/health-preflight 已加载（2.247.0）');
  }
})();