/**
 * WorldAxis core/settings-bus.js (v2.4.0) — settings 存储统一治理（迁移器侧车）。
 * v2.4.0: 补齐「子键级」默认值契约——整键回落已于 v0.2.0 建立，但整键存在而子键缺失
 *   时消费端仍会拿到 undefined（详见 applyDefaults 注释）。
 * 背景：12 个模块各自持有 worldaxis_*_settings_v1 等键，读写各自实现——
 *   裸 try/catch 静默吞掉 JSON 损坏（用户配置悄悄重置默认，无任何留痕），
 *   键名带 _v1 但没有 v2 迁移路径（未来改结构时旧键静默孤儿化）。
 * 原则：本侧车只做"读旧写新 + 损坏留痕/隔离 + 暴露 pending 键"的薄逻辑；
 *   具体 v1→v2 结构升级由各模块自己负责（未来新增 upgrade 钩子）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  function now() { try { return Date.now(); } catch (e) { return 0; } }
  /** v2.3.0: 值形状摘要（脱敏）——诊断只比对/展示形状，不回显内容，避免密钥随诊断包外泄 */
  function shapeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }
  const stats = { upgrades: 0, quarantines: 0, reads: 0, failures: 0,
    // v2.4.0: 子键补齐计量——「读到的配置比声明少」是静默失效的源头，必须可观测
    //   fills = 补齐动作累计次数（同一键每读一次未回写就再补一次）；
    //   fillKeys = 补过的**不同键**数（诊断真正关心的量级）。
    subkeyFills: 0, subkeyFillKeys: 0, lastSubkeyKey: null, lastSubkeyMissing: [] };
  // v2.4.0: 补齐告警去重——补齐发生在**返回值副本**上，磁盘未回写前每次读取都会再补一次。
  //   若每次补齐都打日志，热路径（loadSettings 每轮每事件调用）会刷屏：实测 300 轮掷骰产生
  //   900+ 条同内容 warn。故按「键」去重，本会话每个键只提示一次，计数不受影响。
  const __fillWarned = {};
  /**
   * v2.4.0: 子键级默认值补齐（单一实现）。
   *
   * 背景（本轮命题）：v2.0.0 引入 settingsBus 统一了**整键**的读写与默认值回落，
   *   但「整键存在而某个**子键**缺失」是另一回事——read() 只在整键缺席时回落 reg.def，
   *   磁盘上有一条 `{"simulationMode":"balanced"}` 的旧值时，返回对象里其余子键全是 undefined。
   *   而本插件每个版本都会往设置里加新字段，老存档**必然**缺新子键，于是：
   *     · `!st.autoSimulate`（undefined 为假值）→ 自动推演被静默关成「关」
   *     · `st.diceModifier` 参与算术 → 阈值变 NaN → 事件演化骰子整条失效（300 次全判「保持」）
   *     · `vis.background`（undefined）在可见性判定里等价于关
   *   更糟的是 setSettings 走 Object.assign(read(), patch)，缺失子键被原样写回 → **永久固化，无自愈**。
   *
   * 补齐口径：
   *   a. 只在「当前值为 undefined」时补（null/false/0/'' 都是用户显式选择，必须保留）
   *   b. def 的子键缺席时也补（同样成因：登记声明写于旧版本）
   *   c. 补进去的值是 def 的深拷贝，防调用方改到判定表本身
   *   d. 动态子键（def 中无该名）不臆造默认值，只计数（由消费方自持回落）
   */
  function applyDefaults(reg, val) {
    const r = reg || {};
    const def = r.def;
    if (!def || typeof def !== 'object' || Array.isArray(def)) return val;
    if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
    let filled = 0;
    const missing = [];
    Object.keys(def).forEach(function (k) {
      if (val[k] !== undefined) return;
      let dv = def[k];
      // 深拷贝：判定表（如 inject 的 SOURCES 顺序、preset 的 SEG_KEYS）不得被调用方改写
      try { dv = JSON.parse(JSON.stringify(dv)); } catch (e) {}
      val[k] = dv;
      filled++;
      missing.push(k);
    });
    if (filled) {
      stats.subkeyFills += filled;
      stats.lastSubkeyKey = r.key || null;
      stats.lastSubkeyMissing = missing.slice(0, 12);
      if (r.key && !__fillWarned[r.key]) {
        __fillWarned[r.key] = 1;
        stats.subkeyFillKeys++;
        if (WA.log) WA.log('warn', 'settingsBus: ' + r.key + ' 缺子键已补默认值 ' + filled + ' 个（' + missing.slice(0, 6).join('、') + '）——旧版本存档结构升级，属正常自愈（本会话同键不再重复提示）');
      }
    }
    return val;
  }
  /**
   * v2.4.0: 子键缺口只读盘点（不写、不补）——诊断用。
   *   与补齐的差别：本函数只报告「磁盘值与声明差多少」，供 verdict 判「老存档已自愈但仍缺声明项」。
   */
  function subkeyGap(reg, val) {
    const r = reg || {};
    const def = r.def;
    if (!def || typeof def !== 'object' || Array.isArray(def)) return { declared: 0, missing: [] };
    const declared = Object.keys(def);
    if (!val || typeof val !== 'object' || Array.isArray(val)) return { declared: declared.length, missing: declared.slice() };
    const missing = declared.filter(function (k) { return val[k] === undefined; });
    return { declared: declared.length, missing: missing };
  }
  // v2.3.0: 观测史——记录「本会话中真实读到过」的键。
  //   用途：把「已废弃且曾存在后被删除」的幽灵键，与「声明废弃但从未落盘」的休眠登记区分开。
  //   否则移除键与从未写过无法分辨，要么漏报幽灵键、要么把休眠登记永久报成待清理项。
  const __seenKeys = Object.create(null);
  /**
   * 读取 settings 键（旧版本协商 + 损坏隔离）。
   * reg: { key:'<当前键>', legacy:['<旧键>',...], legacyRemove:bool,
      *        optional:bool, orphan:bool, def:默认值, module:'<模块名>' }
   *  - optional: 键可能因「用户尚未配置」而缺席，属正常状态（如弧线计划、自定义预设选中项）
   *  - orphan:   **v2.3.0 语义收窄**——仅表示「模块已声明废弃、不应再被读写的幽灵键」。
   *             此前该字段被三处按三种意思使用（已废弃/尚未落盘/可选），
   *             导致在用可选键被标 orphan 并可被面板一键注销（登记表失真）。
   *  - 当前键损坏 → quarantine + 返回 def + 记 error（附键名与原始前缀）
   *  - legacy 存在 → 读入为当前值 + 写当前键 + 默认删旧键；legacyRemove:false 保留旧键
   *  - 返回注册项的独立拷贝（防模块间意外共享状态）
   */
  /**
   * v2.3.0: 布尔配置归一化（单一实现）。
   *   背景：设置值以 JSON 读写，但手改 localStorage / 旧版本写入 / 外部导入都会产生
   *   字符串形式；各模块此前各自判定（`!== false` / `=== true` / `!v`），语义互不一致：
   *     `!== false` 把 'false' 判为开启（关闭意图静默失效）
   *     `=== true`  把 'true' 判为未启用（旧存档配置无声消失，且是对既有行为的收窄）
   *     `!v`        把 'false' 判为开启（同上）
   *   本函数把三类写法归一到同一语义，供全部模块共用（避免再次分叉）。
   * @param {*} v 原始值
   * @param {boolean} def 值缺席（undefined）时的默认
   */
  function toBool(v, def) {
    if (v === undefined) return !!def;
    if (v === null) return false;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t === '') return false;
      if (t === 'false' || t === '0' || t === 'no' || t === 'off') return false;
      if (t === 'true' || t === '1' || t === 'yes' || t === 'on') return true;
    }
    return !!v;
  }
  WA.settingsBus = {
    stats: stats,
    toBool: toBool,
    read(reg) {
      const r = Object.assign({ legacy: [], legacyRemove: true, orphan: false, def: null }, reg || {});
      const ls = (WA.mainWin || window).localStorage;
      let raw = null, val = null, legacyHit = false;
      try {
        raw = ls.getItem(r.key);
        if (raw !== null && raw !== undefined) {
          stats.reads++;
          try { __seenKeys[r.key] = true; } catch (eSeen) {}
          try { val = JSON.parse(raw); }
          catch (e) {
            // 当前键损坏：留痕 + 隔离（sweep 可归置）
            stats.quarantines++;
            const qk = r.key + '_corrupt_' + now();
            try { ls.setItem(qk, raw); } catch (e2) {}
            try { ls.removeItem(r.key); } catch (e3) {}
            if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 损坏已隔离 → ' + qk + '（重置默认）', String(raw).slice(0, 200));
            val = null;
          }
        }
        // 版本协商：当前无值 → 尝试 legacy 键
        if (val === null) {
          for (let i = 0; i < (r.legacy || []).length; i++) {
            const lk = r.legacy[i];
            let lraw = null;
            try { lraw = ls.getItem(lk); } catch (e) {}
            if (lraw === null || lraw === undefined) continue;
            legacyHit = true;
            try {
              val = JSON.parse(lraw);
              stats.upgrades++;
              if (WA.log) WA.log('warn', 'settingsBus: ' + lk + ' 迁移 → ' + r.key, null);
              try { ls.setItem(r.key, JSON.stringify(val)); } catch (e4) {}
              if (r.legacyRemove !== false) { try { ls.removeItem(lk); } catch (e5) {} }
            } catch (e) {
              // legacy 键也损坏：隔离留痕（防 v2 发布后误读老损坏格式）
              stats.quarantines++;
              const qk = lk + '_corrupt_' + now();
              try { ls.setItem(qk, lraw); } catch (e6) {}
              try { ls.removeItem(lk); } catch (e7) {}
              if (WA.log) WA.log('error', 'settingsBus: ' + lk + '（legacy）损坏已隔离 → ' + qk, String(lraw).slice(0, 200));
            }
            break;
          }
        }
      } catch (e) { stats.failures++; }
      if (val === null || val === undefined) val = r.def;
      // v2.4.0: 整键之外还要补**子键**——旧存档缺新字段时子键为 undefined，
      //   会在消费端静默改变语义（见 applyDefaults 注释）。补齐后再返回独立拷贝。
      val = applyDefaults(r, val);
      try { return JSON.parse(JSON.stringify(val)); } catch (e) { return val; }
    },
    /** v2.4.0: 子键补齐导出（模块侧自定义加载路径可复用同一实现，避免二次分叉） */
    applyDefaults(reg, val) { return applyDefaults(reg, val); },
    /**
     * v2.3.0: 原始读取（不解析、不隔离、不回落默认值）。
     *   用途：格式迁移——历史版本可能把「标量值」以裸字符串写入（非 JSON 契约），
     *   迁移到本总线前必须先看到原文，否则首次 read 会把旧值判为损坏并隔离，用户配置静默丢失。
     *   仅限格式迁移使用；常规读取一律走 read()。
     */
    readRaw(key) {
      try { return (WA.mainWin || window).localStorage.getItem(key); } catch (e) { return null; }
    },
    save(reg, value) {
      const r = Object.assign({ key: null, orphan: false }, reg || {});
      if (!r.key) return false;
      const ls = (WA.mainWin || window).localStorage;
      try { ls.setItem(r.key, JSON.stringify(value === undefined ? null : value)); return true; } catch (e) { return false; }
    },
    /** 注册表（只读拷贝）：{ key, legacy, legacyRemove, optional, orphan, def, module } */
    registry() {
      return (WA.__settingsRegs || []).map(function (r) {
        return { key: r.key, legacy: (r.legacy || []).slice(), legacyRemove: !!r.legacyRemove,
          optional: !!r.optional, orphan: !!r.orphan, def: r.def, module: r.module };
      });
    },
    /** v2.3.0: 本会话是否真实读到过该键（幽灵键判定的历史依据） */
    seen(key) { return !!__seenKeys[key]; },
    /**
     * v2.2.0: 注销「模块自己声明废弃」的键登记（幽灵配置清理出口）。
     *   安全边界：只接受 orphan:true 的项——模块已在定义处声明该键不再使用；
     *   对仍在使用的键（orphan 非 true）一律拒绝，避免制造「登记表与实际行为不一致」。
     */
    deregisterOrphan(key) {
      if (typeof key !== 'string' || !key) return { ok: false, reason: 'missing-key' };
      const arr = WA.__settingsRegs || [];
      const hit = arr.filter(function (r) { return r.key === key; })[0];
      if (!hit) return { ok: false, reason: 'not-found' };
      // v2.3.0: optional 键（用户未配置时缺席属正常）必须先于 orphan 判定拒绝——
      //   此前 preset_active/oracle_plan 被误标 orphan，可被「全部注销」清除，在用的键因此从登记表消失
      if (hit.optional) return { ok: false, reason: 'optional-key（可选键在用，拒绝注销）' };
      if (!hit.orphan) return { ok: false, reason: 'not-orphan（该键仍在使用，拒绝注销）' };
      WA.__settingsRegs = arr.filter(function (r) { return r.key !== key; });
      stats.deregisters = (stats.deregisters || 0) + 1;
      if (WA.log) WA.log('info', 'settingsBus：已注销孤儿设置键登记 ' + key + '（' + (hit.module || '?') + '）');
      return { ok: true, key: key, module: hit.module || null };
    },
    /**
     * v2.4.0: 子键缺口全表盘点（只读）——登记声明的子键里，磁盘值缺哪些。
     *   与 applyDefaults 的分工：补齐发生在读取时（自愈），本盘点发生在诊断时（报告）。
     *   只读磁盘原文，不触发补齐，因此报告的恒是「用户存档真实缺口」。
     */
    subkeyAudit() {
      const ls = (WA.mainWin || window).localStorage;
      const rows = [];
      (WA.__settingsRegs || []).forEach(function (r) {
        if (!r || !r.key || r.orphan) return;
        if (!r.def || typeof r.def !== 'object' || Array.isArray(r.def)) return;
        let raw = null;
        try { raw = ls.getItem(r.key); } catch (e) { return; }
        if (raw === null || raw === undefined) return;   // 无磁盘值 → 整键回落，不属子键缺口
        let parsed = null, ok = true;
        try { parsed = JSON.parse(raw); } catch (e) { ok = false; }
        if (!ok || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        const g = subkeyGap(r, parsed);
        if (g.missing.length) rows.push({ key: r.key, module: r.module || null, declared: g.declared, missing: g.missing });
      });
      return { keys: rows, totalMissing: rows.reduce(function (s, x) { return s + x.missing.length; }, 0), fills: stats.subkeyFills, fillKeys: stats.subkeyFillKeys };
    },
    /** v2.4.0: 单键子键缺口（供 verifyDefaults 复用） */
    subkeyGap(reg, val) { return subkeyGap(reg, val); },
    /** v2.2.0: 登记表计量只读视图（面板/诊断消费）——此前 registry 全库零调用 */
    registryStat() {
      const rows = this.registry();
      const byModule = {};
      let legacy = 0, orphan = 0, optional = 0;
      rows.forEach(function (r) {
        byModule[r.module || '(未声明)'] = (byModule[r.module || '(未声明)'] || 0) + 1;
        if (r.legacy && r.legacy.length) legacy++;
        if (r.orphan) orphan++;
        if (r.optional) optional++;
      });
      return { total: rows.length, byModule: byModule, legacy: legacy, orphan: orphan,
        optional: optional, deregisters: stats.deregisters || 0 };
    },
    /**
     * orphan 候选（真幽灵）：标记 orphan:true + 磁盘无该键 + **本会话曾真实读到过**。
     * v2.3.0 收紧口径：此前只判「orphan 且键不存在」，会把「声明废弃但从未落盘」的休眠登记
     * 一并报成待清理项（用户点了注销也没有任何行为变化），也无法区分「被删掉的废弃键」
     * 与「还没用过的可选键」。加了历史存在痕迹后，报出的必是「曾经在磁盘上、现已消失」的真幽灵。
     */
    pendingOrphan() {
      const ls = (WA.mainWin || window).localStorage;
      return (WA.__settingsRegs || []).filter(function (r) {
        if (!r.orphan || !r.key) return false;
        if (!__seenKeys[r.key]) return false;   // 从未观测到存在 → 休眠登记，不是幽灵
        try { return ls.getItem(r.key) === null; } catch (e) { return false; }
      }).map(function (r) { return { key: r.key, module: r.module }; });
    },
    /** 休眠登记：声明 orphan:true 但从未落盘（不产议题，仅诊断视图可见） */
    dormantGhosts() {
      return (WA.__settingsRegs || []).filter(function (r) {
        return r.orphan && r.key && !r.optional && !__seenKeys[r.key];
      }).map(function (r) { return { key: r.key, module: r.module }; });
    },
    /**
     * v2.3.0: 登记表自洽校验（纯只读，不修改任何登记）。
     *   校验项：
     *     a. key 非空且全局唯一（重复登记会让 registry/注销按第一个命中处理，另一个永远管不到）
     *     b. orphan 与 optional 互斥（既声明废弃又声明可选 = 语义矛盾）
     *     c. 必须显式声明 def 字段（漏声明会让缺失键时读到 undefined 而非默认值；
     *        历史上 evolution 声明 def:null 而真实默认值是整对象，诊断视图一直读错）
     *     d. orphan:true 项不得同时被模块真实读写路径引用（无法静态判定的部分由调用方提供 readerProbe）
     * @param {{ readerProbe?:function(key):boolean }} opts
     * @returns {{ ok:boolean, issues:Array }}
     */
    selfCheck(opts) {
      const o = opts || {};
      const rows = WA.__settingsRegs || [];
      const issues = [];
      const seenKeys = Object.create(null);
      rows.forEach(function (r) {
        const key = r && r.key;
        if (!key) { issues.push({ code: 'empty-key', level: 'error', detail: '登记项缺 key' }); return; }
        if (seenKeys[key]) { issues.push({ code: 'duplicate-key', level: 'error', detail: key + ' 被重复登记（后登记的永远管不到）' }); }
        seenKeys[key] = true;
        if (r.orphan && r.optional) issues.push({ code: 'orphan_optional_conflict', level: 'error', detail: key + ' 同时标 orphan 与 optional（语义矛盾）' });
        if (!Object.prototype.hasOwnProperty.call(r, 'def')) issues.push({ code: 'missing-def', level: 'warn', detail: key + ' 未声明 def（缺失键时读到 undefined）' });
        if (r.orphan && typeof o.readerProbe === 'function') {
          try {
            if (o.readerProbe(key)) issues.push({ code: 'orphan_still_read', level: 'error', detail: key + ' 已声明废弃但模块仍在读取' });
          } catch (e) {}
        }
      });
      const errors = issues.filter(function (i) { return i.level === 'error'; }).length;
      return { ok: errors === 0, total: rows.length, issues: issues, errorCount: errors, warnCount: issues.length - errors };
    },
    /**
     * v2.3.0: 默认值单一真源校验——比对「模块 loadSettings 实际回报的默认值」与「登记表声明的 def」。
     *
     * 为什么不能简单地用 read(reg) 对比：read 在磁盘无值时**恰好回落到 reg.def**，
     *   两边同源 → 断言恒真（这是本校验器第一版的方法论缺陷，被负向验证抓出）。
     * 因此改为：读取「磁盘原始值」，有值时与之比对（检验登记声明的类型/结构与实际存量吻合），
     *   无值时与 **actualDefault 提供者**（模块自己的 getSettings）比对（检验声明与代码内联默认值吻合）。
     *
     * @param {{ keys?:string[], providers?:Object }} opts
     *   providers: { '<键名>': function():any } —— 返回该模块在「无磁盘值」时的实际默认值。
     *              未提供提供者的登记项跳过默认值比对（无法判定，不制造假阳性）。
     */
    verifyDefaults(opts) {
      const o = opts || {};
      const ls = (WA.mainWin || window).localStorage;
      const providers = o.providers || {};
      const rows = WA.__settingsRegs || [];
      const out = [];
      rows.forEach(function (r) {
        if (!r || !r.key) return;
        if (o.keys && o.keys.indexOf(r.key) < 0) return;
        if (r.orphan) return;                       // 幽灵键不参与
        if (!Object.prototype.hasOwnProperty.call(r, 'def')) return;
        let raw = null;
        try { raw = ls.getItem(r.key); } catch (e) { raw = null; }
        if (raw !== null && raw !== undefined) {
          // 有磁盘值：登记声明必须与实际存量形状一致，否则声明已过时。
          //   ⚠ 脱敏：绝不回显磁盘内容——通道配置键含 apiKey，原文一旦进诊断包即明文泄露。
          //   （本函数第一版直接把解析结果放进返回值，被既有「诊断包不含明文 API Key」断言当场挡下。）
          let parsed = null, parseOk = true;
          try { parsed = JSON.parse(raw); } catch (e) { parseOk = false; }
          const shapeOk = parseOk && (r.def === null || parsed === null || shapeOf(r.def) === shapeOf(parsed));
          out.push({ key: r.key, module: r.module || null, source: 'disk', aligned: shapeOk,
            declaredShape: shapeOf(r.def), actualShape: parseOk ? shapeOf(parsed) : 'unparsable' });
          return;
        }
        // 无磁盘值：与模块自报的默认值比对（同样只输出形状摘要，不回显值）
        const prov = providers[r.key];
        if (typeof prov !== 'function') return;
        let actual;
        try { actual = prov(); } catch (e) { actual = undefined; }
        out.push({ key: r.key, module: r.module || null, source: 'provider',
          aligned: JSON.stringify(actual) === JSON.stringify(r.def),
          declaredShape: shapeOf(r.def), actualShape: shapeOf(actual) });
      });
      const drift = out.filter(function (x) { return !x.aligned; });
      return { checked: out.length, drift: drift, rows: out, ok: drift.length === 0 };
    }
  };
})();
