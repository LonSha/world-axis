/**
 * WorldAxis engines/capacity-audit.js (v2.182.0) — O4 存储压力 / 义务清点 / 迁移预检
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   容量侧的三件事在本仓**各自可查、合不起来**：
 *     · core/store.js __BOUNDED_CAPS（line 1350）—— 登记了每条容器的 cap 与裁剪站点；
 *     · core/evict.js SITES / NON_EVICT / IN_TRANSIT —— 挤出站点、写入侧硬上界、在途豁免；
 *     · engines/storage-forecast.js —— 按增速外推多少轮后到达配额档位。
 *   但没有任何一个面回答 O4 计划原文里那句话：
 *   **「哪些是会被挤掉的旧历史，哪些是绝不能丢的未完成义务」**。
 *   实测缺口（TP7 付过价的那条）：`world.deliverGoods` 连发 25 批货（cap=16）时，
 *   前 8 批**在途未到**的货被 slice 静默挤掉，调用方拿到 `{ok:true}` ——
 *   「货运回答『货在哪』」这张表一旦按环形丢，答案就变成「不知道」。
 *   TP7 已补上挤出侧豁免与写入侧硬上界，但**清点面仍然缺**：满没满、谁快满、
 *   哪些容器是在途保护对象、迁移会不会动到未完成义务 —— 都要人工翻四处源码。
 *
 * ── 本模块落点（只读聚合，不新增第二套状态）──────────────────
 *   · obligations(opts)  —— **不可丢义务**清点（在途货物 / 未结委托 / 未履约条款 /
 *                           未完成项目 / 未收线索 / 未结算后果 / 在途消息 / 逾期欠账 …）
 *   · waterline(opts)    —— 水位：逐容器 len / cap / 逼近度 / 已满 / 漂移 / 未登记
 *   · reclaimable()      —— **可回收历史**与不可回收面分列（环形站点 vs NON_EVICT vs 在途豁免）
 *   · migrationCheck()   —— 迁移预检（当前 schema / 目标 schema / 将走的步 / 上次报告 /
 *                           未来档拒收计数 / 形态补齐读数）—— **不跑迁移**，只判方向
 *   · sources()          —— 各源可用性（缺席如实报，不静默丢）
 *   · diagnose() / stat() / reset()
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：不挤出、不裁剪、不迁移、不改任何容器、不写 stat 之外的世界状态。
 *     特别地 migrationCheck() **不调用 store.migrate()** —— 那个函数会写 __migrateReport
 *     与 __loadStat.migrateRefused（观测层），在只读面上留痕等于污染下一次真迁移的报告。
 *     预检只判「方向 + 将走的步」，不试跑（试跑要深拷贝，而深拷贝本身不是只读的证明）。
 *   3 对未完成义务**不静默挤出**：本模块只清点与报告，处置权在写入侧（满即拒收）
 *     与挤出侧（IN_TRANSIT 豁免）。发现超限时如实报「已满」，不自行裁剪。
 *   4 对关联记录不独立删除成悬空引用：本模块不删任何行。
 *   5 历史截断明确标注覆盖范围：水位表按逼近度排序并**报出被截掉多少行**，
 *     不把「前 N 行都正常」说成「全部正常」。
 *   6 存储配额与权限失败按 `store` 合同返回，不猜测宿主自动保存成功：
 *     写盘成功与否一律读 `store.saveStat()`，读不到就报 unknown。
 *   7 不重复 storage-forecast 的外推计算 —— 直接调用它，不复制一份斜率公式。
 *   8 不新增第二套 cap 表：水位读 `store.sizeCaps()`，可回收面读 `evict.siteDecls()`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_capacity_audit_settings_v1';
  const DEF = { enabled: false, maxRows: 24, nearRatio: 0.8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'capacityAudit',
    bounds: { maxRows: [4, 96], nearRatio: [0.5, 1] } };
  function getSettings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  var _stat = { reads: 0, refused: 0, lastReason: '', faults: {}, bySource: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function noteSource(name, n) { _stat.bySource[name] = (_stat.bySource[name] || 0) + n; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function safe(fn, fb) { try { const r = fn(); return (r === undefined) ? fb : r; } catch (e) { return fb; } }

  // ── 义务清点 ──────────────────────────────────────────────
  //   十二个源，每源一条。**读口优先**：模块自己知道「什么算未完成」
  //   （`pending()` / `overdue()` 是它们各自口径的真源），本模块只做合并与展示，
  //   不替它们判（边界：不新增第二套到期判定 —— 与 agenda 同口径）。
  //   走 store 直读的三源（freight / diplomacy / world 在途）没有 pending 读口，
  //   故按各自的**终态字面量**过滤（transit / active / in-transit），
  //   这三个字面量与各模块源码逐字一致（现场核对过，不是猜的）。
  const OBLIGATION_SOURCES = [
    { name: 'commission', label: '委托（未结阶段）',
      probe: function () { return !!(WA.commission && typeof WA.commission.pending === 'function'); },
      collect: function () {
        const r = WA.commission.pending();
        if (!r || !r.ok) return { disabled: !!(r && r.reason === 'disabled'), rows: [] };
        return { rows: (r.items || []).map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.title, 60), extra: '阶段 ' + ((num(x.stage) || 0) + 1) + '/' + (num(x.total) || 0) };
        }) };
      } },
    { name: 'operations', label: '运营项目（未完成里程碑）',
      probe: function () { return !!(WA.operations && typeof WA.operations.pending === 'function'); },
      collect: function () {
        const r = WA.operations.pending();
        if (!r || !r.ok) return { disabled: !!(r && r.reason === 'disabled'), rows: [] };
        return { rows: (r.items || []).map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.name, 60), extra: '里程碑 ' + (num(x.completed) || 0) + '/' + (num(x.total) || 0) };
        }) };
      } },
    { name: 'aftermath', label: '地点效果（修复在途）',
      probe: function () { return !!(WA.aftermath && typeof WA.aftermath.pending === 'function'); },
      collect: function () {
        const r = WA.aftermath.pending();
        if (!r || !r.ok) return { disabled: !!(r && r.reason === 'disabled'), rows: [] };
        return { rows: (r.items || []).map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.placeId, 40), extra: '修复 ' + (num(x.progress) || 0) + '/' + (num(x.target) || 0) };
        }) };
      } },
    { name: 'investigation', label: '线索（未揭示）',
      probe: function () { return !!(WA.investigation && typeof WA.investigation.pending === 'function'); },
      collect: function () {
        const r = WA.investigation.pending();
        if (!r || !r.ok) return { disabled: !!(r && r.reason === 'disabled'), rows: [] };
        return { rows: (r.items || []).map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.title, 60), extra: clean(x.status, 20) + ' · 证据 ' + (num(x.evidence) || 0) };
        }) };
      } },
    { name: 'storyChoice', label: '故事分支（未选择）',
      probe: function () { return !!(WA.storyChoice && typeof WA.storyChoice.pending === 'function'); },
      collect: function () {
        const r = WA.storyChoice.pending();
        if (!r || !r.ok) return { disabled: !!(r && r.reason === 'disabled'), rows: [] };
        return { rows: (r.points || []).map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.prompt, 60), extra: (num(x.options) || 0) + ' 选项' };
        }) };
      } },
    { name: 'farfield', label: '在途传闻（未到近场）',
      probe: function () { return !!(WA.farfield && typeof WA.farfield.pending === 'function'); },
      collect: function () {
        const r = WA.farfield.pending();
        if (!r || !r.ok) return { rows: [] };
        return { rows: (r.rows || []).map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.place, 40), extra: '延迟 ' + (num(x.delayDays) || 0) + ' 日' };
        }) };
      } },
    { name: 'coop', label: '协作提案（待处理）',
      probe: function () { return !!(WA.coop && typeof WA.coop.pending === 'function'); },
      collect: function () {
        const rows = WA.coop.pending();
        if (!Array.isArray(rows)) return { rows: [] };
        return { rows: rows.map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.actor, 40) || clean(x.by, 40), extra: '尝试 ' + (num(x.tries) || 0) };
        }) };
      } },
    { name: 'collab', label: '协作队列（未落地）',
      probe: function () { return !!(WA.collab && typeof WA.collab.pending === 'function'); },
      collect: function () {
        const rows = WA.collab.pending();
        if (!Array.isArray(rows)) return { rows: [] };
        return { rows: rows.map(function (x) {
          return { id: clean(x.opId, 40), label: clean(x.kind, 30), extra: clean(x.by, 30) };
        }) };
      } },
    { name: 'longline', label: '伏笔承诺（已逾期）',
      probe: function () { return !!(WA.longline && typeof WA.longline.overdue === 'function'); },
      collect: function () {
        const rows = WA.longline.overdue();
        if (!Array.isArray(rows)) return { rows: [] };
        return { rows: rows.map(function (x) {
          return { id: clean(x.id, 40), label: clean(x.content, 60), extra: '已逾 ' + Math.round((num(x.lateBy) || 0) / 60000) + ' 分钟' };
        }) };
      } },
    { name: 'freight', label: '货运（在途）',
      probe: function () { return Array.isArray(((state().freight || {}).shipments)); },
      collect: function () {
        const arr = ((state().freight || {}).shipments) || [];
        if (!Array.isArray(arr)) return { rows: [] };
        return { rows: arr.filter(function (s) { return s && s.status === 'transit'; }).map(function (s) {
          return { id: clean(s.id, 40), label: clean(s.from, 30) + '→' + clean(s.to, 30),
            extra: clean(s.resource, 30) + ' ' + (num(s.qty) || 0) };
        }) };
      } },
    { name: 'diplomacy', label: '条约条款（生效中）',
      probe: function () { return !!(WA.diplomacy && typeof WA.diplomacy.stat === 'function'); },
      collect: function () {
        const pairs = ((state().diplomacy || {}).pairs) || {};
        const out = [];
        // 形状以现场为准：`diplomacy.pairs` 是**对象**（pairId → pair），不是数组。
        //   agenda 初稿按数组遍历过，整源被 try 吞成空表 —— 同一处形状，本模块不再踩第二次。
        Object.keys(pairs).forEach(function (k) {
          const p = pairs[k];
          const terms = (p && Array.isArray(p.terms)) ? p.terms : [];
          terms.forEach(function (t, i) {
            if (!t || t.status !== 'active') return;
            out.push({ id: clean(p.id || k, 40) + '#' + i, label: clean(t.label, 40) || clean(t.term, 30),
              extra: (num(t.until) > 0) ? '有期限' : '无期限' });
          });
        });
        return { rows: out };
      } },
    { name: 'world', label: '世界织体（在途：货 / 信 / 程）',
      probe: function () { return Array.isArray(((state().world || {}).shipments)); },
      collect: function () {
        const w = state().world || {};
        const out = [];
        ['shipments', 'messages', 'journeys'].forEach(function (k) {
          const arr = Array.isArray(w[k]) ? w[k] : [];
          arr.forEach(function (x) {
            if (!x || x.status !== 'in-transit') return;
            out.push({ id: clean(x.id, 40), label: k + '：' + (clean(x.from, 24) || '?') + '→' + (clean(x.to, 24) || '?'),
              extra: 'in-transit' });
          });
        });
        return { rows: out };
      } }
  ];

  /**
   * 不可丢义务清点。
   * @returns {{ok:boolean, reason?:string, rows:Array, total:number, perSource:object, disabled:Array}}
   *   每行形状：`{source, id, label, extra}` —— 只做「是谁、什么状态、还剩多少」，
   *   不替来源模块判「该不该继续」（处置权不在本模块）。
   */
  function obligations(opts) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], total: 0, perSource: {}, disabled: [] }; }
    if (!(WA.store && typeof WA.store.get === 'function')) { noteFault('no-store'); return { ok: false, reason: 'no-store', rows: [], total: 0, perSource: {}, disabled: [] }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.min(cfg.maxRows, Math.floor(num(o.limit))) : cfg.maxRows;
    const rows = [], perSource = {}, disabled = [];
    OBLIGATION_SOURCES.forEach(function (s) {
      let got = { rows: [] };
      try { got = s.collect() || { rows: [] }; } catch (e) { got = { rows: [] }; }
      const list = Array.isArray(got.rows) ? got.rows : [];
      perSource[s.name] = list.length;
      noteSource(s.name, list.length);
      if (got.disabled) disabled.push(s.name);
      list.forEach(function (r) { rows.push({ source: s.name, id: r.id, label: r.label, extra: r.extra }); });
    });
    // 排序：先按来源稳定序，再按 id —— 稳定输出（同一存档两次清点逐字相同）。
    rows.sort(function (a, b) {
      if (a.source !== b.source) return a.source < b.source ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
    });
    const total = rows.length;
    const capped = total > limit;
    const kept = capped ? rows.slice(0, limit) : rows;
    _stat.reads++;
    return { ok: true, rows: kept, count: kept.length, total: total, capped: capped,
      perSource: perSource, disabled: disabled,
      coverage: capped ? ('仅显示前 ' + limit + ' / ' + total + ' 条（其余义务仍在世界状态里，未显示不等于不存在）') : ('全部 ' + total + ' 条'),
      note: '这里只清点、不裁剪：未完成义务的处置权在写入侧（满即拒收）与挤出侧（在途豁免），本模块不代它们动手' };
  }

  // ── 水位 ──────────────────────────────────────────────────
  //   cap 表读 `store.sizeCaps()`（唯一真源），状态读 `store.get()`。
  //   通配键（`sediment.rows.*.events` 一类）**不展开**：展开要遍历全部行，
  //   而它们由父容器隐式约束 —— 如实记进 wildcardSkipped，不假装查过。
  function resolveLen(st, path) {
    const segs = String(path).split('.');
    let cur = st;
    for (let i = 0; i < segs.length; i++) {
      if (cur === null || cur === undefined || typeof cur !== 'object') return null;
      cur = cur[segs[i]];
    }
    if (Array.isArray(cur)) return cur.length;
    if (cur && typeof cur === 'object') return Object.keys(cur).length;
    return null;
  }
  function waterline(opts) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }
    if (!(WA.store && typeof WA.store.sizeCaps === 'function')) { noteFault('no-store'); return { ok: false, reason: 'no-store', rows: [] }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const st = state();
    const caps = safe(function () { return WA.store.sizeCaps(); }, {}) || {};
    const rows = [], wildcardSkipped = [];
    Object.keys(caps).forEach(function (k) {
      const meta = caps[k] || {};
      if (meta.wildcard) { wildcardSkipped.push(k); return; }
      const len = resolveLen(st, k);
      if (len === null) return;                              // 未物化：registryParity 的事，不在水位表里重复报
      const capNum = (typeof meta.cap === 'number' && isFinite(meta.cap)) ? meta.cap : null;
      // cap:'per-call'（TX 线六环 + diplomacy 两环）是**写入侧硬上界**，静态值取不到 ——
      //   如实标 unknown，不拿一个猜出来的数冒充阈值（那正是「点了没效果的开关」的读法）。
      const ratio = (capNum && capNum > 0) ? (len / capNum) : null;
      let level = 'unknown';
      if (capNum === 0) level = 'no-writer';                 // 当前无写入方：一旦增长即需登记
      else if (ratio !== null) level = (len >= capNum) ? 'full' : (ratio >= cfg.nearRatio ? 'near' : 'ok');
      rows.push({ path: k, kind: meta.kind || 'array', len: len, cap: capNum,
        capDeclared: (meta.cap === undefined) ? null : meta.cap,
        ratio: (ratio === null) ? null : Math.round(ratio * 1000) / 1000,
        level: level, site: clean(meta.site, 120) });
    });
    // 排序：逼近度降序（null 最后）→ 已满优先 → 路径稳定序。
    rows.sort(function (a, b) {
      const ra = (a.ratio === null) ? -1 : a.ratio, rb = (b.ratio === null) ? -1 : b.ratio;
      if (rb !== ra) return rb - ra;
      return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0);
    });
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.min(cfg.maxRows, Math.floor(num(o.limit))) : cfg.maxRows;
    const capped = rows.length > limit;
    const kept = capped ? rows.slice(0, limit) : rows;
    const full = rows.filter(function (r) { return r.level === 'full'; });
    const near = rows.filter(function (r) { return r.level === 'near'; });
    // 外推不自己算：直接问 storage-forecast（边界 7：同一件事不两本账）。
    const fc = safe(function () {
      if (!WA.storageForecast || typeof WA.storageForecast.forecast !== 'function') return null;
      return WA.storageForecast.forecast();
    }, null);
    const saveStat = safe(function () { return WA.store.saveStat ? WA.store.saveStat() : null; }, null);
    _stat.reads++;
    return { ok: true, rows: kept, count: kept.length, total: rows.length, capped: capped,
      coverage: capped ? ('仅显示最满的前 ' + limit + ' / ' + rows.length + ' 个容器（其余容器水位未列，不等于没满）') : ('全部 ' + rows.length + ' 个已物化容器'),
      full: full.map(function (r) { return r.path; }), fullCount: full.length,
      nearCount: near.length, wildcardSkipped: wildcardSkipped,
      forecast: fc, persistedBytes: saveStat ? saveStat.bytes : null,
      saveOk: saveStat ? saveStat.ok : null, saveReason: (saveStat && saveStat.reason) ? saveStat.reason : '',
      note: 'cap 为 null 者（per-call / 未声明）阈值不在静态表里，如实标 unknown 而不猜一个数' };
  }

  // ── 可回收面 vs 不可回收面 ────────────────────────────────
  function reclaimable() {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const sites = safe(function () { return WA.evict && WA.evict.siteDecls ? WA.evict.siteDecls() : {}; }, {}) || {};
    const nonEvict = safe(function () { return WA.evict && WA.evict.nonEvictDecls ? WA.evict.nonEvictDecls() : {}; }, {}) || {};
    const es = safe(function () { return WA.evict && WA.evict.evictStat ? WA.evict.evictStat() : null; }, null);
    const ring = Object.keys(sites).map(function (k) {
      const s = sites[k] || {};
      const by = (es && es.bySite && es.bySite[k]) ? es.bySite[k] : null;
      return { site: k, path: s.path, cap: s.cap, kind: s.kind || 'array',
        evicts: by ? by.evicts : 0, dropped: by ? by.dropped : 0,
        lastWhat: by && by.lastWhat ? by.lastWhat.slice() : [] };
    });
    ring.sort(function (a, b) { return (b.dropped - a.dropped) || (a.site < b.site ? -1 : 1); });
    return { ok: true,
      ring: ring, ringCount: ring.length,
      nonEvict: Object.keys(nonEvict).map(function (k) { return { path: k, why: nonEvict[k] }; }),
      nonEvictCount: Object.keys(nonEvict).length,
      // 在途保护读数（挤出侧最后一道兜底）：held=因豁免而未丢的行数；full=在途自身超 cap。
      //   两者**都不是实现缺陷**（与 evict.js 的口径逐字一致），故不进 faults。
      inTransit: es ? Object.assign({}, es.live || {}) : null,
      evictStat: es ? { evicts: es.evicts, evicted: es.evicted, noops: es.evictNoops,
        failed: es.evictFailed, failedBy: Object.assign({}, es.failedBy || {}) } : null,
      note: '环形站点 = 会被挤掉的旧历史；NON_EVICT = 写入侧硬上界（满即拒收，从不截断既有项）；在途豁免 = 最后一道兜底' };
  }

  // ── 迁移预检 ──────────────────────────────────────────────
  /**
   * 迁移预检（**只读判断，不跑迁移**）。
   *   为什么不试跑：`store.migrate()` 会写 `__migrateReport` 与 `__loadStat.migrateRefused` ——
   *   在只读面上留痕，等于污染下一次**真**迁移的报告（那是复盘唯一证据）。
   *   预检只答四问：现在什么版本 / 目标什么版本 / 会走哪几步 / 上次跑成什么样。
   */
  function migrationCheck() {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!(WA.store && typeof WA.store.get === 'function')) { noteFault('no-store'); return { ok: false, reason: 'no-store' }; }
    const codeV = (typeof WA.store.SCHEMA_VERSION === 'number') ? WA.store.SCHEMA_VERSION : null;
    const stV = safe(function () { const s = state(); return (typeof s.schemaVersion === 'number') ? s.schemaVersion : null; }, null);
    const steps = safe(function () { return WA.store.migrations ? WA.store.migrations() : []; }, []) || [];
    const report = safe(function () { return WA.store.migrateReport ? WA.store.migrateReport() : null; }, null);
    const loadStat = safe(function () { return WA.store.loadStat ? WA.store.loadStat() : null; }, null);
    // 方向判定与 store.migrate 的拒收口径**逐字同源**（fromV > SCHEMA_VERSION 且未显式 target
    //   ⇒ 拒收不降级）：本模块不另立一套判据，只把那条判据的结果提前说出来。
    let direction = 'unknown', plan = [];
    if (codeV !== null && stV !== null) {
      if (stV > codeV) { direction = 'future-schema-will-refuse'; }
      else if (stV < codeV) {
        direction = 'upgrade-pending';
        for (let v = stV; v < codeV; v++) if (steps.indexOf(v) >= 0) plan.push(v + '->' + (v + 1));
      } else { direction = 'same'; }
    }
    _stat.reads++;
    return { ok: true, codeSchema: codeV, stateSchema: stV, direction: direction, plan: plan,
      registeredSteps: steps,
      lastReport: report,
      refusedCount: loadStat ? (loadStat.migrateRefused || 0) : null,
      lastRefused: loadStat ? (loadStat.lastRefused || null) : null,
      shapeFix: loadStat ? (loadStat.lastFix || null) : null,
      // 形态补齐的冲突数与「填了多少格」分列：前者是**真冲突**（类型对不上），后者是缺字段补齐。
      //   合成一个数就再也答不出「存档是坏了还是只是旧」。
      note: direction === 'future-schema-will-refuse'
        ? '存档 schema 高于当前代码：按 store.migrate 的口径会**拒收不降级**（不改写任何字节）——请升级扩展'
        : (direction === 'upgrade-pending' ? '存档低于代码：下次载入会走上述迁移步（失败步会被记进 lastReport.failed，原存档保留）'
          : '版本一致：载入不会触发迁移；形态补齐仍会跑（lastFix 是它的读数）') };
  }

  // ── 源可用性 ──────────────────────────────────────────────
  const SOURCE_PROBES = [
    { name: 'store', probe: function () { return !!(WA.store && typeof WA.store.get === 'function'); } },
    { name: 'storeCaps', probe: function () { return !!(WA.store && typeof WA.store.sizeCaps === 'function'); } },
    { name: 'evict', probe: function () { return !!(WA.evict && typeof WA.evict.evictStat === 'function'); } },
    { name: 'storageForecast', probe: function () { return !!(WA.storageForecast && typeof WA.storageForecast.forecast === 'function'); } }
  ].concat(OBLIGATION_SOURCES.map(function (s) {
    return { name: s.name, probe: s.probe };
  }));
  function sources() {
    return SOURCE_PROBES.map(function (s) {
      let available = false;
      try { available = !!s.probe(); } catch (e) { available = false; }
      return { name: s.name, available: available, read: (_stat.bySource[s.name] || 0) };
    });
  }

  function diagnose() {
    const checks = {
      store: !!(WA.store && typeof WA.store.get === 'function'),
      sizeCaps: !!(WA.store && typeof WA.store.sizeCaps === 'function'),
      evict: !!(WA.evict && typeof WA.evict.siteDecls === 'function'),
      storageForecast: !!(WA.storageForecast && typeof WA.storageForecast.forecast === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    const ok = checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.182.0',
      sourceCount: OBLIGATION_SOURCES.length };
  }

  function stat() {
    return { reads: _stat.reads, refused: _stat.refused, lastReason: _stat.lastReason,
      faults: Object.assign({}, _stat.faults), bySource: Object.assign({}, _stat.bySource),
      enabled: getSettings().enabled, maxRows: getSettings().maxRows };
  }

  function reset() { _stat.reads = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; _stat.bySource = {}; return { ok: true }; }

  WA.capacityAudit = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    obligations: obligations,
    waterline: waterline,
    reclaimable: reclaimable,
    migrationCheck: migrationCheck,
    sources: sources,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 10;
  var _exported = Object.keys(WA.capacityAudit).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('capacityAudit: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/capacity-audit.js', { kind: 'engine', ver: '2.182.0' });
})();