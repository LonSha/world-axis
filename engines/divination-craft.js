/**
 * WorldAxis engines/divination-craft.js (v2.523.0) — EXV27-9 巫觋占卜与拆字
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「占卜 / 拆字 / 巫觋 / 符咒」在 `engines/` **0 命中**。教派有 theology-cult、
 *   天象有 celestial-omens，但**街边那个算命先生**没有：谁问的卦、起出什么、
 *   事后应验没有、断语被市井传成了什么样 —— 一处都没有。
 *
 * ── 机制 ── `cast` 起卦（术士 / 问事 / 卦号 / 断语档）→ `confirm` 应验登记
 *   （**只许登记一次**，事后不许改口）→ `spread` 哄传（断语被改写后的样子也要留痕）。
 *
 * ── 边界 ── ① 不碰 store。② 随机走 `core/rand.js`（可复现源），**不用 Math.random**
 *   —— 冻结回放要能重放同一个卦。③ **不许改口**：`confirm` 只写一次，第二次显式拒收；
 *   应验与不应验都留痕（只记应验的卜者，等于把江湖术士洗成神仙）。
 *   ④ 拒收码只用 `disabled`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_divination_craft_settings_v1';
  const DEF = { enabled: true, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'divinationCraft', bounds: { maxRows: [8, 96] } };
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
  const stat = { casts: 0, confirmed: 0, fulfilled: 0, failed: 0, spreads: 0, refused: 0, evicted: 0, lastReason: '' };
  const CASTS = [];
  // v2.523.0（EXV27-9 收口）：枚举名取 AUSPICE 而**不叫那个名字** —— engines/probe.js 已有一个
  //   导出面枚举 VERDICT = ['guilty','clear','undecided']。同名不同值域会被
  //   tests/contract-scan-v2150.js 判成真冲突（「同名枚举值域不一致」），那是**该报**的：
  //   契约扫描按名字对齐，同名意味着「同一个概念」，而吉凶与判罪不是一回事。
  //   改名不是绕过判据，是把「这是两件事」在命名上说清楚。
  const AUSPICE = ['auspicious', 'inauspicious', 'ambiguous'];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function roll(n) {
    try {
      if (WA.rand && typeof WA.rand.int === 'function') return WA.rand.int(0, n - 1);
    } catch (e) { /* 随机源缺席时退化为确定值：宁可重复，不许引入不可复现的随机 */ }
    return 0;
  }
  function cast(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const diviner = str(s.diviner), kind = str(s.kind), question = str(s.question);
    if (!diviner) return refuse('missing-party', 'missing-party：哪个术士起的卦？');
    if (['wu', 'xi', 'bu'].indexOf(kind) < 0) return refuse('unknown-kind',
      'unknown-kind：巫(wu) / 觋(xi) / 卜者(bu) 三途其一 —— 术业不同，别混成一堆');
    if (!question) return refuse('missing-what', 'missing-what：问的什么事？没有问事就没有卦');
    if (CASTS.length >= cfg.maxRows) { CASTS.shift(); stat.evicted++; }
    const id = 'dv' + (++stat.casts);
    const hexagram = 1 + roll(64);
    const verdict = AUSPICE[roll(AUSPICE.length)];
    CASTS.push({ id: id, diviner: diviner, kind: kind, question: question, hexagram: hexagram,
      verdict: verdict, at: s.at || null, confirm: null, spreads: [] });
    return { ok: true, id: id, hexagram: hexagram, verdict: verdict,
      hint: 'cast：' + diviner + ' 起得第 ' + hexagram + ' 卦，断作 ' + verdict + '（应验与否要事后回来登记）' };
  }
  function confirm(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = CASTS.find(function (r) { return r.id === str(s.id); });
    if (!rec) return refuse('unknown-cast', 'unknown-cast：没有这一卦');
    if (rec.confirm) return refuse('already-confirmed',
      'already-confirmed：这一卦已经登记过（' + (rec.confirm.fulfilled ? '应验' : '未验') + '）—— 不许改口');
    if (typeof s.fulfilled !== 'boolean') return refuse('missing-verdict',
      'missing-verdict：应验(true) 还是未验(false)？必须给确定的答案');
    rec.confirm = { fulfilled: s.fulfilled, note: str(s.note) || null, at: s.at || null };
    stat.confirmed++;
    if (s.fulfilled) stat.fulfilled++; else stat.failed++;
    return { ok: true, id: rec.id, fulfilled: s.fulfilled,
      hint: s.fulfilled ? null : 'failed-fortune：这一卦没应 —— 也要留着，别只记得算准的那几回' };
  }
  function spread(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = CASTS.find(function (r) { return r.id === str(s.id); });
    if (!rec) return refuse('unknown-cast', 'unknown-cast：没有这一卦');
    const distortion = str(s.distortion), by = str(s.by);
    if (!distortion) return refuse('missing-what', 'missing-what：市井把它传成了什么？');
    if (!by) return refuse('missing-witness', 'missing-witness：谁在传？');
    rec.spreads.push({ distortion: distortion, by: by, at: s.at || null });
    stat.spreads++;
    return { ok: true, id: rec.id, spread: rec.spreads.length,
      hint: 'rewritten：断语已被改写为「' + distortion + '」（原断 ' + rec.verdict + '，改写在案）' };
  }
  function view(id) {
    if (id) {
      const rec = CASTS.find(function (r) { return r.id === str(id); });
      return rec ? { ok: true, row: JSON.parse(JSON.stringify(rec)) } : { ok: false, hint: 'unknown-cast' };
    }
    return { ok: true, casts: CASTS.length, rows: JSON.parse(JSON.stringify(CASTS)) };
  }
  function statView() {
    const hit = stat.confirmed ? +(stat.fulfilled / stat.confirmed * 100).toFixed(1) : null;
    return Object.assign({ hitRatePct: hit }, stat);
  }
  function reset() {
    CASTS.length = 0;
    stat.casts = 0; stat.confirmed = 0; stat.fulfilled = 0; stat.failed = 0; stat.spreads = 0;
    stat.refused = 0; stat.evicted = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.divinationCraft = {
    cast: cast, confirm: confirm, spread: spread,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/divination-craft.js', { kind: 'engine', ver: '2.523.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/divination-craft 已加载（2.523.0）');
})();