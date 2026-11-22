/**
 * WorldAxis engines/livelihood.js (v2.524.0) — EXV29-26/27/28/29/30 生计五面
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   钱在现场只是数字：`economy` 会记价、`credit-ledger` 会记债、`personal-inventory` 会记现金，
 *   但**没有人回答"这点钱够不够活"**：
 *     · 灾年粮价涨了，工钱照旧——这件事没有任何读数；
 *     · 有人囤货，囤完除了价格没人担后果；
 *     · 玩家进出一笔笔钱，欠谁多少要翻三个模块才拼得出来；
 *     · 钱毛了，旧债还是那个数（或者被单方面改掉）；
 *     · 没钱了，正文照旧让他逛窑子吃席——穷不是约束，只是面板红字。
 *   本模块不重造账，只把这几样**串成一句可读的话**。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `wageDrift` 算实际购买力（只报数，不改数）；`hoard` 算溢价并给人际后果；
 *   `ledger`/`ledgerView` 一笔一笔可查，欠账直接读 `credit-ledger`（同一份账）；
 *   `revalue` 要**双方点头**才折算；`hardship` 把钱不够这件事落成三处行为限制。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不许静默调数：`wageDrift` 只报 `applied:false`（改数是经济引擎的事）。
 *   ② 溢价要有来源：没有挂牌价可比就如实说 `band:null`（不替市场编行情）。
 *   ③ 欠账同源：`ledgerView` 的欠账一律现取 `creditLedger.list()`，不留副本。
 *   ④ 旧债不许单方面改：`revalue` 的 `agreedBy` 必须同时含借与贷两方，否则拒收。
 *   ⑤ 有界：流水最多 32 笔（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'livelihood';
  const ENTRY_CAP = 32;
  const stat = { drifts: 0, hoards: 0, entries: 0, revalues: 0, refusals: 0 };
  let shadow = null;

  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 48);
  }
  function refuse(code, extra) {
    stat.refusals++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('livelihood'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }
  function box() {
    let m = null;
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      m = all[STORE_KEY];
    } catch (e) { m = null; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = shadow || {};
    return {
      entries: Array.isArray(m.entries) ? m.entries.slice() : [],
      grudges: (m.grudges && typeof m.grudges === 'object') ? m.grudges : {},
      revalues: (m.revalues && typeof m.revalues === 'object') ? m.revalues : {}
    };
  }
  function save(b) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = b; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = b; return true; }, 'livelihood');
      return true;
    } catch (e) { shadow = b; return false; }
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  /**
   * EXV29-26 工资跟粮价走：算**实际购买力**（一斗粮的工钱数）。只报数，不改数。
   * @param {object} spec { wageBefore, wageNow, grainBefore, grainNow }
   */
  function wageDrift(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const wb = Number(src.wageBefore), wn = Number(src.wageNow);
    const gb = Number(src.grainBefore), gn = Number(src.grainNow);
    const bad = [];
    if (!isFinite(wb) || wb <= 0) bad.push('wageBefore');
    if (!isFinite(wn) || wn <= 0) bad.push('wageNow');
    if (!isFinite(gb) || gb <= 0) bad.push('grainBefore');
    if (!isFinite(gn) || gn <= 0) bad.push('grainNow');
    if (bad.length) return refuse('missing-fields', { missing: bad, why: '四个数缺一个都算不出购买力' });
    const basketsBefore = wb / gb;
    const basketsNow = wn / gn;
    const changePct = round2((basketsNow / basketsBefore - 1) * 100);
    stat.drifts++;
    return {
      ok: true, reason: 'ok', applied: false,
      basketsBefore: round2(basketsBefore), basketsNow: round2(basketsNow), changePct: changePct,
      worse: changePct < 0,
      line: '同样的工钱，从前能买 ' + round2(basketsBefore) + ' 份粮，如今只买得到 ' + round2(basketsNow)
        + ' 份（' + (changePct < 0 ? '少' : '多') + ' ' + Math.abs(changePct) + '%）',
      note: '只报数不改数：工钱要不要涨是经济引擎的事（本模块不静默调）'
    };
  }

  /**
   * EXV29-27 灾年溢价与囤积：溢价要说得出来源，囤者要担人际后果。
   * @param {object} spec { place, resource, who, qty, base }
   */
  function hoard(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const place = clean(src.place, 40), resource = clean(src.resource, 40), who = clean(src.who, 40);
    const missing = [];
    if (!place) missing.push('place');
    if (!resource) missing.push('resource');
    if (!who) missing.push('who');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    const qty = Number(src.qty);
    if (!isFinite(qty) || qty <= 0) return refuse('missing-fields', { missing: ['qty'] });
    const base = Number(src.base);
    // 复用经济面：有挂牌货就取它自己的价带（不抄副本、不替市场编行情）
    let band = null, priceNow = null;
    const ECO = WA.economy;
    if (ECO && typeof ECO.bandOf === 'function') {
      try {
        const b = ECO.bandOf(place, resource);
        if (b && isFinite(b.lo) && isFinite(b.hi)) band = { lo: b.lo, hi: b.hi, mid: round2((b.lo + b.hi) / 2) };
      } catch (e) { band = null; }
    }
    if (isFinite(base) && base > 0) priceNow = base;
    const premiumPct = (band && priceNow) ? round2((priceNow / band.mid - 1) * 100) : null;
    const b = box();
    const g = b.grudges[who] || { who: who, times: 0, at: 0 };
    g.times += 1; g.at = nowAt(); g.lastResource = resource;
    b.grudges[who] = g;
    save(b);
    stat.hoards++;
    return {
      ok: true, reason: 'ok', place: place, resource: resource, who: who, qty: qty,
      band: band, premiumPct: premiumPct, grudgeTimes: g.times,
      note: (band ? ('「' + resource + '」在' + place + '的价带 ' + band.lo + '–' + band.hi
        + (premiumPct === null ? '' : ('，此刻偏离 ' + premiumPct + '%')))
        : ('没有「' + resource + '」的挂牌价：溢价说不出来源，只能记一句"他在囤"'))
        + '；' + who + ' 这已经是第 ' + g.times + ' 回囤同类东西，街面上开始有人念他'
    };
  }

  /**
   * EXV29-28 玩家的账本：进出一笔可查。
   * @param {object} spec { direction:'in'|'out', amount, what, at }
   */
  function ledger(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const direction = clean(src.direction, 8);
    const amount = Number(src.amount);
    const what = clean(src.what, 60);
    if (direction !== 'in' && direction !== 'out') return refuse('unknown-kind', { field: 'direction', got: direction, allowed: ['in', 'out'] });
    if (!isFinite(amount) || amount <= 0) return refuse('missing-fields', { missing: ['amount'] });
    if (!what) return refuse('missing-fields', { missing: ['what'], why: '这笔钱为了什么：说不清就不记' });
    const b = box();
    b.entries.push({ direction: direction, amount: amount, what: what, at: Number.isFinite(Number(src.at)) ? Number(src.at) : nowAt() });
    while (b.entries.length > ENTRY_CAP) b.entries.shift();
    save(b);
    stat.entries++;
    return { ok: true, reason: 'ok', direction: direction, amount: amount, what: what, count: b.entries.length,
      note: (direction === 'in' ? '进 ' : '出 ') + amount + '（' + what + '）已记账' };
  }

  /** 一屏看清：进出合计 + **现取** credit-ledger 的欠账（同一份账，不留副本）。 */
  function ledgerView() {
    const b = box();
    const income = b.entries.filter(function (e) { return e.direction === 'in'; })
      .reduce(function (a, e) { return a + e.amount; }, 0);
    const spent = b.entries.filter(function (e) { return e.direction === 'out'; })
      .reduce(function (a, e) { return a + e.amount; }, 0);
    let debts = null;
    const CL = WA.creditLedger;
    if (CL && typeof CL.list === 'function') {
      try {
        const l = CL.list();
        const rows = (l && Array.isArray(l.rows)) ? l.rows : [];
        const open = rows.filter(function (r) { return r.status === 'open' || r.status === 'overdue'; });
        debts = {
          count: open.length,
          overdue: open.filter(function (r) { return r.status === 'overdue'; }).length,
          total: round2(open.reduce(function (a, r) { return a + (r.principalLeft || 0) + (r.interest || 0); }, 0)),
          rows: open.slice(0, 6).map(function (r) { return { id: r.id, borrower: r.borrower, lender: r.lender, due: round2((r.principalLeft || 0) + (r.interest || 0)), status: r.status }; })
        };
      } catch (e) { debts = null; }
    }
    return {
      ok: true, reason: 'ok', entries: b.entries.slice(-8), count: b.entries.length,
      income: round2(income), spent: round2(spent), balance: round2(income - spent),
      debts: debts,
      note: debts === null ? '账本只算进出：信用账本此刻读不到（模块缺席）'
        : ('进 ' + round2(income) + ' / 出 ' + round2(spent) + '，还欠 ' + debts.count + ' 笔共 ' + debts.total
          + (debts.overdue ? ('（其中 ' + debts.overdue + ' 笔已逾期）') : ''))
    };
  }

  /**
   * EXV29-29 钱毛了承诺怎么办：旧债折算必须**双方点头**。
   * @param {object} spec { id, pct, agreedBy:['borrower','lender'] 或人名, at }
   */
  function revalue(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const id = clean(src.id, 40);
    if (!id) return refuse('missing-fields', { missing: ['id'] });
    const pct = Number(src.pct);
    if (!isFinite(pct)) return refuse('missing-fields', { missing: ['pct'] });
    const CL = WA.creditLedger;
    if (!CL || typeof CL.list !== 'function') return refuse('module-missing', { module: 'creditLedger' });
    const l = CL.list();
    const rows = (l && Array.isArray(l.rows)) ? l.rows : [];
    const row = rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return refuse('not-happened', { id: id, why: '没有这张据：谈不上折算' });
    const agreed = (Array.isArray(src.agreedBy) ? src.agreedBy : []).map(function (x) { return clean(x, 40); })
      .filter(function (x) { return !!x; });
    const hasBorrower = agreed.indexOf(String(row.borrower)) >= 0;
    const hasLender = agreed.indexOf(String(row.lender)) >= 0;
    if (!hasBorrower || !hasLender) {
      return refuse('missing-fields', { missing: !hasBorrower ? ['borrower-agree'] : ['lender-agree'],
        agreedBy: agreed, borrower: row.borrower, lender: row.lender,
        why: '旧债折算不许单方面改写：借与贷两方都要点头' });
    }
    const b = box();
    if (b.revalues[id]) {
      return { ok: false, reason: 'already-handled', id: id, pct: b.revalues[id].pct, note: '这张据已经折算过一次：不重复改' };
    }
    const dueBefore = round2((row.principalLeft || 0) + (row.interest || 0));
    const dueAfter = round2(dueBefore * (1 + pct / 100));
    b.revalues[id] = { id: id, pct: pct, agreedBy: agreed.slice(0, 4), dueBefore: dueBefore, dueAfter: dueAfter,
      at: Number.isFinite(Number(src.at)) ? Number(src.at) : nowAt() };
    save(b);
    stat.revalues++;
    return { ok: true, reason: 'ok', id: id, pct: pct, dueBefore: dueBefore, dueAfter: dueAfter,
      borrowersConsent: true, lendersConsent: true,
      note: '双方都点头：这张据从 ' + dueBefore + ' 折到 ' + dueAfter + '（钱毛了，旧承诺按折算走）' };
  }

  /**
   * EXV29-30 穷是可感知的约束：钱不够时，三处行为被限制（不是面板红字）。
   * @param {object} spec { cash, need }
   */
  function hardship(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const cash = Number(src.cash);
    const need = Number(src.need);
    if (!isFinite(cash) || cash < 0) return refuse('missing-fields', { missing: ['cash'] });
    if (!isFinite(need) || need <= 0) return refuse('missing-fields', { missing: ['need'] });
    const short = round2(need - cash);
    if (short <= 0) {
      return { ok: true, reason: 'ok', restricted: false, shortfall: 0, limits: [],
        note: '钱够：该吃该住照旧（约束解除）' };
    }
    stat.refusals += 0;
    return {
      ok: true, reason: 'ok', restricted: true, cash: round2(cash), need: round2(need), shortfall: short,
      limits: [
        { area: '吃', what: '吃不起正经饭：只能对付一口，下一顿还要再算', why: '差 ' + short },
        { area: '住', what: '房租这笔要么拖要么挪，房东会来问', why: '差 ' + short },
        { area: '行', what: '远路得走着去（或求人捎带），约好的时辰可能赶不上', why: '差 ' + short }
      ],
      note: '穷落在三件事上：吃、住、行——不是面板上红一个数，是他今天真的做不了这几样'
    };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const v = ledgerView();
    if (!v.debts || !v.debts.count) return '';
    return '【手头】进 ' + v.income + ' / 出 ' + v.spent + '；还欠 ' + v.debts.count + ' 笔共 ' + v.debts.total
      + (v.debts.overdue ? ('（' + v.debts.overdue + ' 笔已逾期）') : '') + '——钱的事要算着说。';
  }

  WA.livelihood = {
    ENTRY_CAP: ENTRY_CAP,
    wageDrift: wageDrift, hoard: hoard, ledger: ledger, ledgerView: ledgerView,
    revalue: revalue, hardship: hardship, buildBlock: buildBlock, stat: statOf
  };
})();