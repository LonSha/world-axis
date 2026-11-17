/**
 * WorldAxis engines/broker-house.js (v2.523.0) — EXV27-4 牙行居间与抽佣
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「牙行 / 脚夫 / 税关」在 `engines/` **0 命中**。市集交易有货价（commodity-circulation）、
 *   有契约（commission），但**中间人**这一层没有：谁做的保、抽几分佣、抬价与「飞过海」
 *   （甩开牙人私下成交）该怎么记账 —— 一处都没有。
 *
 * ── 机制 ── `enlist` 牙人登记 → `match` 撮合买卖双方（牙人必须已登记）→
 *   `commission` 抽佣（佣金率由调用方给，不许超过 `maxRatePct`）→ `defame` 失信入账
 *   （抬价 / 飞过海两途，都要有告发人）。
 *
 * ── 边界 ── ① 不碰 store（与 EXV24 九台同款）。② **不碰货价**：价格由调用方给，
 *   本模块只按价算佣。③ 失信不是概率：必须有 `by`（谁说的），无告发人一律拒收。
 *   ④ 拒收码只用 `disabled`，其余走 `hint`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_broker_house_settings_v1';
  const DEF = { enabled: true, maxRows: 32, maxRatePct: 10 };
  const __REG = { key: LS_KEY, def: DEF, module: 'brokerHouse', bounds: { maxRows: [8, 96], maxRatePct: [0, 30] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { enlisted: 0, matched: 0, fees: 0, feeTotal: 0, defamed: 0, refused: 0, evicted: 0, lastReason: '' };
  const BROKERS = [];
  const DEALS = [];
  const BAD = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function r2(v) { return +(Math.round(v * 100) / 100).toFixed(2); }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function findBroker(broker, district) {
    return BROKERS.find(function (r) { return r.broker === broker && r.district === district; });
  }
  function enlist(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const broker = str(s.broker), district = str(s.district);
    if (!broker || !district) return refuse('missing-party', 'missing-party：哪个牙人、哪片市面？');
    if (findBroker(broker, district)) return refuse('already-enlisted', 'already-enlisted：' + broker + ' 已在 ' + district + ' 挂号');
    if (BROKERS.length >= cfg.maxRows) { BROKERS.shift(); stat.evicted++; }
    BROKERS.push({ broker: broker, district: district, at: s.at || null, deals: 0 });
    stat.enlisted++;
    return { ok: true, broker: broker, district: district };
  }
  function match(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const broker = str(s.broker), district = str(s.district);
    const buyer = str(s.buyer), seller = str(s.seller), goods = str(s.goods);
    const price = num(s.price);
    if (!broker) return refuse('missing-party', 'missing-party：这单是谁保的？');
    if (!findBroker(broker, district)) return refuse('unknown-broker',
      'unknown-broker：' + broker + ' 在 ' + (district || '(未指定市面)') + ' 没有挂号 —— 没牙人保的成交不是牙行生意');
    if (!buyer || !seller || !goods) return refuse('missing-party', 'missing-party：买方、卖方、货物三样都要说清');
    if (buyer === seller) return refuse('same-party', 'same-party：买方和卖方是同一个人，这不是撮合');
    if (!(price > 0)) return refuse('missing-price', 'missing-price：成交价多少？');
    if (DEALS.length >= cfg.maxRows) { DEALS.shift(); stat.evicted++; }
    const rec = findBroker(broker, district); rec.deals++;
    const id = 'bh' + (++stat.matched);
    DEALS.push({ id: id, broker: broker, district: district, buyer: buyer, seller: seller,
      goods: goods, price: price, fee: null, ratePct: null, status: 'matched', at: s.at || null });
    return { ok: true, id: id };
  }
  function commission(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = DEALS.find(function (r) { return r.id === str(id) && r.status === 'matched'; });
    if (!rec) return refuse('unknown-deal', 'unknown-deal：没有这单待抽佣的成交');
    const rate = num(s.ratePct);
    if (!(rate >= 0)) return refuse('missing-rate', 'missing-rate：抽几分？牙人抽佣要落数');
    if (rate > cfg.maxRatePct) return refuse('rate-too-high',
      'rate-too-high：抽 ' + rate + '% 超过上限 ' + cfg.maxRatePct + '% —— 牙行不是抢');
    rec.ratePct = rate; rec.fee = r2(rec.price * rate / 100); rec.status = 'closed';
    stat.fees++; stat.feeTotal = r2(stat.feeTotal + rec.fee);
    return { ok: true, id: rec.id, fee: rec.fee,
      toSeller: r2(rec.price - rec.fee),
      hint: 'fee：买方付 ' + rec.price + '，牙人抽 ' + rec.fee + '，卖方到手 ' + r2(rec.price - rec.fee) };
  }
  function defame(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const broker = str(s.broker), kind = str(s.kind), by = str(s.by);
    if (!broker) return refuse('missing-party', 'missing-party：说谁失信？');
    if (['raise-price', 'fly-over'].indexOf(kind) < 0) return refuse('unknown-kind',
      'unknown-kind：抬价(raise-price) 还是 飞过海(fly-over)？两途都要记账');
    if (!by) return refuse('missing-witness', 'missing-witness：谁说的？无告发人不立失信');
    BAD.push({ broker: broker, kind: kind, by: by, detail: str(s.detail) || null, at: s.at || null });
    if (BAD.length > 64) BAD.shift();
    stat.defamed++;
    return { ok: true, broker: broker, kind: kind, hint: 'defame：' + broker + ' 被 ' + by + ' 告发 ' + kind + '（留痕，交给叙事）' };
  }
  function view(id) {
    if (id) {
      const rec = DEALS.find(function (r) { return r.id === str(id); });
      return rec ? { ok: true, row: JSON.parse(JSON.stringify(rec)) } : { ok: false, hint: 'unknown-deal' };
    }
    return { ok: true, brokers: BROKERS.length, deals: DEALS.length, defamedRows: BAD.length,
      rows: JSON.parse(JSON.stringify(DEALS)), brokerRows: JSON.parse(JSON.stringify(BROKERS)) };
  }
  function statView() { return Object.assign({}, stat); }
  function reset() {
    BROKERS.length = 0; DEALS.length = 0; BAD.length = 0;
    stat.enlisted = 0; stat.matched = 0; stat.fees = 0; stat.feeTotal = 0; stat.defamed = 0;
    stat.refused = 0; stat.evicted = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.brokerHouse = {
    enlist: enlist, match: match, commission: commission, defame: defame,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/broker-house.js', { kind: 'engine', ver: '2.523.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/broker-house 已加载（2.523.0）');
})();