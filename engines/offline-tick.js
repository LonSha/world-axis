/**
 * WorldAxis engines/offline-tick.js (v2.151.0 → v2.156.0) — 跨会话记忆锚（RX2）+ 摘要消费（S1）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓已有跨会话的**推进**能力（`region.tickOffline` 把远方按世界钟追平），
 *   但**没有一份「你不在的这段时间，世界变成了什么样」的交代**，也没有任何东西
 *   区分「这段时间里可以随便变」与「这段时间里绝不能动」。
 *   后果是一句话：**玩家上周玩到一半、这周回来，世界既不会告诉你它经历过什么，
 *   也没人拦着离线推演把玩家的关键进展推成另一个样子。**
 *   前者的失败模式是「叙事断层」（回来时世界凭空多了几件事，读者看不懂）；
 *   后者的失败模式更贵——**离线推进把玩家完成过的任务、结下的同盟、定过的仇推没了**，
 *   而这两件事在读数上与「正常推进」长得一模一样。
 *
 * ── 本模块落点（两件东西，一件都不多）────────────────────────
 *   · anchor(path, note)   — 登记一条**记忆锚**：世界里的关键进展（已完成的任务 /
 *       已建立的同盟 / 已结下的仇）。锚**不是锁**：它不冻结任何数值，只声明
 *       「这条线是玩家推出来的，离线推演只许接着它走、不许覆盖它」。
 *   · tick(cfg)            — 按**世界钟**离线时长结一轮，做三件事：
 *       ① 决定轮数（时长 / 一步一刀，且有上限——长离线不许天翻地覆）；
 *       ② **保护**：把在锚上的行逐条扫一遍，凡与锚相抵的改动一律**改成不落地**
 *          并计入 `protectedRows`（跳过而不是回滚，回滚会把好改动也一起撤掉）；
 *       ③ 产出「你不在时发生的事」摘要（`summary()` 只读取用）。
 *
 * ── 与既有模块的分工（关键：不重叠、不替代）──────────────────
 *   · `region.tickOffline` —— 远方**事件**的追平（谁在什么时候发生了什么）；
 *   · `life.tick` / `world.tick` / `evolution.tick` —— 本地**每轮**推进；
 *   · 本模块 —— **跨会话这一次**的批次账与记忆锚（离线这段世界变了什么、
 *     哪些不许变）。三者都在「推进」这个词上，但只有本模块回答「你不在时」。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**关闭**。关闭时 tick / anchor 一律拒收（`disabled`），
 *      `summaryText()` 返回空串 —— 默认不替任何人改动世界（本仓对「默认开」的口径：
 *      只有纯只读模块才允许默认开；本模块**写**）。
 *   2 **不自己推世界**。轮数、事件、势力消长一律由既有引擎负责（本模块把它们
 *      当作**同事务内**的既有调用方已有的结果处理）；本模块在这里给出的东西
 *      只有两样：轮数决定 + 锚保护。把「推演」也搬进来等于同一件事两个实现。
 *   3 **锚只保护，不锁死**。锚上的行仍然可以被显式写口改（`userlock` 才是锁）；
 *      本模块只对「离线这一批」负责：离线期间不许覆盖。
 *   4 **不改写、只裁决**。与 `canon` 同口径：不生成、不润色、不替世界编内容。
 *   5 **有界**：三条账（锚 / 批次 / 跳过）全部登记容量并走 `WA.evict` 单一出口。
 *   6 **没有基准点不假装**：首次调用只落基准、不结算。
 *      「我不知道你走了多久」与「你走了零秒」是两件事（同 region 的 X3 纪律）。
 *   7 **离线时长可配、轮数有闸**：`stepMs` 与 `maxRounds` 都是显式旋钮；
 *      长时间离线（如一个月）也不会被换算成上千轮。
 */

