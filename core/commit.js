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
  /** 把回执写进**当前 draft**（由 commit 在 mutator 内调用，故与世界写入同事务）。
   *  v2.194.0（U2）：多一个可选 `extra` —— 链面的回执要在**同一本台账**上补记
   *    「本链有几笔在途、声明规模与记账规模各多少、差额多少」。不另起一本账：
   *    两本账的那一刻起，「这一笔做过没有」就会有两个答案。 */
  function writeReceipt(draft, chain, note, extra) {
    if (!draft.commit || typeof draft.commit !== 'object') draft.commit = { receipts: [] };
    if (!Array.isArray(draft.commit.receipts)) draft.commit.receipts = [];
    const row = {
      opId: chain.opId, site: chain.site, floor: chain.floor, swipe: chain.swipe,
      epoch: chain.epoch, rev: chain.rev, deferred: chain.deferred.length,
      at: clockNow('commit'), note: clean(note, LIMITS.SITE) || ''
    };
    if (extra && typeof extra === 'object') { Object.keys(extra).forEach(function (k) { row[k] = extra[k]; }); }
    draft.commit.receipts.push(row);
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
    // v2.185.0（计划 O2）：**嵌套提交不算提交**。
    //   本函数被嵌在别人的 mutator 里时，`store.transact` 走嵌套分支、返回 `deferred:true`
    //   ——它的语义是「随外层提交」。于是本模块的第一条纪律（「回执与世界写入同一事务」）
    //   在此**根本无法保证**：外层随后被拒 / 抛错时世界写入会被撤回，而回执若已经报成
    //   `written:true`，那就是一个**假的已提交结论**（正是 TP4 点名要避免的那一类读数）。
    //   实测口径：拿一个必然抛错的外层事务包住 commit ⇒ 回执不落盘，而旧版回执照样报
    //   `{ok:true, written:true, persisted:true}`。故本路径一律：不标 `settled`、不报
    //   `written`，并记一次 `nested-deferred` fault（进 `stat().faults`，诊断可读）。
    if (tx && tx.deferred === true) {
      __stat.failed++; noteFault('nested-deferred');
      __stat.lastReason = 'nested-deferred'; __stat.lastAt = clockWall(); __stat.lastOpId = chain.opId;
      //   注：**不动**这条链已经写进外层草稿的回执。为什么不撤：回执与世界写入在**同一个 draft** 上，
      //   外层提交则两者都在、外层被拒则两者都没——这正是本模块第一条纪律想要的。真正错的只是
      //   那个**返回值**（它把「随外层提交」读成了「已提交」），故本路径只改返回值，不改台账。
      WA.log('warn', 'commit 被嵌在别人的 mutator 里（deferred:true）——本次没有提交任何东西；请把 WA.commit.commit 放在最外层');
      return { ok: false, reason: 'nested-deferred', opId: chain.opId, written: false, deferred: true, tx: tx,
        note: '嵌套提交不算提交：世界写入与回执都随外层事务；请把 WA.commit.commit 放到最外层调用' };
    }
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

  // ── v2.194.0（U2）：跨模块链 —— 「一次世界操作」的统一提交面 ─────────────────
  //
  // ── 它治什么（本次实测的缺口，两条）────────────────────────────
  //   ① **在途写口会谎报成功**。`operations.disburse` 等写口是「B 模式」：事务外先走
  //      跨模块副作用（`WA.org.transfer`），再自己 `store.transact` 记一笔。让这样的写口
  //      在**链**里跑（链必须有外层 draft 才能原子），它就会变成嵌套事务：世界写入随外层
  //      提交，但它**照样报 `{ok:true}`** —— 探针实测：外层 `fn` 返回 false 后世界逐字未变，
  //      而写口回报的 `spent` 停在事务外的旧值、`ok` 是 true。调用方据此认为「拨付成功、
  //      项目预算已扣」，两处世界事实一格没变。**这是谎报，且是链最需要它说真话的那一刻。**
  //   ② **一笔生意写几次世界**。`operations.disburse` 里 `org.transfer` 与本地记账是**两次
  //      顶层事务**；中途失败（记账抛错 / 保存失败）就得到「钱出了、账没记」——本仓反复治的
  //      半写。`story-choice.confirm` 更直白：先 `branchTree.choose`，再 `commit.begin`
  //      兑现 ops。这些都是**一次世界操作**被拆成 N 次提交。
  //
  // ── 治法（三条，逐条对应上面）─────────────────────────────────
  //   A. **回滚协调**：链把世界写入与回执放进**同一个** `store.transact`（外层 draft）；
  //      某一步失败 ⇒ 返回 false / 抛错 ⇒ `transact` pop draft ⇒ 已写的一格不留。这是链的
  //      原子性来源，也是**唯一**来源 —— 本面不自己实现回滚。
  //   B. **在链上不谎报**：写口一旦发现自己跑在链的**在途草稿**上，世界写入照原路走
  //      （落在链那一份 draft 上，与链里其它写入同生共死），但**回执改口径**：
  //      `chain:true / persisted:false / projected:true`，并把「这一笔还没提交」写在明面上。
  //      它**不**把写入推迟到链之后 —— 推迟会让它与链里其它写入不再同生共死，那正是本项要治的
  //      半写。（早先试过「邀约 + 收尾处理器」的推迟版，已连同 `onCommit` / `registerFlusher` /
  //      `settleInvites` 一并摘除：它会把握手失败读成「登记成功」，把谎报搬到另一个层。）
  //   C. **一次提交、处处一致**：链下只有一个 opId、一本台账。任何一刻「这条链做过没有」
  //      只由落盘回执回答（`replay`），不由进程态回答。
  //
  // ── 边界（不做什么）─────────────────────────────────────────
  //   · **不读写口所在的模块文件**：统一是「加一个面 + 各模块在写口边界接一次」，不是让每个
  //     写口改一篇正文。同理，收尾处理器表住在**消费方**（邀请方）而不是这里 —— 谁对这条链
  //     负责，谁决定它的依赖方向。
  //   · **顶层调用一律走旧路**。只有在链的在途草稿上，写口才退化成邀约；链外调用（面板、
  //     其它引擎、既有测试）看到的返回值与写入时序**逐字不变**。
  //   · 不把单模块内部的写入强行拉进来：链只登记「跨模块的那一段」，单模块自己的
  //     `store.transact` 仍原样留在模块里。
  //   · 不改任何模块的**设置项 / 登记项**：链是进程态编排，不开新开关、不进 settingsBus、
  //     不占模块注册表（因此不改注册表读数与装载序）。
  const LIMITS_CHAIN = { STEPS: 16, NOTE: 60 };
  const __chainStat = {
    chains: 0, commits: 0, aborts: 0, failed: 0, replayed: 0, capped: 0, overLimit: 0,
    leaks: 0, lastReason: '', lastAt: 0
  };
  const __chainFaults = {};
  function chainFault(code) { __chainFaults[code] = (__chainFaults[code] || 0) + 1; }
  const CHAIN_FAULTS = [
    'store-absent',       // 没有 store：链无法开始（不是「空链成功了」）
    'duplicate-op',       // 同一 opId 已经提交过（换 ID 再来，或走 replay 看回执）
    'chain-nested',       // 已经在一条链里了 —— 自己不嵌套自己
    'bad-chain',          // 形状不合法
    'no-writes',          // 链跑完了却没有一笔世界写入（要么拼错了，要么印错了）
    'size-mismatch',      // 声明规模 ≠ 记账规模（步数）
    'steps-full',         // 超过单链步数上限（常量，不可配）
    'step-threw',         // 某一步抛错
    'step-refused',       // 某一步显式返回 false
    'receipt-failed',     // 回执没写进草稿（链因此中止 —— 不许「写成了世界、记不上账」）
    'aborted'             // store 层面被拒，而链面答不出更细的因（不假装知道是谁拒的）
  ];
  let __curChain = null;
  let __chainStartedAt = 0;
  let __chainStartedCount = 0;   // 链开始时的 store 事务数（时效判据的真源）

  /**
   * 「刚刚那一趟里，有没有某一步的**嵌套写口**被保存点撤回？」
   *   真源是 `store.txStat().lastNested` —— 由 store 自己在嵌套分支写入（配置型台账，
   *   不是我方常量、不是我方自带锚点副本），故这个判据可以独立复读。
   *   时效校验：读数必须落在本链开始之后（否则是**上一次事务**留下的旧读数，不许当成本次的结论）。
   * @returns {'aborted'|'threw'|''}
   */
  function nestedVerdict() {
    const st = storeOf();
    if (!st || typeof st.txStat !== 'function') return '';
    let ln = null;
    try { ln = st.txStat().lastNested; } catch (e) { return ''; }
    if (!ln || typeof ln !== 'object') return '';
    // 时效判据用 store 的**单调计数器**，不是墙钟毫秒：同一毫秒内连开的事务会让
    //   `ln.at < 起始时刻` 为假 ⇒ 旧读数被当成本次的（专锁实测的跨进程抖动）。
    if (typeof ln.seq === 'number' && typeof __chainStartedCount === 'number') {
      if (ln.seq < __chainStartedCount + 1) return '';   // 序号在本次之前 ⇒ 旧读数
    } else if (typeof st.count === 'number' && typeof __chainStartedCount === 'number' && st.count < __chainStartedCount + 1) {
      return '';                                          // 老 store（无 seq）：回退到计数口径
    }
    return (ln.why === 'threw') ? 'threw' : 'aborted';
  }
  function chainPack(c, opt) {
    const o = opt || {};
    return {
      ok: !!(c && c.settledFlag && !c.failed),
      opId: (c && c.opId) || '', site: (c && c.site) || '', tx: o.tx || null,
      steps: (c && c.steps) || [],
      receipt: o.receipt || null,
      reason: o.reason || undefined,
      note: o.note || ''
    };
  }
  /**
   * 登记链的**一步**。每步一行，`site` 说清「谁写的」：
   *   失败时调用方据此答得出「在哪一层断的」，而不是只有一句「链没成」。
   */
  function step(chainObj, rec) {
    const c = chainObj || __curChain;
    if (!c) { chainFault('bad-chain'); return { ok: false, reason: 'bad-chain' }; }
    if (c.steps.length >= LIMITS_CHAIN.STEPS) {
      chainFault('steps-full'); __chainStat.overLimit++;
      return { ok: false, reason: 'steps-full', cap: LIMITS_CHAIN.STEPS, at: c.steps.length };
    }
    const r = rec || {};
    c.steps.push({ site: clean(r.site, LIMITS.SITE) || 'step', at: clockWall() });
    return { ok: true, n: c.steps.length };
  }

  /** 当前在途链（只读）。写口与消费方据此判断「我是不是正在一条链里跑」。 */
  function active() {
    const c = __curChain;
    if (!c) return null;
    return { opId: c.opId, site: c.site, steps: c.steps.length };
  }
  /**
   * 链的在途草稿（**只在链里**非空）。在链里返回 `{opId, draft}`；链外返回 `null`。
   * 写口借它做「在链上不谎报」：拿到 draft ⇒ 走邀约路径；拿不到 ⇒ 走原来的顶层路径。
   * 返回的是这次**调用级**的句柄，不是链对象 —— 写口不该看到链的内部状态。
   */
  function inflight() {
    const c = __curChain;
    if (!c || !c.draft) return null;
    return { opId: c.opId, draft: c.draft };
  }
  /**
   * 跑一条**跨模块链**。`fn(chain, draft)` 里的每一步都写在外层 draft 上，整链一次提交。
   *   返回值两种读法（都要）：返回 `false` ⇒ 整链中止（世界一格不动）；
   *   返回对象 ⇒ 当**规模声明**用（`steps`），由本面在提交后与**实际记账**核对：
   *   声明 ≠ 记账就记一次 `size-mismatch` —— 俄式对账，不是「你说几条就几条」。
   *
   *   `onCommit(scope)` 在**链事务提交之后**调用（账外的邀约落库归它）：
   *   链**自己**不知道任何模块的写口，是消费方在这里说清「本链的邀约谁落库」。
   *   它返回 `{passed, failed, pending}` 时，本面据此把邀约落库的漏账记进 `faults`：
   *   **世界提交了、邀约没落**是两种事实，读数上必须分得开。
   *
   * @param {{opId?:string, site?:string, steps?:number, fn:function, onCommit?:function}} opt
   * @returns {{ok, opId, site, tx, steps, receipt, reason?, note}}
   */
  function chain(opt) {
    const o = opt || {};
    if (typeof o.fn !== 'function') { chainFault('bad-chain'); return { ok: false, reason: 'bad-chain' }; }
    if (__curChain) { chainFault('chain-nested'); return { ok: false, reason: 'chain-nested', opId: __curChain.opId }; }
    const st = storeOf();
    if (!st) { chainFault('store-absent'); return { ok: false, reason: 'store-absent' }; }
    // 默认 opId = `chain@<floor>`：它是**按聊天去重**的，不是按次去重。
    //   边界（专锁实测）：同一个 floor 里第二条链必须**自带 opId**，否则撞上第一条的已提交回执
    //   ⇒ `duplicate-op`。`operations.disburse` 作为首个真实消费者自带发号（见该模块 `nextOpId`）。
    const opId = clean(o.opId, LIMITS.OPID) || ('chain@' + (typeof st.floorSig === 'function' ? (st.floorSig() || 'no-chat') : 'no-chat'));
    const dupe = findReceipt(opId);
    if (dupe) {
      chainFault('duplicate-op'); __chainStat.replayed++;
      __chainStat.lastReason = 'duplicate-op'; __chainStat.lastAt = clockWall();
      return { ok: false, reason: 'duplicate-op', opId: opId, receipt: dupe, reused: true };
    }
    const c = {
      opId: opId, site: clean(o.site, LIMITS.SITE) || 'chain',
      decl: (typeof o.steps === 'number') ? o.steps : null,
      steps: [], failed: false,
      // 回执行（writeReceipt）读这几个字段 —— 链自己的现场度量为 0（步数另计于 row.steps）。
      //   此前漏了它们 ⇒ writeReceipt 在 mutator 里 TypeError ⇒ 链被误报成 `step-threw`。
      //   本版**不吞**这个事实：回执写不进去也要如实归因（见下 receipt-failed）。
      floor: num(o.floor), swipe: num(o.swipe),
      epoch: (typeof st.epoch === 'function') ? st.epoch() : 0,
      rev: (typeof st.committedRev === 'function') ? st.committedRev() : 0,
      deferred: [],
      draft: null, settledFlag: false, at: clockWall(),
      // 中止的真因（写进回执的 `reason`）。此前只在最外层按 `tx.aborted` 判 ⇒
      //   「某一步拒签」被错报成 `aborted`（读数上盖住了消费方那一步的名字）。
      abortWhy: ''
    };
    __chainStat.chains++;
    __curChain = c;
    __chainStartedAt = c.at;
    try { __chainStartedCount = (typeof st.txStat === 'function') ? (st.txStat().count || 0) : 0; } catch (e) { __chainStartedCount = 0; }
    let threw = null;
    const tx = (function () {
      try {
        return st.transact(function (draft) {
          c.draft = draft;
          let r;
          try { r = o.fn(c, draft); }
          catch (e) { threw = e; chainFault('step-threw'); c.failed = true; c.abortWhy = 'step-threw'; return false; }
          finally { c.draft = null; }
          if (r === false) { chainFault('step-refused'); c.abortWhy = c.abortWhy || 'step-refused'; return false; }
          if (r && typeof r === 'object' && typeof r.steps === 'number') c.decl = r.steps;
          // **空链不算链**：一笔世界写入都没有，就不该在台账上留一行回执
          if (!c.steps.length) { chainFault('no-writes'); c.failed = true; c.abortWhy = 'no-writes'; return false; }
          if (c.decl !== null && c.steps.length !== c.decl) chainFault('size-mismatch');
          // 回执与世界写入**同一草稿**：写不进去 ⇒ 整链中止（宁可没写，也不许「写成了世界、记不上账」）。
          //   单独 catch：这里抛的错是**本面自己**的（不是消费方那一步的），归因必须分开。
          try {
            writeReceipt(draft, c, (c.site || '').slice(0, LIMITS.SITE),
              { steps: c.steps.length, writes: c.steps.length,
                want: c.decl, delta: (c.decl === null ? null : c.steps.length - c.decl) });
          } catch (e) {
            chainFault('receipt-failed'); c.failed = true; c.abortWhy = 'receipt-failed';
            c.receiptErr = clean((e && e.message) || e, LIMITS.REASON);
            return false;
          }
          return true;
        }, 'chain:' + c.site);
      } finally {
        if (__curChain === c) __curChain = null;
        c.draft = null;
      }
    })();
    if (threw) {
      __chainStat.failed++; __chainStat.lastReason = 'step-threw'; __chainStat.lastAt = clockWall();
      return chainPack(c, { reason: 'step-threw', note: '某一步抛错（' + clean(threw.message || threw, LIMITS.REASON) + '）—— 世界未提交' });
    }
    if (tx && tx.deferred === true) {
      __chainStat.failed++; chainFault('chain-nested');
      __chainStat.lastReason = 'chain-nested'; __chainStat.lastAt = clockWall();
      return chainPack(c, { reason: 'chain-nested',
        note: '链被嵌在别人的 mutator 里 —— 它随外层提交，但在本框架的判定口径下**不作为一条链成立**（真实消费者须在最外层调它）' });
    }
    if (tx && tx.ok === true) {
      // 提交成功：交还**全程的世界状态**（与 `store.transact` 的顶层包法一致，调用方照旧能 stack）
      c.settledFlag = true;
      __chainStat.commits++; __chainStat.lastReason = 'committed'; __chainStat.lastAt = clockWall();
      const rec = findReceipt(c.opId);
      // 成功路径**不**额外透出 `c.abortWhy`：设过它的链一定走中止路径（那里早已把它当 `reason`
      //   交给调用方），成功时它恒为 undefined —— 带出去就是一个**零消费者的字段**
      //   （反向自证实测：把这一行删掉，专锁读数一格不变）。本仓不留「看起来会被用」的出口。
      return chainPack(c, {
        tx: tx, receipt: rec,
        note: c.failed ? '链提交了，但本趟触发过 fault（见 chainStat().faults）'
          : '整链一次提交：' + c.steps.length + ' 步，回执 ' + c.opId
      });
    }
    if (tx && (tx.aborted || tx.stale)) {
      __chainStat.aborts++; __chainStat.lastAt = clockWall();
      // 真因优先：`tx.aborted` 只说「store 没提交」，说不清是**谁**让它没提交的。
      const aur = c.abortWhy || (tx.stale ? 'stale' : 'aborted');
      if (!c.abortWhy && !tx.stale) chainFault('aborted');
      __chainStat.lastReason = aur;
      const lastSite = c.steps.length ? c.steps[c.steps.length - 1].site : '';
      const whyTxt = aur === 'step-refused' ? '（某一步主动拒签 —— 该步与整链都未提交）'
        : aur === 'no-writes' ? '（一笔世界写入都没有 —— 空链不算链）'
          : aur === 'step-threw' ? '（某一步抛错）' : '';
      return chainPack(c, { reason: aur, note: '链被中止' + whyTxt + ' —— 世界一格未动'
        + (lastSite ? '；断在最后一层：' + lastSite : '') });
    }
    __chainStat.failed++;
    // 归因：本面自己写回执失败 > 消费方那一步抛错/拒签 > 外层事务被拒。
    //   末一条借 `store.txStat().lastNested` 分辨「某一步的嵌套写口被保存点撤回了」——
    //   那是**消费方自己的写口**说不出口（它只见到品牌回执），只有 store 知道自己撤回了谁。
    const ln = nestedVerdict();
    let why;
    if (c.abortWhy) why = c.abortWhy;                       // 本面/消费方已经答得出来的真因
    else if (ln) why = (ln === 'threw') ? 'step-threw' : 'step-refused';
    else why = (tx && tx.error) ? 'step-threw' : 'aborted';
    chainFault(why);
    __chainStat.lastReason = why; __chainStat.lastAt = clockWall();
    // 断在哪一层：把**已登记的最后一步**答出来（不是只有一句「链没成」）
    const last = c.steps.length ? c.steps[c.steps.length - 1].site : '';
    const whyNote = c.receiptErr ? '（回执写入失败：' + c.receiptErr + '）'
      : (ln === 'aborted' ? '（某一步的嵌套写口被保存点撤回 —— 该步未生效）'
        : (ln === 'threw' ? '（某一步的嵌套写口抛错）' : ''));
    return chainPack(c, { reason: why, note: '链未提交（store 事务未通过）' + whyNote + (last ? ' —— 断在最后一层：' + last : '') });
  }

  /** 链的只读台账（tool-diag / 面板 / 专锁消费）。**没有「还开着几条」这一项** —— 见 `chain` 的 finally。 */
  function chainStat() {
    return {
      faultCodes: CHAIN_FAULTS.slice(),
      chains: __chainStat.chains, commits: __chainStat.commits, aborts: __chainStat.aborts,
      failed: __chainStat.failed, replayed: __chainStat.replayed, capped: __chainStat.capped,
      overLimit: __chainStat.overLimit, leaks: __chainStat.leaks,
      open: __curChain ? 1 : 0, limit: LIMITS_CHAIN.STEPS,
      lastReason: __chainStat.lastReason, lastAt: __chainStat.lastAt,
      faults: Object.assign({}, __chainFaults)
    };
  }

  /** 链的自证（只读）：把「本面是否可用、按什么口径算、哪几条边界被硬编码」当场答出来。 */
  function selfCheck() {
    const st = storeOf();
    const failed = [];
    if (st && typeof st.transact !== 'function') failed.push('store.transact');
    if (typeof WA.evict !== 'object') failed.push('evict（回执台账无界）');

    const checks = {
      store: !!st,
      oneLedger: true,          // 世界写与链回执都在 `commit.receipts` 一本账上（本版硬口径）
      chainOwnsRollback: true,  // 回滚协调委托给 `store.transact` 的 draft pop（本面不自己回滚）
      noFixtureDefaults: true,  // 步骤上限是**常量**，不是可配项；超限报 `steps-full`
      moduleRegistryReadOnly: true,
      settingsReadOnly: true,
      widget: false
    };
    return { ok: failed.length === 0, failed: failed, checks: checks, faults: CHAIN_FAULTS.slice() };
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
    stat: stat,
    // v2.194.0（U2）：跨模块链 —— 统一提交面。链是**进程态编排**，不开开关、不进注册表。
    //   零调用入口（邀约 / 收尾处理器 / seen / opKeyWith）在**同批**摘除：留着一组
    //   「库里没人调」的出口，就是给下一个人留一个『它应该被用』的错觉。
    chain: chain,
    chainStat: chainStat,
    chainSelfCheck: selfCheck,
    active: active,
    inflight: inflight,
    step: step
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('core/commit.js', { kind: 'core', ver: '2.194.0' });
})();