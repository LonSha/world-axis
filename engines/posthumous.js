/**
 * WorldAxis engines/posthumous.js (v2.524.0) — EXV29-19/21/22/24 身后四事
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   人死之后现场会同时塌四样东西，而它们各归各的模块管，**没有人把它们串成一件"身后事"**：
 *     · 债（`credit-ledger` 只认活人：持有人一死，未清的账要么挂死在死人名下，要么人间蒸发）；
 *     · 遗物与遗嘱（`personal-inventory` 有行囊，但没有"传给谁"与"违背了"这回事）；
 *     · 翻案（`evidence-board` 有证据，但没有"凭这些够不够翻、要等多久"的闸）；
 *     · 悼念（`anniversary-rites` 记着日子，但没人记"还有谁记得"）。
 *   本模块不重造这四样，只做**串接与判据**：每一件都真的调它们自己的口。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `oblige` 把死人名下未清的账转籍（没继承人 ⇒ 明说"无从追索"，账不消失）；
 *   `bequeath`/`will`/`violate` 让遗物有主、遗嘱可被违背且要担后果；
 *   `overturn` 要求**证据够 + 时间到**才准翻（不够就拒，不靠一句话）；
 *   `remember`/`keeperDied` 让"被遗忘"成为可发生的事件（记得的人都死了，就没人提）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不替死人编债：名下没有未清的账 ⇒ `not-happened`（转不出东西）。
 *   ② 没收件人的遗物不算给：`bequeath` 缺 `to` ⇒ `missing-fields`。
 *   ③ 违背遗嘱必须点得出是哪一条：`violate` 无此遗愿 ⇒ `not-happened`。
 *   ④ 没证据不许翻案：证据 < 2 条 ⇒ `below-threshold`（负控制）。
 *   ⑤ 时间没到不许翻：`at < earliestAt` ⇒ `not-happened`（翻案要等）。
 *   ⑥ 没人记得就不叫传闻：`remember` 的 `keepers` 空 ⇒ `missing-fields`。
 *   ⑦ 有界：记忆最多 24 条、遗愿最多 24 条、翻案 16 条（与 `__BOUNDED_CAPS` 对齐）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const STORE_KEY = 'posthumous';
  const MEM_CAP = 24;
  const WILL_CAP = 24;
  const OVER_CAP = 16;
  const MIN_EVIDENCE = 2;
  const stat = { obliged: 0, bequeathed: 0, wills: 0, breached: 0, overturned: 0,
    remembered: 0, forgotten: 0, refused: 0, badInput: 0 };
  let shadow = null;

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function box() {
    let m = null;
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      m = all[STORE_KEY];
    } catch (e) { m = null; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = shadow || {};
    return {
      debts: (m.debts && typeof m.debts === 'object') ? m.debts : {},
      estates: (m.estates && typeof m.estates === 'object') ? m.estates : {},
      wills: (m.wills && typeof m.wills === 'object') ? m.wills : {},
      overturns: (m.overturns && typeof m.overturns === 'object') ? m.overturns : {},
      memories: (m.memories && typeof m.memories === 'object') ? m.memories : {}
    };
  }
  function save(b) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = b; return false; }
      WA.store.transact(function (d) { d[STORE_KEY] = b; return true; }, 'posthumous');
      return true;
    } catch (e) { shadow = b; return false; }
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 48);
  }
  function nowAt() {
    try { return (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('posthumous') : Date.now(); }
    catch (e) { return Date.now(); }
  }
  function capObj(o, cap) {
    const ks = Object.keys(o);
    if (ks.length <= cap) return o;
    ks.sort(function (a, b) { return ((o[a].at || 0) - (o[b].at || 0)); });
    ks.slice(0, ks.length - cap).forEach(function (k) { delete o[k]; });
    return o;
  }

  /** EXV29-19 债不随人死：转给继承人；没有继承人 ⇒ 无从追索（账不消失）。 */
  function oblige(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const deceased = clean(src.deceased, 40);
    const heir = clean(src.heir, 40);
    if (!deceased) return refuse('missing-fields', { missing: ['deceased'] });
    const CL = WA.creditLedger;
    if (!CL || typeof CL.transfer !== 'function') return refuse('module-missing', { module: 'creditLedger' });
    const b = box();
    if (!heir) {
      const u = (typeof CL.unclaimable === 'function') ? CL.unclaimable(deceased) : { count: 0, rows: [] };
      b.debts[deceased] = { deceased: deceased, heir: null, count: u.count || 0, at: nowAt(), claimable: false };
      capObj(b.debts, 24);
    save(b);
      stat.refused++;
      return { ok: false, reason: 'missing-fields', missing: ['heir'], count: u.count || 0, rows: u.rows || [],
        note: '无从追索：没有继承人，这 ' + (u.count || 0) + ' 笔还挂在他名下——债不消失，只是没人可追' };
    }
    if (deceased === heir) return refuse('same-party', { why: '自己继承自己的账：不成立' });
    const r = CL.transfer({ holder: deceased, heir: heir, side: src.side, at: src.at });
    if (!r || !r.ok) {
      if (r && r.reason === 'not-happened') return { ok: false, reason: 'not-happened', deceased: deceased, note: '他名下没有未清的账：没有可转的东西' };
      return refuse((r && r.reason) || 'tx-failed', r);
    }
    b.debts[deceased] = { deceased: deceased, heir: heir, count: r.count, at: nowAt(), claimable: true };
    capObj(b.debts, 24);
    save(b);
    stat.obliged++;
    return { ok: true, reason: 'ok', deceased: deceased, heir: heir, count: r.count, rows: r.rows,
      note: '人死了，账还在：' + r.count + ' 笔转到「' + heir + '」名下，到期照旧催' };
  }

  /** EXV29-21 遗物有主：登记归属；两个人都是行囊里的角色就真把东西放过去。 */
  function bequeath(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const deceased = clean(src.deceased, 40);
    const item = clean(src.item, 40);
    const to = clean(src.to, 40);
    const missing = [];
    if (!deceased) missing.push('deceased');
    if (!item) missing.push('item');
    if (!to) missing.push('to');
    if (missing.length) return refuse('missing-fields', { missing: missing, why: '遗物要有主：谁的、什么、给谁' });
    if (to === deceased) return refuse('bad-scope', { field: 'to', why: '遗物不能还给自己' });
    const b = box();
    const key = deceased + '|' + item;
    if (b.estates[key]) {
      stat.refused++;
      return { ok: false, reason: 'already', key: key, to: b.estates[key].to, note: '这件遗物已经归了人：不许再分一次' };
    }
    let handoff = null;
    const INV = WA.personalInventory;
    if (INV && typeof INV.addItem === 'function' && src.intoInventory !== false) {
      try {
        const res = INV.addItem(to, { id: 'heirloom:' + key, name: item, size: 1, concealed: false }, src.container || 'bag');
        handoff = { to: 'personalInventory.addItem', ok: res !== false, reason: res === false ? 'refused' : null };
      } catch (e) {
        handoff = { to: 'personalInventory.addItem', ok: false, reason: 'threw' };
      }
    }
    b.estates[key] = { key: key, deceased: deceased, item: item, to: to, at: nowAt(), handoff: handoff };
    capObj(b.estates, 32);
    save(b);
    stat.bequeathed++;
    return { ok: true, reason: 'ok', key: key, deceased: deceased, item: item, to: to, handoff: handoff,
      note: '「' + item + '」归了「' + to + '」（遗物有主）' };
  }

  /** 立遗嘱：逐条写下"什么给谁"。没有收件人的那一条不收。 */
  function will(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const deceased = clean(src.deceased, 40);
    if (!deceased) return refuse('missing-fields', { missing: ['deceased'] });
    const raw = Array.isArray(src.wishes) ? src.wishes : [];
    const wishes = [];
    const badRows = [];
    raw.forEach(function (w, i) {
      const item = clean(w && w.item, 40);
      const to = clean(w && w.to, 40);
      if (!item || !to) { badRows.push({ index: i, missing: !item ? 'item' : 'to' }); return; }
      wishes.push({ item: item, to: to });
    });
    if (!wishes.length) return refuse('missing-fields', { missing: ['wishes'], badRows: badRows, why: '遗嘱里没有一条写全的（东西 + 给谁）' });
    const b = box();
    b.wills[deceased] = { deceased: deceased, wishes: wishes.slice(0, WILL_CAP), at: nowAt(), breaches: [] };
    capObj(b.wills, WILL_CAP);
    save(b);
    stat.wills++;
    return { ok: true, reason: 'ok', deceased: deceased, count: wishes.length, skipped: badRows, wishes: wishes,
      note: '遗嘱立下了：' + wishes.length + ' 条；写不全的 ' + badRows.length + ' 条没进（不许糊过去）' };
  }

  /** 违背遗嘱：点得出来是哪一条才记，记了就担后果。 */
  function violate(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const deceased = clean(src.deceased, 40);
    const item = clean(src.item, 40);
    const by = clean(src.by, 40);
    const missing = [];
    if (!deceased) missing.push('deceased');
    if (!item) missing.push('item');
    if (!by) missing.push('by');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    const b = box();
    const w = b.wills[deceased];
    if (!w) return { ok: false, reason: 'not-happened', deceased: deceased, note: '他没立过遗嘱：谈不上违背' };
    const hit = (w.wishes || []).filter(function (x) { return x.item === item; })[0];
    if (!hit) return { ok: false, reason: 'not-happened', deceased: deceased, item: item, note: '遗嘱里没有这一条：不算违背' };
    if ((w.breaches || []).some(function (x) { return x.item === item; })) {
      return { ok: false, reason: 'already', deceased: deceased, item: item, note: '这一条已经被违过一次：后果只算一次' };
    }
    w.breaches = w.breaches || [];
    w.breaches.push({ item: item, intendedTo: hit.to, by: by, at: nowAt() });
    save(b);
    stat.breached++;
    return { ok: true, reason: 'ok', deceased: deceased, item: item, intendedTo: hit.to, by: by,
      breaches: w.breaches.length,
      note: '「' + by + '」把「' + item + '」拿走了，没给遗嘱里的「' + hit.to + '」：这件事会被人记住'
        + (w.breaches.length > 1 ? '（他已经不是第一次改主意了）' : '') };
  }

  /** 违背过遗嘱的人（读）：谁欠死者一个交代。 */
  function breachView(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const deceased = clean(src.deceased, 40);
    if (!deceased) return refuse('missing-fields', { missing: ['deceased'] });
    const w = box().wills[deceased];
    if (!w) return { ok: true, reason: 'ok', deceased: deceased, empty: true, rows: [], note: '他没立过遗嘱' };
    return { ok: true, reason: 'ok', deceased: deceased, empty: !(w.breaches || []).length,
      rows: (w.breaches || []).slice(0, 8), wishes: (w.wishes || []).slice(0, WILL_CAP) };
  }

  /**
   * EXV29-22 翻案要付证据：证据够 + 时间到才准翻；翻成之后名声随之改口。
   * @param {object} spec { subject, caseId, evidence:[], at, earliestAt, by }
   */
  function overturn(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const subject = clean(src.subject, 40);
    if (!subject) return refuse('missing-fields', { missing: ['subject'] });
    const evidence = (Array.isArray(src.evidence) ? src.evidence : []).map(function (e) { return clean(e, 40); })
      .filter(function (e) { return !!e; });
    if (evidence.length < MIN_EVIDENCE) {
      stat.refused++;
      return { ok: false, reason: 'below-threshold', got: evidence.length, need: MIN_EVIDENCE,
        note: '证据不够：翻案不是一句话，得拿得出 ' + MIN_EVIDENCE + ' 条以上的东西' };
    }
    const at = Number.isFinite(Number(src.at)) ? Number(src.at) : nowAt();
    const earliest = Number.isFinite(Number(src.earliestAt)) ? Number(src.earliestAt) : null;
    if (earliest !== null && at < earliest) {
      stat.refused++;
      return { ok: false, reason: 'not-happened', at: at, earliestAt: earliest,
        note: '还没到时候：翻案要等（最早 ' + earliest + '）' };
    }
    // 复用证据面：有卷宗就现取它自己的读数（不抄一份副本，也不替它下判断）
    let board = null;
    const EB = WA.evidenceBoard;
    const caseId = clean(src.caseId, 40);
    if (caseId && EB && typeof EB.board === 'function') {
      try {
        const r = EB.board(caseId);
        board = r ? { ok: !!r.ok, edges: r.edges, independent: r.independent, relayed: r.relayed, reason: r.reason || r.fault || null } : null;
      } catch (e) { board = { ok: false, reason: 'threw' }; }
    } else if (caseId) {
      return refuse('module-missing', { module: 'evidenceBoard' });
    }
    const b = box();
    const key = subject + '|' + (caseId || 'no-case');
    if (b.overturns[key]) {
      stat.refused++;
      return { ok: false, reason: 'already', key: key, note: '这件案子已经翻过了：不许翻第二次' };
    }
    b.overturns[key] = { key: key, subject: subject, caseId: caseId || null, evidence: evidence.slice(0, 8), at: at, board: board };
    capObj(b.overturns, OVER_CAP);
    save(b);
    stat.overturned++;
    let repNote = null;
    const RA = WA.reputationAfter;
    if (RA && typeof RA.note === 'function') {
      const r = RA.note({ subject: subject, by: clean(src.by, 40) || '公论', label: '案子翻了', source: 'document', weight: 3, at: at });
      repNote = r && r.ok ? '名声已改口' : ('名声没记上：' + ((r && r.reason) || 'unknown'));
    }
    return { ok: true, reason: 'ok', subject: subject, caseId: caseId || null, evidence: evidence.slice(0, 8),
      board: board, repNote: repNote,
      note: '翻案成立：' + evidence.length + ' 条证据 + 时间到了' + (repNote ? '；名声跟着改口' : '') };
  }

  /** EXV29-24 悼念：有人记得才会被提起。 */
  function remember(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const who = clean(src.who, 40);
    if (!who) return refuse('missing-fields', { missing: ['who'] });
    const keepers = (Array.isArray(src.keepers) ? src.keepers : []).map(function (k) { return clean(k, 40); })
      .filter(function (k) { return !!k && k !== who; });
    if (!keepers.length) return refuse('missing-fields', { missing: ['keepers'], why: '没人记得就不算有人纪念：至少给一个记得的人' });
    const b = box();
    b.memories[who] = { who: who, at: Number.isFinite(Number(src.at)) ? Number(src.at) : nowAt(),
      keepers: keepers.slice(0, 8), forgotten: false, forgottenAt: 0 };
    capObj(b.memories, MEM_CAP);
    save(b);
    stat.remembered++;
    return { ok: true, reason: 'ok', who: who, keepers: keepers.slice(0, 8),
      note: '有人记得：' + keepers.join('、') + ' 会提他' };
  }

  /** 记得的人死了：最后一个也走了，就没人再提——"被遗忘"是一件可以发生的事。 */
  function keeperDied(spec) {
    const src = (spec && typeof spec === 'object') ? spec : {};
    const keeper = clean(src.keeper, 40);
    if (!keeper) return refuse('missing-fields', { missing: ['keeper'] });
    const b = box();
    const justForgotten = [];
    Object.keys(b.memories).forEach(function (who) {
      const m = b.memories[who];
      if (!m || m.forgotten) return;
      const idx = m.keepers.indexOf(keeper);
      if (idx < 0) return;
      m.keepers.splice(idx, 1);
      if (!m.keepers.length) {
        m.forgotten = true;
        m.forgottenAt = nowAt();
        justForgotten.push(who);
      }
    });
    save(b);
    if (!justForgotten.length) {
      return { ok: true, reason: 'ok', keeper: keeper, forgotten: [], note: '还轮不到他没人记得（别的人还记得）' };
    }
    stat.forgotten += justForgotten.length;
    return { ok: true, reason: 'ok', keeper: keeper, forgotten: justForgotten,
      note: justForgotten.join('、') + ' 从此没人提了：最后一个记得他的人也没了' };
  }

  /** 读：谁还有人在念，谁已经没人提。 */
  function remembrance() {
    const b = box();
    const ks = Object.keys(b.memories);
    const still = ks.filter(function (k) { return !b.memories[k].forgotten; });
    const gone = ks.filter(function (k) { return b.memories[k].forgotten; });
    return { ok: true, reason: 'ok', remembered: still.length, forgotten: gone.length,
      rows: still.map(function (k) { const m = b.memories[k]; return { who: m.who, keepers: m.keepers.slice() }; }),
      forgottenRows: gone.map(function (k) { return { who: k, forgottenAt: b.memories[k].forgottenAt }; }) };
  }

  function statOf() { return Object.assign({}, stat); }
  function buildBlock() {
    const b = box();
    const bits = [];
    const debts = Object.keys(b.debts);
    if (debts.length) {
      const d = b.debts[debts[debts.length - 1]];
      bits.push(d.claimable ? (d.deceased + ' 的 ' + d.count + ' 笔账转给了' + d.heir)
        : (d.deceased + ' 的 ' + d.count + ' 笔账无人可追（债没消失）'));
    }
    const est = Object.keys(b.estates);
    if (est.length) {
      const e = b.estates[est[est.length - 1]];
      bits.push('「' + e.item + '」归了' + e.to);
    }
    const br = Object.keys(b.wills).reduce(function (a, k) { return a + ((b.wills[k].breaches || []).length); }, 0);
    if (br) bits.push('有人改了遗嘱（' + br + ' 条）');
    const r = remembrance();
    if (r.forgotten) bits.push(r.forgotten + ' 个人已经没人再提');
    if (!bits.length) return '';
    return '【身后】' + bits.join('；') + '——人已经不在了，这些账还得有人认。';
  }

  WA.posthumous = {
    MEM_CAP: MEM_CAP, WILL_CAP: WILL_CAP, OVER_CAP: OVER_CAP, MIN_EVIDENCE: MIN_EVIDENCE,
    oblige: oblige, bequeath: bequeath, will: will, violate: violate, breachView: breachView,
    overturn: overturn, remember: remember, keeperDied: keeperDied, remembrance: remembrance,
    buildBlock: buildBlock, stat: statOf
  };
})();