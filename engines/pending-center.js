/**
 * WorldAxis engines/pending-center.js (v2.183.0) — E1 统一待处理事项中心
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   `pending` 在本仓出现在三十多个引擎里，作为**导出成员**的至少八个：
 *     aftermath / commission / investigation / operations / storyChoice / coop / farfield / backstage
 *   但它们的返回形状**四族各不相同**，而且都是「只能自己看自己」：
 *     · 族 A（items 桶）：`{ ok, items: [...], count, cap? }` — aftermath / commission / investigation / operations
 *     · 族 B（points 桶）：`{ ok, points: [...], count, cap? }` — storyChoice
 *     · 族 C（裸数组）：  `[...]`                        — coop
 *     · 族 D（rows 桶 / 单对象或 null）：`{ ok, count, rows }` — farfield；backstage 是 `{anchor,reason}` 或 null
 *   于是玩家要在十七页里逐页翻，且**每一族的「空」都长得不一样**：
 *   `items: []`（真没事办）与 `ok:false`（模块关着）在两族里分别是空数组与缺席，
 *   合成一个绿点就分不出「没数据」「模块关了」「真处理完了」三件事。
 *
 * ── 本模块落点（只读聚合 + 下钻，不新增第二套状态）──────────
 *   · items(opts)   —— 归一成统一「事项」记录的统一视图（来源模块 / 类型 / 描述 / 可否动作 /
 *                      截止或失效条件 / 当前阻塞原因），并**逐源**报它的读数
 *   · soon(n)       —— 最近的 n 条
 *   · bySource()    —— 逐源的可用性 + 条目数 + 拒收原因（缺席如实报，不静默丢）
 *   · describe(kind)—— 单条的下钻：去哪看、看哪条、哪个设置键（**只给路由，不执行动作**）
 *   · diagnose() / stat() / reset()
 *
 *   为什么没有 buildBlock（注入段）：本模块的真消费方是面板与诊断节，不是注入链。
 *   按仓规「无消费方不挂导出」，裁掉注入段。也**不新增确认动作** ——
 *   确认语义仍由各来源模块自己的公开写口持有，本模块只给路由（模块名 + 记录 id + 设置键）。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：不改任何来源模块的状态、不改存档、不写 store、不隐式写盘。
 *   3 不把维护者诊断（内部路径、原始计数）搬进玩家面 —— 只给「模块 / 类型 / 描述 / 路由」。
 *   4 某模块关闭时其待办**不出现**（进 skipped 并带原因，不静默消失、也不冒充「没有」）。
 *   5 未知或无法归一的事项**如实列出**（进 skipped 带 bad-shape），不静默丢弃。
 *   6 四族形状的差异在**归一化层**消化，不在调用方分支 —— 判据只认统一形状。
 *   7 **不新增第二套确认逻辑**：本模块不导出任何写口。
 *   8 空态与「全部处理完」可分：三旗标（unavailable / emptyAll / allClear）**分开报**，
 *     并另报 emptyReported（可达性证据 —— 见下）。
 *
 * ── 现场实测的第二次整改：一盏不亮的灯也要有原因 ────────────────
 *   初版只有 emptyAll / allClear，八个源全部缺席时 allClear=true：
 *   把「读不到」报成了「全处理完」（本仓反复裁决过的「缺席 ≠ 空 ≠ 无事」）。
 *   补上 unavailable 之后仍有一处**承诺与现场不符**：
 *     八个来源的 `pending()` **没有一个**申报 `empty` 字段（实测全仓零命中），
 *   于是 emptyAll 在现版本**恒假** —— 它自称的「有源但还没产生数据」这一态推不出来。
 *   两种处理都不诚实：删掉它则把「空」并进 allClear（回到最初那个病）；
 *   留着不说则是一个**永远不亮的灯**（用户会把它当成「从没出过这一态」的证据）。
 *   故本版：
 *     · 保留 emptyAll（来源一旦申报即生效，判据是「全部在场源都自报 empty」）；
 *     · **同时**报出 emptyReported（有几个在场源真的回答了「空不空」）与诊断面的
 *       emptyReporterCount / emptyAllReachable —— 它是这个旗标**能不能亮**的现场证据，
 *       0 就是「本版亮不了」，且这件事永远有一个出口说出来；
 *     · `empty` 走**三值**（true / false / null-未申报）：把「没申报」压成 false 就是
 *       拿一个假回答冒充真回答，那正是诊断面永久报不出可达性的根因；
 *     · allClear 的语义**收窄**到它唯一能断言的那句话（「读过、此刻没有待办」），
 *       并在 note 里明写「有数据但都办完」与「从来没有数据」在来源不申报时**不可区分**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_pending_center_settings_v1';
  const DEF = { enabled: false, maxRows: 32, soonCount: 8 };
  const __REG = { key: LS_KEY, def: DEF, module: 'pendingCenter',
    bounds: { maxRows: [4, 128], soonCount: [1, 32] } };
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
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }

  // ── 事项归一（四族形状在这里消化，调用方只见统一形状）──────
  //   统一形状：{ kind, source, ref, title, detail, canAct, route, blocked }
  //     kind    ：来源模块名（下钻的路由首段）
  //     source  ：同上（分开列是为了「来源」与「类型」在读数上可分别演进）
  //     ref     ：记录 id（来源模块自己的 id，不重编）
  //     title   ：玩家可见描述（来自来源模块，不重写、不润色）
  //     detail  ：进度类补充（如「第2/5阶段」），来源没给就留空
  //     canAct  ：**来源模块自己声明**可否动作；本模块不替它判
  //     route   ：下钻路由 { kind, id, settingsKey }
  //     blocked ：该源当前的阻塞原因（没被挡则 null）
  function mk(kind, source, ref, title, detail, opts) {
    const o = opts || {};
    return { kind: kind, source: source, ref: clean(ref, 60), title: clean(title, 120),
      detail: detail ? clean(detail, 80) : '',
      canAct: !!o.canAct, route: { kind: kind, id: clean(ref, 60), settingsKey: o.settingsKey || null },
      blocked: o.blocked ? clean(o.blocked, 60) : null };
  }

  // `empty` 的**三值**语义：来源申报了 true / 申报了 false / **根本没申报**，是三种不同的回答，
  //   而这正是「emptyAll 这盏灯能不能亮」的全部依据。压成 `!!r.empty` 会把「没申报」也写成 false，
  //   于是诊断面**永久**报不出「本版 emptyAll 不可达」—— 那盏灯不亮也没人知道为什么。
  function emptyOf(r) { return (r && typeof r.empty === 'boolean') ? r.empty : null; }

  // ── 逐源采集：四族各一个自适应器；适配器只做**形状归一**，不改语义 ──
  //   返回 { ok, reason, items, empty, allClear }
  //     ok:false ⇒ 模块缺席或关闭（进 skipped，带原因；**不**当成「没有条目」）
  //     ok:true  ⇒ empty（三值：来源有没有申报「空」）与 allClear（这一源此刻没有条目）
  function adaptBucketArray(ns, fn, kind, bucket, settingsKey) {
    const mod = WA[ns];
    if (!(mod && typeof mod[fn] === 'function')) return { ok: false, reason: 'module-missing', items: [] };
    let r = null;
    try { r = mod[fn](); } catch (e) { return { ok: false, reason: 'source-threw', items: [] }; }
    if (!r || typeof r !== 'object') return { ok: false, reason: 'bad-shape', items: [] };
    if (!r.ok) return { ok: false, reason: clean(r.reason, 40) || 'disabled', items: [] };
    const arr = Array.isArray(r[bucket]) ? r[bucket] : [];
    return { ok: true, reason: null, items: arr.map(function (x) { return mk(kind, ns, x && x.id, x && (x.title || x.name || x.prompt || x.placeId), null, { settingsKey: settingsKey }); }),
      empty: emptyOf(r), allClear: arr.length === 0 };
  }

  function fromAftermath() { return adaptBucketArray('aftermath', 'pending', 'aftermath', 'items', 'worldaxis_aftermath_settings_v1'); }
  function fromCommission() { return adaptBucketArray('commission', 'pending', 'commission', 'items', 'worldaxis_commission_settings_v1'); }
  function fromInvestigation() { return adaptBucketArray('investigation', 'pending', 'investigation', 'items', 'worldaxis_investigation_settings_v1'); }
  function fromOperations() { return adaptBucketArray('operations', 'pending', 'operations', 'items', 'worldaxis_operations_settings_v1'); }

  // 族 B（points 桶）+ detail = 选项数
  function fromStoryChoice() {
    const mod = WA.storyChoice;
    if (!(mod && typeof mod.pending === 'function')) return { ok: false, reason: 'module-missing', items: [] };
    let r = null;
    try { r = mod.pending(); } catch (e) { return { ok: false, reason: 'source-threw', items: [] }; }
    if (!r || !r.ok) return { ok: false, reason: clean(r && r.reason, 40) || 'disabled', items: [] };
    const arr = Array.isArray(r.points) ? r.points : [];
    return { ok: true, reason: null,
      items: arr.map(function (x) { return mk('storyChoice', 'storyChoice', x && x.id, x && x.prompt, (x && x.options ? x.options + ' 个选项' : ''), { canAct: true, settingsKey: 'worldaxis_story_choice_settings_v1' }); }),
      empty: emptyOf(r), allClear: arr.length === 0 };
  }

  // 族 C 之一：coop.pending(of) 返回**裸数组**（不是 {ok,items}）
  function fromCoop() {
    const mod = WA.coop;
    if (!(mod && typeof mod.pending === 'function')) return { ok: false, reason: 'module-missing', items: [] };
    let arr = null;
    try { arr = mod.pending(); } catch (e) { return { ok: false, reason: 'source-threw', items: [] }; }
    if (!Array.isArray(arr)) return { ok: false, reason: 'bad-shape', items: [] };
    return { ok: true, reason: null,
      items: arr.map(function (x) { return mk('coop', 'coop', x && x.id, (x && (x.actor || x.by)) + ' 的待重放提交', (x && x.load ? '负载 ' + clean(x.load, 30) : ''), { settingsKey: 'worldaxis_coop_settings_v1' }); }),
      // 裸数组形状**没有**申报面：来源根本没机会回答「空不空」，故如实报 null（不是 false）。
      empty: null, allClear: arr.length === 0 };
  }

  // 族 D 之一：farfield.pending() 返回 { ok, count, rows }
  function fromFarfield() {
    const mod = WA.farfield;
    if (!(mod && typeof mod.pending === 'function')) return { ok: false, reason: 'module-missing', items: [] };
    let r = null;
    try { r = mod.pending(); } catch (e) { return { ok: false, reason: 'source-threw', items: [] }; }
    if (!r || typeof r !== 'object') return { ok: false, reason: 'bad-shape', items: [] };
    if (!r.ok) return { ok: false, reason: clean(r.reason, 40) || 'disabled', items: [] };
    const arr = Array.isArray(r.rows) ? r.rows : [];
    return { ok: true, reason: null,
      items: arr.map(function (x) { return mk('farfield', 'farfield', x && x.id, clean(x && x.place, 40) + '：' + clean(x && x.trend, 40) + ' 尚未抵达', (num(x && x.delayDays) !== null ? '延迟 ' + num(x.delayDays) + ' 天' : ''), { settingsKey: 'worldaxis_farfield_settings_v1' }); }),
      empty: emptyOf(r), allClear: arr.length === 0 };
  }

  // 族 D 之二：backstage 的 pending 是**注入待确认**语义，形状与上面三族都不同：
  //   现场实测（engines/backstage.js）返回 `pendingAnchor`，形态是
  //     `{ anchor: {idx,swipe,hash}, reason }`  —— **单个对象，不是数组**；无待办时返回 null。
  //   这正是本模块存在的理由之一：同一名字（pending）在仓里至少有四种返回形状，
  //   而调用方**无法从名字推出形状**（猜字段的代价，agenda.js 的初稿已踩过两次）。
  function fromBackstage() {
    const mod = WA.backstage;
    if (!(mod && typeof mod.pending === 'function')) return { ok: false, reason: 'module-missing', items: [] };
    let r = null;
    try { r = mod.pending(); } catch (e) { return { ok: false, reason: 'source-threw', items: [] }; }
    // null / undefined ⇒ 真「无事」：这是**在场且空**，不是缺席（两件事必须可分）。
    //   但 `empty` 只能报 null（未申报）：本形状是「单对象或 null」，它连一个
    //   「本模块此刻有没有数据」的字段都没有 —— 如实报 null，不拿 false 冒充一个回答。
    if (r === null || r === undefined) return { ok: true, reason: null, items: [], empty: null, allClear: true };
    if (typeof r !== 'object' || Array.isArray(r)) return { ok: false, reason: 'bad-shape', items: [] };
    const a = r.anchor || {};
    const ref = (typeof a.idx === 'number') ? ('m' + a.idx + '_s' + (a.swipe || 0)) : '';
    return { ok: true, reason: null,
      items: [mk('backstage', 'backstage', ref,
        '待串行推演（' + clean(r.reason, 40) + '）', ref ? '锚点 ' + ref : '',
        { settingsKey: 'worldaxis_backstage_settings_v1' })],
      empty: null, allClear: false };
  }

  const SOURCES = [
    { name: 'aftermath', fn: fromAftermath },
    { name: 'commission', fn: fromCommission },
    { name: 'investigation', fn: fromInvestigation },
    { name: 'operations', fn: fromOperations },
    { name: 'storyChoice', fn: fromStoryChoice },
    { name: 'coop', fn: fromCoop },
    { name: 'farfield', fn: fromFarfield },
    { name: 'backstage', fn: fromBackstage }
  ];

  // ── 主读面：统一待办视图 ────────────────────────────────────
  function items(opts) {
    const cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const rows = [], skipped = [], perSource = {};
    SOURCES.forEach(function (s) {
      let got = null;
      try { got = s.fn() || { ok: false, reason: 'source-threw', items: [] }; } catch (e) { got = { ok: false, reason: 'source-threw', items: [] }; }
      if (!got.ok) {
        // 边界 4：关闭 / 缺席的模块**不静默消失**，如实列进 skipped 并带原因。
        skipped.push({ source: s.name, reason: clean(got.reason, 40) || 'unavailable' });
        perSource[s.name] = { ok: false, reason: clean(got.reason, 40) || 'unavailable', count: 0, empty: null, allClear: null };
        return;
      }
      const list = got.items || [];
      perSource[s.name] = { ok: true, reason: null, count: list.length, empty: got.empty === undefined ? null : got.empty, allClear: !!got.allClear };
      noteSource(s.name, list.length);
      list.forEach(function (r) { rows.push(r); });
    });
    // 稳定序：先按来源声明序，再按来源给的 id 升序 —— 不用对象键序（会随插入顺序漂移）。
    const order = {};
    SOURCES.forEach(function (s, i) { order[s.name] = i; });
    rows.sort(function (a, b) {
      const d = order[a.source] - order[b.source];
      if (d !== 0) return d;
      return String(a.ref).localeCompare(String(b.ref));
    });
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.min(cfg.maxRows, Math.floor(num(o.limit))) : cfg.maxRows;
    const capped = rows.length > limit;
    const kept = capped ? rows.slice(0, limit) : rows;
    _stat.reads++;
    // ── 三态**必须可分**，且**可答范围必须如实标注**（边界 8）──
    const liveSrc = Object.keys(perSource).filter(function (k) { return perSource[k].ok; });
    const emptyReported = liveSrc.filter(function (k) { return perSource[k].empty === true; }).length;
    const emptyAll = liveSrc.length > 0 && rows.length === 0 && emptyReported === liveSrc.length;
    const unavailable = liveSrc.length === 0;
    return { ok: true, rows: kept.map(function (r) { return Object.assign({}, r, { route: Object.assign({}, r.route) }); }),
      count: kept.length, total: rows.length, capped: capped,
      skipped: skipped, perSource: perSource, sourceCount: liveSrc.length,
      emptyAll: emptyAll, emptyReported: emptyReported, unavailable: unavailable,
      allClear: rows.length === 0 && !emptyAll && !unavailable,
      note: '聚合面只给路由：确认语义仍由各来源模块自己的写口持有；关闭/缺席的模块进 skipped 不静默消失；'
        + 'unavailable（读不到）/ emptyAll（有源且全部自报无数据）/ allClear（读过且此刻没有待办）三旗标分开报；'
        + 'emptyReported 是「有几个在场源真的申报了 empty」—— 它为 0 时 emptyAll 不可达，'
        + '而「有数据但都办完」与「从来没有数据」在来源不申报的前提下**不可区分**，本面不假称可分'
    };
  }

  function soon(n) {
    const cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', rows: [] };
    const k = (num(n) && num(n) > 0) ? Math.min(cfg.soonCount, Math.floor(num(n))) : cfg.soonCount;
    return items({ limit: k });
  }

  // ── 逐源可用性（不调用采集函数：探一次可用性不该改变被探对象）──
  function bySource() {
    return SOURCES.map(function (s) {
      const mod = WA[s.name];
      let available = false;
      try { available = !!(mod && typeof mod.pending === 'function'); } catch (e) { available = false; }
      return { name: s.name, available: available, read: (_stat.bySource[s.name] || 0) };
    });
  }

  // ── 下钻：只给路由，不执行动作（边界 3/7）────────────────────
  //   答三问：去哪看（kind → 面板页/模块）、看哪条（id）、哪个设置键（settingsKey）。
  const ROUTE_PAGE = {
    aftermath: 'world', commission: 'people', investigation: 'world', operations: 'world',
    storyChoice: 'events', coop: 'net', farfield: 'net', backstage: 'inject'
  };
  function describe(kind, id) {
    const k = clean(kind, 40);
    if (!k) { noteFault('missing-kind'); return { ok: false, reason: 'missing-kind' }; }
    const hit = SOURCES.filter(function (s) { return s.name === k; })[0];
    if (!hit) { noteFault('unknown-kind'); return { ok: false, reason: 'unknown-kind', kind: k }; }
    const one = items({});
    if (!one.ok) return { ok: false, reason: one.reason };
    const rec = id ? one.rows.filter(function (r) { return r.kind === k && r.ref === String(id); })[0] : null;
    if (id && !rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', kind: k, id: clean(id, 60) }; }
    const row = rec || one.rows.filter(function (r) { return r.kind === k; })[0] || null;
    // `blocked` 的两种取值都是**在场读数**：该源此刻 ok（⇒ null，它没被挡）或它给出的拒收原因。
    //   刻意**不写** `: 'unknown'` 这种兜底 —— 走到这里的 k 一定在 SOURCES 里（上面 hit 已校验），
    //   而 perSource 对每个源都会写一条（无论 ok 与否）⇒ perSource[k] 恒存在，那个兜底不可达。
    //   不可达的兜底字面量不是「防御」：它是一条**扫描面看得见、运行时永不出现**的假码
    //   （拒收码门禁会如实把它当新增码报出来 —— 本版实测正是被它抓到的）。
    const ps = one.perSource[k] || null;
    return { ok: true, kind: k, id: row ? row.ref : null,
      page: ROUTE_PAGE[k] || null,
      module: k, settingsKey: row ? row.route.settingsKey : null,
      title: row ? row.title : null,
      canAct: row ? !!row.canAct : false,
      blocked: (ps && ps.ok) ? null : (ps ? ps.reason : null),
      note: '只给路由（去哪看、看哪条、哪个设置键），不执行确认动作 —— 确认语义由来源模块自己的写口持有' };
  }

  function diagnose() {
    const checks = {
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function'),
      inputGuard: !!WA.inputGuard
    };
    SOURCES.forEach(function (s) { checks[s.name] = !!(WA[s.name] && typeof WA[s.name].pending === 'function'); });
    // empty 申报面：八源里**有几个**在场且真的回答了「空不空」。
    //   这一个是「emptyAll 这盏灯能不能亮」的现场证据 —— 亮不了时必须能看见原因，
    //   否则那个旗标就是「永远不亮、也没人知道为什么」的死灯。
    let emptyCap = 0, live = 0;
    SOURCES.forEach(function (s) {
      const m = WA[s.name];
      if (!(m && typeof m.pending === 'function')) return;
      live++;
      let r = null;
      try { r = m.pending(); } catch (e) { return; }
      if (r && typeof r === 'object' && !Array.isArray(r) && typeof r.empty === 'boolean') emptyCap++;
    });
    const ok = checks.settingsBus;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.183.0', sourceCount: SOURCES.length,
      liveSources: live, emptyReporterCount: emptyCap,
      emptyAllReachable: live > 0 && emptyCap === live,
      note: 'emptyReporterCount 为 0 ⇒ emptyAll 在现版本不可达：来源不申报 empty 时，'
        + '「有数据但都办完」与「从来没有数据」不可区分，本面如实标注而不假称可分' };
  }

  function stat() {
    return { reads: _stat.reads, refused: _stat.refused, lastReason: _stat.lastReason,
      faults: Object.assign({}, _stat.faults), bySource: Object.assign({}, _stat.bySource),
      enabled: getSettings().enabled, maxRows: getSettings().maxRows };
  }

  function reset() { _stat.reads = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; _stat.bySource = {}; return { ok: true }; }

  WA.pendingCenter = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    items: items,
    soon: soon,
    bySource: bySource,
    describe: describe,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 9;
  var _exported = Object.keys(WA.pendingCenter).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('pendingCenter: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/pending-center.js', { kind: 'engine', ver: '2.183.0' });
})();