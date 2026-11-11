/**
 * WorldAxis engines/levy-corvee.js (v2.400.0) — EXV22-3 税制徭役、征发额度与逃户流亡
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：「徭役 / 税率」在产品源码里只有 **1 命中**（taxRate 一个词）。
 *   economy 只有**双向**的价格与订单（你情我愿），**没有单向征发**。
 *   后果：「国库越收越穷」这条在史书里反复出现的事，在本仓根本算不出来 ——
 *   因为超额征发会把农户逼成逃户，户籍一流失，下一次能征的基数就小了。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `levyCorvee.levySeason` 按「应征额度 vs 实际可征」发一次征发，算出
 *   征收到的实物、被逼走的逃户、以及流失后的光地；逃户记在册上，
 *   下一次征发的**基数自动变小**。链：征发额度 → 超额 → 逃户 → 户籍流失 → 越收越穷。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **不碰 store**：户籍与额度由调用方持有并回传（本模块只算差额与逃户），
 *      落账仍走各自的写口。这是刻意的：**征发会死人**，不能由一个纯算引擎顺手改世界。
 *   ② **不按要的数目硬写**：可征不足时如实报「实征 < 应征」，绝不凑数 ——
 *      凑数会让「越收越穷」这条链永远看不见。
 *   ③ **拒收码只用 `disabled`**，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_levy_corvee_settings_v1';
  const DEF = {
    enabled: false,
    /** 一户一年能承担的「役」折算（同一把尺子，不分实物/力役）。 */
    perHouseholdCapacity: 10,
    /** 征发超过这个比例（相对户承受力）就开始逼出逃户。 */
    flightThresholdRatio: 1.0,
    /** 每超出一成，逼走多少比例的户（0.06 = 6%）。 */
    flightPerOverstep: 0.06
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'levyCorvee' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { levied: 0, fled: 0, refused: 0, lastReason: '' };
  const LEDGER = [];   // 历次征发的账：{ at, want, got, fled, baseAfter }

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

  /**
   * 发一次征发。
   * @param {object} spec { households, wantPerHousehold, at }
   */
  function levySeason(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const households = num(s.households);
    if (households === null || households <= 0) {
      stat.refused++; stat.lastReason = 'no-households';
      return { ok: false, hint: 'no-households：户籍基数为空或非正，无户可征（不是不征，是没有）' };
    }
    const wantPer = num(s.wantPerHousehold);
    if (wantPer === null || wantPer <= 0) {
      stat.refused++; stat.lastReason = 'no-quota';
      return { ok: false, hint: 'no-quota：未给征发额度（wantPerHousehold），本模块不替你定税' };
    }

    const cap = cfg.perHouseholdCapacity;
    // 每户能真正拿出来的钱粮/力役上限是 cap —— 这是「应征」与「实征」分岔的地方。
    const perHouseholdGot = Math.min(wantPer, cap);
    const got = perHouseholdGot * households;
    const want = wantPer * households;
    const shortfall = Math.max(0, want - got);

    // 超额征发逼出逃户：超出承受力越多，走的户越多。
    // 口径：overRatio = 1.0（刚好征满承受力）不逼人；= 1.5 走 30%；= 2.0 走 60%（封顶）。
    //   rate = (overRatio - 1) * flightPerOverstep * 10，上限 0.6。
    //   为什么乘 10：flightPerOverstep 的语义是「每超出**一成**走多少比例」，
    //   overRatio 是**倍数**（一成 = 0.1 倍），故换算因子为 10。
    const overRatio = wantPer / cap;
    let fled = 0;
    if (overRatio > cfg.flightThresholdRatio) {
      const overstep = overRatio - cfg.flightThresholdRatio;
      const rate = Math.min(0.6, overstep * cfg.flightPerOverstep * 10);
      fled = Math.floor(households * rate);
    }
    const baseAfter = Math.max(0, households - fled);

    const entry = {
      at: Number.isFinite(s.at) ? s.at : null,
      households: households,
      wantPerHousehold: wantPer,
      want: Math.round(want * 100) / 100,
      got: Math.round(got * 100) / 100,
      shortfall: Math.round(shortfall * 100) / 100,
      fled: fled,
      baseAfter: baseAfter
    };
    LEDGER.push(entry);
    if (LEDGER.length > 64) LEDGER.shift();
    stat.levied++;
    stat.fled += fled;

    return {
      ok: true,
      outcome: 'levied',
      households: households,
      want: entry.want,
      got: entry.got,
      shortfall: entry.shortfall,
      // 如实报「收不满」：这是「越收越穷」的入口，不许被抹平。
      shortOfQuota: shortfall > 0,
      fled: fled,
      baseAfter: baseAfter,
      // 下一次用 baseAfter 再征，基数已经小了 —— 调用方据此才能看到螺旋。
      nextBase: baseAfter
    };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      perHouseholdCapacity: cfg.perHouseholdCapacity,
      flightThresholdRatio: cfg.flightThresholdRatio,
      flightPerOverstep: cfg.flightPerOverstep,
      ledgerCount: LEDGER.length,
      last: LEDGER.length ? LEDGER[LEDGER.length - 1] : null,
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
    LEDGER.length = 0;
    stat.levied = 0; stat.fled = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.levyCorvee = {
    levySeason: levySeason,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/levy-corvee.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/levy-corvee 已加载（2.400.0）');
  }
})();