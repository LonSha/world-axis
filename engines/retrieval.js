/**
 * WorldAxis engines/retrieval.js (v2.228.0) — 历史留存与检索（第四代拓展 N10）
 *
 * ── 它治什么（缺口，先用源码说清）──────────────────────────────────
 *   本仓的历史沉积已经很厚（`chronicle` / `causal.chains` / `memory.facts` /
 *   `engines/entities.js` / `engines/history-search.js`），但**没有任何一处把
 *   「该把哪一段历史拿回模型眼前」这件事当成一个面**。现场实测：
 *     · `engines/history-search.js`（v2.201.0）能按词跨库检索，但**零自动调用**
 *       （`grep -rn 'historySearch' engines/` 在产品注入链上零命中）；
 *     · `engines/causal.js` 有因果闭包（`traceGraph` / `knownCause`），但只服务**结算**；
 *     · `render/inject.js` 的 46 处引擎源**没有一处**从「本轮输入 / 候选正文」反查历史。
 *   后果是一类结构性盲区：**被提到过的旧事、以及「效果后来被反转的事」，进不了模型眼前**。
 *   最典型的一条（三个独立上游都点名治它）：**效果反转不等于没发生过**。
 *   实测本仓 `engines/memory.js` 的 `upsertFact` 早已把旧值标成 `active:false` 并**保留**
 *   （`version` 自增、`reason:'superseded@'+时间戳`）——数据一直在账上，
 *   但唯一的读口 `buildMemoryBlock()` 是 `filter(f => f.active)`，**把失效版本丢掉了**。
 *   于是「那把钥匙早就还了，所以我没偷过」在模型那里成立，而事实是**偷过、也还了**。
 *
 * ── 缝合来源（逐条可核）──────────────────────────────────────────
 *   ① Canon Engine（TaihouKai/SillyTavern-CanonEngine）`docs/WORLD_STATE_CONTEXT_CONTRACT.md`
 *      第 1 节的 **OR 规则**（原文）：「An actual past event must be retrieved into the GM's
 *      reasoning context when it is causally relevant OR directly/indirectly mentioned.
 *      Either condition suffices.」并且**明列两条不许**：不许要求两者同时成立、
 *      不许要求它与硬锚点有关。第 7 节给了**预算口径**：必需检索项**不得**因预算被静默丢弃，
 *      先压紧、压不下就**显式报容量错误**。
 *   ② st-theater（koichole213-ui/st-theater）`DREAM_MEMORY_V2_SPEC.md` 的 `states` 层：
 *      「当前值改变时，旧值及其来源进入该槽位的 `history`」——与本仓 `facts` 的 `version`
 *      版本链是同一件事，本模块把那半截读口补上。
 *   ③ titania-theater 5.8.0「故事记忆：…旧事召回」——同一条诉求的第三次出现。
 *      三处独立来源指向同一缺口，故本版立此一面。
 *
 * ── 本模块只做五件事，一次判定都不复制 ─────────────────────────────
 *   1 `contracts()`      —— **只读**核验三条检索边（causal / mentioned / scene）当前是否在场，
 *      逐边给 `present` / `source` / `why`。**按 `TRIGGERS` 逐边建**（不硬写三段），
 *      于是那个封闭集合本身就是单一真源。
 *   2 `candidates(input)`—— 三集合候选：**因果**（已知原因 → 链）/ **提及**（输入里的词与
 *      指代 → 事实、编年史、条目）/ **场景**（在场人物的约束）。逐条带 `trigger` 标签。
 *   3 `historyOf(key)`   —— **效果反转后事件仍可检索**（本版核心）：读 `memory.facts` 的
 *      **全版本链**（含 `active:false`），把「当前值」与「曾被替换的值」**分列**返回。
 *   4 `assemble(cands)`  —— 组装**有界紧凑包**（`maxRows` / `maxChars`）；超限先压紧、
 *      压不下就**显式报 capacity**，绝不静默丢已命中的必需项。
 *   5 `audit()`          —— **四类看门**：`absent`（源缺席）/ `stale`（超窗）/
 *      `unranked`（注入源未登记）/ `empty-lookup`（查无结果）——**逐类如实报**。
 *
 * ── 四条硬口径（全是否定式，每条都是「换个写法就会撒谎」的那种）──────
 *   1 **OR 而非 AND**。因果相关 **或** 被提及，**任一成立**即须入包。不许要求两者同时成立，
 *      不许要求它与硬锚点有关，不许以「最近」或「玩家看得见」为由筛掉。判据 A1 / A2 咬这一点。
 *   2 **反转不等于没发生**。`active:false` 的版本必须可检索，且与当前值**分列**：
 *      「现在钥匙在谁手里」与「这把钥匙曾被偷过」是两问，答了前者**不能**替答后者。
 *      判据 A3 / A4 咬这一点。
 *   3 **缺数据 ≠ 常态**。查无结果**显式**标 `absent`，不得当成「一切正常 / 没发生过」。
 *      判据 A5 咬这一点。
 *   4 **有界不静默**。超预算先压紧（压紧仍保留每一行的事实），压不下**显式报 capacity**；
 *      「被预算丢掉」与「本来就没有」在读数上必须分得开。判据 A6 咬这一点。
 *
 * ── 边界（如实登记）────────────────────────────────────────────
 *   · **不新增世界顶层键**：本模块只读既有容器（`memory.facts` / `chronicle` /
 *     `causal.chains` / `people`），产物是**进程态**候选与包（不进存档）。
 *   · **不另立一份真源**：原因是否已知走 `causal.knownCause`；条目检索走
 *     `historySearch.search`；编年史走 `chrono.chronicle`。本模块只**编排**，不复制判据。
 *   · **不改对端**：`memory.js` 只**新增一个只读口**（`historyOf`），既有读口行为不变。
 *   · **默认休眠**：`enabled:false` 时不产包、不注入。
 *
 * ── v2.231.0（OPT-1 增补）：让模型**想起旧事**，而非只看见新状态 ──────────
 *   首版（v2.228.0）把三边候选、全版本链读口、四类看门都立起来了，但**产品出口**
 *   仍停在「报数不报内容」：事实行只写「此槽位曾有 N 次替换，历史可查」，旧值正文
 *   （如「偷走钥匙」）**不进包**；默认时间窗把超窗命中整批滤掉，于是「数月前为何
 *   偷钥匙」在结构上不可见；`assemble` 只按时间排序，命中更强的行反而可能被行数
 *   上限挤掉。四条增补口径（每条都是否定式）：
 *     A **旧值正文必须进包**：事实行携带被替换的旧值原文与替换次数，并另给
 *       `oldValues` 结构化字段。只报「有 N 次替换」等于把答案指向一处模型看不见的地方。
 *     B **回忆意图允许越窗**：输入含回忆词（当初/那次/为何/后来…）时，超窗命中
 *       **保留**并标 `recalled:true`。越窗只影响保留与排序，**不改** `staleDropped` /
 *       `staleKeys` 的如实计数（看门仍按原样报「这批超窗了」）。
 *     C **排序先看命中强度**：被召回优先 → 命中 token 长度（越具体越靠前）→ 时间。
 *       只按时间排 = 让「最近」冒充「最相关」。
 *     D **当前值与历史分列**：包内同一槽位给两行（当前值 / 历史），当前值**不替代**历史。
 *       两行同受预算约束（压紧时一起裁），不是「历史行免费」。
 *   读数面同步：`candidates` 出 `recall` / `recalled`，`assemble` 出 `split` / `splitKey`，
 *   `stat` 出 `recalled` / `split` 计数与 `recallHints` / `recalledRows` / `splitPacks`。
 *   边界（如实登记）：**谁有权知道哪一版**不在本模块 —— 那是 noesis / redact 的面，
 *   本模块只负责「把该召回的那一段拿回眼前」，不复制权限判定。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.228.0';
  const LS_KEY = 'worldaxis_retrieval_v1';
  const DEF = { enabled: false, windowMs: 30 * 24 * 60 * 60 * 1000, maxRows: 24, maxChars: 6000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'retrieval',
    bounds: { windowMs: [60 * 1000, 365 * 24 * 60 * 60 * 1000], maxRows: [4, 200], maxChars: [500, 40000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  function txt(v) { return (v === undefined || v === null) ? '' : String(v); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  /** 三条检索边的**封闭集合**（唯一枚举真源；contracts/audit 一律按它逐边建）。 */
  const TRIGGERS = ['causal', 'mentioned', 'scene'];
  const TRIGGER_DUTY = {
    causal: '因果相关（原因 → 链闭包）',
    mentioned: '被直接/间接提及（词与指代 → 事实、编年史、条目）',
    scene: '场景实体约束（在场人物与其当前约束）'
  };
  /** 四类看门（封闭集合；audit 逐类报，不合并成一态）。 */
  const GUARDS = ['absent', 'stale', 'unranked', 'empty-lookup'];
  const GUARD_LABEL = {
    absent: '检索源缺席',
    stale: '命中项超窗（陈旧）',
    unranked: '注入源未登记优先级',
    'empty-lookup': '查无结果（≠ 没发生过）'
  };
  /** 本模块在 inject-budget 里的**注入源显示名**（登记口径的单一字面量）。 */
  const SOURCE_NAME = '历史留存';
  /** 回忆意图词表（**封闭集合**；命中即允许越窗召回 —— 口径 B）。
   *  只影响「保留与排序」，不改 stale 的如实计数：越窗行仍然进 staleDropped / staleKeys。 */
  const RECALL_HINTS = ['当初', '当时', '从前', '以前', '早年', '那次', '那年', '那时',
    '那时候', '记得', '还记得', '记不记得', '忘了吗', '忘了没', '是否记得', '为何', '为什么',
    '缘由', '起因', '原委', '缘故', '后来', '曾经', '原本', '本来', '之前', '早先', '旧事'];
  /** 本轮输入是否在问旧事（口径 B 的唯一判据；`src.recall === true` 为显式越权开关）。 */
  function recallWanted(text) {
    const t = txt(text);
    if (!t) return false;
    for (let i = 0; i < RECALL_HINTS.length; i++) { if (t.indexOf(RECALL_HINTS[i]) >= 0) return true; }
    return false;
  }
  /** 注入块标签（单一真源；尖括号拼字形）。 */
  //   与仓内其余八处同型标签（backstage / enemies / evolution / kaleidoscope / memory /
  //   opinion / parallel-world / inject）保持同一写法：内联字面量，单一真源。
  //   首版写成 chr(60)/chr(62) 拼字形 —— 那是落盘通道的避让手段，不是产品代码该有的形态：
  //   chr 在全仓并不存在，`node --check` 只查语法故放行，真装载当场 ReferenceError。
  const TAG = '<world_axis_history>';
  const TAG_END = '</world_axis_history>';
  const stat = { calls: 0, historyOf: 0, assemblies: 0, dropped: 0, capacity: 0, absents: 0,
    recalled: 0, split: 0, lastReason: '', faults: Object.create(null) };
  function noteFault(code) {
    const t = String(code == null ? 'unknown' : code);
    stat.faults[t] = (stat.faults[t] || 0) + 1;
    stat.lastReason = t;
  }

  // ══════════════════ 只读源面（逐源一个取数口，缺席一律如实报） ══════════════════
  /** store 快照（只读）。 */
  function snapshot() {
    try { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; }
    catch (e) { return {}; }
  }
  /** 事实**全版本链**（只读；含 `active:false` —— 这正是本模块存在的理由）。 */
    /** 未结承诺与历史承诺（只读；customLax.promises）。 */
  function promiseRows() {
    const s = snapshot();
    const arr = (s.customLax && Array.isArray(s.customLax.promises)) ? s.customLax.promises : [];
    return arr.filter(function (x) { return x && (txt(x.id) || txt(x.subject)); });
  }
  /** 主观记忆（只读；memory.pmem 中的认知）。 */
  function pmemRows() {
    const s = snapshot();
    const arr = (s.memory && Array.isArray(s.memory.pmem)) ? s.memory.pmem : [];
    return arr.filter(function (x) { return x && txt(x.text); });
  }
