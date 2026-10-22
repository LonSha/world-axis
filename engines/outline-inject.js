/**
 * WorldAxis engines/outline-inject.js (v2.231.0) — 大纲注入
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓有 `canon`（正史条目）与 `inject-budget`（预算），但**「大纲从哪来、往哪放」
 *   这条链没有**：现场实测 `大纲注入` / `outlineInject` / `剧情指导` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：大纲要么塞进正文（读者看见作者笔记），要么与设定条目抢同一格，
 *   重注入时**旧大纲还挂着**，模型同时读到两份互相矛盾的大纲。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 JulyXP3/story-oracle-outline 的 src/outline-inject.js（剧情大纲注入）：
 *     · **只从标签尾部取内容**：大纲必须包在模板标签里，取**最后一次闭合**的那段
 *       （`extractTagContentFromEnd`），取不到就拒收（不整篇当大纲）；
 *     · **旧条目一律禁用**：新建「剧情指导N」时把**所有旧条目置为禁用**
 *       （`enabled:false`），台面上永远只有一份生效；
 *     · **覆盖 vs 新建**是明确二选一，**不允许并存**；
 *     · 条目属性是**注入位置与深度**（at_depth_as_system / depth / order / constant），
 *       不是往正文里写 —— 大纲属于**元信息**，不属于叙事；
 *     · **无内容不注入**（空字符串直接拒收，不建空条目）。
 *   本模块只取其中**可判定的那一层**（标签取尾 / 单一生效 / 覆盖或新建 / 位置属性 /
 *   空拒收）。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · canon —— 「正史条目内容」，本模块不写它；
 *   · inject-budget —— 「够不够放」，本模块只出计划不算预算；
 *   · 本模块 —— **标签取尾 + 单一生效 + 覆盖/新建 + 位置属性 + 宿主世界书写入**。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `plan` 与 `apply` 一律 `disabled`。
 *   ② **标签取尾**：取**最后一次**闭合标签内的内容，之前的手稿不算。
 *   ③ **取不到就拒收**：无标签 / 无闭合 / 内容空 ⇒ 具名拒收，不整篇当大纲。
 *   ④ **台面单一生效**：`plan` 返回的动作里，**旧条目全部 disable:true**，
 *      生效的永远只有一条（不允许两份并存）。
 *   ⑤ **覆盖只顶最新的那份**：`overwrite` 命中的是**最新的生效条目**，
 *      不是 "第一条" 也不是 "全部"。
 *   ⑥ **新建必禁用旧**：`create` 时旧条目降级为禁用，序号顺延。
 *   ⑦ **注入位置是元信息**：本条永不改正文一字（`writes` 只数**世界书条目**改动）。
 *   ⑧ **计划与执行分列**：`plan` 恒 `applied:0` / `writes:0`（只算不做）；
 *      真写宿主只走 `apply` 一条路，且**写后复查**（见第九条）。
 *
 * ── 第九条（v2.231.0 / 优化 OPT-7）：执行面 —— 计划与执行分列 ──────────
 *   缺口（开工前现场实测）：`plan` 的 `applied:0` / `writes:0` 是**恒值字面量**，
 *   全仓**没有任何一处**把 `actions` 落到宿主世界书。后果是这条链在真实使用时
 *   「算得出该建哪条，但永远没建」——面板上写着「新建 剧情指导2」，而世界书里
 *   一个字都没多。这与本仓反复治的「声明面空转」是同一个病：
 *   能力写进了返回体，却没有出口。
 *
 *   故本版补**唯一写入口** `apply()`，并立四条纪律：
 *   ⓐ **plan 恒零直写不变**：`plan` 仍是纯函数（无 await、零宿主调用）。
 *      执行与计划分列的理由是「看一眼会做什么」必须能**先于**任何写入发生
 *      ——合成一个函数会让「预览」这个词失去意义。
 *   ⓑ **写后复查**：每次写入后重新 `getWorldbook` 复核三件事 ——
 *      生效条目存在且 `enabled !== false`、内容与计划逐字一致、被禁用的条目
 *      确实 `enabled === false`。任一不满足 ⇒ `ok:false` + `reason:'verify-failed'`，
 *      **不假装成功**（「我写了」与「它真在那儿」是两件事，本仓口径）。
 *   ⓒ **能力缺席如实拒收**：禁用/覆盖旧条目需要宿主提供条目更新能力
 *      （`updateWorldbookWith` 或 `replaceWorldbook`）。两者都没有时，
 *      **不静默降级成「只建新条目、旧的一律留着」**——那正是本模块要治的病
 *      （两份大纲并存）。如实返回 `no-update-api`，让调用方决定。
 *   ⓓ **找不到条目如实拒收**：`set` / `disable` 动作按 `comment` 在**真读到的**
 *      世界书里定位；定位不到 ⇒ `entry-missing`。**不许改写成 create** ——
 *      把「覆盖最新」悄悄变成「又建一条」，台面上就会多出一份。
 *
 *   第十条（同一版）：**重启清零是有意的代价**。本模块不新增任何 store 键 ——
 *   大纲的真源是宿主世界书（跨会话由世界书自己带着），引擎侧只留内存 `stat`
 *   （与既有计数同规）。登记进骨架反而会让 `registryParity` 要求一份并不存在的
 *   淘汰语义（core/clock.js 的同款边界）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_outline_inject_settings_v1';
  const DEF = { enabled: false, tag: 'outline', bookSuffix: '剧情指导', position: 'at_depth_as_system',
    depth: 4, order: 9999, preventRecursion: true, maxOutline: 20000, maxEntries: 64 };
  const __REG = { key: LS_KEY, def: DEF, module: 'outlineInject',
    bounds: { depth: [0, 32], order: [0, 99999], maxOutline: [100, 200000], maxEntries: [1, 512] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const MODES = ['create', 'overwrite'];
  const MODE_LABEL = { create: '新建条目', overwrite: '覆盖最新' };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { planned: 0, extracted: 0, refused: 0, blocked: 0, lastReason: '', faults: {},
    applied: 0, appliedActions: 0, verified: 0, undone: 0, applyRefused: 0, applyFaults: {}, lastApply: null };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }

  function tagNameOf(cfg, opts) {
    const raw = (opts && opts.tag) || cfg.tag || '';
    const t = clean(raw, 40).replace(/[<>\s]/g, '');
    return t || null;
  }
  /** 取**最后一次**同名闭合标签内的内容（上游 extractTagContentFromEnd 口径）。 */
  function extractFromEnd(text, tag) {
    const src = String(text == null ? '' : text);
    const t = clean(tag, 40).replace(/[^\w\u4e00-\u9fff-]/g, '');
    if (!t) return { why: 'bad-tag' };
    const re = new RegExp('<' + t + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + t + '\\s*>', 'gi');
    let m; let last = null;
    while ((m = re.exec(src)) !== null) last = m[1];
    if (last === null) {
      // 退一步：只认「闭标签在末尾」这一种残形
      const tail = new RegExp('<\\/' + t + '\\s*>\\s*$', 'i').exec(src);
      if (!tail) return { why: 'no-tag' };
      return { why: 'no-open' };
    }
    const body = last.trim();
    if (!body) return { why: 'empty-body' };
    return { ok: true, why: 'ok', body: body, chars: body.length };
  }
  /** 条目名：`剧情指导` / `剧情指导2` …… 序号连续。 */
  function entryComment(cfg, n) {
    const base = clean((cfg.bookSuffix || '剧情指导'), 40) || '剧情指导';
    return n <= 1 ? base : base + String(n);
  }
  function parseEntries(entries) {
    const cfg = settings();
    const base = clean((cfg.bookSuffix || '剧情指导'), 40) || '剧情指导';
    const arr = Array.isArray(entries) ? entries : [];
    const rows = [];
    arr.forEach(function (e) {
      const o = e || {};
      const c = clean(o.comment, 60);
      if (!c) return;
      if (c !== base && !new RegExp('^' + base + '(\\d+)$').test(c)) return;
      const n = c === base ? 1 : parseInt(c.replace(base, ''), 10);
      rows.push({ comment: c, n: Number.isFinite(n) ? n : 1, enabled: o.enabled !== false, content: clean(o.content, 100000) });
    });
    rows.sort(function (a, b) { return a.n - b.n; });
    return rows;
  }
  /**
   * 注入计划：标签取尾 → 台面单一生效 → 覆盖或新建。
   * 只出计划，恒 `applied:0` / `writes:0`（本模块在此**不**碰任何宿主世界书）。
   * 真写走 `apply()` —— 分列的理由见文件头第九条 ⓐ。
   */
  function plan(outlineText, entries, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const tag = tagNameOf(cfg, opts);
    if (!tag) return refuse('bad-tag');
    const got = extractFromEnd(outlineText, tag);
    if (!got.ok) return refuse(got.why);
    if (got.chars > cfg.maxOutline) return refuse('too-long');
    const o = opts || {};
    const mode = MODES.indexOf(clean(o.mode, 20)) >= 0 ? clean(o.mode, 20) : 'create';
    const rows = parseEntries(entries);
    if (rows.length > cfg.maxEntries) return refuse('too-many-entries');
    const live = rows.filter(function (r) { return r.enabled; });
    const base = clean((cfg.bookSuffix || '剧情指导'), 40) || '剧情指导';
    const actions = [];
    let created = null; let overwritten = null;
    if (mode === 'overwrite' && live.length) {
      // 覆盖只顶**最新的那份生效**，其余生效条目一并降级（台面单一生效）
      const latest = live[live.length - 1];
      overwritten = latest.comment;
      actions.push({ action: 'set', comment: latest.comment, content: got.body, enabled: true, disable: false,
        position: cfg.position, order: cfg.order, depth: cfg.depth, preventRecursion: cfg.preventRecursion });
      live.slice(0, live.length - 1).forEach(function (r) {
        actions.push({ action: 'disable', comment: r.comment, enabled: false, disable: true, content: r.content });
      });
    } else {
      // 新建：序号顺延到最大 +1，旧条目全部禁用
      const maxN = rows.reduce(function (a, r) { return Math.max(a, r.n); }, 1);
      const n = rows.length ? maxN + 1 : 1;
      created = entryComment(cfg, n);
      actions.push({ action: 'create', comment: created, content: got.body, enabled: true, disable: false,
        position: cfg.position, order: cfg.order, depth: cfg.depth, preventRecursion: cfg.preventRecursion });
      live.forEach(function (r) {
        actions.push({ action: 'disable', comment: r.comment, enabled: false, disable: true, content: r.content });
      });
    }
    stat.planned++; stat.extracted++;
    const liveAfter = actions.filter(function (a) { return a.enabled; }).length;
    return { ok: true, reason: 'ok', mode: mode, modeLabel: MODE_LABEL[mode], tag: tag,
      chars: got.chars, body: got.body, bookSuffix: base,
      actions: actions, created: created, overwritten: overwritten,
      disabled: actions.filter(function (a) { return a.action === 'disable'; }).map(function (a) { return a.comment; }),
      liveAfter: liveAfter, singleLive: liveAfter <= 1, applied: 0, writes: 0,
      position: cfg.position, depth: cfg.depth, order: cfg.order, preventRecursion: cfg.preventRecursion };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, modes: MODES.slice(), modeLabel: MODE_LABEL,
      tag: cfg.tag, bookSuffix: cfg.bookSuffix, position: cfg.position, depth: cfg.depth,
      order: cfg.order, preventRecursion: cfg.preventRecursion, maxOutline: cfg.maxOutline, maxEntries: cfg.maxEntries,
      semantics: '标签取尾 / 台面单一生效 / 覆盖或新建二选一 / 大纲是元信息不进正文',
      // v2.231.0（OPT-7）：执行面口径如实写进读数 —— 「预览」与「写入」是两条路，
      //   面板上必须看得见这件事，否则用户会以为 plan 已经把条目建好了。
      applySemantics: 'plan 只算不做（恒 applied:0）；真写只走 apply，写后复查，能力缺席如实拒收',
      resetOnReload: true };
  }
  function resetStat() {
    stat.planned = 0; stat.extracted = 0; stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    stat.applied = 0; stat.appliedActions = 0; stat.verified = 0; stat.undone = 0; stat.applyRefused = 0; stat.applyFaults = {}; stat.lastApply = null;
    return { ok: true };
  }

  // ══════════════════ v2.231.0（优化 OPT-7）：执行面 ══════════════════
  /** 宿主 TavernHelper 取用（与 engines/wb-inject.js 同款：主窗优先，容错不抛）。 */
  function getTH() {
    try {
      const mw = WA.mainWin || (typeof window !== 'undefined' ? window : null);
      if (typeof TavernHelper !== 'undefined' && TavernHelper) return TavernHelper;
      return (mw && mw.TavernHelper) || null;
    } catch (e) { return null; }
  }
  /**
   * 条目更新能力探测（ⓒ）。返回 { kind, fn } 或 null。
   *   只认两种真实存在的能力，**不造**第三条：
   *     · updateWorldbookWith(name, updater) —— 传入改写函数，按条目列表整表回写；
   *     · replaceWorldbook(name, entries)     —— 传入完整条目列表，整表替换。
   *   两者皆无 ⇒ 调用方如实报 `no-update-api`（不许静默降级，见文件头 ⓒ）。
   */
  function updateCapability(TH) {
    if (!TH) return null;
    if (typeof TH.updateWorldbookWith === 'function') return { kind: 'updateWorldbookWith', fn: TH.updateWorldbookWith.bind(TH) };
    if (typeof TH.replaceWorldbook === 'function') return { kind: 'replaceWorldbook', fn: TH.replaceWorldbook.bind(TH) };
    return null;
  }
  /** 按 comment/name 在**真读到的**条目列表里定位（定位不到返回 -1，调用方如实拒收）。 */
  function indexOfEntry(list, comment) {
    const c = clean(comment, 60);
    if (!c) return -1;
    for (let i = 0; i < (list || []).length; i++) {
      const e = list[i] || {};
      if (clean(e.comment, 60) === c || clean(e.name, 60) === c) return i;
    }
    return -1;
  }
  /** 世界书名：显式给的优先，其次沿用 wb-inject 的配套书名解析（容忍改名）。 */
  function pickBook(cfg, opts) {
    const o = opts || {};
    if (o.worldbookName) return String(o.worldbookName);
    if (cfg.worldbookName) return String(cfg.worldbookName);
    try {
      if (WA.wbInject && typeof WA.wbInject.findCompanionName === 'function') {
        const n = WA.wbInject.findCompanionName();
        if (n) return n;
      }
    } catch (e) { /* 取不到就如实报 no-book，不猜 */ }
    return null;
  }
  /** 计划条目的目标世界书形态（位置/深度/顺序/防递归四项，逐字来自计划）。 */
  function entryShape(a, cfg) {
    return {
      comment: a.comment,
      name: a.comment,
      enabled: a.enabled !== false,
      strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] } },
      position: { type: cfg.position, order: cfg.order, depth: cfg.depth },
      content: String(a.content == null ? '' : a.content),
      probability: 100,
      recursion: { prevent_incoming: !!cfg.preventRecursion, prevent_outgoing: !!cfg.preventRecursion, delay_until: null }
    };
  }
  function applyNote(reason) {
    stat.applyRefused++; stat.applyFaults[reason] = (stat.applyFaults[reason] || 0) + 1;
    stat.lastApply = { ok: false, reason: reason, at: stat.applied };
    return { ok: false, reason: reason, applied: 0, writes: 0, landed: [], verified: false };
  }
  /**
   * 真写宿主世界书：按 `plan` 的动作逐条落地，**每步写后复查**（ⓑ）。
   *
   * @param {string} outlineText  含模板标签的大纲原文
   * @param {Array}  entries      当前世界书条目（由调用方真读后传入 —— 引擎不替调用方猜）
   * @param {Object} opts         { mode, tag, worldbookName }
   * @returns {Promise<Object>}   { ok, reason, applied, writes, landed, disabled, verified, plan }
   *
   * 拒收一律**具名**（disabled / bad-tag / no-tag / empty-body / too-long / too-many-entries /
   *   no-th / no-book / no-update-api / entry-missing / create-failed / update-failed / verify-failed）。
   */
  async function apply(outlineText, entries, opts) {
    const cfg = settings();
    // 计划先行：拒收的原因由 plan 一处产出，执行面不重写第二遍判定
    const p = plan(outlineText, entries, opts);
    if (!p.ok) {
      // 计划阶段就拒收的，同样计入**执行面**读数：`applyFaults` 是「apply 为什么没写成」
      //   的完整答案，漏掉这一批会让「拒收原因」在读数里分成两半（一半在 faults、
      //   一半只活在返回值里）——读数分家，看读数的人就会漏掉一半事实。
      return Object.assign({}, applyNote(p.reason), p, { applied: 0, writes: 0, landed: [], verified: false });
    }
    const TH = getTH();
    if (!TH || typeof TH.getWorldbook !== 'function' || typeof TH.createWorldbookEntries !== 'function') return applyNote('no-th');
    const wbName = pickBook(cfg, opts);
    if (!wbName) return applyNote('no-book');
    const cap = updateCapability(TH);
    // 需要改旧条目的动作（set / disable）在无更新能力时**整体拒收**（ⓒ）：
    //   只建新的、把旧的留着，正是本模块要治的「两份大纲并存」。
    const needsUpdate = p.actions.some(function (a) { return a.action !== 'create'; });
    if (needsUpdate && !cap) return applyNote('no-update-api');
    let list;
    try { list = await TH.getWorldbook(wbName); } catch (e) { return applyNote('read-failed'); }
    list = Array.isArray(list) ? list.slice() : [];

    // ── 动手前核对（ⓓ）：set / disable 的目标必须**在真读到的列表里** ──
    //   拦在这里而不是「写一半才发现」：部分写入后报失败，台面上会留下一份半成品
    //   ——而本模块要治的正是「台面上多出一份」。create 的目标**允许**不存在。
    for (let i = 0; i < p.actions.length; i++) {
      const a = p.actions[i];
      if (a.action === 'create') continue;
      if (indexOfEntry(list, a.comment) < 0) return applyNote('entry-missing');
    }

    const landed = [];
    const disabledNow = [];
    for (let i = 0; i < p.actions.length; i++) {
      const a = p.actions[i];
      // replaceWorldbook 是**整表回写**：每次动手前重新读一次真源。不重读的话，
      //   本循环先前建/改的那一条会被上一轮的快照覆盖回去 —— 新条目当场消失，
      //   而「我调用过 API」这件事仍然成立（本仓口径：「我写了」≠「它真在那儿」）。
      if (cap && cap.kind === 'replaceWorldbook') {
        try { list = await TH.getWorldbook(wbName); } catch (e) { return applyNote('read-failed'); }
        list = Array.isArray(list) ? list.slice() : [];
      }
      const at = indexOfEntry(list, a.comment);
      if (a.action === 'create') {
        // 已存在同名条目 ⇒ 不重复建（重复条目会让「单一生效」在台面上失守），改走更新
        if (at >= 0) {
          if (!cap) return applyNote('no-update-api');
          try {
            const shape = entryShape(a, cfg);
            if (cap.kind === 'replaceWorldbook') { list[at] = Object.assign({}, list[at], shape); await cap.fn(wbName, list); }
            else { await cap.fn(wbName, function (arr) { const t = indexOfEntry(arr, a.comment); if (t >= 0) arr[t] = Object.assign({}, arr[t], shape); return arr; }); }
          } catch (e) { return applyNote('update-failed'); }
          landed.push({ action: 'create', comment: a.comment, via: 'update-existing' });
        } else {
          try { await TH.createWorldbookEntries(wbName, [entryShape(a, cfg)]); } catch (e) { return applyNote('create-failed'); }
          landed.push({ action: 'create', comment: a.comment, via: 'create' });
        }
      } else {
        // set / disable：必须**定位到真条目**再改（ⓓ 找不到就拒收，不许改写成 create）
        if (at < 0) return applyNote('entry-missing');
        const patch = a.action === 'set'
          ? entryShape(Object.assign({}, a, { enabled: true }), cfg)
          : { enabled: false };
        try {
          if (cap.kind === 'replaceWorldbook') { list[at] = Object.assign({}, list[at], patch); await cap.fn(wbName, list); }
          else { await cap.fn(wbName, function (arr) { const t = indexOfEntry(arr, a.comment); if (t >= 0) arr[t] = Object.assign({}, arr[t], patch); return arr; }); }
        } catch (e) { return applyNote('update-failed'); }
        landed.push({ action: a.action, comment: a.comment, via: cap.kind });
        if (a.action === 'disable') disabledNow.push(a.comment);
      }
    }

    // ── 写后复查（ⓑ）：三件事逐条复核，任一不满足即 verify-failed ──
    let after;
    try { after = await TH.getWorldbook(wbName); } catch (e) { return applyNote('verify-failed'); }
    after = Array.isArray(after) ? after : [];
    const base = p.bookSuffix;
    const live = after.filter(function (e) {
      const c = clean((e && e.comment) || (e && e.name), 60);
      if (!c) return false;
      if (c !== base && !new RegExp('^' + base + '(\\d+)$').test(c)) return false;
      return (e && e.enabled !== false);
    });
    const liveAfter = live.length;
    const target = p.created || p.overwritten;
    const ti = indexOfEntry(after, target);
    const bodyOK = ti >= 0 && String(after[ti].content == null ? '' : after[ti].content) === p.body;
    const disOK = disabledNow.every(function (c) { const k = indexOfEntry(after, c); return k >= 0 && after[k].enabled === false; });
    const singleOK = liveAfter <= 1;
    if (!bodyOK || !disOK || !singleOK) return applyNote('verify-failed');

    stat.applied++; stat.appliedActions += landed.length; stat.verified++;
    stat.lastApply = { ok: true, reason: 'ok', book: wbName, target: target, liveAfter: liveAfter, at: stat.applied };
    return { ok: true, reason: 'ok', book: wbName, cap: cap ? cap.kind : 'create-only',
      applied: landed.length, writes: landed.length, landed: landed, disabled: disabledNow,
      target: target, liveAfter: liveAfter, singleLive: liveAfter <= 1, verified: true, plan: p };
  }

  /**
   * 预览差异（OPT-7「编辑→**预览差异**→采纳」的中间那一步）。
   *
   * 与 `plan` 的区别是**读真源**：`plan` 只按调用方给的列表算（纯函数、可离线），
   * 本函数真读宿主世界书，回答「此刻采纳会成，还是会撞上 entry-missing」。
   * 它**仍然零写入** —— 预览与执行分列的理由同第九条 ⓐ。
   *
   * @returns {Promise<Object>} { ok, reason, plan, willLand, blocked, book, cap }
   */
  async function preview(outlineText, opts) {
    const cfg = settings();
    // 关闭时**不碰宿主**（同 ①）：本地判一次即回；拒收原因仍由 plan 一处产出
    if (!cfg.enabled) {
      const p0 = plan(outlineText, [], opts);
      return { ok: false, reason: p0.reason, plan: p0, willLand: [], blocked: [], book: null, cap: null };
    }
    const TH = getTH();
    const wbName = pickBook(cfg, opts);
    if (!TH || typeof TH.getWorldbook !== 'function') return { ok: false, reason: 'no-th', plan: null, willLand: [], blocked: [], book: wbName, cap: null };
    if (!wbName) return { ok: false, reason: 'no-book', plan: null, willLand: [], blocked: [], book: null, cap: null };
    let list;
    try { list = await TH.getWorldbook(wbName); } catch (e) { return { ok: false, reason: 'read-failed', plan: null, willLand: [], blocked: [], book: wbName, cap: null }; }
    list = Array.isArray(list) ? list : [];
    // 只算**一遍**：计划按**真读到的**列表出（调用方给的可能是旧快照）。
    //   早先的写法是「先按空列表算一次探路、再按真列表算一次」，那会让
    //   `stat.planned` / `stat.extracted` 每次预览 +2 —— 读数失真，看读数的人会以为
    //   自己点了两下。
    const p2 = plan(outlineText, list, opts);
    if (!p2.ok) return { ok: false, reason: p2.reason, plan: p2, willLand: [], blocked: [], book: wbName, cap: null };
    const cap = updateCapability(TH);
    // 逐条判「此刻采纳成不成」。判据**与 `apply` 的闸同一条**（不是另写一套）：
    //   需要改旧条目（`set` / `disable`）而宿主没有更新能力 ⇒ 采纳会被整体拒收
    //   `no-update-api`。预览先答这一步，面板据此先说清「这台宿主改不了旧条目」，
    //   不让人点一个注定失败的按钮。
    //   如实登记两条**结构上不可达**的码（本函数因此不写它们、也不假称可达）：
    //     · `entry-missing`：计划按**真读到的**列表出 ⇒ `set` / `disable` 的目标必然在列表里；
    //     · 「create 撞同名」：新建序号按 maxN+1 顺延 ⇒ 目标必然不在列表里。
    //   两者的可达性都归 `apply`（它才要处理调用方递进来的旧快照，B5c / B10b 守着它）。
    const needsUpdate = p2.actions.some(function (a) { return a.action !== 'create'; });
    const willLand = p2.actions.map(function (a) { return a.comment; });
    const blocked = (needsUpdate && !cap)
      ? p2.actions.filter(function (a) { return a.action !== 'create'; }).map(function (a) { return a.comment; })
      : [];
    const reason = (needsUpdate && !cap) ? 'no-update-api' : 'ok';
    return { ok: reason === 'ok', reason: reason, plan: p2, willLand: willLand, blocked: blocked,
      book: wbName, cap: cap ? cap.kind : 'create-only', singleLive: p2.singleLive,
      applied: 0, writes: 0 };
  }
  /**
   * 撤销到上一有效版本（OPT-7「支持撤销到上一版本」）。
   *
   * 上一版本**就在世界书里**：被禁用的旧条目是历史本身（禁用不等于删除，见 B4c 口径）。
   * 故本操作是**对称的一次交换** —— 启用序号最大的那条被禁用条目、把当前生效的那条禁回去。
   * 因此它**不需要任何新的 store 键**（第十条：重启清零是有意的代价），
   * 也不需要在引擎侧维护一份「大纲历史」的第二真源。
   *
   * @returns {Promise<Object>} { ok, reason, restored, disabled, verified, liveAfter, book }
   */
  async function undo(entries, opts) {
    const cfg = settings();
    if (!cfg.enabled) return applyNote('disabled');
    const TH = getTH();
    if (!TH || typeof TH.getWorldbook !== 'function' || typeof TH.createWorldbookEntries !== 'function') return applyNote('no-th');
    const wbName = pickBook(cfg, opts);
    if (!wbName) return applyNote('no-book');
    const cap = updateCapability(TH);
    // 撤销必然要改旧条目 ⇒ 无更新能力时如实拒收（ⓒ），不做「建一条新条目冒充回退」
    if (!cap) return applyNote('no-update-api');
    let list;
    try { list = await TH.getWorldbook(wbName); } catch (e) { return applyNote('read-failed'); }
    list = Array.isArray(list) ? list.slice() : [];
    const rows = parseEntries(list);
    const live = rows.filter(function (r) { return r.enabled; });
    const dead = rows.filter(function (r) { return !r.enabled; });
    if (!dead.length) return applyNote('no-previous');
    const cur = live.length ? live[live.length - 1] : null;
    const prev = dead[dead.length - 1];
    if (!String(prev.content || '').trim()) return applyNote('empty-body');
    const disabledNow = [];
    /**
     * 翻转一条条目的启用位，按**能力种类**分列（与 `apply` 同规）。
     *   · updateWorldbookWith —— 递改写函数，函数拿到**真数组**，原地改写即生效；
     *   · replaceWorldbook    —— 收的是**完整条目列表**，递函数进去等于递了个错类型。
     * 能力探测到了**不等于用法对**：这条分支必须自己走，否则在只有 replaceWorldbook
     * 的宿主上，撤销会以「调用成功」的样子什么也没改（本仓口径：「我调用过」≠「它变了」）。
     * @returns {Promise<string|null>} null = 成功，否则具名原因
     */
    async function flip(comment, enabled) {
      if (cap.kind === 'replaceWorldbook') {
        let now;
        try { now = await TH.getWorldbook(wbName); } catch (e) { return 'read-failed'; }
        const arr = Array.isArray(now) ? now.slice() : [];
        const t = indexOfEntry(arr, comment);
        if (t < 0) return 'entry-missing';
        arr[t] = Object.assign({}, arr[t], { enabled: enabled });
        try { await cap.fn(wbName, arr); } catch (e) { return 'update-failed'; }
        return null;
      }
      try { await cap.fn(wbName, function (arr) { const t = indexOfEntry(arr, comment); if (t >= 0) arr[t] = Object.assign({}, arr[t], { enabled: enabled }); return arr; }); }
      catch (e) { return 'update-failed'; }
      return null;
    }
    // 先禁当前生效的那条（若有），再启用上一版本；顺序固定，便于复查与失败定位
    if (cur) {
      const e1 = await flip(cur.comment, false);
      if (e1) return applyNote(e1);
      disabledNow.push(cur.comment);
    }
    const e2 = await flip(prev.comment, true);
    if (e2) return applyNote(e2);

    // ── 写后复查（同 ⓑ）：恢复的那条真启用了、内容还在、台面仍单一生效 ──
    let after;
    try { after = await TH.getWorldbook(wbName); } catch (e) { return applyNote('verify-failed'); }
    after = Array.isArray(after) ? after : [];
    const ri = indexOfEntry(after, prev.comment);
    const backOK = ri >= 0 && after[ri].enabled !== false && String(after[ri].content == null ? '' : after[ri].content) === String(prev.content || '');
    const disOK = disabledNow.every(function (c) { const k = indexOfEntry(after, c); return k >= 0 && after[k].enabled === false; });
    const liveAfter = after.filter(function (e) {
      const c = clean((e && e.comment) || (e && e.name), 60);
      if (!c) return false;
      if (c !== cfg.bookSuffix && !new RegExp('^' + cfg.bookSuffix + '(\\d+)$').test(c)) return false;
      return (e && e.enabled !== false);
    }).length;
    if (!backOK || !disOK || liveAfter > 1) return applyNote('verify-failed');

    stat.applied++; stat.verified++; stat.undone++;
    // 成功与 `apply` **同码**（`reason:'ok'`）：「这是一次撤销」记在 `mode` 上，
    //   不另起一个 `reason:'undo'` —— 成功值不是拒收码，混进拒收码账本只会让账变脏。
    stat.lastApply = { ok: true, reason: 'ok', mode: 'undo', book: wbName, restored: prev.comment, liveAfter: liveAfter, at: stat.applied };
    return { ok: true, reason: 'ok', mode: 'undo', book: wbName, restored: prev.comment,
      disabled: disabledNow, verified: true, liveAfter: liveAfter, singleLive: liveAfter <= 1 };
  }

  WA.outlineInject = {
    getSettings: settings, setSettings: saveSettings, view: view,
    plan: plan, extractFromEnd: extractFromEnd, parseEntries: parseEntries,
    // v2.231.0（OPT-7）：执行面唯一入口 + 能力探测（诊断面要看「这台宿主能不能改旧条目」）
    apply: apply, updateCapability: updateCapability,
    // v2.231.0（OPT-7）：预览差异（读真源、零写入）与撤销到上一有效版本（对称交换）
    preview: preview, undo: undo,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    MODES: MODES, MODE_LABEL: MODE_LABEL,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/outline-inject.js', { kind: 'engine', ver: '2.231.0' });
  if (WA.log) WA.log('info', 'outlineInject 已加载（2.231.0）');
})();