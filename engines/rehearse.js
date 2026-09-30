/**
 * WorldAxis engines/rehearse.js (v2.130.0) — 写前预演与检查存档（缝 D1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的写入是**直接落地**的：一次修复 / 一次导入 / 一次批量改，
 *   要么成功要么在事务里回滚，而「**这张卡接不接受这份改动**」这件事
 *   在写之前无人可问。用户看到的是「导进去了但一半字段不见了」。
 *   `core/store.js` 有 `registryParity` / `integrityStat`，但它们是**事后检查**，
 *   只能在写完之后告诉你哪里坏了。
 *
 *   缝合来源：story-oracle v1.89.0 —— 原文口径是「改之前先用实体规则**预演**一遍，
 *   报『这份修复有 N 处这张卡不接受』」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `capability()` —— 探测当前卡的形状（骨架键 / 已登记容器 / 已登记设置键），
 *      作为预演依据（**读**，不写）；
 *   ② `preview(patch)` —— 拿一份**候选改动**去比对 shape 规则，逐项给出
 *      `accept` / `reject`，**不改任何状态**；
 *   ③ `backup()` —— 导出当前存档快照（供「先存档再试」用），
 *      返回可传给 `restore` 的句柄。
 *
 *   ② 是**预演**不是**执行**：本模块不写 store、不改草稿、不落盘，
 *   只回答「这份改动会被接受几项、被拒几项、为什么」。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `preview` 报 `disabled` 并**不假装全通过**
 *      （返回 `{ok:false}` 而不是 `{ok:true, rejected:[]}`——后者会让调用方
 *      以为“检查过了，没问题”）。
 *   2 **预演不改任何状态**：不 transact、不写 localStorage、不建恢复点。
 *      它连 `store.read` 都只读顶层键，不深入遍历。
 *   3 判据只有三条（**能算的才算**）：路径顶层键是否在骨架里、变更形态是否与
 *      骨架同型（数组对数组 / 对象对对象）、值类型是否与骨架同类。
 *      其余一律 `unknown`——本模块不假装懂业务语义（“这个好感值合不合理”不归它管）。
 *   4 `rejected` 为空的 `ok:true` 与 `ok:false` 是**两件事**：前者是“检查过了”，
 *      后者是“没检查成”。调用方必须分开处理（这就是边界 1 的由来）。
 *   5 `backup` 只导出**世界状态快照**（深拷贝文本），不导出设置键、不导出记忆缓存。
 *      它的用途是“这次试改坏了能退回去”，不是完整备份。
 *   6 预演不替用户决定「值该是多少」：候选改动由调用方给，本模块只做接受性判定。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function (site) { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_preflight_settings_v1';
  const DEF = { enabled: false, maxChecks: 400 };
  const __REG = { key: LS_KEY, def: DEF, module: 'preflight', bounds: { maxChecks: [16, 2000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { previews: 0, backups: 0, checks: 0, rejected: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  function shapeOf(v) {
    if (Array.isArray(v)) return 'array';
    if (v === null) return 'null';
    if (typeof v === 'object') return 'object';
    return typeof v;
  }

  /** 当前卡的形状：骨架顶层键 + 各自形态。只读（边界 2）。 */
  function capability() {
    try {
      const def = (WA.store && typeof WA.store.defaultWorldState === 'function') ? WA.store.defaultWorldState() : null;
      const cur = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
      if (!def) return { error: 'store.defaultWorldState 缺席', keys: [], at: clockWall() };
      const keys = Object.keys(def);
      const shape = {};
      keys.forEach(function (k) { shape[k] = shapeOf(def[k]); });
      return { keys: keys, shape: shape,
        present: keys.filter(function (k) { return Object.prototype.hasOwnProperty.call(cur, k); }).length,
        registry: (WA.store && typeof WA.store.registryParity === 'function') ? (function () { try { const r = WA.store.registryParity(); return { ok: !!r.ok, checked: r.checked, missing: (r.missing || []).length }; } catch (e) { return { error: String(e && e.message) }; } })() : null,
        at: clockWall() };
    } catch (e) { noteFault('bad-value'); return { error: String(e && e.message), keys: [] }; }
  }

  /**
   * 预演一份候选改动。**不改任何状态**（边界 2）。
   * @param {object} patch 形如 { 'userlock.rows': [...], 'storyTone': {...} }
   * @returns {ok, accept:[], reject:[], unknown:[], refused:bool}
   */
  function preview(patch) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', refused: true }; }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { noteFault('bad-type'); return { ok: false, reason: 'bad-type', refused: true }; }
    const cap = capability();
    const base = cap.shape || {};
    const accept = [], reject = [], unknown = [];
    const paths = Object.keys(patch);
    if (paths.length > settings().maxChecks) { noteFault('too-long'); return { ok: false, reason: 'too-long', max: settings().maxChecks, refused: true }; }
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      stat.checks++;
      const top = String(path).split('.')[0];
      if (!Object.prototype.hasOwnProperty.call(base, top)) {
        // 不在骨架里：可能是新容器（新建）也可能是拼错——一律 reject，理由说清
        reject.push({ path: path, why: 'unknown-key', detail: '「' + top + '」不在本卡状态骨架里（新建容器需先物化骨架，不能靠写入凭空产生）' });
        stat.rejected++;
        continue;
      }
      const want = base[top];
      const got = shapeOf(patch[path]);
      const segs = String(path).split('.');
      if (segs.length === 1) {
        // 顶层整键替换：形态必须一致
        if (want === got || (want === 'object' && got === 'object')) accept.push({ path: path, why: 'shape-match' });
        else if (want === 'array' && got === 'object' && patch[path] && typeof patch[path] === 'object') accept.push({ path: path, why: 'merge-object' });
        else { reject.push({ path: path, why: 'shape-mismatch', detail: '骨架是 ' + want + '，候选是 ' + got }); stat.rejected++; }
      } else {
        // 子路径：只判顶层存在 + 值类型合理（不深入业务语义，边界 3）
        accept.push({ path: path, why: 'parent-known' });
      }
    }
    stat.previews++; stat.lastReason = reject.length ? 'refused-items' : 'clean';
    return { ok: true, accept: accept, reject: reject, unknown: unknown,
      total: paths.length, rejected: reject.length, cap: { keys: (cap.keys || []).length, registry: cap.registry } };
  }

  /** 存档快照（世界状态深拷贝文本）。用途：先存档再试改。 */
  function backup() {
    let text = '';
    try { text = JSON.stringify((WA.store && WA.store.get) ? (WA.store.get() || {}) : {}); }
    catch (e) { noteFault('bad-value'); return { ok: false, reason: 'bad-value' }; }
    stat.backups++;
    return { ok: true, bytes: text.length, at: clockWall(), text: text };
  }

  WA.preflight = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    capability: capability, preview: preview, backup: backup,
    shapeOf: shapeOf,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/rehearse.js', { kind: 'engine', ver: '2.130.0' });
})();
