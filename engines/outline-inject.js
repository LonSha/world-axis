/**
 * WorldAxis engines/outline-inject.js (v2.230.0) — 大纲注入
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
 *   空拒收）；真正的世界书写入由调用方做，本模块只出**注入计划**。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · canon —— 「正史条目内容」，本模块不写它；
 *   · inject-budget —— 「够不够放」，本模块只出计划不算预算；
 *   · 本模块 —— **标签取尾 + 单一生效 + 覆盖/新建 + 位置属性 + 零直写**。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `plan` 一律 `disabled`。
 *   ② **标签取尾**：取**最后一次**闭合标签内的内容，之前的手稿不算。
 *   ③ **取不到就拒收**：无标签 / 无闭合 / 内容空 ⇒ 具名拒收，不整篇当大纲。
 *   ④ **台面单一生效**：`plan` 返回的动作里，**旧条目全部 disable:true**，
 *      生效的永远只有一条（不允许两份并存）。
 *   ⑤ **覆盖只顶最新的那份**：`overwrite` 命中的是**最新的生效条目**，
 *      不是 "第一条" 也不是 "全部"。
 *   ⑥ **新建必禁用旧**：`create` 时旧条目降级为禁用，序号顺延。
 *   ⑦ **注入位置是元信息**：本条永不改正文一字（`writes:0`）。
 *   ⑧ 不落盘、不跨会话、零宿主写入（`plan` 恒 `applied:0`）。
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

  const stat = { planned: 0, extracted: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
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
    if (!last) {
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
   * 只出计划，恒 `applied:0`（本模块不写任何宿主世界书）。
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
      semantics: '标签取尾 / 台面单一生效 / 覆盖或新建二选一 / 大纲是元信息不进正文' };
  }
  function resetStat() {
    stat.planned = 0; stat.extracted = 0; stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.outlineInject = {
    getSettings: settings, setSettings: saveSettings, view: view,
    plan: plan, extractFromEnd: extractFromEnd, parseEntries: parseEntries,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    MODES: MODES, MODE_LABEL: MODE_LABEL,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/outline-inject.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'outlineInject 已加载（2.230.0）');
})();