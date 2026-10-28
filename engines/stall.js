/**
 * WorldAxis engines/stall.js (v2.253.0) — 离线寄售摊（无人看摊时货怎么卖出去）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   `economy` 管现货、定价带宽、成交，八条边界全是**当场**的：钱货两清、走到带外拒收、
 *   库存不为负。它答得出「这一笔买卖成不成」，答不出另一件事：
 *   **摊主走开（下线 / 挪到别处）之后，摆在桌上的货怎么卖出去。**
 *   现场于是只剩两种做法：要么人一走就把货收回身上（世界在他离开的那一秒变空），
 *   要么模型顺手报「路过的人买走了两件」——而那不是任何一笔有回执的成交。
 *   缺口实测：`stall` / `摊位` / `寄售` / `consign` / `listing` / `挂单` 在
 *   core 与 engines 下**命中 0**（`stall` 的 10 处全是别处的同形词：事件行的
 *   `stall:true` 停滞标记、ledger 的 `stalled` 态、chatcache 的 `installPack`）。
 *   `offline-return` 管的是**人**怎么归队，不管「他留下的摊」。
 *
 *   （同名机制在对局服项目里被独立验证过：OpenMMO `stall.rs` 用 leash 半径判摊主是否
 *   站远了、`stall_tax` 按整数分币抽 5% 抹平玩家对玩家绕开金币水龙头、
 *   `OfflineStallOwner` 把摊主的背包**搬进摊位条目**使离线期间照常成交、
 *   归队时按 `strayed_from` 判「回来的人已不在摊边」而就地收摊。
 *   本模块把这几条搬到叙事层；坐标换成本仓已有的人物 `location` 字段。）
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `lay` 摆摊（摊主必须**就在那儿**）→ `list` 挂货（货从库存里**锁起来**，价必须落在
 *   economy 的定价带宽内）→ 过路人 `buy`（钱货两清、抽税、写回执）→ `pack` 收摊（剩货解回）。
 *   `away` 标离场：人走了摊还在，只有 `buy` 能成，摊主的一切写口一律 `offline`。
 *
 * ── 缝合边界（否定式，每条都有判据咬）──────────────────────────────
 *   ① 总开关默认关闭；关闭时一律 `disabled`，不占地、不锁货、不成交。
 *   ② **价不是新开一套**：挂单价必须落在 `economy` 同一资源的定价带宽内
 *      （`price-out-of-band` 带 lo/hi）。带宽外挂单等于「这个价没道理」，不许过。
 *   ③ **挂货必须真有货**：按 economy 库存真源算，扣掉别单已锁的量再判（`short-stock`）。
 *      挂上去的量**立刻从可售量里锁走**（`locked`），否则同一个面包能被卖两次。
 *   ④ **一手交钱一手交货**：钱不够 `cannot-afford`、货不够 `listing-short`，**都不改状态**
 *      （拒收不是赊账 —— 与 economy / production / research 同一条口径）。
 *   ⑤ **买家得走到摊前**：买家的 `location` 必须与摊同地（`too-far` 带出两边地名）。
 *      本模块不假装有米；同地就是可及，跨地就是不可及。
 *   ⑥ **摊主走远了摊就收**：摊主的 `location` 一变（或显式 `away` 后归队时已不在原地）
 *      即判 `strayed` 并**就地收摊**，剩货解回、挂单结束。悬在世界里的摊不许无限期挂着。
 *   ⑦ **税是从卖家所得里烧掉的**：`STALL_TAX_PERCENT = 5`，按整数分币拆
 *      （`floor(total/100*p) + floor(total%100*p/100)`，不吞零头），卖家实收 `total - tax`。
 *      本模块**不发行货币**，只在两个人的钱包之间搬钱。
 *   ⑧ **离线不是特权**：`away` 的摊可以被人买，但摊主本人不能挂货、不能改价、不能收摊
 *      （手里没摊，改给谁看）。归队 `back` 只是解除标记，不搬货、不搬钱。
 *   ⑨ 一个摊主同时只许一个摊（`already-laid`）；摊数、每摊挂单数、回执环都有硬顶，
 *      三个站点都走 evict 单一出口。
 *   ⑩ 本模块不碰认知与事实：谁看见了摊是 `interest-face` 的事，谁知道了这笔成交是
 *      `epistemic-view` / `knowledge` 的事。这里只记「货换了手、钱换了手、税烧了」。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_stall_settings_v1';
  // maxStalls：同时存在的摊；maxListings：一摊能挂几行（OpenMMO 用 12，理由是面板与整包推送有界）；
  // maxLedger：一摊的成交回执环；taxPct：抽税率（percent）。
  const DEF = { enabled: false, maxStalls: 12, maxListings: 12, maxLedger: 24, taxPct: 5 };
  const __REG = { key: LS_KEY, def: DEF, module: 'stall',
    bounds: { maxStalls: [2, 64], maxListings: [1, 32], maxLedger: [4, 64], taxPct: [0, 25] } };
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

  const SIGN_MAX = 32;      // 招牌字数（OpenMMO STALL_MAX_SIGN_CHARS，与角色名上限同规不再另设一个）
  const stat = { laid: 0, listed: 0, delisted: 0, bought: 0, packed: 0, strayed: 0,
    taxCents: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.refused++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }

  function stallsOf(root) {
    const s = (root || state()).stalls;
    return (s && typeof s === 'object' && !Array.isArray(s) ? s : null) || null;
  }
  function rowsOf(root) { const s = stallsOf(root); return s ? s.rows : []; }
  function ensure(draft) {
    if (!draft.stalls || typeof draft.stalls !== 'object' || Array.isArray(draft.stalls)) {
      draft.stalls = { rows: [] };
    }
    if (!Array.isArray(draft.stalls.rows)) draft.stalls.rows = [];
    return draft.stalls;
  }
  function stallOf(owner, root) {
    const k = clean(owner, 60);
    return rowsOf(root).filter(function (r) { return r && clean(r.owner, 60) === k; })[0] || null;
  }
  function listingOf(stall, resource) {
    const k = clean(resource, 40);
    return (stall.listings || []).filter(function (l) { return l && clean(l.resource, 40) === k; })[0] || null;
  }
  function personOf(name, root) {
    const who = clean(name, 60);
    if (!who) return null;
    const ppl = (root || state()).people || {};
    if (ppl['p_' + who]) return ppl['p_' + who];
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      if (ppl[keys[i]] && clean(ppl[keys[i]].name, 60) === who) return ppl[keys[i]];
    }
    return null;
  }
  function purseOf(name, root) {
    const p = personOf(name, root);
    return (p && p.resources && typeof p.resources === 'object') ? p.resources : null;
  }
  function money() {
    try { return (WA.economy && typeof WA.economy.money === 'function') ? WA.economy.money() : '银元'; }
    catch (e) { return '银元'; }
  }
  /** 该地该资源的库存行（economy.goods 是唯一真源，本模块**只读它、只扣它的 stock**）。 */
  function goodIn(place, resource, root) {
    const pl = clean(place, 40), res = clean(resource, 40);
    const eco = ((root || state()).economy || {});
    const rows = Array.isArray(eco.goods) ? eco.goods : [];
    return rows.filter(function (g) { return g && clean(g.place, 40) === pl && clean(g.resource, 40) === res; })[0] || null;
  }
  /** 该地该资源已被别的摊锁走的量（同一库存行，锁量是「已经许出去」的部分）。 */
  function lockedIn(place, resource, exceptOwner, root) {
    const pl = clean(place, 40), res = clean(resource, 40), xo = clean(exceptOwner, 60);
    let n = 0;
    rowsOf(root).forEach(function (r) {
      if (!r || clean(r.place, 40) !== pl || clean(r.owner, 60) === xo) return;
      (r.listings || []).forEach(function (l) {
        if (l && clean(l.resource, 40) === res) n += (num(l.qty) || 0);
      });
    });
    return n;
  }
  /** 可售量 = 库存 - 别人已锁。 */
  function sellable(place, resource, exceptOwner, root) {
    const g = goodIn(place, resource, root);
    if (!g) return null;
    return Math.max(0, (num(g.stock) || 0) - lockedIn(place, resource, exceptOwner, root));
  }
  /** 定价带宽 —— 直接问 economy，**不另开一套价**。 */
  function bandOf(place, resource) {
    try {
      if (WA.economy && typeof WA.economy.view === 'function') {
        const v = WA.economy.view(place, resource);
        if (v && v.ok) return { lo: v.lo, hi: v.hi, base: v.base };
      }
    } catch (e) {}
    return null;
  }
  /**
   * 税：按整数分币拆（`floor(c/100*p) + floor(c%100*p/100)`），**不吞零头**。
   *   与 OpenMMO `stall_tax` 逐字同式；分成两段是因为整数除法截断会把零钱留在地上。
   */
  function taxCents(cents, pct) {
    return Math.floor(cents / 100 * pct) + Math.floor(cents % 100 * pct / 100);
  }
  /** 摊主是否还站在摊边（location 变了 = 走远了 = 该收摊）。 */
  function strayedOf(stall, root) {
    const p = personOf(stall.owner, root);
    if (!p) return true;
    return clean(p.location, 40) !== clean(stall.place, 40);
  }
  /**
   * 收摊：**剩货解回**（锁量归零即可，货本来就没离开库存），返回剩了什么。
   *   不删挂单历史里的数字 —— 收摊行不再进 rows，由 `packed` 回报读者。
   */
  function dropRow(draft, owner) {
    const s = ensure(draft);
    const idx = s.rows.map(function (r) { return r && clean(r.owner, 60); }).indexOf(clean(owner, 60));
    if (idx < 0) return null;
    const row = s.rows[idx];
    s.rows.splice(idx, 1);
    return row;
  }

  /** 摆摊：摊主必须**就在那儿**（人不在就没有摊），一个摊主只许一个摊。 */
  function lay(owner, place, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const who = clean(owner, 60), pl = clean(place, 40);
    if (!who || !pl) return refuse('missing-fields', { field: !who ? 'owner' : 'place' });
    const p = personOf(who);
    if (!p) return refuse('unknown-owner', { owner: who });
    if (clean(p.location, 40) !== pl) {
      return refuse('not-there', { owner: who, at: clean(p.location, 40), place: pl,
        hint: '摊摆在他不在的地方就是凭空出现的摊' });
    }
    const sign = clean(o.sign, SIGN_MAX);
    if (stallOf(who)) return refuse('already-laid', { owner: who });
    if (rowsOf().length >= cfg.maxStalls) return refuse('stalls-full', { limit: cfg.maxStalls });
    let out = null;
    WA.store.transact(function (draft) {
      const s = ensure(draft);
      if (s.rows.filter(function (r) { return r && clean(r.owner, 60) === who; }).length) {
        out = { ok: false, reason: 'already-laid', owner: who }; return false;
      }
      if (s.rows.length >= cfg.maxStalls) { out = { ok: false, reason: 'stalls-full', limit: cfg.maxStalls }; return false; }
      const now = clockNow('stall');
      const row = { id: 'st_' + now + '_' + s.rows.length, owner: who, place: pl, sign: sign,
        listings: [], ledger: [], away: false, at: now, updatedAt: now };
      s.rows.push(row);
      WA.evict.array(s.rows, 'stalls.rows', cfg.maxStalls);
      out = { ok: true, id: row.id, owner: who, place: pl, sign: sign };
      return true;
    }, 'stall:lay');
    if (out && out.ok) { stat.laid++; stat.lastReason = 'laid'; }
    return out || refuse('store-unavailable');
  }

  /** 改招牌（空串 = 抹掉招牌，两者都是合法状态）。 */
  function sign(owner, text) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const st = stallOf(owner);
    if (!st) return refuse('missing', { owner: clean(owner, 60) });
    if (st.away) return refuse('offline', { owner: st.owner });
    const raw = String(text === null || text === undefined ? '' : text).trim();
    if (Array.from(raw).length > SIGN_MAX) return refuse('bad-sign', { len: Array.from(raw).length, max: SIGN_MAX });
    const sg = clean(raw, SIGN_MAX);
    if (clean(st.sign, SIGN_MAX) === sg) return { ok: true, reason: 'same-sign', sign: sg };
    let out = null;
    WA.store.transact(function (draft) {
      const row = stallOf(st.owner, draft);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      row.sign = sg; row.updatedAt = clockNow('stall');
      out = { ok: true, id: row.id, sign: row.sign };
      return true;
    }, 'stall:sign');
    return out || refuse('store-unavailable');
  }

  /** 挂货（同一资源重挂 = 改量与改价，不新增行）。 */
  function list(owner, resource, qty, price) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const st = stallOf(owner);
    const who = clean(owner, 60);
    if (!st) return refuse('missing', { owner: who });
    if (st.away) return refuse('offline', { owner: who });
    if (strayedOf(st)) return stray(st.owner);
    const res = clean(resource, 40);
    const n = num(qty), p = num(price);
    if (!res) return refuse('missing-fields', { field: 'resource' });
    if (n === null || n <= 0 || (n | 0) !== n) return refuse('bad-qty', { qty: qty });
    if (p === null || p <= 0) return refuse('bad-price', { price: price });
    const band = bandOf(st.place, res);
    if (!band) return refuse('unknown-good', { place: st.place, resource: res });
    if (p < band.lo || p > band.hi) {
      return refuse('price-out-of-band', { price: p, lo: band.lo, hi: band.hi, base: band.base });
    }
    const existing = listingOf(st, res);
    const have = sellable(st.place, res, st.owner);
    const wasListed = existing ? (num(existing.qty) || 0) : 0;
    if (have === null || have + wasListed < n) {
      return refuse('short-stock', { place: st.place, resource: res, want: n, have: have === null ? 0 : have + wasListed });
    }
    if (!existing && (st.listings || []).length >= cfg.maxListings) {
      return refuse('too-many-listings', { limit: cfg.maxListings });
    }
    let out = null;
    WA.store.transact(function (draft) {
      const row = stallOf(st.owner, draft);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      const cur = listingOf(row, res);
      const now = clockNow('stall');
      if (cur) { cur.qty = n; cur.price = p; cur.updatedAt = now; }
      else {
        if ((row.listings || []).length >= cfg.maxListings) { out = { ok: false, reason: 'too-many-listings', limit: cfg.maxListings }; return false; }
        row.listings.push({ resource: res, qty: n, price: p, at: now, updatedAt: now });
      }
      row.updatedAt = now;
      WA.evict.array(row.listings, 'stalls.listings', cfg.maxListings);
      out = { ok: true, id: row.id, resource: res, qty: n, price: p, repriced: !!cur };
      return true;
    }, 'stall:list');
    if (out && out.ok) { stat.listed++; stat.lastReason = out.repriced ? 'repriced' : 'listed'; }
    return out || refuse('store-unavailable');
  }

  /** 撤货（锁量随行删除，货立刻回到可售）。 */
  function delist(owner, resource) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const st = stallOf(owner);
    if (!st) return refuse('missing', { owner: clean(owner, 60) });
    if (st.away) return refuse('offline', { owner: st.owner });
    const res = clean(resource, 40);
    if (!listingOf(st, res)) return refuse('no-such-listing', { resource: res });
    let out = null;
    WA.store.transact(function (draft) {
      const row = stallOf(st.owner, draft);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      const before = (row.listings || []).length;
      row.listings = (row.listings || []).filter(function (l) { return l && clean(l.resource, 40) !== res; });
      row.updatedAt = clockNow('stall');
      out = { ok: true, id: row.id, resource: res, dropped: before - row.listings.length };
      return true;
    }, 'stall:delist');
    if (out && out.ok) { stat.delisted++; stat.lastReason = 'delisted'; }
    return out || refuse('store-unavailable');
  }

  /** 过路人买走（**这是本模块存在的理由**：摊主可以不在）。 */
  function buy(owner, resource, qty, buyer) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const st = stallOf(owner);
    if (!st) return refuse('missing', { owner: clean(owner, 60) });
    const who = clean(buyer, 60);
    const res = clean(resource, 40);
    const n = num(qty);
    if (!who || !res) return refuse('missing-fields', { field: !who ? 'buyer' : 'resource' });
    if (n === null || n <= 0 || (n | 0) !== n) return refuse('bad-qty', { qty: qty });
    if (who === clean(st.owner, 60)) return refuse('self-buy', { owner: who });
    const bp = personOf(who);
    if (!bp) return refuse('unknown-buyer', { buyer: who });
    if (strayedOf(st)) return stray(st.owner);
    if (clean(bp.location, 40) !== clean(st.place, 40)) {
      return refuse('too-far', { buyer: who, at: clean(bp.location, 40), place: st.place });
    }
    const l = listingOf(st, res);
    if (!l) return refuse('no-such-listing', { resource: res });
    if ((num(l.qty) || 0) < n) return refuse('listing-short', { resource: res, want: n, have: num(l.qty) || 0 });
    const unit = num(l.price) || 0;
    const cents = Math.round(unit * n * 100);
    const total = +(cents / 100).toFixed(2);
    const cur = money();
    const purse = purseOf(who);
    if (!purse) return refuse('missing-purse', { buyer: who });
    const have = +((purse[cur] || 0)).toFixed(2);
    if (have < total) return refuse('cannot-afford', { want: total, have: have, currency: cur });
    const tax = taxCents(cents, cfg.taxPct);
    const keepCents = cents - tax;
    let out = null;
    WA.store.transact(function (draft) {
      const row = stallOf(st.owner, draft);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      const cur2 = money();
      const bper = personOf(who, draft);
      const sper = personOf(row.owner, draft);
      if (!bper || !sper) { out = { ok: false, reason: 'missing-purse', buyer: who, owner: row.owner }; return false; }
      const g = goodIn(row.place, res, draft);
      if (!g) { out = { ok: false, reason: 'unknown-good', resource: res }; return false; }
      const ll = listingOf(row, res);
      if (!ll || (num(ll.qty) || 0) < n) {
        out = { ok: false, reason: 'listing-short', resource: res, want: n, have: ll ? (num(ll.qty) || 0) : 0 };
        return false;
      }
      const bp2 = (num(bper.resources && bper.resources[cur2]) || 0);
      const cents2 = Math.round((num(ll.price) || 0) * n * 100);
      if (+bp2.toFixed(2) < +(cents2 / 100).toFixed(2)) {
        out = { ok: false, reason: 'cannot-afford', want: +(cents2 / 100).toFixed(2), have: +bp2.toFixed(2), currency: cur2 };
        return false;
      }
      const spur = (sper.resources && typeof sper.resources === 'object') ? sper.resources : (sper.resources = {});
      const bpur = (bper.resources && typeof bper.resources === 'object') ? bper.resources : (bper.resources = {});
      const tax2 = taxCents(cents2, cfg.taxPct);
      const keep2 = cents2 - tax2;
      bpur[cur2] = +(bp2 - cents2 / 100).toFixed(2);
      spur[cur2] = +(((num(spur[cur2]) || 0)) + keep2 / 100).toFixed(2);
      g.stock = +((num(g.stock) || 0) - n).toFixed(2);
      if (g.stock < 0) g.stock = 0;
      g.updatedAt = clockNow('stall');
      ll.qty = (num(ll.qty) || 0) - n;
      const now = clockNow('stall');
      if (ll.qty <= 0) row.listings = row.listings.filter(function (x) { return x !== ll; });
      // 需求同步累加：让 economy 的下一次 tick 把这一笔算进货被买走了（不另开需求表）。
      g.demand = +((num(g.demand) || 0) + n).toFixed(2);
      row.updatedAt = now;
      row.ledger = row.ledger || [];
      const row2 = { at: now, buyer: who, resource: res, qty: n, unit: unit,
        total: +(cents2 / 100).toFixed(2), tax: +(tax2 / 100).toFixed(2),
        sellerNet: +(keep2 / 100).toFixed(2), currency: cur2 };
      row.ledger.push(row2);
      WA.evict.array(row.ledger, 'stalls.ledger', cfg.maxLedger);
      stat.taxCents += tax2;
      out = { ok: true, id: row.id, buyer: who, resource: res, qty: n,
        total: row2.total, tax: row2.tax, sellerNet: row2.sellerNet, currency: cur2,
        balance: bpur[cur2], stock: g.stock, seller: row.owner, leftovers: (row.listings || []).length };
      return true;
    }, 'stall:buy');
    if (out && out.ok) { stat.bought++; stat.lastReason = 'bought'; }
    return out || refuse('store-unavailable');
  }

  /** 收摊：剩货解回（锁量随行消失），如实报剩了什么。 */
  function pack(owner) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const st = stallOf(owner);
    if (!st) return refuse('missing', { owner: clean(owner, 60) });
    if (st.away) return refuse('offline', { owner: st.owner, hint: '人不在，得先归队才能收摊' });
    let out = null;
    WA.store.transact(function (draft) {
      const row = dropRow(draft, st.owner);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      out = { ok: true, id: row.id, owner: row.owner, place: row.place,
        leftovers: (row.listings || []).map(function (l) { return { resource: l.resource, qty: l.qty }; }),
        sold: (row.ledger || []).length };
      return true;
    }, 'stall:pack');
    if (out && out.ok) { stat.packed++; stat.lastReason = 'packed'; }
    return out || refuse('store-unavailable');
  }

  /** 摊主离摊（走远了 / 下线）：摊留下、照卖，但摊主本人失去一切写口。 */
  function away(owner) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const st = stallOf(owner);
    if (!st) return refuse('missing', { owner: clean(owner, 60) });
    if (st.away) return { ok: true, reason: 'already-away', id: st.id };
    let out = null;
    WA.store.transact(function (draft) {
      const row = stallOf(st.owner, draft);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      row.away = true; row.updatedAt = clockNow('stall');
      out = { ok: true, id: row.id, owner: row.owner, away: true, listings: (row.listings || []).length };
      return true;
    }, 'stall:away');
    return out || refuse('store-unavailable');
  }
  /** 摊主回来了：解除离摊标记。**不搬货、不搬钱**；回来时已不在摊边就地收摊。 */
  function back(owner) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const st = stallOf(owner);
    if (!st) return refuse('missing', { owner: clean(owner, 60) });
    if (!st.away) return { ok: true, reason: 'already-back', id: st.id };
    if (strayedOf(st)) { const r = stray(st.owner); r.ok = true; return r; }
    let out = null;
    WA.store.transact(function (draft) {
      const row = stallOf(st.owner, draft);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      row.away = false; row.updatedAt = clockNow('stall');
      out = { ok: true, id: row.id, owner: row.owner, away: false };
      return true;
    }, 'stall:back');
    return out || refuse('store-unavailable');
  }
  /** 自动收摊：摊主不在原地了。这是**判据的后果**，不是定时器。 */
  function stray(owner) {
    const st = stallOf(owner);
    if (!st) return refuse('missing', { owner: clean(owner, 60) });
    let out = null;
    WA.store.transact(function (draft) {
      const row = dropRow(draft, st.owner);
      if (!row) { out = { ok: false, reason: 'missing', owner: st.owner }; return false; }
      out = { ok: false, reason: 'strayed', owner: row.owner, place: row.place, packed: true,
        leftovers: (row.listings || []).map(function (l) { return { resource: l.resource, qty: l.qty }; }) };
      return true;
    }, 'stall:stray');
    if (out && out.reason === 'strayed') { stat.strayed++; noteFault('strayed'); }
    return out || refuse('store-unavailable');
  }

  /** 读侧：一个摊的现场（含剩货与回执尾巴）。纯读。 */
  function view(owner) {
    const st = stallOf(owner);
    if (!st) return { ok: false, reason: 'missing', owner: clean(owner, 60) };
    return { ok: true, id: st.id, owner: st.owner, place: st.place, sign: st.sign || '',
      away: !!st.away, strayed: strayedOf(st),
      listings: (st.listings || []).map(function (l) {
        const b = bandOf(st.place, l.resource);
        return { resource: l.resource, qty: l.qty, price: l.price, lo: b ? b.lo : null, hi: b ? b.hi : null };
      }),
      taxPct: settings().taxPct,
      recent: (st.ledger || []).slice(-3) };
  }
  /** 读侧：某地的摊板（过路人看到的东西：谁在卖、卖什么、什么价）。纯读。 */
  function board(place) {
    const pl = clean(place, 40);
    const rows = rowsOf().filter(function (r) { return r && clean(r.place, 40) === pl; });
    if (!rows.length) return { ok: false, reason: 'empty', place: pl };
    return { ok: true, place: pl, rows: rows.map(function (r) {
      return { owner: r.owner, sign: r.sign || '', away: !!r.away,
        listings: (r.listings || []).map(function (l) { return { resource: l.resource, qty: l.qty, price: l.price }; }) };
    }) };
  }
  function statView() {
    const rows = rowsOf();
    return { enabled: settings().enabled, stalls: rows.length,
      away: rows.filter(function (r) { return r && r.away; }).length,
      listings: rows.reduce(function (a, r) { return a + ((r && r.listings) ? r.listings.length : 0); }, 0),
      taxPct: settings().taxPct, taxBurned: +(stat.taxCents / 100).toFixed(2) };
  }
  /** 注入块：只报「有据可查的摊与被锁的货」，不编市场叙事。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const rows = rowsOf().slice(0, cfg.maxStalls);
    if (!rows.length) return '';
    const lines = rows.map(function (r) {
      const who = r.away ? r.owner + '（人不在，摊还在）' : r.owner;
      const goods = (r.listings || []).map(function (l) { return l.resource + '×' + l.qty + ' 价' + l.price; }).join('、');
      return r.place + '：' + who + (r.sign ? '「' + r.sign + '」' : '') + ' — ' + (goods || '空摊');
    });
    return '[摊位]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '摊上的量已从库存里锁走，别处买不到；卖出一律抽 ' + cfg.taxPct
      + '％ 税，卖家只拿税后。人走远了摊就收，剩货解回，不悬在世界上。';
  }

  function snapshot() {
    return { ok: true, rows: rowsOf().map(function (r) {
      return { id: r.id, owner: r.owner, place: r.place, sign: r.sign, away: !!r.away,
        listings: (r.listings || []).map(function (l) { return { resource: l.resource, qty: l.qty, price: l.price }; }),
        ledger: (r.ledger || []).slice() };
    }) };
  }
  function restore(snap) {
    const s = snap && typeof snap === 'object' ? snap : null;
    if (!s || !Array.isArray(s.rows)) return refuse('bad-snapshot');
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const st = ensure(draft);
      st.rows.length = 0;
      const now = clockNow('stall');
      s.rows.slice(0, cfg.maxStalls).forEach(function (r, i) {
        if (!r || !clean(r.owner, 60) || !clean(r.place, 40)) return;
        st.rows.push({ id: clean(r.id, 60) || ('st_' + now + '_' + i), owner: clean(r.owner, 60),
          place: clean(r.place, 40), sign: clean(r.sign, SIGN_MAX), away: !!r.away,
          listings: (Array.isArray(r.listings) ? r.listings : []).slice(0, cfg.maxListings).map(function (l) {
            return { resource: clean(l.resource, 40), qty: num(l.qty) || 0, price: num(l.price) || 0, at: now, updatedAt: now };
          }),
          ledger: (Array.isArray(r.ledger) ? r.ledger : []).slice(-cfg.maxLedger), at: now, updatedAt: now });
      });
      out = { ok: true, reason: 'ok', count: st.rows.length };
      return true;
    }, 'stall:restore');
    return out || refuse('store-unavailable');
  }

  WA.stall = {
    SIGN_MAX: SIGN_MAX, taxCents: taxCents,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    lay: lay, sign: sign, list: list, delist: delist, buy: buy, pack: pack,
    away: away, back: back, stray: stray,
    view: view, board: board, statView: statView, buildBlock: buildBlock,
    snapshot: snapshot, restore: restore,
    sellable: function (place, resource, exceptOwner) { return sellable(place, resource, exceptOwner); },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); },
    REG: __REG, DEF: DEF
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/stall.js', { kind: 'engine', ver: '2.253.0' });
})();
