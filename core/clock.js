/**
 * WorldAxis core/clock.js (v2.15.0) — 时间源治理（第九面：可复现性的另一半）
 *
 * 为什么需要它：
 *   v2.14.0 把**随机源**收成了单一出口（core/rand.js），于是「掷骰」这一半可复现了。
 *   但可复现性要两个输入同时确定，而第二个输入一格都没管：**时间**。
 *   全库 165 处裸调 `Date.now()`（40 个产品文件），其中相当一部分根本不是
 *   「记个时间戳好看」，而是**真的在判定与写入**：
 *     · core/store.js  —— `idleMs > maxIdleMs` 决定**哪些键被当成过期数据清理掉**
 *                          （storageStat 列出候选、sweepStaleKeys 真的回收），
 *                          回收的是真实数据，不是展示；
 *     · core/store.js  —— `meta.createdAt / updatedAt / lastSettle`、恢复点 `at`、
 *                          冲突现场 `exportedAt` 全部直接落盘；
 *     · engines/memory.js —— l0/l1/l2/l3 每一条摘要的 `t`、facts 的 `at`、
 *                          伏笔的 `at`、`'superseded@' + 时间戳` 的 reason 串，全部进存档；
 *     · engines/chatcache.js —— 快照 id（`'snap_' + Date.now().toString(36)`）与 `at`
 *                          落盘：同一操作两次跑出来的快照 id 天生不同；
 *     · engines/horizon.js / regional.js / evolution.js / enemies.js / digest.js … ——
 *                          编年史、事件链、黑盒行动、区域突发的 `at` 全部进存档。
 *   于是 v2.14.0 的复现结论是**半张**的：同样的种子，只要跑的时刻不同（甚至只差一毫秒），
 *   存档就不再逐字节相同。上一轮自己在 README 里点出的下一个缺口——
 *   「没有任何 API 能把一份存档 + 一个种子跑成确定性回放」——根因就在这里，
 *   而不在于「少写了一个函数」。
 *
 * 两条口径（本模块存在的全部意义）：
 *   ① **时间分两类，不得混流**（与 rand 的决策流/标识流完全对偶）。
 *      · **决策时间**（decision）——会被写进存档、或参与判定：走 `now(site)`。
 *        未冻结时它**就等于墙钟**（迁移行为中立：产品在不回放时与迁移前逐位一致）；
 *        冻结时它是一个可指定的常量（配 `advance()` 步进），于是同一 tape 重放两次，
 *        写进存档的每一个时间戳都相同——这就是「回放」能成立的前提。
 *      · **测量时间**（measure）——只用于算耗时、写内存台账、渲染给人看：走 `wallNow()`。
 *        它**不受冻结影响**。冻结时钟若把耗时测量一起冻住，`ms` 会恒为 0，
 *        「这一轮跑了多久」这句诊断话就变成了假话——不能为了复现把观测面毁掉。
 *   ② **站点名是已消费面**。`now(site)` 的 site 让「谁在读时间」第一次可枚举
 *      （与 `rand.channels()`、`evict.SITES`、`evict.NON_EVICT` 同型）。
 *      站点名不是装饰：它让「冻结之后仍有时间泄漏」这件事能**定位到具体调用点**——
 *      否则回放对不上时只能全库通读。
 *
 * 记账层次（与写侧 writes / 删侧 removes / 挤出侧 evicts / 随机侧 draws 对偶）：
 *   · nowCalls  —— 决策时间读取次数（冻结后应全部命中虚拟时刻）；
 *   · wallCalls —— 测量时间读取次数（不受冻结影响；用于对账「多少处是纯观测」）；
 *   · freezes / unfreezes / advances —— 冻结、解除、步进次数（回放台的行为留痕）；
 *   · bySite    —— 逐站点 nowCalls（「谁在读时间、读了多少」）；
 *   · lastSite / lastAt / lastWallAt —— 最近一次决策/测量读取（诊断定位用）。
 *
 * 不做什么：**不写 localStorage**。时钟不新增任何持久键——键预算由 store 登记表管着，
 *   时钟没有资格占地。代价：刷新页面即解除冻结（冻结是会话内的显式动作）。
 *   要跨会话复现就带着 tape 走，那是回放台（core/replay.js）的责任，不是时钟的。
 *   也**不接管** `new Date()`：全库 `new Date(...)` 只出现在格式化输出路径上
 *   （`toLocaleString` / `toISOString`，见 store/tool-diag/panel），
 *   它们的入参本来就是决策时间戳或纯展示时刻，改它没有收益、只增加漂移面。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** 未指定站点时的兜底名。不用 ''——空串在 bySite 里会是个看不见的桶。 */
  const DEFAULT_SITE = 'unspecified';
  /** 虚拟时间默认步进（毫秒）：回放时一轮推进一秒，够用且不改变任何数值语义。 */
  const DEFAULT_STEP_MS = 1000;
  const __stats = {
    nowCalls: 0, wallCalls: 0, freezes: 0, unfreezes: 0, advances: 0,
    bySite: {}, lastSite: null, lastAt: 0, lastWallAt: 0,
    frozenFrom: 0, frozenAt: 0,
    // v2.15.0: 非法参数台账（与 rand 的 failed/failedBy 对偶）。
    //   为什么必须记账而不是只打日志：`freeze(NaN)` 被静默接受会让「我以为冻结了，其实没有」，
    //   于是**整轮复现结论不可信**——这跟「非法种子被静默接受」是同一个坑的另一半。
    failed: 0, failedBy: {}
  };
  let __frozen = false;
  let __virtualAt = 0;
  function siteName(site) {
    return (site === undefined || site === null || site === '') ? DEFAULT_SITE : String(site);
  }
  /**
   * 真实墙钟读取（**不记账**的内部原语）。
   * 这是全库唯一一处 `Date.now()` 消费点——门禁 G20 断言：除本行外产品代码零裸调。
   */
  function raw() { return Date.now(); }
  /**
   * 测量时间：耗时统计 / 内存台账 / 渲染展示。
   * **不受冻结影响**——理由见头注释①，冻结若把耗时测量一起冻住，诊断就变成假话。
   * @returns {number} 真实墙钟毫秒
   */
  function wallNow() {
    __stats.wallCalls++;
    __stats.lastWallAt = raw();
    return __stats.lastWallAt;
  }
  /**
   * 决策时间：凡是要写进存档、或参与判定的时间读取都走这里。
   * 未冻结时**就等于墙钟**（故迁移本身行为中立——产品在正常运行时与迁移前逐位一致）；
   * 冻结时返回固定的虚拟时刻。
   * @param {string} site 站点名（模块名或模块.用途），用于 bySite 归因
   * @returns {number} 毫秒时间戳
   */
  function now(site) {
    const name = siteName(site);
    __stats.nowCalls++;
    __stats.bySite[name] = (__stats.bySite[name] || 0) + 1;
    __stats.lastSite = name;
    const v = __frozen ? __virtualAt : raw();
    __stats.lastAt = v;
    return v;
  }
  /**
   * 冻结决策时钟。不带参数时冻结在**当前墙钟**（「从此刻起重放」）。
   * 非法入参（NaN/Infinity/对象）**拒绝且不改当前状态**——与 `rand.seed` 同口径：
   *   静默接受一个 NaN 时刻会让「我以为冻结了，其实没有」，本轮结论整体不可信。
   * @param {number} [at] 虚拟时刻（毫秒）；省略则取当前墙钟
   * @returns {number|null} 冻结后的虚拟时刻；入参非法返回 null
   */
  function freeze(at) {
    let t;
    if (at === undefined || at === null) t = raw();
    else {
      t = Number(at);
      if (!isFinite(t)) { noteFail('bad-freeze:' + (typeof at)); return null; }
    }
    __frozen = true;
    __virtualAt = Math.floor(Math.abs(t));
    __stats.freezes++;
    __stats.frozenFrom = raw();
    __stats.frozenAt = __virtualAt;
    return __virtualAt;
  }
  /** 解除冻结，回到墙钟。未冻结时为幂等无操作。 */
  function unfreeze() {
    if (!__frozen) return false;
    __frozen = false;
    __stats.unfreezes++;
    return true;
  }
  /** 当前是否冻结 */
  function frozen() { return __frozen; }
  /** 当前虚拟时刻（未冻结时为 0——不代表墙钟，只代表「虚拟轴起点」） */
  function virtualAt() { return __virtualAt; }
  /**
   * 推进虚拟时间（仅在冻结状态下有效）。省略步长用 DEFAULT_STEP_MS。
   * 回放台在每轮动作之后调用它，模拟「一轮过去了」。
   * @returns {number} 推进后的虚拟时刻（未冻结时原样返回，不报错——回放台的调用序列不该被打断）
   */
  function advance(ms) {
    if (__frozen) {
      const d = Number(ms);
      // v2.15.0: 非法步长（NaN/Infinity/0）**归因**后退回默认步长。
      //   不静默的理由与 rand 同口径：步长写错会让「一轮过去了」这句话失去意义，
      //   而回放台看到的是「时间在走」，看不出走错了。
      let step = DEFAULT_STEP_MS;
      if (ms !== undefined && ms !== null) {
        if (isFinite(d) && d !== 0) step = Math.floor(d);
        else noteFail('bad-advance:' + (typeof ms));
      }
      __virtualAt += step;
      __stats.advances++;
    }
    return __virtualAt;
  }
  /**
   * 虚拟与真实的偏差（毫秒，真实 - 虚拟）。**只读且不记账**。
   * 诊断用：冻结很久之后偏差会很大，这是正常的；数值恒为 0 而 frozen 为 true 才是异常。
   */
  function drift() { return __frozen ? (raw() - __virtualAt) : 0; }
  function noteFail(why) {
    // v2.15.0: 非法参数一律**归因入账**（不只打日志）。分桶键为 `why` 的形态标签，
    //   与 rand 的 `failedBy` 同规格：桶名答「哪一类非法」，调用点靠 site/日志定位。
    const tag = String(why).split(':')[0];
    __stats.failed++;
    __stats.failedBy[tag] = (__stats.failedBy[tag] || 0) + 1;
    try { WA.log('warn', '时钟参数非法: ' + why); } catch (e) {}
  }
  /** 只读视图（供诊断 / 面板 / 回放台消费） */
  function clockStat() {
    const by = {};
    Object.keys(__stats.bySite).forEach(function (k) { by[k] = __stats.bySite[k]; });
    return {
      frozen: __frozen,
      // v2.15.0: 与 `randStat().reproducible` **同口径**——「这一轮写进存档的时间戳能不能被复核」。
      //   冻结（显式指定虚拟时刻）才谈得上可复现；未冻结时 `now()` 就等于墙钟，
      //   同一操作两次跑出来的存档时间戳必然不同。
      //   刻意不写成 `reproducible: __stats.freezes > 0`：「冻结过又解除了」的会话仍不可复现，
      //   判据必须看**当下**是否冻着（与 v0.4.0「健康分只看当前态」同规格）。
      reproducible: __frozen,
      virtualAt: __virtualAt,
      nowCalls: __stats.nowCalls,
      wallCalls: __stats.wallCalls,
      freezes: __stats.freezes,
      unfreezes: __stats.unfreezes,
      advances: __stats.advances,
      failed: __stats.failed,
      failedBy: Object.assign({}, __stats.failedBy),
      sites: Object.keys(by).length,
      bySite: by,
      siteNames: Object.keys(by).sort(),
      lastSite: __stats.lastSite,
      lastAt: __stats.lastAt,
      lastWallAt: __stats.lastWallAt,
      frozenFrom: __stats.frozenFrom,
      drift: drift()
    };
  }
  function resetClockStat() {
    __stats.nowCalls = 0; __stats.wallCalls = 0;
    __stats.freezes = 0; __stats.unfreezes = 0; __stats.advances = 0;
    __stats.bySite = {}; __stats.lastSite = null; __stats.lastAt = 0; __stats.lastWallAt = 0;
    __stats.frozenFrom = 0; __stats.frozenAt = 0;
    // v2.15.0: 失败台账一并归零——resetClockStat 的语义是「从此刻重新计量」，
    //   留下一半旧账会让「本轮有没有非法参数」这一步被历史污染（与 rand 同规格）。
    __stats.failed = 0; __stats.failedBy = {};
  }
  /** 已派生站点清单（「谁在读时间」的可枚举面）——与 rand.channels() 对偶 */
  function sites() { return Object.keys(__stats.bySite).sort(); }
  WA.clock = {
    now: now,
    wallNow: wallNow,
    freeze: freeze,
    unfreeze: unfreeze,
    frozen: frozen,
    virtualAt: virtualAt,
    advance: advance,
    drift: drift,
    clockStat: clockStat,
    resetClockStat: resetClockStat,
    sites: sites
    // v2.15.0（探针自纠）: 此处**刻意不导出** DEFAULT_SITE / DEFAULT_STEP_MS。
    //   首版导出了它们，探针实测**全库零消费**——两个常量挂在出口面上没人读，正是本仓库
    //   反复治理的「声明面空转」；而按 v2.11.0 已确立的裁决，留着零消费出口的风险不是
    //   「多一个 API」，而是下一个调用者会挑错的那个。
    //   兜底站点的名字本来就**自解释**：`bySite` 的键里直接写着 `'unspecified'`，
    //   消费端看输出即可理解，不需要一个符号常量去指代一个可见字符串。
    //   （默认步长 1000 的权威表述在 `advance()` 的调用结果里——推进多少直接读 virtualAt 差值。）
  };
  if (WA.log) WA.log('info', '时间源单一出口已加载');
})();
