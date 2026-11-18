/**
 * WorldAxis engines/silver-assay.js (v2.524.0) — EXV27-2 银钱成色与火耗倾煎
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「火耗 / 官银 / 银锭 / 汇银」在 `engines/` **0 命中**。世界里收租、军饷、当本
 *   都写「三十两」，但那三十两到底是**纹银、九成、还是八色**，账上不作区分 ——
 *   于是「火耗加征」「短陌」「倾煎折色」这些把百姓磨死的小刀子，一句都演不出来。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `assay` 折成色（这笔钱含多少纯银）→ `addMeltLoss` 倾煎（低成色熔提高成色，
 *   途中损耗按 `meltPct` 真扣，不是「说损耗多少就多少」）→ `shortString` 短陌
 *   （一串名义千文，实付不足）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **只换算，不定价**：本模块不回答「这袋米值几两」（那是 commodity-circulation）。
 *   ② 成色是**调用方给的数**（0～100）；本模块不猜「九成」是 90 还是 93。
 *   ③ 短陌不许短到 0 或负数（`shortBy >= stringLength` 一律拒收）。
 *   ④ 拒收码只用 `disabled`；其余用 `hint`。
 *   ⑤ 流水有界（`maxRows`），满了挤最旧一条并留痕 `evicted`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_silver_assay_settings_v1';
  const DEF = { enabled: true, maxRows: 32, meltPct: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'silverAssay', bounds: { maxRows: [8, 96], meltPct: [0, 20] } };
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
  const stat = { assays: 0, meltOps: 0, shortStrings: 0, refused: 0, evicted: 0,
    meltLossTotal: 0, shortTotal: 0, lastReason: '' };
  const ROWS = [];
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function r2(v) { return +(Math.round(v * 100) / 100).toFixed(2); }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function push(row) {
    const cfg = settings();
    if (ROWS.length >= cfg.maxRows) { ROWS.shift(); stat.evicted++; }
    ROWS.push(row);
  }
  function assay(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const amount = num(s.amount), purity = num(s.purityPct);
    if (!(amount > 0)) return refuse('missing-amount', 'missing-amount：多少钱（两）？');
    if (!(purity > 0 && purity <= 100)) return refuse('bad-purity',
      'bad-purity：成色按 0～100 给（纹银 100 / 九成 90 / 八色 80），不猜「九成」是几');
    const fine = r2(amount * purity / 100);
    stat.assays++;
    push({ kind: 'assay', amount: amount, purityPct: purity, fine: fine });
    return { ok: true, amount: amount, purityPct: purity, fineSilver: fine,
      toFineEquiv: r2(fine),
      hint: purity < 100 ? 'not-fine：这是 ' + purity + ' 成，折纹银只有 ' + fine + ' 两 —— 账上要按成色记' : null };
  }
  function addMeltLoss(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const amount = num(s.amount), from = num(s.fromPurityPct), to = num(s.toPurityPct);
    const melt = s.meltPct == null ? cfg.meltPct : num(s.meltPct);
    if (!(amount > 0)) return refuse('missing-amount', 'missing-amount：倾煎多少两？');
    if (!(from > 0 && from <= 100) || !(to > 0 && to <= 100)) return refuse('bad-purity',
      'bad-purity：起手成色与目标成色都要给（0～100）');
    if (to <= from) return refuse('bad-purity', 'bad-purity：倾煎是把低成色提成高成色，目标成色必须高于起手');
    if (!(melt >= 0 && melt <= 20)) return refuse('bad-melt-pct', 'bad-melt-pct：倾煎损耗 0～20%，这个数不许乱给');
    const fineIn = amount * from / 100;
    const fineOut = fineIn * (1 - melt / 100);
    const loss = fineIn - fineOut;
    const delivered = fineOut / (to / 100);
    stat.meltOps++;
    stat.meltLossTotal = r2(stat.meltLossTotal + loss);
    push({ kind: 'melt', amount: amount, fromPurityPct: from, toPurityPct: to, meltPct: melt,
      fineIn: r2(fineIn), fineOut: r2(fineOut), loss: r2(loss), delivered: r2(delivered) });
    return { ok: true, fineIn: r2(fineIn), fineOut: r2(fineOut), meltLoss: r2(loss),
      deliveredAt: to, delivered: r2(delivered),
      hint: 'melt-loss：倾煎途中折掉 ' + r2(loss) + ' 两纯银 —— 这就是「火耗」的实体，不是凭空加派' };
  }
  function shortString(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const len = num(s.stringLength), shortBy = num(s.shortBy);
    if (!(len > 0)) return refuse('missing-amount', 'missing-amount：一串名义多少钱（文）？');
    if (!(shortBy >= 0)) return refuse('missing-short', 'missing-short：短陌多少文？（不短就给 0）');
    if (shortBy >= len) return refuse('bad-short', 'bad-short：短陌 ' + shortBy + ' 不小于一串 ' + len + ' —— 那不是短陌，是空手');
    const actual = r2(len - shortBy);
    stat.shortStrings++;
    stat.shortTotal = r2(stat.shortTotal + shortBy);
    push({ kind: 'short', stringLength: len, shortBy: shortBy, actual: actual });
    return { ok: true, stringLength: len, shortBy: shortBy, actual: actual,
      effectivePct: r2(actual / len * 100),
      hint: shortBy > 0 ? 'short-string：名义一串 ' + len + ' 文，到手只有 ' + actual + ' 文' : null };
  }
  function view() { return { ok: true, count: ROWS.length, rows: JSON.parse(JSON.stringify(ROWS)) }; }
  function statView() { return Object.assign({}, stat); }
  function reset() {
    ROWS.length = 0;
    stat.assays = 0; stat.meltOps = 0; stat.shortStrings = 0; stat.refused = 0; stat.evicted = 0;
    stat.meltLossTotal = 0; stat.shortTotal = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.silverAssay = {
    assay: assay, addMeltLoss: addMeltLoss, shortString: shortString,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/silver-assay.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/silver-assay 已加载（2.524.0）');
})();