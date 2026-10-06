/**
 * WorldAxis engines/world-bridge.js (v2.154.0) — 世界联网面（RX4）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   `chronicle` 答「这世界此前发生过什么」，`farfield` 答「你不在的地方此刻在发生什么」——
 *   两者都只答**本世界**。仍然答不出第三件事：**「我的世界里发生的事，能被别的世界知道吗」**。
 *   后果：一个世界再怎么推演，它产生的大事只在这份存档里活着；换一个世界、换一位玩家，
 *   同样的事要重新发生一遍。世界是**一座孤岛**，而叙事上它本可以有「远方传来的传说」。
 *
 * ── 本模块落点（三件东西）────────────────────────────────────
 *   · 世界签名 —— 每个世界有唯一签名：`(世界观 ID + 玩家 ID)` 各取一个哈希对再合成。
 *     联网时按签名判「同不同一个世界」（同签名 = 本世界自己的回灌，如实拒收 `self-origin`，
 *     否则本世界的传说会以「远方来的」名义再念一遍，读者会以为别处也发生了同样的事）。
 *   · 传说**导出** —— 从世界编年史（`chronicle`）里取**重大事件**（大战 / 大案 / 大人物崛起，
 *     闭集三档），压成一行摘要并**脱敏**：凡命中玩家私密词表的句子整行剔除，
 *     并如实报 `redacted` 条数（**脱敏是算出来的，不是承诺**——只写一句「已脱敏」无法核对）。
 *   · 传说**导入** —— 收别世界的传说包，存进 `worldBridge.legends`，以**远方的传说**形式
 *     进注入块（标 `source:another-world`）。
 *
 * ── 与 rumor 的分工（不许重叠）──────────────────────────────
 *   `rumor` 答「某人把某件**已知事实**传开」（传播面，带跳数与失真）。本模块**不抢 rumor 的活**：
 *   它只把传说**显式交出去**（`toRumor(id, { factKey })`），并按 farfield.relayToRumor 同款纪律
 *   先落事实再起链 —— rumor 的链必须挂在**已存在的事实键**上（`unknown-fact` 是硬拒收），
 *   自动转交会在事实缺席时静默失败，或更糟：替世界编一个事实键出来。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**关闭**。关闭时 exportLegends / importLegends / toRumor 一律拒收（`disabled`），
 *      `buildBlock()` 返回空串 —— 与 sediment / farfield / offlineTick 同规格。
 *   2 **不直接改世界状态**：导入的传说只落在 `worldBridge.legends` 这一条**传说链**里，
 *      不进 worldFacts、不进 chronicle、不进 sediment。它要以「听说的」身份影响世界，
 *      只能经 `toRumor`（先落事实、再起传播链）——「以谣言形式注入」这条需求的原话。
 *      为什么这条最要紧：传说一旦直接写进 worldFacts，下一轮推演就把它当**既成事实**，
 *      于是「远方听说的事」变成了「这里发生过的事」，而两者在读数上长得一样。
 *   3 **脱敏是判据**：导出的每一条都要过玩家私密词表；命中即整行剔除并计数。
 *      「不含玩家私密状态」这句需求，在这里是一个**可执行的过滤**，不是一句注释。
 *   4 **同签名拒收**：本世界自己导出的传说包再导入回来 ⇒ `self-origin`（不是「导入成功 0 条」：
 *      后者会让用户以为别处传了什么过来而恰好是空的）。
 *   5 **有界**：传说环与「已导出过」环各登记容量并走 `WA.evict` 单一出口。
 *   6 **本版不做真实多人联网**：没有网络请求、没有账号、没有服务端。传说包的传递由调用方
 *      （面板导出/粘贴）负责 —— 本模块只保证「导出的是脱敏摘要、导入的按传说对待」。
 *   7 世界签名是**身份**，不是秘密：它由世界名与玩家名派生，可被作者看见与核对
 *      （面板「联网」页把它念出来），因为它要回答的是「这是不是同一个世界」。
 */

