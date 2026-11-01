/**
 * WorldAxis engines/intake-dispatch.js（v2.277.0 · V7 OPV7-1）
 * 推演结果分发器：把 backstage 的 26 节事实**翻译**成结构化引擎的写口调用。
 *
 * 【为什么需要它】
 *   实测（tools/v7probes/p_intake_gap.js）：每轮推演把 26 节事实全部写进叙事存储
 *   （draft.people / draft.chronicle / draft.currents …），而 36 个目标结构化引擎里
 *   backstage 只调用过 1 个（plan），18 个是**零写口驱动**。也就是说：世界每轮都在
 *   “发生事情”，但「谁在追什么」「几时会发生什么」这些**有专门结构、专门容量、
 *   专门注入面**的机制，从来没被主链喂过一口。
 *
 * 【本模块只做三件事】
 *   ① 翻译：把契约节里的字段按**声明过的映射**翻成写口入参（映射表在内，逐条可查）；
 *   ② 调用：只调各引擎**既有写口**，不直写 store（直写会绕开各引擎的事务/容量/挤出/记账）；
 *   ③ 记账：每次调用的结论进 `stat`，拒因分桶。**不静默丢弃**：拒了就要能念出拒在哪、为什么。
 *
 * 【四条硬纪律】
 *   ① **不新建事实真源**：本模块不产生任何新事实，只改写口。派生只用于标识符与常量标记
 *      （`id` 用 `intake_<floor>_<i>`、`kind` 用常量 `once`），绝不用来编事实值（人名/地名/情节）。
 *   ② **不编必填值**：字段对不上的组合一律不接（由 p_intake_map 机器对账逐条立据）。
 *      宁可少喂，不许把编造的值写进世界 —— 那是比不喂严重得多的失真。
 *   ③ **不能在事务内调**：写口内部各自 `WA.store.transact`，嵌在别人的事务里会死锁/回滚连锁。
 *      故入口只允许在 `_start` 的 `tx.ok` 成功分支之后调用（与 flushPersonaChannels 同层）。
 *   ④ **默认关**：`enabled=false` 时 `run()` 直接回 `{ok:false,reason:'disabled'}`，行为与上一版逐字一致。
 *      打开它必须由玩家显式开启（面板或设置），不接受“默认开”的隐式行为变更。
 *
 * 【接进来的四组（其余八组实测字段对不上，见 p_intake_map 的 BLOCKED 表）】
 *   people[].intent            → life.addGoal(name, {text})            人物在追什么
 *   people[].personalityAnchor → temperament.setTemperament(name, base, habit)
 *              speakingStyle                                           人物的底色与习惯
 *   blackbox.secretActions[]   → enigma.mark(action, witnesses)       谁知道这个秘密
 *   events_create[]            → events.schedule({id,title,kind:'once'}) 将要发生的事
 *   currents[]                 → **不接**：字段对得上，但把「已存在的暗流」改写为「待触发事件」
 *                                会改变其语义（暗流是状态，不是待办）—— 这不是翻译，是重新定义。
 *
 * 【导出面（6 口，每个都有真消费者）】
 *   getSettings / setSettings / run / view / stat / MAPPING
 */
