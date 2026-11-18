/**
 * WorldAxis engines/address-form.js (v2.524.0) — EXV29-02 称呼随亲疏
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场读数：`称谓|称呼` 命中 6 文件，但没有一处回答**"这两人的关系该用什么称呼"**。
 *   结果就是同一个人今天被叫"张爷"、明天被叫"老张"、后天又变回"张先生"——
 *   而亲疏却没变过。反过来更常见：关系还很生，AI 先叫上了小名。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   关系有**五档**（陌生 / 点头 / 熟识 / 亲近 / 至交），称呼也有归属档；
 *   `check()` 拿"这个称呼属于第几档"去比"这两人现在是第几档"：
 *   叫得太亲 ⇒ `over-familiar` 并回**对方当场纠正的那一句**；
 *   叫得太生 ⇒ `over-formal`（不纠正，但对方会觉得生分）。
 *   档位一变就记下 `sinceAt`，于是纠正能追到"哪一次变的"。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 只判不说：本模块**不进正文**、不改称呼词表，只回一个判据对象。
 *   ② 没登记不猜：两人之间没登记过称呼/档位 ⇒ `not-happened`（不按默认"熟识"瞎判）。
 *   ③ 越级必有纠正句：`over-familiar` 一定带 `correct`（空串必红）。
 *   ④ 档位单调可追：档位每次变更都留 `sinceAt` 与 `by`（谁改的），不改写历史。
 *   ⑤ 有界：`addressForms` 最多 64 组关系，超出按最久未用挤出（与 `__BOUNDED_CAPS` 对齐）。
 *   ⑥ 同档不刷：把同一组关系设成同一档，不产生新记录、不动 `sinceAt`（幂等）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'addressForms';
  const CAP = 64;
  const TIERS = ['stranger', 'nod', 'known', 'close', 'intimate'];
  const CN = { stranger: '陌生', nod: '点头', known: '熟识', close: '亲近', intimate: '至交' };
  const stat = { set: 0, checked: 0, overFamiliar: 0, overFormal: 0, noRecord: 0, badInput: 0 };
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
      WA.store.transact(function (d) { d[STORE_KEY] = m; return true; }, 'address:form');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function key(a, b) { return String(a) + '\u0000' + String(b); }
  function tierIndex(t) {
    const i = TIERS.indexOf(String(t));
    return i < 0 ? -1 : i;
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 24);
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('addressForm'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= CAP) return m;
    ks.sort(function (a, b) { return (m[a].at || 0) - (m[b].at || 0); });
    ks.slice(0, ks.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  /**
   * 登记/更新一组关系：`from` 叫 `to` 用什么称呼、属于哪一档、关系现在是第几档。
   * 至少要有 form（称呼本身）；tier（称呼归属档）缺省视为当前关系档（即"叫得正好"）。
   */
  function set(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const from = clean(src.from, 24);
    const to = clean(src.to, 24);
    const form = clean(src.form, 24);
    const missing = [];
    if (!from) missing.push('from');
    if (!to) missing.push('to');
    if (!form) missing.push('form');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    const cur = src.tier === undefined ? 'known' : String(src.tier);
    if (tierIndex(cur) < 0) return refuse('bad-tier', { got: cur, allowed: TIERS.slice() });
    const formTier = src.formTier === undefined ? cur : String(src.formTier);
    if (tierIndex(formTier) < 0) return refuse('bad-tier', { got: formTier, allowed: TIERS.slice() });
    const m = readAll();
    const k = key(from, to);
    const prev = m[k];
    const changed = !prev || prev.tier !== cur;
    const at = nowAt();
    m[k] = {
      from: from, to: to, form: form, tier: cur, formTier: formTier,
      at: at,
      sinceAt: changed ? at : (prev && prev.sinceAt ? prev.sinceAt : at),
      prevTier: changed ? (prev ? prev.tier : null) : (prev ? prev.prevTier : null),
      by: clean(src.by, 24) || 'setting'
    };
    writeAll(capIt(m));
    stat.set++;
    return {
      ok: true, reason: 'ok', from: from, to: to, form: form,
      tier: cur, tierCN: CN[cur], formTier: formTier, formTierCN: CN[formTier],
      sinceAt: m[k].sinceAt, changed: changed,
      note: changed ? ('关系档变为「' + CN[cur] + '」：从这一刻起称呼要跟着变')
        : '同档刷新：不改 sinceAt（幂等）'
    };
  }

  /** 只改关系档（称呼沿用已登记的）；没登记过称呼 ⇒ 只记档位，不改 form。 */
  function setTier(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const from = clean(src.from, 24);
    const to = clean(src.to, 24);
    const tier = String(src.tier === undefined ? '' : src.tier);
    const missing = [];
    if (!from) missing.push('from');
    if (!to) missing.push('to');
    if (!tier) missing.push('tier');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    if (tierIndex(tier) < 0) return refuse('bad-tier', { got: tier, allowed: TIERS.slice() });
    const m = readAll();
    const k = key(from, to);
    const prev = m[k];
    if (prev && prev.tier === tier) {
      return { ok: true, reason: 'ok', unchanged: true, from: from, to: to, tier: tier, tierCN: CN[tier], sinceAt: prev.sinceAt, note: '同档：不动 sinceAt' };
    }
    const at = nowAt();
    m[k] = Object.assign({ from: from, to: to, form: prev ? prev.form : '', formTier: prev ? prev.formTier : 'known' }, {
      tier: tier, at: at, sinceAt: at, prevTier: prev ? prev.tier : null, by: clean(src.by, 24) || 'setting'
    });
    writeAll(capIt(m));
    stat.set++;
    return { ok: true, reason: 'ok', from: from, to: to, tier: tier, tierCN: CN[tier], sinceAt: at, prevTier: prev ? prev.tier : null, note: '档位已变：旧称呼从这一刻起算越级' };
  }

  /**
   * 判一次称呼：`from` 当面叫 `to` 用了 `form`。
   * 回 `judge`: fit / over-familiar / over-formal / unknown-form。
   */
  function check(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const from = clean(src.from, 24);
    const to = clean(src.to, 24);
    const form = clean(src.form, 24);
    const missing = [];
    if (!from) missing.push('from');
    if (!to) missing.push('to');
    if (!form) missing.push('form');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    const m = readAll();
    const rec = m[key(from, to)];
    if (!rec) { stat.noRecord++; return { ok: false, reason: 'not-happened', from: from, to: to, form: form, note: '这两人没登记过称呼：不按"默认熟识"瞎判' }; }
    stat.checked++;
    const curI = tierIndex(rec.tier);
    // 用的称呼与登记的不同时，用 formTier 作为它的归属档（登记档是这一组关系的"标准称呼"）。
    const useI = (form === rec.form) ? tierIndex(rec.formTier) : (src.formTier !== undefined ? tierIndex(src.formTier) : curI);
    if (useI < 0) return refuse('bad-tier', { got: src.formTier, allowed: TIERS.slice() });
    const usedTier = TIERS[useI];
    if (useI > curI) {
      stat.overFamiliar++;
      return {
        ok: true, reason: 'ok', judge: 'over-familiar', from: from, to: to, form: form,
        usedTier: usedTier, usedTierCN: CN[usedTier], nowTier: rec.tier, nowTierCN: CN[rec.tier],
        by: Math.abs(useI - curI),
        sinceAt: rec.sinceAt,
        correct: '「' + form + '」这个叫法现在还早：' + to + '当场纠正——"别这么叫我。"（' + CN[rec.tier] + '之间该叫「' + (rec.form || '更客气的叫法') + '」）',
        note: '越级 ' + Math.abs(useI - curI) + ' 档，纠正句随判据一起回'
      };
    }
    if (useI < curI) {
      stat.overFormal++;
      return {
        ok: true, reason: 'ok', judge: 'over-formal', from: from, to: to, form: form,
        usedTier: usedTier, usedTierCN: CN[usedTier], nowTier: rec.tier, nowTierCN: CN[rec.tier],
        sinceAt: rec.sinceAt,
        note: '叫得太生（' + CN[usedTier] + ' 档的称呼用在' + CN[rec.tier] + '的关系上）：不纠正，但对方会觉得生分'
      };
    }
    return {
      ok: true, reason: 'ok', judge: 'fit', from: from, to: to, form: form,
      usedTier: usedTier, usedTierCN: CN[usedTier], nowTier: rec.tier, nowTierCN: CN[rec.tier],
      sinceAt: rec.sinceAt, note: '叫得正好'
    };
  }

  function read(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const from = clean(src.from, 24);
    const to = clean(src.to, 24);
    if (!from || !to) return refuse('missing-fields', { missing: [!from ? 'from' : null, !to ? 'to' : null].filter(Boolean) });
    const rec = readAll()[key(from, to)];
    if (!rec) return { ok: false, reason: 'not-happened', from: from, to: to };
    return { ok: true, reason: 'ok', from: rec.from, to: rec.to, form: rec.form, tier: rec.tier, tierCN: CN[rec.tier], formTier: rec.formTier, sinceAt: rec.sinceAt, prevTier: rec.prevTier };
  }

  function report() {
    const m = readAll();
    const ks = Object.keys(m);
    if (!ks.length) return { ok: true, reason: 'ok', empty: true, rows: [], note: '还没有任何称呼登记' };
    const rows = ks.map(function (k) { const r = m[k]; return { from: r.from, to: r.to, form: r.form, tier: r.tier, tierCN: CN[r.tier], sinceAt: r.sinceAt }; });
    rows.sort(function (a, b) { return (b.sinceAt || 0) - (a.sinceAt || 0); });
    return { ok: true, reason: 'ok', empty: false, rows: rows.slice(0, 12), total: ks.length, cap: CAP };
  }

  function statOf() { return Object.assign({}, stat); }
  /** 注入面：只有真出现越级纠正才说话（没登记、叫得正好 ⇒ 零 token）。 */
  function buildBlock() {
    const r = report();
    if (r.empty) return '';
    const over = r.rows.filter(function (x) { return tierIndex(x.formTier) > tierIndex(x.tier); });
    if (!over.length) return '';
    return '【称呼】有 ' + over.length + ' 组关系在越级叫：' + over[0].from + ' 叫 ' + over[0].to + ' 用了「' + over[0].form + '」，当前只是「' + over[0].tierCN + '」。对方会当场纠正。';
  }

  WA.addressForm = {
    TIERS: TIERS.slice(), CN: Object.assign({}, CN), CAP: CAP,
    set: set, setTier: setTier, check: check, read: read, report: report,
    buildBlock: buildBlock, stat: statOf
  };
})();
