/**
 * WorldAxis core/commit.js (v2.160.0) — 跨引擎提交契约（TP4）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   TP4 原文：「新外交、运输、履约和地点效果将同时触及多引擎，**局部幂等不能直接推出
 *   整条链幂等**」；要求定义「一次世界操作的来源楼层/滑动、聊天生命周期、读集版本、
 *   opId、候选结果、提交回执及提交后副作用」，并明确三条：
 *     · 「跨模块共用候选与执行上下文」；
 *     · 「**不可同草稿执行的公开写口不得嵌套调用**」；
 *     · 「提交后通知失败可单独重试，不能重做已提交的资源和关系变化」。
 *
 *   现场已有的幂等面**全是局部**：act 的 `acts.res` 回执、events 的 `events.res` 台账、
 *   coop 的 opId 重发键、collab 的离线队列入队键、liaison 的 traceOf —— 每一处都只答
 *   「我这一个模块的这一笔做过没有」。它们各答各的，于是**一条跨引擎的链**（第一步落资源、
 *   第二步落关系、第三步发通知）没有任何地方回答「整条链做过没有」。缺的正是这一层。
 *
 * ── 三条纪律（决定本模块的全部签名）───────────────────────────
 *   ① **回执与世界写入同一事务**。为什么不能先写世界再补记回执：中途崩溃就得到
 *      「资源变了但没人知道这条链提交过」，下一次重放会**再变一次**——而这正是本仓
 *      反复治理的「半写」。故回执写在 mutator 内部（与调用方的写入同一个 draft）。
 *   ② **不可同草稿执行的写口一律走 defer**。本仓已有实证：`actors/registry.js` 的三个
 *      写口（setProfileSafe / setPersonaDice / setRelations）**内部自带事务**，
 *      在 `store.transact` 的 mutator 里调它们会把内层 mutator 直接跑在最外层 draft 上
 *      （`store.transact` 的嵌套分支返回 `deferred:true`，内层的 push/pop 与外层错位），
 *      而 `backstage.js` 的注释已把这件事写成纪律（「registry 自带事务，不可嵌套」，
 *      故它用 `__personaWrites` 缓冲、事务提交后才落库）。本模块把那个**手工缓冲**收成
 *      通用面：`defer(chain, kind, fn)` 登记，`flush(chain)` 在事务提交后统一执行。
 *      写失败**只降级为台账，不回滚已提交的世界事实**（与 backstage 同口径：
 *      已结算的世界状态不因通知通道失败而回滚）。
 *   ③ **副作用可单独重试，世界写入不重做**。`retryEffects(chain)` 只跑未完成的 defer 项；
 *      它**一次都不碰 store 的世界键**——「重试通知」与「重放世界变化」是两件事，
 *      合并会让一次通知抖动把资源和关系再变一遍。
 *
 * ── 幂等键（跨引擎链的「这一笔做过没有」）─────────────────────
 *   `opKey(opt)`：
 *     · 调用方显式给 `opId` ⇒ 用它（**跨刷新稳定**，是「刷新后重复执行」的正解）；
 *     · 否则用 `store.floorSig()` —— 形如 `{floor}_s{swipe}:{len}:{hash}`。
 *       为什么拿它当默认键：它问的正是「**这一楼还是当初那一楼吗**」（与 core/settle-guard.js
 *       的结算签名同构）。于是「重放同楼层」命中同一键、「换滑动」得不同键（swipe 在里面）、
 *       「刷新后同楼层同内容」仍命中同一键——三条验收一次对齐。
 *       注意**不把 epoch / rev 放进默认键**：两者都会在刷新后推进，放进去等于让
 *       「刷新后重复执行」永远不命中（幂等失效），而那恰是要治的场景之一。
 *       它们仍进**回执记录**（诊断要答「这笔是哪一纪元的哪一版做的」）。
 *     · 无聊天（`no-chat`）时默认键退化成同一个字符串 —— 此时**调用方必须显式给 opId**
 *       （没有楼层就没有「这一楼」可言，凭它去重会把不同操作认成同一笔）。
 *
 * ── 边界（不做什么）────────────────────────────────────────────
 *   · 不默认撤销已确立的世界事实：本模块只答「提交过没有 / 副作用落没落」，
 *     撤销仍走既有 `core/undo.js` 的协议（「只在已有撤销协议可证明的范围内处理」）。
 *   · 不接管任何引擎的写入：`commit(chain, fn)` 里的 fn 由调用方给（本模块不猜要写什么）。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // v2.15.0 口径：决策时间走 clockNow、测量时间走 clockWall（与仓内逐字同形，过「裸调归零」判据）
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function (site) { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const LIMITS = { OPID: 80, SITE: 40, KIND: 24, RECEIPTS: 64, DEFERRED: 32, REASON: 48 };

  const __stat = {
    begun: 0, committed: 0, reused: 0, aborted: 0, failed: 0, saveFailed: 0,
    deferred: 0, deferOk: 0, deferRej: 0, effectsRetried: 0, effectsFailed: 0,
    lastReason: '', lastAt: 0, lastOpId: null, faults: {}
  };
  // 在册链（**进程态**）：opId -> chain。跨刷新的幂等靠**落盘回执**（store.commit.receipts），
  //   不靠这张表 —— 它是「本进程里还有谁没提交完」的在途视图，不是真源。
  const __live = {};

  function noteFault(code) { __stat.faults[code] = (__stat.faults[code] || 0) + 1; }

  function clean(v, n) {
    if (v === undefined || v === null) return '';
    return String(v).replace(/\s+/g, ' ').trim().slice(0, n || 60);
  }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function storeOf() { return (WA.store && typeof WA.store.transact === 'function') ? WA.store : null; }

  function readReceipts() {
    try {
      const r = WA.store.read('commit.receipts', null);
      return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
  }
  function findReceipt(opId) {
    const rs = readReceipts();
    for (let i = rs.length - 1; i >= 0; i--) { if (rs[i] && rs[i].opId === opId) return rs[i]; }
    return null;
  }
  /** 把回执写进**当前 draft**（由 commit 在 mutator 内调用，故与世界写入同事务）。 */
  function writeReceipt(draft, chain, note) {
    if (!draft.commit || typeof draft.commit !== 'object') draft.commit = { receipts: [] };
    if (!Array.isArray(draft.commit.receipts)) draft.commit.receipts = [];
    draft.commit.receipts.push({
      opId: chain.opId, site: chain.site, floor: chain.floor, swipe: chain.swipe,
      epoch: chain.epoch, rev: chain.rev, deferred: chain.deferred.length,
      at: clockNow('commit'), note: clean(note, LIMITS.SITE) || ''
    });
    // 有界：无界的回执台账 = 存档被长局拖垮（本仓对「只增不减的容器」一贯判红灯）
    if (WA.evict) WA.evict.array(draft.commit.receipts, 'commit.receipts', LIMITS.RECEIPTS);
  }

  /**
   * 世界操作键。显式 `opId` 优先（跨刷新稳定）；否则由来源楼层/滑动的指纹组成。
   * @returns {string} 键（**非空**；无聊天时返回 `op@no-chat`，此时调用方必须显式给 opId）
   */
  function opKey(opt) {
    const o = opt || {};
    if (o.opId !== undefined && o.opId !== null && String(o.opId).trim()) return clean(o.opId, LIMITS.OPID);
    const st = storeOf();
    const sig = (st && typeof WA.store.floorSig === 'function') ? WA.store.floorSig() : 'no-chat';
    return 'op@' + (sig || 'no-chat');
  }

  /**
   * 开一次世界操作。**同一键已提交过 ⇒ 只返回原回执**（`reused:true`），不重做。
   * @param {string} [opId] 显式操作号（省略则由楼层指纹派生）
   * @param {{site?:string, floor?:number, swipe?:number}} [opt]
   * @returns {ok:true, chain, key} 或 {ok:false, reason, reused?, receipt?}
   */
  function begin(opId, opt) {
    const o = opt || {};
    const st = storeOf();
    if (!st) { noteFault('store-absent'); return { ok: false, reason: 'store-absent' }; }
    const key = opKey({ opId: opId, floor: o.floor, swipe: o.swipe });
    if (!key) { noteFault('missing-opid'); return { ok: false, reason: 'missing-opid' }; }
    // 幂等判据是**落盘回执**，不是「在册链」——进程重启后仍答得出「这一笔做过没有」
    const prev = findReceipt(key);
    if (prev) {
      __stat.reused++; __stat.lastReason = 'duplicate-op'; __stat.lastAt = clockWall(); __stat.lastOpId = key;
      return { ok: false, reason: 'duplicate-op', reused: true, key: key, receipt: prev };
    }
    const chain = {
      opId: key,
      site: clean(o.site, LIMITS.SITE) || 'commit',
      floor: num(o.floor), swipe: num(o.swipe),
      epoch: (typeof st.epoch === 'function') ? st.epoch() : 0,
      rev: (typeof st.committedRev === 'function') ? st.committedRev() : 0,
      deferred: [], settled: false, at: clockWall()
    };
    __live[key] = chain;
    __stat.begun++; __stat.lastReason = 'begun'; __stat.lastAt = clockWall(); __stat.lastOpId = key;
    return { ok: true, chain: chain, key: key };
  }

  /**
   * 原子提交。`fn(draft)` 的写入与**回执**落在同一个 draft 上 ⇒ 要么都成立、要么都不成立。
   *   第二步抛错：`store.transact` 捕获后 pop draft ⇒ 世界**不半写**（本函数如实报 `threw`）。
   *   保存失败：如实报 `persisted:false`（`store` 的 v0.1.22 契约是「落盘失败不回滚内存」，
   *   本函数不粉饰它 —— 读数的诚实优先于「看起来成功」）。
   * @returns {ok, opId, written, persisted?, reason?, tx?}
   */
  function commit(chain, fn) {
    if (!chain || typeof fn !== 'function') { noteFault('bad-chain'); return { ok: false, reason: 'bad-chain' }; }
    const st = storeOf();
    if (!st) { noteFault('store-absent'); return { ok: false, reason: 'store-absent' }; }
    if (chain.settled) return { ok: true, opId: chain.opId, reused: true, written: false, note: '链已提交（同 opId 不重做）' };
    const tx = st.transact(function (draft) {
      const r = fn(draft);                 // 抛错由 transact 捕获 ⇒ 本次不提交
      if (r === false) return false;       // 显式中止（与仓内 mutator 的 false 语义一致）
      writeReceipt(draft, chain, '');      // 回执与世界写入**同一事务**
      return (r === undefined) ? true : r;
    }, 'commit:' + chain.site);
    if (!tx || tx.ok !== true) {
      let reason = 'failed';
      if (tx && tx.aborted) reason = tx.conflict ? 'conflict' : (tx.stale ? 'stale' : 'aborted');
      else if (tx && tx.denied) reason = 'denied';
      else if (tx && tx.error) reason = 'threw';
      if (reason === 'aborted') __stat.aborted++; else __stat.failed++;
      noteFault(reason);
      __stat.lastReason = reason; __stat.lastAt = clockWall(); __stat.lastOpId = chain.opId;
      delete __live[chain.opId];
      return { ok: false, reason: reason, opId: chain.opId, written: false, tx: tx || null };
    }
    chain.settled = true;
    delete __live[chain.opId];
    __stat.committed++;
    const persisted = (tx.persisted !== false);
    if (!persisted) { __stat.saveFailed++; noteFault('save-failed'); }
    __stat.lastReason = persisted ? 'committed' : 'committed-unpersisted';
    __stat.lastAt = clockWall(); __stat.lastOpId = chain.opId;
    return { ok: true, opId: chain.opId, written: true, persisted: persisted, tx: tx };
  }

  /**
   * 登记一个**不可同草稿执行**的副作用（事务外执行）。
   *   为什么必须显式登记而不是直接调：`actors/registry.js` 一类写口自带事务，
   *   在 mutator 里嵌套调用会把内层 mutator 跑到外层 draft 上（`deferred:true` 的错位路径）。
   *   登记在此 ⇒ 事务提交后才执行，且**失败可单独重试**。
   */
  function defer(chain, kind, fn) {
    if (!chain || typeof fn !== 'function') { noteFault('bad-defer'); return { ok: false, reason: 'bad-defer' }; }
    if (!Array.isArray(chain.deferred)) chain.deferred = [];
    if (chain.deferred.length >= LIMITS.DEFERRED) {
      __stat.deferRej++; noteFault('deferred-full');
      return { ok: false, reason: 'deferred-full', pending: chain.deferred.length };
    }
    chain.deferred.push({ kind: clean(kind, LIMITS.KIND) || 'effect', fn: fn, done: false, tries: 0, reason: '' });
    __stat.deferred++;
    return { ok: true, pending: chain.deferred.length };
  }

  /**
   * 事务提交后落副作用。**写失败只降级为台账，不回滚已提交的世界事实**（与 backstage 同口径）。
   *   已 `done` 的项一律跳过 —— 于是 `retryEffects` 天然只重试失败的那些。
   * @returns {ok, tried, passed, failed, pending, reasons}
   */
  function flush(chain) {
    if (!chain || !Array.isArray(chain.deferred)) { noteFault('bad-chain'); return { ok: false, reason: 'bad-chain' }; }
    const out = { tried: 0, passed: 0, failed: 0, reasons: {} };
    for (let i = 0; i < chain.deferred.length; i++) {
      const d = chain.deferred[i];
      if (d.done) continue;
      d.tries++; out.tried++;
      try {
        const r = d.fn();
        if (r === false) throw new Error('effect-refused');
        d.done = true; d.reason = ''; out.passed++; __stat.deferOk++;
      } catch (e) {
        d.reason = clean((e && e.message) || e, LIMITS.REASON) || 'effect-threw';
        out.failed++; __stat.deferRej++;
        out.reasons[d.reason] = (out.reasons[d.reason] || 0) + 1;
        WA.log('warn', 'commit 副作用未落（可单独重试）: ' + d.kind + ' -> ' + d.reason);
      }
    }
    out.pending = chain.deferred.filter(function (d) { return !d.done; }).length;
    __stat.lastReason = out.failed ? 'effect-failed' : 'effect-ok';
    __stat.lastAt = clockWall(); __stat.lastOpId = chain.opId;
    return Object.assign({ ok: out.failed === 0 }, out);
  }

  /**
   * 只重试未完成的副作用。**一次都不碰世界键** —— 「重试通知」与「重放世界变化」是两件事，
   *   合并会让一次通知抖动把资源和关系再变一遍（TP4 点名的「不能重做已提交的资源和关系变化」）。
   */
  function retryEffects(chain) {
    if (!chain || !Array.isArray(chain.deferred)) { noteFault('bad-chain'); return { ok: false, reason: 'bad-chain' }; }
    const pending = chain.deferred.filter(function (d) { return !d.done; }).length;
    if (!pending) return { ok: true, reused: true, tried: 0, passed: 0, failed: 0, pending: 0, note: '无待重试的副作用' };
    __stat.effectsRetried++;
    const r = flush(chain);
    if (r.failed) __stat.effectsFailed++;
    return r;
  }

  /**
   * 外部登记回执（**事务外**的一次独立写入）。给「已提交但当时没记」的路径补账用
   *   （如 backstage 推演结算完成后、coop 确认回执落位后）。
   *   本函数只写 `commit.receipts`，不碰调用方的任何世界键。
   */
  function settle(opId, rec) {
    const key = clean(opId, LIMITS.OPID);
    if (!key) { noteFault('missing-opid'); return { ok: false, reason: 'missing-opid' }; }
    const st = storeOf();
    if (!st) { noteFault('store-absent'); return { ok: false, reason: 'store-absent' }; }
    const r = rec || {};
    const tx = st.transact(function (draft) {
      writeReceipt(draft, {
        opId: key, site: clean(r.site, LIMITS.SITE) || 'external',
        floor: num(r.floor), swipe: num(r.swipe),
        epoch: (typeof st.epoch === 'function') ? st.epoch() : 0,
        rev: (typeof st.committedRev === 'function') ? st.committedRev() : 0,
        deferred: []
      }, clean(r.note, LIMITS.SITE));
      return true;
    }, 'commit:settle');
    if (!tx || tx.ok !== true) { noteFault('settle-failed'); return { ok: false, reason: 'settle-failed', opId: key }; }
    __stat.committed++; __stat.lastReason = 'settled'; __stat.lastAt = clockWall(); __stat.lastOpId = key;
    return { ok: true, opId: key, persisted: tx.persisted !== false };
  }

  /** 查已提交回执（跨刷新可用）。 */
  function replay(opId) {
    const key = clean(opId, LIMITS.OPID);
    if (!key) return { ok: false, reason: 'missing-opid' };
    const rec = findReceipt(key);
    if (!rec) return { ok: false, reason: 'no-receipt', opId: key };
    return { ok: true, opId: key, receipt: rec };
  }

  /** 只读台账（tool-diag / 面板 / 专锁消费）。 */
  function stat() {
    return {
      begun: __stat.begun, committed: __stat.committed, reused: __stat.reused,
      aborted: __stat.aborted, failed: __stat.failed, saveFailed: __stat.saveFailed,
      deferred: __stat.deferred, deferOk: __stat.deferOk, deferRej: __stat.deferRej,
      effectsRetried: __stat.effectsRetried, effectsFailed: __stat.effectsFailed,
      live: Object.keys(__live).length, receipts: readReceipts().length, cap: LIMITS.RECEIPTS,
      lastReason: __stat.lastReason, lastAt: __stat.lastAt, lastOpId: __stat.lastOpId,
      faults: Object.assign({}, __stat.faults)
    };
  }

  WA.commit = {
    opKey: opKey,
    begin: begin,
    commit: commit,
    defer: defer,
    flush: flush,
    retryEffects: retryEffects,
    settle: settle,
    replay: replay,
    stat: stat
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('core/commit.js', { kind: 'core', ver: '2.160.0' });
})();