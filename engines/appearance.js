/**
 * WorldAxis engines/appearance.js (v2.69.0)
 * 外貌分级契约：S/A/B/C 分级 × Layer1-4 覆盖核验 × 关系加权 × 异化档位 × 场景排他。
 *
 * 缝合来源：《五官构建》世界书（ref7）——
 *   「任何新角色首次出场必须触发外貌描写」「世界书/角色卡有设定的 NPC 直接按 S 级处理」、
 *   「临时生成的无设定 NPC 按叙事重要性分级，分级决定扫描深度」「已出场角色再出现只写
 *   当前视角最值得看的 1-3 个细节」「恋人/血亲/宿敌自动升一级」；条目二《异族外貌构建》的
 *   「非人角色异化三档：拟人态 / 半人态 / 真身态，逐项异化替换表、真身态映射规则」。
 *
 * v2.583.0（R254 增量缝合）：补上材料里当时没缝的两条可判定规则——
 *   ① 【手动标记优先】：设定/条目里写了「外貌等级：S/A/B/C」就按它执行，覆盖自动判断，
 *      也不再受关系加权影响（材料原文）。落成 `markOf()` + `register({mark})`：
 *      解析得出来就用解析值，解析不出来才走加权。
 *   ② 【动态升级】：第 3 次出场 / 实质性互动 / 剧情赋予新身份，三者任一升一级（封顶 S）。
 *      材料还要求「升级后补写缺失层且不得推翻已有描写」——后半句可判定：升的是**档位**，
 *      已登记的覆盖子项数不得因升级而变小（`downgrade-coverage` 拒收）。
 *   仍不缝：比喻结构/行文顺序/光影权重/情绪绑定（文风层），以及几千词要素库（词库）。
 *
 * 取舍口径（沿 R50）：能落成「登记→核验→拒收」的进引擎；Layer1-4 具体子项清单与
 * 外貌要素库（几千词汇）是创作词库，不进引擎；比喻结构要求/行文顺序规则/光影权重/
 * 情绪绑定属文风层，留给预设。
 *
 * v2.585.0（R261）修正上一行的一半：**子项清单不是词库，是判据** —— 「这一处写了没」可判定、
 *   可拒收，故 `LAYER_ITEMS` 进引擎（每层前 N 项 = 该级必盖，N 取既有 `COVERAGE_REQ`，
 *   不设第三张表）。仍然不进引擎的是**描写词表**：它放 `engines/appearance-lexicon.js`，
 *   data-only、引擎不消费、不参与任何拒收。原文这两件事被并成一句，是本轮要拆开的那句。
 *
 * 本模块不替写任何外貌描写，只核验「该写的地方写了没」：
 *   1 总开关默认关闭。关闭时 register() 返回 reason:'disabled'，不记账。
 *   2 分级白名单 S/A/B/C（bad-tier）。
 *   3 未登记的角色在「首次出场」语境下拒收（missing）——出场必须先登记。
 *   4 C 级只允许登记 1 个覆盖子项（too-many-coverage）——C 级是「至少 1 个可识别特征」。
 *   5 重复登记同一人同层拒收（exists），除非显式 re-scan（再出场 = 增量覆盖）。
 *   6 关系加权：恋人/血亲/宿敌 自动升一级（weighted-tier），C→B→A→S 单向。
 *   7 异化档位：humanoid / half / true 三档白名单（bad-form），决定 Layer 是「替换描写」
 *     还是「维度映射」——本模块只登记与核验档位，不替写异化内容。
 *   8 场景排他断言（sceneAssert）：同场景不得两人眼型+脸型组合相同、不得同色系服装、
 *     至少一人走非常规审美——本模块把它落成可判定的「重复登记拒收」。
 *
 * 与 profiles.js 的分工：profiles 管「这人是怎样的」（人设档案），本模块管
 * 「这人出场时外貌该写多细」（描写契约），两本账不串。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_appearance_settings_v1';
  const DEF = { enabled: true, maxRows: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'appearance', bounds: { maxRows: [4, 48] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const TIERS = ['S', 'A', 'B', 'C'];
  const TIER_LABELS = { S: '完整四层', A: '完整五官+精选身体', B: '精选四件套', C: '单一特征' };
  const FORMS = ['humanoid', 'half', 'true'];
  const FORM_LABELS = { humanoid: '拟人态', half: '半人态', true: '真身态' };
  const LAYERS = ['L1', 'L2', 'L3', 'L4'];
  const LAYER_LABELS = { L1: '五官', L2: '身体', L3: '穿着', L4: '身材' };
  // ── v2.585.0（R261 · A 面）：四层子项名单 —— 把「下限数字」补成「名单」 ────────
  //   它治的病：COVERAGE_REQ 只说「L2 要 8 项」。于是①同一处被数两次也算 8 项、
  //   ②八项全写在手上也算盖住了身体 —— 判据是数字，不是「哪几处」。
  //
  //   口径（与 R50/R51/R254 三次裁决一致，不是本轮新发明）：
  //     · **名单进引擎** —— 它是判据：这一处写没写，可判定、可拒收；
  //     · **描写词表不进引擎** —— 那是词库，放 engines/appearance-lexicon.js，data-only、不参与判定。
  //
  //   为什么表里不另存「必盖项」：顺序即语义 —— 每层**前 N 项**就是该级必盖项，
  //   N 取 COVERAGE_REQ[tier][L]。表 + 既有下限数合起来已是单一真源，
  //   再加一张「必盖项表」就是本仓反复治过的第二份真源（改一处忘一处）。
  //
  //   名单来源如实标注：材料原表（《五官构建》）本仓只有「每层要几项」的下限，没有逐项名目，
  //   故本表是**按既有下限重建**的（每层多留 2 项余量给 B/C 档的「精选」）。
  //   若材料原表更细：替换本表即可，判据（前 N 项必盖 + 名单外拒收 + 去重不计数）一条不用改。
  const LAYER_ITEMS = {
    L1: [
      { id: 'eye-shape', label: '眼型' },
      { id: 'eye-color', label: '眼色' },
      { id: 'brow', label: '眉形' },
      { id: 'nose', label: '鼻型' },
      { id: 'lip', label: '唇形' },
      { id: 'face-shape', label: '脸型' },
      { id: 'cheekbone', label: '颧骨' },
      { id: 'jaw', label: '下颌' },
      { id: 'ear', label: '耳形' },
      { id: 'skin', label: '肤质' },
      { id: 'hair-color', label: '发色' },
      { id: 'hair-style', label: '发型' }
    ],
    L2: [
      { id: 'neck', label: '颈' },
      { id: 'shoulder', label: '肩' },
      { id: 'collarbone', label: '锁骨' },
      { id: 'back', label: '背' },
      { id: 'chest', label: '胸' },
      { id: 'waist', label: '腰' },
      { id: 'hip', label: '臀' },
      { id: 'hand', label: '手' },
      { id: 'finger', label: '指节' },
      { id: 'thigh', label: '腿' },
      { id: 'pubic', label: '私处' },
      { id: 'foot', label: '足' }
    ],
    L3: [
      { id: 'top', label: '上装' },
      { id: 'bottom', label: '下装' },
      { id: 'outer', label: '外搭' },
      { id: 'shoes', label: '鞋' },
      { id: 'accessory', label: '配饰' },
      { id: 'fabric', label: '面料' }
    ],
    L4: [
      { id: 'height', label: '身高' },
      { id: 'build', label: '体型' },
      { id: 'bust-line', label: '胸线' },
      { id: 'waist-hip', label: '腰臀比' },
      { id: 'leg-line', label: '腿线' },
      { id: 'posture', label: '体态' }
    ]
  };
  /**
   * 该层里有没有这个 id（**现场查表、不缓存**）。
   * 为什么不做 `ITEM_INDEX` 缓存：缓存就是第二份真源 —— 改名单忘改索引，判据就与表脱节，
   * 而这正是本仓反复治过的病。名单每层十来项，现场线性查一次的成本可以忽略。
   */
  function itemAt(layer, id) {
    const list = LAYER_ITEMS[layer] || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }
  /**
   * 该级某层的**必盖项** id：名单前 N 项，N = COVERAGE_REQ[tier][layer]。
   * 不写第二份数字：改下限就改 COVERAGE_REQ，名单顺序不动。
   */
  function requiredOf(tier, layer) {
    const req = COVERAGE_REQ[tier] || COVERAGE_REQ.C;
    const all = LAYER_ITEMS[layer] || [];
    const n = Math.max(0, Math.min(all.length, Number(req[layer]) || 0));
    return all.slice(0, n).map(function (x) { return x.id; });
  }
  /**
   * 名单归一：去空白 / 去重 / 点名名单外。三件事各留读数，一条都不静默：
   *   · 名单外 ⇒ 交给调用方拒收 `unknown-item`（**不**当成「未知项也算一个」，那是把判据变松）；
   *   · 重复 ⇒ 只计一次并回带 `duplicates`（同一处写两遍不是两处）。
   */
  function normItems(raw) {
    const byLayer = {}, unknown = [], duplicates = [];
    LAYERS.forEach(function (L) {
      const list = raw && Array.isArray(raw[L]) ? raw[L] : [];
      const seen = {}, keep = [];
      list.forEach(function (x) {
        const id = clean(x, 32);
        if (!id) return;
        if (!itemAt(L, id)) { unknown.push({ layer: L, id: id }); return; }
        if (seen[id]) { duplicates.push({ layer: L, id: id }); return; }
        seen[id] = 1; keep.push(id);
      });
      byLayer[L] = keep;
    });
    return { byLayer: byLayer, unknown: unknown, duplicates: duplicates };
  }
  /** 必盖项核验：该级每层的前 N 项是否都命中。miss 带中文名（人能直接读懂缺哪处）。 */
  function missingItems(tier, byLayer) {
    const miss = [];
    LAYERS.forEach(function (L) {
      const got = byLayer[L] || [];
      requiredOf(tier, L).forEach(function (id) {
        if (got.indexOf(id) < 0) miss.push({ layer: L, id: id, label: (itemAt(L, id) || {}).label || id });
      });
    });
    return miss;
  }
  /**
   * 该级的**写作计划**（给注入与推演方：「这一级该写哪几处」）。
   * required = 前 N 项必写；optional = 同层其余（可写可不写，写了不扣分也不会多计）。
   * 纯查询、不登记、不落盘 —— 所以它不会替谁记账。
   */
  function coveragePlan(tier) {
    const t = TIERS.indexOf(tier) >= 0 ? tier : 'C';
    const out = { tier: t, layers: {} };
    LAYERS.forEach(function (L) {
      const req = requiredOf(t, L);
      const all = (LAYER_ITEMS[L] || []).map(function (x) { return x.id; });
      out.layers[L] = {
        label: LAYER_LABELS[L],
        required: req,
        optional: all.filter(function (id) { return req.indexOf(id) < 0; }),
        need: req.length
      };
    });
    return out;
  }
  // 关系加权：恋人/血亲/宿敌 自动升一级（C→B→A→S 单向）。纯登记在册的关系才加权，
  // 不猜——weighted 由调用方显式给出（bonds 六型 / family / 宿敌 均可作为依据）。
  const WEIGHT_RELATIONS = ['lover', 'family', 'rival'];
  // 覆盖度要求（子项数）：S 全 4 层；A 五官全 + 身体 5；B 五官 4 + 身体 3；C 至少 1。
  const COVERAGE_REQ = { S: { L1: 10, L2: 8, L3: 4, L4: 4 }, A: { L1: 10, L2: 5, L3: 4, L4: 3 }, B: { L1: 4, L2: 3, L3: 3, L4: 2 }, C: { L1: 1, L2: 0, L3: 0, L4: 0 } };
  const C_MAX_COVERAGE = 1; // C 级只允许登记 1 个覆盖子项
  // v2.583.0：动态升级的三个触发因（材料原文三条，一等一）。
  //   为什么是白名单而不是布尔：材料说的是「出现以下任一情况」——枚举能把
  //   「为什么升」留在账上，布尔只留下「升了」。
  const UPGRADE_CAUSES = ['third-appearance', 'substantive-interaction', 'new-identity'];
  const UPGRADE_CAUSE_LABELS = {
    'third-appearance': '第 3 次出场',
    'substantive-interaction': '与主角实质性互动',
    'new-identity': '剧情赋予新身份'
  };
  const stat = { regs: 0, blocked: 0, lastReason: '', faults: {} };
  // v2.581.0：注入名额统一形态（「同形态尾部截断」簇二，与 v2.580.0 的三引擎同一口径）。
  //   旧法 `X.slice(-maxRows)` 三病俱在：取**登记尾部**（≈登记顺序，不是新旧）、
  //   `maxRows` 坏值时 `slice(NaN)`=`slice(0)` **整环全念**（与上限正好相反）、念了几条一个字不说。
  const ROWS_QUOTA_MAX = 48;
  function quotaOf(cfg, key, max, fallback) {
    const n = Math.floor(Number(cfg && cfg[key]));
    if (!isFinite(n) || n < 1) return Math.min(max, fallback);
    return Math.min(max, Math.max(1, n));
  }
  /** 取哪几条：按时间（updatedAt，缺则 at）新→旧，同刻按 who/key/id 兜底 —— 可复算。 */
  function pickRows(list, quota, atOf, idOf) {
    const arr = (Array.isArray(list) ? list : []).filter(function (x) { return !!x; }).slice();
    arr.sort(function (a, b) {
      const at = Number(atOf(a)) || 0, bt = Number(atOf(b)) || 0;
      if (at !== bt) return bt - at;
      const ai = String(idOf(a) || ''), bi = String(idOf(b) || '');
      return ai < bi ? -1 : (ai > bi ? 1 : 0);
    });
    return { candidates: arr.length, picked: arr.slice(0, quota),
      hidden: Math.max(0, arr.length - quota), mode: arr.length > quota ? 'newest-first' : 'all-fit' };
  }
  /** 名额取用（名额只截断、不参与筛选；坏配置回落 DEF，绝不放大成「全念」）。 */
  function pickQuota(arr, cfg) {
    const q = quotaOf(cfg, 'maxRows', ROWS_QUOTA_MAX, DEF.maxRows);
    const sel = pickRows(arr, q, function (x) { return x && (x.updatedAt || x.at); },
      function (x) { return x && (x.who || x.key || x.id || x.name || ''); });
    stat.block = { candidates: sel.candidates, picked: sel.picked.length, quota: q,
      hidden: sel.hidden, mode: sel.candidates ? sel.mode : 'empty' };
    return sel.picked;
  }
  // block 用**取值器**持有：stat() 里那些 `Object.assign({}, stat)` 会当场取到一份深拷，
  //   调用方改一次读数就改掉引擎读数的老坑（v2.576 org / v2.579 world-bridge）在这里一次性堵掉。
  let __block = null;
  Object.defineProperty(stat, 'block', {
    enumerable: true, configurable: true,
    get: function () { return __block ? JSON.parse(JSON.stringify(__block)) : null; },
    set: function (v) { __block = v || null; }
  });
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().appearance; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(who) { return rows().filter(function (r) { return r && r.who === who; })[0] || null; }
  function upTier(t) {
    const i = TIERS.indexOf(t);
    if (i <= 0) return TIERS[0]; // S 之上不再升；表外不动
    return TIERS[i - 1];
  }
  // ── v2.583.0 手动标记优先 ────────────────────────────────────────────
  //   材料原文：「角色设定/角色卡/世界书中若明确写有『外貌等级：S/A/B/C』，一律按该等级执行，
  //   覆盖 AI 的自动判断，也不再受关系加权影响。」
  //   两条落地约束：
  //     · 先解析、后加权 —— 标记命中时 weighted 一律不生效（不是「先加权再看标记」）；
  //     · 解析不出来就**不猜**：返回 null 交给加权，绝不把一段随便的文字读成 S。
  const MARK_RES = [
    /外貌等级\s*[:：]?\s*([SABC])/,          // 中文冒号/无冒号
    /外貌等级\s*[:：]?\s*([SABC])\s*级/,
    /^\s*([SABC])\s*$/                   // 整段只有一个档位字样
  ];
  /**
   * 从一段文字里解析手动外貌等级标记。返回 'S'|'A'|'B'|'C'|null。
   * 只认「外貌等级」这四个字（或整段单档位），不做模糊匹配——标记是**作者显式意愿**，
   * 猜错一次就把整条分级契约带偏。
   */
  function markOf(text) {
    const t = String(text == null ? '' : text);
    if (!t) return null;
    for (let i = 0; i < MARK_RES.length; i++) {
      const m = t.match(MARK_RES[i]);
      if (m && TIERS.indexOf(m[1]) >= 0) return m[1];
    }
    return null;
  }
  /** 升一级（S 封顶）。与 upTier 的区别：那个是「加权」，这个是「动态升级」，各记各的因。 */
  function bumpTier(t) {
    const i = TIERS.indexOf(t);
    if (i <= 0) return TIERS[0];
    return TIERS[i - 1];
  }

  /** 关系加权：weighted 数组里出现任一登记关系 → 升一级。 */
  function weight(tier, weighted) {
    const list = (Array.isArray(weighted) ? weighted : []).map(function (w) { return clean(w, 12); }).filter(Boolean);
    const hit = list.filter(function (w) { return WEIGHT_RELATIONS.indexOf(w) >= 0; });
    if (!hit.length) return { tier: tier, weighted: false };
    return { tier: upTier(tier), weighted: true, by: hit[0] };
  }
  /** 覆盖度核验：已登记子项数是否达到该档要求。缺层拒收（missing-coverage）。 */
  function checkCoverage(tier, cover) {
    const req = COVERAGE_REQ[tier] || COVERAGE_REQ.C;
    const cov = cover || {};
    const missing = LAYERS.filter(function (L) {
      const got = typeof cov[L] === 'number' ? cov[L] : 0;
      return got < req[L];
    });
    if (missing.length) return { ok: false, reason: 'missing-coverage', missing: missing, req: req };
    return { ok: true };
  }
  /**
   * 登记一个角色的外貌契约。who 是人名，tier ∈ S/A/B/C，cover 是 {L1:n, L2:n, L3:n, L4:n}
   * 已覆盖子项数，weighted 是关系加权依据（lover/family/rival，可空），form 是异化档位
   * （humanoid/half/true，可空 = humanoid），scene 是当前场景（排他断言用，可空）。
   * 首次出场必须登记；C 级只允许 1 个子项；重复登记拒收（再出场走 rescan）。
   */
  function register(who, tier, opts) {
    const w = clean(who, 40);
    const o = opts || {};
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (TIERS.indexOf(tier) < 0) { noteFault('bad-tier'); return { ok: false, reason: 'bad-tier', got: tier }; }
    let out = null;
    WA.store.transact(function (draft) {
      if (!settings().enabled) { out = { ok: true, reason: 'disabled' }; return; }
      draft.appearance = draft.appearance && typeof draft.appearance === 'object' && !Array.isArray(draft.appearance) ? draft.appearance : { rows: [] };
      draft.appearance.rows = Array.isArray(draft.appearance.rows) ? draft.appearance.rows : [];
      const prev = draft.appearance.rows.filter(function (r) { return r && r.who === w; })[0];
      if (prev && o.mode !== 'rescan') { out = { ok: false, reason: 'exists', who: w }; return false; }
      const form = FORMS.indexOf(o.form) >= 0 ? o.form : 'humanoid';
      if (o.form != null && FORMS.indexOf(o.form) < 0) { out = { ok: false, reason: 'bad-form', got: o.form }; return false; }
      // v2.583.0 ①：手动标记优先。标记命中即**盖过**入参档位，且关系加权不再生效
      //   （不是「先加标再看标记」——材料原话是「覆盖自动判断，也不再受关系加权影响」）。
      const marked = markOf(o.mark != null ? o.mark : o.note);
      let weighted = { tier: tier, weighted: false };
      let effTier = marked;
      if (!marked) { weighted = weight(tier, o.weighted); effTier = weighted.tier; }
      // C 级只允许 1 个覆盖子项（「至少 1 个可识别特征」的上限）
      // v2.585.0：**给了名单就以名单为准**（名单是现场，数字是手填；两个都给时不取大、不取小，
      //   只认名单 —— 否则「数字 8 项、名单 3 项」会互相掩护）。
      let byLayer = null;
      let dupCount = 0;
      let cov = o.cover || {};
      if (o.items != null) {
        const ni = normItems(o.items);
        if (ni.unknown.length) { out = { ok: false, reason: 'unknown-item', who: w, outside: ni.unknown }; return false; }
        byLayer = ni.byLayer;
        dupCount = ni.duplicates.length;
        cov = { L1: byLayer.L1.length, L2: byLayer.L2.length, L3: byLayer.L3.length, L4: byLayer.L4.length };
      }
      // v2.583.0 ②：动态升级。**只对无手动标记的角色生效** —— 材料把动态升级
      //   限定在「临时生成、无设定的角色」上，标记级是作者定档，不跟着出场次数漂。
      let upCause = '';
      let finalTier = effTier;
      if (!marked && o.upgrade != null) {
        const causes = (Array.isArray(o.upgrade) ? o.upgrade : [o.upgrade])
          .map(function (x) { return clean(x, 32); }).filter(Boolean);
        const badUp = causes.filter(function (c) { return UPGRADE_CAUSES.indexOf(c) < 0; });
        if (badUp.length) { out = { ok: false, reason: 'bad-upgrade-cause', got: badUp }; return false; }
        if (causes.length) { finalTier = bumpTier(effTier); upCause = causes[0]; }
      }
      // 升级不得把已登记的覆盖子项数改小：材料的「不得推翻已有描写」在这里
      //   唯一可判定的面就是「层覆盖数不得减少」。
      if (prev && upCause) {
        const pc = prev.cover || {};
        const shrink = LAYERS.filter(function (L) {
          return (typeof cov[L] === 'number' ? cov[L] : 0) < (Number(pc[L]) || 0);
        });
        if (shrink.length) { out = { ok: false, reason: 'downgrade-coverage', who: w, layers: shrink }; return false; }
      }
      const total = LAYERS.reduce(function (n, L) { return n + (typeof cov[L] === 'number' ? cov[L] : 0); }, 0);
      if (finalTier === 'C' && total > C_MAX_COVERAGE) { out = { ok: false, reason: 'too-many-coverage', who: w }; return false; }
      // 升级后的覆盖校验按**新档位**要求（材料：升级后那次出场须按新等级补写缺失层）
      // v2.585.0：先按**名单**核验（更具体：缺的是哪一处，带中文名），再退回数字核验。
      //   顺序不是美化 —— 数字核验更松（8 项可以全写在手上），先跑名单才有意义。
      if (byLayer) {
        const miss = missingItems(finalTier, byLayer);
        if (miss.length) { out = { ok: false, reason: 'missing-item', who: w, missing: miss }; return false; }
      }
      const covChk = checkCoverage(finalTier, cov);
      if (!covChk.ok) { out = { ok: false, reason: covChk.reason, missing: covChk.missing, who: w }; return false; }
      // 场景排他断言：同场景已有人占用了 眼型+脸型 组合或同色系服装 → 拒收
      const scene = clean(o.scene, 40);
      const eye = clean(o.eye, 16), face = clean(o.face, 16), outfit = clean(o.outfit, 24), style = clean(o.style, 12);
      if (scene && eye && face) {
        const clashEyeFace = draft.appearance.rows.some(function (r) {
          return r && r.scene === scene && r.eye === eye && r.face === face;
        });
        if (clashEyeFace) { out = { ok: false, reason: 'eye-face-clash', who: w, scene: scene }; return false; }
      }
      if (scene && outfit && style) {
        const clashOutfit = draft.appearance.rows.some(function (r) {
          return r && r.scene === scene && r.outfit === outfit && r.style === style;
        });
        if (clashOutfit) { out = { ok: false, reason: 'outfit-clash', who: w, scene: scene }; return false; }
      }
      const row = { who: w, tier: tier, effTier: finalTier, weighted: weighted.weighted, weightedBy: weighted.by || '',
        marked: marked || '', upgradeCause: upCause || '', baseTier: effTier,
        cover: { L1: cov.L1 || 0, L2: cov.L2 || 0, L3: cov.L3 || 0, L4: cov.L4 || 0 },
        // v2.585.0：名单也入账（谁写了哪几处，下一轮 rescan 要能对着账核，不能只核数字）。
        items: byLayer ? { L1: byLayer.L1.slice(), L2: byLayer.L2.slice(), L3: byLayer.L3.slice(), L4: byLayer.L4.slice() } : null,
        dupItems: dupCount,
        form: form, scene: scene, eye: eye || '', face: face || '', outfit: outfit || '', style: style || '',
        rescan: o.mode === 'rescan', at: clockNow('appearance') };
      if (prev) {
        const idx = draft.appearance.rows.indexOf(prev);
        draft.appearance.rows[idx] = row;
        out = { ok: true, who: w, tier: finalTier, form: form, updated: true, marked: marked || '', upgradeCause: upCause || '' };
      } else {
        draft.appearance.rows.push(row);
        if (WA.evict) WA.evict.array(draft.appearance.rows, 'appearance.rows');
        out = { ok: true, who: w, tier: finalTier, form: form, updated: false, marked: marked || '', upgradeCause: upCause || '' };
      }
    }, 'appearance:register');
    if (out && out.ok) { stat.regs++; stat.lastReason = out.updated ? 'rescanned' : 'registered'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读一个人的外貌契约（给注入与推演方的只读视图）。 */
  function read(who) {
    if (!settings().enabled) return { ok: true, who: who, reason: 'disabled' };
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const hit = rowOf(w);
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', who: who }; }
    return { ok: true, who: hit.who, tier: hit.tier, effTier: hit.effTier, weighted: hit.weighted,
      weightedBy: hit.weightedBy, marked: hit.marked || '', baseTier: hit.baseTier || hit.tier,
      upgradeCause: hit.upgradeCause || '', cover: Object.assign({}, hit.cover), form: hit.form,
      // v2.585.0：名单也进只读视图（注入/推演要能拿到「写了哪几处」；深拷一份，别让调用方改到账上）
      items: hit.items ? { L1: (hit.items.L1 || []).slice(), L2: (hit.items.L2 || []).slice(),
        L3: (hit.items.L3 || []).slice(), L4: (hit.items.L4 || []).slice() } : null,
      dupItems: Number(hit.dupItems) || 0,
      formLabel: FORM_LABELS[hit.form], scene: hit.scene, reason: 'applied' };
  }
  /** 场景排他断言：核验当前场景里是否有人违反 眼型+脸型 / 服装 唯一性。返回冲突清单。 */
  function sceneAssert(scene) {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return { ok: true, conflicts: [] };
    const sc = clean(scene, 40);
    const inScene = rows().filter(function (r) { return r && r.scene === sc; });
    const conflicts = [];
    const seenEF = {}; const seenOutfit = {};
    inScene.forEach(function (r) {
      const ef = r.eye && r.face ? r.eye + '×' + r.face : '';
      if (ef) {
        if (seenEF[ef]) conflicts.push({ kind: 'eye-face', a: seenEF[ef], b: r.who, combo: ef });
        else seenEF[ef] = r.who;
      }
      const of = r.outfit && r.style ? r.outfit + '×' + r.style : '';
      if (of) {
        if (seenOutfit[of]) conflicts.push({ kind: 'outfit', a: seenOutfit[of], b: r.who, combo: of });
        else seenOutfit[of] = r.who;
      }
    });
    return { ok: conflicts.length === 0, conflicts: conflicts };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = pickQuota(rows(), cfg);
    if (!list.length) { stat.block = { candidates: 0, picked: 0, quota: quotaOf(cfg, 'maxRows', ROWS_QUOTA_MAX, DEF.maxRows), hidden: 0, mode: 'empty' }; return ''; }
    const lines = list.map(function (r) {
      const c = r.cover || {};
      return '· ' + r.who + '：' + (TIER_LABELS[r.effTier] || r.effTier) + '（L1×' + (c.L1 || 0) + ' L2×' + (c.L2 || 0) +
        ' L3×' + (c.L3 || 0) + ' L4×' + (c.L4 || 0) + '）'
        + (r.marked ? '【标记定档】' : '')
        + (r.upgradeCause ? '【动态升级:' + (UPGRADE_CAUSE_LABELS[r.upgradeCause] || r.upgradeCause) + '】' : '')
        + (r.weighted && !r.marked ? '【关系加权】' : '') +
        (r.form !== 'humanoid' ? '（' + (FORM_LABELS[r.form] || r.form) + '）' : '');
    });
    return '[外貌契约]\n' + lines.join('\n') + '\n分级决定扫描深度：S 完整四层、A 完整五官+精选身体、B 精选四件套、C 至少 1 个可识别特征；恋人/血亲/宿敌自动升一级；再出场只写当前视角最值得看的 1-3 个细节。\n';
  }
  // v2.581.0 块尾名额自证：不动原正文拼接，只在末尾追加一行清单计数（名额够就说「全部列出」）。
  buildBlock = (function (inner) {
    return function () {
      const out = inner();
      const b = stat.block;
      if (!out || !b) return out;
      const NL = String.fromCharCode(10);
      return out + NL + '（本面名额：外形 ' + b.picked + '/' + b.candidates
        + (b.hidden > 0 ? ' 条，按时间新→旧取；另有 ' + b.hidden + ' 条未列出，仍在账上，不是没有'
          : ' 条，全部列出') + '）';
    };
  })(buildBlock);

  WA.appearance = {
    TIERS: TIERS, TIER_LABELS: TIER_LABELS, FORMS: FORMS, FORM_LABELS: FORM_LABELS,
    LAYERS: LAYERS, LAYER_LABELS: LAYER_LABELS, WEIGHT_RELATIONS: WEIGHT_RELATIONS,
    // v2.585.0：名单面（判据的一部分，导出给注入/推演/专锁共用同一份）：表 + 必盖项推导 + 写作计划。
    LAYER_ITEMS: LAYER_ITEMS, requiredOf: requiredOf, coveragePlan: coveragePlan,
    UPGRADE_CAUSES: UPGRADE_CAUSES, UPGRADE_CAUSE_LABELS: UPGRADE_CAUSE_LABELS,
    markOf: markOf,
    COVERAGE_REQ: COVERAGE_REQ,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    register: register, read: read, sceneAssert: sceneAssert, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
