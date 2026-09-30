/**
 * WorldAxis engines/userlock.js (v2.129.0) — 用户锁定记忆（缝 A1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的状态推演有一个未言明的默认前提：**谁后写谁赢**。`backstage.applyResult`、
 *   `evolution.tick`、`memory` 巩固等结算器一律「以本轮模型输出为准」覆盖既有条目 ——
 *   这自动推演里是正确的，但当**用户亲手改过**某一条（人名、关系、事实、伏笔）时，
 *   下一轮模型输出仍会把它静默改回去。用户看到的是「我改的东西又变回去了」，
 *   而这种覆盖在本仓**没有任何痕迹**：写侧台账只记「写成功 N 次」，
 *   读侧看不出哪一条是被覆盖掉的（与 v2.13.0 治的「挤出成功 = 数据真的没了」同型）。
 *
 *   缝合来源：st-theater `DREAM_MEMORY_V2_SPEC.md` §5 把记忆条目分成四类互斥处置
 *   （隐藏 / 否定错误 / 被取代 / 已解决），并把 `editedByUser` / `lockedByUser` 单列 ——
 *   原文口径是「用户改过的条目不得被自动推演静默覆盖」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `lock` / `unlock` —— 记「这条路径由用户锁着」。必须带 `by`（谁锁的）；
 *   ② `isLocked` —— 纯只读回答「锁没锁」，不写状态、不计数副作用；
 *   ③ `rejectWrite` —— 在**任何写路径之前**回答「这次写该不该被拦下」。
 *      锁着的路径一律拒收（reason:'locked'）并把「谁锁的」一并带出。
 *
 *   ③ 是**闸门**不是**改写**：本模块不替调用方决定怎么写，只回答「不许写」。
 *   调用方拿不到第三种答案 —— 要么 `null`（放行），要么拒收体。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `lock` 报 `disabled` 且不落盘、不计数。
 *   2 路径必须是具名字符串。空、空白、非字符串一律拒收（`missing-key`）。
 *   3 `lock` 必须带 `by`。无名锁 = 没人认领的锁，一律拒收（`no-name`）。
 *   4 重复锁**幂等**：同路径已锁则该次为 no-op（`ok:true, existed:true`），不追加行。
 *   5 `rejectWrite` 只读状态：绝不写、绝不改锁、绝不因为「拦不下」而放宽。
 *   6 锁只挡**自动覆盖**：`rejectWrite(path, by)` 里 `by` 与锁的署名**同人**时放行
 *     （用户改自己锁的条目是本意，不是冲突）。
 *   7 `unlock` 只删指定路径那一行，绝不因为「没找到」而改别人的锁（`not-found` 如实报）。
 *   8 `unlock` **不受总开关限制** —— 否则关掉开关会留下解不掉的锁（用户被自己的设置锁死）。
 *   9 不存理由文本：锁只记「谁、什么时候」，不记「为什么」（理由是用户的事，不是账本的事）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_userlock_settings_v1';
  const DEF = { enabled: false, maxRows: 200 };
  const __REG = { key: LS_KEY, def: DEF, module: 'userlock', bounds: { maxRows: [8, 512] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { locks: 0, unlocks: 0, noops: 0, rejects: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }

  function bucket(draft) {
    if (!draft.userlock || typeof draft.userlock !== 'object' || Array.isArray(draft.userlock)) draft.userlock = { rows: [], seq: 0 };
    const b = draft.userlock;
    if (!Array.isArray(b.rows)) b.rows = [];
    if (typeof b.seq !== 'number') b.seq = 0;
    return b;
  }
  function rows() { const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; return (s.userlock && Array.isArray(s.userlock.rows)) ? s.userlock.rows : []; }
  function normPath(p) { const t = clean(p, 200); return t ? t.replace(/\s+/g, '') : ''; }
  function findRow(p) { const rs = rows(); for (let i = 0; i < rs.length; i++) if (rs[i] && rs[i].path === p) return rs[i]; return null; }
  function isLocked(p) { const k = normPath(p); return k ? !!findRow(k) : false; }

  function lock(path, by) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const p = normPath(path), who = clean(by, 60);
    if (!p) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: '路径必填' }; }
    if (!who) { noteFault('no-name'); return { ok: false, reason: 'no-name', detail: '锁必须带 by（谁锁的）' }; }
    const exist = findRow(p);
    if (exist) { stat.noops++; return { ok: true, existed: true, path: p, by: exist.by }; }
    let hit = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      if (b.rows.some(function (x) { return x && x.path === p; })) { hit = true; return false; }
      b.rows.push({ path: p, by: who, at: clockNow('userlock') });
      b.seq++;
      if (WA.evict) WA.evict.array(b.rows, 'userlock.rows', settings().maxRows);
      hit = true;
      return true;
    }, 'userlock:lock') : null;
    if (!hit || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable', path: p }; }
    stat.locks++; stat.lastReason = 'locked';
    return { ok: true, path: p, by: who };
  }

  function unlock(path) {
    const p = normPath(path);
    if (!p) { noteFault('missing-key'); return { ok: false, reason: 'missing-key' }; }
    let found = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const i = b.rows.map(function (x) { return x && x.path; }).indexOf(p);
      if (i < 0) return false;
      b.rows.splice(i, 1); found = true; return true;
    }, 'userlock:unlock') : null;
    if (!found || !r || r.ok !== true) { noteFault('not-found'); return { ok: false, reason: 'not-found', path: p }; }
    stat.unlocks++;
    return { ok: true, path: p };
  }

  /**
   * 写前闸门。返回 `null` = 放行；非 null = 拒收体（调用方**必须**放弃这次写）。
   * 无路径（空/非字符串）一律放行 —— 那不是本闸门管的事，不由本模块制造新的拒收面。
   */
  function rejectWrite(path, by) {
    const p = normPath(path);
    if (!p) return null;
    const row = findRow(p);
    if (!row) return null;
    const who = clean(by, 60);
    if (who && row.by === who) return null;   // 同人放行：用户改自己锁的条目是本意
    stat.rejects++;
    return { reason: 'locked', path: p, lockedBy: row.by, at: row.at, by: who || null };
  }

  function clear() {
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) { const b = bucket(d); const n = b.rows.length; b.rows = []; return true; }, 'userlock:clear') : null;
    return { ok: !!(r && r.ok === true) };
  }

  function buildBlock() {
    const rs = rows();
    if (!rs.length) return '';
    const lines = rs.slice(-20).map(function (r) {
      return '· ' + r.path + '（' + (r.by || '未署名') + ' 锁定）';
    });
    return '[用户锁定] 下列条目由用户亲手改定，**任何自动推演都不得静默覆盖**（要改必须由同一人先解锁）：\n'
      + lines.join('\n')
      + '\n锁定铁律：被锁条目的现值就是事实。模型若认为它与剧情冲突，只可在正文里体现矛盾，不得改条。\n';
  }

  WA.userlock = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    lock: lock, unlock: unlock, isLocked: isLocked, rejectWrite: rejectWrite,
    list: function () { return rows().map(function (r) { return { path: r.path, by: r.by, at: r.at }; }); },
    clear: clear, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/userlock.js', { kind: 'engine', ver: '2.129.0' });
})();
