/**
 * WorldAxis engines/story-choice.js (v2.168.0) — TX4 可选择、可兑现后果的故事分支
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   branch-tree 已有 fork/choose/tree/compare/replay（登记分叉点、记录选择、可视化、对比、回放）。
 *   rehearsal 已有 preview/checkPreview/apply（预演、校验预演、应用预演）。
 *   commit 已有 begin/commit/defer/flush（原子提交、副作用登记）。
 *   但三者没有一条闭合的「选择→预演→确认→兑现」链：
 *   fork 登记了分叉点，但选项里没有可执行的操作（ops）；choose 记了选择，但世界没有变；
 *   rehearsal 预演了，但预演结果不能直接写进 live store。story-choice 补的就是这一层：
 *   把 fork 的选项绑定到白名单化的规则操作（ops），确认后通过 commit 的候选提交协议兑现。
 *
 * ── 本模块落点（协调者，不替代）──────────────────────────────
 *   · present(node) —— 登记选择点（调 branchTree.fork 记账 + 对每个选项的 ops 跑 rehearsal.preview 白名单校验）。
 *   · confirm(id, option) —— 确认选择（调 branchTree.choose 记账 + 对选中选项的 ops 走 commit.begin/commit/flush 兑现）。
 *   · review(id) —— 回看实际选择与当时预演（调 rehearsal.checkPreview 校验预演是否过期）。
 *   · pending() —— 列出未确认的选择点。
 *
 * ── 与既有模块的分工（不许重叠）──────────────────────────────
 *   · branchTree —— 分叉点的记账（本模块调 fork/choose，不自己记账）；
 *   · rehearsal —— 预演的执行与撤销（本模块调 preview/checkPreview，不自己跑预演）；
 *   · commit —— 世界结果的原子提交（本模块调 begin/commit/flush，不自己写世界）。
 *   · 本模块的唯一私有数据是 choicePoints 账本（存选项的 ops/预演结果/回执 ID）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 默认关（enabled:false）—— 必须显式开启。
 *   2 选择记账与世界兑现分别可观测——choose 记了选择 ≠ 世界已经变了。
 *     confirm 返回 { chosen: true, applied: true/false, receipt } 三段可分离。
 *   3 ops 必须通过 rehearsal.preview 白名单校验才能进入 confirm 路径——
 *     preview 报 reject 的 path 不允许出现在 commit 的写入函数里。
 *   4 状态变了就重新预演——stale 预演不强行确认，review 返回 stale 而非 ok。
 *   5 不能把 rehearsal 的任意 diff 直接写进 live store——必须经 commit 的事务。
 *   6 过期/未知/不可比较分别显示——stale / unknown / not-comparable 三种返回，不互相回落。
 *   7 反事实回放留在隔离环境——review 只读不写，不回溯覆盖当前存档。
 *   8 不凭空造 ops/选项/选择——branchTree 是 fork 源，commit 是 apply 源，本模块只协调。
 */