(function () {
  'use strict';
  // v2.151.0：别名形态用本仓规范式（module-cycle-gate 只认这一种形态）。
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_offline_tick_settings_v1';
  const DEF = {
    enabled: false,
    stepMs: 3600000,      // 离线一步 = 一小时（轮数 = 时长 / 这一步）
    maxRounds: 12,        // 一次跨会话最多结算几轮（防长时间离线后世界天翻地覆）
    minGapMs: 60000,      // 低于这一步长的间隔不算「离开」（刷新页面不是离线）
    maxAnchors: 24,       // 锚上限
    capBatches: 12,       // 批次账环（最近 12 次跨会话）
    capSkips: 48,         // 跳过明细环
    maxItems: 5           // 摘要最多念几条
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'offlineTick',
    bounds: { stepMs: [60000, 86400000], maxRounds: [1, 72], minGapMs: [1000, 3600000],
      maxAnchors: [4, 96], capBatches: [4, 48], capSkips: [8, 192], maxItems: [1, 12] } };

  const stat = { ticks: 0, firsts: 0, anchored: 0, released: 0, protectedRows: 0,
    // v2.156.0（S1）：两个新留痕位。`advances` 答「活动推进把基准前移过几次」
    //   （它不产批次，故不能用 ticks 代替）；`consumed` 答「有几批摘要真的进了正文」
    //   （不消费与没批次是两件事——前者有批可念却没被生成成功消费）。
    advances: 0, consumed: 0,
    rounds: 0, lastReason: '', faults: {}, byKind: {} };

  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80); }
  function num(v) {
    // v2.151.0 实测自纠：`null` 必须返 null。Number(null) === 0，而 0 是一个合法时刻（Unix 纪元）——
    //   把它当真值会让「没有基准点」这条边界映射成「你走了一百万小时」
    //   （首调直接算出一次天翻地覆的离线），而这个错误在读数上与正常推进长得一样。
    //   空串 / 非数字字符串同理：不是时刻就不是时刻。
    const n = (v === null || v === undefined || v === '') ? NaN : Number(v);
    return isFinite(n) ? n : null;
  }
  function clockNow(site) { try { return WA.clock.now(site || 'offlineTick'); } catch (e) { return Date.now(); } }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  /**
   * v2.151.0：设置**写口**。与 settings() 是一对（面板的开关与两个数字框都要落盘）。
   *   形态与 sediment / perspective-lock 同规格：normalize（表外值一律夹回 bounds）
   *   → saveOrThrow（落盘失败如实返回，不假装成功）。
   */
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /**
   * 状态桶。**在事务内**前置自愈（与 userlock / sediment 同规格）：
   *   三个容器都登记了容量，故必须在骨架里物化 —— 登记了却不在骨架里，
   *   registryParity 会报「未在骨架物化」，冷启动直写也会炸事务。
   */
  function bucket(draft) {
    if (!draft.offlineTick || typeof draft.offlineTick !== 'object' || Array.isArray(draft.offlineTick)) {
      draft.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 };
    }
    const b = draft.offlineTick;
    if (!Array.isArray(b.anchors)) b.anchors = [];
    if (!Array.isArray(b.batches)) b.batches = [];
    if (!Array.isArray(b.skips)) b.skips = [];
    if (b.lastSettledAt === undefined) b.lastSettledAt = null;
    return b;
  }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function anchors() {
    const b = state().offlineTick;
    return (b && Array.isArray(b.anchors)) ? b.anchors : [];
  }

  /**
   * 登记一条记忆锚。
   *   `path` 是**世界状态里的字段路径**（如 `people.p1.life`、`worldFacts`）——
   *   不给就拒收，不猜（同 sediment 的「地点 id 一律显式」）。
   *   `kind` 是锚的**类别**：task / pact / feud。为什么必须成表：自造类别等于自造判定，
   *   下一手（摘要、面板、诊断）无法接手 —— 「随口写一个类型名」正是本模块要治的那种失真。
   */
  const KINDS = ['task', 'pact', 'feud'];
  const KIND_LABEL = { task: '已完成的任务', pact: '已结的同盟', feud: '已结下的仇' };
  function anchor(path, note) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const p = clean(path, 80);
    if (!p) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'path' }; }
    const o = (note && typeof note === 'object') ? note : {};
    const kind = clean(o.kind, 12) || 'task';
    if (KINDS.indexOf(kind) < 0) {
      noteFault('bad-value');
      return { ok: false, reason: 'bad-value', field: 'kind', allowed: KINDS.slice() };
    }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const cfg = settings();
    const now = clockNow('offlineTick');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const prev = b.anchors.filter(function (a) { return a && a.path === p; })[0] || null;
      if (prev) {
        // 已锚过的路径：只刷新文本与时间（幂等），**不重复入账**。
        prev.note = clean(o.text, 60) || prev.note; prev.kind = kind; prev.updatedAt = now;
        out = { ok: true, path: p, kind: kind, created: false };
        return true;
      }
      if (b.anchors.length >= cfg.maxAnchors) { out = { ok: false, reason: 'anchors-full', cap: cfg.maxAnchors }; return false; }
      b.anchors.push({ path: p, kind: kind, note: clean(o.text, 60), at: now, updatedAt: now, released: false });
      WA.evict.array(b.anchors, 'offlineTick.anchors', cfg.maxAnchors);
      out = { ok: true, path: p, kind: kind, created: true };
    }, 'offlineTick:anchor');
    if (out && out.ok) {
      stat.anchored++;
      stat.byKind[kind] = (stat.byKind[kind] || 0) + 1;
      stat.lastReason = out.created ? 'anchored' : 'refreshed';
    } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 释放一条锚（世界真的变了：任务被推翻、同盟破裂）。**破坏性**，故必须显式。 */
  function release(path) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const p = clean(path, 80);
    if (!p) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'path' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const now = clockNow('offlineTick');
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const idx = b.anchors.map(function (a) { return a && a.path; }).indexOf(p);
      if (idx < 0) { out = { ok: false, reason: 'unknown-anchor', path: p }; return false; }
      const row = b.anchors[idx];
      row.released = true; row.releasedAt = now; row.updatedAt = now;
      stat.released++;
      out = { ok: true, path: p, releasedAt: now };
    }, 'offlineTick:release');
    if (out && out.ok) stat.lastReason = 'released';
    else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 锚面：当前**在场**（未释放）的锚，按路径索引。
   *   为什么单独一口：tick 的跳过判定与面板的锚清单都读它 ——
   *   两处各自过滤一遍，就是两份「什么算在场」的口径（迟早漂移）。
   */
  function anchorPaths() {
    return anchors().filter(function (a) { return a && a.path && !a.released; })
      .map(function (a) { return a.path; });
  }

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function pathParts(path) {
    const parts = path.split('.');
    return parts.every(function (p) {
      return p && p !== '__proto__' && p !== 'prototype' && p !== 'constructor';
    }) ? parts : null;
  }
  function atPath(root, parts) {
    let value = root;
    for (let i = 0; i < parts.length; i++) {
      if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, parts[i])) {
        return { exists: false };
      }
      value = value[parts[i]];
    }
    return { exists: true, value: value };
  }
  // Restore only the protected subtree in the candidate, never the live draft.
  function protect(candidate, before, parts) {
    const old = atPath(before, parts), next = atPath(candidate, parts);
    if (old.exists === next.exists && JSON.stringify(old.value) === JSON.stringify(next.value)) return false;
    let parent = candidate, base = before;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      base = base && typeof base === 'object' ? base[key] : undefined;
      if (!parent[key] || typeof parent[key] !== 'object') {
        if (!old.exists) return true;
        parent[key] = Array.isArray(base) ? [] : {};
      }
      parent = parent[key];
    }
    const key = parts[parts.length - 1];
    if (old.exists) parent[key] = copy(old.value);
    else delete parent[key];
    return true;
  }

  /**
   * 离线结算。**必须在事务里调用**（与 `region.tickOffline` / `regional.applyIncident` 同规格）——
   *   本函数改的是 `draft.offlineTick`，自己不开事务，避免嵌套事务与半提交。
   *
   *   参数 `apply` 是**注入点**（可选）：形如 `function (draft, round)`，
   *   由调用方把「推一轮」交给既有引擎。本模块**不自己推世界**（边界 2）：
   *   它只决定轮数与锚保护。`apply` 缺席时本模块只落账（实际轮数为零，基准保留），
   *   如实报 `no-apply` —— 「没推」与「推了但没事发生」必须可分。
   *
   * @param {object} draft 事务草稿
   * @param {{now?:number, apply?:function, rounds?:number}} [opts]
   */
  function tick(draft, opts) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    if (!draft || typeof draft !== 'object') { noteFault('no-draft'); return { ok: false, reason: 'no-draft' }; }
    const cfg = settings();
    const now = num(o.now) === null ? clockNow('offlineTick') : num(o.now);
    const b = bucket(draft);
    const last = num(b.lastSettledAt);
    // ⑥ 没有基准点：只落基准，不结算（「不知道你走了多久」≠「你走了零秒」）。
    if (last === null) {
      b.lastSettledAt = now;
      stat.firsts++;
      stat.lastReason = 'first';
      return { ok: true, first: true, from: now, to: now, elapsedMs: 0, rounds: 0,
        protectedRows: 0, skipped: [], applied: false };
    }
    const elapsed = now - last;
    if (elapsed <= 0) {
      return { ok: true, first: false, from: last, to: now, elapsedMs: elapsed, rounds: 0,
        protectedRows: 0, skipped: [], applied: false, reason: 'no-elapsed' };
    }
    // 低于 minGapMs 的间隔不算「离开」（刷新页面 / 连续两条消息）。
    if (elapsed < cfg.minGapMs) {
      b.lastSettledAt = now;
      stat.lastReason = 'too-short';
      return { ok: true, first: false, from: last, to: now, elapsedMs: elapsed, rounds: 0,
        protectedRows: 0, skipped: [], applied: false, reason: 'too-short' };
    }
    const want = Math.floor(elapsed / cfg.stepMs);
    const rounds = Math.max(0, Math.min(cfg.maxRounds, want));
    const capped = want > cfg.maxRounds;
    const apply = (typeof o.apply === 'function') ? o.apply : null;
    // ② 锚保护：在**推演之前**取一份在场锚的快照。快照而非实时读 —— `apply` 可能改
    //    世界状态（含锚本身），实时读会让「这一批该保护谁」在推演中途变心。
    const guard = b.anchors.filter(function (a) { return a && a.path && !a.released; })
      .map(function (a) { return { path: a.path, parts: pathParts(a.path) }; });
    if (guard.some(function (a) { return !a.parts; })) {
      noteFault('bad-path'); return { ok: false, reason: 'bad-path', applied: false, rounds: 0 };
    }
    const skipped = [];
    let applied = false;
    if (apply) {
      // The entire batch is speculative until every round succeeds.
      const candidate = copy(draft);
      for (let i = 0; i < rounds; i++) {
        const before = copy(candidate);
        let r;
        try { r = apply(candidate, i); } catch (e) {
          noteFault('apply-throw');
          return { ok: false, reason: 'apply-throw', applied: false, rounds: 0, attemptedRounds: i + 1,
            from: last, to: now, elapsedMs: elapsed, protectedRows: 0, skipped: [] };
        }
        if (r && typeof r.then === 'function') {
          noteFault('bad-value'); return { ok: false, reason: 'bad-value', applied: false, rounds: 0 };
        }
        if (r && r.ok === false) {
          noteFault(r.reason || 'apply-failed');
          return { ok: false, reason: r.reason || 'apply-failed', applied: false, rounds: 0,
            attemptedRounds: i + 1, from: last, to: now, elapsedMs: elapsed, protectedRows: 0, skipped: [] };
        }
        const touched = (r && Array.isArray(r.touched)) ? r.touched : [];
        guard.forEach(function (a) {
          const changed = protect(candidate, before, a.parts);
          const reported = touched.some(function (p) {
            const path = clean(p, 80);
            return path === a.path || path.indexOf(a.path + '.') === 0 || a.path.indexOf(path + '.') === 0;
          });
          if (changed || reported) skipped.push({ round: i, path: a.path, at: now });
        });
        // apply cannot release anchors or rewrite the settlement ledger.
        candidate.offlineTick = copy(draft.offlineTick);
      }
      Object.keys(draft).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(candidate, k)) delete draft[k]; });
      const committed = copy(candidate);
      Object.keys(committed).forEach(function (k) { if (k !== 'offlineTick') draft[k] = committed[k]; });
      applied = rounds > 0;
    } else {
      noteFault('no-apply');
    }
    if (skipped.length) {
      b.skips = b.skips.concat(skipped);
      WA.evict.array(b.skips, 'offlineTick.skips', cfg.capSkips);
    }
    stat.protectedRows += skipped.length;
    const settledRounds = applied ? rounds : 0;
    stat.rounds += settledRounds;
    if (apply && rounds > 0) b.lastSettledAt = now;
    b.rounds = (b.rounds || 0) + settledRounds;
    b.batches = Array.isArray(b.batches) ? b.batches : [];
    b.batches.push({ from: last, to: now, elapsedMs: elapsed, rounds: settledRounds, requestedRounds: rounds, capped: capped,
      protectedRows: skipped.length, applied: applied, at: now,
      // v2.156.0（S1）：消费留痕。`null` = 这一批的摘要**还没进过正文** ——
      //   与「已消费」必须可分：未消费的批次会被再次注入，玩家会反复读到同一段「你不在时」。
      consumedAt: null });
    WA.evict.array(b.batches, 'offlineTick.batches', cfg.capBatches);
    stat.ticks++;
    stat.lastReason = applied ? 'settled' : 'no-apply';
    return { ok: true, first: false, from: last, to: now, elapsedMs: elapsed, rounds: settledRounds, requestedRounds: rounds,
      capped: capped, protectedRows: skipped.length, skipped: skipped, applied: applied,
      reason: applied ? undefined : 'no-apply' };
  }


  /**
   * v2.156.0（S1）：把「最近一批摘要**已被消费**」这件事落到账上。
   *   为什么必须有一个独立的口，而不是让 buildBlock 自己记：
   *     ① 注入块是否真的进了正文，只有**注入链**知道（本模块在生成块时无从判断
   *        「这一轮会不会真的把它递进 prompt」）；
   *     ② 消费与未消费的失效模式不同 —— 未消费的批次会**一直重复注入**同一段摘要
   *        （玩家每轮都看见「你不在时……」，而它早就发生过一次了）。
   *   口径：只压**最新一批**（`consumedAt` 落在最后一批上）；无批次如实报 `no-batch`；
   *   同一批重复消费是幂等的（报 `already`）——重试不该把它记成两次消费。
   */
  function markConsumed(opts) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!WA.store || !WA.store.transact) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const o = opts || {};
    const now = num(o.now) === null ? clockNow('offlineTick') : num(o.now);
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const list = Array.isArray(b.batches) ? b.batches : [];
      if (!list.length) { out = { ok: false, reason: 'no-batch' }; return false; }
      const last = list[list.length - 1];
      // v2.156.0（自纠）：不可用 `isFinite(num(x))` —— Number(null)===0 使它对 null 恒真，
      //   于是「未消费」会被读成「已消费」，整条消费面反向。判 null 须显式比较（见本文件 num() 注释）。
      if (num(last.consumedAt) !== null) { out = { ok: true, already: true, at: num(last.consumedAt) }; return false; }
      last.consumedAt = now;
      out = { ok: true, already: false, at: now };
    }, 'offlineTick:consume');
    if (out && out.ok) {
      if (!out.already) stat.consumed++;
      stat.lastReason = out.already ? 'already-consumed' : 'consumed';
    } else if (out && !out.ok) noteFault(out.reason);
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 「你不在时发生的事」摘要 —— **只读**。
   *   为什么单独一口而不是让面板自己拼：面板拼 = 摘要口径出现第二份，
   *   而这份文本正是要注入正文的那一段（第二份 = 注入面与呈现面会漂移）。
   *   最近一次批次为准；没有批次时如实报 `no-batch`，不编一段「什么都没发生」。
   */
  function summary() {
    const b = state().offlineTick || {};
    const list = Array.isArray(b.batches) ? b.batches : [];
    if (!list.length) return { ok: false, reason: 'no-batch', lines: [], rows: [] };
    const cfg = settings();
    const last = list[list.length - 1];
    const rows = last.protectedRows > 0 ? (Array.isArray(b.skips) ? b.skips : [])
      .filter(function (s) { return s && s.at === last.at; }).slice(-last.protectedRows).slice(0, cfg.maxItems) : [];
    const lines = [];
    lines.push(describeElapsed(last.elapsedMs) + '，世界推进了 ' + last.rounds + ' 轮'
      + (last.capped ? '（已按上限截断）' : '') + '。');
    if (rows.length) {
      lines.push('其中 ' + rows.length + ' 处改动因落在你的记忆锚上而被跳过：'
        + rows.map(function (r) { return r.path; }).join('、') + '。');
    }
    if (!last.applied) lines.push('本次未接入推演（只落了批次账）。');
    return { ok: true, from: last.from, to: last.to, elapsedMs: last.elapsedMs,
      rounds: last.rounds, capped: !!last.capped, protectedRows: last.protectedRows,
      // v2.156.0（S1）：这一批的摘要是否已经进过正文。
      consumed: num(last.consumedAt) !== null, consumedAt: num(last.consumedAt),
      lines: lines, rows: rows };
  }
  function describeElapsed(ms) {
    const h = Math.floor(ms / 3600000);
    if (h < 1) return '你离开了不到一小时';
    if (h < 24) return '你离开了 ' + h + ' 小时';
    return '你离开了 ' + Math.floor(h / 24) + ' 天';
  }
  /**
   * 注入块。**关闭时返回空串**（与 sediment 同口径：不给老用户凭空多出约束）。
   *   只在确实有批次时才有内容 —— 「这一轮没有跨会话」不该被写成一段空壳。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    // v2.156.0（S1）：**已被消费的批次不再重复注入**。
    //   未消费的批次会每轮都被重新递进正文，而它讲的是同一段已经发生过的离线——
    //   重复注入不是「提醒」，是把一段旧摘要当成此刻正在发生的事。
    const lb = (state().offlineTick || {}).batches;
    if (Array.isArray(lb) && lb.length && num(lb[lb.length - 1].consumedAt) !== null) return '';
    const s = summary();
    if (!s.ok || !s.lines.length) return '';
    stat.blocks = (stat.blocks || 0) + 1;
    return '[你不在时]' + String.fromCharCode(10)
      + s.lines.map(function (l) { return '- ' + l; }).join(String.fromCharCode(10))
      + String.fromCharCode(10) + '这段时间里发生的事由世界自行推进，不是玩家亲眼所见。';
  }

  function statOf() {
    const b = state().offlineTick || {};
    const cfg = settings();
    return Object.assign({}, stat, {
      faults: Object.assign({}, stat.faults),
      byKind: Object.assign({}, stat.byKind),
      enabled: !!cfg.enabled,
      anchors: anchors().filter(function (a) { return a && !a.released; }).length,
      released: anchors().filter(function (a) { return a && a.released; }).length,
      batches: Array.isArray(b.batches) ? b.batches.length : 0,
      // v2.156.0（S1）：未消费批次数 —— 「有批可念却没进正文」是可由本读数独立抓到的现场
      //   （消费面断裂时它恒 > 0，而 batches 与 rounds 都是正常的）。
      pending: (Array.isArray(b.batches) ? b.batches : []).filter(function (x) { return x && num(x.consumedAt) === null; }).length,
      skips: Array.isArray(b.skips) ? b.skips.length : 0,
      rounds: b.rounds || 0,
      caps: { anchors: cfg.maxAnchors, batches: cfg.capBatches, skips: cfg.capSkips }
    });
  }

  WA.offlineTick = {
    KINDS: KINDS.slice(),
    KIND_LABEL: Object.assign({}, KIND_LABEL),
    getSettings: settings,
    setSettings: saveSettings,
    anchor: anchor,
    release: release,
    anchorPaths: anchorPaths,
    tick: tick,
    summary: summary,
    buildBlock: buildBlock,
    // v2.156.0（S1）：摘要消费口（注入链在真的把块递进正文后调用）。
    markConsumed: markConsumed,
    stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/offline-tick.js', { kind: 'engine', ver: '2.156.0' });
})();
