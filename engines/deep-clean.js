/**
 * WorldAxis engines/deep-clean.js (v2.230.0) — 深度清理生命周期
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `purify-scope` 管「哪些范围不进净化」（范围保护），`rewriter` 管「把命中
 *   正则的片段改写掉」——**两者都不管「谁来扫、扫到什么、改完谁复核」这条链**。
 *   现场实测：`深度清理` / `deepClean` / `冻结资源` / `freezeResources` 在
 *   engines|core|actors|direction|render|ui **零命中**（compare.js 头注里那句
 *   「深度清理：按规则集剥掉提示词残渣」只是对 `strip` 的一句描述，没有生命周期）。
 *   后果：清理是**一次性动作**：清完没有凭据回答「清了几条、谁复核过、能不能撤」。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 Veridis-Rewrite 的深度清理生命周期（src/aiRewrite/apply.js 与
 *   rewrite-plan 的冻结→扫描→处理→复核→应用五阶段）：
 *     · **冻结**先于扫描：待清理目标一旦冻结，其内容指纹入账（改过即失效，不拿
 *       改后的内容当清理依据）；
 *     · **扫描**只列候选与命中规则，**不改任何东西**；
 *     · **处理**把候选变成「建议删除的区间」（区间必须落在冻结文本内）；
 *     · **复核**是独立一步：未复核一律不许应用（`unreviewed`）；
 *     · **应用**才落笔，且落笔后**回读**核验（读不回即报 `readback-failed`）。
 *   本模块只取其中**可判定的那一层**（五阶段状态机 + 冻结指纹 + 区间合法性）；
 *   AI 改写与 UI 不进本模块（那是 rewrite-plan 与宿主的事）。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · purify-scope —— 「哪些范围受保护」，本模块不动保护范围；
 *   · rewriter —— 「命中即改写」，本模块只出**区间建议**，不自己改字；
 *   · 本模块 —— **五阶段生命周期 + 冻结指纹 + 区间复核与回读**（零 AI 调用）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时冻结 / 扫描 / 处理 / 复核 / 应用一律 `disabled`。
 *   ② **冻结先于扫描**：未冻结即扫描 ⇒ `not-frozen`（不拿现文当依据）。
 *   ③ **冻结后改文即失效**：指纹不符 ⇒ `frozen-stale`（冻结的意义就是拒绝漂移）。
 *   ④ **扫描零改**：`scan` 恒 `writes:0`（扫描只列候选）。
 *   ⑤ **区间须落在冻结文本内**：越界 ⇒ `span-out-of-range`（不猜截断位置）。
 *   ⑥ **未复核不许应用**：`apply` 前必须 `review` 通过 ⇒ 否则 `unreviewed`。
 *   ⑦ **应用后回读**：读回与预期不符 ⇒ `readback-failed`，且**如实报**不吞。
 *   ⑧ 有硬上限：候选 / 区间条数由 settings 定，超限拒收并具名 `too-many-spans`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_deep_clean_settings_v1';
  const DEF = { enabled: false, maxSpans: 64, maxCandidates: 200, maxTextChars: 200000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'deepClean',
    bounds: { maxSpans: [1, 512], maxCandidates: [1, 2000], maxTextChars: [1000, 2000000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const STAGES = ['idle', 'frozen', 'scanned', 'prepared', 'reviewed', 'applied'];
  const STAGE_LABEL = { idle: '未开始', frozen: '已冻结', scanned: '已扫描', prepared: '已处理', reviewed: '已复核', applied: '已应用' };
  const RULES = ['xml-tag', 'code-fence', 'think-block', 'system-residue', 'meta-line', 'template-brace'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { frozen: 0, scanned: 0, prepared: 0, reviewed: 0, applied: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }

  const JOB = { stage: 'idle', digest: '', text: '', candidates: [], spans: [], verdict: '', appliedText: '', fails: 0 };

  function digest(s) {
    const t = String(s == null ? '' : s);
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16) + ':' + t.length;
  }
  /** ① 冻结：内容指纹入账（改过即失效）。 */
  function freeze(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const t = String(text == null ? '' : text);
    if (!t) return refuse('empty-text');
    if (t.length > cfg.maxTextChars) return refuse('too-long');
    JOB.stage = 'frozen'; JOB.digest = digest(t); JOB.text = t;
    JOB.candidates = []; JOB.spans = []; JOB.verdict = ''; JOB.appliedText = ''; JOB.fails = 0;
    stat.frozen++;
    return { ok: true, reason: 'ok', stage: JOB.stage, stageLabel: STAGE_LABEL[JOB.stage], digest: JOB.digest, chars: t.length };
  }
  function assertFrozen(text) {
    if (JOB.stage === 'idle') return 'not-frozen';
    const t = String(text == null ? '' : text);
    if (digest(t) !== JOB.digest) return 'frozen-stale';
    return '';
  }
  /** ② 扫描：只列候选与命中规则，零改。 */
  function scan(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const miss = assertFrozen(text === undefined ? JOB.text : text);
    if (miss) return refuse(miss);
    const o = opts || {};
    const only = Array.isArray(o.rules) && o.rules.length ? o.rules : RULES;
    const bad = only.filter(function (r) { return RULES.indexOf(r) < 0; });
    if (bad.length) return refuse('bad-rule');
    const src = JOB.text;
    const found = [];
    const P = {
      'xml-tag': /<\/?[a-zA-Z][\w:-]*\b[^>]*>/g,
      'code-fence': /```[\s\S]*?```|~~~[\s\S]*?~~~/g,
      'think-block': /<(think|thinking|electric)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      'system-residue': /^\s*(?:\[(?:system|inst|ooc)\]|【\s*(?:系统|说明|指令)\s*】)[^\n]*$/gm,
      'meta-line': /^\s*(?:（\s*(?:注|旁白|作者说)\s*[:：][^\n]*）|\(\s*(?:note|ooc)\s*[:：][^\n]*\))\s*$/gmi,
      'template-brace': /\{\{[^{}]{0,120}\}\}/g,
    };
    only.forEach(function (rule) {
      const re = P[rule];
      if (!re) return;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        found.push({ rule: rule, from: m.index, to: m.index + m[0].length, sample: clean(m[0], 60) });
        if (found.length > cfg.maxCandidates) break;
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    });
    if (found.length > cfg.maxCandidates) return refuse('too-many-candidates');
    found.sort(function (a, b) { return a.from - b.from || a.to - b.to; });
    JOB.candidates = found;
    JOB.stage = 'scanned';
    stat.scanned++;
    return { ok: true, reason: 'ok', stage: JOB.stage, stageLabel: STAGE_LABEL[JOB.stage],
      candidates: found.length, byRule: found.reduce(function (acc, x) { acc[x.rule] = (acc[x.rule] || 0) + 1; return acc; }, {}),
      writes: 0 };
  }
  /** ③ 处理：把候选变成建议删除区间（区间须落在冻结文本内）。 */
  function prepare(spans, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (JOB.stage !== 'scanned' && JOB.stage !== 'prepared') return refuse('not-scanned');
    const list = Array.isArray(spans) && spans.length ? spans : JOB.candidates.map(function (c) { return { from: c.from, to: c.to, rule: c.rule }; });
    if (list.length > cfg.maxSpans) return refuse('too-many-spans');
    const L = JOB.text.length; const ok = []; const bad = [];
    list.forEach(function (s) {
      const from = Math.floor(Number(s && s.from)); const to = Math.floor(Number(s && s.to));
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > L) { bad.push({ from: s && s.from, to: s && s.to }); return; }
      ok.push({ from: from, to: to, rule: clean(s.rule, 30) || 'custom' });
    });
    if (!ok.length) return refuse('span-out-of-range');
    ok.sort(function (a, b) { return a.from - b.from || a.to - b.to; });
    // 相邻/重叠区间合并（合并后仍必须是原文里的连续区间，不许跨缝拼接）
    const merged = [];
    ok.forEach(function (s) {
      const last = merged[merged.length - 1];
      if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
      else merged.push({ from: s.from, to: s.to, rule: s.rule });
    });
    JOB.spans = merged;
    JOB.stage = 'prepared';
    stat.prepared++;
    return { ok: true, reason: 'ok', stage: JOB.stage, stageLabel: STAGE_LABEL[JOB.stage],
      spans: merged.length, mergedFrom: ok.length, rejected: bad.length, rejectedSpans: bad };
  }
  /** ④ 复核：独立一步，未过不许应用。 */
  function review(verdict, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (JOB.stage !== 'prepared' && JOB.stage !== 'reviewed') return refuse('not-prepared');
    const v = clean(verdict, 20) || ((opts && opts.accept !== false) ? 'accept' : 'reject');
    if (v !== 'accept' && v !== 'reject') return refuse('bad-verdict');
    JOB.verdict = v;
    JOB.stage = 'reviewed';
    stat.reviewed++;
    return { ok: true, reason: 'ok', stage: JOB.stage, stageLabel: STAGE_LABEL[JOB.stage], verdict: v, spans: JOB.spans.length };
  }
  /** ⑤ 应用：落笔 + 回读核验。 */
  function apply(opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (JOB.stage !== 'reviewed') return refuse('unreviewed');
    if (JOB.verdict !== 'accept') return refuse('rejected');
    const keep = [];
    let cursor = 0;
    JOB.spans.forEach(function (s) { keep.push(JOB.text.slice(cursor, s.from)); cursor = s.to; });
    keep.push(JOB.text.slice(cursor));
    const next = keep.join('');
    const o = opts || {};
    const reader = typeof o.readback === 'function' ? o.readback : null;
    const expect = digest(next);
    const got = reader ? digest(String(reader(next) == null ? '' : reader(next))) : expect;
    if (reader && got !== expect) {
      JOB.fails++;
      return refuse('readback-failed');
    }
    JOB.appliedText = next;
    JOB.stage = 'applied';
    stat.applied++;
    return { ok: true, reason: 'ok', stage: JOB.stage, stageLabel: STAGE_LABEL[JOB.stage],
      removed: JOB.text.length - next.length, spansApplied: JOB.spans.length,
      digestBefore: JOB.digest, digestAfter: expect, readback: reader ? 'ok' : 'skipped' };
  }
  function status() {
    return { ok: true, stage: JOB.stage, stageLabel: STAGE_LABEL[JOB.stage], digest: JOB.digest,
      candidates: JOB.candidates.length, spans: JOB.spans.length, verdict: JOB.verdict,
      passes: STAGES.slice(), failed: JOB.fails };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxSpans: cfg.maxSpans, maxCandidates: cfg.maxCandidates, maxTextChars: cfg.maxTextChars,
      stages: STAGES.slice(), stageLabel: STAGE_LABEL, rules: RULES.slice() };
  }
  function reset() {
    JOB.stage = 'idle'; JOB.digest = ''; JOB.text = ''; JOB.candidates = []; JOB.spans = []; JOB.verdict = ''; JOB.appliedText = ''; JOB.fails = 0;
    return { ok: true, reason: 'ok', stage: JOB.stage };
  }
  function resetStat() {
    stat.frozen = 0; stat.scanned = 0; stat.prepared = 0; stat.reviewed = 0; stat.applied = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.deepClean = {
    getSettings: settings, setSettings: saveSettings, view: view, status: status,
    freeze: freeze, scan: scan, prepare: prepare, review: review, apply: apply,
    digest: digest, reset: reset,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    STAGES: STAGES, STAGE_LABEL: STAGE_LABEL, RULES: RULES,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/deep-clean.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'deepClean 已加载（2.230.0）');
})();