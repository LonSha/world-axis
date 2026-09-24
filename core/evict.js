/**
 * WorldAxis core/evict.js (v2.65.0) — 挤出侧完整性（七面治理的最后一面）
 *
 * 为什么需要它：
 *   本仓库已把写侧（v2.6.0/v2.7.0）、删侧（v2.9.0）、读侧（v2.10.0）、活性面（v2.11.0）
 *   逐一收口，UI 渲染路径也已被真实执行覆盖（v2.12.0）。但**挤出侧一行治理都没有**：
 *   全库 30+ 处持久容器截断（slice(-N) / splice(0, len-N) / length = CAP）全是
 *   **静默的破坏性丢弃**——元素被丢掉之后再也拿不回来，而用户与诊断都看不到任何痕迹。
 *
 *   这里的现场比写入/删除更隐蔽：
 *     · 写失败 → 数据没变（用户能看出「没保存」）；
 *     · 删失败 → 数据还在（复核即可发现）；
 *     · **挤出成功 → 数据真的没了，而且这正是代码的本意**。
 *     于是「长局跑了 200 轮之后 NPC 只剩 48 个」「伏笔被终态条目挤掉」这类现象
 *     在面板、诊断包、健康分上完全没有出口，只能靠用户凭记忆发现少了谁。
 *
 * 三条口径（本模块存在的全部意义）：
 *   ① **挤出 ≠ 取样**。「对持久容器的破坏性截断」是挤出（须记账）；
 *      「对只读输入/输出的展示切分」（chat.slice(-3)、面板 slice(-10) 渲染）
 *      是取样（不改变任何持久状态，**不得**计进挤出——否则计数虚高，
 *      与 v2.6.0 修掉的「writes 计尝试而非成功」、v2.9.0 修掉的
 *      「removeAbsent 计成 removes」完全同型）。分类只能由站点显式声明，不能猜。
 *   ② **cap 与站点同源**。SITES 表是本模块唯一真源：站点只报自己的名字，
 *      cap 由本表给出（可为函数，读运行时单源如 MAX_EVENTS / MAX_WINDS）。
 *      此前 __BOUNDED_CAPS[k].site 是一段**自由文本**（'backstage.js slice(-200)'），
 *      代码改了 cap 没人知道，登记表还会继续自称权威。改为可执行表之后，
 *      「声明」与「执行」之间的漂移第一次可以被机器判定（见门禁 G18）。
 *   ③ **未知站点是缺陷，不是后备**。站点名未登记 ⇒ unknown-site 失败并归因，
 *      **不做任何截断**（宁可超限也不要静默丢弃一个没人声明过的容器）。
 *      「先丢掉再说」是本仓库最贵的一类默认值。
 *
 * 记账层次（与写侧 writes/writeFailed/writeFailedBy、删侧 removes/removeAbsent 对偶）：
 *   · evicts / evicted   —— 真正发生挤出的次数与被丢元素总数；
 *   · evictNoops         —— 未超限的调用次数（幂等无操作，**不是**挤出成功）；
 *   · evictFailed        —— 参数非法 / 站点未登记（实现缺陷，须改代码而非清存储）；
 *   · bySite             —— 逐站点 evicts / dropped / lastAt（「谁在丢东西」）；
 *   · lastDropped        —— **丢了什么**（最近 12 条元素摘要）。
 *     只记「丢了几条」等于什么都没说：用户想知道的是「丢的是不是张三」。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // ── 站点登记表：cap 的单一真源 ───────────────────────────────
  // 每项：{ path: 状态路径（与 store.__BOUNDED_CAPS 同键）, cap: 数字或函数,
  //         kind: 'array'（默认）| 'object', why: 该容器为何必须有界 }
  // 站点名格式 模块.容器，与代码里的调用点字面量一一对应（门禁 G18 校验双向）。
  const SITES = {
    // ── 结算尾部容量控制（backstage 结算段）──
    'backstage.echoes':      { path: 'echoes',      cap: 40,  why: '暗流回声环形（正文触面）' },
    'backstage.chronicle':   { path: 'chronicle',   cap: 200, why: '世界编年史环形' },
    'backstage.worldFacts':  { path: 'worldFacts',  cap: 100, why: '世界事实版本环形' },
    'backstage.currents':    { path: 'currents',    cap: 40,  why: '暗流本体环形（终态回收后仍有硬上限）' },
    'people':                { path: 'people', cap: 48, kind: 'object', why: '人物容器（对象型，按 updatedAt 最旧优先挤出）' },
    // ── 演化容器（容器为中心：同一容器只有一个站点，backstage 兜底与 evolution 入账共用）──
    'evolution.events':      { path: 'evolution.events',     cap: function () { return (WA.editorEvents && WA.editorEvents.MAX_EVENTS) || 16; }, why: '事件链容器（同编辑器容量）' },
    'evolution.factions':    { path: 'evolution.factions',   cap: function () { return (WA.editorFaction && WA.editorFaction.MAX_FACTIONS) || 16; }, why: '势力容器（同编辑器容量）' },
    'evolution.winds':       { path: 'evolution.winds',      cap: function () { return (WA.evolution && WA.evolution.MAX_WINDS) || 12; }, why: '风声环形（衰减引擎为常态收敛，此处兜底）' },
    'evolution.worldTrends': { path: 'evolution.worldTrends', cap: 12, why: '天下大势（终态回收后兜底）' },
    'evolution.trends':      { path: 'evolution.trends',     cap: 20, why: '影响链环形' },
    'evolution.enemies':     { path: 'evolution.enemies',    cap: 44, why: '仇敌本体（活跃 24 + 终结 20 双口径）' },
    'evolution.entityMemory':{ path: 'evolution.entityMemory.*', cap: 30, why: '四类实体库各自上限' },
    'evolution.entityEvents':{ path: 'evolution.entityMemory.*.events', cap: 8, why: '实体事件环' },
    'evolution.blackboxActions': { path: 'evolution.blackbox.secretActions', cap: 15, why: '黑盒秘密行动环形' },
    'evolution.blackboxAssets':  { path: 'evolution.blackbox.secretAssets',  cap: 15, why: '黑盒秘密资产环形' },
    'evolution.ledger':      { path: 'evolution.ledger',     cap: 20, why: '重大事件账本轮数环形' },
    // ── memory 分层记忆 ──
    'memory.l0':          { path: 'memory.l0',          cap: 20,  why: '单轮摘要环形' },
    'memory.l1':          { path: 'memory.l1',          cap: 30,  why: '阶段回顾环形' },
    'memory.l2':          { path: 'memory.l2',          cap: 40,  why: '章节回顾环形' },
    'memory.l3':          { path: 'memory.l3',          cap: 60,  why: '长线沉淀环形' },
    'memory.facts':       { path: 'memory.facts',       cap: 100, why: '事实版本环形' },
    'memory.foreshadows': { path: 'memory.foreshadows', cap: 30,  why: '伏笔生命周期（终态回收后兜底）' },
    'memory.pmem':        { path: 'memory.pmem',        cap: 60,  why: '人物主观记忆总量' },
// ── 舆情 / 章节 / 突发事件 ──
    'opinion.canon':      { path: 'opinion.canon',  cap: 20, why: '正史舆情环形' },
    'opinion.forum':      { path: 'opinion.forum',  cap: 20, why: '论坛舆情环形' },
    'chapters.history':   { path: 'chapters.history', cap: 20, why: '章节史环形' },
    'directEvents':       { path: 'directEvents', cap: 4, why: '突发事件（活跃全留 + 终态保留最近 3）' },
    // ── v2.34.0 平行世界三容器（parallel-world.js 入账器环形剪枝）──
    'parallelWorld.npcs':     { path: 'parallelWorld.npcs', cap: 24, why: '平行世界NPC档案环形' },
    'parallelWorld.relations':{ path: 'parallelWorld.relations', cap: 120, why: '平行世界关系网环形（同向边去重后）' },
    'parallelWorld.modules':  { path: 'parallelWorld.modules', cap: 80, why: '平行世界事件模块环形' },
    'parallelWorld.snapshots':{ path: 'parallelWorld.snapshots', cap: 12, why: '平行世界子树快照环形（v2.35.0）' },
    // ── v2.62.0 因果结算（causal.js）──
    'causal.chains':  { path: 'causal.chains',  cap: 24, why: '因果链环形（含终态：已结算/已取消/已失效都留痕，答「为什么没发生」）' },
    'causal.settled': { path: 'causal.settled', cap: 40, why: '因果结算台账环形（结算过什么，与 echoes 正文触面分开）' },
    // ── v2.63.0 世界织体（world.js）──
    'world.places': { path: 'world.places', cap: 24, why: '已登记地点环形（没登记的地方不存在，故这张表就是世界的全部可达面）' },
    'world.roads':  { path: 'world.roads',  cap: 40, why: '已登记道路环形（没登记的路走不通，故这张表决定谁能到哪）' },
    'world.events': { path: 'world.events', cap: 12, why: '共同日程环形（集市/节庆/庭审/仪式/聚会）' },
    // v2.65.0 行程表：在途与已到达都留痕（「他走过这条路」是事实，不得到达即删）
    'world.journeys': { path: 'world.journeys', cap: 24, why: '行程表环形（在途 + 已到达；出发≠到达，故这张表就是「谁在路上」的全部证据）' },
    // v2.65.0 天气：同地覆盖，表本身有界。未登记站点会 unknown-site 且不截断。
    'weather.rows': { path: 'weather.rows', cap: 24, why: '已登记天气环形（没登记的地点不是晴天，故这张表就是天气的全部证据）' },
    // v2.65.0 情报延迟：未到期的不入账。到期后从队列移走，队列本身仍有界。
    'intel.queue': { path: 'intelQueue', cap: 24, why: '在途情报环形（未到期前接收者不可见；路不通则不入队）' },
    // ── v2.66.0 情绪通道 / 关系六型 / 假面（affect.js / bonds.js / masks.js）──
    'affect.channels': { path: 'affect.channels', cap: 12, why: '情绪通道环形（每人一行：开放动作/硬关闭动作/过载回退，不含情绪词）' },
    'affect.loads': { path: 'affect.loads', cap: 24, kind: 'object', why: '调制量（疲惫/饥饿/疼痛/社交消耗，每键一人）' },
    'bonds.rows': { path: 'bonds.rows', cap: 24, why: '关系六型环形（与 enemies 血仇正交：血仇记事件，六型记结构）' },
    'masks.rows': { path: 'masks.rows', cap: 20, why: '假面环形（口径与露馅同时在场且不一致才算假面）' },
    // ── v2.67.0 时间锁 / 双层性格 / 好感审计 / 场外事件（temporal-lock.js / temperament.js / fondness.js / parallel-events.js）──
    'temporal.lock': { path: 'temporal.lock', cap: 2, kind: 'object', why: '时间锁锁定态（单行对象：label + at 两键；空对象 = 未锁定）' },
    'temperament.rows': { path: 'temperament.rows', cap: 12, why: '双层性格环形（底色/习惯/触发词，每行一人）' },
    'fondness.rows': { path: 'fondness.rows', cap: 16, why: '好感审计环形（步进白名单 + 信任对冲，不降准则）' },
    'parallelEvents.rows': { path: 'parallelEvents.rows', cap: 15, why: '场外事件环形（三要素 + 主时钟同步，活跃容量 3）' },
    // v2.77.0 阶段授权/提案过期/行级撤销/纠错依据：好感行内两环。
    //   与 karma.notes / gauge.history 同型——未登记站点会走 unknown-site 静默失败，
    //   行内数组就会退化成无界（这正是 v2.70.0 / v2.72.0 已裁决过的同型病）。
    'fondness.history': { path: 'fondness.rows.*.history', cap: 8, why: '好感变更史环（自动/采纳/判定不变/撤销/纠错/授权，每行各自有界；undo 需回看最近一项）' },
    'fondness.corrections': { path: 'fondness.rows.*.corrections', cap: 8, why: '好感纠错依据环（每行各自有界；只增不删地约束模型不得再依据同一事件）' },
    // ── v2.68.0 资料片周期 / 生存三轴 / 通缉 / 驯兽（era-cycle.js / survival.js / warrant.js / beast-bond.js）──
    'eraCycle.rows': { path: 'eraCycle.rows', cap: 8, why: '资料片周期环形（四档状态机 + 倒计时，结算转长草强制换事件）' },
    'survival.rows': { path: 'survival.rows', cap: 12, why: '生存三轴环形（饱食/精力/负重分段，归零惩罚如实报出）' },
    'warrant.rows': { path: 'warrant.rows', cap: 16, why: '通缉环形（罪度三档，不随死亡消除，惯犯升级）' },
    'beastBond.rows': { path: 'beastBond.rows', cap: 10, why: '驯兽环形（驯服满百清零转化，红线状态机）' },
    // ── v2.69.0 外貌分级契约 / 原型阶梯（appearance.js / ladder.js）──
    'appearance.rows': { path: 'appearance.rows', cap: 24, why: '外貌契约环形（分级/覆盖/异化档位/场景排他，每人一行）' },
    'ladder.rows': { path: 'ladder.rows', cap: 16, why: '原型阶梯环形（档位表 + 当前档，升级必须带事件）' },
    // ── v2.70.0 情境切片 / 阻尼量规 / 竞争焦点（scene-slice.js / gauge.js / rivalry.js）──
    'sceneSlice.rows': { path: 'sceneSlice.rows', cap: 20, why: '情境切片环形（地点空间属性/恶劣天气挂起/七档自然时间段）' },
    'gauge.rows': { path: 'gauge.rows', cap: 16, why: '阻尼量规环形（0..100百分比/单步阻尼限幅/四大里程碑事件）' },
    'rivalry.rows': { path: 'rivalry.rows', cap: 16, why: '竞争焦点环形（三元焦点对立/反向偏向调制/嫉妒反馈）' },
    // ── v2.71.0 叙事纪律四件套（enigma.js / tempo.js / quota.js / spotlight.js）──
    'enigma.rows': { path: 'enigma.rows', cap: 24, why: '信息暗礁环形（秘密知情名单，每秘密一行）' },
    'tempo.shifts': { path: 'tempo.shifts', cap: 'per-call', kind: 'array', why: '节奏挡位变更留痕（上限 = maxShifts 设置，写入时传入）' },
    'quota.rows': { path: 'quota.rows', cap: 24, why: '伏笔配给种子环形（短/长双池，过期仍占位）' },
    'spotlight.rows': { path: 'spotlight.rows', cap: 32, why: '焦点分配登场账（seen/missed/streak 每行一人）' },
    'spotlight.pending': { path: 'spotlight.pending', cap: 'per-call', kind: 'array', why: '焦点点名单轮内实名（上限 = maxRows 设置，结算即清空）' },
    'gauge.history': { path: 'gauge.rows.*.history', cap: 8, why: '阻尼量规步进史（v2.70.0 遗留：第二参数误传数字导致挤出静默失败的修复）' },
    // ── v2.72.0 叙事动力四件套（karma.js / hazard.js / marginal.js / tolerance.js）──
    'karma.rows': { path: 'karma.rows', cap: 16, why: '业力双轴账（功德/债各一行，不净额化）' },
    // v2.72.0 首个真缺陷：karma.js 原先写 `WA.evict.array(row.notes, 'karma.notes', 8)`，
    //   而 'karma.notes' **未登记在 SITES** ⇒ 每次记账都走 unknown-site 静默失败 ⇒
    //   每行的 notes 实际无界（与 v2.70.0 gauge.history 同型缺陷）。
    //   修为具名通配站点（每行各自有界 8 条），引擎侧同步去掉误导性的第三参数。
    'karma.notes': { path: 'karma.rows.*.notes', cap: 8, why: '业力行备注环（每行各自有界）' },
    'hazard.rows': { path: 'hazard.rows', cap: 16, why: '累积风险账（每风险一行，含暗账 pending）' },
    'marginal.rows': { path: 'marginal.rows', cap: 16, why: '边际折旧账（每对象一行，含重复计数与冷却）' },
    'tolerance.rows': { path: 'tolerance.rows', cap: 24, why: '手段耐受账（每手段一行，触达轮号滑窗）' },
    // ── v2.63.0 社交漩涡 / 悬案（shadow.js / threads.js）──
    'shadow.rows':        { path: 'shadow.rows',        cap: 12, why: '共同隐瞒环形（含已变淡：秘密存在过是事实）' },
    'shadow.experiences': { path: 'shadow.experiences', cap: 20, why: '关系经历流水环形（履行/背弃都留痕）' },
    'threads.cases':      { path: 'threads',            cap: 6,  why: '悬案环形（结案可回收，但「悬置」不算结案）' },
    'threads.leads':      { path: 'threads.*.leads',    cap: 8,  why: '每案线索环（每案各自有界，故按案剪枝）' },
    // 对象型：每人认知边界（键 = 「谁知道什么」），按 at 最旧优先挤出
    'people.knowledge':   { path: 'people.*.knowledge', cap: 30, kind: 'object', why: '人物认知边界（每键一桩知情）' },
    // ── v2.13.0 补漏（本轮广谱侦察发现的真缺陷）──
    // 纪要/总述环形：此前整个容器**根本没在 store 容量登记表上**，
    //   sizeAudit 把它俩报成 unbounded（全库唯一两条），而代码其实一直在 slice(-N) 静默裁剪。
    //   于是「被误判为无界」与「裁剪无人知晓」两个缺陷同时存在——补登 + 接台账一并修。
    'memory.smallSummary':{ path: 'memory.smallSummaries', cap: 24, why: '阶段纪要环形（summarizer CAP_SMALL）' },
    'memory.bigSummary':  { path: 'memory.bigSummaries',   cap: 8,  why: '大总述环形（summarizer CAP_BIG）' },
    // 对象型：每人的档案节（键 = 节名 personality/worldview/family/memory/relationships）。
    //   注意：节值本身是**数组**（{text,at} / {target,...}），上限逐节不同，且只有写入方
    //   （actors/registry.js）在运行时才知道（它从 store 容量登记表逐节取）。
    //   因此本项 cap 为 'per-call'：调用方必须显式传入该节上限，传漏即 bad-cap 归因——
    //   「随手给个默认值」正是本仓库发生过的漂移（registry 曾写死常量，被 sizeAudit 判 drifted）。
    'people.profile':     { path: 'people.*.profile.*', cap: 'per-call', kind: 'array', why: '人物档案各节（上限取自 store 登记表，写入时传入）' }
  };

  // ── 非挤出站点（显式声明，防「假阴性」与「计数虚高」两头都错）──────────
  // 下列位置有 slice/替换式赋值，但语义**不是**环形挤出：
  //   · evolution.economy.signals / opinion.sandbox —— 「用最新读数整体替换」，
  //     旧值本来就是过时信息，不构成容量治理；把它们计进挤出会让 evicts 虚高。
  // 本表存在的意义：让「为什么不给它记账」是**声明过的决定**，而不是漏掉。
  const NON_EVICT = {
    'evolution.economy.signals': '替换式覆盖（取最新读数整体重写，非环形累积）',
    'opinion.sandbox': '替换式覆盖（沙盒碎片每次重生成，NON-CANON 不累积）',
    'evolution.entityMemory.README': '同上：实体库替换由 evolution.entityMemory 站点计量，此处不重复计'
  };

  // ── 记账 ──────────────────────────────────────────────────
  const stats = {
    evicts: 0,          // 真正发生挤出的次数（超限且已丢弃）
    evicted: 0,         // 被挤出的元素总数
    evictNoops: 0,      // 未超限的调用次数——幂等无操作，不是「挤出成功」
    evictFailed: 0,     // 参数非法 / 站点未登记（实现缺陷）
    failedBy: {},       // 失败来源分桶：not-array / bad-cap / unknown-site / not-object
    lastEvict: null,    // { site, cap, before, after, dropped, at }
    bySite: {},         // site -> { evicts, dropped, lastAt, lastDropped }
    lastDropped: [],    // 最近被挤出的元素摘要（最多 12 条）——「丢的是什么」
    lastFail: null      // { site, reason, at }
  };

  // v2.15.0: 挤出记录只活在内存台账（bySite.lastAt / lastDropped.at），不落盘 → 测量时间。
  function now() { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } }

  /** 元素摘要：优先取语义名，让「丢的是谁」可读（只记数量等于什么都没记） */
  function summarize(x) {
    if (x === null || x === undefined) return 'null';
    const t = typeof x;
    if (t === 'string') return '\u300c' + x.slice(0, 24) + '\u300d';
    if (t === 'number' || t === 'boolean') return String(x);
    if (t !== 'object') return t;
    // v2.13.0: 名称键优先级——先「人/事的名字」，再退回结构信息
    const NAME_KEYS = ['name', 'title', 'topic', 'key', 'label', 'text', 'content', 'id'];
    for (let i = 0; i < NAME_KEYS.length; i++) {
      const v = x[NAME_KEYS[i]];
      if (v !== undefined && v !== null && v !== '') return String(v).slice(0, 24);
    }
    if (Array.isArray(x)) return '[' + x.length + '\u9879]';
    return '{' + Object.keys(x).length + '\u952e}';
  }

  function noteFail(site, reason) {
    stats.evictFailed++;
    stats.failedBy[reason] = (stats.failedBy[reason] || 0) + 1;
    stats.lastFail = { site: site, reason: reason, at: now() };
    try { WA.log('error', '挤出失败：站点 ' + site + ' 原因 ' + reason + '（未做任何截断）'); } catch (e) {}
  }

  function capOf(site) {
    const s = SITES[site];
    if (!s) return null;
    const c = typeof s.cap === 'function' ? s.cap() : s.cap;
    return c;
  }

  // ── 单一实现：数组挤出 ─────────────────────────────────────
  /**
   * 对持久数组做破坏性截断（保留尾部 cap 个）。
   * 站点名必须在 SITES 中登记——未登记则**不做任何截断**并归因。
   * @returns { ok, dropped, before, after, reason? }
   */
  function array(arr, site, limit) {
    if (!Array.isArray(arr)) { noteFail(site, 'not-array'); return { ok: false, reason: 'not-array', dropped: 0, before: 0, after: 0 }; }
    const decl = SITES[site];
    let cap;
    if (!decl) { noteFail(site, 'unknown-site'); return { ok: false, reason: 'unknown-site', dropped: 0, before: arr.length, after: arr.length }; }
    if (decl.cap === 'per-call') {
      // per-call 站点：上限逐次不同（如人物档案各节 15/10/10/25/15），必须由调用方给出。
      // 传漏即 bad-cap 归因——「悄悄回落到一个默认值」正是登记表与执行漂移的起点。
      if (typeof limit !== 'number' || !isFinite(limit) || limit < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0, before: arr.length, after: arr.length }; }
      cap = limit;
    } else cap = capOf(site);
    if (typeof cap !== 'number' || !isFinite(cap) || cap < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0, before: arr.length, after: arr.length }; }
    const before = arr.length;
    if (before <= cap) { stats.evictNoops++; return { ok: true, dropped: 0, before: before, after: before }; }
    const dropped = before - cap;
    // 先摘摘要再切——切完就拿不到了
    const tail = arr.slice(0, dropped);
    arr.splice(0, dropped);
    record(site, cap, before, arr.length, dropped, tail.map(summarize));
    return { ok: true, dropped: dropped, before: before, after: arr.length };
  }

  /**
   * 对持久对象做键挤出（调用方给出候选顺序，本函数负责删除与记账）。
   * @param obj 目标对象
   * @param site 站点名
   * @param orderedKeys 已按「应被挤出优先级」排好序的键（**前** excess 个会被删）
   */
  function object(obj, site, orderedKeys) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { noteFail(site, 'not-object'); return { ok: false, reason: 'not-object', dropped: 0, before: 0, after: 0 }; }
    const cap = capOf(site);
    if (cap === null) { noteFail(site, 'unknown-site'); return { ok: false, reason: 'unknown-site', dropped: 0, before: Object.keys(obj).length, after: Object.keys(obj).length }; }
    if (typeof cap !== 'number' || !isFinite(cap) || cap < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0, before: Object.keys(obj).length, after: Object.keys(obj).length }; }
    const before = Object.keys(obj).length;
    if (before <= cap) { stats.evictNoops++; return { ok: true, dropped: 0, before: before, after: before }; }
    const keys = Array.isArray(orderedKeys) ? orderedKeys.slice() : Object.keys(obj);
    const excess = before - cap;
    const dropped = keys.slice(0, excess);
    const tail = dropped.map(function (k) { return summarize(obj[k]) + '\u2039' + k + '\u203a'; });
    dropped.forEach(function (k) { try { delete obj[k]; } catch (e) {} });
    record(site, cap, before, Object.keys(obj).length, dropped.length, tail);
    return { ok: true, dropped: dropped.length, before: before, after: Object.keys(obj).length, droppedKeys: dropped };
  }

  /**
   * 记账专用入口：站点自己做「按业务规则筛选」的挤出（不是纯尾部截断，
   * 如「按 createdRound 最旧优先挤出活跃仇敌」「排除终局事件后重建数组」）。
   * 本函数**不动数据**，只把「丢了什么」如实记账——
   * 让这类站点的丢弃也可见，而不是因为它们不是 slice(-N) 就永远不可观测。
   * @param site 站点名（须登记）
   * @param droppedItems 已被站点丢弃的元素数组
   * @returns { ok, dropped, reason? }
   */
   function note(site, droppedItems, limit) {
     const decl = SITES[site];
     if (!decl) { noteFail(site, 'unknown-site'); return { ok: false, reason: 'unknown-site', dropped: 0 }; }
     let cap;
     if (decl.cap === 'per-call') {
       // per-call 站点（上限逐次不同，如人物档案各节）：调用方必须显式给出本次上限。
       // 不给就归因——默许一个「随手挑的上限」正是本仓库最贵的一类默认值。
       if (typeof limit !== 'number' || !isFinite(limit) || limit < 0) { noteFail(site, 'bad-cap'); return { ok: false, reason: 'bad-cap', dropped: 0 }; }
       cap = limit;
     } else {
       cap = capOf(site);
     }
     const items = Array.isArray(droppedItems) ? droppedItems : [];
     if (!items.length) { stats.evictNoops++; return { ok: true, dropped: 0 }; }
     record(site, cap, null, null, items.length, items.map(summarize));
     return { ok: true, dropped: items.length };
   }

  function record(site, cap, before, after, dropped, tail) {
    const at = now();
    stats.evicts++;
    stats.evicted += dropped;
    stats.lastEvict = { site: site, cap: cap, before: before, after: after, dropped: dropped, at: at };
    const b = stats.bySite[site] = stats.bySite[site] || { evicts: 0, dropped: 0, lastAt: 0, lastDropped: 0, lastWhat: [] };
    b.evicts++; b.dropped += dropped; b.lastAt = at; b.lastDropped = dropped;
    // v2.13.0（端到端审计自纠）：**逐站点**保留「丢的是谁」。
    //   缺陷现场：全局 lastDropped 只留最近 12 条，一次长局里多站点同时挤出时，
    //   先挤出的站点（如 people 丢 32 人）明细会被随后的站点（如伏笔）立刻冲掉——
    //   诊断议题于是只能说「最近被挤出的是：伏笔17、伏笔18」，而「丢了哪 32 个角色」
    //   永远看不到。这与模块头注释「只记条数等于什么都没说」自相矛盾：单站点成立、
    //   多站点失效。改为每个站点各自保留最近 6 条摘要，互不冲刷。
    if (!Array.isArray(b.lastWhat)) b.lastWhat = [];
    (tail || []).forEach(function (s) { b.lastWhat.push(s); });
    if (b.lastWhat.length > 6) b.lastWhat.splice(0, b.lastWhat.length - 6);
    (tail || []).forEach(function (s) { stats.lastDropped.push({ site: site, what: s, at: at }); });
    if (stats.lastDropped.length > 12) stats.lastDropped.splice(0, stats.lastDropped.length - 12);
    try { WA.log('info', '挤出: ' + site + ' ' + before + '\u2192' + after + '（丢弃 ' + dropped + '）：' + (tail || []).slice(0, 3).join('、')); } catch (e) {}
  }

  // ── 只读视图（供诊断 / 面板 / 健康分消费）──────────────────
  function evictStat() {
    const byS = {};
    Object.keys(stats.bySite).forEach(function (k) {
      const b = stats.bySite[k];
      byS[k] = { evicts: b.evicts, dropped: b.dropped, lastAt: b.lastAt, lastDropped: b.lastDropped, lastWhat: (b.lastWhat || []).slice() };
    });
    return {
      evicts: stats.evicts,
      evicted: stats.evicted,
      evictNoops: stats.evictNoops,
      evictFailed: stats.evictFailed,
      failedBy: Object.assign({}, stats.failedBy),
      lastEvict: stats.lastEvict ? Object.assign({}, stats.lastEvict) : null,
      lastFail: stats.lastFail ? Object.assign({}, stats.lastFail) : null,
      bySite: byS,
      lastDropped: stats.lastDropped.map(function (x) { return Object.assign({}, x); }),
      sites: Object.keys(SITES).length,
      nonEvict: Object.assign({}, NON_EVICT)
    };
  }
  function resetEvictStat() {
    stats.evicts = 0; stats.evicted = 0; stats.evictNoops = 0; stats.evictFailed = 0;
    stats.failedBy = {}; stats.lastEvict = null; stats.lastFail = null;
    stats.bySite = {}; stats.lastDropped = [];
  }
  /** 站点声明表只读副本（门禁与诊断反查「cap 的单一真源」用） */
  function siteDecls() {
    const out = {};
    Object.keys(SITES).forEach(function (k) {
      const s = SITES[k];
      out[k] = { path: s.path, cap: capOf(k), kind: s.kind || 'array' };
    });
    return out;
  }

  WA.evict = {
    array: array,
    object: object,
    note: note,
    evictStat: evictStat,
    resetEvictStat: resetEvictStat,
    siteDecls: siteDecls,
    nonEvictDecls: function () { return Object.assign({}, NON_EVICT); },
    summarize: summarize
  };
})();