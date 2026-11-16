/**
 * WorldAxis engines/life-profile.js (v2.417.0) — EXV25-3 生活小档案（按人分账）
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓人物侧已有 `store.people.<id>.profile`（人设五节：personality/worldview/...，带 cap 钳制）
 *   与 `human-realism` 的 needs（饥饿/困乏）。但这两处管的都是**人物自身的属性**，
 *   没有任何一处记「这个人明确说过或正文揭示的**偏好 / 习惯 / 近况**」——
 *   也就是「他爱喝什么茶、他每天晚上要巡一次院、他娘最近病了」这一档。
 *   实测 `grep -rn '生活小档案\|lifeProfile\|preferenceLedger' engines/` —— 430 引擎 0 命中
 *   （`lonsha-reader.js` 里的 `lifeDetail` 是记忆桥的字段名，不是本机制）。
 *
 *   后果具体：偏好只在当轮上下文里活着，隔几十楼就全丢；更糟的是**跨人串味**——
 *   「她不喝烈酒」被记成「在场的人都不喝烈酒」，于是下一场戏人人推杯。
 *   所以本模块的头号判据不是「记得多」，而是**每条都必须带主语，不同人同一句偏好各记各的**。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `record({subject, text, kind})` 按人入账（缺主语沿用旧义 `user`，不从正文猜人）→
 *   去重键 = 主语 + 规范化正文（同一句偏好属于不同人物时**各自保留**）→
 *   `about(subject)` 只读该人的档案；`remove` 删除；`update` 改正文。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store，不写 `people.*.profile`：那是人设，这是生活观察，两本账不合并。
 *   ② 不从正文推断习惯：一条行为不等于习惯，须调用方判定后显式 record。
 *   ③ 每人条数有界（默认 16），挤出最早条目；`pinned` 不挤。
 *   ④ 拒收码只用 disabled / missing-text / unknown-entry。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_life_profile_settings_v1';
  const DEF = { enabled: true, maxRows: 256, perPerson: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'lifeProfile',
    bounds: { maxRows: [64, 1024], perPerson: [4, 48] } };
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
  const KINDS = ['preference', 'habit', 'recent', 'aversion'];
  const stat = { recorded: 0, updated: 0, removed: 0, dups: 0, refused: 0, lastReason: '' };
  const ROWS = []; // {id, subject, subjectKey, text, textKey, kind, at, pinned}
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function keyOf(s) { return str(s).toLowerCase(); }
  /** 规范化：去尾标点与多余空白（「他爱喝浓茶。」与「他爱喝浓茶」算同一条） */
  function norm(t) { return str(t).toLowerCase().replace(/[\s，。！？!?、；;：:]+$/u, '').replace(/\s+/gu, ' ').trim(); }
  /** 缺主语时沿用旧义 user；不从正文猜角色。 */
  function subjectOf(v) { return str(v) || 'user'; }
  function same(a, b) { return a.subjectKey === b.subjectKey && a.textKey === b.textKey; }
  function rowsOf(subject) { const k = keyOf(subjectOf(subject)); return ROWS.filter(function (r) { return r.subjectKey === k; }); }
  function trimPerson(subject, cap) {
    const mine = rowsOf(subject);
    while (mine.length > cap) {
      const idx = mine.findIndex(function (r) { return !r.pinned; });
      if (idx < 0) break;
      const victim = mine.splice(idx, 1)[0];
      const at = ROWS.indexOf(victim);
      if (at >= 0) ROWS.splice(at, 1);
    }
  }
  function record(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const text = str(s.text);
    if (!text) { stat.refused++; stat.lastReason = 'missing-text'; return { ok: false, hint: 'missing-text：记的是什么偏好 / 习惯 / 近况？' }; }
    const subject = subjectOf(s.subject);
    const rec = { subject: subject, subjectKey: keyOf(subject), text: text, textKey: norm(text) };
    const dup = ROWS.find(function (r) { return same(r, rec); });
    if (dup) { stat.dups++; dup.hits = (dup.hits || 1) + 1; return { ok: true, id: dup.id, dup: true, subject: dup.subject }; }
    const kind = KINDS.indexOf(str(s.kind)) >= 0 ? str(s.kind) : 'preference';
    const now = num(s.at) || clockNow('lifeProfile') || 0;
    const row = { id: 'lp' + (++stat.recorded) + '-' + keyOf(subject), subject: subject, subjectKey: keyOf(subject),
      text: text, textKey: norm(text), kind: kind, at: now, pinned: !!s.pinned, hits: 1 };
    ROWS.push(row);
    while (ROWS.length > cfg.maxRows) {
      const idx = ROWS.findIndex(function (r) { return !r.pinned; });
      if (idx < 0) break;
      ROWS.splice(idx, 1);
    }
    trimPerson(subject, cfg.perPerson);
    return { ok: true, id: row.id, subject: subject, kind: kind };
  }
  function update(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const row = ROWS.find(function (r) { return r.id === str(s.id); });
    if (!row) { stat.refused++; stat.lastReason = 'unknown-entry'; return { ok: false, hint: 'unknown-entry：没有这条生活档案' }; }
    const text = str(s.text);
    if (!text) { stat.refused++; stat.lastReason = 'missing-text'; return { ok: false, hint: 'missing-text：改成什么？' }; }
    row.prevText = row.text; row.text = text; row.textKey = norm(text);
    stat.updated++;
    return { ok: true, id: row.id, text: row.text, subject: row.subject };
  }
  function remove(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const idx = ROWS.findIndex(function (r) { return r.id === str(s.id); });
    if (idx < 0) { stat.refused++; stat.lastReason = 'unknown-entry'; return { ok: false, hint: 'unknown-entry：没有这条生活档案' }; }
    const row = ROWS.splice(idx, 1)[0];
    stat.removed++;
    return { ok: true, id: row.id, subject: row.subject };
  }
  /** 只读：该人的档案（每条都带主语，不跨人合并）。 */
  function about(spec) {
    const s = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : { subject: spec };
    const subject = subjectOf(s.subject);
    const rows = rowsOf(subject).map(function (r) {
      return { id: r.id, subject: r.subject, text: r.text, kind: r.kind, at: r.at, pinned: r.pinned };
    });
    return { ok: true, subject: subject, count: rows.length, rows: rows,
      hint: rows.length ? '' : '这个人还没有档案：不要凭空替他编偏好' };
  }
  function view() {
    const m = {};
    ROWS.forEach(function (r) { m[r.subjectKey] = (m[r.subjectKey] || 0) + 1; });
    return { ok: true, count: ROWS.length, bySubject: m,
      rows: ROWS.map(function (r) { return { id: r.id, subject: r.subject, text: r.text, kind: r.kind, at: r.at }; }) };
  }
  function statView() {
    const m = {};
    ROWS.forEach(function (r) { m[r.subjectKey] = 1; });
    return Object.assign({ rows: ROWS.length, people: Object.keys(m).length }, stat);
  }
  function reset() {
    ROWS.length = 0;
    stat.recorded = 0; stat.updated = 0; stat.removed = 0; stat.dups = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.lifeProfile = {
    record: record, update: update, remove: remove, about: about, view: view,
    stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings,
    KINDS: KINDS.slice()
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/life-profile.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/life-profile 已加载（2.417.0）');
})();