/**
 * WorldAxis engines/handoff-pack.js (v2.273.0) — 一键交班：把这一局的经验带走 (EXV6-9)
 *
 * ── 它治什么（缺口，探针 tools/v6probes/p_handoff.js 立据）────────────────
 *   「把这一局的设定带走、新局复原」这件事，本仓**四块材料分在四处**：
 *     · `worldBlueprint.exportBlueprint()`  → 世界结构（层 / 场景 / 保留级别）；
 *     · `rulePack.exportPack()`            → 行动规则包（**出厂 `enabled:false`**，实测
 *       直接返回 `{ok:false, reason:'disabled'}`）；
 *     · `capabilityTier.getSettings()`     → 档位 + 玩家按住的机制清单；
 *     · 题材与关键设置                      → 散在 `backstage` 的设置里。
 *   实测出厂态：`exportBlueprint()` 报 `empty-blueprint`、`exportPack()` 报 `disabled` ——
 *   也就是说**在真实冷启动现场，两条出口都答不出话**，而玩家要的是「一个包，带走」。
 *   本模块做的事：把这四块**收进一个包**，如实登记哪几块拿到了、哪几块没有，
 *   并给出一个**能复原**的编排（顺序依赖写死在读数里，不靠调用方记）。
 *
 * ── 四条不许（每条都对应一类「看起来成功」的失败）────────────────────────
 *   ① **缺块不许静默**：某一源拿不到时包照样产出，但必须带 `missing[]` 逐条说明
 *      原因（disabled / empty-blueprint / absent），并把 `complete:false` 报出来 ——
 *      「少一半的包」被当成「完整的包」是这一类最坏的结局。
 *   ② **不许替别的引擎开开关**：rulePack 出厂关着时，本模块**不**去打开它，
 *      只在建议里写「去哪一格打开」。这与「档位不是开关」同一条纪律。
 *   ③ **不许改世界**：`pack()` 是**纯读**；唯一会写的是 `restore()`，且它逐个真调
 *      各引擎的导入口并**复核读回**，部分成功就报部分成功。
 *   ④ **包要能判「还能不能复原」**：`verify()` 用各引擎的真实性校验收口
 *      （blueprint 走 `checkIntegrity`），不许只看「字段在不在」。
 *
 * ── 边界（全是否定式）────────────────────────────────────────────────
 *   · `pack()` 零 `store.transact`（不碰世界）；`restore()` 只调既有导入口；
 *   · 不新建第二套存储：包是**返回值**，落盘归各引擎自己的库（或玩家自己存文件）；
 *   · 不代替玩家做决定：`suggest()` 只排顺序与给出口。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const LS_KEY = 'worldaxis_handoff_pack_settings_v1';
  const DEF = {
    enabled: true,
    includeBlueprint: true,   // 世界结构
    includeRules: true,       // 行动规则包
    includeTier: true,        // 档位 + 按住清单
    includeTheme: true,       // 题材与关键设置
    maxNotes: 4               // 最多报几条建议
  };
  const BOUNDS = { maxNotes: [1, 10] };
  const __REG = { key: LS_KEY, def: DEF, module: 'handoffPack', bounds: BOUNDS };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const PACK_VER = 1;

  function settings() {
    if (WA.settingsBus && typeof WA.settingsBus.read === 'function') {
      const raw = WA.settingsBus.read(__REG);
      const merged = Object.assign({}, DEF, raw || {});
      return typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
    }
    return Object.assign({}, DEF);
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = typeof WA.settingsBus.normalize === 'function' ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }

  const __stat = {
    packs: 0, verifies: 0, restores: 0, missingBlocks: 0,
    lastMissing: [], lastReason: ''
  };
  /** 时间读数走统一时钟（本仓规定：产品代码零裸调 Date.now）。 */
  function nowMs() { return safe(function () { return WA.clock && typeof WA.clock.wallNow === 'function' ? WA.clock.wallNow() : null; }, null); }

  function safe(fn, fb) { try { const r = fn(); return (r === undefined) ? fb : r; } catch (e) { return fb; } }
  function str(v, max) { return String(v == null ? '' : v).slice(0, max || 48); }

  /**
   * 四块的取数器。每一块返回 `{ ok, block, why }`：
   *   · `ok:false` **不是异常**，是「这一块这次没拿到」——原因逐条带走。
   *   判据全部走各引擎的**真实读口**，本模块不复制它们的逻辑。
   */
  const BLOCKS = [
    {
      id: 'blueprint', label: '世界结构',
      take: function () {
        const B = WA.worldBlueprint;
        if (!B || typeof B.exportBlueprint !== 'function') return { ok: false, why: 'absent' };
        const r = safe(function () { return B.exportBlueprint(); }, null);
        if (!r) return { ok: false, why: 'threw' };
        if (r.ok !== true) return { ok: false, why: str(r.reason || 'not-ok', 32) };
        return { ok: true, block: r };
      },
      // 复原口：importBlueprint(pack, opt) —— 参数名以引擎实现为准（下面的 restore 用探针确认）
      restore: function (block) {
        const B = WA.worldBlueprint;
        if (!B || typeof B.importBlueprint !== 'function') return { ok: false, moved: false, why: 'absent' };
        const r = safe(function () { return B.importBlueprint(block); }, null);
        return { ok: !!(r && r.ok !== false), moved: !!(r && r.ok !== false && r.imported !== false), why: r ? str(r.reason || '', 32) : 'threw' };
      }
    },
    {
      id: 'rules', label: '行动规则包',
      take: function () {
        const R = WA.rulePack;
        if (!R || typeof R.exportPack !== 'function') return { ok: false, why: 'absent' };
        // ⚠ `rulePack.exportPack(name)` **必须带名字**：无参时它走 `find(undefined)` ⇒
        //   `not-found`，即便 `getSettings().active` 已指向一个包（实测如此）。
        //   而「交出这一局的经验」要的正是**当前生效的那个包**。故这里显式解析名字：
        //   先 active，没有则取最后一个包（最近保存的）。两处都是既有读数，不新造真源。
        const cfg = safe(function () { return R.getSettings(); }, null) || {};
        // ⚠ 判序要紧：**先看它开没开**（开着是玩家意图；关着时「去开开关」才是正确处置），
        //   再看有没有包可取。反过来的话，关着且无包时只会报 no-pack，
        //   把真正的处置动作（去开开关）盖掉 —— 首跑就是这么红的。
        if (cfg.enabled !== true) return { ok: false, why: 'disabled' };
        const list = safe(function () {
          const L = R.list();
          return (L && L.ok === true && Array.isArray(L.packs)) ? L.packs : [];
        }, []) || [];
        const name = (cfg.active && String(cfg.active).length) ? String(cfg.active)
          : (list.length ? String(list[list.length - 1].name || '') : '');
        if (!name) return { ok: false, why: 'no-pack' };
        const r = safe(function () { return R.exportPack(name); }, null);
        if (!r) return { ok: false, why: 'threw' };
        if (r.ok !== true) return { ok: false, why: str(r.reason || 'not-ok', 32) };
        return { ok: true, block: r };
      },
      restore: function (block) {
        const R = WA.rulePack;
        if (!R || typeof R.importPack !== 'function') return { ok: false, moved: false, why: 'absent' };
        const r = safe(function () { return R.importPack(block); }, null);
        return { ok: !!(r && r.ok !== false), moved: !!(r && r.ok !== false && r.applied !== false), why: r ? str(r.reason || '', 32) : 'threw' };
      }
    },
    {
      id: 'tier', label: '档位与按住清单',
      take: function () {
        const T = WA.capabilityTier;
        if (!T || typeof T.getSettings !== 'function') return { ok: false, why: 'absent' };
        const cfg = safe(function () { return T.getSettings(); }, null);
        if (!cfg || typeof cfg !== 'object') return { ok: false, why: 'unreadable' };
        return { ok: true, block: { tier: cfg.tier || null,
          granted: Array.isArray(cfg.granted) ? cfg.granted.slice() : [] } };
      },
      // 档位复原走**真接口** applyTier（setSettings 刻意不导出）。
      //   granted 不直接手写：那是模块的不变量（手写会让回滚栈误判），
      //   故复原时只切档位，按住清单如实带出供玩家核对。
      restore: function (block) {
        const T = WA.capabilityTier;
        if (!T || typeof T.applyTier !== 'function') return { ok: false, moved: false, why: 'absent' };
        if (!block || !block.tier) return { ok: false, moved: false, why: 'no-tier' };
        const r = safe(function () { return T.applyTier(block.tier); }, null);
        return { ok: !!(r && r.ok !== false), moved: !!(r && r.ok !== false), why: r ? str(r.reason || '', 32) : 'threw' };
      }
    },
    {
      id: 'theme', label: '题材与关键设置',
      take: function () {
        // 题材与关键设置的单一真源是 backstage 的设置口（theme 模块本版本无读口，探针实测）。
        const B = WA.backstage;
        if (!B || typeof B.getSettings !== 'function') return { ok: false, why: 'absent' };
        const cfg = safe(function () { return B.getSettings(); }, null);
        if (!cfg || typeof cfg !== 'object') return { ok: false, why: 'unreadable' };
        const keys = ['simulationMode', 'timePolicy', 'pulseActivity', 'npcBudget', 'autoSimulate', 'fullRules'];
        const pick = {};
        keys.forEach(function (k) { if (cfg[k] !== undefined) pick[k] = cfg[k]; });
        if (!Object.keys(pick).length) return { ok: false, why: 'no-keys' };
        return { ok: true, block: pick };
      },
      restore: function (block) {
        const B = WA.backstage;
        if (!B || typeof B.setSettings !== 'function') return { ok: false, moved: false, why: 'absent' };
        if (!block || !Object.keys(block).length) return { ok: false, moved: false, why: 'empty' };
        const r = safe(function () { return B.setSettings(Object.assign({}, block)); }, null);
        return { ok: !!(r && r.ok !== false), moved: !!(r && r.ok !== false), why: r ? str(r.reason || '', 32) : 'threw' };
      }
    }
  ];

  /**
   * 打包（**纯读**）。缺块不静默：`missing[]` 逐条带原因，`complete` 如实反映。
   * @returns {{ok:boolean, ver:number, complete:boolean, blocks:object, missing:Array, at:number}}
   */
  function pack(opts) {
    const cfg = Object.assign({}, settings(), opts || {});
    __stat.packs++;
    if (cfg.enabled !== true) {
      __stat.lastReason = 'disabled';
      return { ok: false, reason: 'disabled', ver: PACK_VER, complete: false,
        blocks: {}, missing: [], at: nowMs() };
    }
    const want = {
      blueprint: cfg.includeBlueprint !== false,
      rules: cfg.includeRules !== false,
      tier: cfg.includeTier !== false,
      theme: cfg.includeTheme !== false
    };
    const blocks = {}, missing = [];
    BLOCKS.forEach(function (b) {
      if (!want[b.id]) { missing.push({ id: b.id, label: b.label, why: 'excluded' }); return; }
      const r = safe(function () { return b.take(); }, { ok: false, why: 'threw' });
      if (r && r.ok === true) blocks[b.id] = r.block;
      else missing.push({ id: b.id, label: b.label, why: (r && r.why) ? r.why : 'unknown' });
    });
    __stat.missingBlocks += missing.length;
    __stat.lastMissing = missing.slice();
    __stat.lastReason = missing.length ? 'incomplete' : 'complete';
    const complete = missing.length === 0;
    return { ok: true, ver: PACK_VER, complete: complete, blocks: blocks,
      missing: missing, at: nowMs(),
      note: complete ? '四块齐全'
        : ('包里有 ' + missing.length + ' 块没拿到：' + missing.map(function (m) { return m.label + '(' + m.why + ')'; }).join('、')
          + ' —— 缺块的包仍然可用，但它复不出完整的一局') };
  }

  /**
   * 校验（**纯读**）：能不能用这份包复原。
   *   逐块走各引擎的**真实性校验**（blueprint 走 checkIntegrity），不只看字段在不在。
   * @returns {{ok:boolean, verdict:string, rows:Array, problems:Array}}
   */
  function verify(packObj) {
    const cfg = settings();
    __stat.verifies++;
    const rows = [], problems = [];
    const p = (packObj && typeof packObj === 'object') ? packObj : null;
    if (!p) return { ok: false, verdict: 'bad-shape', rows: [], problems: [{ why: 'not-an-object' }] };
    if (p.ver !== PACK_VER) problems.push({ id: 'ver', why: 'ver-mismatch', got: p.ver, want: PACK_VER });
    if (!p.blocks || typeof p.blocks !== 'object') return { ok: false, verdict: 'bad-shape', rows: [], problems: problems.concat([{ why: 'no-blocks' }]) };
    BLOCKS.forEach(function (b) {
      const has = Object.prototype.hasOwnProperty.call(p.blocks, b.id);
      if (!has) { rows.push({ id: b.id, label: b.label, present: false, checkable: false, ok: false }); return; }
      // 逐块真校验：blueprint 走引擎的 checkIntegrity；其余块只看「是不是对象且非空」
      //   （它们没有独立的校验口 —— 如实标 checkable:false，不假装校过）。
      if (b.id === 'blueprint') {
        const B = WA.worldBlueprint;
        const r = (B && typeof B.checkIntegrity === 'function')
          ? safe(function () { return B.checkIntegrity(p.blocks.blueprint); }, null)
          : null;
        const ok = !!(r && r.ok === true);
        rows.push({ id: b.id, label: b.label, present: true, checkable: true, ok: ok,
          problems: (r && Array.isArray(r.problems)) ? r.problems.length : null });
        if (!ok) problems.push({ id: b.id, why: 'integrity-failed',
          detail: (r && r.reason) ? str(r.reason, 32) : null });
      } else {
        const blk = p.blocks[b.id];
        const ok = !!blk && typeof blk === 'object' && Object.keys(blk).length > 0;
        rows.push({ id: b.id, label: b.label, present: true, checkable: false, ok: ok });
        if (!ok) problems.push({ id: b.id, why: 'empty-block' });
      }
    });
    const allOk = rows.every(function (r) { return r.ok === true; });
    const anyPresent = rows.some(function (r) { return r.present; });
    // ⚠ 「不可用」必须**带得走原因**：块表整个是空的时，上面那圈 forEach 只会给出
    //   四行 present:false，一条 problem 都不加 —— 于是 verdict=unusable 而 problems=[]。
    //   那等于「判了不可用但说不出为什么」，调用方拿到它无从处置（本仓纪律：
    //   拒收必须可归因）。故这里显式补一条 no-blocks。
    if (!anyPresent) problems.push({ why: 'no-blocks', detail: '包里没有任何一块' });
    const verdict = allOk && problems.length === 0 ? 'restorable'
      : (anyPresent ? 'partial' : 'unusable');
    return { ok: verdict === 'restorable', verdict: verdict, rows: rows, problems: problems,
      note: verdict === 'restorable' ? '这份包可以用它自己的导入口复原'
        : (verdict === 'partial' ? '部分块可用：缺的那几块复不出来（缺块清单见 rows）'
          : '这份包不可用（没有任何一块通过校验）') };
  }

  /**
   * 复原（**唯一会写的口**）：逐个真调各引擎导入口并复核读回；部分成功报部分成功。
   * @param {object} packObj  pack() 的产物
   * @param {object} [opt]    { only:['blueprint',...] } 只复原指定块
   */
  function restore(packObj, opt) {
    const cfg = settings();
    __stat.restores++;
    if (cfg.enabled !== true) return { ok: false, reason: 'disabled' };
    const v = verify(packObj);
    if (v.verdict === 'unusable') return { ok: false, reason: 'unusable', verify: v };
    const only = (opt && Array.isArray(opt.only) && opt.only.length) ? opt.only.slice() : null;
    const applied = [], skipped = [], failed = [];
    BLOCKS.forEach(function (b) {
      if (only && only.indexOf(b.id) < 0) { skipped.push({ id: b.id, why: 'not-selected' }); return; }
      const blk = packObj.blocks[b.id];
      if (!blk) { skipped.push({ id: b.id, why: 'missing' }); return; }
      const r = safe(function () { return b.restore(blk); }, { ok: false, moved: false, why: 'threw' });
      if (r && r.ok === true && r.moved === true) applied.push(b.id);
      else failed.push({ id: b.id, why: (r && r.why) ? r.why : 'unknown', moved: !!(r && r.moved) });
    });
    const okAll = failed.length === 0;
    return { ok: okAll, applied: applied, skipped: skipped, failed: failed,
      verify: { verdict: v.verdict },
      // 部分成功就报部分成功：不折成「已完成」，也不折成「全失败」。
      note: okAll ? ('已复原 ' + applied.length + ' 块')
        : ('部分成功：' + applied.length + ' 块已复原，' + failed.length + ' 块没成（'
          + failed.map(function (f) { return f.id + '(' + f.why + ')'; }).join('、') + '）') };
  }

  /**
   * 建议（**只排顺序 + 给出口**，不代替玩家动手）。
   *   顺序不是随意的：档位先于规则、规则先于世界结构 ——
   *   后一步的导入口依赖前一步已经开起来的机制集合。
   */
  function suggest(packObj) {
    const cfg = settings();
    const p = packObj || pack({});
    const v = verify(p);
    const rows = [];
    // 缺块：给出「去哪一格打开」，而不是替它打开
    (p.missing || []).forEach(function (m) {
      if (m.why === 'excluded') return;
      const hint = (m.why === 'disabled')
        ? (m.id === 'rules' ? '到设置页「规则包」一格把开关打开，再重新打包'
          : '到设置页把该模块打开，再重新打包')
        : (m.why === 'empty-blueprint' ? '先在「世界蓝图」里存一份蓝图（空蓝图无处可取）'
          : (m.why === 'absent' ? '该模块没装载（装载问题，不是配置问题）' : ('读不到（' + m.why + '），先修这个再打包')));
      rows.push({ code: 'missing-' + m.id, text: '缺「' + m.label + '」：' + hint });
    });
    // 复原顺序（只在包里有对应块时才排）
    const order = ['tier', 'rules', 'blueprint', 'theme'].filter(function (id) { return !!p.blocks[id]; });
    if (order.length) {
      rows.push({ code: 'restore-order', text: '复原顺序：' + order.map(function (id, i) { return (i + 1) + '.' + id; }).join(' → ')
        + '（后一步依赖前一步已生效的机制集合）' });
    }
    rows.push({ code: 'verify', text: v.note });
    const max = Math.max(1, cfg.maxNotes || DEF.maxNotes);
    return { ok: true, rows: rows.slice(0, max), total: rows.length, verdict: v.verdict };
  }

  function stat() {
    const cfg = settings();
    return {
      enabled: cfg.enabled !== false,
      include: { blueprint: cfg.includeBlueprint !== false, rules: cfg.includeRules !== false,
        tier: cfg.includeTier !== false, theme: cfg.includeTheme !== false },
      packs: __stat.packs, verifies: __stat.verifies, restores: __stat.restores,
      missingBlocks: __stat.missingBlocks, lastMissing: __stat.lastMissing.slice(),
      lastReason: __stat.lastReason,
      sources: {
        worldBlueprint: !!(WA.worldBlueprint && typeof WA.worldBlueprint.exportBlueprint === 'function'),
        rulePack: !!(WA.rulePack && typeof WA.rulePack.exportPack === 'function'),
        capabilityTier: !!(WA.capabilityTier && typeof WA.capabilityTier.getSettings === 'function'),
        backstage: !!(WA.backstage && typeof WA.backstage.getSettings === 'function')
      }
    };
  }
  function reset() {
    __stat.packs = 0; __stat.verifies = 0; __stat.restores = 0; __stat.missingBlocks = 0;
    __stat.lastMissing = []; __stat.lastReason = '';
    return { ok: true };
  }

  WA.handoffPack = {
    DEF: Object.assign({}, DEF),
    BOUNDS: BOUNDS,
    PACK_VER: PACK_VER,
    getSettings: settings,
    setSettings: saveSettings,
    pack: pack,
    verify: verify,
    restore: restore,
    suggest: suggest,
    reset: reset,
    stat: stat
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/handoff-pack.js', { kind: 'engine', ver: '2.273.0' });
  }
  if (WA.log) WA.log('info', '一键交班已加载（四块合一 + 可复原校验）');
})();