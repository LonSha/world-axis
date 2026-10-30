/**
 * WorldAxis engines/first-run.js (v2.271.0) — 第一次开局的三步引导 (EXV6-7)
 *
 * ── 它治什么（缺口，探针 tools/v6probes/p_firstrun.js 立据）────────────────
 *   插件装好之后，玩家的真实处境是「一百项机制在跑，但世界是空的」：
 *     ① 出厂 `apiRouter.getChannel('default')` 三字段全空（baseUrl / apiKey / model）；
 *     ② 出厂 `capabilityTier.getSettings().tier === 'lite'`（100 项机制只跑 5 项）；
 *     ③ 出厂 `store.lastInjection` 不存在、`evolution.round === 0`（一句话都没说过）。
 *   三件事**都有真读数**，但它们分散在三个模块里，且没有任何一处把它们摆成
 *   「你现在在第几步、下一步做什么」——玩家拿到的是一个能跑但不出内容的世界，
 *   最常见的反应是「插件坏了」，而真实的处置动作只是「按顺序做三件事」。
 *
 * ── 三态，不是两态（本模块的核心纪律）──────────────────────────────────
 *   每一步的读数是**三态**：`done` / `todo` / `cannot-tell`。
 *   `cannot-tell`（那个读数口整个不在场）**既不算做完、也不算没做**：
 *   折成 `todo` 会把「测不到」写成「你没做」（冤枉玩家），
 *   折成 `done` 会把「没测过」写成「已经好了」（这正是本仓反复治的假绿）。
 *   判不出时如实带 `why`，并把该步标成可**手动勾选**（玩家自己知道做没做）。
 *
 * ── 完成状态落哪里（计划原文：落设置族，不落世界键）────────────────────
 *   「哪一步玩家确认过」记在 `worldaxis_first_run_settings_v1`（设置族），
 *   **不写 store**。理由：它描述的是**这个人**的装机进度，不是这个世界里发生的事 ——
 *   写进存档会被导出/分享带给别人（别人明明配过自己的 API，却看到「已配」）。
 *   ⚠ 手勾只对 `cannot-tell` 生效：环境判得出时**以环境为准**，手勾不许覆盖真读数
 *   （否则「我点过勾了」会盖住「其实还没配」——那是把确认当事实）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────────────
 *   · 纯读 + 只写自己的设置族：零 `store.transact`、零别的引擎的 `setSettings`；
 *   · 不代替玩家动手：`next()` 只**给出口**（面板据此绑按钮），本模块不自己切档、不自己写 API；
 *   · 不检测「宿主里有没有配好 API 并可用」：只读 `apiRouter` 的配置字段，
 *     回落到 Tavern 代理时如实标 `via-proxy` 而不猜「能不能通」；
 *   · 不落盘进度以外的任何东西。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_first_run_settings_v1';
  const DEF = {
    enabled: true,
    dismissed: false,    // 玩家点了「知道了，别再提示」
    doneApi: false,      // 手动确认（仅当环境判不出时生效）
    doneTier: false,
    doneTalk: false,
    showWhenDone: false  // 三步都做完后还要不要留在概览页（默认不留）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'firstRun', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const raw = WA.settingsBus.read(__REG);
      const merged = Object.assign({}, DEF, raw || {});
      return typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
    }
    return Object.assign({}, DEF);
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }

  const __stat = {
    builds: 0, cold: 0, warm: 0, dismissedBuilds: 0, disabled: 0,
    apiCannotTell: 0, tierCannotTell: 0, talkCannotTell: 0, lastState: ''
  };
  function safe(fn, fb) { try { const r = fn(); return (r === undefined) ? fb : r; } catch (e) { return fb; } }

  /** ── 第 1 步：API 配了没有（真读数：apiRouter.getChannel 的三个字段）──
   *  三态：`configured` / `unconfigured` / `cannot-tell`（apiRouter 缺席）。
   *  走 Tavern 代理时 `baseUrl` 可以是空的（请求由宿主代发），故把
   *  `useTavernProxy` 也算一条通路 —— 只如实标 `via-proxy`，不猜能不能通。
   */
  function probeApi() {
    const R = WA.apiRouter;
    if (!R || typeof R.getChannel !== 'function') {
      return { state: 'cannot-tell', why: 'no-api-router', detail: null };
    }
    const chans = Array.isArray(R.CHANNELS) ? R.CHANNELS.slice() : ['default'];
    let configured = [], viaProxy = [], seen = 0;
    chans.forEach(function (name) {
      const c = safe(function () { return R.getChannel(name); }, null);
      if (!c || typeof c !== 'object') return;
      seen++;
      const hasUrl = !!(c.baseUrl && String(c.baseUrl).length);
      const hasKey = !!(c.apiKey && String(c.apiKey).length);
      const proxy = c.useTavernProxy === true;
      if ((hasUrl && hasKey) || proxy) configured.push(name);
      if (proxy) viaProxy.push(name);
    });
    if (seen === 0) return { state: 'cannot-tell', why: 'no-channel-readable', detail: null };
    return {
      state: configured.length ? 'configured' : 'unconfigured',
      why: null,
      detail: { channels: chans.length, configured: configured, viaProxy: viaProxy,
        note: viaProxy.length ? '走宿主代理：配置字段可以是空的，本模块不判「能不能通」' : null }
    };
  }

  /** ── 第 2 步：档位选了没有（真读数：capabilityTier 的设置与视图）── */
  function probeTier() {
    const T = WA.capabilityTier;
    if (!T || typeof T.getSettings !== 'function') {
      return { state: 'cannot-tell', why: 'no-capability-tier', detail: null };
    }
    const cfg = safe(function () { return T.getSettings(); }, null);
    if (!cfg || typeof cfg !== 'object') return { state: 'cannot-tell', why: 'tier-unreadable', detail: null };
    const granted = Array.isArray(cfg.granted) ? cfg.granted.length : 0;
    const history = Array.isArray(cfg.history) ? cfg.history.length : 0;
    const v = safe(function () { return typeof T.view === 'function' ? T.view() : null; }, null);
    // 「选过档位」的判据：不是出厂 lite，**或**手上有 granted 机制，**或**有过一次切换历史。
    const chosen = (cfg.tier && cfg.tier !== 'lite') || granted > 0 || history > 0;
    return {
      state: chosen ? 'done' : 'todo',
      why: null,
      detail: { tier: cfg.tier || null, granted: granted, history: history,
        running: v ? (Number(v.running) || 0) : null, mechanisms: v ? (Number(v.mechanisms) || 0) : null }
    };
  }

  /** ── 第 3 步：说过第一句话没有（真读数：注入快照 / 演化回合）──
   *  两条通路任一成立即为 `done`：`store.lastInjection` 存在（注入链真跑过）
   *  或 `evolution.round > 0`（世界真被推演过）。缺 store ⇒ cannot-tell。
   */
  function probeTalk() {
    if (!(WA.store && typeof WA.store.get === 'function')) {
      return { state: 'cannot-tell', why: 'no-store', detail: null };
    }
    const d = safe(function () { return WA.store.get(); }, null);
    if (!d || typeof d !== 'object') return { state: 'cannot-tell', why: 'store-unreadable', detail: null };
    const li = (d.lastInjection && typeof d.lastInjection === 'object') ? d.lastInjection : null;
    const round = (d.evolution && typeof d.evolution.round === 'number') ? d.evolution.round : null;
    const said = !!li || (round !== null && round > 0);
    return {
      state: said ? 'done' : 'todo',
      why: null,
      detail: { injected: !!li, round: round,
        injectedAt: li ? (li.at || null) : null,
        clockLabel: (d.clock && d.clock.label) ? String(d.clock.label).slice(0, 32) : null }
    };
  }

  /**
   * 三步的**态域归一**：各 probe 按各自的语义说话（`configured` / `unconfigured` /
   * `todo` / `done` / `cannot-tell`），build() 只认三态。归一必须显式写在一处 ——
   * 第一版漏了这一步：`probeApi` 返回 `configured`/`unconfigured`，而 build() 用
   * `x.state === 'done'` 数完成数，于是「API 明明配好了」也被数成未完成
   * （且 `unconfigured` 与 `todo` 在 `x.state !== 'done'` 下恰好同义，缺陷只在一半上显形）。
   * 这正是「同一件事两套词汇」的经典形态：判据不报错，读数悄悄错了。
   */
  function normState(s) {
    if (s === 'done' || s === 'configured') return 'done';
    if (s === 'todo' || s === 'unconfigured') return 'todo';
    return 'cannot-tell';
  }
  const STEPS = [
    { id: 'api', order: 1, title: '配一个 API', why: '没有它，插件不会说话',
      probe: probeApi, exit: { do: 'openSettings', hint: '在设置页「接口」一格填 Base URL / API Key / 模型' } },
    { id: 'tier', order: 2, title: '选一个档位', why: '100 项机制出厂只跑 5 项',
      probe: probeTier, exit: { do: 'applyTier', arg: 'standard', hint: '在设置页顶部切「标准」档，一次多开一批机制' } },
    { id: 'talk', order: 3, title: '说第一句话', why: '世界要等你开口才动',
      probe: probeTalk, exit: { do: 'openOverview', hint: '回到对话，随便说一句（推演随即开始）' } }
  ];

  /**
   * 三步状态（纯读）。每步的最终态 = **环境判据优先，手勾只兜 cannot-tell**。
   * @returns {{ok:boolean, steps:Array, doneCount:number, pendingId:string, cold:boolean}}
   */
  function build(opts) {
    const cfg = Object.assign({}, settings(), opts || {});
    __stat.builds++;
    if (cfg.enabled !== true) {
      __stat.disabled++; __stat.lastState = 'disabled';
      return { ok: false, reason: 'disabled', steps: [], doneCount: 0, pendingId: null,
        cold: false, line: '开局引导已停用（设置页可开）' };
    }
    const manual = { api: cfg.doneApi === true, tier: cfg.doneTier === true, talk: cfg.doneTalk === true };
    const steps = STEPS.map(function (s) {
      const p = safe(function () { return s.probe(); }, { state: 'cannot-tell', why: 'probe-threw', detail: null });
      const envState = normState((p && p.state) || 'cannot-tell');
      let finalState = envState, source = 'env';
      if (envState === 'cannot-tell') {
        // ★ 只在这一档手勾才说话 —— 环境判得出时，手勾不许覆盖真读数。
        if (manual[s.id]) { finalState = 'done'; source = 'manual'; }
        else source = 'none';
        if (s.id === 'api') __stat.apiCannotTell++;
        else if (s.id === 'tier') __stat.tierCannotTell++;
        else __stat.talkCannotTell++;
      }
      return {
        id: s.id, order: s.order, title: s.title, why: s.why,
        state: finalState, envState: envState, source: source,
        why2: (p && p.why) ? p.why : null,        // 判不出的原因（cannot-tell 时才有）
        detail: (p && p.detail) ? p.detail : null,
        exit: Object.assign({}, s.exit),
        // 手动兜底只在「环境判不出」时可用；可用性也如实带出（面板据此决定是否渲染勾选框）
        manualAllowed: (envState === 'cannot-tell'),
        manualMarked: manual[s.id]
      };
    });
    const doneCount = steps.filter(function (x) { return x.state === 'done'; }).length;
    const firstPending = steps.filter(function (x) { return x.state !== 'done'; })[0] || null;
    const cold = (steps[0].state !== 'done');   // 「冷启动」= 连 API 都还没配好
    if (cold) __stat.cold++; else __stat.warm++;
    if (cfg.dismissed === true) __stat.dismissedBuilds++;
    __stat.lastState = cold ? 'cold' : (firstPending ? 'partial' : 'done');

    return {
      ok: true,
      dismissed: cfg.dismissed === true,
      cold: cold,
      steps: steps, doneCount: doneCount, total: steps.length,
      pendingId: firstPending ? firstPending.id : null,
      pending: firstPending,
      // 三步都做完且不要求保留 ⇒ 面板不渲染（这一条也在读数里，不只在面板里）
      visible: (cfg.dismissed !== true) && (cold || firstPending !== null || cfg.showWhenDone === true),
      line: line(steps, doneCount, cold)
    };
  }

  /** 人话一行（面板整行逐字取它，与其它 V6 读数模块同规）。 */
  function line(steps, doneCount, cold) {
    if (!steps || !steps.length) return '开局引导：无可读步骤';
    if (doneCount === 0 && !cold) return '开局引导：三步都还没做（世界还不会出内容）';
    if (doneCount === steps.length) return '开局引导：三步都做完了（世界该动起来了）';
    const next = steps.filter(function (x) { return x.state !== 'done'; })[0];
    return '开局引导：已做 ' + doneCount + '/' + steps.length + ' 步，下一步是「' + next.title + '」（' + next.why + '）';
  }

  /** 直达出口（只给动作，不替玩家动手）。 */
  function next(stepId) {
    const b = build();
    const s = b.steps.filter(function (x) { return x.id === (stepId || b.pendingId); })[0];
    return s ? Object.assign({ id: s.id, title: s.title }, s.exit) : null;
  }

  /** 玩家点「知道了」：只写设置族，不动世界。 */
  function dismiss() {
    const r = saveSettings({ dismissed: true });
    return (r && r.ok === false) ? r : { ok: true, dismissed: true };
  }
  function resume() {
    const r = saveSettings({ dismissed: false });
    return (r && r.ok === false) ? r : { ok: true, dismissed: false };
  }
  /** 手动勾选某一步（仅当该步环境判不出时有效；环境判得出时**拒绝写入并如实说明**）。 */
  function mark(stepId, done) {
    const b = build();
    const s = b.steps.filter(function (x) { return x.id === stepId; })[0];
    if (!s) return { ok: false, reason: 'unknown-step', step: stepId };
    if (!s.manualAllowed) {
      return { ok: false, reason: 'env-decides', state: s.envState,
        note: '这一步环境判得出（' + s.envState + '），手动标记不许覆盖真读数' };
    }
    const key = stepId === 'api' ? 'doneApi' : (stepId === 'tier' ? 'doneTier' : 'doneTalk');
    const patch = {}; patch[key] = (done !== false);
    const r = saveSettings(patch);
    return (r && r.ok === false) ? r : { ok: true, step: stepId, marked: (done !== false) };
  }
  function resetAll() {
    const r = saveSettings({ dismissed: false, doneApi: false, doneTier: false, doneTalk: false });
    return (r && r.ok === false) ? r : { ok: true };
  }

  function stat() {
    const cfg = settings();
    return {
      enabled: cfg.enabled !== false, dismissed: cfg.dismissed === true,
      builds: __stat.builds, cold: __stat.cold, warm: __stat.warm,
      dismissedBuilds: __stat.dismissedBuilds, disabled: __stat.disabled,
      apiCannotTell: __stat.apiCannotTell, tierCannotTell: __stat.tierCannotTell,
      talkCannotTell: __stat.talkCannotTell, lastState: __stat.lastState,
      sources: {
        apiRouter: !!(WA.apiRouter && typeof WA.apiRouter.getChannel === 'function'),
        capabilityTier: !!(WA.capabilityTier && typeof WA.capabilityTier.getSettings === 'function'),
        store: !!(WA.store && typeof WA.store.get === 'function')
      },
      manual: { api: cfg.doneApi === true, tier: cfg.doneTier === true, talk: cfg.doneTalk === true }
    };
  }
  function reset() {
    __stat.builds = 0; __stat.cold = 0; __stat.warm = 0; __stat.dismissedBuilds = 0;
    __stat.disabled = 0; __stat.apiCannotTell = 0; __stat.tierCannotTell = 0;
    __stat.talkCannotTell = 0; __stat.lastState = '';
    return { ok: true };
  }

  WA.firstRun = {
    DEF: Object.assign({}, DEF),
    STEPS: STEPS,
    getSettings: settings,
    setSettings: saveSettings,
    build: build,
    next: next,
    // v2.274.0：dismiss 此前是**只定义不导出**的内部函数 —— 专锁要调它、玩家却没有任何入口
    //   （「知道了」这个动作在引擎里存在、在界面上不存在）。现补出口，并在概览页接上按钮。
    dismiss: dismiss,
    resume: resume,
    mark: mark,
    resetAll: resetAll,
    stat: stat,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/first-run.js', { kind: 'engine', ver: '2.271.0' });
  }
  if (WA.log) WA.log('info', '开局引导已加载（三态只读 + 设置族进度）');
})();