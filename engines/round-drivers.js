/**
 * WorldAxis engines/round-drivers.js（v2.294.0 · V8 OPV8-4 / EXV8-2）
 * 轮次驱动器：把「每轮只需推进状态」的悬空引擎挂进真实轮次循环。
 *
 * 【为什么需要它】
 *   V8 立项实测（tools/v7probes/p_four_layer.js）：34 台引擎在产品侧零写口调用（L3 真悬空）。
 *   其中一部分引擎的写口语义是**纯状态推进**——tick() / step() / idle() 一类，
 *   不需要任何剧情判断：tolerance.tick（窗口衰减）、motif.tick（窗口滑动）、
 *   marginal.tick（冷却与闲置结算）、quota.tick（额度老化）、spotlight.idle（久缺结算）、
 *   rhythmLoop.step（相位推进）、eraCycle.tick（时代轮转）。
 *   这些引擎缺的从来不是数据，是「每轮有人叫它们一声」。
 *
 * 【本模块只做一件事】
 *   每轮推演结算成功后（与 intake.run 同层：事务后副作用），按固定顺序调用
 *   本名单内各引擎的推进口。引擎各自读自己的 enabled 开关；关着的引擎
 *   在自己的写口里如实回 disabled，本模块如实记账，不代为开关。
 *
 * 【四条硬纪律（继承 intake-dispatch，逐字有效）】
 *   ① 不新建事实真源：本模块零 store 写，只调各引擎既有写口；
 *   ② 不编必填值：推进口一律**零参调用**，不传任何派生值；
 *   ③ 不能在事务内调：写口内部各自 store.transact（rhythmLoop.step 已核实），
 *      故本模块只能挂在 tx.ok 成功分支之后；
 *   ④ 默认关：enabled=false 时 tickAll() 直接回 {ok:false,reason:'disabled'}，
 *      逐字不影响旧行为。
 *
 * 【名单口径：为什么是这七台】
 *   不在名单里的 L3 引擎不走本口，理由逐台写死在 DRIVERS 表注释里 ——
 *   它们的写口要么需要剧情判断的入参（contest.open / ruling.open / beastBond.train），
 *   要么是玩家决策面（userlock.lock / tempo.setGear / storyTone.set），
 *   由写口台（ui/panel.js）与分发器各自接走，硬塞进轮次循环等于替玩家做剧情判断。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_round_drivers_settings_v1';
  const DEF = { enabled: false };
  const __REG = { key: LS_KEY, def: DEF, module: 'roundDrivers', bounds: {} };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { runs: 0, calls: 0, ok: 0, disabled: 0, threw: 0, lastReason: '', byEngine: {} };
  function note(reason) { stat.lastReason = reason; stat.byEngine[reason] = (stat.byEngine[reason] || 0) + 1; }

  /**
   * 推进名单。method 全部是「零参或仅传白名单旗标」的推进口：
   *   · tolerance.tick()    窗口滑动与重复惩罚衰减 —— 零参，无事实写入
   *   · motif.tick()        主题窗口滑动 —— 零参
   *   · marginal.tick()     冷却与闲置结算 —— 零参（不传 noGain）
   *   · quota.tick()        配额老化与过期 —— 零参
   *   · spotlight.idle()    久缺名单结算 —— 零参（读默认阈值）
   *   · rhythmLoop.step()   节奏环相位推进 —— 零参（不 rewind）
   *   · eraCycle.tick()     时代轮转推进 —— 零参
   */
  const DRIVERS = [
    { engine: 'tolerance', method: 'tick' },
    { engine: 'motif', method: 'tick' },
    { engine: 'marginal', method: 'tick' },
    { engine: 'quota', method: 'tick' },
    { engine: 'spotlight', method: 'idle' },
    { engine: 'rhythmLoop', method: 'step' },
    { engine: 'eraCycle', method: 'tick' }
  ];

  /**
   * 推进一轮。只允许在 store 事务**之外**调用（挂 backstage 的 tx.ok 成功分支后）。
   * @returns {ok, called, driven, disabled, threw, reasons}
   */
  function tickAll() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    stat.runs++;
    let called = 0, driven = 0, disabled = 0, threw = 0;
    DRIVERS.forEach(function (d) {
      const eng = WA[d.engine];
      if (!eng || typeof eng[d.method] !== 'function') { note('engine-missing:' + d.engine); return; }
      let res = null;
      try { res = eng[d.method](); }
      catch (e) { threw++; note('threw:' + d.engine); return; }
      called++;
      // 与 intake 同规：先认 disabled 再看 ok —— enigma/warrant 一族把「关着」当正常没写
      if (res && res.reason === 'disabled') { disabled++; note('disabled:' + d.engine); return; }
      if (res && res.ok) { driven++; stat.ok++; }
      else { disabled++; note(((res && res.reason) || 'unknown') + ':' + d.engine); }
    });
    return { ok: true, called: called, driven: driven, disabled: disabled, threw: threw };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      drivers: DRIVERS.map(function (d) { return d.engine + '.' + d.method + '()'; }),
      stat: JSON.parse(JSON.stringify(stat))
    };
  }

  WA.roundDrivers = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    tickAll: tickAll,
    DRIVERS: DRIVERS,
    view: view,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/round-drivers.js', { kind: 'engine', ver: '2.294.0' });
  if (WA.log) WA.log('info', 'engines/round-drivers 已加载（2.294.0）');
})();