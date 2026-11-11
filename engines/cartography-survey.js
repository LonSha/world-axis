/**
 * WorldAxis engines/cartography-survey.js (v2.400.0) — EXV22-7 舆图测绘、疆域精度与迷雾认知
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：「舆图 / 测绘」在产品源码里只有 **2 命中**，且都是
 *   playable-blueprint 里的**职业名** cartographer。
 *   缺的是**精度分层**：这张图谁画的、误差多大、哪些标注是猜的。
 *   后果：行军与商队走错路无法归因 —— 地图在别处是一张「全知底图」，
 *   而真实的舆图有三分是猜的，猜错的那三分就是全军覆没的地方。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `cartographySurvey.chartRegion` 记一次测绘：画的人是谁（测绘者水平）、
 *   标了哪些点、其中几个是亲眼见的（亲见 vs 传闻），据此算出这张图的
 *   **精度（0..1）与误差半径**；`resolveLandmark` 回答「照着这张图去找某个地标，
 *   会不会找错」—— 找错就把行军/商队导向别处。
 *   链：谁画的图 → 哪些是亲见 → 精度与误差 → 会不会走错。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **不碰 store**：地标与测绘者由调用方给；地图落地仍是 atlas 的口径。
 *   ② **猜的必须标出来**：`chartRegion` 要求逐点标明 `seen`（亲见）还是
 *      `heard`（传闻），混着报就会被拒 —— 因为「把传闻当亲见」正是迷雾认知要治的病。
 *   ③ **拒收码只用 `disabled`**，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_cartography_survey_settings_v1';
  const DEF = {
    enabled: false,
    /** 测绘者水平（0..1）：1 = 老练测工，0 = 路人随手画。 */
    defaultSkill: 0.6,
    /** 传闻点相对亲见点的确定性打几折。 */
    hearsayWeight: 0.35,
    /** 误差半径（公里）= (1 - 精度) × 该基数。 */
    errorRadiusBaseKm: 40
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'cartographySurvey' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { charts: 0, lookups: 0, misled: 0, refused: 0, lastReason: '' };
  /** regionId -> { precision, errorRadiusKm, points:[...], skill } */
  const CHARTS = {};

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v) { return String(v == null ? '' : v).trim(); }

  /**
   * 测绘一片区域。
   * @param {object} spec { regionId, surveyor, skill, points:[{name, seen|heard}] }
   */
  function chartRegion(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const regionId = str(s.regionId);
    if (!regionId) {
      stat.refused++; stat.lastReason = 'missing-region';
      return { ok: false, hint: 'missing-region：要测哪一片？没有区域就无从成图' };
    }
    const raw = Array.isArray(s.points) ? s.points : null;
    if (!raw || !raw.length) {
      stat.refused++; stat.lastReason = 'no-points';
      return { ok: false, hint: 'no-points：一张图至少要有一个标点，空图不是地图' };
    }
    // 逐点必须显式标明「亲见 / 传闻」——这是本模块唯一拒绝「含糊」的地方。
    const points = [];
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i] && typeof raw[i] === 'object' ? raw[i] : {};
      const name = str(p.name);
      if (!name) {
        stat.refused++; stat.lastReason = 'unnamed-point';
        return { ok: false, hint: 'unnamed-point：第 ' + (i + 1) + ' 个标点没有名字' };
      }
      const seen = p.seen === true;
      const heard = p.heard === true;
      if (seen === heard) {
        stat.refused++; stat.lastReason = 'unmarked-point';
        return {
          ok: false,
          hint: 'unmarked-point：标点「' + name + '」必须**恰好**标明 seen 或 heard 之一'
            + '（把传闻当亲见是迷雾认知要治的病，两个都不给等于默认亲见）'
        };
      }
      points.push({ name: name, seen: seen, heard: heard });
    }
    const skillRaw = num(s.skill);
    const skill = skillRaw === null ? cfg.defaultSkill : Math.max(0, Math.min(1, skillRaw));

    // 精度 = 测绘者水平 × 「亲见占比」加权后的点数覆盖率。
    //   口径写清楚：点越多，同一水平的测绘者成图越粗（摊薄），故除以 (1 + log10(n))。
    const seenCount = points.filter(function (p) { return p.seen; }).length;
    const heardCount = points.length - seenCount;
    const seenWeight = seenCount + heardCount * cfg.hearsayWeight;
    const coverage = seenWeight / points.length;
    const dilution = 1 / (1 + Math.log10(points.length + 1));
    const precision = Math.round(skill * coverage * (0.6 + 0.4 * dilution) * 1000) / 1000;
    const errorRadiusKm = Math.round((1 - precision) * cfg.errorRadiusBaseKm * 100) / 100;

    const chart = {
      regionId: regionId, surveyor: str(s.surveyor) || null, skill: skill,
      points: points, seenCount: seenCount, heardCount: heardCount,
      precision: precision, errorRadiusKm: errorRadiusKm
    };
    CHARTS[regionId] = chart;
    stat.charts++;
    return {
      ok: true, outcome: 'charted', regionId: regionId,
      points: points.length, seen: seenCount, heard: heardCount,
      skill: skill, precision: precision, errorRadiusKm: errorRadiusKm,
      // 如实标出「这张图上有几个点是猜的」—— 这是本模块存在的理由。
      guessedCount: heardCount,
      trustworthy: precision >= 0.5
    };
  }

  /**
   * 照着图去找一个地标。
   * @param {object} spec { regionId, landmark }
   */
  function resolveLandmark(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const regionId = str(s.regionId);
    const landmark = str(s.landmark);
    const chart = CHARTS[regionId];
    if (!chart) {
      stat.refused++; stat.lastReason = 'uncharted';
      return { ok: false, hint: 'uncharted：regionId ' + (regionId || '(空)') + ' 没有图，没见过的地方不能照着走' };
    }
    if (!landmark) {
      stat.refused++; stat.lastReason = 'missing-landmark';
      return { ok: false, hint: 'missing-landmark：要找哪个地标？' };
    }
    const pt = chart.points.filter(function (p) { return p.name === landmark; })[0];
    if (!pt) {
      stat.refused++; stat.lastReason = 'landmark-not-on-chart';
      return {
        ok: false,
        hint: 'landmark-not-on-chart：这张图上没有「' + landmark + '」，图上没有 ≠ 世上没有',
        precision: chart.precision
      };
    }
    stat.lookups++;
    // 传闻点：靠误差半径兜；亲见点：靠精度兜。两者都不是「一定找得到」。
    const certainty = pt.seen ? chart.precision : Math.round(chart.precision * cfg.hearsayWeight * 1000) / 1000;
    const misled = certainty < 0.5;
    if (misled) stat.misled++;
    return {
      ok: true,
      //   ── 同上：成功路径写 `outcome`，不写 `reason`（v2.400.0 修）────────────
      //   本行初版是 `reason: misled ? 'misled' : 'found'`。「找到 / 被误导」是
      //   查询结果，不是拒收理由；而且三元写法让拒收码面的字面正则看不见它。
      outcome: misled ? 'misled' : 'found',
      regionId: regionId, landmark: landmark,
      seen: pt.seen, heard: pt.heard,
      certainty: certainty,
      errorRadiusKm: chart.errorRadiusKm,
      misled: misled
    };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      defaultSkill: cfg.defaultSkill,
      hearsayWeight: cfg.hearsayWeight,
      errorRadiusBaseKm: cfg.errorRadiusBaseKm,
      regions: Object.keys(CHARTS).map(function (k) {
        const c = CHARTS[k];
        return {
          regionId: k, points: c.points.length, seen: c.seenCount, heard: c.heardCount,
          precision: c.precision, errorRadiusKm: c.errorRadiusKm
        };
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
    Object.keys(CHARTS).forEach(function (k) { delete CHARTS[k]; });
    stat.charts = 0; stat.lookups = 0; stat.misled = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.cartographySurvey = {
    chartRegion: chartRegion,
    resolveLandmark: resolveLandmark,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/cartography-survey.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/cartography-survey 已加载（2.400.0）');
  }
})();