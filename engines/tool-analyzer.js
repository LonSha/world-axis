/**
 * WorldAxis engines/tool-analyzer.js (v0.9.1) — 世界态势分析器（纯只读）
 * 缝合来源：DlSNlGHT World —— world-engine-ui.js 态势评分（事件/风声/大势/势力/经济/区域 → pressure 合成）
 *
 * 与世界脉搏的区别：
 *  - worldPulse ：由 AI 推演在结算时写回的「叙事性」压力（0-3，含 trend/note）
 *  - 本分析器   ：由现有 store 数据「本地重算」出的量化快照，用于人工核对推演是否失真、
 *                 以及在推演间隙观察世界是否过热/过冷
 *
 * 输出：
 *  - pressure{event,wind,trend,faction,econ,region,total}  ← 六路加权（World 面板同源口径）
 *  - momentum  ：活跃度（活跃事件/暗流/伏笔推进数）
 *  - load      ：上下文负载（各注入块字数估算 + 常驻 token 粗估）
 *  - risks[]   ：可行动提示（过热/停滞/负载超限/记忆堰塞）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  // 六路权重（World ui 面板同源）：每路先归一到 [-1,1]，再乘权重
  const WEIGHTS = { event: 12, wind: 6, trend: 9, faction: 8, econ: 5, region: 7 };
  const STAGE_PROGRESS = {
    conflict: { 萌芽: 0.2, 发酵: 0.5, 逼近: 0.8, 已爆发: 1, 已消散: 0 },
    progress: { 筹备: 0.2, 执行: 0.5, 关键: 0.8, 已完成: 1, 已失败: 0 }
  };
  // v0.9.6: 气候枚举对齐 evolution.ECONOMY_CLIMATE（繁荣|平稳|衰退|动荡），
  // 消除与 backstage 契约的跨模块漂移——模型按契约产出「衰退/动荡」时此处查表落空、
  // 静默回落 0.2（等同平稳），压力计算长期偏移。衰退=负压、动荡=强负压。
  const ECON_SCORE = { 繁荣: 1, 平稳: 0.2, 衰退: -0.6, 动荡: -1 };
  const OVERHEAT = 45, OVERCOOL = -25;

  function read(state) { return state || WA.store.get(); }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── 六路压力 ──
  function pressureOf(state) {
    const ev = state?.evolution || {};

    // 事件：数量 × 等级 × 阶段进度
    let eventRaw = 0;
    for (const e of ev.events || []) {
      const prog = (STAGE_PROGRESS[e.type] || {})[e.stage];
      if (prog === undefined) continue;
      eventRaw += (Number(e.level) || 1) * prog;
    }
    const eventP = clamp(eventRaw * 2.2, 0, WEIGHTS.event);

    // 风声：等级累加
    let windRaw = 0;
    for (const w of ev.winds || []) { if (!w.quiet) windRaw += Number(w.level) || 1; }
    const windP = clamp(windRaw * 1.2, 0, WEIGHTS.wind);

    // 大势：持续中的数量
    const trendP = clamp((ev.worldTrends || []).filter(t => t.status === '持续中').length * 3, 0, WEIGHTS.trend);

    // 势力：关系值 × 运势系数（与合作势力=正压，敌对=负压，取绝对值表张力）
    let factionRaw = 0;
    const REL = { 血盟: -3, 盟友: -2.5, 友好: -2, 中立: 0, 冷淡: 1, 敌对: 3, 世仇: 4 };
    const STC = { 鼎盛: 1.4, 稳固: 1.2, 倾轧: 0.8, 困顿: 0.6, 衰落: 0.4, 瓦解: 0.2 };
    for (const f of ev.factions || []) {
      factionRaw += (REL[f.relation] ?? 0) * (STC[f.status] ?? 0.4);
    }
    const factionP = clamp(factionRaw * 0.9, -WEIGHTS.faction, WEIGHTS.faction);

    // 经济：气候映射（危机=正压力）
    const econScore = ECON_SCORE[ev.economy?.climate] ?? 0.2;
    const econP = clamp(-econScore * WEIGHTS.econ, -WEIGHTS.econ, WEIGHTS.econ);

    // 区域事件：active 为 1，冷却中衰减
    const ri = ev.regionalIncident;
    let regionP = 0;
    if (ri && ri.active) regionP = WEIGHTS.region;
    else if (ri && Number(ri.cooldown) > 0) regionP = clamp(WEIGHTS.region * 0.3, 0, WEIGHTS.region);

    const total = +(eventP + windP + trendP + Math.abs(factionP) * 0.5 + econP + regionP).toFixed(2);
    return {
      event: +eventP.toFixed(2), wind: +windP.toFixed(2), trend: +trendP.toFixed(2),
      faction: +factionP.toFixed(2), econ: +econP.toFixed(2), region: +regionP.toFixed(2),
      total, weights: WEIGHTS
    };
  }

  // ── 活跃度 ──
  function momentumOf(state) {
    const ev = state?.evolution || {};
    const events = ev.events || [];
    const active = events.filter(e => {
      const stages = STAGE_PROGRESS[e.type] || {};
      const keys = Object.keys(stages);
      return keys.indexOf(e.stage) < keys.length - 1;
    });
    const developing = (state?.memory?.foreshadows || []).filter(f => f.status === 'developing' || f.status === 'triggered');
    const waiting = (state?.memory?.foreshadows || []).filter(f => f.status === 'waiting');
    const hiddenCurrents = (state?.currents || []).filter(c => c.visibility === 'hidden');
    const publicCurrents = (state?.currents || []).filter(c => c.visibility === 'public');
    return {
      activeEvents: active.length,
      terminalEvents: events.length - active.length,
      developingForeshadows: developing.length,
      waitingForeshadows: waiting.length,
      hiddenCurrents: hiddenCurrents.length,
      publicCurrents: publicCurrents.length,
      alive: active.length + developing.length + publicCurrents.length
    };
  }

  // ── 上下文负载（粗估：中文按 1.4 字/ token 折算） ──
  function estimateTokens(text) {
    if (!text) return 0;
    const str = String(text);
    // 中文占比高则 ~1.5 字/token，英文 ~4 字/token，取加权
    let cjk = 0;
    for (const ch of str) { if (/[\u4e00-\u9fff]/.test(ch)) cjk++; }
    const rest = str.length - cjk;
    return Math.ceil(cjk / 1.5 + rest / 4);
  }

  function loadOf(state) {
    const blocks = {};
    const tryBuild = (label, fn) => {
      try {
        const v = fn();
        if (typeof v === 'string' && v.trim()) blocks[label] = { chars: v.length, tokens: estimateTokens(v) };
        else if (v && typeof v === 'object') blocks[label] = { chars: JSON.stringify(v).length, tokens: estimateTokens(JSON.stringify(v)) };
      } catch (e) { blocks[label] = { error: String(e && e.message || e) }; }
    };
    if (WA.render && WA.render.buildWorldSnapshot) tryBuild('世界快照', () => WA.render.buildWorldSnapshot());
    if (WA.memory && WA.memory.buildMemoryBlock) tryBuild('记忆块', () => WA.memory.buildMemoryBlock());
    if (WA.pmem && WA.pmem.buildBlock) tryBuild('主观记忆', () => WA.pmem.buildBlock());
    if (WA.summarizer && WA.summarizer.buildBlock) tryBuild('叙事摘要', () => WA.summarizer.buildBlock());
    if (WA.entities && WA.entities.buildEntitiesBlock) tryBuild('实体库', () => WA.entities.buildEntitiesBlock());
    if (WA.rules) {
      try {
        const core = WA.rules.coreSummary();
        const full = WA.rules.getAll();
        blocks['规则(精简)'] = { chars: core.length, tokens: estimateTokens(core) };
        blocks['规则(全文)'] = { chars: full.length, tokens: estimateTokens(full) };
      } catch (e) { /* ignore */ }
    }
    const runtimeTokens = Object.entries(blocks)
      .filter(([k]) => !k.includes('规则(全文)'))
      .reduce((n, [, v]) => n + (v.tokens || 0), 0);
    return { blocks, runtimeTokens };
  }

  // ── 风险提示 ──
  function risksOf(state, pressure, momentum, load) {
    const risks = [];
    const st = read(state);

    if (pressure.total >= OVERHEAT) {
      risks.push({ level: 'warn', code: 'overheat', detail: `世界压力 ${pressure.total} 偏高（≥${OVERHEAT}）：事件/张力堆积，建议让部分事件收束或插入平静期` });
    } else if (pressure.total <= OVERCOOL) {
      risks.push({ level: 'info', code: 'overcool', detail: `世界压力 ${pressure.total} 偏低（≤${OVERCOOL}）：世界近乎静止，可投放风声或远方事件` });
    }

    if (momentum.activeEvents === 0 && momentum.publicCurrents === 0) {
      risks.push({ level: 'warn', code: 'stalled', detail: '无活跃事件链且无公开暗流：推演可能失去抓手，检查 backstage 是否在正常结算' });
    }

    const waiting = momentum.waitingForeshadows;
    if (waiting >= 8) {
      risks.push({ level: 'warn', code: 'foreshadow_dam', detail: `伏笔堰塞：${waiting} 条 waiting（建议上限 8），回收或标记 developing` });
    }

    if (load.runtimeTokens > 6000) {
      risks.push({ level: 'warn', code: 'load_high', detail: `常驻注入约 ${load.runtimeTokens} tokens，偏高：可关 fullRules 或缩减可见性源` });
    }

    const fullRulesOn = (() => { try { return WA.backstage.getSettings().fullRules === true; } catch (e) { return false; } })();
    if (fullRulesOn) {
      const d = (load.blocks['规则(全文)']?.tokens || 0) - (load.blocks['规则(精简)']?.tokens || 0);
      risks.push({ level: 'info', code: 'fullrules_on', detail: `已开全量规则，比精简守则多约 ${d} tokens/轮` });
    }

    const events = st?.evolution?.events || [];
    const stalled = events.filter(e => e.stall);
    if (stalled.length) {
      risks.push({ level: 'info', code: 'event_stall', detail: `${stalled.length} 条事件带 stall 标记（推进受限）：${stalled.map(e => e.name).slice(0, 3).join('、')}` });
    }

    const people = Object.keys(st?.people || {}).length;
    if (people > 24) {
      risks.push({ level: 'warn', code: 'people_bloat', detail: `追踪人物 ${people} 位（建议 ≤24）：超出会稀释推演预算 npcBudget` });
    }

    return risks;
  }

  /** 全量分析 */
  function analyze(state) {
    const st = read(state);
    const pressure = pressureOf(st);
    const momentum = momentumOf(st);
    const load = loadOf(st);
    const risks = risksOf(st, pressure, momentum, load);
    return {
      pressure, momentum, load, risks,
      verdict: risks.some(r => r.level === 'warn') ? 'warn' : (pressure.total >= OVERHEAT ? 'hot' : 'ok'),
      analyzedAt: clockNow('toolAnalyzer')
    };
  }

  function summaryText(report) {
    if (!report) return '未分析';
    const p = report.pressure, m = report.momentum;
    const warns = report.risks.filter(r => r.level === 'warn').length;
    return `压力 ${p.total}（事件${p.event}/风声${p.wind}/大势${p.trend}/势力${p.faction}/经济${p.econ}/区域${p.region}）｜活跃事件${m.activeEvents} 暗流${m.publicCurrents}+${m.hiddenCurrents} 伏笔${m.developingForeshadows}/${m.waitingForeshadows}｜常驻≈${report.load.runtimeTokens}t${warns ? `｜⚠${warns}` : ''}`;
  }

  WA.toolAnalyzer = {
    WEIGHTS, OVERHEAT, OVERCOOL, STAGE_PROGRESS, ECON_SCORE,
    pressureOf, momentumOf, loadOf, risksOf, analyze, summaryText, estimateTokens
  };
  if (WA.log) WA.log('info', '世界态势分析器已加载');
})();