/**
 * WorldAxis engines/fire-watch.js (v2.524.0) — EXV27-6 火政与走水
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   「走水 / 失火 / 火警」在 `engines/` **0 命中**。世界里有灾后余波（aftermath）、
 *   有踩踏（mob-stampede），但**火**这一层没有：哪条街起火、火了多大、水龙够不够、
 *   救不救得灭 —— 全靠旁白。火是前工业城市最大的日常灾难，不能没有账。
 *
 * ── 机制 ── `ignite` 起火（**由调用方声明**，材质 × 风势定初始火场）→ `muster` 调集
 *   （人手 / 水桶 / 距离算成真实扑救力）→ `fight` 扑救（力 ≥ 火场就灭，不够就延烧并
 *   报出还差多少）→ `loss` 损失入账。
 *
 * ── 边界 ── ① 不碰 store。② **不掷骰造灾**：起火不是概率事件，必须有人声明
 *   （雷火、纵火、灯棚走水都是叙事里发生的，不是本模块随机生出来的）。
 *   ③ 扑救结果按算术，不用随机数 —— 否则「救不灭」会变成甩骰子的借口。
 *   ④ 拒收码只用 `disabled`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_fire_watch_settings_v1';
  const DEF = { enabled: true, maxRows: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'fireWatch', bounds: { maxRows: [8, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function saveSettings(next) { shadow = null;
    if (!WA.settingsBus) { shadow = Object.assign({}, settings(), next || {}); return { ok: true }; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  const MATERIAL = { tile: 1, wood: 2, cloth: 3, thatch: 4, oil: 6 };
  const WIND = { none: 1, breeze: 1.5, gale: 2.5 };
  const stat = { ignitions: 0, extinguished: 0, spread: 0, losses: 0, lossTotal: 0, refused: 0, evicted: 0, lastReason: '' };
  const FIRES = [];
  function str(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : NaN; }
  function r2(v) { return +(Math.round(v * 100) / 100).toFixed(2); }
  function refuse(reason, hint) { stat.refused++; stat.lastReason = reason; return { ok: false, reason: reason, hint: hint }; }
  function find(id) { return FIRES.find(function (r) { return r.id === str(id); }); }
  function ignite(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const place = str(s.place), material = str(s.material) || 'wood', wind = str(s.wind) || 'none';
    if (!place) return refuse('missing-place', 'missing-place：哪条街 / 哪间铺子起火？');
    if (!MATERIAL[material]) return refuse('unknown-material',
      'unknown-material：瓦(tile) / 木(wood) / 布(cloth) / 茅草(thatch) / 油(oil) 五材其一 —— 材质决定烧得多快');
    if (!WIND[wind]) return refuse('unknown-wind', 'unknown-wind：无风(none) / 微风(breeze) / 大风(gale) 三档其一');
    if (FIRES.length >= cfg.maxRows) { FIRES.shift(); stat.evicted++; }
    const area = r2(MATERIAL[material] * WIND[wind]);
    const id = 'fw' + (++stat.ignitions);
    FIRES.push({ id: id, place: place, material: material, wind: wind, area: area,
      startArea: area, capacity: 0, status: 'burning', losses: [], at: s.at || null, by: str(s.by) || null });
    return { ok: true, id: id, area: area,
      hint: 'fire：' + place + ' 起火（' + material + '，' + wind + '），初始火场 ' + area + ' —— 现在要调人去扑' };
  }
  function muster(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = find(s.id);
    if (!rec) return refuse('unknown-fire', 'unknown-fire：没有这场在烧的火');
    if (rec.status !== 'burning') return refuse('not-burning', 'not-burning：这场火已经灭了');
    const men = num(s.men), buckets = num(s.buckets), distance = num(s.distance);
    if (!(men >= 0)) return refuse('missing-men', 'missing-men：来了多少人？');
    if (!(buckets >= 0)) return refuse('missing-buckets', 'missing-buckets：几副水桶 / 水龙？');
    if (!(distance >= 0)) return refuse('missing-distance', 'missing-distance：水源离火场多远？');
    rec.capacity = r2(men * 2 + buckets * 6 - distance * 3);
    return { ok: true, id: rec.id, capacity: rec.capacity,
      hint: rec.capacity < rec.area ? 'short-handed：扑救力 ' + rec.capacity + ' 抵不过火场 ' + rec.area + '，再不来人就烧过去了' : null };
  }
  function fight(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = find(s.id);
    if (!rec) return refuse('unknown-fire', 'unknown-fire：没有这场在烧的火');
    if (rec.status !== 'burning') return refuse('not-burning', 'not-burning：这场火已经灭了（别重复报功）');
    if (!(rec.capacity > 0)) return refuse('not-mustered', 'not-mustered：还没调人（先 muster 再说扑救）');
    if (rec.capacity >= rec.area) {
      rec.status = 'extinguished';
      stat.extinguished++;
      return { ok: true, id: rec.id, status: 'extinguished', area: rec.area, capacity: rec.capacity,
        hint: 'put-out：火灭了 —— 火场 ' + rec.area + '，扑救力 ' + rec.capacity };
    }
    const before = rec.area;
    rec.area = r2(rec.area * 1.5);
    stat.spread++;
    return { ok: true, id: rec.id, status: 'spreading', before: before, area: rec.area,
      gap: r2(rec.area - rec.capacity),
      hint: 'spread：扑不灭，从 ' + before + ' 延烧到 ' + rec.area + '（还差 ' + r2(rec.area - rec.capacity) + ' 扑救力）' };
  }
  function loss(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const rec = find(s.id);
    if (!rec) return refuse('unknown-fire', 'unknown-fire：没有这场火');
    const amount = num(s.amount), what = str(s.what);
    if (!(amount > 0)) return refuse('missing-amount', 'missing-amount：烧掉多少要落数');
    if (!what) return refuse('missing-what', 'missing-what：烧的是什么？只报数字等于没报');
    rec.losses.push({ what: what, amount: amount, unit: str(s.unit) || null, at: s.at || null });
    stat.losses++;
    stat.lossTotal = r2(stat.lossTotal + amount);
    return { ok: true, id: rec.id, losses: rec.losses.length, total: r2(rec.losses.reduce(function (a, r) { return a + r.amount; }, 0)) };
  }
  function view(id) {
    if (id) {
      const rec = find(id);
      return rec ? { ok: true, row: JSON.parse(JSON.stringify(rec)) } : { ok: false, hint: 'unknown-fire' };
    }
    return { ok: true, burning: FIRES.filter(function (r) { return r.status === 'burning'; }).length,
      rows: JSON.parse(JSON.stringify(FIRES)) };
  }
  function statView() { return Object.assign({}, stat); }
  function reset() {
    FIRES.length = 0;
    stat.ignitions = 0; stat.extinguished = 0; stat.spread = 0; stat.losses = 0;
    stat.lossTotal = 0; stat.refused = 0; stat.evicted = 0; stat.lastReason = '';
    return { ok: true };
  }
  WA.fireWatch = {
    ignite: ignite, muster: muster, fight: fight, loss: loss,
    view: view, stat: statView, reset: reset, setSettings: saveSettings, getSettings: settings
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/fire-watch.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/fire-watch 已加载（2.524.0）');
})();