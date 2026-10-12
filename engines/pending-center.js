/**
 * WorldAxis engines/pending-center.js (v2.206.0) — E1 统一待处理事项中心
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
 *   按仓规「无消费方不挂导出」，裁掉注入段。
 *
 * ── 第三次整改（v2.206.0 · 拓展 2）：从「只能看」到「可处理」──────────────
 *   上一版把八源归一到一张表，但**表上的每一条都点不动**：玩家看到「委托在等你验收」，
 *   还得自己记住该去哪个页、按哪个键。缺口不是「没有动作」，而是**聚合面与写口之间
 *   没有接线**：八个来源各自都有公开写口，而本中心一个都没接。
 *   本版接线（新增一个透传写入口 `act(kind, action, ref)`），并守住下面 9–11 三条边界。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：不改任何来源模块的状态、不改存档、不写 store、不隐式写盘。
 *   3 不把维护者诊断（内部路径、原始计数）搬进玩家面 —— 只给「模块 / 类型 / 描述 / 路由」。
 *   4 某模块关闭时其待办**不出现**（进 skipped 并带原因，不静默消失、也不冒充「没有」）。
 *   5 未知或无法归一的事项**如实列出**（进 skipped 带 bad-shape），不静默丢弃。
 *   6 四族形状的差异在**归一化层**消化，不在调用方分支 —— 判据只认统一形状。
 *   7 **不新增第二套确认逻辑**：本模块**不持有**任何确认语义 —— 动作仍是各来源模块
 *     自己的公开写口，本模块只做「解析动作 → 校验 → 调用 → 归一结果」。
 *     本模块**不碰 store、不开事务、不写存档**（写口自持事务，见 11）。
 *     v2.206.0 起本模块转出一个写入口 `act()`：它是**透传**，不是第二套状态 ——
 *     拒收语义与返回体一字不改地来自来源模块（原体挂在 `data` 上）。
 *   9 **动作表只收推得出参数的**：需要玩家另行给值（验收回执号 / 调查人手 / 拨款金额 /
 *     选项标签 / 参与者名）的动作**不收** —— 收进来必然要替玩家编一个值。
 *     未收录的动作用 NOT_ACTIONS **如实列出**（含理由），由 `describe().actionNote` 念出来，
 *     不静默略过（本仓的「缺席 != 空 != 无事」）。
 *  10 **编排层失败另开 `fault` 命名空间**（`bad-action` / `no-such-action` /
 *     `action-unavailable` / `action-threw` / `missing-ref` / `write-needs-tx`），
 *     与 `engines/beat-facade.js`（U1）同规 —— 免得「来源拒收」与「编排失败」在读数上同形。
 *  11 **不做半写**：动作表声明 `tx:true`（该写口自持事务）；调用前先验本刻**真有**事务机制
 *     （`store.transact` 或 `commit.chain`），都没有 ⇒ 拒收 `write-needs-tx` 且**不调**写口。
 *     宁可不动，也不留一笔非原子的世界写。
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

  var _stat = { reads: 0, refused: 0, acts: 0, actRejects: 0, lastReason: '', faults: {}, bySource: {} };
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
      actions: actionsOf(kind),
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

  // 日程面（engines/agenda.js）的五源 —— **只用于回答「这一源有没有接上期限面」**。
  //   它是「可复算的现场事实」而不是第二份真源：真读口仍是 agenda.upcoming()，
  //   本表只喂 `due.why` 的 not-in-agenda / agenda-no-row 之分（漏列只会让 why 偏保守）。
  const SOURCES_AG = ['longline', 'commission', 'diplomacy', 'freight', 'aftermath'];

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
    return { ok: true, rows: kept.map(function (r) { return Object.assign({}, r, { route: Object.assign({}, r.route), actions: (r.actions || []).slice() }); }),
      count: kept.length, total: rows.length, capped: capped,
      skipped: skipped, perSource: perSource, sourceCount: liveSrc.length,
      emptyAll: emptyAll, emptyReported: emptyReported, unavailable: unavailable,
      allClear: rows.length === 0 && !emptyAll && !unavailable,
      note: '聚合面只给路由与可透传的动作名：确认语义仍由各来源模块自己的写口持有（经 act() 透传，本层不新增）；关闭/缺席的模块进 skipped 不静默消失；'
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

  // ── 待办 × 期限（v2.208.0）：把「等我处理」与「什么时候到期」连成一张表 ──
  //   它治的病（两条，都来自现场实测，不来自文档）：
  //     ① 本模块**没有期限维度** —— `due/expire/until/deadline` 在源码里 0 命中；
  //     ② 两个面**不是同一个集合**，所以「各说一半」：
  //        · `agenda` 五源里 longline / diplomacy / freight 三源在本模块**没有条目**；
  //        · 本模块八源里 storyChoice / coop / farfield / backstage 四源在 `agenda` **没有条目**。
  //   于是玩家要自己在两个面板之间对：日程上「三天后到期」，到了待办页却看不到那一条。
  //   **本面只做并集与相连**：两边的行各自原样带过来，按 (来源, ref) 配对，
  //   配不上的如实报配不上（`link` 三值 both / pending / agenda）。
  //   ⚠ 最该记住的一条：`due.state` 的 **absent ≠ 无期限**。
  //     「本模块在日程面上没有条目」和「这条事项没有期限」是两个不同的回答 ——
  //     压成一个「无期限」，正是本仓治过的「不可分」病（v2.205.0 优化 2 同族）。
  //     故 `due.why` 分四种子因，另把「日程面本身不可用」单列：
  //       agenda-row        有日程行且给了时间
  //       agenda-unknown    有日程行，而它自己**明说时间未知**（不拿「现在」冒充）
  //       agenda-no-row     该源在日程面上，但**这一条**没有对应行
  //       not-in-agenda     该源**根本不在**日程面（没接上，不是没期限）
  //       agenda-unavailable 日程面本身不可用（关闭 / 世界钟未设定）—— 与上四条都不同
  //   只读：不改两个模块的任何状态、不替它们排序（排序口径留在 agenda 自己的实现里）；
  //   零新设置键（bounds 不动 —— 本面没有自己的开关，它跟随两个来源各自的启用面）。
  const DUE_KEYS = ['etaMs', 'expiresAtMs', 'untilMs', 'deadlineMs'];
  /** 日程行的时限字段（三个名字以现场为准；都没有 ⇒ 时间未知，不猜日期）。 */
  function dueOf(row) {
    for (var i = 0; i < DUE_KEYS.length; i++) {
      const v = num(row && row[DUE_KEYS[i]]);
      if (v !== null && v > 0) return { state: 'timed', atMs: v, basis: DUE_KEYS[i] };
    }
    return { state: 'unknown', atMs: null, basis: null };
  }
  function timeline(opts) {
    // 守卫**委托** items()，本面不重写那两行 —— 实测过的理由：抄一遍会让
    //   「禁用判定」这段源码出现两次，而负控制锚点要求**恰中 1 次**
    //   （e1 锁的 N0(4) 当场报「破坏锚点恰中 1 次（实 2）」）。重复即第二份真源。
    const o = (opts && typeof opts === 'object') ? opts : {};
    const one = items({});
    if (!one.ok) return { ok: false, reason: one.reason, rows: [] };
    // 日程面：不可用时**不静默降级**（不把「读不到」写成「没有期限」）。
    const AG = WA.agenda;
    let agOk = false, agReason = null, agRows = [], agSources = [];
    if (AG && typeof AG.upcoming === 'function') {
      try {
        const r = AG.upcoming({});
        if (r && r.ok) { agOk = true; agRows = Array.isArray(r.rows) ? r.rows : []; }
        else agReason = clean((r && r.reason) || 'bad-shape', 40);
      } catch (e) { agReason = 'source-threw'; }
    } else agReason = 'module-missing';
    if (agOk) {
      SOURCES_AG.forEach(function (nm) { if (agSources.indexOf(nm) < 0) agSources.push(nm); });
    }
    const byKey = {};
    function keyOf(src, ref) { return String(src) + '\u0000' + String(ref); }
    agRows.forEach(function (r) {
      if (!r || !r.source || !r.ref) return;
      byKey[keyOf(r.source, r.ref)] = r;
    });
    const usedAg = {};
    const rows = [];
    one.rows.forEach(function (p) {
      const k = keyOf(p.kind, p.ref);
      const ag = byKey[k] || null;
      if (ag) usedAg[k] = true;
      const isInAg = agSources.indexOf(p.kind) >= 0;
      const due = ag ? dueOf(ag)
        : { state: 'absent', atMs: null, basis: null,
          why: !agOk ? 'agenda-unavailable' : (isInAg ? 'agenda-no-row' : 'not-in-agenda') };
      if (due.state === 'timed') due.why = 'agenda-row';
      else if (due.state === 'unknown') due.why = 'agenda-unknown';
      rows.push({ link: ag ? 'both' : 'pending', source: p.kind, ref: p.ref,
        title: p.title, detail: p.detail, canAct: !!p.canAct,
        actions: (p.actions || []).slice(), blocked: p.blocked, due: due,
        route: { kind: p.kind, id: p.ref, settingsKey: p.route.settingsKey } });
    });
    // 只有日程、没有待办的行也要出现 —— 否则「日程上到期了，待办页看不见」这条病原样留着。
    agRows.forEach(function (r) {
      if (!r || !r.source || !r.ref) return;
      if (usedAg[keyOf(r.source, r.ref)]) return;
      const due = dueOf(r);
      due.why = (due.state === 'timed') ? 'agenda-row' : 'agenda-unknown';
      rows.push({ link: 'agenda', source: clean(r.source, 40), ref: clean(r.ref, 40),
        title: clean(r.label, 120), detail: clean(r.status, 40), canAct: !!r.canAct,
        actions: [], blocked: null, due: due,
        route: { kind: clean(r.source, 40), id: clean(r.ref, 40), settingsKey: null } });
    });
    // 稳定序：先「有时间者按时间升序」，再「未知/缺席者按 (来源, ref)」—— 不拿「现在」冒充。
    const timed = rows.filter(function (r) { return r.due.state === 'timed'; });
    const rest = rows.filter(function (r) { return r.due.state !== 'timed'; });
    timed.sort(function (a, b) { return a.due.atMs - b.due.atMs; });
    rest.sort(function (a, b) {
      return a.source === b.source ? String(a.ref).localeCompare(String(b.ref)) : String(a.source).localeCompare(String(b.source));
    });
    const capRows = getSettings().maxRows;
    const limit = (num(o.limit) && num(o.limit) > 0) ? Math.min(capRows, Math.floor(num(o.limit))) : capRows;
    const merged = timed.concat(rest);
    const capped = merged.length > limit;
    const kept = capped ? merged.slice(0, limit) : merged;
    const counts = { both: 0, pending: 0, agenda: 0, timed: timed.length, undated: rest.length };
    rows.forEach(function (r) { counts[r.link]++; });
    _stat.reads++;
    return { ok: true,
      rows: kept.map(function (r) { return Object.assign({}, r, { due: Object.assign({}, r.due) }); }),
      count: kept.length, total: merged.length, capped: capped, counts: counts,
      agenda: { ok: agOk, reason: agReason, rows: agRows.length, sources: agSources.slice() },
      note: '并集：两边各自的行原样带过来，按（来源, ref）相连；配不上的如实报配不上（link）'
        + '。due.state 的 absent **不等于**「无期限」—— why 区分 not-in-agenda（该源没接上日程面）'
        + '与 agenda-no-row（该源在日程面，但这一条没有对应行）；日程面不可用时一律标 agenda-unavailable'
        + (agOk ? '' : ('（本次日程面不可用：' + agReason + ' —— 表里没有期限读数是因为**读不到**，不是因为没有）')) };
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
  // ── 可处理面（v2.206.0）：动作表 + 透传调用 ──────────────────────────
  //   每条：来源模块（= kind）→ 允许的动作 → 该动作在来源模块上的**真写口名**与形态。
  //     fn  ：来源模块的**公开导出**成员名（不碰内部函数 —— 本层没有特权通道）
  //     args：从待办记录推参数的方式（见 argsFor）—— 只收推得出来的
  //     tx  ：该写口是否自持事务（true = 它自己开事务；本中心不代它开、也不替它提交）
  //     why ：这条动作为什么「不需要玩家再给值」
  const ACTIONS = {
    aftermath: {
      repair: { fn: 'repair', args: ['ref'], tx: true,
        why: '修复量由来源模块自己定（缺省 1），本层不替它编数' },
      cancel: { fn: 'cancel', args: ['ref'], tx: true,
        why: '放弃该效果：理由由写口自己兜底（缺省 cancelled），不是玩家输入' }
    },
    commission: {
      cancel: { fn: 'cancel', args: ['ref'], tx: true,
        why: '取消委托：理由由写口自己兜底（缺省 cancelled）' }
    },
    operations: {
      cancel: { fn: 'cancel', args: ['ref'], tx: true,
        why: '取消项目：理由由写口自己兜底（缺省 cancelled）' }
    }
  };

  //   为什么**不收**某些动作 —— 如实列出（不是静默略过）。describe().actionNote 会念出来。
  //   '*' 表示「这个来源整体没有可透传的单条动作」。
  const NOT_ACTIONS = {
    commission: { advance: '要验收回执号（receiptId）—— 本层推不出来，替玩家编一个就是伪造凭证' },
    investigation: { investigate: '要执行者与回执号（person / receiptId）—— 本层推不出来' },
    operations: { disburse: '要金额（amount > 0）—— 本层推不出来，编一个数就是替玩家花钱' },
    storyChoice: { confirm: '要选项标签（option）—— 本层推不出来，替玩家挑选项就是代他做决定' },
    coop: { confirm: '要参与者（by）—— 本层推不出来，编一个名字就是冒充他人提交' },
    farfield: { settlePulse: '它查的是 pulses 桶的 id，而 pending() 给的是 pending 桶的 id —— 两个 id 空间，接上去只会「点一个查不到的 id」' },
    backstage: { '*': '本模块的 pending 是**注入待确认**语义，写口是串行推演闸门（不是「处理这一条」）—— 没有可透传的单条动作' }
  };

  /** 该来源此刻**可透传**的动作名。空数组 = 没有推得出参数的动作，不是「无事」。 */
  function actionsOf(kind) {
    const t = ACTIONS[clean(kind, 40)];
    return t ? Object.keys(t) : [];
  }
  /** 该来源「本该接而未接」的动作名（如实报缺）。 */
  function notActionsOf(kind) {
    const t = NOT_ACTIONS[clean(kind, 40)];
    return t ? Object.keys(t) : [];
  }
  /** 某个未收录动作的理由（含 '*' 兜底）。 */
  function whyNot(kind, name) {
    const t = NOT_ACTIONS[clean(kind, 40)];
    if (!t) return null;
    return t[name] || t['*'] || null;
  }
  /** 参数装配：本版只有 'ref' 一种推法 —— 表里出现别的推法就是没接线（返回 null，不猜）。 */
  function argsFor(spec, ref) { return spec.args.map(function (t) { return t === 'ref' ? ref : null; }); }

  /**
   * 把一个动作**透传**到来源模块自己的公开写口。
   *   本层只做四件事：解析（表里有吗）→ 校验（写口在吗 / 事务在吗 / ref 有吗）→ 调用 → 归一。
   *   拒收语义**一字不改**地来自来源模块（原返回体挂在 `data` 上）。
   *   编排层自己的失败落 `fault`（非空即编排失败）；来源拒收落 `reason`（fault 为 null）。
   */
  function act(kind, action, ref) {
    const cfg = getSettings();
    const k = clean(kind, 40);
    const a = clean(action, 40);
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, fault: null, reason: 'disabled', kind: k, action: a }; }
    if (!k) { noteFault('missing-kind'); return { ok: false, fault: null, reason: 'missing-kind' }; }
    if (!a) { noteFault('bad-action'); return { ok: false, fault: 'bad-action', kind: k }; }
    const table = ACTIONS[k] || null;
    const spec = table ? table[a] : null;
    if (!spec) {
      noteFault('no-such-action');
      return { ok: false, fault: 'no-such-action', kind: k, action: a,
        allowed: table ? Object.keys(table) : [], why: whyNot(k, a) };
    }
    const r = clean(ref, 60);
    if (!r) { noteFault('missing-ref'); return { ok: false, fault: 'missing-ref', kind: k, action: a }; }
    const mod = WA[k];
    if (!(mod && typeof mod[spec.fn] === 'function')) {
      noteFault('action-unavailable');
      return { ok: false, fault: 'action-unavailable', kind: k, action: a, engine: k,
        detail: k + '.' + spec.fn + ' 不在场' };
    }
    // 不做半写（边界 11）：声明自持事务的写口，本刻必须真有事务机制，否则**不调**。
    const hasTx = !!(WA.store && typeof WA.store.transact === 'function')
      || !!(WA.commit && typeof WA.commit.chain === 'function');
    if (spec.tx && !hasTx) {
      noteFault('write-needs-tx');
      return { ok: false, fault: 'write-needs-tx', kind: k, action: a,
        detail: '该写口声明自持事务（tx:true），但本刻 store.transact 与 commit.chain 都不在场 —— '
          + '宁可不动，也不留一笔非原子的世界写' };
    }
    let raw = null;
    try { raw = mod[spec.fn].apply(mod, argsFor(spec, r)); }
    catch (e) {
      noteFault('action-threw');
      return { ok: false, fault: 'action-threw', kind: k, action: a, detail: String((e && e.message) || e) };
    }
    const out = (raw && typeof raw === 'object') ? raw : { ok: false, reason: 'bad-shape' };
    const ok = out.ok === true;
    if (ok) _stat.acts++; else _stat.actRejects++;
    const reason = (typeof out.reason === 'string' && out.reason) ? out.reason : null;
    if (reason) noteFault(reason);
    return { ok: ok, fault: null, kind: k, action: a, ref: r, fn: spec.fn,
      reason: reason, data: out };
  }

  /** **归属**：这条待办属于哪个面（面板拿它做分组，不改）。 */
  const ROUTE_PAGE = {
    aftermath: 'world', commission: 'people', investigation: 'world', operations: 'world',
    storyChoice: 'events', coop: 'net', farfield: 'net', backstage: 'inject'
  };
  /** v2.209.0（优化 6）：**落点** —— 哪一页真的渲染了这条记录（导航用）。
   *  为什么与归属分开：归属回答「它属于哪个面」（分组要它），落点回答
   *    「点『去处理』之后停得下来吗」。面板的导航按 `[data-rec]` 定位，
   *    所以落点必须是**真打了锚点的那一页**；从前导航拿归属当落点，
   *    于是 `commission:…` 被送到只渲染人口行的人物页 —— 每次都是
   *    `rec-not-rendered`（页到了、那条不在；「点击后直接定位」整条落空）。
   *  两个都是本层的读数，面板两份都不抄。 */
  const SEE_PAGE = {
    aftermath: 'events', commission: 'events', investigation: 'events',
    operations: 'events', storyChoice: 'events',
    coop: 'people', farfield: 'net', backstage: 'inject'
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
    const acts = row ? (row.actions || []).slice() : [];
    //   没有可透传动作时，把「为什么没有」念出来（缺席 != 空）：
    //   本来源有本该接而未接的动作 ⇒ 逐条给理由；一条都没有 ⇒ 如实说没有（不是遗漏）。
    const notWhy = acts.length ? null
      : (notActionsOf(k).map(function (n) { return (n === '*' ? '' : n + '：') + whyNot(k, n); }).join('；') || null);
    const ps = one.perSource[k] || null;
    return { ok: true, kind: k, id: row ? row.ref : null,
      page: ROUTE_PAGE[k] || null,
      // v2.209.0（优化 6）：落点与归属**分列**（见 SEE_PAGE 的注释）。
      //   面板导航取 `seePage`，分组取 `page` —— 一个读数不做两件事。
      seePage: SEE_PAGE[k] || ROUTE_PAGE[k] || null,
      module: k, settingsKey: row ? row.route.settingsKey : null,
      title: row ? row.title : null,
      canAct: row ? !!row.canAct : false,
      actions: acts,
      actionNote: acts.length
        ? '这些动作由来源模块的公开写口持有，经 act(kind, action, ref) 透传 —— 本层不新增确认语义'
        : (notWhy || '本来源没有本该接而未接的动作（它的待办只需读，处理在它自己的面板）'),
      blocked: (ps && ps.ok) ? null : (ps ? ps.reason : null),
      note: '只给路由（去哪看、看哪条、哪个设置键）与可透传的动作名；确认语义由来源模块自己的写口持有，本层只透传不新增' };
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
    // 动作面自证（v2.206.0）：表里登记的每个动作，在来源模块上**真的**有这个写口吗？
    //   治的是「表里有、写口没有」—— 那会让玩家点一个不存在的按钮。
    //   注意：这一项是**可红**的（表与现场不符即 ok=false），不是自报家门。
    const actChecks = {};
    let actDeclared = 0, actLive = 0;
    Object.keys(ACTIONS).forEach(function (k) {
      const mod = WA[k];
      const names = Object.keys(ACTIONS[k]);
      actDeclared += names.length;
      const liveNames = names.filter(function (n) { return !!(mod && typeof mod[ACTIONS[k][n].fn] === 'function'); });
      actLive += liveNames.length;
      actChecks[k] = { declared: names.length, live: liveNames.length };
    });
    const ok = checks.settingsBus && actDeclared === actLive;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.209.0', sourceCount: SOURCES.length,
      actions: { declared: actDeclared, live: actLive, bySource: actChecks },
      liveSources: live, emptyReporterCount: emptyCap,
      emptyAllReachable: live > 0 && emptyCap === live,
      note: 'emptyReporterCount 为 0 ⇒ emptyAll 在现版本不可达：来源不申报 empty 时，'
        + '「有数据但都办完」与「从来没有数据」不可区分，本面如实标注而不假称可分' };
  }

  function stat() {
    return { reads: _stat.reads, refused: _stat.refused,
      acts: _stat.acts, actRejects: _stat.actRejects, lastReason: _stat.lastReason,
      faults: Object.assign({}, _stat.faults), bySource: Object.assign({}, _stat.bySource),
      // v2.209.0（优化 6）：归属与落点两张表都进自证面 —— 导航停不停得下来，
      //   在这一层就该读得出来，不必去点一遍。
      routes: Object.assign({}, ROUTE_PAGE), seeRoutes: Object.assign({}, SEE_PAGE),
      enabled: getSettings().enabled, maxRows: getSettings().maxRows };
  }

  function reset() { _stat.reads = 0; _stat.refused = 0; _stat.acts = 0; _stat.actRejects = 0; _stat.lastReason = ''; _stat.faults = {}; _stat.bySource = {}; return { ok: true }; }

  WA.pendingCenter = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    items: items,
    soon: soon,
    bySource: bySource,
    describe: describe,
    act: act,
    timeline: timeline,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 11;
  var _exported = Object.keys(WA.pendingCenter).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('pendingCenter: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/pending-center.js', { kind: 'engine', ver: '2.209.0' });
})();