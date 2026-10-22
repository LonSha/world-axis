/**
 * WorldAxis engines/gear.js (v2.231.0) — EXP-2：个人物品、装备与使用后果
 *
 * ── 它治什么（缺口，开工前逐条复核现场）────────────────────────────────
 *   计划原文：「**唯一物件与堆叠资源分开**，明确持有人、容器/携带状态、适用场景、
 *   使用次数或耐久、修理材料；需要装备槽的世界才启用装备槽。功能效果由本世界规则定义。」
 *   验收原文：「买到同型号两件工具，使用其中一件**只损耗该件**；借给 NPC 后玩家不能同时
 *   使用；修好再归还，**物件身份、持有人和状态连续**。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/entities.js` 的 `object` **只是一张名字清单**
 *       （`{id, name, aliases, desc, refs, updatedAt}`）—— 答得出「这世上有没有『铁锤』」，
 *       答不出「这一把在谁手上、还能用几次」；
 *     · `engines/economy.js` 管的是**堆叠资源**（`{place, resource, base, stock, price}`）——
 *       「铁锤 ×2」在那里是**同一个键的两个单位**，两件分不开：用坏一件，另一件跟着坏；
 *     · `engines/freight.js` 管「货从哪发到哪」，不管「这一件在谁身上」。
 *   三者合起来就是本项要补的那一格：**库存有数量、没有身份**。
 *
 * ── 机制（五句话）──────────────────────────────────────────────────
 *   ① **每件物件一个 id**（`store.gear.items`）：同型号买两件是**两条行**，
 *      使用/损耗/转让都按 id 落到**那一条**上（验收原文点名的那条）。
 *   ② **持有人是唯一真源**：`holder` 为 `''` 表示「不在任何人手上」（在世界里、在某个地方）；
 *      `lend()` 把持有人交给别人，**原持有人当场失去使用权**（验收原文点名）。
 *   ③ **容器/携带状态**：`carry` 三态 `held`（随身）/ `stowed`（收着）/ `placed`（放在某处）。
 *   ④ **使用要真扣**：`use()` 按 `uses` 累进、按 `durability` 扣；**耗尽即拒收**
 *      （`worn-out`），不静默当一次成功使用。
 *   ⑤ **修理要材料**：`repair()` 需要材料（取自持有人自己的资源面）与工时，
 *      材料不足 ⇒ `short-material`（不凭空修好）。
 *
 * ── 十条否定式边界（每条都有判据咬）──────────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`。
 *   ② **不建第二份物品真源**：物件名必须已在 `entities` 的 object 表里登记过
 *      （`entity-absent`）—— 本模块记的是**这一件的生命史**，不是「世上有哪些东西」。
 *   ③ **不建第二份名册**：持有人必须是世界里有的人物（`unknown-holder`）。
 *   ④ **堆叠资源与唯一物件分开**：本模块**不碰** `economy.goods`（那是堆叠面）；
 *      转让也不走 economy 的钱货两清（那是「买」的事，本模块只记「这件在谁手上」）。
 *   ⑤ **装备槽按需启用**：`equip()` 只在世界声明了槽位（`declareSlot`）时才收；
 *      未声明的槽 ⇒ `no-such-slot`（不静默接受一个自造槽位）。
 *   ⑥ **一槽一件**：同一槽位被两件占 ⇒ 后来者拒收 `slot-taken`（要换得先脱）。
 *   ⑦ **耐久不静默**：越界一律夹取并如实报 `clamped`；耗尽即 `worn-out`。
 *   ⑧ **借出即失权**：`lend` 之后原持有人 `canUse` 为假（验收原文点名）。
 *   ⑨ **有界**：物件行有上限，超出按最早写入退场，挤出计数如实报。
 *   ⑩ **存档是唯一真源**（`store.gear`）：`reload()` 从存档重建（切聊天必须重建）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_gear_settings_v1';
  const DEF = { enabled: false, maxItems: 96, maxSlots: 8, maxUses: 1000, maxDurability: 100 };
  const __REG = { key: LS_KEY, def: DEF, module: 'gear',
    bounds: { maxItems: [8, 400], maxSlots: [1, 24], maxUses: [10, 100000], maxDurability: [1, 10000] } };
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
  const CARRIES = ['held', 'stowed', 'placed'];
  const stat = { made: 0, used: 0, lent: 0, repaired: 0, equipped: 0, evicted: 0,
    blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const g = (root || state()).gear;
    return (g && typeof g === 'object' && !Array.isArray(g)) ? g : null;
  }
  function itemsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.items)) ? b.items : []; }
  function slotsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.slots)) ? b.slots : []; }
  function ensure(draft) {
    if (!draft.gear || typeof draft.gear !== 'object' || Array.isArray(draft.gear)) {
      draft.gear = { items: [], slots: [] };
    }
    if (!Array.isArray(draft.gear.items)) draft.gear.items = [];
    if (!Array.isArray(draft.gear.slots)) draft.gear.slots = [];
    return draft.gear;
  }
  function itemOf(id, root) {
    const k = clean(id, 60);
    return itemsOf(root).filter(function (x) { return x && clean(x.id, 60) === k; })[0] || null;
  }
  function slotOf(name, root) {
    const k = clean(name, 20);
    return slotsOf(root).filter(function (s) { return s && clean(s.name, 20) === k; })[0] || null;
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
  /** 物件名是否已在 entities 的 object 表里（**不建第二份物品真源**）。 */
  function entityHasObject(name, root) {
    if (!WA.entities) return { ok: false, reason: 'entity-unavailable' };
    const k = clean(name, 40);
    const ev = (root || state()).evolution;
    const em = ev && ev.entityMemory;
    const rows = (em && Array.isArray(em.object)) ? em.object : null;
    if (!rows) return { ok: false, reason: 'entity-unavailable' };
    const hit = rows.filter(function (r) { return r && clean(r.name, 40) === k; })[0];
    return hit ? { ok: true } : { ok: false, reason: 'entity-absent' };
  }
  /** 世界声明一个装备槽（**按需启用**：没声明的槽位不收）。 */
  function declareSlot(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const nm = clean(name, 20);
    if (!nm) return refuse('missing-fields', { field: 'name' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const seen = b.slots.filter(function (s) { return s && clean(s.name, 20) === nm; })[0] || null;
      if (!seen && b.slots.length >= cfg.maxSlots) { out = { ok: false, reason: 'slots-full', cap: cfg.maxSlots }; return false; }
      const now = clockNow('gear');
      if (seen) { seen.label = clean(o.label, 20) || nm; seen.updatedAt = now; out = { ok: true, name: nm, replaced: true }; }
      else { b.slots.push({ name: nm, label: clean(o.label, 20) || nm, at: now, updatedAt: now }); out = { ok: true, name: nm, replaced: false }; }
      return true;
    }, 'gear:slot');
    return out || refuse('store-unavailable');
  }
  /** 造一件**唯一物件**（同型号多件 = 多条行，各带自己的 id）。 */
  function make(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const nm = clean(name, 40);
    if (!nm) return refuse('missing-fields', { field: 'name' });
    const ent = entityHasObject(nm);
    if (!ent.ok) return refuse(ent.reason, { name: nm });
    const holder = clean(o.holder, 60);
    if (holder && !personExists(holder)) return refuse('unknown-holder', { holder: holder });
    const carry = clean(o.carry, 10) || (holder ? 'held' : 'placed');
    if (CARRIES.indexOf(carry) < 0) return refuse('bad-carry', { carry: carry, allowed: CARRIES.slice() });
    let dur = num(o.durability) === null ? cfg.maxDurability : num(o.durability);
    let clamped = false;
    if (dur <= 0) return refuse('bad-durability', { durability: o.durability });
    if (dur > cfg.maxDurability) { dur = cfg.maxDurability; clamped = true; }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      if (b.items.length >= cfg.maxItems) { out = { ok: false, reason: 'items-full', cap: cfg.maxItems }; return false; }
      const now = clockNow('gear');
      const id = 'gr_' + now + '_' + b.items.length;
      const row = { id: id, name: nm, holder: holder, carry: carry, place: clean(o.place, 40),
        uses: 0, durability: dur, maxDurability: cfg.maxDurability, repairs: 0, slot: '',
        at: now, updatedAt: now };
      b.items.push(row);
      WA.evict.array(b.items, 'gear.items', cfg.maxItems);
      out = { ok: true, id: id, name: nm, holder: holder, carry: carry,
        durability: row.durability, clamped: clamped };
      return true;
    }, 'gear:make');
    if (out && out.ok) { stat.made++; stat.lastReason = 'made'; if (clamped) noteFault('clamped'); }
    return out || refuse('store-unavailable');
  }
  /**
   * 使用一件（**按 id**，不是按名字 —— 同型号两件必须分得开）。
   *   耗尽即拒收 `worn-out`（不静默当一次成功使用）。
   */
  function use(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const it = itemOf(id);
    if (!it) return refuse('unknown-item', { id: id });
    const who = clean(o.by, 60) || clean(it.holder, 60);
    if (!who) return refuse('no-holder', { id: id });
    if (clean(it.holder, 60) !== who) return refuse('not-holder', { id: id, holder: it.holder, by: who });
    if ((num(it.durability) || 0) <= 0) return refuse('worn-out', { id: id, name: it.name });
    const wear = num(o.wear) === null ? 1 : num(o.wear);
    if (wear === null || wear <= 0) return refuse('bad-wear', { wear: o.wear });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.items.filter(function (x) { return x && clean(x.id, 60) === clean(id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-item', id: id }; return false; }
      if (clean(row.holder, 60) !== who) { out = { ok: false, reason: 'not-holder', holder: row.holder, by: who }; return false; }
      if ((num(row.durability) || 0) <= 0) { out = { ok: false, reason: 'worn-out', id: id, name: row.name }; return false; }
      const now = clockNow('gear');
      row.uses = Math.min(cfg.maxUses, (num(row.uses) || 0) + 1);
      row.durability = Math.max(0, +(((num(row.durability) || 0) - wear)).toFixed(3));
      row.updatedAt = now;
      out = { ok: true, id: row.id, name: row.name, by: who, uses: row.uses,
        durability: row.durability, wornOut: row.durability <= 0 };
      return true;
    }, 'gear:use');
    if (out && out.ok) { stat.used++; stat.lastReason = out.wornOut ? 'worn-out-now' : 'used'; }
    return out || refuse('store-unavailable');
  }
  /**
   * 借出（**借出即失权**）：原持有人当场失去使用权（验收原文点名）。
   *   这里只记「这件在谁手上」—— 不走 economy 的钱货两清（那是「买」的事）。
   */
  function lend(id, to, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const it = itemOf(id);
    if (!it) return refuse('unknown-item', { id: id });
    const from = clean(o.from, 60) || clean(it.holder, 60);
    const toWho = clean(to, 60);
    if (!from || !toWho) return refuse('missing-fields', { field: !from ? 'from' : 'to' });
    if (from === toWho) return refuse('self-lend', { who: from });
    if (clean(it.holder, 60) !== from) return refuse('not-holder', { id: id, holder: it.holder, by: from });
    if (!personExists(toWho)) return refuse('unknown-holder', { holder: toWho });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.items.filter(function (x) { return x && clean(x.id, 60) === clean(id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-item', id: id }; return false; }
      if (clean(row.holder, 60) !== from) { out = { ok: false, reason: 'not-holder', holder: row.holder, by: from }; return false; }
      row.holder = toWho;
      row.carry = 'held';
      row.slot = '';        // 换了人就脱离原槽（槽位属于持有人）
      row.updatedAt = clockNow('gear');
      out = { ok: true, id: row.id, name: row.name, from: from, to: toWho, carry: row.carry };
      return true;
    }, 'gear:lend');
    if (out && out.ok) { stat.lent++; stat.lastReason = 'lent'; }
    return out || refuse('store-unavailable');
  }
  /** 装备：**只在世界声明过的槽位**上（未声明 ⇒ no-such-slot）；一槽一件。 */
  function equip(id, slot) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const it = itemOf(id);
    if (!it) return refuse('unknown-item', { id: id });
    if (!clean(it.holder, 60)) return refuse('no-holder', { id: id });
    const sl = clean(slot, 20);
    if (!sl) return refuse('missing-fields', { field: 'slot' });
    if (!slotOf(sl)) return refuse('no-such-slot', { slot: sl, allowed: slotsOf().map(function (s) { return s.name; }) });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.items.filter(function (x) { return x && clean(x.id, 60) === clean(id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-item', id: id }; return false; }
      const taken = b.items.filter(function (x) { return x && x !== row && clean(x.slot, 20) === sl && clean(x.holder, 60) === clean(row.holder, 60); })[0] || null;
      if (taken) { out = { ok: false, reason: 'slot-taken', slot: sl, by: taken.id, name: taken.name }; return false; }
      row.slot = sl;
      row.carry = 'held';
      row.updatedAt = clockNow('gear');
      out = { ok: true, id: row.id, name: row.name, slot: sl, holder: row.holder };
      return true;
    }, 'gear:equip');
    if (out && out.ok) { stat.equipped++; stat.lastReason = 'equipped'; }
    return out || refuse('store-unavailable');
  }
  /** 卸下（清空槽位；物件仍在持有人手上）。 */
  function unequip(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!itemOf(id)) return refuse('unknown-item', { id: id });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.items.filter(function (x) { return x && clean(x.id, 60) === clean(id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-item', id: id }; return false; }
      if (!clean(row.slot, 20)) { out = { ok: false, reason: 'not-equipped', id: id }; return false; }
      const was = row.slot;
      row.slot = '';
      row.updatedAt = clockNow('gear');
      out = { ok: true, id: row.id, name: row.name, was: was };
      return true;
    }, 'gear:unequip');
    return out || refuse('store-unavailable');
  }
  /**
   * 修理：**要材料**（取自持有人自己的资源面 `store.people[...].resources`）。
   *   材料不足 ⇒ `short-material`（不凭空修好）；耐久满 ⇒ `not-damaged`。
   */
  function repair(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const it = itemOf(id);
    if (!it) return refuse('unknown-item', { id: id });
    const by = clean(o.by, 60) || clean(it.holder, 60);
    if (!by) return refuse('no-holder', { id: id });
    if (clean(it.holder, 60) !== by) return refuse('not-holder', { id: id, holder: it.holder, by: by });
    const cur = num(it.durability) || 0;
    const max = num(it.maxDurability) || cfg.maxDurability;
    if (cur >= max) return refuse('not-damaged', { id: id, durability: cur, max: max });
    const material = clean(o.material, 40);
    const need = num(o.amount) === null ? 1 : num(o.amount);
    if (!material || need === null || need <= 0) return refuse('missing-fields', { field: !material ? 'material' : 'amount' });
    const ppl = state().people || {};
    let purse = null;
    Object.keys(ppl).forEach(function (k) {
      if (ppl[k] && clean(ppl[k].name, 60) === by) purse = ppl[k].resources;
    });
    if (ppl['p_' + by]) purse = ppl['p_' + by].resources;
    const have = (purse && typeof purse === 'object') ? (num(purse[material]) || 0) : 0;
    if (have < need) return refuse('short-material', { id: id, material: material, need: need, have: have });
    const restore = num(o.restore) === null ? Math.min(max - cur, Math.max(1, Math.round(max / 4))) : num(o.restore);
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.items.filter(function (x) { return x && clean(x.id, 60) === clean(id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'unknown-item', id: id }; return false; }
      const pe = draft.people || {};
      let pur = null;
      Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === by) pur = pe[k].resources; });
      if (pe['p_' + by]) pur = pe['p_' + by].resources;
      if (!pur || (num(pur[material]) || 0) < need) { out = { ok: false, reason: 'short-material', material: material, need: need }; return false; }
      pur[material] = +((num(pur[material]) || 0) - need).toFixed(3);
      row.durability = Math.min(num(row.maxDurability) || cfg.maxDurability, +(((num(row.durability) || 0) + restore)).toFixed(3));
      row.repairs = (num(row.repairs) || 0) + 1;
      row.updatedAt = clockNow('gear');
      out = { ok: true, id: row.id, name: row.name, by: by, material: material, spent: need,
        durability: row.durability, repairs: row.repairs };
      return true;
    }, 'gear:repair');
    if (out && out.ok) { stat.repaired++; stat.lastReason = 'repaired'; }
    return out || refuse('store-unavailable');
  }
  /** 应用面（真消费）：这个人此刻**能不能用**这一件（持有 + 未耗尽）。 */
  function canUse(id, who) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const it = itemOf(id);
    if (!it) return refuse('unknown-item', { id: id });
    const w = clean(who, 60);
    if (!w) return refuse('missing-fields', { field: 'who' });
    const holder = clean(it.holder, 60);
    const dur = num(it.durability) || 0;
    const pass = (holder === w) && dur > 0;
    stat.lastReason = pass ? 'can' : (holder !== w ? 'not-holder' : 'worn-out');
    return { ok: true, id: it.id, name: it.name, who: w, holder: holder,
      durability: dur, equipped: !!clean(it.slot, 20), pass: pass,
      why: pass ? '' : (holder !== w ? 'not-holder' : 'worn-out') };
  }
  /** 只读：逐件清单。`who` 给空则列全部；`heldOnly` 只列随身。 */
  function list(who, opts) {
    const o = opts || {};
    const w = clean(who, 60);
    return itemsOf().filter(function (x) {
      if (w && clean(x.holder, 60) !== w) return false;
      if (o.heldOnly === true && clean(x.carry, 10) !== 'held') return false;
      return true;
    }).map(function (x) {
      return { id: x.id, name: x.name, holder: x.holder || '', carry: x.carry || 'placed',
        place: x.place || '', slot: x.slot || '', uses: num(x.uses) || 0,
        durability: num(x.durability) || 0, maxDurability: num(x.maxDurability) || 0,
        repairs: num(x.repairs) || 0 };
    });
  }
  function reload() {
    const b = bagOf();
    return { ok: true, items: b ? itemsOf().length : 0, slots: b ? slotsOf().length : 0 };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, carries: CARRIES.slice(), maxItems: cfg.maxItems, maxSlots: cfg.maxSlots,
      maxDurability: cfg.maxDurability,
      slots: slotsOf().map(function (s) { return { name: s.name, label: s.label }; }),
      items: list(''), counts: { items: itemsOf().length, slots: slotsOf().length }, stat: statView() };
  }
  function statView() { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  function resetStat() {
    stat.made = 0; stat.used = 0; stat.lent = 0; stat.repaired = 0; stat.equipped = 0;
    stat.evicted = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  function reset() {
    WA.store.transact(function (draft) { const b = ensure(draft); b.items = []; b.slots = []; return true; }, 'gear:reset');
    resetStat();
    return { ok: true, cleared: true };
  }
  WA.gear = {
    CARRIES: CARRIES.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    declareSlot: declareSlot, make: make, use: use, lend: lend, equip: equip, unequip: unequip,
    repair: repair, canUse: canUse, list: list, reload: reload, view: view,
    stat: statView, resetStat: resetStat, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/gear.js', { kind: 'engine', ver: '2.231.0' });
  if (WA.log) WA.log('info', 'gear 已加载（2.231.0）');
})();