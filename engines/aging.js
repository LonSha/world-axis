/**
 * WorldAxis engines/aging.js (v2.524.0) — EXV29-03 年龄与体貌推进
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场读数：`aging|ageUp|年岁|岁数` **0 命中**。整仓没有任何一处让"时间过去"落在人身上：
 *   三百楼过去了，人物还是那个岁数、那张脸。`appearance` 有档位、有登记口，
 *   但它**不知道时间**——`register(who, tier)` 永远登记同一个档。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   记下每个人的**年龄基线**与**此后累计的整天数**；`advance(days)` 把天数加到账上，
 *   每满 365 天才长一岁，年龄一长就按阈值算出**应到体貌档**，
 *   但**一次只许升一档**（不许从 young 一步跳到 elder）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不过年不涨：`advance(364)` 之后年龄必须一模一样（差值 0）。
 *   ② 只升不跳：一次 `advance` 跨十年，体貌档也只升一级（`clamped:true` 必现）。
 *   ③ 只升不降：阈值的函数是单调的，年龄涨了档位必不回退。
 *   ④ 活人不重登记：同一个人 `register` 两次 ⇒ 第二次只刷基线、不产生第二条。
 *   ⑤ 有界：`aging` 最多 48 人，超出按最久未推进挤出（与 `__BOUNDED_CAPS` 对齐）。
 *   ⑥ 不碰 appearance：本模块**不调用** `appearance.register`（那是"登记外貌"的病），
 *      只回一个 `formTier` 建议值，由调用方决定要不要落。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'aging';
  const CAP = 48;
  const YEAR_DAYS = 365;
  const TIERS = ['young', 'prime', 'seasoned', 'elder', 'venerable'];
  const CN = { young: '年轻', prime: '壮年', seasoned: '中年', elder: '老年', venerable: '高龄' };
  const THRESH = [35, 50, 65, 80];
  const stat = { registered: 0, advanced: 0, yearsUp: 0, clamped: 0, badInput: 0 };
  let shadow = null;

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function readAll() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const m = all[STORE_KEY];
      return (m && typeof m === 'object' && !Array.isArray(m)) ? m : (shadow || {});
    } catch (e) { return shadow || {}; }
  }
  function writeAll(m) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = m; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'aging:advance');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 24);
  }
  function tierOf(age) {
    let i = 0;
    for (let k = 0; k < THRESH.length; k++) { if (age >= THRESH[k]) i = k + 1; }
    return TIERS[i];
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('aging'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= CAP) return m;
    ks.sort(function (a, b) { return (m[a].touchedAt || 0) - (m[b].touchedAt || 0); });
    ks.slice(0, ks.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  /** 登记年龄基线（幂等：同人只一条；第二次只刷基线，不产生第二条）。 */
  function register(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24);
    const age = Number(src.age);
    const missing = [];
    if (!who) missing.push('who');
    if (!isFinite(age) || age < 0 || age > 200) return refuse('bad-target', { got: src.age, why: '年龄须 0..200 的有限数' });
    if (missing.length) return refuse('missing-fields', { missing: missing });
    const m = readAll();
    const prev = m[who];
    const at = nowAt();
    m[who] = {
      who: who, age: Math.floor(age), baseAge: prev ? (prev.baseAge === undefined ? prev.age : prev.baseAge) : Math.floor(age),
      dayCarry: prev ? (prev.dayCarry || 0) : 0,
      tier: tierOf(Math.floor(age)),
      registeredAt: prev ? (prev.registeredAt || at) : at,
      touchedAt: at
    };
    writeAll(capIt(m));
    stat.registered++;
    return { ok: true, reason: 'ok', who: who, age: m[who].age, tier: m[who].tier, tierCN: CN[m[who].tier],
      created: !prev, note: prev ? '已有此人：本次只刷年龄基线，不新增第二条' : '年龄基线已立' };
  }

  /**
   * 推进天数：只认整天（小数向下取整）。满 365 天才长一岁；体貌档一次只升一档。
   * `days<=0` ⇒ `bad-target`（不许用负数倒退）。
   */
  function advance(days) {
    const d = Number(days);
    if (!isFinite(d) || d < 0) return refuse('bad-target', { got: days, why: '天数须 >=0 的有限数' });
    const whole = Math.floor(d);
    const m = readAll();
    const ids = Object.keys(m);
    if (!ids.length) return { ok: true, reason: 'ok', empty: true, days: whole, rows: [], note: '还没有登记过任何人（先 register）' };
    if (whole === 0) return { ok: true, reason: 'ok', days: 0, rows: [], note: '0 天：什么都没变' };
    const at = nowAt();
    const rows = [];
    let years = 0;
    ids.forEach(function (id) {
      const p = m[id];
      const carry = (p.dayCarry || 0) + whole;
      const up = Math.floor(carry / YEAR_DAYS);
      const rest = carry - up * YEAR_DAYS;
      const age0 = p.age;
      const age1 = age0 + up;
      const want = tierOf(age1);
      const wi = TIERS.indexOf(want); const ci = TIERS.indexOf(p.tier);
      const got = (wi > ci) ? TIERS[Math.min(wi, ci + 1)] : p.tier;   // 一次只许升一档
      const clamped = wi > ci + 1;
      p.age = age1; p.dayCarry = rest; p.tier = got; p.touchedAt = at;
      if (up > 0) { years += up; stat.yearsUp++; }
      if (clamped) stat.clamped++;
      rows.push({ who: id, ageBefore: age0, ageAfter: age1, years: up, dayCarry: rest,
        tierBefore: TIERS[ci], tierAfter: got,
        tierWant: want, clamped: clamped });
    });
    writeAll(capIt(m));
    stat.advanced++;
    return { ok: true, reason: 'ok', days: whole, years: years, rows: rows,
      note: years ? ('过了 ' + years + ' 年：' + rows.filter(function (r) { return r.years; }).length + ' 人长岁数了')
        : ('过了 ' + whole + ' 天，还没满一年：谁都不长岁数') };
  }

  function read(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24);
    if (!who) return refuse('missing-fields', { missing: ['who'] });
    const p = readAll()[who];
    if (!p) return { ok: false, reason: 'not-happened', who: who, note: '没登记过年龄：不猜' };
    return { ok: true, reason: 'ok', who: who, age: p.age, tier: p.tier, tierCN: CN[p.tier],
      dayCarry: p.dayCarry || 0, toNextYear: YEAR_DAYS - (p.dayCarry || 0),
      baseAge: p.baseAge, registeredAt: p.registeredAt };
  }

  /** 谁快过生日了（离下一个整年最近的几位）——给面板/注入面用。 */
  function due() {
    const m = readAll();
    const ids = Object.keys(m);
    if (!ids.length) return { ok: true, reason: 'ok', empty: true, rows: [] };
    const rows = ids.map(function (id) {
      const p = m[id];
      return { who: id, age: p.age, toNextYear: YEAR_DAYS - (p.dayCarry || 0), tier: p.tier, tierCN: CN[p.tier] };
    });
    rows.sort(function (a, b) { return a.toNextYear - b.toNextYear; });
    return { ok: true, reason: 'ok', empty: false, rows: rows.slice(0, 8), total: ids.length, cap: CAP };
  }

  function statOf() { return Object.assign({}, stat); }
  /** 注入面：只有"有人今年长岁数了"才说话；没人过生日 ⇒ 零 token。 */
  function buildBlock() {
    const d = due();
    if (d.empty) return '';
    const near = d.rows.filter(function (r) { return r.toNextYear <= 30; });
    if (!near.length) return '';
    return '【年岁】' + near.map(function (r) { return r.who + ' ' + r.age + ' 岁（' + r.tierCN + '）'; }).join('；')
      + '：快到自己那一天了，样子和力气都在变。';
  }

  WA.aging = {
    TIERS: TIERS.slice(), CN: Object.assign({}, CN), THRESH: THRESH.slice(),
    YEAR_DAYS: YEAR_DAYS, CAP: CAP,
    register: register, advance: advance, read: read, due: due,
    tierOf: tierOf, buildBlock: buildBlock, stat: statOf
  };
})();