/**
 * WorldAxis render/inject.js (v0.2) — 分源可见性注入
 * 接入 记忆块/舆情块/章节块 + 脉搏显示
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const mainWin = WA.mainWin || window;
  const LS_KEY = 'worldaxis_inject_visibility_v1';

  // v2.51.0（第三十六面）: 追加 'style'（叙事工艺约束）。它在 applyInjections 里有真实
  //   分支——SOURCES 的每项都必须在 def 里有默认值、且**真被读**，否则就是「声明了源
  //   却没人消费」（v2.38.0 的 echoes 正是踩过这个坑：开关点了零效果）。
  // v2.56.0: 追加 'life' / 'intel' / 'org' / 'longline'（v2.52.0~v2.55.0 新增的四条注入分支）。
  //   **这是一次真缺陷的修复**：那四条分支加进 applyInjections 时漏登记 SOURCES —— 于是它们
  //   ① 没有可见性开关（用户关不掉单个源）、② 不进 def ⇒ 逃出「声明完整性 / 子键自愈 /
  //   undeclared 记账」三重校验、③ 反向的守卫（SOURCES 有而 def 无）也照不到（两边都没有）。
  //   这恰是 SOURCES 存在的理由：源表与注入分支必须**同时**增长，任何单边增长都是静默缺口。
  //   本版同时加了一条成类锁（tests/inject-sources-v2560.js）：用正则从 applyInjections 里抽出
  //   所有 `WA.<ns>.buildBlock()` 调用点，断言其命名空间**逐一**在 SOURCES 里 —— 此后
  //   「加了注入分支忘了登记源表」在回归当场红灯。该锁同时覆盖**反向**：SOURCES 里声明了
  //   却在注入链中无任何消费点的源（v2.4.0 的 undeclared 只查 def 面，查不到这一面）。
  //   默认值取 **true**（与 style 的 false 不同）：这四面的总开关各自默认为关闭，注入本来就
  //   不会发生 —— 故这里默认 true 不会给老用户凭空多出任何约束，却避免了「开了模块却发现
  //   也要再开开关」的双闸困惑。style 之所以要 false，是因为它自己的总开关 `block` 默认为 on。
  const SOURCES = ['clock', 'background', 'people', 'currents', 'echoes', 'memory', 'opinion', 'pulse', 'ledger', 'digest', 'style',
    'life', 'intel', 'org', 'longline',
    // v2.62.0: 'causal'（因果结算）。它**必须**与注入分支同时增长（v2.56.0 立的规矩）：
    //   只加分支不加源表 = 开关点了零效果（v2.38.0 的 echoes 原样复刻），
    //   只加源表不加分支 = 声明了却没人消费。tests/inject-sources-v2560.js 两面都锁。
    // v2.63.0: 'world' / 'shadow' / 'threads'（世界织体 / 社交漩涡 / 悬案）。
    //   与 SOURCES 同批登记（只加分支不加源表 = 开关点了零效果）。
    'causal', 'world', 'shadow', 'threads',
    // v2.65.0: 'weather' / 'difficulty'。与注入分支同批登记，否则开关点了零效果。
    // v2.66.0: 'affect' / 'bonds' / 'masks'。与注入分支同批登记，否则开关点了零效果。
    'weather', 'difficulty', 'affect', 'bonds', 'masks', 'temporalLock', 'temperament', 'fondness', 'parallelEvents',
    // v2.68.0: 'eraCycle' / 'survival' / 'warrant' / 'beastBond'。与注入分支同批登记（键名 = 命名空间名）。
    'eraCycle', 'survival', 'warrant', 'beastBond',
    // v2.69.0: 'appearance' / 'ladder'。与注入分支同批登记（键名 = 命名空间名）。
    'appearance', 'ladder',
    // v2.70.0: 'sceneSlice', 'gauge', 'rivalry'
    'sceneSlice', 'gauge', 'rivalry',
    // v2.71.0: 'enigma', 'tempo', 'quota', 'spotlight'
    'enigma', 'tempo', 'quota', 'spotlight',
    // v2.72.0: 'karma', 'hazard', 'marginal', 'tolerance'
    'karma', 'hazard', 'marginal', 'tolerance',
    // v2.81.0: 'events'（事件调度）。与注入分支同批登记（键名 = 命名空间名）。
    // v2.82.0: 'checkpoints'（快照与分支）。同批登记——只加分支不加源表 = 开关点了零效果。
    'events', 'checkpoints'];
  const __REG = { key: LS_KEY, def: { clock: true, background: true, people: true, currents: true, echoes: false, memory: true, opinion: false, pulse: true, ledger: true, digest: true,
        // 默认 **false**：与 rules.craft「未开启时不额外约束」一致。默认 true 会让所有
        //   老用户凭空多出一段约束——而他们从没开过这个设置面，也看不到是哪来的。
style: false,
        // v2.56.0：四面注入源默认 true（理由见 SOURCES 上方注释——它们的模块总开关默认为关）。
        life: true, intel: true, org: true, longline: true,
        // v2.62.0：因果结算。同四条理由取默认 true（其模块总开关默认为关）。
        // v2.63.0：世界织体 / 社交漩涡 / 悬案。同四条理由取默认 true（其模块总开关默认为关）。
        causal: true, world: true, shadow: true, threads: true, weather: true, difficulty: true, affect: true, bonds: true, masks: true, temporalLock: true, temperament: true, fondness: true, parallelEvents: true, eraCycle: true, survival: true, warrant: true, beastBond: true, appearance: true, ladder: true, sceneSlice: true, gauge: true, rivalry: true, enigma: true, tempo: true, quota: true, spotlight: true, karma: true, hazard: true, marginal: true, tolerance: true, events: true, checkpoints: true }, module: 'render' };
  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）——可见性配置损坏此前静默回落默认
  /**
   * v2.4.0: 可见性读入口（含子键缺口自愈 + 声明完整性检查）。
   *   本键的消费语义是「真值即注入」：旧存档缺某子键时该值为 undefined（假值）= 静默关闭。
   *   实测磁盘只写 {"clock":false} 时，其余 9 个源全部读到 undefined ⇒ 一次性全关，
   *   而面板开关显示为「未勾选」，用户会以为是自己关的。
   *   这里在 settingsBus 补子键（整键级回落）之上再做一层：按 SOURCES 逐项确保真值，
   *   并把「def 未声明但 SOURCES 声明了」的漏登项记入缺陷视图（守卫可静态断言其为空）。
   */
  const __visStat = { filled: 0, undeclared: [], lastAt: 0 };
  function loadVis() {
    const v = WA.settingsBus.read(__REG) || {};
    const def = __REG.def;
    let filled = 0;
    SOURCES.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(def, k)) {
        // 声明缺口：源在 SOURCES 里却没有默认值 → 无法归一化，显式记账而非静默
        if (__visStat.undeclared.indexOf(k) < 0) __visStat.undeclared.push(k);
        return;
      }
      if (v[k] === undefined) { v[k] = def[k]; filled++; }
    });
    if (filled) { __visStat.filled += filled; __visStat.lastAt = clockWall(); }
    return v;
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v0.1.19: 撤销台账——记录每次 uninject 的时间、触发源、结果（最多 20 条环形）
  const __uninjectLedger = [];
  // v0.1.43: 撤销台账按聊天分域——切聊天后旧聊天的撤销记录不得参与新聊天的一致性判定
  function ledgerChatId() {
    try { return (WA.store && WA.store.chatId) ? WA.store.chatId() : null; } catch (e) { return null; }
  }
  function persistUninjectLedger() {
    try {
      const cid = ledgerChatId() || 'wa_default';
      const curEntries = __uninjectLedger.filter(function (e) { return !e.chat || e.chat === cid; });
      const mainWin = (typeof window !== 'undefined' ? window : global);
      mainWin.localStorage.setItem('worldaxis_uninject_ledger_' + cid, JSON.stringify(curEntries.slice(-20)));
    } catch (e) {}
  }
  function recordUninject(trigger, result) {
    try {
      __uninjectLedger.push({ at: clockNow('render.inject'), chat: ledgerChatId(), trigger: trigger || 'unknown', ok: !!result.ok, reason: result.reason || null, cleared: result.cleared || [] });
      if (__uninjectLedger.length > 20) __uninjectLedger.splice(0, __uninjectLedger.length - 20);
      persistUninjectLedger();
    } catch (e) {}
  }
  function loadUninjectLedger(chatId) {
    try {
      const cid = chatId || ledgerChatId() || 'wa_default';
      const mainWin = (typeof window !== 'undefined' ? window : global);
      // v2.11.0: 读失败此前被外层空 catch 吞掉、并**照样合并**（raw=null ⇒ 当前聊天账本为空）
      //   ⇒ 「撤销账本读不出来」表现为「这个聊天没撤销过注入」，重复注入风险不可见。
      let raw = null;
      try { raw = mainWin.localStorage.getItem('worldaxis_uninject_ledger_' + cid); }
      catch (eR) {
        try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('uninjectLedger', 'worldaxis_uninject_ledger_' + cid, eR); } catch (e2) {}
        return;   // 读不到就不合并（保留内存既有账本，避免把「读失败」写成「无账本」）
      }
      const otherEntries = __uninjectLedger.filter(function (e) { return e.chat && e.chat !== cid; });
      const curEntries = raw ? JSON.parse(raw) : [];
      const merged = otherEntries.concat(Array.isArray(curEntries) ? curEntries : []);
      merged.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      __uninjectLedger.length = 0;
      merged.slice(-20).forEach(function (x) { __uninjectLedger.push(x); });
    } catch (e) {}
  }
  function clearUninjectLedger(chatId) {
    const cid = chatId || ledgerChatId() || 'wa_default';
    const remain = __uninjectLedger.filter(function (e) { return e.chat && e.chat !== cid; });
    __uninjectLedger.length = 0;
    remain.forEach(function (x) { __uninjectLedger.push(x); });
    try {
      // v2.9.0: 走 store 的受控删除出口（此前裸调 removeItem）——删不掉时台账会在下次装载时
      //   复活，导致「已卸载的注入」被误判为仍在生效。
      if (WA.store && typeof WA.store.removeVerified === 'function') WA.store.removeVerified('worldaxis_uninject_ledger_' + cid);
    } catch (e) {}
  }
  /** 取当前聊天域的台账条目（无域标识的历史条目视为同域，向后兼容） */
  function ledgerForCurrentChat() {
    const cur = ledgerChatId();
    if (!cur) return __uninjectLedger.slice();
    return __uninjectLedger.filter(function (e) { return !e.chat || e.chat === cur; });
  }

  /**
   * v0.1.41: 撤销-槽位关联审计（只读）——对照撤销台账、lastInjection 槽位 keys 与
   * 宿主实际注册状态，检测「快照说在场但台账已撤销」「keys 残留未清」等不一致。
   */
  function uninjectAudit() {
    const issues = [];
    const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
    const ledger = ledgerForCurrentChat();
    const foreignCount = __uninjectLedger.length - ledger.length;   // v0.1.43: 被域隔离的跨聊天条目数
    const lastUnj = ledger.length ? ledger[ledger.length - 1] : null;
    // 快照在场声明 vs 撤销台账末条：台账比快照新且成功 → 快照过期
    let staleSnapshot = false;
    if (li && li.injected === true && lastUnj && lastUnj.ok && lastUnj.at > (li.at || 0)) staleSnapshot = true;
    if (staleSnapshot) issues.push({ code: 'stale-snapshot', detail: '快照声明 injected=true 但台账在其后已有成功撤销（trigger=' + (lastUnj.trigger || '?') + '）' });
    // clearedBy 与台账末条 trigger 不一致 → 回写异常
    if (li && li.injected === false && li.clearedBy && lastUnj && lastUnj.ok && lastUnj.trigger !== li.clearedBy) {
      issues.push({ code: 'cleared-by-mismatch', detail: '快照 clearedBy=' + li.clearedBy + ' 与台账末条 trigger=' + lastUnj.trigger + ' 不一致' });
    }
    // 注入声明在场但从未有撤销记录且台账非空且末条晚于快照——已由 stale-snapshot 覆盖；
    // 这里查反向：快照已撤销但撤销发生在快照写入之前（回写时序异常）
    if (li && li.injected === false && li.clearedAt && (li.at || 0) > li.clearedAt) {
      issues.push({ code: 'writeback-before-land', detail: 'clearedAt 早于快照 at：撤销回写时序异常' });
    }
    return {
      snapshotInjected: li ? li.injected : null,
      snapshotKeys: (li && li.slots && Array.isArray(li.slots.keys)) ? li.slots.keys.slice() : [],
      ledgerCount: ledger.length,
      foreignEntries: foreignCount,
      lastUninject: lastUnj ? { at: lastUnj.at, chat: lastUnj.chat || null, trigger: lastUnj.trigger, ok: lastUnj.ok, cleared: (lastUnj.cleared || []).length } : null,
      issues: issues
    };
  }
  // ══════════════════ v2.86.0 A5：注入链韧性 ══════════════════
  /**
   * 源显示名表（与 SOURCES / VIS_NAMES 同批，仅供失败台账报「用户看得懂的名字」）。
   *   内部常量，不进接口面——避免为观测面付接口冻结的代价。
   */
  const SRC_NAME = {
    clock: '世界时间', pulse: '世界脉搏', background: '世界背景', people: '人物此刻',
    currents: '可感知暗流', echoes: '回声',
    style: '叙事工艺', life: '人物生活', intel: '因果与情报', org: '资源与组织',
    longline: '长线伏笔', causal: '因果结算', world: '世界织体', weather: '天气与物候',
    difficulty: '世界难度', affect: '情绪通道', bonds: '关系六型', masks: '假面',
    temporalLock: '时间锁', temperament: '双层性格', fondness: '好感审计',
    parallelEvents: '场外事件', eraCycle: '资料片周期', survival: '生存三轴', warrant: '通缉',
    beastBond: '驯兽', appearance: '外貌契约', ladder: '原型阶梯', sceneSlice: '情境切片',
    gauge: '阻尼量规', rivalry: '竞争焦点', enigma: '信息暗礁', tempo: '节奏齿轮',
    quota: '伏笔配给', spotlight: '焦点分配', karma: '业力账', hazard: '风险账',
    marginal: '边际折旧', tolerance: '手段耐受', events: '事件调度', checkpoints: '快照与分支',
    shadow: '社交漩涡', threads: '悬案',
    memory: '记忆', memorySampler: '主观记忆', pmem: '主观记忆', summarizer: '叙事摘要',
    opinion: '舆情',
    // v2.88.0 O1：此处原名是「重大事件账本」，而**注入项**的 source 是「账本」（见
    //   下方 `items.push({ source: '账本'`）。同一个源两套名字，代价是它同时出现在两本账上：
    //   故障台账按 SRC_NAME 记「重大事件账本」，而 token 账/科目表/优先级表按注入项名记「账本」
    //   ——同一源在两张表里对不上同（O1 实测：科目表把「重大事件账本」报成未归类）。
    //   统一到注入项名（用户也在注入日志里看到的就是它）。面板开关的显示名属于 VIS_NAMES，不受此处影响。
    ledger: '账本',
    digest: '世界推演', nearEvent: '近端事件'
  };
  // ── v2.91.0 O4：开关两面对账 ──────────────────────────────────────────
  /**
   * 源键 -> 该模块 settings 里的键，**显式映射**。
   *   为什么用表而不是猜：源键与模块 settings 键并非总同名（`temporalLock` ->
   *   `worldaxis_temporal_settings_v1`、`parallelEvents` -> `worldaxis_pevents_settings_v1`）。
   *   猜错的后果分两种，都不能接受：报成「模块没装载」（明明是关着的），或反过来。
   *   表里**没有**的源一律读成「不可判定」（null），不当作「已关」——
   *   六个快照源与 memory/ledger/digest 本来就没有模块级总开关（它们由 store 直供）。
   */
  const SRC_MOD_SETTING = { opinion: 'worldaxis_opinion_settings_v1', life: 'worldaxis_life_settings_v1',
    intel: 'worldaxis_intel_settings_v1', org: 'worldaxis_org_settings_v1', longline: 'worldaxis_longline_settings_v1',
    causal: 'worldaxis_causal_settings_v1', world: 'worldaxis_world_settings_v1', weather: 'worldaxis_weather_settings_v1',
    difficulty: 'worldaxis_difficulty_settings_v1', shadow: 'worldaxis_shadow_settings_v1', threads: 'worldaxis_threads_settings_v1',
    affect: 'worldaxis_affect_settings_v1', bonds: 'worldaxis_bonds_settings_v1', masks: 'worldaxis_masks_settings_v1',
    temporalLock: 'worldaxis_temporal_settings_v1', temperament: 'worldaxis_temperament_settings_v1',
    fondness: 'worldaxis_fondness_settings_v1', parallelEvents: 'worldaxis_pevents_settings_v1',
    eraCycle: 'worldaxis_era_settings_v1', survival: 'worldaxis_survival_settings_v1', warrant: 'worldaxis_warrant_settings_v1',
    beastBond: 'worldaxis_beast_settings_v1', appearance: 'worldaxis_appearance_settings_v1', ladder: 'worldaxis_ladder_settings_v1',
    sceneSlice: 'worldaxis_scene_slice_settings_v1', gauge: 'worldaxis_gauge_settings_v1', rivalry: 'worldaxis_rivalry_settings_v1',
    enigma: 'worldaxis_enigma_settings_v1', tempo: 'worldaxis_tempo_settings_v1', quota: 'worldaxis_quota_settings_v1',
    spotlight: 'worldaxis_spotlight_settings_v1', karma: 'worldaxis_karma_settings_v1', hazard: 'worldaxis_hazard_settings_v1',
    marginal: 'worldaxis_marginal_settings_v1', tolerance: 'worldaxis_tolerance_settings_v1',
    events: 'worldaxis_events_settings_v1', checkpoints: 'worldaxis_ckpt_settings_v1' };
  /**
   * 模块级总开关三态读：true（明确开着）/ false（明确关着）/ null（不可判定）。
   *   口径与「缺席降级可见」同源：**读不到就说读不到**，绝不把不确定说成已关——
   *   那样用户会把「我明明勾了」看成 bug，而实际只是这里没有模块级开关。
   */
  function moduleEnabled(k) {
    const key = SRC_MOD_SETTING[k];
    if (!key) return null;
    // 登记项的真源是 `__settingsRegs`（模块装载时自己登记的，含它**声明的** def）。
    //   首版曾用 `{ key: key, def: {} }` 临时造一个登记项去读——那是错的：
    //   settingsBus 按传入的 def 补子键，def 里没有 enabled 就补不出来，
    //   于是「默认关闭」的模块被答成「不可判定」。实测同一环境下 life/intel 读成
    //   unavailable 而 longline 读成 false，正是这个错法留下的三种答案。
    let reg = null;
    try {
      const list = WA.__settingsRegs || [];
      for (let i = 0; i < list.length; i++) { if (list[i] && list[i].key === key) { reg = list[i]; break; } }
    } catch (e) { reg = null; }
    if (!reg) return null;   // 该键没登记 ⇒ 老实说不知道，不猜
    try {
      const all = WA.settingsBus.read(reg) || {};
      return (typeof all.enabled === 'boolean') ? all.enabled : null;
    } catch (e) { return null; }
  }
  // ── v2.90.0 O3：每轮执行解释 ──────────────────────────────────────────
  /**
   * 源决策归因（v2.90.0 O3）。
   *   它治的病：**“这个源为什么没进正文”在旧账上答不出**。
   *   逐段守卫写的是 `if (vis.xx && WA.xx)`，判不过就直接跳过——
   *   于是“可见性关了”“模块没启用”“本轮真没内容”“构建出错了”四种
   *   截然不同的局面，在存档上长得一模一样（都是“没出现在正文里”）。
   *   为何**事后**归因而不逐条记账：v2.56.0 的真缺陷正是“加了分支忘了登记”——
   *   记账点长在分支上，加分支的人必忘；后置归因只认源表，新增源不需要谁记得去补一行。
   *   四态不合并：landed / visibility-off / module-absent / failed / no-content。
   *   快照类源（clock/pulse/background/people/currents/echoes）合成一个
   *   `世界状态` 块，**块内逐段不细分**——这是如实标注，
   *   不是隐瞒：拿不到的粒度不假装拿到（诊断面同口径）。
   */
  const SNAP_SOURCES = ['clock', 'pulse', 'background', 'people', 'currents', 'echoes'];
  function sourceDecisions(vis, landedNames, failNames) {
    const landedSet = landedNames || [];
    const fails = failNames || {};
    const stateSnap = landedSet.indexOf('世界状态') >= 0;
    return SOURCES.map(function (k) {
      const name = SRC_NAME[k] || k;
      const isSnap = SNAP_SOURCES.indexOf(k) >= 0;
      let st;
      if (!isSnap && landedSet.indexOf(name) >= 0) st = 'landed';
      else if (isSnap && stateSnap && !(vis && vis[k] === false)) st = 'landed-in-state';
      else if (vis && vis[k] === false) st = 'visibility-off';
      else if (!WA[k]) st = 'module-absent';
      else if (moduleEnabled(k) === false) st = 'module-off';
      else if (fails[name]) st = 'failed';
      else st = 'no-content';
      return { key: k, name: name, state: st };
    });
  }
  /**
   * 每轮执行解释（v2.90.0 O3，原料 = A5 未覆盖项“每轮执行解释 / 玩家与全知诊断分离”）。
   *   两面**分列**，不是同一份数据的两种排版：
   *     · player      ：只报“进了什么”与“还有几项没进”——**不报未落地项的名字与归因码**。
   *                      名字会暗示尚未揭示的剧情线（机制层剧透），故留给全知面。
   *     · omniscient ：逐源列名 + 归因码 + 候选项去向账（trace）与预算/成本读数，供制作者定位。
   *   纯读：只读 `store.lastInjection`，不跑引擎、不改存档、不向上下文注入（A5 约束）。
   *   轮次坐标：传入的 round 与现场不符时**照实拒答**，不把上一轮的当成这一轮。
   */
  function explain(round) {
    const li = (function () { try { return WA.store.get().lastInjection || null; } catch (e) { return null; } })();
    if (!li) return { ok: false, reason: 'no-rotation' };
    const have = (typeof li.round === 'number') ? li.round : null;
    const want = (typeof round === 'number' && isFinite(round)) ? round : null;
    if (want !== null && want !== have) return { ok: false, reason: 'round-not-recorded', want: want, have: have };
    const dec = Array.isArray(li.decisions) ? li.decisions : [];
    const hit = dec.filter(function (x) { return x.state === 'landed'; });
    const inState = dec.filter(function (x) { return x.state === 'landed-in-state'; });
    const missed = dec.filter(function (x) { return x.state !== 'landed' && x.state !== 'landed-in-state'; });
    const names = hit.map(function (x) { return x.name; });
    if (inState.length) names.unshift('世界状态');
    const b = li.budget || null, cst = (b && b.cost) || null;
    return {
      ok: true, round: have, recordedAt: li.at || 0,
      player: {
        landed: names,
        missedCount: missed.length,
        summary: names.length
          ? ('本轮进正文 ' + names.join('、') + '（共 ' + names.length + ' 项）')
          : '本轮没有任何源进入正文',
        note: missed.length
          ? ('另有 ' + missed.length + ' 项本轮未进入正文；逐项原因属制作者视图（全知面）')
          : '本轮候选项全部进入正文'
      },
      omniscient: {
        round: have, at: li.at || 0, injected: !!li.injected,
        candidates: dec.length, landedCount: hit.length + inState.length, missedCount: missed.length,
        decisions: dec.slice(),
        trace: Array.isArray(li.trace) ? li.trace.slice() : null,
        traceSummary: li.traceSummary || null,
        main: { len: li.len | 0, count: (typeof li.mainCount === 'number') ? li.mainCount : null,
          sources: Array.isArray(li.sources) ? li.sources.slice() : [] },
        budget: b ? { used: b.used, cap: b.cap, overBudget: !!b.overBudget,
          folded: (b.folded || []).length, dropped: (b.dropped || []).length } : null,
        cost: cst ? { totalMs: cst.totalMs, measured: cst.measured, subTick: cst.subTick, slowest: cst.slowest } : null
      }
    };
  }
  /**
   * 失败台账：源显示名 -> { count, lastMsg, lastAt }。
   *   与「源产出空串」分开记 —— 空串是「这一轮没什么可说」（正常），
   *   抛异常是「这一块的数据坏了」（要看）。两者混记就再也答不出
   *   「世界状态为什么没进正文」到底是没内容还是坏了。
   */
  const engineFailures = {};
  /**
   * v2.88.0 O1：引擎源耗时台账（显示名 -> { ms, n }，**只记本轮**，每轮注入链开头清零）。
   *   为什么要 n（调用次数）：墙体时钟只精到 1ms，单次构建常常量到 0；此时 0ms 是
   *   **低于计时精度**，不是「不花时间」。只报 ms 的话，「一次都没量到」与「量到了但很快」
   *   在账上长得一模一样。
   */
  const engineCost = {};
  function noteCost(ns, ms) {
    const name = SRC_NAME[ns] || ns;
    const rec = engineCost[name] || (engineCost[name] = { ms: 0, n: 0 });
    rec.n++;
    rec.ms = Math.round((rec.ms + ((typeof ms === 'number' && isFinite(ms) && ms > 0) ? ms : 0)) * 100) / 100;
  }
  function resetCost() { Object.keys(engineCost).forEach(function (k) { delete engineCost[k]; }); }
  /** 耗时台账只读副本（plan 与 visibilityStat 两处共用同一份实现） */
  function costStat() {
    const out = {};
    Object.keys(engineCost).forEach(function (k) { out[k] = { ms: engineCost[k].ms, n: engineCost[k].n }; });
    return out;
  }
  function noteEngineFailure(ns, err) {
    const name = SRC_NAME[ns] || ns;
    const rec = engineFailures[name] || (engineFailures[name] = { count: 0, lastMsg: '', lastAt: 0 });
    rec.count++;
    rec.lastMsg = String((err && err.message) || err || '').slice(0, 160);
    rec.lastAt = clockWall();
    try { if (WA.log) WA.log('warn', '注入源构建失败（只丢该源）: ' + name + ' :: ' + rec.lastMsg); } catch (e) {}
    return rec;
  }
  function engineFailuresView() {
    const out = {};
    Object.keys(engineFailures).forEach(function (k) {
      out[k] = { count: engineFailures[k].count, lastMsg: engineFailures[k].lastMsg, lastAt: engineFailures[k].lastAt };
    });
    return out;
  }
  function engineFailureCount() {
    return Object.keys(engineFailures).reduce(function (a, k) { return a + engineFailures[k].count; }, 0);
  }
  /**
   * 注入链的**唯一**引擎调用出口。
   *   修前：43 个调用点里 42 个裸调用 ⇒ 任一可选源抛一次就把整条链打断（实测 0/47）。
   *   现在：异常在这里被收住 ⇒ 只丢该源、其余照常注入、异常不外泄、台账留痕。
   *   返回值一律为字符串（空串表示「本块无内容或本块失败」），调用点的 `if (xx)` 照旧可用。
   */
  function engineCall(ns, fn) {
    if (!WA[ns]) return '';
    // v2.88.0 O1：**唯一的引擎调用出口也是唯一该计时的地方**——46 处调用点全在这里过，
    //   在一处落表就天然覆盖全部引擎源；换到 46 个调用点各写一遭，迟早漏一个（而漏掉的那个
    //   会以「0ms」的样子出现在账上，看不出是漏的）。
    const t0 = clockWall();
    try { return fn() || ''; }
    catch (e) { noteEngineFailure(ns, e); return ''; }
    finally { noteCost(ns, clockWall() - t0); }
  }
  WA.render = {
    /** v0.1.41: 撤销-槽位关联审计只读视图（tool-diag 消费） */
    uninjectAudit: uninjectAudit,
    SOURCES,
    /** v2.90.0 O3：每轮执行解释（玩家面 / 全知面分列）——面板与诊断各有真消费方 */
    explain: explain,
    /** v2.4.0: 可见性配置健康度只读视图（诊断消费）——undeclared 非空即「源存在但无默认值声明」 */
    visibilityStat() { return { sources: SOURCES.length, declared: Object.keys(__REG.def).length, filled: __visStat.filled, undeclared: __visStat.undeclared.slice(), lastAt: __visStat.lastAt, key: LS_KEY,
      // v2.86.0 A5：注入链失败读数（按源显示名）——与「源产出空串」分开记，
      //   否则「世界状态为什么没进正文」永远答不出是没内容还是坏了。
      engineFaults: engineFailuresView(), engineFaultTotal: engineFailureCount(),
      // v2.88.0 O1：本轮引擎源耗时（零新成员——与 engineFaults 同一条口子出，理由同 A3）。
      injectCost: costStat(), injectCostTotal: Object.keys(engineCost).reduce(function (a, k) { return a + engineCost[k].ms; }, 0),
      // v2.91.0 O4：**开关两面对账**——「可见性勾着」与「模块开着」是两套真值，
      //   此前没有任何地方把它们摆在一起。逐源三态：on（两面都通）/ vis-off（用户关的）/
      //   mod-off（勾了也无效：模块被关）/ unavailable（该源没有模块级开关，不假装知道）。
      //   代价实测：勾着 longline 却关掉模块，产物里一个字都没有，而报账说「本轮无内容」——
      //   用户会去改世界内容，改不动，因为**根本没调用**它。
      faceAudit: (function () {
        const vis = loadVis();   // 走**唯一**读入口：再读一遍配置就等于第二份实现
        return SOURCES.map(function (k) {
        const mod = moduleEnabled(k);
        const visOn = vis[k] !== false;
        let face = 'on';
        if (!visOn) face = 'vis-off';
        else if (mod === false) face = 'mod-off';
        else if (mod === null) face = 'unavailable';
        return { key: k, name: SRC_NAME[k] || k, face: face, visibility: visOn, moduleEnabled: mod,
          note: face === 'mod-off' ? '可见性勾着也无效：模块总开关关着' : (face === 'unavailable' ? '该源无模块级总开关（由 store 直供）' : '') };
        });
      })() }; },
    getVisibility() { return loadVis(); },
    setVisibility(k, on) { const v = loadVis(); v[k] = !!on; WA.settingsBus.save(__REG, v); },

    buildWorldSnapshot() {
      const vis = loadVis(); const s = WA.store.get() || {}; const parts = [];
      // v2.86.0 A5：**每一段各自守卫**。修前六段全是裸读取，任何一段的脏行都会把
      //   整个世界状态块打成空（而这一段是注入的根：它没了，模型看到的时间/背景/人物/
      //   暗流/回声一起消失，现场只是一条英文 TypeError）。口径：坏的那段不进文本并留痕，
      //   其余段照常产出——「少一块」远好过「全没有」。
      try { if (vis.clock && s.clock && s.clock.label) parts.push('【世界时间】' + s.clock.label); }
      catch (e) { noteEngineFailure('clock', e); }
      try { if (vis.pulse && s.worldPulse) parts.push('【世界脉搏】压力' + s.worldPulse.pressure + '/3（' + s.worldPulse.trend + '）' + (s.worldPulse.note || '')); }
      catch (e) { noteEngineFailure('pulse', e); }
      try { if (vis.background && s.background.text) parts.push('【世界背景】' + s.background.text.slice(0, 500)); }
      catch (e) { noteEngineFailure('background', e); }
      try {
        if (vis.people) {
          const ps = Object.values(s.people || {}).filter(p => p && (p.location || p.action)).slice(0, 8);
          if (ps.length) parts.push('【人物此刻】' + ps.map(p => p.name + '：' + (p.location || '?') + '，' + (p.action || '')).join('；'));
        }
      } catch (e) { noteEngineFailure('people', e); }
      try {
        if (vis.currents) {
          const cs = (s.currents || []).filter(c => c && c.visibility !== 'hidden').slice(0, 6);
          if (cs.length) parts.push('【可感知暗流】' + cs.map(c => c.visibility === 'trace' ? (c.public_trace || c.title + '（异常迹象）') : c.title).join('；'));
        }
      } catch (e) { noteEngineFailure('currents', e); }
      // v2.38.0: 回声分支此前**完全缺失**——`echoes` 在 SOURCES 与面板开关里都有，
      //   但 buildWorldSnapshot 从无对应分支 ⇒ 复选框点了零效果（开/关产物逐字节相同），
      //   写进 state.echoes 的「已结算结果的正文触面」从不进正文（实测：回声「盐帮首领伏诛」查无）。
      //   口径与 currents 一致：obvious 给结果，subtle 只给「余波未明」的迹象，不剧透未结算内幕。
      if (vis.echoes) {
        const es = (s.echoes || []).slice(-4);
        if (es.length) parts.push('【已结算回声】' + es.map(e => e.exposure === 'obvious'
          ? ((e.refCurrent || '?') + '→' + (e.result || ''))
          : ((e.refCurrent || '?') + '（余波未明）')).join('；'));
      }
      // v0.1.29: 呈现铁律只在真有状态内容时追加——此前无条件 push 导致
      // parts.length 恒真、可见性全关仍注入 221 字空壳（开关对世界状态失效）
      if (parts.length) {
        parts.push('〔呈现铁律〕以上状态只供你构建舞台。输出时必须全部经过 NPC 视角过滤：信息只可由 NPC 口述/信件/公告/路人议论呈现，绝不使用系统旁白；禁止输出属性面板、好感度数值、经济指标或声望分数。')
        return '<world_axis_state>\n' + parts.join('\n') + '\n</world_axis_state>';
      }
      return '';
    },

    /**
     * v2.51.0（第三十六面）：叙事工艺块（render 侧的取数口）。
     *   单独成方法而不是内联在 applyInjections 里，是为了让它可被单独测量——
     *   「设置面开了、产物却是空串」这类现场，只有直接调它才分得清是哪一层的空
     *   （可见性关 / style 模块缺席 / 五轴全 off / buildBlock 抛错）。
     *   任何一层缺失都返回空串（零 token 占用），不产出半截文本。
     */
    buildStyleBlock() {
      if (!WA.style || typeof WA.style.buildBlock !== 'function') return '';
      try { return WA.style.buildBlock() || ''; }
      catch (e) { if (WA.log) WA.log('warn', '叙事工艺块构建失败', e); return ''; }
    },

    applyInjections(ctx) {
      const c = (() => { try { return WA.mainWin.SillyTavern.getContext(); } catch (e) { return null; } })();
      if (!c || !c.setExtensionPrompt) { if (ctx.injections.length) WA.log('warn', '宿主无setExtensionPrompt，注入丢弃'); return; }
      const vis = loadVis();
      // v2.88.0 O1：成本账按轮清零——它记的是**本轮**注入链的引擎耗时，不是从开机累到现在。
      //   每轮清零后，注入构建花了多少时间才能与「这一轮 token 用了多少」同轴比较。
      resetCost();
      // v2.90.0 O3：本轮的**轮次坐标**。此前 lastInjection 一个轮次都没记，
      //   于是「这一轮为什么这样」连问的是哪一轮都无从确认；轮次真源只有一个（evolution.roundOf），
      //   本处跟它走，不自己数。模块缺席时为 null（如实报缺，不拿 0 冲当“第 0 轮”）。
      const roundNow = (function () {
        try { return (WA.evolution && typeof WA.evolution.roundOf === 'function') ? WA.evolution.roundOf() : null; }
        catch (e) { return null; }
      })();
      const items = [];
      const snap = this.buildWorldSnapshot();
      if (snap) items.push({ source: '世界状态', content: snap });
      // v2.51.0（第三十六面）：叙事工艺约束作为**独立注入项**（不进世界状态块）。
      //   并入的代价是它从治理面消失：预算裁决、去向账、快照 sources 三项都只认独立项，
      //   并进去之后「工艺约束为什么没进 prompt」在 trace 里会显示成「世界状态」。
      //   另外它套进 <world_axis_state> 会与那段「呈现铁律·绝不使用系统旁白」互相矛盾
      //   （工艺约束本身就是系统口径的写作要求）。
      //   三态如实：style 模块缺席（旧加载顺序/加载失败）⇒ 不注入，不假装注入了空段。
      if (vis.style) { const stb = this.buildStyleBlock(); if (stb) items.push({ source: '叙事工艺', content: stb }); }
      // v2.52.0：人物生活。模块或开关关闭时 buildBlock 返回空串，不注入。
      // v2.56.0: 补 `vis.life` —— 本分支只有模块总开关、没读可见性（见 SOURCES 上方注释），
      //   于是面板上这个源关掉后仍照常注入，是 v2.38.0「开关点了零效果」的原样复刻。
      //   口径与既有各源一致：**可见性关**与**模块缺席**都返回空串，两者都如实不注入。
      if (vis.life && WA.life) { const lb = engineCall('life', function () { return WA.life.buildBlock(); }); if (lb) items.push({ source: '人物生活', content: lb }); }
      // v2.53.0：因果与情报。模块或开关关闭时 buildBlock 返回空串，不注入。
      if (vis.intel && WA.intel) { const ib = engineCall('intel', function () { return WA.intel.buildBlock(); }); if (ib) items.push({ source: '因果与情报', content: ib }); }
      // v2.54.0：资源与组织。模块或开关关闭时 buildBlock 返回空串，不注入。
      if (vis.org && WA.org) { const ob = engineCall('org', function () { return WA.org.buildBlock(); }); if (ob) items.push({ source: '资源与组织', content: ob }); }
      // v2.55.0：长线伏笔。只报逾期欠账，且不自动回收。
      if (vis.longline && WA.longline) { const lb2 = engineCall('longline', function () { return WA.longline.buildBlock(); }); if (lb2) items.push({ source: '长线伏笔', content: lb2 }); }
      // v2.62.0：因果结算。只报**在推进中**的因果链与其待发生后果。
      //   口径与其它源一致：可见性关 / 模块缺席 / 无在途链 → 返回空串，零 token 占用。
      //   特别注意这不与「世界状态·已结算回声」重复：回声是**已经发生**的响动（正文触面），
      //   本块讲的是**尚未发生**的推进中链条——若二者同形，「预测」就会被读成「既成事实」，
      //   而那正是路线图列为最有价值的那条区分。
      if (vis.causal && WA.causal) { const cb = engineCall('causal', function () { return WA.causal.buildBlock(); }); if (cb) items.push({ source: '因果结算', content: cb }); }
      // v2.63.0：世界织体（社会生活 / 时空约束）。只报**已登记的地点、已登记的道路、
      //   未结束的共同日程**，以及**有日程证据的到场者**。
      //   口径与其它源一致：可见性关 / 模块缺席 / 三张表皆空 → 返回空串，零 token 占用。
      //   特别注意它**不与「人物生活」重复**：那块讲的是「某人打算做什么」（个体动机），
      //   本块讲的是「谁和谁真的在同一个地方」（共同在场的证据）——若二者同形，
      //   「他有事要做」就会被读成「他到了场」。
      if (vis.world && WA.world) { const wb = engineCall('world', function () { return WA.world.buildBlock(); }); if (wb) items.push({ source: '世界织体', content: wb }); }
      // v2.65.0 天气与难度。总开关关闭时 buildBlock 返回空串，零 token。
      if (vis.weather && WA.weather) { const wx = engineCall('weather', function () { return WA.weather.buildBlock(); }); if (wx) items.push({ source: '天气与物候', content: wx }); }
      if (vis.difficulty && WA.difficulty) { const df = engineCall('difficulty', function () { return WA.difficulty.buildBlock(); }); if (df) items.push({ source: '世界难度', content: df }); }
      // v2.66.0 情绪通道 / 关系六型 / 假面。总开关关闭时 buildBlock 返回空串，零 token。
      //   三块各自只讲结构（能做什么/是什么关系/演与露馅），不与「人物生活」「社交漩涡」重复。
      if (vis.affect && WA.affect) { const ab = engineCall('affect', function () { return WA.affect.buildBlock(); }); if (ab) items.push({ source: '情绪通道', content: ab }); }
      if (vis.bonds && WA.bonds) { const bb = engineCall('bonds', function () { return WA.bonds.buildBlock(); }); if (bb) items.push({ source: '关系六型', content: bb }); }
      if (vis.masks && WA.masks) { const mb2 = engineCall('masks', function () { return WA.masks.buildBlock(); }); if (mb2) items.push({ source: '假面', content: mb2 }); }
      // v2.67.0 时间锁 / 双层性格 / 好感审计 / 场外事件。总开关关闭时 buildBlock 返回空串，零 token。
      if (vis.temporalLock && WA.temporalLock) { const tb = engineCall('temporalLock', function () { return WA.temporalLock.buildBlock(); }); if (tb) items.push({ source: '时间锁', content: tb }); }
      if (vis.temperament && WA.temperament) { const tm = engineCall('temperament', function () { return WA.temperament.buildBlock(); }); if (tm) items.push({ source: '双层性格', content: tm }); }
      if (vis.fondness && WA.fondness) { const fb = engineCall('fondness', function () { return WA.fondness.buildBlock(); }); if (fb) items.push({ source: '好感审计', content: fb }); }
      if (vis.parallelEvents && WA.parallelEvents) { const pb = engineCall('parallelEvents', function () { return WA.parallelEvents.buildBlock(); }); if (pb) items.push({ source: '场外事件', content: pb }); }
      if (vis.eraCycle && WA.eraCycle) { const ec = engineCall('eraCycle', function () { return WA.eraCycle.buildBlock(); }); if (ec) items.push({ source: '资料片周期', content: ec }); }
      if (vis.survival && WA.survival) { const sv = engineCall('survival', function () { return WA.survival.buildBlock(); }); if (sv) items.push({ source: '生存三轴', content: sv }); }
      if (vis.warrant && WA.warrant) { const wr = engineCall('warrant', function () { return WA.warrant.buildBlock(); }); if (wr) items.push({ source: '通缉', content: wr }); }
      if (vis.beastBond && WA.beastBond) { const bb = engineCall('beastBond', function () { return WA.beastBond.buildBlock(); }); if (bb) items.push({ source: '驯兽', content: bb }); }
      // v2.69.0 外貌分级契约 / 原型阶梯。总开关关闭时 buildBlock 返回空串，零 token。
      if (vis.appearance && WA.appearance) { const ap = engineCall('appearance', function () { return WA.appearance.buildBlock(); }); if (ap) items.push({ source: '外貌契约', content: ap }); }
      if (vis.ladder && WA.ladder) { const ld = engineCall('ladder', function () { return WA.ladder.buildBlock(); }); if (ld) items.push({ source: '原型阶梯', content: ld }); }
      if (vis.sceneSlice && WA.sceneSlice) { const ss = engineCall('sceneSlice', function () { return WA.sceneSlice.buildBlock(); }); if (ss) items.push({ source: '情境切片', content: ss }); }
      if (vis.gauge && WA.gauge) { const gg = engineCall('gauge', function () { return WA.gauge.buildBlock(); }); if (gg) items.push({ source: '阻尼量规', content: gg }); }
      if (vis.rivalry && WA.rivalry) { const rv = engineCall('rivalry', function () { return WA.rivalry.buildBlock(); }); if (rv) items.push({ source: '竞争焦点', content: rv }); }
      // v2.71.0 叙事纪律四件套。总开关关闭时 buildBlock 返回空串，零 token。
      if (vis.enigma && WA.enigma) { const eg = engineCall('enigma', function () { return WA.enigma.buildBlock(); }); if (eg) items.push({ source: '信息暗礁', content: eg }); }
      if (vis.tempo && WA.tempo) { const tp = engineCall('tempo', function () { return WA.tempo.buildBlock(); }); if (tp) items.push({ source: '节奏齿轮', content: tp }); }
      if (vis.quota && WA.quota) { const qt = engineCall('quota', function () { return WA.quota.buildBlock(); }); if (qt) items.push({ source: '伏笔配给', content: qt }); }
      if (vis.spotlight && WA.spotlight) { const sl = engineCall('spotlight', function () { return WA.spotlight.buildBlock(); }); if (sl) items.push({ source: '焦点分配', content: sl }); }
      // v2.72.0 叙事动力四件套。总开关关闭时 buildBlock 返回空串，零 token。
      if (vis.karma && WA.karma) { const km = engineCall('karma', function () { return WA.karma.buildBlock(); }); if (km) items.push({ source: '业力账', content: km }); }
      if (vis.hazard && WA.hazard) { const hz = engineCall('hazard', function () { return WA.hazard.buildBlock(); }); if (hz) items.push({ source: '风险账', content: hz }); }
      if (vis.marginal && WA.marginal) { const mg = engineCall('marginal', function () { return WA.marginal.buildBlock(); }); if (mg) items.push({ source: '边际折旧', content: mg }); }
      if (vis.tolerance && WA.tolerance) { const tl = engineCall('tolerance', function () { return WA.tolerance.buildBlock(); }); if (tl) items.push({ source: '手段耐受', content: tl }); }
      // v2.81.0 事件调度。总开关关闭时 buildBlock 返回空串，零 token。
      if (vis.events && WA.events) { const ev = engineCall('events', function () { return WA.events.buildBlock(); }); if (ev) items.push({ source: '事件调度', content: ev }); }
      // v2.82.0 快照与分支。本块只报「存在哪些存档」，**不报当前世界是否已保存**——
      //   列表非空 ≠ 当前进度有档，若不说清，模型会把「有存档」读成「随时能回来」。
      if (vis.checkpoints && WA.checkpoints) { const cp = engineCall('checkpoints', function () { return WA.checkpoints.buildBlock(); }); if (cp) items.push({ source: '快照与分支', content: cp }); }
      // v2.63.0：社交漩涡。只报**仍在生效**的共同隐瞒与最近的关系经历。
      //   口径：秘密只对被持有者公开（未持有者在本块里看不到它）；已变淡的秘密不进正文块
      //   （它仍留在存档里，因为「秘密存在过」是事实，不是态度）。
      if (vis.shadow && WA.shadow) { const sb = engineCall('shadow', function () { return WA.shadow.buildBlock(); }); if (sb) items.push({ source: '社交漩涡', content: sb }); }
      // v2.63.0：悬案。只报**未结案**（open/stalled）的案与它的线索。
      //   特别注意它**不与「因果与情报」重复**：那块讲「某人以为」（可错），
      //   本块讲「查到了哪」（必须有据）——若二者同形，「有人怀疑是他」就会被读成「查实是他」。
      if (vis.threads && WA.threads) { const tb = engineCall('threads', function () { return WA.threads.buildBlock(); }); if (tb) items.push({ source: '悬案', content: tb }); }
      // 记忆块（visibility控制）
      if (vis.memory && WA.memory) { const mb = engineCall('memory', function () { return WA.memory.buildMemoryBlock(); }); if (mb) items.push({ source: '记忆', content: mb }); }
      // v0.8.2: 人物主观记忆块（认知与信息不对称）
      // v0.9.8: 采样器接管——指数衰减采样 + 上下文相关召回，替代 slice(-8) 无差别截取
      if (vis.memory && WA.memorySampler) {
        const recent = engineCall('pmem', function () { return WA.pmem.recentText(4); }) || '';
        const pb = engineCall('memorySampler', function () { return WA.memorySampler.buildBlock({ recentText: recent }); });
        if (pb) items.push({ source: '主观记忆', content: pb });
        else { const pb2 = engineCall('pmem', function () { return WA.pmem.buildBlock(); }); if (pb2) items.push({ source: '主观记忆', content: pb2 }); }
      } else if (vis.memory && WA.pmem) { const pb = engineCall('pmem', function () { return WA.pmem.buildBlock(); }); if (pb) items.push({ source: '主观记忆', content: pb }); }
      // v0.8.3: 双层叙事摘要块（优先总述回退纪要）
      if (vis.memory && WA.summarizer) { const sb = engineCall('summarizer', function () { return WA.summarizer.buildBlock(); }); if (sb) items.push({ source: '叙事摘要', content: sb }); }
      // 舆情块
      if (vis.opinion && WA.opinion) { const ob = engineCall('opinion', function () { return WA.opinion.buildOpinionBlock(); }); if (ob) items.push({ source: '舆情', content: ob }); }
      // v0.8: 重大事件账本块
      // v0.1.29: 账本/世界推演此前不受可见性控制（不在 SOURCES 内），
      // 关掉所有注入源仍会注入账本与推演块——补齐开关覆盖，默认开保持旧行为
      if (vis.ledger && WA.ledger) { const lb = engineCall('ledger', function () { return WA.ledger.buildLedgerText(); }); if (lb) items.push({ source: '账本', content: '[重大事件账本]\n' + lb }); }
      // v0.7: world_digest块
      if (vis.digest && WA.digest) { const db = engineCall('digest', function () { return WA.digest.buildBlock(); }); if (db) items.push({ source: '世界推演', content: db }); }
      // v0.7: 近端事件一次性消费
      // v2.86.0 A5：本块既是读也是**写**（一次性消费要清 nearEvent），故整体守卫。
      //   它抛错的代价与别的源不同：消费没完成 ⇒ 同一条突发事件会**每轮重复注入**，
      //   而其它源抛错只是少一块。
      try {
      const st = WA.store.get();
      if (st && st.nextTurnInjection && st.nextTurnInjection.nearEvent) {
        const ne = st.nextTurnInjection.nearEvent;
        items.push({ source: '近端事件', content: `[突发事件] ${ne.title}${ne.urgent ? '（紧急）' : ''}：${ne.desc}` });
        // 一次性消费：清除 nearEvent；若三列也为空则整体归零（v0.1.4：避免留下空壳对象）
        WA.store.transact(d => {
          if (!d.nextTurnInjection) return;
          delete d.nextTurnInjection.nearEvent;
          const nti = d.nextTurnInjection;
          const empty = !nti.required && !nti.conditional && !nti.suppress && !nti.nearEvent;
          if (empty) d.nextTurnInjection = null;
        });
      }
      } catch (e) { noteEngineFailure('nearEvent', e); }
      // v0.1.1: 剧情约束类注入由槽位路由独立落地，不并入主块（避免重复注入）
      const ctxInj = (ctx.injections || []);
      // 无 position 的项保持旧行为（并入主块）；带 position 的项默认也并入主块，
      // 仅当槽位路由成功接管后才从主块移除——保证任何降级路径都不丢注入
      ctxInj.forEach(function (i) { if (i && i.content) items.push(i); });
      // v0.9.3: 注入预算裁决（pinned 保底 / optional 先折叠后丢弃；0=不限）
      let planInfo = null;
      let finalItems = items;
      try {
        const budget = (WA.backstage && WA.backstage.getSettings) ? WA.backstage.getSettings().injectBudget : null;
        if (WA.injectBudget && budget !== 0 && items.length) {
          planInfo = WA.injectBudget.plan(items, { budget: (budget == null ? -1 : budget), costs: costStat() });
          finalItems = WA.injectBudget.apply(items, planInfo);
          if (planInfo.folded.length || planInfo.dropped.length) {
            WA.log('info', '注入预算裁决：' + WA.injectBudget.summaryText(planInfo)
              + '｜折叠 ' + planInfo.folded.map(f => f.source).join('/')
              + (planInfo.dropped.length ? '｜丢弃 ' + planInfo.dropped.map(d => d.source).join('/') : ''));
          }
        }
      } catch (e) { WA.log('warn', '预算裁决失败，回退全量注入', e); planInfo = null; finalItems = items; }
      // v0.1.1: 槽位路由——显式带 position 的剧情约束类走独立槽位，
      // 不与主世界状态块互相覆盖；预算裁决只作用于主槽位
      // 无 position 的注入项保持旧行为（并入主块），保证向后兼容
      let slotCount = 0;
      let routedKeys = [];
      let lastSlots = null;
      let slotErrors = [];   // v0.1.9: 槽位路由错误快照
      // v2.47.0: 留住 applySlots 的完整结果（含 landed 成功名单）——快照有了名单才能对账
      //   「哪个槽位真没落地」，而不是按「前 N 个成功」猜。
      let slotResOut = null;
      try {
        const routable = ctxInj.filter(function (i) { return !!(i && i.position); });
        // v0.1.42: 路由覆盖审计——同 position 多源 depth 不一致时显式告警（不改变路由行为）
        if (routable.length > 1 && WA.injectSlotAudit && WA.injectSlotAudit.routeAudit) {
          try {
            const ra = WA.injectSlotAudit.routeAudit(routable);
            (ra.conflicts || []).forEach(function (cf) {
              WA.log('warn', '槽位深度覆盖[' + cf.position + ']: ' + cf.detail + '（源: ' + cf.sources.join('/') + '）');
            });
          } catch (e) { /* 审计失败不影响注入落地 */ }
        }
        if (WA.injectChannel && routable.length) {
          const slots = WA.injectChannel.planSlots(routable);
          const slotRes = WA.injectChannel.applySlots(function (slotName, text, pos, depth, scan) {
            c.setExtensionPrompt(slotName, text, pos, depth, scan);
          }, slots);
          slotResOut = slotRes;
          const applied = slotRes.applied;
          // v2.48.0（第三十三面）：**部分成功也是一次真实的落地**，必须逐项区分处理。
          //   此前这里是「全成功才标记接管，否则只记错误」的二分——于是 applied>0 且 <total 时：
          //     · routedKeys 与 lastSlots 都不设 ⇒ 已经**成功落地**的槽位内容仍被并进主块
          //       ⇒ 同一段约束在 prompt 里出现两次（独立槽位 + 主块），白烧 token、模型看到重复指令；
          //     · 快照 slots=null ⇒ 「计划了哪些 / 哪些真落地」的证据被整段抹掉；
          //     · uninject 依据 slots.keys 清理，为 null ⇒ 真落地的槽位**永不被清**，
          //       内容残留在宿主里持续注入后续每一轮（幽灵注入，实测可复现）；
          //     · audit 对 null 快照反而判「一致」并谎称「未启用路由」。
          //   修法：真落地的键位（landed）按实际情况登记，接管判定按**逐项落地**而不是整体成功。
          const landedKeys = Array.isArray(slotRes.landed) ? slotRes.landed.slice() : [];
          if (applied > 0) {
            slotCount = applied;
            // 只把**真落地**的键位算作「已接管」——失败的项回退主块（值保住），成功的项不重复进主块
            routedKeys = landedKeys.length ? landedKeys : slots.map(function (sl) { return sl.slot; });
            lastSlots = slots;
          }
          if (applied !== slots.length) {
            // v0.1.9: 部分失败时收集错误快照，供 tool-diag 排障
            // v2.48.0: 与 landed 一起落快照——「计划 N / 落地 M / 失败 N-M」三数必须都在场
            slotErrors = (slotRes.errors || []).slice();
            WA.log('warn', '槽位路由部分失败（' + applied + '/' + slots.length + '），失败的 规则注入回退主块，已落地的 ' + applied + ' 路不重复注入');
          }
        }
      } catch (e) { WA.log('warn', '槽位路由失败，约束注入并入主块', e); }
      // 未被槽位路由接管的项（含路由失败时回退的 routable 项）才并入主块
      // v2.47.0: **删掉「内容指纹」这条判定**。它本意是「双保险」，实际是一条误伤通道：
      //   槽位只收带 position 的项（planSlots 吃的是 routable），而指纹按**内容相等**判定——
      //   于是任何**不带 position** 的项，只要正文恰好与某个槽位文本的一行相同（例如两条
      //   一模一样的提醒，一条走槽位、一条并主块），就会被当成「已被接管」从主块里剔掉：
      //   注入静默少一条，而槽位快照与预算账单里都查不到它——「谁把这条吃了」无迹可查。
      //   真正的判定只有一条：该项声明的 position 对应的槽位**确实被接管了**。
      const mainItems = routedKeys.length
        ? finalItems.filter(function (i) {
            if (i.position && routedKeys.indexOf(WA.injectChannel.SLOT_PREFIX + ':' + WA.injectChannel.normPos(i.position)) >= 0) return false;
            return true;
          })
        : finalItems;
      const combined = mainItems.map(i => i.content).join('\n');
      // v2.47.0: 去向账——「这条注入最后去哪了」必须逐项可答。
      //   此前只有三张互不相通的账：预算账单（折叠/丢弃，只按 source 名）、槽位快照
      //   （只有 slot 与字数）、主块（一个拼好的大字符串）。三者之间没有一条能把
      //   「第 i 个候选项」与「它的落点」连起来的线，于是「正文里少了那条约束」只能靠猜。
      //   这里按**输入位置**逐项记账，去向五态：slot / main / folded / dropped / empty。
      const trace = [];
      const __foldById = {}, __dropById = {};
      if (planInfo && typeof planInfo.inputCount === 'number' && planInfo.inputCount === items.length) {
        (planInfo.folded || []).forEach(function (f) { if (typeof f.id === 'number') __foldById[f.id] = f; });
        (planInfo.dropped || []).forEach(function (f) { if (typeof f.id === 'number') __dropById[f.id] = f; });
      }
      items.forEach(function (it, idx) {
        const src = (it && it.source) || '未命名';
        if (!it || !it.content) { trace.push({ i: idx, source: src, to: 'empty' }); return; }
        if (__dropById[idx]) { trace.push({ i: idx, source: src, to: 'dropped', reason: __dropById[idx].reason || null, tokens: __dropById[idx].tokens || 0 }); return; }
        if (__foldById[idx]) { trace.push({ i: idx, source: src, to: 'folded', reason: __foldById[idx].reason || null, foldedFrom: __foldById[idx].from, foldedTo: __foldById[idx].to }); return; }
        // v2.47.0 自纠：降级路径（injectChannel 缺席 / setExt 失败回退）下 routedKeys 为空，
        //   但 trace 仍会逐项走一遍 —— 此处必须自己判通道在不在，不能硬引用
        //   （实测：测试删掉 WA.injectChannel 后 applyInjections 直接 TypeError）。
        const slotKey = (it.position && WA.injectChannel && WA.injectChannel.SLOT_PREFIX && WA.injectChannel.normPos)
          ? (WA.injectChannel.SLOT_PREFIX + ':' + WA.injectChannel.normPos(it.position)) : null;
        if (slotKey && routedKeys.indexOf(slotKey) >= 0) {
          trace.push({ i: idx, source: src, to: 'slot', slot: slotKey });
          return;
        }
        trace.push({ i: idx, source: src, to: 'main' });
      });
      const traceSummary = { main: 0, slot: 0, folded: 0, dropped: 0, empty: 0 };
      trace.forEach(function (t) { if (traceSummary[t.to] !== undefined) traceSummary[t.to]++; });
      // v2.90.0 O3：本轮源决策台账。口径 = 源表 + 真落地名集合 + 故障台账，三者都是现场已有的事实。
      const landedNames = finalItems.map(function (i) { return (i && i.source) || '未命名'; });
      const decisions = sourceDecisions(vis, landedNames, engineFailuresView());
      try {
        // 即使为空也要写入空串，清掉上一轮残留注入（swipe/重答场景关键）
        c.setExtensionPrompt('WorldAxis', combined, 1, 0, false);
        if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(combined.length);
        try {
          // v2.50.0（第三十五面）：宿主世界书激活账的**真消费点**。
          //   引擎自己被订阅、自己落账，但若没人问它，那就只是「记了没人看」——
          //   与 v2.49.0 修掉的「主块账零读点」是同一种病。这里把交叉核对结果随
          //   lastInjection 一并落盘：宿主那一半（它自己扫描注入的条目）从本轮起可查。
          //   三态如实：宿主不给事件 ⇒ available=false 且 note 说明「无从得知」，
          //   **不写成「无重复」**（那是把不可观测伪装成好结论）。
          let hostCk = null;
          try {
            if (WA.hostWbTrace && WA.hostWbTrace.crossCheck) {
              hostCk = WA.hostWbTrace.crossCheck(finalItems.map(function (i) { return { source: (i && i.source) || '未命名', content: (i && i.content) || '' }; }));
            }
          } catch (eH) { hostCk = { available: false, state: 'error', note: '宿主世界书核对异常：' + String(eH && (eH.message || eH)) }; }
          // v0.1.3: 快照补 slots 字段——排查「约束注入丢了」时可区分路由失败与槽位被覆盖
          const slotSnap = (WA.injectSlotAudit && lastSlots)
            ? WA.injectSlotAudit.snapshotSlots(lastSlots, slotResOut || slotCount)
            : null;
          WA.store.transact(d => { d.lastInjection = { at: clockNow('render.inject'), injected: (combined.length > 0 || slotCount > 0), len: combined.length, sources: mainItems.map(i => i.source), mainCount: mainItems.length, round: roundNow, decisions: decisions, hostWb: hostCk, budget: planInfo ? { used: planInfo.used, cap: planInfo.budget, source: planInfo.budgetSource, contextSize: planInfo.contextSize || null, remain: planInfo.remain, inputTokens: planInfo.inputTokens, saved: planInfo.saved, overBudget: !!planInfo.overBudget, cost: planInfo.cost ? { measured: planInfo.cost.measured, unmeasured: planInfo.cost.unmeasured.slice(), unmeasuredCount: planInfo.cost.unmeasuredCount, subTick: planInfo.cost.subTick, totalMs: planInfo.cost.totalMs, bands: planInfo.cost.bands, slowest: planInfo.cost.slowest, accounts: planInfo.cost.accounts, unclassified: planInfo.cost.unclassified } : null, keptCount: planInfo.kept.length, folded: planInfo.folded.map(f => ({ source: f.source, reason: f.reason, from: f.from, to: f.to })), dropped: planInfo.dropped.map(x => ({ source: x.source, reason: x.reason, tokens: x.tokens })) } : null, slots: slotSnap, slotErrors: (slotErrors && slotErrors.length) ? slotErrors : null, trace: trace, traceSummary: traceSummary }; });
        } catch (e) { /* 快照失败不影响注入 */ }
        if (combined) WA.log('info', '注入落地：' + mainItems.map(i => i.source).join(' + ') + '（' + combined.length + '字）' + (slotCount ? '｜独立槽位 ' + slotCount + ' 路' : ''));
      } catch (e) { WA.log('error', 'setExtensionPrompt失败', e); }
      // v2.50.0（第三十五面）：台账时间轴每轮采样一次（只读）。
      //   放在这里而不是事件回调里，是因为它要与「本轮注入是否真的落地」同频：注入链
      //   是台账产生的主要来源，采样点跟着它走，时间轴才会随世界推进自然生长。
      //   与注入成败**无关**（上面 catch 之后仍执行）——失败轮同样要被记进窗口。
      try { if (WA.ledgerTimeline && WA.ledgerTimeline.probeDefault) WA.ledgerTimeline.probeDefault(); } catch (eLT) { /* 观测失败不影响注入 */ }
    },
    /**
     * v0.1.15: 真撤销。按上一轮落地记录清空全部已注入槽位。
     * 旧的写空串只清主槽位，独立槽位路由落地的那部分会残留到下一轮；
     * 这里从 store.lastInjection 快照取实际用过的全部 slot key 逐一清空。
     * 幂等：无快照或无 setExtensionPrompt 时安全跳过，重复调用不报错。
     * v0.1.19: trigger 参数标注撤销来源（interceptor/chat-changed/manual），并写入台账。
     */
    uninject(trigger) {
      try {
        const c = (WA.mainWin && WA.mainWin.SillyTavern && WA.mainWin.SillyTavern.getContext) ? WA.mainWin.SillyTavern.getContext() : null;
        if (!c || !c.setExtensionPrompt) { const r = { ok: false, reason: 'no-host' }; recordUninject(trigger, r); return r; }
        const li = (WA.store && WA.store.get) ? (WA.store.get().lastInjection || null) : null;
        if (!li) { const r = { ok: false, reason: 'no-snapshot' }; recordUninject(trigger, r); return r; }
        const cleared = [];
        // v2.48.0: 清理依据改为「**真落地**的键位」优先。只清计划里的键位会在两种情况下出错：
        //   · 部分失败轮：快照此前根本不存（slots=null）⇒ 真落地的槽位被漏清，残值持续注入；
        //   · 旧快照（无 landed 字段）：退回 keys（宁多清不可漏清——清一个未落地的键位是空操作）。
        const landedKeys = (li.slots && Array.isArray(li.slots.landed)) ? li.slots.landed.slice() : null;
        const plannedKeys = (li.slots && Array.isArray(li.slots.keys)) ? li.slots.keys.slice() : [];
        const slotKeys = [];
        (landedKeys || plannedKeys).forEach(function (k) { if (slotKeys.indexOf(k) < 0) slotKeys.push(k); });
        slotKeys.forEach(function (k) { try { c.setExtensionPrompt(k, '', 1, 0, false); cleared.push(k); } catch (e) {} });
        try { c.setExtensionPrompt('WorldAxis', '', 1, 0, false); cleared.push('WorldAxis'); } catch (e) {}
        if (WA.injectInspector && WA.injectInspector.markRegistered) WA.injectInspector.markRegistered(0);
        // v0.1.29: 撤销状态回写快照——槽位已清空但证据保留（幂等重放依赖 keys），
        // 诊断读到这里不应再把上一轮注入当作「仍在生效」的活证据
        try {
          if (WA.store && cleared.length) WA.store.transact(function (d) {
            if (d.lastInjection) { d.lastInjection.injected = false; d.lastInjection.clearedAt = clockNow('render.inject'); d.lastInjection.clearedBy = trigger || 'manual'; }
          });
        } catch (e) {}
        if (WA.log) WA.log('info', 'uninject 清空 ' + cleared.length + ' 个槽位（trigger=' + (trigger || 'manual') + '）');
        const r = { ok: true, cleared: cleared };
        recordUninject(trigger, r);
        return r;
      } catch (e) { if (WA.log) WA.log('warn', 'uninject 异常', e); const r = { ok: false, reason: 'error', error: String(e && (e.message || e)) }; recordUninject(trigger, r); return r; }
    },
    /** v0.1.19: 撤销台账只读视图（tool-diag 消费） */
    injectionLedger(opts) {
      const scoped = (opts && opts.all) ? __uninjectLedger.slice() : ledgerForCurrentChat();
      return { count: scoped.length, entries: scoped, total: __uninjectLedger.length, foreign: __uninjectLedger.length - scoped.length };
    },
    loadUninjectLedger: loadUninjectLedger,
    clearUninjectLedger: clearUninjectLedger,
  };
})();
