/**
 * WorldAxis engines/preset-world.js (v2.129.0) — 静态设定缓存（缝 A7）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的全部世界状态都挂在 `chatMetadata`（`core/store.js` 的 `worldaxis_state_<chatId>`），
 *   这条设计有一个从未被说出口的前提：**没有聊天就没有世界**。用户在「先建世界、
 *   再挑一张卡开聊」这个流程里，面板是空的——世界书、人物、势力、局势全都要等第一楼
 *   推演跑完才第一次存在。而「开聊之前先把设定写下来」这件事，本仓零手段：
 *   `presetWorld` / `staticData` / `静态设定` 全仓零命中。
 *
 *   缝合来源：st-beat-tracker `docs/storybeat-engine.md` §4.3「静态数据库缓存」——
 *   `StaticDataManager` 用 localStorage 保存 `sbt-static-character-database`，
 *   原文口径：「**即使聊天未开始，也能预览与编辑世界设定**」；§7.1 又把它列为
 *   创世纪（Genesis）流程的**第一顺位数据来源**（静态缓存 → 内存中的 Chapter → 实时 AI 分析）。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `put` / `drop` —— 把设定条目写进**本模块自己的** localStorage 键（不在世界状态里）；
 *   ② `preview` —— 答「现在磁盘上有哪些设定」（**不需要聊天**，一次 `transact` 都不调）；
 *   ③ `seed` —— 把静态设定整理成创世纪阶段可直接取用的结构（**纯读**、不改任何东西）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `put` / `drop` 报 `disabled` 且不落盘、不计数。
 *   2 **只写自己的键，绝不写世界状态**：本模块一次都不调 `store.transact`。
 *      理由：「开聊前的草稿」与「世界状态」是两件事——前者属于用户，后者属于推演。
 *      把草稿混进世界状态，就会出现「用户只是写了个草稿，创世纪却当成既成事实」。
 *      这也让本模块**不需要** store 骨架键、不需要挤出站点。
 *   3 只读面（`preview` / `get` / `list` / `seed`）**不受总开关限制**——
 *      否则用户一关开关，「我写过的东西」就查不出来了（与 userlock 的 `unlock` 同理由：
 *      关掉开关不该让用户被自己的设置锁死）。
 *   4 `kind` 与 `id` 必填（`missing-key` / `no-id`）；同名同类为**覆盖**（幂等），不追加重复行。
 *   5 上限 `maxRows`：满了**如实拒收**（`rows-full`），**不静默挤出**——
 *      这是用户亲手写的设定，不是自动推演产物；静默丢弃用户手稿是本仓最贵的那类默认值。
 *      正因如此，本模块**没有** `WA.evict` 调用点，也不该在 `SITES` / `__BOUNDED_CAPS`
 *      里假装它是个环形容器（那正是 region.places 同型的「零调用站点」缺陷）。
 *   6 落盘走 `settingsBus.saveOrThrow`（本仓唯一写盘出口）——写失败如实报（`write-failed`），
 *      绝不把「没写进去」报成「已保存」。
 *   7 读失败与「没有值」分开：`read-failed` 与「空集」是两种结论，不合成一个。
 *   8 只登记不排序、不归并、不推断：本模块**不生成**姓名、年龄、数值、关系。
 *   9 不进注入面：静态设定不是「本轮该让模型看到的世界状态」——它的消费者是创世纪与面板，
 *      故本模块不产 `buildBlock`，也不在 `render/inject.js` 的 `SOURCES` 里占位。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_presetworld_settings_v1';
  // 数据键与设置键分开：设置是「怎么用」，数据是「用户写了什么」。
  //   混在一把键里会让「一次保存失败」同时毁掉设置与手稿（两件事，两个键）。
  const DATA_KEY = 'worldaxis_presetworld_data_v1';
  const DEF = { enabled: false, maxRows: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'presetWorld', bounds: { maxRows: [1, 64] } };
  const __DATA = { key: DATA_KEY, def: null, module: 'presetWorld', optional: true };
  const SCHEMA = 1;
  const KINDS = ['character', 'world', 'faction', 'place', 'rule'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG, __DATA]);

  const stat = { puts: 0, drops: 0, overrides: 0, seeds: 0, previews: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }

  /** 读盘：空集与读失败是两种结论（读失败把原因一并发出去，由调用方决定怎么讲）。 */
  function readData() {
    const empty = { version: SCHEMA, updatedAt: 0, rows: [] };
    if (!WA.settingsBus || typeof WA.settingsBus.read !== 'function') return { ok: false, reason: 'read-failed', data: empty };
    let raw = null;
    try { raw = WA.settingsBus.read(__DATA); }
    catch (e) { return { ok: false, reason: 'read-failed', data: empty }; }
    if (raw === null || raw === undefined) return { ok: true, data: empty };
    if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'bad-type', data: empty };
    const rows = Array.isArray(raw.rows) ? raw.rows.filter(function (r) { return r && typeof r === 'object'; }) : [];
    return { ok: true, data: { version: typeof raw.version === 'number' ? raw.version : SCHEMA,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0, rows: rows } };
  }
  function writeData(data) {
    if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') {
      noteFault('write-failed'); return { ok: false, reason: 'write-failed' };
    }
    const r = WA.settingsBus.saveOrThrow(__DATA, data);
    if (!r || r.ok !== true) { noteFault('write-failed'); return { ok: false, reason: 'write-failed' }; }
    return { ok: true };
  }
  function rowsOf() { const g = readData(); return g.ok ? g.data.rows : []; }

  function normKind(k) { return clean(k, 24).toLowerCase(); }
  function findRow(rows, kind, id) {
    for (let i = 0; i < rows.length; i++) if (rows[i] && rows[i].kind === kind && rows[i].id === id) return i;
    return -1;
  }

  /**
   * 登记一条静态设定。同名同类为覆盖（`existed:true`），不追加重复行。
   * @param {string} kind character|world|faction|place|rule
   * @param {string} id 条目标识（同类内唯一）
   * @param {string} text 设定正文
   * @param {object} [opts] { tags: string[], by: string }
   */
  function put(kind, id, text, opts) {
    const o = opts || {};
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = normKind(kind);
    if (!k) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: 'kind 必填' }; }
    if (KINDS.indexOf(k) < 0) { noteFault('bad-type'); return { ok: false, reason: 'bad-type', detail: 'kind 必须是 ' + KINDS.join('/') }; }
    const key = clean(id, 80);
    if (!key) { noteFault('no-id'); return { ok: false, reason: 'no-id', detail: 'id 必填' }; }
    const body = clean(text, 4000);
    if (!body) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', detail: '设定正文不得为空' }; }
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    const rows = g.data.rows.slice();
    const i = findRow(rows, k, key);
    const existed = i >= 0;
    if (!existed && rows.length >= settings().maxRows) {
      noteFault('rows-full');
      return { ok: false, reason: 'rows-full', kind: k, id: key, cap: settings().maxRows,
        detail: '静态设定条数已达上限，请先删掉不再需要的条目（本模块不替你挑哪条该丢）' };
    }
    const row = { kind: k, id: key, text: body,
      tags: Array.isArray(o.tags) ? o.tags.slice(0, 8).map(function (t) { return clean(t, 24); }).filter(Boolean) : [],
      by: clean(o.by, 60) || null, at: clockNow('presetWorld') };
    if (existed) { row.at = rows[i].at || row.at; rows[i] = row; stat.overrides++; }
    else rows.push(row);
    const w = writeData({ version: SCHEMA, updatedAt: clockNow('presetWorld'), rows: rows });
    if (!w.ok) return w;
    stat.puts++; stat.lastReason = existed ? 'overridden' : 'put';
    return { ok: true, kind: k, id: key, existed: existed, total: rows.length };
  }

  function drop(kind, id) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = normKind(kind), key = clean(id, 80);
    if (!k || !key) { noteFault('missing-key'); return { ok: false, reason: 'missing-key' }; }
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    const rows = g.data.rows.slice();
    const i = findRow(rows, k, key);
    if (i < 0) { noteFault('not-found'); return { ok: false, reason: 'not-found', kind: k, id: key }; }
    rows.splice(i, 1);
    const w = writeData({ version: SCHEMA, updatedAt: clockNow('presetWorld'), rows: rows });
    if (!w.ok) return w;
    stat.drops++;
    return { ok: true, kind: k, id: key, total: rows.length };
  }

  /** 纯只读：磁盘上有哪些设定。**不读开关**（边界 3）。 */
  function preview(kind) {
    const g = readData();
    const k = kind ? normKind(kind) : null;
    const all = g.ok ? g.data.rows : [];
    const use = k ? all.filter(function (r) { return r.kind === k; }) : all;
    const byKind = {};
    all.forEach(function (r) { byKind[r.kind] = (byKind[r.kind] || 0) + 1; });
    stat.previews++;
    return { ok: g.ok, reason: g.ok ? null : g.reason, total: all.length, shown: use.length, byKind: byKind,
      updatedAt: g.ok ? g.data.updatedAt : 0,
      rows: use.map(function (r) { return { kind: r.kind, id: r.id, text: String(r.text || '').slice(0, 120),
        chars: String(r.text || '').length, tags: (r.tags || []).slice(), at: r.at }; }) };
  }
  function get(kind, id) {
    const k = normKind(kind), key = clean(id, 80);
    if (!k || !key) return { ok: false, reason: 'missing-key' };
    const rows = rowsOf(), i = findRow(rows, k, key);
    if (i < 0) return { ok: false, reason: 'not-found', kind: k, id: key };
    const r = rows[i];
    return { ok: true, kind: r.kind, id: r.id, text: r.text, tags: (r.tags || []).slice(), by: r.by, at: r.at };
  }
  function list(kind) { return preview(kind).rows; }

  /**
   * 纯读：创世纪阶段的数据来源（三级降级的第一级）。
   * 按 kind 分桶：character / world / faction+place+rule（others）。
   * **不改任何东西**——不写 store、不写盘、不 bump 任何序号。
   */
  function seed() {
    const rows = rowsOf();
    const out = { characters: [], world: [], others: [] };
    rows.forEach(function (r) {
      if (r.kind === 'character') out.characters.push({ id: r.id, text: r.text, tags: (r.tags || []).slice() });
      else if (r.kind === 'world') out.world.push({ id: r.id, text: r.text, tags: (r.tags || []).slice() });
      else out.others.push({ kind: r.kind, id: r.id, text: r.text });
    });
    stat.seeds++;
    return { ok: true, total: rows.length, characters: out.characters, world: out.world, others: out.others,
      note: '静态设定是**开聊前的草稿**，不是世界状态。创世纪可据此起草，但写进世界状态的每一条都要单独落账。' };
  }

  function clear() {
    const g = readData();
    if (!g.ok) { noteFault(g.reason); return { ok: false, reason: g.reason }; }
    return writeData({ version: SCHEMA, updatedAt: clockNow('presetWorld'), rows: [] });
  }

  WA.presetWorld = {
    KINDS: KINDS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    put: put, drop: drop, preview: preview, get: get, list: list, seed: seed, clear: clear,
    round: function () { return rowsOf().length; },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/preset-world.js', { kind: 'engine', ver: '2.129.0' });
})();