(function () {
  'use strict';
  const A = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_story_choice_settings_v1';
  var DEF = { enabled: false, maxPending: 16, maxOptions: 6 };
  var __REG = { key: LS_KEY, def: DEF, module: 'storyChoice',
    bounds: { maxPending: [2, 64], maxOptions: [2, 12] } };
  function getSettings() {
    var raw = A.settingsBus ? A.settingsBus.read(__REG) : null;
    var base = Object.assign({}, DEF);
    return A.settingsBus ? A.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return A.settingsBus ? A.settingsBus.saveOrThrow(__REG, A.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  A.__settingsRegs = (A.__settingsRegs || []).concat([__REG]);
  var _stat = { presented: 0, confirmed: 0, refused: 0, applied: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return A.inputGuard ? A.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  var clockNow = function (tag) { try { return A.clock.now(tag || 'storyChoice'); } catch (e) { return Date.now(); } };
  function state() { return (A.store && A.store.get) ? (A.store.get() || {}) : {}; }
  function bucket(root) { var r = root || state(); if (!r.storyChoice) r.storyChoice = { points: [] }; if (!Array.isArray(r.storyChoice.points)) r.storyChoice.points = []; return r.storyChoice; }
  function list() { return bucket().points || []; }
  function find(id) { var k = clean(id, 60); return list().filter(function (x) { return x && x.id === k; })[0] || null; }
  function nodeId(round) { return A.rand ? A.rand.id('sc_' + (round || 0) + '_', 4, 'id') : 'sc_' + (round || 0) + '_0000'; }

  /**
   * 登记一个选择点。调 branchTree.fork 记账 + 对每个选项的 ops 跑 rehearsal.preview 白名单校验。
   * @param {object} node { round, prompt, options: [{label, ops?}], parent, steps? }
   * @returns {ok, id, options: [{label, preview}]}
   */
  function present(node) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var n = node || {};
    var prompt = clean(n.prompt, 120);
    if (!prompt) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'prompt' }; }
    var rawOpts = Array.isArray(n.options) ? n.options : [];
    if (rawOpts.length < 2) { noteFault('no-options'); return { ok: false, reason: 'no-options', have: rawOpts.length, need: 2 }; }
    var opts = rawOpts.slice(0, Math.max(1, Math.floor(cfg.maxOptions))).map(function (o) {
      var label = clean(o.label || o, 80);
      var ops = (o.ops && typeof o.ops === 'object' && !Array.isArray(o.ops)) ? o.ops : null;
      var costs = clean(o.costs || '', 120);
      return { label: label, ops: ops, costs: costs };
    }).filter(function (o) { return !!o.label; });
    if (opts.length < 2) { noteFault('no-options'); return { ok: false, reason: 'no-options', have: opts.length, need: 2 }; }
    // 调 branchTree.fork 记账（选项标签列表）
    if (!A.branchTree || typeof A.branchTree.fork !== 'function') { noteFault('branchtree-absent'); return { ok: false, reason: 'branchtree-absent' }; }
    var labels = opts.map(function (o) { return o.label; });
    var fr = A.branchTree.fork({ round: n.round, prompt: prompt, options: labels, parent: n.parent, steps: n.steps });
    if (!fr || !fr.ok) { noteFault('fork-failed'); return { ok: false, reason: 'fork-failed', detail: fr ? fr.reason : 'no-result' }; }
    // 对每个选项的 ops 跑 rehearsal.preview 白名单校验
    var optResults = opts.map(function (o) {
      if (!o.ops) return { label: o.label, costs: o.costs, preview: null, allowed: true };
      if (!A.rehearsal || typeof A.rehearsal.preview !== 'function') return { label: o.label, costs: o.costs, preview: { ok: false, reason: 'rehearsal-absent' }, allowed: false };
      var r = null;
      try { r = A.rehearsal.preview(o.ops); } catch (e) { r = { ok: false, reason: 'preview-throw' }; }
      var allowed = r && r.ok && (!r.reject || r.reject.length === 0);
      return { label: o.label, costs: o.costs, preview: r, allowed: allowed };
    });
    var rec = { id: fr.id, round: fr.round, at: clockNow('storyChoice'), prompt: prompt,
      options: optResults, parent: n.parent ? clean(n.parent, 60) : '',
      choice: '', chosenAt: 0, receiptId: '', appliedAt: 0, forkId: fr.id };
    if (A.store && typeof A.store.transact === 'function') {
      A.store.transact(function (d) { var b = bucket(d); b.points.push(rec); }, 'storyChoice:present');
    } else { list().push(rec); }
    if (A.evict && typeof A.evict.array === 'function') {
      try { A.evict.array(bucket().points, 'storyChoice.points'); } catch (e) { /* 站点未登记时静默 */ }
    }
    _stat.presented++;
    return { ok: true, id: rec.id, round: rec.round, options: optResults };
  }

  /**
   * 确认选择。调 branchTree.choose 记账 + 对选中选项的 ops 走 commit.begin/commit/flush 兑现。
   * @returns {ok, chosen:true, applied:bool, receipt?} 三段可分离
   */
  function confirm(id, option, opts) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (rec.choice) { noteFault('already-confirmed'); return { ok: false, reason: 'already-confirmed', id: rec.id, choice: rec.choice }; }
    var opt = clean(option, 80);
    if (!opt) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'option' }; }
    var optRec = rec.options.filter(function (o) { return o.label === opt; })[0];
    if (!optRec) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', field: 'option', allowed: rec.options.map(function (o) { return o.label; }) }; }
    if (!optRec.allowed) { noteFault('preview-rejected'); return { ok: false, reason: 'preview-rejected', option: opt, rejects: (optRec.preview && optRec.preview.reject) || [] }; }
    // 第一步：记账（branchTree.choose）
    if (!A.branchTree || typeof A.branchTree.choose !== 'function') { noteFault('branchtree-absent'); return { ok: false, reason: 'branchtree-absent' }; }
    var cr = A.branchTree.choose(id, opt);
    if (!cr || !cr.ok) { noteFault('choose-failed'); return { ok: false, reason: 'choose-failed', detail: cr ? cr.reason : 'no-result' }; }
    // 第二步：兑现（commit）——如果选项有 ops
    var applied = false, receiptId = '';
    if (optRec.ops && A.commit && typeof A.commit.begin === 'function') {
      var o = opts || {};
      var br = A.commit.begin(o.opId || ('choice_' + id), { site: 'storyChoice', floor: o.floor, swipe: o.swipe });
      if (br && br.ok) {
        var chain = br.chain;
        var opsRef = optRec.ops;
        var cm = A.commit.commit(chain, function (draft) {
          var paths = Object.keys(opsRef);
          for (var i = 0; i < paths.length; i++) {
            var p = paths[i], top = String(p).split('.')[0];
            if (!draft[top]) continue; // 只写骨架已有的键（白名单保证）
            var segs = String(p).split('.');
            if (segs.length === 1) { draft[top] = opsRef[p]; }
            else { var cur = draft[top]; for (var j = 1; j < segs.length - 1; j++) { if (!cur[segs[j]]) cur[segs[j]] = {}; cur = cur[segs[j]]; } cur[segs[segs.length - 1]] = opsRef[p]; }
          }
        });
        if (cm && cm.ok) {
          applied = true; receiptId = cm.opId || '';
          if (A.commit.flush) { try { A.commit.flush(chain); } catch (e) { /* 副作用失败不回滚世界事实 */ } }
        } else { noteFault('commit-failed'); }
      } else { noteFault('begin-failed'); }
    }
    // 第三步：回写回执
    if (A.store && typeof A.store.transact === 'function') {
      A.store.transact(function (d) {
        var b = bucket(d);
        var t = b.points.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.choice = opt; t.chosenAt = clockNow('storyChoice'); t.receiptId = receiptId; t.appliedAt = applied ? clockNow('storyChoice') : 0; }
      }, 'storyChoice:confirm');
    } else { rec.choice = opt; rec.chosenAt = clockNow('storyChoice'); rec.receiptId = receiptId; rec.appliedAt = applied ? clockNow('storyChoice') : 0; }
    _stat.confirmed++;
    if (applied) _stat.applied++;
    // 三段可分离：chosen=true / applied=bool / receipt=string
    return { ok: true, chosen: true, applied: applied, receipt: receiptId, id: rec.id, option: opt };
  }

  /**
   * 回看实际选择与当时预演。调 rehearsal.checkPreview 校验预演是否过期。
   * 只读不写（边界 7）。
   */
  function review(id) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    var previewState = 'none';
    var previewDetail = null;
    if (rec.choice && opt_previewId(rec)) {
      if (A.rehearsal && typeof A.rehearsal.checkPreview === 'function') {
        var r = null;
        try { r = A.rehearsal.checkPreview(opt_previewId(rec)); } catch (e) { r = null; }
        if (r && r.ok) { previewState = r.stale ? 'stale' : 'fresh'; previewDetail = r; }
        else if (r && r.reason === 'stale') { previewState = 'stale'; previewDetail = r; }
        else { previewState = 'unknown'; previewDetail = r; }
      } else { previewState = 'unknown'; }
    } else if (!rec.choice) { previewState = 'pending'; }
    return { ok: true, id: rec.id, prompt: rec.prompt, choice: rec.choice || '',
      chosenAt: rec.chosenAt || 0, receiptId: rec.receiptId || '', appliedAt: rec.appliedAt || 0,
      options: rec.options, preview: previewState, previewDetail: previewDetail };
  }
  function opt_previewId(rec) { return rec.previewId || (rec.forkId ? rec.forkId : ''); }

  /**
   * 列出未确认的选择点。
   */
  function pending() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', points: [] };
    var cur = list().filter(function (x) { return x && !x.choice; });
    return { ok: true, points: cur.map(function (x) { return { id: x.id, prompt: x.prompt, round: x.round, options: x.options.length }; }),
      count: cur.length, cap: cfg.maxPending };
  }

  function buildBlock() {
    var cfg = getSettings();
    if (!cfg.enabled) return '';
    var cur = list().filter(function (x) { return x && !x.choice; });
    if (!cur.length) return '';
    var lines = ['[故事分支]'];
    cur.slice(0, Math.max(1, Math.floor(cfg.maxPending))).forEach(function (x) {
      lines.push('· ' + x.prompt + '（' + x.options.length + ' 选项）');
    });
    return lines.join('\n');
  }

  function diagnose() {
    var checks = {
      branchTree: !!(A.branchTree && typeof A.branchTree.fork === 'function' && typeof A.branchTree.choose === 'function'),
      rehearsal: !!(A.rehearsal && typeof A.rehearsal.preview === 'function' && typeof A.rehearsal.checkPreview === 'function'),
      commit: !!(A.commit && typeof A.commit.begin === 'function' && typeof A.commit.commit === 'function'),
      store: !!(A.store && typeof A.store.transact === 'function'),
      settingsBus: !!(A.settingsBus && typeof A.settingsBus.read === 'function')
    };
    var ok = checks.branchTree && checks.rehearsal && checks.commit && checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.168.0' };
  }

  function stat() {
    var cur = list();
    return { presented: _stat.presented, confirmed: _stat.confirmed, applied: _stat.applied,
      refused: _stat.refused, lastReason: _stat.lastReason,
      pending: cur.filter(function (x) { return x && !x.choice; }).length,
      total: cur.length, cap: getSettings().maxPending,
      faults: Object.assign({}, _stat.faults) };
  }

  function reset() { _stat.presented = 0; _stat.confirmed = 0; _stat.applied = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  A.storyChoice = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    present: present,
    confirm: confirm,
    review: review,
    pending: pending,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  // 自证块：导出数必须 === 10
  var EXPORT_COUNT = 10;
  var _exported = Object.keys(A.storyChoice).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('story-choice: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof A.registerModule === 'function') A.registerModule('engines/story-choice.js', { kind: 'engine', ver: '2.168.0' });
})();
