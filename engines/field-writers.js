/**
 * WorldAxis engines/field-writers.js（v2.300.0 · V11 OPV11-6）
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
 *     worldFacts 5 台 · people 12 台 · evolution 9 台 · customLax 3 台 · economy 3 台
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
        { file: 'engines/living-world.js', mode: 'merge' },
        { file: 'engines/world-bridge.js', mode: 'merge' },
        { file: 'engines/world-lab.js', mode: 'overwrite' }
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
        { file: 'engines/intel.js', mode: 'merge' },
        { file: 'engines/liaison.js', mode: 'merge' },
        { file: 'engines/life.js', mode: 'merge' },
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
      note: 'economy \u81ea\u5df1\u662f**\u552f\u4e00\u8986\u76d6\u578b**\uff08\u5b57\u6bb5\u8d23\u4efb\u65b9\uff09\uff0cfreight \u4e0e playable-blueprint \u5747 merge\u3002\u65e0\u51b2\u7a81\u3002' }
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
    return { stat: stat(), fields: FIELDS.map(function (e) {
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
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/field-writers.js', { kind: 'engine', ver: '2.300.0' });
  if (WA.log) WA.log('info', 'engines/field-writers \u5df2\u52a0\u8f7d\uff082.300.0\uff09');
})();
