/**
 * WorldAxis engines/settings-desk.js (v2.589.0) — CFG-1：设置面总账与开关台
 *
 * ── 它治的病（先看现场读数）──────────────────────────────────────────
 *   `settingsBus.faces()` 现场读 **391 个设置面**（384 默认开 / 7 默认关 / 0 重复键），
 *   而 `ui/panel.js` 里手写的 `getSettings` 读取点只有 **117 处**。两者不是一个量级，
 *   差值不是「剩下的面不需要玩家改」，而是**没有任何一处读数会报「这个面改不了」**：
 *     · 值真实存在（localStorage 里有键）；
 *     · 引擎真的在读（`settings()` 每轮参与判定）；
 *     · 默认值真的生效（`enabled:false` 出厂就关）；
 *     · 而玩家**没有任何入口**能翻它一下。
 *   这是本仓治过多次的「同形不可分辨」设置在**写侧**的那个版本：
 *   读侧的同形病是「空」与「没接上」长得一样，写侧的同形病是
 *   「这个面是设计上不给改」与「这个面是被漏了」长得一样 —— 两者在面板上都表现为「没有控件」。
 *
 * ── 为什么不是逐个面手写一个控件（这是本模块存在的核心理由）────────────
 *   给 149（或 243，取哪个口径都一样）个面各补一个 checkbox，是**当场能绿、下一版就烂**的做法：
 *     ① 手写清单 = 第二份真源。`faces()` 已经是从 `WA.__settingsRegs` 现场算出来的单一真源，
 *        再抄一份控件清单，两边必然漂移（本仓为此付过八次代价，最近一次是 v2.29.0 的
 *        可见性 10 源）；
 *     ② 新引擎一登记，「缺入口」这件事**没有任何读数会报**——它不会红，只会静默地少一个入口，
 *        于是下一个 149 会在半年后原地长出；
 *     ③ 面板会肿到不可用：391 个控件塞进一页，违反 OPV29-05 的首屏预算口径。
 *   故本模块**不持有任何面清单**：清单就是 `WA.__settingsRegs`（settingsBus 读的同一份数组，
 *   同一引用不拷贝），新引擎一登记就自动出现在台上，**一行代码都不用改本文件**。
 *   这条是本模块最容易被后来者「优化掉」的地方，故写在此处：**不要引入 FACES 常量。**
 *
 * ── 三条纪律（与仓库既有口径逐条对齐）──────────────────────────────────
 *   1. **写回只走 settingsBus**：`normalize` → `saveOrThrow` → **读回复核**。
 *      直写 `localStorage` 会绕过写后读回校验（`writeFailed`）、失败分桶与子键漂移计量，
 *      于是「一次没存进去的点击」在诊断里变成「没有发生过」——v2.6.0 的 ✓ 已保存就是这么来的。
 *   2. **没有 `enabled` 字段的面不给开关**：那类面是纯参数面（阈值/比例/上限），
 *      给它一个勾选框等于**当场发明一个语义**（「关掉」一个阈值是什么意思？无人能答）。
 *      返回 `reason:'no-enabled'` 并如实计数，不静默吞掉。
 *   3. **截断必须自报**：一屏只渲染 `limit` 行（默认 24），返回体里恒有
 *      `shown` / `total` / `truncated`。**不许**让「只列了前 24 个」看起来像「一共就 24 个面」——
 *      这正是本仓反复治过的「读数比它知道的更多」。
 *
 * ── 与 `tools/settings-audit.js` 的分工（不许合并）──────────────────────
 *   那个是**离线审计脚本**（只在 node 里跑、回答「一共几个面、几个重复键」）；
 *   本模块是**产品面读口**（在面板进程里跑、回答「这一面现在开没开、我能不能翻它」）。
 *   两者的共同点只有一句：**都读 `faces()` / `__settingsRegs`，谁都不另立表**。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const VERSION = '2.589.0';
  const LIMIT_DEF = 24;
  const LIMIT_MAX = 400;
  const __stat = {
    lists: 0, flips: 0, flipsOk: 0, flipsRefused: 0,
    lastFlip: null, lastList: null, faults: {}
  };

  function fault(face, e) { __stat.faults[face] = String((e && e.message) || e).slice(0, 120); }
  function bus() { return WA.settingsBus || null; }
  /**
   * 登记表的唯一真源：`WA.__settingsRegs`。
   *   刻意不 `slice()` 拷贝：本模块从不改写它，拷贝只会让「面板看到的是否与引擎同一份」
   *   这个可核问题多出一层。返回原数组，调用方自己别改。
   */
  function regs() {
    const r = WA.__settingsRegs;
    return Array.isArray(r) ? r : [];
  }
  function str(v) { return String(v == null ? '' : v); }
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  /**
   * 单面读数。**这是本模块唯一的读口**，list / diagnose / flip 复核全部走它，
   *   免得「面板显示的值」与「引擎读到的值」变成两份实现。
   * @param {object} reg 登记项
   * @returns {{key:string, module:string, hasSwitch:boolean, defOn:boolean|null,
   *            on:boolean|null, source:string, ok:boolean, reason:string|null}}
   */
  function faceOf(reg) {
    const r = reg || {};
    const def = r.def || null;
    const hasSwitch = hasOwn(def, 'enabled');
    const defOn = hasSwitch ? !!def.enabled : null;
    const out = { key: str(r.key), module: str(r.module || '(anonymous)'),
      hasSwitch: hasSwitch, defOn: defOn, on: null, source: 'unknown', ok: false, reason: null };
    if (!hasSwitch) { out.reason = 'no-enabled'; return out; }
    const sb = bus();
    if (!sb || typeof sb.readEx !== 'function') { out.reason = 'settings-bus-absent'; return out; }
    let ex = null;
    try { ex = sb.readEx(r); } catch (e) { fault('faceOf', e); out.reason = 'read-threw'; return out; }
    const val = (ex && ex.value) || {};
    out.on = (typeof val.enabled === 'boolean') ? val.enabled : defOn;
    out.source = str((ex && ex.source) || 'default');
    // ok=false 的含义必须与 readEx 一致：**拿到的是兜底值**，不是「用户配的值」。
    //   这里不把它折叠成 on=defOn 就完事 —— 面板上要能显示「读到的是兜底」。
    out.ok = !!(ex && ex.ok);
    out.reason = (ex && ex.reason) || null;
    return out;
  }

  function normalizeOnly(only) {
    const o = str(only || 'all').toLowerCase();
    if (o === 'on' || o === 'off' || o === 'changed' || o === 'switchable' || o === 'no-enabled') return o;
    return 'all';
  }
  function matchOnly(row, only) {
    if (only === 'on') return row.hasSwitch && row.on === true;
    if (only === 'off') return row.hasSwitch && row.on === false;
    if (only === 'changed') return row.hasSwitch && row.source === 'disk' && row.on !== row.defOn;
    if (only === 'switchable') return row.hasSwitch;
    if (only === 'no-enabled') return !row.hasSwitch;
    return true;
  }
  function matchKw(row, kw) {
    if (!kw) return true;
    const k = kw.toLowerCase();
    return row.key.toLowerCase().indexOf(k) >= 0 || row.module.toLowerCase().indexOf(k) >= 0;
  }

  /**
   * 总账清单。
   * @param {object} [opts] { only, kw, limit }
   * @returns {{ok:boolean, rows:Array, totals:object, shown:number, total:number,
   *            matched:number, truncated:boolean, limit:number, filter:object, reason?:string}}
   */
  function list(opts) {
    const o = opts || {};
    const only = normalizeOnly(o.only);
    const kw = str(o.kw || '').trim();
    let limit = Number(o.limit);
    if (!isFinite(limit) || limit <= 0) limit = LIMIT_DEF;
    if (limit > LIMIT_MAX) limit = LIMIT_MAX;
    const src = regs();
    const totals = { faces: src.length, switchable: 0, noSwitch: 0, on: 0, off: 0, changed: 0,
      readFallback: 0, dupKeys: 0, disabledByDefault: 0 };
    const rows = [];
    const seen = Object.create(null);
    for (let i = 0; i < src.length; i++) {
      const reg = src[i];
      if (!reg || !reg.key) { totals.faces -= 1; continue; }
      // 重复键：settingsBus.faces() 也会报，这里同步计一次是为了让「面板这一页」
      //   自己就能回答「有没有两个模块抢一个键」——那是必然有一方读到别人的值。
      if (seen[reg.key]) totals.dupKeys += 1; else seen[reg.key] = 1;
      const row = faceOf(reg);
      if (row.hasSwitch) {
        totals.switchable += 1;
        if (row.on === true) totals.on += 1; else if (row.on === false) totals.off += 1;
        if (row.source === 'disk' && row.on !== row.defOn) totals.changed += 1;
        if (row.defOn === false) totals.disabledByDefault += 1;
      } else totals.noSwitch += 1;
      if (row.hasSwitch && row.ok === false) totals.readFallback += 1;
      if (!matchOnly(row, only)) continue;
      if (!matchKw(row, kw)) continue;
      rows.push(row);
    }
    const matched = rows.length;
    const shownRows = rows.slice(0, limit);
    __stat.lists += 1;
    __stat.lastList = { at: WA.clock?.wallNow?.() ?? null, only: only, kw: kw, matched: matched, shown: shownRows.length };
    return {
      ok: true, rows: shownRows, totals: totals,
      shown: shownRows.length, matched: matched, total: totals.faces,
      truncated: matched > shownRows.length, limit: limit,
      filter: { only: only, kw: kw }
    };
  }

  /**
   * 翻一个面。
   *   契约（每一条都能被专锁逐字断言）：
   *     ① 键不在登记表 ⇒ `invalid-key`（无副作用）
   *     ② 该面无 `enabled` 字段 ⇒ `no-enabled`（无副作用，且**不**凭空写入字段）
   *     ③ `on` 不是 boolean ⇒ `invalid-bool`（无副作用）
   *     ④ 写回走 `normalize` + `saveOrThrow`，**然后读回复核**——写成功不等于存住了
   *     ⑤ 复核失败 ⇒ `write-unverified`（这时磁盘可能是旧的，如实说，不假装成功）
   *     ⑥ 幂等：目标值已等于当前值 ⇒ 仍然返回 ok，但 `changed:false`（不白写盘）
   * @param {string} key 设置键
   * @param {boolean} on 目标开关值
   * @returns {{ok:boolean, key:string, before?:*, after?:*, changed?:boolean, reason?:string, hint?:string}}
   */
  function flip(key, on) {
    const k = str(key);
    const reg = regs().filter(function (r) { return r && r.key === k; })[0];
    if (!reg) {
      __stat.flipsRefused += 1;
      return { ok: false, key: k, reason: 'invalid-key', hint: '该键不在 WA.__settingsRegs 里（不是本机登记过的设置面）' };
    }
    const before = faceOf(reg);
    if (!before.hasSwitch) {
      __stat.flipsRefused += 1;
      return { ok: false, key: k, reason: 'no-enabled', hint: '这个面没有 enabled 字段，只有参数；给它一个开关等于凭空发明语义' };
    }
    if (typeof on !== 'boolean') {
      __stat.flipsRefused += 1;
      return { ok: false, key: k, reason: 'invalid-bool', hint: 'on 必须是 true / false（不接受 "true" / 1 / undefined）' };
    }
    const sb = bus();
    if (!sb || typeof sb.normalize !== 'function' || typeof sb.saveOrThrow !== 'function') {
      __stat.flipsRefused += 1;
      return { ok: false, key: k, reason: 'settings-bus-absent', hint: '设置总线未装载，写回会绕过读回校验，故拒绝' };
    }
    __stat.flips += 1;
    if (before.on === on) {
      // ⑥ 幂等：不白写盘。changed:false 是**结论**，不是失败。
      __stat.flipsOk += 1;
      __stat.lastFlip = { at: WA.clock?.wallNow?.() ?? null, key: k, before: before.on, after: on, changed: false };
      return { ok: true, key: k, before: before.on, after: on, changed: false };
    }
    let next = null, w = null;
    try {
      const ex = sb.readEx(reg);
      next = sb.normalize(reg, Object.assign({}, (ex && ex.value) || {}, { enabled: on }));
      w = sb.saveOrThrow(reg, next);
    } catch (e) {
      fault('flip', e);
      __stat.flipsRefused += 1;
      return { ok: false, key: k, reason: 'write-threw', hint: str((e && e.message) || e) };
    }
    if (!w || !w.ok) {
      __stat.faults['flip.write'] = str((w && w.reason) || 'write-failed');
      __stat.flipsRefused += 1;
      return { ok: false, key: k, reason: 'write-failed', hint: str((w && w.reason) || 'write-failed') };
    }
    // ④ 读回复核：写成功 ≠ 存住了。复核读的是**磁盘真值**，不是刚算出来的 next。
    const after = faceOf(reg);
    if (after.on !== on || after.source !== 'disk') {
      __stat.flipsRefused += 1;
      return { ok: false, key: k, reason: 'write-unverified', before: before.on, after: after.on,
        hint: '写回后读到的值/来源与目标不符（磁盘可能是旧值）：' + after.source };
    }
    __stat.flipsOk += 1;
    __stat.lastFlip = { at: WA.clock?.wallNow?.() ?? null, key: k, before: before.on, after: after.on, changed: true };
    return { ok: true, key: k, before: before.on, after: after.on, changed: true };
  }

  /** 把单个面恢复出厂值（不是删键）：等价于 flip(key, defOn)，但对无开关面如实拒收。 */
  function restore(key) {
    const reg = regs().filter(function (r) { return r && r.key === str(key); })[0];
    if (!reg) return { ok: false, key: str(key), reason: 'invalid-key' };
    const f = faceOf(reg);
    if (!f.hasSwitch) return { ok: false, key: f.key, reason: 'no-enabled' };
    return flip(f.key, f.defOn);
  }

  /**
   * 总账诊断：面板与 tool-diag 共用的一份读数。
   *   刻意**不**再算一遍 totals（那是 list 的活）：这里只回答三件事——
   *   一共几个面、几个能翻、几个「读回来是兜底」（后者才是真正需要人看一眼的那批）。
   */
  function diagnose() {
    const l = list({ only: 'all', limit: LIMIT_MAX });
    const sb = bus();
    let faces = null;
    try { faces = (sb && typeof sb.faces === 'function') ? sb.faces() : null; } catch (e) { fault('faces', e); }
    const fallback = [];
    for (let i = 0; i < l.rows.length; i++) {
      if (l.rows[i].hasSwitch && l.rows[i].ok === false) fallback.push(l.rows[i].key);
    }
    // 与 settingsBus.faces() 的**交叉核对**：两个读数必须同源。
    //   不同源就说明「面板看到的面数」与「总线看到的面数」不是一回事——那是第二真源。
    //   口径必须减掉 `missingKey`：settingsBus 的 `total` 是**登记行数**（含没有 key 的行），
    //   本模块的 `total` 是**有效面数**（没有 key 的行不是面）。不减就会在「有人登记忘了写 key」
    //   时报一次假分歧，而那次假分歧会把真正的第二真源掩盖在同一条读数里。
    const busValid = faces ? (faces.total - (faces.missingKey || 0)) : null;
    const sameOrigin = faces ? (busValid === l.total) : null;
    return {
      ok: true, version: VERSION,
      total: l.total, switchable: l.totals.switchable, noSwitch: l.totals.noSwitch,
      on: l.totals.on, off: l.totals.off, changed: l.totals.changed,
      disabledByDefault: l.totals.disabledByDefault, dupKeys: l.totals.dupKeys,
      readFallback: l.totals.readFallback, fallbackKeys: fallback.slice(0, 12),
      busFaces: faces ? { total: faces.total, enabled: faces.enabled, disabled: faces.disabled,
        modules: faces.modules, dupKeys: (faces.dupKeys || []).length } : null,
      sameOrigin: sameOrigin,
      note: sameOrigin === false ? '面板面数与 settingsBus.faces() 不等 —— 有第二真源，先查登记表' : null
    };
  }

  function summaryText(d) {
    const x = d || diagnose();
    if (!x || !x.ok) return '设置面：无读数';
    return '设置面 ' + x.total + ' 个（可翻 ' + x.switchable + ' / 纯参数 ' + x.noSwitch + '）'
      + '｜开 ' + x.on + ' · 关 ' + x.off + '｜改过的 ' + x.changed
      + (x.disabledByDefault ? ('｜出厂关着的 ' + x.disabledByDefault) : '')
      + (x.readFallback ? ('｜读回兜底 ' + x.readFallback + '（' + x.fallbackKeys.join(',') + '）') : '');
  }

  WA.settingsDesk = {
    VERSION: VERSION,
    list: list,
    flip: flip,
    restore: restore,
    diagnose: diagnose,
    summaryText: summaryText,
    /** 单面读数（面板行内复核、专锁逐字断言都用这一份） */
    face: function (key) {
      const reg = regs().filter(function (r) { return r && r.key === str(key); })[0];
      return reg ? faceOf(reg) : { key: str(key), module: '', hasSwitch: false, defOn: null, on: null, source: 'absent', ok: false, reason: 'invalid-key' };
    },
    stat: function () {
      return Object.assign({}, __stat, { faults: Object.assign({}, __stat.faults),
        lastFlip: __stat.lastFlip ? Object.assign({}, __stat.lastFlip) : null,
        lastList: __stat.lastList ? Object.assign({}, __stat.lastList) : null });
    },
    __reset: function () { __stat.lists = 0; __stat.flips = 0; __stat.flipsOk = 0; __stat.flipsRefused = 0; __stat.lastFlip = null; __stat.lastList = null; return true; }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/settings-desk.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/settings-desk 已加载（' + VERSION + '）');
})();
