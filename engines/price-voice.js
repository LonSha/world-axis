/**
 * WorldAxis engines/price-voice.js (v2.524.0) — EXV29-25 三人三价
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场有价（`economy.price/bandOf`），但**一个铺子对谁都报同一个数**：
 *   生客与熟客、急用与不急、晓得行市与不晓得——三样差别在报价里一分钱都不显。
 *   于是"他宰我"这件事在正文里既写不出来，也赖不掉。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   一次报价 = 底价 × （1 + 急迫加成 − 熟人让价 + 生客加价 − 知情让价），逐项写成理由。
 *   **纯函数**：不掷骰、不写存档、不看运气——同样的入参永远同一个价（负控制）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）────────────────────────────
 *   ① 不许掷骰：同参两次报价**逐字相同**（负控制：掺随机必红）。
 *   ② 不许空口：每条加减都带一句理由（`why` 不能为空）。
 *   ③ 同一物可比：`compare` 用同一底价算三人，价差全在身份/急迫/知情上。
 *   ④ 档位白名单：`urgency` 0–3、`knowledge` 三档；越界 ⇒ `unknown-kind`。
 *   ⑤ 无底价不报价：`base` 非正数 ⇒ `missing-fields`（不替铺子编价）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const URGENCY_MAX = 3;
  const KNOW = ['none', 'some', 'insider'];
  const KCN = { none: '不晓行市', some: '知道个大概', insider: '晓得行市' };
  // 每档加减的“分”，逐项可读（不是随手乘个系数）
  const RULES = {
    urgency: [0, 8, 18, 35],        // %
    stranger: 20,                    // 生客加价 %
    regular: -12,                    // 熟人让价 %
    know: { none: 0, some: -8, insider: -15 } // 知情让价 %
  };
  const stat = { quoted: 0, compared: 0, refused: 0 };

  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 40);
  }
  function refuse(code, extra) {
    stat.refused++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }

  /**
   * 报一次价。纯函数：不掷骰、不写档。
   * @param {object} spec { place, resource, buyer, base, urgency, knowledge, regular }
   */
  function quote(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const resource = clean(src.resource, 40);
    const buyer = clean(src.buyer, 40);
    const base = Number(src.base);
    if (!resource) return refuse('missing-fields', { missing: ['resource'] });
    if (!buyer) return refuse('missing-fields', { missing: ['buyer'] });
    if (!isFinite(base) || base <= 0) return refuse('missing-fields', { missing: ['base'], why: '没有底价就没有报价：不替铺子编价' });
    const urgency = src.urgency === undefined ? 0 : Number(src.urgency);
    if (!isFinite(urgency) || URGENCY_MAX < urgency || urgency < 0 || (urgency | 0) !== urgency) {
      return refuse('unknown-kind', { field: 'urgency', got: src.urgency, allowed: [0, 1, 2, 3] });
    }
    const knowledge = clean(src.knowledge, 12) || 'none';
    if (KNOW.indexOf(knowledge) < 0) return refuse('unknown-kind', { field: 'knowledge', got: knowledge, allowed: KNOW.slice() });
    const regular = src.regular === true;
    const why = [];
    let pct = 0;
    if (RULES.urgency[urgency]) {
      const add = RULES.urgency[urgency];
      pct += add; why.push('急用（' + urgency + ' 档）+ ' + add + '%');
    }
    if (regular) { pct += RULES.regular; why.push('熟客 − ' + Math.abs(RULES.regular) + '%'); }
    else { pct += RULES.stranger; why.push('生面孔 + ' + RULES.stranger + '%'); }
    const kd = RULES.know[knowledge];
    if (kd) { pct += kd; why.push(KCN[knowledge] + ' − ' + Math.abs(kd) + '%'); }
    const price = Math.round(base * (1 + pct / 100) * 100) / 100;
    stat.quoted++;
    return {
      ok: true, reason: 'ok', place: clean(src.place, 40) || null, resource: resource, buyer: buyer,
      base: base, price: price, pct: pct, why: why,
      line: '「' + resource + '」底价 ' + base + '，给' + buyer + '报 ' + price + '（' + why.join('；') + '）'
    };
  }

  /** 同一物对三个人各报一次：价差全落在身份/急迫/知情上，底价只有一个。 */
  function compare(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const base = Number(src.base);
    const buyers = Array.isArray(src.buyers) ? src.buyers : [];
    if (!isFinite(base) || base <= 0) return refuse('missing-fields', { missing: ['base'] });
    if (!buyers.length) return refuse('missing-fields', { missing: ['buyers'], why: '要比较就得至少两个人' });
    const quotes = [];
    for (let i = 0; i < buyers.length; i++) {
      const b = (buyers[i] && typeof buyers[i] === 'object') ? buyers[i] : {};
      const q = quote({ place: src.place, resource: src.resource || b.resource, buyer: b.buyer || b.who,
        base: base, urgency: b.urgency, knowledge: b.knowledge, regular: b.regular });
      if (!q.ok) return q;
      quotes.push({ buyer: q.buyer, price: q.price, pct: q.pct, why: q.why });
    }
    const prices = quotes.map(function (q) { return q.price; });
    const spread = Math.max.apply(null, prices) - Math.min.apply(null, prices);
    stat.compared++;
    return {
      ok: true, reason: 'ok', resource: clean(src.resource, 40) || null, base: base,
      quotes: quotes, spread: Math.round(spread * 100) / 100,
      even: spread === 0,
      note: spread === 0 ? '三个人一个价：这一回没有身份差、没有急用、没有信息差'
        : ('同一件东西三个价（差 ' + (Math.round(spread * 100) / 100) + '）：每一档都写得出凭什么')
    };
  }

  function statOf() { return Object.assign({}, stat); }

  WA.priceVoice = {
    KNOW: KNOW.slice(), KCN: Object.assign({}, KCN), URGENCY_MAX: URGENCY_MAX, RULES: JSON.parse(JSON.stringify(RULES)),
    quote: quote, compare: compare, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/price-voice.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/price-voice 已加载（2.524.0）');
})();