/**
 * WorldAxis engines/choice-board.js (v2.325.0) — 正文里的「待选按钮」（缝合 -Galgame 的呈现半边）
 *
 * ── 它治什么（缺口，先说不重复）─────────────────────────────────
 *   `engines/story-choice.js` 已有完整的**选择权威链**：present（登记选择点，选项 ops 先过
 *   rehearsal 白名单）→ confirm（branchTree.choose 记账 + commit 三段兑现）→ review / pending。
 *   但它的入口**只有面板**：玩家得先切到机制页、手输选择点 ID、再点「确认选择」。
 *   而模型在正文里呈现的选择，玩家在聊天里**一个按钮都点不到**。
 *   于是形成典型的「能力在、入口断」：引擎能兑现，玩家够不着。
 *   本模块只补**呈现与点击**这半边，一个字都不碰选择语义。
 *
 * ── 与既有模块的分工（逐条否定式）──────────────────────────────
 *   · `story-choice` —— 选择真源。本模块**只调** `pending()` 读待选点、`review()` 取选项标签、
 *     `confirm()` 落选择；不自己记账、不自己写 store、不自己判「能不能兑现」。
 *   · `branch-tree` / `commit` / `rehearsal` —— 分叉记账 / 原子提交 / 预演校验。
 *     本模块**一次都不直接调**它们（经 story-choice 一个口进）。
 *   · `inline-tags` —— 解析正文里的 `<choice who event>…</choice>`，那是「某人已经做了什么抉择」
 *     的**历史回报**，写 chronicle。**不是**待选项。本模块不解析标签、不复用它的 choice 语义
 *     （把既成历史摆成待选按钮 = 伪造一个待选点）。
 *   · `render/theater` —— 番外剧场往输入框写折叠块。本模块写的是**一行选择文本**，
 *     且默认只写不发送；同一个 `send_textarea` 入口，两种用途各自成词。
 *
 * ── 四条边界（全是否定式）──────────────────────────────────────
 *   ① **不替玩家发言**：选完默认只把标签写进宿主输入框，**不触发发送**。自动发送等于替玩家
 *      按下发送键，而他可能还想补一句话。要自动发是调用方显式 `autoSend` 的选择，默认永不做。
 *   ② **不重建宿主消息**：只在消息元素上 `appendChild` 一个自己的 dock（带 class 标记），
 *      绝不改写 `mes_text` 的 innerHTML —— 那会连带炸掉宿主自己的格式、引用、语音条。
 *   ③ **不猜待选点**：只读 `storyChoice.pending()`。它返回 ok:false 时如实报
 *      `story-choice-unavailable`，不从正文里「看出」几个选项顶上。
 *   ④ **不静默失败**：宿主没有 `#chat`、最后一条不是消息、confirm 被拒 —— 各有自己的 reason，
 *      且当场写进 dock（玩家看得见「为什么点了没反应」）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_choice_board_settings_v1';
  // enabled 默认 **true**：本模块是纯呈现层（不写世界、不改状态）。默认关的代价是
  //   「功能等于没有」——玩家永远看不到按钮，也不会有人去设置页把它打开；
  //   默认开的代价只是「正文末尾多几个按钮」，settingsBus 里随时可关。
  //   与「写世界的能力默认关」不是同一类：那条纪律治副作用，这条只是显示。
  const DEF = { enabled: true, maxButtons: 6, autoSend: false };
  const __REG = { key: LS_KEY, def: DEF, module: 'choiceBoard',
    bounds: { maxButtons: [2, 12] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const DOCK_CLS = 'wa-choice-dock';
  const BTN_CLS = 'wa-choice-btn';
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  function getSettings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function setSettings(patch) {
    if (!WA.settingsBus) return Object.assign({}, getSettings(), patch || {});
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})));
  }
  const _stat = {
    mounts: 0, unmounts: 0, clicks: 0, confirms: 0, chosen: 0, applied: 0,
    rejects: 0, lastReason: '', lastAt: 0, faults: {}
  };
  function note(code) {
    _stat.rejects++;
    _stat.faults[code] = (_stat.faults[code] || 0) + 1;
    _stat.lastReason = code;
    _stat.lastAt = clockWall();
  }
  // ── 宿主取面（与 render/theater 同口径：主窗口优先，其次裸 document）──
  function mainDocOf() {
    try {
      return WA.mainDoc || (WA.mainWin && WA.mainWin.document)
        || (typeof document !== 'undefined' ? document : null);
    } catch (e) { return null; }
  }
  function mainWinOf() {
    try { return WA.mainWin || (typeof window !== 'undefined' ? window : null); } catch (e) { return null; }
  }
  function pick(doc, id) {
    try { return (doc && doc.getElementById) ? doc.getElementById(id) : null; } catch (e) { return null; }
  }
  /**
   * 待选点 + 选项标签（板的真值）。
   *   `pending()` 只给 `{id, prompt, round, options:数量}`（目录），按钮还需要标签（内容），
   *   故逐点再调 `review(id)` 取回 `options[{label,allowed,costs}]`。
   *   这不是重复读：面板的「未确认清单」只要目录，按钮要内容 —— 两个用途各自成词。
   * @returns {{ok:boolean, reason?:string, points:Array, cap?:number, pending?:number}}
   */
  function board() {
    if (!WA.storyChoice || typeof WA.storyChoice.pending !== 'function') {
      return { ok: false, reason: 'story-choice-unavailable', points: [] };
    }
    let p = null;
    try { p = WA.storyChoice.pending(); } catch (e) { return { ok: false, reason: 'pending-threw', points: [] }; }
    if (!p || p.ok === false) return { ok: false, reason: (p && p.reason) || 'pending-failed', points: [] };
    const cfg = getSettings();
    const maxBtn = Math.max(2, Math.min(12, Number(cfg.maxButtons) || 6));
    const points = [];
    (p.points || []).forEach(function (row) {
      if (!row || !row.id) return;
      let rv = null;
      try { rv = WA.storyChoice.review(row.id); } catch (e) { rv = null; }
      if (!rv || rv.ok === false) return;
      if (rv.choice) return;                     // 已选的不再摆（选了就该消失，不是变灰留着）
      const opts = (rv.options || []).slice(0, maxBtn).filter(function (o) { return o && o.label; });
      if (opts.length < 2) return;               // 不足两项不叫选择（与 present 的 no-options 同口径）
      points.push({
        id: rv.id, prompt: rv.prompt || '', round: rv.round || 0,
        options: opts.map(function (o) {
          return { label: o.label, allowed: o.allowed !== false, costs: o.costs || '' };
        })
      });
    });
    return { ok: true, points: points, cap: p.cap, pending: p.count };
  }
  // ── dock 生命周期：自己建的自己拆，绝不留孤儿 ──
  const _docks = [];
  function removeDock(el) {
    try {
      if (el && el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el);
    } catch (e) { /* 宿主整块重绘时节点可能已被摘走 —— 不是故障 */ }
  }
  function unmount() {
    let n = 0;
    while (_docks.length) { removeDock(_docks.pop()); n++; }
    // 兜底：宿主重绘后我们记的引用可能失效，但 DOM 里仍有带类名的节点
    try {
      const doc = mainDocOf();
      const stray = (doc && doc.querySelectorAll) ? doc.querySelectorAll('.' + DOCK_CLS) : [];
      for (let i = 0; i < stray.length; i++) { removeDock(stray[i]); n++; }
    } catch (e) { /* 查询失败不改结论 */ }
    if (n) _stat.unmounts += n;
    return n;
  }
  /**
   * 把选中标签写进宿主输入框（**只写不发**，边界①）。
   * @returns {{ok:boolean, reason?:string}}
   */
  function fillInput(text) {
    const el = pick(mainDocOf(), 'send_textarea');
    if (!el) return { ok: false, reason: 'no-input-el' };
    try {
      el.value = String(text == null ? '' : text);
      try {
        const Win = mainWinOf();
        const Ev = (Win && typeof Win.Event === 'function') ? Win.Event : (typeof Event === 'function' ? Event : null);
        if (Ev) el.dispatchEvent(new Ev('input', { bubbles: true }));
      } catch (e2) { /* 派发失败不改结论：文本已写进去 */ }
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: 'write-fail' };
    }
  }
  /** 宿主发送按钮（只在 autoSend 时用；找不到就如实 false，不假装发了）。 */
  function sendNow() {
    const el = pick(mainDocOf(), 'send_but');
    if (!el || typeof el.click !== 'function') return { ok: false, reason: 'no-send-el' };
    try { el.click(); return { ok: true }; } catch (e) { return { ok: false, reason: 'send-threw' }; }
  }
  /**
   * 点选：**唯一**落选择的口子，走 story-choice.confirm（不绕它）。
   *   三段可分离照抄：chosen 与 applied 不是同一件事，读数不许折成「成功」。
   * @returns {{ok:boolean, reason?:string, chosen?:bool, applied?:bool, receipt?:string, filled?:bool}}
   */
  function choose(pointId, label, opts) {
    const o = opts || {};
    _stat.clicks++;
    if (!WA.storyChoice || typeof WA.storyChoice.confirm !== 'function') {
      note('story-choice-unavailable');
      return { ok: false, reason: 'story-choice-unavailable' };
    }
    let r = null;
    try { r = WA.storyChoice.confirm(pointId, label, { opId: o.opId, floor: o.floor, swipe: o.swipe }); }
    catch (e) {
      note('confirm-threw');
      return { ok: false, reason: 'confirm-threw', detail: String((e && e.message) || e) };
    }
    if (!r || r.ok === false) {
      const why = (r && r.reason) || 'confirm-failed';
      note(why);
      // 拒收原因原样转出去（preview-rejected / already-confirmed / bad-value 都要看得见）
      return { ok: false, reason: why, allowed: r && r.allowed, rejects: r && r.rejects };
    }
    _stat.confirms++;
    _stat.chosen++;
    if (r.applied) _stat.applied++;
    const out = { ok: true, id: r.id, option: r.option, chosen: true, applied: !!r.applied, receipt: r.receipt || '' };
    if (o.fill !== false) {
      const f = fillInput(r.option);
      out.filled = !!f.ok;
      if (!f.ok) out.fillReason = f.reason;
    }
    if (o.autoSend === true) out.autoSend = sendNow();
    _stat.lastAt = clockWall();
    return out;
  }
  /**
   * 在宿主楼层上挂 dock。
   *   `container` 可显式传入（测试与调用方自建的消息元素）；不给则取 `#chat` 的最后一条。
   * @returns {{ok:boolean, reason?:string, mounted?:number}}
   */
  function mount(container) {
    const cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', mounted: 0 };
    const b = board();
    if (!b.ok) return { ok: false, reason: b.reason, mounted: 0 };
    if (!b.points.length) { unmount(); return { ok: true, mounted: 0, reason: 'no-pending' }; }
    const doc = mainDocOf();
    if (!doc || typeof doc.createElement !== 'function') return { ok: false, reason: 'no-doc', mounted: 0 };
    let host = container || null;
    if (!host) {
      const chat = pick(doc, 'chat');
      if (!chat) return { ok: false, reason: 'no-chat', mounted: 0 };
      const kids = (chat.querySelectorAll ? chat.querySelectorAll('.mes') : []);
      host = kids.length ? kids[kids.length - 1] : null;
      if (!host) return { ok: false, reason: 'no-message', mounted: 0 };
    }
    unmount();
    let mounted = 0;
    b.points.forEach(function (pt) {
      const dock = doc.createElement('div');
      dock.className = DOCK_CLS;
      dock.setAttribute('data-wa-choice-point', pt.id);
      if (pt.prompt) {
        const cap = doc.createElement('div');
        cap.className = DOCK_CLS + '-prompt';
        cap.textContent = pt.prompt;
        dock.appendChild(cap);
      }
      pt.options.forEach(function (op) {
        const btn = doc.createElement('button');
        btn.className = BTN_CLS;
        btn.setAttribute('type', 'button');
        btn.setAttribute('data-wa-choice-id', pt.id);
        btn.setAttribute('data-wa-choice-label', op.label);
        if (!op.allowed) {
          // 预检拒收的选项照摆但禁用：**不给玩家看不可兑现的选项**（story-choice 的原话）
          btn.disabled = true;
          btn.setAttribute('title', '这一项过不了预检（兑现不了），已置灰');
        } else {
          btn.setAttribute('title', op.costs ? ('选择「' + op.label + '」（' + op.costs + '）') : ('选择「' + op.label + '」'));
        }
        btn.textContent = op.label + (op.allowed ? '' : '（不可兑现）');
        btn.onclick = function () {
          if (btn.disabled) return;
          const r = choose(pt.id, op.label, { autoSend: cfg.autoSend === true });
          let line = dock.querySelector('.' + DOCK_CLS + '-out');
          if (!line) {
            line = doc.createElement('div');
            line.className = DOCK_CLS + '-out';
            dock.appendChild(line);
          }
          line.textContent = r.ok
            ? ('已选「' + r.option + '」·' + (r.applied ? '已兑现' : ('未兑现（回执 ' + (r.receipt || '无') + '）'))
              + (r.filled === false ? ('·输入框不可达（' + r.fillReason + '）') : '·已填进输入框，按发送即可'))
            : ('没生效：' + r.reason);
          // 选完立刻重挂：已选的点从 pending 消失，按钮必须跟着消失（不靠下一次事件）
          try { mount(container); } catch (e) { /* 重挂失败不影响已落的账 */ }
        };
        dock.appendChild(btn);
      });
      host.appendChild(dock);
      _docks.push(dock);
      mounted++;
    });
    _stat.mounts += mounted;
    _stat.lastAt = clockWall();
    return { ok: true, mounted: mounted };
  }
  function refresh(container) { return mount(container); }
  function stat() {
    const b = (function () {
      try { return board(); } catch (e) { return { ok: false, reason: 'board-threw', points: [] }; }
    })();
    return {
      mounts: _stat.mounts, unmounts: _stat.unmounts,
      clicks: _stat.clicks, confirms: _stat.confirms, chosen: _stat.chosen, applied: _stat.applied,
      rejects: _stat.rejects, lastReason: _stat.lastReason, lastAt: _stat.lastAt,
      faults: Object.assign({}, _stat.faults),
      docks: _docks.length,
      // 「没待选」与「读不到」必须分开（与 story-choice 的三态口径一致）
      boardOk: b.ok, boardReason: b.ok ? null : b.reason, pending: b.ok ? b.points.length : null,
      // 能力归属：谁给选择语义、谁给服务入口 —— 「点了没反应」要靠这一栏分得清
      owners: {
        choice: (WA.storyChoice && typeof WA.storyChoice.confirm === 'function') ? 'storyChoice.confirm' : null,
        input: pick(mainDocOf(), 'send_textarea') ? 'send_textarea' : null,
        send: pick(mainDocOf(), 'send_but') ? 'send_but' : null
      }
    };
  }
  function reset() {
    _stat.mounts = 0; _stat.unmounts = 0; _stat.clicks = 0; _stat.confirms = 0;
    _stat.chosen = 0; _stat.applied = 0; _stat.rejects = 0; _stat.lastReason = ''; _stat.faults = {};
    return { ok: true, docks: unmount() };
  }
  WA.choiceBoard = {
    VERSION: '2.325.0',
    DOCK_CLS: DOCK_CLS, BTN_CLS: BTN_CLS,
    getSettings: getSettings,
    setSettings: setSettings,
    board: board,
    mount: mount,
    refresh: refresh,
    unmount: unmount,
    choose: choose,
    stat: stat,
    reset: reset
  };
  // 自证块：导出数必须 === 12（多一个就是「为测试长的镜像面」，本仓已判过多次）
  var EXPORT_COUNT = 12;
  var _exported = Object.keys(WA.choiceBoard).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('choice-board: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/choice-board.js', { kind: 'engine', ver: '2.325.0' });
})();