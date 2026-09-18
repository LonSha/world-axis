/**
 * WorldAxis core/settings-bus.js (v2.5.0) — settings 存储统一治理（迁移器侧车）。
 * v2.5.0: 补齐「键的**生命周期**」契约——v2.4.0 解决了「子键缺失」，但键本身的生命周期
 *   仍是空白：12 个 `_v1` 键的历史修改次数是 1–8 次（backstage 8 次、opinion 6 次、
 *   workflow/oracle 各 4 次），键名说 v1 而结构已经改了六七轮。本版补三件事：
 *     · 结构指纹（schemaStamp）——磁盘值自带「我是哪个 def 形状写的」标识；
 *     · 结构迁移引擎（migrateIfNeeded）——registry 的 migrate 钩子此前零调用，本版让它真正生效；
 *     · 原始格式复活（rawReviveDef）——把 v2.3.0 的一次性迁移升级为声明式、可重复、幂等；
 *   外加未登记键（幽灵设置）盘点（ghostScan）——此前登记表与清理规则都管不到这类键，
 *   实证案例 worldaxis_director_tags_v1（v0.1.0 存在 → v0.2.0 移除 → 永久滞留用户磁盘）。
 *
 * v2.4.0: 补齐「子键级」默认值契约——整键回落已于 v0.2.0 建立，但整键存在而子键缺失
 *   时消费端仍会拿到 undefined（详见 applyDefaults 注释）。
 * 背景：12 个模块各自持有 worldaxis_*_settings_v1 等键，读写各自实现——
 *   裸 try/catch 静默吞掉 JSON 损坏（用户配置悄悄重置默认，无任何留痕），
 *   键名带 _v1 但没有 v2 迁移路径（未来改结构时旧键静默孤儿化）。
 *   v2.5.0 起：迁移路径已实装（migrate / rawRevive），且「结构长什么样」记在磁盘值里（_schema）。
 * 原则：本侧车只做"读旧写新 + 损坏留痕/隔离 + 暴露 pending 键"的薄逻辑；
 *   具体结构升级由各模块以 `migrate({value,key,def}) -> {changed,value,reason}` 声明（单一实现）。
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
    subkeyFills: 0, subkeyFillKeys: 0, lastSubkeyKey: null, lastSubkeyMissing: [],
    // v2.5.0: 生命周期计量——结构迁移（migrations）/ 迁移失败（migrationFailed）/
    //   原始格式复活（rawRevives）/ 结构指纹写入（schemaStamps）/ 幽灵键清理（ghostRemoved）。
    //   此前「迁移了几个键」「迁移失败了吗」只能靠翻日志，退出即散。
    migrations: 0, migrationFailed: 0, lastMigration: null,
    rawRevives: 0, schemaStamps: 0, ghostRemoved: 0, ghostBytes: 0,
    // v2.6.0: 写入侧计量——此前读有 `reads`、迁移有 `migrations`、盖章有 `schemaStamps`，
    //   唯独 **save 的成败完全不可观测**：`save()` 返回 false 却不写 stats，而 12 个模块调用方
    //   里只有 calendar 一处包了 try/catch、**没有一处检查返回值** ⇒ 配额满/隐私模式/键被策略性
    //   拒绝时，用户点了「保存」、界面无任何提示、下次打开发现配置回到旧值，且诊断包里零线索
    //   （最需要证据的场景恰恰是「什么都没写进去」）。本版补齐：writes = 真正写盘尝试次数、
    //   writeFailed = 写盘失败次数（含未声明 key、JSON 序列化抛错、setItem 抛错三个来源）、
    //   lastWrite = 最近一次成功写入的键与字节量（字节量取序列化后长度，可发现「越存越大」）、
    //   lastWriteError = 最近一次失败原因（写失败必须能回答「为什么」）。
    writes: 0, writeFailed: 0, lastWrite: null, lastWriteError: null,
    // v2.6.0（收口）: 写失败**来源分类**——「配额已满」（环境问题，提示用户清理）与「登记项未声明
    //   key」「值不可序列化」（代码缺陷，须改实现）是两类完全不同的故障；只留一个 lastError 字符串
    //   会让诊断把编程错误报成环境问题，用户照着提示修永远修不好。
    writeFailedBy: { missingKey: 0, stringify: 0, setItem: 0, writeback: 0, rawRevive: 0, quarantine: 0, legacy: 0, stamp: 0 },
    // v2.6.0: 写入侧死键计量——`save()` 收到「不在登记 def 里的子键」的次数与最近键名。
    //   v2.5.0 的缩减型迁移只解决了**存量**（老存档里已有的死子键），**增量**仍在继续：
    //   `Object.assign(read(), patch)` 把运行时算出的旧字段一并写回、`setChannel` 无白名单地
    //   接受任意额外字段，都会新造出 def 之外的子键，而迁移只在「读路径」触发、且对同形态只试一次。
    //   本计量让「谁在往设置里塞 def 之外的东西」第一次可观测（**只计数，一个字节都不改**）。
    //   命名口径：叫 extraSubkeys 而非 prunedSubkeys——本版**没有任何剪除动作**（写路径如实落盘），
    //   用「已剪除」命名会让读诊断的人以为死键已经被清掉了，是计量里最危险的那种不实。
    extraSubkeys: 0, lastExtra: null };
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
   * v2.5.0: 子键缺口只读盘点（不写、不补）——诊断用。
   *   与补齐的差别：本函数只报告「磁盘值与声明差多少」。
   *   v2.5.0 起 val 可为 **JSON 原文串**：磁盘上存着非 JSON（历史版本写裸串）时，
   *   解析成功才是对象；解析失败即「整键形态不符」，此时报告 **declared 个子键全缺**
   *   （此前返回 parsed=null → 被上层 skip ⇒ 该键在缺口表里静默消失）。
   */
  function subkeyGap(reg, val) {
    const r = reg || {};
    const def = r.def;
    if (!def || typeof def !== 'object' || Array.isArray(def)) return { declared: 0, missing: [] };
    const declared = Object.keys(def);
    if (typeof val === 'string') {
      try { val = JSON.parse(val); }
      catch (e) { return { declared: declared.length, missing: declared.slice(), unparsable: true }; }
    }
    if (!val || typeof val !== 'object' || Array.isArray(val)) return { declared: declared.length, missing: declared.slice() };
    const missing = declared.filter(function (k) { return val[k] === undefined; });
    return { declared: declared.length, missing: missing };
  }
  /**
   * v2.5.0: 结构指纹字符串（**非哈希**，不依赖 crypto）。
   *   指纹 = def 的子键名与各自 typeof，按「SHA1 算法本身不变」的稳定性排序后拼接。
   *   用途不是防篡改，而是「这份磁盘值是**哪一个结构版本**写的」——单向不可逆即可（无需还原），
   *   子键名不属用户隐私（隐私在**值**里，值不参与指纹）。
   *   排序而非定义序：避免「只是调整了 def 里字段的书写顺序」被误判为结构变更。
   * @param {*} def 默认值对象
   * @returns {string|null} 形如 'clock:boolean|people:boolean|...'；def 非对象时 null
   */
  function schemaFingerprint(def) {
    if (!def || typeof def !== 'object' || Array.isArray(def)) return null;
    try {
      return Object.keys(def).sort().map(function (k) { return k + ':' + typeof def[k]; }).join('|');
    } catch (e) { return null; }
  }
  /**
   * v2.5.0: 摘要（FNV-1a 32 位）——给指纹配一个短编号，供「同一指纹出现几次」快速比对。
   *   不做安全检查，故不引入 crypto 依赖、也不该用于任何安全判定。
   */
  function fingerprintDigest(fp) {
    if (!fp) return null;
    let h = 0x811c9dc5;
    for (let i = 0; i < fp.length; i++) {
      h ^= fp.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16);
  }
  /**
   * v2.5.0: 原始格式复活（rawRevive）。
   *
   * 背景（本轮命题）：v2.3.0 引入了**一次性**迁移（preset 的 `active_preset` 由裸字符串迁为 JSON），
   *   但它写在 preset.js 里、只覆盖一个键、且**只有一次机会**——那一次若因任何原因未完成
   *   （迁移前抛错、用户用别的实例/旧版本又写了一次裸串、清过 localStorage 后又被旧版本写入），
   *   此后每次 read 都会把裸串判为「损坏」→ 隔离 + 回落默认 + 记 error，**用户数据每次启动丢一次**，
   *   且没有任何自愈路径。「迁移是一次性的」这件事本身就是缺陷。
   *
   * 本函数把该能力上升为**声明式**且**祛魅**（不是一次性）：
   *   reg.rawRevive 声明「本键在历史版本里以**原始字符串**（非 JSON）存放，其字符串值语义等价于
   *   把该原文作为字符串值的 JSON」——即 `raw → JSON.stringify(raw)`（`"abc"`）。这与 v2.3.0
   *   的既有语义逐字等价（既有的 `save(reg, raw)` 实现就是 `JSON.stringify(raw)`），因此不是新语义发明，
   *   而是把既有的隐式约定显式化、通用化、可重复。
   *   · 幂等：已是合法 JSON 就原样返回，绝不二次包装
   *   · 只读检查：`probe:true` 时不写盘（盘点用），故诊断不会产生副作用
   *   · 留痕：stats.rawRevives 与日志（这是**用户数据被救回**的证据，必须可见）
   * @param {object} reg 登记项（需 rawRevive:true）
   * @param {boolean} [probe] true=只检查不写盘
   * @returns {{revived:boolean, raw?:string, value?:*, reason?:string}}
   */
  function rawReviveDef(reg, probe) {
    const r = reg || {};
    if (!r.rawRevive || !r.key) return { revived: false, reason: 'not-enabled' };
    const ls = (WA.mainWin || window).localStorage;
    let raw = null;
    try { raw = ls.getItem(r.key); } catch (e) { return { revived: false, reason: 'no-storage' }; }
    if (raw === null || raw === undefined) return { revived: false, reason: 'absent' };
    try { JSON.parse(raw); return { revived: false, reason: 'already-json' }; } catch (e) { /* 非 JSON → 需要复活 */ }
    // 空串是特例：`JSON.parse('')` 抛错，但它不是「被写坏的 JSON」而是「空值」，
    //   包装成 "\"\"" 会把「没值」变成「空字符串值」，语义反而变了 → 不复活。
    if (raw === '') return { revived: false, reason: 'empty-string' };
    let value = raw;
    try { value = JSON.parse(JSON.stringify(raw)); } catch (e) { return { revived: false, reason: 'stringify-failed' }; }
    if (!probe) {
      // v2.6.0（收口）: 复活同样是写盘，经统一出口记账（含失败）。此前失败路径只返回
      //   {revived:false}，**一个字节的记录都没有**——用户的旧格式配置没救回来，诊断里查不到原因。
      const wRev = ls_set(r.key, value, 'rawRevive');
      const ok = wRev.ok;
      if (ok) {
        stats.rawRevives++;
        if (WA.log) WA.log('warn', 'settingsBus: ' + r.key + ' 检测到历史原始格式（非 JSON 原文），已复活为 JSON 契约值——旧版本写入的裸值不再被判为损坏而丢弃');
      } else if (WA.log) {
        WA.log('error', 'settingsBus: ' + r.key + ' 原始格式已识别但复活写盘失败（本次未落盘，键仍是旧格式）', wRev.error);
      }
      return { revived: ok, raw: raw, value: value, reason: ok ? 'revived' : ('write-failed: ' + String(stats.lastWriteError || 'unknown')) };
    }
    return { revived: true, raw: raw, value: value, reason: 'revivable' };
  }
  /**
   * v2.5.0: 结构迁移引擎（enabled）。registry 里 declarative 登记项的 `migrate` 函数此前**零调用**
   *   ——settings-bus 头部自述「未来新增 upgrade 钩子」而从未实现，20+ 行 legacy 迁移代码也因
   *   零登记而结构性死掉（全库无一个 `legacy: [...]`）。本引擎让声明式迁移真正生效。
   *
   * 契约（关键，决定了它不会成为新的静默失效源）：
   *   · 形状不符即跳过——只有磁盘值**不是对象**（或为空）时才尝试迁移；已是对象则返回 unchanged。
   *     这条保证「用户正常配置永远不会被迁移函数碰到」：迁移只处理「旧结构/异形」。
   *   · 例外：登记项显式声明 `migrateObjects:true` 时，对象形态也会被交给迁移函数。
   *     理由（本轮实证）：`worldaxis_regional_settings_v1` 的 def 在 v2.3.0 从 8 个子键**缩减**
   *     为 3 个（剔除 5 个零消费死键），而老存档里那 5 个死子键既不会被子键补齐删掉（补齐只加不减），
   *     又被 `Object.assign(read(), patch)` 式保存**每次原样写回** —— 死键永久驻留。
   *     缩减型演化必须能声明迁移，否则「只加不减」是结构性缺陷。
   *   · 每个键对**同一份值形态**每会话至多尝试一次（无论成败）——迁移抛错时不得变成每次 read 都重试的热路径。
   *     为什么是「同一份值形态」而不是「每键每会话」：首版按「每键每会话」写，实测立刻暴露结构性缺陷——
   *     热路径上第一次 read（磁盘无值 → 回落到 def）就会把该键记为 skip，此后**整个会话**即便磁盘真值
   *     变成旧结构也不再尝试迁移（顺序耦合：谁先读谁决定）。改为按值形态记账后，同一份坏值仍只试一次
   *     （失败不会重试），而值真的换了形态时获得恰一次新机会。形态串只含子键名与类型/长度，不含值内容。
   *   · 抛错的键永久标记为「未迁移」并在诊断里以 error 报出（绝不静默）。
   *   · 迁移后立即回写，并记 stats.migrations / lastMigration（可观测）。
   *   · 返回值只用于统计；**绝不改写用户的正常值**。
   * @param {object} reg 登记项（需 migrate:function）
   * @param {*} val 已解析的磁盘值
   * @returns {*} 迁移后的值（跳过/失败/未启用时原样返回）
   */
  const __migTried = Object.create(null);   // '<key>|<值形态>' -> { status:'ok'|'skip'|'fail', at, reason }
  /**
   * v2.5.0: 迁移记账用的「值形态串」——只含类型与结构，**不含任何值内容**（无隐私外泄面）。
   *   为什么不能只按 key 记账：见上文契约第三条（热路径上「先读到空值」会把整会话机会占掉）。
   *   对象取子键名集合（排序后）+ 数组取长度，足以区分「同一份坏值」与「换了形态的新值」。
   */
  function migShapeKey(v) {
    if (v === undefined) return 'undef';
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'arr:' + v.length;
    if (typeof v === 'object') {
      try {
        // 必须排除 _schema：它是**存储层元数据**，而 schemaStamp 会在 read 路径把它写进磁盘值。
        // 若不排除，则「首次 read 迁移抛错（未回写）」与「再次 read（磁盘已被盖章改了形态）」
        // 会被判成两份不同的值形态 → 守卫失效 → 坏值每次 read 都重试（正是本节要防的热路径）。
        // 本版实测即由此交互抓出（两个新机制的耦合缺陷）。
        return 'obj:' + Object.keys(v).filter(function (k) { return k !== '_schema'; }).sort().join(',');
      } catch (e) { return 'obj'; }
    }
    return typeof v + ':' + String(v).length;
  }
  function migrateIfNeeded(reg, val) {
    const r = reg || {};
    if (typeof r.migrate !== 'function' || !r.key) return val;
    const isObj = val && typeof val === 'object' && !Array.isArray(val);
    if (isObj && r.migrateObjects !== true) return val;   // 正常结构 → 迁移函数一律不碰（除非显式声明缩减型演化）
    const mk = r.key + '|' + migShapeKey(val);
    if (__migTried[mk]) return val;            // 同一份值形态本会话已尝试过（含失败）→ 不重试
    if (val === null || val === undefined) { __migTried[mk] = { status: 'skip', at: now(), reason: 'absent' }; return val; }
    let out = val, status = 'skip', reason = null;
    try {
      const res = r.migrate({ value: val, key: r.key, def: r.def });
      if (res && res.changed === true) {
        out = res.value;
        // v2.6.0: 回写结果必须并入迁移结论——此前回写包在裸 try 里、失败静默，
        //   于是 stats.migrations++ 已经记了「成功」，磁盘上却还是旧结构（下次启动再迁一遍），
        //   诊断里显示的「已成功迁移 N 个」是假的。迁移的成败定义应是「新结构真的落盘」。
        // v2.6.0（收口）: 回写经统一出口记账——ls_set 契约是「永不抛」，序列化失败也在内部记账
        //   并返回 ok:false，故「迁移成没成」的判据只有一条：**新结构真的落盘了**。
        //   此前回写失败**只**计 migrationFailed，`settingsBus.write` 议题不报、面板「写入侧」行
        //   仍显示「全部落盘」，而用户磁盘上的结构其实没变（下次启动再迁一遍）。
        const wbRes = ls_set(r.key, out, 'writeback');
        const wErr = wbRes.ok ? null : (wbRes.error || { message: String(stats.lastWriteError || 'write-failed') });
        const wroteBack = wbRes.ok;
        if (wroteBack) {
          status = 'ok'; reason = res.reason || null;
          stats.migrations++;
          stats.lastMigration = { key: r.key, at: now(), reason: reason, from: shapeOf(val), to: shapeOf(out) };
          if (WA.log) WA.log('warn', 'settingsBus: ' + r.key + ' 结构迁移 ' + shapeOf(val) + ' → ' + shapeOf(out) + (reason ? '（' + reason + '）' : ''));
        } else {
          status = 'fail';
          reason = 'writeback-failed: ' + String((wErr && (wErr.message || wErr)) || wErr).slice(0, 120);
          stats.migrationFailed++;
          stats.lastMigration = { key: r.key, at: now(), reason: reason, failed: true };
          try { __migFailed[r.key] = reason; } catch (e0) {}
          if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 结构迁移算完但回写失败（' + reason + '）——磁盘仍是旧结构，下次读取会再次尝试');
        }
      } else {
        status = 'skip'; reason = (res && res.reason) || 'no-change';
      }
    } catch (eM) {
      status = 'fail'; reason = String((eM && (eM.message || eM)) || eM).slice(0, 160);
      stats.migrationFailed++;
      stats.lastMigration = { key: r.key, at: now(), reason: reason, failed: true };
      // 失败必须可见：迁移没跑成 = 旧结构继续被当作「畸形值」消费，属需要人处理的状况
      try { __migFailed[r.key] = reason; } catch (e0) {}
      if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 结构迁移失败（' + reason + '）——本键按原值继续，诊断会持续报出');
    }
    __migTried[mk] = { status: status, at: now(), reason: reason };
    return out;
  }
  const __migFailed = Object.create(null);
  /**
   * v2.5.0: 缩减型演化迁移器工厂（单一实现）。
   *
   * 为什么要有工厂：本轮有两个键需要同一种迁移（regional / evolution —— 都是 v2.3.0
   *   只在声明侧剔除死键、老存档磁盘上的死子键永久驻留）。若各自内联一份「白名单式保留」
   *   逻辑，就是本版反复批评的**第二份真源**形态（两份实现日后必然分叉）。
   * 口径：只保留 def 声明的子键（`_schema` 为存储层元数据，必须一并保留），
   *   无死子键时返回 `changed:false`（迁移函数被调用但无事可做的正常情形，幂等）。
   * @param {object} def 该键的声明默认值
   * @returns {function} 符合 migrateIfNeeded 契约的 migrate 钩子
   */
  function makeSubkeyPruner(def) {
    return function (ctx) {
      const v = ctx && ctx.value;
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { changed: false, reason: 'not-object' };
      const keep = {}; const dropped = [];
      Object.keys(v).forEach(function (k) {
        if (k === '_schema' || Object.prototype.hasOwnProperty.call(def, k)) keep[k] = v[k];
        else dropped.push(k);
      });
      if (!dropped.length) return { changed: false, reason: 'no-stale-subkeys' };
      return { changed: true, value: keep, reason: 'dropped-stale-subkeys:' + dropped.join(',') };
    };
  }
  /**
   * v2.6.0（收口）: 写失败归类记账——单一实现。
   *   为什么需要：本版首轮把归因串直接写在各失败点（save 内三处），结果是**同一类故障的记账
   *   要在每个点各写一遍**，而没人记得去补的地方就断档——正向审计抓到的正是这个：
   *   迁移回写 / 结构盖章 / legacy 迁移三条路径的写失败压根没有记账。
   * @param {string} tag 分类标签（决定 writeFailedBy 的桶，同时作为默认前缀）
   * @param {*} err 原始错误或原因串
   * @param {string} [prefix] 覆盖默认前缀（用于 missing-key / stringify 这类可读前缀）
   */
  function noteFail(tag, err, prefix) {
    stats.writeFailed++;
    try {
      const t = tag || 'setItem';
      if (stats.writeFailedBy && stats.writeFailedBy[t] !== undefined) stats.writeFailedBy[t]++;
      else if (stats.writeFailedBy) stats.writeFailedBy.setItem++;
    } catch (eC) { /* 分类计量失败不影响主计量 */ }
    const msg = String((err && (err.message || err)) || err);
    stats.lastWriteError = (prefix || ((tag || 'setItem') + ': ')) + msg.slice(0, 160);
  }
  /**
   * v2.6.0（收口）: **唯一写盘出口**——设置家族键的每一次真实写入都必须经过这里。
   *
   * 为什么必须统一（本轮正向审计抓出的自身缺陷）：本版命题是「写失败可见」，但首轮只为
   *   `save()` 与 `rawRevive` 两条路径接了计量，另有四条真实写路径仍在静默失败：
   *     · 迁移回写——失败只记 migrationFailed，`settingsBus.write` 议题不报，面板照样显示「全部落盘」；
   *     · 结构盖章——失败时 `catch { return false }`，**一个字节的记录都没有**；
   *     · legacy 旧键迁移写盘——`catch (e4) {}` 完全静默；
   *     · 损坏隔离副本写盘——失败被吞掉后**照样删原键**（「隔离」变成「直接销毁用户数据」）。
   *   后果不是命名不实，而是**结论不实**：面板给出了「全部落盘」的判定，而判定的依据面并不
   *   覆盖全部写路径。统一出口后，`writes / writeFailed` 对所有写路径成立，判定的依据面与
   *   判定的措辞才一致。
   *
   * 语义：**永不抛**（返回 {ok, error}）——调用点多在 read 热路径上，把「写不进去」升级成
   *   「读不出来」是把小故障放大成大故障。失败一律记账 + 归因，由调用方决定是否改变自己的结论。
   *   写盘统计计「成功」（自增在 setItem 之后）：若放在之前，失败时 writes 与 writeFailed 同增，
   *   诊断里「成功 N 次」立刻虚高，读的人会以为写进去了。
   * @param {string} key
   * @param {string} payload 已序列化字符串
   * @param {string} [from] 来源标签（走 writeFailedBy 分类）
   * @returns {{ok:boolean, error?:*, bytes:number}}
   */
  function lsWrite(key, payload, from) {
    const ls = (WA.mainWin || window).localStorage;
    const bytes = payload ? payload.length : 0;
    try {
      ls.setItem(key, payload);
      stats.writes++;
      stats.lastWrite = { key: key, bytes: bytes, at: now() };
      stats.lastWriteError = null;
      return { ok: true, bytes: bytes };
    } catch (e) {
      noteFail(from || 'setItem', e, (from && from !== 'setItem') ? (from + ': ') : 'setItem: ');
      return { ok: false, error: e, bytes: bytes };
    }
  }
  /**
   * 内部：写盘（迁移回写 / 结构盖章 / legacy 迁移 / 原始格式复活共用）。
   *   v2.6.0 收口后一律经统一出口 lsWrite 记账；序列化失败也在内部记账（它与写盘失败原因不同：
   *   循环引用 vs 配额，但同样意味着「这次写入没有发生」）。
   *   **契约：永不抛**——故调用方无需再包 try，也不会出现「漏包 try 就漏记账」的断档。
   */
  function ls_set(key, value, from) {
    let payload = null;
    try { payload = JSON.stringify(value === undefined ? null : value); }
    catch (eS) { noteFail(from || 'writeback', eS, 'stringify: '); return { ok: false, error: eS }; }
    return lsWrite(key, payload, from || 'writeback');
  }
  function ls_keys() {
    const ls = (WA.mainWin || window).localStorage;
    const out = [];
    try {
      const n = typeof ls.length === 'number' ? ls.length : 0;
      for (let i = 0; i < n; i++) {
        const k = ls.key(i);
        if (typeof k === 'string' && k.indexOf('worldaxis_') === 0) out.push(k);
      }
    } catch (e) { /* 非标准实现 → 空清单，不炸 */ }
    return out;
  }
  function ls_raw(key) { try { return (WA.mainWin || window).localStorage.getItem(key); } catch (e) { return null; } }
  /** 已知命名空间（非 settings 的家族）——幽灵盘点时须排除，否则会把诊断键报成「未登记设置」。
   *
   * v2.5.0: 本清单**降级为回退**。原先它是唯一判据，这与本轮在 core/store.js 里刚删掉的
   *   `settingsSettings` 白名单属**同型缺陷**（第二份真源必漂移）：store.js 的 KEY_FAMILIES
   *   才是「键归属哪个家族」的真源，本文件另存一份前缀清单，日后新增家族（如 stateDerived
   *   这类）就必然分叉。现在优先消费 `WA.store.classifyKey`（单一真源），仅当 store 不可用
   *   （settings-bus 在 LOAD_ORDER 中先于 store，加载期及单测早期可能不在）才退回本清单。
   *   注：本清单当前与 KEY_FAMILIES 的家族前缀集合逐一核对一致（见 v2.5.0 测试 D9 的一致性断言）。
   */
  const KNOWN_PREFIXES = ['worldaxis_state_', 'worldaxis_recovery_', 'worldaxis_event_log_', 'worldaxis_error_log_',
    'worldaxis_wf_history_', 'worldaxis_uninject_ledger_', 'worldaxis_wb_selection_', 'worldaxis_conflict_',
    'worldaxis_writer_id'];
  /**
   * v2.5.0: 懒查 store 的家族分类（单一真源）。返回 null 表示分类器不可用 → 调用方走回退清单。
   *   刻意不写成加载期依赖：settings-bus 先于 store 加载，任何顶层引用都会踩 TDZ/未定义。
   */
  function familyOf(key) {
    try {
      if (WA.store && typeof WA.store.classifyKey === 'function') {
        const c = WA.store.classifyKey(key);
        return (c && c.family) ? c.family : null;
      }
    } catch (e) { /* store 不可用 → null，交由回退清单判定 */ }
    return null;
  }
  /** 格式化/历史遗留的键名后缀（非模块登记，但确实是本扩展写的） */
  const KNOWN_SUFFIX_RE = /(_corrupt_\d+|_corrupt_\d+_corrupt_\d+)$/;
  /**
   * v2.5.0: 剥掉结构指纹元数据（返回给消费端的视图用）。
   *
   * 为什么必须剥：`_schema` 是**存储层元数据**，不是设置项。若随 read() 返回给消费端，
   *   会立刻污染两类既有契约——① `ui/settings.js` 等以「子键数等于 def 声明数」校验形态的
   *   代码；② `Object.assign(read(), patch)` 式保存会把元数据当成用户设置项回写；
   *   ③ `verifyDefaults` 的形状比对会把「多了 _schema」当成声明漂移。
   *   （本版首轮实测即由既有的「可见性 10 源全部有值」断言当场挡下：返回对象多了第 11 个键。）
   * 做法：**浅拷贝顶层并剔除 _schema**，绝不改动传入对象（磁盘真值仍带 _schema，
   *   以便 save() 在回写时把它原样带回去）。只处理顶层——本仓库的登记键值均为顶层对象。
   * @param {*} val
   * @returns {*} 无 _schema 的浅拷贝；非对象原样返回
   */
  function stripStamp(val) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return val;
    if (!Object.prototype.hasOwnProperty.call(val, '_schema')) return val;
    const out = {};
    Object.keys(val).forEach(function (k) { if (k !== '_schema') out[k] = val[k]; });
    return out;
  }
  /**
   * v2.5.0: 结构指纹写入（schemaStamp）——把「这份磁盘值是哪个 def 形状写的」记进键的值里。
   *
   * 为什么需要：本插件 12 个 `_v1` 设置键的历史修改次数是 1–8 次（backstage 8 次、opinion 6 次、
   *   workflow / oracle 各 4 次），也就是说**这些键的 `_v1` 后缀早已名不副实**——键名说 v1，
   *   内容却经历了多轮结构增补。而此前磁盘值里**没有任何结构标识**，于是一个「本插件读不出来的
   *   版本」的键只能表现为「值看起来对、行为不对」或「被 JSON.parse 判为损坏」两种极端，
   *   无法回答最基本的问题：这份磁盘值是哪个版本写的？
   *
   * 做法：只在「磁盘值与声明形状不符」时才写。判据两条——① `_schema` 字段缺失；② 用对象自身
   *   子键（排除 `_schema`）算出的指纹与当前 def 指纹不同。两条都不满足则**一个字节不写**，
   *   因此「用户正常配置」永远不会被本函数碰到（不会污染、不会触发额外 IO）。
   *
   * 形态：`{ ...用户子键..., _schema: { fp: '<指纹>', d: '<FNV 短摘要>', at: <写入时间> } }`
   *   · 键名刻意不在任何 `def` 里，故 applyDefaults / 消费端 / verifyDefaults 全部不会碰到它；
   *   · `selfCheck` 的 `def` 声明完备性检查只比对 def 侧，不受影响；
   *   · 指纹只含**子键名与 typeof**，不含任何值——用户配置内容不进指纹（无隐私外泄面）。
   * 留痕：stats.schemaStamps 记录写入次数（该数长期为 0 = 所有键都是当前结构，属正常状态）。
   * @param {object} reg 登记项
   * @param {*} val 已解析（且已迁移）的磁盘值
   * @returns {boolean} 是否真的写了盘
   */
  function schemaStamp(reg, val) {
    const r = reg || {};
    const def = r.def;
    const fp = schemaFingerprint(def);
    if (!fp || !r.key) return false;
    if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
    if (val._schema && val._schema.fp === fp) return false;      // 已是当前结构 → 零写入
    const cur = Object.keys(val).filter(function (k) { return k !== '_schema'; });
    if (cur.length && schemaFingerprint((function () { const o = {}; cur.forEach(function (k) { o[k] = val[k]; }); return o; })()) === fp) {
      return false;                                               // 子键全集与声明一致 → 零写入
    }
    // v2.5.0: 本处**刻意不设**「每会话每键至多写一次」守卫。
    //   首版曾加该守卫以防写盘风暴，但实测立刻暴露它与 v2.3.0 的既有缺陷同型：
    //     · 一旦首次盖章失败（配额/异常），本会话此后永不重试 → 指纹永久缺失；
    //     · 更严重的是**顺序耦合**——守卫按「键名」记账，跨会话/跨标签页的状态重置
    //       （用户清缓存、另一标签页写值、测试内 fresh）后不再盖章，行为取决于谁先读。
    //   正确做法是依赖上面两条**精确**幂等判据：盖章成功后 `val._schema.fp === fp` 立即成立，
    //   后续每次 read 都会在第一个条件处直接返回，天然零写入（不需要时间维度的记忆）。
    try {
      val._schema = { fp: fp, d: fingerprintDigest(fp), at: now() };
      // v2.6.0（收口）: 盖章写盘此前是**完全静默**的失败路径（catch 后直接 return false，
      //   一个字节的记录都没有）。盖章失败意味着「结构不符」每次读取都要重算、指纹永远缺失，
      //   而它与配置写入失败同因（配额/隐私模式）——不进写入台账，「全部落盘」这个判定就是假的。
      const stRes = ls_set(r.key, val, 'stamp');
      if (!stRes.ok) {
        if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 结构指纹写入失败（本次未落盘）：下次读取会重算并再试', stRes.error);
        return false;
      }
      stats.schemaStamps++;
      return true;
    } catch (e) { return false; }
  }
  /**
   * v2.5.0: 未登记设置键（幽灵设置）盘点——磁盘上存在、前缀 worldaxis_、且**既不在登记表、
   *   也不属于任一已知非 settings 家族**的键。
   *
   * 为什么需要（本轮实证）：`worldaxis_director_tags_v1` 在 v0.1.0 真实存放「启用的导演标签」，
   *   v0.2.0 整个功能被移除，但该键**从未登记**也**从未清理**。而 `sweepStaleKeys` 的规则是
   *   「settings 家族永不清理（用户数据）」+ 白名单外的键一律走 `return { family:'settings' }` 兜底
   *   ⇒ 这类键**永远不会被任何人清理**，永久滞留用户磁盘。登记表管不到它（没登记），
   *   清理规则也管不到它（被当用户数据保护），责任真空。
   *
   * 口径保守（宁可漏报不可误报）：只报告，不删除；家族前缀命中即跳过；`*_corrupt_*` 跳过
   *   （那是隔离副本，另有一条清理规则）。真删除一律走 sweepStaleKeys({ apply:true })。
   * @returns {{keys:Array<{key:string,bytes:number,shape:string}>, total:number, bytes:number}}
   */
  function ghostScan() {
    const regs = WA.__settingsRegs || [];
    const known = Object.create(null);
    regs.forEach(function (r) { if (r && r.key) known[r.key] = true; });
    const rows = [], seen = [];
    ls_keys().forEach(function (k) {
      if (known[k]) return;
      if (KNOWN_SUFFIX_RE.test(k)) return;
      // v2.5.0: 优先问 store 家族分类（单一真源）；不可用时退回本地前缀清单（见 familyOf 注释）
      const fam = familyOf(k);
      if (fam !== null) {
        // 真源判定：凡不是「设置」家族的键都不算幽灵设置（含 settings 本身 —— 那属在册键，
        //   走 known[] 那条分支；此处兜底防御登记表与分类器短暂不一致的时序）。
        if (fam !== 'settingsUnregistered') return;
      } else {
        for (let i = 0; i < KNOWN_PREFIXES.length; i++) {
          if (k.indexOf(KNOWN_PREFIXES[i]) === 0) return;
        }
      }
      const raw = ls_raw(k);
      rows.push({ key: k, bytes: raw ? raw.length : 0, shape: raw === null ? 'absent' : (/^\s*[[{]/.test(raw) ? 'json' : 'raw') });
      seen.push(k);
    });
    rows.sort(function (a, b) { return b.bytes - a.bytes; });
    return { keys: rows, total: rows.length, bytes: rows.reduce(function (s, x) { return s + x.bytes; }, 0) };
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
          // v2.5.0: 历史原始格式复活（幂等、可重复）——必须在 JSON.parse **之前**：
          //   旧版本把裸字符串写进本键时，JSON.parse 会抛错并把**用户真实配置**判为损坏、
          //   隔离、回落默认。reg.rawRevive 声明「本键存在这种历史格式」，只对声明过的键生效。
          const __rev = rawReviveDef(r, false);
          if (__rev.revived) {
            // 复活成功 → 直接用复活后的值。**不能**留 val=null：那会回落 r.def，
            //   把刚从旧格式救回来的用户配置又丢掉（本版首轮实现即犯此错，由逆向审计抓出）。
            val = __rev.value;
            raw = JSON.stringify(val);
          } else {
            try { val = JSON.parse(raw); }
            catch (e) {
              // 当前键损坏：留痕 + 隔离（sweep 可归置）
              stats.quarantines++;
              const qk = r.key + '_corrupt_' + now();
              // v2.6.0（收口）: 隔离副本写盘失败此前被 `catch(e2){}` 吞掉，而下一行**照样**删掉
              //   原键——于是「隔离」变成「直接销毁用户数据」，且零痕迹。改为：副本没写成功就不动
              //   原键（保命优先），并记账；原键保留 → 下次读取会再次尝试隔离，直到副本真的写下。
              const wQ = lsWrite(qk, raw, 'quarantine');
              if (wQ.ok) { try { ls.removeItem(r.key); } catch (e3) {} }
              else if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 损坏但隔离副本写盘失败，已保留原键不做删除（避免直接销毁用户数据）', wQ.error);
              if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 损坏已隔离 → ' + qk + '（重置默认）', String(raw).slice(0, 200));
              val = null;
            }
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
              // v2.6.0（收口）: 此前 `catch(e4){}` 完全静默——旧键已解析出值、本次仍可用，
              //   但迁移写盘失败时用户每次启动都要重迁一遍，而台账里查不到任何痕迹。
              const wLg = ls_set(r.key, val, 'legacy');
              if (!wLg.ok && WA.log) WA.log('error', 'settingsBus: ' + lk + ' 迁移 → ' + r.key + ' 写盘失败（本次未落盘，下次读取会重试）', wLg.error);
              if (r.legacyRemove !== false) { try { ls.removeItem(lk); } catch (e5) {} }
            } catch (e) {
              // legacy 键也损坏：隔离留痕（防 v2 发布后误读老损坏格式）
              stats.quarantines++;
              const qk = lk + '_corrupt_' + now();
              // v2.6.0（收口）: 与设置键隔离同规格——副本没写成功就不删旧键（保命优先）。
              const wQL = lsWrite(qk, lraw, 'quarantine');
              if (wQL.ok) { try { ls.removeItem(lk); } catch (e7) {} }
              else if (WA.log) WA.log('error', 'settingsBus: ' + lk + '（legacy）损坏但隔离副本写盘失败，已保留旧键不做删除', wQL.error);
              if (WA.log) WA.log('error', 'settingsBus: ' + lk + '（legacy）损坏已隔离 → ' + qk, String(lraw).slice(0, 200));
            }
            break;
          }
        }
      } catch (e) { stats.failures++; }
      if (val === null || val === undefined) val = r.def;
      // v2.5.0: 顺序至关重要——迁移 → 结构指纹 → 子键补齐。
      //   · 迁移在最前：它可能改变值的**形状**（标量 → 对象），必须在形状被补齐逻辑依赖之前完成。
      //   · 指纹在补齐之前：指纹记录的是「磁盘上**真实存在**的结构」，若先补齐再盖指纹，
      //     指纹就会把「运行时补出来的默认值」也当成用户存档的一部分（指纹随即失真）。
      //   · 补齐在最后、且只作用于返回值副本（v2.4.0 既定口性：磁盘不因读取而回写补齐值）。
      val = migrateIfNeeded(r, val);
      schemaStamp(r, val);
      // v2.4.0: 整键之外还要补**子键**——旧存档缺新字段时子键为 undefined，
      //   会在消费端静默改变语义（见 applyDefaults 注释）。补齐后再返回独立拷贝。
      val = applyDefaults(r, val);
      try { return JSON.parse(JSON.stringify(stripStamp(val))); } catch (e) { return stripStamp(val); }
    },
    /** v2.4.0: 子键补齐导出（模块侧自定义加载路径可复用同一实现，避免二次分叉） */
    applyDefaults(reg, val) { return applyDefaults(reg, val); },
    /** v2.5.0: 结构指纹（只读）——当前 def 的形状摘要与短编号。注意不掩盖非法入参（传 null 即 null） */
    schemaFingerprint(def) { const fp = schemaFingerprint(def); return { fp: fp, digest: fingerprintDigest(fp) }; },
    /** v2.5.0: 结构迁移引擎（只读触发点，供自检/面板对单个登记项显式迁移） */
    migrate(reg, val) { return migrateIfNeeded(reg, val); },
    /** v2.5.0: 迁移尝试台账（只读）——本会话每个「键+值形态」的迁移结果，含失败的 */
    migrationStat() {
      const tried = {};
      Object.keys(__migTried).forEach(function (k) { tried[k] = __migTried[k]; });
      return { tried: tried, count: Object.keys(tried).length, ok: stats.migrations,
        failed: stats.migrationFailed, failedKeys: Object.keys(__migFailed), last: stats.lastMigration };
    },
    /** v2.5.0: 历史原始格式复活（只读检查 / 显式执行） */
    rawRevive(reg, probe) { return rawReviveDef(reg, probe === true); },
    /** v2.5.0: 未登记设置键（幽灵设置）只读盘点——登记表与清理规则都管不到的键 */
    ghostScan() { return ghostScan(); },
    /**
     * v2.6.0: 写入侧只读台账。
     *
     * **适用范围（v2.6.0 收口时实证确认，非估计）**：本台账覆盖**设置家族键**
     *   （`worldaxis_*_settings_v1` / `worldaxis_*_v1` 等经注册表声明的键）的全部写路径。
     *   全库另有 14 处直写 localStorage 的**旁路点**，实测**全部**落在非 settings 家族：
     *     · `state`（store.js 主状态、chatcache installPack）——自带「写后读回校验」
     *       （`__integrityStat` / writeVerified），且另有 store.integrity 议题出口；
     *     · `state*_corrupt_*`（store.js 损坏隔离）——**保留原键不删**，无销毁语义；
     *     · `recovery`（恢复点环形列表）；`conflict`（冲突现场键）；`writerId`（多实例标识）；
     *     · `diagnostic`（event_log / error_log / wf_history / uninject_ledger）；
     *     · `wb`（世界书选择）。
     *   它们各有完整性或修订号机制，且不是「用户点保存」的路径——**不需要**并入本台账。
     *   判据来自 `WA.store.classifyKey`（v2.5.0 起为单一真源），并由测试块 G13 逐点固化为
     *   机器可校验的清单：**任何新增的 settings 家族旁路写点会让该断言失败**。
     *   这条边界的意义在于诚实：台账说「全部落盘」时，它指的是**设置键**全部落盘；
     *   把口径模糊成整个扩展的所有写盘，就是另一种计量不实。
     *
     * 已知残留缺口（本版未修，登记备查）：`engines/chatcache.js:96` 的 `installPack` 写 state
     *   未做写后读回校验（其余 store 主路径均经 writeVerified / 校验出口），跨设备对账时
     *   「安装成功」与「安装失败」不可区分 —— 属 state 家族，归下一轮。
     *
     * 为什么需要（本轮命题）：读侧已有 reads / subkeyFills / migrations / rawRevives / schemaStamps
     *   五组计量，**写侧一个都没有**。而「保存了却没生效」是用户唯一会当场察觉、却最难取证的一类故障——
     *   `save()` 早就在返回 false，但调用方零检查、stats 零记录、日志零输出，于是「配额写满」与
     *   「功能没实现」在诊断包里长得一模一样。本视图把三个失败来源（缺 key / 序列化 / setItem）
     *   与最近成功写入一起摊开，使「写不进去」第一次可判定。
     * @returns {{writes:number, writeFailed:number, ok:boolean, last:object|null, lastError:string|null,
     *   subkeyDrift:{count:number, last:object|null}}}
     */
    writeStat() {
      // v2.6.0（收口）: ok 的语义只有在本计量**覆盖全部写路径**时才成立——这也是本版收口的原因
      //   （首版只覆盖两条路径，ok 会在「迁移回写刚失败」时报 true）。bySource 让「环境问题」
      //   与「代码缺陷」可分辨，否则用户拿到的结论是「清理存储再试」而实际是实现的 bug。
      const bySource = {};
      try { const src = stats.writeFailedBy || {}; Object.keys(src).forEach(function (k) { bySource[k] = src[k]; }); } catch (e) {}
      return { writes: stats.writes, writeFailed: stats.writeFailed,
        ok: stats.writeFailed === 0, last: stats.lastWrite, lastError: stats.lastWriteError,
        bySource: bySource,
        subkeyDrift: { count: stats.extraSubkeys, last: stats.lastExtra } };
    },
    /**
     * v2.6.0: 严格写入——失败即返回原因，供「必须知道自己有没有存进去」的调用点使用。
     *
     * 与 save() 的关系：save() 的契约是「尽力写、返回布尔」，适合热路径与尽力而为的保存；
     *   但**用户主动点击保存**的路径不该满足于此——那里失败必须能回显给用户。
     *   本函数不改变 save() 的任何行为（不新增分支、不缓存状态），只是把它已经算出来的
     *   失败原因结构化地交还给调用方（save 内部已把 lastWriteError 写进 stats）。
     * @returns {{ok:boolean, reason?:string}}
     */
    saveOrThrow(reg, value) {
      const ok = this.save(reg, value);
      if (ok) return { ok: true };
      return { ok: false, reason: stats.lastWriteError || 'write-failed（原因未记录）' };
    },
    /**
     * v2.5.0: 缩减型演化迁移器（单一实现，供各模块在登记项上引用）。
     *
     * 用法：`const __REG = { key, def: DEF, migrateObjects: true, migrate: WA.settingsBus.subkeyPruner(DEF) }`
     * 注意须在 settingsBus 已加载后取用（各模块均在其后加载）；`def` 必须是同一份 DEF 对象，
     * 否则「保留白名单」会与「登记表声明」分叉。
     */
    subkeyPruner(def) { return makeSubkeyPruner(def); },
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
      // v2.6.0: 三个失败来源必须都可见——「静默写不进去」是配置丢失里最难查的一类。
      if (!r.key) {
        noteFail('missingKey', '（登记项未声明 key）', 'missing-key');
        if (WA.log) WA.log('error', 'settingsBus: save 被调用但登记项缺 key —— 写入被丢弃（调用方传值无效）');
        return false;
      }
      const ls = (WA.mainWin || window).localStorage;
      let out = (value === undefined ? null : value);
      // v2.5.0: 回写时继承磁盘上的结构指纹——消费端拿到的 read() 结果里**没有** _schema
      //   （见 stripStamp），若 save 直接覆盖，用户每保存一次设置就会把指纹抹掉，
      //   于是下次 read 又要重新盖章（指纹变成「最后保存时间」而非「结构版本」，失去意义）。
      //   只补不覆盖：值里已带 _schema 时以调用方为准（schemaStamp 自己会写）。
      if (out && typeof out === 'object' && !Array.isArray(out) && !Object.prototype.hasOwnProperty.call(out, '_schema')) {
        let inherit = null;
        try {
          const rawPrev = ls.getItem(r.key);
          if (rawPrev) {
            const prev = JSON.parse(rawPrev);
            if (prev && typeof prev === 'object' && prev._schema) inherit = prev._schema;
          }
        } catch (eP) { /* 上一版读不出来 → 不继承，下次 read 会重新盖章 */ }
        // v2.5.0: 必须**先拷贝再挂**，绝不原地改写调用方对象。
        //   本仓库的调用惯例是 `setSettings(o){ save(Object.assign(loadSettings(), o)) }`——
        //   传入的多是临时对象，但 registry/settings 页等处会复用同一引用；一旦原地挂上
        //   _schema，该对象后续再被传给别处就会带上存储层元数据（与 def 别名污染同型：
        //   模块侧无法区分「这是我的设置项」与「这是存储层塞进来的元数据」）。
        if (inherit) {
          const copy = {};
          Object.keys(out).forEach(function (k) { copy[k] = out[k]; });
          copy._schema = inherit;
          out = copy;
        }
      }
      // v2.6.0: 序列化与写盘分两步、各自可归因。
      //   此前 `JSON.stringify(out)` 就在 try 里与 setItem 同段——两者失败原因完全不同
      //   （前者是值不可序列化/循环引用，后者是配额/隐私模式），混在一起无法诊断。
      let payload = null;
      try { payload = JSON.stringify(out); }
      catch (eS) {
        noteFail('stringify', eS, 'stringify: ');
        if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 值无法序列化，写入被丢弃', eS);
        return false;
      }
      if (payload === undefined) {   // 例如 value 是函数/undefined 且未走上面的 null 归一
        noteFail('stringify', 'undefined（值不可表示）', 'stringify: ');
        return false;
      }
      //   v2.6.0（收口）: 写盘一律经统一出口 lsWrite——记账、字节量、清空 lastWriteError、失败分类
      //   全在那一处实现。此处不再自持一份写盘逻辑：**一份实现 + 一个计量**是台账能对账的前提。
      const wMain = lsWrite(r.key, payload, 'setItem');
      if (!wMain.ok) {
        if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 写入失败（配额/隐私模式/键被拒绝），用户改动未落盘', wMain.error);
        return false;
      }
      // v2.6.0: 顺带计量「写进来的 def 之外子键」——只计数，绝不剔除（写路径绝不改用户数据）。
      //   为什么不在 save 里剔：save 的语义是「把调用方给的东西存下去」，在此静默丢字段会让
      //   「我只改了一个开关」变成「我顺手删了你没见过的字段」，且会掩盖真正的缺陷源。
      //   正确分工——save 负责**如实记录与计量**，收口负责**未来源**（各模块收口 + 未来按键显式声明）。
      try {
        const def = r.def;   // 各模块的 __REG 均自带 def（与 __settingsRegs 里那份是同一对象引用）
        // 只对「有静态子键声明」的登记项判定：def 为空对象的容器型键（api_channels / workflow /
        //   registry）其子键是**动态的**（通道名、工作流节点 id、NPC 名），没有「声明之外」这个概念，
        //   否则每一次正常保存都会把全部动态子键报成漂移（本版首轮实测即踩到，属自造的误报）。
        if (def && typeof def === 'object' && !Array.isArray(def) && Object.keys(def).length > 0
            && out && typeof out === 'object' && !Array.isArray(out)) {
          const extra = Object.keys(out).filter(function (k) { return k !== '_schema' && !Object.prototype.hasOwnProperty.call(def, k); });
          if (extra.length) { stats.extraSubkeys += extra.length; stats.lastExtra = { key: r.key, keys: extra.slice(0, 8), at: now() }; }
        }
      } catch (eM) { /* 计量失败不影响写入 */ }
      return true;
    },
    /** 注册表（只读拷贝）：{ key, legacy, legacyRemove, optional, orphan, def, module } */
    registry() {
      return (WA.__settingsRegs || []).map(function (r) {
        return { key: r.key, legacy: (r.legacy || []).slice(), legacyRemove: !!r.legacyRemove,
          optional: !!r.optional, orphan: !!r.orphan, def: r.def, module: r.module,
          // v2.5.0: 生命周期能力声明也要可盘点，否则「能力实现了却无人行使」在治理层照样隐形
          hasMigrate: typeof r.migrate === 'function', rawRevive: !!r.rawRevive };
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
        // v2.5.0: 把 **原始串** 交给 subkeyGap，而非先 JSON.parse 再判。
        //   此前「解析失败 → parsed=null → return（跳过）」会把「磁盘上是非 JSON 原值」
        //   这一**最严重的**形态缺口从表里整个抹掉——而它恰恰是旧版本写裸值留下的现场。
        const g = subkeyGap(r, raw);
        if (g.missing.length) rows.push({ key: r.key, module: r.module || null, declared: g.declared, missing: g.missing, unparsable: !!g.unparsable });
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
      const warns = issues.length - errors;
      return { ok: errors === 0, total: rows.length, issues: issues, errorCount: errors, warnCount: warns,
        // v2.5.0: 生命周期声明覆盖——「结构迁移能力」与「原始格式复活能力」是否被登记项行使。
        //   两者长期零行使（migrate 零调用、rawRevive 不存在），而治理层当时**看不见**这种空转。
        lifecycle: { migrate: rows.filter(function (r) { return typeof r.migrate === 'function'; }).length,
          rawRevive: rows.filter(function (r) { return r.rawRevive; }).length,
          legacy: rows.filter(function (r) { return r.legacy && r.legacy.length; }).length } };
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
