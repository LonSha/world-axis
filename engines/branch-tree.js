/**
 * WorldAxis engines/branch-tree.js (v2.153.0) — 多结局分支树（RX6）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓已经能把「另选一条路」预演出来（`rehearsal.preview` / `checkPreview` / `apply`），
 *   也已经有「分支存档」（`checkpoints.branch`）与「可达终态集合」（`causal.endingsTree`），
 *   但**玩家做过的每个重大选择没有一本账**：
 *   玩到第 40 轮回头看，答不出「哪几个点分过叉、每个点当初有几种走法、各自预演成什么样」。
 *   一句话：**预演有了，预演出来的东西没有地方放**——每次 preview 都是一次性的。
 *
 * ── 本模块落点（记账与导出，三件东西）────────────────────────
 *   · fork(node) —— 登记一个**分叉点**：在哪一轮、面对什么、可选哪几条、预览 id 与结论。
 *       预览**不自己跑**：`opts.preview` 给步骤集合时，本模块调
 *       `WA.rehearsal.preview(...)` 真跑一次（dryRun，不落世界），把返回的 id 与可比性摘要
 *       存进这个节点。**为什么必须复用那一刻的语义**：分支回放的可信度全部来自
 *       「当时预演时用的就是那一套准入」，自己另写一份沙箱就等于把这份可信度换成一句声明
 *       （与 v2.118.0 定下的「真跑与试演走同一条路径」同规）。
 *   · tree(opt) —— 构建可视化用的树（节点 = 分叉点、边 = 选择）。**只给 JSON**，
 *       不做图形渲染（沿用 E9 口径：渲染交给第三方工具）。
 *   · compare(aId, bId) —— 两个分叉点的**可比性**对比。逐项标 `same` / `diff` / `unknown`：
 *       指纹相同的项是「无差别」，指纹不同是「有差别」，**缺指纹是 unknown 而不是 diff**
 *       —— 「没得比」与「比出来不一样」是两种事（本仓反复付过价的那条边界）。
 *
 * ── 与既有模块的分工（不许重叠）──────────────────────────────
 *   · `rehearsal` —— 单次预演的执行与撤销（本模块**只登记它的产出**，不重写执行面）；
 *   · `checkpoints` —— 存档分支（那是**存档**层面的分叉，本模块是**剧情选择**层面的分叉）；
 *   · `causal.endingsTree` —— 从当前状态可达的终态集合（**当前态**的投影）；
 *     本模块是**历史**：玩家实际做过的那些选择。两者一前一后，合成一张会把
 *     「我可能到哪」与「我当时选了哪」混成一个读数。
 *   · 本模块不写世界、不改任何单条记录（除了它自己那本账）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**开**（只记账，不推进、不预演；预演只在调用方显式给 steps 时才发生）。
 *   2 **不自动登记**：谁在哪个点分叉由调用方决定（自动判断「这是重大选择」需要叙事判断，
 *     本模块不替模型做这件事）。**零自动 fork。**
 *   3 节点有界：`maxNodes` 到顶即拒收 `branches-full`（长局不许无界膨胀）。
 *   4 每个节点的选项数有界（`maxOptions`）；选项过少（不足 2）不叫分叉 ⇒ `no-options`
 *      （**一个选择的「分叉」不能只有一个走法** —— 那就不是分叉，是流水账）。
 *   5 **不推演、不生成正文**：本模块唯一的执行动作是把调用方给的 steps 交给 rehearsal。
 *   6 不落盘到 store 的独立键之外：本账属世界状态（跨会话要留下），故走 store 骨架 + evict 单一出口。
 *   7 回放不了如实说：`replay(id)` 发现预览已过期（rehearsal 报 `stale`）或没有预览 id
 *      ⇒ 返回 `not-comparable`，**不拿一个旧结论冒充可以回放**。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_branch_tree_v1';
  const DEF = {
    enabled: true,
    maxNodes: 40,      // 分叉点环（长局膨胀的第一道闸）
    maxOptions: 6      // 单点可见走法上限
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'branchTree',
    bounds: { maxNodes: [2, 120], maxOptions: [1, 12] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const _stat = { forks: 0, refused: 0, lastReason: '', faults: {} };
  function note(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }
  // v2.155.0 收口补记：本守卫变量名原为 `clockNow_`（带尾下划线）——全仓 177 个守卫里只有本文件与
//   plot-gauge.js 两处是这个形态，而 G20 的声明识别面认的是仓内主流命名（clockNow/clockWall）；
//   形态不统一之外没有别的差别。已改回主流命名，调用点同批同步（4 处）。
// v2.155.0 自纠（全量回归当场抓到）：本守卫原写成**两行**（try 行带三目、catch 行单独 return Date.now()）。
  //   功能上等价，但 G20 的形态判据要求「兜底与守卫声明**同行共现**」—— 判据只认同行，
  //   因为「同行有 WA.clock.」正是「守卫」与「绕过时钟裸读」这两件事的唯一可机检区别。
  //   故改成本仓既有的单行形态（与 engines/backstage.js 等 100+ 处一致）。
  const clockNow = function (tag) { try { return WA.clock.now(tag || 'branchTree'); } catch (e) { return Date.now(); } };
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(root) { const r = root || state(); if (!r.branchTree) r.branchTree = { nodes: [] }; if (!Array.isArray(r.branchTree.nodes)) r.branchTree.nodes = []; return r.branchTree; }
  function list() { return bucket().nodes || []; }
  function find(id) { const k = clean(id, 60); return list().filter(function (x) { return x && x.id === k; })[0] || null; }

  /** 新节点 id：走 rand.id（标识流，不混决策流）。 */
  function nodeId(round) {
    // v2.155.0 自纠：原写「rand 缺席 ⇒ Math.random 兜底」——而全库纪律是**产品文件除 core/rand.js
    //   外一律不得出现 Math.random**（裸调绕过冻结种子，回放对不上时无从定位）。
    //   标识流的缺席语义应为**显式空标识**（调用方按 `id:''` 可判），不是悄悄换一个随机源。
    //   这与其兄弟模块（editor-events / enemies / entities）的 `WA.rand.id(...)` 直调形态一致：
    //   rand 是必载核心，缺席即断裂，不该被兜底静默。
    return WA.rand.id('br_' + (round || 0) + '_', 4, 'id');
  }

  /**
   * 登记一个分叉点。**只写这本账**（一次 transact），不碰其他状态。
   * @param {object} node { round, prompt, options[], parent, choice, steps }
   *   options 至少 2 条（否则 no-options）；steps 给了才真跑一次 rehearsal.preview。
   * @returns {object} { ok, id, options, preview, comparable } 或 { ok:false, reason }
   */
  function fork(node) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const n = node || {};
    const prompt = clean(n.prompt, 120);
    if (!prompt) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'prompt' }; }
    const rawOpts = Array.isArray(n.options) ? n.options : [];
    const options = rawOpts.map(function (o) { return clean(o, 80); }).filter(function (o) { return !!o; })
      .slice(0, Math.max(1, Math.floor(cfg.maxOptions)));
    // 分叉的定义要件：**至少两条走法**。一条走法的「选择」是流水账，登记进来只会让
    //   分支树长出一堆度数为 1 的假节点（而「deg=1」在本仓是「终点」的语义）。
    if (options.length < 2) { note('no-options'); return { ok: false, reason: 'no-options', have: options.length, need: 2 }; }

    const parent = n.parent ? clean(n.parent, 60) : '';
    if (parent && !find(parent)) {
      // 父节点不存在 ⇒ 树的边指向空气。宁可拒收也不留一条**悬空边**：
      //   悬空边在导出 JSON 里看着正常，导入第三方工具后才会断成两棵树。
      note('unknown-parent'); return { ok: false, reason: 'unknown-parent', parent: parent };
    }
    const cur = list();
    if (cur.length >= Math.max(1, Math.floor(cfg.maxNodes))) {
      note('branches-full'); return { ok: false, reason: 'branches-full', cap: cfg.maxNodes };
    }

    const round = Number(n.round);
    const at = clockNow('branchTree');
    const id = nodeId(isFinite(round) ? round : 0);

    // 预览：**只在调用方给了 steps 时才跑**，且真交给 rehearsal（不自己另立沙箱）。
    let preview = null, comparable = null;
    if (Array.isArray(n.steps) && n.steps.length) {
      if (!WA.rehearsal || typeof WA.rehearsal.preview !== 'function') {
        preview = { ok: false, reason: 'rehearsal-absent' };
      } else {
        let r = null;
        try { r = WA.rehearsal.preview(n.steps, { now: n.now, world: n.world }); }
        catch (e) { r = { ok: false, reason: 'preview-throw' }; }
        // v2.153.0 口径（对齐真实返回面）：rehearsal.preview 成功时给的 id 字段名是
        //   **`previewId`**（不是 `id`），且摘要里可比性在 `comparable`。
        //   读错字段的后果不是「取不到值」而是「登记了一个空 id 的预览」——
        //   `replay()` 会永远报 not-comparable，而树看上去一切正常。
        const pid = (r && (r.previewId || r.id)) || '';
        preview = (r && r.ok && pid) ? { ok: true, id: pid, steps: r.steps, done: r.done, refused: r.refused,
          fingerprint: r.fingerprint, comparable: (r.comparable || null) }
          : { ok: false, reason: (r && r.reason) || (r && r.ok ? 'no-preview-id' : 'preview-failed') };
        if (preview.ok && preview.comparable) {
          const c = preview.comparable;
          comparable = { yes: (c.yes || []).length, no: (c.no || []).length,
            keys: (preview.fingerprint && typeof preview.fingerprint.keys === 'number') ? preview.fingerprint.keys : null,
            chars: (preview.fingerprint && typeof preview.fingerprint.chars === 'number') ? preview.fingerprint.chars : null,
            digest: (preview.fingerprint && preview.fingerprint.digest) || null };
        }
      }
    }

    const rec = { id: id, round: isFinite(round) ? Math.floor(round) : 0, at: at, prompt: prompt,
      options: options, parent: parent, choice: n.choice ? clean(n.choice, 80) : '',
      previewId: (preview && preview.ok) ? preview.id : '',
      previewReason: (preview && preview.ok) ? '' : ((preview && preview.reason) || 'no-preview'),
      comparable: comparable };
    // v2.153.0：账是**世界状态**（跨会话要留下），故走 transact + evict 单一出口。
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) { const b = bucket(d); b.nodes.push(rec); }, 'branchTree:fork');
    } else { cur.push(rec); }
    if (WA.evict && typeof WA.evict.array === 'function') {
      try { WA.evict.array(bucket().nodes, 'branchTree.nodes'); } catch (e) { /* 站点未登记时静默 */ }
    }
    _stat.forks++;
    return { ok: true, id: id, round: rec.round, options: options.length, parent: parent,
      preview: preview, comparable: comparable };
  }

  /**
   * 记录实际选择（分叉点事后知道玩家走了哪条）。**只补一格**，不新增节点。
   */
  function choose(id, option) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const rec = find(id);
    if (!rec) { note('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    const opt = clean(option, 80);
    if (!opt) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'option' }; }
    // 选了不在登记表内的走法 ⇒ 如实拒收（**不悄悄追加**：那会让「我登记了三条、
    //   实际走了第四条」在树上长得像正常分支）。
    if (rec.options.indexOf(opt) < 0) { note('bad-value'); return { ok: false, reason: 'bad-value', field: 'option', allowed: rec.options.slice() }; }
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        const b = bucket(d);
        const t = b.nodes.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.choice = opt; t.chosenAt = clockNow('branchTree'); }
      }, 'branchTree:choose');
    } else { rec.choice = opt; rec.chosenAt = clockNow('branchTree'); }
    return { ok: true, id: rec.id, choice: opt };
  }

  /**
   * 分支树（可视化用的 JSON）。节点 = 分叉点，边 = parent → 子。
   * 返回 { ok, nodes, edges, roots, dangling, reason }：
   *   `dangling` 恒应为 0（悬空边在 fork 处已被拒），**报出来是为了让它是可核的**。
   */
  function tree() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', nodes: [], edges: [], roots: 0, dangling: 0 };
    const cur = list();
    const ids = {};
    cur.forEach(function (x) { if (x && x.id) ids[x.id] = x; });
    const nodes = cur.filter(function (x) { return x && x.id; }).map(function (x) {
      return { id: x.id, round: x.round, label: x.prompt, options: (x.options || []).length,
        choice: x.choice || '', preview: !!x.previewId };
    });
    const edges = [];
    let dangling = 0;
    cur.forEach(function (x) {
      if (!x || !x.parent) return;
      if (!ids[x.parent]) { dangling++; return; }
      // v2.153.0：`via` 取**父节点上实际走的那一条**。为什么不是子节点自己的 choice：
      //   边描述的是「从父点出发时走了哪条路」，而子节点的 choice 是**它自己那一岔**的事
      //   —— 用子节点的选择给入边打标签，等于把「我在这选了 A」读成「我是从 A 来的」。
      edges.push({ from: x.parent, to: x.id, via: ids[x.parent].choice || '' });
    });
    const roots = cur.filter(function (x) { return x && !x.parent; }).length;
    return { ok: true, nodes: nodes, edges: edges, roots: roots, dangling: dangling,
      reason: nodes.length ? 'tree' : 'no-branches' };
  }

  /**
   * 两个分叉点的可比性对比（**不是世界状态 diff**：那是另一件事，本模块不做）。
   * 逐项 same / diff / unknown；`unknown` = 至少一侧没有该项指纹（**没得比 ≠ 不一样**）。
   */
  function compare(aId, bId) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', rows: [] };
    const A = find(aId), B = find(bId);
    if (!A || !B) return { ok: false, reason: 'not-found', rows: [],
      missing: (!A ? clean(aId, 60) : '') + (!A && !B ? ',' : '') + (!B ? clean(bId, 60) : '') };
    const pick = function (x) {
      const c = x.comparable || {};
      return { keys: (typeof c.keys === 'number') ? c.keys : null,
        chars: (typeof c.chars === 'number') ? c.chars : null,
        digest: c.digest || null };
    };
    const a = pick(A), b = pick(B);
    const rows = ['keys', 'chars', 'digest'].map(function (k) {
      const va = a[k], vb = b[k];
      let state;
      if (va === null || va === undefined || vb === null || vb === undefined) state = 'unknown';
      else state = (va === vb) ? 'same' : 'diff';
      return { key: k, a: va, b: vb, state: state };
    });
    const known = rows.filter(function (r) { return r.state !== 'unknown'; });
    // 三项全 unknown ⇒ 这条对比**没有可比性可言**，如实报 not-comparable
    //   （而不是回一个「全 same」——那会把「两边都没指纹」读成「两边一模一样」）。
    if (!known.length) return { ok: false, reason: 'not-comparable', rows: rows, a: A.id, b: B.id };
    return { ok: true, rows: rows, a: A.id, b: B.id,
      differing: known.filter(function (r) { return r.state === 'diff'; }).length,
      unknown: rows.length - known.length };
  }

  /**
   * 回放：把某个分叉点的预览重新「拿出来看」。**不执行**（apply 是调用方的事）。
   * 预览已过期（rehearsal 报 stale）或本就没有预览 ⇒ `not-comparable`。
   */
  function replay(id) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const rec = find(id);
    if (!rec) { note('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (!rec.previewId) { note('not-comparable'); return { ok: false, reason: 'not-comparable', why: rec.previewReason || 'no-preview' }; }
    if (!WA.rehearsal || typeof WA.rehearsal.checkPreview !== 'function') {
      note('not-comparable'); return { ok: false, reason: 'not-comparable', why: 'rehearsal-absent' };
    }
    let r = null;
    try { r = WA.rehearsal.checkPreview(rec.previewId); } catch (e) { r = null; }
    // v2.153.0 口径（对齐真实返回面）：checkPreview 在**世界已变**时给的是
    //   `{ ok:true, match:false, reason:'stale-preview' }` —— 只看 `ok` 会把
    //   「预览已过期」读成「可以回放」。判据必须落在 `match === true` 上。
    if (!r || r.ok !== true || r.match !== true) {
      note('not-comparable');
      return { ok: false, reason: 'not-comparable',
        why: (r && r.reason) || 'check-failed', pinned: (r && r.pinned) || null };
    }
    return { ok: true, id: rec.id, previewId: rec.previewId, check: r,
      choice: rec.choice || '', options: (rec.options || []).slice() };
  }

  function stat() {
    const cfg = settings();
    const cur = list();
    return { enabled: !!cfg.enabled, nodes: cur.length, roots: cur.filter(function (x) { return x && !x.parent; }).length,
      withChoice: cur.filter(function (x) { return x && x.choice; }).length,
      withPreview: cur.filter(function (x) { return x && x.previewId; }).length,
      forks: _stat.forks, refused: _stat.refused, lastReason: _stat.lastReason,
      caps: { maxNodes: cfg.maxNodes, maxOptions: cfg.maxOptions },
      faults: Object.assign({}, _stat.faults) };
  }

  function reset() { _stat.forks = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.branchTree = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    fork: fork, choose: choose, tree: tree, compare: compare, replay: replay, stat: stat, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/branch-tree.js', { kind: 'engine', ver: '2.153.0' });
})();