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
  // v2.15.0: 原单一 now() 拆两类——决策时间（写进设置值 _schema.at / 隔离键名）走 clockNow，
  //   测量时间（stats.last* 内存台账）走 clockWall。此前同一个函数同时承担两种语义。
  function now() { try { return WA.clock.now('settingsBus'); } catch (e) { return Date.now(); } }
  function wallNow() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }
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
    writeFailedBy: { missingKey: 0, stringify: 0, setItem: 0, writeback: 0, rawRevive: 0, quarantine: 0, legacy: 0, stamp: 0, verify: 0 },
    // v2.7.0: 「写进去」与「存住了」是两件事——setItem 不抛错 ≠ 数据真的落盘。
    //   本仓库 store 侧自 v0.4.0 就有 writeVerified（写后立刻读回逐字符比对、不一致重试一次、
    //   两次都不一致则如实报失败），而**设置家族键完全没有这一层**：lsWrite 在 setItem 返回后
    //   直接置 ok:true。移动端在配额临界、写入毒化、后台回收下可能静默截断或丢弃写入——
    //   此时设置台账会显示「全部落盘」，而磁盘上是空的/旧的，用户下次打开配置回退却无从取证。
    //   本字段记录「setItem 未抛错但读回不一致」的次数（独立于 setItem 桶：前者是写被拒，
    //   后者是写被接受却没留住，两者的处置完全不同——前者清空间，后者只能重试/换键）。
    verifyFailed: 0, lastStaged: null,
    // v2.6.0: 写入侧死键计量——`save()` 收到「不在登记 def 里的子键」的次数与最近键名。
    //   v2.5.0 的缩减型迁移只解决了**存量**（老存档里已有的死子键），**增量**仍在继续：
    //   `Object.assign(read(), patch)` 把运行时算出的旧字段一并写回、`setChannel` 无白名单地
    //   接受任意额外字段，都会新造出 def 之外的子键，而迁移只在「读路径」触发、且对同形态只试一次。
    //   本计量让「谁在往设置里塞 def 之外的东西」第一次可观测（**只计数，一个字节都不改**）。
    //   命名口径：叫 extraSubkeys 而非 prunedSubkeys——本版**没有任何剪除动作**（写路径如实落盘），
    //   用「已剪除」命名会让读诊断的人以为死键已经被清掉了，是计量里最危险的那种不实。
    extraSubkeys: 0, lastExtra: null,
    // v2.9.0: 删除侧计量——写入侧自 v2.6.0 起有 writes/writeFailed/writeFailedBy/lastWriteError，
    //   **删除侧一个字段都没有**，而删除同样是写盘家族的破坏性操作（删错 = 用户数据没了）。
    //   实测三处现场：oracle 计划键（settings 家族、已登记）由裸 removeItem 删且删除失败时
    //   **抛错穿透**调用方（内存已清、磁盘键还在）；总线自己三处删除点包在 `catch(e3){}` 里
    //   **静默吞掉**；store 清理路径删除失败照样 removed++ 使计数虚高。
    //   命名口径：removes = 真正删除成功的次数；removeFailed = 删除未成功的次数；
    //   removeFailedBy 按来源分桶（guarded=删完复核仍在，missing=**登记项缺 key**，setItem=底层拒，
    //   quarantine/legacy/settings=各自调用点）。注意 missing 指的是「登记项没声明 key」这个**实现缺陷**，
    //   不是「键不存在」——后者是幂等无操作，走 removeAbsent 计量（v2.9.0 建成后纠正的首版误标）。
    removes: 0, removeFailed: 0, lastRemove: null, lastRemoveError: null,
    // v2.9.0: 失败按**来源**分桶。首版只声明 {guarded, missing, setItem}，而真实删除调用点是
    //   remove（设置键）/ quarantine（损坏隔离）/ legacy（旧键迁移）三种——三种都不在桶里，
    //   于是全部落进兜底桶 `setItem`，诊断里被报成「删除被拒」，而实际是隔离或迁移路径的删除
    //   失败。归因**不实**比缺失归因更坏：用户会照着「删除被拒（权限/策略）」去查权限。
    //   故改为：已知来源显式声明 + 未知来源动态建桶（新增调用点时归因不丢，不必改这张表）。
    removeFailedBy: { guarded: 0, missing: 0, setItem: 0, quarantine: 0, legacy: 0, settings: 0 },
    // v2.9.0: 「键本就不存在」单独计量——它不是删除成功。
    //   删除一个缺席的键是**幂等的无操作**，把它计进 removes 会让「N 次删除全部复核通过」
    //   这类结论虚高（与 v2.6.0 修掉的「writes 计尝试而非成功」同型）。
    removeAbsent: 0,
    // v2.9.0: 删除后复核——removeItem 不抛错不等于键真的没了（与写入侧 verifyFailed 同规格）。
    //   复核判据：删完立刻读回，仍能读到即视为**这次删除没有发生**。
    removeVerified: 0, removeStaged: 0, lastRemoveStaged: null,
    // v2.10.0: 读侧计量（**第三面**）——写侧自 v2.6.0 有 writes/writeFailed/writeFailedBy、
    //   删侧自 v2.9.0 有 removes/removeFailed/removeFailedBy，**读侧一个归因字段都没有**：
    //   全库只有一个 `stats.failures`（v0.1.x 遗留的**单桶**，存储层读抛错与 JSON 解析失败
    //   混在一起、来源不明），且实测**产品代码零消费**（没有任何模块读它、诊断不报、面板不显示）。
    //   后果就是本版命题的现场：`read()` 在磁盘有值却读失败时回落 `r.def`，调用方**无法区分**
    //   「用户从没配过，这是默认值」与「用户的配置读坏了，这是默认值」——**默认值伪装成用户配置**，
    //   而这恰恰是用户唯一会当场察觉（「我的设置怎么自己变回去了」）却最难取证的一类故障。
    //   命名口径：readFailed = 读失败次数（存储层抛错 + 解析失败 + 深拷贝往返失败）；
    //   readFailedBy 按来源分桶；readSources 记录**读到的到底是什么**
    //   （disk / legacy / default / defaultAfterFailure）——其中 defaultAfterFailure
    //   就是「数据丢失现场」的计数，它必须能被单独看见，绝不能混进正常回落。
    readFailed: 0, lastReadError: null, lastRead: null, lastReadFail: null,
    readFailedBy: { read: 0, parse: 0, migrate: 0, copy: 0 },
    readSources: { disk: 0, legacy: 0, default: 0, defaultAfterFailure: 0 },
    // v2.10.0: 深拷贝往返降级计量——`read()` 的返回值副本靠 JSON 往返生成，往返失败时
    //   既有实现**静默**返回内部对象的直接引用（`catch (e) { return stripStamp(val); }`）。
    //   后果不是「读不到」而是「读到的东西与总线内部对象共享引用」：库内最常见的调用惯例
    //   `setSettings(o){ save(Object.assign(read(), o)) }` 一旦改动返回值，就会**改到内部对象**，
    //   而磁盘上一个字节都没变——下次 read 会「莫名其妙」看到上一次的改动。属静默失效。
    readonlyCopyFallback: 0, lastCopyFallback: null,
    // v2.11.0: 结构指纹的**读侧消费**——v2.5.0 建立了指纹写入（schemaStamp），但全库只有
    //   `val._schema.fp === fp` 一个读判据，`.d`（摘要）与 `.at`（写入时间）**从未被任何
    //   消费端读过**；而「指纹存在但与当前 def 不同」这个最有信息量的状态（说明这份磁盘值
    //   是**另一个结构版本**写的）此前既不计也不报——盖章会直接把它覆盖掉，旧指纹静默消失。
    //   本版把指纹当**状态机**对待，并把「陈旧」单列：
    //     current  已与当前 def 一致（零写入）
    //     stamped  本次盖章成功（此前缺失或不符）
    //     stale    磁盘指纹存在但与当前 def 不同（旧结构写的 → 盖章前记下旧 fp/at）
    //     failed   识别出需要盖章但写盘失败（指纹永久缺失，每次读都重算）
    //     unshaped 非对象 def / 非对象值 → 本机制不适用（如实计入，不伪装成 current）
    // v2.11.0（R3 自纠）: `unreadable` 单列——「磁盘上有值但读不出结构」与「压根没有值」
    //   （unshaped）是两种事：前者用户**有配置**、只是读坏了（本次已回落默认），
    //   后者是「从未配置」。此前损坏路径会走 schemaStamp(def) 并把 def 的指纹判成
    //   current，于是「这份值结构正确」这句结论直接建立在兜底值上（归因不实）。
    schemaStatus: { current: 0, stamped: 0, stale: 0, failed: 0, unshaped: 0, unreadable: 0 },
    lastStamp: null, lastStale: null };
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
    // v2.11.0: 本行是**读**抛错，此前只返回 no-storage 而不进读侧归因——调用方
    //   （read 主路径）虽能识别，但读侧台账里查不到这次失败，诊断只显示「从未配置」。
    try { raw = ls.getItem(r.key); }
    catch (e) { noteReadFail('read', e, 'rawRevive: '); return { revived: false, reason: 'no-storage' }; }
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
    if (val === null || val === undefined) { __migTried[mk] = { status: 'skip', at: wallNow(), reason: 'absent' }; return val; }
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
          stats.lastMigration = { key: r.key, at: wallNow(), reason: reason, from: shapeOf(val), to: shapeOf(out) };
          if (WA.log) WA.log('warn', 'settingsBus: ' + r.key + ' 结构迁移 ' + shapeOf(val) + ' → ' + shapeOf(out) + (reason ? '（' + reason + '）' : ''));
        } else {
          status = 'fail';
          reason = 'writeback-failed: ' + String((wErr && (wErr.message || wErr)) || wErr).slice(0, 120);
          stats.migrationFailed++;
          stats.lastMigration = { key: r.key, at: wallNow(), reason: reason, failed: true };
          try { __migFailed[r.key] = reason; } catch (e0) {}
          if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 结构迁移算完但回写失败（' + reason + '）——磁盘仍是旧结构，下次读取会再次尝试');
        }
      } else {
        status = 'skip'; reason = (res && res.reason) || 'no-change';
      }
    } catch (eM) {
      status = 'fail'; reason = String((eM && (eM.message || eM)) || eM).slice(0, 160);
      stats.migrationFailed++;
      stats.lastMigration = { key: r.key, at: wallNow(), reason: reason, failed: true };
      // 失败必须可见：迁移没跑成 = 旧结构继续被当作「畸形值」消费，属需要人处理的状况
      try { __migFailed[r.key] = reason; } catch (e0) {}
      if (WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 结构迁移失败（' + reason + '）——本键按原值继续，诊断会持续报出');
    }
    __migTried[mk] = { status: status, at: wallNow(), reason: reason };
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
      if (stats.writeFailedBy) {
        // v2.24.0: 与 noteRemoveFail / noteReadFail 统一为**未知来源动态建桶**。此前本函数
        //   用白名单判定（`writeFailedBy[t] !== undefined`）+ 兜底塞进 setItem：一旦新增写
        //   路径忘了登记桶，失败就被**静默误归因成「写盘被拒」**——用户会去查配额/隐私模式，
        //   而实际问题在别处。三面记账对「未知来源」的策略必须一致（读/删侧自 v2.9.0/v2.10.0
        //   起已是动态建桶，写侧是唯一会误导归因的一面）。桶名归一：settingsBus.write → settings。
        const wKey = (t === 'settingsBus.write') ? 'settings' : t;
        stats.writeFailedBy[wKey] = (stats.writeFailedBy[wKey] || 0) + 1;
      }
    } catch (eC) { /* 分类计量失败不影响主计量 */ }
    const msg = String((err && (err.message || err)) || err);
    stats.lastWriteError = (prefix || ((tag || 'setItem') + ': ')) + msg.slice(0, 160);
  }
  /**
   * v2.9.0: 删除失败归类记账——`noteFail` 的删除侧对偶，单一实现。
   *   为什么需要：写入侧自 v2.6.0 收口后「同一类故障的记账在多个点各写一遍 ⇒ 没人记得
   *   去补的地方就断档」这个坑已经踩过一次；删除侧若各处各写，必然重演。
   * @param {string} tag 分类标签（guarded / missing / setItem）
   * @param {*} err 原始错误或原因串
   * @param {string} [prefix] 覆盖默认前缀
   */
  function noteRemoveFail(tag, err, prefix) {
    stats.removeFailed++;
    try {
      const t = tag || 'setItem';
      const by = stats.removeFailedBy;
      if (by) {
        // v2.9.0: 未知来源**动态建桶**而不是塞进兜底桶。理由见 stats 处注释：
        //   归因错误会让用户去修一个不存在的问题（「删除被拒」提示去查权限，
        //   而实际是隔离副本路径的删除失败）。桶名归一：settingsBus.remove → settings。
        const key = (t === 'settingsBus.remove') ? 'settings' : t;
        by[key] = (by[key] || 0) + 1;
      }
    } catch (eC) { /* 分类计量失败不影响主计量 */ }
    const msg = String((err && (err.message || err)) || err);
    stats.lastRemoveError = (prefix || ((tag || 'setItem') + ': ')) + msg.slice(0, 160);
  }
  /**
   * v2.10.0: 读失败归类记账——`noteFail`（写侧）/ `noteRemoveFail`（删侧）的**第三面**，单一实现。
   *   为什么必须单一实现：写侧自 v2.6.0 收口后踩过一次「同一类故障的记账在多个点各写一遍 ⇒
   *   没人记得去补的地方就断档」；删除侧 v2.9.0 立了 noteRemoveFail 就是为了不重演。读侧此前
   *   连一个归因点都没有（只有单桶 `stats.failures`），若不收口，本版必然造出第四种口径。
   *   语义：**永不抛**——读失败记账发生在 read 热路径上，让记账本身把读打断是把小故障放大。
   * @param {string} tag 分类标签（read / parse / migrate / copy）
   * @param {*} err 原始错误
   * @param {string} [prefix] 覆盖默认前缀
   */
  function noteReadFail(tag, err, prefix) {
    stats.readFailed++;
    try {
      const t = tag || 'read';
      const by = stats.readFailedBy;
      // 未知来源动态建桶（与 noteRemoveFail 同口径）：新增读点时不丢归因，也不必改声明表。
      if (by) by[t] = (by[t] || 0) + 1;
    } catch (eC) { /* 分类计量失败不影响主计量 */ }
    const msg = String((err && (err.message || err)) || err);
    stats.lastReadError = (prefix || ((tag || 'read') + ': ')) + msg.slice(0, 160);
    stats.lastReadFail = { tag: tag || 'read', at: wallNow(), message: msg.slice(0, 160) };
  }
  /**
   * v2.9.0: **唯一删除出口**——设置家族键的每一次真实删除都必须经过这里。
   *
   * 为什么必须统一（本版命题）：v2.6.0/v2.7.0 把「写入侧」收口成 `lsWrite` 单一出口（写盘成功
   *   计量、写失败分桶归因、写后读回校验三层），**删除侧完全没有对偶物**——全库 13 处
   *   `localStorage.removeItem` 直调，其中总线自己 3 处（损坏隔离 / legacy 迁移 / legacy 隔离）
   *   包在 `catch {}` 里静默吞错。结果是「删除」在台账上不存在：删成功没计数、删失败没归因、
   *   删完没复核。
   *
   * 与 `lsWrite` 对称的三层：成功计量（`removes`）/ 失败分桶（`removeFailedBy`）/ 删除后复核
   *   （`removeVerified`，读回仍存在即视为删除未发生）。
   *
   * 语义：**永不抛**（返回 {ok, error}）——理由与 lsWrite 相同：删除点多在清理策略与热路径上，
   *   把「删不掉」升级成「调用方崩溃」是把小故障放大成大故障（oracle.clear 实测就是这个形态）。
   * @param {string} key
   * @param {string} [from] 来源标签（走 removeFailedBy 分桶）
   * @param {object} [opts] {verify:false} 关闭复核（测试/极端场景）
   * @returns {{ok:boolean, error?:*, existed?:boolean}}
   */
  function rmRemove(key, from, opts) {
    const ls = (WA.mainWin || window).localStorage;
    const o = opts || {};
    let existed = false;
    // v2.11.0（结论不实 · 现场一）: 「读不出来」与「键不存在」必须分开。
    //   此前读抛错即 existed=false ⇒ 受控删除走 removeAbsent 分支报「键本来就不存在
    //   （幂等无操作）」——而真相是存储读取被拒、键可能仍在磁盘上。用户据此以为
    //   「没什么可删的」，清理却永远清不动；与 store.removeVerified 的 read-failed 同型。
    let existReadErr = null;
    try { existed = ls.getItem(key) !== null && ls.getItem(key) !== undefined; }
    catch (e0) { existed = false; existReadErr = e0; }
    if (existReadErr) {
      noteReadFail('rmExisted', existReadErr, 'rmRemove-existed: ');
      stats.lastRemove = { key: key, at: wallNow(), readFailed: true };
      stats.lastRemoveError = 'read-failed: ' + String((existReadErr && existReadErr.message) || existReadErr).slice(0, 120);
      return { ok: false, error: existReadErr, existed: false, reason: 'read-failed' };
    }
    // v2.9.0（当前态口径）: 每次删除先把「最近一次结果」清零。
    //   为什么必须清零：消费端（maintain / tool-diag）的分级判据必须是**当前态**信号——
    //   v0.4.0 已就此立过裁决（`lastOk`/`lastFailAt` 与历史计数分离：「健康分只看当前态，
    //   否则历史一次配额失败会把健康分永久压低」）。首版把删除侧判据写成累计 `staged > 0`，
    //   既与该裁决相悖，也让「恢复后分数复原」这条可逆性断言根本无法成立
    //   （累计数只增不减，一旦发生过就永久报 error）。
    stats.lastRemoveStaged = null;
    stats.lastRemoveError = null;
    // v2.9.0: 键本不存在 ⇒ 这是幂等无操作，**不计** removes / removeVerified。
    //   否则一句「N 次受控删除全部复核通过（键确已移除）」可能来自 N 次空操作。
    if (!existed) {
      stats.removeAbsent++;
      stats.lastRemove = { key: key, at: wallNow(), absent: true };
      return { ok: true, existed: false, absent: true };
    }
    try {
      ls.removeItem(key);
      // 删除后复核：与写入侧 verifyFailed 同规格——删完读回还在 = 这次删除没有发生。
      if (o.verify !== false) {
        // v2.11.0（结论不实 · 现场二）: 复核本身是一次**读取**——读失败不能与
        //   「键确实没了」共用结论。此前 back=null 直接判「删除成功」，而真相是
        //   「读不出来，删没删掉不知道」。与 v2.10.0 在 store.removeVerified 修的同型缺陷。
        let back = null, backReadErr = null;
        try { back = ls.getItem(key); } catch (eR) { back = null; backReadErr = eR; }
        if (backReadErr) {
          noteReadFail('verifyBack', backReadErr, 'rmRemove-verify: ');
          noteRemoveFail('verifyBack', 'read-back-failed', 'verifyBack: ');
          return { ok: false, error: backReadErr, existed: existed, unverified: true, reason: 'read-back-failed' };
        }
        if (back !== null && back !== undefined) {
          stats.removeStaged++;
          stats.lastRemoveStaged = { key: key, at: wallNow(), bytes: (typeof back === 'string' ? back.length : 0) };
          noteRemoveFail('guarded', 'still-present-after-remove', 'guarded: ');
          return { ok: false, error: { message: 'still-present-after-remove' }, existed: existed, staged: true };
        }
      }
      stats.removes++;
      stats.removeVerified++;
      stats.lastRemove = { key: key, at: wallNow() };
      stats.lastRemoveError = null;
      return { ok: true, existed: existed };
    } catch (e) {
      noteRemoveFail(from || 'setItem', e, (from && from !== 'setItem') ? (from + ': ') : 'setItem: ');
      return { ok: false, error: e, existed: existed };
    }
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
  function lsWrite(key, payload, from, opts) {
    const ls = (WA.mainWin || window).localStorage;
    const bytes = payload ? payload.length : 0;
    const o = opts || {};
    try {
      ls.setItem(key, payload);
      // v2.7.0: 写盘成功计量必须放在**校验之后**——与 v2.6.0 定下的口径一致（自增在真实成功之后）。
      //   否则「写进去又被静默丢弃」会同时计一次 writes（成功 N 次虚高）与一次 verifyFailed，
      //   读诊断的人会以为「绝大多数都成功了，只是偶尔丢一次」，而真实情况是那些写入压根没留住。
      // v2.7.0: 写后读回校验——「setItem 没抛错」不等于「值在盘上」。
      //   与 store.writeVerified 同规格的判据：立刻读回、逐字符比对。不一致即视为**本次写入
      //   没有发生**（ok:false），因为消费端下次 read 拿到的就不是刚写的东西。
      //   刻意不在此重试：设置键的写点分布在 read 热路径（迁移回写/盖章）与用户点击路径上，
      //   热路径重试会放大 IO；而失败已记账且下次 read 天然重试（迁移/盖章本就幂等），
      //   把重试交给幂等机制比在这里硬重试更干净。store 主状态路径仍保留其自有的重试。
      //   opts.verify === false 供测试/极端场景显式关闭（默认开启：诚实是默认值）。
      if (o.verify !== false) {
        // v2.11.0（归因不实）: 复核读失败与「写完丢了」是两件事。此前都落进
        //   missing-after-write ⇒ 用户被引导去查配额，而实际要查的是存储可读性。
        //   结论方向仍保守（一律报失败），但原因必须诚实。
        let back = null, backReadErr = null;
        try { back = ls.getItem(key); } catch (eR) { back = null; backReadErr = eR; }
        if (backReadErr) {
          noteReadFail('verifyBack', backReadErr, 'lsWrite-verify: ');
          stats.verifyFailed++;
          stats.lastStaged = { key: key, at: wallNow(), reason: 'read-back-failed', bytes: bytes };
          noteFail('verify', 'read-back-failed', 'verify: ');
          return { ok: false, error: backReadErr, bytes: bytes, staged: true, reason: 'read-back-failed' };
        }
        if (back !== payload) {
          const why = back === null || back === undefined ? 'missing-after-write'
            : (typeof back === 'string' && typeof payload === 'string' && back.length !== payload.length)
              ? 'length-mismatch:' + back.length + '≠' + payload.length : 'content-mismatch';
          stats.verifyFailed++;
          stats.lastStaged = { key: key, at: wallNow(), reason: why, bytes: bytes };
          noteFail('verify', why, 'verify: ');
          return { ok: false, error: { message: why }, bytes: bytes, staged: true, reason: why };
        }
      }
      stats.writes++;
      stats.lastWrite = { key: key, bytes: bytes, at: wallNow() };
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
  function ls_set(key, value, from, opts) {
    let payload = null;
    try { payload = JSON.stringify(value === undefined ? null : value); }
    catch (eS) { noteFail(from || 'writeback', eS, 'stringify: '); return { ok: false, error: eS }; }
    return lsWrite(key, payload, from || 'writeback', opts);
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
  function ls_raw(key) {
    // v2.11.0: 读失败与「键不存在」都返回 null，调用方（幽灵盘点）无法分辨——
    //   读被拒的键会被判成 absent（shape='absent'），盘点结论「这些键不存在」不实。
    try { return (WA.mainWin || window).localStorage.getItem(key); }
    catch (e) { noteReadFail('lsRaw', e, 'ls_raw: '); return null; }
  }
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
   * v2.11.0（R3 自纠）: 返回值自此为 `{ wrote, res }`——`res` 是**本次调用**的结果对象。
   *   为什么必须换：结果此前只存在模块级槽 `__schemaStampResult`，而本函数的写盘动作会同步
   *   进入 `ls_set`，其间若发生重入（同一同步栈内的另一次 `read`——真实场景是 storage 事件
   *   回调、面板刷新、诊断采集在写盘通知里顺带读配置），外层 read 随后落账时读到的是
   *   **另一个键**的 status/fp/prevAt，把 A 的陈旧指纹记成 B 的（R3 探针实测复现）。
   *   模块级槽保留给「最后一次盖章」这类观察用途，但**落账一律用捕获的 `res`**。
   * @returns {{wrote:boolean, res:object}} wrote=是否真的写了盘；res=本次结果（含 status/fp/prev*）
   */
  function schemaStamp(reg, val) {
    const r = reg || {};
    const def = r.def;
    const fp = schemaFingerprint(def);
    // v2.11.0: 本函数改为**状态机**并把结果写进模块级 __schemaStampResult（供 read 路径落账）。
    //   返回值语义保持不变（truthy = 真的写了盘），避免任何既有调用点的行为漂移。
    __schemaStampResult = { status: 'unshaped', fp: fp, prevFp: null, prevAt: null, prevDigest: null, key: (r.key || null) };
    const __res0 = __schemaStampResult;      // v2.11.0（R3 自纠）: 本次结果的对象引用（随函数返回）
    if (!fp || !r.key) return { wrote: false, res: __res0 };
    if (!val || typeof val !== 'object' || Array.isArray(val)) return { wrote: false, res: __res0 };
    // v2.11.0: 消费 `.d` / `.at`——它们此前从未被读过。此处记下**旧指纹是谁、什么时候盖的**，
    //   使「结构漂移发生过、且没被迁移掉」第一次可追溯（而不是被新指纹覆盖得一干二净）。
    const __prev = (val._schema && typeof val._schema === 'object') ? val._schema : null;
    if (__prev) {
      __res0.prevFp = __prev.fp || null;
      __res0.prevAt = (typeof __prev.at === 'number') ? __prev.at : null;
      // v2.11.0: `.d` 是给**人看**的那一份（fp 是完整子键名+类型串，长度随 def 增长；
      //   `d` 是它的 32 位 FNV 摘要）。此前写侧算完就丢，读侧从不取用——
      //   于是诊断/面板要展示「旧结构是哪一份」时只能用 fp 截断（截断后不可比对）。
      __res0.prevDigest = __prev.d || null;
    }
    if (__prev && __prev.fp === fp) { __res0.status = 'current'; return { wrote: false, res: __res0 }; }   // 已是当前结构 → 零写入
    const cur = Object.keys(val).filter(function (k) { return k !== '_schema'; });
    if (cur.length && schemaFingerprint((function () { const o = {}; cur.forEach(function (k) { o[k] = val[k]; }); return o; })()) === fp) {
      __res0.status = 'current';                                    // 子键全集与声明一致 → 零写入
      return { wrote: false, res: __res0 };
    }
    if (__prev && __prev.fp && __prev.fp !== fp) __res0.status = 'stale';
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
        __res0.status = 'failed';
        return { wrote: false, res: __res0 };
      }
      stats.schemaStamps++;
      // 状态机：陈旧指纹的盖章记为 stale（它与「首次盖章」的信息量完全不同——前者证明
      //   磁盘值来自另一个结构版本，后者只是从未盖过）。stamped 只在原本缺失时用。
      if (__res0.status !== 'stale') __res0.status = 'stamped';
      return { wrote: true, res: __res0 };
    } catch (e) { __res0.status = 'failed'; return { wrote: false, res: __res0 }; }
  }
  /** v2.11.0: schemaStamp 的结果槽（模块级，避免改变该函数的返回契约） */
  let __schemaStampResult = { status: 'unshaped', fp: null, prevFp: null, prevAt: null, key: null };
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
  /**
   * v2.7.0（收口）: 数值归一——**唯一实现**。
   *   与 normChancePct 的历史判据收窄一致（见 engines/horizon.js 的收窄说明）：
   *   `parseFloat` 后取整、再按声明区间夹取；不可解析则回落默认值。
   *   刻意**不再**把 ≤1 的正数解释为小数比率——那会让区间下限 1 与「1%」语义塌陷重合。
   * @param {*} v 原值 @param {number} def 默认 @param {number} min @param {number} max
   */
  function clampNum(v, def, min, max) {
    const n = parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, Math.round(n)));
  }
  /**
   * v2.7.0: 生效值归一（**读写同源的单一实现**）。
   *
   * 为什么要有它（本版正向审计的结论，非设计偏好）：v2.7.0 主体把 regional / horizon 的
   *   `setSettings` 改成「写入即归一」，但同一形态的缺陷在库内**不是两处，而是一簇**——
   *   `opinion.everyNRounds`（读路径 `Math.max(1, …)` 夹取下界、UI 声明 1-10、写路径落原值）、
   *   `backstage.npcBudget`（UI 声明 1-16，写路径落原值；填 -5 时 `slice(0,-5)` 返回**空数组**，
   *   NPC 全部不结算 = 静默失效）、`backstage.memSamplerLimit/memSamplerDice`（区间常量住在
   *   **另一个文件** `memory-sampler.js`，声明与消费跨文件）、`evolution.diceModifier` 等。
   *   逐个模块各写一份 `clampXxx` 只会把「两套口径」变成「五套口径」，故本版把**区间声明**
   *   上收到登记表（`reg.bounds` / `reg.enums`），归一逻辑收敛到这一处：
   *     · 读路径（生效视图）与写路径（落盘）都调它 ⇒ 界面显示的 = 磁盘存的 = 引擎用的；
   *     · 未声明区间的子键**原样透传**（绝不臆测——归一不是「猜用户想要什么」）；
   *     · 布尔域由 `def` 的类型自动判定（`typeof def[k] === 'boolean'` 即走 toBool），
   *       不额外引入第二份「哪些子键是布尔」的清单。
   * @param {object} reg 登记项（读 reg.def / reg.bounds / reg.enums）
   * @param {*} value 待归一的整值（通常 `Object.assign(read(reg), patch)`）
   * @returns {object} 归一后的浅拷贝（未声明的子键原样保留，不增不减）
   */
  function normalize(reg, value) {
    const r = reg || {};
    const def = (r.def && typeof r.def === 'object' && !Array.isArray(r.def)) ? r.def : {};
    const src = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};
    const bd = (r.bounds && typeof r.bounds === 'object') ? r.bounds : {};
    const en = (r.enums && typeof r.enums === 'object') ? r.enums : {};
    // v2.7.0: 哨兵值——「区间之外的合法取值」（如 injectBudget 的 -1=自动 / 0=不限，
    //   与正数区间 200-6000 并存）。命中哨兵即原样保留，绝不当作越界值夹回区间：
    //   把 -1 夹成 200 会让「自动档」变成「手动 200t」，是静默改变用户意图。
    const sn = (r.sentinels && typeof r.sentinels === 'object') ? r.sentinels : {};
    const out = {};
    Object.keys(src).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(en, k) && Array.isArray(en[k])) {
        out[k] = (en[k].indexOf(src[k]) >= 0) ? src[k] : def[k];         // 枚举白名单
      } else if (Array.isArray(sn[k]) && sn[k].indexOf(src[k]) >= 0) {
        out[k] = src[k];                                                 // 哨兵值原样
      } else if (Object.prototype.hasOwnProperty.call(bd, k) && Array.isArray(bd[k])) {
        out[k] = clampNum(src[k], def[k], bd[k][0], bd[k][1]);           // 声明区间
      } else if (typeof def[k] === 'boolean') {
        out[k] = toBool(src[k], def[k]);                                 // 布尔域由 def 推断
      } else {
        out[k] = src[k];                                                 // 未声明 → 原样
      }
    });
    return out;
  }
  /** v2.7.0: 按键取区间声明（UI 生成控件 / 跨文件消费点取用，避免界面与引擎各写一份 min/max） */
  function boundsOf(key) {
    const rows = WA.__settingsRegs || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].key === key) return rows[i].bounds || {};
    }
    return {};
  }
  WA.settingsBus = {
    stats: stats,
    /**
     * v2.9.0: 设置家族键的删除出口（对外）——与 save() 对称。
     *   此前模块要删自己的设置键只能直调 `localStorage.removeItem`，于是「删除」完全在
     *   台账之外、失败也没有任何记录。`p` 为空时按「清除本键」语义处理。
     * @param {object} reg 登记项
     * @param {object} [opts] 透传 rmRemove 的 {verify}
     * @returns {{ok:boolean, error?:*}}
     */
    remove(reg, opts) {
      const r = reg || {};
      // v2.9.0: 必须走**删除侧**记账。首版此处误用写入侧 noteFail（写失败分桶 missingKey），
      //   后果有二：① 删除失败污染写入侧台账（「写失败 N 次」里混进删除失败，读的人会去查
      //   写盘环境）；② removeFailedBy.missing 声明了却零消费——正是「声明面空转」的最小形态。
      if (!r.key) { noteRemoveFail('missing', 'register-entry-has-no-key', 'missing-key: '); return { ok: false, error: { message: 'no-key' } }; }
      return rmRemove(r.key, 'settingsBus.remove', opts);
    },
    /**
     * v2.9.0: 删除侧观测视图（只读）——与 writeStat 对称。
     */
    removeStat() {
      return { removes: stats.removes, removeAbsent: stats.removeAbsent, removeFailed: stats.removeFailed,
        removeFailedBy: Object.assign({}, stats.removeFailedBy),
        removeVerified: stats.removeVerified, removeStaged: stats.removeStaged, lastRemove: stats.lastRemove,
        lastRemoveError: stats.lastRemoveError, lastRemoveStaged: stats.lastRemoveStaged };
    },
    toBool: toBool,
    clampNum: clampNum,
    normalize: normalize,
    boundsOf: boundsOf,
    read(reg) {
      const r = Object.assign({ legacy: [], legacyRemove: true, orphan: false, def: null }, reg || {});
      const ls = (WA.mainWin || window).localStorage;
      let raw = null, val = null, legacyHit = false;
      // v2.10.0（读后复核）: 本次读取的**来源**追踪。三面对偶的第三层——
      //   写侧有 `verifyFailed`（「写进去 ≠ 存住了」）、删侧有 `removeVerified`（「删成功 ≠ 真没了」），
      //   读侧的对应判据是「**拿到的是真配置还是兜底**」。没有它，回落默认值与用户配置不可区分。
      //   `__src` ∈ disk / legacy / default；`__why` 非空即表示这次读取**失败**（来源降级为
      //   default-after-failure）；`__note` 记非失败备注（如磁盘上显式存了 null）。
      let __src = 'default', __why = null, __note = null;
      try {
        raw = ls.getItem(r.key);
        if (raw !== null && raw !== undefined) {
          stats.reads++;
          try { __seenKeys[r.key] = true; } catch (eSeen) {}
          // v2.5.0: 历史原始格式复活（幂等、可重复）——必须在 JSON.parse **之前**：
          //   旧版本把裸字符串写进本键时，JSON.parse 会抛错并把**用户真实配置**判为损坏、
          //   隔离、回落默认。reg.rawRevive 声明「本键存在这种历史格式」，只对声明过的键生效。
          const __rev = rawReviveDef(r, false);
          // v2.10.0（逆向审计自纠）: rawReviveDef 在 getItem 抛错时返回 {reason:'no-storage'}
          //   且**不归因**——若此处不看这个原因，本次读取会以「磁盘上没有值」的身份静默回落
          //   默认值，readSources.defaultAfterFailure 漏记一次真实读失败。这正是本版要治的
          //   「读失败伪装成从未配置」，却由本版自己的新代码造成，故当版修掉。
          if (__rev.reason === 'no-storage') {
            __src = 'default-after-failure'; __why = 'read-throw';
            noteReadFail('read', 'rawRevive-getItem-threw', 'rawRevive: ');
          }
          if (__rev.revived) {
            __src = 'disk';   // v2.10.0: 复活成功读到的是**用户真实配置**，来源就是磁盘

            // 复活成功 → 直接用复活后的值。**不能**留 val=null：那会回落 r.def，
            //   把刚从旧格式救回来的用户配置又丢掉（本版首轮实现即犯此错，由逆向审计抓出）。
            val = __rev.value;
            raw = JSON.stringify(val);
          } else {
            try { val = JSON.parse(raw); __src = 'disk'; }
            catch (e) {
              // v2.10.0: 读侧归因——磁盘**有值**却解析不出来，最终会回落 r.def，这正是
              //   「默认值伪装成用户配置」的现场，必须进 readFailedBy.parse 与
              //   readSources.defaultAfterFailure（而不是像此前那样只加一个来源不明的总数）。
              __src = 'default-after-failure'; __why = 'corrupt';
              noteReadFail('parse', e, 'parse: ');
              // 当前键损坏：留痕 + 隔离（sweep 可归置）
              stats.quarantines++;
              const qk = r.key + '_corrupt_' + now();
              // v2.6.0（收口）: 隔离副本写盘失败此前被 `catch(e2){}` 吞掉，而下一行**照样**删掉
              //   原键——于是「隔离」变成「直接销毁用户数据」，且零痕迹。改为：副本没写成功就不动
              //   原键（保命优先），并记账；原键保留 → 下次读取会再次尝试隔离，直到副本真的写下。
              const wQ = lsWrite(qk, raw, 'quarantine');
              // v2.9.0: 走唯一删除出口（此前裸调 + `catch(e3){}` 静默吞错）。
              //   副本已写成功才删原键；删不掉时原键保留 → 下次读会再次隔离（幂等），
              //   与「保命优先」的既有语义一致，但现在这一次失败**会被记账**。
              if (wQ.ok) {
                const dQ = rmRemove(r.key, 'quarantine');
                if (!dQ.ok && WA.log) WA.log('error', 'settingsBus: ' + r.key + ' 隔离副本已写但原键删除失败——原键仍在，下次读取会重复隔离（隔离副本不会丢，但会累积）', dQ.error);
              }
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
            let lraw = null, lrawErr = null;
            // v2.11.0: 此前 catch 为空 ⇒ 读被拒与「旧键不存在」不可分辨，用户配置
            //   可能仍躺在旧键里而总线报「没有 legacy 值可迁」。归因后两者可分辨。
            try { lraw = ls.getItem(lk); } catch (e) { lrawErr = e; }
            if (lrawErr) noteReadFail('legacyRead', lrawErr, 'legacy-read: ');
            if (lraw === null || lraw === undefined) continue;
            legacyHit = true;
            try {
              val = JSON.parse(lraw);
              __src = 'legacy';   // v2.10.0: 从旧键迁移读到，来源是 legacy（不是 disk）
              stats.upgrades++;
              if (WA.log) WA.log('warn', 'settingsBus: ' + lk + ' 迁移 → ' + r.key, null);
              // v2.6.0（收口）: 此前 `catch(e4){}` 完全静默——旧键已解析出值、本次仍可用，
              //   但迁移写盘失败时用户每次启动都要重迁一遍，而台账里查不到任何痕迹。
              const wLg = ls_set(r.key, val, 'legacy');
              if (!wLg.ok && WA.log) WA.log('error', 'settingsBus: ' + lk + ' 迁移 → ' + r.key + ' 写盘失败（本次未落盘，下次读取会重试）', wLg.error);
              // v2.9.0: 走唯一删除出口。legacy 键删不掉不是致命（值已迁到新键），
              //   但「每次启动都重迁一遍」这件事必须可观测，否则台账显示迁移完成而磁盘上旧键还在。
              if (r.legacyRemove !== false) rmRemove(lk, 'legacy');
            } catch (e) {
              // v2.10.0: 与当前键解析失败同规格归因（此前两处各自静默，归因口径不一）
              __src = 'default-after-failure'; __why = 'legacy-corrupt';
              noteReadFail('parse', e, 'legacy-parse: ');
              // legacy 键也损坏：隔离留痕（防 v2 发布后误读老损坏格式）
              stats.quarantines++;
              const qk = lk + '_corrupt_' + now();
              // v2.6.0（收口）: 与设置键隔离同规格——副本没写成功就不删旧键（保命优先）。
              const wQL = lsWrite(qk, lraw, 'quarantine');
              // v2.9.0: 与设置键隔离同规格——副本没写成功就不删旧键（保命优先），删失败记账。
              if (wQL.ok) rmRemove(lk, 'quarantine');
              else if (WA.log) WA.log('error', 'settingsBus: ' + lk + '（legacy）损坏但隔离副本写盘失败，已保留旧键不做删除', wQL.error);
              if (WA.log) WA.log('error', 'settingsBus: ' + lk + '（legacy）损坏已隔离 → ' + qk, String(lraw).slice(0, 200));
            }
            break;
          }
        }
      } catch (e) {
        // v2.10.0: 存储层读抛错（隐私模式 / 策略拒绝 / 配额临界下的 getItem）此前只加一个
        //   `stats.failures`——**单桶、来源不明、产品代码零消费**。改为走读侧归因单一实现。
        __src = 'default-after-failure'; __why = 'read-throw';
        noteReadFail('read', e, 'read: ');
        stats.failures++;   // 历史字段保留（v0.1.x 起存在，下游旧断言仍读它）
      }
      if (val === null || val === undefined) {
        // v2.10.0: 磁盘上**显式存了 null**（`JSON.parse('null')` → null）时，val 也是 null，
        //   但与「键不存在」语义不同：前者是用户数据（表示「空」），后者是「从未配置」。
        //   此处把来源降级为 default 并记非失败备注，避免把「读到了 null」报成「读失败」——
        //   归因**不实**比缺失归因更坏（用户会去查一个不存在的损坏）。
        if (__src === 'disk' && !__why) { __src = 'default'; __note = 'disk-null'; }
        val = r.def;
      }
      // v2.5.0: 顺序至关重要——迁移 → 结构指纹 → 子键补齐。
      //   · 迁移在最前：它可能改变值的**形状**（标量 → 对象），必须在形状被补齐逻辑依赖之前完成。
      //   · 指纹在补齐之前：指纹记录的是「磁盘上**真实存在**的结构」，若先补齐再盖指纹，
      //     指纹就会把「运行时补出来的默认值」也当成用户存档的一部分（指纹随即失真）。
      //   · 补齐在最后、且只作用于返回值副本（v2.4.0 既定口性：磁盘不因读取而回写补齐值）。
      // v2.10.0（逆向审计自纠）: 迁移失败的归因此前只落在 migrationFailed /
      //   migrationStat（v2.5.0 建的专用出口），而本版在 readFailedBy 里声明了 `migrate` 桶后
      //   **没有任何调用点消费它**——这就是「声明了却零消费」的空转，与 v2.9.0 首版
      //   removeFailedBy 声明 {guarded,missing,setItem} 而真实调用点全落兜底桶同型。
      //   修法：迁移失败同时进读侧归因（它确实是一次「读了但没读到应有的结构」），
      //   但**不改变 __src**——迁移失败时旧值仍可用，不是「拿到兜底值」，两者归因层级不同。
      const __migFailBefore = stats.migrationFailed;
      val = migrateIfNeeded(r, val);
      if (stats.migrationFailed > __migFailBefore) {
        let __migWhy = null;
        try { __migWhy = __migFailed[r.key] || null; } catch (eMG) { __migWhy = null; }
        noteReadFail('migrate', __migWhy || 'migration-failed', 'migrate: ');
      }
      // v2.11.0: 指纹状态的读侧落账——此前 `schemaStamp(r, val);` 的返回值被丢弃，
      //   「这份磁盘值是不是另一个结构版本写的」在整条读路径上无人过问。
      // v2.11.0（R3 自纠）: 两处修正，均在逆向审计探针下复现：
      //   ① **损坏值不盖章**——磁盘值解析失败时 `val` 已在上面回落 `r.def`，若照常调用
      //      `schemaStamp(r, val)`，它会把 **def 的指纹**当成「磁盘上真实存在的结构」而判
      //      `current`（第二条判据必然命中），于是「这份值结构正确」这句结论建立在兜底值上，
      //      而真相是「这份值根本读不出来」。故损坏路径传 `null`（不写盘、不判定），
      //      状态单列 `unreadable`——用户有配置、只是读坏了，与「从未配置」严格可分辨。
      //   ② **落账用捕获的结果，不用模块级槽**——槽在写盘重入时会被后来者覆盖
      //      （R3 探针：A 的 stamped 落账里出现 B 的 fp/prevAt）。
      //   判据取「本次确实以兜底值告终」：`__why` 标了损坏**且** `__src` 仍停在
      //      default-after-failure。只看 `__why` 会误伤「当前键损坏、但 legacy 旧键迁移成功」
      //      的情形——那次读取拿到的是真实用户配置（`__src === 'legacy'`），按 unreadable 报
      //      又会反过来误导排查方向。
      const __corruptVal = (__why === 'corrupt' || __why === 'legacy-corrupt')
        && __src === 'default-after-failure';
      const __stR = schemaStamp(r, __corruptVal ? null : val);
      try {
        const __sr = (__stR && __stR.res) || __schemaStampResult || {};
        const __sk = __corruptVal ? 'unreadable' : (__sr.status || 'unshaped');
        stats.schemaStatus[__sk] = (stats.schemaStatus[__sk] || 0) + 1;
        // 损坏时 fp 记 null：此刻 `__sr.fp` 是 **def 的**指纹（schemaStamp 早期就从 reg.def
        //   算出来），而 lastStamp 这个字段的语义是「磁盘上那份结构的指纹」——把声明结构的
        //   指纹填进去，等于又一次用「看起来合理」的值替换了「实际为未知」的真相。
        stats.lastStamp = { key: r.key, at: wallNow(), status: __sk,
          fp: __corruptVal ? null : (__sr.fp || null), prevAt: __sr.prevAt || null };
        if (__sk === 'stale') {
          stats.lastStale = { key: r.key, at: wallNow(), prevFp: __sr.prevFp || null,
            prevDigest: __sr.prevDigest || null, prevAt: __sr.prevAt || null };
          if (WA.log) WA.log('warn', 'settingsBus: ' + r.key + ' 磁盘结构指纹与当前声明不符（旧指纹 ' + String(__sr.prevFp).slice(0, 40)
            + (__sr.prevAt ? '，于 ' + new Date(__sr.prevAt).toLocaleString() + ' 写入' : '') + '）——已按当前结构重盖；'
            + '这通常意味着该键的结构在上个版本变过而迁移钩子未行使');
        }
      } catch (eSS) { /* 记账失败不影响读取 */ }
      // v2.4.0: 整键之外还要补**子键**——旧存档缺新字段时子键为 undefined，
      //   会在消费端静默改变语义（见 applyDefaults 注释）。补齐后再返回独立拷贝。
      val = applyDefaults(r, val);
      // v2.10.0（读后复核落账）: 把本次读取的**来源**记进 lastRead / readSources，使
      //   「默认值伪装成用户配置」第一次可判定。这是与写侧 verifyFailed、删侧 removeVerified
      //   严格对偶的第三层，且是**唯一**能回答「我拿到的是用户配置还是兜底」的字段。
      const __finalSrc = __why ? 'default-after-failure' : __src;
      const __bucket = (__finalSrc === 'default-after-failure') ? 'defaultAfterFailure' : __finalSrc;
      try { stats.readSources[__bucket] = (stats.readSources[__bucket] || 0) + 1; } catch (eB) { /* 计量失败不影响读取 */ }
      stats.lastRead = { key: r.key, source: __finalSrc, reason: __why || __note || null, at: wallNow() };
      try { return JSON.parse(JSON.stringify(stripStamp(val))); }
      catch (e) {
        // v2.10.0: 深拷贝往返失败**不得静默降级**为「返回内部对象引用」。
        //   静默返回引用会让消费端改返回值即改总线内部状态（而磁盘无变化），是典型静默失效；
        //   这里如实记账 + 打日志，返回值语义保持不变（不破坏既有调用方），但故障**可见**。
        stats.readonlyCopyFallback++;
        stats.lastCopyFallback = { key: r.key, at: wallNow(), error: String((e && e.message) || e).slice(0, 120) };
        noteReadFail('copy', e, 'copy: ');
        if (WA.log) WA.log('warn', 'settingsBus: ' + r.key + ' 返回值深拷贝往返失败——本次返回内部引用（消费端改动会影响后续读取，但磁盘不变）', e);
        return stripStamp(val);
      }
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
     * v2.7.0 起：该缺口已补齐 —— `engines/chatcache.js` 的 `installPack` 写 state 后同样做
     *   写后读回逐字符比对（`__installStat`：missing-after-write / length-mismatch /
     *   content-mismatch 三分类），并接入 `WA.toolDiag` 的 `chatcache.install` 议题。
     *   故「state 家族旁路点自带写后校验」这句在本版起对**全部** state 直写点成立。
     *
     * 为什么需要（本轮命题）：读侧已有 reads / subkeyFills / migrations / rawRevives / schemaStamps
     *   五组计量，**写侧一个都没有**。而「保存了却没生效」是用户唯一会当场察觉、却最难取证的一类故障——
     *   `save()` 早就在返回 false，但调用方零检查、stats 零记录、日志零输出，于是「配额写满」与
     *   「功能没实现」在诊断包里长得一模一样。本视图把三个失败来源（缺 key / 序列化 / setItem）
     *   与最近成功写入一起摊开，使「写不进去」第一次可判定。
     * @returns {{writes:number, writeFailed:number, ok:boolean, last:object|null, lastError:string|null,
     *   verifyFailed:number, staged:object|null, subkeyDrift:{count:number, last:object|null}}}
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
        // v2.7.0: 「写盘被拒」与「写进去又没留住」必须分开呈现——前者用户清空间即可，
        //   后者是存储层/环境的静默截断，用户唯一能做的是把配置导出留证。
        verifyFailed: stats.verifyFailed || 0, staged: stats.lastStaged,
        subkeyDrift: { count: stats.extraSubkeys, last: stats.lastExtra } };
    },
    /**
     * v2.10.0: 读侧只读观测视图——与 writeStat / removeStat 构成三面对称。
     *   `ok` 的语义：**本会话从未发生过读失败**。注意它不掩盖「读到了默认值」——那由
     *   sources.default 如实呈现（用户没配过不是故障），而 sources.defaultAfterFailure
     *   才是「有数据但没读到」的故障计数。
     */
    readStat() {
      const by = {};
      try { const src = stats.readFailedBy || {}; Object.keys(src).forEach(function (k) { by[k] = src[k]; }); } catch (e) {}
      const sources = {};
      try { const src2 = stats.readSources || {}; Object.keys(src2).forEach(function (k) { sources[k] = src2[k]; }); } catch (e) {}
      // v2.10.0（逆向审计自纠）: `ok` 的判据不能是「readFailed === 0」——readFailed 里混着
      //   两类**性质完全不同**的故障：
      //     · 硬失败（read / parse）＝**没读到用户配置**，拿到的是兜底值（用户会以为设置被改回去了）；
      //     · 降级（migrate / copy）＝值本身是对的，只是结构迁移没落盘 / 返回值与内部对象共享引用。
      //   把两者合成一个 ok，会让「迁移回写失败」被报成「读不到配置」——用户会去查存储，
      //   而实际要查的是迁移钩子。归因**不实**比缺失归因更坏（本版 P7/P9 两次踩到同型）。
      // v2.25.0: 分类必须**完备**。此前硬失败只取 `read+parse`、降级只取 `migrate+copy`（固定 2+2
      //   子集），而 `by` 是 readFailedBy 的**动态桶**（noteReadFail 支持任意来源）。本会话新增的
      //   核查读回类来源（verifyBack/rmExisted/legacyRead/saveInherit/subkeyAudit/pendingOrphan/
      //   verifyDefaults/lsRaw）全落在两个口径之外：readFailed 涨了、`ok` 却仍报 true（「存储读取
      //   一切正常」），且「硬失败+降级=读失败总数」这条完备性会在运行期被静默破坏——与 v2.23.0
      //   「硬编码子集」同族。修法：口径改为「已知降级白名单 + 其余全部计硬失败」——任何未登记
      //   来源都按「没读到可用配置」保守判定（它们是核查读回，失败即该结论不可信），并单列
      //   `unclassified` 使落桶外来源仍可追溯（不丢归因）。
      const DEGRADE_SRC = { migrate: 1, copy: 1 };
      let hardFail = 0, degraded = 0, unclassified = 0;
      Object.keys(by).forEach(function (k) {
        const v = by[k] || 0;
        if (DEGRADE_SRC[k] === 1) { degraded += v; return; }
        hardFail += v;
        if (k !== 'read' && k !== 'parse') unclassified += v;
      });
      return { reads: stats.reads, readFailed: stats.readFailed, ok: hardFail === 0,
        hardFailed: hardFail, degraded: degraded, unclassified: unclassified,
        bySource: by, sources: sources,
        // v2.10.0: 「有数据但没读到」单列——它与 reads 的比值就是数据丢失率，必须一眼可见。
        defaultAfterFailure: sources.defaultAfterFailure || 0,
        copyFallback: stats.readonlyCopyFallback || 0, lastCopyFallback: stats.lastCopyFallback,
        // D-b（逆向审计自纠）: v0.1.x 遗留的单桶 `stats.failures` 在本版之前**产品零消费**
        //   （它是「读侧无归因」的直接证据）。本版既已把它拆成可归因的 readFailedBy，
        //   就不该把这个旧字段丢在原地继续零消费——它仍在自增（向后兼容旧断言），
        //   在此给它一个真实出口，使「旧字段还在涨但没人看」这件事不再成立。
        legacyFailures: stats.failures,
        // v2.11.0（面B 读侧消费）: 结构指纹状态出口。`_schema` 自 v2.5.0 就在写侧存在，
        //   而读侧只有 `val._schema.fp === fp` 一个判据——**`.d`（短摘要）与 `.at`（写入时间）
        //   从未被任何代码读过**，而「这份磁盘值是另一个结构版本写的」更是无人可问：
        //   指纹不符时引擎静默重盖，没有人知道磁盘上曾经是旧形状（若那次变更是缩减型，
        //   旧子键会被永久写回）。此处把状态机结果交给消费端。
        //   判据分级必须与仓库既有口径一致：**warn 级允许用「本会话经历过」（累计）**
        //   （与 settingsBus.readFailed / store.readFailed 同规格），**error 级必须用当前态**
        //   （v0.4.0 裁决）。指纹陈旧属前者——它已被「重盖」这一动作自愈，故消费端报
        //   「本会话发生过几次 + 最近一次是谁」；详情取 lastStale（含旧摘要 prevDigest、
        //   旧写入时间 prevAt、旧指纹 prevFp）。
        //   `unreadable`（R3 自纠新增）: 磁盘**有值但读不出结构**——本次已回落默认值，
        //   用户是「有配置、被读坏了」，与 unshaped（从未配置/值非对象）必须分开报，
        //   否则用户会按「我没配过」处理，而实际要做的是导出诊断包留证再重建该键。
        schema: { status: Object.assign({ current: 0, stamped: 0, stale: 0, failed: 0, unshaped: 0, unreadable: 0 },
            (stats.schemaStatus || {})),
          lastStamp: stats.lastStamp || null, lastStale: stats.lastStale || null },
        lastError: stats.lastReadError, last: stats.lastRead, lastFail: stats.lastReadFail };
    },
    /**
     * v2.10.0: 带来源的结构化读取——回答「我拿到的是用户配置，还是兜底」。
     *
     * 与 read() 的关系：read() 的契约不变（返回值即配置值），本函数只是把它**顺带算出来的
     *   来源**结构化交还。`ok === false` 意味着**调用方拿到的是兜底值**（磁盘上曾有数据但
     *   没读成功），此时用户看到的「配置」并不是他配的东西——这是本仓库里唯一能判定的、
     *   且后果最严重的一类静默失效（用户会以为自己的设置被程序改回去了）。
     * @returns {{ok:boolean, value:*, source:string, reason:string|null, key:string|null}}
     */
    readEx(reg) {
      const value = this.read(reg);
      const info = stats.lastRead || {};
      const src = info.source || 'default';
      return { ok: src !== 'default-after-failure', value: value,
        source: src, reason: info.reason || null, key: info.key || null };
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
     * v2.11.0（面C · 死面治理）: 此处原有 `readRaw(key)`——v2.3.0 为**一次性格式迁移**
     *   （`worldaxis_active_preset` 的历史裸字符串）提供的过渡出口。
     *   该用例已由 v2.5.0 的 `rawRevive` **声明式**承接（`reg.rawRevive:true`，
     *   幂等、可重复、跨会话，且在 parse 之前生效），preset.js 里的一次性 IIFE 与
     *   readRaw 调用同步移除（该文件留有现场注释）。此后 readRaw 全库零调用。
     *   收回理由：它是**绕过总线全部契约**的读取口（不解析、不隔离、不回落默认）——
     *   留着一个「想读原文时可以用」的出口，下一个调用者就会绕过归因与隔离。
     *   需要原文时的正确做法是读取侧落账后的 `readEx`（带来源）或声明 rawRevive。
     */
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
        } catch (eP) {
          // v2.11.0: 此处读失败此前完全静默（注释只解释了「不继承」，没说这会被**错误地**
          //   与「上一版确实没有指纹」混为一谈）。后果：指纹丢失看起来像「首次写入」，
          //   诊断无法区分。归因后「读不出来 ⇒ 没继承」这条降级路径可见。
          noteReadFail('saveInherit', eP, 'save-inherit: ');
        }
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
          if (extra.length) { stats.extraSubkeys += extra.length; stats.lastExtra = { key: r.key, keys: extra.slice(0, 8), at: wallNow() }; }
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
          hasMigrate: typeof r.migrate === 'function', rawRevive: !!r.rawRevive,
          // v2.7.0: 生效值域声明（区间/枚举/哨兵）——此前「设置项的合法范围」在库里**没有声明面**：
          //   它只活在设置页的 `<input min max>` 与各模块自己的夹取常量里（甚至跨文件）。
          //   不透出的话，诊断与测试都无法回答「这个子键的契约区间是什么」。
          bounds: r.bounds || null, enums: r.enums || null, sentinels: r.sentinels || null };
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
      // v2.11.0: 读不出来的键单列——「没有缺口」与「没读到」必须可分辨（见下方读点注释）。
      const unreadable = [];
      (WA.__settingsRegs || []).forEach(function (r) {
        if (!r || !r.key || r.orphan) return;
        if (!r.def || typeof r.def !== 'object' || Array.isArray(r.def)) return;
        let raw = null, rawErr = null;
        // v2.11.0: 读失败此前静默 return（跳过）⇒ 该键在缺口表里**整个消失**，
        //   而调用方无法分辨「这键没缺口」与「这键没读到」。读失败必须单列为一类结论。
        try { raw = ls.getItem(r.key); } catch (e) { rawErr = e; }
        if (rawErr) {
          noteReadFail('subkeyAudit', rawErr, 'subkeyAudit: ');
          unreadable.push({ key: r.key, module: r.module || null, reason: 'read-failed' });
          return;
        }
        if (raw === null || raw === undefined) return;   // 无磁盘值 → 整键回落，不属子键缺口
        // v2.5.0: 把 **原始串** 交给 subkeyGap，而非先 JSON.parse 再判。
        //   此前「解析失败 → parsed=null → return（跳过）」会把「磁盘上是非 JSON 原值」
        //   这一**最严重的**形态缺口从表里整个抹掉——而它恰恰是旧版本写裸值留下的现场。
        const g = subkeyGap(r, raw);
        if (g.missing.length) rows.push({ key: r.key, module: r.module || null, declared: g.declared, missing: g.missing, unparsable: !!g.unparsable });
      });
      return { keys: rows, totalMissing: rows.reduce(function (s, x) { return s + x.missing.length; }, 0),
        // v2.11.0: 读失败单列（不是「无缺口」，而是「本轮无法判定」）
        unreadable: unreadable, unreadableCount: unreadable.length,
        fills: stats.subkeyFills, fillKeys: stats.subkeyFillKeys };
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
        // v2.11.0: 读失败此前与「键仍在」共用 false（保守方向正确），但台账里查不到——
        //   幽灵清理是**删用户数据**的路径，此处每一次无法判定都必须留痕。
        try { return ls.getItem(r.key) === null; }
        catch (e) { noteReadFail('pendingOrphan', e, 'pendingOrphan: '); return false; }
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
        // v2.7.0: 生效值域声明的自洽性——「声明了区间/枚举，但字段在 def 里不存在」是
        //   典型的声明漂移：归一按键名逐字段作用，键名写错时它**永远不会被命中**，
        //   于是「已声明」变成一句空话（静默失效，与死键同型）。此处把它变成可见的 error。
        try {
          const bd = r.bounds || {}, en = r.enums || {}, sn = r.sentinels || {};
          const defKeys = (r.def && typeof r.def === 'object' && !Array.isArray(r.def)) ? Object.keys(r.def) : [];
          [['bounds', bd], ['enums', en], ['sentinels', sn]].forEach(function (pair) {
            Object.keys(pair[1]).forEach(function (f) {
              if (defKeys.indexOf(f) < 0) {
                issues.push({ code: 'domain-unknown-field', level: 'error',
                  detail: key + ' 的 ' + pair[0] + '.' + f + ' 在 def 中不存在（归一永不命中该声明 = 声明空转）' });
              }
            });
            // 区间/哨兵本身的自洽：min<=max、哨兵不得落在区间内部（两者重叠时语义有歧义）
            if (pair[0] === 'bounds') Object.keys(pair[1]).forEach(function (f) {
              const a = pair[1][f];
              if (!Array.isArray(a) || a.length !== 2 || !(a[0] <= a[1])) {
                issues.push({ code: 'bad-bounds', level: 'error', detail: key + '.' + f + ' 区间声明非法（应为 [min,max] 且 min<=max）' });
              }
            });
          });
          Object.keys(sn).forEach(function (f) {
            const a = sn[f], b = bd[f];
            if (Array.isArray(a) && Array.isArray(b)) {
              a.forEach(function (v) {
                if (v >= b[0] && v <= b[1]) issues.push({ code: 'sentinel-in-bounds', level: 'error',
                  detail: key + '.' + f + ' 哨兵 ' + v + ' 落在区间 [' + b[0] + ',' + b[1] + '] 内（语义歧义）' });
              });
            }
          });
        } catch (eD) { /* 域声明校验失败不影响其余自检项 */ }
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
        let raw = null, rawErr = null;
        // v2.11.0（结论不实 · 现场三）: 读失败此前被当成「磁盘无值」⇒ 校验器改走
        //   「与 providers 的实际默认值比对」分支。而该分支的前提是**确实没有磁盘值**；
        //   读被拒时它会把「有磁盘值但读不出来」判成「声明与默认值不符/相符」的一堆结论，
        //   全是无根据的。必须先分清「没有值」与「读不到值」。
        try { raw = ls.getItem(r.key); }
        catch (e) { raw = null; rawErr = e; }
        if (rawErr) {
          noteReadFail('verifyDefaults', rawErr, 'verifyDefaults: ');
          out.push({ key: r.key, module: r.module || null, checked: false, reason: 'read-failed', ok: null });
          return;
        }
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
