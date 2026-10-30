/**
 * WorldAxis engines/save-health.js (v2.270.0) — 存档体检：这局还能跑多久 (EXV6-6)
 *
 * ── 它治什么（缺口，探针 tools/v6probes/p_storage6.js 立据）──────────────
 *   三个面各自知道一部分，但**没有任何一处把它们并成一句结论**：
 *     · `store.saveStat()` / `sizeAudit()` → 现在多大；
 *     · `storageForecast.forecast()`      → 到 50/75/90/100% 各差多少轮（**出厂关着**）；
 *     · `capacityAudit.waterline()`       → 哪些容器满了 / 快满（**出厂关着**）；
 *     · `capacityAudit.obligations()`     → 还有多少未完成义务（**出厂关着**）。
 *   实测出厂态：`forecast()` 直接返回 `{ok:false, reason:'disabled'}`、`waterline()` 同。
 *   于是「这局还能跑多久」在出厂态**一个字都答不出来**——不是没有数据，是没入口。
 *   本模块把四面并列成一张体检单，给一句「按当前增速约 N 轮后触顶，建议先做 M」。
 *
 * ── 四条不许（每一条都对应一类会把「没量到」写成「量出来很好」的读法）────
 *   ① **「预测器关着」≠「到不了顶」**：`forecast()` 返回 `disabled` 时本模块报
 *      `trend.available=false + reason='forecaster-off'`，`inRounds` 保持 `null`；
 *      把它折成 `null`（「到不了」）会让玩家以为余量无限。
 *   ② **「水位表关着」≠「零满容器」**：`waterline()` 关着时报 `waterline.available=false`，
 *      绝不报 `fullCount:0` —— 「没查」与「查了没满」是两件事。
 *   ③ **本模块不替别的引擎开开关**：缺哪个读数就如实指名 + 给出**开它的动作**，
 *      绝不在 `build()` 里悄悄 `setSettings` 别的引擎（那是「档位不是开关」的反面）。
 *   ④ **建议必须带来源**：每条 `advice` 都带 `from`（哪个读数推出来的），
 *      不许出现无依据的通用忠告 —— 那种建议读者无法复核，等同于编。
 *
 * ── 边界（全是否定式）────────────────────────────────────────────────
 *   · 纯读：零 `store.transact`、零 `localStorage`；只读四个既有读口；
 *   · 不清理、不裁剪、不迁移（处置权在写入侧与挤出侧，本模块只报）；
 *   · 不自带采样器（采样点归 `storage-forecast`，本模块不重复采）；
 *   · 不落盘：体检是瞬时读数，重启即可复算。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_save_health_settings_v1';
  const DEF = {
    enabled: true,
    warnRounds: 40,     // 趋势上少于这么多轮触顶 ⇒ 转 watch
    urgentRounds: 8,    // 少于这么多轮 ⇒ 转 urgent
    maxAdvice: 3        // 最多给几条处置建议（多了等于没建议）
  };
  const BOUNDS = { warnRounds: [5, 200], urgentRounds: [1, 50], maxAdvice: [1, 6] };
  const __REG = { key: LS_KEY, def: DEF, module: 'saveHealth', bounds: BOUNDS };
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
    builds: 0, healthy: 0, watch: 0, urgent: 0, noData: 0, disabled: 0,
    forecasterOff: 0, waterlineOff: 0, lastState: ''
  };

  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function str(v, max) { return String(v == null ? '' : v).slice(0, max || 48); }
  function safe(fn, fb) { try { const r = fn(); return (r === undefined) ? fb : r; } catch (e) { return fb; } }

  /**
   * 现在多大（唯一真源：store 的字节读数；两条路径都读不到就是读不到）。
   *
   *   ⚠ 本函数曾带 `{maxDepth:1,maxNodes:8}` 调 `sizeAudit` —— 那是**把截断读数当总额**：
   *   带参调用时节点预算只有 8，`truncated:true`。体检单上的「当前存档多大」必须是全量口径，
   *   否则「按当前增速多少轮触顶」的分母永远偏小 —— 而它看起来一如往常地正常。
   *
   * ⚠ **但 `total` 与「扫描截断」是两个独立真源**：`sizeAudit().total` 来自 `auditTotal()`
   *   （`memStateBytes()` 全量字节），**不随 `nodeBudget` / `maxDepth` 变**；截断只影响
   *   `arrays` 明细（哪些容器被列出来）。把 `truncated:true` 当作「total 不可信」是**误判**
   *   （第一版就这么写，专锁 B3 当场报 inRounds 为 null 抓出来）。
   *   故：① 不带参调用（拿默认预算的全量 total）；
   *       ② 只信 `total`（真源）；没有 `total` 时才退到 `totalBytes`，且**截断时不用**
   *          `totalBytes`（那个路径下它才是局部和）。
   */
  function currentBytes() {
    return safe(function () {
      if (WA.store && typeof WA.store.sizeAudit === 'function') {
        const r = WA.store.sizeAudit();
        // ① 真源：total（auditTotal = memStateBytes 全量，与节点预算无关）
        if (r && typeof r.total === 'number' && isFinite(r.total) && r.total > 0) return r.total;
        // ② 退路：totalBytes，但截断时它可能是局部和 ⇒ 不采信
        if (r && r.truncated !== true && typeof r.totalBytes === 'number' && isFinite(r.totalBytes)) return r.totalBytes;
        // ③ total 为 0 且未截断 ⇒ 空存档，0 是真读数
        if (r && r.truncated !== true && typeof r.total === 'number' && r.total === 0) return 0;
      }
      if (WA.store && typeof WA.store.saveStat === 'function') {
        const s = WA.store.saveStat();
        // 落盘失败（`ok:false`）时 `bytes` 是上次成功的陈旧值 —— 拿它当「现在多大」会低报。
        if (s && s.ok === true && typeof s.bytes === 'number' && isFinite(s.bytes)) return s.bytes;
      }
      return null;
    }, null);
  }

  /**
   * 体检主口。**纯读**：不写 store、不跑别的引擎的写口、不采样。
   * @returns {object} `state` ∈ `disabled` / `no-data` / `healthy` / `watch` / `urgent`
   */
  function build(opts) {
    const cfg = Object.assign({}, settings(), opts || {});
    __stat.builds++;
    if (cfg.enabled !== true) {
      __stat.disabled++; __stat.lastState = 'disabled';
      return { ok: false, reason: 'disabled', state: 'disabled',
        bytes: null, quotaBytes: null, usedPct: null, advice: [],
        line: '存档体检已停用（设置页可开）' };
    }

    // ── 面 1：当前字节（不需要任何别的引擎开着）──────────────────────────
    const bytes = currentBytes();
    if (bytes === null) {
      __stat.noData++; __stat.lastState = 'no-data';
      return { ok: false, reason: 'no-bytes', state: 'no-data',
        bytes: null, quotaBytes: null, usedPct: null, advice: [],
        note: '读不到持久化字节数（store 的两个字节读数口都不在场）—— 没量到不等于没占空间',
        line: '存档体检：读不到体积读数（这一格是「没量到」，不是「很空」）' };
    }

    // ── 面 2：趋势外推（**出厂关着**，故两种「没有轮数」必须分开）──────────
    const fc = safe(function () {
      return (WA.storageForecast && typeof WA.storageForecast.forecast === 'function')
        ? WA.storageForecast.forecast() : null;
    }, null);
    let trend;
    if (!fc) {
      trend = { available: false, reason: 'forecaster-absent', inRounds: null, slope: null, samples: null, quotaMB: null };
    } else if (fc.ok === true) {
      // 取 100% 那一档作为「触顶」，取 90% 作为「该动手了」。
      const top = (fc.rows || []).filter(function (r) { return r.level === 1; })[0] || null;
      const near = (fc.rows || []).filter(function (r) { return r.level === 0.9; })[0] || null;
      trend = { available: true, reason: null,
        inRounds: top ? top.inRounds : null,
        nearRounds: near ? near.inRounds : null,
        slope: num(fc.slopeBytesPerRound), samples: num(fc.samples),
        windowRounds: num(fc.windowRounds), quotaMB: num(fc.quotaMB),
        lastBytes: num(fc.lastBytes),
        note: '趋势外推（线性最小二乘），不是精确预言' };
    } else {
      // ★ 「到不了顶」「读数不够」「关着」「不在场」都是 ok:false，必须分列 ——
      //   混成一栏就再也分不出「关着（可开）」与「样本不足（再跑几轮就有）」。
      //   注：`disabled` 与 `forecaster-absent` 都是「没量到」，但**处置动作不同**
      //   （前者去设置页开、后者是装载问题），故不合并成一个码。
      const why = str(fc.reason, 32);
      trend = { available: false, reason: why, inRounds: null,
        slope: null, samples: num(fc.samples), quotaMB: null,
        need: num(fc.need), note: '趋势面没有可用读数（reason 见上）' };
    }

    // ── 面 3：水位（满 / 近满容器）────────────────────────────────────────
    const wl = safe(function () {
      return (WA.capacityAudit && typeof WA.capacityAudit.waterline === 'function')
        ? WA.capacityAudit.waterline() : null;
    }, null);
    let waterline;
    if (!wl) {
      waterline = { available: false, reason: 'audit-absent', rows: [], full: [], fullCount: null, nearCount: null };
    } else if (wl.ok === true) {
      waterline = { available: true, reason: null,
        rows: Array.isArray(wl.rows) ? wl.rows : [],
        full: Array.isArray(wl.full) ? wl.full.map(function (x) { return str(x, 64); }) : [],
        fullCount: num(wl.fullCount) || 0, nearCount: num(wl.nearCount) || 0,
        wildcardSkipped: Array.isArray(wl.wildcardSkipped) ? wl.wildcardSkipped.length : 0,
        persistedBytes: num(wl.persistedBytes) };
    } else {
      waterline = { available: false, reason: str(wl.reason, 32), rows: [], full: [], fullCount: null, nearCount: null };
    }

    // ── 面 4：未完成义务（不裁剪，只清点）────────────────────────────────
    const ob = safe(function () {
      return (WA.capacityAudit && typeof WA.capacityAudit.obligations === 'function')
        ? WA.capacityAudit.obligations() : null;
    }, null);
    let obligations;
    if (!ob) {
      obligations = { available: false, reason: 'audit-absent', total: null, perSource: {}, capped: false };
    } else if (ob.ok === true) {
      obligations = { available: true, reason: null,
        total: num(ob.total) || 0, shown: num(ob.count) || 0,
        perSource: Object.assign({}, ob.perSource || {}), capped: ob.capped === true,
        disabled: Array.isArray(ob.disabled) ? ob.disabled.slice() : [] };
    } else {
      obligations = { available: false, reason: str(ob.reason, 32), total: null, perSource: {}, capped: false };
    }

    // ── 判态：四态按优先级，读不到的面**不进判据**（不许当 0）──────────────
    //   额度（quotaBytes）**只从趋势面拿**：那是唯一声明了「按哪个体量算」的地方
    //   （`lsQuotaMB`）。趋势面关着 ⇒ 额度就是 `null`，`usedPct` 也 `null` ——
    //   拿别处的数字凑一个额度，正是本仓最忌的「编一个读数」。
    const quotaBytes = (trend.available && num(trend.quotaMB)) ? Math.round(num(trend.quotaMB) * 1024 * 1024) : null;
    const usedPct = (quotaBytes !== null && quotaBytes > 0) ? Math.round((bytes / quotaBytes) * 1000) / 10 : null;

    let state = 'healthy';
    const overQuota = (quotaBytes !== null && bytes >= quotaBytes);
    const hasFull = (waterline.available && waterline.fullCount > 0);
    if (overQuota || hasFull) state = 'urgent';
    else if (trend.available && trend.inRounds !== null && trend.inRounds <= cfg.urgentRounds) state = 'urgent';
    else if (waterline.available && waterline.nearCount > 0) state = 'watch';
    else if (trend.available && trend.inRounds !== null && trend.inRounds <= cfg.warnRounds) state = 'watch';
    else if (!trend.available && !waterline.available && !obligations.available) state = 'no-data';

    // ── 建议：每条都带 from（哪个读数推出来的），按来源稳定序 ──────────────
    const advice = [];
    if (!trend.available) {
      // 三种「趋势未知」的处置动作**不同**，故分开写 —— 合成一条通用忠告就等于没忠告。
      const why = trend.reason;
      const t = (why === 'disabled')
        ? '存储水位预测关着（`worldaxis_storage_forecast_v1`），所以这张体检单答不出「还能跑多久」。开它：设置页「存档体检」一格里的『趋势面』开关，或 storageForecast.setSettings({enabled:true})'
        : (why === 'insufficient-samples')
          ? ('水位预测样本不够（现有 ' + (trend.samples || 0) + ' / 需 ' + (trend.need || 0) + ' 条）—— 再推演几轮就会有读数，这一格现在没有读数是对的')
          : (why === 'forecaster-absent')
            ? 'engines/storage-forecast.js 不在场（装载问题，不是配置问题）'
            : ('趋势面读数不可用（' + (why || 'unknown') + '）');
      advice.push({ code: 'forecaster-' + (why || 'unknown'), from: 'storageForecast.forecast', text: t });
    }
    if (!waterline.available) {
      advice.push({ code: 'waterline-' + (waterline.reason || 'unknown'), from: 'capacityAudit.waterline',
        text: waterline.reason === 'disabled'
          ? '容器水位表关着（`worldaxis_capacity_audit_v1`），所以「哪个容器满了」这一问没有答案。开它：设置页「存档体检」一格里的『水位面』开关。关着不等于没满'
          : ('容器水位读数不可用（' + (waterline.reason || 'unknown') + '）—— 没查不等于没满') });
    }
    if (obligations.available !== true) {
      advice.push({ code: 'obligations-' + (obligations.reason || 'unknown'), from: 'capacityAudit.obligations',
        text: '未完成义务清点不可用（' + (obligations.reason || 'unknown') + '）—— 这一格「没清点」，不是「没有未完成的事」' });
    }
    if (hasFull) {
      advice.push({ code: 'containers-full', from: 'capacityAudit.waterline.full',
        text: '已有 ' + waterline.fullCount + ' 个容器到顶：' + waterline.full.slice(0, 3).join('、')
          + '。写入侧满即拒收，不会截断既有项 —— 先处理这些更省事' });
    }
    if (waterline.available && waterline.nearCount > 0) {
      advice.push({ code: 'containers-near', from: 'capacityAudit.waterline.nearCount',
        text: '另有 ' + waterline.nearCount + ' 个容器接近上限' });
    }
    if (trend.available && trend.inRounds !== null && trend.inRounds <= cfg.warnRounds) {
      advice.push({ code: 'trend-near', from: 'storageForecast.forecast',
        text: '按当前增速约 ' + trend.inRounds + ' 轮后触顶（外推，非预言；增速变化后应重新采样）' });
    }
    if (obligations.available && obligations.total > 0) {
      advice.push({ code: 'obligations-open', from: 'capacityAudit.obligations',
        text: '还有 ' + obligations.total + ' 条未完成义务挂在世界状态里'
          + (obligations.capped ? '（表格只显示前 ' + obligations.shown + ' 条，未显示不等于不存在）' : '') });
    }
    const adviceOut = advice.slice(0, Math.max(1, cfg.maxAdvice));

    if (state === 'healthy') __stat.healthy++;
    else if (state === 'watch') __stat.watch++;
    else if (state === 'urgent') __stat.urgent++;
    else __stat.noData++;
    if (!trend.available) __stat.forecasterOff++;
    if (!waterline.available) __stat.waterlineOff++;
    __stat.lastState = state;

    return {
      ok: true, state: state,
      bytes: bytes, quotaBytes: quotaBytes, usedPct: usedPct,
      overflow: overQuota,
      trend: trend, waterline: waterline, obligations: obligations,
      advice: adviceOut, adviceTotal: advice.length,
      note: (!trend.available || !waterline.available)
        ? ('这张体检单有缺口：' + (!trend.available ? '趋势面缺失 ' : '') + (!waterline.available ? '水位面缺失' : '') + '—— 缺口不等于健康')
        : null,
      line: line(state, bytes, usedPct, waterline, trend, adviceOut)
    };
  }

  /** 人话一行：面板整行逐字取它（与其它 V6 读数模块同规）。 */
  function line(state, bytes, usedPct, waterline, trend, advice) {
    if (state === 'disabled') return '存档体检已停用（设置页可开）';
    const parts = [];
    parts.push('当前存档 ' + fmtBytes(bytes) + (usedPct !== null ? '（约占额度 ' + usedPct + '%）' : ''));
    if (waterline.available) {
      parts.push(waterline.fullCount > 0
        ? ('有 ' + waterline.fullCount + ' 个容器已满')
        : (waterline.nearCount > 0 ? (waterline.nearCount + ' 个容器接近上限') : '无容器触顶'));
    } else {
      parts.push('容器水位未查');
    }
    if (trend.available) {
      parts.push(trend.inRounds === null
        ? '按当前增速不会触顶'
        : ('按当前增速约 ' + trend.inRounds + ' 轮后触顶'));
    } else {
      parts.push('趋势未知');
    }
    const head = (state === 'urgent') ? '存档体检：需要处理'
      : (state === 'watch' ? '存档体检：值得看一眼'
        : (state === 'no-data' ? '存档体检：读不全（不等于健康）' : '存档体检：状况良好'));
    const tail = advice.length ? ('；建议：' + advice.map(function (x) { return x.text; }).join('；')) : '';
    return head + ' —— ' + parts.join('，') + tail;
  }
  function fmtBytes(n) {
    const v = num(n);
    if (v === null) return '?';
    if (v >= 1024 * 1024) return (Math.round((v / (1024 * 1024)) * 10) / 10) + 'MB';
    if (v >= 1024) return (Math.round((v / 1024) * 10) / 10) + 'KB';
    return v + 'B';
  }

  function stat() {
    return {
      enabled: settings().enabled !== false,
      warnRounds: settings().warnRounds, urgentRounds: settings().urgentRounds,
      builds: __stat.builds, healthy: __stat.healthy, watch: __stat.watch,
      urgent: __stat.urgent, noData: __stat.noData, disabled: __stat.disabled,
      forecasterOff: __stat.forecasterOff, waterlineOff: __stat.waterlineOff,
      lastState: __stat.lastState,
      sources: {
        store: !!(WA.store && (typeof WA.store.sizeAudit === 'function' || typeof WA.store.saveStat === 'function')),
        storageForecast: !!(WA.storageForecast && typeof WA.storageForecast.forecast === 'function'),
        capacityAudit: !!(WA.capacityAudit && typeof WA.capacityAudit.waterline === 'function'
          && typeof WA.capacityAudit.obligations === 'function')
      }
    };
  }
  function reset() {
    __stat.builds = 0; __stat.healthy = 0; __stat.watch = 0; __stat.urgent = 0;
    __stat.noData = 0; __stat.disabled = 0; __stat.forecasterOff = 0;
    __stat.waterlineOff = 0; __stat.lastState = '';
    return { ok: true };
  }

  WA.saveHealth = {
    DEF: Object.assign({}, DEF),
    BOUNDS: BOUNDS,
    getSettings: settings,
    setSettings: saveSettings,
    build: build,
    stat: stat,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/save-health.js', { kind: 'engine', ver: '2.270.0' });
  }
  if (WA.log) WA.log('info', '存档体检已加载（只读聚合）');
})();