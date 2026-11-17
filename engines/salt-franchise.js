/**
 * WorldAxis engines/salt-franchise.js (v2.523.0) — EXV27-3 盐引专卖与私盐查缉
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「盐政 / 盐引」在 `engines/` **0 命中**，「私盐」同样。世界里盐价涨了、盐商富了，
 *   但**引额**这层行政契约不存在：谁有资格卖多少盐、卖超了算不算私盐、私盐被谁拿住
 *   该不该没入 —— 一处都没有记账。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `grant` 登记引额（商人 / 引地 / 引数，同商同地只许登记一次）→ `drawSalt` 支盐
 *   （每支一次从余额扣，**超余额就是私盐**：拒收 + 记 `overQuota` 嫌疑）→ `seize`
 *   查缉没入（**必须有见证人**，说不出谁看见的就不算查获）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：引册活在进程态（与 EXV24 九台同款）。
 *   ② **不掷骰判定查获**：查缉不是概率事件，是「有没有人证」；无见证一律拒收。
 *   ③ 不解释「官盐该卖几钱」：价格不属本模块。
 *   ④ 拒收码只用 `disabled`；其余用 `hint`。
 *   ⑤ 引册有界（`maxRows`），满了挤最旧一条并留痕 `evicted`（余额随行作废）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_salt_franchise_settings_v1';
  const DEF = { enabled: true, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'saltFranchise', bounds: { maxRows: [8, 96] } };
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
  const stat = { grants: 0, drawn: 0, seized: 0, refused: 0, evicted: 0,
    overQuota: 0, drawnTotal: 0, seizedTotal: 0, lastReason: '' };
  const CHARTERS = [];
  const CASES = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function r2(v) { return +(Math.round(v * 100) / 100).toFixed(2); }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function find(merchant, district) {
    return CHARTERS.find(function (r) { return r.merchant === merchant && r.district === district; });
  }
  function grant(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const merchant = str(s.merchant), district = str(s.district), quota = num(s.quota);
    if (!merchant || !district) return refuse('missing-party', 'missing-party：哪个商人、哪块引地？两样都要说清');
    if (!(quota > 0)) return refuse('missing-quota', 'missing-quota：引额多少（引数）？没有额度就没有「私盐」这条线');
    const old = find(merchant, district);
    if (old) return refuse('already-granted',
      'already-granted：' + merchant + ' 在 ' + district + ' 已有引额 ' + old.quota + '（余额 ' + r2(old.left) + '），不重复发引');
    if (CHARTERS.length >= cfg.maxRows) { CHARTERS.shift(); stat.evicted++; }
    CHARTERS.push({ merchant: merchant, district: district, quota: quota, used: 0, left: quota,
      grantedAt: s.at || null, by: str(s.by) || null });
    stat.grants++;
    return { ok: true, merchant: merchant, district: district, quota: quota };
  }
  function drawSalt(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const merchant = str(s.merchant), district = str(s.district), amount = num(s.amount);
    if (!merchant || !district) return refuse('missing-party', 'missing-party：谁在哪块引地支盐？');
    if (!(amount > 0)) return refuse('missing-amount', 'missing-amount：支多少引盐？');
    const rec = find(merchant, district);
    if (!rec) return refuse('unknown-charter', 'unknown-charter：' + merchant + ' 在 ' + district + ' 没有引额登记，无引而支即私盐');
    if (amount > rec.left) {
      stat.overQuota++;
      return { ok: false, reason: 'over-quota', over: true,
        hint: 'over-quota：余额只剩 ' + r2(rec.left) + ' 引，却要支 ' + amount + ' 引 —— 超出部分是**私盐**，要么改数，要么承认这是私盐（交给查缉面）',
        left: r2(rec.left) };
    }
    rec.used = r2(rec.used + amount); rec.left = r2(rec.left - amount);
    stat.drawn++; stat.drawnTotal = r2(stat.drawnTotal + amount);
    return { ok: true, merchant: merchant, district: district, drawn: amount, left: rec.left };
  }
  function seize(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const merchant = str(s.merchant), amount = num(s.amount), witness = str(s.witness);
    if (!merchant) return refuse('missing-party', 'missing-party：谁的私盐？');
    if (!(amount > 0)) return refuse('missing-amount', 'missing-amount：查获多少？');
    if (!witness) return refuse('missing-witness',
      'missing-witness：谁看见了？无见证不查获 —— 凭空把盐没收，和抢没区别');
    const district = str(s.district) || null;
    const rec = find(merchant, district || '');
    if (rec) { rec.used = r2(rec.used + amount); }
    stat.seized++; stat.seizedTotal = r2(stat.seizedTotal + amount);
    const row = { merchant: merchant, district: district, amount: amount, witness: witness, at: s.at || null };
    CASES.push(row);
    if (CASES.length > 64) CASES.shift();
    return { ok: true, merchant: merchant, amount: amount, witness: witness,
      hint: 'seized：没入 ' + amount + ' 引（见证人 ' + witness + '）—— 这一笔要能追到人证，不许只留个数字' };
  }
  function view(merchant) {
    if (merchant) {
      const rows = CHARTERS.filter(function (r) { return r.merchant === str(merchant); });
      return { ok: rows.length > 0, count: rows.length, rows: JSON.parse(JSON.stringify(rows)) };
    }
    return { ok: true, charters: CHARTERS.length, cases: CASES.length,
      rows: JSON.parse(JSON.stringify(CHARTERS)), casesRows: JSON.parse(JSON.stringify(CASES)) };
  }
  function statView() { return Object.assign({}, stat); }
  function reset() {
    CHARTERS.length = 0; CASES.length = 0;
    stat.grants = 0; stat.drawn = 0; stat.seized = 0; stat.refused = 0; stat.evicted = 0;
    stat.overQuota = 0; stat.drawnTotal = 0; stat.seizedTotal = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.saltFranchise = {
    grant: grant, drawSalt: drawSalt, seize: seize,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/salt-franchise.js', { kind: 'engine', ver: '2.523.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/salt-franchise 已加载（2.523.0）');
})();