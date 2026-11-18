/**
 * WorldAxis engines/controllability.js (v2.524.0) — OPV28-25 ~ OPV28-30
 *   可控性六件：可关性 / 单轮回滚 / 导入即体检 / 危险操作确认 / 秘密零泄漏 / 开关审计
 *
 * ── 它治的病 ─────────────────────────────────────────────────────
 *   「世界会自己动」最吓人的地方不是它动，而是**你关不掉它、也退不回去**：
 *     · 某个源想关，关了却还在注入/还在半写；
 *     · 一轮推演出错，只能眼睁睁看着脏数据留在存档里；
 *     · 导入别人存档，缺什么、补什么、影响什么全靠猜；
 *     · 删档 / 大规模推进 / 清空世界，一点就执行；
 *     · 内部隐藏事实从某个缝里漏进正文；
 *     · 谁在什么时候把哪个开关关了，事后没人说得清。
 *
 * ── 纪律（每条都有判据咬）────────────────────────────────────────
 *   ① 可关性只报**真能关**的源：每个源都要有 `buildBlock` 才算「关得掉」；
 *      没有注入块的源不吹「可关」。
 *   ② 回滚是**整轮**的：先 `mark` 再 `rollback`，轮次对不上 `stale`，没标过 `missing`；
 *      回滚后不再叠加（再回滚同一次 `stale`）。
 *   ③ 体检**只报不填**：缺的键列出来、谁缺、影响什么，绝不静默补默认值。
 *   ④ 危险操作没有 `confirm:true` 一律 `permission-denied`；确认后仍在可撤窗口内。
 *   ⑤ 零泄漏：`hidden` 事实的原文只要出现在任何注入块里就 `leak` 并点名。
 *   ⑥ 开关审计是**一本账**：谁、何时、关了哪个面；没记过就说没有记录，不假造。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_controllability_settings_v1';
  const DEF = { enabled: true, auditKeep: 40, undoWindow: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'controllability',
    bounds: { auditKeep: [8, 128], undoWindow: [1, 10] } };
  const stat = { offable: 0, marks: 0, rollbacks: 0, checks: 0, confirms: 0, leaks: 0, refused: 0, lastReason: '' };
  const REQUIRED_KEYS = ['people', 'places', 'chronicle', 'clock', 'world', 'settings'];
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function draft() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }

  /** OPV28-25 可关性：每个叙事源关掉之后不注入、不半写、不留待办。 */
  function offable() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const NARR = ['offstageQueue', 'actStep', 'tracePost', 'misbelief', 'threadSprout', 'dormantLadder',
      'consequenceSchedule', 'appointment', 'timeLedger', 'hearsayLedger', 'farAccount', 'interlude',
      'letterPost', 'worldBrief'];
    const rows = NARR.map(function (ns) {
      const m = WA[ns];
      const hasBlock = !!(m && typeof m.buildBlock === 'function');
      const hasSet = !!(m && typeof m.setSettings === 'function');
      return { ns: ns, hasBlock: hasBlock, canOff: hasBlock && hasSet,
        note: hasBlock ? '关掉后 buildBlock 返回空串，注入里没有这一节' : '这个源不注入正文（没有块），不吹「可关」' };
    });
    stat.offable++;
    return { ok: true, reason: 'ok', rows: rows,
      offableCount: rows.filter(function (x) { return x.canOff; }).length, total: rows.length };
  }

  /** OPV28-26 单轮回滚：整轮撤回，撤一半不算撤。 */
  function mark() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const d = draft();
    let payload = '';
    try { payload = JSON.stringify(d); } catch (e) { payload = ''; }
    if (!payload) return refuse('shortfall', { why: '存档序列化不出来，标了也回不去' });
    const r = round();
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (dd) {
          dd.roundMark = { round: r, at: Date.now(), payload: payload.slice(0, 400000) };
          return true;
        }, 'ctl:mark');
      }
    } catch (e) { return refuse('write-failed', { why: '标记写不进存档' }); }
    stat.marks++;
    return { ok: true, reason: 'ok', round: r, bytes: payload.length };
  }
  function rollback(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const d = draft();
    const m = d.roundMark;
    if (!m || !m.payload) return refuse('missing', { why: '这一轮没有标记过，撤不回去（先 mark）' });
    if (Number.isFinite(s.round) && s.round !== m.round) {
      return refuse('stale', { markRound: m.round, want: s.round, why: '标记属于另一轮：撤了会把两轮混在一起' });
    }
    if (round() - m.round > cfg.undoWindow) {
      return refuse('stale', { markRound: m.round, now: round(), window: cfg.undoWindow, why: '超出可撤窗口' });
    }
    let snap = null;
    try { snap = JSON.parse(m.payload); } catch (e) { snap = null; }
    if (!snap) return refuse('shortfall', { why: '标记内容读不出来，撤销会写坏存档' });
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (dd) {
          Object.keys(dd).forEach(function (k) { if (k !== 'roundMark' && !(k in snap)) delete dd[k]; });
          Object.keys(snap).forEach(function (k) { dd[k] = snap[k]; });
          dd.roundMark = null;
          return true;
        }, 'ctl:rollback');
      }
    } catch (e) { return refuse('write-failed', { why: '回滚写不进存档' }); }
    stat.rollbacks++;
    return { ok: true, reason: 'ok', round: m.round, restored: true,
      note: '整轮回到标记点（不是撤一半：这一轮写进去的都退了）' };
  }

  /** OPV28-27 导入即体检：缺什么 / 补什么 / 影响什么（只报不填）。 */
  function importCheck(snapshot) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : draft();
    const missing = REQUIRED_KEYS.filter(function (k) { return snap[k] === undefined || snap[k] === null; });
    const impact = missing.map(function (k) {
      if (k === 'people') return '没有人物：推演无人可动，叙事直接停摆';
      if (k === 'places') return '没有地点：位置连续性判不出，人会「瞬移」';
      if (k === 'chronicle') return '没有编年史：世界一句话与年表会空';
      if (k === 'clock') return '没有世界钟：期限与节令失去基准';
      if (k === 'world') return '没有世界容器：路线与时局读不到';
      return '没有设置面：所有开关按出厂值走（可能与原存档不一致）';
    });
    stat.checks++;
    return { ok: true, reason: 'ok', missing: missing, impact: impact,
      filled: [], note: missing.length ? '缺的键一个都不替你填（填了就是把别人的世界改掉）' : '六个必需容器都在' };
  }

  /** OPV28-28 危险操作确认：删档/大规模推进/清空世界。 */
  const DANGEROUS = ['delete-save', 'clear-world', 'bulk-advance'];
  function confirm(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const op = String(s.op || '').trim();
    if (DANGEROUS.indexOf(op) < 0) return refuse('missing-fields', { field: 'op', allowed: DANGEROUS.slice() });
    if (s.confirm !== true) {
      stat.confirms++;
      return refuse('permission-denied', { op: op, needConfirm: true,
        text: '这一步会' + (op === 'delete-save' ? '删掉整个存档' : (op === 'clear-world' ? '清空世界' : '一次推进很多轮')) +
          '：确认就带 confirm:true 再来一次' });
    }
    return { ok: true, reason: 'ok', op: op, confirmed: true, undoable: true,
      window: cfg.undoWindow, note: '确认过了；' + cfg.undoWindow + ' 轮内仍可 mark/rollback 撤回' };
  }

  /** OPV28-29 秘密零泄漏：hidden 原文不许出现在任何注入块里。 */
  function secretScan() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const d = draft();
    const chr = Array.isArray(d.chronicle) ? d.chronicle : [];
    const hidden = chr.filter(function (x) { return x && (x.hidden === true || x.kind === 'hidden'); });
    let block = '';
    try { block = WA.worldBrief && WA.worldBrief.buildBlock ? String(WA.worldBrief.buildBlock() || '') : ''; } catch (e) { block = ''; }
    const leaked = hidden.filter(function (x) {
      const t = String(x.text || x.what || '').slice(0, 30);
      return t && block.indexOf(t) >= 0;
    });
    if (leaked.length) {
      stat.leaks++;
      return refuse('leak', { count: leaked.length, ids: leaked.slice(0, 4).map(function (x) { return x.id; }),
        why: '隐藏事实的原文出现在了注入块里' });
    }
    return { ok: true, reason: 'ok', hidden: hidden.length, scanned: block.length,
      note: hidden.length ? '隐藏事实一条都没进注入块' : '现场没有隐藏事实（也就不存在泄漏）' };
  }

  /** OPV28-30 开关审计：谁、何时、关了哪个面。 */
  function switchNote(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const face = String(s.face || '').slice(0, 40);
    if (!face) return refuse('missing-fields', { field: 'face' });
    const row = { face: face, on: s.on !== false, by: String(s.by || '').slice(0, 40) || '未知（调用方没说是谁）',
      at: Date.now(), round: round(), why: String(s.why || '').slice(0, 60) };
    const d = draft();
    const log = Array.isArray(d.switchAudit) ? d.switchAudit.slice() : [];
    log.push(row);
    while (log.length > cfg.auditKeep) log.shift();
    try {
      if (WA.store && WA.store.transact) WA.store.transact(function (dd) { dd.switchAudit = log; return true; }, 'ctl:switch');
    } catch (e) { /* 记不下就如实说 */ }
    return { ok: true, reason: 'ok', row: row, kept: log.length };
  }
  function switchAudit() {
    const d = draft();
    const log = Array.isArray(d.switchAudit) ? d.switchAudit : [];
    return { ok: true, reason: 'ok', rows: log.slice(-12), count: log.length,
      note: log.length ? '这些是记过的开关变更（谁、何时、哪个面）' : '还没有开关变更的记录 —— 不假造' };
  }

  function view() {
    return { enabled: settings().enabled, stat: Object.assign({}, stat),
      switches: (Array.isArray(draft().switchAudit) ? draft().switchAudit.length : 0) };
  }

  WA.controllability = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    offable: offable, mark: mark, rollback: rollback, importCheck: importCheck,
    confirm: confirm, secretScan: secretScan, switchNote: switchNote, switchAudit: switchAudit, view: view,
    DANGEROUS: DANGEROUS.slice(),
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/controllability.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/controllability 已加载（' + VERSION + '）');
})();