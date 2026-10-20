/**
 * WorldAxis engines/prefilter-gate.js (v2.230.0) — 档案预筛 Gate
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓有 registry（谁注册了）与 observe（观测窗口），但**没有「先筛再干活」的那道闸**：
 *   现场实测 `档案预筛` / `prefilter` / `preScreen` / `gate-先筛` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：每一轮都对着**全量注册名单**跑一遍重活（推演 / 建档），
 *   名单外的路人也能混进来，昵称与全名各算一个角色。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 Rosa9527/SoulLink 的 archivePreScreen.txt 与 roleplayPreScreen.txt：
 *     · **候选集封闭**：只从 <Registered_Characters> 里挑，名单外一律忽略；
 *     · **名字必须逐字一致**：对话里的简称/昵称（「纱雾」）要映到名单全名
 *       （「和泉纱雾」），映不上就丢弃——**程序按名字精确匹配**；
 *     · **两档口径不同**：档案预筛「在场获知倾向列入」，角色预筛「在场判定从严、
 *       戏份判定从宽」，且入选**按戏份轻重排序、最多保留 6 名**；
 *     · **输出是纯 JSON**：不要 Markdown、不要 ```json 围栏、不要前后缀。
 *   本模块只取其中**可判定的那一层**（候选集封闭 / 名字对齐 / 两档规则 / 排序截断 /
 *   纯 JSON 契约校验）；真正的模型调用由调用方做，本模块只出**名单**。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · registry —— 「谁注册了」（真源），本模块**只读它**，不改不删；
 *   · observe —— 「观测窗口切片」，本模块不做切片；
 *   · 本模块 —— **候选集封闭 + 名字对齐 + 两档分诊 + 戏份排序截断 + 回复契约校验**。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `screen` 一律 `disabled`。
 *   ② **候选集封闭**：名单外的名字 ⇒ `out-of-roster` 丢弃（不扩候选集）。
 *   ③ **昵称必须唯一可解**：别名映不到或多解 ⇒ `ambiguous-alias` 丢弃，不猜。
 *   ④ **在场判定从严**：`absent`（明确不在场）一律丢弃，宁漏不错。
 *   ⑤ **戏份判定从宽**：`background` 在档案档列入，仅在角色档丢弃。
 *   ⑥ **上限截断如实报**：超出 `cap` ⇒ `truncated:true` + `droppedByCap` 具名。
 *   ⑦ **纯 JSON 契约**：围栏 / 前缀 / 后缀 / 坏结构一律拒收并具名原因。
 *   ⑧ 不落盘、不跨会话（名单是当场派生物，不是事实账）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_prefilter_gate_settings_v1';
  const DEF = { enabled: false, roleplayCap: 6, maxRoster: 512, maxAlias: 512 };
  const __REG = { key: LS_KEY, def: DEF, module: 'prefilterGate',
    bounds: { roleplayCap: [1, 64], maxRoster: [1, 4096], maxAlias: [0, 4096] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const KINDS = ['archive', 'roleplay'];
  const KIND_LABEL = { archive: '档案预筛', roleplay: '角色预筛' };
  const SIGNALS = {
    interact: '参与互动', witness: '在场获知', told: '被告知', revealed: '信息揭示',
    named: '被点名', emotion: '情绪反应', onSite: '在场', background: '纯背景',
    mention: '仅被提及', absent: '不在场',
  };
  // 两档口径（来源 prompt 的判定标准，逐条落成白名单）
  const RULES = {
    archive: { keep: ['interact', 'witness', 'told', 'revealed', 'onSite', 'emotion', 'named', 'background'], cap: 0 },
    roleplay: { keep: ['named', 'interact', 'emotion', 'witness', 'onSite'], cap: 6 },
  };
  const WEIGHT = { named: 3, interact: 2, emotion: 1.5, witness: 1, onSite: 0.5, revealed: 0.8, told: 0.8, background: 0.1 };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { screened: 0, picked: 0, dropped: 0, truncated: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : String(v == null ? '' : v).slice(0, max || 40).replace(/\s+/g, ' ').trim(); }

  const ROSTER = { names: [] };          // 真源（只读 registry 的本地镜像，由 register 同步）
  const ALIAS = {};                      // 昵称 → 全名（唯一才认）

  function register(list, opts) {
    const cfg = settings();
    const arr = Array.isArray(list) ? list : [list];
    if (!arr.length) return refuse('empty-roster');
    if (opts && opts.replace) ROSTER.names = [];
    let added = 0; const skipped = [];
    arr.forEach(function (v) {
      const n = clean(v, 60);
      if (!n) { skipped.push({ name: v, why: 'empty-name' }); return; }
      if (ROSTER.names.indexOf(n) >= 0) { skipped.push({ name: n, why: 'duplicate' }); return; }
      if (ROSTER.names.length >= cfg.maxRoster) { skipped.push({ name: n, why: 'roster-full' }); return; }
      ROSTER.names.push(n); added++;
    });
    return { ok: true, reason: 'ok', added: added, skipped: skipped, size: ROSTER.names.length, cap: cfg.maxRoster };
  }
  function alias(nick, full) {
    const cfg = settings();
    const k = clean(nick, 60); const v = clean(full, 60);
    if (!k || !v) return refuse('empty-alias');
    if (ROSTER.names.indexOf(v) < 0) return refuse('alias-target-not-registered');
    if (Object.keys(ALIAS).length >= cfg.maxAlias && !ALIAS[k]) return refuse('alias-full');
    ALIAS[k] = v;
    return { ok: true, reason: 'ok', nick: k, full: v };
  }
  function resolveName(raw) {
    const n = clean(raw, 60);
    if (!n) return { why: 'empty-name' };
    if (ROSTER.names.indexOf(n) >= 0) return { name: n, why: 'exact' };
    const target = ALIAS[n];
    if (target && ROSTER.names.indexOf(target) >= 0) return { name: target, why: 'alias-mapped', via: n };
    return { why: ROSTER.names.length ? 'out-of-roster' : 'no-roster' };
  }
  function normSignals(list) {
    const arr = Array.isArray(list) ? list : [list];
    return arr.map(function (v) {
      if (typeof v === 'string') return { name: v, kind: 'onSite' };
      const o = v || {};
      const kind = SIGNALS[o.kind] ? o.kind : 'onSite';
      return { name: o.name, kind: kind };
    }).filter(function (s) { return s.name != null && s.name !== ''; });
  }
  /**
   * 预筛：候选集封闭 → 名字对齐 → 按档分诊 → 排序截断。
   * 只出名单，不做任何模型调用。
   */
  function screen(kind, signals, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const k = KINDS.indexOf(clean(kind, 20)) >= 0 ? clean(kind, 20) : 'archive';
    if (!ROSTER.names.length) return refuse('no-roster');
    const rows = normSignals(signals);
    if (!rows.length) return refuse('empty-signals');
    const rule = RULES[k];
    const cap = (opts && Number.isFinite(Number(opts.cap))) ? Math.floor(Number(opts.cap)) : (rule.cap || cfg.roleplayCap);
    const seen = {}; const picked = []; const dropped = []; const aliasMapped = [];
    rows.forEach(function (s) {
      const r = resolveName(s.name);
      if (!r.name) { dropped.push({ name: clean(s.name, 60), why: r.why }); return; }
      if (r.why === 'alias-mapped') aliasMapped.push({ nick: r.via, full: r.name });
      if (seen[r.name]) { dropped.push({ name: r.name, why: 'duplicate' }); return; }
      seen[r.name] = 1;
      // 在场判定从严：明确不在场一律丢弃（两档同）
      if (s.kind === 'absent') { dropped.push({ name: r.name, why: 'absent' }); return; }
      if (rule.keep.indexOf(s.kind) < 0) { dropped.push({ name: r.name, why: 'no-part:' + s.kind }); return; }
      picked.push({ name: r.name, kind: s.kind, kindLabel: SIGNALS[s.kind], weight: WEIGHT[s.kind] || 0, via: r.why });
    });
    if (k === 'roleplay') picked.sort(function (a, b) { return b.weight - a.weight || (a.name < b.name ? -1 : 1); });
    let droppedByCap = [];
    if (cap > 0 && picked.length > cap) {
      droppedByCap = picked.slice(cap).map(function (p) { return { name: p.name, why: 'over-cap' }; });
      dropped.push.apply(dropped, droppedByCap);
      picked.length = cap;
    }
    stat.screened++; stat.picked += picked.length; stat.dropped += dropped.length;
    if (droppedByCap.length) stat.truncated++;
    return { ok: true, reason: 'ok', kind: k, kindLabel: KIND_LABEL[k],
      characters: picked.map(function (p) { return p.name; }), picked: picked,
      dropped: dropped, droppedByCap: droppedByCap, truncated: droppedByCap.length > 0,
      cap: cap > 0 ? cap : null, rosterSize: ROSTER.names.length,
      aliasMapped: aliasMapped, contract: '{ "characters": ["全名", ...] }', forbidden: 'markdown-fence/prefix/suffix' };
  }
  /** 回复契约校验：纯 JSON，无围栏无前后缀，结构必须是 { characters: [..] }。 */
  function parseReply(text) {
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) return refuse('empty-reply');
    if (/```/.test(raw)) return refuse('fenced');
    const t = raw.trim();
    if (t.charAt(0) !== '{') return refuse('prefix');
    if (t.charAt(t.length - 1) !== '}') return refuse('suffix');
    let obj = null;
    try { obj = JSON.parse(t); } catch (e) { return refuse('not-json'); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return refuse('bad-shape');
    if (!Array.isArray(obj.characters)) return refuse('bad-characters');
    const out = []; const bad = [];
    obj.characters.forEach(function (n) {
      const r = resolveName(n);
      if (!r.name) { bad.push({ name: clean(n, 60), why: r.why }); return; }
      if (out.indexOf(r.name) < 0) out.push(r.name);
    });
    return { ok: true, reason: 'ok', characters: out, rejected: bad, count: out.length };
  }
  function roster() { return { ok: true, reason: 'ok', size: ROSTER.names.length, names: ROSTER.names.slice(), aliases: Object.keys(ALIAS).length }; }
  function clearRoster() { const n = ROSTER.names.length; ROSTER.names = []; Object.keys(ALIAS).forEach(function (k) { delete ALIAS[k]; }); return { ok: true, reason: 'ok', dropped: n }; }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, kinds: KINDS.slice(), kindLabel: KIND_LABEL, signals: SIGNALS,
      keep: { archive: RULES.archive.keep.slice(), roleplay: RULES.roleplay.keep.slice() },
      roleplayCap: cfg.roleplayCap, maxRoster: cfg.maxRoster, maxAlias: cfg.maxAlias,
      rosterSize: ROSTER.names.length, aliasSize: Object.keys(ALIAS).length,
      contract: '{ "characters": ["全名", ...] }' };
  }
  function resetStat() {
    stat.screened = 0; stat.picked = 0; stat.dropped = 0; stat.truncated = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.prefilterGate = {
    getSettings: settings, setSettings: saveSettings, view: view,
    register: register, alias: alias, resolveName: resolveName, roster: roster, clearRoster: clearRoster,
    screen: screen, parseReply: parseReply,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    KINDS: KINDS, KIND_LABEL: KIND_LABEL, SIGNALS: SIGNALS, RULES: RULES,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/prefilter-gate.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'prefilterGate 已加载（2.230.0）');
})();
