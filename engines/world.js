/**
 * WorldAxis engines/world.js (v2.65.0)
 * 世界织体：社会生活（共同日程 / 聚散）与时空约束（地点、路途、「同一时刻只能在一处」）。
 *
 * 为什么单独成模块，而不并进 life.js / calendar.js：
 *   life.js 管的是**一个人的**目标、承诺与日程（个体动机面）；
 *   calendar.js 管的是**世界钟怎么走**（时间标尺面）；
 *   本模块管的是**人之间的时空关系**——谁和谁在同一个地方、从这里到那里要多久、
 *   这一场集市点到场的人到底能不能到。「生活」与「共同生活」是两件事：
 *   把它们并起来，最直接的后果是「有人有事要做」与「有人真的到了场」在状态里长得一样。
 *
 * 设计边界（**全是否定式**——这五条正是本模块存在的全部理由）：
 *   1 总开关默认关闭。关闭时不推演、不注入、不改变任何人的位置。
 *   2 地点必须**先被登记**：没登记的地点不是「大概就在附近」，而是**不可达**（不得猜）。
 *      「随手编一个近处」是本仓库最贵的一类默认值——世界会因为一句话长出一条不存在的街。
 *   3 路途必须有据：两地之间没有登记的道路，就是**走不过去**（不得按直线距离编一条路）。
 *   4 同一人物在同一时刻只能出现在一处：冲突必须**被拒绝并归因**，不得静默覆盖先前安排。
 *      「后来的悄悄赢过先前的」会让用户永远不知道自己的安排被改掉了。
 *   5 共同日程不得被读成「所有人都在场」：在场者只来自**证据**（人物自己的日程安排），
 *      不得由「办了一场集市」推出「全城人都到了」。
 *   ── v2.85.0 追加（B2 地域与交通深化，全是否定式）──
 *   6 地域层级只说明**归属**，不说明可达：A∈B 不得被读成「A 走得到 B」（第 3 条的复发）。
 *     父级须先登记（unknown-parent）、不得自指（self-parent）、不得成环（parent-cycle）；
 *     已有归属不得被冲突改写（parent-locked），补全缺失归属则只许一次。
 *   7 路走得通 ≠ 现在走得动：路段容量满时**拒收并归因**（road-crowded），且拒收发生在落盘之前。
 *   ── v2.117.0 追加（B2 前半：场所用途窗口 + 行程结算与中止，全是否定式）──
 *   8 窗口不只要「此刻开着」，还要**容得下这件事**：needMs（路上时间 + 这件事的时长）装不下
 *     就是装不下（window-too-short 并回报还差多少）——不得让「快关门了才开始一场两小时的会」通过。
 *   9 中止在途行程**不猜位置**：既不停在出发地、也不假装到达，`place` 一律为 null，
 *     已消耗与未执行分别落账。「把人物退回出发状态」会把一段真走过的路抹成没发生。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_world_settings_v1';
  const DEF = { enabled: false, maxPlaces: 8, maxEvents: 4, maxItems: 3, maxJourneys: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'world',
    bounds: { maxPlaces: [1, 24], maxEvents: [1, 12], maxItems: [1, 6] } };
  const PLACE_KINDS = ['home', 'work', 'market', 'public', 'wild', 'sacred'];
  const EVENT_KINDS = ['market', 'festival', 'court', 'rite', 'meeting'];
  // v2.117.0（B2 前半）：场所用途。**同一间屋子按用途分窗口** ——「商店营业 9-18」与
  //   「办公室值班 18-24」是两件事，合并成一个开闭就再也答不出「现在能不能去寄信」。
  //   用途标签是**封闭集合**：不在表里的用途拒收（bad-use）——自由文本用途会让
  //   「哪个用途的窗口管这一件事」永远没有答案。
  const USE_KINDS = ['business', 'duty', 'class', 'visit', 'meeting', 'custom'];
  // v2.93.0（X4）：通行三层。"人可到"与"物可到"与"消息可到"是三件事——
  //   合并成一个 reachable 就再也答不出「人过不去但信能过去」。
  //   通道语义：person 需道路（weather 封锁即不可）；goods 需承运（比 person 怕封路）；
  //   message 走消息面（不受封路影响，但受「完全静默」级别的封锁影响）。
  const CHANNELS = ['person', 'goods', 'message'];
  /**
   * v2.117.0（B2 后半）：**封锁是一等公民，不只有天气一种来源**。
   *   B2 原文：「天气、灾害和组织封锁向现有 world 通行层投递受影响的路段/窗口，
   *   先更新实际可达性再决定行动」。旧实现只有 `weather.effect(place)` 一条间接路径 ——
   *   灾害（hazard）与组织封锁没有任何投递入口，于是「这条路被部队封了」只能借天气编出来。
   *   投递项按**地点**生效、带 `until` 定时效：过了那个时刻自动失效，不需要谁来删。
   */
  const BLOCK_SOURCES = ['weather', 'hazard', 'org'];
  // 道路通行的三个方向之一：`road` 表示「这条路本身断了」（既不是人也不是货的问题）。
  const ROAD_CHANNELS = ['person', 'goods', 'message', 'road'];
  // 封锁等级：天气 → 该地通道是否尚可通行。**只由已登记的天气决定，不猜**。
  //   storm/snow 封路（person/goods 不可，message 可）；heat/fog 不封路（只减速）。
  const BLOCK_LEVEL = { storm: { person: false, goods: false, message: true },
    snow: { person: false, goods: false, message: true },
    heat: { person: true, goods: true, message: true },
    fog: { person: true, goods: true, message: true },
    rain: { person: true, goods: true, message: true },
    clear: { person: true, goods: true, message: true } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { places: 0, roads: 0, events: 0, moves: 0, checks: 0, blocked: 0, lastReason: '', faults: {},
    departed: 0, arrived: 0, advanced: 0, halted: 0, uses: 0,
    // v2.93.0（X4）：三层通行的成功计数，逐层分列（合并就答不出哪层在用）。
    transits: { person: 0, goods: 0, message: 0 },
    // 被（天气/灾害/组织）封住的次数（逐层分列）——「没过去」与「过去了」是两件事。
    blocks: { person: 0, goods: 0, message: 0 },
    // v2.117.0（B2 后半）：投递面与货运面的计数。合并成「通行 OK」就再也答不出
    //   「是没人投递」还是「投了但没拦下」。
    posted: 0, lifted: 0, goods: 0, messages: 0, waited: 0,
    byChannel: { person: 0, goods: 0, message: 0 } };

  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  // ── 执行上下文取值口（v2.118.0 · B7）────────────────────────────────
  //   世界是**共享**对象：action 写「人已出发」、通行判「路封没封」、注入读「谁在哪」，
  //   都落在同一个上下文里。故本模块与 engines/act.js 走**同一份栈**（core/exec.js），
  //   不各自维护一份 —— 两份上下文必然漂移，而漂移的形态是「试演里人已经在路上，
  //   世界却说他还在出发地」。
  //   降级可见：`core/exec.js` 缺席时一律按真世界执行（与 v2.117.0 逐字一致）。
  function storeOf() {
    const e = (WA.exec && typeof WA.exec.storeOf === 'function') ? WA.exec : null;
    return e ? e.storeOf(WA.store) : WA.store;
  }
  function mutate(facade, fn, opt) {
    const e = (WA.exec && typeof WA.exec.mutate === 'function') ? WA.exec : null;
    if (!e) return (facade && typeof facade.transact === 'function')
      ? facade.transact(fn, opt) : { ok: false, reason: 'store-absent' };
    return e.mutate(facade, fn, opt);
  }
  function statOf() {
    const e = (WA.exec && typeof WA.exec.statBag === 'function') ? WA.exec : null;
    return e ? e.statBag(stat) : stat;
  }
  // 计数器门面 S：字段与 stat 同源（defineProperty 生成 ⇒ 将来添字段自动跟上），
  //   getter/setter 双向转发，`S.x++` 这类既有写法逐字不改。
  const S = (function () {
    const f = {};
    Object.keys(stat).forEach(function (k) {
      Object.defineProperty(f, k, { enumerable: true,
        get: function () { return statOf()[k]; },
        set: function (v) { statOf()[k] = v; } });
    });
    return f;
  })();
  // v2.118.0（B7）：读经显式执行上下文 —— 试演期读的是隔离副本，不是真世界。
  function state() { const st = storeOf(); return st && st.get ? (st.get() || {}) : {}; }
  function node() { const w = state().world; return (w && typeof w === 'object' && !Array.isArray(w)) ? w : {}; }
  function places() { return Array.isArray(node().places) ? node().places : []; }
  function roads() { return Array.isArray(node().roads) ? node().roads : []; }
  function events() { return Array.isArray(node().events) ? node().events : []; }
  function journeys() { return Array.isArray(node().journeys) ? node().journeys : []; }
  function placeByName(nm) { const k = clean(nm, 40); return places().filter(function (x) { return x && x.name === k; })[0] || null; }
  function personLife(name) {
    const p = (state().people || {})['p_' + clean(name, 60)];
    const life = p && p.life;
    return (life && typeof life === 'object' && !Array.isArray(life)) ? life : null;
  }

  /** 登记地点。同名不重复登记（返回既有行），非法类型拒收。 */
  function addPlace(item) {
    const name = clean(item && item.name, 40);
    if (!name) return { ok: false, reason: 'missing-name' };
    const kind = clean(item && item.kind, 12);
    if (kind && PLACE_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: PLACE_KINDS.slice() };
    // v2.85.0 地域层级（B2）。父级**必须先登记**：没登记的「属于某地」不是「大概同城」，而是拒收。
    //   全部分支都判在写事务**之前**（只读）——拒收分支不进事务，
    //   「拒收却推进 rev / 半条记录落盘」就没有立足点（v2.79.0 立的规矩）。
    const parent = clean(item && item.parent, 40);
    if (parent) {
      if (parent === name) return { ok: false, reason: 'self-parent', name: name };
      if (!placeByName(parent)) return { ok: false, reason: 'unknown-parent', parent: parent };
      // 已有归属不得被**冲突改写**（x→y 拒收并写明现有归属）。
      //   「无 → 有」是补全缺失事实，不是改写已登记事实 —— 允许，且只允许一次（补后即锁）。
      //   若把补全也拒掉，一次误登记就永久锁死；本仓库禁的是「静默改写」，不是「不得改写」。
      const ex0 = placeByName(name);
      const cur0 = ex0 ? clean(ex0.parent, 40) : '';
      if (cur0 && parent !== cur0) return { ok: false, reason: 'parent-locked', name: name, parent: cur0 };
    }
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.places = Array.isArray(draft.world.places) ? draft.world.places : [];
      const hit = draft.world.places.filter(function (x) { return x && x.name === name; })[0];
      if (hit) {
        const cur = clean(hit.parent, 40);
        // 复核（正常路径已在事务外挡下）：不一致即**透明中止**，不留半条记录。
        if (parent && cur && parent !== cur) return false;
        if (parent && !cur) {
          // 环检测必须落在这里：只有**补全**这一瞬才可能出现 A∈B、B∈A
          //   （事务前读的是补全前的旧图，判它等于写一段永不触发的代码）。
          let c = parent, guard = 0, loop = false;
          while (c && guard++ < 64) {
            if (c === name) { loop = true; break; }
            const u = placeByName(c);
            c = u ? clean(u.parent, 40) : '';
          }
          if (loop) { out = { ok: false, reason: 'parent-cycle', name: name, parent: parent }; return false; }
          hit.parent = parent;
        }
        out = { ok: true, id: hit.id, name: name, existed: true, parent: clean(hit.parent, 40) }; return;
      }
      const row = { id: 'pl_' + name, name: name, kind: kind || 'public', parent: parent,
        open: isFinite(Number(item && item.open)) ? Number(item.open) : 0,
        close: isFinite(Number(item && item.close)) ? Number(item.close) : 0,
        // v2.117.0：按用途细分的窗口（空数组 = 该地点不按用途细分，仍按上面的开闭判）。
        uses: [],
        at: clockNow('world') };
      draft.world.places.push(row);
      // 剪枝走挤出侧单一出口（站点 world.places 已登记）——不自行 slice。
      WA.evict.array(draft.world.places, 'world.places');
      out = { ok: true, id: row.id, name: name, existed: false };
    }, 'world:add-place');
    if (out && out.ok) { if (!out.existed) S.places++; S.lastReason = out.existed ? 'existed' : 'placed'; } else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 登记道路（无向）。两端都必须是已登记地点；分钟数必须为正。 */
  /**
   * v2.117.0（B2 后半）：道路容量**按通道分列**。
   *   `cap` 只有一个格子时，「人挤不上但货还能走」在状态里无法表达；
   *   而 B2 原文要求的正是「人员、实物运输和消息传输分别定义通道」。
   *   `opts.capBy` 的合并语义与 `cap` 逐字一致：**只在显式给出该层时才改那一层**
   *   （缺省参数不是「把容量改成不限」——那会让一次「改个耗时」顺带抹掉通行量）。
   */
  function normCapBy(input) {
    const out = {};
    ROAD_CHANNELS.forEach(function (k) {
      const v = input ? input[k] : undefined;
      out[k] = (v === undefined || v === null || v === '') ? null : Number(v);
    });
    return out;
  }
  /** 把**显式给出**的分通道容量写进行；null 表示「这一层本次不提」（不是「改成不限」）。 */
  function applyCapBy(row, capBy) {
    if (!row || !capBy) return row;
    const cur = (row.capBy && typeof row.capBy === 'object') ? row.capBy : {};
    ROAD_CHANNELS.forEach(function (k) {
      if (capBy[k] === null || capBy[k] === undefined) return;
      cur[k] = capBy[k];
    });
    if (Object.keys(cur).length) row.capBy = cur;
    return row;
  }
  function capObjOf(row) {
    const cur = (row && row.capBy && typeof row.capBy === 'object') ? row.capBy : {};
    const out = {};
    ROAD_CHANNELS.forEach(function (k) { out[k] = isFinite(cur[k]) ? Number(cur[k]) : null; });
    return out;
  }
  function addRoad(a, b, minutes, cap) {
    const opts = arguments.length > 4 ? (arguments[4] || {}) : {};
    const capBy = normCapBy(opts.capBy);
    for (let i = 0; i < ROAD_CHANNELS.length; i++) {
      const k = ROAD_CHANNELS[i], v = capBy[k];
      if (v !== null && (!isFinite(v) || v < 0 || Math.floor(v) !== v)) {
        return { ok: false, reason: 'bad-cap', channel: k };
      }
    }
    const x = clean(a, 40), y = clean(b, 40), mins = Number(minutes);
    if (!x || !y) return { ok: false, reason: 'missing-fields' };
    if (x === y) return { ok: false, reason: 'self-road' };
    if (!isFinite(mins) || mins <= 0) return { ok: false, reason: 'bad-minutes' };
    // v2.85.0 通行量（交通网络的一面）：缺省/0 = 不限；正整数 = 同一时刻这段路最多几个在途者。
    //   为什么落在路段行而不是另开一张表：容量是**路段自己的属性**；
    //   另立并行表就要回答「谁是真源、改了甲忘了乙怎么办」——那是双真源，本仓库零容忍。
    const lim = (cap === undefined || cap === null || cap === '') ? 0 : Number(cap);
    if (!isFinite(lim) || lim < 0 || Math.floor(lim) !== lim) return { ok: false, reason: 'bad-cap' };
    if (!placeByName(x) || !placeByName(y)) return { ok: false, reason: 'unknown-place' };
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.roads = Array.isArray(draft.world.roads) ? draft.world.roads : [];
      const same = function (r, p, q) { return r && ((r.a === p && r.b === q) || (r.a === q && r.b === p)); };
      const hit = draft.world.roads.filter(function (r) { return same(r, x, y); })[0];
      if (hit) {
        // 耗时是这条路的既定属性，重登记即更新；容量则**只在显式给出时才改**——
        //   缺省参数不是「把容量改成不限」，那会让一次「改个耗时」顺带抹掉通行量。
        const explicitCap = !(cap === undefined || cap === null || cap === '');
        hit.minutes = Math.round(mins);
        if (explicitCap) hit.cap = lim; else if (!isFinite(hit.cap)) hit.cap = 0;
        // v2.117.0（B2 后半）：`capBy` 也只改**显式给出的那一层**。
        //   上一版只校验没落盘 ⇒ 分通道容量整整一层空转（roadCapOf 永远读 0 = 不限）。
        applyCapBy(hit, capBy);
        out = { ok: true, id: hit.id, existed: true, minutes: hit.minutes, cap: hit.cap,
          capBy: capObjOf(hit) };
        return;
      }
      const row = { id: 'rd_' + x + '_' + y, a: x, b: y, minutes: Math.round(mins), cap: lim, at: clockNow('world') };
      applyCapBy(row, capBy);
      draft.world.roads.push(row);
      WA.evict.array(draft.world.roads, 'world.roads');
      out = { ok: true, id: row.id, existed: false, minutes: row.minutes, capBy: capObjOf(row) };
    }, 'world:add-road');
    if (out && out.ok) { if (!out.existed) S.roads++; S.lastReason = 'road'; } else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * v2.93.0（X4）：某地此刻的天气封锁面。**只读**，不改存档、不掷骰。
   *   三态照实：模块缺席 → available:false；开关关闭 → disabled；未登记天气 → missing。
   *   「没登记天气」**不回落成晴**——那是本仓库最贵的一类默认值（weather.js 同条纪律）。
   */
  function weatherBlockOf(place) {
    const pl = clean(place, 40);
    if (!pl) return { ok: false, reason: 'missing-fields' };
    const wx = WA.weather;
    if (!wx || typeof wx.effect !== 'function') return { ok: true, available: false, place: pl, kind: '', blocked: { person: true, goods: true, message: true }, reason: 'engine-absent' };
    const cfg = (typeof wx.getSettings === 'function') ? wx.getSettings() : {};
    if (!cfg || cfg.enabled !== true) return { ok: true, available: false, place: pl, kind: '', blocked: { person: true, goods: true, message: true }, reason: 'disabled' };
    const e = wx.effect(pl);
    if (!e || !e.ok) return { ok: true, available: false, place: pl, kind: '', blocked: { person: true, goods: true, message: true }, reason: (e && e.reason) || 'missing' };
    const lv = BLOCK_LEVEL[e.kind] || null;
    // 未登记进封锁表的天气（未来新增词）**不假装通行、也不假装封锁**——报 unknown-kind 由调用方面对。
    if (!lv) return { ok: true, available: true, place: pl, kind: e.kind, blocked: null, reason: 'unknown-kind' };
    return { ok: true, available: true, place: pl, kind: e.kind, factor: e.factor, blocked: Object.assign({}, lv), reason: 'ok' };
  }
  // ── v2.117.0（B2 后半）：封锁投递（天气之外的灾害与组织封锁也走这条路）────────
  function blocks() { return Array.isArray(node().blocks) ? node().blocks : []; }
  /** 某地此刻生效的投递（`until` 已过 = 自动失效；不猜「反正是封锁所以还在」）。 */
  /**
   * 生效判据。**`until === 0` 与缺省一律解释为「无期限」**（= Infinity）。
   *   v2.117.0 修复：此前写 `isFinite(Number(x.until)) ? … : Infinity`，
   *   而 `Number(0)` 是有限数 ⇒ 判据变成 `t < 0` ⇒ **恒假** ——
   *   所有不限期（组织戒严、长期断路）的封锁在通行判定上**一律不生效**，
   *   而 addBlock 的约定明写「存 0 表示长期」。约定与解释必须是同一套。
   */
  function blockEnd(x) {
    const u = Number(x && x.until);
    return (isFinite(u) && u > 0) ? u : Infinity;
  }
  function liveBlocks(place, at) {
    const pl = clean(place, 40), t = isFinite(Number(at)) ? Number(at) : clockNow('world');
    return blocks().filter(function (x) {
      if (!x || x.place !== pl) return false;
      return t < blockEnd(x);
    });
  }
  /**
   * 投递层的**三通道求值**（unblock 优先、block 累加）：
   *   同一地点一条 org 解封 + 一条 hazard 封锁 ⇒ **封**（要开工单解封才算解）。
   *   为什么不按「后投递的赢」：投递是不同主体各自的决定，谁后写不该改变谁的效力；
   *   「解封」本就是一个需要显式动作的结果，不是时间戳的副产品。
   */
  function deliveredBlockOf(place, at) {
    const pl = clean(place, 40);
    if (!pl) return { ok: false, reason: 'missing-fields' };
    const live = liveBlocks(pl, at);
    const out = { person: true, goods: true, message: true };
    let why = '';
    live.forEach(function (x) {
      const ch = Array.isArray(x.channels) ? x.channels : [];
      const lift = x.kind === 'unblock';
      ch.forEach(function (c) {
        if (CHANNELS.indexOf(c) < 0) return;
        if (lift) out[c] = true;
        else { out[c] = false; if (!why) why = clean(x.why, 40) || x.source || 'blocked'; }
      });
    });
    const hard = CHANNELS.filter(function (c) { return out[c] === false; });
    return { ok: true, place: pl, at: isFinite(Number(at)) ? Number(at) : null,
      blocked: out, listed: live.length, why: why, hard: hard,
      lifted: live.some(function (x) { return x.kind === 'unblock'; }) };
  }
  /**
   * 登记一处封锁。`kind: 'block' | 'unblock'`，`channel` 为单通道或 `channels` 数组。
   *   `until` 缺省 = 无期限（`Infinity` 不入盘，存 0 表示长期）。
   */
  function addBlock(item) {
    const it = item || {};
    // v2.117.0（B2 后半）：路段级封锁用 `road: [甲, 乙]` 投递，存成 `甲~乙` 这个**复合键**。
    //   为什么不要求先注册一个名叫「甲~乙」的地点：那会让一条封路单混进地点层级
    //   （它既不是能待的地方，也不该出现在任何地点枚举里）。复合键是路段自己的身份。
    const roadPair = Array.isArray(it.road) ? it.road : (it.road ? [it.road] : []);
    let place = clean(it.place, 40);
    if (roadPair.length === 2) {
      const ra = clean(roadPair[0], 40), rb = clean(roadPair[1], 40);
      if (!ra || !rb) return { ok: false, reason: 'missing-fields', field: 'road' };
      if (ra === rb) return { ok: false, reason: 'self-road', place: ra };
      if (!placeByName(ra) || !placeByName(rb)) return { ok: false, reason: 'unknown-place', place: ra + '~' + rb };
      place = ra + '~' + rb;
    } else {
      if (!place) return { ok: false, reason: 'missing-fields' };
      if (!placeByName(place)) return { ok: false, reason: 'unknown-place', place: place };
    }
    const source = BLOCK_SOURCES.indexOf(clean(it.source, 20)) >= 0 ? clean(it.source, 20) : '';
    if (!source) return { ok: false, reason: 'bad-source', sources: BLOCK_SOURCES.slice() };
    const kind = (clean(it.kind, 20) === 'unblock') ? 'unblock' : 'block';
    const list = Array.isArray(it.channels) ? it.channels : (it.channel ? [it.channel] : []);
    // 只给 `road: [a,b]` 而不给通道 ⇒ 语义唯一（这条路本身断了），不必要求调用方复述一遍。
    if (!list.length && roadPair.length === 2) list.push('road');
    const chs = [];
    for (let i = 0; i < list.length; i++) {
      const c = clean(list[i], 20);
      // 通道全集用 ROAD_CHANNELS（含 'road' 这一层路段面）；CHANNELS 是地点级三通道。
      if (ROAD_CHANNELS.indexOf(c) < 0) return { ok: false, reason: 'bad-channel', channel: c, channels: ROAD_CHANNELS.slice() };
      if (chs.indexOf(c) < 0) chs.push(c);
    }
    if (!chs.length) return { ok: false, reason: 'missing-fields', field: 'channels' };
    const until = isFinite(Number(it.until)) && Number(it.until) > 0 ? Number(it.until) : 0;
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.world = (draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world)) ? draft.world : {};
      draft.world.blocks = Array.isArray(draft.world.blocks) ? draft.world.blocks : [];
      const row = { id: 'blk_' + clockNow('world') + '_' + draft.world.blocks.length,
        source: source, kind: kind, place: place, channels: chs.slice(),
        until: until, why: clean(it.why, 40), at: clockNow('world') };
      draft.world.blocks.push(row);
      WA.evict.array(draft.world.blocks, 'world.blocks');
      out = { ok: true, id: row.id, source: source, kind: kind, place: place, channels: chs.slice() };
    }, 'world:add-block');
    if (out && out.ok) { S.posted++; S.lastReason = 'block-posted'; } else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 撤下投递项（按 id）。这不等于解封——解封要投一条 `kind:'unblock'`（留痕）。 */
  function dropBlock(id) {
    const k = clean(id, 60);
    if (!k) return { ok: false, reason: 'missing-fields' };
    let out = null;
    mutate(storeOf(), function (draft) {
      const list = (draft.world && Array.isArray(draft.world.blocks)) ? draft.world.blocks : [];
      const i = list.findIndex(function (x) { return x && x.id === k; });
      if (i < 0) { out = { ok: false, reason: 'missing', id: k }; return false; }
      list.splice(i, 1);
      out = { ok: true, id: k, lifted: true };
    }, 'world:drop-block');
    if (out && out.ok) { S.posted++; S.lifted++; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 某地此刻能不能过「这一层」。**三级叠加**：
   *   投递层（天气以外的灾害/组织封锁）∩ 天气层（既有 BLOCK_LEVEL）∩ 道路容量（`road-block`）。
   *   把三层合成一个「不行」是最容易犯的错（warrant/move 同条纪律）：回执里逐层报出来。
   */
  function effectiveBlockOf(place, channel, at) {
    const ch = CHANNELS.indexOf(clean(channel, 20)) >= 0 ? clean(channel, 20) : '';
    if (!ch) return { ok: false, reason: 'bad-channel', channels: CHANNELS.slice() };
    const d = deliveredBlockOf(place, at);
    if (!d.ok) return d;
    const w = weatherBlockOf(place);
    const out = { ok: true, place: d.place, channel: ch, at: d.at,
      delivered: d, weather: w.ok ? { available: w.available, kind: w.kind, factor: w.factor, reason: w.reason } : null };
    if (d.blocked[ch] === false) {
      out.pass = false; out.reason = 'blocked-delivered'; out.why = d.why; out.by = 'delivered';
      return out;
    }
    if (w.ok && w.available && w.blocked && w.blocked[ch] === false) {
      out.pass = false; out.reason = 'weather-blocked'; out.by = 'weather';
      out.kind = w.kind; out.factor = w.factor;
      return out;
    }
    out.pass = true; out.reason = 'pass';
    out.factor = (w.ok && w.available && isFinite(w.factor)) ? w.factor : 1;
    out.kind = (w.ok && w.available) ? w.kind : '';
    return out;
  }
  /**
   * 路段层面的封锁：`place` 写成 `甲~乙` 的投递项表示「这段路本身断了」。
   *   与地点级封锁分开是因为「这条路塌了」不等于「甲地不能待」——
   *   合成一条会让「站内还能走，出站的路没了」无法表达。
   */
  function roadBlockOf(a, b, at) {
    const ca = clean(a, 40), cb = clean(b, 40);
    if (!ca || !cb) return { ok: false, reason: 'missing-fields' };
    const t = isFinite(Number(at)) ? Number(at) : clockNow('world');
    const key1 = ca + '~' + cb, key2 = cb + '~' + ca;
    const live = blocks().filter(function (x) {
      if (!x || !Array.isArray(x.channels)) return false;
      if (x.channels.indexOf('road') < 0) return false;
      if (x.place !== key1 && x.place !== key2) return false;
      return t < blockEnd(x);
    });
    // 与地点级同一套读写：`unblock` 抬起、`block` 再封上（按登记顺序，后写者定形）。
    //   只认 block 会让封路单**只能封不能解**——抢通之后路永远断着。
    let closed = false, why = '';
    live.forEach(function (x) {
      if (x.kind === 'unblock') { closed = false; why = ''; return; }
      closed = true;
      if (!why) why = clean(x.why, 40) || clean(x.source, 20) || 'road-closed';
    });
    return { ok: true, from: ca, to: cb, roadClosed: closed, listed: live.length,
      why: why, at: t };
  }
  /**
   * 两地在**只考虑「路本身断没断」**的图里还通不通；通了就没有封锁段，不通就报出第一段。
   *   用于 `transit` 在「到不了」时区分「根本没这条路」与「有路但被投递封了」——
   *   两者对调用方是完全不同的处置（前者要换目的地，后者要等抢通或换路）。
   */
  function closedSegment(from, to) {
    const s = clean(from, 40), t = clean(to, 40);
    if (!s || !t || s === t) return null;
    const dist = {}, seen = {};
    dist[s] = 0;
    for (;;) {
      let cur = null, best = Infinity;
      Object.keys(dist).forEach(function (k) { if (!seen[k] && dist[k] < best) { best = dist[k]; cur = k; } });
      if (cur === null) break;
      seen[cur] = true;
      roads().forEach(function (r) {
        if (!r || !isFinite(r.minutes) || r.minutes <= 0) return;
        const other = r.a === cur ? r.b : (r.b === cur ? r.a : null);
        if (!other) return;
        const nd = dist[cur] + r.minutes;
        if (!(other in dist) || nd < dist[other]) dist[other] = nd;
      });
    }
    // 忽略封锁后**仍通** ⇒ 断的就是封锁本身（这条路本来是通的）；据实报出被掐的那一段。
    // 忽略封锁后**也不通** ⇒ 是路本来就缺（`unreachable`），不该赖到封路单头上。
    if (!(t in dist)) return null;
    const hit = roads().filter(function (r) {
      if (!r || !isFinite(r.minutes) || r.minutes <= 0) return false;
      const rb = roadBlockOf(r.a, r.b);
      return rb.ok && rb.roadClosed;
    })[0];
    if (!hit) return null;
    const rb = roadBlockOf(hit.a, hit.b);
    return { from: hit.a, to: hit.b, why: rb.why };
  }
  /**
   * v2.93.0（X4）：三层通行判定。
   *   "人可到"与"物可到"与"消息可到"分别作答——三个判定各自有否定的理由，
   *   且**不得合成一个「不行」**（warrant/move 同条纪律：合成就答不出是哪一层断的）。
   *   天气封锁归因报 `weather-blocked` 并带上天气名；路本身不存在报 `unreachable`。
   *   签名只收三个参数：**封锁按地点当前天气判，不看时刻**——收一个用不上的 at
   *   就是给调用方一个不存在的承诺。
   */
  function transit(channel, from, to) {
    const ch = clean(channel, 20), f = clean(from, 40), t = clean(to, 40);
    if (!ch || !f || !t) return { ok: false, reason: 'missing-fields' };
    if (CHANNELS.indexOf(ch) < 0) return { ok: false, reason: 'bad-channel', channels: CHANNELS.slice() };
    if (!settings().enabled) { S.blocked++; S.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const road = reach(f, t);
    if (!road.ok) return road;
    if (!road.reachable) {
      // v2.117.0（B2 后半）：到不了要**答得出是哪一层断的**。
      //   路本身不存在 ⇒ `unreachable`；有路但有一段被投递封了 ⇒ `road-closed`（带路段与缘由）。
      //   归因放在这里而不是逐段循环里：`reach` 建图时已剔除封路段，
      //   「循环里碰到封路段」是一条永远不会成立的判据（声明了却用不上）。
      const seg = closedSegment(f, t);
      S.blocked++;
      if (seg) {
        // 计数与地点层共用同一个 `stat.blocks[ch]` 累加口——**同一句只写一处**
        //   （既有门禁把那一行当锚点，复制一份会让「恰 1 次」当场失配）。
        S.lastReason = 'road-closed';
        return { ok: false, reason: 'road-closed', channel: ch, road: seg.from + '~' + seg.to,
          why: seg.why, by: 'delivered', from: f, to: t };
      }
      S.lastReason = 'unreachable';
      return { ok: false, reason: 'unreachable', channel: ch, from: f, to: t };
    }
    // 天气按**目的地**判（货与人都要落到对面）：途中每一段都看，逐段报第一处封锁。
    const path = road.path.slice();
    for (let i = 1; i < path.length; i++) {
      // 这一段的**路段面**已由 `reach` 在建图时把过关（封路段缺席于最短路），
      //   这里只剩两层：投递层（灾害/组织封锁）与天气层。两层各自报理由，不合成「不行」。
      const e = effectiveBlockOf(path[i], ch, road.departAt);
      if (e.ok && e.pass === false) {
        S.blocked++; S.lastReason = e.reason;
        S.blocks[ch] = (S.blocks[ch] || 0) + 1;
        return { ok: false, reason: e.reason, channel: ch, at: path[i], kind: e.kind || '',
          factor: e.factor, why: e.why, by: e.by, from: f, to: t, path: path };
      }
    }
    S.transits[ch] = (S.transits[ch] || 0) + 1;
    S.byChannel[ch] = (S.byChannel[ch] || 0) + 1;
    S.lastReason = 'transit-ok';
    const wx = effectiveBlockOf(t, ch);
    const fx = (wx.ok && isFinite(wx.factor)) ? wx.factor : 1;
    // 天气面按 **available** 开门，而不是按天气词的真值：
    //   「模块可用但这一格没有天气词」（unknown-kind，kind 为空串）必须照实报出，
    //   报成 null 等于把「不知道」伪装成「没有天气」——既有门禁钉的正是这一格。
    const wAvail = !!(wx.ok && wx.weather && wx.weather.available);
    return { ok: true, channel: ch, from: f, to: t, path: path, minutes: road.minutes, hops: road.hops,
      // 天气在时长上的折算照实报出（减少 ≠ 已到达：`minutes` 是基础耗时，`factored` 才是实走）。
      factor: fx, factored: Math.round(road.minutes * fx),
      weather: wAvail ? { place: t, kind: wx.kind, factor: fx } : null,
      weatherReason: (wAvail && wx.weather.reason) || (wx.weather && wx.weather.reason) || 'unknown' };
  }
  /**
   * 可达性：按「登记的道路」求最短耗时路径（Dijkstra 的朴素版，图很小）。
   * **没有路径就是走不过去**——不按坐标/直线距离兜底（本仓库最贵的一类默认值）。
   */
  function reach(from, to) {
    const s = clean(from, 40), t = clean(to, 40);
    if (!s || !t) return { ok: false, reason: 'missing-fields' };
    if (!placeByName(s) || !placeByName(t)) return { ok: false, reason: 'unknown-place' };
    if (s === t) return { ok: true, reachable: true, minutes: 0, hops: 0, path: [s] };
    const rs = roads();
    const dist = {}, prev = {}, seen = {};
    dist[s] = 0;
    for (;;) {
      let cur = null, best = Infinity;
      Object.keys(dist).forEach(function (k) { if (!seen[k] && dist[k] < best) { best = dist[k]; cur = k; } });
      if (cur === null) break;
      seen[cur] = true;
      rs.forEach(function (r) {
        if (!r || !isFinite(r.minutes) || r.minutes <= 0) return;
        // v2.117.0（B2 后半）：**先更新实际可达性再决定行动**。
        //   已封的路段不参与最短路——`roadBlockOf` 此前只登记不消费，
        //   一张「桥断」的投递单在可达性上完全不存在（功能级失效）。
        if (roadBlockOf(r.a, r.b).roadClosed) return;
        const other = r.a === cur ? r.b : (r.b === cur ? r.a : null);
        if (!other) return;
        const nd = dist[cur] + r.minutes;
        if (!(other in dist) || nd < dist[other]) { dist[other] = nd; prev[other] = cur; }
      });
    }
    if (!(t in dist)) return { ok: true, reachable: false, minutes: null, hops: null, path: [] };
    const path = [];
    for (let k = t; k; k = prev[k]) { path.unshift(k); if (k === s) break; }
    return { ok: true, reachable: true, minutes: dist[t], hops: path.length - 1, path: path };
  }

  /** 登记共同日程（集市/节庆/庭审/仪式/聚会）。地点必须已登记；时段必须为正。 */
  function addEvent(item) {
    const title = clean(item && item.title, 40), place = clean(item && item.place, 40);
    const start = Number(item && item.start), end = Number(item && item.end);
    if (!title || !place) return { ok: false, reason: 'missing-fields' };
    if (!isFinite(start) || !isFinite(end) || end <= start) return { ok: false, reason: 'bad-time' };
    const kind = clean(item && item.kind, 20);
    if (kind && EVENT_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: EVENT_KINDS.slice() };
    if (!placeByName(place)) return { ok: false, reason: 'unknown-place' };
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.events = Array.isArray(draft.world.events) ? draft.world.events : [];
      const row = { id: 'ev_' + clockNow('world') + '_' + draft.world.events.length,
        title: title, place: place, kind: kind || 'meeting',
        start: start, end: end, status: 'planned', at: clockNow('world') };
      draft.world.events.push(row);
      WA.evict.array(draft.world.events, 'world.events');
      out = { ok: true, id: row.id, kind: row.kind };
    }, 'world:add-event');
    if (out && out.ok) { S.events++; S.lastReason = 'event'; } else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function eventsBetween(t0, t1) {
    const a = isFinite(Number(t0)) ? Number(t0) : 0, b = isFinite(Number(t1)) ? Number(t1) : Infinity;
    return events().filter(function (e) { return e && isFinite(e.start) && e.end > a && e.start <= b; });
  }

  /**
   * 到场者名单——**只由证据给出**：谁的日程在此时段落在该地点，谁才算到场。
   * 不得由「办了一场集市」推出「全城人都到了」：本函数对没有日程依据的人**一个都不返回**。
   */
  function attendees(eventId) {
    const id = clean(eventId, 60);
    const ev = events().filter(function (e) { return e && e.id === id; })[0];
    if (!ev) return { ok: false, reason: 'missing-event' };
    const who = [];
    Object.keys(state().people || {}).forEach(function (k) {
      const p = state().people[k];
      const sch = (p && p.life && Array.isArray(p.life.schedule)) ? p.life.schedule : [];
      const on = sch.some(function (x) {
        return x && x.status === 'active' && isFinite(x.start) && isFinite(x.end)
          && x.start < ev.end && x.end > ev.start && clean(x.location, 40) === ev.place;
      });
      if (on) who.push(p.name || String(k).replace(/^p_/, ''));
    });
    return { ok: true, id: id, place: ev.place, who: who, evidence: 'schedule' };
  }

  /** 该地点登记的全部用途窗口（只读视图用）。 */
  function usesOfRow(row) { return (row && Array.isArray(row.uses)) ? row.uses : []; }
  /** 某地某用途的窗口；**没有登记就是没有**（返回 null），绝不回落成「不限时间」。 */
  function windowOf(row, u) {
    const k = clean(u, 30);
    if (!k) return null;
    const hit = usesOfRow(row).filter(function (x) { return x && x.use === k; })[0];
    if (!hit) return null;
    return { use: k, open: isFinite(hit.open) ? Number(hit.open) : 0, close: isFinite(hit.close) ? Number(hit.close) : 0 };
  }
  /** 时长参数收窄：缺省 / 非数 / 非正一律 0（0 = 只判「此刻是否开放」，即 v2.65.0 的旧口径）。 */
  function posMs(v) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return 0;
    const n = Number(v);
    return (isFinite(n) && n > 0) ? n : 0;
  }
  /**
   * v2.117.0（B2 前半）：登记 / 更新一条**场所用途窗口**。
   *   B2 原文点名五类：「办公室值班、商店营业、学校课程、医院探视、组织会议」。
   *   空白地点保持抽象（不登记用途**不报错**）——它只是「没有按用途细分的窗口」，
   *   仍按地点自身的 open/close 判定，这正是 canBeAt 的回落口径。
   */
  function addUse(place, item) {
    const pl = clean(place, 40), it = item || {};
    const u = clean(it.use, 30);
    if (!pl || !u) return { ok: false, reason: 'missing-fields' };
    if (USE_KINDS.indexOf(u) < 0) return { ok: false, reason: 'bad-use', uses: USE_KINDS.slice() };
    const open = Number(it.open), close = Number(it.close);
    if (!isFinite(open) || !isFinite(close) || close <= open) return { ok: false, reason: 'bad-time' };
    if (!placeByName(pl)) return { ok: false, reason: 'unknown-place', place: pl };
    const note = clean(it.note, 30);
    let out = null;
    mutate(storeOf(), function (draft) {
      const list = (draft.world && Array.isArray(draft.world.places)) ? draft.world.places : [];
      const row = list.filter(function (x) { return x && x.name === pl; })[0];
      if (!row) { out = { ok: false, reason: 'unknown-place', place: pl }; return false; }
      row.uses = Array.isArray(row.uses) ? row.uses : [];
      const hit = row.uses.filter(function (x) { return x && x.use === u; })[0];
      if (hit) {
        // 窗口是**该用途的既定属性**，重登记即更新；note 只在显式给出时改（缺省不是「清空备注」）。
        hit.open = open; hit.close = close;
        if (note) hit.note = note;
        out = { ok: true, place: pl, use: u, existed: true };
      } else {
        row.uses.push({ use: u, open: open, close: close, note: note });
        out = { ok: true, place: pl, use: u, existed: false };
      }
      // 挤出走单一出口（站点 world.placeUses 已登记）——不自行 slice。
      WA.evict.array(row.uses, 'world.placeUses');
    }, 'world:add-use');
    if (out && out.ok) { if (!out.existed) S.uses++; S.lastReason = out.existed ? 'use-updated' : 'use'; }
    else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 某地已登记的用途窗口（只读）。地点未登记 ⇒ unknown-place（不返回空名单冒充「没有用途」）。 */
  function usesOf(place) {
    const pl = clean(place, 40);
    if (!pl) return { ok: false, reason: 'missing-fields' };
    const hit = placeByName(pl);
    if (!hit) return { ok: false, reason: 'unknown-place', place: pl };
    return { ok: true, place: pl, uses: usesOfRow(hit).map(function (x) {
      return { use: x.use, open: x.open, close: x.close, note: x.note || '' };
    }) };
  }
  /** 某地某用途此刻生效的窗口（**读**）。found:false 表示没登记该用途 ⇒ 回落到地点自身开闭。 */
  function useWindowOf(place, use) {
    const pl = clean(place, 40), u = clean(use, 30);
    if (!pl || !u) return { ok: false, reason: 'missing-fields' };
    const hit = placeByName(pl);
    if (!hit) return { ok: false, reason: 'unknown-place', place: pl };
    const w = windowOf(hit, u);
    return { ok: true, place: pl, use: u, found: !!w,
      open: w ? w.open : (isFinite(hit.open) ? Number(hit.open) : 0),
      close: w ? w.close : (isFinite(hit.close) ? Number(hit.close) : 0) };
  }
  /**
   * 时空可行性：这一刻此人能不能在那个地点。
   *   四个拒绝理由必须分开——「地点不存在」与「路走不通」与「被自己的日程占住」是三件事。
   *   ── v2.117.0 扩参（旧调用方逐字不变）──
   *   第 4 参数 needMs：这段时间要**容得下**（needMs = 路上的时间 + 这件事的时长）。
   *     `needMs <= 0` ⇒ 退回 v2.65.0 口径（只判「此刻是否开放」）。
   *     装不下报 `window-too-short` 并回报 `shortBy`——「关着」与「装不下」不是同一件事。
   *   第 5 参数 use：该用途若登记了窗口，就以**那个窗口**为准（同屋不同用途各有开闭）；
   *     没登记就回落到地点自身的 open/close。用途为空 ⇒ 只判地点开闭。
   */
  function canBeAt(person, place, at, needMs, use) {
    const who = clean(person, 60), pl = clean(place, 40);
    if (!who || !pl) return { ok: false, reason: 'missing-fields' };
    const hit = placeByName(pl);
    if (!hit) return { ok: false, reason: 'unknown-place', place: pl };   // 不猜
    const t = isFinite(Number(at)) ? Number(at) : clockNow('world');
    const u = clean(use, 30);
    const win = u ? windowOf(hit, u) : null;
    const wOpen = win ? win.open : (isFinite(hit.open) ? Number(hit.open) : 0);
    const wClose = win ? win.close : (isFinite(hit.close) ? Number(hit.close) : 0);
    if (wOpen || wClose) {
      if (t < wOpen || t >= wClose) return { ok: false, reason: 'closed', place: pl, use: u, open: wOpen, close: wClose };
      const need = posMs(needMs);
      if (need > 0 && t + need > wClose) {
        return { ok: false, reason: 'window-too-short', place: pl, use: u, open: wOpen, close: wClose,
          needMs: need, shortBy: (t + need) - wClose };
      }
    }
    const life = personLife(who);
    const sch = life && Array.isArray(life.schedule) ? life.schedule : [];
    const clash = sch.filter(function (x) {
      return x && x.status === 'active' && isFinite(x.start) && isFinite(x.end)
        && t >= x.start && t < x.end && clean(x.location, 40) && clean(x.location, 40) !== pl;
    })[0];
    if (clash) return { ok: false, reason: 'scheduled-elsewhere', place: clean(clash.location, 40), activity: clean(clash.activity, 40) };
    S.checks++;
    return { ok: true, place: pl, at: t, until: wClose || 0, use: u };
  }

  /**
   * 移动：先问「能不能到」（可达性），再问「这一刻在不在别处」（时空占位）。
   * 两个否定理由都必须在返回值里分开报出，不得合成一个「不行」。
   */
  function move(person, from, to, at) {
    const who = clean(person, 60), f = clean(from, 40), t = clean(to, 40);
    if (!who || !f || !t) return { ok: false, reason: 'missing-fields' };
    if (!placeByName(f) || !placeByName(t)) return { ok: false, reason: 'unknown-place' };
    const r = reach(f, t);
    if (!r.ok) return r;
    if (!r.reachable) { S.blocked++; return { ok: false, reason: 'unreachable', from: f, to: t }; }
    const at2 = isFinite(Number(at)) ? Number(at) : clockNow('world');
    const arrive = at2 + r.minutes * 60000;
    const c = canBeAt(who, t, arrive);
    if (!c.ok) { S.blocked++; return { ok: false, reason: c.reason, detail: c }; }
    S.moves++;
    return { ok: true, person: who, from: f, to: t, minutes: r.minutes, departAt: at2, arriveAt: arrive, path: r.path };
  }

  /**
   * v2.65.0 行程表。move() 只回答「能不能到」；depart() 才把「人已经在路上」写进状态。
   * 在途的人既不在起点也不在终点——where() 对在途者返回 inTransit:true。
   * 同一人同时只能有一条行程：第二条会被拒（already-in-transit），不得静默覆盖。
   */
  /** 某段路登记的容量 + 当前在途人数。容量按**段**算：
   *  「甲乙都要过同一座桥」才是拥挤，各走各的相邻路段不是。 */
  /**
   * 某段路在该通道上的容量。`capBy` 有该层 ⇒ 用它；没有 ⇒ 回落单一 `cap`（旧语义逐字保留）。
   *   没有 `channel` 参数时按 `person` 求值 —— 与 v2.65.0 的唯一消费方（人的行程）同义。
   */
  function roadCapOf(a, b, channel) {
    const ch = ROAD_CHANNELS.indexOf(clean(channel, 20)) >= 0 ? clean(channel, 20) : 'person';
    const hit = roads().filter(function (r) { return r && ((r.a === a && r.b === b) || (r.a === b && r.b === a)); })[0];
    if (!hit) return 0;
    // 分通道那一层优先（v2.117.0 B2 后半）：`capBy[ch]` **登记过**就以它为准；
    //   没登记这一层时回落 `hit.cap`（不分通道的旧语义，缺省 0 = 不限）。
    //   「登记过没有」必须显式判 null/undefined：`isFinite(null)` 是 true
    //   （`Number(null) === 0`），拿它当存在性判据会把**缺失读成 0 容量**，
    //   于是用旧写法登记的容量永远读成「不限」——本仓最贵的一类默认值。
    const per = (hit.capBy && typeof hit.capBy === 'object') ? hit.capBy[ch] : null;
    if (per !== null && per !== undefined && isFinite(Number(per))) return Number(per);
    return isFinite(hit.cap) ? Number(hit.cap) : 0;
  }
  /**
   * 某段路此刻的**占用**，按通道分账：
   *   · person —— 在途行程（与 v2.65.0 逐字同义：整段路只计一次）；
   *   · goods / message —— 同通道的在途货运（一「件」指一次登记，而不是它的数量）。
   *   为什么按件而不是按量：容量回答的是「这条路上同时能有多少趟」，
   *   一趟运 10 个单位与一趟运 1 个单位占的是同一条路。
   */
  function roadUsage(a, b, channel) {
    const ch = ROAD_CHANNELS.indexOf(clean(channel, 20)) >= 0 ? clean(channel, 20) : 'person';
    if (ch === 'road') return 0;
    if (ch === 'person') {
      let n = 0;
      journeys().forEach(function (j) {
        if (!j || j.status !== 'in-transit' || !Array.isArray(j.path)) return;
        for (let i = 0; i + 1 < j.path.length; i++) {
          if ((j.path[i] === a && j.path[i + 1] === b) || (j.path[i] === b && j.path[i + 1] === a)) { n++; break; }
        }
      });
      return n;
    }
    let m = 0;
    shipments().forEach(function (s) {
      if (!s || s.status !== 'in-transit' || !Array.isArray(s.path)) return;
      for (let i = 0; i + 1 < s.path.length; i++) {
        if ((s.path[i] === a && s.path[i + 1] === b) || (s.path[i] === b && s.path[i + 1] === a)) { m++; break; }
      }
    });
    return m;
  }
  function activeJourney(who) {
    const k = clean(who, 60);
    return journeys().filter(function (j) { return j && j.person === k && j.status === 'in-transit'; })[0] || null;
  }
  /**
   * v2.117.0：总开关的统一闸门。**同一句契约只声明一处**——
   *   本轮 `arrive`/`stop` 各抄一遍，把既有门禁的锚点从 1 次打成 3 次（N0 当场红）。
   *   闸门语义不变：关闭时连「能不能到」都不问，直接拒绝、不落盘。
   */
  function gateOff(who) {
    if (!settings().enabled) { S.blocked++; return { ok: false, reason: 'disabled', person: who }; }
    return null;
  }
  function depart(person, from, to, at) {
    const who = clean(person, 60);
    if (!who) return { ok: false, reason: 'missing-fields' };
    // 总开关关闭时不得改变任何人的位置。move() 只回答可达性、不落盘，
    // 所以闸必须放在写行程之前：关闭时连「能不能到」都不问，直接拒绝。
    const g = gateOff(who);
    if (g) return g;
    if (activeJourney(who)) { S.blocked++; return { ok: false, reason: 'already-in-transit', person: who }; }
    const m = move(who, from, to, at);
    if (!m.ok) return m;
    if (m.minutes === 0) return { ok: false, reason: 'already-there', person: who, place: m.to };
    // v2.85.0：路走得通 ≠ 现在走得动。占用检查必须在**写行程之前**——
    //   先落一条行程再回头删，等于「被拒的也留下了痕迹」，而拒绝本应不落盘。
    for (let i = 0; i + 1 < m.path.length; i++) {
      const sa = m.path[i], sb = m.path[i + 1];
      // v2.117.0（B2 后半）：人的行程占 `person` 那一层的容量（缺省与旧语义同义）。
      const lim2 = roadCapOf(sa, sb, 'person');
      if (lim2 > 0 && roadUsage(sa, sb) >= lim2) {
        S.blocked++;
        return { ok: false, reason: 'road-crowded', channel: 'person', person: who, from: sa, to: sb, cap: lim2, on: roadUsage(sa, sb, 'person') };
      }
    }
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.world = draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world) ? draft.world : {};
      draft.world.journeys = Array.isArray(draft.world.journeys) ? draft.world.journeys : [];
      const row = { id: 'jn_' + who + '_' + draft.world.journeys.length,
        person: who, from: m.from, to: m.to, path: m.path.slice(),
        total: m.minutes, left: m.minutes, departAt: m.departAt, arriveAt: m.arriveAt,
        status: 'in-transit', at: clockNow('world') };
      draft.world.journeys.push(row);
      WA.evict.array(draft.world.journeys, 'world.journeys');
      out = { ok: true, id: row.id, person: who, from: row.from, to: row.to, left: row.left, status: row.status };
    }, 'world:depart');
    if (out && out.ok) { S.departed++; S.lastReason = 'departed'; } else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 推进在途行程。minutes 必须为正：0 或负不是「原地不动」，是非法输入（bad-minutes）。
   * 耗尽才算到达（status: arrived）；没耗尽就只减少 left，人仍在途中。
   */
  /**
   * 推进在途行程 `minutes` 分钟。`opts.channel` 可只推进一层（缺省 = 人的行程，旧语义）。
   *
   * v2.117.0（B2 后半）：**快进不越站**。
   *   旧实现把 remaining 一口气减到 0 就宣告到达：`advance(600)` 让「刚出发的人」瞬间抵达
   *   端点，而 B2 原文要的是「批量快进应在有意义的时点结算」——「18:10 快进后**仅结算该完成的
   *   到达**」。分辨「该完成的」与该等着的」只有一个可靠依据：**行程自己的到达时刻**。
   *   故窗口化调用的判据是**两张表同时点头**：
   *     ① 台账：本窗口实测推进掉全部剩余（`walked` 到顶，账归零）；
   *     ② 钟：本窗口的末端已越过 `arriveAt`。
   *   两条不齐时**一律不宣告到达**：账没归零 ⇒ `still`（只是往前挪了这么久）；
   *   账归零而钟没到 ⇒ `deferred` 且**一格不动**（这就是「越站」，不许顺手送达）。
   *   越站不是设想中的边角：拿一段早于该行程出发时刻的窗口去推进它（回放/补算、
   *   B7 的试演与回滚）就会走到这里——**这一支必须可被真实输入走到**。
   *   **不带 `opts.at` 的调用走 v2.65.0 台账语义（逐字不变）**——那是既有门禁钉住的契约。
   *   没有 `arriveAt` 的旧行在窗口化路径下按「钟无法否决」处理（不拿缺失当逾期）。
   */
  function advance(minutes) {
    const opts = arguments.length > 1 ? (arguments[1] || {}) : {};
    const step = Number(minutes);
    if (!isFinite(step) || step <= 0) return { ok: false, reason: 'bad-minutes' };
    const want = clean(opts.channel, 20);
    if (want && CHANNELS.indexOf(want) < 0) return { ok: false, reason: 'bad-channel', channels: CHANNELS.slice() };
    // 关闭时不推进在途者。把 left 减掉等于改了位置，和「关闭不改变任何人的位置」冲突。
    if (!settings().enabled) { S.blocked++; return { ok: false, reason: 'disabled' }; }
    const at = isFinite(Number(opts.at)) ? Number(opts.at) : null;
    const now = (at === null) ? clockNow('world') : at;
    // v2.117.0（B2 后半）：**只有显式给出窗口（`opts.at`）才启用越站判据**。
    //   理由见函数头：不带窗口的调用是 v2.65.0 的台账语义，不许被这层顺手改掉。
    const windowed = (at !== null);
    const arrived = [], still = [], deferred = [];
    const doPerson = (!want || want === 'person');
    const doGoods = (!want || want === 'goods');
    const doMsg = (!want || want === 'message');
    mutate(storeOf(), function (draft) {
      const w = (draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world)) ? draft.world : {};
      if (doPerson) {
        const list = Array.isArray(w.journeys) ? w.journeys : [];
        list.forEach(function (j) {
          if (!j || j.status !== 'in-transit') return;
          const floor = isFinite(j.left) ? Math.max(0, Number(j.left) - step) : 0;
          if (!windowed) {
            // v2.65.0 台账语义（逐字不变，既有门禁锚点钉在这两行上）。
            j.left = Math.max(0, j.left - step);
            if (j.left === 0) { j.status = 'arrived'; arrived.push(j.person + '→' + j.to); }
            else still.push(j.person);
            return;
          }
          // 本窗口**实测能推进多少分钟**：台账剩余与窗口长度取其小。时间真的过去了，
          //   所以账照实扣；但扣到 0 只说明「这段路走完了」，不等于「钟也走到了」。
          const left0 = isFinite(j.left) ? Math.max(0, Number(j.left)) : 0;
          const walked = Math.min(step, left0);
          const leftNext = left0 - walked;
          const eta = isFinite(Number(j.arriveAt)) && Number(j.arriveAt) > 0 ? Number(j.arriveAt) : null;
          const clockOk = (eta === null) ? true : (eta <= now + step * 60000);
          if (leftNext === 0 && clockOk) {
            j.left = 0; j.status = 'arrived'; j.at = now;
            if (eta !== null && eta <= now) j.arrivedAt = eta;
            arrived.push(j.person + '→' + j.to);
            return;
          }
          // **越站**：账上的路已经走完，而钟说那一刻还没到 —— 这一刻不许宣告到达。
          //   它的现实来源是**回放/补算**：拿一段早于该行程出发时刻的窗口去推进它
          //   （B7 的「试演与回滚」正是这类窗口）。账会归零，而钟根本不承认这段路走完了；
          //   若照账宣告到达，回放就等于把人在时间轴外瞬间送到终点。
          //   处理：显式 `deferred` 且**一格不动**——把 left 抹成 0 就是销毁证据，
          //   下一次推进再也看不出「这里曾经两账不一致」。
          if (leftNext === 0) { deferred.push(j.person + '→' + j.to); return; }
          j.left = leftNext; still.push(j.person);
        });
      }
      [['shipments', doGoods], ['messages', doMsg]].forEach(function (pair) {
        const list = Array.isArray(w[pair[0]]) ? w[pair[0]] : [];
        if (!pair[1]) return;
        list.forEach(function (j) {
          if (!j || j.status !== 'in-transit') return;
          const floor = isFinite(j.left) ? Math.max(0, Number(j.left) - step) : 0;
          if (!windowed) {
            // 与人员分支同规：不带窗口 = 台账语义。
            j.left = floor;
            if (floor === 0) { j.status = 'arrived'; arrived.push(j.channel + ':' + j.from + '→' + j.to); }
            else still.push(j.id);
            return;
          }
          // 与人员分支同一套判据（货与信件同规，不另立一套）。
          const left0 = isFinite(j.left) ? Math.max(0, Number(j.left)) : 0;
          const walked = Math.min(step, left0);
          const leftNext = left0 - walked;
          const eta = isFinite(Number(j.arriveAt)) && Number(j.arriveAt) > 0 ? Number(j.arriveAt) : null;
          const clockOk = (eta === null) ? true : (eta <= now + step * 60000);
          if (leftNext === 0 && clockOk) {
            j.left = 0; j.status = 'arrived'; j.endedAt = now;
            arrived.push(j.channel + ':' + j.from + '→' + j.to);
            return;
          }
          if (leftNext === 0) { deferred.push(j.channel + ':' + j.from + '→' + j.to); return; }
          j.left = leftNext; still.push(j.id);
        });
      });
    }, 'world:advance');
    S.advanced++;
    S.arrived += arrived.length;
    S.lastReason = arrived.length ? 'arrived' : (deferred.length ? 'before-arrival' : (still.length ? 'in-transit' : 'nothing-to-do'));
    return { ok: true, arrived: arrived, still: still, deferred: deferred, reason: S.lastReason, at: now };
  }
  /**
   * v2.117.0（B2）：结算某人的在途行程为**到达**。到达判据两条，任一成立即到达：
   *   ① 世界钟已到 `arriveAt`（时间自己把这段路走完了）；
   *   ② 剩余分钟已被 `advance` 推到 0。
   *   两条都不成立 ⇒ `still-in-transit`（在途者不得被写成已到达——与 buildBlock 同一句契约）。
   *   本函数**不移动任何人**：位置是行程表算出来的，不是调用方指定的。
   *   无在途行程 ⇒ `no-journey`（不凭一句话凭空把一个人放到某处）。
   */
  function arrive(person, at) {
    const who = clean(person, 60);
    if (!who) return { ok: false, reason: 'missing-fields' };
    const g = gateOff(who);
    if (g) return g;
    const t = isFinite(Number(at)) ? Number(at) : clockNow('world');
    let out = null;
    mutate(storeOf(), function (draft) {
      const list = (draft.world && Array.isArray(draft.world.journeys)) ? draft.world.journeys : [];
      const x = list.filter(function (y) { return y && y.person === who && y.status === 'in-transit'; })[0];
      if (!x) { out = { ok: false, reason: 'no-journey', person: who }; return false; }
      const drained = isFinite(x.left) && Number(x.left) <= 0;
      const clockDone = isFinite(x.arriveAt) && Number(x.arriveAt) > 0 && t >= Number(x.arriveAt);
      if (!drained && !clockDone) {
        out = { ok: false, reason: 'still-in-transit', person: who,
          left: isFinite(x.left) ? Number(x.left) : 0,
          arriveAt: isFinite(x.arriveAt) ? Number(x.arriveAt) : 0 };
        return false;
      }
      x.status = 'arrived'; x.left = 0;
      x.spent = isFinite(x.total) ? Number(x.total) : 0;
      x.at = t;
      out = { ok: true, person: who, place: x.to, arrived: true, from: x.from, at: t };
    }, 'world:arrive');
    if (out && out.ok) { S.arrived++; S.lastReason = 'arrived'; } else if (out) S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * v2.117.0（B2 原文「旅行中的改道和中止」）：中止在途行程。
   *   **已消耗部分与未执行部分分别落账**（`spent` / `left`），且**不猜位置**——
   *   既不停在出发地、也不假装到达：`place` 一律为 null，行上标 `halted`。
   *   「把人物退回出发状态」是最贵的一类默认值：它会把一段真走过的路抹成没发生。
   */
  function stop(person, at, why) {
    const who = clean(person, 60);
    if (!who) return { ok: false, reason: 'missing-fields' };
    const g = gateOff(who);
    if (g) return g;
    const t = isFinite(Number(at)) ? Number(at) : clockNow('world');
    const w = clean(why, 40) || 'halted';
    let out = null;
    mutate(storeOf(), function (draft) {
      const list = (draft.world && Array.isArray(draft.world.journeys)) ? draft.world.journeys : [];
      const x = list.filter(function (y) { return y && y.person === who && y.status === 'in-transit'; })[0];
      if (!x) { out = { ok: false, reason: 'no-journey', person: who }; return false; }
      const total = isFinite(x.total) ? Number(x.total) : 0;
      const left = isFinite(x.left) ? Math.max(0, Number(x.left)) : 0;
      const spent = Math.max(0, total - left);
      x.status = 'halted'; x.left = left; x.spent = spent; x.why = w; x.haltedAt = t;
      out = { ok: true, person: who, status: 'halted', from: x.from, to: x.to,
        spent: spent, left: left, place: null, why: w };
    }, 'world:stop');
    if (out && out.ok) { S.halted++; S.lastReason = 'halted'; } else if (out) S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /** 人此刻在哪。在途优先于「日程落点」：在路上的人不得被写成已在目的地。 */
  /**
   * v2.117.0（B2 后半）：**此刻过不去**时的「就地等」。
   *   B1 验收样本原句：「甲得知备用路线后可以重规划，**不知道该路线的人不会凭全知信息选择它**」。
   *   本函数**只回答这个人此刻能不能走、还差什么**，不改任何状态、不换路
   *   （换路是甲拿到「有备用路线」这条情报之后的事，属于 B3 的认知面）。
   */
  function waitForChannel(channel, from, to, at) {
    const ch = clean(channel, 20), f = clean(from, 40), t = clean(to, 40);
    if (!ch || !f || !t) return { ok: false, reason: 'missing-fields' };
    const tr = transit(ch, f, t);
    if (tr.ok === true) return { ok: true, canGo: true, channel: ch, from: f, to: t, minutes: tr.minutes, factor: tr.factor, reason: 'pass' };
    S.waited++;
    return { ok: true, canGo: false, channel: ch, from: f, to: t,
      reason: tr.reason, at: tr.at || '', why: tr.why || '', by: tr.by || '',
      kind: tr.kind || '', factor: isFinite(tr.factor) ? tr.factor : 1, path: tr.path || [] };
  }
  function shipments() { return Array.isArray(node().shipments) ? node().shipments : []; }
  function messages() { return Array.isArray(node().messages) ? node().messages : []; }
  /**
   * 发一批货（B2：「货物受容量、交接和运输时间约束」）。
   *   与 `depart` 的区别：货**不认识路**，走哪条路由 `reach` 给；人走的是同一张路网，
   *   但占的是 `goods` 那一层的容量（分通道容量就是为此而设）。
   */
  function deliverGoods(from, to, item, amount, opts) {
    const f = clean(from, 40), t = clean(to, 40), it = clean(item, 30);
    const n = Number(amount);
    if (!f || !t || !it) return { ok: false, reason: 'missing-fields' };
    if (!isFinite(n) || n <= 0) return { ok: false, reason: 'bad-amount' };
    if (!settings().enabled) { S.blocked++; return { ok: false, reason: 'disabled' }; }
    const tr = transit('goods', f, t);
    if (tr.ok !== true) { S.blocked++; return tr; }
    const o = opts || {};
    const at = isFinite(Number(o.at)) ? Number(o.at) : clockNow('world');
    for (let i = 0; i + 1 < tr.path.length; i++) {
      const lim = roadCapOf(tr.path[i], tr.path[i + 1], 'goods');
      if (lim > 0 && roadUsage(tr.path[i], tr.path[i + 1], 'goods') >= lim) {
        S.blocked++;
        return { ok: false, reason: 'road-crowded', channel: 'goods', from: tr.path[i], to: tr.path[i + 1], cap: lim };
      }
    }
    const minutes = Math.round(tr.minutes * (isFinite(tr.factor) ? tr.factor : 1));
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.world = (draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world)) ? draft.world : {};
      draft.world.shipments = Array.isArray(draft.world.shipments) ? draft.world.shipments : [];
      const row = { id: 'shp_' + clockNow('world') + '_' + draft.world.shipments.length,
        channel: 'goods', from: tr.path[0], to: t, item: it, amount: Math.round(n),
        path: tr.path.slice(), total: minutes, left: minutes,
        departAt: at, arriveAt: at + minutes * 60000, status: 'in-transit', at: clockNow('world') };
      draft.world.shipments.push(row);
      WA.evict.array(draft.world.shipments, 'world.shipments');
      out = { ok: true, id: row.id, from: row.from, to: row.to, item: it, amount: row.amount,
        minutes: minutes, arriveAt: row.arriveAt, status: row.status };
    }, 'world:deliver-goods');
    if (out && out.ok) { S.goods++; S.lastReason = 'goods-sent'; } else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 发一条消息（B2：「消息是否依赖物理道路由渠道决定。数字消息不能因为一座桥关闭而必然走路延迟，
   *   送信则可以」）。`via: 'road'` 走道路（受封路与道路耗时约束）；`via: 'net'` 走网络面
   *   （**不因一座桥关闭而延迟**，但受「完全静默」级别的封锁影响）。
   */
  function sendMessage(from, to, opts) {
    const f = clean(from, 40), t = clean(to, 40);
    if (!f || !t) return { ok: false, reason: 'missing-fields' };
    if (!settings().enabled) { S.blocked++; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const via = (clean(o.via, 10) === 'net') ? 'net' : 'road';
    const at = isFinite(Number(o.at)) ? Number(o.at) : clockNow('world');
    let minutes = 0, path = [];
    if (via === 'road') {
      const tr = transit('message', f, t);
      if (tr.ok !== true) { S.blocked++; return tr; }
      minutes = Math.round(tr.minutes * (isFinite(tr.factor) ? tr.factor : 1));
      path = tr.path.slice();
    } else {
      // 网络面只认「完全静默」：目的地三通道**全被硬封**（人与货都进不去）才算断线。
      //   「消息是否依赖物理道路由渠道决定」⇒ 只封 message（桥断、驿站停）**不影响网络**。
      //   旧写法用地点级 message 封直接拦，正好把最常见的封路形态算成断网（判据形同虚设）。
      const e = deliveredBlockOf(t, at);
      const silent = !!(e.ok && e.blocked && e.blocked.person === false
        && e.blocked.goods === false && e.blocked.message === false);
      if (silent) {
        S.blocked++; S.blocks.message = (S.blocks.message || 0) + 1;
        return { ok: false, reason: 'blocked-delivered', channel: 'message', at: t, why: e.why, via: via };
      }
      minutes = isFinite(Number(o.netMinutes)) ? Math.max(1, Math.round(Number(o.netMinutes))) : 1;
      path = [f, t];
    }
    let out = null;
    mutate(storeOf(), function (draft) {
      draft.world = (draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world)) ? draft.world : {};
      draft.world.messages = Array.isArray(draft.world.messages) ? draft.world.messages : [];
      const row = { id: 'msg_' + clockNow('world') + '_' + draft.world.messages.length,
        channel: 'message', via: via, from: f, to: t, text: clean(o.text, 120),
        path: path, total: minutes, left: minutes,
        departAt: at, arriveAt: at + minutes * 60000, status: 'in-transit', at: clockNow('world') };
      draft.world.messages.push(row);
      WA.evict.array(draft.world.messages, 'world.messages');
      out = { ok: true, id: row.id, via: via, from: f, to: t, minutes: minutes, arriveAt: row.arriveAt, status: row.status };
    }, 'world:send-message');
    if (out && out.ok) { S.messages++; S.lastReason = 'message-sent'; } else S.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 按时点把到期件落成 arrived。**不做逐分钟空转**：到点即结算，未到的一格不动。
   *   为什么单独一个 tick 而不是塞进 advance(minutes)：分钟是「过了多久」，
   *   而这里判的是「现在几点了」——两个问题混在一处，就会退化成「快进 10 分钟顺手把
   *   一小时后的货也送了」。
   */
  function tickCourier(at) {
    if (!settings().enabled) { S.blocked++; return { ok: false, reason: 'disabled' }; }
    const t = isFinite(Number(at)) ? Number(at) : clockNow('world');
    const arrived = [];
    mutate(storeOf(), function (draft) {
      const w = (draft.world && typeof draft.world === 'object' && !Array.isArray(draft.world)) ? draft.world : {};
      ['shipments', 'messages'].forEach(function (k) {
        const list = Array.isArray(w[k]) ? w[k] : [];
        list.forEach(function (x) {
          if (!x || x.status !== 'in-transit') return;
          if (!(isFinite(x.arriveAt) && t >= Number(x.arriveAt))) return;
          x.status = 'arrived'; x.left = 0; x.endedAt = t;
          arrived.push(x.channel + ':' + x.from + '→' + x.to);
        });
      });
    }, 'world:tick-courier');
    S.lastReason = arrived.length ? 'courier-arrived' : 'nothing-to-do';
    return { ok: true, arrived: arrived, reason: S.lastReason, at: t };
  }
  function where(person) {
    const who = clean(person, 60);
    if (!who) return { ok: false, reason: 'missing-fields' };
    const j = activeJourney(who);
    if (j) return { ok: true, person: who, inTransit: true, from: j.from, to: j.to, left: j.left, place: null };
    // v2.117.0：中止过的行程 ⇒ 位置**未知**（既不在出发地也不在目的地）。
    //   只看最后一条行程，故「先中止、后再出发并到达」的人不会被打回未知。
    const mine = journeys().filter(function (x) { return x && x.person === who; });
    const lastJ = mine.length ? mine[mine.length - 1] : null;
    if (lastJ && lastJ.status === 'halted') {
      return { ok: true, person: who, inTransit: false, place: null, reason: 'halted',
        from: lastJ.from, to: lastJ.to, why: lastJ.why };
    }
    const done = journeys().filter(function (x) { return x && x.person === who && x.status === 'arrived'; });
    if (done.length) { const last = done[done.length - 1]; return { ok: true, person: who, inTransit: false, place: last.to, arrived: true }; }
    return { ok: true, person: who, inTransit: false, place: null, reason: 'no-journey' };
  }

  /** 推进：把共同日程按当前时间落成 planned → ongoing → done。只改状态，不凭空给人安排去处。 */
  function tick(facts) {
    const cfg = settings(); const f = facts || {};
    if (!cfg.enabled) { S.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }
    const now = isFinite(Number(f.now)) ? Number(f.now) : clockNow('world');
    let changed = 0;
    mutate(storeOf(), function (draft) {
      const list = (draft.world && Array.isArray(draft.world.events)) ? draft.world.events : [];
      list.forEach(function (e) {
        if (!e || e.status === 'done') return;
        const want = now >= e.end ? 'done' : (now >= e.start ? 'ongoing' : 'planned');
        if (want !== e.status) { e.status = want; changed++; }
      });
    }, 'world:tick');
    S.lastReason = changed ? 'advanced' : 'nothing-to-do';
    return { ok: true, changed: changed, reason: S.lastReason };
  }

  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const ps = places().slice(0, Math.max(2, cfg.maxPlaces));
    const es = events().filter(function (e) { return e && e.status !== 'done'; }).slice(0, cfg.maxEvents);
    if (!ps.length && !es.length) return '';
    const lines = [];
    if (ps.length) {
      lines.push('地点：' + ps.map(function (p) {
        const pa = clean(p.parent, 40);
        return p.name + '（' + p.kind + '）' + (pa ? '∈' + pa : '');
      }).join('｜'));
      const rs = roads().slice(0, 6);
      if (rs.length) lines.push('道路：' + rs.map(function (r) { return r.a + '↔' + r.b + ' ' + r.minutes + '分钟'; }).join('；'));
    }
    es.forEach(function (e) {
      const at = attendees(e.id);
      lines.push('共同日程：' + e.title + '（' + e.place + '，' + e.status + '）'
        + (at.ok && at.who.length ? '；到场者：' + at.who.join('、') : '；到场者：无日程依据'));
    });
    lines.push('时空约束：未登记的地点不存在、未登记的道路走不通——不得据此推断「大概很近」。');
    lines.push('地点层级（A∈B 表示 A 属于 B）只说明归属，**不说明可达**：父子之间没有登记道路时同样走不通。');
    lines.push('同一人物同一时刻只能在一处；不在名单上的人不得被写成在场（在场者只认日程证据）。');
    const js = journeys().filter(function (j) { return j && j.status === 'in-transit'; }).slice(0, Math.max(1, cfg.maxJourneys || 4));
    if (js.length) lines.push('在途：' + js.map(function (j) { return j.person + '（' + j.from + '→' + j.to + '，剩余 ' + j.left + '分钟）'; }).join('；'));
    if (js.length) lines.push('在途者既不在起点也不在终点：剩余分钟未耗尽前，不得写成已到达。');
    const hs = journeys().filter(function (j) { return j && j.status === 'halted'; }).slice(-3);
    if (hs.length) lines.push('行程中止：' + hs.map(function (j) { return j.person + '（' + j.from + '→' + j.to + '，' + (j.why || 'halted') + '）'; }).join('；'));
    if (hs.length) lines.push('中止者位置未知：不得写成已到达，也不得退回出发地（已消耗与未执行分别记账）。');
    return '[世界织体]\n' + lines.join('\n') + '\n';
  }

  WA.world = {
    PLACE_KINDS: PLACE_KINDS, EVENT_KINDS: EVENT_KINDS,
    // v2.93.0（X4）：通行三层 + 判定入口。transit 的消费方：诊断 secWorld + 面板世界页按钮。
    CHANNELS: CHANNELS, transit: transit,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addPlace: addPlace, addRoad: addRoad, reach: reach,
    addEvent: addEvent, eventsBetween: eventsBetween, attendees: attendees,
    canBeAt: canBeAt, move: move, depart: depart, advance: advance, arrive: arrive, stop: stop,
    addUse: addUse, usesOf: usesOf, useWindowOf: useWindowOf,
    // v2.117.0（B2 后半）：封锁投递 / 三层求值 / 分通道容量 / 货物与消息面 / 到时结算。
    BLOCK_SOURCES: BLOCK_SOURCES, ROAD_CHANNELS: ROAD_CHANNELS,
    addBlock: addBlock, dropBlock: dropBlock, blocksOf: function (place, at) { return liveBlocks(place, at); },
    deliveredBlockOf: deliveredBlockOf, effectiveBlockOf: effectiveBlockOf,
    // v2.117.0（B2 后半）：路段级封锁是**独立一层**，外部要能查它（不导出 = 只能封不能查）。
    roadBlockOf: roadBlockOf, closedSegment: closedSegment,
    roadCapOf: roadCapOf, roadUsage: roadUsage,
    waitForChannel: waitForChannel,
    deliverGoods: deliverGoods, shipments: shipments, shipmentsInTransit: function () { return shipments().filter(function (s) { return s && s.status === 'in-transit'; }); },
    sendMessage: sendMessage, messages: messages, messagesInTransit: function () { return messages().filter(function (m) { return m && m.status === 'in-transit'; }); },
    tickCourier: tickCourier,
    where: where, tick: tick, buildBlock: buildBlock,
    whereStat: function () {
      return { places: places().length, roads: roads().length, events: events().length,
        upcoming: events().filter(function (e) { return e && e.status !== 'done'; }).length };
    },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults), transits: Object.assign({}, stat.transits), blocks: Object.assign({}, stat.blocks) }); }
  };
  // v2.63.0 观测面：把「被拒了什么」按原因计入 stat.faults。
  //   为什么必须另立一面：拒绝是**不落盘**的——被拒的东西当然写不进存档，
  //   于是「世界没有因为一句话长出一条不存在的街」这件事在状态里完全不可见，
  //   而它恰恰是本模块存在的全部理由。
  //   实现纪律：只读观测。不改判定、不改返回结构、不新增导出成员——
  //   包在总线上而不是散进各个函数里，是为了让「有没有漏掉某条出口」在结构上不可能发生。
  (function () {
    const api = WA.world;
    if (!api) return;
    Object.keys(api).forEach(function (k) {
      const fn = api[k];
      if (typeof fn !== 'function') return;
      api[k] = function () {
        const r = fn.apply(null, arguments);
        if (r && r.ok === false && typeof r.reason === 'string' && r.reason) {
          S.faults[r.reason] = (S.faults[r.reason] || 0) + 1;
        }
        return r;
      };
    });
  })();
})();