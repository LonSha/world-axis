/**
 * WorldAxis engines/capability-tier.js (v2.257.0) — 能力档位（OPV6-1）
 *
 * ── 它治什么（现场实测，不是推断）────────────────────────────────────
 *   本仓 v2.256.0 实测（探针 /home/user/probes/p_defaults.js 与 p_off_classify.js）：
 *     带 `enabled` 开关的引擎 **179** 个，其中**默认开启只有 18 个**；
 *     关闭的 161 个里，**95 个有 `buildBlock`**（真会进注入面的世界机制）。
 *   空世界下注入面只有 4 个源产出非空（livingWorld / healthPreflight /
 *   antiOmniscience / outputGuard）—— 玩家装好插件、填好 API、开着自动推演，
 *   拿到的世界是「18 个引擎里 5 个会出声」。
 *
 *   这不是设计上的克制，是**能力默认隐身**：V5 十九项交付物与八万行机制
 *   绝大多数躺在 `enabled:false` 后面，而界面上没有任何一处能「一键把世界打开」。
 *   设置页 12 个分区覆盖不到 179 个引擎，玩家要么逐个滚到底，要么就不开。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `applyTier('lite'|'standard'|'full')` 把一组引擎**逐个真写**
 *   （`setSettings({enabled:true})`）并**当场复核** `getSettings().enabled === true`；
 *   任何一个没生效都如实报 `partial:true` + `notEffective:[…]`，绝不报「已开启」。
 *
 *   三档的口径（都不是估算）：
 *     · lite     —— 不额外开任何东西，回到出厂 18 个（就是「我只要最稳的那套」）
 *     · standard —— 34 个高频世界机制的静态白名单（下面 TIERS.standard 逐字可数）
 *     · full     —— **运行时探测**：全部「带 `enabled` 且有 `buildBlock`」的引擎。
 *                   不写死名单，因为写死的名单在下一个引擎落地那天就开始撒谎；
 *                   实测口径与 p_off_classify.js 同源（这里是同一个判据）。
 *
 * ── 为什么本模块**不设** `enabled` 总开关（唯一一个这样的引擎）─────────
 *   它是「动作模块」：一次调用的执行者，不是持续运行的世界机制。
 *   给它加 `enabled:false` 会造出**死锁** ——「要关掉别人，先得自己是开着的」，
 *   而关掉它之后就没有任何入口能再打开档位。故本模块的设置只有 `tier` /
 *   `granted` / `history` 三个，且 `enabled` 字样在本文件的 def 里**刻意不出现**。
 *
 * ── 缝合边界（否定式，每条都有判据咬）────────────────────────────────
 *   ① **档位只做「加开」，绝不擅自关别人的东西**：`granted` 只记录**本模块开过的**
 *      引擎；切档时被关掉的，也只可能是 `granted` 里的。玩家自己手动开的引擎
 *      （不在 granted 里）一次都不会被本模块关 —— 踩这条的后果是「换个档，
 *      我自己配的东西没了」。
 *   ② **幂等**：目标集已经全开、且没有要收回的 granted ⇒ 不写盘、不计数、
 *      历史栈不入栈（`noop:true`）。重复切同档不该在回滚栈里堆 12 条一样的记录。
 *   ③ **复核优先于返回值**：`setSettings` 返回 `{ok:true}` 不等于真开 ——
 *      有些模块的 `saveSettings` 会吞掉写盘失败。故每个引擎写完都**回读**
 *      `getSettings().enabled`，读回不是 `true` 就进 `notEffective`。
 *   ④ **回滚栈只装启用面**：`history` 每行只记 `{at, from, to, granted}`，
 *      不装任何世界键、不装引擎设置副本（那是 rule-pack 的职责，各管各的）。
 *      上限 12 条，超出丢最旧一条并如实回报 `trimmed`。
 *   ⑤ **不新增拒收码**：全部复用已有见证的既有码 —— `bad-value`（档位名不认识）、
 *      `save-threw`（入栈写盘抛错）、`no-history`（回滚栈空）。新造码会稀释
 *      「一个码只有一个定义处」这条口径。
 *   ⑥ **本模块零 store 写**：启用面住在各引擎自己的设置键里，本模块只留
 *      `tier` / `granted` / `history` 三个字段在自己的键里。故不进
 *      `__BOUNDED_CAPS` / `evict` SITES 两张表（那两张管 store 骨架的有界容器）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_capability_tier_settings_v1';
  // 注意：def 里**刻意没有 enabled**（见文件头「为什么不设总开关」）。
  const DEF = { tier: 'lite', granted: [], history: [] };
  const MAX_HISTORY = 12;
  const __REG = { key: LS_KEY, def: DEF, module: 'capabilityTier', bounds: {} };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /**
   * 标准档白名单（34 个，逐字可数）。
   * 选人标准：**会让「世界自己动起来」的高频机制**，即「没有它们，世界只是背景板」。
   * 刻意不入选的：一次性工具（worldLab / rulePack / compare）、维护者面
   * （capacityAudit / perfBaseline / worldHealth / inventory）、低频玩法包
   * （contest / ruling / freight / diplomacy / commission）—— 它们各自有用，
   * 但「一上来就全开」会把注入面填成噪声（实测长局也只用到 2400 的 43%，
   * 不是预算不够，是别把预算花在暂时无关的机制上）。
   */
  const TIERS = {
    lite: [],
    standard: [
      // ── 世界自己在转 ──
      'life', 'world', 'weather', 'coordinate',
      // ── 人有情绪、有关系、有性格 ──
      'affect', 'bonds', 'fondness', 'temperament', 'moodGlide',
      // ── 有事发生、有传言、有悬案 ──
      'events', 'rumor', 'threads', 'shadow',
      // ── 因果要留得下来 ──
      'causal', 'chrono', 'longline', 'foreshadow',
      // ── 人能自己动 ──
      'act', 'plan', 'opportunity', 'org', 'intel',
      // ── 叙事纪律 ──
      'sceneSlice', 'appearance', 'reasoning', 'storyTone', 'backstageTone',
      'noesis', 'perspective',
      // ── 记忆与远方 ──
      'memoryTiers', 'dream', 'vitals', 'elsewhere', 'retrieval'
    ],
    // full 不写死名单：由 probeFull() 现场探测（口径见函数注释）。
    full: null
  };
  const TIER_NAMES = ['lite', 'standard', 'full'];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (!Array.isArray(merged.granted)) merged.granted = [];
    if (!Array.isArray(merged.history)) merged.history = [];
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged));
  }

  const stat = { applies: 0, noops: 0, turnOns: 0, turnOffs: 0, partials: 0,
    rollbacks: 0, probes: 0, badInput: 0, lastReason: '', lastTier: '', lastPartial: 0 };

  /** 单引擎是否「带 enabled + 有 buildBlock + 有写入口」——探测与复核的**同一个判据** */
  function shapeOf(key) {
    const m = WA[key];
    if (!m || typeof m !== 'object') return null;
    if (typeof m.getSettings !== 'function') return null;
    let s = null;
    try { s = m.getSettings(); } catch (e) { return null; }
    if (!s || !Object.prototype.hasOwnProperty.call(s, 'enabled')) return null;
    return {
      key: key,
      on: s.enabled === true,
      hasBuild: typeof m.buildBlock === 'function',
      hasSet: typeof m.setSettings === 'function'
    };
  }
  /** 全部带 enabled 的引擎（快照，与 p_defaults.js 同口径） */
  function allSwitches() {
    const out = [];
    Object.keys(WA).forEach(function (k) {
      const sh = shapeOf(k);
      if (sh) out.push(sh);
    });
    return out;
  }
  /**
   * 完整档的目标集：**现场探测**「带 enabled + 有 buildBlock + 有写入口」的全部引擎。
   * 不写死名单的理由：写死的那份名单在下一个引擎落地那天就开始撒谎，而撒谎的方向
   * 恰好是玩家看不见的方向（新机制默认关、档位说「已完整」）。
   * 未开与已开都返回（已开的由调用方的 toOn 过滤），故目标集不随当前开关漂移。
   */
  function probeFull() {
    const rows = allSwitches().filter(function (r) { return r.hasBuild && r.hasSet; });
    stat.probes++;
    return rows.map(function (r) { return r.key; });
  }
  /** 某档的目标 key 集（lite 为空 = 不额外开） */
  function tierKeys(name) {
    if (name === 'full') return probeFull();
    return (TIERS[name] || []).slice();
  }

  function uniq(arr) {
    const seen = {};
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach(function (k) {
      const s = String(k || '');
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    return out;
  }
  function histRows() { const s = settings(); return Array.isArray(s.history) ? s.history : []; }
  function grantedRows() { const s = settings(); return uniq(s.granted); }

  /** 单个引擎真写 + 当场复核。返回 'on' / 'already' / 'not-effective' / 'missing' */
  function turnOn(key) {
    const sh = shapeOf(key);
    if (!sh || !sh.hasSet) return 'missing';
    if (sh.on) return 'already';
    try { WA[key].setSettings({ enabled: true }); } catch (e) { return 'not-effective'; }
    const back = shapeOf(key);
    return (back && back.on) ? 'on' : 'not-effective';
  }
  /** 单个引擎真关 + 当场复核（只在收回 granted 时用 —— 见边界①） */
  function turnOff(key) {
    const sh = shapeOf(key);
    if (!sh || !sh.hasSet) return 'missing';
    if (!sh.on) return 'already';
    try { WA[key].setSettings({ enabled: false }); } catch (e) { return 'not-effective'; }
    const back = shapeOf(key);
    return (back && !back.on) ? 'off' : 'not-effective';
  }
  /**
   * 定向翻转（v2.258.0 / OPV6-3 新增的**共用入口**，不是第二份判据）。
   *
   *   为什么要有它：题材驱动启用面（`engines/theme.js`）需要「把这个引擎真开起来并
   *   当场复核」，而本文件上面那两个口自带「带 enabled + 有 setSettings + 回读确认」
   *   三条判据。若 theme 自己再写一遍 `setSettings({enabled:true})`，全仓就出现
   *   **两套「开没开成」的判据** —— 两条判据分叉时，玩家看到的永远是报「成功」的那条
   *   （本仓 v2.101.0 / v2.87.0 都栽过同一类账：读数各写一份，分叉后无人发现）。
   *   故这里**只做分派，不重复判据**：true 走 turnOn、false 走 turnOff。
   *
   *   `shapeOf` 一并导出：调用方（题材面）需要先问「这个键是不是真开关、有没有注入面」，
   *   这问句与档位面用的是**同一个函数**，故不存在两套「什么算引擎」的口径。
   */
  function flipSwitch(key, want) { return want === true ? turnOn(key) : turnOff(key); }

  /** 入栈：只装启用面（边界④）。写盘抛错如实拒收 save-threw。 */
  function pushHistory(row) {
    const cur = histRows().slice();
    cur.push(row);
    const trimmed = cur.length > MAX_HISTORY;
    const kept = trimmed ? cur.slice(-MAX_HISTORY) : cur;
    try {
      saveSettings({ history: kept });
    } catch (e) {
      stat.lastReason = 'save-threw';
      return { ok: false, reason: 'save-threw', depth: histRows().length, trimmed: false };
    }
    return { ok: true, depth: kept.length, trimmed: trimmed };
  }

  /**
   * 切档。
   * @param {string} name 'lite' | 'standard' | 'full'
   * @returns {{ok:boolean, reason?:string, tier?:string, noop?:boolean, turnedOn?:string[],
   *            turnedOff?:string[], notEffective?:string[], partial?:boolean,
   *            granted?:string[], rollbackDepth?:number, total?:number}}
   */
  function applyTier(name) {
    const nm = String(name == null ? '' : name).trim();
    if (TIER_NAMES.indexOf(nm) < 0) {
      stat.badInput++; stat.lastReason = 'bad-value';
      return { ok: false, reason: 'bad-value', known: TIER_NAMES.slice() };
    }
    stat.applies++;
    const cfg = settings();
    const from = String(cfg.tier || 'lite');
    const before = grantedRows();
    const target = tierKeys(nm);
    const targetSet = {};
    target.forEach(function (k) { targetSet[k] = true; });
    // 要收回的：此前**本模块开过**、而新档不要的（边界①：只动 granted）
    const toOff = before.filter(function (k) { return !targetSet[k]; });
    // 要开出的：目标集里当前没开的
    const toOn = target.filter(function (k) {
      const sh = shapeOf(k);
      return !!sh && sh.on !== true && sh.hasSet;
    });
    // 幂等（边界②）：无事可做 ⇒ 不写盘、不入栈、不计数
    if (!toOff.length && !toOn.length) {
      stat.noops++; stat.lastReason = 'noop'; stat.lastTier = nm;
      return { ok: true, tier: nm, noop: true, turnedOn: [], turnedOff: [],
        notEffective: [], partial: false, granted: before, rollbackDepth: histRows().length };
    }
    if (from !== nm) {
      const pushed = pushHistory({ at: clockWall(), from: from, to: nm, granted: before.slice() });
      if (!pushed.ok) return { ok: false, reason: 'save-threw', tier: from };
    }
    const notEffective = [];
    const didOff = [];
    const didOn = [];
    toOff.forEach(function (k) { const r = turnOff(k); if (r === 'off' || r === 'already') didOff.push(k); else notEffective.push(k); });
    toOn.forEach(function (k) { const r = turnOn(k); if (r === 'on' || r === 'already') didOn.push(k); else notEffective.push(k); });
    stat.turnOns += didOn.length;
    stat.turnOffs += didOff.length;
    // granted = **本模块开过的**，不是「目标集里开着的」。
    //   ⚠ 这条是实施期实测抓到的真缺陷（探针 p_audit 先照出病灶）：
    //     初版写的是 target.filter(开着) —— 于是 full 档把**出厂就开着的 5 个**
    //     也算进了 granted，切回 lite 时它们被当成「本模块开过的」关掉：
    //     实测 lite 回来的 running 是 13 而不是 18（丢了 5 个出厂机制）。
    //     判据改成「旧 granted 里仍在新档目标中的」+「本次真正由本模块打开的」。
    //     出厂默认开着的一律不进 granted ⇒ 永远不会被档位收回（边界①）。
    const keptGrant = before.filter(function (k) {
      if (!targetSet[k]) return false;
      const sh = shapeOf(k);
      return !!(sh && sh.on === true);
    });
    const stillOn = uniq(keptGrant.concat(didOn));
    const partial = notEffective.length > 0;
    if (partial) { stat.partials++; stat.lastPartial = notEffective.length; }
    let saved = null;
    try {
      saved = saveSettings({ tier: nm, granted: stillOn });
    } catch (e) { stat.lastReason = 'save-threw'; return { ok: false, reason: 'save-threw', tier: from, partial: partial, notEffective: notEffective }; }
    stat.lastReason = partial ? 'partial' : 'applied';
    stat.lastTier = nm;
    return { ok: true, tier: nm, noop: false, turnedOn: didOn, turnedOff: didOff,
      notEffective: notEffective, partial: partial, granted: stillOn,
      rollbackDepth: histRows().length, total: target.length, saved: saved };
  }

  /** 回上一档。只按栈顶那一行的 granted 恢复，不猜（边界①④）。 */
  function rollback() {
    const cur = histRows().slice();
    if (!cur.length) {
      stat.badInput++; stat.lastReason = 'no-history';
      return { ok: false, reason: 'no-history', depth: 0, cap: MAX_HISTORY };
    }
    const top = cur[cur.length - 1] || {};
    const want = uniq(top.granted);
    const wantSet = {};
    want.forEach(function (k) { wantSet[k] = true; });
    const now = grantedRows();
    const toOff = now.filter(function (k) { return !wantSet[k]; });
    const toOn = want.filter(function (k) { const sh = shapeOf(k); return !!sh && sh.on !== true && sh.hasSet; });
    const notEffective = [];
    const didOff = [];
    const didOn = [];
    toOff.forEach(function (k) { const r = turnOff(k); if (r === 'off' || r === 'already') didOff.push(k); else notEffective.push(k); });
    toOn.forEach(function (k) { const r = turnOn(k); if (r === 'on' || r === 'already') didOn.push(k); else notEffective.push(k); });
    stat.rollbacks++;
    stat.turnOns += didOn.length;
    stat.turnOffs += didOff.length;
    const back = String(top.from || 'lite');
    const stillOn = want.filter(function (k) { const sh = shapeOf(k); return !!(sh && sh.on === true); });
    try {
      saveSettings({ tier: back, granted: stillOn, history: cur.slice(0, -1) });
    } catch (e) { stat.lastReason = 'save-threw'; return { ok: false, reason: 'save-threw', tier: back }; }
    stat.lastReason = notEffective.length ? 'partial' : 'rolled-back';
    stat.lastTier = back;
    return { ok: true, tier: back, from: String(top.to || ''), turnedOn: didOn, turnedOff: didOff,
      notEffective: notEffective, partial: notEffective.length > 0, granted: stillOn,
      rollbackDepth: cur.length - 1 };
  }

  /**
   * 只读快照。**玩家面用这一份就够**：
   *   `tier` / `next`（下一档叫什么）/ `gap`（离下一档还差几个引擎）/
   *   `running`（当前真正在跑的世界机制数）/ `dormant`（有 buildBlock 却关着的数）。
   */
  function view() {
    const cfg = settings();
    const rows = allSwitches();
    const mech = rows.filter(function (r) { return r.hasBuild; });
    const running = mech.filter(function (r) { return r.on; });
    const dormant = mech.filter(function (r) { return !r.on; });
    const tier = String(cfg.tier || 'lite');
    const idx = TIER_NAMES.indexOf(tier);
    const next = idx >= 0 && idx < TIER_NAMES.length - 1 ? TIER_NAMES[idx + 1] : '';
    let gap = 0;
    if (next) {
      const nextKeys = tierKeys(next);
      const nextSet = {};
      nextKeys.forEach(function (k) { nextSet[k] = true; });
      gap = nextKeys.filter(function (k) { const sh = shapeOf(k); return !sh || sh.on !== true; }).length;
    }
    return {
      enabled: true,          // 动作模块恒可用（不是开关，是事实陈述）
      tier: tier,
      tiers: TIER_NAMES.map(function (n) {
        const ks = tierKeys(n);
        return { name: n, size: ks.length, on: ks.filter(function (k) { const sh = shapeOf(k); return !!(sh && sh.on); }).length };
      }),
      next: next, gap: gap,
      switches: rows.length,
      mechanisms: mech.length,
      running: running.length,
      dormant: dormant.length,
      granted: grantedRows(),
      rollbackDepth: histRows().length,
      rollbackCap: MAX_HISTORY
    };
  }
  /** 只读清单：谁在跑 / 谁没跑（OPV6-2 的输入面，本模块不重复造审计） */
  function list() {
    const rows = allSwitches();
    return {
      switches: rows.length,
      on: rows.filter(function (r) { return r.on; }).map(function (r) { return r.key; }),
      off: rows.filter(function (r) { return !r.on; }).map(function (r) { return r.key; }),
      offWithBlock: rows.filter(function (r) { return !r.on && r.hasBuild; }).map(function (r) { return r.key; })
    };
  }
  function statOf() { return Object.assign({}, stat); }

  WA.capabilityTier = {
    TIERS: TIERS,
    TIER_NAMES: TIER_NAMES,
    MAX_HISTORY: MAX_HISTORY,
    getSettings: settings,
    // v2.257.0 收尾：`setSettings` **刻意不导出**。
    //   为什么（不是「忘了」，是判据）：档位模块的全部写面是 `applyTier` / `rollback`，
    //   两者都做「逐引擎真写盘 → 当场回读复核 → 部分成功如实报 notEffective」。
    //   把裸 `setSettings` 放出去，外部就能直接写 `granted` / `history` 两个不变量：
    //     · 手写 `granted` ⇒ 档位以为「这些是我按住的」，回滚时会去关本该留着的机制；
    //     · 手写 `history` ⇒ 回滚栈里出现从未发生过的档位变更，`rollback` 会把世界
    //       推到一个玩家从没见过的启用面。
    //   dead-export 台账原先把这条记为 `self-only`（外部零引用）—— 本轮按「过度导出」
    //   处置：摘掉导出面，而不是给它硬塞一个调用点。同理 `probeFull` 也摘（只被
    //   本文件 `tierKeys('full')` 用）。
    applyTier: applyTier,
    rollback: rollback,
    view: view,
    list: list,
    stat: statOf,
    // v2.258.0（OPV6-3）：把「什么算引擎」与「开一个引擎并复核」这两条判据**开出导出面**。
    //   为什么这不是过度导出：题材驱动启用面（engines/theme.js）真读它们 —— 见该文件
    //   `shape()` / `flip()` 的三态转发（在场走这两个口、缺席走等价降级）。
    //   为什么不能各写一份：两条判据分叉时，玩家看到的永远是报「成功」的那一条
    //   （本仓 v2.101.0 / v2.87.0 都栽过同一类账）。
    flipSwitch: flipSwitch,
    shapeOf: shapeOf,
    REG: __REG
  };
})();
