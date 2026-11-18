/**
 * WorldAxis engines/ward-compact.js (v2.524.0) — EXV27-8 保甲乡约与义仓赈济
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「保正 / 里甲 / 乡规」在 `engines/` **0 命中**，「义仓」只在 `populate.js`
 *   的地名串里出现。断案有 judicial-inquest 家族、调解有 dilemma-bargain，
 *   但**邻里连带**这一层没有：十户一甲、一甲出事甲长受责、乡约在祠堂断个是非、
 *   义仓开仓放赈秋后还 —— 这是前现代基层真正的治理面。
 *
 * ── 机制 ── `enroll` 编甲（甲长 + 户数，一甲最多 `householdsPerWard` 户）→
 *   `accuse` 告发（**同甲连坐**：甲长记一笔）→ `mediate` 乡约断事（只判赔礼 / 赔偿，
 *   **不判刑**）→ `openGranary` 义仓开仓（仓存不足就拒，并记秋还额）。
 *
 * ── 边界 ── ① 不碰 store。② **不越权**：乡约不许判刑、不许没产，只做邻里裁处；
 *   真案子交给公堂（judicial-inquest）。③ 连坐只记在甲长名下，不牵连到具体人头上
 *   （谁做谁当，连带是行政责任不是罪）。④ 拒收码只用 `disabled`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_ward_compact_settings_v1';
  const DEF = { enabled: true, maxRows: 32, householdsPerWard: 10 };
  const __REG = { key: LS_KEY, def: DEF, module: 'wardCompact', bounds: { maxRows: [8, 96], householdsPerWard: [1, 20] } };
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
  const stat = { wards: 0, accusations: 0, mediations: 0, granaryOpens: 0, grantedTotal: 0, refused: 0, evicted: 0, lastReason: '' };
  const WARDS = [];
  const CASES = [];
  const GRANARY = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function r2(v) { return +(Math.round(v * 100) / 100).toFixed(2); }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function find(ward) { return WARDS.find(function (r) { return r.ward === ward; }); }
  function enroll(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const ward = str(s.ward), head = str(s.head), households = num(s.households);
    if (!ward || !head) return refuse('missing-party', 'missing-party：哪一甲、甲长是谁？');
    if (!(households >= 1)) return refuse('missing-households', 'missing-households：这一甲编了几户？');
    if (households > cfg.householdsPerWard) return refuse('too-many-households',
      'too-many-households：一甲最多 ' + cfg.householdsPerWard + ' 户（现报 ' + households + '）—— 编甲不能一甲吃一县');
    if (find(ward)) return refuse('already-enrolled', 'already-enrolled：' + ward + ' 已经编过了');
    if (WARDS.length >= cfg.maxRows) { WARDS.shift(); stat.evicted++; }
    WARDS.push({ ward: ward, head: head, households: households, liability: 0, at: s.at || null });
    stat.wards++;
    return { ok: true, ward: ward, head: head, households: households };
  }
  function accuse(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const ward = str(s.ward), accuser = str(s.accuser), accused = str(s.accused), what = str(s.what);
    if (!ward || !accuser || !accused) return refuse('missing-party', 'missing-party：哪一甲、谁告谁？');
    if (!what) return refuse('missing-what', 'missing-what：告的什么事？说不出事的告发只是结怨');
    if (accuser === accused) return refuse('same-party', 'same-party：自己告自己不算告发');
    const rec = find(ward);
    if (!rec) return refuse('unknown-ward', 'unknown-ward：' + ward + ' 没有编甲记录 —— 没编制的连坐没处记');
    rec.liability++;
    CASES.push({ ward: ward, accuser: accuser, accused: accused, what: what, kind: 'accuse',
      headLiability: rec.liability, at: s.at || null });
    if (CASES.length > 64) CASES.shift();
    stat.accusations++;
    return { ok: true, ward: ward, head: rec.head, liability: rec.liability,
      hint: 'joint-liability：' + ward + ' 出事，甲长 ' + rec.head + ' 记 1 次连坐（第 ' + rec.liability + ' 次）' };
  }
  function mediate(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const ward = str(s.ward), a = str(s.a), b = str(s.b), matter = str(s.matter), award = str(s.award);
    if (!ward || !a || !b) return refuse('missing-party', 'missing-party：哪一甲、谁和谁？');
    if (!matter) return refuse('missing-what', 'missing-what：断的是什么事？');
    if (['apology', 'compensation', 'both'].indexOf(award) < 0) return refuse('out-of-scope',
      'out-of-scope：乡约只能断赔礼(apology) / 赔偿(compensation) / 两样都要(both) —— 判刑与没产不归祠堂管');
    const amount = num(s.amount);
    if (award !== 'apology' && !(amount > 0)) return refuse('missing-amount', 'missing-amount：赔多少要落数');
    CASES.push({ ward: ward, a: a, b: b, matter: matter, kind: 'mediate', award: award,
      amount: award === 'apology' ? 0 : amount, at: s.at || null });
    if (CASES.length > 64) CASES.shift();
    stat.mediations++;
    return { ok: true, ward: ward, award: award, amount: award === 'apology' ? 0 : amount,
      hint: 'settled-in-ward：在祠堂了结（' + award + '），案不上公堂' };
  }
  function openGranary(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const granary = str(s.granary) || '义仓', stock = num(s.stock), amount = num(s.amount), reason = str(s.reason);
    if (!(amount > 0)) return refuse('missing-amount', 'missing-amount：放多少粮？');
    if (!reason) return refuse('missing-reason', 'missing-reason：为什么开仓？说不清缘由的放赈就是分粮');
    const held = isFinite(stock) ? stock : (GRANARY.length ? GRANARY[GRANARY.length - 1].left : 0);
    if (!(held >= amount)) return refuse('insufficient-stock',
      'insufficient-stock：仓里只有 ' + r2(held) + '，放不出 ' + amount + ' —— 义仓不是聚宝盆');
    const row = { granary: granary, amount: amount, reason: reason, left: r2(held - amount),
      repayDue: r2(amount), repaid: 0, at: s.at || null };
    GRANARY.push(row);
    if (GRANARY.length > 32) GRANARY.shift();
    stat.granaryOpens++; stat.grantedTotal = r2(stat.grantedTotal + amount);
    return { ok: true, granary: granary, granted: amount, left: row.left, repayDue: row.repayDue,
      hint: 'repay-later：秋收后要还 ' + row.repayDue + '（救命粮不是白给，但也不能当场催）' };
  }
  function view(ward) {
    if (ward) {
      const rec = find(str(ward));
      return rec ? { ok: true, row: JSON.parse(JSON.stringify(rec)),
        cases: CASES.filter(function (r) { return r.ward === str(ward); }).length } : { ok: false, hint: 'unknown-ward' };
    }
    return { ok: true, wards: WARDS.length, cases: CASES.length, granaryRows: GRANARY.length,
      rows: JSON.parse(JSON.stringify(WARDS)), caseRows: JSON.parse(JSON.stringify(CASES)),
      granary: JSON.parse(JSON.stringify(GRANARY)) };
  }
  function statView() { return Object.assign({}, stat); }
  function reset() {
    WARDS.length = 0; CASES.length = 0; GRANARY.length = 0;
    stat.wards = 0; stat.accusations = 0; stat.mediations = 0; stat.granaryOpens = 0;
    stat.grantedTotal = 0; stat.refused = 0; stat.evicted = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.wardCompact = {
    enroll: enroll, accuse: accuse, mediate: mediate, openGranary: openGranary,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/ward-compact.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/ward-compact 已加载（2.524.0）');
})();