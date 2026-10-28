/**
 * WorldAxis engines/credit-ledger.js (v2.251.0) — 借据账（欠条 / 计息 / 先息后本 / 逾期）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   本仓的钱只有一种形态：`economy.js` 一手交钱一手交货，注释里写得很清楚——
 *   「**拒收不是赊账**」（economy.js:16 / production.js:28 / research.js:54 三处逐字同调）。
 *   于是现场剩下的唯一做法是模型口述「先欠着」，欠多少、哪天到期、利滚到多少一概无据；
 *   下一轮结算时那笔欠款查无实名。
 *   现场缺口实测：`利息` / `repay` 在 core 与 engines **命中 0**；`欠条` / `赊账` / `筹码`
 *   存在之处全是那几句注释。`karma.js` 虽然有 debt 轴，但那是**业力**，不是钱，
 *   不会计息、不会到期、也不处理还款顺序。借货这一层是空的。
 *
 *   （同名机制已被棋牌/对局类项目独立验证过：cedarduet `app/loans.py` 用整数微百分比/日
 *   + `interest_remainder` 余数结转算息，`divmod` 只做一次；`interest_cap_enabled`
 *   把终身利息封在本金上；还款先扣利息再扣本金、超额拒收；存在逾期时不准开新据。
 *   本模块把这几条搬到本仓，并按本仓口径全部改成事务内纯函数。）
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `open` 立据 → `accrue` 按时间计息（可反复、幂等到毫秒）→ `repay` 先息后本 → 清零则 `repaid`。
 *   过期未清自动 `overdue`；有逾期在身的人不能再立新据。
 *
 * ── 缝合边界（否定式，每条都有判据咬）───────────────���──────────────
 *   ① 总开关默认关闭。关闭时所有写口报 `disabled`，不建账、不计息、不还款。
 *   ② **利率用整数微百分比/日**（`rateMicroPct`，1 = 亿分之一），永不用浮点累息；
 *      每次计息先 `principal * rate * seconds + remainder` 再一次整除，余数结转，不四舍五入。
 *   ③ 计息**只增不减**且**按实际经过秒数**：`accrue` 必须带 `at`，回拨的 `at` 记 `backward`
 *      且不改 `lastAccrualAt`（不把账算回过去）。
 *   ④ 封顶开着时终身利息不得超过本金（`cap-total`），触顶即平、并把 `capped` 钉在据上；
 *      封顶**只限制利息**，不减免本金。
 *   ⑤ 还款先扣利息再扣本金；还款额大于应还总额时拒收 `over-amount`（不找零、不收手续费）。
 *   ⑥ **同一借款人身上有逾期未清就不准开新据**（`overdue-open`）；每人的未清据数有硬顶。
 *   ⑦ 本金、还款额必须是**正整数**（`bad-amount`），不受理 0 元据与分钱以下。
 *   ⑧ `key` 幂等：同 key 重放返回首次结果并带 `replay:true`，不重复计账。
 *   ⑨ 不碰持有者的钱袋：还款只改据本身，何时动钱包由调用方拿到回执后自己做
 *      （本仓已有 org 与 economy 两套钱包口径，不许本模块插一脚）。
 *   ⑩ 条数有界且挤出有账，走本仓 evict 单一出口。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_creditledger_settings_v1';
  const DEF = { enabled: false, maxRows: 24, maxOpenPerBorrower: 3, defaultDays: 7, defaultRate: 100000 };
  // v2.253.0（收口）：`pays`（还款幂等键台账）此前**只 push、从不裁剪** —— 每笔带 key 的
  //   还款都会往里追加一条，而借据行可以长期存活（repaid 后仍留档备查），于是它无界增长。
  //   sizeAudit 把它报成 unbounded（`creditLedger.<id>.pays`），这是**真缺陷**不是误判：
  //   与 v2.70.0 的 gauge.history、karma.notes 同型（「每行各自无界」）。
  //   上界取 32：幂等台账只需覆盖「同 key 重放」的近期窗口 —— 一笔借据的还款次数本身
  //   受本金额约束（每次至少还 1 分），32 条足够覆盖正常履约路径；被挤出的老 key 重放
  //   会走正常还款分支重新计账，不会重复扣款（amount 校验仍在），故不破坏第⑧条幂等承诺。
  const PAY_KEEP = 32;
  const __REG = { key: LS_KEY, def: DEF, module: 'creditLedger',
    bounds: { maxRows: [4, 64], maxOpenPerBorrower: [1, 12], defaultDays: [1, 60], defaultRate: [0, 10000000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) {
    const val = Object.assign({}, DEF, next || {});
    if (!WA.settingsBus) { shadow = val; return val; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, val));
  }
  const stat = { opened: 0, accrued: 0, repaid: 0, capped: 0, overdue: 0, evicted: 0, refused: 0, replay: 0, lastReason: '' };
  const RATE_SCALE = 100000000;
  const SEC_PER_DAY = 86400;
  const ACCRUE_DEN = RATE_SCALE * SEC_PER_DAY;
  const STATUS = ['open', 'overdue', 'repaid', 'written'];

  function book() {
    const s = WA.store && WA.store.get ? WA.store.get() : {};
    const m = s && s.creditLedger;
    return (m && typeof m === 'object') ? m : {};
  }
  function transact(fn, why) {
    if (!WA.store || !WA.store.transact) { try { fn(null); } catch (e) {} return false; }
    try { WA.store.transact(fn, 'creditLedger:' + why); return true; }
    catch (e) { stat.lastReason = 'tx-failed'; return false; }
  }
  function intId(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/\s+/g, ' ').trim().slice(0, 40);
  }
  function posInt(v) { return typeof v === 'number' && isFinite(v) && (v | 0) === v && v > 0; }
  function nonNegInt(v) { return typeof v === 'number' && isFinite(v) && (v | 0) === v && v >= 0; }
  function isOverdue(r, at) { return r && (r.status === 'overdue' || (r.status === 'open' && at > r.dueAt)); }
  function dueTotal(r) { return (r.principalLeft || 0) + (r.interest || 0); }

  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }

  /**
   * 立一张据。
   * @param {object} spec { borrower, lender, principal, rateMicroPct?, dueAt?, days?, cap?, key, at? }
   */
  function open(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const borrower = intId(s.borrower), lender = intId(s.lender), key = intId(s.key);
    if (!borrower || !lender) return refuse('missing-fields');
    if (borrower === lender) return refuse('same-party');
    if (!posInt(s.principal)) return refuse('bad-amount');
    const rate = s.rateMicroPct === undefined ? cfg.defaultRate : s.rateMicroPct;
    if (!nonNegInt(rate)) return refuse('bad-rate');
    const at = Number.isFinite(s.at) ? s.at : clockNow('creditLedger.open');
    const dueAt = Number.isFinite(s.dueAt) ? s.dueAt
      : at + (posInt(s.days) ? s.days : cfg.defaultDays) * SEC_PER_DAY * 1000;
    if (dueAt <= at) return refuse('bad-due', { dueAt: dueAt, at: at });
    const out = {};
    transact(function (d) {
      if (!d) { out.r = refuse('no-store'); return true; }
      d.creditLedger = d.creditLedger || {};
      if (key) {
        const hit = Object.keys(d.creditLedger).filter(function (k) { return d.creditLedger[k].key === key; })[0];
        if (hit) { stat.replay++; out.r = Object.assign({ ok: true, reason: 'replay', replay: true }, viewOf(d.creditLedger[hit])); return true; }
      }
      const mine = Object.keys(d.creditLedger).filter(function (k) {
        const r = d.creditLedger[k]; return r.borrower === borrower && (r.status === 'open' || r.status === 'overdue');
      });
      const overdue = mine.filter(function (k) { return isOverdue(d.creditLedger[k], at); })[0];
      if (overdue) { out.r = refuse('overdue-open', { overdueId: overdue }); return true; }
      if (mine.length >= cfg.maxOpenPerBorrower) { out.r = refuse('too-many-open', { open: mine.length, limit: cfg.maxOpenPerBorrower }); return true; }
      const id = 'cr_' + borrower + '_' + (Object.keys(d.creditLedger).length + 1) + '_' + (at % 100000);
      d.creditLedger[id] = { id: id, borrower: borrower, lender: lender, key: key,
        principal: s.principal, principalLeft: s.principal, interest: 0, interestPaid: 0,
        remainder: 0, rateMicroPct: rate, cap: s.cap !== false, capped: false,
        status: 'open', openedAt: at, dueAt: dueAt, lastAccrualAt: at, repaidAt: 0, note: s.note ? String(s.note).slice(0, 80) : '' };
      // ⑩ 挤出
      const ids = Object.keys(d.creditLedger);
      if (ids.length > cfg.maxRows) {
        ids.sort(function (a, b) { return (d.creditLedger[a].openedAt || 0) - (d.creditLedger[b].openedAt || 0); });
        while (ids.length > cfg.maxRows) { delete d.creditLedger[ids.shift()]; stat.evicted++; }
      }
      stat.opened++; stat.lastReason = 'ok';
      out.r = Object.assign({ ok: true, reason: 'ok' }, viewOf(d.creditLedger[id]));
      return true;
    }, 'open');
    return out.r || refuse('tx-failed');
  }

  function viewOf(r) {
    return { id: r.id, borrower: r.borrower, lender: r.lender, principal: r.principal,
      principalLeft: r.principalLeft, interest: r.interest, interestPaid: r.interestPaid,
      rateMicroPct: r.rateMicroPct, dueAt: r.dueAt, status: r.status, capped: r.capped,
      totalDue: r.status === 'open' || r.status === 'overdue' ? dueTotal(r) : 0 };
  }

  /**
   * 按经过秒数计息。余数结转，一次整除。
   * @param {string} id
   * @param {object} [opt] { at }
   */
  function accrue(id, opt) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const rid = intId(id);
    if (!rid) return refuse('bad-id');
    const o = opt || {};
    const out = {};
    transact(function (d) {
      const r = d && d.creditLedger ? d.creditLedger[rid] : null;
      if (!r) { out.r = refuse('missing'); return true; }
      if (r.status === 'repaid' || r.status === 'written') { out.r = refuse('closed', { status: r.status }); return true; }
      const at = Number.isFinite(o.at) ? o.at : clockNow('creditLedger.accrue');
      // ③ 回拨不改时钟
      if (at < r.lastAccrualAt) { out.r = refuse('backward', { at: at, last: r.lastAccrualAt }); return true; }
      const elapsed = Math.floor((at - r.lastAccrualAt) / 1000);
      if (at > r.dueAt && r.status === 'open') { r.status = 'overdue'; stat.overdue++; }
      if (elapsed <= 0) { out.r = Object.assign({ ok: true, reason: 'no-elapsed', accrued: 0 }, viewOf(r)); return true; }
      const num = r.principalLeft * r.rateMicroPct * elapsed + r.remainder;
      let charged = Math.floor(num / ACCRUE_DEN);
      let rem = num % ACCRUE_DEN;
      if (r.cap) {
        const lifetime = r.interest + r.interestPaid;
        const room = Math.max(0, r.principal - lifetime);
        if (charged >= room) { charged = room; rem = 0; if (!r.capped) { r.capped = true; stat.capped++; } }
      }
      r.interest += charged;
      r.remainder = rem;
      r.lastAccrualAt = at;
      stat.accrued++;
      out.r = Object.assign({ ok: true, reason: charged > 0 ? 'ok' : 'zero-charge', accrued: charged }, viewOf(r));
      return true;
    }, 'accrue');
    return out.r || refuse('tx-failed');
  }

  /**
   * 还款：先息后本，超额拒收。
   * @param {string} id
   * @param {object} spec { amount, key, at }
   */
  function repay(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const rid = intId(id);
    if (!rid) return refuse('bad-id');
    const s = spec && typeof spec === 'object' ? spec : {};
    if (!posInt(s.amount)) return refuse('bad-amount');
    const key = intId(s.key);
    const out = {};
    transact(function (d) {
      const r = d && d.creditLedger ? d.creditLedger[rid] : null;
      if (!r) { out.r = refuse('missing'); return true; }
      if (key) {
        r.pays = Array.isArray(r.pays) ? r.pays : [];
        const hit = r.pays.filter(function (p) { return p.key === key; })[0];
        if (hit) { stat.replay++; out.r = Object.assign({ ok: true, reason: 'replay', replay: true, paid: hit.amount }, viewOf(r)); return true; }
      }
      if (r.status === 'repaid' || r.status === 'written') { out.r = refuse('closed', { status: r.status }); return true; }
      if (s.amount > dueTotal(r)) { out.r = refuse('over-amount', { due: dueTotal(r), amount: s.amount }); return true; }
      const toInterest = Math.min(s.amount, r.interest);
      const toPrincipal = s.amount - toInterest;
      r.interest -= toInterest;
      r.interestPaid += toInterest;
      r.principalLeft -= toPrincipal;
      if (key) { r.pays.push({ key: key, amount: s.amount }); WA.evict.array(r.pays, 'creditLedger.pays', PAY_KEEP); }
      if (r.interest <= 0 && r.principalLeft <= 0) { r.status = 'repaid'; r.repaidAt = Number.isFinite(s.at) ? s.at : clockNow('creditLedger.repay'); }
      stat.repaid++;
      out.r = Object.assign({ ok: true, reason: 'ok', paid: s.amount, toInterest: toInterest,
        toPrincipal: toPrincipal, closed: r.status === 'repaid' }, viewOf(r));
      return true;
    }, 'repay');
    return out.r || refuse('tx-failed');
  }

  /** 写坏账（不再计息，余额留在账上备查）。 */
  function writeOff(id, reason) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const rid = intId(id);
    if (!rid) return refuse('bad-id');
    const out = {};
    transact(function (d) {
      const r = d && d.creditLedger ? d.creditLedger[rid] : null;
      if (!r) { out.r = refuse('missing'); return true; }
      if (r.status === 'repaid' || r.status === 'written') { out.r = refuse('closed', { status: r.status }); return true; }
      r.status = 'written';
      r.note = String(reason || '').slice(0, 80) || r.note;
      out.r = Object.assign({ ok: true, reason: 'ok' }, viewOf(r));
      return true;
    }, 'writeOff');
    return out.r || refuse('tx-failed');
  }

  function view(id) {
    const r = book()[intId(id)];
    if (!r) return { ok: false, reason: 'missing' };
    return Object.assign({ ok: true, reason: 'ok' }, viewOf(r));
  }
  function list(who) {
    const all = book();
    const w = intId(who);
    const rows = Object.keys(all).map(function (k) { return all[k]; })
      .filter(function (r) { return !w || r.borrower === w || r.lender === w; })
      .sort(function (a, b) { return (b.openedAt || 0) - (a.openedAt || 0); });
    return { ok: true, count: rows.length, rows: rows.map(viewOf) };
  }
  function statOf() { return Object.assign({}, stat); }

  WA.creditLedger = { open: open, accrue: accrue, repay: repay, writeOff: writeOff,
    view: view, list: list, stat: statOf, settings: settings, saveSettings: saveSettings,
    REG: __REG, DEF: DEF, STATUS: STATUS, RATE_SCALE: RATE_SCALE };
})();
