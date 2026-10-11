/**
 * WorldAxis engines/world-lab.js (v2.203.0) — E9 隔离世界实验室与反事实对比
 *
 * ── 它治什么（缺口，计划原文）──────────────────────────────────
 *   「预演与平行世界已有，缺隔离副本与差异展示。」
 *   现场确实如此：`engines/rehearsal.js` 能在一份**隔离副本**上把动作跑一遍并给出
 *   可比读数，`engines/branch-tree.js` 有 `compare`，`engines/chrono.js` 有 `simBranch`，
 *   `engines/parallel-world.js` 有快照 —— **四件都在**，但玩家要问的那句
 *   「如果我**选 A** / **选 B** / **什么都不做**，三天后差在哪」没有任何一处能答：
 *   他能做的只有「先真改世界、再自己回忆原来什么样」，而那正是不可逆的那条路。
 *
 * ── 本模块只做一件事：把「三条路径」摆在**同一份起点**上跑完，再逐项摆差异 ──
 *   · `run({a, b})`  —— 在同一份 live 世界上取起点，跑三条路径（hold / a / b）
 *   · `arms()`        —— 逐臂读数（步数 / 准入结论 / 因果落地 / 试演写入 / 不可比项）
 *   · `diff()`        —— 逐项比读数，标 `same` / `diff` / `unknown` **并按来源标注**
 *   · `discard()`     —— 丢副本（**没有残留**：副本本来就不落任何地方）
 *   · `exportAs()`    —— 把**起点世界**导出为一份真蓝图（交 E8 依赖体检核）
 *   · `catalog()` / `diagnose()` / `stat()`
 *
 * ── 边界（逐条来自计划原文）────────────────────────────────────
 *   1 **实验绝不写 live store**：本模块**零 `draft.` 赋值、零 `store.transact`、
 *     零 `localStorage` 写**；三条路径全部落在 `rehearsal.run` 的副本上
 *     （它内部是 `exec.cloneState` + `exec.sandStore` + `exec.withContext` 的 sink 路径）。
 *     并且**自证**：跑前跑后各取一次 live 摘要，`liveUnchanged` 是这两次的实测差 ——
 *     不是一句声明。观测自己一旦改动了被观测的世界，这一栏就是假的，而它可复算。
 *   2 **预演指纹缺失保持 unknown**：某臂没拿到指纹（引擎缺席 / 副本建不起来）时，
 *     差异面如实报 `unknown` —— **不冒充「相同」，也不冒充「不同」**。
 *     三条臂**全部**指纹缺失时，整次对比报 `not-comparable`（对齐 `branchTree.compare`
 *     的既有口径：没有可比性可言时不许回一个「全 same」）。
 *   3 **状态变了就重新预演**：`run` 在起点钉一份 live 指纹；`arms()` / `diff()` 每次读都
 *     当场重算 live 指纹并比对，不一致时报 `stale-lab` —— **过期实验不许被当成当前结论读**。
 *   4 **反事实结果不能回溯覆盖当前存档**：本模块**没有任何一条把副本写回 live 的路径**
 *     （没有 apply / restore / commit 一类的导出）。`discard()` 只是把内存里的读数丢掉。
 *     这一条不靠自觉：导出面上根本没有那个口，专锁按「不存在」判。
 *   5 **时光倒流不属于本项**：本模块不提供 undo / 回滚 / 倒带；差异只答「往前走三条路
 *     分别会怎样」。时间线上往回走是 `chrono.undo` 的事。
 *   6 默认关（enabled:false）；关闭后 run / exportAs 一并拒收 `disabled`。
 *   7 不重造轮子：动作词表**逐字取自** `rehearsal.KINDS`（自带副本就是第二份真源）；
 *     路径的执行面、隔离面、可比读数面**全部**是 `rehearsal.run` 的既有出口。
 *
 * ── 为什么实验记录只在内存里 ────────────────────────────────────
 *   「三条路径分别会怎样」是**一次观测**，不是世界事实、也不是配置：写进世界键会让它随存档
 *   分叉，写进设置键会让它跟着聊天走 —— 两种都不是它的性质。故本模块**不落盘**：
 *   跑完就摆在会话内存里，`discard()` 丢掉即可。要留存就把**起点世界**导出为蓝图
 *   （那是真资产，且能被 E8 体检），读数随导出体的附注一起带走。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_world_lab_settings_v1';
  const DEF = { enabled: false, maxSteps: 6, armA: '', armB: '' };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'worldLab',
    bounds: { maxSteps: [1, 12] }
  };
  const FORMAT = 1;
  const MOD_TAG = __REG.module;
  /** 三条路径的**封闭集**：hold = 什么都不做（一步「等待」，rehearsal 明说它不写任何状态面）。 */
  const ARMS = ['hold', 'a', 'b'];
  const ARM_CN = { hold: '什么都不做', a: '选 A', b: '选 B' };
  /** hold 臂的那一步：`wait` 是 rehearsal 三个动作里唯一「零状态面写入」的一个。 */
  const HOLD_STEP = { kind: 'wait', who: '世界', ms: 0 };
  // ── v2.203.0（Y9）四个常量 ─────────────────────────────────────
  /** 沙盒推进的轮数上限（**内部常量**，不进 bounds：bounds 管的是设置键，这是入参夹取）。 */
  const MAX_ROUNDS = 12;
  const DEF_SIM_ROUNDS = 3;
  /** 每一轮在沙盒里往前拨多久（内部常量：它只影响副本里的故事时钟，不影响 live）。 */
  const SIM_ROUND_MS = 60000;
  /** 与拍引擎联动时，最多往前投影几拍（**只投影、不落拍**）。 */
  const MAX_AHEAD = 12;

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    if (WA.settingsBus) {
      return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
    }
    return Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // v2.203.0（Y9）新增三栏：`sims`（沙盒推进次数）/ `adopts`（采纳次数，同时兼作 opId 序号）/
  //   `beatProbes`（拍引擎联动探测次数）。三栏都**逐处递增**，不在返回体里现算。
  const _stat = { runs: 0, arms: 0, discarded: 0, exports: 0, staleReads: 0,
    sims: 0, adopts: 0, beatProbes: 0,
    refused: 0, lastReason: '', faults: {} };
  function fault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  /** 时钟（与全仓同规：决策时钟优先，缺失时退回墙钟 —— 与 agency / rulePack 同款守卫）。 */
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'worldLab') : Date.now(); } catch (e) { return Date.now(); } }
  /** 源指纹（与 rule-pack / dep-check 同族手法：FNV-1a 取低 32 位）。 */
  function sig(s) {
    let h = 2166136261;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  // ── 动作词表：**逐字取自 rehearsal.KINDS**（不自带副本）────────────────
  /**
   * 为什么从对方读而不是自己写一份：写一份就是**第二份真源** —— rehearsal 增删一个动作，
   * 这里不会跟着动，而后果不是报错，是「实验室里能填的动作」与「试演真认的动作」悄悄分叉：
   * 填进去的步骤在跑的时候全被拒成 `unknown-kind`，而看的人只会以为「这条路径就是没效果」。
   */
  function kinds() {
    const r = WA.rehearsal;
    if (!r || !Array.isArray(r.KINDS)) return null;   // null = 读不到（**不是**空词表）
    return r.KINDS.slice();
  }
  function kindLabels() {
    const r = WA.rehearsal;
    return (r && isObj(r.KIND_CN)) ? Object.assign({}, r.KIND_CN) : {};
  }

  /**
   * 解析一条路径的动作串：每行一步，`kind|who|...`（管道分隔，与面板同族写法）。
   *   形状不对 / 动作不在词表 —— 一律在**跑之前**拒收并点名第几行（先全判再跑：
   *   半套路径跑起来会让「哪几步生效了」只能靠读 trace 猜）。
   */
  function parseSteps(text, max) {
    const K = kinds();
    if (!K) return { ok: false, reason: 'rehearsal-absent' };
    const raw = String(text == null ? '' : text);
    const lines = raw.split('\n').map(function (l) { return l.trim(); })
      .filter(function (l) { return l && l.indexOf('#') !== 0; });
    if (!lines.length) return { ok: false, reason: 'empty-path' };
    const cap = Math.max(1, num(max) || 6);
    if (lines.length > cap) {
      return { ok: false, reason: 'too-many-steps', got: lines.length, cap: cap,
        hint: '一条路径最多 ' + cap + ' 步（maxSteps 是**硬上限**，不是建议值）' };
    }
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const f = lines[i].split('|').map(function (x) { return x.trim(); });
      const kind = clean(f[0], 20);
      if (K.indexOf(kind) < 0) {
        return { ok: false, reason: 'unknown-kind', line: i + 1, got: kind, known: K.slice() };
      }
      const who = clean(f[1], 40);
      if (!who) return { ok: false, reason: 'missing-who', line: i + 1 };
      const step = { kind: kind, who: who };
      if (kind === 'wait') step.ms = num(f[2]) || 0;
      if (kind === 'reroute') { step.from = clean(f[2], 40); step.to = clean(f[3], 40); }
      if (kind === 'notify') { step.text = clean(f[2], 60); }
      out.push(step);
    }
    return { ok: true, steps: out };
  }

  // ── live 摘要（**纯读**）：实验自证与过期判定共用这一口 ────────────────
  /**
   * 起点世界的摘要：顶层键数 / 总字节 / 逐键长度指纹。
   *   为什么不用 `meta.stateRev`：那个计数器只在落盘时推进，内存里的一批改动可能还没写下去 ——
   *   拿它当「世界变没变」的判据，会把「变了两处但还没落盘」读成「没变」。
   *   `digest` 缺失（读不到 store / 序列化抛错）时如实报 `ok:false`，**不冒充一个指纹**。
   */
  function liveDigest() {
    let s = null;
    try { s = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null; }
    catch (e) { return { ok: false, why: 'store-threw' }; }
    if (!isObj(s)) return { ok: false, why: 'no-store' };
    const keys = Object.keys(s).sort();
    const parts = [];
    let chars = 0;
    for (let i = 0; i < keys.length; i++) {
      let n = 0;
      try { n = JSON.stringify(s[keys[i]]).length; } catch (e) { n = -1; }
      chars += n;
      parts.push(keys[i] + ':' + n);
    }
    return { ok: true, keys: keys.length, chars: chars, digest: sig(parts.join('|')) };
  }

  // ── 跑一次实验 ────────────────────────────────────────────────────
  let _lab = null;   // { id, at, start, arms: [...], before, after, liveUnchanged, sig }

  function stepsOfArm(id, cfg, o) {
    if (id === 'hold') return { ok: true, steps: [Object.assign({}, HOLD_STEP)] };
    if (id === 'a') return parseSteps(o.a !== undefined ? o.a : cfg.armA, cfg.maxSteps);
    return parseSteps(o.b !== undefined ? o.b : cfg.armB, cfg.maxSteps);
  }
  /**
   * 跑一次实验：三条路径落在**同一份起点**上（起点 = 跑之前那一刻的 live 世界）。
   *   每条路径各走一次 `rehearsal.run` —— 那是既有的隔离执行面（真跑与试演同一路径），
   *   本模块**不另写一套推进逻辑**（两份实现必然漂移，而漂移最难发现）。
   */
  function run(spec) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!WA.rehearsal || typeof WA.rehearsal.run !== 'function') {
      fault('rehearsal-absent'); return { ok: false, reason: 'rehearsal-absent',
        hint: '隔离执行面在 rehearsal 里 —— 它缺席时本模块**不**在 live 世界上跑实验' };
    }
    const o = (spec && typeof spec === 'object') ? spec : {};
    // 先全判形状（任一条不合格就不跑）：半套路径跑起来是最坏的那种结果。
    const parsed = {};
    for (let i = 0; i < ARMS.length; i++) {
      const p = stepsOfArm(ARMS[i], cfg, o);
      if (!p.ok) { fault(p.reason); return Object.assign({ ok: false, arm: ARMS[i], cn: ARM_CN[ARMS[i]] }, p); }
      parsed[ARMS[i]] = p.steps;
    }
    const before = liveDigest();
    const start = before.ok ? { keys: before.keys, chars: before.chars, digest: before.digest } : null;
    if (!start) { fault('no-store'); return { ok: false, reason: 'no-store' }; }
    const at = clockNow('worldLab.run');
    const rows = [];
    for (let i = 0; i < ARMS.length; i++) {
      const id = ARMS[i], steps = parsed[id];
      let r = null;
      try { r = WA.rehearsal.run(steps, {}); }
      catch (e) { r = { ok: false, reason: 'threw' }; }
      const okArm = !!(r && r.ok === true);
      if (okArm) _stat.arms++;
      rows.push({
        id: id, cn: ARM_CN[id], kind: 'path',
        steps: steps.length, stepsDeclared: steps.slice(0, 12),
        ok: okArm, reason: okArm ? '' : String((r && r.reason) || 'unknown'),
        done: okArm ? (num(r.done) || 0) : null,
        refused: okArm ? (num(r.refused) || 0) : null,
        // 试演写入数：副本上的事务计数（**不是** live 写入）。live 零写由 liveUnchanged 自证。
        writes: okArm ? (num(r.writes) || 0) : null,
        act: okArm ? (r.act || null) : null,
        causal: okArm ? (r.causal || null) : null,
        // 指纹：整臂缺席（未跑成）时**如实 null** —— 差异面据此报 unknown，不冒充「相同」。
        fingerprint: okArm ? (r.fingerprint || null) : null,
        trace: okArm ? (Array.isArray(r.trace) ? r.trace.slice(0, 8) : []) : [],
        unknown: okArm ? (Array.isArray(r.unknown) ? r.unknown.slice(0, 4) : []) : [],
        comparable: okArm ? (r.comparable || null) : null
      });
    }
    const after = liveDigest();
    const liveUnchanged = !!(before.ok && after.ok && before.digest === after.digest);
    _stat.runs++;
    _stat.lastReason = liveUnchanged ? 'ran' : 'live-changed';
    _lab = { id: WA.rand && WA.rand.id ? WA.rand.id('lab_', 4, 'id') : ('lab_' + at),
      at: at, start: start, arms: rows, before: before, after: after,
      liveUnchanged: liveUnchanged, sig: sig(JSON.stringify(rows.map(function (x) { return x.id + ':' + x.done + ':' + x.refused; }))) };
    return { ok: true, id: _lab.id, at: at, format: FORMAT,
      arms: rows.map(function (x) { return { id: x.id, cn: x.cn, ok: x.ok, reason: x.reason, done: x.done, refused: x.refused }; }),
      start: start, liveUnchanged: liveUnchanged,
      liveBefore: before.ok ? before.digest : null, liveAfter: after.ok ? after.digest : null,
      note: '三条路径跑在同一份起点上；它们**全部**落在隔离副本（rehearsal 的沙箱）里，'
        + 'live 前后摘要一致这一栏是**实测**的（不是声明）' };
  }

  /** 过期判定：起点指纹与此刻的 live 指纹不一致 ⇒ 这份实验已经不是当前结论。 */
  function staleness() {
    if (!_lab) return { ok: false, reason: 'no-lab' };
    const cur = liveDigest();
    if (!cur.ok) return { ok: false, reason: 'no-store', compared: false };
    const match = (cur.digest === _lab.start.digest);
    if (!match) { _stat.staleReads++; _stat.lastReason = 'stale-lab'; }
    return { ok: true, match: match, reason: match ? '' : 'stale-lab',
      pinned: _lab.start.digest, current: cur.digest,
      note: match ? '世界与实验起点一致，这份实验是当前结论' : '世界已变化：这份实验过期了，要读当前结论就重跑（不静默按旧结论读）' };
  }

  /** 逐臂读数（**过期一律标出来**：旧实验与当前结论在界面上必须分得开）。 */
  function arms() {
    if (!_lab) return { ok: false, reason: 'no-lab', rows: [] };
    const st = staleness();
    return { ok: true, id: _lab.id, at: _lab.at, rows: _lab.arms.map(function (x) { return Object.assign({}, x); }),
      stale: (st.ok && !st.match), staleReason: st.reason || '', start: Object.assign({}, _lab.start),
      liveUnchanged: _lab.liveUnchanged };
  }

  // ── 差异面：逐项比，标 same / diff / unknown，**按来源标注** ──────────────
  /**
   * 可比项**逐字取自各臂自己的读数**（`rehearsal.run` 的返回面），不另算一遍：
   *   · `准入与拒绝` —— done / refused 与逐步 trace 的 ok 序列
   *   · `时刻与账目` —— writes（副本上的事务计数）
   *   · `世界事实是否落地` —— causal.changed / causal.facts
   *   · `动作面` —— act.total / act.open
   * 指纹面单列：三条臂**起点的指纹必须一致**（同一起点才有可比性）；缺失即 unknown。
   */
  const DIFF_ROWS = [
    { key: 'done', label: '跑成的步数', src: 'rehearsal.run().done', pick: function (x) { return x.done; } },
    { key: 'refused', label: '被拒的步数', src: 'rehearsal.run().refused', pick: function (x) { return x.refused; } },
    { key: 'writes', label: '副本上的事务数', src: 'rehearsal.run().writes', pick: function (x) { return x.writes; } },
    { key: 'act.total', label: '行动面总条数', src: 'rehearsal.run().act.total', pick: function (x) { return x.act ? num(x.act.total) : null; } },
    { key: 'act.open', label: '行动面未结条数', src: 'rehearsal.run().act.open', pick: function (x) { return x.act ? num(x.act.open) : null; } },
    { key: 'causal.changed', label: '因果改动数', src: 'rehearsal.run().causal.changed', pick: function (x) { return x.causal ? num(x.causal.changed) : null; } },
    { key: 'causal.facts', label: '落下的世界事实数', src: 'rehearsal.run().causal.facts', pick: function (x) { return x.causal ? num(x.causal.facts) : null; } },
    { key: 'trace.denied', label: '逐步被拒的条数', src: 'rehearsal.run().trace[*].ok === false', pick: function (x) {
      return Array.isArray(x.trace) ? x.trace.filter(function (t) { return t && t.ok === false; }).length : null; } }
  ];
  function diff() {
    if (!_lab) return { ok: false, reason: 'no-lab', rows: [] };
    const st = staleness();
    const byId = {};
    _lab.arms.forEach(function (x) { byId[x.id] = x; });
    const rows = DIFF_ROWS.map(function (d) {
      const vals = {};
      let unknown = 0;
      ARMS.forEach(function (id) {
        const x = byId[id];
        const v = (x && x.ok) ? d.pick(x) : null;
        vals[id] = (v === null || v === undefined) ? null : v;
        if (vals[id] === null) unknown++;
      });
      let state;
      if (unknown === ARMS.length) state = 'unknown';
      else {
        const known = ARMS.filter(function (id) { return vals[id] !== null; }).map(function (id) { return vals[id]; });
        const allSame = known.every(function (v) { return v === known[0]; });
        state = allSame ? 'same' : 'diff';
      }
      return { key: d.key, label: d.label, src: d.src, values: vals, state: state,
        unknownArms: unknown === ARMS.length ? ARMS.slice() : (unknown ? ARMS.filter(function (id) { return vals[id] === null; }) : []) };
    });
    // 起点指纹面：三臂必须同源；全缺 ⇒ 整次对比 not-comparable（**不许**回一个「全 same」）
    const fps = ARMS.map(function (id) { const x = byId[id]; return (x && x.ok && x.fingerprint) ? x.fingerprint : null; });
    // ⚠ digest 的类型必须是 `number | string` **两种都收**：`rehearsal.fingerprint()` 用
    //   `hashOf()`（返回 32 位**数字**），而本模块自己的 `sig()` 返回十六进制字符串。
    //   上一版只收字符串 ⇒ 三臂的指纹**恒被判成缺失**，整次对比的指纹面永远是 unknown ——
    //   而「unknown」在本模块里是**合法结论**，于是这个从出生起就死的面不会报任何错。
    //   探针一跑就现形（本版实测）：fpState 恒 'unknown'，而三臂指纹其实都在。
    const digOf = function (f) {
      if (!f) return '';
      const v = f.digest;
      if (typeof v === 'string' && v) return v;
      if (typeof v === 'number' && isFinite(v)) return String(v);
      return '';
    };
    const known = fps.filter(function (f) { return digOf(f) !== ''; });
    let fpState;
    if (!known.length) fpState = 'unknown';
    else if (known.length < ARMS.length) fpState = 'partial';
    else {
      const dgs = known.map(digOf);
      fpState = dgs.every(function (d) { return d === dgs[0]; }) ? 'same' : 'diff';
    }
    const knownRows = rows.filter(function (r) { return r.state !== 'unknown'; });
    const fpOut = { state: fpState, rows: ARMS.map(function (id, i) { return { arm: id, fingerprint: fps[i] }; }) };
    if (!known.length && !knownRows.length) {
      _stat.lastReason = 'not-comparable';
      // ⚠ 早退分支的**形状必须与正常分支一致**：这里此前直接回 `fingerprints: fps`（一个数组），
      //   而正常分支回的是 `{ state, rows }` —— 同一个字段两种形状，读它的人只能靠猜。
      //   读数面（arms/diff）的形状是**接口**，不是内部细节。
      return { ok: false, reason: 'not-comparable', rows: rows, fingerprints: fpOut,
        why: '三条臂都没拿到可比读数（指纹与计数全缺）—— 没有可比性可言，不回一个「全相同」' };
    }
    _stat.lastReason = 'diffed';
    return { ok: true, id: _lab.id, at: _lab.at, arms: ARMS.slice(), armCn: Object.assign({}, ARM_CN),
      rows: rows, differing: rows.filter(function (r) { return r.state === 'diff'; }).length,
      unknownRows: rows.filter(function (r) { return r.state === 'unknown'; }).length,
      fingerprints: { state: fpState, rows: ARMS.map(function (id, i) { return { arm: id, fingerprint: fps[i] }; }) },
      liveUnchanged: _lab.liveUnchanged,
      stale: (st.ok && !st.match), staleReason: st.reason || '',
      note: 'diff 只比**各臂自己的读数**（准入 / 账目 / 事实落地），不比正文 —— '
        + '正文与 NPC 临场反应在 rehearsal 的口径里本来就是 unknown，混进差异面会让「试演过了」变成一句无法反驳的话' };
  }
  /** 读不到读数的那些**为什么**读不到（顶层口径，面板直接念它）。 */
  function unknownReasons() {
    const rows = [];
    const K = kinds();
    if (!K) rows.push({ source: 'rehearsal', why: 'engine-absent', note: '动作词表读不到 —— 路径无法解析' });
    else rows.push({ source: 'rehearsal.KINDS', why: 'ok', note: '动作词表逐字取自 rehearsal（本模块不自带副本）' });
    if (!WA.exec) rows.push({ source: 'core/exec', why: 'engine-absent', note: '隔离执行面缺席 —— 试演会以 exec-absent 拒收' });
    else rows.push({ source: 'core/exec', why: 'ok', note: '副本走 exec.cloneState / sandStore / withContext（sink 路径）' });
    if (!(WA.store && typeof WA.store.get === 'function')) rows.push({ source: 'core/store', why: 'engine-absent', note: '起点摘要读不到' });
    return rows;
  }

  // ── Y9 功能①：沙盒推进（在实验室里跑 N 轮，看世界会怎样）──────────────
  /**
   * 与 `run()`（三条路径各跑一遍、每条各起一份副本）的区别在于**累积**：
   *   这里在**同一份**副本上连着往前推 N 轮，于是第 3 轮看到的是第 1、2 轮改过的那份世界。
   *   这正是「再推几轮会怎样」与「选 A 会怎样」不是同一个问题的原因。
   *
   * 承重面**全部是既有的**：副本 = `exec.cloneState` + `exec.sandStore`，
   *   推进 = 在 `exec.withContext` 的 **sink 路径**上调 `causal.tick`（真跑与试演同一路径，
   *   差别只在上下文 —— 这正是 `core/exec.js` 存在的理由）。本模块**不另写一套推进逻辑**。
   *   为什么不用 `rehearsal.run` 来推这 N 轮：它每次调用都**新建一份副本**，
   *   连调 N 次得到的是 N 份互不相干的独立推演，而「累积」才是这一项要的东西。
   */
  function execMod() { return (WA.exec && typeof WA.exec.withContext === 'function') ? WA.exec : null; }
  /** 副本上的关键值快照（**纯读**）：因果链逐条状态 + 三处计数。 */
  function simSnapshot(state) {
    const s = isObj(state) ? state : {};
    const chains = ((s.causal || {}).chains) || [];
    const map = {};
    let expired = 0, settled = 0;
    chains.forEach(function (x) {
      if (!x || !x.id) return;
      const cell = String(x.status || '') + '/' + String(x.stage || '');
      map[x.id] = cell;
      if (x.status === 'expired') expired++;
      if (x.status === 'settled') settled++;
    });
    return { chains: map, chainCount: chains.length, expired: expired, settled: settled,
      facts: Array.isArray(s.worldFacts) ? s.worldFacts.length : 0,
      acts: (((s.acts || {}).rows) || []).length, keys: Object.keys(s).length };
  }
  /** 两快照之间的**逐项差**（每一差都带 `src` —— 报告里不许出现不可追溯的来源）。 */
  function simDiff(a, b) {
    const out = [];
    const ids = Object.keys(b.chains).concat(Object.keys(a.chains))
      .filter(function (k, i, arr) { return arr.indexOf(k) === i; }).sort();
    ids.forEach(function (id) {
      const x = a.chains[id], y = b.chains[id];
      if (x !== y) out.push({ kind: 'causal-chain', key: id, round: b.n,
        from: x || '(新)', to: y || '(无)', src: 'causal.tick() 后副本 causal.chains[].status/stage' });
    });
    [['facts', '世界事实条数', 'worldFacts.length'], ['acts', '行动面条数', 'acts.rows.length'],
      ['chainCount', '因果链条数', 'causal.chains.length'], ['expired', '失效链条数', 'causal.chains[].status'],
      ['settled', '已结算链条数', 'causal.chains[].status'], ['keys', '顶层键数', 'Object.keys(副本)']]
      .forEach(function (t) {
        if (a[t[0]] !== b[t[0]]) out.push({ kind: 'counter', key: t[0], label: t[1], round: b.n,
          from: a[t[0]], to: b[t[0]], src: t[2] });
      });
    return out;
  }
  function simRoundOf(v) {
    const n = num(v);
    if (n === null) return DEF_SIM_ROUNDS;
    return Math.max(1, Math.min(MAX_ROUNDS, Math.floor(n)));
  }
  let _sim = null;   // { id, at, rounds, start, rows, deltas, causes, before, after, liveUnchanged }
  /**
   * 沙盒推进 N 轮。`spec.rounds` 缺省 3、夹到 [1, 12]（**夹取值如实回带**，不静默）。
   *   要联动的引擎缺席时**如实拒收**，而不是在 live 世界上推一轮 ——
   *   「推演悄悄写进正史」正是这一项存在的全部理由。
   */
  function simulate(spec) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const ex = execMod();
    if (!ex) { fault('exec-absent'); return { ok: false, reason: 'exec-absent',
      hint: '隔离执行面在 core/exec.js —— 它缺席时本模块**不**在 live 世界上推演' }; }
    if (!WA.causal || typeof WA.causal.tick !== 'function') {
      fault('causal-absent'); return { ok: false, reason: 'causal-absent',
        hint: '推进面逐字取自 causal.tick（真跑与试演同一路径）—— 它缺席时本模块不自己写一套推进' };
    }
    const o = isObj(spec) ? spec : {};
    const asked = num(o.rounds);
    const rounds = simRoundOf(o.rounds);
    const before = liveDigest();
    if (!before.ok) { fault('no-store'); return { ok: false, reason: 'no-store' }; }
    const base = ex.cloneState(WA);
    if (!base) { fault('sandbox-failed'); return { ok: false, reason: 'sandbox-failed',
      hint: '深拷贝失败（循环引用等）—— 拿不到副本就不跑' }; }
    const sand = ex.sandStore(base);
    const at0 = clockNow('worldLab.simulate');
    const ctx = {
      store: sand, world: WA.world,
      clock: { now: function () { return at0; }, wall: function () { return at0; }, label: 'worldLab.simulate' },
      stat: { faults: {} }, sink: base, writes: 0
    };
    const start = simSnapshot(base);
    const rows = [], deltas = [];
    for (let i = 0; i < rounds; i++) {
      const at = at0 + (i + 1) * SIM_ROUND_MS;
      ctx.clock = { now: function () { return at; }, wall: function () { return at; }, label: 'worldLab.simulate' };
      const prev = simSnapshot(base);
      let cz = null, threw = '';
      try { cz = ex.withContext(ctx, function () { return WA.causal.tick({ now: at }); }); }
      catch (e) { cz = null; threw = String((e && e.message) || e).slice(0, 100); }
      const now = simSnapshot(base);
      // ⚠ 轮号必须**打在快照上**：`simDiff` 每条差的 `round` 逐字取自 `b.n`
      //   （报告按轮分组就靠它）。早先这里没打标 ⇒ 每条差的 round 是 undefined ⇒
      //   报告一轮都分不出来，每轮都被记成 no-change（**跑得通、答的是空话**）。
      now.n = i + 1;
      const d = simDiff(prev, now);
      d.forEach(function (x) { deltas.push(x); });
      rows.push({ n: i + 1, at: at, ok: !!cz, changed: cz ? (num(cz.changed) || 0) : null,
        expired: cz ? (num(cz.expired) || 0) : null, reason: cz ? String(cz.reason || '') : 'tick-threw',
        threw: threw, writes: ctx.writes || 0, diffs: d.length,
        chains: now.chainCount, facts: now.facts, acts: now.acts });
    }
    const after = liveDigest();
    const liveUnchanged = !!(before.ok && after.ok && before.digest === after.digest);
    _stat.sims++; _stat.lastReason = liveUnchanged ? 'simulated' : 'live-changed';
    _sim = { id: WA.rand && WA.rand.id ? WA.rand.id('sim_', 4, 'id') : ('sim_' + at0),
      at: at0, rounds: rounds, asked: (asked === null ? null : Math.floor(asked)),
      start: start, rows: rows, deltas: deltas,
      before: before, after: after, liveUnchanged: liveUnchanged,
      sig: sig(JSON.stringify(rows.map(function (x) { return x.n + ':' + x.changed + ':' + x.expired; }))) };
    return { ok: true, id: _sim.id, at: at0, rounds: rounds, askedRounds: _sim.asked,
      clamped: (asked !== null && Math.floor(asked) !== rounds),
      cap: MAX_ROUNDS, changedTotal: rows.reduce(function (a, x) { return a + (x.changed || 0); }, 0),
      diffs: deltas.length, liveUnchanged: liveUnchanged,
      liveBefore: before.ok ? before.digest : null, liveAfter: after.ok ? after.digest : null,
      rows: rows.map(function (x) { return { n: x.n, changed: x.changed, expired: x.expired, reason: x.reason, diffs: x.diffs }; }),
      note: 'N 轮推进**全部落在同一份隔离副本**上（累积）；live 前后摘要一致这一栏是实测的 —— '
        + '要把某一轮的结果变成真事，只有一条路：从报告里**采纳一条**（走 U2 的统一提交）' };
  }

  // ── Y9 功能②：结果报告（关键值变化 + 可解释的原因）────────────────────
  /**
   * 「N 轮之后差在哪、为什么」——报告把**每一处变化**拆成一条原因，每条带 `src`。
   *   无变化的轮**不编原因**：如实记 `no-change`（编一条「世界平静了下来」是文学，不是读数）。
   *   原因一律**逐字取自**副本上的实测差（`simDiff`），不是本模块的解释性推断。
   */
  function report(opt) {
    if (!_sim) { _stat.lastReason = 'no-report'; return { ok: false, reason: 'no-report', deltas: [], causes: [] }; }
    const cur = liveDigest();
    const stale = !!(cur.ok && _sim.before.ok && cur.digest !== _sim.before.digest);
    const causes = [];
    _sim.rows.forEach(function (r) {
      const mine = _sim.deltas.filter(function (d) { return d.round === r.n; });
      if (!mine.length) {
        causes.push({ round: r.n, kind: 'no-change', text: '第 ' + r.n + ' 轮没有任何关键值变化',
          src: 'causal.tick() 前后副本快照逐项比 —— 无差异', key: '' });
        return;
      }
      mine.forEach(function (d) {
        causes.push({ round: r.n, kind: d.kind, key: d.key, label: d.label || d.key,
          from: d.from, to: d.to, src: d.src,
          text: '第 ' + r.n + ' 轮：' + (d.label || d.key) + ' ' + String(d.from) + ' → ' + String(d.to) });
      });
    });
    const byKind = {};
    causes.forEach(function (c) { byKind[c.kind] = (byKind[c.kind] || 0) + 1; });
    return { ok: true, id: _sim.id, at: _sim.at, rounds: _sim.rounds,
      start: Object.assign({}, _sim.start), rows: _sim.rows.map(function (x) { return Object.assign({}, x); }),
      deltas: _sim.deltas.map(function (x) { return Object.assign({}, x); }), causes: causes,
      causeCounts: byKind, causeTotal: causes.length,
      liveUnchanged: _sim.liveUnchanged, stale: stale,
      staleReason: stale ? 'stale-report' : '',
      // 「哪几条能被采纳」= 带 key 的那几条（`no-change` 没有可落的事实，采纳它等于凭空造一件事）。
      adoptable: causes.filter(function (c) { return !!c.key; }).map(function (c, i) { return { index: i, round: c.round, key: c.key, label: c.label, src: c.src }; }),
      note: '每条原因都带来源（`src` 指向它在副本上的判据）；无变化的轮如实记 no-change，不编原因' };
  }

  // ── Y9 功能③：选择性采纳（唯一写入通道，且必须走 U2 的统一提交）────────
  /**
   * 边界原文：「实验室内的推演**绝不回写正史**（唯一写入通道是『选择性采纳』，
   *   且必须走 U2 的统一提交）」。故本口是全模块**唯一的写世界路径**，且它：
   *   · 只落**一条**世界事实（`draft.worldFacts` 追加一行）—— 「采纳一条后世界只变一条」；
   *   · 把**来源与批准点**写在那一条事实**自己身上**（不另开账本 ⇒ 不产生第二条世界变化）；
   *   · 走 `WA.commit.chain` 一次提交：回执与世界写入同一 draft（写成了世界、记不上账 ⇒ 整链中止）；
   *   · **不碰拍账**：拍号不因采纳而推进（专锁按「拍账前后逐字一致」判）；
   *   · 不回放副本：它把**报告里那一条**落成事实，而不是把推演结果整体搬到 live。
   */
  function nextOpId(tag) { _stat.adopts++; return clean(tag, 40) + ':' + clockNow('worldLab.adopt') + ':' + _stat.adopts; }
  function adopt(spec) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = isObj(spec) ? spec : {};
    if (!_sim) { fault('no-report'); return { ok: false, reason: 'no-report',
      hint: '采纳只能挑报告里的一条 —— 还没跑过沙盒推进（先按「沙盒推进」）' }; }
    const cur = liveDigest();
    if (!cur.ok || !_sim.before.ok) { fault('no-store'); return { ok: false, reason: 'no-store' }; }
    // 不能拿旧报告去写真世界：起点都对不上了，采纳的是**另一份世界的结论**。
    if (cur.digest !== _sim.before.digest) {
      fault('stale-report');
      return { ok: false, reason: 'stale-report', pinned: _sim.before.digest, current: cur.digest,
        hint: '世界在跑完沙盒之后变过了 —— 这份报告已经不是当前结论，重跑一次再采纳（不静默按旧结论写）' };
    }
    const rep = report({});
    const idx = num(o.index);
    const pool = rep.causes.filter(function (c) { return !!c.key; });
    if (idx === null || !pool[idx]) {
      fault('unknown-cause');
      return { ok: false, reason: 'unknown-cause', index: (idx === null ? null : Math.floor(idx)),
        count: pool.length, adoptable: pool.map(function (c, i) { return { index: i, key: c.key, label: c.label }; }),
        hint: 'index 指报告里**可采纳**的那几条（带 key 的）；空轮没有可落的事实，不在其列' };
    }
    const c = pool[idx];
    if (!WA.commit || typeof WA.commit.chain !== 'function') {
      fault('commit-absent');
      return { ok: false, reason: 'commit-absent',
        hint: '选择性采纳**必须**走 U2 的统一提交（core/commit.js）—— 它缺席时本模块不退回自己开事务' }; }
    // 「人批过的」标记：谁批的、什么时候、依据哪一轮 —— 逐字落在那一条事实上。
    const approvedBy = clean(o.by, 40) || 'user';
    const factKey = clean(o.factKey, 80) || ('worldLab:' + _sim.id + ':' + c.round + ':' + c.key);
    const approvedAt = clockNow('worldLab.adopt');
    const opId = clean(o.opId, 80) || nextOpId('worldLab:adopt');
    const ch = WA.commit.chain({
      opId: opId, site: 'worldLab:adopt',
      fn: function (chain, draft) {
        draft.worldFacts = Array.isArray(draft.worldFacts) ? draft.worldFacts : [];
        // 同一个事实键只在采纳时落一次：重复采纳同一条 ⇒ 整链中止（**不许**落成两条）。
        if (draft.worldFacts.some(function (w) { return w && w.key === factKey; })) {
          chain.abortWhy = 'already-adopted'; return false;
        }
        draft.worldFacts.push({
          id: 'wf_' + factKey, key: factKey, scope: 'world',
          value: c.label + '：' + String(c.from) + ' → ' + String(c.to),
          source: 'world-lab:adopted', approvedBy: approvedBy, approvedAt: approvedAt,
          opId: opId, from: { lab: _sim.id, round: c.round, key: c.key, src: c.src }
        });
        // 事实容器有界（走 evict 单一出口）—— 插入本身是第一步，故它先记账。
        WA.commit.step(null, { site: 'worldLab:adopt:fact' });
        if (WA.evict) WA.evict.array(draft.worldFacts, 'backstage.worldFacts');
        return true;
      }
    });
    if (ch.ok !== true) {
      const why = String(ch.reason || 'chain-failed');
      fault(why);
      return { ok: false, reason: why, chain: true, persisted: false, index: idx, key: c.key,
        note: '采纳未成 ⇒ 世界一格不动（事实与回执要么都在、要么都不在）' };
    }
    const after = liveDigest();
    _stat.lastReason = 'adopted';
    return { ok: true, index: idx, key: c.key, label: c.label, from: c.from, to: c.to,
      src: c.src, round: c.round, lab: _sim.id,
      approvedBy: approvedBy, approvedAt: approvedAt, opId: ch.opId,
      chain: false, persisted: true, atomic: true,
      worldBefore: _sim.before.digest, worldAfter: after.ok ? after.digest : null,
      note: '只在 worldFacts 追加**一条**事实（来源与批准点写在那一条自己身上）—— '
        + '不另开账本、不碰拍账、不回放副本' };
  }

  // ── Y9 功能④：与拍引擎联动（跑拍引擎的推演而不落拍）──────────────────
  /**
   * ⚠ 这一项的**结构缺口必须写在代码里**：拍引擎族四个文件
   *   （`beat-ledger` / `beat-report` / `beat-mask` / `beat-facade`）的写路径**一律直调
   *   `WA.store.transact`**，**没有一个走 `WA.exec`** —— 于是「把拍引擎搬进隔离副本上跑」
   *   这条路在当前结构下走不通：在副本上下文里调它们，写会落到 **live** 上。
   *   故本口给的是**当前结构下能给出的最强形态**：
   *   · 拍引擎家族**将来**若补上隔离执行口（`rehearse` / `preview` / `simulate` 任一），
   *     本口自动改用它（`mode:'sandbox'`）；现在读不到 ⇒ `mode:'projection'`；
   *   · 投影：从当前拍起，按拍账里既有的 pending 行**往前摆几拍**，逐条标 `src`；
   *   · 「不落拍」是**实测**的：调用前后读一次拍账摘要，逐字一致才算数。
   */
  const BEAT_FACES = ['beatLedger', 'beatReport', 'beatMask', 'beatFacade'];
  const BEAT_SANDBOX_MEMBERS = ['rehearse', 'preview', 'simulate'];
  function beatSandboxFace() {
    for (let i = 0; i < BEAT_FACES.length; i++) {
      const m = WA[BEAT_FACES[i]];
      if (!m) continue;
      for (let j = 0; j < BEAT_SANDBOX_MEMBERS.length; j++) {
        if (typeof m[BEAT_SANDBOX_MEMBERS[j]] === 'function') {
          return { engine: BEAT_FACES[i], member: BEAT_SANDBOX_MEMBERS[j] };
        }
      }
    }
    return null;
  }
  /** 拍账摘要（**纯读**）：不落拍的判据就是这五个数在两个时刻逐字相同。 */
  function beatDigest() {
    const L = WA.beatLedger;
    if (!L || typeof L.view !== 'function') return { ok: false, why: 'beat-ledger-absent' };
    let v = null;
    try { v = L.view(); } catch (e) { return { ok: false, why: 'view-threw' }; }
    if (!isObj(v)) return { ok: false, why: 'bad-view' };
    const rows = Array.isArray(v.rows) ? v.rows : [];
    return { ok: true, seq: num(v.seq) || 0, round: num(v.round) || 0, rows: rows.length,
      landed: rows.filter(function (r) { return r && r.status === 'landed'; }).length,
      pending: rows.filter(function (r) { return r && r.status === 'pending'; }).length,
      digest: sig(JSON.stringify(rows.map(function (r) { return (r && r.no) + ':' + (r && r.status) + ':' + (r && r.title); }))) };
  }
  function beats(spec) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const L = WA.beatLedger;
    if (!L || typeof L.view !== 'function') {
      fault('beat-ledger-absent');
      return { ok: false, reason: 'beat-ledger-absent',
        hint: '拍账是这一项的读口真源（beatLedger.view）—— 它缺席时本模块不自造一份拍序' }; }
    const o = isObj(spec) ? spec : {};
    const ahead = Math.max(1, Math.min(MAX_AHEAD, Math.floor(num(o.ahead) || 4)));
    const before = beatDigest();
    if (!before.ok) { fault(before.why); return { ok: false, reason: before.why }; }
    const face = beatSandboxFace();
    let mode = 'projection', rows = [], why = '';
    if (face) {
      // 家族补上隔离口的那天，这一支自动生效 —— 今天走不到（专锁对当前事实只判 projection）。
      mode = 'sandbox';
      let r = null;
      try { r = WA[face.engine][face.member]({ ahead: ahead }); } catch (e) { r = null; }
      if (r && Array.isArray(r.rows)) rows = r.rows.slice(0, ahead);
      else { mode = 'projection'; why = 'sandbox-face-returned-nothing'; }
    }
    if (mode === 'projection') {
      // 投影的每一行都**逐字取自拍账自己的 rows**（不猜标题、不造拍号）—— 故它是可追溯的。
      let v = null;
      try { v = L.view(); } catch (e) { v = null; }
      const all = ((v && v.rows) || []);
      const pend = all.filter(function (r) { return r && r.status === 'pending'; });
      const landedN = all.filter(function (r) { return r && r.status === 'landed'; }).length;
      rows = pend.slice(0, ahead).map(function (r, i) {
        return { no: Math.floor(num(r.no) || (landedN + i + 1)), title: clean(r.title, 60),
          status: 'projected', src: 'beatLedger.view().rows[status=pending]' };
      });
      //   一行都投影不出来时**不编拍**：如实给出「拍账空」与「有拍但没有待落的那几拍」。
      if (!rows.length) {
        rows = [];
        why = why || (all.length ? 'no-pending' : 'beat-ledger-empty');
      }
    }
    const cur = (function () {
      if (typeof L.current !== 'function') return null;
      try { const c = L.current(); return c ? { no: Math.floor(num(c.no) || 0), title: clean(c.title, 60) } : null; } catch (e) { return null; }
    })();
    const after = beatDigest();
    const ledgerUnchanged = !!(before.ok && after.ok && before.digest === after.digest);
    _stat.beatProbes++;
    _stat.lastReason = ledgerUnchanged ? 'beats-projected' : 'ledger-changed';
    return { ok: true, mode: mode, ahead: ahead, current: cur, rows: rows,
      family: BEAT_FACES.slice(),
      sandboxFace: face, sandboxMembers: BEAT_SANDBOX_MEMBERS.slice(),
      ledger: { before: before, after: after, unchanged: ledgerUnchanged,
        digestBefore: before.digest, digestAfter: after.digest },
      why: why,
      note: mode === 'projection'
        ? '拍引擎族四个文件一律直调 store.transact、**不走 exec** —— 它们跑不进隔离副本，'
          + '故本口给的是**只读投影**（从当前拍起摆出接下来的几拍），而不是「在副本上真跑拍引擎」。'
          + '「不落拍」是实测的：' + (ledgerUnchanged ? '调用前后拍账摘要逐字一致' : '**拍账被改动**（这一栏是实测差）')
        : '拍引擎族提供了隔离执行口，本口直接用它跑推演（拍账摘要前后一致同样实测）' };
  }

  /** 丢弃副本：内存读数清空。**注意**：这里没有「残留」可言 —— 本模块从未把副本落到任何地方。 */
  function discard() {
    const had = !!_lab || !!_sim;
    const id = _lab ? _lab.id : (_sim ? _sim.id : '');
    _lab = null; _sim = null;
    if (had) _stat.discarded++;
    _stat.lastReason = had ? 'discarded' : 'no-lab';
    return { ok: true, discarded: had, id: id,
      note: had ? '读数已丢；副本本来就不落任何地方，故无残留可清' : '本就没有实验可丢（**不是**「丢成功了」）' };
  }

  // ── 导出：把**起点世界**导出为一份真蓝图（交 E8 依赖体检核）────────────
  /**
   * 为什么导出的是**起点世界**而不是「跑了 A 之后的副本」：副本从来不是真世界，
   * 把它当蓝图导出，等于把一次反事实当成了一份世界结构 —— 那正是边界 4 不许的事。
   * 起点世界是真资产（蓝图引擎的既有出口），读数作为**附注**随体带走。
   * 蓝图引擎缺席时**如实拒收**，不自己拼一份「长得像蓝图」的东西出来。
   */
  function exportAs(kind) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = clean(kind, 20) || 'blueprint';
    if (k !== 'blueprint') { fault('unknown-kind'); return { ok: false, reason: 'unknown-kind', known: ['blueprint'] }; }
    const B = WA.worldBlueprint;
    if (!B || typeof B.exportBlueprint !== 'function') {
      fault('blueprint-absent');
      return { ok: false, reason: 'blueprint-absent',
        hint: '导出走 blueprint 引擎的既有读口（纯读）；它缺席时不在这里造一份「长得像蓝图」的东西' };
    }
    let bp = null;
    try { bp = B.exportBlueprint({ keep: 'roster' }); }
    catch (e) { bp = null; }
    if (!bp || bp.ok !== true) {
      fault('export-failed');
      return { ok: false, reason: 'export-failed', why: String((bp && bp.reason) || 'unknown') };
    }
    _stat.exports++; _stat.lastReason = 'exported';
    return { ok: true, kind: 'blueprint', blueprint: bp.blueprint, keys: Object.keys(bp.blueprint || {}).length,
      lab: _lab ? { id: _lab.id, at: _lab.at, start: Object.assign({}, _lab.start), liveUnchanged: _lab.liveUnchanged,
        arms: _lab.arms.map(function (x) { return { id: x.id, cn: x.cn, ok: x.ok, reason: x.reason, done: x.done, refused: x.refused }; }) } : null,
      attach: '读数作为附注随蓝图体带走（蓝图里**不含**任何一条反事实结果 —— 那份副本从来不是真世界）',
      note: '导出体是**真蓝图信封**（worldBlueprint 的既有出口），可直接交依赖体检（WA.depCheck.check）判 kind' };
  }

  /** 口径（面板念的就是这一份，不另写一遍）。 */
  function catalog() {
    const cfg = settings();
    const K = kinds();
    return {
      ok: true, format: FORMAT, module: MOD_TAG,
      arms: ARMS.map(function (id) { return { id: id, cn: ARM_CN[id] }; }),
      kindSource: 'rehearsal.KINDS（本模块**不自带副本**）',
      kinds: K ? K.slice() : null,
      kindLabels: kindLabels(),
      maxSteps: cfg.maxSteps,
      bounds: { maxSteps: [1, 12] },
      rows: DIFF_ROWS.map(function (d) { return { key: d.key, label: d.label, src: d.src }; }),
      // ── v2.203.0（Y9）四栏口径 ─────────────────────────────────
      simCap: MAX_ROUNDS, simDefault: DEF_SIM_ROUNDS,
      beatAheadCap: MAX_AHEAD, beatFamily: BEAT_FACES.slice(),
      beatSandboxMembers: BEAT_SANDBOX_MEMBERS.slice(),
      writesSingle: 'adopt',                  // 唯一写世界口
      consume: {
        simulate: '面板「沙盒推进」钮 → WA.worldLab.simulate',
        report: '面板「结果报告」钮 → WA.worldLab.report',
        adopt: '面板「采纳这一条」钮 → WA.worldLab.adopt（走 U2）',
        beats: '面板「拍引擎推演」钮 → WA.worldLab.beats'
      },
      notes: {
        noLiveWrite: '三条路径全部落在隔离副本上；本模块零 store.transact、零 draft 赋值、零 localStorage 写',
        selfProof: 'liveUnchanged 是跑前跑后两次摘要的**实测差**，不是一句声明',
        fingerprint: '指纹缺失一律 unknown —— 不冒充「相同」，也不冒充「不同」；三臂全缺时整次对比 not-comparable',
        stale: '起点指纹与此刻 live 不一致 ⇒ 这份实验过期，读它会被标 stale-lab（要当前结论就重跑）',
        noRollback: '本模块**没有任何一条把副本写回 live 的路径**（没有 apply / restore / commit）—— 反事实不回溯覆盖存档',
        // Y9：上一条**仍然成立**，但要说清它与新增的 `adopt` 的分别 ——
        //   两条边界同时为真：①副本整体不回写；②唯一写入通道是「采纳**一条**」，且走 U2。
        adoptOnly: '唯一写入通道是 `adopt`（选择性采纳**一条**）：它落的是**报告里的那一条事实**，'
          + '不是副本 —— 副本整体回写这条路仍然不存在。且它必须走 U2 的统一提交（WA.commit.chain）',
        simAccumulate: '沙盒推进在同一份副本上**累积** N 轮（不是 N 份独立推演）；live 零写同样走实测自证',
        causeSrc: '报告的每一条原因都带 `src`（指向副本上的判据）；无变化的轮如实记 no-change，不编原因',
        noBeatAdvance: '与拍引擎联动**不落拍**：拍账摘要调用前后逐字一致是实测的；'
          + '且拍引擎族当前一律直调 store.transact、不走 exec，故只能给只读投影（缺口写在代码里）',
        noRewind: '时光倒流不属于本项：这里只答「往前走三条路分别会怎样」，往回走是 chrono.undo 的事',
        simCap: '沙盒推进上限 ' + MAX_ROUNDS + ' 轮（默认 ' + DEF_SIM_ROUNDS + '）；超限**夹住并回带 clamped**，不静默截断',
        reportWhy: '报告把每一处变化拆成一条原因，逐条带 src；无变化的轮如实记 no-change',
        adoptGuard: '采纳只碰**一条**世界事实，且要过五道门（enabled / 有报告 / 起点未过期 / index 命中 / commit 在场）',
        beatGap: '拍引擎族一律直调 store.transact、不走 exec ⇒ 当前只能给只读投影；缺口写在返回体的 note 里',
        noTimer: '本模块**不注册定时器** —— 实验由调用方显式跑'
      }
    };
  }
  function diagnose() {
    const cfg = settings();
    const st = staleness();
    return {
      ok: true, enabled: !!cfg.enabled, maxSteps: cfg.maxSteps,
      hasLab: !!_lab, labId: _lab ? _lab.id : '', labAt: _lab ? _lab.at : 0,
      stale: (st.ok && !st.match), staleReason: st.reason || '',
      liveUnchanged: _lab ? _lab.liveUnchanged : null,
      arms: _lab ? _lab.arms.map(function (x) { return { id: x.id, ok: x.ok, reason: x.reason, done: x.done, refused: x.refused,
        hasFingerprint: !!x.fingerprint }; }) : [],
      deps: {
        rehearsal: !!(WA.rehearsal && typeof WA.rehearsal.run === 'function'),
        rehearsalKinds: !!kinds(),
        exec: !!(WA.exec && typeof WA.exec.cloneState === 'function'),
        store: !!(WA.store && typeof WA.store.get === 'function'),
        worldBlueprint: !!(WA.worldBlueprint && typeof WA.worldBlueprint.exportBlueprint === 'function'),
        depCheck: !!(WA.depCheck && typeof WA.depCheck.check === 'function'),
        rand: !!(WA.rand && typeof WA.rand.id === 'function'),
        // ── v2.203.0（Y9）四功能各自的门 ────────────────────────
        execCtx: !!(WA.exec && typeof WA.exec.withContext === 'function'),
        execClone: !!(WA.exec && typeof WA.exec.cloneState === 'function'),
        causalTick: !!(WA.causal && typeof WA.causal.tick === 'function'),
        commitChain: !!(WA.commit && typeof WA.commit.chain === 'function'),
        beatLedgerView: !!(WA.beatLedger && typeof WA.beatLedger.view === 'function'),
        beatSandboxFace: (function () { const x = beatSandboxFace(); return x ? (x.engine + '.' + x.member) : null; })()
      },
      y9: {
        hasSim: !!_sim, simRounds: _sim ? _sim.rounds : 0, simId: _sim ? _sim.id : '',
        deltas: _sim ? _sim.deltas.length : 0,
        verified: _sim ? (_sim.liveUnchanged === true) : null
      },
      unknowns: unknownReasons(),
      faults: Object.assign({}, _stat.faults)
    };
  }
  function statOf() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults),
      enabled: !!settings().enabled, hasLab: !!_lab,
      arms: _lab ? _lab.arms.length : 0, armIds: ARMS.slice(),
      // ── v2.203.0（Y9） ────────────────────────────────────────
      hasSim: !!_sim, simRows: _sim ? _sim.rows.length : 0,
      hasReport: !!_sim, writesSingle: 'adopt' });
  }

  // 导出面：**每一口都有真消费方**（本仓口径：无消费方不挂导出）。
  //   `run` / `arms` / `diff` / `discard` / `exportAs` → 面板「世界实验室」区块；
  //   `catalog` / `diagnose` / `stat` → 同区块口径钮 + tool-diag 的 `secWorldLab()`；
  //   `getSettings` / `setSettings` → 区块开关。
  //   ⚠ 面里**没有** apply / restore / commit 一类的口 —— 边界 4（反事实不回溯覆盖存档）
  //     是靠「那个口根本不存在」实现的，不是靠自觉。
  WA.worldLab = {
    FORMAT: FORMAT,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    catalog: catalog,
    run: run, arms: arms, diff: diff,
    staleness: staleness, discard: discard, exportAs: exportAs,
    // Y9：沙盒推进 / 结果报告 / 选择性采纳 / 拍引擎联动（消费方 = 面板同区块四枚钮）
    simulate: simulate, report: report, adopt: adopt, beats: beats,
    kinds: function () { return kinds(); },
    parseSteps: function (text, max) { return parseSteps(text, max); },
    diagnose: diagnose, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-lab.js', { kind: 'engine', ver: '2.203.0' });
})();
