/**
 * WorldAxis engines/chrono.js (v2.112.0) — 因果链追踪（计划二 #31 + #32 + #33）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────
 *   本仓有 `causal`（**推演**因果：预测动作的后果）、`timeline`（**历史行**的并集与
 *   摘要指纹）、`threads`（线索），但三者都不回答同一个问题：
 *   **「现在这个状态，是从哪一步来的；若撤回那一步，还有哪些条目是踩在它上面的」**。
 *   实测现场就是：改回一处设定之后，几轮之后别的设定开始互相矛盾，而没人能说出
 *   是哪一步改回把哪些下游条目变成了悬空的。
 *   本模块因此只做一件事：给每一次锚点变更留一条**带反向引用的事实**，
 *   由此派生「层次 / 依赖 / 撤销影响 / 分叉试演」四个只读读数。
 *
 * ── 与既有模块的分工（不许重叠）────────────────────────────────
 *   · `auditLog` 回答「发生了什么」（**事实环**，无结构）；本模块回答「它挂在谁身上」
 *     （**有结构的事实**：每条带 `base` 反向引用）。两者都只增不减。
 *   · `causal` 是**未来**推演；本模块是**过去**的依赖图。方向相反，不合流。
 *   · `registry.traceOf` 追的是**改名链**（人名的别名）；本模块追的是**变更链**。
 *
 * ── 六条设计边界（全是否定式）──────────────────────────────────
 *   ① **不删事实**：模块不提供 remove / clear / splice / purge —— 不是「少用」而是
 *      「函数不存在」。撤销不抹除历史，只追加一条 `kind:'revert'` 的反向引用，
 *      并把「因此可能失准的下游」列出来（`stale()`），**不静默标记、不悄悄修**。
 *   ② **读面不改世界**：`layer / derives / undo / diff / simBranch / stale` 六个读数
 *      **一个字节都不写存档**（`undo` 是**试算**，只回答「会让你看到什么」）。
 *      写入口只有一个：`record`（登记一次变更）与 `applyUndo`（追加一条 revert）。
 *   ③ **不猜依赖**：依赖只来自**显式反向引用**（`base`）。没有引用就是**根**，
 *      不按「时间接近」「名字相似」推断关系 —— 猜出来的因果图比没有更坏。
 *   ④ **深度如实报**：超过 `maxDepth` 的链在登记侧当场拒收（`too-deep`），
 *      不是截断后假装完整；`layer` 对不存在的 id 返回 `null`，不返回 0。
 *   ⑤ **总开关默认关闭**：关闭时 `record` 返回 `disabled`，不落盘、不计数。
 *   ⑥ **试演不改真身**：`simBranch` 只在**内存里的副本**上推进，返回 `dryRun:true`；
 *      它读存档只为取当前锚点值，不调用 `store.transact`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_chrono_settings_v1';
  const DEF = { enabled: false, maxLayers: 64, maxDepth: 8, maxText: 200, maxDiff: 64 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'chrono',
    bounds: { maxLayers: [8, 512], maxDepth: [1, 32], maxText: [16, 2000], maxDiff: [1, 256] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 拒收原因（封闭集合；新增码必须同步登记 tests/reject-code-ledger.json）。 */
  const REASONS = ['disabled', 'bad-anchor', 'bad-base', 'no-base', 'no-entry',
    'too-deep', 'capacity', 'too-long', 'need-confirm', 'store-unavailable', 'bad-id'];

  const stat = { records: 0, reverts: 0, checked: 0, blocked: 0, sims: 0, diffs: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  /** 文本归一（与仓库其余模块同形：先问 input-guard，取不到用本地兜底）。 */
  function txt(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max) : String(v == null ? '' : v).slice(0, max || 0); }
    catch (e) { return ''; }
  }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }

  /** 变更日志（只增不减的数组；`chrono` 子树是新骨架，须是对象容器）。 */
  function entries() {
    const c = state().chrono;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return [];
    return Array.isArray(c.entries) ? c.entries : [];
  }
  function seqOf() {
    const c = state().chrono;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return 0;
    return typeof c.seq === 'number' && isFinite(c.seq) ? Math.floor(c.seq) : 0;
  }

  /* ── 只读派生：拓扑层次（最长反向引用链）────────────────────── */

  /**
   * 生成 id → 记录 的索引（**只读**）。非法行（缺 id / 非对象 / id 重复）一律跳过并计数，
   * 不抛 —— 坏行不该让整张图读不出来。
   */
  function index() {
    const list = entries(), byId = {}; let bad = 0;
    list.forEach(function (e) {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id) { bad++; return; }
      if (byId[e.id]) { bad++; return; }
      byId[e.id] = e;
    });
    return { byId: byId, order: Object.keys(byId), bad: bad };
  }

  /** 层次（拓扑深度）：无 `base` 的为 0 层；`base` 指向不存在的记录**也**算根。 */
  function layersOf(idx) {
    const memo = {}, depth = {};
    function walk(id) {
      if (typeof depth[id] === 'number') return depth[id];
      if (memo[id]) return -1;                       // 环：如实报 -1（不是 0、不是抛）
      memo[id] = true;
      const e = idx.byId[id];
      if (!e) { delete memo[id]; depth[id] = -1; return -1; }
      let d = 0;
      if (typeof e.base === 'string' && e.base && idx.byId[e.base]) {
        const p = walk(e.base);
        d = p < 0 ? -1 : p + 1;
      }
      delete memo[id];
      depth[id] = d;
      return d;
    }
    idx.order.forEach(function (id) { walk(id); });
    return depth;
  }

  /** 反向引用闭包（谁踩在 id 上，含间接；**不含自身**）。 */
  function derivesOf(idx, id) {
    const seen = {}, out = [];
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift();
      idx.order.forEach(function (k) {
        const e = idx.byId[k];
        if (!e || e.base !== cur || seen[k] || k === id) return;
        seen[k] = true; out.push(k); queue.push(k);
      });
    }
    return out;
  }

  /* ── 写入口（唯一）：登记一次锚点变更 ───────────────────────── */

  /**
   * 登记一次变更。
   * @param {string} anchor 锚点名（如 `'world.time'` / `'actor:lin'`）
   * @param {string|null} base 被改动的上一条记录 id（`null` = 这是根）
   * @param {object} [opts] `{ kind, note, snapshot }`
   * @returns {{ok:boolean, id?:string, layer?:number, reason?:string}}
   */
  function record(anchor, base, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const a = txt(anchor, 80);
    if (!a) { noteFault('bad-anchor'); return { ok: false, reason: 'bad-anchor' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const hasBase = !(base === null || base === undefined || base === '');
    const b = hasBase ? txt(base, 80) : null;
    if (hasBase && !b) { noteFault('bad-base'); return { ok: false, reason: 'bad-base' }; }
    const idx = index();
    if (hasBase && !idx.byId[b]) { noteFault('no-base'); return { ok: false, reason: 'no-base' }; }
    if (idx.order.length >= cfg.maxLayers) { noteFault('capacity'); return { ok: false, reason: 'capacity' }; }
    // 深度闸：新条目的层次 = base 层次 + 1；超上限当场拒收（不截断后假装完整）。
    if (hasBase) {
      const dep = layersOf(idx)[b];
      if (!(dep >= 0) || dep + 1 > cfg.maxDepth) { noteFault('too-deep'); return { ok: false, reason: 'too-deep' }; }
    }
    let snap = null;
    if (o.snapshot !== undefined && o.snapshot !== null && o.snapshot !== '') {
      const raw = typeof o.snapshot === 'string'
        ? o.snapshot
        : (WA.sanitize && typeof WA.sanitize.text === 'function' ? WA.sanitize.text(o.snapshot, cfg.maxText) : String(o.snapshot));
      if (raw.length > cfg.maxText) { noteFault('too-long'); return { ok: false, reason: 'too-long' }; }
      snap = raw === '' ? null : raw;
    }
    const id = a + '#' + String(seqOf() + 1);
    const row = {
      id: id, at: clockWall(), anchor: a, base: b,
      kind: txt(o.kind, 24) || 'change',
      note: txt(o.note, 120) || null,
      snapshot: snap
    };
    const out = WA.store.transact(function (draft) {
      const c = draft.chrono && typeof draft.chrono === 'object' && !Array.isArray(draft.chrono) ? draft.chrono : {};
      if (!Array.isArray(c.entries)) c.entries = [];
      c.seq = (typeof c.seq === 'number' && isFinite(c.seq) ? Math.floor(c.seq) : 0) + 1;
      c.entries.push(row);
      // v2.114.0：maxLayers 是**准入闸**（满员拒收），不是历史上限——
      //   entries 只能环形挤出（撤销靠追加 revert 行，不得原地删事实）。
      if (WA.evict) WA.evict.array(c.entries, 'chrono.entries');
      else if (c.entries.length > 128) c.entries = c.entries.slice(-128);
      draft.chrono = c;
      return true;
    });
    if (out && out.ok === false) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.records++; stat.lastReason = 'recorded';
    return { ok: true, id: id, anchor: a, base: b, layer: b === null ? 0 : layersOf(index())[id] };
  }

  /* ── 只读读数 ───────────────────────────────────────────────── */

  /** 单条记录的因果位置（层次 + 直接上/下游）。不存在 ⇒ `null`（不是 0）。 */
  function layer(id) {
    stat.checked++;
    const key = txt(id, 80);
    if (!key) { noteFault('bad-id'); return null; }
    const idx = index();
    const e = idx.byId[key];
    if (!e) { noteFault('no-entry'); return null; }
    const dep = layersOf(idx);
    const up = [];
    if (typeof e.base === 'string' && e.base && idx.byId[e.base]) up.push(e.base);
    return {
      id: key, anchor: e.anchor, base: e.base || null, kind: e.kind || 'change',
      depth: dep[key], up: up, down: derivesOf(idx, key),
      at: e.at, note: e.note || null
    };
  }

  /** 依赖闭包（谁踩在 id 上，含间接）。 */
  function derives(id) {
    stat.checked++;
    const key = txt(id, 80);
    if (!key) { noteFault('bad-id'); return null; }
    const idx = index();
    if (!idx.byId[key]) { noteFault('no-entry'); return null; }
    const dep = layersOf(idx);
    return derivesOf(idx, key).map(function (k) { return { id: k, anchor: idx.byId[k].anchor, depth: dep[k] }; });
  }

  /**
   * **试算**：撤回这条记录会让你看到什么。**不写存档**。
   *   返回三类，语义不同不合流：
   *   · `willOverwrite` 同锚点、踩在它上面的记录（撤回后它们读的是旧状态）
   *   · `affected`      其它锚点、经过反向引用踩在它上面的记录
   *   · `crossLayer`    受影响记录里层次与目标不同的（真正的跨层传播）
   */
  function undo(id) {
    stat.checked++;
    const key = txt(id, 80);
    if (!key) { noteFault('bad-id'); return { ok: false, reason: 'bad-id' }; }
    const idx = index();
    const e = idx.byId[key];
    if (!e) { noteFault('no-entry'); return { ok: false, reason: 'no-entry' }; }
    const dep = layersOf(idx);
    const all = derivesOf(idx, key);
    const willOverwrite = [], affected = [], crossLayer = [];
    all.forEach(function (k) {
      const r = idx.byId[k];
      if (r.anchor === e.anchor) willOverwrite.push(k);
      else {
        affected.push(k);
        if (dep[k] !== dep[key]) crossLayer.push(k);
      }
    });
    return {
      ok: true, target: key, anchor: e.anchor, depth: dep[key],
      willOverwrite: willOverwrite, affected: affected, crossLayer: crossLayer,
      total: all.length, dryRun: true
    };
  }

  /**
   * 追加一条 `revert`（**不抹除任何事实**）。
   *   缺 `{confirm:true}` 一律拒收（`need-confirm`）——「试算」与「真做」必须分开说。
   */
  function applyUndo(id, opts) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (o.confirm !== true) { noteFault('need-confirm'); return { ok: false, reason: 'need-confirm' }; }
    const plan = undo(id);
    if (!plan.ok) return plan;
    const r = record(plan.anchor, plan.target, { kind: 'revert', note: o.note || ('revert ' + plan.target) });
    if (!r.ok) return r;
    stat.reverts++;
    return { ok: true, revert: r.id, target: plan.target, stale: plan.willOverwrite.concat(plan.affected) };
  }

  /** 因存在 revert 而**可能失准**的下游（只报，不修）。 */
  function stale() {
    stat.checked++;
    const idx = index();
    const targets = idx.order.filter(function (k) { return idx.byId[k].kind === 'revert' && idx.byId[k].base; });
    const out = [];
    targets.forEach(function (k) {
      derivesOf(idx, idx.byId[k].base).forEach(function (d) {
        if (d === k) return;                       // revert 自身不算「被自己搞失准」
        if (out.indexOf(d) < 0) out.push(d);
      });
    });
    return { reverts: targets.length, stale: out };
  }

  /**
   * 两条记录的**分叉比较**（只读）。
   *   `split` 非空 ⇒ 两者的层次不同（跨层分叉）；相同层次 ⇒ 同层分叉，如实给 ''。
   */
  function diff(aId, bId) {
    stat.diffs++;
    const a = txt(aId, 80), b = txt(bId, 80);
    if (!a || !b) { noteFault('bad-id'); return { ok: false, reason: 'bad-id' }; }
    const idx = index();
    const ea = idx.byId[a], eb = idx.byId[b];
    if (!ea || !eb) { noteFault('no-entry'); return { ok: false, reason: 'no-entry' }; }
    const dep = layersOf(idx);
    const cfg = settings();
    const ka = ea.snapshot ? String(ea.snapshot).split('\n') : [];
    const kb = eb.snapshot ? String(eb.snapshot).split('\n') : [];
    const onlyA = ka.filter(function (x) { return kb.indexOf(x) < 0; }).slice(0, cfg.maxDiff);
    const onlyB = kb.filter(function (x) { return ka.indexOf(x) < 0; }).slice(0, cfg.maxDiff);
    const common = ka.filter(function (x) { return kb.indexOf(x) >= 0; }).slice(0, cfg.maxDiff);
    return {
      ok: true, a: a, b: b,
      anchorA: ea.anchor, anchorB: eb.anchor,
      depthA: dep[a], depthB: dep[b],
      split: dep[a] === dep[b] ? '' : 'cross-layer',
      onlyA: onlyA, onlyB: onlyB, common: common,
      capped: (ka.length > cfg.maxDiff || kb.length > cfg.maxDiff) ? true : false,
      dryRun: true
    };
  }

  /**
   * 分叉试演：从某条记录出发，在**内存副本**上推进若干步，返回将会出现的层次与锚点，
   *   **不写存档、不调用 store.transact**（`dryRun:true` 是承诺，不是装饰）。
   */
  function simBranch(fromId, steps) {
    stat.sims++;
    const key = txt(fromId, 80);
    if (!key) { noteFault('bad-id'); return { ok: false, reason: 'bad-id' }; }
    const idx = index();
    if (!idx.byId[key]) { noteFault('no-entry'); return { ok: false, reason: 'no-entry' }; }
    const cfg = settings();
    const n = (typeof steps === 'number' && isFinite(steps)) ? Math.max(1, Math.min(cfg.maxDepth, Math.floor(steps))) : 1;
    const dep = layersOf(idx);
    const chain = [key];
    let cur = key;
    const sim = [];
    for (let i = 0; i < n; i++) {
      const layerN = (dep[cur] >= 0 ? dep[cur] + 1 : 0);
      if (layerN > cfg.maxDepth) break;             // 超上限：如实停下，不假装演到底
      const sid = key + '~sim' + String(i + 1);
      sim.push({ id: sid, anchor: idx.byId[key].anchor, base: cur, layer: layerN });
      chain.push(sid); cur = sid;
    }
    return { ok: true, from: key, steps: n, chain: chain, planned: sim,
      reached: sim.length, capped: sim.length < n ? true : false, dryRun: true };
  }

  /* ── X2（v2.127.0）世界编年史：把 L3 沉淀与已结算事实压成一层可注入的叙事 ── */
  /**
   * ── 它治什么（缺口）────────────────────────────────────────────
   *   本仓的记忆已有 L0–L3 分层（`memory.l3` 记「长线主题 / 世界变迁」）、也有归档历史
   *   （`store.chronicle`），但**两者从未合成一句「这个世界发生过什么大事」**：
   *   L3 给的是主题词，chronicle 给的是逐条流水，而注入面只看后者里最近那几条。
   *   现场结果：三章之后模型读到的是「一堆事件行」，答不出「这个世界的走向」——
   *   于是它每轮重新推断一次基调，长局里基调随最新一条事件漂。
   *
   * ── 本函数只做四件事 ────────────────────────────────────────────
   *   ① `rows`    **已结算事实**（`store.chronicle`：backstage 的结算段 + horizon/regional 两处
   *      第二写入方）按 `at` 升序排成一条表
   *   ② `themes`  `memory.l3` 的长线沉淀（**切片保留原顺序**，不重排、不合并同义词）
   *   ③ `hidden`  **被挡下的条数**（不是被删掉——只是不进这张表），逐条带因
   *   ④ `buildBlock()` 把 `rows` 出成注入块（消费者是 `render/inject.js` 的新源 `chrono`）
   *
   * ── v2.127.0 收口：两张表**没有**合成一张 ────────────────────────
   *   首版头注释写的是「合成一条按时间升序的表」，而实现里 `rows` 只收 chronicle、`themes`
   *   单列 —— 口径与实现不一致是这一类模块最坏的形态（读注释的人会以为 L3 已进表）。
   *   现在按**读者**分开，不再假装合成：`rows` 给正文模型（发生过什么），`themes` 给诊断
   *   与面板（这世界的基调），两边的排序单位不同（`at` vs `t`），合起来排没有意义。
   *
   * ── 五条边界（全是否定式）──────────────────────────────────────
   *   ① **不剧透 hidden 级**：显式标了 `visibility:'hidden'` 的历史行一律**不进**这张表
   *      （如实记进 `hidden`）。未结算暗流**整类不收** —— 非 hidden 的那部分已由既有的
   *      `currents` 源逐轮进正文，两张表分工按时间轴分（此处只答「此前发生过什么」）。
   *   ② **不改写、只切分**（沿用 canon 的取舍）：本函数只读，一个字都不写存档。
   *   ③ **不替世界书写设定**：`themes` 只出 L3 里**已有的**主题词，不生成新主题。
   *   ④ **不做摘要**：`rows` 保留原题名与摘要切片，不把多条压成一句「世界震荡」——
   *      压出来的那句话没有来源，正是本模块要防的形态。
   *   ⑤ **容量如实**：超过 `maxRows` 只保留**最近**的若干行并如实报 `capped`，
   *      不静默丢弃（丢弃会让「早期的大事」凭空消失）。
   */
  function chronicle(opts) {
    stat.checked++;
    const o = (opts && typeof opts === 'object') ? opts : {};
    const s = state();
    const cfg = settings();
    const maxRows = (function () {
      const n = Number(o.limit);
      return (typeof n === 'number' && isFinite(n) && n > 0) ? Math.min(256, Math.floor(n)) : 48;
    })();
    const rows = [];
    const hidden = [];
    // ① **只收已结算的归档历史**（写入方：backstage 的 chronicle 段 + horizon）。
    //   为什么不把未结算暗流一起收：非 hidden 的暗流**已经**由既有的 `currents` 注入源
    //   逐轮进正文（快照六源之一），本表再收一次就是同一件事两个实现 —— 那正是
    //   「同一个源两套名字、两本账对不上」的温床（v2.88.0 O1 / v2.99.0 各付过一次学费）。
    //   两张表的分工是**时间轴上的位置**：`currents` 答「此刻世界在酝酿什么」（每轮会变），
    //   本表答「这世界此前发生过什么」（只增不减）。
    const chron = Array.isArray(s.chronicle) ? s.chronicle : [];
    chron.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      // hidden 判据只看**显式声明**：归档历史默认可见（backstage 写入时已按 visibility 过滤过一遍），
      //   猜一个「看起来像秘密」的标题去挡，会把正常的大事一起挡掉。
      if (txt(c.visibility, 20) === 'hidden') {
        hidden.push({ kind: 'chronicle', title: txt(c.title, 40), why: 'visibility=hidden' });
        return;
      }
      rows.push({ at: (typeof c.at === 'number' && isFinite(c.at)) ? c.at : 0,
        kind: 'fact', label: txt(c.kind, 20) || 'event',
        title: txt(c.title, 80), text: txt(c.summary, 120), refs: Array.isArray(c.refs) ? c.refs.slice(0, 4) : [] });
    });
    rows.sort(function (a, b) { return a.at - b.at; });
    const capped = rows.length > maxRows;
    const kept = capped ? rows.slice(-maxRows) : rows;
    // ③ L3 长线沉淀：只出**已有**的主题词（切片保留原顺序，不重排）
    const l3 = (s.memory && Array.isArray(s.memory.l3)) ? s.memory.l3 : [];
    const themes = l3.map(function (e) {
      if (!e || typeof e !== 'object') return null;
      return { t: (typeof e.t === 'number' && isFinite(e.t)) ? e.t : 0,
        theme: txt(e.theme, 120), worldShift: txt(e.worldShift, 80),
        refs: Array.isArray(e.refs) ? e.refs.slice(0, 4) : [] };
    }).filter(Boolean);
    return { ok: true, rows: kept, count: kept.length, total: rows.length, capped: capped,
      themes: themes, hidden: hidden, hiddenCount: hidden.length, dryRun: true };
  }
  /**
   * X2：编年史的**注入侧**块（消费者是 `render/inject.js` 的新源 `chrono`）。
   *
   * 与 `chronicle()` 的分工：那个给**读数**（逐条行、主题、被挡下的），本块给**行文本** ——
   *   只出「什么时候、发生了什么」，不把 L3 主题词与 hidden 计数一起塞给正文模型
   *   （主题词是给作者看的基调摘要，塞进正文等于替模型定了基调，正是本模块要防的那件事）。
   *
   * 三条边界：① 关闭 / 无存档 ⇒ 空串（零 token）；② **只出最近若干行**（默认 12），
   *   超出的如实记 `capped`；③ 出错整块吞掉（与既有各 buildBlock 同纪律：一个读数异常
   *   不该让整条注入链失败）。
   */
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    try {
      const r = chronicle({ limit: 12 });
      if (!r.ok || !r.rows.length) return '';
      const lines = r.rows.map(function (x) {
        // 行文本只带**已声明的内容**：题名 + 摘要切片。时间戳是内部读数（不进正文——
        //   正文的时间口径归 `clock`，两处各报一个时间会让「现在是什么时辰」出现两个真源）。
        return '· ' + (x.title || '（无题）') + (x.text ? '：' + x.text : '');
      });
      if (!lines.length) return '';
      return '【世界编年史】' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
        + String.fromCharCode(10) + '以上是世界**已经发生过**的事（只增不减的归档）；'
        + '它们只供你理解这世界的走向，不要据此推断尚未发生的事，也不要点明「有一条暗流」这类系统口径。';
    } catch (e) { return ''; }
  }
  function statOf() {
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      layers: entries().length, reasons: REASONS.slice()
    });
  }

  WA.chrono = {
    REASONS: REASONS,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    record: record, layer: layer, derives: derives, undo: undo, applyUndo: applyUndo,
    stale: stale, diff: diff, simBranch: simBranch,
    // X2（v2.127.0）：世界编年史。chronicle 给读数（诊断 / 面板），buildBlock 给注入段 ——
    //   两块各有一个真消费方（`engines/tool-diag.js` 的 secChrono 与 `render/inject.js` 的新源
    //   `chrono`），不留裸导出（dead-export-gate 的口径是「产品零引用即冻结面」）。
    chronicle: chronicle, buildBlock: buildBlock,
    stat: statOf
  };
})();
