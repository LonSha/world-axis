/**
 * WorldAxis engines/weighted-draw.js (v2.251.0) — 阶位权重池 + 未得补偿 + 临时幸运封顶
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   本仓“按概率出东西”只有两套极简做法：
 *     · core/rand.js:321 `pickWeighted(items, weightOf)` —— **只吃一个写完的权重**，
 *       阶位差、临时加成、已得 / 未得分歧全要调用方自己算，于是分散在各处、各写一遍；
 *     · engines/regional.js:75 `INCIDENT_TYPES` 把 `weight` 硬编码在常量表里，
 *       一旦要按“稀有度 / 幸运”抬权重就得改表。
 *   现场缺口实测：`rarity` / `稀有度` / `weighted` 在 core/engines 命中都在装钯、画像、
 *   家具这些**外观类**上；抽签这一层没有“稀有度抬升 + 未得补偿 + 幸运封顶”的三元权重。
 *   后果是长局里的随机长尾：同一个稀位反复吐同一件，玩家凑不全也看不出为什么。
 *
 *   （同名形状已被抽卡/农场类项目独立验证过：aifarm `src/gacha.js:38-45` 的
 *   `base * Math.pow(1 + luck, rarityIndex)`，`luck` 由土地阶 + 浇水次数合成，
 *   浇水部分有硬封顶 `WATER_LUCK_CAP`；`src/engine.ts:389-393` 再对“未收集”的候选
 *   ×`FUSION_SOFT_PITY` 做软保底。本模块把这三层搬到本仓，并把阶表交给设置面。）
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `weightOf(item, ctx)` 算一个候选的权重 = 阶位基重 × (1+幸运)^阶次 × (未得 ? 补偿 : 1)。
 *   `draw(pool, ctx)` 用 `rand.pickWeighted` 抽一个（可复现，走名门 `draw`）。
 *   幸运 = clamp(阶位幸运 + 临时幸运，0, cap)，临时幸运**不累积超顶**。
 *
 * ── 缝合边界（否定式，每条都有判据咬）───────────────���──────────────
 *   ① 总开关默认关闭。关闭时只按阶位基重，不打幸运、不打补偿（reason:'plain'），
 *      结果与“直接拿 base 表 pickWeighted”逐字等价。
 *   ② 阶名不在已登记阶表里 ⇒ `unknown-rank`（不夹、不回落成最低阶）。
 *   ③ 幸运硬封顶：溢出部分**丢弃**，不存银行（下一轮不会补回来）。
 *   ④ 软保底只在 `seen` 里真没有该 id 时生效；`softPity` ≤ 1 视为未开（不是错，但记 `pity-off`）。
 *   ⑤ 权重全非正时**整体退回等概率**并归因 `bad-weights`（沿用 rand 的既有口径，不自建一套）。
 *   ⑥ 不写 store：`seen` 由调用方给（哪本图鉴、怎么记都在外面），本模块只算权重与抽一个。
 *   ⑦ 池子空了返 `empty-pool`（不返假元素）；只有 1 个候选时直接回它并记 `last-one`，
 *      但**仍算权重**以便审计。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_weighteddraw_settings_v1';
  // ranks 是“阶名 → 基重”，按从低到高给；阶次由它在表里的位置决定。
  const DEF = { enabled: false, softPity: 4, luckCap: 0.3, ranks: { N: 100, R: 35, SR: 10, SSR: 2.5 } };
  const __REG = { key: LS_KEY, def: DEF, module: 'weightedDraw',
    bounds: { softPity: [1, 20], luckCap: [0, 3] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    let m;
    if (!WA.settingsBus) m = Object.assign({}, DEF, shadow || {});
    else m = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
    if (!m.ranks || typeof m.ranks !== 'object' || !Object.keys(m.ranks).length) m.ranks = DEF.ranks;
    // 表里保持声明序（对象字面量顺序不可靠，转为显式清单存一份）
    if (!Array.isArray(m.order) || !m.order.length) m.order = Object.keys(m.ranks);
    return m;
  }
  function saveSettings(next) {
    const val = Object.assign({}, DEF, next || {});
    if (val.ranks) val.order = Object.keys(val.ranks);
    if (!WA.settingsBus) { shadow = val; return val; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, val));
  }
  const stat = { draws: 0, plain: 0, lucked: 0, pitied: 0, refused: 0, badWeights: 0,
    lastReason: '', lastLuck: 0 };

  function rankIndex(cfg, rank) {
    const i = cfg.order.indexOf(rank);
    return i < 0 ? -1 : i;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /**
   * 算一个候选的权重（纯函数，不抽）。
   * @param {object} item 候选（须有 rank，或由 ctx.rankOf 给）
   * @param {object} [ctx] { seen:Set|数组, rankBase:number, tempLuck:number, rankOf:fn }
   * @returns {{ok:boolean, reason?:string, weight?:number, rank?:string, rankIndex?:number, luck?:number, pitied?:boolean}}
   */
  function weightOf(item, ctx) {
    const cfg = settings();
    const o = ctx || {};
    const rank = typeof o.rankOf === 'function' ? o.rankOf(item) : (item && item.rank);
    const ri = rankIndex(cfg, rank);
    if (ri < 0) { stat.refused++; stat.lastReason = 'unknown-rank'; return { ok: false, reason: 'unknown-rank', rank: rank }; }
    const base = Number(cfg.ranks[rank]);
    if (!isFinite(base) || base <= 0) { stat.refused++; stat.lastReason = 'bad-base'; return { ok: false, reason: 'bad-base', rank: rank }; }
    const id = item && (item.id !== undefined ? item.id : item.key);
    const seen = o.seen || null;
    const known = !!(seen && id !== undefined && (typeof seen.has === 'function' ? seen.has(id) : seen.indexOf(id) >= 0));
    let luck = 0;
    let pitied = false;
    let w = base;
    if (cfg.enabled) {
      // ⑥ 幸运一律经硬封顶；溢出丢弃③
      const raw = (isFinite(Number(o.rankBase)) ? Number(o.rankBase) : 0) + (isFinite(Number(o.tempLuck)) ? Number(o.tempLuck) : 0);
      luck = clamp(raw, 0, cfg.luckCap);
      w = base * Math.pow(1 + luck, ri);
      if (luck > 0) stat.lucked++;
      if (!known && cfg.softPity > 1 && id !== undefined) { w *= cfg.softPity; pitied = true; stat.pitied++; }
      else if (cfg.softPity <= 1) stat.lastReason = 'pity-off';
      stat.lastLuck = luck;
    }
    return { ok: true, weight: w, rank: rank, rankIndex: ri, luck: luck, pitied: pitied, known: known };
  }

  /**
   * 从池里抽一个（可复现，走 rand.pickWeighted 的名门 `draw`）。
   * @returns {{ok:boolean, reason?:string, item?:any, weight?:number, pitied?:boolean, weights?:number[]}}
   */
  function draw(pool, ctx) {
    const cfg = settings();
    if (!Array.isArray(pool) || !pool.length) { stat.refused++; stat.lastReason = 'empty-pool'; return { ok: false, reason: 'empty-pool' }; }
    if (pool.length === 1) {
      const w = weightOf(pool[0], ctx);
      if (!w.ok) return w;
      stat.draws++; stat.lastReason = 'last-one';
      return { ok: true, reason: 'last-one', item: pool[0], weight: w.weight, pitied: w.pitied, weights: [w.weight] };
    }
    const weights = [];
    for (let i = 0; i < pool.length; i++) {
      const w = weightOf(pool[i], ctx);
      if (!w.ok) return w;
      weights.push(w.weight);
    }
    const total = weights.reduce(function (a, b) { return a + b; }, 0);
    if (!(total > 0)) { stat.badWeights++; stat.lastReason = 'bad-weights'; }
    const idx = (function () {
      // ⑤ 全非正时退回等概率（rand.pickWeighted 内部也有这条口径，这里显式走一次等概率以保证可复现）
      if (WA.rand && typeof WA.rand.pickWeighted === 'function' && total > 0) {
        const chosen = WA.rand.pickWeighted(pool, function (_x, i) { return weights[pool.indexOf(_x)]; }, 'weightedDraw');
        return chosen === null ? -1 : pool.indexOf(chosen);
      }
      if (WA.rand && typeof WA.rand.int === 'function') return WA.rand.int(0, pool.length - 1, 'weightedDraw');
      return 0;  // WA.rand 整块缺席时认第一个（此前裸调 Math.random，同一局面重放抽中别人）
    })();
    if (idx < 0 || idx >= pool.length) { stat.refused++; stat.lastReason = 'pick-failed'; return { ok: false, reason: 'pick-failed' }; }
    stat.draws++;
    const pitied = weights.length ? (weights[idx] > 0 && !weightOf(pool[idx], ctx).known && cfg.enabled && cfg.softPity > 1) : false;
    if (!cfg.enabled) stat.plain++; else stat.lastReason = 'drawn';
    return { ok: true, reason: cfg.enabled ? 'drawn' : 'plain', item: pool[idx], weight: weights[idx], pitied: pitied, weights: weights };
  }

  function statOf() { return Object.assign({}, stat); }
  WA.weightedDraw = { weightOf: weightOf, draw: draw, stat: statOf, settings: settings, saveSettings: saveSettings, REG: __REG, DEF: DEF };
})();
