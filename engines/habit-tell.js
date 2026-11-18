/**
 * WorldAxis engines/habit-tell.js (v2.524.0) — EXV29-04 习惯动作可认人
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   `idiosyncrasy` 有登记口（`registerIdiosyncrasy`）与触发口，但它记的是**有没有这个怪癖**，
 *   记不住**"这个人在紧张时才会这样"**。于是现场的习惯动作退化成两个极端：
 *   要么固定每轮都来一次（变标签），要么一次都不出现（等于没有）。
 *   而读者认人恰恰靠的就是**频率差**：他平静时几乎不这样，一急就来了。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   给一个人的一个小动作登记**三种情绪下的出现频率**（calm / tense / angry），
 *   `shouldShow({who,mood})` 按那个频率掷一次，回**这一轮出现没出现**；
 *   `identify()` 拿"我看过他几次"去算**认出他**的概率——看得越多越认得准。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不是标签：`shown:false` 是**正常结果**，本模块从不"保证每轮都演"。
 *   ② 三种情绪必齐：缺一种 ⇒ `missing-fields`（点名缺哪种），不许用一种频率顶三种。
 *   ③ 频率须在 0..1：越界 ⇒ `bad-target`（不许写 3 表示"三次"）。
 *   ④ 没登记不猜：没这个人 ⇒ `not-happened`。
 *   ⑤ 零次认不出：`sightings=0` 时 `chance` 必须为 0（没看过不可能认得）。
 *   ⑥ 有界：`habitTells` 最多 48 人，超出按最久未用挤出（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'habitTells';
  const CAP = 48;
  const MOODS = ['calm', 'tense', 'angry'];
  const CN = { calm: '平静', tense: '紧张', angry: '发怒' };
  const stat = { registered: 0, rolled: 0, shown: 0, hidden: 0, identified: 0, badInput: 0 };
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
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'habit:tell');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 32);
  }
  function nowAt() {
    try { return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('habitTell') : Date.now(); }
    catch (e) { return Date.now(); }
  }
  // 只走 `WA.rand`（时间/随机源的单一出口）。没有 rand 时**不掷**：
  //   退化成"只有频率 1 才必然出现"，宁可少演一次，也不许用裸随机源绕过单一出口。
  function roll(p) {
    try {
      if (WA.rand && typeof WA.rand.chance === 'function') return !!WA.rand.chance(p);
    } catch (e) { return false; }
    return p >= 1;
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= CAP) return m;
    ks.sort(function (a, b) { return (m[a].touchedAt || 0) - (m[b].touchedAt || 0); });
    ks.slice(0, ks.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  /** 登记一个人的一个小动作 + 三种情绪下的频率（幂等：同人同动作只一条）。 */
  function register(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 32);
    const tell = clean(src.tell, 32);
    const missing = [];
    if (!who) missing.push('who');
    if (!tell) missing.push('tell');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    const raw = (src.rates && typeof src.rates === 'object') ? src.rates : {};
    const rates = {};
    const lack = [];
    for (let i = 0; i < MOODS.length; i++) {
      const k = MOODS[i];
      const v = Number(raw[k]);
      if (!isFinite(v)) { lack.push(k); continue; }
      if (v < 0 || v > 1) return refuse('bad-target', { field: k, got: raw[k], why: '频率须 0..1' });
      rates[k] = Math.round(v * 1000) / 1000;
    }
    if (lack.length) return refuse('missing-fields', { missing: lack, why: '三种情绪的频率必须齐全（不许用一种顶三种）' });
    const m = readAll();
    const prev = m[who];
    const at = nowAt();
    m[who] = {
      who: who, tell: tell, rates: rates,
      seen: prev ? (prev.seen || 0) : 0,
      shownCount: prev ? (prev.shownCount || 0) : 0,
      at: prev ? (prev.at || at) : at, touchedAt: at
    };
    writeAll(capIt(m));
    stat.registered++;
    return { ok: true, reason: 'ok', who: who, tell: tell, rates: Object.assign({}, rates),
      created: !prev, note: prev ? '已有此人：本次只刷动作与频率' : '习惯动作已登记（三种情绪各一条频率）' };
  }

  /** 这一轮该不该出现：按情绪频率掷一次。`shown:false` 是正常结果。 */
  function shouldShow(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 32);
    const mood = clean(src.mood, 16) || 'calm';
    if (!who) return refuse('missing-fields', { missing: ['who'] });
    if (MOODS.indexOf(mood) < 0) return { ok: false, reason: 'unknown-kind', field: 'mood', got: mood, allowed: MOODS.slice() };
    const m = readAll();
    const p = m[who];
    if (!p) return { ok: false, reason: 'not-happened', who: who, note: '没登记过这个小动作：不猜' };
    const rate = p.rates[mood];
    const shown = rate > 0 ? roll(rate) : false;   // 频率 0 ⇒ 一定不出现（不是"掷一次碰运气"）
    stat.rolled++;
    if (shown) stat.shown++; else stat.hidden++;
    p.seen = (p.seen || 0) + 1;
    if (shown) p.shownCount = (p.shownCount || 0) + 1;
    p.touchedAt = nowAt();
    writeAll(m);
    return { ok: true, reason: 'ok', who: who, tell: p.tell, mood: mood, moodCN: CN[mood],
      rate: rate, shown: shown,
      note: shown ? (p.tell + '——' + CN[mood] + '时他这样')
        : (CN[mood] + '时他没这样：不出现也是正常的，不然就成了标签') };
  }
  /**
   * 认出他：`sightings` 是我看过他次数。看他越多次、这个动作在该情绪下越常见，越认得准。
   * 概率 = 1 - (1-rate)^sightings（一次都没看过 ⇒ 0）。
   */
  function identify(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const observer = clean(src.observer, 32);
    const who = clean(src.who, 32);
    const mood = clean(src.mood, 16) || 'calm';
    const sightings = Number(src.sightings);
    if (!who) return refuse('missing-fields', { missing: ['who'] });
    if (!isFinite(sightings) || sightings < 0) return refuse('bad-target', { field: 'sightings', got: src.sightings });
    const m = readAll();
    const p = m[who];
    if (!p) return { ok: false, reason: 'not-happened', who: who };
    if (MOODS.indexOf(mood) < 0) return { ok: false, reason: 'unknown-kind', field: 'mood', got: mood, allowed: MOODS.slice() };
    const rate = p.rates[mood];
    const n = Math.floor(sightings);
    const chance = n <= 0 ? 0 : Math.round((1 - Math.pow(1 - rate, n)) * 1000) / 1000;
    const recognize = chance > 0 ? roll(chance) : false;
    if (recognize) stat.identified++;
    return { ok: true, reason: 'ok', observer: observer || 'anonymous', who: who, tell: p.tell,
      mood: mood, moodCN: CN[mood], rate: rate, sightings: n, chance: chance, recognize: recognize,
      note: n <= 0 ? '一次都没看过：认不出来（概率 0，不许凭空认出）'
        : (recognize ? ('看这动作就知道是他：' + p.tell) : '还没认出来：动作像，但拿不准') };
  }

  function read(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 32);
    if (!who) return refuse('missing-fields', { missing: ['who'] });
    const p = readAll()[who];
    if (!p) return { ok: false, reason: 'not-happened', who: who };
    return { ok: true, reason: 'ok', who: p.who, tell: p.tell, rates: Object.assign({}, p.rates),
      seen: p.seen || 0, shownCount: p.shownCount || 0 };
  }

  function report() {
    const m = readAll();
    const ks = Object.keys(m);
    if (!ks.length) return { ok: true, reason: 'ok', empty: true, rows: [] };
    const rows = ks.map(function (k) {
      const p = m[k];
      return { who: p.who, tell: p.tell, rates: Object.assign({}, p.rates), seen: p.seen || 0, shownCount: p.shownCount || 0 };
    });
    rows.sort(function (a, b) { return (b.seen || 0) - (a.seen || 0); });
    return { ok: true, reason: 'ok', empty: false, rows: rows.slice(0, 12), total: ks.length, cap: CAP };
  }

  function statOf() { return Object.assign({}, stat); }
  /** 注入面：只有在"不平静的情绪下真出现了"才说话（平静时的路过动作不值得占 token）。 */
  function buildBlock() {
    const r = report();
    if (r.empty) return '';
    const hot = r.rows.filter(function (x) { return (x.rates.tense || 0) >= 0.4 || (x.rates.angry || 0) >= 0.4; });
    if (!hot.length) return '';
    return '【小动作】' + hot.slice(0, 3).map(function (x) {
      return x.who + ' 一' + ((x.rates.angry || 0) >= (x.rates.tense || 0) ? '发怒' : '紧张') + '就会' + x.tell;
    }).join('；') + '——这是认他的凭据。';
  }

  WA.habitTell = {
    MOODS: MOODS.slice(), CN: Object.assign({}, CN), CAP: CAP,
    register: register, shouldShow: shouldShow, identify: identify, read: read, report: report,
    buildBlock: buildBlock, stat: statOf
  };
})();