/**
 * WorldAxis engines/save-curve.js (v2.523.0)
 * OPV27-3 存档体积曲线：空局骨架 9802 字节、最大容器 evolution 595B —— 此前**没有任何长局曲线**：
 *   10 / 50 / 200 轮存档多大、哪个容器涨得最快，全仓无人回答。本模块建这张账。
 *
 * 口径（三条，都是否定式）：
 *   1 **不写存档**：采样只读 `store.saveStat()` 与 `store.sizeAudit()`，读数活在内存 ring 里。
 *      存档曲线探针如果自己写档，量到的就是「带探针的档」，曲线立刻失真。
 *   2 **不猜轮数**：轮数由调用方给（`sample('第10轮', {rounds:10})`）——本模块不知道回合怎么算，
 *      替调用方猜轮数会让曲线看起来比实际更漂亮。
 *   3 **不裁剪**：裁剪是产品行为变更，必须先有曲线作依据；本模块只给「涨最快的是谁」，
 *      具体裁哪个容器由后续版本按这张排名决定（本轮只裁了排名所指示的那一处，见 report 末尾）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_save_curve_settings_v1';
  const DEF = { enabled: true, topN: 12, cap: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'saveCurve', bounds: { topN: [3, 30], cap: [4, 40] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign({}, base, raw || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { samples: 0, off: 0, lastLabel: '', lastBytes: 0, lastMem: 0 };
  const samples = [];   // [{label, rounds, at, bytes, memTotal, top:[{path,bytes,len}]}]

  function human(bytes) {
    const b = Number(bytes) || 0;
    if (b < 1024) return b + 'B';
    if (b < 1024 * 1024) return (Math.round((b / 1024) * 10) / 10) + 'KB';
    return (Math.round((b / 1048576) * 100) / 100) + 'MB';
  }

  /** sample(label, opts) —— 采一个点。opts.rounds 由调用方给（本模块不猜轮数）。 */
  function sample(label, opts) {
    const o = opts || {};
    const s = settings();
    if (!s.enabled) { stat.off++; return { ok: false, reason: 'disabled', text: '存档曲线账已关闭（settings.saveCurve.enabled=false）' }; }
    const audit = (WA.store && typeof WA.store.sizeAudit === 'function')
      ? WA.store.sizeAudit({ topN: s.topN, maxDepth: 3, minBytes: 64 }) : null;
    if (!audit || audit.error) {
      return { ok: false, reason: 'no-audit',
        text: '读不到容器体检（sizeAudit 不可用：' + String((audit && audit.error) || '未知') + '）' };
    }
    const st = (WA.store && typeof WA.store.saveStat === 'function') ? (WA.store.saveStat() || {}) : {};
    const row = {
      label: String(label == null ? ('#' + (samples.length + 1)) : label),
      rounds: (typeof o.rounds === 'number' && isFinite(o.rounds)) ? o.rounds : null,
      at: clockNow('saveCurve'),
      bytes: (typeof st.bytes === 'number') ? st.bytes : 0,
      memTotal: (typeof audit.total === 'number') ? audit.total : 0,
      top: (audit.arrays || []).slice(0, s.topN).map(function (r) {
        return { path: r.path, bytes: r.bytes || 0, len: r.len || 0 };
      })
    };
    samples.push(row);
    while (samples.length > s.cap) samples.shift();
    stat.samples++; stat.lastLabel = row.label; stat.lastBytes = row.bytes; stat.lastMem = row.memTotal;
    return {
      ok: true, row: row, curve: curve(),
      text: '存档曲线点「' + row.label + '」：' + human(row.bytes) + ' 落盘 / ' + human(row.memTotal) + ' 内存'
        + (row.rounds != null ? '（第 ' + row.rounds + ' 轮）' : '')
    };
  }

  /** curve()：逐点差分——「哪一段涨得最猛」是曲线里最有用的那一列。 */
  function curve() {
    const pts = samples.map(function (r, i) {
      const prev = i > 0 ? samples[i - 1] : null;
      return {
        label: r.label, rounds: r.rounds, bytes: r.bytes, memTotal: r.memTotal,
        dBytes: prev ? (r.bytes - prev.bytes) : 0,
        dMem: prev ? (r.memTotal - prev.memTotal) : 0,
        pct: (prev && prev.bytes) ? Math.round(((r.bytes - prev.bytes) / prev.bytes) * 1000) / 10 : 0
      };
    });
    return { ok: true, points: pts, count: pts.length, text: curveText(pts) };
  }

  function curveText(pts) {
    if (!pts.length) return '存档曲线：还没有采样点';
    const head = pts[0], tail = pts[pts.length - 1];
    const growth = tail.bytes - head.bytes;
    const pct = head.bytes ? Math.round((growth / head.bytes) * 1000) / 10 : 0;
    return '存档曲线：' + head.label + ' ' + human(head.bytes) + ' → ' + tail.label + ' ' + human(tail.bytes)
      + '（' + (growth >= 0 ? '+' : '') + human(growth) + ' / ' + (growth >= 0 ? '+' : '') + pct + '%）';
  }

  /**
   * growth()：容器增长排名（首样本 → 末样本）。
   * 这是「真裁剪该裁谁」的唯一依据——不按直觉裁，按这张表裁。
   */
  function growth() {
    if (samples.length < 2) return { ok: false, reason: 'too-few-samples', rows: [], text: '至少两个采样点才能算增长' };
    const first = samples[0], last = samples[samples.length - 1];
    const base = {};
    first.top.forEach(function (r) { base[r.path] = r.bytes; });
    const seen = {};
    const rows = [];
    last.top.forEach(function (r) {
      seen[r.path] = true;
      const b = base[r.path] || 0;
      rows.push({ path: r.path, from: b, to: r.bytes, delta: r.bytes - b,
        pct: b ? Math.round(((r.bytes - b) / b) * 1000) / 10 : null, len: r.len });
    });
    // 首样本里有、末样本 TOP 里掉了的容器：算负增长（真掉出排名也是信息）
    first.top.forEach(function (r) {
      if (seen[r.path]) return;
      rows.push({ path: r.path, from: r.bytes, to: 0, delta: -r.bytes, pct: -100, len: 0 });
    });
    rows.sort(function (a, b) { return (b.delta - a.delta) || (a.path < b.path ? -1 : 1); });
    return {
      ok: true, from: first.label, to: last.label, rows: rows,
      text: '容器增长（' + first.label + ' → ' + last.label + '）：'
        + (rows.length ? rows.slice(0, 3).map(function (r) {
          return r.path + ' ' + (r.delta >= 0 ? '+' : '') + human(r.delta);
        }).join(' · ') : '无')
    };
  }

  function report() {
    return { ok: true, curve: curve(), growth: growth(), samples: samples.slice(), text: curveText(curve().points) };
  }

  WA.saveCurve = {
    sample: sample, curve: curve, growth: growth, report: report,
    human: human, settings: settings,
    reset: function () { samples.length = 0; return { ok: true, text: '曲线已清空（只清内存，不动存档）' }; },
    stat: function () { return Object.assign({}, stat); }
  };
  // 装载面登记与自述行：与全部引擎同形态（少这两行会在装载汇报里被算成「未自述」，
  //   而 module-registry 的装载期边也要靠 registerModule 才能记到这台）。
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/save-curve.js', { kind: 'engine', ver: '2.523.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/save-curve 已加载（2.523.0）');
})();