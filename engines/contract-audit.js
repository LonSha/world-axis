/**
 * WorldAxis engines/contract-audit.js (v0.9.6) — 推演契约对账器（纯只读）
 *
 * 解决的问题：推演引擎的输出契约（backstage.buildPrompt 里的 JSON 结构说明）
 * 与消费端（backstage.applyResult 的入账逻辑）是两处手写文本，长期演化必然漂移：
 *   - 契约声明了字段，但消费端不读 → 模型白花 token 产出，静默丢弃
 *   - 消费端读了字段，但契约没声明 → 模型永远不会发，逻辑成死代码
 *   - 枚举值两边不一致（如契约写「动荡」而校验器只认「衰退」）→ 静默回落默认值
 *
 * 方法（不靠 grep 源码，靠实测）：
 *   1. parseContract() 从真实 buildPrompt() 输出中解析声明字段与枚举候选值
 *   2. consumedFields() 向 applyResult 喂「哨兵探针」对象，对比入账前后 state 差异，
 *      实测消费面（含委托给 evolution/enemies/horizon 等下游模块的间接消费）
 *   3. audit() 双向对账 + 枚举对齐 + 已知跨模块漂移扫描，输出漂移清单
 *
 * 只读保证：探针在 store.get() 的深拷贝上运行，不落盘、不 transact；
 * 探针期间仅屏蔽 digest.generate（会重写记忆段造成噪声），horizon 保留——
 * 因为 distantEvent/nearEvent 的消费就是 horizon.acceptResult，屏蔽它会判成假阴性。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const PROBE_TAG = '__audit_';
  function deepClone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }
  function safe(fn, fb) { try { const v = fn(); if (v !== undefined) return v; } catch (e) {} return fb === undefined ? null : fb; }

  // ── 哨兵探针：每个字段一个足以引发状态变化的合成值（标记 PROBE_TAG 便于追踪）──
  const PROBES = {
    clock: PROBE_TAG + 'clock',
    world_pulse: { pressure: 3, trend: 'rising', note: PROBE_TAG + 'pulse' },
    worldFacts: [{ key: PROBE_TAG + 'fact', value: '1', scope: 'world' }],
    people: [{ name: PROBE_TAG + 'person', location: 'L', action: 'A' }],
    knowledge_updates: [{ person: PROBE_TAG + 'person', about: PROBE_TAG + 'know', status: 'fact', route: 'witnessed' }],
    currents: [{ title: PROBE_TAG + 'current', summary: 's', visibility: 'trace', stage: '发展' }],
    echoes: [{ refCurrent: PROBE_TAG + 'current', result: PROBE_TAG + 'echo', exposure: 'subtle' }],
    chronicle: [{ kind: 'event', title: PROBE_TAG + 'chronicle', summary: 's' }],
    foreshadows: [{ id: PROBE_TAG + 'fs', content: 'c', status: 'waiting' }],
    factions: [{ name: PROBE_TAG + 'faction', scope: 's', status: '稳固', relation: '中立', currentGoal: 'g', core_person: 'c', powerPillars: ['p'] }],
    // 四维全给：applyReputation 逐维校验 REPUTATION_LEVELS 后写入，任一维命中即消费
    reputation: { authority: '受人尊敬', common: PROBE_TAG + 'rep', shadow: PROBE_TAG + 'rep', circuit: PROBE_TAG + 'rep', lastChange: PROBE_TAG + 'rep' },
    economy: { climate: '繁荣', signals: [{ summary: PROBE_TAG + 'econ', scope: 's' }] },
    influenceChain: [{ trigger: PROBE_TAG + 'chain', impact: 'i', fallout: 'f' }],
    winds: [{ topic: PROBE_TAG + 'wind', type: 'rumor', level: 2, content: 'c' }],
    enemies: [{ name: PROBE_TAG + 'enemy', reason: PROBE_TAG + 'enemy', type: 'grudge', status: '追踪中' }],
    blackbox: { secretActions: [{ action: PROBE_TAG + 'secret', witnesses: 'none' }], secretAssets: [{ name: PROBE_TAG + 'asset', exposure: 1, status: '有效' }] },
    worldTrends: [{ name: PROBE_TAG + 'trend', scope: 's', status: '持续中', description: 'd' }],
    regionalIncident: { active: true, title: PROBE_TAG + 'regional', type: 'plague', scope: 's', impact: 'i' },
    // horizon 校验 title（distant）或 description/title（near），两个字段都给避免卡校验
    distantEvent: { type: 'event', title: PROBE_TAG + 'distant', desc: PROBE_TAG + 'distant', topic: PROBE_TAG + 'distant', content: PROBE_TAG + 'distant', level: 2 },
    nearEvent: { title: PROBE_TAG + 'near', desc: PROBE_TAG + 'near', description: PROBE_TAG + 'near', urgent: true },
    entities: { organization: [{ name: PROBE_TAG + 'org', aliases: [], desc: 'd' }] },
    next_turn_injection: { required: [PROBE_TAG + 'constraint'], conditional: [], suppress: [] },
    // v2.2.0: 事件链两字段——此前 PROBES 漏登，导致对账器抓不到
    //   「applyResult 消费了 events_* 而契约未声明」这一漂移（哨兵自己失明）
    events_create: [{ title: PROBE_TAG + 'event', type: 'conflict', level: 2, desc: PROBE_TAG + 'desc' }],
    events_update: [{ id: PROBE_TAG + 'seedEv', title: PROBE_TAG + 'seedEv', stage: '酽酿', desc: PROBE_TAG + 'upd' }]
  };
  const FIELDS = Object.keys(PROBES);
  // ── 更新类探针的基线种子 ──
  // 更新探针必须能命中已存在事件，否则 applyResult 找不到目标（只计入 eventsLoose），
  // 状态无变化 → 会被误判成「消费端不读」（假阴性）。故种一条与探针 id 同名的事件，
  // 且 before/draft 两侧同时种，保证状态差分只反映「更新是否真的落地」。
  // v2.2.0: live 兜底白名单——只有这些字段把结果写进 live store 而非入参 draft
  //   （horizon.acceptResult 写 store.get().evolution.horizon[kind]）。
  //   其余字段若也被 live 兜底命中，只可能是跨轮哨兵残留 + 无关 live 变化造成的假阳性，
  //   会把「消费端其实没读」误判成已消费（哨兵漏报），故必须限定范围。
  const LIVE_DELEGATED = ['distantEvent', 'nearEvent'];
  const SEEDS = {
    events_update: function (st) {
      st.evolution = st.evolution || {};
      st.evolution.events = st.evolution.events || [];
      st.evolution.events.push({ id: PROBE_TAG + 'seedEv', type: 'conflict', name: PROBE_TAG + 'seedEv', title: PROBE_TAG + 'seedEv', level: 1, stage: '萌芽', stageRound: 1, desc: '' });
    }
  };

  // ── 契约解析：从真实 buildPrompt 输出提取声明字段与枚举候选值 ──
  // 字段行形如：  "fieldName": {...} 或 "fieldName": [...] 或 "fieldName": "...",
  function parseContract(promptMessages) {
    const out = { fields: {}, enums: {}, raw: '' };
    try {
      const msgs = Array.isArray(promptMessages) ? promptMessages : [];
      const sys = msgs.filter(function (m) { return m && m.role === 'system'; }).map(function (m) { return String(m.content || ''); }).join('\n');
      out.raw = sys;
      const fieldRe = /^\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*:/gm;
      let m;
      while ((m = fieldRe.exec(sys)) !== null) out.fields[m[1]] = true;
      // 枚举候选：形如 "key":"甲|乙|丙" 的管道串
      // 归属判定取该管道串之前最近的「字段行」名字（跳过嵌套属性），
      // 同一字段可多次出现（如 factions 的 status 与 relation），全部聚合后比对
      const enumRe = /"([A-Za-z_][A-Za-z0-9_]*)"\s*:\s*"([^"\n]*\|[^"\n]*)"/g;
      let curField = '?';
      while ((m = enumRe.exec(sys)) !== null) {
        // 从当前位置往前找最近的字段行，确定归属字段
        const head = sys.slice(0, m.index);
        const fm = /(?:^|\n)\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g.exec(head);
        // fm 可能因 lastIndex 位置只匹配到最后一个，用循环取最后一个
        let last = null, tmp;
        const re2 = /(?:^|\n)\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g;
        while ((tmp = re2.exec(head)) !== null) last = tmp;
        curField = last ? last[1] : '?';
        const vals = String(m[2]).split('|').map(function (x) { return x.trim(); }).filter(Boolean);
        if (!out.enums[curField]) out.enums[curField] = [];
        vals.forEach(function (v) { if (out.enums[curField].indexOf(v) < 0) out.enums[curField].push(v); });
      }
    } catch (e) { /* 解析失败返回已收集部分 */ }
    return out;
  }

  // ── 消费实测：把探针逐字段喂给 applyResult，对比 state 差异 ──
  function diffState(before, after) {
    return JSON.stringify(before || {}) !== JSON.stringify(after || {});
  }
  /** 逐字段隔离测试：每个字段单独喂，看 state 是否发生变化且哨兵标记落地 */
  function consumedFields(opts) {
    const o = opts || {};
    const applyFn = ('applyFn' in o) ? o.applyFn : (WA.backstage && WA.backstage.applyResult);
    const result = {};
    if (typeof applyFn !== 'function') {
      FIELDS.forEach(function (f) { result[f] = { consumed: false, reason: 'applyResult 不可用' }; });
      return result;
    }
    const baseState = ('baseState' in o) ? o.baseState : safe(function () { return deepClone(WA.store.get()); }, null);
    if (!baseState) {
      FIELDS.forEach(function (f) { result[f] = { consumed: false, reason: '无基准state（需先 store.init）' }; });
      return result;
    }
    // 屏蔽 digest.generate（重写记忆段造成标记噪声）；
    // horizon 不屏蔽——distantEvent/nearEvent 的消费就是 horizon.acceptResult，
    // 它把结果写进 store.get().evolution.horizon[kind] 而非入参 draft，
    // 因此探针期间必须把 live store 快照起来，结束后再恢复，否则会污染真实存档。
    const keepDigest = WA.digest;
    const noop = function () { return null; };
    const liveSnapshot = safe(function () { return deepClone(WA.store.get()); }, null);
    try {
      if (keepDigest) WA.digest = Object.assign({}, keepDigest, { generate: noop });
      FIELDS.forEach(function (f) {
        const probe = {};
        probe[f] = deepClone(PROBES[f]);
        // people 探针被 applyResult 浅拷贝写回后标记会残留，每轮强制重建
        if (f === 'people' || f === 'entities' || f === 'knowledge_updates') probe[f] = JSON.parse(JSON.stringify(PROBES[f]));
        const before = deepClone(baseState);
        const draft = deepClone(baseState);
        // 更新类探针：两侧同时种基线，保证差分只反映更新效果（种子本身不算消费）
        if (SEEDS[f]) { safe(function () { SEEDS[f](before); }); safe(function () { SEEDS[f](draft); }); }
        // 本轮开始前的 live 快照：live 兜底必须用「本轮前后差分」而不是「相对整个循环起点」——
        //   循环内前面的字段会把哨兵留在 live，用全局差分会让后续字段恒真（假阳性漏报漂移）。
        const liveBefore = safe(function () { return deepClone(WA.store.get()); }, null);
        // 喂探针前把 live store 压回干净基线（acceptResult 会绕过 draft 直接写 store）
        safe(function () {
          const ls = WA.store.get();
          ls.evolution.horizon.distant.pending = null;
          ls.evolution.horizon.near.pending = null;
          ls.chronicle = ls.chronicle || [];
          ls.nextTurnInjection = ls.nextTurnInjection || null;
        });
        let ok = true, err = null;
        try { applyFn(draft, probe, { idx: 999 }); }
        catch (e) { ok = false; err = String((e && e.message) || e); }
        const changed = ok && diffState(before, draft);
        const liveAfter = safe(function () { return WA.store.get(); }, {});
        const liveChanged = diffState(liveSnapshot, liveAfter);
        const marked = JSON.stringify(draft || {}).indexOf(PROBE_TAG) >= 0
          || JSON.stringify(liveAfter).indexOf(PROBE_TAG) >= 0;
        // horizon 委托字段：写 live store 而非 draft，用 live 变化兜底判定
        // live 兜底：仅限委托字段，且必须是「本轮前后 live 真发生差异」（字段特异，抗前轮残留）
        const liveIterChanged = liveBefore ? diffState(liveBefore, liveAfter) : false;
        const liveOk = LIVE_DELEGATED.indexOf(f) >= 0 && liveIterChanged && marked;
        result[f] = {
          consumed: !!((changed && marked) || liveOk),
          changed: !!changed,
          marked: marked,
          error: err
        };
      });
    } finally {
      // 探针期间 horizon/chronicle 等委托写入会污染 live store，
      // 全量原位还原（保留 memCache 引用，避免破坏 store 的引用一致性）
      if (liveSnapshot) safe(function () {
        // v0.1.39: 还原走事务栈——深改写在 transact draft 上进行（原先裸改 live store + 裸 save），
        // 计量/批作用域/审计语义与常规写路径一致
        WA.store.transact(function (d) {
          Object.keys(d).forEach(function (k) { delete d[k]; });
          const snap = deepClone(liveSnapshot) || {};
          Object.keys(snap).forEach(function (k) { d[k] = snap[k]; });
        });
      });
      if (keepDigest) WA.digest = keepDigest;
    }
    return result;
  }

  // ── 枚举对齐表：契约字段 → 消费端认可的枚举值（来自 evolution/enemies 等模块常量）──
  // 对账口径：以字段为单位聚合（如 factions 的 status+relation 两条枚举行都归 factions），
  // 任一期望值在契约聚合集合中缺失即报漂移
  const ENUM_ALIGN = [
    { field: 'world_pulse', expect: ['rising', 'falling', 'steady'] },
    { field: 'factions', expect: ['鼎盛', '稳固', '倾轧', '困顿', '衰落', '瓦解'] },
    { field: 'factions', expect: ['血盟', '盟友', '友好', '中立', '冷淡', '敌对', '世仇'] },
    { field: 'reputation', expect: ['天怒人怨', '声名狼藉', '默默无闻', '受人尊敬', '万众敬仰'] },
    { field: 'economy', expect: ['繁荣', '平稳', '衰退', '动荡'] },
    { field: 'enemies', expect: ['追踪中', '策划中', '执行中', '已终结'] },
    { field: 'enemies', expect: ['blood', 'grudge'] },
    { field: 'blackbox', expect: ['有效', '过期', '暴露', '失效'] },
    { field: 'worldTrends', expect: ['持续中', '已结束'] },
    { field: 'regionalIncident', expect: ['bandit', 'plague', 'market', 'faction_clash', 'official', 'sect', 'infrastructure', 'ominous'] },
    { field: 'currents', expect: ['hidden', 'trace', 'known', 'direct'] },
    { field: 'currents', expect: ['private', 'trace', 'public'] }
  ];
  // ── 跨模块枚举漂移扫描：同一枚举在多处独立手写时的互相一致性 ──
  // 已知风险点：backstage 契约与 evolution.ECONOMY_CLIMATE 都写经济气候，
  // 而 tool-analyzer.ECON_SCORE 用了「萧条|危机」第三套词——模型按契约产出「衰退」时，
  // analyzer 查表落空得默认分，压力计算静默偏移。此类漂移必须显式上报。
  const CROSS_MODULE = [
    {
      name: 'economy.climate',
      sources: {
        contract: ['繁荣', '平稳', '衰退', '动荡'],
        evolution: function () { return WA.evolution && WA.evolution.ECONOMY_CLIMATE; },
        analyzer: function () { return WA.toolAnalyzer && WA.toolAnalyzer.ECON_SCORE ? Object.keys(WA.toolAnalyzer.ECON_SCORE) : null; }
      },
      severity: 'error',
      hint: '模型按契约产出「衰退/动荡」，analyzer 查表落空得默认分，压力计算静默偏移'
    },
    {
      name: 'reputation.levels',
      sources: {
        contract: ['天怒人怨', '声名狼藉', '默默无闻', '受人尊敬', '万众敬仰'],
        evolution: function () { return WA.evolution && WA.evolution.REPUTATION_LEVELS; }
      },
      severity: 'warn'
    },
    {
      name: 'faction.status',
      sources: {
        contract: ['鼎盛', '稳固', '倾轧', '困顿', '衰落', '瓦解'],
        evolution: function () { return WA.evolution && WA.evolution.FACTION_STATUS; }
      },
      severity: 'warn'
    },
    {
      name: 'faction.relation',
      sources: {
        contract: ['血盟', '盟友', '友好', '中立', '冷淡', '敌对', '世仇'],
        evolution: function () { return WA.evolution && WA.evolution.FACTION_RELATION; }
      },
      severity: 'warn'
    },
    {
      name: 'enemies.status',
      sources: {
        contract: ['追踪中', '策划中', '执行中', '已终结'],
        enemies: function () { return WA.enemies && WA.enemies.ENEMY_STATUS; }
      },
      severity: 'warn'
    },
    {
      name: 'regional.incidentTypes',
      sources: {
        contract: ['bandit', 'plague', 'market', 'faction_clash', 'official', 'sect', 'infrastructure', 'ominous'],
        // v2.10.0: 读侧完整性契约的留痕点——本文件是跨模块契约审计的唯一消费端。
        // v2.15.0: 时间源治理契约留痕（第九面：可复现性的另一半）。
        //   跨模块契约点：v2.14.0 把随机源收成单一出口之后，可复现性只完成了**一半**——
        //   第二个输入（时间）一格未管，而时间戳**大量落盘并参与判定**：store 的过期判定
        //   （决定哪些键被当过期数据回收）、meta.createdAt/updatedAt/lastSettle、恢复点 at、
        //   memory 的摘要 t / facts.at / 'superseded@'+时间戳、chatcache 快照 id 与 at、
        //   workflow 链历史 at。core/clock.js 因此是时间的单一出口，两条口径：
        //   决策时间 now(site)（未冻结==墙钟，故迁移行为中立；冻结==可指定常量 + advance 步进）
        //   与测量时间 wallNow()（耗时台账/渲染展示，**不受冻结影响**——冻住它会让「跑了多久」
        //   变假话）。站点名是已消费面（与 rand.channels()/evict.SITES 同型）。
        //   诊断经 toolDiag.runtime.clock 透出（含 failed/failedBy——首版漏透出这两个字段时，
        //   非法冻结在诊断包里恒不可见、verdict 只会落 info 分支说「未冻结」，属「声明面空转」），
        //   健康分经 maintain().signals.clockNowCalls/clockFailed/clockReproducible 计量，
        //   面板概览经 ui/panel.js 的「时间源（存档可复现性）」块展示。
        //   **消费端契约**：本文件与 tests/run.js v2.15.0 块共同冻结「唯一墙钟读取点 ↔ 冻结即确定
        //   ↔ 两类时间不混流 ↔ 落盘时间戳确实跟随冻结 ↔ 非法参数不静默」五项性质
        //   （含负向自证 4 项与「原版对照」断言，且每一项都经假设性破坏验证）。
        //   本版同时修掉三处**真实归因错误**（rand.id 与 workflow 链历史 at 属决策时间却走了
        //   测量时钟；settings-bus 两处内存台账时间戳属测量时间却走了决策时钟）。
        // v2.14.0: 随机源治理契约留痕（第八面：可复现性）。
        //   跨模块契约点：随机是唯一「同一存档重放会得出不同结论」的来源，而在本版之前
        //   它散在 16 个产品文件里裸调（30 余处），其中 5 处是行为性决策。core/rand.js 是
        //   单一出口：决策流（next/int/dice/chance/pick/pickWeighted）可复现、标识流（id）
        //   唯一性优先且不占决策序列、通道按名派生互不相关也不互消费。
        //   诊断经 toolDiag.runtime.rand 透出，健康分经 maintain().signals.randDraws/randFailed/
        //   randReproducible 计量，面板概览经 ui/panel.js 的「随机源（决策可复现性）」块展示。
        //   **消费端契约**：本文件与 tests/run.js v2.14.0 块共同冻结「同种子同序列 ↔ 通道隔离
        //   ↔ 标识流不占决策序列 ↔ 非法参数不静默」四项性质（含负向自证，且每一项都经
        //   逆向审计做过假设性破坏验证）。
        //   本版同时修掉一条测试基座真缺陷（ui-dom 壳窗口截断宿主能力 + LOAD 重装顺序），
        //   并据逆向审计结果补强了通道隔离判据（原判据只证「互不消费」、未证「互不相关」）。
        // v2.13.0: 挤出侧完整性契约留痕——七面治理的最后一面。
        //   跨模块契约点：挤出是本仓库唯一「按设计丢数据」的路径，而在本版之前它**零出口**：
        //   core/evict.js 的站点表 SITES 是 cap 的可执行真源，业务侧 14 个文件（backstage/
        //   memory/enemies/entities/evolution/opinion/pmem/ledger/chapters/direct-event/
        //   summarizer/horizon/registry/profile）的截断全部改走 `WA.evict.array/note`，
        //   诊断经 toolDiag.runtime.evict 透出，健康分经 maintain().signals.evicts 计量，
        //   面板概览经 ui/panel.js 的「容量收纳」块展示。**消费端契约**：本文件与
        //   tests/run.js v2.13.0 块共同冻结「站点表 ↔ 容量登记表 ↔ 源码调用点」三方对账。
        //   本版同时修掉四类真缺陷（登记表盲区 smallSummaries/bigSummaries、第二写入方
        //   horizon.chronicle、主路径裸裁剪 entities.create、采样端上限漂移 profile.compactOld），
        //   并把两条假判据（「全库已无 slice(-N)」与 note 型站点悬空）改写为诚实判据。
        // v2.12.0: UI render-path gate contract trace. tests/run.js LOAD omits ui/* on purpose,
        //   and its inline DOM stub is a hollow shell, so the render path had zero coverage
        //   (only the overview renderer executed, its output dropped). New in this version:
        //   tests/ui-dom.js (dependency-free mini-DOM: parseable innerHTML, queryable tree,
        //   clickable controls), tests/ui-gate.js (standalone G17 gate, 42 assertions) and
        //   tests/ui-gate-sync.js (load semantics shared with run.js, no copy). The cases are
        //   embedded verbatim into run.js block 5, and negative injections (renderer throw /
        //   tab binding cut) prove the gate is not a false green. No npm dependency is added:
        //   a gate that silently skips on other machines is no gate at all.
        // v2.11.0: 「活性面治理」契约留痕——三面同时收口：
        //   面A 裸读点收口（全库 40 处 `localStorage.getItem` 全部归因，跨模块经
        //        `store.reportReadFail` 单一投递；G16 门禁冻结逐文件清单，与 G13/G14/G15
        //        构成四面对偶——写侧白名单 / 删侧唯一出口 / 读失败归因 / 裸读点清单）；
        //   面B `_schema` 结构指纹的读侧消费（盖章改为状态机 current/stamped/stale/failed，
        //        并把自 v2.5.0 就写盘却**从未被读过**的 `.d` 摘要与 `.at` 写入时间接进
        //        诊断与面板——「这份磁盘值是另一个结构版本写的」第一次可问）；
        //   面C 死面分级与接线（inventory `--dead` 报出的 70 项真死导出被分级为
        //        55 项 internal-helper + 15 项 unwired，后者里接通 10 项**真功能断链**、
        //        摘除 5 项被 Safe 版取代的过时裸入口）。
        //   写侧（writes）与删侧（removes）收口后**读侧仍是空白面**：全库只有一个来源不明的
        //   单桶 `stats.failures` 且产品零消费，于是「用户配置读坏了、回落默认值」与
        //   「用户从未配置」在诊断与界面上完全一样。本版把读侧补齐为三面的第三面。
        //   v2.11.0（R3 逆向审计自纠，探针复现后当版修）：
        //     ① **归因不实**——磁盘值损坏时 `val` 已回落 `r.def`，照常盖章会把 **def 的指纹**
        //        当成「磁盘上真实存在的结构」而判 `current`。于是「这份值结构正确」这句结论
        //        建立在兜底值上，而真相是「这份值根本读不出来」。改为损坏路径不盖章（传 null），
        //        并单列状态 `unreadable`——「有配置被读坏」与「从未配置」严格可分辨，
        //        `lastStamp.fp` 同时记 null（不用声明结构的指纹冒充磁盘结构）。
        //     ② **重入串扰**——结果此前只存在模块级槽 `__schemaStampResult`，而本函数的写盘
        //        会同步进入 `ls_set`，其间若发生重入（同一同步栈内的另一次 `read`：storage 事件
        //        回调、面板刷新、诊断在写盘通知里顺带读配置），外层 read 落账时读到的是**另一个键**
        //        的 status/fp/prevAt（探针实测：A 的 stamped 落账里出现 B 的旧写入时间）。
        //        改为 `schemaStamp` 返回本次结果对象、read 用捕获的那一份落账，函数体内
        //        一律经局部引用写状态（零裸全局槽写，由块3 的门禁断言钉住）。
        // v2.9.0: 删除侧完整性契约的留痕点——本文件是跨模块契约审计的唯一消费端，
        //   删除侧空白面（全库裸 removeItem 零计量/零复核/零归因）正是靠它这类跨模块
        //   一致性审计才能被发现：写入侧有 lsWrite 单出口与 verifyFailed，删除侧什么都没有。
        // v2.8.0: 此前写 `incidentTypes || INCIDENT_TYPES`——两个名字都取不到（见 regional.js 注记），
        //   故此处改为只读唯一出口 `incidentTypes`；取不到时由下面的「源缺失」规则报 error，
        //   不再像以前那样静默跳过比对。
        regional: function () { return WA.regional && WA.regional.incidentTypes; }
      },
      severity: 'warn'
    }
  ];

  /**
   * 全量对账。
   * opts: { promptFn, applyFn, baseState }
   * 返回：{ declared, consumed, drift, enums, crossModule, issues, verdict }
   */
  function audit(opts) {
    const o = opts || {};
    // 在任何探针动作之前先冻结基线（buildPrompt 读 live store，consumedFields 会短暂写入它），
    // 保证整条对账链路用的是同一份干净 state
    const auditBase = ('baseState' in o) ? o.baseState : safe(function () { return deepClone(WA.store.get()); }, null);
    const promptFn = ('promptFn' in o) ? o.promptFn : (WA.backstage && WA.backstage.buildPrompt);
    const prompt = safe(function () { return promptFn ? promptFn({ idx: 1, text: '' }, '') : []; }, []);
    const contract = parseContract(prompt);
    const consumed = consumedFields({ applyFn: o.applyFn, baseState: auditBase });
    const declaredList = Object.keys(contract.fields);
    const consumedList = Object.keys(consumed).filter(function (f) { return consumed[f].consumed; });
    // 声明但未消费：模型产出了却没人读（白产出）
    const declaredNotConsumed = declaredList.filter(function (f) { return FIELDS.indexOf(f) >= 0 && !consumed[f].consumed; });
    // 探针能消费但契约未声明：消费端在读，但模型永远不会发（死代码风险）
    const probeNotDeclared = FIELDS.filter(function (f) { return !contract.fields[f] && consumed[f].consumed; });

    // 枚举对齐：以字段聚合后做集合比对
    const byField = {};
    ENUM_ALIGN.forEach(function (e) {
      if (!byField[e.field]) byField[e.field] = [];
      e.expect.forEach(function (v) { if (byField[e.field].indexOf(v) < 0) byField[e.field].push(v); });
    });
    const enums = Object.keys(byField).map(function (field) {
      const expect = byField[field];
      const actual = contract.enums[field] || [];
      if (!actual.length) return { field: field, status: 'no_enum_in_contract', expect: expect, actual: actual };
      const missing = expect.filter(function (v) { return actual.indexOf(v) < 0; });
      const extra = actual.filter(function (v) { return expect.indexOf(v) < 0; });
      return { field: field, status: (missing.length || extra.length) ? 'mismatch' : 'aligned', missing: missing, extra: extra, actual: actual };
    });

    // 跨模块漂移
    const crossModule = CROSS_MODULE.map(function (c) {
      const sets = {};
      Object.keys(c.sources).forEach(function (k) {
        const v = c.sources[k];
        sets[k] = typeof v === 'function' ? safe(v, null) : v;
      });
      // v2.8.0: 「源取不到」必须先于「有没有差异」判定。
      //   此前口径是「逐个**非空**源比对」——源为 null 就跳过，于是导出名写错（或压根没导出）
      //   的检查会永远报 0 差异，看上去是「各处一致」，实际是**一次都没比过**。
      //   这正是 regional.incidentTypes 的真实经历：两个名字都取不到，6 组里这一组
      //   自建立起从未执行，而报告上它和其它 5 组长得一模一样。属「结论不实」的最小形态。
      //   凡源缺失即报 error（模块未加载 / 导出名不符 / 实现未导出），绝不静默。
      const missingSources = Object.keys(sets).filter(function (k) {
        if (k === 'contract') return false;
        return sets[k] === null || sets[k] === undefined;
      });
      // 以 contract 集合为基准，逐个非空源比对
      const baseSet = sets.contract || [];
      const diffs = {};
      Object.keys(sets).forEach(function (k) {
        if (k === 'contract' || !sets[k]) return;
        const d = sets[k].filter(function (v) { return baseSet.indexOf(v) < 0; });
        if (d.length) diffs[k] = d;
      });
      return { name: c.name, severity: c.severity, sets: sets, diffs: diffs,
        missingSources: missingSources, compared: Object.keys(sets).length - 1 - missingSources.length,
        hint: c.hint || null };
    });

    const issues = [];
    if (declaredNotConsumed.length) issues.push({ level: 'warn', code: 'declared_not_consumed', detail: '契约声明但消费端不读：' + declaredNotConsumed.join('、') + '（模型白产出，静默丢弃）' });
    if (probeNotDeclared.length) issues.push({ level: 'error', code: 'probe_not_declared', detail: '消费端有处理但契约未声明：' + probeNotDeclared.join('、') + '（模型永远不会发）' });
    enums.forEach(function (e) {
      if (e.status === 'mismatch') issues.push({ level: 'warn', code: 'enum_drift', detail: e.field + ' 枚举漂移：契约缺 [' + e.missing.join(',') + '] 契约多 [' + e.extra.join(',') + ']' });
    });
    crossModule.forEach(function (c) {
      if (c.missingSources.length) {
        issues.push({ level: 'error', code: 'cross_module_source_missing',
          detail: c.name + ' 源缺失：' + c.missingSources.join('、') + '（导出名不符或未导出）——该组比对未执行，『无漂移』不成立' });
      }
      const dk = Object.keys(c.diffs);
      if (dk.length) issues.push({ level: c.severity, code: 'cross_module_drift', detail: c.name + ' 跨模块漂移：' + dk.map(function (k) { return k + ' 多 [' + c.diffs[k].join(',') + ']'; }).join('；') + (c.hint ? '——' + c.hint : '') });
    });
    const errors = issues.filter(function (i) { return i.level === 'error'; }).length;
    return {
      declared: declaredList, consumed: consumedList,
      consumedDetail: consumed,
      drift: { declaredNotConsumed: declaredNotConsumed, probeNotDeclared: probeNotDeclared, consumedNotDeclared: [] },
      enums: enums, crossModule: crossModule, issues: issues,
      verdict: { ok: errors === 0, errorCount: errors, warnCount: issues.length - errors }
    };
  }
  function summaryText(report) {
    const r = report || audit();
    const v = r.verdict || {};
    if (!v.errorCount && !v.warnCount) return '契约与消费端完全对齐（' + r.declared.length + ' 字段）';
    return (v.ok ? '可用但需留意' : '存在阻断项') + '：' + v.errorCount + ' 错误 / ' + v.warnCount + ' 警告';
  }
  function flatten(report) {
    const r = report || audit();
    const out = (r.issues || []).map(function (i) { return { level: i.level, key: i.code, detail: i.detail }; });
    out.push({ level: 'info', key: 'coverage', detail: '契约声明 ' + r.declared.length + ' 字段，实测消费 ' + r.consumed.length + ' 字段' });
    return out;
  }

  WA.contractAudit = {
    PROBE_TAG, PROBES, FIELDS, SEEDS, LIVE_DELEGATED, ENUM_ALIGN, CROSS_MODULE,
    parseContract, consumedFields, audit, summaryText, flatten,
    safe  // v0.1.12: 导出供语义一致性单测
  };
  if (WA.log) WA.log('info', '推演契约对账器已加载');
})();
