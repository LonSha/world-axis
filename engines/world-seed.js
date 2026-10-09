/**
 * WorldAxis engines/world-seed.js (v2.158.0) — 世界生成种子库（RX8）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓答得出「这个世界现在怎么样」（world / evolution / charters 三面读数），
 *   但答不出玩家真正会问的那一句：**「我想重开一局，但想要一个和这次类似的世界。」**
 *   重开一局 = 骨头（势力格局 / 人物关系网 / 地理/ 时代背景）从零开始，
 *   而「上一局是什么样的世界」没存过任何结构化摘要：能导出的是
 *   **别人的传说**（world-bridge）与**往事**（chronicle），不是**格局**。
 *   一句话：**能导出故事，不能导出世界。**
 *
 * ── 本模块落点（提取 / 保存 / 播种，三件东西）────────────────
 *   · extract(opt) —— 从当前世界提取**结构种子**：势力格局 / 人物关系网 /
 *     地理特征 / 时代背景。**只取骨头，不取事件进度**（编年史 / 暗流 / 回声
 *     / 章节一律不进种子 —— 否则播种出来的是「同一个世界的续集」，不是新局）。
 *   · save(name, tags) —— 把上一次提取的种子存入种子库（环形，命名 + 标签）。
 *     同一结构不存两份（`duplicate-seed`）—— 库不是存档格，重复结构再多也只是噪声。
 *   · sow(seedId, variance) —— **返回播种计划**（JSON）。本模块**不写世界**：
 *     播种是「开一局」的动作，属于宿主（/reset / 新对话），不属于一个只读推导引擎。
 *
 * ── 与既有模块的分工（不许重叠）──────────────────────────────
 *   · `chronicle` / `world-bridge.exportLegends` —— 那是**故事**（发生过什么）；
 *     本模块是**格局**（这一局是什么样的一局）。合成会把「同一个世界继续玩」
 *     与「用同样的格局开新局」在两处读数上变成一件事。
 *   · `parallelWorld` —— 那是**同时并行的另一条线**（共享时间轴）；本模块不推进时间，
 *     只把一个格局拍成可重放的快照。
 *   · `store` / `core/evict` —— 种子库走骨架物化 + evict 单一出口（跨会话要留下）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**开**（只提取，不写世界）。
 *   2 **只写自己那一格**：本模块对世界的唯一写动作是**一次 `store.transact`**，
 *     且只写 `worldSeed.library` —— 不碰世界任何别的字段（零 `d.people` / 零 `d.chronicle`）。
 *   3 **不播种**：`sow()` 只返回计划。真去重置世界是宿主的职责，
 *     一个「自己会开新局」的引擎在长局里是不可接受的（玩家没让它重开）。
 *   4 **不含事件进度**：种子结构里不得出现编年史 / 暗流 / 回声 / 章节 / 轮次；
 *     判据是白名单（只列出哪些键进种子），不是黑名单。
 *   5 同结构不存两份（`duplicate-seed` 带 `existing` id）—— 去重靠签名，不靠名字。
 *   6 库有界：`libCap` 到顶即拒收 `library-full`（不静默挤掉旧种子）。
 *   7 变异度闭区间 `[0,100]`：越界拒收 `bad-value`（带 allowed），
 *     绝不静默夹住 —— 「你要的变异度」与「真发生的变异度」长得一样是最坏的读数。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_world_seed_v1';
  const DEF = {
    enabled: true,
    libCap: 12         // 种子库环（长局膨胀的第一道闸）
  };
  const __REG = { key: LS_KEY, def: { enabled: true, libCap: 12 }, module: 'worldSeed',
    bounds: { libCap: [2, 60] } };

  const SEED_VER = 1;
  // v2.158.0（S3）：转移包格式版本。老格式（无 packVer）拒收 bad-pack-ver（带 supported），
  //   绝不静默按 v1 猜着收 —— 「包是好的只是旧」与「包是坏的」在处置上是两件事（等迁移器 vs 重打包）。
  const PACK_VER = 1;
  // v2.158.0（S3）：初始化留痕的保留层。种子只记名字与档位，不记 id / 原文 ——
  //   initConfirm 恢复的是「格局」，不是「同一个世界」。预览必须如实声明这一层。
  const RETAIN_NOTE = '保留层级：势力名字与权重、人物显示名与关系档位（near/mid/far）、地名与道路数量、时代标签与背景首行。不保留：人物 id / 道路端点 / 编年史 / 暗流 / 回声 / 记忆 / 伏笔 —— 本格式不还原原世界的身份与历史。';
  const VARIANCE = { min: 0, max: 100 };
  const TAGS = ['三国鼎立', '都市商战', '田园', '门派', 'other'];

  const _stat = { extracts: 0, saves: 0, sows: 0, refused: 0, lastReason: '', faults: {} };
  function note(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }
  function num(v) { const n = (v === null || v === undefined || v === '') ? NaN : Number(v); return isFinite(n) ? n : null; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  // 决策时间的守卫形态与全库一致（兜底与守卫声明同行共现）。
  const clockNow = function () { try { return WA.clock.now('worldSeed'); } catch (e) { return Date.now(); } };


  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, __REG.def, raw || {}))
                          : Object.assign({}, __REG.def, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** FNV-1a 取低 32 位十六进制（与 world-bridge 同族手法）。 */
  function sig(s) {
    let h = 2166136261;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  /** 势力格局：只取名字与权重（不取他们对彼此做过的具体事）。 */
  function powersOf(s) {
    const ev = (s.evolution && Array.isArray(s.evolution.factions)) ? s.evolution.factions : [];
    return ev.map(function (f) {
      return { name: clean(f && (f.name || f.id), 30), weight: num(f && f.power) === null ? 0 : num(f.power) };
    }).filter(function (x) { return !!x.name; }).slice(0, 24);
  }

  /** 人物关系网：节点 = 有名的人，边 = profile.relations 里的 target。**不带私密量值原文**，只带亲疏档。 */
  function networkOf(s) {
    const people = (s.people && typeof s.people === 'object') ? s.people : {};
    const ids = Object.keys(people);
    const nameOf = {};
    ids.forEach(function (id) { const p = people[id] || {}; nameOf[id] = clean(p.name || id, 30); });
    const nodes = ids.map(function (id) { return nameOf[id]; }).filter(Boolean).slice(0, 60);
    const edges = [];
    ids.forEach(function (id) {
      const rels = (people[id] && people[id].profile && Array.isArray(people[id].profile.relations))
        ? people[id].profile.relations : [];
      rels.forEach(function (r) {
        const t = r && (r.target || r.to || r.id);
        if (!t || !nameOf[t]) return;
        const band = (num(r.intimacy) || 0) >= 60 ? 'near' : ((num(r.intimacy) || 0) <= -30 ? 'far' : 'mid');
        edges.push([nameOf[id], nameOf[t], band]);
      });
    });
    return { nodes: nodes, edges: edges.slice(0, 120) };
  }

  /** 地理特征：地名与路数（**不取谁在哪**——那是进度，不是格局）。 */
  function geoOf(s) {
    const w = (s.world && typeof s.world === 'object') ? s.world : {};
    const places = (Array.isArray(w.places) ? w.places : []).map(function (p) { return clean(p && (p.name || p.id), 30); }).filter(Boolean);
    const roads = Array.isArray(w.roads) ? w.roads.length : 0;
    return { places: places.slice(0, 40), roads: roads };
  }

  function eraOf(s) {
    const bg = (s.background && typeof s.background === 'object') ? clean(s.background.text, 400) : '';
    const clk = (s.clock && typeof s.clock === 'object') ? clean(s.clock.label, 40) : '';
    return { title: bg ? bg.split('\n')[0].slice(0, 40) : '', label: clk, note: bg.slice(0, 200) };
  }

  /**
   * 从当前世界提取结构种子。
   *   白名单式提取：只有这四个面进种子，别的什么都不进（边界 4）。
   *   四张表全空 ⇒ `nothing-to-extract`（**不产一个空种子** —— 空种子播种出来的是空世界，
   *   而它在读数上与「这就是这局的格局」长得一样）。
   */
  function extract(opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const s = state();
    const raw = {
      ver: SEED_VER,
      powers: powersOf(s),
      network: networkOf(s),
      geo: geoOf(s),
      era: eraOf(s),
      at: num(s.evolution && s.evolution.round)
    };
    const empty = !raw.powers.length && !raw.network.nodes.length && !raw.geo.places.length && !raw.era.title;
    if (empty) { note('nothing-to-extract'); return { ok: false, reason: 'nothing-to-extract' }; }
    // 签名只由**结构面**决定（不含 at / 时间戳）：同格局两局提取出同一个签名，才谈得上去重。
    const canon = JSON.stringify({ powers: raw.powers, network: raw.network, geo: raw.geo, era: raw.era.label });
    raw.sig = sig(canon);
    _last = raw;
    _stat.extracts++; _stat.lastReason = 'extracted';
    return { ok: true, seed: raw, sig: raw.sig,
      counts: { powers: raw.powers.length, nodes: raw.network.nodes.length,
        edges: raw.network.edges.length, places: raw.geo.places.length },
      // 如实申明：本种子**不含**哪些东西（读的人不必去猜边界在哪）
      excluded: ['chronicle', 'currents', 'echoes', 'chapters', 'worldFacts', 'memory'] };
  }

  let _last = null;
  // v2.158.0（S3）：上一次 initPreview 落下的安装计划（含变异结果）。
  //   initConfirm 消费的是**这一份**，不重新抽随机数 —— 预览说「世界会长这样」，
  //   确认后世界就必须长这样（重抽 = 「你要的世界」与「真装的世界」长得一样，最坏的读数）。
  // v2.159.0（TP1）·**票据必须带目标聊天**：此前这一格是裸的计划对象，没有归属 ——
  //   在 A 聊天预览、切到 B 聊天确认，B 会被装上 A 的预览结果（本轮探针实证：
  //   `confirmed:true` / 目标人物出现 / `targetInit:true`，而源聊天一格未动）。
  //   现在它是一张**待确认票据**：{ seedId, sig, ver, variance, chatId, epoch, rev, plan, at }。
  //   为什么要记 rev（预览时的已确认读集版本）：预览断言的前提是「目标是空新局」，
  //     而确认那一刻目标可能已经被别的东西装过了（另一个标签页、别的手动写）。
  //     确认前与事务内各复核一次，把「预览时是空的」与「装的时候还是空的」分开举证。
  //   为什么记 epoch 而不只记 chatId：同一聊天重载/重新 init 之后，聊天 id 逐字相同而
  //     世界已经换了一代 —— 只比 id 会把「重载前预览、重载后确认」放过去。
  //   生命周期序号（previewSeq）不是给校验用的，是给**取证**用的：确认回执里带上它，
  //     用户与专锁都能指出「这次装的是第几次预览的那份」。
  let _pending = null;
  let _previewSeq = 0;
  /** 当前聊天身份三面（聊天 id / 纪元 / 已确认读集版本）。取不到时如实置空，不抛。 */
  function chatIdentity() {
    let chatId = '', epoch = null, rev = null;
    try { chatId = (WA.store && typeof WA.store.chatId === 'function') ? String(WA.store.chatId() || '') : ''; } catch (e) {}
    try { epoch = (WA.store && typeof WA.store.epoch === 'function') ? WA.store.epoch() : null; } catch (e) {}
    try { rev = (WA.store && typeof WA.store.committedRev === 'function') ? WA.store.committedRev() : null; } catch (e) {}
    return { chatId: chatId, epoch: epoch, rev: rev };
  }
  /** 票据失效（切聊天、切走又切回、重新导入、取消、目标变化、已被确认消费）。
   *  同时把 store 侧那张票丢掉：票在 store 的在册表里占一格（CLAIM_CAP=64），
   *  不丢的话「用户反复预览又取消」会把表挤满，真在飞的票被挤出表 —— 那时
   *  settleAsync 报 missing-key，读起来像「票过期了」，实际是「我们自己没回收」。 */
  function clearPending(reason) {
    if (!_pending) return false;
    const tk = _pending.ticket;
    _pending = null;
    if (tk && WA.store && typeof WA.store.dropAsync === 'function') {
      try { WA.store.dropAsync(tk); } catch (e) {}
    }
    _stat.pendingCleared = (_stat.pendingCleared || 0) + 1;
    _stat.lastClearedReason = reason || 'cleared';
    return true;
  }
  /**
   * v2.159.0（TP1）·归属结算。**以 store 的异步归属票据为唯一真源** ——
   *   计划原话是「基于现有 staleGuard / store 机制核查可复用部分，不另造一套全局聊天状态」，
   *   所以聊天 id / 纪元 / 读集版本这三面不在这里自己比，而是让 `WA.store.settleAsync` 判。
   *   为什么不自比：自比只能看见「本模块记下的三面」，而世界被谁写过、纪元为何推进，
   *   真源都在 store —— 两处各记一份必然漂移（本仓的「同一事实两处口径」老病）。
   *   返回 null = 放行；非 null = 拒收体。
   *   回落：宿主桩没有 store 票据原语时，用票面自带的三面比（合成宿主仍要能跑）。
   */
  function settleOwnership(opt) {
    // 读集版本**只记账不拒收**（与 store 默认口径一致）。为什么本模块不用 strictRev：
    //   实测过一次——`drop()`（删种子）本身也是一次 world 写，会推进 stateRev；
    //   若严格拒收，「删了种子再确认」会被报成 `stale-rev`（世界被写过），
    //   而真因是 `unknown-seed`（计划已无出处）。**更具体的诊断被更粗的诊断盖掉**，
    //   用户照回执去查「谁写了世界」永远查不到东西（本仓点名的「读数不实」）。
    //   空局前提不靠 rev 兜：它由 initConfirm 的事务外预检 + 事务内 draft 复核承担，
    //   那两处判的是**真的还空吗**，比「版本动过没有」更贴前提。
    if (_pending.ticket && WA.store && typeof WA.store.settleAsync === 'function') {
      const r = WA.store.settleAsync(_pending.ticket, { site: 'worldSeed:initConfirm' });
      if (r && r.ok === true) return null;
      const rs = (r && r.reason) || 'missing-key';
      // missing-key：票不在册（过期 / 被挤出 / 已被消费）。这不是「没预览过」，如实分开报。
      if (rs === 'missing-key') {
        note('pending-mismatch');
        return { ok: false, reason: 'pending-mismatch', at: 'claim',
          detail: '预览票据已不在册（超过 30 分钟、被挤出，或已被消费）——计划无法证明还属于当前局',
          hint: '重新 initPreview() 再确认' };
      }
      note(rs);
      const map = {
        'foreign-chat': 'foreign-chat', 'stale-epoch': 'stale-epoch', 'stale-rev': 'stale-rev'
      };
      const reason = map[rs] || rs;
      const hint = reason === 'foreign-chat'
        ? '跨聊天不能确认 —— 请在预览的那个聊天里确认，或在新聊天重新预览'
        : (reason === 'stale-epoch'
          ? '聊天已重载/重新初始化 —— 预览时的现场已不是同一份，请重新预览'
          : '预览之后这个世界已经被写过 —— 「目标是空新局」这个前提不再成立，请重新预览');
      return Object.assign({}, r, { ok: false, reason: reason, hint: hint, at: 'claim' });
    }
    // 回落：无 store 票据原语（合成宿主桩）。三面自比，口径与 store 一致。
    const now = chatIdentity();
    const want = (opt && opt.chatId !== undefined && opt.chatId !== null) ? String(opt.chatId) : now.chatId;
    if (_pending.chatId !== want) {
      note('foreign-chat');
      return { ok: false, reason: 'foreign-chat',
        detail: '这份待确认计划属于聊天「' + _pending.chatId + '」，当前是「' + want + '」',
        was: { chatId: _pending.chatId, epoch: _pending.epoch, rev: _pending.rev },
        now: { chatId: now.chatId, epoch: now.epoch, rev: now.rev },
        hint: '跨聊天不能确认 —— 请在预览的那个聊天里确认，或在新聊天重新预览' };
    }
    if (_pending.epoch !== null && now.epoch !== null && _pending.epoch !== now.epoch) {
      note('stale-epoch');
      return { ok: false, reason: 'stale-epoch',
        detail: '聊天纪元已推进（' + _pending.epoch + ' → ' + now.epoch + '）——重载/重新初始化之后，预览时的现场已经不是同一份',
        was: { epoch: _pending.epoch, rev: _pending.rev }, now: { epoch: now.epoch, rev: now.rev } };
    }
    if (_pending.rev !== null && now.rev !== null && _pending.rev !== now.rev) {
      note('stale-rev');
      return { ok: false, reason: 'stale-rev',
        detail: '世界读集版本已变化（' + _pending.rev + ' → ' + now.rev + '）——「目标是空新局」这个前提不再成立',
        was: { rev: _pending.rev }, now: { rev: now.rev }, hint: '请重新预览' };
    }
    return null;
  }
  /**
   * 票据复核。返回 `null` = 放行；非 null = 拒收体（调用方**必须**丢弃这份计划）。
   *   判据三条，全部指向同一件事：**这张票还是这个局的票吗**。
   *     · 聊天 id 不一致 ⇒ foreign-chat（本轮实证的缺陷形态）
   *     · 纪元不一致     ⇒ stale-epoch（同聊天重载后确认）
   *     · 种子/格式/变异与计划对不上 ⇒ pending-mismatch（票据被外部改写）
   *   读集版本（rev）只**记账不拒收**：预览本身不改世界，而预览与确认之间发生任何一次
   *     无关的世界写（比如 after 链的其它引擎）都会推进 rev —— 拿它当拒收条件会让
   *     「预览之后干点别的再确认」这种完全正当的用法永久失败。它进回执，供取证。
   */
  function pendingVerdict(opt) {
    if (!_pending) return { ok: false, reason: 'no-preview', hint: '先 initPreview() 再 initConfirm()' };
    // ① 归属（聊天 / 纪元 / 读集版本）—— 交给 store 票据结算，不在这里自比。
    const own = settleOwnership(opt);
    if (own) return own;
    // ② 票面自洽：票据被外部改写（计划签名或变异度对不上）时，装下去的不是预览那份。
    if (!_pending.plan || _pending.plan.sig !== _pending.sig || _pending.plan.variance !== _pending.variance) {
      note('pending-mismatch');
      return { ok: false, reason: 'pending-mismatch', detail: '待确认计划与票据不符（种子签名或变异度对不上）' };
    }
    // ③ 预览后种子被删（TP1 验收清单里的一条）：库里的行没了，这份计划就没有出处了。
    //   为什么必须查：种子库与待确认票据是**两处状态**，`drop()` 只动库 —— 不查的话，
    //   「删了种子再确认」仍会把那份已经不属于任何种子的格局装进世界。
    const still = listOf().filter(function (x) { return x && x.id === _pending.seedId; })[0];
    if (!still) {
      note('unknown-seed');
      return { ok: false, reason: 'unknown-seed', id: _pending.seedId,
        detail: '预览用的种子已不在库中（预览后删除/被挤出）—— 计划已无出处' };
    }
    return null;
  }

  function bucket(root) {
    const r = root || state();
    if (!r.worldSeed || typeof r.worldSeed !== 'object') r.worldSeed = { library: [], seq: 0 };
    if (!Array.isArray(r.worldSeed.library)) r.worldSeed.library = [];
    return r.worldSeed;
  }
  function listOf() { return bucket().library || []; }

  function tagsOf(tags) {
    const arr = Array.isArray(tags) ? tags : (tags ? String(tags).split(/[,，]/) : []);
    return arr.map(function (x) { return clean(x, 16); }).filter(function (x) { return TAGS.indexOf(x) >= 0; }).slice(0, 4);
  }

  /**
   * 保存：把上一次 `extract()` 的种子存入库（命名 + 标签 + 上下文字符串）。
   *   一次 `store.transact`，只写 `worldSeed.library`（边界 2）。
   */
  function save(name, tags, opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const nm = clean(name, 30);
    if (!nm) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'name' }; }
    const seed = (opt && opt.seed) ? opt.seed : _last;
    if (!seed || !seed.sig) { note('nothing-to-extract'); return { ok: false, reason: 'nothing-to-extract', hint: '先 extract() 再 save()' }; }
    const lib = listOf();
    const dup = lib.filter(function (x) { return x && x.seed && x.seed.sig === seed.sig; })[0];
    if (dup) {
      // 同结构不存两份（边界 5）：去重靠签名、不靠名字 —— 换个名字存同一格局仍是噪声。
      note('duplicate-seed');
      return { ok: false, reason: 'duplicate-seed', existing: dup.id, sig: seed.sig };
    }
    if (lib.length >= Math.max(1, Math.floor(cfg.libCap))) {
      note('library-full'); return { ok: false, reason: 'library-full', cap: cfg.libCap };
    }
    // v2.155.0 自纠（全量回归当场抓到）：原兜底分支 `'ws_' + Date.now() + '_' + Math.floor(Math.random()*1e6)`
    //   同时破了本仓两条硬纪律 —— ① 产品文件不得出现 Math.random（只有 core/rand.js 的自动种子一处）；
    //   ② 产品代码零裸调 Date.now()。而且它**自我矛盾**：签名（sig）刻意做到不含时间戳，
    //   好让同一个世界存两次能认出来是重复；id 却用时间戳 —— 去重的判据与标识的生成用了两套时间观。
    //   标识流走 rand.id（与 entities / enemies / editor-* 同形），rand 缺席即显式报错不兜底。
    const id = WA.rand.id('ws_', 4, 'id');
    const row = { id: id, name: nm, tags: tagsOf(tags), seed: seed, at: clockNow() };
    const res = doWrite(function (b) {
      b.library.push(row);
      b.seq = (b.seq || 0) + 1;
      // 环容量走 **per-call** 并把 `libCap` 真传进去（本仓口径：cap 与执行同源）。
      //   静态登记 cap 而设置另有一套，会让「把库调大」变成一个点了没效果的开关
      //   —— v2.154.0 刚为这一族病付过价（world-bridge 传说环）。
      if (WA.evict && typeof WA.evict.array === 'function') WA.evict.array(b.library, 'worldSeed.library', cfg.libCap);
    });
    if (!res.ok) { note(res.reason); return res; }
    _stat.saves++; _stat.lastReason = 'saved';
    return { ok: true, id: id, name: nm, tags: row.tags, total: listOf().length };
  }

  /**
   * 库的写口：**一次 transact、只写自己那一格**（`worldSeed.library`）。
   *   为什么不是「零 transact」：种子库是**跨会话要留下**的世界资产（重开一局要能选到它），
   *   与 eco-audit 那种进程态只读审计面不同口径。它的边界不是「不写」，是「只写自己那一格」。
   */
  function doWrite(fn) {
    if (!WA.store || typeof WA.store.transact !== 'function') return { ok: false, reason: 'store-unavailable' };
    const r = WA.store.transact(function (root) { fn(bucket(root)); }, 'worldSeed:library');
    if (r && r.ok === false) return { ok: false, reason: r.reason || 'store-unavailable' };
    return { ok: true };
  }

  function get(id) {
    const k = clean(id, 60);
    if (!k) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'id' }; }
    const row = listOf().filter(function (x) { return x && x.id === k; })[0];
    if (!row) { note('unknown-seed'); return { ok: false, reason: 'unknown-seed', id: k }; }
    return { ok: true, row: row };
  }

  function drop(id) {
    const k = clean(id, 60);
    if (!k) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'id' }; }
    if (!listOf().some(function (x) { return x && x.id === k; })) { note('unknown-seed'); return { ok: false, reason: 'unknown-seed', id: k }; }
    const res = doWrite(function (b) {
      b.library = b.library.filter(function (x) { return !(x && x.id === k); });
    });
    if (!res.ok) { note(res.reason); return res; }
    _stat.lastReason = 'dropped';
    return { ok: true, id: k, total: listOf().length };
  }

  function list() {
    return { ok: true, rows: listOf().map(function (x) {
      return { id: x.id, name: x.name, tags: (x.tags || []).slice(), sig: x.seed && x.seed.sig,
        at: x.at, counts: { powers: (x.seed && x.seed.powers || []).length,
          nodes: (x.seed && x.seed.network && x.seed.network.nodes || []).length,
          places: (x.seed && x.seed.geo && x.seed.geo.places || []).length } };
    }) };
  }

  /**
   * 播种计划。**不写世界**（边界 3）—— 返回一份 JSON：从种子重建骨头、进度归零。
   *   变异度越界拒 `bad-value`（不静默夹住，边界 7）。
   */
  function sow(seedId, variance) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const got = get(seedId);
    if (!got.ok) return got;
    let v = 0;
    if (variance !== undefined && variance !== null && variance !== '') {
      const n = num(variance);
      if (n === null || n < VARIANCE.min || n > VARIANCE.max) {
        note('bad-value'); return { ok: false, reason: 'bad-value', field: 'variance',
          allowed: [VARIANCE.min, VARIANCE.max], got: variance };
      }
      v = Math.floor(n);
    }
    const sd = got.row.seed || {};
    // 变异度只动**名字后缀与权重**（不动结构）——高变异不等于换一个格局，
    //   否则「同一个种子高变异」与「另一个种子」在读数上长得一样。
    const jitter = function (base, i) {
      if (!v) return base;
      const step = (WA.rand && typeof WA.rand.int === 'function') ? WA.rand.int(0, v) : (i * 7 % (v + 1));
      return base + step / 100;
    };
    const plan = {
      fromSeed: got.row.id, name: got.row.name, sig: sd.sig, variance: v,
      powers: (sd.powers || []).map(function (p, i) { return { name: p.name, weight: jitter(p.weight || 0, i) }; }),
      network: { nodes: (sd.network && sd.network.nodes || []).slice(),
        edges: (sd.network && sd.network.edges || []).slice() },
      geo: { places: (sd.geo && sd.geo.places || []).slice(), roads: (sd.geo && sd.geo.roads) || 0 },
      era: sd.era || {},
      // 进度面明确为零：这就是「开新局」与「读旧档」的分界线（本模块不写世界，故只声明）。
      progress: { round: 0, chronicle: 0, currents: 0, echoes: 0 },
      zeroProgress: true
    };
    _stat.sows++; _stat.lastReason = 'sowed';
    return { ok: true, plan: plan, variance: v, fromSeed: got.row.id };
  }

  /**
   * v2.158.0（S3）·转移包：把库里一颗种子打包成可跨聊天转移的 JSON。
   *   包带格式版本（PACK_VER）/ 来源（chatId）/ 结构签名（seed.sig）/ 容量界限（counts）。
   *   为什么不走「扩展全局库」：那要把全部聊天存档读进一个全局容器，扩大读取与迁移范围；
   *   显式包 = 转移多少读多少，边界在包上（NEXT_PLAN 对 S3 的原话裁决）。
   */
  function transferPack(seedId, max) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const got = get(seedId);
    if (!got.ok) return got;
    const sd = got.row.seed || {};
    const counts = { powers: (sd.powers || []).length,
      nodes: (sd.network && sd.network.nodes || []).length,
      edges: (sd.network && sd.network.edges || []).length,
      places: (sd.geo && sd.geo.places || []).length };
    if (counts.powers > 24 || counts.nodes > 60 || counts.edges > 120 || counts.places > 40) {
      note('pack-too-big');
      return { ok: false, reason: 'pack-too-big', counts: counts,
        limits: { powers: 24, nodes: 60, edges: 120, places: 40 } };
    }
    const want = num(max);
    if (want !== null && want <= 0) { note('bad-value'); return { ok: false, reason: 'bad-value', field: 'max', got: max }; }
    _stat.packs = (_stat.packs || 0) + 1; _stat.lastReason = 'packed';
    return { ok: true, pack: {
      packVer: PACK_VER,
      chatId: (WA.store && typeof WA.store.chatId === 'function') ? String(WA.store.chatId() || 'wa_default') : 'wa_default',
      at: clockNow(),
      counts: counts,
      name: got.row.name, tags: (got.row.tags || []).slice(),
      seed: {
        ver: sd.ver || SEED_VER, sig: sd.sig, at: sd.at,
        powers: (sd.powers || []).slice(),
        network: { nodes: (sd.network && sd.network.nodes || []).slice(),
                   edges: (sd.network && sd.network.edges || []).slice() },
        geo: { places: (sd.geo && sd.geo.places || []).slice(), roads: num(sd.geo && sd.geo.roads) || 0 },
        era: Object.assign({}, sd.era || {})
      }
    } };
  }

  /**
   * v2.158.0（S3）·导入包：白名单校验接收，整批交付或整批拒收。
   *   四道门：格式版本（bad-pack-ver）/ 包形状（bad-pack）/ 种子白名单（bad-seed-keys）/ 库容量（library-full）。
   *   同签名不重收（duplicate-seed 带既有 id）—— 源侧的去重纪律不因跨聊天而放宽。
   */
  function importPack(pack, opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) { note('bad-pack'); return { ok: false, reason: 'bad-pack' }; }
    if (num(pack.packVer) !== PACK_VER) {
      note('bad-pack-ver');
      return { ok: false, reason: 'bad-pack-ver', got: pack.packVer, supported: PACK_VER };
    }
    const sd = pack.seed;
    if (!sd || typeof sd !== 'object') { note('bad-pack'); return { ok: false, reason: 'bad-pack' }; }
    // 白名单校验（与 extract 同口径）：种子里只准有这六个键，多一个即拒 ——
    //   不认识的键 = 未来格式或恶意载荷，静默收下等于把「不确定能装」伪装成「装下了」。
    const SEED_KEYS = ['ver', 'sig', 'at', 'powers', 'network', 'geo', 'era'];
    const gotKeys = Object.keys(sd).filter(function (k) { return SEED_KEYS.indexOf(k) < 0; });
    if (gotKeys.length) { note('bad-seed-keys'); return { ok: false, reason: 'bad-seed-keys', extra: gotKeys.slice(0, 8) }; }
    const powers = Array.isArray(sd.powers) ? sd.powers : [];
    const nodes = (sd.network && Array.isArray(sd.network.nodes)) ? sd.network.nodes : [];
    const edges = (sd.network && Array.isArray(sd.network.edges)) ? sd.network.edges : [];
    const places = (sd.geo && Array.isArray(sd.geo.places)) ? sd.geo.places : [];
    if (!powers.length && !nodes.length && !places.length && !(sd.era && sd.era.title)) {
      note('empty-seed'); return { ok: false, reason: 'empty-seed' };
    }
    if (powers.length > 24 || nodes.length > 60 || edges.length > 120 || places.length > 40) {
      note('pack-too-big');
      return { ok: false, reason: 'pack-too-big', counts: { powers: powers.length, nodes: nodes.length, edges: edges.length, places: places.length },
        limits: { powers: 24, nodes: 60, edges: 120, places: 40 } };
    }
    if (!sd.sig || !/^[0-9a-f]{8}$/.test(String(sd.sig))) { note('bad-sig'); return { ok: false, reason: 'bad-sig', got: sd.sig }; }
    const lib = listOf();
    const dup = lib.filter(function (x) { return x && x.seed && x.seed.sig === sd.sig; })[0];
    if (dup) { note('duplicate-seed'); return { ok: false, reason: 'duplicate-seed', existing: dup.id, sig: sd.sig }; }
    if (lib.length >= Math.max(1, Math.floor(cfg.libCap))) {
      note('library-full'); return { ok: false, reason: 'library-full', cap: cfg.libCap };
    }
    // 组装入座行（同一形状：id / name / tags / seed / at）。
    const nm = clean(opt && opt.name !== undefined ? opt.name : pack.name, 30) || '转移包种子';
    const id = WA.rand.id('ws_', 4, 'id');
    const seedIn = {
      ver: sd.ver || SEED_VER, sig: String(sd.sig), at: num(sd.at) || 0,
      powers: powers.map(function (p) { return { name: clean(p && p.name, 30), weight: num(p && p.weight) || 0 }; })
        .filter(function (p) { return !!p.name; }).slice(0, 24),
      network: { nodes: nodes.map(function (n) { return clean(n, 30); }).filter(Boolean).slice(0, 60),
                 edges: edges.slice(0, 120) },
      geo: { places: places.map(function (p) { return clean(p, 30); }).filter(Boolean).slice(0, 40),
             roads: num(sd.geo && sd.geo.roads) || 0 },
      era: { title: clean(sd.era && sd.era.title, 40), label: clean(sd.era && sd.era.label, 40), note: clean(sd.era && sd.era.note, 200) }
    };
    if (!seedIn.powers.length && !seedIn.network.nodes.length && !seedIn.geo.places.length && !seedIn.era.title) {
      note('empty-seed'); return { ok: false, reason: 'empty-seed' };
    }
    const res = doWrite(function (b) {
      b.library.push({ id: id, name: nm, tags: tagsOf(opt && opt.tags !== undefined ? opt.tags : pack.tags), seed: seedIn, at: clockNow() });
      b.seq = (b.seq || 0) + 1;
      if (WA.evict && typeof WA.evict.array === 'function') WA.evict.array(b.library, 'worldSeed.library', cfg.libCap);
    });
    if (!res.ok) { note(res.reason); return res; }
    _stat.imports = (_stat.imports || 0) + 1; _stat.lastReason = 'imported';
    return { ok: true, id: id, name: nm, fromChat: clean(pack.chatId, 60), total: listOf().length };
  }

  /**
   * v2.158.0（S3）·空新局判定：复用 store 默认骨架 + 存档来源信息，不只看 round === 0。
   *   世界资产（人物/暗流/纪事/事实/地名/道路）、事件进度（轮次/回声）、分支继承（meta.live），
   *   已有初始化来源（meta.initFrom）任一非空 ⇒ 非空（带哪一格的现场清单）。
   * v2.159.0（TP1）：可传入**指定状态对象**。为什么需要：确认要在事务内复核「目标还是空的吗」，
   *   而事务的候选是 draft、不是 `WA.store.get()` 那份 —— 拿 memCache 复核等于用事务外的旧值
   *   去证明事务内的前提（本仓反复治理的「判据与事实不同批」）。
   */
  function emptyCheck(at) {
    const s = (at && typeof at === 'object') ? at : state();
    const what = [];
    if (Object.keys(s.people || {}).length) what.push('people');
    if ((s.currents || []).length) what.push('currents');
    if ((s.chronicle || []).length) what.push('chronicle');
    if ((s.worldFacts || []).length) what.push('worldFacts');
    if ((s.world && s.world.places || []).length) what.push('world.places');
    if ((s.world && s.world.roads || []).length) what.push('world.roads');
    if ((s.evolution && s.evolution.factions || []).length) what.push('evolution.factions');
    if ((s.evolution && s.evolution.round || 0) > 0) what.push('evolution.round');
    if ((s.echoes || []).length) what.push('echoes');
    if (s.meta && s.meta.live) what.push('meta.live');
    if (s.meta && s.meta.initFrom) what.push('initFrom');
    if ((s.background && s.background.text || '').length) what.push('background.text');
    if ((s.clock && s.clock.label || '').length) what.push('clock.label');
    if (s.branch) what.push('branch');
    return { empty: what.length === 0, what: what };
  }

  /**
   * v2.158.0（S3）·初始化预览：把种子映射到现有状态字段，先建 id 映射、查引用完整性，
   *   返回拟写入结构 + 保留层级说明。变异在此生成**一次**（fixed），确认应用同一份。
   */
  function initPreview(seedId, variance, opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const got = get(seedId);
    if (!got.ok) return got;
    const ec = emptyCheck();
    if (!ec.empty) {
      note('not-empty');
      return { ok: false, reason: 'not-empty', what: ec.what,
        hint: '目标世界非空（' + ec.what.join('、') + '）—— 种子初始化只作用于空新局，不覆盖既有存档' };
    }
    let v = 0;
    if (variance !== undefined && variance !== null && variance !== '') {
      const n = num(variance);
      if (n === null || n < VARIANCE.min || n > VARIANCE.max) {
        note('bad-value'); return { ok: false, reason: 'bad-value', field: 'variance',
          allowed: [VARIANCE.min, VARIANCE.max], got: variance };
      }
      v = Math.floor(n);
    }
    const sd = got.row.seed || {};
    // 引用完整性：边 [from, to, band] 两端都必须在节点表内（查不到即悬空，不装断网世界）。
    const nodes = (sd.network && sd.network.nodes || []).map(function (n) { return clean(n, 30); }).filter(Boolean);
    const nodeSet = {}; nodes.forEach(function (n) { nodeSet[n] = true; });
    const edges = (sd.network && sd.network.edges || []).filter(function (e) {
      return Array.isArray(e) && nodeSet[clean(e[0], 30)] && nodeSet[clean(e[1], 30)];
    });
    // 变异（fixed：这一次生成完就定下来，确认不再重抽）。
    const jitter = function (base, i) {
      if (!v) return base;
      const step = (WA.rand && typeof WA.rand.int === 'function') ? WA.rand.int(0, v) : (i * 7 % (v + 1));
      return base + step / 100;
    };
    const plan = {
      fromSeed: got.row.id, name: got.row.name, sig: sd.sig, variance: v,
      powers: (sd.powers || []).map(function (p, i) { return { name: clean(p && p.name, 30), weight: jitter(num(p && p.weight) || 0, i) }; })
        .filter(function (p) { return !!p.name; }),
      network: { nodes: nodes.slice(), edges: edges.slice() },
      geo: { places: (sd.geo && sd.geo.places || []).map(function (p) { return clean(p, 30); }).filter(Boolean).slice(0, 40),
             roads: num(sd.geo && sd.geo.roads) || 0 },
      era: { title: clean(sd.era && sd.era.title, 40), label: clean(sd.era && sd.era.label, 40), note: clean(sd.era && sd.era.note, 200) },
      progress: { round: 0, chronicle: 0, currents: 0, echoes: 0 },
      zeroProgress: true,
      _fixed: true
    };
    if (!plan.powers.length && !plan.network.nodes.length && !plan.geo.places.length && !plan.era.title) {
      note('nothing-to-extract'); return { ok: false, reason: 'nothing-to-extract' };
    }
    // v2.159.0（TP1）：落票据而不是裸计划 —— 归属（chatId / epoch）、生命周期序号、
    //   种子签名与格式版本、预览时的已确认读集版本，全部随票携带。确认时逐条复核。
    //   归属判据的真源是 **store 的异步归属票据**（计划要求「不另造一套全局聊天状态」）：
    //   这里取一张票，确认时由 `settleAsync` 判它还是不是这个局的票。票面自带的三面
    //   只在宿主桩没有 store 原语时作回落（合成宿主仍要能跑）。
    const idn = chatIdentity();
    let ticket = null;
    if (WA.store && typeof WA.store.claimAsync === 'function') {
      try {
        const c = WA.store.claimAsync('worldSeed:initPreview');
        if (c && c.ok) ticket = c.ticket;
      } catch (e) {}
    }
    _previewSeq++;
    // 重新预览即换票：上一张票若还在册，先丢掉（否则它会在 store 表里挂到 TTL 到期）。
    if (_pending && _pending.ticket && _pending.ticket !== ticket &&
        WA.store && typeof WA.store.dropAsync === 'function') {
      try { WA.store.dropAsync(_pending.ticket); } catch (e) {}
    }
    _pending = { seedId: got.row.id, sig: sd.sig, ver: sd.ver || SEED_VER,
      variance: v, chatId: idn.chatId, epoch: idn.epoch, rev: idn.rev,
      seq: _previewSeq, plan: plan, at: clockNow(), ticket: ticket };
    _stat.previews = (_stat.previews || 0) + 1; _stat.lastReason = 'previewed';
    return { ok: true, plan: plan, retain: true, retainNote: RETAIN_NOTE,
      previewSeq: _previewSeq, chatId: idn.chatId, ticket: ticket,
      idMap: nodes.map(function (n) { return { display: n }; }) };
  }

  /**
   * v2.158.0（S3）·初始化确认：一次 store.transact 安装完整结构。
   *   无预览 ⇒ no-preview；目标非空 ⇒ not-empty；重复确认 ⇒ already（返回既有结果）。
   *   失败不半写（transact 原子性）；源聊天状态不在此碰（本函数只写目标世界的骨架字段）。
   * v2.159.0（TP1）：确认消费的是**带归属的票据**，不是一份无主的计划。三道门：
   *   ① `pendingVerdict` —— 这张票还是这个局的票吗（聊天 / 纪元 / 票据自洽）；
   *   ② 事务**外**的 not-empty 预检 —— 快速拒收，不动世界；
   *   ③ 事务**内**的 not-empty 复核 —— 用 draft 而不是 memCache（判据与事实同批）。
   *   为什么两道 not-empty 都要留：预检决定「要不要开事务」（事务开了再回滚也留痕），
   *   事务内复核决定「装不装」（从开事务到 mutator 执行之间，嵌套调用/钩子仍可能写过东西）。
   *   确认即消费票据；**拒收也消费** —— 一张对不上的票不该被反复拿去试（试第三次也不会对上）。
   */
  function initConfirm(opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    // 重复确认：先查 meta.initFrom（跨会话的持久真源 —— 确认后 _pending 已消费清空，
    //   再确认若先查 _pending 会误报 no-preview，而「装过了」与「没预览过」是两件事）。
    const s = state();
    if (s.meta && s.meta.initFrom) {
      note('already');
      return { ok: true, reason: 'already', installedAt: s.meta.initFrom.at,
        installed: s.meta.initFrom.installed, sig: s.meta.initFrom.sig, repeat: true };
    }
    // ① 归属复核（票据 → 当前局）。拒收时消费票据：它已经不可能再对上。
    const verdict = pendingVerdict(opt);
    if (verdict) {
      if (verdict.reason !== 'no-preview') clearPending('verdict:' + verdict.reason);
      return verdict;
    }
    // ② 事务外预检：快速拒收非空目标，不动世界。
    const ec = emptyCheck();
    if (!ec.empty) { clearPending('not-empty'); note('not-empty'); return { ok: false, reason: 'not-empty', what: ec.what }; }
    // 票据在进入事务前冻结成局部量：事务体内的 mutator 可能被嵌套调用打断，
    //   而 `_pending` 是模块级可变量 —— 事务中途被清空会让 mutator 读到 null（半写形态）。
    const t = _pending;
    const plan = t.plan;
    const now = clockNow();
    let out = null;
    let innerBlock = null;
    // 一次事务装完整结构（失败不半写 —— transact 内任何 return false / 抛错都会整批回滚）。
    const r = WA.store.transact(function (root) {
      // ③ 事务内复核：用 draft 而不是 memCache。开事务与 mutator 执行之间可能有别的东西
      //    已经写过世界（嵌套 transact / 插件钩子），此时「事务外看到的空」已经不是事实。
      const ecIn = emptyCheck(root);
      if (!ecIn.empty) { innerBlock = { ok: false, reason: 'not-empty', what: ecIn.what, atCommit: true }; return false; }
      root.evolution = root.evolution || {};
      root.evolution.factions = plan.powers.map(function (p, i) {
        return { id: WA.rand.id('fa_', 4, 'id'), name: p.name, scope: plan.era.title || '',
          status: '稳固', relation: '中立', currentGoal: '', core_person: '',
          powerPillars: [], power: p.weight };
      });
      root.people = {};
      plan.network.nodes.forEach(function (nm, i) {
        const id = WA.rand.id('np_', 4, 'id');
        // 建人走**唯一写者**（v2.86.0 A3）：产品面不许自己往 people 表塞新行 ——
        //   否则 personOriginStat().unlabeledCount 会把新局所有人算成「未标注」，
        //   与「旧存档条目」在读数上同形（「谁建的」这件事必须是可观测的）。
        //   无 registry 的合成宿主桩走等价兜底，并打 :fallback 后缀（同一口径）。
        const p = (WA.registry && typeof WA.registry.ensurePerson === 'function')
          ? (WA.registry.ensurePerson(root, id, nm, 'worldSeed').row || null)
          : (root.people[id] = { id: id, name: nm, knowledge: {}, createdVia: 'worldSeed:fallback', createdAt: now });
        if (!p) return;
        // 淘汰排序键（v2.61.0）：people 有界（cap 48，按 updatedAt 最旧优先挤出）——
        //   缺这一格，刚装好的世界会在首次容量治理时**优先被挤出**（新建的反而先死）。
        p.profile = { relations: [] };
        p.updatedAt = now;
      });
      // 关系档位 → 数值映射（near ≥ 60 / far ≤ -30 / mid 其余 —— 与 networkOf 提取侧的档位同源）。
      const nameToId = {};
      Object.keys(root.people).forEach(function (k) { nameToId[root.people[k].name] = k; });
      plan.network.edges.forEach(function (e) {
        const a = nameToId[clean(e[0], 30)], b = nameToId[clean(e[1], 30)];
        if (!a || !b || a === b) return;
        const iv = e[2] === 'near' ? 60 : (e[2] === 'far' ? -30 : 0);
        if ((root.people[a].profile.relations || []).some(function (r0) { return r0.target === b; })) return;
        root.people[a].profile.relations.push({ target: b, intimacy: iv, trust: 0, hostility: 0, vigilance: 0, attachment: 0, boundary_status: '', at: now });
      });
      root.world = root.world && typeof root.world === 'object' && !Array.isArray(root.world) ? root.world : {};
      root.world.places = plan.geo.places.map(function (nm, i) {
        return { id: 'pl_' + nm, name: nm, kind: 'public', parent: '',
          open: 0, close: 0, uses: [], at: now };
      });
      root.world.roads = [];   // 种子只记道路数量（geo.roads），不记端点 —— 如实落 0 条，不伪造。
      root.background = root.background && typeof root.background === 'object' ? root.background : {};
      root.background.text = plan.era.note || plan.era.title || '';
      root.background.updatedAt = now;
      root.clock = root.clock && typeof root.clock === 'object' ? root.clock : {};
      root.clock.label = plan.era.label || '';
      root.clock.source = root.clock.source === 'unset' ? 'engine' : root.clock.source;
      root.evolution.round = 0;
      root.chronicle = []; root.currents = []; root.echoes = [];
      root.meta = root.meta && typeof root.meta === 'object' ? root.meta : {};
      root.meta.initFrom = { seedId: t.seedId, sig: t.sig, name: plan.name,
        variance: plan.variance, at: now, chatId: t.chatId, previewSeq: t.seq,
        installed: { factions: plan.powers.length, places: plan.geo.places.length,
          nodes: plan.network.nodes.length, edges: plan.network.edges.length, roads: 0 } };
      out = { ok: true, installed: root.meta.initFrom.installed, installedAt: now,
        sig: t.sig, name: plan.name, variance: plan.variance,
        chatId: t.chatId, previewSeq: t.seq };
    }, 'worldSeed:initConfirm');
    if (r && r.ok === false) {
      // 事务内复核拦下（aborted）与存储失败要分开报：前者是「前提变了」，后者是「写不出去」。
      if (innerBlock) { note('not-empty'); return innerBlock; }
      note(r.reason || 'store-unavailable');
      return { ok: false, reason: r.reason || 'store-unavailable' };
    }
    _stat.confirms = (_stat.confirms || 0) + 1; _stat.lastReason = 'confirmed';
    _pending = null;   // 确认即消费：再确认走 already 分支（meta.initFrom 是真源）。
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function statOf() {
    const cfg = settings();
    return Object.assign({}, _stat, {
      faults: Object.assign({}, _stat.faults),
      enabled: !!cfg.enabled, libCap: cfg.libCap,
      total: listOf().length, hasLast: !!_last, lastSig: _last ? _last.sig : null,
      seedVer: SEED_VER, variance: Object.assign({}, VARIANCE), tags: TAGS.slice(),
      packs: _stat.packs || 0, imports: _stat.imports || 0,
      previews: _stat.previews || 0, confirms: _stat.confirms || 0,
      packVer: PACK_VER, hasPending: !!_pending, retainNote: RETAIN_NOTE
    });
  }

  WA.worldSeed = {
    SEED_VER: SEED_VER,
    VARIANCE: Object.assign({}, VARIANCE),
    TAGS: TAGS.slice(),
    getSettings: settings,
    setSettings: saveSettings,
    extract: extract,
    save: save,
    get: get,
    list: list,
    drop: drop,
    sow: sow,
    transferPack: transferPack,
    importPack: importPack,
    initPreview: initPreview,
    initConfirm: initConfirm,
    stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-seed.js', { kind: 'engine', ver: '2.158.0' });
})();
