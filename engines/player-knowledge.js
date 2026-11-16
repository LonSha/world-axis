/**
 * WorldAxis engines/player-knowledge.js (v2.417.0) — EXV25-1 角色对主角的了解清单
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   本仓防全知已有两道，但都不是这一层：
 *     · `noesis.knows(person, factId)` 是**裁决口** —— 聚合六源（知道/持有/在职/在岗/传信/记忆保真），
 *       回答的是「这个人知不知道**某条已登记的事实**」；
 *     · `intel` 管情报的置信度与传播路径（rumor/report/witness/record，且「情报不得瞬移」）。
 *   两者之间**空着一层**：没有任何一处记「这个角色对**主角本人**知道些什么」。
 *   实测 `grep -rn '了解清单\|knowsAbout\|perNpcKnowledge' engines/` —— 430 引擎 0 命中；
 *   `store.people.*.knowledge` 是 backstage 泛化的 `{status,route,at}` 杂项，不区分「说的是谁」，
 *   也没有「没记 = 不知道」的判定面。
 *
 *   后果很具体：世界书写着主角的身世、角色卡写着主角的秘密，于是**每个角色一登场就全知**；
 *   主角从没说过的事，NPC 张口就来；被骗子骗了之后，角色照记真相，永远骗不住。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `add` 按「谁 → 关于主角的哪一面 → 具体内容」逐条入账 →
 *   `knows({who, about})` 回答他知不知道，**没记过一律答 known:false + not-recorded**
 *   （不拿人设/世界书补全）→ `correct` 在真相揭穿时改写原条
 *   （被骗期间记的就是被骗后的认知——这才叫被骗住）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① 不碰 store：谁是谁、这件事说的是谁，全由调用方给。
 *   ② 只记「关于主角的事」这一档；世界事实的知情走 noesis / intel，不在此重复。
 *   ③ 每人条数有界（默认 24），挤出最早且 `pinned` 为假的条目；置顶条不挤。
 *   ④ 拒收码只用 disabled / missing-* / unknown-entry，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return null; } };
  const LS_KEY = 'worldaxis_player_knowledge_settings_v1';
  const DEF = { enabled: true, maxRows: 256, perPerson: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'playerKnowledge',
    bounds: { maxRows: [64, 1024], perPerson: [4, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const stat = { added: 0, corrected: 0, forgotten: 0, knows: 0, unknownHits: 0, refused: 0, lastReason: '' };
  const ROWS = []; // {id, whoKey, who, about, aboutKey, text, textKey, source, at, correctedAt, pinned, hits}
  const SOURCES = ['told', 'witnessed', 'record', 'rumored', 'guessed'];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function keyOf(s) { return str(s).toLowerCase(); }
  function rowsOf(who) { const k = keyOf(who); return ROWS.filter(function (r) { return r.whoKey === k; }); }
  function trimPerson(who, cap) {
    const mine = rowsOf(who);
    while (mine.length > cap) {
      const idx = mine.findIndex(function (r) { return !r.pinned; });
      if (idx < 0) break;
      const victim = mine.splice(idx, 1)[0];
      const at = ROWS.indexOf(victim);
      if (at >= 0) ROWS.splice(at, 1);
    }
  }
  function trimAll(cap) {
    while (ROWS.length > cap) {
      const idx = ROWS.findIndex(function (r) { return !r.pinned; });
      if (idx < 0) break;
      ROWS.splice(idx, 1);
    }
  }
  function add(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), about = str(s.about), text = str(s.text);
    if (!who) { stat.refused++; stat.lastReason = 'missing-who'; return { ok: false, hint: 'missing-who：这是谁记着的事？没有记的人就没有账' }; }
    if (!about) { stat.refused++; stat.lastReason = 'missing-about'; return { ok: false, hint: 'missing-about：这件事说的是主角的哪一面？（身世/秘密/喜好/经历）' }; }
    if (!text) { stat.refused++; stat.lastReason = 'missing-text'; return { ok: false, hint: 'missing-text：他具体知道的是什么？空条写不成账' }; }
    const src = SOURCES.indexOf(str(s.source)) >= 0 ? str(s.source) : 'told';
    const dup = rowsOf(who).find(function (r) { return r.aboutKey === keyOf(about) && r.textKey === keyOf(text); });
    if (dup) { dup.hits++; return { ok: true, id: dup.id, dup: true }; }
    const now = num(s.at) || clockNow('playerKnowledge') || 0;
    const rec = { id: 'pk' + (++stat.added) + '-' + keyOf(who), whoKey: keyOf(who), who: who,
      about: about, aboutKey: keyOf(about), text: text, textKey: keyOf(text),
      source: src, at: now, correctedAt: null, pinned: !!s.pinned, hits: 1 };
    ROWS.push(rec);
    trimAll(cfg.maxRows);
    trimPerson(who, cfg.perPerson);
    return { ok: true, id: rec.id, who: who, about: about, source: src };
  }
  /** 判定口：没记过就是不知道 —— 不冒充、不拿人设与世界书补全。 */
  function knows(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who), about = str(s.about);
    if (!who) return { ok: false, hint: 'missing-who：问的是谁知道？' };
    if (!about) return { ok: false, hint: 'missing-about：问的是哪件事？' };
    stat.knows++;
    const mine = rowsOf(who);
    if (!mine.length) { stat.unknownHits++; return { ok: true, known: false, reason: 'unknown-person',
      hint: '不认识这个人：一条都没记，就当他不知道' }; }
    const hit = mine.find(function (r) { return r.aboutKey === keyOf(about) || r.textKey === keyOf(about); });
    if (!hit) { stat.unknownHits++; return { ok: true, known: false, reason: 'not-recorded',
      hint: '没记过这件事：没记就是不知道，不拿人设与世界书补全' }; }
    return { ok: true, known: true, id: hit.id, text: hit.text, source: hit.source, at: hit.at };
  }
  /** 真相揭穿：改写原条（保留 prevText 以便追溯「他原先以为的是什么」）。 */
  function correct(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = ROWS.find(function (r) { return r.id === str(s.id); });
    if (!rec) { stat.refused++; stat.lastReason = 'unknown-entry'; return { ok: false, hint: 'unknown-entry：没有这条了解账' }; }
    const text = str(s.text);
    if (!text) { stat.refused++; stat.lastReason = 'missing-text'; return { ok: false, hint: 'missing-text：改写成什么？' }; }
    rec.prevText = rec.text;
    rec.text = text; rec.textKey = keyOf(text);
    rec.correctedAt = num(s.at) || clockNow('playerKnowledge') || 0;
    stat.corrected++;
    return { ok: true, id: rec.id, text: rec.text, prevText: rec.prevText, correctedAt: rec.correctedAt };
  }
  function forget(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const idx = ROWS.findIndex(function (r) { return r.id === str(s.id); });
    if (idx < 0) { stat.refused++; stat.lastReason = 'unknown-entry'; return { ok: false, hint: 'unknown-entry：没有这条了解账' }; }
    const rec = ROWS.splice(idx, 1)[0];
    stat.forgotten++;
    return { ok: true, id: rec.id, reason: str(s.reason) || 'forgotten' };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    const rows = (who ? rowsOf(who) : ROWS.slice()).map(function (r) {
      return { id: r.id, who: r.who, about: r.about, text: r.text, source: r.source,
        at: r.at, correctedAt: r.correctedAt, pinned: r.pinned };
    });
    return { ok: true, count: rows.length, rows: rows };
  }
  /** 注入面：给定候选清单，逐条回答此人知道/不知道。不在候选里的不问。 */
  function unknownFor(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = str(s.who);
    const cands = Array.isArray(s.candidates) ? s.candidates : [];
    if (!who) return { ok: false, hint: 'missing-who：给一个人名' };
    const mine = rowsOf(who);
    const known = [], unknown = [];
    cands.forEach(function (c) {
      const q = typeof c === 'string' ? c : str(c && (c.about || c.text));
      if (!q) return;
      const hit = mine.find(function (r) { return r.aboutKey === keyOf(q) || r.textKey === keyOf(q); });
      if (hit) known.push({ about: q, text: hit.text });
      else unknown.push({ about: q });
    });
    return { ok: true, who: who, known: known, unknown: unknown,
      hint: unknown.length ? '以下事此人没有记录：默认他不知道，不要让人物凭人设补全' : '' };
  }
  function statView() {
    const m = {};
    ROWS.forEach(function (r) { m[r.whoKey] = 1; });
    return Object.assign({ rows: ROWS.length, people: Object.keys(m).length }, stat);
  }
  function reset() {
    ROWS.length = 0;
    stat.added = 0; stat.corrected = 0; stat.forgotten = 0;
    stat.knows = 0; stat.unknownHits = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.playerKnowledge = {
    add: add, knows: knows, correct: correct, forget: forget, view: view,
    unknownFor: unknownFor, stat: statView, reset: reset,
    setSettings: saveSettings, getSettings: settings, SOURCES: SOURCES.slice()
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/player-knowledge.js', { kind: 'engine', ver: '2.417.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/player-knowledge 已加载（2.417.0）');
})();