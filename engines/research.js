/**
 * WorldAxis engines/research.js (v2.231.0) — EXP-8：研究、发明与知识传播
 *
 * ── 它治什么（缺口，开工前逐条复核现场）────────────────────────────────
 *   计划原文：「**研究目标、资料/设备前置、实验阶段、材料与时间投入、可复现结果、
 *   失败线索**；成果解锁配方、工具或方法，公开/保密/转让改变传播范围。」
 *   验收原文：「完成实验得到新材料配方，**实际制造入口增加该配方**；另一组织在
 *   **取得资料前不可使用**；一次失败**消耗已使用材料但留下**可用于下一次的研究信息。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/economy.js` 的 `recipeOf` / `recipeKeys` 是**配方定义真源** ——
 *       答得出「这个配方存不存在」，答不出「这个配方是不是被研究出来了、谁有权用」；
 *     · `engines/operations.js` 管**项目预算**（批准 → 立项 → 拨付 → 结算）——
 *       是**资源层**，不记「这个项目在研究什么、实验走到哪一步、成功没有」；
 *     · `engines/intel.js` 管**事件与情报传播**（addIntel / visibleTo / entitledTo）——
 *       是**认知层**，不记「谁发明了什么、谁有权制造」；
 *     · `engines/production.js` 管**生产工单**（设施 / 工期 / 班次 / 交货）——
 *       是**经营层**，它读 `economy.recipeOf` 确认配方存在，**不查这个配方是不是被研究出来的**。
 *   四者合起来仍缺的那一格：**世界有配方定义，但没有「研究出来」这件事**。
 *   本模块补的就是这一层。
 *
 * ── 机制（七句话）──────────────────────────────────────────────────
 *   ① **研究跨阶段**（`store.research.projects`）：`open()` 立项，带假设、研究者、
 *      前置资料、实验阶段数与目标成果（配方名 / 工具名 / 方法名）。
 *   ② **阶段封闭集**（`STATUSES`）：`hypothesis`（已立项）→ `experimenting`
 *      （实验中，已投入材料并推进）→ `confirmed`（实验成功，成果已解锁）/
 *      `failed`（实验失败，材料已消耗但留线索）/ `abandoned`（放弃，不产成果）。
 *      顺序不对 ⇒ `bad-phase`。
 *   ③ **材料是真扣**：`supply()` 从研究者的资源面扣进本项目的 `reserve` 池
 *      （与 production.js 的 resupply 同口径），手里不够 ⇒ `short-input`。
 *   ④ **每阶段消耗当天那份**：`advance()` 逐阶段先看 `reserve` 够不够这阶段的用量，
 *      不够 ⇒ 保持原状态且不推进；够则扣料并推进 `phase`。
 *      到最后一阶段 ⇒ 看前置条件是否满足（资料齐备、设备到位），满足 ⇒ `confirmed`，
 *      不满足 ⇒ `failed`（**材料已消耗但留下线索** —— `clues` 数组记下失败原因与已验证的方向）。
 *   ⑤ **成果解锁**：`confirmed` 的项目把 `result`（配方名 / 工具名 / 方法名）写入
 *      `store.research.discoveries` —— **配方定义真源仍在 economy**（本模块只记
 *      「这个配方被研究出来了没有、谁有权用」），**不建第二份配方真源**。
 *      制造入口（production / economy.craft）调用 `canUse(who, recipeName)` 检查权限。
 *   ⑥ **传播三态**（`SCOPE` 封闭集）：`public`（公开，人人可用）/ `secret`
 *      （保密，仅研究者及其组织可用）/ `transferred`（转让，仅指定接收方可用）。
 *      `disseminate()` 改变传播范围 ⇒ `canUse()` 的返回值随之改变（验收原文「另一组织
 *      在取得资料前不可使用」）。
 *   ⑦ **失败留下线索**：`failed` 的项目在 `clues` 数组里记下**已验证的方向**与
 *      **待验证的假设**。下一次 `open()` 可以传 `fromClues: failedProjectId`，
 *      新项目**继承线索**（不继承进度、不退料）—— 验收原文「留下可用于下一次的研究信息」。
 *
 * ── 十二条否定式边界（每条都有判据咬）────────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`。
 *   ② **不建第二份配方真源**：`result` 是配方名时，必须在 `economy.recipeOf` 里
 *      查到（`unknown-recipe`）—— 本模块只记「被研究出来了没有」，不自己造配方定义。
 *   ③ **不建第二份名册**：研究者 / 资料提供者 / 转让接收方必须是世界里的人物
 *      （`unknown-researcher`）。
 *   ④ **状态是封闭集**：自造一个状态 ⇒ `bad-status`（`bad-phase` 在状态机转换时咬）。
 *   ⑤ **材料是真扣**（`short-input`）：与 production 的 resupply 同口径，不赊账。
 *   ⑥ **阶段不跳**：`advance()` 从 `hypothesis` → `experimenting` → 终态，
 *      每次推进一步，不能从 `hypothesis` 直接跳到 `confirmed`（`bad-phase`）。
 *   ⑦ **失败必留线索**：`failed` 的项目 `clues` 数组**至少一条**（`no-clue`）——
 *      验收原文点名「留下可用于下一次的研究信息」。
 *   ⑧ **线索不等于进度**：继承线索的新项目从 `hypothesis` 起步，不继承已完成阶段
 *      （`inherited-not-progress`）。
 *   ⑨ **未确认不可用**：`canUse()` 对非 `confirmed` 项目的成果一律返回 false
 *      （`not-discovered`）—— 验收原文「取得资料前不可使用」。
 *   ⑩ **传播范围控制使用权**：`secret` 的成果对非研究者/非同组织者返回 false
 *      （`not-entitled`）；`transferred` 的成果对非指定接收方返回 false。
 *   ⑪ **存档是唯一真源**（`store.research`）：`reload()` 从存档重建。
 *   ⑫ **放弃不产成果**：`abandon()` 把项目转 `abandoned`，**不解锁任何成果**
 *      （`already-confirmed` 防止对已确认项目放弃）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { WA.clock.now(site) };
  const LS_KEY = 'worldaxis_research_settings_v1';
  const DEF = { enabled: false, maxProjects: 24, maxPhases: 12, maxClues: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'research',
    bounds: { maxProjects: [4, 100], maxPhases: [2, 30], maxClues: [4, 64] } };
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
  // ── 状态封闭集（自造一个 ⇒ 拒收）──
  const STATUSES = ['hypothesis', 'experimenting', 'confirmed', 'failed', 'abandoned'];
  // 终态：一旦进入不可回退
  const TERMINAL = ['confirmed', 'failed', 'abandoned'];
  // 实验中态：可以推进
  const ACTIVE = ['hypothesis', 'experimenting'];
  // 传播范围封闭集
  const SCOPE = ['public', 'secret', 'transferred'];
  const stat = { opened: 0, supplied: 0, advanced: 0, confirmed: 0, failed: 0, abandoned: 0,
    disseminated: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function num(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const r = (root || state()).research;
    return (r && typeof r === 'object' && !Array.isArray(r)) ? r : null;
  }
  function ensure(draft) {
    if (!draft.research || typeof draft.research !== 'object' || Array.isArray(draft.research))
      draft.research = { projects: [], discoveries: [] };
    if (!Array.isArray(draft.research.projects)) draft.research.projects = [];
    if (!Array.isArray(draft.research.discoveries)) draft.research.discoveries = [];
    return draft.research;
  }
  /** 检查某人是否是世界里的人物 */
  function knownPerson(who) {
    const s = state();
    return !!(s.people && s.people['p_' + who]);
  }
  /** 组织成员真源是 evolution.factions[].roster，不是项目负责人列表。 */
  function sameOrg(a, b) {
    const factions = (state().evolution || {}).factions || [];
    return factions.some(function (f) {
      const roster = f && f.roster;
      return !!(roster && Object.prototype.hasOwnProperty.call(roster, a)
        && Object.prototype.hasOwnProperty.call(roster, b));
    });
  }
  /** 生成项目 ID */
  let __seq = 0;
  function nextId() {
    __seq++;
    return 'r_' + WA.clock.now('research').toString(36) + '_' + __seq;
  }

  /**
   * 立项：开一个研究项目。
   * @param {object} opts
   *   hypothesis: 研究假设（自由文本，必填）
   *   by: 研究者姓名（必填，须是已登记人物）
   *   result: 目标成果名（配方名/工具名/方法名，必填）
   *   resultKind: 'recipe' | 'tool' | 'method'（默认 'recipe'）
   *   phases: 实验阶段数（默认 3，最少 2）
   *   materials: 整个项目的材料总量 { name: amount }（可选，可后续 supply）
   *   prerequisites: 前置资料/设备（字符串数组，可选）
   *   fromClues: 失败项目 ID（继承线索，不继承进度）
   */
  function open(opts) {
    opts = opts || {};
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const hyp = clean(opts.hypothesis, 200);
    const by = clean(opts.by, 40);
    if (!hyp || !by) return refuse('missing-fields');
    if (!knownPerson(by)) return refuse('unknown-researcher', { who: by });
    const result = clean(opts.result, 60);
    if (!result) return refuse('missing-fields');
    const resultKind = (opts.resultKind === 'tool' || opts.resultKind === 'method') ? opts.resultKind : 'recipe';
    // 配方类成果必须在 economy 查到（不建第二份配方真源）
    if (resultKind === 'recipe') {
      let rec = null;
      try { rec = WA.economy.recipeOf(result); } catch (e) { rec = null; }
      if (!rec) return refuse('unknown-recipe', { recipe: result, known: (WA.economy && WA.economy.recipeKeys) ? WA.economy.recipeKeys() : [] });
    }
    const phases = Math.max(2, Math.min(Math.floor(num(opts.phases) || 3), cfg.maxPhases));
    const mats = {};
    if (opts.materials && typeof opts.materials === 'object') {
      Object.keys(opts.materials).forEach(function (k) {
        const v = num(opts.materials[k]);
        if (v && v > 0) mats[clean(k, 40)] = v;
      });
    }
    const prereq = (Array.isArray(opts.prerequisites) ? opts.prerequisites : []).map(function (p) { return clean(p, 80); }).filter(Boolean);
    // 继承线索（不继承进度）
    let clues = [];
    if (opts.fromClues) {
      const src = (bagOf(state()) || { projects: [] }).projects.filter(function (p) { return p.id === opts.fromClues; })[0];
      if (src && src.status === 'failed' && Array.isArray(src.clues) && src.clues.length) {
        clues = JSON.parse(JSON.stringify(src.clues)).map(function (c) { return Object.assign(c, { from: src.id }); }).slice(-cfg.maxClues);
      } else {
        return refuse('no-clues', { fromClues: opts.fromClues });
      }
    }
    const bag = bagOf(state());
    if (bag && bag.projects.length >= cfg.maxProjects) return refuse('too-many-projects', { cap: cfg.maxProjects });

    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const id = nextId();
      const proj = {
        id: id, hypothesis: hyp, by: by, result: result, resultKind: resultKind,
        status: 'hypothesis', phase: 0, phases: phases,
        materials: mats, reserve: {}, consumed: {}, prerequisites: prereq, evidence: [],
        clues: clues, scope: 'secret', transferredTo: null,
        createdAt: clockNow('research'), advancedAt: 0
      };
      b.projects.push(proj);
      if (WA.evict) WA.evict.array(b.projects, 'research.projects', cfg.maxProjects);
      out = { ok: true, id: id, status: 'hypothesis', inheritedClues: clues.length };
    }, 'research:open');
    if (out && out.ok) { stat.opened++; stat.lastReason = 'opened'; } else noteFault('store-unavailable');
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 供料：从研究者的资源面扣进项目 reserve 池。
   */
  function supply(projectId, who, material, amount) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pid = clean(projectId, 30);
    const w = clean(who, 40);
    const mat = clean(material, 40);
    const amt = num(amount);
    if (!pid || !w || !mat || !amt || amt <= 0) return refuse('missing-fields');
    if (!knownPerson(w)) return refuse('unknown-researcher', { who: w });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const proj = b.projects.filter(function (p) { return p.id === pid; })[0];
      if (!proj) { out = refuse('no-such-project', { id: pid }); return false; }
      if (TERMINAL.indexOf(proj.status) >= 0) { out = refuse('project-finished', { id: pid, status: proj.status }); return false; }
      // 扣料
      const s = draft;
      const person = s.people && s.people['p_' + w];
      if (!person) { out = refuse('unknown-researcher', { who: w }); return false; }
      if (!person.resources) person.resources = {};
      const have = num(person.resources[mat]) || 0;
      if (have < amt) { out = refuse('short-input', { who: w, material: mat, need: amt, have: have }); return false; }
      person.resources[mat] = have - amt;
      proj.reserve[mat] = (num(proj.reserve[mat]) || 0) + amt;
      out = { ok: true, id: pid, reserve: Object.assign({}, proj.reserve) };
    }, 'research:supply');
    if (out && out.ok) { stat.supplied++; stat.lastReason = 'supplied'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 推进实验：每个阶段消耗当天那份材料，推进 phase。
   *   到最后阶段：前置条件满足 ⇒ confirmed；不满足 ⇒ failed（留线索）。
   */
  function advance(projectId, opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pid = clean(projectId, 30);
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const proj = b.projects.filter(function (p) { return p.id === pid; })[0];
      if (!proj) { out = refuse('no-such-project', { id: pid }); return false; }
      if (TERMINAL.indexOf(proj.status) >= 0) { out = refuse('project-finished', { id: pid, status: proj.status }); return false; }
      // phase 是已经完成且扣料的阶段数；第一次推进也必须完成第一阶段。
      if (ACTIVE.indexOf(proj.status) >= 0) {
        const phase = proj.phase;
        // 每阶段消耗量 = 总量 / 阶段数（与 production 的 perDay 同口径）
        const need = {};
        let short = null;
        Object.keys(proj.materials).forEach(function (k) {
          const total = proj.materials[k];
          // 累计目标差额避免逐阶段舍入造成少耗；最后阶段精确结清剩余总量。
          const spent = num((proj.consumed || {})[k]) || 0;
          const target = phase + 1 >= proj.phases ? total : total * (phase + 1) / proj.phases;
          const per = Math.max(0, target - spent);
          const have = num(proj.reserve[k]) || 0;
          if (have < per) { short = { material: k, need: per, have: have }; }
          need[k] = per;
        });
        if (short) {
          // 缺料：项目保持 experimenting 但不推进（与 production 的 pauseOnShort 同口径，
          //   只是 research 没有单独的 paused 状态 —— 实验中就是实验中，缺料不推进而已）
          out = refuse('short-input', { id: pid, phase: phase, material: short.material, need: short.need, have: short.have });
          return false;
        }
        // 扣料
        if (!proj.consumed) proj.consumed = {};
        Object.keys(need).forEach(function (k) {
          proj.reserve[k] = (num(proj.reserve[k]) || 0) - need[k];
          proj.consumed[k] = (num(proj.consumed[k]) || 0) + need[k];
        });
        // 由玩家/题材适配层显式确认资料设备已到位，不把名称非空当作验证。
        const provided = (Array.isArray(o.evidence) ? o.evidence : []).map(function (x) { return clean(x, 80); });
        proj.evidence = (proj.evidence || []).concat(provided).filter(function (x, i, all) {
          return proj.prerequisites.indexOf(x) >= 0 && all.indexOf(x) === i;
        });
        proj.status = 'experimenting';
        // 推进阶段
        proj.phase = phase + 1;
        proj.advancedAt = clockNow('research');
        // 到最后阶段：判定成功/失败
        if (proj.phase >= proj.phases) {
          // 检查前置条件是否满足
          const prereqMet = (proj.prerequisites.length === 0) || proj.prerequisites.every(function (p) {
            return proj.evidence.indexOf(p) >= 0;
          });
          if (prereqMet) {
            proj.status = 'confirmed';
            // 解锁成果
            const disc = { result: proj.result, resultKind: proj.resultKind, projectId: proj.id, by: proj.by, scope: 'secret', transferredTo: null, at: clockNow('research') };
            b.discoveries.push(disc);
            out = { ok: true, id: pid, status: 'confirmed', phase: proj.phase, phases: proj.phases, discovered: proj.result, advanced: true };
          } else {
            proj.status = 'failed';
            // 留线索（至少一条）
            proj.clues.push({ kind: 'prerequisite-missing', detail: '前置条件未满足', missing: proj.prerequisites.filter(function (p) { return proj.evidence.indexOf(p) < 0; }), phase: proj.phase, at: clockNow('research') });
            proj.clues = proj.clues.slice(-cfg.maxClues);
            out = { ok: true, id: pid, status: 'failed', phase: proj.phase, phases: proj.phases, clues: proj.clues.length, advanced: true };
          }
        } else {
          out = { ok: true, id: pid, status: 'experimenting', phase: proj.phase, phases: proj.phases, advanced: true };
        }
        return true;
      }
      out = refuse('bad-phase', { id: pid, status: proj.status });
      return false;
    }, 'research:advance');
    if (out && out.ok) {
      stat.advanced++;
      if (out.status === 'confirmed') stat.confirmed++;
      if (out.status === 'failed') stat.failed++;
      stat.lastReason = out.status;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 放弃项目：转 abandoned，不解锁任何成果。
   */
  function abandon(projectId) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pid = clean(projectId, 30);
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const proj = b.projects.filter(function (p) { return p.id === pid; })[0];
      if (!proj) { out = refuse('no-such-project', { id: pid }); return false; }
      if (proj.status === 'confirmed') { out = refuse('already-confirmed', { id: pid }); return false; }
      if (proj.status === 'abandoned') { out = refuse('already-abandoned', { id: pid }); return false; }
      proj.status = 'abandoned';
      out = { ok: true, id: pid, status: 'abandoned' };
      return true;
    }, 'research:abandon');
    if (out && out.ok) { stat.abandoned++; stat.lastReason = 'abandoned'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 传播范围变更：public / secret / transferred。
   *   public: 人人可用
   *   secret: 仅研究者及其组织可用
   *   transferred: 仅指定接收方可用
   */
  function disseminate(projectId, scope, to) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const pid = clean(projectId, 30);
    const sc = clean(scope, 20);
    if (SCOPE.indexOf(sc) < 0) return refuse('bad-scope', { scope: sc, valid: SCOPE.slice() });
    const recipient = sc === 'transferred' ? clean(to, 40) : '';
    if (sc === 'transferred' && !recipient) return refuse('missing-recipient');
    if (recipient && !knownPerson(recipient)) return refuse('unknown-researcher', { who: recipient });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const proj = b.projects.filter(function (p) { return p.id === pid; })[0];
      if (!proj) { out = refuse('no-such-project', { id: pid }); return false; }
      if (proj.status !== 'confirmed') { out = refuse('not-confirmed', { id: pid, status: proj.status }); return false; }
      // 更新项目自身的传播范围
      proj.scope = sc;
      proj.transferredTo = recipient || null;
      // 同步更新 discoveries 表
      b.discoveries.forEach(function (d) {
        if (d.projectId === pid) { d.scope = sc; d.transferredTo = recipient || null; }
      });
      out = { ok: true, id: pid, scope: sc, transferredTo: recipient || null };
      return true;
    }, 'research:disseminate');
    if (out && out.ok) { stat.disseminated++; stat.lastReason = sc; }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 检查某人是否有权使用某个已解锁的成果。
   *   - 非 confirmed 的项目成果 ⇒ false (not-discovered)
   *   - public ⇒ true
   *   - secret ⇒ 仅研究者本人或同组织成员
   *   - transferred ⇒ 仅指定接收方
   */
  function canUse(who, resultName, opts) {
    const cfg = settings();
    // 制造口只约束已立项的研究配方；关闭机制、普通配方保持旧行为。
    const manufacture = !!(opts && opts.manufacture);
    if (!cfg.enabled) return manufacture ? { ok: true, scope: 'unrestricted' } : { ok: false, reason: 'disabled' };
    const w = clean(who, 40), r = clean(resultName, 60);
    if (!w || !r) return { ok: false, reason: 'missing-fields' };
    const bag = bagOf(state()) || { projects: [], discoveries: [] };
    const projects = (bag.projects || []).filter(function (p) { return p.result === r && (!manufacture || p.resultKind === 'recipe'); });
    if (manufacture && !projects.length) return { ok: true, scope: 'unrestricted' };
    let confirmed = false;
    const discs = (bag.discoveries || []).filter(function (d) { return d.result === r; });
    for (let i = 0; i < discs.length; i++) {
      const disc = discs[i];
      const proj = projects.filter(function (p) { return p.id === disc.projectId && p.status === 'confirmed'; })[0];
      if (!proj) continue;
      confirmed = true;
      if (disc.scope === 'public') return { ok: true, result: r, scope: 'public' };
      if (disc.scope === 'secret' && (proj.by === w || sameOrg(proj.by, w))) return { ok: true, result: r, scope: 'secret' };
      if (disc.scope === 'transferred' && disc.transferredTo === w) return { ok: true, result: r, scope: 'transferred' };
    }
    return { ok: false, reason: confirmed ? 'not-entitled' : 'not-discovered', result: r };
  }

  /** 列出所有项目（只读副本） */
  function list() {
    const cfg = settings();
    if (!cfg.enabled) return [];
    const bag = bagOf(state());
    if (!bag) return [];
    return (bag.projects || []).map(function (p) {
      return { id: p.id, hypothesis: p.hypothesis, by: p.by, result: p.result, resultKind: p.resultKind,
        status: p.status, phase: p.phase, phases: p.phases, scope: p.scope, clues: (p.clues || []).length };
    });
  }

  /** 查看单个项目（只读副本） */
  function view(projectId) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const pid = clean(projectId, 30);
    const bag = bagOf(state());
    if (!bag) return { ok: false, reason: 'no-such-project' };
    const proj = (bag.projects || []).filter(function (p) { return p.id === pid; })[0];
    if (!proj) return { ok: false, reason: 'no-such-project', id: pid };
    return { ok: true, id: proj.id, hypothesis: proj.hypothesis, by: proj.by, result: proj.result,
      resultKind: proj.resultKind, status: proj.status, phase: proj.phase, phases: proj.phases,
      materials: Object.assign({}, proj.materials), reserve: Object.assign({}, proj.reserve || {}), consumed: Object.assign({}, proj.consumed || {}), evidence: (proj.evidence || []).slice(),
      prerequisites: (proj.prerequisites || []).slice(), clues: JSON.parse(JSON.stringify(proj.clues || [])),
      scope: proj.scope, transferredTo: proj.transferredTo, createdAt: proj.createdAt, advancedAt: proj.advancedAt };
  }

  /** 从存档重建（切聊天必须重建） */
  function reload() {
    __seq = 0;
    const bag = bagOf(state());
    if (bag && Array.isArray(bag.projects)) {
      bag.projects.forEach(function (p) {
        const m = /_(\d+)$/.exec(p.id || '');
        if (m) { const n = parseInt(m[1], 10); if (n > __seq) __seq = n; }
      });
    }
    return { ok: true, projects: (bag ? bag.projects.length : 0), discoveries: (bag ? (bag.discoveries || []).length : 0) };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const bag = bagOf(state());
    if (!bag) return '';
    const projs = (bag.projects || []).slice(-Math.max(1, cfg.maxProjects));
    if (!projs.length) return '';
    const lines = projs.map(function (p) {
      return p.id + '：' + p.hypothesis.slice(0, 30) + '（' + p.status + '，' + p.phase + '/' + p.phases + '）→ ' + p.result;
    });
    return '[研究]\n' + lines.join('\n') + '\\n成果需经实验确认方可使用；传播范围控制使用权。\n';
  }

  WA.research = {
    STATUSES: STATUSES.slice(), SCOPE: SCOPE.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, supply: supply, advance: advance, abandon: abandon,
    disseminate: disseminate, canUse: canUse,
    list: list, view: view, reload: reload, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); },
    resetStat: function () { for (var k in stat) { if (Array.isArray(stat[k])) continue; stat[k] = (typeof stat[k] === 'number') ? 0 : ''; } stat.faults = {}; }
  };
  var EXPORT_COUNT = 16;
  var _exported = Object.keys(WA.research).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('research: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/research.js', { kind: 'engine', ver: '2.231.0' });
})();