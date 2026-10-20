/**
 * WorldAxis engines/elsewhere.js (v2.230.0) — 彼方·幕后 NPC 档案
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓的 actors/registry.js 只回答「谁是谁」（命名空间 / 别名 / 槽位 / 建档来源），
 *   actors/profile.js 的字段面只有 dynamic/family/memory/personality/relation/
 *   relationships/target/worldview 八个 —— **没有一个字段回答「他此刻在想什么」**。
 *   现场实测：`心里惦记` / `秘密想法` / `隐藏目标` / `身份锚点` / `未完成事项` /
 *   `近期关键事件` 在 engines|core|actors|direction|render|ui **全库零命中**。
 *   后果：角色离开视野后「正在生活」这件事没有落点 —— 正文里最省事的写法是让他
 *   原地冻结（等主角回来再动），而长局里这是最刺眼的一种失真：人成了可随时开关的布景。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是打包前端「彼方 / ElseWhere」（Vue+Pinia，`bf-` 类名前缀）的 NPC 档案体系，
 *   其提示词原文口径逐条对应本模块的判据：
 *     · 核心三字段「当前在做 / 当前状态 / 位置」**每轮必返**（它们承载时间推进）；
 *     · 其余字段**只返本轮有实质变化的**（未返回的沿用旧值）；
 *     · 「未完成事项」是**事务台账**：进行中的每一条每轮都要逐条表态
 *       （对账是例行确认，不是变化）；
 *     · 新建 NPC 的**硬性门槛 —— 必须有正文明确写出的姓名**（无名者不建档）；
 *     · 移除的**唯一理由是角色死亡**；
 *     · 「近期关键事件」由代码维护**最多 3 条 FIFO**。
 *   本模块只取其中**可判定的那一层**；「要写得像真人」「不要刻板化」这类判不了的
 *   留在预设里，不进引擎 —— 与 style / enigma / lifeline 头部同一条口径。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · registry —— 「谁是谁」（命名空间 / 别名 / 建档来源），本模块不自己发 ID；
 *   · profile  —— 八个人物维度（性格 / 关系 / 世界观），本模块不改那八个键；
 *   · 本模块   —— **此刻在想什么 + 答应过什么没了结**（内心字段 / 台账 / 三轴 / 近期事件）。
 *   恋爱三轴的**数值折算**在本模块（romanceOf）；生理线（周期 / 受孕 / 孕期 / 哺乳）
 *   在 engines/vitals.js；楼层快照与回滚在 engines/floor-snapshot.js。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时登记 / 更新 / 对账 / 折算一律拒收 disabled，不猜。
 *   ② **无名不建档**：必须有正文写出的姓名，无名一律 `no-name`（不拿「路人甲」占位）。
 *   ③ **核心三字段必返**：update 缺 doing/status/place 任一 ⇒ `missing-core`
 *      （不沿用旧值充数 —— 沿用会让「他还在原地」与「本轮没写」长得一样）。
 *   ④ **台账对账**：进行中的每一条每轮都要逐条表态，缺一条 ⇒ `ledger-unanswered`。
 *   ⑤ **三轴只收事件不收数字**：任何裸数值（`好感: 80`）一律拒收 `raw-number` ——
 *      数值由本模块按事件类型与强度折算（「绝对不要输出任何数字」是上游原文）。
 *   ⑥ **近期事件 FIFO**：超过 maxRecent 的旧条目自动挤出，不是无限追加。
 *   ⑦ **移除仅死亡**：reason 白名单 `['death']`，其它理由拒收 `not-death`
 *      （「这个人不重要了」不是移除理由 —— 那是世界在删人）。
 *   ⑧ 未知主体不冒充空白卡：`unknown-person`（「查不到」与「这个人没有内心」
 *      长得一样，是本仓反复治的那类静默失真）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_elsewhere_settings_v1';
  const DEF = { enabled: false, maxRows: 48, maxLedger: 12, maxRecent: 3, strictCore: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'elsewhere',
    bounds: { maxRows: [8, 96], maxLedger: [2, 32], maxRecent: [1, 6] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // 三轴（好感 / 情欲 / 名分）。轴名用英文键，面板与注入块按标签显示。
  const AXES = ['affinity', 'desire', 'status'];
  const AXIS_LABEL = { affinity: '好感', desire: '情欲', status: '名分' };
  // 事件白名单：上游原文逐条（涨/落分开）。**词表外一律拒收** ——
  //   「系数凑巧够大就当事件」是猜，不是判。
  const EVENTS = {
    affinity: ['company', 'confide', 'gift', 'touch', 'hardship', 'cold', 'hurt', 'betray', 'overstep'],
    desire: ['flirt', 'intimate', 'unconsummated', 'consumed', 'solo', 'cool'],
    status: ['confirm', 'betroth', 'no-romance-sex', 'breakup'],
  };
  // 强度档（上游「微/小/中/大」）。名分事件不需要强度（上游原文）。
  const STRENGTH = { weak: 1, small: 2, medium: 3, large: 4 };
  const STRENGTH_LABEL = { weak: '微', small: '小', medium: '中', large: '大' };
  const NEGATIVE = { cold: 1, hurt: 1, betray: 1, overstep: 1, unconsummated: 1, consumed: 1, solo: 1, cool: 1, breakup: 1 };
  const REMOVE_REASONS = ['death'];
  const CORE = ['doing', 'status', 'place'];
  const LEDGER_STATES = ['ongoing', 'done', 'void'];
  const HIDDEN_FIELDS = ['worry', 'secret', 'hiddenGoal', 'anchor'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { opened: 0, updated: 0, reconciled: 0, events: 0, removed: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().elsewhere; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(name) { const k = clean(name, 40); return rows().filter(function (r) { return r && r.name === k; })[0] || null; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  /** 三轴初值：0..100，各轴由事件累积。**不进注入块**（上游：绝对不输出数字）。 */
  function freshRomance() { return { affinity: 0, desire: 0, status: 0, stages: { affinity: '', desire: '', status: '' }, log: [] }; }
  function freshCard(name) {
    return { name: name, doing: '', status: '', place: '', wants: '', goal: '',
      worry: '', secret: '', hiddenGoal: '', anchor: '', life: '',
      ledger: [], recent: [], romance: freshRomance(), updatedAt: 0 };
  }
  function bucket(draft) {
    if (!draft.elsewhere || typeof draft.elsewhere !== 'object' || Array.isArray(draft.elsewhere)) draft.elsewhere = { rows: [] };
    if (!Array.isArray(draft.elsewhere.rows)) draft.elsewhere.rows = [];
    return draft.elsewhere;
  }
  /** 建档。**硬门槛：必须有正文写出的姓名**（无名者不建档 —— 上游原文）。 */
  function open(name, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const o = opts || {};
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      if (b.rows.filter(function (r) { return r && r.name === nm; })[0]) { out = { ok: false, reason: 'exists', name: nm }; return false; }
      const card = freshCard(nm);
      card.createdVia = clean(o.via, 40) || 'elsewhere:open';
      b.rows = WA.evict && WA.evict.array ? WA.evict.array(b.rows.concat([card]), 'elsewhere.rows') : b.rows.concat([card]);
      out = { ok: true, reason: 'ok', name: nm };
      return true;
    }, 'elsewhere:open');
    if (out && out.ok) stat.opened++;
    return out || refuse('tx-failed');
  }
  /** 增量更新。核心三字段（doing/status/place）**必返**；其余只返有变化的。 */
  function update(name, patch) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const p = patch && typeof patch === 'object' ? patch : {};
    if (cfg.strictCore) {
      const miss = CORE.filter(function (k) { return !clean(p[k], 120); });
      if (miss.length) return refuse('missing-core');
    }
    if (!rowOf(nm)) return refuse('unknown-person');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const card0 = b.rows.filter(function (r) { return r && r.name === nm; })[0];
      if (!card0) { out = { ok: false, reason: 'unknown-person' }; return false; }
      const touched = [];
      CORE.forEach(function (k) { const v = clean(p[k], 120); if (v) { card0[k] = v; touched.push(k); } });
      ['wants', 'goal', 'life'].forEach(function (k) { const v = clean(p[k], 120); if (v) { card0[k] = v; touched.push(k); } });
      HIDDEN_FIELDS.forEach(function (k) { const v = clean(p[k], 160); if (v) { card0[k] = v; touched.push(k); } });
      if (Array.isArray(p.recent)) p.recent.forEach(function (t) { pushRecent(card0, t, cfg); });
      if (Array.isArray(p.ledger)) { mergeLedger(card0, p.ledger, cfg); touched.push('ledger'); }
      card0.updatedAt = clockNow('elsewhere');
      out = { ok: true, reason: 'ok', name: nm, touched: touched, card: card0 };
      return true;
    }, 'elsewhere:update');
    if (out && out.ok) stat.updated++;
    return out || refuse('tx-failed');
  }
  /** 近期关键事件：追加 + FIFO 挤出（上游：最多 3 条，由代码维护）。 */
  function pushRecent(card, text, cfg) {
    const t = clean(text, 160);
    if (!t) return false;
    card.recent = Array.isArray(card.recent) ? card.recent : [];
    if (card.recent.indexOf(t) >= 0) return false;
    card.recent.push(t);
    const cap = (cfg && cfg.maxRecent) || 3;
    while (card.recent.length > cap) card.recent.shift();
    return true;
  }
  /** 台账合并：新增不带编号（由本模块分配）；已有事务只收状态/结果变化。 */
  function mergeLedger(card, entries, cfg) {
    card.ledger = Array.isArray(card.ledger) ? card.ledger : [];
    const cap = (cfg && cfg.maxLedger) || 12;
    entries.forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      const id = clean(e.id, 12);
      if (id) {
        const hit = card.ledger.filter(function (x) { return x && x.id === id; })[0];
        if (!hit) return;
        const st = LEDGER_STATES.indexOf(clean(e.state, 12)) >= 0 ? clean(e.state, 12) : hit.state;
        hit.state = st;
        if (e.result) hit.result = clean(e.result, 120);
        hit.answeredAt = clockNow('elsewhere');
        return;
      }
      const text = clean(e.text, 160);
      if (!text) return;
      if (card.ledger.filter(function (x) { return x && x.text === text; })[0]) return;
      card.ledger.push({ id: 'T' + (card.ledger.length + 1), text: text, state: 'ongoing', result: '', openedAt: clockNow('elsewhere'), answeredAt: 0 });
    });
    while (card.ledger.length > cap) card.ledger.shift();
  }
  /** 台账对账：进行中的每一条每轮都要逐条表态，缺一条 ⇒ ledger-unanswered。 */
  function reconcile(name, entries) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const card0 = rowOf(nm);
    if (!card0) return refuse('unknown-person');
    const ongoing = (card0.ledger || []).filter(function (x) { return x && x.state === 'ongoing'; });
    if (ongoing.length) {
      const said = {};
      (Array.isArray(entries) ? entries : []).forEach(function (e) { if (e && typeof e === 'object') said[clean(e.id, 12)] = true; });
      if (ongoing.filter(function (x) { return !said[x.id]; }).length) return refuse('ledger-unanswered');
    }
    stat.reconciled++;
    return { ok: true, reason: 'ok', name: nm, ongoing: ongoing.length };
  }
  /** 恋爱三轴：**只收事件，不收数字**。裸数值一律 raw-number（上游原文）。 */
  function romance(name, ev) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    if (!rowOf(nm)) return refuse('unknown-person');
    const e = ev && typeof ev === 'object' ? ev : {};
    const axis = clean(e.axis, 12);
    if (AXES.indexOf(axis) < 0) return refuse('unknown-axis');
    const kind = clean(e.kind, 24);
    if (EVENTS[axis].indexOf(kind) < 0) return refuse('unknown-event');
    if (e.value !== undefined && e.value !== null && String(e.value).trim() !== '') return refuse('raw-number');
    const basis = clean(e.basis, 160);
    if (!basis) return refuse('missing-basis');
    const strength = axis === 'status' ? 0 : (STRENGTH[clean(e.strength, 12)] || 0);
    if (axis !== 'status' && !strength) return refuse('missing-strength');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const card0 = b.rows.filter(function (r) { return r && r.name === nm; })[0];
      if (!card0) { out = { ok: false, reason: 'unknown-person' }; return false; }
      if (!card0.romance) card0.romance = freshRomance();
      const dir = NEGATIVE[kind] ? -1 : 1;
      const delta = axis === 'status' ? dir : dir * strength;
      const before = Number(card0.romance[axis]) || 0;
      const after = Math.max(0, Math.min(100, before + delta));
      card0.romance[axis] = after;
      card0.romance.stages[axis] = kind;
      if (!Array.isArray(card0.romance.log)) card0.romance.log = [];
      card0.romance.log.push({ axis: axis, kind: kind, strength: strength, dir: dir, basis: basis, at: clockNow('elsewhere') });
      while (card0.romance.log.length > 24) card0.romance.log.shift();
      card0.updatedAt = clockNow('elsewhere');
      out = { ok: true, reason: 'ok', name: nm, axis: axis, kind: kind, before: before, after: after };
      return true;
    }, 'elsewhere:romance');
    if (out && out.ok) stat.events++;
    return out || refuse('tx-failed');
  }
  /** 三轴读数（**注入块不念数字**，故这里只给档位标签，供注入面用）。 */
  function bandOf(v) {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    if (n <= 0) return '未起';
    if (n < 20) return '初识';
    if (n < 40) return '亲近';
    if (n < 60) return '深交';
    if (n < 80) return '笃厚';
    return '至深';
  }
  function romanceOf(name) {
    const card0 = rowOf(name);
    if (!card0) return { ok: false, reason: 'unknown-person' };
    const r = card0.romance || freshRomance();
    const out = { ok: true, name: clean(name, 40) };
    AXES.forEach(function (a) { out[a] = { band: bandOf(r[a]), label: AXIS_LABEL[a] }; });
    return out;
  }
  /** 移除。**唯一理由是死亡**（上游原文）。 */
  function remove(name, reason) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const nm = clean(name, 40);
    if (!nm) return refuse('no-name');
    const rs = clean(reason, 20);
    if (REMOVE_REASONS.indexOf(rs) < 0) return refuse('not-death');
    if (!rowOf(nm)) return refuse('unknown-person');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const before = b.rows.length;
      b.rows = b.rows.filter(function (r) { return !(r && r.name === nm); });
      out = { ok: before !== b.rows.length, reason: 'ok', name: nm };
      return true;
    }, 'elsewhere:remove');
    if (out && out.ok) stat.removed++;
    return out || refuse('tx-failed');
  }
  function card(name) {
    const c = rowOf(name);
    if (!c) return { ok: false, reason: 'unknown-person' };
    return { ok: true, card: JSON.parse(JSON.stringify(c)) };
  }
  function list() { return rows().map(function (r) { return r && r.name; }).filter(Boolean); }
  function view() {
    return rows().map(function (r) {
      const ongoing = (r.ledger || []).filter(function (x) { return x && x.state === 'ongoing'; }).length;
      return { name: r.name, place: r.place, doing: r.doing, ongoing: ongoing, recent: (r.recent || []).length, hasHidden: HIDDEN_FIELDS.filter(function (k) { return !!r[k]; }).length };
    });
  }
  function buildBlock() {
    if (!settings().enabled) return '';
    const all = rows();
    if (!all.length) return '';
    const lines = all.slice(-12).map(function (r) {
      const bits = ['· ' + r.name + '｜' + (r.place || '?') + '｜' + (r.doing || '?') + '｜' + (r.status || '?')];
      if (r.goal) bits.push('  当前目标：' + r.goal);
      if (r.worry) bits.push('  心里惦记：' + r.worry);
      const ongoing = (r.ledger || []).filter(function (x) { return x && x.state === 'ongoing'; });
      if (ongoing.length) bits.push('  未完成事项：' + ongoing.map(function (x) { return x.id + ' ' + x.text; }).join('；'));
      const rl = r.romance || {};
      const bands = AXES.filter(function (a) { return Number(rl[a]) > 0; }).map(function (a) { return AXIS_LABEL[a] + '·' + bandOf(rl[a]); });
      if (bands.length) bits.push('  关系：' + bands.join(' '));
      if ((r.recent || []).length) bits.push('  近期：' + r.recent.join(' / '));
      return bits.join('\n');
    });
    return ['【幕后 NPC 状态】', '（这些人在主角视野外仍在生活；只报事实，数值由系统折算）'].concat(lines).join('\n');
  }
  function reset() { stat.opened = 0; stat.updated = 0; stat.reconciled = 0; stat.events = 0; stat.removed = 0; stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {}; return { ok: true }; }
  WA.elsewhere = {
    getSettings: settings, setSettings: saveSettings,
    open: open, update: update, reconcile: reconcile, romance: romance, remove: remove,
    card: card, list: list, view: view, romanceOf: romanceOf, bandOf: bandOf,
    buildBlock: buildBlock, stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    AXES: AXES, AXIS_LABEL: AXIS_LABEL, EVENTS: EVENTS, STRENGTH: STRENGTH, STRENGTH_LABEL: STRENGTH_LABEL,
    REMOVE_REASONS: REMOVE_REASONS, LEDGER_STATES: LEDGER_STATES, CORE: CORE, HIDDEN_FIELDS: HIDDEN_FIELDS,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/elsewhere.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'elsewhere 已加载（2.230.0）');
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    WA.workflow.register({
      id: 'elsewhere.cardSweep', chain: 'after', order: 21, critical: false,
      label: '彼方档案·台账对账与近期事件挤出（幕后 NPC 状态账）',
      async run() {
        try {
          if (!WA.elsewhere || typeof WA.elsewhere.list !== 'function') return;
          const names = WA.elsewhere.list();
          for (let i = 0; i < names.length; i++) {
            try { WA.elsewhere.view(names[i]); } catch (e) { /* 单卡失败不拖批 */ }
          }
        } catch (e) { /* 附属面失败不拖主链 */ }
      }
    });
  }
})();
