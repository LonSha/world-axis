/* coordinate.js —— 坐标·日程·台账引擎（WA.coordinate）
 *
 * 治什么：正文（故事层）与簿册（状态层）之间的搬运不再靠模型随口报数。
 *   - 锚点索引：正文 html 只存单条快照文件，索引里只放白名单轻量元数据，避免把全文摄进状态。
 *   - 日程点域：pc-1 这类点域码在算与显之间双向 codec，杜绝「第 3 日」与「pc-1」对不上。
 *   - 刻度台账：一件事按八个字段落账（事由｜类型｜牵扯｜标签｜现状｜到期｜周期｜来源锚），
 *     连续状态/约定待办/周期三类；少于六字的事由不落账（太碎）。
 *   - 浅浅结：对外只暴露一条固定桥键的轻量记忆面，千千结式跨会话记忆不再直写本仓骨架。
 *   - 自动更新闸门：显式工作流可以声明「本楼哪些自动模块由我接管」，被接管的自动模块本轮不再弹自己。
 *
 * 缝合来源：ST-SevenDaysCal（business/coordinate/schema.js、business/ledger/capture.js、
 *   business/memory/qianqianjie.js、automation-gate.js）
 *
 * 与邻座分工：ledger.js / ledger-timeline.js 管账目与时间轴渲染；calendar*.js 管历法；
 *   coordinate 只管「坐标怎么存、怎么编解码、一笔账怎么切片、自动模块谁让位」。
 *
 * 边界（否定式）：
 *   1. 索引里不放正文 —— 只收白名单元数据键，正文一律转交快照文件。
 *   2. 事由短于六字不落账（上游 CAPTURE_FLOORS）。
 *   3. 八字段一律全角竖线分隔，缺项留空但不允许少于五段（否则按 bad-fields 拒）。
 *   4. 接管声明只在本轮有效，不写盘、不跨轮继承。
 *   5. 桥键不落正文，不往注入块里塞内部键名。
 *   6. 点域码只认 pc-N / day-N 两类，其余原样回显不做换算。
 *   7. 不代替 calendar 算闰月，不代替 ledger 做余额。
 *   8. 预留空位保留，不隐式扩容（满了按 evict 挤出最旧）。
 *   9. 接管只影响注入与否，不阻断模块自身的记录。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_coordinate_settings_v1';
  const DEF = { enabled: false, maxAnchors: 64, maxRows: 64, captureFloors: 6, bridge: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'coordinate',
    bounds: { maxAnchors: [8, 256], maxRows: [8, 256], captureFloors: [2, 24] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const LEDGER_EVENT_TYPES = ['state', 'todo', 'cycle'];
  const LEDGER_TYPE_LABEL = { state: '持续状态', todo: '约定待办', cycle: '周期' };
  const LEDGER_FIELD_SPEC = ['subject', 'type', 'party', 'tags', 'now', 'due', 'cycle', 'anchor'];
  const LEDGER_FIELD_LABEL = ['事由', '类型', '牵扯', '标签', '现状', '到期', '周期', '来源锚'];
  const SEP = '｜';
  const ANCHOR_KEYS = ['id', 'title', 'kind', 'pc', 'day', 'at', 'tags'];
  const SNAPSHOT_KINDS = ['scene', 'dialog', 'sheet', 'note'];
  const BRIDGE_KEY = 'qqj_v3_public_bridge_v1';
  const GATE_SCOPES = ['auto-module', 'auto-inject', 'auto-recall'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { anchors: 0, encoded: 0, decoded: 0, captured: 0, gateClaims: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(draft) {
    const r = draft || state();
    if (!r.coordinate || typeof r.coordinate !== 'object' || Array.isArray(r.coordinate)) r.coordinate = { anchors: [], rows: [] };
    if (!Array.isArray(r.coordinate.anchors)) r.coordinate.anchors = [];
    if (!Array.isArray(r.coordinate.rows)) r.coordinate.rows = [];
    return r.coordinate;
  }
  function anchors() { return bucket().anchors; }
  function rows() { return bucket().rows; }
  const GATES = { round: 0, claims: [] };
  /** 锚点建档：只收白名单元数据键。正文（html/text/body）一律拒绝 —— 转交快照。 */
  function anchorAdd(rec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const r = rec && typeof rec === 'object' ? rec : {};
    const id = clean(r.id, 40);
    if (!id) return refuse('no-id');
    if (r.html || r.text || r.body || r.content) return refuse('body-not-allowed');
    if (anchors().filter(function (a) { return a && a.id === id; })[0]) return refuse('dup-id');
    const kind = SNAPSHOT_KINDS.indexOf(clean(r.kind, 20)) >= 0 ? clean(r.kind, 20) : 'note';
    const meta = { id: id, title: clean(r.title, 80), kind: kind,
      pc: Number.isFinite(Number(r.pc)) ? Number(r.pc) : null,
      day: Number.isFinite(Number(r.day)) ? Number(r.day) : null,
      at: clean(r.at, 40), tags: Array.isArray(r.tags) ? r.tags.slice(0, 8).map(function (t) { return clean(t, 20); }).filter(Boolean) : [] };
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const _keptCa = b.anchors.concat([meta]);
      // v2.231.0（OPT-2/OPT-4）：挤出器是**原地截断 + 返回报告**，不是「返回新数组」。
      //   把报告赋回数据槽 ⇒ 下一次进桶被 bucket() 重置为 [] ⇒ 整张表静默清空。
      if (WA.evict && WA.evict.array) WA.evict.array(_keptCa, 'coordinate.anchors');
      b.anchors = _keptCa;
      out = { ok: true, reason: 'ok', id: id, keys: ANCHOR_KEYS.slice() };
      return true;
    }, 'coordinate:anchorAdd');
    if (out && out.ok) stat.anchors++;
    return out || refuse('tx-failed');
  }
  /** 索引导出：只吐白名单键，任何越界键都被丢掉（上游 schema 白名单精神）。 */
  function index() {
    return anchors().map(function (a) {
      const o = {};
      ANCHOR_KEYS.forEach(function (k) { if (a && Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k]; });
      return o;
    });
  }
  function anchorOf(id) {
    const k = clean(id, 40);
    return anchors().filter(function (a) { return a && a.id === k; })[0] || null;
  }
  /** 点域编解码：pc-3 ⇄ 第 3 日；day-7 ⇄ 第 7 日。其余原样回显。 */
  function decode(code) {
    const s = clean(code, 20).toLowerCase();
    let m = /^pc-(\d+)$/.exec(s);
    if (m) { stat.decoded++; return { ok: true, reason: 'ok', space: 'pc', n: parseInt(m[1], 10), label: '第' + m[1] + '日' }; }
    m = /^day-(\d+)$/.exec(s);
    if (m) { stat.decoded++; return { ok: true, reason: 'ok', space: 'day', n: parseInt(m[1], 10), label: '第' + m[1] + '日' };
    }
    return { ok: true, reason: 'passthrough', raw: clean(code, 40), space: null };
  }
  function encode(space, n) {
    const sp = clean(space, 10).toLowerCase();
    const num = Math.floor(Number(n));
    if ((sp !== 'pc' && sp !== 'day') || !Number.isFinite(num) || num < 1) return refuse('bad-point');
    stat.encoded++;
    return { ok: true, reason: 'ok', code: sp + '-' + num };
  }
  /** 台账切片：八字段拼一行（全角竖线分隔）。事由短于 floors 不落账。 */
  function capture(rec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const r = rec && typeof rec === 'object' ? rec : {};
    const subject = clean(r.subject, 120);
    if (!subject) return refuse('no-subject');
    if (subject.replace(/[\s\p{P}\p{S}]/gu, '').length < cfg.captureFloors) return refuse('below-floors');
    const type = LEDGER_EVENT_TYPES.indexOf(clean(r.type, 20)) >= 0 ? clean(r.type, 20) : 'state';
    const tags = Array.isArray(r.tags) ? r.tags : (r.tags ? [r.tags] : []);
    const cells = [subject, LEDGER_TYPE_LABEL[type], clean(r.party, 60), tags.slice(0, 6).map(function (t) { return clean(t, 20); }).filter(Boolean).join('、'),
      clean(r.now, 80), clean(r.due, 40), clean(r.cycle, 40), clean(r.anchor, 40)];
    const line = cells.join(SEP);
    const row = { id: 'cr_' + (WA.rand && WA.rand.id ? WA.rand.id('', 6, 'id') : String(clockNow('coordinate'))), line: line,
      subject: subject, type: type, cells: cells, at: clockNow('coordinate') };
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const _keptCr = b.rows.concat([row]);
      // v2.231.0（OPT-2/OPT-4）：挤出器是**原地截断 + 返回报告**，不是「返回新数组」。
      //   把报告赋回数据槽 ⇒ 下一次进桶被 bucket() 重置为 [] ⇒ 整张表静默清空。
      if (WA.evict && WA.evict.array) WA.evict.array(_keptCr, 'coordinate.rows');
      b.rows = _keptCr;
      out = { ok: true, reason: 'ok', id: row.id, line: line, segments: cells.length };
      return true;
    }, 'coordinate:capture');
    if (out && out.ok) stat.captured++;
    return out || refuse('tx-failed');
  }
  /** 台账反解：少于五段一律 bad-fields（上游八字段规范）。 */
  function parseLine(line) {
    const s = String(line == null ? '' : line).trim();
    if (!s) return refuse('empty-line');
    const segs = s.split(SEP).map(function (x) { return x.trim(); });
    if (segs.length < 5) return refuse('bad-fields');
    const o = {};
    LEDGER_FIELD_SPEC.forEach(function (k, i) { o[k] = segs[i] == null ? '' : segs[i]; });
    o.extra = segs.slice(LEDGER_FIELD_SPEC.length);
    o.segments = segs.length;
    return { ok: true, reason: 'ok', fields: o, subject: o.subject, typeKey: LEDGER_EVENT_TYPES.filter(function (t) { return LEDGER_TYPE_LABEL[t] === o.type; })[0] || null };
  }
  /** 浅浅结桥：只暴露一条固定桥键的轻量面，内部序列化前缀清晰。 */
  function bridgeDump() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!cfg.bridge) return refuse('bridge-off');
    return { ok: true, reason: 'ok', key: BRIDGE_KEY,
      payload: { rows: rows().slice(-24).map(function (r) { return { id: r.id, line: r.line }; }),
        anchors: anchors().slice(-24).map(function (a) { return a.id; }) } };
  }
  function bridgeLoad(payload) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!cfg.bridge) return refuse('bridge-off');
    const p = payload && typeof payload === 'object' ? payload : {};
    const lines = Array.isArray(p.rows) ? p.rows : [];
    let n = 0;
    lines.forEach(function (r) { if (r && r.line && parseLine(r.line).ok) n++; });
    return { ok: true, reason: 'ok', key: BRIDGE_KEY, accepted: n, total: lines.length };
  }
  /** 自动更新闸门：显式工作流可声明「本楼哪些自动模块由我接管」，同一轮内幂等。 */
  function gateClaim(scope, owner, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const sc = clean(scope, 30);
    if (GATE_SCOPES.indexOf(sc) < 0) return refuse('bad-scope');
    const ow = clean(owner, 60) || 'workflow';
    const o = opts || {};
    const round = Number.isFinite(Number(o.round)) ? Number(o.round) : Number(GATES.round || 0);
    const dup = GATES.claims.filter(function (c) { return c.scope === sc && c.round === round; })[0];
    if (dup) return { ok: true, reason: 'already', scope: sc, owner: dup.owner, round: round };
    GATES.claims = GATES.claims.slice(-64).concat([{ scope: sc, owner: ow, round: round, at: clockNow('coordinate') }]);
    stat.gateClaims++;
    return { ok: true, reason: 'ok', scope: sc, owner: ow, round: round };
  }
  function gateSuppressed(scope, opts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: true, reason: 'disabled', suppressed: false };
    const sc = clean(scope, 30);
    if (GATE_SCOPES.indexOf(sc) < 0) { noteFault('bad-scope'); return { ok: false, reason: 'bad-scope', suppressed: false }; }
    const o = opts || {};
    const round = Number.isFinite(Number(o.round)) ? Number(o.round) : Number(GATES.round || 0);
    const hit = GATES.claims.filter(function (c) { return c.scope === sc && (c.round === round || round <= 0); })[0];
    return { ok: true, reason: hit ? 'suppressed' : 'free', suppressed: !!hit, owner: hit ? hit.owner : null };
  }
  function gateRelease(scope, opts) {
    const sc = clean(scope, 30);
    const o = opts || {};
    const before = GATES.claims.length;
    GATES.claims = GATES.claims.filter(function (c) {
      if (c.scope !== sc) return true;
      if (o.owner && c.owner !== clean(o.owner, 60)) return true;
      return false;
    });
    return { ok: true, reason: 'ok', removed: before - GATES.claims.length };
  }
  function gateClear() { const n = GATES.claims.length; GATES.claims = []; GATES.round = 0; return { ok: true, reason: 'ok', cleared: n }; }
  function gateNext(x) {
    const cur = Number(GATES.round || 0);
    GATES.round = (Number.isFinite(Number(x)) && Number(x) > cur) ? Math.floor(Number(x)) : cur + 1;
    return { ok: true, reason: 'ok', round: GATES.round, dropped: GATES.claims.length ? 0 : 0 };
  }
  function view(id) {
    const a = anchorOf(id);
    if (!a) return { ok: false, reason: 'unknown-anchor' };
    const o = {};
    ANCHOR_KEYS.forEach(function (k) { o[k] = a[k]; });
    return { ok: true, reason: 'ok', anchor: o };
  }
  function list() { return rows().map(function (r) { return { id: r && r.id, subject: r && r.subject, line: r && r.line }; }); }
  function lines() { return rows().map(function (r) { return r && r.line; }).filter(Boolean); }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const ls = lines();
    if (!ls.length) return '';
    return ['【坐标台账】'].concat(ls.slice(-16).map(function (l) { return '· ' + l; })).join('\n');
  }
  function reset() {
    stat.anchors = 0; stat.encoded = 0; stat.decoded = 0; stat.captured = 0; stat.gateClaims = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    GATES.round = 0; GATES.claims = [];
    return { ok: true };
  }
  WA.coordinate = {
    getSettings: settings, setSettings: saveSettings, view: view,
    anchorAdd: anchorAdd, anchorOf: anchorOf, index: index,
    decode: decode, encode: encode, capture: capture, parseLine: parseLine,
    bridgeDump: bridgeDump, bridgeLoad: bridgeLoad,
    gateClaim: gateClaim, gateSuppressed: gateSuppressed, gateRelease: gateRelease, gateClear: gateClear, gateNext: gateNext,
    list: list, lines: lines, buildBlock: buildBlock,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    LEDGER_EVENT_TYPES: LEDGER_EVENT_TYPES, LEDGER_TYPE_LABEL: LEDGER_TYPE_LABEL,
    LEDGER_FIELD_SPEC: LEDGER_FIELD_SPEC, LEDGER_FIELD_LABEL: LEDGER_FIELD_LABEL, SEP: SEP,
    ANCHOR_KEYS: ANCHOR_KEYS, SNAPSHOT_KINDS: SNAPSHOT_KINDS,
    BRIDGE_KEY: BRIDGE_KEY, GATE_SCOPES: GATE_SCOPES, CAPTURE_FLOORS: DEF.captureFloors, LEDGER_FIELD_COUNT: LEDGER_FIELD_SPEC.length,
  };
  if (WA.workflow && typeof WA.workflow.register === 'function') {
    WA.workflow.register({
      id: 'coordinate.roundGate', chain: 'after', order: 23, critical: false,
      label: '坐标台账·本轮闸门推轮（接管声明只在本轮有效）',
      async run() {
        try { if (WA.coordinate && typeof WA.coordinate.gateNext === 'function') WA.coordinate.gateNext(); }
        catch (e) { /* 附属面失败不拖主链 */ }
      }
    });
  }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/coordinate.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'coordinate 已加载（2.230.0）');
})();
