/**
 * WorldAxis engines/karma.js (v2.72.0)
 * 业力双轴：功德 / 业力对等核销与干预阶梯。
 *
 * 缝合来源：预设《世界天道维持系统》「因果量化与核算系统——业力 (Negative Karma)
 * 由破坏世界、滥杀生灵等行为积累，将触发系统的修正性干预（厄运、反噬、劫难）；
 * 功德 (Positive Merit) 由维护位面稳定等行为获取，可用于抵消业力」「理性干预协议
 * (逐级启动)：1 警示阶段 / 2 干扰阶段 / 3 压制阶段 / 4 惩戒阶段 / 5 终极措施」
 * 「全知非全能：受能量上限限制」「罪罚对等，留一线生机」。
 *
 * 预设里那是给模型的叙事建议；能落成引擎判据的是**两轴必须分开记、核销必须显式**：
 *   · 正德与负业是两条独立的账面（不净额化——「他救过人也杀过人」不是零）；
 *   · **记账不自动抵扣**：功德就是功德、业力就是业力，各自累加到各自轴上；
 *   · 核销是**显式动作**（offset：功德抵业力），抵多少记多少，一次性对等扣减；
 *   · 干预阶梯由**净业**（业力−功德）映射，且**单调不减**——唯一回退路径就是 offset()。
 *
 * 与 causal.js 的分工：causal 记「A 导致 B」的因果链与结算时刻（时间向）；
 * 本模块记「谁攒了多少业/德」的量值账（道德向），不记因果链、不排时刻。
 * 与 warrant.js 的分工：warrant 是「世俗通缉」（罪度三档，惯犯升级）；
 * 本模块是「天道账」（跨世俗的业力平衡），两者正交、互不读写。
 * 与 fondness.js 的分工：fondness 是「人与人」的好感；本模块是「人与世界」的因果。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时写路径报 reason:'disabled'，不记账。
 *   2 轴名双值白名单（merit/debt）。表外任何值整次拒收（bad-kind）。
 *   3 对象名缺或空整次拒收（missing-fields）；金额须为正有限数（bad-amount）。
 *   4 未登记过的对象查账报 missing，不猜、不建空行。
 *   5 干预阶梯单调不减：新算出的 stage 低于已记录值时不回退（回退只能靠显式核销）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_karma_settings_v1';
  const DEF = { enabled: false, maxRows: 16, maxStage: 5 };
  const __REG = { key: LS_KEY, def: DEF, module: 'karma', bounds: { maxRows: [4, 32], maxStage: [3, 8] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const KINDS = ['merit', 'debt'];
  const KIND_LABEL = { merit: '功德', debt: '业力' };
  const STAGE_LABEL = ['无干预', '警示', '干扰', '压制', '惩戒', '终极措施'];
  const stat = { records: 0, offsets: 0, escalations: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().karma; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function find(who) { return rows().filter(function (r) { return r && r.who === who; })[0]; }
  /** 净业 = 业力 - 功德（正数为净负业，负数为净余德）。 */
  function netOf(row) {
    const d = Number(row && row.debt) || 0;
    const m = Number(row && row.merit) || 0;
    return d - m;
  }
  /** 干预阶梯：由净业映射。净业 <= 0 记 0；每跨一档 +1，封顶 maxStage。 */
  function stageFor(net) {
    if (!(net > 0)) return 0;
    const st = Math.ceil(net / 40);
    return Math.max(0, Math.min(settings().maxStage, st));
  }
  /**
   * 记账：给 who 的某一轴累加 amount。**两轴各自独立累加，不自动核销**。
   *
   * v2.72.0 修掉的第二个真缺陷：初版让 record 顺手做「对等核销」（记功德时先抵业力），
   *   结果是**两轴永不同时为正** ⇒ offset() 恒返回 nothing-to-offset / no-merit，
   *   文档里那条「唯一能让阶梯回退的路径」变成死代码，功德也就失去了「可储存、可花费」
   *   的含义（预设原义：功德是**攒起来**用来抵消业力的储备）。改为：
   *   · record 只入账（正德归正德、负业归负业，各自累加）；
   *   · 抵账只能由 offset() 显式发起，抵多少记多少。
   *   净业 netOf() 仍是两轴之差，干预阶梯照旧由净业映射——只是现在它真的会随核销回退。
   */
  function record(who, kind, amount, note) {
    const w = WA.inputGuard.text(who, 40);
    // 枚举归一走边界层：非法 kind 不再经 String() 升格（对象会抛、NaN 会变 'nan'）
    const k = WA.inputGuard.oneOf(kind, KINDS, '');
    const amt = WA.inputGuard.num(amount, NaN);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (KINDS.indexOf(k) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', got: kind }; }
    if (!isFinite(amt) || amt <= 0) { noteFault('bad-amount'); return { ok: false, reason: 'bad-amount', got: amount }; }
    const memo = clean(note, 60);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.karma = draft.karma && typeof draft.karma === 'object' && !Array.isArray(draft.karma) ? draft.karma : { rows: [] };
      draft.karma.rows = Array.isArray(draft.karma.rows) ? draft.karma.rows : [];
      let row = draft.karma.rows.filter(function (r) { return r && r.who === w; })[0];
      if (!row) {
        if (draft.karma.rows.length >= settings().maxRows) { out = { ok: false, reason: 'rows-full', who: w }; return false; }
        row = { who: w, merit: 0, debt: 0, stage: 0, at: clockNow('karma') };
        draft.karma.rows.push(row);
      }
      row[k] = (Number(row[k]) || 0) + amt;
      row.at = clockNow('karma');
      row.notes = Array.isArray(row.notes) ? row.notes : [];
      if (memo) row.notes.push({ kind: k, amount: amt, note: memo, at: clockNow('karma') });
      if (WA.evict) WA.evict.array(row.notes, 'karma.notes');
      const net = netOf(row);
      const next = stageFor(net);
      const prev = Number(row.stage) || 0;
      const escalated = next > prev;
      if (escalated) { row.stage = next; stat.escalations++; }
      if (WA.evict) WA.evict.array(draft.karma.rows, 'karma.rows');
      out = { ok: true, who: w, kind: k, added: amt, offset: 0, merit: row.merit, debt: row.debt,
        net: net, stage: row.stage, escalated: escalated, stageLabel: STAGE_LABEL[Math.min(row.stage, STAGE_LABEL.length - 1)] };
    }, 'karma:record');
    if (out && out.ok) {
      if (out.reason !== 'disabled') stat.records++;
      stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'recorded';
    } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 显式核销：用功德抵业力（这是唯一能让干预阶梯回退的路径）。 */
  function offset(who, amount) {
    const w = clean(who, 40);
    const amt = Number(amount);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!isFinite(amt) || amt <= 0) { noteFault('bad-amount'); return { ok: false, reason: 'bad-amount', got: amount }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.karma = draft.karma && typeof draft.karma === 'object' && !Array.isArray(draft.karma) ? draft.karma : { rows: [] };
      draft.karma.rows = Array.isArray(draft.karma.rows) ? draft.karma.rows : [];
      const row = draft.karma.rows.filter(function (r) { return r && r.who === w; })[0];
      if (!row) { out = { ok: false, reason: 'missing', who: w }; return false; }
      const debt = Number(row.debt) || 0;
      const merit = Number(row.merit) || 0;
      if (debt <= 0) { out = { ok: false, reason: 'nothing-to-offset', who: w }; return false; }
      if (merit <= 0) { out = { ok: false, reason: 'no-merit', who: w }; return false; }
      const use = Math.min(debt, merit, amt);
      row.debt = debt - use; row.merit = merit - use;
      row.stage = stageFor(netOf(row));
      row.at = clockNow('karma');
      out = { ok: true, who: w, used: use, merit: row.merit, debt: row.debt, net: netOf(row), stage: row.stage };
    }, 'karma:offset');
    if (out && out.ok) { if (out.reason !== 'disabled') stat.offsets++; stat.lastReason = out.reason === 'disabled' ? 'disabled' : 'offset'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 查账：未登记报 missing（不建空行——没做过事的人不该有账）。 */
  function balance(who) {
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = find(w);
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', who: w }; }
    const net = netOf(row);
    return { ok: true, who: w, merit: Number(row.merit) || 0, debt: Number(row.debt) || 0,
      net: net, stage: Number(row.stage) || 0, stageLabel: STAGE_LABEL[Math.min(Number(row.stage) || 0, STAGE_LABEL.length - 1)] };
  }
  /** 干预核验：按当前净业给出「该不该升级、升到哪一级」。不写状态（纯核验）。 */
  function intervene(who) {
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = find(w);
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', who: w }; }
    const net = netOf(row);
    const due = stageFor(net);
    const held = Number(row.stage) || 0;
    return { ok: true, who: w, net: net, due: due, stage: held, escalated: due > held,
      dueLabel: STAGE_LABEL[Math.min(due, STAGE_LABEL.length - 1)], stageLabel: STAGE_LABEL[Math.min(held, STAGE_LABEL.length - 1)] };
  }
  /** 删除一人的账（转世/退场）。 */
  function drop(who) {
    const w = WA.inputGuard.text(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.karma = draft.karma && typeof draft.karma === 'object' && !Array.isArray(draft.karma) ? draft.karma : { rows: [] };
      draft.karma.rows = Array.isArray(draft.karma.rows) ? draft.karma.rows : [];
      const idx = draft.karma.rows.map(function (r) { return r && r.who; }).indexOf(w);
      if (idx < 0) { out = { ok: false, reason: 'missing', who: w }; return false; }
      draft.karma.rows.splice(idx, 1);
      out = { ok: true, who: w };
    }, 'karma:drop');
    if (out && !out.ok && out.reason !== 'disabled') noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 注入块：双轴账 + 阶梯铁律。关闭或无账时返回空串（零 token）。 */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().filter(function (r) { return r && (netOf(r) !== 0 || (Number(r.stage) || 0) > 0); });
    if (!list.length) return '';
    const lines = list.slice(-Math.max(1, cfg.maxRows)).map(function (r) {
      const st = Number(r.stage) || 0;
      const tag = st > 0 ? '［干预 ' + st + '·' + STAGE_LABEL[Math.min(st, STAGE_LABEL.length - 1)] + '］' : '';
      return '· ' + r.who + '：功德 ' + (Number(r.merit) || 0) + ' / 业力 ' + (Number(r.debt) || 0) + '（净 ' + netOf(r) + '）' + tag;
    });
    return '[因果账] 业力-功德双轴（两轴独立，不正负相抵；已核销部分不在此两栏）：\n' + lines.join('\n')
      + '\n因果铁律：罪罚对等、留一线生机；干预逐级启动（警示→干扰→压制→惩戒→终极），不得跳级；升级必须由正文中的实际行为触发，不得凭空降罚；功德核销业力须显式记账。\n';
  }
  WA.karma = {
    KINDS: KINDS, STAGE_LABEL: STAGE_LABEL,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    record: record, offset: offset, balance: balance, intervene: intervene, drop: drop, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
