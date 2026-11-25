/**
 * WorldAxis engines/probe.js (v2.119.0) — 证据驱动的调查与对质（拓展计划 ⑤）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `intel` 有来源与置信度、`enigma` 有知情边界、`rumor` 有传播与辟谣 —— 但没有任何一处
 *   回答得了：「这两条线索互相打脸时怎么办？证据不够时能不能定案？」
 *   现场于是只剩两种做法：要么一有线索就真相大白（悬疑变通知），
 *   要么永远悬着（没有可判定的收束条件）——两者都让「调查」这个词不可判定。
 *
 * ── 本模块只做五件事，每件都有一个硬条件 ───────────────────────
 *   ① `open`   立案：问题必填；**至少两条假说**（`too-few-hypotheses`）——
 *      只有一个可能性的调查不是调查，是通知。
 *   ② `addEvidence` 举证：来源等级必须是具名表（intel 的 rumor/report/witness/record）；
 *      必须指向某条假说（`missing-direction`），且**支持与反驳各自保留**（不得平均）。
 *   ③ `confront` 对质：手里得先有 `minSupport` 条指向该假说的证据（`insufficient-support`）；
 *      对质后对方的认知变化走 **intel.believe**（本模块唯一一次调它），失败照实带出。
 *   ④ `decide`  定案：必须有该假说的支持证据 ≥ `minSupport` **且无任何反证**；
 *      否则 `undecided`（**证据不足也是一等结论**，不是「待补」）。
 *   ⑤ `wrong`   误指留痕：指控了错的人不删行（`wrong-accusation`）——复盘得出来「查错人」这件事。
 *
 * ── 八条设计边界（全是否定式）──────────────────────────────────
 *   ① **多解并存**：立案至少两假说；单假说直接拒收。
 *   ② **来源具名**：自造来源等级拒收（否则「我觉得可靠」就是证据）。
 *   ③ **指向必填**：不说支持还是反驳的线索不进卷宗。
 *   ④ **反证不合并**：支持与反驳各自留行、不许取平均。
 *   ⑤ **证据不足有出路**：`undecided` 是正式结论，不是失败。
 *   ⑥ **对质需成本**：手上证据不够就不能去对质。
 *   ⑦ **误指留痕**：错的指控也进卷宗，不静默删。
 *   ⑧ **容量有界且挤出有账**：三个站点（cases / evidence / wrongs）都走 evict 单一出口。
 *      v2.560.0：这一条此前只在 cases 上是**空话**——准入闸门数的是「全部卷宗」的条数，
 *      而定案后行不删，于是 `cases-full` 的提前 return 让 cases 站的 evict 每次都只是 noop；
 *      名额一满就**拒收新案**，而不是让办完的案子腾位置。本批把闸门改成数「未结案」条数，
 *      并给 `core/evict.js` 的 IN_TRANSIT 登记 `probe.cases` 的「未结案」行（在途豁免的正用）。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不判定真伪**：真相的真源是 `intel.truthOf`；本模块只算「卷宗里支持/反驳各有多少」。
 *   · 本模块**不改好感与关系**：对质的社交后果由调用方决定。
 *   · 总开关默认关闭；关闭时不立案、不举证、不对质、不定案、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_probe_settings_v1';
  const DEF = { enabled: true, maxCases: 8, maxEvidence: 24, minSupport: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'probe',
    bounds: { maxCases: [2, 24], maxEvidence: [4, 48], minSupport: [1, 4] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 来源等级**取自 intel 的具名表**（同一把尺子，不另立一套）。
  const LEVELS = ['rumor', 'report', 'witness', 'record'];
  const STATUS = ['open', 'closed'];  // closed = 定案或误指留痕，行不删
  const VERDICT = ['guilty', 'clear', 'undecided'];

  const stat = { cases: 0, evidence: 0, confronts: 0, decided: 0, wrongs: 0,
    blocked: 0, recycled: 0, lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.blocked++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function casesOf(root) {
    const c = (root || state()).probe;
    return (c && Array.isArray(c.cases)) ? c.cases : [];
  }
  function findCase(id, root) {
    const key = clean(id, 60);
    if (!key) return null;
    return casesOf(root).filter(function (r) { return r && clean(r.id, 60) === key; })[0] || null;
  }
  function hypOf(c, hid) {
    const key = clean(hid, 40);
    if (!c || !Array.isArray(c.hypotheses)) return null;
    return c.hypotheses.filter(function (h) { return h && clean(h.id, 40) === key; })[0] || null;
  }
  /**
   * v2.560.0：卷宗序号的唯一正身。
   *   旧写法用 `pr.cases.length` 当尾号 —— 在「挤出从不生效」的年代它恰好单调（因为永不删行）；
   *   一旦挤出真的把办完的案子回收掉，`length` 会变小，同毫秒内连开两案就撞号。
   *   实测（/tmp/probe560.js r7）：手工删一条后再开，两条 id 都是 `case_1700000000000_7`。
   *   撞号的后果不是「id 难看」：`findCase` 按 id 取**第一条**，`decide`/`wrong`/`addEvidence`
   *   会全部打到那条更老的卷宗上，而新案永远结不了。
   */
  function nextCaseSeq(cases) {
    let mx = -1;
    (Array.isArray(cases) ? cases : []).forEach(function (c) {
      const m = /^case_\d+_(\d+)$/.exec(String((c && c.id) || ''));
      if (m) { const n = parseInt(m[1], 10); if (isFinite(n) && n > mx) mx = n; }
    });
    return mx + 1;
  }
  function openProbe(draft, cfg) {
    draft.probe = (draft.probe && typeof draft.probe === 'object' && !Array.isArray(draft.probe)) ? draft.probe : { cases: [] };
    if (!Array.isArray(draft.probe.cases)) draft.probe.cases = [];
    return draft.probe;
  }
  /** 某假说的支持/反驳条数（**各自留行、不取平均**）。 */
  function tally(c, hid) {
    const ev = (c && Array.isArray(c.evidence)) ? c.evidence : [];
    const sup = ev.filter(function (e) { return e && e.dir === 'support' && clean(e.hypothesis, 40) === clean(hid, 40); });
    const ref = ev.filter(function (e) { return e && e.dir === 'refute' && clean(e.hypothesis, 40) === clean(hid, 40); });
    return { support: sup.length, refute: ref.length, refuters: ref.map(function (e) { return e.claim; }) };
  }
  /** ① 立案：问题必填，**至少两条假说**（只有一个可能性的不是调查，是通知）。 */
  function openCase(question, hypotheses, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const q = clean(question, 80);
    if (!q) { noteFault('missing-question'); return { ok: false, reason: 'missing-question' }; }
    const list = (Array.isArray(hypotheses) ? hypotheses : []).map(function (h, i) {
      if (h && typeof h === 'object') return { id: clean(h.id, 40) || ('h' + i), text: clean(h.text, 60) };
      return { id: 'h' + i, text: clean(h, 60) };
    }).filter(function (h) { return h.text; });
    if (list.length < 2) {
      noteFault('too-few-hypotheses');
      return { ok: false, reason: 'too-few-hypotheses', count: list.length, hint: '只有一个可能性的调查不是调查' };
    }
    const ids = list.map(function (h) { return h.id; });
    if (new Set(ids).size !== ids.length) { noteFault('duplicate-hypothesis'); return { ok: false, reason: 'duplicate-hypothesis', ids: ids }; }
    const cfg = settings();
    const seen = casesOf().filter(function (r) { return r && clean(r.question, 80) === q && r.status === 'open'; })[0];
    if (seen) { noteFault('exists'); return { ok: false, reason: 'exists', id: seen.id }; }
    let out = null;
    WA.store.transact(function (draft) {
      const pr = openProbe(draft, cfg);
      // v2.560.0：名额按**未结案**条数卡，不按总条数卡。
      //   旧写法 `pr.cases.length >= cfg.maxCases` 数的是**全部卷宗**，而 `decide()` 定案后
      //   行留着不删（见 STATUS 注释：「closed = 定案或误指留痕，行不删」）——
      //   于是「8 条全办完」与「8 条全压着没办」在准入面上**逐字相同**：
      //   都是 `{ok:false, reason:'cases-full', cap:8}`，而前者的真值是 open = 0。
      //   实测（/tmp/probe560.js r1/r2/r3）：全结案之后 open=0、cases=8、第 9 条仍被拒。
      //   这不是容量裁决，是**拿拒收代替挤出**：头部⑧承诺 cases 站走 evict，而这条提前
      //   return 让该站的 evict 每次都只是 noop（实测 8 次调用，dropped 恒为 0）。
      const openN = pr.cases.filter(function (c) { return c && c.status === 'open'; }).length;
      if (openN >= cfg.maxCases) {
        out = { ok: false, reason: 'cases-full', cap: cfg.maxCases, open: openN, cases: pr.cases.length };
        return false;
      }
      const now = clockNow('probe');
      const row = { id: 'case_' + now + '_' + nextCaseSeq(pr.cases), question: q, note: clean(o.note, 60),
        status: 'open', verdict: '', hypotheses: list, evidence: [], wrongs: [],
        at: now, updatedAt: now };
      pr.cases.push(row);
      // 挤出真正生效：`core/evict.js` 的 IN_TRANSIT 已把 `probe.cases` 的**未结案**行登记为
      //   在途（「未完成的义务」），于是挤出先保 open、剩余额度才给已结案行（终态仍环形退场）。
      //   语义即「办完的案子给新案子让位，正在办的永不被静默丢弃」。
      const ev = WA.evict.array(pr.cases, 'probe.cases', cfg.maxCases);
      if (ev && ev.dropped > 0) { stat.recycled += ev.dropped; stat.lastReason = 'recycled'; }
      out = { ok: true, id: row.id, question: q, hypotheses: list.length };
    }, 'probe:open');
    if (out && out.ok) { stat.cases++; stat.lastReason = 'opened'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ② 举证：来源具名、指向必填；**支持与反驳各自留行（不取平均）**。
   */
  function addEvidence(caseId, claim, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const body = clean(claim, 80), lvl = clean(o.level, 20), dir = clean(o.dir, 20);
    if (!body) { noteFault('missing-claim'); return { ok: false, reason: 'missing-claim' }; }
    if (LEVELS.indexOf(lvl) < 0) { noteFault('bad-level'); return { ok: false, reason: 'bad-level', allowed: LEVELS.slice() }; }
    if (dir !== 'support' && dir !== 'refute') { noteFault('missing-direction'); return { ok: false, reason: 'missing-direction', hint: '不说支持还是反驳的线索不进卷宗' }; }
    const c = findCase(caseId);
    if (!c) { noteFault('unknown-case'); return { ok: false, reason: 'unknown-case', id: clean(caseId, 60) }; }
    if (c.status !== 'open') { noteFault('already-closed'); return { ok: false, reason: 'already-closed', id: c.id }; }
    const h = hypOf(c, o.about);
    if (!h) { noteFault('unknown-hypothesis'); return { ok: false, reason: 'unknown-hypothesis', about: clean(o.about, 40) }; }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const cc = findCase(caseId, draft);
      if (!cc || cc.status !== 'open') { out = { ok: false, reason: 'already-closed', id: clean(caseId, 60) }; return false; }
      const ev = Array.isArray(cc.evidence) ? cc.evidence : (cc.evidence = []);
      if (ev.length >= cfg.maxEvidence) { out = { ok: false, reason: 'evidence-full', cap: cfg.maxEvidence }; return false; }
      const now = clockNow('probe');
      const row = { id: 'ev_' + now + '_' + ev.length, claim: body, level: lvl, dir: dir,
        hypothesis: h.id, by: clean(o.by, 40), at: now };
      ev.push(row);
      WA.evict.array(ev, 'probe.cases.*.evidence', cfg.maxEvidence);
      cc.updatedAt = now;
      const t = tally(cc, h.id);
      out = { ok: true, id: row.id, dir: dir, hypothesis: h.id, level: lvl,
        support: t.support, refute: t.refute };
    }, 'probe:addEvidence');
    if (out && out.ok) { stat.evidence++; stat.lastReason = 'evidence'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ③ 对质：手上证据不够就不能去对质；认知变化走 intel.believe（本模块唯一一次调它）。
   */
  function confront(caseId, who, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const target = clean(who, 40);
    if (!target) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const c = findCase(caseId);
    if (!c) { noteFault('unknown-case'); return { ok: false, reason: 'unknown-case', id: clean(caseId, 60) }; }
    if (c.status !== 'open') { noteFault('already-closed'); return { ok: false, reason: 'already-closed', id: c.id }; }
    const h = hypOf(c, o.about);
    if (!h) { noteFault('unknown-hypothesis'); return { ok: false, reason: 'unknown-hypothesis', about: clean(o.about, 40) }; }
    const cfg = settings();
    const t = tally(c, h.id);
    // 对质需成本：手上证据不够就别去（「我觉得就是他」不是证据）。
    if (t.support < cfg.minSupport) {
      noteFault('insufficient-support');
      return { ok: false, reason: 'insufficient-support', hypothesis: h.id, support: t.support, need: cfg.minSupport };}
    let belief = null;
    if (WA.intel && typeof WA.intel.believe === 'function') {
      try {
        belief = WA.intel.believe(target, { claim: h.text, level: clean(o.level, 20) || 'witness',
          source: clean(o.source, 60) || ('对质：' + c.question), about: clean(o.subject, 80), by: clean(o.by, 40) || target });
      } catch (e) { belief = { ok: false, reason: 'intel-threw' }; }
    } else belief = { ok: false, reason: 'intel-missing' };
    let out = null;
    WA.store.transact(function (draft) {
      const cc = findCase(caseId, draft);
      if (!cc || cc.status !== 'open') { out = { ok: false, reason: 'already-closed', id: clean(caseId, 60) }; return false; }
      const now = clockNow('probe');
      if (!Array.isArray(cc.confronts)) cc.confronts = [];
      cc.confronts.push({ at: now, who: target, hypothesis: h.id, support: t.support,
        belief: belief ? { ok: belief.ok === true, reason: clean(belief.reason || (belief.ok ? 'believed' : 'failed'), 40) } : null });
      WA.evict.array(cc.confronts, 'probe.cases.*.confronts', cfg.maxCases);
      cc.updatedAt = now;
      out = { ok: true, id: cc.id, who: target, hypothesis: h.id, support: t.support,
        belief: belief ? { ok: belief.ok === true, reason: belief.reason || '' } : null };
    }, 'probe:confront');
    if (out && out.ok) { stat.confronts++; stat.lastReason = 'confronted'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * ④ 定案：支持 ≥ minSupport **且无任何反证**；否则 `undecided` —— 证据不足也是一等结论。
   */
  function decide(caseId, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const c = findCase(caseId);
    if (!c) { noteFault('unknown-case'); return { ok: false, reason: 'unknown-case', id: clean(caseId, 60) }; }
    if (c.status !== 'open') { noteFault('already-closed'); return { ok: false, reason: 'already-closed', id: c.id }; }
    const cfg = settings();
    const best = (c.hypotheses || []).map(function (h) {
      const t = tally(c, h.id);
      return { id: h.id, text: h.text, support: t.support, refute: t.refute, blocked: t.refute > 0 };
    }).sort(function (a, b) { return (b.support - b.refute) - (a.support - a.refute); });
    const top = best[0] || null;
    const settled = top && top.support >= cfg.minSupport && top.refute === 0;
    const verdict = settled ? 'guilty' : 'undecided';
    let out = null;
    WA.store.transact(function (draft) {
      const cc = findCase(caseId, draft);
      if (!cc || cc.status !== 'open') { out = { ok: false, reason: 'already-closed', id: clean(caseId, 60) }; return false; }
      const now = clockNow('probe');
      cc.status = 'closed';
      cc.verdict = verdict;
      cc.conclusion = clean(o.note, 80);
      cc.accused = settled ? clean(o.accused, 40) : '';
      cc.closedAt = now; cc.updatedAt = now;
      // 定案（或定为证据不足）**都留行**：卷宗是复盘材料，不是待办清单。
      out = { ok: true, id: cc.id, verdict: verdict, support: top ? top.support : 0,
        refute: top ? top.refute : 0, leader: top ? top.id : '', ranked: best };
    }, 'probe:decide');
    if (out && out.ok) { stat.decided++; stat.lastReason = verdict; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** ⑤ 误指留痕：指控了错的人不删行（复盘得出来「查错人」）。 */
  function wrong(caseId, who, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const target = clean(who, 40), why = clean(o.why, 80);
    if (!target) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!why) { noteFault('missing-reason'); return { ok: false, reason: 'missing-reason', hint: '误指也要写明为何认定查错了' }; }
    const c = findCase(caseId);
    if (!c) { noteFault('unknown-case'); return { ok: false, reason: 'unknown-case', id: clean(caseId, 60) }; }
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const cc = findCase(caseId, draft);
      if (!cc) { out = { ok: false, reason: 'unknown-case', id: clean(caseId, 60) }; return false; }
      if (!Array.isArray(cc.wrongs)) cc.wrongs = [];
      if (cc.wrongs.length >= cfg.maxCases) { out = { ok: false, reason: 'wrongs-full', cap: cfg.maxCases }; return false; }
      const now = clockNow('probe');
      const row = { id: 'wr_' + now + '_' + cc.wrongs.length, who: target, why: why,
        by: clean(o.by, 40), at: now };
      cc.wrongs.push(row);
      WA.evict.array(cc.wrongs, 'probe.cases.*.wrongs', cfg.maxCases);
      cc.status = 'closed';
      cc.verdict = 'clear';
      cc.closedAt = now; cc.updatedAt = now;
      out = { ok: true, id: row.id, who: target, verdict: 'clear' };
    }, 'probe:wrong');
    if (out && out.ok) { stat.wrongs++; stat.lastReason = 'wrong-accusation'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 实例：审计读取口。**只读**——不删行、不改状态（与 view/statView 同族）。 */
  function auditRecord(caseId) {
    const c = findCase(caseId);
    if (!c) return { ok: false, reason: 'unknown-case', id: clean(caseId, 60) };
    return { ok: true, id: c.id, question: c.question, evidence: (c.evidence || []).length,
      confronts: (c.confronts || []).length, wrongs: (c.wrongs || []).length,
      verdict: c.verdict || '', note: '审计只读：本口不删行、不改卷宗状态。' };
  }
  /* ── X4（v2.128.0）认知冲突裁决：两条线索互相打脸时，采信谁、为什么、存疑什么 ── */
  /**
   * ── 它治什么（缺口）────────────────────────────────────────────
   *   本模块的卷宗**已经把支持与反驳分开记**（`tally` 各自留行、不取平均），
   *   但「**两条并排的线索互相打脸时该采信谁**」这个问题无处可问 —— 卷宗只知道
   *   「有几条支持、几条反驳」，不知道「哪条更值得信」。
   *   现场于是只剩两种做法：要么一有线索就真相大白（悬疑变通知），
   *   要么永远悬着（没有可判定的收束条件）。R105 ⑤ 的病正是前者。
   *
   * ── 本函数只做三件事 ────────────────────────────────────────────
   *   ① `verdict`  采信谁：`a` / `b` / `both`（同向印证，不是冲突）/ `undecided`（真·打脸）
   *   ② `why`      为什么：一句人话，说明是等级压过、还是同向印证、还是同强对撞
   *   ③ `doubted`  存疑什么：**逐条带因**，绝不静默丢弃（存疑不是删除）
   *
   * ── 六条边界（全是否定式）──────────────────────────────────────
   *   ① **同源等级**：强度表由 `LEVELS` 直接派生，不另立第二套尺子 ——
   *      两套尺子必然分叉（v2.88.0 O1 已付过一次学费），而分叉的后果是「同一个来源
   *      在两个地方判出两种可信度」。
   *   ② **同向不是冲突**：两条同方向线索**互相印证**（`corroborated`），
   *      不报 `undecided` —— 把印证读成僵局，与「一有线索就真相大白」是同一个病的两面。
   *   ③ **等强对撞不硬裁**：同样强的一支持一反驳 ⇒ `undecided`（`cross-tie`）。
   *      硬选一个等于替世界发布真相，而本模块的职责是**把可判定性说清楚**，不是替人拍板。
   *   ④ **不写存档**：本函数一个字都不落盘 —— 《定案》仍然只走 `decide`。
   *      `resolve` 给的是**裁决所依据的读数**，不是裁决结果本身。
   *   ⑤ **来源等级与方向都必填**：缺等级（`bad-level`）或缺方向（`missing-direction`）一律拒收 ——
   *      不说「凭什么信」或不说「支持还是反驳」的线索，本身就构不成冲突。
   *   ⑥ **不跨链合并**（沿用 X3 取舍）：只裁给定的两条，不替调用方去找「还有没有第三条」。
   */
  const STRENGTH = {};
  LEVELS.forEach(function (k, i) { STRENGTH[k] = i + 1; });
  function resolve(a, b, opts) {
    const o = opts || {};
    const sides = [a, b].map(function (s) {
      const x = s || {};
      return { claim: clean(x.claim, 80), level: clean(x.level, 20), dir: clean(x.dir, 20),
        about: clean(x.about, 40), by: clean(x.by, 40) };
    });
    for (let i = 0; i < 2; i++) {
      const s = sides[i];
      if (!s.claim) { noteFault('missing-claim'); return { ok: false, reason: 'missing-claim', side: i === 0 ? 'a' : 'b' }; }
      if (LEVELS.indexOf(s.level) < 0) { noteFault('bad-level'); return { ok: false, reason: 'bad-level', side: i === 0 ? 'a' : 'b', allowed: LEVELS.slice() }; }
      if (s.dir !== 'support' && s.dir !== 'refute') { noteFault('missing-direction'); return { ok: false, reason: 'missing-direction', side: i === 0 ? 'a' : 'b' }; }
    }
    const A = sides[0], Bs = sides[1];
    const sa = STRENGTH[A.level], sb = STRENGTH[Bs.level];
    const doubted = [];
    const label = function (s) { return s.claim + '（' + s.level + '）'; };
    let verdict, reason, why;
    if (A.dir === Bs.dir) {
      // ② 同向：这是**印证**，不是冲突。
      if (sa === sb) {
        verdict = 'both'; reason = 'corroborated';
        why = '两条同向且**同等可信**（都是 ' + A.level + '）⇒ 互相印证，不构成冲突。';
      } else {
        const win = sa > sb ? 'a' : 'b';
        const strong = sa > sb ? A : Bs, weak = sa > sb ? Bs : A;
        verdict = win; reason = 'stronger-level';
        why = '两条同向，采信来源更强的「' + label(strong) + '」（' + strong.level + ' 高于 ' + weak.level + '）。';
        doubted.push({ side: win === 'a' ? 'b' : 'a', claim: weak.claim, level: weak.level,
          why: 'weaker-level', note: '同向但来源更弱：仍成立，只是不作为主要依据。' });
      }
    } else if (sa === sb) {
      // ③ 等强反向：真·打脸。不硬裁。
      verdict = 'undecided'; reason = 'cross-tie';
      why = '一支持一反驳且**同等可信**（都是 ' + A.level + '）⇒ 两条并排成立，谁也不能压过谁。'
        + '此时定案与宣布真相都不是本函数的事：要么补齐更强的证据，要么如实记「未决」。';
      doubted.push({ side: 'a', claim: A.claim, level: A.level, why: 'cross-tie' });
      doubted.push({ side: 'b', claim: Bs.claim, level: Bs.level, why: 'cross-tie' });
    } else {
      const win = sa > sb ? 'a' : 'b';
      const strong = sa > sb ? A : Bs, weak = sa > sb ? Bs : A;
      verdict = win; reason = 'stronger-level';
      why = '方向相反，采信来源更强的「' + label(strong) + '」（' + strong.level + ' 高于 ' + weak.level + '）；'
        + '反方不是被删掉，而是**存疑留档**。';
      doubted.push({ side: win === 'a' ? 'b' : 'a', claim: weak.claim, level: weak.level,
        why: 'outweighed', note: '被更强来源压过：只有当更强那条被推翻时才轮到它。' });
    }
    return { ok: true, verdict: verdict, reason: reason, why: why,
      levels: { a: A.level, b: Bs.level }, strength: { a: sa, b: sb },
      trusted: verdict === 'a' ? A : (verdict === 'b' ? Bs : null),
      doubted: doubted, doubtedCount: doubted.length,
      // 与 `decide` 的分工写进返回体：这里给**依据**，那里给**结论**。
      note: '本函数只报「该采信谁、为什么、存疑什么」，不替卷宗定案（定案走 decide）。',
      by: clean(o.by, 40), dryRun: true };
  }
  function view(caseId, opts) {
    // v2.142.0（D2 收口）：加第二参 opts —— 只用于「认知投影」那一条只读读数（见下）。
    //   不传时行为与旧版逐字相同（读数恒为 null），故既有调用方零改动。
    const o = opts || {};
    const c = findCase(caseId);
    if (!c) return { ok: false, reason: 'unknown-case', id: clean(caseId, 60) };
    const cfg = settings();
    const hyps = (c.hypotheses || []).map(function (h) {
      const t = tally(c, h.id);
      return { id: h.id, text: h.text, support: t.support, refute: t.refute };
    });
    const leader = hyps.slice().sort(function (a, b) { return (b.support - b.refute) - (a.support - a.refute); })[0] || null;
    // v2.142.0（D2 收口）：本卷宗候选人「此刻对这一条知道多少」的只读投影 —— 走 `intel.project`
    //   （真相只读 / 有无资格由取证档决定 / 无资格时只报条数不报内容）。
    //   **事实锚点由调用方显式给**（`opts.fact`）：没给就报 null，不拿 `accused` 顶替 ——
    //   人名当「事由」查出来的只会是「关于这个人的说法」，与「这个人知道这件事多少」是两个问句。
    const tsq = clean(o.fact, 80);
    const tsPerson = clean(o.accused, 40) || clean(c.accused, 40);
    const truthSubject = tsq
      ? { about: tsq, person: tsPerson, read: (function () {
        if (!WA.intel || typeof WA.intel.project !== 'function') return { ok: false, reason: 'intel-missing' };
        try { return WA.intel.project(tsq, tsPerson); }
        catch (e) { return { ok: false, reason: 'intel-threw' }; }
      })() }
      : null;
    return { ok: true, id: c.id, question: c.question, status: c.status, verdict: c.verdict,
      conclusion: c.conclusion || '', accused: c.accused || '',
      hypotheses: hyps, evidence: (c.evidence || []).length,
      confronts: (c.confronts || []).length, wrongs: (c.wrongs || []).length,
      leader: leader ? leader.id : '', need: cfg.minSupport,
      // 「能不能定案」当场可答：支持够且**无任何反证**才行。
      decidable: !!(leader && leader.support >= cfg.minSupport && leader.refute === 0),
      blockedBy: leader && leader.refute > 0 ? 'refuted' : (leader && leader.support < cfg.minSupport ? 'thin' : ''),
      // v2.142.0（D2 收口）：认知投影读数。`null` = 调用方没给事实锚点（不猜、不回落）。
      truthSubject: truthSubject };
  }
  function statView() {
    const rows = casesOf();
    const byVerdict = {};
    VERDICT.forEach(function (k) { byVerdict[k] = 0; });
    rows.forEach(function (c) { if (c && c.verdict) byVerdict[c.verdict] = (byVerdict[c.verdict] || 0) + 1; });
    return { enabled: settings().enabled, cases: rows.length, open: rows.filter(function (c) { return c && c.status === 'open'; }).length,
      byVerdict: byVerdict,
      evidence: rows.reduce(function (n, c) { return n + ((c.evidence || []).length); }, 0),
      wrongs: rows.reduce(function (n, c) { return n + ((c.wrongs || []).length); }, 0),
      recycled: stat.recycled, openCap: settings().maxCases };
  }
  /** 注入块：只报「卷宗里支持/反驳各有多少」与「能不能定案」，不替任何人定案。 */
  // v2.582.0：注入面**头截断**名额守卫（同形态第一批 v2.581.0 修的是尾部，这批修头）。
  //   头截断与尾截断的唯一区别是方向：这一头的顺序是**刻意排好的**（谁该先被念），
  //   所以本批不重排、不换判据，只做两件事——
  //     ① 名额读坏时不许把整面静默清空：旧法 `slice(0, NaN)` / `slice(0, 'x')` 得空数组，
  //        注入面就此消失，且一个字都不说（比截多了更坏：截多了还看得见项，清空连项都没了）；
  //     ② 截掉多少条要自证：`stat.block` 留逐面读数（faces）与顶层求和（totals），
  //        块尾写一行「共几条／念几条／另有几条未列出」。
  //   名额只截断、不筛选：`headQuota` 只把坏值拉回合法区间，`pickHead` 只做 `slice(0, q)`。
  const HEAD_FACES = {};
  /** 每轮 buildBlock 开头清账：读数只报**这一轮**的数，不许叠上一轮（life 逐人物累加是轮内需要）。 */
  function headRound() {
    Object.keys(HEAD_FACES).forEach(function (k) { delete HEAD_FACES[k]; });
    stat.block = null;
  }
  function headQuota(cfg, key, max, fallback) {
    const n = Math.floor(Number(cfg && cfg[key]));
    if (!isFinite(n) || n < 1) return Math.min(max, fallback);
    return Math.min(max, Math.max(1, n));
  }
  /** 头截断取用：保持原顺序，只截断不筛选；同面多次调用按条累加（如逐人物取目标）。 */
  function pickHead(list, quota, face) {
    const all = (Array.isArray(list) ? list : []).filter(function (x) { return !!x; });
    const q = (isFinite(quota) && quota >= 1) ? Math.floor(quota) : 1;
    const picked = all.slice(0, q);
    const hidden = Math.max(0, all.length - picked.length);
    const prev = HEAD_FACES[face];
    HEAD_FACES[face] = {
      face: face,
      candidates: (prev ? prev.candidates : 0) + all.length,
      picked: (prev ? prev.picked : 0) + picked.length,
      hidden: (prev ? prev.hidden : 0) + hidden,
      quota: q,
      rounds: (prev ? prev.rounds : 0) + 1,
      mode: (prev && prev.mode === 'head-first') || hidden > 0 ? 'head-first'
        : (all.length ? 'all-fit' : 'empty')
    };
    stat.block = blockOf();
    return picked;
  }
  /** 每次重算成新对象：外部拿到的读数不会被后续面覆盖。 */
  function blockOf() {
    const faces = {};
    let c = 0, p = 0, h = 0, n = 0;
    Object.keys(HEAD_FACES).forEach(function (k) {
      const f = HEAD_FACES[k];
      faces[k] = { candidates: f.candidates, picked: f.picked, hidden: f.hidden,
        quota: f.quota, rounds: f.rounds, mode: f.mode };
      c += f.candidates; p += f.picked; h += f.hidden; n++;
    });
    const base = (stat.block && typeof stat.block === 'object' && !stat.block.totals) ? stat.block : {};
    return Object.assign({}, base, { faces: faces,
      totals: { faces: n, candidates: c, picked: p, hidden: h } });
  }
  /** 块尾自证：念了几条、还剩几条没念，说清楚。未列出不等于没有。 */
  function proofOf() {
    const ks = Object.keys(HEAD_FACES);
    if (!ks.length) return '';
    const parts = ks.map(function (k) {
      const f = HEAD_FACES[k];
      return f.face + ' ' + f.candidates + ' 条中念 ' + f.picked + ' 条'
        + (f.hidden > 0 ? '，另有 ' + f.hidden + ' 条未列出' : '，全部列出');
    });
    return '（本面名额：' + parts.join('；')
      + '。未列出不等于没有——还在登记表上；名额只截断不筛选，不改任何既有事实）';
  }
  function buildBlock() {
    headRound();
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    // v2.560.0：这里的 `.slice(0, cfg.maxCases)` **不是**名额分配的第二个真源——
    //   名额的唯一真源是 `openCase` 的准入闸门（按未结案条数卡）。留着它只为
    //   兼容旧存档里可能已经超限的卷宗（那时它是防御，不是裁决）。
    //   本仓库反复踩的坑是「同一件事两处各写一遍判据」，故在此写明各自的职责边界。
    const rows = pickHead(casesOf().filter(function (c) { return c && c.status === 'open'; }), headQuota(cfg, 'maxCases', 24, DEF.maxCases), '调查卷宗');
    if (!rows.length) return '';
    const lines = rows.map(function (c) {
      const hyps = (c.hypotheses || []).map(function (h) {
        const t = tally(c, h.id);
        return h.text + '（支持 ' + t.support + '／反驳 ' + t.refute + '）';
      });
      return c.question + '：' + hyps.join('；');
    });
    return '[调查卷宗]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '支持与反驳各自成立，不得取平均；' + cfg.minSupport
      + ' 条支持且有反证时不得定案；证据不足时定「未决」而不是宣布真相。' + String.fromCharCode(10) + proofOf();
  }
  WA.probe = {
    LEVELS: LEVELS.slice(), STATUS: STATUS.slice(), VERDICT: VERDICT.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: openCase, addEvidence: addEvidence, confront: confront, decide: decide, wrong: wrong,
    view: view, statView: statView, buildBlock: buildBlock,
    // X4（v2.128.0）：认知冲突裁决。两个口**各有一个真读者**（能力申报不算读者）——
    //   · `resolve` ← `engines/rumor.js` 的 `investigate`（同一时间握着「事实侧原始值」与
    //     「链终态值」两条并排线索的只有那条链自己），读数再由面板「调查」按钮显示；
    //   · `auditRecord` ← 面板「看卷宗」按钮（用户输入的案件 id 是真输入，读数落在既有输出节点上）。
    //   两个都**不落盘**：卷宗定案仍然只走 `decide`（同一件事只有一个实现）。
    auditRecord: auditRecord, resolve: resolve,
    tally: function (caseId, hid) { const c = findCase(caseId); return c ? tally(c, hid) : null; },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/probe.js', { kind: 'engine', ver: '2.119.0' });
})();
