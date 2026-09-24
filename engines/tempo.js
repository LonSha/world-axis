/**
 * WorldAxis engines/tempo.js (v2.71.0)
 * 节奏齿轮：推进速率的四挡白名单 × 每轮跨度上限 × 挡位变更留痕。
 *
 * 缝合来源：Phantasm「💜推进速率等级」——「【速率 1：慢板 (Largo)】【速率 2：行板
 * (Andante)】【速率 3：快板 (Allegro)】【速率 4：急板 (Presto)】」；十四行诗「叙事
 * 推进基准」——「推进幅度遵循当前节奏挡位，不为完成推进任务额外制造事故」；打工喵
 * 「时间合理性」——「不同行为应按照其实际性质判断耗时……时间应持续累积」。
 *
 * 预设里那是给模型的一句话；能落成引擎判据的是**挡位是四值白名单**（不是自由词），
 * 且**每小时跨度与该挡位的单轮上限可比**：慢板不许一轮跳一天，急板不允许原地不动。
 *
 * 与 temporal-lock.js 的分工：temporal-lock 管「锁定期的硬上限」（lock 态 + 单一
 * maxMinutes）；本模块管「常态下的挡位选择」（四挡 × 每挡不同的单轮跨度上限）。
 * 与 difficulty.pace 的分工：difficulty.pace 是「世界钟跨度的乘数」（喂给 calendar）；
 * 本模块是「叙事单轮推进幅度」的度量面，不改世界钟。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 check() 报 reason:'disabled'，不猜允许量。
 *   2 挡位四值白名单。表外任何值整次拒收（bad-gear），不做「宽容降级」。
 *   3 单轮跨度必须给出且为正整数（missing-span / bad-span），0 与负数各有归因。
 *   4 超过当前挡位上限整轮拒收（over-pace），绝不静默截断到上限。
 *   5 每次挡位变更留痕（at + from + to）；留痕按「保留最近 N 条」治理（N = maxShifts 设置，
 *     挤出有账；不整表清空——节奏史是叙事事实，治理只限长度）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_tempo_settings_v1';
  const DEF = { enabled: false, gear: 'andante', maxShifts: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'tempo', enums: { gear: ['largo', 'andante', 'allegro', 'presto'] }, bounds: { maxShifts: [4, 32] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // 四挡：每挡给出「单轮叙事推进」的分钟上限（与档内语义一致的边界值）
  const GEARS = [
    { id: 'largo', label: '慢板', capMinutes: 15, desc: '场景内细节推进（一轮数分钟）' },
    { id: 'andante', label: '行板', capMinutes: 120, desc: '常规推进（一轮数十分钟到两小时）' },
    { id: 'allegro', label: '快板', capMinutes: 480, desc: '场景间推进（一轮数小时）' },
    { id: 'presto', label: '急板', capMinutes: 1440, desc: '跨日推进（一轮一天以内）' }
  ];
  const GEAR_MAP = {};
  GEARS.forEach(function (g) { GEAR_MAP[g.id] = g; });
  const stat = { checks: 0, shifts: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function tempo() { const t = state().tempo; return (t && typeof t === 'object' && !Array.isArray(t)) ? t : {}; }
  function shifts() { const t = tempo(); return Array.isArray(t.shifts) ? t.shifts : []; }
  function gearOf() { const t = tempo(); const g = GEAR_MAP[t.gear] ? t.gear : settings().gear; return GEAR_MAP[g] || GEAR_MAP.andante; }
  /** 当前挡位（含语义与上限）。总开关关闭时 reason:'disabled'。 */
  function current() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled', gear: cfg.gear };
    const g = gearOf();
    return { ok: true, gear: g.id, label: g.label, capMinutes: g.capMinutes, desc: g.desc, reason: 'applied' };
  }
  /** 切挡：单值白名单 + 变更留痕（from/to 都记）。 */
  function setGear(id) {
    const gid = String(id == null ? '' : id).trim().toLowerCase();
    if (!GEAR_MAP[gid]) { noteFault('bad-gear'); return { ok: false, reason: 'bad-gear', got: id }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.tempo = draft.tempo && typeof draft.tempo === 'object' && !Array.isArray(draft.tempo) ? draft.tempo : {};
      const from = draft.tempo.gear && GEAR_MAP[draft.tempo.gear] ? draft.tempo.gear : settings().gear;
      if (from === gid) { out = { ok: false, reason: 'same-gear', gear: gid }; return false; }
      draft.tempo.gear = gid;
      draft.tempo.shifts = Array.isArray(draft.tempo.shifts) ? draft.tempo.shifts : [];
      draft.tempo.shifts.push({ at: clockNow('tempo'), from: from, to: gid });
      if (WA.evict) WA.evict.array(draft.tempo.shifts, 'tempo.shifts', settings().maxShifts);
      out = { ok: true, gear: gid, from: from };
    }, 'tempo:setGear');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.shifts++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'shifted'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 核验单轮跨度：spanMinutes 必须给且为正整数，且不超过当前挡位上限。 */
  function check(spanMinutes) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled' };
    const n = Number(spanMinutes);
    if (spanMinutes === undefined || spanMinutes === null || spanMinutes === '') { noteFault('missing-span'); return { ok: false, reason: 'missing-span' }; }
    if (!isFinite(n)) { noteFault('bad-span'); return { ok: false, reason: 'bad-span', got: spanMinutes }; }
    if (n === 0) { noteFault('frozen'); return { ok: false, reason: 'frozen', span: 0 }; }
    if (n < 0) { noteFault('negative-span'); return { ok: false, reason: 'negative-span', span: n }; }
    const g = gearOf();
    if (n > g.capMinutes) { noteFault('over-pace'); return { ok: false, reason: 'over-pace', span: n, cap: g.capMinutes, gear: g.id }; }
    stat.checks++; stat.lastReason = 'checked';
    return { ok: true, span: n, gear: g.id, label: g.label, capMinutes: g.capMinutes, reason: 'checked' };
  }
  /** 注入块：当前挡位 + 上限 + 语义 + 最近切挡史（零 token：关闭或首启无史时返回空串）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const g = gearOf();
    const lines = ['[节奏齿轮] 当前挡位：' + g.label + '（一轮最多推进 ' + g.capMinutes + ' 分钟：' + g.desc + '）'];
    const hist = shifts();
    if (hist.length) {
      const last = hist[hist.length - 1];
      const fg = GEAR_MAP[last.from], tg = GEAR_MAP[last.to];
      if (fg && tg) lines.push('最近切挡：' + fg.label + ' → ' + tg.label);
    }
    lines.push('推进纪律：推进幅度服从当前挡位，不为完成推进任务额外制造事故与误会；时间应持续累积，不因进入下一轮机械增加固定时长。');
    return lines.join('\n') + '\n';
  }
  WA.tempo = {
    GEARS: GEARS,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    current: current, setGear: setGear, check: check, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();