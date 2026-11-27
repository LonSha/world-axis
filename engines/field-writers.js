/**
 * WorldAxis engines/field-writers.js（v2.610.0 · R285 WRA-1）
 * 多写者字段的写权声明表 —— **单一真源**。
 *
 * 【本表治什么】
 *   立项读数：`worldFacts` / `people` / `evolution` 各被 5 个引擎写，`customLax` / `economy`
 *   各 3 个。**全仓没有任何地方声明「这个字段由谁负责、其他人是追加还是覆盖」**。
 *   后果是：同一字段两个覆盖型写者同时存在时，后写的静默吃掉先写的，而读面只看到
 *   一个「正常」的值 —— 与 V11 其它项同族，只是发生在写权层。
 *
 * 【本表只做三件事】
 *   ① 逐字段声明：责任引擎（owner）/ 允许的其他写者 / 各自的写方式（append/merge/overwrite）/ 冲突判定；
 *   ② 与现场**双向对账**：声明里列的写者集合必须等于静态扫描出的写者集合（多一个少一个都红）；
 *   ③ 冲突检测：同一字段出现**两个及以上覆盖型写者**必须被判为冲突并登记为待治理项，
 *      不许静默通过（那正是本项要治的病）。
 *
 * 【实测依据】2026-11-05 静态扫描（写形态：`d.X =` / `d.X[k] =` / `d.X.push|splice|unshift|sort|forEach(`，
 *   `d`/`draft`/`root`/`doc`/`state` 五种事务形参名）：
 *     worldFacts 6 台（2026-11-16 增补 core/evict.js 收缩式清理） · people 12 台 · evolution 9 台 · customLax 3 台 · economy 3 台
 *
 * 【v2.610.0（R285 WRA-1）复扫 —— 交付上一版的读数与现场对不上，本轮一并跟位】
 *   口径：产品面 624 个文件（`tests/product-files.js`），筛三种写形态（整块赋值 / 索引下标赋值 / 集合写）。
 *   冻结读数（`COVERAGE`，由 `tests/write-authority-v2610.js` 双向对账）：
 *     骨架顶层键 239 个 → 多写者 27 个 → 其中**吃掉现值**的 9 个 → 本表声明 11 个（含 1 条历史声明 customLax）→ 冻结基线 16 个（合计 48 个写者站点）。
 *   何谓「吃掉现值」（本轮确定的判据，可复算）：
 *     整块赋值且**右值不引用本字段当前值**，且不是建行守卫（`if (!d.X)` / `if (d.X === undefined)`）。
 *     三个差别很大：`d.X = d.X || {}`、`d.X = (d.X && ...) ? d.X : ...`、`if (!d.X) d.X = {}`
 *     三种写法**都不吃贡献**（只建行 / 只归一化），而 `d.X = {}`、`d.X = { a: [], b: [] }`、
 *     `d.X = []` 才把别人的账整块抄掉。上一版把这三类混在一起数，
 *     于是「整块替换字段 11 个」与「已声明 5 个」对不上，差距数本身就是假的。
 *
 * 【为什么「五字段」会一直显得够用 —— 本轮的真正缺口（两层）】
 *   ① 扫描面：`tests/v11-field-writers.js` 的 W2 只对**表内字段**做双向对账，而扫描面就是 `FIELDS` 本身。
 *     于是「表里没有的字段」永远不会被扫 —— 与 R283（默认值只扫它认识的那 354 台）、
 *     R284（指路只扫带目录前缀的引用）是同一类：**判据的扫描面被它自己锁死**。
 *   ② 挂载面（本轮实测，比①更硬）：本文件对应的那把锁它原本是用 `runScript`（spawn 子进程）
 *     挂上去的，而它只有 `module.exports = { runAll }`、**没有顶层执行**，于是子进程什么都不跑就 rc=0：
 *     判据不是「总是绿」，而是**从未跑过**。本轮改成 `runLock`后它当场报了两条真红（W8a 字段数 / W8b 写者数）。
 *   治法：扫描面改成骨架**全部顶层键**，按「是否吃掉现值」分档；吃掉型必须进表，其余冻结为基线（写者总数一动即红）。
 *   判据在 `tests/write-authority-v2610.js`。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  /**
   * 逐字段写权声明。
   *   owner  责任引擎（唯一真源，最终裁决权在它）
   *   writers 允许的写者清单：{ file, mode }
   *     mode: 'append' | 'merge' | 'overwrite'
   *       append    只往数组/映射里追加，不整块替换
   *       merge     按 key 合并（读写既有项，保留其他写者的贡献）
   *       overwrite 整块覆盖（**高风险**：会把其他写者的贡献吃掉）
   *   conflict 判定结果：'none' | 'declared'（已登记待治理）
   *   note     冲突说明 / 治理约定
   */
  const FIELDS = [
    { field: 'worldFacts', owner: 'engines/backstage.js',
      writers: [
        { file: 'engines/backstage.js', mode: 'append' },
        { file: 'engines/causal.js', mode: 'append' },
        { file: 'engines/inline-tags.js', mode: 'merge' },
        { file: 'engines/living-world.js', mode: 'merge' },
        { file: 'engines/world-bridge.js', mode: 'merge' },
        { file: 'engines/world-lab.js', mode: 'overwrite' },
        // core/evict.js 的孤儿清理：对事务形参上取 worldFacts 键后 filter 再重赋，
        // 但语义是【收缩式清理】——只剔除 __orphan 断开引用，保留其余全部写者的贡献，
        // 不吃任何人的账，故按贡献语义归 merge 而非 overwrite（v2.412.0 增补登记）。
        { file: 'core/evict.js', mode: 'merge' }
      ],
      conflict: 'none',
      note: '\u4e8b\u5b9e\u53f0\u8d26\u4ee5\u8ffd\u52a0\u4e3a\u4e3b\uff1bworld-lab \u662f**\u552f\u4e00\u8986\u76d6\u578b**\u5199\u8005\uff08\u5b9e\u9a8c\u9762\u5168\u91cf\u91cd\u5efa\uff09\uff0c\u5df2\u5728\u6b64\u58f0\u660e\u3002\u4e0b\u6e38\u4fee\u6539 world-lab \u7684\u5199\u6cd5\u65f6\u5fc5\u987b\u56de\u5230\u672c\u8868\u6539 mode\u3002' },
    { field: 'people', owner: 'engines/backstage.js',
      writers: [
        { file: 'actors/observe.js', mode: 'merge' },
        { file: 'actors/registry.js', mode: 'merge' },
        { file: 'engines/backstage.js', mode: 'merge' },
        { file: 'engines/custom-lax.js', mode: 'merge' },
        { file: 'engines/demographic-flow.js', mode: 'merge' },
        { file: 'engines/idiosyncrasy.js', mode: 'merge' },
        { file: 'engines/intel.js', mode: 'merge' },
        { file: 'engines/liaison.js', mode: 'merge' },
        { file: 'engines/life.js', mode: 'merge' },
        { file: 'engines/whisper-backchannel.js', mode: 'merge' },
        { file: 'engines/living-world.js', mode: 'merge' },
        { file: 'engines/playable-blueprint.js', mode: 'overwrite' },
        { file: 'engines/world-blueprint.js', mode: 'overwrite' },
        { file: 'engines/world-seed.js', mode: 'overwrite' }
      ],
      conflict: 'declared',
      note: '**\u5df2\u767b\u8bb0\u7684\u5f85\u6cbb\u7406\u9879**\uff1a12 \u4e2a\u5199\u8005\u91cc\u6709 3 \u4e2a\u8986\u76d6\u578b\uff08playable-blueprint / world-blueprint / world-seed\uff09\uff0c\u5b83\u4eec\u90fd\u662f**\u5f00\u5c40\u6784\u5efa\u9762**\uff0c\u8bbe\u8ba1\u610f\u56fe\u662f\u300c\u4ece\u96f6\u5efa\u4eba\u53e3\u300d\uff1b\u4f46\u4e09\u4e2a\u5f00\u5c40\u6784\u5efa\u9762\u540c\u65f6\u8dd1\u5c31\u4f1a\u4e92\u76f8\u5403\u3002\u6cbb\u7406\u65b9\u5411\uff1a\u5f00\u5c40\u6784\u5efa\u4e32\u884c\u5316\uff08\u53ea\u5141\u4e00\u4e2a\u9762\u6267\u884c overwrite\uff09\uff0c\u5f85\u540e\u7eed\u6279\u6b21\u6536\u53e3\u3002' },
    { field: 'evolution', owner: 'engines/evolution.js',
      writers: [
        { file: 'engines/editor-events.js', mode: 'merge' },
        { file: 'engines/editor-faction.js', mode: 'merge' },
        { file: 'engines/entities.js', mode: 'merge' },
        { file: 'engines/evolution.js', mode: 'merge' },
        { file: 'engines/horizon.js', mode: 'merge' },
        { file: 'engines/playable-blueprint.js', mode: 'overwrite' },
        { file: 'engines/tool-import.js', mode: 'overwrite' },
        { file: 'engines/world-blueprint.js', mode: 'overwrite' },
        { file: 'engines/world-seed.js', mode: 'overwrite' }
      ],
      conflict: 'declared',
      note: '**\u5df2\u767b\u8bb0\u7684\u5f85\u6cbb\u7406\u9879**\uff1a9 \u4e2a\u5199\u8005\u91cc 4 \u4e2a\u662f\u8986\u76d6\u578b\uff0c\u540c\u6837\u5168\u662f\u5f00\u5c40/\u5bfc\u5165\u9762\u3002evolution \u672c\u4f53\u53ea\u505a merge\uff0c\u8d23\u4efb\u5728\u5b83\uff1b\u4f46\u8986\u76d6\u578b\u9762\u5fc5\u987b\u4e32\u884c\u3002' },
    { field: 'customLax', owner: 'engines/custom-lax.js',
      writers: [
        { file: 'engines/action-desk.js', mode: 'merge' },
        { file: 'engines/custom-lax.js', mode: 'overwrite' },
        { file: 'engines/playable-blueprint.js', mode: 'merge' }
      ],
      conflict: 'none',
      note: 'custom-lax \u81ea\u5df1\u662f**\u552f\u4e00\u8986\u76d6\u578b**\uff08\u5b83\u662f\u5b57\u6bb5\u8d23\u4efb\u65b9\uff09\uff0c\u53e6\u5916\u4e24\u53f0\u90fd\u662f merge\u3002\u65e0\u51b2\u7a81\u3002' },
    { field: 'economy', owner: 'engines/economy.js',
      writers: [
        { file: 'engines/economy.js', mode: 'overwrite' },
        { file: 'engines/freight.js', mode: 'merge' },
        { file: 'engines/playable-blueprint.js', mode: 'merge' }
      ],
      conflict: 'none',
      note: 'economy \u81ea\u5df1\u662f**\u552f\u4e00\u8986\u76d6\u578b**\uff08\u5b57\u6bb5\u8d23\u4efb\u65b9\uff09\uff0cfreight \u4e0e playable-blueprint \u5747 merge\u3002\u65e0\u51b2\u7a81\u3002' },
    // ── v2.610.0（R285 WRA-1）：三本叙事账 + 脉搏 + 传送带 ─────────────────────
    //   为什么这五个进表：产品面 624 个文件的静态扫描里，它们是**表外仅有的**
    //   含「整块替换站点」的多写者字段（换掉整块 ⇒ 吃掉其他写者的贡献，而读面
    //   只看到一份「正常」的值）。不在这里声明，那类互吃就永远没有账。
    { field: 'chronicle', owner: 'engines/backstage.js',
      writers: [
        { file: 'engines/backstage.js', mode: 'merge' },
        { file: 'engines/hearsay-ledger.js', mode: 'append' },
        { file: 'engines/inline-tags.js', mode: 'append' },
        { file: 'engines/interlude.js', mode: 'append' },
        { file: 'engines/letter-post.js', mode: 'append' },
        { file: 'engines/regional.js', mode: 'append' },
        { file: 'engines/trace-post.js', mode: 'append' },
        { file: 'engines/world-blueprint.js', mode: 'overwrite' },
        { file: 'engines/world-brief.js', mode: 'append' },
        { file: 'engines/world-loop-log.js', mode: 'append' },
        { file: 'engines/world-seed.js', mode: 'overwrite' }
      ],
      conflict: 'declared',
      note: '编年账（世界史的唯一时间轴）。九个写者只追加，backstage 另做 200 条截断（收缩式清理，按 merge 计）；真正危险的是 world-blueprint 与 world-seed 两个**开局构建面**把历史整块清空。两者同一回合都跑，先跑的整段历史会被后跑的吃掉，而局面看上去依旧「正常」——与 people/evolution 已登记的是同一种病。治理方向：开局构建串行化（只许一个构建面执行清空）。' },
    { field: 'currents', owner: 'engines/backstage.js',
      writers: [
        { file: 'engines/backstage.js', mode: 'merge' },
        { file: 'engines/intel.js', mode: 'merge' },
        { file: 'engines/thread-sprout.js', mode: 'append' },
        { file: 'engines/world-blueprint.js', mode: 'overwrite' },
        { file: 'engines/world-seed.js', mode: 'overwrite' }
      ],
      conflict: 'declared',
      note: '暗流账（cap 40，挤出走 SITES）。backstage 与 intel 各自追加后截断（merge），thread-sprout 只追加；world-blueprint 清空、world-seed 更狠——先清空再用磁带尾巴整块替换。这两个构建面同时跑，暗流会变成「后跑者写的那份」。与 chronicle 同型，同一条治理方向。' },
    { field: 'echoes', owner: 'engines/backstage.js',
      writers: [
        { file: 'engines/backstage.js', mode: 'merge' },
        { file: 'engines/causal.js', mode: 'merge' },
        { file: 'engines/world-blueprint.js', mode: 'overwrite' },
        { file: 'engines/world-seed.js', mode: 'overwrite' }
      ],
      conflict: 'declared',
      note: '因果回声账（cap 40）。backstage 落「暗流兑现的回声」，causal 落「因果链落地的回声」，两侧都只追加并各自截断；两个开局构建面整块清空。与 chronicle / currents 同型冲突，同一治理批次。' },
    { field: 'worldPulse', owner: 'engines/backstage.js',
      writers: [
        { file: 'engines/backstage.js', mode: 'overwrite' },
        { file: 'direction/tags.js', mode: 'overwrite' }
      ],
      conflict: 'declared',
      note: '世界脉搏。两个写者都是整块重算：backstage 每轮按推演结果重写，direction/tags 是玩家手动加压/平息。后果是可复现的行为缺陷——玩家手动设的 pressure 会被下一轮推演整块吃掉，反过来手动值也会覆盖掉推演读数。治理方向：给手动值加 TTL 或独立覆盖位（未做，本轮只登记）。' },
    { field: 'nextTurnInjection', owner: 'engines/backstage.js',
      writers: [
        { file: 'engines/backstage.js', mode: 'overwrite' },
        { file: 'render/inject.js', mode: 'overwrite' }
      ],
      conflict: 'declared',
      note: '一次性传送带：backstage 每轮整块写，注入面读完即置 null。写在前、读后清，按回合串行；**同一回合内并发即丢**（后写的覆盖前写的）。本字段也是 render/ 目录唯一的写盘点，故在此点名——读面写盘不是错，没有账才是错。' },

    { field: 'schemaVersion', owner: 'engines/checkpoints.js',
      writers: [
        { file: 'engines/checkpoints.js', mode: 'overwrite' },
        { file: 'engines/tool-snapshot.js', mode: 'merge' }
      ],
      conflict: 'none',
      note: '「世界是第几版」在两个快照面上有两套口径：checkpoints 回滚时按 store.get() 的**数据版本**强制复位（旁边那段注释明写「归档不参与决定世界的版本」），tool-snapshot 恢复快照时只在键缺席时补 store.SCHEMA_VERSION（**代码版本**，建行守卫，按 merge 计）。升级后两个数就不一样：同一份快照经两条路恢复，schemaVersion 会是不同的值。checkpoints 的强制复位把快照带的版本吃掉——这是**故意的**（世界版本得由数据说了算），但同时意味着「快照里那个数从来不算数」。因此覆盖者只有一个，登记为 none 而非 declared：这是一条已定案的读法，不是待治理项。' }
  ];

  /** 冲突判定：同一字段出现 >=2 个 overwrite 写者 */
  function conflictOf(entry) {
    const ow = entry.writers.filter(function (w) { return w.mode === 'overwrite'; });
    return { overwriters: ow.map(function (w) { return w.file; }), count: ow.length };
  }
  function entryOf(field) {
    for (let i = 0; i < FIELDS.length; i++) if (FIELDS[i].field === field) return FIELDS[i];
    return null;
  }
  function writersOf(field) {
    const e = entryOf(field);
    return e ? e.writers.map(function (w) { return w.file; }).sort() : [];
  }
  /** 冲突总账：只统计真冲突（>=2 覆盖者）与已登记项 */
  function conflicts() {
    return FIELDS.map(function (e) {
      const c = conflictOf(e);
      return { field: e.field, overwriters: c.overwriters, conflicts: c.count >= 2, declared: e.conflict === 'declared' };
    });
  }
  /** 真冲突（>=2 覆盖型）但**未**登记为 declared —— 这才是必须判红的 */
  function undeclaredConflicts() {
    return conflicts().filter(function (c) { return c.conflicts && !c.declared; });
  }
  /**
   * 覆盖面读数（v2.610.0 · R285 WRA-1）—— **冻结值**，与现场静态扫描由
   * `tests/write-authority-v2610.js` 双向对账（数字对不上就红）。
   *
   * 为什么要有它：本表从 v2.300.0 起只声明 5 个字段，而读面看到的「共 N 个字段」
   * 长得就像「写权面已经齐了」。真实覆盖面是：骨架顶层键 209 个里 **27 个**是多写者，
   * 本表声明 10 个，另 17 个已量过、现场 0 个整块替换站点（全部是建行守卫或局部字段写）。
   * 本字段不改判据（表内字段仍是唯一被双向对账的），只把**没覆盖的那部分**也说出口 ——
   * 一个读数如果只说自己覆盖了什么，它就是在替「没覆盖」行骗。
   */
  const COVERAGE = {
    at: 'v2.610.0',
    topKeys: 239,        // Object.keys(store.get())（现场真源）。注：tests/field-liveness-ledger.json 的 schemaTopKeys 还停在 209（差 30 个）
    multiWriter: 27,     // 其中写者 >= 2 个的字段（产品面 624 个文件静态扫描）
    eatFields: 9,        // 其中含「吃掉现值」整块赋值站点的（= 必须进表的集合）
    declared: 11,        // 本表声明数（8 个吃掉型 + economy + customLax历史声明 + schemaVersion）
    deferred: 16,        // 已量过、永不声明：27 - 11，现场 0 个吃掉型站点
    deferredSites: 48,   // 上面 16 个字段的写者总数（此数一动即红：新增写者得先回来看看是不是吃掉型）
    rule: '含「吃掉现值」整块赋值站点的多写者字段必须进表；其余冻结为基线，写者总数一动即红'
  };
  function stat() {
    const cs = conflicts();
    return {
      fields: FIELDS.length,
      writers: FIELDS.reduce(function (n, e) { return n + e.writers.length; }, 0),
      conflicted: cs.filter(function (c) { return c.conflicts; }).length,
      declared: cs.filter(function (c) { return c.declared; }).length,
      undeclared: cs.filter(function (c) { return c.conflicts && !c.declared; }).length
    };
  }
  function view() {
    return { stat: stat(), coverage: Object.assign({}, COVERAGE), fields: FIELDS.map(function (e) {
      const c = conflictOf(e);
      return { field: e.field, owner: e.owner, writers: e.writers.slice(),
        overwriters: c.overwriters, conflict: e.conflict, note: e.note };
    }) };
  }

  WA.fieldWriters = {
    FIELDS: FIELDS,
    entryOf: entryOf,
    writersOf: writersOf,
    conflicts: conflicts,
    undeclaredConflicts: undeclaredConflicts,
    stat: stat,
    view: view
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/field-writers.js', { kind: 'engine', ver: '2.610.0' });
  if (WA.log) WA.log('info', 'engines/field-writers \u5df2\u52a0\u8f7d\uff082.300.0\uff09');
})();
