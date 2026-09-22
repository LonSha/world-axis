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
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

  function read(state) { return state || WA.store.get(); }
  // v0.1.8: 统一 safe 语义——fn 返回 undefined 时也兜底（与 inject-inspector/tool-diag 对齐）
  function safe(fn, fallback) { try { const v = fn(); if (v !== undefined) return v; } catch (e) {} return fallback === undefined ? null : fallback; }

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
    // v0.8.0: 扩大扫描覆盖面——foreshadows.links（记忆层伏笔溯源）+ entities.refs（实体来源）
    (mem.foreshadows || []).forEach((f, i) => {
      if (f && Array.isArray(f.links) && f.links.length) scan.push({ where: `foreshadow#${i}`, refs: f.links });
    });
    const em = state?.evolution?.entityMemory || {};
    Object.keys(em).forEach(type => {
      if (type === '_index') return;
      (em[type] || []).forEach((entity, i) => {
        if (entity && Array.isArray(entity.refs) && entity.refs.length) scan.push({ where: `entity:${type}#${i}`, refs: entity.refs });
      });
    });
    // v0.9.0: 扩大扫描覆盖面——纪事来源引用（backstage 结算入账，可审计楼层删除/改动）
    (state?.chronicle || []).forEach((c, i) => {
      if (c && Array.isArray(c.refs) && c.refs.length) scan.push({ where: `chronicle#${i}`, refs: c.refs });
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
  // ── checker 6b：软引用完整性（回声 refCurrent 指向暗流标题）──
  // v0.9.0: 只检出「入账即悬空」（danglingAtWrite，AI幻觉/数据损坏），
  // 不报「入账后暗流正常生命周期消失」（终局回收/容量裁剪）——后者是设计行为，报则告警疲劳。
  function checkSoftRefs(state) {
    const issues = [];
    const currents = state?.currents || [];
    const titles = new Set(currents.map(c => c && String(c.title || '').trim()).filter(Boolean));
    const liveSet = state?.evolution?.events || [];
    const evNames = new Set(liveSet.map(e => e && String(e.name || '').trim()).filter(Boolean));
    const echoes = state?.echoes || [];
    echoes.forEach((e, i) => {
      const t = String(e && e.refCurrent || '').trim();
      if (!t) { issues.push({ level: 'info', code: 'softref.empty', detail: `回声#${i} refCurrent 为空（无溯源锚点）` }); return; }
      // 目标可能在 currents（标题）或 evolution.events（名）中——任一在场即有效
      const targetLive = titles.has(t) || evNames.has(t);
      if (!targetLive && e.danglingAtWrite) {
        issues.push({ level: 'warn', code: 'softref.dangling', detail: `回声#${i}「${t.slice(0, 12)}」入账时目标暗流即不存在（疑似幻觉/损坏，非生命周期消失）` });
      }
    });
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

  // ── checker 10：人格/关系通道自洽（v2.51.0）──
  // 纪律：① 人格骰面必须五维齐备且 1-12；② 槽位必须在 A-L 且不被两人占用；
  //      ③ 关系行必须指到人名、量值 0-100；④ 阶梯名必须由量值反查得到（阶梯表与显示一致）。
  function checkPersonaRelation(state) {
    const issues = [];
    const reg = (WA.registry && WA.registry.list) ? safe(function () { return WA.registry.list(); }, []) : [];
    if (!WA.registry || typeof WA.registry.getPersona !== 'function') {
      issues.push({ level: 'info', code: 'persona.unavailable', detail: '人格/关系面未加载（registry 不可用）' });
      return issues;
    }
    const bands = (typeof WA.registry.relationBands === 'function') ? safe(function () { return WA.registry.relationBands(); }, []) : [];
    const slots = {};
    (reg || []).forEach(function (n) {
      const pe = safe(function () { return WA.registry.getPersona(n); }, null);
      if (pe && pe.locked) {
        if ((pe.missing || []).length) {
          issues.push({ level: 'error', code: 'persona.incomplete', detail: `「${n}」人格已锁定但缺维度 ${pe.missing.join('/')}（锁定即为终身，缺失说明写入被截断）` });
        }
        const sl = String(pe.slot || '');
        if (!/^[A-L]$/.test(sl)) issues.push({ level: 'error', code: 'persona.badSlot', detail: `「${n}」槽位「${sl}」非法（应为 A-L）` });
        else if (slots[sl]) issues.push({ level: 'error', code: 'persona.slotCollision', detail: `槽位 ${sl} 同时归属「${slots[sl]}」与「${n}」（稳定锚被破坏）` });
        else slots[sl] = n;
      }
      const pr = safe(function () { return WA.registry.getProfile(n); }, null) || {};
      (pr.relations || []).forEach(function (row, i) {
        if (!row || !String(row.target || '').trim()) { issues.push({ level: 'warn', code: 'relation.noTarget', detail: `「${n}」关系#${i} 缺对象` }); return; }
        ['intimacy', 'hostility', 'trust', 'vigilance', 'attachment'].forEach(function (f) {
          if (row[f] === undefined) return;
          const v = Number(row[f]);
          if (!(v >= 0 && v <= 100)) issues.push({ level: 'error', code: 'relation.outOfRange', detail: `「${n}」对「${row.target}」的 ${f}=${row[f]} 越界(0-100)` });
        });
        if (row.intimacy !== undefined && bands.length) {
          const hit = bands.filter(function (b) { return Number(row.intimacy) >= b.min && Number(row.intimacy) <= b.max; })[0];
          if (!hit) issues.push({ level: 'warn', code: 'relation.bandGap', detail: `「${n}」对「${row.target}」亲密度 ${row.intimacy} 落在阶梯表空隙（无语义档）` });
        }
        // v2.51.0：两条读路径（档案直读 vs 单向视图）必须给出同一档
        const view = safe(function () { return WA.registry.getRelation(n, row.target); }, null);
        if (view && view.known !== true) {
          issues.push({ level: 'error', code: 'relation.readPathDrift', detail: `「${n}」对「${row.target}」在档案里有、在单向视图里查不到（两条读路径不一致）` });
        } else if (view && bands.length) {
          const vb = bands.filter(function (b) { return Number(view.intimacy) >= b.min && Number(view.intimacy) <= b.max; })[0];
          if (view.intimacy !== row.intimacy) issues.push({ level: 'error', code: 'relation.valueDrift', detail: `「${n}」对「${row.target}」档案值 ${row.intimacy} 与视图值 ${view.intimacy} 不一致` });
          else if (vb && view.band !== vb.band) issues.push({ level: 'error', code: 'relation.bandDrift', detail: `「${n}」对「${row.target}」阶梯名「${view.band}」与量值 ${view.intimacy} 应对应的「${vb.band}」不一致` });
        }
      });
    });
    // v2.51.0：汇总面与逐人累计对账（汇总面自己算错时，逐人视角看不出）
    if (typeof WA.registry.relationStat === 'function') {
      const rs = safe(function () { return WA.registry.relationStat(); }, null);
      if (rs) {
        const relRows = (reg || []).reduce(function (a, n) {
          const pr = safe(function () { return WA.registry.getProfile(n); }, null) || {};
          return a + ((pr.relations || []).length ? 1 : 0);
        }, 0);
        if (rs.registered !== (reg || []).length) issues.push({ level: 'error', code: 'relation.countDrift', detail: `relationStat.registered=${rs.registered} 与 list()=${(reg || []).length} 不一致` });
        if (rs.withRelations !== relRows) issues.push({ level: 'warn', code: 'relation.withDrift', detail: `relationStat.withRelations=${rs.withRelations} 与逐人累计=${relRows} 不一致` });
        if (rs.personaLocked !== Object.keys(slots).length) issues.push({ level: 'warn', code: 'relation.lockedDrift', detail: `relationStat.personaLocked=${rs.personaLocked} 与逐人锁定=${Object.keys(slots).length} 不一致` });
      }
    }
    // 槽位层与档案层对账（槽位是内存态稳定锚，档案是持久面）
    if (typeof WA.registry.slotStat === 'function') {
      const ss = safe(function () { return WA.registry.slotStat(); }, null);
      if (ss && ss.used !== Object.keys(slots).length) {
        issues.push({ level: 'warn', code: 'persona.slotDrift', detail: `槽位层占用 ${ss.used} 与档案层锁定 ${Object.keys(slots).length} 不一致（有人绕过 setPersonaDice 写槽）` });
      }
    }
    return issues;
  }

  // ── checker 11：规则模块装载面（v2.51.0）──
  // 此前「规则库到底载了几个模块」从未被自洽体检看过：模块被改空、标签丢失、
  //   常驻守则突然涨到数千字（每轮都注入）都不会被任何检查发现。
  function checkRulesModules(state) {
    const issues = [];
    if (!WA.rules || typeof WA.rules.listModules !== 'function') {
      issues.push({ level: 'info', code: 'rules.unavailable', detail: '规则库未加载（rules 不可用）' });
      return issues;
    }
    const mods = safe(function () { return WA.rules.listModules(); }, []) || [];
    const sum = safe(function () { return WA.rules.coreSummary(); }, '') || '';
    if (!mods.length) issues.push({ level: 'error', code: 'rules.noModule', detail: '规则库零模块（整段注入会退化为空）' });
    mods.forEach(function (m) {
      if (!m.chars) issues.push({ level: 'error', code: 'rules.emptyModule', detail: `规则模块「${m.key}」文本为空（加载了但没内容）` });
      if (!m.label || m.label === m.key) issues.push({ level: 'warn', code: 'rules.noLabel', detail: `规则模块「${m.key}」缺中文标签（面板会露出键名）` });
      // v2.51.0：两条读路径（清单计数 vs 分组正文）长度必须一致
      const txt = safe(function () { return WA.rules.getModule(m.key); }, null);
      if (typeof txt === 'string' && txt.length !== m.chars) {
        issues.push({ level: 'error', code: 'rules.charsDrift', detail: `规则模块「${m.key}」清单计 ${m.chars} 字、分组正文 ${txt.length} 字（两条读路径不一致）` });
      }
    });
    // v2.51.0：标出本版新增模块（体检报告里能直接看出「哪些是缝进来的」）
    if (typeof WA.rules.isNewModule === 'function') {
      const added = mods.filter(function (m) { return WA.rules.isNewModule(m.key); }).map(function (m) { return m.key; });
      if (added.length) issues.push({ level: 'info', code: 'rules.newModules', detail: '本版缝入模块: ' + added.join('/') + '（共 ' + mods.length + ' 模块）' });
    }
    if (sum.length > 2000) {
      issues.push({ level: 'warn', code: 'rules.summaryTooLong', detail: `常驻守则 ${sum.length} 字（每轮注入，超过 2000 字需重新压缩）` });
    }
    // v2.51.0：人格/关系**落库被拒必须可见**——拒收是静默的（重骰每轮都会发生，
    //   而「模型没给」与「给了但被拒」在日志里长得一样）。
    if (WA.backstage && typeof WA.backstage.channelStat === 'function') {
      const cs = safe(function () { return WA.backstage.channelStat(); }, null);
      if (cs) {
        if (cs.pending > 0) {
          issues.push({ level: 'error', code: 'channel.pending', detail: '人格/关系缓冲残留 ' + cs.pending + ' 条未落库（事务提交后未 flush）' });
        }
        if (cs.last) {
          const rej = (cs.last.personaRej || 0) + (cs.last.relRej || 0);
          const rs = cs.last.reasons || {};
          const hard = Object.keys(rs).filter(function (k) { return k !== 'already-locked' && k !== 'no-change'; });
          if (rej > 0 && hard.length) {
            issues.push({ level: 'warn', code: 'channel.rejected', detail: '上一轮人格/关系落库被拒 ' + rej + ' 条 ' + JSON.stringify(rs) + '（already-locked 属预期重骰，其余需查）' });
          }
        }
      }
    }
    return issues;
  }

  // ── checker 12：叙事工艺设置面（v2.51.0）──
  // 本 checker 治的是一类**只有把两张表摆在一起数才看得见**的缺陷：档位表（CHOICES，界面与
  //   写路径共用）与正文表（PARA_TEXT 等，buildBlock 取文本的地方）是两处独立手写的东西。
  //   二者漂移的症状完全静默：用户选了某档位 → 写入合法 → styleStat().values 忠实显示该档位
  //   → 但 buildBlock 里那句 `if (TEXT[st.x]) push(...)` 直接跳过 ⇒ **档位看起来生效、正文零约束**。
  //   这不是「少一句提示」，而是「声明了却没实现」——本仓库反复出现的招牌形态，故设独立 checker。
  // 三态如实：本检查在 style 模块缺席时只记 info（无头环境不加载 UI，但 style 是产品文件，
  //   它缺席在浏览器里就是真断裂；此处保持与 rules 一致的口径，不把不可达环境判成 error）。
  function checkStyleCraft(state) {
    const issues = [];
    if (!WA.style || typeof WA.style.textCoverage !== 'function') {
      issues.push({ level: 'info', code: 'style.unavailable', detail: '叙事工艺设置面未加载（rules.craft 的消费口径暂无产生方）' });
      return issues;
    }
    const st = safe(function () { return WA.style.styleStat(); }, null);
    if (st) {
      // 「选了轴、但整块关着」与「整块开着、但一个轴都没选」是两种不同的空转，必须分开报：
      //   前者用户以为关了总开关就没事，后者是「开了却没约束」（零 token 但也没作用）。
      if (st.enabled === false) {
        const picked = Object.keys(st.values || {}).filter(function (k) {
          return k !== 'block' && k !== 'custom' && st.values[k] !== 'off';
        });
        if (picked.length) {
          issues.push({ level: 'warn', code: 'style.blocked', detail: '叙事工艺已选轴（' + picked.join('/') + '）但总开关为「停用」⇒ 整块不注入（配置被静默忽略）' });
        }
      }
      // 二道闸：注入可见性源关着 ⇒ 「设置生效但正文不进 prompt」。这条必须报，否则
      //   用户会得到与 v2.38.0 `echoes` 复选框「点了零效果」完全同形的体验。
      const vis = safe(function () { return WA.render.getVisibility(); }, {}) || {};
      if (st.enabled === true && !vis.style) {
        issues.push({ level: 'warn', code: 'style.notInjected', detail: '叙事工艺已启用，但注入可见性源「style」未开启 ⇒ 设置不生效（去「导演」页勾选「叙事工艺」）' });
      }
      // 记账异常的判据：`rejects/fallbacks` 非零 = 配置或调用出过问题（读路径回落默认值、
      //   写路径被拒）。这两笔此前完全不可观测，正是「我明明设了却被改回去」类投诉的唯一证据。
      if (st.rejects > 0) {
        issues.push({ level: 'warn', code: 'style.rejects', detail: '叙事工艺写入被拒 ' + st.rejects + ' 次（非法档位整笔拒收，最后一次：' + JSON.stringify(st.lastReject) + '）' });
      }
      if (st.fallbacks > 0) {
        issues.push({ level: 'warn', code: 'style.fallbacks', detail: '叙事工艺读路径回落默认值 ' + st.fallbacks + ' 次（最后一次：' + JSON.stringify(st.lastFallback) + '）' });
      }
      // 产物为空但轴已选：`builds` 有、`lastLen===0` 且 enabled 为真 ⇒ 产出口被短路。
      if (st.enabled === true && st.lastLen === 0 && st.emptyBuilds > 0) {
        issues.push({ level: 'error', code: 'style.emptyBuild', detail: '叙事工艺判定为已启用，但最近一次产出口长度为 0（整块开、轴也选了，却没有产出文本）' });
      }
    }
    // 覆盖度交叉校验（本 checker 的核心判据）：逐轴逐档比对「档位可选」↔「正文非空」。
    const cov = safe(function () { return WA.style.textCoverage(); }, {}) || {};
    const uncovered = [];
    Object.keys(cov).forEach(function (axis) {
      Object.keys(cov[axis]).forEach(function (c) {
        if (c !== 'off' && !(cov[axis][c] > 0)) uncovered.push(axis + '=' + c);
      });
    });
    if (uncovered.length) {
      issues.push({ level: 'error', code: 'style.uncovered', detail: '档位在表里可选、正文表却为空 ' + uncovered.length + ' 处：' + uncovered.join('、') + '（选了该档位 = 静默零约束）' });
    }
    return issues;
  }

  const CHECKERS = [
    { code: 'events', label: '事件链', fn: checkEvents },
    { code: 'factions', label: '势力', fn: checkFactions },
    { code: 'pulse', label: '脉搏/轮次', fn: checkPulse },
    { code: 'people', label: '人物认知', fn: checkPeople },
    { code: 'memory', label: '记忆/伏笔', fn: checkMemory },
    { code: 'refs', label: '来源引用', fn: checkRefs },
    { code: 'softRefs', label: '软引用完整性', fn: checkSoftRefs },
    { code: 'injection', label: '注入队列', fn: checkInjection },
    { code: 'pmem', label: '主观记忆', fn: checkPmem },
    { code: 'directEvents', label: '突发事件', fn: checkDirectEvents },
    { code: 'personaRelation', label: '人格/关系', fn: checkPersonaRelation },
    { code: 'rulesModules', label: '规则模块', fn: checkRulesModules },
    { code: 'styleCraft', label: '叙事工艺', fn: checkStyleCraft }
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
      checkedAt: clockNow('inspectorState')
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
    // v2.51.0（收口）: 「自洽」的判据是**无错误无警告**，不是「计数为零」。
    //   此前 total 含 info ⇒ 只要存在一条提示（如 rules.newModules 的「本版缝入模块」），
    //   干净存档就会被判成「⚠️ 发现 0 错误 / 0 警告 / 1 提示」——头部挂个警告符，
    //   而它其实完全自洽。用户看头衔判断状态，这条措辞在原理上就会误导。
    //   现在：无 error/warn 一律先说「自洽」，info 只作附注；有 error/warn 才降级。
    const info = c.info || 0;
    if (!c.error && !c.warn) {
      return '✅ 状态自洽（无异常）' + (info ? '（另有 ' + info + ' 条提示）' : '');
    }
    return `${report.ok ? '⚠️' : ''} 发现 ${c.error || 0} 错误 / ${c.warn || 0} 警告 / ${info} 提示`;
  }

  WA.inspectorState = {
    CHECKERS, SEVERITY_ORDER,
    checkEvents, checkFactions, checkPulse, checkPeople, checkMemory, checkRefs,
    checkSoftRefs,
    checkInjection, checkPmem, checkDirectEvents, checkPersonaRelation, checkRulesModules, checkStyleCraft,
    inspect, flatten, summaryText, safe
  };
  if (WA.log) WA.log('info', '状态检查器已加载');
})();