/**
 * WorldAxis engines/eco-audit.js (v2.154.0) — 世界生态自洽审计（RX7）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   世界里有四本账各自记着自己那一面：世界编年史（发生过什么）、人物日程（人在哪）、
 *   传播链（谁传给了谁、降到哪一层）、因果链（因为什么所以什么）。
 *   每一本**单独看都自洽**，而**彼此之间**的矛盾一直无人过问：
 *     · 一条链的结算引用了「在它之后才发生」的事；
 *     · 同一个人在同一时间段被排在两个地方；
 *     · 一个人被记为「知道」，而世界的传播账里他从没拿到过这条消息；
 *     · 一个回声挂在一条已经不存在的原因上。
 *   后果：这些矛盾会一路被带进正文（模型照单全收），而作者**看不到**——
 *   要看出来得自己同时读四本账并对时间轴，那正是人做不动、机器该做的那件事。
 *
 * ── 四类自洽（各自一条判据，各自一个码）──────────────────────
 *   · 时间线自洽 —— `link-after`（引用了一件**后来才发生**的事）
 *       两个产生方：① 因果链已结算，而它的原因（编年史条目 / 另一条链的产物 / 别人链 id）
 *       的成立时刻**晚于**这条链；② 编年史链条里「派生条目早于它的父条目」。
 *       为什么两个产生方共用一个码：它们是**同一句判据**的两个方向（时间倒流），
 *       处置完全相同（把时刻改对或把引用改对）。分成两个码只会让账本变长。
 *   · 时间线自洽（排期面）—— `clock-backward`（延迟后果的到期时刻早于这条链的建立时刻）
 *       它与 `link-after` 不同：一个是「引用了未来的事」，一个是「排期排到了过去」。
 *   · 空间自洽 —— `schedule-overlap`（同一人的两条**活跃**日程时间段相交 ⇒ 同时出现在两处）
 *   · 认知自洽 —— `knowledge-beyond`（他记着「事实 / 亲历」，而传播账从没让他拿到过公开层）
 *       判据真源**不新开**：公开层可见性走 `rumor.visibleTo(person)`（产品自己的唯一读口）；
 *       本模块不另立一套「谁该知道什么」。
 *   · 因果自洽 —— `cause-broken`（链声称的原因在世上不存在了）
 *       判据真源同样不新开：走 `causal.knownCause`（产品自己的「什么算已知原因」）。
 *       `orphan-effect`（回声的引用失效）与它分开：一个是**因**没了，一个是**果**悬空。
 *   · 审计面自身 —— `section-failed`（某一类审计**没做成**）
 *       与 maintain 的 `patrol.degraded` 同一条纪律：「体检没做」与「体检健康」必须可分。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**关闭**。关闭时 sweep 一律拒收（`disabled`），不产生任何读数。
 *   2 **只报不改**：零 `store.transact`、零写入口。本版不做自动修复（需求原话）。
 *      判据里唯一的写动作是 `perfLedger.ingest`（**内存台账**，不落盘）——
 *      那记的是「审计器自己花了多久」，不是「它改了什么」。
 *   3 **观测不得改变被观测对象**：全部判据只读 `store.get()` 的快照；
 *      对 rumor / causal 只调它们的只读口（`visibleTo` / `knownCause`），不调任何写口。
 *   4 **主/备两路口径必须一致**：rumor / causal 缺席时退回本地最小判读，
 *      并在读数里如实标出用的是哪一路（`sources`）——「谁判的」与「判了什么」同等重要。
 *   5 **有界**：问题条数按 `maxIssues` 截断并如实报 `truncated`；扫描人数按 `maxPeople` 截断。
 *      绝不静默截断——被截掉的部分在读数上看得见。
 *   6 自身耗时经 `WA.perfLedger.ingest` 进**性能台账**（真消费方：诊断/面板的性能面）。
 *      这是需求原话「审计器自身耗时进 perf-ledger」的落点。
 *   7 消费者两处：`core/store.js` 的 `maintain()`（自洽问题纳入健康分）
 *      与面板「会话」页（人看明细）。两处用的是**同一份** `sweep()` 读数。
 */

