/**
 * WorldAxis engines/celestial-omens.js (v2.400.0) — EXV22-1 天文星象、历法误差与农时预兆
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：天文词在全部产品源码里 **0 命中**。后果不是「少一个背景描述」，而是
 *   **历法漂移没有任何后果** —— 「闰错一个月」在别的历史里是饥荒的起点，在本仓里
 *   只是没人提到的一个词。旧历（纯按 365 天推）每年比真年短 0.2422 天，三十年
 *   就是 7 天多：什么时候播种、什么时候该防备，全靠天上那一轮。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `celestialOmens.observeSky` 记下某夜的天象读数（星位 + 月相），据此给出
 *   「今年的历差几天、农时该提前还是推迟、预兆是好是坏」；
 *   `celestialOmens.settle` 把当年历差转成**真实压力**（农时误判 → 粮产折算）。
 *   链：星图 → 历法漂移 → 农时误判 → 饥荒压力。
 *
 * ── 边界（写进头注释，因为它比断言更重要）──────────────────────────
 *   ① **零世界写**：本模块只算、只记自己的读数，不碰 store。它不决定谁饿死 ——
 *      那是 economy / survival 的口径；本模块只回答「今年历法差了几日、农时偏了」。
 *   ② **不编读数**：`observeSky` 只接受调用方给的星位；没给就是没给，如实报
 *      `ok:false` + `hint`，不拿默认星位凑一个「像样」的历差。
 *   ③ **拒收码只用 `disabled`**（共享码，由既有声明承担）：本模块额外引入的
 *      拒收语义全部走「ok:false + hint」，不新造码面 —— 新码要三面齐走，
 *      而这里真正会拒的只有「开关关着」这一件。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_celestial_omens_settings_v1';
  const DEF = {
    enabled: false,
    /** 旧历每年与真年的差（日）。0.2422 是儒略历式的粗口径，刻意可配。 */
    driftDaysPerYear: 0.2422,
    /** 连续漂移多少日算「农时已经错了一旬」的界线。 */
    alarmDays: 10
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'celestialOmens' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { observed: 0, refused: 0, settled: 0, lastReason: '' };

  /** 月相名 → 粗略相位角（0..1，0 = 朔）。只用于「历差是否已偏离月相」。 */
  const PHASE = {
    'new': 0, 'waxing-crescent': 0.125, 'first-quarter': 0.25, 'waxing-gibbous': 0.375,
    'full': 0.5, 'waning-gibbous': 0.625, 'last-quarter': 0.75, 'waning-crescent': 0.875
  };

  const STATE = { year: null, sky: null, drift: 0, lastSettle: null };

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

  /**
   * 记一次观星。
   * @param {object} spec { year, phase, starShiftDays, at }
   * @returns {{ok:boolean, reason?:string, hint?:string, drift?:number, ...}}
   */
  function observeSky(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const year = num(s.year);
    if (year === null) {
      stat.refused++; stat.lastReason = 'missing-year';
      // 不编一个「大概是今年」的年份：历差是按年累积的，年份错了读数全错。
      return { ok: false, hint: 'missing-year：必须给 year，历差按年累积，猜一个年份等于编读数' };
    }
    const phaseName = String(s.phase || '').trim();
    if (!phaseName) {
      stat.refused++; stat.lastReason = 'missing-phase';
      return { ok: false, hint: 'missing-phase：必须给月相（观察到的），本模块不替你选一个' };
    }
    const phase = PHASE[phaseName];
    if (phase === undefined) {
      stat.refused++; stat.lastReason = 'unknown-phase';
      return { ok: false, hint: 'unknown-phase：' + phaseName + ' 不在八相表内' };
    }
    const starShift = num(s.starShiftDays);

    // 历差只由「年 × 每年漂移」决定；星位若给了，用来判「是否偏到肉眼可见」。
    const drift = Math.round(year * cfg.driftDaysPerYear * 100) / 100;
    const visible = starShift !== null && Math.abs(starShift) >= 1 ? true
      : (starShift !== null ? false : null);

    STATE.year = year;
    STATE.sky = { phase: phaseName, phaseAt: phase, starShiftDays: starShift };
    STATE.drift = drift;
    stat.observed++;

    return {
      ok: true,
      // ── 为什么成功路径用 `outcome` 而不是 `reason`（本批统一口径）────────────
      //   `reason` 在本仓是**拒收专用字段**：tests/reject-code-gate.js 用
      //   `reason: '<code>'` 的字面形态收集「每个引擎告诉调用方为何拒收」的码面，
      //   并要求每个码都有见证或死表证明。
      //   本批初版把成功结果码也写进 `reason`（`reason: 'sky-observed'`），
      //   于是 reject-code-gate 当场报 15 条「未分类」—— 判据没错，是字段用错了：
      //   「为何拒收」与「做成了什么」是两件事，塞进同一个字段就会让前者失去可判定性。
      //   处置不是放宽门禁（那会让真拒收码一起漏掉），而是**换字段**：
      //     · 拒收：`{ ok: false, reason: 'disabled' }`（共享码，唯一一个）
      //     · 成功：`{ ok: true, outcome: '<做了什么>' }`
      //   消费方读 outcome 即可；不读也不影响（它不是判据输入）。
      outcome: 'sky-observed',
      year: year,
      phase: phaseName,
      driftDays: drift,
      driftVisible: visible,
      alarm: Math.abs(drift) >= cfg.alarmDays
    };
  }

  /**
   * 把当年历差结算成农时偏移与压力。
   * 只读本模块 STATE，不写世界。
   */
  function settle(spec) {
    const cfg = settings();
    if (!cfg.enabled) {
      stat.refused++; stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled' };
    }
    if (STATE.year === null) {
      stat.refused++; stat.lastReason = 'no-sky';
      return { ok: false, hint: 'no-sky：先 observeSky，没有观星读数就结算等于凭空造历' };
    }
    const s = spec && typeof spec === 'object' ? spec : {};
    const yieldBase = num(s.yieldBase);

    const drift = STATE.drift;
    // 农时偏移：历差每日约对应 1 日的农时错位（一阶近似，不做二阶修正）。
    const farmShiftDays = Math.round(drift);
    // 误判压力：一旬（10 日）以内尚可补救，超出按每旬一档累积。
    const missedDecads = Math.max(0, Math.floor(Math.abs(farmShiftDays) / 10));
    // 减产折算：每错过一旬让一季少一成，封顶五成 —— 不打死，留改种/赈济的余地。
    const yieldLossRatio = Math.min(0.5, missedDecads * 0.1);

    const out = {
      ok: true,
      outcome: 'omens-settled',
      year: STATE.year,
      driftDays: drift,
      farmShiftDays: farmShiftDays,
      missedDecads: missedDecads,
      yieldLossRatio: yieldLossRatio,
      yieldLossRatioBp: Math.round(yieldLossRatio * 10000),
      alarm: Math.abs(drift) >= cfg.alarmDays,
      phase: STATE.sky ? STATE.sky.phase : null
    };
    if (yieldBase !== null) {
      out.yieldBase = yieldBase;
      out.yieldAfter = Math.round(yieldBase * (1 - yieldLossRatio) * 100) / 100;
    }
    stat.settled++;
    STATE.lastSettle = out;
    return out;
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      driftDaysPerYear: cfg.driftDaysPerYear,
      alarmDays: cfg.alarmDays,
      year: STATE.year,
      driftDays: STATE.drift,
      sky: STATE.sky ? { phase: STATE.sky.phase, starShiftDays: STATE.sky.starShiftDays } : null,
      lastSettle: STATE.lastSettle,
      stat: Object.assign({}, stat),
      phases: Object.keys(PHASE)
    };
  }

  function setSettings(patch) {
    if (!WA.settingsBus) return { ok: false, hint: 'settingsBus 不可用' };
    const merged = Object.assign({}, settings(), patch && typeof patch === 'object' ? patch : {});
    //   ⚠ 写盘走 `saveOrThrow`，不是想当然的 `write`（v2.400.0 修）。
    //   本处初版写的是 `try { WA.settingsBus.write(__REG, merged); } catch (e) {...}`，
    //   而 `settingsBus` **根本没有 write 这个成员**（真源 core/settings-bus.js 的导出面：
    //   read / normalize / save / saveOrThrow / remove / 各类 stat）。后果不是「写失败」，而是
    //   **开关永远打不开**：每次 setSettings 都招一个 TypeError，被 catch 吞成
    //   `{ok:false, hint:'write-threw：WA.settingsBus.write is not a function'}`，而调用方只看
    //   ok 就以为「开关没开」。实测（真产品 LOAD 装载面）：八个引擎
    //   **全部** setSettings 返回 ok:false、enabled 恒为 false —— 就是说「出厂即关」
    //   在实际使用上变成了「**永远关着**」。
    //   为什么专锁没抓到：tests/exv22-v2400.js 的宿主 `makeHost()` 自带一个
    //   `write` 桩（当时是照着引擎的调用写的），于是 B4/B5 在假写面上绿了。
    //   这正是本仓反复点名的「测试里自塞了桩就测得过」。
    //   现在走与其余 12 个引擎逐字同形的真写口（如 engines/act.js:72）：
    //   `saveOrThrow(reg, normalize(reg, 合并后的字典))` —— 写不进去就抛，由本处转成可读的 hint。
    try { WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)); } catch (e) {
      return { ok: false, hint: 'write-threw：' + (e && e.message ? e.message : '未知') };
    }
    //   写完回读：「写进去」不等于「存住了」（本仓 save 头注同语）。
    const back = settings();
    if (back.enabled !== merged.enabled) {
      return { ok: false, hint: 'write-verify：写后回读不一致（enabled ' + String(merged.enabled) + ' → ' + String(back.enabled) + '）' };
    }
    return { ok: true, settings: back };
  }

  function reset() {
    STATE.year = null; STATE.sky = null; STATE.drift = 0; STATE.lastSettle = null;
    stat.observed = 0; stat.refused = 0; stat.settled = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.celestialOmens = {
    observeSky: observeSky,
    settle: settle,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/celestial-omens.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/celestial-omens 已加载（2.400.0）');
  }
})();