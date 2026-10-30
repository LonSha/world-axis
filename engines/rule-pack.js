/**
 * WorldAxis engines/rule-pack.js (v2.203.0) — E7 玩家自定义规则包与自动化模板
 *
 * ── 它治什么（缺口，计划原文）──────────────────────────────────
 *   「规则文本与主题模板已有，但没有玩家侧的『我的规则包』。」
 *   现场确实如此：`engines/rules.js` 有 16 条铁律与 `ORDER`，`engines/theme.js` 能把题材
 *   组合成模块集，`engines/recipe.js` 有配方与策略，`engines/preset.js` 有预设段覆写，
 *   `settingsBus` 是设置写入的单一真源 —— **四件都齐**，但玩家想「把这一局喜欢的
 *   题材 + 启用面 + 相关设置存成一套、下次一键切回来」时，手上没有任何一处能答。
 *   他能做的只有：在十七页里逐个手动重设。
 *
 * ── 本模块只做一件事：把「一组启用面 + 相关设置」变成**可命名、可切换、可搬运的包** ──
 *   · `save(name)`      —— 把**当前**规则面快照成一个命名包（启用面 ∩ 相关设置）
 *   · `apply(name)`     —— 切到某个包：**只经 settingsBus 写**，逐键失败如实报
 *   · `list()` / `get(name)` / `drop(name)`
 *   · `exportPack(name)` / `importPack(text)` —— 包的可搬运形态（带指纹与格式版本）
 *   · `template.*`      —— 白名单自动化模板（**有预算、有上限、有失败策略**）
 *   · `catalog()` / `diagnose()` / `stat()`
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────────
 *   1 默认关（enabled:false）。
 *   2 **模板不得绕过各模块的拒收与容量规则**：模板动作是**登记**，它的真正执行面是
 *     `template.run()` —— 那条路径只调**既有公开写口**，并且在写前把每个写口的拒收回执
 *     原样带回来（不回滚、不吞掉、不把拒收折成「成功但没生效」）。
 *   3 **不得引入可执行脚本**（零依赖仓库不执行用户脚本）：模板没有 `eval` / `Function` /
 *     `require` / `import` 任何一路；动作是**封闭词表**里的枚举，参数经 `inputGuard` 收口。
 *   4 **规则包只记录设置与启用面，不改世界状态**：本模块**零 `store.transact`**、
 *     零世界键写入。它的自有资产（包清单）落在**设置族**（settingsBus），与
 *     `engines/theme.js` 的题材、`engines/preset.js` 的预设同族同待遇。
 *   5 **`settingsBus` 仍是唯一写路径**：本模块不碰 `localStorage`，`apply` 走
 *     `settingsBus.saveOrThrow`，逐键结果如实回带（部分成功就是部分成功，不谎报全成）。
 *   6 **非法模板拒收且不改设置**：形状不对 / 动作不在词表 / 预算越界 / key 不在登记表
 *     —— 一律在**写盘之前**拒收，并给出是哪一条。
 *   7 **关闭后零写入**：`enabled:false` 时 save / apply / importPack / template.run
 *     全部拒收 `disabled`（不是「静默成功」）。
 *
 * ── 为什么包清单落在设置族而不是世界键 ─────────────────────────
 *   「我这一局的规则包」是**配置**，不是世界事实：切到另一段聊天时它应当跟着走
 *   （与 `theme.themes` / `preset` 的活跃预设同性质）。落进世界键会让它随存档分叉，
 *   而「同一套规则包在两个存档里长得不一样」正是这一类资产的坏形态。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_rule_pack_settings_v1';
  // v2.203.0（Y8）：新增 `history`（回滚栈，**只装规则面键值**）—— 它不是包清单的副本，
  //   而是「上一次切换之前长什么样」的一串快照；`note` 是当前活跃包的说明（人读的那一行）。
  const DEF = { enabled: false, packs: [], active: '', maxPacks: 24, maxKeys: 40, seq: 0,
    note: '', history: [] };
  /** 回滚栈上限（**内部常量**，不进 bounds）：栈是「反悔一分钟」的东西，不是档案库。 */
  const MAX_HISTORY = 12;
  const __REG = {
    key: LS_KEY, def: DEF, module: 'rulePack',
    bounds: { maxPacks: [1, 64], maxKeys: [4, 96] }
  };
  const FORMAT = 1;
  const MOD_TAG = __REG.module;
  // ── v2.217.0（拓展 N6）：**持久调度台账**（数据键，与设置键分开）─────────────
  //   为什么另开一个键而不是塞进 DEF：`DEF` 是「规则面」的容量与开关声明，而调度台账是
  //   **账**（行数随用户登记增长、要跨刷新保留已用额度）。两者同键会让
  //   「切一套规则」顺手把调度账一起改掉 —— 与 preset-world「设置键与数据键分开」同规。
  //   为什么 `optional: true`：用户没登记过调度时该键缺席是**正常状态**，
  //   不是「声明了却没人写」的幽灵键。
  const SCHED_KEY = 'worldaxis_rule_pack_schedule_v1';
  const __SCHED = { key: SCHED_KEY, def: null, module: 'rulePack', optional: true };
  const SCHED_SCHEMA = 1;
  const SCHED_CAP = 24;
  function EMPTY_SCHED() { return { version: SCHED_SCHEMA, seq: 0, updatedAt: 0, rows: [] }; }

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
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG, __SCHED]);

  const _stat = { saves: 0, applies: 0, drops: 0, exports: 0, imports: 0,
    // v2.203.0（Y8）：detects / rolls / composes / admits 四栏 —— 新增的四个功能各自有无台账，
    //   在诊断面上必须逐栏看得见（有功能没台账 = 出了事没人知道它被调过）。
    detects: 0, rolls: 0, composes: 0, admits: 0,
    // v2.264.0（OPV6-9）：幂等闸命中数 —— 「跳过了几次重复切换」必须可数，
    //   不可数等于没发生（与 detects/rolls 同一条纪律）。
    idemSkips: 0,
    templateRuns: 0, templateRefused: 0, refused: 0, lastReason: '', faults: {},
    // v2.217.0（N6）：调度面三栏 —— 登记 / 按轮次跑 / 被拒。
    //   为什么与 templateRuns 分栏：「手动试跑了几次」与「按轮次自动跑了几次」
    //   是两件事，合成一栏就再也答不出是哪一类在动。
    schedSets: 0, schedRuns: 0, schedRefused: 0 };
  function fault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  /** 源指纹（与 dep-check / blueprint / seed 同族手法：FNV-1a 取低 32 位）。 */
  function sig(s) {
    let h = 2166136261;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  // ── 「规则面」的定义：**只由既有模块的公开读口算出**，本模块不自带清单副本 ──
  /**
   * 哪些键属于「规则面」？答：**能影响规则/主题/启用面的那几个设置键**，逐项由
   *   `settingsBus` 的登记表现场筛出来，再按**模块名**归入本模块的类目。
   *   为什么不写死一张键名清单：写死就是**第二份真源** —— 下一次 theme / recipe / preset
   *   改键名时两处必然分叉，而分叉的表现是「包里少存了一键」：最坏的那种静默失效。
   *   为何按模块名筛而不是「全部设置键」：把 `perfLedger` / `store` 一类**运维设置**
   *   也打进规则包，会让「切一套规则」顺手改掉别人的性能档 —— 那不是玩家要的东西。
   */
  const MODULE_OF = ['theme', 'recipe', 'preset', 'rules', 'backstage', 'difficulty', 'storyChoice', 'rehearsal'];
  function regs() {
    const rows = WA.__settingsRegs || [];
    return rows.filter(function (r) { return r && typeof r.key === 'string' && r.key; });
  }
  /** 现场可进包的键（按登记表筛，不写死）。 */
  function packableKeys(cap) {
    const out = [];
    regs().forEach(function (r) {
      if (MODULE_OF.indexOf(String(r.module || '')) < 0) return;
      out.push({ key: r.key, module: String(r.module || '') });
    });
    return out.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); })
      .slice(0, Math.max(1, cap || 40));
  }
  /** 读某一个键的当前值（**只读**；读不到时如实返回 present:false）。 */
  function readKey(key) {
    // ⚠ 入参容错：`packableKeys()` 给的是 `{key, module}` 记录，`readKey` 要的是**键名字符串**。
    //   上一版 `keys.map(readKey)` 把记录整个传了进来 ⇒ `r.key === key` 恒 false ⇒ **每一个键
    //   都读成 key-not-registered**，于是「当前规则面」永远是空的、`save()` 永远 `empty-surface`。
    //   形态上不报错（给的是如实拒收），只是这一面从出生起就是死的 —— 探针一跑就现形。
    //   故此处**同时接受**字符串与记录（两种调用面都不再可能踩空）。
    const kk = (key && typeof key === 'object') ? key.key : key;
    const rec = regs().filter(function (r) { return r.key === kk; })[0] || null;
    if (!rec) return { key: kk, present: false, why: 'key-not-registered' };
    if (!WA.settingsBus || typeof WA.settingsBus.read !== 'function') {
      return { key: kk, present: false, why: 'settings-bus-absent' };
    }
    try {
      const v = WA.settingsBus.read(rec);
      return { key: kk, present: v !== null && v !== undefined, module: String(rec.module || ''), value: (v === undefined ? null : v) };
    } catch (e) { return { key: kk, present: false, why: 'read-threw' }; }
  }
  /** 当前启用的题材名（**读真源设置键**；未启用时给空数组，读不到时给来源标签而不是空）。 */
  function themeKeys() {
    const r = readKey('worldaxis_theme_settings_v1');
    if (!r.present) return { ok: false, source: 'worldaxis_theme_settings_v1', why: r.why || 'not-set' };
    if (!isObj(r.value)) return { ok: false, source: 'worldaxis_theme_settings_v1', why: 'bad-shape' };
    return { ok: true, source: 'worldaxis_theme_settings_v1',
      themes: Array.isArray(r.value.themes) ? r.value.themes.slice() : [] };
  }
  /** 当前规则面快照（启用面 + 相关设置）——save 与「当前面」诊断共用这一口。 */
  function surface(cap) {
    const keys = packableKeys(cap);
    const rows = keys.map(readKey);
    const live = rows.filter(function (r) { return r.present; });
    const absent = rows.filter(function (r) { return !r.present; });
    return {
      keys: keys.map(function (k) { return k.key; }),
      values: live.reduce(function (acc, r) { acc[r.key] = r.value; return acc; }, {}),
      absent: absent.map(function (r) { return { key: r.key, why: r.why || 'not-set' }; }),
      // 启用面：**逐字取自各模块自报**（本模块不解释它们的语义）。
      //   ⚠ 这三项此前写成 `X ? null : null`（两侧同值的三元）—— 那是一段**恒为 null 的死代码**：
      //     读数栏位永远空，而空栏在界面上与「还没启用任何题材」长得一模一样。
      //     现改为真实取用，并把「取不到」与「确实没有」分开：取不到时给来源标签，不给空。
      themes: themeKeys(),
      themeModules: (function () {
        try { return (WA.theme && typeof WA.theme.activeModules === 'function') ? WA.theme.activeModules() : null; }
        catch (e) { return null; }
      })(),
      rulesCount: (WA.rules && typeof WA.rules.getRuleCount === 'function') ? WA.rules.getRuleCount() : null,
      packable: live.length,
      unreadable: absent.length
    };
  }

  // ── 冲突检测（Y8 功能③：两条规则互斥 / 同一参数两处写）──────────────
  /**
   * 边界原文：「冲突时**必须拒绝启用并指出两条规则**，不做『后启用的赢』。」
   *   于是这一节只做一件事：**报出来**，不替玩家挑一个赢家。`detect()` 是纯读 ——
   *   它不写设置、不改包，连「建议保留哪条」都不给（那是 `causal.conflicts` 的活儿：
   *   那里两条链同因同果，必须显式选择；这里两套规则同时被声明为想要，答案只能是「你改一个」）。
   *
   * 三个真源，**每一类都从既有声明面逐字取**（本模块不自建互斥表 —— 自建一张就是第二份真源，
   *   下一次 `recipe` 改政策名时两处必然分叉，而分叉的表现是「冲突不报了」：最坏的那种静默失效）：
   *   · `key-clash`  —— **同一参数两处写**：两个面在同一个设置键上写了**不同的值**。
   *                     真源是两侧自己的 `values`（键 → 值），本模块只做比较。
   *   · `policy-clash` —— **两条规则互斥**：`recipe.POLICIES[].vs` 的双向声明
   *                     （如 `intel-source ↔ improv`）。委托 `recipe.policyClashes()` 判，
   *                     本模块**不重写**那张 `vs` 表。
   *   · `theme-clash`  —— 题材叠加冲突：`recipe.THEME_CLASH`（如 `mystery×fantasy`）。
   *                     委托 `recipe.themeClashes()` 判。
   * `why` 一律带人类可读的理由（recipe 那边每一条都写过 `why`，逐字带走）。
   */
  const CONFLICT_KINDS = ['key-clash', 'policy-clash', 'theme-clash'];
  const POLICY_KEY = 'worldaxis_recipe_settings_v1';
  const THEME_KEY = 'worldaxis_theme_settings_v1';
  /**
   * 夹带世界事实的名字（边界原文点名「人物 / 事件 / 地图不进规则包」）。
   *   为什么是一张**显式名单**而不是「只看我们认识的那些字段」：后者对夹带**无感** ——
   *   发包方把 `people` 塞进 body 顶层，本模块只读 `values`，于是它一路沉默地进来又沉默地丢掉，
   *   而「这份包里其实带着一份人物表」在手上这份 JSON 里**肉眼可见**。名单让它在写盘之前被拦住。
   */
  const WORLD_FACT_NAMES = ['characters', 'people', 'persons', 'places', 'events', 'map', 'atlas',
    'factions', 'timeline', 'chrono', 'store', 'world'];

  /**
   * 「写下去会变成什么」——**比之前先过写路径那一关**。
   *   为什么必须过：`apply()` 落盘走的是 `settingsBus.saveOrThrow(rec, normalize(rec, v))`，
   *   于是「包里存的形状」与「世界里的形状」可能不同（实测：`worldaxis_custom_presets` 的
   *   `def: []` 经 normalize 落成 `{}`）。不归一就比，会把**同一份面**判成冲突 ——
   *   冲突检测于是退化成噪音：刚存下的包一启用就报冲突、开档定档永远开不起来。
   *   真源仍是 settingsBus 的 normalize（**不新建第二份归一逻辑**，本仓铁律）；
   *   它或该键的登记项缺席时**如实退回原样**（返回 `{ v, raw: true }`，判据自己知道没归一）。
   */
  function asWritten(k, v) {
    const sb = WA.settingsBus;
    if (!sb || typeof sb.normalize !== 'function') return { v: v, raw: true };
    const rec = regs().filter(function (r) { return r && r.key === k; })[0] || null;
    if (!rec) return { v: v, raw: true };
    try { return { v: sb.normalize(rec, v), raw: false }; } catch (e) { return { v: v, raw: true }; }
  }
  /** 两个值面在**同一个键**上写不同值 ⇒ 一条冲突。顺序确定（按键名排序），便于判据逐条核对。 */
  function keyClashes(a, b, fromA, fromB) {
    const va = isObj(a) ? a : {}, vb = isObj(b) ? b : {};
    const keys = Object.keys(va).filter(function (k) { return Object.prototype.hasOwnProperty.call(vb, k); }).sort();
    return keys.filter(function (k) {
      // 逐字比：`JSON.stringify` 对同一份结构给同一个串（键序按插入序，这里两侧都来自本模块
      //   自己的 values 序列化，可比）。值类型不同（3 vs "3"）也算不同 —— 那不是同一份设置。
      //   两侧先各过一次**写路径的归一**（见 asWritten）：比的是「写下去之后」的形状。
      const xa = asWritten(k, va[k]), xb = asWritten(k, vb[k]);
      return JSON.stringify(xa.v) !== JSON.stringify(xb.v);
    }).map(function (k) {
      return { kind: 'key-clash', key: k, from: [fromA || '本面', fromB || '对面'],
        why: '同一个设置键「' + k + '」被两处写成不同的值 —— 后启用的赢会让结果取决于操作顺序' };
    });
  }
  /**
   * 一条政策冲突的**两条**是谁 —— 取 `pair` 优先，缺席时退回 `[a, b]`。
   *   为什么要有这一层：`recipe.policyClashes()` 的返回体是 `{id,a,b,cn,why}`（**无 pair**），
   *   而 `themeClashes()` 的返回体是 `{id,cn,why,pair}`。沿用 `c.pair` 一处写法会让政策那一支
   *   的 `key` / `from` 恒为空 —— `kind`/`why`/`count` 都对，只有「是哪两条」看不见，
   *   而冲突检测的价值恰恰就在把**两条**指出来。名单本身仍逐字取自 recipe，不自建。
   */
  function pairOf(c) {
    const row = isObj(c) ? c : {};
    const p = Array.isArray(row.pair) && row.pair.length ? row.pair : [row.a, row.b];
    return p.filter(function (x) { return x !== undefined && x !== null && String(x) !== ''; });
  }
  /** 委托 recipe 的既有声明面：政策互斥 + 题材叠加。recipe 缺席时**如实标 absent**，不假装无冲突。 */
  function recipeClashes(policies, themes) {
    const rows = [], absent = [];
    const rec = WA.recipe;
    if (policies && policies.length) {
      if (rec && typeof rec.policyClashes === 'function') {
        try {
          (rec.policyClashes(policies) || []).forEach(function (c) {
            const cp = pairOf(c);
            rows.push({ kind: 'policy-clash', key: cp.join('×'), from: cp.slice(),
              why: String(c.why || c.cn || ('两条政策互相拧：' + cp.join(' 与 '))) });
          });
        } catch (e) { absent.push({ source: 'recipe.policyClashes', why: 'threw' }); }
      } else absent.push({ source: 'recipe.policyClashes', why: 'engine-absent' });
    }
    if (themes && themes.length) {
      if (rec && typeof rec.themeClashes === 'function') {
        try {
          (rec.themeClashes(themes) || []).forEach(function (c) {
            const cp = pairOf(c);
            rows.push({ kind: 'theme-clash', key: cp.join('×'), from: cp.slice(),
              why: String(c.why || c.cn || ('两条题材叠加冲突：' + cp.join(' 与 '))) });
          });
        } catch (e) { absent.push({ source: 'recipe.themeClashes', why: 'threw' }); }
      } else absent.push({ source: 'recipe.themeClashes', why: 'engine-absent' });
    }
    return { rows: rows, absent: absent };
  }
  /** 从一份 values 面里抽出「政策 / 题材」两组名单（**按键名取，不从别处猜**）。 */
  function declOf(values) {
    const v = isObj(values) ? values : {};
    const p = isObj(v[POLICY_KEY]) && Array.isArray(v[POLICY_KEY].policies) ? v[POLICY_KEY].policies.slice() : [];
    const t = isObj(v[THEME_KEY]) && Array.isArray(v[THEME_KEY].themes) ? v[THEME_KEY].themes.slice() : [];
    return { policies: p.map(String), themes: t.map(String) };
  }
  /**
   * 检测冲突。`spec` 可以给几组面，每一种都给一条真源：
   *   · `{ values, label }`   —— 直接比一份值面（面板「这份包 vs 当前面」用这个）
   *   · `{ pack: name }`      —— 比某个已存的包
   *   · `{ text: '<json>' }`  —— 比一份**还没导入**的包体（导入前预检；这是「冲突包在启用前就被拒」的落点）
   * 返回里 `count === 0` 且 `absent` 为空才叫「这一套配得起来」；有 `absent` 时**只报「判不了」**，
   *   不报「没问题」—— 两者在界面上必须分得开。
   */
  function detect(spec) {
    const o = isObj(spec) ? spec : {};
    const rows = [];
    // ① 值面 × 值面（含「包 vs 包」「包 vs 当前面」「导入体 vs 当前面」三种组合）
    const sideA = (function () {
      if (isObj(o.values)) return { values: o.values, label: clean(o.label, 40) || '本面' };
      if (o.pack) {
        const p = find(o.pack);
        return p ? { values: p.values, label: p.name, absent: false } : { absent: true, label: nameOf(o.pack) };
      }
      return null;
    })();
    const sideB = (function () {
      if (o.against === 'current' || !o.against) {
        const snap = surface(settings().maxKeys);
        return { values: snap.values, label: '当前规则面' };
      }
      if (isObj(o.against)) return { values: o.against, label: clean(o.againstLabel, 40) || '对面' };
      if (typeof o.against === 'string') {
        const p = find(o.against);
        return p ? { values: p.values, label: p.name } : { absent: true, label: nameOf(o.against) };
      }
      return null;
    })();
    const absent = [];
    if (sideA && sideA.absent) absent.push({ source: 'pack:' + sideA.label, why: 'not-found' });
    if (sideB && sideB.absent) absent.push({ source: 'pack:' + sideB.label, why: 'not-found' });
    if (sideA && !sideA.absent && sideB && !sideB.absent) {
      keyClashes(sideA.values, sideB.values, sideA.label, sideB.label).forEach(function (r) { rows.push(r); });
    }
    // ② 政策 / 题材级：**把两侧的名单并起来判**（并集才是「这两套加在一起要同时成立」的真声明面）
    const dv = declOf(sideA && sideA.values), dw = declOf(sideB && sideB.values);
    const rc = recipeClashes(dv.policies.concat(dw.policies), dv.themes.concat(dw.themes));
    rc.rows.forEach(function (r) { rows.push(r); });
    rc.absent.forEach(function (x) { absent.push(x); });
    // ③ 导入体：先比 values，再单独判「有没有夹带世界事实」
    let carried = [];
    if (typeof o.text === 'string' && o.text.trim()) {
      let b = null;
      try { b = JSON.parse(o.text); } catch (e) { b = null; }
      if (isObj(b)) {
        carried = Object.keys(b).filter(function (k) { return WORLD_FACT_NAMES.indexOf(k) >= 0; });
        if (isObj(b.values) && sideB && !sideB.absent) {
          keyClashes(b.values, sideB.values, '导入体', sideB.label).forEach(function (r) { rows.push(r); });
        }
      } else absent.push({ source: 'text', why: 'bad-json' });
    }
    if (carried.length) {
      rows.push({ kind: 'carries-world-facts', key: carried.join('、'), from: carried.slice(),
        why: '这份包顶层带着世界事实字段（' + carried.join(' / ') + '）—— 规则包**不得携带世界事实**，一律在写盘之前拒收' });
    }
    _stat.detects++;
    return { ok: true, kinds: CONFLICT_KINDS.slice(), count: rows.length, conflicts: rows,
      absent: absent, comparable: absent.length === 0,
      // 「一条都没报」与「判不了」必须分得开：`absent` 非空时不许把这一栏读成「这套没问题」。
      verdict: rows.length ? 'conflict' : (absent.length ? 'unknown' : 'clean'),
      note: '冲突**只报不判**：指出来是哪两条，谁赢由你改 —— 不做「后启用的赢」' };
  }
  /** 冲突了就**不许启用**：把包当参数切进去时判一次，有冲突直接拒收并指出两条。 */
  function admit(name) {
    _stat.admits++;
    const p = find(name);
    if (!p) return { ok: false, reason: 'not-found', name: nameOf(name) };
    const d = detect({ values: p.values, label: p.name, against: 'current' });
    if (d.conflicts.length) {
      return { ok: false, reason: 'conflict', name: p.name,
        conflicts: d.conflicts.slice(0, 8), count: d.count,
        hint: '这一包与当前规则面存在冲突（' + d.conflicts.map(function (x) { return x.kind + ':' + x.key; }).join(' / ')
          + '）—— 启用前先改一处；本模块不会「后启用的赢」' };
    }
    return { ok: true, name: p.name, conflicts: [], absent: d.absent, comparable: d.comparable };
  }

  // ── 预设世界与规则包的组合（Y8 功能②：开档即定档）────────────────────
  /**
   * 「这一局按哪套规则 + 哪份预设世界开局」此前没有一处能答：规则包只答前半句，
   *   `preset-world` 只答后半句，而玩家开局时要的是**一句话**。
   *   本口把它们组合成一份**只读清单** —— 它不种世界、不切规则（那两件事各有各自的写口），
   *   只回答「你按这两个名字开局，会是这个样子；而它们之间有冲突的话，冲突在这几条上」。
   *   `seed` 逐字取自 `presetWorld.seed()`（草稿面不是世界状态，本模块不自己读一遍）。
   */
  function compose(spec) {
    const o = isObj(spec) ? spec : {};
    const out = { ok: true, format: FORMAT, at: clockNow('rulePack.compose') };
    if (o.pack) {
      const a = admit(o.pack);
      out.rules = a.ok
        ? { ok: true, pack: a.name, conflicts: [], absent: a.absent }
        : { ok: false, pack: a.name || nameOf(o.pack), reason: a.reason, conflicts: a.conflicts || [], hint: a.hint || '' };
    } else out.rules = { ok: false, reason: 'no-pack', hint: '组合口要一个规则包名（当前活跃包：' + (settings().active || '无') + '）' };
    const pw = WA.presetWorld;
    if (o.seed !== false) {
      if (!pw || typeof pw.seed !== 'function') {
        out.seed = { ok: false, reason: 'preset-world-absent',
          hint: '预设世界草稿面在 preset-world 里 —— 它缺席时本模块**不**自己读一遍世界（那会变成第二份真源）' };
      } else {
        let s = null;
        try { s = pw.seed(); } catch (e) { s = null; }
        if (!s || s.ok !== true) out.seed = { ok: false, reason: String((s && s.reason) || 'seed-failed') };
        else out.seed = { ok: true, characters: (s.characters || []).length, world: (s.world || []).length,
          others: (s.others || []).length, source: 'presetWorld.seed()' };
      }
    } else out.seed = null;
    // 定档：规则包解得开 且（不取预设时 || 预设读得到）—— 否则这一局开不起来，**如实说哪一半缺**。
    const rulesOk = out.rules.ok === true;
    const seedOk = (out.seed === null) || (out.seed && out.seed.ok === true);
    out.ready = !!(rulesOk && seedOk);
    out.line = out.ready
      ? ('开档定档：规则包「' + out.rules.pack + '」+ 预设世界（人物 ' + out.seed.characters + ' / 世界 ' + out.seed.world + ' / 其他 ' + out.seed.others + '）')
      : ('开不起来：' + (rulesOk ? '' : '规则面 ' + out.rules.reason + '；') + (seedOk ? '' : '草稿面 ' + (out.seed && out.seed.reason)));
    out.note = '组合口是**只读**的：它不切规则、不种世界，只把「这两样配起来是什么样」摆出来（切规则用 apply，种世界是 preset-world 的事）';
    _stat.composes++;
    return out;
  }

  // ── 回滚栈（Y8 功能④：一键回滚到上一个规则包）──────────────────────
  /**
   * 边界原文：「**回滚不删世界数据**」「只回滚规则，不动世界事实」。
   *   实现方式：栈里**只装规则面键值**（`surface()` 快照出来的那批键），一条世界键都进不来 ——
   *   于是「回滚会不会动世界」这个问题在数据结构上就没有第二个答案。专锁按「栈里不出现世界键」
   *   与「回滚前后世界摘要逐字不变」两向判。
   *   压栈时机：每次 `apply()` **在写之前**压一次（压的是「切换之前的模样」）；
   *   栈满即丢最旧一条（如实回带 `trimmed:true`，不静默）。
   */
  function history() { const s = settings(); return Array.isArray(s.history) ? s.history : []; }
  function pushHistory(site, cfg) {
    const snap = surface(cfg.maxKeys);
    const row = { at: clockNow('rulePack.' + (site || 'apply')), site: String(site || 'apply'),
      active: cfg.active || '', values: JSON.parse(JSON.stringify(snap.values || {})),
      keys: Object.keys(snap.values || {}).length, sig: sig(JSON.stringify(snap.values || {})) };
    const cur = history().slice();
    cur.push(row);
    const over = cur.length > MAX_HISTORY;
    const kept = cur.slice(-MAX_HISTORY);
    let saved = null;
    try { saved = saveSettings({ history: kept }); } catch (e) { return { ok: false, reason: 'save-threw', row: row }; }
    return { ok: true, depth: kept.length, trimmed: over, row: row, saved: saved };
  }
  /** 栈读数（纯读）：逐条只报**它长什么样**（键数 / 指纹 / 是从哪来的），不报值。 */
  function historyView() {
    return { ok: true, depth: history().length, cap: MAX_HISTORY,
      rows: history().map(function (h) { return { at: h.at || 0, site: h.site || '', active: h.active || '',
        keys: h.keys || 0, sig: h.sig || '' }; }) };
  }
  /**
   * 回滚：把栈顶那一份规则面写回（**经 settingsBus 唯一写路径**），并把活跃包标记一并还原。
   *   写回的是**键值**，不是「切到某个包」—— 上一次切换之前的手改值也照样回得去。
   *   `peek:true` 只读栈顶（不动任何东西）。
   */
  function rollback(opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = isObj(opt) ? opt : {};
    const cur = history().slice();
    if (!cur.length) { fault('no-history'); return { ok: false, reason: 'no-history',
      hint: '还没有可回滚的一步 —— 栈是在每次「切到这个包」时压的（存包不压）' }; }
    const top = cur[cur.length - 1];
    if (o.peek === true) return { ok: true, peek: true, at: top.at, site: top.site, active: top.active,
      keys: top.keys, sig: top.sig, depth: cur.length };
    if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') {
      fault('settings-bus-absent'); return { ok: false, reason: 'settings-bus-absent' };
    }
    const before = historyWorldProbe();
    const applied = [], failed = [], skipped = [];
    Object.keys(top.values || {}).forEach(function (k) {
      const rec = regs().filter(function (r) { return r.key === k; })[0] || null;
      if (!rec) { skipped.push({ key: k, why: 'key-not-registered' }); return; }
      try {
        WA.settingsBus.saveOrThrow(rec, WA.settingsBus.normalize(rec, top.values[k]));
        applied.push(k);
      } catch (e) { failed.push({ key: k, why: 'write-threw', detail: String((e && e.message) || e).slice(0, 100) }); }
    });
    let marker = null;
    try { marker = saveSettings({ active: top.active || '', history: cur.slice(0, -1) }); }
    catch (e) { marker = null; }
    const after = historyWorldProbe();
    _stat.rolls++; _stat.lastReason = failed.length ? 'partial' : 'rolled-back';
    return { ok: true, rolledBackTo: { at: top.at, site: top.site, active: top.active, sig: top.sig },
      applied: applied, failed: failed, skipped: skipped,
      partial: failed.length > 0 || skipped.length > 0,
      depthAfter: Math.max(0, cur.length - 1), marker: marker ? true : false,
      // 「只回滚规则，不动世界事实」在这里是**实测**：两侧摘要一致才算数。
      worldUnchanged: !!(before.ok && after.ok && before.digest === after.digest),
      worldBefore: before.ok ? before.digest : null, worldAfter: after.ok ? after.digest : null,
      note: '回滚只写规则面键值（经 settingsBus）—— 世界事实一个字节都不碰；这一栏是实测差，不是声明' };
  }
  /**
   * 世界事实摘要（**纯读**）。为什么不复用 world-lab 的那一口：它是那个模块的**内部**函数
   *   （导出面上没有 `liveDigest`），而本模块要判的正是「我这次操作有没有碰到世界」——
   *   复用对方内部实现等于把自己的判据挂到别人的私有面上（对方一改，本模块的实测就静默失灵）。
   *   口径与它逐字同族（顶层键数 / 总字节 / djb2 指纹），不另立一套语义。
   */
  function historyWorldProbe() {
    let s = null;
    try { s = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null; }
    catch (e) { return { ok: false, why: 'store-threw' }; }
    if (!isObj(s)) return { ok: false, why: 'no-store' };
    const keys = Object.keys(s).sort();
    const parts = []; let chars = 0;
    for (let i = 0; i < keys.length; i++) {
      let n = 0;
      try { n = JSON.stringify(s[keys[i]]).length; } catch (e) { n = -1; }
      chars += n; parts.push(keys[i] + ':' + n);
    }
    return { ok: true, keys: keys.length, chars: chars, digest: sig(parts.join('|')) };
  }

  // ── 包（命名快照）────────────────────────────────────────────────
  function packs() { const s = settings(); return Array.isArray(s.packs) ? s.packs : []; }
  function nameOf(v) { return clean(v, 40); }
  function find(name) {
    const n = nameOf(name);
    if (!n) return null;
    return packs().filter(function (p) { return p && p.name === n; })[0] || null;
  }
  /** 保存：把**当前**规则面快照成一个命名包（同名覆盖 ⇒ 明确报 replaced）。 */
  function save(name, opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const n = nameOf(name);
    if (!n) { fault('missing-name'); return { ok: false, reason: 'missing-name' }; }
    const snap = surface(cfg.maxKeys);
    if (!snap.packable) { fault('empty-surface'); return { ok: false, reason: 'empty-surface' }; }
    const cur = packs().slice();
    const idx = cur.findIndex ? cur.findIndex(function (p) { return p && p.name === n; })
      : (function () { for (let i = 0; i < cur.length; i++) { if (cur[i] && cur[i].name === n) return i; } return -1; })();
    const row = {
      name: n, ver: FORMAT, at: clockNow('rulePack.save'),
      // Y8 功能①：包自带一句**说明**（人读的那一行）。空就空着 —— 不编默认文案。
      //   同名覆盖时**沿用旧包的说明**（调用方没给新的）：否则改一次内容就把那句人写的字弄丢了。
      note: (isObj(opt) && typeof opt.note === 'string') ? clean(opt.note, 80)
        : ((idx >= 0 && cur[idx] && typeof cur[idx].note === 'string') ? cur[idx].note : ''),
      keys: snap.keys.slice(), values: JSON.parse(JSON.stringify(snap.values)),
      absent: snap.absent.slice(0, 12),
      surface: { packable: snap.packable, unreadable: snap.unreadable, themes: snap.themes, rulesCount: snap.rulesCount },
      sig: sig(JSON.stringify(snap.values))
    };
    const replaced = idx >= 0;
    if (replaced) cur[idx] = row; else cur.push(row);
    let out = null;
    try {
      out = saveSettings({ packs: cur.slice(-Math.max(1, cfg.maxPacks)), seq: (cfg.seq || 0) + 1 });
    } catch (e) { fault('save-threw'); return { ok: false, reason: 'save-threw', detail: String((e && e.message) || e).slice(0, 120) }; }
    _stat.saves++; _stat.lastReason = 'saved';
    return { ok: true, name: n, replaced: replaced, keys: row.keys.length, sig: row.sig,
      note: row.note, saved: out };
  }
  /** 当前面读数（面板/诊断用；**纯读**）。 */
  function current(opt) {
    const cfg = settings();
    const snap = surface(cfg.maxKeys);
    return Object.assign({ ok: true, enabled: !!cfg.enabled, active: cfg.active || '',
      packs: packs().map(function (p) { return { name: p.name, keys: (p.keys || []).length, at: p.at || 0, sig: p.sig || '' }; }) }, snap);
  }
  function get(name) {
    const cfg = settings();
    const p = find(name);
    if (!p) { fault('not-found'); return { ok: false, reason: 'not-found', name: nameOf(name) }; }
    return { ok: true, name: p.name, ver: p.ver, at: p.at || 0, note: (typeof p.note === 'string') ? p.note : '',
      keys: (p.keys || []).slice(),
      values: JSON.parse(JSON.stringify(p.values || {})), absent: (p.absent || []).slice(),
      surface: p.surface || null, sig: p.sig || '', format: FORMAT, maxKeys: cfg.maxKeys,
      // 读明细时顺带判一次「它与当前面冲突吗」—— 切包前想知道的事，就在读它的这一处顺手答了。
      vsCurrent: detect({ values: p.values, label: p.name, against: 'current' }) };
  }
  /**
   * 切换：把一个包写回设置面。**逐键**，且**经 settingsBus 唯一写路径**。
   *   为什么保留逐键结果：部分成功是**真结论** —— 谎报「全部成功」会让用户以为
   *   切干净了，而实际还有两键停在旧值（那正是「声明面空转」的最小形态）。
   */
  function apply(name, opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const p = find(name);
    if (!p) { fault('not-found'); return { ok: false, reason: 'not-found', name: nameOf(name) }; }
    if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') {
      fault('settings-bus-absent'); return { ok: false, reason: 'settings-bus-absent' };
    }
    // Y8 功能③的落点：**冲突的包在写盘之前就被拒**。`force:true` 是给调用方明说的逃生口
    //   （面板会显式写出「我就要这么配」），但它**不改判据** —— 拒收回执里的冲突逐条带出。
    const a = admit(p.name);
    if (!a.ok && a.reason === 'conflict' && !(isObj(opt) && opt.force === true)) {
      fault('conflict');
      return { ok: false, reason: 'conflict', name: p.name, conflicts: a.conflicts, count: a.count,
        hint: a.hint };
    }
    // ── v2.264.0（OPV6-9）幂等闸：重复切同档，一次都不写 ──────────────────
    //   「重复切同一个包」此前会完整走一遍：压栈 + 逐键写盘 + applies 计数 ——
    //   结果没变，代价却照付：回滚栈被无意义条目挤占（MAX_HISTORY=12，塞满后真要回的
    //   那一步反而被丢最旧），账面（applies）也虚高。判据**两向**：活跃标记就是这一包
    //   **且** 包值逐键与当前面一致（口径与冲突检测同一把尺：keyClashes / asWritten，
    //   不另造第二份比较逻辑）。两向缺一不可：只看名字，用户手改过键会被误跳过
    //   （假幂等 —— 最坏的一种）；只看值，「切走又切回」那一轮会被误判（标记还没跟上）。
    //   跳过时**零写盘**（不压栈、不写键、不动标记），只记台账 idemSkips，
    //   回执带 idempotent:true 让调用方看得出「这次什么都没做」。
    if ((cfg.active || '') === p.name) {
      const snapNow = surface(cfg.maxKeys);
      const idemDiff = keyClashes(p.values, (snapNow && snapNow.values) || {}, '包', '当前面');
      if (!idemDiff.length) {
        _stat.idemSkips++;
        _stat.lastReason = 'idempotent';
        const iUnreadable = Array.isArray(p.absent)
          ? p.absent.map(function (x) { return x && x.key; }).filter(Boolean) : [];
        const iSkipped = [];
        Object.keys(p.values || {}).forEach(function (k) {
          if (!regs().some(function (r) { return r.key === k; })) iSkipped.push({ key: k, why: 'key-not-registered' });
        });
        return { ok: true, name: p.name, idempotent: true, applied: [], failed: [],
          skipped: iSkipped, unreadable: iUnreadable,
          partial: iSkipped.length > 0 || iUnreadable.length > 0,
          marker: true,
          note: '幂等跳过：当前面已与这一包逐键一致 —— 未压栈、未写盘、applies 不涨、栈不占位' };
      }
    }
    // 压栈：**写之前**先记下「现在长什么样」。压栈失败（设置写不进去）⇒ 整次切换不做 ——
    //   否则「切得回去」这句话在这一次就已经不成立了。
    const pushed = pushHistory('apply', cfg);
    if (!pushed.ok) { fault('save-threw'); return { ok: false, reason: 'save-threw', detail: '回滚栈写不进去，故本次不切' }; }
    const vals = isObj(p.values) ? p.values : {};
    const keys = Object.keys(vals);
    const applied = [], failed = [], skipped = [];
    keys.forEach(function (k) {
      const rec = regs().filter(function (r) { return r.key === k; })[0] || null;
      if (!rec) { skipped.push({ key: k, why: 'key-not-registered' }); return; }
      try {
        WA.settingsBus.saveOrThrow(rec, WA.settingsBus.normalize(rec, vals[k]));
        applied.push(k);
      } catch (e) {
        failed.push({ key: k, why: 'write-threw', detail: String((e && e.message) || e).slice(0, 100) });
      }
    });
    // 活跃包标记也走设置（同一写路径）——但它失败**不**让整次 apply 判失败（设置已经切了）
    let marker = null;
    try { marker = saveSettings({ active: p.name }); }
    catch (e) { marker = null; }
    _stat.applies++;
    _stat.lastReason = failed.length ? 'partial' : 'applied';
    // 存包时就读不到的那些键（`p.absent`）**不能**被这一次切换覆盖 —— 它们不在 `values` 里。
    //   为什么不闷着：不报的话「切干净了」这句话就是假的（某一个键其实停在上一次的值上），
    //   而这类静默在界面上与「这个键本来就没内容」完全同形。
    const unreadable = Array.isArray(p.absent) ? p.absent.map(function (x) { return x && x.key; }).filter(Boolean) : [];
    return { ok: true, name: p.name, applied: applied, failed: failed, skipped: skipped,
      unreadable: unreadable,
      partial: failed.length > 0 || skipped.length > 0 || unreadable.length > 0,
      marker: marker ? true : false,
      // Y8：切成功了也要把**这一包里已知的冲突**带回来（`force` 走的那条路尤其要看这个）。
      //   口径与 recipe 一致：「应用成功 ≠ 这么配没问题」——成功说的是「写进去了」。
      conflicts: (a.conflicts || []).slice(0, 8), forced: !!(isObj(opt) && opt.force === true && (a.conflicts || []).length),
      rollbackDepth: pushed.depth, historyTrimmed: !!pushed.trimmed,
      note: '写路径唯一：全部经 settingsBus.saveOrThrow；本模块不碰 localStorage；切换前的样子已压进回滚栈' };
  }
  function drop(name) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const n = nameOf(name);
    const cur = packs().filter(function (p) { return p && p.name !== n; });
    if (cur.length === packs().length) { fault('not-found'); return { ok: false, reason: 'not-found', name: n }; }
    let out = null;
    try { out = saveSettings({ packs: cur, active: (settings().active === n ? '' : settings().active) }); }
    catch (e) { fault('save-threw'); return { ok: false, reason: 'save-threw' }; }
    _stat.drops++; _stat.lastReason = 'dropped';
    return { ok: true, name: n, remaining: cur.length, saved: out };
  }
  /** 导出：**带格式与指纹**的可搬运形态（与 dep-check 的 E8 体裁判定兼容）。 */
  function exportPack(name) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const p = find(name);
    if (!p) { fault('not-found'); return { ok: false, reason: 'not-found', name: nameOf(name) }; }
    // Y8 功能①：「说明」随包一起走。它是**人读的那一行**（「这套是我给悬疑局配的」），
    //   不是新字段语义 —— 没有说明的包导出时给空串，而不是编一句出来。
    const note = (typeof p.note === 'string') ? p.note : '';
    const body = { rulePack: FORMAT, name: p.name, at: p.at || 0, note: note,
      keys: (p.keys || []).slice(), values: JSON.parse(JSON.stringify(p.values || {})),
      sig: p.sig || '', app: (WA.VERSION || null) };
    _stat.exports++;
    return { ok: true, pack: body, text: JSON.stringify(body), bytes: JSON.stringify(body).length,
      name: p.name, keys: (p.keys || []).length, note: note };
  }
  /**
   * 导入：**先判形状、再判版本、最后才写**（与 settingsBus.cfgImport 同规）。
   *   三条边界：格式不对 / 更高 schema / 键不在登记表 —— 一律**写盘之前**拒收。
   */
  function importPack(text, opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (typeof text !== 'string' || !text.trim()) { fault('empty-input'); return { ok: false, reason: 'empty-input' }; }
    let b = null;
    try { b = JSON.parse(text); }
    catch (e) { fault('bad-json'); return { ok: false, reason: 'bad-json', detail: String((e && e.message) || e).slice(0, 120) }; }
    if (!isObj(b)) { fault('bad-shape'); return { ok: false, reason: 'bad-shape' }; }
    if (num(b.rulePack) === null) { fault('bad-format'); return { ok: false, reason: 'bad-format', field: 'rulePack' }; }
    const ver = num(b.rulePack);
    if (ver > FORMAT) { fault('too-new'); return { ok: false, reason: 'too-new', got: ver, want: FORMAT,
      hint: '更高格式一律不接 —— 理解不了的字段写进去就是静默损坏' }; }
    if (!isObj(b.values)) { fault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'values' }; }
    const name = nameOf(b.name) || ('imported-' + (cfg.seq || 0));
    const known = regs().map(function (r) { return r.key; });
    const unknownKeys = Object.keys(b.values).filter(function (k) { return known.indexOf(k) < 0; });
    const usable = Object.keys(b.values).filter(function (k) { return known.indexOf(k) >= 0; });
    if (!usable.length) { fault('no-usable-keys'); return { ok: false, reason: 'no-usable-keys',
      unknownKeys: unknownKeys.slice(0, 12), hint: '这份包的键在本侧一个都不认识 —— 不写任何东西' }; }
    // Y8 边界「规则包**不得携带世界事实**（人物 / 事件 / 地图不进包）」的落点：**写盘之前**拒收。
    //   为什么在导入这一关就拦而不是等启用：夹带是**这份包本身的毛病**（换到哪一侧都带在身上），
    //   与「它跟当前面冲不冲突」是两回事 —— 后者要看对面是谁，前者只看它自己。
    const carried = Object.keys(b).filter(function (k) { return WORLD_FACT_NAMES.indexOf(k) >= 0; });
    if (carried.length) { fault('carries-world-facts'); return { ok: false, reason: 'carries-world-facts',
      carried: carried.slice(0, 8), hint: '这份包的顶层带着世界事实字段（' + carried.join(' / ')
        + '）—— 规则包只装规则面键值；世界事实一律不进包，故整份不写' }; }
    // 冲突预检：**导入不启用**，故这里不拒收，但把「启用时会被拦下」的话当场说清
    //   （要在导入前就知道结果，`detect({text})` 是同一个判据的另一入口）。
    const pre = detect({ text: text, against: 'current' });
    const note = (typeof b.note === 'string') ? clean(b.note, 80) : '';
    const cur = packs().filter(function (p) { return p && p.name !== name; });
    const row = { name: name, ver: ver, at: clockNow('rulePack.import'), note: note,
      keys: usable.slice(), values: usable.reduce(function (a, k) { a[k] = b.values[k]; return a; }, {}),
      absent: unknownKeys.map(function (k) { return { key: k, why: 'unknown-in-this-side' }; }).slice(0, 12),
      /* 源指纹逐字取自导入体 —— 与 exportPack 写的那一份同源，调用方可以核对 */
      srcSig: (typeof b.sig === 'string' ? b.sig : ''), sig: sig(JSON.stringify(b.values)),
      imported: true };
    cur.push(row);
    let out = null;
    try { out = saveSettings({ packs: cur.slice(-Math.max(1, cfg.maxPacks)), seq: (cfg.seq || 0) + 1 }); }
    catch (e) { fault('save-threw'); return { ok: false, reason: 'save-threw' }; }
    _stat.imports++; _stat.lastReason = 'imported';
    return { ok: true, name: name, keys: row.keys.length, unknownKeys: unknownKeys.slice(0, 12),
      srcSig: row.srcSig, sig: row.sig, note: note, saved: out,
      // 导入**不启用**，故冲突不在这里拒收 —— 但把它当场报出来：「装进来了」与「能用」是两件事。
      conflictsAtEnable: pre.conflicts.slice(0, 8), conflictCount: pre.count,
      noteText: '未知键**如实列出**、不进包 —— 不是静默丢弃，也不是「大概能装」；'
        + (pre.count ? ('这一包与当前规则面有 ' + pre.count + ' 条冲突，启用时会被拦下（force 可越过，但冲突照样带回来）') : '与当前规则面无冲突') };
  }

  // ── 白名单自动化模板（边界 2 / 3 的落点）──────────────────────────
  /**
   * 动作词表：**封闭集**。每一项必须已经有一个**既有公开读口**，且该读口自己会拒收。
   *   本模块**不实现**任何一项的实际语义 —— 它只负责「按预算把它调起来」并如实带回执。
   *   为什么不给模板「自己算」的余地：模板一旦能自己改状态，它就成了绕过各模块拒收的
   *   第二条写路径，而「不绕过拒收」是这一项的边界原文。
   *
   *   ⚠ 本表每一口只准写**现场真有的**读口名。此前这一版曾写成 `pendingCenter.view` /
   *     `worldHealth.view` / `perfBaseline.snapshot` 三个**不存在的**名字 —— 后果不是报错，
   *     而是三条模板**每次都回 `engine-absent`**：模板看起来登记好了、跑起来永远拒收，
   *     而「引擎不在」与「名字写错了」在回执上长得一样（声明面空转的最小形态）。
   *     口径改为：**逐个真读口核对现场**（pendingCenter.items / worldHealth.summary /
   *     perfBaseline.bands / rehearsal.preview 四处），并只保留**纯读**的那几口 ——
   *     模板动作是「登记一次只读观测」，不是「替玩家动世界」（边界 4：不改世界状态）。
   */
  const ACTIONS = {
    'rehearsal.preview': { label: '登记一次试演预览（rehearsal.preview · 只读试演，写的是预览台账）', call: function (WAx, arg) {
      if (!WAx.rehearsal || typeof WAx.rehearsal.preview !== 'function') return { ok: false, reason: 'engine-absent' };
      return WAx.rehearsal.preview(Array.isArray(arg && arg.steps) ? arg.steps : [], arg && arg.opts);
    } },
    'pending.sweep': { label: '扫一遍待办中心（pendingCenter.items）', call: function (WAx) {
      if (!WAx.pendingCenter || typeof WAx.pendingCenter.items !== 'function') return { ok: false, reason: 'engine-absent' };
      return WAx.pendingCenter.items();
    } },
    'worldHealth.check': { label: '跑一次世界健康检查（worldHealth.summary）', call: function (WAx) {
      const W = WAx.worldHealth;
      if (!W) return { ok: false, reason: 'engine-absent' };
      const fn = (typeof W.summary === 'function') ? W.summary : null;
      if (!fn) return { ok: false, reason: 'engine-absent' };
      return fn();
    } },
    'perf.snapshot': { label: '取一张性能档位读数（perfBaseline.bands）', call: function (WAx) {
      const P = WAx.perfBaseline;
      if (!P) return { ok: false, reason: 'engine-absent' };
      const fn = (typeof P.bands === 'function') ? P.bands : null;
      if (!fn) return { ok: false, reason: 'engine-absent' };
      return fn();
    } },
    'atlas.view': { label: '摆一次世界地图视图（atlas.view · 纯只读）', call: function (WAx) {
      const A = WAx.atlas;
      if (!A || typeof A.view !== 'function') return { ok: false, reason: 'engine-absent' };
      return A.view();
    } }
  };
  const ACTION_IDS = Object.keys(ACTIONS);
  /**
   * 词表每一口**指向哪个真读口**（面名.成员名）。
   *   这不是装饰：它是「词表里写的名字在现场真的存在」这一条的**可复算形态** ——
   *   专锁与诊断面都拿这张表逐口回读 `WA.<面>.<成员>` 是不是函数。
   *   为什么不写成注释：注释里的名字没人能自动核对，而这张表能。
   */
  const ACTION_TARGETS = {
    'rehearsal.preview': 'rehearsal.preview',
    'pending.sweep': 'pendingCenter.items',
    'worldHealth.check': 'worldHealth.summary',
    'perf.snapshot': 'perfBaseline.bands',
    'atlas.view': 'atlas.view'
  };
  const FAIL_POLICIES = ['stop', 'skip'];
  /**
   * 模板的形状：`{ id, action, every, budget, failPolicy, arg }`。
   *   · `every` —— 每 N 轮触发一次（**由调用方**按剧情轮次调 `template.tick()`；
   *     本模块**不注册任何定时器** —— 定时器会在宿主后台被节流、且让「谁触发了一次」
   *     无从复算。触发时机交给调用方，这里只答「按预算现在该不该跑」）。
   *   · `budget` —— 最多跑几次（**硬上限**，跑满即停并如实报 `budget-exhausted`）。
   *   · `failPolicy` —— `stop`（一次失败即停）| `skip`（记下失败继续，但**失败照实记**）。
   */
  function validateTemplate(t, seq) {
    if (!isObj(t)) return { ok: false, reason: 'bad-shape' };
    const id = clean(t.id, 40) || ('tpl-' + (seq || 0));
    const action = clean(t.action, 40);
    if (ACTION_IDS.indexOf(action) < 0) {
      return { ok: false, reason: 'unknown-action', id: id, action: action, known: ACTION_IDS.slice() };
    }
    const every = num(t.every);
    if (every === null || every < 1 || every > 999) return { ok: false, reason: 'bad-every', id: id, every: t.every };
    const budget = num(t.budget);
    if (budget === null || budget < 1 || budget > 999) return { ok: false, reason: 'bad-budget', id: id, budget: t.budget };
    const failPolicy = clean(t.failPolicy, 12) || 'stop';
    if (FAIL_POLICIES.indexOf(failPolicy) < 0) {
      return { ok: false, reason: 'bad-fail-policy', id: id, got: failPolicy, known: FAIL_POLICIES.slice() };
    }
    // 参数只做**形状**收口（不解释语义）：字符串截断、层数上限 —— 与各模块的 inputGuard 同规。
    const arg = isObj(t.arg) ? JSON.parse(JSON.stringify(t.arg)) : null;
    return { ok: true, tpl: { id: id, action: action, every: Math.floor(every), budget: Math.floor(budget),
      failPolicy: failPolicy, arg: arg, used: 0, refused: 0, lastAt: 0, lastReason: '' } };
  }
  let _templates = [];
  function templates() { return _templates.map(function (t) { return Object.assign({}, t, { arg: t.arg ? JSON.parse(JSON.stringify(t.arg)) : null }); }); }
  function setTemplates(list, opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!Array.isArray(list)) { fault('bad-shape'); return { ok: false, reason: 'bad-shape' }; }
    const accepted = [], rejected = [];
    list.slice(0, 24).forEach(function (t, i) {
      const v = validateTemplate(t, (cfg.seq || 0) + i);
      if (v.ok) accepted.push(v.tpl); else rejected.push({ reason: v.reason, id: v.id || null, got: v.action || v.every || v.budget || v.got || null });
    });
    // **先全判、再改**：有任何一条非法就整体拒收 —— 半套模板落地会让「哪几条生效了」
    //   只能靠读列表猜（与 settingsBus 的「全部判定完成后才写」同规）。
    if (rejected.length) { fault(rejected[0].reason); return { ok: false, reason: rejected[0].reason, rejected: rejected }; }
    _templates = accepted;
    return { ok: true, accepted: accepted.length, templates: templates() };
  }
  /**
   * 按预算跑一轮模板。**写前判预算、写后带回执**。
   *   · 预算用尽 ⇒ 该条**不调用**，如实记 `budget-exhausted`（不是静默跳过）。
   *   · 被调用的写口自己拒收 ⇒ 原样带回它的 `reason`（本模块不吞、不折、不改写）。
   *   · `failPolicy==='stop'` 时一次拒收即中止后续（并如实说明停在哪一条）。
   */
  function runTemplates(opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = opt || {};
    if (!_templates.length) { fault('no-templates'); return { ok: false, reason: 'no-templates' }; }
    const at = clockNow('rulePack.template');
    const trace = [];
    let ran = 0, refused = 0, skippedBudget = 0, stopped = null;
    for (let i = 0; i < _templates.length; i++) {
      const t = _templates[i];
      if (t.used >= t.budget) {
        skippedBudget++;
        trace.push({ id: t.id, action: t.action, ok: false, reason: 'budget-exhausted', used: t.used, budget: t.budget });
        continue;
      }
      const A = ACTIONS[t.action];
      let r = null;
      try { r = A.call(WA, t.arg); }
      catch (e) { r = { ok: false, reason: 'threw' }; }
      const ok = !!(r && r.ok === true);
      t.used++; t.lastAt = at; t.lastReason = ok ? 'ok' : String((r && r.reason) || 'unknown');
      if (ok) { ran++; }
      else {
        refused++; t.refused++; _stat.templateRefused++;
        // 拒收**不吞**：把写口自己给的理由逐字带出来（那是它对该次调用的判决）。
        trace.push({ id: t.id, action: t.action, ok: false, reason: String((r && r.reason) || 'unknown'), used: t.used, budget: t.budget });
        if (t.failPolicy === 'stop') { stopped = t.id; break; }
        continue;
      }
      trace.push({ id: t.id, action: t.action, ok: true, used: t.used, budget: t.budget });
    }
    _stat.templateRuns++;
    _stat.lastReason = stopped ? 'stopped' : (refused ? 'partial' : 'ran');
    return { ok: true, at: at, ran: ran, refused: refused, budgetSkipped: skippedBudget,
      stoppedAt: stopped, trace: trace.slice(0, 24),
      note: '模板动作是**登记**：它只调既有公开写口，写口的拒收原样带回（不回滚、不吞掉、不折成成功）' };
  }
  /** 该不该跑（纯计算，不改任何状态）：按 `every` 与**外部传入的轮次**判。 */
  function dueAt(round) {
    const n = num(round);
    if (n === null) return { ok: false, reason: 'bad-round' };
    return { ok: true, round: Math.floor(n),
      due: _templates.filter(function (t) { return t.used < t.budget && (Math.floor(n) % t.every === 0); })
        .map(function (t) { return { id: t.id, action: t.action, every: t.every, used: t.used, budget: t.budget }; }) };
  }
  function resetTemplates() { _templates = []; return { ok: true, templates: 0 }; }

  // ── v2.217.0（拓展 N6）：**可持久保存的条件自动化**（`schedule.*`）────────────
  //   与 `template.*` 的分工（两者**并存**，不互相替代 —— 合成一条会让两类语义同形）：
  //     · `template.*`  —— 「现在试一下」：内存态、不落盘、不受轮次约束、点击即跑；
  //     · `schedule.*`  —— 「让它自己按轮次跑」：**落盘**、**按轮次**、**预算跨刷新保留**。
  //   病灶（计划原文，现场实证）：`runTemplates()` **不消费** `dueAt()` —— `dueAt` 算出的
  //   「这一轮该跑哪几条」在 run 那条路上根本没人看，于是「每 N 轮触发一次」只是一句声明；
  //   而 `_templates` 是模块内存变量、面板每次点击又先 `set()` 再 `run({})`，
  //   `used` 跟着被重建的模板**清零** —— 「预算跑满即停」在界面上永远看不到。
  //   边界（逐条来自计划原文，全是否定式）：
  //     1 默认关（`enabled:false` 时 set/run/reset 全部拒收 `disabled`，不是静默成功）；
  //     2 **不执行用户 JavaScript**：动作仍是 `ACTIONS` 封闭词表（零 eval/Function/require/import）；
  //     3 **不改世界状态**：本面零 `store.transact`，动作本身全是既有只读读口；
  //     4 **未到期不执行**（`round % every !== 0` 的行不跑，如实记 `not-due`）；
  //     5 **同轮重复事件不多跑**（`lastRound === round` 的行跳过并如实记 `already-ran`，
  //       不是静默丢 —— 与 Q7 的「幂等账」同一条纪律：做过就是做过）；
  //     6 **刷新不重置预算**（`used` / `lastRound` 落盘，跨会话保留）；
  //     7 **关闭后零动作**；
  //     8 轮次读不到 ⇒ 拒收 `no-round`，**不退回墙上时间**（与 gen-gate 边界 5 同规：
  //       拿墙钟当轮次会让「每 3 轮」变成「每 3 秒」，而两者在读数上长得一样）。
  /** 作用域键：调度账挂在**聊天域**下（与 gen-gate 的 chatKey 同规）。 */
  function scopeKey() {
    try {
      return (WA.store && typeof WA.store.chatId === 'function')
        ? (String(WA.store.chatId() || '') || 'wa_default') : 'wa_default';
    } catch (e) { return 'wa_default'; }
  }
  /** 轮次唯一真源（`evolution.roundOf`）；拿不到就 null，**绝不退回墙上时间**。
   *  round 0 语义（如实记）：`evolution.roundOf` 对读不到的世界返回 0（既有契约），
   *  而 round 0 满足 `0 % every === 0` ⇒ **视为到期**。这不是 bug：读到 0 说明世界还没有轮次
   *  记录，此刻跑一次只读观测是安全的（边界 3），游标 `lastRound: 0` 落盘后，同一世界
   *  的下一轮（round 1）才判 `not-due`——即「无轮次世界最多在第 0 轮跑一次」，不会重复。 */
  function roundOf(v) {
    if (v === undefined || v === null || v === '') {
      try {
        const s0 = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null;
        if (WA.evolution && typeof WA.evolution.roundOf === 'function') {
          const n0 = WA.evolution.roundOf(s0);
          return (typeof n0 === 'number' && isFinite(n0) && n0 >= 0) ? Math.floor(n0) : null;
        }
      } catch (e) { return null; }
      return null;
    }
    const n = num(v);
    return (n === null || n < 0) ? null : Math.floor(n);
  }
  /** 读调度台账（形状逐项收口：坏形状**不静默折成空**，如实报 bad-type）。 */
  function schedRead() {
    if (!WA.settingsBus || typeof WA.settingsBus.read !== 'function') {
      return { ok: false, reason: 'read-failed', data: EMPTY_SCHED() };
    }
    let raw = null;
    try { raw = WA.settingsBus.read(__SCHED); } catch (e) { return { ok: false, reason: 'read-failed', data: EMPTY_SCHED() }; }
    if (raw === null || raw === undefined) return { ok: true, data: EMPTY_SCHED() };
    if (typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'bad-type', data: EMPTY_SCHED() };
    return { ok: true, data: {
      version: (typeof raw.version === 'number') ? raw.version : SCHED_SCHEMA,
      seq: (typeof raw.seq === 'number') ? raw.seq : 0,
      updatedAt: (typeof raw.updatedAt === 'number') ? raw.updatedAt : 0,
      rows: Array.isArray(raw.rows)
        ? raw.rows.filter(function (r) { return isObj(r); }).slice(0, SCHED_CAP) : []
    } };
  }
  function schedWrite(data) {
    if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') {
      fault('write-failed'); return { ok: false, reason: 'write-failed' };
    }
    const r = WA.settingsBus.saveOrThrow(__SCHED, data);
    if (!r || r.ok !== true) { fault('write-failed'); return { ok: false, reason: 'write-failed' }; }
    return { ok: true };
  }
  function schedList() {
    const g = schedRead();
    if (!g.ok) return { ok: false, reason: g.reason, count: 0, rows: [] };
    return { ok: true, count: g.data.rows.length, scope: scopeKey(), updatedAt: g.data.updatedAt || 0,
      rows: g.data.rows.map(function (r) {
        const used = (typeof r.used === 'number') ? r.used : 0;
        return { id: r.id, action: r.action, every: r.every, budget: r.budget,
          failPolicy: r.failPolicy, used: used,
          lastRound: (r.lastRound === null || r.lastRound === undefined) ? null : r.lastRound,
          lastReason: r.lastReason || '', done: used >= r.budget };
      }) };
  }
  /** 登记调度行（**全判再写**：有任何一条非法就整体拒收 —— 半套落地会让「哪几条生效了」只能靠猜）。 */
  function schedSet(list) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!Array.isArray(list)) { fault('bad-shape'); return { ok: false, reason: 'bad-shape' }; }
    const g = schedRead();
    if (!g.ok) { fault(g.reason); return { ok: false, reason: g.reason }; }
    const accepted = [], rejected = [];
    const seq0 = g.data.seq || 0;
    list.slice(0, SCHED_CAP).forEach(function (t, i) {
      const v = validateTemplate(t, seq0 + i);
      if (!v.ok) {
        rejected.push({ reason: v.reason, id: v.id || null, got: v.action || v.every || v.budget || v.got || null });
        return;
      }
      // 调度行 = 模板行 + **持久游标**（used / lastRound / lastAt / lastReason）。
      //   这四个字段就是「刷新不重置预算」与「同轮不多跑」的全部载体。
      accepted.push(Object.assign({}, v.tpl, { lastRound: null, lastAt: 0 }));
    });
    const firstBad = rejected[0] || null;
    if (firstBad) { fault(firstBad.reason); return { ok: false, reason: firstBad.reason, rejected: rejected }; }
    const at = clockNow('rulePack.schedule');
    const w = schedWrite({ version: SCHED_SCHEMA, seq: seq0 + accepted.length, updatedAt: at, rows: accepted });
    if (!w.ok) return { ok: false, reason: w.reason };
    _stat.schedSets++;
    return { ok: true, accepted: accepted.length, rows: schedList().rows };
  }
  /** 该不该跑（**纯计算，零写**）：按轮次与持久游标判。 */
  function schedDue(round) {
    const n = roundOf(round);
    if (n === null) return { ok: false, reason: 'no-round' };
    const g = schedRead();
    if (!g.ok) return { ok: false, reason: g.reason };
    const due = [], blocked = [];
    g.data.rows.forEach(function (r) {
      const used = (typeof r.used === 'number') ? r.used : 0;
      if (used >= r.budget) { blocked.push({ id: r.id, reason: 'budget-exhausted' }); return; }
      if (r.lastRound === n) { blocked.push({ id: r.id, reason: 'already-ran' }); return; }
      if (n % r.every !== 0) { blocked.push({ id: r.id, reason: 'not-due' }); return; }
      due.push({ id: r.id, action: r.action, every: r.every, used: used, budget: r.budget });
    });
    return { ok: true, round: n, due: due, blocked: blocked };
  }
  /**
   * 按轮次跑一轮（**唯一写口**：执行 + 落盘游标）。
   *   顺序刻意是「先执行、后一次性落盘」：动作全是只读读口（边界 3），
   *   故落盘失败最多让同一轮重跑一次只读观测，不会重复产生世界副作用；
   *   而落盘失败会如实回带 `persisted:false` + `writeReason` —— 账没落上**看得见**。
   */
  function schedRun(opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = opt || {};
    const n = roundOf(o.round);
    if (n === null) { fault('no-round'); return { ok: false, reason: 'no-round' }; }
    const g = schedRead();
    if (!g.ok) { fault(g.reason); return { ok: false, reason: g.reason }; }
    const rows = g.data.rows;
    if (!rows.length) { fault('no-templates'); return { ok: false, reason: 'no-templates' }; }
    const at = clockNow('rulePack.schedule');
    const trace = [];
    let ran = 0, refused = 0, notDue = 0, already = 0, stopped = null;
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i];
      const used = (typeof t.used === 'number') ? t.used : 0;
      if (used >= t.budget) {
        notDue++;
        trace.push({ id: t.id, action: t.action, ok: false, reason: 'budget-exhausted', used: used, budget: t.budget });
        continue;
      }
      if (t.lastRound === n) {
        already++;
        trace.push({ id: t.id, action: t.action, ok: false, reason: 'already-ran', round: n });
        continue;
      }
      if (n % t.every !== 0) {
        notDue++;
        trace.push({ id: t.id, action: t.action, ok: false, reason: 'not-due', round: n, every: t.every });
        continue;
      }
      const A = ACTIONS[t.action];
      if (!A) {
        refused++; _stat.schedRefused++;
        t.lastReason = 'unknown-action';
        trace.push({ id: t.id, action: t.action, ok: false, reason: 'unknown-action', used: used, budget: t.budget });
        if (t.failPolicy === 'stop') { stopped = t.id; break; }
        continue;
      }
      let r = null;
      try { r = A.call(WA, t.arg); } catch (e) { r = { ok: false, reason: 'threw' }; }
      const ranOk = !!(r && r.ok === true);
      t.used = used + 1; t.lastRound = n; t.lastAt = at;
      t.lastReason = ranOk ? 'ok' : String((r && r.reason) || 'unknown');
      if (ranOk) {
        ran++;
        trace.push({ id: t.id, action: t.action, ok: true, used: t.used, budget: t.budget });
      } else {
        refused++; _stat.schedRefused++;
        trace.push({ id: t.id, action: t.action, ok: false, reason: String((r && r.reason) || 'unknown'),
          used: t.used, budget: t.budget });
        if (t.failPolicy === 'stop') { stopped = t.id; break; }
      }
    }
    const w = schedWrite({ version: SCHED_SCHEMA, seq: g.data.seq || 0, updatedAt: at, rows: rows });
    _stat.schedRuns++;
    _stat.lastReason = stopped ? 'stopped' : (refused ? 'partial' : 'ran');
    return { ok: true, at: at, round: n, scope: scopeKey(),
      ran: ran, refused: refused, notDue: notDue, alreadyRan: already, stoppedAt: stopped,
      persisted: !!w.ok, writeReason: w.ok ? null : w.reason,
      trace: trace.slice(0, SCHED_CAP),
      note: '按轮次跑：**同轮重复调用不再执行**（lastRound 落盘去重）、预算与已用次数**跨刷新保留**；'
        + '动作是既有只读读口，本面零 store 写' };
  }
  function schedReset() {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const w = schedWrite({ version: SCHED_SCHEMA, seq: 0, updatedAt: clockNow('rulePack.schedule'), rows: [] });
    if (!w.ok) return { ok: false, reason: w.reason };
    return { ok: true, rows: 0 };
  }
  function schedStat() {
    const g = schedRead();
    const rows = g.ok ? g.data.rows : [];
    return { ok: true, readOk: g.ok, readReason: g.ok ? null : g.reason,
      scope: scopeKey(), rows: rows.length, cap: SCHED_CAP,
      totalUsed: rows.reduce(function (a, r) { return a + ((typeof r.used === 'number') ? r.used : 0); }, 0),
      done: rows.filter(function (r) { return ((typeof r.used === 'number') ? r.used : 0) >= r.budget; }).length,
      sets: _stat.schedSets, runs: _stat.schedRuns, refused: _stat.schedRefused };
  }

  /** 封闭集（面板念的就是这一份，不另写一遍）。 */
  function catalog() {
    const cfg = settings();
    return {
      ok: true, format: FORMAT, module: MOD_TAG,
      modules: MODULE_OF.slice(),
      failPolicies: FAIL_POLICIES.slice(),
      actions: ACTION_IDS.map(function (k) { return { id: k, label: ACTIONS[k].label, target: ACTION_TARGETS[k] || '' }; }),
      bounds: { maxPacks: cfg.maxPacks, maxKeys: cfg.maxKeys },
      // Y8：冲突三类 + 回滚栈上限 + 夹带名单，**逐条写在这里**（口径面就是面板念的那一份）。
      conflictKinds: CONFLICT_KINDS.slice(),
      worldFactNames: WORLD_FACT_NAMES.slice(),
      rollbackCap: MAX_HISTORY,
      notes: {
        writePath: 'settingsBus 是唯一写路径 —— 本模块零 localStorage 写、零 store 写',
        noScript: '模板是**封闭词表**：没有 eval / Function / require / import 任何一路，"不得引入可执行脚本"是这一项的边界原文',
        noTimer: '本模块**不注册定时器** —— 触发时机由调用方按剧情轮次传入（tick / dueAt）',
        budget: 'budget 是**硬上限**：跑满即停并如实报 budget-exhausted，不是静默跳过',
        readOnly: '五口动作**全是只读读口**（待办扫描 / 健康读数 / 档位读数 / 地图视图 / 试演预览）—— 模板不替玩家动世界',
        noWorldWrite: '规则包只记录设置与启用面，不改世界状态（零 store.transact）',
        conflict: '冲突**只报不判**：指出来是哪两条（同键两处写 / 两条政策互斥 / 两题材叠加），谁赢由你改 —— 不做「后启用的赢」',
        noCarry: '规则包**不得携带世界事实**（人物 / 事件 / 地图不进包）—— 导入时按显式名单在写盘之前拦下',
        rollback: '回滚栈里**只装规则面键值**，一条世界键都进不来；栈上限 ' + MAX_HISTORY + ' 条（超出丢最旧一条并如实回报）',
        idempotent: '重复切同档是**零写盘**的幂等跳过（不压栈、applies 不涨）—— 回执带 idempotent:true，面板与账面都看得出这次什么都没做',
        compose: '组合口（开档即定档）是**只读**的：它不切规则、不种世界，只把「这两样配起来是什么样」摆出来',
        schedule: '调度面（`schedule.*`）与试跑面（`template.*`）**分工**：前者落盘、按轮次、预算跨刷新保留；后者是内存态的一次性试跑。两条路都只调封闭词表里的既有只读读口，都不执行用户 JavaScript、都不写世界状态'
      }
    };
  }
  function diagnose() {
    const cfg = settings();
    const deps = {
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function'),
      inputGuard: !!WA.inputGuard,
      rules: !!(WA.rules && typeof WA.rules.getRuleCount === 'function'),
      theme: !!(WA.theme && typeof WA.theme.list === 'function'),
      recipe: !!(WA.recipe && typeof WA.recipe.getSettings === 'function'),
      preset: !!(WA.preset && typeof WA.preset.getAllPresets === 'function'),
      rehearsal: !!(WA.rehearsal && typeof WA.rehearsal.preview === 'function'),
      pendingCenter: !!(WA.pendingCenter && typeof WA.pendingCenter.items === 'function')
    };
    // 词表逐口现场核对：`{ id, target, present }` —— 这一栏是「词表里那五个名字在现场真存在」
    //   的**唯一可读答案**。此前闭集只报 `actionIds`（一串名字），于是「名字写错了」
    //   在诊断面上与「引擎缺席」完全同形（都只是一行名字而已）。
    const actionRows = ACTION_IDS.map(function (k) {
      const t = String(ACTION_TARGETS[k] || '');
      const dot = t.indexOf('.');
      const head = dot > 0 ? t.slice(0, dot) : '', mem = dot > 0 ? t.slice(dot + 1) : '';
      const face = head ? WA[head] : null;
      return { id: k, target: t, present: !!(face && typeof face[mem] === 'function') };
    });
    const keys = packableKeys(cfg.maxKeys);
    return {
      ok: true, enabled: !!cfg.enabled, maxPacks: cfg.maxPacks, maxKeys: cfg.maxKeys,
      packs: packs().length, active: cfg.active || '',
      templateCount: _templates.length,
      // v2.217.0（N6）：调度面读数与试跑面**分栏**（见 statOf 的同款注释）。
      schedule: schedStat(),
      // 逐项报「这个引擎在不在」—— 缺席时 save/apply 仍能跑（设置族自足），
      //   但模板会拒收；两件事必须分得开。
      deps: deps,
      packable: keys.map(function (k) { return k.key + '@' + k.module; }),
      packableCount: keys.length,
      actionIds: ACTION_IDS.slice(),
      actionTargets: actionRows,
      // 「词表里有一口在现场找不到」= 声明面空转 —— 单独给一个布尔量，
      //   而不是让读的人自己去比 actionIds 与 actionTargets 两个数组。
      actionsResolved: actionRows.filter(function (r) { return r.present; }).length,
      // ── Y8 四栏现场自证 ────────────────────────────────────────
      //   「四项新功能里，哪几项此刻真的能跑」——此前没有一处能答：
      //   面板上有钮、引擎里有函数、而判据依赖的那个声明面**可能根本不在场**
      //   （recipe 缺席 ⇒ 政策 / 题材级冲突判不了，而它长得和「没有冲突」一样）。
      conflictKinds: CONFLICT_KINDS.slice(),
      //   逐条报「这一类冲突的判据依赖谁、它在不在」—— 与 actionTargets 同规：
      //   名字写错了与引擎缺席，必须分得开。
      conflictSources: [
        { kind: 'key-clash', source: '本模块 surface() 两侧 values', present: true,
          note: '同键两处写：两侧都读得到时就能判' },
        { kind: 'policy-clash', source: 'recipe.policyClashes', present: !!(WA.recipe && typeof WA.recipe.policyClashes === 'function'),
          note: '两条政策互斥（recipe 的 vs 表）—— 它缺席时这一类**判不了**，不是「没有冲突」' },
        { kind: 'theme-clash', source: 'recipe.themeClashes', present: !!(WA.recipe && typeof WA.recipe.themeClashes === 'function'),
          note: '两题材叠加冲突（recipe 的 THEME_CLASH）' }
      ],
      //   回滚栈：深度 / 上限 / 栈顶是谁（**只报形状，不报值**）。
      rollback: Object.assign({ cap: MAX_HISTORY }, historyView()),
      //   组合口：预设世界草稿面在不在（不在 ⇒ ready 恒 false，且原因说得出）。
      composeDeps: { presetWorld: !!(WA.presetWorld && typeof WA.presetWorld.seed === 'function') },
      //   夹带名单逐条列出来（面板与专锁念同一份）。
      worldFactNames: WORLD_FACT_NAMES.slice(),
      faults: Object.assign({}, _stat.faults)
    };
  }
  function statOf() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults),
      enabled: !!settings().enabled, packs: packs().length, templates: _templates.length,
      // v2.217.0（N6）：试跑面（内存态）与调度面（落盘）两套读数各自成栏 ——
      //   合并会让「试跑了几次」与「自动跑了几次」同形。
      schedule: schedStat(),
      actions: ACTION_IDS.length,
      // Y8 四栏台账：detects / admits / rolls / composes 在 `_stat` 里，`historyDepth` 现场读。
      historyDepth: history().length, conflictKinds: CONFLICT_KINDS.length });
  }
  /** 时钟（与全仓同规：决策时钟优先，缺失时退回墙钟 —— 与 agency / freight 同款守卫）。 */
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'rulePack') : Date.now(); } catch (e) { return Date.now(); } }

  // 导出面：**每一口都有真消费方**（本仓口径：无消费方不挂导出）。
  //   `save` / `apply` / `list` / `get` / `drop` / `exportPack` / `importPack` / `current`
  //   → 面板「规则包」区块（静态控件 + 开关）；
  //   `template` 组（setTemplates / run / dueAt / templates / reset）→ 同区块的模板栏；
  //   `catalog` / `diagnose` / `stat` → 面板口径钮 + tool-diag 的 `secRulePack()`；
  //   v2.203.0（Y8）新增四口，各自的真消费方都在**同一个区块**里：
  //   `detect` → 「查冲突」钮（读口）；`admit` → 「切到这个包」**内部先判**（apply 的守门），
  //   同时也是「查冲突」钮的第二个入口；`compose` → 「开档定档」钮（纯读）；
  //   `rollback` / `history` → 「回滚一步」与「回滚栈」两枚钮。
  //   `admit` 为什么也挂在面上：面板要在**写字之前**把「这一包会被拦吗」单独问一句
  //   （apply 拒收后才知道，等于已经点过一次了）。
  WA.rulePack = {
    FORMAT: FORMAT,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    catalog: catalog,
    save: save, apply: apply, drop: drop,
    // ── v2.203.0（Y8）四口 ─────────────────────────────────────
    detect: detect, admit: admit, compose: compose,
    rollback: rollback, history: historyView,
    list: function () {
      const cfg = settings();
      return { ok: true, active: cfg.active || '', maxPacks: cfg.maxPacks,
        rollbackDepth: history().length,
        packs: packs().map(function (p) { return { name: p.name, keys: (p.keys || []).length, at: p.at || 0,
          note: (typeof p.note === 'string') ? p.note : '',
          sig: p.sig || '', ver: p.ver || FORMAT, imported: p.imported === true }; }) };
    },
    get: get, current: current,
    exportPack: exportPack, importPack: importPack,
    template: {
      ids: ACTION_IDS.slice(),
      list: templates, set: setTemplates, run: runTemplates,
      tick: runTemplates, dueAt: dueAt, reset: resetTemplates
    },
    // v2.217.0（N6）：**持久条件自动化**（落盘 / 按轮次 / 预算跨刷新保留）。
    //   消费方 = 面板「规则包与自动化模板」区块的调度四钮（登记 / 清单 / 按轮次跑 / 清空）。
    //   为什么与 `template` 并列而不是替换它：见本段上方的分工注释。
    schedule: {
      list: schedList, set: schedSet, due: schedDue, run: schedRun,
      reset: schedReset, stat: schedStat, scopeKey: scopeKey
    },
    diagnose: diagnose, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/rule-pack.js', { kind: 'engine', ver: '2.203.0' });
})();