(function () {
  'use strict';
  // v2.154.0：别名形态用本仓规范式（module-cycle-gate 只认这一种形态）。
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_world_bridge_settings_v1';
  const DEF = {
    enabled: false,
    worldTitle: '',     // 世界观 ID（空 = 读宿主的角色名 / 聊天名）
    playerName: '',     // 玩家 ID（空 = 读宿主的 name1）
    maxLegends: 24,     // 收进来的传说环
    maxExported: 12,    // 一次导出最多几条
    maxItems: 4         // 注入块最多念几条
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'worldBridge',
    bounds: { maxLegends: [4, 96], maxExported: [1, 48], maxItems: [1, 12] } };

  // 传说三档（**闭集**）。成表而不是自由文本：自造档位等于自造判定，下一手接不上。
  //   需求原话是「大战 / 大案 / 大人物崛起」，故这三档就是它的字面落点。
  const LEGEND_KINDS = ['war', 'crime', 'rise'];
  const LEGEND_LABEL = { war: '兵戈', crime: '大案', rise: '人物崛起' };
  // 档位 ↔ 世界编年史 `kind` 的映射方向是**单向查表**（编年史的 kind 仍是自由文本，
  //   本模块不反向定义它）。三档各收若干同义 kind：不新开一套事件分类，只做归类。
  const KINDS_OF = {
    war: ['war', 'battle', 'conflict', 'clash'],
    crime: ['crime', 'case', 'theft', 'murder'],
    rise: ['rise', 'fame', 'ascend', 'career']
  };
  // 脱敏词表：凡命中这些片段的**句子**一律不进传说。口径是「宁可少说，不可错说」——
  //   漏掉一句私密话的代价是「另一个世界看见了我的内心」，
  //   而多剔一句无害话的代价只是这条传说短一点（如实报 redacted 条数即可核对）。
  const PRIVATE = ['玩家', '主角', '我', '存档', '好感', '亲密度', '私人', '秘密', '私密', '暗恋', '内心'];
  const MS_PER_DAY = 86400000;

  const stat = { reads: 0, seeds: 0, exported: 0, imported: 0, refusals: 0, redacted: 0,
    relays: 0, dropped: 0, lastReason: '', faults: {} };

  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.refusals++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  /** 决定性哈希（FNV-1a 变体取低 32 位十六进制）。与 timeline.hashText 同族不同表。 */
  function hash8(v) {
    const t = String(v == null ? '' : v);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  /**
   * 设置写口（面板三输入 + 总开关的真消费方）。
   *   v2.154.0（实施自纠）：以**运行时现值**为底，不以 DEF 起底 —— 面板上「启用」开关与
   *   「保存身份」是两次**独立**的写动作，若每次都从 DEF 起底，点一下开关就把用户填好的
   *   两段身份摸回空串（而空身份会让世界签名整份不成立）。同族先例：v2.153.0 的
   *   branch-tree / plot-gauge 两引擎用的就是 `settings()` 起底。形态与二者同规格。
   */
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function ctx() { try { const mw = WA.mainWin || window; return (mw.SillyTavern && mw.SillyTavern.getContext) ? (mw.SillyTavern.getContext() || null) : null; } catch (e) { return null; } }
  /** 世界观 ID：设置里的显式值优先；否则读宿主的角色名（世界的主角名就是世界的名字）。 */
  function titleOf() {
    const cfg = settings();
    if (clean(cfg.worldTitle, 80)) return clean(cfg.worldTitle, 80);
    const c = ctx();
    return clean((c && c.name2) || (c && c.chatId) || '', 80);
  }
  /** 玩家 ID：设置里的显式值优先；否则读宿主的 name1。 */
  function playerOf() {
    const cfg = settings();
    if (clean(cfg.playerName, 40)) return clean(cfg.playerName, 40);
    const c = ctx();
    return clean((c && c.name1) || '', 40);
  }
  /**
   * 世界签名：`(世界观 ID + 玩家 ID)` 两段派生值 + 合成哈希。
   *   不缓存**永久**（身份可以在设置里改），缓存只在一次调用内由调用方复用返回体。
   */
  function worldKey() {
    const title = titleOf(), player = playerOf();
    const titleId = title ? hash8('title|' + title) : '';
    const playerId = player ? hash8('player|' + player) : '';
    const sig = (titleId && playerId) ? hash8(titleId + '|' + playerId) : '';
    return { title: title, player: player, titleId: titleId, playerId: playerId, sig: sig,
      // 名字没填齐时如实说**哪一半缺**：拿半份身份去判「是不是同一个世界」是假判据。
      complete: !!(titleId && playerId),
      label: (title || '(未命名世界)') + ' · ' + (player || '(未署名玩家)') };
  }

  function bucket(draft) {
    if (!draft.worldBridge || typeof draft.worldBridge !== 'object' || Array.isArray(draft.worldBridge)) {
      draft.worldBridge = { legends: [], exported: [], seeds: 0, lastExportAt: null, lastImportAt: null };
    }
    const b = draft.worldBridge;
    if (!Array.isArray(b.legends)) b.legends = [];
    if (!Array.isArray(b.exported)) b.exported = [];
    if (typeof b.seeds !== 'number' || !isFinite(b.seeds)) b.seeds = 0;
    return b;
  }
  function rowsOf(k) { const b = state().worldBridge; return (b && Array.isArray(b[k])) ? b[k] : []; }

  /**
   * 种子：把本世界的身份与初始大事记记下（面板与诊断据此判「联网面到底有没有起来」）。
   *   **必须在事务里调用**（形态与 farfield.tick 同规格：本函数改的是 `draft.worldBridge`，
   *   自己不开事务）。幂等：同一签名重复 seed 只累加计数。
   */
  function seed(draft) {
    const o = draft || null;
    if (!o || typeof o !== 'object') { noteFault('no-draft'); return { ok: false, reason: 'no-draft' }; }
    const wk = worldKey();
    if (!wk.complete) {
      // 身份不全不是「导入失败」，是「还不知道你是谁」——分开归因（见文件头边界 7）。
      noteFault('identity-incomplete');
      return { ok: false, reason: 'identity-incomplete', field: (!wk.title ? 'worldTitle' : 'playerName'), label: wk.label };
    }
    const b = bucket(o);
    b.seeds = (b.seeds || 0) + 1;
    b.title = wk.title; b.player = wk.player; b.sig = wk.sig; b.seededAt = clockNow();
    stat.seeds++; stat.lastReason = 'seeded';
    return { ok: true, sig: wk.sig, label: wk.label, seeds: b.seeds };
  }
  function clockNow() { try { return WA.clock.now('worldBridge'); } catch (e) { return Date.now(); } }

  /** 编年史三档归类。认不出即 null（**不回落**某一档：那会把无关的事说成「大战」）。 */
  function legendKindOf(kind) {
    const k = clean(kind, 24).toLowerCase();
    if (!k) return null;
    let hit = null;
    LEGEND_KINDS.forEach(function (g) { if (!hit && KINDS_OF[g].indexOf(k) >= 0) hit = g; });
    return hit;
  }

  /** 逐句脱敏：按行（与 `。！？；` 三个句末标点）切开，命中私密词表的**整句**剔除。 */
  function redactText(text) {
    const raw = String(text == null ? '' : text);
    if (!raw) return { text: '', trimmed: 0 };
    const parts = raw.split(/[\n。！？；]/).map(function (s) { return s.trim(); }).filter(Boolean);
    const keep = [], drop = [];
    parts.forEach(function (s) {
      const bad = PRIVATE.some(function (w) { return s.indexOf(w) >= 0; });
      (bad ? drop : keep).push(s);
    });
    return { text: keep.join('；'), trimmed: drop.length, dropped: drop };
  }

  /**
   * 导出传说：从**世界编年史**（`chronicle`）取重大事件，压成脱敏摘要。
   *   纯读（不改任何状态，只累加进程态计数）——面板与诊断的安全读口。
   */
  function exportLegends(opts) {
    stat.reads++;
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const want = Array.isArray(o.kinds) && o.kinds.length
      ? o.kinds.map(function (k) { return clean(k, 16); }).filter(function (k) { return LEGEND_KINDS.indexOf(k) >= 0; })
      : LEGEND_KINDS.slice();
    if (!want.length) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'kinds', allowed: LEGEND_KINDS.slice() }; }
    const wk = worldKey();
    if (!wk.complete) {
      noteFault('identity-incomplete');
      return { ok: false, reason: 'identity-incomplete', field: (!wk.title ? 'worldTitle' : 'playerName'), label: wk.label };
    }
    const all = Array.isArray(state().chronicle) ? state().chronicle : [];
    if (!all.length) { noteFault('no-chronicle'); return { ok: false, reason: 'no-chronicle', sig: wk.sig }; }
    const seen = {}, rows = [];
    let redacted = 0;
    all.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      const kind = legendKindOf(c.kind);
      if (!kind || want.indexOf(kind) < 0) return;
      const key = kind + '|' + clean(c.title, 60);
      if (!key || seen[key]) return;
      seen[key] = true;
      // 可见性：`visibility=hidden` 的归档**一律不出**（与 chrono.chronicle 的关口同口径）。
      if (clean(c.visibility, 20) === 'hidden') return;
      const head = redactText(clean(c.title, 80));
      const body = redactText(clean(c.summary, 160));
      const trimmed = head.trimmed + body.trimmed;
      if (trimmed) { redacted++; stat.redacted += trimmed; }
      const parts = [head.text, body.text].filter(Boolean);
      // 脱敏后什么都不剩 ⇒ 这条**整条剔除**（而不是导出一条空传说）：
      //   「有一条空传说」与「这条没说出口」在读数上必须分开。
      if (!parts.length) { stat.dropped++; return; }
      rows.push({ kind: kind, label: LEGEND_LABEL[kind],
        title: head.text || LEGEND_LABEL[kind], summary: parts.join('；'),
        at: (typeof c.at === 'number' && isFinite(c.at)) ? c.at : 0, redacted: trimmed > 0 });
    });
    if (!rows.length) { noteFault('nothing-to-export'); return { ok: false, reason: 'nothing-to-export', sig: wk.sig, seen: all.length }; }
    rows.sort(function (a, b) { return b.at - a.at; });
    const capped = rows.slice(0, cfg.maxExported);
    const pack = { format: 'worldaxis-legend-pack', formatVer: 1, sig: wk.sig, title: wk.title,
      player: wk.player, exportedAt: clockNow(), count: capped.length, legends: capped };
    stat.exported++; stat.lastReason = 'exported';
    return { ok: true, sig: wk.sig, redacted: redacted, dropped: stat.dropped,
      exported: capped.length, total: rows.length,
      // 脱敏口径**随返回值一起给出**：调用方看到的是「剔了几句」，不是一句「已脱敏」。
      privateWords: PRIVATE.slice(), pack: pack };
  }

  /**
   * 导入传说：收别世界的传说包，存进 `worldBridge.legends`（**以听说的身份**）。
   *   这是本模块**唯一**的写入口，且它只写传说链 —— 不碰 worldFacts / chronicle / sediment
   *   （见文件头边界 2：传说直接写进世界事实，下一轮就变成「这里发生过的事」）。
   */
  function importLegends(pack, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const p = (pack && typeof pack === 'object' && !Array.isArray(pack)) ? pack : null;
    if (!p) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'pack' }; }
    const list = Array.isArray(p.legends) ? p.legends : null;
    if (!list) { noteFault('bad-payload'); return { ok: false, reason: 'bad-payload', field: 'legends' }; }
    if (!list.length) { noteFault('no-legends'); return { ok: false, reason: 'no-legends' }; }
    const wk = worldKey();
    const from = clean(p.sig, 16);
    // 同签名 = 本世界自己的回灌。**拒收**而不是「导入 0 条」：后者看起来像是别处传了空的过来。
    if (from && wk.sig && from === wk.sig) { noteFault('self-origin'); return { ok: false, reason: 'self-origin', sig: wk.sig }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    let rows = [], malformed = 0;
    list.forEach(function (l) {
      if (!l || typeof l !== 'object') { malformed++; return; }
      const kind = LEGEND_KINDS.indexOf(clean(l.kind, 16)) >= 0 ? clean(l.kind, 16) : null;
      // 档位不在闭集里的行**逐条剔除**（不是整包拒收）：一个来源写错了一个档位，
      //   不该让其余几条一起进不来 —— 但剔除数必须如实报出。
      if (!kind) { malformed++; return; }
      const title = clean(l.title, 80), summary = clean(l.summary, 200);
      if (!title && !summary) { malformed++; return; }
      rows.push({ id: 'lg_' + (from || 'anon') + '_' + hash8(kind + '|' + title + '|' + summary),
        from: from || 'anonymous', fromTitle: clean(p.title, 80), kind: kind, label: LEGEND_LABEL[kind],
        title: title || LEGEND_LABEL[kind], summary: summary, at: (typeof l.at === 'number' && isFinite(l.at)) ? l.at : 0,
        atDays: (typeof l.at === 'number' && isFinite(l.at)) ? Math.floor(l.at / MS_PER_DAY) : null,
        source: 'another-world', importedAt: clockNow(), heard: 0 });
    });
    if (!rows.length) { noteFault('nothing-to-import'); return { ok: false, reason: 'nothing-to-import', malformed: malformed }; }
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const seen = {}, have = {};
      b.legends.forEach(function (x) { if (x && x.id) have[x.id] = true; });
      const fresh = [];
      rows.forEach(function (r) { if (have[r.id] || seen[r.id]) return; seen[r.id] = true; fresh.push(r); });
      // v2.154.0（实施自纠）：环容量走 **per-call** 并把 `maxLegends` 真传进去 ——
      //   只登记静态 cap 而设置另有一套，会让「把传说环调大」变成一个点了没效果的开关
      //   （本仓口径：cap 与执行同源；per-call 站点的上限就是设置项）。
      fresh.forEach(function (r) { b.legends.push(r); WA.evict.array(b.legends, 'worldBridge.legends', cfg.maxLegends); });
      if (o.remember) {
        // 「已导入过」环：只记签名与时间（**不记传说内容**）——它的用途是去重与「别处的世界来过」，
        //   不是第二份传说环。
        b.exported = Array.isArray(b.exported) ? b.exported : [];
        b.exported.push({ sig: from || 'anonymous', title: clean(p.title, 80), at: clockNow(), count: fresh.length });
        WA.evict.array(b.exported, 'worldBridge.exported');
      }
      b.lastImportAt = clockNow();
      out = { added: fresh.length, dup: rows.length - fresh.length, malformed: malformed, total: b.legends.length };
    }, 'worldBridge:import');
    if (!out || !out.added) {
      stat.lastReason = 'all-duplicates';
      return { ok: true, added: 0, dup: out ? out.dup : rows.length, malformed: malformed,
        reason: 'all-duplicates', sig: wk.sig };
    }
    stat.imported += out.added; stat.lastReason = 'imported';
    return { ok: true, added: out.added, dup: out.dup, malformed: out.malformed, total: out.total,
      sig: wk.sig, source: from || 'anonymous' };
  }

  /**
   * 传说**显式**交给 rumor 链（跨模块传播面）。
   *   为什么不是自动转交：rumor 的链必须挂在**已存在的事实键**上（`unknown-fact` 是硬拒收）。
   *   故本函数先把传说落成一条**世界事实**（`memory.upsertFact`），再起链 ——
   *   两步都成才是「传出去了」；任一步失败如实报出对应原因，不吞。
   *   注意这与边界 2 不矛盾：**导入**不写世界事实（传说还只是「听说的」）；
   *   而要把传闻变成这个世界里流通的消息，就必须先落事实 —— 这一步是**显式的**，由调用方决定。
   */
  function toRumor(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = clean(id, 80);
    if (!k) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'id' }; }
    const row = rowsOf('legends').filter(function (r) { return r && r.id === k; })[0] || null;
    if (!row) { noteFault('unknown-legend'); return { ok: false, reason: 'unknown-legend', id: k }; }
    if (!WA.rumor || typeof WA.rumor.startChain !== 'function') { noteFault('rumor-absent'); return { ok: false, reason: 'rumor-absent' }; }
    if (!WA.store || typeof WA.store.transact !== 'function') { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const factKey = clean(o.factKey, 80) || ('legend:' + row.id);
    // ① 先把传说落成**一条世界事实**（世界事实的唯一载体是 `worldFacts`，与 causal 的
    //   `causal:<id>` 同款做法：不另立容器、不调用别的模块的内部写口做第二真源）。
    //   为什么必须落：rumor 的链只能挂在已存在的事实键上（`unknown-fact` 是硬拒收），
    //   不落事实而直接起链，唯一的结果是这条传说永远传不出去。
    const val = row.title + (row.summary ? '：' + row.summary : '');
    let factAdded = false;
    WA.store.transact(function (draft) {
      draft.worldFacts = Array.isArray(draft.worldFacts) ? draft.worldFacts : [];
      if (!draft.worldFacts.some(function (w) { return w && w.key === factKey; })) {
        draft.worldFacts.push({ id: 'wf_' + factKey, key: factKey, value: val,
          scope: 'world', source: 'another-world', at: clockNow() });
        factAdded = true;
        WA.evict.array(draft.worldFacts, 'backstage.worldFacts');
      }
      const b = bucket(draft);
      b.legends.forEach(function (x) { if (x && x.id === row.id) x.heard = (x.heard || 0) + 1; });
    }, 'worldBridge:to-rumor');
    // ② 起链（**独立一步**：rumor.startChain 自己开事务，在事务里再开事务就是嵌套事务）。
    //   事实缺席/被别人抢先删掉时 rumor 会硬拒收 `unknown-fact` —— 如实透传，不替世界编一条事实。
    const r = WA.rumor.startChain(factKey, '远方的传说（' + (row.fromTitle || row.from) + '）');
    if (r && r.ok) {
      stat.relays++; stat.lastReason = 'relayed';
      return { ok: true, id: k, factKey: factKey, factAdded: factAdded, chain: r.id || null,
        heard: (rowsOf('legends').filter(function (x) { return x && x.id === row.id; })[0] || {}).heard || 0 };
    }
    // 链没起成：**事实不回滚**（它确实被记下了，删掉就是篡改），如实报出链侧原因。
    noteFault((r && r.reason) || 'relay-failed');
    return { ok: false, reason: (r && r.reason) || 'relay-failed', factKey: factKey, factAdded: factAdded };
  }

  /** 收进来的传说（只读）。`filter.from` 可选（只看某个来源世界）。 */
  function view(opts) {
    const o = (opts && typeof opts === 'object') ? opts : {};
    const want = clean(o.from, 16);
    const list = rowsOf('legends').filter(function (r) { return r && (!want || r.from === want); });
    return { ok: true, count: list.length, rows: list.map(function (r) {
      return { id: r.id, from: r.from, fromTitle: r.fromTitle, kind: r.kind, label: r.label,
        title: r.title, summary: r.summary, at: r.at, atDays: r.atDays,
        source: r.source || 'another-world', heard: r.heard || 0, importedAt: r.importedAt };
    }) };
  }

  /**
   * 注入块。关闭或无内容时**返回空串**（不给老用户凭空多出约束）。
   *   只念收进来的传说，且**逐条标明来自别处**（`source:another-world`）——
   *   没这条标注，模型会把「听说的远方事」当成本地既成事实写下去。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const v = view();
    if (!v.count) return '';
    stat.blocks = (stat.blocks || 0) + 1;
    const rows = v.rows.slice(-cfg.maxItems);
    return '[远方的传说]' + String.fromCharCode(10)
      + '以下都是别的世界传出来的事，不是本世界发生过的（来源已标在每条后面）。' + String.fromCharCode(10)
      + '角色可以「听说过」它们，但**不得**把它们当成这里发生过的事实，也不得据此推断本地人物做过什么。' + String.fromCharCode(10)
      + rows.map(function (r) {
        return '- ' + r.label + '｜' + r.title + (r.summary ? '（' + r.summary + '）' : '')
          + '（来自：' + (r.fromTitle || r.from) + (r.heard ? '，已传开 ' + r.heard + ' 次' : '') + '）';
      }).join(String.fromCharCode(10));
  }

  function statOf() {
    const cfg = settings();
    const wk = worldKey();
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      enabled: !!cfg.enabled,
      sig: wk.sig, label: wk.label, identityComplete: wk.complete,
      legends: rowsOf('legends').length,
      exportedSigs: rowsOf('exported').length,
      seeds: (state().worldBridge && state().worldBridge.seeds) || 0,
      lastImportAt: (state().worldBridge && state().worldBridge.lastImportAt) || null,
      caps: { legends: cfg.maxLegends, exported: cfg.maxExported, maxItems: cfg.maxItems },
      kinds: LEGEND_KINDS.slice()
    });
  }

  WA.worldBridge = {
    LEGEND_KINDS: LEGEND_KINDS.slice(),
    LEGEND_LABEL: Object.assign({}, LEGEND_LABEL),
    KINDS_OF: JSON.parse(JSON.stringify(KINDS_OF)),
    PRIVATE: PRIVATE.slice(),
    getSettings: settings,
    setSettings: saveSettings,
    worldKey: worldKey,
    seed: seed,
    exportLegends: exportLegends,
    importLegends: importLegends,
    toRumor: toRumor,
    view: view,
    buildBlock: buildBlock,
    stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-bridge.js', { kind: 'engine', ver: '2.154.0' });
})();
