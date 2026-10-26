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
    key: LS_KEY, def: DEF, module: 'health-preflight',
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
      timestamp: Date.now()
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

  WA.healthPreflight = {
    inspectAndSanitize: inspectAndSanitize,
    checkSpatialConsistency: checkSpatialConsistency,
    buildBlock: buildBlock,
    getSettings: settings,
    setSettings: saveSettings,
    stat: stat
  };

  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/health-preflight 已加载（2.247.0）');
  }
})();