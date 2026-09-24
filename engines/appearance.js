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
 * 取舍口径（沿 R50）：能落成「登记→核验→拒收」的进引擎；Layer1-4 具体子项清单与
 * 外貌要素库（几千词汇）是创作词库，不进引擎；比喻结构要求/行文顺序规则/光影权重/
 * 情绪绑定属文风层，留给预设。
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
  const DEF = { enabled: false, maxRows: 24 };
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
  // 关系加权：恋人/血亲/宿敌 自动升一级（C→B→A→S 单向）。纯登记在册的关系才加权，
  // 不猜——weighted 由调用方显式给出（bonds 六型 / family / 宿敌 均可作为依据）。
  const WEIGHT_RELATIONS = ['lover', 'family', 'rival'];
  // 覆盖度要求（子项数）：S 全 4 层；A 五官全 + 身体 5；B 五官 4 + 身体 3；C 至少 1。
  const COVERAGE_REQ = { S: { L1: 10, L2: 8, L3: 4, L4: 4 }, A: { L1: 10, L2: 5, L3: 4, L4: 3 }, B: { L1: 4, L2: 3, L3: 3, L4: 2 }, C: { L1: 1, L2: 0, L3: 0, L4: 0 } };
  const C_MAX_COVERAGE = 1; // C 级只允许登记 1 个覆盖子项
  const stat = { regs: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().appearance; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(who) { return rows().filter(function (r) { return r && r.who === who; })[0] || null; }
  function upTier(t) {
    const i = TIERS.indexOf(t);
    if (i <= 0) return TIERS[0]; // S 之上不再升；表外不动
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
      const weighted = weight(tier, o.weighted);
      const effTier = weighted.tier;
      // C 级只允许 1 个覆盖子项（「至少 1 个可识别特征」的上限）
      const cov = o.cover || {};
      const total = LAYERS.reduce(function (n, L) { return n + (typeof cov[L] === 'number' ? cov[L] : 0); }, 0);
      if (effTier === 'C' && total > C_MAX_COVERAGE) { out = { ok: false, reason: 'too-many-coverage', who: w }; return false; }
      const covChk = checkCoverage(effTier, cov);
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
      const row = { who: w, tier: tier, effTier: effTier, weighted: weighted.weighted, weightedBy: weighted.by || '',
        cover: { L1: cov.L1 || 0, L2: cov.L2 || 0, L3: cov.L3 || 0, L4: cov.L4 || 0 },
        form: form, scene: scene, eye: eye || '', face: face || '', outfit: outfit || '', style: style || '',
        rescan: o.mode === 'rescan', at: clockNow('appearance') };
      if (prev) {
        const idx = draft.appearance.rows.indexOf(prev);
        draft.appearance.rows[idx] = row;
        out = { ok: true, who: w, tier: effTier, form: form, updated: true };
      } else {
        draft.appearance.rows.push(row);
        if (WA.evict) WA.evict.array(draft.appearance.rows, 'appearance.rows');
        out = { ok: true, who: w, tier: effTier, form: form, updated: false };
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
      weightedBy: hit.weightedBy, cover: Object.assign({}, hit.cover), form: hit.form,
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
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      const c = r.cover || {};
      return '· ' + r.who + '：' + (TIER_LABELS[r.effTier] || r.effTier) + '（L1×' + (c.L1 || 0) + ' L2×' + (c.L2 || 0) +
        ' L3×' + (c.L3 || 0) + ' L4×' + (c.L4 || 0) + '）' + (r.weighted ? '【关系加权】' : '') +
        (r.form !== 'humanoid' ? '（' + (FORM_LABELS[r.form] || r.form) + '）' : '');
    });
    return '[外貌契约]\n' + lines.join('\n') + '\n分级决定扫描深度：S 完整四层、A 完整五官+精选身体、B 精选四件套、C 至少 1 个可识别特征；恋人/血亲/宿敌自动升一级；再出场只写当前视角最值得看的 1-3 个细节。\n';
  }
  WA.appearance = {
    TIERS: TIERS, TIER_LABELS: TIER_LABELS, FORMS: FORMS, FORM_LABELS: FORM_LABELS,
    LAYERS: LAYERS, LAYER_LABELS: LAYER_LABELS, WEIGHT_RELATIONS: WEIGHT_RELATIONS,
    COVERAGE_REQ: COVERAGE_REQ,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    register: register, read: read, sceneAssert: sceneAssert, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
