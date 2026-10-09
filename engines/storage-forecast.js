/**
 * WorldAxis engines/storage-forecast.js (v2.152.0) — 存储水位预测（RP7）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   容量治理答「当前超没超 cap」，sizeAudit 答「哪些容器多大」，但
 *   「按当前增速，多少轮后会撑爆」无人回答。用户问「这局还能玩多久」时，
 *   现有读数只能答「现在没事」，答不了「趋势上还有多久」。
 *   一句话：**水位现在多高有人知道，水位什么时候漫过堤没人知道。**
 *
 * ── 本模块落点 ────────────────────────────────────────────────
 *   · sample(round)          — 每轮结算后由调用方采一次总字节数（本模块不自己
 *       枚举存储——枚举口径在 store.sizeAudit，本模块只收时间序列）；
 *   · forecast()             — 最小二乘外推：按样本序列预测到达各档阈值的轮数。
 *   阈值档（lsQuota 可配，默认 5MB——SillyTavern localStorage 的常见配额）。
 *
 * ── 与既有模块的分工 ─────────────────────────────────────────
 *   · sizeAudit / sizeAuditFull（store）— **当前**体积与超限明细；
 *   · maintain（巡视）— 健康分与整改建议；
 *   · 本模块 — **趋势外推**。三者的口径不同：体积是瞬时量，趋势需要历史，
 *     而历史只有本模块持有。不与 sizeAudit 合并：合并会让「体积读数」与
 *     「预测读数」互相污染（预测需要清零重来时体积读数不该跟着清）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 只读存储（本模块不写任何键；样本在内存环里，不落盘——与 perfLedger 同口径）。
 *   2 不自动清理（预测面不是清理器；维持 maintain 的「只报不动」纪律）。
 *   3 样本不足不假装（少于 minSamples 时如实报 insufficient-samples，
 *     绝不拿两个点外推出「还能玩一万轮」）。
 *   4 外推就是外推（预测读数带样本数与窗口说明，
 *     「趋势外推，不是精确预言」写进读数本体）。
 *   5 有界：样本环有 cap，预测器自身不许撑爆内存。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_storage_forecast_v1';
  const __REG = { key: LS_KEY,
    def: { enabled: false, lsQuotaMB: 5, minSamples: 6 },
    module: 'storageForecast',
    bounds: { lsQuotaMB: [1, 50], minSamples: [3, 40] } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = { enabled: false, lsQuotaMB: 5, minSamples: 6 };
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const CAP_SAMPLES = 120;
  const ring = [];      // [{ round, bytes }]
  const _stat = { samples: 0, rejected: 0, forecasts: 0, lastReason: '', faults: {} };

  function note(code) { _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  function totalBytes() {
    // 单一真源：store 的字节数读数（auditTotal 在 store 内部派生 memCache/saveStat）。
    try {
      if (WA.store && typeof WA.store.sizeAudit === 'function') {
        const r = WA.store.sizeAudit({ maxDepth: 1, maxNodes: 8 });
        if (r && typeof r.totalBytes === 'number' && isFinite(r.totalBytes)) return r.totalBytes;
      }
      if (WA.store && typeof WA.store.saveStat === 'function') {
        const s = WA.store.saveStat();
        if (s && typeof s.bytes === 'number') return s.bytes;
      }
    } catch (e) {}
    return null;
  }

  /**
   * 采一次样本。**必须在轮结算后调用**（一采就是本轮水位的锚点）。
   * @param {number} [round]  轮次（缺省用已有样本数 +1）
   */
  function sample(round) {
    if (!settings().enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const r = (typeof round === 'number' && isFinite(round) && round >= 0) ? round : ring.length + 1;
    const b = totalBytes();
    if (b === null) { note('no-bytes'); return { ok: false, reason: 'no-bytes' }; }
    if (ring.length && r <= ring[ring.length - 1].round) { note('non-monotonic'); return { ok: false, reason: 'non-monotonic', round: r, last: ring[ring.length - 1].round }; }
    ring.push({ round: r, bytes: b });
    if (ring.length > CAP_SAMPLES) ring.splice(0, ring.length - CAP_SAMPLES);
    _stat.samples++;
    return { ok: true, round: r, bytes: b, count: ring.length };
  }

  /** 最小二乘斜率与截距（bytes/round）。 */
  function lsq() {
    const n = ring.length;
    if (n < 2) return null;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of ring) { sx += p.round; sy += p.bytes; sxx += p.round * p.round; sxy += p.round * p.bytes; }
    const d = n * sxx - sx * sx;
    if (d === 0) return null;
    const slope = (n * sxy - sx * sy) / d;
    const inter = (sy - slope * sx) / n;
    return { slope: slope, inter: inter, n: n };
  }

  /** 到达某阈值所需的轮数（从最后一个样本起算）。null = 按当前趋势到不了。 */
  function roundsTo(thresholdBytes) {
    const f = lsq();
    if (!f) return null;
    const last = ring[ring.length - 1];
    if (f.slope <= 0) return null;                       // 不增长（或收缩）⇒ 永不漫堤
    const at = (thresholdBytes - f.inter) / f.slope;     // 拟合线到达阈值的轮次
    const r = Math.ceil(at - last.round);
    return (r > 0 && isFinite(r)) ? r : 0;
  }

  /**
   * 水位预测（只读）。
   * @returns {{ok:boolean, reason?:string, rows?:Array, samples?:number, slope?:number, quotaMB?:number, note?:string}}
   */
  function forecast() {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    if (ring.length < cfg.minSamples) {
      note('insufficient-samples');
      return { ok: false, reason: 'insufficient-samples', samples: ring.length, need: cfg.minSamples };
    }
    const f = lsq();
    if (!f) { note('flat-rounds'); return { ok: false, reason: 'flat-rounds', samples: ring.length }; }
    const quotaBytes = cfg.lsQuotaMB * 1024 * 1024;
    const last = ring[ring.length - 1];
    const rows = [0.5, 0.75, 0.9, 1.0].map(function (frac) {
      const r = roundsTo(quotaBytes * frac);
      return { level: frac, bytes: Math.round(quotaBytes * frac), inRounds: r };
    });
    _stat.forecasts++;
    return { ok: true, samples: ring.length, windowRounds: last.round - ring[0].round + 1,
      slopeBytesPerRound: +f.slope.toFixed(1), lastBytes: last.bytes, quotaMB: cfg.lsQuotaMB,
      rows: rows, note: '趋势外推（线性最小二乘），不是精确预言；增速变化后应重新采样' };
  }

  function stat() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults),
      enabled: !!settings().enabled, samplesInRing: ring.length, cap: CAP_SAMPLES,
      firstRound: ring.length ? ring[0].round : null, lastRound: ring.length ? ring[ring.length - 1].round : null,
      lastBytes: ring.length ? ring[ring.length - 1].bytes : null });
  }
  function reset() { ring.length = 0; _stat.samples = 0; _stat.rejected = 0; _stat.forecasts = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.storageForecast = { sample: sample, forecast: forecast, stat: stat, reset: reset,
    getSettings: settings, setSettings: saveSettings };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/storage-forecast.js', { kind: 'engine', ver: '2.152.0' });
})();