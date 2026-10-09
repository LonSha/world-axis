/**
 * WorldAxis engines/tool-import.js (v0.9.1) — 外部数据导入（多格式·防污染）
 * 缝合来源：DlSNlGHT World —— world-engine-ui.js 导入分支（区域事件专用导入 + 存档导入 + 格式判别）
 *
 * 支持的导入类型（自动识别，不需要用户选）：
 *  1. 全量存档      : { worldaxis:2, state:{...} }   → 走 tool-snapshot.restore（带校验+恢复点）
 *  2. 区域事件单件  : { active, title, impact, ... } → 仅替换 evolution.regionalIncident
 *  3. 势力清单      : [ {name, status, relation, ...}, ... ] 或 { factions:[...] }
 *  4. 事件链清单    : [ {type, name, stage, ...}, ... ] 或 { events:[...] }
 *  5. 人物主观记忆  : [ {name, known_by, memory, time}, ... ] 或 { personal:[...] }
 *  6. 世界书条目组  : { entries:[{keys, content}, ...] } → 仅提示（世界书由 worldbook 引擎管，不落 store）
 *
 * 铁律：
 *  - 任何导入都先过结构校验，校验失败零写入
 *  - 走 store.transact（失败不留半份状态）
 *  - 逐条复用各编辑器的准入逻辑（势力五要件 / 事件 type 校验 / pmem 去重）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function isArr(v) { return Array.isArray(v); }
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function clean(v) { return WA.inputGuard.text(v, 80); }
  function txt(v) { return (v === undefined || v === null) ? '' : String(v); }

  /** 类型判别：返回 {kind, payload, confidence} */
  function detect(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      // v2.84.0：入界文本先过统一输入边界。敌意/异常形态在这里就被归因，
      //   而不是让 JSON.parse 抛出一条与「这不是 JSON」无关的运行时错误
      //   （原实现把任意异常都写成「不是合法 JSON」）。
      const chk = WA.inputGuard.check(raw, 4 * 1024 * 1024);
      if (!chk.ok) return { kind: 'invalid', reason: '入界文本不可读（' + chk.reason + '）' };
      try { data = JSON.parse(chk.value); }
      catch (e) { return { kind: 'invalid', reason: '不是合法 JSON：' + e.message }; }
    }
    if (!isObj(data) && !isArr(data)) return { kind: 'invalid', reason: '顶层不是对象或数组' };

    // 1 全量存档
    if (isObj(data) && (data.worldaxis !== undefined || (data.version !== undefined && data.state))) {
      return { kind: 'snapshot', payload: data, confidence: 'high' };
    }
    // 2 区域事件（World 面板单件格式：active+title+impact 三要素齐）
    if (isObj(data) && 'active' in data && 'title' in data && 'impact' in data && !data.state) {
      return { kind: 'regional', payload: data, confidence: 'high' };
    }
    // 5 人物主观记忆（含 name + memory 字段即为 pmem；World 记忆引擎导出格式）
    const pmemCandidate = isArr(data) ? data : (isArr(data.personal) ? data.personal : null);
    if (pmemCandidate && pmemCandidate.length && pmemCandidate.every(x => isObj(x) && (x.memory !== undefined) && (x.name !== undefined || x.names !== undefined))) {
      return { kind: 'pmem', payload: pmemCandidate, confidence: 'high' };
    }
    // 3 势力清单（用 some 判特征、every 判基本形状：容许个别缺件条目，交给逐条准入拦截）
    const factionCandidate = isArr(data) ? data : (isArr(data.factions) ? data.factions : null);
    if (factionCandidate && factionCandidate.length
      && factionCandidate.every(x => isObj(x) && x.name !== undefined && x.memory === undefined)
      && factionCandidate.some(x => x.status !== undefined || x.relation !== undefined || x.powerPillars !== undefined || x.scope !== undefined)) {
      return { kind: 'factions', payload: factionCandidate, confidence: 'high' };
    }
    // 4 事件链清单
    const eventCandidate = isArr(data) ? data : (isArr(data.events) ? data.events : null);
    if (eventCandidate && eventCandidate.length && eventCandidate.every(x => isObj(x) && (x.type === 'conflict' || x.type === 'progress') && x.name !== undefined)) {
      return { kind: 'events', payload: eventCandidate, confidence: 'high' };
    }
    // 6 世界书条目组（只提示，不落 store）
    const entryCandidate = isArr(data) ? data : (isArr(data.entries) ? data.entries : null);
    if (entryCandidate && entryCandidate.length && entryCandidate.every(x => isObj(x) && x.content !== undefined && (x.keys !== undefined || x.comment !== undefined))) {
      return { kind: 'worldbook', payload: entryCandidate, confidence: 'medium' };
    }
    return { kind: 'unknown', reason: '无法识别的结构（不是存档/区域事件/势力/事件链/主观记忆/世界书条目）' };
  }

  /** v2.87.0 A5 收口：字段映射抽成共用函数——差异预览与真跑用**同一份**映射。
   *   若预览自己再写一遍字段名，它会与真跑漂移：预览说「会新增」，真跑却因缺字段拒收。
   */
  function toFaction(item) {
    return { name: item.name, scope: item.scope, status: item.status, relation: item.relation,
      currentGoal: item.currentGoal || item.goal, core_person: item.core_person || item.core,
      powerPillars: item.powerPillars || item.pillars };
  }
  function toEvent(item) {
    return { type: item.type, name: item.name, level: item.level, stage: item.stage,
      stageRound: item.stageRound, desc: item.desc || item.description };
  }
  function toPmem(x) {
    return { name: x.name || x.names, known_by: x.known_by || x.knownBy,
      memory: x.memory || x.content || x.text, time: x.time };
  }
  /** v2.87.0 A5 收口：导入差异预览——「这次导入会新增什么、跳过什么、为什么」。
   *   在深拷贝上跑**同一批准入函数**（editorFaction.add 等），零副作用（不落盘、不改 store）。
   *   与 B6 的 rehearse 同一思想：预览与真跑不同源就毫无意义。
   */
  function previewPlan(raw) {
    const d = detect(raw);
    if (d.kind === 'invalid' || d.kind === 'unknown') return { ok: false, kind: d.kind, reason: d.reason, dryRun: true };
    let draft = {};
    try { draft = JSON.parse(JSON.stringify(WA.store.get() || {})); } catch (e) { draft = {}; }
    const rows = [];
    const push = function (label, r) {
      rows.push({ item: txt(label), ok: !!(r && r.ok), reason: txt(r && r.reason) });
    };
    if (d.kind === 'factions') {
      if (!WA.editorFaction || typeof WA.editorFaction.add !== 'function') return { ok: false, kind: d.kind, reason: 'editor-faction 未加载', dryRun: true };
      d.payload.forEach(function (item) { push(item.name, WA.editorFaction.add(draft, toFaction(item))); });
    } else if (d.kind === 'events') {
      if (!WA.editorEvents || typeof WA.editorEvents.add !== 'function') return { ok: false, kind: d.kind, reason: 'editor-events 未加载', dryRun: true };
      d.payload.forEach(function (item) { push(item.name, WA.editorEvents.add(draft, toEvent(item))); });
    } else if (d.kind === 'pmem') {
      if (!WA.pmem || typeof WA.pmem.applyPersonalMemory !== 'function') return { ok: false, kind: d.kind, reason: 'pmem 未加载', dryRun: true };
      const r = WA.pmem.applyPersonalMemory(draft, d.payload.map(toPmem)) || {};
      rows.push({ item: '(批量)', ok: true, reason: 'added=' + (r.added || 0) + ' skipped=' + (r.skipped || 0) });
    } else {
      return { ok: true, kind: d.kind, total: 1, willAdd: 1, willSkip: 0, rows: [],
        note: '该类型按整件替换或由其他模块管理，不做逐条差异预览', dryRun: true };
    }
    const willAdd = rows.filter(function (x) { return x.ok; }).length;
    return { ok: true, kind: d.kind, total: rows.length, willAdd: willAdd, willSkip: rows.length - willAdd,
      rows: rows.slice(0, 20), dryRun: true };
  }
  /** 各类型导入执行器（都走 transact；返回 {ok, added, skipped, reason}） */
  const IMPORTERS = {
    snapshot(raw) {
      if (!WA.toolSnapshot) return { ok: false, reason: 'tool-snapshot 未加载' };
      const r = WA.toolSnapshot.restore(raw);
      return r.ok ? { ok: true, added: 1, detail: r.counts } : { ok: false, reason: r.reason };
    },

    regional(raw) {
      const tx = WA.store.transact(d => {
        if (!d.evolution) d.evolution = {};
        d.evolution.regionalIncident = {
          active: raw.active === true || raw.active === 'true',
          title: clean(raw.title),
          type: clean(raw.type || 'other'),
          scope: clean(raw.scope),
          impact: clean(raw.impact),
          cooldown: Math.max(0, Number(raw.cooldown) || 0),
          _retry: raw._retry === true || raw._retry === 'true',
          _retryType: clean(raw._retryType)
        };
      });
      return tx.ok ? { ok: true, added: 1 } : { ok: false, reason: '写入失败' };
    },

    factions(list) {
      if (!WA.editorFaction) return { ok: false, reason: 'editor-faction 未加载' };
      let added = 0, skipped = 0;
      const reasons = [];
      const tx = WA.store.transact(d => {
        for (const item of list) {
          const r = WA.editorFaction.add(d, toFaction(item));   // v2.87.0：与差异预览同一映射
          if (r.ok) added++; else { skipped++; if (reasons.length < 3) reasons.push(r.reason); }
        }
      });
      return tx.ok ? { ok: true, added, skipped, reasons } : { ok: false, reason: '事务失败' };
    },

    events(list) {
      if (!WA.editorEvents) return { ok: false, reason: 'editor-events 未加载' };
      let added = 0, skipped = 0;
      const reasons = [];
      const tx = WA.store.transact(d => {
        for (const item of list) {
          const r = WA.editorEvents.add(d, toEvent(item));   // v2.87.0：与差异预览同一映射
          if (r.ok) added++; else { skipped++; if (reasons.length < 3) reasons.push(r.reason); }
        }
      });
      return tx.ok ? { ok: true, added, skipped, reasons } : { ok: false, reason: '事务失败' };
    },

    pmem(list) {
      if (!WA.pmem) return { ok: false, reason: 'pmem 未加载' };
      let added = 0, skipped = 0;
      const tx = WA.store.transact(d => {
        const r = WA.pmem.applyPersonalMemory(d, list.map(toPmem));   // v2.87.0：与差异预览同一映射
        added = r.added; skipped = r.skipped;
      });
      return tx.ok ? { ok: true, added, skipped } : { ok: false, reason: '事务失败' };
    },

    worldbook(list) {
      // 世界书条目由 worldbook 引擎按蓝绿灯自行选取，不入 store；
      // 这里只诊断兼容性，给出可操作提示（避免静默吞掉用户数据）。
      const withoutContent = list.filter(e => !clean(e.content)).length;
      const withoutKeys = list.filter(e => !isArr(e.keys) || !e.keys.length).length;
      return {
        ok: true, added: 0, applied: false,
        reason: `识别到 ${list.length} 条世界书条目，但世界书由 worldbook 引擎独立管理（蓝绿灯/按聊天隔离），不写入世界状态。` +
          (withoutContent ? ` 其中 ${withoutContent} 条无 content。` : '') +
          (withoutKeys ? ` 其中 ${withoutKeys} 条无 keys（永不会被触发，除非设为常驻）。` : '') +
          ' 请改用扩展的世界书面板导入。'
      };
    }
  };

  /** 主入口 */
  function importData(raw, opts = {}) {
    const d = detect(raw);
    if (d.kind === 'invalid' || d.kind === 'unknown') {
      return { ok: false, kind: d.kind, reason: d.reason };
    }
    if (opts.kind && opts.kind !== d.kind) {
      return { ok: false, kind: d.kind, reason: `识别为 ${d.kind}，与指定的 ${opts.kind} 不符` };
    }
    const fn = IMPORTERS[d.kind];
    if (!fn) return { ok: false, kind: d.kind, reason: '无对应导入器' };
    const r = fn(d.payload, opts);
    return Object.assign({ kind: d.kind }, r);
  }

  /** 只判别不导入（UI 预检） */
  function preview(raw) {
    const d = detect(raw);
    const size = (() => {
      try { return JSON.stringify(raw).length; } catch (e) { return 0; }
    })();
    return { kind: d.kind, reason: d.reason, confidence: d.confidence, size, count: isArr(d.payload) ? d.payload.length : (d.payload ? 1 : 0) };
  }

  // v2.87.0 A5 收口：toFaction/toEvent/toPmem 是 previewPlan 与 IMPORTERS 共用的**内部**映射
  //   （外部零引用 = self-only 过度导出），故不进导出面。与真跑同源这件事由
  //   previewPlan（对外口）承担：它在深拷贝上跑同一批准入函数。
  WA.toolImport = {
    detect, preview, previewPlan, importData, IMPORTERS
  };
  if (WA.log) WA.log('info', '外部数据导入工具已加载');
})();