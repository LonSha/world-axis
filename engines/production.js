/**
 * WorldAxis engines/production.js (v2.231.0) — EXP-3：持续生产与经营
 *
 * ── 它治什么（缺口，开工前逐条复核现场）────────────────────────────────
 *   计划原文：「**生产工单、设施容量、人员班次、工期、原料预留/消耗、停工与复工**，
 *   完成后向库存交货并接到现有订单/运输。**即时 craft 保留原意，新工单显式启用**。」
 *   验收原文：「两日生产订单，**首日不出货**；**缺料暂停、补料继续**；完工后**仅入库一次**
 *   并交给既有物流；**人员不能同一时段被两个满额工位占用**。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/economy.js` 的 `craft` 是**即时扣料出货**（一笔事务里扣进料、出货、
 *       记一条 `orders` 流水）—— 答得出「这一刻做了两个面包」，答不出「这炉要烧两天、
 *       今天只烧了一天」；
 *     · `engines/supply-chain.js` 的 `plan` 是**只读编排预览**（`commit` 逐段透传写口），
 *       它自己「零 `store.transact`」—— 连一条在产记录都不落；
 *     · `engines/operations.js` 管批准 → 立项 → 拨付 → 周期结算，是**资源与项目**那一层，
 *       不记「哪个工位今天在产什么」；
 *     · `engines/freight.js` 管「货从哪发到哪」，`engines/org.js` 管资源账本。
 *   全库扫「工单 / 工期 / 班次 / 设施容量 / 停工 / 复工」：`班次` 零命中，`工单` 只出现在
 *   三处**注释**里（checkpoints / tool-snapshot / world 的那句「开工单解封」是比喻）。
 *   合起来就是本项要补的那一格：**世界能生产，但没有「正在生产」这件事**。
 *
 * ── 机制（六句话）──────────────────────────────────────────────────
 *   ① **工单跨日**（`store.production.jobs`）：`open()` 开一张单，带**工期**（`days`）
 *      与已推进天数（`done`）。两日单在 `advance()` 一天之后 `done=1 < days=2` ⇒
 *      状态仍是 `running`、**交不出货**（`not-done`）—— 验收原文点名的「首日不出货」。
 *   ② **原料预留**：`resupply()` 把料从某人的资源面扣进这张单自己的 `reserve` 池
 *      （预留 = 从别人手里拿出来、专供这一单）；手里不够 ⇒ `short-input`（不赊账）。
 *   ③ **缺料暂停、补料继续**：`advance()` 逐日先看 `reserve` + 开工者手头够不够当天那份，
 *      不够 ⇒ 工单**当场转 `paused`** 并如实报 `short-input`（带出缺哪样、缺多少、第几天）；
 *      `resupply()` 补料 → `resume()` 复工 → `advance()` 接着走（验收原文点名）。
 *   ④ **人员班次**：`staff(orderId, who, {shift})` 排班。同一个人**同一时段**不能被两张
 *      未完结工单同时占用 ⇒ `shift-conflict`（验收原文点名）。
 *   ⑤ **设施容量**：`declareFacility(name, {slots})` 声明工位数；`open()` 时该设施上
 *      处于 `running/paused` 的单数 ≥ `slots` ⇒ `facility-full`（同一时段占不满两格）。
 *   ⑥ **完工只入库一次**：`deliver()` 走 `WA.economy.stock`（**不建第二份库存真源**），
 *      再交一次 ⇒ `order-delivered`（不重复入库）；给了 `routeId` 时顺带调
 *      `WA.freight.dispatch` —— 「交给既有物流」不是本模块自建一条运输。
 *
 * ── 十二条否定式边界（每条都有判据咬）────────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`。
 *   ② **不建第二份库存真源**：交货走 `economy.stock`、运输走 `freight.dispatch`；
 *      本模块只记「这张单在产什么、走到第几天、占着哪个工位」。
 *   ③ **不建第二份配方真源**：配方名必须能在 `economy.recipeOf` 里查到
 *      （`unknown-recipe`）—— 含 OPT-8 之后由题材声明的扩展配方。
 *   ④ **不建第二份名册**：开工者 / 补料者 / 排班者必须是世界里的人物（`unknown-worker`）。
 *   ⑤ **设施按需声明**：没声明过的设施 ⇒ `no-such-facility`（不静默收下一张自造设施上的单）。
 *   ⑥ **工位不超卖**：见 ⑤ 的容量判据（`facility-full`）。
 *   ⑦ **同一人同一时段不双占**：见 ④ 的班次判据（`shift-conflict`）。
 *   ⑧ **工期不静默**：`days` 非法 ⇒ `bad-days`；超上限一律夹取并如实报 `clamped`。
 *   ⑨ **即时 craft 保留原意**：本模块**不改** `economy.craft` 的任何行为
 *      （那是「这一刻做成了」），新工单显式启用（开关默认关）。
 *   ⑩ **暂停不是完成**：`paused` 的单交不出货（`not-done`），也不产出一格。
 *   ⑪ **取消要退料**：`cancel()` 把 `reserve` 里剩下的料退回开工者手里（不吞料），
 *      已推进的天数**如实留在回执里**（不假装没发生）。
 *   ⑫ **存档是唯一真源**（`store.production`）：`reload()` 从存档重建（切聊天必须重建）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_production_settings_v1';
  const DEF = { enabled: false, maxJobs: 48, maxFacilities: 12, maxCrew: 8, maxDays: 90 };
  const __REG = { key: LS_KEY, def: DEF, module: 'production',
    bounds: { maxJobs: [4, 200], maxFacilities: [1, 48], maxCrew: [1, 24], maxDays: [1, 365] } };
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
  // ── 状态封闭集（自造一个 ⇒ 拒收；与 gear 的携带三态同规）──
  const STATUSES = ['running', 'paused', 'done', 'delivered', 'cancelled'];
  // 占着工位的状态：**已完成 / 已交付 / 已取消不占工位**
  //   （否则「工位满」会在单子做完之后仍然为真 —— 那是读数在骗人，不是世界在忙）。
  const OPEN_STATUS = ['running', 'paused'];
  const stat = { opened: 0, staffed: 0, resupplied: 0, advanced: 0, paused: 0, resumed: 0,
    delivered: 0, cancelled: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const p = (root || state()).production;
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
  }
  function jobsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.jobs)) ? b.jobs : []; }
  function facsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.facilities)) ? b.facilities : []; }
  function ensure(draft) {
    if (!draft.production || typeof draft.production !== 'object' || Array.isArray(draft.production)) {
      draft.production = { jobs: [], facilities: [] };
    }
    if (!Array.isArray(draft.production.jobs)) draft.production.jobs = [];
    if (!Array.isArray(draft.production.facilities)) draft.production.facilities = [];
    return draft.production;
  }
  function jobOf(id, root) {
    const k = clean(id, 60);
    return jobsOf(root).filter(function (x) { return x && clean(x.id, 60) === k; })[0] || null;
  }
  function facOf(name, root) {
    const k = clean(name, 40);
    return facsOf(root).filter(function (f) { return f && clean(f.name, 40) === k; })[0] || null;
  }
  function personExists(who, root) {
    const w = clean(who, 60);
    if (!w) return false;
    const ppl = (root || state()).people || {};
    if (ppl['p_' + w]) return true;
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      if (ppl[keys[i]] && clean(ppl[keys[i]].name, 60) === w) return true;
    }
    return false;
  }
  /** 某人的资源面（**只读引用**：拿到的是存档里的那个对象，调用方自己决定动不动手）。 */
  function purseOf(who, root) {
    const w = clean(who, 60);
    if (!w) return null;
    const ppl = (root || state()).people || {};
    if (ppl['p_' + w]) return ppl['p_' + w].resources || null;
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      if (ppl[keys[i]] && clean(ppl[keys[i]].name, 60) === w) return ppl[keys[i]].resources || null;
    }
    return null;
  }
  function haveOf(pur, material) { return (pur && typeof pur === 'object') ? (num(pur[material]) || 0) : 0; }
  function drawRes(pur, material, qty) {
    if (!pur || typeof pur !== 'object') return false;
    if (haveOf(pur, material) < qty) return false;
    pur[material] = +((haveOf(pur, material) - qty).toFixed(3));
    return true;
  }
  function addRes(pur, material, qty) {
    if (!pur || typeof pur !== 'object') return 0;
    pur[material] = +((haveOf(pur, material) + qty).toFixed(3));
    return pur[material];
  }
  /**
   * 配方读口：**先读当前世界声明的配方**（economy.recipeOf 已含 OPT-8 的题材声明面），
   *   声明面缺席 ⇒ 回落 economy 的旧常量 `RECIPES`。两条路都只是**读**。
   *   ⚠ 全限定名：本仓引用面（inventory 的 REF_RE）只认 `WA.ns.mem`。
   */
  function recipeOf(name) {
    if (WA.economy && typeof WA.economy.recipeOf === 'function') {
      let r = null;
      try { r = WA.economy.recipeOf(name); } catch (e) { r = null; }
      if (r) return r;
    }
    return (WA.economy && WA.economy.RECIPES) ? WA.economy.RECIPES[clean(name, 40)] : null;
  }
  function recipeNames() {
    if (WA.economy && typeof WA.economy.recipeKeys === 'function') {
      let ks = null;
      try { ks = WA.economy.recipeKeys(); } catch (e) { ks = null; }
      if (Array.isArray(ks) && ks.length) return ks;
    }
    return (WA.economy && WA.economy.RECIPES) ? Object.keys(WA.economy.RECIPES) : [];
  }
  /** 当天要消耗的那一份（整单用量 ÷ 工期，保留三位小数）。 */
  function perDay(rec, qty, days) {
    const out = {};
    Object.keys(rec.in).forEach(function (k) {
      out[k] = +(((rec.in[k] * qty) / days).toFixed(3));
    });
    return out;
  }
  function wholeNeed(rec, qty) {
    const out = {};
    Object.keys(rec.in).forEach(function (k) { out[k] = +(rec.in[k] * qty).toFixed(3); });
    return out;
  }
  function openOnFacility(fac, root) {
    if (!fac) return 0;
    const k = clean(fac, 40);
    return jobsOf(root).filter(function (j) {
      return j && clean(j.facility, 40) === k && OPEN_STATUS.indexOf(clean(j.status, 12)) >= 0;
    }).length;
  }
  /** 世界声明一个生产设施（**按需启用**：没声明的设施上开不出工单）。 */
  function declareFacility(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const nm = clean(name, 40);
    if (!nm) return refuse('missing-fields', { field: 'name' });
    let slots = num(o.slots) === null ? 1 : Math.floor(num(o.slots));
    let clamped = false;
    if (!(slots >= 1)) slots = 1;
    if (slots > cfg.maxCrew) { slots = cfg.maxCrew; clamped = true; }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const seen = b.facilities.filter(function (f) { return f && clean(f.name, 40) === nm; })[0] || null;
      if (!seen && b.facilities.length >= cfg.maxFacilities) {
        out = { ok: false, reason: 'facilities-full', cap: cfg.maxFacilities }; return false;
      }
      const now = clockNow('production');
      if (seen) { seen.slots = slots; seen.label = clean(o.label, 40) || nm; seen.updatedAt = now;
        out = { ok: true, name: nm, slots: slots, replaced: true, clamped: clamped }; }
      else { b.facilities.push({ name: nm, label: clean(o.label, 40) || nm, slots: slots, at: now, updatedAt: now });
        out = { ok: true, name: nm, slots: slots, replaced: false, clamped: clamped }; }
      return true;
    }, 'production:facility');
    if (out && out.ok) { stat.lastReason = 'facility-declared'; if (clamped) noteFault('clamped'); }
    return out || refuse('store-unavailable');
  }
  /**
   * 开一张生产工单（**跨日运行**）：指定配方、产量、工期、设施与开工者。
   *   ① 配方必须能在当前世界的配方表里查到（不建第二份配方真源）；
   *   ② 设施必须已声明（按需启用），且该设施上的未完结单数未到 `slots`（工位不超卖）；
   *   ③ 工单**不开工即出料**：产出要等 `done >= days` 之后由 `deliver()` 入库。
   */
  function open(spec, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const o = opts || {};
    const recipe = clean(s.recipe, 40), by = clean(s.by, 60), facility = clean(s.facility, 40);
    if (!recipe || !by) return refuse('missing-fields', { field: !recipe ? 'recipe' : 'by' });
    const qty = num(s.qty) === null ? 1 : num(s.qty);
    if (!(qty >= 1) || (qty | 0) !== qty) return refuse('bad-qty', { qty: s.qty });
    let days = num(s.days) === null ? 1 : Math.floor(num(s.days));
    if (!(days >= 1)) return refuse('bad-days', { days: s.days });
    let clamped = false;
    if (days > cfg.maxDays) { days = cfg.maxDays; clamped = true; }
    if (!personExists(by)) return refuse('unknown-worker', { by: by });
    const rec = recipeOf(recipe);
    if (!rec) return refuse('unknown-recipe', { recipe: recipe, known: recipeNames() });
    if (WA.research) {
      const access = WA.research.canUse(by, recipe, { manufacture: true });
      if (!access.ok) return access;
    }
    if (facility && !facOf(facility)) return refuse('no-such-facility', { facility: facility,
      declared: facsOf().map(function (f) { return f.name; }) });
    if (facility) {
      const fac = facOf(facility);
      const used = openOnFacility(facility);
      if (used >= (num(fac.slots) || 1)) {
        return refuse('facility-full', { facility: facility, used: used, slots: num(fac.slots) || 1 });
      }
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      if (b.jobs.length >= cfg.maxJobs) { out = { ok: false, reason: 'jobs-full', cap: cfg.maxJobs }; return false; }
      const now = clockNow('production');
      const id = 'pj_' + now + '_' + b.jobs.length;
      const row = { id: id, recipe: recipe, qty: qty, days: days, done: 0, status: 'running',
        facility: facility, place: clean(s.place, 40), by: by, crew: [], reserve: {},
        label: clean(o.label, 60), at: now, startedAt: now, updatedAt: now,
        finishedAt: 0, deliveredAt: 0, pausedAt: 0, pausedReason: '',
        // 已入库账（幂等）：产物名 → 已入库数量。空对象表示一样都没进库。
        delivered: {} };
      b.jobs.push(row);
      WA.evict.array(b.jobs, 'production.jobs', cfg.maxJobs);
      out = { ok: true, id: id, recipe: recipe, qty: qty, days: days, done: 0, status: 'running',
        facility: facility, by: by, perDay: perDay(rec, qty, days), need: wholeNeed(rec, qty),
        clamped: clamped };
      return true;
    }, 'production:open');
    if (out && out.ok) { stat.opened++; stat.lastReason = 'opened'; if (clamped) noteFault('clamped'); }
    return out || refuse('store-unavailable');
  }
  /**
   * 排班：把某人按**时段**（`shift`，默认 `day`）挂到这张单上。
   *   同一个人同一时段不能被两张未完结单同时占用（`shift-conflict`）。
   */
  function staff(orderId, who, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const j = jobOf(orderId);
    if (!j) return refuse('unknown-order', { id: orderId });
    if (OPEN_STATUS.indexOf(clean(j.status, 12)) < 0) return refuse('order-closed', { id: j.id, status: j.status });
    const w = clean(who, 60);
    if (!w) return refuse('missing-fields', { field: 'who' });
    if (!personExists(w)) return refuse('unknown-worker', { who: w });
    const shift = clean(o.shift, 20) || 'day';
    const crew = Array.isArray(j.crew) ? j.crew : [];
    const already = crew.filter(function (c) { return c && clean(c.who, 60) === w && clean(c.shift, 20) === shift; })[0] || null;
    if (!already && crew.length >= cfg.maxCrew) return refuse('crew-full', { id: j.id, cap: cfg.maxCrew });
    // 同一人 + 同一时段，被**另一张未完结单**占着 ⇒ 冲突（验收原文点名）。
    const clash = jobsOf().filter(function (x) {
      if (!x || x === j) return false;
      if (OPEN_STATUS.indexOf(clean(x.status, 12)) < 0) return false;
      const cs = Array.isArray(x.crew) ? x.crew : [];
      return cs.some(function (c) { return c && clean(c.who, 60) === w && clean(c.shift, 20) === shift; });
    })[0] || null;
    if (clash) return refuse('shift-conflict', { who: w, shift: shift, busy: clash.id });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-order', id: j.id }; return false; }
      if (OPEN_STATUS.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'order-closed', id: row.id, status: row.status }; return false; }
      if (!Array.isArray(row.crew)) row.crew = [];
      const seen = row.crew.filter(function (c) { return c && clean(c.who, 60) === w && clean(c.shift, 20) === shift; })[0] || null;
      if (seen) { seen.updatedAt = clockNow('production'); out = { ok: true, id: row.id, who: w, shift: shift, replaced: true, crew: row.crew.length }; return true; }
      row.crew.push({ who: w, shift: shift, at: clockNow('production'), updatedAt: clockNow('production') });
      out = { ok: true, id: row.id, who: w, shift: shift, replaced: false, crew: row.crew.length };
      return true;
    }, 'production:staff');
    if (out && out.ok) { stat.staffed++; stat.lastReason = 'staffed'; }
    return out || refuse('store-unavailable');
  }
  /** 预留料：把 `material × amount` 从 `by` 手里扣进这张单自己的预留池。 */
  function resupply(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const j = jobOf(orderId);
    if (!j) return refuse('unknown-order', { id: orderId });
    if (OPEN_STATUS.indexOf(clean(j.status, 12)) < 0) return refuse('order-closed', { id: j.id, status: j.status });
    const material = clean(o.material, 40), by = clean(o.by, 60) || clean(j.by, 60);
    const amount = num(o.amount) === null ? 1 : num(o.amount);
    if (!material || !(amount > 0)) return refuse('missing-fields', { field: !material ? 'material' : 'amount' });
    if (!personExists(by)) return refuse('unknown-worker', { by: by });
    const purse = purseOf(by);
    if (haveOf(purse, material) < amount) {
      return refuse('short-input', { id: j.id, material: material, need: amount,
        have: haveOf(purse, material), by: by });
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-order', id: j.id }; return false; }
      if (OPEN_STATUS.indexOf(clean(row.status, 12)) < 0) { out = { ok: false, reason: 'order-closed', id: row.id, status: row.status }; return false; }
      const pe = draft.people || {};
      let pur = null;
      if (pe['p_' + by]) pur = pe['p_' + by].resources;
      else Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === by) pur = pe[k].resources; });
      if (!pur) pur = (pe['p_' + by] = { id: 'p_' + by, name: by, resources: {} }).resources;
      if (haveOf(pur, material) < amount) {
        out = { ok: false, reason: 'short-input', material: material, need: amount, have: haveOf(pur, material) };
        return false;
      }
      drawRes(pur, material, amount);
      if (!row.reserve || typeof row.reserve !== 'object') row.reserve = {};
      addRes(row.reserve, material, amount);
      row.updatedAt = clockNow('production');
      out = { ok: true, id: row.id, material: material, amount: amount, by: by, reserve: Object.assign({}, row.reserve) };
      return true;
    }, 'production:resupply');
    if (out && out.ok) { stat.resupplied++; stat.lastReason = 'resupplied'; }
    return out || refuse('store-unavailable');
  }
  /**
   * 推进工期：逐日消耗当天那一份料（**先吃预留池、再吃开工者手头**）。
   *   哪一天凑不出 ⇒ 工单当场转 `paused`（`short-input` 如实带出缺哪样、缺多少、第几天），
   *   已推进的天数**照实保留**（不倒退、不静默吞天）。
   */
  function advance(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const j = jobOf(orderId);
    if (!j) return refuse('unknown-order', { id: orderId });
    const st = clean(j.status, 12);
    if (st === 'paused') return refuse('order-paused', { id: j.id, why: j.pausedReason || 'short-input',
      hint: '先补料再复工（resume），暂停的单不推进工期' });
    if (st !== 'running') return refuse('order-closed', { id: j.id, status: st });
    let steps = num(o.days) === null ? 1 : Math.floor(num(o.days));
    if (!(steps >= 1)) return refuse('bad-days', { days: o.days });
    const rec = recipeOf(clean(j.recipe, 40));
    if (!rec) return refuse('unknown-recipe', { recipe: j.recipe });
    const days = num(j.days) || 1;
    const need = perDay(rec, num(j.qty) || 1, days);
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-order', id: j.id }; return false; }
      if (clean(row.status, 12) !== 'running') {
        out = { ok: false, reason: clean(row.status, 12) === 'paused' ? 'order-paused' : 'order-closed',
          id: row.id, status: row.status };
        return false;
      }
      const pe = draft.people || {};
      const by = clean(row.by, 60);
      let pur = null;
      if (pe['p_' + by]) pur = pe['p_' + by].resources;
      else Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === by) pur = pe[k].resources; });
      if (!row.reserve || typeof row.reserve !== 'object') row.reserve = {};
      let moved = 0;
      for (let i = 0; i < steps; i++) {
        if (num(row.done) >= num(row.days)) break;
        // 当天那一份：逐样先看总量够不够（**先判后动**，不够就一格都不扣）
        const mats = Object.keys(need);
        let lack = null;
        for (let k = 0; k < mats.length; k++) {
          const m = mats[k];
          const pool = num(row.reserve[m]) || 0;
          const avail = pool + haveOf(pur, m);
          if (avail < need[m]) { lack = { material: m, need: need[m], have: +avail.toFixed(3), pool: pool }; break; }
        }
        if (lack) {
          row.status = 'paused';
          row.pausedAt = clockNow('production');
          row.pausedReason = 'short-input';
          row.updatedAt = row.pausedAt;
          stat.paused++;
          noteFault('short-input');
          out = { ok: false, reason: 'short-input', id: row.id, status: 'paused', day: (num(row.done) || 0) + 1,
            material: lack.material, need: lack.need, have: lack.have, pool: lack.pool, moved: moved,
            note: '缺料暂停：这一天的料凑不出来 ⇒ 工单停在 paused，已推进的天数照实保留' };
          // ⚠ 这一次事务必须**提交**（return true）：暂停本身就是一次状态写入。
          //   return false 会把整张草稿回滚 —— 返回体说 paused、存档里还是 running，
          //   list/view 全读到假状态（本版实测抓出：缺料暂停后 stored status 仍是 running）。
          return true;
        }
        // 先吃预留池、再吃开工者手头
        for (let k = 0; k < mats.length; k++) {
          const m = mats[k];
          let want = need[m];
          const pool = num(row.reserve[m]) || 0;
          const fromPool = Math.min(pool, want);
          if (fromPool > 0) { row.reserve[m] = +((pool - fromPool).toFixed(3)); want = +(want - fromPool).toFixed(3); }
          if (want > 0 && pur) drawRes(pur, m, want);
        }
        row.done = (num(row.done) || 0) + 1;
        moved++;
        if (num(row.done) >= num(row.days)) {
          row.status = 'done';
          row.finishedAt = clockNow('production');
        }
        row.updatedAt = clockNow('production');
      }
      const made = {};
      Object.keys(rec.out).forEach(function (k) { made[k] = +(rec.out[k] * (num(row.qty) || 1)).toFixed(3); });
      out = { ok: true, id: row.id, status: row.status, done: row.done, days: row.days,
        moved: moved, reserve: Object.assign({}, row.reserve), made: made,
        readyToDeliver: clean(row.status, 12) === 'done' };
      return true;
    }, 'production:advance');
    if (out && out.ok) { stat.advanced++; stat.lastReason = out.readyToDeliver ? 'done' : 'advanced'; }
    return out || refuse('store-unavailable');
  }
  /** 停工（显式）：把 running 的单停在 paused，不推进工期。 */
  function pause(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const j = jobOf(orderId);
    if (!j) return refuse('unknown-order', { id: orderId });
    const st = clean(j.status, 12);
    if (st !== 'running') return refuse('order-closed', { id: j.id, status: st });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-order', id: j.id }; return false; }
      if (clean(row.status, 12) !== 'running') { out = { ok: false, reason: 'order-closed', id: row.id, status: row.status }; return false; }
      row.status = 'paused';
      row.pausedAt = clockNow('production');
      row.pausedReason = clean(o.why, 40) || 'manual';
      row.updatedAt = row.pausedAt;
      out = { ok: true, id: row.id, status: 'paused', done: row.done, days: row.days, why: row.pausedReason };
      return true;
    }, 'production:pause');
    if (out && out.ok) { stat.paused++; stat.lastReason = 'paused'; }
    return out || refuse('store-unavailable');
  }
  /** 复工：paused → running（补料之后接着走）。已经在跑的单调它是**无操作**，不报错。 */
  function resume(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const j = jobOf(orderId);
    if (!j) return refuse('unknown-order', { id: orderId });
    const st = clean(j.status, 12);
    if (st === 'running') return { ok: true, id: j.id, status: 'running', changed: false };
    if (st !== 'paused') return refuse('order-closed', { id: j.id, status: st });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-order', id: j.id }; return false; }
      if (clean(row.status, 12) !== 'paused') { out = { ok: false, reason: 'order-closed', id: row.id, status: row.status }; return false; }
      row.status = 'running';
      row.pausedReason = '';
      row.updatedAt = clockNow('production');
      out = { ok: true, id: row.id, status: 'running', changed: true, done: row.done, days: row.days };
      return true;
    }, 'production:resume');
    if (out && out.ok) { stat.resumed++; stat.lastReason = 'resumed'; }
    return out || refuse('store-unavailable');
  }
  /**
   * 交货：完工之后**只入库一次**（走 `economy.stock`，不建第二份库存真源）；
   *   给了 `routeId` 时顺带把货交给既有物流（`freight.dispatch`）。
   */
  function deliver(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const j = jobOf(orderId);
    if (!j) return refuse('unknown-order', { id: orderId });
    const st = clean(j.status, 12);
    if (st === 'delivered') return refuse('order-delivered', { id: j.id, at: j.deliveredAt });
    if (st === 'cancelled') return refuse('order-closed', { id: j.id, status: st });
    if (st !== 'done') {
      return refuse('not-done', { id: j.id, status: st, done: num(j.done) || 0, days: num(j.days) || 1,
        hint: '工期没走完就交不出货（两日单首日不出货）' });
    }
    const rec = recipeOf(clean(j.recipe, 40));
    if (!rec) return refuse('unknown-recipe', { recipe: j.recipe });
    const place = clean(o.place, 40) || clean(j.place, 40);
    if (!place) return refuse('missing-fields', { field: 'place' });
    if (!WA.economy || typeof WA.economy.stock !== 'function') return refuse('store-unavailable', { module: 'economy' });
    const qty = num(j.qty) || 1;
    const made = {};
    // ── 幂等账（本版实测抓出的真缺陷）──────────────────────────────
    //   首版按「逐样入库、任一被拒就整单拒收」写：多产物时**第一样已经进了库存**、
    //   第二样被 economy 拒收 ⇒ 工单状态仍是 done，玩家再点一次交货就会把第一样**再入一次**。
    //   这与验收原文「完工后**仅入库一次**」直接冲突。故在此立一张**已入库账**
    //   （`row.delivered`：产物名 → 已入库数量）：重试时**逐样跳过已入库的**，
    //   只有剩下的那几样真的进了库，才把工单置 delivered。
    //   账落在工单行上（存档唯一真源），不新建容器。
    const ledger = (j.delivered && typeof j.delivered === 'object') ? j.delivered : {};
    const skipped = {};
    const outs = Object.keys(rec.out);
    for (let i = 0; i < outs.length; i++) {
      const k = outs[i];
      const q = +(rec.out[k] * qty).toFixed(3);
      if ((num(ledger[k]) || 0) >= q) { skipped[k] = num(ledger[k]) || 0; continue; }
      let r = null;
      try { r = WA.economy.stock(place, k, q, { base: o.base }); } catch (e) { r = null; }
      if (!r || r.ok !== true) {
        // 部分入库的账要**当场**落行（存档唯一真源）：账只在收尾事务里写的话，
        //   「第一样进了库、第二样被拒」的这一次重试会读到空账，把第一样再入一次
        //   —— 与「已入库的那几样记在账上，重试时跳过」的承诺正好相反（本版实测抓出）。
        if (Object.keys(made).length) {
          WA.store.transact(function (d2) {
            const b2 = ensure(d2);
            const r2 = b2.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
            if (r2 && clean(r2.status, 12) === 'done') {
              r2.delivered = Object.assign({}, (r2.delivered && typeof r2.delivered === 'object') ? r2.delivered : {}, made);
              r2.updatedAt = clockNow('production');
            }
            return true;
          }, 'production:deliver-partial');
        }
        return refuse((r && r.reason) || 'store-unavailable', { id: j.id, at: 'economy.stock', resource: k,
          alreadyDelivered: skipped,
          note: '库存真源在 economy：它拒收就是这一单交不出货（本模块不另开一份库存）；'
            + '已入库的那几样记在账上，重试时跳过（不重复入库）' });
      }
      made[k] = q;
    }
    let shipped = null;
    if (clean(o.routeId, 60) && WA.freight && typeof WA.freight.dispatch === 'function') {
      const first = outs[0];
      let fr = null;
      try {
        fr = WA.freight.dispatch(clean(o.routeId, 60), place, first, made[first],
          { transitDays: num(o.transitDays) === null ? 1 : num(o.transitDays), to: clean(o.to, 40),
            base: o.base });
      } catch (e) { fr = null; }
      shipped = fr ? { ok: fr.ok === true, reason: fr.reason || '', id: fr.id || null } : { ok: false, reason: 'throw' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-order', id: j.id }; return false; }
      if (clean(row.status, 12) === 'delivered') { out = { ok: false, reason: 'order-delivered', id: row.id, at: row.deliveredAt }; return false; }
      if (clean(row.status, 12) !== 'done') { out = { ok: false, reason: 'not-done', id: row.id, status: row.status }; return false; }
      row.delivered = Object.assign({}, (row.delivered && typeof row.delivered === 'object') ? row.delivered : {}, made);
      row.status = 'delivered';
      row.deliveredAt = clockNow('production');
      row.updatedAt = row.deliveredAt;
      out = { ok: true, id: row.id, place: place, made: made, status: 'delivered', shipped: shipped,
        skipped: skipped, ledger: Object.assign({}, row.delivered) };
      return true;
    }, 'production:deliver');
    if (out && out.ok) { stat.delivered++; stat.lastReason = 'delivered'; }
    return out || refuse('store-unavailable');
  }
  /** 取消：**退料**（预留池里剩下的退回开工者手里），已推进的天数如实留在回执里。 */
  function cancel(orderId, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const j = jobOf(orderId);
    if (!j) return refuse('unknown-order', { id: orderId });
    const st = clean(j.status, 12);
    if (st === 'delivered' || st === 'cancelled') return refuse('order-closed', { id: j.id, status: st });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.jobs.filter(function (x) { return x && clean(x.id, 60) === clean(j.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-order', id: j.id }; return false; }
      const st2 = clean(row.status, 12);
      if (st2 === 'delivered' || st2 === 'cancelled') { out = { ok: false, reason: 'order-closed', id: row.id, status: st2 }; return false; }
      const pe = draft.people || {};
      const by = clean(row.by, 60);
      let pur = null;
      if (pe['p_' + by]) pur = pe['p_' + by].resources;
      else Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === by) pur = pe[k].resources; });
      if (!pur) pur = (pe['p_' + by] = { id: 'p_' + by, name: by, resources: {} }).resources;
      const back = {};
      const pool = (row.reserve && typeof row.reserve === 'object') ? row.reserve : {};
      Object.keys(pool).forEach(function (m) {
        const q = num(pool[m]) || 0;
        if (q > 0) { addRes(pur, m, q); back[m] = q; }
      });
      row.reserve = {};
      row.status = 'cancelled';
      row.updatedAt = clockNow('production');
      out = { ok: true, id: row.id, status: 'cancelled', returned: back, by: by,
        done: num(row.done) || 0, days: num(row.days) || 1,
        note: '取消退料：预留池里剩下的退回开工者手里；已推进的天数如实保留（不假装没发生）' };
      return true;
    }, 'production:cancel');
    if (out && out.ok) { stat.cancelled++; stat.lastReason = 'cancelled'; }
    return out || refuse('store-unavailable');
  }
  /** 只读：工单清单（可按状态/设施/开工者过滤）。 */
  function list(filter) {
    const f = filter || {};
    const st = clean(f.status, 12), fac = clean(f.facility, 40), by = clean(f.by, 60);
    return jobsOf().filter(function (x) {
      if (!x) return false;
      if (st && clean(x.status, 12) !== st) return false;
      if (fac && clean(x.facility, 40) !== fac) return false;
      if (by && clean(x.by, 60) !== by) return false;
      return true;
    }).map(function (x) {
      return { id: x.id, recipe: x.recipe, qty: num(x.qty) || 0, days: num(x.days) || 0,
        done: num(x.done) || 0, status: x.status || '', facility: x.facility || '', place: x.place || '',
        by: x.by || '', crew: (Array.isArray(x.crew) ? x.crew : []).map(function (c) {
          return { who: c.who, shift: c.shift };
        }), reserve: Object.assign({}, x.reserve || {}), pausedReason: x.pausedReason || '',
        delivered: Object.assign({}, x.delivered || {}) };
    });
  }
  function reload() {
    const b = bagOf();
    return { ok: true, jobs: b ? jobsOf().length : 0, facilities: b ? facsOf().length : 0 };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, statuses: STATUSES.slice(), openStatus: OPEN_STATUS.slice(),
      maxJobs: cfg.maxJobs, maxFacilities: cfg.maxFacilities, maxCrew: cfg.maxCrew, maxDays: cfg.maxDays,
      facilities: facsOf().map(function (f) {
        return { name: f.name, label: f.label, slots: num(f.slots) || 1, used: openOnFacility(f.name) };
      }),
      jobs: list({}), counts: { jobs: jobsOf().length, facilities: facsOf().length,
        open: jobsOf().filter(function (x) { return x && OPEN_STATUS.indexOf(clean(x.status, 12)) >= 0; }).length,
        delivered: jobsOf().filter(function (x) { return x && clean(x.status, 12) === 'delivered'; }).length },
      stat: statView() };
  }
  function statView() { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  function resetStat() {
    stat.opened = 0; stat.staffed = 0; stat.resupplied = 0; stat.advanced = 0; stat.paused = 0;
    stat.resumed = 0; stat.delivered = 0; stat.cancelled = 0; stat.blocked = 0;
    stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  function reset() {
    WA.store.transact(function (draft) { const b = ensure(draft); b.jobs = []; b.facilities = []; return true; }, 'production:reset');
    resetStat();
    return { ok: true, cleared: true };
  }
  WA.production = {
    STATUSES: STATUSES.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    declareFacility: declareFacility, open: open, staff: staff, resupply: resupply,
    advance: advance, pause: pause, resume: resume, deliver: deliver, cancel: cancel,
    list: list, reload: reload, view: view, stat: statView, resetStat: resetStat, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/production.js', { kind: 'engine', ver: '2.231.0' });
  if (WA.log) WA.log('info', 'production 已加载（2.231.0）');
})();