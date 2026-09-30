/**
 * WorldAxis engines/binding.js (v2.130.0) — 配置绑定优先级（缝 D3）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的预设 / 规则 / 题材配置是**全局一份**（`engines/preset.js` 按段覆盖、
 *   `engines/theme.js` 按模块叠加）。同一台机器上换一个角色、换一个聊天，
 *   规则只能手动再改一遍，而且改了之后**上一份找不回来**。
 *
 *   缝合来源：choice + The-Veridis-Lion「预设与绑定」—— 原文口径是
 *   「配置按**聊天 > 角色 > 默认**三级取；离场即回落，不需要手动改回」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `bind(scope, key, value)` —— 把一份配置绑到某个层（chat / char / default）；
 *   ② `read(key)` —— 按**聊天 > 角色 > 默认**取生效值（带 `from` 说出是谁给的）；
 *   ③ `unbind(scope, key)` —— 解绑一层（**下层自动恢复**，不需要重设）。
 *
 *   三层是**同一条读路径**上的三个来源：`read` 是唯一取值口，
 *   不允许调用方自己挑层（挑了就等于各层有自己的优先级）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `read` 一律返回**默认层**（不回落到聊天层），
 *      并带 `from:'default'`——关开关等于“绑定全部失效但值还在”，不是“清空”。
 *   2 **范围是有限枚举**：`chat` / `char` / `default`。给别的名字一律拒收
 *      （`bad-value`）——静默接受会让绑定落到一个永远读不到的地方。
 *   3 分层键是 `scope + 命名空间`：聊天层与角色层各存自己的，**互不覆盖**。
 *      优先级只在 `read` 里体现（不在写里体现——写时“高优先级覆盖低优先级”
 *      会让回退丢数据）。
 *   4 `unbind` 只删指定层的那一项；删不存在的项如实报 `not-found`，
 *      **不**顺手把别的层也清掉。
 *   5 传 `value === undefined` 视为**解绑**（而不是“绑成 undefined”）——
 *      绑成 undefined 会让 `read` 命中一个空值层，等于把下层永久遮住。
 *   6 值按 JSON 深拷贝存入：引用共享会让面板改一处影响所有层。
 *   7 不写 `engines/preset.js` 的段覆盖（那是另一套真源）：本模块是**通用绑定表**，
 *      两套真源同时改同一个键必然漂移，故本模块只服务显式来绑定它的调用方。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_binding_settings_v1';
  const SCOPES = ['chat', 'char', 'default'];
  const DEF = { enabled: false, maxKeys: 200 };
  const __REG = { key: LS_KEY, def: DEF, module: 'binding', bounds: { maxKeys: [8, 1000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { binds: 0, reads: 0, unbinds: 0, misses: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  function bucket(draft) {
    if (!draft.binding || typeof draft.binding !== 'object' || Array.isArray(draft.binding)) draft.binding = { chat: {}, char: {}, default: {}, seq: 0 };
    const b = draft.binding;
    SCOPES.forEach(function (s) { if (!b[s] || typeof b[s] !== 'object' || Array.isArray(b[s])) b[s] = {}; });
    if (typeof b.seq !== 'number') b.seq = 0;
    return b;
  }
  function table() {
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const b = (s.binding && typeof s.binding === 'object') ? s.binding : {};
    const out = {};
    SCOPES.forEach(function (sc) { out[sc] = (b[sc] && typeof b[sc] === 'object' && !Array.isArray(b[sc])) ? b[sc] : {}; });
    return out;
  }
  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; } }

  function bind(scope, key, value) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const sc = clean(scope, 12).toLowerCase();
    if (SCOPES.indexOf(sc) < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', known: SCOPES.slice() }; }
    const k = clean(key, 60);
    if (!k) { noteFault('missing-key'); return { ok: false, reason: 'missing-key' }; }
    if (value === undefined) return unbind(sc, k);                    // 边界 5
    const cur = table();
    const used = SCOPES.reduce(function (a, s) { return a + Object.keys(cur[s]).length; }, 0);
    const known = Object.prototype.hasOwnProperty.call(cur[sc], k);
    if (!known && used >= settings().maxKeys) { noteFault('too-long'); return { ok: false, reason: 'too-long', max: settings().maxKeys }; }
    let hit = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      b[sc][k] = clone(value);
      b.seq++;
      hit = true; return true;
    }, 'binding:bind') : null;
    if (!hit || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.binds++; stat.lastReason = 'bound';
    return { ok: true, scope: sc, key: k };
  }

  /** 按 聊天 > 角色 > 默认 取生效值（唯一取值口）。 */
  function read(key) {
    stat.reads++;
    const k = clean(key, 60);
    if (!k) { noteFault('missing-key'); return { ok: false, reason: 'missing-key' }; }
    const t = table();
    const order = settings().enabled ? ['chat', 'char', 'default'] : ['default'];   // 边界 1
    for (let i = 0; i < order.length; i++) {
      const sc = order[i];
      if (Object.prototype.hasOwnProperty.call(t[sc], k)) {
        return { ok: true, key: k, value: clone(t[sc][k]), from: sc };
      }
    }
    stat.misses++; stat.lastReason = 'not-found';
    return { ok: false, reason: 'not-found', key: k };
  }

  function unbind(scope, key) {
    const sc = clean(scope, 12).toLowerCase();
    if (SCOPES.indexOf(sc) < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', known: SCOPES.slice() }; }
    const k = clean(key, 60);
    if (!k) { noteFault('missing-key'); return { ok: false, reason: 'missing-key' }; }
    let found = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      if (!Object.prototype.hasOwnProperty.call(b[sc], k)) return false;
      delete b[sc][k]; found = true; return true;
    }, 'binding:unbind') : null;
    if (!found || !r || r.ok !== true) { noteFault('not-found'); return { ok: false, reason: 'not-found', scope: sc, key: k }; }
    stat.unbinds++; stat.lastReason = 'unbound';
    return { ok: true, scope: sc, key: k };
  }

  /** 只列某一层的键（面板用）。 */
  function list(scope) {
    const sc = clean(scope, 12).toLowerCase();
    if (SCOPES.indexOf(sc) < 0) { noteFault('bad-value'); return []; }
    const t = table();
    return Object.keys(t[sc]).sort().map(function (k) { return { scope: sc, key: k, value: clone(t[sc][k]) }; });
  }

  WA.binding = {
    SCOPES: SCOPES.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    bind: bind, read: read, unbind: unbind, list: list,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/binding.js', { kind: 'engine', ver: '2.130.0' });
})();
