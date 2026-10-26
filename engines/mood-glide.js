/**
 * WorldAxis engines/mood-glide.js (v2.250.0) — MG-1 情绪惯性、半衰期回落与思念累积
 *
 * ── 它治什么（两种反向失真，同一条曲线治）───────────────────────────
 *   本仓的情绪面只有 `affect.channels`（一次性事件标记）与 `affect.loads`（疲劳/饥饿/疼痛/
 *   社交消耗四载荷）。两者都是**瞬时量**，没有时间轴。于是弱模型在情绪上只会犯相反的两种错：
 *     · **一吵永久记仇**：一场口角写进「关系冷淡」之后就再没回暖过，十轮后仍在冷脸；
 *     · **分开十年不惦记**：离别久到不像话，情绪曲线却平得像没发生过。
 *   两种错的根是同一个：**情绪没有回落速率，也没有累积项**。
 *
 * ── 机制（VAD 三轴 + 半衰期 + 思念项）──────────────────────────────
 *   每个角色一条情绪坐标 `{v, a, d, at}`（效价 / 唤醒 / 支配），全部落在 [-1,1]：
 *     · `set()` 写一次冲击 —— 但**按强度与半衰期**衰减，不写死标签；
 *     · `glide()` 推进：`v/a/d` 各自以半衰期向该角色的**基线**回落（`halfLifeMinutes`）；
 *     · `miss()` 累积思念：分离越久思念越高，封顶后只抬 amity 不抬唤醒
 *       —— 「惦记」是缓的，不是每一次都想冲上去抱住。
 *   基线（`baseline`）是性格使然的东西：冷淡的人基线偏负，热闹的人基线偏正。回落**回基线**，
 *   不是回 0 —— 回 0 会让所有角色慢慢变成同一个中性人。
 *
 * ── 七条否定式边界 ────────────────────────────────────────────────
 *   ① 总开关默认关闭；关闭时 `glide()` 不出读数、不推进。
 *   ② 半衰期取**分钟**，全部由 `halfLifeMinutes` 派生；0/非法值回落到默认，不除零。
 *   ③ 回落目标**必须是基线**（`baseline`），不是 0（见上，「都变中性人」是主要失真）。
 *   ④ 三轴一律夹在 [-1,1]，浮点漂移不得让效价跑到 -1.0000002；
 *   ⑤ 思念（`longing`）是**独立维度**：封顶后不再增长，但也不衰减到 0（人走了仍然是惦记的）。
 *   ⑥ 基线只能是对象里**声明过的键**，未知键不收（否则一条拼写错误会静默生效）。
 *   ⑦ 每个角色一条坐标，容器有硬上界（`maxMoods`），满了按 `at` 最旧挤出并记账。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_mood_glide_settings_v1';
  const DEF = {
    enabled: false,
    halfLifeMinutes: 180,     // 半衰期：默认三小时，一次闹脾气到天黑就淡了
    longingRate: 0.06,        // 分离每分钟的思念增量（封顶见 longingCap）
    longingCap: 1.0,
    baselinePull: 0.5,        // 回落贴合基线的强度（1 = 按 halfLifeMinutes 本身回落；0.5 = 有效半衰期翻倍）
    maxMoods: 24,
    clampStep: 0.34           // 单次 `set()` 的最大步进（防一步写满整轴）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'moodGlide', bounds: { halfLifeMinutes: [10, 1440], longingRate: [0.005, 0.3], baselinePull: [0.1, 1], maxMoods: [4, 48] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    if (WA.settingsBus && WA.settingsBus.normalize) return WA.settingsBus.normalize(__REG, merged);
    return merged;
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (!WA.settingsBus || !WA.settingsBus.saveOrThrow) return { ok: false, reason: 'no-bus' };
    try { return { ok: true, settings: WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)) }; }
    catch (e) { return { ok: false, reason: 'save-failed', detail: e && e.message }; }
  }

  const AXES = ['v', 'a', 'd'];
  const AXIS_CN = { v: '好恶', a: '激动', d: '强势' };
  const BASELINE_KEYS = ['v', 'a', 'd'];
  const BASE_ZERO = { v: 0, a: 0, d: 0 };
  const stat = {
    sets: 0, glides: 0, misses: 0, evicted: 0, rejected: 0,
    lastReason: '', faults: {}
  };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : String(v || '').trim().slice(0, max || 40); }
  function clamp(x) { return Math.max(-1, Math.min(1, x)); }
  function num(v, def) { const n = Number(v); return isFinite(n) ? n : def; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }

  function moods(root) {
    const r = root || state();
    const m = r.moodGlide;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return { moods: {}, baselines: {} };
    if (!m.moods || typeof m.moods !== 'object' || Array.isArray(m.moods)) m.moods = {};
    if (!m.baselines || typeof m.baselines !== 'object' || Array.isArray(m.baselines)) m.baselines = {};
    return m;
  }

  /** 登记基线（性格使然的落点）。只收 v/a/d 三个声明过的键，别键不收。 */
  function setBaseline(person, base) {
    const who = clean(person, 40);
    if (!who) { stat.rejected++; noteFault('missing-person'); return { ok: false, reason: 'missing-person' }; }
    const src = base || {};
    const out = {};
    let any = false;
    BASELINE_KEYS.forEach(function (k) {
      if (src[k] === undefined || src[k] === null) return;
      const n = Number(src[k]);
      if (!isFinite(n)) return;
      out[k] = clamp(n); any = true;
    });
    if (!any) { stat.rejected++; noteFault('missing-baseline'); return { ok: false, reason: 'missing-baseline' }; }
    try {
      WA.store.transact(function (draft) {
        const m = (draft.moodGlide && typeof draft.moodGlide === 'object' && !Array.isArray(draft.moodGlide))
          ? draft.moodGlide : { moods: {}, baselines: {} };
        m.baselines = (m.baselines && typeof m.baselines === 'object' && !Array.isArray(m.baselines)) ? m.baselines : {};
        m.baselines[who] = Object.assign({}, BASE_ZERO, m.baselines[who] || {}, out);
        draft.moodGlide = m;
      }, 'moodGlide:baseline');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    return { ok: true, person: who, baseline: out };
  }

  function baselineOf(who) {
    const m = moods();
    const b = m.baselines[who];
    if (!b || typeof b !== 'object') return Object.assign({}, BASE_ZERO);
    return { v: num(b.v, 0), a: num(b.a, 0), d: num(b.d, 0) };
  }

  /**
   * 写一次情绪冲击。**不写标签写轴**：给多少就挪多少，单次步进受 clampStep 限制。
   * @param {string} person
   * @param {{v?:number,a?:number,d?:number,why?:string}} delta
   */
  function set(person, delta) {
    const cfg = settings();
    if (!cfg.enabled) { stat.rejected++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(person, 40);
    if (!who) { stat.rejected++; noteFault('missing-person'); return { ok: false, reason: 'missing-person' }; }
    const d = delta || {};
    const step = Math.max(0.01, Math.min(1, num(cfg.clampStep, 0.34)));
    const moved = {};
    let any = false;
    AXES.forEach(function (k) {
      if (d[k] === undefined || d[k] === null) return;
      const n = Number(d[k]);
      if (!isFinite(n) || n === 0) return;
      moved[k] = clamp(Math.max(-step, Math.min(step, n))); any = true;
    });
    if (!any) { stat.rejected++; noteFault('missing-delta'); return { ok: false, reason: 'missing-delta' }; }
    const at = clockWall();
    let out = null;
    try {
      WA.store.transact(function (draft) {
        const m = (draft.moodGlide && typeof draft.moodGlide === 'object' && !Array.isArray(draft.moodGlide))
          ? draft.moodGlide : { moods: {}, baselines: {} };
        m.moods = (m.moods && typeof m.moods === 'object' && !Array.isArray(m.moods)) ? m.moods : {};
        // 新角色首写以**基线**为初值（不是 0）：基线是性格使然的落点，从 0 起会把「本来就
        //   冷淡的人」先写成中性人，再让 glide 一路往基线爬 —— 白白绕一大圈，且第一次冲击的
        //   落点与注入块读数全是错的。基线没登记过才退化到 0。
        const seedBase = (m.baselines && m.baselines[who]) || BASE_ZERO;
        const cur = m.moods[who] || { v: num(seedBase.v, 0), a: num(seedBase.a, 0), d: num(seedBase.d, 0), longing: 0, at: at };
        AXES.forEach(function (k) { cur[k] = clamp(num(cur[k], 0) + num(moved[k], 0)); });
        cur.longing = Math.max(0, Math.min(num(cfg.longingCap, 1), num(cur.longing, 0)));
        cur.at = at;
        cur.why = clean(d.why, 60);
        m.moods[who] = cur;
        // 先写后挤（这样容器只可能超出 1 条，且刚写的这条 at 最大、不会被自己挤掉）：
        //   排序候选按 `at` **最旧优先**（最旧的那条正是「早就该淡掉」的那条），交给
        //   evict.object 删键并记账 —— 排序键由本模块按业务规则给，不是纯尾部截断。
        //   cap 逐次传（站点是 per-call，上限 = maxMoods）；漏传即 bad-cap。
        if (WA.evict) {
          const ordered = Object.keys(m.moods).filter(function (k) { return k !== who; })
            .sort(function (x, y) {
              return num(m.moods[x] && m.moods[x].at, 0) - num(m.moods[y] && m.moods[y].at, 0);
            });
          const er = WA.evict.object(m.moods, 'moodGlide.moods', ordered, cfg.maxMoods);
          if (er && er.ok && er.dropped) stat.evicted += er.dropped;
        }
        draft.moodGlide = m;
        out = { ok: true, person: who, mood: Object.assign({}, cur) };
      }, 'moodGlide:set');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    if (out && out.ok) { stat.sets++; stat.lastReason = 'set'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 推进回落。`elapsedMinutes` 由调用方给（也可给 `atMs` 现算）。
   * 回落目标 = 基线（不是 0），速率由半衰期派生：factor = 0.5^(dt / halfLife) * baselinePull。
   * 返回每个角色推进后的坐标（诊断/面板读）。
   */
  function glide(input) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', rows: [] };
    const now = clockWall();
    const fixed = num(input && input.elapsedMinutes, NaN);
    const rows = [];
    try {
      WA.store.transact(function (draft) {
        const m = (draft.moodGlide && typeof draft.moodGlide === 'object' && !Array.isArray(draft.moodGlide))
          ? draft.moodGlide : { moods: {}, baselines: {} };
        m.moods = (m.moods && typeof m.moods === 'object' && !Array.isArray(m.moods)) ? m.moods : {};
        // baselinePull 作用在**速率**上（拉得越紧 ⇒ 有效半衰期越短），不是作用在残余上。
        //   写成 keep = decay + (1-decay)*(1-pull) 的话残余永远 >= (1-pull)：默认 0.5 时
        //   情绪再怎么搁着也留一半，「全部贴回基线」永远到不了，注入块会长期挂着陈情绪 ——
        //   那正是本模块要治的「一次变一直」换了个马甲又回来。
        const pull = Math.max(0.05, Math.min(1, num(cfg.baselinePull, 0.5)));
        const hl = Math.max(1, num(cfg.halfLifeMinutes, 180)) / pull;
        Object.keys(m.moods).forEach(function (who) {
          const cur = m.moods[who] || {};
          const dt = isFinite(fixed) ? Math.max(0, fixed) : Math.max(0, (now - num(cur.at, now)) / 60000);
          const keep = Math.pow(0.5, dt / hl);
          const base = (m.baselines && m.baselines[who]) ? m.baselines[who] : BASE_ZERO;
          AXES.forEach(function (k) {
            const b = num(base[k], 0);
            cur[k] = clamp(b + clamp(num(cur[k], 0) - b) * keep);
          });
          // 思念随时间增长（与回落同一条时间轴，方向相反），封顶即止
          const rate = num(cfg.longingRate, 0.06);
          cur.longing = Math.max(0, Math.min(num(cfg.longingCap, 1), num(cur.longing, 0) + rate * dt));
          cur.at = now;
          m.moods[who] = cur;
          rows.push({ person: who, v: Math.round(cur.v * 1000) / 1000, a: Math.round(cur.a * 1000) / 1000, d: Math.round(cur.d * 1000) / 1000, longing: Math.round(cur.longing * 1000) / 1000, elapsedMin: Math.round(dt) });
        });
        draft.moodGlide = m;
      }, 'moodGlide:glide');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable', rows: [] }; }
    stat.glides++;
    stat.lastReason = 'glide';
    return { ok: true, rows: rows };
  }

  /** 单独记一次「想起了他」：直接抬思念（glide 之外的显式入口） */
  function miss(person, amount) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const who = clean(person, 40);
    if (!who) { noteFault('missing-person'); return { ok: false, reason: 'missing-person' }; }
    const add = Math.max(0, num(amount, cfg.longingRate * 30));
    let val = 0;
    try {
      WA.store.transact(function (draft) {
        const m = (draft.moodGlide && typeof draft.moodGlide === 'object' && !Array.isArray(draft.moodGlide))
          ? draft.moodGlide : { moods: {}, baselines: {} };
        m.moods = (m.moods && typeof m.moods === 'object' && !Array.isArray(m.moods)) ? m.moods : {};
        const cur = m.moods[who] || { v: 0, a: 0, d: 0, longing: 0, at: clockWall() };
        cur.longing = Math.max(0, Math.min(num(cfg.longingCap, 1), num(cur.longing, 0) + add));
        cur.at = clockWall();
        m.moods[who] = cur;
        draft.moodGlide = m;
        val = cur.longing;
      }, 'moodGlide:miss');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.misses++;
    return { ok: true, person: who, longing: Math.round(val * 1000) / 1000 };
  }

  function read(person) {
    const m = moods();
    const cfg = settings();
    if (person) {
      const who = clean(person, 40);
      const cur = m.moods[who];
      if (!cur) return { enabled: cfg.enabled, person: who, mood: null };
      return { enabled: cfg.enabled, person: who, mood: { v: cur.v, a: cur.a, d: cur.d, longing: cur.longing, why: cur.why || '' }, baseline: baselineOf(who) };
    }
    return {
      enabled: cfg.enabled,
      halfLifeMinutes: cfg.halfLifeMinutes,
      rows: Object.keys(m.moods).map(function (who) {
        const c = m.moods[who] || {};
        const b = baselineOf(who);
        return { person: who, v: Math.round(num(c.v, 0) * 1000) / 1000, a: Math.round(num(c.a, 0) * 1000) / 1000, d: Math.round(num(c.d, 0) * 1000) / 1000, longing: Math.round(num(c.longing, 0) * 1000) / 1000, baseV: b.v, baseA: b.a, baseD: b.d, why: c.why || '' };
      })
    };
  }

  /** 轴读数用一句话说人话（注入块与面板共用，避免两处各写一份译法） */
  function phrase(m) {
    const v = num(m && m.v, 0), a = num(m && m.a, 0), d = num(m && m.d, 0), lg = num(m && m.longing, 0);
    const seg = [];
    if (v >= 0.35) seg.push('心情偏好'); else if (v <= -0.35) seg.push('心里还堵着'); else seg.push('情绪平');
    if (a >= 0.45) seg.push('有点上头'); else if (a <= -0.35) seg.push('蔫着');
    if (d >= 0.45) seg.push('占上风'); else if (d <= -0.35) seg.push('缩着');
    if (lg >= 0.6) seg.push('很惦记');
    else if (lg >= 0.25) seg.push('偶尔想起');
    return seg.join('、');
  }

  /** 注入块：只摊「还在回落中」的人（已贴基线的没必要占额度） */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = read();
    if (!r.rows.length) return '';
    const live = r.rows.filter(function (row) {
      const dv = Math.abs(row.v - row.baseV), da = Math.abs(row.a - row.baseA), dd = Math.abs(row.d - row.baseD);
      return dv > 0.08 || da > 0.08 || dd > 0.08 || row.longing >= 0.25;
    });
    if (!live.length) return '';
    const lines = [];
    lines.push('[情绪惯性（半衰期 ' + cfg.halfLifeMinutes + ' 分钟，回落目标是各自的基线）]');
    live.slice(0, 6).forEach(function (row) {
      lines.push('· ' + row.person + '：' + phrase(row) + '（想念 ' + Math.round(row.longing * 100) + '%）');
    });
    lines.push('口径：闹过别扭不会一直冷下去，也没谁一秒钟翻篇——按**半衰期**慢慢回暖；久别的人要显出想念，但想念是把人往回想，不是把人往怀里塞。');
    return lines.join('\n') + '\n';
  }

  WA.moodGlide = {
    getSettings: settings,
    setSettings: function (patch) { const r = saveSettings(patch); return r.ok ? r.settings : r; },
    set: set, glide: glide, miss: miss, read: read, buildBlock: buildBlock,
    setBaseline: setBaseline, baselineOf: baselineOf, phrase: phrase,
    AXES: AXES.slice(), AXIS_CN: Object.assign({}, AXIS_CN),
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/mood-glide.js', { kind: 'engine', ver: '2.250.0' });
  if (WA.log) WA.log('info', 'engines/mood-glide 已加载（2.250.0）');
})();