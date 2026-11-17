/**
 * WorldAxis engines/story-window.js — story-first visible response window.
 *
 * This is an orchestration/read model, not a second clock, person registry or
 * world-state owner. It records one idempotent window per committed reply and
 * projects existing owners' evidence into player-facing intervention choices.
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const KEY = 'worldaxis_story_window_v1';
  const DEF = { enabled: true, maxWindows: 12, maxTraces: 16 };
  // 记恨类型的中文名（EX-7 投影用；不认识的类型照原样输出，不吞掉）。
  const GRUDGE_CN = { humiliation: '羞辱', breach_trust: '背信', contempt: '轻慢',
    profit_theft: '剥削', physical_harm: '伤害' };
  // 投影自证位：任一个 owner 投影块抛错时记一笔，**不静默丢给下一块**。
  const projStat = { faults: 0, lastFault: '' };
  const REG = { key: KEY, def: DEF, module: 'storyWindow', bounds: { maxWindows: [1, 48], maxTraces: [1, 24] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([REG]);
  const now = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  function settings() {
    return WA.settingsBus ? WA.settingsBus.normalize(REG, Object.assign({}, DEF, WA.settingsBus.read(REG) || {})) : Object.assign({}, DEF);
  }
  function clean(v, n) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, n || 160); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  /** 一个 owner 的投影块抛错，不得清空整张痕迹表；但也要留下自证，不得静默。 */
  function safely(fn) {
    try { fn(); } catch (e) { projStat.faults++; projStat.lastFault = clean(e && e.message, 120); }
  }
  function rows(st) { return st.storyWindow && Array.isArray(st.storyWindow.windows) ? st.storyWindow.windows : []; }
  function chatId() { try { return WA.store.chatId(); } catch (e) { return 'wa_default'; } }
  function stableReplyId(input) {
    const i = input || {};
    if (i.id) return clean(i.id, 100);
    const text = clean(i.text, 240);
    const len = Number(i.chatLength) || 0;
    let h = 2166136261;
    const s = chatId() + '|' + len + '|' + text;
    for (let x = 0; x < s.length; x++) { h ^= s.charCodeAt(x); h = Math.imul(h, 16777619); }
    return 'reply_' + (h >>> 0).toString(16);
  }
  function peopleAt(st, place) {
    const out = [];
    const ps = st.people || {};
    Object.keys(ps).forEach(function (id) {
      const p = ps[id]; if (!p) return;
      const n = clean(p.name || id.replace(/^p_/, ''), 80);
      const loc = p.location || (p.life && p.life.place) || '';
      if (place && loc === place) out.push(n);
    });
    return out;
  }
  // ── 痕迹投影：只读既有 owner 的已提交事实，绝不自己造世界状态 ──────────────
  // 可见性规则词表（**未知规则一律拒绝**，见 traceVisible）：
  //   scene/public —— 同地点可见（public 允许无地点的公共事实）
  //   place:X      —— 仅 X 地可见
  //   recipient:X  —— 仅收件人 X 可见（消息面）
  //   self         —— 玩家自身经历/已登记知识，始终可见
  //   rumor        —— 传闻层（可靠度已按层标注）
  //   internal     —— 后台台账，默认不进正文（只留在窗口内部账）
  //   personal:X   —— 只有 X 本人知晓的内心事实（自己的记恨、自己悬空的托付）
  //   known-by     —— 知情面：knownBy 里含 viewer 才可见（机会的承受者名单走这条）
  function collectTraces(st, input) {
    const out = [], st1 = st || {}, i = input || {};
    function push(t) { if (t && t.summary) out.push(t); }
    const lw = st1.livingWorld || {}, world = st1.world || {};
    const cap = settings().maxTraces;

    // ① 空间痕迹（EX-3 / OP-2）：living-world 落下的地点遗留。
    (Array.isArray(lw.livingTraces) ? lw.livingTraces : []).forEach(function (t) {
      if (!t) return;
      const visibility = t.visibility || t.visibleWhen || t.condition || 'scene';
      push({ id: clean(t.id || ('trace_' + out.length), 100), kind: 'trace',
        // living-world 写出的痕迹正文在 `trace` 字段（见 engines/living-world.js 的 traceItem），
        // 早期只读 summary/text/detail/note ⇒ 真实宿主里摘要全空、窗口只剩标题。
        summary: clean(t.summary || t.text || t.detail || t.note || t.trace, 220),
        at: Number(t.at || t.createdAt || t.atTick) || 0,
        place: clean(t.place || t.location, 80), source: clean(t.source || t.owner || 'livingWorld', 60),
        reliability: clean(t.reliability || t.confidence || 'observed', 40), visibleWhen: clean(visibility, 120) });
    });
    // ② NPC 位移（EX-2）：只报「谁去了哪」，不报动机与结果。
    (Array.isArray(lw.npcMovements) ? lw.npcMovements : []).forEach(function (m) {
      if (!m) return;
      push({ id: clean('mv_' + (m.name || '') + '_' + (m.tick != null ? m.tick : out.length), 100), kind: 'movement',
        summary: clean((m.name || '某人') + '从' + (m.from || '不明处') + '去了' + (m.to || '不明处'), 220),
        at: 0, place: clean(m.to || m.from, 80), source: 'livingWorld.npcMovements',
        reliability: 'observed', visibleWhen: 'scene' });
    });
    // ③ 已抵达的消息（EX-3 的「未送达消息」反面）：收件人边界由 traceVisible 守。
    (Array.isArray(world.messages) ? world.messages : []).forEach(function (m) {
      if (!m || m.status !== 'arrived') return;
      push({ id: clean(m.id, 100), kind: 'message',
        summary: clean(m.text || ('来自' + m.from + '的消息'), 220),
        at: Number(m.endedAt || m.arriveAt) || 0, place: '',
        source: 'world.messages', reliability: 'confirmed',
        visibleWhen: 'recipient:' + clean(m.to, 80) });
    });
    // ④ 在途行程（OP-2）：人物处于「途中」而不是瞬移；只在其抵达地可见。
    (Array.isArray(world.journeys) ? world.journeys : []).forEach(function (j) {
      if (!j) return;
      const moving = j.status === 'in-transit';
      push({ id: clean(j.id, 100), kind: 'journey',
        summary: clean((j.person || '某人') + (moving ? '正在前往' : '已抵达') + (j.to || '未知处'), 220),
        at: Number(j.arriveAt || 0) || 0, place: clean(j.to, 80),
        source: 'world.journeys', reliability: moving ? 'in-transit' : 'confirmed',
        visibleWhen: 'scene' });
    });
    // ⑤ 场外行动（EX-2 / OP-4）：进行中的行动报状态，**不报结果**。
    const acts = st1.acts || {};
    (Array.isArray(acts.rows) ? acts.rows : []).forEach(function (a) {
      if (!a) return;
      const running = a.status === 'running' || a.status === 'planned' || a.status === 'admitted';
      push({ id: clean(a.id, 100), kind: 'act',
        summary: clean((a.person || '某人') + '正在' + (a.text || a.kind || '行动') + '（' + clean(a.status, 20) + '）', 220),
        at: Number(a.startedAt || a.at) || 0, place: clean(a.place || a.to, 80),
        source: 'acts.rows', reliability: running ? 'in-progress' : clean(a.status, 30),
        visibleWhen: 'scene' });
    });
    // ⑥ 行动回执（OP-4 的「结算证据」）：玩家自身经历，直接可见。
    (Array.isArray(acts.res) ? acts.res : []).forEach(function (r) {
      if (!r) return;
      push({ id: clean(r.opId || r.id, 100), kind: 'receipt',
        summary: clean((r.person || '行动') + '的' + (r.kind || '行动') + '结果：' + (r.result || r.status || '已结算'), 220),
        at: Number(r.at) || 0, place: '', source: 'acts.res',
        reliability: 'confirmed', visibleWhen: r.person ? 'recipient:' + clean(r.person, 80) : 'internal' });
    });
    // ⑦ 伏笔（EX-4）：只报已被触发/发展中的一条线；尚未发现的留在内部账。
    (Array.isArray(st1.foreshadows) ? st1.foreshadows : []).forEach(function (f) {
      if (!f) return;
      if (f.status !== 'developing' && f.status !== 'triggered') return;
      push({ id: clean(f.id, 100), kind: 'foreshadow',
        summary: clean('一条暗线正在推进：' + (f.content || ''), 220),
        at: Number(f.updatedAt || f.at) || 0, place: '',
        source: 'foreshadows', reliability: 'discovered', visibleWhen: 'self' });
    });
    // 传闻按实际 hop 投影：接收者只看自己收到的版本，不看全局真相。
    const rumor = st1.rumor || {};
    (Array.isArray(rumor.chains) ? rumor.chains : []).forEach(function (c) {
      if (!c) return;
      (Array.isArray(c.hops) ? c.hops : []).forEach(function (h, index) {
        if (!h || !h.to || ['fact', 'witness'].indexOf(h.layer) < 0) return;
        push({ id: clean(c.id + '_hop_' + index, 100), kind: 'rumor',
          summary: clean('传闻：' + (h.value || ''), 220), at: Number(h.at) || 0,
          place: '', source: 'rumor.chains', reliability: 'rumor',
          visibleWhen: 'recipient:' + clean(h.to, 80) });
      });
    });
    // ⑨ 调查线索（EX-4 / EX-9）：已采集的属玩家知识，未采集且无地点的留内部账。
    const inv = st1.investigation || {};
    (Array.isArray(inv.clues) ? inv.clues : []).forEach(function (c) {
      if (!c) return;
      const collected = c.status === 'collected';
      const loc = clean(c.location || '', 80);
      push({ id: clean(c.id, 100), kind: 'clue',
        summary: clean('线索：' + (c.title || c.subject || ''), 220),
        at: Number(c.at) || 0, place: loc, source: 'investigation.clues',
        reliability: collected ? 'collected' : 'discoverable',
        visibleWhen: c.status === 'resolved' || collected ? 'investigation-knowledge' : (loc ? 'scene' : 'internal'),
        knownBy: (Array.isArray(c.revealedTo) ? c.revealedTo : []).concat(
          (Array.isArray(inv.evidence) ? inv.evidence : []).filter(function (e) { return e && e.clueId === c.id && e.person; })
            .map(function (e) { return e.person; })) });
    });
    // ⑩ 场外人物卡（EX-2 / EX-8）：只报「在何方、正在做什么」，不报隐藏字段。
    const elsewhere = st1.elsewhere || {};
    (Array.isArray(elsewhere.rows) ? elsewhere.rows : []).forEach(function (r) {
      if (!r) return;
      push({ id: clean('el_' + (r.name || out.length), 100), kind: 'elsewhere',
        summary: clean((r.name || '某人') + '在' + (r.place || '某处') + (r.doing ? '，' + r.doing : ''), 220),
        at: 0, place: clean(r.place, 80), source: 'elsewhere.rows',
        reliability: 'observed', visibleWhen: 'scene' });
    });
    // ⑪ 支线机会（EX-5 / OP-1 收缩第三层）：只投既有 opportunity 已登记、且**有承受者**、
    //   且仍可介入的那几条。窗口不自己生任务、不自己发奖励、不自己判 entitlement ——
    //   承受者名单只是知情面（knownBy），谁能接由 owner 说了算。
    safely(function () {
      const op = st1.opportunity || {};
      (Array.isArray(op.openings) ? op.openings : []).forEach(function (o) {
        if (!o) return;
        if (['formed', 'open', 'offered', 'deferred'].indexOf(clean(o.stage, 20)) < 0) return;
        const actors = (Array.isArray(o.actors) ? o.actors : [])
          .map(function (x) { return clean(x, 80); }).filter(Boolean);
        if (!actors.length) return;   // 没有承受者的机会不是「谁的」机会，不进正文
        push({ id: clean(o.id, 100), kind: 'opportunity',
          summary: clean('机会：' + (o.title || o.summary || o.key || '一项可介入的时机') +
            (o.sourceLabel ? '（来自' + o.sourceLabel + '）' : ''), 220),
          at: Number(o.lastAt || o.formedAt) || 0, place: clean(o.place, 80),
          source: 'opportunity.openings', reliability: 'offered',
          visibleWhen: 'known-by', knownBy: actors });
      });
    });
    // ⑫ 悬案（EX-5 第二半）：玩家自己的推理台账 ⇒ 玩家知识（self）。
    //   没有线索的悬案照实说「还没有线索」，不编造成果；停滞的加注「目前停滞」。
    safely(function () {
      (Array.isArray(st1.threads) ? st1.threads : []).forEach(function (t) {
        if (!t || ['open', 'stalled'].indexOf(clean(t.status, 20)) < 0) return;
        const leads = Array.isArray(t.leads) ? t.leads : [];
        push({ id: clean(t.id, 100), kind: 'thread',
          summary: clean('待查：' + (t.question || '') +
            (leads.length ? '（已有 ' + leads.length + ' 条线索）' : '（还没有线索）') +
            (t.status === 'stalled' ? ' — 目前停滞' : ''), 220),
          at: Number(t.updatedAt || t.openedAt) || 0, place: '', source: 'threads',
          reliability: leads.length ? 'self' : 'open', visibleWhen: 'self' });
      });
    });
    // ⑬ 人物计划的当前一步（OP-1 收缩后的第三层）：只投**现场人物**的「正在做」或「卡住」，
    //   平静的待办不进正文。受阻照实报受阻 —— 否则模型会把「卡住了」读成「正在推进」。
    safely(function () {
      const plans = (st1.plan && Array.isArray(st1.plan.plans)) ? st1.plan.plans : [];
      const ps = st1.people || {};
      plans.forEach(function (row) {
        if (!row || !Array.isArray(row.steps) || !row.steps.length) return;
        const pid = clean(row.personId, 80), who = pid.replace(/^p_/, '');
        if (!who) return;
        const p = ps[pid] || ps[who] || null;
        const place = clean((p && (p.location || (p.life && p.life.place))) || row.place || '', 80);
        if (!place) return;   // 不知道人在哪 ⇒ 不投（不是「到处都是」）
        const running = row.steps.filter(function (x) { return x && x.status === 'running'; })[0] || null;
        const blocked = row.steps.filter(function (x) { return x && x.status === 'blocked'; })[0] || null;
        const step = running || blocked;
        if (!step) return;
        push({ id: clean('pl_' + who, 100), kind: 'plan',
          summary: clean(who + (step.status === 'blocked' ? '卡在' : '正在') + '：' +
            (step.text || step.kind || '下一步'), 220),
          at: 0, place: place, source: 'plan.plans',
          reliability: step.status === 'blocked' ? 'blocked' : 'in-progress',
          visibleWhen: 'scene' });
      });
    });
    // ⑭ 私人未了结（EX-7）：只投**玩家自己**的记恨与悬空的托付（personal:X）。
    //   别人的记恨故意不投 —— 它在正文里只能表现为反应，不能表现为玩家读到的心事。
    safely(function () {
      const hr = st1.humanRealism || {};
      (Array.isArray(hr.grudges) ? hr.grudges : []).forEach(function (g) {
        if (!g || g.settled || !g.who) return;
        push({ id: clean('gr_' + (g.id || ''), 100), kind: 'grudge',
          summary: clean('你还没放下对' + (g.target || '某人') + '的' +
            (GRUDGE_CN[g.kind] || g.kind || '不满') + (g.reason ? '（' + g.reason + '）' : ''), 220),
          at: Number(g.recordedAt) || 0, place: '', source: 'humanRealism.grudges',
          reliability: 'self', visibleWhen: 'personal:' + clean(g.who, 80) });
      });
      const sl = st1.socialLegacy || {};
      (Array.isArray(sl.legacies) ? sl.legacies : []).forEach(function (l) {
        if (!l || l.acceptStatus !== 'pending') return;
        const who = clean(l.successor || l.originator, 80);
        if (!who) return;
        push({ id: clean('lg_' + (l.id || ''), 100), kind: 'legacy',
          summary: clean('还悬着的一份托付：' + (l.description || l.legacyType || '未了结的交托'), 220),
          at: Number(l.formedAt) || 0, place: '', source: 'socialLegacy.legacies',
          reliability: 'pending', visibleWhen: 'personal:' + who });
      });
    });
    // 截断口径（OP-5）：**不是简单取尾部**。
    //   窗口现在会同时投影十来个 owner，若按插入顺序取尾部，确认事实会被
    //   传闻/未结算项整体挤掉（真实宿主里表现为「正文只剩传闻」）。
    //   故按可靠度分层保留：确认事实优先占位，未确认项补位，再按时间近者优先。
    const CONFIRMED_R = ['confirmed', 'collected', 'observed', 'self', 'verified'];
    function rank(t) { return CONFIRMED_R.indexOf(clean(t.reliability, 40)) >= 0 ? 0 : 1; }
    const ranked = out.slice().sort(function (a, b) {
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (Number(b.at) || 0) - (Number(a.at) || 0);
    });
    return ranked.slice(0, cap);
  }
  function traceVisible(t, place, viewer) {
    if (!t) return false;
    const rule = clean(t.visibleWhen || 'scene', 120);
    if (rule === 'self') return !!viewer;
    if (rule === 'rumor') return !!viewer;
    if (rule === 'internal') return false;
    if (rule === 'investigation-knowledge') return !!viewer && Array.isArray(t.knownBy) && t.knownBy.indexOf(viewer) >= 0;
    if (rule.indexOf('recipient:') === 0) return !!viewer && clean(viewer, 80) === rule.slice(10);
    // public 仅供明确公开的来源；场外私下行动不能借此绕过现场与知情边界。
    if (rule === 'public') return true;
    // scene —— 现场可见：必须同地点。
    if (rule === 'scene') return !!t.place && !!place && t.place === place;
    if (rule.indexOf('place:') === 0) return !!place && clean(place, 80) === rule.slice(6);
    // personal:X —— 只有 X 本人知晓的内心事实：自己的记恨、自己悬空的托付。
    //   与 recipient 同为「点名可见」，但语义上不许与收件人边界混用（未来可各自收紧）。
    if (rule.indexOf('personal:') === 0) return !!viewer && clean(viewer, 80) === rule.slice(9);
    // known-by —— 知情面：owner 给出的 knownBy 名单才是「谁能知道」的真源。
    if (rule === 'known-by') return !!viewer && Array.isArray(t.knownBy) && t.knownBy.indexOf(viewer) >= 0;
    // 未知可见性规则默认拒绝，避免把条件未知的痕迹当成公开事实。
    return false;
  }
  function project(input, status, traces) {
    const i = input || {}, place = clean(i.playerPlace || i.place, 80);
    const names = Array.isArray(i.people) ? i.people.slice(0, 8).map(function (x) { return clean(x, 80); }) : peopleAt(state(), place);
    return {
      find: { id: 'find', label: '寻找', available: true, effect: '从当前地点出发，查找可达的人员或地点；只在 world/act 证据确认后改变位置。' },
      verify: { id: 'verify', label: '请人核实', available: true, effect: '登记调查/传话请求；消息抵达和证据回执前保持未确认。' },
      defer: { id: 'defer', label: '暂不处理', available: true, effect: '保留痕迹与待处理入口，不把未知升级为完成事实。' },
      // EX-9：人物页/线索页的正常入口。**不要求用户编辑 JSON 或管理后台模拟器**。
      ask: { id: 'ask', label: '询问', available: true, effect: '就当前线索向特定人物发问；问题进入 storyChoice，回复未到前不算已知。' },
      follow: { id: 'follow', label: '跟随', available: true, effect: '跟随某人的行程；只有 world.journeys 给出途中证据才算已出发。' },
      wait: { id: 'wait', label: '等待', available: true, effect: '暂不行动但保留待处理入口；等待期内的推进由 owner 继续结算。' },
      context: { place: place, people: names, status: status, traceCount: traces.length }
    };
  }
  function open(input) {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return { ok: false, reason: 'disabled' };
    const i = input || {}, id = stableReplyId(i), st = state();
    const old = rows(st).filter(function (x) { return x && x.id === id; })[0];
    if (old) return { ok: true, duplicate: true, window: old };
    const traces = collectTraces(st, i);
    const t = now('story-window');
    const rec = { id: id, chatId: chatId(), status: 'opened', openedAt: t, replyAt: t,
      playerPlace: clean(i.playerPlace || i.place, 80), npcIds: Array.isArray(i.npcIds) ? i.npcIds.slice(0, 8) : [],
      evidence: { reply: clean(i.evidence || 'generation-ended', 80), source: clean(i.source || 'interceptor.after', 80) },
      traces: traces, choices: project(i, 'opened', traces), updatedAt: t };
    let out = null;
    WA.store.transact(function (d) {
      d.storyWindow = d.storyWindow && typeof d.storyWindow === 'object' ? d.storyWindow : { windows: [], pending: null };
      d.storyWindow.windows = Array.isArray(d.storyWindow.windows) ? d.storyWindow.windows : [];
      if (d.storyWindow.windows.some(function (x) { return x && x.id === id; })) { out = { ok: true, duplicate: true }; return; }
      d.storyWindow.windows.push(rec);
      while (d.storyWindow.windows.length > cfg.maxWindows) d.storyWindow.windows.shift();
      d.storyWindow.pending = id;
      out = { ok: true, duplicate: false, window: rec };
    });
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function current() {
    const st = state(), id = st.storyWindow && st.storyWindow.pending;
    const r = rows(st).filter(function (x) { return x && x.id === id; })[0] || rows(st).slice(-1)[0] || null;
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }
  /**
   * 记一次**未成立的**介入尝试（owner 拒收、输入不全、可见性不成立）。
   *   ——只写 attempts 与 lastResponse，**绝不写 choice、绝不动 status**：
   *   写 choice 等于宣称「玩家已经选了」，那正是本窗口要避免的虚假完成事实。
   *   页面的「重试」按钮据此仍可用；诊断面上的 attempts 则说明「按过但没成」。
   */
  function respond(id, info) {
    const target = clean(id, 100), i = info || {};
    if (!target) return { ok: false, reason: 'missing-id' };
    let out = null;
    WA.store.transact(function (d) {
      const r = rows(d).filter(function (x) { return x && x.id === target; })[0];
      if (!r) { out = { ok: false, reason: 'window-missing' }; return; }
      r.responseCount = (Number(r.responseCount) || 0) + 1;
      r.lastResponse = { at: now('story-window.respond'), choice: clean(i.choice, 20),
        owner: clean(i.owner, 80), reason: clean(i.reason, 120),
        phase: clean(i.phase, 40), accepted: false };
      r.attempts = Array.isArray(r.attempts) ? r.attempts : [];
      r.attempts.push({ at: r.lastResponse.at, choice: r.lastResponse.choice,
        owner: r.lastResponse.owner, reason: r.lastResponse.reason });
      while (r.attempts.length > 6) r.attempts.shift();
      out = { ok: true, window: r };
    }, 'story-window:respond');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function choose(id, choice, context) {
    // EX-9 扩展后的合法入口：正文三入口 + 人物页/线索页的正常入口。
    const allowed = ['find', 'verify', 'defer', 'ask', 'follow', 'wait'];
    const c = clean(choice, 20);
    if (allowed.indexOf(c) < 0) return { ok: false, reason: 'bad-choice', choices: allowed.slice() };
    const cur = current(); if (!cur || cur.id !== clean(id, 100)) return { ok: false, reason: 'window-missing' };
    // 必须在调用任何 owner 写口之前拒绝重复，避免先发信/出发再报 already-chosen。
    if (cur.choice && cur.choice.id) return { ok: false, reason: 'already-chosen', choice: cur.choice };
    if (cur.status === 'settled' || cur.status === 'failed') return { ok: false, reason: 'window-closed' };
    const ctx = context || {};
    // 选择只负责把玩家意图委托给既有 owner；委托缺失时明确返回 awaiting，
    // 不把“按钮已按下”伪装成位置、消息或证据已经落成。
    let owner = 'storyWindow', effect = null, reason = '', phase = c === 'defer' ? 'deferred' : 'awaiting-owner';
    if (c === 'find') {
      try {
        if (ctx.clueId) {
          const target = clean(ctx.target, 80), from = resolvePlace(ctx, cur);
          if (!target || !from) { reason = 'place-unknown'; }
          else if (target !== from && WA.world && typeof WA.world.depart === 'function') {
            effect = WA.world.depart(ctx.player, from, target, ctx.at); owner = 'world';
            phase = effect && effect.ok ? 'in-transit' : 'awaiting-owner';
          } else if (target === from && WA.act && typeof WA.act.add === 'function') {
            effect = WA.act.add(ctx.player, { kind: 'work', text: '在' + from + '寻找线索',
              goalId: ctx.goalId, opId: ctx.opId }); owner = 'act';
            phase = effect && effect.ok ? 'planned' : 'awaiting-owner';
          } else { reason = 'owner-missing'; }
        } else if (WA.storyChoice && typeof WA.storyChoice.confirm === 'function' && ctx.choiceId && ctx.option) {
          effect = WA.storyChoice.confirm(ctx.choiceId, ctx.option, ctx);
          owner = 'storyChoice';
          phase = effect && effect.applied ? 'accepted' : 'awaiting-owner';
        } else if (WA.storyChoice && typeof WA.storyChoice.present === 'function') {
          effect = WA.storyChoice.present({ round: cur.replyAt, prompt: '寻找：' + (ctx.target || cur.playerPlace || '当前线索'), options: [
            { label: '从当前地点寻找', ops: ctx.findOps || null }, { label: '暂不移动', ops: null }] });
          owner = 'storyChoice';
          phase = effect && effect.ok ? 'presented' : 'awaiting-owner';
          reason = effect && effect.ok ? 'choice-presented-awaiting-confirmation' : '';
        } else if (WA.act && typeof WA.act.add === 'function') {
          effect = WA.act.add(ctx.person || 'player', { kind: 'move', from: ctx.from, to: ctx.target, place: ctx.target,
            text: '寻找回应窗口目标', goalId: ctx.goalId, opId: ctx.opId });
          owner = 'act';
          phase = effect && effect.ok ? 'planned' : 'awaiting-owner';
        } else { reason = 'owner-missing'; }
      } catch (e) { reason = 'owner-threw'; effect = { ok: false, reason: reason }; }
    } else if (c === 'verify') {
      try {
        if (WA.investigation && typeof WA.investigation.register === 'function' && ctx.clue) {
          effect = WA.investigation.register(ctx.clue); owner = 'investigation';
          phase = effect && effect.ok ? 'registered-awaiting-evidence' : 'awaiting-owner';
        } else if (WA.world && typeof WA.world.sendMessage === 'function' && ctx.from && ctx.to && ctx.message) {
          effect = WA.world.sendMessage(ctx.from, ctx.to, { text: ctx.message, at: ctx.at, via: ctx.via, netMinutes: ctx.netMinutes });
          owner = 'world';
          phase = effect && effect.ok ? 'message-in-transit' : 'awaiting-owner';
        } else { reason = ctx.clue || ctx.message ? 'owner-input-invalid' : 'awaiting-owner-input'; }
      } catch (e) { reason = 'owner-threw'; effect = { ok: false, reason: reason }; }
    } else if (c === 'ask') {
      // EX-9：向某人发问。**优先落到既有 owner 写口**，不自己造问句状态。
      //   ① 已有 storyChoice 会话 ⇒ 走 confirm（真选项才 applied）；
      //   ② 否则发世界消息（ask 某人）⇒ 在途阶段只是「已发问」，不是「已得到回答」。
      try {
        if (WA.storyChoice && typeof WA.storyChoice.confirm === 'function' && ctx.choiceId && ctx.option) {
          effect = WA.storyChoice.confirm(ctx.choiceId, ctx.option, ctx);
          owner = 'storyChoice';
          phase = effect && effect.applied ? 'accepted' : 'awaiting-owner';
        } else if (WA.world && typeof WA.world.sendMessage === 'function' && ctx.to) {
          effect = WA.world.sendMessage(ctx.player || 'player', ctx.to, {
            text: ctx.message || ctx.question || ('关于' + (ctx.topic || '当前线索') + '的询问'),
            at: ctx.at, via: ctx.via || 'road', netMinutes: ctx.netMinutes });
          owner = 'world';
          phase = effect && effect.ok ? 'message-in-transit' : 'awaiting-owner';
          reason = effect && effect.ok ? 'asked-awaiting-reply' : '';
        } else { reason = ctx.to ? 'owner-input-invalid' : 'awaiting-owner-input'; }
      } catch (e) { reason = 'owner-threw'; effect = { ok: false, reason: reason }; }
    } else if (c === 'follow') {
      // EX-2 / OP-2：跟随某人。**必须由 world.journeys 给出「在途」证据**才算已出发。
      try {
        if (WA.world && typeof WA.world.depart === 'function' && ctx.to) {
          // world.depart 的真实签名是 (person, from, to, at) —— 四个位置参数，
          // 传对象会被当成 from 落进错误分支（此前 sendMessage 已犯过同类错）。
          const from = ctx.from || resolvePlace(ctx, cur);
          effect = WA.world.depart(ctx.player || 'player', from, ctx.to, ctx.at);
          owner = 'world';
          phase = effect && effect.ok ? 'in-transit' : 'awaiting-owner';
          reason = effect && effect.ok ? 'following-journey-opened' : '';
        } else { reason = ctx.to ? 'owner-input-invalid' : 'awaiting-owner-input'; }
      } catch (e) { reason = 'owner-threw'; effect = { ok: false, reason: reason }; }
    } else if (c === 'wait') {
      // 等待不是「什么都不做」：它保留待处理入口，并把窗口挂在 awaiting 上，
      //   由 owner（world/livingWorld）在后续推进里继续结算。**不产生任何完成事实。**
      try {
        if (WA.act && typeof WA.act.add === 'function' && ctx.person) {
          effect = WA.act.add(ctx.person, { kind: 'wait', text: '等待事态推进', goalId: ctx.goalId,
            duration: Number(ctx.duration) || 0, opId: ctx.opId });
          owner = 'act';
          phase = effect && effect.ok ? 'planned' : 'awaiting-owner';
        } else { owner = 'storyWindow'; effect = { ok: true, reason: 'waiting-window-held' }; phase = 'deferred'; }
      } catch (e) { reason = 'owner-threw'; effect = { ok: false, reason: reason }; }
    }
    // owner 明确拒收或根本没有写口时不要锁死窗口；页面可据此重试。
    if (c !== 'defer' && (!effect || effect.ok === false)) {
      // 记一次未成立的尝试（不是 choice）；随后如实拒绝，窗口不锁死、页面可重试。
      respond(cur.id, { choice: c, owner: owner, phase: phase,
        reason: reason || (effect && effect.reason) || 'owner-not-accepted' });
      return { ok: false, reason: reason || (effect && effect.reason) || 'owner-not-accepted',
        owner: owner, effect: effect, retryable: true };
    }
    let out = null;
    WA.store.transact(function (d) {
      const list = d.storyWindow && Array.isArray(d.storyWindow.windows) ? d.storyWindow.windows : [];
      const r = list.filter(function (x) { return x && x.id === cur.id; })[0];
      if (!r) { out = { ok: false, reason: 'window-missing' }; return; }
      if (r.choice && r.choice.id) { out = { ok: false, reason: 'already-chosen', choice: r.choice }; return; }
      r.choice = { id: c, at: now('story-window.choice'), context: clean(ctx.note, 180) };
      // 只有 owner 明确返回 applied 才进入 intervening；presented / planned / in-transit / registered 均仍是 awaiting。
      r.status = c === 'defer' ? 'deferred' : (phase === 'accepted' ? 'intervening' : 'awaiting');
      r.updatedAt = now('story-window.choice');
      r.choiceOutcome = { owner: owner, ok: !!(effect && effect.ok), phase: phase,
        reason: reason || (effect && effect.reason) || (c === 'defer' ? 'deferred' : 'owner-pending') };
      r.consequence = { intent: c, owner: owner, accepted: !!(effect && effect.ok), phase: phase,
        evidence: effect && (effect.evidence || effect.status || effect.reason) || '' };
      r.choices = project(ctx, r.status, r.traces || []);
      out = { ok: true, window: r, owner: owner, effect: effect, awaiting: r.status === 'awaiting' || phase !== 'deferred' && phase !== 'accepted' };
    }, 'story-window:choose');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function settle(id, result) {
    const target = clean(id, 100), r0 = current();
    if (!r0 || r0.id !== target) return { ok: false, reason: 'window-missing' };
    const wanted = clean((result || {}).status || 'settled', 30);
    const allowed = ['settled', 'failed', 'deferred', 'awaiting', 'intervening'];
    if (allowed.indexOf(wanted) < 0) return { ok: false, reason: 'bad-status', statuses: allowed.slice() };
    let out = null;
    WA.store.transact(function (d) {
      const r = (d.storyWindow.windows || []).filter(function (x) { return x && x.id === target; })[0];
      if (!r) { out = { ok: false, reason: 'window-missing' }; return; }
      if (r.status === 'settled' || r.status === 'failed') { out = { ok: false, reason: 'already-settled', status: r.status, window: r }; return; }
      const at = now('story-window.settle');
      r.status = wanted;
      r.settlement = { at: at, evidence: clean((result || {}).evidence, 180),
        owner: clean((result || {}).owner, 80),
        // 结算前窗口被介入过几次：结算不等于「玩家什么也没做」（见 respond 的只读计数）。
        responsesBeforeSettle: Number(r.responseCount) || 0 };
      r.updatedAt = at;
      if (d.storyWindow && d.storyWindow.pending === target && (wanted === 'settled' || wanted === 'failed')) d.storyWindow.pending = null;
      out = { ok: true, window: r };
    }, 'story-window:settle');
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function resolvePlace(c, r) {
    const given = clean(c.playerPlace || c.place || '', 80);
    if (given) return given;
    const who = clean(c.viewer || c.person || c.player || '', 80);
    if (who) {
      // ① world.where：只读行程表 ⇒ 只在「已出发/已抵达」时答得出地点。
      if (WA.world && typeof WA.world.where === 'function') {
        try { const w = WA.world.where(who); if (w && w.place) return clean(w.place, 80); } catch (e) {}
      }
      // ② people 册的 location：**人物册才是「人在哪」的第一真源**。
      //   缺这一步时，从未出过远门的人一律 place=null ⇒ 窗口只能按「地点未知」放行，
      //   同地点过滤形同虚设（EX-3/OP-3 的可见性边界就守不住）。
      try {
        const st = state(), ps = st.people || {};
        const p = ps['p_' + who] || ps[who] || null;
        if (p) {
          const loc = clean(p.location || (p.life && p.life.place) || '', 80);
          if (loc) return loc;
        }
      } catch (e) {}
    }
    return clean(r.playerPlace, 80);
  }
  // ── 只读证据面（OP-7 / OP-8 / OP-9）────────────────────────────────────────
  //   三组 owner 各自在自己家里记账（reasoning-strip / reply-guard /
  //   reject-recovery / advance-idem / degrade-audit / fact-continuity /
  //   model-receipt / model-pin / call-timeline / token-budget），
  //   窗口**只读它们的读数**，不复制、不缓存、不写回。
  //   口径：任何一组缺席或抛错，如实降级为 unknown ——
  //   **绝不把「读不到」读成「一切正常」**（这是降智诊断最容易犯的错）。
  function snap(fn, name, faults) {
    try { return fn(); } catch (e) { faults.push(name + ':' + clean(e && e.message, 60)); return null; }
  }

  /** OP-7 反截断与稳妥续写：这一轮的上游有没有中断/重试/重复推进的痕迹。 */
  function readStability() {
    const faults = [], reasons = [], sources = [];
    const rs = snap(function () { return WA.reasoningStrip && WA.reasoningStrip.stat(); }, 'reasoningStrip', faults);
    if (rs) {
      sources.push('reasoningStrip');
      // held = 尾部半边标签被扣住（流被截断的典型痕迹）；不静默，报给玩家看。
      const held = Number(rs.held) || 0, blocked = Number(rs.blocked) || 0;
      if (held > 0) reasons.push('思维链尾部被扣住 ' + held + ' 次');
      if (blocked > 0) reasons.push('思维链清洗拦下 ' + blocked + ' 次');
    }
    const rg = snap(function () { return WA.replyGuard && WA.replyGuard.diagnose(); }, 'replyGuard', faults);
    if (rg) {
      sources.push('replyGuard');
      if (rg.status === 'cooling') reasons.push('拒答重试仍在冷却中');
    }
    const rr = snap(function () { return WA.rejectRecovery && WA.rejectRecovery.stat(); }, 'rejectRecovery', faults);
    if (rr) {
      sources.push('rejectRecovery');
      const unknown = Number(rr.unknown) || 0;
      if (unknown > 0) reasons.push('有 ' + unknown + ' 条拒答码没认出（恢复策略可能没走对）');
    }
    const ai = snap(function () { return WA.advanceIdem && WA.advanceIdem.stat(); }, 'advanceIdem', faults);
    if (ai) {
      sources.push('advanceIdem');
      const dups = Number(ai.dups) || 0, aborts = Number(ai.aborts) || 0;
      // dups 是「拦下来的重复推进」，是好事：说明幂等闸在工作，不算不稳。
      if (aborts > 0) reasons.push('本轮推进被中止过 ' + aborts + ' 次');
      if (dups > 0) sources.push('advanceIdem.dupBlocked=' + dups);
    }
    const verdict = reasons.length ? 'unstable' : (sources.length ? 'stable' : 'unknown');
    return { verdict: verdict, reasons: reasons, sources: sources, faults: faults };
  }

  /** OP-8 查降智改为证据诊断：行为面与身份面各报各的，互不覆盖。 */
  function readHealth() {
    const faults = [], reasons = [], sources = [];
    const da = snap(function () { return WA.degradeAudit && WA.degradeAudit.stat(); }, 'degradeAudit', faults);
    if (da) {
      sources.push('degradeAudit');
      const tps = Number(da.tpsDrops) || 0, tok = Number(da.tokenDrops) || 0;
      if (tps > 0) reasons.push('吐字速度比基线掉过 ' + tps + ' 次');
      if (tok > 0) reasons.push('输出长度比基线掉过 ' + tok + ' 次');
    }
    const mr = snap(function () { return WA.modelReceipt && WA.modelReceipt.drifters(); }, 'modelReceipt', faults);
    if (mr) {
      sources.push('modelReceipt');
      const n = Number(mr.total) || 0;
      // 身份面漂移：请求模型与回执模型不一致 —— 与行为面是两件事，分开报。
      if (n > 0) reasons.push('有 ' + n + ' 组请求/回执模型对不上（可能是同名降配）');
    }
    const fc = snap(function () { return WA.factContinuity && WA.factContinuity.stat(); }, 'factContinuity', faults);
    if (fc) {
      sources.push('factContinuity');
      const f = fc.faults && typeof fc.faults === 'object' ? Object.keys(fc.faults) : [];
      if (f.length) reasons.push('事实连续性判据报过 ' + f.join('/'));
    }
    const verdict = reasons.length ? 'degraded' : (sources.length ? 'clean' : 'unknown');
    return { verdict: verdict, reasons: reasons, sources: sources, faults: faults };
  }

  /** OP-9 模型路由与调用过程：谁应答了这一轮、钉版对不对得上、卡在哪一段。 */
  function readRouting() {
    const faults = [], sources = [];
    const out = { verdict: 'unknown', reasons: [], sources: sources, faults: faults,
      models: [], pinned: null, critical: null, channels: [] };
    const st = snap(function () { return WA.modelReceipt && WA.modelReceipt.stats(); }, 'modelReceipt', faults);
    if (st) {
      sources.push('modelReceipt');
      out.models = (Array.isArray(st.channels) ? st.channels : []).slice(0, 6).map(function (c) {
        // modelReceipt.stats() 的渠道行字段是 lastRespModel（最近一次回执的模型名）。
        return { channel: clean(c.channel, 60), respModel: clean(c.lastRespModel || '', 80),
          count: Number(c.count) || 0, drifts: Number(c.drifts) || 0 };
      });
    }
    const pin = snap(function () { return WA.modelPin && WA.modelPin.audit(); }, 'modelPin', faults);
    if (pin) {
      sources.push('modelPin');
      out.pinned = { pinned: Number(pin.pinned) || 0, clean: !!pin.clean };
      if (!pin.clean) out.reasons.push('钉版模型与真回执不一致（' + (pin.drifters || []).length + ' 个渠道）');
    }
    const tl = snap(function () { return WA.callTimeline && WA.callTimeline.view(); }, 'callTimeline', faults);
    if (tl) {
      sources.push('callTimeline');
      const last = (Array.isArray(tl.rounds) ? tl.rounds : [])[0] || null;
      if (last) out.critical = { roundId: clean(last.roundId, 60), criticalChannel: clean(last.criticalChannel || '', 60),
        totalMs: Number(last.totalMs) || 0, longestMs: Number(last.longestMs) || 0 };
    }
    const tb = snap(function () { return WA.tokenBudget && WA.tokenBudget.view(); }, 'tokenBudget', faults);
    if (tb) {
      sources.push('tokenBudget');
      out.channels = (Array.isArray(tb.channels) ? tb.channels : []).slice(0, 4).map(function (c) {
        return { channel: clean(c.channel, 60), p95Ms: c.p95Ms == null ? null : Number(c.p95Ms),
          completionTokens: Number(c.completionTokens) || 0 };
      });
    }
    if (out.reasons.length) out.verdict = 'drift';
    else if (sources.length) out.verdict = 'aligned';
    return out;
  }

  /** 三组合读：给诊断面与正文块共用同一份读数，避免两处各读一遍各说一套。 */
  function evidence() {
    return { stability: readStability(), health: readHealth(), routing: readRouting() };
  }

  /** 宿主里的玩家名（解析不到给空串，绝不猜「主角」）。 */
  function hostPlayerName() {
    try {
      const host = WA.mainWin || window;
      const ctx = host.SillyTavern && host.SillyTavern.getContext ? host.SillyTavern.getContext() : null;
      return ctx && ctx.name1 ? String(ctx.name1).trim() : '';
    } catch (e) { return ''; }
  }
  function visibleTraces(context) {
    const r = current();
    if (!r || r.status === 'settled' || r.status === 'failed') return [];
    const c = Object.assign({}, context || {});
    if (!c.viewer && !c.player && !c.person) c.viewer = hostPlayerName();
    const viewer = clean(c.viewer || c.person || c.player || c.recipient || '', 80);
    if (!viewer) return [];
    const place = resolvePlace(c, r);
    return (r.traces || []).filter(function (t) { return traceVisible(t, place, viewer); }).slice(0, settings().maxTraces);
  }
  function buildBlock(context) {
    const r = current(); if (!r || r.status === 'settled' || r.status === 'failed') return '';
    const c = context || {};
    // 身份闸单点收口：调用方不给 viewer 时自己向宿主要玩家名。
    //   解析不到就**不出块** —— 「谁在看」是可见性成立的必要条件（见 visibleTraces）。
    const viewer = clean(c.viewer || c.person || c.player || c.recipient || '', 80)
      || clean(hostPlayerName(), 80);
    if (!viewer) return '';
    const visible = visibleTraces(context);
    const lines = ['[故事回应窗口]', '正文推进后的场外变化：' + (r.status === 'deferred' ? '入口已暂缓，痕迹仍保留。' : '有一项变化等待你的处理。')];
    // 按可靠度分组（OP-5：当前事实优先，传闻与未确认单列，不得混写成事实）。
    const CONFIRMED = ['confirmed', 'collected', 'observed', 'self', 'verified'];
    const facts = [], uncertain = [];
    visible.forEach(function (t) {
      if (!t.summary) return;
      const line = '· ' + t.summary + '（来源 ' + t.source + '；可靠度 ' + t.reliability + '）';
      if (CONFIRMED.indexOf(clean(t.reliability, 40)) >= 0) facts.push(line); else uncertain.push(line);
    });
    if (facts.length) { lines.push('已确认的事实：'); facts.forEach(function (x) { lines.push(x); }); }
    if (uncertain.length) { lines.push('尚未确认（可能只是传闻、在途或未结算）：'); uncertain.forEach(function (x) { lines.push(x); }); }
    if (!facts.length && !uncertain.length) lines.push('当前没有可向玩家公开的痕迹；未知保持未知。');
    // OP-7 / OP-8：上游真有中断或降智迹象时**必须自己说出来**，
    //   否则模型会把「被截断的半截输出」当成完整事实继续推演。
    //   只报原因，不改痕迹内容 —— 窗口不因为上游不稳就删掉已确认的事实。
    const ev = evidence();
    const caveats = [].concat(ev.stability.verdict === 'unstable' ? ev.stability.reasons : [],
      ev.health.verdict === 'degraded' ? ev.health.reasons : []);
    if (caveats.length) {
      lines.push('（本轮上游有中断或降智迹象：' + caveats.join('；') + '。上列内容可能不完整，未知仍按未知处理。）');
    }
    lines.push('可选介入：寻找 / 请人核实 / 暂不处理（人物页与线索页另有询问 / 跟随 / 等待）。未知、在途和未确认信息不得写成已完成。');
    return lines.join('\n') + '\n';
  }
  function diagnose() {
    const st = state(), rs = rows(st), cur = current();
    const kinds = {};
    (cur && cur.traces ? cur.traces : []).forEach(function (t) { kinds[t.kind] = (kinds[t.kind] || 0) + 1; });
    const owners = {};
    if (cur && cur.choiceOutcome) owners[cur.choiceOutcome.owner] = cur.choiceOutcome.phase;
    // closedLoop 的口径：**窗口只开一次、选择只记一次、结算只落一次**，
    //   并且当前窗口的每个痕迹都来自真实 owner 的已提交事实（不是窗口自造）。
    const closedLoop = !!cur && rs.length > 0 && !!cur.choice && !!cur.choice.id &&
      ['opened', 'awaiting', 'intervening', 'deferred', 'settled', 'failed'].indexOf(cur.status) >= 0;
    return { module: 'storyWindow', loaded: true, closedLoop: closedLoop,
      version: '2.518.0',
      projection: { faults: projStat.faults, lastFault: projStat.lastFault },
      // OP-7 / OP-8 / OP-9 的只读证据面：路由、降智、中断三组各报各的，互不覆盖。
      evidence: evidence(),
      checks: {
        windowOpened: rs.length > 0,
        pendingResolves: !!(st.storyWindow && st.storyWindow.pending) || rs.length === 0,
        choiceRecorded: !!(cur && cur.choice && cur.choice.id),
        // 幂等自证（OP-7）：同一稳定 replyId 在台账里只应有一条。
        idempotent: !!cur && rs.filter(function (x) { return x && cur && x.id === cur.id; }).length === 1,
        // 未成立的介入尝试：有计数不等于玩家选过；它是「按过但没成」的证据。
        attempts: cur ? (Number(cur.responseCount) || 0) : 0,
        lastAttempt: cur && cur.lastResponse ? cur.lastResponse.reason : '',
        traceCount: cur ? (cur.traces || []).length : 0,
        kinds: kinds, owners: owners,
        status: cur ? cur.status : 'none'
      },
      stat: stat() };
  }
  function stat() {
    const st = state(), rs = rows(st);
    const phases = {};
    rs.forEach(function (r) {
      const phase = r && r.choiceOutcome && r.choiceOutcome.phase;
      if (phase) phases[phase] = (phases[phase] || 0) + 1;
    });
    return { windows: rs.length, phases: phases, pending: (st.storyWindow && st.storyWindow.pending) || null, current: current() };
  }
  WA.storyWindow = { getSettings: settings, setSettings: function (p) { return WA.settingsBus.saveOrThrow(REG, WA.settingsBus.normalize(REG, Object.assign(settings(), p || {}))); },
    open: open, current: current, choose: choose, respond: respond, settle: settle,
    buildBlock: buildBlock, visibleTraces: visibleTraces,
    diagnose: diagnose, stat: stat, evidence: evidence };
  if (WA.registerModule) WA.registerModule('engines/story-window.js', { kind: 'engine', ver: '2.518.0' });
})();