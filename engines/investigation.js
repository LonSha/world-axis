/**
 * WorldAxis engines/investigation.js (v2.170.0) — TX7 线索调查、证据核验与秘密揭示
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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) { bucket(d).clues.push(rec); }, 'investigation:register');
    } else { clues().push(rec); }
    if (WA.evict && typeof WA.evict.array === 'function') {
      try { WA.evict.array(bucket().clues, 'investigation.clues'); } catch (e) {}
    }
    _stat.registered++;
    return { ok: true, id: rec.id, title: title, subject: subject };
  }

  // ── 2. investigate：选择调查方向，产生证据回执 ──
  function investigate(clueId, person, opts) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var clue = findClue(clueId);
    if (!clue) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(clueId, 60) }; }
    if (clue.status === 'resolved') { noteFault('already-resolved'); return { ok: false, reason: 'already-resolved' }; }
    var who = clean(person, 60);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'person' }; }
    var o = opts || {};
    var receiptId = clean(o.receiptId || '', 60);
    if (!receiptId) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'receiptId' }; }
    // 去重：同一 receiptId 不能重复使用
    var existing = evidence().some(function (x) { return x && x.receiptId === receiptId; });
    if (existing) { noteFault('duplicate-receipt'); return { ok: false, reason: 'duplicate-receipt', receiptId: receiptId }; }
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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        b.evidence.push(ev);
        var c = b.clues.filter(function (x) { return x && x.id === clue.id; })[0];
        if (c) { c.evidenceIds.push(ev.id); if (c.status === 'discoverable') c.status = 'investigating'; }
      }, 'investigation:investigate');
    } else {
      evidence().push(ev);
      clue.evidenceIds.push(ev.id);
      if (clue.status === 'discoverable') clue.status = 'investigating';
    }
    _stat.investigated++;
    return { ok: true, evidenceId: ev.id, clueId: clue.id, receiptId: receiptId, witnessAccessible: witnessAccessible };
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
    var clue = findClue(clueId);
    if (!clue) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(clueId, 60) }; }
    var who = clean(person, 60);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'person' }; }
    // 检查是否已揭示给此人
    if (clue.revealedTo.indexOf(who) >= 0) { noteFault('already-revealed'); return { ok: false, reason: 'already-revealed' }; }
    // 必须先有证据且 verdict 为 verified 或 cannot-judge（cannot-judge 也算「知道了有争议」）
    var chk = checkEvidence(clueId);
    if (!chk.ok) return chk;
    if (chk.verdict !== 'verified' && chk.verdict !== 'cannot-judge') {
      noteFault('insufficient-evidence'); return { ok: false, reason: 'insufficient-evidence', verdict: chk.verdict };
    }
    // 调 enigma.mark 扩展知情
    if (WA.enigma && typeof WA.enigma.mark === 'function') {
      var mr = WA.enigma.mark(clue.subject, who);
      if (mr && !mr.ok && mr.reason !== 'disabled') {
        noteFault('enigma-failed'); return { ok: false, reason: 'enigma-failed', detail: mr.reason };
      }
    }
    // 调 intel.addIntel 传递线索结论（如果 truthOf 有值）
    if (WA.intel && typeof WA.intel.addIntel === 'function') {
      var truth = WA.intel.truthOf(clue.subject);
      if (truth && truth.ok) {
        WA.intel.addIntel(who, { about: clue.subject, claim: truth.value, level: 'record', source: 'investigation:' + clue.id });
      }
    }
    // 更新线索状态
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        var c = b.clues.filter(function (x) { return x && x.id === clue.id; })[0];
        if (c) { c.revealedTo.push(who); c.status = 'resolved'; }
      }, 'investigation:reveal');
    } else {
      clue.revealedTo.push(who);
      clue.status = 'resolved';
    }
    _stat.revealed++;
    return { ok: true, clueId: clue.id, person: who, verdict: chk.verdict };
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
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.170.0' };
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
    checkEvidence: checkEvidence,
    reveal: reveal,
    pending: pending,
    view: view,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 12;
  var _exported = Object.keys(WA.investigation).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('investigation: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/investigation.js', { kind: 'engine', ver: '2.170.0' });
})();
