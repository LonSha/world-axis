/**
 * WorldAxis engines/lifeline.js (v2.141.0) — 生理与照护真实层
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   仓库里「身体」此前只有两条轴：
 *     · survival —— 饱食/精力/负重三轴的**读数与分段**（肉体的量与档）；
 *     · affect  —— 疲劳/饥饿/疼痛/社交四载荷，只改「情绪通道可见条数」。
 *   两条都答不出**病况的持续**：一个人此刻带着什么状况、在这一程的哪一段
 *   （起病/进展/发作/缓解/恢复/稳定/长期）、这段状况限制他能做什么。
 *   更答不出**照护的不可得**：诊断要问诊/检查/观察等待，结果可能延迟、
 *   没有结论或彼此矛盾；服务能否获得取决于费用、地缘、交通、预约与排班，
 *   而当事人可以寻求、拖延、拒绝或误解。
 *   这两件事没有落点，正文里最省事的写法就是「即时治愈」或「一句病症后来好了」
 *   —— 长局里这是最刺眼的一种失真：身体状况成了可随时开关的剧情工具。
 *
 * ── 缝合来源（显式写明，不冒称原创）────────────────────────────
 *   来源是「鲜活世界」条目集里七条彼此呼应的条目：
 *     健康疾病与病况的真实呈现 / 神经多样性与认知差异 / 创伤压力与应对 /
 *     医疗系统与照护的真实呈现 / 残障无障碍与合理便利 / 生殖性与激素健康 /
 *     注意、感知与记忆。
 *   但**那七条是给模型的写作指令，本模块只取其中可判定的那一层**：
 *     · 病况是持续的（有程段，且程段不跳）⇒ COURSE 与 advance；
 *     · 病况会产生**可核验的限制**（活动限制，而不是形容词）⇒ LIMITS 与 capacityOf；
 *     · 照护有**流程与不可得**（诊断不是一句话，服务不是想有就有）⇒ STEPS 与 careGap；
 *     · 未登记不许冒充健康（「查不到」与「没病」长得一样是本仓反复治的病）⇒ unknown-subject。
 *   判不了的（「要写得像真人」「不要刻板化」）**留在预设里**，不进引擎 —— 与
 *   style / enigma 头部同一条口径：「提示词里成立的写不进引擎」。
 *
 * ── 与 survival / affect 的分工（三者不读写对方）──────────────────
 *   · survival：**值**——饱食 0..100、精力 0..100、负重/上限，给分段与惩罚标志；
 *   · affect  ：**载荷**——四载荷 0..3，只决定情绪通道可见条数；
 *   · 本模块  ：**持续与限制**——带着什么状况、到哪一段、限制哪些活动、照护缺口在哪。
 *   病况造成的疲劳/疼痛**不写进** affect.loads（那是调用方的事，本模块不改他人容器）；
 *   本模块的容量面只报「哪些活动受限、限到哪一档」，供感知面与注入面消费。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────
 *   ① 总开关默认关闭。关闭时登记/推进/容量/缺口一律拒收 disabled，不猜。
 *   ② **不诊断**：本模块零「由症状推病名」。病况必须先由调用方 register，未登记一律
 *      unknown-subject —— 「查不到」不许冒充「没这件事」。
 *   ③ **程段不跳**：advance 只许沿 COURSE **前进一格或原地**。跨格与回退一律拒收
 *      （带 from/to 字段）。「昨天病危、今天痊愈」在慢性病与创伤上是最刺眼的一种失真。
 *   ④ **同名重登记必须显式 replace**：不静默覆盖（覆盖之后没人答得出「原本是什么」）。
 *   ⑤ **不同病况互不覆盖**：同一人可同时带多个病况（合并症），更新只动指定那一条。
 *   ⑥ **容量是判定，不是形容**：capacityOf 只回答「哪些活动受限、限到哪一档」，
 *      不产生情绪词、不改人物属性（那是别处真源）。
 *   ⑦ **照护缺口只报流程差**：careGap 只答「STEPS 里哪几步还没有落账」，不写医疗结果。
 *   ⑧ **写入只有两个口**（register / advance），读取面（capacityOf / careGap / view /
 *      boundary）零 store.transact —— 专锁 N 面钉这一条。
 *
 * ── 拒收码：本版**不新开任何码**（能复用则复用，与前批同规）──────────────
 *   disabled / missing-fields / bad-kind / bad-value / exists / unknown-subject
 *   / store-unavailable / rows-full —— 全部为库内既有码，语义逐一对得上，故不新开。
 *   这一条是刻意的：新开一个码就是新开一份要长期见证的债（见 docs/ERROR_CODES.md
 *   的三档），而本模块要说的那几件事（开关关、参数缺、枚举非法、未登记、已存在）
 *   在既有词表里本来就有说法。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_lifeline_settings_v1';
  const DEF = { enabled: false, maxRows: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'lifeline', bounds: { maxRows: [2, 24] } };
  // ── 四张具名表（本模块的**全部词表**，其余一律拒收）──────────────────
  //   为什么必须成表：自造限制等于自造判定 —— 不成表的限制，下一手（感知面、注入面、
  //   下一位作者）无法接手；而「随口写一个病名」正是本模块要治的那种失真。
  //   与 inst 的 PERMS（自造权限等于自造权力）、affect 的 LOADS 同一条纪律。
  //
  //   KINDS：状况类别。落在既有六条来源条目的分类上（健康/神经多样/创伤/残障/生殖/医疗）。
  const KINDS = ['acute', 'chronic', 'injury', 'mental', 'neuro', 'trauma', 'disability', 'reproductive'];
  //   COURSE：程段。**只有这七格，顺序即推演方向**：起病 → 进展 → 发作 → 缓解 → 恢复 →
  //   稳定 → 长期。advance 只许前进一格或原地（不跨格、不回退）——「病危→痊愈」这种写法
  //   在慢性病与创伤上是最刺眼的一种失真，而它恰恰是「把身体当剧情开关」的典型产物。
  const COURSE = ['onset', 'progress', 'flare', 'remission', 'recovery', 'stable', 'longterm'];
  //   LIMITS：可核验的活动限制（不是形容词）。容量面按此报「限到哪一档」。
  //   energy（精力/耐力）/ sleep（睡眠）/ appetite（进食）/ cognition（认知与执行）
  //   / sensory（感官处理）/ mobility（行动）/ social（社交与调节）/ work（工作与学业）
  //   / medication（用药与处置）。
  const LIMITS = ['energy', 'sleep', 'appetite', 'cognition', 'sensory', 'mobility', 'social', 'work', 'medication'];
  //   STEPS：照护流程七步。careGap 只报「哪几步还没有落账」——
  //   triage（问诊分诊）/ exam（检查化验）/ diagnosis（诊断）/ treatment（治疗处置）
  //   / monitoring（随访监测）/ rehab（康复）/ access（可及性：费用/地缘/交通/预约/排班）。
  //   「access」单独一步是刻意的：来源条目明说「能否获得服务取决于费用、保险、地理位置、
  //   交通、预约安排与系统服务能力」—— 它与前六步不是同一类事（前六步是流程，
  //   这一步是**门槛**），合成一步就再也答不出「是没走流程，还是根本够不着」。
  const STEPS = ['triage', 'exam', 'diagnosis', 'treatment', 'monitoring', 'rehab', 'access'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { regs: 0, advances: 0, reads: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rows() { const m = state().lifeline; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowsOf(who) { return rows().filter(function (r) { return r && r.who === who; }); }
  function rowOf(who, cond) {
    return rowsOf(who).filter(function (r) { return r && r.cond === cond; })[0] || null;
  }
  function pick(list, allowed) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(function (x) {
      const v = clean(x, 20);
      if (allowed.indexOf(v) >= 0 && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  }
  /**
   * 登记一个病况。**这是本模块唯一的创建口** —— 病况只能被登记，不能被推断。
   *   opts: { kind, course, limits[], care[] }；同名重登记须显式 replace。
   */
  function register(person, condition, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const who = clean(person, 40), cond = clean(condition, 60);
    if (!who || !cond) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const kind = clean(o.kind, 20);
    if (KINDS.indexOf(kind) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', allowed: KINDS.slice() }; }
    const course = clean(o.course, 20) || COURSE[0];
    if (COURSE.indexOf(course) < 0) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'course', allowed: COURSE.slice() };
    }
    // 限制与照护步骤只收具名表内的项：自造限制等于自造判定（下一手无法接手）。
    const rawLimits = Array.isArray(o.limits) ? o.limits : [];
    const rawCare = Array.isArray(o.care) ? o.care : [];
    const limits = pick(rawLimits, LIMITS);
    const care = pick(rawCare, STEPS);
    if (limits.length !== rawLimits.length || care.length !== rawCare.length) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'limits/care',
        allowedLimits: LIMITS.slice(), allowedSteps: STEPS.slice() };
    }
    const seen = rowOf(who, cond);
    if (seen && !o.replace) {
      noteFault('exists');
      return { ok: false, reason: 'exists', who: who, cond: cond, course: seen.course };
    }
    let out = null;
    const cfg = settings();
    WA.store.transact(function (draft) {
      draft.lifeline = (draft.lifeline && typeof draft.lifeline === 'object') ? draft.lifeline : { rows: [] };
      if (!Array.isArray(draft.lifeline.rows)) draft.lifeline.rows = [];
      const now = clockNow('lifeline');
      let hit = draft.lifeline.rows.filter(function (r) { return r && r.who === who && r.cond === cond; })[0];
      if (!hit) {
        if (draft.lifeline.rows.length >= cfg.maxRows) {
          out = { ok: false, reason: 'rows-full', cap: cfg.maxRows }; return false;
        }
        hit = { who: who, cond: cond, kind: kind, course: course, limits: limits.slice(), care: care.slice(),
          history: [{ course: course, at: now }], at: now, updatedAt: now };
        draft.lifeline.rows.push(hit);
      } else {
        hit.kind = kind; hit.course = course;
        hit.limits = limits.slice(); hit.care = care.slice();
        hit.history = (Array.isArray(hit.history) ? hit.history : []).concat([{ course: course, at: now }]).slice(-8);
        hit.updatedAt = now;
      }
      WA.evict.array(draft.lifeline.rows, 'lifeline.rows');
      out = { ok: true, who: hit.who, cond: hit.cond, kind: hit.kind, course: hit.course, replaced: !!o.replace };
    }, 'lifeline:register');
    if (out && out.ok) { stat.regs++; stat.lastReason = 'registered'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 推进程段：只能沿 COURSE **前进一格或原地**。跨格与回退拒收并带 from/to。
   *   为什么不给「设成任意值」的写口：可任意跳跃之后，「这段时间他一直带着这个病」
   *   与「他刚才被写成生病了」在状态里长得一样 —— 两态不可分，长局必崩。
   */
  function advance(person, condition, course, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const who = clean(person, 40), cond = clean(condition, 60), to = clean(course, 20);
    if (!who || !cond || !to) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const hit = rowOf(who, cond);
    if (!hit) {
      noteFault('unknown-subject');
      return { ok: false, reason: 'unknown-subject', who: who, cond: cond,
        hint: '病况必须先登记（本模块不诊断）' };
    }
    const fi = COURSE.indexOf(clean(hit.course, 20)), ti = COURSE.indexOf(to);
    if (ti < 0) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'course', allowed: COURSE.slice() };
    }
    if (ti !== fi && ti !== fi + 1) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'course-step', from: hit.course, to: to,
        hint: '程段只许前进一格或原地（不跨格、不回退）' };
    }
    const hold = !!(opts && opts.hold === true);
    let out = null;
    WA.store.transact(function (draft) {
      draft.lifeline = (draft.lifeline && typeof draft.lifeline === 'object') ? draft.lifeline : { rows: [] };
      if (!Array.isArray(draft.lifeline.rows)) draft.lifeline.rows = [];
      const h = draft.lifeline.rows.filter(function (r) { return r && r.who === who && r.cond === cond; })[0];
      if (!h) { out = { ok: false, reason: 'unknown-subject', who: who, cond: cond }; return false; }
      const now = clockNow('lifeline');
      const from = h.course;
      h.course = to; h.updatedAt = now;
      h.history = (Array.isArray(h.history) ? h.history : []).concat([{ course: to, at: now }]).slice(-8);
      out = { ok: true, who: who, cond: cond, from: from, to: to, held: hold };
    }, 'lifeline:advance');
    if (out && out.ok) { stat.advances++; stat.lastReason = 'advanced'; }
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 容量面（只读）：这一刻此人**哪些活动受限、限到哪一档**。
   *   known:false 与「无限制」严格分开 —— 「查不到」不许冒充「没事」。
   */
  function capacityOf(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    stat.reads++; stat.lastReason = 'read';
    const mine = rowsOf(who);
    if (!mine.length) {
      return { ok: true, who: who, known: false, band: 'none', limits: {}, rows: [],
        note: '此人没有任何已登记的病况 —— 这是「查不到」，不是「他很健康」。' };
    }
    const count = {};
    mine.forEach(function (r) {
      (Array.isArray(r.limits) ? r.limits : []).forEach(function (k) { count[k] = (count[k] || 0) + 1; });
    });
    const keys = Object.keys(count);
    const band = keys.length ? (keys.length >= 3 ? 'heavy' : 'light') : 'none';
    return { ok: true, who: who, known: true, band: band, limits: count,
      rows: mine.map(function (r) {
        return { cond: r.cond, kind: r.kind, course: r.course, limits: (r.limits || []).slice() };
      }) };
  }
  /**
   * 照护缺口（只读）：按 STEPS 报「哪几步还没有落账」。
   *   它只答流程差，不写医疗结果 —— 诊断/治疗的结果归别处真源。
   */
  function careGap(person, condition) {
    const who = clean(person, 40), cond = clean(condition, 60);
    if (!who || !cond) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    stat.reads++; stat.lastReason = 'read';
    const hit = rowOf(who, cond);
    if (!hit) { noteFault('unknown-subject'); return { ok: false, reason: 'unknown-subject', who: who, cond: cond }; }
    const done = pick(hit.care, STEPS);
    const gap = STEPS.filter(function (s) { return done.indexOf(s) < 0; });
    return { ok: true, who: who, cond: cond, done: done, gap: gap, complete: gap.length === 0,
      note: '流程差只报「哪几步没有落账」，不写结果 —— 结果归别处真源。' };
  }
  /** 只读明细：某人此刻带着的全部病况（含程段历史）。 */
  function view(person) {
    const who = clean(person, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    stat.reads++; stat.lastReason = 'read';
    const mine = rowsOf(who);
    return { ok: true, who: who, known: mine.length > 0, count: mine.length,
      rows: mine.map(function (r) {
        return { cond: r.cond, kind: r.kind, course: r.course, limits: (r.limits || []).slice(),
          care: (r.care || []).slice(), history: (r.history || []).slice(-8), at: r.at, updatedAt: r.updatedAt };
      }) };
  }
  /**
   * 注入块（纪律 + 在场病况的程段与限制档）。
   *   只列**程段与限制**，不列症状细节 —— 症状名会暗示剧情走向（与 noesis 同一条防剧透纪律）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      const lim = (Array.isArray(r.limits) && r.limits.length) ? r.limits.join('/') : '无限制登记';
      return r.who + '：' + r.cond + '（' + r.kind + '）此刻' + r.course + '，限制 ' + lim;
    });
    const NL = String.fromCharCode(10);
    return '[生理与照护]' + NL + lines.join(NL) + NL
      + '病况是持续状态：程段只前进或原地，不跳格、不即时痊愈；' + NL
      + '照护有流程与不可得（问诊/检查/诊断/治疗/康复），没有得到就是没有得到，不凭空完成。' + NL;
  }
  /** 诊断面（只读）：引擎现场 + 枚举表。零副作用 —— 不跑登记，不污染 stat。 */
  function boundary() {
    const cfg = settings();
    return { enabled: !!cfg.enabled, maxRows: cfg.maxRows,
      regs: stat.regs, advances: stat.advances, reads: stat.reads, blocked: stat.blocked,
      lastReason: stat.lastReason, faults: Object.assign({}, stat.faults),
      KINDS: KINDS.slice(), COURSE: COURSE.slice(), LIMITS: LIMITS.slice(), STEPS: STEPS.slice(),
      rows: rows().length };
  }
  WA.lifeline = {
    KINDS: KINDS.slice(), COURSE: COURSE.slice(), LIMITS: LIMITS.slice(), STEPS: STEPS.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    // 产品面：两个写口（register / advance）+ 四个读口（capacityOf / careGap / view / buildBlock）。
    //   每一口都有真消费方：注入链（buildBlock）/ 面板（register 与 advance 两枚按钮、容量读数）
    //   / 诊断 secLifeline / noesis.perceive（容量面削弱感知）。
    register: register, advance: advance, capacityOf: capacityOf, careGap: careGap, view: view,
    boundary: boundary, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults), enabled: settings().enabled }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/lifeline.js', { kind: 'engine', ver: '2.141.0' });
})();