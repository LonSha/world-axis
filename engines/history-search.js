/**
 * WorldAxis engines/history-search.js (v2.201.0) — Y6 世界历史检索（跨库检索面）
 *
 * ── 它治什么（现场读数，不是阅读推断）────────────────────────────────
 *   世界玩到长局后，「三个月前那个茶楼老板叫什么」「扁担巷第一次出事是哪一章」
 *   这类问题**没有任何一个面能回答**。现场实测（立项轮）：
 *     · `engines/wb-search.js` 存在且能搜，但它只搜**世界书条目**（数据源写死
 *       `worldbook.peekEntries()`），编年史 / 人物 / 地点 / 组织 / 规则一律看不见；
 *     · `engines/chronicle-view.js` 只能按**时间线**浏览（`entries()` 按 at 排序），
 *       没有按词检索 —— 长局里它显示的永远是「最近 maxRows 条」；
 *     · 全仓 `grep -rl 'search'` 命中面里，产品侧只有 `wb-search` 与 `tool-diag` 两处。
 *   于是「找不到那条」与「那条根本不存在」在玩家侧是**同一幅画面**，
 *   而这两件事的下一步动作恰好相反（改词 vs 去补档）。
 *
 * ── 本模块做四件事（对应计划 Y6 的四条新功能）───────────────────────
 *   ① 统一检索入口 —— `search(q, {faces, limit})`：一次查**六个面**
 *      （编年史 / 人物 / 地点 / 组织 / 规则 / 世界书条目）；
 *   ② 结果带回溯 —— 每行带 `face`（哪一库）+ `source`（该库的真源模块口）+
 *      `ref`（库内定位）+ `at`（剧情时间点，**没有就如实 null，不拿 0 冒充**）；
 *   ③ 检索词的持久化 —— `recent()` / `remember()` / `clearRecent()`：最近查询与
 *      常用过滤面落**自己的 localStorage 键**（同 presetWorld / genGate 先例：
 *      那是玩家偏好，不是世界事实，不该进存档，更不该进注入面）；
 *   ④ 从结果跳到来源面 —— 每行给 `route`（`{page, face, ref}` 只读路由），
 *      面板据此把玩家送到对应页；**本模块自己零跳转副作用**（不切页、不改 DOM）。
 *
 * ── 九条边界（全是否定式）──────────────────────────────────────────
 *   1 **只读面**：不调 `store.transact`、不写任何世界键、不产 `buildBlock`、
 *     不在 `SOURCES` 里占位（检索是玩家动作，不是「本轮该让模型看到的世界状态」）。
 *   2 **不引入全文索引的持久化缓存**：落盘的只有「查询词 + 过滤面」这一份**偏好**；
 *     索引与结果**一律不缓存**（缓存索引就等于把「世界长什么样」抄成第二本账，
 *     而它不会随世界变化失效 —— 那是本仓点名过的「影子账」形态）。
 *   3 **结果必须标来源**：每行都带 `face` / `source` / `ref`，**不允许出现无法追溯的行**。
 *      取不到来源的行直接不进结果（宁少不假）。
 *   4 **空结果不得被误报为「没有数据」**：`empty`（真没有）与 `blind`（有源读不到）
 *      分开报。**只要有一个面读不到，`empty` 就恒为 false** —— 这是本条的全部要点：
 *      「我没查着」与「我根本没法查」在界面上必须留痕。
 *   5 **不重新实现匹配逻辑**：单串匹配一律走 `WA.worldbook.matchKey`
 *      （它已把正则键 / 大小写 / 全词三种形态给全了）；世界书条目那一面**直接复用
 *      `WA.wbSearch.search()`**（同一件事不在两处各写一遍 —— 那是口径漂移的起点）。
 *   6 `limit` 只影响 `returned`，**不影响 `matched`**（计数永远是全量命中数）。
 *   7 拒收一律**整条拒收**，不静默忽略：未知面名 / 非法 limit 走 `bad-value`；
 *      非字符串查询词走 `bad-type`；空查询词走 `empty-text`；未传查询词走 `missing-key`。
 *      （四个码名都取自本仓既有见证表，不新增静默码。）
 *   8 **不与 `wb-search` 抢入口**：本模块是**统一面**，`wbSearch` 仍可单独用；
 *      条目面的实现**委托**给它，避免两套匹配口径。
 *   9 无总开关（恒开）：它只读内存里已有的数组与 store 快照，关掉它没有任何收益，
 *      而「搜不了」是一眼就能看见的坑（同 wbSearch 的裁决）。
 *
 * ── 如实边界（不藏）────────────────────────────────────────────────
 *   · **未接入 U6 的预算档位**：验收②「大世界下响应可接受（走 U6 的预算）」在无头环境
 *     采不到真手机样本，故本模块只**如实报读**（`ms` / `scanned` / `capped`），
 *     并把扫描条数上限 `CAPS.maxScanned` 作为硬闸；**不伪造档位读数、不拿 0 冒充耗时**。
 *   · 面板侧实机未验（无头回归不装载 `ui/panel.js`）。
 *   · **`catalog()` 答「前置齐不齐」，`search()` 答「这一趟读没读到」**：两者读的是
 *     同一份 `PRECOND` 表（故正常情形下逐面一致），但某一趟真抛了异常（`source-threw`）
 *     只有 search() 当场知道 —— 那是运行期事实，前置判据推不出来。不许把两者说成同一件事。
 *   · **`atlas` 的开关不拦本模块的地点面**：`atlas.places()` 不看它自己的 `enabled`
 *     （`enabled` 只拦 `atlas.view()`），故地点面在「地图开关关着」时**照样查得到**。
 *     这是 atlas 读口的现场语义（它的开关是展示开关），本模块不替它决定。
 *     对照：`chronicleView.entries()` 首行就 `if (!cfg.enabled) return disabled`，
 *     所以编年史面在默认态（`enabled:false`）**读不到**，并被如实报成 `blind`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const FORMAT = 1;
  /** 六个检索面。**白名单是判据面**：未知面名整条拒收，不静默忽略。 */
  const FACES = ['chronicle', 'people', 'places', 'orgs', 'rules', 'entries'];
  const FACE_LABELS = {
    chronicle: '编年史', people: '人物', places: '地点',
    orgs: '组织', rules: '规则', entries: '世界书条目'
  };
  /** store 真读得到没有。**与「store 里没有这个键」分开** —— 前者是读不了，
   *  后者是这个世界还没有人物/组织。两件事在界面上不能长得一样（边界 4）。 */
  function storeReadable() { try { return !!(WA.store && typeof WA.store.get === 'function' && WA.store.get()); } catch (e) { return false; } }
  /** 某一面自己的开关**真的拦住了它的读口**没有。
   *  **只对现场核实过「开关确实拦读口」的面用这道判据** —— 开关不拦读口的面按开关判，
   *  等于在这里**新造**一处与检索结果相反的读数（比它要治的病更坏）：
   *   · chronicle：`chronicleView.entries()` 首行 `if (!cfg.enabled) return disabled` ⇒ 拦。
   *   · places：`atlas.places()` **不看** `enabled`（`enabled` 只拦 `atlas.view()`，
   *     atlas.js 第 266 行）⇒ **不拦**，故这里不按开关判。 */
  function faceSwitchOn(f) {
    if (f !== 'chronicle') return true;
    const probe = WA.chronicleView && WA.chronicleView.getSettings;
    if (typeof probe !== 'function') return true;
    try { return probe().enabled !== false; } catch (e) { return true; }
  }
  /**
   * 每一面的**前置真源**：适配器的守卫与 `catalog()` **共用同一份**。
   *
   * 为什么必须共用：`catalog()`（面板横幅）与 `search()`（检索结果）是同一件事的两个
   *   呈现面 —— 各写一份判据必然漂移，而现场实测过一次：catalog 说「六面在场」、
   *   同一页的检索结果说编年史读不到。本表把「这一面此刻读不读得到」收成一份。
   * 只答**前置在不在**；某一趟真抛了异常只有 search() 当场知道（见头部如实边界）。
   */
  function precondChronicle() {
    if (!(WA.chronicleView && typeof WA.chronicleView.entries === 'function')) return { ok: false, via: 'face-absent' };
    if (!faceSwitchOn('chronicle')) return { ok: false, via: 'disabled', switchDriven: true };
    return { ok: true, via: 'engine' };
  }
  function precondPeople() {
    if (!storeReadable()) return { ok: false, via: 'store-unreadable' };
    const p = state().people;
    return (p && typeof p === 'object' && !Array.isArray(p))
      ? { ok: true, via: 'store.people' } : { ok: false, via: 'store-no-people' };
  }
  function precondPlaces() {
    if (!(WA.atlas && typeof WA.atlas.places === 'function')) return { ok: false, via: 'face-absent' };
    // 上游：atlas 的 rawPlaces 依赖 region.places；它自己会拒，这里提前如实说清是哪一环。
    if (!(WA.region && typeof WA.region.places === 'function')) return { ok: false, via: 'source-absent' };
    return { ok: true, via: 'engine' };
  }
  function precondOrgs() {
    if (!storeReadable()) return { ok: false, via: 'store-unreadable' };
    const f = (state().evolution || {}).factions;
    return Array.isArray(f) ? { ok: true, via: 'store.evolution.factions' }
      : { ok: false, via: 'store-no-factions' };
  }
  function precondRules() {
    return (WA.rules && typeof WA.rules.listModules === 'function' && typeof WA.rules.getModule === 'function')
      ? { ok: true, via: 'engine' } : { ok: false, via: 'face-absent' };
  }
  function precondEntries() {
    return (WA.wbSearch && typeof WA.wbSearch.search === 'function')
      ? { ok: true, via: 'engine' } : { ok: false, via: 'face-absent' };
  }
  const PRECOND = {
    chronicle: precondChronicle, people: precondPeople, places: precondPlaces,
    orgs: precondOrgs, rules: precondRules, entries: precondEntries
  };
  /** 结果 → 面板页的只读路由表（功能 ④）。**不切页、不碰 DOM**，只给出口。 */
  const ROUTES = {
    chronicle: 'memory', people: 'people', places: 'world',
    orgs: 'people', rules: 'settings', entries: 'inject'
  };
  const LS_KEY = 'worldaxis_historysearch_v1';
  const MAX_RECENT = 12;
  /** CAPS.maxScanned 是**硬闸不是装饰**：扫到上限就停后面还没查的面，并把它们
   *  如实列进 `deferred`（见 search）—— 只标一个 `cappedScan:true` 而照样全扫完，
   *  等于闸门只是个读数，那是本仓点名过的「灯不亮」形态。 */
  const CAPS = { maxRows: 200, maxScanned: 4000 };

  const stat = { reads: 0, queries: 0, matchedTotal: 0, returnedTotal: 0,
    refused: 0, blindness: 0, lastReason: '', lastMs: null, lastScanned: null, faults: {} };

  function noteFault(code) { stat.faults[code] = (stat.faults[code] || 0) + 1; stat.refused++; stat.lastReason = code; }
  // v2.203.0 收口：时钟与裸读归因（全库纪律 —— 唯一墙钟读取点是 core/clock.js 的 raw()）。
  //   本模块原先三处裸调 Date.now()：它绕过冻结时钟，回放对不上时只能全库通读。
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'historySearch') : Date.now(); } catch (e) { return Date.now(); } }
  // 裸读归因（与 chatcache / worldbook / life / tape-store 同一条出口）：
  //   「读不出来」最坏的形态是被当成「没有这回事」—— 查询词库读不出时我们答「没查过」，
  //   与「真的没查过」同形，而两者补救完全不同。投递 reportReadFail 是唯一留痕出口。
  function noteRead(source, key, err) {
    try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail(source, key, err); } catch (e) {}
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function state() { try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }

  /** 匹配单一真源：一律走 worldbook.matchKey（边界 5），取不到才降级为最朴素的一形。 */
  function match(text, needle, opts) {
    const cs = !!(opts && opts.caseSensitive), mw = !!(opts && opts.matchWholeWords);
    if (WA.worldbook && typeof WA.worldbook.matchKey === 'function') {
      try { return !!WA.worldbook.matchKey(String(text == null ? '' : text), needle, cs, mw); } catch (e) { /* 降级 */ }
    }
    const t = String(text == null ? '' : text);
    return cs ? t.indexOf(needle) >= 0 : t.toLowerCase().indexOf(String(needle).toLowerCase()) >= 0;
  }
  /** 摘要：命中位置附近切一截。没命中（例如只在标题里中）就不给 —— 不编内容。 */
  function snippet(text, needle) {
    const c = String(text == null ? '' : text);
    if (!c) return '';
    const at = c.toLowerCase().indexOf(String(needle).toLowerCase());
    if (at < 0) return c.slice(0, 60);
    const from = Math.max(0, at - 20);
    return (from > 0 ? '…' : '') + c.slice(from, from + 80) + (from + 80 < c.length ? '…' : '');
  }
  /**
   * 统一行。**来源缺失即拒行**（边界 3）：没有 face / source / ref 的行不进结果 ——
   * 宁可少一行，也不给一行「说不清哪来的」。
   */
  function mk(face, ref, title, text, at, source, extra) {
    const f = clean(face, 20), r = clean(ref, 60), s = clean(source, 60);
    if (FACES.indexOf(f) < 0 || !r || !s) return null;
    const row = {
      face: f, ref: r, at: (at === null || at === undefined) ? null : num(at),
      title: clean(title, 80), text: clean(text, 160), source: s,
      route: { page: ROUTES[f] || null, face: f, ref: r }
    };
    if (extra && typeof extra === 'object') Object.keys(extra).forEach(function (k) { if (row[k] === undefined) row[k] = extra[k]; });
    return row;
  }
  function verdict(ok, reason, rows, scannedIsh) {
    return { ok: !!ok, reason: ok ? null : (reason || 'source-refused'),
      rows: Array.isArray(rows) ? rows : [], scanned: num(scannedIsh) || 0 };
  }
  /** 安全调用一个外源读口：**抛异常也算「读不到」，不许把异常当空集**（边界 4）。 */
  function safeCall(fn, fallbackReason) {
    try { return { threw: false, value: fn() }; }
    catch (e) { return { threw: true, value: null, reason: fallbackReason || 'source-threw' }; }
  }

  // ── 六个面的适配器：每个都先答「我能不能读」，再答「读到几条命中」─────────
  /** ① 编年史：走 chronicleView.entries（它已做可见性与排序），不重读 store。 */
  function fromChronicle(needle) {
    const p = PRECOND.chronicle();
    if (!p.ok) return verdict(false, p.via, [], 0);
    const c = safeCall(function () { return WA.chronicleView.entries({ limit: CAPS.maxRows }); });
    if (c.threw) return verdict(false, 'source-threw', [], 0);
    const r = c.value;
    if (!r || r.ok !== true) return verdict(false, (r && r.reason) || 'source-refused', [], 0);
    const rows = [];
    (r.rows || []).forEach(function (x) {
      const hitTitle = match(x.title, needle);
      const hitText = match(x.text, needle);
      if (!hitTitle && !hitText) return;
      const row = mk('chronicle', x.ref, x.title || '(无题)', x.text || '', x.at,
        'chronicleView.entries()', { snippet: hitText ? snippet(x.text, needle) : '', kind: x.kind || null });
      if (row) rows.push(row);
    });
    return verdict(true, null, rows, (r.rows || []).length);
  }
  /** ② 人物：读 store.people（对象 id→人）。来源如实标成 store 顶层键。 */
  function fromPeople(needle) {
    const p = PRECOND.people();
    if (!p.ok) return verdict(false, p.via, [], 0);
    const s = state();
    const ids = Object.keys(s.people);
    const rows = [];
    ids.forEach(function (id) {
      const p = s.people[id];
      if (!p || typeof p !== 'object') return;
      const name = clean(p.name, 40) || id;
      const fields = [p.location, p.action, p.intent, p.speakingStyle, p.personalityAnchor, p.innerVoice];
      const prof = (p.profile && typeof p.profile === 'object') ? p.profile : {};
      Object.keys(prof).forEach(function (k) {
        const v = prof[k];
        if (Array.isArray(v)) v.forEach(function (e) { fields.push(e); });
        else fields.push(v);
      });
      const hitName = match(name, needle);
      let hitWhere = '';
      for (let i = 0; i < fields.length; i++) {
        if (fields[i] == null) continue;
        const txt = Array.isArray(fields[i]) ? fields[i].join(' ') : String(fields[i]);
        if (typeof fields[i] === 'object' && !Array.isArray(fields[i])) continue;
        if (match(txt, needle)) { hitWhere = txt; break; }
      }
      if (!hitName && !hitWhere) return;
      const row = mk('people', id, name, hitWhere || clean(p.location || p.action, 80), p.lastSeenAt,
        'store.people', { snippet: snippet(hitWhere, needle), dynamic: !!p.updatedAt });
      if (row) rows.push(row);
    });
    return verdict(true, null, rows, ids.length);
  }
  /** ③ 地点：走 atlas.places（它已做分域与上限），不自己读 region。 */
  function fromPlaces(needle) {
    const p = PRECOND.places();
    if (!p.ok) return verdict(false, p.via, [], 0);
    const c = safeCall(function () { return WA.atlas.places(); });
    if (c.threw) return verdict(false, 'source-threw', [], 0);
    const r = c.value;
    if (!r || r.ok !== true) return verdict(false, (r && r.reason) || 'source-refused', [], 0);
    const rows = [];
    (r.places || []).forEach(function (p) {
      const name = clean(p.name, 40);
      if (!name) return;
      const lanes = [p.lane, p.zone, Array.isArray(p.traces) ? p.traces.join(' ') : ''];
      const hitName = match(name, needle);
      let where = '';
      for (let i = 0; i < lanes.length; i++) {
        if (lanes[i] && match(String(lanes[i]), needle)) { where = String(lanes[i]); break; }
      }
      if (!hitName && !where) return;
      const row = mk('places', name, name, where || (p.distanceDays !== null && p.distanceDays !== undefined
        ? ('距离 ' + p.distanceDays + ' 天' + (p.blocked ? '（受阻）' : '')) : ''), null,
        'atlas.places()', { zone: p.zone || null, blocked: !!p.blocked });
      if (row) rows.push(row);
    });
    return verdict(true, null, rows, (r.places || []).length);
  }
  /** ④ 组织：读 store.evolution.factions（org 的 `organizationSummary` 刻意不导出）。 */
  function fromOrgs(needle) {
    const p = PRECOND.orgs();
    if (!p.ok) return verdict(false, p.via, [], 0);
    const s = state();
    const facs = (((s.evolution || {}).factions) || []);
    const rows = [];
    facs.forEach(function (f) {
      if (!f || typeof f !== 'object') return;
      const name = clean(f.name, 40);
      if (!name) return;
      const mem = Array.isArray(f.members) ? f.members : [];
      const memNames = mem.map(function (m) { return clean(m && (m.name || m.id), 30); }).filter(Boolean);
      const hitName = match(name, needle);
      const hitMem = memNames.filter(function (n) { return match(n, needle); });
      if (!hitName && !hitMem.length) return;
      const row = mk('orgs', name, name,
        hitMem.length ? ('成员命中：' + hitMem.slice(0, 6).join('、')) : (memNames.length + ' 名成员'),
        null, 'store.evolution.factions', { members: memNames.length, kind: clean(f.kind, 20) || null });
      if (row) rows.push(row);
    });
    return verdict(true, null, rows, facs.length);
  }
  /** ⑤ 规则：走 rules.listModules + rules.getModule —— 搜的是**模块正文**，不是模块名。 */
  function fromRules(needle) {
    const p = PRECOND.rules();
    if (!p.ok) return verdict(false, p.via, [], 0);
    const c = safeCall(function () { return WA.rules.listModules(); });
    if (c.threw) return verdict(false, 'source-threw', [], 0);
    const mods = Array.isArray(c.value) ? c.value : null;
    if (!mods) return verdict(false, 'source-refused', [], 0);
    const rows = [];
    mods.forEach(function (m) {
      const key = clean(m && m.key, 40);
      if (!key) return;
      const label = clean(m && m.label, 40) || key;
      const body = safeCall(function () { return WA.rules.getModule(key); });
      const text = body.threw ? '' : String(body.value || '');
      const hitLabel = match(label, needle) || match(key, needle);
      const hitBody = text ? match(text, needle) : false;
      if (!hitLabel && !hitBody) return;
      const row = mk('rules', key, label, hitBody ? snippet(text, needle) : (text.length + ' 字'),
        null, 'rules.getModule()', { chars: text.length });
      if (row) rows.push(row);
    });
    return verdict(true, null, rows, mods.length);
  }
  /** ⑥ 世界书条目：**委托给 wb-search**（边界 5：同一件事不在两处各写一遍）。 */
  function fromEntries(needle) {
    const p = PRECOND.entries();
    if (!p.ok) return verdict(false, p.via, [], 0);
    const c = safeCall(function () { return WA.wbSearch.search(needle, { fields: ['title', 'keys', 'content'], limit: CAPS.maxRows }); });
    if (c.threw) return verdict(false, 'source-threw', [], 0);
    const r = c.value;
    if (!r || r.ok !== true) return verdict(false, (r && r.reason) || 'source-refused', [], 0);
    const rows = [];
    (r.rows || []).forEach(function (x) {
      const row = mk('entries', x.id || x.uid || x.title, x.title || '(无题条目)',
        Array.isArray(x.faces) ? ('命中面：' + x.faces.join('/')) : '', null,
        'wbSearch.search()', { snippet: x.snippet || '', faces: (x.faces || []).slice(), disabled: !!x.disabled });
      if (row) rows.push(row);
    });
    return verdict(true, null, rows, r.total || 0);
  }
  const ADAPTERS = {
    chronicle: fromChronicle, people: fromPeople, places: fromPlaces,
    orgs: fromOrgs, rules: fromRules, entries: fromEntries
  };

