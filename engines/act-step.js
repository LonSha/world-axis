/**
 * WorldAxis engines/act-step.js (v2.524.0) — EXV28-02 行动三态与回执
 *
 * ── 它治什么（现场读数）──────────────────────────────────────────────
 *   `engines/act.js` 有四档判定（VERDICTS: 进行中/已完成/失败/中断），
 *   但 `grep -n 'WA.act' engines/backstage.js` **零命中** ——
 *   推演快照里的人物只有 `location / action / intent`（backstage:706），
 *   于是「决定去做」与「做成了」在世界状态里长得一样。
 *
 * ── 本模块只做三件事 ─────────────────────────────────────────────────
 *   record()  把一步行动的「到哪一步 + 凭什么知道」写成回执（落 actors[id].actStep）。
 *   verdict() 只读判定：给定票面判它落在哪一档（不自造第五档）。
 *   buildBlock() 给正文一句「他正在做 X（到哪一步了）」，而不是「他在做 X」。
 *
 * ── 边界 ─────────────────────────────────────────────────────────────
 *   1 不自造档位：执行态四档 + 未定；行动种类（kind）白名单取自 act.VERDICTS。
 *   2 无证据的「已完成」判未定（拒绝模型顺手宣布成功）。
 *   3 只写 actors[id].actStep，不新增顶层键、不改 act 的状态机。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_act_step_settings_v1';
  const DEF = { enabled: true, maxSteps: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'actStep', bounds: { maxSteps: [1, 40] } };
  const FALLBACK = ['进行中', '已完成', '失败', '中断', '未定'];
  const stat = { recorded: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function now() { try { return WA.clock.now('actStep'); } catch (e) { return Date.now(); } }
  function round() { try { return WA.evolution && WA.evolution.roundOf ? WA.evolution.roundOf() : 0; } catch (e) { return 0; } }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 80) : ''; }
  // 现场修正：act.VERDICTS = ['action','refuse','delay','status-quo']，是**行动种类**，
  //   不是「成没成」。本模块判的是执行态，故不读它；只把它当 kind 白名单。
  function verdicts() { return FALLBACK.slice(); }
  function kinds() {
    try {
      if (WA.act && Array.isArray(WA.act.VERDICTS) && WA.act.VERDICTS.length) return WA.act.VERDICTS.slice();
    } catch (e) { /* fallthrough */ }
    return ['action', 'refuse', 'delay', 'status-quo'];
  }
  function findActor(d, id) {
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    if (m[id]) return { key: id, actor: m[id] };
    const ks = Object.keys(m);
    for (let i = 0; i < ks.length; i++) {
      if (m[ks[i]] && m[ks[i]].name === id) return { key: ks[i], actor: m[ks[i]] };
    }
    return null;
  }
  function verdict(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const list = verdicts();
    let v = String(s.verdict || '').trim();
    if (!v) return { ok: false, reason: 'missing-verdict' };
    const hit = list.filter(function (x) { return x === v; })[0];
    if (!hit && v !== '未定') return { ok: false, reason: 'unknown-verdict', allowed: list };
    const evidence = clean(s.evidence, 90);
    if (hit === '已完成' && !evidence) {
      return { ok: true, verdict: '未定', downgraded: true, reason: 'no-evidence' };
    }
    return { ok: true, verdict: hit || v, downgraded: false, allowed: list };
  }
  function record(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.name || '').trim();
    const action = clean(s.action, 90);
    if (!id) { stat.refused++; stat.lastReason = 'missing-id'; return { ok: false, reason: 'missing-id' }; }
    if (!action) { stat.refused++; stat.lastReason = 'missing-action'; return { ok: false, reason: 'missing-action' }; }
    const v = verdict({ verdict: s.verdict || '进行中', evidence: s.evidence });
    if (!v.ok) { stat.refused++; stat.lastReason = v.reason; return v; }
    const kd = String(s.kind || 'action');
    if (kinds().indexOf(kd) < 0) { stat.refused++; stat.lastReason = 'unknown-kind'; return { ok: false, reason: 'unknown-kind', allowed: kinds() }; }
    const row = { action: action, kind: kd, verdict: v.verdict, evidence: clean(s.evidence, 90),
      witness: clean(s.witness, 40) || '无人看见', at: Number.isFinite(s.at) ? Number(s.at) : now(), round: round() };
    let wrote = false;
    try {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) {
          d.actors = d.actors || {};
          const hit = findActor(d, id);
          const key = hit ? hit.key : id;
          const a = d.actors[key] = d.actors[key] || { id: key, conditions: [] };
          a.actStep = a.actStep && typeof a.actStep === 'object' ? a.actStep : {};
          a.actStep.current = row;
          a.actStep.steps = Array.isArray(a.actStep.steps) ? a.actStep.steps : [];
          a.actStep.steps.push(row);
          if (a.actStep.steps.length > cfg.maxSteps) a.actStep.steps.shift();
          return true;
        }, 'actStep:record');
        wrote = true;
      }
    } catch (e) { wrote = false; }
    stat.recorded++;
    return { ok: true, reason: wrote ? 'recorded' : 'recorded-no-store', id: id,
      verdict: row.verdict, downgraded: v.downgraded === true, evidence: row.evidence };
  }
  function view(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const id = String(s.id || s.name || '').trim();
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const hit = findActor(d, id);
    if (!hit) return { ok: false, reason: 'actor-missing' };
    const st = hit.actor.actStep && typeof hit.actor.actStep === 'object' ? hit.actor.actStep : {};
    return { ok: true, id: id, current: st.current || null, steps: Array.isArray(st.steps) ? st.steps.slice(-cfgmax()) : [] };
  }
  function cfgmax() { return settings().maxSteps; }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    let d = {};
    try { d = WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { d = {}; }
    const m = d.actors && typeof d.actors === 'object' ? d.actors : {};
    const lines = [];
    Object.keys(m).forEach(function (k) {
      const a = m[k];
      const st = a && a.actStep && a.actStep.current ? a.actStep.current : null;
      if (!st || !st.action) return;
      if (st.verdict === '已完成' || st.verdict === '中断') return;
      lines.push('- ' + clean(a.name || k, 30) + '：' + st.action + '（' + st.verdict + '）');
      if (lines.length >= 4) return;
    });
    return lines.length ? '[人物行动·到哪一步]\n' + lines.join('\n') : '';
  }
  WA.actStep = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    VERDICTS: FALLBACK.slice(),
    record: record, verdict: verdict, view: view, buildBlock: buildBlock, KINDS: kinds(),
    stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/act-step.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/act-step 已加载（' + VERSION + '）');
})();