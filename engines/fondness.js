/**
 * WorldAxis engines/fondness.js (v2.77.0)
 * 好感审计：步进白名单 + 好感不降准则 + 上限 + 区间语义 + 阶段授权 + 提案过期 + 行级撤销 + 纠错依据。
 *
 * 缝合来源（两批）：
 *   ①《❖ 好感度模块 [1093]》情感材质审计协议（v2.67.0 起）——四条数值纪律：
 *      步进白名单 / 好感不降 / 上限 100 / 五段区间语义。
 *   ② 反向好感度 v1.9.0（酒馆助手脚本「reverse-affection」，v2.77.0 缝入）——原文的
 *      八阶段分档与「玩家拥有最终解释权」是一整套**结算端纪律**；能落成引擎判据的只有四条
 *      （原文的八段名称表、面板、独立评估器、世界书同步、API 重试都不进本模块：名称表与
 *      面板是渲染面，评估器/同步/重试属宿主编排，另案）：
 *      · 阶段封顶（band-cap）：读数跨过当前段上限即拒收，须 advance() 显式授权进段；
 *        授权时读数必须**恰好停在段顶**（「还差一点也想进段」不叫授权，叫跳档）。
 *      · 提案过期（stale-proposal）：待确认建议以「提交它时的读数」为准；读数已变即作废——
 *        原文 `p.from !== s.score => 建议已过期`。它治的是「玩家离开几轮后回来点确认，
 *        把旧建议套到新现场上」。
 *      · 行级撤销（not-undoable）：只能撤销「最近一次 自动/玩家采纳 变化」，且该变化的
 *        `to` 必须等于当前读数；否则如实报不可撤（手动纠错请走 correct()）。
 *      · 纠错依据（corrections）：撤销与纠错都留一条「不要再次依据此事件」的口径，注入时
 *        明标「数据，不是角色记忆」——它是给模型的约束，不是角色知道的事。
 *
 * **撤销与「好感不降」不矛盾**：不降准则约束的是**结算入口**（apply 没有负步进入口，
 *   冲突走 trust 对冲），而 undo/correct 是**玩家与作者的纠错通道**——在旧版里好感只增
 *   不减，一次误加无法回退（本仓「参数编辑有写没有退」是 v2.30.0 已裁决的同型病）。
 *   两者正交：模型仍然没有「扣好感」这条路，玩家有「改错」这条路。
 *
 * **默认零行为变更**：阶段授权由 staged 开关控制，默认 false；提案过期只在 mode:'confirm'
 *   下存在，默认 'auto'。关闭时本模块行为与 v2.76.0 逐字等价（回归可证）。
 *
 * 与 bonds.js / shadow.js 的分工：bonds 记关系**结构**（六型），shadow 记关系**经历**
 * （承诺履行/背弃），本模块记关系的**温度读数**——三者正交。
 *
 * 边界（全是否定式）：
 *   1 总开关默认关闭。关闭时 apply() 返回 reason:'disabled'，不结算。
 *   2 负步进整次拒收（non-positive-delta）：好感不降准则不是「扣得少」，是**没有负入口**。
 *     冲突走 trust 对冲（delta 为负时报错并提示改走 trust 字段）。
 *   3 不在白名单的步进拒收（off-step）：+0.2、+0.4、+0.6 都不合法，白名单就是白名单。
 *   4 超上限拒收（over-cap）：总值 100 封顶，超出不截断到 100，整次拒收。
 *   5 trust 只收 0..100 整数，越界拒收（bad-trust）。
 *   6 未登记行首次 apply 自动建行（起始 0 起算），但 trust 必须显式给（不猜默契）。
 *   7 staged 开启时跳越段顶拒收（band-cap）：不截断到段顶，整次拒收并提示 advance()。
 *   8 confirm 模式下 apply() 只入账待确认（pending），不直接改值；同一行已有待确认时
 *     再提交拒收（already-pending），不覆盖、不排队。
 *   9 accept() 校验建议未过期（stale-proposal）；拒收时**顺带作废**该建议（不留给下一次）。
 *  10 undo() 只认最近一次 自动/采纳 且与当前读数对得上；否则 not-undoable，不猜、不倒推。
 *  11 advance() 要求读数恰好停在当前段上限；未到顶 not-at-cap，已最高段 top-stage，
 *      staged 未开 stage-off、locked 时 locked——四条各自具名。
 *  12 correct() 是玩家手动纠错：value 必须在 0..100 且不低于当前值（不降准则同样约束它，
 *     要真降值请走 undo，那条路带「不要再次依据此事件」的留痕）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_fondness_settings_v1';
  // v2.77.0: staged / mode / locked 三项为阶段授权与结算纪律的新增设置。
  //   默认值即「与 v2.76.0 逐字等价」：staged=false、mode='auto'、locked=false。
  const DEF = { enabled: false, maxRows: 16, staged: false, mode: 'auto', locked: false };
  const __REG = { key: LS_KEY, def: DEF, module: 'fondness', bounds: { maxRows: [2, 32] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const STEPS = [0.1, 0.3, 0.5, 0.8];
  const CAP = 100;
  const BANDS = [
    { lo: 0, hi: 20, name: '无感' }, { lo: 20, hi: 40, name: '防御' },
    { lo: 40, hi: 60, name: '中性' }, { lo: 60, hi: 80, name: '亲近' },
    { lo: 80, hi: 100, name: '绑定' }
  ];

  const stat = { applies: 0, blocked: 0, lastReason: '', faults: {},
    pending: 0, accepts: 0, rejects: 0, undos: 0, advances: 0, corrections: 0 };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().fondness; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function bandOf(v) { return BANDS.filter(function (b) { return v >= b.lo && v < b.hi; })[0] || BANDS[4]; }
  function bandIdxOf(v) { return BANDS.indexOf(bandOf(v)); }
  // v2.77.0 段顶（段内最大可取值）：显示用的 bandOf 是**半开区间**（v2.76.0 原契约，本版不改）。
  //   若把授权上限直接写成 hi，值在半开区间下永远到不了 hi（一到 hi 就换段、上限随之抬到下一档），
  //   于是封顶永远拦不住任何一次步进、advance 也永远报 not-at-cap——段顶成为不可达态（本版落地时实测到的真缺陷）。
  //   故授权的「段顶」取段内最大可取值 hi-0.1（步进粒度 0.1，读数一律保留 1 位）；末段（绑定）封顶在 CAP=100。
  //   这样显示口径与授权口径同源：站在段顶时 bandOf(v) 仍是本段名，buildBlock 的段名与 read().band 不会打架。
  function segTop(idx) { const hi = BANDS[idx].hi; return hi >= CAP ? CAP : +(hi - 0.1).toFixed(1); }
  function capOfRow(hit) {
    const auth = (typeof hit.auth === 'number' && hit.auth >= 0 && hit.auth <= BANDS.length - 1) ? hit.auth : 0;
    const idx = Math.min(BANDS.length - 1, Math.max(bandIdxOf(hit.value), auth));
    return segTop(idx);
  }
  function enabled() { return !!settings().enabled; }
  function findRow(draft, who) {
    const rows2 = (draft.fondness && Array.isArray(draft.fondness.rows)) ? draft.fondness.rows : [];
    return rows2.filter(function (r) { return r && r.person === who; })[0] || null;
  }
  function pushHist(hit, entry) {
    if (!Array.isArray(hit.history)) hit.history = [];
    hit.history.push(Object.assign({ at: clockNow('fondness') }, entry));
    // 站点名必须是字面量：G18「无声明悬空站点」门禁只认单引号字面量（常量变量会被判成零调用）。
    if (WA.evict) WA.evict.array(hit.history, 'fondness.history');
  }
  function pushCorr(hit, text) {
    const t = clean(text, 80);
    if (!t) return;
    if (!Array.isArray(hit.corrections)) hit.corrections = [];
    hit.corrections.push(t);
    if (WA.evict) WA.evict.array(hit.corrections, 'fondness.corrections');
  }
  /**
   * 结算一次好感步进。opts: { delta, trust, note, reason }
   * delta 必须在步进白名单内且为正；trust 可选（显式给才更新，0..100 整数）。
   * v2.77.0: mode='confirm' 时只写 pending（不改值）；staged 开启时跳越段顶拒收 band-cap。
   */
  function apply(person, opts) {
    const who = clean(person, 40);
    const p = opts || {};
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const cfg = settings();
    const delta = p.delta;
    if (typeof delta !== 'number' || !isFinite(delta)) { noteFault('bad-delta'); return { ok: false, reason: 'bad-delta' }; }
    if (delta <= 0) {
      noteFault('non-positive-delta');
      return { ok: false, reason: 'non-positive-delta', hint: '好感不降：冲突走 trust 对冲' };
    }
    if (STEPS.indexOf(delta) < 0) { noteFault('off-step'); return { ok: false, reason: 'off-step', allowed: STEPS.slice() }; }
    const trust = p.trust;
    if (trust != null && (typeof trust !== 'number' || !isFinite(trust) || trust < 0 || trust > 100 || (trust | 0) !== trust)) {
      noteFault('bad-trust'); return { ok: false, reason: 'bad-trust' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      draft.fondness = draft.fondness && typeof draft.fondness === 'object' && !Array.isArray(draft.fondness) ? draft.fondness : { rows: [] };
      draft.fondness.rows = Array.isArray(draft.fondness.rows) ? draft.fondness.rows : [];
      let hit = draft.fondness.rows.filter(function (r) { return r && r.person === who; })[0];
      if (!hit) { hit = { person: who, value: 0, trust: null, note: '', at: 0 }; draft.fondness.rows.push(hit); }
      const next = +(hit.value + delta).toFixed(1);
      if (next > CAP) { out = { ok: false, reason: 'over-cap', value: hit.value }; return; }
      // v2.77.0: 阶段封顶——staged 开启时单次步进不得跳越本行已授权段的段顶。
      //   不截断、不静默夹取（截断等于替玩家做了「进段」这个决定）。
      if (cfg.staged && next > capOfRow(hit)) {
        out = { ok: false, reason: 'band-cap', value: hit.value, cap: capOfRow(hit), hint: '跳越段顶需 advance() 显式授权进段' };
        return;
      }
      if (cfg.locked && cfg.mode === 'manual') { out = { ok: false, reason: 'locked', value: hit.value }; return; }
      // v2.77.0: confirm 模式只入账待确认，不直接改值（建议过期在 accept 侧核验）。
      if (cfg.mode === 'confirm') {
        if (hit.pending) { out = { ok: false, reason: 'already-pending', value: hit.value }; return; }
        hit.pending = { from: hit.value, to: next, delta: delta, reason: clean(p.reason || p.note || '', 80), at: clockNow('fondness') };
        stat.pending++;
        out = { ok: true, person: who, value: hit.value, pending: true, to: next, band: bandOf(hit.value).name };
        return;
      }
      hit.value = next;
      if (trust != null) hit.trust = trust;
      if (p.note) hit.note = clean(p.note, 80);
      hit.at = clockNow('fondness');
      hit.pending = null;
      pushHist(hit, { kind: '自动', from: next - delta, to: next, requested: delta, reason: clean(p.reason || '', 80) });
      if (WA.evict) WA.evict.array(draft.fondness.rows, 'fondness.rows');
      out = { ok: true, person: who, value: hit.value, trust: hit.trust, band: bandOf(hit.value).name };
    }, 'fondness:apply');
    if (out && out.ok) { stat.applies++; stat.lastReason = out.pending ? 'pending' : 'applied'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * v2.77.0 提案入口（语义别名，便于调用方区分「提建议」与「结算」）。
   *   与 apply 共用全部拒收码；差别只在调用意图，行为完全一致（不另立一套判据）。
   */
  function propose(person, opts) { return apply(person, opts); }
  /** 采纳待确认建议。读数已变 ⇒ stale-proposal 并作废该建议。 */
  function accept(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!enabled()) return { ok: true, reason: 'disabled' };
    const cfg = settings();
    let out = null;
    WA.store.transact(function (draft) {
      const hit = findRow(draft, who);
      if (!hit) { out = { ok: false, reason: 'missing', person: who }; return; }
      if (cfg.locked) { out = { ok: false, reason: 'locked', person: who }; return; }
      const pd = hit.pending;
      if (!pd) { out = { ok: false, reason: 'no-pending', person: who }; return; }
      // 建议过期：以「提交它时的读数」为准——读数已变，该建议不再指向同一现场。
      if (pd.from !== hit.value) {
        hit.pending = null;
        // 站点名必须是字面量：G18「无声明悬空站点」门禁只认单引号字面量（常量变量会被判成零调用）。
    if (WA.evict) WA.evict.array(hit.history, 'fondness.history');
        out = { ok: false, reason: 'stale-proposal', person: who, from: pd.from, value: hit.value };
        return;
      }
      if (pd.to > CAP) { out = { ok: false, reason: 'over-cap', value: hit.value }; return; }
      hit.value = pd.to;
      hit.pending = null;
      hit.at = clockNow('fondness');
      if (pd.reason) hit.note = clean(pd.reason, 80);
      pushHist(hit, { kind: '玩家采纳', from: pd.from, to: pd.to, requested: pd.delta, reason: pd.reason });
      if (WA.evict) WA.evict.array(draft.fondness.rows, 'fondness.rows');
      out = { ok: true, person: who, value: hit.value, band: bandOf(hit.value).name };
    }, 'fondness:accept');
    if (out && out.ok) { stat.accepts++; stat.lastReason = 'accepted'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 拒绝待确认建议：作废并留一条「判定不变」历史（它仍占历史位，可被后续 undo 跳过）。 */
  function reject(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!enabled()) return { ok: true, reason: 'disabled' };
    let out = null;
    WA.store.transact(function (draft) {
      const hit = findRow(draft, who);
      if (!hit) { out = { ok: false, reason: 'missing', person: who }; return; }
      const pd = hit.pending;
      if (!pd) { out = { ok: false, reason: 'no-pending', person: who }; return; }
      hit.pending = null;
      pushHist(hit, { kind: '判定不变', from: pd.from, to: pd.from, requested: pd.delta, reason: pd.reason || '玩家拒绝' });
      out = { ok: true, person: who, value: hit.value, rejected: true };
    }, 'fondness:reject');
    if (out && out.ok) { stat.rejects++; stat.lastReason = 'rejected'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * v2.77.0 行级撤销：只能撤销「最近一次 自动/玩家采纳 变化」，且其 to 必须等于当前读数。
   *   撤销后追加一条纠错依据——下次推演不得再依据同一事件加好感。
   *   与正确的分工：undo 面向「刚发生的一次误加」（带留痕、有前置校验），
   *   correct 面向「玩家按自己的判断手动对齐」（直接给值，不带撤销留痕）。
   */
  function undo(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!enabled()) return { ok: true, reason: 'disabled' };
    let out = null;
    WA.store.transact(function (draft) {
      const hit = findRow(draft, who);
      if (!hit) { out = { ok: false, reason: 'missing', person: who }; return; }
      const hist = Array.isArray(hit.history) ? hit.history : [];
      let last = null;
      for (let i = hist.length - 1; i >= 0; i--) {
        const e = hist[i];
        if (e && e.kind !== '判定不变') { last = e; break; }
      }
      if (!last || (last.kind !== '自动' && last.kind !== '玩家采纳')) {
        out = { ok: false, reason: 'not-undoable', person: who, hint: '最近一项不是可撤销的自动变化，请用 correct() 手动纠错' };
        return;
      }
      if (last.to !== hit.value) {
        out = { ok: false, reason: 'not-undoable', person: who, to: last.to, value: hit.value };
        return;
      }
      hit.value = last.from;
      // v2.77.0: 不在此清空待确认建议——旧建议指向旧读数，留着让 accept() 如实报 stale-proposal，
      //   而不是靠「顺手抹掉」把一次过期争议变成 no-pending（把问题藏起来）。
      hit.at = clockNow('fondness');
      pushCorr(hit, '不要再次依据此事件变更好感：' + (last.reason || '（未注明依据）'));
      pushHist(hit, { kind: '撤销', from: last.to, to: last.from, reason: '玩家撤销：' + (last.reason || '') });
      if (WA.evict) WA.evict.array(draft.fondness.rows, 'fondness.rows');
      out = { ok: true, person: who, value: hit.value, band: bandOf(hit.value).name, undone: last.to };
    }, 'fondness:undo');
    if (out && out.ok) { stat.undos++; stat.lastReason = 'undone'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 玩家手动纠错：给一个不低于当前值的读数并留一条纠错依据。降值请走 undo()。 */
  function correct(person, value, note) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!enabled()) return { ok: true, reason: 'disabled' };
    if (typeof value !== 'number' || !isFinite(value) || value < 0 || value > CAP) {
      noteFault('bad-value'); return { ok: false, reason: 'bad-value', range: [0, CAP] };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const hit = findRow(draft, who);
      if (!hit) { out = { ok: false, reason: 'missing', person: who }; return; }
      if (value < hit.value) {
        out = { ok: false, reason: 'non-positive-delta', value: hit.value, hint: '纠错不得降值：要回退刚发生的那次加值请走 undo()' };
        return;
      }
      const from = hit.value;
      hit.value = +value.toFixed(1);
      // v2.77.0: 同上——玩家手动纠错不改「旧建议已过期」这个事实。
      hit.at = clockNow('fondness');
      if (note) pushCorr(hit, note);
      pushHist(hit, { kind: '玩家纠错', from: from, to: hit.value, reason: clean(note || '玩家手动确认', 80) });
      if (WA.evict) WA.evict.array(draft.fondness.rows, 'fondness.rows');
      out = { ok: true, person: who, value: hit.value, band: bandOf(hit.value).name };
    }, 'fondness:correct');
    if (out && out.ok) { stat.corrections++; stat.lastReason = 'corrected'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * v2.77.0 阶段授权：读数恰好停在当前（已授权）段顶时，允许进入下一段。
   *   四条拒收各自具名：stage-off（开关未开）/ locked / not-at-cap（还差一点）/ top-stage（已最高）。
   *   授权只放宽**上限许可**，不改变读数——读数仍只由 apply/accept 推动。
   */
  function advance(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!enabled()) return { ok: true, reason: 'disabled' };
    const cfg = settings();
    if (!cfg.staged) { noteFault('stage-off'); return { ok: false, reason: 'stage-off', hint: '阶段授权未启用（设置 staged）' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const hit = findRow(draft, who);
      if (!hit) { out = { ok: false, reason: 'missing', person: who }; return; }
      if (cfg.locked) { out = { ok: false, reason: 'locked', person: who }; return; }
      const idx = Math.min(BANDS.length - 1, Math.max(bandIdxOf(hit.value), (typeof hit.auth === 'number' && hit.auth >= 0) ? hit.auth : 0));
      if (idx >= BANDS.length - 1) { out = { ok: false, reason: 'top-stage', person: who, stage: BANDS[idx].name }; return; }
      if (hit.value !== segTop(idx)) {
        out = { ok: false, reason: 'not-at-cap', person: who, value: hit.value, need: segTop(idx) };
        return;
      }
      hit.auth = idx + 1;
      pushHist(hit, { kind: '玩家授权', from: hit.value, to: hit.value, reason: '玩家明确许可进入 ' + BANDS[idx + 1].name });
      out = { ok: true, person: who, value: hit.value, stage: BANDS[idx + 1].name, cap: segTop(idx + 1) };
    }, 'fondness:advance');
    if (out && out.ok) { stat.advances++; stat.lastReason = 'advanced'; } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 读一个人当前读数与区间名。未登记如实报 missing。 */
  function read(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, person: who, value: 0, band: '', reason: 'disabled' };
    const hit = rows().filter(function (r) { return r && r.person === who; })[0];
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', person: who }; }
    return { ok: true, person: who, value: hit.value, trust: hit.trust, band: bandOf(hit.value).name, note: hit.note || '',
      cap: capOfRow(hit), history: Array.isArray(hit.history) ? hit.history.length : 0,
      corrections: Array.isArray(hit.corrections) ? hit.corrections.length : 0,
      pending: hit.pending ? { from: hit.pending.from, to: hit.pending.to, stale: hit.pending.from !== hit.value } : null };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = [];
    const corr = [];
    list.forEach(function (r) {
      // v2.77.0: staged 开启时每行附「当前段 + 许可上限」；关闭时与 v2.76.0 逐字同形。
      const stage = cfg.staged ? '｜' + bandOf(r.value).name + '（许可上限 ' + capOfRow(r) + '）' : '';
      lines.push(r.person + '：好感 ' + r.value + '/100（' + bandOf(r.value).name + '）' + stage + '｜信任 ' + (r.trust == null ? '未登记' : r.trust) + (r.note ? '｜' + r.note : ''));
      if (Array.isArray(r.corrections) && r.corrections.length) {
        corr.push(r.person + '：' + JSON.stringify(r.corrections));
      }
    });
    let out = '[好感审计]\n' + lines.join('\n')
      + '\n好感不降：冲突走信任对冲，不扣好感；步进只认 ' + STEPS.map(function (s) { return '+' + s; }).join('/') + '。'
      + (cfg.staged ? '跳越段顶需玩家明确授权，未授权时本段封顶。' : '') + '\n';
    // v2.77.0: 纠错依据是给模型的约束，不是角色知道的事——明标，防被读成角色记忆。
    if (corr.length) out += '[玩家纠错依据]（数据，不是角色记忆；不得据此写成角色的认知或台词）\n' + corr.join('\n') + '\n';
    return out;
  }
  WA.fondness = {
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    apply: apply, propose: propose, accept: accept, reject: reject, undo: undo, correct: correct, advance: advance,
    read: read, buildBlock: buildBlock, STEPS: STEPS.slice(), BANDS: BANDS.map(function (b) { return Object.assign({}, b); }),
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