(function () {
  'use strict';
  // v2.154.0：别名形态用本仓规范式（module-cycle-gate 只认这一种形态）。
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_eco_audit_settings_v1';
  const DEF = {
    enabled: false,
    timelineEnabled: true,   // 时间线自洽（含排期面）
    spaceEnabled: true,      // 空间自洽
    cognitionEnabled: true,  // 认知自洽
    causalEnabled: true,     // 因果自洽
    maxIssues: 40,           // 每轮最多报几条（超出如实记 truncated）
    maxPeople: 60            // 认知面最多扫几个人
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'ecoAudit',
    bounds: { maxIssues: [4, 200], maxPeople: [4, 400] } };

  // 四类审计（闭集）。成表而不是散落的分支：面板与诊断按这张表逐类报读数。
  const CATS = ['timeline', 'space', 'cognition', 'causal'];
  const CAT_LABEL = { timeline: '时间线', space: '空间', cognition: '认知', causal: '因果' };
  const LEVEL_OF = { 'link-after': 'error', 'clock-backward': 'warn', 'schedule-overlap': 'error',
    'knowledge-beyond': 'error', 'cause-broken': 'warn', 'orphan-effect': 'warn', 'section-failed': 'warn' };
  // 公开层（与 rumor 的 PUBLIC_LAYERS 同表：fact / witness）。**不共用常量**（各自演化），
  //   但语义必须一致 —— 本模块只用它回答「他有没有拿到过公开层」，不重定义层序。
  const PUBLIC = ['fact', 'witness'];
  const PERF_SOURCE = '世界自洽审计';

  const stat = { sweeps: 0, issues: 0, byCode: {}, byCat: {}, refusals: 0, lastMs: 0, lastAt: 0,
    truncated: 0, degraded: {}, lastReason: '', faults: {} };
  let lastRow = null;   // 上一次扫描的读数（maintain 常规巡视读它，**不重扫**）
  let lastStamp = null;

  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.refusals++; stat.lastReason = reason; }
  function txt(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function num(v) { const n = (v === null || v === undefined || v === '') ? NaN : Number(v); return isFinite(n) ? n : null; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function wallNow() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }

  function stamp(cfg) {
    try {
      const s = state();
      return { chatId: WA.store && WA.store.chatId ? WA.store.chatId() : null,
        stateRev: s.meta && s.meta.stateRev || 0,
        rules: JSON.stringify(cfg),
        // Exact read surfaces also detect unflushed batches and direct live mutations.
        inputs: JSON.stringify({ causal: s.causal, chronicle: s.chronicle, chrono: s.chrono,
          people: s.people, rumor: s.rumor, worldFacts: s.worldFacts,
          facts: s.memory && s.memory.facts, echoes: s.echoes, currents: s.currents,
          events: s.evolution && s.evolution.events }) };
    } catch (e) { return null; }
  }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  /**
   * 设置写口（面板总开关 + 四类开关的真消费方）。
   *   v2.154.0（实施自纠）：以**运行时现值**为底，不以 DEF 起底 —— 面板上「保存类别」与
   *   「启用」是两次**独立**的写动作，若每次都从 DEF 起底，按一次「保存类别」会静默把
   *   总开关关掉（四类开关看着全亮、扫描却恒报 disabled）。同族先例：v2.153.0 的
   *   branch-tree / plot-gauge 两引擎用的就是 `settings()` 起底。形态与二者同规格。
   */
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 世界事实键集（`worldFacts` + `memory.facts` 的活跃行）。与 intel.truthOf 同口径**只读**。 */
  function factKeys(s) {
    const set = {};
    (Array.isArray(s.worldFacts) ? s.worldFacts : []).forEach(function (w) {
      if (!w) return; if (w.key) set[w.key] = 1; if (w.id) set[w.id] = 1;
    });
    const mf = (s.memory && Array.isArray(s.memory.facts)) ? s.memory.facts : [];
    mf.forEach(function (f) { if (!f || f.active === false) return; if (f.key) set[f.key] = 1; if (f.id) set[f.id] = 1; });
    return set;
  }

  /**
   * 时间线自洽。只在**已结算**的链上判「引用未来的事」——
   *   在途链的 delayed 是计划，不是引用（拿计划去判时间倒流会天天误报）。
   */
  function auditTimeline(s, push) {
    const chains = (s.causal && Array.isArray(s.causal.chains)) ? s.causal.chains : [];
    const byId = {};
    chains.forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    const chron = Array.isArray(s.chronicle) ? s.chronicle : [];
    const atOfEntry = {};
    chron.forEach(function (c) { if (c && c.id) atOfEntry[c.id] = num(c.at); });
    const settledAt = {};
    ((s.causal && Array.isArray(s.causal.settled)) ? s.causal.settled : []).forEach(function (r) {
      if (r && r.id) settledAt[r.id] = num(r.at);
    });
    chains.forEach(function (c) {
      if (!c || !c.id) return;
      const born = num(c.at);
      // ① 排期倒挂：到期时刻早于这条链的建立时刻。
      (Array.isArray(c.delayed) ? c.delayed : []).forEach(function (d) {
        const due = num(d && d.dueAt);
        if (due === null || born === null) return;
        if (due < born) push('clock-backward', 'timeline', { chain: c.id, delayed: (d && d.id) || null,
          detail: '延迟后果到期时刻 ' + due + ' 早于链建立时刻 ' + born + '（排期排到了过去）' });
      });
      // ② 引用未来的事：只判已结算的链（在途链引用不算「引用结果」）。
      if (txt(c.status, 20) !== 'settled') return;
      const cause = txt(c.cause, 80);
      if (!cause || born === null) return;
      let otherAt = null, kind = '';
      if (atOfEntry[cause] !== undefined) { otherAt = atOfEntry[cause]; kind = '编年史条目'; }
      const m = /^causal:(.+)$/.exec(cause);
      if (otherAt === null && m) {
        const oid = m[1], other = byId[oid];
        otherAt = (settledAt[oid] !== undefined) ? settledAt[oid] : (other ? num(other.settledAt !== undefined && other.settledAt !== null ? other.settledAt : other.at) : null);
        kind = '另一条因果链的产物';
      }
      if (otherAt === null && byId[cause]) {
        otherAt = settledAt[cause] !== undefined ? settledAt[cause] : num(byId[cause].settledAt);
        kind = '另一条因果链';
      }
      if (otherAt === null && settledAt[cause] !== undefined) { otherAt = settledAt[cause]; kind = '因果结算台账'; }
      if (otherAt === null) return;
      if (otherAt > born) push('link-after', 'timeline', { chain: c.id, cause: cause, at: born, causeAt: otherAt,
        detail: '这条链在 ' + born + ' 结算，而它的原因（' + kind + '「' + cause + '」）到 ' + otherAt + ' 才成立' });
    });
    // ③ 编年史链条倒序：派生条目早于它的父条目。`revert` 除外 —— 撤销本来就要指向更新的条目。
    const ents = (s.chrono && Array.isArray(s.chrono.entries)) ? s.chrono.entries : [];
    const entAt = {};
    ents.forEach(function (e) { if (e && e.id) entAt[e.id] = num(e.at); });
    ents.forEach(function (e) {
      if (!e || !e.id) return;
      if (txt(e.kind, 24).toLowerCase() === 'revert') return;
      const base = txt(e.base, 80);
      if (!base || entAt[base] === undefined) return;
      const mine = num(e.at), parent = entAt[base];
      if (mine === null || parent === null) return;
      if (parent > mine) push('link-after', 'timeline', { entry: e.id, base: base, at: mine, baseAt: parent,
        detail: '编年史条目「' + e.id + '」在 ' + mine + ' 记下，而它引用的上一条「' + base + '」到 ' + parent + ' 才发生' });
    });
  }

  /**
   * 空间自洽：同一人的两条**活跃**日程时间段相交。
   *   只判 `status === 'active'` 的行 —— 已结束 / 已取消的日程不是「此刻在两处」。
   *   时间区间口径与 life.addSchedule 的冲突闸同款（`start < end`），不另立一套。
   */
  function auditSpace(s, push) {
    const people = (s.people && typeof s.people === 'object' && !Array.isArray(s.people)) ? s.people : {};
    Object.keys(people).forEach(function (id) {
      const p = people[id];
      if (!p || typeof p !== 'object') return;
      const sch = (p.life && Array.isArray(p.life.schedule)) ? p.life.schedule : [];
      const act = [];
      sch.forEach(function (x) {
        if (!x || txt(x.status, 16) !== 'active') return;
        const a = num(x.start), b = num(x.end);
        if (a === null || b === null || !(b > a)) return;
        act.push({ id: txt(x.id, 40), activity: txt(x.activity, 40), location: txt(x.location, 40), start: a, end: b });
      });
      for (let i = 0; i < act.length; i++) {
        for (let j = i + 1; j < act.length; j++) {
          const a = act[i], b = act[j];
          if (!(a.start < b.end && b.start < a.end)) continue;
          push('schedule-overlap', 'space', { person: txt(p.name, 40) || id, from: a.start, to: a.end,
            a: a.id, b: b.id,
            detail: '「' + (txt(p.name, 40) || id) + '」在 ' + a.start + '–' + a.end + ' 同时被排在 '
              + (a.location || '未注明') + '（' + a.activity + '）与 ' + (b.location || '未注明') + '（' + b.activity + '）' });
        }
      }
    });
  }

  /**
   * 认知自洽：他记着「事实 / 亲历」，而世界的传播账**从没让他拿到过公开层**。
   *   判据真源：`rumor.visibleTo(person)`（产品自己的唯一读口）；缺席时退回本地最小判读
   *   （链的 hops 里找他本人，且层必须落在公开层）。两条路的结果在 `sources` 里如实标出。
   *   为什么只在「链已降到传闻层」时判：链停在事实层时，本人是否亲历不在链上表达 ——
   *   那时判「他没有公开层」会把正常局面误报成矛盾。
   */
  function publicAccess(person) {
    const set = {};
    const R = WA.rumor;
    if (R && typeof R.visibleTo === 'function') {
      try {
        const v = R.visibleTo(person);
        if (v && v.ok === true && Array.isArray(v.rows)) {
          v.rows.forEach(function (r) { if (r && r.factKey) set[r.factKey] = 1; });
          return { set: set, source: 'rumor.visibleTo' };
        }
      } catch (e) { /* 退回本地判读，并在 sources 里如实标出 */ }
    }
    const chains = (state().rumor && Array.isArray(state().rumor.chains)) ? state().rumor.chains : [];
    chains.forEach(function (c) {
      if (!c || !c.factKey) return;
      const hops = Array.isArray(c.hops) ? c.hops : [];
      const hit = hops.some(function (h) {
        return h && (txt(h.from, 60) === person || txt(h.to, 60) === person) && PUBLIC.indexOf(txt(h.layer, 20)) >= 0;
      });
      if (hit) set[c.factKey] = 1;
    });
    return { set: set, source: 'local-hops' };
  }
  function auditCognition(s, push, cfg) {
    const people = (s.people && typeof s.people === 'object' && !Array.isArray(s.people)) ? s.people : {};
    const chains = (s.rumor && Array.isArray(s.rumor.chains)) ? s.rumor.chains : [];
    const degradedLayer = {};
    chains.forEach(function (c) {
      if (!c || !c.factKey) return;
      const layer = txt(c.layer, 20);
      if (layer === 'hearsay' || layer === 'rumor') degradedLayer[c.factKey] = layer;
    });
    const keys = Object.keys(degradedLayer);
    if (!keys.length) return { scanned: 0, source: 'none' };
    const ids = Object.keys(people).slice(0, cfg.maxPeople);
    let source = 'none';
    ids.forEach(function (id) {
      const p = people[id];
      if (!p || typeof p !== 'object') return;
      const k = p.knowledge;
      if (!k || typeof k !== 'object' || Array.isArray(k)) return;
      const who = txt(p.name, 60) || String(id).replace(/^p_/, '');
      let acc = null;
      Object.keys(k).forEach(function (key) {
        const row = k[key];
        const route = txt(row && row.route, 20);
        if (route !== 'fact' && route !== 'witnessed') return;
        const layer = degradedLayer[key];
        if (!layer) return;
        if (!acc) { acc = publicAccess(who); source = acc.source; }
        if (acc.set[key]) return;   // 传播账承认他拿到过公开层 ⇒ 不判
        push('knowledge-beyond', 'cognition', { person: who, fact: key, layer: layer, route: route,
          detail: '「' + who + '」记为「' + (route === 'witnessed' ? '亲历' : '事实') + '」，'
            + '而这条消息已经降到「' + layer + '」层且传播账从没让他拿到过公开层' });
      });
    });
    return { scanned: ids.length, source: source };
  }

  /**
   * 因果自洽：链声称的原因在世上不存在了（`cause-broken`）+ 回声的引用失效（`orphan-effect`）。
   *   判据真源：`causal.knownCause`（产品自己回答「什么算已知原因」）；模块缺席时退回最小解析。
   */
  function auditCausal(s, push) {
    const facts = factKeys(s);
    const chains = (s.causal && Array.isArray(s.causal.chains)) ? s.causal.chains : [];
    const byId = {};
    chains.forEach(function (c) { if (c && c.id) byId[c.id] = c; });
    let source = 'causal.knownCause';
    const knownFn = (WA.causal && typeof WA.causal.knownCause === 'function') ? WA.causal.knownCause : null;
    if (!knownFn) source = 'local-resolve';
    const known = function (key) {
      if (knownFn) { try { return knownFn(key); } catch (e) { /* 落到下一行 */ } }
      return !!(facts[key] || byId[key] || String(key).indexOf('ec_') === 0);
    };
    chains.forEach(function (c) {
      if (!c || !c.id) return;
      const cause = txt(c.cause, 80);
      if (!cause) return;
      if (known(cause)) return;
      push('cause-broken', 'causal', { chain: c.id, cause: cause,
        detail: '链「' + c.id + '」声称由「' + cause + '」引起，而这条原因在世界事实、因果链与结算台账里都查不到了' });
    });
    const echoes = Array.isArray(s.echoes) ? s.echoes : [];
    echoes.forEach(function (e) {
      if (!e) return;
      const ref = txt(e.refCurrent, 80);
      if (!ref) return;
      if (byId[ref] || facts[ref] || String(ref).indexOf('ec_') === 0) return;
      push('orphan-effect', 'causal', { echo: txt(e.id, 60), causeRef: ref,
        detail: '回声「' + txt(e.id, 60) + '」挂在「' + ref + '」上，而那条暗流已经不在账里了（果悬空）' });
    });
    return { scanned: chains.length, source: source };
  }

  /**
   * 扫一遍。**这是本模块唯一的真入口**（零写入口、零事务）。
   *   面板与 maintain 用的是同一份读数 —— 不另立「面板版」与「巡视版」两套判据。
   */
  function sweep() {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const cap = Math.max(1, Math.floor(cfg.maxIssues));
    const scope = stamp(cfg);
    const t0 = wallNow();
    const issues = [];
    let truncated = 0;
    const byCat = {}, byCode = {};
    const push = function (code, cat, row) {
      byCode[code] = (byCode[code] || 0) + 1;
      byCat[cat] = (byCat[cat] || 0) + 1;
      if (issues.length >= cap) { truncated++; return; }
      issues.push({ code: code, cat: cat, level: LEVEL_OF[code] || 'warn', row: row,
        detail: txt(row && row.detail, 200) });
    };
    let failed = 0;
    const run = function (name, fn) {
      try { return fn(); } catch (e) {
        failed++;
        stat.degraded[name] = (stat.degraded[name] || 0) + 1;
        // 「这一类没做成」必须自己现形：归零的读数不能冒充「这一类没问题」。
        push('section-failed', name, { section: name,
          detail: '「' + (CAT_LABEL[name] || name) + '」这一类审计没做成（' + txt(e && (e.message || e), 120) + '）——本类读数不可信，不能据此判定世界自洽' });
        return null;
      }
    };
    const tl = cfg.timelineEnabled ? run('timeline', function () { auditTimeline(state(), push); return true; }) : null;
    if (cfg.spaceEnabled) run('space', function () { auditSpace(state(), push); return true; });
    const cog = cfg.cognitionEnabled ? run('cognition', function () { return auditCognition(state(), push, cfg); }) : null;
    const cau = cfg.causalEnabled ? run('causal', function () { return auditCausal(state(), push); }) : null;
    const ms = Math.max(0, wallNow() - t0);
    stat.sweeps++; stat.lastMs = ms; stat.lastAt = wallNow();
    stat.issues += issues.length; stat.truncated += truncated;
    Object.keys(byCode).forEach(function (k) { stat.byCode[k] = (stat.byCode[k] || 0) + byCode[k]; });
    Object.keys(byCat).forEach(function (k) { stat.byCat[k] = (stat.byCat[k] || 0) + byCat[k]; });
    const errors = issues.filter(function (i) { return i.level === 'error'; }).length;
    const warns = issues.filter(function (i) { return i.level === 'warn'; }).length;
    stat.lastReason = issues.length ? 'found' : 'clean';
    // ⑦ 自身耗时进性能台账（需求原话）。**只进内存台账**（perfLedger 不落盘、不 transact）。
    if (WA.perfLedger && typeof WA.perfLedger.ingest === 'function') {
      try {
        const c = {};
        c[PERF_SOURCE] = { ms: ms, n: 1 };
        const rd = (state().evolution && num(state().evolution.round));
        WA.perfLedger.ingest(c, rd === null ? undefined : rd);
      } catch (e) { /* 观测失败不影响审计结果 */ }
    }
    const row = { ok: true, at: stat.lastAt, ms: ms, total: issues.length, errors: errors, warns: warns,
      truncated: truncated, byCat: byCat, byCode: byCode, issues: issues.slice(0, cap),
      failedSections: failed, caps: { issues: cap, people: cfg.maxPeople },
      rules: { timeline: !!cfg.timelineEnabled, space: !!cfg.spaceEnabled,
        cognition: !!cfg.cognitionEnabled, causal: !!cfg.causalEnabled },
      // 「谁判的」与「判了什么」同等重要：认知/因果两面的判据来源如实随读数带出。
      sources: { cognition: (cog && cog.source) || 'off', causal: (cau && cau.source) || 'off',
        timeline: tl ? 'state' : 'off' },
      label: '世界生态自洽审计' };
    lastRow = row;
    lastStamp = scope;
    row.scope = scope ? { chatId: scope.chatId, stateRev: scope.stateRev } : null;
    return row;
  }

  /** 上一次扫描的读数（**不重扫**）。maintain 常规巡视读它 —— 巡检不该因为看自洽而变重。 */
  function lastSweep() {
    if (!lastRow) return { ok: false, reason: 'never-swept' };
    const cfg = settings(), current = stamp(cfg);
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    if (!lastStamp || !current || lastStamp.chatId !== current.chatId
      || lastStamp.stateRev !== current.stateRev || lastStamp.rules !== current.rules
      || lastStamp.inputs !== current.inputs) {
      return { ok: false, reason: 'stale', at: lastRow.at, scope: lastRow.scope };
    }
    return lastRow;
  }

  function statOf() {
    const cfg = settings();
    const current = lastSweep();
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      degraded: Object.assign({}, stat.degraded),
      byCode: Object.assign({}, stat.byCode), byCat: Object.assign({}, stat.byCat),
      enabled: !!cfg.enabled,
      rules: { timeline: !!cfg.timelineEnabled, space: !!cfg.spaceEnabled,
        cognition: !!cfg.cognitionEnabled, causal: !!cfg.causalEnabled },
      hasLast: current.ok === true,
      lastErrors: current.ok ? current.errors : 0,
      lastWarns: current.ok ? current.warns : 0,
      lastIssues: current.ok ? current.total : 0,
      lastScannedAt: current.ok ? current.at : 0,
      // 审计器自身耗时进 perf-ledger 的那条，也在这里露一次面（面板/诊断两处都能核对）。
      perfSource: PERF_SOURCE,
      caps: { issues: cfg.maxIssues, people: cfg.maxPeople }
    });
  }

  WA.ecoAudit = {
    CATS: CATS.slice(),
    CAT_LABEL: Object.assign({}, CAT_LABEL),
    LEVEL_OF: Object.assign({}, LEVEL_OF),
    PERF_SOURCE: PERF_SOURCE,
    getSettings: settings,
    setSettings: saveSettings,
    sweep: sweep,
    lastSweep: lastSweep,
    stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/eco-audit.js', { kind: 'engine', ver: '2.154.0' });
})();