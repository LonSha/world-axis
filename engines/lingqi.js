/**
 * WorldAxis engines/lingqi.js (v2.230.0) — 玲七管家（管家式调度台）
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓有 `tool-diag`（工具自检）、`pending-center`（待办聚合）、`request-viewer`
 *   （请求查看），但**没有一处**回答「玩家用一句人话问一句，本仓这台机器现在
 *   到底能干什么、这一步该谁办」。现场实测：`玲七` / `lingqi` / `管家式调度` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：「我这个设置怎么改」「他这轮怎么没动」「帮我看看记忆里有没有这条」这类
 *   请求，只能靠玩家去面板里自己翻——能力存在但**没有可查询的门**。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 world-backstage 的「玲七管家」（lingqi.js / lingqi-skills.js / lingqi-help.js）：
 *     · **技能注册表**：每条 = `{ id, name, kind, category, risk, confirmation }`，
 *       `kind` 只有 `query`（只读）与 `action`（有写）两类；
 *     · **风险三档** `low/medium/high`，`high` **必须** `confirmation`（不许静默落笔）；
 *     · **分诊路由**四态 `resolved / self_service / external / mama`：
 *       本仓能办的自己办（self_service）、要玩家自己动手的指路（external）；
 *     · **技能清单可查**：问「你会什么」要能列出（不是靠文档）。
 *   本模块只取其中**可判定的那一层**（注册表 + 风险门 + 分诊 + 只读查询）；
 *   真正的动作执行**不在本模块**（它只判「该不该由本仓办、要不要确认」，
 *   执行仍走各自 owner —— 这与本仓「不越权代写」的纪律一致）。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · tool-diag —— 工具与模块的自检读数，本模块不读它的表；
 *   · pending-center —— 待办聚合，本模块不排它的事；
 *   · 本模块 —— **能力清单 + 一句话分诊 + 风险确认门 + 只读路由**（零动作执行）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时注册 / 分诊 / 路由一律拒收 `disabled`。
 *   ② **high 必须确认**：`risk:'high'` 的技能缺 `confirmation:true` ⇒ 注册即拒
 *      （`high-needs-confirm`），不允许「高危却静默落笔」这种组合存在。
 *   ③ **kind 只有两类**：`query` / `action`，第三种一律 `bad-kind`。
 *   ④ **未知技能不假装能办**：分诊到不存在的技能 ⇒ `unknown-skill`。
 *   ⑤ **只读不许走写路由**：`query` 类技能路由到 `external`/`mama` 一律 `not-query`。
 *   ⑥ 分诊**不猜**：认不出的请求具名 `unrouted`（不默认丢给「随便办办」）。
 *   ⑦ 本模块**零动作执行**：`route` 只出「该谁办 + 要不要确认」，恒 `executed:0`。
 *   ⑧ 有硬上限：技能数与清单条数由 settings 定，超限拒收并具名。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_lingqi_settings_v1';
  const DEF = { enabled: false, maxSkills: 64, maxListRows: 32, requireConfirmForHigh: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'lingqi',
    bounds: { maxSkills: [1, 256], maxListRows: [4, 128] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const KINDS = ['query', 'action'];
  const RISKS = ['low', 'medium', 'high'];
  const ROUTES = ['resolved', 'self_service', 'external', 'mama'];
  const ROUTE_LABEL = { resolved: '本仓已能回答', self_service: '本仓可办（下一步走它自己）', external: '需玩家自己动手', mama: '须转交更高权限' };
  const OWNERS = ['user', 'provider', 'mama', 'unknown'];
  const CATEGORIES = ['usage', 'settings', 'api', 'task', 'memory', 'people', 'injection', 'opinion', 'worldbook', 'data', 'ui', 'unknown'];
  const SEED = [
    { id: 'list_skills', name: '技能清单', kind: 'query', category: 'usage', risk: 'low' },
    { id: 'status_overview', name: '世界状态总览', kind: 'query', category: 'data', risk: 'low' },
    { id: 'memory_status', name: '记忆状态盘点', kind: 'query', category: 'memory', risk: 'low' },
    { id: 'settings_overview', name: '设置概览', kind: 'query', category: 'settings', risk: 'low' },
    { id: 'diagnose_person', name: '人物停滞诊断', kind: 'query', category: 'people', risk: 'low' },
    { id: 'organize_memory', name: '整理长期记忆', kind: 'action', category: 'memory', risk: 'medium' },
    { id: 'simulate_latest', name: '推演最新正文', kind: 'action', category: 'task', risk: 'medium', confirmation: true },
    { id: 'social_send_message', name: '代发通讯消息', kind: 'action', category: 'people', risk: 'high', confirmation: true },
    { id: 'delete_lingqi_chat', name: '删除聊天记录', kind: 'action', category: 'data', risk: 'high', confirmation: true },
  ];
  const KEYWORDS = [
    { route: 'self_service', category: 'memory',  re: /记忆|记得|忘了|存档/ },
    { route: 'self_service', category: 'settings', re: /设置|开关|配置|参数/ },
    { route: 'resolved',     category: 'data',    re: /状态|总览|多少|几条|读数/ },
    { route: 'resolved',     category: 'people',  re: /谁|人物|角色|他|她/ },
    { route: 'resolved',     category: 'usage',   re: /会什么|能做什么|怎么用|帮助|清单/ },
    { route: 'external',     category: 'api',     re: /密钥|api|模型|连接/ },
    { route: 'external',     category: 'ui',      re: /界面|面板|按钮|显示/ },
    { route: 'mama',         category: 'worldbook', re: /世界书|条目|词条/ },
  ];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { registered: 0, rejected: 0, routed: 0, unrouted: 0, needConfirm: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  const REG = { skills: [], byId: {} };

  function normalizeSkill(raw) {
    const s = raw && typeof raw === 'object' ? raw : null;
    if (!s) return { ok: false, reason: 'bad-skill' };
    const id = clean(s.id, 40);
    const name = clean(s.name, 60);
    if (!id) return { ok: false, reason: 'bad-id' };
    if (!name) return { ok: false, reason: 'bad-name' };
    const kind = clean(s.kind, 10) || 'query';
    if (KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind' };
    const risk = clean(s.risk, 10) || 'low';
    if (RISKS.indexOf(risk) < 0) return { ok: false, reason: 'bad-risk' };
    const category = clean(s.category, 20) || 'unknown';
    const cat = CATEGORIES.indexOf(category) >= 0 ? category : 'unknown';
    const confirmation = s.confirmation === true;
    return { ok: true, skill: { id: id, name: name, kind: kind, category: cat, risk: risk, confirmation: confirmation } };
  }
  function register(raw) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const n = normalizeSkill(raw);
    if (!n.ok) return refuse(n.reason);
    const sk = n.skill;
    if (cfg.requireConfirmForHigh && sk.risk === 'high' && !sk.confirmation) return refuse('high-needs-confirm');
    if (REG.byId[sk.id]) {
      const i = REG.skills.indexOf(REG.byId[sk.id]);
      REG.skills[i] = sk; REG.byId[sk.id] = sk;
      stat.registered++;
      return { ok: true, reason: 'replaced', id: sk.id, total: REG.skills.length };
    }
    if (REG.skills.length >= cfg.maxSkills) return refuse('too-many-skills');
    REG.skills.push(sk); REG.byId[sk.id] = sk; stat.registered++;
    return { ok: true, reason: 'ok', id: sk.id, total: REG.skills.length };
  }
  function seed() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const was = REG.skills.length;
    let added = 0;
    SEED.forEach(function (s) { const r = register(s); if (r.ok && r.reason === 'ok') added++; });
    return { ok: true, reason: 'ok', seeded: added, before: was, total: REG.skills.length };
  }
  function listSkills(filter) {
    const cfg = settings();
    const f = filter && typeof filter === 'object' ? filter : {};
    let rows = REG.skills.slice();
    if (f.kind) rows = rows.filter(function (s) { return s.kind === f.kind; });
    if (f.category) rows = rows.filter(function (s) { return s.category === f.category; });
    if (f.risk) rows = rows.filter(function (s) { return s.risk === f.risk; });
    const capped = rows.slice(0, cfg.maxListRows);
    return { ok: true, reason: 'ok', total: rows.length, shown: capped.length, truncated: rows.length > capped.length,
      rows: capped.map(function (s) { return { id: s.id, name: s.name, kind: s.kind, category: s.category, risk: s.risk, confirmation: s.confirmation }; }) };
  }
  /** 一句话分诊：不猜；认不出即 unrouted。零动作执行。 */
  function route(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const q = clean(text, 120);
    if (!q) return refuse('bad-question');
    const o = opts || {};
    const skillId = clean(o.skill, 40);
    if (skillId) {
      const sk = REG.byId[skillId];
      if (!sk) return refuse('unknown-skill');
      const wantRoute = clean(o.to, 20);
      const chosen = ROUTES.indexOf(wantRoute) >= 0 ? wantRoute : (sk.kind === 'query' ? 'resolved' : 'self_service');
      if (sk.kind === 'query' && chosen !== 'resolved') return refuse('not-query');
      const need = sk.kind === 'action' && sk.risk !== 'low' ? sk.confirmation : false;
      if (need) stat.needConfirm++;
      stat.routed++;
      return { ok: true, reason: 'ok', skill: sk.id, skillName: sk.name, kind: sk.kind, risk: sk.risk,
        route: chosen, routeLabel: ROUTE_LABEL[chosen], owner: need ? 'user' : 'provider',
        needConfirm: need, executed: 0 };
    }
    for (let i = 0; i < KEYWORDS.length; i++) {
      const k = KEYWORDS[i];
      if (k.re.test(q)) {
        const hits = REG.skills.filter(function (s) { return s.category === k.category; });
        stat.routed++;
        return { ok: true, reason: 'ok', route: k.route, routeLabel: ROUTE_LABEL[k.route],
          category: k.category, candidates: hits.map(function (s) { return s.id; }),
          owner: k.route === 'external' ? 'user' : (k.route === 'mama' ? 'mama' : 'provider'),
          needConfirm: false, executed: 0 };
      }
    }
    stat.unrouted++;
    noteFault('unrouted');
    return { ok: false, reason: 'unrouted', question: q, executed: 0 };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxSkills: cfg.maxSkills, maxListRows: cfg.maxListRows,
      kinds: KINDS.slice(), risks: RISKS.slice(), routes: ROUTES.slice(), routeLabel: ROUTE_LABEL,
      owners: OWNERS.slice(), categories: CATEGORIES.slice(), total: REG.skills.length };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !REG.skills.length) return '';
    const q = REG.skills.filter(function (s) { return s.kind === 'query'; }).length;
    const a = REG.skills.length - q;
    return ['【玲七管家·能力门】', '· 可查 ' + q + ' 项 / 可办 ' + a + ' 项（高危须确认）', '· 问一句人话即可分诊；分不了会明说分不了'].join('\n');
  }
  function resetStat() {
    stat.registered = 0; stat.rejected = 0; stat.routed = 0; stat.unrouted = 0; stat.needConfirm = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.lingqi = {
    getSettings: settings, setSettings: saveSettings, view: view, buildBlock: buildBlock,
    register: register, seed: seed, listSkills: listSkills, route: route, normalizeSkill: normalizeSkill,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    KINDS: KINDS, RISKS: RISKS, ROUTES: ROUTES, ROUTE_LABEL: ROUTE_LABEL, OWNERS: OWNERS,
    CATEGORIES: CATEGORIES, SEED: SEED,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/lingqi.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'lingqi 已加载（2.230.0）');
})();