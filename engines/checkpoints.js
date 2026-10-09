/**
 * WorldAxis engines/checkpoints.js (v2.82.0) — 快照与分支（第十六面：存档 ≠ 保存过 = 分支）
 *
 * 为什么需要它（与既有四处的分工，先说清不重复）：
 *   · core/store.js createRecoveryPoint —— **恢复点**：升级/导入前留的无命名、环形 3 份保命档。
 *   · engines/tool-snapshot.js        —— **人工单文件导出/恢复**：面向归档与跨聊天移植。
 *   · engines/chatcache.js            —— **滚动备份**：自动 3 份 + chat_metadata 跨设备同步。
 *   · engines/parallel-world.js       —— **子树快照**：平行世界内部子树的环形快照（模块私用）。
 *   这四处都碰「存档」，但**没有一处回答「分支」两个字**：一个世界可以有**几个有名字的存档**、
 *   从某个存档**派生**出新世界、两个分支**差在哪**、回滚之后**还能不能接着往下走**、
 *   这些存档**存哪几档、满了丢谁**、以及**怎么带着版本号搬出去再搬回来**。
 *
 * 三态口径（本模块存在的全部意义）：
 *   ① **存档 ≠ 保存过 = 分支**。「我存过」与「我能回到那一版、并从那一版继续走」是两件事；
 *      前者只要一次写盘，后者要求：有名字、有父链、有容量策略、有版本迁移。
 *   ② **快照库不在世界状态里**。库落在**独立的 localStorage 键**（`worldaxis_ckpt_v1_<chatId>`），
 *      因此**恢复世界不会连带抹掉快照库**——把库塞进 state 的话，「恢复到旧版本」这一步
 *      会同时把「我有哪些存档」这张表也回退掉，用户会看到自己的存档凭空消失。这是承重设计。
 *   ③ **三种范围各自成词**。`global` / `module`（顶层键之一）/ `scene`（顶层键的集合）——
 *      范围不是「大小」而是**还原的原子单位**：全局是「换一个世界」，模块是「把这块退回去」，
 *      场景是「把这一场相关的那几块一起退回去」。非法范围当场拒收，不猜用户想存什么。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_PREFIX = 'worldaxis_ckpt_v1_';
  const LS_KEY = 'worldaxis_ckpt_settings_v1';
  const DEF = { enabled: false, maxSlots: 12, autoEvery: 0, autoSlots: 4 };
  const __REG = { key: LS_KEY, def: DEF, module: 'checkpoints',
    bounds: { maxSlots: [1, 24], autoEvery: [0, 100], autoSlots: [0, 12] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // 范围白名单：不是「大小」而是还原的原子单位。global 之外都必须给出顶层键。
  const SCOPES = ['global', 'module', 'scene'];
  const MAX_NAME = 40;
  const FORMAT = 1;
  // ── 危险键（**承重设计**）────────────────────────────────────────────────
  // `schemaVersion` 不在任何快照里，也永远不许被快照覆盖。为什么：把旧档还原之后
  //   state.schemaVersion 会退回旧值，下一次 store.load() 会据此**再跑一遍迁移链**
  //   ——分支被静默迁移；更糟的是若快照来自更新的 schema，还原后升版比较会认为
  //   「需要迁移」而把一份本来完好的世界改写。故：世界是哪一版由代码说了算，
  //   不由存档说了算。声明放最前面：resolveScope / capture / stripGuarded 都要用它，
  //   放在后面虽然运行时也对，但读代码的人会先读到使用者、后读到定义。
  const GUARDED = ['schemaVersion'];
  // 快照库的独立键：`worldaxis_ckpt_v1_<chatId>`。库**不在世界状态里**，故恢复世界
  //   不会连带抹掉「我有哪些存档」这张表（这是本模块的承重设计之一）。
  const stat = { saved: 0, restored: 0, rolledBack: 0, branched: 0, removed: 0, evicted: 0,
    exported: 0, imported: 0, autoSaved: 0, faults: {}, lastReason: '' };
  function noteFault(reason) {
    const tag = String(reason == null ? 'unknown' : reason);
    stat.faults[tag] = (stat.faults[tag] || 0) + 1;
    return tag;
  }
  /**
   * 读侧归因投递（本仓库 G16 纪律）：**结论**由 err 码挡住，**归因**另投 store 台账。
   *   只做前者的话，这次读失败不会出现在 store.readStat().bySource 里——运维面上它等于没发生。
   *   投递本身绝不允许反向影响主流程（投递失败也要让读失败如实返回）。
   */
  function noteReadFail(source, key, err) {
    try {
      if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail(source, key, err);
    } catch (e) { /* 归因投递失败不改变读的结论 */ }
  }
  /** 受控收窄：非字符串一律视为空（不做 String(...) 静默升格，v2.79.0 面 C 纪律）。 */
  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/\s+/g, ' ').trim().slice(0, max || 60);
  }
  function finite(v) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function chatId() {
    try { return (WA.store && WA.store.chatId) ? (WA.store.chatId() || 'unknown') : 'unknown'; }
    catch (e) { return 'unknown'; }
  }
  function libKey(cid) { return LS_PREFIX + (cid || chatId()); }
  function storage() {
    try { return (WA.mainWin || window).localStorage || null; } catch (e) { return null; }
  }
  function deep(v) { return JSON.parse(JSON.stringify(v)); }
  // ── 快照库（独立 localStorage 键，**不在世界状态里**）────────────────────
  // 读失败（字节损坏 / 读取被拒）时**绝不覆盖写入**，并如实归因——
  //   与 core/store.js 恢复点清单同款纪律：读不到就不写，否则一次读失败会把用户全部存档抹掉。
  function readLib(cid) {
    const ls = storage();
    if (!ls) return { list: [], err: 'no-storage' };
    const key = libKey(cid);
    let raw = null;
    try { raw = ls.getItem(key); }
    catch (e) { noteReadFail('checkpointsLib', key, e); return { list: [], err: 'read-threw' }; }
    if (raw === null || raw === undefined) return { list: [], err: null };
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.slots)) {
        return { list: [], err: 'shape-not-array' };
      }
      return { list: parsed.slots, err: null };
    } catch (e) { noteReadFail('checkpointsLib', key, e); return { list: [], err: 'parse-threw' }; }
  }
  function writeLib(list, cid) {
    const ls = storage();
    if (!ls) { noteFault('no-storage'); return { ok: false, reason: 'no-storage' }; }
    const payload = { format: FORMAT, chatId: cid || chatId(), updatedAt: clockNow('checkpoints.lib'), slots: list };
    try { ls.setItem(libKey(cid), JSON.stringify(payload)); }
    catch (e) { noteFault('write-failed'); return { ok: false, reason: 'write-failed' }; }
    return { ok: true, count: list.length };
  }
  // ── 顶层键名单一真源：骨架顶层键（**不硬编码**，否则骨架长大而快照面不知道）──
  function topKeys() {
    try {
      if (WA.store && typeof WA.store.defaultWorldState === 'function') {
        return Object.keys(WA.store.defaultWorldState()).sort();
      }
    } catch (e) { /* 落到下面的空表 */ }
    return [];
  }
  /**
   * 范围解析：把 (scope, keys) 收窄成**合法的顶层键名单**。
   *   拒收口径：范围不在白名单 / module|scene 未给键 / 给了骨架里没有的键 / 键去重后为空。
   *   为什么必须拒收而不是忽略未知键：忽略等于「用户以为存了三块，实际只存了两块」，静默半份。
   */
  function resolveScope(scope, keys) {
    const sc = str(scope, 16) || 'global';
    if (SCOPES.indexOf(sc) < 0) {
      return { ok: false, reason: 'bad-scope', scopes: SCOPES.slice() };
    }
    if (sc === 'global') return { ok: true, scope: sc, keys: [] };
    const raw = Array.isArray(keys) ? keys : [];
    const cleaned = [];
    raw.forEach(function (k) {
      const s = str(k, 40);
      if (s && cleaned.indexOf(s) < 0) cleaned.push(s);
    });
    if (!cleaned.length) return { ok: false, reason: 'missing-keys', scope: sc };
    // 守卫键不得被**显式点名**存进取范围的快照里。它其实无害（采集层会剥），
    //   但静默接受等于「用户以为存了 51 块、实际拿到 50 块」——半份比拒收更难查。
    const guarded = cleaned.filter(function (k) { return GUARDED.indexOf(k) >= 0; });
    if (guarded.length) return { ok: false, reason: 'guarded-key', keys: guarded, guarded: GUARDED.slice() };
    const known = topKeys();
    const unknown = cleaned.filter(function (k) { return known.indexOf(k) < 0; });
    if (unknown.length) {
      return { ok: false, reason: 'unknown-keys', scope: sc, unknown: unknown,
        known: known.slice(0, 8) };
    }
    return { ok: true, scope: sc, keys: cleaned.sort() };
  }
  /** 世界钟标签（快照显示用；纯读，不改 store） */
  function clockLabel(state) {
    const c = (state && state.clock) || {};
    const lab = str(c.label, 30);
    if (lab) return lab;
    const iso = str(c.iso, 30);
    if (iso) return iso;
    return (isFinite(c.dayIndex) && c.dayIndex) ? ('第 ' + c.dayIndex + ' 日') : '';
  }
  /**
   * 采集：按 (scope, keys) 从当前世界状态取一份**深拷贝**子树。
   *   纯读——不改动 store 的任何字段（自动快照每轮调用它，绝不允许有副作用）。
   */
  function capture(scope, keys) {
    const r = resolveScope(scope, keys);
    if (!r.ok) return r;
    const st = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    // **快照永远不含守卫键**：在采集这一层就剥掉，而不是等还原/导出时再剥。
    //   两层的区别是承重的：只在上层剥，`read().slot.state` 里仍然带着 schemaVersion，
    //   任何一条新写的写回路径（将来加的导入、同步、外部调用）都会把它带到世界里。
    //   不变量要么无条件成立，要么迟早有人绕过去；故这里剥在最早一环。
    if (r.scope === 'global') return { ok: true, scope: r.scope, keys: [], state: stripGuarded(st) };
    const sub = {};
    r.keys.forEach(function (k) {
      // 未定义的键**整个略去**（不写 null）：null 在还原时会变成一个"看起来有值"的类型错误，
      //   而略去只表示"这一块当时不在"，语义诚实且不引入删除语义。
      if (st[k] !== undefined) sub[k] = deep(st[k]);
    });
    // 块数要**如实**：`keys` 报的是实际采到的键，而不是调用方点名要的键。
    //   点名了 3 个键、其中 1 个此刻不在世界里，就该报 2 块——报 3 块等于
    //   「用户以为存了 3 块、实际拿到 2 块」，与本模块拒收 guarded-key 是同一条理由：
    //   半份比拒收更难查，读面不得吹报。
    return { ok: true, scope: r.scope, keys: Object.keys(sub).sort(), state: sub };
  }
  // ── 容量管理（**模块自管，不走 evict SITES**）──────────────────────────────
  // 为什么不用 WA.evict.array：core/evict.js 的 SITES 是**世界状态的路径表**
  //   （path 字段指向 store 内的容器，cap 由登记表给出）。快照库按口径②落在
  //   **世界状态之外的独立键**里，没有 store 路径可指，硬塞一个 SITES 条目等于
  //   让「容量登记表」自称管着一个它根本看不见的容器。故这里自管，但**同款纪律**：
  //   逐站点记账（stat.evicted / lastEvicted）＋把「丢了谁」回传给调用方（可见，不静默）。
  let __seq = 0;
  function nextId(now) {
    __seq++;
    return 'c' + now + '-' + __seq;
  }
  /** 手动档与自动档分开算容量：自动快照再勤也不该把用户手工存的档挤掉。 */
  function enforceCaps(list, cfg) {
    const out = { list: list.slice(), evicted: [] };
    // 自动档：只保留最近 autoSlots 个
    const autos = out.list.filter(function (s) { return s.auto === true; });
    const keepAuto = (cfg.autoSlots > 0) ? autos.slice(-cfg.autoSlots).map(function (s) { return s.id; }) : [];
    out.list.forEach(function (s) {
      if (s.auto === true && keepAuto.indexOf(s.id) < 0) out.evicted.push(s);
    });
    out.list = out.list.filter(function (s) { return out.evicted.indexOf(s) < 0; });
    // 手动档：满则丢最旧（列表尾部为最新，故最旧在头部）
    const manuals = out.list.filter(function (s) { return s.auto !== true; });
    if (manuals.length > cfg.maxSlots) {
      const dropped = manuals.slice(0, manuals.length - cfg.maxSlots);
      dropped.forEach(function (s) { out.evicted.push(s); });
      out.list = out.list.filter(function (s) { return out.evicted.indexOf(s) < 0; });
    }
    return out;
  }
  // ── 支链（父链与根）──────────────────────────────────────────────────────
  // 为什么父链要**存进槽位**而不是每次现算：现算只能沿库回溯，而库会挤出最旧的档——
  //   父档一旦被挤出，「我从哪来」这个事实就永久丢了。存进槽位后它可以独立复述。
  function lineage(parentId, list) {
    if (!parentId) return { parents: [], root: '' };
    const p = list.filter(function (s) { return s && s.id === parentId; })[0] || null;
    if (!p) return { parents: [{ id: parentId, name: '' }], root: '' };
    const up = Array.isArray(p.parents) ? p.parents.slice() : [];
    return { parents: [{ id: p.id, name: p.name }].concat(up), root: p.root || p.name };
  }
  /**
   * 存一个命名快照。
   *   拒收口径：关时 disabled / 名字非字符串或空白 missing-fields / 范围非法（三种）/ 库读不出 lib-unreadable。
   *   `auto:true` 走自动档（**绕过 enabled**——自动快照的开关是 autoEvery，不是总开关；
   *   若也要求 enabled，用户开了自动快照却忘了总开关就会静默不存），且**不消费 maxSlots 配额**。
   */
  function save(name, opts) {
    const o = opts || {};
    const cfg = settings();
    if (o.auto !== true && !cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const nm = str(name, MAX_NAME);
    if (!nm) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', need: 'name' }; }
    const cap = capture(o.scope, o.keys);
    if (!cap.ok) { noteFault(cap.reason); return cap; }
    const lib = readLib();
    if (lib.err) { noteFault('lib-unreadable'); return { ok: false, reason: 'lib-unreadable', err: lib.err }; }
    const now = clockNow('checkpoints.save');
    const par = str(o.parent, 40);
    const lin = lineage(par, lib.list);
    const live = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const slot = {
      id: nextId(now), name: nm, scope: cap.scope, keys: cap.keys, at: now,
      auto: o.auto === true, label: clockLabel(live),
      parent: par, parents: lin.parents, root: lin.parents.length ? lin.root : nm,
      note: str(o.note, 60), state: cap.state
    };
    const enf = enforceCaps(lib.list.concat([slot]), cfg);
    const w = writeLib(enf.list);
    if (!w.ok) return w;
    if (slot.auto) { stat.autoSaved++; stat.lastReason = 'auto-saved'; }
    else { stat.saved++; stat.lastReason = 'saved'; }
    if (enf.evicted.length) { stat.evicted += enf.evicted.length; stat.lastEvicted = enf.evicted.map(function (s) { return { id: s.id, name: s.name, auto: s.auto === true }; }); }
    return { ok: true, id: slot.id, name: nm, scope: cap.scope, keys: cap.keys,
      auto: slot.auto, parent: par, root: slot.root,
      evicted: enf.evicted.map(function (s) { return { id: s.id, name: s.name }; }), count: enf.list.length };
  }
  /** 列表（**最新在前**；不回传 state——列表是给人看的，别把整个世界拖进面板） */
  function list() {
    const lib = readLib();
    const rows = lib.list.slice().reverse().map(function (s) {
      return { id: s.id, name: s.name, scope: s.scope, keys: Array.isArray(s.keys) ? s.keys.slice() : [],
        at: s.at, auto: s.auto === true, label: s.label || '', parent: s.parent || '',
        root: s.root || '', parents: Array.isArray(s.parents) ? s.parents.slice() : [],
        note: s.note || '', bytes: 0 };
    });
    return { ok: lib.err === null, err: lib.err, count: rows.length, slots: rows };
  }
  /** 读一个槽位（含 state 深拷贝；读面不得回传库内活引用，v2.79.0 面 B 口径） */
  function read(id) {
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const lib = readLib();
    if (lib.err) { noteFault('lib-unreadable'); return { ok: false, reason: 'lib-unreadable', err: lib.err }; }
    const s = lib.list.filter(function (x) { return x && x.id === rid; })[0] || null;
    if (!s) { noteFault('missing'); return { ok: false, reason: 'missing', id: rid }; }
    return { ok: true, slot: { id: s.id, name: s.name, scope: s.scope,
      keys: Array.isArray(s.keys) ? s.keys.slice() : [], at: s.at, auto: s.auto === true,
      label: s.label || '', parent: s.parent || '', root: s.root || '',
      parents: Array.isArray(s.parents) ? s.parents.slice() : [],
      note: s.note || '', state: deep(s.state) } };
  }
  /** 删除一个槽位（唯一合法的「这个档我不要了」入口；库读不出时拒收，不覆盖写） */
  function remove(id) {
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const lib = readLib();
    if (lib.err) { noteFault('lib-unreadable'); return { ok: false, reason: 'lib-unreadable', err: lib.err }; }
    const hit = lib.list.filter(function (s) { return s && s.id === rid; })[0] || null;
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', id: rid }; }
    const next = lib.list.filter(function (s) { return !(s && s.id === rid); });
    const w = writeLib(next);
    if (!w.ok) return w;
    stat.removed++; stat.lastReason = 'removed';
    // 删掉一个档会让「以它为父」的后代变成悬空父链——如实报出，不静默修补（父链是事实）。
    const orphans = next.filter(function (s) {
      return s && s.parent === rid;
    }).map(function (s) { return { id: s.id, name: s.name }; });
    return { ok: true, id: rid, name: hit.name, remaining: next.length, orphans: orphans, root: hit.root };
  }
  // ── 还原（范围感知）────────────────────────────────────────────────────────
  // **危险键剥离（承重设计，实测过教训）**：`schemaVersion` 不在快照里，且任何范围都不得
  //   用快照里的值覆盖它。为什么：把旧档全局还原之后，state.schemaVersion 会退回到旧值，
  //   下一次 store.load() 会据此**再跑一遍迁移链**——分支会被静默迁移；更糟的是若快照来自
  //   更新的 schema，还原后升版比较会认为"需要迁移"而把一份本来完好的世界改写。
  //   故：schemaVersion 一律取当前值（"世界是哪一版"由代码说了算，不由存档说了算）。
  function stripGuarded(obj) {
    const o = deep(obj);
    GUARDED.forEach(function (k) { if (o && typeof o === 'object') delete o[k]; });
    return o;
  }
  /**
   * 把某个快照还原进当前世界。
   *   范围语义：global = 整份替换；module/scene = **只**合并快照涉及的顶层键（其余键一律不动）。
   *   拒收口径：库读不出 lib-unreadable / 槽位不存在 missing / store 不可用 store-unavailable。
   *   `stat.restored` 与 `stat.rolledBack` 分开记：前者是"用存档覆盖当前"，后者是"把自己退回到
   *   之前的自己"——同一个动作，但用户问的是两个不同的问题（"我回到哪了" vs "我退了多少"）。
   */
  function restore(id, opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const g = read(rid);
    if (!g.ok) return g;
    const slot = g.slot;
    if (!WA.store || typeof WA.store.transact !== 'function') {
      noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' };
    }
    const before = (WA.store.get ? deep(WA.store.get() || {}) : {});
    const incoming = stripGuarded(slot.state);
    const tx = WA.store.transact(function (draft) {
      if (slot.scope === 'global') {
        // 整份替换（含删除语义：快照里没有的顶层键不该留在世界里）
        for (const k of Object.keys(draft)) delete draft[k];
        Object.assign(draft, incoming);
      } else {
        // 模块/场景：只覆盖快照涉及的键，其余保持现状
        (slot.keys.length ? slot.keys : Object.keys(incoming)).forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(incoming, k)) draft[k] = deep(incoming[k]);
        });
      }
      // 世界是哪一版由代码说了算：任何范围都不得用快照覆盖 schemaVersion。
      //   取值来源是**当前世界的值**（store.get 而非 store.SCHEMA_VERSION）：更旧的
      //   世界该不该升级是 store.load() 的判断，不属于本模块——本模块只保证「归档
      //   不参与决定世界的版本」，不顺手替 store 做版本决策。
      draft.schemaVersion = (WA.store.get && WA.store.get() || {}).schemaVersion;
      if (!draft.meta || typeof draft.meta !== 'object') draft.meta = {};
      draft.meta.updatedAt = clockNow('checkpoints.restore');
    }, 'checkpoints:restore');
    if (!tx || tx.ok !== true) {
      noteFault('write-failed');
      return { ok: false, reason: 'write-failed',
        error: (tx && tx.error && tx.error.message) || (tx && tx.aborted ? 'aborted' : 'unknown') };
    }
    if (o.rolledBack === true) { stat.rolledBack++; stat.lastReason = 'rolled-back'; }
    else { stat.restored++; stat.lastReason = 'restored'; }
    return { ok: true, id: rid, name: slot.name, scope: slot.scope, keys: slot.keys,
      rolledBack: o.rolledBack === true, counts: {} , before: o.keepBefore === true ? before : undefined };
  }
  /**
   * 分支：从某快照派生出一个**新的子快照**（先还原，再以还原后的世界为内容存一个新档）。
   *   为什么"分支"必须落地成一次真实的 save 而不是只记一条父指针：分支的语义是
   *   "我从 A 这一版**另起一条**走下去"。若只还原不落档，那么用户接下来的改动会覆盖
   *   A 那份原始快照——那还是同一条线，不是分支。新档与父档**同时存在**才算分叉。
   */
  function branch(id, name, opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const rid = str(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const nm = str(name, MAX_NAME);
    if (!nm) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', need: 'name' }; }
    const r = restore(rid, { rolledBack: true });
    if (!r.ok) return r;
    // 分支档必须带父——否则"从哪分出来的"就没法复述；父档被挤出后仍能靠 parents/root 回答。
    const s = save(nm, { scope: o.scope !== undefined ? o.scope : r.scope,
      keys: o.keys !== undefined ? o.keys : r.keys, parent: rid, note: o.note });
    if (!s.ok) return s;
    stat.branched++; stat.lastReason = 'branched';
    return { ok: true, from: rid, fromName: r.name, id: s.id, name: nm,
      scope: s.scope, keys: s.keys, root: s.root, count: s.count };
  }
  /**
   * 比较两个快照：逐顶层键判等 + 逐键差异摘要（长度/条数/top 变化）。
   *   为什么按**顶层键粒度**比而不是整份 JSON diff：用户要回答的是"这两个分支差在哪"，
   *   答案的量级应该是"people / memory / evolution 这三块不同"，而不是几千行字节差。
   */
  function keySig(v) {
    if (Array.isArray(v)) return 'array:' + v.length;
    if (v && typeof v === 'object') return 'object:' + Object.keys(v).length;
    if (v === null) return 'null';
    return typeof v;
  }
  function compare(idA, idB) {
    const a = read(idA), b = read(idB);
    if (!a.ok) return a;
    if (!b.ok) return b;
    const A = a.slot, B = b.slot;
    const keys = Array.from(new Set(Object.keys(A.state || {}).concat(Object.keys(B.state || {})))).sort();
    const onlyA = [], onlyB = [], differing = [], same = [];
    keys.forEach(function (k) {
      const hasA = Object.prototype.hasOwnProperty.call(A.state || {}, k);
      const hasB = Object.prototype.hasOwnProperty.call(B.state || {}, k);
      if (hasA && !hasB) { onlyA.push(k); return; }
      if (!hasA && hasB) { onlyB.push(k); return; }
      const va = A.state[k], vb = B.state[k];
      const sa = JSON.stringify(va), sb = JSON.stringify(vb);
      if (sa === sb) { same.push(k); return; }
      differing.push({ key: k, a: keySig(va), b: keySig(vb),
        aLen: Array.isArray(va) ? va.length : (va && typeof va === 'object' ? Object.keys(va).length : 0),
        bLen: Array.isArray(vb) ? vb.length : (vb && typeof vb === 'object' ? Object.keys(vb).length : 0) });
    });
    return { ok: true, a: { id: A.id, name: A.name, at: A.at, scope: A.scope, root: A.root },
      b: { id: B.id, name: B.name, at: B.at, scope: B.scope, root: B.root },
      sameRoot: !!(A.root && A.root === B.root),
      onlyA: onlyA, onlyB: onlyB, differing: differing, sameCount: same.length,
      identical: differing.length === 0 && onlyA.length === 0 && onlyB.length === 0 };
  }
  /**
   * 自动快照（**纯读＋一次写库**，绝不改世界状态；调用方每轮调一次）。
   *   节奏：`autoEvery` 轮一次（0 = 关）。**"关"与"没到点"必须各自成词**——
   *   返回 reason:'disabled' / 'not-due' 而不是同一个空对象，否则诊断面分不出
   *   "用户没开自动快照" 与 "开了但这一轮还没轮到"。
   */
  let __ticks = 0;
  function tick(opts) {
    const cfg = settings();
    if (!(cfg.autoEvery > 0)) return { ok: false, reason: 'disabled' };
    __ticks++;
    if ((__ticks % cfg.autoEvery) !== 0) return { ok: false, reason: 'not-due', tick: __ticks, every: cfg.autoEvery };
    const nm = str((opts && opts.name), MAX_NAME) || ('自动 · 第 ' + __ticks + ' 轮');
    const r = save(nm, { auto: true, scope: (opts && opts.scope) || 'global', note: '自动快照' });
    return Object.assign({}, r, { tick: __ticks, every: cfg.autoEvery });
  }
  // ── 导入导出与版本迁移 ─────────────────────────────────────────────────────
  /** 廉价完整性校验（不引入依赖，只为抓"搬运途中被改写"这一件事） */
  function checksum(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return 'k' + h.toString(16);
  }
  const MIGRATIONS = {};
  /** 版本链步进迁移（与 core/store.js registerMigration 同款口径：from → from+1 一步） */
  function registerMigration(from, fn) {
    const f = finite(from);
    if (!isFinite(f) || f < 1 || typeof fn !== 'function') {
      noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' };
    }
    MIGRATIONS[f] = fn;
    return { ok: true, from: f };
  }
  function migrations() { return Object.keys(MIGRATIONS).map(Number).sort(function (a, b) { return a - b; }); }
  /**
   * 信封的格式版本**只有一个来源**：`worldaxisCheckpoint` 的值。
   *   为什么不做「`format` 与 `worldaxisCheckpoint` 两个字段、随便读哪个」：两个名字
   *   指同一件事，迟早一处改了一处没改，而版本号读错的表现是「静默按错的链迁移」——
   *   最不该有别名的一个字段就是它。（首版实测就栽在这里：导出只写了标记、迁移只读了
   *   `format`，于是「自己导出的自己导不回来」。）
   */
  function fmtOf(o) { return finite(o && o.worldaxisCheckpoint); }
  function migrate(env) {
    let cur = deep(env);
    let f = fmtOf(cur);
    if (!isFinite(f)) { return { ok: false, reason: 'bad-format' }; }
    let guard = 0;
    while (f < FORMAT) {
      const step = MIGRATIONS[f];
      if (typeof step !== 'function') return { ok: false, reason: 'no-migration', from: f, to: FORMAT };
      cur = step(cur) || cur;
      f = fmtOf(cur);
      if (!isFinite(f) || f <= 0) return { ok: false, reason: 'bad-format' };
      if (++guard > 64) return { ok: false, reason: 'migration-loop' };
    }
    if (f > FORMAT) return { ok: false, reason: 'too-new', format: f, supported: FORMAT };
    return { ok: true, env: cur };
  }
  /** 导出单个快照为**带版本号**的搬迁信封（不含运行期脏字段） */
  function exportOne(id) {
    const g = read(id);
    if (!g.ok) return g;
    const slot = g.slot;
    // 正文里也留一份格式号，但它**不参与迁移判定**（判定只认 worldaxisCheckpoint）：
    //   正文是给人看与给校验和用的，格式号是给机器用的，两件事不共用同一个字段。
    const body = { format: FORMAT, name: slot.name, scope: slot.scope, keys: slot.keys,
      at: slot.at, label: slot.label, note: slot.note, root: slot.root,
      parents: slot.parents, state: stripGuarded(slot.state) };
    const text = JSON.stringify(body);
    const env = { worldaxisCheckpoint: FORMAT, exportedAt: new Date().toISOString(),
      engineVersion: WA.version || '?', sourceChat: chatId(), slot: body, checksum: checksum(text) };
    stat.exported++; stat.lastReason = 'exported';
    return { ok: true, env: env, text: JSON.stringify(env, null, 2) };
  }
  /**
   * 导入搬迁信封：先迁移到当前格式 → 校验 → 存为一个**新槽位**（默认不覆盖同名）。
   *   拒收口径：bad-format / too-new / no-migration / checksum-mismatch / missing-fields /
   *             lib-unreadable / write-failed。
   *   为什么默认不覆盖：导入常常是"把别的聊天里那一版拿过来看看"，覆盖同名槽位等于
   *   用一次试探性操作毁掉本地那份存档。要覆盖请显式给 `mode:'replace'`。
   */
  function importOne(raw, opts) {
    const o = opts || {};
    const cfg = settings();
    // 顺序是判据的一部分：**先判信封、后判开关**。反过来的话「关着的时候丢进来一坨垃圾」
    //   报的是 disabled，用户会以为「打开了就能导入」——实际它根本不是本模块的信封。
    //   拒收码要答的是「这份东西坏在哪」，而不是「此刻能不能动」。
    let env = raw;
    if (typeof raw === 'string') {
      try { env = JSON.parse(raw); }
      catch (e) { noteFault('bad-format'); return { ok: false, reason: 'bad-format', detail: 'not-json' }; }
    }
    if (!env || typeof env !== 'object') { noteFault('bad-format'); return { ok: false, reason: 'bad-format' }; }
    if (env.worldaxisCheckpoint === undefined) { noteFault('bad-format'); return { ok: false, reason: 'bad-format', detail: 'no-envelope' }; }
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const mg = migrate(env);
    if (!mg.ok) { noteFault(mg.reason); return mg; }
    const e2 = mg.env;
    const body = e2.slot;
    if (!body || typeof body !== 'object' || !body.state || typeof body.state !== 'object') {
      noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', need: 'slot.state' };
    }
    if (typeof e2.checksum === 'string') {
      const want = checksum(JSON.stringify(body));
      if (want !== e2.checksum) { noteFault('checksum-mismatch'); return { ok: false, reason: 'checksum-mismatch', want: want, got: e2.checksum }; }
    }
    const nmBase = str(body.name, MAX_NAME) || str(o.name, MAX_NAME);
    if (!nmBase) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', need: 'name' }; }
    const lib = readLib();
    if (lib.err) { noteFault('lib-unreadable'); return { ok: false, reason: 'lib-unreadable', err: lib.err }; }
    const cidOld = str(e2.sourceChat, 40);
    const cidHere = chatId();
    const nm = (o.keepName === true) ? nmBase
      : (nmBase + ((cidOld && cidOld !== cidHere) ? '（来自 ' + str(cidOld, 24) + '）' : ''));
    const now = clockNow('checkpoints.import');
    const slot = { id: nextId(now), name: nm, scope: SCOPES.indexOf(str(body.scope, 16)) >= 0 ? str(body.scope, 16) : 'global',
      keys: Array.isArray(body.keys) ? body.keys.slice() : [], at: now, auto: false,
      label: str(body.label, 30), parent: '', parents: [], root: str(body.root, MAX_NAME) || nm,
      note: str(o.note, 60) || str(body.note, 60) || '导入', state: stripGuarded(body.state) };
    let nextList = lib.list.concat([slot]);
    if (o.mode === 'replace') {
      const target = str(o.target, 40);
      nextList = nextList.filter(function (s) { return !(s && (s.id === target || (o.byName === true && s.name === nmBase))); });
    }
    const enf = enforceCaps(nextList, cfg);
    const w = writeLib(enf.list);
    if (!w.ok) return w;
    stat.imported++; stat.lastReason = 'imported';
    return { ok: true, id: slot.id, name: nm, scope: slot.scope, keys: slot.keys,
      migrated: (fmtOf(env) !== FORMAT), fromChat: cidOld || '', replaced: o.mode === 'replace',
      evicted: enf.evicted.map(function (s) { return { id: s.id, name: s.name }; }), count: enf.list.length };
  }
  // ── 注入块与诊断面 ─────────────────────────────────────────────────────────
  /**
   * 注入块：只报**存在哪些存档**，并明标「存档存在 ≠ 当前进度已保存」。
   *   为什么这句必须写进注入面：只要它不写，模型就会把「列表非空」读成「随时能回来」，
   *   于是放心地大改世界——而当前世界若与每一份档都不同，它就还没有对应的档。
   *   这是本模块的第十六面在**读面**上的落点，不只是文档里的一句话。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const g = list();
    if (!g.ok || !g.count) return '';
    const head = '· 存档 ' + g.count + ' 份（手动 ≤ ' + cfg.maxSlots + '，自动 ≤ ' + cfg.autoSlots + '）'
      + (cfg.autoEvery > 0 ? ('；自动每 ' + cfg.autoEvery + ' 轮一份') : '；自动快照关闭');
    const lines = g.slots.slice(0, 6).map(function (s) {
      const sc = s.scope === 'global' ? '全局'
        : (s.scope === 'module' ? ('模块 ' + s.keys.join('/')) : ('场景 ' + s.keys.join('/')));
      const from = s.parent ? ('；自「' + ((s.parents[0] && s.parents[0].name) || s.parent) + '」分出') : '';
      return '  · ' + s.name + '（' + sc + (s.auto ? '；自动' : '') + (s.label ? '；' + s.label : '') + from + '）';
    });
    return '[快照与分支]\n' + head + '\n' + lines.join('\n')
      + (g.count > 6 ? ('\n  · …另有 ' + (g.count - 6) + ' 份') : '')
      + '\n以上只是**被记下来过的时点**，不等于当前进度已经保存：当前世界若与每一份都不同，'
      + '它就还没有对应的档。要另起一条线必须显式 branch()（它才落新档），仅 restore() 不算分支。';
  }
  /**
   * 诊断读数。「库里现在有多少」与「最近丢了谁」分开报——前者是现状、后者是过程后果；
   *   `libErr` 单列，因为库读不出时上面所有计数都只是 0，不报出来就会被读成「本来就没有存档」。
   */
  function statView() {
    const lib = readLib();
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      lastEvicted: (stat.lastEvicted || []).map(function (s) { return { id: s.id, name: s.name, auto: s.auto === true }; }),
      slots: lib.list.length,
      manual: lib.list.filter(function (s) { return s.auto !== true; }).length,
      autoSlotsUsed: lib.list.filter(function (s) { return s.auto === true; }).length,
      libErr: lib.err, key: libKey(), format: FORMAT, scopes: SCOPES.slice()
    });
  }
  WA.checkpoints = {
    SCOPES: SCOPES, FORMAT: FORMAT, GUARDED: GUARDED,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    topKeys: topKeys, resolveScope: resolveScope, lineage: lineage,
    save: save, list: list, read: read, remove: remove,
    restore: restore, branch: branch, compare: compare, tick: tick, buildBlock: buildBlock,
    exportOne: exportOne, importOne: importOne, checksum: checksum,
    migrations: migrations, registerMigration: registerMigration, migrate: migrate,
    stat: statView
  };
})();