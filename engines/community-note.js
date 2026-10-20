/**
 * WorldAxis engines/community-note.js (v2.230.0) — 社区笔记
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `rumor`（传言）与 `opinion`（舆情）都是**内容面**：传什么、几成信。
 *   但**投递面**没有账：现场实测 `社区笔记` / `communityNote` / `公告投递` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：「这条公告已经贴过了没有」答不出来 —— 同一张纸条每次开局都重投一遍；
 *   新公告与旧公告同时挂着的状态也无法判定谁该退场。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 h675786161-prog/world-backstage 的 community-note.js（公告纸条）：
 *     · **一次性送达**：见过就记 `seen = 1`，同一份只投一次（幂等）；
 *     · **覆盖语义**：新公告**顶替**旧公告（台面上只留最新一张）；
 *     · **已读不可回退**（单向），但可**记录投递**与**确认收取**两件事分开；
 *     · 投递**有硬上限**（超限挤出最旧并如实报）。
 *   本模块只取其中**可判定的那一层**（幂等投递 / 覆盖 / 双账 seen+delivered / 上限）；
 *   渲染与弹窗由 UI 层做，本模块**不碰 DOM、不落盘到宿主**。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · rumor —— 「传言内容与可信度」，本模块不读它；
 *   · opinion —— 「舆情读数」，本模块不改它；
 *   · 本模块 —— **投递台账 + 一次性语义 + 覆盖语义 + 已读单向**（纯记账）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `push`/`ack` 一律 `disabled`。
 *   ② **空笔记拒收**：正文为空 ⇒ `empty-note`（不发空纸条）。
 *   ③ **同一份只投一次**：同 `id` 再推 ⇒ `already-delivered`（幂等，不重复计数）。
 *   ④ **同 `id` 内容变了不是新纸条**：内容变更 ⇒ `already-delivered:changed`，
 *      只更新正文不重投（防「改个字就算新公告」刷屏）。
 *   ⑤ **覆盖只顶最新一张**：`overwrite` 只作用于当前台面**最新的那一张待投**，
 *      更旧的待投不被顺手清掉（覆盖范围不越权扩大，越权由调用方自己 ack）。
 *   ⑥ **已读单向**：`ack` 之后再 `pending` 不再返回它，**没有 `unack`**。
 *   ⑦ 台账**有硬上限**（FIFO 挤出最旧），挤出计数如实报。
 *   ⑧ 不落盘、不跨会话、不碰 DOM（投放与渲染是宿主的事）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_community_note_settings_v1';
  const DEF = { enabled: false, maxNotes: 48, maxBody: 2000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'communityNote',
    bounds: { maxNotes: [4, 400], maxBody: [40, 20000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const SCOPES = ['world', 'city', 'org', 'person'];
  const SCOPE_LABEL = { world: '世界', city: '城市', org: '组织', person: '个人' };
  const STATES = ['pending', 'seen'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { pushed: 0, delivered: 0, acked: 0, covered: 0, evicted: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 80); }

  const NOTES = { rows: [] };  // [{ id, scope, title, body, state, at, changed }]

  function idOf(v) {
    const s = clean(v, 60);
    return s ? s : null;
  }
  /** 推入公告：幂等 + 覆盖语义。 */
  function push(note, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = note || {};
    const id = idOf(o.id);
    if (!id) return refuse('no-id');
    const body = clean(o.body, cfg.maxBody);
    if (!body) return refuse('empty-note');
    const scope = SCOPES.indexOf(clean(o.scope, 20)) >= 0 ? clean(o.scope, 20) : SCOPES[0];
    const title = clean(o.title, 80);
    const exist = NOTES.rows.find(function (r) { return r.id === id; });
    if (exist) {
      const changed = exist.body !== body || exist.title !== title;
      if (changed) { exist.body = body; exist.title = title; exist.changed++; }
      noteFault(changed ? 'already-delivered:changed' : 'already-delivered');
      return { ok: false, reason: changed ? 'already-delivered:changed' : 'already-delivered',
        id: id, state: exist.state, changed: changed };
    }
    const row = { id: id, scope: scope, title: title, body: body, state: 'pending', at: clockNow('communityNote'), changed: 0 };
    NOTES.rows.push(row);
    let evicted = 0;
    while (NOTES.rows.length > cfg.maxNotes) { NOTES.rows.shift(); evicted++; }
    stat.pushed++; stat.delivered++; stat.evicted += evicted;
    const overwrite = !!(opts && opts.overwrite);
    let covered = null;
    if (overwrite) {
      const prev = NOTES.rows.filter(function (r) { return r.id !== id && r.state === 'pending'; });
      const latest = prev[prev.length - 1];
      if (latest) { latest.state = 'seen'; covered = latest.id; stat.covered++; }
    }
    return { ok: true, reason: 'ok', id: id, scope: scope, scopeLabel: SCOPE_LABEL[scope],
      state: row.state, evicted: evicted, kept: NOTES.rows.length, cap: cfg.maxNotes, covered: covered };
  }
  /** 待投递（还没被见到的）。 */
  function pending() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const rows = NOTES.rows.filter(function (r) { return r.state === 'pending'; });
    return { ok: true, reason: 'ok', count: rows.length, rows: rows.map(function (r) {
      return { id: r.id, scope: r.scope, title: r.title, body: r.body, state: r.state }; }) };
  }
  /** 确认见到（单向）：不可回退。 */
  function ack(ids) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const list = Array.isArray(ids) ? ids : [ids];
    const done = []; const miss = [];
    list.forEach(function (v) {
      const id = idOf(v);
      if (!id) { miss.push({ id: v, why: 'no-id' }); return; }
      const row = NOTES.rows.find(function (r) { return r.id === id; });
      if (!row) { miss.push({ id: id, why: 'unknown-note' }); return; }
      if (row.state === 'seen') { miss.push({ id: id, why: 'already-seen' }); return; }
      row.state = 'seen'; done.push(id);
    });
    if (!done.length) return refuse('nothing-acked');
    stat.acked += done.length;
    return { ok: true, reason: 'ok', acked: done, count: done.length, missed: miss };
  }
  function markSeen(id) { return ack(id); }
  function isSeen(id) {
    const k = idOf(id);
    if (!k) return { ok: false, reason: 'no-id' };
    const row = NOTES.rows.find(function (r) { return r.id === k; });
    if (!row) return { ok: true, reason: 'ok', id: k, seen: false, known: false };
    return { ok: true, reason: 'ok', id: k, seen: row.state === 'seen', known: true };
  }
  function list(opts) {
    const o = opts || {};
    const want = o.state && STATES.indexOf(clean(o.state, 10)) >= 0 ? clean(o.state, 10) : null;
    const rows = NOTES.rows.filter(function (r) { return !want || r.state === want; });
    return { ok: true, reason: 'ok', count: rows.length, total: NOTES.rows.length,
      rows: rows.slice(-20).map(function (r) { return { id: r.id, scope: r.scope, scopeLabel: SCOPE_LABEL[r.scope],
        title: r.title, state: r.state, stateLabel: r.state === 'seen' ? '已见' : '待投', changed: r.changed }; }) };
  }
  function clear() { const n = NOTES.rows.length; NOTES.rows = []; return { ok: true, reason: 'ok', dropped: n }; }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxNotes: cfg.maxNotes, maxBody: cfg.maxBody,
      scopes: SCOPES.slice(), scopeLabel: SCOPE_LABEL, states: STATES.slice(),
      kept: NOTES.rows.length, pending: NOTES.rows.filter(function (r) { return r.state === 'pending'; }).length,
      semantics: '一次性投递（幂等）/ 同 id 改文只更新不重投 / 已读单向' };
  }
  function resetStat() {
    stat.pushed = 0; stat.delivered = 0; stat.acked = 0; stat.covered = 0; stat.evicted = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.communityNote = {
    getSettings: settings, setSettings: saveSettings, view: view,
    push: push, pending: pending, ack: ack, markSeen: markSeen, isSeen: isSeen, list: list, clear: clear,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    SCOPES: SCOPES, SCOPE_LABEL: SCOPE_LABEL, STATES: STATES,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/community-note.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'communityNote 已加载（2.230.0）');
})();