(function () {
  'use strict';
  // 别名必须是**静态图认的**那一种形态（与 engines/driver-ledger.js 逐字同形）：
  //   tests/module-cycle-gate.js 的 ALIAS_RE 只认 `const X = (HOST.WorldAxis = HOST.WorldAxis || {})`。
  //   本模块初版写的是 `(typeof window !== 'undefined' ? window.WorldAxis : global.WorldAxis) || ...`，
  //   判据核对不上 ⇒ 静态图里它既不是提供方（`intake` 落到 nsLedger-only）、也不是引用方，
  //   于是 `backstage.js → intake` 这条边成了「读了一个没人提供的 ns」。
  //   改法不是放宽 ALIAS_RE（那是把判据改弱），是让源码回到仓内 326 个文件统一的那种写法。
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_intake_settings_v1';
  const DEF = { enabled: false, maxPerSection: 6, goalMaxLen: 80 };
  // v2.282.0：goalMaxLen 从「死键」变成真消费点后必须补区间声明 ——
  //   它此前不在 bounds 里，因为没有读者（未声明 = 原样透传）；现在它真截断文本，
  //   无区间就等于允许 maxLen=1e9 把整段意图写进 goal.text。
  const __REG = { key: LS_KEY, def: DEF, module: 'intake', bounds: { maxPerSection: [1, 12], goalMaxLen: [20, 200] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { runs: 0, calls: 0, ok: 0, rejected: 0, skipped: 0, lastReason: '', reasons: {}, byEngine: {} };
  function note(reason) { stat.reasons[reason] = (stat.reasons[reason] || 0) + 1; stat.lastReason = reason; }

  function clean(v, max) {
    const s = (v === null || v === undefined) ? '' : String(v).trim();
    return max ? s.slice(0, max) : s;
  }

  /**
   * 映射表：**这是本模块唯一的“知识”**，也因此是唯一要审的地方。
   *   每行必须能答两问：① 契约字段名在不在（由 p_intake_map 机器核）；
   *   ② 语义是不是同一个（人审，逐条写在 note 里）。
   *   arg 返回 null 表示「这一条不构成本写口的合法入参」—— 调用方按 skip 记账，不算拒收。
   */
  const MAPPING = [
    {
      key: 'life.goal', sec: 'people', engine: 'life', method: 'addGoal', per: 'person',
      note: '人物意图 → 生活目标。intent 是「我要做什么」，goal.text 是目标陈述，语义同一。',
      // life.addGoal 的第二参是 goal 对象，first 是人名（人物载体，来自 people[].name）
      call: function (p, api) {
        // v2.282.0：这里原先把 80 写成字面量，而 DEF.goalMaxLen 声明了 80 却全仓零消费点
        //   ⇒ 「登记表 def 子键全部有生产消费点」当场报 intake.goalMaxLen 死键。
        //   死键不是「多余一行」，是**两个真源**：设置项改不动行为，玩家调了等于没调。
        //   改成真读设置（截断上限由 goalMaxLen 决定），字面量随之消失。
        const text = clean(p && p.intent, Number(settings().goalMaxLen) || 80);
        if (!text) return null;
        return [p.name, { text: text }];
      }
    },
    {
      key: 'temperament.set', sec: 'people', engine: 'temperament', method: 'setTemperament', per: 'person',
      note: '性格锚 → 气质三件套。personalityAnchor=现实性格长句→base(底色)，speakingStyle=说话方式→habit(习惯)。',
      call: function (p) {
        const base = clean(p && p.personalityAnchor, 60);
        const habit = clean(p && p.speakingStyle, 60);
        // 引擎拒收 base === habit（same-layer）—— 同层不是两个层，别硬凑
        if (!base || !habit || base === habit) return null;
        return [p.name, base, habit];
      }
    },
    {
      key: 'enigma.mark', sec: 'blackbox', engine: 'enigma', method: 'mark', per: 'secretAction',
      note: '秘密行动 → 知情者谜题。action=秘密本身→secret(键)，witnesses=目击者→knower。',
      call: function (a) {
        const secret = clean(a && a.action, 60);
        const who = clean(a && a.witnesses, 40);
        if (!secret || !who) return null;
        return [secret, who];
      }
    },
    {
      key: 'events.schedule', sec: 'events_create', engine: 'events', method: 'schedule', per: 'row',
      note: '将要发生的事件 → 调度队列。title 同名直传；id 为派生标识符（引擎必填、契约不给）；kind 为常量 once。',
      call: function (e, api) {
        const title = clean(e && e.title, 40);
        if (!title) return null;
        return [{ id: 'intake_' + api.floor + '_' + api.i, title: title, kind: 'once' }];
      }
    }
  ];

  /** 调用一个写口并把结论记账。返回 true 表示真写进去了。 */
  function fire(rule, args, api) {
    const eng = WA[rule.engine];
    if (!eng || typeof eng[rule.method] !== 'function') { note('engine-missing'); stat.skipped++; return false; }
    let res = null;
    try { res = eng[rule.method].apply(eng, args); }
    catch (e) { note('threw'); stat.rejected++; return false; }
    stat.calls++;
    stat.byEngine[rule.key] = (stat.byEngine[rule.key] || 0) + 1;
    const why0 = (res && res.reason) ? String(res.reason) : '';
    // ⚠ 先认 disabled，再看 ok。实测踩到：`enigma.mark` / `warrant.report` 在引擎关着时回的是
    //   **{ok:true, reason:'disabled'}**（它们把“开关关着”当正常没写，不算错误）。
    //   只看 ok 就会把它算成“写进去了”——这是「静默丢弃」的反向镜像：
    //   **把没写冒充成写了**，比拒收更难查（世界看着有内容，实际一行没落）。
    if (why0 === 'disabled') { note('disabled'); stat.skipped++; return false; }
    if (res && res.ok) { stat.ok++; return true; }
    const why = why0 || 'unknown';
    note(why);
    stat.rejected++;
    return false;
  }

  /**
   * 分发一轮推演结果。
   *   @param r       applyResult 收到的同一份载荷（26 节）
   *   @param anchor  锚点（只用来取楼层号做派生标识符，不读业务字段）
   *   @returns {ok, called, written, skipped, reasons}
   *   ⚠ 只允许在 store 事务**之外**调用（见文件头纪律③）。
   */
  function run(r, anchor) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    if (!r || typeof r !== 'object') return { ok: false, reason: 'bad-payload' };
    stat.runs++;
    const floor = (anchor && anchor.idx) || 0;
    let called = 0, written = 0, skipped = 0;

    MAPPING.forEach(function (rule) {
      const rows = rule.per === 'person' ? (r[rule.sec] || [])
        : rule.per === 'secretAction' ? (((r.blackbox || {}).secretActions) || [])
          : (r[rule.sec] || []);
      if (!Array.isArray(rows) || !rows.length) return;
      rows.slice(0, cfg.maxPerSection).forEach(function (row, i) {
        const args = rule.call(row, { floor: floor, i: i });
        if (!args) { skipped++; stat.skipped++; note('not-applicable'); return; }
        called++;
        if (fire(rule, args, { floor: floor, i: i })) written++;
      });
    });

    if (written) WA.log('info', '[intake] 分发完成 written=' + written + ' called=' + called
      + (Object.keys(stat.reasons).length ? ' 拒因:' + JSON.stringify(stat.reasons) : ''));
    return { ok: true, called: called, written: written, skipped: skipped,
      reasons: Object.assign({}, stat.reasons) };
  }

  /** 面板/诊断读数（只读）。 */
  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled, maxPerSection: cfg.maxPerSection,
      rules: MAPPING.map(function (m) { return m.sec + ' → ' + m.engine + '.' + m.method; }),
      stat: Object.assign({}, stat, { reasons: Object.assign({}, stat.reasons),
        byEngine: Object.assign({}, stat.byEngine) })
    };
  }

  WA.intake = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    run: run,
    view: view,
    MAPPING: MAPPING,
    stat: function () {
      return Object.assign({}, stat, { reasons: Object.assign({}, stat.reasons),
        byEngine: Object.assign({}, stat.byEngine) });
    }
  };
})();
