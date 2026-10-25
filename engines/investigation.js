/**
 * WorldAxis engines/investigation.js (v2.194.0) — TX7 线索调查、证据核验与秘密揭示
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   intel 有来源/等级/核验/纠错，enigma 有秘密知情名单，rumor 有转述链与调查读数，
 *   noesis 有知情边界与泄露扫描。但「调查作为玩法」没有一条链：
 *   玩家不知道有哪些线索可调查、调查需要什么条件（地点/证人/时间）、
 *   调查产生了什么证据、证据够不够核验、核验后知情范围怎么扩展。
 *   investigation 补的就是这一层。
 *
 * ── 本模块落点（协调者，不替代）──────────────────────────────
 *   · register(spec) —— 登记可发现线索（名称 + 地点/证人条件 + 时间或资源成本 + 相关命题 + 证据来源）
 *   · investigate(clueId, person, opts) —— 选择调查方向，付出成本，产生证据回执
 *   · checkEvidence(clueId) —— 对照来源，由既有核验规则区分未证实/矛盾/已核实/无法判断
 *   · reveal(clueId, person) —— 证据达标后扩展知情范围（调 enigma.mark + intel.addIntel）
 *   · pending/view/buildBlock/diagnose/stat/reset
 *
 * ── 与既有模块的分工 ──
 *   · intel —— 来源/等级/核验（本模块调 addIntel 传递线索结论，调 truthOf 读事实，调 verify 核验）
 *   · enigma —— 秘密知情名单（本模块调 mark 扩展知情，调 read 检查已有知情）
 *   · rumor —— 转述链（本模块调 investigate 读链上信息，不自己造链）
 *   · noesis —— 知情边界（本模块调 knows 检查某人是否已知情，调 boundary 读知情面）
 *   · store/clock —— 原子提交与时间戳
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 默认关（enabled:false）。
 *   2 传闻不是事实——rumor 的转述链不等于证据，多人重复转述不制造多个独立证据。
 *   3 不存在的真实结论保持 unknown——truthOf 返回 unknown 时不凭空补造。
 *   4 证据采集不自动赋予全知权限——reveal 只对达标的线索扩展知情，不一次性揭示全部。
 *   5 面板预览不露出未发现秘密——buildBlock 只出 active 调查，不列出线索内容。
 *   6 调查动作若无法规则确认就保持待业务确认——不补造证据。
 *   7 同一证据不能重复领——investigate 用 receiptId 去重。
 *   8 不凭空造线索/造证据/造揭示——线索来自 register，证据来自 investigate，揭示来自 enigma.mark。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_investigation_settings_v1';
  var DEF = { enabled: false, maxClues: 32, maxEvidence: 64 };
  var __REG = { key: LS_KEY, def: DEF, module: 'investigation',
    bounds: { maxClues: [4, 128], maxEvidence: [8, 256] } };
  function getSettings() {
    var raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    var base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  var _stat = { registered: 0, investigated: 0, revealed: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  const clockNow = function (tag) { try { return WA.clock.now(tag || 'investigation'); } catch (e) { return Date.now(); } };
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(root) { var r = root || state(); if (!r.investigation) r.investigation = { clues: [], evidence: [] }; if (!Array.isArray(r.investigation.clues)) r.investigation.clues = []; if (!Array.isArray(r.investigation.evidence)) r.investigation.evidence = []; return r.investigation; }
  function clues() { return bucket().clues || []; }
  function evidence() { return bucket().evidence || []; }
  function findClue(id) { var k = clean(id, 60); return clues().filter(function (x) { return x && x.id === k; })[0] || null; }
  function newId() { return WA.rand ? WA.rand.id('inv_', 4, 'id') : 'inv_0000'; }

  // ── v2.194.0（U2）：本模块的**提交时机**统一入口 ──────────────────────
  //   本模块三个写口原先各自 `WA.store.transact`。一旦被别的模块放进外层事务里调
  //   （链的常规形态：一条链只有一个 draft），`store.transact` 走嵌套分支 —— 世界写入随外层
  //   提交，而返回值**照样是 `ok:true`**；外层随后被拒 / 抛错时，调用方拿着一句「线索已登记」，
  //   世界一格没动。本仓点名过这类「谎报成功」，故在此立一道边界：
  //     · 写入**照原路走**（嵌套 ⇒ 落在链的那一份 draft 上，与链里其它写入同生共死）；
  //     · 只有**回执**改口径：链上 / 别人事务内如实标 `chain:true / persisted:false`。
  function chainInflight() {
    return (WA.commit && typeof WA.commit.inflight === 'function') ? WA.commit.inflight() : null;
  }
  /** 本笔的 transact 是否落进了**别人的事务 / 链的草稿**（store 嵌套分支答 `deferred:true`）。 */
  function nestedTx(txr) { return !!(txr && typeof txr === 'object' && txr.deferred === true); }
  /**
   * 写口的**目标查找**（链内后一步不能用只读快照）。
   *   为什么必须有它：`findClue` 读的是**已提交状态** —— 链里前一步刚写进 draft 的线索
   *   在快照里还不存在，于是链内后一步恒 `not-found`。探针实测（批次③ E4）：
   *   链内 register 成功（标 `chain:true`）之后立刻链内 investigate，答案是 `not-found`
   *   —— 「链内自洽」这条最短的路径此前根本走不通。
   *   口径：**在链里就查链的那一份 draft**，链外照旧查已提交状态（形状与优先级都不变）。
   */
  function findClueForWrite(id) {
    var k = clean(id, 60);
    var ifl = chainInflight();
    if (ifl && ifl.draft) {
      var b = bucket(ifl.draft);
      var hit = b.clues.filter(function (x) { return x && x.id === k; })[0];
      if (hit) return hit;
    }
    return findClue(k);
  }
  /** 同上，回执去重也要看链的草稿（否则同链里同一 receiptId 会被领两次）。 */
  function writeEvidence() {
    var ifl = chainInflight();
    if (ifl && ifl.draft) {
      var b = bucket(ifl.draft);
      if (Array.isArray(b.evidence) && b.evidence.length) return b.evidence;
    }
    return evidence();
  }
  var __opSeq = 0;
  // ── v2.197.0（G20 形态归一）── 同 agency.js：能力三目不是本仓的时间源形态（G20 判成裸调），
  //   归一为声明的守卫，fallback 逐字保留。
  function wallNow() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }
  function nextOpId(prefix) {
    __opSeq++;
    var t = wallNow();
    return clean(prefix, 24) + '@' + t + '#' + __opSeq;
  }
  /** 取「本次调用前已发生的事务数」（时效判据的基准）。 */
  function txCount() { try { return (WA.store && typeof WA.store.txStat === 'function') ? (WA.store.txStat().count || 0) : 0; } catch (e) { return 0; } }
  /**
   * 刚刚这一趟 transact，**本模块自己的写**有没有被保存点撤回？
   *   真源是 `store.txStat().lastNested`（store 自己在嵌套分支写的台账，不是我方常量），
   *   并做时效校验：读数必须是**我这一笔的**（用 store 记的单调序号 `seq`，不用墙钟毫秒 ——
   *   毫秒在冻结时钟下会给出相等读数，把旧读数误判成本次的）。
   * @returns {''|'aborted'|'threw'}
   */
  function nestedVerdictSince(n0) {
    try {
      if (!WA.store || typeof WA.store.txStat !== 'function') return '';
      var st = WA.store.txStat();
      var ln = st.lastNested;
      if (!ln || typeof ln !== 'object') return '';
      if (typeof ln.seq === 'number' && typeof n0 === 'number') {
        if (ln.seq < n0 + 1) return '';
      } else if (typeof st.count === 'number' && typeof n0 === 'number' && st.count < n0 + 1) {
        return '';
      }
      return (ln.why === 'threw') ? 'threw' : 'aborted';
    } catch (e) { return ''; }
  }
  /** 未提交的写入**必须在回执上看得出来**（链外顶层一律不动形状 —— 既有消费者按原样读）。 */
  function markInflight(out, ctx) {
    if (!out || typeof out !== 'object') return out;
    var inflight = null, inner = null;
    try {
      inflight = chainInflight();
      if (WA.commit && typeof WA.commit.active === 'function') inner = WA.commit.active();
    } catch (e) { inflight = null; inner = null; }
    // v2.194.0（U2 批次③）：**调用方自己的事务**也要如实标。链面看不见它 ——
    //   `commit.active()` 只在链自己的 fn 里非空，而 `store.transact` 的嵌套回执会答
    //   `deferred:true`：那一笔随调用方提交，本模块此刻**拿不出「已提交」的证据**。
    //   此前这一面漏标（专锁 C1 实测：别人事务里调 register 答「已登记」而什么都不标），
    //   于是调用方无法与「世界真的落了」区分 —— 本仓点名的「谎报成功」的一种。
    var nestedHere = !!(ctx && ctx.nestedHere);
    if (inflight || inner || nestedHere) {
      out.chain = !!inflight;
      out.nested = !inflight && (!!inner || nestedHere);
      out.persisted = false;
      if (inflight) out.projected = true;
    }
    return out;
  }

  // ── 1. register：登记可发现线索 ──
  function register(spec) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var s = spec || {};
    var title = clean(s.title, 80);
    if (!title) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'title' }; }
    var subject = clean(s.subject, 80);
    if (!subject) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'subject' }; }
    if (clues().length >= cfg.maxClues) { noteFault('clues-full'); return { ok: false, reason: 'clues-full', cap: cfg.maxClues }; }
    // 检查相关命题是否在 truthOf 中存在（如果 truthOf 可用）
    if (WA.intel && typeof WA.intel.truthOf === 'function') {
      var truth = WA.intel.truthOf(subject);
      if (!truth.ok && truth.reason === 'unknown-subject') {
        // unknown 是合法状态——不阻断登记，但标记为 unverified
      }
    }
    var rec = {
      id: newId(), title: title, subject: subject,
      location: clean(s.location || '', 60),
      witness: clean(s.witness || '', 60),
      cost: s.cost ? Number(s.cost) : 0,
      costType: clean(s.costType || 'time', 30),
      sourceType: clean(s.sourceType || 'witness', 30),
      verifyRule: clean(s.verifyRule || '', 120),
      status: 'discoverable',
      at: clockNow('investigation'),
      revealedTo: [],
      evidenceIds: []
    };
    var n0 = txCount();
    var txr = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      txr = WA.store.transact(function (d) {
        var b = bucket(d);
        b.clues.push(rec);
        // 挤出走单一出口（与写入**同一层草稿**：否则挤的是已提交那份，本次写入不会被计容量）
        if (WA.evict && typeof WA.evict.array === 'function') {
          try { WA.evict.array(b.clues, 'investigation.clues'); } catch (e) {}
        }
      }, 'investigation:register');
    } else { clues().push(rec); }
    var nvR = nestedVerdictSince(n0);
    if (nvR) {
      // 内层被保存点撤回 ⇒ **写入根本没发生**，不许读成成功（静默空写不读成真）
      var whyR = (nvR === 'threw') ? 'write-threw' : 'write-aborted';
      noteFault(whyR);
      return { ok: false, reason: whyR, persisted: false };
    }
    _stat.registered++;
    return markInflight({ ok: true, id: rec.id, title: title, subject: subject }, { nestedHere: nestedTx(txr) });
  }

  /**
   * 在**这一层草稿**上把「某线索已对某人揭示」写下来。
   *   为什么必须有它：链内后一步的**预检读的是已提交状态**（`findClue`）—— 看不到本链里刚写进
   *   draft、尚未提交的实体。所以 reveal 的落地必须直接写草稿，绕开那个只读快照。
   *   找不到目标 ⇒ 返回 false（**静默空写不许读成成功**），由调用方当场中止整链。
   */
  function markRevealedOnDraft(draft, clueId, who, verdict) {
    try {
      var b = bucket(draft);
      var c = b.clues.filter(function (x) { return x && x.id === clueId; })[0];
      if (!c) return false;
      if (!Array.isArray(c.revealedTo)) c.revealedTo = [];
      if (c.revealedTo.indexOf(who) < 0) c.revealedTo.push(who);
      c.status = 'resolved';
      c.resolvedAt = clockNow('investigation');
      c.verdict = verdict;      // v2.194.0：达标结论随线索存下来（already-revealed 的二次调用也答得出凭据）
      return true;
    } catch (e) { return false; }
  }

  // ── 2. investigate：选择调查方向，产生证据回执 ──
  function investigate(clueId, person, opts) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var clue = findClueForWrite(clueId);
    if (!clue) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(clueId, 60) }; }
    if (clue.status === 'resolved') { noteFault('already-resolved'); return { ok: false, reason: 'already-resolved' }; }
    var who = clean(person, 60);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'person' }; }
    var o = opts || {};
    var receiptId = clean(o.receiptId || '', 60);
    if (!receiptId) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'receiptId' }; }
    // 去重：同一 receiptId 不能重复使用
    // v2.194.0：拒收时把**已落地的那一条**指出来（此前只说「重复了」，调用方无从寻址 —— 手里那个 id 根本不存在）
    var _dup = writeEvidence().filter(function (x) { return x && x.receiptId === receiptId; })[0] || null;
    if (_dup) { noteFault('duplicate-receipt'); return { ok: false, reason: 'duplicate-receipt', receiptId: receiptId, evidenceId: _dup.id, clueId: _dup.clueId }; }
    // 检查容量
    if (evidence().length >= cfg.maxEvidence) { noteFault('evidence-full'); return { ok: false, reason: 'evidence-full', cap: cfg.maxEvidence }; }
    // 检查证人/地点条件（如果线索指定了证人，检查该证人是否在 noesis 中可接触）
    var witnessAccessible = true;
    if (clue.witness && WA.noesis && typeof WA.noesis.knows === 'function') {
      var nk = WA.noesis.knows(who, clue.witness);
      // knows 返回 deniedBy/knownBy——如果 who 不知道 witness，不一定阻止调查但标记条件
      if (nk && nk.deniedBy && nk.deniedBy.length > 0) {
        // who 不能接触该证人——不阻断但标记为受限
        witnessAccessible = false;
      }
    }
    // 产出证据
    var ev = {
      id: newId() + '_ev', clueId: clue.id, receiptId: receiptId,
      person: who, at: clockNow('investigation'),
      sourceType: clue.sourceType,
      witnessAccessible: witnessAccessible,
      status: 'collected',
      content: clean(o.content || '', 200)
    };
    var n0 = txCount();
    var txr = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      txr = WA.store.transact(function (d) {
        var b = bucket(d);
        b.evidence.push(ev);
        var c = b.clues.filter(function (x) { return x && x.id === clue.id; })[0];
        if (c) {
          if (!Array.isArray(c.evidenceIds)) c.evidenceIds = [];
          c.evidenceIds.push(ev.id);
          if (c.status === 'discoverable') c.status = 'investigating';
        }
        if (WA.evict && typeof WA.evict.array === 'function') {
          try { WA.evict.array(b.evidence, 'investigation.evidence'); } catch (e) {}
        }
      }, 'investigation:investigate');
    } else {
      evidence().push(ev);
      clue.evidenceIds.push(ev.id);
      if (clue.status === 'discoverable') clue.status = 'investigating';
    }
    var nvI = nestedVerdictSince(n0);
    if (nvI) {
      var whyI = (nvI === 'threw') ? 'write-threw' : 'write-aborted';
      noteFault(whyI);
      return { ok: false, reason: whyI, persisted: false, clueId: clue.id, receiptId: receiptId };
    }
    _stat.investigated++;
    return markInflight({ ok: true, evidenceId: ev.id, clueId: clue.id, receiptId: receiptId, witnessAccessible: witnessAccessible },
      { nestedHere: nestedTx(txr) });
  }

  // ── 2b. extractFromTrace：将空间物理留痕提取为线索/证据 (v2.239.0 OPV5-3) ──
  function extractFromTrace(traceObj, person, opts) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!traceObj || !traceObj.place) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'traceObj' }; }
    var who = clean(person, 60);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'person' }; }
    var o = opts || {};
    var receiptId = clean(o.receiptId || ('trace_rcpt_' + (traceObj.id || Date.now())), 60);

    var existingClue = clues().find(function (c) {
      return c && (c.location === traceObj.place || c.subject === traceObj.who);
    });

    var clueId = existingClue ? existingClue.id : null;
    if (!clueId) {
      var reg = register({
        title: '现场勘查：' + traceObj.place + '留痕',
        subject: traceObj.who || '现场涉事者',
        location: traceObj.place,
        sourceType: 'trace',
        verifyRule: '现场物理痕迹核对'
      });
      if (reg && reg.ok) clueId = reg.id;
      else return reg;
    }

    return investigate(clueId, who, {
      receiptId: receiptId,
      content: clean(traceObj.trace || ('在' + traceObj.place + '发现' + (traceObj.who || '') + '留下的痕迹'), 200)
    });
  }

  // ── 3. checkEvidence：对照来源，区分未证实/矛盾/已核实/无法判断 ──
  function checkEvidence(clueId) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var clue = findClue(clueId);
    if (!clue) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(clueId, 60) }; }
    var evs = evidence().filter(function (x) { return x && x.clueId === clue.id; });
    if (!evs.length) return { ok: true, clueId: clue.id, verdict: 'no-evidence', count: 0 };
    // 读 truthOf 获取事实面
    var truth = null;
    if (WA.intel && typeof WA.intel.truthOf === 'function') {
      truth = WA.intel.truthOf(clue.subject);
    }
    // 读 intel rowsOf 获取认知面
    var knownRows = [];
    if (WA.intel && typeof WA.intel.rowsOf === 'function') {
      evs.forEach(function (e) {
        var rows = WA.intel.rowsOf(e.person, clue.subject);
        if (rows && rows.length) knownRows = knownRows.concat(rows);
      });
    }
    // 判定
    var verdict = 'unverified';
    if (truth && truth.ok) {
      // 事实存在——检查证据是否指向同一结论
      var consistent = evs.every(function (e) { return !e.content || e.content === truth.value; });
      if (consistent && evs.length >= 1) verdict = 'verified';
      else if (!consistent) verdict = 'contradictory';
    } else if (truth && !truth.ok && truth.reason === 'unknown-subject') {
      // 事实不存在——如果有多条不一致证据，标记为 cannot-judge
      var contents = evs.map(function (e) { return e.content; }).filter(function (c) { return c; });
      var unique = contents.filter(function (v, i, a) { return a.indexOf(v) === i; });
      if (unique.length > 1) verdict = 'cannot-judge';
      else if (unique.length === 1) verdict = 'unverified';
    }
    return { ok: true, clueId: clue.id, verdict: verdict, count: evs.length,
      truthAvailable: !!(truth && truth.ok), knownRows: knownRows.length };
  }

  // ── 4. reveal：证据达标后扩展知情范围 ──
  function reveal(clueId, person) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var clue = findClueForWrite(clueId);
    if (!clue) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(clueId, 60) }; }
    var who = clean(person, 60);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'person' }; }
    // 检查是否已揭示给此人（v2.194.0：拒收时把**当时那条凭据**一并交出 —— 只说「揭示过了」等于没说）
    if (clue.revealedTo.indexOf(who) >= 0) {
      noteFault('already-revealed');
      return { ok: false, reason: 'already-revealed', clueId: clue.id, person: who,
        verdict: clue.verdict || '', resolvedAt: clue.resolvedAt || 0, status: clue.status };
    }
    // 必须先有证据且 verdict 为 verified 或 cannot-judge（cannot-judge 也算「知道了有争议」）
    var chk = checkEvidence(clueId);
    if (!chk.ok) return chk;
    if (chk.verdict !== 'verified' && chk.verdict !== 'cannot-judge') {
      noteFault('insufficient-evidence'); return { ok: false, reason: 'insufficient-evidence', verdict: chk.verdict };
    }
    // v2.194.0（U2）：**本口开链**。此前这三笔分属三个顶层事务：
    //   ① `enigma.mark`（知情名单）② `intel.addIntel`（认知行）③ 本模块把线索记成 revealed。
    //   探针实测的半写：让 ③ 失败 ⇒ ① 已经写进世界（enigma 记住了「某人已知情」），
    //   而线索仍是 investigating / revealedTo 为空，回执却照样 `ok:true` —— 知情面与线索账对不上。
    //   现在：三笔同链一次提交（链撤不回的那两笔**排在后面**：线索落地先写，知情扩展后写），
    //   任一步失败 ⇒ 整链中止，世界一格不动，归因如实交回。
    var _chainable = !!(WA.commit && typeof WA.commit.chain === 'function');
    var _outer = (WA.commit && typeof WA.commit.active === 'function') ? WA.commit.active() : null;
    if (_chainable && !chainInflight() && !_outer) {
      var fnPassed = false;      // 本模块自己的每一步是否都过了（区分 chain-nested 的两种真况）
      var ch = WA.commit.chain({
        opId: nextOpId('investigation:reveal'), site: 'investigation:reveal',
        fn: function (c, draft) {
          // 第一步：线索落地（本模块自己的写入；找不到目标 ⇒ 当场中止，此时什么都还没发生）
          if (!markRevealedOnDraft(draft, clue.id, who, chk.verdict)) { c.abortWhy = 'ledger-target-missing'; return false; }
          WA.commit.step(null, { site: 'investigation:reveal:clue' });
          // 第二步：扩展知情（跨模块；链撤不回它的副作用 ⇒ 排在后面）
          if (WA.enigma && typeof WA.enigma.mark === 'function') {
            var mr = WA.enigma.mark(clue.subject, who);
            if (mr && !mr.ok && mr.reason !== 'disabled') { c.abortWhy = 'enigma-failed'; return false; }
            WA.commit.step(null, { site: 'investigation:reveal:enigma' });
          }
          // 第三步：认知行（跨模块；同样排在自己的写入之后）
          if (WA.intel && typeof WA.intel.addIntel === 'function') {
            var truth = WA.intel.truthOf(clue.subject);
            if (truth && truth.ok) {
              WA.intel.addIntel(who, { about: clue.subject, claim: truth.value, level: 'record', source: 'investigation:' + clue.id });
            }
            WA.commit.step(null, { site: 'investigation:reveal:intel' });
          }
          fnPassed = true;
          return true;
        }
      });
      if (ch.ok !== true) {
        var whyCh = ch.reason || 'chain-failed';
        noteFault(whyCh);
        // `chain-nested` 是**两种真况**共用的一条读法，必须分开报（否则必有一半是谎报）：
        //   · fn 全过 ⇒ 写入**落在调用方那一层**上（随其提交），只是本模块提供不了链级原子性
        //     ⇒ 按嵌套分支的同一口径答 `ok:true / nested:true / persisted:false`；
        //   · fn 拒签 ⇒ `store` 的保存点把本笔在调用方那层上撤回了（世界真的一格未动）
        //     ⇒ `ok:false`，并如实说明是嵌在别人事务里才没能成链。
        if (whyCh === 'chain-nested') {
          if (fnPassed) {
            _stat.revealed++;
            var okN = markInflight({ ok: true, clueId: clue.id, person: who, verdict: chk.verdict, chain: false },
              { nestedHere: true });
            okN.note = '链未能成立（本口嵌在调用方的事务里）⇒ 本笔写在那**同一层**上，随调用方提交；本模块不提供链级原子性保证';
            return okN;
          }
          return { ok: false, reason: whyCh, clueId: clue.id, person: who, verdict: chk.verdict,
            chain: false, nested: true, persisted: false,
            note: '揭示未成（本模块的步骤在调用方事务里被保存点撤回）⇒ 知情面与线索状态不因本笔改变' };
        }
        return { ok: false, reason: whyCh, clueId: clue.id, person: who, verdict: chk.verdict,
          chain: true, persisted: false,
          note: '揭示未成（本笔未执行）⇒ 知情面与线索状态不因本笔改变 —— 线索落地与知情扩展要么都在、要么都不在' };
      }
      _stat.revealed++;
      return { ok: true, clueId: clue.id, person: who, verdict: chk.verdict,
        // v2.194.0：成功路径与 U2 各批**同一口径** —— `chain:false` 说的是
        //   「本笔不是链内的在途写入」（它自己开了一条链并已提交），不是「没有链」。
        chain: false,
        atomic: true, opId: ch.opId, steps: ch.steps.length, persisted: true,
        receiptId: (evidence().filter(function (e) { return e && e.clueId === clue.id; })[0] || {}).receiptId || '' };
    }
    // 链内 / 别人事务内：三笔写入都留在调用方那层 draft 上（与链里其它写入同生共死）
    if (WA.enigma && typeof WA.enigma.mark === 'function') {
      var mr2 = WA.enigma.mark(clue.subject, who);
      if (mr2 && !mr2.ok && mr2.reason !== 'disabled') {
        noteFault('enigma-failed'); return { ok: false, reason: 'enigma-failed', detail: mr2.reason };
      }
    }
    if (WA.intel && typeof WA.intel.addIntel === 'function') {
      var truth2 = WA.intel.truthOf(clue.subject);
      if (truth2 && truth2.ok) {
        WA.intel.addIntel(who, { about: clue.subject, claim: truth2.value, level: 'record', source: 'investigation:' + clue.id });
      }
    }
    var n0C = txCount();
    var txrC = null;
    if (WA.store && typeof WA.store.transact === 'function') {
      txrC = WA.store.transact(function (d) { markRevealedOnDraft(d, clue.id, who, chk.verdict); }, 'investigation:reveal');
    } else {
      clue.revealedTo.push(who);
      clue.status = 'resolved'; clue.verdict = chk.verdict;
    }
    var nvC = nestedVerdictSince(n0C);
    if (nvC) {
      var whyC = (nvC === 'threw') ? 'write-threw' : 'write-aborted';
      noteFault(whyC);
      return { ok: false, reason: whyC, persisted: false, clueId: clue.id, person: who };
    }
    _stat.revealed++;
    return markInflight({ ok: true, clueId: clue.id, person: who, verdict: chk.verdict }, { nestedHere: nestedTx(txrC) });
  }

  // ── 5. pending：列出未解决的线索 ──
  function pending() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    var cur = clues().filter(function (x) { return x && (x.status === 'discoverable' || x.status === 'investigating'); });
    return { ok: true, items: cur.map(function (x) { return { id: x.id, title: x.title, status: x.status, evidence: x.evidenceIds.length }; }),
      count: cur.length, cap: cfg.maxClues };
  }

  // ── 6. view：查看线索详情 ──
  function view(clueId) {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    var clue = findClue(clueId);
    if (!clue) return { ok: false, reason: 'not-found', id: clean(clueId, 60) };
    return { ok: true, id: clue.id, title: clue.title, subject: clue.subject,
      status: clue.status, location: clue.location, witness: clue.witness,
      cost: clue.cost, costType: clue.costType,
      evidence: clue.evidenceIds.length, revealedTo: clue.revealedTo.slice() };
  }

  // ── 7. buildBlock：注入块（只出 active 调查标题，不露出线索内容） ──
  function buildBlock() {
    var cfg = getSettings();
    if (!cfg.enabled) return '';
    var cur = clues().filter(function (x) { return x && x.status !== 'resolved'; });
    if (!cur.length) return '';
    var lines = ['[线索调查]'];
    cur.slice(0, Math.max(1, Math.floor(cfg.maxClues / 2))).forEach(function (x) {
      lines.push('· ' + x.title + '（' + x.status + '，证据 ' + x.evidenceIds.length + '）');
    });
    return lines.join('\n');
  }

  // ── 8. diagnose：闭环检查 ──
  function diagnose() {
    var checks = {
      intel: !!(WA.intel && typeof WA.intel.truthOf === 'function' && typeof WA.intel.addIntel === 'function' && typeof WA.intel.rowsOf === 'function'),
      enigma: !!(WA.enigma && typeof WA.enigma.mark === 'function' && typeof WA.enigma.read === 'function'),
      noesis: !!(WA.noesis && typeof WA.noesis.knows === 'function'),
      store: !!(WA.store && typeof WA.store.transact === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    var ok = checks.intel && checks.enigma && checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.194.0' };
  }

  // ── 9. stat ──
  function stat() {
    var cur = clues();
    return { registered: _stat.registered, investigated: _stat.investigated, revealed: _stat.revealed,
      refused: _stat.refused, lastReason: _stat.lastReason,
      discoverable: cur.filter(function (x) { return x && x.status === 'discoverable'; }).length,
      investigating: cur.filter(function (x) { return x && x.status === 'investigating'; }).length,
      resolved: cur.filter(function (x) { return x && x.status === 'resolved'; }).length,
      total: cur.length, cap: getSettings().maxClues,
      faults: Object.assign({}, _stat.faults) };
  }

  // ── 10. reset ──
  function reset() { _stat.registered = 0; _stat.investigated = 0; _stat.revealed = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.investigation = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    register: register,
    investigate: investigate,
    extractFromTrace: extractFromTrace,
    checkEvidence: checkEvidence,
    reveal: reveal,
    pending: pending,
    view: view,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 13;
  var _exported = Object.keys(WA.investigation).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('investigation: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/investigation.js', { kind: 'engine', ver: '2.194.0' });
})();
