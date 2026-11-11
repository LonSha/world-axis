/**
 * WorldAxis engines/mortuary-rites.js (v2.400.0) — EXV22-4 丧葬儀式、服丧期与遗产清算
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：「丧葬 / 儀式」在产品源码里 **0 命中**。
 *   既有 family.inherit 只做**财产分配**，完全不处理**服丧期禁令**：
 *   期内不得婚娶、不得赴宴、不得上任。后果 —— **死亡没有社会成本**。
 *   一个人死了，世界照常娶亲、照常赴宴、照常上任，除了财产换了个名字。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `mortuaryRites.holdFuneral` 办一场丧事，按「亲等 × 丧主身份」定出服丧天数
 *   与禁令清单；`mortuaryRites.checkProhibition` 回答「这个人此刻能不能做这件事」。
 *   链：死亡 → 服丧期（多少天） → 禁令（哪些事不许） → 违规（会被告发）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **不碰 store**：谁死了、谁是丧主由调用方给；财产分配仍走 family.inherit。
 *      本模块只回答「服丧几天、禁哪些事、这件事现在能不能做」。
 *   ② **禁令不空转**：`checkProhibition` 在**服丧期内**返回 `ok:false` + 具体禁令名，
 *      期外一律放行 —— 不做「宽严无常」的模糊判断。
 *   ③ **拒收码只用 `disabled`**，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_mortuary_rites_settings_v1';
  const DEF = {
    enabled: false,
    /** 三年之丧按 27 个月折算成天（本仓用日做统一时间尺）。 */
    daysPerMonth: 30,
    /** 期服（一年）的天数；用于齐衰/大功等亲等的阶梯。 */
    baseYearDays: 360,
    /** 违禁是否报出（false = 只算不说；生产消费方一律用 true）。 */
    reportViolation: true
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'mortuaryRites' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { funerals: 0, checks: 0, blocked: 0, refused: 0, lastReason: '' };
  /** mournerId -> { until, days, bans:[], deceased } */
  const MOURNING = {};

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v) { return String(v == null ? '' : v).trim(); }

  /** 亲等 → 服丧月数。斩衰三年 / 齐衰一年 / 大功九月 / 小功五月 / 缌麻三月。 */
  const KIN_MONTHS = {
    'zhan-cui': 27,   // 斩衰：子女为父母
    'zi-cui': 12,     // 齐衰：孙为祖父母等
    'da-gong': 9,     // 大功：为堂兄弟等
    'xiao-gong': 5,   // 小功
    'si-ma': 3        // 缌麻：最轻
  };

  /** 服丧期内一律禁止的三件事（本仓只钉这三条，不虚构更多）。 */
  const BANS = ['marry', 'banquet', 'assume-office'];

  /**
   * 办一场丧事，登记服丧者。
   * @param {object} spec { mournerId, deceased, kin, at }
   */
  function holdFuneral(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const mournerId = str(s.mournerId);
    if (!mournerId) {
      stat.refused++; stat.lastReason = 'missing-mourner';
      return { ok: false, hint: 'missing-mourner：服丧者是谁？没有丧主就没有服丧期' };
    }
    const kin = str(s.kin);
    if (!kin) {
      stat.refused++; stat.lastReason = 'missing-kin';
      return { ok: false, hint: 'missing-kin：必须给亲等（' + Object.keys(KIN_MONTHS).join('/') + '），本模块不猜你和死者的关系' };
    }
    const months = KIN_MONTHS[kin];
    if (months === undefined) {
      stat.refused++; stat.lastReason = 'unknown-kin';
      return { ok: false, hint: 'unknown-kin：' + kin + ' 不在五服表内' };
    }
    const at = num(s.at);
    if (at === null) {
      stat.refused++; stat.lastReason = 'missing-at';
      return { ok: false, hint: 'missing-at：丧事发生在何时？服丧期是从那一刻开始算的' };
    }
    const days = months * cfg.daysPerMonth;
    const rec = {
      until: at + days * 24 * 3600 * 1000,
      days: days,
      kin: kin,
      bans: BANS.slice(),
      deceased: str(s.deceased) || null,
      startedAt: at
    };
    MOURNING[mournerId] = rec;
    stat.funerals++;
    return {
      ok: true,
      outcome: 'funeral-held',
      mournerId: mournerId,
      kin: kin,
      months: months,
      days: days,
      until: rec.until,
      bans: rec.bans.slice()
    };
  }

  /**
   * 问「这个人此刻能不能做这件事」。
   * @param {object} spec { mournerId, action, at }
   */
  function checkProhibition(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const mournerId = str(s.mournerId);
    const action = str(s.action);
    const at = num(s.at);
    if (!mournerId || !action || at === null) {
      stat.refused++; stat.lastReason = 'missing-args';
      return { ok: false, hint: 'missing-args：需要 mournerId / action / at 三样' };
    }
    stat.checks++;
    const rec = MOURNING[mournerId];
    if (!rec) return { ok: true, outcome: 'not-in-mourning', mournerId: mournerId, action: action };
    const inWindow = at < rec.until;
    if (!inWindow) {
      // 期外放行，并如实说明「期已满、禁令解除」。
      return { ok: true, outcome: 'mourning-over', mournerId: mournerId, action: action, endedAt: rec.until };
    }
    const banned = rec.bans.indexOf(action) >= 0;
    if (!banned) {
      return { ok: true, outcome: 'not-banned', mournerId: mournerId, action: action, remainingDays: Math.ceil((rec.until - at) / 86400000) };
    }
    stat.blocked++;
    return {
      ok: false,
      reason: 'mourning-prohibited',
      mournerId: mournerId,
      action: action,
      kin: rec.kin,
      until: rec.until,
      remainingDays: Math.ceil((rec.until - at) / 86400000),
      // 违禁不是「做不到」，是「做了要被告发」—— 把这两件事分开报。
      reportable: !!cfg.reportViolation
    };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      daysPerMonth: cfg.daysPerMonth,
      baseYearDays: cfg.baseYearDays,
      reportViolation: !!cfg.reportViolation,
      kinTable: Object.keys(KIN_MONTHS),
      bans: BANS.slice(),
      mourners: Object.keys(MOURNING).map(function (k) {
        return { id: k, kin: MOURNING[k].kin, days: MOURNING[k].days, until: MOURNING[k].until };
      }),
      stat: Object.assign({}, stat)
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
    Object.keys(MOURNING).forEach(function (k) { delete MOURNING[k]; });
    stat.funerals = 0; stat.checks = 0; stat.blocked = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.mortuaryRites = {
    holdFuneral: holdFuneral,
    checkProhibition: checkProhibition,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/mortuary-rites.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/mortuary-rites 已加载（2.400.0）');
  }
})();