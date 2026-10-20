/* modelink.js —— 模型桥·条目桥引擎（WA.modelink）
 *
 * 治什么：正文与状态块之间的搬运桥不再被提示词残渣污染。
 *   - MVU 兼容过滤：识得状态块条目注释与更新块（含反向引用的闭标签），把提示词残渣剥掉；
 *     剥不掉的残留如实报，不吞。
 *   - 角色卡工作流绑定：把「角色卡里的流程声明」与仓内的流程表对上（条目名固定 EW/Flows），
 *     草稿有体量与条数硬顶，超顶挤出最旧。
 *
 * 缝合来源：ST-Evolution-World-Assistant（src/runtime/mvu-compat.ts 的三条正则与
 *   stripMvuPromptArtifacts；src/runtime/char-flows.ts 的 EW/Flows 条目名与 512KB/20 条 LRU 草稿）
 *
 * 与邻座分工：host-wb-trace / wb-inject / wb-search 管世界书读写；interop / bridge 管跨模块桥；
 *   modelink 只管「状态块这块砖怎么剥干净、角色卡流程声明怎么对上号」。
 *
 * 边界（否定式）：
 *   1. 剥离只认三条白名单正则，其余残渣原样留着（剥不掉就如实报）。
 *   2. 剥后为空一律回退原串（防把正文剥没）。
 *   3. 流程绑定只做「名对名 + 参数白名单」，不执行流程图。
 *   4. 草稿按条数与体量双顶挤出最旧，挤出计数如实累计。
 *   5. 不改写世界书，写入由调用方决定。
 *   6. 不做 MVU 变量的求值，只做文本级剥离。
 *   7. 不猜条目名变体（EW/Flows 写法固定，变体按 miss 报）。
 *   8. 不进正文注入块（本引擎无 buildBlock）。
 *   9. 不代替 compat/mvu.js 的运行时职责，只做文本侧。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_modelink_settings_v1';
  const DEF = { enabled: false, maxDrafts: 20, maxDraftKB: 512, strip: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'modelink',
    bounds: { maxDrafts: [2, 80], maxDraftKB: [16, 4096] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const MVU_ENTRY_COMMENT_RE = /^\s*\[?(?:mvu|MVU|变量)(?:[-_:：\s][^\]]*)?\]?\s*$/;
  const MVU_UPDATE_BLOCK_RE = /<UpdateVariable>([\s\S]*?)<\/UpdateVariable>/g;
  const MVU_ARTIFACT_RES = [
    { name: 'mvu-update', re: /<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g },
    { name: 'mvu-status', re: /<StatusPlaceHolderImpl\s*\/>/g },
    { name: 'mvu-analysis', re: /<Analysis>[\s\S]*?<\/Analysis>/gi },
    { name: 'mvu-delta', re: /<JSONPatch>[\s\S]*?<\/JSONPatch>/gi }
  ];
  const FLOWS_ENTRY_NAME = 'EW/Flows';
  const FLOW_PARAM_WHITELIST = ['id', 'when', 'do', 'need', 'after', 'note', 'priority'];
  const FLOW_STATES = ['draft', 'saved', 'applied'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { stripped: 0, residues: 0, drafts: 0, applied: 0, evicted: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 200) : String(v == null ? '' : v).slice(0, max || 200); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(draft) {
    const r = draft || state();
    if (!r.modelink || typeof r.modelink !== 'object' || Array.isArray(r.modelink)) r.modelink = { drafts: [] };
    if (!Array.isArray(r.modelink.drafts)) r.modelink.drafts = [];
    return r.modelink;
  }
  function drafts() { return bucket().drafts; }
  /** 条目注释判定：这条世界书条目是不是状态块条目。 */
  function isMvuComment(comment) { return MVU_ENTRY_COMMENT_RE.test(String(comment == null ? '' : comment)); }
  /** 更新块提取：反向引用闭标签（防 <UpdateVariable> 与其它块串味）。 */
  function updateBlocks(text) {
    const raw = String(text == null ? '' : text);
    const out = [];
    MVU_UPDATE_BLOCK_RE.lastIndex = 0;
    let m = null;
    while ((m = MVU_UPDATE_BLOCK_RE.exec(raw)) !== null) out.push(m[1]);
    MVU_UPDATE_BLOCK_RE.lastIndex = 0;
    return { ok: out.length > 0, reason: out.length ? 'ok' : 'no-block', count: out.length, blocks: out };
  }
  /** 残渣剥离：剥不掉就如实报。剥后为空回退原串。 */
  function stripArtifacts(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!cfg.strip) return refuse('strip-off');
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) return refuse('empty-text');
    const o = opts || {};
    const only = Array.isArray(o.only) ? o.only : null;
    let out = raw;
    const hits = [];
    MVU_ARTIFACT_RES.forEach(function (p) {
      if (only && only.indexOf(p.name) < 0) return;
      const m = out.match(p.re);
      if (m && m.length) { hits.push({ name: p.name, count: m.length }); out = out.replace(p.re, '\n'); }
    });
    if (!out.trim()) { noteFault('strip-empty'); return { ok: false, reason: 'strip-empty', keptOriginal: true, text: raw }; }
    stat.stripped += hits.reduce(function (n, h) { return n + h.count; }, 0);
    return { ok: true, reason: 'ok', hits: hits, removed: hits.reduce(function (n, h) { return n + h.count; }, 0),
      text: out.replace(/\n{3,}/g, '\n\n').trim() };
  }
  function residue(text) {
    const s = String(text == null ? '' : text);
    const hits = MVU_ARTIFACT_RES.filter(function (p) { return p.re.test(s); }).map(function (p) { return p.name; });
    MVU_ARTIFACT_RES.forEach(function (p) { p.re.lastIndex = 0; });
    if (hits.length) stat.residues++;
    return { ok: true, reason: hits.length ? 'dirty' : 'ok', dirty: hits.length > 0, hits: hits };
  }
  /** 条目名绑定：EW/Flows 写法固定，变体按 miss 报（不猜）。 */
  function matchEntry(name, list) {
    const want = clean(name, 60) || FLOWS_ENTRY_NAME;
    const arr = Array.isArray(list) ? list : [];
    const hit = arr.filter(function (e) {
      const c = typeof e === 'string' ? e : (e && (e.comment || e.name)) || '';
      return String(c).trim() === want;
    })[0];
    if (!hit) { noteFault('entry-miss'); return { ok: false, reason: 'entry-miss', want: want, tried: arr.length }; }
    return { ok: true, reason: 'ok', name: want, entry: hit };
  }
  /** 流程声明解析：只收参数白名单，其余键如实报 extra（不静默吞）。 */
  function parseFlow(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const out = {}, extra = [];
    FLOW_PARAM_WHITELIST.forEach(function (k) { if (s[k] != null) out[k] = clean(s[k], 160); });
    Object.keys(s).forEach(function (k) { if (FLOW_PARAM_WHITELIST.indexOf(k) < 0) extra.push(k); });
    if (!out.id && !out.do) { noteFault('flow-incomplete'); return { ok: false, reason: 'flow-incomplete', need: ['id', 'do'] }; }
    return { ok: true, reason: extra.length ? 'extra-keys' : 'ok', flow: out, extra: extra, state: 'draft' };
  }
  /** 草稿入账：条数与体量双顶挤出最旧。 */
  function draftAdd(spec, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const p = parseFlow(spec);
    if (!p.ok) return p;
    const o = opts || {};
    const row = { id: p.flow.id || ('fl_' + (WA.rand && WA.rand.id ? WA.rand.id('', 6, 'id') : String(clockNow('modelink')))),
      flow: p.flow, kb: Math.max(1, Math.ceil(JSON.stringify(p.flow).length / 1024)), state: 'draft', at: clockNow('modelink') };
    let out = null, evicted = 0;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      let list = b.drafts.filter(function (d) { return d && d.id !== row.id; });
      list = list.concat([row]);
      const byCount = list.length > cfg.maxDrafts ? (evicted += list.length - cfg.maxDrafts, list.slice(list.length - cfg.maxDrafts)) : list;
      let total = byCount.reduce(function (n, d) { return n + (Number(d && d.kb) || 0); }, 0);
      while (total > cfg.maxDraftKB && byCount.length > 1) { total -= Number(byCount[0].kb) || 0; byCount.shift(); evicted++; }
      b.drafts = WA.evict && WA.evict.array ? WA.evict.array(byCount, 'modelink.drafts') : byCount;
      out = { ok: true, reason: 'ok', id: row.id, state: row.state, drafts: b.drafts.length };
      return true;
    }, 'modelink:draftAdd');
    if (out && out.ok) { stat.drafts++; if (evicted) stat.evicted += evicted; }
    return out || refuse('tx-failed');
  }
  /** 应用草稿：置为 applied（只改状态，不执行流程）。 */
  function draftApply(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const k = clean(id, 40);
    if (!k) return refuse('no-id');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const d0 = b.drafts.filter(function (d) { return d && d.id === k; })[0];
      if (!d0) { out = { ok: false, reason: 'unknown-draft' }; return false; }
      d0.state = 'applied';
      d0.appliedAt = clockNow('modelink');
      out = { ok: true, reason: 'ok', id: k, state: d0.state };
      return true;
    }, 'modelink:draftApply');
    if (out && out.ok) stat.applied++;
    else if (out && !out.ok) { stat.refused++; noteFault(out.reason); }
    return out || refuse('tx-failed');
  }
  function draftList(opts) {
    const o = opts || {};
    const st = clean(o.state, 20);
    const list = (st && FLOW_STATES.indexOf(st) >= 0) ? drafts().filter(function (d) { return d && d.state === st; }) : drafts();
    return { ok: true, reason: 'ok', count: list.length,
      totalKB: drafts().reduce(function (n, d) { return n + (Number(d && d.kb) || 0); }, 0),
      drafts: list.slice(-16).map(function (d) { return { id: d.id, state: d.state, do: d.flow && d.flow.do, kb: d.kb }; }) };
  }
  function draftClear() {
    let n = 0;
    WA.store.transact(function (draft) { const b = bucket(draft); n = b.drafts.length; b.drafts = []; return true; }, 'modelink:draftClear');
    return { ok: true, reason: 'ok', cleared: n };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, strip: cfg.strip, maxDrafts: cfg.maxDrafts, maxDraftKB: cfg.maxDraftKB,
      entryName: FLOWS_ENTRY_NAME, artifacts: MVU_ARTIFACT_RES.map(function (p) { return p.name; }),
      params: FLOW_PARAM_WHITELIST.slice(), flowStates: FLOW_STATES.slice(), drafts: drafts().length };
  }
  function reset() {
    stat.stripped = 0; stat.residues = 0; stat.drafts = 0; stat.applied = 0; stat.evicted = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  WA.modelink = {
    getSettings: settings, setSettings: saveSettings, view: view,
    isMvuComment: isMvuComment, updateBlocks: updateBlocks, stripArtifacts: stripArtifacts, residue: residue,
    matchEntry: matchEntry, parseFlow: parseFlow, draftAdd: draftAdd, draftApply: draftApply, draftList: draftList, draftClear: draftClear,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    MVU_ENTRY_COMMENT_RE: MVU_ENTRY_COMMENT_RE, MVU_UPDATE_BLOCK_RE: MVU_UPDATE_BLOCK_RE,
    ARTIFACTS: MVU_ARTIFACT_RES.map(function (p) { return p.name; }),
    FLOWS_ENTRY_NAME: FLOWS_ENTRY_NAME, FLOW_PARAM_WHITELIST: FLOW_PARAM_WHITELIST, FLOW_STATES: FLOW_STATES,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/modelink.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'modelink 已加载（2.230.0）');
})();
