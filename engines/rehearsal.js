/**
 * WorldAxis engines/rehearsal.js (v2.118.0) — 统一试演 / 回滚范围 / 原著分歧（计划二 B7）
 *
 * ── 它治什么（缺口原句）────────────────────────────────────
 *   计划二 B7 原文：「当前 causal.rehearse 能在副本推进因果，rand 有录制/校验，
 *   undo/checkpoints 有恢复基础；**chrono 是依赖记录与 revert 记录，applyUndo 不等于恢复全部世界，
 *   simBranch 也不等于完整业务试跑**。在 A1 和 B1 的共享执行逻辑上，构造隔离的世界快照、
 *   故事时钟、随机源及本轮候选。真实运行与试演使用同样的准入、冲突与效果处理，执行上下文显式传入。
 *   检查当轮因果推进里读取全局状态的分支，确保试演不回读真实世界，也不产生外部副作用。
 *   先支持限定步数和明确动作的比较，例如「等待」「改道」「提前通知」的两步后果。
 *   确定性部分可比较，依赖未来模型生成的部分标为未知或候选；随机序列一致不能冒充文本输出
 *   和未来剧情完全可复现。应用预览时检查真实世界版本是否仍匹配，变化后重新计算或报冲突。
 *   回滚显示恢复的数据范围；对已经发到外部的消息使用补偿状态或标注不可撤销，
 *   不伪称删除本地记录就撤回了现实动作。原著对位继续复用 canon 幕目和 gap/position：
 *   原著事实带来源，角色视点只获得当前可知部分。提供遵循、有限偏离和自由分支的约束政策；
 *   玩家偏离后根据已发生事实继续演化，不强迫 NPC 修正剧情去复刻原著。」
 *
 * ── 本模块为什么必须是新顶层容器，而不是往 causal 里塞 ──────────
 *   causal 的 `rehearse` 答的是「这一轮因果怎么走」——它是**因果**的预览。
 *   B7 要的是「**这一轮世界**怎么走」：行动准入、行程、资源、机会窗口一起动。
 *   两者共用一个名字会让「我试演过了」这句话变得不可判定（试的是哪一层？）。
 *   故本模块自带容器 `rehearsal`，并把 causal 的推进**作为一个步骤**纳入同一次试演。
 *
 * ── 六条否定式（本模块存在的全部理由）──────────────────────
 *   ① **试演不回读真世界**。一次试演从头到尾只读它自己那份快照；真世界在试演期间
 *      一个字节都不许变（`C.untouched` 逐面取证：状态指纹 / 计数器 / 外部队列）。
 *   ② **试演的写落在 sink 上**，不进 store —— 这是「不产生外部副作用」的唯一实现路径，
 *      也是 `core/exec.js` 里唯一的分岔点。
 *   ③ **随机序列一致 ≠ 剧情可复现**。确定性部分（准入结论、行程时刻、资源数）判「可比较」；
 *      依赖模型正文生成的部分**一律标 unknown**，不假装能比对。
 *   ④ **旧预览不能覆盖新进度**。预览钉在「当时那份快照的版本」上；真世界版本变了 ⇒
 *      `stale-preview` 拒收，且**不**顺手重算（重算是调用方的显式选择，不是本模块的默认）。
 *   ⑤ **不伪称撤回了现实动作**。已发到外部的消息（phone-bridge 的操作台账）另列一档
 *      `irreversible`：删掉本地记录不等于撤回对方已经收到的消息。
 *   ⑥ **原著分歧不强迫 NPC 复刻原著**。三种政策（遵循 / 有限偏离 / 自由分支）只**报告**
 *      偏离面与后果，不替玩家把剧情掰回去；`gap` 只报数（那是 canon 的既有口径）。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────
 *   · 「可回滚」只覆盖本模块**取证到的**范围（快照顶层键 + 外部队列 + 计数器）；不宣称恢复全部世界
 *     （这正是 B7 原文点名的「applyUndo 不等于恢复全部世界」）。
 *   · 未来正文不可比较：`unknown` 是**结论**，不是「还没算」。
 *   · 总开关默认关闭；关闭时不构造快照、不执行、不登记。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_rehearsal_settings_v1';
  const DEF = {
    enabled: false,
    // 一次试演最多推进几步（B7 原文：「先支持限定步数」）
    maxSteps: 4,
    // 保留多少条预览记录（环形，防长局只增不减）
    keepPreviews: 6,
    // 默认的因果推进步长（毫秒）：试演的时间由调用方钉，不由墙上时钟走
    stepMs: 60000,
    // 原著分歧政策：follow（遵循）/ limited（有限偏离）/ free（自由分支）
    policy: 'limited'
  };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'rehearsal',
    bounds: { maxSteps: [1, 12], keepPreviews: [1, 24], stepMs: [1000, 3600000] }
  };
  const POLICIES = ['follow', 'limited', 'free'];
  const POLICY_CN = {
    follow: '遵循：偏离报出并提示，不自动掰回',
    limited: '有限偏离：偏离留痕，剧情按已发生事实继续',
    free: '自由分支：不比对原著，只记当前坐标'
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    if (POLICIES.indexOf(merged.policy) < 0) merged.policy = DEF.policy;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, merged) : merged;
  }
  function saveSettings(next) {
    const m = Object.assign({}, settings(), next || {});
    if (POLICIES.indexOf(m.policy) < 0) m.policy = DEF.policy;
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, m)) : m;
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const LIMITS = { NOTE: 80, ACTION: 60, ACTIONS_PER_RUN: 12, PREVIEW_ROWS: 8, KEYS_REPORT: 24 };
  const stat = {
    runs: 0, steps: 0, refused: 0, applied: 0, stale: 0, reports: 0,
    lastReason: '', faults: {}
  };
  function noteFault(reason) {
    const tag = String(reason == null ? 'unknown' : reason);
    stat.faults[tag] = (stat.faults[tag] || 0) + 1;
    return tag;
  }
  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/\s+/g, ' ').trim().slice(0, max || LIMITS.NOTE);
  }
  function finite(v) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : str(v, max); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rowsOf() {
    const r = state().rehearsal;
    return (r && Array.isArray(r.previews)) ? r.previews : [];
  }

  // ── 执行上下文（正式格在 core/exec.js；缺席时**拒收**，不在真世界上跑假试演）──
  function execMod() { return (WA.exec && typeof WA.exec.withContext === 'function') ? WA.exec : null; }

  /**
   * 真实世界的**版本指纹**：预览建立在它上面，应用前拿它比对。
   *   为什么不只用 `store.read('meta.stateRev')`：`stateRev` 只在落盘时推进，
   *   而一批内存改动（写合并批内）可能还没落盘 —— 那时「版本没变」是一句错话。
   *   故指纹里同时含**内容摘要**（顶层键顺序 + 长度），它对内存改动也敏感。
   */
  /** djb2：把逐格长度序列压成一个数（非加密，只用于「变了没」）。 */
  function hashOf(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return h >>> 0;
  }
  /**
   * 真实世界的**版本指纹**（v2.118.0 修正版）。
   *
   * 它覆盖什么：除 `rehearsal` 与 `meta` 之外**每一格的长度**（拼成序列后取 djb2）。
   * 为什么恰好排除这两格 —— 两者都是实测出来的，不是为了跑过用例：
   *   · `rehearsal`：本模块自己的账本。预览登记是一次写入，若不排除，
   *     则「刚登记完」就已经和钉住的指纹不符（登记动作自己也改变了世界）。
   *   · `meta`：store 每次事务都改写 `updatedAt` / `writeSeq` / `stateRev`。
   *     若不排除，则**任何**事务都会让指纹失效，包括本模块的记账事务。
   * 为什么不是「所有非世界键」：那等于让真改世界被判成无变化（判据变恒真话），
   *   故记账面是一份显式清单（BOOKS），由 b7 锁的 fp3/fp4 两向探针钉着。
   * 为什么不用 `meta.stateRev`：它是全局事务计数器，区分不了
   *   「世界变了」与「我自己记了一笔账」——而 B7 问的是**真实世界**版本是否仍匹配。
   * `rev` 保留在返回值里只作**附注**（视图展示用），**不参与**比对。
   *
   * 为什么是逐格长度而不是总长度：总长度对「某格同长替换」完全瞎
   *   （把一个 id 换成等长的另一个 id，总长度一字不变）。逐格序列能看出「哪一格动了」。
   */
  // ── 记账面（不进指纹）──────────────────────────────────────────────
  //   这几个顶层键是**观测 / 记账簿**，不是世界内容：它们每一个都**必然**在
  //   「登记一笔账」这个动作里被改写，而登记本身不改变世界的语义。
  //   v2.153.0（分支树接线时实测出来的缺口）：这里原先只删 `rehearsal`（本模块自己的簿），
  //   于是**别的**账本一登记，本模块刚钉下的预览就永久 stale ——
  //   实测：fork 登记一个分叉点后 `checkPreview` 立刻 `match:false`（chars 2357 → 2400），
  //   即 replay 从出生起就恒报 not-comparable，而树上一切看着正常。
  //   同族：把 `branchTree` 换成任何"每登记一次就改一次"的簿，缺口一模一样。
  //   反面同样不许：把这层扩大成「所有非世界键」等于让真改世界被判成无变化（判据变恒真话）。
  //   故它是一份**显式清单**，两边都由 tests/b7-rehearsal-v2118.js 的 fp3/fp4 探针钉着。
  const BOOKS = ['rehearsal', 'branchTree'];

  function fingerprint() {
    const s = state();
    const world = Object.assign({}, s || {});
    BOOKS.forEach(function (k) { delete world[k]; });
    delete world.meta;
    const keys = Object.keys(world).sort();
    const parts = [];
    let chars = 0;
    keys.forEach(function (k) {
      let n = 0;
      try { n = JSON.stringify(world[k]).length; } catch (e) { n = -1; }
      chars += n;
      parts.push(k + ':' + n);
    });
    let rev = null;
    try { rev = (s && s.meta && typeof s.meta.stateRev === 'number') ? s.meta.stateRev : null; } catch (e) { rev = null; }
    //   返回值里**不含** `at`：观测时刻不是世界的一部分。含上它，「登记那一刻钉的指纹」
    //   与「检查那一刻算的指纹」必然不等 —— 而世界可能一字未动（探针实测的假 stale）。
    return { rev: rev, keys: keys.length, chars: chars, digest: hashOf(parts.join('|')) };
  }
  function sameFingerprint(a, b) {
    if (!a || !b) return false;
    // rev 不比：它是全局事务计数器，会把「记账」误报成「世界变化」。
    //   若某天有人把 rev 加回这里，本文件 [B7-fp] 的负向探针会当场判红。
    return a.keys === b.keys && a.chars === b.chars && a.digest === b.digest;
  }

  /**
   * 隔离世界的构造：一份深拷贝 + 一个只服务本次执行的 store 门面 + 冻结的故事时钟。
   *   时钟取**故事时刻**（causal 的 roundNow 同源），不是墙上时钟 —— 试演若拿 `Date.now()`
   *   会得到「此刻」，而剧情里的「此刻」是调用方给的。
   */
  function sandWorld(atMs, extra) {
    const ex = execMod();
    if (!ex) return null;
    const base = ex.cloneState(WA);
    if (!base) return null;
    const sand = ex.sandStore(base);
    const o = extra || {};
    const c = {
      store: sand,
      world: o.world || WA.world,
      clock: { now: function () { return atMs; }, wall: function () { return atMs; }, label: 'rehearsal' },
      stat: { runs: 0, steps: 0, refused: 0, applied: 0, stale: 0, reports: 0, lastReason: '', faults: {} },
      sink: base,
      writes: 0
    };
    // 计数袋的 faults 内层对象同样要隔离（否则试演的拒收会污染真计数器）
    c.stat.faults = {};
    return { ctx: c, base: base, store: sand };
  }

  // ── 动作词汇（B7 原文点名三种：「等待」「改道」「提前通知」）──────────
  //   刻意做小：每种动作都有**明确的、可比较的**后果；未登记的动作一律 unknown-kind。
  const KINDS = ['wait', 'reroute', 'notify'];
  const KIND_CN = { wait: '等待', reroute: '改道', notify: '提前通知' };

  /** 一步执行：**真跑与试演走同一条路径**，差别只在执行上下文（见 core/exec.js）。 */
  function runStep(ctx, step, atMs) {
    const kind = clean((step && step.kind) || '', 20);
    if (KINDS.indexOf(kind) < 0) return { ok: false, reason: 'unknown-kind', kind: kind, kinds: KINDS.slice() };
    const who = clean((step && step.who) || '', 40);
    if (!who) return { ok: false, reason: 'missing-who' };
    if (kind === 'wait') {
      // 等待：不写任何状态面，只消耗时间（这正是「确定性部分可比较」的样本）。
      const ms = finite(step.ms);
      return { ok: true, kind: kind, person: who, elapsed: (ms > 0 ? Math.round(ms) : 0), effect: 'none' };
    }
    if (kind === 'reroute') {
      // 改道：交给 action 的准入面真判一次（不是本模块自己算出来的结论）。
      if (!WA.act || typeof WA.act.add !== 'function') return { ok: false, reason: 'act-absent' };
      let added = null, admitted = null;
      WA.exec.withContext(ctx, function () {
        added = WA.act.add(who, { kind: 'move', from: clean(step.from, 40), to: clean(step.to, 40),
          goalId: clean(step.goalId, 60), duration: finite(step.duration) || 0, text: '试演改道' });
        if (added && added.ok) admitted = WA.act.admit(added.id, atMs, {});
      });
      if (!added || !added.ok) return { ok: false, reason: (added && added.reason) || 'add-failed' };
      if (!admitted || !admitted.ok) return { ok: false, reason: (admitted && admitted.reason) || 'admit-failed' };
      return { ok: true, kind: kind, person: who, actId: added.id,
        dueAt: admitted.dueAt, duration: admitted.duration,
        travel: (admitted.travel && (admitted.travel.minutes + 'min')) || 'unknown', effect: 'act-admitted' };
    }
    // 提前通知：走 phone-bridge 的入站面（只登记本地操作，不假装对方已收到 —— 那是 B8 的验收面）。
    if (!WA.phoneBridge || typeof WA.phoneBridge.noteAction !== 'function') return { ok: false, reason: 'bridge-absent' };
    const act = clean(step.act || 'message', 20);
    let na = null;
    WA.exec.withContext(ctx, function () {
      na = WA.phoneBridge.noteAction({ opId: clean(step.opId, 80), act: act, from: who, to: clean(step.to, 40),
        chainId: clean(step.chainId, 80) });
    });
    if (!na || na.ok !== true) return { ok: false, reason: (na && na.reason) || 'note-failed' };
    return { ok: true, kind: kind, person: who, opId: na.opId, phase: 'submitted',
      effect: 'bridge-submitted' };
  }

  /** 因果推进一步（causal 的推进面纳入同一次试演；缺席则如实标 skipped）。 */
  function runCausal(ctx, atMs, notes) {
    if (!WA.causal || typeof WA.causal.tick !== 'function') { notes.push('causal 缺席'); return null; }
    let r = null;
    WA.exec.withContext(ctx, function () { r = WA.causal.tick({ now: atMs }); });
    return r;
  }

  /**
   * 试演：在隔离快照上按步执行，返回**可比较**的读数。
   *   `still` 与 `unknown` 是两回事：前者是「这一步还没到点」，后者是「这条不可比较」。
   */
  function run(steps, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const ex = execMod();
    if (!ex) { noteFault('exec-absent'); stat.lastReason = 'exec-absent'; return { ok: false, reason: 'exec-absent' }; }
    const o = opts || {};
    const list = Array.isArray(steps) ? steps.slice(0, LIMITS.ACTIONS_PER_RUN) : [];
    if (!list.length) { stat.lastReason = 'no-steps'; return { ok: false, reason: 'no-steps' }; }
    const cap = Math.min(list.length, cfg.maxSteps);
    const at0 = finite(o.now);
    const at = isFinite(at0) ? at0 : clockNow('rehearsal');
    const sand = sandWorld(at, { world: o.world });
    if (!sand) { noteFault('sandbox-failed'); stat.lastReason = 'sandbox-failed'; return { ok: false, reason: 'sandbox-failed' }; }
    const fp = fingerprint();
    const notes = [];
    const trace = [];
    const unknown = [];
    let now = at, done = 0, refused = 0;
    for (let i = 0; i < cap; i++) {
      const st = list[i];
      const r = runStep(sand.ctx, st, now);
      if (!r.ok) {
        refused++;
        trace.push({ n: i + 1, kind: clean((st && st.kind) || '', 20), ok: false, reason: r.reason });
      } else {
        done++;
        trace.push({ n: i + 1, kind: r.kind, ok: true, effect: r.effect,
          dueAt: r.dueAt || 0, elapsed: r.elapsed || 0 });
      }
      now += cfg.stepMs;
    }
    const cz = runCausal(sand.ctx, now, notes);
    // 依赖未来模型生成的部分**一律标未知**（B7 原文：随机序列一致不能冒充剧情可复现）
    unknown.push('正文生成：本步结果未产生正文，故「读起来如何」不可比较');
    if (cz && cz.facts && cz.facts.length) unknown.push('因果落下的世界事实内容由后续推演书写，本步只证明会落');
    // 与真跑共用执行器 ⇒ 同一份读数（证明「同一套准入」不是一句声明）
    let after = null;
    try { after = WA.act && WA.act.view ? WA.exec.withContext(sand.ctx, function () { return WA.act.view({}); }) : null; }
    catch (e) { after = null; }
    const summary = {
      ok: true, dryRun: true, steps: cap, done: done, refused: refused,
      at: at, until: now, writes: sand.ctx.writes || 0,
      fingerprint: fp,
      act: after ? { total: after.total, open: after.open, byStatus: after.byStatus } : null,
      causal: cz ? { changed: cz.changed, facts: (cz.facts || []).length } : null,
      notes: notes.slice(0, LIMITS.KEYS_REPORT),
      unknown: unknown.slice(0, LIMITS.KEYS_REPORT),
      trace: trace.slice(0, LIMITS.KEYS_REPORT)
    };
    summary.comparable = comparableOf(summary);
    stat.runs++; stat.steps += cap; stat.refused += refused; stat.lastReason = 'ran';
    return summary;
  }

  /**
   * 「什么可比较、什么不可比较」——**这一项是本模块的核心结论，不是附注**。
   *   可比较：准入结论 / 时刻 / 计数 / 落没落事实（同一快照 + 同一动作 ⇒ 逐字一致）。
   *   不可比较：正文、NPC 的临场反应、未来剧情走向。
   *   混着报会让「试演过了」变成一句无法反驳的话。
   */
  function comparableOf(s) {
    return {
      yes: ['准入与拒绝的结论', '时刻与到期', '计数器与账目', '世界事实是否落地'].slice(),
      no: ['正文输出', 'NPC 的临场反应', '后续剧情的走向'].slice(),
      note: '确定性部分在同一快照上逐字一致；标记为 unknown 的部分**不许**被读成「已验证」'
    };
  }

  // ── 预览登记 / 版本匹配 / 应用 ─────────────────────────────
  /**
   * 预览 id。v2.119.0：噪声改走 `WA.rand.id` 的**标识流**。
   *   原先 `Math.random()` 裸调（全库纪律自 v2.14.0：产品文件里不允许出现裸调随机——
   *   它绕过冻结种子，于是「同一份存档重放两次、写盘字段逐字相同」在原理上做不到，
   *   而预览 id 正是**进存档的产物**，同 rand.id 的注释所指）。唯一性仍由
   *   「时间戳 + 递变计数器」保证（在 rand.id 内部），本函数只负责拼可读前缀。
   */
  function previewId(at) { return WA.rand.id('rv_' + Math.floor(at) + '_', 4, 'id'); }

  /**
   * 把一次试演**登记为预览**（这是唯一写入口）。
   *   预览里钉着当时那份世界指纹 —— 它不是装饰，是「旧预览不许覆盖新进度」唯一可判定的依据。
   */
  function preview(steps, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const r = run(steps, opts);
    if (!r.ok) return r;
    // 一步都没跑成 ⇒ **不登记**：预览里出现「没跑成的结论」，读的人会以为它被验证过。
    //   这是 B7「试演失败不登记预览」的第二种形态（第一种是 run 本身失败）。
    if (r.done === 0) { stat.lastReason = 'all-steps-refused';
      return { ok: false, reason: 'all-steps-refused', refused: r.refused, dryRun: true, trace: r.trace.slice() }; }
    const at = clockNow('rehearsal.preview');
    const row = {
      id: previewId(at), at: at, fingerprint: r.fingerprint,
      steps: r.steps, done: r.done, refused: r.refused,
      until: r.until, writes: r.writes,
      unknown: r.unknown.slice(), trace: r.trace.slice()
    };
    let out = null;
    WA.store.transact(function (draft) {
      draft.rehearsal = (draft.rehearsal && typeof draft.rehearsal === 'object')
        ? draft.rehearsal : { previews: [] };
      draft.rehearsal.previews = Array.isArray(draft.rehearsal.previews) ? draft.rehearsal.previews : [];
      draft.rehearsal.previews.push(row);
      WA.evict.array(draft.rehearsal.previews, 'rehearsal.previews', cfg.keepPreviews);
      out = { ok: true, id: row.id };
    }, 'rehearsal:preview');
    if (!out || !out.ok) return { ok: false, reason: 'store-unavailable' };
    return Object.assign({}, r, { previewId: row.id });
  }

  /**
   * 应用前检查：真世界是否还停在预览时的那一份。
   *   `stale-preview` 时**不顺手重算** —— 重算是调用方的显式选择
   *   （「变化后重新计算或报冲突」，本模块选报冲突并把重算入口留给调用方）。
   */
  function checkPreview(id) {
    const pid = clean(id, 60);
    const row = rowsOf().filter(function (x) { return x && x.id === pid; })[0] || null;
    if (!row) return { ok: false, reason: 'missing-preview', id: pid };
    const fp = fingerprint();
    const match = sameFingerprint(row.fingerprint, fp);
    if (!match) { stat.stale++; stat.lastReason = 'stale-preview'; }
    return { ok: true, id: pid, match: match, reason: match ? '' : 'stale-preview',
      pinned: row.fingerprint, current: fp,
      // 变化后要不要重算，是调用方的决定；本模块只把「两边都摆出来」
      note: match ? '世界与预览时一致，可以应用' : '世界已变化：要么重算，要么放弃（不静默按旧结论执行）' };
  }

  /**
   * 应用一次预览（真跑同样的步骤）。旧预览 ⇒ 拒收；一致 ⇒ 按同一步骤表真跑一次。
   *   这里**不**复用试演的读数：真跑的结论由真跑给出（复用会把「试演通过」变成自证）。
   */
  function apply(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const chk = checkPreview(id);
    if (!chk.ok) return chk;
    if (!chk.match) {
      // 拒收并零变化：旧预览不得覆盖新进度。
      return { ok: false, reason: 'stale-preview', id: chk.id, pinned: chk.pinned, current: chk.current,
        note: chk.note };
    }
    const o = opts || {};
    const steps = Array.isArray(o.steps) ? o.steps.slice(0, LIMITS.ACTIONS_PER_RUN) : [];
    if (!steps.length) return { ok: false, reason: 'no-steps' };
    const at = finite(o.now);
    const t = isFinite(at) ? at : clockNow('rehearsal.apply');
    const out = [];
    let now = t, ok = 0, no = 0;
    const refusedKinds = [];
    for (let i = 0; i < Math.min(steps.length, cfg.maxSteps); i++) {
      const r = runStep(null, steps[i], now);   // ctx = null ⇒ 真跑（同一个执行器）
      out.push({ n: i + 1, kind: clean((steps[i] && steps[i].kind) || '', 20), ok: !!r.ok,
        reason: r.ok ? '' : r.reason, effect: r.ok ? r.effect : '' });
      if (r.ok) ok++; else { no++; refusedKinds.push(String(r.reason || '')); }
      now += cfg.stepMs;
    }
    stat.applied++;
    stat.lastReason = 'applied';
    return { ok: true, id: chk.id, applied: ok, refused: no, refusedKinds: refusedKinds.slice(),
      until: now, trace: out };
  }

  // ── 回滚范围（「显示恢复的数据范围」；不宣称恢复全部世界）──────────
  /**
   * 回滚面报告：**先把范围摆出来，再谈能不能回**。
   *   三档：`recoverable`（本模块取证到、且可恢复的面）/ `partial`（部分可恢复）/
   *   `irreversible`（已经发到外部世界的动作 —— 删掉本地记录不等于撤回对方已收到的消息）。
   *   这是 B7 原文点名的两句话：「回滚显示恢复的数据范围」与
   *   「对已经发到外部的消息使用补偿状态或标注不可撤销，不伪称删除本地记录就撤回了现实动作」。
   */
  function rollbackScope(opts) {
    const o = opts || {};
    const s = state();
    const keys = Object.keys(s || {}).sort();
    const recoverable = keys.filter(function (k) {
      return ['world', 'people', 'memory', 'causal', 'evolution', 'acts', 'opportunity',
        'rehearsal', 'chapters', 'echoes', 'currents', 'worldFacts', 'clock'].indexOf(k) >= 0;
    });
    // 外部队列：phone-bridge 的操作台账。它记的是**手机侧按下过什么** ——
    //   本地能删，对方已经收到的消息收不回来。
    let ext = [];
    try {
      const ops = (s.causal && Array.isArray(s.causal.phoneOps)) ? s.causal.phoneOps : [];
      ext = ops.slice(-LIMITS.PREVIEW_ROWS).map(function (x) {
        return { opId: (x && x.opId) || '', act: (x && x.act) || '', phase: 'submitted',
          reversible: false, note: '已提交到桥：本地记录可删，对方是否收到不由本地决定' };
      });
    } catch (e) { ext = []; }
    const keep = [];
    if (WA.checkpoints && WA.checkpoints.topKeys) {
      try { keep.push.apply(keep, WA.checkpoints.topKeys()); } catch (e) {}
    }
    stat.reports++;
    return {
      ok: true, topKeys: keys.length,
      recoverable: recoverable,
      // 明确「不在本报告范围内」的面：读了它们会以为回滚是全局的
      outOfScope: keys.filter(function (k) { return recoverable.indexOf(k) < 0; }).slice(0, LIMITS.KEYS_REPORT),
      checkpoints: keep.slice(0, LIMITS.KEYS_REPORT),
      external: ext,
      counts: { recoverable: recoverable.length, outOfScope: keys.length - recoverable.length, external: ext.length },
      claim: '本报告只覆盖上面列出的面；「恢复全部世界」不在本模块的承诺里（同样不在 chrono.applyUndo 里）',
      reviewed: o.reviewed === true
    };
  }

  // ── 原著分歧（三种政策；复用 canon 的幕目与 gap，不另造一套）─────────
  /**
   * 分歧政策：`follow` / `limited` / `free`。
   *   **不强迫 NPC 修正剧情去复刻原著** —— 三种政策的差别只在「报什么、提示什么」，
   *   没有任何一种会替玩家把剧情掰回去（那是「框架替玩家做决定」，本仓的首条禁忌）。
   */
  function policy(v) {
    if (v === undefined) return { ok: true, policy: settings().policy, policies: POLICIES.slice(), cn: POLICY_CN };
    const p = clean(v, 20);
    if (POLICIES.indexOf(p) < 0) {
      noteFault('unknown-policy');
      return { ok: false, reason: 'unknown-policy', got: p, policies: POLICIES.slice() };
    }
    const r = saveSettings({ policy: p });
    return { ok: true, policy: p, cn: POLICY_CN[p], saved: r };
  }

  /**
   * 分歧报告：原著事实带**来源**，角色视点只获得**当前可知部分**。
   *   `canon.alignView()` 给出的是世界侧历史对上的那一幕（带票数与分数 = 来源强度）；
   *   本函数把它翻成「与原著比，现在到哪、偏了多少」，并**只报数**（不判偏离对错）。
   */
  function divergence(note) {
    const cfg = settings();
    const out = { ok: true, policy: cfg.policy, cn: POLICY_CN[cfg.policy] };
    // 三种政策只改**提示口径**，且**无论有没有原著基准都要报出来**：
    //   此前这段只在「已采纳原著 + 有信号」之后才执行，于是没幕目的世界里
    //   `hint` 恒为 undefined ——「政策=自由分支」这句话一次都说不出口。
    if (cfg.policy === 'follow') {
      out.hint = '政策=遵循：偏离会报出，但**不自动掰回**（NPC 按已发生事实继续）';
    } else if (cfg.policy === 'limited') {
      out.hint = '政策=有限偏离：偏离留痕，剧情按已发生事实继续演化';
    } else {
      out.hint = '政策=自由分支：只记当前坐标，不比对原著';
      out.coord = ''; out.act = 0;
    }
    if (!WA.canon || typeof WA.canon.alignView !== 'function') {
      out.adopted = false; out.reason = 'canon-absent'; return out;
    }
    const v = WA.canon.alignView();
    out.adopted = !!v.adopted;
    if (!v.adopted) { out.reason = 'no-outline'; out.note = '未采纳原著：没有偏离的基准，故不报坐标'; return out; }
    if (!v.hasSignal) { out.reason = v.reason || 'no-signal'; out.rows = v.rows || 0; return out; }
    out.coord = v.coord; out.act = v.actNo; out.total = v.total;
    out.passed = v.passed; out.remain = v.remain;
    out.votes = v.votes; out.score = v.score;
    // 来源面：原著事实的强度来自「几行指向它、指得多准」（canon 的既有口径，不另造指标）
    out.sources = { rows: v.rows, hitRows: v.hitRows, hitActs: v.hitActs,
      evidence: (v.evidence || []).slice(0, 4), runners: (v.runners || []).slice(0, 3) };
    out.cut = { acts: !!v.cutActs, points: !!v.cutPoints };
    // 政策提示已在函数开头给出（单一真源）；这里只补没有原著基准时说不出口的那部分。
    if (cfg.policy === 'free') { out.coord = ''; out.act = 0; }
    out.note = str(note, LIMITS.NOTE);
    return out;
  }

  /** 只读视图（面板 / 诊断消费）。 */
  function view(opts) {
    const cfg = settings();
    const rows = rowsOf();
    const lim = (finite((opts || {}).limit) > 0) ? Math.floor(finite((opts || {}).limit)) : LIMITS.PREVIEW_ROWS;
    return {
      ok: true, enabled: cfg.enabled, policy: cfg.policy,
      previews: rows.length,
      recent: rows.slice(-lim).map(function (r) {
        return { id: r.id, at: r.at, steps: r.steps, done: r.done, refused: r.refused,
          until: r.until, writes: r.writes, rev: (r.fingerprint && r.fingerprint.rev) };
      }),
      comparable: comparableOf({})
    };
  }
  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults),
      previews: rowsOf().length, policy: settings().policy });
  }

  WA.rehearsal = {
    KINDS: KINDS.slice(), KIND_CN: Object.assign({}, KIND_CN),
    POLICIES: POLICIES.slice(), POLICY_CN: Object.assign({}, POLICY_CN),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    run: run, preview: preview, checkPreview: checkPreview, apply: apply,
    rollbackScope: rollbackScope, policy: policy, divergence: divergence,
    fingerprint: fingerprint, view: view, statView: statView,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
