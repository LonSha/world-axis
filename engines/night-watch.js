/**
 * WorldAxis engines/night-watch.js (v2.524.0) — EXV27-5 更夫巡夜与夜禁
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「更鼓 / 夜禁」在 `engines/` **0 命中**。世界钟能回答「现在几点」，但答不出
 *   「这一夜谁在街上敲更、谁没打灯还敢走、哪个更次出了事」—— 夜里的治安面是空的。
 *
 * ── 机制 ── `beat` 打更（一更～五更，同一更不重复打）→ `violate` 夜禁（无灯 / 无牌 /
 *   宵行三途）→ `report` 报事（盗 / 火 / 可疑；**报事者必须当夜已在班**）。
 *
 * ── 边界 ── ① 不碰 store。② **不自造时间**：更次由调用方给（`watch` 1～5），
 *   本模块不读设备墙钟 —— 冻结回放里墙钟会把「现在几更」永远算错。③ 报事必须有在班证明
 *   （先 `beat` 过），否则拒收 —— 否则任何人都能凭空「更夫看见了」。④ 拒收码只用 `disabled`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_night_watch_settings_v1';
  const DEF = { enabled: true, maxRows: 32, beats: 5 };
  const __REG = { key: LS_KEY, def: DEF, module: 'nightWatch', bounds: { maxRows: [8, 96], beats: [1, 10] } };
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
  const stat = { beats: 0, violations: 0, reports: 0, refused: 0, evicted: 0, lastReason: '' };
  const BEATS = [];
  const BAD = [];
  const REPORTS = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function watchOf(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function beat(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const watchman = str(s.watchman), watch = watchOf(s.watch), night = str(s.night);
    if (!watchman) return refuse('missing-party', 'missing-party：谁在打更？');
    if (!(watch >= 1 && watch <= cfg.beats)) return refuse('bad-watch',
      'bad-watch：更次按 1～' + cfg.beats + ' 给（一夜五更），不猜');
    const nightKey = night || '-';
    const dup = BEATS.find(function (r) { return r.watchman === watchman && r.watch === watch && r.night === nightKey; });
    if (dup) return refuse('duplicate-beat', 'duplicate-beat：' + watchman + ' 这一夜的第 ' + watch + ' 更已经打过了');
    if (BEATS.length >= cfg.maxRows) { BEATS.shift(); stat.evicted++; }
    BEATS.push({ watchman: watchman, watch: watch, night: nightKey, place: str(s.place) || null, at: s.at || null });
    stat.beats++;
    return { ok: true, watchman: watchman, watch: watch, night: nightKey };
  }
  function violate(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), kind = str(s.kind), by = str(s.by);
    if (!who) return refuse('missing-party', 'missing-party：谁犯了夜禁？');
    if (['no-lantern', 'no-tag', 'false-stroll'].indexOf(kind) < 0) return refuse('unknown-kind',
      'unknown-kind：无灯(no-lantern) / 无牌(no-tag) / 宵行(false-stroll) 三途其一');
    if (!by) return refuse('missing-witness', 'missing-witness：谁拿住的？无拿人者不立夜禁');
    const watch = watchOf(s.watch);
    BAD.push({ who: who, kind: kind, by: by, watch: isFinite(watch) ? watch : null, at: s.at || null });
    if (BAD.length > 64) BAD.shift();
    stat.violations++;
    return { ok: true, who: who, kind: kind, by: by };
  }
  function report(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const watchman = str(s.watchman), kind = str(s.kind), place = str(s.place);
    if (!watchman) return refuse('missing-party', 'missing-party：哪个更夫报的事？');
    if (['theft', 'fire', 'suspicious'].indexOf(kind) < 0) return refuse('unknown-kind',
      'unknown-kind：盗(theft) / 火(fire) / 可疑(suspicious) 三途其一');
    if (!place) return refuse('missing-place', 'missing-place：在哪看见的？');
    const onDuty = BEATS.some(function (r) { return r.watchman === watchman; });
    if (!onDuty) return refuse('not-on-duty',
      'not-on-duty：' + watchman + ' 这一夜没有打更记录 —— 不在班的人不能算「更夫看见了」');
    REPORTS.push({ watchman: watchman, kind: kind, place: place, at: s.at || null });
    if (REPORTS.length > 64) REPORTS.shift();
    stat.reports++;
    return { ok: true, watchman: watchman, kind: kind, place: place };
  }
  function view() {
    return { ok: true, beats: BEATS.length, violations: BAD.length, reports: REPORTS.length,
      rows: JSON.parse(JSON.stringify(BEATS)), violationRows: JSON.parse(JSON.stringify(BAD)),
      reportRows: JSON.parse(JSON.stringify(REPORTS)) };
  }
  function statView() { return Object.assign({}, stat); }
  function reset() {
    BEATS.length = 0; BAD.length = 0; REPORTS.length = 0;
    stat.beats = 0; stat.violations = 0; stat.reports = 0; stat.refused = 0; stat.evicted = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.nightWatch = {
    beat: beat, violate: violate, report: report,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/night-watch.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/night-watch 已加载（2.524.0）');
})();