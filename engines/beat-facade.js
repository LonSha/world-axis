/**
 * WorldAxis engines/beat-facade.js (v2.193.0) — 拍引擎家族的统一运行门面（计划 U1）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   v2.189.0 缝入的四个引擎（`beat-report` / `plan-audit` / `beat-ledger` / `gen-gate`）
 *   **已装载、已产注入块、已进诊断登记**，但没有统一运行门面 —— 下一个接线的人
 *   （面板 / 章节流程 / 生成流程）要分别读**四份启用判定**与**四份返回体形态**。
 *   实测三处不同形：
 *     · 启用态：四者都读 `settingsBus`，但 `getSettings()` 返回的键集各不相同
 *       （`strikesPerChapter` / `maxItems` / `maxRows` / `minGap` …）；
 *     · 拒收体：`reason` 之后跟的字段名各不相同 —— `allowed`（bad-verdict / bad-kind）/
 *       `wait`（too-soon / quiet-period / aftermath-wait）/ `expected`（out-of-order /
 *       beat-order-locked）/ `gate`（四道闸门）/ `at`+`was`+`now`（landed-immutable）；
 *     · 产块：只有 `beatReport` 与 `genGate` 有 `buildBlock`，
 *       而 `planAudit` / `beatLedger` 的导出面上**刻意没有**它（前者不注入、后者靠 view 面）。
 *   后果不是「读不出来」，而是**每接一个消费方就要重写一遍读法** ——
 *   而重写出来的读法必然慢慢漂开（本仓反复治过的那一类）。
 *
 * ── 本门面只做四件事，**一件判定都不做** ───────────────────────
 *   ① `status()`     —— 读四模块的启用态（只读；读不出的报 `null`，**与 `false` 分开**）；
 *   ② `run(op, ctx)` —— 按 op 把入参**原样透传**给对应引擎，再把返回体归一成一个形状；
 *   ③ `blocked()`    —— 把各引擎最近一次拒收理由汇成「本刻谁在卡」的一句话；
 *   ④ `buildBlock()` —— 编排两个**产块**引擎的注入块（另外两个没有这个口）。
 *
 * ── 边界（全是否定式，逐条对应计划 U1 原文）────────────────────
 *   1 **不新增拒收码语义**：本文件**不出现** `reason: '字面量'` 这种形态。编排层
 *     自身的失败另开 `fault` 命名空间（`facade-off` / `unknown-op` / `engine-absent` /
 *     `engine-threw`）。理由：`tests/reject-code-gate.js` 的扫描面只认内联 `reason:`
 *     字面量，而 `reason` 命名空间里的**每一个码都要有恢复动作**（U5）。把编排层的
 *     失败写进去，等于逼 U5 给「门面没开」编一句给玩家的恢复建议 —— 那正是造数据。
 *   2 **不做参数校验**：缺 round / 缺 key / 缺 need 一律由**引擎自己**拒收
 *     （引擎已有 `missing-round` / `bad-round` / `missing-key` / `missing-need` …）。
 *     门面自己再判一遍就是**两个真源**，而且门面判出来的码与引擎同形却不同源，
 *     现场将无法归因「这到底是门面拦的还是引擎拦的」。
 *   3 **不写 store**：全文零 `store.transact`、零 `store.get` 之外的读。
 *     自身开关走 `settingsBus`（那是设置面，不是世界事实面）。
 *   4 **全关即空块**：门面自身关闭 **或** 两个产块引擎都关闭时，`buildBlock()` 返回
 *     空串 —— 注入面与旧行为**逐字不变**。
 *   5 **不复用 `inject-budget` 的折叠结果做判定**：折叠是成本面，不是正确性面。
 *   6 恢复档**只读** U5 的 `WA.rejectRecovery.explain()`；该模块缺席时 `recovery`
 *     为 `null`（不假装、不自己编档）—— 这条也让 U5 的映射表第一次有产品侧真消费者。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_beat_facade_settings_v1';
  /** 门面自身开关。**默认关**（承本仓「新能力默认关」纪律）：关着时四个引擎现状一字不变。 */
  const DEF = { enabled: false };
  const __REG = { key: LS_KEY, def: DEF, module: 'beatFacade', bounds: {} };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
                          : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 家族成员（命名空间名，与 `index.js` 的 LOAD_ORDER 及 `render/inject.js` 的 ROLE 表同源）。 */
  const ENGINES = ['beatReport', 'planAudit', 'beatLedger', 'genGate'];
  /** 只有这两个**产注入块**（另两个导出面上没有 buildBlock —— 见文件头「它治什么」）。 */
  const BLOCK_ENGINES = ['beatReport', 'genGate'];

  /**
   * op → { engine, method, take }。**这张表是编排信息，不是判定语义**：
   *   它只回答「用 ctx 里的哪几个键、按什么顺序、送给哪个引擎的哪个方法」。
   *   `take` 的顺序即形参顺序；缺键时**原样传 undefined**（由引擎自己拒收 —— 边界 2）。
   */
  const OPS = {
    report:     { engine: 'beatReport', method: 'report',     take: ['rec'] },
    audit:      { engine: 'planAudit',  method: 'audit',      take: ['items'] },
    equivalent: { engine: 'planAudit',  method: 'equivalent', take: ['before', 'after'] },
    plan:       { engine: 'beatLedger', method: 'plan',       take: ['titles'] },
    land:       { engine: 'beatLedger', method: 'land',       take: ['opts'] },
    claim:      { engine: 'beatLedger', method: 'claim',      take: ['no'] },
    transition: { engine: 'beatLedger', method: 'transition', take: ['opts'] },
    gate:       { engine: 'genGate',    method: 'gate',       take: ['kind', 'ctx'] },
    record:     { engine: 'genGate',    method: 'record',     take: ['kind', 'ctx'] }
  };

  const stat = { runs: 0, oks: 0, rejects: 0, blocks: 0, faults: {}, blocked: 0, lastReason: '' };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  /** 恢复档：**只读** U5 的表；缺席即 null（不假装 —— 边界 6）。 */
  function recoveryOf(reason) {
    if (!reason) return null;
    const rr = WA.rejectRecovery;
    if (!rr || typeof rr.explain !== 'function') return null;
    try {
      const e = rr.explain(reason);
      if (!e || !e.kind) return { face: e ? e.face : 'unknown', kind: null, action: null, why: null, via: e ? e.via : null };
      return { face: e.face, kind: e.kind, action: e.action, why: e.why, via: e.via };
    } catch (err) { return null; }
  }

  /** 读一个引擎的启用态。**读不出报 null**（与 false 分开：读不出不等于关闭）。 */
  function enabledOf(ns) {
    const m = WA[ns];
    if (!m || typeof m.getSettings !== 'function') return null;
    try {
      const s = m.getSettings();
      return !!(s && s.enabled);
    } catch (e) { return null; }
  }

  function status() {
    const engines = {};
    ENGINES.forEach(function (ns) { engines[ns] = enabledOf(ns); });
    const missing = ENGINES.filter(function (ns) { return !WA[ns]; });
    const readable = ENGINES.filter(function (ns) { return engines[ns] !== null; });
    return {
      facade: !!settings().enabled,
      engines: engines,
      present: ENGINES.filter(function (ns) { return !!WA[ns]; }),
      missing: missing,
      // 全关 = **每一个都读得出且为关**（有读不出的就不算全关 —— 那是「不知道」，不是「关」）
      allOff: readable.length === ENGINES.length && ENGINES.every(function (ns) { return engines[ns] === false; }),
      anyOn: ENGINES.some(function (ns) { return engines[ns] === true; }),
      blockEngines: BLOCK_ENGINES.filter(function (ns) { return !!WA[ns]; })
    };
  }

  /**
   * 把引擎返回体**归一成一个形状**（不改一个字 —— 原体一字不改地挂在 `data` 上）。
   *   门面只补三样：`engine` / `op`（谁答的）与 `recovery`（这个码该怎么恢复，读 U5）。
   */
  function normalize(engine, op, raw) {
    const o = (raw && typeof raw === 'object') ? raw : { ok: false };
    const reason = (typeof o.reason === 'string' && o.reason) ? o.reason : null;
    return {
      ok: o.ok === true,
      engine: engine,
      op: op,
      reason: reason,                                              // 引擎的码，原样透传
      recovery: recoveryOf(reason),                                // {face,kind,action,why,via} | null
      detail: (typeof o.detail === 'string' && o.detail) ? o.detail : null,
      wait: (typeof o.wait === 'number') ? o.wait : null,           // 「还要等几轮」的公共字段
      allowed: Array.isArray(o.allowed) ? o.allowed.slice() : null, // 「白名单」的公共字段
      data: o                                                       // 原始返回体（门面不是过滤器）
    };
  }

  /**
   * 统一入口。`ctx` 按 `OPS[op].take` 取名原样透传（**不做任何校验** —— 边界 2）。
   * 编排层失败一律落 `fault`（**不进 `reason` 命名空间** —— 边界 1）。
   */
  function run(op, ctx) {
    stat.runs++;
    if (!settings().enabled) {
      noteFault('facade-off');
      return { ok: false, fault: 'facade-off', op: String(op == null ? '' : op),
        allowed: Object.keys(OPS), detail: '门面自身关闭 —— 四个引擎的现状一字不变（不代它们拒收）' };
    }
    const spec = OPS[op];
    if (!spec) {
      noteFault('unknown-op');
      return { ok: false, fault: 'unknown-op', op: String(op == null ? '' : op),
        allowed: Object.keys(OPS), detail: '未登记的操作 —— 门面不猜（也不自造 reason 码）' };
    }
    const eng = WA[spec.engine];
    if (!eng || typeof eng[spec.method] !== 'function') {
      noteFault('engine-absent');
      return { ok: false, fault: 'engine-absent', op: op, engine: spec.engine,
        detail: spec.engine + '.' + spec.method + ' 不在场' };
    }
    const c = ctx || {};
    const args = spec.take.map(function (k) { return c[k]; });
    let raw;
    try { raw = eng[spec.method].apply(eng, args); }
    catch (e) {
      noteFault('engine-threw');
      return { ok: false, fault: 'engine-threw', op: op, engine: spec.engine,
        detail: String((e && e.message) || e) };
    }
    const out = Object.assign({ fault: null }, normalize(spec.engine, op, raw));
    if (out.ok) stat.oks++; else stat.rejects++;
    if (out.reason) noteFault(out.reason);
    return out;
  }

  /** 「本刻谁在卡」——读各引擎 `stat().lastReason`（只读面），汇成一句话。 */
  function blocked() {
    if (!settings().enabled) return { ok: false, fault: 'facade-off', line: '门面自身关闭', rows: [] };
    const st = status();
    if (st.allOff) return { ok: true, line: '四道闸门全关 —— 本刻无闸门在卡（也不产生任何注入）', rows: [] };
    const rows = [];
    ENGINES.forEach(function (ns) {
      const m = WA[ns];
      if (!m || typeof m.stat !== 'function') return;
      let s = null;
      try { s = m.stat(); } catch (e) { s = null; }
      if (!s || !s.lastReason) return;
      rows.push({ engine: ns, reason: s.lastReason, recovery: recoveryOf(s.lastReason) });
    });
    if (!rows.length) return { ok: true, line: '四道闸门无一在卡', rows: [] };
    const line = '本刻在卡：' + rows.map(function (r) {
      const k = (r.recovery && r.recovery.kind) ? '（恢复档 ' + r.recovery.kind + '）' : '';
      return r.engine + ':' + r.reason + k;
    }).join(' / ');
    return { ok: true, line: line, rows: rows };
  }

  /** 只归集，不判定（`planAudit` / `beatLedger` 也各有 view，一并在场就带出）。 */
  function view() {
    const engines = {};
    ENGINES.forEach(function (ns) {
      const m = WA[ns];
      if (!m || typeof m.view !== 'function') { engines[ns] = null; return; }
      try { engines[ns] = m.view(); } catch (e) { engines[ns] = null; }
    });
    return { facade: !!settings().enabled, engines: engines };
  }

  /**
   * 编排两个产块引擎的注入块。**全关 / 全无块 ⇒ 空串**（边界 4：注入面与旧行为逐字不变）。
   *   不接 `render/inject.js`：那里已各调一次，替换会改注入面 —— 本口是给**新消费者**的。
   */
  function buildBlock() {
    if (!settings().enabled) return '';
    const parts = [];
    BLOCK_ENGINES.forEach(function (ns) {
      const m = WA[ns];
      if (!m || typeof m.buildBlock !== 'function') return;
      let b = '';
      try { b = m.buildBlock(); } catch (e) { b = ''; }
      if (b) parts.push(String(b));
    });
    if (!parts.length) return '';
    stat.blocks++;
    return parts.join('\n');
  }

  /** 诊断面：**只报读数与在场性**，不替引擎做任何判定（判据在各引擎自己的 diagnose）。 */
  function diagnose() {
    const st = status();
    const bd = blocked();
    const opsOk = Object.keys(OPS).every(function (k) {
      const s = OPS[k];
      return ENGINES.indexOf(s.engine) >= 0;
    });
    const checks = {
      facadeReadable: typeof settings().enabled === 'boolean',
      opsAllInFamily: opsOk,
      opsCount: Object.keys(OPS).length === 9,
      // 恢复档只在 U5 在场时给；缺席时为 null（不假装 —— 边界 6）。
      //   这里判的是「U5 在场时 explain 真能被调到」，**不是** `typeof !== 'function'`
      //   —— 后者恒真（缺席时 `WA.rejectRecovery` 是 undefined，取属性得到 undefined，
      //   而 `typeof undefined !== 'function'` 为真），是本仓点名过的恒真假判据。
      recoveryReadable: !WA.rejectRecovery || (function () {
        try { const e = WA.rejectRecovery.explain('disabled'); return !!(e && typeof e !== 'string'); }
        catch (err) { return false; }
      })(),
      blockEnginesKnown: BLOCK_ENGINES.every(function (ns) { return ENGINES.indexOf(ns) >= 0; }),
      enginesDeclared: ENGINES.length === 4
    };
    const failed = Object.keys(checks).filter(function (k) { return checks[k] !== true; });
    return {
      ok: failed.length === 0,
      version: '2.193.0',
      facade: st.facade,
      engines: st.engines,
      present: st.present, missing: st.missing,
      allOff: st.allOff, anyOn: st.anyOn,
      ops: Object.keys(OPS),
      blocked: bd.line,
      counts: { runs: stat.runs, oks: stat.oks, rejects: stat.rejects, blocks: stat.blocks,
        blocked: stat.blocked, faults: Object.keys(stat.faults).length },
      checks: checks,
      failed: failed
    };
  }

  WA.beatFacade = {
    ENGINES: ENGINES.slice(),
    BLOCK_ENGINES: BLOCK_ENGINES.slice(),
    OPS: Object.keys(OPS),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    status: status,
    run: run,
    blocked: blocked,
    view: view,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/beat-facade.js', { kind: 'engine', ver: '2.193.0' });
})();
