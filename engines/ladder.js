/**
 * WorldAxis engines/ladder.js (v2.69.0)
 * 原型阶梯：档位阶梯 × 事件推进 × 禁跳档。
 *
 * 缝合来源：《咩咩 ACG 角色心理模型 3.0.0》（ref8）中唯一可机制化的骨架——
 *   病娇条目：「占有欲等级：轻度警戒 → 中度干涉 → 重度暴走 → 终极崩溃」；
 *   「禁止跳级。从轻度到重度必须有事件推进，不能一上来就暴走」；
 *   「当有人指出你对他是不是太执着了时」等破防触发。
 *   雌小鬼条目：「对方没有强烈反击 → 升级一档，羞辱力度加大」。
 *   妹控条目：「第一阶段（只是普通朋友）→ 暗中观察。第二阶段（似乎有好感）→ 开始主动介入。
 *   第三阶段（确认在追妹妹）→ 正面对峙」。
 *
 * 取舍口径（沿 R50）：92 条原型正文全部是散文式行为描写指引（扮演词库），无数值、
 * 无状态、无交叉引用——收编会产生大量无法证伪的规则；本模块只收「档位阶梯」这一个
 * 骨架：显式登记阶梯、升级必须带事件、禁止跳档。原型正文词库不进引擎，留给预设。
 *
 * 本模块不替写任何心理演出，只核验「升级有据、跳档现形」：
 *   1 总开关默认关闭。关闭时 define()/escalate() 返回 reason:'disabled'，不记账。
 *   2 定义一条阶梯：define(who, kind, rungs)——rungs 是档位名数组（至少 2 档），
 *     表空/单档拒收（bad-rungs），重复定义拒收（exists）。
 *   3 升级：escalate(who, kind, event)——必须带 event（missing-event）；只能逐档
 *     升一级（skip-rung），当前档不存在报 missing；已到顶报 top。
 *   4 降档：deescalate(who, kind)——逐档降一级（可无事件，安抚/缓解本身是事件）；
 *     未登记报 missing。
 *   5 读面：read(who, kind) 返回当前档位与剩余阶梯；buildBlock 报所有活跃阶梯的
 *     当前档位与下一档门槛（「升级必须带事件」写进注入块铁律）。
 *
 * 与 temperament.js 的分工：temperament 管「底色/习惯两层 + 触发词交棒」（性格面），
 * 本模块管「情绪/执念档位阶梯 + 事件推进」（升级面）；与 bonds.js 的分工：bonds 管
 * 「两人之间的关系型」（六型白名单），本模块管「一个人的内在阶梯」（可独立于关系）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_ladder_settings_v1';
  const DEF = { enabled: false, maxRows: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'ladder', bounds: { maxRows: [4, 32] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { defines: 0, escalations: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().ladder; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function keyOf(who, kind) { return clean(who, 40) + '::' + clean(kind, 24); }
  function rowOf(who, kind) { const k = keyOf(who, kind); return rows().filter(function (r) { return r && r.key === k; })[0] || null; }
  /**
   * 定义一条阶梯。who 是角色，kind 是阶梯名（如「占有欲」），rungs 是档位名数组（≥2）。
   * 重复定义拒收（exists）——想改阶梯先 drop 再 define（阶梯变更要显式）。
   */
  function define(who, kind, rungs) {
    const w = clean(who, 40), k = clean(kind, 24);
    if (!w || !k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const list = (Array.isArray(rungs) ? rungs : []).map(function (r) { return clean(r, 24); }).filter(Boolean);
    if (list.length < 2) { noteFault('bad-rungs'); return { ok: false, reason: 'bad-rungs', got: list.length }; }
    const uniq = []; const seen = {};
    list.forEach(function (r) { if (!seen[r]) { seen[r] = 1; uniq.push(r); } });
    if (uniq.length !== list.length) { noteFault('dup-rung'); return { ok: false, reason: 'dup-rung' }; }
    const key = keyOf(w, k);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.ladder = draft.ladder && typeof draft.ladder === 'object' && !Array.isArray(draft.ladder) ? draft.ladder : { rows: [] };
      draft.ladder.rows = Array.isArray(draft.ladder.rows) ? draft.ladder.rows : [];
      if (draft.ladder.rows.filter(function (r) { return r && r.key === key; })[0]) { out = { ok: false, reason: 'exists', who: w, kind: k }; return; }
      draft.ladder.rows.push({ key: key, who: w, kind: k, rungs: list.slice(), idx: 0, at: clockNow('ladder') });
      if (WA.evict) WA.evict.array(draft.ladder.rows, 'ladder.rows');
      out = { ok: true, who: w, kind: k, rungs: list.slice(), rung: list[0], idx: 0 };
    }, 'ladder:define');
    if (out && out.ok) { stat.defines++; stat.lastReason = 'defined'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 升级一档。event 必填（「禁止跳级。从轻度到重度必须有事件推进」）——
   * 没写清楚「发生了什么导致升级」就是没升级。只能逐档升（skip-rung），到顶报 top。
   */
  function escalate(who, kind, event) {
    const w = clean(who, 40), k = clean(kind, 24), ev = clean(event, 80);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      if (!w || !k) { out = { ok: false, reason: 'missing-fields' }; return; }
      if (!ev) { out = { ok: false, reason: 'missing-event', who: w, kind: k }; return; }
      draft.ladder = draft.ladder && typeof draft.ladder === 'object' && !Array.isArray(draft.ladder) ? draft.ladder : { rows: [] };
      draft.ladder.rows = Array.isArray(draft.ladder.rows) ? draft.ladder.rows : [];
      const key = keyOf(w, k);
      const hit = draft.ladder.rows.filter(function (r) { return r && r.key === key; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', who: w, kind: k }; return; }
      if (hit.idx >= hit.rungs.length - 1) { out = { ok: false, reason: 'top', who: w, kind: k, rung: hit.rungs[hit.idx] }; return; }
      hit.idx = hit.idx + 1;
      hit.at = clockNow('ladder');
      out = { ok: true, who: w, kind: k, from: hit.rungs[hit.idx - 1], to: hit.rungs[hit.idx], idx: hit.idx, event: ev };
    }, 'ladder:escalate');
    if (out && out.ok) { stat.escalations++; stat.lastReason = 'escalated'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 降档一档（安抚/缓解本身是事件，无需强制说明）。 */
  function deescalate(who, kind) {
    const w = clean(who, 40), k = clean(kind, 24);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      if (!w || !k) { out = { ok: false, reason: 'missing-fields' }; return; }
      draft.ladder = draft.ladder && typeof draft.ladder === 'object' && !Array.isArray(draft.ladder) ? draft.ladder : { rows: [] };
      draft.ladder.rows = Array.isArray(draft.ladder.rows) ? draft.ladder.rows : [];
      const key = keyOf(w, k);
      const hit = draft.ladder.rows.filter(function (r) { return r && r.key === key; })[0];
      if (!hit) { out = { ok: false, reason: 'missing', who: w, kind: k }; return; }
      if (hit.idx <= 0) { out = { ok: false, reason: 'bottom', who: w, kind: k, rung: hit.rungs[0] }; return; }
      hit.idx = hit.idx - 1;
      hit.at = clockNow('ladder');
      out = { ok: true, who: w, kind: k, from: hit.rungs[hit.idx + 1], to: hit.rungs[hit.idx], idx: hit.idx };
    }, 'ladder:deescalate');
    if (out && out.ok) stat.lastReason = 'deescalated'; else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 撤销一条阶梯（阶梯变更要显式：想改档位表先 drop 再 define）。
   * 未登记如实报 missing，不静默成功。
   */
  function drop(who, kind) {
    const w = clean(who, 40), k = clean(kind, 24);
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      if (!w || !k) { out = { ok: false, reason: 'missing-fields' }; return; }
      draft.ladder = draft.ladder && typeof draft.ladder === 'object' && !Array.isArray(draft.ladder) ? draft.ladder : { rows: [] };
      draft.ladder.rows = Array.isArray(draft.ladder.rows) ? draft.ladder.rows : [];
      const key = keyOf(w, k);
      const idx = draft.ladder.rows.map(function (r) { return r && r.key; }).indexOf(key);
      if (idx < 0) { out = { ok: false, reason: 'missing', who: w, kind: k }; return; }
      draft.ladder.rows.splice(idx, 1);
      out = { ok: true, who: w, kind: k };
    }, 'ladder:drop');
    if (out && out.ok) stat.lastReason = 'dropped'; else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读某条阶梯（当前档位 + 剩余阶梯）。 */
  function read(who, kind) {
    if (!settings().enabled) return { ok: true, who: who, kind: kind, reason: 'disabled' };
    const w = clean(who, 40), k = clean(kind, 24);
    if (!w || !k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const hit = rowOf(w, k);
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', who: w, kind: k }; }
    const ahead = hit.rungs.slice(hit.idx);
    return { ok: true, who: hit.who, kind: hit.kind, rung: hit.rungs[hit.idx], idx: hit.idx,
      ahead: ahead, top: hit.rungs[hit.rungs.length - 1], reason: 'applied' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      return '· ' + r.who + '：' + r.kind + ' → ' + r.rungs[r.idx] + (r.idx < r.rungs.length - 1 ? '（下一档：' + r.rungs[r.idx + 1] + '）' : '（已到顶）');
    });
    return '[原型阶梯]\n' + lines.join('\n') + '\n档位只许逐级推进：升级必须登记事件（禁止跳级），安抚/缓解可逐级回落；到顶后不再叠加。\n';
  }
  WA.ladder = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    define: define, escalate: escalate, deescalate: deescalate, drop: drop, read: read, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();