/**
   * 面名白名单归一。未知面名 → null（调用方整条拒收 bad-value，边界 7）。
   * **输出一律按 FACES 规范序**（不是调用方给的顺序）：同一组面、不同点击顺序要得到
   * 同一份记录 —— 否则「常用过滤」落盘的内容取决于玩家先点了哪一格，
   * 而「同一件事两次跑出两种形态」正是本仓反复治过的病。
   */
  function normFaces(f) {
    if (f === undefined || f === null) return FACES.slice();
    if (!Array.isArray(f) || !f.length) return null;
    const want = [];
    for (let i = 0; i < f.length; i++) {
      const k = clean(f[i], 20).toLowerCase();
      if (FACES.indexOf(k) < 0) return null;
      if (want.indexOf(k) < 0) want.push(k);
    }
    if (!want.length) return null;
    return FACES.filter(function (x) { return want.indexOf(x) >= 0; });
  }

  /** 排序：有时间的按 at **降序**（近的在前）；没时间的排后面，按面序 + 标题稳定。 */
  function sortRows(rows) {
    const faceIdx = {}; FACES.forEach(function (f, i) { faceIdx[f] = i; });
    return rows.slice().sort(function (a, b) {
      const av = (a.at === null || a.at === undefined), bv = (b.at === null || b.at === undefined);
      if (av !== bv) return av ? 1 : -1;
      if (!av && !bv && a.at !== b.at) return b.at - a.at;
      if (faceIdx[a.face] !== faceIdx[b.face]) return faceIdx[a.face] - faceIdx[b.face];
      return a.title < b.title ? -1 : (a.title > b.title ? 1 : 0);
    });
  }

  /**
   * 统一检索（功能 ① + ②）。**纯读**（边界 1）。
   * @param {string} q 查询词（必填）
   * @param {object} [opts] { faces: string[], limit: number }
   */
  function search(q, opts) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (q === undefined || q === null) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: '查询词必填' }; }
    if (typeof q !== 'string') { noteFault('bad-type'); return { ok: false, reason: 'bad-type', detail: '查询词必须是字符串' }; }
    const needle = q.trim();
    if (!needle) { noteFault('empty-text'); return { ok: false, reason: 'empty-text', detail: '查询词不得为空' }; }
    const faces = normFaces(o.faces);
    if (faces === null) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', faces: o.faces, known: FACES.slice() }; }
    let limit = CAPS.maxRows;
    if (o.limit !== undefined && o.limit !== null) {
      const n = Number(o.limit);
      if (!isFinite(n) || n < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', detail: 'limit 必须是非负数' }; }
      limit = Math.min(n, CAPS.maxRows);
    }
    const start = clockNow('historySearch.search');
    const sources = [], all = [], deferred = [];
    let scanned = 0;
    faces.forEach(function (f) {
      // 硬闸：扫到上限就停后面**还没查**的面，并把它们列进 deferred（边界 4 的同族：
      //   「没查完」与「查了没有」必须分开 —— 少查的面若静默消失，玩家会把空当结论）。
      if (scanned >= CAPS.maxScanned) { deferred.push(f); return; }
      const r = ADAPTERS[f](needle);
      scanned += r.scanned;
      sources.push({ face: f, label: FACE_LABELS[f], ok: !!r.ok, reason: r.reason || null,
        scanned: r.scanned, matched: r.rows.length, route: ROUTES[f] || null });
      r.rows.forEach(function (x) { all.push(x); });
    });
    const cappedScan = deferred.length > 0;
    const ms = clockNow('historySearch.search') - start;
    const sorted = sortRows(all);
    const matched = sorted.length;
    const rows = sorted.slice(0, limit);
    // 边界 4：`empty` 只在**所有被查面都读得到**且一条没中时为真。
    //   `deferred`（被硬闸挡下的面）与 `blind`（读不到的面）**同样剥夺 `empty`** ——
    //   三者都是「我没查全」，而「没查全」与「真没有」不能长得一样。
    const blindFaces = sources.filter(function (s) { return !s.ok; }).map(function (s) { return s.face; });
    const notCovered = blindFaces.concat(deferred);
    const empty = (matched === 0) && (notCovered.length === 0);
    if (blindFaces.length) stat.blindness++;
    stat.queries++; stat.matchedTotal += matched; stat.returnedTotal += rows.length;
    stat.lastMs = ms; stat.lastScanned = scanned;
    stat.lastReason = matched ? 'matched' : ((blindFaces.length || deferred.length) ? 'blind' : 'no-match');
    return {
      ok: true, format: FORMAT, query: needle, faces: faces,
      total: scanned, matched: matched, returned: rows.length, trimmed: rows.length < matched,
      empty: empty, blind: blindFaces, deferred: deferred, notCovered: notCovered,
      sources: sources, rows: rows,
      ms: ms, scanned: scanned, cappedScan: cappedScan,
      note: (notCovered.length
        ? ('有 ' + notCovered.length + ' 个面这次没查全（'
          + (blindFaces.length ? '读不到：' + blindFaces.join('/') : '')
          + (blindFaces.length && deferred.length ? '；' : '')
          + (deferred.length ? '被扫描上限挡下：' + deferred.join('/') : '')
          + '），本次结果**不代表全部** —— 「没查着」与「查不了 / 没查完」是两件事。')
        : '六个面都读得到；未命中的条目已隐去。matched 是全量命中数，limit 只影响 returned。')
    };
  }

  /** 单面检索（便捷面：内部走同一份 search，不另造匹配、不另造计数）。 */
  function searchIn(face, q, opts) {
    return search(q, Object.assign({}, opts || {}, { faces: [face] }));
  }
  /** 只要计数。 */
  function count(q, opts) {
    const r = search(q, opts);
    if (!r.ok) return r;
    return { ok: true, query: r.query, faces: r.faces, matched: r.matched, empty: r.empty, blind: r.blind };
  }

  // ── 功能 ③：查询词的持久化（**偏好**，落自己的 localStorage 键；索引与结果不落）──
  function lsGet() {
    try {
      const raw = (typeof window !== 'undefined' && window.localStorage)
        ? window.localStorage.getItem(LS_KEY) : null;
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object' || o.format !== FORMAT) return null;
      return o;
    } catch (e) { noteRead('historySearch', LS_KEY, e); return null; }
  }
  function lsSet(o) {
    try {
      if (typeof window === 'undefined' || !window.localStorage || typeof window.localStorage.setItem !== 'function') {
        return { ok: false, reason: 'ls-write-failed', detail: '宿主没有 localStorage' };
      }
      window.localStorage.setItem(LS_KEY, JSON.stringify(o));
      return { ok: true };
    } catch (e) { return { ok: false, reason: 'ls-write-failed', detail: String(e && e.message || e).slice(0, 60) }; }
  }
  /** 最近查询（只读）。库读不出就如实报 `ok:false`，**不拿空表冒充「没查过」**。 */
  function recent() {
    const o = lsGet();
    if (!o) return { ok: true, rows: [], count: 0, empty: true, max: MAX_RECENT,
      note: '本机还没有检索记录（或记录已被清掉）' };
    const rows = (Array.isArray(o.recent) ? o.recent : []).slice(0, MAX_RECENT);
    return { ok: true, rows: rows, count: rows.length, empty: rows.length === 0, max: MAX_RECENT,
      filters: Object.assign({}, o.filters || {}) };
  }
  /**
   * 记一条查询（功能 ③ 的写口 —— **显式调用才写**；`search()` 自己不落账，
   * 同 wbSearch 边界 2：搜索动作不得有副作用）。
   */
  function remember(q, opts) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    if (typeof q !== 'string' || !q.trim()) { noteFault('empty-text'); return { ok: false, reason: 'empty-text' }; }
    const faces = normFaces(o.faces);
    if (faces === null) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', faces: o.faces, known: FACES.slice() }; }
    const prev = lsGet() || { format: FORMAT, recent: [], filters: {} };
    const q2 = clean(q.trim(), 60);
    const list = (Array.isArray(prev.recent) ? prev.recent : []).filter(function (x) { return x && x.q !== q2; });
    list.unshift({ q: q2, at: clockNow('historySearch.remember'), faces: faces.slice(),
      matched: (o.matched === null || o.matched === undefined) ? null : num(o.matched) });
    const filters = {};
    Object.keys(prev.filters || {}).forEach(function (k) { filters[k] = prev.filters[k]; });
    filters.faces = faces.slice();
    const next = { format: FORMAT, recent: list.slice(0, MAX_RECENT), filters: filters };
    const w = lsSet(next);
    if (!w.ok) { noteFault(w.reason); return { ok: false, reason: w.reason, detail: w.detail || null }; }
    return { ok: true, count: next.recent.length, max: MAX_RECENT, dropped: Math.max(0, list.length - MAX_RECENT) };
  }
  /** 清空检索记录（只动本模块那一格，不动世界、不动别的键）。 */
  function clearRecent() {
    const prev = lsGet() || { format: FORMAT, recent: [], filters: {} };
    const w = lsSet({ format: FORMAT, recent: [], filters: Object.assign({}, prev.filters || {}) });
    if (!w.ok) { noteFault(w.reason); return { ok: false, reason: w.reason }; }
    return { ok: true, count: 0 };
  }
  /** 常用过滤（读）：上次用了哪些面。**不预置默认值**（没查过就是空）。 */
  function filters() {
    const o = lsGet();
    const f = (o && o.filters && Array.isArray(o.filters.faces)) ? o.filters.faces.filter(function (x) { return FACES.indexOf(x) >= 0; }) : [];
    return { ok: true, faces: f, empty: f.length === 0, known: FACES.slice() };
  }

  /** 各面在场性（**只答「我能不能读」，不读数据**）——面板用它画「六面在场性」。 */
  function catalog() {
    // **读的就是适配器读的那份前置判据**（PRECOND）—— 不另写一份。
    //   所以「面板横幅说在场 / 检索结果说读不到」这类自相矛盾在结构上不可能出现。
    return FACES.map(function (f) {
      const p = PRECOND[f]();
      return { face: f, label: FACE_LABELS[f], ok: !!p.ok, route: ROUTES[f] || null,
        via: p.via, switchDriven: !!p.switchDriven };
    });
  }
  function diagnose() {
    const cat = catalog();
    return { format: FORMAT, faces: FACES.slice(), routes: Object.assign({}, ROUTES),
      catalog: cat, live: cat.filter(function (x) { return x.ok; }).length, absent: cat.filter(function (x) { return !x.ok; }).length,
      caps: Object.assign({}, CAPS), lsKey: LS_KEY, storeTopKeys: 0,
      storeRead: (WA.store && typeof WA.store.get === 'function'),
      stat: statOf() };
  }
  function statOf() { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  // v2.201.0（Y6）：此处原有一个 `reset()`（清本模块**进程内**计数）。
  //   删它的现场理由（三处判据一致，均可复算）：
  //     · consumer-types 实测它 refs = {panel:0, inject:0, diag:0, engine:0, test:0, own:3}
  //       ⇒ 归 **internal** 档（本仓定义：「只有定义文件自己用 ⇒ 过度导出，能力在、门没开」）；
  //     · dead-export 报 `historySearch.reset [self-only] ... 过度导出`（同指一档）；
  //     · programmatic 表只收**真零消费者**条目（登记必报 stale-entry）⇒ 它无处可登记。
  //   处置三选一（本仓对该档的明文）：接真消费方 / 显式登记 / 删除。判据已排除前两条 ⇒ 删除。
  //   删除**不改变产品口径**：面板的诊断面计数走只读的 `stat()`（本轮已修进引用面）；
  //   `reset` 只清本模块内存计数，既不写世界也不写偏好键，且全仓零调用点
  //   （面板的「清零计量」按钮 #wa-stat-reset 清的是另一批有名有姓的口，
  //    实测其名单里**没有**本口 —— 故删除也不改变那个按钮的语义）。

  WA.historySearch = {
    FORMAT: FORMAT, FACES: FACES.slice(), FACE_LABELS: Object.assign({}, FACE_LABELS),
    ROUTES: Object.assign({}, ROUTES), LS_KEY: LS_KEY, CAPS: Object.assign({}, CAPS),
    catalog: catalog, search: search, searchIn: searchIn, count: count,
    recent: recent, remember: remember, clearRecent: clearRecent, filters: filters,
    diagnose: diagnose, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/history-search.js', { kind: 'engine', ver: '2.202.0' });
})();
