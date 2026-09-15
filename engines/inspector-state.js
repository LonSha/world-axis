/**
 * WorldAxis engines/inspector-state.js (v0.9.0) — 跨引擎状态一致性检查器（纯只读）
 * 缝合来源：DlSNlGHT World —— world-engine-ui.js 注入自检 + 各面板枚举校验逻辑
 *
 * 定位：与 engines/inspector.js 的区别
 *  - inspector.js  ：检查「注入是否真的进了正文」（运行时哨兵，看 prompt 组装结果）
 *  - 本引擎        ：检查「store 里的世界状态自身是否自洽」（数据层体检）
 *
 * 铁律：
 *  - 纯只读：绝不写 store、绝不 mutate 传入的 state
 *  - 每个 checker 内部 try/catch 包死，单个失败不影响其他
 *  - 返回结构化 issues[]，每条 {level:'error'|'warn'|'info', code, detail}
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

  function read(state) { return state || WA.store.get(); }
  function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback === undefined ? { __error: String(e && e.message || e) } : fallback; } }

  // ── checker 1：事件链合法性（类型/阶段/等级/轮次） ─
  function checkEvents(state) {
    const issues = [];
    const events = state?.evolution?.events || [];
    const stagesOf = WA.editorEvents ? WA.editorEvents.stagesOf : (t) => (t === 'progress'
      ? ['筹备', '执行', '关键', '已完成', '已失败']
      : ['萌芽', '发酵', '逼近', '已爆发', '已消散']);
    const seenNames = new Map();
    events.forEach((e, i) => {
      const legal = stagesOf(e.type);
      if (!['conflict', 'progress'].includes(e.type)) {
        issues.push({ level: 'error', code: 'event.badType', detail: `事件#${i}「${e.name || '未命名'}」type=${e.type} 非法` });
      } else if (!legal.includes(e.stage)) {
        issues.push({ level: 'error', code: 'event.badStage', detail: `事件#${i}「${e.name}」阶段「${e.stage}」不属于 ${e.type} 序列(${legal.join('/')})` });
      }
      if (!(Number(e.level) >= 1 && Number(e.level) <= 4)) {
        issues.push({ level: 'warn', code: 'event.badLevel', detail: `事件#${i}「${e.name}」等级 ${e.level} 越界(1-4)` });
      }
      if (!(Number(e.stageRound) >= 1 && Number(e.stageRound) <= 9)) {
        issues.push({ level: 'warn', code: 'event.badStageRound', detail: `事件#${i}「${e.name}」阶段轮 ${e.stageRound} 越界(1-9)` });
      }
      const key = String(e.name || '').trim();
      if (key) {
        if (seenNames.has(key)) issues.push({ level: 'error', code: 'event.dupName', detail: `事件重名「${key}」(#${seenNames.get(key)} 与 #${i})，推演按名归并会串链` });
        else seenNames.set(key, i);
      }
      if (e.id === undefined || e.id === null || e.id === '') {
        issues.push({ level: 'warn', code: 'event.noId', detail: `事件#${i}「${e.name}」缺 id（改名不换链依赖 id）` });
      }
    });
    return issues;
  }

  // ─ checker 2：势力枚举与重名 ──
  function checkFactions(state) {
    const issues = [];
    const factions = state?.evolution?.factions || [];
    const STATUSES = WA.editorFaction ? WA.editorFaction.STATUSES : ['鼎盛', '稳固', '倾轧', '困顿', '衰落', '瓦解'];
    const RELATIONS = WA.editorFaction ? WA.editorFaction.RELATIONS : ['血盟', '盟友', '友好', '中立', '冷淡', '敌对', '世仇'];
    const seen = new Map();
    factions.forEach((f, i) => {
      if (!STATUSES.includes(f.status)) issues.push({ level: 'error', code: 'faction.badStatus', detail: `势力#${i}「${f.name}」运势「${f.status}」非法` });
      if (!RELATIONS.includes(f.relation)) issues.push({ level: 'error', code: 'faction.badRelation', detail: `势力#${i}「${f.name}」关系「${f.relation}」非法` });
      if (!String(f.name || '').trim()) issues.push({ level: 'error', code: 'faction.noName', detail: `势力#${i} 缺名称` });
      if (!String(f.scope || '').trim()) issues.push({ level: 'warn', code: 'faction.noScope', detail: `势力#${i}「${f.name}」缺范围（五要件）` });
      if (!String(f.currentGoal || '').trim()) issues.push({ level: 'warn', code: 'faction.noGoal', detail: `势力#${i}「${f.name}」缺目标（五要件）` });
      if (!String(f.core_person || '').trim()) issues.push({ level: 'warn', code: 'faction.noCore', detail: `势力#${i}「${f.name}」缺核心人物（五要件）` });
      if ((f.currentGoal || '').length > 50) issues.push({ level: 'warn', code: 'faction.goalOverflow', detail: `势力#${i}「${f.name}」目标超50字（应被 limits 截断）` });
      const key = String(f.name || '').trim();
      if (key) {
        if (seen.has(key)) issues.push({ level: 'error', code: 'faction.dupName', detail: `势力重名「${key}」` });
        else seen.set(key, i);
      }
    });
    const cap = WA.editorFaction ? WA.editorFaction.MAX_FACTIONS : 16;
    if (factions.length > cap) issues.push({ level: 'warn', code: 'faction.overCapacity', detail: `势力数 ${factions.length} 超过面板容量 ${cap}` });
    return issues;
  }

  // ── checker 3：世界脉搏与轮次 ──
  function checkPulse(state) {
    const issues = [];
    const p = state?.worldPulse;
    if (p) {
      if (!(Number(p.pressure) >= 0 && Number(p.pressure) <= 3)) {
        issues.push({ level: 'error', code: 'pulse.badPressure', detail: `世界脉搏 pressure=${p.pressure} 越界(0-3)` });
      }
      if (p.trend && !['rising', 'falling', 'steady'].includes(p.trend)) {
        issues.push({ level: 'warn', code: 'pulse.badTrend', detail: `世界脉搏 trend=${p.trend} 非法` });
      }
    }
    const round = state?.evolution?.round;
    if (round !== undefined && Number(round) < 0) {
      issues.push({ level: 'error', code: 'round.negative', detail: `演化轮 ${round} 为负` });
    }
    return issues;
  }

  // ── checker 4：人物认知边界与 people 表对齐 ──
  function checkPeople(state) {
    const issues = [];
    const people = state?.people || {};
    Object.entries(people).forEach(([id, p]) => {
      if (!p || typeof p !== 'object') { issues.push({ level: 'error', code: 'people.badEntry', detail: `人物 ${id} 非对象` }); return; }
      if (!String(p.name || '').trim()) issues.push({ level: 'warn', code: 'people.noName', detail: `人物 ${id} 缺姓名` });
      if (!String(p.location || '').trim()) issues.push({ level: 'info', code: 'people.noLocation', detail: `人物「${p.name || id}」位置未记录` });
      const k = p.knowledge;
      if (k && typeof k === 'object') {
        Object.entries(k).forEach(([factKey, info]) => {
          const route = info && info.route;
          if (route && !['fact', 'witnessed', 'suspected', 'inferred'].includes(route)) {
            issues.push({ level: 'warn', code: 'people.badRoute', detail: `人物「${p.name || id}」对「${factKey}」认知路径 ${route} 非法` });
          }
          if (route === 'inferred' && info && info.strength && info.strength === 'fact') {
            issues.push({ level: 'error', code: 'people.inferredAsFact', detail: `人物「${p.name || id}」把 inferred 标成 fact（认知边界违规）` });
          }
        });
      }
    });
    return issues;
  }

  // ── checker 5：记忆分层与伏笔 ──
  function checkMemory(state) {
    const issues = [];
    const mem = state?.memory || {};
    ['l0', 'l1', 'l2', 'l3'].forEach(tier => {
      if (mem[tier] !== undefined && !Array.isArray(mem[tier])) issues.push({ level: 'error', code: 'memory.badTier', detail: `memory.${tier} 非数组` });
    });
    const LEGAL_FS = ['waiting', 'developing', 'triggered', 'recycled', 'dropped'];
    (mem.foreshadows || []).forEach((f, i) => {
      if (!LEGAL_FS.includes(f.status)) issues.push({ level: 'warn', code: 'foreshadow.badStatus', detail: `伏笔#${i}「${(f.content || '').slice(0, 12)}」状态 ${f.status} 非法` });
      if (Array.isArray(f.links)) {
        f.links.forEach((link, li) => {
          const target = typeof link === 'string' ? link : (link && (link.ref || link.id));
          if (target && !String(target).trim()) issues.push({ level: 'info', code: 'foreshadow.emptyLink', detail: `伏笔#${i} 第${li} 条 links 为空引用` });
        });
      }
    });
    // facts 版本化：同 key 应只有一条 active
    const byKey = {};
    (mem.facts || []).forEach((f, i) => {
      const key = String(f.key || '').trim();
      if (!key) return;
      byKey[key] = byKey[key] || [];
      byKey[key].push({ i, active: f.active !== false });
    });
    Object.entries(byKey).forEach(([key, arr]) => {
      const actives = arr.filter(x => x.active);
      if (actives.length > 1) issues.push({ level: 'error', code: 'facts.multiActive', detail: `长期事实「${key}」同时有 ${actives.length} 条 active（版本化失效）` });
    });
    return issues;
  }

  // ── checker 6：来源引用审计（timeline） ──
  function checkRefs(state) {
    const issues = [];
    if (!WA.timeline || !WA.timeline.auditRefs) return issues;
    const scan = [];
    const mem = state?.memory || {};
    ['l0', 'l1', 'l2', 'l3'].forEach(tier => {
      (mem[tier] || []).forEach((entry, i) => {
        if (entry && Array.isArray(entry.refs) && entry.refs.length) scan.push({ where: `${tier}#${i}`, refs: entry.refs });
      });
    });
    (mem.smallSummaries || []).forEach((entry, i) => {
      if (entry && Array.isArray(entry.refs) && entry.refs.length) scan.push({ where: `small#${i}`, refs: entry.refs });
    });
    for (const item of scan) {
      const audit = safe(() => WA.timeline.auditRefs(item.refs));
      if (!audit || audit.__error) continue;
      if (audit.inherited || audit.synthetic) continue;
      if ((audit.missing || []).length) {
        issues.push({ level: 'warn', code: 'refs.missing', detail: `${item.where} 有 ${audit.missing.length} 个来源楼层已删除` });
      }
      if ((audit.changed || []).length) {
        issues.push({ level: 'warn', code: 'refs.changed', detail: `${item.where} 有 ${audit.changed.length} 个来源楼层内容被编辑/重roll` });
      }
    }
    return issues;
  }

  // ── checker 7：注入队列（一次性消费） ──
  function checkInjection(state) {
    const issues = [];
    const n = state?.nextTurnInjection;
    if (n) {
      // v0.1.5: 对齐 v0.1.4 归零语义——空壳已不可能存在，检查改为「四字段全无内容」
      const hasCol = Array.isArray(n.required) || Array.isArray(n.conditional) || Array.isArray(n.suppress);
      const hasNear = !!(n.nearEvent && (n.nearEvent.title || n.nearEvent.desc));
      if (!hasCol && !hasNear) {
        issues.push({ level: 'warn', code: 'inject.emptyShell', detail: 'nextTurnInjection 四字段全空（v0.1.4 后应已归零，残留即异常）' });
      }
      if (n.at && state.meta && state.meta.updatedAt && Number(n.at) > Number(state.meta.updatedAt) + 1000) {
        issues.push({ level: 'info', code: 'inject.futureStamp', detail: 'nextTurnInjection 时间戳晚于 meta.updatedAt' });
      }
    }
    return issues;
  }

  // ─ checker 8：人物主观记忆持有人对齐 ──
  function checkPmem(state) {
    const issues = [];
    const pmem = state?.memory?.pmem;
    if (!pmem) return issues;
    if (!Array.isArray(pmem)) { issues.push({ level: 'error', code: 'pmem.badShape', detail: 'memory.pmem 非数组' }); return issues; }
    const known = new Set(Object.values(state.people || {}).map(p => String(p?.name || '').trim()).filter(Boolean));
    const CAP = (WA.pmem && WA.pmem.CAP_PER_PERSON) || 6;
    const counts = {};
    const ids = new Set();
    pmem.forEach((e, i) => {
      if (!e || !String(e.text || '').trim()) issues.push({ level: 'warn', code: 'pmem.emptyText', detail: `主观记忆#${i} 无内容` });
      if (!e.id) issues.push({ level: 'warn', code: 'pmem.noId', detail: `主观记忆#${i} 缺 id（knows 判定依赖 id）` });
      else if (ids.has(e.id)) issues.push({ level: 'error', code: 'pmem.dupId', detail: `主观记忆 id 重复 ${e.id}` });
      else ids.add(e.id);
      (e.holders || []).forEach(h => { counts[h] = (counts[h] || 0) + 1; });
      (e.known_by || []).forEach(k => {
        if (!(e.holders || []).includes(k) && known.size && !known.has(String(k).trim())) {
          issues.push({ level: 'info', code: 'pmem.unknownKnower', detail: `主观记忆#${i} 知情人「${k}」不在 people 表中` });
        }
      });
    });
    Object.entries(counts).forEach(([h, c]) => {
      if (c > CAP) issues.push({ level: 'warn', code: 'pmem.overCap', detail: `「${h}」主观记忆 ${c} 条超过上限 ${CAP}` });
    });
    return issues;
  }

  // ─ checker 9：突发事件轮次合法性 ──
  function checkDirectEvents(state) {
    const issues = [];
    (state?.directEvents || []).forEach((d, i) => {
      if (!['active', 'done', 'aborted'].includes(d.status)) issues.push({ level: 'warn', code: 'direct.badStatus', detail: `突发事件#${i}「${d.title}」status=${d.status} 非法` });
      const cur = Number(d.currentTurn), total = Number(d.totalTurns);
      if (cur > total) issues.push({ level: 'error', code: 'direct.turnOverflow', detail: `突发事件#${i} 当前轮 ${cur} 超过总轮 ${total}` });
      if (d.status === 'active' && cur >= total) issues.push({ level: 'warn', code: 'direct.shouldDone', detail: `突发事件#${i} 轮次已满但仍为 active（应自动 done）` });
    });
    return issues;
  }

  const CHECKERS = [
    { code: 'events', label: '事件链', fn: checkEvents },
    { code: 'factions', label: '势力', fn: checkFactions },
    { code: 'pulse', label: '脉搏/轮次', fn: checkPulse },
    { code: 'people', label: '人物认知', fn: checkPeople },
    { code: 'memory', label: '记忆/伏笔', fn: checkMemory },
    { code: 'refs', label: '来源引用', fn: checkRefs },
    { code: 'injection', label: '注入队列', fn: checkInjection },
    { code: 'pmem', label: '主观记忆', fn: checkPmem },
    { code: 'directEvents', label: '突发事件', fn: checkDirectEvents }
  ];

  /** 全量体检：只读，返回结构化报告 */
  function inspect(state, opts = {}) {
    const s = read(state);
    const sections = [];
    let errors = 0, warns = 0, infos = 0;
    for (const checker of CHECKERS) {
      if (Array.isArray(opts.only) && opts.only.length && !opts.only.includes(checker.code)) continue;
      const issues = safe(() => checker.fn(s), []);
      const arr = Array.isArray(issues) ? issues : [];
      for (const it of arr) {
        if (it.level === 'error') errors++;
        else if (it.level === 'warn') warns++;
        else infos++;
      }
      sections.push({ code: checker.code, label: checker.label, issues: arr });
    }
    return {
      ok: errors === 0,
      clean: errors === 0 && warns === 0,
      counts: { error: errors, warn: warns, info: infos, total: errors + warns + infos },
      sections,
      checkedAt: Date.now()
    };
  }

  /** 扁平化（便于日志/导出） */
  function flatten(report) {
    const out = [];
    for (const sec of report?.sections || []) {
      for (const it of sec.issues || []) out.push(Object.assign({ section: sec.code }, it));
    }
    return out.sort((a, b) => (SEVERITY_ORDER[a.level] ?? 3) - (SEVERITY_ORDER[b.level] ?? 3));
  }

  function summaryText(report) {
    if (!report) return '未体检';
    const c = report.counts || {};
    if (!c.total) return '✅ 状态自洽（无异常）';
    return `${report.ok ? '⚠️' : ''} 发现 ${c.error || 0} 错误 / ${c.warn || 0} 警告 / ${c.info || 0} 提示`;
  }

  WA.inspectorState = {
    CHECKERS, SEVERITY_ORDER,
    checkEvents, checkFactions, checkPulse, checkPeople, checkMemory, checkRefs,
    checkInjection, checkPmem, checkDirectEvents,
    inspect, flatten, summaryText
  };
  if (WA.log) WA.log('info', '状态检查器已加载');
})();