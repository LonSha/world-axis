/**
 * WorldAxis engines/pawn-redemption.js (v2.523.0) — EXV27-1 当票质押与赎当
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「当票 / 官银 / 银锭」全仓 `engines/` **0 命中**，而「当铺」只出现在
 *   `engines/plan.js` 的一条**线索文本**里 —— 也就是说：世界里可以「提到」当铺，
 *   但押物、计息、赎当、绝当这一整套**没有一处记账**。
 *   后果：剧情里「他把祖传的镯子当了」只能当旁白写，写不出「当了多少、几个月没赎、
 *   掌柜的为什么已经把它摆上柜台了」。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `pledge` 押物开票（当本 / 月息 / 期限 / 估价）→ `redeem` 赎当（本息结清才还物，
 *   钱不够当场报出差额，不「先还了再说」）→ `forfeit` 绝当（**只有逾期才准**，
 *   且售价高于本息时必须报出「余款应还」—— 当铺不许白吞超额部分）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：票面活在进程态，入档与否由调用方决定（与 EXV24 九台同款）。
 *   ② **利率与期限不由本模块猜**：`monthlyRatePct` / `termMonths` 必须由调用方给，
 *      缺失一律拒收 —— 自动生成一个「合理利息」等于替世界做决定。
 *   ③ **不自己算时间**：已过几个月由调用方给（`months`）。本模块没有时钟，
 *      也不拿设备墙钟推算「逾期了没有」（冻结回放里那会永远算错）。
 *   ④ 拒收码只用 `disabled`；其余用 `hint`（与 `lost-and-found` 同款，不新造码面）。
 *   ⑤ 条数有界（`maxRows`），满了挤掉最旧一条，退出时留痕 `evicted`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_pawn_redemption_settings_v1';
  const DEF = { enabled: true, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'pawnRedemption', bounds: { maxRows: [8, 96] } };
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
  const stat = { pledged: 0, redeemed: 0, forfeited: 0, refused: 0, evicted: 0,
    interestEarned: 0, surplusReturned: 0, lastReason: '' };
  const TICKETS = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function find(id, status) {
    return TICKETS.find(function (r) { return r.id === str(id) && (!status || r.status === status); });
  }
  function pledge(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const pawner = str(s.pawner), item = str(s.item);
    if (!pawner || !item) return refuse('missing-party', 'missing-party：谁押了什么东西，两样都说清');
    const appraisal = num(s.appraisal), principal = num(s.principal);
    const rate = num(s.monthlyRatePct), term = num(s.termMonths);
    if (!(appraisal > 0)) return refuse('missing-appraisal', 'missing-appraisal：押物估了多少？没有估价的当票不算数');
    if (!(principal > 0)) return refuse('missing-principal', 'missing-principal：当本（押出去多少钱）必须给正数');
    if (principal > appraisal) return refuse('over-appraisal', 'over-appraisal：当本 ' + principal + ' 超过估价 ' + appraisal + '，当铺不会做这笔买卖');
    if (!(rate >= 0)) return refuse('missing-rate', 'missing-rate：月息几分由你给（可以给 0），不由本模块替你定');
    if (!(term > 0)) return refuse('missing-term', 'missing-term：期限几个月？没有期限就没有「绝当」这一说');
    if (TICKETS.length >= cfg.maxRows) { TICKETS.shift(); stat.evicted++; }
    const id = 'pt' + (++stat.pledged);
    TICKETS.push({ id: id, pawner: pawner, item: item, appraisal: appraisal, principal: principal,
      monthlyRatePct: rate, termMonths: term, at: s.at || null, by: str(s.by) || null,
      status: 'pawned', months: 0, paid: 0, buyer: null, salePrice: null, surplus: null });
    return { ok: true, id: id, dueMonthly: +(principal * rate / 100).toFixed(2) };
  }
  function dueOf(rec, months) {
    const m = (months == null ? rec.months : months);
    return +(rec.principal * (1 + rec.monthlyRatePct / 100 * m)).toFixed(2);
  }
  function redeem(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = find(id, 'pawned');
    if (!rec) return refuse('unknown-ticket', 'unknown-ticket：没有这张在押的当票（或已赎/已绝当）');
    const months = num(s.months);
    if (!(months >= 0)) return refuse('missing-months', 'missing-months：已过几个月由调用方给（本模块不碰时钟）');
    const paid = num(s.paid);
    if (!(paid >= 0)) return refuse('missing-payment', 'missing-payment：付了多少？');
    const due = dueOf(rec, months);
    if (paid < due) return refuse('insufficient-payment',
      'insufficient-payment：应付本息 ' + due + '，只付了 ' + paid + '（差 ' + +(due - paid).toFixed(2) + '），钱不清不还物');
    rec.months = months; rec.paid = paid; rec.status = 'redeemed';
    stat.redeemed++; stat.interestEarned += +(due - rec.principal).toFixed(2);
    return { ok: true, id: rec.id, due: due, change: +(paid - due).toFixed(2) };
  }
  function forfeit(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = find(id, 'pawned');
    if (!rec) return refuse('unknown-ticket', 'unknown-ticket：没有这张在押的当票');
    const months = num(s.months);
    if (!(months >= 0)) return refuse('missing-months', 'missing-months：绝当先要说清过了几个月');
    if (months <= rec.termMonths) return refuse('not-due',
      'not-due：期限 ' + rec.termMonths + ' 个月未满（现报 ' + months + ' 个月），没过期不许绝当');
    const buyer = str(s.buyer), price = num(s.salePrice);
    if (!buyer) return refuse('missing-buyer', 'missing-buyer：绝当变卖给谁？买家要说得出');
    if (!(price >= 0)) return refuse('missing-price', 'missing-price：卖了多少？绝当价必须落账');
    const due = dueOf(rec, months);
    const surplus = +(price - due).toFixed(2);
    rec.months = months; rec.status = 'forfeited'; rec.buyer = buyer; rec.salePrice = price;
    rec.surplus = surplus > 0 ? surplus : 0;
    stat.forfeited++;
    if (surplus > 0) stat.surplusReturned += surplus;
    return { ok: true, id: rec.id, due: due, surplus: rec.surplus,
      hint: surplus > 0 ? 'surplus-owed：售价超出本息 ' + surplus + '，这笔余款应还给当户，不许吞' : null };
  }
  function view(id) {
    if (id) {
      const rec = find(id);
      return rec ? { ok: true, row: JSON.parse(JSON.stringify(rec)), due: dueOf(rec) } : { ok: false, hint: 'unknown-ticket' };
    }
    return { ok: true, count: TICKETS.length, rows: JSON.parse(JSON.stringify(TICKETS)) };
  }
  function statView() {
    const live = TICKETS.filter(function (r) { return r.status === 'pawned'; });
    return Object.assign({
      live: live.length,
      atRisk: live.filter(function (r) { return r.months > r.termMonths; }).length,
      principalOut: +live.reduce(function (a, r) { return a + r.principal; }, 0).toFixed(2)
    }, stat);
  }
  function reset() {
    TICKETS.length = 0;
    stat.pledged = 0; stat.redeemed = 0; stat.forfeited = 0; stat.refused = 0; stat.evicted = 0;
    stat.interestEarned = 0; stat.surplusReturned = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.pawnRedemption = {
    pledge: pledge, redeem: redeem, forfeit: forfeit, dueOf: dueOf,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/pawn-redemption.js', { kind: 'engine', ver: '2.523.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/pawn-redemption 已加载（2.523.0）');
})();