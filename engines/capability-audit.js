/**
 * WorldAxis engines/capability-audit.js (v2.257.0) — 启用面可见（OPV6-2）
 *
 * ── 它治什么（现场实测）──────────────────────────────────────────────
 *   同一份实测（探针 p_defaults / p_off_classify）：179 个开关里 161 个关着，
 *   其中 95 个**有 `buildBlock`**。可玩家在界面上**看不到这件事** ——
 *   12 个设置分区 / 31 个页签里没有一张表回答「现在到底谁在跑」。
 *
 *   更要紧的是第二个问题：**关着的原因分三种，处置完全不同** ——
 *     · `default-off`   出厂就关（这是设计，玩家去档位里开）
 *     · `user-off`      玩家自己关的（这是意图，**不该**被档位擅自改回）
 *     · `no-builder`    压根没有注入面（只读/工具/存储类，开不开与正文无关）
 *   把三种并成一句「没跑」，玩家就会去开那些「开了也没用」的模块，
 *   而真正该开的那 95 个反而没人管。本模块的**全部价值**就是把这三种分开。
 *
 * ── 判据从哪来（不靠记忆，靠现场）────────────────────────────────────
 *   `user-off` 的判据是**设置键里真的写了 `enabled:false`**：
 *   直接读该引擎登记项的落盘原值（`WA.__settingsRegs` 找 key，再读 localStorage），
 *   磁盘上没有这个字段 = 玩家没表过态 = 出厂默认（`default-off`）。
 *   这一条必须绕开 `getSettings()` —— 它会把 def 合并进来，
 *   于是「没表过态」与「表过态说 false」在它眼里长得一模一样。
 *
 * ── 缝合边界（否定式）────────────────────────────────────────────────
 *   ① **纯只读**：不写设置、不写 store、不改任何引擎的开关。它回答「现在什么样」，
 *      改由 capability-tier（OPV6-1）与设置页做。故本模块 `enabled` 恒 true
 *      且不设开关（与 capability-tier 同款理由：关掉它 = 关掉唯一的诊断入口）。
 *   ② **不猜依赖**：本仓没有引擎级 `dependsOn` 声明（实测全仓零处），
 *      故不编造「依赖缺失」这一档归因 —— 编不出来就该说「不归因」，
 *      而不是拿模块名相似度凑一个理由。
 *   ③ **名字用模块自己的**：清单里出现的每个 key 都是 `WA` 上的真实命名空间，
 *      不做「英文 key → 中文名」的映射表（那表会漂移，且玩家面文案归 OPV6-8）。
 *
 * ── 消费方 ───────────────────────────────────────────────────────────
 *   · `engines/tool-diag.js` 新节 `secCapability`（维护者面逐条全表）
 *   · 概览页摘要行（OPV6-8 的输入：一句人话结论）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_capability_audit_settings_v1';
  // 只读模块：设置里只有一条「要不要在概览页显示摘要」（玩家关掉它不该影响诊断面）
  const DEF = { showSummary: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'capabilityAudit', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged));
  }

  const stat = { audits: 0, lastAt: 0, lastReason: '' };

  /** 该引擎的登记项（真源是 WA.__settingsRegs，不另存副本） */
  function regOf(ns) {
    const rows = WA.__settingsRegs || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].module === ns) return rows[i];
    }
    return null;
  }
  /**
   * 落盘原值里是否**显式写过** enabled:false。
   * 必须绕开 getSettings()（见文件头「判据从哪来」）。
   */
  function wroteFalse(ns) {
    const reg = regOf(ns);
    if (!reg || !reg.key) return false;
    let raw = null;
    try {
      const ls = (WA.mainWin || window).localStorage;
      raw = ls ? ls.getItem(reg.key) : null;
    } catch (e) {
      // v2.274.0（G16 读侧归因）：裸读点的失败分支必须**投递留痕**，否则「存储故障」
      //   与「玩家没表过态」在账上同形 —— 前者本该是可诊断的故障，后者是正常态。
      //   与 engines/history-search.js 的 noteRead 同规：只投递、不吞掉业务结论。
      try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('capabilityAudit', reg.key, e); } catch (e2) {}
      return false;
    }
    if (!raw) return false;
    let val = null;
    try { val = JSON.parse(String(raw)); } catch (e) { return false; }
    if (!val || typeof val !== 'object') return false;
    return val.enabled === false;
  }

  /** 单个引擎的形状（与 capability-tier 的 shapeOf 同判据，但**不共享实现**：
   *  两个模块分别持有自己的判据是刻意的 —— 一处改了另一处不会静默跟着错，
   *  而两者不一致会被专锁当场抓到。） */
  function shapeOf(ns) {
    const m = WA[ns];
    if (!m || typeof m !== 'object') return null;
    if (typeof m.getSettings !== 'function') return null;
    let s = null;
    try { s = m.getSettings(); } catch (e) { return null; }
    if (!s || !Object.prototype.hasOwnProperty.call(s, 'enabled')) return null;
    return { ns: ns, on: s.enabled === true, hasBuild: typeof m.buildBlock === 'function' };
  }

  /**
   * 全表盘点。返回四组清单 + 三档归因计数。
   * @returns {{ok:boolean, switches:number, mechanisms:number, running:number,
   *            dormant:number, runningRows:Array, dormantRows:Array,
   *            byReason:{defaultOff:number,userOff:number,noBuilder:number}}}
   */
  function audit() {
    stat.audits++;
    try { stat.lastAt = WA.clock ? WA.clock.wallNow() : Date.now(); } catch (e) { stat.lastAt = Date.now(); }
    const rows = [];
    Object.keys(WA).forEach(function (ns) {
      const sh = shapeOf(ns);
      if (sh) rows.push(sh);
    });
    const runningRows = [];
    const dormantRows = [];
    const byReason = { defaultOff: 0, userOff: 0, noBuilder: 0 };
    rows.forEach(function (r) {
      if (r.on) {
        // 运行中的行**不带 reason 字段**：`kind:'running'` 已经说完了这件事。
        //   为什么特意不叫 reason：本仓的第十二面拒收码门禁用 `reason:\s*'x'` 扫全仓，
        //   给它写 `reason: 'on'` 会被当成一个「新内联拒收码」报未分类 —— 状态标记与拒收码
        //   是两件事，混在一起会让那本账永远多出一条假欠账（实测本版即因此红一次）。
        runningRows.push({ ns: r.ns, kind: 'running', hasBuild: r.hasBuild });
        return;
      }
      let reason;
      if (!r.hasBuild) { reason = 'no-builder'; byReason.noBuilder++; }
      else if (wroteFalse(r.ns)) { reason = 'user-off'; byReason.userOff++; }
      else { reason = 'default-off'; byReason.defaultOff++; }
      dormantRows.push({ ns: r.ns, kind: 'dormant', hasBuild: r.hasBuild, reason: reason });
    });
    const mechanisms = rows.filter(function (r) { return r.hasBuild; });
    stat.lastReason = 'ok';
    return {
      ok: true, at: stat.lastAt,
      switches: rows.length,
      mechanisms: mechanisms.length,
      running: runningRows.length,
      dormant: dormantRows.length,
      runningRows: runningRows,
      dormantRows: dormantRows,
      byReason: byReason
    };
  }

  /** 只要「关着、但开了会有内容」的那批（OPV6-1 档位建议的输入面） */
  function dormantMechanisms() {
    const a = audit();
    return a.dormantRows.filter(function (r) { return r.reason !== 'no-builder'; })
      .map(function (r) { return r.ns; });
  }

  /**
   * 玩家面一句人话（不出现任何技术词：不写 buildBlock / 引擎 / 注入源）。
   * 这一句就是「世界跑起来了吗」的答案，与 OPV6-8 同源。
   */
  function summary() {
    const a = audit();
    const dormantWorld = a.dormantRows.filter(function (r) { return r.reason !== 'no-builder'; }).length;
    let line;
    if (a.running >= 40) line = '世界正在全力运转（' + a.running + ' 项机制在跑）';
    else if (a.running >= 15) line = '世界在动，但还有 ' + dormantWorld + ' 项可以开';
    else line = '世界只跑了最基础的部分（' + a.running + ' 项），另有 ' + dormantWorld + ' 项没开';
    return {
      ok: true, line: line, running: a.running, dormantWorld: dormantWorld,
      mechanisms: a.mechanisms, switches: a.switches,
      // 玩家自己关掉的那些**单独数出来**：它们是意图，不是欠账
      userOff: a.byReason.userOff,
      showSummary: settings().showSummary === true
    };
  }

  function statOf() { return Object.assign({}, stat); }

  WA.capabilityAudit = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    audit: audit,
    dormantMechanisms: dormantMechanisms,
    summary: summary,
    stat: statOf,
    REG: __REG
  };
})();