function factRows() {
    const s = snapshot();
    const arr = (s.memory && Array.isArray(s.memory.facts)) ? s.memory.facts : [];
    return arr.filter(function (x) { return x && txt(x.key); });
  }
  /** 编年史行（只读；委托 chrono 自己的读口，本模块不直读 chronicle 容器）。 */
  function chronicleRows(limit) {
    try {
      if (!WA.chrono || typeof WA.chrono.chronicle !== 'function') return null;
      const r = WA.chrono.chronicle({ limit: limit || 60 });
      return (r && Array.isArray(r.rows)) ? r.rows : [];
    } catch (e) { return null; }
  }
  /** 因果链行（只读；真源是 causal 自己的存档行）。 */
  function chainRows() {
    const s = snapshot();
    const arr = (s.causal && Array.isArray(s.causal.chains)) ? s.causal.chains : [];
    return arr.filter(function (x) { return x && txt(x.id); });
  }
  /**
   * 在场人物名单（只读；scene 边的实体源）。
   *   现场实测（core/store.js:52）：people 是对象映射 id -> {id,name,...}，不是数组。
   *   首版按数组读 ⇒ Array.isArray 恒假 ⇒ 该边永远缺席，contracts 会如实报 no-people
   *   （不撒谎，但整条 scene 边白挂）。
   */
  function peopleRows() {
    const s = snapshot();
    const bag = (s.people && typeof s.people === 'object' && !Array.isArray(s.people)) ? s.people : null;
    if (!bag) return [];
    return Object.keys(bag).map(function (id) {
      const p = bag[id];
      if (!p || typeof p !== 'object') return null;
      return { id: txt(p.id) || id, name: txt(p.name) || txt(p.id) || id,
        at: num(p.updatedAt) || num(p.lastSeenAt) || 0, raw: p };
    }).filter(Boolean);
  }
  /** 原因是否**已在世界**（逐条走 causal.knownCause；本模块不另立一份原因表）。 */
  function causeKnown(cause) {
    const c = txt(cause);
    if (!c) return false;
    try { return !!(WA.causal && typeof WA.causal.knownCause === 'function' && WA.causal.knownCause(c)); }
    catch (e) { return false; }
  }
  /** 条目检索（只读；委托 historySearch 自己的口，缺席返回 null = 不可用）。 */
  function entrySearch(q, limit) {
    try {
      if (!WA.historySearch || typeof WA.historySearch.search !== 'function') return null;
      const r = WA.historySearch.search(q, { limit: limit || 6 });
      return (r && Array.isArray(r.rows)) ? r.rows : [];
    } catch (e) { return null; }
  }

  // ══════════════════ 分词（确定性，不调模型） ══════════════════
  /**
   * 切词：ASCII 词与数字按整词，CJK 按**二元组**（bigram）。
   *   为什么用 bigram 而不是分词器：本仓零依赖，且 bigram 对中文短语的召回**只多不漏**
   *   （多召回由下游 match 精筛，漏召回无法补救）。
   */
  function tokenize(text) {
    const s = txt(text);
    const out = [];
    const re = /[A-Za-z0-9_]{2,}/g; let m;
    while ((m = re.exec(s))) out.push(m[0].toLowerCase());
    const runs = s.match(/[\u4e00-\u9fff]{2,}/g) || [];
    runs.forEach(function (run) {
      if (run.length <= 2) { out.push(run); return; }
      for (let i = 0; i + 2 <= run.length; i++) out.push(run.slice(i, i + 2));
    });
    return Array.from(new Set(out));
  }
  /** 行是否命中任一 token（命中即算「被提及」）。 */
  function hit(text, tokens) {
    const t = txt(text).toLowerCase();
    if (!t) return '';
    for (let i = 0; i < tokens.length; i++) { if (t.indexOf(tokens[i]) >= 0) return tokens[i]; }
    return '';
  }

  // ══════════════════ 1. contracts（只读核三条边） ══════════════════
  /**
   * 只读核验**三条检索边**是否在场。**按 TRIGGERS 逐边建**——
   *   首轮踩过的坑（与 story-loop 同型）：常量声明了封闭集合却在函数体里硬写三段，
   *   于是「把三边砍成两边」这种破坏对读数毫无影响（那个常量只是装饰）。
   */
  function contracts() {
    const BUILD = {
      causal: function () {
        const c = WA.causal;
        const present = !!(c && typeof c.knownCause === 'function');
        return { edge: 'causal', duty: TRIGGER_DUTY.causal, source: 'engines/causal.js',
          present: present, why: present ? 'mounted' : 'causal-absent' };
      },
      mentioned: function () {
        // 提及边的**主源**是事实全版本链（本模块自读）+ 编年史（chrono）+ 条目（historySearch）。
        //   三者任一在场即该边可用；逐项如实列出，不合成一个布尔（合成后看不出缺了哪一项）。
        const chronoOk = !!(WA.chrono && typeof WA.chrono.chronicle === 'function');
        const searchOk = !!(WA.historySearch && typeof WA.historySearch.search === 'function');
        const factsOk = true;   // 事实链走 store 快照，store 是本模块的硬前置
        const present = chronoOk || searchOk || factsOk;
        return { edge: 'mentioned', duty: TRIGGER_DUTY.mentioned, source: 'memory.facts / chrono / history-search',
          present: present, why: present ? 'mounted' : 'mentioned-absent',
          parts: { facts: factsOk, chronicle: chronoOk, entries: searchOk } };
      },
      scene: function () {
        const present = peopleRows().length > 0;
        return { edge: 'scene', duty: TRIGGER_DUTY.scene, source: 'store.people / engines/entities.js',
          present: present, why: present ? 'mounted' : 'no-people' };
      }
    };
    const out = TRIGGERS.filter(function (k) { return typeof BUILD[k] === 'function'; })
      .map(function (k) { return BUILD[k](); });
    return { ok: true, at: clockWall(), edges: out,
      presentCount: out.filter(function (x) { return x.present; }).length, total: out.length,
      note: '只核「检索源在不在」；源在 ≠ 已检索到东西（后者由 audit 的 empty-lookup 如实报）。' };
  }

  // ══════════════════ 2. candidates（三集合候选） ══════════════════
  /**
   * 三集合候选（**只读预览，零落地**）。OR 规则：**任一** trigger 命中即入候选。
   *   @param {string|{text?:string, keys?:string[], causes?:string[], entities?:string[]}} input
   *   @param {{limit?:number, includeStale?:boolean}} opts
   *   @returns {{ok, at, rows:[{key, trigger, text, at, source, hit, ageMs, stale, why}],
   *              counts, triggers, note}}
   */
  function candidates(input, opts) {
    const o = opts || {};
    stat.calls++;
    const cfg = settings();
    const src = (input && typeof input === 'object') ? input : { text: txt(input) };
    const text = txt(src.text);
    const tokens = tokenize(text).concat((Array.isArray(src.keys) ? src.keys : []).map(txt).filter(Boolean));
    const wantCauses = (Array.isArray(src.causes) ? src.causes : []).map(txt).filter(Boolean);
    const wantEntities = (Array.isArray(src.entities) ? src.entities : []).map(txt).filter(Boolean);
    const now = clockNow('retrieval.candidates');
    const cap = Math.max(4, num(o.limit) || cfg.maxRows);
    const rows = [];
    const seen = Object.create(null);
    function push(row) {
      const k = row.trigger + '|' + row.key + '|' + txt(row.text).slice(0, 40);
      if (seen[k]) return;
      seen[k] = 1;
      rows.push(row);
    }
    const ageOf = function (at) { const a = num(at); return a > 0 ? Math.max(0, now - a) : -1; };
    const staleOf = function (at) { const a = ageOf(at); return a >= 0 && a > cfg.windowMs; };

    // ── 边一：causal（因果相关） ──
    //   口径：显式点名的 cause 必须**已在世界**（causal.knownCause）才入候选；
    //   认不出**照实标 unknown-cause 并仍然列出**（如实报，不静默吞）——
    //   这与 story-loop「不凭空造因」一致：候选可以出现，但 `known` 字段必须诚实。
    const chains = chainRows();
    wantCauses.forEach(function (cid) {
      const row = chains.filter(function (x) { return txt(x.id) === cid; })[0] || null;
      const known = causeKnown(cid);
      push({ key: 'chain:' + cid, trigger: 'causal',
        text: row ? (txt(row.cause) + ' → ' + txt(row.action) + (txt(row.immediate) ? ' ⇒ ' + txt(row.immediate) : '')) : ('原因 ' + cid),
        at: row ? num(row.at) : 0, source: 'engines/causal.js',
        hit: cid, ageMs: row ? ageOf(row.at) : -1, stale: row ? staleOf(row.at) : false,
        why: known ? 'known-cause' : (row ? 'chain-present' : 'unknown-cause') });
    });
    // 链里**被提及**的原因也算因果边（OR：提及即入）
    if (tokens.length) {
      chains.forEach(function (x) {
        const h = hit(txt(x.cause) + ' ' + txt(x.action), tokens);
        if (!h) return;
        push({ key: 'chain:' + txt(x.id), trigger: 'causal',
          text: txt(x.cause) + ' → ' + txt(x.action) + (txt(x.immediate) ? ' ⇒ ' + txt(x.immediate) : ''),
          at: num(x.at), source: 'engines/causal.js', hit: h, ageMs: ageOf(x.at), stale: staleOf(x.at),
          why: 'chain-mention' });
      });
    }

    // ── 边二：mentioned（被提及） ──
    //   ① 事实**全版本链**：命中即入，且**失效版本照样入**（本版核心口径 2）
    const facts = factRows();
    const byKey = Object.create(null);
    facts.forEach(function (f) { const k = txt(f.key); (byKey[k] = byKey[k] || []).push(f); });
    Object.keys(byKey).forEach(function (k) {
      const vers = byKey[k].slice().sort(function (a, b) { return num(a.version) - num(b.version); });
      const cur = vers.filter(function (v) { return v.active === true; }).slice(-1)[0] || vers.slice(-1)[0] || null;
      const h = hit(k + ' ' + vers.map(function (v) { return txt(v.value); }).join(' '), tokens);
      if (!h) return;
      const reverted = vers.some(function (v) { return v.active !== true; });
      // 口径 A（v2.231.0）：旧值**正文**必须进包。首版只写「曾有 N 次替换，历史可查」——
      //   那是把答案指向一处**模型看不见的地方**（「可查」不是「已给出」）。
      const olds = vers.filter(function (v) { return v.active !== true; });
      const oldTxt = olds.map(function (v) { return txt(v.value); }).filter(Boolean).join(' → ');
      push({ key: 'fact:' + k, trigger: 'mentioned',
        text: k + '=' + (cur ? txt(cur.value) : '')
          + (reverted ? '（此前：' + oldTxt + '；共 ' + olds.length + ' 次替换）' : ''),
        at: cur ? num(cur.at) : 0, source: 'engines/memory.js',
        hit: h, ageMs: cur ? ageOf(cur.at) : -1, stale: cur ? staleOf(cur.at) : false,
        versions: vers.length, reverted: reverted,
        oldValues: olds.map(function (v) { return { value: txt(v.value), version: num(v.version) || 1, reason: txt(v.reason) }; }),
        why: 'fact-mention' });
    });
    //   ② 编年史（委托 chrono 读口；缺席如实跳过并记一条 absent）
    const chron = chronicleRows(60);
    if (chron) {
      chron.forEach(function (r) {
        // 现场实测（engines/chrono.js:410）：chronicle 行字段是 {at,kind,label,title,text,refs}，
        //   没有 summary、也没有 id。按 summary 读 ⇒ 正文永远为空串（命中面被砍掉一半）。
        const h = hit(txt(r.title) + ' ' + txt(r.text), tokens);
        if (!h) return;
        push({ key: 'chronicle:' + txt(r.title), trigger: 'mentioned',
          text: txt(r.title) + (txt(r.text) ? '：' + txt(r.text) : ''),
          at: num(r.at), source: 'engines/chrono.js', hit: h, ageMs: ageOf(r.at), stale: staleOf(r.at),
          why: 'chronicle-mention' });
      });
    } else noteFault('chronicle-absent');
    //   ③ 世界书条目（委托 historySearch；缺席不报错，只在看门里如实计）
    if (tokens.length) {
      const hits = entrySearch(tokens.slice(0, 6).join(' '), 6);
      if (hits) {
        hits.forEach(function (r) {
          push({ key: 'entry:' + txt(r.ref || r.title), trigger: 'mentioned',
            text: txt(r.title) + (txt(r.text) ? '：' + txt(r.text).slice(0, 120) : ''),
            at: num(r.at), source: 'engines/history-search.js', hit: txt(r.title), ageMs: -1, stale: false,
            why: 'entry-search' });
        });
      } else noteFault('entry-search-absent');
    }
    //   ④ 承诺与未结义务（OPV4-7：customLax.promises，相关旧承诺按需召回、不挤占）
    const promises = promiseRows();
    if (promises.length && tokens.length) {
      promises.forEach(function (p) {
        const pSub = txt(p.subject) || txt(p.id);
        const pWho = [txt(p.promiser), txt(p.beneficiary), txt(p.guarantor)].filter(Boolean).join(' ');
        const h = hit(pSub + ' ' + pWho, tokens);
        if (!h) return;
        const pStatus = txt(p.status) || 'active';
        push({ key: 'promise:' + (txt(p.id) || pSub), trigger: 'mentioned',
          text: '承诺[' + pStatus + '] ' + (txt(p.promiser) || '某人') + ' → ' + (txt(p.beneficiary) || '某人') + '：' + pSub
            + (p.defaultReason ? '（违约原因：' + txt(p.defaultReason) + '）' : '')
            + (p.remedyDetails && p.remedyDetails.note ? '（补救：' + txt(p.remedyDetails.note) + '）' : ''),
          at: num(p.createdAt), source: 'engines/custom-lax.js', hit: h, ageMs: ageOf(p.createdAt),
          stale: staleOf(p.createdAt), why: 'promise-mention', memoryKind: 'promise', promiseStatus: pStatus });
      });
    }
    //   ⑤ 主观记忆（OPV4-7：memory.pmem，严格区分主观认知与客观事实）
    const pmems = pmemRows();
    if (pmems.length && tokens.length) {
      pmems.forEach(function (m) {
        const h = hit(txt(m.text) + ' ' + (Array.isArray(m.holders) ? m.holders.join(' ') : ''), tokens);
        if (!h) return;
        const holdersTxt = (Array.isArray(m.holders) && m.holders.length) ? '【' + m.holders.join('、') + '的主观记忆】' : '【主观认知】';
        push({ key: 'pmem:' + (txt(m.id) || txt(m.text).slice(0, 16)), trigger: 'mentioned',
          text: holdersTxt + txt(m.text),
          at: num(m.time) || num(m.at) || 0, source: 'engines/pmem.js', hit: h, ageMs: ageOf(m.time || m.at),
          stale: staleOf(m.time || m.at), why: 'pmem-mention', memoryKind: 'subjective', holders: m.holders || [] });
      });
    }

    // ── 边三：scene（场景实体约束） ──
    const people = peopleRows();
    const ents = wantEntities.concat(tokens);
    people.forEach(function (p) {
      const nm = txt(p.name) || txt(p.id);
      if (!nm) return;
      const h = ents.filter(function (t) { return t && (nm.indexOf(t) >= 0 || t.indexOf(nm) >= 0); })[0];
      if (!h) return;
      const factsOf = facts.filter(function (f) { return txt(f.key).indexOf(nm) >= 0 && f.active === true; });
      push({ key: 'person:' + (txt(p.id) || nm), trigger: 'scene',
        text: nm + (factsOf.length ? '（' + factsOf.map(function (f) { return txt(f.key) + '=' + txt(f.value); }).join('；') + '）' : ''),
        at: num(p.at), source: 'engines/entities.js', hit: h, ageMs: ageOf(p.at), stale: false,
        why: 'scene-entity' });
    });

    // OR 规则：**任一** trigger 命中即保留（不要求同时满足、不要求与锚点有关）
    //   超窗行在**过滤之前**先留一份读数：首版只从过滤后的 kept 里数 stale，
    //   而过滤恰恰把 stale 全滤掉了 —— 于是 `guards.stale` 结构上恒零（死看门：
    //   四类里有一类永远报不出东西，等于没有这一类）。看门必须数「被滤掉的那批」。
    const staleAll = rows.filter(function (r) { return r.stale === true; });
    // 口径 B（v2.231.0）：回忆意图 ⇒ 超窗命中**保留**并标 recalled:true。
    //   ⚠ 越窗只改「保留与排序」，**不改** staleDropped / staleKeys 的如实计数 ——
    //     否则「越窗召回」会把看门读数洗成 0，等于用新功能把旧看门悄悄关掉。
    const recall = recallWanted(text) || src.recall === true;
    const kept = rows.filter(function (r) {
      if (!r.stale) return true;
      if (o.includeStale === true) return true;
      if (recall) { r.recalled = true; return true; }
      return false;
    });
    if (recall) stat.recalled += kept.filter(function (r) { return r.recalled === true; }).length;
    // 口径 C（v2.231.0）：排序**先看命中强度**（被召回优先 → 命中 token 长度 → 时间）。
    //   只按时间排 = 让「最近」冒充「最相关」；命中更强的行不该被行数上限挤掉。
    const strengthOf = function (r) { return txt(r.hit).length; };
    const ranked = kept.slice().sort(function (a, b) {
      const ra = (a.recalled === true) ? 1 : 0, rb = (b.recalled === true) ? 1 : 0;
      if (ra !== rb) return rb - ra;
      const sa = strengthOf(a), sb = strengthOf(b);
      if (sa !== sb) return sb - sa;
      return num(b.at) - num(a.at);
    });
    const counts = {};
    TRIGGERS.forEach(function (t) { counts[t] = ranked.filter(function (r) { return r.trigger === t; }).length; });
    return { ok: true, at: now, windowMs: cfg.windowMs, tokens: tokens.length,
      rows: ranked.slice(0, cap), total: ranked.length, counts: counts, cap: cap,
      staleDropped: staleAll.length, staleKeys: staleAll.slice(0, 20).map(function (r) { return r.key; }),
      recall: recall, recalled: ranked.filter(function (r) { return r.recalled === true; }).length,
      // 查无结果**显式**成一态（口径 3）：不得读成「没发生过 / 一切正常」
      empty: ranked.length === 0,
      note: ranked.length === 0
        ? '三边皆无命中 —— 这是「没检索到」，不是「没发生过」；不得当成一切正常。'
        : (recall
          ? 'OR 规则 + 回忆意图：超窗命中已**召回**（recalled），且 stale 计数仍如实报出。'
          : 'OR 规则：因果相关**或**被提及，任一成立即入候选。') };
  }

  // ══════════════════ 3. historyOf（效果反转后仍可检索） ══════════════════
  /**
   * 取**一个事实键的全版本链**（含被替换的旧值）。
   *   这是本版的核心口径落地：`upsertFact` 早就在写 `active:false` 的旧版本，
   *   但此前唯一的读口把它 `filter` 掉了 —— 于是「还了钥匙」抹掉了「偷过钥匙」。
   *   @param {string} key
   *   @param {{includeInactive?:boolean}} opts
   *   @returns {{ok, key, versions:[{value,version,active,reason,at,ageMs}], current, reverted,
   *              chainLength, note}}
   */
  function historyOf(key, opts) {
    const o = opts || {};
    stat.historyOf++;
    const k = txt(key);
    if (!k) return { ok: false, reason: 'missing-key' };
    const all = factRows().filter(function (f) { return txt(f.key) === k; });
    if (!all.length) {
      stat.absents++; noteFault('empty-lookup');
      // 口径 3：查无结果**显式**标 absent，不得当成「该事实不存在 / 从未发生」
      return { ok: true, key: k, versions: [], current: null, reverted: false, chainLength: 0,
        absent: true, note: '查无此键 —— 这是「账上没有」，不是「从未发生」。' };
    }
    const now = clockNow('retrieval.historyOf');
    const vers = all.slice().sort(function (a, b) { return num(a.version) - num(b.version); })
      .map(function (f) {
        return { value: txt(f.value), version: num(f.version) || 1, active: f.active === true,
          reason: txt(f.reason), at: num(f.at), ageMs: num(f.at) > 0 ? Math.max(0, now - num(f.at)) : -1 };
      });
    const inactive = vers.filter(function (v) { return !v.active; });
    const cur = vers.filter(function (v) { return v.active; }).slice(-1)[0] || vers.slice(-1)[0] || null;
    const keep = (o.includeInactive === false) ? vers.filter(function (v) { return v.active; }) : vers;
    return { ok: true, key: k, versions: keep, current: cur, reverted: inactive.length > 0,
      chainLength: vers.length, replaced: inactive.length,
      // 口径 2 明写在读数里：当前值**不替代**历史
      note: inactive.length
        ? '此槽位有 ' + inactive.length + ' 次替换：当前值 = ' + (cur ? cur.value : '') + '；被替换的旧值仍在账上（当前值不替代历史）。'
        : '此槽位只有一个版本，未被替换过。' };
  }

  // ══════════════════ 4. assemble（有界紧凑包） ══════════════════
  /**
   * 组装**有界紧凑包**。口径 4：超限**先压紧**（压紧保留每一行的事实，只压缩表述），
   *   压不下就**显式报 capacity** —— 「被预算丢掉」与「本来就没有」必须分得开。
   *   @param {{rows?:Array}} cands  来自 candidates() 的读数
   *   @param {{maxRows?:number, maxChars?:number}} opts
   *   @returns {{ok, rows, text, chars, rowsIn, rowsOut, dropped, capacity, mode, note}}
   */
  function assemble(cands, opts) {
    const o = opts || {};
    stat.assemblies++;
    const cfg = settings();
    const maxRows = Math.max(4, num(o.maxRows) || cfg.maxRows);
    const maxChars = Math.max(500, num(o.maxChars) || cfg.maxChars);
    const src = (cands && Array.isArray(cands.rows)) ? cands.rows : [];
    // 压紧：每行取「触发类 · 正文（截断）」；先按 trigger 分组保序（因果 → 提及 → 场景）
    const order = TRIGGERS.reduce(function (a, t, i) { a[t] = i; return a; }, {});
    // 口径 C（v2.231.0）：同 trigger 内先看命中强度与被召回标记，再比时间（首版只比时间）。
    const strengthOf = function (r) { return txt(r.hit).length; };
    const sorted = src.slice().sort(function (a, b) {
      const d = (order[a.trigger] || 0) - (order[b.trigger] || 0);
      if (d !== 0) return d;
      const ra = (a.recalled === true) ? 1 : 0, rb = (b.recalled === true) ? 1 : 0;
      if (ra !== rb) return rb - ra;
      const sa = strengthOf(a), sb = strengthOf(b);
      if (sa !== sb) return sb - sa;
      return num(b.at) - num(a.at);
    });
    const take = sorted.slice(0, maxRows);
    const droppedByRows = Math.max(0, sorted.length - take.length);
    // 口径 D（v2.231.0）：**当前值与历史分列**。首版把「此前：…」塞在同一行里，
    //   长历史会把当前值挤到看不见的位置；现在拆成两行，当前值行恒在前。
    //   ⚠ 分列行**同受预算**（lineOf 与普通行走同一档 w）—— 历史不是「免费附赠」。
    const splitRows = take.filter(function (r) { return r.reverted === true && txt(r.text).indexOf('（此前：') >= 0; });
    const splitKey = splitRows.slice(0, 8).map(function (r) { return r.key; });
    function lineOf(r, w) {
      const head = '[' + r.trigger + '] ';
      const t = txt(r.text);
      if (r.reverted === true) {
        const i = t.indexOf('（此前：');
        const j = t.indexOf('）', i);
        if (i > 0 && j > i) {
          const curLine = head + t.slice(0, i) + '（当前值）';
          const hisLine = head + '历史：' + t.slice(i + 4, j) + '（当前值不替代历史）';
          return [curLine.slice(0, w), hisLine.slice(0, w)].join('\n');
        }
      }
      return head + t.slice(0, w);
    }
    // 逐步压紧：先全文，再逐级截断到装下为止
    const widths = [240, 160, 100, 64, 40];
    let chosen = null;
    for (let i = 0; i < widths.length; i++) {
      const w = widths[i];
      const lines = take.map(function (r) { return lineOf(r, w); });
      const body = lines.join('\n');
      if (body.length <= maxChars) { chosen = { w: w, lines: lines, body: body }; break; }
    }
    const mode = chosen ? (chosen.w === widths[0] ? 'full' : 'compact') : 'capacity';
    const lines = chosen ? chosen.lines : take.map(function (r) { return '[' + r.trigger + '] ' + txt(r.text).slice(0, 24); });
    let body = lines.join('\n');
    const WRAP = TAG + '\n', WRAP2 = '\n' + TAG_END;
    // 「有界」是硬上界：连最紧一档都装不下时，仍须把正文裁进预算（口径 4 的压紧优先
    //   在 capacity 态也要守）—— capacity:true 报的是账，不是「可以超预算」的许可证。
    if (!chosen) {
      const room = Math.max(0, maxChars - WRAP.length - WRAP2.length);
      if (body.length > room) body = body.slice(0, room);
    }
    const text = body ? (WRAP + body + WRAP2) : '';
    // 压不下 ⇒ 显式 capacity（不静默丢）
    const overCapacity = (chosen === null);
    if (splitRows.length) stat.split += splitRows.length;
    if (overCapacity) { stat.capacity++; noteFault('capacity'); }
    if (droppedByRows > 0) { stat.dropped += droppedByRows; noteFault('rows-over-cap'); }
    return { ok: true, rows: take, text: text, chars: text.length,
      rowsIn: src.length, rowsOut: take.length, dropped: droppedByRows,
      split: splitRows.length, splitKey: splitKey,
      capacity: overCapacity, maxRows: maxRows, maxChars: maxChars, mode: mode,
      note: overCapacity
        ? '必需项装不进预算 —— **显式报容量**，不静默丢弃（被预算丢掉与本来就没有必须分得开）。'
        : (droppedByRows > 0
          ? '超出行数上限 ' + droppedByRows + ' 行；这部分**未丢弃出账**，读数如实计入 dropped。'
          : '全部命中项已入包。') };
  }

  // ══════════════════ 5. audit（四类看门） ══════════════════
  /**
   * 四类看门（只读）：缺席 / 超窗 / 未登记 / 查无结果。
   *   `verdict` **非恒真**：只有「三边全在场 **且** 至少一条命中 **且** 四类全零」才是 `ready`。
   */
  function audit(input, opts) {
    const cs = contracts();
    const cfg = settings();
    const c = candidates(input || {}, opts);
    const a = assemble(c, opts);
    const guards = {};
    guards.absent = cs.edges.filter(function (e) { return !e.present; }).map(function (e) { return e.edge + ':' + e.why; });
    //   超窗读数取自 candidates 的 staleKeys（被 includeStale 默认值滤掉的那批）——
    //   不是从 c.rows 里数（那里根本没有 stale 行）。
    guards.stale = (c.staleKeys || []).slice();
    // 未登记：本模块的注入源必须在 inject-budget 的 PRIORITY 里（成类锁盯的是键集，这里报的是运行时读数）
    // 现场实测（engines/inject-budget.js 导出面）：没有 priorityOf；
    //   导出的读口是 rankOf(name)，但它对未登记源返回 DEFAULT_RANK(=6)，
    //   与「已登记为 rank 6」不可区分 —— 拿它判「登没登记」必错。
    //   唯一能答这个问题的面是 PRIORITY（已导出，82 键）的键集本身。
    let ranked = null;   // null = 读不到判据（≠ 已登记）
    try {
      const PB = (WA.injectBudget && WA.injectBudget.PRIORITY) || null;
      if (PB && typeof PB === 'object') ranked = (SOURCE_NAME in PB);
    } catch (e) { ranked = null; }
    guards.unranked = (ranked !== true) ? [{ source: SOURCE_NAME, known: ranked }] : [];
    // 查无结果：**显式成一态**（≠ 没发生过）
    guards['empty-lookup'] = c.empty ? [{ tokens: c.tokens, reason: 'no-hit' }] : [];
    const guardCounts = {};
    GUARDS.forEach(function (g) { guardCounts[g] = (guards[g] || []).length; });
    const allPresent = cs.edges.every(function (e) { return e.present === true; });
    let verdict, reasons = [];
    if (!allPresent) reasons.push('source-absent:' + cs.edges.filter(function (e) { return !e.present; }).map(function (e) { return e.edge; }).join(','));
    if (c.empty) reasons.push('empty-lookup');
    GUARDS.forEach(function (g) { if (g !== 'empty-lookup' && guardCounts[g] > 0) reasons.push(g + ':' + guardCounts[g]); });
    if (a.capacity) reasons.push('capacity');
    if (!reasons.length) verdict = 'ready';
    else if (allPresent && !c.empty) verdict = 'partial';
    else verdict = 'idle';
    return { ok: true, at: clockWall(), verdict: verdict, reasons: reasons,
      contracts: cs.edges, presentCount: cs.presentCount, edgeTotal: cs.total,
      candidates: c.total, counts: c.counts, assembled: a.rowsOut, dropped: a.dropped, capacity: a.capacity,
      guards: guards, guardCounts: guardCounts, enabled: !!cfg.enabled,
      note: '四类看门逐类如实报：缺席 / 超窗 / 未登记 / 查无结果。查无结果**不等于**没发生过；被预算丢掉**不等于**本来就没有。' };
  }

  // ══════════════════ 注入块（唯一产品出口） ══════════════════
  /**
   * 注入段：把**本轮输入**相关的历史拿回模型眼前（OR 规则的产品化）。
   *   关闭 / 无命中一律返回空串（不产空壳、不占预算）。
   */
  function buildBlock(input) {
    try {
      const cfg = settings();
      if (!cfg.enabled) return '';
      const src = input || {};
      const c = candidates(src, { limit: cfg.maxRows });
      if (!c.rows.length) return '';
      const a = assemble(c, {});
      if (!a.text) return '';
      return a.text;
    } catch (e) { noteFault('build-threw'); return ''; }
  }

  function statView() {
    const cfg = settings();
    return { enabled: !!cfg.enabled, windowMs: cfg.windowMs, maxRows: cfg.maxRows, maxChars: cfg.maxChars,
      calls: stat.calls, historyOf: stat.historyOf, assemblies: stat.assemblies,
      dropped: stat.dropped, capacity: stat.capacity, absents: stat.absents,
      recalled: stat.recalled, split: stat.split,
      recallHints: RECALL_HINTS.length, recalledRows: stat.recalled, splitPacks: stat.split,
      lastReason: stat.lastReason, faults: Object.assign({}, stat.faults),
      triggers: TRIGGERS.length, guards: GUARDS.length };
  }
  function reset() { stat.calls = 0; stat.historyOf = 0; stat.assemblies = 0; stat.dropped = 0;
    stat.capacity = 0; stat.absents = 0; stat.recalled = 0; stat.split = 0;
    stat.lastReason = ''; stat.faults = Object.create(null); return { ok: true }; }

  WA.retrieval = {
    VERSION: VERSION,
    TRIGGERS: TRIGGERS.slice(), TRIGGER_DUTY: Object.assign({}, TRIGGER_DUTY),
    GUARDS: GUARDS.slice(), GUARD_LABEL: Object.assign({}, GUARD_LABEL),
    RECALL_HINTS: RECALL_HINTS.slice(), recallWanted: recallWanted,
    SOURCE_NAME: SOURCE_NAME,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    contracts: contracts,
    candidates: candidates,
    historyOf: historyOf,
    assemble: assemble,
    audit: audit,
    buildBlock: buildBlock,
    stat: statView, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/retrieval.js', { kind: 'engine', ver: VERSION });
  if (WA.log) WA.log('info', '历史留存与检索已加载(' + VERSION + ',默认休眠:' + (DEF.enabled === false) + ')');
})();
