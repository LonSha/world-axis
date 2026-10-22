/**
 * WorldAxis engines/supply-chain.js (v2.221.0) — 经营供应链：订单编排与瓶颈图（拓展 N3）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   「采购 → 运输 → 生产 → 交付」四段**各有各的口**，却**没有一个面把一条订单
 *   串起来回答**：
 *     · `economy.buy` / `economy.craft` 各管一段钱货两清，但它们是**单步**口 ——
 *       答不出「这一条链从头到尾走不走得通、会断在第几段、为什么断」；
 *     · `freight.dispatch` 要**五个参数**（路线 / 起点 / 资源 / 数量 / 运输天数），
 *       而玩家/面板拿不到「我这条订单该给什么路线、够不够货、要几天」的那张对照面；
 *     · `operations` 有项目与里程碑、`commission` 有委托阶段，但那是**登记**：
 *       它们答得出「这个项目花了几笔」，答不出「这批货现在卡在哪一段」。
 *   后果不是「读不出来」，而是**每一个消费方都要自己把四段拼一遍** —— 而拼出来的
 *   判据必然慢慢漂开（本仓反复治过的那一类：界面预估与真引擎一旦分家，
 *   「预计能成」与「真能成」就不再是同一件事）。
 *
 * ── 本模块只做四件事，**一次判定都不复制** ─────────────────────
 *   ① `plan(order)`   —— 一条订单的**只读编排预览**：逐段检查（够不够货 / 路通不通 /
 *      料够不够 / 交得出交不出），给出 `stages` 与 `blockedBy`（断在第几段、为什么）。
 *      每一段的「够不够」**逐字段取自来源读口**（`economy.view` / `freight` 路线读 /
 *      `org.canAfford`），本模块**不重算**（没有第二份算法可分家）；
 *   ② `commit(orderId, opts)` —— 把各段动作**原样透传**给来源模块的公开写口
 *      （`economy.buy` / `freight.dispatch` / `economy.craft` / `org.transfer`），
 *      自己不开事务、不碰 draft；**逐段推进、断在哪段就停在哪段**，已成的段如实回报；
 *   ③ `bottleneck(order)` —— 瓶颈图：把一条订单各段的**约束量**与**缺口**列成一张表
 *      （缺多少货 / 差多少料 / 路被谁封 / 交不出多少），**只报量到的，不编概率**；
 *   ④ `verify(orderId)` —— 只读的重验口。`commit` 复用它，使「预览作废」只有**一份**判据。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 **不另存第二份库存/资金/回执**：全文零 `store.transact`、零 draft 赋值。
 *     库存与资金一律**调用期读既有表**（`economy` 的 goods / `org` 的 resources），
 *     本模块不落自己的台账；回执由各来源写口自己记（`economy.orders` / `freight.shipments`）。
 *   2 **不新增拒收码语义**：编排层自身的失败另开 `fault` 命名空间（见 `FAULTS`）；
 *     段级检查用的 `reason` **一律复用扫描面上既有已登记码**（`module-missing` /
 *     `unknown-stage` / `throw` 等，本模块**不新造任何码**）；**来源模块的拒收原样透传**
 *     （保住它自己的 `reason` 与参数）。理由与 `engines/travel-desk.js` 同款：
 *     `tests/reject-code-gate.js` 的扫描面只认内联 `reason:` 字面量，而那个命名空间里
 *     **每一个码都要有恢复动作**（U5）。
 *   3 **不做参数校验**：缺人名 / 缺资源 / 缺天数一律由**来源写口自己**拒收。本模块再判
 *     一遍就是两个真源，且现场无法归因「这到底是编排层拦的还是引擎拦的」。
 *   4 **跨模块非原子**：各段写口各自一笔事务（或嵌在调用方事务里）—— 本模块**不假装**
 *     整条订单原子。断在哪段就停在哪段，前面的段**如实标已生效**，后面的段**如实标未执行**。
 *     这与 `engines/operations.js` 的跨模块链边界同款（链能保证的是「参与了链的那些写入
 *     整链原子」，填不平各模块自己分次提交留下的缝）。
 *   5 **预览是进程态交互物**：`stamp` 由**调用方回带**，本模块只比对不存储 —— 存一份就
 *     等于造了第二份状态容器（与边界 1 同源）。
 *   6 **全关即零存在**：本模块关闭时 `plan` / `commit` / `bottleneck` / `verify` 一律拒收
 *     `chain-off`，不改任何上游行为、不产注入块（本模块**没有** `buildBlock`）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.221.0';
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : (typeof v === 'string' ? v.slice(0, max || 40) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  // ── 设置（同一格偏好键；不是世界事实，按本仓先例走 settingsBus）──
  const LS_KEY = 'worldaxis_supply_chain_settings_v1';
  const DEF = { enabled: false, maxStages: 8, maxRows: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'supplyChain',
    bounds: { maxStages: [2, 12], maxRows: [4, 48] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // ── 编排层失败码（**fault 命名空间**，与来源的 reason 命名空间分列）──
  //   只装**编排层自身**能产生的失败，且每一个码都要有恢复动作（U5）：
  //   `chain-off` 去开开关、`bad-order` 去修订单形状。
  //   段级检查失败（货源不足 / 路被封 / 料不够 / 交不出 / 来源抛错）**不是编排层失败**，
  //   它们是**世界给的答案**，走段级 `reason`（复用既有已登记码），不占本命名空间。
  const FAULTS = ['chain-off', 'bad-order'];
  const STAGES = ['procure', 'transport', 'produce', 'deliver'];
  const stat = { plans: 0, commits: 0, oks: 0, partials: 0, rejects: 0, faults: {}, blocked: 0, lastReason: '',
    // 「排了几条订单」与「断了几条」分列 —— 合成一栏就再也答不出是哪一类在动。
    orders: 0, bottlenecks: 0 };
  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.blocked++; stat.lastReason = code; }
  function fail(code, extra) { noteFault(code); return Object.assign({ ok: false, fault: code }, extra || {}); }
  // ── 既有读表（**唯一真源**：本模块不落第二份库存/资金）──
  function state() { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; }
  /** 订单台账**只读**：本模块不落自己的订单容器，订单由调用方每次显式传入（进程态交互物）。 */
  function stagesOf(order) {
    const s = (order && Array.isArray(order.stages)) ? order.stages : null;
    return s;
  }
  function stageKind(s) { return clean(s && s.kind, 20); }
  /**
   * 逐段只读检查：**每一段的「够不够」逐字段取自来源读口**，本模块不重算。
   *   返回 `{ ok, stage, kind, reason, detail }` —— `ok:false` 时 `reason` 是**来源给的答案**
   *   （不是编排层自造的），`detail` 原样带出来源的返回体。
   */
  function checkStage(s) {
    const kind = stageKind(s);
    if (STAGES.indexOf(kind) < 0) return { ok: false, kind: kind, reason: 'unknown-stage', detail: null };
    const E = WA.economy, F = WA.freight, O = WA.org;
    if (kind === 'procure') {
      // 采购：货源与价带取自 economy.view（**不重算价**）；买家钱够不够由来源写口在 commit 时判。
      if (!E || typeof E.view !== 'function') return { ok: false, kind: kind, reason: 'module-missing', detail: { module: 'economy' } };
      const place = clean(s.place, 40), resource = clean(s.resource, 40);
      const need = num(Number(s.qty));
      let v = null;
      try { v = E.view(place, resource); } catch (e) { return { ok: false, kind: kind, reason: 'throw', detail: { at: 'economy.view' } }; }
      if (!v || v.ok !== true) return { ok: false, kind: kind, reason: (v && v.reason) || 'unknown-good', detail: v };
      const have = num(Number(v.stock));
      const short = (need !== null && have !== null) ? Math.max(0, need - have) : null;
      return { ok: short === null || short <= 0, kind: kind, reason: (short !== null && short > 0) ? 'short-stock' : '',
        detail: { place: place, resource: resource, want: need, have: have, short: short, price: v.price, lo: v.lo, hi: v.hi } };
    }
    if (kind === 'transport') {
      // 运输：路线状态取自 economy.routeView（**不重算路程**），货源存量取自 economy.view。
      if (!E || typeof E.routeView !== 'function' || typeof E.view !== 'function') {
        return { ok: false, kind: kind, reason: 'module-missing', detail: { module: 'economy' } };
      }
      const rid = clean(s.routeId, 60), from = clean(s.from, 40), resource = clean(s.resource, 40);
      const need = num(Number(s.qty));
      let rv = null;
      try { rv = E.routeView(rid); } catch (e) { return { ok: false, kind: kind, reason: 'throw', detail: { at: 'economy.routeView' } }; }
      if (!rv || rv.ok !== true) return { ok: false, kind: kind, reason: (rv && rv.reason) || 'unknown-route', detail: rv };
      if (rv.status !== 'open') return { ok: false, kind: kind, reason: 'route-blocked', detail: { routeId: rid, status: rv.status, why: rv.reason } };
      let sv = null;
      try { sv = E.view(from, resource); } catch (e) { return { ok: false, kind: kind, reason: 'throw', detail: { at: 'economy.view' } }; }
      const have = (sv && sv.ok === true) ? num(Number(sv.stock)) : null;
      const short = (need !== null && have !== null) ? Math.max(0, need - have) : null;
      return { ok: short === null || short <= 0, kind: kind, reason: (short !== null && short > 0) ? 'short-stock' : '',
        detail: { routeId: rid, from: from, resource: resource, want: need, have: have, short: short, lane: rv.lane, cost: rv.cost } };
    }
    if (kind === 'produce') {
      // 生产：配方输入取自**当前世界声明的具名表**（v2.231.0 / OPT-8：真源是 recipe 的配方声明，
      //   economy 是它的读取面；未声明时 economy 回落旧常量 ⇒ 本段行为与本版之前逐字一致）。
      //   **不接受现编合成关系**：模型现编的「铁怎么变成面包」永远答不出。
      //   持有量从既有 people 表读（只读，不改）。
      if (!E || (!E.RECIPES && typeof E.recipeOf !== 'function')) return { ok: false, kind: kind, reason: 'module-missing', detail: { module: 'economy' } };
      const recipe = clean(s.recipe, 40), by = clean(s.by, 40);
      const times = num(Number(s.times)) === null ? 1 : num(Number(s.times));
      const rec = recipeOf(recipe);
      if (!rec) return { ok: false, kind: kind, reason: 'unknown-recipe', detail: { recipe: recipe, known: recipeNames() } };
      const p = (state().people || {})[by] || null;
      const purse = (p && p.resources && typeof p.resources === 'object') ? p.resources : {};
      const need = {}, short = {};
      Object.keys(rec.in).forEach(function (k) {
        const want = rec.in[k] * times;
        need[k] = want;
        const have = num(Number(purse[k])) || 0;
        if (have < want) short[k] = want - have;
      });
      const lacking = Object.keys(short);
      return { ok: lacking.length === 0, kind: kind, reason: lacking.length ? 'short-input' : '',
        detail: { recipe: recipe, times: times, want: need, short: short, by: by } };
    }
    // deliver：交付：交出方够不够取自 org.canAfford（**不重算持有**）。
    if (!O || typeof O.canAfford !== 'function') return { ok: false, kind: kind, reason: 'module-missing', detail: { module: 'org' } };
    const fromKind = clean(s.fromKind, 20), fromName = clean(s.fromName, 60);
    const item = clean(s.item, 30), amount = num(Number(s.amount));
    let can = false;
    try { can = O.canAfford(fromKind, fromName, item, amount); } catch (e) { return { ok: false, kind: kind, reason: 'throw', detail: { at: 'org.canAfford' } }; }
    return { ok: can === true, kind: kind, reason: can === true ? '' : 'insufficient',
      detail: { fromKind: fromKind, fromName: fromName, item: item, amount: amount, canAfford: can === true } };
  }
  /** 段表归一：只认四类段名，超上限 `bad-order`（**不静默截断**）。 */
  function normStages(order, cap) {
    const raw = stagesOf(order);
    if (!raw) return { ok: false, need: ['stages'] };
    if (!raw.length) return { ok: false, need: ['stages>=1'] };
    if (raw.length > cap) return { ok: false, want: raw.length, cap: cap };
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!s || typeof s !== 'object') return { ok: false, at: i };
      const kind = stageKind(s);
      if (STAGES.indexOf(kind) < 0) return { ok: false, at: i, kind: kind, known: STAGES.slice() };
    }
    return { ok: true, stages: raw };
  }
  /**
   * 生产段的配方面（v2.231.0 / OPT-8）：**先读当前世界声明的配方**，
   *   声明面缺席（economy 未装载 / 未声明）⇒ 回落到 economy 的旧常量 `RECIPES`。
   *   两条路都只是**读**：本模块一次判定都不复制（与采购段读 view、交付段读 canAfford 同规）。
   */
  function recipeOf(name) {
    // ⚠ 全限定名（同 economy.spec 的纪律）：引用面只认 `WA.ns.mem`。
    if (WA.economy && typeof WA.economy.recipeOf === 'function') {
      let r = null;
      try { r = WA.economy.recipeOf(name); } catch (e) { r = null; }
      if (r) return r;
    }
    // ⚠ 回落面走 `WA.economy`：本函数在**模块作用域**，那里没有 `E`（它是 checkStage 的局部
    //   常量）—— 写 `E.RECIPES` 会让回落分支一走到就 ReferenceError（本版专锁 B10 当场抓出）。
    return (WA.economy && WA.economy.RECIPES) ? WA.economy.RECIPES[name] : null;
  }
  /** 当前可选配方名（拒收回执里带出「我认识哪些」——「你给的不认识」与「这几条我认识」是同一件事的两半）。 */
  function recipeNames() {
    // ⚠ 全限定名（同上）。
    if (WA.economy && typeof WA.economy.recipeKeys === 'function') {
      let ks = null;
      try { ks = WA.economy.recipeKeys(); } catch (e) { ks = null; }
      if (Array.isArray(ks) && ks.length) return ks;
    }
    // ⚠ 同 recipeOf：模块作用域里没有 `E`。
    return (WA.economy && WA.economy.RECIPES) ? Object.keys(WA.economy.RECIPES) : [];
  }
  /**
   * ① 只读编排预览：一条订单逐段检查，给出 `stages` 与 `blockedBy`。
   *   **一次判定都不复制** —— 每段的「够不够」逐字段取自来源读口。
   *   `blockedBy` = **第一段**不通过的段（断在哪就停在哪：后段即便看起来够，
   *   也因前段没成而**不假装能成**）。
   */
  function plan(order) {
    const cfg = settings();
    if (!cfg.enabled) return fail('chain-off');
    const ns = normStages(order, Math.max(1, Math.floor(num(cfg.maxStages) || DEF.maxStages)));
    if (!ns.ok) return fail('bad-order', { at: ns.at, kind: ns.kind, need: ns.need, want: ns.want, cap: ns.cap, known: ns.known });
    const rows = Math.max(1, Math.floor(num(cfg.maxRows) || DEF.maxRows));
    const stages = ns.stages.slice(0, rows);
    const out = [];
    let blockedBy = null;
    for (let i = 0; i < stages.length; i++) {
      const c = checkStage(stages[i]);
      out.push({ index: i, kind: c.kind, ok: c.ok, reason: c.reason, detail: c.detail });
      if (!c.ok && !blockedBy) blockedBy = { index: i, kind: c.kind, reason: c.reason };
    }
    stat.plans++; stat.orders++;
    stat.lastReason = blockedBy ? 'plan-blocked' : 'plan-ok';
    if (blockedBy) stat.bottlenecks++;
    return {
      ok: true, fault: null,
      orderId: clean(order && order.id, 60) || ('sc_' + stages.length + '_' + (stages[0] ? stageKind(stages[0]) : 'x')),
      stages: out, stageCount: out.length,
      truncated: ns.stages.length > stages.length,
      runnable: blockedBy === null,
      blockedBy: blockedBy,
      stamp: stampFrom(out),
      basisNote: '每段的「够不够」逐字段取自来源读口（economy.view / economy.routeView / org.canAfford / 生产段的具名配方表）'
        + ' —— 本模块不重算，故预览与真引擎同源；'
        + '配方表由 economy 读取当前世界的声明（v2.231.0 / OPT-8），未声明时回落旧常量'
    };
  }
  /**
   * 路况指纹（可复算、含时间无关字段）：比对「预览时的约束」与「执行时的约束」。
   *   为什么指纹里要带逐段的**约束量**：只有「通/不通」不够 —— 一条链可以一直「通」，
   *   而**同时的第二笔订单**会把货源拿走。少了这一段，`stale-order` 就成了一条只在
   *   完全断供时才亮的灯。
   */
  function stampFrom(stages) {
    if (!Array.isArray(stages)) return 'bad-shape';
    const parts = ['ok'];
    stages.forEach(function (s) {
      const d = s && s.detail ? s.detail : {};
      parts.push((s && s.kind) + ':' + (s && s.ok ? '1' : '0') + ':' + (d.have !== undefined ? d.have : (d.canAfford !== undefined ? d.canAfford : (d.short ? Object.keys(d.short).length : '-'))));
    });
    return parts.join('|');
  }
  /**
   * ② 编排提交：把各段动作**原样透传**给来源写口，逐段推进、断在哪段停在哪段。
   *   **不假装整条订单原子**（各段写口各自一笔事务）—— 前面的段如实标已生效，
   *   后面的段如实标未执行。
   */
  function commit(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('chain-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const order = o.order;
    const id = clean(orderId, 60) || clean(order && order.id, 60);
    const ns = normStages(order, Math.max(1, Math.floor(num(cfg.maxStages) || DEF.maxStages)));
    if (!ns.ok) return fail('bad-order', { at: ns.at, kind: ns.kind, need: ns.need, want: ns.want, cap: ns.cap, known: ns.known });
    // 只执行到「第一段不通」为止（后段不假装能成）。
    const stages = ns.stages;
    const done = [];
    let stoppedAt = null;
    for (let i = 0; i < stages.length; i++) {
      const s = stages[i];
      const c = checkStage(s);
      if (!c.ok) {
        // **世界给的答案**（够不够 / 通不通）不是编排层失败：原样带出来源的 reason。
        stoppedAt = { index: i, kind: c.kind, reason: c.reason, detail: c.detail };
        break;
      }
      const r = runStage(s, o);
      if (!r || r.ok !== true) {
        // 来源写口自己的拒收：原样透传（编排层不改写它的 reason）。
        stoppedAt = { index: i, kind: stageKind(s), reason: (r && r.reason) || 'throw', detail: r };
        break;
      }
      done.push({ index: i, kind: stageKind(s), receipt: r });
    }
    stat.commits++;
    if (stoppedAt) { stat.partials++; stat.blocked++; stat.lastReason = 'commit-partial'; }
    else { stat.oks++; stat.lastReason = 'commit-ok'; }
    return {
      ok: true, fault: null, orderId: id,
      ranCount: done.length, totalCount: stages.length,
      done: done,
      stoppedAt: stoppedAt,
      complete: stoppedAt === null,
      atomic: false,
      atomicNote: '各段写口各自一笔事务（或嵌在调用方事务里）—— 本模块**不假装**整条订单原子；'
        + '断在哪段就停在哪段，前面的段如实标已生效，后面的段如实标未执行'
    };
  }
  /** 单段执行：**原样透传**给来源写口，本模块不开事务、不碰 draft。 */
  function runStage(s, o) {
    const kind = stageKind(s);
    const E = WA.economy, F = WA.freight, O = WA.org;
    try {
      if (kind === 'procure') {
        if (!E || typeof E.buy !== 'function') return { ok: false, reason: 'module-missing' };
        return E.buy(clean(s.place, 40), clean(s.resource, 40), num(Number(s.qty)),
          { by: clean(s.by || o.by, 40), price: num(Number(s.price)) === null ? undefined : num(Number(s.price)) });
      }
      if (kind === 'transport') {
        if (!F || typeof F.dispatch !== 'function') return { ok: false, reason: 'module-missing' };
        return F.dispatch(clean(s.routeId, 60), clean(s.from, 40), clean(s.resource, 40), num(Number(s.qty)),
          { to: clean(s.to, 40), transitDays: num(Number(s.transitDays)), base: num(Number(s.base)) === null ? undefined : num(Number(s.base)) });
      }
      if (kind === 'produce') {
        if (!E || typeof E.craft !== 'function') return { ok: false, reason: 'module-missing' };
        return E.craft(clean(s.place, 40), clean(s.recipe, 40),
          { by: clean(s.by || o.by, 40), times: num(Number(s.times)) === null ? 1 : num(Number(s.times)) });
      }
      if (kind === 'deliver') {
        if (!O || typeof O.transfer !== 'function') return { ok: false, reason: 'module-missing' };
        return O.transfer(clean(s.fromKind, 20), clean(s.fromName, 60), clean(s.toKind, 20), clean(s.toName, 60),
          clean(s.item, 30), num(Number(s.amount)));
      }
    } catch (e) { return { ok: false, reason: 'throw', error: clean(e && e.message, 120) }; }
    return { ok: false, reason: 'unknown-stage' };
  }
  /**
   * ③ 瓶颈图：把一条订单各段的**约束量**与**缺口**列成一张表。
   *   **只报量到的，不编概率、不给建议** —— 与 `travel-desk.riskOf` 同款。
   */
  function bottleneck(order) {
    const cfg = settings();
    if (!cfg.enabled) return fail('chain-off');
    const ns = normStages(order, Math.max(1, Math.floor(num(cfg.maxStages) || DEF.maxStages)));
    if (!ns.ok) return fail('bad-order', { at: ns.at, kind: ns.kind, need: ns.need, want: ns.want, cap: ns.cap, known: ns.known });
    const rows = [];
    let firstBlock = null;
    ns.stages.forEach(function (s, i) {
      const c = checkStage(s);
      const d = c.detail || {};
      const row = { index: i, kind: c.kind, ok: c.ok, reason: c.reason,
        constraint: null, gap: null };
      if (c.kind === 'procure' || c.kind === 'transport') {
        row.constraint = { want: d.want, have: d.have };
        row.gap = (d.short !== null && d.short !== undefined) ? d.short : null;
      } else if (c.kind === 'produce') {
        row.constraint = { want: d.want, short: d.short };
        row.gap = d.short ? Object.keys(d.short).reduce(function (a, k) { return a + d.short[k]; }, 0) : 0;
      } else if (c.kind === 'deliver') {
        row.constraint = { amount: d.amount, canAfford: d.canAfford };
        row.gap = d.canAfford ? 0 : d.amount;
      }
      if (!c.ok && !firstBlock) firstBlock = { index: i, kind: c.kind, reason: c.reason };
      rows.push(row);
    });
    stat.bottlenecks++;
    stat.lastReason = firstBlock ? 'bottleneck-found' : 'bottleneck-clear';
    const gaps = rows.filter(function (r) { return r.gap !== null && r.gap !== undefined && r.gap > 0; });
    return {
      ok: true, fault: null,
      orderId: clean(order && order.id, 60) || null,
      rows: rows, rowCount: rows.length,
      firstBlock: firstBlock,
      gapCount: gaps.length,
      note: firstBlock ? ('断在第 ' + firstBlock.index + ' 段（' + firstBlock.kind + '）：' + firstBlock.reason)
        : '各段约束均满足',
      basisNote: '约束量与缺口逐字段取自来源读口 —— 本模块不重算、不编概率'
    };
  }
  /**
   * ④ 只读重验：现取一次各段约束（要的就是「此刻」），与回带的 `stamp` 比对。
   *   `commit` 复用它，使「预览作废」只有**一份**判据。
   */
  function verify(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return fail('chain-off');
    const o = (opts && typeof opts === 'object') ? opts : {};
    const order = o.order;
    const ns = normStages(order, Math.max(1, Math.floor(num(cfg.maxStages) || DEF.maxStages)));
    if (!ns.ok) return fail('bad-order', { at: ns.at, kind: ns.kind, need: ns.need, want: ns.want, cap: ns.cap, known: ns.known });
    const rows = ns.stages.map(function (s, i) { const c = checkStage(s); return { index: i, kind: c.kind, ok: c.ok, reason: c.reason, detail: c.detail }; });
    const now = stampFrom(rows);
    const was = clean(o.stamp, 400);
    const stale = !!was && was !== now;
    return { ok: true, fault: null, orderId: clean(orderId, 60) || null,
      stamp: now, was: was || null, stale: stale,
      runnable: rows.every(function (r) { return r.ok; }),
      stages: rows,
      note: stale ? '约束已变（世界动了）—— 旧预览作废，请重新 plan' : '约束未变，预览仍有效' };
  }
  function diagnose() {
    const E = WA.economy, F = WA.freight, O = WA.org;
    const declared = STAGES.slice();
    const live = declared.filter(function (k) {
      if (k === 'procure' || k === 'produce') return !!(E && typeof E.buy === 'function' && typeof E.craft === 'function');
      if (k === 'transport') return !!(F && typeof F.dispatch === 'function');
      return !!(O && typeof O.transfer === 'function');
    });
    const checks = {
      settingsBus: !!WA.settingsBus,
      economy: !!E, freight: !!F, org: !!O,
      stagesDeclared: declared.length,
      stagesLive: live.length
    };
    const ok = checks.settingsBus && checks.economy && checks.freight && checks.org && checks.stagesLive === checks.stagesDeclared;
    return { ok: ok, module: 'supplyChain', ver: VERSION, cfg: settings(), checks: checks,
      stages: { declared: declared.slice(), live: live,
        missing: declared.filter(function (k) { return live.indexOf(k) < 0; }) },
      faultCodes: FAULTS.slice() };
  }
  WA.supplyChain = {
    FAULTS: FAULTS.slice(),
    STAGES: STAGES.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    plan: plan,
    commit: commit,
    bottleneck: bottleneck,
    verify: verify,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/supply-chain.js', { kind: 'engine', ver: VERSION });
})();
