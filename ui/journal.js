/**
 * WorldAxis ui/journal.js — 玩家面「夜读手札」（v2.406.0）
 *
 * v2.401 相对 v2.400 的增强（逐条对应玩家体验缺口）：
 *   ① 「自上次翻开以来」：记住上次合上手札时的世界刻度，新发生的条目标「新」，
 *      页签与悬浮球上出现未读点 —— 这是「世界在你不看时也在转」的直接证据。
 *   ② 可行动：远方/风声/伏笔每条都能「带进对话」（追加到酒馆输入框），
 *      玩家看到传闻就能接着演，而不是看完就算。
 *   ③ 人物分组：同场 / 别处 / 久未露面；卡片显示与你的亲疏与信任。
 *   ④ 新手引导：世界还是空的时候，概览显示三步开局而不是一排「还没有记录」。
 *   ⑤ 阅读偏好：墨色/纸色两种底，三档字号；尊重减弱动效。
 *   ⑥ 手势与无障碍：手机左右滑切页、Esc 关闭、页签带 aria 状态、焦点留在面板内。
 *   ⑦ 推演按钮有忙碌态，不能连点。
 *
 * 边界：只读世界（不写 store）；唯一的外部写是酒馆输入框（玩家主动点击）。
 *   ◈ 一律开手札（含开发者模式）；手札设置页里有通往完整面板的入口。所有字段读取带兜底。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const doc = WA.mainDoc || (typeof document !== 'undefined' ? document : null);
  // 对外只留一个**真消费**的入口（index.js 的 wa_diag_v1 装载面自证读它）。
  //   v2.542.0 收口：原稿导出的 render / tabs / go / unread 四个成员全仓零读取 —— 本仓口径是
  //   「不留死出口」（外部零引用要么接线、要么删），它们由内部事件与点击直接调用，不需要再开一次口。
  // 无头判据**不能只看 UA**：本仓 tests/mock.js 的 document 有 body、有 createElement，UA 里
//   也没有 jsdom/HeadlessChrome —— 只按原稿判据会在回归里真跑 DOM 逻辑。实测后果：mock 的
//   #wa-orb 是极简对象（没有 toggleAttribute）⇒ badge() 抛 TypeError，直接打断整轮回归。
//   故补三条结构判据：documentElement / querySelector / createDocumentFragment 任一不存在
//   = 不是真浏览环境（jsdom 三条都过，仍由 UA 那条兜住）。
  const __noDom = !doc || !doc.body || !doc.documentElement || typeof doc.querySelector !== 'function' || typeof doc.createDocumentFragment !== 'function' || (typeof navigator !== 'undefined' && /jsdom|HeadlessChrome/i.test(navigator.userAgent || ''));
  if (__noDom) { WA.journal = { open() {} }; return; }   // 无头装载（测试）
  const KEY = 'worldaxis_journal_v1';

  const TABS = [
    { id: 'now', label: '此刻' }, { id: 'away', label: '远方' }, { id: 'people', label: '人物' },
    { id: 'threads', label: '线索' }, { id: 'settings', label: '设置' }
  ];
  // ── 偏好与「已读刻度」：走 settingsBus 登记（**不裸调 localStorage**）──
  //   原稿直接 localStorage.getItem/setItem，回归实测两处红都打在这上面：
  //     ① 「（负向）没有新增旁路写文件」—— ui/journal.js 出现在旁路写点清单里；
  //     ② G16「每处裸读点附近都有读侧归因」—— 裸读没有 reportReadFail 投递。
  //   本仓的裁决不是加白名单，而是走登记：那条路径内含写后读回校验、失败分桶、结构指纹
  //   与迁移引擎；绕开它，用户「合上手札」在诊断里就变成「没有发生过」。
  const journalReg = {
    key: KEY,
    def: { tab: 'now', tone: 'ink', size: 'm', seen: null },
    module: 'ui',
    // 三个枚举都是闭合集合：旧版本删掉某档后磁盘里会留一个永远切不过去的值，
    //   表现为「点了没反应」且零报错（与 ui/theme-switch.js 的 theme 同款理由）。
    enums: {
      tab: ['now', 'away', 'people', 'threads', 'settings'],
      tone: ['ink', 'paper'],
      size: ['s', 'm', 'l']
    }
  };
  // 幂等登记（filter+concat）：重复登记在 settingsBus.selfCheck() 里是 error 级阻断项。
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) {
    return !r || r.key !== KEY;
  }).concat([journalReg]);
  let pref = { tab: 'now', tone: 'ink', size: 'm', seen: null };
  try {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const v = WA.settingsBus.read(journalReg);
      if (v && typeof v === 'object') pref = Object.assign(pref, v);
    }
  } catch (e) {}
  if (!TABS.some(x => x.id === pref.tab)) pref.tab = 'now';
  if (['ink', 'paper'].indexOf(pref.tone) < 0) pref.tone = 'ink';
  if (['s', 'm', 'l'].indexOf(pref.size) < 0) pref.size = 'm';
  function save() {
    try {
      if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
        const r = WA.settingsBus.saveOrThrow(journalReg, pref);
        if (r && r.ok === false && WA.log) WA.log('warn', 'ui.journal: 手札偏好未落盘（' + (r.reason || '?') + '，本次会话内仍生效）', null);
        return r || { ok: false };
      }
      if (WA.log) WA.log('warn', 'ui.journal: 手札偏好未落盘——设置总线未装载（本次会话内仍生效）', null);
    } catch (e) {
      if (WA.log) WA.log('warn', 'ui.journal: 手札偏好写盘异常', e);
    }
    return { ok: false };
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = v => Array.isArray(v) ? v : [];
  const obj = v => (v && typeof v === 'object') ? v : {};
  const txt = (x, keys) => x == null ? '' : (typeof x !== 'object' ? String(x) : String(keys.map(k => x[k]).find(Boolean) || ''));
  function state() { try { return (WA.store && WA.store.get && WA.store.get()) || {}; } catch (e) { return {}; } }
  function devMode() { try { return !!(WA.ui && WA.ui.devMode && WA.ui.devMode()); } catch (e) { return false; } }

  // 世界刻度：用各列表长度作「读到哪」的游标（只增不减的环形列表在截断后会偏小，故取 max 保守）
  function marks(s) {
    return {
      chron: arr(s.chronicle).length, facts: arr(s.worldFacts).length,
      fs: arr(obj(s.memory).foreshadows).length, rum: arr(s.rumors).length + arr(obj(s.evolution).winds).length
    };
  }
  function unread(s) {
    const m = marks(s), p = pref.seen;
    if (!p) return { chron: 0, facts: 0, fs: 0, rum: 0, any: 0 };
    const u = { chron: Math.max(0, m.chron - p.chron), facts: Math.max(0, m.facts - p.facts), fs: Math.max(0, m.fs - p.fs), rum: Math.max(0, m.rum - p.rum) };
    u.any = u.chron + u.facts + u.fs + u.rum; return u;
  }
  let openUnread = { chron: 0, facts: 0, fs: 0, rum: 0, any: 0 };   // 本次打开时冻结，阅读中不跳动

  // ── 视觉零件 ──
  const IC = {
    now: '<path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8"/>',
    away: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16"/>',
    people: '<circle cx="9" cy="9" r="3"/><path d="M3 19c0-3 3-5 6-5s6 2 6 5"/><path d="M16 6a3 3 0 0 1 0 6M21 19c0-2-1.5-4-4-4.7"/>',
    threads: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    quill: '<path d="M4 20l7-7"/><path d="M20 4c-6 0-11 5-12 11l1 1c6-1 11-6 11-12z"/>'
  };
  const icon = (k, n) => '<svg viewBox="0 0 24 24" width="' + (n || 18) + '" height="' + (n || 18) + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>';
  const empty = t => '<div class="wj-empty">' + esc(t) + '</div>';
  const NEW = '<i class="wj-new">新</i>';
  const sec = (title, inner, extra) => '<section class="wj-sec"><h3>' + esc(title) + (extra || '') + '</h3>' + inner + '</section>';
  const cite = t => t ? '<button class="wj-cite" data-cite="' + esc(t) + '" aria-label="带进对话" title="带进对话">' + icon('quill', 14) + '</button>' : '';
  const isNew = (i, n) => i < n;   // 列表已倒序：前 n 条即新

  // ── 五页 ──
  function pageNow(s) {
    const clock = obj(s.clock), bg = txt(s.background, ['text']);
    const facts = arr(s.worldFacts).slice(-5).reverse();
    const currents = arr(s.currents).filter(c => c && c.visibility !== 'hidden').slice(0, 3);
    const nPeople = Object.keys(obj(s.people)).length;
    if (!clock.label && !bg && !facts.length && !nPeople) return onboarding();
    const wx = arr(obj(s.weather).rows).slice(-1)[0];
    const u = openUnread;
    const digest = u.any ? '<button class="wj-digest" data-tab="away"><b>你不在时</b><span>'
      + [u.chron && ('发生了 ' + u.chron + ' 件事'), u.rum && (u.rum + ' 条新风声'), u.facts && (u.facts + ' 条事实落定'), u.fs && ('埋下 ' + u.fs + ' 处伏笔')].filter(Boolean).join('，')
      + '</span><em>去看看 →</em></button>' : '';
    const hero = '<div class="wj-hero"><div class="wj-kicker">世界时间' + (clock.dayIndex ? ' · 第 ' + esc(clock.dayIndex) + ' 日' : '') + '</div>'
      + '<div class="wj-time">' + esc(clock.label || '尚未设定') + '</div>'
      + (wx ? '<div class="wj-weather">' + esc((wx.place ? wx.place + ' · ' : '') + (wx.kind || '')) + '</div>' : '')
      + '<div class="wj-busy" hidden>世界正在推演…</div></div>';
    const brew = currents.length
      ? currents.map(c => { const t = c.public_trace || c.summary || ''; return '<div class="wj-row"><div class="wj-row-main"><b>' + esc(c.title || '一股暗流') + '</b><span>' + esc(t) + '</span></div>' + cite((c.title || '') + '：' + t) + '</div>'; }).join('')
      : empty('暂时风平浪静。');
    const factHtml = facts.length
      ? facts.map((f, i) => '<div class="wj-row"><div class="wj-row-main"><b>' + esc(f.key || '') + (isNew(i, u.facts) ? NEW : '') + '</b><span>' + esc(f.value || '') + '</span></div></div>').join('')
      : empty('还没有落定的世界事实——聊几轮之后，这里会逐渐写满。');
    return hero + digest + (bg ? sec('世界背景', '<details class="wj-more"><summary><p class="wj-prose wj-clamp">' + esc(bg) + '</p><span>展开</span></summary><p class="wj-prose">' + esc(bg) + '</p></details>') : '')
      + sec('正在酝酿', brew) + sec('已经落定', factHtml);
  }
  function onboarding() {
    const step = (n, t, d, btn) => '<li><span class="wj-step">' + n + '</span><div><b>' + t + '</b><p>' + d + '</p>' + (btn || '') + '</div></li>';
    return '<div class="wj-hero"><div class="wj-kicker">一本空白的手札</div><div class="wj-time">世界还没开始转动</div></div>'
      + '<ol class="wj-steps">'
      + step(1, '接上一条 API 通道', '世界要靠一个模型来推演。接上任意一个就能开始。', '<button class="wj-btn wj-btn-sm" data-wj="open-connect">去配置</button>')
      + step(2, '照常聊几轮', '每轮回复后，世界会在后台结算镜头外的变化。', '')
      + step(3, '回来翻开手札', '人物、风声、伏笔会自己出现在这里。', '')
      + '</ol>';
  }

  function pageAway(s) {
    const u = openUnread;
    const chron = arr(s.chronicle).slice(-12).reverse();
    const ev = obj(s.evolution);
    const winds = arr(s.rumors).concat(arr(ev.winds)).slice(-6).reverse();
    const factions = arr(ev.factions).slice(0, 8);
    const log = chron.length
      ? '<ol class="wj-timeline">' + chron.map((c, i) => '<li class="' + (isNew(i, u.chron) ? 'is-new' : '') + '"><div class="wj-tl-head"><b>' + esc(c.title || c.kind || '记事') + (isNew(i, u.chron) ? NEW : '') + '</b>' + cite((c.title || '') + (c.summary ? '：' + c.summary : '')) + '</div>'
        + (c.summary ? '<div class="wj-tl-body">' + esc(c.summary) + '</div>' : '') + '</li>').join('') + '</ol>'
      : empty('你不在的地方，还没有发生值得记下的事。');
    const wind = winds.length
      ? winds.map((w, i) => { const t = txt(w, ['text', 'content', 'summary', 'title']); return '<div class="wj-quote' + (isNew(i, u.rum) ? ' is-new' : '') + '"><p>' + esc(t) + '</p>' + cite('听说' + t) + '</div>'; }).join('')
      : empty('街头巷尾还没有传开什么。');
    const TONE = { '鼎盛': 'up', '稳固': 'up', '倾轧': 'mid', '困顿': 'down', '衰落': 'down', '瓦解': 'down' };
    const fac = factions.length ? '<div class="wj-chips">' + factions.map(f => '<span class="wj-chip wj-t-' + (TONE[f.status] || 'mid') + '">' + esc(f.name || '?') + (f.status ? '<i>' + esc(f.status) + '</i>' : '') + '</span>').join('') + '</div>' : '';
    return sec('镜头之外', log) + sec('风声', wind) + (fac ? sec('各方势力', fac) : '');
  }

  function bond(p) {
    const rel = arr(obj(p.profile).relations);
    const r = rel.find(x => /user|player|玩家|主角|你/i.test(String(x.target || ''))) || rel[0];
    if (!r) return '';
    const bar = (label, v) => { const n = Math.max(0, Math.min(100, Number(v) || 0)); return '<div class="wj-meter"><span>' + label + '</span><i><b style="width:' + n + '%"></b></i></div>'; };
    return '<div class="wj-meters">' + bar('亲近', r.intimacy) + bar('信任', r.trust) + (Number(r.hostility) > 20 ? bar('敌意', r.hostility).replace('wj-meter"', 'wj-meter wj-meter-hot"') : '') + '</div>';
  }
  function pagePeople(s) {
    const ppl = Object.values(obj(s.people)).filter(Boolean);
    if (!ppl.length) return sec('人物', empty('还没有登记的人物。角色在正文里出场后，会自动出现在这里。'));
    ppl.sort((a, b) => (b.lastSeenAt || b.updatedAt || 0) - (a.lastSeenAt || a.updatedAt || 0));
    const top = ppl[0].lastSeenAt || 0;
    const here = [], away = [], gone = [];
    ppl.forEach((p, i) => { const ls = p.lastSeenAt || 0; (i < 3 && ls && ls === top ? here : (!p.location || /不明|未知/.test(p.location) ? gone : away)).push(p); });
    const card = p => {
      const name = p.name || p.id || '无名';
      const known = Object.keys(obj(p.knowledge)).length;
      const meta = [p.location && ('在 ' + p.location), p.action].filter(Boolean).join(' · ');
      return '<details class="wj-card"><summary><span class="wj-avatar">' + esc(String(name).slice(0, 1)) + '</span>'
        + '<span class="wj-card-main"><b>' + esc(name) + '</b><span class="wj-sub">' + esc(meta || '行踪未知') + '</span></span><span class="wj-chev"></span></summary>'
        + '<div class="wj-card-body">' + bond(p)
        + (p.intent ? '<div class="wj-kv"><span>打算</span><p>' + esc(txt(p.intent, ['text', 'summary'])) + '</p></div>' : '')
        + (p.innerVoice ? '<div class="wj-kv"><span>心声</span><p class="wj-italic">' + esc(txt(p.innerVoice, ['text'])) + '</p></div>' : '')
        + '<div class="wj-kv"><span>所知</span><p>' + (known ? '知道 ' + known + ' 件事——不会知道更多' : '对局势所知甚少') + '</p></div>'
        + '</div></details>';
    };
    const group = (t, list) => list.length ? sec(t, list.map(card).join(''), '<em>' + list.length + '</em>') : '';
    return '<input class="wj-search" type="search" placeholder="找人…" aria-label="搜索人物" data-wj="find"/>'
      + '<div id="wj-people">' + group('就在身边', here) + group('在别处', away) + group('久未露面', gone) + '</div>';
  }

  function pageThreads(s) {
    const u = openUnread;
    const all = arr(obj(s.memory).foreshadows);
    const fs = all.map((f, i) => ({ f: f, i: i })).filter(x => x.f && x.f.status !== 'dropped' && x.f.status !== 'recycled').reverse();
    const LBL = { waiting: '埋下', developing: '发展中', triggered: '已触发' };
    const direct = arr(s.directEvents).filter(e => e && e.status === 'active');
    const evs = arr(obj(s.evolution).events).slice(-6).reverse();
    let ch = null; try { ch = WA.chapters && WA.chapters.current && WA.chapters.current(); } catch (e) {}
    const chHtml = ch ? '<div class="wj-hero wj-hero-sm"><div class="wj-kicker">当前章节</div><div class="wj-title">' + esc(ch.title || ch.name || '未命名章节') + '</div></div>' : '';
    const order = { triggered: 0, developing: 1, waiting: 2 };
    fs.sort((a, b) => (order[a.f.status] ?? 3) - (order[b.f.status] ?? 3));
    const fsHtml = fs.length
      ? fs.map(x => '<div class="wj-row"><span class="wj-tag wj-tag-' + esc(x.f.status) + '">' + esc(LBL[x.f.status] || x.f.status) + '</span><div class="wj-row-main"><span>' + esc(x.f.content || '') + (x.i >= all.length - u.fs ? NEW : '') + '</span></div>' + cite('（伏笔）' + (x.f.content || '')) + '</div>').join('')
      : empty('没有悬而未决的伏笔。');
    const evHtml = direct.length + evs.length
      ? direct.map(e => '<div class="wj-row wj-row-hot"><div class="wj-row-main"><b>' + esc(e.title || e.name || '突发事件') + '</b><span>正在发生</span></div></div>').join('')
        + evs.map(e => '<div class="wj-row"><div class="wj-row-main"><b>' + esc(e.title || e.name || '事件') + '</b><span>' + esc(e.stage || e.status || '') + '</span></div></div>').join('')
      : empty('目前没有进行中的事件。');
    return chHtml + sec('事件', evHtml) + sec('未收的伏笔', fsHtml, fs.length ? '<em>' + fs.length + ' 处待收</em>' : '');
  }

  function pageSettings() {
    const seg = (key, opts) => '<div class="wj-seg" role="radiogroup">' + opts.map(o => '<button role="radio" aria-checked="' + (pref[key] === o[0]) + '" data-pref="' + key + ':' + o[0] + '">' + o[1] + '</button>').join('') + '</div>';
    return sec('推演', '<button class="wj-btn wj-btn-primary" data-wj="simulate">让世界走一步</button><p class="wj-hint">平时每轮回复后会自动推演，这里可以手动补一次。</p><div class="wj-out" id="wj-out" role="status"></div>')
      + sec('阅读', '<div class="wj-field"><span>底色</span>' + seg('tone', [['ink', '墨'], ['paper', '纸']]) + '</div><div class="wj-field"><span>字号</span>' + seg('size', [['s', '小'], ['m', '中'], ['l', '大']]) + '</div>')
      + sec('连接与机制', '<button class="wj-btn" data-wj="open-connect">配置 API 通道<span>›</span></button><button class="wj-btn" data-wj="open-settings">机制开关与强度<span>›</span></button>')
      + sec('高级', '<label class="wj-switch"><input type="checkbox" data-wj="dev" ' + (devMode() ? 'checked' : '') + '/><span></span>开发者模式</label><p class="wj-hint">开启后仍从 ◈ 进手札，但会多出「打开完整面板」这一条路（给作者和调试用：世界的每一个零件都在那里）。</p>');
  }
  const PAGES = { now: pageNow, away: pageAway, people: pagePeople, threads: pageThreads, settings: pageSettings };

  // ── 外壳 ──
  let root = null, lastFocus = null, busy = false;
  function build() {
    if (root) return root;
    root = doc.createElement('div');
    root.id = 'wa-journal'; root.className = 'wj-hidden';
    root.innerHTML = '<div class="wj-scrim" data-wj="close"></div>'
      + '<div class="wj-sheet" role="dialog" aria-modal="true" aria-label="世界手札" tabindex="-1">'
      + '<header class="wj-head"><span class="wj-brand">世界手札</span><button class="wj-icon" data-wj="close" aria-label="关闭">' + icon('close') + '</button></header>'
      + '<main class="wj-body"></main>'
      + '<nav class="wj-nav" role="tablist">' + TABS.map(t => '<button role="tab" data-tab="' + t.id + '">' + icon(t.id) + '<span>' + t.label + '</span><i class="wj-dot"></i></button>').join('') + '</nav>'
      + '<div class="wj-toast" role="status"></div></div>';
    doc.body.appendChild(root);
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', trap);
    swipe(root.querySelector('.wj-body'));
    return root;
  }
  function render() {
    if (!root || root.classList.contains('wj-hidden')) return;
    root.dataset.tone = pref.tone; root.dataset.size = pref.size;
    const body = root.querySelector('.wj-body');
    let html = '';
    try { html = PAGES[pref.tab](state()); } catch (e) { html = empty('这一页暂时打不开。可以在设置里打开开发者模式看看原因。'); }
    body.innerHTML = '<div class="wj-page">' + html + '</div>';
    const b = body.querySelector('.wj-busy'); if (b) b.hidden = !busy;
    const u = openUnread;
    const dots = { away: u.chron + u.rum, now: u.facts, threads: u.fs };
    root.querySelectorAll('.wj-nav button').forEach(x => {
      const on = x.dataset.tab === pref.tab;
      x.classList.toggle('on', on); x.setAttribute('aria-selected', on);
      x.classList.toggle('has-new', !on && dots[x.dataset.tab] > 0);
    });
  }
  function go(id) { if (!PAGES[id] || id === pref.tab) return; pref.tab = id; save(); render(); root.querySelector('.wj-body').scrollTop = 0; }
  function open(show) {
    build();
    const vis = show !== undefined ? show : root.classList.contains('wj-hidden');
    const s = state();
    if (vis) {
      openUnread = unread(s);
      lastFocus = doc.activeElement;
      root.classList.remove('wj-hidden'); render();
      setTimeout(() => { try { root.querySelector('.wj-sheet').focus(); } catch (e) {} }, 30);
    } else {
      root.classList.add('wj-hidden');
      pref.seen = marks(s); save(); badge();                 // 合上 = 读过
      try { lastFocus && lastFocus.focus && lastFocus.focus(); } catch (e) {}
    }
  }
  function toast(t) { const o = root && root.querySelector('.wj-toast'); if (!o) return; o.textContent = t; o.classList.add('on'); clearTimeout(o.__t); o.__t = setTimeout(() => o.classList.remove('on'), 2200); }
  function say(t) { const o = root && root.querySelector('#wj-out'); if (o) o.textContent = t; }
  function openFull(page) { open(false); try { WA.ui && WA.ui.open && WA.ui.open(); page && WA.ui.goPage && WA.ui.goPage(page); } catch (e) {} }

  // 带进对话：追加到酒馆输入框，不自动发送（玩家自己决定怎么接）
  function citeToChat(t) {
    const ta = doc.getElementById('send_textarea');
    if (!ta) { toast('没找到对话输入框'); return; }
    const line = '（' + String(t).replace(/[（）]/g, '') + '）';
    ta.value = (ta.value ? ta.value.replace(/\s*$/, '') + '\n' : '') + line;
    try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    toast('已放进输入框');
  }

  function onClick(e) {
    const t = e.target.closest('[data-tab],[data-wj],[data-cite],[data-pref]');
    if (!t) return;
    if (t.dataset.cite) { e.preventDefault(); citeToChat(t.dataset.cite); return; }
    if (t.dataset.tab) { go(t.dataset.tab); return; }
    if (t.dataset.pref) { const [k, v] = t.dataset.pref.split(':'); pref[k] = v; save(); render(); return; }
    const a = t.dataset.wj;
    if (a === 'close') open(false);
    else if (a === 'open-connect') openFull('connect');
    else if (a === 'open-settings') openFull('settings');
    else if (a === 'simulate') simulate(t);
  }
  function simulate(btn) {
    if (busy) return;
    const p = (function () { try { return WA.backstage && WA.backstage.forceSimulate ? WA.backstage.forceSimulate() : null; } catch (e) { return Promise.reject(e); } })();
    if (!p) { say('世界还推不动：先在「配置 API 通道」里接上一个模型。'); return; }
    btn.disabled = true; btn.textContent = '世界正在走…'; say('');
    Promise.resolve(p).then(r => say(r && r.ok === false ? ('没走成：' + (r.reason || '未知原因')) : '世界走了一步。去「远方」看看发生了什么。'),
      err => say('没走成：' + ((err && err.message) || err)))
      .finally(() => { btn.disabled = false; btn.textContent = '让世界走一步'; });
  }
  function onChange(e) {
    if (e.target.dataset.wj !== 'dev') return;
    try { WA.ui && WA.ui.setDevMode && WA.ui.setDevMode(e.target.checked); } catch (err) {}
    if (e.target.checked) openFull('overview');
  }
  function onInput(e) {
    if (e.target.dataset.wj !== 'find') return;
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('#wj-people .wj-card').forEach(c => { c.hidden = !!q && c.textContent.toLowerCase().indexOf(q) < 0; });
    root.querySelectorAll('#wj-people .wj-sec').forEach(s => { s.hidden = !s.querySelector('.wj-card:not([hidden])'); });
  }
  function trap(e) {
    if (e.key === 'Escape') { open(false); return; }
    if (e.key !== 'Tab') return;
    const f = Array.from(root.querySelectorAll('button,input,summary,[tabindex="-1"]')).filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  // 手机左右滑切页（横向位移明显大于纵向才算，避免误触滚动）
  function swipe(el) {
    let x0 = 0, y0 = 0;
    el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const i = TABS.findIndex(t => t.id === pref.tab), j = i + (dx < 0 ? 1 : -1);
      if (TABS[j]) go(TABS[j].id);
    }, { passive: true });
  }

  // ── 悬浮球：接管点击 + 状态点 + 未读点 ──
  function orb() { return doc.getElementById('wa-orb'); }
  function badge() { const o = orb(); if (o) o.toggleAttribute('data-wj-new', unread(state()).any > 0 && !(root && !root.classList.contains('wj-hidden'))); }
  function hookOrb() {
    const o = orb();
    if (!o || o.__wjHooked) return !!o;
    o.__wjHooked = true;
    // 不拦截原实现的 pointerup：拦了会让 panel.js 的 drag 标记卡在 true（之后鼠标一动球就跟着走）。
    //   做法：让原实现照常跑完（它会 toggle 原面板），本监听器注册在其后、同一次派发内
    //   把原面板收回、改开手札 —— 同步完成，不会闪出原面板。
    let sx = 0, sy = 0;
    o.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; }, true);
    o.addEventListener('pointerup', e => {
      // v2.542.25：**开发者模式不再是「点球没反应」的死路**。
      //   旧行为：devMode 开启时直接 return ⇒ 球交给 panel.js 的老 toggle（开完整面板）。
      //   这在作者机上等于「手札永远打不开」，而玩家分不清「手札坏了」与「开关是开的」。
      //   现行为：两种模式都开手札；手札设置页本来就有 openFull 通往完整面板（data-wj="open-settings"
      //   与「开发者模式」开关本身），所以「交回机制面板」这条路一条没少。
      //   拖拽仍不触发（|dx|+|dy| > 5），那条与模式无关。
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 5) return;
      const pnl = doc.getElementById('wa-panel');
      if (pnl && !pnl.classList.contains('wa-hidden')) pnl.classList.add('wa-hidden');
      open();
    });
    o.setAttribute('aria-label', '打开世界手札');
    return true;
  }
  function setBusy(v, warn) {
    busy = v; const o = orb(); if (o) o.setAttribute('data-wj-state', v ? 'busy' : (warn ? 'warn' : ''));
    const b = root && root.querySelector('.wj-busy'); if (b) b.hidden = !v;
  }
  function listen() {
    if (typeof WA.on !== 'function') return;
    WA.on('backstage:started', () => setBusy(true));
    WA.on('backstage:settled', () => { setBusy(false); badge(); render(); });
    WA.on('backstage:failed', () => setBusy(false, true));
    ['clock:changed', 'registry:changed', 'chapters:changed'].forEach(ev => WA.on(ev, () => { badge(); render(); }));
    WA.on('chat:changed', () => { pref.seen = null; save(); badge(); render(); });   // 换聊天 = 换世界，刻度重置
  }
  // ── v2.542.25：接管不再只靠一条 60×500ms（30s）的轮询 ──
  //   现场实测（真 Chromium + 真手机 UA 跑本仓 ST）：WA.ui.mount() 到 t≈15s 才建出 #wa-orb，
  //   窗口内用户点球 → 面板照旧被人知道；但一旦建球晚于窗口（真机更慢时完全可能），
  //   hookOrb 永久失败 ⇒ 球停在 panel.js 的原行为（点开的是老面板），玩家看到的是
  //   「UI 还是老的、点了像没反应」。四条进门，任一先到都接上，接上就停：
  //     ① 事件：panel.js 建完球广播 'wa:orb-ready'（零延迟，已就绪时立刻派发）；
  //     ② 观察：MutationObserver 等 #wa-orb 进 DOM（事件早于本模块装载时的兜底）；
  //     ③ 轮询：窗口 30s → 5min（不是判据，只是最后一道保险，不承载「该不该接管」的事实）；
  //     ④ listen() 只在首次接上时跑一次（重复调用会重复订阅同一批事件）。
  let hooked = false, tries = 0;
  function tryHook() {
    if (hooked) return true;
    if (!hookOrb()) return false;
    hooked = true;
    listen();
    if (!pref.seen) { pref.seen = marks(state()); save(); }
    badge();
    return true;
  }
  if (typeof WA.on === 'function') WA.on('wa:orb-ready', function () { tryHook(); });
  try {
    const MO = (typeof MutationObserver !== 'undefined') ? MutationObserver
      : (typeof win !== 'undefined' && win.MutationObserver ? win.MutationObserver : null);
    if (MO && doc.body) {
      const mo = new MO(function () { if (tryHook() && mo && mo.disconnect) mo.disconnect(); });
      mo.observe(doc.body, { childList: true, subtree: true });
      if (tryHook() && mo.disconnect) mo.disconnect();
    }
  } catch (e) { /* 观察器不可用不阻断轮询那一道 */ }
  (function wait() { if (tryHook()) return; if (++tries < 600) setTimeout(wait, 500); })();

  WA.journal = { open: open };
})();
