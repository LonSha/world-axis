/**
 * WorldAxis engines/travel-desk.js (v2.210.0) — 地图上的行动与行程工作台（拓展 8）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   「能不能走到」「走多久」「路上堵不堵」「发一趟货」四件事**各自有口**，却
 *   **没有一个面把它们放在一起回答**：
 *     · `world.transit(ch, from, to)` 有完整三层判定（可达 / 投递封锁 / 天气折算），
 *       但它是**判定口**，报的是「这一次行不行」，不是「这个方案长什么样」；
 *     · `worldGraph.geo({from})` 只报**一跳**可达（源码注释明说「不做加权最短路 ——
 *       那是布局算法，不是本页的判据」），答不了「到 B 要多久、经过哪几段」；
 *     · `world.roadCapOf` / `world.roadUsage` / `world.roadBlockOf` 三个逐段读口
 *       **只有诊断面在用**，玩家侧没有任何一处把「这段路容量 2、此刻占 2」讲出来；
 *     · `freight.dispatch(routeId, from, resource, qty, opts)` 要**五个参数**，
 *       而玩家/面板拿不到「我该给什么路线、够不够货、要几天」的那张对照面；
 *     · 在途台账散在 **四处容器**（`world.journeys` / `world.freight.shipments` /
 *       `world.shipments` / `world.messages`），各自有各自的字段名与状态词。
 *   后果不是「读不出来」，而是**每一个消费方都要自己拼一遍** —— 而拼出来的
 *   读法必然慢慢漂开，且「界面预估」与「真引擎判定」一旦分家，玩家看到的
 *   预计时间与真走出去的时间就不再是同一件事（本仓反复治过的那一类）。
 *
 * ── 本模块只做四件事，**一次判定都不做** ───────────────────────
 *   ① `plan(ctx)`   —— 起终点 × 通道的**单一预览体**：可达 / 耗时 / 路径 / 逐段容量与
 *      占用 / 逐段封锁 / 天气折算 / 风险说明。耗时与路径**逐字段取自 `world.transit()`**，
 *      本模块**不重算**（「界面预估与真引擎一致」不是靠对齐算法，是靠**没有第二份算法**）；
 *   ② `commit(action, ctx)` —— 把动作**原样透传**给来源模块的公开写口
 *      （`world.depart` / `world.stop` / `freight.dispatch` / `freight.reroute` /
 *       `freight.cancel` / `freight.arrive`），自己不开事务、不碰 draft；
 *   ③ `ledger(ctx)` —— 在途三面（人物 / 货物 / 消息）汇成一张表。**每行报名自己的
 *      真源容器**（四处容器不合并 —— 合并就是把四件事说成一件）；
 *   ④ `verify(ctx)` —— 只读的路况重验口。`commit` 复用它，
 *      使「预览作废」只有**一份**判据。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **不另存第二份路线/行程状态**：全文零 `store.transact`、零 draft 赋值。
 *     在途清单一律**调用期读既有表**（`world.journeys` 等），本模块不落自己的台账。
 *   2 **不新增拒收码语义**：本文件**不出现**内联 `reason: '字面量'` 形态。编排层自身
 *     的失败另开 `fault` 命名空间（8 码，见 `FAULTS`）；**来源模块的拒收原样透传**
 *     （保住它自己的 `reason` 与参数）。理由与 `engines/beat-facade.js` 同款：
 *     `tests/reject-code-gate.js` 的扫描面只认内联 `reason:` 字面量，而那个命名空间里
 *     **每一个码都要有恢复动作**（U5）—— 把编排失败写进去，等于逼 U5 给「工作台没开」
 *     编一句给玩家的恢复建议，那正是造数据。
 *   3 **不做参数校验**：缺人名 / 缺路线 / 缺时长一律由**来源写口自己**拒收。
 *     本模块再判一遍就是两个真源，且现场无法归因「这到底是工作台拦的还是引擎拦的」。
 *   4 **到点前不提前抵达**：`safeOpts` 剥掉 `force`（那是「忽略时钟」的开关）。
 *     到点与否由源引擎按自己的时钟判，不由调用方一句话覆盖。
 *   5 **预览是进程态交互物**：`stamp` 由**调用方回带**，本模块只比对不存储 ——
 *     存一份就等于造了第二份状态容器（与边界 1 同源）。
 *   6 **全关即零存在**：本模块关闭时 `plan` / `commit` / `ledger` 一律拒收
 *     `desk-off`，不改任何上游行为、不产注入块（本模块**没有** `buildBlock`）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.219.0';
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : (typeof v === 'string' ? v.slice(0, max || 40) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  // v2.219.0（拓展 N5）：多站/会合的缺省时刻。**只用于「没给 at 时取当下」**——
  //   逐段耗时仍一律取自 world.transit()，本模块不按墙钟算路程（那是第二份算法）。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  // ── 设置（同一格偏好键；不是世界事实，按本仓先例走 settingsBus）──
  const LS_KEY = 'worldaxis_travel_desk_settings_v1';
  const DEF = { enabled: false, maxRows: 24, maxPlanRows: 32,
    // ── v2.219.0（拓展 N5）：多站旅程与会合的两格参数 ──
    //   `maxLegs`：途经点段数上限（**不静默截断** —— 超限一律 `route-too-long`）；
    //   `meetWindowMs`：会合时窗的默认宽度（缺省一小时）。
    maxLegs: 6, meetWindowMs: 3600000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'travelDesk',
    bounds: { maxRows: [4, 48], maxPlanRows: [4, 64], maxLegs: [2, 12], meetWindowMs: [0, 86400000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // ── 编排层失败码（**fault 命名空间**，与来源的 reason 命名空间分列）──
  const FAULTS = ['desk-off', 'module-missing', 'bad-channel', 'unknown-action',
    'missing-fields', 'bad-plan', 'stale-plan', 'action-threw',
    // ── v2.219.0（拓展 N5）：多站旅程与会合新增四码（编排层 fault 命名空间，不是来源 reason）──
    //   `bad-route`（legs 不是可用的段表）、`route-too-long`（途经点超上限，**不静默截断**）、
    //   `broken-leg`（后段起点 ≠ 前段终点 —— 断链会让「走到哪了」答不出）、
    //   `bad-meet`（会合时窗声明不完整）。四码均带可执行见证（专锁 s3-b3-n5-v2219.js 真跑）。
    'bad-route', 'route-too-long', 'broken-leg', 'bad-meet'];
  const stat = { plans: 0, commits: 0, oks: 0, rejects: 0, stale: 0, faults: {}, blocked: 0, lastReason: '',
    // ── v2.219.0（拓展 N5）：多站旅程与会合各自成栏（「预览了几趟单程」与「排了几条多站路线」
    //   是两件事，合成一栏就再也答不出是哪一类在动）。──
    routes: 0, meets: 0 };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.blocked++; stat.lastReason = code; }
  function fail(code, extra) { noteFault(code); return Object.assign({ ok: false, fault: code }, extra || {}); }

  /** 通道白名单**跟随** `world.CHANNELS`（不自己抄一份 —— 抄了就是第二份真源）。 */
  function channels() {
    const w = WA.world;
    return (w && Array.isArray(w.CHANNELS)) ? w.CHANNELS.slice() : [];
  }

  // ── 既有读表（**唯一真源**：本模块不落第二份路线/行程状态）──
  function state() { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; }
  function worldNode() { const w = state().world; return (w && typeof w === 'object' && !Array.isArray(w)) ? w : {}; }
  function journeys() { const j = worldNode().journeys; return Array.isArray(j) ? j : []; }
  function worldShipments() { const s = worldNode().shipments; return Array.isArray(s) ? s : []; }
  function freightShipments() { const f = state().freight; return (f && Array.isArray(f.shipments)) ? f.shipments : []; }

  /**
   * 逐段现场读数：容量 / 占用 / 是否被投递封锁。
   * 三个读口各自 try 包住 —— 任一读不出来就报 `null`（**不拿 0 冒充「读不到」**：
   * `isFinite(null)` 为真，用 0 兜底会把「读不了」写成「容量不限」，本仓最贵的一类默认值）。
   */
  function segsOf(ch, path) {
    const w = WA.world;
    const out = [];
    const p = Array.isArray(path) ? path : [];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1];
      let sc = null, su = null, rb = null;
      try { sc = (typeof w.roadCapOf === 'function') ? num(Number(w.roadCapOf(a, b, ch))) : null; } catch (e) { sc = null; }
      try { su = (typeof w.roadUsage === 'function') ? num(Number(w.roadUsage(a, b, ch))) : null; } catch (e) { su = null; }
      try { rb = (typeof w.roadBlockOf === 'function') ? w.roadBlockOf(a, b) : null; } catch (e) { rb = null; }
      out.push({ from: String(a), to: String(b), cap: sc, use: su,
        crowded: (sc !== null && sc > 0 && su !== null && su >= sc),
        closed: !!(rb && rb.roadClosed), why: (rb && rb.why) || '' });
    }
    return out;
  }

  /**
   * 路况指纹（可复算、含时间无关字段）：比对「预览时的路况」与「执行时的路况」。
   * 耗时与折算**取自 `world.transit()` 的返回体**（本模块不自算）。
   *   为什么指纹里要带逐段占用：只有「可达/不可达」不够 —— 一条路可以一直可达，
   *   而**同时出发的第二个人**会被容量拒掉。少了这一段，`stale-plan` 就成了一条
   *   只在封路时才亮的灯（而封路本来就是每次调用都会重判的那一类）。
   */
  function stampFrom(tr, segs) {
    if (!tr || typeof tr !== 'object') return 'bad-shape';
    if (tr.ok !== true) return 'no:' + clean((tr.reason) || 'unknown', 40);
    const parts = ['ok', 'm' + String(tr.minutes), 'f' + String(tr.factor)];
    (segs || []).forEach(function (s) {
      parts.push(s.from + '>' + s.to + ':' + s.cap + '/' + s.use + (s.closed ? 'X' : ''));
    });
    return parts.join('|');
  }
  /**
   * 只读重验用的指纹：这里**必须**现取一次（要的就是「此刻」的路况）。
   *   ⚠ `plan()` **不走这里** —— 那口在成功时会累加它自己的通行计数（`S.transits[ch]++`），
   *   预览里再调一次等于**一次预览算两次通行**、污染上游读数。`plan()` 用同一次调用的
   *   结果经 `stampFrom()` 推导；两处因此共用同一段序列化（单一真源）。
   */
  function stampOf(ch, from, to) {
    const w = WA.world;
    if (!w || typeof w.transit !== 'function') return null;
    let tr = null;
    try { tr = w.transit(ch, from, to); } catch (e) { return 'threw'; }
    if (!tr || typeof tr !== 'object') return 'bad-shape';
    if (tr.ok !== true) return 'no:' + clean((tr.reason) || 'unknown', 40);
    return stampFrom(tr, segsOf(ch, tr.path));
  }

  /** 风险说明：**只汇总已量到的三面**，不编概率、不给建议。 */
  function riskOf(segs, tr) {
    const closed = segs.filter(function (s) { return s.closed === true; }).length;
    const crowd = segs.filter(function (s) { return s.crowded === true; }).length;
    const unknown = segs.filter(function (s) { return s.cap === null || s.use === null; }).length;
    const parts = [];
    if (closed) parts.push('投递封锁路段 ' + closed + ' 段');
    if (crowd) parts.push('已达容量上限 ' + crowd + ' 段');
    if (unknown) parts.push('容量读不到 ' + unknown + ' 段（如实报，不按 0 处理）');
    if (tr && isFinite(tr.factor) && tr.factor < 1) parts.push('天气把耗时折到 ' + tr.factor + ' 倍');
    return { closedSegs: closed, crowdedSegs: crowd, unknownSegs: unknown,
      factor: (tr && isFinite(tr.factor)) ? tr.factor : null,
      note: parts.length ? parts.join('；') : '逐段无封路、无拥挤，天气未改耗时' };
  }

  /** 货面子面：库存与路线**只从既有读口取**（本模块不扣不动 —— 扣减发生在 dispatch 里）。 */
  function goodsHint(o) {
    const E = WA.economy;
    const out = { routeId: null, route: null, stock: null, have: null,
      note: '库存与路线取自 economy 既有读口；本模块不扣减、不改价' };
    const rid = clean(o.routeId, 60);
    if (rid) {
      out.routeId = rid;
      if (E && typeof E.routeView === 'function') { try { out.route = E.routeView(rid) || null; } catch (e) { out.route = null; } }
    }
    const res = clean(o.resource, 40), src = clean(o.from, 40);
    if (res && src && E && typeof E.stock === 'function') {
      try {
        const sv = E.stock(src, res);
        out.stock = (sv && typeof sv === 'object') ? Object.assign({}, sv) : sv;
        out.have = num(Number((sv && typeof sv === 'object') ? sv.stock : sv));
      } catch (e) { out.stock = null; }
    }
    return out;
  }

  /**
   * ① 预览：起终点 × 通道的单一预览体。
   * 耗时 / 折算 / 实走 / 路径 / 天气**逐字段取自 `world.transit()`** —— 本模块不重算，
   * 故「界面预估」与「真引擎」结构上不可能分家（没有第二份算法可分家）。
   *   ⚠ 如实登记一处**上游副作用**：`world.transit()` 成功会累加它自己的 `S.transits`、
   *   失败会 `S.blocked++`。预览调它一次就是一次真判定 —— 这正是「预估与真引擎同源」
   *   的代价面，代之以自算距离会更坏（那才是本仓最贵的一类默认值）。
   */
  function plan(opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('desk-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const w = WA.world;
    if (!w || typeof w.transit !== 'function') return fail('module-missing', { module: 'world' });
    const chs = channels();
    const ch = clean(o.channel, 20) || 'person';
    if (chs.indexOf(ch) < 0) return fail('bad-channel', { channel: ch, known: chs });
    const from = clean(o.from, 40), to = clean(o.to, 40);
    if (!from || !to) return fail('missing-fields', { need: ['from', 'to'] });
    let tr = null;
    try { tr = w.transit(ch, from, to); } catch (e) { return fail('action-threw', { at: 'world.transit' }); }
    if (!tr || typeof tr !== 'object') return fail('bad-plan', { at: 'world.transit' });
    if (tr.ok !== true) {
      // **可达性拒绝不是编排层失败**：它是世界给的答案（走不过去），原样带出来。
      stat.rejects++; stat.lastReason = 'plan-blocked';
      return { ok: false, fault: null, planId: null, channel: ch, from: from, to: to,
        reachable: false, reason: tr.reason, detail: tr,
        note: '世界给的答案：这一趟走不过去（本模块不自造距离、不按直线兜底）' };
    }
    const pathAll = Array.isArray(tr.path) ? tr.path.slice() : [];
    const allSegs = segsOf(ch, pathAll);
    const rows = Math.max(1, Math.floor(num(cfg.maxPlanRows) || DEF.maxPlanRows));
    const segs = allSegs.slice(0, rows);
    stat.plans++; stat.lastReason = 'plan-ok';
    return {
      ok: true, fault: null,
      planId: 'tp_' + ch + '_' + from + '_' + to,
      channel: ch, from: from, to: to,
      reachable: true,
      minutes: num(tr.minutes), factor: num(tr.factor), factored: num(tr.factored),
      hops: num(tr.hops), path: pathAll, pathCount: pathAll.length,
      truncated: allSegs.length > segs.length,
      segs: segs,
      weather: tr.weather ? Object.assign({}, tr.weather) : null,
      weatherReason: tr.weatherReason || null,
      risk: riskOf(segs, tr),
      goods: ch === 'goods' ? goodsHint(o) : null,
      // 指纹按**全路径**算（即便显示面被截断），否则与 verify 的指纹不同源
      stamp: stampFrom(tr, allSegs),
      basisNote: '耗时 / 折算 / 实走 / 路径 / 天气逐字段取自 WA.world.transit() —— 本模块不重算，故预估与真引擎同源'
    };
  }
  /**
   * ①b 多站旅程（v2.219.0 拓展 N5）：把「单次起终点」扩成**途经点 / 停留 / 同行 / 货运关联**。
   *
   * ── 它治什么（缺口）────────────────────────────────────────────
   *   `plan()` 只会回答「从 A 到 B 这一趟」。而玩家真正要问的是「先到 B 停半天、
   *   再走 C、最后落 D，这一路要几天、经过哪几段、路上堵不堵」——旧口答不了，
   *   于是消费方只能自己把 `plan()` 调 N 次再手工接时刻，接出来的时间轴必然与
   *   真引擎分家（本仓反复治过的那一类）。
   *
   * ── 口径（与 `plan()` 同源，**一段都不重算**）────────────────────
   *   · 段表两种输入：`stops:['A','B','C']`（相邻成段）或 `legs:[{from,to},…]`（显式段，
   *     必须**首尾相接** —— 后段起点 ≠ 前段终点一律 `broken-leg`，断链会让「走到哪了」答不出）；
   *   · 每段的耗时 / 折算 / 实走 / 路径 / 天气**逐字段取自 `world.transit()`**；
   *   · 时间轴：`departAt` / `arriveAt` 逐段累加，中间按 `dwell` 加停留；
   *   · `with`（同行）/ `routeId`（货运关联）**只登记在返回体里**，本模块不扣不动；
   *   · 上界 `maxLegs`：超限 `route-too-long`（**不静默截断**）。
   *
   * ── 边界（承接模块头，逐条不破）────────────────────────────────
   *   · 只读：全文零 `store.transact`、零 draft 赋值（与 `plan` / `verify` / `ledger` 同规）；
   *   · 到点前不提前抵达：本函数**不落行程** —— 真正的出发仍是逐段 `commit('depart', …)`，
   *     每段出发前用该段回带的 `stamp` 走 `verify()` 重验（世界变了旧预览即作废）。
   *     **本模块不存「走到第几段了」**：那会造出第二份状态容器（边界 1）。
   */
  function normLegs(o, cap) {
    const rawStops = Array.isArray(o.stops) ? o.stops : null;
    const rawLegs = Array.isArray(o.legs) ? o.legs : null;
    if (!rawStops && !rawLegs) return { ok: false, fault: 'bad-route', need: ['stops', 'legs'] };
    const legs = [];
    if (rawLegs) {
      for (let i = 0; i < rawLegs.length; i++) {
        const r = rawLegs[i];
        if (!r || typeof r !== 'object') return { ok: false, fault: 'bad-route', at: i };
        const f = clean(r.from, 40), t = clean(r.to, 40);
        if (!f || !t) return { ok: false, fault: 'bad-route', at: i, need: ['from', 'to'] };
        legs.push({ from: f, to: t });
      }
    } else {
      const stops = rawStops.map(function (s) { return clean(s, 40); });
      if (stops.length < 2 || stops.some(function (s) { return !s; })) return { ok: false, fault: 'bad-route', need: ['stops>=2'] };
      for (let i = 0; i + 1 < stops.length; i++) legs.push({ from: stops[i], to: stops[i + 1] });
    }
    if (!legs.length) return { ok: false, fault: 'bad-route' };
    if (legs.length > cap) return { ok: false, fault: 'route-too-long', want: legs.length, cap: cap };
    for (let i = 1; i < legs.length; i++) {
      if (legs[i].from !== legs[i - 1].to) {
        return { ok: false, fault: 'broken-leg', at: i, from: legs[i].from, want: legs[i - 1].to };
      }
    }
    return { ok: true, legs: legs };
  }
  function dwellOf(o, n) {
    // n = 中间停留点数（= 段数 - 1）。dwell 可以是数组（逐点）或单个数（全点同值）；缺省 0。
    const out = [];
    const raw = o.dwell;
    for (let i = 0; i < n; i++) {
      let v = 0;
      if (Array.isArray(raw)) v = num(raw[i]);
      else if (raw !== undefined && raw !== null) v = num(raw);
      out.push(isFinite(v) && v > 0 ? Math.round(v) : 0);
    }
    return out;
  }
  function route(opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('desk-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const w = WA.world;
    if (!w || typeof w.transit !== 'function') return fail('module-missing', { module: 'world' });
    const chs = channels();
    const ch = clean(o.channel, 20) || 'person';
    if (chs.indexOf(ch) < 0) return fail('bad-channel', { channel: ch, known: chs });
    const nl = normLegs(o, Math.max(1, Math.floor(num(cfg.maxLegs) || DEF.maxLegs)));
    // 拒收时把「实际起点 / 该接哪」一并带出：只报「第几段断了」而不说断在哪，调用方还得自己回读段表。
    if (!nl.ok) return fail(nl.fault, { at: nl.at, from: nl.from, need: nl.need, want: nl.want, cap: nl.cap });
    const legs = nl.legs;
    const dwell = dwellOf(o, legs.length - 1);
    const rows = Math.max(1, Math.floor(num(cfg.maxPlanRows) || DEF.maxPlanRows));
    const at0 = isFinite(Number(o.at)) ? Number(o.at) : clockNow('travelDesk.route');
    let cursor = at0, total = 0, allOk = true;
    const out = [];
    for (let i = 0; i < legs.length; i++) {
      const lg = legs[i];
      let tr = null;
      try { tr = w.transit(ch, lg.from, lg.to); } catch (e) { return fail('action-threw', { at: 'world.transit' }); }
      const row = { index: i, from: lg.from, to: lg.to, departAt: cursor };
      if (!tr || typeof tr !== 'object') { row.reachable = false; row.reason = 'bad-shape'; allOk = false; }
      else if (tr.ok !== true) { row.reachable = false; row.reason = tr.reason; row.detail = tr; allOk = false; }
      else {
        const pathAll = Array.isArray(tr.path) ? tr.path.slice() : [];
        const allSegs = segsOf(ch, pathAll);
        row.reachable = true;
        row.minutes = num(tr.minutes); row.factor = num(tr.factor); row.factored = num(tr.factored);
        row.hops = num(tr.hops); row.path = pathAll; row.pathCount = pathAll.length;
        row.segs = allSegs.slice(0, rows); row.truncated = allSegs.length > row.segs.length;
        row.risk = riskOf(row.segs, tr);
        row.stamp = stampFrom(tr, allSegs);
        const mins = isFinite(tr.factored) ? Number(tr.factored) : (isFinite(tr.minutes) ? Number(tr.minutes) : 0);
        row.arriveAt = cursor + mins * 60000;
        cursor = row.arriveAt;
        total += mins;
      }
      out.push(row);
      if (i < legs.length - 1) { cursor += dwell[i] || 0; out[i].stayMs = dwell[i] || 0; }
    }
    stat.routes++;
    stat.lastReason = allOk ? 'route-ok' : 'route-partial';
    const stops = [legs[0].from].concat(legs.map(function (l) { return l.to; }));
    return {
      ok: true, fault: null, channel: ch,
      routeId: 'tr_' + ch + '_' + legs.length + '_' + legs[0].from + '_' + legs[legs.length - 1].to,
      stops: stops, stopsCount: stops.length, legs: out, legCount: out.length,
      allReachable: allOk, minutes: allOk ? total : null,
      departAt: at0, arriveAt: cursor,
      stamps: out.map(function (r) { return r.stamp || null; }),
      companions: (Array.isArray(o.with) ? o.with : []).map(function (x) { return clean(x, 60); }).filter(function (x) { return !!x; }),
      freight: ch === 'goods' ? goodsHint(o) : null,
      basisNote: '逐段耗时 / 折算 / 路径 / 天气取自 WA.world.transit() —— 本模块不重算；'
        + '本函数不落行程，出发仍逐段 commit(\'depart\')，每段用回带的 stamp 走 verify() 重验',
      driveNote: '多站按段驱动：本模块不存「走到第几段」；上段到达后再对下段重验并 commit'
    };
  }
  /**
   * ①c 会合时窗（v2.219.0 拓展 N5）：多方**各自从现地出发**，能否在同一地点、
   *   同一时窗内碰上面。
   *
   * ── 口径 ────────────────────────────────────────────────────
   *   · 每方给 `{person, from, at}`：`from` 缺省 = 已在会合地（到达时刻即 `at`）；
   *     `from` 在时，到达时刻 = `at` + 该方从 from 到 place 的**实走**耗时（取自 transit）；
   *   · 时窗两种给法：`window:[start,end]`（显式）或 `windowMs`（宽度，缺省 settings）；
   *   · `canMeet` = 最晚到达 ≤ 时窗末端（人人都在窗口内到得了）；`slackMs` = 末端 − 最晚到达；
   *   · 走不过去的一方 ⇒ 该方 `reachable:false` 且 `canMeet:false`（**不假装能到**）。
   *   · 只读：零 store 写；不改任何人的位置。
   */
  function meet(opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('desk-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const w = WA.world;
    if (!w || typeof w.transit !== 'function') return fail('module-missing', { module: 'world' });
    const place = clean(o.place, 40);
    if (!place) return fail('bad-meet', { need: ['place'] });
    const parties = Array.isArray(o.parties) ? o.parties : null;
    if (!parties || parties.length < 2) return fail('bad-meet', { need: ['parties>=2'] });
    const chs = channels();
    const ch = clean(o.channel, 20) || 'person';
    if (chs.indexOf(ch) < 0) return fail('bad-channel', { channel: ch, known: chs });
    const now = clockNow('travelDesk.meet');
    const rows = [], unreadable = [];
    let latest = null, earliest = null, allReach = true;
    for (let i = 0; i < parties.length; i++) {
      const p = parties[i];
      if (!p || typeof p !== 'object') return fail('bad-meet', { at: i, need: ['person'] });
      const who = clean(p.person, 60);
      if (!who) return fail('bad-meet', { at: i, need: ['person'] });
      const from = clean(p.from, 40);
      const at = isFinite(Number(p.at)) ? Number(p.at) : now;
      const row = { person: who, from: from || place, at: at, reachable: true };
      if (from && from !== place) {
        let tr = null;
        try { tr = w.transit(ch, from, place); } catch (e) { return fail('action-threw', { at: 'world.transit' }); }
        if (!tr || typeof tr !== 'object' || tr.ok !== true) {
          row.reachable = false; row.reason = (tr && tr.reason) || 'bad-shape';
          row.why = row.reason;   // 面板侧读 `why`（与 ledger 的 unreadable 同字段名），引擎侧仍叫 `reason`。
          allReach = false; unreadable.push({ person: who, why: row.reason });
        } else {
          const mins = isFinite(tr.factored) ? Number(tr.factored) : (isFinite(tr.minutes) ? Number(tr.minutes) : 0);
          row.minutes = mins; row.arrival = at + mins * 60000;
          row.stamp = stampFrom(tr, segsOf(ch, Array.isArray(tr.path) ? tr.path : []));
        }
      } else {
        row.minutes = 0; row.arrival = at;
      }
      if (row.arrival !== undefined && (latest === null || row.arrival > latest)) latest = row.arrival;
      if (earliest === null || at < earliest) earliest = at;
      rows.push(row);
    }
    let win = null;
    if (Array.isArray(o.window) && isFinite(Number(o.window[0])) && isFinite(Number(o.window[1]))) {
      win = { start: Number(o.window[0]), end: Number(o.window[1]) };
    } else {
      // 缺省时窗**锚在各方的约集时刻**（最早的 `at`），不是锚在最晚到达 ——
      //   锚在后者会让 `canMeet` 恒真（窗口末端 = 最晚到达 + 宽度在任何输入下都成立，
      //   判据就成了空转）。锚在约集时刻才是玩家要问的那句话：「按约好的时间出发，
      //   宽限这么久之内，人人到得齐吗」。任一方没给 `at` 时退回此刻。
      const width = Math.max(0, Math.floor(num(o.windowMs) || cfg.meetWindowMs || DEF.meetWindowMs));
      const base = (earliest === null) ? now : earliest;
      win = { start: base, end: base + width };
    }
    const canMeet = allReach && latest !== null && latest <= win.end;
    stat.meets++;
    stat.lastReason = canMeet ? 'meet-ok' : 'meet-no';
    return {
      ok: true, fault: null, channel: ch, place: place,
      parties: rows, window: win,
      latestArrival: latest,
      canMeet: canMeet, slackMs: (latest === null ? null : win.end - latest),
      unreadable: unreadable,
      note: '每方到达时刻 = 其 at + 从 from 到会合地的实走耗时（取自 world.transit）；'
        + '本函数只判不落，不改任何人的位置；走不过去的一方 reachable:false，不假装能到'
    };
  }
  /**
   * ② 动作表：**编排信息，不是判定语义**。
   *   `take` 的顺序即形参顺序；缺键时**原样传 `undefined`**（由来源写口自己拒收 —— 边界 3）。
   *   `stamp: true` 的两条是**带路线语义**的动作：出发与改道都要重验路况。
   */
  const ACTIONS = {
    depart: { ns: 'world', fn: 'depart', take: ['person', 'from', 'to', 'at'], stamp: true },
    stop: { ns: 'world', fn: 'stop', take: ['person', 'at', 'why'], stamp: false },
    dispatch: { ns: 'freight', fn: 'dispatch', take: ['routeId', 'from', 'resource', 'qty', 'opts'], stamp: false },
    reroute: { ns: 'freight', fn: 'reroute', take: ['shipmentId', 'newRouteId', 'opts'], stamp: true },
    cancel: { ns: 'freight', fn: 'cancel', take: ['shipmentId', 'opts'], stamp: false },
    arrive: { ns: 'freight', fn: 'arrive', take: ['shipmentId', 'opts'], stamp: false }
  };

  /** 透传 opts，但**剥掉 `force`** —— 到点判定归源引擎的时钟（边界 4）。 */
  function safeOpts(o) {
    const out = {};
    if (!o || typeof o !== 'object') return out;
    Object.keys(o).forEach(function (k) {
      if (k === 'force') return;
      out[k] = o[k];
    });
    return out;
  }

  /** ④ 只读重验口（`commit` 复用它 —— 「预览作废」只有一份判据）。 */
  function verify(ctx) {
    const cfg = settings();
    if (!cfg.enabled) return fail('desk-off');
    const o = (ctx && typeof ctx === 'object') ? ctx : {};
    const ch = clean(o.channel, 20) || 'person';
    const from = clean(o.from, 40), to = clean(o.to, 40);
    if (!from || !to) return fail('missing-fields', { need: ['from', 'to'] });
    const now = stampOf(ch, from, to);
    const had = (o.stamp === undefined || o.stamp === null || o.stamp === '') ? null : String(o.stamp);
    return { ok: true, fault: null, channel: ch, from: from, to: to,
      had: had, now: now, same: (had === null) ? null : (had === now),
      note: had === null ? '没回带 stamp（只读重验：不判作废，也不假装验过）'
                         : (had === now ? '与本刻路况逐字一致' : '路况已变 —— 旧预览作废') };
  }

  /**
   * ② 执行：把动作**原样透传**给来源写口。
   *   先验后调（`stamp` 类动作）；来源拒收**原样透传**（保住它自己的 reason 与参数）；
   *   编排层失败才走 `fault`。
   */
  function commit(action, ctx) {
    const cfg = settings();
    if (!cfg.enabled) return fail('desk-off');
    const a = clean(action, 30);
    const spec = ACTIONS[a];
    if (!spec) return fail('unknown-action', { action: a, known: Object.keys(ACTIONS) });
    const o = (ctx && typeof ctx === 'object') ? ctx : {};
    const mod = WA[spec.ns];
    if (!mod || typeof mod[spec.fn] !== 'function') return fail('module-missing', { module: spec.ns, fn: spec.fn });
    // 「路况变化后旧方案重新验证」：不符即拒，且**不调**来源写口（半个动作都不留）
    if (spec.stamp && o.stamp) {
      const ch = clean(o.channel, 20) || 'person';
      const from = clean(o.from, 40), to = clean(o.to, 40);
      if (from && to) {
        const v = verify({ channel: ch, from: from, to: to, stamp: o.stamp });
        if (v.ok && v.same === false) {
          stat.rejects++; stat.stale++; stat.lastReason = 'stale-plan';
          return { ok: false, fault: 'stale-plan', action: a, channel: ch, from: from, to: to,
            was: String(v.had), now: String(v.now),
            note: '路况或占用已变 —— 旧预览作废，请重新预览后再发起（本模块不存预览，比对用的是你回带的 stamp）' };
        }
      }
    }
    const args = spec.take.map(function (k) { return (k === 'opts') ? safeOpts(o.opts) : o[k]; });
    let raw = null;
    try { raw = mod[spec.fn].apply(mod, args); }
    catch (e) { return fail('action-threw', { action: a, at: spec.ns + '.' + spec.fn }); }
    stat.commits++;
    if (raw && raw.ok === true) { stat.oks++; stat.lastReason = 'commit-ok'; }
    else if (raw && raw.ok === false) { stat.rejects++; stat.lastReason = 'commit-rejected'; }
    return Object.assign({ ok: !!(raw && raw.ok), fault: null, action: a, via: spec.ns + '.' + spec.fn }, raw || {});
  }

  /**
   * ③ 在途三面：**每行报名自己的真源容器**（四处不合并 —— 合并就是把四件事说成一件）。
   *   「读不到」与「真的没有」是两个读数：读口抛错时 `ok` 仍真，但那一面**单列** `unreadable`。
   */
  function ledger(opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('desk-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const rows = [];
    const unreadable = [];
    const faceFilter = clean(o.face, 20);

    journeys().forEach(function (j) {
      if (!j || j.status !== 'in-transit') return;
      rows.push({ face: 'person', source: 'world.journeys', ref: clean(j.id, 60),
        who: clean(j.person, 60), from: clean(j.from, 40), to: clean(j.to, 40),
        left: num(j.left), total: num(j.total), eta: num(j.arriveAt),
        status: clean(j.status, 20), path: Array.isArray(j.path) ? j.path.slice() : [] });
    });
    // 货物面：两处台账各自报名（freight 的在途 vs world 自己的货物面）——不合成一行
    freightShipments().forEach(function (s) {
      if (!s || s.status !== 'transit') return;
      rows.push({ face: 'goods', source: 'world.freight.shipments', ref: clean(s.id, 60),
        who: '', from: clean(s.from, 40), to: clean(s.to, 40),
        resource: clean(s.resource, 40), qty: num(s.qty), left: null, total: null,
        eta: num(s.eta), status: clean(s.status, 20), routeId: clean(s.routeId, 60), path: [] });
    });
    worldShipments().forEach(function (s) {
      if (!s || s.status !== 'in-transit') return;
      rows.push({ face: 'goods', source: 'world.shipments', ref: clean(s.id, 60),
        who: '', from: clean(s.from, 40), to: clean(s.to, 40),
        resource: clean(s.resource, 40), qty: num(s.qty), left: null, total: null,
        eta: num(s.arriveAt), status: clean(s.status, 20), routeId: '', path: [] });
    });
    // 消息面：唯一有公开读口的通道
    const w = WA.world;
    if (w && typeof w.messagesInTransit === 'function') {
      try {
        (w.messagesInTransit() || []).forEach(function (m) {
          if (!m) return;
          rows.push({ face: 'message', source: 'world.messages', ref: clean(m.id, 60),
            who: '', from: clean(m.from, 40), to: clean(m.to, 40),
            left: null, total: null, eta: num(m.arriveAt), status: clean(m.status, 20),
            routeId: '', path: [] });
        });
      } catch (e) { unreadable.push({ face: 'message', why: 'source-threw' }); }
    } else {
      unreadable.push({ face: 'message', why: 'module-missing' });
    }
    const kept = faceFilter ? rows.filter(function (r) { return r.face === faceFilter; }) : rows;
    const limit = Math.max(1, Math.floor(num(cfg.maxRows) || DEF.maxRows));
    const cap = kept.length > limit;
    stat.lastReason = 'ledger-ok';
    return { ok: true, fault: null, rows: cap ? kept.slice(0, limit) : kept,
      count: cap ? limit : kept.length, total: kept.length, truncated: cap,
      faces: ['person', 'goods', 'message'], unreadable: unreadable,
      note: '每行报名自己的真源容器（四处不合并）；关联任务面在待办中心，本模块不复制一份' };
  }

  function diagnose() {
    const w = WA.world, F = WA.freight;
    const declared = Object.keys(ACTIONS);
    const live = declared.filter(function (k) {
      const s = ACTIONS[k]; const m = WA[s.ns];
      return !!(m && typeof m[s.fn] === 'function');
    });
    const checks = {
      settingsBus: !!WA.settingsBus,
      world: !!(w && typeof w.transit === 'function' && typeof w.depart === 'function'),
      freight: !!(F && typeof F.dispatch === 'function'),
      actionsDeclared: declared.length,
      actionsLive: live.length
    };
    // `ok` 必须**可红**：摘掉 world 或让动作表与现场分家 ⇒ 当场 false
    const ok = checks.settingsBus && checks.world && checks.actionsLive === checks.actionsDeclared;
    return { ok: ok, module: 'travelDesk', ver: VERSION, cfg: settings(), checks: checks,
      actions: { declared: declared.slice(), live: live,
        missing: declared.filter(function (k) { return live.indexOf(k) < 0; }) },
      faultCodes: FAULTS.slice() };
  }

  WA.travelDesk = {
    FAULTS: FAULTS.slice(),
    ACTIONS: Object.keys(ACTIONS),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    plan: plan,
    // ── v2.219.0（拓展 N5）：多站旅程与会合两口 ──
    route: route,
    meet: meet,
    verify: verify,
    commit: commit,
    ledger: ledger,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/travel-desk.js', { kind: 'engine', ver: VERSION });
})();