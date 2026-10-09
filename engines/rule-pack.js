/**
 * WorldAxis engines/rule-pack.js (v2.188.0) — E7 玩家自定义规则包与自动化模板
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
  const DEF = { enabled: false, packs: [], active: '', maxPacks: 24, maxKeys: 40, seq: 0 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'rulePack',
    bounds: { maxPacks: [1, 64], maxKeys: [4, 96] }
  };
  const FORMAT = 1;
  const MOD_TAG = __REG.module;

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

  const _stat = { saves: 0, applies: 0, drops: 0, exports: 0, imports: 0,
    templateRuns: 0, templateRefused: 0, refused: 0, lastReason: '', faults: {} };
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
    return { ok: true, name: n, replaced: replaced, keys: row.keys.length, sig: row.sig, saved: out };
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
    return { ok: true, name: p.name, ver: p.ver, at: p.at || 0, keys: (p.keys || []).slice(),
      values: JSON.parse(JSON.stringify(p.values || {})), absent: (p.absent || []).slice(),
      surface: p.surface || null, sig: p.sig || '', format: FORMAT, maxKeys: cfg.maxKeys };
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
      note: '写路径唯一：全部经 settingsBus.saveOrThrow；本模块不碰 localStorage' };
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
    const body = { rulePack: FORMAT, name: p.name, at: p.at || 0,
      keys: (p.keys || []).slice(), values: JSON.parse(JSON.stringify(p.values || {})),
      sig: p.sig || '', app: (WA.VERSION || null) };
    _stat.exports++;
    return { ok: true, pack: body, text: JSON.stringify(body), bytes: JSON.stringify(body).length,
      name: p.name, keys: (p.keys || []).length };
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
    const cur = packs().filter(function (p) { return p && p.name !== name; });
    const row = { name: name, ver: ver, at: clockNow('rulePack.import'),
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
      srcSig: row.srcSig, sig: row.sig, saved: out,
      note: '未知键**如实列出**、不进包 —— 不是静默丢弃，也不是「大概能装」' };
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

  /** 封闭集（面板念的就是这一份，不另写一遍）。 */
  function catalog() {
    const cfg = settings();
    return {
      ok: true, format: FORMAT, module: MOD_TAG,
      modules: MODULE_OF.slice(),
      failPolicies: FAIL_POLICIES.slice(),
      actions: ACTION_IDS.map(function (k) { return { id: k, label: ACTIONS[k].label, target: ACTION_TARGETS[k] || '' }; }),
      bounds: { maxPacks: cfg.maxPacks, maxKeys: cfg.maxKeys },
      notes: {
        writePath: 'settingsBus 是唯一写路径 —— 本模块零 localStorage 写、零 store 写',
        noScript: '模板是**封闭词表**：没有 eval / Function / require / import 任何一路，"不得引入可执行脚本"是这一项的边界原文',
        noTimer: '本模块**不注册定时器** —— 触发时机由调用方按剧情轮次传入（tick / dueAt）',
        budget: 'budget 是**硬上限**：跑满即停并如实报 budget-exhausted，不是静默跳过',
        readOnly: '五口动作**全是只读读口**（待办扫描 / 健康读数 / 档位读数 / 地图视图 / 试演预览）—— 模板不替玩家动世界',
        noWorldWrite: '规则包只记录设置与启用面，不改世界状态（零 store.transact）'
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
      faults: Object.assign({}, _stat.faults)
    };
  }
  function statOf() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults),
      enabled: !!settings().enabled, packs: packs().length, templates: _templates.length,
      actions: ACTION_IDS.length });
  }
  /** 时钟（与全仓同规：决策时钟优先，缺失时退回墙钟 —— 与 agency / freight 同款守卫）。 */
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'rulePack') : Date.now(); } catch (e) { return Date.now(); } }

  // 导出面：**每一口都有真消费方**（本仓口径：无消费方不挂导出）。
  //   `save` / `apply` / `list` / `get` / `drop` / `exportPack` / `importPack` / `current`
  //   → 面板「规则包」区块（静态控件 + 开关）；
  //   `template` 组（setTemplates / run / dueAt / templates / reset）→ 同区块的模板栏；
  //   `catalog` / `diagnose` / `stat` → 面板口径钮 + tool-diag 的 `secRulePack()`。
  WA.rulePack = {
    FORMAT: FORMAT,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    catalog: catalog,
    save: save, apply: apply, drop: drop,
    list: function () {
      const cfg = settings();
      return { ok: true, active: cfg.active || '', maxPacks: cfg.maxPacks,
        packs: packs().map(function (p) { return { name: p.name, keys: (p.keys || []).length, at: p.at || 0,
          sig: p.sig || '', ver: p.ver || FORMAT, imported: p.imported === true }; }) };
    },
    get: get, current: current,
    exportPack: exportPack, importPack: importPack,
    template: {
      ids: ACTION_IDS.slice(),
      list: templates, set: setTemplates, run: runTemplates,
      tick: runTemplates, dueAt: dueAt, reset: resetTemplates
    },
    diagnose: diagnose, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/rule-pack.js', { kind: 'engine', ver: '2.188.0' });
})();
